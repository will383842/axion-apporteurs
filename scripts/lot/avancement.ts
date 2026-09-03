/**
 * avancement.ts — LA source unique du rang d'un statut de tâche. (REQ-GOV-026, RM-01, RM-04)
 *
 * POURQUOI CE FICHIER EXISTE. L'ensemble « livrée » — `{fusionnee, deployee, verifiee}` — était
 * écrit en dur **cinq fois** : `gov-etat.ts`, `gov-pr.ts`, `gov-tasks.ts`, `gov-trace.ts` et
 * `composer.ts`. La lentille `schema` (A02) l'a relevé sur la PR 28, et la remarque porte plus loin
 * qu'un doublon : c'est **cette PR même** qui écrit la règle interdisant cela, dans
 * `docs/GLOSSAIRE.md` §4 — « deux copies du même vocabulaire divergent toujours » (RM-04) — et qui
 * en ajoute deux copies dans le même geste. Une garde dérivait, cinq recopiaient.
 *
 * Le jour où un statut est ajouté ou renommé dans `scripts/lot/tasks.schema.json`, `gov:inventaire`
 * rougit — son barème vérifie son exhaustivité sur l'enum — et les cinq copies se taisent en se
 * trompant. C'est le mode d'échec le plus coûteux : pas une panne, un désaccord silencieux.
 *
 * CE QUI EST DÉRIVÉ ICI, ET DE QUOI. Le barème lui-même ne peut pas se dériver : rien dans le
 * schéma ne dit qu'`en_revue` vaut plus qu'`en_cours`. Ce qui se dérive, et que ce module VÉRIFIE
 * à chaque import, c'est son **exhaustivité** : tout statut déclaré par l'enum du schéma porte un
 * rang, et aucun rang ne nomme un statut que le schéma ignore. Un dixième statut fait donc rougir
 * à l'import, dans la garde qui l'importe, au lieu de passer inaperçu dans cinq listes.
 *
 * LE RANG EST LE PLANCHER GARANTI, jamais l'optimisme — c'est l'arbitrage de GOV-020, repris ici
 * mot pour mot : `en_cours` vaut `specifie`, pas `code`. Une tâche revendiquée il y a une minute
 * n'a pas une ligne de code, et une garde qui exigerait sa preuve rougirait sur l'acte même de
 * prendre une tâche — elle serait désarmée dans la semaine.
 */

import { readFileSync } from 'node:fs';

/** L'échelle ordonnée de REQ-GOV-026, du plus faible au plus fort. */
export const AVANCEMENT = ['specifie', 'code', 'teste', 'revu', 'fusionne', 'deploye', 'verifie_en_prod'] as const;
export type Avancement = (typeof AVANCEMENT)[number];

/**
 * Le PLANCHER que chaque statut garantit. `null` = la tâche n'est pas encore au plan arbitré.
 * `code` et `revu` ne sont le plancher d'aucun statut : le vocabulaire du backlog est plus
 * grossier que la légende, et c'est dit plutôt que maquillé.
 */
export const PLANCHER: Record<string, Avancement | null> = {
  proposee: null,
  a_faire: 'specifie',
  en_cours: 'specifie',
  bloquee: 'specifie',
  attente_externe: 'specifie',
  en_revue: 'teste',
  fusionnee: 'fusionne',
  deployee: 'deploye',
  verifiee: 'verifie_en_prod',
};

/** Le rang ordinal d'un statut, ou `-1` s'il n'en a pas. */
export function rang(statut: string): number {
  const a = PLANCHER[statut];
  return a === undefined || a === null ? -1 : AVANCEMENT.indexOf(a);
}

/**
 * LES STATUTS RÉPUTÉS LIVRÉS — l'ensemble qui était recopié cinq fois.
 *
 * Il se DÉRIVE du barème : est livrée toute tâche dont le plancher atteint `fusionne`. Ajouter un
 * statut « livré » ne demande donc qu'une ligne de `PLANCHER`, et les cinq gardes suivent.
 */
export const LIVREE: ReadonlySet<string> = new Set(
  Object.keys(PLANCHER).filter((s) => rang(s) >= AVANCEMENT.indexOf('fusionne'))
);

/**
 * Vérifie que le barème couvre EXACTEMENT l'enum du schéma. Appelée à l'import : une garde qui
 * importe ce module ne peut pas tourner sur un barème incomplet sans le dire.
 *
 * @param chemin le schéma du backlog — paramètre pour que le test puisse lui en donner un autre.
 */
export function verifierExhaustivite(chemin = 'scripts/lot/tasks.schema.json'): string[] {
  // Le schema range la tache sous `$defs.tache` et n'y renvoie que par `$ref` : lire
  // `properties.taches.items.properties.statut` rend `undefined`, et un `?? []` en aurait fait un
  // enum VIDE — c'est-a-dire une exhaustivite verifiee contre rien, donc toujours verte. La garde
  // a rougi sur ce chemin faux au premier essai, ce qui est exactement ce qu'on lui demande.
  const schema = JSON.parse(readFileSync(chemin, 'utf8')) as {
    $defs?: { tache?: { properties?: { statut?: { enum?: string[] } } } };
  };
  const declares = schema.$defs?.tache?.properties?.statut?.enum;
  if (declares === undefined || declares.length === 0) {
    return [
      `${chemin} ne declare aucun enum de statut la ou ce module le cherche ` +
        `($defs.tache.properties.statut.enum). Le controle d'exhaustivite ne peut pas se faire, et ` +
        `il refuse de se declarer vert : une verification contre une liste vide passe toujours.`,
    ];
  }
  const fautes: string[] = [];
  for (const s of declares) {
    if (!(s in PLANCHER)) {
      fautes.push(
        `le statut « ${s} » est déclaré par ${chemin} et ne porte AUCUN rang dans PLANCHER : ` +
          `décide de son avancement, ne le laisse pas tomber entre les mailles.`
      );
    }
  }
  for (const s of Object.keys(PLANCHER)) {
    if (!declares.includes(s)) {
      fautes.push(`le rang « ${s} » ne correspond à aucun statut de ${chemin} : le barème a dérivé de sa source.`);
    }
  }
  return fautes;
}
