// @req REQ-DM-031
/**
 * La purge planifiée du contact d'une attribution, en base RÉELLE (REQ-DM-031, HYP-RGPD-RETENTION).
 *
 * L'échéance `purge_contact_at` est SEMÉE directement (sous, pile et au-delà de l'instant) : c'est la
 * transition de la machine à états qui la posera en appelant `echeanceDePurge`. Ici, on juge la tâche :
 *   — sous l'échéance, rien ; pile et au-delà, le contact est effacé et UN événement est écrit, dans
 *     la même transaction ; SIREN, horodatage du dépôt et `lien_interet_declare` restent ;
 *   — une occupante NON convertie garde son contact, même échéance passée ; une convertie le perd ;
 *   — un second passage ne change rien et n'écrit aucun événement ;
 *   — une entreprise individuelle perd les coordonnées de son siège, une personne morale les garde ;
 *   — l'événement ne porte que l'instant et l'acteur système, aucune donnée de personne.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { echeanceDePurge, purgerLesContacts } from '../../src/server/taches/purger-contacts';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';

let base: Base;
let grilleId: string;
let apporteurId: string;

const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');
const MINUTE = 60_000;
const hex = (octets: number) => randomBytes(octets).toString('hex');

let sirens = 300000000;
const unSiren = () => String((sirens += 1));

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
        creeAt: MAINTENANT,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

type Semis = {
  statut: string;
  purgeContactAt: Date | null;
  natureJuridique?: string | null;
  coordonnees?: boolean;
};

/** Une attribution au contact COMPLET (blocs factices), par SQL brut. */
async function semer(s: Semis): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare,
       lien_interet_precision_chiffre, nature_juridique, latitude_microdeg, longitude_microdeg,
       purge_contact_at)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, 'espace', $5::uuid, '2026-10-01', false,
       false, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15, $16, $17, $18)`,
    id,
    apporteurId,
    s.statut,
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
    bloc(),
    s.natureJuridique ?? null,
    s.coordonnees ? 48856614 : null,
    s.coordonnees ? 2352222 : null,
    s.purgeContactAt
  );
  return id;
}

type Lue = Record<string, unknown>;
async function lire(id: string): Promise<Lue> {
  const [l] = await base.prisma.$queryRawUnsafe<Lue[]>(
    `SELECT siren, deposee_at, nom_contact_chiffre, prenom_contact_chiffre, email_chiffre,
       email_hash, telephone_chiffre, phone_hash, fonction_contact_chiffre, contexte_chiffre,
       lien_interet_declare, lien_interet_precision_chiffre, latitude_microdeg, longitude_microdeg,
       contact_purge_at
     FROM attributions WHERE id = $1::uuid`,
    id
  );
  return l!;
}

const CONTACT = [
  'nom_contact_chiffre',
  'prenom_contact_chiffre',
  'email_chiffre',
  'email_hash',
  'telephone_chiffre',
  'phone_hash',
  'fonction_contact_chiffre',
  'contexte_chiffre',
  'lien_interet_precision_chiffre',
] as const;

const evenements = (id: string) =>
  base.prisma.evenement.findMany({
    where: { type: 'attribution_contact_purge', agregatId: id },
  });

const purgee = (l: Lue) => CONTACT.every((c) => l[c] === null) && l['contact_purge_at'] !== null;
const intacte = (l: Lue) => CONTACT.every((c) => l[c] !== null) && l['contact_purge_at'] === null;

describe('REQ-DM-031 — la purge planifiée du contact', () => {
  it('REQ-DM-031 : TÉMOINS — sous l’échéance rien ; pile et au-delà, purge et UN événement ; occupante non convertie gardée ; convertie purgée', async () => {
    const sous = await semer({
      statut: 'perdue',
      purgeContactAt: new Date(MAINTENANT.getTime() + MINUTE),
    });
    const pile = await semer({ statut: 'perdue', purgeContactAt: MAINTENANT });
    const audela = await semer({
      statut: 'expiree',
      purgeContactAt: new Date(MAINTENANT.getTime() - MINUTE),
    });
    const occupante = await semer({
      statut: 'active',
      purgeContactAt: new Date(MAINTENANT.getTime() - MINUTE),
    });
    const convertie = await semer({
      statut: 'convertie',
      purgeContactAt: new Date(MAINTENANT.getTime() - MINUTE),
    });
    const sansEcheance = await semer({ statut: 'perimee', purgeContactAt: null });

    const avant = await lire(audela);
    const r = await purgerLesContacts(base.prisma, MAINTENANT);
    expect(r.purgees).toBe(3);

    expect(intacte(await lire(sous))).toBe(true);
    expect(intacte(await lire(occupante))).toBe(true);
    expect(intacte(await lire(sansEcheance))).toBe(true);
    for (const id of [pile, audela, convertie]) {
      const l = await lire(id);
      expect(purgee(l)).toBe(true);
      expect(l['contact_purge_at']).toEqual(MAINTENANT);
      expect(l['lien_interet_declare']).toBe(true);
      expect(await evenements(id)).toHaveLength(1);
    }
    const apres = await lire(audela);
    expect(apres['siren']).toBe(avant['siren']);
    expect(apres['deposee_at']).toEqual(avant['deposee_at']);
    for (const id of [sous, occupante, sansEcheance]) expect(await evenements(id)).toHaveLength(0);
  });

  it('REQ-DM-031 : un second passage ne change rien et n’écrit aucun événement', async () => {
    const id = await semer({
      statut: 'invalidee',
      purgeContactAt: new Date(MAINTENANT.getTime() - MINUTE),
    });
    expect((await purgerLesContacts(base.prisma, MAINTENANT)).purgees).toBeGreaterThanOrEqual(1);
    const premier = await lire(id);
    // Au MÊME instant : un instant plus tard échoirait d'autres lignes du banc (la ligne « sous »
    // du témoin précédent), et le compte ne jugerait plus l'idempotence.
    expect((await purgerLesContacts(base.prisma, MAINTENANT)).purgees).toBe(0);
    expect(await lire(id)).toEqual(premier);
    expect(await evenements(id)).toHaveLength(1);
  });

  it('REQ-DM-031 : TÉMOIN — une attribution ANNULÉE reçoit son échéance et perd son contact', async () => {
    const liberation = new Date(
      MAINTENANT.getTime() - SEUILS.CONTACT_PURGE_APRES_LIBERATION_JOURS.valeur * MS_PAR_JOUR
    );
    const echeance = echeanceDePurge('annulee', liberation);
    expect(echeance).toEqual(MAINTENANT);
    const id = await semer({ statut: 'annulee', purgeContactAt: echeance });
    expect((await purgerLesContacts(base.prisma, MAINTENANT)).purgees).toBeGreaterThanOrEqual(1);
    const l = await lire(id);
    expect(l['contact_purge_at']).toEqual(MAINTENANT);
    expect(l['email_chiffre']).toBeNull();
    expect(await evenements(id)).toHaveLength(1);
  });

  it('REQ-DM-031 : TÉMOIN À TROIS FACES — l’entreprise individuelle perd les coordonnées de son siège, une forme INCONNUE aussi (échec fermé), la personne morale prouvée les garde', async () => {
    const passee = new Date(MAINTENANT.getTime() - MINUTE);
    const ei = await semer({
      statut: 'perdue',
      purgeContactAt: passee,
      natureJuridique: '1000',
      coordonnees: true,
    });
    const inconnue = await semer({
      statut: 'perdue',
      purgeContactAt: passee,
      natureJuridique: null,
      coordonnees: true,
    });
    const pm = await semer({
      statut: 'perdue',
      purgeContactAt: passee,
      natureJuridique: '5710',
      coordonnees: true,
    });
    await purgerLesContacts(base.prisma, MAINTENANT);
    const lEi = await lire(ei);
    const lInconnue = await lire(inconnue);
    const lPm = await lire(pm);
    expect(purgee(lEi) && purgee(lInconnue) && purgee(lPm)).toBe(true);
    expect([lEi['latitude_microdeg'], lEi['longitude_microdeg']]).toEqual([null, null]);
    expect([lInconnue['latitude_microdeg'], lInconnue['longitude_microdeg']]).toEqual([null, null]);
    expect([lPm['latitude_microdeg'], lPm['longitude_microdeg']]).toEqual([48856614, 2352222]);
  });

  it('REQ-DM-031 : l’événement ne porte que l’instant et l’acteur système, sur l’agrégat attribution', async () => {
    const id = await semer({
      statut: 'perdue',
      purgeContactAt: new Date(MAINTENANT.getTime() - MINUTE),
    });
    await purgerLesContacts(base.prisma, MAINTENANT);
    const [e] = await evenements(id);
    expect(e!.agregat).toBe('attribution');
    expect(e!.survenuAt).toEqual(MAINTENANT);
    expect(e!.charge).toEqual({ purgeAt: MAINTENANT.toISOString(), acteur: { par: 'systeme' } });
  });
});
