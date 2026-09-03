/**
 * gov-requirements.ts — la garde du registre d'exigences (GOV-001, REQ-GOV-001 / REQ-GOV-026).
 *
 * USAGE : pnpm gov:requirements           (échoue si le registre est invalide ou incohérent)
 *         pnpm gov:requirements --prove   (injecte un défaut PAR FAMILLE et vérifie que chacun rougit)
 *
 * `docs/requirements.json` est la SOURCE ; `docs/REQUIREMENTS.md` en est une vue générée.
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
 *   — la `phase` : elle est DÉRIVÉE de la plus précoce des tâches porteuses, jamais saisie.
 */

import { readFileSync, existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const CHEMIN_REGISTRE = 'docs/requirements.json';
const CHEMIN_SCHEMA = 'scripts/lot/requirements.schema.json';
const CHEMIN_TACHES = 'docs/tasks.json';

/** Les 21 modules et les 12 étapes de l'audit du 2026-09-03. Le compte est l'invariant. */
const NB_MODULES = 21;
const NB_ETAPES = 12;

type Exigence = {
  id: string;
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
