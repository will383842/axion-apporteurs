/**
 * jur-date-contact-inerte.ts — `dateContact` ne sert qu'à l'affichage de la fiche prospect et au
 * contrôle de sincérité humain (JUR-T30, REQ-JUR-040). Registre : `jur:date-contact-inerte`.
 *
 * USAGE : pnpm jur:date-contact-inerte          juge src/ du dépôt ; sort 1 sur faute
 *         pnpm jur:date-contact-inerte:prove    un témoin par famille, des contre-témoins verts
 *
 * POURQUOI. `dateContact` est la SEULE donnée du contrat d'où un rythme d'activité de l'apporteur
 * peut être reconstitué : quand il prospecte, à quel rythme, quels jours. Un apporteur indépendant
 * organise son activité librement (art. 2.7 du contrat) ; un produit qui lirait ce rythme pour le
 * restituer, le comparer ou s'en servir comme déclencheur constituerait le fait d'un contrôle de son
 * activité, et le juge apprécie des faits. Le signal « nocturne » a prouvé que le produit savait
 * l'exploiter : cette garde ferme la porte là où la donnée se lit.
 *
 * CE QU'ELLE LIT (arbre syntaxique TypeScript) : dans tout fichier suivi de `src/` (.ts, .tsx), chaque
 * identifiant `dateContact` et chaque chaîne qui nomme `dateContact` ou la colonne `date_contact`.
 *
 * TROIS FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `lecture_hors_liste`     `dateContact` lu ou nommé hors de la LISTE FERMÉE `LIEUX_PERMIS`
 *   `agregation_temporelle`  même dans un lieu permis : un groupement (`groupBy`), une extraction
 *                            d'heure ou de jour (`getHours`, `getDay`…) ou une troncature SQL
 *                            (`date_trunc`, `extract`, `to_char`) qui porte sur `dateContact`
 *   `source_illisible`       un fichier que TypeScript ne lit pas sans diagnostic
 *
 * LIMITES DÉCLARÉES. Elle lit des NOMS : une valeur copiée sous un autre nom, puis agrégée ailleurs,
 * lui échappe ; la relecture et la règle d'accès (RM-05) tiennent ce cas. Elle ne juge ni les tests,
 * ni les migrations, ni le schéma Prisma, où la colonne est déclarée.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLesLectures` est pure, les fichiers sont INJECTÉS.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

export const ID_REGISTRE = 'jur:date-contact-inerte';

export const FAMILLES = [
  'lecture_hors_liste',
  'agregation_temporelle',
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

/**
 * LA LISTE FERMÉE des lieux où `dateContact` se lit, chacun avec sa raison. Un lieu neuf n'y entre
 * que par décision, avec la juriste.
 */
export const LIEUX_PERMIS: Readonly<Record<string, string>> = {
  'src/server/acces/for-apporteur.ts':
    "l'affichage de la fiche prospect : la colonne servie à l'apporteur, sur SON dépôt",
  'src/server/anomalie/sincerite.ts': 'le contrôle de sincérité HUMAIN, sur un dépôt signalé',
  'src/server/depot/deposer.ts': "l'ÉCRITURE de la date saisie par l'apporteur au dépôt",
};

/** Le périmètre : le code de l'application, hors des tests. */
const PERIMETRE = /^src\/.+\.tsx?$/;
const EST_UN_TEST = /\.(spec|test)\.tsx?$/;
export const estJuge = (chemin: string): boolean =>
  PERIMETRE.test(chemin) && !EST_UN_TEST.test(chemin);

/** Une chaîne qui nomme la donnée : le champ du modèle ou la colonne de la base. */
const NOMME_LA_DONNEE = /\bdateContact\b|\bdate_contact\b/;
/** Les appels qui découpent ou groupent une date dans le temps. */
const APPELS_TEMPORELS: ReadonlySet<string> = new Set([
  'groupBy',
  'getHours',
  'getUTCHours',
  'getDay',
  'getUTCDay',
  'getMinutes',
  'getUTCMinutes',
]);
/** Les fonctions SQL qui tronquent ou extraient une partie d'une date. */
const SQL_TEMPOREL = /\b(date_trunc|extract|to_char|date_part)\b/i;

/** La première ligne d'un nœud, pour le message. */
const ligneDe = (f: ts.SourceFile, n: ts.Node): number =>
  f.getLineAndCharacterOfPosition(n.getStart(f)).line + 1;

/** Le nom d'un appel : `a.groupBy(…)` → `groupBy`, `getHours()` → `getHours`. */
function nomDeLAppel(c: ts.CallExpression): string | null {
  const e = c.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isIdentifier(e)) return e.text;
  return null;
}

/** Le texte d'une chaîne littérale, simple ou gabarit, ou `null`. */
function texteDe(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) {
    return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
  }
  return null;
}

/** Les lieux d'un fichier où la donnée est nommée : identifiants et chaînes. */
function mentions(f: ts.SourceFile): ts.Node[] {
  const vues: ts.Node[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === 'dateContact') vues.push(n);
    else {
      const t = texteDe(n);
      if (t !== null && NOMME_LA_DONNEE.test(t)) {
        vues.push(n);
        return;
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(f);
  return vues;
}

/** Les découpages temporels qui portent sur la donnée, dans un fichier. */
function agregations(f: ts.SourceFile): ts.Node[] {
  const vues: ts.Node[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const nom = nomDeLAppel(n);
      const texte = n.getText(f);
      if (nom !== null && APPELS_TEMPORELS.has(nom) && NOMME_LA_DONNEE.test(texte)) vues.push(n);
    }
    const t = texteDe(n);
    if (t !== null && NOMME_LA_DONNEE.test(t) && SQL_TEMPOREL.test(t)) vues.push(n);
    ts.forEachChild(n, visiter);
  };
  visiter(f);
  return vues;
}

/** Le juge, PUR : les fichiers sont injectés. */
export function jugerLesLectures(fichiers: readonly FichierVu[]): {
  fautes: Faute[];
  fichiers: number;
  mentions: number;
} {
  const fautes: Faute[] = [];
  let compte = 0;
  for (const { chemin, source } of fichiers) {
    const f = ts.createSourceFile(
      chemin,
      source,
      ts.ScriptTarget.Latest,
      true,
      // Le mode suit l'extension : un `.ts` lu en TSX prend `<T>` pour une balise.
      chemin.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const diagnostics = (f as unknown as { parseDiagnostics?: readonly unknown[] })
      .parseDiagnostics;
    if (diagnostics !== undefined && diagnostics.length > 0) {
      fautes.push({ famille: 'source_illisible', message: `${chemin} : TypeScript ne le lit pas` });
      continue;
    }
    const vues = mentions(f);
    compte += vues.length;
    if (vues.length > 0 && LIEUX_PERMIS[chemin] === undefined) {
      fautes.push({
        famille: 'lecture_hors_liste',
        message:
          `${chemin}:${ligneDe(f, vues[0]!)} — lit dateContact hors de la liste fermée ` +
          `(${Object.keys(LIEUX_PERMIS).length} lieux permis) : la date du contact ne sert qu'à ` +
          `l'affichage de la fiche prospect et au contrôle de sincérité humain.`,
      });
    }
    for (const a of agregations(f)) {
      fautes.push({
        famille: 'agregation_temporelle',
        message:
          `${chemin}:${ligneDe(f, a)} — groupe ou découpe dateContact dans le temps : ` +
          `c'est reconstituer un rythme d'activité de l'apporteur.`,
      });
    }
  }
  return { fautes, fichiers: fichiers.length, mentions: compte };
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────────

const HORS = (source: string): FichierVu => ({
  chemin: 'src/server/console/statistiques.ts',
  source,
});
const PERMIS = (source: string): FichierVu => ({
  chemin: 'src/server/anomalie/sincerite.ts',
  source,
});

const TEMOINS: { famille: Famille; quoi: string; fichiers: FichierVu[] }[] = [
  {
    famille: 'lecture_hors_liste',
    quoi: 'la fixtureRouge du registre : un groupBy par tranche horaire, dans la console',
    fichiers: [
      HORS(
        "export const r = (p: P) => p.attribution.groupBy({ by: ['dateContact'], _count: true });"
      ),
    ],
  },
  {
    famille: 'lecture_hors_liste',
    quoi: 'la colonne nommée dans une requête SQL, hors de la liste',
    fichiers: [HORS('export const q = `SELECT date_contact FROM attributions`;')],
  },
  {
    famille: 'agregation_temporelle',
    quoi: 'même dans un lieu permis, l’heure extraite de la date du contact',
    fichiers: [PERMIS('export const h = (a: A) => a.dateContact.getHours();')],
  },
  {
    famille: 'agregation_temporelle',
    quoi: 'même dans un lieu permis, une troncature SQL de la colonne',
    fichiers: [
      PERMIS("export const q = `SELECT date_trunc('hour', date_contact) FROM attributions`;"),
    ],
  },
  {
    famille: 'source_illisible',
    quoi: 'un fichier tronqué',
    fichiers: [HORS('export const a = {')],
  },
];
const CONTRE_TEMOINS: { quoi: string; fichiers: FichierVu[] }[] = [
  {
    quoi: 'la date du contact LUE telle quelle dans un lieu permis',
    fichiers: [PERMIS("export const champs = ['dateContact', 'siren'];")],
  },
  {
    quoi: 'une autre date groupée hors de la liste',
    fichiers: [HORS("export const r = (p: P) => p.x.groupBy({ by: ['creeAt'] });")],
  },
  {
    quoi: 'un test, hors du périmètre',
    fichiers: [
      {
        chemin: 'src/server/depot/deposer.spec.ts',
        source: 'export const d = { dateContact: 1 };',
      },
    ].filter((f) => estJuge(f.chemin)),
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const rougit = jugerLesLectures(t.fichiers).fautes.some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = jugerLesLectures(c.fichiers).fautes;
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
  const j = jugerLesLectures(
    chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }))
  );
  const compte = `${j.fichiers} fichier(s) de src/ lu(s), ${j.mentions} mention(s) de dateContact`;
  if (j.fautes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${ID_REGISTRE} — ${j.fautes.length} faute(s) ; ${compte} :`,
        ...j.fautes.map((f) => `   [${f.famille}] ${f.message}`),
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ ${ID_REGISTRE} — ${compte} : la date du contact ne se lit que dans ses lieux permis, ` +
        `sans aucun découpage temporel.`,
      `   Que la garde MESURE se prouve par « pnpm ${ID_REGISTRE}:prove ».`,
    ],
  };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]jur-date-contact-inerte(\.ts)?$/.test(
  process.argv[1] ?? ''
);

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
