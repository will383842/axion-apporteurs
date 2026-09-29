/**
 * LE LOT DÉDIÉ DU GARDIEN-SPEC — GOV-116 (REQ-GOV-010, `partners/ADR-0028`).
 *
 * `docs/CONVENTIONS.md` §8 réserve `docs/DECISIONS.md`, `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`
 * au `gardien-spec`, « lot dédié avec `--settings` surchargé ». Ce lot n'existait nulle part. Et un
 * fichier passé par `claude --settings` S'AJOUTE aux réglages : il ne lève pas un `deny` de
 * `.claude/settings.json`. Surcharger ne suffit donc pas ; il faut ÉCARTER les réglages du projet
 * (`--setting-sources user`) et porter, dans le fichier du lot, TOUT ce que le projet interdit, sauf
 * les trois fichiers du lot, et ses hooks.
 *
 * Ce fichier ne se tape pas : il se DÉRIVE de `.claude/settings.json` (RM-01), par `--rendre`, et
 * `--verifier` rougit sur la moindre dérive. Qui lance le lot : Williams SEUL, depuis la racine du
 * dépôt (`COMMANDE_DU_LOT`). Aucun agent ne le lance pour lui, aucune session ne se le délègue.
 *
 * USAGE : pnpm lot:gardien-spec              imprime la procédure exacte
 *         pnpm lot:gardien-spec --rendre     écrit config/lot-dedie-gardien-spec.settings.json
 *         pnpm lot:gardien-spec:verifier     rougit si le fichier dérive, ou si une session
 *                                            ordinaire n'est PAS bloquée sur les trois fichiers
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const CHEMIN_REGLAGES_DU_PROJET = '.claude/settings.json';
export const CHEMIN_REGLAGES_DU_LOT = 'config/lot-dedie-gardien-spec.settings.json';

/** Les trois fichiers que le lot ouvre, et eux seuls (`docs/CONVENTIONS.md` §8). */
export const FICHIERS_DU_LOT = [
  'docs/DECISIONS.md',
  'docs/GLOSSAIRE.md',
  'docs/PRESEANCE.md',
] as const;

/** Les règles d'écriture d'un fichier : les deux outils qui écrivent un fichier existant ou neuf. */
export const reglesDEcriture = (f: string): string[] => [`Write(${f})`, `Edit(${f})`];

/** Les six règles que le lot ouvre ; une session ordinaire les porte TOUTES en `deny`. */
export const REGLES_DU_LOT: readonly string[] = FICHIERS_DU_LOT.flatMap(reglesDEcriture);

/** La commande exacte, lancée par Williams SEUL, depuis la racine du dépôt. */
export const COMMANDE_DU_LOT = `claude --setting-sources user --settings ${CHEMIN_REGLAGES_DU_LOT}`;

export type Reglages = {
  permissions?: { allow?: string[]; deny?: string[]; [k: string]: unknown };
  hooks?: unknown;
  env?: unknown;
  [k: string]: unknown;
};

/**
 * Les réglages du lot, DÉRIVÉS de ceux du projet : mêmes interdictions moins les six règles du lot,
 * mêmes autorisations plus ces six règles, mêmes hooks, même environnement. Rien d'autre ne s'ouvre.
 */
export function reglagesDuLot(projet: Reglages): Reglages {
  const allow = projet.permissions?.allow ?? [];
  const deny = projet.permissions?.deny ?? [];
  return {
    $schema: projet['$schema'],
    _commentaire: [
      `RENDU par scripts/lot/lot-dedie-gardien-spec.ts depuis ${CHEMIN_REGLAGES_DU_PROJET} — ne pas éditer.`,
      `Lot dédié du gardien-spec (GOV-116, partners/ADR-0028) : ouvre ${FICHIERS_DU_LOT.join(', ')} et eux seuls.`,
      `Lancé par Williams SEUL, depuis la racine du dépôt : ${COMMANDE_DU_LOT}`,
    ],
    permissions: {
      ...projet.permissions,
      allow: [...allow.filter((r) => !REGLES_DU_LOT.includes(r)), ...REGLES_DU_LOT],
      deny: deny.filter((r) => !REGLES_DU_LOT.includes(r)),
    },
    hooks: projet.hooks,
    env: projet.env,
  };
}

/** Les règles du lot qu'une session ORDINAIRE n'a pas en `deny` : chacune est une porte ouverte. */
export function reglesNonInterditesAuProjet(projet: Reglages): string[] {
  const deny = projet.permissions?.deny ?? [];
  return REGLES_DU_LOT.filter((r) => !deny.includes(r));
}

export const rendre = (projet: Reglages): string =>
  JSON.stringify(reglagesDuLot(projet), null, 2) + '\n';

function lire(chemin: string): Reglages {
  return JSON.parse(readFileSync(chemin, 'utf8')) as Reglages;
}

export function verifier(racine = '.'): string[] {
  const fautes: string[] = [];
  const projet = lire(`${racine}/${CHEMIN_REGLAGES_DU_PROJET}`);
  let surDisque = '';
  try {
    surDisque = readFileSync(`${racine}/${CHEMIN_REGLAGES_DU_LOT}`, 'utf8');
  } catch {
    fautes.push(
      `[reglages_du_lot_absents] ${CHEMIN_REGLAGES_DU_LOT} est illisible : lance --rendre.`
    );
  }
  if (surDisque && surDisque !== rendre(projet)) {
    fautes.push(
      `[reglages_du_lot_divergents] ${CHEMIN_REGLAGES_DU_LOT} n'est pas le rendu de ` +
        `${CHEMIN_REGLAGES_DU_PROJET} : il ouvrirait ou fermerait autre chose que les trois fichiers du lot.`
    );
  }
  for (const r of reglesNonInterditesAuProjet(projet)) {
    fautes.push(
      `[session_ordinaire_non_bloquee] ${CHEMIN_REGLAGES_DU_PROJET} ne porte pas « ${r} » en deny : ` +
        'une session ordinaire peut écrire ce fichier réservé au lot. Williams ajoute la règle lui-même.'
    );
  }
  return fautes;
}

const LANCE = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('scripts/lot/lot-dedie-gardien-spec.ts');
if (LANCE) {
  if (process.argv.includes('--rendre')) {
    writeFileSync(CHEMIN_REGLAGES_DU_LOT, rendre(lire(CHEMIN_REGLAGES_DU_PROJET)));
    console.log(`✅ ${CHEMIN_REGLAGES_DU_LOT} rendu depuis ${CHEMIN_REGLAGES_DU_PROJET}.`);
  } else if (process.argv.includes('--verifier')) {
    const fautes = verifier();
    if (fautes.length > 0) {
      console.error(
        `❌ lot:gardien-spec — ${fautes.length} faute(s) :\n   ${fautes.join('\n   ')}`
      );
      process.exit(1);
    }
    console.log(
      `✅ lot:gardien-spec — le lot ouvre ${FICHIERS_DU_LOT.length} fichiers et eux seuls ; ` +
        `une session ordinaire porte les ${REGLES_DU_LOT.length} règles en deny.`
    );
  } else {
    console.log(
      [
        'LOT DÉDIÉ DU GARDIEN-SPEC — procédure (GOV-116, partners/ADR-0028).',
        '  Qui : Williams SEUL. Aucun agent ne le lance pour lui, aucune session ne se le délègue.',
        '  Où : à la racine du dépôt, sur une branche t/<slug> dédiée au lot.',
        `  Commande : ${COMMANDE_DU_LOT}`,
        `  Ouvre : ${FICHIERS_DU_LOT.join(', ')} — et rien d'autre.`,
        '  Écarte : les réglages du projet et locaux (leurs deny sont recopiés dans le fichier du lot).',
        '  Trace : noter la date, la branche et le sha de départ dans la PR du lot.',
      ].join('\n')
    );
  }
}
