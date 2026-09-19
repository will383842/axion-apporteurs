/**
 * rate-famille.ts — la garde de famille des compteurs de débit. (SEC-10, REQ-SEC-016)
 *
 * USAGE : pnpm securite:rate-famille          contrôle le dépôt
 *         pnpm securite:rate-famille:prove    un témoin par famille, des contre-témoins verts
 *
 * CE QU'ELLE EMPÊCHE. Un compteur sous l'un des cinq préfixes qui ne dit pas ce qu'il fait quand
 * le cache tombe laisse le défaut décider — et un défaut ouvert échoue ouvert. Le type exige la
 * conduite ; la garde la revérifie, parce qu'un type se contourne (cast, objet construit, JSON).
 * Elle ne se contente pas de LIRE la déclaration : elle EXÉCUTE chaque compteur contre un cache
 * qui lève, et confronte le verdict rendu à la conduite déclarée.
 *
 * SIX FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `perimetre_vide`         0 compteur au registre, ou 0 fichier de `src/` lu
 *   `conduite_absente`       un compteur sans conduite sur panne valide — le préfixe est nommé
 *   `conduite_trahie`        exécuté contre un cache qui lève, le verdict n'est pas la conduite
 *                            déclarée, ou ne se dit pas en panne — le préfixe est nommé
 *   `prefixe_hors_famille`   un compteur sous un préfixe hors des cinq, ou dont le nom le dément
 *   `prefixe_hors_registre`  une chaîne ou une tête de gabarit de `src/` qui commence par un des
 *                            cinq préfixes, hors du registre — un compteur écrit à côté de lui
 *   `nom_dynamique`          un appel `limiter(` dont le premier argument n'est pas un littéral
 *                            du registre, ou un import qui renomme `limiter`
 *
 * L'analyse passe par le compilateur TypeScript, jamais par une recherche de chaîne : un appel
 * écrit sur deux lignes est un appel. Le périmètre se lit sur le DISQUE : un fichier neuf, pas
 * encore indexé, est lu comme les autres.
 *
 * LIMITES DÉCLARÉES. Un préfixe reconstitué par concaténation (`'mag' + 'ic:'`) et un `limiter`
 * atteint par une variable intermédiaire (`const f = limiter`) échappent à la lecture statique ;
 * le premier n'a de sens qu'en contournement délibéré, le second rougit à la relecture.
 */

import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import {
  COMPTEURS,
  CONDUITES_SUR_PANNE,
  PREFIXES_DE_FAMILLE,
  limiter,
  sujetDepuisEmpreinte,
  type MagasinDeCompteurs,
  type NomDeCompteur,
  type VerdictDeLimite,
} from '../../src/server/securite/rate-limit';

export const CHEMIN_DU_REGISTRE = 'src/server/securite/rate-limit.ts';
export const CHEMIN_DU_POT_DE_MIEL = 'src/server/securite/pot-de-miel.ts';
const RACINE = 'src';

export const FAMILLES = [
  'perimetre_vide',
  'conduite_absente',
  'conduite_trahie',
  'prefixe_hors_famille',
  'prefixe_hors_registre',
  'nom_dynamique',
] as const;
export type Famille = (typeof FAMILLES)[number];

export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}

export interface Fichier {
  readonly chemin: string;
  readonly texte: string;
}

/** Exécute le compteur nommé contre un cache qui lève, et rend son verdict. */
export type Executer = (nom: string) => Promise<VerdictDeLimite>;

export interface Univers {
  readonly registre: Readonly<Record<string, unknown>>;
  readonly fichiers: readonly Fichier[];
  readonly executer: Executer;
}

export interface Releve {
  readonly fautes: readonly Faute[];
  /** Les compteurs DÉCLARÉS ET EXÉCUTÉS en panne, avec la conduite constatée. */
  readonly confrontes: readonly string[];
  readonly fichiersLus: number;
  readonly appelsVus: number;
  /** Les appels à `evaluerPotDeMiel(` hors de son module : les formulaires qui le câblent. */
  readonly appelantsDuPotDeMiel: number;
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function estUnDe<T extends string>(liste: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (liste as readonly string[]).includes(v);
}

// ── Le registre, lu puis exécuté ────────────────────────────────────────────────────────────────

async function confronterLeRegistre(
  u: Univers,
  fautes: Faute[],
  confrontes: string[]
): Promise<void> {
  for (const [nom, brut] of Object.entries(u.registre)) {
    const d = estObjet(brut) ? brut : {};
    const prefixe = d.prefixe;
    const prefixeValide =
      estUnDe(PREFIXES_DE_FAMILLE, prefixe) &&
      nom.startsWith(prefixe) &&
      nom.length > prefixe.length;
    if (!prefixeValide) {
      fautes.push({
        famille: 'prefixe_hors_famille',
        message:
          `le compteur \`${nom}\` déclare le préfixe \`${String(prefixe)}\` : la famille est ` +
          `close (${PREFIXES_DE_FAMILLE.join(' ')}) et le nom commence par son préfixe. Un ` +
          `sixième préfixe passe par l'exigence, pas par le code.`,
      });
    }
    const surPanne = d.surPanne;
    if (!estUnDe(CONDUITES_SUR_PANNE, surPanne)) {
      fautes.push({
        famille: 'conduite_absente',
        message:
          `préfixe \`${String(prefixe)}\` — le compteur \`${nom}\` ne déclare aucune conduite ` +
          `sur panne valide (reçu : ${JSON.stringify(surPanne) ?? 'rien'}). Attendu : ` +
          `${CONDUITES_SUR_PANNE.join(' ou ')}. Un défaut ouvert échoue ouvert.`,
      });
    }
    if (!prefixeValide || !estUnDe(CONDUITES_SUR_PANNE, surPanne)) continue;

    let verdict: VerdictDeLimite;
    try {
      verdict = await u.executer(nom);
    } catch (e) {
      fautes.push({
        famille: 'conduite_trahie',
        message:
          `préfixe \`${prefixe}\` — le compteur \`${nom}\` a LEVÉ au lieu de rendre sa conduite ` +
          `quand le cache tombe : ${(e as Error).message}`,
      });
      continue;
    }
    const attendu = surPanne === 'laisser-passer';
    if (verdict.autorise !== attendu || verdict.panne !== true) {
      fautes.push({
        famille: 'conduite_trahie',
        message:
          `préfixe \`${prefixe}\` — le compteur \`${nom}\` déclare \`${surPanne}\` et, contre un ` +
          `cache qui lève, rend autorise=${verdict.autorise} panne=${verdict.panne} ` +
          `(motif ${verdict.motif}).`,
      });
      continue;
    }
    confrontes.push(`${nom}→${surPanne} (${verdict.motif})`);
  }
}

// ── Les sources, lues par le compilateur ────────────────────────────────────────────────────────

function estAppelA(nomDeFonction: string, e: ts.Expression): boolean {
  if (ts.isIdentifier(e)) return e.text === nomDeFonction;
  return ts.isPropertyAccessExpression(e) && e.name.text === nomDeFonction;
}

function lireLesSources(
  u: Univers,
  fautes: Faute[]
): { appelsVus: number; appelantsDuPotDeMiel: number } {
  const noms = new Set(Object.keys(u.registre));
  let appelsVus = 0;
  let appelantsDuPotDeMiel = 0;
  for (const f of u.fichiers) {
    const genre = f.chemin.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(f.chemin, f.texte, ts.ScriptTarget.Latest, true, genre);
    const ou = (n: ts.Node) =>
      `${f.chemin}:${source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1}`;
    const estLeRegistre = f.chemin === CHEMIN_DU_REGISTRE;
    // Le nom littéral passé à `limiter(` porte le préfixe par construction : il est jugé par
    // `nom_dynamique` (un littéral DU REGISTRE), pas comme un compteur écrit à côté de lui.
    const nomsPassesALimiter = new Set<ts.Node>();

    const visiter = (n: ts.Node): void => {
      if (
        !estLeRegistre &&
        !nomsPassesALimiter.has(n) &&
        (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n))
      ) {
        const texte = n.text.toLowerCase();
        const prefixe = PREFIXES_DE_FAMILLE.find((p) => texte.startsWith(p));
        if (prefixe !== undefined) {
          fautes.push({
            famille: 'prefixe_hors_registre',
            message:
              `${ou(n)} — une chaîne commence par le préfixe de famille \`${prefixe}\` hors de ` +
              `${CHEMIN_DU_REGISTRE} : un compteur se déclare au registre, jamais à côté.`,
          });
        }
      }
      if (ts.isCallExpression(n) && estAppelA('limiter', n.expression)) {
        appelsVus += 1;
        const premier = n.arguments[0];
        const litteral =
          premier !== undefined &&
          (ts.isStringLiteral(premier) || ts.isNoSubstitutionTemplateLiteral(premier))
            ? premier.text
            : null;
        if (litteral !== null && noms.has(litteral)) nomsPassesALimiter.add(premier!);
        if (litteral === null || !noms.has(litteral)) {
          fautes.push({
            famille: 'nom_dynamique',
            message:
              `${ou(n)} — \`limiter(\` reçoit ${premier === undefined ? 'aucun nom' : `\`${premier.getText(source)}\``} : ` +
              `le nom d'un compteur est un littéral du registre, jamais une valeur calculée.`,
          });
        }
      }
      if (
        ts.isImportSpecifier(n) &&
        (n.propertyName?.text ?? n.name.text) === 'limiter' &&
        n.name.text !== 'limiter'
      ) {
        fautes.push({
          famille: 'nom_dynamique',
          message:
            `${ou(n)} — \`limiter\` est importé sous le nom \`${n.name.text}\` : ses appels ` +
            `échapperaient à la lecture de leur premier argument.`,
        });
      }
      if (
        f.chemin !== CHEMIN_DU_POT_DE_MIEL &&
        ts.isCallExpression(n) &&
        estAppelA('evaluerPotDeMiel', n.expression)
      ) {
        appelantsDuPotDeMiel += 1;
      }
      ts.forEachChild(n, visiter);
    };
    visiter(source);
  }
  return { appelsVus, appelantsDuPotDeMiel };
}

/** Fonction sans effet de bord hors de `u.executer` : c'est ce qui rend `--prove` possible. */
export async function analyser(u: Univers): Promise<Releve> {
  const fautes: Faute[] = [];
  const confrontes: string[] = [];
  if (Object.keys(u.registre).length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message: `le registre ${CHEMIN_DU_REGISTRE} ne déclare AUCUN compteur : rien n'est confronté.`,
    });
  }
  if (u.fichiers.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message: `AUCUN fichier \`${RACINE}/**/*.{ts,tsx}\` lu : l'absence de faute ne dirait rien.`,
    });
  }
  await confronterLeRegistre(u, fautes, confrontes);
  const { appelsVus, appelantsDuPotDeMiel } = lireLesSources(u, fautes);
  return { fautes, confrontes, fichiersLus: u.fichiers.length, appelsVus, appelantsDuPotDeMiel };
}

// ── L'univers du dépôt ──────────────────────────────────────────────────────────────────────────

function sourcesDuDisque(dossier: string): Fichier[] {
  return readdirSync(dossier, { withFileTypes: true })
    .flatMap((e): Fichier[] => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourcesDuDisque(chemin);
      return /\.tsx?$/.test(e.name) ? [{ chemin, texte: readFileSync(chemin, 'utf8') }] : [];
    })
    .sort((a, b) => a.chemin.localeCompare(b.chemin));
}

/** Un cache qui LÈVE à chaque appel, et qui compte ceux qu'il a reçus. */
export function cacheQuiLeve(): MagasinDeCompteurs & { appels: () => number } {
  let appels = 0;
  return {
    consommer() {
      appels += 1;
      return Promise.reject(new Error('cache indisponible (témoin de la garde)'));
    },
    appels: () => appels,
  };
}

const SUJET_TEMOIN = sujetDepuisEmpreinte('0'.repeat(16));

/** Le compteur réel, exécuté contre un cache qui lève, signalement capté (la garde imprime seule). */
export const executerLeCompteurReel: Executer = (nom) =>
  limiter(nom as NomDeCompteur, SUJET_TEMOIN, 0, cacheQuiLeve(), () => undefined);

export function universDuDepot(): Univers {
  return {
    registre: COMPTEURS,
    fichiers: sourcesDuDisque(RACINE),
    executer: executerLeCompteurReel,
  };
}

// ── --prove ─────────────────────────────────────────────────────────────────────────────────────

/** Un registre dont on retire un champ, comme le ferait un cast : le type ne le voit plus. */
function sansChamp(
  registre: Readonly<Record<string, unknown>>,
  nom: string,
  champ: string
): Record<string, unknown> {
  const copie: Record<string, unknown> = JSON.parse(JSON.stringify(registre));
  const d = copie[nom];
  if (estObjet(d)) delete d[champ];
  return copie;
}

export interface Temoin {
  readonly famille: Famille;
  readonly libelle: string;
  readonly univers: (base: Univers) => Univers;
  /** Ce que les messages de la famille doivent nommer, pour que le rouge dise où regarder. */
  readonly nomme: readonly string[];
}

/** Un compteur du MILIEU du registre : un témoin sur le dernier ne distingue pas « tous » de lui. */
export const TEMOINS: readonly Temoin[] = [
  {
    famille: 'perimetre_vide',
    libelle: 'registre vide',
    univers: (b) => ({ ...b, registre: {} }),
    nomme: [],
  },
  {
    famille: 'conduite_absente',
    libelle: '`magic:courriel` sans `surPanne`, retiré par cast',
    univers: (b) => ({ ...b, registre: sansChamp(b.registre, 'magic:courriel', 'surPanne') }),
    nomme: ['magic:', 'magic:courriel'],
  },
  {
    famille: 'conduite_trahie',
    libelle: 'une implémentation qui laisse passer quelle que soit la déclaration',
    univers: (b) => ({
      ...b,
      executer: async (nom) => ({
        ...(await b.executer(nom)),
        autorise: true,
      }),
    }),
    nomme: ['magic:ip', 'magic:courriel'],
  },
  {
    famille: 'prefixe_hors_famille',
    libelle: 'un compteur `login:essai` au registre',
    univers: (b) => ({
      ...b,
      registre: {
        ...b.registre,
        'login:essai': {
          prefixe: 'login:',
          limite: 1,
          fenetreSecondes: 1,
          surPanne: 'refuser',
          source: 'REQ-SEC-016',
        },
      },
    }),
    nomme: ['login:'],
  },
  {
    famille: 'prefixe_hors_registre',
    libelle: "`redis.incr('depot:x')` dans un fichier de `src/`",
    univers: (b) => ({
      ...b,
      fichiers: [
        ...b.fichiers,
        {
          chemin: 'src/server/temoin.ts',
          texte: "export const f = (redis: any) => redis.incr('depot:x');\n",
        },
      ],
    }),
    nomme: ['depot:', 'src/server/temoin.ts:1'],
  },
  {
    famille: 'nom_dynamique',
    libelle: "`limiter('magic:' + x, …)` sur deux lignes",
    univers: (b) => ({
      ...b,
      fichiers: [
        ...b.fichiers,
        {
          chemin: 'src/server/temoin.ts',
          texte:
            "import { limiter } from './securite/rate-limit';\n" +
            'export const f = (x: string, s: any) =>\n' +
            "  limiter(\n    'magic:' + x,\n    s,\n    0\n  );\n",
        },
      ],
    }),
    nomme: ['src/server/temoin.ts:3'],
  },
];

/** Ce que la garde doit LAISSER PASSER : sans eux, une garde qui refuse tout serait « prouvée ». */
export const CONTRE_TEMOINS: readonly { libelle: string; fichier: Fichier }[] = [
  {
    libelle: 'un appel sur deux lignes avec un nom littéral du registre',
    fichier: {
      chemin: 'src/server/contre-temoin.ts',
      texte:
        "import { limiter } from './securite/rate-limit';\n" +
        "export const f = (s: any) =>\n  limiter(\n    'depot:ip',\n    s,\n    0\n  );\n",
    },
  },
  {
    libelle: 'un composant `.tsx` qui écrit « magic » sans deux-points',
    fichier: {
      chemin: 'src/app/contre-temoin.tsx',
      texte: "export const C = () => <p title='magic'>{'auth'}</p>;\n",
    },
  },
];

async function prouver(): Promise<number> {
  const base = universDuDepot();
  const r0 = await analyser(base);
  if (r0.fautes.length > 0) {
    console.error(`❌ La preuve part d'un dépôt DÉJÀ fautif (${r0.fautes.length}) :`);
    r0.fautes.forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    return 1;
  }
  for (const c of CONTRE_TEMOINS) {
    const r = await analyser({ ...base, fichiers: [...base.fichiers, c.fichier] });
    if (r.fautes.length > 0) {
      console.error(`❌ Faux positif sur le contre-témoin « ${c.libelle} » :`);
      r.fautes.forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
      return 1;
    }
  }
  const prouvees = new Set<Famille>();
  for (const t of TEMOINS) {
    const r = await analyser(t.univers(base));
    const siennes = r.fautes.filter((f) => f.famille === t.famille);
    const manquants = t.nomme.filter((m) => !siennes.some((f) => f.message.includes(m)));
    if (siennes.length === 0 || manquants.length > 0) {
      console.error(
        `❌ Le témoin « ${t.libelle} » n'a PAS fait rougir \`${t.famille}\` en nommant ` +
          `${manquants.join(', ') || 'sa cible'} (${r.fautes.length} faute(s) d'autres familles).`
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
  TEMOINS.forEach((t) => console.log(`   • ${t.famille} — ${t.libelle}`));
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  return 0;
}

// ── Le dépôt ────────────────────────────────────────────────────────────────────────────────────

async function controler(): Promise<number> {
  const r = await analyser(universDuDepot());
  if (r.fautes.length > 0) {
    console.error(`❌ rate-famille — ${r.fautes.length} faute(s) :`);
    for (const famille of FAMILLES) {
      const liste = r.fautes.filter((f) => f.famille === famille);
      if (liste.length === 0) continue;
      console.error(`\n   ── ${famille} (${liste.length})`);
      liste.forEach((f) => console.error(`      ${f.message}`));
    }
    return 1;
  }
  console.log(
    `✅ rate-famille — ${r.confrontes.length} compteurs confrontés (déclarés ET exécutés contre ` +
      `un cache qui lève) : ${r.confrontes.join(' ; ')}.`
  );
  console.log(
    `   ${r.fichiersLus} fichiers de \`${RACINE}/\` lus ; ${r.appelsVus} appels \`limiter(\` vus.`
  );
  console.log(
    `   Pot de miel : ${r.appelantsDuPotDeMiel} formulaire(s) câblé(s) — 0 formulaire de dépôt en ` +
      `phase 0 ; 1 appelant attendu : SEC-03 (/connexion).`
  );
  return 0;
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]rate-famille\.ts$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  (process.argv.includes('--prove') ? prouver() : controler())
    .catch((e: unknown) => {
      console.error(`❌ rate-famille — la garde a levé : ${(e as Error).message}`);
      return 2;
    })
    .then((code) => process.exit(code));
}
