/**
 * fiches-agents-allegees.spec.ts — les fiches de rôle ne font plus lire de registre entier (GOV-159).
 *
 * @req REQ-GOV-010
 *
 * POURQUOI. Une fiche de rôle se relit à CHAQUE tour d'un sous-agent. Les `documents` de
 * `docs/agents.json` envoyaient lire en entier `docs/tasks.json`, `docs/requirements.json`,
 * `docs/gates.json` et `docs/DECISIONS.md` — des registres de plusieurs centaines de kilo-octets —
 * alors que le workflow de lot (`scripts/lot/lot.workflow.js`) passe déjà à l'agent les seules entrées
 * de sa tâche et lui interdit de lire ces registres autrement que filtrés par identifiant. La fiche
 * contredisait le workflow, et c'est la fiche que l'agent lisait.
 *
 * Ils citaient aussi des vues générées que git ne suit pas (`docs/PLAN-STATE.md`,
 * `docs/REQUIREMENTS.md`, `docs/GATES.md`, `docs/adr/INDEX.md` sont au `.gitignore`) : dans un
 * worktree neuf, l'agent cherche un fichier absent, et il invente. La vérification se fait donc contre
 * `git ls-files`, pas contre le disque — un fichier non suivi n'est lu par aucune garde (RM-14).
 *
 * Enfin, la mission du release-manager (A04) disait encore « une PR à la fois », alors que la fusion
 * se fait désormais par paquets adaptatifs.
 *
 * TÉMOIN ET CONTRE-TÉMOIN. `defautsDAllegement` est exercée sur la source réelle (aucun défaut
 * attendu) et sur une copie à laquelle on réinjecte chaque défaut, un par un (chacun doit être vu).
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SOURCE = 'docs/agents.json';

/** Registres qu'aucune fiche ne fait lire en entier : l'agent les lit filtrés, ou reçoit l'extrait. */
const LECTURES_GEANTES = [
  'docs/tasks.json',
  'docs/requirements.json',
  'docs/gates.json',
  'docs/DECISIONS.md',
] as const;

interface Poste {
  code: string;
  role: string;
  mission: string;
  entrees: string[];
  sorties: string[];
  interdits: string[];
  documents: { chemin: string; pourquoi: string }[];
  [champ: string]: unknown;
}

function lirePostes(): Poste[] {
  return (JSON.parse(readFileSync(SOURCE, 'utf8')) as { postes: Poste[] }).postes;
}

function fichiersSuivis(): Set<string> {
  const r = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ls-files a échoué : ${r.stderr}`);
  return new Set(r.stdout.split('\0').filter(Boolean));
}

function estSuivi(chemin: string, suivis: Set<string>): boolean {
  if (suivis.has(chemin)) return true;
  const dossier = chemin.endsWith('/') ? chemin : `${chemin}/`;
  for (const f of suivis) if (f.startsWith(dossier)) return true;
  return false;
}

export function defautsDAllegement(postes: Poste[], suivis: Set<string>): string[] {
  const defauts: string[] = [];
  for (const p of postes) {
    const vus = new Set<string>();
    for (const { chemin } of p.documents) {
      if ((LECTURES_GEANTES as readonly string[]).includes(chemin)) {
        defauts.push(`${p.code} fait lire en entier \`${chemin}\` au démarrage`);
      }
      if (!estSuivi(chemin, suivis)) {
        defauts.push(`${p.code} fait lire \`${chemin}\`, que git ne suit pas`);
      }
      if (vus.has(chemin)) defauts.push(`${p.code} cite deux fois \`${chemin}\``);
      vus.add(chemin);
    }
    for (const champ of ['entrees', 'sorties', 'interdits'] as const) {
      const liste = p[champ];
      const doublons = liste.filter((x, i) => liste.indexOf(x) !== i);
      for (const d of doublons) defauts.push(`${p.code} répète dans \`${champ}\` : « ${d} »`);
    }
    const modele = p.model ?? p.modele;
    if (modele !== undefined && !/opus/i.test(String(modele))) {
      defauts.push(`${p.code} quitte Opus : \`${String(modele)}\``);
    }
    if (p.code === 'A04') {
      if (/une\s+PR\s+à\s+la\s+fois/i.test(p.mission)) {
        defauts.push('A04 : la mission dit encore « une PR à la fois »');
      }
      if (!/paquet/i.test(p.mission)) {
        defauts.push('A04 : la mission ne décrit pas la fusion par paquets adaptatifs (GOV-158)');
      }
    }
  }
  return defauts;
}

describe('GOV-159 — les fiches de rôle sont allégées', () => {
  const suivis = fichiersSuivis();

  it('REQ-GOV-010 — la source réelle ne porte aucun défaut', () => {
    expect(defautsDAllegement(lirePostes(), suivis)).toEqual([]);
  });

  describe('chaque défaut réinjecté est vu (contre-témoin)', () => {
    const avec = (muter: (postes: Poste[]) => void): string[] => {
      const postes = lirePostes();
      muter(postes);
      return defautsDAllegement(postes, suivis);
    };
    const poste = (postes: Poste[], code: string): Poste => {
      const p = postes.find((x) => x.code === code);
      if (!p) throw new Error(`poste ${code} absent de ${SOURCE}`);
      return p;
    };

    for (const chemin of LECTURES_GEANTES) {
      it(`REQ-GOV-010 — une lecture entière de ${chemin}`, () => {
        const d = avec((ps) => poste(ps, 'A12').documents.push({ chemin, pourquoi: 'témoin' }));
        expect(d).toContain(`A12 fait lire en entier \`${chemin}\` au démarrage`);
      });
    }

    it('REQ-GOV-010 — une vue générée que git ne suit pas', () => {
      const d = avec((ps) =>
        poste(ps, 'A05').documents.push({ chemin: 'docs/PLAN-STATE.md', pourquoi: 'témoin' })
      );
      expect(d).toContain('A05 fait lire `docs/PLAN-STATE.md`, que git ne suit pas');
    });

    it('REQ-GOV-010 — un chemin cité deux fois', () => {
      const d = avec((ps) => {
        const p = poste(ps, 'A05');
        const premier = p.documents[0];
        if (!premier) throw new Error(`A05 sans document dans ${SOURCE}`);
        p.documents.push({ ...premier });
      });
      expect(d.some((x) => x.startsWith('A05 cite deux fois'))).toBe(true);
    });

    it('REQ-GOV-010 — une entrée répétée', () => {
      const d = avec((ps) => {
        const p = poste(ps, 'A09');
        const premiere = p.entrees[0];
        if (premiere === undefined) throw new Error(`A09 sans entrée dans ${SOURCE}`);
        p.entrees.push(premiere);
      });
      expect(d.some((x) => x.startsWith('A09 répète dans `entrees`'))).toBe(true);
    });

    it('REQ-GOV-010 — un poste qui quitte Opus', () => {
      const d = avec((ps) => {
        poste(ps, 'A01').model = 'sonnet';
      });
      expect(d).toContain('A01 quitte Opus : `sonnet`');
    });

    it('REQ-GOV-010 — la mission d’A04 qui dit encore « une PR à la fois »', () => {
      const d = avec((ps) => {
        poste(ps, 'A04').mission = 'Fusionner une PR à la fois sur `main`.';
      });
      expect(d).toContain('A04 : la mission dit encore « une PR à la fois »');
    });
  });
});
