/**
 * perf-budgets-refuse-un-perimetre-absent.spec.ts — GOV-046.
 *
 * @req REQ-GOV-012
 *
 * LA SEPTIÈME OCCURRENCE D'UNE FAMILLE DÉJÀ FERMÉE SIX FOIS. `scripts/gates/perf-budgets.ts`
 * portait `if (!existsSync(racine)) return []` : un chemin absent rendait une liste VIDE, donc
 * zéro violation, donc VERT. Cinq gardes avaient été fermées par la PR 31, `gov-conventions.ts`
 * par la PR 33 — celle-ci est arrivée SANS conflit, parce qu'un fichier ajouté d'un seul côté ne
 * se confronte à rien, et elle est restée.
 *
 * 🔑 LE VRAI LIVRABLE EST LE TÉMOIN DE FAMILLE, et c'est la lentille `simplicité` qui l'exige.
 * Le témoin existant (`refus-de-rendre-et-de-publier.spec.ts`, `GARDES_QUI_BALAIENT`) ne balaie
 * que les gardes qui IMPORTENT DÉJÀ la primitive du périmètre : il ne verra jamais un
 * `existsSync(racine) => return []` NEUF, écrit demain dans une garde qui n'importe rien.
 *
 * COMMENT CELUI-CI S'Y PREND, ET POURQUOI DANS CET ORDRE :
 *
 *   — LA POPULATION SE DÉRIVE DU DISQUE : toute garde SUIVIE de `scripts/gates/` qui rend une
 *     liste depuis un chemin. Une population dérivée du CORRECTIF ne verrait jamais celui qui le
 *     perd — c'est la leçon que `GARDES_QUI_BALAIENT` porte déjà, et elle vaut ici à l'envers ;
 *   — LE JUGEMENT EST DÉCLARÉ : chaque occurrence connue est inscrite ci-dessous avec son motif.
 *     Une occurrence NEUVE n'est dans aucune déclaration, donc elle rougit — y compris dans une
 *     garde qui n'importe rien du tout ;
 *   — LE TÉMOIN EST VU ROUGIR SUR UNE OCCURRENCE FABRIQUÉE, dans une garde qui n'importait pas la
 *     primitive. Sans cela, la population et la déclaration pourraient être toutes deux justes et
 *     le rapprochement inerte.
 *
 * ⚠️ CE FICHIER NE CORRIGE PAS LES SIX AUTRES OCCURRENCES. Elles vivent dans des gardes que
 * `perf-budgets.ts` ne possède pas, et les rouvrir déborderait les `paths` de GOV-046. Elles sont
 * INSCRITES, avec leur motif et la tâche qui porte leur fichier : une dette déclarée se voit, une
 * dette tue se reproduit.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fichiersDeSrc, RacineAbsente } from '../../../scripts/gates/perf-budgets';

/**
 * LE MOTIF DE LA FAMILLE : « un chemin absent rend une LISTE VIDE ».
 *
 * Il lit les trois écritures sous lesquelles le défaut s'est présenté : le refus précoce
 * (`if (!existsSync(x)) return []`), le ternaire qui rend `[]`, et le ternaire qui le rend d'abord.
 */
const LISTE_VIDE_SUR_CHEMIN_ABSENT =
  /(?:!\s*existsSync\s*\([^;]*?\)\s*\)?\s*(?:\{\s*)?return\s*\[\s*\]|existsSync\s*\([^;]*?\)\s*\?[^;]*?:\s*\[\s*\]|existsSync\s*\([^;]*?\)\s*\?\s*\[\s*\]\s*:)/g;

/** Les gardes SUIVIES de `scripts/gates/` — la population, lue sur le disque. */
function gardesSuivies(): string[] {
  return execFileSync('git', ['ls-files', 'scripts/gates'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts'));
}

/**
 * Le texte d'un fichier SANS ses commentaires.
 *
 * ⚠️ MESURÉ AU PREMIER JET, et c'est la garde qui avait raison : le docblock qui RACONTE le défaut
 * cite `if (!existsSync(racine)) return []` en toutes lettres, et le motif le comptait comme une
 * occurrence. Une garde lexicale qui lit la prose condamne le texte qui décrit la protection —
 * exactement le piège que `refus-de-rendre-et-de-publier.spec.ts` a déjà payé sur le caractère `✅`.
 */
function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Les occurrences du motif dans un texte, commentaires exclus. */
function occurrences(texte: string): string[] {
  LISTE_VIDE_SUR_CHEMIN_ABSENT.lastIndex = 0;
  return [...sansCommentaires(texte).matchAll(LISTE_VIDE_SUR_CHEMIN_ABSENT)].map((m) =>
    m[0].replace(/\s+/g, ' ').trim()
  );
}

/**
 * 🔴 DÉCLARÉE, ET NON DÉRIVÉE — pour la même raison que `GARDES_QUI_BALAIENT` l'est.
 *
 * Chaque garde y porte le NOMBRE d'occurrences qu'on lui connaît et le motif pour lequel elles
 * restent. Une occurrence de plus, dans un fichier déclaré ou dans un fichier neuf, fait rougir :
 * c'est le seul état qui demande une décision humaine, et il ne doit jamais se résoudre en silence.
 */
const OCCURRENCES_DECLAREES: readonly { fichier: string; combien: number; motif: string }[] = [
  {
    fichier: 'scripts/gates/gov-adr.ts',
    combien: 1,
    motif:
      "`lireCorpus` rend `[]` si `docs/adr` manque. Le fichier appartient à GOV-010 ; l'occurrence " +
      "n'est pas fermée ici, elle est déclarée pour qu'on la voie.",
  },
  {
    fichier: 'scripts/gates/gov-agents.ts',
    combien: 1,
    motif:
      "`existsSync(CHEMIN_FICHES) ? readdirSync(…) : []` — les fiches d'agents. Fichier de GOV-023.",
  },
  {
    fichier: 'scripts/gates/gov-depot.ts',
    combien: 1,
    motif: '`lireWorkflows` rend `[]` si `.github/workflows` manque. Fichier de GOV-012.',
  },
  {
    fichier: 'scripts/gates/gov-entite.ts',
    combien: 1,
    motif:
      'LÉGITIME, et le fichier le dit à la ligne même : « Le registre du dépôt. ABSENT = aucune ' +
      "exemption, et c'est le bon défaut : rien n'est absous. » Une liste vide y est une RÉPONSE, " +
      'pas une abstention — le défaut de la garde reste le REFUS.',
  },
  {
    fichier: 'scripts/gates/gov-identifiants.ts',
    combien: 1,
    motif: '`lignesDeLaSectionZero` rend `[]` si `docs/DECISIONS.md` manque. Fichier de GOV-025.',
  },
  {
    fichier: 'scripts/gates/gov-lecons.ts',
    combien: 2,
    motif:
      '`apprisDuJournal` et `rmConnues` rendent `[]` si leur source manque. Fichier de GOV-018 ; ' +
      'GOV-073 le rouvre.',
  },
];

describe('perf:budgets — un périmètre absent est un REFUS, jamais une liste vide (GOV-046)', () => {
  it('REQ-GOV-012 — la racine absente LÈVE, elle ne rend pas une liste vide', () => {
    const nulle = join(tmpdir(), 'gov-046-cette-racine-n-existe-pas');
    expect(() => fichiersDeSrc(nulle)).toThrow(RacineAbsente);
  });

  it('REQ-GOV-012 — CONTRE-TÉMOIN : un dossier qui EXISTE et ne porte aucune violation reste vert', () => {
    // C'est la distinction que la famille entière tient : « je n'ai rien trouvé » et « je n'ai
    // rien regardé » ne rendent pas le même verdict.
    const vide = mkdtempSync(join(tmpdir(), 'gov-046-vide-'));
    try {
      expect(fichiersDeSrc(vide)).toEqual([]);
    } finally {
      rmSync(vide, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-012 — `perf:budgets` REFUSE, en NOMMANT le périmètre, quand `src/` manque', () => {
    const depot = mkdtempSync(join(tmpdir(), 'gov-046-depot-'));
    try {
      // Un dépôt jetable qui porte tout ce que la garde lit SAUF `src/`.
      for (const f of ['config', 'docs', 'scripts', 'perf', '.github']) {
        cpSync(f, join(depot, f), { recursive: true });
      }
      cpSync('lighthouserc.json', join(depot, 'lighthouserc.json'));
      cpSync('package.json', join(depot, 'package.json'));
      // ⚠️ `node_modules` se PRÊTE, il ne se copie pas : l'arbre de pnpm est fait de liens, et une
      // copie en perd la moitié — mesuré au premier jet, `esbuild` introuvable et la garde n'a
      // jamais démarré. Une jonction ne demande aucun privilège sous Windows.
      symlinkSync(resolve('node_modules'), join(depot, 'node_modules'), 'junction');
      const r = spawnSync('npx', ['tsx', 'scripts/gates/perf-budgets.ts'], {
        cwd: depot,
        encoding: 'utf8',
        shell: true,
        timeout: 300_000,
      });
      const sortie = (r.stdout ?? '') + (r.stderr ?? '');
      expect(
        r.status,
        `la garde a rendu un verdict sans `.concat('`src/` :\n', sortie.slice(0, 900))
      ).not.toBe(0);
      expect(sortie).toContain('perimetre_absent');
      // Aucune bannière de succès : c'est la propriété de sécurité de toute la famille.
      expect(sortie.split(/\r?\n/).filter((l) => l.trimStart().startsWith('✅'))).toEqual([]);
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-012 — la POPULATION se dérive du disque, et elle n’est pas vide', () => {
    const gardes = gardesSuivies();
    expect(
      gardes.length,
      'aucune garde suivie : la population est vide, donc le témoin est inerte'
    ).toBeGreaterThan(0);
    expect(gardes).toContain('scripts/gates/perf-budgets.ts');
  });

  it('REQ-GOV-012 — aucune occurrence NON DÉCLARÉE dans les gardes suivies', () => {
    const declare = new Map(OCCURRENCES_DECLAREES.map((o) => [o.fichier, o.combien]));
    const ecarts: string[] = [];
    for (const f of gardesSuivies()) {
      const vues = occurrences(readFileSync(f, 'utf8'));
      const attendu = declare.get(f) ?? 0;
      if (vues.length !== attendu) {
        ecarts.push(
          `${f} : ${vues.length} occurrence(s) de « chemin absent → liste vide », ${attendu} déclarée(s)` +
            (vues.length > 0 ? ` — ${vues.join(' | ')}` : '')
        );
      }
    }
    expect(
      ecarts,
      'une garde rend une liste VIDE sur un chemin absent sans que ce fichier le déclare. ' +
        'Ferme-la par un REFUS, ou inscris-la avec son motif — le silence est la seule réponse interdite.'
    ).toEqual([]);
  });

  it('REQ-GOV-012 — la réciproque : aucune déclaration ne survit à la fermeture de son occurrence', () => {
    // L'autre sens, et c'est lui qui empêche la liste de devenir un cimetière : une ligne qui
    // n'absout plus rien ment sur l'état du dépôt.
    const suivies = new Set(gardesSuivies());
    for (const o of OCCURRENCES_DECLAREES) {
      expect(suivies.has(o.fichier), `${o.fichier} est déclarée et n’est plus suivie`).toBe(true);
      expect(
        occurrences(readFileSync(o.fichier, 'utf8')).length,
        `${o.fichier} : la déclaration annonce ${o.combien} occurrence(s) et le fichier n’en porte plus autant`
      ).toBe(o.combien);
      expect(
        o.motif.length,
        `${o.fichier} : une déclaration sans motif n’est pas une décision`
      ).toBeGreaterThan(40);
    }
  });

  it('REQ-GOV-012 — le témoin ROUGIT sur une occurrence FABRIQUÉE, dans une garde qui n’importe rien', () => {
    // 🔑 LE CŒUR DU TÉMOIN. La garde choisie n'importe PAS la primitive du périmètre : c'est
    // exactement le cas que `GARDES_QUI_BALAIENT` ne peut pas voir.
    const candidate = gardesSuivies().find(
      (f) =>
        !readFileSync(f, 'utf8').includes('fichiersSuivisOuRefus') &&
        !OCCURRENCES_DECLAREES.some((o) => o.fichier === f) &&
        occurrences(readFileSync(f, 'utf8')).length === 0
    );
    expect(
      candidate,
      'aucune garde sans la primitive et sans occurrence : le témoin ne peut pas se jouer'
    ).toBeDefined();

    const bac = mkdtempSync(join(tmpdir(), 'gov-046-fabrique-'));
    try {
      mkdirSync(join(bac, 'scripts', 'gates'), { recursive: true });
      const faux = join(bac, candidate!);
      writeFileSync(
        faux,
        readFileSync(candidate!, 'utf8') +
          '\nfunction perimetreNeuf(racine: string): string[] {\n  if (!existsSync(racine)) return [];\n  return [racine];\n}\n',
        'utf8'
      );
      // Le JUGEMENT, rejoué sur le texte fabriqué : il doit voir l'occurrence que personne n'a
      // déclarée. C'est la fonction pure qui est exercée, pas une relecture du fichier réel.
      const vues = occurrences(readFileSync(faux, 'utf8'));
      expect(
        vues.length,
        `l'occurrence fabriquée dans ${candidate} n'a PAS été vue : le motif de famille est inerte`
      ).toBe(1);
      expect(OCCURRENCES_DECLAREES.some((o) => o.fichier === candidate)).toBe(false);
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });
});
