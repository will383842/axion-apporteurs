// @req REQ-DM-042 REQ-DM-006 REQ-DM-008
/**
 * DM-24 — la confirmation tacite à trente jours (HYP-W20-TACITE, HYP-C1), horloge FIGÉE.
 *
 * DEUX PARTIES.
 *   — Les règles PURES (`src/domain/attribution/confirmation-tacite.ts`, `src/domain/temps/sla.ts`) :
 *     la réception, l'échéance en jours civils de Paris (changement d'heure compris), la frontière,
 *     la demande signalée et le porteur conseiller. Elles ne touchent pas la base.
 *   — Le passage, contre la base RÉELLE : « tout ce qui est dû à l'instant t » (REQ-QA-027), un seul
 *     événement `attribution_etat_modifie` par promotion, `confirmee_tacitement`, dans la même
 *     transaction que l'état ; la fenêtre court de la promotion ; deux passages, un seul événement.
 *
 * Témoins de l'acceptance : réception à J, échéance moins une minute rien, échéance une seule
 * promotion ; rebond non corrigé, J+90 rien ; correction à J+10 puis envoi sans rebond, promotion à
 * J+40 et pas avant ; clic « Oui » retenu ou appel `confirme` avant l'échéance, aucune promotion
 * tacite ; demande signalée et silencieuse, J+30 et J+45 rien, puis appel `confirme` à J+35, active à
 * J+35 ; le porteur conseiller jamais sélectionné (deux faces).
 *
 * Joué par Gate D, sur la base fraîchement migrée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { ajouterJoursCivilsParis, echeanceOuvree, joursOuvres } from '../../src/domain/temps/sla';
import { MS_PAR_JOUR, MS_PAR_MINUTE } from '../../src/domain/temps/calendrier-civil';
import { depuisParis } from '../../src/domain/temps/paris';
import {
  ETATS_DE_DEMANDE_RECUE,
  echeanceTacite,
  promotionTaciteDue,
  recueAt,
} from '../../src/domain/attribution/confirmation-tacite';
import { transitionnerAttribution } from '../../src/domain/attribution/machine';
import { ETATS_DEMANDE_CONFIRMATION } from '../../src/domain/confirmation/demande';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { confirmerUneAttribution } from '../../src/server/attribution/transitionner';
import { confirmerTacitement } from '../../src/server/jobs/confirmation-tacite';
import { TACHES } from '../../src/server/taches/registre';
import { demarrerBase, type Base } from './harnais';

const JOURS = SEUILS.CONFIRMATION_TACITE_JOURS.valeur;
/** J : un mercredi midi de Paris, en heure d'été ; J+30 tombe après le passage à l'heure d'hiver. */
const J = depuisParis({
  annee: 2026,
  mois: 10,
  jour: 1,
  heure: 12,
  minute: 0,
  seconde: 0,
  milliseconde: 0,
});
const jour = (n: number) => ajouterJoursCivilsParis(J, n);

describe('REQ-DM-042 — les règles pures : réception, échéance, frontière', () => {
  it('REQ-DM-042 : l’échéance est la réception plus CONFIRMATION_TACITE_JOURS jours CIVILS, à la même heure de Paris', () => {
    const echeance = echeanceTacite(J);
    // Le changement d'heure du 25 octobre est franchi : midi de Paris reste midi, l'écart UTC est
    // de trente jours et une heure.
    expect(echeance).toBe(
      depuisParis({
        annee: 2026,
        mois: 10,
        jour: 31,
        heure: 12,
        minute: 0,
        seconde: 0,
        milliseconde: 0,
      })
    );
    expect(echeance - J).toBe(JOURS * MS_PAR_JOUR + 60 * MS_PAR_MINUTE);
  });

  it('REQ-DM-042 : une réception à 23 h 59 de Paris échoit à 23 h 59 du jour dit, jamais le lendemain', () => {
    const tard = depuisParis({
      annee: 2026,
      mois: 10,
      jour: 1,
      heure: 23,
      minute: 59,
      seconde: 0,
      milliseconde: 0,
    });
    expect(echeanceTacite(tard)).toBe(
      depuisParis({
        annee: 2026,
        mois: 10,
        jour: 31,
        heure: 23,
        minute: 59,
        seconde: 0,
        milliseconde: 0,
      })
    );
  });

  it('REQ-DM-042 : joursOuvres est l’alias, en jours, de l’échéance ouvrée en heures', () => {
    expect(joursOuvres(J, 2)).toBe(echeanceOuvree(J, 48));
    expect(joursOuvres(J, 0)).toBe(echeanceOuvree(J, 0));
  });

  it('REQ-DM-042 : seule une demande ENVOYÉE sans rebond ni réponse est reçue ; sa réception est son dernier envoi', () => {
    expect([...ETATS_DE_DEMANDE_RECUE]).toEqual(['envoyee']);
    for (const etat of ETATS_DEMANDE_CONFIRMATION) {
      expect(recueAt({ etat, envoyeeAt: J }), etat).toBe(etat === 'envoyee' ? J : null);
    }
    expect(recueAt({ etat: 'envoyee', envoyeeAt: null })).toBeNull();
  });

  const due = (p: Partial<Parameters<typeof promotionTaciteDue>[0]>) =>
    promotionTaciteDue({
      statut: 'provisoire',
      porteur: 'apporteur',
      demande: { etat: 'envoyee', envoyeeAt: J },
      signalee: false,
      maintenant: echeanceTacite(J),
      ...p,
    });

  it('REQ-DM-042 : frontière — échéance moins une minute, rien ; à l’échéance, due', () => {
    expect(due({ maintenant: echeanceTacite(J) - MS_PAR_MINUTE })).toBe(false);
    expect(due({ maintenant: echeanceTacite(J) })).toBe(true);
  });

  it('REQ-DM-042 : TÉMOIN — une demande SIGNALÉE n’est jamais promue par le seul silence, même à J+45', () => {
    expect(due({ signalee: true, maintenant: jour(JOURS) })).toBe(false);
    expect(due({ signalee: true, maintenant: jour(45) })).toBe(false);
  });

  it('REQ-DM-042 : sans demande, ou demande non reçue (planifiée, retenue, en rebond), aucune échéance', () => {
    expect(due({ demande: null, maintenant: jour(90) })).toBe(false);
    for (const etat of ['planifiee', 'retenue', 'rebond'] as const) {
      expect(due({ demande: { etat, envoyeeAt: J }, maintenant: jour(90) }), etat).toBe(false);
    }
  });

  it('REQ-DM-006 : seule une attribution provisoire est promue', () => {
    for (const statut of ['active', 'en_attente', 'invalidee', 'annulee'] as const) {
      expect(due({ statut, maintenant: jour(90) }), statut).toBe(false);
    }
  });

  it('REQ-DM-042 : TÉMOIN à deux faces — le porteur conseiller n’est jamais sélectionné, et la machine refuserait sa promotion tacite', () => {
    expect(due({ porteur: 'conseiller', maintenant: jour(90) })).toBe(false);
    expect(() =>
      transitionnerAttribution({
        de: 'provisoire',
        transition: 'confirmee_tacitement',
        porteur: 'conseiller',
      })
    ).toThrow();
  });

  it('REQ-DM-042 : le passage est au registre des tâches de fond, sous l’exigence de la confirmation tacite', () => {
    expect(TACHES.confirmation_tacite).toEqual({ req: 'REQ-DM-042' });
  });
});

// ── le passage, contre la base réelle ────────────────────────────────────────────────────────────

describe('REQ-DM-042 REQ-DM-008 — le passage, contre la base réelle', () => {
  let base: Base;
  let grilleId: string;
  let apporteurId: string;
  const hex = (octets: number) => randomBytes(octets).toString('hex');
  let sirens = 830000000;
  const unSiren = () => String((sirens += 13));
  const CLES = clesPii({
    NODE_ENV: 'test',
    ...Object.fromEntries(
      NOMS_DES_SECRETS.map((n) => [n, `temoin-dm-24-${n.toLowerCase()}-`.padEnd(48, '0')])
    ),
    PII_ENCRYPTION_KEY: 'd'.repeat(64),
  });

  beforeAll(async () => {
    base = await demarrerBase();
    grilleId = (
      await base.prisma.grilleCommission.create({
        data: {
          version: 1,
          hash: hex(32),
          contenuJson: { essai: true },
          publieeAt: new Date(J),
          importeeAt: new Date(J),
        },
      })
    ).id;
    apporteurId = (
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
          creeAt: new Date(J),
        },
      })
    ).id;
  }, 180_000);

  afterAll(async () => {
    await base?.arreter();
  });

  /**
   * Un dépôt `provisoire` et sa demande, dans l'état et au dernier envoi donnés. Aucun défaut sur ce
   * que les témoins font varier (RM-11) : l'adresse du contact, l'état et l'envoi sont nommés.
   */
  async function unDepot(d: {
    email: string;
    etat: 'envoyee' | 'rebond' | 'repondue_oui';
    envoyeeAt: number;
  }): Promise<{ attributionId: string; demandeId: string }> {
    const attributionId = randomUUID();
    const pii = colonnesPii({ modele: 'attribution', id: attributionId }, { email: d.email }, CLES);
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
         date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare,
         email_chiffre, email_hash)
       VALUES ($1::uuid, $2::uuid, 'provisoire', $3, 'espace', $4::uuid, '2026-10-01', false, false,
         false, $5, $6)`,
      attributionId,
      apporteurId,
      unSiren(),
      grilleId,
      pii.emailChiffre,
      pii.emailHash
    );
    const demandeId = randomUUID();
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO demandes_confirmation (id, attribution_id, etat, envoyee_at)
       VALUES ($1::uuid, $2::uuid, $3::etat_demande_confirmation, $4)`,
      demandeId,
      attributionId,
      d.etat,
      new Date(d.envoyeeAt)
    );
    return { attributionId, demandeId };
  }

  const statut = async (id: string) =>
    (await base.prisma.attribution.findUniqueOrThrow({ where: { id } })).statut;
  const evenementsTacites = (id: string) =>
    base.prisma.evenement.findMany({
      where: { type: 'attribution_etat_modifie', agregatId: id },
      orderBy: { id: 'asc' },
    });
  const passer = (maintenant: number) =>
    confirmerTacitement(base.prisma, { maintenant: new Date(maintenant), cles: CLES });

  it('REQ-DM-042 : réception à J — échéance moins une minute, aucune promotion ; à l’échéance, une seule, avec son événement', async () => {
    const { attributionId } = await unDepot({
      email: 'claire.martin@menuiserie-martin.fr',
      etat: 'envoyee',
      envoyeeAt: J,
    });
    await passer(echeanceTacite(J) - MS_PAR_MINUTE);
    expect(await statut(attributionId)).toBe('provisoire');
    expect(await evenementsTacites(attributionId)).toEqual([]);

    await passer(echeanceTacite(J));
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } });
    expect(a.statut).toBe('active');
    expect(a.confirmeeAt?.getTime()).toBe(echeanceTacite(J));
    expect(a.fenetreFinAt).not.toBeNull();
    const evts = await evenementsTacites(attributionId);
    expect(evts).toHaveLength(1);
    expect(evts[0]!.charge).toMatchObject({
      de: 'provisoire',
      vers: 'active',
      transition: 'confirmee_tacitement',
      acteur: { par: 'systeme' },
    });

    // Deux passages, un seul événement.
    await passer(echeanceTacite(J) + MS_PAR_MINUTE);
    expect(await evenementsTacites(attributionId)).toHaveLength(1);
  });

  it('REQ-DM-042 : rebond à J+1 non corrigé — à J+90, aucune promotion', async () => {
    const { attributionId } = await unDepot({
      email: 'e.blanc@societe-e.fr',
      etat: 'rebond',
      envoyeeAt: J,
    });
    await passer(jour(90));
    expect(await statut(attributionId)).toBe('provisoire');
    expect(await evenementsTacites(attributionId)).toEqual([]);
  });

  it('REQ-DM-042 : correction à J+10 puis envoi sans rebond — promotion à J+40, et pas avant', async () => {
    const { attributionId } = await unDepot({
      email: 'f.noir@societe-f.fr',
      etat: 'envoyee',
      envoyeeAt: jour(10),
    });
    await passer(jour(40) - MS_PAR_MINUTE);
    expect(await statut(attributionId)).toBe('provisoire');
    await passer(jour(40));
    expect(await statut(attributionId)).toBe('active');
  });

  it('REQ-DM-008 : un clic « Oui » retenu avant l’échéance — aucune promotion tacite', async () => {
    const { attributionId } = await unDepot({
      email: 'g.vert@societe-g.fr',
      etat: 'repondue_oui',
      envoyeeAt: J,
    });
    await passer(jour(90));
    expect(await evenementsTacites(attributionId)).toEqual([]);
  });

  it('REQ-DM-008 : un appel confirme avant l’échéance — la confirmation est la sienne, aucune promotion tacite ensuite', async () => {
    const { attributionId } = await unDepot({
      email: 'h.gris@societe-h.fr',
      etat: 'envoyee',
      envoyeeAt: J,
    });
    await base.prisma.$transaction((tx) =>
      confirmerUneAttribution(tx, {
        attributionId,
        transition: 'confirmee',
        acteur: { par: 'systeme' },
        maintenant: new Date(jour(5)),
        commandeValableRattachee: false,
      })
    );
    await passer(jour(90));
    const evts = await evenementsTacites(attributionId);
    expect(evts.map((e) => (e.charge as { transition: string }).transition)).toEqual(['confirmee']);
  });

  it('REQ-DM-042 : TÉMOIN — demande SIGNALÉE (adresse webmail) et silencieuse : J+30 et J+45 rien ; appel confirme à J+35, active à J+35', async () => {
    const { attributionId } = await unDepot({
      email: 'jean.dupont@gmail.com',
      etat: 'envoyee',
      envoyeeAt: J,
    });
    await passer(echeanceTacite(J));
    expect(await statut(attributionId)).toBe('provisoire');
    await base.prisma.$transaction((tx) =>
      confirmerUneAttribution(tx, {
        attributionId,
        transition: 'confirmee',
        acteur: { par: 'systeme' },
        maintenant: new Date(jour(35)),
        commandeValableRattachee: false,
      })
    );
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } });
    expect(a.statut).toBe('active');
    expect(a.confirmeeAt?.getTime()).toBe(jour(35));
    await passer(jour(45));
    const evts = await evenementsTacites(attributionId);
    expect(evts.map((e) => (e.charge as { transition: string }).transition)).toEqual(['confirmee']);
  });

  it('REQ-DM-042 : TÉMOIN — une demande signalée restée silencieuse n’est toujours pas promue à J+45', async () => {
    const { attributionId } = await unDepot({
      email: 'contact@societe-k.fr',
      etat: 'envoyee',
      envoyeeAt: J,
    });
    await passer(jour(45));
    expect(await statut(attributionId)).toBe('provisoire');
    expect(await evenementsTacites(attributionId)).toEqual([]);
  });
});
