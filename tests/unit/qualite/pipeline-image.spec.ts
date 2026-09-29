// @req REQ-QA-018
/**
 * L'IMAGE EST CONSTRUITE, JUGÉE PUIS PUBLIÉE PAR LA FORGE — QA-T05 (REQ-QA-018).
 *
 * `.github/workflows/deploy.yml` est lu ici pour ce qu'il FAIT, dans l'ordre : construire, jouer
 * les deux faces de la porte C, et seulement alors publier `latest` et `sha-<7>`, sur `main`
 * seulement. Chaque étape est un script de `package.json` (forme fermée des gardes) : la chaîne est
 * suivie jusqu'au fichier qu'il exécute. La porte C elle-même tourne dans le job : ce fichier ne
 * lance aucun conteneur, il tient la FORME qui fait que la porte ne peut pas être contournée —
 * une publication placée avant elle, ou ouverte aux demandes de fusion, rougit en se nommant.
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

/** Ce que chaque étape du job doit exécuter, EXACTEMENT. */
const ATTENDUS: Record<string, string> = {
  'image:construire': 'docker build --tag partners:construite .',
  'gate-c': 'sh scripts/gates/gate-c.sh partners:construite',
  'gate-c:prove': 'sh scripts/image/temoin-porte-c.sh',
  'image:publier': 'sh scripts/image/publier.sh',
};

type Etape = { nom: string; corps: string };

/** Les étapes du job, dans l'ordre, découpées sur `- name:` ou `- uses:`. */
function etapes(texte: string): Etape[] {
  return texte
    .split(/\n(?=\s{6}- (?:name|uses):)/)
    .slice(1)
    .map((b) => ({ nom: /- (?:name|uses):\s*(.+)/.exec(b)?.[1]?.trim() ?? '', corps: b }));
}

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Les fautes du pipeline : chacune NOMME la règle qu'elle viole. */
function fautesDuPipeline(s: Sources): string[] {
  const f: string[] = [];
  const e = etapes(s.workflow);
  const indice = (script: string) =>
    e.findIndex((x) => new RegExp(`run: pnpm ${echapper(script)}\\s*$`, 'm').test(x.corps));

  for (const [script, valeur] of Object.entries(ATTENDUS)) {
    if (s.scripts[script] !== valeur)
      f.push(
        `script_altere : ${script} vaut « ${s.scripts[script] ?? 'absent'} », attendu « ${valeur} »`
      );
  }
  const construire = indice('image:construire');
  const porteVerte = indice('gate-c');
  const porteRouge = indice('gate-c:prove');
  const publier = indice('image:publier');
  if (construire < 0) f.push('construction_absente : aucune étape ne lance image:construire');
  if (porteVerte < 0) f.push('porte_c_absente : aucune étape ne lance gate-c');
  if (porteRouge < 0) f.push('porte_c_sans_face_rouge : aucune étape ne lance gate-c:prove');
  if (publier < 0) f.push('publication_absente : aucune étape ne lance image:publier');
  if (publier >= 0) {
    const p = e[publier]!.corps;
    if (!/github\.event_name == 'push'/.test(p) || !/refs\/heads\/main/.test(p))
      f.push('publication_hors_main : l’étape de publication n’est pas gardée par push sur main');
    if (!/JETON: \$\{\{ secrets\.GITHUB_TOKEN \}\}/.test(p))
      f.push('connexion_au_registre : le jeton de publication n’est pas GITHUB_TOKEN');
    if (/secrets\.(?!GITHUB_TOKEN\b)/.test(p))
      f.push('secret_tiers : la publication lit un autre secret que GITHUB_TOKEN');
    for (const [nom, i] of [
      ['la construction', construire],
      ['la porte C', porteVerte],
      ['la face rouge de la porte C', porteRouge],
    ] as const) {
      if (i >= 0 && i > publier) f.push(`publication_avant_preuve : la publication précède ${nom}`);
    }
  }
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
  if (!/if: \$\{\{ github\.event\.pull_request\.merged != true \}\}/.test(s.workflow))
    f.push('garde_de_fusion_absente : le job mesure aussi une demande de fusion déjà fusionnée');
  return f;
}

describe('REQ-QA-018 — la forge construit, juge, puis publie l’image (QA-T05)', () => {
  it('REQ-QA-018 — les vraies sources ne portent aucune faute, et le job compte ses étapes', () => {
    expect(fautesDuPipeline(REEL)).toEqual([]);
    expect(etapes(REEL.workflow).length).toBeGreaterThanOrEqual(7);
  });

  const deplacerLaPublicationAvantLaPorte = (t: string): string => {
    const e = etapes(t);
    const pub = e.find((x) => /run: pnpm image:publier/.test(x.corps))!;
    const ancre = e.find((x) => /run: pnpm gate-c\s*$/m.test(x.corps))!;
    return t
      .replace('\n' + pub.corps, '')
      .replace('\n' + ancre.corps, '\n' + pub.corps + '\n' + ancre.corps);
  };
  const mutants: [string, (s: Sources) => Sources, string][] = [
    [
      'la publication déplacée AVANT la porte C',
      (s) => ({ ...s, workflow: deplacerLaPublicationAvantLaPorte(s.workflow) }),
      'publication_avant_preuve',
    ],
    [
      'l’étape de publication ouverte aux demandes de fusion',
      (s) => ({ ...s, workflow: s.workflow.replace("github.event_name == 'push' && ", '') }),
      'publication_hors_main',
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
