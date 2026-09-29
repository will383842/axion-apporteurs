// @req REQ-GOV-023
/**
 * une-pr-porte-son-entree-de-journal.spec.ts — l'entrée de journal d'une PR se juge AVANT sa
 * fusion, sur la branche de la PR (GOV-052, REQ-GOV-023, RM-15).
 *
 * LE DÉFAUT. La seule famille qui voyait une PR sans entrée de journal était
 * `pr_fusionnee_sans_journal` de `gov:etat` : elle se lève sur `main`, APRÈS la fusion, quand plus
 * rien n'est réparable sur la branche — et sa seule victime possible est alors `main`, qui rougit
 * pour toutes les PR suivantes. Rejoué sur l'historique de `main` : la règle a tenu plusieurs
 * fusions d'affilée puis s'est perdue, à plusieurs reprises, sans que rien ne le voie avant.
 *
 * LA MESURE. `gov:pr --pr <n>` — la commande d'avant-fusion — lit `docs/journal/` sur la TÊTE de
 * la PR et rougit si aucune entrée n'y porte le numéro de la PR. `pr_fusionnee_sans_journal` reste
 * en place : l'une nomme l'incident, l'autre l'empêche.
 *
 * LE TROU RÉCIPROQUE. Une entrée pour une PR qui n'existe pas, ou qui n'a jamais été fusionnée,
 * passait toutes les familles. Le journal d'un dépôt PUBLIC pouvait donc affirmer un atterrissage
 * qui n'a jamais eu lieu. La même lecture la confronte à la liste des PR fusionnées de la forge.
 *
 * LES FIXTURES VIENNENT DU PRODUCTEUR (RM-03) : le journal est celui de l'arbre `HEAD`, lu par la
 * fonction même que la garde appelle, et la panne se FABRIQUE en retirant une entrée (RM-02). Aucun
 * numéro n'est tapé : chacun se dérive du journal ou de son plancher (RM-01).
 *
 * CE QUE CE FICHIER NE PROUVE PAS. L'appel paginé à la forge (`pulls?state=closed`) et la commande
 * entière `pnpm gov:pr --pr <n>` demandent le réseau et une PR réelle : ils ne sont pas lancés ici.
 * La partie pure de chacun l'est — le dépouillement de la réponse de la forge, la lecture de
 * l'arbre, le jugement — et le câblage de `prParGh()` est tenu par un témoin de SOURCE.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  controler,
  projeter,
  journalALaReference,
  journalDeLaPr,
  numerosFusionnes,
  type Depot,
  type JournalDeLaPr,
  type Pr,
} from '../../../scripts/gates/gov-pr';
import {
  GUIDE_DU_JOURNAL,
  lireLeJournal,
  plancherDuJournal,
} from '../../../scripts/gates/gov-attributions';

const SANS_ENTREE = 'pr_sans_entree_de_journal';
const FANTOME = 'journal_cite_une_pr_non_fusionnee';
const GARDE = 'scripts/gates/gov-pr.ts';

/** Le dépôt tel que la garde le lit — les mêmes fichiers, la même projection du registre. */
const DEPOT: Depot = {
  gabarit: readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8'),
  codeowners: readFileSync('.github/CODEOWNERS', 'utf8'),
  charte: readFileSync('docs/CHARTE-AGENTS.md', 'utf8'),
  architecte: readFileSync('.claude/agents/architecte.md', 'utf8'),
  fiches: readdirSync('.claude/agents')
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3)),
  taches: projeter((JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: [] }).taches),
};

/** Le journal de l'arbre `HEAD`, lu par la fonction que la garde appelle sous `--pr`. */
const ARBRE = journalALaReference('HEAD');
if (ARBRE === null) throw new Error('le journal de HEAD est illisible : aucun témoin ne vaut');
const GUIDE = ARBRE.find((f) => f.fichier === GUIDE_DU_JOURNAL);
if (!GUIDE) throw new Error(`${GUIDE_DU_JOURNAL} absent de l'arbre HEAD`);
const LU = plancherDuJournal(GUIDE.texte);
if ('refus' in LU) throw new Error(LU.refus);
const PLANCHER = LU.plancher;
const ENTREES = lireLeJournal(ARBRE.filter((f) => f !== GUIDE)).entrees;
/** La réponse de la forge, FABRIQUÉE : toute PR que le journal cite est fusionnée. */
const FUSIONNEES = [...new Set(ENTREES.map((e) => e.pr))];
/** La victime : la plus haute PR journalisée au-dessus du plancher — dérivée, jamais tapée. */
const VICTIME = Math.max(...FUSIONNEES.filter((n) => n > PLANCHER));
/** Un numéro que ni le journal ni la forge ne connaissent. */
const INCONNU = Math.max(...FUSIONNEES) + 1;

/** RETIRE l'entrée d'une PR : on fabrique la panne, on ne la constate pas (RM-02). */
function sansEntree(n: number): { fichier: string; texte: string }[] {
  const titre = new RegExp(`^## PR #${n} — .*$`, 'gm');
  return ARBRE!.map((f) => ({ ...f, texte: f.texte.replace(titre, '') }));
}

/** AJOUTE une entrée bien formée pour une PR, dans un fichier à elle. */
function avecEntree(
  fichiers: { fichier: string; texte: string }[],
  n: number
): { fichier: string; texte: string }[] {
  const date = ENTREES[0]!.date;
  return [
    ...fichiers,
    {
      fichier: `docs/journal/banc-pr-${n}.md`,
      texte: [
        `## PR #${n} — ${date} — entrée de banc`,
        '',
        '**Fait.** une ligne.',
        '**Reste.** rien.',
        '**Appris.** rien.',
        '',
      ].join('\n'),
    },
  ];
}

/** Une PR jugée sous `--pr` : des revues (vides), un numéro, et son journal. */
function prDeBanc(numero: number | null, journal: JournalDeLaPr | null | undefined): Pr {
  const p: Pr = {
    numero,
    titre: 'docs(GOV-052): banc',
    corps: '',
    labels: [],
    fichiers: [],
    revues: [],
  };
  if (journal !== undefined) p.journal = journal;
  return p;
}

const familles = (p: Pr) => new Set(controler(DEPOT, p).map((f) => f.famille));
const messages = (p: Pr, famille: string) =>
  controler(DEPOT, p)
    .filter((f) => f.famille === famille)
    .map((f) => f.message)
    .join('\n');

describe('REQ-GOV-023 — la PR porte son entrée de journal AVANT la fusion', () => {
  it('REQ-GOV-023 · ROUGE : l’entrée de la PR retirée de la branche, la garde rougit et NOMME le numéro', () => {
    const p = prDeBanc(VICTIME, journalDeLaPr(sansEntree(VICTIME), FUSIONNEES));
    expect(familles(p).has(SANS_ENTREE)).toBe(true);
    const m = messages(p, SANS_ENTREE);
    expect(m).toContain(`#${VICTIME}`);
    // La garde CITE la règle, elle ne la retape pas.
    expect(m).toContain('RM-15');
  });

  it('REQ-GOV-023 · VERT : la même PR, son entrée posée sur la branche, ne rougit pas', () => {
    const p = prDeBanc(VICTIME, journalDeLaPr(ARBRE!, FUSIONNEES));
    const f = familles(p);
    expect(f.has(SANS_ENTREE)).toBe(false);
    expect(f.has(FANTOME)).toBe(false);
  });

  it('REQ-GOV-023 · le plancher est DÉRIVÉ du mode d’emploi : à lui, rien n’est exigé ; au-dessus, tout l’est', () => {
    const auPlancher = prDeBanc(PLANCHER, journalDeLaPr(sansEntree(PLANCHER), FUSIONNEES));
    expect(familles(auPlancher).has(SANS_ENTREE)).toBe(false);
    const auDessus = PLANCHER + 1;
    const juste = prDeBanc(auDessus, journalDeLaPr(sansEntree(auDessus), FUSIONNEES));
    expect(familles(juste).has(SANS_ENTREE)).toBe(true);
  });

  it('REQ-GOV-023 · ÉCHEC FERMÉ : un journal illisible, un plancher introuvable ou un numéro inconnu rougissent', () => {
    expect(familles(prDeBanc(VICTIME, null)).has(SANS_ENTREE)).toBe(true);
    const sansPlancher = ARBRE!.map((f) =>
      f === GUIDE ? { ...f, texte: f.texte.replace(/^Plancher.*$/m, '') } : f
    );
    expect(
      familles(prDeBanc(VICTIME, journalDeLaPr(sansPlancher, FUSIONNEES))).has(SANS_ENTREE)
    ).toBe(true);
    expect(familles(prDeBanc(null, journalDeLaPr(ARBRE!, FUSIONNEES))).has(SANS_ENTREE)).toBe(true);
  });

  it('REQ-GOV-023 · LE MOMENT : sans journal fourni (événement de CI, pas de `--pr`), aucune des deux familles ne s’évalue', () => {
    const f = familles(prDeBanc(VICTIME, undefined));
    expect(f.has(SANS_ENTREE)).toBe(false);
    expect(f.has(FANTOME)).toBe(false);
  });
});

describe('REQ-GOV-023 — une entrée de journal n’affirme pas un atterrissage qui n’a pas eu lieu', () => {
  it('REQ-GOV-023 · ROUGE : une entrée pour une PR que la forge ne connaît pas fusionnée rougit et la NOMME', () => {
    const p = prDeBanc(VICTIME, journalDeLaPr(avecEntree(ARBRE!, INCONNU), FUSIONNEES));
    expect(familles(p).has(FANTOME)).toBe(true);
    expect(messages(p, FANTOME)).toContain(`#${INCONNU}`);
  });

  it('REQ-GOV-023 · VERT : la même entrée, quand la forge dit la PR fusionnée', () => {
    const p = prDeBanc(
      VICTIME,
      journalDeLaPr(avecEntree(ARBRE!, INCONNU), [...FUSIONNEES, INCONNU])
    );
    expect(familles(p).has(FANTOME)).toBe(false);
  });

  it('REQ-GOV-023 · VERT : l’entrée de la PR JUGÉE, encore ouverte, n’est pas un fantôme', () => {
    const p = prDeBanc(INCONNU, journalDeLaPr(avecEntree(ARBRE!, INCONNU), FUSIONNEES));
    const f = familles(p);
    expect(f.has(FANTOME)).toBe(false);
    expect(f.has(SANS_ENTREE)).toBe(false);
  });

  it('REQ-GOV-023 · la réponse de la forge se dépouille en numéros, et une réponse illisible LÈVE', () => {
    const sortie = FUSIONNEES.map(String).join('\n') + '\n';
    expect(numerosFusionnes(sortie)).toEqual(FUSIONNEES);
    expect(() => numerosFusionnes(`${sortie}pas-un-numero\n`)).toThrow();
    expect(() => numerosFusionnes('')).toThrow();
  });
});

describe('REQ-GOV-023 — la lecture de l’arbre, le câblage et la source unique', () => {
  it('REQ-GOV-023 · l’arbre d’une référence est lu par git ; une référence inconnue rend `null`', () => {
    expect(ARBRE!.some((f) => f.fichier === GUIDE_DU_JOURNAL)).toBe(true);
    expect(ENTREES.length).toBeGreaterThan(0);
    expect(journalALaReference('refs/heads/aucune-branche-de-ce-nom-gov-052')).toBeNull();
  });

  it('REQ-GOV-023 · `prParGh()` fournit le journal de la tête et la liste des PR fusionnées', () => {
    const source = readFileSync(GARDE, 'utf8');
    const debut = source.indexOf('function prParGh(');
    const fin = source.indexOf('\n}\n', debut);
    const corps = source.slice(debut, fin);
    expect(corps).toContain('journalALaReference(');
    expect(corps).toContain('prFusionneesParLaForge(');
    const familles = source.slice(
      source.indexOf('const FAMILLES = ['),
      source.indexOf('];', source.indexOf('const FAMILLES = ['))
    );
    expect(familles).toContain(`'${SANS_ENTREE}'`);
    expect(familles).toContain(`'${FANTOME}'`);
  });

  it('REQ-GOV-023 · RM-15 est déclarée UNE fois ; la garde et LEC-15 la citent par son identifiant', () => {
    const regles = readFileSync('docs/REGLES-MAISON.md', 'utf8');
    expect(regles.match(/^## RM-15 — /gm)?.length).toBe(1);
    expect(readFileSync(GARDE, 'utf8')).toContain('RM-15');
    const lecons = readFileSync('docs/LECONS.md', 'utf8');
    const lec15 = lecons.split(/^### LEC-15 — /m)[1]!.split(/^### /m)[0]!;
    expect(/^- \*\*Règle maison\.\*\*(.+)$/m.exec(lec15)?.[1]).toContain('RM-15');
  });
});

describe('REQ-GOV-023 — RM-15 est la SEULE rédaction de l’obligation d’entrée de journal', () => {
  /**
   * GOV-108 — RM-15 affirme être la seule rédaction de l'obligation, et deux documents la
   * rédigeaient encore sans la citer. Ils y RENVOIENT désormais. Une rédaction se reconnaît à ce
   * qu'elle PRESCRIT le moment ou le lieu de l'entrée : un paragraphe qui parle d'une entrée et
   * dit « précédée », « avant la fusion », « sur la branche », « se pousse » ou « même push ».
   */
  const RENVOIS = ['docs/journal/README.md', 'docs/REPRISE-SESSION.md'];
  const ENTREE = /entr[ée]e/i;
  const PRESCRIT = [
    /pr[ée]c[ée]d/i,
    /avant (la|sa) fusion/i,
    /sur (la|sa) (propre )?branche/i,
    /se pousse/i,
    /m[êe]me push/i,
  ];
  /** Les paragraphes qui rédigent l'obligation — un paragraphe tient entre deux lignes vides. */
  const redactions = (texte: string): string[] =>
    texte.split(/\r?\n\s*\r?\n/).filter((p) => ENTREE.test(p) && PRESCRIT.some((m) => m.test(p)));
  /** L'énoncé de RM-15, lu chez lui : c'est la rédaction qu'une copie ferait réapparaître. */
  const rm15 = readFileSync('docs/REGLES-MAISON.md', 'utf8')
    .split(/^## RM-15 — /m)[1]!
    .split(/^---$/m)[0]!;
  const enonce = /^\*\*Énoncé\.\*\*[\s\S]*?(?=\r?\n\s*\r?\n)/m.exec(rm15)![0];

  it('REQ-GOV-023 · TÉMOIN : l’énoncé de RM-15 recopié dans un document est vu comme une autre rédaction', () => {
    expect(redactions(enonce)).toHaveLength(1);
    for (const f of RENVOIS) {
      const texte = readFileSync(f, 'utf8');
      const recopie = `${texte}\n\n${enonce}\n`;
      expect(redactions(recopie).length, f).toBe(redactions(texte).length + 1);
    }
  });

  it('REQ-GOV-023 · les deux documents renvoient à RM-15 et ne rédigent plus l’obligation', () => {
    for (const f of RENVOIS) {
      const texte = readFileSync(f, 'utf8');
      expect(texte, f).toContain('RM-15');
      expect(redactions(texte), f).toEqual([]);
    }
  });
});

describe('REQ-GOV-023 — l’arbre du journal se lit octet pour octet, nom non ASCII compris', () => {
  it('REQ-GOV-023 · TÉMOIN : une entrée au nom non ASCII est lue, sous son nom exact', () => {
    // Sans `-z` ni `core.quotepath=false`, git rend ce nom entre guillemets et en octets
    // échappés : il ne finit plus par `.md`, et l'entrée disparaît du journal sans un mot.
    const racine = mkdtempSync(join(tmpdir(), 'journal-non-ascii-'));
    try {
      const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'core.autocrlf=false', ...args], {
          cwd: racine,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      git('init', '-q');
      mkdirSync(join(racine, 'docs', 'journal'), { recursive: true });
      const nom = '2026-09-entrée-été.md';
      const texte = '## PR #1 — 2026-09-01 — un titre\n';
      writeFileSync(join(racine, 'docs', 'journal', nom), texte);
      git('add', '.');
      git(
        '-c',
        'user.name=temoin',
        '-c',
        'user.email=temoin@example.invalid',
        'commit',
        '-qm',
        'x'
      );
      expect(journalALaReference('HEAD', racine)).toEqual([
        { fichier: `docs/journal/${nom}`, texte },
      ]);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});
