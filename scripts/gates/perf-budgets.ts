/**
 * perf-budgets.ts — les budgets de performance de l'espace apporteur, et la garde qui les tient.
 * (REQ-GOV-028, tâche GOV-019)
 *
 * USAGE : pnpm perf:budgets            contrôle le dépôt
 *         pnpm perf:budgets --prove    un témoin par famille, des contre-témoins verts
 *         pnpm perf:budgets --rendre   écrit `lighthouserc.json` et normalise les `limit`
 *         pnpm perf:budgets --verifier ne rend rien, rougit si le disque diffère du rendu
 *
 * ── CE QUE CETTE GARDE FAIT, ET CE QU'ELLE NE FAIT PAS ───────────────────────────────────────
 *
 * Elle ne mesure AUCUN octet. Il n'y a rien à mesurer : Partners n'a aujourd'hui aucune route,
 * aucun composant, aucune application — le dépôt ne porte que de la gouvernance, un schéma
 * minimal et des scripts de garde. Ce qu'elle fait, c'est tenir les budgets EN PLACE et vérifier
 * qu'aucune route ne naît sans le sien.
 *
 * ── LES DEUX PANNES QU'ELLE EXISTE POUR NE PAS REFAIRE ───────────────────────────────────────
 *
 * 1. LA GARDE QUI SE TAIT QUAND SON PÉRIMÈTRE EST VIDE. `axionia/scripts/check-zod.ts` sort 0
 *    avec un avertissement dès que son répertoire n'existe pas ; elle n'a jamais rien gardé et
 *    personne ne l'a su. Ici, le périmètre EST vide, et le restera jusqu'à la première route.
 *    Trois choses évitent le même sort : la sortie annonce COMBIEN de routes ont été balayées
 *    (« 0 route(s) » n'est pas « aucun défaut »), elle dit en toutes lettres que ce vert ne juge
 *    aucune route, et `--prove` montre le rougissement de chaque famille aujourd'hui — pas le
 *    jour où elle aurait dû servir.
 *
 * 2. LE GATE QUI N'ASSERTAIT RIEN PARCE QU'IL MOURAIT AVANT. Sur le dépôt voisin, le gate
 *    Lighthouse MOBILE est resté rouge en permanence, et ce rouge n'était pas une régression :
 *    `aggregationMethod` déclaré à côté de `assertMatrix` fait lever lhci (« Cannot use
 *    assertMatrix with other options », `@lhci/utils/src/assertions.js`), la passe collectait ses
 *    rapports puis mourait AVANT d'asserter, et le budget mobile n'était gardé par rien. Un rouge
 *    permanent est indiscernable d'une garde morte. D'où deux familles ici — `lhci_non_bloquant`
 *    (une assertion en `warn` ne refuse rien) et `lhci_hors_mobile` (un profil de laboratoire qui
 *    n'est pas celui de l'exigence mesure autre chose) — et le refus, famille `etape_ci_muselee`,
 *    de toute étape de CI qui appellerait ces budgets en `continue-on-error` : sur le dépôt
 *    voisin, TOUTES les gates PR de budget le portent, si bien qu'aucune PR qui alourdit le
 *    bundle n'y rougit, alors que la documentation affirmait le contraire.
 *
 * ── AUCUN CLIQUET SOUS LA MESURE COURANTE ────────────────────────────────────────────────────
 *
 * L'exigence l'écrit, et c'est une clause de fond : personne ne doit pouvoir faire passer la
 * garde en abaissant le budget au niveau de ce qui existe. Le plafond n'est donc pas un champ
 * qu'on remplit : il est DÉRIVÉ du texte de REQ-GOV-028 (docs/requirements.json) et RÉGÉNÉRÉ par
 * `--rendre`. Toute valeur qui s'en écarte rougit, dans les deux sens : `cliquet_sous_le_plafond`
 * quand on aligne le budget sur une mesure, `plafond_relache` quand on l'ouvre pour laisser
 * passer un import. Aucun des deux gestes n'a de version « qui passe ».
 *
 * ── CE QUE `QA-T20` DEVRA REPRENDRE (phase 0) ────────────────────────────────────────────────
 *
 * `QA-T20` — « Budget bundle absolu par route + LHCI lab mobile — configuration » — pose la gate
 * `perf:bundle` (docs/gates.json) une fois l'application née. Ce qui est ici est son OSSATURE,
 * pas un provisoire à défaire :
 *
 *   • elle garde `perf/budgets.json` comme source des entrées et `lighthouserc.json` comme rendu ;
 *     elle y ajoute ce qui n'existe pas encore — `collect.url` (les URLs réelles, une par route,
 *     les segments dynamiques résolus sur une session de test) et `startServerCommand` ;
 *   • elle écrit le MESUREUR, `scripts/gates/bundle-par-route.ts`, qui somme les paquets de
 *     `.next/static/chunks/app/` route par route et les confronte au `limit` de chaque entrée.
 *     Cette garde-ci vérifie que chaque route A un budget ; celle-là vérifiera qu'elle le TIENT ;
 *   • ⚠️ `interaction-to-next-paint` : en navigation, Lighthouse ne mesure l'INP que si la page
 *     reçoit une interaction. Mesuré sur le dépôt voisin : `auditRan = 0` sur dix-huit passes
 *     (douze desktop, six mobile), assertion vacante — verte pour rien. L'assertion est posée ici
 *     en `error`, comme l'exigence le demande, et il revient à QA-T20 de la rendre MESURABLE
 *     (passe `timespan`/user-flow avec une interaction simulée) et de le prouver par un rapport
 *     où l'audit a tourné. Une assertion vacante est la forme la plus discrète de la panne n° 2 ;
 *   • le nombre de passes (`numberOfRuns`) et la médiane : un seuil de TEMPS se borne sur
 *     plusieurs passes et se lit en médiane, un seuil d'OCTETS est déterministe et se lit sur une
 *     seule. Le premier cliquet posé sur une seule passe, chez le voisin, a rougi trois heures
 *     plus tard sur la charge du runner, pas sur une régression.
 *
 * ── DÉPENDANCES : AUCUNE AJOUTÉE, ET C'EST DÉLIBÉRÉ ──────────────────────────────────────────
 *
 * Ni `size-limit` ni `@lhci/cli` ne sont installés dans ce dépôt, et cette garde n'en a pas
 * besoin : elle LIT la configuration, elle n'exécute pas les outils. « Chaque route a une entrée »
 * est une question de configuration, pas de mesure. Installer deux outils pour garder un espace
 * qui n'a aucune route serait payer un `pnpm install` plus lent, une surface de mise à jour et
 * deux verrous de version à chaque PR, pour zéro octet mesuré. Les outils entrent avec QA-T20, en
 * même temps que la première route — c'est-à-dire le jour où ils mesurent quelque chose.
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHEMIN_BUDGETS = 'perf/budgets.json';
const CHEMIN_LIGHTHOUSERC = 'lighthouserc.json';
const CHEMIN_REGISTRE = 'docs/requirements.json';
const CHEMIN_CI = '.github/workflows/ci.yml';
const EXIGENCE = 'REQ-GOV-028';

/**
 * La racine des routes de l'espace apporteur. Ce n'est pas un choix de ce fichier : `RM-05`
 * (docs/REGLES-MAISON.md) et le §4 de `docs/CONVENTIONS.md` désignent tous deux
 * `src/app/(espace)/**` comme le périmètre de l'espace — c'est là que porte la garde AST
 * anti-`prisma`, et c'est le même périmètre qu'ici.
 */
export const RACINE_ESPACE = 'src/app/(espace)';

/** Les identifiants d'audit sont le vocabulaire de Lighthouse, pas le nôtre (RM-08). */
const AUDIT_LCP = 'largest-contentful-paint';
const AUDIT_CLS = 'cumulative-layout-shift';
const AUDIT_INP = 'interaction-to-next-paint';

/** Le niveau d'assertion qui REFUSE. `warn` n'a jamais rien refusé. */
const NIVEAU_BLOQUANT = 'error';

export const FAMILLES = [
  'route_sans_budget',
  'budget_orphelin',
  'entree_incomplete',
  'plafond_relache',
  'cliquet_sous_le_plafond',
  'seuil_divergent',
  'seuil_absent',
  'lhci_non_bloquant',
  'lhci_hors_mobile',
  'lighthouserc_perime',
  'etape_ci_muselee',
  'source_illisible',
] as const;

export type Faute = { famille: string; message: string };

export type Seuils = {
  plafondKoGz: number;
  lcpMs: number;
  cls: number;
  inpMs: number;
  profil: string;
};

export type Vue = {
  /** contenu de `perf/budgets.json` */
  budgets: string;
  /** contenu de `lighthouserc.json` */
  lighthouserc: string;
  /** le TEXTE de REQ-GOV-028 — la source de tous les seuils */
  registre: string;
  /** les chemins de fichiers vus sous `src/` (injectés : la preuve ne touche pas le disque) */
  fichiers: string[];
  /** contenu de `.github/workflows/ci.yml` */
  ci: string;
};

type Entree = { name?: string; path?: string; limit?: string; gzip?: boolean };
type Budgets = { sizeLimit?: Entree[] };

// ── dérivation : les seuils se LISENT dans le registre, ils ne sont jamais tapés (RM-01) ──────

/** Enlève les espaces d'un nombre écrit à la française (« 1 800 »), fine ou insécable comprise. */
function nombre(brut: string): number {
  return Number(brut.replace(/[\s\u202f\u00a0]/g, ''));
}

/**
 * Les cinq valeurs que REQ-GOV-028 fixe. Un texte qui ne les dit plus fait LEVER : un seuil par
 * défaut serait le pire des deux mondes — la garde continuerait de juger, avec une valeur que
 * personne n'a décidée (RM-11).
 */
export function seuilsDepuisRegistre(texte: string): Seuils {
  const lire = (motif: RegExp, quoi: string): string => {
    const m = texte.match(motif);
    if (!m || m[1] === undefined) {
      throw new Error(
        `${EXIGENCE} ne dit plus ${quoi} (motif ${motif}). Les seuils de cette garde sont DÉRIVÉS ` +
          `du registre : sans le texte, il n'y a pas de valeur de repli, et c'est voulu.`
      );
    }
    return m[1];
  };
  return {
    plafondKoGz: nombre(lire(/≤\s*([\d\s\u202f\u00a0]+?)\s*KB\s*gz/, 'le plafond par route')),
    lcpMs: nombre(lire(/LCP\s*≤\s*([\d\s\u202f\u00a0]+?)\s*ms/, 'le seuil LCP')),
    cls: nombre(lire(/CLS\s*=\s*(\d+)/, 'le seuil CLS')),
    inpMs: nombre(lire(/INP\s*≤\s*([\d\s\u202f\u00a0]+?)\s*ms/, 'le seuil INP')),
    profil: lire(/lab\s+([a-zA-Zé]+)/, 'le profil de laboratoire'),
  };
}

/** Le texte de REQ-GOV-028 dans le registre d'exigences — jamais une copie. */
export function texteDeLExigence(registreJson: string): string {
  const registre = JSON.parse(registreJson) as { exigences?: { id: string; texte: string }[] };
  const req = (registre.exigences ?? []).find((e) => e.id === EXIGENCE);
  if (!req) throw new Error(`${EXIGENCE} est introuvable dans ${CHEMIN_REGISTRE}`);
  return req.texte;
}

// ── les routes de l'espace, dérivées du système de fichiers ───────────────────────────────────

/**
 * Les routes de l'espace apporteur, lues sur une liste de chemins.
 *
 * La SOURCE est le système de fichiers, pas `docs/ESPACE-ROUTES.md` : cette carte dit ce qui est
 * PRÉVU (une vingtaine d'écrans), et une garde qui la prendrait pour source rougirait aujourd'hui
 * sur vingt routes qui n'existent pas — une gate insatisfiable se fait sauter. Le même choix est
 * déjà écrit dans la carte elle-même, pour `idor:check`.
 */
export function routesDeLEspace(fichiers: string[]): { route: string; fichier: string }[] {
  const vues = new Map<string, string>();
  for (const brut of fichiers) {
    const f = brut.split('\\').join('/');
    if (!f.startsWith(`${RACINE_ESPACE}/`)) continue;
    if (!/\/page\.(tsx|ts|jsx|js)$/.test(f)) continue;
    const segments = f
      .slice(RACINE_ESPACE.length + 1)
      .split('/')
      .slice(0, -1);
    // Un dossier `_prive` n'est pas routable (convention Next) ; un groupe `(x)` et un slot `@y`
    // ne paraissent pas dans l'URL.
    if (segments.some((s) => s.startsWith('_'))) continue;
    const visibles = segments.filter(
      (s) => !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@')
    );
    const route = `/${visibles.join('/')}`;
    if (!vues.has(route)) vues.set(route, f);
  }
  return [...vues.entries()]
    .map(([route, fichier]) => ({ route, fichier }))
    .sort((a, b) => (a.route < b.route ? -1 : 1));
}

// ── le rendu de lighthouserc.json ─────────────────────────────────────────────────────────────

/**
 * `lighthouserc.json` est DÉRIVÉ des seuils, donc du texte de l'exigence. Une main qui l'édite
 * crée une seconde source, et c'est toujours celle qui n'a pas été corrigée qui est lue (RM-01).
 *
 * Le rendu ne dépend PAS des entrées `size-limit` : `collect.url` reste vide tant qu'aucune route
 * n'existe, et le remplir est le travail de QA-T20 (les segments dynamiques ne sont pas des URLs).
 */
export function rendreLighthouserc(seuils: Seuils): string {
  const conf = {
    '//': [
      `FICHIER RENDU — ne pas editer a la main. Source : ${EXIGENCE} (${CHEMIN_REGISTRE}).`,
      'Regenerer : `pnpm perf:budgets --rendre`. Verifier : `pnpm perf:budgets` (famille lighthouserc_perime).',
      'Les trois assertions sont en `error` : une assertion en `warn` ne refuse rien, et un budget',
      'qui ne refuse rien est une garde morte — sur le depot voisin, le gate mobile est reste rouge',
      'en permanence pour une autre raison (lhci mourait avant d asserter), ce qui revenait au meme.',
      '`aggregationMethod: median` est LEGAL ici parce que la configuration porte `assertions` et',
      'non `assertMatrix` : lhci refuse la combinaison des deux (@lhci/utils/src/assertions.js).',
      'COLLECT INCOMPLET, ET C EST DIT : ni `url` ni `startServerCommand`. Aucune route n existe',
      'encore. QA-T20 (phase 0) les pose avec la premiere route, et rend l INP mesurable — en',
      'navigation, Lighthouse ne mesure pas `interaction-to-next-paint` sans interaction.',
    ],
    ci: {
      collect: {
        numberOfRuns: 3,
        settings: {
          formFactor: seuils.profil,
          screenEmulation: { mobile: seuils.profil === 'mobile', disabled: false },
        },
      },
      assert: {
        aggregationMethod: 'median',
        assertions: {
          [AUDIT_LCP]: [NIVEAU_BLOQUANT, { maxNumericValue: seuils.lcpMs }],
          [AUDIT_CLS]: [NIVEAU_BLOQUANT, { maxNumericValue: seuils.cls }],
          [AUDIT_INP]: [NIVEAU_BLOQUANT, { maxNumericValue: seuils.inpMs }],
        },
      },
    },
  };
  return `${JSON.stringify(conf, null, 2)}\n`;
}

/** Les `limit` de chaque entrée, réécrits au plafond dérivé. Le champ n'est pas à remplir. */
export function rendreBudgets(budgetsJson: string, seuils: Seuils): string {
  const b = JSON.parse(budgetsJson) as Budgets & Record<string, unknown>;
  b.sizeLimit = (b.sizeLimit ?? []).map((e) => ({
    ...e,
    limit: `${seuils.plafondKoGz} KB`,
    gzip: true,
  }));
  return `${JSON.stringify(b, null, 2)}\n`;
}

// ── le contrôle ───────────────────────────────────────────────────────────────────────────────

/** Le plafond écrit dans une entrée, en Ko. `null` si la forme n'est pas lisible. */
function limiteEnKo(limit: string | undefined): number | null {
  if (typeof limit !== 'string') return null;
  const m = limit.match(/^\s*([\d.]+)\s*KB\s*$/i);
  return m && m[1] !== undefined ? Number(m[1]) : null;
}

/** Les blocs d'étapes d'un workflow — découpage grossier, suffisant pour lire un drapeau. */
function etapes(ci: string): string[] {
  return ci.split(/^\s*-\s(?=name:|run:|uses:)/m).slice(1);
}

/**
 * Contrôle une VUE — le dépôt réel, ou une vue mutée. C'est ce qui rend `--prove` possible sans
 * jamais toucher au disque (RM-11).
 */
export function controler(vue: Vue): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string): void => {
    fautes.push({ famille, message });
  };

  // Ne pas avoir pu lire n'est jamais un vert : on sort tout de suite, une seule faute, claire.
  let seuils: Seuils;
  try {
    seuils = seuilsDepuisRegistre(vue.registre);
  } catch (e) {
    return [
      { famille: 'source_illisible', message: `${CHEMIN_REGISTRE} — ${(e as Error).message}` },
    ];
  }
  let budgets: Budgets;
  try {
    budgets = JSON.parse(vue.budgets) as Budgets;
    if (!Array.isArray(budgets.sizeLimit))
      throw new Error('la clé `sizeLimit` manque ou n’est pas une liste');
  } catch (e) {
    return [
      {
        famille: 'source_illisible',
        message:
          `${CHEMIN_BUDGETS} n'est pas lisible : ${(e as Error).message}. Sans ce fichier, la garde ` +
          `ne sait plus quelles routes sont budgétées — et un vert vaudrait alors « je n'ai rien regardé ».`,
      },
    ];
  }
  let lhrc: Record<string, any>;
  try {
    lhrc = JSON.parse(vue.lighthouserc) as Record<string, any>;
  } catch (e) {
    return [
      {
        famille: 'source_illisible',
        message: `${CHEMIN_LIGHTHOUSERC} n'est pas lisible : ${(e as Error).message}`,
      },
    ];
  }

  // (1) chaque route de l'espace a une entrée, et chaque entrée nomme une route qui existe
  const routes = routesDeLEspace(vue.fichiers);
  const entrees = budgets.sizeLimit ?? [];
  const nommees = new Set(
    entrees.map((e) => e.name).filter((n): n is string => typeof n === 'string')
  );
  for (const r of routes) {
    if (!nommees.has(r.route)) {
      ajouter(
        'route_sans_budget',
        `${r.fichier} — la route \`${r.route}\` n'a AUCUNE entrée dans ${CHEMIN_BUDGETS}. ` +
          `${EXIGENCE} : chaque route de l'espace a une entrée \`size-limit\`. Ajoute \`{ "name": "${r.route}", ` +
          `"path": "…" }\` puis \`pnpm perf:budgets --rendre\` (le \`limit\` n'est pas à écrire).`
      );
    }
  }
  const connues = new Set(routes.map((r) => r.route));
  for (const e of entrees) {
    if (typeof e.name === 'string' && !connues.has(e.name)) {
      ajouter(
        'budget_orphelin',
        `${CHEMIN_BUDGETS} — l'entrée \`${e.name}\` ne correspond à aucune route sous \`${RACINE_ESPACE}\`. ` +
          `Un budget qui ne mesure rien gonfle le compte des routes budgétées sans garder quoi que ce soit.`
      );
    }
    if (typeof e.name !== 'string' || typeof e.path !== 'string' || e.path.length === 0) {
      ajouter(
        'entree_incomplete',
        `${CHEMIN_BUDGETS} — une entrée n'a pas de \`name\` ou pas de \`path\` : ${JSON.stringify(e)}. ` +
          `Sans \`path\`, aucun paquet n'est associé à la route et le budget ne pèse rien.`
      );
    }
  }

  // (2) aucun cliquet : le plafond est dérivé, jamais choisi
  for (const e of entrees) {
    const ko = limiteEnKo(e.limit);
    if (ko === null) {
      ajouter(
        'entree_incomplete',
        `${CHEMIN_BUDGETS} — l'entrée \`${e.name ?? '?'}\` n'a pas de \`limit\` lisible (\`${String(e.limit)}\`). ` +
          `\`pnpm perf:budgets --rendre\` l'écrit pour toi.`
      );
    } else if (ko > seuils.plafondKoGz) {
      ajouter(
        'plafond_relache',
        `${CHEMIN_BUDGETS} — l'entrée \`${e.name ?? '?'}\` porte \`${e.limit}\`, au-dessus du plafond dérivé ` +
          `de ${EXIGENCE} (${seuils.plafondKoGz} KB gz). Un budget qu'on ouvre pour laisser passer un import ` +
          `n'est plus un budget.`
      );
    } else if (ko < seuils.plafondKoGz) {
      ajouter(
        'cliquet_sous_le_plafond',
        `${CHEMIN_BUDGETS} — l'entrée \`${e.name ?? '?'}\` porte \`${e.limit}\`, sous le plafond dérivé ` +
          `(${seuils.plafondKoGz} KB gz). ${EXIGENCE} : « aucun cliquet n'est posé sous la mesure courante ». ` +
          `Le plafond n'est pas un champ à remplir — il se régénère par \`pnpm perf:budgets --rendre\`.`
      );
    }
  }

  // (3) le laboratoire LHCI : les trois seuils, bloquants, sur le profil de l'exigence
  const assertions = (lhrc.ci?.assert?.assertions ?? {}) as Record<string, unknown>;
  const attendus: { audit: string; valeur: number }[] = [
    { audit: AUDIT_LCP, valeur: seuils.lcpMs },
    { audit: AUDIT_CLS, valeur: seuils.cls },
    { audit: AUDIT_INP, valeur: seuils.inpMs },
  ];
  for (const { audit, valeur } of attendus) {
    const a = assertions[audit];
    if (a === undefined) {
      ajouter(
        'seuil_absent',
        `${CHEMIN_LIGHTHOUSERC} — aucune assertion sur \`${audit}\`. ${EXIGENCE} la nomme : une métrique ` +
          `sans assertion est une promesse de budget sans gate qui la mesure.`
      );
      continue;
    }
    const [niveau, options] = Array.isArray(a)
      ? (a as [unknown, { maxNumericValue?: number }])
      : [a, {}];
    if (niveau !== NIVEAU_BLOQUANT) {
      ajouter(
        'lhci_non_bloquant',
        `${CHEMIN_LIGHTHOUSERC} — \`${audit}\` est en \`${String(niveau)}\`, pas en \`${NIVEAU_BLOQUANT}\`. ` +
          `${EXIGENCE} dit « bloquants dès la première route livrée » : une assertion qui n'échoue pas ` +
          `laisse la PR verte et le budget dépassé.`
      );
    }
    if (options?.maxNumericValue !== valeur) {
      ajouter(
        'seuil_divergent',
        `${CHEMIN_LIGHTHOUSERC} — \`${audit}\` assert ${String(options?.maxNumericValue)} là où ${EXIGENCE} ` +
          `dit ${valeur}. Les seuils ne se retapent pas : \`pnpm perf:budgets --rendre\`.`
      );
    }
  }
  const formFactor = lhrc.ci?.collect?.settings?.formFactor;
  if (formFactor !== seuils.profil) {
    ajouter(
      'lhci_hors_mobile',
      `${CHEMIN_LIGHTHOUSERC} — le profil de laboratoire est \`${String(formFactor)}\` alors que ${EXIGENCE} ` +
        `dit « lab ${seuils.profil} ». Mesurer sur l'autre profil, c'est garder une autre exigence que la sienne.`
    );
  }

  // (4) le rendu sur le disque est bien celui de la source
  const rendu = rendreLighthouserc(seuils);
  if (vue.lighthouserc !== rendu) {
    ajouter(
      'lighthouserc_perime',
      `${CHEMIN_LIGHTHOUSERC} diffère de son rendu depuis ${EXIGENCE}. Ce fichier est DÉRIVÉ : ` +
        `\`pnpm perf:budgets --rendre\`. Deux copies divergent toujours, et c'est celle qui est lue ` +
        `qui n'a pas été corrigée (RM-01).`
    );
  }

  // (5) « bloquants » : une étape muselée ne garde rien (LEC-13)
  for (const bloc of etapes(vue.ci)) {
    if (!/pnpm\s+perf:/.test(bloc)) continue;
    if (/continue-on-error\s*:\s*true/.test(bloc)) {
      ajouter(
        'etape_ci_muselee',
        `${CHEMIN_CI} — une étape appelle les budgets en \`continue-on-error: true\`. Un job qui ne bloque ` +
          `rien ne garde rien : sur le dépôt voisin, toutes les gates PR de budget le portent, et aucune PR ` +
          `qui alourdit le bundle n'y rougit.`
      );
    }
  }

  return fautes;
}

// ── les vues ──────────────────────────────────────────────────────────────────────────────────

/** Tous les fichiers sous `src/` — la liste que `routesDeLEspace` juge. */
function fichiersDeSrc(racine = 'src'): string[] {
  if (!existsSync(racine)) return [];
  const out: string[] = [];
  for (const e of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, e.name).split('\\').join('/');
    if (e.isDirectory()) out.push(...fichiersDeSrc(chemin));
    else out.push(chemin);
  }
  return out;
}

function lireVue(): Vue {
  for (const c of [CHEMIN_BUDGETS, CHEMIN_LIGHTHOUSERC, CHEMIN_REGISTRE]) {
    if (!existsSync(c)) {
      console.error(
        `❌ perf:budgets — ${c} est introuvable : les budgets ne peuvent pas être contrôlés.`
      );
      process.exit(1);
    }
  }
  return {
    budgets: readFileSync(CHEMIN_BUDGETS, 'utf8'),
    lighthouserc: readFileSync(CHEMIN_LIGHTHOUSERC, 'utf8'),
    registre: texteDeLExigence(readFileSync(CHEMIN_REGISTRE, 'utf8')),
    fichiers: fichiersDeSrc(),
    ci: existsSync(CHEMIN_CI) ? readFileSync(CHEMIN_CI, 'utf8') : '',
  };
}

/**
 * L'univers de FIXTURE : un dépôt feint, conforme, sur lequel `--prove` injecte ses défauts.
 *
 * La seule chose qu'il emprunte au dépôt réel est le TEXTE de REQ-GOV-028 — et c'est exprès :
 * ce texte est la SOURCE des seuils, le recopier ici en ferait une seconde source (RM-01). Tout
 * le reste — les fichiers, la CI, les budgets — est feint, pour que la preuve ne verdisse ni ne
 * rougisse au gré de l'état du disque (RM-11).
 */
export function vueConforme(): Vue {
  const seuils = seuilsDepuisRegistre(texteDeLExigence(readFileSync(CHEMIN_REGISTRE, 'utf8')));
  const budgets = `${JSON.stringify({ '//': ['fixture de preuve'], sizeLimit: [] }, null, 2)}\n`;
  return {
    budgets,
    lighthouserc: rendreLighthouserc(seuils),
    registre: texteDeLExigence(readFileSync(CHEMIN_REGISTRE, 'utf8')),
    fichiers: [],
    ci: 'jobs:\n  gate-a:\n    steps:\n      - run: pnpm gov:publication\n',
  };
}

// ── mode --rendre / --verifier ────────────────────────────────────────────────────────────────

function rendreOuVerifier(verifier: boolean): number {
  const seuils = seuilsDepuisRegistre(texteDeLExigence(readFileSync(CHEMIN_REGISTRE, 'utf8')));
  const attenduLhrc = rendreLighthouserc(seuils);
  const attenduBudgets = rendreBudgets(readFileSync(CHEMIN_BUDGETS, 'utf8'), seuils);
  const surDisqueLhrc = existsSync(CHEMIN_LIGHTHOUSERC)
    ? readFileSync(CHEMIN_LIGHTHOUSERC, 'utf8')
    : '';
  const surDisqueBudgets = readFileSync(CHEMIN_BUDGETS, 'utf8');

  if (verifier) {
    const ecarts = [
      surDisqueLhrc === attenduLhrc ? null : CHEMIN_LIGHTHOUSERC,
      surDisqueBudgets === attenduBudgets ? null : CHEMIN_BUDGETS,
    ].filter((x): x is string => x !== null);
    if (ecarts.length > 0) {
      console.error(
        `❌ perf:budgets --verifier — le disque diffère du rendu : ${ecarts.join(', ')}.`
      );
      console.error('   Ces fichiers sont DÉRIVÉS de REQ-GOV-028 : `pnpm perf:budgets --rendre`.');
      return 1;
    }
    console.log(
      `✅ perf:budgets --verifier — ${CHEMIN_LIGHTHOUSERC} et les \`limit\` de ${CHEMIN_BUDGETS} sont bien ` +
        `le rendu de ${EXIGENCE}.`
    );
    return 0;
  }

  writeFileSync(CHEMIN_LIGHTHOUSERC, attenduLhrc, 'utf8');
  writeFileSync(CHEMIN_BUDGETS, attenduBudgets, 'utf8');
  console.log(
    `✅ perf:budgets --rendre — ${CHEMIN_LIGHTHOUSERC} et les \`limit\` de ${CHEMIN_BUDGETS} régénérés`
  );
  console.log(
    `   depuis ${EXIGENCE} : ${seuils.plafondKoGz} KB gz par route, LCP ${seuils.lcpMs} ms, CLS ${seuils.cls}, ` +
      `INP ${seuils.inpMs} ms, lab ${seuils.profil}.`
  );
  return 0;
}

// ── mode --prove ──────────────────────────────────────────────────────────────────────────────

function prouver(): number {
  const vue = vueConforme();

  const base = controler(vue);
  if (base.length > 0) {
    console.error(
      `❌ La preuve part d'un univers de fixture DÉJÀ fautif (${base.length}) — corrige d'abord :`
    );
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    return 1;
  }

  const routeFeinte = `${RACINE_ESPACE}/mes-entreprises/page.tsx`;
  const entreeJuste = {
    name: '/mes-entreprises',
    path: '.next/static/chunks/app/(espace)/mes-entreprises/**/*.js',
    limit: `${seuilsDepuisRegistre(vue.registre).plafondKoGz} KB`,
    gzip: true,
  };
  const avecEntree = (v: Vue, entree: Record<string, unknown>): Vue => {
    const b = JSON.parse(v.budgets) as { sizeLimit: unknown[] };
    b.sizeLimit.push(entree);
    return { ...v, budgets: JSON.stringify(b, null, 2) };
  };
  const muterLhrc = (v: Vue, muter: (c: Record<string, any>) => void): Vue => {
    const c = JSON.parse(v.lighthouserc) as Record<string, any>;
    muter(c);
    return { ...v, lighthouserc: `${JSON.stringify(c, null, 2)}\n` };
  };

  /**
   * LES CONTRE-TÉMOINS D'ABORD. Une garde qui rougit toujours se « prouve » avec n'importe quel
   * témoin, et finit désarmée par celui qu'elle bloque pour rien (LEC-13, RM-02).
   */
  const CONTRE_TEMOINS: { quoi: string; vue: Vue }[] = [
    { quoi: 'un dépôt sans aucune route (l’état d’aujourd’hui)', vue },
    {
      quoi: 'une route budgétée au plafond dérivé',
      vue: avecEntree({ ...vue, fichiers: [routeFeinte] }, entreeJuste),
    },
    {
      quoi: 'un layout, un composant et un dossier privé — qui ne sont pas des routes',
      vue: {
        ...vue,
        fichiers: [
          `${RACINE_ESPACE}/layout.tsx`,
          `${RACINE_ESPACE}/_composants/apercu/page.tsx`,
          `${RACINE_ESPACE}/mes-entreprises/composants/ligne.tsx`,
        ],
      },
    },
    {
      quoi: 'une route de la console — hors du périmètre de l’exigence',
      vue: { ...vue, fichiers: ['src/app/(console)/clients/page.tsx'] },
    },
    {
      quoi: 'une étape de CI qui appelle les budgets SANS `continue-on-error`',
      vue: { ...vue, ci: `${vue.ci}      - name: Budgets\n        run: pnpm perf:budgets\n` },
    },
    {
      quoi: 'une étape de CI muselée qui ne parle pas des budgets',
      vue: {
        ...vue,
        ci: `${vue.ci}      - name: Autre chose\n        run: pnpm gov:etat\n        continue-on-error: true\n`,
      },
    },
  ];
  const fauxPositifs = CONTRE_TEMOINS.filter((c) => controler(c.vue).length > 0);
  if (fauxPositifs.length > 0) {
    console.error(`❌ Faux positif : ${fauxPositifs.length} cas LÉGITIME(S) rougi(s) :`);
    for (const c of fauxPositifs) {
      console.error(
        `   ${c.quoi} — ${controler(c.vue)
          .map((f) => f.famille)
          .join(', ')}`
      );
    }
    console.error('   Une garde trop large ne garde pas mieux : elle apprend à être contournée.');
    return 1;
  }

  const TEMOINS: { famille: string; defaut: () => Vue }[] = [
    { famille: 'route_sans_budget', defaut: () => ({ ...vue, fichiers: [routeFeinte] }) },
    { famille: 'budget_orphelin', defaut: () => avecEntree(vue, entreeJuste) },
    {
      famille: 'entree_incomplete',
      defaut: () =>
        avecEntree(
          { ...vue, fichiers: [routeFeinte] },
          { name: '/mes-entreprises', limit: entreeJuste.limit }
        ),
    },
    {
      famille: 'plafond_relache',
      defaut: () =>
        avecEntree({ ...vue, fichiers: [routeFeinte] }, { ...entreeJuste, limit: '92 KB' }),
    },
    {
      famille: 'cliquet_sous_le_plafond',
      defaut: () =>
        avecEntree({ ...vue, fichiers: [routeFeinte] }, { ...entreeJuste, limit: '61 KB' }),
    },
    {
      famille: 'seuil_divergent',
      defaut: () =>
        muterLhrc(vue, (c) => {
          c.ci.assert.assertions[AUDIT_LCP][1].maxNumericValue = 2500;
        }),
    },
    {
      famille: 'seuil_absent',
      defaut: () =>
        muterLhrc(vue, (c) => {
          delete c.ci.assert.assertions[AUDIT_INP];
        }),
    },
    {
      famille: 'lhci_non_bloquant',
      defaut: () =>
        muterLhrc(vue, (c) => {
          c.ci.assert.assertions[AUDIT_CLS][0] = 'warn';
        }),
    },
    {
      famille: 'lhci_hors_mobile',
      defaut: () =>
        muterLhrc(vue, (c) => {
          c.ci.collect.settings.formFactor = 'desktop';
        }),
    },
    {
      famille: 'lighthouserc_perime',
      defaut: () =>
        muterLhrc(vue, (c) => {
          c.ci.collect.numberOfRuns = 1;
        }),
    },
    {
      famille: 'etape_ci_muselee',
      defaut: () => ({
        ...vue,
        ci: `${vue.ci}      - name: Budgets\n        run: pnpm perf:budgets\n        continue-on-error: true\n`,
      }),
    },
    { famille: 'source_illisible', defaut: () => ({ ...vue, budgets: '{ pas du JSON' }) },
  ];

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut());
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s), familles : ${[...new Set(f.map((x) => x.famille))].join(', ') || 'aucune'}). ` +
          `Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      return 1;
    }
    prouvees.add(t.famille);
  }
  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}.`);
    return 1;
  }

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => `• ${f}`).join('\n   ')}`);
  console.log(
    `   ${CONTRE_TEMOINS.length} contre-témoins restent verts, dont la route budgétée et le dépôt sans route.`
  );
  return 0;
}

// ── mode normal ───────────────────────────────────────────────────────────────────────────────

function controlerLeDepot(): number {
  const vue = lireVue();
  const routes = routesDeLEspace(vue.fichiers);
  const fautes = controler(vue);

  if (fautes.length > 0) {
    console.error(
      `❌ perf:budgets — ${fautes.length} défaut(s) sur ${routes.length} route(s) balayée(s) :`
    );
    const parFamille = new Map<string, Faute[]>();
    for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
    for (const [famille, liste] of parFamille) {
      console.error(`\n   ── ${famille} (${liste.length})`);
      liste.forEach((f) => console.error(`      ${f.message}`));
    }
    return 1;
  }

  const entrees = (JSON.parse(vue.budgets) as Budgets).sizeLimit ?? [];
  console.log(
    `✅ perf:budgets — ${routes.length} route(s) de l’espace balayée(s) sous \`${RACINE_ESPACE}\`, ` +
      `${entrees.length} entrée(s) \`size-limit\`.`
  );
  if (routes.length === 0) {
    // Le piège de `check-zod` chez le voisin : sortir 0 sur un répertoire absent, en silence.
    // Ici on le DIT, et on dit par quoi le vérifier.
    console.log(
      `   ⚠ ZÉRO ROUTE : ce vert ne juge AUCUNE route — il dit seulement que les budgets sont posés ` +
        `et cohérents. \`${RACINE_ESPACE}\` n'existe pas encore (phase -1). Preuve qu'elle rougirait ` +
        `sur une route sans budget : \`pnpm perf:budgets --prove\`.`
    );
  }
  const seuils = seuilsDepuisRegistre(vue.registre);
  console.log(
    `   Dérivé de ${EXIGENCE} : ${seuils.plafondKoGz} KB gz par route · LCP ${seuils.lcpMs} ms · ` +
      `CLS ${seuils.cls} · INP ${seuils.inpMs} ms · lab ${seuils.profil}, 3 assertions en \`${NIVEAU_BLOQUANT}\`.`
  );
  if (/pnpm\s+perf:budgets/.test(vue.ci)) {
    console.log(`   Elle est appelée par ${CHEMIN_CI}, sans \`continue-on-error\`.`);
  } else {
    console.log(
      `   ⚠ Elle n’est appelée par AUCUNE étape de ${CHEMIN_CI} : posée mais pas encore armée. ` +
        `L’étape à ajouter est dans le rendu de GOV-019, et elle ne porte pas \`continue-on-error\`.`
    );
  }
  return 0;
}

// ── ligne de commande ─────────────────────────────────────────────────────────────────────────
// Gardée : ce module est IMPORTÉ par son test. Sans ce test d'entrée, l'import déclencherait le
// contrôle et son `process.exit`, et la suite mourrait au chargement — vu le 2026-09-05,
// « Error: process.exit unexpectedly called with "0" », zéro test exécuté.
const APPELE_DIRECTEMENT = /perf-budgets\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const rendre = process.argv.includes('--rendre');
  const verifier = process.argv.includes('--verifier');
  if (rendre || verifier) process.exit(rendreOuVerifier(verifier));
  else if (process.argv.includes('--prove')) process.exit(prouver());
  else process.exit(controlerLeDepot());
}
