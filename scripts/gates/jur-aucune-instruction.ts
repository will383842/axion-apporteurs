/**
 * jur-aucune-instruction.ts — rien de ce que l'outil envoie n'est une instruction, et l'activité de
 * l'apporteur ne devient ni un score, ni un indicateur, ni un déclencheur (JUR-T30, REQ-JUR-039).
 * Registre : `jur:aucune-instruction`.
 *
 * USAGE : pnpm jur:aucune-instruction          juge src/ du dépôt et la SSOT du lexique ; sort 1 sur faute
 *         pnpm jur:aucune-instruction:prove    un témoin par famille, des contre-témoins verts
 *
 * POURQUOI. L'apporteur organise librement son activité (art. 2.7 du contrat). Une consigne de
 * méthode, une demande de compte rendu, une relance née de son absence de connexion sont des FAITS
 * qu'un juge apprécie, quoi qu'en dise le contrat. Deux voies les feraient naître, et cette garde les
 * tient toutes deux :
 *   — LES MOTS : ils sont jugés par `gov:lexique`, sur la portée « apporteur » de la SSOT
 *     (`src/domain/lexique/lexique-interdit.ts`). Cette garde n'en recopie AUCUN : elle exige que les
 *     familles `injonction` (la consigne de méthode, la relance) et `compte_rendu` (la demande de
 *     compte rendu) y restent, en portée apporteur ;
 *   — LES DONNÉES : la dernière vue d'une session (`derniereVueAt`), le dernier usage d'un jeton
 *     (`dernierUsageAt`) et leurs équivalents (`lastSeenAt`, `derniereConnexion`) ne se lisent que
 *     dans une LISTE FERMÉE de lieux. La juriste (#840, 6044978580) admet qu'on rende à l'apporteur
 *     l'usage de SES sessions et de SON jeton, pour sa sécurité (RGPD art. 32 et 15), ainsi que
 *     l'authentification et la purge ; tout calcul, tri, filtre, score, message ou relance qui en
 *     partirait, et tout rendu à la console sur un apporteur, est hors de la liste. Les utilisateurs
 *     de la CONSOLE, des salariés, sont hors du champ de REQ-JUR-039 : leurs lieux sont nommés à part.
 *
 * TROIS FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `activite_hors_liste`       une donnée d'activité nommée hors des deux listes fermées
 *   `famille_lexicale_absente`  `injonction` ou `compte_rendu` absente de la SSOT, ou hors de la
 *                               portée apporteur
 *   `source_illisible`          un fichier que TypeScript ne lit pas sans diagnostic
 *
 * LIMITES DÉCLARÉES. Elle lit des NOMS : une donnée copiée sous un autre nom lui échappe, comme un
 * libellé qui présenterait l'usage d'un appareil comme une activité ; la relecture les tient. Elle
 * ne juge ni les tests, ni les migrations, ni le schéma Prisma.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLesDonnees` et `jugerLeLexique` sont pures, tout est INJECTÉ.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { LEXIQUE_INTERDIT } from '../../src/domain/lexique/lexique-interdit';

export const ID_REGISTRE = 'jur:aucune-instruction';

export const FAMILLES = [
  'activite_hors_liste',
  'famille_lexicale_absente',
  'source_illisible',
] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}
export interface FichierVu {
  readonly chemin: string;
  readonly source: string;
}

/** Les noms d'une donnée d'activité : camelCase du code, snake_case de la base. */
const DONNEES_D_ACTIVITE: ReadonlySet<string> = new Set([
  'derniereVueAt',
  'dernierUsageAt',
  'lastSeenAt',
  'derniereConnexion',
  'derniereConnexionAt',
]);
const DONNEE_EN_TEXTE =
  /\b(derniere_vue_at|dernier_usage_at|last_seen_at|derniere_connexion(_at)?|derniereVueAt|dernierUsageAt|lastSeenAt)\b/;

/**
 * LA LISTE FERMÉE, côté APPORTEUR (juriste, #840 6044978580) : l'usage de SES sessions et de SON
 * jeton, rendu à lui seul pour sa sécurité ; l'authentification ; la purge.
 */
export const LIEUX_APPORTEUR: Readonly<Record<string, string>> = {
  'src/server/acces/for-apporteur.ts':
    '« Mes sessions » et son jeton : l’usage de SES sessions et de SON jeton, rendu à lui seul (SEC-55, SEC-62)',
  'src/domain/apporteur/identifiants.ts': 'la forme de son jeton de dépôt, et son dernier usage',
  'src/server/auth/session.ts': 'la tenue de ses sessions : la dernière vue posée, sa liste rendue',
  'src/server/auth/appareil.ts': 'la reconnaissance de ses appareils (SEC-55)',
  'src/server/auth/lien-magique.ts': "l'ouverture de sa session",
  'src/server/taches/purger-appareils.ts': 'la purge des appareils anciens',
};

/** LA LISTE FERMÉE, côté CONSOLE : des salariés, hors du champ de REQ-JUR-039 (juriste). */
export const LIEUX_CONSOLE: Readonly<Record<string, string>> = {
  'src/server/roles/require-role.ts': "l'inactivité de session d'un utilisateur de la console",
  'src/app/(console)/console/utilisateurs/page.tsx':
    'la dernière connexion d’un utilisateur de la console, dans leur liste',
  'src/content/micro-copy/console/utilisateurs.ts': 'le libellé de cette colonne',
};

const PERIMETRE = /^src\/.+\.tsx?$/;
const EST_UN_TEST = /\.(spec|test)\.tsx?$/;
export const estJuge = (chemin: string): boolean =>
  PERIMETRE.test(chemin) && !EST_UN_TEST.test(chemin);

/** Le texte d'une chaîne littérale, simple ou gabarit, ou `null`. */
function texteDe(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) {
    return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
  }
  return null;
}

/** La première mention d'une donnée d'activité dans un fichier, ou `null`. */
function premiereMention(f: ts.SourceFile): ts.Node | null {
  let vue: ts.Node | null = null;
  const visiter = (n: ts.Node): void => {
    if (vue !== null) return;
    if (ts.isIdentifier(n) && DONNEES_D_ACTIVITE.has(n.text)) {
      vue = n;
      return;
    }
    const t = texteDe(n);
    if (t !== null && DONNEE_EN_TEXTE.test(t)) {
      vue = n;
      return;
    }
    ts.forEachChild(n, visiter);
  };
  visiter(f);
  return vue;
}

/** Le juge des données, PUR : les fichiers sont injectés. */
export function jugerLesDonnees(fichiers: readonly FichierVu[]): {
  fautes: Faute[];
  fichiers: number;
  lieux: number;
} {
  const fautes: Faute[] = [];
  let lieux = 0;
  for (const { chemin, source } of fichiers) {
    const f = ts.createSourceFile(
      chemin,
      source,
      ts.ScriptTarget.Latest,
      true,
      chemin.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const diagnostics = (f as unknown as { parseDiagnostics?: readonly unknown[] })
      .parseDiagnostics;
    if (diagnostics !== undefined && diagnostics.length > 0) {
      fautes.push({ famille: 'source_illisible', message: `${chemin} : TypeScript ne le lit pas` });
      continue;
    }
    const vue = premiereMention(f);
    if (vue === null) continue;
    lieux += 1;
    if (LIEUX_APPORTEUR[chemin] !== undefined || LIEUX_CONSOLE[chemin] !== undefined) continue;
    const ligne = f.getLineAndCharacterOfPosition(vue.getStart(f)).line + 1;
    fautes.push({
      famille: 'activite_hors_liste',
      message:
        `${chemin}:${ligne} — une donnée d'activité (dernière vue, dernier usage, dernière connexion) ` +
        `hors des listes fermées : elle n'entre dans aucun score, indicateur, tri, filtre, message ` +
        `ni relance (art. 2.7, REQ-JUR-039).`,
    });
  }
  return { fautes, fichiers: fichiers.length, lieux };
}

/** Les familles de la SSOT que cette garde exige, en portée apporteur. */
export const FAMILLES_EXIGEES = ['injonction', 'compte_rendu'] as const;

/** Le juge du lexique, PUR : la SSOT est injectée. */
export function jugerLeLexique(
  lexique: readonly { readonly nom: string; readonly portee: string }[]
): Faute[] {
  return FAMILLES_EXIGEES.filter(
    (nom) => !lexique.some((f) => f.nom === nom && f.portee === 'apporteur')
  ).map((nom) => ({
    famille: 'famille_lexicale_absente' as const,
    message:
      `la famille « ${nom} » manque à la SSOT du lexique, ou n'y est pas en portée apporteur : ` +
      `gov:lexique ne refuserait plus ${nom === 'injonction' ? 'la consigne de méthode ni la relance' : 'la demande de compte rendu'}.`,
  }));
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────────

const HORS = (source: string): FichierVu => ({ chemin: 'src/server/taches/relancer.ts', source });
const LEXIQUE_COMPLET = [
  { nom: 'injonction', portee: 'apporteur' },
  { nom: 'compte_rendu', portee: 'apporteur' },
];

const TEMOINS: {
  famille: Famille;
  quoi: string;
  juge: () => Faute[];
}[] = [
  {
    famille: 'activite_hors_liste',
    quoi: 'la fixtureRouge du registre : une relance née de la dernière connexion',
    juge: () =>
      jugerLesDonnees([
        HORS(
          'export const aRelancer = (s: S[]) => s.filter((x) => x.derniereVueAt < il_y_a_un_mois);'
        ),
      ]).fautes,
  },
  {
    famille: 'activite_hors_liste',
    quoi: 'un score qui lit le dernier usage du jeton',
    juge: () =>
      jugerLesDonnees([
        {
          chemin: 'src/domain/score/assiduite.ts',
          source: 'export const s = (j: J) => j.dernierUsageAt;',
        },
      ]).fautes,
  },
  {
    famille: 'activite_hors_liste',
    quoi: 'une colonne de la base, en SQL, dans la console sur un apporteur',
    juge: () =>
      jugerLesDonnees([
        {
          chemin: 'src/server/console/apporteurs.ts',
          source: 'export const q = `SELECT derniere_vue_at FROM sessions_espace`;',
        },
      ]).fautes,
  },
  {
    famille: 'famille_lexicale_absente',
    quoi: 'une SSOT sans la famille compte_rendu',
    juge: () => jugerLeLexique([{ nom: 'injonction', portee: 'apporteur' }]),
  },
  {
    famille: 'famille_lexicale_absente',
    quoi: 'une SSOT où l’injonction ne vaut que pour le dépôt',
    juge: () =>
      jugerLeLexique([
        { nom: 'injonction', portee: 'depot' },
        { nom: 'compte_rendu', portee: 'apporteur' },
      ]),
  },
  {
    famille: 'source_illisible',
    quoi: 'un fichier tronqué',
    juge: () => jugerLesDonnees([HORS('export const a = {')]).fautes,
  },
];
const CONTRE_TEMOINS: { quoi: string; juge: () => Faute[] }[] = [
  {
    quoi: 'la dernière vue de SES sessions, rendue à lui seul (« Mes sessions »)',
    juge: () =>
      jugerLesDonnees([
        {
          chemin: 'src/server/acces/for-apporteur.ts',
          source: "export const c = ['id', 'derniereVueAt'];",
        },
      ]).fautes,
  },
  {
    quoi: 'l’inactivité d’un utilisateur de la console, un salarié',
    juge: () =>
      jugerLesDonnees([
        {
          chemin: 'src/server/roles/require-role.ts',
          source: 'export const v = (l: L) => l.derniereVueAt;',
        },
      ]).fautes,
  },
  { quoi: 'la SSOT complète', juge: () => jugerLeLexique(LEXIQUE_COMPLET) },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const rougit = t.juge().some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = c.juge();
    ok &&= fautes.length === 0;
    lignes.push(`${fautes.length === 0 ? '🟢' : '❌ ROUGIT'} contre-témoin : ${c.quoi}`);
  }
  const orphelines = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
  ok &&= orphelines.length === 0;
  for (const f of orphelines) lignes.push(`❌ famille sans témoin : ${f}`);
  lignes.unshift(
    ok
      ? `✅ ${ID_REGISTRE} — ${FAMILLES.length} familles rougissent sur leurs témoins, ` +
          `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
      : `❌ ${ID_REGISTRE} --prove — la preuve échoue :`
  );
  return { code: ok ? 0 : 1, lignes };
}

function juger(): { code: 0 | 1; lignes: string[] } {
  const chemins = fichiersSuivisOuRefus(ID_REGISTRE).filter(estJuge);
  const j = jugerLesDonnees(
    chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }))
  );
  const fautes = [...j.fautes, ...jugerLeLexique(LEXIQUE_INTERDIT)];
  const compte = `${j.fichiers} fichier(s) de src/ lu(s), ${j.lieux} lieu(x) d'une donnée d'activité`;
  if (fautes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${ID_REGISTRE} — ${fautes.length} faute(s) ; ${compte} :`,
        ...fautes.map((f) => `   [${f.famille}] ${f.message}`),
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ ${ID_REGISTRE} — ${compte}, tous dans les listes fermées ; la SSOT porte « injonction » et ` +
        `« compte_rendu » en portée apporteur.`,
      `   Que la garde MESURE se prouve par « pnpm ${ID_REGISTRE}:prove ».`,
    ],
  };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]jur-aucune-instruction(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
