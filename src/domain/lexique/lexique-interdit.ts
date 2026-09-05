/**
 * `LEXIQUE_INTERDIT` — la source unique des mots que le réseau d'apporteurs ne prononce pas
 * (REQ-GOV-017, durcie par REQ-JUR-037 ; RM-01).
 *
 * C'EST LE SEUL ENDROIT DU DÉPÔT OÙ CETTE LISTE EST ÉCRITE. `docs/gates.json`
 * (`GATE-JUR-TEXTES-APPORTEURS`) l'impose mot pour mot : « liste noire IMPORTÉE de la SSOT
 * lexique-interdit.ts (REQ-JUR-037), jamais recopiée dans la gate ni dans GATES.md ; les
 * exclusions déclarées par la SSOT sont importées avec elle ». La gate
 * `scripts/gates/lexique-apporteurs.ts` importe ce fichier ; elle ne retape aucun terme, et
 * `docs/GATES.md` n'en rend que le décompte.
 *
 * POURQUOI CE FICHIER EXISTE. Un logiciel de pilotage d'apporteurs FABRIQUE les faits qu'un
 * faisceau d'indices retient : les mots qu'il affiche EN SONT, et le juge apprécie des faits. Un
 * écran qui dit « objectif du mois », un e-mail qui dit « vous devez », un document qui s'intitule
 * « bulletin de commission » pèsent, dans un faisceau d'indices, davantage qu'une clause de
 * contrat qui dit l'inverse. Le vocabulaire n'est donc pas une affaire de style : c'est une pièce
 * du dossier.
 *
 * POURQUOI UN LITTÉRAL ICI, ET NULLE PART AILLEURS. `docs/CONVENTIONS.md` §3 impose que
 * `src/domain/**` soit pur : aucune I/O, donc aucune lecture de `docs/requirements.json` à
 * l'exécution. La liste est écrite une fois, et la garde `pnpm gov:lexique` — exercée par
 * `tests/unit/gouvernance/lexique.spec.ts` — est ce qui la tient. Même patron que
 * `src/domain/attribution/etats.ts` pour `ETATS_OCCUPANTS` : une constante `as const`, un type
 * dérivé, et un commentaire qui dit pourquoi elle est là et nulle part ailleurs.
 *
 * DEUX PORTÉES, PARCE QUE DEUX EXIGENCES.
 *   — `depot` : les termes de REQ-GOV-017, refusés dans TOUT le périmètre qu'elle nomme —
 *     `prisma/**`, `messages/**`, `src/**\/*.tsx`, les gabarits d'e-mail et les ADR de Partners.
 *     Ce sont les quatre mots qui trahissent une intention de pilotage jusque dans un document
 *     interne : commercial, objectif, quota, classement.
 *   — `apporteur` : le vocabulaire bien plus large de REQ-JUR-037, refusé dans « tout ce qui est
 *     vu ou reçu par un apporteur » — l'espace, les e-mails qui lui sont adressés, la micro-copy,
 *     les ressources diffusées. « niveau », « top », « relance », « brut » ou « prime » sont des
 *     mots courants : les refuser jusque dans un ADR interne noierait la garde sous des faux
 *     positifs, et une garde qui crie sans cesse finit désarmée. Les refuser dans ce qu'un
 *     apporteur LIT est exactement ce que l'exigence demande, ni plus ni moins.
 *
 * CE QUI N'EST PAS ICI, ET QUI VIENDRA. REQ-JUR-041 bannit l'expression « kit de vente » de tout
 * support, et REQ-CPL-023 porte le lexique du financement : ni l'une ni l'autre n'est citée par
 * `GOV-013`, et une garde ne s'élargit pas en passant. Elles s'ajouteront à cette constante par
 * leurs tâches (`JUR-T29`, `UX-P3-02`) sans que la gate change d'une ligne — c'est précisément ce
 * que l'import garantit.
 */

/**
 * Où un terme est refusé.
 *
 * `apporteur` est le sur-ensemble : un fichier lu par un apporteur se voit appliquer les DEUX
 * portées. Un fichier interne ne se voit appliquer que `depot`.
 */
export type PorteeLexicale = 'depot' | 'apporteur';

export type FamilleInterdite = {
  /** Nom de la famille — c'est lui que la gate rend dans `[famille]` et que `--prove` couvre. */
  readonly nom: string;
  readonly portee: PorteeLexicale;
  /** Les exigences qui écrivent ces mots-là. Aucune famille sans exigence. */
  readonly reqs: readonly string[];
  /** Ce que la famille protège — repris tel quel dans le message d'erreur. */
  readonly pourquoi: string;
  /**
   * Les formes FLÉCHIES, écrites en toutes lettres.
   *
   * Pas de racine tronquée ni de `*` : « commercia » attraperait « commercialisation » et
   * manquerait « force de vente ». Une forme absorbée par une autre n'est pas répétée —
   * « nos commerciaux » n'est pas listée, « commerciaux » la couvre —, sans quoi une même faute
   * serait comptée deux fois et le décompte de la gate mentirait.
   */
  readonly formes: readonly string[];
  /** Le terme canonique à écrire à la place, quand l'exigence en nomme un. */
  readonly aDireALaPlace: string | null;
};

export const LEXIQUE_INTERDIT = [
  {
    nom: 'commercial',
    portee: 'depot',
    reqs: ['REQ-GOV-017', 'REQ-JUR-037'],
    pourquoi:
      "nommer « commercial » celui qui n'est pas salarié désigne une fonction de l'entreprise, " +
      'et le mot survit à toutes les clauses qui disent le contraire',
    formes: ['commercial', 'commerciale', 'commerciaux', 'commerciales', 'force de vente', 'forces de vente'],
    aDireALaPlace: "apporteur d'affaires",
  },
  {
    nom: 'objectif',
    portee: 'depot',
    reqs: ['REQ-GOV-017', 'REQ-JUR-037'],
    pourquoi:
      "un objectif assigné est une obligation de produire — le premier des trois pouvoirs qu'on " +
      'ne réunit jamais en une phrase',
    formes: ['objectif', 'objectifs'],
    aDireALaPlace: null,
  },
  {
    nom: 'quota',
    portee: 'depot',
    reqs: ['REQ-GOV-017', 'REQ-JUR-037'],
    pourquoi: "un quota est un objectif chiffré, et la mesure de son atteinte est le deuxième pouvoir",
    formes: ['quota', 'quotas'],
    aDireALaPlace: null,
  },
  {
    nom: 'classement',
    portee: 'depot',
    reqs: ['REQ-GOV-017', 'REQ-JUR-037'],
    pourquoi: "classer les apporteurs entre eux les met en concurrence sous l'autorité de celui qui classe",
    formes: ['classement', 'classements'],
    aDireALaPlace: null,
  },
  {
    nom: 'palmares',
    portee: 'apporteur',
    reqs: ['REQ-JUR-037'],
    pourquoi: "un rang, un niveau ou un « top » est un classement qui ne dit pas son nom",
    formes: ['top', 'meilleur', 'meilleure', 'meilleurs', 'meilleures', 'rang', 'rangs', 'niveau', 'niveaux'],
    aDireALaPlace: null,
  },
  {
    nom: 'mesure_de_performance',
    portee: 'apporteur',
    reqs: ['REQ-JUR-037'],
    pourquoi: "restituer une performance à celui qu'on mesure est la mesure de la production (REQ-JUR-039)",
    formes: [
      'performance',
      'performances',
      'résultat',
      'résultats',
      'productivité',
      'taux de transformation',
      'cible',
      'cibles',
    ],
    aDireALaPlace: null,
  },
  {
    nom: 'injonction',
    portee: 'apporteur',
    reqs: ['REQ-JUR-037', 'REQ-JUR-039'],
    pourquoi:
      "l'impératif de méthode est une directive : rien de ce que l'outil envoie ne doit se lire " +
      "comme une instruction, et l'apporteur n'est tenu à aucune fréquence de connexion",
    formes: [
      'vous devez',
      'il faut',
      'obligatoire',
      'obligatoires',
      'pensez à',
      'cela fait longtemps',
      'relance',
      'relances',
    ],
    aDireALaPlace: null,
  },
  {
    nom: 'subordination',
    portee: 'apporteur',
    reqs: ['REQ-JUR-037'],
    pourquoi: 'manager, sanction et avertissement sont le troisième pouvoir — celui de sanctionner',
    formes: [
      'votre manager',
      'votre responsable',
      'strike',
      'strikes',
      'sanction',
      'sanctions',
      'avertissement',
      'avertissements',
    ],
    aDireALaPlace: null,
  },
  {
    nom: 'droit_social',
    portee: 'apporteur',
    reqs: ['REQ-JUR-037'],
    pourquoi:
      "un document qui emprunte le titre, les rubriques ou le vocabulaire d'un bulletin de paie " +
      "fabrique la pièce qu'un faisceau d'indices retiendrait (extension du 2026-09-03)",
    formes: [
      'bulletin',
      'bulletins',
      'fiche de paie',
      'fiches de paie',
      'net à payer',
      'brut',
      'salaire',
      'salaires',
      'rémunération mensuelle',
      'charges salariales',
      'cotisations retenues',
      "attestation d'emploi",
      'certificat de travail',
      'solde de tout compte',
      'congés',
      'ancienneté',
      'prime',
      'primes',
    ],
    aDireALaPlace: 'relevé de commissions',
  },
] as const satisfies readonly FamilleInterdite[];

/** Le nom d'une famille du lexique — dérivé de la constante, jamais retapé. */
export type NomDeFamille = (typeof LEXIQUE_INTERDIT)[number]['nom'];

/**
 * Les trois noms que REQ-JUR-037 impose EN PROPRE, et qui sont la contrepartie de la liste
 * noire : interdire un mot sans en donner un autre laisse chacun improviser, et c'est ainsi que
 * « bulletin de commission » est né.
 */
export const TERMES_CANONIQUES = {
  documentMensuel: 'relevé de commissions',
  documentLegal: 'autofacture',
  documentAnnuel: 'récapitulatif annuel des commissions versées',
} as const;

/**
 * LES TOURNURES D'EXEMPTION — le cœur de la règle, et la raison pour laquelle cette garde ne se
 * réduit pas à un `grep`.
 *
 * Ce dépôt existe pour que les trois pouvoirs que la charte relationnelle interdit de réunir ne
 * se rencontrent jamais dans une phrase, et la phrase qui l'en tient s'écrit AVEC les mots
 * interdits, sous forme de négation : « elle n'institue aucun
 * mandat, aucun objectif, aucun quota, aucun compte rendu d'activité » (ADR « valeurs du monde
 * réel », lot voisin). Une
 * garde qui rougirait là-dessus forcerait à retirer la phrase qui protège : elle produirait
 * exactement le risque qu'elle prétend écarter. Une garde qui pousse à supprimer sa propre raison
 * d'être est une garde ratée.
 *
 * On vise donc la TOURNURE, pas le mot. Est refusé l'usage PRESCRIPTIF ou ÉVALUATIF (« objectif
 * du mois », « votre quota », « classement des apporteurs ») ; est laissé passer l'usage
 * DÉNÉGATIF ou DÉFINITIONNEL — un marqueur de négation ou de prohibition dans le voisinage
 * immédiat, en amont du terme et dans le même segment de phrase.
 *
 * Ces marqueurs sont ici, et non dans la gate, parce qu'ils font partie de la règle : c'est la
 * SSOT qui dit ce qui est interdit ET ce qui ne l'est pas. `docs/gates.json` l'exige d'ailleurs
 * en toutes lettres — « les exclusions déclarées par la SSOT sont importées avec elle ».
 */
export const MARQUEURS_DE_DENEGATION = [
  'aucun',
  'aucune',
  'aucuns',
  'aucunes',
  'aucunement',
  'ni',
  'sans',
  'nul',
  'nulle',
  'jamais',
  'ne',
  "n'",
  'non',
  'pas',
  'zéro',
  'exempt',
  'exempte',
  'interdit',
  'interdite',
  'interdits',
  'interdites',
  'refuse',
  'refusent',
  'refusé',
  'refusée',
  'refusés',
  'banni',
  'bannie',
  'bannis',
  'proscrit',
  'proscrite',
  'proscrits',
  'exclut',
  'exclu',
  'exclue',
  'exclus',
] as const;

/**
 * La largeur, en caractères, de la fenêtre où l'on cherche le marqueur de dénégation, en amont du
 * terme et dans le MÊME segment de phrase.
 *
 * Pourquoi une fenêtre, et pourquoi celle-ci. Sans borne, un « ne » situé trois propositions plus
 * haut exempterait « l'objectif du mois est de cinq dossiers » : la garde deviendrait muette sur
 * les phrases longues, qui sont justement celles où une consigne se glisse. Quarante-huit
 * caractères couvrent les tournures réelles — « aucun objectif », « ni quota ni classement »,
 * « ne fixe aucun objectif », « ce n'est pas un objectif » — sans porter au-delà de la
 * proposition en cours.
 */
export const FENETRE_DENEGATION = 48;

/**
 * Les fichiers qui ont le DROIT de porter les termes en clair : la source, la gate qui l'applique
 * et le test qui l'exerce. Exempter la source sans la gate reviendrait à interdire la solution ;
 * exempter la gate sans le test rendrait impossible d'écrire le témoin qui prouve qu'elle rougit.
 */
export const PORTEURS_DU_LEXIQUE = [
  'src/domain/lexique/lexique-interdit.ts',
  'scripts/gates/lexique-apporteurs.ts',
  'tests/unit/gouvernance/lexique.spec.ts',
] as const;

/**
 * Une exception JUSTIFIÉE LIGNE À LIGNE — les mots sont ceux de REQ-GOV-017. Une exception sans
 * justification n'est pas une exception, c'est un trou : la gate la refuse (famille
 * `exception_sans_justification`).
 */
export type ExceptionLexicale = {
  /** Le chemin exact, tel que `git ls-files` le rend. Jamais un dossier entier. */
  readonly chemin: string;
  /** La forme exemptée, telle qu'elle figure dans `formes`. Jamais « toutes ». */
  readonly forme: string;
  /** Pourquoi ce terme est légitime ICI. Une phrase, pas un mot. */
  readonly justification: string;
  /** L'exigence ou la décision qui autorise l'exception, sous sa forme qualifiée (RM-12). */
  readonly reference: string;
  /** Quand elle a été posée — une exception qui n'est pas datée ne se réexamine jamais. */
  readonly poseeLe: string;
};

/**
 * Aucune exception à ce jour, et c'est un résultat, pas un oubli : au 2026-09-05, le périmètre de
 * REQ-GOV-017 — dix ADR et `prisma/schema.prisma` — ne porte aucune occurrence des quatre
 * familles de portée `depot`. La première exception qu'on posera devra donc s'expliquer devant
 * une garde qui était verte sans elle.
 */
export const EXCEPTIONS_DECLAREES: readonly ExceptionLexicale[] = [];

/** Les familles applicables selon la portée d'un fichier : `apporteur` est le sur-ensemble. */
export function famillesPourPortee(portee: PorteeLexicale): readonly FamilleInterdite[] {
  return portee === 'apporteur' ? LEXIQUE_INTERDIT : LEXIQUE_INTERDIT.filter((f) => f.portee === 'depot');
}

/** Toutes les formes de toutes les familles — utile aux décomptes, jamais au contrôle. */
export function toutesLesFormes(): readonly string[] {
  return LEXIQUE_INTERDIT.flatMap((f) => f.formes);
}
