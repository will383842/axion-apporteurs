/**
 * attestation.ts — attester une livraison : ailleurs (GOV-038), et ici aussi (GOV-042).
 *
 * LE TROU QU'ELLE BOUCHE, mesuré le 2026-09-05. `INT-T01b` (`repo: "axionia"`) est la PREMIÈRE des
 * quatorze tâches `repo` ≠ `partners` jamais livrée : PR 998 du dépôt `will383842/axion-ia`,
 * fusionnée par le commit `41d71a71…`, en production depuis 12:13Z. Le backlog n'avait AUCUN champ
 * pour le dire. Les deux écritures possibles étaient toutes deux fausses :
 *
 *   — `pr: 998`. `scripts/plan-state/build.ts` rendait `PR#${t.pr}` SANS qualifier le dépôt : la vue
 *     aurait publié « INT-T01b (A01) PR#998 », et `gh api repos/will383842/axion-apporteurs/pulls/998`
 *     rend 404. C'est la famille que RM-12 nomme — une attribution qui ne RÉSOUT pas — et qu'aucune
 *     garde ne voyait, `gov:identifiants` jugeant la FORME d'un identifiant, jamais sa résolution ;
 *   — `motif: "livrée dans axionia"`. Le champ vaut `null` sur les 206 tâches, il est réservé au
 *     motif d'un BLOCAGE (schéma : obligatoire si `statut = bloquee`), et `build.ts` le colle au
 *     titre. Une prose n'est pas une référence.
 *
 * CE QUE PORTE L'ATTESTATION, ET CE QU'ELLE NE PORTE PAS.
 *
 *   `{ pr, sha, fusionneeAt }` — et le dépôt N'EST PAS RECOPIÉ dedans. Il est déjà porté par le
 *   champ `repo` de la tâche, requis sur les 206 ; la coordonnée de forge s'en DÉRIVE par `DEPOTS`
 *   ci-dessous (RM-01). Un `depot: "will383842/axion-ia"` écrit à côté d'un `repo: "axionia"` serait
 *   une seconde copie de la même vérité, et deux copies divergent toujours — c'est très exactement
 *   la faute que ce dépôt a payée cinq fois sur l'ensemble « livrée » (`scripts/lot/avancement.ts`).
 *
 *   LE SHA EST CE QUI COMPTE, et il est exigé ENTIER. Un numéro de PR est réattribué dans chaque
 *   dépôt : `#998` désigne deux objets distincts selon la forge qu'on interroge, et c'est ce qui
 *   rend `PR#998` indécidable. Un SHA de 40 hexadécimaux, lui, ne désigne qu'un commit. Un SHA
 *   COURT n'est pas accepté : sa non-ambiguïté est une propriété de la TAILLE du dépôt au moment où
 *   on l'abrège, pas de la valeur — elle se périme sans prévenir.
 *
 * CE QUE CE MODULE NE FAIT PAS : il n'INTERROGE PAS la forge. Une garde qui lance `gh` rend la
 * suite non déterministe — mesuré le 2026-09-05 sur cet arbre, `pnpm test` a rendu 1, puis 0, puis 0
 * sans qu'une ligne ait changé. Une valeur dérivée d'une source non reproductible n'est pas dérivée,
 * elle est ÉCHANTILLONNÉE. La vérification en ligne existe, et elle est dans un mode SÉPARÉ :
 * `scripts/gates/gov-attestation.ts --en-ligne`, jamais appelé par `pnpm test` ni par `pnpm gov:partiel`.
 */

import { execFileSync } from 'node:child_process';

/**
 * Les dépôts de forge que le backlog connaît, indexés par la valeur du champ `repo`.
 * `null` = la valeur ne désigne aucun dépôt de code (`externe` : une réponse attendue d'un tiers).
 *
 * C'est LA source de la correspondance étiquette → coordonnée de forge. `docs/CONVENTIONS.md` §5
 * pose déjà le principe pour les ADR (REQ-GOV-008 : « toute référence croisée est qualifiée par
 * dépôt — `axionia/ADR-0014`, `partners/ADR-0003` ») ; une référence de PR obéit à la même règle.
 */
export const DEPOTS: Record<string, string | null> = {
  partners: 'will383842/axion-apporteurs',
  axionia: 'will383842/axion-ia',
  externe: null,
};

/** Le dépôt DANS lequel ce backlog vit. Une PR de ce dépôt-là se cite sans qualifier. */
export const DEPOT_LOCAL = 'partners';

/** L'attestation d'une livraison hors de ce dépôt. */
export type Attestation = {
  /** Numéro de la PR DANS le dépôt de la tâche. Ne résout pas ici — c'est tout le problème. */
  pr: number;
  /** SHA ENTIER (40 hex minuscules) du commit de fusion. La seule valeur non réattribuable. */
  sha: string;
  /** Instant de la fusion, ISO 8601 UTC (`docs/CONVENTIONS.md` §3 : stockage en UTC, suffixe `…At`). */
  fusionneeAt: string;
};

/** Une tâche, vue par ce module. Le reste du backlog ne l'intéresse pas. */
export type TacheAttestable = {
  id: string;
  repo: string;
  statut: string;
  pr?: number | null;
  branch?: string | null;
  attestation?: Attestation | null;
};

export type FauteAttestation = { famille: string; message: string };

/**
 * Le SHA est exigé ENTIER et en minuscules. Le motif ne vit qu'ICI : `scripts/lot/tasks.schema.json`
 * ne le recopie PAS (un JSON ne peut pas importer, et une seconde écriture du même motif est une
 * copie à laisser diverger — RM-01). Le schéma décrit la FORME (objet, trois clés, types) ; le
 * contenu des chaînes est jugé ici, avec un message qui nomme la faute.
 */
export const MOTIF_SHA = /^[0-9a-f]{40}$/;

/** ISO 8601 en UTC, à la seconde, suffixe `Z` — la forme que rend `gh api … --jq .commit.committer.date`. */
export const MOTIF_FUSIONNEE_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// ── le rattrapage du passé (GOV-042) ─────────────────────────────────────────
/**
 * UN SHA NE S'INVENTE PAS, IL SE LIT. Les tâches de ce dépôt livrées avant GOV-042 n'ont aucune
 * attestation. Le SHA manquant se LIT dans l'historique de la branche par défaut : le commit
 * d'ATTERRISSAGE est celui dont le sujet se termine par la référence de la PR de la tâche —
 * `(#<pr>)`, la forme qu'écrit la fusion par écrasement — et dont le message NOMME la tâche,
 * identifiant entier (un préfixe ne compte pas). Sans `pr`, tout commit qui la nomme est candidat.
 * Zéro candidat ou plus d'un : la recherche ÉCHOUE, l'attestation reste vide, et la tâche est
 * NOMMÉE. Un enregistrement fabriqué serait pire que l'absence qu'il remplacerait.
 */
export type CommitDeFusion = {
  sha: string;
  /** Instant du commit, ramené en UTC à la seconde (`MOTIF_FUSIONNEE_AT`). */
  fusionneeAt: string;
  message: string;
};

/** L'historique d'une référence git, lu une fois ; `null` n'existe pas — git qui échoue LÈVE. */
export function lireJournalDeFusion(ref: string): CommitDeFusion[] {
  const brut = execFileSync('git', ['log', '--format=%H%x1f%cI%x1f%B%x1e', ref], {
    encoding: 'utf8',
    maxBuffer: 256e6,
  });
  return brut
    .split('\x1e')
    .map((s) => s.replace(/^\n/, ''))
    .filter((s) => s.length > 0)
    .map((s) => {
      const [sha, quand, message] = s.split('\x1f');
      const fusionneeAt = new Date(quand!).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return { sha: sha!, fusionneeAt, message: message ?? '' };
    });
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Les commits d'atterrissage candidats d'une tâche — la règle ci-dessus, et elle seule. */
export function commitsDAtterrissage(
  t: { id: string; pr?: number | null },
  journal: readonly CommitDeFusion[]
): CommitDeFusion[] {
  const nomme = new RegExp(`(?<![A-Za-z0-9-])${echapper(t.id)}(?![A-Za-z0-9-])`);
  const sujet = (c: CommitDeFusion) => c.message.split('\n')[0]!.trimEnd();
  const candidats = t.pr != null ? journal.filter((c) => sujet(c).endsWith(`(#${t.pr})`)) : journal;
  return candidats.filter((c) => nomme.test(c.message));
}

/**
 * LE PASSIF QUE LA RECHERCHE NE SAIT PAS LEVER — déclaré, jamais deviné. Chaque entrée est
 * confrontée à l'historique réel par `un-statut-fusionnee-porte-sa-preuve.spec.ts` : si la
 * recherche y trouve un jour UN commit, l'entrée doit sortir. Une entrée qui reçoit une
 * attestation rougit (`attestation_passif_perime`). La liste ne peut que DÉCROÎTRE : toute
 * clôture future pose l'attestation, `pnpm lot:cloture` refusant de clore sans elle.
 *
 * MESURÉ le 2026-09-27 sur `origin/main` : 81 tâches de ce dépôt livrées, 73 rattrapées par la
 * règle, 8 échecs — ceux-ci. Les chiffres se remesurent (`--rattraper-attestations --a-blanc`).
 */
const MOTIF_PR_26 =
  'PR 26 fusionnée par un commit de FUSION (« Merge pull request #26 »), pas par écrasement : ' +
  'aucun commit ne porte « (#26) » en fin de sujet en nommant la tâche — zéro candidat.';
export const PASSIF_SANS_ATTESTATION: readonly { id: string; motif: string }[] = [
  {
    id: 'GOV-000',
    motif:
      'aucun `pr` (socle posé avant le premier lot) : la recherche par identifiant rend DOUZE ' +
      'commits qui la nomment — ambigu, rien n’est choisi.',
  },
  { id: 'GOV-002', motif: MOTIF_PR_26 },
  { id: 'GOV-004', motif: MOTIF_PR_26 },
  { id: 'GOV-007', motif: MOTIF_PR_26 },
  { id: 'GOV-009', motif: MOTIF_PR_26 },
  { id: 'GOV-015', motif: MOTIF_PR_26 },
  { id: 'GOV-017b', motif: MOTIF_PR_26 },
  { id: 'QA-T00', motif: MOTIF_PR_26 },
];
const PASSIF_PAR_ID: ReadonlySet<string> = new Set(PASSIF_SANS_ATTESTATION.map((p) => p.id));

/** Ce que le rattrapage rend : des attestations LUES, et des échecs NOMMÉS. */
export type Rattrapage = {
  rattrapees: { id: string; attestation: Attestation }[];
  echecs: { id: string; trouves: number }[];
};

/** Le rattrapage des tâches de CE dépôt, livrées et sans attestation. Pur : il n'écrit rien. */
export function rattraper(
  taches: readonly TacheAttestable[],
  journal: readonly CommitDeFusion[],
  estLivree: (t: TacheAttestable) => boolean
): Rattrapage {
  const r: Rattrapage = { rattrapees: [], echecs: [] };
  for (const t of taches) {
    if (t.repo !== DEPOT_LOCAL || !estLivree(t) || t.attestation) continue;
    const trouves = commitsDAtterrissage(t, journal);
    const pr = t.pr ?? null;
    if (trouves.length !== 1 || pr === null) {
      r.echecs.push({ id: t.id, trouves: trouves.length });
      continue;
    }
    const c = trouves[0]!;
    r.rattrapees.push({ id: t.id, attestation: { pr, sha: c.sha, fusionneeAt: c.fusionneeAt } });
  }
  return r;
}

export const FAMILLES_ATTESTATION = [
  'attestation_absente',
  'attestation_pr_discordante',
  'attestation_passif_perime',
  'attestation_hors_sujet',
  'attestation_sans_livraison',
  'attestation_sha_non_conforme',
  'attestation_date_non_conforme',
  'pr_nu_hors_depot',
  'livraison_repo_externe',
] as const;

/** Le dépôt de forge d'une tâche, ou `null` si son `repo` n'en désigne aucun. */
export function depotDeLaTache(t: { repo: string }): string | null {
  return DEPOTS[t.repo] ?? null;
}

/**
 * LA RÉFÉRENCE LISIBLE de la PR d'une tâche, ou `null` si la tâche n'en porte aucune.
 *
 * C'est le SEUL endroit du dépôt qui compose une référence de PR à partir d'une tâche. `PR#31`
 * pour une PR de CE dépôt — elle y résout, et la qualifier alourdirait 1 400 lignes de vues pour
 * rien. `will383842/axion-ia#998 (41d71a7)` pour une PR d'ailleurs : c'est la forme que GitHub
 * lui-même auto-lie entre dépôts, et le SHA court en fin de ligne dit à un lecteur pressé QUEL
 * commit aller voir. Jamais `PR#998` : ce nombre-là ne désigne rien ici.
 *
 * LE CAS DÉGRADÉ EST RENDU, PAS TU. Une tâche hors dépôt qui porte un `pr` nu est une faute que
 * `gov:tasks` refuse (famille `pr_nu_hors_depot`) ; tant qu'elle existe, la vue doit le DIRE plutôt
 * que d'imprimer un nombre qui ne résout pas. Un rendu qui masque la faute laisse la vue mentir
 * pendant que la garde crie ailleurs.
 */
export function referencePr(t: TacheAttestable): string | null {
  if (t.repo === DEPOT_LOCAL) return t.pr == null ? null : `PR#${t.pr}`;
  const a = t.attestation;
  const depot = depotDeLaTache(t);
  if (!a) return t.pr == null ? null : `pr ${t.pr} NON QUALIFIÉ (repo ${t.repo})`;
  const court = MOTIF_SHA.test(a.sha) ? a.sha.slice(0, 7) : a.sha;
  return `${depot ?? `repo:${t.repo}`}#${a.pr} (${court})`;
}

/**
 * Les fautes d'attestation d'UNE tâche. `estLivree` est passée en paramètre plutôt que recalculée :
 * l'ensemble « livrée » a une source unique (`scripts/lot/avancement.ts`), et ce module ne va pas
 * en faire une sixième copie.
 */
export function controlerAttestation(t: TacheAttestable, estLivree: boolean): FauteAttestation[] {
  const fautes: FauteAttestation[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  const a = t.attestation ?? null;
  const local = t.repo === DEPOT_LOCAL;
  const depot = depotDeLaTache(t);

  if (local) {
    // GOV-042 — LA MÊME ATTESTATION, ÉTENDUE À CE DÉPÔT. Elle était refusée ici (« hors sujet »),
    // et une tâche locale passait `fusionnee` avec un `pr` nu, sans que rien ne conserve le commit
    // qui l'avait fait atterrir. Le `pr` reste l'écriture de `pnpm lot:cloture` ; l'attestation
    // lui ajoute le SHA, et son numéro ne peut pas en DIVERGER (une seule vérité, RM-01).
    const auPassif = PASSIF_PAR_ID.has(t.id);
    if (a) {
      if (auPassif) {
        ajouter(
          'attestation_passif_perime',
          `${t.id} porte une attestation et figure encore au passif déclaré sans attestation ` +
            `(PASSIF_SANS_ATTESTATION, scripts/lot/attestation.ts). Retire-la du passif : une ` +
            `exemption qui survit à sa raison exempte ce qu'elle n'a plus besoin d'exempter.`
        );
      }
      if (t.pr != null && a.pr !== t.pr) {
        ajouter(
          'attestation_pr_discordante',
          `${t.id} porte « pr: ${t.pr} » et une attestation de la PR ${a.pr}. Dans ce dépôt, les ` +
            `deux désignent la MÊME PR : deux numéros différents sont deux copies qui ont divergé.`
        );
      }
    } else if (estLivree && !auPassif && (t.pr != null || t.branch != null)) {
      // Une tâche livrée SANS aucune écriture (ni `pr`, ni `branch`) est déjà refusée par
      // `etat_cible_sans_operation` : la juger ici ferait rougir la même faute deux fois.
      ajouter(
        'attestation_absente',
        `${t.id} est « ${t.statut} » dans CE dépôt et ne porte aucune attestation : rien ne ` +
          `conserve le commit qui l'a fait atterrir. \`pnpm lot:cloture\` la pose à la clôture ; ` +
          `pour le passé, \`npx tsx scripts/lot/cloture.ts --rattraper-attestations\` la LIT dans ` +
          `l'historique de la branche par défaut — jamais à la main.`
      );
    }
  } else if (depot === null) {
    // `repo: "externe"` — une réponse attendue d'un tiers, pas du code. Exiger une attestation
    // serait une gate INSATISFIABLE, et une gate insatisfiable finit par se faire sauter.
    if (a) {
      ajouter(
        'attestation_hors_sujet',
        `${t.id} porte repo « ${t.repo} », qui ne désigne AUCUN dépôt de code : il n'y a ni PR ` +
          `ni commit à attester. Retire l'attestation, ou corrige le repo.`
      );
    }
    if (estLivree) {
      ajouter(
        'livraison_repo_externe',
        `${t.id} est « ${t.statut} » avec repo « ${t.repo} » : rien ne peut l'attester, puisque ` +
          `aucun dépôt ne porte son code. Une réponse de tiers se clôt par une levée d'attente, ` +
          `pas par une livraison.`
      );
    }
  } else {
    if (t.pr != null) {
      ajouter(
        'pr_nu_hors_depot',
        `${t.id} vit dans ${depot} et porte « pr: ${t.pr} » NU. Ce numéro est lu comme une PR de ce ` +
          `dépôt-ci partout où il est rendu, et repos/${DEPOTS[DEPOT_LOCAL]}/pulls/${t.pr} ne ` +
          `résout pas. Le numéro va dans « attestation.pr », qui sait de quel dépôt il parle.`
      );
    }
    if (estLivree && !a) {
      ajouter(
        'attestation_absente',
        `${t.id} est « ${t.statut} » et vit dans ${depot}, pas ici. Aucune trace de sa livraison ` +
          `n'existe dans ce dépôt : ni PR qui résout, ni commit dans cet historique. Donne-lui son ` +
          `« attestation » — { pr, sha (40 hex), fusionneeAt } — ou le backlog affirme une livraison ` +
          `que rien ne permet de retrouver.`
      );
    }
  }

  if (a) {
    if (!estLivree) {
      ajouter(
        'attestation_sans_livraison',
        `${t.id} porte une attestation de fusion (${depot ?? t.repo}#${a.pr}) alors que son statut ` +
          `est « ${t.statut} ». Une livraison attestée et non déclarée est le pire des deux mondes : ` +
          `le composeur la juge éligible et la refera.`
      );
    }
    if (!MOTIF_SHA.test(a.sha)) {
      ajouter(
        'attestation_sha_non_conforme',
        `${t.id} : « attestation.sha » vaut « ${a.sha} », qui n'a pas la forme d'un SHA (40 ` +
          `hexadécimaux minuscules). Un numéro de PR, un SHA abrégé ou une prose n'attestent rien : ` +
          `le SHA entier est la seule valeur de cette attestation qu'aucun autre dépôt ne réattribue.`
      );
    }
    if (!MOTIF_FUSIONNEE_AT.test(a.fusionneeAt) || Number.isNaN(Date.parse(a.fusionneeAt))) {
      ajouter(
        'attestation_date_non_conforme',
        `${t.id} : « attestation.fusionneeAt » vaut « ${a.fusionneeAt} », qui n'est pas un instant ` +
          `ISO 8601 en UTC (AAAA-MM-JJTHH:MM:SSZ). Une date locale comparée à une autre horloge est ` +
          `un instrument qui ment (docs/CONVENTIONS.md §3) — 48 minutes s'y sont lues « 3 heures ».`
      );
    }
  }

  return fautes;
}
