// @req REQ-SEC-061
// @req REQ-DM-008
// @req REQ-SEC-024
/**
 * SEC-40 (REQ-SEC-061) — les jetons de confirmation, contre la base RÉELLE, sous le rôle du serveur.
 *
 * CE QU'IL PROUVE, TÉMOINS À DEUX FACES :
 *   — un jeton valable ouvre la page, qui ne révèle que le nom de l'entreprise et le prénom et nom
 *     de l'apporteur, et le sens du lien ;
 *   — l'OUVERTURE (GET) n'écrit rien : répétée comme un analyseur de liens, elle laisse la demande,
 *     ses émissions et le journal identiques, et elle tourne dans une transaction en LECTURE SEULE ;
 *   — la RÉPONSE (POST) est retenue UNE fois : rejouée, ou par l'autre jeton de la même demande, ou
 *     sous dix réponses concurrentes, une seule est retenue — la première fait foi pour les deux ;
 *   — jeton rejoué, forgé, révoqué, expiré, d'une demande non envoyée ou d'une attribution qui n'est
 *     plus provisoire : la MÊME réponse, octet pour octet ;
 *   — le jeton des droits du contact : valable, il ouvre la page des droits ; inconnu ou purgé (par
 *     la purge du contact, qui efface son empreinte), la même réponse qu'un jeton faux.
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
import { creerLaDemande, emettreDeNouveau } from '../../src/server/confirmation/demandes';
import {
  REPONSE_SANS_SUITE,
  consommerLeJeton,
  empreinteDuJetonDesDroits,
  ouvrirLaPageDesDroits,
  ouvrirLeLien,
  tirerLesJetonsDeLaDemande,
  tirerUnJeton,
  type PortsDesJetons,
} from '../../src/server/confirmation/jetons';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { purgerLesContacts } from '../../src/server/taches/purger-contacts';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 610000000;
const unSiren = () => String((sirens += 1));
const SECRET = randomBytes(32).toString('hex');
const EMPREINTE_IP = hex(8);
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-40-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'd'.repeat(64),
});
const PORTS: PortsDesJetons = {
  secret: SECRET,
  cles: CLES,
  compterAdresse: () => Promise.resolve({ autorise: true, panne: false }),
};
const requete = (jeton: string) => ({ jeton, empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 });
const octets = (r: unknown) => JSON.stringify(r);
const SANS_SUITE = octets(REPONSE_SANS_SUITE);

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  const MAINTENANT = new Date('2026-10-03T12:00:00.000Z');
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
  const id = randomUUID();
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
      ...(colonnesPii(
        { modele: MODELE_APPORTEUR, id },
        { prenom: 'Camille', nom: 'Témoin', email: `sec40-${hex(4)}@example.org` },
        CLES
      ) as unknown as { id: string }),
    },
  });
  apporteurId = id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Une attribution d'apporteur, au contact complet (blocs factices), par SQL brut. */
async function uneAttribution(
  p: { statut?: string; purgeContactAt?: Date | null; jetonDroits?: string | null } = {}
): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, raison_sociale,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare,
       purge_contact_at, jeton_droits_hash)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, 'espace', $5::uuid, '2026-10-01',
       false, false, 'Entreprise Témoin SAS', $6, $7, $8, $9, $10, $11, $12, $13, false, $14, $15)`,
    id,
    apporteurId,
    p.statut ?? 'provisoire',
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
    p.purgeContactAt ?? null,
    p.jetonDroits ?? null
  );
  return id;
}

/** Une demande ENVOYÉE (sauf état donné) et ses deux jetons en clair, que seul le test garde. */
async function uneDemande(p: { etat?: string; statut?: string } = {}) {
  const attributionId = await uneAttribution({ statut: p.statut });
  const jetons = tirerLesJetonsDeLaDemande(SECRET);
  const demandeId = await app.$transaction((tx) =>
    creerLaDemande(tx, {
      attributionId,
      jetonOuiHash: jetons.oui.empreinte,
      jetonNonHash: jetons.non.empreinte,
      acteur: { par: 'systeme' },
    })
  );
  const etat = p.etat ?? 'envoyee';
  if (etat !== 'planifiee') {
    await base.prisma.$executeRawUnsafe(
      `UPDATE demandes_confirmation SET etat = $2::etat_demande_confirmation,
         envoyee_at = clock_timestamp() WHERE id = $1::uuid`,
      demandeId,
      etat
    );
  }
  return { attributionId, demandeId, oui: jetons.oui.jeton, non: jetons.non.jeton };
}

/** Tout ce qu'une écriture pourrait changer : la demande, ses émissions, le journal. */
async function etatDe(demandeId: string) {
  const demande = await base.prisma.$queryRaw<unknown[]>`
    SELECT * FROM demandes_confirmation WHERE id = ${demandeId}::uuid`;
  const emissions = await base.prisma.$queryRaw<unknown[]>`
    SELECT * FROM emissions_demande_confirmation WHERE demande_id = ${demandeId}::uuid ORDER BY emise_at`;
  const journal = await base.prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM evenements`;
  return JSON.stringify({ demande, emissions, journal: String(journal[0]!.n) }, (_k, v: unknown) =>
    typeof v === 'bigint' ? String(v) : v
  );
}

const consommer = (jeton: string) =>
  app.$transaction((tx) => consommerLeJeton(tx, requete(jeton), PORTS));

describe('SEC-40 — l’ouverture du lien (GET)', () => {
  it('REQ-SEC-061 : TÉMOIN — un jeton valable ouvre la page, qui ne révèle que l’entreprise, l’apporteur et le sens', async () => {
    const d = await uneDemande();
    const oui = await ouvrirLeLien(app, requete(d.oui), PORTS);
    expect(oui).toEqual({
      etat: 'a_repondre',
      sens: 'oui',
      entreprise: 'Entreprise Témoin SAS',
      apporteur: { prenom: 'Camille', nom: 'Témoin' },
    });
    const non = await ouvrirLeLien(app, requete(d.non), PORTS);
    expect(non).toMatchObject({ etat: 'a_repondre', sens: 'non' });
    // Aucun identifiant ne sort : ni la demande, ni l'attribution, ni l'apporteur.
    expect(octets(oui)).not.toContain(d.demandeId);
    expect(octets(oui)).not.toContain(d.attributionId);
    expect(octets(oui)).not.toContain(apporteurId);
  });

  it('REQ-SEC-061 : TÉMOIN — un GET répété (analyseur de liens simulé) n’écrit RIEN', async () => {
    const d = await uneDemande();
    const avant = await etatDe(d.demandeId);
    for (let i = 0; i < 5; i++) {
      await ouvrirLeLien(app, requete(d.oui), PORTS);
      await ouvrirLeLien(app, requete(d.non), PORTS);
    }
    expect(await etatDe(d.demandeId)).toBe(avant);
    // Et le lien reste valable : l'ouverture n'a rien consommé.
    expect(await consommer(d.oui)).toEqual({
      etat: 'retenue',
      demandeId: d.demandeId,
      sens: 'oui',
    });
  });

  it('REQ-SEC-061 : TÉMOIN — l’ouverture tourne en LECTURE SEULE : une écriture glissée dans sa transaction est refusée par la base', async () => {
    const d = await uneDemande();
    // Face 2 : le même client, hors de la lecture seule, PEUT écrire — le refus vient bien d'elle.
    const lectureSeule = await app
      .$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`UPDATE demandes_confirmation SET repondu_at = clock_timestamp()
          WHERE id = ${d.demandeId}::uuid`;
      })
      .then(
        () => 'ecrit',
        (e: Error) => e.message
      );
    expect(lectureSeule).toMatch(/read-only transaction/);
    // Le module ouvre bien la sienne ainsi : sa transaction refuse toute écriture.
    let vue = '';
    const espion = {
      $transaction: (f: (tx: unknown) => Promise<unknown>) =>
        app.$transaction(async (tx) => {
          const r = await f(tx);
          vue = await tx.$queryRaw<
            { ro: string }[]
          >`SELECT current_setting('transaction_read_only') AS ro`.then((x) => x[0]!.ro);
          return r;
        }),
    } as unknown as PrismaClient;
    await ouvrirLeLien(espion, requete(d.oui), PORTS);
    expect(vue).toBe('on');
  });
});

describe('SEC-40 — la réponse (POST), à usage unique', () => {
  it('REQ-DM-008 : TÉMOIN — la réponse au lien est retenue une fois ; rejouée, sans effet et « sans suite »', async () => {
    const d = await uneDemande();
    expect(await consommer(d.oui)).toEqual({
      etat: 'retenue',
      demandeId: d.demandeId,
      sens: 'oui',
    });
    const apres = await etatDe(d.demandeId);
    expect(octets(await consommer(d.oui))).toBe(SANS_SUITE);
    expect(await etatDe(d.demandeId)).toBe(apres);
    const [l] = await base.prisma.$queryRaw<{ repondu: Date | null; ip: string | null }[]>`
      SELECT d.repondu_at AS repondu, e.clic_ip_hash AS ip FROM demandes_confirmation d
      JOIN emissions_demande_confirmation e ON e.demande_id = d.id AND e.revoquee_at IS NULL
      WHERE d.id = ${d.demandeId}::uuid`;
    expect(l!.repondu).not.toBeNull();
    // L'empreinte tronquée de l'adresse du clic, jamais l'adresse (REQ-SEC-024).
    expect(l!.ip).toBe(EMPREINTE_IP);
  });

  it('REQ-DM-008 : TÉMOIN — la première réponse fait foi pour les DEUX jetons : le « Non » après le « Oui » est sans suite', async () => {
    const d = await uneDemande();
    expect(await consommer(d.non)).toEqual({
      etat: 'retenue',
      demandeId: d.demandeId,
      sens: 'non',
    });
    expect(octets(await consommer(d.oui))).toBe(SANS_SUITE);
    expect(octets(await ouvrirLeLien(app, requete(d.oui), PORTS))).toBe(SANS_SUITE);
    expect(octets(await ouvrirLeLien(app, requete(d.non), PORTS))).toBe(SANS_SUITE);
  });

  it('REQ-SEC-061 : TÉMOIN — dix réponses concurrentes, sur les deux jetons : UNE seule retenue', async () => {
    const d = await uneDemande();
    const r = await Promise.all(
      Array.from({ length: 10 }, (_, i) => consommer(i % 2 === 0 ? d.oui : d.non))
    );
    expect(r.filter((x) => x.etat === 'retenue')).toHaveLength(1);
    expect(r.filter((x) => octets(x) === SANS_SUITE)).toHaveLength(9);
  });
});

describe('SEC-40 — aucun oracle : la même réponse, octet pour octet', () => {
  it('REQ-SEC-061 : TÉMOIN — rejoué, forgé, inconnu, révoqué, expiré, non envoyé, attribution libérée : une seule réponse', async () => {
    const rejoue = await uneDemande();
    await consommer(rejoue.oui);
    const revoque = await uneDemande();
    await app.$transaction((tx) =>
      emettreDeNouveau(tx, {
        demandeId: revoque.demandeId,
        ...(({ oui, non }) => ({ jetonOuiHash: oui.empreinte, jetonNonHash: non.empreinte }))(
          tirerLesJetonsDeLaDemande(SECRET)
        ),
        maintenant: new Date(),
      })
    );
    const expire = await uneDemande({ etat: 'expiree' });
    const planifiee = await uneDemande({ etat: 'planifiee' });
    const liberee = await uneDemande({ statut: 'perimee' });
    const cas: Record<string, string> = {
      rejoue: rejoue.oui,
      forge: 'x'.repeat(43),
      hors_forme: 'forge',
      inconnu: tirerUnJeton(),
      revoque: revoque.oui,
      expire: expire.oui,
      planifiee: planifiee.oui,
      liberee: liberee.oui,
    };
    for (const [nom, jeton] of Object.entries(cas)) {
      expect([nom, octets(await ouvrirLeLien(app, requete(jeton), PORTS))]).toEqual([
        nom,
        SANS_SUITE,
      ]);
      expect([nom, octets(await consommer(jeton))]).toEqual([nom, SANS_SUITE]);
    }
    // Face 2 : chacune de ces demandes, sauf la rejouée, n'a rien enregistré.
    for (const d of [revoque, expire, planifiee, liberee]) {
      const [l] = await base.prisma.$queryRaw<{ repondu: Date | null }[]>`
        SELECT repondu_at AS repondu FROM demandes_confirmation WHERE id = ${d.demandeId}::uuid`;
      expect(l!.repondu).toBeNull();
    }
  });
});

describe('SEC-40 — le jeton des droits du contact', () => {
  it('REQ-SEC-061 : TÉMOIN — un jeton des droits valable ouvre la page des droits, et rien d’autre n’en sort', async () => {
    const jeton = tirerUnJeton();
    const attributionId = await uneAttribution({
      statut: 'perdue',
      jetonDroits: empreinteDuJetonDesDroits(jeton, SECRET),
    });
    const r = await ouvrirLaPageDesDroits(app, requete(jeton), PORTS);
    expect(r).toEqual({ etat: 'a_exercer', attributionId });
  });

  it('REQ-SEC-061 : TÉMOIN — un jeton des droits inconnu ou PURGÉ donne la même réponse qu’un jeton faux, octet pour octet', async () => {
    const jeton = tirerUnJeton();
    const attributionId = await uneAttribution({
      statut: 'perdue',
      purgeContactAt: new Date('2026-01-01T00:00:00.000Z'),
      jetonDroits: empreinteDuJetonDesDroits(jeton, SECRET),
    });
    // Face 1 : avant la purge, le jeton ouvre la page — sans quoi le témoin ne prouverait rien.
    expect(await ouvrirLaPageDesDroits(app, requete(jeton), PORTS)).toEqual({
      etat: 'a_exercer',
      attributionId,
    });
    await purgerLesContacts(app, new Date('2026-10-03T12:00:00.000Z'));
    const [p] = await base.prisma.$queryRaw<{ jeton: string | null }[]>`
      SELECT jeton_droits_hash AS jeton FROM attributions WHERE id = ${attributionId}::uuid`;
    expect(p!.jeton).toBeNull();
    const purge = octets(await ouvrirLaPageDesDroits(app, requete(jeton), PORTS));
    const inconnu = octets(await ouvrirLaPageDesDroits(app, requete(tirerUnJeton()), PORTS));
    const faux = octets(await ouvrirLaPageDesDroits(app, requete('faux'), PORTS));
    expect([purge, inconnu, faux]).toEqual([SANS_SUITE, SANS_SUITE, SANS_SUITE]);
    // Un jeton de confirmation n'ouvre pas la page des droits : les domaines sont séparés.
    const d = await uneDemande();
    expect(octets(await ouvrirLaPageDesDroits(app, requete(d.oui), PORTS))).toBe(SANS_SUITE);
  });
});
