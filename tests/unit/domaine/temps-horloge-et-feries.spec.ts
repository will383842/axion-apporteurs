// @req REQ-CPL-013
// @req REQ-QA-027
// @req REQ-UX-022
// @req REQ-UX-028
/**
 * CPL-T13 — le module `temps` (`src/domain/temps/`) : horloge injectée, heure légale de Paris
 * calculée à la main, calendrier des fériés versionné, jours et heures ouvrés du SLA.
 *
 * CE QUE CE FICHIER OPPOSE AU DOMAINE, ET POURQUOI CE SONT DES ORACLES.
 *   — L'heure de Paris est confrontée à `Intl.DateTimeFormat` (fuseau `Europe/Paris`), qui vit ICI
 *     et jamais dans le domaine : la base de fuseaux du moteur est une entrée cachée, le domaine
 *     code la règle européenne et le test la juge contre cette base.
 *   — Le calendrier civil (jours depuis l'époque, jour de semaine, 29 février) est confronté aux
 *     accesseurs UTC du moteur, pour chaque jour de 1996 à 2099.
 *   — Pâques est confrontée à une table publiée ET à un second algorithme (Gauss), indépendant de
 *     celui du domaine (Meeus-Jones-Butcher).
 *   — Les fériés de 2026 sont confrontés à la liste officielle.
 * Les sources sont citées au point d'usage (`Source:`), jamais une valeur tapée sans elle.
 *
 * CE QUI N'EST PAS ICI. Le relevé unique et le rattrapage des crons de REQ-QA-027 ne sont pas de
 * cette tâche : les titres de REQ-QA-027 ne parlent que de l'injection d'horloge.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import { horlogeSysteme } from '../../../src/lib/horloge';
import { ErreurTemps } from '../../../src/domain/temps/erreurs';
import {
  dateDepuisJours,
  joursDepuisEpoque,
  joursDeLaDate,
  jourDeSemaine,
  type DateCivile,
} from '../../../src/domain/temps/calendrier-civil';
import { depuisParis, versParis, type DateHeureParis } from '../../../src/domain/temps/paris';
import {
  CALENDRIER_FERIES_FR,
  LUNDI_DE_PENTECOTE_CHOME,
  dateDePaques,
  estJourOuvre,
  feriesDeLAnnee,
  type CalendrierFeries,
} from '../../../src/domain/temps/feries';
import { echeanceOuvree, heuresOuvreesEcoulees } from '../../../src/domain/temps/sla';

// Les consommateurs nommés par l'ADR du module : DM-09, UX-P1-07, DM-13, UX-P3-03, et le délai
// contractuel de paiement de dix jours ouvrés (art. 5.3).

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const DOSSIER_TEMPS = 'src/domain/temps';

// ── l'oracle de Paris ─────────────────────────────────────────────────────────────────────────

/** L'ORACLE : la base de fuseaux du moteur, jamais consultée par le domaine. */
const FORMAT_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const deux = (n: number) => String(n).padStart(2, '0');

/** « AAAA-MM-JJ hh:mm:ss » selon l'oracle, pour un instant à la seconde près. */
function parisSelonIntl(instant: number): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    FORMAT_PARIS.format(instant)
  );
  if (!m) throw new Error(`format inattendu de l'oracle : ${FORMAT_PARIS.format(instant)}`);
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
}

/** La même forme, calculée par le domaine. */
function texte(d: DateHeureParis): string {
  return (
    `${d.annee}-${deux(d.mois)}-${deux(d.jour)} ` +
    `${deux(d.heure)}:${deux(d.minute)}:${deux(d.seconde)}`
  );
}

const iso = (instant: number) => new Date(instant).toISOString();

/** Une heure légale de Paris, pour les attendus écrits à la main. */
function paris(annee: number, mois: number, jour: number, heure = 0, minute = 0): DateHeureParis {
  return { annee, mois, jour, heure, minute, seconde: 0, milliseconde: 0 };
}

/** L'erreur levée par `f`, pour en lire le motif et le message. */
function levee(f: () => unknown): ErreurTemps {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurTemps) return e;
    throw e;
  }
  throw new Error('aucune levée');
}

/** Première heure divergente entre le domaine et l'oracle sur `[debut, fin)` au pas `pas`. */
function premiereDivergence(debut: number, fin: number, pas: number) {
  let confrontes = 0;
  for (let t = debut; t < fin; t += pas) {
    confrontes++;
    const attendu = parisSelonIntl(t);
    const obtenu = texte(versParis(t));
    if (obtenu !== attendu) return { confrontes, divergence: { utc: iso(t), attendu, obtenu } };
  }
  return { confrontes, divergence: null };
}

/**
 * Les instants où l'oracle change de décalage, trouvés en balayant heure par heure du 20 au
 * 31 mars et du 20 au 31 octobre : ils ne supposent rien de la règle que le domaine code. Lus une
 * fois par année, puis réutilisés par les tests qui en ont besoin.
 */
const CHANGEMENTS_LUS = new Map<number, number[]>();
function changementsSelonIntl(annee: number): number[] {
  const deja = CHANGEMENTS_LUS.get(annee);
  if (deja) return deja;
  const decalage = (t: number) => {
    const [jour, heure] = parisSelonIntl(t).split(' ');
    const local = Date.parse(`${jour}T${heure}Z`);
    return local - t;
  };
  const trouves: number[] = [];
  for (const mois of [2, 9]) {
    for (let t = Date.UTC(annee, mois, 20); t < Date.UTC(annee, mois + 1, 1); t += HEURE) {
      if (decalage(t) !== decalage(t - HEURE)) trouves.push(t);
    }
  }
  CHANGEMENTS_LUS.set(annee, trouves);
  return trouves;
}

// ── REQ-QA-027 : l'injection d'horloge ──────────────────────────────────────────────────────

/** Les noms que le domaine du temps ne prononce jamais : l'horloge et la base de fuseaux du moteur. */
const NOMS_INTERDITS = /\b(Date|Intl|performance|process|globalThis)\b/g;

/** `chemin:ligne:nom` pour chaque nom interdit, commentaires compris. */
function nomsInterdits(fichiers: readonly { chemin: string; source: string }[]): string[] {
  const fautes: string[] = [];
  for (const { chemin, source } of fichiers) {
    source.split('\n').forEach((ligne, i) => {
      for (const m of ligne.matchAll(NOMS_INTERDITS)) fautes.push(`${chemin}:${i + 1}:${m[1]}`);
    });
  }
  return fautes;
}

function fichiersDuDossier(dossier: string): { chemin: string; source: string }[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = `${dossier}/${nom}`;
    return statSync(chemin).isDirectory()
      ? fichiersDuDossier(chemin)
      : [{ chemin, source: readFileSync(chemin, 'utf8') }];
  });
}

describe('REQ-QA-027 — le domaine reçoit une horloge injectée', () => {
  it('REQ-QA-027 — `horlogeFigee` rend toujours l’instant injecté ; un instant non entier est refusé', () => {
    const t = Date.UTC(2026, 8, 18, 13);
    const horloge = horlogeFigee(t);
    expect(horloge.maintenant()).toBe(t);
    expect(horloge.maintenant()).toBe(t);
    expect(levee(() => horlogeFigee(t + 0.5)).motif).toBe('instant_invalide');
    expect(levee(() => horlogeFigee(Number.NaN)).motif).toBe('instant_invalide');
  });

  it('REQ-QA-027 — `horlogeSysteme`, hors du domaine, est la seule à lire l’heure de la machine : millisecondes UTC entières', () => {
    const avant = Date.now();
    const lu = horlogeSysteme.maintenant();
    const apres = Date.now();
    expect(Number.isInteger(lu)).toBe(true);
    expect(lu).toBeGreaterThanOrEqual(avant);
    expect(lu).toBeLessThanOrEqual(apres);
  });

  it('REQ-QA-027 — aucun fichier de src/domain/temps/ ne nomme Date, Intl, performance, process ni globalThis', () => {
    const fichiers = fichiersDuDossier(DOSSIER_TEMPS);
    // Plancher : un parcours qui ne lirait plus rien rendrait le même `[]` qu'un domaine sain.
    expect(fichiers.length).toBeGreaterThanOrEqual(6);
    expect(nomsInterdits(fichiers)).toEqual([]);
    // Le témoin sait rougir, et nomme le fichier et la ligne — `Intl`, que le lint laisse passer.
    const bac = [
      ...fichiers,
      {
        chemin: `${DOSSIER_TEMPS}/zz-bac.ts`,
        source: 'export const a = 1;\nexport const f = new Intl.DateTimeFormat();\nglobalThis;\n',
      },
    ];
    expect(nomsInterdits(bac)).toEqual([
      `${DOSSIER_TEMPS}/zz-bac.ts:2:Intl`,
      `${DOSSIER_TEMPS}/zz-bac.ts:3:globalThis`,
    ]);
  });
});

// ── REQ-CPL-013 : calendrier civil et heure légale de Paris ──────────────────────────────────

describe('REQ-CPL-013 — calendrier civil et heure légale d’Europe/Paris, calculés sans le moteur', () => {
  it('REQ-CPL-013 — chaque jour de 1996 à 2099 : date civile, jour de semaine et aller-retour concordent avec l’oracle, 29 février compris', () => {
    const premier = Date.UTC(1996, 0, 1) / JOUR;
    const dernier = Date.UTC(2099, 11, 31) / JOUR;
    const fautes: string[] = [];
    for (let j = premier; j <= dernier; j++) {
      const oracle = new Date(j * JOUR);
      const d = dateDepuisJours(j);
      const attendu = [oracle.getUTCFullYear(), oracle.getUTCMonth() + 1, oracle.getUTCDate()];
      if (
        d.annee !== attendu[0] ||
        d.mois !== attendu[1] ||
        d.jour !== attendu[2] ||
        jourDeSemaine(j) !== oracle.getUTCDay() ||
        joursDepuisEpoque(d) !== j
      ) {
        fautes.push(`${j} : ${JSON.stringify(d)} ≠ ${attendu.join('-')}`);
      }
    }
    // 104 années, dont 26 bissextiles (1996 à 2096 ; 2000 l'est, 2100 est hors bornes).
    expect(dernier - premier + 1).toBe(104 * 365 + 26);
    expect(fautes.slice(0, 5)).toEqual([]);
    // 2000 et 2028 sont bissextiles ; 2027 ne l'est pas.
    expect(joursDeLaDate({ annee: 2000, mois: 2, jour: 29 })).toBe(Date.UTC(2000, 1, 29) / JOUR);
    expect(joursDeLaDate({ annee: 2028, mois: 2, jour: 29 })).toBe(Date.UTC(2028, 1, 29) / JOUR);
    expect(levee(() => joursDeLaDate({ annee: 2027, mois: 2, jour: 29 })).motif).toBe(
      'date_invalide'
    );
  });

  it('REQ-CPL-013 — chaque heure de 2026 à 2040 : `versParis` concorde avec Intl.DateTimeFormat Europe/Paris', () => {
    const debut = performance.now();
    const { confrontes, divergence } = premiereDivergence(
      Date.UTC(2026, 0, 1),
      Date.UTC(2041, 0, 1),
      HEURE
    );
    const duree = performance.now() - debut;
    expect(divergence).toBeNull();
    expect(confrontes).toBe(131_496);
    // Mesuré à l'écriture : environ 1,5 s. Au-delà de 5 s, passer au plan réduit du brief.
    expect(duree).toBeLessThan(5_000);
  });

  it('REQ-CPL-013 — de 1996 à 2099 : 48 h autour de chaque changement d’heure au quart d’heure, et midi de chaque jour, concordent avec l’oracle', () => {
    let confrontes = 0;
    const divergences: unknown[] = [];
    for (let annee = 1996; annee <= 2099; annee++) {
      const changements = changementsSelonIntl(annee);
      expect(changements.length, `changements de ${annee}`).toBe(2);
      for (const c of changements) {
        const r = premiereDivergence(c - JOUR, c + JOUR, HEURE / 4);
        confrontes += r.confrontes;
        if (r.divergence) divergences.push(r.divergence);
        // La milliseconde qui précède le changement, et le changement lui-même.
        for (const t of [c - 1, c]) {
          confrontes++;
          const attendu = parisSelonIntl(t - (t % 1000));
          if (texte(versParis(t)) !== attendu) divergences.push({ utc: iso(t), attendu });
        }
      }
      for (let t = Date.UTC(annee, 0, 1, 11); t < Date.UTC(annee + 1, 0, 1); t += JOUR) {
        confrontes++;
        if (texte(versParis(t)) !== parisSelonIntl(t)) divergences.push({ utc: iso(t) });
      }
    }
    expect(divergences.slice(0, 3)).toEqual([]);
    expect(confrontes).toBeGreaterThan(75_000);
  });

  it('REQ-CPL-013 — `depuisParis` : aller-retour exact ; heure inexistante du printemps décalée après le saut ; heure ambiguë d’automne à sa première occurrence', () => {
    // Chaque heure de 2026 à 2040. `versParis` est jugé par l'oracle sur ces mêmes heures (plus haut).
    const fautes: string[] = [];
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2041, 0, 1); t += HEURE) {
      const ici = versParis(t);
      const seconde = texte(versParis(t - HEURE)) === texte(ici);
      const attendu = seconde ? t - HEURE : t;
      if (depuisParis(ici) !== attendu) fautes.push(iso(t));
    }
    expect(fautes).toEqual([]);
    // Chaque année de 1996 à 2099, au jour du changement lu dans l'oracle.
    for (let annee = 1996; annee <= 2099; annee++) {
      const [printemps, automne] = changementsSelonIntl(annee) as [number, number];
      const jourP = parisSelonIntl(printemps).slice(0, 10);
      const [a, m, j] = jourP.split('-').map(Number) as [number, number, number];
      // 02:30 n'existe pas : l'heure rendue est 03:30, une heure « après le saut ».
      expect(parisSelonIntl(depuisParis(paris(a, m, j, 2, 30)))).toBe(`${jourP} 03:30:00`);
      // 02:30 existe deux fois : la première occurrence est la plus petite des deux.
      const jourA = parisSelonIntl(automne).slice(0, 10);
      const [b, n, k] = jourA.split('-').map(Number) as [number, number, number];
      const occurrences = [automne - HEURE / 2, automne + HEURE / 2];
      expect(occurrences.map(parisSelonIntl)).toEqual([`${jourA} 02:30:00`, `${jourA} 02:30:00`]);
      expect(depuisParis(paris(b, n, k, 2, 30))).toBe(Math.min(...occurrences));
    }
  });

  it('REQ-CPL-013 — hors des années 1996 à 2099 de Paris : levée hors_calendrier qui nomme l’instant', () => {
    // Les bornes sont des années DE PARIS (décision de l'orchestrateur du 2026-09-19, partners/ADR-0014) :
    // 1996-01-01 00:00 à Paris = 1995-12-31 23:00 UTC ; 2100-01-01 00:00 à Paris = 2099-12-31 23:00 UTC.
    // Le témoin des bornes du brief (sa panne n° 7) se lit donc à 1995-12-31T22:59:59.999Z ; 23:59 UTC est déjà 1996 à Paris.
    const avant = Date.UTC(1995, 11, 31, 22, 59, 59, 999);
    const e = levee(() => versParis(avant));
    expect(e.motif).toBe('hors_calendrier');
    expect(e.message).toContain(String(avant));
    expect(texte(versParis(Date.UTC(1995, 11, 31, 23)))).toBe('1996-01-01 00:00:00');
    expect(texte(versParis(Date.UTC(1995, 11, 31, 23, 59)))).toBe('1996-01-01 00:59:00');
    expect(versParis(Date.UTC(2099, 11, 31, 22, 59, 59, 999))).toEqual({
      ...paris(2099, 12, 31, 23, 59),
      seconde: 59,
      milliseconde: 999,
    });
    expect(levee(() => versParis(Date.UTC(2099, 11, 31, 23))).motif).toBe('hors_calendrier');
    expect(levee(() => versParis(Date.UTC(2100, 0, 1))).motif).toBe('hors_calendrier');
    expect(levee(() => depuisParis(paris(1995, 12, 31, 23, 59))).motif).toBe('hors_calendrier');
    expect(levee(() => depuisParis(paris(2100, 1, 1))).motif).toBe('hors_calendrier');
    expect(depuisParis(paris(1996, 1, 1))).toBe(Date.UTC(1995, 11, 31, 23));
    expect(depuisParis(paris(2099, 12, 31, 23, 59))).toBe(Date.UTC(2099, 11, 31, 22, 59));
  });

  it('REQ-CPL-013 — une heure légale invalide est refusée par un motif nommé, champ par champ', () => {
    const base = paris(2026, 3, 29, 12);
    const invalides: Partial<DateHeureParis>[] = [
      { mois: 0 },
      { mois: 13 },
      { jour: 0 },
      { mois: 2, jour: 30 },
      { mois: 4, jour: 31 },
      // Le 366ᵉ jour de mars 2026 est le 1er mars 2027 : même mois, autre jour, autre année.
      { jour: 366 },
      { jour: 1.5 },
      { mois: 1.5 },
      { heure: -1 },
      { heure: 24 },
      { minute: 60 },
      { seconde: 60 },
      { milliseconde: 1000 },
      { minute: 1.5 },
      { annee: 2026.5 },
    ];
    for (const champ of invalides) {
      expect(levee(() => depuisParis({ ...base, ...champ })).motif, JSON.stringify(champ)).toBe(
        'date_invalide'
      );
    }
    expect(levee(() => versParis(0.5 + Date.UTC(2026, 0, 1))).motif).toBe('instant_invalide');
    expect(depuisParis({ ...base, seconde: 59, milliseconde: 999 })).toBe(
      Date.UTC(2026, 2, 29, 10, 0, 59, 999)
    );
  });
});

// ── REQ-CPL-013 : les fériés versionnés ──────────────────────────────────────────────────────

/**
 * Dates de Pâques publiées.
 * Source: https://fr.wikipedia.org/wiki/Calcul_de_la_date_de_Pâques (dates remarquables :
 * 22 mars 2285 la plus précoce, 25 avril 2038 la plus tardive) et
 * https://www.census.gov/data/software/x13as/genhol/easter-dates.html (table 1600-2099).
 * Relevées par l'auteur (A05) le 2026-09-19 sans rechargement des pages en séance : la relecture
 * `exactitude` les confronte à la source.
 */
const PAQUES_PUBLIEES: readonly [number, number, number][] = [
  [2000, 4, 23],
  [2024, 3, 31],
  [2025, 4, 20],
  [2026, 4, 5],
  [2027, 3, 28],
  [2028, 4, 16],
  [2029, 4, 1],
  [2030, 4, 21],
  [2038, 4, 25],
];

/**
 * Second algorithme, INDÉPENDANT de celui du domaine : la méthode de Gauss pour le calendrier
 * grégorien, avec ses deux exceptions (26 avril → 19 avril ; 25 avril → 18 avril).
 * Source: https://fr.wikipedia.org/wiki/Calcul_de_la_date_de_Pâques (section « Méthode de Gauss »).
 */
function paquesSelonGauss(annee: number): [number, number] {
  const a = annee % 19;
  const b = annee % 4;
  const c = annee % 7;
  const k = Math.floor(annee / 100);
  const p = Math.floor((13 + 8 * k) / 25);
  const q = Math.floor(k / 4);
  const M = (15 - p + k - q) % 30;
  const N = (4 + k - q) % 7;
  const d = (19 * a + M) % 30;
  const e = (2 * b + 4 * c + 6 * d + N) % 7;
  if (d === 29 && e === 6) return [4, 19];
  if (d === 28 && e === 6 && (11 * M + 11) % 30 < 19) return [4, 18];
  const mars = 22 + d + e;
  return mars <= 31 ? [3, mars] : [4, d + e - 9];
}

/**
 * Les onze jours fériés de 2026, liste officielle.
 * Source: Code du travail, article L3133-1 (Légifrance) ; https://www.service-public.fr/particuliers/vosdroits/F2405
 * (« Jours fériés et ponts dans le secteur privé »), dates 2026 relevées par l'auteur (A05) le
 * 2026-09-19 sans rechargement de la page en séance.
 */
const FERIES_2026: readonly [string, string][] = [
  ['jour_de_l_an', '2026-01-01'],
  ['lundi_de_paques', '2026-04-06'],
  ['fete_du_travail', '2026-05-01'],
  ['victoire_1945', '2026-05-08'],
  ['ascension', '2026-05-14'],
  ['lundi_de_pentecote', '2026-05-25'],
  ['fete_nationale', '2026-07-14'],
  ['assomption', '2026-08-15'],
  ['toussaint', '2026-11-01'],
  ['armistice_1918', '2026-11-11'],
  ['noel', '2026-12-25'],
];

const texteDate = (d: DateCivile) => `${d.annee}-${deux(d.mois)}-${deux(d.jour)}`;

/** Les jours ouvrés d'un mois, énumérés jour par jour. */
function joursOuvresDuMois(annee: number, mois: number, calendrier?: CalendrierFeries): string[] {
  const ouvres: string[] = [];
  for (let jour = 1; jour <= 31; jour++) {
    if (new Date(Date.UTC(annee, mois - 1, jour)).getUTCMonth() !== mois - 1) break;
    const d = { annee, mois, jour };
    if (calendrier ? estJourOuvre(d, calendrier) : estJourOuvre(d)) ouvres.push(texteDate(d));
  }
  return ouvres;
}

describe('REQ-CPL-013 — calendrier des fériés FR versionné', () => {
  it('REQ-CPL-013 — Pâques calculée concorde avec la table publiée et, de 1996 à 2099, avec la méthode de Gauss ; 2285 est hors calendrier', () => {
    for (const [annee, mois, jour] of PAQUES_PUBLIEES) {
      expect(dateDePaques(annee), `Pâques ${annee}`).toEqual({ annee, mois, jour });
      expect(paquesSelonGauss(annee), `Gauss ${annee}`).toEqual([mois, jour]);
    }
    const fautes: number[] = [];
    for (let annee = 1996; annee <= 2099; annee++) {
      const p = dateDePaques(annee);
      const [mois, jour] = paquesSelonGauss(annee);
      if (p.mois !== mois || p.jour !== jour || jourDeSemaine(joursDepuisEpoque(p)) !== 0) {
        fautes.push(annee);
      }
    }
    expect(fautes).toEqual([]);
    expect(levee(() => dateDePaques(2285)).motif).toBe('hors_calendrier');
    expect(levee(() => dateDePaques(1995)).motif).toBe('hors_calendrier');
    expect(levee(() => dateDePaques(2026.5)).motif).toBe('date_invalide');
  });

  it('REQ-CPL-013 — 2026 : les onze fériés de la liste officielle, chacun avec son attribut « chômé » ; le calendrier porte sa version et sa source', () => {
    const feries = feriesDeLAnnee(2026);
    expect(feries.map((f) => [f.cle, texteDate(f.date)])).toEqual(FERIES_2026);
    expect(feries.filter((f) => !f.chome).map((f) => f.cle)).toEqual(['lundi_de_pentecote']);
    expect(CALENDRIER_FERIES_FR.version).toMatch(/^\d+$/);
    expect(CALENDRIER_FERIES_FR.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CALENDRIER_FERIES_FR.source).toContain('L3133-1');
    expect(CALENDRIER_FERIES_FR.jours).toHaveLength(11);
  });

  it('REQ-CPL-013 — de 1996 à 2099 : onze fériés par an, Ascension un jeudi, lundis de Pâques et de Pentecôte des lundis ; l’Ascension ne se confond avec le 1er ou le 8 mai que les années où l’oracle le prévoit', () => {
    const jourDe = (annee: number, cle: string) => {
      const f = feriesDeLAnnee(annee).find((x) => x.cle === cle);
      return jourDeSemaine(joursDepuisEpoque(f!.date));
    };
    const confondues: number[] = [];
    for (let annee = 1996; annee <= 2099; annee++) {
      const feries = feriesDeLAnnee(annee);
      const dates = feries.map((f) => texteDate(f.date));
      expect(new Set(feries.map((f) => f.cle)).size, `fériés ${annee}`).toBe(11);
      if (new Set(dates).size < 11) confondues.push(annee);
      expect(dates.every((d) => d.startsWith(String(annee)))).toBe(true);
      expect([
        jourDe(annee, 'lundi_de_paques'),
        jourDe(annee, 'ascension'),
        jourDe(annee, 'lundi_de_pentecote'),
      ]).toEqual([1, 4, 1]);
    }
    // Ascension = Pâques + 39 : elle tombe le 1er mai si Pâques est le 23 mars, le 8 mai si Pâques
    // est le 30 mars (1997 : jeudi 8 mai). Les années attendues se lisent dans l'oracle de Gauss.
    const attendues: number[] = [];
    for (let annee = 1996; annee <= 2099; annee++) {
      const [mois, jour] = paquesSelonGauss(annee);
      if (mois === 3 && (jour === 23 || jour === 30)) attendues.push(annee);
    }
    expect(attendues).toContain(1997);
    expect(confondues).toEqual(attendues);
  });

  it('REQ-CPL-013 — jour ouvré = lundi à vendredi hors férié chômé : un férié un dimanche ou un samedi n’en retire aucun', () => {
    // Mai 2026 : 21 jours de semaine, moins le 1er, le 8 (vendredis) et l'Ascension (jeudi 14) ;
    // le lundi de Pentecôte (25) reste travaillé.
    const mai = joursOuvresDuMois(2026, 5);
    expect(mai).toHaveLength(18);
    expect(mai).not.toContain('2026-05-14');
    expect(mai).toContain('2026-05-25');
    // Novembre 2026 : la Toussaint tombe un dimanche, rien n'est reporté au lundi 2.
    const novembre = joursOuvresDuMois(2026, 11);
    expect(novembre).toHaveLength(20);
    expect(novembre).toContain('2026-11-02');
    expect(novembre).not.toContain('2026-11-11');
    // Août 2026 : l'Assomption tombe un samedi.
    expect(joursOuvresDuMois(2026, 8)).toHaveLength(21);
    expect(estJourOuvre({ annee: 2026, mois: 11, jour: 1 })).toBe(false);
    expect(estJourOuvre({ annee: 2026, mois: 9, jour: 19 })).toBe(false);
    expect(estJourOuvre({ annee: 2026, mois: 9, jour: 18 })).toBe(true);
    expect(levee(() => estJourOuvre({ annee: 2026, mois: 2, jour: 29 })).motif).toBe(
      'date_invalide'
    );
    expect(levee(() => estJourOuvre({ annee: 2100, mois: 1, jour: 4 })).motif).toBe(
      'hors_calendrier'
    );
  });

  it('REQ-CPL-013 — le lundi de Pentecôte est férié au calendrier et TRAVAILLÉ par défaut ; basculer son attribut « chômé » change les jours ouvrés de mai 2027', () => {
    expect(LUNDI_DE_PENTECOTE_CHOME).toBe(false);
    const pentecote = CALENDRIER_FERIES_FR.jours.find((j) => j.cle === 'lundi_de_pentecote');
    expect(pentecote?.chome).toBe(LUNDI_DE_PENTECOTE_CHOME);
    // Pâques 2027 = 28 mars (table publiée) : lundi de Pentecôte = 17 mai 2027.
    const lundi = { annee: 2027, mois: 5, jour: 17 };
    expect(estJourOuvre(lundi)).toBe(true);
    const chome: CalendrierFeries = {
      ...CALENDRIER_FERIES_FR,
      jours: CALENDRIER_FERIES_FR.jours.map((j) =>
        j.cle === 'lundi_de_pentecote' ? { ...j, chome: true } : j
      ),
    };
    expect(estJourOuvre(lundi, chome)).toBe(false);
    const parDefaut = joursOuvresDuMois(2027, 5);
    const bascule = joursOuvresDuMois(2027, 5, chome);
    expect(parDefaut.filter((d) => !bascule.includes(d))).toEqual(['2027-05-17']);
    expect(bascule.filter((d) => !parDefaut.includes(d))).toEqual([]);
  });
});

// ── REQ-UX-022 et REQ-UX-028 : le SLA en heures ouvrées ──────────────────────────────────────

/** Générateur congruentiel à graine fixe : les tirages se rejouent à l'identique. */
function tirages(graine: number) {
  let x = graine >>> 0;
  return (borne: number) => {
    x = (Math.imul(x, 1_664_525) + 1_013_904_223) >>> 0;
    return x % borne;
  };
}

/**
 * Décompte heure par heure à l'ORACLE : une heure UTC alignée compte si l'oracle la place dans un
 * jour de Paris ouvré. Les changements d'heure ont lieu à 01:00 UTC : une heure alignée ne chevauche
 * jamais deux jours de Paris.
 */
function heuresOuvreesSelonIntl(debut: number, fin: number): number {
  let n = 0;
  for (let t = debut; t < fin; t += HEURE) {
    const [a, m, j] = parisSelonIntl(t).slice(0, 10).split('-').map(Number) as [
      number,
      number,
      number,
    ];
    if (estJourOuvre({ annee: a, mois: m, jour: j })) n++;
  }
  return n;
}

describe('REQ-UX-022 — le chrono SLA de 48 h ouvrées, calendrier des fériés France', () => {
  it('REQ-UX-022 — 48 h ouvrées : vendredi 15 h → mardi 15 h ; samedi → mercredi 0 h ; veille de l’Ascension → lundi 15 h ; semaines des changements d’heure', () => {
    const cas: [DateHeureParis, DateHeureParis, number, number][] = [
      [
        paris(2026, 9, 18, 15),
        paris(2026, 9, 22, 15),
        Date.UTC(2026, 8, 18, 13),
        Date.UTC(2026, 8, 22, 13),
      ],
      [
        paris(2026, 9, 19, 10),
        paris(2026, 9, 23),
        Date.UTC(2026, 8, 19, 8),
        Date.UTC(2026, 8, 22, 22),
      ],
      [
        paris(2026, 5, 13, 15),
        paris(2026, 5, 18, 15),
        Date.UTC(2026, 4, 13, 13),
        Date.UTC(2026, 4, 18, 13),
      ],
      [
        paris(2026, 3, 27, 15),
        paris(2026, 3, 31, 15),
        Date.UTC(2026, 2, 27, 14),
        Date.UTC(2026, 2, 31, 13),
      ],
      [
        paris(2026, 10, 23, 15),
        paris(2026, 10, 27, 15),
        Date.UTC(2026, 9, 23, 13),
        Date.UTC(2026, 9, 27, 14),
      ],
    ];
    for (const [depart, echeance, departUtc, echeanceUtc] of cas) {
      expect(depuisParis(depart)).toBe(departUtc);
      const obtenu = echeanceOuvree(departUtc, 48);
      expect(versParis(obtenu), texte(depart)).toEqual(echeance);
      expect(obtenu, texte(depart)).toBe(echeanceUtc);
      expect(heuresOuvreesEcoulees(departUtc, obtenu)).toBe(48);
    }
  });

  it('REQ-UX-022 — un départ hors jour ouvré compte depuis le début du jour ouvré suivant ; l’échéance est exclusive', () => {
    const vendrediMinuit = depuisParis(paris(2026, 9, 18));
    // [vendredi 0 h, samedi 0 h) contient exactement 24 h ouvrées : l'échéance est samedi 0 h.
    expect(versParis(echeanceOuvree(vendrediMinuit, 24))).toEqual(paris(2026, 9, 19));
    expect(heuresOuvreesEcoulees(vendrediMinuit, depuisParis(paris(2026, 9, 21)))).toBe(24);
    const samedi = depuisParis(paris(2026, 9, 19, 10));
    expect(versParis(echeanceOuvree(samedi, 0))).toEqual(paris(2026, 9, 21));
    expect(echeanceOuvree(vendrediMinuit, 0)).toBe(vendrediMinuit);
    expect(heuresOuvreesEcoulees(samedi, depuisParis(paris(2026, 9, 21)))).toBe(0);
    expect(heuresOuvreesEcoulees(samedi, samedi)).toBe(0);
    expect(heuresOuvreesEcoulees(samedi, depuisParis(paris(2026, 9, 21, 0, 30)))).toBe(0.5);
  });

  it('REQ-UX-022 — les changements d’heure de 1996 à 2099 tombent tous un dimanche, à 01:00 UTC : aucune échéance ne tombe dans un trou ni un doublon', () => {
    const horsDimanche: string[] = [];
    for (let annee = 1996; annee <= 2099; annee++) {
      for (const c of changementsSelonIntl(annee)) {
        if (new Date(c).getUTCDay() !== 0 || new Date(c).getUTCHours() !== 1)
          horsDimanche.push(iso(c));
      }
    }
    expect(horsDimanche).toEqual([]);
  });

  it('REQ-UX-022 — sur des intervalles tirés de 2026 à 2040, `heuresOuvreesEcoulees` concorde avec un décompte heure par heure à l’oracle, et `echeanceOuvree` est le premier instant qui atteint la durée', () => {
    const tirer = tirages(20260919);
    const origine = Date.UTC(2026, 0, 1);
    const heures = (Date.UTC(2041, 0, 1) - origine) / HEURE - 24 * 12;
    for (let i = 0; i < 300; i++) {
      const debut = origine + tirer(heures) * HEURE;
      const fin = debut + tirer(24 * 10) * HEURE;
      expect(heuresOuvreesEcoulees(debut, fin), iso(debut)).toBe(
        heuresOuvreesSelonIntl(debut, fin)
      );
    }
    for (let i = 0; i < 2000; i++) {
      const debut = origine + tirer(heures) * HEURE + tirer(HEURE);
      const duree = tirer(121);
      const e = echeanceOuvree(debut, duree);
      expect(heuresOuvreesEcoulees(debut, e), `${iso(debut)} + ${duree}`).toBe(duree);
      if (duree > 0) expect(heuresOuvreesEcoulees(debut, e - 1)).toBeLessThan(duree);
    }
  });

  it('REQ-UX-022 — durée négative ou non entière, fin avant début, échéance après 2099 : levées nommées', () => {
    const t = depuisParis(paris(2026, 9, 18, 15));
    expect(levee(() => echeanceOuvree(t, -1)).motif).toBe('duree_invalide');
    expect(levee(() => echeanceOuvree(t, 1.5)).motif).toBe('duree_invalide');
    expect(levee(() => heuresOuvreesEcoulees(t, t - 1)).motif).toBe('intervalle_inverse');
    // Jeudi 31 décembre 2099, dernier jour ouvré du calendrier : sa fin est 2100-01-01 0 h.
    const dernier = depuisParis(paris(2099, 12, 31));
    expect(estJourOuvre({ annee: 2099, mois: 12, jour: 31 })).toBe(true);
    expect(echeanceOuvree(dernier, 23)).toBe(depuisParis(paris(2099, 12, 31, 23)));
    expect(levee(() => echeanceOuvree(dernier, 24)).motif).toBe('hors_calendrier');
    expect(levee(() => echeanceOuvree(dernier, 25)).motif).toBe('hors_calendrier');
  });
});

describe('REQ-UX-028 — « réponse sous 2 jours ouvrés », mesurée par le même module de SLA', () => {
  it('REQ-UX-028 — 2 jours ouvrés sont 48 h ouvrées de la même fonction : un message de la veille de l’Ascension à 18 h appelle une réponse avant le lundi 18 h', () => {
    const recu = depuisParis(paris(2026, 5, 13, 18));
    const avant = echeanceOuvree(recu, 2 * 24);
    expect(versParis(avant)).toEqual(paris(2026, 5, 18, 18));
    expect(heuresOuvreesEcoulees(recu, avant) / 24).toBe(2);
  });
});
