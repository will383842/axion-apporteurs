/**
 * ux-exhaustivite.ts — la micro-copie de l'espace est complète, et elle est la seule (UX-P0-01 ;
 * REQ-UX-002, REQ-UX-019). Registre : `GATE-UX-EXHAUSTIVITE`.
 *
 * USAGE : pnpm ux:exhaustivite          (juge le dépôt réel ; sort 1 sur faute, en la NOMMANT)
 *         pnpm ux:exhaustivite:prove    (un témoin par famille et ses contre-témoins, sur une vue
 *                                        INJECTÉE — la preuve ne lit pas le dépôt, RM-11)
 *
 * CE QU'ELLE TIENT.
 *   — REQ-UX-002 : chaque valeur de `IssueDepot` (`src/domain/depot/issue-depot.ts`) a un titre, un
 *     « pourquoi », un « quoi faire », une pastille, une action et une mention d'horodatage. L'enum
 *     est relu CONTRE le texte de REQ-UX-002 au registre, dans les deux sens : une valeur que le
 *     registre ne nomme pas est « sans base contractuelle », une catégorie du registre sans valeur
 *     est une issue ajoutée au contrat sans son texte. Les refus sont exactement les valeurs
 *     communes à `IssueDepot` et à `MotifRefusDepot` (REQ-SEC-022, relue elle aussi) ; aucun refus
 *     ne porte de paramètre — il ne dit ni qui ni quand.
 *   — REQ-UX-019 : chaque écran de l'espace — chaque route de `docs/ESPACE-ROUTES.md`, la carte
 *     unique — et chaque écran de la console — chaque ligne de la section Console de
 *     `docs/maquettes/VALIDATION.md` — a un état vide déclaré (titre, phrase, action principale) ;
 *     celui de « Mes entreprises » mène à la route du dépôt ; toute action mène à une route que la
 *     carte connaît.
 *   — La SOURCE UNIQUE : aucun libellé en dur dans un composant `.tsx`, lu par l'arbre syntaxique
 *     de TypeScript et non par une expression régulière.
 *   — NI QUI NI QUAND, dans TOUS les textes de l'espace (REQ-UX-002, REQ-SEC-022). La garde parcourt
 *     chaque fichier de `src/content/micro-copy/espace/` — tout champ chaîne, à toute profondeur,
 *     libellés d'action compris — et n'y admet un paramètre `{…}` que s'il figure dans la liste
 *     blanche de son contexte (`PARAMETRES_PERMIS`) : `{nomAutreApporteur}` dans la collision au
 *     dépôt rougit. Un fichier de l'espace que la garde ne parcourt pas rougit aussi. Aucun chiffre
 *     écrit en clair (hors renvoi à un article du contrat) : un délai ou un seuil est un paramètre
 *     (RM-10). Et aucun composant n'injecte de HTML brut : un paramètre qui reflète une saisie
 *     (`{recherche}`) est rendu en nœud texte, que React échappe.
 *
 * CE QU'ELLE NE TIENT PAS — LA LIMITE EXACTE, ÉCRITE. C'est un fil de déclenchement, pas une
 * preuve. La famille `libelle_en_dur` voit le texte entre deux balises, un littéral chaîne placé
 * entre accolades comme enfant d'un élément, et un littéral chaîne donné à un attribut de texte
 * (`aria-label`, `title`, `placeholder`, `alt`, `label`…) ou, pour tout autre attribut non
 * technique, un littéral qui a l'air d'une phrase (une espace, une lettre accentuée ou une
 * majuscule initiale). Elle ne voit PAS une chaîne construite hors du JSX puis passée en
 * propriété (`const t = 'Bonjour'; <X libelle={t} />`), ni un texte produit par une fonction. La
 * défense structurelle est ailleurs : les écrans obtiennent leurs textes par des objets typés
 * (`issueRendue`, `ETATS_VIDES_ESPACE`) dont l'exhaustivité est vérifiée par `tsc` — un
 * `Record<IssueDepot, …>` incomplet ne compile pas. Le lexique (REQ-UX-003) n'est pas jugé ici :
 * c'est `gov:lexique`, qui balaie `src/content/micro-copy/` à la portée voulue.
 *
 * La console n'a pas encore de carte de routes : ses écrans sont lus dans `VALIDATION.md`, et une
 * action de console qui mènerait à une route rougit, faute de carte pour la confronter. Quand la
 * matrice écran × rôle de SEC-17 (REQ-SEC-023) sera livrée, c'est d'elle que les écrans de la
 * console devront se dériver.
 */

import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import {
  ISSUES_DEPOT,
  ISSUES_DE_REFUS,
  HORODATAGE_DE_L_ISSUE,
} from '../../src/domain/depot/issue-depot';
import * as ISSUES_DE_L_ESPACE from '../../src/content/micro-copy/espace/issues-depot';
import * as ETATS_VIDES_DE_L_ESPACE from '../../src/content/micro-copy/espace/etats-vides';
import * as VOCABULAIRE_DE_L_ESPACE from '../../src/content/micro-copy/espace/vocabulaire';
import { ETATS_VIDES_CONSOLE } from '../../src/content/micro-copy/console/etats-vides';
import type { ActionEcran, EtatVide, TexteIssue } from '../../src/content/micro-copy/types';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

const { TEXTES_DES_ISSUES, MENTIONS_HORODATAGE, MENTION_DU_REFUS, CONTESTATION_ECRITE } =
  ISSUES_DE_L_ESPACE;
const { ETATS_VIDES_ESPACE } = ETATS_VIDES_DE_L_ESPACE;

// ── les sources ─────────────────────────────────────────────────────────────────

const CHEMIN_REGISTRE = 'docs/requirements.json';
const CHEMIN_CARTE = 'docs/ESPACE-ROUTES.md';
const CHEMIN_VALIDATION = 'docs/maquettes/VALIDATION.md';
const RACINE_MICRO_COPIE = 'src/content/micro-copy/';
const RACINE_ESPACE = `${RACINE_MICRO_COPIE}espace/`;

/**
 * Les modules de l'espace, parcourus EN ENTIER (chaque export, chaque champ chaîne). La clé est le
 * chemin sous `src/content/micro-copy/` ; un fichier suivi sous `espace/` absent d'ici rougit
 * (`micro_copie_non_lue`) : la population n'est pas une liste de champs tapée, et elle ne peut pas
 * perdre un fichier en silence.
 */
const MICRO_COPIE_DE_L_ESPACE: Readonly<Record<string, unknown>> = {
  'espace/issues-depot.ts': ISSUES_DE_L_ESPACE,
  'espace/etats-vides.ts': ETATS_VIDES_DE_L_ESPACE,
  'espace/vocabulaire.ts': VOCABULAIRE_DE_L_ESPACE,
};

/**
 * La LISTE BLANCHE des paramètres, par contexte : un texte de l'espace ne porte un `{…}` que si son
 * chemin (ou un chemin qui le contient) le permet ici. Tout autre paramètre rougit — c'est ainsi
 * qu'un nom, une date de dépôt ou un stade d'un AUTRE apporteur n'atteint pas un écran (REQ-SEC-022).
 * Chaque entrée dit POURQUOI la valeur appartient à celui qui la lit. Un refus n'y figure jamais :
 * il ne dit ni qui ni quand (REQ-UX-002).
 */
export const PARAMETRES_PERMIS: Readonly<Record<string, readonly string[]>> = {
  // La date de SON dépôt.
  'espace/issues-depot.ts › MENTIONS_HORODATAGE › a_votre_nom': ['dateEnregistrement'],
  // Le contact qu'il a lui-même donné, et l'échéance de l'appel de SON dépôt.
  'espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree': ['contact', 'dateAppel'],
  'espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire': ['dateAppel'],
  // La collision au dépôt : seule la date de fin est autorisée (REQ-SEC-022).
  'espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente': ['dateFin'],
  // SA propre suspension.
  'espace/issues-depot.ts › TEXTES_DES_ISSUES › gele': ['dateSuspension'],
  // SON brouillon : le contact qu'il a saisi, et la date où son téléphone l'effacera.
  'espace/issues-depot.ts › TEXTES_DES_ISSUES › brouillon_hors_ligne': [
    'contact',
    'dateEffacement',
  ],
  // Le reflet de SA saisie — rendu en nœud texte seulement (famille `html_brut`).
  'espace/etats-vides.ts › ETATS_VIDES_ESPACE › /entreprise?q=': ['recherche'],
  // Un délai, venu de sa source unique (RM-10).
  'espace/etats-vides.ts › ETATS_VIDES_ESPACE › /aide': ['delaiDeReponse'],
  'espace/vocabulaire.ts › FORMULES › droitACommissionJusquau': ['dateFin'],
  'espace/vocabulaire.ts › FORMULES › courrierDeSuspension': ['dateCourrier'],
  'espace/vocabulaire.ts › FORMULES › limiteDeVerification': ['limiteParJour'],
};

/**
 * L'écran « Mes entreprises » et la route du dépôt, tels que la carte les écrit. Ce sont les deux
 * seuls littéraux de route de la garde, et ils sont CONFRONTÉS à la carte : si l'un disparaît, la
 * famille `premier_depot_non_guide` rougit au lieu de se taire.
 */
export const ECRAN_MES_ENTREPRISES = '/mes-entreprises';
export const ROUTE_DU_DEPOT = '/deposer';

/** Les valeurs d'enum entre accents graves d'un segment de texte. */
function valeursEntreAccents(segment: string): string[] {
  return [...segment.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!);
}

/**
 * Les issues que REQ-UX-002 énumère : de la parenthèse qui cite `MotifRefusDepot` à « Les valeurs »
 * qui ouvrent la phrase des renommages. Une lecture qui ne trouve pas ses bornes rend `[]`, et la
 * garde en fait une faute (`source_illisible`) au lieu d'y voir « rien à comparer ».
 */
export function issuesDuContrat(texte: string): string[] {
  const debut = texte.indexOf(') : `');
  const fin = texte.indexOf('Les valeurs', debut);
  if (debut < 0 || fin < 0) return [];
  return valeursEntreAccents(texte.slice(debut, fin));
}

/** Les catégories de `MotifRefusDepot` que REQ-SEC-022 énumère après « Valeurs : ». */
export function motifsDeRefus(texte: string): string[] {
  const debut = texte.indexOf('Valeurs :');
  const fin = texte.indexOf('**Le refus', debut);
  if (debut < 0 || fin < 0) return [];
  return valeursEntreAccents(texte.slice(debut, fin));
}

/** Les cellules d'une ligne de tableau Markdown, sans les barres de bord. */
function cellules(ligne: string): string[] {
  return ligne
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
}

/**
 * Les routes de l'espace : dans chaque ligne de tableau de la carte, la PREMIÈRE cellule qui n'est
 * qu'une route entre accents graves. (La barre de navigation met la route en deuxième colonne, les
 * autres tableaux en première : on lit la cellule, pas la position.)
 */
export function ecransDeLEspace(carte: string): string[] {
  const routes: string[] = [];
  for (const ligne of carte.split('\n')) {
    if (!ligne.trimStart().startsWith('|')) continue;
    const route = cellules(ligne)
      .map((c) => /^`(\/[^`]*)`$/.exec(c))
      .find((m) => m !== null);
    if (route) routes.push(route[1]!);
  }
  return [...new Set(routes)];
}

/** Les écrans de la console : les maquettes nommées par la section « Console » de VALIDATION.md. */
export function ecransDeLaConsole(validation: string): string[] {
  const lignes = validation.split('\n');
  const debut = lignes.findIndex((l) => /^##\s+Console\s*$/.test(l));
  if (debut < 0) return [];
  const ecrans: string[] = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (/^##\s/.test(ligne)) break;
    if (!ligne.trimStart().startsWith('|')) continue;
    const m = cellules(ligne)
      .map((c) => /^`([a-z0-9-]+)\.html`$/.exec(c))
      .find((x) => x !== null);
    if (m) ecrans.push(m[1]!);
  }
  return ecrans;
}

// ── le libellé en dur, lu par l'arbre syntaxique ────────────────────────────────

/** Les attributs dont la valeur EST un texte lu ou entendu par quelqu'un. */
const ATTRIBUTS_DE_TEXTE = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'placeholder',
  'alt',
  'label',
]);

/** Les attributs techniques : leur valeur n'est jamais lue par un humain. */
const ATTRIBUTS_TECHNIQUES = new Set([
  'className',
  'class',
  'id',
  'key',
  'href',
  'src',
  'srcSet',
  'sizes',
  'media',
  'type',
  'name',
  'role',
  'rel',
  'target',
  'method',
  'action',
  'lang',
  'dir',
  'htmlFor',
  'form',
  'pattern',
  'autoComplete',
  'inputMode',
  'enterKeyHint',
  'loading',
  'decoding',
  'crossOrigin',
  'referrerPolicy',
  'fetchPriority',
  'as',
  'variant',
  'size',
  'prefetch',
]);

const PORTE_UNE_LETTRE = /\p{L}/u;
/** Une valeur qui a l'air d'une phrase : une espace, une lettre accentuée, une majuscule initiale. */
const A_L_AIR_D_UNE_PHRASE = /\s|[À-ÿŒœ]|^\p{Lu}/u;

export type LibelleEnDur = { ligne: number; message: string };

/** La valeur d'une expression si c'est un littéral chaîne (ou un gabarit), `null` sinon. */
function litteral(e: ts.Expression | undefined): string | null {
  if (!e) return null;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isTemplateExpression(e)) {
    return e.head.text + e.templateSpans.map((s) => s.literal.text).join('');
  }
  return null;
}

/** Les libellés écrits en dur dans un composant `.tsx` — chacun avec sa ligne et son chemin. */
export function libellesEnDur(chemin: string, contenu: string): LibelleEnDur[] {
  const source = ts.createSourceFile(
    chemin,
    contenu,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const trouves: LibelleEnDur[] = [];
  const noter = (position: number, quoi: string): void => {
    const ligne = source.getLineAndCharacterOfPosition(position).line + 1;
    trouves.push({
      ligne,
      message:
        `${chemin}:${ligne} — ${quoi} est écrit en dur dans le composant. Un libellé vit sous ` +
        `${RACINE_MICRO_COPIE} (ou dans messages/fr.json) et le composant le LIT : deux copies ` +
        `d'un même texte divergent toujours, et celle qu'on corrige n'est jamais celle qu'on lit.`,
    });
  };

  const visiter = (n: ts.Node): void => {
    if (ts.isJsxText(n)) {
      if (PORTE_UNE_LETTRE.test(n.text)) {
        const decalage = n.text.length - n.text.trimStart().length;
        noter(n.getStart(source) + decalage, `le texte « ${n.text.trim()} »`);
      }
    } else if (ts.isJsxAttribute(n)) {
      const nom = n.name.getText(source);
      const init = n.initializer;
      const valeur =
        init === undefined
          ? null
          : ts.isStringLiteral(init)
            ? init.text
            : ts.isJsxExpression(init)
              ? litteral(init.expression)
              : null;
      const texte =
        valeur !== null &&
        PORTE_UNE_LETTRE.test(valeur) &&
        (ATTRIBUTS_DE_TEXTE.has(nom) ||
          (!ATTRIBUTS_TECHNIQUES.has(nom) &&
            !nom.startsWith('data-') &&
            A_L_AIR_D_UNE_PHRASE.test(valeur)));
      if (texte) noter(n.getStart(source), `l'attribut ${nom}="${valeur}"`);
    } else if (ts.isJsxExpression(n) && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      const valeur = litteral(n.expression);
      if (valeur !== null && PORTE_UNE_LETTRE.test(valeur)) {
        noter(n.getStart(source), `la chaîne « ${valeur} »`);
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return trouves;
}

/**
 * Les composants qui injectent du HTML brut (`dangerouslySetInnerHTML`) : un paramètre qui reflète
 * une saisie (`{recherche}`) n'est échappé que rendu en nœud texte.
 */
export function htmlBrut(chemin: string, contenu: string): LibelleEnDur[] {
  const source = ts.createSourceFile(
    chemin,
    contenu,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const trouves: LibelleEnDur[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isJsxAttribute(n) && n.name.getText(source) === 'dangerouslySetInnerHTML') {
      const ligne = source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;
      trouves.push({
        ligne,
        message:
          `${chemin}:${ligne} — dangerouslySetInnerHTML injecte du HTML brut. Un texte de la ` +
          `micro-copie, et surtout le reflet d'une saisie ({recherche}), est rendu en nœud texte, ` +
          `que React échappe : injecté en HTML, il devient une porte ouverte.`,
      });
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return trouves;
}

// ── la vue et le contrôle ───────────────────────────────────────────────────────

export type FichierVu = { chemin: string; contenu: string };

export type Vue = {
  issuesDeLEnum: readonly string[];
  issuesDuContrat: readonly string[];
  motifsDeRefus: readonly string[];
  refusDeclares: readonly string[];
  textesDesIssues: Readonly<Record<string, TexteIssue | undefined>>;
  horodatages: Readonly<Record<string, string | undefined>>;
  mentionsHorodatage: Readonly<Record<string, string | undefined>>;
  mentionDuRefus: string;
  contestation: ActionEcran;
  ecransEspace: readonly string[];
  ecransConsole: readonly string[];
  etatsVidesEspace: Readonly<Record<string, EtatVide | undefined>>;
  etatsVidesConsole: Readonly<Record<string, EtatVide | undefined>>;
  composants: readonly FichierVu[];
  fichiersDeMicroCopie: readonly string[];
  /** Les modules de l'espace, parcourus en entier : chemin sous la micro-copie → module. */
  microCopieEspace: Readonly<Record<string, unknown>>;
  parametresPermis: Readonly<Record<string, readonly string[]>>;
};

/** Un texte de l'espace et son chemin : `fichier › export › clé › … › champ`. */
export type TexteLu = { chemin: string; texte: string };

function parcourir(chemin: string, valeur: unknown): TexteLu[] {
  if (typeof valeur === 'string') return [{ chemin, texte: valeur }];
  if (valeur === null || typeof valeur !== 'object') return [];
  return Object.entries(valeur).flatMap(([cle, v]) => parcourir(`${chemin} › ${cle}`, v));
}

/** TOUS les textes de l'espace : tout champ chaîne, à toute profondeur, de chaque module lu. */
export function textesDeLEspace(vue: Vue): TexteLu[] {
  return Object.entries(vue.microCopieEspace).flatMap(([fichier, m]) => parcourir(fichier, m));
}

/** Les paramètres que le contexte d'un texte permet : ceux de chaque entrée qui le contient. */
function permisPour(chemin: string, permis: Vue['parametresPermis']): Set<string> {
  return new Set(
    Object.entries(permis)
      .filter(([cle]) => chemin === cle || chemin.startsWith(`${cle} › `))
      .flatMap(([, noms]) => noms)
  );
}

/** Un renvoi au contrat (« article 3.3 bis ») : le seul chiffre qu'un texte écrit en clair. */
const RENVOI_A_UN_ARTICLE = /\barticles?\s+\d+(?:\.\d+)*/giu;

export type Faute = { famille: string; message: string };
export type Rapport = { fautes: Faute[] };

export const FAMILLES = [
  {
    nom: 'source_illisible',
    explication:
      'le registre, la carte des routes ou la section Console ne se lisent plus : rien à confronter, donc rien de gardé.',
  },
  {
    nom: 'issue_sans_texte',
    explication:
      'une valeur de IssueDepot sans titre, pourquoi, quoi faire, action ou horodatage (REQ-UX-002).',
  },
  {
    nom: 'issue_sans_base_contractuelle',
    explication: 'une valeur de IssueDepot que REQ-UX-002 ne nomme pas.',
  },
  {
    nom: 'issue_du_contrat_sans_valeur',
    explication: 'une catégorie de REQ-UX-002 absente de IssueDepot.',
  },
  {
    nom: 'refus_mal_declare',
    explication: 'les refus ne sont pas exactement IssueDepot ∩ MotifRefusDepot (REQ-SEC-022).',
  },
  {
    nom: 'refus_incomplet',
    explication:
      'un refus qui dit qui ou quand, ou sans la phrase « aucune autre conséquence » ni la contestation.',
  },
  {
    nom: 'ecran_sans_etat_vide',
    explication: "un écran de l'espace ou de la console sans état vide complet (REQ-UX-019).",
  },
  {
    nom: 'etat_vide_orphelin',
    explication: 'un état vide pour un écran que ni la carte ni VALIDATION.md ne connaissent.',
  },
  {
    nom: 'action_vers_route_inconnue',
    explication: 'une action qui mène à une route absente de la carte.',
  },
  {
    nom: 'premier_depot_non_guide',
    explication: "l'état vide de « Mes entreprises » ne mène pas au dépôt (REQ-UX-019).",
  },
  {
    nom: 'libelle_en_dur',
    explication: 'un libellé écrit dans un composant au lieu de la micro-copie.',
  },
  {
    nom: 'parametre_non_permis',
    explication:
      "un paramètre {…} hors de la liste blanche de son contexte, dans n'importe quel texte de l'espace (REQ-SEC-022).",
  },
  {
    nom: 'micro_copie_non_lue',
    explication: "un fichier de micro-copie de l'espace que la garde ne parcourt pas.",
  },
  {
    nom: 'valeur_en_clair',
    explication:
      "un chiffre écrit en clair dans un texte de l'espace (hors renvoi à un article) : un délai ou un seuil est un paramètre (RM-10).",
  },
  {
    nom: 'html_brut',
    explication: 'un composant qui injecte du HTML brut (dangerouslySetInnerHTML).',
  },
] as const;

const rempli = (s: string | undefined | null): boolean => typeof s === 'string' && s.trim() !== '';
const PARAMETRE = /\{[^}]*\}/;

export function controler(vue: Vue): Rapport {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string): void => {
    fautes.push({ famille, message });
  };

  // Les sources d'abord : une source vide ne donne rien à confronter et rendrait « ✅ ».
  const sources: [readonly string[], string][] = [
    [vue.issuesDeLEnum, 'src/domain/depot/issue-depot.ts (ISSUES_DEPOT)'],
    [vue.issuesDuContrat, `${CHEMIN_REGISTRE} (REQ-UX-002, la liste de IssueDepot)`],
    [vue.motifsDeRefus, `${CHEMIN_REGISTRE} (REQ-SEC-022, la liste de MotifRefusDepot)`],
    [vue.ecransEspace, `${CHEMIN_CARTE} (les routes de l'espace)`],
    [vue.ecransConsole, `${CHEMIN_VALIDATION} (la section Console)`],
  ];
  for (const [liste, ou] of sources) {
    if (liste.length === 0) {
      ajouter(
        'source_illisible',
        `${ou} — aucune valeur lue. Une source qu'on ne sait plus lire ne donne rien à confronter : ` +
          `la garde refuse plutôt que de conclure « rien à signaler ».`
      );
    }
  }

  // REQ-UX-002 — chaque issue, et l'alignement sur le contrat dans les deux sens.
  for (const issue of vue.issuesDeLEnum) {
    const t = vue.textesDesIssues[issue];
    const horodatage = vue.horodatages[issue];
    const mention = horodatage === undefined ? undefined : vue.mentionsHorodatage[horodatage];
    const manques = [
      ...(t === undefined ? ['tout son texte'] : []),
      ...(t !== undefined && !rempli(t.pastille) ? ['une pastille'] : []),
      ...(t !== undefined && !rempli(t.titre) ? ['un titre'] : []),
      ...(t !== undefined && !rempli(t.pourquoi) ? ['un « pourquoi »'] : []),
      ...(t !== undefined && !rempli(t.quoiFaire) ? ['un « quoi faire »'] : []),
      ...(t !== undefined && !rempli(t.actionPrincipale.libelle) ? ['une action principale'] : []),
      ...(!rempli(mention) ? ["la mention d'horodatage à son nom"] : []),
    ];
    if (manques.length > 0) {
      ajouter(
        'issue_sans_texte',
        `IssueDepot.${issue} — il lui manque ${manques.join(', ')}. REQ-UX-002 : chaque issue affiche ` +
          `un titre, un « pourquoi » et un « quoi faire », et dit si le dépôt est horodaté à son nom. ` +
          `Le texte s'écrit dans ${RACINE_MICRO_COPIE}espace/issues-depot.ts.`
      );
    }
    if (!vue.issuesDuContrat.includes(issue)) {
      ajouter(
        'issue_sans_base_contractuelle',
        `IssueDepot.${issue} — REQ-UX-002 ne nomme pas cette issue. L'enum est aligné un pour un sur ` +
          `les catégories des articles 3.3 et 3.3 bis : une issue sans base contractuelle refuse un ` +
          `droit pour un motif que le contrat n'écrit pas.`
      );
    }
  }
  for (const issue of vue.issuesDuContrat) {
    if (!vue.issuesDeLEnum.includes(issue)) {
      ajouter(
        'issue_du_contrat_sans_valeur',
        `${issue} — REQ-UX-002 nomme cette issue et IssueDepot ne la porte pas : une issue ajoutée ` +
          `au contrat sans sa valeur ni son texte. À ajouter à ISSUES_DEPOT et à ` +
          `${RACINE_MICRO_COPIE}espace/issues-depot.ts.`
      );
    }
  }

  // Les refus : exactement IssueDepot ∩ MotifRefusDepot, et chacun sans qui ni quand.
  const refusAttendus = vue.issuesDeLEnum.filter((i) => vue.motifsDeRefus.includes(i));
  for (const i of vue.refusDeclares.filter((r) => !refusAttendus.includes(r))) {
    ajouter(
      'refus_mal_declare',
      `ISSUES_DE_REFUS.${i} — déclaré refus, alors que REQ-SEC-022 ne le range pas parmi les ` +
        `catégories de MotifRefusDepot.`
    );
  }
  for (const i of refusAttendus.filter((r) => !vue.refusDeclares.includes(r))) {
    ajouter(
      'refus_mal_declare',
      `ISSUES_DE_REFUS.${i} — REQ-SEC-022 range ${i} parmi les refus de catégorie, et il n'est pas ` +
        `déclaré refus : il perdrait la phrase « aucune autre conséquence » et le lien de contestation.`
    );
  }
  if (!rempli(vue.mentionDuRefus) || !rempli(vue.contestation.libelle)) {
    ajouter(
      'refus_incomplet',
      `MENTION_DU_REFUS ou CONTESTATION_ECRITE est vide : REQ-UX-002 veut que chaque refus dise qu'il ` +
        `n'emporte aucune autre conséquence et porte le lien de contestation écrite (REQ-DM-043).`
    );
  }
  for (const i of vue.refusDeclares) {
    const t = vue.textesDesIssues[i];
    const horodatage = vue.horodatages[i];
    const mention = horodatage === undefined ? '' : (vue.mentionsHorodatage[horodatage] ?? '');
    const champs = t === undefined ? [] : [t.pastille, t.titre, t.pourquoi, t.quoiFaire, mention];
    const bavard = champs.find((c) => PARAMETRE.test(c));
    if (bavard !== undefined) {
      ajouter(
        'refus_incomplet',
        `IssueDepot.${i} — le refus porte un paramètre (« ${bavard} »). Un refus est notifié avec sa ` +
          `catégorie, sans révéler ni qui ni quand (REQ-UX-002, REQ-SEC-022).`
      );
    }
  }

  // REQ-UX-019 — un état vide par écran, dans les deux sens.
  const etatsVides: [string, readonly string[], Readonly<Record<string, EtatVide | undefined>>][] =
    [
      ["l'espace", vue.ecransEspace, vue.etatsVidesEspace],
      ['la console', vue.ecransConsole, vue.etatsVidesConsole],
    ];
  for (const [ou, ecrans, etats] of etatsVides) {
    for (const ecran of ecrans) {
      const e = etats[ecran];
      if (e === undefined || !rempli(e.titre) || !rempli(e.phrase) || !rempli(e.action.libelle)) {
        ajouter(
          'ecran_sans_etat_vide',
          `${ecran} — cet écran de ${ou} n'a pas d'état vide complet (titre, phrase, action ` +
            `principale). REQ-UX-019 : un écran sans état vide déclaré est un écran qui, le premier ` +
            `jour, ne dit rien à personne.`
        );
      }
    }
    for (const cle of Object.keys(etats).filter((k) => !ecrans.includes(k))) {
      ajouter(
        'etat_vide_orphelin',
        `${cle} — état vide déclaré pour un écran de ${ou} que la source ne connaît pas : l'écran a ` +
          `été renommé ou retiré, et son texte ne s'affichera jamais.`
      );
    }
  }

  // Les actions mènent à une route de la carte (la console n'a pas encore de carte).
  const actions: [string, ActionEcran | null, readonly string[]][] = [
    ['CONTESTATION_ECRITE', vue.contestation, vue.ecransEspace],
  ];
  for (const [i, t] of Object.entries(vue.textesDesIssues)) {
    if (t === undefined) continue;
    actions.push([`IssueDepot.${i} (action principale)`, t.actionPrincipale, vue.ecransEspace]);
    actions.push([`IssueDepot.${i} (action secondaire)`, t.actionSecondaire, vue.ecransEspace]);
  }
  for (const [ecran, e] of Object.entries(vue.etatsVidesEspace)) {
    if (e !== undefined) actions.push([`état vide ${ecran}`, e.action, vue.ecransEspace]);
  }
  for (const [ecran, e] of Object.entries(vue.etatsVidesConsole)) {
    if (e !== undefined) actions.push([`état vide console ${ecran}`, e.action, []]);
  }
  for (const [qui, action, connues] of actions) {
    if (action !== null && action.route !== null && !connues.includes(action.route)) {
      ajouter(
        'action_vers_route_inconnue',
        `${qui} — « ${action.libelle} » mène à ${action.route}, route absente de ${CHEMIN_CARTE}. ` +
          `Une action vers une route inconnue est un lien mort le jour où l'écran est codé.`
      );
    }
  }

  // « Mes entreprises » vide guide vers le premier dépôt.
  if (
    !vue.ecransEspace.includes(ECRAN_MES_ENTREPRISES) ||
    !vue.ecransEspace.includes(ROUTE_DU_DEPOT)
  ) {
    ajouter(
      'premier_depot_non_guide',
      `${CHEMIN_CARTE} ne porte plus ${ECRAN_MES_ENTREPRISES} ou ${ROUTE_DU_DEPOT} : la garde ne sait ` +
        `plus vérifier que l'état vide de « Mes entreprises » mène au dépôt. Corrige ECRAN_MES_ENTREPRISES ` +
        `ou ROUTE_DU_DEPOT dans cette garde.`
    );
  } else {
    const route = vue.etatsVidesEspace[ECRAN_MES_ENTREPRISES]?.action.route ?? null;
    if (route !== ROUTE_DU_DEPOT) {
      ajouter(
        'premier_depot_non_guide',
        `${ECRAN_MES_ENTREPRISES} — son état vide mène à ${route ?? 'aucune route'}, pas à ` +
          `${ROUTE_DU_DEPOT}. REQ-UX-019 : l'état vide de « Mes entreprises » guide vers le premier dépôt.`
      );
    }
  }

  // La source unique : aucun libellé dans un composant, aucun HTML brut.
  for (const f of vue.composants) {
    for (const l of libellesEnDur(f.chemin, f.contenu)) ajouter('libelle_en_dur', l.message);
    for (const l of htmlBrut(f.chemin, f.contenu)) ajouter('html_brut', l.message);
  }

  // Chaque fichier de l'espace est parcouru : aucun ne peut échapper à la liste blanche.
  for (const f of vue.fichiersDeMicroCopie.filter((c) => c.startsWith(RACINE_ESPACE))) {
    if (!(f.slice(RACINE_MICRO_COPIE.length) in vue.microCopieEspace)) {
      ajouter(
        'micro_copie_non_lue',
        `${f} — ce fichier de l'espace n'est pas parcouru par la garde : ses textes, lus par un ` +
          `apporteur, échappent à la liste blanche des paramètres. À ajouter à ` +
          `MICRO_COPIE_DE_L_ESPACE dans scripts/gates/ux-exhaustivite.ts.`
      );
    }
  }

  // NI QUI NI QUAND : tout texte de l'espace, tout paramètre, jugé par la liste blanche.
  for (const { chemin, texte } of textesDeLEspace(vue)) {
    const permis = permisPour(chemin, vue.parametresPermis);
    for (const m of texte.matchAll(/\{([^}]*)\}/g)) {
      if (!permis.has(m[1]!)) {
        ajouter(
          'parametre_non_permis',
          `${chemin} — le paramètre ${m[0]} n'est pas permis dans ce contexte (permis : ` +
            `${[...permis].map((p) => `{${p}}`).join(', ') || 'aucun'}). Un texte de l'espace ne dit ` +
            `ni le nom, ni la date de dépôt, ni le stade d'un autre apporteur (REQ-SEC-022) ; un ` +
            `paramètre légitime s'ajoute à PARAMETRES_PERMIS, avec sa raison.`
        );
      }
    }
    const nu = texte.replace(RENVOI_A_UN_ARTICLE, '').replace(/\{[^}]*\}/g, '');
    const chiffre = /\d+/.exec(nu);
    if (chiffre) {
      ajouter(
        'valeur_en_clair',
        `${chemin} — « ${chiffre[0]} » est écrit en clair. Un délai, un seuil ou une date est un ` +
          `paramètre {…} dont la valeur vient de sa source unique (RM-10) : le chiffre recopié ici ` +
          `divergera de celui qu'on applique.`
      );
    }
  }

  return { fautes };
}

// ── la vue du dépôt (fichiers SUIVIS par git) ───────────────────────────────────

type Registre = { exigences: { id: string; texte: string }[] };

/**
 * Ce que la vue lit sur le disque — injectable, pour qu'un test PROUVE que la population attendue
 * vient du registre et de la carte, et jamais de la micro-copie qu'elle contrôle.
 */
export type Sources = {
  lire: (chemin: string) => string;
  suivis: () => readonly string[];
};

const lireOuVide = (chemin: string): string =>
  existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';

export const SOURCES_DU_DEPOT: Sources = {
  lire: lireOuVide,
  suivis: () => fichiersSuivisOuRefus('ux:exhaustivite'),
};

function texteDuRegistre(id: string, lire: Sources['lire']): string {
  const brut = lire(CHEMIN_REGISTRE);
  if (brut === '') return '';
  const registre = JSON.parse(brut) as Registre;
  return registre.exigences.find((e) => e.id === id)?.texte ?? '';
}

/** Un composant : un `.tsx` suivi sous `src/` ou `emails/`, hors de la micro-copie elle-même. */
const EST_UN_COMPOSANT = (c: string): boolean =>
  /^(src|emails)\/.+\.tsx$/.test(c) && !c.startsWith(RACINE_MICRO_COPIE);

export function vueDuDepot(sources: Sources = SOURCES_DU_DEPOT): Vue {
  const { lire } = sources;
  const suivis = sources.suivis();
  return {
    issuesDeLEnum: ISSUES_DEPOT,
    issuesDuContrat: issuesDuContrat(texteDuRegistre('REQ-UX-002', lire)),
    motifsDeRefus: motifsDeRefus(texteDuRegistre('REQ-SEC-022', lire)),
    refusDeclares: ISSUES_DE_REFUS,
    textesDesIssues: TEXTES_DES_ISSUES,
    horodatages: HORODATAGE_DE_L_ISSUE,
    mentionsHorodatage: MENTIONS_HORODATAGE,
    mentionDuRefus: MENTION_DU_REFUS,
    contestation: CONTESTATION_ECRITE,
    ecransEspace: ecransDeLEspace(lire(CHEMIN_CARTE)),
    ecransConsole: ecransDeLaConsole(lire(CHEMIN_VALIDATION)),
    etatsVidesEspace: ETATS_VIDES_ESPACE,
    etatsVidesConsole: ETATS_VIDES_CONSOLE,
    composants: suivis
      .filter((c) => EST_UN_COMPOSANT(c) && existsSync(c))
      .map((chemin) => ({ chemin, contenu: lire(chemin) })),
    fichiersDeMicroCopie: suivis.filter(
      (c) => c.startsWith(RACINE_MICRO_COPIE) || c === 'messages/fr.json'
    ),
    microCopieEspace: MICRO_COPIE_DE_L_ESPACE,
    parametresPermis: PARAMETRES_PERMIS,
  };
}

// ── la fixture de la preuve (RM-11 : elle ne lit rien du dépôt) ───────────────────

const T = (titre: string): TexteIssue => ({
  pastille: 'Pastille',
  titre,
  pourquoi: 'Parce que.',
  quoiFaire: 'Rien à faire.',
  actionPrincipale: { libelle: 'Retour', route: '/' },
  actionSecondaire: null,
});
const V = (titre: string, route: string | null = null): EtatVide => ({
  titre,
  phrase: 'Une phrase.',
  action: { libelle: 'Agir', route },
});

/** Une vue minimale et CONFORME : deux issues dont un refus, trois écrans d'espace, un de console. */
export function vueDeFixture(): Vue {
  return {
    issuesDeLEnum: ['acceptee', 'refusee'],
    issuesDuContrat: ['acceptee', 'refusee'],
    motifsDeRefus: ['refusee', 'motif_sans_issue'],
    refusDeclares: ['refusee'],
    textesDesIssues: { acceptee: T('Accepté le {date}'), refusee: T('Refusé') },
    horodatages: { acceptee: 'oui', refusee: 'non' },
    mentionsHorodatage: { oui: 'À votre nom le {date}.', non: 'Rien à votre nom.' },
    mentionDuRefus: 'Aucune autre conséquence.',
    contestation: { libelle: 'Contester', route: null },
    ecransEspace: ['/', ECRAN_MES_ENTREPRISES, ROUTE_DU_DEPOT],
    ecransConsole: ['file'],
    etatsVidesEspace: {
      '/': V('Accueil'),
      [ECRAN_MES_ENTREPRISES]: V('Vide', ROUTE_DU_DEPOT),
      [ROUTE_DU_DEPOT]: V('Déposer'),
    },
    etatsVidesConsole: { file: V('File vide') },
    composants: [],
    fichiersDeMicroCopie: [`${RACINE_ESPACE}fixture.ts`],
    microCopieEspace: {
      'espace/fixture.ts': {
        ISSUES: { acceptee: { titre: 'Accepté le {date}', action: { libelle: 'Voir' } } },
        RENVOI: 'Refusé (contrat, article 3.3 bis).',
      },
    },
    parametresPermis: { 'espace/fixture.ts › ISSUES › acceptee': ['date'] },
  };
}

/** Les sources d'une vue de fixture, pour prouver que `vueDuDepot` LIT le registre et la carte. */
const SOURCES_DE_FIXTURE: Sources = {
  lire: (chemin) =>
    chemin === CHEMIN_REGISTRE
      ? JSON.stringify({
          exigences: [
            { id: 'REQ-UX-002', texte: 'Issues ) : `sentinelle_du_registre`. Les valeurs.' },
            { id: 'REQ-SEC-022', texte: 'Valeurs : `motif_sentinelle`. **Le refus' },
          ],
        })
      : chemin === CHEMIN_CARTE
        ? '| `/ecran-sentinelle` | témoin |'
        : chemin === CHEMIN_VALIDATION
          ? '## Console\n| `console-sentinelle.html` | témoin |'
          : '',
  suivis: () => [],
};

const COMPOSANT_FAUTIF = {
  chemin: 'src/app/(espace)/temoin.tsx',
  contenu: 'export const P = () => <p>Bonjour</p>;',
};
const COMPOSANT_PROPRE = {
  chemin: 'src/app/(espace)/propre.tsx',
  contenu: [
    "import { ETATS_VIDES_ESPACE } from '../../content/micro-copy/espace/etats-vides';",
    "const e = ETATS_VIDES_ESPACE['/']!;",
    'export const P = () => (',
    '  <main className="pile serree" aria-label={e.titre} data-etat="vide">',
    '    <h1>{e.titre}</h1> · —',
    '  </main>',
    ');',
  ].join('\n'),
};

/** Un témoin par famille : la panne injectée, et le nom que le message doit porter. */
const TEMOINS: { famille: string; nomme: string; vue: () => Vue }[] = [
  {
    famille: 'source_illisible',
    nomme: 'REQ-UX-002',
    vue: () => ({ ...vueDeFixture(), issuesDuContrat: [] }),
  },
  {
    famille: 'issue_sans_texte',
    nomme: 'IssueDepot.muette',
    vue: () => {
      const v = vueDeFixture();
      return {
        ...v,
        issuesDeLEnum: [...v.issuesDeLEnum, 'muette'],
        issuesDuContrat: [...v.issuesDuContrat, 'muette'],
        // Son horodatage est là : elle ne diffère de la fixture QUE par le texte absent.
        horodatages: { ...v.horodatages, muette: 'non' },
      };
    },
  },
  {
    famille: 'issue_sans_base_contractuelle',
    nomme: 'IssueDepot.inventee',
    vue: () => {
      const v = vueDeFixture();
      return {
        ...v,
        issuesDeLEnum: [...v.issuesDeLEnum, 'inventee'],
        textesDesIssues: { ...v.textesDesIssues, inventee: T('Inventée') },
        horodatages: { ...v.horodatages, inventee: 'non' },
      };
    },
  },
  {
    famille: 'issue_du_contrat_sans_valeur',
    nomme: 'nouvelle_categorie',
    vue: () => {
      const v = vueDeFixture();
      return { ...v, issuesDuContrat: [...v.issuesDuContrat, 'nouvelle_categorie'] };
    },
  },
  {
    famille: 'refus_mal_declare',
    nomme: 'ISSUES_DE_REFUS.refusee',
    vue: () => ({ ...vueDeFixture(), refusDeclares: [] }),
  },
  {
    famille: 'refus_incomplet',
    nomme: 'IssueDepot.refusee',
    vue: () => {
      const v = vueDeFixture();
      return {
        ...v,
        textesDesIssues: { ...v.textesDesIssues, refusee: T('Déjà déposée par {autre}') },
      };
    },
  },
  {
    famille: 'ecran_sans_etat_vide',
    nomme: '/ecran-neuf',
    vue: () => {
      const v = vueDeFixture();
      return { ...v, ecransEspace: [...v.ecransEspace, '/ecran-neuf'] };
    },
  },
  {
    famille: 'etat_vide_orphelin',
    nomme: '/ecran-retire',
    vue: () => {
      const v = vueDeFixture();
      return { ...v, etatsVidesEspace: { ...v.etatsVidesEspace, '/ecran-retire': V('Retiré') } };
    },
  },
  {
    famille: 'action_vers_route_inconnue',
    nomme: '/nulle-part',
    vue: () => {
      const v = vueDeFixture();
      return {
        ...v,
        etatsVidesEspace: { ...v.etatsVidesEspace, '/': V('Accueil', '/nulle-part') },
      };
    },
  },
  {
    famille: 'premier_depot_non_guide',
    nomme: ECRAN_MES_ENTREPRISES,
    vue: () => {
      const v = vueDeFixture();
      return {
        ...v,
        etatsVidesEspace: { ...v.etatsVidesEspace, [ECRAN_MES_ENTREPRISES]: V('Vide', '/') },
      };
    },
  },
  {
    famille: 'libelle_en_dur',
    nomme: `${COMPOSANT_FAUTIF.chemin}:1`,
    vue: () => ({ ...vueDeFixture(), composants: [COMPOSANT_FAUTIF] }),
  },
  {
    // Le scénario du relecteur : un libellé d'ACTION qui nomme l'autre apporteur.
    famille: 'parametre_non_permis',
    nomme: 'espace/fixture.ts › ISSUES › collision › action › libelle',
    vue: () => ({
      ...vueDeFixture(),
      microCopieEspace: {
        'espace/fixture.ts': {
          ISSUES: {
            collision: {
              titre: 'Réservée pour un autre apporteur',
              action: { libelle: 'Voir le dépôt de {nomAutreApporteur}' },
            },
          },
        },
      },
    }),
  },
  {
    famille: 'micro_copie_non_lue',
    nomme: `${RACINE_ESPACE}oublie.ts`,
    vue: () => {
      const v = vueDeFixture();
      return {
        ...v,
        fichiersDeMicroCopie: [...v.fichiersDeMicroCopie, `${RACINE_ESPACE}oublie.ts`],
      };
    },
  },
  {
    famille: 'valeur_en_clair',
    nomme: '« 48 »',
    vue: () => ({
      ...vueDeFixture(),
      microCopieEspace: { 'espace/fixture.ts': { AIDE: 'Réponse sous 48 heures.' } },
    }),
  },
  {
    famille: 'html_brut',
    nomme: `${COMPOSANT_FAUTIF.chemin}:1`,
    vue: () => ({
      ...vueDeFixture(),
      composants: [
        {
          chemin: COMPOSANT_FAUTIF.chemin,
          contenu:
            'export const P = ({ t }: { t: string }) => <p dangerouslySetInnerHTML={{ __html: t }} />;',
        },
      ],
    }),
  },
];

/** Les contre-témoins : ils doivent rester verts, et l'un d'eux CONFRONTE un composant réel. */
const CONTRE_TEMOINS: { quoi: string; vue: () => Vue }[] = [
  {
    // Elle porte un paramètre dans une issue qui N'EST PAS un refus (la date de son propre dépôt) :
    // c'est ce qui prouve que `refus_incomplet` vise le refus, pas le paramètre en soi.
    quoi: 'la fixture conforme : un paramètre PERMIS dans son contexte, un renvoi à un article',
    vue: vueDeFixture,
  },
  {
    quoi: 'un composant qui lit la micro-copie, avec classes, attribut data- et ponctuation',
    vue: () => ({ ...vueDeFixture(), composants: [COMPOSANT_PROPRE] }),
  },
];

// ── exécution ────────────────────────────────────────────────────────────────────

/** Importée par le spec autant que lancée : sans cette garde, l'import appellerait `process.exit`. */
const APPELE_DIRECTEMENT = /ux-exhaustivite\.ts$/.test(process.argv[1] ?? '');

function echouer(message: string): never {
  console.error(message);
  process.exit(1);
}

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    const sansTemoin = FAMILLES.map((f) => f.nom).filter(
      (n) => !TEMOINS.some((t) => t.famille === n)
    );
    if (sansTemoin.length > 0) {
      echouer(
        `❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}. Une famille sans témoin n'est pas prouvée.`
      );
    }
    for (const t of TEMOINS) {
      const r = controler(t.vue());
      const siennes = r.fautes.filter((f) => f.famille === t.famille);
      if (siennes.length === 0) {
        echouer(
          `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille (rougies : ` +
            `${r.fautes.map((f) => f.famille).join(', ') || 'aucune'}).`
        );
      }
      if (!siennes.some((f) => f.message.includes(t.nomme))) {
        echouer(
          `❌ « ${t.famille} » a rougi sans NOMMER « ${t.nomme} » : une faute anonyme n'a pas de propriétaire.`
        );
      }
    }
    for (const c of CONTRE_TEMOINS) {
      const r = controler(c.vue());
      if (r.fautes.length > 0)
        echouer(`❌ Faux positif sur « ${c.quoi} » :\n   ${r.fautes[0]!.message}`);
    }
    // La vue du dépôt LIT ses populations attendues — registre, carte, section Console — et ne les
    // prend jamais dans la micro-copie ni dans l'enum qu'elle contrôle.
    const lue = vueDuDepot(SOURCES_DE_FIXTURE);
    const attendu: [string, readonly string[], string[]][] = [
      ['issuesDuContrat (registre, REQ-UX-002)', lue.issuesDuContrat, ['sentinelle_du_registre']],
      ['motifsDeRefus (registre, REQ-SEC-022)', lue.motifsDeRefus, ['motif_sentinelle']],
      [`ecransEspace (${CHEMIN_CARTE})`, lue.ecransEspace, ['/ecran-sentinelle']],
      [`ecransConsole (${CHEMIN_VALIDATION})`, lue.ecransConsole, ['console-sentinelle']],
    ];
    for (const [quoi, obtenu, voulu] of attendu) {
      if (JSON.stringify(obtenu) !== JSON.stringify(voulu)) {
        echouer(
          `❌ vueDuDepot ne lit pas sa source pour ${quoi} : attendu ${JSON.stringify(voulu)}, ` +
            `obtenu ${JSON.stringify(obtenu)}. Une garde qui lit sa population dans ce qu'elle ` +
            `contrôle ne garde plus rien.`
        );
      }
    }
    if (libellesEnDur(COMPOSANT_PROPRE.chemin, COMPOSANT_PROPRE.contenu).length !== 0) {
      echouer('❌ Le composant propre rougit : la lecture de l’arbre syntaxique est trop large.');
    }
    console.log(
      `✅ ux:exhaustivite — ${FAMILLES.length} familles rougissent chacune sur son témoin en nommant ` +
        `sa cible, ${CONTRE_TEMOINS.length} contre-témoins restent verts, la vue du dépôt lit ses ` +
        `quatre sources — preuve faite.`
    );
    for (const f of FAMILLES) console.log(`   • ${f.nom} — ${f.explication}`);
    process.exit(0);
  }

  const vue = vueDuDepot();
  const { fautes } = controler(vue);
  if (fautes.length > 0) {
    console.error(`❌ ux:exhaustivite — ${fautes.length} faute(s) :\n`);
    for (const f of fautes) console.error(`   [${f.famille}] ${f.message}`);
    process.exit(1);
  }
  const ecrans = vue.ecransEspace.length + vue.ecransConsole.length;
  console.log(
    `✅ ux:exhaustivite — ${vue.issuesDeLEnum.length} issue(s) confrontée(s) à REQ-UX-002, dont ` +
      `${vue.refusDeclares.length} refus confrontés à REQ-SEC-022 ; ${ecrans} écran(s) confronté(s) ` +
      `(${vue.ecransEspace.length} de l'espace, ${vue.ecransConsole.length} de la console) avec leur ` +
      `état vide ; ${vue.composants.length} composant(s) .tsx confronté(s), aucun libellé en dur ; ` +
      `${vue.fichiersDeMicroCopie.length} fichier(s) de micro-copie.`
  );
  if (vue.composants.length === 0) {
    console.log(
      `   Aucun composant .tsx n'existe encore : que la famille libelle_en_dur MESURE se prouve par ` +
        `« pnpm ux:exhaustivite:prove », pas par ce zéro.`
    );
  }
  console.log(
    `   Seuls les fichiers SUIVIS par git sont lus : un fichier non suivi n'est lu par aucune garde.`
  );
  process.exit(0);
}
