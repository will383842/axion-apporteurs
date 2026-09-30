// @req REQ-QA-032
/**
 * `pnpm build` RÉUSSIT SANS ACCÈS À LA BASE — QA-T05 (REQ-QA-032).
 *
 * Parce qu'aucune page ne touche la base au build, et non parce qu'on lui en substitue une fausse.
 * L'autre dépôt pose une adresse factice au build et saute la validation de son environnement :
 * c'est une DIVERGENCE ASSUMÉE, écrite ici pour qu'elle ne soit pas réintroduite par imitation.
 *
 * DEUX PREUVES, DEUX LIEUX :
 *   — l'ACTE vit dans la forge : `.github/workflows/deploy.yml` lance `image:construire` (l'image
 *     se construit sans aucune variable), puis `image:temoin-build-sans-base` (une page qui lit la
 *     base au rendu fait échouer le build, qui la NOMME). Ce fichier exige que les deux étapes
 *     existent, que les scripts exécutent exactement ce qui est jugé, et que le témoin ne soit pas
 *     vidé ;
 *   — la FORME vit ici : ni le Dockerfile, ni un workflow, ni un script, ni le code ne porte de
 *     valeur de substitution, et aucun client de base n'est enveloppé dans un mandataire qui
 *     court-circuite ses requêtes. Chaque règle a sa face rouge, jouée sur une copie mutée.
 *
 * Ce qu'elle ne voit pas : une valeur de substitution construite par concaténation. Elle lit des
 * littéraux ; l'acte, dans la forge, reste la preuve de fond.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';

const DOCKERFILE = 'Dockerfile';
const WORKFLOW = '.github/workflows/deploy.yml';
const PAQUET = 'package.json';
const TEMOIN = 'scripts/image/temoin-build-sans-base.sh';

/** Une VALEUR de substitution de build — jamais le simple nom du patron, qu'un commentaire cite. */
const SUBSTITUTION = [
  /stub:stub@/,
  /stub\.invalid:\d/,
  /SKIP_ENV_VALIDATION\s*[=:]/,
  /ARG\s+(DATABASE_URL|REDIS_URL)\b/,
  /ENV\s+(DATABASE_URL|REDIS_URL)\b/,
  /--build-arg\s+(DATABASE_URL|REDIS_URL)\b/,
];
/** Un client de base enveloppé dans un mandataire : il répondrait sans jamais interroger la base. */
const MANDATAIRE = /new Proxy\s*\([^)]*(prisma|PrismaClient)/i;

/** Là où une substitution AGIRAIT : le code, les scripts, l'image, les workflows, la configuration. */
const perimetre = (f: string) =>
  (f.startsWith('src/') ||
    f.startsWith('scripts/') ||
    f.startsWith('.github/') ||
    f === DOCKERFILE ||
    /^next\.config\.|^package\.json$|^docker-entrypoint\.sh$/.test(f)) &&
  /\.(ts|tsx|js|mjs|cjs|sh|yml|yaml|json)$|^Dockerfile$|^docker-entrypoint\.sh$/.test(f);

function fautesDeFichier(chemin: string, texte: string): string[] {
  const f: string[] = [];
  for (const m of SUBSTITUTION)
    if (m.test(texte)) f.push(`substitution_de_build : ${chemin} porte ${m}`);
  if (MANDATAIRE.test(texte))
    f.push(`client_mandataire : ${chemin} enveloppe le client de base dans un Proxy`);
  return f;
}

/** L'ACTE : le workflow lance les deux scripts, et chacun exécute exactement ce qui est jugé. */
function fautesDeLActe(workflow: string, paquet: string, temoinSh: string): string[] {
  const f: string[] = [];
  const scripts = (JSON.parse(paquet) as { scripts: Record<string, string> }).scripts;
  if (
    !/run: pnpm image:construire\s*$/m.test(workflow) ||
    scripts['image:construire'] !==
      'docker build --build-arg GITHUB_SHA --tag partners:construite .'
  )
    f.push('build_sans_base_absent : le workflow ne construit pas l’image sans variable');
  const temoin =
    /run: pnpm image:temoin-build-sans-base\s*$/m.test(workflow) &&
    scripts['image:temoin-build-sans-base'] === `sh ${TEMOIN}` &&
    /\$queryRaw/.test(temoinSh) &&
    /if docker build --tag partners-temoin/.test(temoinSh) &&
    /grep -q "temoin-build-sans-base"/.test(temoinSh) &&
    /prerender\|DATABASE_URL/.test(temoinSh);
  if (!temoin)
    f.push(
      'build_sans_base_sans_face_rouge : aucune page qui lit la base au rendu n’est exigée en échec nommé'
    );
  return f;
}

describe('REQ-QA-032 — le build réussit sans base, et ne triche pas pour y arriver (QA-T05)', () => {
  const suivis = fichiersSuivis().filter(perimetre);
  const dockerfile = readFileSync(DOCKERFILE, 'utf8');
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const paquet = readFileSync(PAQUET, 'utf8');
  const temoinSh = readFileSync(TEMOIN, 'utf8');

  it('REQ-QA-032 — aucun fichier du périmètre ne porte de substitution ni de mandataire, et le compte est dit', () => {
    for (const attendu of [DOCKERFILE, WORKFLOW, PAQUET, TEMOIN]) expect(suivis).toContain(attendu);
    const fautes = suivis.flatMap((c) => fautesDeFichier(c, readFileSync(c, 'utf8')));
    expect(fautes, `${suivis.length} fichier(s) lu(s)`).toEqual([]);
  });

  it('REQ-QA-032 — l’acte est dans la forge : build sans variable, puis face rouge nommée', () => {
    expect(fautesDeLActe(workflow, paquet, temoinSh)).toEqual([]);
  });

  const mutants: [string, string, string, string][] = [
    [
      'une adresse de base factice posée dans l’image',
      DOCKERFILE,
      dockerfile.replace(
        'FROM base AS construction',
        'FROM base AS construction\nENV DATABASE_URL=postgresql://stub:stub@stub.invalid:5432/stub'
      ),
      'substitution_de_build',
    ],
    [
      'la validation de l’environnement sautée au build',
      DOCKERFILE,
      dockerfile.replace(
        'FROM base AS construction',
        'FROM base AS construction\nENV SKIP_ENV_VALIDATION=true'
      ),
      'substitution_de_build',
    ],
    [
      'une variable de base passée au build par le script de construction',
      PAQUET,
      paquet.replace(
        'docker build --build-arg GITHUB_SHA --tag partners:construite .',
        'docker build --build-arg GITHUB_SHA --build-arg DATABASE_URL=x --tag partners:construite .'
      ),
      'substitution_de_build',
    ],
    [
      'un client de base enveloppé dans un mandataire',
      'src/server/base.ts',
      'export const base = new Proxy({} as PrismaClient, { get: () => () => [] });',
      'client_mandataire',
    ],
  ];
  for (const [quoi, chemin, texte, famille] of mutants) {
    it(`REQ-QA-032 — TÉMOIN : ${quoi} rougit en « ${famille} »`, () => {
      expect(fautesDeFichier(chemin, texte).some((x) => x.startsWith(famille))).toBe(true);
    });
  }

  it('REQ-QA-032 — TÉMOIN : le témoin du build qui n’exige plus l’échec rougit', () => {
    const sansEchec = temoinSh.replace(
      /if docker build --tag partners-temoin/,
      'docker build --tag partners-temoin'
    );
    expect(sansEchec).not.toBe(temoinSh);
    expect(
      fautesDeLActe(workflow, paquet, sansEchec).some((x) =>
        x.startsWith('build_sans_base_sans_face_rouge')
      )
    ).toBe(true);
  });

  it('REQ-QA-032 — TÉMOIN : le workflow qui ne lance plus la face rouge rougit', () => {
    const sansEtape = workflow.replace('run: pnpm image:temoin-build-sans-base', 'run: pnpm lint');
    expect(sansEtape).not.toBe(workflow);
    expect(
      fautesDeLActe(sansEtape, paquet, temoinSh).some((x) =>
        x.startsWith('build_sans_base_sans_face_rouge')
      )
    ).toBe(true);
  });
});
