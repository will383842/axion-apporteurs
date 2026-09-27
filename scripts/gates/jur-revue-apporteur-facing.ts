/**
 * jur-revue-apporteur-facing.ts — une PR qui touche ce qu'un apporteur voit ou reçoit exige le
 * JURISTE (JUR-T26, REQ-JUR-036). Registre : `jur:revue-apporteur-facing`.
 *
 * USAGE : pnpm jur:revue-apporteur-facing            en porte A : la PR de l'événement GitHub
 *                                                    (label, checklist) et CODEOWNERS
 *         pnpm jur:revue-apporteur-facing --pr <n>   la même chose, REVUES COMPRISES — avant fusion
 *         pnpm jur:revue-apporteur-facing:prove      un témoin par famille, des contre-témoins verts
 *
 * CE QU'ELLE EXIGE d'une PR dont un fichier est dans le PÉRIMÈTRE APPORTEUR :
 *   — le label `apporteur-facing` ;
 *   — dans le corps, entre `<!-- charte:debut -->` et `<!-- charte:fin -->`, une ligne par motif de
 *     la charte relationnelle, `Mnn · <motif> : absent`. Un motif sans valeur n'est pas coché ; un
 *     motif coché « présent » bloque la fusion. Ce ne sont PAS des cases `- [ ]` : le gabarit de PR
 *     réserve les cases à la définition de « terminé », que `gov:pr` compte ;
 *   — sous `--pr <n>`, la revue du juriste : un avis dont l'en-tête est `<code> · juriste` (le code
 *     est lu dans `docs/agents.json`) et le verdict `accepte`, rendu par un compte habilité. Les
 *     revues ne sont pas dans l'événement GitHub : la porte A ne les juge pas, et le DIT.
 * Et, en tout mode, que `.github/CODEOWNERS` déclare le poste du juriste sur chaque motif du
 * périmètre : c'est ce qui DEMANDE la revue que cette garde vérifie.
 *
 * TOUT EST DÉRIVÉ (RM-01). Le périmètre est la portée « apporteur » de la gate lexicale
 * (`MOTIFS` de `scripts/gates/lexique-apporteurs.ts`) : ce qu'un apporteur lit se déclare une fois.
 * Les douze motifs se lisent dans la fiche du juriste (`.claude/agents/juriste.md`), jamais retapés.
 *
 * FAMILLES, chacune vue rougir sur son témoin par `--prove` : `label_absent`, `checklist_absente`,
 * `motif_non_coche`, `motif_present`, `revue_juriste_absente`, `codeowners_incomplet`.
 *
 * LIMITES DÉCLARÉES. Le label est posé par l'auteur de la PR : c'est une déclaration, que le
 * périmètre rend obligatoire. La checklist est une déclaration du juriste, pas une preuve : la
 * garde vérifie qu'elle est complète et qu'aucun motif n'est présent, pas qu'elle est juste — c'est
 * la revue qui l'est. Un compte GitHub unique porte aujourd'hui tous les postes (décision `W13`).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { MOTIFS } from './lexique-apporteurs';
import {
  ASSOCIATIONS_HABILITEES,
  ETATS_RENDUS,
  lentilleDeLaRevue,
  verdictDeLaRevue,
  type RevueBrute,
} from '../lot/revues';

export const ID_REGISTRE = 'jur:revue-apporteur-facing';
export const LABEL = 'apporteur-facing';
export const MARQUEUR_DEBUT = '<!-- charte:debut -->';
export const MARQUEUR_FIN = '<!-- charte:fin -->';
const CHEMIN_FICHE = '.claude/agents/juriste.md';
const CHEMIN_AGENTS = 'docs/agents.json';
const CHEMIN_CODEOWNERS = '.github/CODEOWNERS';
const ROLE = 'juriste';

export const FAMILLES = [
  'label_absent',
  'checklist_absente',
  'motif_non_coche',
  'motif_present',
  'revue_juriste_absente',
  'codeowners_incomplet',
] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}

/** Le périmètre apporteur, DÉRIVÉ de la portée « apporteur » de la gate lexicale. */
export const PERIMETRE_APPORTEUR: readonly RegExp[] = MOTIFS.filter(
  (m) => m.portee === 'apporteur'
).map((m) => m.reg);

export interface MotifDeCharte {
  readonly numero: number;
  readonly libelle: string;
}

/** Les motifs de la charte, lus dans le tableau de la fiche du juriste : `| 1 | **Objectif…** | … |`. */
export function motifsDeLaCharte(fiche: string): MotifDeCharte[] {
  const motifs: MotifDeCharte[] = [];
  for (const ligne of fiche.split('\n')) {
    const m = /^\|\s*(\d{1,2})\s*\|\s*\*\*([^*]+)\*\*/.exec(ligne);
    if (m) motifs.push({ numero: Number(m[1]), libelle: m[2]!.trim() });
  }
  return motifs;
}

const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** Le bloc attendu, tel qu'un auteur le recopie : il est imprimé par la garde quand il manque. */
export function blocAttendu(motifs: readonly MotifDeCharte[]): string {
  return [
    MARQUEUR_DEBUT,
    ...motifs.map((m) => `M${deuxChiffres(m.numero)} · ${m.libelle} : absent`),
    MARQUEUR_FIN,
  ].join('\n');
}

let codeEnCache: string | null = null;
/** Le code de poste du juriste, lu dans le registre des postes. */
function codeDuJuriste(): string {
  if (codeEnCache !== null) return codeEnCache;
  const doc = JSON.parse(readFileSync(CHEMIN_AGENTS, 'utf8')) as {
    postes: { code: string; role: string }[];
  };
  const poste = doc.postes.find((p) => p.role === ROLE);
  if (poste === undefined) throw new Error(`${CHEMIN_AGENTS} ne porte aucun poste « ${ROLE} »`);
  codeEnCache = poste.code;
  return codeEnCache;
}

export interface PrJugee {
  readonly fichiers: readonly string[];
  readonly labels: readonly string[];
  readonly corps: string;
  /** Les revues telles que la forge les sert ; `null` quand elles ne sont pas lisibles (porte A). */
  readonly revues: readonly RevueBrute[] | null;
}

/** Le jugement d'une PR : pur, sauf la lecture du code du juriste au registre des postes. */
export function jugerLaPr(pr: PrJugee, motifs: readonly MotifDeCharte[]): Faute[] {
  const touches = pr.fichiers.filter((f) => PERIMETRE_APPORTEUR.some((r) => r.test(f)));
  if (touches.length === 0) return [];
  const fautes: Faute[] = [];
  const ou = `la PR touche ${touches.slice(0, 3).join(', ')}${touches.length > 3 ? '…' : ''}`;
  if (!pr.labels.includes(LABEL)) {
    fautes.push({
      famille: 'label_absent',
      message: `${ou} sans le label \`${LABEL}\` (REQ-JUR-036).`,
    });
  }
  const debut = pr.corps.indexOf(MARQUEUR_DEBUT);
  const fin = pr.corps.indexOf(MARQUEUR_FIN);
  if (debut === -1 || fin < debut) {
    fautes.push({
      famille: 'checklist_absente',
      message: `${ou} : le corps ne porte pas la checklist des ${motifs.length} motifs. À recopier :\n${blocAttendu(motifs)}`,
    });
  } else {
    const valeurs = new Map<number, string>();
    for (const ligne of pr.corps.slice(debut, fin).split('\n')) {
      const m = /^\s*M(\d{2})\s*·[^:]*:\s*(\S*)\s*$/.exec(ligne.replace(/\r$/, ''));
      if (m) valeurs.set(Number(m[1]), m[2]!.toLowerCase());
    }
    for (const motif of motifs) {
      const v = valeurs.get(motif.numero) ?? '';
      if (v === 'présent' || v === 'present') {
        fautes.push({
          famille: 'motif_present',
          message: `${ou} : le motif ${motif.numero} (${motif.libelle}) est coché « présent » — la fusion est bloquée (REQ-JUR-036).`,
        });
      } else if (v !== 'absent') {
        fautes.push({
          famille: 'motif_non_coche',
          message: `${ou} : le motif ${motif.numero} (${motif.libelle}) n'est pas coché « absent ».`,
        });
      }
    }
  }
  if (pr.revues !== null) {
    const code = codeDuJuriste();
    let accepte = false;
    for (const r of pr.revues) {
      if (!ASSOCIATIONS_HABILITEES.has((r.author_association ?? '').toUpperCase())) continue;
      if (!ETATS_RENDUS.has((r.state ?? '').toUpperCase())) continue;
      const lentille = lentilleDeLaRevue(r.body ?? '', new Set([code]));
      if (!('code' in lentille) || lentille.lentille !== ROLE) continue;
      const verdict = verdictDeLaRevue(r.body ?? '');
      // La DERNIÈRE décision du juriste l'emporte : un refus après un accord referme.
      accepte = 'verdict' in verdict && verdict.verdict === 'accepte';
    }
    if (!accepte) {
      fautes.push({
        famille: 'revue_juriste_absente',
        message: `${ou} sans revue acceptée du poste ${code} (\`${code} · ${ROLE}\`, « Verdict: accepte ») : elle est bloquante (REQ-JUR-036).`,
      });
    }
  }
  return fautes;
}

/** Les racines que CODEOWNERS attribue au juriste : les règles sous un commentaire qui nomme son poste. */
function racinesDuJuriste(codeowners: string, code: string): string[] {
  const racines: string[] = [];
  let sousLeJuriste = false;
  for (const brute of codeowners.split('\n')) {
    const ligne = brute.trim();
    if (ligne.startsWith('#')) {
      sousLeJuriste = ligne.includes(code) && ligne.includes(ROLE);
      continue;
    }
    if (ligne === '') continue;
    const [chemin, ...proprietaires] = ligne.split(/\s+/);
    if (sousLeJuriste && chemin !== undefined && proprietaires.length > 0) racines.push(chemin);
    sousLeJuriste = false;
  }
  return racines;
}

/** Chaque motif du périmètre apporteur est-il couvert par une règle CODEOWNERS du juriste ? */
export function jugerLaCouverture(codeowners: string): Faute[] {
  const code = codeDuJuriste();
  const racines = racinesDuJuriste(codeowners, code).map((r) => r.replace(/^\//, ''));
  const echantillons = ['temoin.ts', 'temoin.json', 'temoin.md'];
  return MOTIFS.filter((m) => m.portee === 'apporteur')
    .filter((m) => !racines.some((r) => echantillons.some((e) => m.reg.test(`${r}${e}`))))
    .map((m) => ({
      famille: 'codeowners_incomplet' as const,
      message:
        `${CHEMIN_CODEOWNERS} ne déclare le poste ${code} (\`${ROLE}\`) sur aucun chemin du motif ` +
        `« ${m.nom} » : la revue du juriste n'y est pas DEMANDÉE (REQ-JUR-036).`,
    }));
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────────

const MOTIFS_TEMOIN: MotifDeCharte[] = [
  { numero: 1, libelle: 'Objectif chiffré' },
  { numero: 2, libelle: 'Classement / comparaison' },
];
const COCHEE = blocAttendu(MOTIFS_TEMOIN);
const ECRAN = ['src/app/(espace)/tableau/page.tsx'];
const REVUE = (corps: string): RevueBrute => ({
  author_association: 'OWNER',
  state: 'COMMENTED',
  body: corps,
});

function prouver(): { code: 0 | 1; lignes: string[] } {
  const juriste = `${codeDuJuriste()} · ${ROLE}\n\nVerdict: accepte`;
  const temoins: { famille: Famille; quoi: string; fautes: () => Faute[] }[] = [
    {
      famille: 'label_absent',
      quoi: 'la fixtureRouge du registre : une PR d’écran sans label ni revue du juriste',
      fautes: () =>
        jugerLaPr({ fichiers: ECRAN, labels: [], corps: COCHEE, revues: [] }, MOTIFS_TEMOIN),
    },
    {
      famille: 'checklist_absente',
      quoi: 'une PR d’écran sans checklist',
      fautes: () =>
        jugerLaPr({ fichiers: ECRAN, labels: [LABEL], corps: '', revues: null }, MOTIFS_TEMOIN),
    },
    {
      famille: 'motif_non_coche',
      quoi: 'un motif laissé sans valeur',
      fautes: () =>
        jugerLaPr(
          {
            fichiers: ECRAN,
            labels: [LABEL],
            corps: COCHEE.replace('M02 · Classement / comparaison : absent', 'M02 · Classement :'),
            revues: null,
          },
          MOTIFS_TEMOIN
        ),
    },
    {
      famille: 'motif_present',
      quoi: 'un motif coché « présent »',
      fautes: () =>
        jugerLaPr(
          {
            fichiers: ECRAN,
            labels: [LABEL],
            corps: COCHEE.replace('Objectif chiffré : absent', 'Objectif chiffré : présent'),
            revues: null,
          },
          MOTIFS_TEMOIN
        ),
    },
    {
      famille: 'revue_juriste_absente',
      quoi: 'un accord du juriste suivi de son refus',
      fautes: () =>
        jugerLaPr(
          {
            fichiers: ECRAN,
            labels: [LABEL],
            corps: COCHEE,
            revues: [REVUE(juriste), REVUE(juriste.replace('accepte', 'refuse'))],
          },
          MOTIFS_TEMOIN
        ),
    },
    {
      famille: 'codeowners_incomplet',
      quoi: 'un CODEOWNERS sans le bloc du juriste',
      fautes: () => jugerLaCouverture('*  @proprietaire\n'),
    },
  ];
  const contre: { quoi: string; fautes: () => Faute[] }[] = [
    {
      quoi: 'une PR d’écran complète, revue du juriste acceptée',
      fautes: () =>
        jugerLaPr(
          { fichiers: ECRAN, labels: [LABEL], corps: COCHEE, revues: [REVUE(juriste)] },
          MOTIFS_TEMOIN
        ),
    },
    {
      quoi: 'une PR qui ne touche rien de ce qu’un apporteur lit',
      fautes: () =>
        jugerLaPr(
          { fichiers: ['scripts/gates/roles.ts'], labels: [], corps: '', revues: [] },
          MOTIFS_TEMOIN
        ),
    },
  ];
  const lignes: string[] = [];
  let ok = true;
  for (const t of temoins) {
    const rougit = t.fautes().some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of contre) {
    const fautes = c.fautes();
    ok &&= fautes.length === 0;
    lignes.push(`${fautes.length === 0 ? '🟢' : '❌ ROUGIT'} contre-témoin : ${c.quoi}`);
  }
  const orphelines = FAMILLES.filter((f) => !temoins.some((t) => t.famille === f));
  ok &&= orphelines.length === 0;
  for (const f of orphelines) lignes.push(`❌ famille sans témoin : ${f}`);
  lignes.unshift(
    ok
      ? `✅ ${ID_REGISTRE} — ${FAMILLES.length} familles rougissent sur leurs témoins, ` +
          `${contre.length} contre-témoins restent verts — preuve faite.`
      : `❌ ${ID_REGISTRE} --prove — la preuve échoue :`
  );
  return { code: ok ? 0 : 1, lignes };
}

// ── le dépôt et la forge ─────────────────────────────────────────────────────────────────────────

function prDeLEvenement(): PrJugee | null {
  const chemin = process.env['GITHUB_EVENT_PATH'];
  if (!chemin || !existsSync(chemin)) return null;
  const ev = JSON.parse(readFileSync(chemin, 'utf8')) as {
    pull_request?: {
      body: string | null;
      labels: { name: string }[];
      base: { sha: string };
      head: { sha: string };
    };
  };
  if (!ev.pull_request) return null;
  const pr = ev.pull_request;
  const fichiers = execFileSync('git', ['diff', '--name-only', `${pr.base.sha}...${pr.head.sha}`], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((l) => l !== '');
  return { fichiers, labels: pr.labels.map((l) => l.name), corps: pr.body ?? '', revues: null };
}

function prDeLaForge(numero: string): PrJugee {
  const vue = JSON.parse(
    execFileSync('gh', ['pr', 'view', numero, '--json', 'files,labels,body'], { encoding: 'utf8' })
  ) as { files: { path: string }[]; labels: { name: string }[]; body: string };
  const revues = JSON.parse(
    execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${numero}/reviews`, '--paginate'], {
      encoding: 'utf8',
    })
  ) as RevueBrute[];
  return {
    fichiers: vue.files.map((f) => f.path),
    labels: vue.labels.map((l) => l.name),
    corps: vue.body,
    revues,
  };
}

function juger(argv: readonly string[]): { code: 0 | 1; lignes: string[] } {
  const motifs = motifsDeLaCharte(readFileSync(CHEMIN_FICHE, 'utf8'));
  const lignes: string[] = [];
  const fautes: Faute[] = [...jugerLaCouverture(readFileSync(CHEMIN_CODEOWNERS, 'utf8'))];
  const i = argv.indexOf('--pr');
  const pr = i >= 0 ? prDeLaForge(argv[i + 1] ?? '') : prDeLEvenement();
  const couverture =
    `${CHEMIN_CODEOWNERS} : le poste du juriste couvre les ${PERIMETRE_APPORTEUR.length} motifs du ` +
    `périmètre apporteur ; ${motifs.length} motifs de charte lus dans ${CHEMIN_FICHE}`;
  if (pr === null) {
    lignes.push(`   Aucun événement de PR : seules les déclarations CODEOWNERS sont jugées.`);
  } else {
    fautes.push(...jugerLaPr(pr, motifs));
    const touches = pr.fichiers.filter((f) => PERIMETRE_APPORTEUR.some((r) => r.test(f)));
    lignes.push(
      touches.length === 0
        ? `   La PR (${pr.fichiers.length} fichier(s)) ne touche rien de ce qu’un apporteur lit : sans objet.`
        : `   La PR touche ${touches.length} fichier(s) du périmètre apporteur : label et checklist jugés` +
            (pr.revues === null
              ? ' ; la revue du juriste se juge sous « --pr <n> », avant la fusion.'
              : ', revue du juriste comprise.')
    );
  }
  if (fautes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${ID_REGISTRE} — ${fautes.length} faute(s) :`,
        ...fautes.map((f) => `   [${f.famille}] ${f.message}`),
        ...lignes,
      ],
    };
  }
  return { code: 0, lignes: [`✅ ${ID_REGISTRE} — ${couverture}.`, ...lignes] };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]jur-revue-apporteur-facing(\.ts)?$/.test(
  process.argv[1] ?? ''
);

if (LANCE_EN_SCRIPT) {
  const argv = process.argv.slice(2);
  const decision = argv.includes('--prove') ? prouver() : juger(argv);
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
