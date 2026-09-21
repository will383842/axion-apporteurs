// @req REQ-GOV-007
// @req REQ-QA-013
/**
 * Une demande de fusion de plus ne rougit plus les autres (GOV-059).
 *
 * LE DÉFAUT. `gov:etat` lit les PR ouvertes de TOUT le dépôt, mais ne savait relier une tâche à sa
 * revendication que par le champ `issue` de `docs/tasks.json` — celui de la branche jugée. Chaque
 * branche devait donc recopier la revendication de TOUTES les autres, et la N+1e PR rougissait les N
 * premières jusqu'à ce que chacune porte un commit de « revendication sœur » : coût en carré, et
 * chaque commit sœur changeait la tête et faisait reconfirmer les revues.
 *
 * LA RÉPONSE : la revendication se DÉRIVE de GitHub, que toutes les branches lisent pareil. Une issue
 * OUVERTE dont le titre commence par `<ID> — ` (la forme que pose `scripts/lot/issues.ts`) et qui
 * porte `en_cours` + `owner:<Axx>` revendique `<ID>`, quoi que dise le `docs/tasks.json` de la branche.
 *
 * Le côté GitHub est un faux `gh` écrit ici, qui ne rend QUE les champs demandés par `--json` : la
 * garde ne peut pas lire un titre qu'elle n'a pas demandé. Le côté disque est le dépôt réel.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = 'scripts/gates/gov-etat.ts';
// L'instant se fige par rapport à ce qu'il juge (GOV-032) : ici le journal RÉEL, donc le jour même.
const MAINTENANT = `${new Date().toISOString().slice(0, 10)}T12:00:00Z`;

const DOSSIER = mkdtempSync(join(tmpdir(), 'gov-etat-faux-gh-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));

const FAUX_GH = join(DOSSIER, 'faux-gh.cjs');
writeFileSync(
  FAUX_GH,
  `const fs = require('node:fs');
const f = JSON.parse(fs.readFileSync(process.env.GOV_ETAT_FAUX, 'utf8'));
const a = process.argv.slice(2);
const i = a.indexOf('--json');
const champs = i >= 0 ? a[i + 1].split(',') : [];
let liste;
if (a[0] === 'pr' && a.includes('open')) liste = f.prOuvertes;
else if (a[0] === 'pr' && a.includes('merged')) liste = [];
else if (a[0] === 'issue' && a.includes('open')) liste = f.issues;
else { console.error('faux gh : appel inattendu ' + a.join(' ')); process.exit(2); }
const vue = liste.map((o) => Object.fromEntries(champs.filter((c) => c in o).map((c) => [c, o[c]])));
process.stdout.write(JSON.stringify(vue));
`
);
// `GOV_ETAT_GH` est découpé sur les espaces, sans shell : un chemin qui en porterait casserait le banc.
if (/\s/.test(FAUX_GH)) throw new Error(`le dossier temporaire porte un espace : ${FAUX_GH}`);

/**
 * Les tâches du banc sont DÉRIVÉES du `docs/tasks.json` réel : à faire, sans `issue` ni `owner`.
 * C'est exactement la tâche qu'une AUTRE branche a revendiquée : sa revendication n'existe que sur
 * GitHub, jamais dans le fichier de la branche jugée.
 */
const LIBRES = (
  JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: { id: string; statut: string; issue?: number | null; owner?: string | null }[];
  }
).taches
  .filter((t) => t.statut === 'a_faire' && t.issue == null && t.owner == null)
  .map((t) => t.id);
const [T1, T2, T3] = LIBRES as [string, string, string];

type Pr = { number: number; title: string };
type Issue = { number: number; title: string; labels: { name: string }[] };

const labels = (...noms: string[]) => noms.map((name) => ({ name }));
const pr = (number: number, id: string): Pr => ({ number, title: `feat(${id}): la PR de ${id}` });
const revendiquee = (number: number, id: string, owner = 'A05'): Issue => ({
  number,
  title: `${id} — le titre posé par lot:issues`,
  labels: labels('en_cours', `owner:${owner}`),
});

let n = 0;
function lancer(
  prOuvertes: Pr[],
  issues: Issue[]
): { code: number; sortie: string; fautes: string } {
  const fixture = join(DOSSIER, `univers-${n++}.json`);
  writeFileSync(fixture, JSON.stringify({ prOuvertes, issues }));
  const r = spawnSync('npx', ['tsx', SCRIPT, '--now', MAINTENANT], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, GOV_ETAT_GH: `node ${FAUX_GH}`, GOV_ETAT_FAUX: fixture },
  });
  const sortie = (r.stdout ?? '') + (r.stderr ?? '');
  return { code: r.status ?? 1, sortie, fautes: sortie.slice(sortie.indexOf('❌') + 1) };
}

const TROIS_PR = [pr(9001, T1), pr(9002, T2), pr(9003, T3)];
const TROIS_ISSUES = [revendiquee(9101, T1), revendiquee(9102, T2), revendiquee(9103, T3)];

// Chaque cas lance la garde dans un sous-processus `tsx` synchrone : jusqu'à une minute sur une machine
// chargée. Le délai est posé ici, pas relâché pour toute la suite.
describe(
  'REQ-GOV-007 — la revendication se dérive de GitHub, pas de la copie de chaque branche',
  { timeout: 180_000 },
  () => {
    it('le banc a trois tâches libres à revendiquer', () => {
      expect(LIBRES.length).toBeGreaterThanOrEqual(3);
    });

    it('REQ-GOV-007 — trois PR ouvertes, chacune revendiquée par le seul titre de son issue en cours : zéro défaut', () => {
      const { code, sortie } = lancer(TROIS_PR, TROIS_ISSUES);
      expect(sortie).not.toContain('pr_sur_tache_non_revendiquee');
      expect(sortie).toContain('✅');
      expect(code).toBe(0);
    });

    it('REQ-GOV-007 — une quatrième PR sur une tâche déjà prise rougit, NOMME la PR concurrente, et aucune autre', () => {
      const { code, fautes } = lancer([...TROIS_PR, pr(9004, T1)], TROIS_ISSUES);
      expect(code).not.toBe(0);
      expect(fautes).toContain('deux_pr_meme_tache');
      expect(fautes).toContain('#9001');
      expect(fautes).toContain('#9004');
      // Les deux autres PR, chacune sur sa tâche revendiquée, ne sont nommées par aucune faute.
      expect(fautes).not.toContain('pr_sur_tache_non_revendiquee');
      expect(fautes).not.toContain(T2);
      expect(fautes).not.toContain(T3);
    });

    it('REQ-GOV-007 — un titre qui NOMME une tâche inconnue ne revendique rien, ni par préfixe ni par mention', () => {
      const { code, fautes } = lancer(
        [pr(9001, T1)],
        [
          { ...revendiquee(9101, T1), title: `${T1}b — une tâche qui n'existe pas` },
          {
            ...revendiquee(9102, T1),
            title: `Voir ${T1} — une mention n'est pas un titre de tâche`,
          },
        ]
      );
      expect(code).not.toBe(0);
      expect(fautes).toContain('pr_sur_tache_non_revendiquee');
      expect(fautes).toContain('#9001');
    });

    it('REQ-GOV-007 — une issue titrée mais sans `en_cours` ne revendique pas', () => {
      const { code, fautes } = lancer(
        [pr(9001, T1)],
        [{ ...revendiquee(9101, T1), labels: labels('owner:A05') }]
      );
      expect(code).not.toBe(0);
      expect(fautes).toContain('pr_sur_tache_non_revendiquee');
    });

    it('REQ-GOV-007 — deux issues ouvertes revendiquant la même tâche pour deux owners différents restent une faute', () => {
      const { code, fautes } = lancer(
        [pr(9001, T1)],
        [revendiquee(9101, T1, 'A05'), revendiquee(9102, T1, 'A01')]
      );
      expect(code).not.toBe(0);
      expect(fautes).toContain('revendication_multiple');
      expect(fautes).toContain(T1);
    });
  }
);

describe('REQ-QA-013 — un rouge de `gov:etat` ne fait plus sauter les étapes de mesure', () => {
  /** Les étapes de la porte A, dans l'ordre, chacune avec sa ligne `run:`. */
  function etapes(): { nom: string; run: string }[] {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    return ci
      .split(/^\s+- name: /m)
      .slice(1)
      .map((b) => ({
        nom: b.split('\n')[0]!.trim(),
        run: /^\s+run: (.*)$/m.exec(b)?.[1]?.trim() ?? '',
      }));
  }
  const rang = (run: RegExp) => etapes().findIndex((e) => run.test(e.run));

  it('REQ-QA-013 — lint, format, typecheck, tests et req:check passent AVANT `gov:etat`', () => {
    const iEtat = rang(/^pnpm gov:etat --now /);
    const iPreuve = rang(/^pnpm gov:etat:prove$/);
    expect(iEtat).toBeGreaterThanOrEqual(0);
    expect(iPreuve).toBeGreaterThanOrEqual(0);
    for (const mesure of [
      /^pnpm lint$/,
      /^pnpm format:check$/,
      /^pnpm typecheck$/,
      /^pnpm test$/,
      /^pnpm req:check$/,
    ]) {
      const i = rang(mesure);
      expect(i, String(mesure)).toBeGreaterThanOrEqual(0);
      expect(i, `${String(mesure)} doit précéder gov:etat`).toBeLessThan(iEtat);
      expect(i, `${String(mesure)} doit précéder gov:etat:prove`).toBeLessThan(iPreuve);
    }
  });
});
