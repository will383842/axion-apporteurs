/**
 * `ETATS_OCCUPANTS` — la constante unique des états qui OCCUPENT un SIREN (REQ-DM-003, RM-06).
 *
 * C'EST LE SEUL ENDROIT DU CODE OÙ CETTE LISTE EST ÉCRITE. `docs/CONVENTIONS.md` §2 le dit
 * nommément : « constante dérivée de REQ-DM-003, définie une fois dans
 * `src/domain/attribution/etats.ts`, projetée en SQL par le script de migration ; jamais
 * recopiée ». L'index unique partiel `ON attributions(siren) WHERE statut IN (…)` se génère depuis
 * elle ; aucune requête, aucune migration, aucun test ne réécrit la liste.
 *
 * POURQUOI CETTE RÈGLE A ÉTÉ ÉCRITE. L'index que les documents d'origine proposaient couvrait
 * DEUX états sur sept. Deux attributions vivantes sur un même SIREN étaient donc possibles, et
 * Prisma ne sait ni déclarer un index partiel ni détecter sa dérive : rien n'aurait rougi.
 *
 * POURQUOI UN LITTÉRAL ICI, ET NULLE PART AILLEURS. `docs/CONVENTIONS.md` §3 impose que
 * `src/domain/**` soit pur — aucune I/O, donc aucune lecture de `docs/requirements.json` à
 * l'exécution. La liste est donc écrite une fois, et son égalité au texte de REQ-DM-003 est tenue
 * par une garde : `pnpm partners:schema:enums`, famille `etats_occupants_divergents`, exercée par
 * `tests/unit/gouvernance/glossaire-enums.spec.ts`. Modifier ce tableau sans modifier l'exigence
 * fait rougir ; modifier l'exigence sans modifier ce tableau aussi. C'est ce qui distingue une
 * copie tenue d'une copie livrée à elle-même.
 *
 * CE QUI N'EST PAS ICI. Les treize états d'attribution (REQ-DM-006) et leur machine à états sont
 * l'objet de DM-08 ; ce module ne porte que le sous-ensemble occupant, parce que c'est lui que
 * l'unicité par SIREN interroge.
 */

/** Les sept états occupants de REQ-DM-003, dans l'ordre du cycle de vie. */
export const ETATS_OCCUPANTS = [
  'provisoire',
  'active',
  'rdv_pris',
  'proposition',
  'signee',
  'convertie',
  'figee_resiliation',
] as const;

/** Un état qui occupe le SIREN : tant qu'il dure, aucune autre attribution ne peut naître. */
export type EtatOccupant = (typeof ETATS_OCCUPANTS)[number];

/**
 * La clause `IN (…)` de l'index partiel, GÉNÉRÉE depuis la constante.
 *
 * Elle est ici, et pas dans le fichier de migration, pour la raison qui fonde RM-06 : une clause
 * tapée dans un fichier SQL ne suit jamais la constante. Le test `pg_indexes` de DM-07 comparera
 * la définition lue en base à ce que cette fonction produit.
 */
export function clauseEtatsOccupants(): string {
  return ETATS_OCCUPANTS.map((e) => `'${e}'`).join(', ');
}

/** Vrai si l'état passé occupe le SIREN. Aucun appelant ne rejuge la liste lui-même. */
export function occupe(etat: string): etat is EtatOccupant {
  return (ETATS_OCCUPANTS as readonly string[]).includes(etat);
}
