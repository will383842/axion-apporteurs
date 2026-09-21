// @req REQ-QA-011 → REQ-SEC-008
// @req REQ-QA-013
/**
 * QA-T07 — la gate sécurité semgrep : deux règles maison, chacune vue ROUGIR sur une vraie faute
 * plantée dans un fichier du MILIEU d'un bac, et le dépôt réel vert.
 *
 * REQ-QA-011 est ABSORBÉE : le texte en vigueur est celui de REQ-SEC-008 (« aucun import direct
 * de `prisma` sous `src/app/(espace)/**` et `src/server/espace/**` »). C'est lui que la règle
 * n° 1 suit. REQ-QA-013 n'est couverte ici qu'EN PARTIE : sa ligne « semgrep (règles publiques +
 * maison avec tests) ». Le reste de la gate (audit, gitleaks, couverture…) appartient à d'autres
 * tâches, et ce fichier ne prétend pas le garder.
 *
 * TROIS PASSAGES DE SEMGREP, PAS UN PAR RÈGLE : le bac entier (témoins, jumeaux `nosemgrep`,
 * contre-témoins) en un seul conteneur ; le même bac SANS `--disable-nosem` (la contre-épreuve
 * qui prouve que les jumeaux sont de vrais commentaires d'exclusion) ; le binaire sur le dépôt
 * réel ; et le binaire en preuve sur une copie des règles portant une règle orpheline, pour voir
 * la sortie NON NULLE du binaire lui-même. Premier passage d'une machine neuve : le tirage de
 * l'image (≈ 1,5 Go) — d'où le délai explicite.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONTRE_TEMOINS,
  EXCLUSIONS,
  FICHIER_REGLES,
  IMAGE,
  JEUX_PUBLICS,
  OPTIONS_FIXES,
  PLANCHER_MAISON,
  PLANCHER_PUBLIC,
  PREFIXE_MAISON,
  REGLE_PRISMA,
  REGLE_SQL,
  TEMOINS,
  argumentsDocker,
  executerPreuve,
  fichiersDuBac,
  jugerEnsemble,
  jugerReel,
  jumeauxNosem,
  verifierImage,
  type FichierDuBac,
  type Passage,
  type Verdict,
} from '../../../scripts/gates/semgrep';

const DELAI = 600_000;
const RACINE = process.cwd();
const REGLES = join(RACINE, FICHIER_REGLES);
const SCRIPT = 'scripts/gates/semgrep.ts';

function binaire(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? -1, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Les familles de fautes d'un verdict qui concernent UN fichier du bac. */
function fautesDe(v: Verdict, f: FichierDuBac): string[] {
  return v.fautes.filter((x) => x.message.includes(`(${f.chemin}`)).map((x) => x.famille);
}

const prisma = TEMOINS.filter((t) => t.regle === REGLE_PRISMA);
const sql = TEMOINS.filter((t) => t.regle === REGLE_SQL);
const jumeaux = TEMOINS.flatMap(jumeauxNosem);

describe('REQ-QA-011 → REQ-SEC-008 — le bac : chaque forme plantée est nommée, un seul conteneur', () => {
  let preuve: Verdict;
  beforeAll(() => {
    preuve = executerPreuve(REGLES);
  }, DELAI);

  it('REQ-QA-011 → REQ-SEC-008 — semgrep a tourné et chaque fichier du bac a été ANALYSÉ', () => {
    expect(preuve.passage.sortie, preuve.lignes.join('\n')).not.toBeNull();
    const analyses = new Set(preuve.passage.sortie!.paths.scanned);
    const manquants = fichiersDuBac()
      .filter((f) => !analyses.has(f.chemin))
      .map((f) => f.chemin);
    expect(manquants).toEqual([]);
    // Le plancher : un bac vide « analysé en entier » ne prouverait rien.
    expect(analyses.size).toBeGreaterThan(prisma.length + sql.length);
  });

  it.each(prisma.map((t) => [t.nom, t] as const))(
    'REQ-QA-011 → REQ-SEC-008 — %s : nommé par axion-prisma-hors-couche-d-acces sur sa ligne',
    (_nom, t) => {
      expect(fautesDe(preuve, t), preuve.lignes.join('\n')).toEqual([]);
      const constats = preuve.passage.sortie!.results.filter((c) => c.path === t.chemin);
      expect(constats.map((c) => [c.check_id, c.start.line])).toContainEqual([
        `${PREFIXE_MAISON}${REGLE_PRISMA}`,
        t.ligneFautive,
      ]);
    }
  );

  it.each(sql.map((t) => [t.nom, t] as const))(
    'REQ-QA-013 — %s : nommé par axion-sql-brut-non-parametre sur sa ligne',
    (_nom, t) => {
      const constats = preuve.passage.sortie!.results.filter((c) => c.path === t.chemin);
      expect(constats.map((c) => [c.check_id, c.start.line])).toContainEqual([
        `${PREFIXE_MAISON}${REGLE_SQL}`,
        t.ligneFautive,
      ]);
    }
  );

  it.each(CONTRE_TEMOINS.map((t) => [t.nom, t] as const))(
    'REQ-QA-011 → REQ-SEC-008 — contre-témoin %s : AUCUN constat',
    (_nom, t) => {
      const constats = preuve.passage.sortie!.results.filter((c) => c.path === t.chemin);
      expect(constats.map((c) => `${c.check_id}:${c.start.line}`)).toEqual([]);
    }
  );

  it.each(jumeaux.map((t) => [t.nom, t] as const))(
    'REQ-QA-013 — %s : `nosemgrep` n’éteint RIEN (--disable-nosem)',
    (_nom, t) => {
      const constats = preuve.passage.sortie!.results.filter((c) => c.path === t.chemin);
      expect(constats.map((c) => [c.check_id, c.start.line])).toContainEqual([
        `${PREFIXE_MAISON}${t.regle}`,
        t.ligneFautive,
      ]);
    }
  );

  it('REQ-QA-011 → REQ-SEC-008 — le verdict de la preuve est VERT, et les règles exécutées sont celles des témoins', () => {
    expect(preuve.code, preuve.lignes.join('\n')).toBe(0);
    const executees = (preuve.passage.sortie!.time.rules as string[]).map((id) =>
      id.slice(PREFIXE_MAISON.length)
    );
    expect([...executees].sort()).toEqual([REGLE_PRISMA, REGLE_SQL].sort());
  });
});

describe('REQ-QA-013 — la contre-épreuve : SANS --disable-nosem, les jumeaux se taisent', () => {
  // Sans elle, un jumeau mal formé (commentaire que semgrep ne reconnaît pas) passerait pour la
  // preuve que `--disable-nosem` agit. Elle montre aussi ce qu'on obtient en retirant l'option :
  // la preuve ROUGIT en nommant chaque jumeau — c'est le mutant « retirer --disable-nosem ».
  it(
    'REQ-QA-013 — retirer --disable-nosem fait rougir la preuve en nommant CHAQUE jumeau, et lui seul',
    () => {
      const sansOption = OPTIONS_FIXES.filter((o) => o !== '--disable-nosem');
      expect(sansOption.length).toBe(OPTIONS_FIXES.length - 1);
      const v = executerPreuve(REGLES, sansOption);
      expect(v.code).toBe(1);
      const muets = v.fautes.filter((f) => f.famille === 'temoin_muet').map((f) => f.message);
      for (const j of jumeaux) {
        expect(
          muets.some((m) => m.startsWith(`${j.nom} (`)),
          j.nom
        ).toBe(true);
      }
      expect(muets.length).toBe(jumeaux.length);
    },
    DELAI
  );
});

describe('REQ-QA-013 — une règle maison sans témoin rougit en étant NOMMÉE', () => {
  it('REQ-QA-013 — jugement pur : règle orpheline et témoin sans règle sont nommés', () => {
    const orpheline = jugerEnsemble([REGLE_PRISMA, REGLE_SQL, 'axion-troisieme'], TEMOINS);
    expect(orpheline.map((f) => [f.famille, f.message.includes('axion-troisieme')])).toEqual([
      ['regle_sans_temoin', true],
    ]);
    const disparue = jugerEnsemble([REGLE_PRISMA], TEMOINS);
    expect(disparue.map((f) => f.famille).sort()).toEqual(['plancher_maison', 'temoin_sans_regle']);
    expect(disparue.some((f) => f.message.includes(REGLE_SQL))).toBe(true);
    expect(jugerEnsemble([REGLE_PRISMA, REGLE_SQL], TEMOINS)).toEqual([]);
    expect(PLANCHER_MAISON).toBeGreaterThan(0);
  });

  it(
    'REQ-QA-013 — le BINAIRE, sur une copie des règles portant une troisième règle, sort NON NUL en la nommant',
    () => {
      const dossier = mkdtempSync(join(tmpdir(), 'sg-copie-'));
      try {
        const copie = join(dossier, 'regles.yml');
        const troisieme = [
          '  - id: axion-regle-orpheline',
          '    message: regle ajoutee sans temoin',
          '    severity: ERROR',
          '    languages: [typescript]',
          '    pattern: eval(...)',
          '',
        ].join('\n');
        writeFileSync(copie, `${readFileSync(REGLES, 'utf8').trimEnd()}\n${troisieme}`);
        const r = binaire('--prove', '--regles', copie);
        expect(r.code, r.sortie).toBe(1);
        expect(r.sortie).toContain('[regle_sans_temoin]');
        expect(r.sortie).toContain('axion-regle-orpheline');
      } finally {
        rmSync(dossier, { recursive: true, force: true });
      }
    },
    DELAI
  );
});

describe('REQ-QA-013 — le dépôt réel : zéro constat, et le compte des règles RÉELLEMENT exécutées', () => {
  it(
    'REQ-QA-013 — `pnpm sec:semgrep` sort 0 et imprime maison ≥ plancher et publiques ≥ 1, lus dans la sortie de semgrep',
    () => {
      const r = binaire();
      expect(r.code, r.sortie).toBe(0);
      const m = r.sortie.match(/(\d+) règles exécutées — (\d+) maison \([^)]*\), (\d+) publiques/);
      expect(m, r.sortie).not.toBeNull();
      const [total, maison, publiques] = [Number(m![1]), Number(m![2]), Number(m![3])];
      expect(maison).toBeGreaterThanOrEqual(PLANCHER_MAISON);
      expect(publiques).toBeGreaterThanOrEqual(PLANCHER_PUBLIC);
      expect(total).toBe(maison + publiques);
      const f = r.sortie.match(/(\d+) fichier\(s\) analysé\(s\) sur (\d+) présent\(s\)/);
      expect(f, r.sortie).not.toBeNull();
      expect(Number(f![2])).toBeGreaterThan(0);
      expect(Number(f![1])).toBe(Number(f![2]));
      // La table des exclusions est IMPRIMÉE à chaque passage, vide comprise.
      expect(r.sortie).toContain(`exclusions : ${EXCLUSIONS.length === 0 ? 'aucune' : ''}`);
    },
    DELAI
  );

  it('REQ-QA-013 — jugement pur : sans règle publique exécutée, le plancher rougit', () => {
    const passage: Passage = {
      code: 0,
      stderr: '',
      sortie: {
        version: IMAGE.split(':')[1]!.split('@')[0]!,
        results: [],
        errors: [],
        paths: { scanned: ['src/a.ts'] },
        time: { rules: [`${PREFIXE_MAISON}${REGLE_PRISMA}`, `${PREFIXE_MAISON}${REGLE_SQL}`] },
      },
    };
    expect(jugerReel(passage, ['src/a.ts']).map((f) => f.famille)).toEqual(['plancher_public']);
    const publiques = (n: number) => Array.from({ length: n }, (_, i) => `js.publique-${i}`);
    // UNE règle publique ne suffit pas : un jeu vidé ou réduit à une règle doit rougir, et
    // « au moins une » le laissait passer (revue `securite`, PR 82).
    const uneSeule: Passage = {
      ...passage,
      sortie: { ...passage.sortie!, time: { rules: [...passage.sortie!.time.rules, 'js.r'] } },
    };
    expect(jugerReel(uneSeule, ['src/a.ts']).map((f) => f.famille)).toEqual(['plancher_public']);
    const sousLePlancher: Passage = {
      ...passage,
      sortie: {
        ...passage.sortie!,
        time: { rules: [...passage.sortie!.time.rules, ...publiques(PLANCHER_PUBLIC - 1)] },
      },
    };
    expect(jugerReel(sousLePlancher, ['src/a.ts']).map((f) => f.famille)).toEqual([
      'plancher_public',
    ]);
    const avecPublique: Passage = {
      ...passage,
      sortie: {
        ...passage.sortie!,
        time: { rules: [...passage.sortie!.time.rules, ...publiques(PLANCHER_PUBLIC)] },
      },
    };
    expect(jugerReel(avecPublique, ['src/a.ts'])).toEqual([]);
    // Un constat sur le dépôt réel est une faute, quel que soit le code de sortie de semgrep.
    const constat = {
      check_id: `${PREFIXE_MAISON}${REGLE_SQL}`,
      path: 'src/a.ts',
      start: { line: 3 },
    };
    const fautif: Passage = {
      ...avecPublique,
      sortie: { ...avecPublique.sortie!, results: [constat] },
    };
    expect(jugerReel(fautif, ['src/a.ts']).map((f) => f.famille)).toEqual(['constat']);
    // Un code hors de {0, 1} est un passage qui a échoué, même avec un JSON propre.
    expect(jugerReel({ ...avecPublique, code: 2 }, ['src/a.ts']).map((f) => f.famille)).toEqual([
      'code_inattendu',
    ]);
    // Zéro fichier présent : le vert ne dirait rien.
    expect(jugerReel(avecPublique, []).map((f) => f.famille)).toEqual(['perimetre_vide']);
    // Une autre version que l'épinglée, une erreur rapportée, ou rien de lisible : refus nommés.
    const ailleurs = { ...avecPublique, sortie: { ...avecPublique.sortie!, version: '0.0.0' } };
    expect(jugerReel(ailleurs, ['src/a.ts']).map((f) => f.famille)).toEqual(['version_divergente']);
    const erreur = {
      ...avecPublique,
      sortie: { ...avecPublique.sortie!, errors: [{ type: 'x' }] },
    };
    expect(jugerReel(erreur, ['src/a.ts']).map((f) => f.famille)).toEqual(['erreur_semgrep']);
    expect(
      jugerReel({ code: 2, stderr: 'x', sortie: null }, ['src/a.ts']).map((f) => f.famille)
    ).toEqual(['semgrep_n_a_pas_tourne']);
    // Un fichier présent et non analysé est une faute, pas un silence.
    expect(jugerReel(passage, ['src/a.ts', 'src/b.ts']).map((f) => f.famille)).toContain(
      'fichier_non_analyse'
    );
  });
});

describe('REQ-QA-013 — l’instrument est épinglé et ses options ne se négocient pas', () => {
  it('REQ-QA-013 — l’image porte version ET condensat ; une image sans condensat est refusée en étant nommée', () => {
    expect(verifierImage(IMAGE)).toEqual([]);
    expect(verifierImage('semgrep/semgrep:latest').map((f) => f.famille)).toEqual([
      'image_non_epinglee',
    ]);
    expect(verifierImage('semgrep/semgrep:1.176.1').map((f) => f.famille)).toEqual([
      'image_non_epinglee',
    ]);
  });

  it('REQ-QA-013 — docker reçoit l’image épinglée, les options fixes, les jeux publics et la cible `.`', () => {
    const args = argumentsDocker({
      racine: RACINE,
      regles: REGLES,
      ignoreVide: join(RACINE, 'x'),
      jeuxPublics: JEUX_PUBLICS,
      exclusions: EXCLUSIONS,
      options: OPTIONS_FIXES,
      image: IMAGE,
    });
    expect(args.slice(0, 2)).toEqual(['run', '--rm']);
    expect(args).toContain(IMAGE);
    for (const o of OPTIONS_FIXES) expect(args).toContain(o);
    for (const j of JEUX_PUBLICS) expect(args.join(' ')).toContain(`--config ${j}`);
    expect(args.at(-1)).toBe('.');
  });
});

describe('REQ-QA-013 — Gate A lance semgrep, sans tolérance', () => {
  /** Les étapes du job `gate-a`, chacune avec son texte. Lecture de lignes : pas de YAML ici. */
  function etapesDeGateA(ci: string): string[] {
    const lignes = ci.split('\n');
    const debut = lignes.findIndex((l) => /^ {2}gate-a:\s*$/.test(l));
    expect(debut, 'job gate-a introuvable').toBeGreaterThanOrEqual(0);
    const fin = lignes.findIndex((l, i) => i > debut && /^ {2}\S/.test(l));
    const corps = lignes.slice(debut, fin < 0 ? undefined : fin);
    const etapes: string[] = [];
    for (const l of corps) {
      if (/^ {6}- /.test(l)) etapes.push(l);
      else if (etapes.length > 0) etapes[etapes.length - 1] += `\n${l}`;
    }
    return etapes;
  }

  it.each(['pnpm sec:semgrep', 'pnpm sec:semgrep:prove'])(
    'REQ-QA-013 — l’étape `%s` existe dans gate-a, sans `continue-on-error` ni `if:`',
    (commande) => {
      const etapes = etapesDeGateA(readFileSync('.github/workflows/ci.yml', 'utf8'));
      const la = etapes.filter((e) => e.split('\n').some((l) => l.trim() === `run: ${commande}`));
      expect(la.length, `aucune étape « run: ${commande} » dans gate-a`).toBe(1);
      expect(la[0]).not.toMatch(/continue-on-error/);
      expect(la[0]).not.toMatch(/^\s*if:/m);
    }
  );

  it('REQ-QA-013 — les scripts package.json lancent CET exécuteur', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<
      string,
      string
    >;
    expect(scripts['sec:semgrep']).toBe(`tsx ${SCRIPT}`);
    expect(scripts['sec:semgrep:prove']).toBe(`tsx ${SCRIPT} --prove`);
  });
});
