/**
 * gov-tasks.ts — la garde du backlog (GOV-017a, REQ-GOV-026).
 *
 * USAGE : pnpm gov:tasks           (échoue si `docs/tasks.json` est invalide ou incohérent)
 *         pnpm gov:tasks --prove   (injecte un défaut PAR FAMILLE et vérifie que chacun rougit)
 *
 * `docs/tasks.json` est la SOURCE du backlog ; `TASKS.md` en est une vue. Tout ce que le composeur
 * de lot suppose sans le vérifier se vérifie ici, une fois pour toutes :
 *
 *   — le schéma (`scripts/lot/tasks.schema.json`), y compris ses invariants conditionnels ;
 *   — l'unicité des identifiants ;
 *   — la résolution des dépendances, et leur ACYCLICITÉ ;
 *   — l'ordre des phases : une tâche ne dépend jamais d'une tâche postérieure ;
 *   — l'interdiction des identifiants SCINDÉS en dépendance (`INT-T01`, `GOV-017`, `EXT-T02` ont
 *     été découpés le 2026-09-03 ; les citer, c'est dépendre de quelque chose qui n'existe plus) ;
 *   — l'interdiction des identifiants de DÉCISION en dépendance (GOV-003) : une décision se cite
 *     dans `hyp`, jamais dans `deps` — sinon le composeur attend qu'une tâche inexistante fusionne ;
 *   — l'adossement de chaque `hyp` au registre `docs/DECISIONS.md` : une tâche qui repose sur une
 *     décision que personne n'a écrite n'est pas éligible, et le motif `decision_sans_hypothese`
 *     n'aurait rien à nommer.
 *
 * POURQUOI UNE GARDE ET PAS UN TEST : ces invariants portent sur un fichier de DONNÉES que plusieurs
 * sessions écrivent en parallèle (`pnpm lot:cloture`). Un test unitaire ne le relit pas ; la CI, si.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const CHEMIN_TACHES = 'docs/tasks.json';
const CHEMIN_SCHEMA = 'scripts/lot/tasks.schema.json';
const CHEMIN_DECISIONS = 'docs/DECISIONS.md';

/** Identifiants découpés le 2026-09-03. Les citer en dépendance est une erreur, pas un raccourci. */
const SCINDES: Record<string, string> = {
  'INT-T01': 'INT-T01a (enveloppe) puis INT-T01b (payloads) — citer INT-T01b suffit',
  'GOV-017': 'GOV-017a (conversion) puis GOV-017b (paths/zone/sensible)',
  'EXT-T02': 'EXT-T02a (phase 1) puis EXT-T02b (phase 2)',
};

type Tache = {
  id: string;
  titre: string;
  phase: number;
  repo: string;
  zone: string;
  deps: string[];
  hyp: string[];
  reqs: string[];
  paths: string[];
  schema: boolean;
  sensible: string[];
  estimateDays: number;
  externe: string | null;
  statut: string;
  acceptance?: string;
  tests?: Record<string, string[]>;
  owner?: string | null;
  branch?: string | null;
};

type Faute = { famille: string; message: string };

/** Les statuts qui valent « livrée ». Une dépendance doit y être avant que son dépendant y entre. */
const LIVREE = new Set(['fusionnee', 'deployee', 'verifiee']);

// ── le registre des décisions ────────────────────────────────────────────────
/**
 * Une décision est DÉCLARÉE si son identifiant est la première cellule d'une ligne de tableau.
 * Une mention en prose ne suffit pas : elle ne porte ni hypothèse, ni réversibilité, ni propriétaire.
 */
function decisionsDeclarees(texte: string): Set<string> {
  const out = new Set<string>();
  for (const ligne of texte.split('\n')) {
    if (!ligne.trimStart().startsWith('|')) continue;
    const premiere = ligne.split('|')[1];
    if (premiere === undefined) continue;
    const m = premiere.replace(/[*`]/g, '').trim().match(/^((?:HYP|DEC|W|EXT)-?[A-Z0-9][A-Za-z0-9-]*)/);
    if (m && m[1]) out.add(m[1]);
  }
  return out;
}

// ── les contrôles ────────────────────────────────────────────────────────────
function controler(doc: unknown, schema: object, registre: Set<string>): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  const ajv = new (Ajv2020 as unknown as { new (o: object): { validate: (s: object, d: unknown) => boolean; errors?: { instancePath?: string; message?: string }[] } })({
    allErrors: true,
    strict: false,
  });
  if (!ajv.validate(schema, doc)) {
    for (const e of ajv.errors ?? []) {
      ajouter('schema', `${e.instancePath || '(racine)'} ${e.message ?? 'invalide'}`);
    }
  }

  const taches = ((doc as { taches?: Tache[] }).taches ?? []) as Tache[];

  // unicité
  const vus = new Set<string>();
  for (const t of taches) {
    if (vus.has(t.id)) ajouter('id_double', `${t.id} apparaît plus d'une fois.`);
    vus.add(t.id);
  }

  const parId = new Map(taches.map((t) => [t.id, t]));

  for (const t of taches) {
    for (const d of t.deps) {
      if (SCINDES[d]) {
        ajouter('dep_identifiant_scinde', `${t.id} dépend de ${d}, qui a été découpé : ${SCINDES[d]}.`);
        continue;
      }
      if (/^(HYP|DEC)-|^W\d{1,2}$/.test(d)) {
        ajouter(
          'dep_decision_nue',
          `${t.id} porte la décision ${d} dans deps. Une décision se cite dans hyp — dans deps, le ` +
            `composeur attend la fusion d'une tâche qui n'existe pas (GOV-003).`
        );
        continue;
      }
      const cible = parId.get(d);
      if (!cible) {
        ajouter('dep_inconnue', `${t.id} dépend de ${d}, qui n'est aucune tâche du fichier.`);
        continue;
      }
      if (cible.phase > t.phase) {
        ajouter(
          'dep_phase_ulterieure',
          `${t.id} (phase ${t.phase}) dépend de ${d} (phase ${cible.phase}) : la phase ${t.phase} ` +
            `ne pourrait jamais se terminer.`
        );
      }
      if (LIVREE.has(t.statut) && !LIVREE.has(cible.statut)) {
        ajouter(
          'dep_non_livree',
          `${t.id} est « ${t.statut} » mais dépend de ${d}, encore « ${cible.statut} ». Une tâche ` +
            `livrée avant sa dépendance a été livrée sur une base qui n'existe pas : l'éligibilité ` +
            `que le composeur calcule ensuite est fausse.`
        );
      }
    }

    for (const h of t.hyp) {
      if (!registre.has(h)) {
        ajouter(
          'hyp_hors_registre',
          `${t.id} repose sur ${h}, qui n'a pas de ligne dans ${CHEMIN_DECISIONS}. ` +
            `Ajoute-lui une ligne (hypothèse, réversibilité, propriétaire) ou son alias canonique.`
        );
      }
    }

    if (t.paths.length === 0) {
      ajouter('paths_vide', `${t.id} ne déclare aucun chemin : le composeur ne peut pas l'isoler.`);
    }

    // Une tâche de DÉCISION coûte 0 j ; une tâche de code est plafonnée à 1,5 j (une PR).
    if (t.repo !== 'externe' && t.estimateDays > 1.5) {
      ajouter('estimation_hors_plafond', `${t.id} est estimée ${t.estimateDays} j : au-delà d'une PR (1,5 j).`);
    }
    if (t.externe !== null && t.statut !== 'attente_externe') {
      ajouter(
        'externe_sans_attente',
        `${t.id} attend ${t.externe} mais son statut est « ${t.statut} » : le filtre du composeur la laisserait passer.`
      );
    }
  }

  // acyclicité — parcours en profondeur, pile explicite pour nommer le cycle
  const BLANC = 0, GRIS = 1, NOIR = 2;
  const couleur = new Map<string, number>(taches.map((t) => [t.id, BLANC]));
  const pile: string[] = [];
  const signales = new Set<string>();

  const visiter = (id: string): void => {
    couleur.set(id, GRIS);
    pile.push(id);
    for (const d of parId.get(id)?.deps ?? []) {
      if (!parId.has(d)) continue;
      const c = couleur.get(d);
      if (c === GRIS) {
        const cycle = pile.slice(pile.indexOf(d)).concat(d).join(' → ');
        if (!signales.has(cycle)) {
          signales.add(cycle);
          ajouter('dep_circulaire', `Cycle de dépendances : ${cycle}.`);
        }
      } else if (c === BLANC) {
        visiter(d);
      }
    }
    pile.pop();
    couleur.set(id, NOIR);
  };
  for (const t of taches) if (couleur.get(t.id) === BLANC) visiter(t.id);

  return fautes;
}

const FAMILLES = [
  'schema', 'id_double', 'dep_inconnue', 'dep_circulaire', 'dep_phase_ulterieure',
  'dep_identifiant_scinde', 'dep_decision_nue', 'hyp_hors_registre', 'paths_vide',
  'estimation_hors_plafond', 'externe_sans_attente', 'dep_non_livree',
];

// ── chargement ───────────────────────────────────────────────────────────────
for (const f of [CHEMIN_TACHES, CHEMIN_SCHEMA, CHEMIN_DECISIONS]) {
  if (!existsSync(f)) {
    console.error(`❌ gov:tasks — ${f} est introuvable.`);
    process.exit(1);
  }
}
const schema = JSON.parse(readFileSync(CHEMIN_SCHEMA, 'utf8')) as object;
const registre = decisionsDeclarees(readFileSync(CHEMIN_DECISIONS, 'utf8'));
const doc = JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] };

// ── mode --render : docs/TASKS.md est une VUE de ce fichier ───────────────────
// `TASKS.md` a longtemps ete la source, tenue a la main : trois comptages differents y
// circulaient, tous faux, et un correctif ecrit dans un constat ne rejoignait jamais le texte
// de la tache. La source est desormais `docs/tasks.json` ; ce rendu produit la vue, et rien
// d'autre ne doit ecrire dans `docs/TASKS.md`.
if (process.argv.includes('--render')) {
  const fautes = controler(doc, schema, registre);
  if (fautes.length > 0) {
    console.error(`❌ Refus de rendre une vue d'un backlog fautif (${fautes.length}). Lance \`pnpm gov:tasks\`.`);
    process.exit(1);
  }

  const PHASES: Record<number, string> = {
    [-1]: 'Gouvernance (prealable bloquant)',
    0: 'Socle technique',
    1: 'Operationnel',
    2: 'Argent',
    3: 'Pilotage et conformite',
  };
  const l: string[] = [];
  const total = doc.taches.reduce((a, t) => a + t.estimateDays, 0);

  l.push('# Taches par phase — Axion Apporteurs');
  l.push('');
  l.push('> ⚠️ **Ce fichier est une VUE. La source est `docs/tasks.json`.**');
  l.push('> Regenere par `pnpm gov:tasks --render`, jamais edite a la main : une correction tapee ici');
  l.push('> disparait au rendu suivant. Trois comptages differents ont circule dans la version tenue');
  l.push('> a la main, tous faux — les nombres ci-dessous sont comptes a la generation.');
  l.push('>');
  l.push('> Une tache = une PR, **≤ 1,5 jour**. Le plafond est porte par la garde `gov:tasks`.');
  l.push('');
  l.push(`**${doc.taches.length} taches · ${total.toFixed(2)} j estimes.**`);
  l.push('');
  l.push('| Phase | Taches | Jours | Terminees |');
  l.push('| --- | ---: | ---: | ---: |');
  for (const p of [-1, 0, 1, 2, 3]) {
    const liste = doc.taches.filter((t) => t.phase === p);
    const faites = liste.filter((t) => LIVREE.has(t.statut)).length;
    l.push(`| ${p} — ${PHASES[p]} | ${liste.length} | ${liste.reduce((a, t) => a + t.estimateDays, 0).toFixed(2)} | ${faites} |`);
  }
  l.push('');

  for (const p of [-1, 0, 1, 2, 3]) {
    const liste = doc.taches.filter((t) => t.phase === p);
    if (liste.length === 0) continue;
    l.push(`## Phase ${p} — ${PHASES[p]}`);
    l.push('');
    for (const t of liste) {
      const marques: string[] = [];
      if (t.repo !== 'partners') marques.push(`\`${t.repo}\``);
      if (t.schema) marques.push('`schema`');
      if (t.sensible.length > 0) marques.push(`sensible : ${t.sensible.join(', ')}`);
      const etat = LIVREE.has(t.statut) ? ` ✅ **${t.statut}**` : t.statut === 'a_faire' ? '' : ` — **${t.statut}**`;
      l.push(`### ${t.id} — ${t.titre}${etat}`);
      l.push('');
      l.push(
        `\`${t.estimateDays} j\` · zone \`${t.zone}\`` +
          (marques.length ? ` · ${marques.join(' · ')}` : '') +
          (t.deps.length ? ` · depend de ${t.deps.map((d) => `\`${d}\``).join(', ')}` : ' · aucune dependance') +
          (t.hyp.length ? ` · decisions ${t.hyp.map((h) => `\`${h}\``).join(', ')}` : '')
      );
      l.push('');
      l.push(`Couvre : ${t.reqs.map((r) => `\`${r}\``).join(', ')}`);
      l.push('');
      if (t.acceptance) {
        l.push(`**Acceptation.** ${t.acceptance}`);
        l.push('');
      }
      const tests = t.tests ? Object.values(t.tests).flat() : [];
      if (tests.length > 0) {
        l.push(`**Tests.** ${[...new Set(tests)].map((x) => `\`${x}\``).join(' · ')}`);
        l.push('');
      }
    }
  }

  writeFileSync('docs/TASKS.md', l.join('\n') + '\n');
  console.log(`✅ docs/TASKS.md rendu depuis ${CHEMIN_TACHES} — ${doc.taches.length} taches, ${total.toFixed(2)} j.`);
  process.exit(0);
}

// ── mode --prove : un défaut par famille, chacun vu rougir ────────────────────
if (process.argv.includes('--prove')) {
  const base = controler(doc, schema, registre);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un document DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const copie = (): { taches: Tache[] } => JSON.parse(JSON.stringify(doc)) as { taches: Tache[] };
  const premiere = (d: { taches: Tache[] }): Tache => d.taches[0]!;
  const derniere = (d: { taches: Tache[] }): Tache => d.taches[d.taches.length - 1]!;

  const TEMOINS: { famille: string; defaut: () => { taches: Tache[] } }[] = [
    { famille: 'schema', defaut: () => { const d = copie(); (premiere(d) as unknown as { phase: number }).phase = 42; return d; } },
    // Second témoin de `schema`, ciblé sur le motif de `branch` (partners/ADR-0007). Le témoin
    // `phase = 42` ci-dessus prouve que la famille rougit ; il ne prouve rien du champ `branch`,
    // dont le motif a été élargi. Une branche sans préfixe reconnu doit rester refusée.
    { famille: 'schema', defaut: () => { const d = copie(); premiere(d).branch = 'feature/ce-prefixe-nexiste-pas'; return d; } },
    { famille: 'id_double', defaut: () => { const d = copie(); d.taches.push(JSON.parse(JSON.stringify(premiere(d))) as Tache); return d; } },
    { famille: 'dep_inconnue', defaut: () => { const d = copie(); premiere(d).deps.push('NEXISTE-PAS-01'); return d; } },
    { famille: 'dep_circulaire', defaut: () => { const d = copie(); const [a, b] = [d.taches[0]!, d.taches[1]!]; a.deps = [b.id]; b.deps = [a.id]; return d; } },
    { famille: 'dep_phase_ulterieure', defaut: () => { const d = copie(); const tard = d.taches.find((t) => t.phase === 3)!; const tot = d.taches.find((t) => t.phase === -1)!; tot.deps = [tard.id]; return d; } },
    { famille: 'dep_identifiant_scinde', defaut: () => { const d = copie(); premiere(d).deps.push('INT-T01'); return d; } },
    { famille: 'dep_decision_nue', defaut: () => { const d = copie(); premiere(d).deps.push('W6'); return d; } },
    { famille: 'hyp_hors_registre', defaut: () => { const d = copie(); premiere(d).hyp.push('HYP-JAMAIS-ECRITE'); return d; } },
    { famille: 'paths_vide', defaut: () => { const d = copie(); premiere(d).paths = []; return d; } },
    { famille: 'estimation_hors_plafond', defaut: () => { const d = copie(); derniere(d).estimateDays = 3; return d; } },
    { famille: 'externe_sans_attente', defaut: () => { const d = copie(); const e = d.taches.find((t) => t.externe !== null)!; e.statut = 'a_faire'; return d; } },
    // Une tâche livrée dont la dépendance ne l'est pas : le témoin prend une tâche `fusionnee`
    // et remet sa dépendance à `a_faire`.
    { famille: 'dep_non_livree', defaut: () => {
      const d = copie();
      const livree = d.taches.find((t) => LIVREE.has(t.statut) && t.deps.length > 0)!;
      const dep = d.taches.find((t) => t.id === livree.deps[0])!;
      dep.statut = 'a_faire'; dep.owner = null; dep.branch = null;
      return d;
    } },
  ];

  /**
   * Ce que la garde doit LAISSER PASSER. Un témoin prouve qu'une garde sait rougir ; il ne prouve
   * jamais qu'elle ne rougit pas sur du légitime. Les deux formes de branche arrêtées par
   * `partners/ADR-0007` sont exactement le cas où une garde trop stricte bloquerait
   * `pnpm lot:cloture`, seul écrivain du statut — c'est ce qui est arrivé au lot L-1-01.
   */
  const CONTRE_TEMOINS: { nom: string; muter: () => { taches: Tache[] } }[] = [
    { nom: 'une branche de LOT — la forme normale (partners/ADR-0007)',
      muter: () => { const d = copie(); premiere(d).branch = 'lot/L-9-99-integration'; return d; } },
    { nom: 'une branche de TÂCHE — la forme dérogatoire (partners/ADR-0007)',
      muter: () => { const d = copie(); premiere(d).branch = 't/gov-012'; return d; } },
  ];

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.muter(), schema, registre);
    if (f.length > 0) {
      console.error(
        `\u274c Le contre-t\u00e9moin \u00ab ${c.nom} \u00bb a fait rougir la garde alors qu'il est l\u00e9gitime :`
      );
      f.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut(), schema, registre);
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
  console.log(`   ${CONTRE_TEMOINS.length} contre-t\u00e9moin(s) restent verts.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
const fautes = controler(doc, schema, registre);
if (fautes.length === 0) {
  const j = doc.taches.reduce((s, t) => s + t.estimateDays, 0);
  const parPhase = [-1, 0, 1, 2, 3].map((p) => {
    const l = doc.taches.filter((t) => t.phase === p);
    return `${p} : ${l.length} / ${l.reduce((s, t) => s + t.estimateDays, 0).toFixed(2)} j`;
  });
  console.log(`✅ gov:tasks — ${doc.taches.length} tâches, ${j.toFixed(2)} j, ${registre.size} décisions au registre.`);
  console.log(`   ${parPhase.join('  ·  ')}`);
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:tasks — ${fautes.length} incohérence(s) dans ${CHEMIN_TACHES} :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
