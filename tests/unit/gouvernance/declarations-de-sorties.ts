/**
 * declarations-de-sorties.ts — le cliquet CALCULÉ des sorties non nulles déclarées (GOV-101,
 * REQ-GOV-032). Lu par `refus-de-rendre-et-de-publier.spec.ts`, éprouvé par
 * `relectures-sans-defaut.spec.ts`.
 *
 * 🔴 LE DÉFAUT MESURÉ. Le registre `declares` de `refus-de-rendre-et-de-publier.spec.ts` était
 * confronté à un TOTAL LITTÉRAL (`toBe(61)`). Sa raison d'être était juste — qu'on ne puisse pas
 * faire baisser la dette en retirant une ligne du registre —, mais le littéral était incrémenté
 * par CHAQUE PR qui ajoutait une garde : deux PR ouvertes en même temps le faisaient passer chacune
 * de N à N+k, et la seconde fusionnée entrait en conflit, rougissait, et coûtait un tour. Le
 * commentaire au-dessus du littéral racontait onze de ces réconciliations.
 *
 * LA RÈGLE QUI LE REMPLACE, SANS LITTÉRAL. La garde réelle n'était pas le nombre, c'était « on ne
 * retire pas une déclaration en silence ». Elle se lit contre la BASE (`origin/main`) :
 *   — une déclaration présente sur la base est présente ici, tant que son fichier existe ;
 *   — son `total` ne baisse pas.
 * Une déclaration ne disparaît donc qu'avec son fichier. AJOUTER une déclaration ne touche à rien
 * d'autre qu'à sa propre entrée : deux PR qui en ajoutent chacune une ne se rencontrent plus.
 */

/**
 * Les déclarations `'chemin': { total: N, …}` lues dans le TEXTE du fichier de la base. La forme est
 * celle que Prettier écrit — clé entre apostrophes droites, `total` en première propriété. Une base
 * dont on ne lit RIEN rend une table vide, que l'appelant refuse : illisible n'est pas vide.
 */
export function declarationsDeLaBase(texte: string): Map<string, number> {
  const lues = new Map<string, number>();
  for (const m of texte.matchAll(/^\s+'(scripts\/[^']+)':\s*\{\s*\n\s*total:\s*(\d+),/gm)) {
    lues.set(m[1]!, Number(m[2]));
  }
  return lues;
}

/**
 * Ce que la PR a retiré ou baissé du registre de la base — vide si rien. `confrontesAuDiff` : les
 * fichiers auxquels la PR AJOUTE des sorties ; leur `total` est déjà tenu ÉGAL au delta par le
 * cliquet du diff, et c'est lui qui fait foi pour eux.
 */
export function declarationsRetirees(
  base: ReadonlyMap<string, number>,
  ici: Readonly<Record<string, { total: number }>>,
  existe: (chemin: string) => boolean,
  confrontesAuDiff: ReadonlySet<string> = new Set()
): string[] {
  const fautes: string[] = [];
  for (const [f, total] of base) {
    if (confrontesAuDiff.has(f)) continue;
    const d = ici[f];
    if (d === undefined) {
      if (existe(f)) {
        fautes.push(
          `${f} : déclaré sur la base (${total}), retiré ici alors que le fichier existe`
        );
      }
    } else if (d.total < total) {
      fautes.push(`${f} : déclaré ${total} sur la base, ${d.total} ici`);
    }
  }
  return fautes;
}
