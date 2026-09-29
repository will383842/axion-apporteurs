// @req REQ-GOV-013
/**
 * LE CHAMP `schema` D'UNE TÂCHE EST CONFRONTÉ À SES `paths` (GOV-093).
 *
 * LE DÉFAUT. Le champ `schema` est LU — le décideur de `scripts/lot/revues.ts` force la lentille
 * `schema` dès qu'une tâche le porte à vrai — mais RIEN ne le confrontait aux `paths` de la
 * tâche : une tâche dont un chemin tombe sous les chemins de schéma de la charte pouvait porter
 * `schema: false` sans qu'aucune garde rougisse. Le bon comportement tenait alors au diff, pas
 * au registre.
 *
 * CE QUE CE FICHIER TIENT. (1) Une famille de `gov:tasks` rougit sur `schema` non vrai avec un
 * chemin de schéma, en nommant le chemin ; les chemins viennent de la §7 de la charte, jamais
 * d'une liste. (2) La réciproque — `schema: true` sans chemin de schéma — n'est PAS refusée,
 * elle est IMPRIMÉE avec son compte et son motif. (3) Témoin rouge et contre-témoin vert par
 * famille, dont celui d'une tâche SANS `paths`, qui ne rougit pas par vacuité.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { controler, schemaSansChemin, type Tache } from '../../../scripts/gates/gov-tasks';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';
import { cheminsSchema, touche } from '../../../scripts/lot/revues';

const SCHEMA = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;
const REGISTRE = chargerRegistre(CHEMIN_REGISTRE);
const CHEMINS = cheminsSchema();
const FAMILLE = 'schema_champ_faux';

function backlog(): { version: number; taches: Tache[] } {
  return JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    version: number;
    taches: Tache[];
  };
}
/**
 * Une tâche `a_faire`, la seule mutée : rien d'autre ne doit rougir (RM-11). Elle ne porte AUCUN
 * chemin de schéma : sinon, passer son `schema` à faux ferait rougir ses propres chemins, et le témoin
 * compterait plus d'une faute (mesuré le 2026-09-29 : QA-T06, première tâche `a_faire`, porte
 * `prisma/seed.ts`).
 */
function aFaire(d: { taches: Tache[] }): Tache {
  return d.taches.find(
    (t) =>
      t.statut === 'a_faire' &&
      t.repo === 'partners' &&
      !(t.paths ?? []).some((p) => CHEMINS.some((c) => touche(c, [p])))
  )!;
}
const deLaFamille = (d: unknown, chemins: readonly string[] = CHEMINS) =>
  controler(d, SCHEMA, REGISTRE, chemins).filter((f) => f.famille === FAMILLE);

describe('REQ-GOV-013 — `schema` non vrai avec un chemin de schéma : REFUSÉ, chemin nommé', () => {
  it('REQ-GOV-013 — les chemins de schéma sont DÉRIVÉS de la charte, et non vides', () => {
    expect(CHEMINS.length).toBeGreaterThan(0);
  });

  it('REQ-GOV-013 — TÉMOIN ROUGE : `schema: false` et un chemin sous la charte rougit en le nommant', () => {
    const d = backlog();
    const t = aFaire(d);
    const fautif = `${CHEMINS[0]}schema.prisma`;
    t.schema = false;
    t.paths = [...t.paths, fautif];
    const f = deLaFamille(d);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain(t.id);
    expect(f[0]!.message).toContain(fautif);
  });

  it('REQ-GOV-013 — TÉMOIN : le champ ABSENT vaut « non vrai », il rougit aussi', () => {
    const d = backlog();
    const t = aFaire(d) as Partial<Tache> & Tache;
    delete (t as { schema?: boolean }).schema;
    t.paths = [...t.paths, `${CHEMINS[CHEMINS.length - 1]}events.ts`];
    expect(deLaFamille(d)).toHaveLength(1);
  });

  it('REQ-GOV-013 — la liste est LUE : d’autres chemins de schéma changent le verdict', () => {
    const d = backlog();
    const t = aFaire(d);
    t.schema = false;
    t.paths = ['src/temoin-gov-093/ailleurs.ts'];
    expect(deLaFamille(d)).toEqual([]);
    expect(deLaFamille(d, ['src/temoin-gov-093/'])).toHaveLength(1);
  });

  it('REQ-GOV-013 — CONTRE-TÉMOIN VERT : `schema: true` avec le même chemin ne rougit pas', () => {
    const d = backlog();
    const t = aFaire(d);
    t.schema = true;
    t.paths = [...t.paths, `${CHEMINS[0]}schema.prisma`];
    expect(deLaFamille(d)).toEqual([]);
  });

  it('REQ-GOV-013 — CONTRE-TÉMOIN VERT : une tâche SANS `paths` ne rougit pas par vacuité', () => {
    const d = backlog();
    const t = aFaire(d);
    t.schema = false;
    t.paths = [];
    expect(deLaFamille(d)).toEqual([]);
  });

  it('REQ-GOV-013 — le backlog du dépôt ne porte aucun champ `schema` faux', () => {
    expect(deLaFamille(backlog()).map((f) => f.message)).toEqual([]);
  });
});

describe('REQ-GOV-013 — la RÉCIPROQUE est imprimée, pas refusée', () => {
  it('REQ-GOV-013 — TÉMOIN : `schema: true` sans chemin de schéma est LISTÉ, et ne fait pas rougir', () => {
    const d = backlog();
    const t = aFaire(d);
    t.schema = true;
    t.paths = ['src/temoin-gov-093/ailleurs.ts'];
    expect(schemaSansChemin(d.taches, CHEMINS)).toContain(t.id);
    expect(deLaFamille(d)).toEqual([]);
  });

  it('REQ-GOV-013 — CONTRE-TÉMOIN : `schema: true` avec un chemin de schéma n’est pas listé', () => {
    const d = backlog();
    const t = aFaire(d);
    t.schema = true;
    t.paths = [`${CHEMINS[0]}schema.prisma`];
    expect(schemaSansChemin(d.taches, CHEMINS)).not.toContain(t.id);
  });

  it('REQ-GOV-013 — le binaire imprime la réciproque avec son COMPTE et ses identifiants, et sort 0', () => {
    const attendues = schemaSansChemin(backlog().taches, CHEMINS);
    const sortie = execFileSync('npx', ['tsx', 'scripts/gates/gov-tasks.ts'], {
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true,
    });
    expect(sortie).toContain(`SCHÉMA DÉCLARÉ SANS CHEMIN DE SCHÉMA — ${attendues.length} tâche(s)`);
    for (const id of attendues) expect(sortie).toContain(id);
  }, 120_000);

  it('REQ-GOV-013 — `--prove` fait rougir la famille sur son témoin', () => {
    const sortie = execFileSync('npx', ['tsx', 'scripts/gates/gov-tasks.ts', '--prove'], {
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true,
    });
    expect(sortie).toContain(`• ${FAMILLE}`);
  }, 120_000);
});
