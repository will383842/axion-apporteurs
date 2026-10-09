// @req REQ-DM-006
/**
 * DM-73 — la commande signée sur une attribution `provisoire` (contrat v2, art. 3.2 et 12.3), en base
 * RÉELLE.
 *
 * CE QU'IL PROUVE (témoins de la juriste et d'A02, #824) :
 *   — une commande signée sur une provisoire la CONFIRME (`confirmee_par_la_commande`, datée de la
 *     signature) puis la SIGNE (`devis_signe`), dans la MÊME transaction, deux faits dans cet ordre ;
 *     la fenêtre court de la signature, pas du passage ; aucune commande n'est refusée pour ce motif ;
 *   — une provisoire qui a reçu une commande avant la fin du contrat n'est pas annulée par la fin :
 *     elle est figée, et la commande ouvre droit ; une provisoire sans commande est annulée ;
 *   — le conseiller ne déclenche pas `confirmee_par_la_commande` ;
 *   — voie (b) : la commande signée avant la fin mais reçue après ne fait pas revenir l'attribution ;
 *     le droit ne reste ouvert qu'après une annulation de FIN DE CONTRAT, jamais après l'antériorité
 *     ou la fraude (art. 3.3, 3.7).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { enregistrerLaCommandeSignee } from '../../src/server/attribution/transitionner';
import { resilierUnApporteur } from '../../src/server/apporteur/resiliation';
import {
  ajouterMoisParis,
  transitionnerAttribution,
  ErreurTransitionAttribution,
} from '../../src/domain/attribution/machine';
import {
  laCommandeTardiveOuvreDroit,
  ouvreDroitALaCommission,
} from '../../src/domain/apporteur/effets-de-la-fin';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';

let base: Base;
let grilleId: string;
let consoleId: string;

const SIGNEE_LE = new Date('2026-10-05T09:30:00.000Z');
const MAINTENANT = new Date('2026-10-07T14:00:00.000Z');
const FIN = new Date('2026-10-08T10:00:00.000Z');
const SYSTEME = { par: 'systeme' } as const;
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 730000000;
const unSiren = () => String((sirens += 1));
const annulee = new Error('annulee');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm-73-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});

beforeAll(async () => {
  base = await demarrerBase();
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
  consoleId = (
    await base.prisma.utilisateurConsole.create({
      data: {
        role: 'admin',
        creeAt: MAINTENANT,
        valideAt: MAINTENANT,
        emailChiffre: Buffer.from([1]),
        emailHash: hex(32),
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

/** Une provisoire d'apporteur, par SQL brut. */
async function uneProvisoire(apporteurId: string): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'espace', $4::uuid,
       '2026-10-01', false, false, false)`,
    id,
    apporteurId,
    unSiren(),
    grilleId
  );
  return id;
}

async function faits(id: string) {
  return base.prisma.$queryRawUnsafe<{ charge: Record<string, unknown> }[]>(
    `SELECT charge FROM evenements
     WHERE agregat_id = $1::uuid AND type = 'attribution_etat_modifie' ORDER BY id`,
    id
  );
}

const signer = (attributionId: string) =>
  base.prisma.$transaction((tx) =>
    enregistrerLaCommandeSignee(tx, {
      attributionId,
      signeLe: SIGNEE_LE,
      acteur: SYSTEME,
      maintenant: MAINTENANT,
    })
  );

const resilier = (apporteurId: string) =>
  base.prisma.$transaction((tx) =>
    resilierUnApporteur(
      tx,
      {
        apporteurId,
        motif: 'ordinaire_apporteur',
        dateReception: FIN,
        acteur: { par: 'utilisateur_console', id: consoleId },
        maintenant: FIN,
      },
      CLES
    )
  );

describe('REQ-DM-006 — une commande signée confirme la provisoire, puis la signe (art. 3.2)', () => {
  it('REQ-DM-006 : TÉMOIN — confirmee_par_la_commande puis devis_signe, en une transaction, dans cet ordre', async () => {
    const id = await uneProvisoire(await unApporteur());
    const r = await signer(id);
    expect(r).toStrictEqual({ de: 'provisoire', vers: 'signee' });
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect(a.statut).toBe('signee');
    const f = await faits(id);
    expect(f.map((e) => e.charge)).toMatchObject([
      { de: 'provisoire', vers: 'active', transition: 'confirmee_par_la_commande' },
      { de: 'active', vers: 'signee', transition: 'devis_signe' },
    ]);
  });

  it('REQ-DM-006 : TÉMOIN — confirmee_at est l’instant de la signature, et la fenêtre court de lui', async () => {
    const id = await uneProvisoire(await unApporteur());
    await signer(id);
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect(a.confirmeeAt).toEqual(SIGNEE_LE);
    expect(a.fenetreFinAt).toEqual(
      new Date(ajouterMoisParis(SIGNEE_LE.getTime(), SEUILS.FENETRE_MOIS.valeur))
    );
  });

  it('REQ-DM-006 : TÉMOIN — la transaction annulée ne laisse ni état ni fait', async () => {
    const id = await uneProvisoire(await unApporteur());
    await base.prisma
      .$transaction(async (tx) => {
        await enregistrerLaCommandeSignee(tx, {
          attributionId: id,
          signeLe: SIGNEE_LE,
          acteur: SYSTEME,
          maintenant: MAINTENANT,
        });
        throw annulee;
      })
      .catch((e: unknown) => {
        if (e !== annulee) throw e;
      });
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect(a.statut).toBe('provisoire');
    expect(a.confirmeeAt).toBeNull();
    expect(await faits(id)).toHaveLength(0);
  });

  it('REQ-DM-006 : TÉMOIN — le conseiller ne déclenche pas confirmee_par_la_commande', () => {
    expect(() =>
      transitionnerAttribution({
        de: 'provisoire',
        transition: 'confirmee_par_la_commande',
        porteur: 'conseiller',
      })
    ).toThrow(ErreurTransitionAttribution);
    expect(
      transitionnerAttribution({
        de: 'provisoire',
        transition: 'confirmee_par_la_commande',
        porteur: 'apporteur',
      })
    ).toBe('active');
  });
});

describe('REQ-DM-006 — la fin du contrat n’annule que la provisoire sans commande (art. 12.1, 12.3)', () => {
  it('REQ-DM-006 : TÉMOIN — une provisoire avec une commande signée avant la fin n’est pas annulée, et elle ouvre droit', async () => {
    const apporteurId = await unApporteur();
    const id = await uneProvisoire(apporteurId);
    await signer(id);
    await resilier(apporteurId);
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect(a.statut).toBe('figee_resiliation');
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: SIGNEE_LE.getTime(),
        finDuContrat: FIN.getTime(),
      })
    ).toBe(true);
  });

  it('REQ-DM-006 : TÉMOIN — une provisoire sans commande est annulée à la fin', async () => {
    const apporteurId = await unApporteur();
    const id = await uneProvisoire(apporteurId);
    await resilier(apporteurId);
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect(a.statut).toBe('annulee');
    expect((await faits(id)).at(-1)!.charge).toMatchObject({ transition: 'fin_de_contrat' });
  });
});

describe('REQ-DM-006 — la commande signée avant la fin, reçue après l’annulation : voie (b)', () => {
  it('REQ-DM-006 : TÉMOIN — l’attribution annulée ne revient pas ; rien n’est écrit', async () => {
    const apporteurId = await unApporteur();
    const id = await uneProvisoire(apporteurId);
    await resilier(apporteurId);
    const avant = (await faits(id)).length;
    await expect(signer(id)).rejects.toThrow(ErreurTransitionAttribution);
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect(a.statut).toBe('annulee');
    expect(await faits(id)).toHaveLength(avant);
  });

  it('REQ-DM-006 : TÉMOIN — le droit reste ouvert après une annulation de fin de contrat, signée avant la fin', () => {
    const commande = { commandeSigneeAt: SIGNEE_LE.getTime(), finDuContrat: FIN.getTime() };
    expect(laCommandeTardiveOuvreDroit({ ...commande, sortie: 'fin_de_contrat' })).toBe(true);
    expect(
      laCommandeTardiveOuvreDroit({
        ...commande,
        commandeSigneeAt: FIN.getTime(),
        sortie: 'fin_de_contrat',
      })
    ).toBe(false);
  });

  it('REQ-DM-006 : TÉMOIN — après l’antériorité ou la fraude (art. 3.3, 3.7), la même commande n’ouvre aucun droit', () => {
    const commande = { commandeSigneeAt: SIGNEE_LE.getTime(), finDuContrat: FIN.getTime() };
    for (const sortie of [
      'anteriorite_etablie',
      'fraude_etablie',
      'annulee_erreur_identification',
    ] as const) {
      expect(laCommandeTardiveOuvreDroit({ ...commande, sortie }), sortie).toBe(false);
    }
  });
});
