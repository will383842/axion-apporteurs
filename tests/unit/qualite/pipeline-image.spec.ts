// @req REQ-QA-018
/**
 * L'IMAGE EST CONSTRUITE, JUGÉE PUIS PUBLIÉE PAR LA FORGE — QA-T05 (REQ-QA-018).
 *
 * `.github/workflows/deploy.yml` est lu ici pour ce qu'il FAIT, dans l'ordre : construire, jouer
 * les deux faces du build sans base, jouer les deux faces de la porte C, et seulement alors
 * publier `latest` et `sha-<7>`, sur `main` seulement. La porte C elle-même tourne dans le job :
 * ce fichier ne lance aucun conteneur, il tient la FORME qui fait que la porte ne peut pas être
 * contournée — une publication placée avant elle, ou sur une demande de fusion, rougit en se
 * nommant.
 *
 * Chaque règle a sa face rouge, jouée sur une copie mutée du vrai workflow.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CHEMIN = '.github/workflows/deploy.yml';
const REEL = readFileSync(CHEMIN, 'utf8');

type Etape = { nom: string; corps: string };

/** Les étapes du job, dans l'ordre, découpées sur `- name:` ou `- uses:`. */
function etapes(texte: string): Etape[] {
  const blocs = texte.split(/\n(?=\s{6}- (?:name|uses):)/);
  return blocs.slice(1).map((b) => {
    const nom = /- (?:name|uses):\s*(.+)/.exec(b)?.[1]?.trim() ?? '';
    return { nom, corps: b };
  });
}

/** Les fautes du pipeline : chacune NOMME la règle qu'elle viole. */
function fautesDuPipeline(texte: string): string[] {
  const f: string[] = [];
  const e = etapes(texte);
  const indice = (p: (x: Etape) => boolean) => e.findIndex(p);

  const construire = indice((x) => /docker build --tag partners:construite \.\s*$/m.test(x.corps));
  const porteVerte = indice((x) => /gate-c\.sh partners:construite\s*$/m.test(x.corps));
  const porteRouge = indice(
    (x) =>
      /gate-c\.sh partners:construite "\$CASSEE"/.test(x.corps) && /then[\s\S]*exit 1/.test(x.corps)
  );
  const publier = indice((x) => /docker push/.test(x.corps));

  if (construire < 0)
    f.push('construction_absente : aucune étape ne construit l’image partners:construite');
  if (porteVerte < 0)
    f.push('porte_c_absente : aucune étape ne joue gate-c.sh sur l’image construite');
  if (porteRouge < 0)
    f.push(
      'porte_c_sans_face_rouge : aucune étape n’exige que gate-c.sh échoue sur une migration cassée'
    );
  if (publier < 0) f.push('publication_absente : aucune étape ne pousse l’image sur le registre');
  if (publier >= 0) {
    const p = e[publier]!.corps;
    if (!/:latest"/.test(p))
      f.push('etiquette_latest_absente : la publication ne pousse pas latest');
    if (!/cut -c1-7/.test(p) || !/:sha-\$COURT"/.test(p))
      f.push('etiquette_sha_absente : la publication ne pousse pas sha-<7>, dérivé de $GITHUB_SHA');
    if (!/github\.event_name == 'push'/.test(p) || !/refs\/heads\/main/.test(p))
      f.push('publication_hors_main : la publication n’est pas gardée par push sur main');
    if (!/secrets\.GITHUB_TOKEN/.test(p) || !/--password-stdin/.test(p))
      f.push(
        'connexion_au_registre : la connexion ne passe pas par GITHUB_TOKEN sur l’entrée standard'
      );
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
  if (/cancel-in-progress:\s*true/.test(texte))
    f.push('publication_annulable : cancel-in-progress: true tuerait une publication commencée');
  if (!/if: \$\{\{ github\.event\.pull_request\.merged != true \}\}/.test(texte))
    f.push('garde_de_fusion_absente : le job mesure aussi une demande de fusion déjà fusionnée');
  return f;
}

describe('REQ-QA-018 — la forge construit, juge, puis publie l’image (QA-T05)', () => {
  it('REQ-QA-018 — le vrai workflow ne porte aucune faute, et il compte les étapes qu’il a lues', () => {
    expect(fautesDuPipeline(REEL)).toEqual([]);
    expect(etapes(REEL).length).toBeGreaterThanOrEqual(6);
  });

  const mutants: [string, (t: string) => string, string][] = [
    [
      'la publication déplacée AVANT la porte C',
      (t) => {
        const e = etapes(t);
        const pub = e.find((x) => /docker push/.test(x.corps))!;
        const sansPub = t.replace('\n' + pub.corps, '');
        const ancre = e.find((x) => /gate-c\.sh partners:construite\s*$/m.test(x.corps))!;
        return sansPub.replace('\n' + ancre.corps, '\n' + pub.corps + '\n' + ancre.corps);
      },
      'publication_avant_preuve',
    ],
    [
      'la publication ouverte aux demandes de fusion',
      (t) => t.replace("github.event_name == 'push' && ", ''),
      'publication_hors_main',
    ],
    [
      'l’étiquette latest retirée',
      (t) => t.replace(/\n.*:latest".*/g, ''),
      'etiquette_latest_absente',
    ],
    [
      'l’étiquette sha-<7> retirée',
      (t) => t.replace(/\n.*:sha-\$COURT".*/g, ''),
      'etiquette_sha_absente',
    ],
    [
      'la face rouge de la porte C qui ne vérifie plus l’échec',
      (t) =>
        t.replace(
          /if sh scripts\/gates\/gate-c\.sh partners:construite "\$CASSEE"/,
          'sh scripts/gates/gate-c.sh partners:construite'
        ),
      'porte_c_sans_face_rouge',
    ],
    [
      'une publication annulable',
      (t) => t.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
      'publication_annulable',
    ],
    [
      'un secret tiers lu par la publication',
      (t) => t.replace('JETON: ${{ secrets.GITHUB_TOKEN }}', 'JETON: ${{ secrets.GHCR_PAT }}'),
      'secret_tiers',
    ],
  ];

  for (const [quoi, muter, famille] of mutants) {
    it(`REQ-QA-018 — TÉMOIN : ${quoi} rougit en « ${famille} »`, () => {
      const mute = muter(REEL);
      expect(mute).not.toBe(REEL);
      const f = fautesDuPipeline(mute);
      expect(
        f.some((x) => x.startsWith(famille)),
        f.join('\n')
      ).toBe(true);
    });
  }
});
