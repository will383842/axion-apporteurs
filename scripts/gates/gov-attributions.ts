/**
 * gov-attributions.ts — LES ATTRIBUTIONS SE CONFRONTENT À LEURS SOURCES (GOV-037, REQ-GOV-021, REQ-GOV-003).
 *
 * USAGE   : pnpm gov:attributions          (sort en échec si une attribution n'est pas confrontée)
 *           pnpm gov:attributions --prove  (un témoin ET un contre-témoin par famille)
 *
 * POURQUOI : ce dépôt dérive et vérifie ses NOMBRES — `gov:tasks --verifie-rendu`,
 * `gov:requirements --verifie-rendu`, `lot:paths --check`, `gov:gates-derivees`. Il ne confronte
 * AUCUNE de ses ATTRIBUTIONS. Or une attribution s'écrit toujours DEUX FOIS, dans deux fichiers :
 * `requirements.json[].taches` et `tasks.json[].reqs` ; `gates.json[].tache` et les `paths` de la
 * tâche ; `tasks.json[].owner` et `agents.json` ; `tasks.json[].lot` et l'entrée de `docs/journal/`.
 * Rien ne comparait ces paires.
 *
 * CE QUE ÇA COÛTE : une attribution fausse envoie le lecteur suivant chercher dans un fichier que
 * personne n'a touché. Et `gov:identifiants` ne peut pas la voir — elle juge la FORME d'un
 * identifiant, jamais sa RÉSOLUTION.
 *
 * ⚠️ CE QUE CETTE GARDE NE VOIT PAS, écrit plutôt que supposé (voir aussi le bloc « limites » plus bas).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

/*
 * LIMITES CONNUES, ET ELLES BORNENT HONNÊTEMENT CE QUE CETTE GARDE FERME :
 *   — un identifiant écrit au-delà de la 20e ligne d'un fichier (le périmètre que l'acceptance fixe) ;
 *   — une attribution qui vit dans une REVUE plutôt que dans un fichier du dépôt : l'occurrence
 *     « la revue s'appuie sur GOV-033 » est hors de portée de toute garde de dépôt ;
 *   — la concordance `tests{}` <-> `paths`, qui appartient à `scripts/lot/composer.ts` ;
 *   — qu'un `it()` parlant d'IBAN soit bien étiqueté par l'exigence qu'il teste : « ce titre teste
 *     un IBAN » contre « une exigence dit mono-tenant » n'est mécanisable par aucune garde. Y verser
 *     cette famille rendrait la tâche INFERMABLE, qui est précisément le défaut qu'elle décrit.
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
};
export type Exigence = { id: string; taches?: string[] };
export type Gate = { id: string; script?: string; tache?: string; [champ: string]: unknown };
export type Poste = { code: string };
export type Entete = { fichier: string; lignes: string[] };

/**
 * Une mention d'identifiant DÉCLARÉE : elle est vue, elle est nommée, et elle ne rougit pas.
 *
 * 🔑 C'EST LA RÉPONSE À LA DISTINCTION QUE L'ACCEPTANCE POSE. Un identifiant bien formé qui ne
 * résout pas est de deux natures indiscernables : le relecteur CITE une tâche qu'il croit exister,
 * ou il RÉSERVE le prochain identifiant libre. Les deux lectures sont également plausibles et rien
 * dans le dépôt ne les distingue — d'où le choix : **on le REFUSE par défaut, et on exige une
 * forme explicite de déclaration.** L'auteur dit laquelle des deux il fait, et pourquoi. Une garde
 * qui devinerait à sa place se tromperait la moitié du temps.
 */
export type Citation = {
  ou: string;
  id: string;
  nature: 'citation' | 'reservation' | 'dette';
  raison: string;
};

/** Une non-réciprocité RÉELLE, connue, que cette tâche ne peut pas réparer (ses sources sont en écriture réservée). */
export type DetteGate = { gate: string; tache: string; script: string; raison: string };

export type Sources = {
  taches: Tache[];
  exigences: Exigence[];
  gates: Gate[];
  postes: Poste[];
  journal: string;
  entetes: Entete[];
  citations: Citation[];
  dettesGate: DetteGate[];
  dettesLot: string[];
  existe: (chemin: string) => boolean;
};

export type Faute = { famille: string; message: string };

/**
 * Toutes les familles que la garde prétend couvrir. `--prove` les exige TOUTES, et
 * `attributions-resolvent.spec.ts` exige que chacune ait un témoin nommé chez lui.
 * Ajouter une famille sans témoin fait rougir les deux.
 */
export const FAMILLES = [
  'req_tache_non_reciproque',
  'gate_tache_inconnue',
  'gate_non_reciproque',
  'owner_hors_registre',
  'lot_non_atteste',
  'mention_non_resolue',
  'citation_perimee',
  'dette_perimee',
] as const;

// ── outillage : rien de tapé qui puisse se dériver (RM-01) ────────────────────

/** `scripts/x.ts#un-job` et `spec.ts#le nom du it` : seule la partie fichier est un chemin. */
function sansAncre(valeur: string): string {
  const i = valeur.indexOf('#');
  return i === -1 ? valeur : valeur.slice(0, i);
}

/**
 * Un chemin GABARIT : `<dossier>/<l'id de la tâche elle-même>`, écrit par l'amorçage quand les
 * chemins réels ne sont pas encore connus (`docs/gouvernance/GOV-003`, `scripts/gates/QA-T00`,
 * `src/domaine/DM-02`).
 *
 * 🔑 IL DIT « ON NE SAIT PAS ENCORE », PAS « CE N'EST PAS À MOI ». 186 des 209 tâches en portent
 * un — mesuré sur cet arbre. Une garde qui les condamnerait serait rouge de naissance, donc
 * désarmée dans la semaine (RM-02). Leur réciprocité est INDÉTERMINÉE ; on ne la déclare ni vraie
 * ni fausse, et c'est dit plutôt que tu.
 */
function estGabarit(t: Tache, chemin: string): boolean {
  return chemin.slice(chemin.lastIndexOf('/') + 1) === t.id;
}

/** Les `paths` de la tâche sont RENSEIGNÉS : aucun gabarit, et la liste n'est pas vide. */
function pathsResolus(t: Tache): boolean {
  const p = t.paths ?? [];
  return p.length > 0 && !p.some((x) => estGabarit(t, x));
}

/** La surface qu'une tâche DÉCLARE toucher : ses `paths` et les fichiers de son `tests{}`. */
function surface(t: Tache): string[] {
  return [...(t.paths ?? []), ...Object.values(t.tests ?? {}).flat().map(sansAncre)];
}

/** Un chemin est couvert par une entrée exacte, ou par un préfixe de RÉPERTOIRE déclaré. */
function couvre(t: Tache, chemin: string): boolean {
  return surface(t).some((x) => x === chemin || (x.endsWith('/') && chemin.startsWith(x)));
}

/**
 * Le motif d'un identifiant de tâche, **dérivé des identifiants réels** (RM-01) : on remplace
 * chaque suite de chiffres par `[0-9]+` dans les ids que le backlog porte, et on assemble
 * l'alternance. Aucune liste de préfixes n'est tapée ici — elle divergerait du backlog au premier
 * `EXT-T…` ajouté.
 *
 * Trois précautions, chacune mesurée sur cet arbre :
 *   — LE PLUS LONG D'ABORD, sinon `DM-[0-9]+` mord dans `DM-03-A` et invente une faute (mesuré :
 *     4 faux positifs, dont le champ `tache` de `partners:grille:check`, qui est correct) ;
 *   — rien avant qui prolonge l'identifiant : sans cela `REQ-DM-003` rend `DM-003`,
 *     `G-SEC-ROLES` rend `SEC-ROLES`, `GATE-JUR-PURGE` rend `JUR-PURGE` — 44 faux positifs mesurés ;
 *   — rien après non plus, `-` compris : `DM-03-A` n'est pas une mention de `DM-03`.
 */
export function motifIdentifiant(taches: Tache[]): RegExp {
  const formes = [...new Set(taches.map((t) => t.id.replace(/[0-9]+/g, '[0-9]+')))].sort(
    (a, b) => b.length - a.length
  );
  return new RegExp('(?<![A-Za-z0-9-])(?:' + formes.join('|') + ')(?![A-Za-z0-9]|-[A-Za-z0-9])', 'g');
}

/** Les entrées du journal, indexées par numéro de PR. Le TITRE fait partie de l'entrée. */
export function entreesDeJournal(journal: string): Map<string, string> {
  const par = new Map<string, string[]>();
  let courant: string | null = null;
  for (const ligne of journal.split('\n')) {
    const m = /^##\s+PR\s+#(\d+)/.exec(ligne);
    if (m) {
      courant = m[1] as string;
      par.set(courant, [ligne]);
      continue;
    }
    if (courant) (par.get(courant) as string[]).push(ligne);
  }
  return new Map([...par].map(([k, v]) => [k, v.join('\n')]));
}

// ── l'analyse ─────────────────────────────────────────────────────────────────

export function analyser(s: Sources): Faute[] {
  const fautes: Faute[] = [];
  const dire = (famille: string, message: string) => fautes.push({ famille, message });

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
  // ⚠️ CE SENS-LÀ SEULEMENT, ET C'EST MESURÉ. La réciproque « une tâche qui déclare un script de
  // garde en est la porteuse » est FAUSSE neuf fois sur cet arbre, toutes légitimes : une garde est
  // CRÉÉE par une tâche puis ÉTENDUE par d'autres (`GOV-025` et `GOV-028` étendent
  // `gov-identifiants.ts`, que le registre attribue à `GOV-003`, qui l'a écrite). L'imposer
  // condamnerait neuf attributions saines. Le registre nomme le CRÉATEUR ; les `paths` d'une tâche
  // nomment ce qu'elle TOUCHE. Ce ne sont pas la même relation, et un fichier a le droit de nommer
  // une tâche voisine sans être à elle.
  const dettesGateVues = new Set<string>();
  for (const g of s.gates) {
    if (!g.tache) continue;
    const t = parId.get(g.tache);
    if (!t) {
      dire(
        'gate_tache_inconnue',
        `docs/gates.json — la gate « ${g.id} » est attribuée à « ${g.tache} », qui n'est pas une tâche du backlog.`
      );
      continue;
    }
    if (!g.script) continue;
    const chemin = sansAncre(g.script);
    if (!pathsResolus(t)) continue; // paths gabarit : indéterminé, pas faux
    if (couvre(t, chemin)) continue;

    const cle = `${g.id}|${g.tache}|${chemin}`;
    const dette = s.dettesGate.find((d) => `${d.gate}|${d.tache}|${d.script}` === cle);
    if (dette) {
      dettesGateVues.add(cle);
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
    if (dettesGateVues.has(`${d.gate}|${d.tache}|${d.script}`)) continue;
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
    if (!t.owner) continue; // pas d'owner : une absence, pas une attribution fausse
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
  // exclut : elle ne survit ni à un `clone` ni à un changement de machine. La seule seconde source
  // qui reste au dépôt est `docs/journal/`, où chaque clôture nomme son lot sous `## PR #<n>`.
  const entrees = entreesDeJournal(s.journal);
  const dettesLotVues = new Set<string>();
  for (const t of s.taches) {
    if (!t.lot || t.pr === null || t.pr === undefined) continue;
    const entree = entrees.get(String(t.pr));
    if (entree !== undefined && entree.includes(t.lot)) continue;
    if (s.dettesLot.includes(t.id)) {
      dettesLotVues.add(t.id);
      continue;
    }
    dire(
      'lot_non_atteste',
      entree === undefined
        ? `docs/tasks.json — ${t.id} porte lot « ${t.lot} » et pr ${t.pr}, et docs/journal/ n'a aucune entrée « ## PR #${t.pr} ». ` +
            `Rien n'atteste que cette tâche appartenait au lot : lot:cloture écrit le lot sans le vérifier.`
        : `docs/tasks.json — ${t.id} porte lot « ${t.lot} » et pr ${t.pr}, et l'entrée « ## PR #${t.pr} » du journal ne nomme pas « ${t.lot} ». ` +
            `Une tâche étrangère au lot, présente dans le rendu, passe fusionnee avec ce lot écrit dans un fichier versionné.`
    );
  }
  for (const id of s.dettesLot) {
    if (dettesLotVues.has(id)) continue;
    dire(
      'dette_perimee',
      `DETTE_LOT_SANS_ENTREE_DE_JOURNAL déclare « ${id} », dont l'attribution de lot est désormais attestée ` +
        `(ou dont la tâche a perdu sa PR). Retire l'entrée du registre.`
    );
  }

  // ── (5) tout identifiant de tâche NOMMÉ doit RÉSOUDRE ───────────────────────
  const motif = motifIdentifiant(s.taches);
  const citationsVues = new Set<string>();

  const examiner = (ou: string, texte: string, situer: () => string) => {
    for (const m of texte.match(motif) ?? []) {
      if (parId.has(m)) continue;
      if (s.citations.some((c) => c.ou === ou && c.id === m)) {
        citationsVues.add(`${ou}|${m}`);
        continue;
      }
      dire(
        'mention_non_resolue',
        `${situer()} — « ${m} » a la forme d'un identifiant de tâche et ne RÉSOUT PAS. ` +
          `gov:identifiants juge la forme, jamais la résolution : cette mention envoie le lecteur suivant nulle part. ` +
          `Corrige-la, ou DÉCLARE-la dans CITATIONS_DECLAREES en disant si tu CITES ou si tu RÉSERVES.`
      );
    }
  };

  for (const e of s.entetes) {
    e.lignes.forEach((ligne, i) => examiner(e.fichier, ligne, () => `${e.fichier}:${i + 1}`));
  }
  // ⚠️ TOUTE chaîne d'une entrée, PAS le seul champ `tache`. La lentille schema a mesuré que sur
  // `gov:plan-state` le champ `tache` n'a JAMAIS bougé pendant que la valse GOV-029 -> GOV-032 ->
  // GOV-035 se jouait dans la prose du champ `verifie`. Un contrôle limité au champ `tache` aurait
  // rendu VERT sur deux des cinq occurrences qui motivent cette tâche.
  for (const g of s.gates) {
    for (const [champ, valeur] of Object.entries(g)) {
      if (typeof valeur !== 'string') continue;
      const ou = `docs/gates.json:${g.id}.${champ}`;
      examiner(ou, valeur, () => ou);
    }
  }

  // 🔑 LA GARDE CONFRONTE À L'ÉTAT COURANT DU BACKLOG, ELLE NE VÉRIFIE PAS UNE FOIS.
  // Une attribution ne se corrompt pas seulement quand l'auteur se trompe : elle se corrompt quand
  // le BACKLOG bouge. Le registre citait GOV-032 pour la lacune PLAN-STATE, et c'était DÉFENDABLE
  // au moment où la phrase a été écrite — aucune tâche ne portait alors cette lacune. Elle est
  // devenue fausse quand GOV-035 a été créée. Une garde qui ne s'exécuterait qu'à l'écriture ne
  // verrait jamais cette moitié-là, et un registre de citations vieillit exactement pareil.
  for (const c of s.citations) {
    if (citationsVues.has(`${c.ou}|${c.id}`)) continue;
    dire(
      'citation_perimee',
      parId.has(c.id)
        ? `CITATIONS_DECLAREES — « ${c.id} » est déclaré en ${c.nature} pour ${c.ou}, et il RÉSOUT maintenant : ` +
            `le backlog a bougé sous la déclaration. Retire l'entrée, et vérifie que la phrase dit encore ce qu'elle voulait dire.`
        : `CITATIONS_DECLAREES — « ${c.id} » est déclaré pour ${c.ou}, qui ne le porte plus. Retire l'entrée.`
    );
  }

  return fautes;
}

// ── les registres : ce qui est DÉCLARÉ est vu, nommé, et ne dort pas ──────────
//
// Chacun est une ÉGALITÉ D'ENSEMBLES, pas un plafond : une faute nouvelle rougit en se nommant,
// une faute réparée rougit en demandant qu'on retire son entrée. Aucun nombre n'est tapé — le
// compte se dérive de la longueur de ces listes.

/**
 * LES TROIS NON-RÉCIPROCITÉS RÉELLES, MESURÉES SUR L'ARBRE OÙ CETTE GARDE EST NÉE, et que GOV-037
 * ne peut pas réparer : `docs/gates.json` et `docs/tasks.json` sont en écriture réservée
 * (`docs/PRESEANCE.md`), et `lot:cloture` est le seul écrivain des champs de suivi.
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
];

/**
 * Les quatre tâches dont la PR précède l'ouverture de `docs/journal/`, qui commence à la PR #26.
 * Leur attribution de lot n'a pas de seconde source, et ne peut plus en avoir : on ne réécrit pas
 * un journal après coup.
 */
export const DETTE_LOT_SANS_ENTREE_DE_JOURNAL: string[] = ['GOV-001', 'GOV-003', 'GOV-005', 'GOV-017a'];

/** Les mentions d'identifiants non résolus, chacune vue, nommée, et justifiée. */
export const CITATIONS_DECLAREES: Citation[] = [
  // ⚠️ LA NÉGATION QUI PROTÈGE. `gov:tasks` interdit les identifiants SCINDÉS et les NOMME pour
  // dire lesquels. Une garde qui ferait rougir cette phrase forcerait à la retirer — c'est-à-dire
  // à retirer la défense elle-même. Le dépôt a déjà payé ce piège une fois, sur `gov:lexique`.
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
    raison: 'idem ; les vraies tâches sont GOV-017a et GOV-017b.',
  },
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'EXT-T02',
    nature: 'citation',
    raison: 'idem ; EXT-T02a et EXT-T02b existent, EXT-T02 non.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'INT-T01',
    nature: 'citation',
    raison: 'le registre décrit ce que la garde interdit, dans les mêmes termes qu’elle.',
  },
  { ou: 'docs/gates.json:gov:tasks.verifie', id: 'GOV-017', nature: 'citation', raison: 'idem.' },
  { ou: 'docs/gates.json:gov:tasks.verifie', id: 'EXT-T02', nature: 'citation', raison: 'idem.' },
  // Les deux suivantes ne sont PAS des citations : ce sont des attributions FAUSSES, dans des
  // fichiers hors des paths de GOV-037. Déclarées pour qu'elles soient bruyantes plutôt que tues.
  {
    ou: 'scripts/lot/issues.ts',
    id: 'GOV-017',
    nature: 'dette',
    raison:
      'ligne 2, en-tête : « synchronise les issues GitHub avec docs/tasks.json (GOV-017) ». GOV-017 ' +
      'ne résout pas ; le fichier appartient à GOV-017a ou GOV-017b. Hors des paths de GOV-037.',
  },
  {
    ou: 'docs/gates.json:gate-nightly.verifie',
    id: 'INT-T08',
    nature: 'dette',
    raison:
      '« reconciliation quotidienne (INT-T08) » : la tâche est INT-T08-A ou INT-T08-P. ' +
      'docs/gates.json est en écriture réservée.',
  },
];

// ── chargement des sources réelles ────────────────────────────────────────────

/** Les VINGT premières lignes des fichiers de `scripts/` et `tests/` SUIVIS par git. */
function entetesSuivis(): Entete[] {
  return fichiersSuivisOuRefus('gov:attributions')
    .filter((f) => /^(scripts|tests)\//.test(f) && /[.](ts|tsx|js|mjs|cjs|sh)$/.test(f))
    .map((f) => ({ fichier: f, lignes: readFileSync(f, 'utf8').split('\n').slice(0, 20) }));
}

export function chargerSources(): Sources {
  const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
  const journal = readdirSync('docs/journal')
    .filter((f) => /[.]md$/.test(f) && f !== 'README.md')
    .map((f) => readFileSync(`docs/journal/${f}`, 'utf8'))
    .join('\n');
  return {
    taches: lire<{ taches: Tache[] }>('docs/tasks.json').taches,
    exigences: lire<{ exigences: Exigence[] }>('docs/requirements.json').exigences,
    gates: lire<{ gates: Gate[] }>('docs/gates.json').gates,
    postes: lire<{ postes: Poste[] }>('docs/agents.json').postes,
    journal,
    entetes: entetesSuivis(),
    citations: CITATIONS_DECLAREES,
    dettesGate: DETTE_GATE_NON_RECIPROQUE,
    dettesLot: DETTE_LOT_SANS_ENTREE_DE_JOURNAL,
    existe: existsSync,
  };
}

// ── la preuve : un témoin ET un contre-témoin par famille ─────────────────────
//
// INVARIANT, repris de `gov:publication` : `--prove` n'accepte AUCUN décompte. Il exige qu'un
// témoin fasse rougir CHAQUE famille de `FAMILLES`, et qu'aucun contre-témoin n'en fasse rougir
// aucune. Une famille ajoutée sans témoin fait échouer la preuve.

type Cas = { famille: string; quoi: string; sources: Partial<Sources> };

function completer(p: Partial<Sources>): Sources {
  return {
    taches: p.taches ?? [],
    exigences: p.exigences ?? [],
    gates: p.gates ?? [],
    postes: p.postes ?? [],
    journal: p.journal ?? '',
    entetes: p.entetes ?? [],
    citations: p.citations ?? [],
    dettesGate: p.dettesGate ?? [],
    dettesLot: p.dettesLot ?? [],
    existe: p.existe ?? (() => false),
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
const JOURNAL = '## PR #31 — feat(GOV-024): lot L-1-04\n\n**Fait.** Neuf tâches.\n';

export const TEMOINS: Cas[] = [
  {
    famille: 'req_tache_non_reciproque',
    quoi: 'une exigence cite une tâche qui ne la cite pas en retour',
    sources: { taches: [T_RESOLUE], exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-100'] }] },
  },
  {
    famille: 'gate_tache_inconnue',
    quoi: 'une gate est attribuée à une tâche qui n’existe pas',
    sources: { gates: [{ id: 'gov:zzz', script: 'scripts/gates/zzz.ts', tache: 'GOV-999' }] },
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une gate déclare un porteur que la tâche ne déclare pas en retour (le cas mesuré sur INT-T01a)',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'GOV-100' }],
    },
  },
  {
    famille: 'owner_hors_registre',
    quoi: 'un owner absent du registre des agents',
    sources: { taches: [{ ...T_RESOLUE, owner: 'A99' }], postes: [{ code: 'A01' }] },
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'une tâche étrangère au lot, marquée par lot:cloture, qu’aucune entrée de journal n’atteste',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 31 }], journal: JOURNAL },
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'un en-tête nomme un identifiant bien formé qui ne résout pas',
    sources: {
      taches: [T_RESOLUE],
      entetes: [{ fichier: 'scripts/gates/porte.ts', lignes: ['// arbitrage porté par GOV-033'] }],
    },
  },
  {
    famille: 'citation_perimee',
    quoi: 'une citation déclarée dont l’identifiant s’est mis à résoudre — le backlog a bougé',
    sources: {
      taches: [T_RESOLUE, { ...T_RESOLUE, id: 'GOV-033' }],
      entetes: [{ fichier: 'scripts/gates/porte.ts', lignes: ['// GOV-033'] }],
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'reservation', raison: 'réservé' }],
    },
  },
  {
    famille: 'dette_perimee',
    quoi: 'une dette de réciprocité déclarée mais réparée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['scripts/gates/detect-pii.ts'] }],
      gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'GOV-100' }],
      dettesGate: [
        { gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: 'témoin' },
      ],
    },
  },
];

/**
 * Ce que la garde ne doit PAS faire rougir. Une garde qui rougit sur tout ne dit rien de plus
 * qu'une garde qui ne rougit jamais — et celle-là serait retirée dans la semaine, avec la phrase
 * qu'elle protège.
 */
export const CONTRE_TEMOINS: { quoi: string; sources: Partial<Sources> }[] = [
  {
    quoi: 'une attribution exigence <-> tâche réciproque des deux côtés',
    sources: {
      taches: [{ ...T_RESOLUE, reqs: ['REQ-GOV-900'] }],
      exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-100'] }],
    },
  },
  {
    quoi: 'une gate déclarée dans les paths de sa tâche',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['scripts/gates/detect-pii.ts'] }],
      gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'GOV-100' }],
    },
  },
  {
    quoi: 'une gate déclarée dans le tests{} de sa tâche',
    sources: {
      taches: [
        { ...T_RESOLUE, tests: { 'REQ-GOV-900': ['tests/integration/index-partiel.spec.ts#un cas'] } },
      ],
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
    quoi: 'des paths GABARIT : l’attribution est INDÉTERMINÉE, pas fausse (186 tâches sur 209)',
    sources: {
      taches: [{ ...T_RESOLUE, id: 'GOV-003', paths: ['docs/gouvernance/GOV-003'] }],
      gates: [{ id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' }],
    },
  },
  {
    quoi: 'une tâche VOISINE déclare la même garde sans en être porteuse (9 cas légitimes mesurés)',
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
    quoi: 'LA NÉGATION QUI PROTÈGE : la garde qui NOMME la forme scindée qu’elle interdit',
    sources: {
      taches: [T_RESOLUE],
      entetes: [
        { fichier: 'scripts/gates/gov-tasks.ts', lignes: ['// aucun identifiant scindé (`GOV-017`)'] },
      ],
      citations: [
        { ou: 'scripts/gates/gov-tasks.ts', id: 'GOV-017', nature: 'citation', raison: 'la forme interdite, nommée' },
      ],
    },
  },
  {
    quoi: 'un identifiant d’EXIGENCE n’est pas un identifiant de tâche (REQ-GOV-003, REQ-DM-003)',
    sources: {
      taches: [{ ...T_RESOLUE, id: 'DM-01' }],
      entetes: [{ fichier: 'scripts/gates/porte.ts', lignes: ['// porte REQ-GOV-003 et REQ-DM-003'] }],
    },
  },
  {
    quoi: 'un identifiant de GATE n’est pas un identifiant de tâche (G-SEC-ROLES, GATE-JUR-PURGE)',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'SEC-08' },
        { ...T_RESOLUE, id: 'JUR-T02' },
      ],
      entetes: [{ fichier: 'scripts/gates/porte.ts', lignes: ['// G-SEC-ROLES, GATE-JUR-PURGE'] }],
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
    quoi: 'une dette déclarée et toujours mesurée : bruyante, pas bloquante',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'GOV-100' }],
      dettesGate: [
        { gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: 'déclarée' },
      ],
    },
  },
];

function prouver(): { code: number; lignes: string[] } {
  const lignes: string[] = [];
  const rouges = new Set<string>();
  for (const t of TEMOINS) {
    const f = analyser(completer(t.sources));
    if (!f.some((x) => x.famille === t.famille)) {
      lignes.push(
        `❌ Le témoin « ${t.quoi} » n'a PAS fait rougir la famille « ${t.famille} ». ` +
          `Le témoin est faux, ou la règle ne couvre pas ce qu'elle prétend couvrir.`
      );
      return { code: 1, lignes };
    }
    f.forEach((x) => rouges.add(x.famille));
  }
  for (const c of CONTRE_TEMOINS) {
    const f = analyser(completer(c.sources));
    if (f.length > 0) {
      lignes.push(
        `❌ Faux positif : « ${c.quoi} » a fait rougir « ${f[0]?.famille} ».\n   ${f[0]?.message}\n` +
          `   Cette attribution est LÉGITIME — la règle est trop large, et une garde trop large est retirée dans la semaine.`
      );
      return { code: 1, lignes };
    }
  }
  const sansTemoin = FAMILLES.filter((f) => !rouges.has(f));
  if (sansTemoin.length > 0) {
    lignes.push(
      `❌ ${sansTemoin.length} famille(s) sans témoin qui rougit : ${sansTemoin.join(', ')}.\n` +
        `   Une règle jamais vue rougir ne garde rien (RM-02). Ajoute-lui un témoin dans TEMOINS.`
    );
    return { code: 1, lignes };
  }
  lignes.push(
    `✅ gov:attributions — les ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
      `et les ${CONTRE_TEMOINS.length} contre-témoins restent verts.`
  );
  FAMILLES.forEach((f) => lignes.push(`   • ${f}`));
  return { code: 0, lignes };
}

// ── point d'entrée ────────────────────────────────────────────────────────────
//
// UNE SEULE SORTIE, ET ELLE EST TERMINALE. Le verdict est CALCULÉ, puis rendu par un unique appel
// terminal, tout en bas : il n'existe aucun chemin par lequel la garde imprime un refus et
// continue. C'est le mutant que la lentille `mutation` a posé sur quatre refus de ce dépôt, et qui
// a survécu sur trois d'entre eux.
//
// ⚠️ ET LA PHRASE CI-DESSUS A COÛTÉ UNE SORTIE DE PLUS, MESURÉE. Cette prose citait l'appel entre
// accents graves pour se faire comprendre. Le compteur de `refus-de-rendre-et-de-publier.spec.ts`
// est TEXTUEL — il ne distingue ni le commentaire du code, ni la citation de l'appel — et a compté
// DEUX sorties non nulles là où le binaire n'en porte qu'une. *Un commentaire qui cite le motif
// qu'une garde compte devient une occurrence de ce motif.*
export function principal(): { code: number; lignes: string[] } {
  if (process.argv.includes('--prove')) return prouver();

  const fautes = analyser(chargerSources());
  const lignes: string[] = [];
  if (fautes.length === 0) {
    const dettes = DETTE_GATE_NON_RECIPROQUE.length + DETTE_LOT_SANS_ENTREE_DE_JOURNAL.length;
    lignes.push(
      `✅ gov:attributions — toute attribution est confrontée à sa source ` +
        `(${FAMILLES.length} familles ; ${dettes} déclarée(s) au registre, nommée(s) ci-dessous).`
    );
    // Une dette qu'on n'imprime pas cesse d'être une dette : elle devient un oubli.
    DETTE_GATE_NON_RECIPROQUE.forEach((d) =>
      lignes.push(`   ⛔ ${d.gate} -> ${d.tache} (${d.script}) : ${d.raison}`)
    );
    lignes.push(
      `   ⛔ lot sans entrée de journal (PR antérieures à l'ouverture de docs/journal/) : ` +
        `${DETTE_LOT_SANS_ENTREE_DE_JOURNAL.join(', ')}`
    );
    return { code: 0, lignes };
  }
  lignes.push(
    `❌ gov:attributions — ${fautes.length} attribution(s) non confrontée(s) (REQ-GOV-021, REQ-GOV-003) :\n`
  );
  fautes.forEach((f) => lignes.push(`   [${f.famille}] ${f.message}`));
  lignes.push(
    `\nUne attribution fausse envoie le lecteur suivant chercher dans un fichier que personne n'a touché.`
  );
  return { code: 1, lignes };
}

if (process.argv[1] !== undefined && /gov-attributions[.](ts|js)$/.test(process.argv[1])) {
  const verdict = principal();
  (verdict.code === 0 ? console.log : console.error)(verdict.lignes.join('\n'));
  process.exit(verdict.code);
}
