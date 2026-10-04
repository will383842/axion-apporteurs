// @req REQ-INT-024
// @req REQ-SEC-033
/**
 * SEC-64 — le transfert des alertes vers Telegram, hors de l'Union européenne (juriste, #708,
 * 5981327565 et 5982244103).
 *
 * DEUX VERROUS :
 *   1. Avant de poser `TELEGRAM_BOT_TOKEN` en production, Williams tranche le pays du service et
 *      l'encadrement du transfert, et le registre le dit. Tant que la décision n'est pas consignée
 *      (`DECISION_TRANSFERT_TELEGRAM` nulle), le démarrage en production avec un jeton est REFUSÉ, nommé.
 *   2. Aucune alerte ne porte de donnée personnelle, ni d'un utilisateur de la console ni d'un
 *      apporteur : le témoin DÉRIVE de `CATEGORIES_ALERTE`, jamais d'une liste recopiée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import {
  CATEGORIES_ALERTE,
  DECISION_TRANSFERT_TELEGRAM,
  exigerLeTransfertConsigne,
  messageDAlerte,
  type ObjetAlerte,
} from '../../../src/server/integrations/telegram/alertes';

const PRODUCTION = { NODE_ENV: 'production', PARTNERS_ENV: 'production' } as const;
const JETON = { TELEGRAM_BOT_TOKEN: 'jeton-factice-de-test', TELEGRAM_CHAT_ID: '-100' } as const;
const DECISION = {
  pays: 'Pays de test',
  encadrement: 'Encadrement de test',
  decideLe: '2026-10-04',
  source: '#719',
} as const;

function refus(f: () => void): string {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return 'aucun refus';
}

describe('REQ-INT-024 — le transfert vers Telegram attend la décision de Williams', () => {
  it('REQ-INT-024 : TÉMOIN — en production, un jeton sans décision consignée REFUSE le démarrage, nommé', () => {
    expect(refus(() => exigerLeTransfertConsigne({ ...PRODUCTION, ...JETON }, null))).toMatch(
      /^transfert_telegram_non_consigne/
    );
  });

  it('REQ-INT-024 : la décision consignée lève le verrou ; sans jeton, rien n’est refusé', () => {
    expect(refus(() => exigerLeTransfertConsigne({ ...PRODUCTION, ...JETON }, DECISION))).toBe(
      'aucun refus'
    );
    expect(refus(() => exigerLeTransfertConsigne({ ...PRODUCTION }, null))).toBe('aucun refus');
    expect(
      refus(() => exigerLeTransfertConsigne({ ...PRODUCTION, TELEGRAM_BOT_TOKEN: '' }, null))
    ).toBe('aucun refus');
  });

  it('REQ-INT-024 : TÉMOIN (sécurité, 5982916235) — le verrou juge le JETON posé, dans TOUT environnement où le canal réel se construirait : préversion, développement, forge', () => {
    for (const env of [
      { NODE_ENV: 'production', PARTNERS_ENV: 'preview' },
      { NODE_ENV: 'development' },
      {},
    ]) {
      expect(
        refus(() => exigerLeTransfertConsigne({ ...env, ...JETON }, null)),
        JSON.stringify(env)
      ).toMatch(/^transfert_telegram_non_consigne/);
    }
  });

  it('REQ-INT-024 : le verrou est un module PUR, sans aucune dépendance, importable par les scripts', () => {
    const source = readFileSync('src/server/integrations/telegram/transfert.ts', 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it('REQ-INT-024 : TÉMOIN — par défaut, le verrou lit la décision du code : aujourd’hui nulle, donc le démarrage en production avec un jeton est refusé', () => {
    expect(DECISION_TRANSFERT_TELEGRAM).toBeNull();
    expect(refus(() => exigerLeTransfertConsigne({ ...PRODUCTION, ...JETON }))).toMatch(
      /^transfert_telegram_non_consigne/
    );
  });

  it('REQ-INT-024 : TÉMOIN — le canal du lanceur passe par le verrou : en production, un jeton sans décision ne construit aucun canal', async () => {
    const { canalDAlerte } = await import('../../../src/server/taches/inscriptions');
    expect(refus(() => canalDAlerte({ ...PRODUCTION, ...JETON }))).toMatch(
      /^transfert_telegram_non_consigne/
    );
    expect(canalDAlerte({ ...PRODUCTION })).toBeNull();
  });

  it('REQ-SEC-033 : TÉMOIN — le registre dit la même chose que le code : décision nulle, la cellule annonce que le pays et l’encadrement restent à préciser ; consignée, elle les nomme', () => {
    const registre = readFileSync('docs/rgpd/registre-article-30.md', 'utf8');
    const cellule = registre
      .split('\n')
      .find((l) => l.startsWith('| Transferts hors Union européenne |') && l.includes('Telegram'));
    expect(cellule).toBeDefined();
    if (DECISION_TRANSFERT_TELEGRAM === null) {
      expect(cellule).toMatch(/À compléter|seront précisés ici avant leur mise en service/);
    } else {
      expect(cellule).toContain(DECISION_TRANSFERT_TELEGRAM.pays);
      expect(cellule).toContain(DECISION_TRANSFERT_TELEGRAM.encadrement);
    }
  });
});

/** Un objet d'alerte CHARGÉ de données personnelles dans chacun de ses champs libres. */
const PERSONNES = {
  courriel: 'jeanne.martin@exemple.test',
  telephone: '0612345678',
  nom: 'Jeanne Martin',
} as const;

function objetCharge(categorie: (typeof CATEGORIES_ALERTE)[number]): ObjetAlerte {
  const charge: unknown = {
    categorie,
    id: PERSONNES.courriel,
    compte: PERSONNES.telephone,
    deploiement: {
      attendu: PERSONNES.nom,
      servi: PERSONNES.courriel,
      environnement: PERSONNES.nom,
    },
    attente: { forme: PERSONNES.nom, type: PERSONNES.courriel, nombre: 1, plusAncienneJours: 2 },
    reconciliation: { genre: PERSONNES.nom, motif: PERSONNES.courriel, nombre: 3 },
    nonRendu: { motif: PERSONNES.nom, nombre: 4 },
    nom: PERSONNES.nom,
  };
  return charge as ObjetAlerte;
}

/** Les fichiers suivis sous une racine. */
function fichiersDe(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = `${dossier}/${nom}`;
    return statSync(chemin).isDirectory() ? fichiersDe(chemin) : [chemin];
  });
}

describe('REQ-SEC-033 — aucune alerte ne porte de donnée personnelle, catégorie par catégorie', () => {
  it('REQ-SEC-033 : TÉMOIN — pour CHAQUE catégorie de CATEGORIES_ALERTE, un objet chargé de données personnelles ne laisse rien passer dans le message', () => {
    expect(CATEGORIES_ALERTE.length).toBeGreaterThan(0);
    for (const categorie of CATEGORIES_ALERTE) {
      for (const gabarit of ['alerte', 'alerte_plafond'] as const) {
        const message = messageDAlerte(gabarit, objetCharge(categorie));
        for (const valeur of Object.values(PERSONNES)) {
          expect(message, `${categorie} · ${gabarit}`).not.toContain(valeur);
        }
        expect(message).toContain(`[${categorie}]`);
      }
    }
  });

  it('REQ-SEC-033 : TÉMOIN STATIQUE — chaque alerte émise du dépôt a pour identifiant un uuid TIRÉ (randomUUID) et aucun compte : jamais l’identifiant d’un utilisateur de la console ni d’un apporteur', () => {
    const categories = CATEGORIES_ALERTE.join('|');
    const litteral = new RegExp(`categorie: '(?:${categories})'`);
    const emetteurs = [...fichiersDe('src'), ...fichiersDe('scripts')].filter(
      (f) =>
        /\.ts$/.test(f) &&
        f !== 'src/server/integrations/telegram/alertes.ts' &&
        // La garde confronte un objet de TEST chargé exprès ; elle n'émet rien.
        f !== 'src/server/integrations/telegram/garde-sans-pii.ts'
    );
    let sites = 0;
    for (const f of emetteurs) {
      const lignes = readFileSync(f, 'utf8').split('\n');
      lignes.forEach((ligne, i) => {
        if (!litteral.test(ligne)) return;
        sites += 1;
        // L'objet littéral de l'alerte : sa ligne et les quatre suivantes.
        const objet = lignes.slice(i, i + 5).join('\n');
        expect(objet, `${f}:${i + 1}`).toMatch(/\bid: randomUUID\(\)/);
        expect(objet, `${f}:${i + 1}`).not.toMatch(/\bcompte\s*:/);
      });
    }
    expect(sites).toBeGreaterThan(0);
  });
});

/** Un fichier LIT le jeton du bot s'il le prend dans un environnement. */
const LECTURE_DU_JETON = /\b(?:process\.)?env\.TELEGRAM_BOT_TOKEN\b/;
/** Un lecteur du jeton sans appel du verrou. */
const lecteurSansVerrou = (source: string): boolean =>
  LECTURE_DU_JETON.test(source) && !/\bexigerLeTransfertConsigne\(/.test(source);

describe('REQ-INT-024 — tout lecteur du jeton passe par le verrou (sécurité, 5982916235)', () => {
  it('REQ-INT-024 : TÉMOIN STATIQUE — chaque fichier de src/ et scripts/ qui lit TELEGRAM_BOT_TOKEN appelle exigerLeTransfertConsigne', () => {
    const lecteurs = [...fichiersDe('src'), ...fichiersDe('scripts')].filter(
      (f) =>
        /\.[cm]?[jt]s$/.test(f) &&
        // Le verrou lui-même lit le jeton pour le juger.
        f !== 'src/server/integrations/telegram/transfert.ts' &&
        LECTURE_DU_JETON.test(readFileSync(f, 'utf8'))
    );
    expect(lecteurs.sort()).toEqual([
      'scripts/gates/deploy-verify.ts',
      'scripts/sauvegarde/cycle.ts',
      'src/server/taches/inscriptions.ts',
    ]);
    for (const f of lecteurs) expect(lecteurSansVerrou(readFileSync(f, 'utf8')), f).toBe(false);
  });

  it('REQ-INT-024 : contre-témoin — un lecteur du jeton SANS le verrou est vu ; avec lui, non', () => {
    expect(lecteurSansVerrou('const j = process.env.TELEGRAM_BOT_TOKEN;')).toBe(true);
    expect(lecteurSansVerrou('const j = env.TELEGRAM_BOT_TOKEN;')).toBe(true);
    expect(
      lecteurSansVerrou(
        'exigerLeTransfertConsigne(process.env);\nconst j = process.env.TELEGRAM_BOT_TOKEN;'
      )
    ).toBe(false);
    expect(lecteurSansVerrou('const autre = env.TELEGRAM_CHAT_ID;')).toBe(false);
  });
});
