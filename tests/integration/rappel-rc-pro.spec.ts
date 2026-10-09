// @req REQ-DM-027
/**
 * DM-51 — le rappel d'échéance de l'attestation `rc_pro`, en base RÉELLE (REQ-DM-027, contrat
 * art. 6.4). Le passage du lanceur prend les pièces `rc_pro` COURANTES et valides dont l'échéance
 * tombe dans le délai de la SSOT, et notifie l'apporteur (`rappel_rc_pro`) par `notifier()`.
 *
 * TÉMOINS : sous le délai, rien ; échue, rien ; dans la fenêtre, UN envoi, au bon apporteur ; second
 * passage, rien (la trace d'envoi le tient) ; pièce remplacée, rien ; la trace d'un rappel ANTÉRIEUR
 * à la fenêtre (l'échéance précédente) n'empêche pas le rappel de cette échéance-ci.
 *
 * Les instants partent de l'heure RÉELLE : `notifications_espace.cree_at` est posé par la base.
 * Les adresses sont factices, les secrets tirés pour ce fichier.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { demanderEnvoi, depotDesCourriels } from '../../src/server/integrations/zeptomail/emetteur';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';
import { dateEnClair } from '../../src/server/attribution/notifications';
import { rappelerLesAttestationsRcPro } from '../../src/server/taches/rappeler-rc-pro';
import { TACHES } from '../../src/server/taches/registre';

let base: Base;

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm51-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
});

const MAINTENANT = new Date();
const DELAI_MS = SEUILS.RC_PRO_RAPPEL_AVANT_ECHEANCE_JOURS.valeur * MS_PAR_JOUR;
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);

/** Les messages remis au relais factice : l'adresse et le sujet. */
const remis: { a: string; sujet: string }[] = [];

const passage = () =>
  rappelerLesAttestationsRcPro(base.prisma, {
    maintenant: () => MAINTENANT,
    cles: CLES,
    urlDeLEspace: new URL('https://espace.example.org'),
    envoyerCourriel: (demande) =>
      demanderEnvoi(demande, {
        configuration: { expediteur: 'ne-pas-repondre@example.org', dmarcVerifie: true },
        relais: {
          envoyer: async (m) => {
            remis.push({ a: m.a, sujet: m.sujet });
            return { messageId: `m-${remis.length}` };
          },
        },
        depot: depotDesCourriels(base.prisma),
        cles: CLES,
        maintenant: () => MAINTENANT,
        nouvelId: randomUUID,
      }),
  });

let sequence = 0;
async function apporteur(): Promise<{ id: string; adresse: string }> {
  sequence += 1;
  const id = randomUUID();
  const adresse = `rc-pro-${sequence}@example.org`;
  const { emailChiffre, emailHash } = colonnesPii(
    { modele: MODELE_APPORTEUR, id },
    { email: adresse },
    CLES
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  await base.prisma.apporteur.create({
    data: {
      id,
      emailChiffre: Buffer.from(emailChiffre),
      emailHash,
      statut: 'signe',
      codeParrainage: `AX5${String(sequence).padStart(5, '0')}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: new Date(MAINTENANT.getTime() - 400 * MS_PAR_JOUR),
    },
  });
  return { id, adresse };
}

async function piece(apporteurId: string, expireAt: Date, remplaceeAt: Date | null = null) {
  await base.prisma.pieceKyc.create({
    data: {
      apporteurId,
      type: 'rc_pro',
      statut: 'valide',
      verifieeAt: new Date(MAINTENANT.getTime() - 300 * MS_PAR_JOUR),
      expireAt,
      remplaceeAt,
    },
  });
}

let sousLeDelai: { id: string; adresse: string };
let echue: { id: string; adresse: string };
let dansLaFenetre: { id: string; adresse: string };
let remplacee: { id: string; adresse: string };
let rappeleLAnPasse: { id: string; adresse: string };
const ECHEANCE = dans(10 * MS_PAR_JOUR);

beforeAll(async () => {
  base = await demarrerBase();
  sousLeDelai = await apporteur();
  await piece(sousLeDelai.id, dans(DELAI_MS + MS_PAR_JOUR));
  echue = await apporteur();
  await piece(echue.id, dans(-MS_PAR_JOUR));
  dansLaFenetre = await apporteur();
  await piece(dansLaFenetre.id, ECHEANCE);
  remplacee = await apporteur();
  await piece(remplacee.id, ECHEANCE, dans(-MS_PAR_JOUR));
  await piece(remplacee.id, dans(365 * MS_PAR_JOUR));
  rappeleLAnPasse = await apporteur();
  await piece(rappeleLAnPasse.id, ECHEANCE);
  // Le rappel de l'échéance PRÉCÉDENTE : demandé avant la fenêtre de celle-ci.
  await base.prisma.courrielEnvoye.create({
    data: {
      gabarit: 'rappel_rc_pro',
      emailHash: 'a'.repeat(64),
      apporteurId: rappeleLAnPasse.id,
      statut: 'envoye',
      demandeAt: dans(-365 * MS_PAR_JOUR),
      envoyeAt: dans(-365 * MS_PAR_JOUR),
    },
  });
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

describe('DM-51 — le rappel d’échéance de l’attestation rc_pro', () => {
  it('le passage est inscrit au registre des tâches, sous REQ-DM-027', () => {
    expect(TACHES.rc_pro_rappeler.req).toBe('REQ-DM-027');
  });

  it('dans la fenêtre, un seul envoi, au bon apporteur ; sous le délai, échue ou remplacée, rien', async () => {
    const bilan = await passage();
    expect(bilan).toEqual({ rappeles: 2, dejaRappeles: 0, echecs: 0 });
    expect(remis.map((m) => m.a).sort()).toEqual(
      [dansLaFenetre.adresse, rappeleLAnPasse.adresse].sort()
    );
    expect(remis[0]!.sujet).toContain(dateEnClair(ECHEANCE));
    const courriels = await base.prisma.courrielEnvoye.findMany({
      where: { gabarit: 'rappel_rc_pro', demandeAt: MAINTENANT },
      select: { apporteurId: true, statut: true },
    });
    expect(courriels.map((c) => c.apporteurId).sort()).toEqual(
      [dansLaFenetre.id, rappeleLAnPasse.id].sort()
    );
    expect(courriels.every((c) => c.statut === 'envoye')).toBe(true);
    for (const rien of [sousLeDelai, echue, remplacee]) {
      expect(
        await base.prisma.notificationEspace.count({
          where: { apporteurId: rien.id, cle: 'rappel_rc_pro' },
        })
      ).toBe(0);
    }
  });

  it('second passage, rien : la trace d’envoi le tient', async () => {
    const bilan = await passage();
    expect(bilan).toEqual({ rappeles: 0, dejaRappeles: 2, echecs: 0 });
    expect(remis).toHaveLength(2);
    expect(
      await base.prisma.courrielEnvoye.count({
        where: { gabarit: 'rappel_rc_pro', apporteurId: dansLaFenetre.id },
      })
    ).toBe(1);
  });
});
