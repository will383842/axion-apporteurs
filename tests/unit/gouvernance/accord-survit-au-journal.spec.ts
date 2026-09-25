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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** La PR jugée, son entrée, et le texte de cette entrée à la tête : un seul titre, le sien. */
const NUMERO = 116;
const TEXTE_ENTREE = '## PR #116 — 2026-09-23 — un titre\n\n**Fait.** une phrase.\n';
const PR116 = { numero: NUMERO, lire: (_chemin: string): string | null => TEXTE_ENTREE };

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
    numero: NUMERO,
    lireALaTete: () => TEXTE_ENTREE,
  });
}

// ── la DÉCISION, pure : aucun `git`, aucun système de fichiers ───────────────

describe('REQ-GOV-011 — la décision de survie, séparée de la mesure', () => {
  it('REQ-GOV-011 · `securite` survit à un delta entièrement sous docs/journal/', () => {
    const s = LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-116.md'], PR116);
    expect(s.survit).toBe(true);
  });

  it('REQ-GOV-011 · `exactitude` NE survit PAS au MÊME delta : la prose est sa matière', () => {
    // Le même delta, à la virgule près, que le témoin précédent. Seule la lentille varie (RM-11).
    const s = LECTEUR.accordSurvit('exactitude', ['docs/journal/2026-09-pr-116.md'], PR116);
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.motif).toContain('exactitude');
  });

  it('REQ-GOV-011 · un delta VIDE laisse survivre toute lentille sauf `exactitude`', () => {
    expect(LECTEUR.accordSurvit('mutation', [], PR116).survit).toBe(true);
    expect(LECTEUR.accordSurvit('exactitude', [], PR116).survit).toBe(false);
  });

  it('REQ-GOV-011 · `docs/tasks.json` PÉRIME : la garde y lit sensible, schema et paths', () => {
    const s = LECTEUR.accordSurvit(
      'securite',
      ['docs/journal/2026-09-pr-116.md', 'docs/tasks.json'],
      PR116
    );
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.motif).toContain('docs/tasks.json');
  });

  it('REQ-GOV-011 · `docs/requirements.json` PÉRIME, au même titre', () => {
    expect(LECTEUR.accordSurvit('securite', ['docs/requirements.json'], PR116).survit).toBe(false);
  });

  it('REQ-GOV-011 · une VUE DÉRIVÉE périme : si la vue a changé, sa source a changé', () => {
    for (const vue of ['docs/PLAN-STATE.md', 'docs/TASKS.md', 'docs/TRACABILITE.md']) {
      expect(LECTEUR.accordSurvit('securite', [vue], PR116).survit, vue).toBe(false);
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
      expect(LECTEUR.accordSurvit('securite', [doc], PR116).survit, doc).toBe(false);
    }
  });

  it('REQ-GOV-011 · le code produit périme, évidemment — et le motif le NOMME', () => {
    const s = LECTEUR.accordSurvit('securite', ['scripts/lot/revues.ts'], PR116);
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.motif).toContain('scripts/lot/revues.ts');
  });

  it('REQ-GOV-011 · ÉCHEC FERMÉ : un delta incalculable (`null`) périme, et le refus le dit', () => {
    const s = LECTEUR.accordSurvit('securite', null, PR116);
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.fichiers).toBeNull();
    expect(s.motif).toMatch(/calcul|mesur/i);
  });

  it('REQ-GOV-011 · un chemin qui REMONTE hors du journal ne passe pas pour du journal', () => {
    expect(LECTEUR.accordSurvit('securite', ['docs/journal/../tasks.json'], PR116).survit).toBe(
      false
    );
    expect(LECTEUR.accordSurvit('securite', ['docs/journalier/note.md'], PR116).survit).toBe(false);
  });

  it('REQ-GOV-011 · le préfixe se lit au DÉBUT du chemin, jamais n’importe où dedans', () => {
    // 🔴 MESURÉ PAR LA LENTILLE `mutation` : `includes` à la place de `startsWith` survivait aux
    // 229 témoins du périmètre, et faisait SURVIVRE `src/docs/journal/note.ts` — du code produit.
    // Le code livré refuse ces chemins ; aucun témoin ne le fixait.
    for (const f of [
      'src/docs/journal/note.ts',
      'packages/docs/journal/2026-09.md',
      'scripts/lot/docs/journal/x.ts',
    ]) {
      expect(LECTEUR.accordSurvit('securite', [f], PR116).survit, f).toBe(false);
    }
  });

  // ── le préfixe désigne une ENTRÉE, pas un DOSSIER ─────────────────────────

  it('REQ-GOV-011 · le README du journal PÉRIME : c’est la CONFIGURATION du dossier, pas une entrée', () => {
    const s = LECTEUR.accordSurvit(
      'securite',
      [`${LECTEUR.CHEMIN_DU_JOURNAL}${LECTEUR.CONFIGURATION_DU_DOSSIER}`],
      PR116
    );
    expect(s.survit).toBe(false);
    if (s.survit) return;
    expect(s.motif).toContain(LECTEUR.CONFIGURATION_DU_DOSSIER);
  });

  it('REQ-GOV-011 · LA PRÉMISSE, MESURÉE : deux gardes bloquantes désignent ce README PAR SON NOM', () => {
    // POURQUOI l'exclusion existe, mesuré plutôt que cru. Ce fichier porte la ligne du PLANCHER du
    // journal, et DEUX gardes bloquantes de `gate-a` en DÉRIVENT le nombre : `gov:attributions`
    // (le plancher EXEMPTE des tâches de toute attestation de lot — `lot_sous_plancher`) et
    // `gov:etat` (il fait taire `pr_fusionnee_sans_journal`). Un commit qui ne changerait QUE ce
    // nombre éteindrait les deux pendant que les accords de `securite`, `simplicite`, `schema` et
    // `mutation` survivraient — et le `detail` publié affirmerait « le delta ne juge aucun code ».
    // Le nombre du plancher n'est PAS recopié ici (RM-01) : ce témoin ne lit que le NOM du fichier.
    const readme = `${LECTEUR.CHEMIN_DU_JOURNAL}${LECTEUR.CONFIGURATION_DU_DOSSIER}`;
    for (const garde of ['scripts/gates/gov-attributions.ts', 'scripts/gates/gov-etat.ts']) {
      // `.includes()` plutôt que `toContain` : le refus dirait sinon le fichier ENTIER, et un
      // rouge illisible est un rouge qu'on apprend à survoler.
      expect(readFileSync(garde, 'utf8').includes(readme), `${garde} ne cite pas ${readme}`).toBe(
        true
      );
    }
  });

  it('REQ-GOV-011 · le README périme quelle que soit sa CASSE et à n’importe quelle profondeur', () => {
    // Un système de fichiers insensible à la casse — celui de cette machine — sert le MÊME fichier
    // sous les trois formes. Le sens de cette insensibilité-ci est le sens FERMÉ : elle périme
    // davantage, jamais moins.
    for (const f of [
      'docs/journal/readme.md',
      'docs/journal/ReadMe.MD',
      'docs/journal/2026-10/README.md',
    ]) {
      expect(LECTEUR.accordSurvit('securite', [f], PR116).survit, f).toBe(false);
    }
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : une ENTRÉE du même dossier survit, et un README dans le même delta périme tout', () => {
    // Sans ce contre-témoin, périmer TOUT `docs/journal/` — c'est-à-dire annuler la tâche —
    // passerait les trois témoins ci-dessus.
    expect(LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-116.md'], PR116).survit).toBe(
      true
    );
    expect(
      LECTEUR.accordSurvit(
        'securite',
        [
          'docs/journal/2026-09-pr-116.md',
          `${LECTEUR.CHEMIN_DU_JOURNAL}${LECTEUR.CONFIGURATION_DU_DOSSIER}`,
        ],
        PR116
      ).survit
    ).toBe(false);
  });

  it('REQ-GOV-011 · la liste blanche est la FORME d’une entrée par PR : tout autre fichier du journal PÉRIME', () => {
    // 🔴 LE DÉFAUT QUE CE TÉMOIN FERME, relevé par la lentille `securite` (revue 5307855596) : la
    // liste blanche désignait le DOSSIER, et une exclusion nommée (le README) n'en retranchait
    // qu'un fichier. Or `gov:attributions` lit TOUT fichier suivi de `docs/journal/` : le fichier
    // MENSUEL porte des entrées d'autres PR, qui attestent leurs lots ; un fichier de lot, un
    // fichier de données, un sous-dossier ne sont pas l'entrée de CETTE PR. En cas de doute, on
    // exclut : seule survit la forme `docs/journal/AAAA-MM-pr-<n>.md`.
    for (const f of [
      'docs/journal/2026-09.md',
      'docs/journal/2026-09-lot-L-1-04.md',
      'docs/journal/plancher.json',
      'docs/journal/notes.md',
      'docs/journal/2026-10/2026-10-pr-1.md',
      'docs/journal/2026-09-pr-116.md.bak',
      'docs/journal/2026-09-pr-.md',
      'docs/journal/2026-09-PR-116.md',
      'docs/journal/x2026-09-pr-116.md',
    ]) {
      expect(LECTEUR.accordSurvit('securite', [f], PR116).survit, f).toBe(false);
    }
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN de la forme : des entrées par PR survivent, sauf pour `exactitude`', () => {
    const entrees = ['docs/journal/2026-09-pr-116.md', 'docs/journal/2026-10-pr-116.md'];
    for (const l of ['securite', 'simplicite', 'schema', 'mutation']) {
      expect(LECTEUR.accordSurvit(l, entrees, PR116).survit, l).toBe(true);
    }
    expect(LECTEUR.accordSurvit(LECTEUR.LENTILLE_DE_LA_PROSE, entrees, PR116).survit).toBe(false);
  });

  it('REQ-GOV-011 · l’entrée d’une AUTRE PR périme : seule survit celle de la PR jugée', () => {
    // 🔴 LA FAILLE QUE CE TÉMOIN FERME : `gov:attributions` lit chaque titre « PR #<n> » de tout
    // fichier du journal comme l'attestation de la PR n. Réécrire l'entrée de la PR 102 depuis la
    // PR 116 change ce qui atteste le lot de la 102 : ce n'est pas de la prose de CETTE PR.
    const s = LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-102.md'], PR116);
    expect(s.survit).toBe(false);
    const lecture = lireAvecDelta(tourComplet(ACCORD), ['docs/journal/2026-09-pr-102.md']);
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.coche).toBe(false);
    // Et sans numéro de PR, aucune entrée ne peut être la sienne : échec FERMÉ.
    expect(
      LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-116.md'], {
        numero: null,
        lire: () => TEXTE_ENTREE,
      }).survit
    ).toBe(false);
  });

  it('REQ-GOV-011 · un titre d’entrée d’une AUTRE PR dans l’entrée de la PR jugée périme', () => {
    // 🔴 LA MÊME FAILLE PAR L'INTÉRIEUR : `gov:attributions` ne lie pas un titre « PR #N » au
    // fichier `…-pr-N.md` — elle coupe TOUT fichier du journal sur « ## » et lit le numéro du
    // titre. Un « ## PR #999 — » ajouté dans l'entrée de la 116 attesterait le lot de la 999.
    for (const titre of [
      '## PR #999 — 2026-09-25 — un faux',
      '## PR #1160 — 2026-09-25 — un préfixe du bon numéro',
      '### PR #999 — 2026-09-25 — un niveau de plus',
      '## une section sans numéro',
    ]) {
      const s = LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-116.md'], {
        numero: NUMERO,
        lire: () => `${TEXTE_ENTREE}\n${titre}\n`,
      });
      expect(s.survit, titre).toBe(false);
    }
    // Un titre CACHÉ derrière un retour chariot seul (`\r`) : `gov:etat` coupe aussi sur `\r`, la
    // règle de survie doit donc le voir (dette relevée par `securite`, revue 5316791878).
    expect(
      LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-116.md'], {
        numero: NUMERO,
        lire: () => `${TEXTE_ENTREE}\rsuite\r## PR #999 — 2026-09-25 — caché\n`,
      }).survit
    ).toBe(false);
    // Une entrée devenue illisible à la tête (supprimée, `git` en échec) : échec FERMÉ.
    expect(
      LECTEUR.accordSurvit('securite', ['docs/journal/2026-09-pr-116.md'], {
        numero: NUMERO,
        lire: () => null,
      }).survit
    ).toBe(false);
  });

  it('REQ-GOV-011 · la lentille de la PROSE a UNE seule source : celle qu’exige tout risque est celle qui ne survit à rien', () => {
    // 🔴 LA PANNE QUE CE TÉMOIN FERME, relevée par la lentille `securite` : le littéral
    // `exactitude` était écrit DEUX fois — dans la liste des lentilles exigées et dans la règle de
    // survie. Renommer l'un faisait cesser l'autre de mordre, et le sens de la panne est
    // PERMISSIF : la lentille qui juge la prose survivrait à une réécriture de prose.
    for (const risque of [
      { niveau: 'ordinaire', schema: false, raisons: [] },
      { niveau: 'eleve', schema: false, raisons: [] },
      { niveau: 'eleve', schema: true, raisons: [] },
    ] as LECTEUR.Risque[]) {
      expect(LECTEUR.lentillesExigees(risque).toutes, JSON.stringify(risque)).toContain(
        LECTEUR.LENTILLE_DE_LA_PROSE
      );
    }
    expect(LECTEUR.accordSurvit(LECTEUR.LENTILLE_DE_LA_PROSE, [], PR116).survit).toBe(false);
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
  it('REQ-GOV-011 · une entrée devenue LIEN SYMBOLIQUE est illisible : seul un fichier ordinaire se lit', () => {
    // 🔴 VETO `securite` (revue 5316791878) : `git show tête:chemin` d'un mode 120000 rend la CIBLE
    // du lien, pas le contenu que `gov:etat` et `gov:attributions` lisent en suivant le lien. Le
    // lien est posé dans l'INDEX (`--cacheinfo 120000`) : même objet que sur Linux, sans dépendre
    // du droit de créer un lien sur le système de fichiers de la machine.
    const dir = depotJetable();
    ecrireEtCommiter(
      dir,
      {
        'docs/journal/2026-09-pr-116.md': `${TEXTE_ENTREE}\n`,
        'docs/journal/2026-09-pr-999.md': '## PR #999 — 2026-09-25 — une entrée étrangère\n',
      },
      'chore: socle'
    );
    const ordinaire = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
    expect(LECTEUR.contenuALaTete(ordinaire.trim(), 'docs/journal/2026-09-pr-116.md', dir)).toBe(
      `${TEXTE_ENTREE}\n`
    );
    const cible = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: dir,
      encoding: 'utf8',
      input: '2026-09-pr-999.md',
    }).trim();
    execFileSync(
      'git',
      ['update-index', '--cacheinfo', `120000,${cible},docs/journal/2026-09-pr-116.md`],
      { cwd: dir, stdio: 'ignore' }
    );
    execFileSync('git', ['commit', '-m', 'chore: lien'], { cwd: dir, stdio: 'ignore' });
    const lien = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    expect(LECTEUR.contenuALaTete(lien, 'docs/journal/2026-09-pr-116.md', dir)).toBeNull();
  });

  it('REQ-GOV-011 · un commit qui ne touche que le journal rend EXACTEMENT ce fichier', () => {
    const dir = depotJetable();
    const c = ecrireEtCommiter(
      dir,
      {
        'scripts/lot/revues.ts': 'export const x = 1;\n',
        'docs/journal/2026-09-pr-116.md': 'un neuvieme tour\n',
      },
      'chore: socle'
    );
    const t = ecrireEtCommiter(
      dir,
      { 'docs/journal/2026-09-pr-116.md': 'un tour de plus\n' },
      'fix: retirer l’ordinal non mesuré'
    );
    expect(LECTEUR.fichiersEntre(c, t, dir)).toEqual(['docs/journal/2026-09-pr-116.md']);
    // Et la chaîne entière : la mesure nourrit la décision, et l'accord SURVIT.
    expect(
      LECTEUR.accordSurvit('securite', LECTEUR.fichiersEntre(c, t, dir), {
        numero: NUMERO,
        lire: (f) => LECTEUR.contenuALaTete(t, f, dir),
      }).survit
    ).toBe(true);
  });

  it('REQ-GOV-011 · L’ATTAQUE DU PLANCHER, de bout en bout : 27 → 9999 dans le README périme les accords', () => {
    // Le scénario exact de la revue `securite` 5307855596, joué contre un vrai `git` : accords
    // posés au commit C, puis une tête T qui ne change QUE le nombre du plancher. Deux gardes
    // bloquantes s'éteindraient ; aucun accord ne doit survivre.
    const dir = depotJetable();
    const ligne = (n: number) =>
      `# Le journal\n\nPlancher : le journal couvre les PR de numéro **> ${n}**.\n`;
    const c = ecrireEtCommiter(
      dir,
      {
        'scripts/lot/revues.ts': 'export const x = 1;\n',
        'docs/journal/README.md': ligne(27),
        'docs/journal/2026-09-pr-116.md': 'une entrée\n',
      },
      'chore: socle'
    );
    const t = ecrireEtCommiter(dir, { 'docs/journal/README.md': ligne(9999) }, 'docs: plancher');
    const lecture = LECTEUR.lireRevues({
      revues: tourComplet(c),
      risque: ELEVE,
      tete: t,
      auteurPoste: 'A05',
      fichiersEntre: (a, b) => LECTEUR.fichiersEntre(a, b, dir),
      numero: NUMERO,
      lireALaTete: (t, f) => LECTEUR.contenuALaTete(t, f, dir),
    });
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.perimees.map((v) => v.lentille).sort()).toEqual([
      'exactitude',
      'mutation',
      'securite',
      'simplicite',
    ]);
    expect(lecture.coche).toBe(false);

    // CONTRE-TÉMOIN, même dépôt, même commit d'accord : une tête qui ne touche QUE l'entrée de la
    // PR laisse survivre les trois lentilles hors prose, et périme `exactitude`.
    execFileSync('git', ['checkout', '--quiet', c], { cwd: dir, stdio: 'ignore' });
    const t2 = ecrireEtCommiter(
      dir,
      { 'docs/journal/2026-09-pr-116.md': 'une entrée corrigée\n' },
      'docs: journal'
    );
    const lecture2 = LECTEUR.lireRevues({
      revues: tourComplet(c),
      risque: ELEVE,
      tete: t2,
      auteurPoste: 'A05',
      fichiersEntre: (a, b) => LECTEUR.fichiersEntre(a, b, dir),
      numero: NUMERO,
      lireALaTete: (t, f) => LECTEUR.contenuALaTete(t, f, dir),
    });
    expect(lecture2.survivantes.map((v) => v.lentille).sort()).toEqual([
      'mutation',
      'securite',
      'simplicite',
    ]);
    expect(lecture2.perimees.map((v) => v.lentille)).toEqual([LECTEUR.LENTILLE_DE_LA_PROSE]);
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
    expect(LECTEUR.accordSurvit('securite', LECTEUR.fichiersEntre(c, t, dir), PR116).survit).toBe(
      false
    );
  });

  it('REQ-GOV-011 · un renommage VERS le journal rend AUSSI ses deux chemins — le sens qui mord', () => {
    // `--no-renames` ferme DEUX sens, et la prose n'en nommait qu'un. Celui-ci est le plus grave :
    // avec la détection de renommage, un document NORMATIF déplacé vers `docs/journal/` ne serait
    // rendu que par sa destination — donc « entièrement sous le journal » — et l'accord
    // survivrait à la SUPPRESSION de ce document.
    const dir = depotJetable();
    const c = ecrireEtCommiter(dir, { 'docs/CONVENTIONS.md': 'la regle\n' }, 'chore: socle');
    // `git mv` ne crée pas le dossier de destination : il refuse, et le refus dirait « Command
    // failed » sans dire quoi. Le dossier se pose avant.
    mkdirSync(join(dir, 'docs/journal'), { recursive: true });
    execFileSync('git', ['mv', 'docs/CONVENTIONS.md', 'docs/journal/2026-09-pr-116.md'], {
      cwd: dir,
      stdio: 'ignore',
    });
    execFileSync('git', ['commit', '-m', 'chore: deplacer vers le journal'], {
      cwd: dir,
      stdio: 'ignore',
    });
    const t = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    expect(LECTEUR.fichiersEntre(c, t, dir)?.sort()).toEqual([
      'docs/CONVENTIONS.md',
      'docs/journal/2026-09-pr-116.md',
    ]);
    expect(LECTEUR.accordSurvit('securite', LECTEUR.fichiersEntre(c, t, dir), PR116).survit).toBe(
      false
    );
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
    const lecture = lireAvecDelta(tourComplet(ACCORD), ['docs/journal/2026-09-pr-116.md']);
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
    const lecture = lireAvecDelta(revues, ['docs/journal/2026-09-pr-116.md']);
    expect(lecture.perimees).toEqual([]);
    expect(lecture.coche).toBe(true);
    expect(lecture.survivantes.map((s) => s.lentille).sort()).toEqual([
      'mutation',
      'securite',
      'simplicite',
    ]);
  });

  it('REQ-GOV-013 · la survie est IMPRIMÉE : poste, lentille, les deux sha, et les fichiers', () => {
    const lecture = lireAvecDelta(tourComplet(ACCORD), ['docs/journal/2026-09-pr-116.md']);
    const s = lecture.survivantes.find((x) => x.lentille === 'securite');
    expect(s).toBeDefined();
    if (s === undefined) return;
    expect(s.code).toBe('A09');
    expect(s.commit).toBe(ACCORD);
    expect(s.tete).toBe(TETE);
    expect(s.fichiers).toEqual(['docs/journal/2026-09-pr-116.md']);
    // La PHRASE, dérivée une seule fois : c'est elle que `gov:pr` imprime. Un lecteur doit pouvoir
    // contester la survie sans relire le code — donc les cinq faits y sont.
    const ligne = LECTEUR.direLaSurvivance(s);
    expect(ligne).toContain('A09');
    expect(ligne).toContain('securite');
    expect(ligne).toContain(ACCORD.slice(0, 7));
    expect(ligne).toContain(TETE.slice(0, 7));
    expect(ligne).toContain('docs/journal/2026-09-pr-116.md');
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
    const lecture = lireAvecDelta(revues, ['docs/journal/2026-09-pr-116.md']);
    expect(lecture.coche).toBe(true);
    expect(lecture.detail).toContain('SURVIT');
    expect(lecture.detail).toContain('docs/journal/2026-09-pr-116.md');
  });

  it('REQ-GOV-013 · un delta qui touche `docs/tasks.json` périme les QUATRE lentilles', () => {
    const lecture = lireAvecDelta(tourComplet(ACCORD), [
      'docs/journal/2026-09-pr-116.md',
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

  it('REQ-GOV-013 · un delta qui touche le README du journal périme les QUATRE lentilles', () => {
    // L'attaque, de bout en bout : une tête qui ne change QUE le nombre du plancher éteindrait
    // `gov:attributions` et `gov:etat` pendant que trois accords survivraient — et le `detail`
    // publié affirmerait « le delta ne juge aucun code ». Il le dit désormais du delta entier.
    const readme = `${LECTEUR.CHEMIN_DU_JOURNAL}${LECTEUR.CONFIGURATION_DU_DOSSIER}`;
    const lecture = lireAvecDelta(tourComplet(ACCORD), [readme]);
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.perimees.map((v) => v.lentille).sort()).toEqual([
      'exactitude',
      'mutation',
      'securite',
      'simplicite',
    ]);
    expect(lecture.coche).toBe(false);
    expect(lecture.detail).toContain(readme);
    expect(lecture.detail).not.toContain('SURVIT');
  });

  it('REQ-GOV-013 · « Relecteur ≠ auteur » est INDÉPENDANTE de la survie : un accord survivant ne lave aucune relecture par l’auteur', () => {
    // 🔴 L'ADJACENCE MESURÉE PAR LA LENTILLE `mutation` : `survivantes` est désormais dans la
    // portée lexicale d'où `auteurSeRelit` est calculé. Un filtre `&& !survivantes.some(...)`
    // laissait les 229 témoins du périmètre verts, `relecteur_est_auteur` de `gov:pr --prove`
    // comprise, et cochait la case de DoD sur une PR relue par son propre auteur.
    // Ici TOUS les accords de l'auteur survivent : c'est le seul cas où le filtre mordrait.
    const revues = [
      avis('A02', 'exactitude', TETE),
      avis('A09', 'securite', ACCORD),
      avis('A09', 'simplicite', ACCORD),
      avis('A10', 'mutation', ACCORD),
    ];
    const lecture = LECTEUR.lireRevues({
      revues,
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A09',
      fichiersEntre: () => ['docs/journal/2026-09-pr-116.md'],
      numero: NUMERO,
      lireALaTete: () => TEXTE_ENTREE,
    });
    expect(lecture.survivantes.map((s) => s.lentille).sort()).toEqual([
      'mutation',
      'securite',
      'simplicite',
    ]);
    expect(lecture.auteurSeRelit.map((v) => v.lentille).sort()).toEqual(['securite', 'simplicite']);
    expect(lecture.coche).toBe(false);
    expect(lecture.raisons.some((r) => r.includes('A09'))).toBe(true);
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
        numero: NUMERO,
        lireALaTete: () => TEXTE_ENTREE,
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
    const lecture = lireAvecDelta(revues, ['docs/journal/2026-09-pr-116.md']);
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
      fichiersEntre: () => ['docs/journal/2026-09-pr-116.md'],
      numero: NUMERO,
      lireALaTete: () => TEXTE_ENTREE,
    });
    expect(lecture.coche).toBe(true);
    expect(lecture.survivantes).toEqual([]);
    expect(lecture.perimees).toEqual([]);
  });
});
