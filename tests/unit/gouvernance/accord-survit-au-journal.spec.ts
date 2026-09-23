// @req REQ-GOV-011
// @req REQ-GOV-013
/**
 * accord-survit-au-journal.spec.ts — un accord de lentille survit à un commit qui ne touche que
 * le journal (REQ-GOV-011, REQ-GOV-013, GOV-095).
 *
 * 🔴 LE DÉFAUT, LU DANS LE CODE. `scripts/lot/revues.ts` liait un accord au SHA DE LA TÊTE, et
 * jamais au CODE JUGÉ :
 *
 *     accords.filter((x) => exigees.includes(x.lentille) && x.commit !== entree.tete)
 *
 * Tout commit de plus périmait donc TOUS les accords exigés, quel que soit ce qu'il change.
 *
 * LA MESURE QUI OUVRE LA TÂCHE — à rejouer, pas à recopier. Sur la branche
 * `t/gov-check-homonymie` de la demande de fusion 102 :
 *
 *     git diff --name-only 8ef35a3 8891d53   →   docs/journal/2026-09-pr-102.md
 *
 * Une phrase de prose du journal, et rien d'autre. Cette tête-là a pourtant périmé les accords de
 * `securite`, de `schema` et de `mutation`, qu'il a fallu refaire sur un code identique au bit
 * près. ⚠️ CES DEUX SHA NE SONT PAS CITÉS DANS UN TÉMOIN : la demande de fusion 102 a été
 * ÉCRASÉE à la fusion, ses commits de branche ne sont ancêtres de rien, et un clone neuf — la CI
 * au premier chef — ne les porte pas. Un témoin qui en dépendrait rougirait pour une raison qui
 * n'est pas la sienne. Les témoins ci-dessous construisent donc leur propre dépôt git.
 *
 * LA RÈGLE ÉPROUVÉE ICI, ÉTROITE EXPRÈS. Un accord rendu sur la lentille L au commit C survit à
 * la tête T si, ET SEULEMENT SI :
 *
 *   1. L n'est pas `exactitude` — cette lentille juge la PROSE, c'est sa matière ;
 *   2. ET l'ensemble des fichiers changés entre C et T est VIDE, ou entièrement contenu sous
 *      `docs/journal/`.
 *
 * ⚠️ CETTE GARDE DEVIENT PLUS PERMISSIVE, et c'est l'objection que la lentille `securite` doit
 * poser. Ce fichier est la réponse : chaque cas ambigu échoue FERMÉ, et un témoin le prouve —
 * diff incalculable, `docs/tasks.json` (que `gov:pr` LIT pour dériver le risque), vue dérivée,
 * document normatif. La liste blanche est UN SEUL préfixe : rien n'énumère les documents
 * normatifs, donc rien ne peut oublier le prochain.
 *
 * LES CONTRE-TÉMOINS SONT LA MOITIÉ DU FICHIER (RM-02, RM-11). Sans eux, une garde qui périmerait
 * TOUJOURS — c'est-à-dire le code d'avant — passerait chacun des rouges ci-dessus.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { RevueBrute } from '../../../scripts/lot/revues';
/**
 * ⚠️ L'API NEUVE SE PREND PAR ESPACE DE NOMS — même précaution que
 * `revues-lecteur-unique.spec.ts`, et pour la même raison : un import NOMMÉ d'un export qui
 * n'existe pas encore fait échouer le CHARGEMENT du module, et le témoin neuf rougirait alors sur
 * le message du chargeur au lieu du sien. RM-02 exige de voir la garde rougir POUR SA RAISON.
 */
import * as LECTEUR from '../../../scripts/lot/revues';

/** Une tête plausible, et un commit d'accord distinct : seul leur DELTA décide, jamais leur forme. */
const TETE = '954fe5a4b5c6d7e8f90123456789abcdef012345';
const ACCORD = '8ef35a3b0c1d2e3f405162738495a6b7c8d9e0f1';

/** Le risque ÉLEVÉ : quatre lentilles exigées, dont `exactitude` et `securite`. */
const ELEVE: LECTEUR.Risque = {
  niveau: 'eleve',
  schema: false,
  raisons: ['témoin : risque élevé'],
};

/**
 * Un avis d'une forme réelle : en-tête « A<nn> · <lentille> », ligne vide, décision seule sur sa
 * ligne. Aucun champ n'a de défaut sur ce que les témoins font varier (RM-11) : le poste, la
 * lentille et le commit jugé sont TOUJOURS donnés.
 */
function avis(poste: string, lentille: string, commit: string): RevueBrute {
  return {
    user: { login: 'will383842' },
    author_association: 'OWNER',
    state: LECTEUR.ETAT_APPROUVE,
    commit_id: commit,
    body: `${poste} · ${lentille}\n\nVerdict: accepte\n`,
  };
}

/** Le tour complet des quatre lentilles exigées par un risque élevé, toutes jugées au même commit. */
function tourComplet(commit: string): RevueBrute[] {
  return [
    avis('A09', 'exactitude', commit),
    avis('A09', 'securite', commit),
    avis('A09', 'simplicite', commit),
    avis('A10', 'mutation', commit),
  ];
}

/** La lecture, avec la MESURE injectée : le témoin décide du delta, jamais `git`. */
function lireAvecDelta(revues: RevueBrute[], fichiers: string[] | null) {
  return LECTEUR.lireRevues({
    revues,
    risque: ELEVE,
    tete: TETE,
    auteurPoste: 'A05',
    fichiersEntre: () => fichiers,
  });
}

// ── la DÉCISION, pure : aucun `git`, aucun système de fichiers ───────────────

describe('REQ-GOV-011 — la décision de survie, séparée de la mesure', () => {
  it('REQ-GOV-011 · `securite` survit à un delta entièrement sous docs/journal/', () => {
    const s = LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-102.md']);
    expect(s.survit).toBe(true);
  });

  it('REQ-GOV-011 · `exactitude` NE survit PAS au MÊME delta : la prose est sa matière', () => {
    // Le même delta, à la virgule près, que le témoin précédent. Seule la lentille varie (RM-11).
    const s = LECTEUR.accordSurvit('exactitude', ['docs/journal/2026-09-pr-102.md']);
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.motif).toContain('exactitude');
  });

  it('REQ-GOV-011 · un delta VIDE laisse survivre toute lentille sauf `exactitude`', () => {
    expect(LECTEUR.accordSurvit('mutation', []).survit).toBe(true);
    expect(LECTEUR.accordSurvit('exactitude', []).survit).toBe(false);
  });

  it('REQ-GOV-011 · `docs/tasks.json` PÉRIME : la garde y lit sensible, schema et paths', () => {
    const s = LECTEUR.accordSurvit('securite', [
      'docs/journal/2026-09-pr-102.md',
      'docs/tasks.json',
    ]);
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.motif).toContain('docs/tasks.json');
  });

  it('REQ-GOV-011 · `docs/requirements.json` PÉRIME, au même titre', () => {
    expect(LECTEUR.accordSurvit('securite', ['docs/requirements.json']).survit).toBe(false);
  });

  it('REQ-GOV-011 · une VUE DÉRIVÉE périme : si la vue a changé, sa source a changé', () => {
    for (const vue of ['docs/PLAN-STATE.md', 'docs/TASKS.md', 'docs/TRACABILITE.md']) {
      expect(LECTEUR.accordSurvit('securite', [vue]).survit, vue).toBe(false);
    }
  });

  it('REQ-GOV-011 · un document NORMATIF périme, sans qu’aucune liste ne l’énumère', () => {
    // La règle n'a qu'UNE liste blanche — un préfixe. Ces quatre-là périment parce qu'ils n'y
    // sont pas, pas parce qu'on a pensé à eux : c'est ce qui rend l'oubli du prochain impossible.
    for (const doc of [
      'docs/adr/0012-relecture-proportionnee-au-risque.md',
      'docs/CONVENTIONS.md',
      'docs/REGLES-MAISON.md',
      'docs/un-dossier-qui-n-existe-pas-encore/note.md',
    ]) {
      expect(LECTEUR.accordSurvit('securite', [doc]).survit, doc).toBe(false);
    }
  });

  it('REQ-GOV-011 · le code produit périme, évidemment — et le motif le NOMME', () => {
    const s = LECTEUR.accordSurvit('securite', ['scripts/lot/revues.ts']);
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.motif).toContain('scripts/lot/revues.ts');
  });

  it('REQ-GOV-011 · ÉCHEC FERMÉ : un delta incalculable (`null`) périme, et le refus le dit', () => {
    const s = LECTEUR.accordSurvit('securite', null);
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.fichiers).toBeNull();
    expect(s.motif).toMatch(/calcul|mesur/i);
  });

  it('REQ-GOV-011 · un chemin qui REMONTE hors du journal ne passe pas pour du journal', () => {
    expect(LECTEUR.accordSurvit('securite', ['docs/journal/../tasks.json']).survit).toBe(false);
    expect(LECTEUR.accordSurvit('securite', ['docs/journalier/note.md']).survit).toBe(false);
  });
});

// ── la MESURE, sur un vrai dépôt git ────────────────────────────────────────

const TEMPORAIRES: string[] = [];

afterAll(() => {
  // On ne détruit que ce qu'on a posé (RM-07).
  for (const d of TEMPORAIRES) rmSync(d, { recursive: true, force: true });
});

/** Un dépôt git RÉEL et jetable : la mesure ne se prouve que contre un vrai `git`. */
function depotJetable(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gov095-'));
  TEMPORAIRES.push(dir);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '--quiet');
  git('config', 'user.email', 'temoin@example.invalid');
  git('config', 'user.name', 'temoin');
  git('config', 'commit.gpgsign', 'false');
  return dir;
}

function ecrireEtCommiter(dir: string, fichiers: Record<string, string>, message: string): string {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    const absolu = join(dir, chemin);
    mkdirSync(dirname(absolu), { recursive: true });
    writeFileSync(absolu, contenu, 'utf8');
  }
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'ignore' });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
}

describe('REQ-GOV-011 — la mesure, contre un vrai `git`', () => {
  it('REQ-GOV-011 · un commit qui ne touche que le journal rend EXACTEMENT ce fichier', () => {
    const dir = depotJetable();
    const c = ecrireEtCommiter(
      dir,
      {
        'scripts/lot/revues.ts': 'export const x = 1;\n',
        'docs/journal/2026-09-pr-102.md': 'un neuvieme tour\n',
      },
      'chore: socle'
    );
    const t = ecrireEtCommiter(
      dir,
      { 'docs/journal/2026-09-pr-102.md': 'un tour de plus\n' },
      'fix: retirer l’ordinal non mesuré'
    );
    expect(LECTEUR.fichiersEntre(c, t, dir)).toEqual(['docs/journal/2026-09-pr-102.md']);
    // Et la chaîne entière : la mesure nourrit la décision, et l'accord SURVIT.
    expect(LECTEUR.accordSurvit('securite', LECTEUR.fichiersEntre(c, t, dir)).survit).toBe(true);
  });

  it('REQ-GOV-011 · un RENOMMAGE rend ses DEUX chemins : la source comme la destination', () => {
    const dir = depotJetable();
    const c = ecrireEtCommiter(dir, { 'docs/journal/a.md': 'texte\n' }, 'chore: socle');
    execFileSync('git', ['mv', 'docs/journal/a.md', 'docs/CONVENTIONS.md'], {
      cwd: dir,
      stdio: 'ignore',
    });
    execFileSync('git', ['commit', '-m', 'chore: deplacer'], { cwd: dir, stdio: 'ignore' });
    const t = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    // Si la mesure ne rendait que la destination, un fichier SORTI du journal passerait encore
    // pour du journal dans l'autre sens. Les deux chemins sont rendus, et l'accord périme.
    expect(LECTEUR.fichiersEntre(c, t, dir)?.sort()).toEqual([
      'docs/CONVENTIONS.md',
      'docs/journal/a.md',
    ]);
    expect(LECTEUR.accordSurvit('securite', LECTEUR.fichiersEntre(c, t, dir)).survit).toBe(false);
  });

  it('REQ-GOV-011 · ÉCHEC FERMÉ : un commit INCONNU du dépôt rend `null`, jamais une liste vide', () => {
    const dir = depotJetable();
    const t = ecrireEtCommiter(dir, { 'docs/journal/a.md': 'texte\n' }, 'chore: socle');
    expect(LECTEUR.fichiersEntre(ACCORD, t, dir)).toBeNull();
    expect(LECTEUR.fichiersEntre('', t, dir)).toBeNull();
    expect(LECTEUR.fichiersEntre('pas-un-sha', t, dir)).toBeNull();
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN de la mesure : deux têtes au code changé rendent ce fichier', () => {
    const dir = depotJetable();
    const c = ecrireEtCommiter(dir, { 'scripts/lot/revues.ts': 'const x = 1;\n' }, 'chore: socle');
    const t = ecrireEtCommiter(dir, { 'scripts/lot/revues.ts': 'const x = 2;\n' }, 'fix: corriger');
    expect(LECTEUR.fichiersEntre(c, t, dir)).toEqual(['scripts/lot/revues.ts']);
  });
});

// ── la lecture des revues, bout en bout ─────────────────────────────────────

describe('REQ-GOV-013 — la lecture complète : ce qui survit, ce qui périme, ce qui se dit', () => {
  it('REQ-GOV-013 · les trois lentilles hors `exactitude` survivent, la quatrième périme', () => {
    const lecture = lireAvecDelta(tourComplet(ACCORD), ['docs/journal/2026-09-pr-102.md']);
    expect(lecture.survivantes.map((s) => s.lentille).sort()).toEqual([
      'mutation',
      'securite',
      'simplicite',
    ]);
    expect(lecture.perimees.map((v) => v.lentille)).toEqual(['exactitude']);
    // Une lentille exigée périmée suffit à ne pas cocher : la garde reste fermée.
    expect(lecture.coche).toBe(false);
  });

  it('REQ-GOV-013 · `exactitude` rejugée sur la tête, les trois autres SURVIVENT et ça coche', () => {
    // C'est le cas que la demande de fusion 102 a payé trente avis : la prose a bougé, seule la
    // lentille qui juge la prose est reprise, et le code n'a pas à être relu trois fois de plus.
    const revues = [
      avis('A09', 'exactitude', TETE),
      avis('A09', 'securite', ACCORD),
      avis('A09', 'simplicite', ACCORD),
      avis('A10', 'mutation', ACCORD),
    ];
    const lecture = lireAvecDelta(revues, ['docs/journal/2026-09-pr-102.md']);
    expect(lecture.perimees).toEqual([]);
    expect(lecture.coche).toBe(true);
    expect(lecture.survivantes.map((s) => s.lentille).sort()).toEqual([
      'mutation',
      'securite',
      'simplicite',
    ]);
  });

  it('REQ-GOV-013 · la survie est IMPRIMÉE : poste, lentille, les deux sha, et les fichiers', () => {
    const lecture = lireAvecDelta(tourComplet(ACCORD), ['docs/journal/2026-09-pr-102.md']);
    const s = lecture.survivantes.find((x) => x.lentille === 'securite');
    expect(s).toBeDefined();
    if (s === undefined) return;
    expect(s.code).toBe('A09');
    expect(s.commit).toBe(ACCORD);
    expect(s.tete).toBe(TETE);
    expect(s.fichiers).toEqual(['docs/journal/2026-09-pr-102.md']);
    // La PHRASE, dérivée une seule fois : c'est elle que `gov:pr` imprime. Un lecteur doit pouvoir
    // contester la survie sans relire le code — donc les cinq faits y sont.
    const ligne = LECTEUR.direLaSurvivance(s);
    expect(ligne).toContain('A09');
    expect(ligne).toContain('securite');
    expect(ligne).toContain(ACCORD.slice(0, 7));
    expect(ligne).toContain(TETE.slice(0, 7));
    expect(ligne).toContain('docs/journal/2026-09-pr-102.md');
  });

  it('REQ-GOV-013 · la survie entre AUSSI dans le `detail` publié au corps de la PR', () => {
    // Sans cela le corps publierait « les 4 lentilles ont accepté sur <tête> », ce qui serait FAUX
    // pour trois d'entre elles. Une phrase calculée et fausse est pire qu'un compteur tapé.
    const revues = [
      avis('A09', 'exactitude', TETE),
      avis('A09', 'securite', ACCORD),
      avis('A09', 'simplicite', ACCORD),
      avis('A10', 'mutation', ACCORD),
    ];
    const lecture = lireAvecDelta(revues, ['docs/journal/2026-09-pr-102.md']);
    expect(lecture.coche).toBe(true);
    expect(lecture.detail).toContain('survi');
    expect(lecture.detail).toContain('docs/journal/2026-09-pr-102.md');
  });

  it('REQ-GOV-013 · un delta qui touche `docs/tasks.json` périme les QUATRE lentilles', () => {
    const lecture = lireAvecDelta(tourComplet(ACCORD), [
      'docs/journal/2026-09-pr-102.md',
      'docs/tasks.json',
    ]);
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.perimees.map((v) => v.lentille).sort()).toEqual([
      'exactitude',
      'mutation',
      'securite',
      'simplicite',
    ]);
    expect(lecture.coche).toBe(false);
  });

  it('REQ-GOV-013 · la péremption DIT son motif et les fichiers qui l’ont causée', () => {
    const lecture = lireAvecDelta(tourComplet(ACCORD), ['docs/tasks.json']);
    const p = lecture.peremptions.find((x) => x.verdict.lentille === 'securite');
    expect(p).toBeDefined();
    if (p === undefined) return;
    expect(p.fichiers).toEqual(['docs/tasks.json']);
    expect(p.motif).toContain('docs/tasks.json');
    // `perimees` est la PROJECTION de `peremptions`, jamais une seconde liste (RM-01).
    expect(lecture.perimees).toEqual(lecture.peremptions.map((x) => x.verdict));
  });

  it('REQ-GOV-011 · ÉCHEC FERMÉ de bout en bout : un accord inconnu du dépôt périme', () => {
    // AUCUNE mesure injectée : c'est le vrai `git` de CE dépôt qui répond, et ces deux sha n'y
    // sont pas. Le comportement d'avant GOV-095 est conservé à l'identique sur ce cas.
    const lecture = LECTEUR.lireRevues({
      revues: tourComplet(ACCORD),
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
    });
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.perimees.length).toBe(4);
    expect(lecture.coche).toBe(false);
    expect(lecture.peremptions.every((p) => p.fichiers === null)).toBe(true);
    expect(lecture.detail).toMatch(/calcul|mesur/i);
  });
});

// ── les contre-témoins : ce que la garde doit CONTINUER de faire ────────────

describe('REQ-GOV-013 — contre-témoins : la garde reste verte là où elle l’était', () => {
  it('REQ-GOV-013 · un tour rendu SUR LA TÊTE coche, et n’imprime AUCUNE survie', () => {
    // Le cas nominal : rien n'a bougé depuis les avis. Aucune survie n'est à déclarer, et surtout
    // la mesure n'est pas appelée — un accord sur la tête ne se compare à rien.
    let appels = 0;
    const lecture = LECTEUR.lireRevues({
      revues: tourComplet(TETE),
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
      fichiersEntre: () => {
        appels += 1;
        return [];
      },
    });
    expect(lecture.coche).toBe(true);
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.perimees).toEqual([]);
    expect(appels).toBe(0);
  });

  it('REQ-GOV-013 · une tête INCONNUE ne mesure rien et ne coche pas — comme avant', () => {
    for (const tete of [null, '']) {
      const lecture = LECTEUR.lireRevues({
        revues: tourComplet(ACCORD),
        risque: ELEVE,
        tete,
        auteurPoste: 'A05',
        fichiersEntre: () => [],
      });
      expect(lecture.coche, String(tete)).toBe(false);
      expect(lecture.survivantes, String(tete)).toEqual([]);
      expect(lecture.perimees, String(tete)).toEqual([]);
    }
  });

  it('REQ-GOV-013 · un REFUS ne survit à rien : seuls les ACCORDS sont concernés', () => {
    const revues = [
      avis('A09', 'exactitude', TETE),
      avis('A09', 'simplicite', TETE),
      avis('A10', 'mutation', TETE),
      {
        user: { login: 'will383842' },
        author_association: 'OWNER',
        state: LECTEUR.ETAT_APPROUVE,
        commit_id: ACCORD,
        body: 'A09 · securite\n\nVerdict: refuse\n',
      },
    ];
    const lecture = lireAvecDelta(revues, ['docs/journal/2026-09-pr-102.md']);
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.refusees.map((v) => v.lentille)).toEqual(['securite']);
    expect(lecture.coche).toBe(false);
  });

  it('REQ-GOV-013 · une lentille NON EXIGÉE ne survit ni ne périme : elle ne compte pas', () => {
    const ordinaire: LECTEUR.Risque = { niveau: 'ordinaire', schema: false, raisons: [] };
    const lecture = LECTEUR.lireRevues({
      revues: [
        avis('A09', 'exactitude', TETE),
        avis('A09', 'securite', TETE),
        avis('A10', 'mutation', ACCORD),
      ],
      risque: ordinaire,
      tete: TETE,
      auteurPoste: 'A05',
      fichiersEntre: () => ['docs/journal/2026-09-pr-102.md'],
    });
    expect(lecture.coche).toBe(true);
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.perimees).toEqual([]);
  });
});
