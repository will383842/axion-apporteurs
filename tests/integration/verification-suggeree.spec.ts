// @req REQ-SEC-060
// @req REQ-SEC-024
/**
 * SEC-41 — les raisons « Vérification suggérée » lues sur la base RÉELLE (HYP-W20-VERIFICATION).
 *
 * CE QU'IL PROUVE :
 *   — chaque raison qui compare deux personnes le fait par EMPREINTES (REQ-SEC-024) : l'e-mail du
 *     contact écrit dans une autre casse que celui de l'apporteur s'égale par son empreinte ; le
 *     même téléphone sur deux entreprises ; l'empreinte d'IP du clic contre celles des sessions ;
 *   — la raison « rebond » ne vaut que pour la demande EN rebond ;
 *   — un dépôt sans raison n'est pas signalé ;
 *   — la lecture n'écrit RIEN : ni événement, ni anomalie.
 *
 * Joué par Gate D, sur la base fraîchement migrée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii, empreinteAdresseReseau } from '../../src/server/securite/pii';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { semerSession } from '../../prisma/seed/05-sessions';
import { lireLaVerification } from '../../src/server/securite/verification-suggeree';

let base: Base;
let grilleId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 720000000;
const unSiren = () => String((sirens += 11));

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-41-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'b'.repeat(64),
});
const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const CONFIGURATION = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};
const T0 = new Date('2026-10-01T08:00:00.000Z');

let sequence = 0;
const code = () => `AX7${String((sequence += 1)).padStart(5, '0')}`;

/** Un apporteur aux coordonnées CHIFFRÉES par `colonnesPii` pour SA ligne, empreintes comprises. */
async function unApporteur(courriel: string, telephone: string): Promise<string> {
  const id = randomUUID();
  const pii = colonnesPii({ modele: MODELE_APPORTEUR, id }, { email: courriel, telephone }, CLES);
  await base.prisma.apporteur.create({
    data: {
      id,
      emailChiffre: Buffer.from(pii.emailChiffre!),
      emailHash: pii.emailHash!,
      telephoneChiffre: Buffer.from(pii.telephoneChiffre!),
      phoneHash: pii.phoneHash!,
      statut: 'signe',
      codeParrainage: code(),
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: T0,
    },
  });
  return id;
}

/**
 * Un dépôt et sa demande de confirmation, dans l'état donné. Aucun défaut sur ce que les témoins
 * font varier (RM-11) : l'adresse, le téléphone du contact et l'état sont nommés à chaque appel.
 */
async function unDepot(d: {
  apporteurId: string;
  email: string;
  telephone: string;
  etat: 'envoyee' | 'rebond';
}): Promise<{ attributionId: string; demandeId: string }> {
  const attributionId = randomUUID();
  const pii = colonnesPii(
    { modele: 'attribution', id: attributionId },
    { email: d.email, telephone: d.telephone },
    CLES
  );
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare,
       email_chiffre, email_hash, telephone_chiffre, phone_hash)
     VALUES ($1::uuid, $2::uuid, 'provisoire', $3, 'espace', $4::uuid, '2026-10-01', false, false,
       false, $5, $6, $7, $8)`,
    attributionId,
    d.apporteurId,
    unSiren(),
    grilleId,
    pii.emailChiffre,
    pii.emailHash,
    pii.telephoneChiffre,
    pii.phoneHash
  );
  const demandeId = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO demandes_confirmation (id, attribution_id, etat, envoyee_at)
     VALUES ($1::uuid, $2::uuid, $3::etat_demande_confirmation, $4)`,
    demandeId,
    attributionId,
    d.etat,
    T0
  );
  return { attributionId, demandeId };
}

/** Une émission de la demande, puis le clic, depuis l'adresse réseau donnée. */
async function unClic(demandeId: string, adresse: string): Promise<void> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO emissions_demande_confirmation (id, demande_id, jeton_oui_hash, jeton_non_hash)
     VALUES ($1::uuid, $2::uuid, $3, $4)`,
    id,
    demandeId,
    hex(32),
    hex(32)
  );
  await base.prisma.$executeRawUnsafe(
    `UPDATE emissions_demande_confirmation SET clic_ip_hash = $2 WHERE id = $1::uuid`,
    id,
    empreinteAdresseReseau(adresse, CLES)
  );
}

let p1: string;
const depots: Record<string, { attributionId: string; demandeId: string }> = {};

beforeAll(async () => {
  base = await demarrerBase();
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: T0,
        importeeAt: T0,
      },
    })
  ).id;
  p1 = await unApporteur('paul.apporteur@exemple-apporteur.fr', '+33612345678');
  await semerSession(base.prisma, {
    apporteurId: p1,
    jetonLien: tirerJeton(),
    jetonSession: tirerJeton(),
    consommeAt: T0,
    ipHash: empreinteAdresseReseau('203.0.113.7', CLES),
    configuration: CONFIGURATION,
  });

  depots.neutre = await unDepot({
    apporteurId: p1,
    email: 'claire.martin@menuiserie-martin.fr',
    telephone: '+33611111111',
    etat: 'envoyee',
  });
  depots.memeCourriel = await unDepot({
    apporteurId: p1,
    email: 'Paul.Apporteur@Exemple-Apporteur.FR',
    telephone: '+33622222222',
    etat: 'envoyee',
  });
  depots.telephoneA = await unDepot({
    apporteurId: p1,
    email: 'a.roy@societe-a.fr',
    telephone: '+33633333333',
    etat: 'envoyee',
  });
  depots.telephoneB = await unDepot({
    apporteurId: p1,
    email: 'b.roy@societe-b.fr',
    telephone: '06 33 33 33 33',
    etat: 'envoyee',
  });
  depots.rebond = await unDepot({
    apporteurId: p1,
    email: 'e.blanc@societe-e.fr',
    telephone: '+33644444444',
    etat: 'rebond',
  });
  depots.clic = await unDepot({
    apporteurId: p1,
    email: 'f.noir@societe-f.fr',
    telephone: '+33655555555',
    etat: 'envoyee',
  });
  await unClic(depots.clic.demandeId, '203.0.113.7');
  depots.clicAilleurs = await unDepot({
    apporteurId: p1,
    email: 'g.vert@societe-g.fr',
    telephone: '+33666666666',
    etat: 'envoyee',
  });
  await unClic(depots.clicAilleurs.demandeId, '198.51.100.20');
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const lireRaisons = (cle: string) =>
  lireLaVerification(base.prisma, {
    attributionId: depots[cle]!.attributionId,
    domaineDuSite: null,
    cles: CLES,
  });

describe('REQ-SEC-060 REQ-SEC-024 — les raisons, lues sur la base, comparées par empreintes', () => {
  it('REQ-SEC-060 : un dépôt sans raison n’en porte aucune', async () => {
    expect(await lireRaisons('neutre')).toEqual({ raisons: [] });
  });

  it('REQ-SEC-024 : l’e-mail du contact égal à celui de l’apporteur, à la casse près, s’égale par son EMPREINTE', async () => {
    expect(await lireRaisons('memeCourriel')).toEqual({
      raisons: ['coordonnee_de_l_apporteur'],
    });
  });

  it('REQ-SEC-024 : le même téléphone, écrit autrement, sur deux entreprises signale les deux dépôts', async () => {
    for (const cle of ['telephoneA', 'telephoneB']) {
      expect(await lireRaisons(cle)).toEqual({
        raisons: ['contact_sur_plusieurs_entreprises'],
      });
    }
  });

  it('REQ-SEC-060 : la demande EN rebond est signalée par la raison « rebond »', async () => {
    expect(await lireRaisons('rebond')).toEqual({ raisons: ['rebond'] });
  });

  it('REQ-SEC-024 : le clic depuis l’empreinte d’IP d’une session de l’apporteur est signalé ; d’ailleurs, non', async () => {
    expect(await lireRaisons('clic')).toEqual({
      raisons: ['clic_depuis_l_ip_de_l_apporteur'],
    });
    expect(await lireRaisons('clicAilleurs')).toEqual({ raisons: [] });
  });

  it('REQ-SEC-060 : le site connu de l’entreprise est comparé au domaine de l’adresse', async () => {
    const r = await lireLaVerification(base.prisma, {
      attributionId: depots.neutre!.attributionId,
      domaineDuSite: 'autre-societe.fr',
      cles: CLES,
    });
    expect(r).toEqual({ raisons: ['domaine_different_du_site'] });
  });

  it('REQ-SEC-060 : la lecture n’écrit rien — ni événement, ni anomalie', async () => {
    const avant = {
      evenements: await base.prisma.evenement.count(),
      anomalies: await base.prisma.anomalie.count(),
    };
    for (const cle of Object.keys(depots)) await lireRaisons(cle);
    expect({
      evenements: await base.prisma.evenement.count(),
      anomalies: await base.prisma.anomalie.count(),
    }).toEqual(avant);
  });
});
