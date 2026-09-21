/**
 * prevol.ts — le PRÉ-VOL local, DÉRIVÉ de la porte A (REQ-GOV-018, RM-01).
 *
 * USAGE : pnpm prevol            rend les vues, puis rejoue la porte A dans son ordre
 *         pnpm prevol --liste    n'exécute rien : imprime les étapes dérivées et sort en 0
 *
 * POURQUOI CE FICHIER EXISTE. `docs/CONVENTIONS.md` §7 (« les hooks locaux ne font pas foi :
 * husky n'est pas fiable en worktree, le pré-vol est `pnpm prevol` »), `docs/CHARTE-AGENTS.md`,
 * `docs/agents.json` et la fiche `dev-partners` IMPOSENT `pnpm prevol` depuis le socle. Le script
 * n'existait pas et `package.json` ne portait pas l'entrée : chaque agent le redécouvrait seul, et
 * la CI découvrait à sa place — au prix d'un aller-retour de cinq minutes par découverte.
 *
 * ── CE QU'IL EXÉCUTE, ET POURQUOI IL NE LE RECOPIE PAS ──────────────────────────────────────
 *
 * La liste des étapes est LUE dans `.github/workflows/ci.yml`, job `gate-a`, dans son ordre. Une
 * liste tenue ici en aurait fait une seconde source : le jour où une garde entre en CI, le pré-vol
 * cesserait de la voir, en silence, et rendrait un vert qui ment — c'est exactement le défaut que
 * GOV-059 vient de fermer côté CI. Le seul ordre qui vaille est celui de la porte A, y compris son
 * ordre RÉCENT (REQ-QA-013 : lint, format, typecheck, tests et `req:check` passent AVANT
 * `gov:etat`), parce qu'un pré-vol qui mesure dans un autre ordre ne prédit pas ce que la CI rendra.
 *
 * Trois familles d'étapes de `gate-a` ne sont PAS jouées ici, et chacune est NOMMÉE dans la sortie
 * plutôt que tue :
 *   — celles qui ne sont pas un `run:` (`actions/checkout`, `pnpm/action-setup`, `setup-node`) ;
 *   — `pnpm install --frozen-lockfile` : le worktree est déjà installé, et `docs/CONVENTIONS.md` §7
 *     interdit d'y toucher autrement que depuis le store partagé ;
 *   — toute étape portant un `if:` qui dépend du contexte d'une PR (`gov:entite:corps` juge le corps
 *     PUBLIÉ d'une PR qui n'existe pas encore quand on lance le pré-vol).
 *
 * UNE SEULE SUBSTITUTION DE SHELL EST TOLÉRÉE, et le reste échoue FERMÉ. `gov:etat` reçoit en CI
 * `--now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"`. Cette substitution-là est remplacée par l'instant
 * courant. Toute AUTRE écriture `$(…)` rougit au lieu d'être devinée : exécuter à l'aveugle la
 * commande qu'on n'a pas comprise est la manière connue de rendre un vert sans mesure.
 *
 * ── CE QUE LE PRÉ-VOL FAIT EN PLUS, ET QUE LA CI NE PEUT PAS FAIRE ──────────────────────────
 *
 * La CI part d'un clone neuf ; le pré-vol part d'un worktree où les VUES viennent d'être écrites.
 * Il les rend donc d'abord, dans l'ordre, `docs/PLAN-STATE.md` en DERNIER : PLAN-STATE lit le
 * journal, le backlog et la traçabilité, et le rendre en premier le périme aussitôt.
 *
 * Puis il vérifie que ces quatre fichiers-là ne portent aucun RETOUR CHARIOT. La famille générale
 * `fin_de_ligne_non_lf` est déjà tenue par `pnpm gov:termes-interdits`, plus loin dans la liste
 * dérivée — on ne la redouble pas (RM-07). Ce contrôle-ci est BORNÉ aux fichiers que les rendus
 * viennent d'écrire, et il est placé JUSTE APRÈS eux, parce qu'un CRLF pondu par un outil Windows
 * tue d'abord une garde qui lit la vue (`gov:attributions` sort en `[source_illisible]`) et nomme
 * alors la mauvaise cause. Mesuré le 2026-09-21 : 1 132 retours chariot introduits sans être vus.
 *
 * ── SENS DE PANNE ───────────────────────────────────────────────────────────────────────────
 *
 * Aucune commande mesurée ne passe par un tube. Le brouillon de ce script écrivait
 * `if ! pnpm gov:check | tail -25` : le code de sortie d'un pipeline est celui de sa DERNIÈRE
 * commande, donc `tail`, donc 0 — la garde centrale du pré-vol ne pouvait pas rougir. Ici chaque
 * étape est lancée seule et son code de sortie est lu.
 *
 * Un rouge n'interrompt pas la course : la CI s'arrête à la première étape rouge, le pré-vol les
 * rend TOUTES. Un pré-vol qui s'arrête au premier rouge se paie en autant d'allers-retours que de
 * fautes ; celui-ci se paie une fois.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const CI = '.github/workflows/ci.yml';
const SUBSTITUTION_TOLEREE = '$(date -u +%Y-%m-%dT%H:%M:%SZ)';

/** Une étape : son nom tel que la CI l'affiche, et la commande exacte. */
type Etape = { nom: string; commande: string };
/** Ce qu'on a refusé de jouer, et pourquoi — la sortie le nomme au lieu de le taire. */
type Ecarte = { nom: string; motif: string };

/**
 * Les rendus, dans l'ordre, avec le fichier que CHACUN écrit. Le fichier n'est pas une copie du
 * nom de la commande : c'est ce que le contrôle de retour chariot doit relire juste après.
 */
const RENDUS: Etape[] = [
  { nom: 'Vue : traçabilité', commande: 'pnpm gov:trace:render' },
  { nom: 'Vue : backlog', commande: 'pnpm gov:tasks:render' },
  { nom: 'Vue : index des ADR', commande: 'pnpm adr:index' },
  {
    nom: 'Vue : état vivant (EN DERNIER — il lit les trois autres)',
    commande: 'pnpm plan-state:build',
  },
];
const VUES = ['docs/TRACABILITE.md', 'docs/TASKS.md', 'docs/adr/INDEX.md', 'docs/PLAN-STATE.md'];

/**
 * Le job `gate-a` de `ci.yml`, découpé en étapes. On lit le bloc `steps:` du seul job du fichier ;
 * si un second job apparaissait, le découpage s'arrêterait à lui plutôt que de lire ses étapes
 * comme celles de `gate-a` — un ordre mesuré sur deux jobs mélangés ne veut plus rien dire.
 */
function etapesDeLaPorteA(texte: string): { jouees: Etape[]; ecartees: Ecarte[] } {
  const debut = texte.indexOf('\n    steps:\n');
  if (debut < 0) {
    console.error(
      `❌ prevol — \`${CI}\` : aucun bloc \`steps:\` de job trouvé. La porte A n'a pas de source.`
    );
    process.exit(1);
  }
  const corps = texte.slice(debut);
  const jouees: Etape[] = [];
  const ecartees: Ecarte[] = [];
  for (const bloc of corps.split(/^ {6}- /m).slice(1)) {
    const run = /^[ \t]*run:[ \t]*(.+)$/m.exec(bloc)?.[1]?.trim();
    // Une étape de `ci.yml` n'est pas tenue de porter un `name:` : on la désigne alors par ce qui
    // l'identifie vraiment — son `uses:` ou son `run:`. Un tiret ne se retrouve pas dans le fichier.
    const nom =
      /^name:[ \t]*(.+)$/m.exec(bloc)?.[1]?.trim() ??
      /^(uses:.+)$/m.exec(bloc)?.[1]?.trim() ??
      (run !== undefined ? `run: ${run}` : '—');
    if (run === undefined) {
      ecartees.push({ nom, motif: "ce n'est pas un `run:` — GitHub l'exécute, pas le shell" });
      continue;
    }
    if (run.startsWith('pnpm install')) {
      ecartees.push({ nom, motif: 'le worktree est déjà installé (`docs/CONVENTIONS.md` §7)' });
      continue;
    }
    if (/^[ \t]*if:/m.test(bloc)) {
      ecartees.push({
        nom,
        motif: 'porte un `if:` qui dépend du contexte de la PR, absent en local',
      });
      continue;
    }
    const commande = run
      .split(SUBSTITUTION_TOLEREE)
      .join(new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
    if (commande.includes('$(')) {
      console.error(
        `❌ prevol — l'étape « ${nom} » porte une substitution de shell que ce script ne sait pas lire :\n` +
          `   ${run}\n` +
          `   Une seule est tolérée (${SUBSTITUTION_TOLEREE}). Ajoute la tienne ici plutôt que de la deviner.`
      );
      process.exit(1);
    }
    jouees.push({ nom, commande });
  }
  return { jouees, ecartees };
}

/** Une étape, lancée seule : jamais de tube, le code de sortie est celui de la commande. */
function lancer(e: Etape): boolean {
  const debut = Date.now();
  process.stdout.write(`\n──▶ ${e.nom}\n    ${e.commande}\n`);
  const r = spawnSync(e.commande, { shell: true, stdio: 'inherit' });
  const secondes = ((Date.now() - debut) / 1000).toFixed(1);
  const ok = r.status === 0;
  process.stdout.write(`    ${ok ? '✅' : '❌'} ${e.nom} — ${secondes}s\n`);
  return ok;
}

function retoursChariot(): string[] {
  return VUES.filter((f) => existsSync(f) && readFileSync(f).includes(0x0d));
}

// ── la course ────────────────────────────────────────────────────────────────

if (!existsSync(CI)) {
  console.error(`❌ prevol — \`${CI}\` est absent : le pré-vol n'a pas de source d'étapes.`);
  process.exit(1);
}
const { jouees, ecartees } = etapesDeLaPorteA(readFileSync(CI, 'utf8'));
const toutes = [...RENDUS, ...jouees];

if (process.argv.includes('--liste')) {
  console.log(
    `prevol — ${toutes.length} étape(s), dont ${RENDUS.length} locale(s) et ${jouees.length} de \`gate-a\` :`
  );
  for (const [i, e] of toutes.entries())
    console.log(`  ${String(i + 1).padStart(3)}. ${e.nom}  —  ${e.commande}`);
  console.log(`\n${ecartees.length} étape(s) de \`gate-a\` NON jouées :`);
  for (const e of ecartees) console.log(`  · ${e.nom} — ${e.motif}`);
  process.exit(0);
}

const rouges: string[] = [];
for (const e of RENDUS) if (!lancer(e)) rouges.push(e.nom);

const crlf = retoursChariot();
if (crlf.length > 0) {
  rouges.push('Retours chariot dans les vues rendues');
  console.error(
    `\n❌ prevol — retour(s) chariot dans une vue qui vient d'être rendue : ${crlf.join(', ')}.\n` +
      `   Une garde qui lit cette vue sortira en \`[source_illisible]\` et nommera la mauvaise cause.`
  );
} else {
  console.log(`\n✅ aucune des ${VUES.length} vues rendues ne porte de retour chariot.`);
}

for (const e of jouees) if (!lancer(e)) rouges.push(e.nom);

console.log(`\n${'─'.repeat(78)}`);
console.log(
  `prévol — ${toutes.length} étape(s) jouée(s), ${ecartees.length} écartée(s) et nommée(s) :`
);
for (const e of ecartees) console.log(`   · ${e.nom} — ${e.motif}`);
if (rouges.length === 0) {
  console.log('\n✅ PRÉ-VOL VERT — la porte A ne devrait rien découvrir.');
  process.exit(0);
}
console.error(`\n❌ PRÉ-VOL ROUGE — ${rouges.length} étape(s) :`);
for (const r of rouges) console.error(`   ❌ ${r}`);
process.exit(1);
