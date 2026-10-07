/**
 * cloture.ts — écrit dans `docs/tasks.json` le résultat d'un lot. C'est le SEUL écrivain de statut.
 *
 * USAGE   : pnpm lot:cloture -- --lot <lotId> [--owner <Axx>] [--commit]
 *           pnpm lot:cloture -- --tache <id> --pr <n> [--owner <Axx>] [--commit]   (tâche seule, GOV-057)
 * ENTRÉES : docs/lots/<lotId>/lot.json (le PÉRIMÈTRE du lot) · docs/lots/<lotId>/resultat.json (le
 *           rendu du workflow, écrit tel quel par la session à la fin de l'étape 4 du SKILL) ·
 *           en mode `--tache`, la PR lue sur la forge (`gh pr view`) : sha, instant, branche
 * SORTIE  : docs/tasks.json mis à jour (statut, pr, branch, owner, lot, attempts, motif)
 *
 * POURQUOI CE SCRIPT EXISTE
 *   L'éligibilité du composeur et tout PLAN-STATE se calculent sur `t.statut` lu dans `docs/tasks.json`.
 *   Le SKILL ne mettait à jour que des LABELS d'issue, et le workflow n'écrivait rien : au deuxième
 *   `/lot`, les tâches fusionnées étaient encore `a_faire`, le composeur recomposait le même lot, et
 *   PLAN-STATE affichait « 0/25 terminées » à vie. Les labels d'issue restent une VUE ; la source des
 *   statuts est ce fichier, et cet écrivain-ci.
 *
 * INVARIANTS
 *   - LE RENDU NE DÉCIDE PAS DE SON PROPRE PÉRIMÈTRE (GOV-041). Une tâche que le lot ne déclare pas ne
 *     reçoit RIEN — pas même `t.lot`. Le 2026-09-09, un dixième `resultat.json` déposé pour une tâche
 *     d'un AUTRE lot, jamais dans la PR, a fait écrire dix `fusionnee` sans un mot, puis `gov:check`
 *     15/15 et `vitest` 614/614 : la clôture posait `t.lot = lotId` INCONDITIONNELLEMENT et ne lisait
 *     nulle part la liste des tâches du lot.
 *   - UNE ABSENCE N'EST PAS UNE AUTORISATION (GOV-041). Un `lotId` absent du rendu est refusé comme
 *     un `lotId` faux ; un périmètre introuvable est refusé, jamais lu comme un périmètre vide.
 *   - une tâche n'est `fusionnee` que si sa PR a ATTERRI (`fusion.atterri === true`) : une PR fusionnée
 *     dont l'atterrissage n'est pas vérifié n'est pas une tâche livrée.
 *   - une tâche non livrée repart `a_faire` avec `attempts++`, et bascule `bloquee` à la deuxième.
 *   - `fusionnee` exige `owner` et `branch` (schéma) : le script REFUSE d'écrire un état invalide.
 *   - une tâche dont le `repo` n'est pas celui-ci ne reçoit JAMAIS de `pr` : le numéro d'une PR
 *     d'ailleurs, écrit nu, est rendu `PR#998` par les vues et ne résout pas. Elle reçoit une
 *     `attestation` — { pr, sha entier, fusionneeAt } — et le script REFUSE de clore sans le SHA
 *     du commit de fusion (GOV-038). Fermer en silence sur un SHA manquant écrirait une livraison
 *     que plus personne ne pourrait retrouver.
 *   - le script ne DÉCIDE rien : il transcrit le rendu du workflow. Aucune interprétation.
 *
 * ⛔ DEUX MODES, ET L'IMPORT N'EN EST PAS UN. Tout ce qui lit des fichiers, des arguments, ou écrit,
 * vit dans `principal()`, appelé sous `LANCE_EN_SCRIPT` : importer ce module n'a AUCUN effet. La
 * règle, elle, est exportée — `controlerLePerimetre()`, `perimetreDuLot()`, `cloturerLeLot()`,
 * `cloturerUneTacheSeule()` — et
 * c'est elle que la spécification APPELLE. Ce n'est pas du confort : tant que le module lisait
 * `process.argv` à l'import, `import` levait `Argument --lot manquant.` à la collecte, aucun test ne
 * pouvait atteindre sa règle, et le seul témoin possible aurait été la lecture du TEXTE de ce
 * fichier — une garde réduite à une orthographe ne garde rien (patron de `scripts/plan-state/build.ts`
 * et de `scripts/lot/composer.ts`).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEPOT_LOCAL,
  PASSIF_SANS_ATTESTATION,
  controlerAttestation,
  depotDeLaTache,
  lireJournalDeFusion,
  rattraper,
  referencePr,
  type Attestation,
  type TacheAttestable,
} from './attestation';
import { LIVREE } from './avancement';
import { outilHorsDepot } from './chemins-de-tache';
import { CHEMIN_SCHEMA_DES_TACHES, idDuTitre, lireLeLot, tachesDeLaPr } from './revues';

export interface Tache {
  id: string;
  titre: string;
  statut: string;
  owner?: string | null;
  lot?: string | null;
  branch?: string | null;
  pr?: number | null;
  attempts?: number;
  motif?: string | null;
  issue?: number | null;
  repo?: string;
  attestation?: Attestation | null;
}

export interface Resultat {
  dev?: {
    taskId?: string;
    branch?: string;
    pr?: number | null;
    stop?: { motif?: string; ref?: string } | null;
  } | null;
  fusion?: {
    pr?: number | null;
    sha?: string | null;
    fusionneeAt?: string | null;
    atterri?: boolean;
    motif?: string;
  } | null;
  refuse?: boolean;
  motif?: string;
}

/** Le rendu du workflow, tel que la session l'écrit dans `docs/lots/<lotId>/resultat.json`. */
export interface Rendu {
  lotId?: string;
  resultats?: (Resultat | null)[];
  stops?: { tache?: string; motif?: string; ref?: string }[];
}

/** Un refus de clôture : une FAMILLE nommée, et le message que l'opérateur lira. */
export interface RefusDeCloture {
  famille: string;
  message: string;
}

/**
 * Les identifiants que le RENDU nomme, tous chemins d'entrée confondus.
 * ⚠️ `stops` EN FAIT PARTIE. Un contrôle rangé sous la condition qui l'a fait naître garde la moitié
 * des cas : le défaut a été vu sur `resultats`, mais `stops[].tache` est le second endroit où un
 * rendu nomme une tâche, et rien n'obligeait ces deux listes à parler du même lot.
 */
function tachesNommeesParLeRendu(rendu: Rendu): string[] {
  const vus: string[] = [];
  for (const r of rendu.resultats ?? []) {
    const id = r?.dev?.taskId;
    if (id && !vus.includes(id)) vus.push(id);
  }
  for (const s of rendu.stops ?? []) {
    const id = s.tache;
    if (id && !vus.includes(id)) vus.push(id);
  }
  return vus;
}

/**
 * LE PÉRIMÈTRE D'UN LOT, ET SES DEUX SOURCES — la préséance est écrite, pas subie.
 *
 * 1. `docs/lots/<lotId>/lot.json` FAIT FOI : c'est le composeur qui l'écrit, et il dit ce que le lot
 *    portait au moment où il a été taillé.
 * 2. À DÉFAUT, le champ `lot` de `docs/tasks.json`. Ce n'est pas un repli de confort : `docs/lots/`
 *    est en `.gitignore`, donc `lot.json` n'existe que dans l'arbre où le composeur a tourné, et il
 *    n'est régénérable par rien. La session qui clôt n'est pas toujours celle qui a composé.
 *    `docs/tasks.json` est SUIVI, et n'est écrit que par l'outillage — le rendu ne le contrôle pas.
 * 3. Aucune des deux : `null`. **Une absence de périmètre n'est pas un périmètre vide**, et surtout
 *    pas une autorisation : c'est `lot_introuvable`, et la clôture n'écrit rien.
 */
export function perimetreDuLot(
  lotId: string,
  membresDeclares: readonly string[] | null,
  taches: readonly Pick<Tache, 'id' | 'lot'>[]
): string[] | null {
  if (membresDeclares && membresDeclares.length > 0) return [...membresDeclares];
  const duRegistre = taches.filter((t) => t.lot === lotId).map((t) => t.id);
  return duRegistre.length > 0 ? duRegistre : null;
}

/**
 * LES DEUX REFUS DE GOV-041, ET ILS SONT POSÉS AVANT TOUTE ÉCRITURE.
 * Le contrôle ne vit dans aucune des deux branches d'écriture de `cloturerLeLot()` — ni celle qui
 * pose `fusionnee`, ni celle qui recompte la tentative — mais EN AMONT des deux : c'est la seule
 * position d'où il les garde toutes les deux.
 */
export function controlerLePerimetre(
  lotId: string,
  rendu: Rendu,
  membres: readonly string[] | null
): RefusDeCloture[] {
  if (!membres) {
    return [
      {
        famille: 'lot_introuvable',
        message:
          `Le périmètre du lot ${lotId} est introuvable : ni docs/lots/${lotId}/lot.json, ni aucune ` +
          `tâche de docs/tasks.json portant \`lot: "${lotId}"\`. La clôture n'écrit de statut que sur ` +
          'des entrées dont l’appartenance au lot a été VÉRIFIÉE ; une absence de périmètre n’est pas ' +
          'un périmètre vide, et encore moins une autorisation. Range les tâches du lot par ' +
          `${outilHorsDepot('reclasser.mjs')} --lot avant de clôturer.`,
      },
    ];
  }
  if (!rendu.lotId) {
    return [
      {
        famille: 'lot_du_rendu_absent',
        message:
          `Le rendu ne porte AUCUN \`lotId\` : refus de clôturer ${lotId} sur une absence. Un \`lotId\` ` +
          'faux était refusé depuis toujours pendant qu’une absence passait — lire une absence comme ' +
          `une autorisation est la faute même que ce refus ferme. Écris \`"lotId": "${lotId}"\` dans ` +
          `docs/lots/${lotId}/resultat.json.`,
      },
    ];
  }
  if (rendu.lotId !== lotId) {
    return [
      {
        famille: 'lot_du_rendu_etranger',
        message: `Le rendu porte le lot ${rendu.lotId}, pas ${lotId}. Refus de clôturer un autre lot.`,
      },
    ];
  }
  const etrangeres = tachesNommeesParLeRendu(rendu).filter((id) => !membres.includes(id));
  return etrangeres.map((id) => ({
    famille: 'tache_etrangere_au_lot',
    message:
      `${id} : le rendu nomme une tâche ÉTRANGÈRE au lot ${lotId}. Le lot déclare ` +
      `${membres.join(', ')} — et pas elle. Un résultat surnuméraire écrirait un statut sur une ` +
      'entrée que personne n’a composée, relue ni fusionnée : le 2026-09-09, c’est ainsi que dix ' +
      '`fusionnee` ont été écrits sans un mot. Retire-la du rendu, ou range-la dans le lot.',
  }));
}

/** L'erreur que la clôture lève : elle porte les familles, pour qu'un test les nomme. */
export class ErreurDeCloture extends Error {
  readonly refus: readonly RefusDeCloture[];
  constructor(refus: readonly RefusDeCloture[]) {
    super(
      'Clôture REFUSÉE — le rendu n’a pas été vérifié :\n' +
        refus.map((r) => `  [${r.famille}] ${r.message}`).join('\n')
    );
    this.name = 'ErreurDeCloture';
    this.refus = refus;
  }
}

function messageAttestationIncomplete(
  t: Tache,
  numero: number | null,
  sha: string | null,
  quand: string | null
): string {
  const depot = t.repo ?? DEPOT_LOCAL;
  const ou =
    depot === DEPOT_LOCAL
      ? 'vit dans CE dépôt'
      : `vit dans ${depotDeLaTache(t as { repo: string }) ?? `repo « ${depot} »`}`;
  return (
    `${t.id} ${ou} et passerait \`fusionnee\` sans attestation complète : ` +
    `pr=${numero ?? 'absent'}, sha=${sha ?? 'absent'}, fusionneeAt=${quand ?? 'absent'}. ` +
    'Le release manager rend les trois : `gh pr view <n> --json number,mergeCommit,mergedAt` ' +
    'dans le dépôt concerné. Sans le SHA, plus personne ne retrouverait le commit d’atterrissage.'
  );
}

/**
 * POSE UNE LIVRAISON ATTESTÉE — l'unique écriture de `fusionnee`, que la tâche soit close par son lot
 * ou seule (GOV-057) : deux chemins d'entrée, une seule forme écrite (RM-01).
 *
 * L'attestation inter-dépôt (GOV-038). Une livraison hors de ce dépôt ne laisse ICI aucune trace :
 * ni PR qui résout, ni commit dans cet historique. Le SHA du commit de fusion est la seule valeur
 * qu'aucun autre dépôt ne réattribue ; sans lui, le backlog affirmerait une livraison introuvable.
 * GOV-042 — LE REFUS VAUT AUSSI POUR CE DÉPÔT : une tâche locale passait `fusionnee` avec un `pr` nu,
 * et rien ne conservait le commit qui l'avait fait atterrir. La MÊME attestation est exigée ici ;
 * seul le `pr` diffère : écrit ici, il résout, et l'attestation porte le même numéro.
 *
 * Le script ne s'écrit jamais un état que `pnpm gov:tasks` refuserait : il le vérifie avant de le
 * poser. Sans ce contrôle, la faute serait découverte en CI, sur un fichier déjà commité par le seul
 * écrivain autorisé — et personne d'autre n'a le droit de le corriger.
 */
function poserLaLivraison(t: Tache, attestation: Attestation): string {
  const depot = t.repo ?? DEPOT_LOCAL;
  t.pr = depot === DEPOT_LOCAL ? attestation.pr : null;
  t.attestation = { ...attestation };
  t.statut = 'fusionnee';
  t.motif = null;

  const fautes = controlerAttestation(
    {
      id: t.id,
      repo: depot,
      statut: t.statut,
      pr: t.pr,
      branch: t.branch,
      attestation: t.attestation,
    },
    true,
    // L'INSTANT est celui de la clôture. Le SHA vient du release manager : son existence, sa PR, sa
    // fusion et son ascendance se résolvent EN LIGNE (`gov-attestation.ts --en-ligne`), jamais par
    // l'arbre qui clôt, qui n'a pas forcément reçu ce commit.
    { maintenant: Date.now() }
  );
  if (fautes.length > 0) {
    throw new Error(
      `${t.id} : l'attestation écrite serait refusée par \`pnpm gov:tasks\` —\n` +
        fautes.map((f) => `  [${f.famille}] ${f.message}`).join('\n')
    );
  }

  const ref = referencePr({
    id: t.id,
    repo: depot,
    statut: t.statut,
    pr: t.pr,
    attestation: t.attestation,
  });
  return `${t.id} → fusionnee (${ref ?? 'aucune référence de PR'}, sha ${attestation.sha ?? 'PENDANT : lu sur main au squash (GOV-154)'})`;
}

/**
 * LE MOTIF DE `branch`, LU DANS LE SCHÉMA — jamais recopié (RM-01). Lu à l'APPEL, pas à l'import :
 * importer ce module n'a aucun effet. Un schéma qui porterait zéro ou plusieurs motifs distincts
 * pour `branch` est une ambiguïté, et elle est refusée plutôt que tranchée au hasard.
 *
 * LE SCHÉMA EST DU CODE, PAS UNE DONNÉE DU DÉPÔT TRAITÉ : il se résout depuis la racine de CE module
 * (deux niveaux au-dessus de `scripts/lot/`), jamais depuis le répertoire courant. Lu depuis le
 * répertoire courant, le motif était introuvable dès que la clôture tournait sur un autre arbre —
 * le dépôt jetable des témoins du script entier a rougi en ENOENT.
 */
export function motifDeBranche(repo?: string | null): RegExp {
  // GOV-125 (partners/ADR-0027) — LE MOTIF DÉPEND DU DÉPÔT DE LA TÂCHE. Il vit dans UNE règle de
  // `$defs.tache.allOf` : `if repo = axionia` → `then` (branche d'axion-ia), sinon `else` (les deux
  // formes fermées de Partners). Toute autre place d'un motif de `branch` est un refus : deux
  // sources divergeraient (RM-01).
  const racineDuCode = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const schema = JSON.parse(readFileSync(join(racineDuCode, CHEMIN_SCHEMA_DES_TACHES), 'utf8')) as {
    $defs?: { tache?: { allOf?: unknown[] } };
  };
  const motifs: string[] = [];
  const parcourir = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    for (const [cle, v] of Object.entries(n as Record<string, unknown>)) {
      if (cle === 'branch' && v && typeof v === 'object') {
        const pat = (v as { pattern?: unknown }).pattern;
        if (typeof pat === 'string') motifs.push(pat);
      }
      parcourir(v);
    }
  };
  parcourir(schema);
  type Cote = { properties?: { branch?: { pattern?: unknown } } };
  // GOV-143 : le côté Partners porte UNE exception nommée (`if id = INT-T08-P`), et le motif général
  // dans son `else`. Le motif est lu là, et nulle part ailleurs.
  type CotePartners = Cote & { if?: unknown; else?: Cote };
  type Regle = {
    if?: { properties?: { repo?: { const?: unknown } } };
    then?: Cote;
    else?: CotePartners;
  };
  const regle = (schema.$defs?.tache?.allOf ?? []).find(
    (r): r is Regle => (r as Regle)?.if?.properties?.repo?.const === 'axionia'
  );
  const axionia = regle?.then?.properties?.branch?.pattern;
  const partners =
    regle?.else?.if === undefined
      ? regle?.else?.properties?.branch?.pattern
      : regle.else.else?.properties?.branch?.pattern;
  if (typeof axionia !== 'string' || typeof partners !== 'string' || motifs.length !== 2) {
    throw new Error(
      `${CHEMIN_SCHEMA_DES_TACHES} ne porte pas la règle de branche par dépôt (GOV-125) : ` +
        `${motifs.length} motif(s) de \`branch\` trouvés, deux attendus, dans \`then\` et \`else\`. ` +
        'La clôture ne sait pas lequel appliquer.'
    );
  }
  return new RegExp(repo === 'axionia' ? axionia : partners);
}

/** Ce que la forge rend d'une PR fusionnée, pour une tâche close seule. */
export interface Livraison {
  pr?: number | null;
  sha?: string | null;
  fusionneeAt?: string | null;
  /** La branche FUSIONNÉE, lue sur la forge (`headRefName`) — jamais tapée. */
  branch?: string | null;
  /** L'atterrissage vérifié (pas 7). Une PR fusionnée qui n'a pas atterri n'est pas livrée. */
  atterri?: boolean;
  /** Le titre de la PR, lu sur la forge : il nomme UNE tâche (`idDuTitre`). */
  titre?: string | null;
  /** Le corps de la PR, lu sur la forge : son champ `Lot:` nomme les autres (`lireLeLot`). */
  corps?: string | null;
  /**
   * GOV-107 — posé quand la première ligne du message d'écrasement n'est pas EXACTEMENT le titre de
   * la PR lu sur la forge suivi de ` (#<n>)` : la ligne lue et la ligne attendue. La livraison ne
   * déclare alors rien, et la clôture refuse sous `titre_d_ecrasement_non_conforme`.
   */
  titreNonConforme?: { lu: string | null; attendu: string | null } | null;
  /**
   * GOV-128 — la ligne `Lot:` qui SUIT une première ligne conforme dans le message d'écrasement,
   * même quand d'autres lignes la suivent. Elle ne déclare RIEN par elle-même (`corps` reste la
   * seule déclaration, GOV-104) : seule une entrée `par: 'lot'` du passif déclaré la lit.
   */
  lotDuSquash?: string | null;
}

/** Une livraison au PASSIF DÉCLARÉ de la déclaration (GOV-127) : une entrée, une tâche, une PR. */
export interface EntreeDuPassifDeLaDeclaration {
  tache: string;
  depot: 'axionia' | 'partners';
  pr: number;
  /** Le commit d'écrasement COMPLET : la levée ne vaut que pour CETTE livraison. */
  sha: string;
  date: string;
  arbitrage: string;
  /**
   * GOV-128 — ce qui nomme la tâche dans la livraison : le titre à l'instant de la fusion (défaut,
   * GOV-127), ou la ligne `Lot:` du message d'écrasement immuable, derrière une première ligne
   * conforme. Une entrée par titre ne se lève jamais par la ligne `Lot:`, ni l'inverse.
   */
  par?: 'titre' | 'lot';
}

/**
 * GOV-127 — LE PASSIF DÉCLARÉ DE LA DÉCLARATION. Une liste FERMÉE et datée, sur le patron du passif
 * de GOV-042 : la SEULE place où `tache_etrangere_a_la_pr` et `titre_d_ecrasement_non_conforme`
 * peuvent être levés. Une entrée ne lève rien si le titre que la PR portait À L'INSTANT DE LA FUSION
 * (lu dans sa chronologie sur la forge) ne déclare pas la tâche ; toute livraison hors de cette liste
 * garde les deux refus. Ajouter une entrée est une décision : elle passe par un arbitrage écrit et par
 * les deux lentilles, jamais par un drapeau de la ligne de commande.
 *
 * GOV-128 — une PR de LOT dont la première ligne du squash est conforme mais dont le corps porte, après
 * la ligne `Lot:`, d'autres lignes ne déclare rien (GOV-104), et son titre à plusieurs tâches n'en
 * nomme aucune (`idDuTitre`). Une entrée `par: 'lot'` la lève tâche par tâche, en lisant la ligne
 * `Lot:` du message immuable, jamais le corps de la PR.
 */
export const PASSIF_DE_LA_DECLARATION: readonly EntreeDuPassifDeLaDeclaration[] = [
  {
    tache: 'INT-T02',
    depot: 'axionia',
    pr: 1180,
    sha: 'f158408b6a0473f99f2df9b47cece3515234cbfe',
    date: '2026-09-29',
    arbitrage:
      'arbitrage -d7 sur délégation de Williams du 2026-09-29 : livraison antérieure à la convention de déclaration côté axion-ia ; la PR nomme la tâche (titre à la fusion « feat(INT-T02): … », squash « … (INT-T02) (#1180) ») ; accords A09 et production vérifiés ; patch propre 8f1d7d4 ≡ 6bfd50b vérifié (19 fichiers, seul le contexte de worker.ts diffère) ; exception unique, aucune règle assouplie',
  },
  ...(['INT-T04', 'INT-T05'] as const).map((tache) => ({
    tache,
    depot: 'axionia' as const,
    pr: 1228,
    sha: '3fb76aa6f93a58aba79bae876169089bb0a505ed',
    date: '2026-09-30',
    par: 'lot' as const,
    arbitrage:
      'arbitrage -d7 sur délégation de Williams du 2026-09-30 : PR de lot (titre « feat(INT-T04, INT-T05): … ») dont le squash, à première ligne conforme, porte « Lot: INT-T04, INT-T05 » suivi d’un paragraphe et d’un trailer ; les deux accords A09 (exactitude, securite) sont publiés sur la tête fusionnée 7eb1bf3 ; exception unique, aucune règle assouplie',
  })),
];

/**
 * La livraison est-elle au passif déclaré ? Il faut que TOUT coïncide : la tâche, la PR, le sha
 * complet, et que le titre à l'instant de la fusion déclare la tâche. Sinon : `null`, les refus restent.
 */
export function passifDeLaDeclaration(
  tacheId: string,
  livraison: Livraison,
  passif: readonly EntreeDuPassifDeLaDeclaration[] = PASSIF_DE_LA_DECLARATION
): EntreeDuPassifDeLaDeclaration | null {
  const entree = passif.find(
    (e) => e.tache === tacheId && e.pr === livraison.pr && e.sha === livraison.sha
  );
  if (!entree) return null;
  if (entree.par === 'lot') {
    // Une première ligne non conforme ne déclare rien, ni par elle, ni par le `Lot:` qui la suit.
    if (livraison.titreNonConforme || !livraison.titre || !livraison.lotDuSquash) return null;
    const lot = lireLeLot(livraison.lotDuSquash);
    return lot.malForme === null && lot.ids.includes(tacheId) ? entree : null;
  }
  const aLaFusion = (livraison.titreNonConforme?.attendu ?? livraison.titre ?? '').replace(
    /\s*\(#\d+\)\s*$/,
    ''
  );
  return idDuTitre(aLaFusion) === tacheId ? entree : null;
}

/**
 * GOV-143 — LE JOUR OÙ LA RÈGLE DE BRANCHE A ÉTÉ DONNÉE AUX AUTEURS DU NAVIGATEUR (`t/<id>`). Une
 * exception datée après lui n'a plus d'excuse : le témoin rougit si la liste grandit ainsi.
 */
export const REGLE_DES_BRANCHES_DONNEE_LE = '2026-10-03';

/** Une branche hors motif ADMISE : une tâche, sa branche, la PR et le sha qui l'attestent. */
export interface BrancheHorsMotifAdmise {
  tache: string;
  branche: string;
  pr: number;
  sha: string;
  /** La livraison précède ce jour (`AAAA-MM-JJ`), au plus tard `REGLE_DES_BRANCHES_DONNEE_LE`. */
  avant: string;
}

/**
 * GOV-143 — LES BRANCHES HORS MOTIF ADMISES, liste FERMÉE et datée, dans les données : le motif de
 * partners/ADR-0007 ne change pas. INT-T08-P a été fusionnée par #539 depuis `feat/INT-T08-P` ; le
 * schéma admet ce couple, et lui seul (`tasks.schema.json`).
 */
export const BRANCHES_HORS_MOTIF_ADMISES: readonly BrancheHorsMotifAdmise[] = [
  {
    tache: 'INT-T08-P',
    branche: 'feat/INT-T08-P',
    pr: 539,
    sha: 'f642921fb6e9c45e43131d899ef00d10b29417fc',
    avant: '2026-10-03',
  },
];

/** La branche de cette livraison est-elle admise hors motif ? Tout doit coïncider : tâche, branche, PR, sha. */
export function brancheHorsMotifAdmise(
  tacheId: string,
  livraison: Livraison,
  liste: readonly BrancheHorsMotifAdmise[] = BRANCHES_HORS_MOTIF_ADMISES
): boolean {
  return liste.some(
    (e) =>
      e.tache === tacheId &&
      e.branche === livraison.branch &&
      e.pr === livraison.pr &&
      e.sha === livraison.sha
  );
}

/**
 * CLORE UNE TÂCHE LIVRÉE SEULE, HORS DE TOUT LOT (GOV-057) — `--tache <id> --pr <n>`.
 *
 * Six tâches ont été livrées sans lot, et le mode `--lot` ne savait pas les clore : il ÉCRIT
 * `t.lot`, il TIRE son périmètre de ce même champ, et rien ne posait `branch`, que le schéma exige
 * de `fusionnee`. Il restait deux gestes, tous deux fautifs : inventer un lot, ou écrire le registre
 * à la main. Ce mode ferme les deux. Il ne touche JAMAIS `t.lot`, il pose `branch` depuis la
 * livraison, et il refuse AVANT toute écriture, avec une famille nommée :
 *   - `tache_inconnue`          — l'identifiant n'est pas au registre ;
 *   - `tache_d_un_lot`          — la tâche est rangée dans un lot : elle se clôt par lui, sinon ce
 *                                 mode contournerait le contrôle de périmètre de GOV-041 ;
 *   - `tache_deja_livree`       — re-clore écraserait une attestation déjà posée ;
 *   - `livraison_non_atterrie`  — même doctrine que le mode `--lot` ;
 *   - `branche_absente`         — sans elle, l'état écrit serait refusé par le schéma ;
 *   - `branche_hors_motif`      — la branche que le motif du schéma refuserait (lu, pas recopié) ;
 *   - `tache_etrangere_a_la_pr` — la PR ne déclare la tâche ni par son titre, ni par `Lot:` ;
 *   - `titre_d_ecrasement_non_conforme` — la première ligne du message d'écrasement n'est pas
 *                                 exactement le titre que la PR portait à l'instant de la fusion,
 *                                 suivi de ` (#<n>)` (GOV-107, GOV-110) ;
 *   - `attestation_incomplete`  — pr, SHA entier et instant de fusion, les trois ou rien ;
 *   - `proprietaire_absent`     — `fusionnee` exige `owner`, et le script ne l'invente pas.
 */
export function cloturerUneTacheSeule(options: {
  tacheId: string;
  livraison: Livraison;
  taches: Tache[];
  owner?: string;
}): { journal: string[] } {
  const { tacheId, livraison, taches, owner = '' } = options;
  const t = taches.find((x) => x.id === tacheId);
  if (!t) {
    throw new ErreurDeCloture([
      {
        famille: 'tache_inconnue',
        message: `${tacheId} n'est pas dans docs/tasks.json : rien à clore.`,
      },
    ]);
  }

  const refus: RefusDeCloture[] = [];
  if (t.lot) {
    refus.push({
      famille: 'tache_d_un_lot',
      message:
        `${t.id} est rangée dans le lot ${t.lot} : elle se clôt par \`--lot ${t.lot}\`, qui ` +
        'vérifie le périmètre du lot (GOV-041). La clore seule contournerait ce contrôle.',
    });
  }
  if (LIVREE.has(t.statut)) {
    refus.push({
      famille: 'tache_deja_livree',
      message: `${t.id} est déjà \`${t.statut}\` : la re-clore écraserait son attestation.`,
    });
  }
  // LA PR DOIT DÉCLARER LA TÂCHE (lentille `securite`, #182). Sans ce refus, `--tache X --pr N`
  // attachait N'IMPORTE QUELLE PR fusionnée à n'importe quelle tâche hors lot : l'attestation
  // était vraie, la garde restait à zéro, et la livraison était fausse. La déclaration est lue
  // par le lecteur UNIQUE de ce dépôt (`tachesDeLaPr` : titre, `Lot:`, `pr` déjà écrit), jamais
  // par une seconde grammaire (RM-01). Un corps illisible ou absent ne déclare RIEN.
  const lot = lireLeLot(livraison.corps ?? '');
  const declarees = tachesDeLaPr(
    taches,
    livraison.pr ?? null,
    idDuTitre(livraison.titre ?? null),
    lot.ids
  );
  // GOV-127 : seul le passif déclaré, fermé et daté, lève les deux refus de la déclaration.
  const passif = passifDeLaDeclaration(t.id, livraison);
  if (!passif && !declarees.some((x) => x.id === t.id)) {
    refus.push({
      famille: 'tache_etrangere_a_la_pr',
      message:
        `${t.id} : la PR livrée ne déclare pas cette tâche — ni son titre ` +
        `(« ${livraison.titre ?? 'absent'} »), ni son champ \`Lot:\`` +
        (lot.malForme ? ` (illisible : ${lot.malForme})` : '') +
        '. Clore une tâche sur l’attestation d’une PR qui ne l’a pas portée écrirait une ' +
        'livraison fausse avec une preuve vraie.',
    });
  }
  // GOV-107 — LA PREMIÈRE LIGNE N'EST PAS CELLE QUE LE PAS 6 POSE. Hors `--subject`, une PR à un
  // seul commit prend pour titre d'écrasement le sujet du commit, écrit par le développeur : il
  // peut nommer une autre tâche que le titre de la PR (lentille `securite`, #188). La livraison
  // ne déclare alors rien ; ce refus NOMME pourquoi, en plus de `tache_etrangere_a_la_pr`.
  if (!passif && livraison.titreNonConforme) {
    const { lu, attendu } = livraison.titreNonConforme;
    refus.push({
      famille: 'titre_d_ecrasement_non_conforme',
      message:
        `${t.id} : la première ligne du message d'écrasement (« ${lu ?? 'absente'} ») n'est pas ` +
        `exactement le titre que la PR portait à l'instant de la fusion, lu dans sa chronologie sur la forge, suivi de son numéro (« ${attendu ?? 'titre indécidable ou absent de la forge'} »). ` +
        'Hors `--subject`, cette ligne est le sujet d’un commit, écrit par le développeur : elle ne ' +
        'déclare rien (pas 6 du protocole).',
    });
  }
  if (livraison.atterri !== true) {
    refus.push({
      famille: 'livraison_non_atterrie',
      message:
        `${t.id} : l'atterrissage de sa PR n'est pas vérifié (pas 7 du ` +
        'protocole). Une PR fusionnée dont personne ne sait si elle est en ligne n’est pas livrée.',
    });
  }
  if (!livraison.branch) {
    refus.push({
      famille: 'branche_absente',
      message:
        `${t.id} : la livraison ne porte pas la branche fusionnée. \`fusionnee\` l'exige (schéma), ` +
        'et elle se lit sur la forge (`headRefName`), elle ne se tape pas.',
    });
  }
  if (
    livraison.branch &&
    !motifDeBranche(t.repo).test(livraison.branch) &&
    !brancheHorsMotifAdmise(t.id, livraison)
  ) {
    refus.push({
      famille: 'branche_hors_motif',
      message:
        `${t.id} : la branche « ${livraison.branch} » est refusée par le motif de \`branch\` de ` +
        `${CHEMIN_SCHEMA_DES_TACHES}. Écrite, elle rendrait le registre rouge, et la tâche, une fois ` +
        '`fusionnee`, ne pourrait plus être re-close pour la corriger. Le motif se décide par ADR ' +
        '(partners/ADR-0007), pas ici.',
    });
  }
  const numero = livraison.pr ?? null;
  const sha = livraison.sha ?? null;
  const quand = livraison.fusionneeAt ?? null;
  if (numero == null || sha == null || quand == null) {
    refus.push({
      famille: 'attestation_incomplete',
      message: messageAttestationIncomplete(t, numero, sha, quand),
    });
  }
  if (!t.owner && !owner) {
    refus.push({
      famille: 'proprietaire_absent',
      message:
        `${t.id} n'a pas de propriétaire, et aucun \`--owner <Axx>\` n'est fourni : ` +
        '`fusionnee` l’exige, et le script ne l’invente pas.',
    });
  }
  if (refus.length > 0) throw new ErreurDeCloture(refus);

  t.branch = livraison.branch!;
  if (!t.owner) t.owner = owner;
  return { journal: [poserLaLivraison(t, { pr: numero!, sha: sha!, fusionneeAt: quand! })] };
}

/**
 * GOV-154 — CLORE SA TÂCHE DANS SA PROPRE PR (`--dans-la-pr --tache <id> --pr <n>`). Le sha et l'instant
 * de fusion n'existent qu'au squash : l'attestation est PENDANTE (sha et date `null`), et le commit
 * squashé « (#n) » se LIT ensuite sur main par `gov:registre-fusions`, qui juge aussi son sujet. Les
 * refus sont ceux du mode `--tache` qu'une PR ouverte peut juger : la PR doit DÉCLARER la tâche (titre,
 * `Lot:`, `pr`), la tâche ne doit pas être déjà livrée, la branche suit le motif, un propriétaire est
 * connu. Le titre d'écrasement et l'atterrissage, qu'elle ne peut pas encore savoir, se jugent sur main.
 */
export function cloturerDansLaPr(options: {
  tacheId: string;
  pr: { numero: number; titre: string | null; corps: string | null; branch: string | null };
  taches: Tache[];
  owner?: string;
}): { journal: string[] } {
  const { tacheId, pr, taches, owner = '' } = options;
  const t = taches.find((x) => x.id === tacheId);
  if (!t) {
    throw new ErreurDeCloture([
      {
        famille: 'tache_inconnue',
        message: `${tacheId} n'est pas dans docs/tasks.json : rien à clore.`,
      },
    ]);
  }
  const depot = depotDeLaTache({ repo: t.repo ?? DEPOT_LOCAL }) ?? DEPOT_LOCAL;
  const refus: RefusDeCloture[] = [];
  if ((t.repo ?? DEPOT_LOCAL) !== DEPOT_LOCAL) {
    refus.push({
      famille: 'tache_hors_depot',
      message:
        `${t.id} est une tâche du dépôt « ${t.repo} » : sa PR n'est pas d'ici, elle se clôt par ` +
        '`--tache` après sa fusion.',
    });
  }
  if (LIVREE.has(t.statut)) {
    refus.push({
      famille: 'tache_deja_livree',
      message: `${t.id} est déjà \`${t.statut}\` : la re-clore écraserait son attestation.`,
    });
  }
  const lot = lireLeLot(pr.corps ?? '');
  const declarees = tachesDeLaPr(taches, pr.numero, idDuTitre(pr.titre), lot.ids);
  if (!declarees.some((x) => x.id === t.id)) {
    refus.push({
      famille: 'tache_etrangere_a_la_pr',
      message:
        `${t.id} : la PR ${depot}#${pr.numero} ne déclare pas cette tâche — ni son titre ` +
        `(« ${pr.titre ?? 'absent'} »), ni son champ \`Lot:\`` +
        (lot.malForme ? ` (illisible : ${lot.malForme})` : '') +
        '. Une PR ne clôt que les tâches qu’elle porte.',
    });
  }
  if (!pr.branch) {
    refus.push({
      famille: 'branche_absente',
      message: `${t.id} : la branche de la PR ${depot}#${pr.numero} est inconnue.`,
    });
  } else if (!motifDeBranche(t.repo).test(pr.branch)) {
    refus.push({
      famille: 'branche_hors_motif',
      message:
        `${t.id} : la branche « ${pr.branch} » est refusée par le motif de \`branch\` de ` +
        `${CHEMIN_SCHEMA_DES_TACHES}.`,
    });
  }
  if (!t.owner && !owner) {
    refus.push({
      famille: 'proprietaire_absent',
      message: `${t.id} n'a pas de propriétaire, et aucun \`--owner <Axx>\` n'est fourni.`,
    });
  }
  if (refus.length > 0) throw new ErreurDeCloture(refus);
  t.branch = pr.branch!;
  if (!t.owner) t.owner = owner;
  return { journal: [poserLaLivraison(t, { pr: pr.numero, sha: null, fusionneeAt: null })] };
}

/**
 * Applique le rendu aux tâches. MUTE `taches`, et ne mute RIEN si un refus est levé : le contrôle de
 * périmètre s'exécute d'abord, entièrement, avant la première écriture.
 */
export function cloturerLeLot(options: {
  lotId: string;
  rendu: Rendu;
  membres: readonly string[] | null;
  taches: Tache[];
  ownerParDefaut?: string;
}): { journal: string[] } {
  const { lotId, rendu, membres, taches, ownerParDefaut = '' } = options;

  const refus = controlerLePerimetre(lotId, rendu, membres);
  // GOV-104 — LE MÊME REFUS QUE LE MODE `--tache`, ET AVANT TOUTE ÉCRITURE : une branche que le
  // schéma refuse, écrite ici, rendrait le registre rouge sur une tâche qu'on ne pourrait plus
  // re-clore. Le motif est lu dans le schéma, par la même fonction (RM-01).
  for (const r of rendu.resultats ?? []) {
    const branche = r?.dev?.branch;
    const depot = taches.find((t) => t.id === r?.dev?.taskId)?.repo;
    if (branche && !motifDeBranche(depot).test(branche)) {
      refus.push({
        famille: 'branche_hors_motif',
        message:
          `${r?.dev?.taskId ?? '?'} : la branche « ${branche} » est refusée par le motif de ` +
          `\`branch\` de ${CHEMIN_SCHEMA_DES_TACHES}. Le motif se décide par ADR (partners/ADR-0007).`,
      });
    }
  }
  if (refus.length > 0) throw new ErreurDeCloture(refus);

  const index = new Map(taches.map((t) => [t.id, t]));
  const motifDuStop = new Map(
    (rendu.stops ?? []).map((s) => [s.tache ?? '', `${s.motif ?? 'stop'} — ${s.ref ?? ''}`.trim()])
  );
  const journal: string[] = [];

  for (const r of rendu.resultats ?? []) {
    if (!r) continue;
    const id = r.dev?.taskId;
    if (!id) {
      journal.push(
        '⚠️ un résultat sans `dev.taskId` : ignoré (le workflow a-t-il bien remboîté la fusion ?)'
      );
      continue;
    }
    const t = index.get(id);
    if (!t) {
      journal.push(`⚠️ ${id} : inconnu de docs/tasks.json — ignoré`);
      continue;
    }

    t.lot = lotId;
    if (r.dev?.branch) t.branch = r.dev.branch;
    // Le numéro de PR n'est écrit NU que si la tâche vit dans CE dépôt. Ailleurs, il ira dans son
    // attestation, plus bas, avec le SHA qui le rend retrouvable (GOV-038).
    const depotDeCetteTache = t.repo ?? DEPOT_LOCAL;
    if (depotDeCetteTache === DEPOT_LOCAL && r.dev?.pr != null) t.pr = r.dev.pr;
    if (!t.owner && ownerParDefaut) t.owner = ownerParDefaut;

    const atterri = r.fusion?.atterri === true;
    if (!r.refuse && atterri) {
      if (!t.owner || !t.branch) {
        throw new Error(
          `${id} passerait \`fusionnee\` sans owner ni branch — état refusé par le schéma. ` +
            'Passe `--owner <Axx>` (celui de la revendication) et vérifie que le développeur a rendu sa branche.'
        );
      }
      const numero = r.fusion?.pr ?? r.dev?.pr ?? null;
      const sha = r.fusion?.sha ?? null;
      const quand = r.fusion?.fusionneeAt ?? null;
      if (numero == null || sha == null || quand == null) {
        throw new Error(messageAttestationIncomplete(t, numero, sha, quand));
      }
      journal.push(poserLaLivraison(t, { pr: numero, sha, fusionneeAt: quand }));
      continue;
    }

    // Non livrée : on transcrit POURQUOI, et on recompte la tentative.
    const motif =
      motifDuStop.get(id) ||
      r.motif ||
      (r.dev?.stop ? `${r.dev.stop.motif} — ${r.dev.stop.ref ?? ''}`.trim() : '') ||
      (r.fusion && !atterri ? `fusion non atterrie : ${r.fusion.motif ?? 'motif absent'}` : '') ||
      'refusée en revue, motif absent du rendu';

    t.attempts = (t.attempts ?? 0) + 1;
    if (t.attempts >= 2) {
      t.statut = 'bloquee';
      t.motif = motif;
      journal.push(`${id} → bloquee (${t.attempts} tentatives) — ${motif}`);
    } else {
      t.statut = 'a_faire';
      t.owner = null;
      t.branch = null;
      t.motif = null;
      journal.push(`${id} → a_faire (tentative ${t.attempts}) — ${motif}`);
    }
  }

  return { journal };
}

function arg(nom: string, defaut?: string): string {
  const i = process.argv.indexOf(`--${nom}`);
  const suivant = i >= 0 ? process.argv[i + 1] : undefined;
  if (suivant && !suivant.startsWith('--')) return suivant;
  if (defaut !== undefined) return defaut;
  throw new Error(`Argument --${nom} manquant.`);
}

/** Les identifiants que `docs/lots/<lotId>/lot.json` déclare, ou `null` si le fichier n'est pas là. */
function membresDeclares(dossier: string): string[] | null {
  const chemin = join(dossier, 'lot.json');
  if (!existsSync(chemin)) return null;
  const lot = JSON.parse(readFileSync(chemin, 'utf8')) as { taches?: { id?: string }[] };
  const ids = (lot.taches ?? []).map((t) => t.id).filter((id): id is string => Boolean(id));
  return ids.length > 0 ? ids : null;
}

/**
 * ⚠️ LE MOTIF EST ANCRÉ SUR LE NOM DU FICHIER, DOSSIER COMPRIS ET FIN DE CHAÎNE. Un motif plus lâche
 * ferait s'exécuter une COPIE du module portant un autre nom : elle ne produirait rien et sortirait
 * 0 — un « rendu vide » réussi, le plus trompeur des verts.
 */
const LANCE_EN_SCRIPT = /[\\/]lot[\\/]cloture\.ts$/.test(process.argv[1] ?? '');

/**
 * LE RATTRAPAGE DU PASSÉ (GOV-042) — `--rattraper-attestations [--a-blanc]`. Il LIT le SHA de chaque
 * tâche de ce dépôt livrée sans attestation dans l'historique de `origin/main` (`rattraper`,
 * scripts/lot/attestation.ts), écrit les attestations trouvées, et NOMME chaque échec — zéro commit
 * ou plus d'un. Un échec hors du passif déclaré fait échouer le mode : il appelle une décision, pas
 * un SHA plausible. `--a-blanc` imprime tout et n'écrit rien. Le vert imprime le compte des tâches
 * RÉELLEMENT rattrapées, jamais la longueur d'une liste tapée.
 */
function rattraperLePasse(aBlanc: boolean): void {
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    version: number;
    taches: Tache[];
  };
  const journal = lireJournalDeFusion('origin/main');
  const r = rattraper(doc.taches as TacheAttestable[], journal, (t) => LIVREE.has(t.statut));
  const parId = new Map(doc.taches.map((t) => [t.id, t]));
  for (const x of r.rattrapees) parId.get(x.id)!.attestation = x.attestation;
  const auPassif = new Set(PASSIF_SANS_ATTESTATION.map((p) => p.id));
  const horsPassif = r.echecs.filter((e) => !auPassif.has(e.id));
  for (const e of r.echecs) {
    const declare = auPassif.has(e.id);
    (declare ? console.log : console.error)(
      `${declare ? '⚠️' : '❌'} ${e.id} — ${e.trouves} commit(s) d’atterrissage trouvé(s) : ` +
        `attestation laissée VIDE${declare ? ' (passif déclaré)' : ', et ce n’est PAS déclaré au passif'}.`
    );
  }
  if (!aBlanc && r.rattrapees.length > 0) {
    writeFileSync('docs/tasks.json', JSON.stringify(doc, null, 2) + '\n');
  }
  console.log(
    `${aBlanc ? 'À BLANC — rien n’est écrit. ' : ''}${r.rattrapees.length} tâche(s) réellement ` +
      `rattrapée(s) depuis origin/main ; ${r.echecs.length} échec(s), dont ${horsPassif.length} hors du passif.`
  );
  if (horsPassif.length > 0) process.exitCode = 1;
}

/** Ce que `gh pr view` rend d'une PR. Le corps peut y figurer : il n'est JAMAIS lu (GOV-104). */
export interface VueDeLaForge {
  state: string;
  mergeCommit: { oid: string } | null;
  mergedAt: string | null;
  headRefName: string;
  /**
   * GOV-107 — le titre de la PR, lu sur la forge. Il ne DÉCLARE rien par lui-même : il sert
   * seulement à vérifier que la première ligne du message d'écrasement est bien celle du pas 6.
   */
  title?: string | null;
}

/**
 * Un renommage du titre de la PR, lu dans sa chronologie (`event == "renamed"`) : l'instant, le
 * titre d'avant (`rename.from`) et le titre d'après (`rename.to`).
 */
export interface RenommageDeTitre {
  createdAt: string;
  previousTitle: string;
  currentTitle: string;
}

/**
 * LE TITRE QUE LA PR PORTAIT À L'INSTANT DE LA FUSION. Le titre d'une PR reste modifiable après la
 * fusion (lentille `securite`, #206) : le titre actuel ne prouve rien. C'est le titre d'après du
 * dernier renommage STRICTEMENT antérieur à `mergedAt` ; sans renommage antérieur, le titre
 * d'origine, c'est-à-dire le titre d'avant du premier renommage ; sans aucun renommage, le titre
 * actuel. Une chronologie illisible (`null`) ne rend AUCUN titre : jamais un repli sur le titre
 * actuel.
 *
 * GOV-122 — DEUX CAS SANS TITRE, ÉCHEC FERMÉ. (1) Un renommage daté de la SECONDE MÊME de la fusion
 * est indécidable : la forge horodate à la seconde, et `mergedAt` suit d'environ une seconde
 * l'écriture du commit de fusion (mesure écrite dans `gov-etat.ts`) ; il peut précéder ou suivre
 * le commit, et parier sur l'un des deux titres serait déclarer sans preuve. (2) Une date illisible,
 * celle d'un renommage ou celle de la fusion quand il y a des renommages à situer, rend la
 * chronologie illisible. Dans les deux cas : aucun titre, et la clôture refuse.
 */
function titreALaFusion(
  titreActuel: string | null,
  renommages: readonly RenommageDeTitre[] | null,
  mergedAt: string | null
): string | null {
  if (renommages === null) return null;
  const fusion = Date.parse(String(mergedAt));
  const dates = renommages.map((r) => Date.parse(r.createdAt));
  if (renommages.length > 0 && (!Number.isFinite(fusion) || dates.some((d) => !Number.isFinite(d))))
    return null;
  if (dates.some((d) => Math.floor(d / 1000) === Math.floor(fusion / 1000))) return null;
  const ordonnes = [...renommages].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
  const anterieurs = ordonnes.filter((r) => Date.parse(r.createdAt) < fusion);
  if (anterieurs.length > 0) return anterieurs[anterieurs.length - 1]!.currentTitle;
  return ordonnes.length > 0 ? ordonnes[0]!.previousTitle : titreActuel;
}

/**
 * LA LIVRAISON, COMPOSÉE DE CE QUE LA FORGE REND — la règle, sans I/O, pour qu'un témoin l'appelle.
 *
 * GOV-104 — LA DÉCLARATION SE LIT DANS LE COMMIT DE FUSION. Le titre et le champ `Lot:` étaient lus
 * dans le CORPS de la PR, qui reste modifiable après la fusion : ajouter une tâche à `Lot:` suffisait
 * à la faire clore sur une attestation qui ne l'a jamais portée (lentille `securite`, #182). Le
 * message du commit d'écrasement, lui, est immuable, et le pas 6 y recopie `Lot:`. Un message
 * absent ne déclare RIEN — jamais un repli sur le corps.
 *
 * GOV-104 — L'ATTERRISSAGE SE JUGE SUR LA BRANCHE PAR DÉFAUT du dépôt, pas sur `baseRefName`, que
 * la PR choisit : une PR fusionnée dans une branche quelconque n'est pas livrée. `faceALaBrancheParDefaut`
 * est le statut de `compare/<sha>...<défaut>` : `identical` ou `ahead` disent que le commit en est un
 * ancêtre. C'est PLUS FAIBLE que le repli du pas 7, qui exige aussi `gate-a` verte sur `main`.
 */
export function livraisonDepuisLaForge(e: {
  pr: number;
  vue: VueDeLaForge;
  messageDuCommit: string | null;
  faceALaBrancheParDefaut: string | null;
  /** Les renommages du titre, lus dans la chronologie de la PR ; `null` si elle est illisible. */
  renommages: readonly RenommageDeTitre[] | null;
}): Livraison {
  const sha = e.vue.state === 'MERGED' ? (e.vue.mergeCommit?.oid ?? null) : null;
  const lignes = e.messageDuCommit === null ? null : e.messageDuCommit.split('\n');
  // LE CORPS NE DÉCLARE QUE S'IL EST RÉDUIT À LA SEULE LIGNE `Lot:` que le pas 6 y recopie. Sans
  // `--body`, la forge compose ce corps avec les messages des commits : un « Lot: X » écrit dans un
  // commit par le développeur déclarerait X (lentille `securite`, #188). Tout autre corps ne
  // déclare rien, et la PR ne livre alors que la tâche de son titre — échec fermé.
  // GOV-107 — LA PREMIÈRE LIGNE EST EXACTEMENT LE TITRE DE LA PR SUIVI DE ` (#<n>)`, ce que le
  // pas 6 pose par `--subject`. Toute autre ligne — sujet d'un commit, numéro différent, titre
  // absent de la vue — ne déclare RIEN, ni par elle, ni par le `Lot:` qui la suit : échec fermé.
  // Le titre comparé est celui de l'instant de la fusion, pas le titre actuel (`titreALaFusion`).
  const titreDeLaForge = titreALaFusion(
    typeof e.vue.title === 'string' && e.vue.title !== '' ? e.vue.title : null,
    e.renommages,
    e.vue.mergedAt
  );
  const attendu = titreDeLaForge === null ? null : `${titreDeLaForge} (#${e.pr})`;
  const premiere = lignes === null ? null : (lignes[0] ?? null);
  const conforme = premiere !== null && attendu !== null && premiere === attendu;
  const titreNonConforme = lignes !== null && !conforme ? { lu: premiere, attendu } : null;
  const declare = lignes !== null && conforme;
  const utiles = declare ? lignes.slice(1).filter((l) => l.trim() !== '') : [];
  const corps = !declare ? null : utiles.length === 1 && /^Lot:/.test(utiles[0]!) ? utiles[0]! : '';
  // GOV-128 : la ligne `Lot:` qui suit IMMÉDIATEMENT le titre conforme, lue pour le passif seul.
  const lotDuSquash = declare && utiles.length > 0 && /^Lot:/.test(utiles[0]!) ? utiles[0]! : null;
  return {
    pr: e.pr,
    sha,
    fusionneeAt: e.vue.mergedAt,
    branch: e.vue.headRefName,
    atterri:
      sha !== null &&
      (e.faceALaBrancheParDefaut === 'identical' || e.faceALaBrancheParDefaut === 'ahead'),
    titre: declare ? premiere : null,
    corps,
    titreNonConforme,
    lotDuSquash,
  };
}

/**
 * LA LIVRAISON LUE SUR LA FORGE, pour `--tache`. Rien n'est tapé par l'opérateur hormis le numéro :
 * tout vient de la forge, dans le dépôt DE LA TÂCHE (`DEPOTS`). Trois lectures : la PR, le message
 * du commit de fusion, et l'ascendance de ce commit sur la branche par défaut.
 *
 * `lire` est INJECTÉ (GOV-104) : c'est ce qui permet à un témoin de juger les APPELS — la
 * comparaison vise la branche par défaut lue sur la forge, jamais la base que la PR a choisie.
 * Sans lui, remettre `baseRefName` dans l'appel laissait tous les tests verts.
 */
export function livraisonSurLaForge(
  depot: string,
  pr: number,
  lire: (args: string[]) => string = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
): Livraison {
  const vue = JSON.parse(
    lire([
      'pr',
      'view',
      String(pr),
      '-R',
      depot,
      '--json',
      'state,mergeCommit,mergedAt,headRefName,title',
    ])
  ) as VueDeLaForge;
  const sha = vue.state === 'MERGED' ? (vue.mergeCommit?.oid ?? null) : null;
  if (sha === null) {
    return livraisonDepuisLaForge({
      pr,
      vue,
      messageDuCommit: null,
      faceALaBrancheParDefaut: null,
      renommages: null,
    });
  }
  const parDefaut = lire([
    'repo',
    'view',
    depot,
    '--json',
    'defaultBranchRef',
    '-q',
    '.defaultBranchRef.name',
  ]);
  return livraisonDepuisLaForge({
    pr,
    vue,
    messageDuCommit: lire(['api', `repos/${depot}/commits/${sha}`, '--jq', '.commit.message']),
    faceALaBrancheParDefaut: lire([
      'api',
      `repos/${depot}/compare/${sha}...${parDefaut}`,
      '--jq',
      '.status',
    ]),
    renommages: renommagesSurLaForge(depot, pr, lire),
  });
}

/**
 * LES RENOMMAGES DU TITRE, LUS DANS LA CHRONOLOGIE DE LA PR (`issues/<n>/timeline`, toutes les
 * pages), un objet JSON par ligne. Une lecture qui échoue, une ligne qui n'est pas un renommage
 * complet : `null`, et la clôture refuse (échec fermé).
 */
function renommagesSurLaForge(
  depot: string,
  pr: number,
  lire: (args: string[]) => string
): RenommageDeTitre[] | null {
  try {
    const lignes = lire([
      'api',
      `repos/${depot}/issues/${pr}/timeline?per_page=100`,
      '--paginate',
      '--jq',
      '.[] | select(.event == "renamed") | ' +
        '{createdAt: .created_at, previousTitle: .rename.from, currentTitle: .rename.to} | tojson',
    ])
      .split('\n')
      .filter((l) => l.trim() !== '');
    const renommages = lignes.map((l) => JSON.parse(l) as Record<string, unknown>);
    const complets = renommages.every(
      (r) =>
        ['createdAt', 'previousTitle', 'currentTitle'].every((k) => typeof r[k] === 'string') &&
        // GOV-122 — une date qui ne se lit pas rend la chronologie illisible : jamais NaN.
        Number.isFinite(Date.parse(r['createdAt'] as string))
    );
    return complets ? (renommages as unknown as RenommageDeTitre[]) : null;
  } catch {
    return null;
  }
}

function cloreUneTacheSeule(
  tacheId: string,
  pr: number,
  owner: string,
  doitCommiter: boolean
): void {
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    version: number;
    taches: Tache[];
  };
  const t = doc.taches.find((x) => x.id === tacheId);
  const depot = depotDeLaTache({ repo: t?.repo ?? DEPOT_LOCAL });
  if (!depot) {
    throw new Error(`${tacheId} : son dépôt n'a pas de coordonnée de forge — rien à lire.`);
  }
  const livraison = t ? livraisonSurLaForge(depot, pr) : { pr };
  const { journal } = cloturerUneTacheSeule({ tacheId, livraison, taches: doc.taches, owner });

  writeFileSync('docs/tasks.json', JSON.stringify(doc, null, 2) + '\n');
  console.log(`Clôture de la tâche seule ${tacheId} :`);
  for (const l of journal) console.log(`  ${l}`);
  if (doitCommiter) {
    execFileSync('git', ['add', 'docs/tasks.json'], { stdio: 'inherit' });
    execFileSync('git', ['commit', '-m', `chore(lot): clôture de ${tacheId}, livrée seule`], {
      stdio: 'inherit',
    });
  }
}

function cloreDansLaPr(tacheId: string, numero: number, owner: string): void {
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    version: number;
    taches: Tache[];
  };
  const brut = execFileSync(
    'gh',
    ['pr', 'view', String(numero), '--json', 'title,body,headRefName,state'],
    { encoding: 'utf8' }
  );
  const p = JSON.parse(brut) as {
    title: string;
    body: string | null;
    headRefName: string;
    state: string;
  };
  if (p.state !== 'OPEN') {
    throw new Error(
      `#${numero} est « ${p.state} » : la clôture DANS la PR ne vaut que pour une PR ouverte ` +
        '(après la fusion, `--tache`).'
    );
  }
  const { journal } = cloturerDansLaPr({
    tacheId,
    pr: { numero, titre: p.title, corps: p.body, branch: p.headRefName },
    taches: doc.taches,
    owner,
  });
  writeFileSync('docs/tasks.json', JSON.stringify(doc, null, 2) + '\n');
  console.log(`Clôture de ${tacheId} DANS sa PR #${numero} :`);
  for (const l of journal) console.log(`  ${l}`);
}

function principal(): void {
  if (process.argv.includes('--dans-la-pr')) {
    const pr = Number(arg('pr'));
    if (!Number.isInteger(pr) || pr < 1) throw new Error('--pr attend un numéro de PR entier.');
    cloreDansLaPr(arg('tache'), pr, arg('owner', ''));
    return;
  }
  if (process.argv.includes('--rattraper-attestations')) {
    rattraperLePasse(process.argv.includes('--a-blanc'));
    return;
  }
  if (process.argv.includes('--tache')) {
    const pr = Number(arg('pr'));
    if (!Number.isInteger(pr) || pr < 1) throw new Error('--pr attend un numéro de PR entier.');
    cloreUneTacheSeule(arg('tache'), pr, arg('owner', ''), process.argv.includes('--commit'));
    return;
  }
  const lotId = arg('lot');
  const ownerParDefaut = arg('owner', '');
  const doitCommiter = process.argv.includes('--commit');

  const dossier = join('docs/lots', lotId);
  const cheminResultat = join(dossier, 'resultat.json');
  if (!existsSync(cheminResultat)) {
    throw new Error(
      `${cheminResultat} absent. Écris-y le rendu JSON du workflow (\`{ lotId, resultats, stops, manques, arret }\`) ` +
        'avant de clôturer : le script transcrit ce rendu, il ne le devine pas.'
    );
  }

  const rendu = JSON.parse(readFileSync(cheminResultat, 'utf8')) as Rendu;
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    version: number;
    taches: Tache[];
  };

  const membres = perimetreDuLot(lotId, membresDeclares(dossier), doc.taches);
  const { journal } = cloturerLeLot({
    lotId,
    rendu,
    membres,
    taches: doc.taches,
    ownerParDefaut,
  });

  writeFileSync('docs/tasks.json', JSON.stringify(doc, null, 2) + '\n');
  console.log(`Clôture du lot ${lotId} :`);
  for (const l of journal) console.log(`  ${l}`);

  if (doitCommiter) {
    execFileSync('git', ['add', 'docs/tasks.json'], { stdio: 'inherit' });
    execFileSync('git', ['commit', '-m', `chore(lot): clôture ${lotId}`], { stdio: 'inherit' });
  }
}

if (LANCE_EN_SCRIPT) principal();
