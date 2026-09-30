// @req REQ-QA-023
/**
 * QA-T53 — L'ÉCHEC DU RECHIFFREMENT, ET LE CLAIR QUI DURE, ALERTENT.
 *
 * Arbitrage -d7 sur délégation de Williams du 2026-09-30 (condition bloquante de la lentille
 * `securite` pour la PR de QA-T12) : un vidage qui reste en clair est la pire issue de la sauvegarde,
 * et un rouge dans l'onglet Actions ne réveille personne. Deux émetteurs, une seule catégorie close,
 * `rechiffrement_echoue` :
 *
 *   1. tout échec de `rechiffrer` (lecture, chiffrement ou dépôt) émet EXACTEMENT une alerte ; un
 *      rechiffrement réussi n'en émet aucune ;
 *   2. la garde des clairs émet la même alerte quand elle nomme un clair plus vieux que le seuil de la
 *      SSOT — c'est elle qui tient la durée du clair, planificateur sauté compris ; un clair plus
 *      jeune n'en émet aucune ;
 *   3. le message ne porte ni la clé du vidage, ni le motif de l'échec : la catégorie et un
 *      identifiant technique, rien d'autre.
 *
 * RM-11 : l'instant, le seuil et l'état du dépôt sont posés explicitement ; le dépôt vit en mémoire.
 */
import { describe, it, expect } from 'vitest';
import {
  rechiffrerOuAlerter,
  jugerLesClairs,
  PREFIXES,
  type Depot,
  type ObjetDuDepot,
} from '../../../scripts/sauvegarde/cycle';
import {
  CATEGORIES_ALERTE,
  creerAlerteur,
  type ObjetAlerte,
} from '../../../src/server/integrations/telegram/alertes';
import { SEUILS } from '../../../src/domain/seuils/ssot';

/** Une clé factice, propre à ce test : jamais la clé réelle. */
const CLE = 'cle-factice-de-test-alerte-rechiffrement-0001';
const MAINTENANT = new Date('2026-09-30T06:00:00Z');
const SEUIL = SEUILS.CLAIR_EN_DEPOT_MAX_MINUTES.valeur;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const NOM_DU_VIDAGE = 'pg-dump-partners-2026-09-30.dmp';

/** Il y a `minutes` minutes avant MAINTENANT, en ISO. */
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

function depot(initial: Record<string, { contenu: Buffer; date: string }>): Depot & {
  etat: Map<string, ObjetDuDepot & { contenu: Buffer }>;
} {
  const etat = new Map(
    Object.entries(initial).map(([cle, v]) => [cle, { cle, date: v.date, contenu: v.contenu }])
  );
  return {
    etat,
    lister: async (prefixe) =>
      [...etat.values()]
        .filter((o) => o.cle.startsWith(prefixe))
        .map(({ cle, date }) => ({ cle, date })),
    lire: async (cle) => {
      const o = etat.get(cle);
      if (!o) throw new Error(`absent : ${cle}`);
      return o.contenu;
    },
    ecrire: async (cle, contenu) => {
      etat.set(cle, { cle, date: MAINTENANT.toISOString(), contenu });
    },
    supprimer: async (cle) => {
      etat.delete(cle);
    },
  };
}

const unClair = (date: string) =>
  depot({ [`${PREFIXES.depot}${NOM_DU_VIDAGE}`]: { contenu: Buffer.from('vidage'), date } });

/** Un alerteur qui compte ce qu'on lui remet. */
function recueil() {
  const alertes: ObjetAlerte[] = [];
  return { alertes, alerter: async (o: ObjetAlerte) => void alertes.push(o) };
}

describe('REQ-QA-023 — la catégorie close `rechiffrement_echoue` existe', () => {
  it('REQ-QA-023 : elle est dans CATEGORIES_ALERTE', () => {
    expect(CATEGORIES_ALERTE).toContain('rechiffrement_echoue');
  });
});

describe('REQ-QA-023 — TÉMOIN : tout échec du rechiffrement alerte, exactement une fois', () => {
  it('REQ-QA-023 : un DÉPÔT qui échoue émet une alerte, et l’échec remonte', async () => {
    const d = unClair(ilYA(10));
    d.ecrire = async () => {
      throw new Error('écriture refusée');
    };
    const r = recueil();
    await expect(rechiffrerOuAlerter(d, CLE, r.alerter)).rejects.toThrow(/écriture refusée/);
    expect(r.alertes).toHaveLength(1);
    expect(r.alertes[0]!.categorie).toBe('rechiffrement_echoue');
    expect(r.alertes[0]!.id).toMatch(UUID);
  });

  it('REQ-QA-023 : une LECTURE qui échoue émet une alerte', async () => {
    const d = unClair(ilYA(10));
    d.lire = async () => {
      throw new Error('lecture refusée');
    };
    const r = recueil();
    await expect(rechiffrerOuAlerter(d, CLE, r.alerter)).rejects.toThrow(/lecture refusée/);
    expect(r.alertes.map((o) => o.categorie)).toEqual(['rechiffrement_echoue']);
  });

  it('REQ-QA-023 : un CHIFFREMENT qui échoue (phrase trop courte) émet une alerte', async () => {
    const d = unClair(ilYA(10));
    const r = recueil();
    await expect(rechiffrerOuAlerter(d, 'courte', r.alerter)).rejects.toThrow(/32 caractères/);
    expect(r.alertes.map((o) => o.categorie)).toEqual(['rechiffrement_echoue']);
  });

  it('REQ-QA-023 : une RELECTURE infidèle (clair gardé) émet une alerte', async () => {
    const d = unClair(ilYA(10));
    const ecrireFidele = d.ecrire;
    d.ecrire = async (cle, contenu) => ecrireFidele(cle, contenu.subarray(0, contenu.length - 1));
    const r = recueil();
    await expect(rechiffrerOuAlerter(d, CLE, r.alerter)).rejects.toThrow(/relu/);
    expect(r.alertes).toHaveLength(1);
  });

  it('REQ-QA-023 : CONTRE-TÉMOIN — un rechiffrement réussi n’émet aucune alerte', async () => {
    const d = unClair(ilYA(10));
    const r = recueil();
    expect(await rechiffrerOuAlerter(d, CLE, r.alerter)).toEqual({ rechiffres: 1 });
    expect(r.alertes).toEqual([]);
  });
});

describe('REQ-QA-023 — TÉMOIN : la garde des clairs alerte au-delà du seuil de la SSOT', () => {
  it('REQ-QA-023 : un clair plus vieux que le seuil, planificateur sauté, émet une alerte', async () => {
    // Aucun `rechiffrer` n'a tourné : le clair est resté là, seule la garde le voit.
    const d = unClair(ilYA(SEUIL + 1));
    const r = recueil();
    const j = await jugerLesClairs(d, MAINTENANT, SEUIL, r.alerter);
    expect(j.vieux).toHaveLength(1);
    expect(r.alertes).toHaveLength(1);
    expect(r.alertes[0]!.categorie).toBe('rechiffrement_echoue');
    expect(r.alertes[0]!.id).toMatch(UUID);
  });

  it('REQ-QA-023 : plusieurs clairs en souffrance émettent UNE alerte, pas une par clair', async () => {
    const d = depot({
      [`${PREFIXES.depot}a.dmp`]: { contenu: Buffer.from('a'), date: ilYA(SEUIL + 30) },
      [`${PREFIXES.depot}b.dmp`]: { contenu: Buffer.from('b'), date: ilYA(SEUIL + 60) },
    });
    const r = recueil();
    expect((await jugerLesClairs(d, MAINTENANT, SEUIL, r.alerter)).vieux).toHaveLength(2);
    expect(r.alertes).toHaveLength(1);
  });

  it('REQ-QA-023 : CONTRE-TÉMOIN — un clair plus jeune que le seuil n’émet aucune alerte', async () => {
    const d = unClair(ilYA(SEUIL - 1));
    const r = recueil();
    expect((await jugerLesClairs(d, MAINTENANT, SEUIL, r.alerter)).vieux).toEqual([]);
    expect(r.alertes).toEqual([]);
  });
});

describe('REQ-QA-023 — le message ne porte ni la clé du vidage, ni le motif', () => {
  it('REQ-QA-023 : l’alerte envoyée par l’alerteur réel ne nomme que la catégorie et un uuid', async () => {
    const corps: string[] = [];
    const alerteur = creerAlerteur({
      notifieur: { notifier: async (n) => void corps.push(`${n.sujet}\n${n.corps}`) },
      horloge: { maintenant: () => MAINTENANT.getTime() },
      plafondParHeure: 1,
    });
    const d = unClair(ilYA(SEUIL + 1));
    d.lire = async () => {
      throw new Error(`lecture refusée : ${PREFIXES.depot}${NOM_DU_VIDAGE}`);
    };
    const alerter = async (o: ObjetAlerte) => void (await alerteur.alerter(o));
    await expect(rechiffrerOuAlerter(d, CLE, alerter)).rejects.toThrow();
    expect(corps).toHaveLength(1);
    expect(corps[0]).toMatch(/rechiffrement_echoue/);
    expect(corps[0]).not.toContain(NOM_DU_VIDAGE);
    expect(corps[0]).not.toContain(PREFIXES.depot);
    expect(corps[0]).not.toMatch(/lecture refusée/);
  });
});
