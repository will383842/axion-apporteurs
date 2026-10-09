// @req REQ-DM-027
// @req REQ-UX-047
/**
 * CPL-T07 — le dossier de conformité en console, en base RÉELLE : vérifier une pièce (valider, ou
 * refuser avec un motif fermé), ouvrir le KYC d'un apporteur retenu, le valider quand rien ne manque
 * pour signer (selon la juriste : SIREN, identité et RC pro validés, TVA si assujetti, RIB déposé).
 * Chaque geste, une transaction avec son événement. TÉMOINS À DEUX FACES : le même geste refusé
 * puis admis, à une condition près. Sous `partners_app`, le rôle du serveur.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  ErreurDossierDeConformite,
  lireLeDossier,
  ouvrirLeKyc,
  validerLeKyc,
  verifierUnePiece,
  type ActeurDuDossier,
} from '../../src/server/conformite/dossier';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const MAINTENANT = new Date('2027-03-01T10:00:00.000Z');
const DANS_UN_AN = new Date('2028-03-01T10:00:00.000Z');
const HIER = new Date('2027-02-28T10:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const cles = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-cpl-t07-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});

const QUALIFIEUR: ActeurDuDossier = { id: randomUUID(), role: 'qualifieur' };
const ADMIN: ActeurDuDossier = { id: randomUUID(), role: 'admin' };
const LECTEUR: ActeurDuDossier = { id: randomUUID(), role: 'lecteur' };

/**
 * Un RIB VALIDE, tel que la base l'exige depuis la migration 004750 : il naît `a_verifier`, SANS
 * regard, puis un administrateur le vérifie et un AUTRE le confirme ; la confirmation le passe à
 * `valide` dans la même écriture, et pose `remplacee_at` quand la fixture le demande (un regard ne se
 * pose jamais sur une pièce écartée).
 */
/** Un client qui exécute du SQL paramétré : le propriétaire, `partners_app` ou une transaction. */
type ClientSql = { $executeRawUnsafe(sql: string, ...valeurs: unknown[]): Promise<number> };
const VERIFICATEUR_DU_RIB = randomUUID();
const CONFIRMATEUR_DU_RIB = randomUUID();

/** Les deux administrateurs actifs et validés des regards, sous le propriétaire. */
async function deuxAdministrateursDuRib(proprietaire: ClientSql) {
  for (const [id, par] of [
    [VERIFICATEUR_DU_RIB, null],
    [CONFIRMATEUR_DU_RIB, VERIFICATEUR_DU_RIB],
  ] as const) {
    await proprietaire.$executeRawUnsafe(
      `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at, valide_par_id)
       VALUES ($1::uuid, 'admin'::console_role, $2, $3, clock_timestamp(), clock_timestamp(), $4::uuid)`,
      id,
      randomBytes(40),
      randomBytes(32).toString('hex'),
      par
    );
  }
}

/** Les deux regards d'un RIB inséré sans eux : vérifié, puis confirmé et passé à `valide`. */
async function confirmerLeRib(client: ClientSql, id: string, remplaceeAt: Date | null = null) {
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = clock_timestamp()
     WHERE id = $2::uuid`,
    VERIFICATEUR_DU_RIB,
    id
  );
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_confirme_par_id = $1::uuid, rib_confirme_at = clock_timestamp(),
       statut = 'valide', remplacee_at = $3 WHERE id = $2::uuid`,
    CONFIRMATEUR_DU_RIB,
    id,
    remplaceeAt
  );
}

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  await deuxAdministrateursDuRib(base.prisma);
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(statut: 'retenu' | 'kyc_en_cours' | 'candidat'): Promise<string> {
  const id = randomUUID();
  await base.prisma.apporteur.create({
    data: {
      ...(colonnesPii(
        { modele: MODELE_APPORTEUR, id },
        { nom: 'Témoin', prenom: 'Conformité', email: `c-${hex(4)}@exemple.test` },
        cles
      ) as object),
      id,
      statut,
      codeParrainage: `AX${hex(3).toUpperCase()}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: new Date('2027-01-01T00:00:00.000Z'),
    },
  });
  return id;
}

type Type = 'siret' | 'tva' | 'rib' | 'identite' | 'vigilance' | 'rc_pro';
type Statut = 'manquante' | 'a_verifier' | 'valide' | 'perimee' | 'refusee';

async function unePiece(
  apporteurId: string,
  type: Type,
  statut: Statut,
  expireAt: Date | null = type === 'rc_pro' || type === 'vigilance' ? DANS_UN_AN : null
): Promise<string> {
  const id = randomUUID();
  const ribValide = type === 'rib' && statut === 'valide';
  await base.prisma.pieceKyc.create({
    data: { id, apporteurId, type, statut: ribValide ? 'a_verifier' : statut, expireAt },
  });
  if (ribValide) await confirmerLeRib(base.prisma, id);
  return id;
}

async function uneIdentite(apporteurId: string, regimeTva: 'assujetti' | 'franchise_293b') {
  await base.prisma.identiteFacturation.create({
    data: { apporteurId, siren: '552100554', regimeTva, debutAt: HIER },
  });
}

const piece = (id: string) => base.prisma.pieceKyc.findUniqueOrThrow({ where: { id } });
const statutDe = async (id: string) =>
  (await base.prisma.apporteur.findUniqueOrThrow({ where: { id }, select: { statut: true } }))
    .statut;
const evenements = (agregatId: string) =>
  base.prisma.evenement.findMany({ where: { agregatId }, orderBy: { survenuAt: 'asc' } });

async function motif(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurDossierDeConformite)
      return e.manquantes.length ? `${e.motif}:${e.manquantes.join(',')}` : e.motif;
    throw e;
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-027 — vérifier une pièce, avec son événement', () => {
  it('REQ-DM-027 : TÉMOIN À DEUX FACES — une pièce à vérifier se valide, avec son événement ; un RIB, ni validé ni refusé, est hors de ce geste', async () => {
    const a = await unApporteur('kyc_en_cours');
    const siret = await unePiece(a, 'siret', 'a_verifier');
    await verifierUnePiece(app, {
      acteur: QUALIFIEUR,
      pieceId: siret,
      verdict: { decision: 'valider' },
      maintenant: MAINTENANT,
    });
    expect(await piece(siret)).toMatchObject({ statut: 'valide', verifieeAt: MAINTENANT });
    const [e] = await evenements(siret);
    expect(e).toMatchObject({ type: 'piece_kyc_statut_modifie', agregat: 'piece_kyc' });
    expect(e!.charge).toEqual({
      de: 'a_verifier',
      vers: 'valide',
      type: 'siret',
      acteur: { par: 'utilisateur_console', id: QUALIFIEUR.id },
    });
    // Condition de la sécurité : la validation d'un RIB est à quatre yeux, dans sa propre tâche.
    const rib = await unePiece(a, 'rib', 'a_verifier');
    for (const verdict of [
      { decision: 'valider' },
      { decision: 'refuser', motif: 'illisible' },
    ] as const)
      expect(
        await motif(
          verifierUnePiece(app, { acteur: ADMIN, pieceId: rib, verdict, maintenant: MAINTENANT })
        ),
        verdict.decision
      ).toBe('rib_hors_de_ce_geste');
    expect((await piece(rib)).statut).toBe('a_verifier');
    expect(await evenements(rib)).toEqual([]);
  });

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — une RC pro échue ne se valide pas ; à jour, elle passe', async () => {
    const a = await unApporteur('kyc_en_cours');
    const echue = await unePiece(a, 'rc_pro', 'a_verifier', HIER);
    expect(
      await motif(
        verifierUnePiece(app, {
          acteur: QUALIFIEUR,
          pieceId: echue,
          verdict: { decision: 'valider' },
          maintenant: MAINTENANT,
        })
      )
    ).toBe('echeance_passee');
    const b = await unApporteur('kyc_en_cours');
    const ajour = await unePiece(b, 'rc_pro', 'a_verifier');
    await verifierUnePiece(app, {
      acteur: QUALIFIEUR,
      pieceId: ajour,
      verdict: { decision: 'valider' },
      maintenant: MAINTENANT,
    });
    expect((await piece(ajour)).statut).toBe('valide');
  });

  it('REQ-DM-027 : TÉMOIN — un refus porte son motif fermé au journal ; sans courante, la pièce refusée reste la courante', async () => {
    const a = await unApporteur('kyc_en_cours');
    const id = await unePiece(a, 'identite', 'a_verifier');
    await verifierUnePiece(app, {
      acteur: QUALIFIEUR,
      pieceId: id,
      verdict: { decision: 'refuser', motif: 'illisible' },
      maintenant: MAINTENANT,
    });
    expect(await piece(id)).toMatchObject({ statut: 'refusee', remplaceeAt: null });
    expect((await evenements(id))[0]!.charge).toMatchObject({
      vers: 'refusee',
      motifRefus: 'illisible',
    });
  });

  it('REQ-DM-027 : TÉMOIN — un refus À CÔTÉ d’une courante écarte la refusée : l’ancienne reste la seule courante', async () => {
    const a = await unApporteur('kyc_en_cours');
    const ancien = await unePiece(a, 'siret', 'valide');
    const nouveau = await unePiece(a, 'siret', 'a_verifier');
    await verifierUnePiece(app, {
      acteur: QUALIFIEUR,
      pieceId: nouveau,
      verdict: { decision: 'refuser', motif: 'au_nom_d_un_tiers' },
      maintenant: MAINTENANT,
    });
    expect(await piece(nouveau)).toMatchObject({ statut: 'refusee', remplaceeAt: MAINTENANT });
    expect(await piece(ancien)).toMatchObject({ statut: 'valide', remplaceeAt: null });
  });

  it('REQ-DM-027 : TÉMOIN — valider à côté d’une courante écarte l’ANCIENNE : la nouvelle devient la seule courante', async () => {
    const a = await unApporteur('kyc_en_cours');
    const ancien = await unePiece(a, 'siret', 'valide');
    const nouveau = await unePiece(a, 'siret', 'a_verifier');
    await verifierUnePiece(app, {
      acteur: QUALIFIEUR,
      pieceId: nouveau,
      verdict: { decision: 'valider' },
      maintenant: MAINTENANT,
    });
    expect(await piece(ancien)).toMatchObject({ remplaceeAt: MAINTENANT });
    expect(await piece(nouveau)).toMatchObject({ statut: 'valide', remplaceeAt: null });
  });

  it('REQ-DM-027 : TÉMOIN — une pièce qui n’est pas à vérifier, une pièce inconnue, un rôle non nommé : refusés, sans événement', async () => {
    const a = await unApporteur('kyc_en_cours');
    const valide = await unePiece(a, 'siret', 'valide');
    const verdict = { decision: 'valider' } as const;
    expect(
      await motif(
        verifierUnePiece(app, {
          acteur: QUALIFIEUR,
          pieceId: valide,
          verdict,
          maintenant: MAINTENANT,
        })
      )
    ).toBe('piece_pas_a_verifier');
    expect(
      await motif(
        verifierUnePiece(app, {
          acteur: QUALIFIEUR,
          pieceId: randomUUID(),
          verdict,
          maintenant: MAINTENANT,
        })
      )
    ).toBe('introuvable');
    const aVerifier = await unePiece(a, 'tva', 'a_verifier');
    expect(
      await motif(
        verifierUnePiece(app, {
          acteur: LECTEUR,
          pieceId: aVerifier,
          verdict,
          maintenant: MAINTENANT,
        })
      )
    ).toBe('droit_absent');
    expect(await evenements(aVerifier)).toEqual([]);
  });
});

describe('REQ-DM-027 — ouvrir et valider le KYC, par la matrice des statuts', () => {
  it('REQ-DM-027 : TÉMOIN À DEUX FACES — ouvrir le KYC d’un candidat est refusé ; d’un retenu, il passe à kyc_en_cours, avec l’événement', async () => {
    const candidat = await unApporteur('candidat');
    expect(
      await motif(
        ouvrirLeKyc(app, { acteur: ADMIN, apporteurId: candidat, maintenant: MAINTENANT })
      )
    ).toBe('transition_refusee');
    const retenu = await unApporteur('retenu');
    await ouvrirLeKyc(app, { acteur: ADMIN, apporteurId: retenu, maintenant: MAINTENANT });
    expect(await statutDe(retenu)).toBe('kyc_en_cours');
    const [e] = await evenements(retenu);
    expect(e!.charge).toEqual({
      de: 'retenu',
      vers: 'kyc_en_cours',
      transition: 'ouvrir_kyc',
      acteur: { par: 'utilisateur_console', id: ADMIN.id },
    });
  });

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — valider le KYC nomme chaque pièce manquante ; complet, il passe à pret_a_signer', async () => {
    const a = await unApporteur('kyc_en_cours');
    await uneIdentite(a, 'assujetti');
    await unePiece(a, 'siret', 'valide');
    await unePiece(a, 'identite', 'valide');
    const valider = () =>
      validerLeKyc(app, { acteur: ADMIN, apporteurId: a, maintenant: MAINTENANT });
    // Manquent : le RIB (même pas déposé), la TVA (assujetti), la RC pro.
    expect(await motif(valider())).toBe('pieces_manquantes:tva,rib,rc_pro');
    expect(await statutDe(a)).toBe('kyc_en_cours');
    await unePiece(a, 'tva', 'valide');
    await unePiece(a, 'rc_pro', 'valide');
    // Un RIB DÉPOSÉ suffit (la juriste) : sa vérification conditionne le versement, pas la signature.
    await unePiece(a, 'rib', 'a_verifier');
    await valider();
    expect(await statutDe(a)).toBe('pret_a_signer');
    expect((await evenements(a)).at(-1)!.charge).toMatchObject({
      de: 'kyc_en_cours',
      vers: 'pret_a_signer',
      transition: 'valider_kyc',
    });
  });

  it('REQ-DM-027 : TÉMOIN — sous franchise, la TVA n’est pas exigée ; une RC pro échue ne compte pas', async () => {
    const a = await unApporteur('kyc_en_cours');
    await uneIdentite(a, 'franchise_293b');
    await unePiece(a, 'siret', 'valide');
    await unePiece(a, 'identite', 'valide');
    await unePiece(a, 'rib', 'valide');
    await unePiece(a, 'rc_pro', 'valide', HIER);
    expect(
      await motif(validerLeKyc(app, { acteur: ADMIN, apporteurId: a, maintenant: MAINTENANT }))
    ).toBe('pieces_manquantes:rc_pro');
  });

  it('REQ-DM-027 : TÉMOIN — ouvrir ou valider sans le droit est refusé, rien n’avance', async () => {
    const a = await unApporteur('retenu');
    expect(
      await motif(ouvrirLeKyc(app, { acteur: LECTEUR, apporteurId: a, maintenant: MAINTENANT }))
    ).toBe('droit_absent');
    expect(
      await motif(validerLeKyc(app, { acteur: LECTEUR, apporteurId: a, maintenant: MAINTENANT }))
    ).toBe('droit_absent');
    expect(await statutDe(a)).toBe('retenu');
    expect(await evenements(a)).toEqual([]);
  });
});

describe('REQ-UX-047 — le dossier lu pour l’écran', () => {
  it('REQ-UX-047 : le dossier dit le statut, le SIREN, les pièces et ce qui manque ; jamais l’IBAN', async () => {
    const a = await unApporteur('kyc_en_cours');
    await uneIdentite(a, 'franchise_293b');
    await unePiece(a, 'siret', 'valide');
    const dossier = await lireLeDossier(app, { apporteurId: a, maintenant: MAINTENANT });
    expect(dossier).toMatchObject({
      statut: 'kyc_en_cours',
      identite: { siren: '552100554', regimeTva: 'franchise_293b' },
      manques: ['rib', 'identite', 'rc_pro'],
    });
    expect(JSON.stringify(dossier)).not.toMatch(/iban/i);
    expect(await lireLeDossier(app, { apporteurId: randomUUID(), maintenant: MAINTENANT })).toBe(
      null
    );
  });
});

describe('REQ-DM-027 — aucun chemin de code ne valide un RIB (condition de la sécurité)', () => {
  /** Les sources TypeScript de `src/`, lues sur le disque. */
  function sources(dossier = 'src'): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return sources(chemin);
      return /\.tsx?$/.test(e.name) ? [chemin] : [];
    });
  }
  const ECRITURE_DE_PIECE =
    /pieceKyc\.(create|createMany|update|updateMany|upsert)\b|(UPDATE|INSERT\s+INTO)\s+"?pieces_kyc/;

  it('REQ-DM-027 : TÉMOIN — les SEULS écrivains des pièces sont le dossier de conformité, qui refuse le RIB avant toute écriture, et le RIB à quatre yeux, qui refuse tout autre type avant toute écriture', () => {
    // CPL-T24 (sécurité, #705, 5981204995) : `rib.ts`, ET LUI SEUL, est admis comme second écrivain ;
    // jamais un motif (`src/server/conformite/*`).
    const ecrivains = sources()
      .filter((f) => ECRITURE_DE_PIECE.test(readFileSync(f, 'utf8')))
      .sort();
    expect(ecrivains).toEqual(['src/server/conformite/dossier.ts', 'src/server/conformite/rib.ts']);
    const texte = readFileSync('src/server/conformite/dossier.ts', 'utf8');
    const refus = texte.indexOf("if (piece.type === 'rib') throw");
    expect(refus).toBeGreaterThan(0);
    expect(refus).toBeLessThan(texte.search(ECRITURE_DE_PIECE));
    // La règle symétrique : dans CHAQUE geste de rib.ts qui écrit une pièce, le refus d'un autre type
    // précède la première écriture.
    const gestes = readFileSync('src/server/conformite/rib.ts', 'utf8')
      .split(/\n(?=export async function )/)
      .filter((g) => ECRITURE_DE_PIECE.test(g));
    expect(gestes.length).toBe(2);
    for (const g of gestes) {
      const refusDuType = g.indexOf("if (piece.type !== 'rib') throw");
      expect(refusDuType, g.slice(0, 60)).toBeGreaterThan(0);
      expect(refusDuType, g.slice(0, 60)).toBeLessThan(g.search(ECRITURE_DE_PIECE));
    }
  });

  it('REQ-DM-027 : TÉMOIN — la règle rougit sur un second écrivain', () => {
    expect(ECRITURE_DE_PIECE.test("await tx.pieceKyc.update({ data: { statut: 'valide' } })")).toBe(
      true
    );
    expect(ECRITURE_DE_PIECE.test('UPDATE "pieces_kyc" SET statut = \'valide\'')).toBe(true);
    expect(ECRITURE_DE_PIECE.test('tx.pieceKyc.findMany({})')).toBe(false);
  });
});
