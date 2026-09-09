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
/**
 * ⚠️ L'API NEUVE SE PREND PAR ESPACE DE NOMS, ET C'EST UNE PRÉCAUTION DE MÉTHODE, PAS UN STYLE.
 *
 * Un import NOMMÉ d'un export qui n'existe pas encore fait échouer le CHARGEMENT du module : les
 * quarante témoins déjà verts de ce fichier rougissent d'un coup, et le message d'échec du témoin
 * neuf n'est plus le sien mais celui du chargeur. On ne verrait alors pas la garde rougir POUR SA
 * RAISON — RM-02 exige l'inverse. Par l'espace de noms, un export absent est `undefined` : le
 * témoin neuf rougit seul, et il rougit sur son propre appel.
 */
import * as LECTEUR from '../../../scripts/lot/revues';
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
  /**
   * ⚠️ CE CHAMP EST LE TROU QUE LA FABRIQUE AVAIT. Elle ne savait poser QU'UNE ligne `Verdict:`,
   * si bien qu'aucun témoin ne pouvait exercer un corps qui en porte deux — et le lecteur y était
   * permissif sans que rien ne le dise. Une fabrique de fixtures qui ne sait produire que la forme
   * correcte n'exerce jamais la forme fautive.
   */
  corps?: string;
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
    body:
      r.corps ??
      `${r.poste ?? 'A09'} · ${r.lentille ?? 'exactitude'}
Verdict: ${r.verdict ?? 'accepte'}`,
  };
}

/**
 * UN CORPS D'AVIS À LA FORME RÉELLE. Mesuré le 2026-09-05 sur les 23 revues de la PR 31 : chacune
 * porte l'en-tête en ligne 0, puis une ligne vide, puis — en ligne 2 ou 4 — la ligne qui tranche,
 * SEULE sur sa ligne et au ras de la marge, puis la prose. Aucune ne s'écarte de cette forme.
 * Les témoins ci-dessous glissent la citation DANS la prose, là où un relecteur la met vraiment.
 */
function corpsDAvis(poste: string, lentille: string, prose: string, verdict: 'accepte' | 'refuse'): string {
  return `${poste} · ${lentille}\n\n${prose}\n\nVerdict: ${verdict}\n`;
}

/** Retire commentaires de bloc et de ligne : une garde de CODE ne juge pas la prose qui l'explique. */
function lignesDeCode(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .filter((l) => !/^\s*(\/\/|\*)/.test(l));
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
  // `lignesDeCode` est déclarée une seule fois, en tête de fichier : le témoin (6) l'emploie aussi,
  // et deux copies d'un filtre de code divergent comme deux copies de n'importe quoi d'autre (RM-01).

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

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * TÉMOIN (5) — UNE CITATION NE PORTE PAS LA DÉCISION.
 *
 * LE DÉFAUT, MESURÉ LE 2026-09-05 SUR `650ea10` PAR LA LENTILLE `securite`.
 * `scripts/lot/revues.ts:99` et `:285` : `MOTIF_VERDICT.exec(r.corps)` retenait la PREMIÈRE
 * occurrence de `Verdict:` dans TOUT le corps, en multiligne. Un avis d'un compte habilité qui
 * relate le tour précédent en clair, puis conclut par un refus, était retenu comme `accepte`.
 *
 * ET CE N'EST PAS THÉORIQUE : les 23 revues réelles de la PR 31 CITENT les verdicts précédents —
 * c'est même ce qu'on demande aux relecteurs. Deux d'entre elles (`5121345938`, `5121354058`)
 * portent un « Verdict: refuse » de citation EN MILIEU DE LIGNE, une troisième (`5121567035`)
 * décrit ce défaut-ci en citant la ligne qui le porte. Elles ne se faisaient pas prendre pour une
 * seule raison : le `^` du motif. La protection reposait donc sur un caractère d'ÉDITION —
 * l'absence de retour à la ligne avant la citation — que rien ne documentait comme portant une
 * décision de sécurité.
 *
 * CE QUI EST TRANCHÉ ICI, ET POURQUOI (la règle est écrite dans `scripts/lot/revues.ts`) :
 *
 *   — une DÉCISION est une ligne qui ne dit QUE la décision, au ras de la marge ;
 *   — toutes ces lignes sont relevées : une seule valeur, quel qu'en soit le nombre → elle vaut ;
 *     deux valeurs différentes → l'avis NE COMPTE POUR RIEN et la lecture le dit bruyamment.
 *
 * Le sens de l'échec est CONSERVATEUR : un avis qui ne compte pas ne fournit aucun accord, donc la
 * lentille manque, donc la case reste vide. Un relecteur ambigu reposte ; il n'est pas deviné.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('REQ-GOV-011 — TÉMOIN (5) : une CITATION de verdict ne porte pas la décision', () => {
  /** Les trois lentilles autres que `securite`, rendues légitimement sur la tête. */
  const TROIS_AUTRES = [
    avis(0, { poste: 'A09', lentille: 'exactitude' }),
    avis(2, { poste: 'A09', lentille: 'simplicite' }),
    avis(3, { poste: 'A10', lentille: 'mutation' }),
  ];

  /** La citation EN CLAIR du tour précédent, telle qu'un relecteur la colle : au ras de la marge. */
  const CITATION_EN_CLAIR = [
    'Je rappelle mon avis du tour précédent, verbatim :',
    '',
    'A08 · securite',
    'Verdict: accepte',
    '',
    'Ce tour-ci, le point n’est pas fermé.',
  ].join('\n');

  function citant(prose: string, verdict: 'accepte' | 'refuse' = 'refuse') {
    return avis(1, { poste: 'A08', lentille: 'securite', corps: corpsDAvis('A08', 'securite', prose, verdict) });
  }

  it('REQ-GOV-011 · un avis qui CITE `accepte` puis conclut `refuse` ne compte pour rien', () => {
    const suite = [...TROIS_AUTRES, citant(CITATION_EN_CLAIR)];
    // Le défaut, verbatim : le lecteur hérité — et le lecteur unique avant ce correctif — lisaient
    // la PREMIÈRE ligne `Verdict:` du corps, donc la CITATION, donc « accepte ».
    expect(herite(suite).marque).toBe('[x]');
    const lecture = lire(suite);
    expect(lecture.coche).toBe(false);
    expect(lecture.ecartees.map((e) => e.motif)).toEqual(['verdict_ambigu']);
    expect(lecture.manquantes).toEqual(['securite']);
  });

  it('REQ-GOV-011 · et la lecture le dit BRUYAMMENT : la revue nommée, les deux valeurs', () => {
    const lecture = lire([...TROIS_AUTRES, citant(CITATION_EN_CLAIR)]);
    const dit = lecture.raisons.join(' · ');
    expect(dit, 'la raison ne nomme pas la revue ambiguë').toContain('A08 · securite');
    expect(dit).toContain('accepte');
    expect(dit).toContain('refuse');
    // Un avis ambigu se REPOSTE : la lecture ne devine pas laquelle des deux valeurs est la bonne.
    expect(dit.toLowerCase()).toContain('ambig');
  });

  it('REQ-GOV-011 · une citation N’EFFACE PAS le veto que le même poste avait posé', () => {
    // Le cas qui coûte le plus cher : A08 refuse, puis reposte un avis qui cite son accord du tour
    // d'avant et re-refuse. Le premier lecteur retenait « accepte » — le veto disparaissait.
    const veto = avis(1, { poste: 'A08', lentille: 'securite', verdict: 'refuse' });
    const suite = [...TROIS_AUTRES, veto, citant(CITATION_EN_CLAIR)];
    expect(herite(suite).marque).toBe('[x]');
    const lecture = lire(suite);
    expect(lecture.coche).toBe(false);
    expect(lecture.refusees.map((v) => `${v.code}·${v.lentille}`)).toEqual(['A08·securite']);
  });

  it('REQ-GOV-011 · une citation dans un BLOC DE CODE ne tranche pas davantage', () => {
    // Coller la revue précédente entre trois accents graves est la pratique éditoriale la plus
    // banale du dépôt. Ce lecteur n'analyse PAS le Markdown — un analyseur de Markdown dans un
    // chemin de décision de sécurité est un risque plus grand que le reposte d'un avis : toute
    // ligne de décision compte, et le désaccord invalide.
    const cloture = String.fromCharCode(96, 96, 96);
    const enBlocDeCode = [cloture, 'A08 · securite', 'Verdict: accepte', cloture, '', 'Je maintiens mon refus.'].join('\n');
    expect(herite([...TROIS_AUTRES, citant(enBlocDeCode)]).marque).toBe('[x]'); // le défaut, verbatim
    const lecture = lire([...TROIS_AUTRES, citant(enBlocDeCode)]);
    expect(lecture.coche).toBe(false);
    expect(lecture.ecartees.map((e) => e.motif)).toEqual(['verdict_ambigu']);
  });

  it('REQ-GOV-011 · une ligne de décision NOYÉE DANS SA PROSE n’est pas une décision', () => {
    // Le trou que le `^` seul laissait ouvert : la citation EST en début de ligne, mais la ligne
    // continue. Le `\b` du motif suffisait à la faire passer pour un verdict rendu.
    const noyee = ['A08 · securite', '', 'Verdict: accepte, disait le tour 6 — moi je refuse.', ''].join('\n');
    const avecLigneNoyee = avis(1, { poste: 'A08', lentille: 'securite', corps: noyee });
    expect(herite([...TROIS_AUTRES, avecLigneNoyee]).marque).toBe('[x]'); // le défaut, verbatim
    const lecture = lire([...TROIS_AUTRES, avecLigneNoyee]);
    expect(lecture.coche).toBe(false);
    expect(lecture.ecartees.map((e) => e.motif)).toEqual(['sans_verdict']);
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : une citation en BLOCKQUOTE laisse passer le vrai verdict', () => {
    // Vert AVANT comme APRÈS le correctif — et c'est justement le point de la lentille : avant, sa
    // verdeur tenait au `>` que rien ne documentait. Elle tient désormais à une règle ÉCRITE (une
    // décision est seule sur sa ligne, au ras de la marge), dont le `>` n'est qu'un cas.
    const bq = ['> A08 · securite', '> Verdict: accepte', '', 'Je maintiens mon refus.'].join('\n');
    const lecture = lire([...TROIS_AUTRES, citant(bq)]);
    expect(lecture.ecartees).toEqual([]);
    expect(lecture.verdicts.filter((v) => v.lentille === 'securite').map((v) => v.verdict)).toEqual(['refuse']);
    expect(lecture.coche).toBe(false);
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : deux lignes de décision IDENTIQUES ne sont pas ambiguës', () => {
    // Un relecteur qui répète son verdict en tête et en pied ne contredit personne : lui refuser
    // son avis rendrait la garde capricieuse, et une gate capricieuse s'apprend à se sauter.
    const repete = ['A09 · securite', '', 'Verdict: accepte', '', 'En résumé.', '', 'Verdict: accepte'].join('\n');
    const suite = [...TROIS_AUTRES, avis(1, { poste: 'A09', lentille: 'securite', corps: repete })];
    const lecture = lire(suite);
    expect(lecture.ecartees).toEqual([]);
    expect(lecture.coche).toBe(true);
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : les revues RÉELLES rendent chacune UN verdict, sans ambiguïté', () => {
    // Le contre-témoin qui compte : si la règle neuve invalidait la forme réellement pratiquée, on
    // aurait remplacé un lecteur permissif par une gate insatisfiable. Les corps sont lus dans la
    // capture — projection élargie à TOUTE ligne portant `Verdict`, donc à toute ligne qui peut
    // influencer la décision (une ligne qui n'en porte pas ne peut pas être une ligne de décision).
    expect(REELLES.length).toBeGreaterThan(0);
    for (const r of REELLES) {
      const lu = LECTEUR.verdictDeLaRevue(r.body ?? '');
      expect(lu, `la revue ne rend aucun verdict : ${JSON.stringify(r.body)}`).not.toHaveProperty('motif');
      expect((lu as { verdict: string }).verdict).toMatch(/^(accepte|refuse)$/);
    }
    // TÉMOIN POSITIF DE LA CAPTURE : elle porte bien des citations, sans quoi ce contre-témoin
    // n'exercerait rien. Deux revues réelles citent « Verdict: … » ailleurs que sur leur ligne
    // de décision (`5121345938`, `5121354058`), mesuré le 2026-09-05.
    const citantes = REELLES.filter((r) => ((r.body ?? '').match(/Verdict/g) ?? []).length > 1);
    expect(citantes.length, 'la capture ne porte plus aucune citation : elle n’exerce plus rien').toBeGreaterThan(0);
  });

  it('REQ-GOV-011 · les formes, lues une par une par le lecteur de verdict', () => {
    const V = LECTEUR.verdictDeLaRevue;
    expect(V('A08 · securite\n\nVerdict: refuse\n')).toEqual({ verdict: 'refuse', lignes: 1 });
    expect(V('A08 · securite\n\nVerdict: accepte\n\nVerdict: refuse\n')).toEqual({
      motif: 'verdict_ambigu',
      valeurs: ['accepte', 'refuse'],
    });
    expect(V('A08 · securite\n\n> Verdict: accepte\n\nVerdict: refuse\n')).toEqual({ verdict: 'refuse', lignes: 1 });
    expect(V('A08 · securite\n\n… donc Verdict: accepte selon moi …\n')).toEqual({ motif: 'sans_verdict', valeurs: [] });
    expect(V('A08 · securite\n\nVerdict: refuse\n\nVerdict: refuse\n')).toEqual({ verdict: 'refuse', lignes: 2 });
    // Les fins de ligne de Windows ne changent pas une décision.
    expect(V('A08 · securite\r\n\r\nVerdict: refuse\r\n')).toEqual({ verdict: 'refuse', lignes: 1 });
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * TÉMOIN (6) — LE LECTEUR EST UNIQUE, SON ENTRÉE NE L'ÉTAIT PAS.
 *
 * MESURÉ LE 2026-09-05 SUR LES DONNÉES RÉELLES DE LA PR 31 : les deux appelants du lecteur unique
 * ne lui donnaient pas le même `tachesSchema`.
 *
 *     gov-pr.ts      `depot.taches.find(t => t.id === <la tâche du TITRE>)`   → GOV-024 → false
 *     corps-de-pr.ts `T.filter(t => t.pr === 31).some(t => t.schema)`         → GOV-006 → true
 *
 * Les deux ne concordent sur cette PR-ci que par accident : `prisma/schema.prisma` est au diff ET
 * le label `schema` est posé, si bien que les deux autres signaux de `toucheSchema()` couvrent
 * l'écart. Retire l'un des deux, et la garde BLOQUANTE exige moins que le corps n'affiche.
 *
 * CE QUI EST TRANCHÉ, ET POURQUOI JE CONTREDIS EN PARTIE LA LENTILLE. Son avis était « toutes les
 * tâches portant `pr: <n>` ». C'est le bon dénominateur, mais il ne suffit pas : MESURÉ, 179 des
 * 207 tâches de `docs/tasks.json` portent `pr: null`, dont douze à `schema: true` (`INT-T01b`,
 * `SEC-17`, `DM-06`…). Une PR ouverte AVANT que `tasks.json` ne porte son numéro aurait donc un
 * ensemble VIDE, et la garde n'exigerait pas `schema` pour une tâche qui l'est. La dérivation
 * unique est donc l'UNION : les tâches portant `pr: <n>`, PLUS celle que le titre nomme.
 *
 * Et la propriété qui interdit l'inversion redoutée par la lentille est la MONOTONIE : l'ensemble
 * ne peut que GROSSIR quand on lui donne un renseignement de plus. L'appelant qui en sait le plus
 * — la garde, qui lit le titre — obtient toujours un sur-ensemble de celui du composeur. « La
 * garde exige moins que le corps n'affiche » devient donc impossible par construction, et non
 * plus vrai par coïncidence.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('REQ-GOV-010 — TÉMOIN (6) : une seule dérivation de l’ensemble des tâches d’une PR', () => {
  type TacheBrute = { id: string; pr?: number | null; schema?: boolean; reqs?: string[] };
  const TACHES = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheBrute[] }).taches;

  /** Une tâche RÉELLE du backlog, jamais tapée de mémoire (RM-03). */
  function tache(id: string): TacheBrute {
    const t = TACHES.find((x) => x.id === id);
    if (t === undefined) throw new Error(`docs/tasks.json ne porte plus la tâche ${id}`);
    return t;
  }

  it('REQ-GOV-010 · la divergence, rejouée : la tâche du TITRE dit `false`, les tâches de la PR `true`', () => {
    const duTitre = tache('GOV-024'); // « feat(GOV-024): … » — le titre réel de la PR 31
    const autre = tache('GOV-006'); // une des neuf tâches de la même PR, et c'est elle qui est `schema`
    const echantillon = [duTitre, autre];

    // Les deux dérivations telles qu'elles étaient ÉCRITES, côte à côte.
    const parLeTitre = echantillon.find((t) => t.id === 'GOV-024')?.schema === true; // gov-pr.ts
    const parLaPr = echantillon.filter((t) => t.pr === 31).some((t) => t.schema === true); // corps-de-pr.ts
    expect(parLeTitre, 'GOV-024 n’est pas une tâche de schéma').toBe(false);
    expect(parLaPr, 'GOV-006 l’est, et elle est sur la même PR').toBe(true);
    expect(parLeTitre).not.toBe(parLaPr); // LA DIVERGENCE, MESURÉE

    // La dérivation unique tranche, et elle tranche du côté strict.
    expect(LECTEUR.tachesSchemaDeLaPr(echantillon, 31, 'GOV-024')).toBe(true);
    expect(LECTEUR.tachesDeLaPr(echantillon, 31, 'GOV-024').map((t) => t.id).sort()).toEqual(['GOV-006', 'GOV-024']);
  });

  it('REQ-GOV-010 · l’UNION, parce que la plupart des tâches ne portent pas encore de `pr`', () => {
    const sansPr = TACHES.filter((t) => t.pr === null || t.pr === undefined);
    expect(sansPr.length, 'le fait qui justifie l’union a disparu du backlog').toBeGreaterThan(0);
    const orpheline = sansPr.find((t) => t.schema === true);
    expect(orpheline, 'aucune tâche `schema: true` sans `pr` : le témoin ne mesure plus rien').toBeDefined();

    // « Toutes les tâches portant `pr: <n>` », seule, rendrait `false` sur une PR pas encore reliée.
    expect([orpheline!].filter((t) => t.pr === 99).some((t) => t.schema === true)).toBe(false);
    expect(LECTEUR.tachesSchemaDeLaPr([orpheline!], 99, orpheline!.id)).toBe(true);
  });

  it('REQ-GOV-010 · MONOTONIE : en savoir plus ne peut que GROSSIR l’ensemble, jamais le rétrécir', () => {
    // C'est cette propriété — et pas la concordance d'aujourd'hui — qui interdit à la garde
    // d'exiger moins que le corps n'affiche.
    const echantillon = [tache('GOV-024'), tache('GOV-006')];
    const sansTitre = LECTEUR.tachesDeLaPr(echantillon, 31, null).map((t) => t.id);
    const avecTitre = LECTEUR.tachesDeLaPr(echantillon, 31, 'GOV-024').map((t) => t.id);
    for (const id of sansTitre) expect(avecTitre, 'l’ensemble a RÉTRÉCI').toContain(id);
    expect(LECTEUR.tachesSchemaDeLaPr(echantillon, 31, null)).toBe(true);
    expect(LECTEUR.tachesSchemaDeLaPr(echantillon, 31, 'GOV-024')).toBe(true);
  });

  it('REQ-GOV-010 · les DEUX appelants consomment cette dérivation, et aucun ne compose la sienne', () => {
    for (const f of ['scripts/gates/gov-pr.ts', 'scripts/lot/corps-de-pr.ts']) {
      const code = readFileSync(f, 'utf8');
      expect(code, `${f} ne consomme pas la dérivation unique`).toContain('tachesDeLaPr');
      const adHoc = lignesDeCode(code).filter((l) => l.includes('tachesSchema') && l.includes('.schema === true'));
      expect(adHoc, `${f} compose encore son propre tachesSchema : ${adHoc.join(' | ')}`).toEqual([]);
    }
  });

  it('REQ-GOV-010 · CONTRE-TÉMOIN : sur la PR 31 réelle, les deux entrées donnaient déjà le même RÉSULTAT', () => {
    // Et c'est pour cela qu'il ne prouve rien seul : `prisma/schema.prisma` au diff et le label
    // `schema` posé couvrent l'écart. C'est le témoin ci-dessus qui discrimine, pas celui-ci.
    const REEL = { fichiers: ['prisma/schema.prisma', 'scripts/lot/revues.ts'], labels: ['schema'] };
    expect(toucheSchema({ ...REEL, tachesSchema: false })).toBe(true);
    expect(toucheSchema({ ...REEL, tachesSchema: true })).toBe(true);
    // Retire les deux signaux qui couvrent, et l'entrée redevient seule à décider.
    expect(toucheSchema({ fichiers: [], labels: [], tachesSchema: false })).toBe(false);
    expect(toucheSchema({ fichiers: [], labels: [], tachesSchema: true })).toBe(true);
  });
});
