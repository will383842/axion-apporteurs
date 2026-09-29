// @req REQ-GOV-006
/**
 * LA PORTE A D'UNE PR NE DÉPEND PAS DES AUTRES PR — GOV-119 (REQ-GOV-006).
 *
 * MESURE DU 2026-09-29, deux fois le même jour : une AUTRE PR fusionne pendant que la porte A
 * d'une PR tourne. `gov:etat` lit cette fusion sur la forge, cherche son commit dans le clone du
 * job, qui a été pris AVANT la fusion, et rougit en `github_illisible`. Le delta de la PR jugée n'y
 * est pour rien.
 *
 * LA RÈGLE : un commit de fusion absent du clone, dont la fusion est POSTÉRIEURE au dernier commit
 * de la branche par défaut que porte ce clone, est hors de ce que la porte peut juger. Il est
 * NOMMÉ et COMPTÉ, jamais tu, et jamais un rouge. Une fusion ANTÉRIEURE dont le commit manque reste
 * une vraie illisibilité : rouge, comme avant.
 *
 * Le banc : la vraie garde, lancée en script sur ce dépôt, avec une forge simulée (`GOV_ETAT_GH`)
 * qui rend une seule PR fusionnée, au commit introuvable, datée selon le cas.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = 'scripts/gates/gov-etat.ts';
const MAINTENANT = `${new Date().toISOString().slice(0, 10)}T12:00:00Z`;
const DOSSIER = mkdtempSync(join(tmpdir(), 'gov-119-faux-gh-'));
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
if (a[0] === 'pr' && a.includes('open')) liste = [];
else if (a[0] === 'pr' && a.includes('merged')) liste = f.fusionnees;
else if (a[0] === 'issue' && a.includes('open')) liste = [];
else { console.error('faux gh : appel inattendu ' + a.join(' ')); process.exit(2); }
const vue = liste.map((o) => Object.fromEntries(champs.filter((c) => c in o).map((c) => [c, o[c]])));
process.stdout.write(JSON.stringify(vue));
`
);
if (/\s/.test(FAUX_GH)) throw new Error(`le dossier temporaire porte un espace : ${FAUX_GH}`);

/** Un commit que ce clone ne porte pas : quarante chiffres hexadécimaux qui ne sont l'empreinte de rien. */
const INTROUVABLE = 'f'.repeat(40);

/** La date du dernier commit de la branche par défaut que porte ce clone — la même que lit la garde. */
function dateDeLaBase(): number {
  for (const ref of ['origin/main', 'HEAD']) {
    try {
      return Date.parse(
        execFileSync('git', ['log', '-1', '--format=%cI', ref], { encoding: 'utf8' }).trim()
      );
    } catch {
      // référence absente : la suivante
    }
  }
  throw new Error('aucune référence lisible dans ce clone');
}

let n = 0;
function lancer(mergedAt: string): { code: number; sortie: string } {
  const fixture = join(DOSSIER, `univers-${n++}.json`);
  writeFileSync(
    fixture,
    JSON.stringify({
      fusionnees: [
        {
          number: 9901,
          title: 'chore(GOV-012): une autre PR',
          mergeCommit: { oid: INTROUVABLE },
          mergedAt,
        },
      ],
    })
  );
  const r = spawnSync('npx', ['tsx', SCRIPT, '--now', MAINTENANT], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, GOV_ETAT_GH: `node ${FAUX_GH}`, GOV_ETAT_FAUX: fixture },
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe(
  'REQ-GOV-006 — une fusion postérieure au clone ne fait pas rougir la porte A (GOV-119)',
  { timeout: 180_000 },
  () => {
    it('REQ-GOV-006 — TÉMOIN : une fusion POSTÉRIEURE à la base du clone, au commit absent, est nommée et comptée, et ne rougit pas', () => {
      const apres = new Date(dateDeLaBase() + 3_600_000).toISOString();
      const { code, sortie } = lancer(apres);
      expect(sortie).not.toContain('github_illisible');
      expect(sortie).toContain('#9901');
      expect(sortie).toMatch(/1 fusion\(s\) postérieure\(s\) au clone/);
      expect(code).toBe(0);
    });

    it('REQ-GOV-006 — CONTRE-TÉMOIN : une fusion ANTÉRIEURE dont le commit manque au clone reste un rouge nommé', () => {
      const avant = new Date(dateDeLaBase() - 86_400_000).toISOString();
      const { code, sortie } = lancer(avant);
      expect(sortie).toContain('github_illisible');
      expect(sortie).toContain('#9901');
      expect(code).not.toBe(0);
    });

    it('REQ-GOV-006 — CONTRE-TÉMOIN : une date de fusion illisible ne vaut pas « postérieure » : rouge nommé', () => {
      const { code, sortie } = lancer('pas une date');
      expect(sortie).toContain('github_illisible');
      expect(code).not.toBe(0);
    });
  }
);
