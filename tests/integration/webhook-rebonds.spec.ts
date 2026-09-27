// @req REQ-INT-023
/**
 * Les rebonds du relais de courriel et la liste de suppression, en base RÉELLE — INT-T10.
 *
 * TÉMOIN À DEUX FACES (acceptance 5), compté en LIGNES de `suppressions_courriel` : une
 * notification de rebond mal signée est refusée et n'ajoute rien ; la même correctement signée
 * ajoute exactement une ligne ; livrée deux fois, pas une seconde.
 *
 * RETENU ET VISIBLE (acceptance 3) : un envoi vers une adresse supprimée écrit une ligne
 * `courriels_envoyes` `retenu_adresse_supprimee` et AUCUN appel au relais ; avec le drapeau DMARC
 * faux, la ligne est `retenu_dmarc_non_verifie`.
 *
 * EXCEPTION E2 (partners/ADR-0022, point 9) : les gabarits écrits en base sont confrontés à la
 * table des notifications — une colonne en chaîne n'est tenue que par ce test.
 *
 * Secrets tirés à l'exécution ; adresses sous le domaine réservé `.test`, aucune n'est écrite en
 * clair en base.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, empreinteRecherche } from '../../src/server/securite/pii';
import { creerAlerteurPlafonne } from '../../src/server/securite/primitives-de-porte';
import { GABARITS } from '../../src/server/notifications/table-ssot';
import {
  ENTETE_SIGNATURE_ZEPTOMAIL,
  depotDesSuppressions,
  recevoirRebond,
} from '../../src/server/integrations/zeptomail/rebonds';
import {
  configurationDeLEmetteur,
  demanderEnvoi,
  depotDesCourriels,
  type Relais,
} from '../../src/server/integrations/zeptomail/emetteur';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const MAINTENANT_MS = Date.UTC(2026, 8, 26, 10, 0, 0);
const DOMAINE = 'envoi.partners.test';

const env: Record<string, string> = { NODE_ENV: 'test' };
for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
env.PARTNERS_EMAIL_EXPEDITEUR = `camille@${DOMAINE}`;
const CLE = env.ZEPTOMAIL_WEBHOOK_SECRET!;
const cles = clesPii(env);
const GABARIT = Object.keys(GABARITS)[0]!;

function rebond(adresse: string): string {
  return JSON.stringify({
    event_name: 'hardbounce',
    event_message: {
      email_info: { to: [{ email_address: [{ address: adresse }] }] },
      event_data: { details: { time: '2026-09-26T09:58:00Z' } },
    },
  });
}

function recevoir(corps: string, cle: string) {
  const s = encodeURIComponent(createHmac('sha256', cle).update(corps, 'utf8').digest('base64'));
  return recevoirRebond(
    new Request('https://partners.test/api/webhooks/zeptomail', {
      method: 'POST',
      headers: {
        [ENTETE_SIGNATURE_ZEPTOMAIL]: `ts=${MAINTENANT_MS};s=${s};s-algorithm=HmacSHA256`,
      },
      body: corps,
    }),
    {
      environnement: env,
      maintenantMs: MAINTENANT_MS,
      depot: depotDesSuppressions(base.prisma),
      alerteur: creerAlerteurPlafonne(() => undefined),
      journal: { info: () => undefined },
    }
  );
}

function emetteur(drapeau: 'true' | 'false') {
  const appels: unknown[] = [];
  const relais: Relais = {
    async envoyer(m) {
      appels.push(m);
      return { messageId: `msg-${appels.length}` };
    },
  };
  const d = {
    configuration: configurationDeLEmetteur(
      { ...env, PARTNERS_EMAIL_DMARC_VERIFIE: drapeau },
      DOMAINE
    ),
    relais,
    depot: depotDesCourriels(base.prisma),
    cles,
    maintenant: () => new Date(MAINTENANT_MS),
    nouvelId: () => randomUUID(),
  };
  return {
    appels,
    envoyer: (a: string) =>
      demanderEnvoi({ gabarit: GABARIT, a, sujet: 'Sujet', corps: 'Corps', apporteurId: null }, d),
  };
}

const hash = (a: string) => empreinteRecherche('courriel', a, cles);
const lignesDe = (a: string) =>
  base.prisma.suppressionCourriel.count({ where: { emailHash: hash(a) } });
/**
 * Le nom de la contrainte d'unicité qui refuse une insertion, lu dans le diagnostic de Postgres :
 * pour une requête brute, Prisma ne transmet que le code 23505 et le détail, jamais le nom
 * (mesuré en porte A sur la PR 134). La valeur de l'insertion est littérale et tirée ici.
 */
async function uniciteRefusee(insertion: string): Promise<string> {
  try {
    await base.prisma.$executeRawUnsafe(`DO $$
      DECLARE contrainte text;
      BEGIN
        ${insertion};
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS contrainte = CONSTRAINT_NAME;
        RAISE EXCEPTION 'unicite_refusee:%', contrainte;
      END $$`);
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-INT-023 — témoin à deux faces, compté en lignes de suppressions_courriel', () => {
  it('REQ-INT-023 : face ROUGE — mal signée : refusée, AUCUNE ligne', async () => {
    const adresse = `${randomUUID()}@exemple.test`;
    const r = await recevoir(rebond(adresse), randomBytes(32).toString('hex'));
    expect(r.status).toBe(401);
    expect(await lignesDe(adresse)).toBe(0);
  });

  it('REQ-INT-023 : face VERTE — bien signée : EXACTEMENT une ligne ; livrée deux fois, pas une seconde', async () => {
    const adresse = `${randomUUID()}@exemple.test`;
    expect((await recevoir(rebond(adresse), CLE)).status).toBe(200);
    expect(await lignesDe(adresse)).toBe(1);
    expect((await recevoir(rebond(adresse), CLE)).status).toBe(200);
    expect(await lignesDe(adresse)).toBe(1);
    const l = await base.prisma.suppressionCourriel.findUniqueOrThrow({
      where: { emailHash: hash(adresse) },
    });
    expect([l.motif, l.survenuAt.toISOString(), l.creeAt.toISOString()]).toEqual([
      'rebond_definitif',
      '2026-09-26T09:58:00.000Z',
      new Date(MAINTENANT_MS).toISOString(),
    ]);
  });
});

describe('REQ-INT-023 — un envoi vers une adresse supprimée est RETENU et VISIBLE', () => {
  it('REQ-INT-023 : adresse supprimée, drapeau vrai : une ligne `retenu_adresse_supprimee`, AUCUN appel au relais', async () => {
    const adresse = `${randomUUID()}@exemple.test`;
    await recevoir(rebond(adresse), CLE);
    const e = emetteur('true');
    expect(await e.envoyer(adresse)).toBe('retenu_adresse_supprimee');
    expect(e.appels).toHaveLength(0);
    const lignes = await base.prisma.courrielEnvoye.findMany({
      where: { emailHash: hash(adresse) },
    });
    expect(lignes.map((l) => [l.statut, l.envoyeAt])).toEqual([['retenu_adresse_supprimee', null]]);
  });

  it('REQ-INT-023 : drapeau DMARC faux : une ligne `retenu_dmarc_non_verifie`, AUCUN appel ; vrai : une ligne `envoye`, UN appel', async () => {
    const adresse = `${randomUUID()}@exemple.test`;
    const ferme = emetteur('false');
    expect(await ferme.envoyer(adresse)).toBe('retenu_dmarc_non_verifie');
    expect(ferme.appels).toHaveLength(0);
    const ouvert = emetteur('true');
    expect(await ouvert.envoyer(adresse)).toBe('envoye');
    expect(ouvert.appels).toHaveLength(1);
    const lignes = await base.prisma.courrielEnvoye.findMany({
      where: { emailHash: hash(adresse) },
      orderBy: { statut: 'asc' },
    });
    expect(
      lignes.map((l) => [l.statut, l.envoyeAt?.toISOString() ?? null, l.fournisseurMessageId])
    ).toEqual([
      ['envoye', new Date(MAINTENANT_MS).toISOString(), 'msg-1'],
      ['retenu_dmarc_non_verifie', null, null],
    ]);
  });

  it('REQ-INT-023 : exception E2 — tout gabarit écrit en base est une clé de la table des notifications', async () => {
    const ecrits = await base.prisma.courrielEnvoye.findMany({
      distinct: ['gabarit'],
      select: { gabarit: true },
    });
    expect(ecrits.length).toBeGreaterThan(0);
    for (const { gabarit } of ecrits) expect(Object.keys(GABARITS)).toContain(gabarit);
  });
});

describe('REQ-INT-023 — chaque CHECK des deux tables, vu refuser', () => {
  const inserer = (statut: string, envoyeAt: string | null, emailHash: string, gabarit: string) =>
    base.prisma.$executeRawUnsafe(
      `INSERT INTO courriels_envoyes (id, gabarit, email_hash, statut, demande_at, envoye_at)
       VALUES ($1::uuid, $2, $3, $4::statut_courriel, now(), $5::timestamptz)`,
      randomUUID(),
      gabarit,
      emailHash,
      statut,
      envoyeAt
    );
  const HEX = 'd'.repeat(64);

  it('REQ-INT-023 : face VERTE — une ligne valide insérée en SQL brut passe', async () => {
    expect(await inserer('envoye', '2026-09-26T10:00:00Z', HEX, GABARIT)).toBe(1);
  });

  it('REQ-INT-023 : face ROUGE — courriels_envoyes_email_hash_hex', async () => {
    await expect(inserer('echec', null, 'D'.repeat(64), GABARIT)).rejects.toThrow(
      /courriels_envoyes_email_hash_hex/
    );
  });

  it('REQ-INT-023 : face ROUGE — courriels_envoyes_envoye_si_et_seulement_si_date, dans les deux sens', async () => {
    await expect(inserer('envoye', null, HEX, GABARIT)).rejects.toThrow(
      /courriels_envoyes_envoye_si_et_seulement_si_date/
    );
    await expect(inserer('echec', '2026-09-26T10:00:00Z', HEX, GABARIT)).rejects.toThrow(
      /courriels_envoyes_envoye_si_et_seulement_si_date/
    );
  });

  it('REQ-INT-023 : face ROUGE — courriels_envoyes_gabarit_forme', async () => {
    await expect(inserer('echec', null, HEX, 'Lien Magique')).rejects.toThrow(
      /courriels_envoyes_gabarit_forme/
    );
  });

  it('REQ-INT-023 : face ROUGE — suppressions_courriel_email_hash_hex, et l’empreinte unique', async () => {
    const supprimer = (h: string) =>
      base.prisma.$executeRawUnsafe(
        `INSERT INTO suppressions_courriel (id, email_hash, motif, survenu_at, cree_at) VALUES ($1::uuid, $2, 'rebond_definitif', now(), now())`,
        randomUUID(),
        h
      );
    await expect(supprimer('pas-une-empreinte')).rejects.toThrow(
      /suppressions_courriel_email_hash_hex/
    );
    expect(await supprimer('e'.repeat(64))).toBe(1);
    expect(
      await uniciteRefusee(
        `INSERT INTO suppressions_courriel (id, email_hash, motif, survenu_at, cree_at) VALUES ('${randomUUID()}'::uuid, '${'e'.repeat(64)}', 'rebond_definitif', now(), now())`
      )
    ).toContain('unicite_refusee:suppressions_courriel_email_hash_key');
  });
});
