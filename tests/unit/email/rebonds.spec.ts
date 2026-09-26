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
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, empreinteRecherche } from '../../../src/server/securite/pii';
import {
  creerAlerteurPlafonne,
  type SignalDePorte,
} from '../../../src/server/securite/primitives-de-porte';
import {
  ENTETE_SIGNATURE_ZEPTOMAIL,
  depotDesSuppressions,
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
    ).toEqual({ ok: true, texte: corps });
    expect(
      verifierSignatureZeptomail(
        o(corps),
        signer(cle, corps, MAINTENANT_MS, false),
        cle,
        MAINTENANT_MS
      )
    ).toEqual({ ok: true, texte: corps });
  });

  it('REQ-INT-023 : l’ordre des champs de l’en-tête n’est pas supposé', () => {
    const s = encodeURIComponent(createHmac('sha256', cle).update(corps, 'utf8').digest('base64'));
    const entete = `s-algorithm=HmacSHA256;s=${s};ts=${MAINTENANT_MS}`;
    expect(verifierSignatureZeptomail(o(corps), entete, cle, MAINTENANT_MS)).toEqual({
      ok: true,
      texte: corps,
    });
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
      ).toEqual({ ok: true, texte: corps });
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

describe('REQ-INT-023 — la charge lue est EXACTEMENT le texte dont la signature a été vérifiée', () => {
  it('REQ-INT-023 : un corps percent-encodé signé sous sa forme décodée est lu sous la forme SIGNÉE — jamais le corps reçu', async () => {
    const b = banc();
    const signe = JSON.stringify(charge('hardbounce', ['alice@exemple.test']));
    const recu = signe.replace('alice@', 'alic%65@');
    expect(recu).not.toBe(signe);
    const r = await b.recevoir(recu, signer(b.cle, signe, MAINTENANT_MS));
    expect(r.status).toBe(200);
    expect([...b.depot.entrees.keys()]).toEqual([
      empreinteRecherche('courriel', 'alice@exemple.test', clesPii(b.env)),
    ]);
  });

  it('REQ-INT-023 : le vérificateur rend le texte vérifié — le corps brut à la première tentative, le décodé à la seconde', () => {
    const cle = randomBytes(32).toString('hex');
    const signe = JSON.stringify(charge('hardbounce', ['alice@exemple.test']));
    const recu = signe.replace('alice@', 'alic%65@');
    expect(
      verifierSignatureZeptomail(o(signe), signer(cle, signe, MAINTENANT_MS), cle, MAINTENANT_MS)
    ).toEqual({ ok: true, texte: signe });
    expect(
      verifierSignatureZeptomail(o(recu), signer(cle, signe, MAINTENANT_MS), cle, MAINTENANT_MS)
    ).toEqual({ ok: true, texte: signe });
  });
});

describe('REQ-INT-023 — l’adaptateur Prisma des suppressions : l’unicité est celle de la BASE', () => {
  it('REQ-INT-023 : une ligne insérée rend `ajoutee`, une ligne écartée comme doublon rend `deja`', async () => {
    const appels: unknown[] = [];
    const prisma = (count: number) =>
      ({
        suppressionCourriel: {
          createMany: async (args: unknown) => {
            appels.push(args);
            return { count };
          },
        },
      }) as unknown as PrismaClient;
    const s = {
      emailHash: 'h1',
      motif: 'rebond_definitif' as const,
      survenuAt: new Date(0),
      creeAt: new Date(1),
    };
    expect(await depotDesSuppressions(prisma(1)).supprimer(s)).toBe('ajoutee');
    expect(await depotDesSuppressions(prisma(0)).supprimer(s)).toBe('deja');
    expect(appels).toEqual([
      { data: [s], skipDuplicates: true },
      { data: [s], skipDuplicates: true },
    ]);
  });
});

describe('REQ-INT-023 — `Producer-Signature`, forme par forme', () => {
  const cle = randomBytes(32).toString('hex');
  const corps = JSON.stringify(charge('hardbounce', ['x@exemple.test']));
  const condensat = (texte: string, k = cle) =>
    createHmac('sha256', k).update(texte, 'utf8').digest('base64');
  const juger = (entete: string, octets = o(corps)) =>
    verifierSignatureZeptomail(octets, entete, cle, MAINTENANT_MS);

  it('REQ-INT-023 : un en-tête VIDE est un en-tête absent', () => {
    expect(juger('')).toEqual({ ok: false, motif: 'entete_absent' });
  });

  it('REQ-INT-023 : chacun des trois champs manquant, ou un horodatage qui n’est pas fait de 1 à 16 chiffres : `entete_illisible`', () => {
    const s = encodeURIComponent(condensat(corps));
    for (const entete of [
      `s=${s};s-algorithm=HmacSHA256`,
      `ts=${MAINTENANT_MS};s-algorithm=HmacSHA256`,
      `ts=${MAINTENANT_MS};s=${s}`,
      `ts=x${MAINTENANT_MS};s=${s};s-algorithm=HmacSHA256`,
      `ts=${MAINTENANT_MS}x;s=${s};s-algorithm=HmacSHA256`,
      `ts=${'1'.repeat(17)};s=${s};s-algorithm=HmacSHA256`,
    ]) {
      expect(juger(entete), entete).toEqual({ ok: false, motif: 'entete_illisible' });
    }
  });

  it('REQ-INT-023 : les espaces autour des noms et des valeurs sont tolérés ; une partie sans `=` est ignorée', () => {
    const s = encodeURIComponent(condensat(corps));
    expect(juger(` ts = ${MAINTENANT_MS} ; s = ${s} ; s-algorithm = HmacSHA256 `)).toEqual({
      ok: true,
      texte: corps,
    });
    // `tsX` n'a pas de `=` : ce n'est pas un champ, et il ne remplace pas `ts`.
    expect(juger(`ts=${MAINTENANT_MS};s=${s};s-algorithm=HmacSHA256;tsX`)).toEqual({
      ok: true,
      texte: corps,
    });
  });

  it('REQ-INT-023 : un condensat qui n’a pas 32 octets, ou un bourrage mal percent-encodé : `signature_invalide`', () => {
    const court = createHmac('sha256', cle).update(corps, 'utf8').digest().subarray(0, 31);
    for (const s of [court.toString('base64'), '%ZZ']) {
      expect(juger(`ts=${MAINTENANT_MS};s=${s};s-algorithm=HmacSHA256`), s).toEqual({
        ok: false,
        motif: 'signature_invalide',
      });
    }
  });

  it('REQ-INT-023 : la seconde tentative décode `+` en espace ; elle refuse un autre secret, et un corps mal percent-encodé sans lever', () => {
    const recu = '{"a":"x+y%41"}';
    const decode = '{"a":"x yA"}';
    expect(
      juger(`ts=${MAINTENANT_MS};s=${condensat(decode)};s-algorithm=HmacSHA256`, o(recu))
    ).toEqual({ ok: true, texte: decode });
    const autre = randomBytes(32).toString('hex');
    expect(
      juger(`ts=${MAINTENANT_MS};s=${condensat(decode, autre)};s-algorithm=HmacSHA256`, o(recu))
    ).toEqual({ ok: false, motif: 'signature_invalide' });
    const casse = '{"a":"%ZZ"}';
    expect(
      juger(`ts=${MAINTENANT_MS};s=${condensat(casse, autre)};s-algorithm=HmacSHA256`, o(casse))
    ).toEqual({ ok: false, motif: 'signature_invalide' });
  });

  it('REQ-INT-023 : un corps bien signé qui n’est pas de l’UTF-8 strict n’a pas de texte à lire', () => {
    const octets = new Uint8Array([0x7b, 0xff, 0x7d]);
    const s = createHmac('sha256', cle).update(octets).digest('base64');
    expect(juger(`ts=${MAINTENANT_MS};s=${s};s-algorithm=HmacSHA256`, octets)).toEqual({
      ok: true,
      texte: null,
    });
  });
});

describe('REQ-INT-023 — la lecture d’une charge, forme par forme', () => {
  const avec = (message: Record<string, unknown>) =>
    lireRebond({ event_name: 'hardbounce', event_message: message });
  const a = (to: unknown) => avec({ email_info: { to } });

  it('REQ-INT-023 : une racine ou un message qui n’est pas un objet, des destinataires absents ou hors tableau : forme inconnue', () => {
    expect(lireRebond(['hardbounce'])).toEqual({ genre: 'inconnu', motif: 'forme_inconnue' });
    expect(lireRebond({ event_name: 'hardbounce', event_message: [] })).toEqual({
      genre: 'inconnu',
      motif: 'forme_inconnue',
    });
    for (const message of [
      {},
      { email_info: 'x' },
      { email_info: { to: 'x' } },
      { email_info: { to: {} } },
    ]) {
      expect(avec(message), JSON.stringify(message)).toEqual({
        genre: 'inconnu',
        motif: 'forme_inconnue',
      });
    }
  });

  it('REQ-INT-023 : les entrées illisibles sont ignorées — nulles, adresse absente, vide, blanche ou non textuelle — et l’adresse lue est rognée et en minuscules', () => {
    expect(
      a([
        null,
        { email_address: null },
        { email_address: [null, { address: '   ' }, { address: 7 }, { address: '' }] },
        { email_address: [{ address: '  Perdue@Exemple.TEST ' }] },
      ])
    ).toEqual({ genre: 'definitif', adresse: 'perdue@exemple.test', survenuAt: null });
  });

  it('REQ-INT-023 : un instant absent, sans détails, ou qui n’est pas une chaîne reste nul', () => {
    const to = [{ email_address: [{ address: 'x@exemple.test' }] }];
    for (const event_data of [
      undefined,
      {},
      { details: 'x' },
      { details: { time: 1_758_880_000_000 } },
    ]) {
      expect(avec({ email_info: { to }, event_data }), JSON.stringify(event_data)).toEqual({
        genre: 'definitif',
        adresse: 'x@exemple.test',
        survenuAt: null,
      });
    }
  });
});

describe('REQ-INT-023 — la route, refus par refus', () => {
  it('REQ-INT-023 : chaque refus porte son corps fermé, et chaque 200 le même `{ok:true}`', async () => {
    const b = banc();
    const cle = b.cle;
    const signe = (corps: string) => signer(cle, corps, MAINTENANT_MS);
    const lu = async (r: Response): Promise<[number, string]> => [r.status, await r.text()];
    const definitif = JSON.stringify(charge('hardbounce', ['x@exemple.test']));
    expect(
      await lu(await b.recevoir(definitif, signer('autre', definitif, MAINTENANT_MS)))
    ).toEqual([401, 'signature_refusee']);
    const grand = JSON.stringify({ g: 'x'.repeat(128 * 1024) });
    expect(await lu(await b.recevoir(grand, signe(grand)))).toEqual([413, 'corps_trop_grand']);
    const casse = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(new Error('coupé'));
      },
    });
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body: casse, duplex: 'half' };
    expect(
      await lu(await recevoirRebond(new Request('https://partners.test/x', init), b.d))
    ).toEqual([400, 'corps_illisible']);
    for (const corps of [
      definitif,
      JSON.stringify(charge('softbounce', ['x@exemple.test'])),
      JSON.stringify(charge('email_open', ['x@exemple.test'])),
    ]) {
      const r = await b.recevoir(corps, signe(corps));
      expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
    }
    const sans = banc();
    delete sans.env.ZEPTOMAIL_WEBHOOK_SECRET;
    expect(await lu(await sans.recevoir(definitif, signe(definitif)))).toEqual([
      503,
      'rebonds_indisponibles',
    ]);
  });

  it('REQ-INT-023 : la liste de suppression en panne rend 503 — le relais retentera ; la suppression écrite porte le motif `rebond_definitif`', async () => {
    const b = banc();
    const corps = JSON.stringify(charge('hardbounce', ['x@exemple.test']));
    const motifs: string[] = [];
    const enPanne: DepotDesSuppressions = {
      async supprimer(s) {
        motifs.push(s.motif);
        throw new Error('base_coupee');
      },
    };
    (b.d as { depot: DepotDesSuppressions }).depot = enPanne;
    const r = await b.recevoir(corps, signer(b.cle, corps, MAINTENANT_MS));
    expect([r.status, await r.text()]).toEqual([503, 'rebonds_indisponibles']);
    expect(motifs).toEqual(['rebond_definitif']);
  });

  it('REQ-INT-023 : un corps bien signé qui n’est pas de l’UTF-8 strict rend 200 SANS effet, alerté en forme inconnue', async () => {
    const b = banc();
    const octets = new Uint8Array([0x7b, 0xff, 0x7d]);
    const s = encodeURIComponent(createHmac('sha256', b.cle).update(octets).digest('base64'));
    const r = await recevoirRebond(
      new Request('https://partners.test/x', {
        method: 'POST',
        headers: {
          [ENTETE_SIGNATURE_ZEPTOMAIL]: `ts=${MAINTENANT_MS};s=${s};s-algorithm=HmacSHA256`,
        },
        body: octets,
      }),
      b.d
    );
    expect(r.status).toBe(200);
    expect(b.depot.entrees.size).toBe(0);
    expect(b.signaux.map((x) => [x.porte, x.motif])).toEqual([
      ['zeptomail.contenu', 'forme_inconnue'],
    ]);
  });

  it('REQ-INT-023 : une livraison authentifiée RÉARME la signature, une suppression écrite RÉARME le contenu — le refus suivant est de nouveau alerté', async () => {
    const b = banc();
    const signe = (corps: string) => signer(b.cle, corps, MAINTENANT_MS);
    const inconnu = JSON.stringify(charge('email_open', ['x@exemple.test']));
    const definitif = JSON.stringify(charge('hardbounce', ['x@exemple.test']));
    const faux = signer('autre', definitif, MAINTENANT_MS);
    await b.recevoir(definitif, faux);
    await b.recevoir(inconnu, signe(inconnu));
    await b.recevoir(definitif, signe(definitif));
    await b.recevoir(definitif, faux);
    await b.recevoir(inconnu, signe(inconnu));
    expect(b.signaux.map((x) => [x.porte, x.motif])).toEqual([
      ['zeptomail', 'signature_invalide'],
      ['zeptomail.contenu', 'evenement_inconnu'],
      ['zeptomail', 'signature_invalide'],
      ['zeptomail.contenu', 'evenement_inconnu'],
    ]);
  });
});

describe('REQ-INT-023 — une adresse que la normalisation refuse', () => {
  it('REQ-INT-023 : un rebond définitif dont l’adresse ne se normalise pas rend 200 SANS effet, alerté en forme inconnue', async () => {
    const b = banc();
    const corps = JSON.stringify(charge('hardbounce', ['pas-une-adresse']));
    const r = await b.recevoir(corps, signer(b.cle, corps, MAINTENANT_MS));
    expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
    expect(b.depot.entrees.size).toBe(0);
    expect(b.signaux.map((x) => [x.porte, x.motif])).toEqual([
      ['zeptomail.contenu', 'forme_inconnue'],
    ]);
  });
});
