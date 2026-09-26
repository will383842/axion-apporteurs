// @req REQ-SEC-001
// @req REQ-SEC-002
// @req REQ-SEC-016
/**
 * `lien-magique-production.spec.ts` — le CÂBLAGE du lien magique (SEC-03) : ce que l'action serveur
 * et la route donnent au noyau, sans base ni cache.
 *
 * CE QU'IL PROUVE.
 *   1. La configuration vient des secrets jugés par `src/lib/env.ts` : `MAGIC_LINK_SECRET` pour le
 *      lien, `SESSION_SECRET` pour la session, leurs `kid` par `kidDe`, jamais `PII_HASH_KEY` ;
 *      l'adresse publique vient du registre de l'entité (`domaines.servi`), jamais d'un en-tête.
 *   2. Les empreintes sont celles de la couche des données personnelles (courriel, adresse réseau).
 *   3. Les compteurs sont ceux du REGISTRE : sans adresse de cache, le compteur est en panne et la
 *      demande est refusée (`indisponible`), rien n'est planifié — la conduite `refuser` du registre.
 *   4. L'envoi passe par le notifieur : au puits, seuls le sujet et la taille du corps sont écrits,
 *      jamais le lien, jamais l'adresse.
 *
 * L'environnement de test est DÉRIVÉ de `NOMS_DES_SECRETS`, jamais recopié ; les courriels sont en
 * `example.org`.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { creerNotifieur } from '../../../src/lib/notify';
import { domaines } from '../../../src/config/entite';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import {
  clesPii,
  empreinteAdresseReseau,
  empreinteRecherche,
} from '../../../src/server/securite/pii';
import { demanderLien, empreinteDuJeton } from '../../../src/server/auth/lien-magique';
import {
  configurationDuLien,
  envoiParLeNotifieur,
  portsDeDemande,
  type DependancesDuLien,
} from '../../../src/server/auth/lien-magique-production';

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const valeurTemoin = (nom: string): string => `temoin-sec03-${nom.toLowerCase()}-`.padEnd(48, '0');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(NOMS_DES_SECRETS.map((n) => [n, valeurTemoin(n)])),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const CLES = clesPii(ENV);
const INSTANT = Date.UTC(2026, 8, 26, 8, 0, 0);

function dependances(o: Partial<DependancesDuLien> = {}) {
  const planifies: Array<() => Promise<void>> = [];
  const avertissements: string[] = [];
  const d: DependancesDuLien = {
    env: ENV,
    // Le câblage de la DEMANDE ne touche pas la base avant la réponse : un client vide suffit, et
    // tout accès le ferait lever.
    prisma: new Proxy(
      {},
      {
        get: () => {
          throw new Error('base touchée avant la réponse');
        },
      }
    ) as unknown as PrismaClient,
    horloge: horlogeFigee(INSTANT),
    planifier: (travail) => planifies.push(travail),
    envoi: { envoyer: async () => undefined },
    journal: { warn: (m: string) => avertissements.push(m) },
    ...o,
  };
  return { d, planifies, avertissements };
}

describe('REQ-SEC-001 — la configuration du lien vient des secrets de l’environnement', () => {
  it('REQ-SEC-001 : MAGIC_LINK_SECRET et SESSION_SECRET, leurs kid, et l’adresse publique du registre', () => {
    const c = configurationDuLien(ENV);
    expect(c.secret).toBe(ENV.MAGIC_LINK_SECRET);
    expect(c.kid).toBe(kidDe(ENV.MAGIC_LINK_SECRET ?? ''));
    expect(c.session).toEqual({
      secret: ENV.SESSION_SECRET,
      kid: kidDe(ENV.SESSION_SECRET ?? ''),
    });
    expect(c.urlPublique).toBe(`https://${domaines().servi}`);
    // Face 2 : la clé des empreintes de personnes n'est aucun des deux secrets.
    expect([c.secret, c.session.secret]).not.toContain(ENV.PII_HASH_KEY);
  });

  it('REQ-SEC-001 : un environnement refusé lève en NOMMANT la variable, sans aucune valeur', () => {
    const sansLien: Record<string, string> = { ...ENV };
    delete sansLien.MAGIC_LINK_SECRET;
    let message = '';
    try {
      configurationDuLien(sansLien);
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain('MAGIC_LINK_SECRET');
    for (const valeur of Object.values(sansLien)) {
      if (valeur.length > 8) expect(message).not.toContain(valeur);
    }
  });
});

describe('REQ-SEC-001 REQ-SEC-002 — les ports de la demande, câblés', () => {
  it('REQ-SEC-001 : empreintes de courriel et d’adresse réseau de la couche des données personnelles', () => {
    const p = portsDeDemande(dependances().d);
    expect(p.empreinteCourriel('Marie@Example.org')).toBe(
      empreinteRecherche('courriel', 'marie@example.org', CLES)
    );
    expect(p.empreinteCourriel('marie-example.org')).toBeNull();
    expect(p.empreinteAdresseReseau('203.0.113.7')).toBe(
      empreinteAdresseReseau('203.0.113.7', CLES)
    );
    expect(p.adresseDuClient(new Headers({ 'x-forwarded-for': '203.0.113.7' }))).toBe(
      '203.0.113.7'
    );
    expect(p.maintenant().getTime()).toBe(INSTANT);
  });

  it('REQ-SEC-016 : sans adresse de cache, le compteur du registre est en panne et la demande refusée', async () => {
    // Le magasin du registre lit REDIS_URL : absente ici, il est aveugle, et la conduite déclarée
    // au registre pour `magic:ip` est `refuser`.
    expect(process.env.REDIS_URL ?? '').toBe('');
    const { d, planifies, avertissements } = dependances();
    const etat = await demanderLien(
      {
        saisie: 'marie@example.org',
        piege: false,
        entetes: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
      },
      portsDeDemande(d)
    );
    expect(etat).toBe('indisponible');
    expect(planifies).toHaveLength(0);
    expect(avertissements).toEqual([]);
  });

  it('REQ-SEC-001 : un échec du travail différé est signalé sans donnée personnelle', () => {
    const { d, avertissements } = dependances();
    portsDeDemande(d).emission.signalerEchec('travail_differe_echoue');
    expect(avertissements).toEqual(['lien_magique_travail_differe_echoue']);
  });
});

describe('REQ-SEC-001 — l’envoi passe par le notifieur, et le puits ne voit ni lien ni adresse', () => {
  it('REQ-SEC-001 : au puits, le sujet et la taille du corps seulement', async () => {
    const lignes: Array<{ msg: string; donnees: unknown }> = [];
    const journal = {
      debug: () => undefined,
      info: (msg: string, donnees?: unknown) => lignes.push({ msg, donnees }),
      warn: () => undefined,
      error: () => undefined,
      fatal: () => undefined,
      enfant() {
        return journal;
      },
    };
    const notifieur = creerNotifieur({ env: { NOTIFY_SINK: 'true' }, journal, transports: [] });
    const jeton = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    await envoiParLeNotifieur(notifieur).envoyer({
      a: 'marie@example.org',
      sujet: 'sujet',
      corps: `corps https://partners.example.org/connexion/${jeton}`,
    });
    expect(lignes).toHaveLength(1);
    const ecrit = JSON.stringify(lignes);
    expect(ecrit).toContain('notification_retenue');
    expect(ecrit).not.toContain(jeton);
    expect(ecrit).not.toContain('marie');
    expect(ecrit).not.toContain(empreinteDuJeton(jeton, ENV.MAGIC_LINK_SECRET ?? ''));
  });
});
