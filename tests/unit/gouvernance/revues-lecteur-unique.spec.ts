// @req REQ-GOV-010
// @req REQ-GOV-011
/**
 * revues-lecteur-unique.spec.ts — un seul lecteur des revues de PR (REQ-GOV-010, REQ-GOV-011).
 *
 * LE DÉFAUT, MESURÉ LE 2026-09-05 SUR `41bc814`. Il y avait DEUX lectures des revues d'une PR, et
 * elles ne lisaient pas la même chose (RM-01, RM-04) :
 *
 *   — `scripts/gates/gov-pr.ts` filtrait l'état (`APPROVED`/`COMMENTED`), exigeait une ligne
 *     `Verdict:` et classait le DERNIER verdict par couple `poste·lentille` ;
 *   — `scripts/lot/corps-de-pr.ts`, qui coche la case de DoD « Relecteur ≠ auteur » du corps
 *     publié, ne lisait de chaque revue que `body` et `commit_id`. `user.login`,
 *     `author_association` et `state` sont dans LA MÊME réponse et étaient ignorés — `state`
 *     était même déclaré dans le type et jamais consulté.
 *
 * QUATRE FAIBLESSES, TOUTES DANS LE SENS PERMISSIF — elles cochent une case qui devrait rester
 * vide. Le dépôt est PUBLIC (W13) : n'importe quel compte peut poser une revue `COMMENT`.
 *
 *   (1) AUCUNE AUTHENTIFICATION. Quatre avis forgés par un compte tiers (`author_association:
 *       NONE`) suffisaient à cocher la case ; et un VRAI « Verdict: refuse » de la lentille
 *       `securite` sur la tête, suivi d'un avis forgé, voyait son VETO EFFACÉ. Les quatre mêmes
 *       avis en état `DISMISSED` — c'est-à-dire retirés — cochaient aussi.
 *   (2) `^A\d{2}` ACCEPTE `A99` : le numéro de poste n'était confronté à rien.
 *   (3) LE DISCRIMINANT `schema` ÉTAIT PLUS FAIBLE QUE CELUI DE LA GATE QU'IL SUPPLÉE : un label
 *       posé à la main, là où `gov-pr.ts` lit les FICHIERS de la PR. Une PR qui touche `prisma/**`
 *       sans le label publiait « les 4 lentilles ont accepté » alors que la revue bloquante
 *       `schema` n'avait jamais été demandée.
 *   (4) LA CLÉ DU « DERNIER VERDICT » DIVERGEAIT : par `lentille` seule d'un côté, par
 *       `poste·lentille` de l'autre. Un refus d'A02 sur `schema` suivi d'un accord d'un AUTRE
 *       poste sur la même lentille se cochait.
 *
 * CE QUE CE FICHIER EXERCE. Un TÉMOIN PAR FAIBLESSE, chacun opposant le lecteur unique au lecteur
 * HÉRITÉ — conservé dans le module comme fixture de la régression, jamais consulté pour juger —
 * et des CONTRE-TÉMOINS : ce que le lecteur unique doit continuer d'accepter. Sans eux, un lecteur
 * qui ne cocherait JAMAIS passerait chacun des témoins (RM-02, RM-11).
 *
 * LES FIXTURES VIENNENT DU PRODUCTEUR RÉEL (RM-03). `tests/fixtures/github/revues-pr-31.json` est
 * une capture de
 *
 *     gh api repos/will383842/axion-apporteurs/pulls/31/reviews --paginate
 *
 * enregistrée le 2026-09-05, projetée sur les seuls champs lus. Les revues FORGÉES des témoins
 * sont construites EN PARTANT de cette capture — jamais tapées de mémoire : elles reprennent la
 * forme exacte de la réponse, et ne changent que ce que le témoin fait varier (RM-11).
 *
 * AUCUN TOTAL N'EST ÉPINGLÉ SUR L'ÉTAT MOUVANT DE LA PR. Les assertions portent sur des
 * identifiants et des propriétés, jamais sur « 20 revues » : la PR en reçoit encore.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ASSOCIATIONS_HABILITEES,
  ETATS_RENDUS,
  cheminsSchema,
  codesDePoste,
  lentillesExigees,
  lireRevues,
  lireRevuesHerite,
  toucheSchema,
  type RevueBrute,
} from '../../../scripts/lot/revues';
import { rendre } from '../../../scripts/lot/corps-de-pr';

const CAPTURE = JSON.parse(readFileSync('tests/fixtures/github/revues-pr-31.json', 'utf8')) as {
  Source: string;
  tete: string;
  auteurDeLaPr: string;
  revues: RevueBrute[];
};

const TETE = CAPTURE.tete;
const REELLES = CAPTURE.revues;

/** Le poste qui signe `Auteur:` dans le corps de la PR 31 — lu, jamais supposé. */
const AUTEUR_POSTE = /^Auteur:\s*(A\d{2})\s*$/m.exec(readFileSync('docs/pr/31.tpl.md', 'utf8'))?.[1] ?? null;

/**
 * Un avis, construit EN PARTANT d'une revue réelle de la capture : on reprend sa forme entière et
 * on ne change que les champs nommés. Une fonction qui « complète » une fixture vérifie, elle ne
 * fabrique pas (RM-03) — d'où le refus explicite si la revue modèle n'existe pas.
 */
type Retouche = {
  poste?: string;
  lentille?: string;
  verdict?: 'accepte' | 'refuse';
  commit?: string;
  etat?: string;
  association?: string;
  compte?: string;
};

function avis(modele: number, r: Retouche): RevueBrute {
  const base = REELLES[modele];
  if (base === undefined) throw new Error(`la capture ne porte pas de revue d'indice ${modele}`);
  return {
    ...base,
    user: { login: r.compte ?? base.user?.login ?? null },
    author_association: r.association ?? base.author_association,
    state: r.etat ?? base.state,
    commit_id: r.commit ?? TETE,
    body: `${r.poste ?? 'A09'} · ${r.lentille ?? 'exactitude'}
Verdict: ${r.verdict ?? 'accepte'}`,
  };
}

/** Les quatre avis d'un tour complet et légitime, sur la tête, par des postes ≠ de l'auteur. */
function tourComplet(r: Retouche = {}, troisieme = 'simplicite'): RevueBrute[] {
  return [
    avis(0, { ...r, poste: 'A09', lentille: 'exactitude' }),
    avis(1, { ...r, poste: 'A09', lentille: 'securite' }),
    avis(2, { ...r, poste: troisieme === 'schema' ? 'A02' : 'A09', lentille: troisieme }),
    avis(3, { ...r, poste: 'A10', lentille: 'mutation' }),
  ];
}

const SANS_SCHEMA = { fichiers: ['scripts/lot/revues.ts'], labels: [] as string[], tachesSchema: false };

function lire(revues: RevueBrute[], contexte: Partial<typeof SANS_SCHEMA> = {}) {
  const ctx = { ...SANS_SCHEMA, ...contexte };
  return lireRevues({
    revues,
    schema: toucheSchema(ctx),
    tete: TETE,
    auteurPoste: AUTEUR_POSTE,
    auteurCompte: CAPTURE.auteurDeLaPr,
  });
}

/** Le verdict HÉRITÉ, tel que `caseRevues()` le rendait avant le correctif. */
function herite(revues: RevueBrute[], labels: string[] = []) {
  return lireRevuesHerite({ revues, labels, tete: TETE });
}

describe('REQ-GOV-010 — la capture est bien celle du producteur réel', () => {
  it('REQ-GOV-010 · la fixture porte sa provenance et la forme de la réponse REST', () => {
    expect(CAPTURE.Source).toContain('gh api repos/will383842/axion-apporteurs/pulls/31/reviews');
    // Les trois champs que le lecteur hérité ignorait sont DANS la même réponse.
    for (const r of REELLES) {
      expect(r.user?.login, 'user.login est servi par GitHub').toBeTruthy();
      expect(r.author_association, 'author_association est servi par GitHub').toBeTruthy();
      expect(r.state, 'state est servi par GitHub').toBeTruthy();
      expect(r.commit_id).toBeTruthy();
    }
  });

  it('REQ-GOV-010 · CONTRE-TÉMOIN : les revues RÉELLES ne sont écartées par aucun filtre', () => {
    // Sans ce cas, un lecteur qui écarterait tout passerait chacun des témoins ci-dessous.
    const lecture = lire(REELLES, { labels: ['schema'] });
    expect(lecture.retenues.length).toBe(REELLES.length);
    expect(lecture.ecartees).toEqual([]);
    // et elles portent bien les quatre lentilles de la PR 31.
    expect(new Set(lecture.verdicts.map((v) => v.lentille))).toEqual(
      new Set(['exactitude', 'securite', 'schema', 'mutation'])
    );
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : sur les revues réelles seules, la case reste VIDE', () => {
    // Le dernier mot de `securite` et de `schema` sur la tête est « refuse ».
    const lecture = lire(REELLES, { labels: ['schema'] });
    expect(lecture.coche).toBe(false);
    expect(lecture.refusees.map((v) => v.lentille).sort()).toEqual(['schema', 'securite']);
  });
});

describe('REQ-GOV-011 — TÉMOIN (1) : le lecteur AUTHENTIFIE l’auteur de la revue', () => {
  const FORGES = tourComplet({ association: 'NONE', compte: 'un-tiers' });

  it('REQ-GOV-011 · quatre avis FORGÉS par un compte tiers ne cochent RIEN', () => {
    expect(herite([...REELLES, ...FORGES]).marque).toBe('[x]'); // le défaut, verbatim
    const lecture = lire([...REELLES, ...FORGES]);
    expect(lecture.coche).toBe(false);
    expect(lecture.ecartees.every((e) => e.motif === 'auteur_non_habilite')).toBe(true);
    expect(lecture.ecartees.length).toBe(FORGES.length);
  });

  it('REQ-GOV-011 · un avis forgé N’EFFACE PAS le veto de la lentille `securite`', () => {
    // Un vrai refus de `securite` sur la tête, PUIS l'avis forgé qui le recouvrait.
    const vetoReel = avis(0, { poste: 'A08', lentille: 'securite', verdict: 'refuse' });
    const recouvrement = avis(0, {
      poste: 'A08', lentille: 'securite', verdict: 'accepte',
      association: 'NONE', compte: 'un-tiers',
    });
    const suite = [...tourComplet(), vetoReel, recouvrement];
    expect(herite(suite).marque).toBe('[x]'); // le veto était effacé
    const lecture = lire(suite);
    expect(lecture.coche).toBe(false);
    expect(lecture.refusees.map((v) => `${v.code}·${v.lentille}`)).toContain('A08·securite');
  });

  it('REQ-GOV-011 · TÉMOIN (1c) : des avis `DISMISSED` — donc RETIRÉS — ne cochent rien', () => {
    const retires = tourComplet({ etat: 'DISMISSED' });
    expect(herite(retires).marque).toBe('[x]'); // l'état n'était pas lu
    const lecture = lire(retires);
    expect(lecture.coche).toBe(false);
    expect(lecture.ecartees.every((e) => e.motif === 'etat_ecarte')).toBe(true);
    expect(lecture.manquantes.sort()).toEqual([...lentillesExigees(false).toutes].sort());
  });

  it('REQ-GOV-010 · CONTRE-TÉMOIN : `MEMBER` et `COLLABORATOR` jugent aussi', () => {
    // Le filtre porte sur le DROIT DE JUGER, pas sur l'unique compte d'aujourd'hui : le jour où
    // un second contributeur arrive, une garde calée sur `OWNER` seul le refuserait en silence.
    for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
      expect(ASSOCIATIONS_HABILITEES.has(association)).toBe(true);
      expect(lire(tourComplet({ association })).coche, association).toBe(true);
    }
    for (const association of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR', 'MANNEQUIN']) {
      expect(ASSOCIATIONS_HABILITEES.has(association), association).toBe(false);
    }
  });
});

describe('REQ-GOV-010 — TÉMOIN (2) : le code de poste est confronté au registre des postes', () => {
  it('REQ-GOV-010 · `A99 · securite` n’est pas une lentille : `A99` n’est pas un poste', () => {
    const faux = [
      avis(0, { poste: 'A99', lentille: 'exactitude' }),
      avis(1, { poste: 'A99', lentille: 'securite' }),
      avis(2, { poste: 'A99', lentille: 'simplicite' }),
      avis(3, { poste: 'A99', lentille: 'mutation' }),
    ];
    expect(herite(faux).marque).toBe('[x]'); // `^A\d{2}` acceptait n'importe quel numéro
    const lecture = lire(faux);
    expect(lecture.coche).toBe(false);
    expect(lecture.ecartees.every((e) => e.motif === 'poste_inconnu')).toBe(true);
  });

  it('REQ-GOV-010 · les codes de poste sont DÉRIVÉS de `docs/agents.json`, jamais listés', () => {
    const codes = codesDePoste();
    const source = JSON.parse(readFileSync('docs/agents.json', 'utf8')) as { postes: { code: string }[] };
    expect([...codes].sort()).toEqual(source.postes.map((p) => p.code).sort());
    expect(codes.has('A99')).toBe(false);
  });
});

describe('REQ-GOV-010 — TÉMOIN (3) : le discriminant `schema` se lit sur les FICHIERS', () => {
  it('REQ-GOV-010 · une PR qui touche `prisma/**` SANS le label exige quand même `schema`', () => {
    const sansLaLentilleSchema = tourComplet(); // exactitude, securite, simplicite, mutation
    // Le lecteur hérité ne regardait que le label : sans lui, il n'exigeait pas `schema`.
    expect(herite(sansLaLentilleSchema, []).marque).toBe('[x]');
    const lecture = lire(sansLaLentilleSchema, { fichiers: ['prisma/schema.prisma'] });
    expect(lecture.coche).toBe(false);
    expect(lecture.manquantes).toContain('schema');
  });

  it('REQ-GOV-010 · le champ `schema` d’une tâche de la PR suffit aussi — le plus strict gagne', () => {
    const lecture = lire(tourComplet(), { tachesSchema: true });
    expect(lecture.coche).toBe(false);
    expect(lecture.manquantes).toContain('schema');
  });

  it('REQ-GOV-010 · les trois signaux sont lus, et `packages/contracts/**` compte aussi', () => {
    expect(toucheSchema({ fichiers: ['packages/contracts/evenements.ts'], labels: [], tachesSchema: false })).toBe(true);
    expect(toucheSchema({ fichiers: [], labels: ['schema'], tachesSchema: false })).toBe(true);
    expect(toucheSchema({ fichiers: [], labels: [], tachesSchema: true })).toBe(true);
  });

  it('REQ-GOV-010 · les chemins de schéma sont DÉRIVÉS du §7 de la charte, jamais recopiés', () => {
    // C'est la même source que celle qu'utilise `gov:pr` pour exiger le label (RM-01).
    expect(cheminsSchema(readFileSync('docs/CHARTE-AGENTS.md', 'utf8')).sort()).toEqual([
      'packages/contracts/',
      'prisma/',
    ]);
  });

  it('REQ-GOV-010 · CONTRE-TÉMOIN : sans fichier de schéma ni label, c’est `simplicite`', () => {
    expect(lentillesExigees(false).toutes).toContain('simplicite');
    expect(lentillesExigees(false).toutes).not.toContain('schema');
    expect(lire(tourComplet()).coche).toBe(true);
  });
});

describe('REQ-GOV-011 — TÉMOIN (4) : le dernier verdict se classe par `poste·lentille`', () => {
  it('REQ-GOV-011 · un refus d’A02 sur `schema` n’est pas effacé par l’accord d’un AUTRE poste', () => {
    const suite = [
      ...tourComplet({}, 'schema'),
      avis(0, { poste: 'A02', lentille: 'schema', verdict: 'refuse' }),
      avis(1, { poste: 'A12', lentille: 'schema', verdict: 'accepte' }),
    ];
    expect(herite(suite, ['schema']).marque).toBe('[x]'); // la clé était la lentille seule
    const lecture = lire(suite, { labels: ['schema'] });
    expect(lecture.coche).toBe(false);
    expect(lecture.refusees.map((v) => `${v.code}·${v.lentille}`)).toEqual(['A02·schema']);
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : le MÊME poste qui relit et accepte efface bien son refus', () => {
    // Sans quoi la garde redeviendrait insatisfiable : une PR refusée une fois ne pourrait plus
    // jamais être fusionnée, quoi qu'on corrige (le piège de la PR 27).
    const suite = [
      avis(0, { poste: 'A02', lentille: 'schema', verdict: 'refuse', commit: 'ancien-commit' }),
      ...tourComplet({}, 'schema'),
    ];
    expect(lire(suite, { labels: ['schema'] }).coche).toBe(true);
  });
});

describe('REQ-GOV-011 — « Relecteur ≠ auteur » n’est cochée qu’au niveau où elle est MESURÉE', () => {
  it('REQ-GOV-011 · un avis porté par le poste AUTEUR ne coche pas', () => {
    expect(AUTEUR_POSTE).toMatch(/^A\d{2}$/);
    const suite = [
      ...tourComplet(),
      avis(0, { poste: AUTEUR_POSTE!, lentille: 'exactitude', verdict: 'accepte' }),
    ];
    const lecture = lire(suite);
    expect(lecture.auteurSeRelit.map((v) => v.code)).toEqual([AUTEUR_POSTE]);
    expect(lecture.coche).toBe(false);
  });

  it('REQ-GOV-011 · sans `Auteur:` lisible, la distinction n’est PAS mesurée — donc pas cochée', () => {
    const lecture = lireRevues({
      revues: tourComplet(),
      schema: false,
      tete: TETE,
      auteurPoste: null,
    });
    expect(lecture.coche).toBe(false);
    expect(lecture.raisons.join(' · ')).toContain('Auteur:');
  });

  it('REQ-GOV-011 · le niveau MESURÉ est nommé : le poste, pas le compte GitHub', () => {
    // Les revues de ce dépôt viennent toutes du compte de l'auteur (un seul compte, W13). La
    // distinction relecteur/auteur est donc tenue au niveau des POSTES (charte §6), et le lecteur
    // le DIT au lieu de le supposer : ne jamais cocher ce qu'on ne mesure pas.
    const lecture = lire(tourComplet());
    expect(lecture.coche).toBe(true);
    expect(lecture.detail).toContain('poste');
    expect(new Set(REELLES.map((r) => r.user?.login))).toEqual(new Set([CAPTURE.auteurDeLaPr]));
    expect(lecture.comptesDistinctsDeLAuteur).toBe(false);
  });
});

describe('REQ-GOV-011 — la péremption : le diff approuvé est le diff fusionné (pas 5)', () => {
  it('REQ-GOV-011 · un accord rendu sur une AUTRE tête est périmé, et nommé', () => {
    const lecture = lire(tourComplet({ commit: '10bf4dd672bbfadb457497da2228d31894d36bf2' }));
    expect(lecture.coche).toBe(false);
    expect(lecture.perimees.length).toBe(4);
    expect(lecture.detail).toContain('10bf4dd');
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : sur la tête, les quatre lentilles cochent', () => {
    expect(lire(tourComplet()).coche).toBe(true);
  });
});

/**
 * LES DEUX MUTANTS QUI ONT SURVÉCU, DEVENUS TÉMOINS.
 *
 * La lentille `mutation` a mesuré sur `41bc814` que `scripts/lot/corps-de-pr.ts` n'était importé
 * par AUCUN test, appelé par AUCUNE gate et exercé par AUCUNE étape de CI. Deux mutants
 * type-propres y survivaient — `tsc` à 0, suite verte à 387/387 :
 *
 *   (a) la comparaison de `commit_id` retirée (`&& d.commit !== tete` → `&& false`) : rien ne
 *       rougissait, et un accord vieux de neuf commits cochait la case ;
 *   (b) la liste des lentilles exigées tronquée à `['exactitude']` : le corps publiait
 *       « les 1 lentilles (exactitude) ont accepté sur 41bc814 » PENDANT QUE `securite` REFUSAIT.
 *
 * Le second est le plus grave, et pas parce qu'il coche : parce qu'il PUBLIE une phrase qui a
 * l'air dérivée et qui est fausse. Un compteur tapé à la main se met en doute ; un compteur
 * calculé, non.
 */
describe('REQ-GOV-011 — les deux mutants qui survivaient, rejoués comme témoins', () => {
  const AUTRE_TETE = '10bf4dd672bbfadb457497da2228d31894d36bf2';

  it('REQ-GOV-011 · MUTANT (a) : deux lectures qui ne diffèrent QUE par le `commit_id`', () => {
    // Un témoin qui bouge pour deux raisons ne discrimine rien : ces deux lectures portent les
    // MÊMES avis, des mêmes postes, des mêmes comptes, avec les mêmes verdicts. Seul le commit
    // jugé change. Neutraliser la comparaison rend les deux identiques — et ce test rougit.
    const surLaTete = lire(tourComplet());
    const surAutreChose = lire(tourComplet({ commit: AUTRE_TETE }));
    expect(surLaTete.coche).toBe(true);
    expect(surAutreChose.coche).toBe(false);
    expect(surLaTete.perimees).toEqual([]);
    expect(surAutreChose.perimees.map((v) => v.lentille).sort()).toEqual(
      [...lentillesExigees(false).toutes].sort()
    );
  });

  it('REQ-GOV-011 · MUTANT (b) : le jeu de lentilles exigées est EXACTEMENT celui-ci', () => {
    // Toute troncature de `lentillesExigees()` — la SEULE fonction qui décide de cette liste —
    // rougit ici. Et elle est désormais la seule à pouvoir la décider : `lireRevues` reçoit le
    // FAIT « cette PR touche au schéma », pas une liste qu'un appelant pourrait rétrécir.
    expect([...lentillesExigees(false).toutes]).toEqual([
      'exactitude', 'securite', 'simplicite', 'mutation',
    ]);
    expect([...lentillesExigees(true).toutes]).toEqual([
      'exactitude', 'securite', 'schema', 'mutation',
    ]);
    // Le compte ne change pas d'une PR à l'autre : trois lentilles plus la mutation, et sur une
    // PR de schéma c'est la TROISIÈME qui change de titulaire (charte §6).
    expect(lentillesExigees(true).toutes.length).toBe(lentillesExigees(false).toutes.length);
    expect(lentillesExigees(true).trois.length).toBe(3);
  });

  it('REQ-GOV-011 · MUTANT (b) : le texte publié ne peut pas annoncer MOINS qu’il n’en faut', () => {
    // C'est la phrase « les 1 lentilles (exactitude) ont accepté » qui est le vrai défaut. Le
    // détail doit nommer CHAQUE lentille exigée, et son compte doit être celui du jeu complet.
    const exigees = [...lentillesExigees(false).toutes];
    const detail = lire(tourComplet()).detail;
    for (const l of exigees) expect(detail, `le détail publié tait « ${l} »`).toContain(l);
    expect(detail).toContain(`les ${exigees.length} lentilles`);
    expect(detail).not.toContain('les 1 lentilles');
  });

  it('REQ-GOV-011 · MUTANT (b) : un SOUS-ENSEMBLE d’avis ne coche pas, et le dit', () => {
    // Trois lentilles sur quatre, toutes acceptées sur la tête, toutes par des postes habilités :
    // la seule chose qui manque est la quatrième. La case reste vide et la nomme.
    const troisSurQuatre = tourComplet().slice(0, 3);
    const lecture = lire(troisSurQuatre);
    expect(lecture.coche).toBe(false);
    expect(lecture.manquantes).toEqual(['mutation']);
    expect(lecture.detail).toContain('manquante');
  });
});

describe('REQ-GOV-010 — un seul lecteur, importé par la garde ET par le composeur de corps', () => {
  const MODULE = 'lot/revues';
  /**
   * Les trois formes de lecture ad hoc des revues, telles qu'elles étaient ÉCRITES : l'en-tête de
   * revue relu sur place, le filtre d'état posé sur place, la liste des chemins de schéma recopiée.
   * L'une d'elles dans du CODE signifie qu'un second lecteur est revenu.
   *
   * ⚠️ CETTE GARDE A DÉJÀ ÉTÉ TROP LARGE, ET C'EST SON PREMIER ROUGE QUI L'A DIT. Écrite sur le
   * seul motif de poste, elle condamnait dans `gov-pr.ts` DEUX lectures légitimes et sans rapport
   * avec les revues — la ligne `Auteur:` du corps et la ligne `Rouge constaté par:`. Une garde
   * lexicale trop large fait retirer la lecture qui protège plutôt que celle qui nuit. Elle vise
   * donc la TOURNURE : le motif de poste ACCOLÉ au séparateur de lentille, jamais le motif seul.
   * Et elle ne juge que le CODE : sinon elle attraperait le commentaire qui explique le défaut,
   * dans le fichier même qui le corrige. Le contre-témoin ci-dessous tient les deux bouts.
   */
  const MOTIF_DE_POSTE = 'A' + String.fromCharCode(92) + 'd{2}';
  const SEPARATEUR = String.fromCharCode(183); // « · », le point médian de l'en-tête de revue
  const LECTURES_AD_HOC: { nom: string; vue: (ligne: string) => boolean }[] = [
    {
      nom: "l'en-tête de revue relue sur place",
      vue: (l) => l.includes(MOTIF_DE_POSTE) && l.includes(SEPARATEUR),
    },
    { nom: "le filtre d'état écrit sur place", vue: (l) => l.includes("'APPROVED'") },
    { nom: 'les chemins de schéma recopiés', vue: (l) => l.includes("'prisma/'") },
    {
      // La LISTE des lentilles transmise au lecteur : c'est par là que le mutant (b) passait. Un
      // appelant qui compose la liste peut la rétrécir ; un appelant qui transmet un booléen, non.
      nom: 'la liste des lentilles composée par l’appelant',
      vue: (l) => l.includes('lentillesExigees:'),
    },
  ];
  const SAUT = String.fromCharCode(10);

  /** Retire commentaires de bloc et de ligne : une garde de CODE ne juge pas la prose qui l'explique. */
  function lignesDeCode(source: string): string[] {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(SAUT)
      .filter((l) => !/^\s*(\/\/|\*)/.test(l));
  }

  it('REQ-GOV-010 · `scripts/gates/gov-pr.ts` importe le lecteur unique', () => {
    expect(readFileSync('scripts/gates/gov-pr.ts', 'utf8')).toContain(MODULE);
  });

  it('REQ-GOV-010 · `scripts/lot/corps-de-pr.ts` importe le MÊME lecteur', () => {
    expect(readFileSync('scripts/lot/corps-de-pr.ts', 'utf8')).toContain(MODULE);
  });

  it('REQ-GOV-010 · aucun des deux ne garde sa lecture ad hoc — dans le CODE', () => {
    for (const f of ['scripts/gates/gov-pr.ts', 'scripts/lot/corps-de-pr.ts']) {
      for (const forme of LECTURES_AD_HOC) {
        const fautives = lignesDeCode(readFileSync(f, 'utf8')).filter(forme.vue);
        expect(fautives, `${f} porte encore ${forme.nom} : ${fautives.join(' | ')}`).toEqual([]);
      }
    }
  });

  it('REQ-GOV-010 · CONTRE-TÉMOIN : la garde laisse passer les lectures LÉGITIMES du corps', () => {
    // `gov-pr.ts` lit la ligne `Auteur:` du corps par un motif de poste : c'est une lecture du
    // CORPS de la PR, pas des revues. La garde ne doit pas la condamner — sinon le seul moyen de
    // la verdir serait de retirer ce qui protège.
    const code = lignesDeCode(readFileSync('scripts/gates/gov-pr.ts', 'utf8'));
    expect(code.some((l) => l.includes(MOTIF_DE_POSTE) && l.includes('Auteur:'))).toBe(true);
    expect(code.some((l) => l.includes(MOTIF_DE_POSTE) && l.includes(SEPARATEUR))).toBe(false);
  });

  it('REQ-GOV-010 · le composeur de corps est IMPORTÉ par ce test — il ne l’était par aucun', () => {
    // La lentille `mutation` l'a mesuré sur `41bc814` : `scripts/lot/corps-de-pr.ts` était importé
    // par AUCUN test, appelé par AUCUNE gate, exercé par AUCUNE étape de CI. Un module qui décide
    // si une PR est fusionnable et que rien ne couvre n'est pas une garde, c'est une opinion.
    // L'import ci-dessous n'est pas décoratif : il fait entrer le fichier dans `pnpm test`, donc
    // dans la Gate A, donc dans le périmètre où un mutant rougit.
    expect(rendre('a {{X}} b', { X: 'vu' })).toBe('a vu b');
    expect(() => rendre('il reste {{TACHES}}', {})).toThrow(/marqueur\(s\) non résolu\(s\) : TACHES/);
  });

  it('REQ-GOV-010 · les états rendus sont déclarés une fois, et `DISMISSED` n’en est pas', () => {
    expect(ETATS_RENDUS.has('APPROVED')).toBe(true);
    expect(ETATS_RENDUS.has('COMMENTED')).toBe(true);
    expect(ETATS_RENDUS.has('DISMISSED')).toBe(false);
    expect(ETATS_RENDUS.has('PENDING')).toBe(false);
  });
});
