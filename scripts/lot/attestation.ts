/**
 * attestation.ts — attester une livraison qui a eu lieu dans un AUTRE dépôt. (GOV-038)
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
 * `scripts/gates/gov-attestation.ts --en-ligne`, jamais appelé par `pnpm test` ni par `pnpm gov:check`.
 */

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

export const FAMILLES_ATTESTATION = [
  'attestation_absente',
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
    if (a) {
      ajouter(
        'attestation_hors_sujet',
        `${t.id} est une tâche de CE dépôt (repo « ${t.repo} ») et porte une attestation ` +
          `inter-dépôt. Sa PR se cite par « pr », écrit par \`pnpm lot:cloture\` — le seul écrivain. ` +
          `Une attestation ici serait une seconde copie du même fait, à laisser diverger (RM-01).`
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
