// @req REQ-SEC-010
// @req REQ-QA-008
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
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { TYPES_EVENEMENT, SCHEMA_VERSION } from '../../../packages/contracts/events';
import {
  CORPS_MAX_OCTETS,
  TOLERANCE_SIGNATURE_S,
  creerAlerteurPlafonne,
  lireCorpsBorne,
  type SignalDePorte,
} from '../../../src/server/securite/primitives-de-porte';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  recevoirEvenementAxionia,
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

function requete(corps: string, entetes: Record<string, string>): Request {
  return new Request('https://partners.test/api/webhooks/axionia', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: corps,
  });
}

function signee(secret: string, corps: string, secondes = String(MAINTENANT_S)): Request {
  return requete(corps, {
    [ENTETE_HORODATAGE]: secondes,
    [ENTETE_SIGNATURE]: signer(secret, secondes, corps),
  });
}

/** Le dépôt en mémoire : il COMPTE, et il tient les deux unicités de la table. */
function depotEnMemoire(): DepotDeReception & { lignes: EvenementAInscrire[] } {
  const lignes: EvenementAInscrire[] = [];
  return {
    lignes,
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
      verifierSignatureAxionia(octets(corps), s, signer(secret, s, corps), secret, MAINTENANT_MS)
    ).toEqual({ ok: true });
  });

  it('REQ-SEC-010 : un autre secret est refusé en `signature_invalide`', () => {
    const autre = randomBytes(32).toString('hex');
    expect(
      verifierSignatureAxionia(octets(corps), s, signer(autre, s, corps), secret, MAINTENANT_MS)
    ).toEqual({ ok: false, motif: 'signature_invalide' });
  });

  it('REQ-SEC-010 : un octet du corps changé est refusé', () => {
    const faux = JSON.stringify({ a: 2 });
    expect(
      verifierSignatureAxionia(octets(faux), s, signer(secret, s, corps), secret, MAINTENANT_MS).ok
    ).toBe(false);
  });

  it('REQ-SEC-010 : la tolérance vaut 300 s — à 300 s passe, à 301 s est refusée, dans les deux sens', () => {
    expect(TOLERANCE_SIGNATURE_S).toBe(300);
    for (const decalage of [-300, 300]) {
      const t = String(MAINTENANT_S + decalage);
      expect(
        verifierSignatureAxionia(octets(corps), t, signer(secret, t, corps), secret, MAINTENANT_MS)
      ).toEqual({ ok: true });
    }
    for (const decalage of [-301, 301]) {
      const t = String(MAINTENANT_S + decalage);
      expect(
        verifierSignatureAxionia(octets(corps), t, signer(secret, t, corps), secret, MAINTENANT_MS)
      ).toEqual({ ok: false, motif: 'hors_fenetre' });
    }
  });

  it('REQ-SEC-010 : un en-tête absent est refusé, sans repli en clair', () => {
    expect(
      verifierSignatureAxionia(octets(corps), null, signer(secret, s, corps), secret, MAINTENANT_MS)
    ).toEqual({ ok: false, motif: 'entete_absent' });
    expect(verifierSignatureAxionia(octets(corps), s, null, secret, MAINTENANT_MS)).toEqual({
      ok: false,
      motif: 'entete_absent',
    });
    // Le secret lui-même, présenté comme signature : aucun repli en clair.
    expect(verifierSignatureAxionia(octets(corps), s, secret, secret, MAINTENANT_MS).ok).toBe(
      false
    );
  });

  it('REQ-SEC-010 : un horodatage qui n’est pas fait de chiffres est refusé — « t.corps » doit se découper sans ambiguïté', () => {
    for (const t of ['1.5', '', ' 1', '-1', '1e9', String(MAINTENANT_S) + '.0']) {
      expect(
        verifierSignatureAxionia(octets(corps), t, signer(secret, t, corps), secret, MAINTENANT_MS)
      ).toEqual({ ok: false, motif: 'horodatage_illisible' });
    }
  });

  it('REQ-SEC-010 : une signature en majuscules n’est pas la forme du producteur, elle est refusée', () => {
    expect(
      verifierSignatureAxionia(
        octets(corps),
        s,
        signer(secret, s, corps).toUpperCase(),
        secret,
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

describe('REQ-QA-008 — l’alerte de sécurité est PLAFONNÉE', () => {
  it('REQ-QA-008 : dix refus du même motif, une seule alerte ; réarmée, la suivante dit combien ont été tues', () => {
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

  it('REQ-QA-008 : réarmer une porte ne réarme pas l’autre', () => {
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

describe('REQ-SEC-010 REQ-QA-008 — la route : témoin à deux faces, compté en lignes', () => {
  it('REQ-SEC-010 : face ROUGE — signée avec un autre secret, 401, AUCUNE ligne, une alerte', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: randomUUID() },
        payload: {},
        version: SCHEMA_VERSION,
      })
    );
    const autre = randomBytes(32).toString('hex');
    const r1 = await b.recevoir(signee(autre, corps));
    const r2 = await b.recevoir(signee(autre, corps));
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
        payload: {},
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

  it('REQ-SEC-010 : face VERTE — correctement signée, 200 et EXACTEMENT une ligne, inscrite avant tout traitement', async () => {
    const env = environnementValide();
    const b = banc(env);
    const e = enveloppe({
      type: CLIENT,
      sujet: { client_id: 'c-1' },
      payload: {},
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

  it('REQ-QA-008 : livrée deux fois, la seconde rend 200 {duplicate:true}, n’écrit rien de plus et ne déclenche rien', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({ type: CLIENT, sujet: { client_id: 'c-2' }, payload: {}, version: SCHEMA_VERSION })
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
      enveloppe({ type: CLIENT, sujet: { client_id: 'c-4' }, payload: {}, version: SCHEMA_VERSION })
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
      payload: {},
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
      enveloppe({ type: CLIENT, sujet: { client_id: 'c-7' }, payload: {}, version: SCHEMA_VERSION })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(503);
  });

  it('REQ-QA-008 : un déclenchement du travail de fond qui lève ne produit JAMAIS un 5xx — l’événement est inscrit, 200', async () => {
    const env = environnementValide();
    const b = banc(env);
    b.d.declencher = () => {
      throw new Error('file_indisponible');
    };
    const corps = JSON.stringify(
      enveloppe({ type: CLIENT, sujet: { client_id: 'c-8' }, payload: {}, version: SCHEMA_VERSION })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(200);
    expect(b.depot.lignes).toHaveLength(1);
  });

  it('REQ-QA-008 : un événement bien formé de `schema_version` inconnue est inscrit `held` et alerté, jamais rejeté', async () => {
    const env = environnementValide();
    const b = banc(env);
    const corps = JSON.stringify(
      enveloppe({
        type: CLIENT,
        sujet: { client_id: 'c-9' },
        payload: {},
        version: SCHEMA_VERSION + 1,
      })
    );
    const r = await b.recevoir(signee(env.AXIONIA_WEBHOOK_SECRET!, corps));
    expect(r.status).toBe(200);
    expect(b.depot.lignes.map((l) => [l.statut, l.schemaVersion])).toEqual([
      ['held', SCHEMA_VERSION + 1],
    ]);
    expect(b.signaux.map((s) => s.motif)).toEqual(['schema_version_inconnue']);
    expect(b.declenchements()).toBe(0);
  });

  it('REQ-QA-008 : la clé métier d’un paiement est son `paymentId` : deux événements distincts du même paiement, une ligne', async () => {
    const env = environnementValide();
    const b = banc(env);
    const s = env.AXIONIA_WEBHOOK_SECRET!;
    const payload = { paymentId: 'pay-1', factureId: 'f-1' };
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
