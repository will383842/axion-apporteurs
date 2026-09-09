/**
 * regles-maison.spec.ts — les règles maison et le journal des leçons (GOV-018).
 *
 * @req REQ-GOV-024
 * @req REQ-GOV-023
 *
 * C'est le test que `docs/tasks.json` déclare pour GOV-018 sous le nom `regles-maison.spec.ts`,
 * sans répertoire — l'une des 22 valeurs de `tests{}` que GOV-017b a nommées comme non résolubles.
 * Il est placé ici, et pas sous `tests/gov/`, parce que les six autres fichiers de gouvernance ont
 * déjà cette adresse : un test rangé ailleurs se cherche, et `docs/REGLES-MAISON.md` l.5 est
 * corrigé pour pointer vers l'endroit où il tourne réellement.
 *
 * CE QU'IL TIENT
 *   — REQ-GOV-024 : les TREIZE règles `RM-nn` ont chacune leur section, les NEUF que l'exigence
 *     énumère sont couvertes, et le gabarit de PR porte la ligne « Règle maison appliquée » entre
 *     ses marqueurs — la ligne que `scripts/gates/gov-pr.ts` LIT ;
 *   — REQ-GOV-024, ce que la version GOV-018 de ce fichier NE tenait PAS : elle comptait les
 *     titres `## RM-nn — …` et les lignes du tableau, et rien d'autre. Une section RÉDUITE À SON
 *     TITRE la laissait verte — or c'est justement ce qui distingue une règle d'un slogan : son
 *     énoncé, son POURQUOI (ce qui empêche qu'on la retire par commodité six mois plus tard) et la
 *     garde qui la voit. Les trois rubriques sont désormais exigées, section par section ;
 *   — REQ-GOV-024, GOV-026 : `CLAUDE.md` — le fichier d'amorçage lu par toute session ouverte dans
 *     ce dépôt — cite RM-13 PAR SON NUMÉRO (RM-12 : un identifiant nu n'est pas une référence),
 *     pointe au lieu de dupliquer (aucune ligne recopiée de `docs/PRESEANCE.md`), et ne fige aucun
 *     état daté : ni numéro de PR, ni date, ni identifiant de lot, ni compteur d'avancement. Le
 *     `CLAUDE.md` retiré de la PR 30 est mort de l'inverse ;
 *   — REQ-GOV-023, moitié « leçons » : `docs/LECONS.md` porte une date de dernière consolidation
 *     MACHINE-LISIBLE, chaque leçon cite une source vérifiable et la RM qu'elle a produite (ou dit
 *     qu'elle n'en a produit aucune), et `gov:lecons` rougit quand la consolidation a plus de sept
 *     jours ALORS QUE des « appris » attendent.
 *
 * LE ROUGE ET SES CONTRE-TÉMOINS. Le contre-témoin compte autant que le témoin : la MÊME
 * péremption sans aucune entrée en attente doit rester VERTE, sinon la garde mesure l'âge du
 * fichier et non la dette de consolidation. Et sept jours PILE reste vert : « plus de 7 jours »
 * est une borne, et une borne se prouve des deux côtés.
 *
 * Les bancs d'essai vivent dans un dossier temporaire créé ici et détruit ici : un test qui abîme
 * le dépôt pour se prouver ne prouve rien, et le nettoyage ne détruit que ce qu'il a posé.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHEMIN_RM = 'docs/REGLES-MAISON.md';
const CHEMIN_CLAUDE = 'CLAUDE.md';
const CHEMIN_PRESEANCE = 'docs/PRESEANCE.md';
const CHEMIN_REPRISE = 'docs/REPRISE-SESSION.md';
const CHEMIN_CHARTE = 'docs/CHARTE-AGENTS.md';
const CHEMIN_LECONS = 'docs/LECONS.md';
const CHEMIN_GABARIT = '.github/PULL_REQUEST_TEMPLATE.md';
const GARDE = 'scripts/gates/gov-lecons.ts';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', GARDE, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Un banc d'essai : un LECONS.md à nous, jamais celui du dépôt. */
function banc(contenu: string): { dossier: string; fichier: string } {
  const dossier = mkdtempSync(join(tmpdir(), 'lecons-'));
  const fichier = join(dossier, 'LECONS.md');
  writeFileSync(fichier, contenu, 'utf8');
  return { dossier, fichier };
}

const ENTETE = [
  '# Leçons — banc d’essai',
  '',
  '<!-- consolidation: 2026-09-03 -->',
  '',
  '## Leçons consolidées',
  '',
  '### LEC-01 — Un témoin',
  '',
  "- **Ce qui s'est passé.** Une phrase.",
  "- **Ce qu'on en tire.** Une phrase.",
  "- **Où c'est prouvé.** `ff3ef54` — `docs/lots/REPRISE-NOTES.md:30`.",
  '- **Règle maison.** RM-01.',
  '',
  '## À consolider',
  '',
  '<!-- a-consolider:debut -->',
].join('\n');

const PIED = ['<!-- a-consolider:fin -->', ''].join('\n');

/**
 * Un banc d'essai contrôle TOUTES les sources de la garde, pas une seule. Sans ces deux arguments,
 * les cas ci-dessous jugeaient un `LECONS.md` de laboratoire contre le VRAI `docs/journal/` du
 * dépôt, et rougissaient pour une raison qui n'était pas celle qu'ils testaient (RM-11 : aucun
 * défaut sur la dimension que le test fait varier). Constaté, pas supposé.
 */
const ISOLE = ['--regles', 'docs/REGLES-MAISON.md', '--journal', join(tmpdir(), 'journal-absent-gov-018')];

const avecEntrees = (entrees: string[]) => [ENTETE, ...entrees, PIED].join('\n');

describe('REQ-GOV-024 — les règles maison vivent dans le dépôt', () => {
  it('REQ-GOV-024 — docs/REGLES-MAISON.md porte RM-01 à RM-14, une section par règle', () => {
    const texte = readFileSync(CHEMIN_RM, 'utf8');
    const sections = [...texte.matchAll(/^## (RM-\d{2}) — /gm)].map((m) => m[1]!);
    // La liste est LITTÉRALE et non dérivée, exprès : c'est elle qui rougit quand une règle est
    // ajoutée — ou RETIRÉE en silence, ce qui est arrivé à celle qui est aujourd'hui RM-13. Une
    // liste dérivée du fichier qu'elle juge ne peut, par construction, jamais le contredire.
    // RM-14 y est entrée le 2026-09-05 : elle a fait rougir CETTE assertion et elle seule, ce qui
    // est le comportement voulu — une règle neuve se déclare ici, elle ne s'y glisse pas.
    expect(sections).toEqual([
      'RM-01', 'RM-02', 'RM-03', 'RM-04', 'RM-05', 'RM-06',
      'RM-07', 'RM-08', 'RM-09', 'RM-10', 'RM-11', 'RM-12', 'RM-13', 'RM-14',
    ]);
    // Le tableau de tête est une VUE des sections : une ligne sans section, ou l'inverse, et le
    // lecteur qui cite « RM-13 » cite un vide.
    const lignes = [...texte.matchAll(/^\| (RM-\d{2}) +\|/gm)].map((m) => m[1]!);
    expect(lignes).toEqual(sections);
  });

  it("REQ-GOV-024 — les neuf règles que l'exigence énumère sont chacune couvertes par une section", () => {
    const texte = readFileSync(CHEMIN_RM, 'utf8');
    const attendues: [string, RegExp][] = [
      ['RM-01', /[Dd]ériver, jamais recopier/],
      ['RM-02', /vue rougir/],
      ['RM-03', /producteur réel/],
      ['RM-04', /enum/],
      ['RM-05', /défaut = refus/],
      ['RM-06', /[Ii]ndex unique partiel/],
      ['RM-07', /appelants/],
      ['RM-08', /tiers/],
      ['RM-09', /fusion à la fois/],
    ];
    for (const [rm, motif] of attendues) {
      const section = texte.split(new RegExp(`^## ${rm} — `, 'm'))[1]?.split(/^## /m)[0] ?? '';
      const titre = new RegExp(`^## ${rm} — (.+)$`, 'm').exec(texte)?.[1] ?? '';
      expect(`${titre}\n${section}`, `${rm} ne couvre pas ce que REQ-GOV-024 lui donne`).toMatch(motif);
    }
  });

  it('REQ-GOV-024 — chaque section RM porte son énoncé, son POURQUOI et la garde qui la voit', () => {
    // CE QUE LA VERSION PRÉCÉDENTE DE CE FICHIER NE VOYAIT PAS. Elle comparait la liste des titres
    // `## RM-nn — …` à une liste littérale, et la liste des lignes du tableau à celle des titres.
    // Une section réduite à son seul titre — ou dont on aurait retiré le « Pourquoi » — passait au
    // vert. Or c'est le POURQUOI qui empêche qu'une règle soit retirée par commodité : sans lui,
    // une règle est un slogan, et un slogan se supprime sans discussion. Les douze règles livrées
    // par GOV-018 portaient déjà les trois rubriques : la garde ne fait qu'exiger la forme qu'elles
    // ont toutes, elle n'en invente aucune.
    const texte = readFileSync(CHEMIN_RM, 'utf8');
    const sections = [...texte.matchAll(/^## (RM-\d{2}) — /gm)].map((m) => m[1]!);
    for (const rm of sections) {
      const corps = texte.split(new RegExp(`^## ${rm} — `, 'm'))[1]!.split(/^## /m)[0]!;
      const rubriques = corps.split(/^\*\*/m).slice(1);
      for (const rubrique of ['Énoncé', 'Pourquoi', 'Comment on la voit']) {
        // Découpe par rubrique : `\Z` n'existe pas en JavaScript — une borne de fin écrite ainsi
        // serait silencieusement fausse : elle chercherait la lettre Z.
        const bloc = rubriques.find((r) => r.startsWith(`${rubrique}.**`));
        expect(bloc, `${rm} n'a pas de rubrique « ${rubrique} » — une règle sans ${rubrique} n'est pas une règle`).toBeDefined();
        // Une rubrique vide est une rubrique absente qui a appris à passer la garde.
        const texteDeLaRubrique = bloc!.slice(`${rubrique}.**`.length).trim();
        expect(texteDeLaRubrique.length, `${rm} — la rubrique « ${rubrique} » est vide`).toBeGreaterThan(40);
      }
    }
    // Le tableau de tête annonce pour chaque règle la gate qui la vérifie : une cellule vide
    // promettrait une garde qui n'existe pas.
    for (const [, rm, gate] of texte.matchAll(/^\| (RM-\d{2}) +\|[^|]*\|([^|]*)\|/gm)) {
      expect(gate!.trim(), `${rm} : la colonne « Gate qui la vérifie » est vide`).not.toBe('');
    }
  });

  it("REQ-GOV-024 — RM-13 enregistre la règle que le CLAUDE.md retiré portait seul, avec sa garde", () => {
    const texte = readFileSync(CHEMIN_RM, 'utf8');
    const corps = texte.split(/^## RM-13 — /m)[1]!.split(/^## /m)[0]!;
    // La règle elle-même : composer, et la PR de clôture qui l'interdit.
    expect(corps).toMatch(/lot:composer/);
    expect(corps).toMatch(/clôture/);
    // Elle nomme la garde qui en voit le symptôme, et elle NOMME aussi ce qui n'est pas gardé :
    // une règle qui laisse croire qu'une gate la tient est pire qu'une règle sans gate.
    expect(corps).toMatch(/gov:etat/);
    expect(corps).toMatch(/deux_pr_meme_tache/);
    expect(corps, "RM-13 doit dire ce qui N'EST PAS gardé").toMatch(/n'est gardée par rien|pas gardé/);
  });

  it("REQ-GOV-024 — CLAUDE.md cite RM-13 par son NUMÉRO, pointe au lieu de dupliquer, et ne fige aucun état daté", () => {
    expect(
      existsSync(CHEMIN_CLAUDE),
      "CLAUDE.md est le seul fichier qu'une session ouverte ici lit sans qu'on le lui demande"
    ).toBe(true);
    const texte = readFileSync(CHEMIN_CLAUDE, 'utf8');
    const lignes = texte.split('\n');

    // (1) RM-12 : la règle se cite par son numéro, jamais par paraphrase. Toute ligne qui parle de
    // composer un lot doit porter « RM-13 » dans sa fenêtre de trois lignes.
    expect(texte, 'CLAUDE.md doit citer RM-13').toContain('RM-13');
    lignes.forEach((l, i) => {
      if (!/lot:composer/.test(l)) return;
      const fenetre = lignes.slice(Math.max(0, i - 2), i + 3).join('\n');
      expect(
        fenetre,
        `CLAUDE.md:${i + 1} parle de composer un lot sans citer RM-13 : une paraphrase ne résout pas`
      ).toContain('RM-13');
    });

    // (2) Il POINTE : chaque document nommé l'est par son chemin, et ce chemin existe. Un renvoi
    // qui ne résout pas coûte plus cher que pas de renvoi du tout.
    const ENTREES = [CHEMIN_REPRISE, 'docs/PLAN-STATE.md', CHEMIN_PRESEANCE, 'docs/PROTOCOLE-FUSION.md', CHEMIN_RM, CHEMIN_CHARTE];
    for (const e of ENTREES) expect(texte, `CLAUDE.md ne renvoie pas vers ${e}`).toContain(e);
    for (const [, chemin] of texte.matchAll(/`([\w./-]+\.(?:md|json|ts|js|yml|yaml))`/g)) {
      expect(existsSync(chemin!), `CLAUDE.md renvoie vers ${chemin}, qui n'existe pas`).toBe(true);
    }

    // (3) Il NE DUPLIQUE PAS. Le résumé de `docs/PRESEANCE.md` qu'avait écrit la version retirée
    // avait déjà divergé de sa source : il omettait deux chemins réservés et affirmait que tout le
    // reste était une vue générée, ce qui interdisait d'éditer ce que la préséance donne à éditer.
    // Deux garde-fous : aucune ligne substantielle recopiée d'une source, et aucune attribution de
    // chemin à un poste — cette table-là est lue par `gov:pr` dans docs/CHARTE-AGENTS.md §7.
    const sources = [readFileSync(CHEMIN_PRESEANCE, 'utf8'), readFileSync(CHEMIN_REPRISE, 'utf8')].join('\n');
    for (const l of lignes) {
      const nue = l.trim();
      if (nue.length < 60) continue;
      expect(sources.includes(nue), `CLAUDE.md recopie une ligne de sa source : « ${nue.slice(0, 70)}… »`).toBe(false);
    }
    expect(
      /role:[a-z-]+/.test(texte),
      "CLAUDE.md ne réattribue pas les chemins réservés : le tableau que gov:pr LIT est docs/CHARTE-AGENTS.md §7"
    ).toBe(false);

    // (4) Il ne fige AUCUN état daté. Le premier geste change à chaque session ; un fichier qui le
    // recopie devient faux sans que rien ne le signale. Tout ce qui date se lit dans les vues.
    const PERISSABLE: [RegExp, string][] = [
      [/#\d+/, "un numéro de PR — il désigne une PR qui sera fusionnée demain"],
      [/\b\d{4}-\d{2}-\d{2}\b/, "une date — le premier geste change à chaque session"],
      [/\bL-?\d+-\d+\b/, "un identifiant de lot — le composeur en produit un nouveau à chaque tour"],
      [/\b\d+\s*(?:tâches?\b|%)/, "un compteur d'avancement — il se lit dans docs/PLAN-STATE.md"],
    ];
    for (const [motif, quoi] of PERISSABLE) {
      const i = lignes.findIndex((l) => motif.test(l));
      expect(i, `CLAUDE.md:${i + 1} fige ${quoi} : « ${lignes[i]?.trim().slice(0, 80)} »`).toBe(-1);
    }
  });

  it('REQ-GOV-024 — le gabarit de PR porte la ligne « Règle maison appliquée » entre ses marqueurs', () => {
    const gabarit = readFileSync(CHEMIN_GABARIT, 'utf8');
    const bloc = gabarit.split('<!-- regle-maison:debut -->')[1]?.split('<!-- regle-maison:fin -->')[0];
    expect(bloc, 'les marqueurs regle-maison:debut / regle-maison:fin encadrent la ligne').toBeDefined();
    expect(bloc!).toMatch(/Règle maison appliquée/);
    // La garde qui la LIT : sans elle, la ligne est décorative.
    expect(readFileSync('scripts/gates/gov-pr.ts', 'utf8')).toMatch(/regle-maison:debut/);
  });
});

describe('REQ-GOV-023 — le journal des leçons et sa gate de fraîcheur', () => {
  it('REQ-GOV-023 — docs/LECONS.md porte une date de consolidation MACHINE-LISIBLE', () => {
    expect(existsSync(CHEMIN_LECONS), `${CHEMIN_LECONS} est absent`).toBe(true);
    const texte = readFileSync(CHEMIN_LECONS, 'utf8');
    const m = /<!--\s*consolidation:\s*(\d{4}-\d{2}-\d{2})\s*-->/.exec(texte);
    expect(m, 'la date doit se lire par une machine, pas dans une phrase').not.toBeNull();
    expect(Number.isNaN(Date.parse(m![1]!))).toBe(false);
  });

  it("REQ-GOV-023 — chaque leçon cite sa source vérifiable et la RM qu'elle a produite, ou dit qu'elle n'en a produit aucune", () => {
    const texte = readFileSync(CHEMIN_LECONS, 'utf8');
    const rmConnues = [...readFileSync(CHEMIN_RM, 'utf8').matchAll(/^## (RM-\d{2}) — /gm)].map((x) => x[1]!);
    const blocs = texte.split(/^### (?=LEC-\d{2} — )/m).slice(1);
    expect(blocs.length, 'un journal des leçons sans leçon est une fiction').toBeGreaterThanOrEqual(6);
    for (const b of blocs) {
      const id = /^(LEC-\d{2})/.exec(b)![1]!;
      const preuve = /^- \*\*Où c'est prouvé\.\*\*(.+)$/m.exec(b)?.[1] ?? '';
      expect(preuve, `${id} n'a pas de rubrique « Où c'est prouvé »`).not.toBe('');
      expect(
        /`[0-9a-f]{7,40}`/.test(preuve) || /`[^`]+:\d+`/.test(preuve) || /«[^»]{10,}»/.test(preuve),
        `${id} — la preuve doit être un SHA, un chemin:ligne ou un message verbatim`
      ).toBe(true);
      const rm = /^- \*\*Règle maison\.\*\*(.+)$/m.exec(b)?.[1] ?? '';
      expect(rm, `${id} ne dit pas quelle RM il a produite`).not.toBe('');
      for (const cite of [...rm.matchAll(/RM-\d{2}/g)].map((x) => x[0])) {
        expect(rmConnues, `${id} cite ${cite}, qui n'existe pas`).toContain(cite);
      }
      expect(/RM-\d{2}/.test(rm) || /aucune/i.test(rm), `${id} : une RM, ou le dire`).toBe(true);
    }
  });

  it('REQ-GOV-023 — gov:lecons est VERT sur le dépôt, à la date de consolidation du fichier', () => {
    const date = /<!--\s*consolidation:\s*(\d{4}-\d{2}-\d{2})\s*-->/.exec(readFileSync(CHEMIN_LECONS, 'utf8'))![1]!;
    const r = lancer('--now', date);
    expect(r.sortie).toContain('gov:lecons');
    expect(r.code, r.sortie).toBe(0);
  });

  it('REQ-GOV-023 — ROUGE : consolidation de plus de 7 jours ALORS QUE des « appris » attendent', () => {
    const { dossier, fichier } = banc(avecEntrees(['- GOV-018 — un appris qui attend.']));
    try {
      const r = lancer('--fichier', fichier, '--now', '2026-09-11', ...ISOLE);
      expect(r.code, r.sortie).toBe(1);
      expect(r.sortie).toContain('consolidation_perimee');
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-023 — CONTRE-TÉMOIN : la même péremption sans aucun « appris » en attente reste VERTE', () => {
    const { dossier, fichier } = banc(avecEntrees(['_(rien à consolider)_']));
    try {
      const r = lancer('--fichier', fichier, '--now', '2026-12-31', ...ISOLE);
      expect(r.code, r.sortie).toBe(0);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-023 — CONTRE-TÉMOIN : sept jours pile avec des « appris » en attente reste VERT', () => {
    const { dossier, fichier } = banc(avecEntrees(['- GOV-018 — un appris qui attend.']));
    try {
      const r = lancer('--fichier', fichier, '--now', '2026-09-10', ...ISOLE);
      expect(r.code, r.sortie).toBe(0);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it("REQ-GOV-023 — ROUGE : un « appris » du JOURNAL DE SESSION que docs/LECONS.md ne cite pas", () => {
    // La source que REQ-GOV-023 nomme vraiment : `docs/journal/` (GOV-008, même lot). Une entrée
    // est consolidée quand ce fichier cite le numéro de sa PR — pas quand quelqu'un l'affirme.
    const dossier = mkdtempSync(join(tmpdir(), 'journal-'));
    try {
      writeFileSync(
        join(dossier, '2026-09.md'),
        '# Journal\n\n## PR #9901 — 2026-09-04 — feat(TEMOIN)\n\n**Fait.** Rien.\n\n**Appris.** Un fait que personne n’a consolidé.\n',
        'utf8'
      );
      const r = lancer('--now', '2026-12-31', '--journal', dossier);
      expect(r.code, r.sortie).toBe(1);
      expect(r.sortie).toContain('consolidation_perimee');
      expect(r.sortie).toContain('#9901');
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it("REQ-GOV-023 — CONTRE-TÉMOIN : l’absence de journal de session ne rougit pas, mais elle se DIT", () => {
    const absent = join(tmpdir(), 'journal-qui-n-existe-pas-gov-018');
    const r = lancer('--now', '2026-12-31', '--journal', absent);
    expect(r.code, r.sortie).toBe(0);
    // Un zéro se voit, un silence non : la garde nomme sa source même quand elle est vide.
    expect(r.sortie).toMatch(/absent|« appris » lus/);
  });

  it("REQ-GOV-023 — gov:lecons refuse de lire l'horloge : sans --now, elle s'arrête", () => {
    const r = lancer();
    expect(r.code).not.toBe(0);
    expect(r.sortie).toMatch(/--now/);
  });

  it('REQ-GOV-023 — gov:lecons --prove : chaque famille rougit sur son témoin, les contre-témoins restent verts', () => {
    const r = lancer('--prove');
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toContain('preuve faite');
  });
});
