// @req REQ-JUR-031
/**
 * JUR-T58 (REQ-JUR-031) — l'effet d'une anomalie confirmée, contre la base RÉELLE.
 *   — l'ANNULATION pour fabrication passe une attribution confirmée et SIGNÉE à `annulee` (art. 3.3,
 *     juriste, #474, 6037559862), et notifie UNE fois, au bon apporteur, `decision_attribution`, avec
 *     l'anomalie pour ses faits ;
 *   — JOURNAL PSEUDONYME (rattrapage 85) : l'effet est écrit dans une transaction DISTINCTE de la
 *     clôture de l'anomalie. TÉMOIN par la colonne système `xmin` d'`evenements` ;
 *   — un refus (anomalie non confirmée) n'écrit rien.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { ajouterEvenement } from '../../src/server/evenement/journal';
import { appliquerLEffetDUneAnomalie, type DecisionDEffet } from '../../src/server/anomalie/effets';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';

let base: Base;
let adminId: string;
let grilleId: string;

const MAINTENANT = new Date('2026-10-08T09:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-jur-t58-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});

let sirens = 652100000;
const unSiren = () => String((sirens += 1));

beforeAll(async () => {
  base = await demarrerBase();
  const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    MAINTENANT
  );
  adminId = admin!.id;
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: MAINTENANT,
        importeeAt: MAINTENANT,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

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
        creeAt: MAINTENANT,
      },
    })
  ).id;
}

/** Une attribution confirmée et SIGNÉE : l'annulation pour fraude vaut après la confirmation. */
async function uneAttributionSignee(apporteurId: string): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare, confirmee_at,
       fenetre_fin_at)
     VALUES ($1::uuid, $2::uuid, 'signee'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false, $13, $14)`,
    id,
    apporteurId,
    unSiren(),
    grilleId,
    bloc(),
    bloc(),
    bloc(),
    hex(32),
    bloc(),
    hex(32),
    bloc(),
    bloc(),
    MAINTENANT,
    new Date('2027-04-08T09:00:00.000Z')
  );
  return id;
}

/** Une anomalie de sincérité ouverte, puis CLOSE (confirmée) dans SA transaction. */
async function uneAnomalieConfirmee(apporteurId: string, attributionId: string): Promise<string> {
  const id = (
    await base.prisma.anomalie.create({
      data: { type: 'sincerite', score: 60, apporteurId, attributionId, ouverteAt: MAINTENANT },
    })
  ).id;
  await base.prisma.$transaction(async (tx) => {
    await tx.anomalie.update({
      where: { id },
      data: {
        statut: 'confirmee',
        traiteAt: MAINTENANT,
        traiteParId: adminId,
        justificationChiffre: Buffer.from([1]),
      },
    });
    await ajouterEvenement(tx, {
      type: 'anomalie_statut_modifie',
      agregat: 'anomalie',
      agregatId: id,
      survenuAt: MAINTENANT,
      charge: { de: 'ouverte', vers: 'confirmee', acteur: { par: 'utilisateur_console' } },
    });
  });
  return id;
}

const xminDe = async (agregatId: string, type: string): Promise<string[]> =>
  (
    await base.prisma.$queryRawUnsafe<{ xmin: string }[]>(
      `SELECT xmin::text AS xmin FROM evenements WHERE agregat_id = $1::uuid AND type::text = $2`,
      agregatId,
      type
    )
  ).map((l) => l.xmin);

const annulation = (anomalieId: string): DecisionDEffet => ({
  effet: 'annulation_pour_fabrication',
  anomalieId,
  acteur: { par: 'utilisateur_console', id: adminId },
  maintenant: MAINTENANT,
});

describe('REQ-JUR-031 — l’annulation pour fabrication, sur la base réelle', () => {
  it('REQ-JUR-031 : TÉMOIN — une attribution SIGNÉE passe à `annulee`, et UNE notification part, au bon apporteur, avec l’anomalie', async () => {
    const apporteurId = await unApporteur();
    const autre = await unApporteur();
    const attributionId = await uneAttributionSignee(apporteurId);
    const anomalieId = await uneAnomalieConfirmee(apporteurId, attributionId);
    await appliquerLEffetDUneAnomalie(base.prisma, annulation(anomalieId), CLES);
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } });
    expect(a.statut).toBe('annulee');
    const notes = await base.prisma.notificationEspace.findMany({ where: { attributionId } });
    expect(notes.map((n) => [n.cle, n.apporteurId, n.anomalieId])).toEqual([
      ['decision_attribution', apporteurId, anomalieId],
    ]);
    expect(await base.prisma.notificationEspace.count({ where: { apporteurId: autre } })).toBe(0);
  });

  it('REQ-JUR-031 : TÉMOIN `xmin` — la clôture et l’effet sont écrits dans DEUX transactions distinctes', async () => {
    const apporteurId = await unApporteur();
    const attributionId = await uneAttributionSignee(apporteurId);
    const anomalieId = await uneAnomalieConfirmee(apporteurId, attributionId);
    await appliquerLEffetDUneAnomalie(base.prisma, annulation(anomalieId), CLES);
    const cloture = await xminDe(anomalieId, 'anomalie_statut_modifie');
    const effet = await xminDe(attributionId, 'attribution_etat_modifie');
    expect(cloture).toHaveLength(1);
    expect(effet).toHaveLength(1);
    expect(effet[0]).not.toBe(cloture[0]);
  });

  it('REQ-JUR-031 : TÉMOIN — une anomalie OUVERTE ne fonde aucun effet : refusé, rien n’est écrit', async () => {
    const apporteurId = await unApporteur();
    const attributionId = await uneAttributionSignee(apporteurId);
    const anomalieId = (
      await base.prisma.anomalie.create({
        data: { type: 'sincerite', score: 60, apporteurId, attributionId, ouverteAt: MAINTENANT },
      })
    ).id;
    await expect(
      appliquerLEffetDUneAnomalie(base.prisma, annulation(anomalieId), CLES)
    ).rejects.toThrow(/anomalie_non_confirmee/);
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } });
    expect(a.statut).toBe('signee');
    expect(await xminDe(attributionId, 'attribution_etat_modifie')).toEqual([]);
    expect(await base.prisma.notificationEspace.count({ where: { attributionId } })).toBe(0);
  });
});
