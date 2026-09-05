/**
 * gov-identifiants.ts — la garde des identifiants nus (GOV-003, GOV-025, GOV-028, REQ-GOV-003).
 *
 * USAGE : pnpm gov:identifiants           (échoue si un identifiant nu est cité)
 *         pnpm gov:identifiants --prove   (un témoin par famille, par position ET par délimiteur,
 *                                          chacun vu rougir et rejoué contre la version d'avant)
 *         npx tsx scripts/gates/gov-identifiants.ts --compter
 *                                         (les trois comptes globaux du dépôt, sur le pipeline
 *                                          COMPLET — GOV-028, voir `compter()` plus bas)
 *
 * LE PROBLÈME QU'ELLE TIENT. Les huit relecteurs ont désigné les décisions par des étiquettes
 * locales — « conforme à D3 », « arbitrage C12 », « selon A12 ». Ces étiquettes ne veulent rien
 * dire hors du document qui les a écrites : deux relecteurs ont utilisé `D3` pour deux décisions
 * différentes, et `HYP-W6` cohabitait avec `HYP-W6-BIS`. Un identifiant nu ne résout pas, ne se
 * date pas, et ne dit pas qui a tranché.
 *
 * LA RÈGLE. Un identifiant de décision se cite sous sa forme QUALIFIÉE — celle qui figure au
 * registre `docs/DECISIONS.md` : `HYP-*`, `DEC-*`, `W<n>`, `EXT-*`. Une étiquette nue de la forme
 * lettre + un ou deux chiffres (`A12`, `B9`, `C12`, `D3`, `R5`) est refusée.
 *
 * CE QU'ELLE NE FAIT PAS. Elle n'invente pas de correspondance. Un identifiant nu se corrige en
 * le remplaçant par son identifiant canonique, que la §0 du registre résout — pas en l'exemptant.
 *
 * C'EST UNE GARDE DE PUBLICATION, PAS UNE GARDE DE STYLE. Le dépôt est PUBLIC (décision `W13`,
 * REQ-GOV-031, REQ-GOV-003) : un identifiant qui ne résout nulle part y reste lisible pour
 * toujours — forks, caches et miroirs compris, y compris après un passage en privé.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Un identifiant nu : une lettre de relecteur suivie d'un ou deux chiffres.
 *
 * ── GOV-025 : LE POINT EST SORTI DE LA LOOKAHEAD, ET VOICI POURQUOI ─────────────────────────
 * La lookahead a porté `(?![A-Za-z0-9_.-])` jusqu'au 2026-09-05. Le point y figurait, si bien
 * qu'une étiquette COLLÉE À UN POINT FINAL n'était pas vue, alors que la même suivie d'une
 * espace l'était. Autrement dit la garde était aveugle à la position la plus fréquente d'un mot
 * dans de la prose : la fin de phrase. Pire, ses propres témoins `--prove` évitaient tous cette
 * position — l'auto-preuve n'exerçait jamais le seul endroit où la garde ne voyait rien, et
 * restait donc VERTE SUR LE TEXTE QU'ELLE CONDAMNE. Le défaut a été trouvé en mutation, puis
 * reproduit involontairement en rédigeant l'entrée de journal de la PR 30 : des deux occurrences
 * écrites pour l'illustrer, une seule a été relevée — celle qui n'était pas collée au point.
 *
 * DEUX FORMES ÉTAIENT POSSIBLES, ET LE CHOIX A ÉTÉ MESURÉ AVANT D'ÊTRE FAIT :
 *   (a) retirer le point tout court                       → `(?![A-Za-z0-9_-])`
 *   (b) ne garder que le point SUIVI D'UN CARACTÈRE DE MOT → `(?![A-Za-z0-9_-]|\.\w)`, qui aurait
 *       continué d'abriter une extension (`gov-pr.ts`), une version (`v1.2`), un numéro de
 *       sous-section.
 * Mesure du 2026-09-05, sur les fichiers suivis, hors fichiers exempts : la forme (a) fait
 * apparaître UNE seule occurrence de plus que la forme (b) — `docs/gates.json`, « 9 controles
 * plus C13.3 ». Or ce jeton n'est pas un numéro de sous-section : c'est une étiquette de
 * relecteur, que `docs/requirements.json` cite deux fois sous la forme « audit anti-abus C13 ».
 * La forme (b) n'aurait donc protégé AUCUN usage légitime : elle aurait seulement continué de
 * cacher le seul identifiant nu que le point dissimulait encore. La forme (a) est retenue.
 *
 * CE QUE (a) COÛTE, ET QUI EST ASSUMÉ. Un jeton de la classe suivi d'un point n'est plus abrité
 * par accident : « les sauvegardes partent sur R2. » rougit désormais, là où « Cloudflare R2. »
 * reste vert par la locution légitime ci-dessous. C'est le comportement voulu — `R2` seul est
 * ambigu (c'est aussi une étiquette de relecteur), et le lever tient en un mot : nommer Cloudflare.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */
/**
 * ⚠️ AFFINÉ APRÈS GOV-025, ET C'EST UNE CORRECTION DE SA PROPRE SURCORRECTION (GOV-025).
 * GOV-025 a retiré le `.` de la lookahead pour attraper l'étiquette collée à un point final —
 * « conforme à D11. » — et elle avait raison : c'était sa cécité. Mais retirer le point tout
 * entier fait aussi tomber les RENVOIS POINTÉS, qui ne sont pas des étiquettes nues : `C13.3`
 * est le numéro d'une section de l'audit anti-abus, il RÉSOUT, et il est cité comme tel.
 *
 * Mesuré sur cet arbre le 2026-09-05 : `docs/gates.json:696` porte « 9 controles plus C13.3 »
 * depuis `main`, et GOV-025 vit sur une branche de lot. Les deux sont verts SÉPARÉMENT et
 * rouges ENSEMBLE — le jour où le lot atterrit, l'étape « Identifiants qualifies » de Gate A
 * rougit sur `main`, sur une ligne que personne n'a touchée.
 *
 * La ligne se trace sur CE QUI SUIT LE POINT, et elle est exacte parce que les deux cas ne se
 * ressemblent qu'en surface :
 *   — un point suivi d'un CHIFFRE prolonge l'identifiant : `C13.3` est un renvoi, pas un jeton nu ;
 *   — un point suivi d'autre chose — espace, fin de ligne, guillemet — termine une phrase, et
 *     l'étiquette qui le précède est bien nue. C'est le cas que GOV-025 a ouvert, et il reste vu.
 *
 * Ce n'est donc PAS un retour à la forme d'avant GOV-025, qui ignorait les deux.
 */
export const MOTIF_NU = /(?<![A-Za-z0-9_./:-])([ABCDR]\d{1,2})(?![A-Za-z0-9_-]|\.\d)/g;

/**
 * SPÉCIMEN HISTORIQUE — la lookahead d'AVANT GOV-025, conservée pour une seule raison : rejouer
 * les témoins contre la version cassée. Un témoin qu'on n'a pas vu attraper l'ancien défaut ne
 * prouve pas qu'il l'attraperait (RM-02) ; c'est elle qui rend cette démonstration reproductible,
 * ici et dans `tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts`.
 * ⚠️ Elle n'est utilisée par AUCUN contrôle : `analyser()` ne connaît que `MOTIF_NU`.
 */
export const MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE =
  /(?<![A-Za-z0-9_./:-])([ABCDR]\d{1,2})(?![A-Za-z0-9_.-])/g;

/**
 * DEUX ESPACES DE NOMS SE RESSEMBLENT, ET L'EXIGENCE LES CONFONDAIT.
 * `A01`…`A15` (et `A40`, la taille de la flotte) sont les codes de POSTE des agents — un espace
 * de noms déclaré, que `tasks.schema.json` impose sous la forme `^A[0-9]{2}$`. `D3`, `C12`, `D11`
 * sont des étiquettes de relecteur, qui ne résolvent nulle part. La regex de REQ-GOV-003
 * (`[ABCDR]\d{1,2}`) attrapait les deux : appliquée telle quelle, elle exigeait de renommer
 * les quinze postes.
 * La ligne se trace sur le ZÉRO DE TÊTE : `A` suivi de DEUX chiffres est un poste ; tout le reste
 * — y compris `A5` ou `A2`, qui désignaient des postes sans respecter le schéma — est nu.
 */
function estCodeDePoste(jeton: string): boolean {
  return /^A\d{2}$/.test(jeton);
}

/**
 * Ce qui ressemble à un identifiant nu sans en être un. Chaque exemption est une locution
 * ENTIÈRE, pas la seule étiquette : exempter « R2 » partout rendrait la garde aveugle à
 * « conforme à R2 », qui est exactement ce qu'elle cherche.
 */
/**
 * CITER N'EST PAS SE SERVIR. Les documents qui EXPLIQUENT la règle doivent pouvoir écrire son
 * contre-exemple : `gardien-spec.md`, `REGLES-MAISON.md` et `gates.json` citent tous
 * « conforme à D3 » comme illustration de ce qui est refusé. La garde rougissait sur cinq
 * occurrences qui étaient sa propre documentation.
 * Un identifiant entre guillemets — français « … », doubles " … " ou simples ' … ' — est une
 * CITATION. Hors guillemets, c'est une référence, et elle doit résoudre.
 *
 * ── GOV-028 : LA RÈGLE ÉTAIT ÉCRITE POUR LA PROSE, ELLE S'APPLIQUAIT À LA SYNTAXE ────────────
 * Elle a été posée pour de la prose, et elle valait pour TOUS les fichiers suivis. Or dans un
 * `.ts`, un `.json` ou un `.yml`, les guillemets qui entourent une valeur ne citent rien : ils
 * DÉLIMITENT. `const note = "conforme a D11";` n'est pas une citation, c'est un usage — et il
 * passait.
 *
 * LE TÉMOIN, MESURÉ SUR LA GARDE LIVRÉE LE 2026-09-05, ET REJOUÉ PAR `--prove` : un fichier suivi
 * portant `export const note = "conforme a D11 ; rien de plus";` rendait ZÉRO faute ; la MÊME
 * instruction, la MÊME étiquette, la chaîne rallongée au-delà du plafond, en rendait UNE. Le
 * verdict dépendait donc de la LONGUEUR du voisinage, pas de son contenu — c'est-à-dire qu'il
 * suffisait d'écrire court pour n'être pas vu, et que la garde n'était pas rejouable.
 *
 * CE QUI EST TRANCHÉ, ET LA LIGNE EXACTE :
 *   — en PROSE (`.md`), les trois familles citent, comme avant. La règle d'origine est intacte ;
 *   — en CODE, deux choses seulement citent : les guillemets FRANÇAIS, qui ne sont un délimiteur
 *     d'aucun de ces langages, et une citation IMBRIQUÉE — un délimiteur d'une AUTRE famille à
 *     l'intérieur d'une chaîne, comme `'conforme a D3'` dans un gabarit entre accents graves.
 *     C'est exactement la forme qu'un fichier de code prend pour citer.
 *
 * CE QUE ÇA COÛTE, ET QUI EST ASSUMÉ. Un commentaire de code qui cite avec des guillemets DROITS
 * — `// on refuse "conforme à D3"` — rougit désormais ; le lever tient à un caractère, écrire
 * « … ». Mesuré sur cet arbre le 2026-09-05 : aucune occurrence de cette forme n'existe.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * ── GOV-028 : LE PLAFOND DE 120 CARACTÈRES EST SUPPRIMÉ, ET VOICI POURQUOI ────────────────────
 * Il servait à ne pas avaler la moitié d'une ligne en partant d'une apostrophe française — dans
 * « l'étiquette D3 n'est pas résolue », les deux apostrophes forment une fausse paire de quotes
 * simples. Mais un plafond en NOMBRE DE CARACTÈRES est un proxy grossier de ce problème : il fait
 * dépendre le verdict de la longueur d'une phrase, ce qui n'est ni explicable ni rejouable, et il
 * s'obtient à volonté dans les deux sens (rallonger pour être vu, raccourcir pour ne pas l'être).
 *
 * Le discriminant JUSTE est la frontière de mot, pas une distance : une quote simple qui ouvre une
 * citation est précédée d'un caractère qui n'est ni lettre ni chiffre, et celle qui la ferme est
 * suivie de même. Une apostrophe, elle, est collée à ses lettres. Éprouvé contre le cas qui l'a
 * motivé — « l'étape D3.1 précède l'étape D3.2 » n'est plus avalée par une fausse paire — ET
 * contre le cas qui doit passer : « citer 'conforme a D3' dans un commentaire » reste vert.
 * Mesuré : sur les fichiers suivis, retirer le plafond ne révèle ni ne cache aucune occurrence.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */
export const CITATIONS_PROSE: RegExp[] = [
  /«[^»]*»/g,
  /"[^"]*"/g,
  /(?<![\p{L}\p{N}])'[^']*'(?![\p{L}\p{N}])/gu,
];

/**
 * SPÉCIMEN HISTORIQUE — la neutralisation d'AVANT GOV-028, plafond compris, conservée pour la
 * même raison que `MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE` : rejouer les témoins contre la version
 * cassée (RM-02, LEC-19). Un témoin qu'on n'a pas vu attraper l'ancien défaut ne prouve pas
 * qu'il l'attraperait. C'est elle qui rend la dépendance à la longueur MESURABLE plutôt que
 * racontée : le même témoin court y est manqué et sa version rallongée y est vue.
 * ⚠️ Elle n'est utilisée par AUCUN contrôle : `analyser()` ne connaît que `neutraliser()`.
 */
export const PLAFOND_HISTORIQUE = 120;
export const CITATIONS_AVEUGLES_A_LA_SYNTAXE: RegExp[] = [
  new RegExp(`«[^»]{0,${PLAFOND_HISTORIQUE}}»`, 'g'),
  new RegExp(`"[^"]{0,${PLAFOND_HISTORIQUE}}"`, 'g'),
  new RegExp(`'[^']{0,${PLAFOND_HISTORIQUE}}'`, 'g'),
];

const LOCUTIONS_LEGITIMES = [
  /\bR2\b(?=\s*(?:de\s+Cloudflare|Cloudflare|,\s*préfixe|\s*bucket))/gi, // le stockage objet
  /\bCloudflare\s+R2\b/gi,
  /\bpréfixe\s+`?partners\/`?\b/gi,
  /\bB2B\b/gi,
  /\bD8222\b/g, // art. D.8222-5 — trois chiffres, hors motif, mais on le neutralise par sûreté
];

export const FICHIERS = /\.(ts|tsx|js|jsx|md|json|yml|yaml)$/;

/**
 * ── GOV-028 : LE CONTEXTE, DÉRIVÉ DU NOM DU FICHIER ──────────────────────────────────────────
 * La dimension que le test et la preuve font varier est le CONTEXTE (RM-11). Elle n'a donc pas de
 * valeur par défaut : elle se DÉRIVE du seul argument qui la porte, le chemin du fichier, que
 * `analyser()` fournit toujours réel. Les deux contextes PARTITIONNENT exactement les extensions
 * que la garde balaie — un cas du test le vérifie, pour qu'une extension ajoutée demain à
 * `FICHIERS` ne se retrouve jamais sans verdict connu.
 */
const EXTENSIONS_DE_CODE = /\.(ts|tsx|js|jsx|json|yml|yaml)$/;
export type Contexte = 'prose' | 'code';
export function contexteDeFichier(fichier: string): Contexte {
  return EXTENSIONS_DE_CODE.test(fichier) ? 'code' : 'prose';
}

/** Les trois délimiteurs de chaîne des langages que la garde balaie. */
export const FAMILLES_DELIMITEURS = ['guillemets_droits', 'quote_simple', 'accent_grave'] as const;
export type FamilleDelimiteur = (typeof FAMILLES_DELIMITEURS)[number];
export const DELIMITEUR_DE_FAMILLE: Record<FamilleDelimiteur, string> = {
  guillemets_droits: '"',
  quote_simple: "'",
  accent_grave: '`',
};
/** Le registre a le droit de NOMMER les identifiants d'origine : c'est son travail de les résoudre. */
const EXEMPTS = [
  /^docs\/DECISIONS\.md$/,
  /^scripts\/gates\/gov-identifiants\.ts$/,
  /^docs\/REQUIREMENTS(-ANNEXE-FUSIONS)?\.md$/,
  /^docs\/requirements\.json$/,
  /^docs\/TASKS\.md$/,
  /^docs\/tasks\.json$/,
  /^pnpm-lock\.yaml$/,
];

export type Faute = { famille: string; message: string };

/**
 * ── GOV-028 : LES EXEMPTIONS NOMMÉES ─────────────────────────────────────────────────────────
 * Élargir la règle à la syntaxe révèle DEUX usages du dépôt, et les deux sont légitimes. Une
 * garde qui rougit trop est aussi cassée qu'une garde qui ne rougit pas : la réponse humaine à
 * une garde qui rougit trop est de la désarmer. Ils ne retombent pas dans le silence pour autant
 * — chacun est NOMMÉ, motivé, et éprouvé des deux côtés par `--prove` et par le test :
 *   — la ligne RÉELLE est retrouvée dans son fichier par `reperage` (lue, jamais recopiée, RM-01)
 *     et doit rester verte ; si elle disparaît, l'exemption devient de l'aveuglement et rougit ;
 *   — la même ligne SANS l'exemption doit rougir : une exemption qui n'exempte rien est du bruit ;
 *   — `contreExemple` est le presque-pareil, qui doit RESTER rouge. Un discriminant qu'on
 *     n'éprouve pas contre le cas qui doit passer ne discrimine rien.
 */
export type ExemptionNommee = {
  nom: string;
  pourquoi: string;
  fichier: string;
  /** Comment retrouver la ligne réelle, quel que soit son numéro. Sans `g` : `.test()` est appelé en boucle. */
  reperage: RegExp;
  /** Ce qui est neutralisé, et rien de plus. */
  motif: RegExp;
  contreExemple: string;
  fichierDuContreExemple: string;
};

export const EXEMPTIONS_NOMMEES: ExemptionNommee[] = [
  {
    nom: 'fixture_de_code_de_poste_invalide',
    pourquoi:
      "`gov:agents` prouve sa famille `source_code_invalide` avec la fixture d'un code de poste " +
      "à UN chiffre, que `tasks.schema.json` refuse. C'est la fixture du défaut (LEC-19) : la " +
      "retirer désarmerait la seule preuve que `gov:agents` sait rougir sur un code mal formé. " +
      "L'exemption porte sur l'APPEL du constructeur de fixture, pas sur la valeur : la même " +
      'étiquette écrite ailleurs reste vue.',
    fichier: 'scripts/gates/gov-agents.ts',
    reperage: /posteTemoin\('[A-Z]\d'/,
    motif: /\bposteTemoin\(\s*'[A-Z]\d{1,2}'/g,
    contreExemple: `const poste = 'A1';`,
    fichierDuContreExemple: 'scripts/exemple.ts',
  },
  {
    nom: 'libelle_d_affirmation_invalidee',
    pourquoi:
      "`affirmations-verifiees.spec.ts` cite les cinq affirmations que le registre invalide, sous " +
      'leur libellé D\'ORIGINE — celui des sept documents, étiquette de relecteur comprise. Citer ' +
      "l'affirmation fausse est le travail même de ce test. Et elle n'est pas nue : son identifiant " +
      "qualifié figure sur la MÊME ligne, en `repere`. C'est cette co-présence qui est exemptée, " +
      "pas le libellé : le même libellé sans son repère qualifié reste rouge.",
    fichier: 'tests/unit/gouvernance/affirmations-verifiees.spec.ts',
    reperage: /libelle:\s*'[^']*'.*\brepere:\s*'AFF-\d+'/,
    motif: /libelle:\s*'[^']*'(?=.*\brepere:\s*'AFF-\d+')/g,
    contreExemple: `  { libelle: 'C3 codé', motif: /cha[îi]ne/i },`,
    fichierDuContreExemple: 'tests/exemple.spec.ts',
  },
];

const masquer = (m: string) => '·'.repeat(m.length);

/**
 * En CODE : une chaîne délimitée est de la SYNTAXE, son contenu reste visible. Deux choses seules
 * y citent — les guillemets français, qui ne délimitent rien dans ces langages, et une citation
 * IMBRIQUÉE, c'est-à-dire un délimiteur d'une AUTRE famille à l'intérieur d'une chaîne.
 *
 * Le balayage est un automate, pas une expression régulière, et c'est ce qui permet de supprimer
 * le plafond : la fin d'une chaîne est son délimiteur fermant, jamais une distance. Un délimiteur
 * qui ne se referme pas sur la ligne n'ouvre rien — on n'invente pas une chaîne qu'on ne voit pas
 * finir.
 */
function neutraliserEnCode(ligne: string): string {
  const out = ligne.split('');
  const marquer = (debut: number, fin: number) => {
    for (let k = debut; k < fin; k++) out[k] = '·';
  };
  for (const m of ligne.matchAll(/«[^»]*»/g)) marquer(m.index!, m.index! + m[0].length);

  const delimiteurs = Object.values(DELIMITEUR_DE_FAMILLE);
  let i = 0;
  while (i < ligne.length) {
    const d = ligne[i]!;
    if (!delimiteurs.includes(d)) {
      i++;
      continue;
    }
    const fin = ligne.indexOf(d, i + 1);
    if (fin < 0) break;
    const contenu = ligne.slice(i + 1, fin);
    for (const autre of delimiteurs) {
      if (autre === d) continue;
      for (const m of contenu.matchAll(new RegExp(`${autre}[^${autre}]*${autre}`, 'g')))
        marquer(i + 1 + m.index!, i + 1 + m.index! + m[0].length);
    }
    i = fin + 1;
  }
  return out.join('');
}

/**
 * ⚠️ `contexte` et `exemptions` n'ont AUCUNE valeur par défaut (RM-11) : ce sont exactement les
 * deux dimensions que la preuve et le test font varier — prose contre code, avec exemption contre
 * sans. Un défaut ici rendrait « rejoué sans l'exemption » indiscernable de « rejoué avec ».
 */
function neutraliser(ligne: string, contexte: Contexte, exemptions: ExemptionNommee[]): string {
  const citations =
    contexte === 'code'
      ? neutraliserEnCode(ligne)
      : CITATIONS_PROSE.reduce((s, r) => s.replace(r, masquer), ligne);
  const sansExemptions = exemptions.reduce((s, e) => s.replace(e.motif, masquer), citations);
  return LOCUTIONS_LEGITIMES.reduce((s, r) => s.replace(r, masquer), sansExemptions);
}

/**
 * Les fautes d'une ligne, SOUS UN MOTIF DONNÉ.
 *
 * ⚠️ `motif` n'a AUCUNE valeur par défaut, et c'est délibéré (RM-11) : c'est exactement la
 * dimension que la preuve et le test font varier — lookahead corrigée contre lookahead cassée. Un
 * défaut ici rendrait « rejoué contre l'ancienne » indiscernable de « rejoué contre la nouvelle »,
 * c'est-à-dire rendrait la démonstration muette au moment précis où elle compte.
 */
function fautesSurLigneNeutralisee(
  propre: string,
  fichier: string,
  i: number,
  motif: RegExp
): Faute[] {
  const out: Faute[] = [];
  motif.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(propre)) !== null) {
    if (estCodeDePoste(m[1]!)) continue;
    out.push({
      famille: 'identifiant_nu',
      message:
        `${fichier}:${i + 1} — identifiant nu « ${m[1]} ». Cite la forme qualifiée du registre ` +
        `(\`HYP-*\`, \`DEC-*\`, \`W<n>\`) : une étiquette de relecteur ne résout pas, ne se date pas, ` +
        `et n'a pas de propriétaire. La §0 de docs/DECISIONS.md donne la correspondance.`,
    });
  }
  return out;
}

export function fautesDeLigne(ligne: string, fichier: string, i: number, motif: RegExp): Faute[] {
  const propre = neutraliser(ligne, contexteDeFichier(fichier), EXEMPTIONS_NOMMEES);
  return fautesSurLigneNeutralisee(propre, fichier, i, motif);
}

/**
 * La même ligne, une exemption nommée RETIRÉE. Rien ne l'appelle pour juger : elle sert à établir
 * qu'une exemption exempte réellement quelque chose. Sans elle, une exemption devenue inutile —
 * parce que la ligne qu'elle protégeait a changé — resterait en place sans que rien ne le dise,
 * et continuerait d'aveugler la garde sur tout ce qui lui ressemble.
 */
export function fautesDeLigneSansExemptions(
  noms: readonly string[],
  ligne: string,
  fichier: string,
  i: number,
  motif: RegExp
): Faute[] {
  const restantes = EXEMPTIONS_NOMMEES.filter((e) => !noms.includes(e.nom));
  const propre = neutraliser(ligne, contexteDeFichier(fichier), restantes);
  return fautesSurLigneNeutralisee(propre, fichier, i, motif);
}

export function fautesDeLigneSansExemption(
  nom: string,
  ligne: string,
  fichier: string,
  i: number,
  motif: RegExp
): Faute[] {
  return fautesDeLigneSansExemptions([nom], ligne, fichier, i, motif);
}

/**
 * La ligne jugée par la neutralisation d'AVANT GOV-028 — trois familles partout, plafond compris,
 * et aucune exemption nommée (elles n'existaient pas). C'est la FIXTURE DU DÉFAUT (LEC-19) : rien
 * ne l'appelle pour juger, elle sert à MESURER ce que la règle d'avant cachait, au lieu de le
 * raconter. Le même témoin court y est manqué, sa version rallongée y est vue : c'est la
 * dépendance à la longueur, rendue reproductible.
 */
export function fautesDeLigneAveugleALaSyntaxe(
  ligne: string,
  fichier: string,
  i: number,
  motif: RegExp
): Faute[] {
  const citations = CITATIONS_AVEUGLES_A_LA_SYNTAXE.reduce((s, r) => s.replace(r, masquer), ligne);
  const propre = LOCUTIONS_LEGITIMES.reduce((s, r) => s.replace(r, masquer), citations);
  return fautesSurLigneNeutralisee(propre, fichier, i, motif);
}

/** ⚠️ Les gardes de ce dépôt balaient `git ls-files`, jamais le disque (RM-14). */
export function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export type Juge = (ligne: string, fichier: string, i: number) => Faute[];

/**
 * Le balayage, SOUS UN JUGE DONNE.
 *
 * ⚠️ `juger` n'a AUCUNE valeur par défaut (RM-11) : c'est exactement la dimension que les comptes
 * globaux font varier — règle d'avant GOV-028, règle d'aujourd'hui sans les exemptions nommées,
 * règle livrée. Sans cet argument, un compte se lirait sur `fautesDeLigne` seule, hors exemptions
 * et hors locutions légitimes, et rendrait des chiffres qu'on ne saurait pas reproduire — ce qui
 * est précisément ce que cette tâche reproche à la garde : un compteur qu'on ne sait pas rejouer.
 *
 * Le filtre — fichiers exempts, extensions balayées, existence sur le disque — est le MÊME dans
 * les trois cas : un compte établi sur une autre liste de fichiers ne se compare à rien.
 */
export function analyserAvec(fichiers: string[], juger: Juge): Faute[] {
  const fautes: Faute[] = [];
  for (const f of fichiers) {
    if (EXEMPTS.some((r) => r.test(f))) continue;
    if (!FICHIERS.test(f) || !existsSync(f)) continue;
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((ligne, i) => fautes.push(...juger(ligne, f, i)));
  }
  return fautes;
}

export function analyser(fichiers: string[]): Faute[] {
  return analyserAvec(fichiers, (ligne, f, i) => fautesDeLigne(ligne, f, i, MOTIF_NU));
}

// ── GOV-025 : les positions limites ──────────────────────────────────────────────────────────
/**
 * Les positions d'un identifiant DANS UNE LIGNE. Ce n'est pas la même chose qu'une famille de
 * faute : la famille dit CE QUI est refusé, la position dit OÙ la garde regarde. Le défaut de
 * GOV-025 était une position, pas une famille — et c'est pour cela qu'un `--prove` organisé par
 * familles seules a pu rester vert sur le texte qu'il condamne.
 * Les huit premières sont celles qu'exige l'acceptation de GOV-025 ; les deux dernières combinent
 * le point final avec une fermeture, parce que c'est là que la prose française le met vraiment.
 */
export const POSITIONS_LIMITES = [
  'fin_de_phrase',
  'fin_de_ligne',
  'avant_virgule',
  'avant_point_virgule',
  'avant_parenthese_fermante',
  'avant_guillemet_fermant',
  'cellule_de_tableau',
  'titre_en_gras',
  'point_puis_parenthese_fermante',
  'point_puis_guillemet_fermant',
] as const;

export type PositionLimite = (typeof POSITIONS_LIMITES)[number];

/**
 * Un témoin de position. `manqueParLAncienne` n'est PAS un commentaire : la preuve s'en sert pour
 * rejouer le témoin contre `MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE` et vérifier que l'étiquette dit
 * vrai — un témoin annoncé « aveugle » que l'ancienne voyait déjà n'exerce pas le défaut, et un
 * témoin annoncé « vu » que l'ancienne manquait signale une cécité plus large que documentée.
 */
export type TemoinLimite = { position: PositionLimite; texte: string; manqueParLAncienne: boolean };

export const TEMOINS_LIMITES: TemoinLimite[] = [
  {
    position: 'fin_de_phrase',
    texte: `// le point final masquait tout : conforme à D3.`,
    manqueParLAncienne: true,
  },
  {
    position: 'fin_de_ligne',
    texte: `> la note du relecteur cite D11`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_virgule',
    texte: `la note cite D3, puis enchaîne sur le reste`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_point_virgule',
    texte: `la note cite D11; puis enchaîne sur le reste`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_parenthese_fermante',
    texte: `la note cite le dernier arbitrage (D3)`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_guillemet_fermant',
    texte: `fin de la note du relecteur : D3»`,
    manqueParLAncienne: false,
  },
  {
    position: 'cellule_de_tableau',
    texte: `| RM-12 | référence non résolue : D3. | rouge |`,
    manqueParLAncienne: true,
  },
  {
    position: 'titre_en_gras',
    texte: `**Arbitrage D3.** — le point colle au gras`,
    manqueParLAncienne: true,
  },
  {
    position: 'point_puis_parenthese_fermante',
    texte: `(le détail figure au registre, voir D3.)`,
    manqueParLAncienne: true,
  },
  {
    position: 'point_puis_guillemet_fermant',
    texte: `fin de note du relecteur : voir D3.»`,
    manqueParLAncienne: true,
  },
];

/**
 * Les usages LÉGITIMES aux mêmes positions limites. Sans eux, retirer le point de la lookahead
 * serait un pari : une garde qui rougit trop est aussi cassée qu'une garde qui ne rougit pas — et
 * la réponse humaine à une garde qui rougit trop est de la désarmer.
 * Chacun place son jeton exactement là où la garde vient de gagner en vue : collé au point.
 */
export const CONTRE_TEMOINS_LIMITES: string[] = [
  `jamais « conforme à D3. » — citer le contre-exemple reste permis`,
  `les sauvegardes vivent sur Cloudflare R2.`,
  `le stockage objet est R2 de Cloudflare.`,
  `le troisième relecteur bloquant est le poste A02.`,
  `la flotte compte A40 agents.`,
  `le réseau vise le B2B.`,
  `art. D.8222-5 du code du travail.`,
  `la décision HYP-W6-BIS a tranché, W13 la publication.`,
  `le pré-vol lance scripts/gates/gov-pr.ts puis scripts/gates/gov-adr.ts`,
  `la CI épingle pnpm 9.12.0 et node 22.`,
  `le format SEPA reste pain.001.001.09.`,
  // ── les renvois POINTÉS (GOV-025) ─────────────────────────────────────────
  // Ceux-ci ne sont pas décoratifs. Le premier est, mot pour mot, la ligne 696 de
  // `docs/gates.json` sur laquelle GOV-025 faisait rougir la CI : un contre-témoin recopié de la
  // ligne RÉELLE qui a cassé vaut mieux qu'un contre-témoin inventé qui lui ressemble.
  // Les deux suivants disent que la règle porte sur la FORME du renvoi, pas sur ce seul cas.
  `9 controles plus C13.3 ; manifeste a jour (pnpm mcp:manifeste)`,
  `le détail est en C13.3.2 de la note d'analyse`,
  `l'étape D3.1 précède l'étape D3.2`,
];

// ── GOV-028 : les familles de DÉLIMITEUR, et le contexte ─────────────────────────────────────
/**
 * Un témoin de délimiteur. Il est écrit comme un GABARIT dont `{}` est le voisinage : les deux
 * versions du témoin — courte et rallongée — sont ainsi la MÊME instruction, la MÊME étiquette,
 * le MÊME fichier, à la seule longueur du voisinage près. C'est la seule façon d'établir que le
 * verdict dépendait de cette longueur, et non de quoi que ce soit d'autre.
 *
 * `cacheParLAncienne` et `citeEnProse` ne sont pas des commentaires : la preuve et le test s'en
 * servent pour rejouer le témoin contre la neutralisation d'avant et contre l'autre contexte, et
 * vérifient l'étiquette DANS LES DEUX SENS. Une étiquette qu'on ne vérifie que d'un côté finit
 * par décrire l'intention de son auteur plutôt que le code.
 */
export type TemoinDelimiteur = {
  famille: FamilleDelimiteur;
  fichier: string;
  gabarit: string;
  cacheParLAncienne: boolean;
  citeEnProse: boolean;
};

export const VOISINAGE_COURT = 'rien de plus';
export const VOISINAGE_LONG = 'x'.repeat(PLAFOND_HISTORIQUE + 20);
export function temoinCourt(t: TemoinDelimiteur): string {
  return t.gabarit.replace('{}', VOISINAGE_COURT);
}
export function temoinLong(t: TemoinDelimiteur): string {
  return t.gabarit.replace('{}', VOISINAGE_LONG);
}

/**
 * Le contenu cité le plus long de la ligne — celui que l'ancien plafond mesurait. Sert à établir
 * que les deux versions d'un témoin ENCADRENT bien ce plafond : deux témoins tous deux courts, ou
 * tous deux longs, rendraient le même verdict pour une raison étrangère à la règle.
 */
export function contenuCite(ligne: string): string {
  const delimiteurs = Object.values(DELIMITEUR_DE_FAMILLE);
  let plusLong = '';
  let i = 0;
  while (i < ligne.length) {
    const c = ligne[i]!;
    const fermant = c === '«' ? '»' : delimiteurs.includes(c) ? c : null;
    if (fermant === null) {
      i++;
      continue;
    }
    const fin = ligne.indexOf(fermant, i + 1);
    if (fin < 0) break;
    const contenu = ligne.slice(i + 1, fin);
    if (contenu.length > plusLong.length) plusLong = contenu;
    i = fin + 1;
  }
  return plusLong;
}

/**
 * Un témoin par famille de délimiteur, ET par extension que la garde balaie — le test refuse
 * qu'une extension de `FICHIERS` reste sans témoin. Les étiquettes employées ne sont pas des codes
 * de poste : un code de poste est exempt par ailleurs, et la démonstration serait muette.
 */
export const TEMOINS_DELIMITEURS: TemoinDelimiteur[] = [
  {
    famille: 'guillemets_droits',
    fichier: 'src/exemple.ts',
    gabarit: `export const note = "conforme a D11 ; {}";`,
    cacheParLAncienne: true,
    citeEnProse: true,
  },
  {
    famille: 'quote_simple',
    fichier: 'src/exemple.ts',
    gabarit: `export const note = 'conforme a D11 ; {}';`,
    cacheParLAncienne: true,
    citeEnProse: true,
  },
  {
    famille: 'accent_grave',
    fichier: 'src/exemple.ts',
    gabarit: 'export const note = `conforme a D11 ; {}`;',
    // L'accent grave n'a JAMAIS été neutralisé : il ne figurait pas dans les trois familles. Il est
    // ici pour dire que la nouvelle règle ne le régresse pas, et l'étiquette le déclare.
    cacheParLAncienne: false,
    citeEnProse: false,
  },
  {
    famille: 'quote_simple',
    fichier: 'src/exemple.tsx',
    gabarit: `const etiquette = 'conforme a D3 ; {}';`,
    cacheParLAncienne: true,
    citeEnProse: true,
  },
  {
    famille: 'guillemets_droits',
    fichier: 'scripts/exemple.js',
    gabarit: `module.exports = { note: "conforme a D3 ; {}" };`,
    cacheParLAncienne: true,
    citeEnProse: true,
  },
  {
    famille: 'accent_grave',
    fichier: 'src/exemple.jsx',
    gabarit: 'const note = `conforme a D3 ; {}`;',
    cacheParLAncienne: false,
    citeEnProse: false,
  },
  {
    famille: 'guillemets_droits',
    fichier: 'docs/exemple.json',
    gabarit: `  "note": "conforme a C12 ; {}",`,
    cacheParLAncienne: true,
    citeEnProse: true,
  },
  {
    famille: 'guillemets_droits',
    fichier: '.github/exemple.yml',
    gabarit: `  note: "conforme a C12 ; {}"`,
    cacheParLAncienne: true,
    citeEnProse: true,
  },
  {
    famille: 'quote_simple',
    fichier: 'config/exemple.yaml',
    gabarit: `  note: 'conforme a C12 ; {}'`,
    cacheParLAncienne: true,
    citeEnProse: true,
  },
];

/**
 * ── GOV-028 : LE DISCRIMINANT QUI REMPLACE LE PLAFOND, ÉPROUVÉ CONTRE LE CAS QUI L'A MOTIVÉ ──
 * Retirer le plafond sans rien mettre à la place aurait aggravé un défaut ancien : en français,
 * la quote simple est d'abord une APOSTROPHE, et deux apostrophes voisines forment une fausse
 * paire de guillemets qui avale ce qui les sépare. Ces témoins sont EN PROSE et portent chacun
 * une étiquette nue entre deux apostrophes ; ils sont MANQUÉS par la neutralisation d'avant, et
 * vus par celle d'aujourd'hui.
 *
 * Sans eux, la contrainte de frontière de mot n'était exercée par AUCUN cas : mesuré le
 * 2026-09-05, la retirer laissait `--prove` VERTE de bout en bout. Un discriminant qu'on
 * n'éprouve pas contre le cas qui l'a motivé ne discrimine rien — et il est ici éprouvé dans
 * l'autre sens aussi, par le contre-témoin « citer 'conforme a D3' dans un commentaire », qui
 * doit rester vert.
 */
export const TEMOINS_APOSTROPHE: string[] = [
  `l'étiquette D3 n'est pas résolue`,
  `l'arbitrage D11 n'a pas d'entrée au registre`,
];

/**
 * Ce qu'un fichier de code a le droit d'écrire, et qui doit rester vert. Sans eux, élargir la
 * règle serait un pari : une garde qui rougit trop est aussi cassée qu'une garde qui ne rougit
 * pas, parce qu'on la désarme. Les deux premiers portent la ligne exacte que la nouvelle règle
 * laisse ouverte pour CITER dans un fichier de code — les guillemets français, et l'imbrication.
 */
export const CONTRE_TEMOINS_SYNTAXE: { fichier: string; ligne: string; pourquoi: string }[] = [
  {
    fichier: 'src/exemple.ts',
    ligne: `// jamais « conforme à D3 » — en code aussi, les guillemets français CITENT`,
    pourquoi: 'guillemets français dans un commentaire de code',
  },
  {
    fichier: 'src/exemple.ts',
    ligne: "const c = `fixtureRouge : citer 'conforme a D3' dans un commentaire`;",
    pourquoi: 'citation imbriquée dans un gabarit',
  },
  {
    fichier: 'src/exemple.ts',
    ligne: `const c = "la note dit 'conforme a D3' et rien d'autre";`,
    pourquoi: 'citation imbriquée entre guillemets droits',
  },
  {
    fichier: 'docs/exemple.json',
    ligne: `  "preuve": "citer « conforme à D3 » reste permis",`,
    pourquoi: 'guillemets français dans une valeur JSON',
  },
  {
    fichier: '.github/exemple.yml',
    ligne: `  run: npx tsx scripts/gates/gov-pr.ts`,
    pourquoi: 'une commande, aucune étiquette',
  },
  {
    fichier: 'src/exemple.ts',
    ligne: `const b = 'sauvegardes R2 de Cloudflare, préfixe \`partners/\`';`,
    pourquoi: 'locution légitime dans une chaîne',
  },
  {
    fichier: 'src/exemple.ts',
    ligne: `const postes = ['A01', 'A02', 'A15'];`,
    pourquoi: 'codes de poste, un espace de noms déclaré',
  },
  {
    fichier: 'src/exemple.ts',
    ligne: `const d = "conforme a DEC-BEB-D03, voir HYP-W6-BIS";`,
    pourquoi: 'identifiants qualifiés dans une chaîne',
  },
];

/**
 * La §0 du registre des décisions, LUE et non recopiée (RM-01). C'est le contre-témoin le plus
 * exigeant du lot : chacune de ses lignes cite des identifiants d'ORIGINE sous leur habit qualifié
 * (`DEC-ABUS-C12`, `DEC-BEB-A12`, `HYP-W6`) — les formes mêmes que la garde cherche. Si la garde
 * rougissait dessus, elle rougirait sur la table qui RÉSOUT les identifiants nus.
 * Un registre absent ou une §0 vide font ÉCHOUER la preuve : un contre-témoin qu'on saute en
 * silence est un contre-témoin qui n'a jamais rien prouvé.
 */
export function lignesDeLaSectionZero(registre = 'docs/DECISIONS.md'): string[] {
  if (!existsSync(registre)) return [];
  const lignes = readFileSync(registre, 'utf8').split('\n');
  const debut = lignes.findIndex((l) => /^##\s*0\./.test(l));
  if (debut < 0) return [];
  const suite = lignes.slice(debut + 1);
  const fin = suite.findIndex((l) => /^##\s/.test(l));
  return (fin < 0 ? suite : suite.slice(0, fin)).filter((l) => l.trim().startsWith('|'));
}

/**
 * GOV-028 — la preuve PAR CONTEXTE et PAR DÉLIMITEUR.
 *
 * Elle s'AJOUTE aux deux précédentes, elle n'en modifie aucun compteur : la ligne « 3 témoins
 * rougissent, 10 contre-témoins restent verts » est assertée mot pour mot par
 * `tests/unit/gouvernance/gardes.spec.ts` et recopiée dans `docs/gates.json` et `docs/GATES.md`
 * (LEC-20). Gonfler un compteur ferait rougir trois fichiers d'un coup, dont deux réservés.
 */
function prouverSyntaxe(): number {
  const sansTemoin = FAMILLES_DELIMITEURS.filter(
    (f) => !TEMOINS_DELIMITEURS.some((t) => t.famille === f)
  );
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de délimiteur sans témoin : ${sansTemoin.join(', ')}.`);
    return 1;
  }

  for (const [i, t] of TEMOINS_DELIMITEURS.entries()) {
    const court = temoinCourt(t);
    const long = temoinLong(t);
    const oj = `${t.famille} dans ${t.fichier}`;

    // Le témoin doit d'abord ENCADRER le plafond d'avant : sans cela, les deux versions ne
    // diffèrent pas là où l'ancienne règle décidait, et la démonstration ne montre rien.
    if (contenuCite(court).length > PLAFOND_HISTORIQUE) {
      console.error(`❌ ${oj} : la version courte dépasse déjà le plafond de l'ancienne règle.`);
      return 1;
    }
    if (contenuCite(long).length <= PLAFOND_HISTORIQUE) {
      console.error(`❌ ${oj} : la version rallongée n'atteint pas le plafond de l'ancienne règle.`);
      return 1;
    }

    for (const [etiquette, ligne] of [
      ['courte', court],
      ['rallongée', long],
    ] as const) {
      if (fautesDeLigne(ligne, t.fichier, i, MOTIF_NU).length === 0) {
        console.error(`❌ ${oj} : la version ${etiquette} n'a PAS fait rougir la garde.`);
        return 1;
      }
    }

    // Le rejeu contre la neutralisation d'AVANT, dans les deux sens (RM-02, LEC-19).
    const ancienneVoitLeCourt =
      fautesDeLigneAveugleALaSyntaxe(court, t.fichier, i, MOTIF_NU).length > 0;
    if (t.cacheParLAncienne && ancienneVoitLeCourt) {
      console.error(
        `❌ ${oj} : témoin annoncé caché par la neutralisation d'avant, or elle le voyait déjà. ` +
          `Il n'exerce donc pas le contournement.`
      );
      return 1;
    }
    if (!t.cacheParLAncienne && !ancienneVoitLeCourt) {
      console.error(
        `❌ ${oj} : témoin annoncé déjà vu avant GOV-028, or la neutralisation d'avant le MANQUAIT. ` +
          `Le contournement est plus large que documenté — corriger l'étiquette.`
      );
      return 1;
    }
    if (
      t.cacheParLAncienne &&
      fautesDeLigneAveugleALaSyntaxe(long, t.fichier, i, MOTIF_NU).length === 0
    ) {
      console.error(
        `❌ ${oj} : la neutralisation d'avant manquait AUSSI la version rallongée. Le verdict ne ` +
          `dépendait donc pas de la longueur ici, et c'est la démonstration entière qui tombe.`
      );
      return 1;
    }

    // Le même texte EN PROSE : la règle d'origine doit y survivre intacte.
    const enProse = fautesDeLigne(court, 'docs/exemple.md', i, MOTIF_NU).length > 0;
    if (t.citeEnProse && enProse) {
      console.error(`❌ ${oj} : annoncé citant en prose, or il y rougit. « Citer n'est pas se servir » a été perdu.`);
      return 1;
    }
    if (!t.citeEnProse && !enProse) {
      console.error(`❌ ${oj} : annoncé non citant en prose, or il y est vert. Corriger l'étiquette.`);
      return 1;
    }
  }

  const caches = TEMOINS_DELIMITEURS.filter((t) => t.cacheParLAncienne);
  if (new Set(caches.map((t) => t.famille)).size < 2) {
    console.error(
      `❌ Le contournement n'est exercé que sur une famille de délimiteur : la preuve ne dit pas ` +
        `qu'il portait sur la syntaxe, seulement sur un caractère.`
    );
    return 1;
  }

  // Le discriminant qui a remplacé le plafond, éprouvé contre le cas qui l'a motivé.
  for (const [i, t] of TEMOINS_APOSTROPHE.entries()) {
    if (fautesDeLigne(t, 'docs/temoin-apostrophe.md', i, MOTIF_NU).length === 0) {
      console.error(
        `❌ Apostrophe : « ${t} » n'a PAS fait rougir la garde. La fausse paire d'apostrophes avale ` +
          `encore l'étiquette qu'elle sépare.`
      );
      return 1;
    }
    if (fautesDeLigneAveugleALaSyntaxe(t, 'docs/temoin-apostrophe.md', i, MOTIF_NU).length > 0) {
      console.error(
        `❌ Apostrophe : « ${t} » était DÉJÀ vu par la neutralisation d'avant. Il n'exerce donc pas ` +
          `le défaut que la frontière de mot corrige, et le discriminant reste sans témoin.`
      );
      return 1;
    }
  }

  for (const [i, c] of CONTRE_TEMOINS_SYNTAXE.entries()) {
    const f = fautesDeLigne(c.ligne, c.fichier, i, MOTIF_NU);
    if (f.length > 0) {
      console.error(
        `❌ Faux positif de syntaxe (${c.pourquoi}) : « ${c.ligne} » a rougi.\n   ${f[0]!.message}`
      );
      return 1;
    }
  }

  for (const [i, e] of EXEMPTIONS_NOMMEES.entries()) {
    if (!existsSync(e.fichier)) {
      console.error(`❌ Exemption « ${e.nom} » : ${e.fichier} est introuvable.`);
      return 1;
    }
    const lignes = readFileSync(e.fichier, 'utf8').split('\n');
    const reelles = lignes.filter((l) => e.reperage.test(l));
    if (reelles.length === 0) {
      console.error(
        `❌ Exemption « ${e.nom} » : plus aucune ligne repérée dans ${e.fichier}. Une exemption ` +
          `dont la ligne a disparu n'exempte plus rien, elle ne fait qu'aveugler.`
      );
      return 1;
    }
    const rouge = reelles.find(
      (l) => fautesDeLigne(l, e.fichier, i, MOTIF_NU).length > 0
    );
    if (rouge !== undefined) {
      console.error(
        `❌ Exemption « ${e.nom} » : une ligne réelle rougit malgré elle.\n   ` +
          `${fautesDeLigne(rouge, e.fichier, i, MOTIF_NU)[0]!.message}`
      );
      return 1;
    }
    // Le repérage peut couvrir plusieurs lignes de la même forme ; il suffit — et il FAUT — qu'au
    // moins une d'entre elles rougisse sans l'exemption. Sinon l'exemption n'exempte rien, et
    // personne ne saura plus tard qu'on pouvait la retirer.
    const exercee = reelles.some(
      (l) => fautesDeLigneSansExemption(e.nom, l, e.fichier, i, MOTIF_NU).length > 0
    );
    if (!exercee) {
      console.error(
        `❌ Exemption « ${e.nom} » : sans elle, aucune des ${reelles.length} ligne(s) repérée(s) ne ` +
          `rougit. Elle n'exempte donc rien.`
      );
      return 1;
    }
    if (fautesDeLigne(e.contreExemple, e.fichierDuContreExemple, i, MOTIF_NU).length === 0) {
      console.error(
        `❌ Exemption « ${e.nom} » : son contre-exemple est vert. Elle est trop large — un ` +
          `discriminant qu'on n'éprouve pas contre le cas qui doit rougir ne discrimine rien.`
      );
      return 1;
    }
  }

  console.log(
    `✅ ${TEMOINS_DELIMITEURS.length} témoins de délimiteur rougissent, dont ${caches.length} que ` +
      `la neutralisation d'avant GOV-028 CACHAIT sous ${PLAFOND_HISTORIQUE} caractères et voyait ` +
      `au-delà ; ${CONTRE_TEMOINS_SYNTAXE.length} contre-témoins de syntaxe restent verts ; ` +
      `${TEMOINS_APOSTROPHE.length} témoins d'apostrophe que la fausse paire de quotes cachait à ` +
      `l'inverse rougissent ; et ` +
      `${EXEMPTIONS_NOMMEES.length} exemptions nommées sont exercées des deux côtés — preuve faite.`
  );
  console.log(`   ${FAMILLES_DELIMITEURS.map((f) => '• ' + f).join('\n   ')}`);
  console.log(`   ${EXEMPTIONS_NOMMEES.map((e) => '• ' + e.nom).join('\n   ')}`);
  return 0;
}

/** Le mode `--prove` : la garde vue rougir, par famille PUIS par position PUIS par contexte. */
export function prouver(): number {
  const TEMOINS = [
    `// conforme à D3, arbitrage validé`,
    `la decision D11 supprime la valeur`, // hors guillemets : une reference qui ne resout pas
    `> selon A5, le suppléant est A2`, // postes mal ecrits : le schema exige deux chiffres
  ];
  const CONTRE_TEMOINS = [
    `jamais « conforme à D3 » — citer le contre-exemple est permis`,
    `fixtureRouge : citer 'conforme a D3' dans un commentaire`,
    `le poste A02 est troisième relecteur bloquant`,
    `une flotte de A40 agents`,
    `sauvegardes R2 de Cloudflare, préfixe \`partners/\``,
    `l'offre s'adresse au B2B`,
    `art. D.8222-5 du code du travail`,
    `la décision HYP-W6-BIS s'applique`,
    `W13 a tranché la publication`,
    `DEC-INT-001 : instance dédiée`,
  ];

  for (const [i, t] of TEMOINS.entries()) {
    if (fautesDeLigne(t, 'docs/temoin.md', i, MOTIF_NU).length === 0) {
      console.error(`❌ Le témoin « ${t} » n'a PAS fait rougir la garde.`);
      return 1;
    }
  }
  for (const [i, c] of CONTRE_TEMOINS.entries()) {
    const f = fautesDeLigne(c, 'docs/contre-temoin.md', i, MOTIF_NU);
    if (f.length > 0) {
      console.error(`❌ Faux positif : « ${c} » a rougi. La garde est trop large.\n   ${f[0]!.message}`);
      return 1;
    }
  }
  console.log(
    `✅ ${TEMOINS.length} témoins rougissent, ${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
  );

  // ── GOV-025 : la preuve PAR POSITION, et le rejeu contre la version CASSÉE ──────────────────
  const sansTemoin = POSITIONS_LIMITES.filter((p) => !TEMOINS_LIMITES.some((t) => t.position === p));
  if (sansTemoin.length > 0) {
    console.error(`❌ Position(s) limite sans témoin : ${sansTemoin.join(', ')}.`);
    return 1;
  }
  for (const [i, t] of TEMOINS_LIMITES.entries()) {
    if (fautesDeLigne(t.texte, `docs/temoin-${t.position}.md`, i, MOTIF_NU).length === 0) {
      console.error(`❌ Position « ${t.position} » : le témoin « ${t.texte} » n'a PAS fait rougir la garde.`);
      return 1;
    }
    const vuParLAncienne =
      fautesDeLigne(t.texte, `docs/temoin-${t.position}.md`, i, MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE).length > 0;
    if (t.manqueParLAncienne && vuParLAncienne) {
      console.error(
        `❌ Position « ${t.position} » : témoin annoncé aveugle avant GOV-025, mais l'ancienne lookahead ` +
          `le voyait déjà. Il n'exerce donc pas le défaut — c'est exactement le témoin qui verdit sur le ` +
          `texte qu'il condamne.`
      );
      return 1;
    }
    if (!t.manqueParLAncienne && !vuParLAncienne) {
      console.error(
        `❌ Position « ${t.position} » : témoin annoncé vu par l'ancienne lookahead, or elle le MANQUAIT. ` +
          `La cécité corrigée par GOV-025 est plus large que documentée — corriger l'étiquette.`
      );
      return 1;
    }
  }
  const aveugles = TEMOINS_LIMITES.filter((t) => t.manqueParLAncienne);
  if (aveugles.length === 0) {
    console.error(
      `❌ Aucun témoin ne manquait à l'ancienne lookahead : la preuve n'exerce pas le défaut de GOV-025.`
    );
    return 1;
  }

  const sectionZero = lignesDeLaSectionZero();
  if (sectionZero.length === 0) {
    console.error(
      `❌ La §0 de docs/DECISIONS.md est introuvable ou vide : le contre-témoin le plus exigeant a été sauté.`
    );
    return 1;
  }
  const contres = [...CONTRE_TEMOINS_LIMITES, ...sectionZero];
  for (const [i, c] of contres.entries()) {
    const f = fautesDeLigne(c, 'docs/contre-temoin-position.md', i, MOTIF_NU);
    if (f.length > 0) {
      console.error(`❌ Faux positif à une position limite : « ${c} » a rougi.\n   ${f[0]!.message}`);
      return 1;
    }
  }

  console.log(
    `✅ ${TEMOINS_LIMITES.length} témoins de position rougissent, dont ${aveugles.length} que l'ancienne ` +
      `lookahead MANQUAIT ; ${contres.length} contre-témoins de position restent verts (dont les ` +
      `${sectionZero.length} lignes de la §0 du registre) — preuve faite.`
  );
  console.log(`   ${POSITIONS_LIMITES.map((p) => '• ' + p).join('\n   ')}`);

  return prouverSyntaxe();
}

/**
 * ── GOV-028 : LES TROIS COMPTES GLOBAUX, ET LA COMMANDE QUI LES REPRODUIT ────────────────────
 * `pnpm gov:identifiants --compter` (ou `npx tsx scripts/gates/gov-identifiants.ts --compter`).
 *
 * Les trois comptes se lisent sur le MÊME balayage — mêmes fichiers suivis, mêmes exempts, mêmes
 * extensions — et ne diffèrent que par le juge. Ils sont IMPRIMÉS par la garde plutôt que
 * recopiés dans un document : un compteur qu'on ne sait pas reproduire est exactement ce que
 * cette tâche reproche à la garde, et un compteur recopié diverge de sa source (RM-01).
 *
 * Mesure du 2026-09-05 sur `lot/gov-028-citations`, issue de `origin/lot/L-1-INT-a` :
 *   A = 0   la règle d'AVANT GOV-028. Le dépôt était vert — et c'est le fond du problème : il
 *           l'était parce que la quote de syntaxe neutralisait tout ce qu'elle entourait.
 *   B = 2   la règle contextuelle, exemptions nommées RETIRÉES. Les deux occurrences révélées
 *           sont légitimes, et ce sont exactement celles que les exemptions nomment.
 *   C = 0   la règle livrée. Le dépôt est vert, et il l'est désormais pour une raison qu'on peut
 *           nommer ligne par ligne.
 * `B - C` est le nombre d'usages que la garde ne voyait pas ET qu'elle a le droit de ne pas voir ;
 * il DOIT valoir le nombre d'exemptions exercées, sans quoi une exemption ne sert à rien ou une
 * faute réelle se cache derrière.
 */
function compter(): number {
  const fichiers = fichiersSuivis();
  const tous = EXEMPTIONS_NOMMEES.map((e) => e.nom);
  const A = analyserAvec(fichiers, (l, f, i) => fautesDeLigneAveugleALaSyntaxe(l, f, i, MOTIF_NU));
  const B = analyserAvec(fichiers, (l, f, i) => fautesDeLigneSansExemptions(tous, l, f, i, MOTIF_NU));
  const C = analyserAvec(fichiers, (l, f, i) => fautesDeLigne(l, f, i, MOTIF_NU));

  console.log(`gov:identifiants --compter — ${fichiers.length} fichiers suivis balayés.`);
  console.log(`   A = ${A.length}  règle d'AVANT GOV-028 (trois familles partout, plafond de ${PLAFOND_HISTORIQUE})`);
  console.log(`   B = ${B.length}  règle contextuelle, exemptions nommées RETIRÉES`);
  console.log(`   C = ${C.length}  règle LIVRÉE`);
  for (const f of B) console.log(`   B> ${f.message.split(' Cite la forme')[0]}`);
  if (B.length - C.length !== EXEMPTIONS_NOMMEES.length) {
    console.error(
      `❌ B - C vaut ${B.length - C.length} pour ${EXEMPTIONS_NOMMEES.length} exemption(s) nommée(s). ` +
        `Soit une exemption ne sert plus à rien, soit elle en couvre une autre qui n'a pas été nommée.`
    );
    return 1;
  }
  return C.length === 0 ? 0 : 1;
}

function controler(): number {
  const fautes = analyser(fichiersSuivis());
  if (fautes.length === 0) {
    console.log('✅ gov:identifiants — aucun identifiant nu dans les fichiers suivis.');
    return 0;
  }
  console.error(`❌ gov:identifiants — ${fautes.length} identifiant(s) nu(s) (REQ-GOV-003) :\n`);
  fautes.slice(0, 25).forEach((f) => console.error('   ' + f.message));
  if (fautes.length > 25) console.error(`   … et ${fautes.length - 25} autre(s).`);
  return 1;
}

// ── ligne de commande ────────────────────────────────────────────────────────────────────────
// Gardée : ce module est IMPORTÉ par son test. Sans ce test d'entrée, l'import déclencherait le
// contrôle et son `process.exit`, et la suite mourrait au chargement (même patron que gov-depot.ts).
const APPELE_DIRECTEMENT = /gov-identifiants\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const mode = process.argv.includes('--prove')
    ? prouver
    : process.argv.includes('--compter')
      ? compter
      : controler;
  process.exit(mode());
}
