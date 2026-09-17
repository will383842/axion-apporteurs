/**
 * chemins-de-tache.ts — LE lecteur unique des chemins qu'une tache du backlog declare.
 *
 * Trois consommateurs, une seule lecture (RM-01) :
 *   - `scripts/lot/composer.ts`  — la disjonction des chemins a l'interieur d'un lot ;
 *   - `scripts/gates/gov-pr.ts`  — les fichiers d'une PR confrontes aux `paths` de ses taches ;
 *   - `tests/unit/gouvernance/composeur-et-fichiers-d-une-pr.spec.ts` — les temoins des deux.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA CONVENTION, ECRITE LA OU LE COMPOSEUR LA LIT — livrable (4a) de GOV-056.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Une tache porte DEUX listes de fichiers, et leur divergence est DELIBEREE :
 *
 *   - `paths`   porte les fichiers de SOURCE que la tache va ecrire ;
 *   - `tests{}` porte les SPECIFICATIONS qui prouveront chacune de ses REQ.
 *
 * Elles ne sont PAS tenues de coincider, et on ne les normalise pas. Mesure du 2026-09-17 sur les
 * 260 taches du registre, apres livraison de GOV-056 : 20 taches declarent dans `paths` une
 * specification que leur `tests{}` ne revendique pas, et 31 revendiquent dans `tests{}` une
 * specification absente de leurs `paths` — 47 taches distinctes, dont 29 deja `fusionnee`.
 * (La mesure du 2026-09-16, sur 228 taches, donnait 7 et 21 ; elle se REFAIT, elle ne se recopie
 * pas — `divergencePathsTests()` la derive, et le composeur l'imprime a chaque execution.)
 * ⚠️ LE CHIFFRE DEPEND DE LA NORMALISATION, et c'est mesure : sans retirer le titre apres le `#`,
 * la meme mesure donne 27 et 39 — 7 taches et 8 taches de plus, pour des promesses qui pointent le
 * MEME fichier sous deux titres. Une mesure de divergence qui ne dit pas comment elle normalise
 * n'est pas comparable a la suivante.
 * ⚠️ CES NOMBRES SONT UNE MESURE DATEE, PAS UNE REGLE, et ils sont ecrits ici parce que c'est leur
 * CONTRASTE qui enseigne : la meme divergence, deux normalisations, deux resultats. Ils
 * VIEILLIRONT. Le jour ou ils s'ecartent de ce que `divergencePathsTests()` rend, c'est la mesure
 * IMPRIMEE par le composeur qui fait foi, et ce paragraphe qui est faux — comme l'etait la phrase
 * « 20 promesses (`preseance.spec.ts`) » quelques lignes plus bas, jusqu'au 2026-09-17.
 *
 * TROIS RAISONS DE DECLARER LA CONVENTION PLUTOT QUE DE NORMALISER LES CHAMPS :
 *   (i)   normaliser reecrirait 47 taches dont 29 deja `fusionnee` — c'est reecrire l'histoire
 *         d'une livraison pour faire plaisir a un test de disjonction ;
 *   (ii)  l'acceptance de GOV-056 demande explicitement « NON une reecriture des listes de chemins » ;
 *   (iii) chaque chemin ajoute a une tache est une collision de lot EN PLUS, et on vient de mesurer
 *         ce que la serialisation coute.
 *
 * ➡️ CE QUI CHANGE, C'EST LE LECTEUR : les deux champs sont lus ENSEMBLE partout ou l'on demande
 * « quels fichiers cette tache touche-t-elle ». Le composeur prouvait une disjonction sur un champ
 * et le lot se faisait sur l'autre ; il n'y a plus qu'un seul ensemble.
 *
 * ⚠️ UN NOM NU N'EST PAS UN CHEMIN. Des promesses du registre nomment un fichier sans son dossier ;
 * leur compte se DERIVE — `promessesSansDossier()` le rend, et la specification l'imprime a chaque
 * passe — il ne s'ecrit pas ici. (Ce commentaire affirmait « 20 promesses (`preseance.spec.ts`) » au
 * present : sur le registre que cette PR livre, c'etait 13, et `preseance.spec.ts` est justement
 * l'une des specifications que ce commit rattache — elle porte desormais son dossier. Un nombre
 * recopie au present dans le fichier meme qui le rend faux.)
 * On ne les resout PAS par leur nom de base : une promesse qui ne pointe
 * aucun fichier du depot n'est pas tenue, et la resoudre par ressemblance ferait passer pour
 * portees cinq specifications que personne ne porte (la mesure de (4b) tomberait de 5 a 1 sans
 * qu'un seul fichier ait change de porteur). La limite est ECRITE plutot que supposee.
 */

/** Ce qu'une tache doit dire pour qu'on sache quels fichiers elle touche. */
export type TacheDeLot = {
  id: string;
  paths: string[];
  tests?: Record<string, string[]> | null;
};

/** Une entree de l'exclusion : le chemin, le motif, et l'ADR qui l'autorise (ou `null`). */
export type RegistreExclu = {
  chemin: string;
  motif: string;
  /** Le nom de fichier de l'ADR qui autorise cette exclusion, sous `docs/adr/`. */
  adr: string | null;
};

/**
 * ────────────────────────────────────────────────────────────────────────────
 * L'EXCLUSION — livrable (3) de GOV-056. ELLE VIT ICI, ET NULLE PART AILLEURS.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `docs/gates.json` est un registre APPEND-ONLY : chaque PR y verse SA ligne, indexee par son
 * propre `id`, par l'outil hors depot (`outils/reecrire-champ.mjs`). Deux taches qui y ecrivent ne
 * se marchent pas dessus — le conflit de rebase est mecanique, pas semantique.
 *
 * Une disjonction STRICTE sur ce fichier sterilise le composeur : 33 taches de la phase 0 le
 * portent dans leurs `paths`, et la chaine se serialise pour un fichier dont chaque tache ajoute
 * UNE ligne. Mesure du 2026-09-17, chaine simulee jusqu'a epuisement : voir le corps de la PR de
 * GOV-056, qui imprime l'avant et l'apres.
 *
 * ⛔ CETTE LISTE N'EST PAS EXTENSIBLE. Une entree de plus exige un ADR, et `exclusionsSansAdr()`
 * le tient : la seule entree qui peut porter `adr: null` est le registre FONDATEUR, celui que
 * l'acceptance de GOV-056 nomme. Une liste d'exclusions qui s'allonge sans frein est une porte
 * ouverte : chaque fichier qu'on y glisse devient un fichier que deux agents peuvent ecrire en
 * meme temps sans que personne ne l'ait decide.
 */
export const REGISTRES_APPEND_ONLY: readonly RegistreExclu[] = [
  {
    chemin: 'docs/gates.json',
    motif:
      'registre append-only : chaque PR y verse SA ligne, indexee par son propre `id`, par ' +
      '`outils/reecrire-champ.mjs`. Le conflit de rebase y est mecanique, jamais semantique — deux ' +
      'taches qui y ecrivent ne se marchent pas dessus. Exclu du test de collision de lot par ' +
      "l'acceptance de GOV-056, livrable (3), 2026-09-16.",
    adr: null,
  },
];

/**
 * Les exclusions qu'aucun ADR n'autorise. La PREMIERE entree est le registre fondateur : elle seule
 * peut porter `adr: null`. Toute autre doit nommer un fichier qui EXISTE sous `docs/adr/`.
 *
 * ⚠️ On rend les CHEMINS refuses, pas un booleen : une garde qui ne nomme pas ce qu'elle refuse
 * oblige a relire le code pour savoir ce qui cloche.
 */
export function exclusionsSansAdr(
  liste: readonly RegistreExclu[],
  adrsSurLeDisque: readonly string[]
): string[] {
  return liste
    .filter((e, i) => {
      if (i === 0) return false; // le registre fondateur, nomme par l'acceptance de GOV-056
      return e.adr === null || !adrsSurLeDisque.includes(e.adr);
    })
    .map((e) => e.chemin);
}

const EXCLUS = new Set(REGISTRES_APPEND_ONLY.map((e) => e.chemin));

/**
 * Le chemin d'une promesse de `tests{}`. Une promesse peut porter un titre de `it()` apres un `#` :
 * `tests/unit/x.spec.ts#REQ-GOV-021 — un titre`. Le titre designe UN test DANS le fichier ; il ne
 * fait pas partie du chemin, et deux promesses du meme fichier sous deux titres differents
 * passeraient pour disjointes si on ne le retirait pas.
 */
export function cheminDePromesse(promesse: string): string {
  const i = promesse.indexOf('#');
  return (i < 0 ? promesse : promesse.slice(0, i)).trim();
}

/** Tous les fichiers qu'une tache declare : `paths` ∪ `tests{}` normalises, sans doublon. */
export function cheminsDeLaTache(t: TacheDeLot): string[] {
  const out = new Set<string>(t.paths ?? []);
  for (const promesses of Object.values(t.tests ?? {})) {
    for (const p of promesses) out.add(cheminDePromesse(p));
  }
  return [...out];
}

/**
 * Les fichiers d'une tache SOUMIS au test de collision de lot : tout ce qu'elle declare, moins les
 * registres append-only. C'est la SEULE fonction que le composeur interroge.
 */
export function cheminsSoumisALaCollision(t: TacheDeLot): string[] {
  return cheminsDeLaTache(t).filter((c) => !EXCLUS.has(c));
}

/**
 * Les fichiers que DEUX taches se disputent reellement — triés, pour que le message du composeur
 * soit stable d'une execution a l'autre.
 */
export function collisionEntre(a: TacheDeLot, b: TacheDeLot): string[] {
  const chezB = new Set(cheminsSoumisALaCollision(b));
  return cheminsSoumisALaCollision(a)
    .filter((c) => chezB.has(c))
    .sort();
}

/**
 * Les promesses de `tests{}` qui nomment un fichier sans son dossier — DERIVEES, jamais comptees a
 * la main. Elles ne revendiquent rien (cf. l'en-tete), et leur nombre change a chaque tache livree :
 * l'ecrire dans un commentaire, c'est le rendre faux au commit suivant.
 */
export function promessesSansDossier(
  taches: readonly TacheDeLot[]
): { tache: string; nom: string }[] {
  const out: { tache: string; nom: string }[] = [];
  for (const t of taches) {
    for (const promesses of Object.values(t.tests ?? {})) {
      for (const p of promesses) {
        const c = cheminDePromesse(p);
        if (c && !c.includes('/')) out.push({ tache: t.id, nom: c });
      }
    }
  }
  return out;
}

/** Une tache ecartee d'un lot, avec la raison IMPRIMEE : le fichier dispute et qui le tenait. */
export type EcartDeLot = { id: string; raison: string };

/**
 * ────────────────────────────────────────────────────────────────────────────
 * LA COMPOSITION DU LOT, PURE ET EXECUTABLE PAR UN TEST — livrable (1) de GOV-056.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Elle vivait au niveau MODULE de `scripts/lot/composer.ts`, dans un script qui ECRIT
 * `docs/tasks.json` et `docs/lots/<id>/lot.json` au seul fait d'etre importe. Aucun test ne pouvait
 * donc l'executer, et son unique temoin s'etait replie sur deux assertions de chaine lues dans le
 * texte source. *Le code n'etait pas testable, alors on a teste sa syntaxe* — et une garde qui
 * connait une orthographe ne connait pas un comportement : on a remis la disjonction sur `paths`
 * seul, les deux assertions sont restees vertes.
 *
 * ⛔ CETTE FONCTION NE TOUCHE NI AU DISQUE NI A LA FORGE. Lecture du registre, ecriture du lot et
 * balayage des arbres restent dans le script qui l'APPELLE. Le jour ou un effet de bord remonte ici,
 * le temoin redevient intestable et le trou se rouvre — c'est exactement par la qu'il s'etait ouvert.
 *
 * L'intersection n'est PAS reecrite ici : c'est `collisionEntre()` qui la tient, et c'est la seule
 * ecriture de la regle dans le depot (RM-01). La collision se juge contre TOUTES les taches deja
 * retenues, et chaque ecart NOMME le fichier dispute ET la tache qui le tenait — une raison qui ne
 * nomme ni l'un ni l'autre oblige a relire le backlog pour savoir ce qui a ete ecarte, et pourquoi.
 *
 * `max` borne le lot et ARRETE la boucle : les taches qu'il laisse dehors ne sont pas « ecartees »,
 * elles n'ont pas ete examinees. Les confondre ferait imprimer une raison a des taches que rien
 * n'a refusees.
 */
export function retenirSansCollision<T extends TacheDeLot>(
  candidates: readonly T[],
  max: number
): { retenues: T[]; ecartees: EcartDeLot[] } {
  const retenues: T[] = [];
  const ecartees: EcartDeLot[] = [];
  for (const t of candidates) {
    if (retenues.length >= max) break;
    const partages: string[] = [];
    for (const deja of retenues) {
      for (const c of collisionEntre(t, deja)) partages.push(`${c} (par ${deja.id})`);
    }
    if (partages.length > 0) {
      ecartees.push({
        id: t.id,
        raison: `chemin déjà pris dans ce lot : ${partages.sort().join(', ')}`,
      });
      continue;
    }
    retenues.push(t);
  }
  return { retenues, ecartees };
}

/**
 * La divergence entre les deux champs, DERIVEE du registre du jour. Elle n'est pas une faute : elle
 * est la convention, et ce qui serait une faute serait de ne pas la mesurer (livrable 4a).
 */
export function divergencePathsTests(taches: readonly TacheDeLot[]): {
  pathsHorsTests: string[];
  testsHorsPaths: string[];
} {
  const pathsHorsTests: string[] = [];
  const testsHorsPaths: string[] = [];
  for (const t of taches) {
    const declares = new Set(t.paths ?? []);
    const promis = new Set(
      Object.values(t.tests ?? {})
        .flat()
        .map(cheminDePromesse)
    );
    if ([...declares].some((p) => p.endsWith('.spec.ts') && !promis.has(p)))
      pathsHorsTests.push(t.id);
    if ([...promis].some((p) => !declares.has(p))) testsHorsPaths.push(t.id);
  }
  return { pathsHorsTests, testsHorsPaths };
}

/**
 * Les specifications SUIVIES que nulle tache ne revendique — livrable (4b) de GOV-056.
 *
 * *Une specification sans tache est une garde que personne ne porte : elle survit tant qu'elle
 * passe, et rien ne dit qui la repare quand elle casse.*
 *
 * L'appariement est EXACT : un nom nu dans `tests{}` ne revendique rien (voir l'en-tete du fichier).
 */
export function specificationsOrphelines(
  specificationsSuivies: readonly string[],
  taches: readonly TacheDeLot[]
): string[] {
  const revendiquees = new Set<string>();
  for (const t of taches) for (const c of cheminsDeLaTache(t)) revendiquees.add(c);
  return specificationsSuivies.filter((f) => !revendiquees.has(f)).sort();
}
