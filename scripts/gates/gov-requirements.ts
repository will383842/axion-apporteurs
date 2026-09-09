/**
 * gov-requirements.ts — la garde du registre d'exigences (GOV-001, REQ-GOV-001 / REQ-GOV-026).
 *
 * USAGE : pnpm gov:requirements                 (échoue si le registre est invalide ou incohérent)
 *         pnpm gov:requirements --prove         (un défaut PAR FAMILLE, chacun vu rougir)
 *         pnpm gov:requirements --render        (écrit `docs/REQUIREMENTS.md`, la VUE du registre)
 *         pnpm gov:requirements --verifie-rendu (n'écrit rien ; sort 1 si la vue a dérivé)
 *         …--out <chemin>                       travaille sur une autre vue (bancs d'essai)
 *
 * `docs/requirements.json` est la SOURCE ; `docs/REQUIREMENTS.md` en est une vue générée.
 *
 * ⚠️ ELLE NE L'A PAS TOUJOURS ÉTÉ. Jusqu'à GOV-024, `docs/REQUIREMENTS.md` n'avait AUCUN
 * générateur : son bandeau affirmait « la cohérence des deux est tenue par `pnpm gov:requirements` »
 * alors qu'aucun contrôle ne comparait la vue à sa source, et le point 5 de `docs/PRESEANCE.md` §5
 * le constatait sans que personne ne puisse le refermer. Le fichier avait effectivement dérivé :
 * il annonçait **353** exigences quand le registre en portait **354**, `REQ-GOV-032` manquant.
 * Le bandeau est désormais ÉMIS PAR CE FICHIER — il ne peut plus mentir sans que `--verifie-rendu`
 * rougisse (`docs/PRESEANCE.md` §4.1 : bandeau émis par le générateur, jamais collé).
 *
 * Ce que la garde tient, et que rien d'autre ne tenait :
 *
 *   — le schéma (`scripts/lot/requirements.schema.json`), `remplaceePar` compris ;
 *   — l'unicité des identifiants, et une SOURCE non vide pour chacun : une exigence sans origine
 *     ne peut être ni datée ni contestée ;
 *   — la résolution des absorptions, et l'absence de CHAÎNE (A absorbée par B, B absorbée par C) :
 *     un lecteur qui suit `remplaceePar` doit atterrir en un saut sur un texte en vigueur ;
 *   — la couverture des **21 modules** et des **12 étapes** de l'audit de bout en bout : un module
 *     sans exigence, c'est un pan du produit que personne n'a spécifié — ou une dérivation ratée ;
 *   — le PORTEUR : toute exigence `active` est citée par au moins une tâche. Sans cela elle ne sera
 *     jamais codée, et personne ne s'en apercevra — c'était le cas de six d'entre elles, dont
 *     `REQ-DM-041`, qui fondait une garde restée sans propriétaire ;
 *   — la réciproque : aucune tâche ne cite une exigence qui n'existe pas ;
 *   — la `phase` : elle est DÉRIVÉE de la plus précoce des tâches porteuses, jamais saisie ;
 *   — l'ÉGALITÉ de la vue et de sa source, à l'octet près (`--verifie-rendu`, REQ-GOV-032).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const CHEMIN_REGISTRE = 'docs/requirements.json';
const CHEMIN_SCHEMA = 'scripts/lot/requirements.schema.json';
const CHEMIN_TACHES = 'docs/tasks.json';
const CHEMIN_VUE_PAR_DEFAUT = 'docs/REQUIREMENTS.md';

/** `--out <chemin>` : rendre ou vérifier une AUTRE vue que celle du dépôt (bancs d'essai des tests). */
const iOut = process.argv.indexOf('--out');
const CHEMIN_VUE = iOut >= 0 ? (process.argv[iOut + 1] ?? CHEMIN_VUE_PAR_DEFAUT) : CHEMIN_VUE_PAR_DEFAUT;

/** Les 21 modules et les 12 étapes de l'audit du 2026-09-03. Le compte est l'invariant. */
const NB_MODULES = 21;
const NB_ETAPES = 12;

/**
 * LES LIBELLÉS DES MODULES ET DES ÉTAPES N'ONT PAS D'AUTRE SOURCE QUE CE FICHIER — et c'est un
 * manque, pas un choix. `docs/requirements.json` ne porte que des NUMÉROS (`module`, `etape`) ;
 * les noms ne vivaient jusqu'ici que dans la vue elle-même, c'est-à-dire dans le fichier généré,
 * c'est-à-dire nulle part. Les mettre ici en fait une source unique et versionnée (RM-01) au lieu
 * d'une donnée que la régénération aurait effacée. Les COMPTES, eux, restent dérivés.
 * Toute correction d'un libellé se fait ICI, puis `pnpm gov:requirements --render`.
 */
const MODULES: readonly string[] = [
  'Recrutement & candidature',
  'Scoring & priorisation',
  'Entretien / webinaire',
  'KYC & conformité',
  'Contrat & signature électronique',
  'Onboarding automatique',
  'Enablement',
  'Espace apporteur',
  'Dépôt de contact',
  "Vérification d'entreprise",
  'Pipeline & statuts',
  'Qualification structurée',
  'Moteur de commissions',
  'Parrainage',
  'Relevés, approbation, paiement',
  'Autofacturation & fiscal',
  'Console de pilotage',
  "Suivi d'activité par apporteur",
  'Animation & ré-engagement',
  'Support & messagerie',
  'Suspension, résiliation, offboarding',
];

const ETAPES: readonly string[] = [
  'Sourcing',
  'Candidature',
  'Entretien / webinaire',
  'KYC',
  'Contrat',
  'Onboarding',
  'Activité',
  'Qualification',
  'Vente',
  'Commission',
  'Relevé & paiement',
  'Fin de collaboration',
];

type Exigence = {
  id: string;
  domaine: string;
  texte: string;
  source: string;
  statut: 'active' | 'absorbee' | 'retiree';
  remplaceePar: string | null;
  module: number | null;
  etape: number | null;
  phase: number | null;
  taches: string[];
};
type Tache = { id: string; phase: number; reqs: string[] };
type Faute = { famille: string; message: string };

type Validateur = { validate: (s: object, d: unknown) => boolean; errors?: { instancePath?: string; message?: string }[] };
const CtorAjv = Ajv2020 as unknown as { new (o: object): Validateur };

function controler(doc: unknown, schema: object, taches: Tache[]): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  const ajv = new CtorAjv({ allErrors: true, strict: false });
  if (!ajv.validate(schema, doc)) {
    for (const e of ajv.errors ?? []) ajouter('schema', `${e.instancePath || '(racine)'} ${e.message ?? 'invalide'}`);
  }

  const exigences = ((doc as { exigences?: Exigence[] }).exigences ?? []) as Exigence[];
  const parId = new Map<string, Exigence>();

  for (const e of exigences) {
    if (parId.has(e.id)) ajouter('id_double', `${e.id} apparaît plus d'une fois.`);
    parId.set(e.id, e);
    if (!e.source || e.source.trim().length < 5) {
      ajouter('source_vide', `${e.id} n'a pas de source : elle ne peut être ni datée ni contestée.`);
    }
  }

  // absorptions : la survivante existe, et elle n'est pas elle-même absorbée
  for (const e of exigences) {
    if (e.statut !== 'absorbee') continue;
    const cible = e.remplaceePar ? parId.get(e.remplaceePar) : undefined;
    if (!cible) {
      ajouter('remplacante_inconnue', `${e.id} renvoie à ${e.remplaceePar ?? '(rien)'}, qui n'est pas au registre.`);
      continue;
    }
    if (cible.statut !== 'active') {
      ajouter(
        'absorption_en_chaine',
        `${e.id} renvoie à ${cible.id}, qui est « ${cible.statut} » : suivre le renvoi n'atterrit pas ` +
          `sur un texte en vigueur. Fais pointer ${e.id} directement sur la survivante.`
      );
    }
  }

  // couverture des modules et des étapes
  const modules = new Set(exigences.map((e) => e.module).filter((m): m is number => m !== null));
  const etapes = new Set(exigences.map((e) => e.etape).filter((s): s is number => s !== null));
  for (let m = 1; m <= NB_MODULES; m++) {
    if (!modules.has(m)) {
      ajouter('module_sans_exigence', `Le module ${m} de l'audit ne porte aucune exigence.`);
    }
  }
  for (let s = 1; s <= NB_ETAPES; s++) {
    if (!etapes.has(s)) ajouter('etape_sans_exigence', `L'étape ${s} du parcours ne porte aucune exigence.`);
  }

  // porteurs — dans les deux sens
  const porteurs = new Map<string, Tache[]>();
  for (const t of taches) {
    for (const r of t.reqs) porteurs.set(r, [...(porteurs.get(r) ?? []), t]);
  }
  for (const r of porteurs.keys()) {
    if (!parId.has(r)) {
      ajouter(
        'exigence_citee_non_definie',
        `${porteurs.get(r)!.map((t) => t.id).join(', ')} cite ${r}, qui n'est pas au registre.`
      );
    }
  }
  for (const e of exigences) {
    const p = porteurs.get(e.id) ?? [];
    if (e.statut === 'active' && p.length === 0) {
      ajouter(
        'exigence_sans_porteur',
        `${e.id} est active et aucune tâche ne la cite : elle ne sera jamais codée.`
      );
    }
    const attendue = p.length > 0 ? Math.min(...p.map((t) => t.phase)) : null;
    if (e.phase !== attendue) {
      ajouter(
        'phase_non_derivee',
        `${e.id} porte phase ${e.phase} ; la plus précoce de ses tâches est ${attendue}. ` +
          `La phase se DÉRIVE, elle ne se saisit pas.`
      );
    }
    if (e.taches.join('|') !== p.map((t) => t.id).sort().join('|')) {
      ajouter('taches_non_derivees', `${e.id} liste des tâches qui ne sont pas celles qui la citent.`);
    }
  }

  return fautes;
}

const FAMILLES = [
  'schema', 'id_double', 'source_vide', 'remplacante_inconnue', 'absorption_en_chaine',
  'module_sans_exigence', 'etape_sans_exigence', 'exigence_citee_non_definie',
  'exigence_sans_porteur', 'phase_non_derivee', 'taches_non_derivees',
];

for (const f of [CHEMIN_REGISTRE, CHEMIN_SCHEMA, CHEMIN_TACHES]) {
  if (!existsSync(f)) {
    console.error(`❌ gov:requirements — ${f} est introuvable.`);
    process.exit(1);
  }
}
const schema = JSON.parse(readFileSync(CHEMIN_SCHEMA, 'utf8')) as object;
const taches = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] }).taches;
const doc = JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { exigences: Exigence[] };

// ── la vue ───────────────────────────────────────────────────────────────────
/**
 * Le rendu de `docs/REQUIREMENTS.md`. Fonction PURE et DÉTERMINISTE : deux appels sur le même
 * registre rendent le même octet — aucune horloge, aucun `Object.keys`, aucune lecture de disque.
 * Sans cela, `--verifie-rendu` mesurerait la machine au lieu de mesurer la dérive.
 *
 * L'ORDRE EST CELUI DU REGISTRE, jamais un tri : les exigences sortent dans l'ordre du fichier
 * source, et les sections de domaine dans l'ordre de leur première apparition. Un tri appliqué
 * ici ferait diverger la vue d'un simple ajout en fin de registre, et le rouge ne dirait plus rien.
 */
export function rendreVue(exigences: Exigence[]): string {
  const l: string[] = [];
  const n = (s: string): number => exigences.filter((e) => e.statut === s).length;
  const avecTaches = exigences.filter((e) => e.taches.length > 0).length;

  l.push('# Registre des exigences — Axion Apporteurs');
  l.push('');
  l.push('> ⚠️ **Ce fichier est une VUE. La source est `docs/requirements.json`.**');
  l.push('> Regénéré par `pnpm gov:requirements --render`, jamais édité à la main : une correction');
  l.push('> tapée ici disparaît à la régénération suivante.');
  l.push('> `pnpm gov:requirements --verifie-rendu` rougit si ce fichier a dérivé de sa source, et');
  l.push('> NOMME l’écart en nombre d’exigences (REQ-GOV-032). Jusqu’au 2026-09-05, aucune garde ne');
  l.push('> comparait les deux : la vue annonçait 353 exigences pour 354 au registre.');
  l.push('>');
  l.push('> **Aucun total n\'est écrit à la main.** Trois comptages différents ont circulé dans les documents');
  l.push('> sources, tous faux. Ceux qui suivent sont comptés à la génération.');
  l.push('>');
  l.push('> **Dépôt public** — les renvois à la note d\'analyse interne apparaissent sous la forme');
  l.push('> « note interne (hors dépôt) », et les seuils comme les montants du réseau vivent en');
  l.push('> configuration (`REQ-GOV-031`, garde `pnpm gov:publication`).');
  l.push('');
  l.push('## Ce que porte le registre');
  l.push('');
  l.push('| | Nombre |');
  l.push('| --- | ---: |');
  l.push(`| Exigences | **${exigences.length}** |`);
  l.push(`| — dont actives | ${n('active')} |`);
  l.push(`| — dont absorbées par une autre (l'identifiant résout encore) | ${n('absorbee')} |`);
  l.push(`| — dont retirées | ${n('retiree')} |`);
  l.push(`| Exigences couvertes par au moins une tâche | ${avecTaches} |`);
  l.push(`| Exigences sans porteur | ${exigences.length - avecTaches} |`);
  l.push('');

  const compter = (cle: 'module' | 'etape', valeur: number): number =>
    exigences.filter((e) => e[cle] === valeur).length;

  l.push(`## Couverture des ${NB_MODULES} modules de l'audit de bout en bout`);
  l.push('');
  l.push('| # | Module | Exigences |');
  l.push('| ---: | --- | ---: |');
  MODULES.forEach((nom, i) => l.push(`| ${i + 1} | ${nom} | ${compter('module', i + 1)} |`));
  l.push('');

  l.push(`## Couverture des ${NB_ETAPES} étapes du parcours`);
  l.push('');
  l.push('| # | Étape | Exigences |');
  l.push('| ---: | --- | ---: |');
  ETAPES.forEach((nom, i) => l.push(`| ${i + 1} | ${nom} | ${compter('etape', i + 1)} |`));
  l.push('');

  l.push('## Exigences');
  l.push('');
  l.push(`Chaque entrée porte son **module** (1-${NB_MODULES}), son **étape** (1-${NB_ETAPES}), la **phase** où elle est`);
  l.push('livrée — la plus précoce de ses tâches porteuses — et **les tâches qui la prouvent**.');
  l.push("Une exigence sans tâche n'est portée par personne : `gov:requirements` la nomme.");
  l.push('');

  const domaines: string[] = [];
  for (const e of exigences) if (!domaines.includes(e.domaine)) domaines.push(e.domaine);

  for (const domaine of domaines) {
    l.push(`### ${domaine}`);
    l.push('');
    for (const e of exigences.filter((x) => x.domaine === domaine)) {
      const absorbee = e.statut === 'absorbee' ? ` → **absorbée par ${e.remplaceePar}**` : '';
      l.push(`- **${e.id}**${absorbee} — ${e.texte}`);

      const reperes: string[] = [];
      if (e.module !== null) reperes.push(`module ${e.module}`);
      if (e.etape !== null) reperes.push(`étape ${e.etape}`);
      reperes.push(`phase ${e.phase === null ? '—' : e.phase}`);
      reperes.push(
        `tâches : ${e.taches.length > 0 ? e.taches.map((t) => `\`${t}\``).join(', ') : '**aucune**'}`
      );
      l.push(`  <br>_${reperes.join(' · ')}_ · _source : ${e.source}_`);
    }
    l.push('');
  }

  // La dernière section laisse une ligne vide de trop : on la retire, et le fichier se termine
  // par exactement un saut de ligne.
  while (l[l.length - 1] === '') l.pop();
  return l.join('\n') + '\n';
}

/** Fins de ligne normalisées avant comparaison : sans cela la garde mesurerait `core.autocrlf`. */
function normaliserFins(t: string): string {
  return t.replace(/\r\n/g, '\n');
}

/** Le nombre d'exigences qu'un texte de vue ANNONCE — l'unité du domaine (REQ-GOV-032). */
export function exigencesAnnoncees(vue: string): number {
  return (vue.match(/^- \*\*REQ-[A-Z]+-\d+\*\*/gm) ?? []).length;
}

if (process.argv.includes('--render') || process.argv.includes('--verifie-rendu')) {
  const fautes = controler(doc, schema, taches);
  if (fautes.length > 0) {
    console.error(
      `❌ Refus de rendre une vue d'un registre fautif (${fautes.length}). Lance \`pnpm gov:requirements\`.`
    );
    process.exit(1);
  }

  const rendu = rendreVue(doc.exigences);

  if (process.argv.includes('--verifie-rendu')) {
    if (!existsSync(CHEMIN_VUE)) {
      console.error(
        `❌ gov:requirements — vue_absente : ${CHEMIN_VUE} n'existe pas, alors que ${CHEMIN_REGISTRE} ` +
          `porte ${doc.exigences.length} exigence(s). Lance \`pnpm gov:requirements --render\` et commite.`
      );
      process.exit(1);
    }
    const surDisque = normaliserFins(readFileSync(CHEMIN_VUE, 'utf8'));
    if (surDisque !== normaliserFins(rendu)) {
      const vues = exigencesAnnoncees(surDisque);
      const reelles = exigencesAnnoncees(rendu);
      const ecart =
        vues === reelles
          ? `Le compte d'exigences est le même (${reelles}) : la dérive porte sur autre chose — ` +
            `un texte, une source, une phase, une tâche porteuse.`
          : `La vue annonce ${vues} exigence(s), le registre en porte ${reelles} — ` +
            `${Math.abs(reelles - vues)} d'écart.`;
      console.error(
        `❌ gov:requirements — vue_perimee : ${CHEMIN_VUE} n'est plus ce que ${CHEMIN_REGISTRE} produit.\n` +
          `   ${ecart}\n` +
          `   La vue ne se corrige pas à la main : lance \`pnpm gov:requirements --render\` et commite.`
      );
      process.exit(1);
    }
    console.log(
      `✅ gov:requirements — ${CHEMIN_VUE} est égal à ce que ${CHEMIN_REGISTRE} produit : ` +
        `${doc.exigences.length} exigences.`
    );
    process.exit(0);
  }

  writeFileSync(CHEMIN_VUE, rendu);
  console.log(
    `✅ ${CHEMIN_VUE} rendu depuis ${CHEMIN_REGISTRE} — ${doc.exigences.length} exigences, ` +
      `${MODULES.length} modules, ${ETAPES.length} étapes.`
  );
  process.exit(0);
}

// ── mode --prove ─────────────────────────────────────────────────────────────
if (process.argv.includes('--prove')) {
  const base = controler(doc, schema, taches);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un registre DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const copie = (): { exigences: Exigence[] } => JSON.parse(JSON.stringify(doc)) as { exigences: Exigence[] };
  const active = (d: { exigences: Exigence[] }): Exigence => d.exigences.find((e) => e.statut === 'active')!;
  const absorbee = (d: { exigences: Exigence[] }): Exigence => d.exigences.find((e) => e.statut === 'absorbee')!;

  const TEMOINS: { famille: string; defaut: () => [{ exigences: Exigence[] }, Tache[]] }[] = [
    { famille: 'schema', defaut: () => { const d = copie(); (active(d) as unknown as { module: number }).module = 99; return [d, taches]; } },
    { famille: 'id_double', defaut: () => { const d = copie(); d.exigences.push(JSON.parse(JSON.stringify(active(d))) as Exigence); return [d, taches]; } },
    { famille: 'source_vide', defaut: () => { const d = copie(); active(d).source = ''; return [d, taches]; } },
    { famille: 'remplacante_inconnue', defaut: () => { const d = copie(); absorbee(d).remplaceePar = 'REQ-ZZZ-999'; return [d, taches]; } },
    { famille: 'absorption_en_chaine', defaut: () => { const d = copie(); const a = absorbee(d); const b = d.exigences.find((e) => e.statut === 'absorbee' && e.id !== a.id)!; a.remplaceePar = b.id; return [d, taches]; } },
    { famille: 'module_sans_exigence', defaut: () => { const d = copie(); for (const e of d.exigences) if (e.module === 6) e.module = null; return [d, taches]; } },
    { famille: 'etape_sans_exigence', defaut: () => { const d = copie(); for (const e of d.exigences) if (e.etape === 3) e.etape = null; return [d, taches]; } },
    { famille: 'exigence_citee_non_definie', defaut: () => { const t = JSON.parse(JSON.stringify(taches)) as Tache[]; t[0]!.reqs = [...t[0]!.reqs, 'REQ-ZZZ-998']; return [copie(), t]; } },
    { famille: 'exigence_sans_porteur', defaut: () => { const d = copie(); const e = active(d); const t = (JSON.parse(JSON.stringify(taches)) as Tache[]).map((x) => ({ ...x, reqs: x.reqs.filter((r) => r !== e.id) })); e.taches = []; e.phase = null; return [d, t]; } },
    { famille: 'phase_non_derivee', defaut: () => { const d = copie(); active(d).phase = 3; return [d, taches]; } },
    { famille: 'taches_non_derivees', defaut: () => { const d = copie(); active(d).taches = ['GOV-000']; return [d, taches]; } },
  ];

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const [d, tk] = t.defaut();
    const f = controler(d, schema, tk);
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
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
const fautes = controler(doc, schema, taches);
if (fautes.length === 0) {
  const e = doc.exigences;
  const n = (s: string) => e.filter((x) => x.statut === s).length;
  const mods = new Set(e.map((x) => x.module).filter((m) => m !== null)).size;
  const etps = new Set(e.map((x) => x.etape).filter((s) => s !== null)).size;
  console.log(`✅ gov:requirements — ${e.length} exigences (${n('active')} actives, ${n('absorbee')} absorbées, ${n('retiree')} retirée).`);
  console.log(`   ${mods}/${NB_MODULES} modules et ${etps}/${NB_ETAPES} étapes couverts · ${e.filter((x) => x.taches.length > 0).length} exigences portées par une tâche.`);
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:requirements — ${fautes.length} incohérence(s) dans ${CHEMIN_REGISTRE} :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
