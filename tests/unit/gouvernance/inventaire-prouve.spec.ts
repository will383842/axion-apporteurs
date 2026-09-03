// @req REQ-GOV-026
/**
 * L'inventaire prouvé — la garde `gov:inventaire` (GOV-020, REQ-GOV-026).
 *
 * CE QUE REQ-GOV-026 DEMANDE, ET LE TROU QU'ELLE NOMME. Un état d'avancement au-delà de
 * « spécifié » est une affirmation sur le monde : du code existe quelque part. Aujourd'hui
 * `docs/tasks.json` porte douze tâches `fusionnee` dont les `paths[]` sont des marque-place
 * (`docs/gouvernance/GOV-004`, qui n'existe sur aucun disque) : l'affirmation ne pointe vers
 * rien. La garde exige donc, pour tout état au moins égal à « codé », une preuve qui RÉSOUT —
 * un chemin de fichier présent, ou un SHA de commit que `git` retrouve.
 *
 * POURQUOI CE FICHIER PLUTÔT QU'UN CONTRÔLE DANS `gardes.spec.ts`. `tests/unit/gouvernance/
 * gardes.spec.ts` est un fichier partagé par sept tâches (`docs/paths-proposes.json`) : deux
 * sessions qui l'écrivent en parallèle s'effacent. GOV-020 pose donc son propre fichier.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

const GARDE = 'scripts/gates/gov-inventaire.ts';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', GARDE, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Le mode `--rapport` rend en JSON ce que le mode normal résume en prose. */
type Rapport = {
  legende: string[];
  statutsDuSchema: string[];
  statutsSansRang: string[];
  taches: { id: string; statut: string; avancement: string | null; preuves: string[] }[];
  chantiers: { etiquette: string; referentResolu: boolean; etat: string | null; preuves: string[] }[];
  etiquettesDeLaReq: string[];
};

function rapport(): Rapport {
  const { code, sortie } = lancer('--rapport');
  expect(code, `--rapport doit sortir 0 ; sortie :\n${sortie}`).toBe(0);
  // On decoupe du PREMIER `{` au DERNIER `}`, et pas seulement a partir du premier.
  //
  // `lancer()` concatene stdout ET stderr. Sous `pnpm test`, les variables `npm_config_*` fuient
  // dans le `npx` fils, qui ecrit alors « npm warn Unknown env config "reporter" » sur stderr —
  // APRES la charge utile. Le `slice(debut)` seul rendait donc :
  //     Unexpected non-whitespace character after JSON at position 33922
  // c'est-a-dire un rouge qui ne dit rien du code, et qui n'apparait que sous `pnpm test` :
  // `npx vitest run` sur le meme arbre etait vert. Encore un instrument qui ment, et qui ment
  // dans le sens ou l'on relance au lieu de lire.
  const debut = sortie.indexOf('{');
  const fin = sortie.lastIndexOf('}');
  expect(debut, `aucun JSON dans la sortie :
${sortie}`).toBeGreaterThanOrEqual(0);
  return JSON.parse(sortie.slice(debut, fin + 1)) as Rapport;
}

describe('gov:inventaire — la preuve de tout état ≥ « codé »', () => {
  it("REQ-GOV-026 — la garde est verte sur l'état du dépôt", () => {
    const { code, sortie } = lancer();
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-026 — la garde sait rougir : ses 7 familles ont chacune un témoin, et ses contre-témoins restent verts', () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('Les 7 familles rougissent');
    // Un témoin prouve qu'une garde SAIT rougir ; seul un contre-témoin prouve qu'elle ne rougit
    // pas sur du légitime. Sans eux, « prouvée » ne veut rien dire (RM-02).
    expect(sortie).toContain('contre-témoin');
    const familles = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(familles.length).toBe(7);
  });
});

describe('REQ-GOV-026 — un seul vocabulaire : la légende est DÉRIVÉE des statuts du backlog', () => {
  it("REQ-GOV-026 — les sept états de la légende sont écrits sans accent, dans l'ordre du plus faible au plus fort", () => {
    expect(rapport().legende).toEqual([
      'specifie',
      'code',
      'teste',
      'revu',
      'fusionne',
      'deploye',
      'verifie_en_prod',
    ]);
  });

  it("REQ-GOV-026 — chaque statut de `tasks.schema.json` porte un rang : aucun dixième statut ne peut entrer sans qu'on décide de son avancement", () => {
    const r = rapport();
    // La liste des statuts n'est PAS retapée ici (RM-01) : elle est lue dans le schéma par la
    // garde, et le test vérifie qu'aucun n'est resté sans rang.
    expect(r.statutsDuSchema.length).toBeGreaterThan(0);
    expect(r.statutsSansRang).toEqual([]);
  });
});

describe('REQ-GOV-026 — la preuve des tâches déjà livrées', () => {
  it('REQ-GOV-026 — toute tâche en état ≥ « codé » porte au moins une preuve qui résout (chemin présent ou SHA retrouvé)', () => {
    const r = rapport();
    const avancees = r.taches.filter((t) => t.avancement !== null && r.legende.indexOf(t.avancement) >= r.legende.indexOf('code'));
    expect(avancees.length).toBeGreaterThanOrEqual(12);
    const sansPreuve = avancees.filter((t) => t.preuves.length === 0).map((t) => `${t.id} (${t.statut})`);
    expect(sansPreuve).toEqual([]);
  });

  it("REQ-GOV-026 — une tâche seulement revendiquée (`en_cours`) n'est PAS réputée codée : le rang d'un statut est le plancher qu'il garantit", () => {
    const r = rapport();
    for (const t of r.taches.filter((x) => x.statut === 'en_cours')) {
      expect(t.avancement).toBe('specifie');
    }
    // Et le barème lui-même le dit, indépendamment du contenu du backlog du jour.
    const { sortie } = lancer('--rapport');
    expect(sortie).toContain('"en_cours"');
  });
});

describe('REQ-GOV-026 — l’inventaire des huit chantiers', () => {
  it("REQ-GOV-026 — l'inventaire porte exactement les huit étiquettes que REQ-GOV-026 nomme, ni plus ni moins", () => {
    const r = rapport();
    expect(r.etiquettesDeLaReq.length).toBe(8);
    expect(r.chantiers.map((c) => c.etiquette).sort()).toEqual([...r.etiquettesDeLaReq].sort());
  });

  it("REQ-GOV-026 — une étiquette dont ce dépôt ne résout pas le référent ne porte AUCUN état : une preuve inventée est pire qu'une preuve absente", () => {
    const r = rapport();
    const inventes = r.chantiers.filter((c) => !c.referentResolu && c.etat !== null);
    expect(inventes.map((c) => c.etiquette)).toEqual([]);
    // Et le dépôt ne résout pas tout : si un jour il résout les huit, ce test cesse d'être
    // significatif et doit être remplacé par la vérification des huit référents.
    expect(r.chantiers.filter((c) => !c.referentResolu).length).toBeGreaterThan(0);
  });

  it('REQ-GOV-026 — tout chantier en état ≥ « codé » porte une preuve qui résout', () => {
    const r = rapport();
    const avances = r.chantiers.filter((c) => c.etat !== null && r.legende.indexOf(c.etat) >= r.legende.indexOf('code'));
    expect(avances.length).toBeGreaterThan(0);
    expect(avances.filter((c) => c.preuves.length === 0).map((c) => c.etiquette)).toEqual([]);
  });
});
