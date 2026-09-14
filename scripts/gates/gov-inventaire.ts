/**
 * gov-inventaire.ts — la garde de l'inventaire prouvé (GOV-020, REQ-GOV-026).
 *
 * USAGE : pnpm gov:inventaire            (rougit si un état ≥ « codé » n'a pas de preuve qui résout)
 *         pnpm gov:inventaire --prove    (un témoin par famille, chacun vu rougir ; contre-témoins verts)
 *         pnpm gov:inventaire --rapport  (le même calcul, rendu en JSON, pour les tests)
 *
 * LE TROU QU'ELLE BOUCHE. Un état d'avancement au-delà de « spécifié » est une affirmation sur le
 * monde : du code existe quelque part. Au 2026-09-03, `docs/tasks.json` porte douze tâches
 * `fusionnee` dont les `paths[]` sont des marque-place — `docs/gouvernance/GOV-004`, qui n'existe
 * sur aucun disque. L'affirmation ne pointait vers rien, et rien ne le disait.
 *
 * DEUX VOCABULAIRES POUR LA MÊME CHOSE, ET UN SEUL QU'ON ÉCRIT. REQ-GOV-026 fixe une légende de
 * sept états ; `scripts/lot/tasks.schema.json` porte déjà l'enum `statut` de neuf valeurs. Créer
 * une colonne « avancement » à côté de « statut » serait exactement la faute que RM-04 nomme :
 * deux copies divergent toujours. Le statut du backlog RESTE le seul vocabulaire écrit ; la
 * légende est une ÉCHELLE DE LECTURE, dérivée du statut par le barème ci-dessous, et l'ordre est
 * ce qui manquait — « ≥ codé » n'a de sens que sur une échelle.
 *
 * LE BARÈME DONNE LE PLANCHER, JAMAIS L'OPTIMISME. `en_cours` vaut `specifie` : une tâche
 * revendiquée il y a une minute n'a pas encore de code, et une garde qui exigerait sa preuve
 * rougirait sur l'acte même de prendre une tâche. C'est un contre-témoin, pas une tolérance.
 *
 * SON EXHAUSTIVITÉ EST VÉRIFIÉE, PAS SUPPOSÉE. Les neuf statuts ne sont pas retapés ici : ils sont
 * LUS dans `scripts/lot/tasks.schema.json` (RM-01), et un statut sans rang fait rougir la garde.
 * C'est l'équivalent d'un `switch … never` sur un enum qui vit dans un fichier de données.
 *
 * POURQUOI `docs/tasks.json` ET PAS `docs/PLAN-STATE.md`. REQ-GOV-026 cite les deux. `PLAN-STATE`
 * est DÉRIVÉ de `tasks.json` par `pnpm plan-state:build` : garder la source garde la vue, et
 * garder la vue laisserait passer la source.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { DEPOT_LOCAL, MOTIF_SHA, depotDeLaTache, type Attestation } from '../lot/attestation';

/**
 * `--taches <chemin>` : juger un AUTRE backlog que celui du dépôt (GOV-038). Même motif que le
 * `--out` des générateurs de vues : `docs/tasks.json` est RÉSERVÉ, un développeur ne l'écrit pas,
 * et sans cette option une mutation PROPOSÉE ne peut être ni appliquée ni mesurée — seulement
 * supposée bonne. Deux ruptures de traçabilité ont été trouvées ainsi, avant d'être écrites.
 */
const iTaches = process.argv.indexOf('--taches');
const CHEMIN_TACHES = iTaches >= 0 ? (process.argv[iTaches + 1] ?? 'docs/tasks.json') : 'docs/tasks.json';
const CHEMIN_SCHEMA = 'scripts/lot/tasks.schema.json';
const CHEMIN_PATHS = 'docs/paths-proposes.json';
const CHEMIN_INVENTAIRE = 'docs/INVENTAIRE-CHANTIERS.md';
const CHEMIN_EXIGENCES = 'docs/requirements.json';
const EXIGENCE = 'REQ-GOV-026';

// ── la légende de REQ-GOV-026, ordonnée ──────────────────────────────────────
/** Sans accent, comme tous les enums du dépôt (`docs/CONVENTIONS.md` §2). L'ordre EST le rang. */
const LEGENDE = ['specifie', 'code', 'teste', 'revu', 'fusionne', 'deploye', 'verifie_en_prod'] as const;
type Avancement = (typeof LEGENDE)[number];

const rang = (a: Avancement): number => LEGENDE.indexOf(a) + 1;
/** Le seuil de REQ-GOV-026 : « tout état ≥ codé porte une preuve ». */
const SEUIL_PREUVE = rang('code');

/**
 * Statut du backlog → plancher garanti sur la légende. `null` = le statut n'affirme même pas
 * « spécifié » : une tâche `proposee` est une dette proposée, pas une entrée du registre arbitré.
 */
const PLANCHER: Record<string, Avancement | null> = {
  proposee: null,
  a_faire: 'specifie',
  en_cours: 'specifie',
  bloquee: 'specifie',
  attente_externe: 'specifie',
  en_revue: 'teste',
  fusionnee: 'fusionne',
  deployee: 'deploye',
  verifiee: 'verifie_en_prod',
};

// ── types ────────────────────────────────────────────────────────────────────
type Tache = { id: string; statut: string; paths: string[]; repo: string; attestation?: Attestation | null };
type LigneChantier = {
  etiquette: string;
  referentResolu: boolean;
  etat: string | null;
  preuves: string[];
  ligne: number;
};
type Etat = {
  taches: Tache[];
  cheminsProposes: Record<string, string[]>;
  statutsDuSchema: string[];
  chantiers: LigneChantier[];
  etiquettesDeLaReq: string[];
  shasParTache: Record<string, string[]>;
};
type Faute = { famille: string; message: string };

const FAMILLES = [
  'statut_hors_bareme',
  'tache_preuve_manquante',
  'inventaire_etiquette_hors_req',
  'inventaire_etat_hors_legende',
  'inventaire_etat_sans_referent',
  'inventaire_preuve_manquante',
  'inventaire_preuve_qui_ne_resout_pas',
];

// ── ce qui compte comme preuve : un chemin qui existe, un SHA qui résout ─────
const cheminExiste = (c: string): boolean => c.length > 0 && existsSync(c);

const FORME_SHA = /^[0-9a-f]{7,40}$/i;
const shasResolus = new Map<string, boolean>();
function shaResout(jeton: string): boolean {
  if (!FORME_SHA.test(jeton)) return false;
  const memo = shasResolus.get(jeton);
  if (memo !== undefined) return memo;
  let ok = false;
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${jeton}^{commit}`], { stdio: 'pipe' });
    ok = true;
  } catch {
    ok = false;
  }
  shasResolus.set(jeton, ok);
  return ok;
}

/**
 * Les SHA d'une tâche sont DÉRIVÉS, jamais recopiés : c'est la PORTÉE conventionnelle du commit
 * (`feat(GOV-004): …`) qui nomme la tâche. Un SHA tapé à la main dans `tasks.json` serait une
 * copie de plus à laisser diverger (RM-01).
 *
 * Si l'historique est absent (clone superficiel de la CI), la table est vide : la preuve par
 * chemin porte alors seule. Ce n'est pas un échec ouvert — un état ≥ « codé » sans chemin présent
 * rougit quand même.
 */
function shasParPortee(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let journal = '';
  try {
    journal = execFileSync('git', ['log', '--format=%H%x09%s'], { encoding: 'utf8' });
  } catch {
    return out;
  }
  for (const ligne of journal.split('\n')) {
    const [sha, sujet] = ligne.split('\t');
    if (!sha || !sujet) continue;
    const m = sujet.match(/^[a-z]+\(([^)]*)\)/);
    if (!m || !m[1]) continue;
    for (const portee of m[1].split(',')) {
      const cle = portee.trim();
      if (!cle) continue;
      (out[cle] ??= []).push(sha.slice(0, 8));
    }
  }
  return out;
}

/**
 * LA PREUVE D'UNE LIVRAISON FAITE AILLEURS (GOV-038). Les deux preuves ci-dessus supposent toutes
 * deux que le code est ICI : un chemin sur ce disque, un commit dans cet historique. Quatorze
 * tâches de ce backlog vivent dans un autre dépôt, et `INT-T01b` est la première à avoir été
 * livrée — son commit de fusion n'est dans aucun `git log` de ce clone, et son chemin
 * (`axionia/INT-T01b`) est un marque-place qui n'existe sur aucun disque. Sans cette troisième
 * preuve, la passer `fusionnee` ferait rougir `tache_preuve_manquante` sur une livraison bien
 * réelle, et la garde apprendrait à se faire contourner.
 *
 * ELLE EST JUGÉE SUR SA FORME, PAS RÉSOLUE. Résoudre demanderait d'interroger la forge, ce qui
 * rendrait la garde non déterministe (mesuré : `pnpm test` 1, puis 0, puis 0 sur le même arbre).
 * C'est un affaiblissement ASSUMÉ et nommé : un SHA de 40 hexadécimaux qui ne désignerait aucun
 * commit passerait ici. Le contrôle qui le résout existe, et il est hors de la suite —
 * `pnpm gov:attestation --en-ligne`.
 */
function preuvesDeLaTache(t: Tache, e: Etat): string[] {
  const chemins = [...new Set([...t.paths, ...(e.cheminsProposes[t.id] ?? [])])].filter(cheminExiste);
  const shas = (e.shasParTache[t.id] ?? []).filter(shaResout);
  const attestations =
    t.repo !== DEPOT_LOCAL && t.attestation && MOTIF_SHA.test(t.attestation.sha)
      ? [`attestation:${depotDeLaTache(t) ?? t.repo}#${t.attestation.pr}@${t.attestation.sha.slice(0, 8)}`]
      : [];
  return [...chemins.map((c) => `chemin:${c}`), ...shas.map((s) => `sha:${s}`), ...attestations];
}

// ── lecture de l'inventaire ──────────────────────────────────────────────────
const nu = (cellule: string): string => cellule.replace(/[«»`*]/g, '').trim();
const ETIQUETTE = /^C\d{1,2}$/;
const VIDE = /^(—|-|)$/;

function lireInventaire(texte: string): LigneChantier[] {
  const out: LigneChantier[] = [];
  texte.split('\n').forEach((ligne, i) => {
    if (!ligne.trimStart().startsWith('|')) return;
    const cellules = ligne.split('|').slice(1, -1).map((c) => c.trim());
    if (cellules.length < 4) return;
    const etiquette = nu(cellules[0] ?? '');
    if (!ETIQUETTE.test(etiquette)) return;

    const referent = nu(cellules[1] ?? '').toLowerCase();
    const brutEtat = nu(cellules[2] ?? '');
    const brutPreuve = nu(cellules[3] ?? '');

    out.push({
      etiquette,
      // « oui » et rien d'autre vaut « résolu ». Une cellule illisible est traitée comme NON
      // résolue : le sens qui échoue est celui qui REFUSE d'écrire un état, jamais celui qui
      // en laisse passer un (RM-05).
      referentResolu: referent.startsWith('oui'),
      etat: VIDE.test(brutEtat) ? null : brutEtat,
      preuves: VIDE.test(brutPreuve) ? [] : brutPreuve.split(/[\s,;]+/).map(nu).filter(Boolean),
      ligne: i + 1,
    });
  });
  return out;
}

/**
 * Les huit étiquettes ne sont pas retapées : elles sont EXTRAITES du texte de REQ-GOV-026 dans
 * `docs/requirements.json` (RM-01). Si l'exigence est reformulée, l'inventaire doit suivre.
 */
function etiquettesDeLaReq(exigences: unknown): string[] {
  const liste = (exigences as { exigences?: { id: string; texte: string }[]; requirements?: { id: string; texte: string }[] });
  const toutes = liste.exigences ?? liste.requirements ?? [];
  const req = toutes.find((r) => r.id === EXIGENCE);
  if (!req) return [];
  return [...new Set(req.texte.match(/\bC\d{1,2}\b/g) ?? [])];
}

// ── les contrôles ────────────────────────────────────────────────────────────
function controler(e: Etat): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  // 1. La légende couvre-t-elle TOUT l'enum du schéma ? (l'équivalent d'un `switch … never`)
  for (const s of e.statutsDuSchema) {
    if (!(s in PLANCHER)) {
      ajouter(
        'statut_hors_bareme',
        `Le statut « ${s} » est déclaré par ${CHEMIN_SCHEMA} mais n'a pas de rang dans le barème ` +
          `de ${EXIGENCE}. Décide s'il vaut « codé » ou non : sans rang, la garde ne sait pas s'il ` +
          `doit porter une preuve, et elle le laisserait passer sans en demander.`
      );
    }
  }

  // 2. Toute tâche en état ≥ « codé » porte une preuve qui résout.
  for (const t of e.taches) {
    const plancher = PLANCHER[t.statut];
    if (plancher === undefined || plancher === null) continue;
    if (rang(plancher) < SEUIL_PREUVE) continue;
    if (preuvesDeLaTache(t, e).length > 0) continue;
    ajouter(
      'tache_preuve_manquante',
      `${t.id} est « ${t.statut} » (donc au moins « ${plancher} ») et ne porte AUCUNE preuve : ` +
        `aucun de ses chemins n'existe sur le disque (${CHEMIN_TACHES} ni ${CHEMIN_PATHS}), et ` +
        `aucun commit ne cite ${t.id} en portée. Un état livré qui ne pointe vers rien est une ` +
        `affirmation sans objet.`
    );
  }

  // 3. L'inventaire porte exactement les étiquettes que l'exigence nomme.
  const dansLInventaire = new Set(e.chantiers.map((c) => c.etiquette));
  const dansLaReq = new Set(e.etiquettesDeLaReq);
  for (const x of dansLaReq) {
    if (!dansLInventaire.has(x)) {
      ajouter(
        'inventaire_etiquette_hors_req',
        `${EXIGENCE} nomme le chantier « ${x} », absent de ${CHEMIN_INVENTAIRE}. L'inventaire ne ` +
          `couvre pas ce que l'exigence énumère.`
      );
    }
  }
  for (const x of dansLInventaire) {
    if (!dansLaReq.has(x)) {
      ajouter(
        'inventaire_etiquette_hors_req',
        `${CHEMIN_INVENTAIRE} porte le chantier « ${x} », que ${EXIGENCE} ne nomme pas. Une ligne ` +
          `d'inventaire sans exigence qui la fonde est une invention.`
      );
    }
  }

  // 4-6. Chaque ligne de l'inventaire.
  for (const c of e.chantiers) {
    if (c.etat !== null && !(LEGENDE as readonly string[]).includes(c.etat)) {
      ajouter(
        'inventaire_etat_hors_legende',
        `${CHEMIN_INVENTAIRE}:${c.ligne} — le chantier « ${c.etiquette} » porte l'état « ${c.etat} », ` +
          `hors de la légende de ${EXIGENCE} (${LEGENDE.join(', ')}).`
      );
      continue;
    }

    if (!c.referentResolu && c.etat !== null) {
      ajouter(
        'inventaire_etat_sans_referent',
        `${CHEMIN_INVENTAIRE}:${c.ligne} — le chantier « ${c.etiquette} » porte l'état ` +
          `« ${c.etat} » alors que ce dépôt ne dit pas ce que l'étiquette DÉSIGNE. Un état posé ` +
          `sur un référent inconnu est une preuve inventée, et une preuve inventée est pire ` +
          `qu'une preuve absente : laisse la cellule vide.`
      );
      continue;
    }

    if (c.etat === null) continue;
    if (rang(c.etat as Avancement) < SEUIL_PREUVE) continue;

    if (c.preuves.length === 0) {
      ajouter(
        'inventaire_preuve_manquante',
        `${CHEMIN_INVENTAIRE}:${c.ligne} — le chantier « ${c.etiquette} » est « ${c.etat} » sans ` +
          `preuve. ${EXIGENCE} en exige une : un chemin de fichier, ou un SHA de commit.`
      );
      continue;
    }

    for (const p of c.preuves) {
      if (cheminExiste(p) || shaResout(p)) continue;
      ajouter(
        'inventaire_preuve_qui_ne_resout_pas',
        `${CHEMIN_INVENTAIRE}:${c.ligne} — la preuve « ${p} » du chantier « ${c.etiquette} » ne ` +
          `résout pas : ce n'est ni un chemin présent sur le disque, ni un SHA que git retrouve.`
      );
    }
  }

  return fautes;
}

// ── chargement ───────────────────────────────────────────────────────────────
for (const f of [CHEMIN_TACHES, CHEMIN_SCHEMA, CHEMIN_PATHS, CHEMIN_INVENTAIRE, CHEMIN_EXIGENCES]) {
  if (!existsSync(f)) {
    console.error(`❌ gov:inventaire — ${f} est introuvable.`);
    process.exit(1);
  }
}

const lire = (f: string): unknown => JSON.parse(readFileSync(f, 'utf8')) as unknown;

const docTaches = lire(CHEMIN_TACHES) as { taches: Tache[] };
const schema = lire(CHEMIN_SCHEMA) as {
  $defs?: { tache?: { properties?: { statut?: { enum?: string[] } } } };
};
const docPaths = lire(CHEMIN_PATHS) as { paths?: Record<string, string[]> };

const etatDuDepot: Etat = {
  taches: docTaches.taches.map((t) => ({
    id: t.id, statut: t.statut, paths: [...t.paths], repo: t.repo, attestation: t.attestation ?? null,
  })),
  cheminsProposes: docPaths.paths ?? {},
  statutsDuSchema: schema.$defs?.tache?.properties?.statut?.enum ?? [],
  chantiers: lireInventaire(readFileSync(CHEMIN_INVENTAIRE, 'utf8')),
  etiquettesDeLaReq: etiquettesDeLaReq(lire(CHEMIN_EXIGENCES)),
  shasParTache: shasParPortee(),
};

const copier = (e: Etat): Etat => ({
  taches: e.taches.map((t) => ({ ...t, paths: [...t.paths], attestation: t.attestation ? { ...t.attestation } : null })),
  cheminsProposes: JSON.parse(JSON.stringify(e.cheminsProposes)) as Record<string, string[]>,
  statutsDuSchema: [...e.statutsDuSchema],
  chantiers: e.chantiers.map((c) => ({ ...c, preuves: [...c.preuves] })),
  etiquettesDeLaReq: [...e.etiquettesDeLaReq],
  shasParTache: JSON.parse(JSON.stringify(e.shasParTache)) as Record<string, string[]>,
});

/** La première tâche qui, aujourd'hui, ne porte aucune preuve. Choisie, jamais codée en dur. */
function sansPreuve(e: Etat): Tache {
  const t = e.taches.find((x) => preuvesDeLaTache(x, e).length === 0);
  if (!t) {
    console.error(
      `❌ gov:inventaire --prove — plus aucune tâche sans preuve dans ${CHEMIN_TACHES} : le témoin ` +
        `de « tache_preuve_manquante » ne peut plus être choisi. Écris-en un explicitement.`
    );
    process.exit(1);
  }
  return t;
}

/** Une ligne d'inventaire dont le référent EST résolu. Le témoin de l'état posé à tort n'en a pas besoin ; le contre-témoin du SHA, si. */
function resolue(e: Etat): LigneChantier {
  const c = e.chantiers.find((x) => x.referentResolu);
  if (!c) {
    console.error(`❌ gov:inventaire --prove — aucun chantier au référent résolu dans ${CHEMIN_INVENTAIRE}.`);
    process.exit(1);
  }
  return c;
}

// ── mode --rapport : le même calcul, en JSON ─────────────────────────────────
if (process.argv.includes('--rapport')) {
  const e = etatDuDepot;
  console.log(
    JSON.stringify(
      {
        legende: [...LEGENDE],
        bareme: PLANCHER,
        statutsDuSchema: e.statutsDuSchema,
        statutsSansRang: e.statutsDuSchema.filter((s) => !(s in PLANCHER)),
        etiquettesDeLaReq: e.etiquettesDeLaReq,
        taches: e.taches.map((t) => ({
          id: t.id,
          statut: t.statut,
          avancement: PLANCHER[t.statut] ?? null,
          preuves: preuvesDeLaTache(t, e),
        })),
        chantiers: e.chantiers.map((c) => ({
          etiquette: c.etiquette,
          referentResolu: c.referentResolu,
          etat: c.etat,
          preuves: c.preuves,
        })),
        fautes: controler(e),
      },
      null,
      2
    )
  );
  process.exit(0);
}

// ── mode --prove : un témoin par famille, des contre-témoins qui restent verts ─
if (process.argv.includes('--prove')) {
  const base = controler(etatDuDepot);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un état DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  // Le contre-témoin du SHA a besoin d'un SHA qui résout VRAIMENT : on prend celui de `HEAD`,
  // jamais une constante — un SHA écrit en dur cesse de résoudre au premier clone superficiel.
  const unSha = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();

  const TEMOINS: { famille: string; defaut: () => Etat }[] = [
    {
      famille: 'statut_hors_bareme',
      defaut: () => {
        const e = copier(etatDuDepot);
        e.statutsDuSchema.push('presque_fini');
        return e;
      },
    },
    {
      famille: 'tache_preuve_manquante',
      defaut: () => {
        const e = copier(etatDuDepot);
        sansPreuve(e).statut = 'fusionnee';
        return e;
      },
    },
    {
      famille: 'inventaire_etiquette_hors_req',
      defaut: () => {
        const e = copier(etatDuDepot);
        e.chantiers.pop();
        return e;
      },
    },
    {
      famille: 'inventaire_etat_hors_legende',
      defaut: () => {
        const e = copier(etatDuDepot);
        resolue(e).etat = 'presque_fini';
        return e;
      },
    },
    {
      famille: 'inventaire_etat_sans_referent',
      defaut: () => {
        const e = copier(etatDuDepot);
        const c = e.chantiers.find((x) => !x.referentResolu)!;
        c.etat = 'fusionne';
        return e;
      },
    },
    {
      famille: 'inventaire_preuve_manquante',
      defaut: () => {
        const e = copier(etatDuDepot);
        const c = resolue(e);
        c.etat = 'fusionne';
        c.preuves = [];
        return e;
      },
    },
    {
      famille: 'inventaire_preuve_qui_ne_resout_pas',
      defaut: () => {
        const e = copier(etatDuDepot);
        const c = resolue(e);
        c.etat = 'fusionne';
        c.preuves = ['docs/UN-FICHIER-QUI-NEXISTE-PAS.md'];
        return e;
      },
    },
  ];

  /**
   * Ce que la garde doit LAISSER PASSER. Un témoin prouve qu'elle sait rougir ; seul un
   * contre-témoin prouve qu'elle ne rougit pas sur du légitime. Les quatre premiers sont des
   * états RÉELS du dépôt aujourd'hui — c'est en les faisant rougir qu'une garde trop stricte
   * bloquerait `pnpm lot:composer` et `pnpm lot:cloture`.
   */
  const CONTRE_TEMOINS: { nom: string; muter: () => Etat }[] = [
    {
      nom: "une tâche fraîchement revendiquée (`en_cours`), dont rien n'existe encore sur le disque",
      muter: () => {
        const e = copier(etatDuDepot);
        sansPreuve(e).statut = 'en_cours';
        return e;
      },
    },
    {
      // GOV-038. Sans la troisième forme de preuve, ce cas-ci rougirait sur une livraison RÉELLE :
      // `INT-T01b` est en production depuis le 2026-09-05, et ni son commit ni son chemin ne sont
      // dans ce dépôt. Le SHA est LU dans git plutôt qu'écrit en dur : quarante hexadécimaux tapés
      // à la main sont une fixture inventée (RM-03), et la garde juge la forme, pas la résolution.
      nom: "une tâche livrée dans un AUTRE dépôt, attestée par { pr, sha entier, fusionneeAt }",
      muter: () => {
        const e = copier(etatDuDepot);
        const t = sansPreuve(e);
        t.statut = 'fusionnee';
        t.repo = 'axionia';
        t.attestation = {
          pr: 998,
          sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          fusionneeAt: '2026-09-05T11:04:48Z',
        };
        return e;
      },
    },
    {
      nom: 'une tâche arrêtée (`bloquee`) sans aucune preuve — un arrêt ne fait pas avancer',
      muter: () => {
        const e = copier(etatDuDepot);
        sansPreuve(e).statut = 'bloquee';
        return e;
      },
    },
    {
      nom: 'une dette `proposee` sans preuve — elle n’est pas encore au registre arbitré',
      muter: () => {
        const e = copier(etatDuDepot);
        sansPreuve(e).statut = 'proposee';
        return e;
      },
    },
    {
      nom: "une tâche `fusionnee` dont TOUS les `paths[]` de tasks.json sont des marque-place : c'est l'état des douze tâches livrées",
      muter: () => {
        const e = copier(etatDuDepot);
        const t = e.taches.find((x) => PLANCHER[x.statut] === 'fusionne')!;
        t.paths = ['docs/gouvernance/UN-MARQUE-PLACE'];
        return e;
      },
    },
    {
      nom: 'un chantier prouvé par un SHA court qui résout, et non par un chemin',
      muter: () => {
        const e = copier(etatDuDepot);
        const c = resolue(e);
        c.etat = 'fusionne';
        c.preuves = [unSha];
        return e;
      },
    },
    {
      nom: "un chantier au référent non résolu, sans état ni preuve : six lignes sur huit sont dans cet état",
      muter: () => {
        const e = copier(etatDuDepot);
        const c = resolue(e);
        c.referentResolu = false;
        c.etat = null;
        c.preuves = [];
        return e;
      },
    },
  ];

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.muter());
    if (f.length > 0) {
      console.error(`❌ Le contre-témoin « ${c.nom} » a fait rougir la garde alors qu'il est légitime :`);
      f.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut());
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      process.exit(1);
    }
    prouvees.add(t.famille);
  }

  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoin(s) restent verts.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
const fautes = controler(etatDuDepot);
if (fautes.length === 0) {
  const avancees = etatDuDepot.taches.filter((t) => {
    const p = PLANCHER[t.statut];
    return p != null && rang(p) >= SEUIL_PREUVE;
  });
  const chantiersAvances = etatDuDepot.chantiers.filter(
    (c) => c.etat !== null && rang(c.etat as Avancement) >= SEUIL_PREUVE
  );
  const nonResolus = etatDuDepot.chantiers.filter((c) => !c.referentResolu).length;

  console.log(
    `✅ gov:inventaire — ${avancees.length} tâche(s) en état ≥ « code » portent chacune une preuve ` +
      `qui résout, sur ${etatDuDepot.taches.length}.`
  );
  console.log(
    `   ${etatDuDepot.statutsDuSchema.length} statuts du schéma, tous rangés sur la légende de ` +
      `${EXIGENCE} (${LEGENDE.length} états).`
  );
  console.log(
    `   ${CHEMIN_INVENTAIRE} : ${etatDuDepot.chantiers.length} chantiers, ` +
      `${chantiersAvances.length} en état ≥ « code » avec preuve, ` +
      `${nonResolus} sans référent résolu dans ce dépôt (donc sans état — c'est voulu).`
  );
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:inventaire — ${fautes.length} état(s) d'avancement sans preuve :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
