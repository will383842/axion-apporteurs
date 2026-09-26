// @req REQ-INT-023
/**
 * `rebonds.spec.ts` — le webhook des rebonds du relais de courriel (INT-T10), sans base.
 *
 * LA FORME DE L'EN-TÊTE `Producer-Signature` n'est pas encore confrontée à la documentation du
 * relais (`docs/tiers/zeptomail.md` §2, rubrique à relever) : elle est lue chez NOTRE producteur
 * voisin, axionia (`src/server/email/zeptomail-webhook-signature.ts`, commit `4461316ba`, lu le
 * 2026-09-26), qui cite l'exemple de la documentation — `ts=<millisecondes>;s=<base64 dont le
 * bourrage est percent-encodé>;s-algorithm=HmacSHA256`, condensat sur le CORPS seul.
 *
 * LA FORME SÛRE tant que la charge réelle n'est pas enregistrée (acceptance 6) : seul un rebond
 * DÉFINITIF ajoute une ligne ; un rebond temporaire est journalisé et n'ajoute rien ; un nom
 * d'événement inconnu, ou une forme qu'on ne sait pas lire, rend 200 sans effet et est alerté —
 * jamais « supprimé par défaut ».
 *
 * TÉMOIN À DEUX FACES (acceptance 5), compté en ENTRÉES de la liste de suppression : mal signée,
 * refusée et rien n'est ajouté ; bien signée, exactement une entrée ; livrée deux fois, pas une
 * seconde. La même chose en base réelle vit dans `tests/integration/webhook-rebonds.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, empreinteRecherche } from '../../../src/server/securite/pii';
import {
  creerAlerteurPlafonne,
  type SignalDePorte,
} from '../../../src/server/securite/primitives-de-porte';
import {
  ENTETE_SIGNATURE_ZEPTOMAIL,
  lireRebond,
  recevoirRebond,
  verifierSignatureZeptomail,
  type DepotDesSuppressions,
} from '../../../src/server/integrations/zeptomail/rebonds';

const MAINTENANT_MS = Date.UTC(2026, 8, 26, 10, 0, 0);

/** La charge enregistrée, et ce qu'elle déclare de sa provenance. */
const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/zeptomail/rebond-definitif.json', 'utf8')
) as {
  Source: string;
  'Confronte-a': string;
  charge: Record<string, unknown>;
};

function signer(cle: string, corps: string, tsMs: number, encoder = true): string {
  const s = createHmac('sha256', cle).update(corps, 'utf8').digest('base64');
  return `ts=${tsMs};s=${encoder ? encodeURIComponent(s) : s};s-algorithm=HmacSHA256`;
}

function environnementValide(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  return env;
}

function charge(nom: string, adresses: readonly string[]): Record<string, unknown> {
  return {
    event_name: nom,
    event_message: {
      request_id: 'r-1',
      email_info: { to: [{ email_address: adresses.map((address) => ({ address })) }] },
      event_data: { details: { time: '2026-09-26T09:58:00Z', reason: 'code fermé du relais' } },
    },
  };
}

function depotEnMemoire(): DepotDesSuppressions & {
  entrees: Map<string, { survenuAt: Date; creeAt: Date }>;
} {
  const entrees = new Map<string, { survenuAt: Date; creeAt: Date }>();
  return {
    entrees,
    async supprimer(s) {
      if (entrees.has(s.emailHash)) return 'deja';
      entrees.set(s.emailHash, { survenuAt: s.survenuAt, creeAt: s.creeAt });
      return 'ajoutee';
    },
  };
}

function banc() {
  const env = environnementValide();
  const depot = depotEnMemoire();
  const signaux: (SignalDePorte & { tus: number })[] = [];
  const journal: string[] = [];
  const d = {
    environnement: env,
    maintenantMs: MAINTENANT_MS,
    depot,
    alerteur: creerAlerteurPlafonne((s) => signaux.push(s)),
    journal: { info: (m: string) => void journal.push(m) },
  };
  const recevoir = (corps: string, entete: string | null) =>
    recevoirRebond(
      new Request('https://partners.test/api/webhooks/zeptomail', {
        method: 'POST',
        headers: entete === null ? {} : { [ENTETE_SIGNATURE_ZEPTOMAIL]: entete },
        body: corps,
      }),
      d
    );
  return { env, depot, signaux, journal, d, recevoir, cle: env.ZEPTOMAIL_WEBHOOK_SECRET! };
}

const o = (s: string) => new TextEncoder().encode(s);

describe('REQ-INT-023 — la charge enregistrée déclare sa provenance', () => {
  it('REQ-INT-023 : la fixture nomme qui l’a produite et ce à quoi elle a été confrontée', () => {
    expect(FIXTURE.Source).toMatch(/^Source: /);
    expect(FIXTURE['Confronte-a']).toMatch(
      /^Confronte-a: docs\/tiers\/zeptomail\.md#2-source-officielle/
    );
    expect(lireRebond(FIXTURE.charge)).toMatchObject({ genre: 'definitif' });
  });
});

describe('REQ-INT-023 — `Producer-Signature`, jugée seule', () => {
  const cle = randomBytes(32).toString('hex');
  const corps = JSON.stringify(charge('hardbounce', ['x@exemple.test']));

  it('REQ-INT-023 : la signature du relais est acceptée, bourrage percent-encodé ou non', () => {
    expect(
      verifierSignatureZeptomail(o(corps), signer(cle, corps, MAINTENANT_MS), cle, MAINTENANT_MS)
    ).toEqual({ ok: true });
    expect(
      verifierSignatureZeptomail(
        o(corps),
        signer(cle, corps, MAINTENANT_MS, false),
        cle,
        MAINTENANT_MS
      )
    ).toEqual({ ok: true });
  });

  it('REQ-INT-023 : l’ordre des champs de l’en-tête n’est pas supposé', () => {
    const s = encodeURIComponent(createHmac('sha256', cle).update(corps, 'utf8').digest('base64'));
    const entete = `s-algorithm=HmacSHA256;s=${s};ts=${MAINTENANT_MS}`;
    expect(verifierSignatureZeptomail(o(corps), entete, cle, MAINTENANT_MS)).toEqual({ ok: true });
  });

  it('REQ-INT-023 : un autre secret, un corps changé : `signature_invalide`', () => {
    const autre = randomBytes(32).toString('hex');
    expect(
      verifierSignatureZeptomail(o(corps), signer(autre, corps, MAINTENANT_MS), cle, MAINTENANT_MS)
    ).toEqual({ ok: false, motif: 'signature_invalide' });
    expect(
      verifierSignatureZeptomail(
        o(corps + ' '),
        signer(cle, corps, MAINTENANT_MS),
        cle,
        MAINTENANT_MS
      ).ok
    ).toBe(false);
  });

  it('REQ-INT-023 : tolérance de 300 s sur un horodatage en MILLISECONDES — 300 s passe, 301 s est refusée', () => {
    for (const d of [-300_000, 300_000]) {
      expect(
        verifierSignatureZeptomail(
          o(corps),
          signer(cle, corps, MAINTENANT_MS + d),
          cle,
          MAINTENANT_MS
        )
      ).toEqual({ ok: true });
    }
    for (const d of [-301_000, 301_000]) {
      expect(
        verifierSignatureZeptomail(
          o(corps),
          signer(cle, corps, MAINTENANT_MS + d),
          cle,
          MAINTENANT_MS
        )
      ).toEqual({ ok: false, motif: 'hors_fenetre' });
    }
  });

  it('REQ-INT-023 : en-tête absent, illisible, ou algorithme annoncé autre que HmacSHA256 : refusés', () => {
    expect(verifierSignatureZeptomail(o(corps), null, cle, MAINTENANT_MS)).toEqual({
      ok: false,
      motif: 'entete_absent',
    });
    expect(verifierSignatureZeptomail(o(corps), 'n importe quoi', cle, MAINTENANT_MS)).toEqual({
      ok: false,
      motif: 'entete_illisible',
    });
    expect(
      verifierSignatureZeptomail(o(corps), `ts=abc;s=x;s-algorithm=HmacSHA256`, cle, MAINTENANT_MS)
    ).toEqual({ ok: false, motif: 'entete_illisible' });
    expect(
      verifierSignatureZeptomail(
        o(corps),
        signer(cle, corps, MAINTENANT_MS).replace('HmacSHA256', 'HmacSHA1'),
        cle,
        MAINTENANT_MS
      )
    ).toEqual({ ok: false, motif: 'algorithme_refuse' });
  });
});

describe('REQ-INT-023 — la lecture d’une charge : seul le rebond DÉFINITIF supprime', () => {
  it('REQ-INT-023 : un rebond définitif rend l’adresse et l’instant', () => {
    expect(lireRebond(charge('hardbounce', ['x@exemple.test']))).toEqual({
      genre: 'definitif',
      adresse: 'x@exemple.test',
      survenuAt: new Date('2026-09-26T09:58:00Z'),
    });
  });

  it('REQ-INT-023 : un rebond temporaire est temporaire, un nom inconnu est inconnu', () => {
    expect(lireRebond(charge('softbounce', ['x@exemple.test']))).toEqual({ genre: 'temporaire' });
    expect(lireRebond(charge('email_open', ['x@exemple.test']))).toEqual({
      genre: 'inconnu',
      motif: 'evenement_inconnu',
    });
    expect(lireRebond({ event_name: ['hardbounce'] })).toEqual({
      genre: 'inconnu',
      motif: 'evenement_inconnu',
    });
  });

  it('REQ-INT-023 : aucune adresse, ou plusieurs adresses distinctes : on ne sait pas laquelle a rebondi — inconnu, rien n’est supprimé', () => {
    expect(lireRebond(charge('hardbounce', []))).toEqual({
      genre: 'inconnu',
      motif: 'forme_inconnue',
    });
    expect(lireRebond(charge('hardbounce', ['x@exemple.test', 'y@exemple.test']))).toEqual({
      genre: 'inconnu',
      motif: 'forme_inconnue',
    });
    expect(lireRebond({ event_name: 'hardbounce' })).toEqual({
      genre: 'inconnu',
      motif: 'forme_inconnue',
    });
    expect(lireRebond(null)).toEqual({ genre: 'inconnu', motif: 'forme_inconnue' });
  });

  it('REQ-INT-023 : l’adresse portée en objet unique est lue comme en tableau', () => {
    const c = charge('hardbounce', []);
    (c.event_message as { email_info: unknown }).email_info = {
      to: [{ email_address: { address: 'z@exemple.test' } }],
    };
    expect(lireRebond(c)).toMatchObject({ genre: 'definitif', adresse: 'z@exemple.test' });
  });

  it('REQ-INT-023 : un instant illisible ne fabrique pas une date — il reste nul', () => {
    const c = charge('hardbounce', ['x@exemple.test']);
    (c.event_message as { event_data: unknown }).event_data = { details: { time: 'hier' } };
    expect(lireRebond(c)).toEqual({
      genre: 'definitif',
      adresse: 'x@exemple.test',
      survenuAt: null,
    });
  });
});

describe('REQ-INT-023 — la route : témoin à deux faces, compté en entrées de la liste de suppression', () => {
  it('REQ-INT-023 : face ROUGE — mal signée : 401, AUCUNE entrée, une alerte', async () => {
    const b = banc();
    const corps = JSON.stringify(charge('hardbounce', ['x@exemple.test']));
    const r = await b.recevoir(
      corps,
      signer(randomBytes(32).toString('hex'), corps, MAINTENANT_MS)
    );
    expect(r.status).toBe(401);
    expect(b.depot.entrees.size).toBe(0);
    expect(b.signaux.map((s) => [s.porte, s.motif])).toEqual([['zeptomail', 'signature_invalide']]);
  });

  it('REQ-INT-023 : face VERTE — bien signée : 200 et EXACTEMENT une entrée ; livrée deux fois, pas une seconde', async () => {
    const b = banc();
    const corps = JSON.stringify(charge('hardbounce', ['Perdue@Exemple.test']));
    const r1 = await b.recevoir(corps, signer(b.cle, corps, MAINTENANT_MS));
    const r2 = await b.recevoir(corps, signer(b.cle, corps, MAINTENANT_MS));
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect([...b.depot.entrees.keys()]).toEqual([
      empreinteRecherche('courriel', 'perdue@exemple.test', clesPii(b.env)),
    ]);
    expect([...b.depot.entrees.values()][0]).toEqual({
      survenuAt: new Date('2026-09-26T09:58:00Z'),
      creeAt: new Date(MAINTENANT_MS),
    });
  });

  it('REQ-INT-023 : un rebond temporaire n’ajoute rien, il est journalisé', async () => {
    const b = banc();
    const corps = JSON.stringify(charge('softbounce', ['x@exemple.test']));
    expect((await b.recevoir(corps, signer(b.cle, corps, MAINTENANT_MS))).status).toBe(200);
    expect(b.depot.entrees.size).toBe(0);
    expect(b.journal).toEqual(['rebond_temporaire']);
  });

  it('REQ-INT-023 : un événement inconnu, ou une charge illisible, rend 200 SANS effet et est alerté — jamais supprimé par défaut', async () => {
    const b = banc();
    for (const corps of [
      JSON.stringify(charge('email_open', ['x@exemple.test'])),
      '{pas du json',
    ]) {
      expect((await b.recevoir(corps, signer(b.cle, corps, MAINTENANT_MS))).status).toBe(200);
    }
    expect(b.depot.entrees.size).toBe(0);
    expect(b.signaux.map((s) => s.motif)).toEqual(['evenement_inconnu', 'forme_inconnue']);
  });

  it('REQ-INT-023 : sans secret configuré, 503 et rien n’est ajouté', async () => {
    const b = banc();
    const cle = b.cle;
    delete b.env.ZEPTOMAIL_WEBHOOK_SECRET;
    const corps = JSON.stringify(charge('hardbounce', ['x@exemple.test']));
    expect((await b.recevoir(corps, signer(cle, corps, MAINTENANT_MS))).status).toBe(503);
    expect(b.depot.entrees.size).toBe(0);
  });

  it('REQ-INT-023 : au-delà de 128 Ko, 413 et rien n’est ajouté', async () => {
    const b = banc();
    const corps = JSON.stringify({
      ...charge('hardbounce', ['x@exemple.test']),
      grand: 'x'.repeat(128 * 1024),
    });
    expect((await b.recevoir(corps, signer(b.cle, corps, MAINTENANT_MS))).status).toBe(413);
    expect(b.depot.entrees.size).toBe(0);
  });
});
