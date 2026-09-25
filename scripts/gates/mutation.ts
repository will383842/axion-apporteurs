/**
 * Le lecteur du rapport de Stryker — QA-T30 (REQ-QA-002). Appelé par `scripts/gates/stryker.sh`
 * (`pnpm mutation`), après la passe de Stryker, dans le travail de nuit.
 *
 * CE QU'IL FAIT. Il lit `reports/mutation/mutation.json` (schéma `mutation-testing-report-schema`)
 * et le seuil de rupture DÉCLARÉ dans `stryker.config.json` (`thresholds.break`), jamais retapé ici
 * (RM-01). Il calcule le score comme Stryker — détectés (tués, délai dépassé) sur détectés plus non
 * détectés (survivants, sans couverture) ; les erreurs de compilation ou d'exécution et les mutants
 * ignorés ne comptent ni pour ni contre — et :
 *   - NOMME chaque mutant non détecté : `fichier:ligne`, mutateur, remplacement, statut. Un compte
 *     seul ne dit pas quoi corriger ; ce défaut a déjà coûté trois fois dans ce dépôt ;
 *   - sort en 1 sous le seuil (`score_sous_le_seuil`), sur un rapport absent, illisible ou vide
 *     (`rapport_illisible`) et sur un seuil absent (`seuil_absent`) : jamais un vert sans mesure.
 *
 * `--prove` : un témoin par famille, et un contre-témoin vert.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ID_REGISTRE = 'mutation';
export const CHEMIN_RAPPORT = 'reports/mutation/mutation.json';
export const CHEMIN_CONFIG = 'stryker.config.json';

export const FAMILLES = ['rapport_illisible', 'seuil_absent', 'score_sous_le_seuil'] as const;
export type Famille = (typeof FAMILLES)[number];

export interface Mutant {
  id: string;
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: { line: number; column: number } };
}
export interface Rapport {
  schemaVersion?: string;
  files: Record<string, { mutants: Mutant[] }>;
}

export interface Entree {
  /** Le rapport tel que lu : `null` s'il est absent ou n'est pas du JSON. */
  rapport: unknown;
  seuil: number | null;
}

export interface Decision {
  code: 0 | 1;
  familles: Famille[];
  lignes: string[];
}

const DETECTES = new Set(['Killed', 'Timeout']);
const NON_DETECTES = new Set(['Survived', 'NoCoverage']);

/** Le seuil de rupture déclaré par la configuration, ou `null`. */
export function lireSeuil(texteConfig: string): number | null {
  try {
    const c = JSON.parse(texteConfig) as { thresholds?: { break?: unknown } };
    const s = c.thresholds?.break;
    return typeof s === 'number' && Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

function estRapport(x: unknown): x is Rapport {
  if (typeof x !== 'object' || x === null || !('files' in x)) return false;
  const files = (x as { files: unknown }).files;
  if (typeof files !== 'object' || files === null) return false;
  return Object.values(files).every(
    (f) =>
      typeof f === 'object' && f !== null && Array.isArray((f as { mutants?: unknown }).mutants)
  );
}

const refus = (famille: Famille, message: string): Decision => ({
  code: 1,
  familles: [famille],
  lignes: [`❌ ${ID_REGISTRE} — [${famille}] ${message}`],
});

/** PURE : juge un rapport contre un seuil, n'écrit rien, ne sort pas. */
export function decider({ rapport, seuil }: Entree): Decision {
  if (!estRapport(rapport)) {
    return refus('rapport_illisible', `${CHEMIN_RAPPORT} absent, illisible ou hors schéma.`);
  }
  const mutants = Object.entries(rapport.files).flatMap(([fichier, f]) =>
    f.mutants.map((m) => ({ fichier, m }))
  );
  const detectes = mutants.filter(({ m }) => DETECTES.has(m.status)).length;
  const nonDetectes = mutants.filter(({ m }) => NON_DETECTES.has(m.status));
  const juges = detectes + nonDetectes.length;
  if (juges === 0) {
    return refus(
      'rapport_illisible',
      `${CHEMIN_RAPPORT} ne porte aucun mutant jugé : rien n'a été mesuré.`
    );
  }
  if (seuil === null) {
    return refus(
      'seuil_absent',
      `${CHEMIN_CONFIG} ne déclare pas de \`thresholds.break\` numérique.`
    );
  }
  const score = (detectes / juges) * 100;
  const survivants = nonDetectes
    .sort(
      (a, b) =>
        a.fichier.localeCompare(b.fichier) || a.m.location.start.line - b.m.location.start.line
    )
    .map(
      ({ fichier, m }) =>
        `   · ${fichier}:${m.location.start.line} ${m.status} — ${m.mutatorName}` +
        (m.replacement !== undefined ? ` → ${m.replacement.replace(/\s+/g, ' ').slice(0, 80)}` : '')
    );
  const bilan =
    `score ${score.toFixed(2)} % (${detectes} détectés sur ${juges} jugés, ` +
    `${mutants.length - juges} hors score), seuil ${seuil} % lu dans ${CHEMIN_CONFIG} ; ` +
    `${nonDetectes.length} mutant(s) non détecté(s)`;
  if (score < seuil) {
    return {
      code: 1,
      familles: ['score_sous_le_seuil'],
      lignes: [`❌ ${ID_REGISTRE} — [score_sous_le_seuil] ${bilan} :`, ...survivants],
    };
  }
  return {
    code: 0,
    familles: [],
    lignes: [`✅ ${ID_REGISTRE} — ${bilan}${survivants.length > 0 ? ' :' : '.'}`, ...survivants],
  };
}

// ── `--prove` ───────────────────────────────────────────────────────────────────────────────────

const mutant = (status: string, ligne: number): Mutant => ({
  id: String(ligne),
  mutatorName: 'ConditionalExpression',
  replacement: 'true',
  status,
  location: { start: { line: ligne, column: 1 } },
});
const unRapport = (...statuts: string[]): Rapport => ({
  files: { 'src/domain/temoin.ts': { mutants: statuts.map((s, i) => mutant(s, i + 1)) } },
});

export const TEMOINS: readonly { famille: Famille; entree: () => Entree }[] = [
  { famille: 'rapport_illisible', entree: () => ({ rapport: null, seuil: 80 }) },
  { famille: 'seuil_absent', entree: () => ({ rapport: unRapport('Killed'), seuil: null }) },
  {
    famille: 'score_sous_le_seuil',
    entree: () => ({ rapport: unRapport('Killed', 'Survived'), seuil: 80 }),
  },
];

function prouver(): Decision {
  const lignes: string[] = [];
  let echecs = 0;
  for (const t of TEMOINS) {
    const d = decider(t.entree());
    const mord = d.code === 1 && d.familles.includes(t.famille);
    if (!mord) echecs++;
    lignes.push(`   ${mord ? '✓' : '✗'} ${t.famille}`);
  }
  const contre = decider({
    rapport: unRapport('Killed', 'Killed', 'Killed', 'Killed', 'Survived'),
    seuil: 80,
  });
  if (contre.code !== 0) echecs++;
  lignes.push(
    `   ${contre.code === 0 ? '✓' : '✗'} contre-témoin : 80 % contre un seuil de 80 passe`
  );
  const tete =
    echecs === 0
      ? `✅ ${ID_REGISTRE} --prove — les ${TEMOINS.length} familles rougissent chacune sur son témoin, et le contre-témoin passe.`
      : `❌ ${ID_REGISTRE} --prove — ${echecs} témoin(s) n'ont pas rendu le verdict attendu.`;
  return { code: echecs === 0 ? 0 : 1, familles: [], lignes: [tete, ...lignes] };
}

function lire(chemin: string): string | null {
  try {
    return readFileSync(chemin, 'utf8');
  } catch {
    return null;
  }
}

function juger(): Decision {
  const texte = lire(CHEMIN_RAPPORT);
  let rapport: unknown;
  try {
    rapport = texte === null ? null : (JSON.parse(texte) as unknown);
  } catch {
    rapport = null;
  }
  return decider({ rapport, seuil: lireSeuil(lire(CHEMIN_CONFIG) ?? '') });
}

// GARDÉE : ce module est IMPORTÉ par son test, et l'import ne doit ni juger ni sortir.
const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

if (APPELE_DIRECTEMENT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
