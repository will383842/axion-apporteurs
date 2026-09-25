/**
 * GOV-096 — `gov:pr` doit savoir lire une PR de LOT.
 *
 * @req REQ-GOV-021
 * @req REQ-GOV-007
 *
 * 🔴 LE DÉFAUT, MESURÉ LE 2026-09-23 SUR LA PR #114. Cette PR porte SIX tâches sur une branche,
 * un commit par tâche (`docs/CONVENTIONS.md` §5 : « un lot, une branche, une PR, un commit par
 * tâche »). `pnpm gov:pr -- --pr 114` rougit sur `fichier_hors_paths_des_taches` en nommant douze
 * fichiers de code « qu'aucune de ses tâches ne déclare », alors que neuf d'entre eux sont
 * déclarés — par les CINQ AUTRES tâches du lot.
 *
 * La cause est dans l'ENTRÉE de la dérivation unique, pas dans la famille : `tachesDeLaPr()`
 * apparie une tâche à une PR sur `t.pr === <numéro>` OU sur l'identifiant du TITRE. Or le titre
 * d'une PR de lot ne peut nommer qu'UNE tâche, et `t.pr` n'est écrit que par `pnpm lot:cloture`,
 * qui ne tourne qu'APRÈS la fusion (`fusion.atterri === true`). Les cinq autres tâches ne
 * résolvent donc ni par l'un ni par l'autre, et leurs `paths` sont invisibles.
 *
 * ⛔ LE CONTOURNEMENT QUE LA GARDE PROPOSE EST UN FAUX, et c'est ce qui rend ce défaut bloquant
 * plutôt que gênant : son message prescrit d'ajouter les douze chemins aux `paths` de la tâche du
 * titre. Ce serait écrire que la tâche du titre touche des fichiers qui appartiennent à cinq
 * autres tâches — et la disjonction des lots, calculée sur ces mêmes `paths`, ne voudrait plus
 * rien dire. Le lead du lot a refusé de le faire.
 *
 * CE QUI EST LIVRÉ, ET CE QUE CHAQUE BLOC GARDE.
 *
 *   (A) LE CHAMP `Lot:` EXISTE DANS LE GABARIT, à la section Identité, à côté d'`Auteur:`, de
 *       `Relecteur:` et de `Couvre:` — et `CHAMPS` le garde comme les autres, sans quoi il
 *       disparaîtrait du gabarit sans que rien ne rougisse.
 *
 *   (B) `lireLeLot()` NE REND JAMAIS UNE LISTE VIDE EN SILENCE. Un champ mal formé — séparateur
 *       inattendu, virgule en trop, identifiant collé à autre chose — est NOMMÉ. Une liste vide
 *       rendue avec le code zéro n'est pas une réponse : c'est exactement GOV-082.
 *
 *   (C) `tachesDeLaPr()` RÉSOUT PAR L'UNION DES TROIS : `t.pr === <numéro>`, l'identifiant du
 *       titre, les identifiants déclarés dans `Lot:`. La monotonie que le docblock de cette
 *       fonction nomme est préservée : un renseignement de plus ne peut que faire GROSSIR
 *       l'ensemble, donc la garde — qui en sait le plus — obtient toujours un sur-ensemble de ce
 *       que le composeur du corps voit.
 *
 *   (D) TROIS REFUS NOMMÉS, jamais un silence : un identifiant que le registre ne connaît pas ;
 *       un identifiant déjà livré (une PR ne rouvre pas une tâche livrée) ; un identifiant qui
 *       porte DÉJÀ un `pr` différent — deux PR ne se disputent pas une tâche, ce que REQ-GOV-007
 *       exige en toutes lettres et que `gov:etat` nomme `deux_pr_meme_tache` sur l'AUTRE
 *       population (deux PR ouvertes de la forge). La règle est nommée une fois ; ce sont ses
 *       deux observatoires qui diffèrent.
 *
 *   (E) `Lot:` VIDE OU ABSENT — le cas de la très grande majorité des PR — laisse le
 *       comportement INCHANGÉ. Le contre-témoin le prouve ; sans lui, on ne saurait pas si le
 *       vert vient de la règle ou de sa disparition.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { LIVREE } from '../../../scripts/lot/avancement';
import { cheminsDeLaTache, type TacheDeLot } from '../../../scripts/lot/chemins-de-tache';
import { lireLeLot, resoudreLeLot, tachesDeLaPr } from '../../../scripts/lot/revues';

const CHEMIN_GABARIT = '.github/PULL_REQUEST_TEMPLATE.md';
const CHEMIN_GARDE = 'scripts/gates/gov-pr.ts';

type TacheDuRegistre = TacheDeLot & {
  pr?: number | null;
  statut?: string | null;
  schema?: boolean;
  sensible?: readonly string[] | null;
  zone?: string | null;
};

const REGISTRE = (
  JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheDuRegistre[] }
).taches;

/**
 * LES SIX TÂCHES DE LA PR #114, telles que son corps les nomme. C'est une FIXTURE, et elle est
 * confrontée au registre avant tout usage (RM-03, RM-11) : si l'une d'elles disparaissait, le
 * rejeu ne mesurerait plus rien et le test le DIT au lieu de verdir.
 */
const LOT_L0_02 = ['GOV-046', 'GOV-048', 'GOV-076', 'GOV-078', 'GOV-082', 'GOV-086'] as const;
/** La tâche que le TITRE de la PR #114 nomme — la seule que la garde résolvait. */
const TITRE_DE_LA_PR_114 = 'GOV-082';

function tache(id: string): TacheDuRegistre {
  const t = REGISTRE.find((x) => x.id === id);
  if (!t) {
    throw new Error(
      `GOV-096 — la tâche ${id} a disparu de docs/tasks.json : le rejeu de la PR #114 ne mesure ` +
        `plus rien, et un vert ne prouverait que l'absence de mesure.`
    );
  }
  return t;
}

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', CHEMIN_GARDE, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Un corps de PR minimal portant la ligne donnée — on ne teste ici QUE la lecture du champ. */
const corpsAvec = (ligne: string): string =>
  ['## Identité', '', 'Auteur: A05', 'Relecteur: A09 exactitude', ligne, '', 'fin'].join('\n');

// ── (A) le champ du gabarit ──────────────────────────────────────────────────

describe('REQ-GOV-021 — le gabarit de PR porte un champ `Lot:`', () => {
  it('REQ-GOV-021 — le champ `Lot:` est une ligne au ras de la marge, vide par défaut', () => {
    const gabarit = readFileSync(CHEMIN_GABARIT, 'utf8');
    expect(gabarit).toMatch(/^Lot:[ \t]*$/m);
  });

  it('REQ-GOV-021 — le champ est dans la section Identité, avec `Auteur:` et `Couvre:`', () => {
    const gabarit = readFileSync(CHEMIN_GABARIT, 'utf8');
    const identite = gabarit.slice(gabarit.indexOf('## Identité'), gabarit.indexOf('## Ce que'));
    expect(identite).toMatch(/^Auteur:/m);
    expect(identite).toMatch(/^Couvre:/m);
    expect(identite).toMatch(/^Lot:/m);
  });

  it('REQ-GOV-021 — `CHAMPS` le garde comme les autres : il ne peut plus disparaître en silence', () => {
    const garde = readFileSync(CHEMIN_GARDE, 'utf8');
    const champs = /const CHAMPS = \[([\s\S]*?)\];/.exec(garde);
    expect(champs, 'CHAMPS est introuvable dans la garde').not.toBeNull();
    expect(champs![1]).toContain("'Lot:'");
  });
});

// ── (B) la lecture du champ ──────────────────────────────────────────────────

describe('REQ-GOV-021 — `lireLeLot()` ne rend jamais une liste vide en silence', () => {
  it('REQ-GOV-021 — champ ABSENT : non déclaré, aucun identifiant, aucun refus', () => {
    const lu = lireLeLot(corpsAvec('Couvre: REQ-GOV-021'));
    expect(lu.present).toBe(false);
    expect(lu.ids).toEqual([]);
    expect(lu.malForme).toBeNull();
  });

  it('REQ-GOV-021 — champ VIDE : déclaré, aucun identifiant, aucun refus (comportement inchangé)', () => {
    const lu = lireLeLot(corpsAvec('Lot:'));
    expect(lu.present).toBe(true);
    expect(lu.ids).toEqual([]);
    expect(lu.malForme).toBeNull();
  });

  it('REQ-GOV-021 — les identifiants sont séparés par des virgules, espaces tolérés', () => {
    expect(lireLeLot(corpsAvec('Lot: GOV-046, GOV-048')).ids).toEqual(['GOV-046', 'GOV-048']);
    expect(lireLeLot(corpsAvec('Lot: GOV-046,GOV-048')).ids).toEqual(['GOV-046', 'GOV-048']);
  });

  it('REQ-GOV-021 — un séparateur inattendu est NOMMÉ, jamais avalé en liste vide', () => {
    const espace = lireLeLot(corpsAvec('Lot: GOV-046 GOV-048'));
    expect(espace.ids).toEqual([]);
    expect(espace.malForme).toContain('GOV-046 GOV-048');

    const pointVirgule = lireLeLot(corpsAvec('Lot: GOV-046; GOV-048'));
    expect(pointVirgule.ids).toEqual([]);
    expect(pointVirgule.malForme).toContain('GOV-046;');
  });

  it('REQ-GOV-021 — une virgule en trop est un défaut de forme, pas un identifiant vide', () => {
    const enTrop = lireLeLot(corpsAvec('Lot: GOV-046,, GOV-048'));
    expect(enTrop.ids).toEqual([]);
    expect(enTrop.malForme).not.toBeNull();

    const finale = lireLeLot(corpsAvec('Lot: GOV-046,'));
    expect(finale.ids).toEqual([]);
    expect(finale.malForme).not.toBeNull();
  });
});

// ── (C) la dérivation unique résout par le lot ───────────────────────────────

describe('REQ-GOV-021 — `tachesDeLaPr()` résout aussi par les identifiants du champ `Lot:`', () => {
  it('REQ-GOV-021 — sans `Lot:`, seule la tâche du titre : le comportement d’aujourd’hui', () => {
    const resolues = tachesDeLaPr(REGISTRE, 114, TITRE_DE_LA_PR_114, []).map((t) => t.id);
    expect(resolues).toEqual([TITRE_DE_LA_PR_114]);
  });

  it('REQ-GOV-021 — avec `Lot:`, les six tâches de la PR #114 résolvent', () => {
    for (const id of LOT_L0_02) expect(tache(id).id).toBe(id);
    const resolues = tachesDeLaPr(REGISTRE, 114, TITRE_DE_LA_PR_114, [...LOT_L0_02]).map(
      (t) => t.id
    );
    expect([...resolues].sort()).toEqual([...LOT_L0_02].sort());
  });

  it('REQ-GOV-021 — les chemins déclarés par le lot couvrent ce que le titre seul laissait orphelin', () => {
    const parLeTitre = new Set(
      tachesDeLaPr(REGISTRE, 114, TITRE_DE_LA_PR_114, []).flatMap((t) => cheminsDeLaTache(t))
    );
    const parLeLot = new Set(
      tachesDeLaPr(REGISTRE, 114, TITRE_DE_LA_PR_114, [...LOT_L0_02]).flatMap((t) =>
        cheminsDeLaTache(t)
      )
    );
    // MONOTONIE : un renseignement de plus ne peut que faire GROSSIR l'ensemble.
    for (const c of parLeTitre) expect(parLeLot.has(c)).toBe(true);
    expect(parLeLot.size).toBeGreaterThan(parLeTitre.size);
    // Le fichier que la mesure du 2026-09-23 nommait en tête des douze orphelins : la garde de la
    // PR elle-même, déclarée par GOV-078 — une des cinq tâches que le titre ne pouvait pas nommer.
    expect(parLeTitre.has(CHEMIN_GARDE)).toBe(false);
    expect(parLeLot.has(CHEMIN_GARDE)).toBe(true);
  });
});

// ── (D) les trois refus, chacun nommé ────────────────────────────────────────

describe('REQ-GOV-007 — un `Lot:` ne résout que ce qui lui appartient', () => {
  const resoudre = (valeur: string, numero: number | null, taches = REGISTRE) =>
    resoudreLeLot({
      corps: corpsAvec(`Lot: ${valeur}`),
      numero,
      taches,
      livrees: LIVREE,
    });

  it('REQ-GOV-021 — un identifiant que le registre ne connaît pas est REFUSÉ, jamais ignoré', () => {
    const r = resoudre('GOV-999', 114);
    expect(r.ids).toEqual([]);
    expect(r.refus.map((x) => x.famille)).toContain('lot_tache_inconnue');
    expect(r.refus.map((x) => x.message).join(' ')).toContain('GOV-999');
  });

  it('REQ-GOV-021 — un identifiant déjà LIVRÉ est refusé : une PR ne rouvre pas une tâche livrée', () => {
    const livree = REGISTRE.find((t) => LIVREE.has(String(t.statut)));
    expect(livree, 'aucune tâche livrée au registre : le témoin ne mesure rien').toBeDefined();
    const r = resoudre(livree!.id, 114);
    expect(r.ids).toEqual([]);
    expect(r.refus.map((x) => x.famille)).toContain('lot_tache_livree');
  });

  it('REQ-GOV-007 — un identifiant qui porte un `pr` DIFFÉRENT est refusé : deux PR ne se disputent pas une tâche', () => {
    const taches = REGISTRE.map((t) =>
      t.id === TITRE_DE_LA_PR_114 ? { ...t, pr: 4242, statut: 'a_faire' } : t
    );
    const r = resoudre(TITRE_DE_LA_PR_114, 114, taches);
    expect(r.ids).toEqual([]);
    expect(r.refus.map((x) => x.famille)).toContain('deux_pr_meme_tache');
    expect(r.refus.map((x) => x.message).join(' ')).toContain('4242');
  });

  it('REQ-GOV-021 — le champ mal formé est refusé, et la liste rendue reste VIDE', () => {
    const r = resoudre('GOV-046 GOV-048', 114);
    expect(r.ids).toEqual([]);
    expect(r.refus.map((x) => x.famille)).toContain('lot_mal_forme');
  });

  it('REQ-GOV-021 — `Lot:` vide ou absent : aucun refus, aucun identifiant (contre-témoin)', () => {
    const vide = resoudreLeLot({
      corps: corpsAvec('Lot:'),
      numero: 114,
      taches: REGISTRE,
      livrees: LIVREE,
    });
    expect(vide.ids).toEqual([]);
    expect(vide.refus).toEqual([]);

    const absent = resoudreLeLot({
      corps: corpsAvec('Couvre: REQ-GOV-021'),
      numero: 114,
      taches: REGISTRE,
      livrees: LIVREE,
    });
    expect(absent.ids).toEqual([]);
    expect(absent.refus).toEqual([]);
  });

  it('REQ-GOV-021 — les six tâches de la PR #114 passent les trois refus', () => {
    const r = resoudre(LOT_L0_02.join(', '), 114);
    expect(r.refus).toEqual([]);
    expect([...r.ids].sort()).toEqual([...LOT_L0_02].sort());
  });
});

// ── (E) la garde elle-même ───────────────────────────────────────────────────

describe('REQ-GOV-021 — le banc de `gov:pr` porte les familles neuves', () => {
  it('REQ-GOV-021 — chaque famille neuve a son témoin, et les contre-témoins restent verts', () => {
    const { code, sortie } = lancer('--prove');
    expect(code, sortie).toBe(0);
    for (const famille of [
      'lot_mal_forme',
      'lot_tache_inconnue',
      'lot_tache_livree',
      'deux_pr_meme_tache',
    ]) {
      expect(sortie).toContain(famille);
    }
  });

  it('REQ-GOV-021 — la garde reste VERTE sur l’état du dépôt (contre-témoin du dépôt réel)', () => {
    const { code, sortie } = lancer();
    expect(code, sortie).toBe(0);
  });
});
