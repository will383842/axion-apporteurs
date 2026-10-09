// @req REQ-GOV-031
/**
 * SEC-48 (REQ-GOV-031) — `gov:publication` refuse une donnée du POSTE de travail dans un fichier suivi.
 *
 * Une expansion du shell a versé l'identité du poste (la sortie de `id`) dans un commentaire de
 * `prisma/schema.prisma` (PR #480), et des fichiers suivis portaient le dossier personnel d'un
 * poste, avec son nom. La famille `donnee_du_poste` refuse l'identité système et le dossier
 * personnel sous ses écritures (`C:\…`, `C:/…`, `/c/…`, et le nom encodé des projets de session) ;
 * la seule forme permise est le marqueur littéral du nom.
 *
 * Le banc : la vraie garde, lancée sur un dépôt git temporaire dont un fichier suivi porte la ligne,
 * hors contexte de PR (la garde balaie alors tout le dépôt suivi). Les lignes sont ASSEMBLÉES ici :
 * écrites d'un tenant, elles feraient rougir la garde sur ce fichier même.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const GARDE = resolve('scripts/gates/gov-publication.ts');
const TSX = resolve('node_modules/tsx/dist/cli.mjs');
const DOSSIER = mkdtempSync(join(tmpdir(), 'sec-48-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));

const ANTI = '\\';
const NOM = 'poste';
const MARQUEUR = '<' + 'nom>';

/** Hors PR : la garde juge tout le dépôt temporaire, pas un diff contre une base absente. */
function envHorsPr(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env['GITHUB_EVENT_NAME'];
  delete env['GITHUB_BASE_REF'];
  return env;
}

let n = 0;
/** La garde sur un dépôt neuf dont `fichier` (suivi, `note.md` par défaut) porte la ligne en ligne 3. */
function juger(ligne: string, fichier = 'note.md'): { code: number; sortie: string } {
  const depot = join(DOSSIER, `depot-${n++}`);
  execFileSync('git', ['init', '-q', depot]);
  mkdirSync(dirname(join(depot, fichier)), { recursive: true });
  writeFileSync(join(depot, fichier), `# Note\n\n${ligne}\n`);
  execFileSync('git', ['add', fichier], { cwd: depot });
  const r = spawnSync(process.execPath, [TSX, GARDE], {
    cwd: depot,
    encoding: 'utf8',
    env: envHorsPr(),
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe(
  'REQ-GOV-031 — une donnée du poste ne se publie pas (SEC-48)',
  { timeout: 120_000 },
  () => {
    const ROUGES: [string, string][] = [
      ['la sortie de id', 'La clé primaire uid=' + '1001(' + NOM + ') g' + 'id=1001'],
      ['un gid seul', 'groupes : g' + 'id=1000'],
      ['le dossier personnel, Windows', 'cd C:' + ANTI + 'Users' + ANTI + NOM + ANTI + 'Documents'],
      ['le dossier personnel, barres obliques', 'voir C:' + '/Users/' + NOM + '/Documents/outils/'],
      ['le dossier personnel, Git Bash', 'git -C /c' + '/Users/' + NOM + '/Documents/Projets'],
      ['le dossier personnel, casse quelconque', 'c:' + ANTI + 'USERS' + ANTI + 'Poste'],
      [
        'le nom encodé des projets de session',
        '~/.claude/projects/C-' + '-Users-' + NOM + '-Documents/',
      ],
      // La dette nommée par la lentille sécurité : le poste Linux (CI, sessions cloud), le poste macOS,
      // et le chemin Windows échappé deux fois (quatre barres inverses).
      ['le dossier personnel, Linux', 'cd /ho' + 'me/' + NOM + '/work/axion-apporteurs'],
      ['le dossier personnel, macOS', 'cd /Us' + 'ers/' + NOM + '/Documents/Projets'],
      [
        'le dossier personnel, échappé deux fois',
        '"C:' + ANTI.repeat(4) + 'Users' + ANTI.repeat(4) + NOM + ANTI.repeat(4) + 'Documents"',
      ],
    ];

    it.each(ROUGES)('REQ-GOV-031 : TÉMOIN — %s rougit, nommé donnee_du_poste', (_quoi, ligne) => {
      const { code, sortie } = juger(ligne);
      expect(code).not.toBe(0);
      expect(sortie).toContain('note.md:3 — donnee_du_poste');
    });

    // L'incident #480 s'est produit dans `prisma/schema.prisma` ; une expansion du shell se produit
    // d'abord dans un script `.sh`. Le témoin, rejoué dans chacun des fichiers que la garde doit lire.
    const FICHIERS: string[] = [
      'prisma/schema.prisma',
      'scripts/outil.sh',
      'eslint.config.mjs',
      'scripts/outil.cjs',
    ];
    const LIGNE_480 = '/// La clé primaire uid=' + '1001(' + NOM + ') g' + 'id=1001';

    it.each(FICHIERS)('REQ-GOV-031 : TÉMOIN — la ligne de #480 dans %s rougit', (fichier) => {
      const { code, sortie } = juger(LIGNE_480, fichier);
      expect(code).not.toBe(0);
      expect(sortie).toContain(`${fichier}:3 — donnee_du_poste`);
    });

    it('REQ-GOV-031 : CONTRE-TÉMOIN — le marqueur, une variable, un uuid : verts', () => {
      for (const ligne of [
        'cd C:' + ANTI + 'Users' + ANTI + MARQUEUR + ANTI + 'Documents',
        'git -C /c' + '/Users/' + MARQUEUR + '/Documents/Projets',
        '%USERPROFILE%' + ANTI + 'Documents' + ANTI + 'Projets',
        'cd ~/Documents/Projets/axion-apporteurs',
        'cd /ho' + 'me/' + MARQUEUR + '/work',
        'cache : /ho' + 'me/runner/.cache/apt-navigateurs',
        'cd /Us' + 'ers/' + MARQUEUR + '/Documents',
        'GET https://exemple.test/ho' + 'me/accueil',
        "router.get('/users/me')",
        'GET /api/v1/deploy?uu' + 'id=1234&force=false',
      ]) {
        const { code, sortie } = juger(ligne);
        expect([ligne, code, sortie]).toEqual([ligne, 0, expect.stringContaining('✅')]);
      }
    });

    it('REQ-GOV-031 : la preuve de la garde voit donnee_du_poste rougir sur son témoin', () => {
      const r = spawnSync(process.execPath, [TSX, GARDE, '--prove'], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('• donnee_du_poste');
    });
  }
);
