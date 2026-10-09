/**
 * registre-fusions.ts — LE REGISTRE SUIT LES FUSIONS, SANS RATTRAPAGE (GOV-154).
 *
 * USAGE : pnpm gov:registre-fusions            (sur l'arbre courant : HEAD et docs/tasks.json)
 *         pnpm gov:registre-fusions -- --pr <n> (la PR <n> est la PR en cours : sa clôture pendante
 *                                                n'a pas encore de commit squashé, et c'est normal)
 *         pnpm gov:registre-fusions:prove       (chaque famille rougit sur son témoin)
 *
 * POURQUOI. Une tâche se clôt désormais DANS sa propre PR (`lot:cloture --dans-la-pr`) : `fusionnee`,
 * `pr` = son numéro et une attestation PENDANTE (sha et date `null`). Le sha de fusion n'existe
 * qu'au squash ; il se LIT dans l'historique de main, il ne s'écrit jamais — aucun workflow ne
 * pousse sur main. Ce qui restait à juger après la fusion se juge ICI, par écart PROUVÉ seulement :
 *
 *   — `pendante_sans_commit`    : une attestation pendante dont aucun commit de l'historique ne porte
 *                                 « (#n) » en fin de sujet, hors de la PR en cours ;
 *   — `pendante_sujet_etranger` : le commit « (#n) » existe, mais ni son sujet ni son champ `Lot:`
 *                                 ne nomment la tâche — la clôture ne correspond pas à la fusion ;
 *   — `fusion_sans_cloture`     : une PR fusionnée DEPUIS LE DÉBUT de cette règle nomme dans son sujet
 *                                 une tâche que le registre ne tient pas pour livrée ;
 *   — `fusion_pr_divergente`    : la même PR nomme une tâche livrée, mais sous un AUTRE `pr` que le
 *                                 sien — le registre et la fusion divergent ;
 *   — `registre_illisible`      : `docs/tasks.json` ou l'historique ne se lisent pas — la garde
 *                                 S'ARRÊTE (échec fermé, condition de la sécurité).
 *
 * CE QU'ELLE NE FAIT PAS. Une attestation pendante en attente d'atterrissage n'est PAS un rouge :
 * l'atterrissage se juge par la vérification du déploiement (`gate-deploiement`), et rien ici ne fait
 * rougir main jusqu'au déploiement (arbitrage de la coordination, #319, 6043741780). Avant le premier commit qui porte cette garde,
 * les PR fusionnées se closaient par rattrapage : elles ne sont pas relues.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LIVREE } from '../lot/avancement';
import { DEPOT_LOCAL, depotDeLaTache, numeroDuSujet } from '../lot/attestation';
import { lireLeLot } from '../lot/revues';

/** Le dépôt de forge de ce registre : une référence de PR se compose QUALIFIÉE (GOV-038). */
const depot = depotDeLaTache({ repo: DEPOT_LOCAL }) ?? DEPOT_LOCAL;

/**
 * LE DÉBUT DE LA RÈGLE N'EST PAS UNE DATE TAPÉE : c'est l'instant du premier commit de l'historique qui
 * porte cette garde (`git log --diff-filter=A`). Avant lui, les PR se closaient par rattrapage ; une
 * date fixe aurait fait rougir main pour toute PR fusionnée entre elle et la fusion de GOV-154.
 */
export const CHEMIN_DE_LA_GARDE = 'scripts/gates/registre-fusions.ts';
/**
 * Les seuls types de PR qui LIVRENT une tâche. Un `docs(…)` (le geste d'un fichier réservé) ou un
 * `chore(…)` (le registre) la nomme sans la clore.
 */
export const TYPES_QUI_LIVRENT: readonly string[] = ['feat', 'fix'];
/**
 * Les tâches qu'une PR peut nommer sans les clore : la tâche récurrente des rattrapages du registre.
 * Liste FERMÉE ; une entrée de plus se décide par la gouvernance, avec sa raison.
 */
export const NOMMEES_SANS_CLOTURE: readonly string[] = ['GOV-012'];

export type TacheDuRegistre = {
  id: string;
  repo?: string | null;
  statut?: string | null;
  pr?: number | null;
  attestation?: { pr: number; sha: string | null; fusionneeAt: string | null } | null;
};
export type CommitDeMain = { sha: string; date: string; message: string };
export type Ecart = { famille: string; message: string };

const SUJET = /^\w+(?:\(([^)]+)\))?!?:.*\(#(\d+)\)$/;

/**
 * La PR en cours : `--pr <n>`, sinon `PR_COURANTE` (posée par la CI sur une PR, vide sur main). Ce
 * qui n'est pas un entier positif ne vaut rien — jamais un numéro deviné.
 */
export function prCourante(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): number | null {
  const i = argv.indexOf('--pr');
  const brute = i >= 0 ? argv[i + 1] : env['PR_COURANTE'];
  return brute && /^\d+$/.test(brute) && Number(brute) > 0 ? Number(brute) : null;
}

/** Les identifiants que nomme le sujet (`type(A, B): … (#n)`) et le champ `Lot:` du message. */
export function tachesNommees(message: string): string[] {
  const [sujet = '', ...reste] = message.split('\n');
  const m = SUJET.exec(sujet.trim());
  const duSujet = m?.[1] ? m[1].split(/,\s*/).map((x) => x.trim()) : [];
  const duLot = lireLeLot(reste.join('\n')).ids;
  return [...new Set([...duSujet, ...duLot])];
}

/** LA RÈGLE, PURE : écarts entre le registre et l'historique de main. */
export function ecartsDuRegistreEtDesFusions(e: {
  taches: readonly TacheDuRegistre[];
  commits: readonly CommitDeMain[];
  prCourante: number | null;
  debut?: string;
}): Ecart[] {
  const ecarts: Ecart[] = [];
  const parNumero = new Map<number, CommitDeMain>();
  for (const c of e.commits) {
    const n = numeroDuSujet(c.message.split('\n')[0] ?? '');
    if (n !== null && !parNumero.has(n)) parNumero.set(n, c);
  }
  const parId = new Map(e.taches.map((t) => [t.id, t]));

  for (const t of e.taches) {
    const a = t.attestation;
    if ((t.repo ?? DEPOT_LOCAL) !== DEPOT_LOCAL || !a || a.sha !== null || a.fusionneeAt !== null) {
      continue;
    }
    if (a.pr === e.prCourante) continue;
    const c = parNumero.get(a.pr);
    if (!c) {
      ecarts.push({
        famille: 'pendante_sans_commit',
        message:
          `${t.id} est close dans la PR ${depot}#${a.pr} (attestation pendante), et aucun commit de main ne ` +
          `porte « (#${a.pr}) » : la clôture n'a pas de fusion.`,
      });
      continue;
    }
    if (!tachesNommees(c.message).includes(t.id)) {
      ecarts.push({
        famille: 'pendante_sujet_etranger',
        message:
          `${t.id} est close dans la PR ${depot}#${a.pr}, mais le commit ${c.sha.slice(0, 7)} « ${c.message.split('\n')[0]} » ` +
          `ne la nomme ni dans son sujet ni dans son champ \`Lot:\`.`,
      });
    }
  }

  // Sans début connu (la garde n'est pas encore dans l'historique lu), aucune fusion n'est relue.
  const debut = e.debut ? Date.parse(e.debut) : Number.POSITIVE_INFINITY;
  for (const c of e.commits) {
    if (Date.parse(c.date) <= debut) continue;
    const sujet = c.message.split('\n')[0] ?? '';
    const n = numeroDuSujet(sujet);
    if (n === null) continue;
    const type = /^(\w+)/.exec(sujet.trim())?.[1] ?? '';
    if (!TYPES_QUI_LIVRENT.includes(type)) continue;
    for (const id of tachesNommees(c.message)) {
      if (NOMMEES_SANS_CLOTURE.includes(id)) continue;
      const t = parId.get(id);
      if (!t || (t.repo ?? DEPOT_LOCAL) !== DEPOT_LOCAL) continue;
      if (!LIVREE.has(t.statut ?? '')) {
        ecarts.push({
          famille: 'fusion_sans_cloture',
          message:
            `La PR ${depot}#${n} a fusionné (${c.sha.slice(0, 7)}) et nomme ${id}, que le registre tient pour ` +
            `« ${t.statut ?? 'sans statut'} » : elle aurait dû se clore elle-même (\`lot:cloture --dans-la-pr\`).`,
        });
      } else if (t.pr !== n) {
        // Acceptance (3) : la tâche nommée est livrée PAR CETTE PR, `pr` = N — pas par une autre.
        ecarts.push({
          famille: 'fusion_pr_divergente',
          message:
            `La PR ${depot}#${n} a fusionné (${c.sha.slice(0, 7)}) et nomme ${id}, que le registre dit livrée ` +
            `par ${t.pr == null ? 'aucune PR' : `${depot}#${t.pr}`} : le registre et la fusion divergent.`,
        });
      }
    }
  }
  return ecarts;
}

// ── la lecture réelle (échec fermé) ─────────────────────────────────────────

function lireLesTaches(): TacheDuRegistre[] {
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches?: TacheDuRegistre[] };
  if (!Array.isArray(doc.taches))
    throw new Error('docs/tasks.json ne porte pas de tableau `taches`');
  return doc.taches;
}

function lireLesCommits(): CommitDeMain[] {
  const brut = execFileSync('git', ['log', '--format=%H%x1f%cI%x1f%B%x1e', 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 256e6,
  });
  return brut
    .split('\x1e')
    .map((b) => b.replace(/^\n/, ''))
    .filter((b) => b.trim() !== '')
    .map((b) => {
      const [sha = '', date = '', message = ''] = b.split('\x1f');
      return { sha, date, message: message.trim() };
    });
}

/**
 * LE DÉBUT DE LA RÈGLE : l'instant du plus ancien commit SQUASHÉ « (#n) » qui ajoute cette garde —
 * sa fusion sur main. Un commit de branche (`wip`, fusion de main dans la branche, commit de fusion
 * de la CI) ne date rien : il rendrait relues des PR fusionnées pendant que la garde était en revue.
 * `undefined` tant que la garde n'a pas fusionné : aucune fusion n'est alors relue.
 */
export function debutDeLaRegle(
  ajouts: readonly { date: string; sujet: string }[]
): string | undefined {
  const squashs = ajouts.filter((a) => numeroDuSujet(a.sujet) !== null);
  return squashs.length > 0 ? squashs[squashs.length - 1]!.date : undefined;
}

function lireLeDebut(): string | undefined {
  const brut = execFileSync(
    'git',
    ['log', '--diff-filter=A', '--format=%cI%x1f%s', 'HEAD', '--', CHEMIN_DE_LA_GARDE],
    { encoding: 'utf8' }
  ).trim();
  return debutDeLaRegle(
    brut
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map((l) => {
        const [date = '', sujet = ''] = l.split('\x1f');
        return { date, sujet };
      })
  );
}

// ── la preuve : chaque famille rougit sur son témoin ────────────────────────

const T: TacheDuRegistre[] = [
  {
    id: 'X-1',
    repo: 'partners',
    statut: 'fusionnee',
    pr: 901,
    attestation: { pr: 901, sha: null, fusionneeAt: null },
  },
  { id: 'X-2', repo: 'partners', statut: 'a_faire', pr: null, attestation: null },
];
const DEBUT_TEMOIN = '2026-10-08T00:00:00Z';
const C = (n: number, sujet: string, date = '2026-10-09T10:00:00Z'): CommitDeMain => ({
  sha: 'a'.repeat(40),
  date,
  message: `${sujet} (#${n})`,
});
export const TEMOINS: {
  famille: string;
  cas: Parameters<typeof ecartsDuRegistreEtDesFusions>[0];
}[] = [
  { famille: 'pendante_sans_commit', cas: { taches: T, commits: [], prCourante: null } },
  {
    famille: 'pendante_sujet_etranger',
    cas: { taches: T, commits: [C(901, 'feat(Y-9): autre chose')], prCourante: null },
  },
  {
    famille: 'fusion_sans_cloture',
    cas: {
      taches: T,
      commits: [C(901, 'feat(X-1): x'), C(902, 'feat(X-2): y')],
      prCourante: null,
      debut: DEBUT_TEMOIN,
    },
  },
  {
    famille: 'fusion_pr_divergente',
    cas: {
      taches: T,
      commits: [C(901, 'feat(X-1): x'), C(906, 'fix(X-1): encore')],
      prCourante: null,
      debut: DEBUT_TEMOIN,
    },
  },
];
export const CONTRE_TEMOINS: {
  quoi: string;
  cas: Parameters<typeof ecartsDuRegistreEtDesFusions>[0];
}[] = [
  {
    quoi: 'la PR en cours, close et pas encore fusionnée',
    cas: { taches: T, commits: [], prCourante: 901 },
  },
  {
    quoi: 'la clôture et sa fusion concordent',
    cas: { taches: T, commits: [C(901, 'feat(X-1): x')], prCourante: null },
  },
  {
    quoi: 'une fusion antérieure au début de la règle',
    cas: {
      taches: T,
      commits: [C(901, 'feat(X-1): x'), C(800, 'feat(X-2): y', '2026-10-01T10:00:00Z')],
      prCourante: null,
      debut: DEBUT_TEMOIN,
    },
  },
  {
    quoi: 'la tâche des rattrapages, nommée sans être close',
    cas: {
      taches: T,
      commits: [C(901, 'feat(X-1): x'), C(903, 'chore(GOV-012): rattrapage')],
      prCourante: null,
      debut: DEBUT_TEMOIN,
    },
  },
  {
    quoi: 'un geste docs(…) qui nomme une tâche sans la livrer',
    cas: {
      taches: T,
      commits: [C(901, 'feat(X-1): x'), C(904, 'docs(X-2): le geste du glossaire')],
      prCourante: null,
      debut: DEBUT_TEMOIN,
    },
  },
];

function prouver(): number {
  let fautes = 0;
  for (const t of TEMOINS) {
    const f = ecartsDuRegistreEtDesFusions(t.cas);
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(`❌ gov:registre-fusions --prove — ${t.famille} ne rougit pas sur son témoin.`);
      fautes++;
    }
  }
  for (const c of CONTRE_TEMOINS) {
    const f = ecartsDuRegistreEtDesFusions(c.cas);
    if (f.length > 0) {
      console.error(
        `❌ gov:registre-fusions --prove — contre-témoin « ${c.quoi} » rouge : ${f[0]!.famille}.`
      );
      fautes++;
    }
  }
  if (fautes === 0) {
    console.log(
      `✅ gov:registre-fusions --prove — ${TEMOINS.length} familles rougissent chacune sur son témoin ; ` +
        `${CONTRE_TEMOINS.length} contre-témoins restent verts.`
    );
  }
  return fautes === 0 ? 0 : 1;
}

function principal(): number {
  if (process.argv.includes('--prove')) return prouver();
  const enCours = prCourante(process.argv, process.env);
  let taches: TacheDuRegistre[];
  let commits: CommitDeMain[];
  try {
    taches = lireLesTaches();
    commits = lireLesCommits();
  } catch (e) {
    console.error(
      `❌ gov:registre-fusions — [registre_illisible] ${(e as Error).message.split('\n')[0]} : la garde ` +
        `s'arrête, elle ne déclare pas concordant ce qu'elle n'a pas lu.`
    );
    return 1;
  }
  const ecarts = ecartsDuRegistreEtDesFusions({
    taches,
    commits,
    prCourante: enCours,
    debut: lireLeDebut(),
  });
  if (ecarts.length === 0) {
    console.log(
      `✅ gov:registre-fusions — le registre suit les fusions (${commits.length} commits lus).`
    );
    return 0;
  }
  console.error(`❌ gov:registre-fusions — ${ecarts.length} écart(s) :`);
  for (const x of ecarts) console.error(`   [${x.famille}] ${x.message}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(principal());
}
