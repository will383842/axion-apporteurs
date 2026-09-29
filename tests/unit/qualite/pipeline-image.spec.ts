// @req REQ-QA-018
/**
 * L'IMAGE EST CONSTRUITE, JUGÉE PUIS PUBLIÉE PAR LA FORGE — QA-T05 (REQ-QA-018).
 *
 * `.github/workflows/deploy.yml` est lu ici pour ce qu'il FAIT, job par job. `image` construit et
 * joue les deux faces de la porte C, sur les demandes de fusion comme sur `main`, avec un jeton qui
 * ne sait que LIRE. `publier` ne tourne que sur un `push` vers `main`, après `image`, reconstruit et
 * reprouve l'image, puis la pousse `latest` et `sha-<7>` : il est le SEUL à porter
 * `packages: write` (refus de la lentille `securite` sur la PR #221 — le code d'une demande de
 * fusion s'exécute dans le job qui la juge, et un jeton capable de publier y serait à sa portée).
 * Chaque étape est un script de `package.json` : la chaîne est suivie jusqu'au fichier exécuté.
 *
 * Chaque règle a sa face rouge, jouée sur une copie mutée des vraies sources.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

type Sources = {
  workflow: string;
  scripts: Record<string, string>;
  publier: string;
  temoinPorteC: string;
};

const REEL: Sources = {
  workflow: readFileSync('.github/workflows/deploy.yml', 'utf8'),
  scripts: (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> })
    .scripts,
  publier: readFileSync('scripts/image/publier.sh', 'utf8'),
  temoinPorteC: readFileSync('scripts/image/temoin-porte-c.sh', 'utf8'),
};

/** Ce que chaque étape doit exécuter, EXACTEMENT. */
const ATTENDUS: Record<string, string> = {
  'image:construire': 'docker build --tag partners:construite .',
  'gate-c': 'sh scripts/gates/gate-c.sh partners:construite',
  'gate-c:prove': 'sh scripts/image/temoin-porte-c.sh',
  'image:publier': 'sh scripts/image/publier.sh',
};

/** Les jobs du workflow : leur nom et leur texte, découpés sur `  <nom>:` sous `jobs:`. */
function jobs(texte: string): Map<string, string> {
  const corps = texte.slice(texte.indexOf('\njobs:'));
  const m = new Map<string, string>();
  for (const bloc of corps.split(/\n(?= {2}[a-z][\w-]*:\s*$)/m).slice(1)) {
    const nom = /^ {2}([a-z][\w-]*):/.exec(bloc)?.[1];
    if (nom) m.set(nom, bloc);
  }
  return m;
}

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** L'indice de l'étape qui lance `pnpm <script>` dans un job, -1 si aucune. */
function rang(job: string, script: string): number {
  const etapes = job.split(/\n(?=\s{6}- (?:name|uses):)/).slice(1);
  return etapes.findIndex((e) => new RegExp(`run: pnpm ${echapper(script)}\\s*$`, 'm').test(e));
}

/** Les fautes du pipeline : chacune NOMME la règle qu'elle viole. */
function fautesDuPipeline(s: Sources): string[] {
  const f: string[] = [];
  const j = jobs(s.workflow);
  const image = j.get('image') ?? '';
  const publier = j.get('publier') ?? '';

  for (const [script, valeur] of Object.entries(ATTENDUS)) {
    if (s.scripts[script] !== valeur)
      f.push(
        `script_altere : ${script} vaut « ${s.scripts[script] ?? 'absent'} », attendu « ${valeur} »`
      );
  }
  if (!image) f.push('job_image_absent : aucun job `image`');
  if (!publier) f.push('job_publier_absent : aucun job `publier`');

  // Le job de preuve : les quatre étapes, un jeton qui ne sait que lire.
  for (const script of [
    'image:construire',
    'image:temoin-build-sans-base',
    'gate-c',
    'gate-c:prove',
  ])
    if (image && rang(image, script) < 0)
      f.push(`preuve_absente : le job image ne lance pas ${script}`);
  if (!/if: \$\{\{ github\.event\.pull_request\.merged != true \}\}/.test(image))
    f.push(
      'garde_de_fusion_absente : le job image mesure aussi une demande de fusion déjà fusionnée'
    );

  // LE JETON QUI PUBLIE : seul `publier` le porte, et `publier` ne tourne jamais sur une PR.
  for (const [nom, texte] of j) {
    if (nom !== 'publier' && /packages:\s*write/.test(texte))
      f.push(
        `jeton_de_publication_expose : le job ${nom}, atteint par pull_request, porte packages: write`
      );
  }
  if (publier) {
    if (
      !/if: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' \}\}/.test(
        publier
      )
    )
      f.push('publication_hors_main : le job publier n’est pas gardé par push sur main');
    if (!/needs: image\s*$/m.test(publier))
      f.push('publication_avant_preuve : le job publier ne dépend pas du job image');
    const c = rang(publier, 'image:construire');
    const p = rang(publier, 'gate-c');
    const pub = rang(publier, 'image:publier');
    if (c < 0 || p < 0 || pub < 0 || !(c < p && p < pub))
      f.push(
        'publication_avant_preuve : publier ne reconstruit et ne reprouve pas l’image AVANT de la pousser'
      );
    if (!/packages:\s*write/.test(publier))
      f.push('publication_sans_droit : le job publier ne porte pas packages: write');
    if (!/JETON: \$\{\{ secrets\.GITHUB_TOKEN \}\}/.test(publier))
      f.push('connexion_au_registre : le jeton de publication n’est pas GITHUB_TOKEN');
  }
  if (/secrets\.(?!GITHUB_TOKEN\b)/.test(s.workflow))
    f.push('secret_tiers : le workflow lit un autre secret que GITHUB_TOKEN');

  // Aucun checkout ne laisse le jeton dans `.git/config`.
  const checkouts =
    s.workflow.match(/- uses: actions\/checkout@[^\n]*(?:\n\s+with:[^\n]*)?/g) ?? [];
  if (checkouts.length === 0 || checkouts.some((c) => !/persist-credentials: false/.test(c)))
    f.push('jeton_persiste : un checkout ne pose pas persist-credentials: false');

  if (!/docker push "\$REGISTRE:latest"/.test(s.publier))
    f.push('etiquette_latest_absente : publier.sh ne pousse pas latest');
  if (!/cut -c1-7/.test(s.publier) || !/docker push "\$REGISTRE:sha-\$COURT"/.test(s.publier))
    f.push('etiquette_sha_absente : publier.sh ne pousse pas sha-<7>, dérivé de GITHUB_SHA');
  if (!/--password-stdin/.test(s.publier))
    f.push('connexion_au_registre : publier.sh ne lit pas le jeton sur l’entrée standard');
  if (!/"\$\{GITHUB_REF:-\}" != "refs\/heads\/main"[\s\S]*?exit 1/.test(s.publier))
    f.push('publication_hors_main : publier.sh ne refuse pas une publication hors de main');
  if (
    !/if sh scripts\/gates\/gate-c\.sh partners:construite "\$CASSEE"[^\n]*; then[\s\S]*?exit 1/.test(
      s.temoinPorteC
    ) ||
    !/migration\(s\) en attente/.test(s.temoinPorteC)
  )
    f.push(
      'porte_c_sans_face_rouge : temoin-porte-c.sh n’exige pas l’échec nommé sur une migration cassée'
    );
  if (/cancel-in-progress:\s*true/.test(s.workflow))
    f.push('publication_annulable : cancel-in-progress: true tuerait une publication commencée');
  return f;
}

describe('REQ-QA-018 — la forge construit, juge, puis publie l’image (QA-T05)', () => {
  it('REQ-QA-018 — les vraies sources ne portent aucune faute, et les deux jobs sont lus', () => {
    expect(fautesDuPipeline(REEL)).toEqual([]);
    expect([...jobs(REEL.workflow).keys()]).toEqual(['image', 'publier']);
  });

  const mutants: [string, (s: Sources) => Sources, string][] = [
    [
      'packages: write posé sur le job de preuve, atteint par pull_request',
      (s) => ({
        ...s,
        workflow: s.workflow.replace(
          '    permissions:\n      contents: read\n    steps:',
          '    permissions:\n      contents: read\n      packages: write\n    steps:'
        ),
      }),
      'jeton_de_publication_expose',
    ],
    [
      'un checkout qui persiste le jeton',
      (s) => ({
        ...s,
        workflow: s.workflow.replace('with: { persist-credentials: false }', 'with: {}'),
      }),
      'jeton_persiste',
    ],
    [
      'le job publier ouvert aux demandes de fusion',
      (s) => ({ ...s, workflow: s.workflow.replace("github.event_name == 'push' && ", '') }),
      'publication_hors_main',
    ],
    [
      'le job publier sans dépendance au job de preuve',
      (s) => ({ ...s, workflow: s.workflow.replace('    needs: image\n', '') }),
      'publication_avant_preuve',
    ],
    [
      'le job publier qui pousse avant de reprouver',
      (s) => ({
        ...s,
        workflow: s.workflow.replace(
          '        run: pnpm gate-c\n\n      - name: Publier',
          '        run: pnpm lint\n\n      - name: Publier'
        ),
      }),
      'publication_avant_preuve',
    ],
    [
      'publier.sh qui ne refuse plus hors de main',
      (s) => ({ ...s, publier: s.publier.replace('"refs/heads/main"', '"$GITHUB_REF"') }),
      'publication_hors_main',
    ],
    [
      'l’étiquette latest retirée',
      (s) => ({ ...s, publier: s.publier.replace('docker push "$REGISTRE:latest"', 'true') }),
      'etiquette_latest_absente',
    ],
    [
      'l’étiquette sha-<7> retirée',
      (s) => ({ ...s, publier: s.publier.replace('docker push "$REGISTRE:sha-$COURT"', 'true') }),
      'etiquette_sha_absente',
    ],
    [
      'la face rouge de la porte C qui ne vérifie plus l’échec',
      (s) => ({ ...s, temoinPorteC: s.temoinPorteC.replace(/if sh scripts/, 'sh scripts') }),
      'porte_c_sans_face_rouge',
    ],
    [
      'le script gate-c qui ne lance plus la porte',
      (s) => ({ ...s, scripts: { ...s.scripts, 'gate-c': 'true' } }),
      'script_altere',
    ],
    [
      'une publication annulable',
      (s) => ({
        ...s,
        workflow: s.workflow.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
      }),
      'publication_annulable',
    ],
    [
      'un secret tiers lu par la publication',
      (s) => ({ ...s, workflow: s.workflow.replace('secrets.GITHUB_TOKEN', 'secrets.GHCR_PAT') }),
      'secret_tiers',
    ],
  ];

  for (const [quoi, muter, famille] of mutants) {
    it(`REQ-QA-018 — TÉMOIN : ${quoi} rougit en « ${famille} »`, () => {
      const mute = muter(REEL);
      expect(JSON.stringify(mute)).not.toBe(JSON.stringify(REEL));
      const f = fautesDuPipeline(mute);
      expect(
        f.some((x) => x.startsWith(famille)),
        f.join('\n')
      ).toBe(true);
    });
  }
});

/**
 * LA RÈGLE JUMELLE DE LA PREVIEW (QA-T06, arbitrage -d7 sur délégation de Williams du 2026-09-29,
 * condition 6). `preview.yml` porte `packages: write` là où du code de PR s'exécute — c'est le prix
 * de l'option (B). Ce jeton ne doit JAMAIS atteindre le paquet de production : aucun job de
 * `preview.yml` ne lance `image:publier`, et la seule cible que son script sait écrire finit par
 * `-preview` (`cibleDePreview`, `scripts/preview/preview.ts`).
 */
describe('REQ-QA-018 — la preview écrit dans son paquet, jamais dans celui de production', () => {
  const PREVIEW = readFileSync('.github/workflows/preview.yml', 'utf8');

  it('REQ-QA-018 : aucun job de preview ne lance la publication de production', () => {
    expect(PREVIEW).not.toMatch(/image:publier\b/);
    expect(PREVIEW).not.toMatch(
      /secrets\.(?!GITHUB_TOKEN\b|COOLIFY_URL\b|COOLIFY_PREVIEW_TOKEN\b)/
    );
  });

  it('REQ-QA-018 : la cible de preview finit par -preview, et une cible de production est refusée', async () => {
    const { cibleDePreview } = await import('../../../scripts/preview/preview');
    expect(cibleDePreview('will383842/axion-apporteurs', 12, 'a'.repeat(40))).toBe(
      'ghcr.io/will383842/axion-apporteurs-preview:pr-12-aaaaaaa'
    );
    expect(() => cibleDePreview('will383842/axion-apporteurs', 12, 'main')).toThrow();
  });
});
