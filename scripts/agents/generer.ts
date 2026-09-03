/**
 * generer.ts — les quinze fiches de rôle, RENDUES depuis `docs/agents.json` (GOV-023, REQ-GOV-010).
 *
 * USAGE : npx tsx scripts/agents/generer.ts                 écrit les fiches de `.claude/agents/`
 *         npx tsx scripts/agents/generer.ts --verifier      n'écrit rien ; sort 1 si une fiche diffère
 *         npx tsx scripts/agents/generer.ts --source <f>    autre source (bancs d'essai des tests)
 *         npx tsx scripts/agents/generer.ts --racine <dir>  autre dossier de fiches
 *
 * POURQUOI CE FICHIER EXISTE. Jusqu'ici, `docs/CHARTE-AGENTS.md` §2 (le tableau des quinze postes :
 * code, fiche, libellé, outils déclarés, droit d'écriture) et les quinze fiches de `.claude/agents/`
 * étaient DEUX textes tenus à la main qui devaient s'accorder. C'est exactement RM-01 en défaut :
 * deux copies divergent toujours, et celle qui est lue n'est jamais celle qui a été corrigée. La
 * source est désormais `docs/agents.json` ; la fiche en est une VUE.
 *
 * CE QUI EST DÉRIVÉ, ET CE QUI NE L'EST PAS — le point le plus important de ce fichier.
 *
 *   — DÉRIVÉ : le frontmatter (`name`, `description`, `tools`) et le bloc encadré par les marqueurs
 *     `agents:debut` / `agents:fin` (mission, entrées, sorties, interdits, documents à lire, outils
 *     et droit d'écriture). C'est tout ce qui doit s'accorder avec la charte, et c'est tout ce que
 *     `--verifier` compare.
 *   — NON DÉRIVÉ : la PROSE entre les deux, conservée telle quelle. Une fiche de rôle n'est pas une
 *     fiche signalétique : c'est le PROMPT du sous-agent, et sa valeur est dans son détail (la
 *     séquence de fusion du release manager, les huit dégradations de l'auditeur d'intégration, les
 *     douze motifs du juriste). Aplatir ces quinze textes en six rubriques pour satisfaire un moule
 *     aurait détruit l'outil au motif de le dériver. On dérive donc ce qui doit s'accorder, et on
 *     conserve ce qui doit rester lisible — comme le gabarit de PR, dont seules les huit cases
 *     vivent entre `dod:debut` et `dod:fin`.
 *
 * Sur une fiche qui n'existe pas encore, la prose est vide et le rendu produit une fiche complète :
 * un nouveau poste s'ajoute par une entrée JSON, pas par un fichier écrit à la main.
 *
 * La garde `gov:agents` (`scripts/gates/gov-agents.ts`) IMPORTE le rendu d'ici plutôt que de le
 * réécrire : deux rendus qui se ressemblent finissent toujours par diverger, et c'est alors la
 * fiche qu'on déclare fausse au lieu du contrôle (RM-01, leçon de `gov:adr`).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const CHEMIN_SOURCE = 'docs/agents.json';
export const CHEMIN_FICHES = '.claude/agents';

export const MARQUEUR_DEBUT = '<!-- agents:debut -->';
export const MARQUEUR_FIN = '<!-- agents:fin -->';

/** Les cinq sections exigées par le registre des gardes (`docs/gates.json`, gate `gov:agents`). */
export const SECTIONS = ['Mission', 'Entrées', 'Sorties', 'Interdits', 'Documents à lire'] as const;

export type Document = { chemin: string; pourquoi: string };

export type Poste = {
  code: string;
  role: string;
  libelle: string;
  description: string;
  mission: string;
  entrees: string[];
  sorties: string[];
  interdits: string[];
  documents: Document[];
  tools: string[];
  ecrit: string;
  cheminsReserves: string[];
};

/** Un code de poste : deux chiffres, zéro de tête compris (`scripts/lot/tasks.schema.json`). */
export const CODE_POSTE = /^A\d{2}$/;

/**
 * La comparaison se fait à FINS DE LIGNE NORMALISÉES. Le rendu écrit des `\n` ; un poste Windows
 * dont le `core.autocrlf` est armé rend des `\r\n` à la lecture. Sans cette normalisation, la garde
 * serait verte en CI et rouge chez tout le monde : elle mesurerait la configuration de git, pas la
 * dérivation des fiches (leçon déjà payée sur `scripts/adr/index.ts`).
 */
export function normaliser(texte: string): string {
  return texte.replace(/\r\n/g, '\n');
}

export function lireSource(chemin: string = CHEMIN_SOURCE): Poste[] {
  const brut = JSON.parse(readFileSync(chemin, 'utf8')) as { postes?: Poste[] };
  return brut.postes ?? [];
}

/**
 * La prose tenue à la main : ce qui se trouve entre la fin du frontmatter et le marqueur d'ouverture
 * du bloc généré. Sur un fichier sans frontmatter ni marqueur, c'est le fichier entier — c'est ce
 * qui permet de poser le bloc sur les quinze fiches existantes sans en perdre une ligne.
 */
export function proseDe(texte: string): string {
  let corps = normaliser(texte);
  const fin = /^---\n[\s\S]*?\n---\n/.exec(corps);
  if (fin) corps = corps.slice(fin[0].length);
  const marqueur = corps.indexOf(MARQUEUR_DEBUT);
  if (marqueur >= 0) corps = corps.slice(0, marqueur);
  return corps.trim();
}

function liste(valeurs: string[]): string[] {
  return valeurs.map((v) => `- ${v}`);
}

/** Le bloc généré, marqueurs compris. Déterministe : deux appels rendent le même octet. */
export function rendreBloc(p: Poste): string {
  const l: string[] = [];
  l.push(MARQUEUR_DEBUT);
  l.push('<!--');
  l.push('  BLOC GÉNÉRÉ depuis `docs/agents.json` (GOV-023, REQ-GOV-010, RM-01) — ne l’édite pas :');
  l.push('  `npx tsx scripts/agents/generer.ts --verifier` rougit si le disque diffère de la source.');
  l.push('  La prose au-dessus, elle, est écrite à la main : c’est le prompt du poste.');
  l.push('-->');
  l.push('');
  l.push(`## Poste ${p.code} · ${p.libelle}`);
  l.push('');
  l.push('### Mission');
  l.push('');
  l.push(p.mission);
  l.push('');
  l.push('### Entrées');
  l.push('');
  l.push(...liste(p.entrees));
  l.push('');
  l.push('### Sorties');
  l.push('');
  l.push(...liste(p.sorties));
  l.push('');
  l.push('### Interdits');
  l.push('');
  l.push(...liste(p.interdits));
  l.push('');
  l.push('### Documents à lire');
  l.push('');
  l.push(...p.documents.map((d) => `- \`${d.chemin}\` — ${d.pourquoi}`));
  l.push('');
  l.push('### Outils et droit d’écriture');
  l.push('');
  l.push(`- **Outils** : ${p.tools.join(', ')}`);
  l.push(`- **Écrit ?** ${p.ecrit}`);
  l.push(
    `- **Chemins réservés** (label \`role:${p.role}\`) : ` +
      (p.cheminsReserves.length > 0 ? p.cheminsReserves.map((c) => `\`${c}\``).join(', ') : 'aucun')
  );
  l.push('');
  l.push(MARQUEUR_FIN);
  return l.join('\n');
}

/** La fiche entière : frontmatter dérivé, prose conservée, bloc dérivé. */
export function rendreFiche(p: Poste, prose: string): string {
  const l: string[] = [
    '---',
    `name: ${p.role}`,
    `description: ${p.description}`,
    `tools: ${p.tools.join(', ')}`,
    '---',
    '',
  ];
  const corps = prose.trim();
  if (corps.length > 0) {
    l.push(corps);
    l.push('');
  }
  l.push(rendreBloc(p));
  l.push('');
  return l.join('\n');
}

export function cheminFiche(p: Poste, racine: string = CHEMIN_FICHES): string {
  return join(racine, `${p.role}.md`);
}

/** Le rendu attendu d'une fiche, prose du disque comprise. */
export function ficheAttendue(p: Poste, racine: string = CHEMIN_FICHES): string {
  const chemin = cheminFiche(p, racine);
  const prose = existsSync(chemin) ? proseDe(readFileSync(chemin, 'utf8')) : '';
  return rendreFiche(p, prose);
}

/** Les fiches présentes sur le disque, par nom de rôle. */
export function fichesSurDisque(racine: string = CHEMIN_FICHES): string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort();
}

// ── ligne de commande ────────────────────────────────────────────────────────
const LANCE_DIRECTEMENT = /[\\/]agents[\\/]generer\.ts$/.test(process.argv[1] ?? '');

if (LANCE_DIRECTEMENT) {
  const valeur = (drapeau: string, defaut: string): string => {
    const i = process.argv.indexOf(drapeau);
    return i >= 0 ? (process.argv[i + 1] ?? defaut) : defaut;
  };
  const source = valeur('--source', CHEMIN_SOURCE);
  const racine = valeur('--racine', CHEMIN_FICHES);

  if (!existsSync(source)) {
    console.error(`❌ gov:agents — la source ${source} est introuvable.`);
    process.exit(1);
  }

  const postes = lireSource(source);
  if (postes.length === 0) {
    console.error(`❌ gov:agents — ${source} ne déclare aucun poste.`);
    process.exit(1);
  }

  if (process.argv.includes('--verifier')) {
    const ecarts: string[] = [];
    for (const p of postes) {
      const chemin = cheminFiche(p, racine);
      if (!existsSync(chemin)) {
        ecarts.push(`${chemin} est absent alors que ${source} déclare le poste ${p.code}.`);
        continue;
      }
      const surDisque = normaliser(readFileSync(chemin, 'utf8'));
      if (surDisque !== normaliser(ficheAttendue(p, racine))) {
        ecarts.push(
          `${chemin} diffère du rendu de ${source} : le frontmatter ou le bloc généré a été édité à ` +
            `la main. La fiche est une VUE — corrige la source, puis regénère.`
        );
      }
    }
    // Une fiche sans poste ne résout pas comme `agentType` : l'autopilote meurt au premier agent.
    for (const role of fichesSurDisque(racine)) {
      if (!postes.some((p) => p.role === role)) {
        ecarts.push(`${join(racine, `${role}.md`)} n'a aucun poste dans ${source} : cette fiche ne résout pas.`);
      }
    }
    if (ecarts.length > 0) {
      console.error(`❌ gov:agents — ${ecarts.length} fiche(s) diffèrent de leur source :`);
      ecarts.forEach((e) => console.error(`   ${e}`));
      process.exit(1);
    }
    console.log(`✅ gov:agents — les ${postes.length} fiches de ${racine} sont égales au rendu de ${source}.`);
    process.exit(0);
  }

  if (!existsSync(racine)) mkdirSync(racine, { recursive: true });
  for (const p of postes) writeFileSync(cheminFiche(p, racine), ficheAttendue(p, racine));
  console.log(`✅ gov:agents — ${postes.length} fiches rendues dans ${racine} depuis ${source}.`);
  process.exit(0);
}
