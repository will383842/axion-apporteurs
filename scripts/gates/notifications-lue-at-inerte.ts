/**
 * notifications-lue-at-inerte.ts — `notifications:lue-at-inerte` (UX-P1-10, REQ-JUR-039, REQ-UX-016).
 *
 * USAGE : npx tsx scripts/gates/notifications-lue-at-inerte.ts           (juge le dépôt)
 *         npx tsx scripts/gates/notifications-lue-at-inerte.ts --prove   (témoins INJECTÉS)
 *
 * CE QU'ELLE TIENT. `notifications_espace.lue_at` dit qu'un apporteur a ouvert une notification de son
 * espace. AUCUN délai ne s'y appuie : un délai court de `courriels_envoyes.envoye_at` (REQ-UX-016).
 * Faire dépendre un droit de la lecture serait faire de l'inactivité de l'apporteur une cause
 * (REQ-JUR-039). La garde lit l'ARBRE SYNTAXIQUE des fichiers suivis de `src/` (un commentaire n'est
 * pas une lecture) et le SQL des migrations :
 *   — `lue_at_lu` : `lueAt` ou `lue_at` nommé dans un fichier de `src/` hors de `LECTEURS_PERMIS` ;
 *   — `forme_non_permise` : nommé dans un fichier permis, sous une autre forme que celle déclarée
 *     (`colonne` : un élément d'une liste de colonnes ; jamais un opérande, un argument, une clé) ;
 *   — `lue_at_en_sql` : `lue_at` dans le SQL d'une migration autre que celle qui crée la colonne ;
 *   — `permission_orpheline` : un fichier permis ne la nomme plus — la permission couvrirait la
 *     lecture suivante ;
 *   — `perimetre_vide` : aucun fichier de `src/` lu.
 *
 * CE QU'ELLE NE FAIT PAS. Une lecture par un détour qu'aucun nom ne trahit (une colonne relue par
 * `select *` puis indexée par une variable) lui échappe : la couche cloisonnée sélectionne colonne
 * par colonne (`CHAMPS_RENDUS`), et c'est la lentille exactitude qui verrait le reste.
 *
 * ÉCHEC FERMÉ. Le périmètre vient de la source unique des fichiers suivis : git muet, rouge.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

export type Faute = { famille: string; message: string };
export type Fichier = { chemin: string; texte: string };
export type Forme = 'colonne';

const NOMS = new Set(['lueAt', 'lue_at']);
export const MIGRATION_QUI_CREE = 'prisma/migrations/20261002001200_ux_p1_10_notifications_espace';

/** Les fichiers de `src/` qui peuvent nommer la colonne, la forme admise, et pourquoi. */
export const LECTEURS_PERMIS: Readonly<Record<string, { forme: Forme; raison: string }>> = {
  'src/server/acces/for-apporteur.ts': {
    forme: 'colonne',
    raison: 'colonne rendue à l’espace (`CHAMPS_RENDUS`) : afficher « lue », jamais calculer',
  },
};

/** Les nœuds qui nomment la colonne : un identifiant, ou une chaîne qui la porte. */
function occurrences(source: ts.SourceFile): ts.Node[] {
  const vus: ts.Node[] = [];
  const visiter = (n: ts.Node): void => {
    if (
      (ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteralLike(n)) &&
      NOMS.has(n.text)
    )
      vus.push(n);
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return vus;
}

const estUneColonne = (n: ts.Node): boolean =>
  ts.isStringLiteralLike(n) && ts.isArrayLiteralExpression(n.parent);

export function fautesDuDepot(src: Fichier[], migrations: Fichier[]): Faute[] {
  const fautes: Faute[] = [];
  // Rien lu : rien n'est jugé, et c'est la seule faute — une permission n'est pas orpheline d'un vide.
  if (src.length === 0) return [{ famille: 'perimetre_vide', message: 'aucun fichier de src/ lu' }];
  const nommant = new Set<string>();
  for (const f of src) {
    const source = ts.createSourceFile(f.chemin, f.texte, ts.ScriptTarget.Latest, true);
    const vus = occurrences(source);
    if (vus.length === 0) continue;
    nommant.add(f.chemin);
    const permis = LECTEURS_PERMIS[f.chemin];
    for (const n of vus) {
      const ligne = source.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      if (permis === undefined)
        fautes.push({
          famille: 'lue_at_lu',
          message: `${f.chemin}:${ligne} nomme la date de lecture d'une notification : aucun délai ni aucun droit ne s'y appuie (REQ-JUR-039) ; un délai court de courriels_envoyes.envoye_at`,
        });
      else if (!estUneColonne(n))
        fautes.push({
          famille: 'forme_non_permise',
          message: `${f.chemin}:${ligne} nomme la date de lecture hors d'une liste de colonnes : seule la forme « ${permis.forme} » y est permise (${permis.raison})`,
        });
    }
  }
  for (const chemin of Object.keys(LECTEURS_PERMIS))
    if (!nommant.has(chemin))
      fautes.push({
        famille: 'permission_orpheline',
        message: `${chemin} est permis et ne nomme plus la date de lecture : retirer la permission`,
      });
  for (const m of migrations) {
    if (m.chemin.startsWith(`${MIGRATION_QUI_CREE}/`)) continue;
    const sql = m.texte.replace(/--[^\n]*/g, '');
    if (/\blue_at\b/i.test(sql))
      fautes.push({
        famille: 'lue_at_en_sql',
        message: `${m.chemin} nomme lue_at : seule la migration qui crée la colonne la nomme ; une vue, un index ou une fonction qui la lirait en ferait une cause`,
      });
  }
  return fautes;
}

const PERMIS = 'src/server/acces/for-apporteur.ts';
const COLONNES = "export const CHAMPS = { notificationEspace: ['id', 'cle', 'lueAt'] };\n";

/** Témoins : chacun DOIT rougir de sa famille, et d'elle seule. */
export const TEMOINS: { quoi: string; src: Fichier[]; sql: Fichier[]; famille: string }[] = [
  {
    quoi: 'un délai calculé depuis la lecture, dans un fichier du domaine',
    src: [
      { chemin: PERMIS, texte: COLONNES },
      {
        chemin: 'src/domain/delais/lecture.ts',
        texte: 'export const fin = (n: { lueAt: Date }) => n.lueAt.getTime() + 1;\n',
      },
    ],
    sql: [],
    famille: 'lue_at_lu',
  },
  {
    quoi: 'la couche cloisonnée qui compare la date de lecture',
    src: [
      {
        chemin: PERMIS,
        texte: COLONNES + 'export const lue = (n: { lueAt: Date | null }) => n.lueAt !== null;\n',
      },
    ],
    sql: [],
    famille: 'forme_non_permise',
  },
  {
    quoi: 'une vue SQL qui lit lue_at dans une migration suivante',
    src: [{ chemin: PERMIS, texte: COLONNES }],
    sql: [
      {
        chemin: 'prisma/migrations/20261231000000_vue/migration.sql',
        texte: 'CREATE VIEW v AS SELECT lue_at FROM notifications_espace;\n',
      },
    ],
    famille: 'lue_at_en_sql',
  },
  {
    quoi: 'une permission qui ne couvre plus rien',
    src: [{ chemin: PERMIS, texte: 'export const CHAMPS = {};\n' }],
    sql: [],
    famille: 'permission_orpheline',
  },
  { quoi: 'aucun fichier lu', src: [], sql: [], famille: 'perimetre_vide' },
];

/** Contre-témoins : chacun DOIT rester vert. */
export const CONTRE_TEMOINS: { quoi: string; src: Fichier[]; sql: Fichier[] }[] = [
  { quoi: 'la colonne rendue par la couche', src: [{ chemin: PERMIS, texte: COLONNES }], sql: [] },
  {
    quoi: 'un commentaire qui nomme la colonne',
    src: [
      { chemin: PERMIS, texte: COLONNES },
      { chemin: 'src/server/x.ts', texte: '// lueAt : jamais un délai\nexport const x = 1;\n' },
    ],
    sql: [],
  },
  {
    quoi: 'la migration qui crée la colonne, et un commentaire SQL ailleurs',
    src: [{ chemin: PERMIS, texte: COLONNES }],
    sql: [
      { chemin: `${MIGRATION_QUI_CREE}/migration.sql`, texte: '"lue_at" TIMESTAMPTZ(3),\n' },
      { chemin: 'prisma/migrations/20261231000000_x/migration.sql', texte: '-- lue_at\n' },
    ],
  },
];

function prouver(): string[] {
  const echecs: string[] = [];
  for (const t of TEMOINS) {
    const familles = [...new Set(fautesDuDepot(t.src, t.sql).map((f) => f.famille))];
    if (familles.length !== 1 || familles[0] !== t.famille)
      echecs.push(`le témoin « ${t.quoi} » rend [${familles.join(', ')}], attendu ${t.famille}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = fautesDuDepot(c.src, c.sql);
    if (fautes.length > 0) echecs.push(`faux positif sur « ${c.quoi} » : ${fautes[0]!.message}`);
  }
  return echecs;
}

function lireLeDepot(): { src: Fichier[]; sql: Fichier[] } {
  const suivis = fichiersSuivisOuRefus('notifications:lue-at-inerte');
  const lire = (chemin: string): Fichier => ({ chemin, texte: readFileSync(chemin, 'utf8') });
  return {
    src: suivis
      .filter((c) => c.startsWith('src/') && /\.(ts|tsx)$/.test(c) && !/\.(spec|test)\./.test(c))
      .map(lire),
    sql: suivis.filter((c) => c.startsWith('prisma/migrations/') && c.endsWith('.sql')).map(lire),
  };
}

const APPELE_DIRECTEMENT = /notifications-lue-at-inerte\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const prouve = process.argv.includes('--prove');
  const depot = prouve ? null : lireLeDepot();
  const fautes = depot === null ? [] : fautesDuDepot(depot.src, depot.sql);
  const echecs = prouve ? prouver() : fautes.map((f) => `[${f.famille}] ${f.message}`);
  if (echecs.length > 0) {
    console.error(`❌ notifications:lue-at-inerte — ${echecs.length} faute(s) :`);
    for (const e of echecs) console.error(`   ${e}`);
    process.exitCode = 1;
  } else if (prouve) {
    console.log(
      `✅ notifications:lue-at-inerte — ${TEMOINS.length} témoins rougissent chacun sur sa seule famille, ${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
    );
  } else {
    console.log(
      `✅ notifications:lue-at-inerte — ${depot!.src.length} fichiers de src/ et ${depot!.sql.length} migrations lus : la date de lecture d'une notification n'est nommée que là où elle est permise (${Object.keys(LECTEURS_PERMIS).join(', ')}), et aucun délai ne s'y appuie.`
    );
  }
}
