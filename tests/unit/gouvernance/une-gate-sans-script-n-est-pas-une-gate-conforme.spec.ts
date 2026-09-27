// @req REQ-GOV-012
// @req REQ-QA-013
/**
 * GOV-083 — une entrée du registre dont le script est absent du disque s'exemptait elle aussi.
 *
 * LE DÉFAUT. `confronterDisqueEtRegistre()` ne jugeait une entrée de `docs/gates.json` que si son
 * script figurait parmi les fichiers suivis : ce qui n'était pas là n'était pas jugé, et rien ne le
 * disait. Trois sous-familles se cachaient sous ce seul silence — le script vit dans l'autre dépôt ;
 * il n'est pas encore écrit, parce que la garde est promise ; il n'existera jamais sous ce nom,
 * parce que l'entrée est fautive. Seule la troisième est une faute.
 *
 * CE QUE CE FICHIER GARDE. Les trois sous-familles sont DISTINGUÉES et NOMMÉES ; une entrée de la
 * phase courante (ou d'une phase passée) dont le script est introuvable, et qu'aucune tâche non
 * livrée ne promet d'écrire, est un REFUS qui nomme l'entrée et le chemin ; le vert imprime les
 * comptes par sous-famille. Chaque témoin EXÉCUTE la garde — la fonction pure, puis le binaire —
 * et lit ce qu'elle PRODUIT.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  controler,
  confronterDisqueEtRegistre,
  lireVue,
  phaseCouranteDe,
  VUE_CONFORME,
  type GateVue,
  type TacheVue,
  type Vue,
} from '../../../scripts/gates/gov-conventions';

const RACINE = process.cwd();
const SCRIPT = resolve(RACINE, 'scripts/gates/gov-conventions.ts');
const TSX = resolve(RACINE, 'node_modules/tsx/dist/cli.mjs');

/** Le binaire, lancé dans `cwd` : le code de sortie ET ce qu'il imprime. */
function lancer(cwd: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Une vue conforme dont on ne change QUE ce que le témoin fait varier (RM-11). */
function variante(patch: Partial<Vue>): Vue {
  return { ...VUE_CONFORME, ...patch };
}

const familles = (vue: Vue): string[] => [...new Set(controler(vue).map((f) => f.famille))].sort();
const messages = (vue: Vue): string =>
  controler(vue)
    .map((f) => f.message)
    .join('\n');

/** Une tâche — CHAQUE champ écrit : la phase et le statut sont ce que ces témoins font varier. */
const tache = (id: string, phase: number, statut: string, paths: string[]): TacheVue => ({
  id,
  repo: 'partners',
  phase,
  statut,
  paths,
});

/** La phase courante de la vue de référence, DÉRIVÉE — jamais tapée à côté. */
function courante(): number {
  const c = phaseCouranteDe(VUE_CONFORME.taches);
  if (typeof c !== 'number') throw new Error('la vue de référence n’a pas de phase courante');
  return c;
}

describe('REQ-GOV-012 — une entrée du registre sans script sur le disque est TRIÉE, jamais tue', () => {
  it('REQ-GOV-012 — la vue de référence a une phase courante, sans quoi aucun témoin ne juge rien', () => {
    expect(typeof courante()).toBe('number');
  });

  it('REQ-GOV-012 — TÉMOIN ROUGE : une entrée de la phase courante sans script, promise par personne, est REFUSÉE et NOMMÉE', () => {
    const fautive: GateVue = {
      id: 'gov:jamais-ecrite',
      phase: courante(),
      script: 'scripts/gates/gov-jamais-ecrite.ts',
    };
    const vue = variante({ gates: [...VUE_CONFORME.gates, fautive] });
    expect(familles(vue)).toEqual(['gate_sans_script']);
    expect(messages(vue)).toContain('gov:jamais-ecrite');
    expect(messages(vue)).toContain('scripts/gates/gov-jamais-ecrite.ts');
    expect(confronterDisqueEtRegistre(vue).fautives.map((g) => g.id)).toEqual([
      'gov:jamais-ecrite',
    ]);
  });

  it('REQ-GOV-012 — une entrée d’une phase PASSÉE sans script est refusée de même : le passé ne promet plus rien', () => {
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:du-socle', phase: courante() - 1, script: 'scripts/gates/gov-socle.ts' },
      ],
    });
    expect(familles(vue)).toEqual(['gate_sans_script']);
  });

  it('REQ-GOV-012 — PROMISE À UNE PHASE FUTURE : sortie du périmètre, déclarée avec sa phase, sans rougir', () => {
    const future = courante() + 2;
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:plus-tard', phase: future, script: 'scripts/gates/gov-plus-tard.ts' },
      ],
    });
    expect(familles(vue)).toEqual([]);
    const c = confronterDisqueEtRegistre(vue);
    const promise = c.promises.find((p) => p.gate.id === 'gov:plus-tard');
    expect(promise?.phase).toBe(future);
    expect(c.fautives).toEqual([]);
  });

  it('REQ-GOV-012 — PROMISE PAR SA TÂCHE NON LIVRÉE (le champ `tache` de l’entrée) : sortie, avec sa tâche', () => {
    const chemin = 'scripts/gates/gov-a-venir.ts';
    const avec = (statut: string): Vue =>
      variante({
        gates: [
          ...VUE_CONFORME.gates,
          { id: 'gov:a-venir', phase: courante(), script: chemin, tache: 'ZZ-T01' },
        ],
        taches: [...VUE_CONFORME.taches, tache('ZZ-T01', courante(), statut, [chemin])],
      });
    const promise = confronterDisqueEtRegistre(avec('a_faire')).promises.find(
      (p) => p.gate.id === 'gov:a-venir'
    );
    expect(promise?.porteur).toBe('ZZ-T01');
    expect(familles(avec('a_faire'))).toEqual([]);
    // L'AUTRE FACE, sur la MÊME vue à UN champ près : une tâche LIVRÉE ne promet plus rien. Sans
    // elle, on ne saurait pas si le vert vient de la promesse ou de l'absence de règle.
    expect(familles(avec('fusionnee'))).toEqual(['gate_sans_script']);
  });

  it('REQ-GOV-012 — un script que `package.json` LANCE ne se promet plus : sa tâche non livrée ne l’absout pas', () => {
    // Mesuré sur la PR 175 : `scripts/gates/migrations-additive.ts` retiré de l'index sortait en
    // zéro, rangé parmi les promesses parce que sa tâche porteuse (phase courante) n'est pas livrée
    // — alors que `package.json` le lance et que la porte A l'exécute. Un script qu'une commande
    // du dépôt invoque est DÉCLARÉ écrit : son absence est une perte, pas une promesse.
    const chemin = 'scripts/gates/gov-deja-lancee.ts';
    const avec = (lance: boolean): Vue =>
      variante({
        gates: [
          ...VUE_CONFORME.gates,
          { id: 'gov:deja-lancee', phase: courante(), script: chemin, tache: 'ZZ-T03' },
        ],
        taches: [...VUE_CONFORME.taches, tache('ZZ-T03', courante(), 'a_faire', [chemin])],
        packageJson: lance
          ? JSON.stringify({
              ...(JSON.parse(VUE_CONFORME.packageJson) as Record<string, unknown>),
              scripts: {
                ...(JSON.parse(VUE_CONFORME.packageJson) as { scripts: Record<string, string> })
                  .scripts,
                'gov:deja-lancee': `tsx ${chemin}`,
              },
            })
          : VUE_CONFORME.packageJson,
      });
    expect(familles(avec(true))).toEqual(['gate_sans_script']);
    expect(messages(avec(true))).toContain(chemin);
    // L'AUTRE FACE, à un champ près : non lancé, il reste promis par sa tâche.
    expect(familles(avec(false))).toEqual([]);
  });

  it('REQ-GOV-012 — une AUTRE tâche non livrée qui cite le script dans ses paths ne le promet PAS', () => {
    // Une tâche qui MODIFIE une garde la déclare dans ses paths. Si ce seul fait valait promesse,
    // supprimer la garde passerait pour « à venir » tant qu'une retouche est au backlog.
    const chemin = 'scripts/gates/gov-retouchee.ts';
    const vue = variante({
      gates: [...VUE_CONFORME.gates, { id: 'gov:retouchee', phase: -1, script: chemin }],
      taches: [...VUE_CONFORME.taches, tache('ZZ-T02', courante(), 'a_faire', [chemin])],
    });
    expect(familles(vue)).toEqual(['gate_sans_script']);
  });

  it('REQ-GOV-012 — L’AUTRE DÉPÔT : une entrée qui désigne `axionia/` est déclarée telle et sortie AVEC SON MOTIF', () => {
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'inertie', phase: courante(), script: 'axionia/scripts/gates/inertie.ts' },
      ],
    });
    expect(familles(vue)).toEqual([]);
    const c = confronterDisqueEtRegistre(vue);
    expect(c.autreDepot.map((g) => g.id)).toEqual(['inertie']);
    expect(c.fautives).toEqual([]);
  });

  it('REQ-GOV-012 — une entrée fautive DÉCLARÉE au passif ne rougit pas ; un passif qui ne sert plus rougit', () => {
    const fautive: GateVue = { id: 'gov:passif', phase: -1, script: 'scripts/gates/gov-passif.ts' };
    const motif =
      'entrée héritée dont la tâche est livrée sans avoir écrit ce script ; à corriger au registre ' +
      'par le gardien de la spécification, pas par un développeur.';
    const declaree = variante({
      gates: [...VUE_CONFORME.gates, fautive],
      passifSansScript: { 'gov:passif': motif },
    });
    expect(familles(declaree)).toEqual([]);
    // Le MÊME passif, l'entrée réparée (script désormais suivi) : la ligne de passif ne sert plus.
    const reparee = variante({
      gates: [...VUE_CONFORME.gates, fautive],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-passif.ts'],
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source:
            VUE_CONFORME.workflows[0]!.source +
            '      - name: Passif\n        run: tsx scripts/gates/gov-passif.ts\n',
        },
      ],
      passifSansScript: { 'gov:passif': motif },
    });
    expect(familles(reparee)).toEqual(['passif_sans_script_perime']);
  });
});

// ── le binaire, dans une copie de travail ──────────────────────────────────────────────────────

/**
 * Une copie de travail minimale du dépôt : les registres, les workflows, `package.json`, les
 * réglages, et les fichiers suivis de `scripts/gates/` (vides : seule leur PRÉSENCE est jugée ici).
 * Un dépôt git, parce que la garde lit l'index (`git ls-files`).
 */
function copieDeTravail(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gov-083-'));
  const suivis = execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const copies = suivis.filter(
    (f) =>
      [
        'docs/gates.json',
        'docs/tasks.json',
        'package.json',
        '.claude/settings.json',
        'eslint.config.mjs',
        '.prettierrc.json',
      ].includes(f) || /^\.github\/workflows\/.+\.ya?ml$/.test(f)
  );
  for (const f of copies) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(RACINE, f), join(dir, f));
  }
  for (const f of suivis.filter((s) => s.startsWith('scripts/gates/'))) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), '');
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

describe('REQ-QA-013 — le binaire : un script supprimé fait rougir, le registre du dépôt passe', () => {
  it('REQ-QA-013 — TÉMOIN À DEUX FACES : la copie intacte sort en zéro, la MÊME sans un script sort en non nul et NOMME l’entrée et le chemin', () => {
    const dir = copieDeTravail();
    try {
      const intacte = lancer(dir);
      expect(intacte.sortie).not.toContain('gate_sans_script');
      // Une entrée JUGÉE, de phase ≤ courante, dont la tâche est livrée : on retire son script.
      const vue = lireVue();
      const cible = confronterDisqueEtRegistre(vue).jugees.find(
        (g) => g.script === 'scripts/gates/gov-lecons.ts'
      );
      expect(cible, 'la garde des leçons est jugée au registre du dépôt').toBeDefined();
      execFileSync('git', ['rm', '-q', '--cached', cible!.script], { cwd: dir });
      rmSync(join(dir, cible!.script));
      const amputee = lancer(dir);
      expect(amputee.code).not.toBe(0);
      expect(amputee.sortie).toContain('[gate_sans_script]');
      expect(amputee.sortie).toContain(cible!.id);
      expect(amputee.sortie).toContain(cible!.script);
      // La face verte d'abord mesurée n'était pas rouge pour une AUTRE raison que ce script.
      expect(intacte.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('REQ-QA-013 — le registre du dépôt : sortie zéro, et les comptes par sous-famille IMPRIMÉS et recomptés', () => {
    const { code, sortie } = lancer(RACINE);
    expect(code).toBe(0);
    // RECOMPTE INDÉPENDANT : les registres et l'index lus ICI, pas par la fonction qu'on juge.
    const gates = (JSON.parse(readFileSync('docs/gates.json', 'utf8')) as { gates: GateVue[] })
      .gates;
    const suivis = new Set(
      execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
    );
    const sansScript = gates.filter(
      (g) => g.script.startsWith('scripts/gates/') && !suivis.has(g.script)
    );
    const autre = gates.filter((g) => g.script.startsWith('axionia/scripts/gates/'));
    const c = confronterDisqueEtRegistre(lireVue());
    expect(c.entreesSansScript.length).toBe(sansScript.length);
    expect(c.promises.length + c.fautives.length).toBe(sansScript.length);
    expect(c.autreDepot.length).toBe(autre.length);
    // PLANCHER : un tri qui rendrait le vide se lirait « aucune entrée fautive ».
    expect(sansScript.length).toBeGreaterThan(0);
    expect(sortie).toMatch(new RegExp(`JUGÉES sur leur câblage : ${c.jugees.length}\\b`));
    expect(sortie).toMatch(new RegExp(`l'autre dépôt[^\\n]* : ${c.autreDepot.length}\\b`));
    expect(sortie).toMatch(new RegExp(`promises[^\\n]* : ${c.promises.length}\\b`));
    expect(sortie).toMatch(new RegExp(`fautives[^\\n]* : ${c.fautives.length}\\b`));
  }, 120_000);
});
