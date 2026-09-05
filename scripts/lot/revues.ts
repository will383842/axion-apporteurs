/**
 * revues.ts — LE lecteur des revues d'une PR (REQ-GOV-010, REQ-GOV-011).
 *
 * POURQUOI CE FICHIER EXISTE. Il y avait DEUX lectures des revues, et elles ne lisaient pas la même
 * chose (RM-01, RM-04) : `scripts/gates/gov-pr.ts` filtrait l'état, exigeait une ligne `Verdict:`
 * et classait le dernier verdict par couple `poste·lentille` ; `scripts/lot/corps-de-pr.ts`, qui
 * COCHE la case de DoD « Relecteur ≠ auteur » du corps publié, ne lisait de chaque revue que
 * `body` et `commit_id`.
 *
 * QUATRE FAIBLESSES MESURÉES LE 2026-09-05 SUR `41bc814`, toutes dans le sens PERMISSIF —
 * c'est-à-dire qu'elles cochent une case qui devrait rester vide. Le dépôt est PUBLIC (W13) :
 * n'importe quel compte peut poser une revue de type commentaire.
 *
 *   1. AUCUNE AUTHENTIFICATION. `user.login`, `author_association` et `state` sont servis par la
 *      MÊME réponse et étaient ignorés — `state` était même déclaré dans le type et jamais
 *      consulté. Rejoué à l'identique sur les revues réelles : quatre avis forgés par un compte
 *      tiers cochaient la case ; un vrai « Verdict: refuse » de `securite` sur la tête, suivi d'un
 *      avis forgé, voyait son VETO EFFACÉ ; les quatre mêmes avis en état `DISMISSED` — donc
 *      retirés — cochaient aussi.
 *   2. `^A\d{2}` ACCEPTAIT `A99` : le numéro de poste n'était confronté à rien.
 *   3. LE DISCRIMINANT `schema` ÉTAIT PLUS FAIBLE QUE CELUI DE LA GATE QU'IL SUPPLÉE — un label
 *      posé à la main, là où la garde lit les FICHIERS de la PR. Une PR touchant `prisma/**` sans
 *      le label publiait « les 4 lentilles ont accepté » alors que la revue bloquante `schema`
 *      n'avait été demandée par personne.
 *   4. LA CLÉ DU « DERNIER VERDICT » DIVERGEAIT : par `lentille` seule d'un côté, par
 *      `poste·lentille` de l'autre. Un refus d'A02 sur `schema` suivi d'un accord d'un AUTRE poste
 *      sur la même lentille se cochait.
 *
 * LE REMÈDE N'EST PAS D'ALIGNER LA SECONDE LECTURE SUR LA PREMIÈRE : deux copies divergent
 * toujours, et celle qui est lue n'est jamais celle qui a été corrigée. C'est un lecteur UNIQUE,
 * importé par la garde ET par le composeur du corps. `scripts/lot/` est déjà importé par
 * `scripts/gates/` (`avancement.ts`, `registre-decisions.ts`) : c'est là qu'il vit.
 *
 * CE QUE CE LECTEUR TIENT POUR VRAI, ET POURQUOI :
 *
 *   a. UNE REVUE NE COMPTE QUE SI SON AUTEUR A LE DROIT DE JUGER. Le droit se lit sur
 *      `author_association`, servi par l'interface elle-même. Un compte sans lien avec le dépôt
 *      peut écrire ; il ne peut pas décider.
 *   b. UN ÉTAT RETIRÉ N'EST PAS UN AVIS. `DISMISSED` et `PENDING` ne sont pas des verdicts rendus.
 *   c. LE CODE DE POSTE EST CONFRONTÉ AU REGISTRE DES POSTES (`docs/agents.json`), jamais à une
 *      forme. Un code qui n'existe pas ne tient aucune lentille.
 *   d. LE DERNIER VERDICT PRIME, PAR COUPLE `poste·lentille` — et pas par lentille seule. Un poste
 *      qui relit et accepte efface SON refus ; il n'efface pas celui d'un autre. Sans la première
 *      moitié la garde redeviendrait insatisfiable (le piège de la PR 27) ; sans la seconde, un
 *      accord de complaisance effacerait un veto.
 *   e. LE SIGNAL `schema` EST LE PLUS STRICT DES TROIS DISPONIBLES : les fichiers de la PR, le
 *      champ `schema` des tâches qu'elle porte, le label. Le label seul est le plus faible — il se
 *      pose et s'oublie à la main.
 *   f. « RELECTEUR ≠ AUTEUR » EST MESURÉE AU NIVEAU OÙ ELLE EST DÉFINIE : le POSTE
 *      (`docs/CHARTE-AGENTS.md` §6 — « le code du champ `Auteur:` n'apparaît jamais dans
 *      `Relecteur:` »). Au niveau des COMPTES GitHub, ce dépôt n'en a qu'un (W13) : la propriété
 *      n'y est pas mesurable, et le lecteur le DIT au lieu de le supposer. On ne coche jamais ce
 *      qu'on ne mesure pas.
 *
 * SOURCE DE LA FORME LUE. `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`, enregistrée le
 * 2026-09-05 dans `tests/fixtures/github/revues-pr-31.json` (RM-03).
 * Confronte-a: docs/tiers/github.md#2-source-officielle — non confrontée : la rubrique 2 de la
 * fiche est vide à ce jour, et la fiche prescrit elle-même cette mention. Les valeurs
 * d'`author_association` retenues ci-dessous sont celles que l'interface sert pour une personne
 * ayant un droit d'écriture sur le dépôt ; leur confrontation à la documentation du tiers est la
 * dette nommée par la §8 de cette fiche, et elle appartient à `A01`.
 */

import { readFileSync } from 'node:fs';

export const CHEMIN_AGENTS = 'docs/agents.json';
export const CHEMIN_CHARTE = 'docs/CHARTE-AGENTS.md';

/** L'état d'une revue rendue, nommé une fois — les fixtures le citent au lieu de le retaper. */
export const ETAT_APPROUVE = 'APPROVED';
export const ETAT_COMMENTE = 'COMMENTED';

/**
 * CE QUI COMPTE COMME UNE REVUE RENDUE. `APPROVED` serait le bon état — c'est celui que
 * l'interface protège. Mais ce dépôt n'a QU'UN compte (W13), et l'interface refuse une
 * approbation venant de l'auteur de la PR : « Can not approve your own pull request ». Exiger
 * `APPROVED` rendait la garde INSATISFIABLE, et une gate que personne ne peut satisfaire est une
 * étape qu'on apprend à sauter. On accepte donc les deux, et on exige EN ÉCHANGE ce qu'un état ne
 * dit pas : une ligne `Verdict:`.
 *
 * `DISMISSED` n'y est pas, et c'est le témoin (1c) : un avis retiré cochait la case.
 */
export const ETATS_RENDUS: ReadonlySet<string> = new Set([ETAT_APPROUVE, ETAT_COMMENTE]);

/**
 * QUI A LE DROIT DE JUGER. Les trois valeurs d'`author_association` d'une personne ayant un droit
 * d'écriture sur le dépôt. Tout le reste — `NONE`, `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`,
 * `MANNEQUIN` — écrit sans décider.
 */
export const ASSOCIATIONS_HABILITEES: ReadonlySet<string> = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/** Les lentilles, nommées une fois (docs/CHARTE-AGENTS.md §6). */
export const LENTILLE_SIMPLICITE = 'simplicite';
export const LENTILLE_SCHEMA = 'schema';
export const LENTILLE_MUTATION = 'mutation';
const DEUX_PREMIERES = ['exactitude', 'securite'];

/** La ligne qui tranche. Un commentaire qui ne tranche pas ne compte pour aucune lentille. */
export const MOTIF_VERDICT = /^Verdict\s*:\s*(accepte|refuse)\b/im;

/** L'en-tête d'une revue : « A<nn> · <lentille> » (docs/CHARTE-AGENTS.md §3). */
const MOTIF_ENTETE = /^\s*(A\d{2})\s*[·\-–]\s*([a-zA-Zéè]+)/;

/** La forme servie par `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`. */
export type RevueBrute = {
  id?: number;
  user?: { login?: string | null } | null;
  author_association?: string | null;
  state?: string | null;
  commit_id?: string | null;
  submitted_at?: string | null;
  body?: string | null;
};

export type Revue = {
  compte: string;
  association: string;
  etat: string;
  corps: string;
  commit: string;
};

export type MotifEcart = 'etat_ecarte' | 'auteur_non_habilite' | 'sans_verdict' | 'sans_lentille' | 'poste_inconnu';

export type Verdict = {
  code: string;
  lentille: string;
  verdict: 'accepte' | 'refuse';
  commit: string;
  compte: string;
};

export type Lecture = {
  /** Les revues qui ont le droit de compter, et qui tranchent. */
  retenues: Revue[];
  ecartees: { revue: Revue; motif: MotifEcart }[];
  /** Le DERNIER verdict de chaque couple `poste·lentille`. */
  verdicts: Verdict[];
  /** Les lentilles exigées sans aucun accord retenu. */
  manquantes: string[];
  refusees: Verdict[];
  /** Les accords rendus sur une autre tête que celle qui sera fusionnée (pas 5 du protocole). */
  perimees: Verdict[];
  /** Les accords portés par le poste qui signe `Auteur:`. */
  auteurSeRelit: Verdict[];
  /** Vrai si au moins une revue retenue vient d'un compte ≠ de celui de l'auteur de la PR. */
  comptesDistinctsDeLAuteur: boolean;
  coche: boolean;
  raisons: string[];
  detail: string;
};

export type Entree = {
  revues: RevueBrute[];
  /**
   * LE LECTEUR REÇOIT LE SIGNAL, PAS LA LISTE — et c'est une défense, pas un détail de signature.
   *
   * La lentille `mutation` a fait survivre sur `41bc814` un mutant type-propre : la liste des
   * lentilles exigées TRONQUÉE à `['exactitude']` dans le composeur. `tsc` sortait 0, la suite
   * était verte à 387/387, et le corps publiait « les 1 lentilles (exactitude) ont accepté »
   * PENDANT QUE `securite` REFUSAIT. Une phrase qui a l'air dérivée et qui est fausse est pire
   * qu'un compteur tapé à la main : personne ne la met en doute.
   *
   * Un appelant ne peut donc pas transmettre un SOUS-ENSEMBLE : il transmet le fait « cette PR
   * touche au schéma », et c'est `lentillesExigees()` — une seule fonction, directement testée sur
   * son contenu ET sur son cardinal — qui décide de la liste. Tronquer la liste exige désormais de
   * muter cette fonction-là, et ce mutant-là rougit.
   */
  schema: boolean;
  /** Le sha de tête : le diff approuvé doit être le diff fusionné. */
  tete: string | null;
  /** Le code de poste lu sur la ligne `Auteur:` du corps de la PR. */
  auteurPoste: string | null;
  /** Le compte GitHub qui a ouvert la PR, s'il est connu. */
  auteurCompte?: string | null;
  /** Les codes de poste connus. Par défaut : `docs/agents.json`. */
  codes?: ReadonlySet<string>;
};

let codesEnCache: ReadonlySet<string> | null = null;

/** Les codes de poste, DÉRIVÉS du registre des postes — jamais une forme, jamais une liste. */
export function codesDePoste(chemin: string = CHEMIN_AGENTS): ReadonlySet<string> {
  if (chemin === CHEMIN_AGENTS && codesEnCache !== null) return codesEnCache;
  const doc = JSON.parse(readFileSync(chemin, 'utf8')) as { postes: { code: string }[] };
  const codes = new Set(doc.postes.map((p) => p.code));
  if (chemin === CHEMIN_AGENTS) codesEnCache = codes;
  return codes;
}

/**
 * Les chemins dont la modification exige la lentille `schema`, DÉRIVÉS de la §7 de la charte —
 * la même source que celle qui fait exiger le label. Ils étaient recopiés dans la garde (RM-01).
 */
export function cheminsSchema(charte: string = readFileSync(CHEMIN_CHARTE, 'utf8')): string[] {
  const debut = charte.indexOf('## 7.');
  const fin = charte.indexOf('## 8.');
  const section = debut < 0 ? '' : charte.slice(debut, fin < 0 ? undefined : fin);
  for (const ligne of section.split('\n')) {
    if (!ligne.startsWith('|')) continue;
    const cellules = ligne.split('|').slice(1, -1).map((c) => c.trim());
    if (cellules.length < 4) continue;
    if (cellules[2]!.replace(/`/g, '').trim() !== LENTILLE_SCHEMA) continue;
    const chemins = cellules[0]!
      .split(',')
      .map((c) => c.replace(/`/g, '').replace(/\(.*\)/g, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);
    if (chemins.length > 0) return chemins;
  }
  throw new Error(
    `${CHEMIN_CHARTE} §7 ne déclare plus de ligne portant le label « ${LENTILLE_SCHEMA} » : ` +
      `les chemins de schéma ne peuvent pas en être dérivés, et aucune liste ne les remplace ici (RM-01).`
  );
}

/** Un chemin réservé est touché par la PR ? (préfixe de répertoire, ou fichier exact) */
export function touche(chemin: string, fichiers: readonly string[]): boolean {
  const c = chemin.replace(/\/$/, '');
  return fichiers.some((f) => f === chemin || f === c || f.startsWith(c + '/'));
}

/**
 * LE DISCRIMINANT `schema`, ET LE PLUS STRICT GAGNE. Trois signaux, du plus fort au plus faible :
 * les FICHIERS de la PR, le champ `schema` des tâches qu'elle porte, le label. Le label seul était
 * la lecture du composeur : il se pose à la main, donc il s'oublie à la main.
 */
export function toucheSchema(entree: {
  fichiers: readonly string[];
  labels: readonly string[];
  tachesSchema: boolean;
  charte?: string;
}): boolean {
  if (entree.tachesSchema) return true;
  if (entree.labels.includes(LENTILLE_SCHEMA)) return true;
  return cheminsSchema(entree.charte).some((c) => touche(c, entree.fichiers));
}

/**
 * Les lentilles exigées. Sur une PR `schema`, A02 REMPLACE la troisième (`simplicite`) : le compte
 * ne change pas, l'une d'elles change de titulaire (charte §6, `docs/CONVENTIONS.md` §5).
 */
export function lentillesExigees(schema: boolean): { trois: readonly string[]; toutes: readonly string[] } {
  const trois = [...DEUX_PREMIERES, schema ? LENTILLE_SCHEMA : LENTILLE_SIMPLICITE];
  return { trois, toutes: [...trois, LENTILLE_MUTATION] };
}

function normaliser(brute: RevueBrute): Revue {
  return {
    compte: brute.user?.login ?? '',
    association: (brute.author_association ?? '').toUpperCase(),
    etat: (brute.state ?? '').toUpperCase(),
    corps: brute.body ?? '',
    commit: brute.commit_id ?? '',
  };
}

/** La lentille d'une revue : son en-tête, et son code CONFRONTÉ au registre des postes. */
export function lentilleDeLaRevue(
  corps: string,
  codes: ReadonlySet<string>
): { code: string; lentille: string } | { motif: 'sans_lentille' | 'poste_inconnu' } {
  const m = MOTIF_ENTETE.exec(corps.split('\n')[0] ?? '');
  if (!m) return { motif: 'sans_lentille' };
  if (!codes.has(m[1]!)) return { motif: 'poste_inconnu' };
  return { code: m[1]!, lentille: m[2]!.toLowerCase() };
}

export function lireRevues(entree: Entree): Lecture {
  const codes = entree.codes ?? codesDePoste();
  const exigees = [...lentillesExigees(entree.schema).toutes];
  const retenues: Revue[] = [];
  const ecartees: { revue: Revue; motif: MotifEcart }[] = [];
  const dernierPar = new Map<string, Verdict>();

  for (const brute of entree.revues) {
    const r = normaliser(brute);
    if (!ETATS_RENDUS.has(r.etat)) {
      ecartees.push({ revue: r, motif: 'etat_ecarte' });
      continue;
    }
    if (!ASSOCIATIONS_HABILITEES.has(r.association)) {
      ecartees.push({ revue: r, motif: 'auteur_non_habilite' });
      continue;
    }
    const v = MOTIF_VERDICT.exec(r.corps);
    if (!v) {
      ecartees.push({ revue: r, motif: 'sans_verdict' });
      continue;
    }
    const l = lentilleDeLaRevue(r.corps, codes);
    if ('motif' in l) {
      ecartees.push({ revue: r, motif: l.motif });
      continue;
    }
    retenues.push(r);
    // Le DERNIER verdict prime, par couple `poste·lentille` : un poste efface son propre refus en
    // relisant, jamais celui d'un autre.
    dernierPar.set(`${l.code}·${l.lentille}`, {
      code: l.code,
      lentille: l.lentille,
      verdict: v[1]!.toLowerCase() as 'accepte' | 'refuse',
      commit: r.commit,
      compte: r.compte,
    });
  }

  const verdicts = [...dernierPar.values()];
  const accords = verdicts.filter((x) => x.verdict === 'accepte');
  const manquantes = exigees.filter((l) => !accords.some((x) => x.lentille === l));
  const refusees = verdicts.filter((x) => x.verdict === 'refuse');
  const perimees =
    entree.tete === null || entree.tete === ''
      ? []
      : accords.filter((x) => exigees.includes(x.lentille) && x.commit !== entree.tete);
  const auteurSeRelit = entree.auteurPoste === null ? [] : accords.filter((x) => x.code === entree.auteurPoste);
  const comptesDistinctsDeLAuteur =
    entree.auteurCompte === null || entree.auteurCompte === undefined
      ? false
      : retenues.some((r) => r.compte !== '' && r.compte !== entree.auteurCompte);

  const tete7 = (entree.tete ?? '').slice(0, 7);
  const raisons: string[] = [];
  if (entree.tete === null || entree.tete === '') {
    raisons.push('tête de la PR inconnue : la péremption des avis n’est pas mesurable');
  }
  if (entree.auteurPoste === null) {
    raisons.push('`Auteur:` illisible dans le corps : « Relecteur ≠ auteur » n’est pas mesurable');
  }
  if (manquantes.length > 0) raisons.push(`manquante(s) : ${manquantes.join(', ')}`);
  if (refusees.length > 0) {
    raisons.push(`en refus : ${refusees.map((x) => `${x.code} · ${x.lentille}`).join(', ')}`);
  }
  if (perimees.length > 0) {
    raisons.push(
      `périmée(s) sur une autre tête que ${tete7} : ` +
        perimees.map((x) => `${x.lentille} (jugé ${x.commit.slice(0, 7)})`).join(', ')
    );
  }
  if (auteurSeRelit.length > 0) {
    raisons.push(
      `l’auteur ${entree.auteurPoste} rend lui-même : ${auteurSeRelit.map((x) => x.lentille).join(', ')}`
    );
  }
  if (ecartees.length > 0) {
    const parMotif = new Map<MotifEcart, number>();
    for (const e of ecartees) parMotif.set(e.motif, (parMotif.get(e.motif) ?? 0) + 1);
    raisons.push(
      `avis écarté(s) : ${[...parMotif.entries()].map(([m, n]) => `${n} ${m}`).join(', ')}`
    );
  }

  const coche =
    entree.tete !== null &&
    entree.tete !== '' &&
    entree.auteurPoste !== null &&
    manquantes.length === 0 &&
    refusees.length === 0 &&
    perimees.length === 0 &&
    auteurSeRelit.length === 0;

  const detail = coche
    ? `les ${exigees.length} lentilles (${exigees.join(', ')}) ont accepté sur ${tete7} — ` +
      `« Relecteur ≠ auteur » vérifiée au niveau du poste (${entree.auteurPoste} ne rend aucun de ces avis, ` +
      `charte §6)` +
      (comptesDistinctsDeLAuteur
        ? ''
        : `, et NON au niveau des comptes GitHub : toutes les revues retenues viennent du compte de ` +
          `l’auteur, ce dépôt n’en a qu’un (W13)`)
    : raisons.join(' · ');

  return {
    retenues,
    ecartees,
    verdicts,
    manquantes,
    refusees,
    perimees,
    auteurSeRelit,
    comptesDistinctsDeLAuteur,
    coche,
    raisons,
    detail,
  };
}

/**
 * LE LECTEUR HÉRITÉ — celui de `caseRevues()` AVANT le correctif. Il est conservé ici comme
 * FIXTURE DE LA RÉGRESSION, et il n'est JAMAIS consulté pour juger quoi que ce soit : il sert aux
 * témoins de `tests/unit/gouvernance/revues-lecteur-unique.spec.ts` à montrer, sur les revues
 * réelles, ce que l'ancienne lecture cochait. Sans lui, « la garde a rougi » serait une
 * affirmation ; avec lui, c'est une mesure qui se rejoue à chaque suite (RM-02).
 *
 * Il ne lit ni `state`, ni `author_association`, ni `user.login` ; son motif d'en-tête accepte
 * n'importe quel numéro de poste ; sa clé est la lentille seule ; son discriminant `schema` est le
 * label. Ne rien y corriger : c'est le défaut, verbatim.
 */
export function lireRevuesHerite(entree: {
  revues: RevueBrute[];
  labels: readonly string[];
  tete: string;
}): { marque: string; detail: string } {
  const lentilles = [
    ...(entree.labels.includes('schema')
      ? ['exactitude', 'securite', 'schema']
      : ['exactitude', 'securite', 'simplicite']),
    'mutation',
  ];
  const dernier = new Map<string, { verdict: string; commit: string }>();
  for (const r of entree.revues) {
    const l = lentilles.find((x) => new RegExp(`^A\\d{2}\\s*·\\s*${x}\\b`, 'im').test(r.body ?? ''));
    const v = /^Verdict\s*:\s*(accepte|refuse)\b/im.exec(r.body ?? '');
    if (!l || !v) continue;
    dernier.set(l, { verdict: v[1]!.toLowerCase(), commit: r.commit_id ?? '' });
  }
  const manquantes = lentilles.filter((l) => !dernier.has(l));
  const refusees = [...dernier.entries()].filter(([, d]) => d.verdict === 'refuse').map(([l]) => l);
  const perimees = [...dernier.entries()]
    .filter(([, d]) => d.verdict === 'accepte' && d.commit !== entree.tete)
    .map(([l, d]) => `${l} (jugé ${d.commit.slice(0, 7)})`);
  if (manquantes.length || refusees.length || perimees.length) {
    return {
      marque: '[ ]',
      detail: [
        manquantes.length ? `manquante(s) : ${manquantes.join(', ')}` : '',
        refusees.length ? `en refus : ${refusees.join(', ')}` : '',
        perimees.length ? `périmée(s) : ${perimees.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }
  return { marque: '[x]', detail: `les ${lentilles.length} lentilles ont accepté` };
}
