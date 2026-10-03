// @req REQ-ARG-012
// @req REQ-SEC-031
/**
 * SEC-18 en base RÉELLE — l'anti auto-parrainage, à la candidature et au RIB.
 *
 * TÉMOINS À DEUX FACES : un filleul qui partage avec son parrain le téléphone, l'IBAN ou le SIREN ouvre UNE anomalie `auto_parrainage` sur lui (et la base l'accepte telle quelle) ; un
 * filleul distinct n'en ouvre aucune. Le courriel, lui, ne se partage pas : la base l'interdit déjà
 * (index unique), le cœur le compare quand même (témoin en processus). Une anomalie ouverte n'est pas doublée ; une pièce RIB
 * remplacée et une identité de facturation close ne comptent plus. Le parrain qui saisit l'IBAN de
 * son filleul marque le filleul. Empreintes et blocs sont tirés au hasard : aucune donnée réelle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import {
  controlerALaCandidature,
  controlerAuChangementDeRib,
  type LigneDuJournal,
  type PortsDuControle,
} from '../../src/server/parrainage/anti-auto-parrainage';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const code = () =>
  'AX' + Array.from(randomBytes(6), (o) => CROCKFORD[o % CROCKFORD.length]).join('');

/** Un SIREN neuf, de neuf chiffres (sa clé de Luhn n'est pas jugée ici). */
const siren = () => String(100_000_000 + (randomBytes(4).readUInt32BE() % 899_999_999));

interface Identite {
  emailHash?: string;
  phoneHash?: string;
  parrainCode?: string | null;
}

/** Un apporteur, avec les empreintes données ; rend son id et son code. */
async function apporteur(i: Identite = {}): Promise<{ id: string; code: string }> {
  const c = code();
  const a = await base.prisma.apporteur.create({
    data: {
      statut: 'kyc_en_cours',
      codeParrainage: c,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      parrainCodeCapture: i.parrainCode ?? null,
      creeAt: MAINTENANT,
      ...(i.emailHash === undefined
        ? {}
        : { emailHash: i.emailHash, emailChiffre: randomBytes(40) }),
      ...(i.phoneHash === undefined
        ? {}
        : { phoneHash: i.phoneHash, telephoneChiffre: randomBytes(40) }),
    },
  });
  return { id: a.id, code: c };
}

/** Une pièce RIB, par SQL brut : le bloc et l'empreinte vont ensemble. */
async function rib(apporteurId: string, ibanHash: string, remplaceeAt: Date | null = null) {
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, remplacee_at, iban_chiffre, iban_hash)
     VALUES ($1::uuid, $2::uuid, 'rib', $3::statut_piece_kyc, $4, $5, $6)`,
    randomUUID(),
    apporteurId,
    remplaceeAt === null ? 'a_verifier' : 'valide',
    remplaceeAt,
    randomBytes(40),
    ibanHash
  );
}

async function identite(apporteurId: string, s: string, finAt: Date | null = null) {
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO identites_facturation (id, apporteur_id, siren, regime_tva, debut_at, fin_at)
     VALUES ($1::uuid, $2::uuid, $3, 'franchise_293b', $4, $5)`,
    randomUUID(),
    apporteurId,
    s,
    finAt === null ? MAINTENANT : new Date(finAt.getTime() - 86_400_000),
    finAt
  );
}

async function anomalies(apporteurId: string) {
  return base.prisma.anomalie.findMany({
    where: { apporteurId },
    select: { type: true, statut: true, score: true, traiteAt: true },
  });
}

/** Les ports réels : l'horloge, et l'écrivain du journal par défaut (`ajouterEvenement`). */
const ports = (journal?: LigneDuJournal[]): PortsDuControle => ({
  maintenant: () => MAINTENANT,
  ...(journal === undefined ? {} : { journal: (l: LigneDuJournal) => journal.push(l) }),
});

const OUVERTE = { type: 'auto_parrainage', statut: 'ouverte', score: null, traiteAt: null };

describe('REQ-SEC-031 — à la candidature parrainée, en base réelle', () => {
  it.each(['telephone', 'siren'] as const)(
    'REQ-SEC-031 : TÉMOIN À DEUX FACES — même %s : une anomalie ouverte sur le filleul ; un filleul distinct : aucune',
    async (famille) => {
      const commun = hex(32);
      const s = siren();
      const parrain = await apporteur({
        emailHash: hex(32),
        phoneHash: famille === 'telephone' ? commun : hex(32),
      });
      await identite(parrain.id, famille === 'siren' ? s : siren());
      const vise = await apporteur({
        parrainCode: parrain.code,
        emailHash: hex(32),
        phoneHash: famille === 'telephone' ? commun : hex(32),
      });
      await identite(vise.id, famille === 'siren' ? s : siren());
      const journal: LigneDuJournal[] = [];
      expect(await controlerALaCandidature(base.prisma, vise.id, ports(journal))).toEqual({
        correspondances: [famille],
        anomalieOuverte: true,
      });
      expect(await anomalies(vise.id)).toEqual([OUVERTE]);
      expect(await anomalies(parrain.id)).toEqual([]);
      expect(journal).toEqual([
        { signal: 'auto_parrainage_soupconne', moment: 'candidature', correspondances: [famille] },
      ]);
      // Contre-témoin : un filleul du même parrain, sans rien de commun.
      const distinct = await apporteur({
        parrainCode: parrain.code,
        emailHash: hex(32),
        phoneHash: hex(32),
      });
      await identite(distinct.id, siren());
      expect(await controlerALaCandidature(base.prisma, distinct.id, ports())).toEqual({
        correspondances: [],
        anomalieOuverte: false,
      });
      expect(await anomalies(distinct.id)).toEqual([]);
    }
  );

  it('REQ-SEC-031 : le courriel ne se partage même pas — la base refuse déjà deux apporteurs au même courriel', async () => {
    const commun = hex(32);
    await apporteur({ emailHash: commun });
    await expect(apporteur({ emailHash: commun })).rejects.toThrow(/email_hash|Unique constraint/);
  });

  it('REQ-SEC-031 : un second contrôle ne double pas l’anomalie ouverte', async () => {
    const commun = hex(32);
    const parrain = await apporteur({ phoneHash: commun });
    const vise = await apporteur({ parrainCode: parrain.code.toLowerCase(), phoneHash: commun });
    expect((await controlerALaCandidature(base.prisma, vise.id, ports())).anomalieOuverte).toBe(
      true
    );
    expect(await controlerALaCandidature(base.prisma, vise.id, ports())).toEqual({
      correspondances: ['telephone'],
      anomalieOuverte: false,
    });
    expect(await anomalies(vise.id)).toEqual([OUVERTE]);
  });
});

describe('REQ-SEC-031 — l’ouverture, une seule et journalisée, sous des contrôles simultanés', () => {
  it('REQ-SEC-031 : TÉMOIN DE CONCURRENCE — dix contrôles simultanés du même filleul ouvrent UNE anomalie, et UN événement d’ouverture', async () => {
    const commun = hex(32);
    const parrain = await apporteur({ phoneHash: commun });
    const vise = await apporteur({ parrainCode: parrain.code, phoneHash: commun });
    const resultats = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0
          ? controlerALaCandidature(base.prisma, vise.id, ports())
          : controlerAuChangementDeRib(base.prisma, vise.id, ports())
      )
    );
    expect(resultats.filter((r) => r.anomalieOuverte)).toHaveLength(1);
    const ouvertes = await base.prisma.anomalie.findMany({
      where: { apporteurId: vise.id },
      select: { id: true, statut: true },
    });
    expect(ouvertes).toHaveLength(1);
    const evenements = await base.prisma.evenement.findMany({
      where: { type: 'anomalie_statut_modifie', agregatId: ouvertes[0]!.id },
      select: { agregat: true, charge: true },
    });
    expect(evenements).toEqual([
      { agregat: 'anomalie', charge: { de: null, vers: 'ouverte', acteur: { par: 'systeme' } } },
    ]);
  });
});

describe('REQ-SEC-031 — au changement de RIB, en base réelle', () => {
  it('REQ-SEC-031 : TÉMOIN À DEUX FACES — le filleul saisit l’IBAN de son parrain : marqué ; un IBAN propre : rien', async () => {
    const iban = hex(32);
    const parrain = await apporteur();
    await rib(parrain.id, iban);
    const vise = await apporteur({ parrainCode: parrain.code });
    await rib(vise.id, hex(32));
    expect(await controlerAuChangementDeRib(base.prisma, vise.id, ports())).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
    expect(await anomalies(vise.id)).toEqual([]);
    // Le RIB change : la nouvelle pièce, en vérification, porte l'IBAN du parrain.
    const autre = await apporteur({ parrainCode: parrain.code });
    await rib(autre.id, iban);
    expect(await controlerAuChangementDeRib(base.prisma, autre.id, ports())).toEqual({
      correspondances: ['iban'],
      anomalieOuverte: true,
    });
    expect(await anomalies(autre.id)).toEqual([OUVERTE]);
  });

  it('REQ-SEC-031 : le PARRAIN qui saisit l’IBAN de son filleul marque ce filleul, et lui seul', async () => {
    const iban = hex(32);
    const parrain = await apporteur();
    const vise = await apporteur({ parrainCode: parrain.code });
    await rib(vise.id, iban);
    const autre = await apporteur({ parrainCode: parrain.code });
    await rib(autre.id, hex(32));
    await rib(parrain.id, iban);
    expect(await controlerAuChangementDeRib(base.prisma, parrain.id, ports())).toEqual({
      correspondances: ['iban'],
      anomalieOuverte: true,
    });
    expect(await anomalies(vise.id)).toEqual([OUVERTE]);
    expect(await anomalies(autre.id)).toEqual([]);
    expect(await anomalies(parrain.id)).toEqual([]);
  });

  it('REQ-SEC-031 : une pièce RIB REMPLACÉE et une identité de facturation CLOSE ne comptent plus', async () => {
    const iban = hex(32);
    const s = siren();
    const parrain = await apporteur();
    await rib(parrain.id, iban, new Date('2026-09-01T00:00:00.000Z'));
    await identite(parrain.id, s, new Date('2026-09-01T00:00:00.000Z'));
    const vise = await apporteur({ parrainCode: parrain.code });
    await rib(vise.id, iban);
    await identite(vise.id, s);
    expect(await controlerAuChangementDeRib(base.prisma, vise.id, ports())).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
    expect(await anomalies(vise.id)).toEqual([]);
  });
});
