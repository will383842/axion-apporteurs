// @req REQ-SEC-017
// @req REQ-DM-033
// @req REQ-SEC-038
// @req REQ-SEC-036
/**
 * SEC-14 — l'ouverture d'une anomalie de sincérité, contre la base RÉELLE.
 *
 * CE QU'IL PROUVE :
 *   — la FRONTIÈRE : un score d'une unité sous le seuil n'ouvre rien ; au seuil, UNE anomalie
 *     `sincerite`, `ouverte`, au score calculé, rattachée à l'attribution et à son apporteur ;
 *   — AUCUN effet défavorable automatique : le statut de l'apporteur ne bouge pas, son jeton de
 *     dépôt n'est pas révoqué, aucun événement de l'agrégat apporteur n'est écrit ;
 *   — l'événement d'ouverture porte l'état seul (`de` nul, `ouverte`, le système), jamais
 *     l'apporteur, l'attribution ni le score ;
 *   — l'ouverture est un traitement DISTINCT et DIFFÉRÉ : aucun événement de l'agrégat `anomalie`
 *     ne partage une transaction (colonne système `xmin`) avec un événement de l'agrégat
 *     `apporteur`, écrit ici dans la transaction qui simule le dépôt ;
 *   — un second passage n'ouvre rien de plus ; sans réglage, rien n'est jugé ; hors du recul,
 *     rien n'est jugé.
 *
 * Le réglage est une valeur de TÉMOIN, choisie pour placer chaque dépôt d'un côté ou de l'autre de
 * la frontière : les réglages réels vivent hors du dépôt (REQ-GOV-031).
 *
 * Joué par Gate D, sur la base fraîchement migrée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { ajouterEvenement } from '../../src/server/evenement/journal';
import {
  empreinteurDeDirigeants,
  normaliserNomDeDirigeant,
} from '../../src/server/integrations/recherche-entreprises/projection';
import {
  lireReglageDeSincerite,
  ouvrirLesAnomaliesDeSincerite,
  type ReglageDeSincerite,
} from '../../src/server/anomalie/sincerite';

let base: Base;
let app: PrismaClient;
let grilleId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 610000000;
const unSiren = () => String((sirens += 7));

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-14-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'a'.repeat(64),
});

/**
 * Le réglage de TÉMOIN : le contact égal à un dirigeant pèse une unité sous le seuil, le texte court
 * pèse l'unité qui manque. Les trois autres signaux n'ont pas de poids : ils ne jouent pas ici.
 */
const REGLAGE: ReglageDeSincerite = (() => {
  const r = lireReglageDeSincerite(
    'seuil=50;texte_min=20;tranche_minutes=60;suite_min=3;recul_heures=72;' +
      'poids.contact_dirigeant=49;poids.texte_court_ou_identique=1'
  );
  if (r === null) throw new Error('réglage de témoin illisible');
  return r;
})();

/** L'empreinte d'un dirigeant, par le PRODUCTEUR réel (INT-T09), sous la clé des empreintes. */
const empreinteDeDirigeant = (nom: string, prenoms: string) =>
  empreinteurDeDirigeants(CLES.empreintes)(normaliserNomDeDirigeant(nom, prenoms));

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'signe',
        codeParrainage: `AX${hex(3).toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: new Date('2026-10-01T08:00:00.000Z'),
      },
    })
  ).id;
}

/**
 * Un dépôt : l'attribution, son contact chiffré par `colonnesPii` pour SA ligne, et — dans la MÊME
 * transaction, comme le fera la transaction de dépôt — un événement de l'agrégat apporteur. Aucun
 * défaut sur ce que les témoins font varier (RM-11) : le contact, le contexte et les dirigeants sont
 * nommés à chaque appel.
 */
async function unDepot(d: {
  apporteurId: string;
  nomContact: string;
  prenomContact: string;
  contexte: string;
  dirigeants: readonly string[];
}): Promise<string> {
  const id = randomUUID();
  const pii = colonnesPii(
    { modele: 'attribution', id },
    { nomContact: d.nomContact, prenomContact: d.prenomContact, contexte: d.contexte },
    CLES
  );
  const dirigeantsJson = JSON.stringify(
    d.dirigeants.map((empreinte) => ({ empreinte, qualite: 'Président' }))
  );
  await base.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
         date_contact, verification_prioritaire, entreprise_a_verifier, raison_sociale,
         nom_contact_chiffre, prenom_contact_chiffre, contexte_chiffre, lien_interet_declare,
         ip_hash, agent_hash, dirigeants_json)
       VALUES ($1::uuid, $2::uuid, 'provisoire', $3, 'espace', $4::uuid, '2026-10-01', false,
         false, $5, $6, $7, $8, false, $9, $10, $11::jsonb)`,
      id,
      d.apporteurId,
      unSiren(),
      grilleId,
      `Témoin ${id.slice(0, 8)}`,
      pii.nomContactChiffre,
      pii.prenomContactChiffre,
      pii.contexteChiffre,
      hex(8),
      hex(32),
      dirigeantsJson
    );
    // La forme de NAISSANCE est la seule que le schéma de la charge admet sans lire la matrice ;
    // ce qui compte ici est un événement de l'agrégat apporteur dans la transaction du dépôt.
    await ajouterEvenement(tx, {
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: d.apporteurId,
      survenuAt: new Date(),
      charge: { de: null, vers: 'signe', transition: 'creer', acteur: { par: 'systeme' } },
    });
  });
  return id;
}

let p1: string;
let p2: string;
let jetonDeP1: string;
let sousLeSeuil: string;
let auSeuil: string;
let neutre: string;
let premierPassage: { jugees: number; ouvertes: number };

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: new Date('2026-10-01T08:00:00.000Z'),
        importeeAt: new Date('2026-10-01T08:00:00.000Z'),
      },
    })
  ).id;
  p1 = await unApporteur();
  p2 = await unApporteur();
  jetonDeP1 = (
    await base.prisma.jetonDepot.create({
      data: { apporteurId: p1, tokenHash: hex(32), creeAt: new Date('2026-10-01T08:00:00.000Z') },
    })
  ).id;

  const dirigeant = empreinteDeDirigeant('Durand', 'Alice');
  sousLeSeuil = await unDepot({
    apporteurId: p1,
    nomContact: 'Durand',
    prenomContact: 'Alice',
    contexte: 'Rencontre au salon régional, échange sur le renouvellement de leur parc.',
    dirigeants: [dirigeant],
  });
  auSeuil = await unDepot({
    apporteurId: p1,
    nomContact: 'DURAND',
    prenomContact: 'alice',
    contexte: 'vu hier',
    dirigeants: [dirigeant],
  });
  neutre = await unDepot({
    apporteurId: p2,
    nomContact: 'Martin',
    prenomContact: 'Claire',
    contexte: 'Appel entrant après une recommandation de leur expert-comptable habituel.',
    dirigeants: [dirigeant],
  });
  premierPassage = await ouvrirLesAnomaliesDeSincerite(app, {
    maintenant: new Date(Date.now() + 60_000),
    reglage: REGLAGE,
    cles: CLES,
  });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

const anomaliesDe = (attributionId: string) =>
  base.prisma.anomalie.findMany({ where: { attributionId } });

describe('REQ-SEC-017 — la frontière du seuil : seuil moins un, rien ; au seuil, une anomalie OUVERTE', () => {
  it('REQ-SEC-017 : le passage a jugé les trois dépôts et en a ouvert un seul', () => {
    expect(premierPassage).toEqual({ jugees: 3, ouvertes: 1 });
  });

  it('REQ-SEC-017 : un score d’une unité sous le seuil n’ouvre aucune anomalie', async () => {
    expect(await anomaliesDe(sousLeSeuil)).toEqual([]);
    expect(await anomaliesDe(neutre)).toEqual([]);
  });

  it('REQ-SEC-017 REQ-DM-033 : au seuil, UNE anomalie sincerite, ouverte, au score calculé, rattachée au dépôt et à son apporteur', async () => {
    const [a, ...autres] = await anomaliesDe(auSeuil);
    expect(autres).toEqual([]);
    expect(a).toMatchObject({
      type: 'sincerite',
      statut: 'ouverte',
      score: REGLAGE.seuil,
      apporteurId: p1,
      attributionId: auSeuil,
      traiteAt: null,
      traiteParId: null,
      justificationChiffre: null,
    });
  });
});

describe('REQ-SEC-017 REQ-SEC-038 REQ-DM-033 — aucun effet défavorable automatique', () => {
  it('REQ-SEC-017 : le statut de l’apporteur ne bouge pas', async () => {
    const p = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: p1 } });
    expect(p.statut).toBe('signe');
  });

  it('REQ-SEC-017 : TÉMOIN — aucun jeton de dépôt n’est révoqué', async () => {
    const j = await base.prisma.jetonDepot.findUniqueOrThrow({ where: { id: jetonDeP1 } });
    expect(j.revoqueAt).toBeNull();
  });

  it('REQ-SEC-038 : le passage n’écrit aucun événement de l’agrégat apporteur : seuls ceux des dépôts existent', async () => {
    const deApporteur = await base.prisma.evenement.count({ where: { agregat: 'apporteur' } });
    expect(deApporteur).toBe(3);
  });

  it('REQ-DM-033 : l’événement d’ouverture porte l’état seul — ni apporteur, ni attribution, ni score', async () => {
    const [a] = await anomaliesDe(auSeuil);
    const evts = await base.prisma.evenement.findMany({
      where: { agregat: 'anomalie', agregatId: a!.id },
    });
    expect(evts).toHaveLength(1);
    expect(evts[0]!.type).toBe('anomalie_statut_modifie');
    expect(evts[0]!.charge).toEqual({ de: null, vers: 'ouverte', acteur: { par: 'systeme' } });
    const texte = JSON.stringify(evts[0]!.charge);
    for (const fuite of [p1, auSeuil, String(REGLAGE.seuil)]) expect(texte).not.toContain(fuite);
  });
});

describe('REQ-DM-033 — un traitement DISTINCT et DIFFÉRÉ, jamais la transaction du dépôt', () => {
  it('REQ-DM-033 : TÉMOIN — aucun événement de l’agrégat anomalie ne partage une transaction (xmin) avec un événement de l’agrégat apporteur', async () => {
    const lignes = await base.prisma.$queryRaw<{ agregat: string; tx: string }[]>`
      SELECT agregat::text AS agregat, xmin::text AS tx FROM evenements
      WHERE agregat IN ('anomalie', 'apporteur')`;
    const deAnomalie = new Set(lignes.filter((l) => l.agregat === 'anomalie').map((l) => l.tx));
    const dApporteur = new Set(lignes.filter((l) => l.agregat === 'apporteur').map((l) => l.tx));
    expect(deAnomalie.size).toBeGreaterThan(0);
    expect(dApporteur.size).toBeGreaterThan(0);
    expect([...deAnomalie].filter((t) => dApporteur.has(t))).toEqual([]);
  });

  it('REQ-DM-033 : TÉMOIN — la mesure xmin voit bien deux événements écrits dans une même transaction', async () => {
    // Le contre-témoin de la mesure : deux événements d'une même transaction partagent leur xmin.
    // Sans lui, un `xmin` toujours distinct ferait passer le témoin précédent sans rien prouver.
    await base.prisma.$transaction(async (tx) => {
      for (let i = 0; i < 2; i += 1) {
        await ajouterEvenement(tx, {
          type: 'anomalie_gel_modifie',
          agregat: 'anomalie',
          agregatId: randomUUID(),
          survenuAt: new Date(),
          charge: { vers: 'gel_pose', acteur: { par: 'systeme' } },
        });
      }
    });
    const [l] = await base.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(DISTINCT xmin::text) AS n FROM (
        SELECT xmin FROM evenements WHERE type = 'anomalie_gel_modifie' ORDER BY id DESC LIMIT 2
      ) s`;
    expect(Number(l!.n)).toBe(1);
  });
});

describe('REQ-SEC-017 — un passage idempotent, borné, et fermé sans réglage', () => {
  it('REQ-SEC-017 : un second passage n’ouvre rien de plus et n’écrit aucun événement', async () => {
    const avant = await base.prisma.evenement.count();
    const r = await ouvrirLesAnomaliesDeSincerite(app, {
      maintenant: new Date(Date.now() + 60_000),
      reglage: REGLAGE,
      cles: CLES,
    });
    expect(r.ouvertes).toBe(0);
    expect(await anomaliesDe(auSeuil)).toHaveLength(1);
    expect(await base.prisma.evenement.count()).toBe(avant);
  });

  it('REQ-SEC-017 : sans réglage, rien n’est jugé ni ouvert', async () => {
    const r = await ouvrirLesAnomaliesDeSincerite(app, {
      maintenant: new Date(Date.now() + 60_000),
      reglage: null,
      cles: CLES,
    });
    expect(r).toEqual({ jugees: 0, ouvertes: 0 });
  });

  it('REQ-SEC-017 : un dépôt plus ancien que le recul n’est plus jugé', async () => {
    const r = await ouvrirLesAnomaliesDeSincerite(app, {
      maintenant: new Date(Date.now() + (REGLAGE.reculHeures + 1) * 3_600_000),
      reglage: REGLAGE,
      cles: CLES,
    });
    expect(r).toEqual({ jugees: 0, ouvertes: 0 });
  });
});
