/**
 * gov-attributions.ts — LES ATTRIBUTIONS SE CONFRONTENT À LEURS SOURCES (GOV-037, REQ-GOV-021, REQ-GOV-003).
 *
 * USAGE   : pnpm gov:attributions          (sort en échec si une attribution est rompue)
 *           pnpm gov:attributions --prove  (chaque famille rougit sur son témoin ; chaque contre-témoin
 *                                           reste vert ET rend exactement les exemptions qu'il annonce)
 *
 * POURQUOI : ce dépôt dérive et vérifie ses NOMBRES — `gov:tasks --verifie-rendu`,
 * `gov:requirements --verifie-rendu`, `lot:paths --check`, `gov:gates-derivees`. Il ne confrontait
 * AUCUNE de ses ATTRIBUTIONS. Or une attribution s'écrit toujours DEUX FOIS, dans deux fichiers :
 * `requirements.json[].taches` et `tasks.json[].reqs` ; `gates.json[].tache` et les `paths` de la
 * tâche ; `tasks.json[].owner` et `agents.json` ; `tasks.json[].lot` et l'entrée de `docs/journal/`.
 *
 * 🔑 CE QUE LA SORTIE VERTE AFFIRME, ET RIEN DE PLUS. Elle ne dit pas « toute attribution est
 * confrontée » — c'était faux. Elle dit qu'aucune attribution n'est ROMPUE, et elle COMPTE et NOMME
 * chaque attribution qu'elle n'a pas pu trancher : une EXEMPTION. Le compte est celui des exemptions
 * réellement rendues par l'analyse, jamais la longueur d'un registre. *Une exemption tue est un vert
 * qui ment.*
 */

import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { referencePr, DEPOTS, DEPOT_LOCAL, type Attestation } from '../lot/attestation';

/*
 * LIMITES CONNUES — ce que cette garde ne voit pas, écrit plutôt que supposé :
 *   — un identifiant écrit au-delà de la vingtième ligne d'un fichier (le périmètre que l'acceptance fixe) ;
 *   — une attribution qui vit dans une REVUE plutôt que dans un fichier du dépôt ;
 *   — qu'un `it()` soit étiqueté par l'exigence qu'il teste vraiment : « ce titre teste un IBAN »
 *     contre « l'exigence dit mono-tenant » n'est mécanisable par aucune garde ;
 *   — une tâche qui RÉSOUT et POSSÈDE le fichier, mais que la phrase désigne à tort. Rejoué : la prose
 *     de `gov:plan-state` qui cite de nouveau GOV-032 pour la lacune PLAN-STATE reste VERTE, parce que
 *     GOV-032 déclare `gov-etat.ts`, le script de cette gate. La garde juge la propriété d'un fichier,
 *     pas le sens d'une phrase : l'occurrence « le backlog a bougé sous le nom » n'est fermée que
 *     lorsque le nom cesse de résoudre ou cesse de posséder le fichier.
 *
 * ⛔ NON LIVRÉS — LES LIVRABLES (5) ET (6) DE L'ACCEPTANCE. Elle les range sous « À livrer », et AUCUN
 * arbitrage écrit ne les en sort : ce n'est donc pas un choix de périmètre, c'est un manque, et il
 * appartient au gardien de la spécification de le trancher.
 *   — (5) la détection de collision de lots qui lit AUSSI `tests{}` s'écrit dans
 *     `scripts/lot/composer.ts`, que les `paths` de la tâche ne portent pas ; l'acceptance exige en
 *     outre de dire ce qu'on fait des tâches dont `tests{}` et `paths` divergent, et c'est une décision.
 *   — (6) confronter les fichiers TOUCHÉS par une PR aux `paths` de ses tâches exige la liste des
 *     fichiers d'une PR, que ce binaire ne lit pas (il juge le dépôt, pas un diff).
 */

// ── les sources, telles que la garde les lit ──────────────────────────────────
export type Tache = {
  id: string;
  paths?: string[];
  tests?: Record<string, string[]>;
  reqs?: string[];
  owner?: string | null;
  lot?: string | null;
  pr?: number | null;
  statut?: string;
  /** Le dépôt de forge. Le registre le renseigne sur chaque tâche ; le défaut (ce dépôt-ci) ne sert
   *  qu'aux fixtures. Un `repo` étranger CHANGE ce que `pr` désigne. */
  repo?: string;
  attestation?: Attestation | null;
};
export type Exigence = { id: string; taches?: string[] };
export type Gate = { id: string; script?: string; tache?: string; [champ: string]: unknown };
export type Poste = { code: string };
export type Entete = { fichier: string; lignes: string[] };

/**
 * Une mention d'identifiant DÉCLARÉE : elle est vue, elle est nommée, elle est COMPTÉE, et elle ne
 * rougit pas.
 *
 * 🔑 C'EST LA RÉPONSE À LA DISTINCTION QUE L'ACCEPTANCE POSE. Un identifiant bien formé qui ne
 * résout pas est de deux natures indiscernables : le relecteur CITE une tâche qu'il croit exister,
 * ou il RÉSERVE le prochain identifiant libre. Rien dans le dépôt ne les distingue — d'où le choix :
 * **on le REFUSE par défaut, et on exige une forme explicite de déclaration.** Et une tâche qui
 * résout, nommée dans un fichier hors de ses `paths`, est refusée pareillement, sauf déclaration
 * qu'elle est nommée comme CONTEXTE et non comme propriétaire.
 *
 *   citation     l'identifiant ne résout pas, et on le cite délibérément (la forme qu'une garde interdit) ;
 *   reservation  l'identifiant ne résout pas encore, et on le réserve ;
 *   contexte     la tâche résout, le fichier n'est pas à elle, et on la nomme comme voisine ;
 *   dette        l'attribution est FAUSSE, et ce fichier n'est pas dans les `paths` de GOV-037.
 */
export type Citation = {
  ou: string;
  id: string;
  nature: 'citation' | 'reservation' | 'contexte' | 'dette';
  raison: string;
};

/** Ce qu'une déclaration peut absoudre, selon que l'identifiant résout ou non. */
const ADMISES: Record<'non_resolue' | 'hors_paths', readonly Citation['nature'][]> = {
  non_resolue: ['citation', 'reservation', 'dette'],
  hors_paths: ['contexte', 'dette'],
};

/** Une non-réciprocité RÉELLE, connue, que cette tâche ne peut pas réparer (ses sources sont en écriture réservée). */
export type DetteGate = { gate: string; tache: string; script: string; raison: string };

export type Sources = {
  taches: Tache[];
  exigences: Exigence[];
  gates: Gate[];
  postes: Poste[];
  journal: string;
  /** Le journal couvre les PR de numéro STRICTEMENT supérieur — dérivé de `docs/journal/README.md`. */
  plancherJournal: number;
  entetes: Entete[];
  citations: Citation[];
  dettesGate: DetteGate[];
};

/**
 * Toutes les familles de FAUTE. `--prove` exige qu'un témoin DÉCLARÉ pour chacune la fasse rougir,
 * elle et pas une autre. Ajouter une famille sans témoin fait rougir la preuve, donc Gate A.
 */
export const FAMILLES = [
  'req_tache_non_reciproque',
  'gate_tache_inconnue',
  'gate_non_reciproque',
  'owner_hors_registre',
  'lot_non_atteste',
  'mention_non_resolue',
  'mention_hors_paths',
  'citation_perimee',
  'dette_perimee',
  'declaration_sans_raison',
] as const;
export type Famille = (typeof FAMILLES)[number];
export type Faute = { famille: Famille; message: string };

/**
 * Toutes les natures d'EXEMPTION : ce que la garde n'a pas tranché, et qu'elle imprime et compte à
 * chaque passage. `--prove` exige qu'un contre-témoin rende chacune au moins une fois — une nature
 * qu'aucun cas ne produit est une exemption que personne n'a vue s'ouvrir.
 */
export const NATURES = [
  'dette_gate',
  'dette',
  'contexte',
  'citation',
  'reservation',
  'lot_sous_plancher',
  'autre_depot',
  'indeterminee',
] as const;
export type Nature = (typeof NATURES)[number];
export type Exemption = { nature: Nature; tache: string; site: string; motif: string };
export type Verdict = { fautes: Faute[]; exemptions: Exemption[] };

const SENS: Record<Nature, string> = {
  dette_gate: 'non-réciprocité garde <-> tâche déclarée, que cette tâche ne peut pas réparer',
  dette: 'attribution FAUSSE déclarée, dans un fichier hors des paths de cette tâche',
  contexte: 'tâche nommée comme voisine, hors de ses paths, et déclarée comme telle',
  citation: 'identifiant qui ne résout pas, cité délibérément',
  reservation: 'identifiant qui ne résout pas encore, réservé',
  lot_sous_plancher: 'lot sans entrée de journal, PR sous le plancher de docs/journal/README.md',
  autre_depot: 'lot d’une tâche d’un autre dépôt : docs/journal/ n’indexe que les PR d’ici',
  indeterminee: 'réciprocité ni vraie ni fausse — la tâche n’a pas encore de paths réels',
};

/**
 * Une raison plus courte que ceci est refusée. Le seuil ne juge pas le SENS — aucune garde ne le
 * peut — il interdit les deux formes mesurées d'une déclaration qui ne dit rien : le vide, et le
 * renvoi (« idem. »), qui cesse de dire quelque chose dès que l'entrée du dessus bouge.
 */
export const RAISON_MINIMALE = 20;

/** Le périmètre que l'acceptance fixe pour un en-tête. */
export const LIGNES_D_EN_TETE = 20;

// ── outillage : rien de tapé qui puisse se dériver (RM-01) ────────────────────

/** `scripts/x.ts#un-job` et `spec.ts#le nom du it` : seule la partie fichier est un chemin. */
function sansAncre(valeur: string): string {
  const i = valeur.indexOf('#');
  return i === -1 ? valeur : valeur.slice(0, i);
}

/**
 * Un chemin GABARIT : `<dossier>/<l'id de la tâche elle-même>`, écrit par l'amorçage quand les
 * chemins réels ne sont pas encore connus (`docs/gouvernance/GOV-003`, `src/domaine/DM-02`).
 *
 * 🔑 IL DIT « ON NE SAIT PAS ENCORE », PAS « CE N'EST PAS À MOI ». Une garde qui condamnerait ces
 * tâches serait rouge de naissance, donc désarmée dans la semaine (RM-02). Leur réciprocité est
 * INDÉTERMINÉE : on ne la déclare ni vraie ni fausse — et chaque cas est IMPRIMÉ et COMPTÉ sous la
 * nature `indeterminee`, sans quoi ce serait l'exemption la plus large de la garde, et la seule muette.
 */
function estGabarit(t: Tache, chemin: string): boolean {
  return chemin.slice(chemin.lastIndexOf('/') + 1) === t.id;
}

/** Les `paths` de la tâche sont RENSEIGNÉS : aucun gabarit, et la liste n'est pas vide. */
export function pathsResolus(t: Tache): boolean {
  const p = t.paths ?? [];
  return p.length > 0 && !p.some((x) => estGabarit(t, x));
}

/** La surface qu'une tâche DÉCLARE toucher : ses `paths` et les fichiers de son `tests{}`. */
function surface(t: Tache): string[] {
  return [...(t.paths ?? []), ...Object.values(t.tests ?? {}).flat().map(sansAncre)];
}

/** Un chemin est couvert par une entrée exacte, ou par un préfixe de RÉPERTOIRE déclaré (barre finale). */
function couvre(t: Tache, chemin: string): boolean {
  return surface(t).some((x) => x === chemin || (x.endsWith('/') && chemin.startsWith(x)));
}

/**
 * LA FRONTIÈRE D'UN JETON, écrite une fois pour les identifiants de tâche ET les identifiants de lot.
 *   — rien avant qui prolonge le jeton : sans cela `REQ-DM-003` rend `DM-003`, `G-SEC-ROLES` rend `SEC-ROLES` ;
 *   — rien après non plus, `-` suivi d'un caractère compris : `DM-03-A` n'est pas une mention de `DM-03`,
 *     et `L-1-04` n'atteste pas le lot `L-1-0`.
 */
const AVANT = '(?<![A-Za-z0-9-])';
const APRES = '(?![A-Za-z0-9]|-[A-Za-z0-9])';
const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Le motif d'un identifiant de tâche, **dérivé des identifiants réels** (RM-01) : chaque suite de
 * chiffres devient `[0-9]+`, et on assemble l'alternance. Aucune liste de préfixes n'est tapée.
 *
 * ⚠️ L'ALTERNANCE N'EST PAS TRIÉE, ET C'EST MESURÉ. Une version précédente triait les formes du plus
 * long au plus court « pour que `DM-[0-9]+` ne morde pas dans `DM-03-A` ». La lentille `mutation` a
 * retiré le tri seul : aucun rouge. C'est l'assertion `APRES` qui fait ce travail — quand la forme
 * courte est prolongée par un caractère d'identifiant, elle échoue, et le moteur RETOMBE sur
 * l'alternative suivante. Deux précautions pour un seul effet, dont une qu'aucun cas ne pouvait voir
 * rougir : la seconde est retirée, la première a son contre-témoin (`DM-03-Z`, suffixe inconnu).
 */
export function motifIdentifiant(taches: Tache[]): RegExp {
  const formes = [...new Set(taches.map((t) => echapper(t.id).replace(/[0-9]+/g, '[0-9]+')))];
  return new RegExp(AVANT + '(?:' + formes.join('|') + ')' + APRES, 'g');
}

/** L'entrée NOMME le lot comme un jeton entier — jamais comme une sous-chaîne d'un lot plus long. */
function nommeLeLot(entree: string, lot: string): boolean {
  return new RegExp(AVANT + echapper(lot) + APRES).test(entree);
}

/**
 * L'ANCRE d'une entrée de journal, écrite UNE seule fois (RM-01).
 *
 * 🔑 CE N'EST PAS UNE RÉFÉRENCE DE PR, C'EST UN TITRE DE SECTION. Un message qui dit au lecteur
 * « l'entrée « … » du journal ne nomme pas ce lot » doit citer LA CHAÎNE QUI EST DANS LE FICHIER.
 * La référence de la PR d'une TÂCHE, elle, ne se compose jamais à la main : `referencePr()` en est
 * le seul auteur. Les deux cohabitent dans le même message et ce ne sont pas les mêmes objets.
 */
export const ANCRE_JOURNAL = '## PR #';

/** L'ancre de l'entrée d'UNE PR, telle qu'elle est écrite dans `docs/journal/`. */
export function ancreDeJournal(pr: number | string): string {
  return `${ANCRE_JOURNAL}${pr}`;
}

/** Le motif de titre, DÉRIVÉ de l'ancre : espaces souples, numéro capturé. Rien n'est retapé. */
const MOTIF_ANCRE = new RegExp('^' + echapper(ANCRE_JOURNAL).replace(/ /g, '\\s+') + '(\\d+)');

/** Les entrées du journal, indexées par numéro de PR. Le TITRE fait partie de l'entrée. */
export function entreesDeJournal(journal: string): Map<string, string> {
  const par = new Map<string, string[]>();
  let courant: string | null = null;
  for (const ligne of journal.split('\n')) {
    const m = MOTIF_ANCRE.exec(ligne);
    if (m) {
      courant = m[1] as string;
      par.set(courant, [ligne]);
      continue;
    }
    if (courant) (par.get(courant) as string[]).push(ligne);
  }
  return new Map([...par].map(([k, v]) => [k, v.join('\n')]));
}

const PATHS_GABARIT = 'paths gabarit';

// ── l'analyse ─────────────────────────────────────────────────────────────────

export function analyser(s: Sources): Verdict {
  const fautes: Faute[] = [];
  const exemptions: Exemption[] = [];
  const dire = (famille: Famille, message: string) => fautes.push({ famille, message });
  const vues = new Set<string>();
  const exempter = (nature: Nature, tache: string, site: string, motif: string) => {
    const cle = `${nature}|${tache}|${site}`;
    if (vues.has(cle)) return;
    vues.add(cle);
    exemptions.push({ nature, tache, site, motif });
  };

  const parId = new Map(s.taches.map((t) => [t.id, t]));
  const exigenceParId = new Map(s.exigences.map((e) => [e.id, e]));

  // ── (1) exigence <-> tâche : les DEUX sens ──────────────────────────────────
  for (const e of s.exigences) {
    for (const idTache of e.taches ?? []) {
      const t = parId.get(idTache);
      if (!t) {
        dire(
          'req_tache_non_reciproque',
          `docs/requirements.json — ${e.id}.taches cite « ${idTache} », qui n'est pas une tâche de docs/tasks.json.`
        );
        continue;
      }
      if (!(t.reqs ?? []).includes(e.id)) {
        dire(
          'req_tache_non_reciproque',
          `docs/requirements.json — ${e.id}.taches cite « ${idTache} », et ${idTache}.reqs ne cite pas ${e.id} en retour. ` +
            `L'attribution n'existe que d'un côté : celui qu'on lit n'est jamais celui qui a été corrigé.`
        );
      }
    }
  }
  for (const t of s.taches) {
    for (const idReq of t.reqs ?? []) {
      const e = exigenceParId.get(idReq);
      if (!e) {
        dire(
          'req_tache_non_reciproque',
          `docs/tasks.json — ${t.id}.reqs cite « ${idReq} », qui n'est pas une exigence de docs/requirements.json.`
        );
        continue;
      }
      if (!(e.taches ?? []).includes(t.id)) {
        dire(
          'req_tache_non_reciproque',
          `docs/tasks.json — ${t.id}.reqs cite « ${idReq} », et ${idReq}.taches ne cite pas ${t.id} en retour.`
        );
      }
    }
  }

  // ── (2) garde <-> tâche ─────────────────────────────────────────────────────
  //
  // ⚠️ CE SENS-LÀ SEULEMENT. La réciproque « une tâche qui déclare un script de garde en est la
  // porteuse » est fausse sur cet arbre, et légitimement : une garde est CRÉÉE par une tâche puis
  // ÉTENDUE par d'autres (`gov-identifiants.ts` est déclarée par plusieurs tâches, le registre n'en
  // nomme qu'une). Le registre nomme le CRÉATEUR ; les `paths` d'une tâche nomment ce qu'elle TOUCHE.
  const dettesGateVues = new Set<DetteGate>();
  for (const g of s.gates) {
    if (!g.tache) continue; // aucune attribution écrite : rien à confronter
    const t = parId.get(g.tache);
    if (!t) {
      dire(
        'gate_tache_inconnue',
        `docs/gates.json — la gate « ${g.id} » est attribuée à « ${g.tache} », qui n'est pas une tâche du backlog.`
      );
      continue;
    }
    const site = `docs/gates.json:${g.id}`;
    if (!g.script) {
      exempter('indeterminee', t.id, site, 'la gate ne déclare aucun script à confronter');
      continue;
    }
    const chemin = sansAncre(g.script);
    if (couvre(t, chemin)) continue;
    const dette = s.dettesGate.find((d) => d.gate === g.id && d.tache === g.tache && d.script === chemin);
    if (dette) {
      dettesGateVues.add(dette);
      exempter('dette_gate', t.id, `${site} (${chemin})`, dette.raison);
      continue;
    }
    if (!pathsResolus(t)) {
      exempter('indeterminee', t.id, `${site} (${chemin})`, PATHS_GABARIT);
      continue;
    }
    dire(
      'gate_non_reciproque',
      `docs/gates.json — la gate « ${g.id} » déclare le porteur « ${g.tache} » pour ${chemin}, ` +
        `et ${g.tache} ne déclare ce fichier ni dans ses paths ni dans son tests{}. ` +
        `L'attribution n'est réciproque dans aucun sens.`
    );
  }
  for (const d of s.dettesGate) {
    if (dettesGateVues.has(d)) continue;
    dire(
      'dette_perimee',
      `DETTE_GATE_NON_RECIPROQUE déclare « ${d.gate} » -> « ${d.tache} » (${d.script}), qui n'est PLUS mesurée. ` +
        `Soit la réciprocité est rétablie et l'entrée doit sortir du registre, soit la gate a disparu. ` +
        `Un registre de dettes qu'on ne vide pas cesse d'être lu.`
    );
  }

  // ── (3) poste <-> tâche ─────────────────────────────────────────────────────
  const codes = new Set(s.postes.map((p) => p.code));
  for (const t of s.taches) {
    if (!t.owner) continue; // pas d'owner : une absence, pas une attribution
    if (codes.has(t.owner)) continue;
    dire(
      'owner_hors_registre',
      `docs/tasks.json — ${t.id}.owner vaut « ${t.owner} », qui n'est pas un poste de docs/agents.json.`
    );
  }

  // ── (4) lot <-> tâche, attesté par le journal ───────────────────────────────
  //
  // 🔑 POURQUOI LE JOURNAL, ET PAS `docs/lots/`. `pnpm lot:cloture` écrit `t.lot = lotId` sur toute
  // tâche présente dans le rendu du workflow, SANS vérifier qu'elle appartenait au lot. La
  // composition qui aurait pu le démentir vit dans `docs/lots/<id>/lot.json`, que `.gitignore`
  // exclut. La seule seconde source qui reste au dépôt est `docs/journal/`.
  //
  // 🔑 SOUS LE PLANCHER, L'ABSENCE D'ENTRÉE N'EST PAS UNE FAUTE — ET LA FRONTIÈRE N'EST PAS TAPÉE ICI.
  // `docs/journal/README.md` écrit le plancher, et `gov:etat` le dérive déjà de cette ligne. Une
  // liste des tâches concernées retaperait cette règle sous une autre forme, et divergerait d'elle.
  // Une entrée EXISTANTE qui ne nomme pas le lot reste une faute, plancher ou non.
  //
  // 🔑 ET SEULEMENT POUR LES TÂCHES DE **CE** DÉPÔT. `docs/journal/` indexe les PR d'ici : confronter
  // le `pr` d'une tâche livrée ailleurs à ces titres est une erreur de catégorie. Ces tâches-là sont
  // EXEMPTÉES, donc imprimées et comptées — pas sautées.
  const entrees = entreesDeJournal(s.journal);
  for (const t of s.taches) {
    if (!t.lot || t.pr === null || t.pr === undefined) continue; // aucune attribution de lot écrite
    const repo = t.repo ?? DEPOT_LOCAL;
    // La PR de la TÂCHE se compose par son seul auteur ; l'ANCRE du journal se dérive de sa source.
    const ref = referencePr({ id: t.id, repo, statut: t.statut ?? 'a_faire', pr: t.pr, attestation: t.attestation ?? null });
    const ancre = ancreDeJournal(t.pr);
    if (repo !== DEPOT_LOCAL) {
      exempter('autre_depot', t.id, `lot « ${t.lot} », ${ref}`, `repo « ${repo} »`);
      continue;
    }
    const entree = entrees.get(String(t.pr));
    if (entree !== undefined && nommeLeLot(entree, t.lot)) continue;
    if (entree === undefined && t.pr <= s.plancherJournal) {
      exempter('lot_sous_plancher', t.id, `lot « ${t.lot} », ${ref}`, `plancher du journal : > ${s.plancherJournal}`);
      continue;
    }
    dire(
      'lot_non_atteste',
      entree === undefined
        ? `docs/tasks.json — ${t.id} porte lot « ${t.lot} » et ${ref}, et docs/journal/ n'a aucune entrée « ${ancre} », ` +
            `au-dessus du plancher (> ${s.plancherJournal}). Rien n'atteste que cette tâche appartenait au lot : lot:cloture écrit le lot sans le vérifier.`
        : `docs/tasks.json — ${t.id} porte lot « ${t.lot} » et ${ref}, et l'entrée « ${ancre} » du journal ne nomme pas « ${t.lot} » comme un jeton entier. ` +
            `Une tâche étrangère au lot, présente dans le rendu, passe fusionnee avec ce lot écrit dans un fichier versionné.`
    );
  }

  // ── (5) tout identifiant de tâche NOMMÉ doit RÉSOUDRE, et désigner une tâche à qui le fichier appartient ──
  const motif = motifIdentifiant(s.taches);
  const citationsVues = new Set<Citation>();
  const declaree = (ou: string, id: string, admises: readonly Citation['nature'][]) =>
    s.citations.find((c) => c.ou === ou && c.id === id && admises.includes(c.nature));

  /**
   * @param ou           la clé sous laquelle une déclaration se range (fichier, ou champ de gates.json)
   * @param fichier      le fichier dont la tâche nommée doit être propriétaire, `null` s'il n'y en a pas
   * @param proprietaire la tâche déjà confrontée à ce fichier par la relation (2), qui ne se juge pas deux fois
   */
  const examiner = (ou: string, fichier: string | null, texte: string, situer: string, proprietaire?: string) => {
    for (const m of texte.match(motif) ?? []) {
      const t = parId.get(m);
      if (!t) {
        const c = declaree(ou, m, ADMISES.non_resolue);
        if (c) {
          citationsVues.add(c);
          exempter(c.nature, m, situer, c.raison);
          continue;
        }
        dire(
          'mention_non_resolue',
          `${situer} — « ${m} » a la forme d'un identifiant de tâche et ne RÉSOUT PAS. ` +
            `gov:identifiants juge la forme, jamais la résolution : cette mention envoie le lecteur suivant nulle part. ` +
            `Corrige-la, ou DÉCLARE-la dans CITATIONS_DECLAREES en disant si tu CITES ou si tu RÉSERVES.`
        );
        continue;
      }
      if (m === proprietaire) continue; // confrontée par la relation garde <-> tâche, ci-dessus
      if (fichier !== null && couvre(t, fichier)) continue;
      const c = declaree(ou, m, ADMISES.hors_paths);
      if (c) {
        citationsVues.add(c);
        exempter(c.nature, m, situer, c.raison);
        continue;
      }
      if (fichier === null) {
        exempter('indeterminee', m, situer, 'aucun fichier à confronter');
        continue;
      }
      if (!pathsResolus(t)) {
        exempter('indeterminee', m, situer, PATHS_GABARIT);
        continue;
      }
      dire(
        'mention_hors_paths',
        `${situer} — nomme « ${m} », et ${fichier} n'est ni dans les paths ni dans le tests{} de ${m}. ` +
          `Le lecteur suivant ira chercher chez ${m} un fichier qui n'est pas à elle. Corrige le nom, ou ` +
          `DÉCLARE la mention en « contexte » dans CITATIONS_DECLAREES si la tâche est nommée comme voisine.`
      );
    }
  };

  for (const e of s.entetes) {
    e.lignes.forEach((ligne, i) => examiner(e.fichier, e.fichier, ligne, `${e.fichier}:${i + 1}`));
  }
  // ⚠️ TOUTE chaîne d'une entrée, PAS le seul champ `tache` : sur `gov:plan-state` le champ `tache`
  // n'a JAMAIS bougé pendant que la valse des identifiants se jouait dans la prose du champ `verifie`.
  for (const g of s.gates) {
    const fichier = g.script ? sansAncre(g.script) : null;
    for (const [champ, valeur] of Object.entries(g)) {
      if (typeof valeur !== 'string') continue;
      const ou = `docs/gates.json:${g.id}.${champ}`;
      examiner(ou, fichier, valeur, ou, g.tache);
    }
  }

  // 🔑 LA GARDE CONFRONTE À L'ÉTAT COURANT DU BACKLOG, ELLE NE VÉRIFIE PAS UNE FOIS. Une attribution
  // se corrompt aussi quand le BACKLOG bouge — et un registre de déclarations vieillit pareil : une
  // déclaration qui n'a absous aucune mention à ce passage est périmée.
  for (const c of s.citations) {
    if (citationsVues.has(c)) continue;
    dire(
      'citation_perimee',
      parId.has(c.id) && ADMISES.non_resolue.includes(c.nature)
        ? `CITATIONS_DECLAREES — « ${c.id} » est déclaré en ${c.nature} pour ${c.ou}, et il RÉSOUT maintenant : ` +
            `le backlog a bougé sous la déclaration. Retire l'entrée, et vérifie que la phrase dit encore ce qu'elle voulait dire.`
        : `CITATIONS_DECLAREES — « ${c.id} » est déclaré en ${c.nature} pour ${c.ou}, et n'y absout plus aucune mention ` +
            `(le site ne le porte plus, la tâche déclare maintenant ce fichier, ou la nature ne convient pas). Retire ou corrige l'entrée.`
    );
  }

  // ── (6) une déclaration dit POURQUOI ────────────────────────────────────────
  for (const c of s.citations) {
    if (c.raison.trim().length >= RAISON_MINIMALE) continue;
    dire(
      'declaration_sans_raison',
      `CITATIONS_DECLAREES — « ${c.id} » pour ${c.ou} porte une raison de ${c.raison.trim().length} caractère(s) ` +
        `(minimum ${RAISON_MINIMALE}). Une exemption qui ne dit pas pourquoi ne peut être relue par personne.`
    );
  }
  for (const d of s.dettesGate) {
    if (d.raison.trim().length >= RAISON_MINIMALE) continue;
    dire(
      'declaration_sans_raison',
      `DETTE_GATE_NON_RECIPROQUE — « ${d.gate} » -> « ${d.tache} » porte une raison de ${d.raison.trim().length} ` +
        `caractère(s) (minimum ${RAISON_MINIMALE}).`
    );
  }

  return { fautes, exemptions };
}

// ── les registres : ce qui est DÉCLARÉ est vu, nommé, compté, et ne dort pas ──
//
// Chacun est une ÉGALITÉ D'ENSEMBLES, pas un plafond : une faute nouvelle rougit en se nommant,
// une faute réparée rougit en demandant qu'on retire son entrée (`dette_perimee`, `citation_perimee`).

/**
 * LES NON-RÉCIPROCITÉS RÉELLES, MESURÉES, et que GOV-037 ne peut pas réparer : `docs/gates.json` et
 * `docs/tasks.json` sont en écriture réservée (`docs/PRESEANCE.md`).
 *
 * 🔧 `gov:derivation` : la non-réciprocité y est VOULUE et écrite. La gate est DIFFÉRÉE
 * (`docs/GARDES-AXIONIA.md` §2), son script n'existe pas, et `docs/gates.json` dit lui-même pourquoi
 * l'entrée reste attribuée à son créateur : la ré-attribuer viderait le témoin de
 * `gardes-transposees.spec.ts`. *Une attribution délibérément non réciproque reste une attribution
 * non réciproque : on la DÉCLARE, on ne la corrige pas en cassant ce qui la surveille.*
 */
export const DETTE_GATE_NON_RECIPROQUE: DetteGate[] = [
  {
    gate: 'detectPii',
    tache: 'INT-T01a',
    script: 'scripts/gates/detect-pii.ts',
    raison:
      'INT-T01a est fusionnee et ses paths sont renseignés, mais ne portent pas ce script — qui ' +
      "n'existe pas non plus sur le disque. L'attribution ne tient d'aucun côté.",
  },
  {
    gate: 'gov:contrat',
    tache: 'INT-T01a',
    script: 'scripts/gates/contrat-epingle.ts',
    raison: 'même cas : la gate déclare un porteur que la tâche ne déclare pas en retour.',
  },
  {
    gate: 'fixtures:source',
    tache: 'INT-T01a',
    script: 'scripts/gates/fixtures-source.ts',
    raison: 'même cas : la gate déclare un porteur que la tâche ne déclare pas en retour.',
  },
  {
    gate: 'gov:derivation',
    tache: 'GOV-014',
    script: 'scripts/gates/gov-derivation.ts',
    raison:
      'gate DIFFÉRÉE, et son attribution est VOULUE : le script n’existe pas, GOV-014 ne peut donc ' +
      'pas le déclarer, et le registre écrit noir sur blanc que la ré-attribuer à DM-03-A viderait ' +
      'le témoin de gardes-transposees.spec.ts. Le jour où DM-03-A arme la garde, `dette_perimee` ' +
      'réclamera cette ligne.',
  },
];

/** Les mentions d'identifiants déclarées, chacune vue, nommée, comptée et justifiée. */
export const CITATIONS_DECLAREES: Citation[] = [
  // ⚠️ LA NÉGATION QUI PROTÈGE. `gov:tasks` interdit les identifiants SCINDÉS et les NOMME pour
  // dire lesquels. Une garde qui ferait rougir cette phrase forcerait à retirer la défense elle-même.
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'INT-T01',
    nature: 'citation',
    raison: 'la garde NOMME la forme scindée qu’elle interdit ; les vraies tâches sont INT-T01a et INT-T01b.',
  },
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'GOV-017',
    nature: 'citation',
    raison: 'la garde NOMME la forme scindée qu’elle interdit ; les vraies tâches sont GOV-017a et GOV-017b.',
  },
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'EXT-T02',
    nature: 'citation',
    raison: 'la garde NOMME la forme scindée qu’elle interdit ; EXT-T02a et EXT-T02b existent, EXT-T02 non.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'INT-T01',
    nature: 'citation',
    raison: 'le registre décrit ce que gov:tasks interdit, dans les mêmes termes qu’elle.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'GOV-017',
    nature: 'citation',
    raison: 'le registre décrit la forme scindée que gov:tasks interdit ; GOV-017a et GOV-017b existent.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'EXT-T02',
    nature: 'citation',
    raison: 'le registre décrit la forme scindée que gov:tasks interdit ; EXT-T02a et EXT-T02b existent.',
  },
  // ── des attributions FAUSSES, dans des fichiers hors des paths de GOV-037 ──
  {
    ou: 'scripts/lot/issues.ts',
    id: 'GOV-017',
    nature: 'dette',
    raison:
      'en-tête : « synchronise les issues GitHub avec docs/tasks.json (GOV-017) ». GOV-017 ne résout ' +
      'pas ; le fichier appartient à GOV-017a ou GOV-017b. Hors des paths de GOV-037.',
  },
  {
    // Invisible tant que la garde filtrait les extensions : ce fichier est un `.json` sous `scripts/`.
    ou: 'scripts/lot/tasks.schema.json',
    id: 'GOV-017',
    nature: 'dette',
    raison:
      '« rendait GOV-017 infaisable » nomme la tâche d’avant la scission ; elle ne résout plus, les ' +
      'vraies sont GOV-017a et GOV-017b. Fichier hors des paths de GOV-037.',
  },
  {
    ou: 'docs/gates.json:gate-nightly.verifie',
    id: 'INT-T08',
    nature: 'dette',
    raison:
      '« reconciliation quotidienne (INT-T08) » : la tâche est INT-T08-A ou INT-T08-P. ' +
      'docs/gates.json est en écriture réservée.',
  },
  // ── des tâches nommées comme VOISINES, hors de leurs paths — l'acceptance le permet explicitement ──
  {
    ou: 'scripts/gates/gh-sur.js',
    id: 'GOV-012',
    nature: 'contexte',
    raison: 'historique : la tâche qui a TROUVÉ le défaut que ce fichier ferme, pas celle qui le porte.',
  },
  {
    ou: 'scripts/gates/gh-sur.js',
    id: 'GOV-008',
    nature: 'contexte',
    raison: 'historique : la seconde tâche qui a trouvé le même défaut, de son côté.',
  },
  {
    ou: 'scripts/lot/corps-de-pr.ts',
    id: 'GOV-035',
    nature: 'contexte',
    raison:
      'l’en-tête RACONTE l’attribution fausse qu’il portait (il nommait cette tâche) et sa correction ; ' +
      'rejouée contre cette garde sans la déclaration, elle rougit en mention_hors_paths.',
  },
  {
    ou: 'scripts/lot/corps-de-pr.ts',
    id: 'GOV-037',
    nature: 'contexte',
    raison: 'renvoie à la tâche qui porte la garde des attributions, comme suite du constat.',
  },
  {
    ou: 'tests/unit/gouvernance/autonomie.spec.ts',
    id: 'GOV-011',
    nature: 'contexte',
    raison: 'historique : la garde de traçabilité de cette tâche a trouvé le défaut que ce test tient.',
  },
  {
    ou: 'tests/unit/gouvernance/autonomie.spec.ts',
    id: 'GOV-012',
    nature: 'contexte',
    raison: 'renvoie à la tâche qui porte la protection de branche dont ce test décrit le contournement.',
  },
  {
    ou: 'tests/unit/gouvernance/corps-de-pr-couvre.spec.ts',
    id: 'GOV-036',
    nature: 'contexte',
    raison: 'exemple cité : gov-entite.ts désigne cette tâche, et c’est le cas que le test illustre.',
  },
  {
    ou: 'tests/unit/gouvernance/tout-check-est-cable.spec.ts',
    id: 'GOV-011',
    nature: 'contexte',
    raison: 'historique : la tâche dont la garde a trouvé la case cochée sans être vraie.',
  },
  {
    ou: 'docs/gates.json:perf:bundle.verifie',
    id: 'GOV-019',
    nature: 'contexte',
    raison: 'la prose date les seuils de la première mesure faite par cette tâche ; la gate est à une autre.',
  },
];

// ── chargement des sources réelles ────────────────────────────────────────────

/** Une source n'a pas pu être lue. Ce n'est pas « rien à signaler » : c'est « je n'ai rien lu ». */
export class SourceIllisible extends Error {
  constructor(motif: string) {
    super(motif);
    this.name = 'SourceIllisible';
  }
}

const README_JOURNAL = 'docs/journal/README.md';

/**
 * La ligne du plancher, sous la forme que `gov-etat.ts` lit aussi. Ce module ne l'exporte pas (il
 * sort du processus quand il s'exécute) : si la ligne change de forme, les DEUX refusent en se
 * nommant, et aucun ne devine.
 */
const MOTIF_PLANCHER = /Plancher\s*:\s*le journal couvre les PR de numéro \*\*> (\d+)\*\*/;

/**
 * Les sources, lues UNIQUEMENT parmi les fichiers SUIVIS : un fichier posé à côté du dépôt n'atteste
 * rien, et un fichier suivi absent de la liste n'est pas remplacé par ce que le disque rend.
 *
 * @param suivis la liste que rend `fichiersSuivisOuRefus` — le périmètre est établi AVANT toute lecture
 * @param lire   le lecteur de contenu ; injecté par les témoins de refus, jamais par la garde
 */
export function chargerSources(
  suivis: readonly string[],
  lire: (chemin: string) => string = (chemin) => readFileSync(chemin, 'utf8')
): Sources {
  const suivi = new Set(suivis);
  const texte = (chemin: string): string => {
    if (!suivi.has(chemin)) {
      throw new SourceIllisible(`${chemin} n'est pas un fichier SUIVI par git : la garde ne lit pas ce que le dépôt ne porte pas.`);
    }
    return lire(chemin);
  };
  const tableau = <T>(chemin: string, cle: string): T[] => {
    const brut = texte(chemin);
    let doc: unknown;
    try {
      doc = JSON.parse(brut);
    } catch (e) {
      throw new SourceIllisible(`${chemin} n'est pas du JSON lisible (${(e as Error).message}).`);
    }
    const valeur = doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>)[cle] : undefined;
    if (!Array.isArray(valeur)) {
      throw new SourceIllisible(`${chemin} ne porte pas de tableau « ${cle} » : un registre renommé n'est pas un registre vide.`);
    }
    return valeur as T[];
  };

  const journaux = suivis.filter((f) => f.startsWith('docs/journal/') && f.endsWith('.md') && f !== README_JOURNAL);
  if (journaux.length === 0) {
    throw new SourceIllisible(`aucun fichier de journal SUIVI sous docs/journal/ : l'attestation des lots n'aurait aucune source.`);
  }
  const plancher = MOTIF_PLANCHER.exec(texte(README_JOURNAL));
  if (!plancher) {
    throw new SourceIllisible(
      `le plancher du journal est introuvable dans ${README_JOURNAL} (forme attendue : « Plancher : le journal couvre les PR de numéro **> <n>** »).`
    );
  }

  return {
    taches: tableau<Tache>('docs/tasks.json', 'taches'),
    exigences: tableau<Exigence>('docs/requirements.json', 'exigences'),
    gates: tableau<Gate>('docs/gates.json', 'gates'),
    postes: tableau<Poste>('docs/agents.json', 'postes'),
    journal: journaux.map(texte).join('\n'),
    plancherJournal: Number(plancher[1]),
    // TOUT fichier suivi de `scripts/` et `tests/`, quelle que soit son extension : l'acceptance dit
    // « tout fichier suivi », et un filtre d'extension est un périmètre qui s'ampute en silence.
    entetes: suivis
      .filter((f) => f.startsWith('scripts/') || f.startsWith('tests/'))
      .map((f) => ({ fichier: f, lignes: texte(f).split('\n').slice(0, LIGNES_D_EN_TETE) })),
    citations: CITATIONS_DECLAREES,
    dettesGate: DETTE_GATE_NON_RECIPROQUE,
  };
}

// ── la preuve : un témoin par famille, un contre-témoin par nature d'exemption ─
//
// INVARIANT, repris de `gov:publication` : `--prove` n'accepte AUCUN décompte. Il exige qu'un témoin
// DÉCLARÉ pour chaque famille la fasse rougir en NOMMANT ce qu'il annonce, qu'aucun contre-témoin ne
// fasse rougir aucune famille, et que chaque contre-témoin rende EXACTEMENT les exemptions qu'il
// annonce — une exemption ajoutée ou tue change ce que la bannière verte affirme.

export type Temoin = { famille: Famille; quoi: string; sources: Partial<Sources>; nomme?: string[] };
export type ContreTemoin = { quoi: string; sources: Partial<Sources>; exemptions?: Nature[] };

/** Les dimensions absentes d'un cas valent VIDE — jamais une présence fabriquée (le plancher vaut 0 : aucune PR exemptée). */
export function completer(p: Partial<Sources>): Sources {
  return {
    taches: p.taches ?? [],
    exigences: p.exigences ?? [],
    gates: p.gates ?? [],
    postes: p.postes ?? [],
    journal: p.journal ?? '',
    plancherJournal: p.plancherJournal ?? 0,
    entetes: p.entetes ?? [],
    citations: p.citations ?? [],
    dettesGate: p.dettesGate ?? [],
  };
}

const T_RESOLUE: Tache = {
  id: 'GOV-100',
  paths: ['scripts/gates/porte.ts'],
  tests: {},
  reqs: [],
  owner: null,
  lot: null,
  pr: null,
  statut: 'fusionnee',
};
/** Une voisine RÉSOLUE, propriétaire d'un AUTRE fichier. */
const T_VOISINE: Tache = { ...T_RESOLUE, id: 'GOV-101', paths: ['scripts/gates/autre.ts'] };
const JOURNAL = '## PR #31 — 2026-09-10 — feat(GOV-024): lot L-1-04\n\n**Fait.** Neuf tâches.\n';
const RAISON = 'une raison qui dit pourquoi, relisible par la session suivante';
const DEPOT_ETRANGER = Object.keys(DEPOTS).find((r) => r !== DEPOT_LOCAL && DEPOTS[r] !== null) as string;
const entete = (lignes: string[], fichier = 'scripts/gates/porte.ts'): Entete[] => [{ fichier, lignes }];
const PII = { id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'GOV-100' };

export const TEMOINS: Temoin[] = [
  // ── (1) exigence <-> tâche ──
  {
    famille: 'req_tache_non_reciproque',
    quoi: 'une exigence cite une tâche qui ne la cite pas en retour',
    sources: { taches: [T_RESOLUE], exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-100'] }] },
    nomme: ['REQ-GOV-900', 'GOV-100'],
  },
  {
    famille: 'req_tache_non_reciproque',
    quoi: 'une tâche cite une exigence qui ne la cite pas en retour',
    sources: { taches: [{ ...T_RESOLUE, reqs: ['REQ-GOV-900'] }], exigences: [{ id: 'REQ-GOV-900', taches: [] }] },
    nomme: ['REQ-GOV-900', 'GOV-100'],
  },
  {
    famille: 'req_tache_non_reciproque',
    quoi: 'une exigence cite une tâche INEXISTANTE',
    sources: { exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-999'] }] },
    nomme: ['GOV-999'],
  },
  {
    famille: 'req_tache_non_reciproque',
    quoi: 'une tâche cite une exigence INEXISTANTE',
    sources: { taches: [{ ...T_RESOLUE, reqs: ['REQ-GOV-999'] }] },
    nomme: ['REQ-GOV-999'],
  },
  // ── (2) garde <-> tâche ──
  {
    famille: 'gate_tache_inconnue',
    quoi: 'une gate est attribuée à une tâche qui n’existe pas',
    sources: { gates: [{ id: 'gov:zzz', script: 'scripts/gates/zzz.ts', tache: 'GOV-999' }] },
    nomme: ['gov:zzz', 'GOV-999'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une gate déclare un porteur que la tâche ne déclare pas en retour',
    sources: { taches: [T_RESOLUE], gates: [PII] },
    nomme: ['detectPii', 'scripts/gates/detect-pii.ts', 'GOV-100'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'un path SANS barre finale ne couvre pas le fichier qui le prolonge (`porte.ts` ne couvre pas `porte.tsx`)',
    sources: { taches: [T_RESOLUE], gates: [{ id: 'porte', script: 'scripts/gates/porte.tsx', tache: 'GOV-100' }] },
    nomme: ['scripts/gates/porte.tsx'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une NOUVELLE non-réciprocité, à côté d’une dette déclarée, rougit quand même',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII, { id: 'nouvelle', script: 'scripts/gates/nouvelle.ts', tache: 'GOV-100' }],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: RAISON }],
    },
    nomme: ['nouvelle'],
  },
  // ── (3) poste <-> tâche ──
  {
    famille: 'owner_hors_registre',
    quoi: 'un owner absent du registre des agents',
    sources: { taches: [{ ...T_RESOLUE, owner: 'A99' }], postes: [{ code: 'A01' }] },
    nomme: ['GOV-100', 'A99'],
  },
  // ── (4) lot <-> tâche ──
  {
    famille: 'lot_non_atteste',
    quoi: 'une tâche étrangère au lot : l’entrée de sa PR ne nomme pas son lot — le message cite l’ANCRE et la RÉFÉRENCE',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 31 }], journal: JOURNAL },
    nomme: [
      'L-9-99',
      ancreDeJournal(31),
      referencePr({ id: 'GOV-100', repo: DEPOT_LOCAL, statut: 'fusionnee', pr: 31, attestation: null }) as string,
    ],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'un lot PRÉFIXE d’un lot nommé n’est pas attesté (`L-1-0` contre une entrée qui nomme `L-1-04`)',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-0', pr: 31 }], journal: JOURNAL },
    nomme: ['L-1-0'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'une PR sans entrée, UN numéro au-dessus du plancher',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 28 }], journal: JOURNAL, plancherJournal: 27 },
    nomme: [ancreDeJournal(28)],
  },
  // ── (5) mentions ──
  {
    famille: 'mention_non_resolue',
    quoi: 'un en-tête nomme un identifiant bien formé qui ne résout pas',
    sources: { taches: [T_RESOLUE], entetes: entete(['/**', ' * arbitrage porté par GOV-033']) },
    nomme: ['scripts/gates/porte.ts:2', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'la PROSE d’une entrée de docs/gates.json est lue, pas seulement son champ tache',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'gov:plan-state', script: 'scripts/gates/porte.ts', tache: 'GOV-100', verifie: 'la lacune que GOV-033 porte' }],
    },
    nomme: ['gov:plan-state', 'verifie', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une citation déclarée pour UN fichier n’absout pas le même identifiant dans un AUTRE',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [{ ou: 'scripts/gates/gov-tasks.ts', id: 'GOV-017', nature: 'citation', raison: RAISON }],
    },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-017'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une citation déclarée pour UN identifiant n’absout pas un AUTRE identifiant du même fichier',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017 et GOV-033']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: RAISON }],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une déclaration « contexte » n’absout pas un identifiant qui ne résout pas',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-033']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'contexte', raison: RAISON }],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'un en-tête nomme une tâche qui EXISTE et à qui le fichier n’appartient pas',
    sources: { taches: [T_RESOLUE, T_VOISINE], entetes: entete(['// arbitrage porté par GOV-101']) },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-101'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'la prose d’une gate nomme une tâche qui existe et à qui le script n’appartient pas',
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      gates: [{ id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', verifie: 'portée par GOV-101' }],
    },
    nomme: ['docs/gates.json:g.verifie', 'GOV-101'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'une déclaration « citation » n’absout pas une tâche résolue nommée hors de ses paths',
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      entetes: entete(['// GOV-101']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-101', nature: 'citation', raison: RAISON }],
    },
    nomme: ['GOV-101'],
  },
  {
    famille: 'citation_perimee',
    quoi: 'une citation déclarée dont l’identifiant s’est mis à résoudre — le backlog a bougé',
    sources: {
      taches: [T_RESOLUE, { ...T_RESOLUE, id: 'GOV-033' }],
      entetes: entete(['// GOV-033']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'reservation', raison: RAISON }],
    },
    nomme: ['GOV-033', 'RÉSOUT maintenant'],
  },
  {
    famille: 'citation_perimee',
    quoi: 'une citation déclarée dont le site ne porte plus l’identifiant',
    sources: {
      entetes: entete(['// plus rien ici']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'citation', raison: RAISON }],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'dette_perimee',
    quoi: 'une dette de réciprocité déclarée mais réparée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['scripts/gates/detect-pii.ts'] }],
      gates: [PII],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: RAISON }],
    },
    nomme: ['detectPii'],
  },
  // ── (6) raisons ──
  {
    famille: 'declaration_sans_raison',
    quoi: 'une raison faite de blancs est vide',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: ' '.repeat(RAISON_MINIMALE) }],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une raison d’UN caractère sous le minimum est refusée',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: 'r'.repeat(RAISON_MINIMALE - 1) }],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une dette de réciprocité sans raison est refusée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: '' }],
    },
    nomme: ['detectPii'],
  },
];

/**
 * Ce que la garde ne doit PAS faire rougir, et les exemptions EXACTES qu'elle doit en rendre. Une
 * garde qui rougit sur tout ne dit rien de plus qu'une garde qui ne rougit jamais.
 */
export const CONTRE_TEMOINS: ContreTemoin[] = [
  {
    quoi: 'une attribution exigence <-> tâche réciproque des deux côtés',
    sources: { taches: [{ ...T_RESOLUE, reqs: ['REQ-GOV-900'] }], exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-100'] }] },
  },
  {
    quoi: 'une gate déclarée dans les paths de sa tâche',
    sources: { taches: [{ ...T_RESOLUE, paths: ['scripts/gates/detect-pii.ts'] }], gates: [PII] },
  },
  {
    quoi: 'une gate déclarée dans le tests{} de sa tâche',
    sources: {
      taches: [{ ...T_RESOLUE, tests: { 'REQ-GOV-900': ['tests/integration/index-partiel.spec.ts#un cas'] } }],
      gates: [{ id: 'idx', script: 'tests/integration/index-partiel.spec.ts', tache: 'GOV-100' }],
    },
  },
  {
    quoi: 'une gate sous un RÉPERTOIRE déclaré, et un #job qui ne compte pas dans la comparaison',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/', '.github/workflows/ci.yml'] }],
      gates: [
        { id: 'c', script: 'packages/contracts/verifier.ts', tache: 'GOV-100' },
        { id: 'gate-a', script: '.github/workflows/ci.yml#gate-a', tache: 'GOV-100' },
      ],
    },
  },
  {
    quoi: 'une gate d’une tâche aux paths GABARIT : INDÉTERMINÉE, pas fausse — et exemptée en le disant',
    sources: {
      taches: [{ ...T_RESOLUE, id: 'GOV-003', paths: ['docs/gouvernance/GOV-003'] }],
      gates: [{ id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' }],
    },
    exemptions: ['indeterminee'],
  },
  {
    quoi: 'une gate qui ne déclare aucun script : rien à confronter, et exemptée en le disant',
    sources: { taches: [T_RESOLUE], gates: [{ id: 'g', tache: 'GOV-100' }] },
    exemptions: ['indeterminee'],
  },
  {
    quoi: 'un en-tête nomme une tâche aux paths GABARIT : indéterminée, et exemptée en le disant',
    sources: {
      taches: [T_RESOLUE, { ...T_RESOLUE, id: 'GOV-003', paths: ['docs/gouvernance/GOV-003'] }],
      entetes: entete(['// étendue par GOV-003']),
    },
    exemptions: ['indeterminee'],
  },
  {
    quoi: 'une tâche VOISINE déclare la même garde sans en être porteuse',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'GOV-003', paths: ['scripts/gates/gov-identifiants.ts'] },
        { ...T_RESOLUE, id: 'GOV-025', paths: ['scripts/gates/gov-identifiants.ts'] },
      ],
      gates: [{ id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' }],
    },
  },
  {
    quoi: 'un owner vide : une absence, pas une attribution fausse',
    sources: { taches: [T_RESOLUE], postes: [{ code: 'A01' }] },
  },
  {
    quoi: 'le lot nommé dans le TITRE de l’entrée de journal suffit',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 31 }], journal: JOURNAL },
  },
  {
    quoi: 'une PR sans entrée, AU plancher du journal : exemptée en le disant',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 27 }], journal: JOURNAL, plancherJournal: 27 },
    exemptions: ['lot_sous_plancher'],
  },
  {
    quoi: 'une tâche livrée dans un AUTRE dépôt ne se confronte pas au journal d’ici — exemptée en le disant',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 998, repo: DEPOT_ETRANGER }], journal: JOURNAL },
    exemptions: ['autre_depot'],
  },
  {
    quoi: 'LA NÉGATION QUI PROTÈGE : la garde qui NOMME la forme scindée qu’elle interdit (raison AU minimum)',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// aucun identifiant scindé (`GOV-017`)'], 'scripts/gates/gov-tasks.ts'),
      citations: [{ ou: 'scripts/gates/gov-tasks.ts', id: 'GOV-017', nature: 'citation', raison: 'r'.repeat(RAISON_MINIMALE) }],
    },
    exemptions: ['citation'],
  },
  {
    quoi: 'un identifiant RÉSERVÉ, déclaré comme tel',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-034 : réservé']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-034', nature: 'reservation', raison: RAISON }],
    },
    exemptions: ['reservation'],
  },
  {
    quoi: 'une attribution FAUSSE déclarée en dette : bruyante, pas bloquante',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// synchronise les issues (GOV-017)']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'dette', raison: RAISON }],
    },
    exemptions: ['dette'],
  },
  {
    quoi: 'une tâche voisine nommée comme CONTEXTE, hors de ses paths, et déclarée comme telle',
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      entetes: entete(['// défaut trouvé par GOV-101']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-101', nature: 'contexte', raison: RAISON }],
    },
    exemptions: ['contexte'],
  },
  {
    quoi: 'un identifiant qui RÉSOUT et dont le fichier est dans ses paths',
    sources: { taches: [T_RESOLUE], entetes: entete(['// porte.ts (GOV-100)']) },
  },
  {
    quoi: 'un identifiant d’EXIGENCE n’est pas un identifiant de tâche (REQ-GOV-003, REQ-DM-003)',
    sources: { taches: [{ ...T_RESOLUE, id: 'DM-01' }], entetes: entete(['// porte REQ-GOV-003 et REQ-DM-003']) },
  },
  {
    quoi: 'un identifiant de GATE n’est pas un identifiant de tâche (G-SEC-ROLES, GATE-JUR-PURGE)',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'SEC-08' },
        { ...T_RESOLUE, id: 'JUR-T02' },
      ],
      entetes: entete(['// G-SEC-ROLES, GATE-JUR-PURGE']),
    },
  },
  {
    quoi: 'un identifiant SUFFIXÉ n’est pas son préfixe (DM-03-A n’est pas une mention de DM-03)',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'DM-03-A' },
        { ...T_RESOLUE, id: 'DM-01' },
      ],
      gates: [{ id: 'partners:grille:check', script: 'scripts/gates/porte.ts', tache: 'DM-03-A' }],
    },
  },
  {
    quoi: 'un suffixe INCONNU ne fait pas une mention de son préfixe (DM-03-Z, sans aucune tâche DM-03-…)',
    sources: { taches: [T_RESOLUE, { ...T_RESOLUE, id: 'DM-01' }], entetes: entete(['// DM-03-Z']) },
  },
  {
    quoi: 'une dette déclarée et toujours mesurée, dont la prose nomme son porteur : une seule exemption',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [{ ...PII, verifie: 'porté par GOV-100' }],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: RAISON }],
    },
    exemptions: ['dette_gate'],
  },
];

/** `null` si le témoin rougit sur SA famille en nommant ce qu'il annonce ; sinon, pourquoi. */
export function jugerTemoin(t: Temoin): string | null {
  const { fautes } = analyser(completer(t.sources));
  const siennes = fautes.filter((f) => f.famille === t.famille);
  if (siennes.length === 0) {
    const autres = [...new Set(fautes.map((f) => f.famille))];
    return (
      `❌ Le témoin « ${t.quoi} » n'a PAS fait rougir « ${t.famille} »` +
      (autres.length > 0 ? ` — il a rougi par ${autres.join(', ')}, qui n'est pas sa famille.` : '.')
    );
  }
  const muets = (t.nomme ?? []).filter((n) => !siennes.some((f) => f.message.includes(n)));
  if (muets.length > 0) return `❌ Le témoin « ${t.quoi} » rougit sans NOMMER : ${muets.join(', ')}.`;
  return null;
}

/** `null` si le contre-témoin reste vert ET rend exactement ses exemptions ; sinon, pourquoi. */
export function jugerContreTemoin(c: ContreTemoin): string | null {
  const { fautes, exemptions } = analyser(completer(c.sources));
  if (fautes.length > 0) {
    return (
      `❌ Faux positif : « ${c.quoi} » a fait rougir « ${fautes[0]?.famille} ».\n   ${fautes[0]?.message}\n` +
      `   Cette attribution est LÉGITIME — la règle est trop large, et une garde trop large est retirée dans la semaine.`
    );
  }
  const rendues = exemptions.map((e) => e.nature).sort();
  const annoncees = [...(c.exemptions ?? [])].sort();
  if (rendues.join(',') !== annoncees.join(',')) {
    return (
      `❌ « ${c.quoi} » rend les exemptions [${rendues.join(', ')}] au lieu de [${annoncees.join(', ')}]. ` +
      `Une exemption ajoutée ou tue change ce que la bannière verte affirme.`
    );
  }
  return null;
}

export function prouver(): { code: number; lignes: string[] } {
  for (const t of TEMOINS) {
    const r = jugerTemoin(t);
    if (r) return { code: 1, lignes: [r, '   Le témoin est faux, ou la règle ne couvre pas ce qu’elle prétend couvrir.'] };
  }
  for (const c of CONTRE_TEMOINS) {
    const r = jugerContreTemoin(c);
    if (r) return { code: 1, lignes: [r] };
  }
  const sansTemoin = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
  if (sansTemoin.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${sansTemoin.length} famille(s) sans témoin qui rougit : ${sansTemoin.join(', ')}.`,
        '   Une règle jamais vue rougir ne garde rien (RM-02). Ajoute-lui un témoin dans TEMOINS.',
      ],
    };
  }
  const sansContre = NATURES.filter((n) => !CONTRE_TEMOINS.some((c) => (c.exemptions ?? []).includes(n)));
  if (sansContre.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${sansContre.length} nature(s) d'exemption qu'aucun contre-témoin ne rend : ${sansContre.join(', ')}.`,
        '   Une exemption que personne n’a vue s’ouvrir peut s’élargir sans que rien ne le dise.',
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ gov:attributions — les ${FAMILLES.length} familles rougissent chacune sur ses témoins (${TEMOINS.length}), ` +
        `les ${CONTRE_TEMOINS.length} contre-témoins restent verts et rendent exactement leurs exemptions ` +
        `(les ${NATURES.length} natures sont chacune rendues).`,
      ...FAMILLES.map((f) => `   • ${f}`),
    ],
  };
}

// ── la sortie verte : chaque exemption COMPTÉE et NOMMÉE ──────────────────────

export function rendreVert(exemptions: Exemption[]): string[] {
  const lignes = [
    `✅ gov:attributions — aucune attribution rompue (${FAMILLES.length} familles). ` +
      `${exemptions.length} exemption(s), chacune comptée et nommée ci-dessous : une exemption tue serait un vert qui ment.`,
  ];
  for (const nature of NATURES) {
    const lot = exemptions.filter((e) => e.nature === nature);
    if (lot.length === 0) continue;
    lignes.push(`   ${nature.startsWith('dette') ? '⛔' : '·'} ${nature} (${lot.length}) — ${SENS[nature]}`);
    if (nature !== 'indeterminee') {
      lot.forEach((e) => lignes.push(`      ${e.tache} — ${e.site} : ${e.motif}`));
      continue;
    }
    // Les indéterminées se regroupent par tâche : chaque SITE reste nommé, la tâche ne se répète pas.
    const parTache = new Map<string, string[]>();
    for (const e of lot) {
      const cle = `${e.tache} (${e.motif})`;
      parTache.set(cle, [...(parTache.get(cle) ?? []), e.site]);
    }
    parTache.forEach((sites, cle) => lignes.push(`      ${cle} : ${sites.join(' ; ')}`));
  }
  return lignes;
}

// ── point d'entrée ────────────────────────────────────────────────────────────
//
// UNE SEULE SORTIE, ET ELLE EST TERMINALE. Le verdict est CALCULÉ, puis rendu par un unique appel
// terminal, tout en bas : il n'existe aucun chemin par lequel la garde imprime un refus et continue.
//
// ⚠️ Cette prose ne cite pas l'appel de sortie : le compteur de `refus-de-rendre-et-de-publier.spec.ts`
// est TEXTUEL, et *un commentaire qui cite le motif qu'une garde compte devient une occurrence de ce motif.*
export function principal(): { code: number; lignes: string[] } {
  if (process.argv.includes('--prove')) return prouver();

  // Le périmètre D'ABORD : lancée hors de la racine, c'est son refus nommé qui parle, pas une trace de pile.
  const suivis = fichiersSuivisOuRefus('gov:attributions');
  let sources: Sources;
  try {
    sources = chargerSources(suivis);
  } catch (e) {
    if (!(e instanceof SourceIllisible)) throw e;
    return {
      code: 1,
      lignes: [
        `❌ gov:attributions — [source_illisible] ${e.message}`,
        '   La garde REFUSE plutôt que de juger une source qu’elle n’a pas pu lire.',
      ],
    };
  }

  const { fautes, exemptions } = analyser(sources);
  if (fautes.length === 0) return { code: 0, lignes: rendreVert(exemptions) };
  const lignes = [`❌ gov:attributions — ${fautes.length} attribution(s) rompue(s) (REQ-GOV-021, REQ-GOV-003) :\n`];
  fautes.forEach((f) => lignes.push(`   [${f.famille}] ${f.message}`));
  lignes.push(`\nUne attribution fausse envoie le lecteur suivant chercher dans un fichier que personne n'a touché.`);
  return { code: 1, lignes };
}

if (process.argv[1] !== undefined && /gov-attributions[.](ts|js)$/.test(process.argv[1])) {
  const verdict = principal();
  (verdict.code === 0 ? console.log : console.error)(verdict.lignes.join('\n'));
  process.exit(verdict.code);
}
