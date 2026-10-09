// @req REQ-GOV-010
/**
 * LE LOT DÉDIÉ DU GARDIEN-SPEC — GOV-116 (REQ-GOV-010, `partners/ADR-0028`).
 *
 * Ce qui se juge sans lancer de session : le contenu des réglages et les règles qui en résultent.
 * (b) PREUVE POSITIVE : le lot ouvre `docs/DECISIONS.md`, `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`,
 * et eux seuls ; tout autre fichier réservé reste en `deny`, et les hooks du projet sont conservés.
 * (c) PREUVE NÉGATIVE : une session ordinaire, lancée sans la procédure, porte les six règles
 * d'écriture de ces trois fichiers en `deny`. Le reste (l'exécution réelle) est une trace datée de
 * Williams, jointe à la PR.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CHEMIN_REGLAGES_DU_LOT,
  CHEMIN_REGLAGES_DU_PROJET,
  COMMANDE_DU_LOT,
  COMMANDE_DE_LA_GARDE,
  DENY_DU_LOT,
  jugerCommande,
  jugerEcriture,
  jugerOutil,
  FICHIERS_DU_LOT,
  REGLES_DU_LOT,
  reglagesDuLot,
  reglesNonInterditesAuProjet,
  rendre,
  verifier,
  type Reglages,
} from '../../../scripts/lot/lot-dedie-gardien-spec';

const PROJET = JSON.parse(readFileSync(CHEMIN_REGLAGES_DU_PROJET, 'utf8')) as Reglages;
const LOT = reglagesDuLot(PROJET);
const RESERVES_HORS_LOT = ['docs/tasks.json', 'docs/gates.json', '.claude/settings.json'];

describe('REQ-GOV-010 — le lot dédié du gardien-spec ouvre trois fichiers et eux seuls (GOV-116)', () => {
  it('REQ-GOV-010 — (b) le lot autorise l’écriture des trois fichiers, et ne les interdit plus', () => {
    for (const r of REGLES_DU_LOT) {
      expect(LOT.permissions?.allow, r).toContain(r);
      expect(LOT.permissions?.deny, r).not.toContain(r);
    }
    expect([...FICHIERS_DU_LOT]).toEqual([
      'docs/DECISIONS.md',
      'docs/GLOSSAIRE.md',
      'docs/PRESEANCE.md',
    ]);
  });

  it('REQ-GOV-010 — (b) tout autre fichier réservé reste interdit dans le lot', () => {
    for (const f of RESERVES_HORS_LOT) {
      expect(LOT.permissions?.deny, f).toContain(`Write(${f})`);
      expect(LOT.permissions?.deny, f).toContain(`Edit(${f})`);
    }
    // Le lot n'interdit rien de moins que le projet, sauf les six règles du lot, plus les exécuteurs.
    const attendu = (PROJET.permissions?.deny ?? []).filter((r) => !REGLES_DU_LOT.includes(r));
    expect(LOT.permissions?.deny).toEqual([...attendu, ...DENY_DU_LOT]);
  });

  it('REQ-GOV-010 — (b) les hooks du projet sont conservés dans le lot, et la garde du lot s’y ajoute', () => {
    const projet = (PROJET.hooks ?? {}) as Record<string, unknown[]>;
    const lot = LOT.hooks as Record<string, { matcher?: string; hooks?: { command?: string }[] }[]>;
    for (const [evenement, crochets] of Object.entries(projet)) {
      for (const c of crochets) expect(lot[evenement], evenement).toContainEqual(c);
    }
    const garde = lot.PreToolUse?.find((c) =>
      c.hooks?.some((h) => h.command === COMMANDE_DE_LA_GARDE)
    );
    // La garde voit TOUS les outils : un outil qu'elle ne nomme pas est refusé, pas ignoré.
    expect(garde?.matcher).toBe('*');
    expect(LOT.env).toEqual(PROJET.env);
  });

  it('REQ-GOV-010 — le fichier du lot sur disque est EXACTEMENT le rendu des réglages du projet', () => {
    expect(readFileSync(CHEMIN_REGLAGES_DU_LOT, 'utf8')).toBe(rendre(PROJET));
  });

  it('REQ-GOV-010 — la procédure écarte les réglages du projet et charge ceux du lot', () => {
    expect(COMMANDE_DU_LOT).toBe(
      'claude --setting-sources user --settings config/lot-dedie-gardien-spec.settings.json'
    );
  });

  it('REQ-GOV-010 — TÉMOIN (c) : des réglages de projet qui oublient une règle laissent une session ordinaire écrire, et c’est nommé', () => {
    const troue: Reglages = {
      permissions: {
        deny: (PROJET.permissions?.deny ?? []).filter((r) => r !== 'Write(docs/DECISIONS.md)'),
      },
    };
    expect(reglesNonInterditesAuProjet(troue)).toContain('Write(docs/DECISIONS.md)');
  });

  it('REQ-GOV-010 — (c) PREUVE NÉGATIVE : une session ordinaire porte les six règles du lot en deny', () => {
    expect(reglesNonInterditesAuProjet(PROJET)).toEqual([]);
    expect(verifier()).toEqual([]);
  });
});

describe('REQ-GOV-010 — le confinement du lot est mécanique, pas une liste (lentille securite, #262)', () => {
  const RACINE = mkdtempSync(join(tmpdir(), 'lot-gardien-'));
  mkdirSync(join(RACINE, 'docs'));
  for (const f of [...FICHIERS_DU_LOT, 'docs/tasks.json']) writeFileSync(join(RACINE, f), '');

  /** Les Bash du lot qui ne sont pas de la lecture : chacun est une porte d'écriture. */
  const bashNonLecture = (r: Reglages): string[] =>
    (r.permissions?.allow ?? []).filter(
      (x) =>
        x.startsWith('Bash(') &&
        !/^Bash\((git (status|diff|log|show)|gh (pr (view|checks|diff)|run view))\*\)$/.test(x)
    );

  it('REQ-GOV-010 — le lot fixe son mode à « default » et n’autorise sans demander aucun Bash qui exécute ou écrit', () => {
    expect(LOT.permissions?.defaultMode).toBe('default');
    expect(bashNonLecture(LOT)).toEqual([]);
    for (const r of [
      'Bash(pnpm *)',
      'Bash(npx tsx*)',
      'Bash(node scripts/*)',
      'Bash(docker compose*)',
      'Bash(gh api*)',
      'Bash(gh pr merge*)',
    ]) {
      expect(LOT.permissions?.allow, r).not.toContain(r);
    }
  });

  it('REQ-GOV-010 — TÉMOIN : un allow Bash exécutant dans le lot est nommé', () => {
    const troue: Reglages = {
      permissions: {
        ...LOT.permissions,
        allow: [...(LOT.permissions?.allow ?? []), 'Bash(pnpm *)'],
      },
    };
    expect(bashNonLecture(troue)).toEqual(['Bash(pnpm *)']);
  });

  it('REQ-GOV-010 — la garde laisse écrire les trois fichiers, par chemin relatif ou absolu', () => {
    for (const f of FICHIERS_DU_LOT) {
      expect(jugerEcriture(f, RACINE), f).toBeNull();
      expect(jugerEcriture(join(RACINE, f), RACINE), f).toBeNull();
      // Windows : la lettre de lecteur peut arriver en minuscule, c'est le même disque.
      const minuscule = join(RACINE, f).replace(/^[A-Z]:/, (m) => m.toLowerCase());
      expect(jugerEcriture(minuscule, RACINE), minuscule).toBeNull();
    }
  });

  it('REQ-GOV-010 — la garde refuse tout autre chemin, même déguisé', () => {
    for (const c of [
      'docs/tasks.json',
      'docs/../docs/tasks.json',
      'DOCS/Decisions.md',
      'docs/decisions.md',
      join(RACINE, 'docs', 'tasks.json'),
      join(tmpdir(), 'ailleurs.md'),
      '.claude/settings.json',
      'src/index.ts',
    ]) {
      expect(jugerEcriture(c, RACINE), c).not.toBeNull();
    }
  });

  it('REQ-GOV-010 — la garde refuse un lien nommé comme un fichier du lot qui pointe ailleurs', () => {
    const autre = mkdtempSync(join(tmpdir(), 'lot-lien-'));
    mkdirSync(join(autre, 'docs'));
    writeFileSync(join(autre, 'docs', 'tasks.json'), '');
    let lien = true;
    try {
      symlinkSync(join(autre, 'docs', 'tasks.json'), join(autre, 'docs', 'GLOSSAIRE.md'));
    } catch {
      lien = false; // Windows sans le droit de créer un lien : le cas ne se construit pas sur ce poste.
    }
    if (lien) expect(jugerEcriture('docs/GLOSSAIRE.md', autre)).not.toBeNull();
    expect(jugerEcriture('docs/tasks.json', autre)).not.toBeNull();
  });

  it('REQ-GOV-010 — la garde refuse un lien PENDANT nommé comme un fichier du lot (cible inexistante)', () => {
    const autre = mkdtempSync(join(tmpdir(), 'lot-pendant-'));
    mkdirSync(join(autre, 'docs'));
    let lien = true;
    try {
      symlinkSync(join(autre, 'hors-du-lot.md'), join(autre, 'docs', 'PRESEANCE.md'));
    } catch {
      lien = false; // Windows sans le droit de créer un lien : le cas se juge en CI Linux.
    }
    if (lien) expect(jugerEcriture('docs/PRESEANCE.md', autre)).not.toBeNull();
    // Contre-témoin : sans lien, le fichier du lot, même absent, s'écrit.
    const sain = mkdtempSync(join(tmpdir(), 'lot-sain-'));
    mkdirSync(join(sain, 'docs'));
    expect(jugerEcriture('docs/PRESEANCE.md', sain)).toBeNull();
  });

  it('REQ-GOV-010 — la garde laisse passer la lecture, git add des trois fichiers, commit et push sur t/*', () => {
    for (const c of [
      'git status',
      'git diff docs/GLOSSAIRE.md',
      'git log -5 --oneline',
      'git add docs/GLOSSAIRE.md docs/PRESEANCE.md',
      'git commit -m "docs(GOV-116): glossaire"',
      'git push -u origin t/glossaire-2026-10',
      'git switch -c t/glossaire-2026-10',
      'gh pr view 262',
      'gh pr create --title "GOV-116" --body-file corps.md',
    ]) {
      expect(jugerCommande(c), c).toBeNull();
    }
  });

  it('REQ-GOV-010 — la garde refuse tout ce qui exécute, écrit, enchaîne ou sort de t/*', () => {
    for (const c of [
      'pnpm gov:tasks',
      'npx tsx scripts/lot/cloture.ts',
      `node -e "require('fs').writeFileSync('docs/tasks.json','')"`,
      'node scripts/lot/cloture.ts',
      'docker compose up',
      'python -c "open(1)"',
      'gh api -XPUT repos/x/y/pulls/1/merge',
      'gh pr merge 262 --squash',
      'git merge origin/t/autre',
      'git rebase main',
      'git checkout -- docs/tasks.json',
      'git add docs/tasks.json',
      'git add .',
      'git push origin t/x:main',
      'git push --force origin t/x',
      'git diff --output=docs/tasks.json',
      'git status; rm docs/tasks.json',
      'git log > docs/tasks.json',
      'git status && sed -i s/a/b/ docs/tasks.json',
      'echo x | tee docs/tasks.json',
      'git log $(rm -rf docs)',
      'sed -i s/a/b/ docs/tasks.json',
    ]) {
      expect(jugerCommande(c), c).not.toBeNull();
    }
  });

  it('REQ-GOV-010 — la garde juge l’outil : une écriture sans chemin est refusée, un outil de lecture passe', () => {
    expect(jugerOutil({ tool_name: 'Write', tool_input: {} }, RACINE)).not.toBeNull();
    expect(
      jugerOutil({ tool_name: 'Edit', tool_input: { file_path: 'docs/tasks.json' } }, RACINE)
    ).not.toBeNull();
    expect(
      jugerOutil({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'x.ipynb' } }, RACINE)
    ).not.toBeNull();
    expect(
      jugerOutil({ tool_name: 'Edit', tool_input: { file_path: 'docs/PRESEANCE.md' } }, RACINE)
    ).toBeNull();
    expect(
      jugerOutil({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } }, RACINE)
    ).not.toBeNull();
    expect(
      jugerOutil({ tool_name: 'Read', tool_input: { file_path: 'docs/tasks.json' } }, RACINE)
    ).toBeNull();
  });
});

describe('REQ-GOV-010 — les trois fuites relevées par la lentille securite sur 626f6b0e (#262)', () => {
  it('REQ-GOV-010 — FUITE 1 : une option qui fait exécuter git (--upload-pack, abrégée ou non) est refusée', () => {
    for (const c of [
      'git fetch --upload-pack="sed -i s/GOV/PIRATE/ docs/tasks.json" .',
      'git fetch --upload-pack=x .',
      'git fetch --upl=x .',
      'git fetch origin main',
      'git log --upl=x',
      'git diff --ext-diff',
      'git diff --textconv',
      'git show --exec=x',
      'git status -c core.fsmonitor=x',
      'git log --output=docs/tasks.json',
      'git log --outp=docs/tasks.json',
      'gh pr view 262 --web',
      'gh pr create --body-file .env',
      'gh pr create --body-file ../ailleurs.md',
      'gh pr create --body-file docs/tasks.json',
      'gh pr create --head main --title "x"',
    ]) {
      expect(jugerCommande(c), c).not.toBeNull();
    }
    for (const c of [
      'git fetch',
      'git fetch origin',
      'git log -5 --oneline',
      'git diff --stat -- docs/GLOSSAIRE.md',
    ]) {
      expect(jugerCommande(c), c).toBeNull();
    }
  });

  it('REQ-GOV-010 — FUITE 2 : un outil que la garde ne nomme pas (PowerShell, sous-agent, MCP) est refusé', () => {
    const RACINE = mkdtempSync(join(tmpdir(), 'lot-outils-'));
    for (const outil of [
      'PowerShell',
      'Agent',
      'WebFetch',
      'mcp__gmail__send_message',
      'OutilAVenir',
    ]) {
      expect(jugerOutil({ tool_name: outil, tool_input: {} }, RACINE), outil).not.toBeNull();
    }
    for (const outil of ['Read', 'Grep', 'Glob']) {
      expect(jugerOutil({ tool_name: outil, tool_input: {} }, RACINE), outil).toBeNull();
    }
    expect(DENY_DU_LOT).toContain('PowerShell');
  });

  /** Joue la commande EXACTE du hook, comme Claude la lance : par bash, JSON sur l'entrée. */
  const jouerLaGarde = (projet: string, entree: object): number | null =>
    spawnSync('bash', ['-c', COMMANDE_DE_LA_GARDE], {
      input: JSON.stringify(entree),
      env: { ...process.env, CLAUDE_PROJECT_DIR: projet },
    }).status;

  it('REQ-GOV-010 — FUITE 3 : la garde introuvable ou en panne REFUSE (code 2), elle n’échoue pas ouverte', () => {
    const vide = mkdtempSync(join(tmpdir(), 'lot-sans-garde-'));
    expect(
      jouerLaGarde(vide, { tool_name: 'Write', tool_input: { file_path: 'docs/GLOSSAIRE.md' } })
    ).toBe(2);
    expect(jouerLaGarde(vide, { tool_name: 'Read', tool_input: { file_path: 'README.md' } })).toBe(
      2
    );
  });

  it('REQ-GOV-010 — la commande exacte du hook, jouée par bash sur ce dépôt : 0 pour le lot, 2 pour le reste', () => {
    const ici = process.cwd();
    expect(
      jouerLaGarde(ici, { tool_name: 'Write', tool_input: { file_path: 'docs/GLOSSAIRE.md' } })
    ).toBe(0);
    expect(
      jouerLaGarde(ici, { tool_name: 'Write', tool_input: { file_path: 'docs/tasks.json' } })
    ).toBe(2);
    expect(
      jouerLaGarde(ici, { tool_name: 'PowerShell', tool_input: { command: 'Set-Content x y' } })
    ).toBe(2);
    expect(
      jouerLaGarde(ici, {
        tool_name: 'Bash',
        tool_input: { command: 'git fetch --upload-pack="sed -i s/GOV/PIRATE/ docs/tasks.json" .' },
      })
    ).toBe(2);
  });
});
