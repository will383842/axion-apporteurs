/**
 * corps-de-pr.ts — REND le corps d'une PR depuis les sources du dépôt (GOV-024, REQ-GOV-032).
 *
 * ⚠️ L'EN-TÊTE NOMMAIT `GOV-035`, ET C'EST LA QUATRIÈME FOIS DE LA JOURNÉE QU'UNE ATTRIBUTION
 * EST FAUSSE. `docs/tasks.json` range ce fichier dans les `paths` de GOV-024 ; l'acceptance de
 * GOV-035 écrit elle-même qu'elle ne le porte pas. Les NOMBRES de ce dépôt se dérivent désormais ;
 * les ATTRIBUTIONS, non — rien ne confronte le nom de tâche écrit dans un en-tête ou dans
 * `docs/gates.json.tache` aux `paths` du backlog. C'est l'objet de GOV-037.
 *
 * USAGE : pnpm pr:corps -- --gabarit <fichier.tpl.md> --sortie <fichier.md> --tests <journal>
 *         (les trois sont OBLIGATOIRES : sans `--tests`, le rendu échoue. Les crochets qu'a portés
 *          cette ligne étaient le repli silencieux de la règle 2, ressuscité en prose.)
 *
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST DANS LE DÉPÔT.
 *
 * La lentille `exactitude` a rendu quatre verdicts sur la PR #31, et son observation de clôture
 * vaut plus que ses vingt constats : après que les compteurs du journal et de `docs/gates.json`
 * ont été rendus DÉRIVÉS, les affirmations fausses qui restaient étaient TOUTES dans ce que le
 * script ne rendait pas.
 *
 *     « La frontière de la dérivation est devenue la frontière de la vérité. »
 *
 * Le corps de PR est donc entré dans le périmètre de la dérivation. Mais la première version de ce
 * générateur vivait dans un répertoire de travail HORS DU DÉPÔT — et la même lentille a retourné
 * son observation contre le remède : un générateur d'artefact publié qui n'a ni chemin, ni tâche,
 * ni étape de CI, et qui disparaît avec la session, déplace la frontière de la dérivation sans
 * déplacer celle du DÉPÔT. Il est ici pour cette raison, et pour aucune autre.
 *
 * ── DEUX RÈGLES QUE CE FICHIER TIENT, ET QUI VIENNENT D'ERREURS PAYÉES ────────────────────────
 *
 * 1. UN MARQUEUR NON RÉSOLU FAIT ÉCHOUER LE RENDU. Un corps publié avec `{{TACHES}}` dedans est
 *    pire qu'un compteur faux : il a l'air d'un gabarit oublié, donc personne ne le lit.
 *
 * 2. AUCUNE VALEUR N'A DE REPLI SILENCIEUX. La première version faisait retomber les compteurs de
 *    la suite de tests sur `'?'` quand le journal manquait — or `'?'` n'est pas un marqueur, donc
 *    la règle 1 ne le couvrait pas. Résultat mesuré : le corps a publié « 385 tests » alors que la
 *    suite en comptait 387, parce que le générateur avait lu le journal du commit PRÉCÉDENT.
 *    🔑 Un repli qui a l'air d'une valeur échappe à la garde qui vérifie les valeurs. Ici, un
 *    journal absent, illisible ou plus vieux que `HEAD` fait ÉCHOUER le rendu.
 *
 * ── ET UNE TROISIÈME, SUR LA DÉRIVATION ELLE-MÊME ────────────────────────────────────────────
 *
 * 3. UNE DÉRIVATION SE FAIT SUR L'EXPRESSION QUI PORTE LE SENS, PAS SUR CE QUI LUI RESSEMBLE.
 *    `CHAMPS_TOTAL` a d'abord été tiré d'un `grep -c "cle:"` : il rendait 23 là où `CHAMPS.length`
 *    vaut 19, d'autres structures du module portant la même clé. Le corps a publié « 7 champs sur
 *    23 » — une affirmation fausse produite par la machine installée pour ne plus en produire.
 *    🔑 Une dérivation faite sur la mauvaise expression n'est pas plus vraie qu'un nombre tapé :
 *    elle est seulement plus difficile à mettre en doute, puisqu'elle a l'air calculée.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { CHAMPS } from '../../src/config/entite';

type Tache = { id: string; phase: number; statut: string; pr?: number | null; reqs: string[] };

const LIVREE = new Set(['fusionnee', 'deployee', 'verifiee']);
const MOTS: Record<number, string> = {
  1: 'une', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six',
  7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix', 11: 'onze', 12: 'douze',
};

function arg(nom: string): string | null {
  const i = process.argv.indexOf(`--${nom}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : null;
}

/**
 * Les compteurs de la suite, LUS dans son journal — et REFUSÉS si ce journal est plus ancien que
 * le dernier commit. Un corps qui annonce les tests d'un commit précédent est une affirmation
 * fausse sur l'état du code, pas une approximation.
 */
function suite(chemin: string | null): { fichiers: string; tests: string } {
  if (!chemin) throw new Error('`--tests <journal>` est obligatoire : sans lui le corps annoncerait des tests qu’il n’a pas lus.');
  if (!existsSync(chemin)) throw new Error(`journal de tests introuvable : ${chemin}`);
  const dateJournal = statSync(chemin).mtimeMs;
  const dateHead = Number(execFileSync('git', ['log', '-1', '--format=%ct'], { encoding: 'utf8' }).trim()) * 1000;
  if (dateJournal < dateHead) {
    throw new Error(
      `le journal de tests (${new Date(dateJournal).toISOString()}) est ANTÉRIEUR au dernier commit ` +
        `(${new Date(dateHead).toISOString()}) : il décrit un autre état du code. Relance la suite.`
    );
  }
  const t = readFileSync(chemin, 'utf8').replace(/\[[0-9;]*m/g, '');
  const f = /Test Files\s+(\d+) passed \((\d+)\)/.exec(t);
  const n = /Tests\s+(\d+) passed \((\d+)\)/.exec(t);
  if (!f || !n) throw new Error(`journal de tests illisible : ni « Test Files … passed » ni « Tests … passed » dans ${chemin}`);
  return { fichiers: `${f[1]}/${f[2]}`, tests: `${n[1]}/${n[2]}` };
}

export function valeurs(pr: number, journalTests: string | null): Record<string, string> {
  const T = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] }).taches;
  const G = (JSON.parse(readFileSync('docs/gates.json', 'utf8')) as { gates: { preuveRouge: string | null }[] }).gates;
  const R = (JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as { exigences: unknown[] }).exigences;
  const surLaPr = T.filter((t) => t.pr === pr);
  const s = suite(journalTests);

  return {
    TACHES: String(T.length),
    GATES: String(G.length),
    GATES_ARMEES: String(G.filter((g) => g.preuveRouge).length),
    EXIGENCES: String(R.length),
    NB_SUR_LA_PR: String(surLaPr.length),
    MOT_SUR_LA_PR: MOTS[surLaPr.length] ?? String(surLaPr.length),
    LISTE_SUR_LA_PR: surLaPr.map((t) => '`' + t.id + '`').join(', '),
    RESTE_PHASE_MOINS_1: T.filter((t) => t.phase === -1 && !LIVREE.has(t.statut) && t.pr !== pr)
      .map((t) => '`' + t.id + '`')
      .join(', '),
    // Dérivé de `CHAMPS`, jamais d'un motif qui lui ressemble — voir la règle 3 en tête.
    CHAMPS_SANS_ANCRE: String(CHAMPS.filter((c) => c.ancre === null).length),
    CHAMPS_TOTAL: String(CHAMPS.length),
    SUITE_FICHIERS: s.fichiers,
    SUITE_TESTS: s.tests,
  };
}

export function rendre(gabarit: string, v: Record<string, string>): string {
  let out = gabarit;
  for (const [k, val] of Object.entries(v)) out = out.split(`{{${k}}}`).join(val);
  const restants = [...out.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]);
  if (restants.length > 0) {
    throw new Error(`marqueur(s) non résolu(s) : ${[...new Set(restants)].join(', ')}`);
  }
  return out;
}

if (process.argv[1]?.endsWith('corps-de-pr.ts')) {
  const gabarit = arg('gabarit');
  const sortie = arg('sortie');
  const pr = Number(arg('pr') ?? '31');
  if (!gabarit || !sortie) {
    console.error('usage: pnpm pr:corps -- --gabarit <x.tpl.md> --sortie <x.md> --tests <journal> [--pr <n>]');
    process.exit(1);
  }
  try {
    const v = valeurs(pr, arg('tests'));
    writeFileSync(sortie, rendre(readFileSync(gabarit, 'utf8'), v));
    console.log(`✅ ${sortie} rendu depuis les sources du dépôt :`);
    for (const [k, val] of Object.entries(v)) console.log(`   ${k.padEnd(20)} ${val}`);
  } catch (e) {
    console.error(`❌ pr:corps — ${(e as Error).message}`);
    process.exit(1);
  }
}
