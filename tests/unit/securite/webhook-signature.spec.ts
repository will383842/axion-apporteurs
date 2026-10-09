// @req REQ-SEC-010
// @req REQ-QA-008 → REQ-SEC-010
/**
 * `webhook-signature.spec.ts` — la porte des événements d'axionia (SEC-06), sans base.
 *
 * CE QUI EST JUGÉ ICI : la signature (HMAC-SHA256 sur « horodatage point corps exact », en-têtes
 * `X-Axionia-Timestamp` / `X-Axionia-Signature`, tolérance de 300 s, temps constant), la borne de
 * 128 Ko lue AVANT tout calcul, l'alerte PLAFONNÉE, et l'ordre des refus de la route. Le dépôt est
 * un port en mémoire qui COMPTE ses lignes : un verdict se lit au nombre de lignes, jamais au code
 * de réponse seul. La même porte en base réelle vit dans `tests/integration/webhook.spec.ts`.
 *
 * LA SIGNATURE DU PRODUCTEUR est reproduite telle qu'axionia la calcule (`signerCorps` de
 * `axionia/src/server/partners/enveloppe.ts`, lu le 2026-09-26) : hexadécimal minuscule du HMAC de
 * `${secondes}.${corps}`, l'horodatage en secondes Unix et en chiffres seuls.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { NOMS_DES_SECRETS, kidDe, type Trousseau } from '../../../src/lib/env';
import { ENTETE_KID_AXIONIA } from '../../../packages/contracts/api';
import { TYPES_EVENEMENT, SCHEMA_VERSION } from '../../../packages/contracts/events';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CORPS_MAX_OCTETS,
  TOLERANCE_SIGNATURE_S,
  creerAlerteurPlafonne,
  egalATempsConstant,
  limiteNonDeclaree,
  lireCorpsBorne,
  type SignalDePorte,
} from '../../../src/server/securite/primitives-de-porte';
import type { VerdictDeLimite } from '../../../src/server/securite/rate-limit';
import {
  CORPS_MAX_OCTETS as CORPS_MAX_OCTETS_MCP,
  ENTETE_DU_SECRET,
  VARIABLE_DU_SECRET,
  traiterAppelMcp,
  type LimiteurMcp,
} from '../../../src/server/mcp/porte';
import { OUTILS, PERIMETRE_VIDE, SYMBOLES_AUTORISES } from '../../../src/server/mcp/registre';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  depotDeReception,
  identifiantDuType,
  recevoirEvenementAxionia,
  sujetRefDe,
  verifierSignatureAxionia,
  type DepotDeReception,
  type EvenementAInscrire,
} from '../../../src/server/integrations/axionia/reception';

// ── Le banc ────────────────────────────────────────────────────────────────────────────────────

/** Un jeu de secrets valide et distinct, tiré à l'exécution : 64 hexadécimaux conviennent à tous. */
function environnementValide(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  return env;
}

const MAINTENANT_MS = Date.UTC(2026, 8, 26, 10, 0, 0);
const MAINTENANT_S = MAINTENANT_MS / 1000;

/** La signature telle que le producteur la pose. */
function signer(secret: string, secondes: string, corps: string): string {
  return createHmac('sha256', secret).update(`${secondes}.${corps}`, 'utf8').digest('hex');
}

type Enveloppe = Record<string, unknown>;

/** Une enveloppe conforme au contrat v1 ; chaque champ que le test fait varier est EXPLICITE. */
function enveloppe(champs: {
  type: (typeof TYPES_EVENEMENT)[number];
  sujet: unknown;
  payload: Record<string, unknown>;
  version: number;
}): Enveloppe {
  return {
    event_id: randomUUID(),
    event_type: champs.type,
    schema_version: champs.version,
    occurred_at: '2026-09-26T09:59:00.000Z',
    emitted_at: '2026-09-26T09:59:30.000Z',
    producer: 'axionia',
    subject_ref: champs.sujet,
    sequence: 7,
    payload: champs.payload,
  };
}

const CLIENT = TYPES_EVENEMENT[0];
const PAIEMENT = TYPES_EVENEMENT.find((t) => t.startsWith('paiement.'))!;

/**
 * INT-T45 : la réception juge le payload contre le `$defs` fermé de son type. Les faces vertes
 * envoient donc la charge du PRODUCTEUR RÉEL (RM-03), en version 2 — le seul renommage de la v2
 * (`amountHtCents` → `montantHtCents` du paiement) appliqué, comme `contrat-hash.spec.ts` le nomme.
 * Version 4 (INT-T76-P) : la fiche du client exige `opco`, que la fixture v1 ne porte pas encore ;
 * elle part avec `opco: null`, la valeur d'un OPCO inconnu d'axion-ia (exemption de la v4 dans
 * `contrat-hash.spec.ts`, levée dès que la fixture le porte).
 */
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: { event_type: string; payload: Record<string, unknown> }[] };
function chargeDuProducteur(type: string): Record<string, unknown> {
  const e = PRODUCTEUR.evenements.find((x) => x.event_type === type);
  if (e === undefined) throw new Error(`fixture du producteur : aucun ${type}`);
  if (type === 'client.cree' || type === 'client.mis_a_jour') return { ...e.payload, opco: null };
  if (type !== 'paiement.recu') return { ...e.payload };
  const { amountHtCents, ...reste } = e.payload;
  return { ...reste, montantHtCents: amountHtCents };
}

function requete(corps: string, entetes: Record<string, string>): Request {
  return new Request('https://partners.test/api/webhooks/axionia', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: corps,
  });
}

/**
 * Une requête signée par `secret`. Le `kid` est celui de ce secret, sauf quand le test présente un
 * AUTRE secret sous le kid de la clé attendue : c'est alors la signature, et non le kid, qui est fausse.
 */
function signee(
  secret: string,
  corps: string,
  secondes = String(MAINTENANT_S),
  kid = kidDe(secret)
): Request {
  return requete(corps, {
    [ENTETE_HORODATAGE]: secondes,
    [ENTETE_SIGNATURE]: signer(secret, secondes, corps),
    [ENTETE_KID_AXIONIA]: kid,
  });
}

/** Un trousseau sans rotation en cours : la seule clé courante. */
const seul = (secret: string): Trousseau => ({ courante: secret, precedente: null });

/** Le dépôt en mémoire : il COMPTE, et il tient les deux unicités de la table. */
function depotEnMemoire(): DepotDeReception & { lignes: EvenementAInscrire[] } {
  const lignes: EvenementAInscrire[] = [];
  return {
    lignes,
    // INT-T76-P : aucune v4 reçue en mémoire, la fenêtre de bascule n'est pas ouverte.
    premiereReceptionDeLaVersionCourante: async () => null,
    async inscrire(e) {
      const doublon = lignes.some(
        (l) =>
          (l.source === e.source && l.eventId === e.eventId) ||
          (e.cleMetier !== null && l.eventType === e.eventType && l.cleMetier === e.cleMetier)
      );
      if (doublon) return 'doublon';
      lignes.push(e);
      return 'inscrit';
    },
  };
}

function banc(env: Record<string, string>) {
  const depot = depotEnMemoire();
  const signaux: (SignalDePorte & { tus: number })[] = [];
  const alerteur = creerAlerteurPlafonne((s) => signaux.push(s));
  let declenchements = 0;
  const d = {
    environnement: env,
    maintenantMs: MAINTENANT_MS,
    depot,
    alerteur,
    declencher: () => {
      declenchements += 1;
    },
  };
  return {
    depot,
    signaux,
    d,
    declenchements: () => declenchements,
    recevoir: (r: Request) => recevoirEvenementAxionia(r, d),
  };
}

const octets = (s: string) => new TextEncoder().encode(s);

// ── La signature, seule ────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-010 — la signature d’axionia, jugée seule', () => {
  const secret = randomBytes(32).toString('hex');
  const corps = JSON.stringify({ a: 1 });
  const s = String(MAINTENANT_S);

  it('REQ-SEC-010 : la signature du producteur est acceptée', () => {
    expect(
      verifierSignatureAxionia(
        octets(corps),
        s,
        signer(secret, s, corps),
        kidDe(secret),
        seul(secret),
        MAINTENANT_MS
      )
    ).toEqual({ ok: true });
  });

  it('REQ-SEC-010 : un autre secret est refusé en `signature_invalide`', () => {
    const autre = randomBytes(32).toString('hex');
    expect(
      verifierSignatureAxionia(
        octets(corps),
        s,
        signer(autre, s, corps),
        kidDe(secret),
        seul(secret),
        MAINTENANT_MS
      )
    ).toEqual({ ok: false, motif: 'signature_invalide' });
  });

  it('REQ-SEC-010 : un octet du corps changé est refusé', () => {
    const faux = JSON.stringify({ a: 2 });
    expect(
      verifierSignatureAxionia(
        octets(faux),
        s,
        signer(secret, s, corps),
        kidDe(secret),
        seul(secret),
        MAINTENANT_MS
      ).ok
    ).toBe(false);
  });

  it('REQ-SEC-010 : la tolérance vaut 300 s — à 300 s passe, à 301 s est refusée, dans les deux sens', () => {
    expect(TOLERANCE_SIGNATURE_S).toBe(300);
    for (const decalage of [-300, 300]) {
      const t = String(MAINTENANT_S + decalage);
      expect(
        verifierSignatureAxionia(
          octets(corps),
          t,
          signer(secret, t, corps),
          kidDe(secret),
          seul(secret),
          MAINTENANT_MS
        )
      ).toEqual({ ok: true });
    }
    for (const decalage of [-301, 301]) {
      const t = String(MAINTENANT_S + decalage);
      expect(
        verifierSignatureAxionia(
          octets(corps),
          t,
          signer(secret, t, corps),
          kidDe(secret),
          seul(secret),
          MAINTENANT_MS
        )
      ).toEqual({ ok: false, motif: 'hors_fenetre' });
    }
  });

  it('REQ-SEC-010 : un en-tête absent est refusé, sans repli en clair', () => {
    expect(
      verifierSignatureAxionia(
        octets(corps),
        null,
        signer(secret, s, corps),
        kidDe(secret),
        seul(secret),
        MAINTENANT_MS
      )
    ).toEqual({ ok: false, motif: 'entete_absent' });
    expect(
      verifierSignatureAxionia(octets(corps), s, null, kidDe(secret), seul(secret), MAINTENANT_MS)
    ).toEqual({
      ok: false,
      motif: 'entete_absent',
    });
    // Le secret lui-même, présenté comme signature : aucun repli en clair.
    expect(
      verifierSignatureAxionia(octets(corps), s, secret, kidDe(secret), seul(secret), MAINTENANT_MS)
        .ok
    ).toBe(false);
  });

  it('REQ-SEC-010 : sans horodatage, AUCUNE signature n’est acceptée — ni celle de l’instant présent, ni celle du corps seul', () => {
    const candidates = [
      signer(secret, s, corps),
      signer(secret, '', corps),
      createHmac('sha256', secret).update(corps, 'utf8').digest('hex'),
    ];
    for (const signature of candidates) {
      expect(
        verifierSignatureAxionia(
          octets(corps),
          null,
          signature,
          kidDe(secret),
          seul(secret),
          MAINTENANT_MS
        )
      ).toEqual({ ok: false, motif: 'entete_absent' });
    }
  });

  it('REQ-SEC-010 : un horodatage qui n’est pas fait de chiffres est refusé — « t.corps » doit se découper sans ambiguïté', () => {
    for (const t of ['1.5', '', ' 1', '-1', '1e9', String(MAINTENANT_S) + '.0']) {
      expect(
        verifierSignatureAxionia(
          octets(corps),
          t,
          signer(secret, t, corps),
          kidDe(secret),
          seul(secret),
          MAINTENANT_MS
        )
      ).toEqual({ ok: false, motif: 'horodatage_illisible' });
    }
  });

  it('REQ-QA-030 : un kid absent est refusé AVANT tout calcul, jamais remplacé par un essai des clés', () => {
    expect(
      verifierSignatureAxionia(
        octets(corps),
        s,
        signer(secret, s, corps),
        null,
        seul(secret),
        MAINTENANT_MS
      )
    ).toEqual({ ok: false, motif: 'kid_absent' });
  });

  it('REQ-QA-030 : un kid qui ne désigne aucune clé du trousseau est refusé', () => {
    const autre = randomBytes(32).toString('hex');
    expect(
      verifierSignatureAxionia(
        octets(corps),
        s,
        signer(autre, s, corps),
        kidDe(autre),
        seul(secret),
        MAINTENANT_MS
      )
    ).toEqual({ ok: false, motif: 'kid_inconnu' });
  });

  it('REQ-QA-030 : la clé précédente signe jusqu’à son échéance, puis est refusée en le nommant', () => {
    const precedente = randomBytes(32).toString('hex');
    const t: Trousseau = {
      courante: secret,
      precedente: { valeur: precedente, echeanceMs: MAINTENANT_MS + 1 },
    };
    const sig = signer(precedente, s, corps);
    expect(
      verifierSignatureAxionia(octets(corps), s, sig, kidDe(precedente), t, MAINTENANT_MS)
    ).toEqual({ ok: true });
    expect(
      verifierSignatureAxionia(octets(corps), s, sig, kidDe(precedente), t, MAINTENANT_MS + 1)
    ).toEqual({
      ok: false,
      motif: 'cle_precedente_echue',
    });
  });

  it('REQ-QA-030 : le kid de la courante avec une signature de la précédente est refusé en signature_invalide', () => {
    const precedente = randomBytes(32).toString('hex');
    const t: Trousseau = {
      courante: secret,
      precedente: { valeur: precedente, echeanceMs: MAINTENANT_MS + 1 },
    };
    expect(
      verifierSignatureAxionia(
        octets(corps),
        s,
        signer(precedente, s, corps),
        kidDe(secret),
        t,
        MAINTENANT_MS
      )
    ).toEqual({ ok: false, motif: 'signature_invalide' });
  });

  it('REQ-SEC-010 : une signature en majuscules n’est pas la forme du producteur, elle est refusée', () => {
    expect(
      verifierSignatureAxionia(
        octets(corps),
        s,
        signer(secret, s, corps).toUpperCase(),
        kidDe(secret),
        seul(secret),
        MAINTENANT_MS
      ).ok
    ).toBe(false);
  });
});

// ── La borne du corps ──────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-010 — le corps est borné à 128 Ko AVANT tout calcul', () => {
  it('REQ-SEC-010 : la borne est de 128 Ko', () => {
    expect(CORPS_MAX_OCTETS).toBe(128 * 1024);
  });

  it('REQ-SEC-010 : un corps en flux, SANS longueur déclarée, est coupé au-delà de la borne', async () => {
    let tires = 0;
    const flux = new ReadableStream<Uint8Array>({
      pull(c) {
        tires += 1;
        if (tires > 1000) c.close();
        else c.enqueue(new Uint8Array(1024));
      },
    });
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body: flux, duplex: 'half' };
    const r = new Request('https://partners.test/x', init);
    expect(await lireCorpsBorne(r)).toEqual({ ok: false, motif: 'corps_trop_grand' });
    // La lecture s'arrête peu après la borne : elle n'a pas avalé le millier de blocs.
    expect(tires).toBeLessThan(200);
  });

  it('REQ-SEC-010 : un corps à la borne exacte passe, octet pour octet', async () => {
    const r = new Request('https://partners.test/x', {
      method: 'POST',
      body: new Uint8Array(CORPS_MAX_OCTETS),
    });
    const lu = await lireCorpsBorne(r);
    expect(lu.ok).toBe(true);
    expect(lu.ok && lu.octets.byteLength).toBe(CORPS_MAX_OCTETS);
  });
});

// ── L'alerte plafonnée ─────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-010 — l’alerte de sécurité est PLAFONNÉE', () => {
  it('REQ-SEC-010 : dix refus du même motif, une seule alerte ; réarmée, la suivante dit combien ont été tues', () => {
    const emises: (SignalDePorte & { tus: number })[] = [];
    const a = creerAlerteurPlafonne((s) => emises.push(s));
    for (let i = 0; i < 10; i++) a.signaler({ porte: 'axionia', motif: 'signature_invalide' });
    expect(emises).toEqual([{ porte: 'axionia', motif: 'signature_invalide', tus: 0 }]);
    a.signaler({ porte: 'axionia', motif: 'hors_fenetre' });
    expect(emises).toHaveLength(2);
    a.rearmer('axionia');
    a.signaler({ porte: 'axionia', motif: 'signature_invalide' });
    expect(emises[2]).toEqual({ porte: 'axionia', motif: 'signature_invalide', tus: 9 });
  });

  it('REQ-SEC-010 : réarmer une porte ne réarme pas l’autre', () => {
    const emises: SignalDePorte[] = [];
    const a = creerAlerteurPlafonne((s) => emises.push(s));
    a.signaler({ porte: 'axionia', motif: 'signature_invalide' });
    a.signaler({ porte: 'zeptomail', motif: 'signature_invalide' });
    a.rearmer('axionia');
    a.signaler({ porte: 'zeptomail', motif: 'signature_invalide' });
    expect(emises).toHaveLength(2);
  });
});

// ── La route, sur un dépôt qui compte ──────────────────────────────────────────────────────────

describe('REQ-SEC-010 — la route : témoin à deux faces, compté en lignes', () => {
  it('REQ-SEC-010 : face ROUGE — signée avec un autre secret, 401, AUCUNE ligne, une alerte', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: randomUUID() },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION,
      })
    );
    const autre = randomBytes(32).toString('hex');
    const kid = kidDe(env.AXIONIA_WEBHOOK_SECRET!);
    const r1 = await b.recevoir(signee(autre, corps, undefined, kid));
    const r2 = await b.recevoir(signee(autre, corps, undefined, kid));
    expect([r1.status, r2.status]).toEqual([401, 401]);
    expect(b.depot.lignes).toHaveLength(0);
    expect(b.declenchements()).toBe(0);
    expect(b.signaux).toEqual([{ porte: 'axionia', motif: 'signature_invalide', tus: 0 }]);
  });

  it('REQ-SEC-010 : face ROUGE — hors de la fenêtre de 300 s, 401 et AUCUNE ligne', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: randomUUID() },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION,
      })
    );
    const r = await b.recevoir(
      signee(env.AXIONIA_WEBHOOK_SECRET!, corps, String(MAINTENANT_S - 600))
    );
    expect(r.status).toBe(401);
    expect(b.depot.lignes).toHaveLength(0);
    expect(b.signaux.map((s) => s.motif)).toEqual(['hors_fenetre']);
  });

  it('REQ-SEC-010 : face ROUGE — l’en-tête d’horodatage ABSENT, signature de l’instant présent : 401, AUCUNE ligne, jamais un horodatage supposé', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: randomUUID() },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION,
      })
    );
    const secondes = String(MAINTENANT_S);
    const r = await b.recevoir(
      requete(corps, { [ENTETE_SIGNATURE]: signer(env.AXIONIA_WEBHOOK_SECRET!, secondes, corps) })
    );
    expect(r.status).toBe(401);
    expect(b.depot.lignes).toHaveLength(0);
    expect(b.declenchements()).toBe(0);
    expect(b.signaux.map((x) => x.motif)).toEqual(['entete_absent']);
  });

  it('REQ-SEC-010 : face VERTE — correctement signée, 200 et EXACTEMENT une ligne, inscrite avant tout traitement', async () => {
    const env = environnementValide();
    const b = banc(env);
    const e = enveloppe({
      type: CLIENT,
      sujet: { client_id: 'c-1' },
      payload: chargeDuProducteur(CLIENT),
      version: SCHEMA_VERSION,
    });
    const corps = JSON.stringify(e);
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(200);
    expect(b.depot.lignes).toHaveLength(1);
    const l = b.depot.lignes[0]!;
    expect(l).toMatchObject({
      source: 'axionia',
      eventId: e.event_id,
      eventType: 'client_cree',
      schemaVersion: SCHEMA_VERSION,
      sequence: 7n,
      sujetRef: 'client:c-1',
      cleMetier: null,
      statut: 'recu',
      payloadHash: createHash('sha256').update(corps, 'utf8').digest('hex'),
    });
    expect(l.receivedAt.toISOString()).toBe(new Date(MAINTENANT_MS).toISOString());
    expect(l.survenuAt.toISOString()).toBe('2026-09-26T09:59:00.000Z');
    expect(b.declenchements()).toBe(1);
  });

  it('REQ-SEC-010 : livrée deux fois, la seconde rend 200 {duplicate:true}, n’écrit rien de plus et ne déclenche rien', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-2' },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION,
      })
    );
    const r1 = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    const r2 = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await r2.json()).toEqual({ duplicate: true });
    expect(b.depot.lignes).toHaveLength(1);
    expect(b.declenchements()).toBe(1);
  });

  it('REQ-SEC-010 : au-delà de 128 Ko, 413 et AUCUNE ligne — même correctement signée', async () => {
    const env = environnementValide();
    const b = banc(env);
    const grand = 'x'.repeat(CORPS_MAX_OCTETS);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-3' },
        payload: { grand },
        version: SCHEMA_VERSION,
      })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(413);
    expect(b.depot.lignes).toHaveLength(0);
  });

  it('REQ-SEC-010 : sans secret configuré, 503 et AUCUNE ligne — la porte ne s’ouvre jamais par défaut', async () => {
    const env = environnementValide();
    const secret = env.AXIONIA_WEBHOOK_SECRET!;
    delete env.AXIONIA_WEBHOOK_SECRET;
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-4' },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION,
      })
    );
    const r = await b.recevoir(signee(secret, corps));
    expect(r.status).toBe(503);
    expect(b.depot.lignes).toHaveLength(0);
  });

  it('REQ-SEC-010 : un corps signé mais hors schéma est refusé en 422, sans ligne', async () => {
    const env = environnementValide();
    const b = banc(env);
    const s = env.AXIONIA_WEBHOOK_SECRET!;
    const e = enveloppe({
      type: CLIENT,
      sujet: { client_id: 'c-5' },
      payload: chargeDuProducteur(CLIENT),
      version: SCHEMA_VERSION,
    });
    for (const corps of [
      '{pas du json',
      JSON.stringify({ ...e, champ_en_plus: 1 }),
      JSON.stringify({ ...e, event_type: 'inconnu.type' }),
    ]) {
      const r = await b.recevoir(signee(s, corps));
      expect(r.status).toBe(422);
    }
    expect(b.depot.lignes).toHaveLength(0);
    expect(b.signaux.map((x) => x.motif)).toEqual(['hors_schema']);
  });

  it('REQ-SEC-010 : une coordonnée de contact dans la charge (REQ-INT-029) est refusée en 422 : la charge stockée ne porte aucune donnée personnelle', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-6' },
        payload: { note: 'contact personne@exemple.test' },
        version: SCHEMA_VERSION,
      })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(422);
    expect(b.depot.lignes).toHaveLength(0);
  });

  it('REQ-SEC-010 : un paiement sans `paymentId` ne peut pas être dédoublonné — 422, sans ligne', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: PAIEMENT,
        sujet: { payment_id: 'p-1' },
        payload: { factureId: 'f-1' },
        version: SCHEMA_VERSION,
      })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(422);
    expect(b.depot.lignes).toHaveLength(0);
  });

  it('REQ-SEC-010 : le dépôt qui lève rend 503 — l’événement n’est pas inscrit, l’émetteur doit rejouer', async () => {
    const env = environnementValide();
    const b = banc(env);
    b.d.depot = {
      inscrire: async () => {
        throw new Error('base_coupee');
      },
    } as unknown as typeof b.depot;
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-7' },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION,
      })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(503);
  });

  it('REQ-SEC-010 : un déclenchement du travail de fond qui lève ne produit JAMAIS un 5xx — l’événement est inscrit, 200', async () => {
    const env = environnementValide();
    const b = banc(env);
    b.d.declencher = () => {
      throw new Error('file_indisponible');
    };
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-8' },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION,
      })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(200);
    expect(b.depot.lignes).toHaveLength(1);
  });

  it('REQ-SEC-010 : un événement bien formé de `schema_version` inconnue est inscrit `held` et alerté, jamais rejeté', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-9' },
        payload: chargeDuProducteur(CLIENT),
        version: SCHEMA_VERSION + 1,
      })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(b.depot.lignes.map((l) => [l.statut, l.schemaVersion])).toEqual([
      ['held', SCHEMA_VERSION + 1],
    ]);
    expect(b.signaux.map((s) => s.motif)).toEqual(['schema_version_inconnue']);
    expect(b.declenchements()).toBe(0);
  });

  it('REQ-SEC-010 : la clé métier d’un paiement est son `paymentId` : deux événements distincts du même paiement, une ligne', async () => {
    const env = environnementValide();
    const b = banc(env);
    const s = env.AXIONIA_WEBHOOK_SECRET!;
    const payload = { ...chargeDuProducteur(PAIEMENT), paymentId: 'pay-1' };
    const r1 = await b.recevoir(
      signee(
        s,
        JSON.stringify(
          enveloppe({
            type: PAIEMENT,
            sujet: { payment_id: 'pay-1' },
            payload,
            version: SCHEMA_VERSION,
          })
        )
      )
    );
    const r2 = await b.recevoir(
      signee(
        s,
        JSON.stringify(
          enveloppe({
            type: PAIEMENT,
            sujet: { payment_id: 'pay-1' },
            payload,
            version: SCHEMA_VERSION,
          })
        )
      )
    );
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await r2.json()).toEqual({ duplicate: true });
    expect(b.depot.lignes.map((l) => l.cleMetier)).toEqual(['pay-1']);
  });
});

// ── Les primitives partagées, jugées seules ────────────────────────────────────────────────────

describe('REQ-SEC-010 — les primitives que partagent les portes', () => {
  it('REQ-SEC-010 : la comparaison à temps constant — égales, différentes, et une chaîne VIDE n’est jamais égale, même à elle-même', () => {
    expect(egalATempsConstant('abc', 'abc')).toBe(true);
    expect(egalATempsConstant('abc', 'abd')).toBe(false);
    expect(egalATempsConstant('', '')).toBe(false);
    expect(egalATempsConstant('', 'abc')).toBe(false);
  });

  it('REQ-SEC-010 : une porte sans compteur déclaré REFUSE, en panne, sous le motif du registre', async () => {
    expect(await limiteNonDeclaree()).toEqual({
      autorise: false,
      restant: 0,
      repriseAt: null,
      panne: true,
      motif: 'limite_non_configuree',
    });
  });

  it('REQ-SEC-010 : une longueur DÉCLARÉE au-delà de la borne est refusée sans lire le corps ; déclarée à la borne exacte, le corps est lu', async () => {
    const declaree = (longueur: string) =>
      new Request('https://partners.test/x', {
        method: 'POST',
        headers: { 'content-length': longueur },
        body: '{}',
      });
    expect(await lireCorpsBorne(declaree(String(CORPS_MAX_OCTETS + 1)))).toEqual({
      ok: false,
      motif: 'corps_trop_grand',
    });
    expect(await lireCorpsBorne(declaree(String(CORPS_MAX_OCTETS)))).toEqual({
      ok: true,
      octets: new TextEncoder().encode('{}'),
    });
    // Une borne passée en argument vaut pour la longueur déclarée comme pour le flux.
    expect(await lireCorpsBorne(declaree('3'), 2)).toEqual({
      ok: false,
      motif: 'corps_trop_grand',
    });
  });

  it('REQ-SEC-010 : une requête sans corps rend zéro octet ; un corps en plusieurs morceaux est recollé dans l’ordre ; un flux qui casse est illisible', async () => {
    expect(await lireCorpsBorne(new Request('https://partners.test/x'))).toEqual({
      ok: true,
      octets: new Uint8Array(0),
    });
    const morceaux = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])];
    const flux = new ReadableStream<Uint8Array>({
      pull(c) {
        const m = morceaux.shift();
        if (m === undefined) c.close();
        else c.enqueue(m);
      },
    });
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body: flux, duplex: 'half' };
    expect(await lireCorpsBorne(new Request('https://partners.test/x', init))).toEqual({
      ok: true,
      octets: new Uint8Array([1, 2, 3, 4, 5, 6]),
    });
    const casse = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(new Error('coupé'));
      },
    });
    const initCasse: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      body: casse,
      duplex: 'half',
    };
    expect(await lireCorpsBorne(new Request('https://partners.test/x', initCasse))).toEqual({
      ok: false,
      motif: 'corps_illisible',
    });
  });

  it('REQ-SEC-010 : le compte des signaux tus repart de zéro après chaque alerte émise', () => {
    const emises: (SignalDePorte & { tus: number })[] = [];
    const a = creerAlerteurPlafonne((s) => emises.push(s));
    const s = { porte: 'axionia', motif: 'signature_invalide' };
    a.signaler(s);
    a.signaler(s);
    a.signaler(s);
    a.rearmer('axionia');
    a.signaler(s);
    a.rearmer('axionia');
    a.signaler(s);
    expect(emises.map((e) => e.tus)).toEqual([0, 2, 0]);
  });

  it('REQ-SEC-010 : un émetteur d’alerte qui lève ne fait pas tomber la porte', () => {
    const a = creerAlerteurPlafonne(() => {
      throw new Error('canal coupé');
    });
    expect(() => a.signaler({ porte: 'axionia', motif: 'signature_invalide' })).not.toThrow();
  });
});

// ── L'adaptateur Prisma de la réception, sur un client qui enregistre ──────────────────────────

describe('REQ-SEC-010 — l’adaptateur Prisma de la réception : la BASE dit le doublon', () => {
  const ligne = (): EvenementAInscrire => ({
    source: 'axionia',
    eventId: randomUUID(),
    eventType: 'client_cree',
    schemaVersion: SCHEMA_VERSION,
    sequence: 7n,
    sujetRef: 'client:c-1',
    cleMetier: null,
    charge: { a: 1 },
    payloadHash: 'f'.repeat(64),
    statut: 'recu',
    receivedAt: new Date(MAINTENANT_MS),
    survenuAt: new Date(MAINTENANT_MS),
  });
  const client = (create: (args: unknown) => Promise<unknown>) =>
    ({ evenementRecu: { create } }) as unknown as PrismaClient;

  it('REQ-SEC-010 : une inscription passe la ligne ENTIÈRE à `create` et rend `inscrit`', async () => {
    const appels: unknown[] = [];
    const e = ligne();
    const r = await depotDeReception(
      client(async (args) => {
        appels.push(args);
        return {};
      })
    ).inscrire(e);
    expect(r).toBe('inscrit');
    expect(appels).toEqual([{ data: e }]);
  });

  it('REQ-SEC-010 : la violation d’unicité (P2002) rend `doublon` ; toute autre erreur REMONTE', async () => {
    const connue = (code: string) =>
      new Prisma.PrismaClientKnownRequestError('refus', { code, clientVersion: 'témoin' });
    const avec = (erreur: unknown) =>
      depotDeReception(
        client(async () => {
          throw erreur;
        })
      ).inscrire(ligne());
    expect(await avec(connue('P2002'))).toBe('doublon');
    const autre = connue('P2003');
    await expect(avec(autre)).rejects.toBe(autre);
    const brute = Object.assign(new Error('coupure'), { code: 'P2002' });
    await expect(avec(brute)).rejects.toBe(brute);
  });
});

// ── La porte MCP : la même borne et la même serrure (SEC-06 lui a donné la borne partagée) ──────

describe('REQ-INT-026 — la porte MCP, jugée en processus', () => {
  const env: Record<string, string> = {
    ...environnementValide(),
    [VARIABLE_DU_SECRET]: randomBytes(32).toString('hex'),
  };
  const SECRET_MCP = env[VARIABLE_DU_SECRET]!;
  const ADMIS: VerdictDeLimite = {
    autorise: true,
    restant: 1,
    repriseAt: null,
    panne: false,
    motif: 'admis',
  };
  const LIMITE: VerdictDeLimite = {
    autorise: false,
    restant: 0,
    repriseAt: null,
    panne: false,
    motif: 'limite_atteinte',
  };

  function limiteur(v: VerdictDeLimite | Error) {
    const appels: number[] = [];
    const l: LimiteurMcp = async (_r, t) => {
      appels.push(t);
      if (v instanceof Error) throw v;
      return v;
    };
    return { l, appels };
  }

  function appel(
    corps: string,
    secret: string | null = SECRET_MCP,
    entetes: Record<string, string> = {}
  ): Request {
    return new Request('https://partners.test/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret === null ? {} : { [ENTETE_DU_SECRET]: secret }),
        ...entetes,
      },
      body: corps,
    });
  }

  const porte = (r: Request, v: VerdictDeLimite | Error = ADMIS) =>
    traiterAppelMcp(r, {
      environnement: env,
      limiteur: limiteur(v).l,
      maintenantMs: MAINTENANT_MS,
    });

  async function lu(r: Response): Promise<[number, string]> {
    return [r.status, await r.text()];
  }

  it('REQ-INT-026 : la borne du corps de la porte est CELLE des webhooks, écrite une seule fois', () => {
    expect(CORPS_MAX_OCTETS_MCP).toBe(CORPS_MAX_OCTETS);
    expect(VARIABLE_DU_SECRET).toBe('PARTNERS_MCP_SHARED_SECRET');
    expect(ENTETE_DU_SECRET).toBe('x-mcp-secret');
  });

  it('REQ-INT-026 : secret non configuré, limiteur qui lève, limiteur en panne : 503, le MÊME corps, et le limiteur n’est pas consulté sans secret', async () => {
    const sans = limiteur(ADMIS);
    const r0 = await traiterAppelMcp(appel('{}'), {
      environnement: { ...env, [VARIABLE_DU_SECRET]: undefined },
      limiteur: sans.l,
      maintenantMs: MAINTENANT_MS,
    });
    expect(await lu(r0)).toEqual([503, 'mcp_indisponible']);
    expect(sans.appels).toEqual([]);
    expect(await lu(await porte(appel('{}'), new Error('cache tombé')))).toEqual([
      503,
      'mcp_indisponible',
    ]);
    expect(await lu(await porte(appel('{}'), { ...LIMITE, panne: true }))).toEqual([
      503,
      'mcp_indisponible',
    ]);
  });

  it('REQ-INT-026 : le limiteur est consulté UNE fois, avec l’instant de la porte, AVANT la serrure : 429 au bon secret comme au faux', async () => {
    const l = limiteur(LIMITE);
    const o = { environnement: env, limiteur: l.l, maintenantMs: MAINTENANT_MS };
    expect(await lu(await traiterAppelMcp(appel('{}', 'pas-le-bon'), o))).toEqual([
      429,
      'mcp_debit_depasse',
    ]);
    expect(await lu(await traiterAppelMcp(appel('{}'), o))).toEqual([429, 'mcp_debit_depasse']);
    expect(l.appels).toEqual([MAINTENANT_MS, MAINTENANT_MS]);
  });

  it('REQ-INT-026 : secret faux ou en-tête absent : 401', async () => {
    expect(await lu(await porte(appel('{}', 'pas-le-bon')))).toEqual([401, 'mcp_secret_refuse']);
    expect(await lu(await porte(appel('{}', null)))).toEqual([401, 'mcp_secret_refuse']);
  });

  it('REQ-INT-026 : une longueur déclarée au-delà de la borne est refusée sans lire le corps ; un corps réel au-delà aussi ; à la borne exacte, il est lu', async () => {
    const liste = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const declare = { 'content-length': String(CORPS_MAX_OCTETS + 1) };
    expect(await lu(await porte(appel(liste, SECRET_MCP, declare)))).toEqual([
      413,
      'mcp_corps_trop_grand',
    ]);
    const ajuste = (n: number) => liste + ' '.repeat(n - Buffer.byteLength(liste));
    expect(await lu(await porte(appel(ajuste(CORPS_MAX_OCTETS + 1))))).toEqual([
      413,
      'mcp_corps_trop_grand',
    ]);
    const r = await porte(appel(ajuste(CORPS_MAX_OCTETS)));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
  });

  it('REQ-INT-026 : un corps qui casse en lecture, puis un JSON invalide : erreur JSON-RPC -32700, identifiant nul', async () => {
    const casse = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(new Error('coupé'));
      },
    });
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { [ENTETE_DU_SECRET]: SECRET_MCP },
      body: casse,
      duplex: 'half',
    };
    expect(await (await porte(new Request('https://partners.test/api/mcp', init))).json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'corps illisible' },
    });
    expect(await (await porte(appel('{pas du json'))).json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'corps illisible : JSON invalide' },
    });
  });

  it('REQ-INT-026 : une enveloppe sans `jsonrpc` « 2.0 » ou sans `method` chaîne : -32600, l’identifiant rendu s’il est chaîne ou nombre, nul sinon', async () => {
    const invalide = (id: unknown) => ({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32600,
        message: 'enveloppe invalide : `jsonrpc` « 2.0 » et `method` exigés',
      },
    });
    const cas: [unknown, unknown][] = [
      [{ jsonrpc: '1.0', id: 'a', method: 'tools/list' }, invalide('a')],
      [{ jsonrpc: '2.0', id: 3, method: 7 }, invalide(3)],
      [{ jsonrpc: '2.0', id: { x: 1 } }, invalide(null)],
      [null, invalide(null)],
      [5, invalide(null)],
    ];
    for (const [corps, attendu] of cas) {
      expect(await (await porte(appel(JSON.stringify(corps)))).json()).toEqual(attendu);
    }
  });

  it('REQ-INT-026 : `tools/list` rend le registre, vide en phase 0 ; `tools/call` d’un outil inconnu : -32602 `tool_not_found` ; une méthode inconnue : -32601', async () => {
    const rpc = async (corps: unknown) => (await porte(appel(JSON.stringify(corps)))).json();
    const inconnu = (id: number, nom: string) => ({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: `aucun outil nommé « ${nom} »`,
        data: { code: 'tool_not_found' },
      },
    });
    expect(await rpc({ jsonrpc: '2.0', id: 'l', method: 'tools/list' })).toEqual({
      jsonrpc: '2.0',
      id: 'l',
      result: { tools: [] },
    });
    expect(
      await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'partners.x' } })
    ).toEqual(inconnu(2, 'partners.x'));
    expect(await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: 'x' })).toEqual(
      inconnu(3, '')
    );
    expect(await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 9 } })).toEqual(
      inconnu(4, '')
    );
    expect(await rpc({ jsonrpc: '2.0', id: 5, method: 'resources/list' })).toEqual({
      jsonrpc: '2.0',
      id: 5,
      error: { code: -32601, message: 'méthode inconnue : « resources/list »' },
    });
  });

  it('REQ-INT-026 : une longueur déclarée ÉGALE à la borne n’est pas refusée sur sa déclaration', async () => {
    const liste = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const r = await porte(appel(liste, SECRET_MCP, { 'content-length': String(CORPS_MAX_OCTETS) }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
  });

  it('REQ-INT-026 : un outil inscrit au registre est listé sous son nom complet, et son appel — tant que l’exécution n’est pas livrée — rend -32603, jamais un résultat', async () => {
    // Le registre est vide en phase 0 : un outil est INJECTÉ le temps du test, puis retiré.
    const registre = OUTILS as unknown as { name: string; description: string }[];
    registre.push({ name: 'temoin', description: 'un outil témoin' });
    try {
      const rpc = async (corps: unknown) => (await porte(appel(JSON.stringify(corps)))).json();
      expect(await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: { tools: [{ name: 'partners.temoin', description: 'un outil témoin' }] },
      });
      expect(
        await rpc({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'partners.temoin' },
        })
      ).toEqual({
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32603,
          message: 'exécution d’outil non livrée',
          data: { code: 'internal' },
        },
      });
      expect(
        await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'temoin' } })
      ).toMatchObject({ error: { code: -32602, data: { code: 'tool_not_found' } } });
    } finally {
      registre.pop();
    }
    expect(OUTILS).toEqual([]);
  });

  it('REQ-INT-026 : le registre de phase 0 est vide et le DIT, et chaque symbole qu’il autorise existe dans son module', async () => {
    expect(OUTILS).toEqual([]);
    expect(PERIMETRE_VIDE?.motif).toMatch(/^phase 0 : .+REQ-INT-027.+$/);
    expect(PERIMETRE_VIDE?.tache).toBe('INT-T13');
    expect(SYMBOLES_AUTORISES.map((s) => s.module)).toEqual([
      'src/lib/env',
      'src/server/securite/primitives-de-porte',
    ]);
    // Ce que la porte importe, et rien d'autre : le contrôle 3 du harnais lit cette liste.
    expect(SYMBOLES_AUTORISES.flatMap((s) => s.symboles)).toEqual([
      'lireEnvironnement',
      'egalATempsConstant',
      'CORPS_MAX_OCTETS',
    ]);
    for (const { module, symboles } of SYMBOLES_AUTORISES) {
      const m = (await import(`../../../${module}`)) as Record<string, unknown>;
      for (const s of symboles) expect(m[s], `${module}#${s}`).toBeDefined();
    }
  });
});

// ── La route : ses corps de refus, ses bornes et ses réarmements ──────────────────────────────

describe('REQ-SEC-010 — la route, refus par refus', () => {
  const client = (sujet: unknown, payload: Record<string, unknown> = chargeDuProducteur(CLIENT)) =>
    JSON.stringify(enveloppe({ type: CLIENT, sujet, payload, version: SCHEMA_VERSION }));
  const paiement = (paymentId: unknown) =>
    JSON.stringify(
      enveloppe({
        type: PAIEMENT,
        sujet: { payment_id: 'p' },
        payload: { ...chargeDuProducteur(PAIEMENT), paymentId },
        version: SCHEMA_VERSION,
      })
    );
  async function lu(r: Response): Promise<[number, string]> {
    return [r.status, await r.text()];
  }

  it('REQ-SEC-010 : chaque refus porte son corps fermé — 503, 413, 400, 401, 422, 503 d’inscription', async () => {
    const env = environnementValide();
    const s = env.AXIONIA_WEBHOOK_SECRET!;
    const sans = { ...env };
    delete sans.AXIONIA_WEBHOOK_SECRET;
    expect(await lu(await banc(sans).recevoir(signee(s, client({ client_id: 'a' }))))).toEqual([
      503,
      'reception_indisponible',
    ]);
    const b = banc(env);
    const grand = client({ client_id: 'a' }, { g: 'x'.repeat(CORPS_MAX_OCTETS) });
    expect(await lu(await b.recevoir(signee(s, grand)))).toEqual([413, 'corps_trop_grand']);
    const casse = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(new Error('coupé'));
      },
    });
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body: casse, duplex: 'half' };
    expect(
      await lu(await b.recevoir(new Request('https://partners.test/api/webhooks/axionia', init)))
    ).toEqual([400, 'corps_illisible']);
    expect(
      await lu(
        await b.recevoir(
          signee(randomBytes(32).toString('hex'), client({ client_id: 'a' }), undefined, kidDe(s))
        )
      )
    ).toEqual([401, 'signature_refusee']);
    expect(await lu(await b.recevoir(signee(s, '{pas du json')))).toEqual([422, 'hors_schema']);
    expect(
      await lu(await b.recevoir(signee(s, client({ client_id: 'a' }, { note: 'x@exemple.test' }))))
    ).toEqual([422, 'hors_schema']);
    b.d.depot = {
      inscrire: async () => {
        throw new Error('base_coupee');
      },
    } as unknown as typeof b.depot;
    expect(await lu(await b.recevoir(signee(s, client({ client_id: 'a' }))))).toEqual([
      503,
      'inscription_indisponible',
    ]);
    expect(b.signaux.map((x) => [x.porte, x.motif])).toEqual([
      ['axionia', 'signature_invalide'],
      ['axionia.contenu', 'hors_schema'],
      ['axionia.contenu', 'frontiere'],
    ]);
  });

  it('REQ-SEC-010 : une livraison inscrite rend 200 `{ok:true}`', async () => {
    const env = environnementValide();
    const r = await banc(env).recevoir(
      signee(env.AXIONIA_WEBHOOK_SECRET!, client({ client_id: 'a' }))
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('REQ-SEC-010 : un corps qui n’est pas de l’UTF-8 strict est hors schéma — jamais lu avec des caractères de remplacement', async () => {
    const env = environnementValide();
    const b = banc(env);
    const [avant, apres] = client({ client_id: 'a' }, { note: '§' }).split('§') as [string, string];
    const octetsCorps = Buffer.concat([
      Buffer.from(avant),
      Buffer.from([0xff]),
      Buffer.from(apres),
    ]);
    const t = String(MAINTENANT_S);
    const signature = createHmac('sha256', env.AXIONIA_WEBHOOK_SECRET!)
      .update(`${t}.`, 'utf8')
      .update(octetsCorps)
      .digest('hex');
    const r = await b.recevoir(
      new Request('https://partners.test/api/webhooks/axionia', {
        method: 'POST',
        headers: {
          [ENTETE_HORODATAGE]: t,
          [ENTETE_SIGNATURE]: signature,
          [ENTETE_KID_AXIONIA]: kidDe(env.AXIONIA_WEBHOOK_SECRET!),
        },
        body: octetsCorps,
      })
    );
    expect(r.status).toBe(422);
    expect(b.depot.lignes).toHaveLength(0);
  });

  it('REQ-SEC-010 : une livraison authentifiée RÉARME les deux portes — le refus suivant est de nouveau alerté', async () => {
    const env = environnementValide();
    const s = env.AXIONIA_WEBHOOK_SECRET!;
    const b = banc(env);
    const faux = randomBytes(32).toString('hex');
    await b.recevoir(signee(faux, client({ client_id: 'a' }), undefined, kidDe(s)));
    await b.recevoir(signee(s, '{pas du json'));
    await b.recevoir(signee(s, client({ client_id: 'b' })));
    await b.recevoir(signee(faux, client({ client_id: 'c' }), undefined, kidDe(s)));
    await b.recevoir(signee(s, '{pas du json'));
    expect(b.signaux.map((x) => [x.porte, x.motif])).toEqual([
      ['axionia', 'signature_invalide'],
      ['axionia.contenu', 'hors_schema'],
      ['axionia', 'signature_invalide'],
      ['axionia.contenu', 'hors_schema'],
    ]);
  });

  it('REQ-SEC-010 : le `paymentId` d’un paiement est une chaîne non vide d’au plus 120 caractères — 120 passent, 121, vide ou nombre : 422', async () => {
    const env = environnementValide();
    const s = env.AXIONIA_WEBHOOK_SECRET!;
    const b = banc(env);
    expect((await b.recevoir(signee(s, paiement('p'.repeat(120))))).status).toBe(200);
    for (const faux of ['q'.repeat(121), '', 7]) {
      expect((await b.recevoir(signee(s, paiement(faux)))).status, String(faux)).toBe(422);
    }
    expect(b.depot.lignes.map((l) => l.cleMetier)).toEqual(['p'.repeat(120)]);
  });

  it('REQ-SEC-010 : une valeur de fil sans valeur d’enum correspondante LÈVE — le contrat et le schéma ont divergé', () => {
    expect(() => identifiantDuType('inconnu.type' as (typeof TYPES_EVENEMENT)[number])).toThrow(
      /^type_hors_enum : inconnu_type n'est pas une valeur de TypeEvenementRecu$/
    );
    expect(identifiantDuType(CLIENT)).toBe(CLIENT.replace('.', '_'));
  });

  it('REQ-SEC-010 : la référence de sujet — une seule clé `<espace>_id`, une valeur textuelle non vide, 180 caractères au plus ; toute autre forme est nulle', () => {
    expect(sujetRefDe({ client_id: 'c-1' })).toBe('client:c-1');
    expect(sujetRefDe({ facture_client_id: 'f' })).toBe('facture_client:f');
    const juste = 'v'.repeat(180 - 'client:'.length);
    expect(sujetRefDe({ client_id: juste })).toBe(`client:${juste}`);
    for (const sujet of [
      null,
      'client:c-1',
      7,
      ['c-1'],
      {},
      { client_id: 'a', devis_id: 'b' },
      { client_id: '' },
      { client_id: 7 },
      { client_id: `${juste}v` },
      { Client_id: 'a' },
      { '1client_id': 'a' },
      { client_idx: 'a' },
      { _id: 'a' },
      { client: 'a' },
    ]) {
      expect(sujetRefDe(sujet), JSON.stringify(sujet)).toBeNull();
    }
  });
});
