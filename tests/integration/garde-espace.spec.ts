// @req REQ-JUR-025
/**
 * SEC-53 en base RÉELLE — la garde de l'espace exige une session valide ET l'acceptation de la
 * version publiable courante, en échec FERMÉ avec un motif nommé.
 *
 * Les trois témoins de l'acceptance : LIEN DIRECT (une session valide qui n'a jamais accepté),
 * ANCIENNE VERSION ACCEPTÉE, BASE INJOIGNABLE. La session s'ouvre par le semeur
 * `prisma/seed/05-sessions.ts`, l'acceptation s'écrit par `accepterLaPolitique` : rien n'est posé
 * à la main. Secrets et jetons sont tirés à l'exécution ; aucune adresse réelle n'est écrite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import {
  actionEspace,
  depotDeSessions,
  pageEspace,
  type PortsDeSession,
} from '../../src/server/auth/session';
import { portsDeLaGarde } from '../../src/server/auth/garde-espace';
import { accepterLaPolitique, depotDAcceptation } from '../../src/server/rgpd/acceptation';
import type { Politique } from '../../src/domain/rgpd/politique';
import { semerSession } from '../../prisma/seed/05-sessions';

let base: Base;
/** Un client vers un port où rien n'écoute : la base injoignable. */
let injoignable: PrismaClient;

beforeAll(async () => {
  base = await demarrerBase();
  injoignable = new PrismaClient({
    datasourceUrl: 'postgresql://personne:rien@127.0.0.1:1/aucune?connect_timeout=2',
  });
}, 180_000);

afterAll(async () => {
  await injoignable?.$disconnect();
  await base?.arreter();
});

const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const CONFIGURATION = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};
const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec53-base-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
});

const t0 = Date.now();
const MINUTE = 60 * 1000;
const MAINTENANT = new Date(t0 + MINUTE);

const V1 = 'a'.repeat(32);
const V2 = 'b'.repeat(32);

function politique(version: string): Politique {
  return {
    rubriques: [{ cle: 'finalite', contenu: [{ type: 'texte', texte: 'Gérer le réseau.' }] }],
    destinataires: [],
    version,
  };
}

/** Les ports de l'espace, la politique courante étant `courante`. */
function ports(
  courante: Politique,
  bases: { session: PrismaClient; acceptation: PrismaClient } = {
    session: base.prisma,
    acceptation: base.prisma,
  }
): PortsDeSession {
  return {
    maintenant: () => MAINTENANT,
    depot: depotDeSessions(bases.session),
    configuration: CONFIGURATION.session,
    acceptation: portsDeLaGarde(bases.acceptation, () => ({
      ok: true,
      politique: courante,
      filtres: [],
    })),
  };
}

let sequence = 0;
function code(): string {
  sequence += 1;
  return `AX5${String(sequence).padStart(5, '0')}`;
}

/** Un apporteur `signe` au courriel posé par la couche des données personnelles (RM-11). */
async function apporteur(courriel: string): Promise<string> {
  const id = randomUUID();
  const { emailChiffre, emailHash } = colonnesPii(
    { modele: MODELE_APPORTEUR, id },
    { email: courriel },
    CLES
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  await base.prisma.apporteur.create({
    data: {
      id,
      emailChiffre: Buffer.from(emailChiffre),
      emailHash,
      statut: 'signe',
      codeParrainage: code(),
      isTest: false,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 72,
      scorePartsJson: { carnet: 72 },
      scoreBaremeVersion: 'bareme-essai',
      sourceCanal: '/connexion',
      parrainCodeCapture: null,
      creeAt: new Date(t0),
    },
  });
  return id;
}

/** Ouvre une session par le semeur ; rend le jeton de session. */
async function ouvrir(apporteurId: string): Promise<string> {
  const jetonSession = tirerJeton();
  await semerSession(base.prisma, {
    apporteurId,
    jetonLien: tirerJeton(),
    jetonSession,
    consommeAt: new Date(t0),
    ipHash: null,
    configuration: CONFIGURATION,
  });
  return jetonSession;
}

async function accepter(apporteurId: string, version: string): Promise<void> {
  const issue = await accepterLaPolitique(
    { apporteurId, versionVue: version, courante: politique(version), maintenant: new Date(t0) },
    depotDAcceptation(base.prisma)
  );
  expect(issue).toBe('acceptee');
}

const verdict = async (jeton: string, p: PortsDeSession) => {
  const v = await pageEspace('accueil', jeton, p);
  return v.ok ? 'ouverte' : v.motif;
};

describe('REQ-JUR-025 — la garde de l’espace, en base réelle', () => {
  it('REQ-JUR-025 : TÉMOIN DU LIEN DIRECT — une session valide qui n’a jamais accepté est refusée ; acceptée, la même requête passe', async () => {
    const id = await apporteur('direct@example.org');
    const jeton = await ouvrir(id);
    expect(await verdict(jeton, ports(politique(V2)))).toBe('acceptation_requise');
    await accepter(id, V2);
    expect(await verdict(jeton, ports(politique(V2)))).toBe('ouverte');
  });

  it('REQ-JUR-025 : TÉMOIN DE L’ANCIENNE VERSION — acceptée en v1, la politique passe en v2 : refusée à la requête suivante', async () => {
    const id = await apporteur('ancienne@example.org');
    const jeton = await ouvrir(id);
    await accepter(id, V1);
    expect(await verdict(jeton, ports(politique(V1)))).toBe('ouverte');
    expect(await verdict(jeton, ports(politique(V2)))).toBe('acceptation_requise');
  });

  it('REQ-JUR-025 : TÉMOIN DE LA BASE INJOIGNABLE — la session ou l’acceptation ne se lisent pas : refus nommé, et l’action n’écrit rien', async () => {
    const id = await apporteur('panne@example.org');
    const jeton = await ouvrir(id);
    await accepter(id, V2);
    expect(
      await verdict(jeton, ports(politique(V2), { session: injoignable, acceptation: base.prisma }))
    ).toBe('session_illisible');
    expect(
      await verdict(jeton, ports(politique(V2), { session: base.prisma, acceptation: injoignable }))
    ).toBe('acceptation_illisible');
    const ecrites: unknown[] = [];
    const issue = await actionEspace(
      'deposer',
      jeton,
      ports(politique(V2), { session: base.prisma, acceptation: injoignable }),
      async () => ecrites.push('depot')
    );
    expect(issue).toEqual({ ok: false, motif: 'acceptation_illisible' });
    expect(ecrites).toEqual([]);
  });

  it('REQ-JUR-025 : l’action d’acceptation, exemptée par nom, s’exécute pour une session qui n’a pas encore accepté', async () => {
    const id = await apporteur('exemptee@example.org');
    const jeton = await ouvrir(id);
    const issue = await actionEspace(
      'confidentialite',
      jeton,
      ports(politique(V2)),
      async (session) => session.apporteurId
    );
    expect(issue).toEqual({ ok: true, valeur: id });
  });
});
