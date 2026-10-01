// @req REQ-SEC-001
// @req REQ-INT-022
/**
 * SEC-42 — LE LIEN MAGIQUE PART EN PRODUCTION, par l'émetteur de courriels (`demanderEnvoi`).
 *
 * L'écart « C3 » de la vérification de bout en bout du 2026-09-30 : en production, le seul transport du notifieur levait
 * `envoi_courriel_non_cable`, et `demanderEnvoi` n'était importé nulle part hors du relais. Le seul
 * parcours utilisateur de la Phase 0 n'existait donc pas.
 *
 * CE QU'IL PROUVE, en production SIMULÉE, relais et dépôt simulés :
 *   1. `demanderLien` écrit EXACTEMENT une ligne `courriels_envoyes` et appelle le relais EXACTEMENT
 *      une fois, quand le drapeau DMARC est posé ;
 *   2. drapeau fermé : la ligne est `retenu_dmarc_non_verifie`, et AUCUN appel (REQ-INT-022) ;
 *   3. le jeton n'est conservé nulle part après l'envoi : ni dans la ligne, ni au journal ;
 *   4. hors production, l'envoi reste au puits du notifieur, et aucune ligne n'est écrite ;
 *   5. le relais de production refuse tant que le relais réel n'est pas livré : la ligne le dit
 *      (`echec`, code fermé), jamais un envoi fantôme.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { domaines } from '../../../src/config/entite';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import { clesPii } from '../../../src/server/securite/pii';
import type { VerdictDeLimite } from '../../../src/server/securite/rate-limit';
import { demanderLien, empreinteDuJeton } from '../../../src/server/auth/lien-magique';
import {
  configurationDuLien,
  dependancesDuProcessus,
  envoiDuProcessus,
  portsDeConsommation,
  portsDeDemande,
  relaisDeProduction,
  type DependancesDuLien,
} from '../../../src/server/auth/lien-magique-production';
import type {
  DependancesDeLEmetteur,
  LigneCourriel,
  Relais,
} from '../../../src/server/integrations/zeptomail/emetteur';

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const valeurTemoin = (nom: string): string => `temoin-sec42-${nom.toLowerCase()}-`.padEnd(48, '0');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(NOMS_DES_SECRETS.map((n) => [n, valeurTemoin(n)])),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const PRODUCTION = { ...ENV, NODE_ENV: 'production', PARTNERS_ENV: 'production' };
const CLES = clesPii(ENV);
const INSTANT = Date.UTC(2026, 9, 1, 23, 0, 0);
const COURRIEL = 'marie@example.org';

/** L'émetteur simulé : un relais et un dépôt qui COMPTENT. */
function emetteurSimule(dmarcVerifie: boolean, relais?: Relais) {
  const lignes: LigneCourriel[] = [];
  const envois: Array<{ a: string; corps: string }> = [];
  const deps: DependancesDeLEmetteur = {
    configuration: { expediteur: `contact@${domaines().envoi}`, dmarcVerifie },
    relais: relais ?? {
      async envoyer(m) {
        envois.push({ a: m.a, corps: m.corps });
        return { messageId: 'id-relais-1' };
      },
    },
    depot: {
      estSupprimee: async () => false,
      consigner: async (l) => void lignes.push(l),
    },
    cles: CLES,
    maintenant: () => new Date(INSTANT),
    nouvelId: () => '00000000-0000-4000-8000-000000000042',
  };
  return { deps, lignes, envois };
}

/** Les dépendances du lien, avec l'envoi du processus en production simulée. */
function dependances(env: Record<string, string>, emetteur: () => DependancesDeLEmetteur) {
  const planifies: Array<() => Promise<void>> = [];
  const journal: string[] = [];
  const puits: string[] = [];
  const d: DependancesDuLien = {
    env,
    // L'envoi ne touche pas la base du lien : un client vide suffit.
    prisma: Object.create(null) as PrismaClient,
    horloge: horlogeFigee(INSTANT),
    planifier: (travail) => planifies.push(travail),
    envoi: envoiDuProcessus(env, {
      emetteur,
      notifieur: () => ({ notifier: async (n) => void puits.push(n.sujet) }),
    }),
    journal: { warn: (m: string) => journal.push(m) },
  };
  return { d, planifies, journal, puits };
}

/** Le jeton d'une URL de connexion. */
const jetonDe = (corps: string) => /\/connexion\/([A-Za-z0-9_-]+)/.exec(corps)?.[1] ?? '';

/** Joue l'envoi d'un lien par la vraie fonction d'émission, à l'adresse stockée. */
async function envoyerUnLien(d: DependancesDuLien) {
  const ports = portsDeDemande(d);
  await ports.emission.envoyer({
    a: COURRIEL,
    url: 'https://x.example/connexion/JETON-TEMOIN-SEC42',
    expireAt: new Date(INSTANT),
  });
}

describe('REQ-SEC-001 REQ-INT-022 — en production, le lien part par l’émetteur', () => {
  it('REQ-INT-022 : drapeau DMARC posé — une ligne, un appel au relais, à l’adresse stockée', async () => {
    const e = emetteurSimule(true);
    const { d } = dependances(PRODUCTION, () => e.deps);
    await envoyerUnLien(d);
    expect(e.envois).toHaveLength(1);
    expect(e.envois[0]!.a).toBe(COURRIEL);
    expect(e.lignes).toHaveLength(1);
    expect(e.lignes[0]).toMatchObject({ gabarit: 'lien_magique', statut: 'envoye' });
  });

  it('REQ-INT-022 : drapeau DMARC fermé — la ligne est retenue, AUCUN appel', async () => {
    const e = emetteurSimule(false);
    const { d } = dependances(PRODUCTION, () => e.deps);
    await envoyerUnLien(d);
    expect(e.envois).toEqual([]);
    expect(e.lignes).toHaveLength(1);
    expect(e.lignes[0]!.statut).toBe('retenu_dmarc_non_verifie');
  });

  it('REQ-SEC-001 : le jeton n’est conservé NULLE PART après l’envoi — ni dans la ligne, ni au journal', async () => {
    const e = emetteurSimule(true);
    const { d, journal } = dependances(PRODUCTION, () => e.deps);
    await envoyerUnLien(d);
    const jeton = jetonDe(e.envois[0]!.corps);
    expect(jeton).not.toBe('');
    const conserve = JSON.stringify([e.lignes, journal]);
    expect(conserve).not.toContain(jeton);
    expect(conserve).not.toContain(empreinteDuJeton(jeton, ENV.MAGIC_LINK_SECRET ?? ''));
    expect(conserve).not.toContain(COURRIEL);
  });

  it('REQ-INT-022 : le relais de production refuse tant que le relais réel n’est pas livré — la ligne dit l’échec', async () => {
    const e = emetteurSimule(true, relaisDeProduction);
    const { d } = dependances(PRODUCTION, () => e.deps);
    await envoyerUnLien(d);
    expect(e.lignes).toHaveLength(1);
    expect(e.lignes[0]).toMatchObject({ statut: 'echec', erreur: 'relais_en_echec' });
  });

  it('REQ-SEC-001 : bout en bout — `demanderLien` en production planifie un envoi qui écrit UNE ligne et fait UN appel', async () => {
    const e = emetteurSimule(true);
    const { d, planifies } = dependances(PRODUCTION, () => e.deps);
    const ports = portsDeDemande(d);
    // Un compte existe et peut ouvrir l'espace : sa lecture et l'écriture du lien sont simulées ;
    // l'envoi, lui, est le vrai port câblé.
    const admis: VerdictDeLimite = {
      autorise: true,
      restant: 1,
      repriseAt: null,
      panne: false,
      motif: 'admis',
    };
    await demanderLien(
      { saisie: COURRIEL, piege: false, entetes: new Headers() },
      {
        ...ports,
        adresseDuClient: () => '203.0.113.7',
        compterAdresse: async () => admis,
        compterCourriel: async () => admis,
        emission: {
          ...ports.emission,
          trouverApporteur: async () => ({
            id: '11111111-1111-4111-8111-111111111111',
            statut: 'signe',
          }),
          adresseStockee: async () => COURRIEL,
          annulerLiensActifs: async () => undefined,
          insererLien: async () => undefined,
        },
      }
    );
    for (const t of planifies) await t();
    expect(e.envois).toHaveLength(1);
    expect(e.lignes).toHaveLength(1);
  });
});

describe('REQ-SEC-001 — hors production, l’envoi reste au puits du notifieur', () => {
  it('REQ-SEC-001 : aucune ligne, aucun appel au relais, le sujet au puits', async () => {
    const e = emetteurSimule(true);
    const { d, puits } = dependances(ENV, () => e.deps);
    await envoyerUnLien(d);
    expect(e.envois).toEqual([]);
    expect(e.lignes).toEqual([]);
    expect(puits).toHaveLength(1);
  });
});

describe('REQ-SEC-001 — le câblage du processus', () => {
  it('REQ-INT-022 : le relais de production refuse en se nommant', async () => {
    await expect(
      relaisDeProduction.envoyer({
        de: 'a@b.c',
        a: 'd@e.f',
        sujet: 's',
        corps: 'c',
        reference: 'r',
      })
    ).rejects.toThrow('relais_non_livre');
  });

  it('REQ-SEC-001 : un client de base par processus, et `planifier` confié à `apres`', () => {
    const confies: unknown[] = [];
    const apres = (t: () => Promise<void>) => void confies.push(t);
    const d1 = dependancesDuProcessus({ apres, env: { ...ENV, NOTIFY_SINK: 'true' } });
    const d2 = dependancesDuProcessus({ apres, env: { ...ENV, NOTIFY_SINK: 'true' } });
    expect(d1.prisma).toBe(d2.prisma);
    const travail = async () => undefined;
    d1.planifier(travail);
    expect(confies).toEqual([travail]);
  });

  it('REQ-SEC-001 : hors production, le processus envoie au puits — aucune configuration d’émetteur n’est lue', async () => {
    const d = dependancesDuProcessus({
      apres: () => undefined,
      env: { ...ENV, NOTIFY_SINK: 'true' },
    });
    await expect(d.envoi.envoyer({ a: COURRIEL, sujet: 's', corps: 'c' })).resolves.toBeUndefined();
  });

  it('REQ-INT-022 : en production, le processus passe par l’émetteur — sans expéditeur configuré, l’envoi est refusé en le nommant', async () => {
    const d = dependancesDuProcessus({ apres: () => undefined, env: PRODUCTION });
    await expect(d.envoi.envoyer({ a: COURRIEL, sujet: 's', corps: 'c' })).rejects.toThrow(
      'configuration_refusee : expediteur_absent'
    );
  });

  it('REQ-SEC-001 : la consommation porte la configuration du lien, et un environnement refusé se nomme', () => {
    const ports = portsDeConsommation({
      env: ENV,
      prisma: Object.create(null) as PrismaClient,
      horloge: horlogeFigee(INSTANT),
    });
    expect(ports.configuration).toEqual(configurationDuLien(ENV));
    expect(ports.maintenant().getTime()).toBe(INSTANT);
    expect(() => configurationDuLien({ NODE_ENV: 'test' })).toThrow(
      /environnement refusé par src\/lib\/env\.ts — /
    );
  });
});
