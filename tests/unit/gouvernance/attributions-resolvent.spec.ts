// @req REQ-GOV-021
// @req REQ-GOV-003
/**
 * LES ATTRIBUTIONS SE CONFRONTENT À LEURS SOURCES (GOV-037).
 *
 * CE QUI A FAIT ÉCRIRE CE FICHIER. Le dépôt dérive et vérifie ses NOMBRES — compteurs de tâches,
 * d'exigences, de gardes, `gov:tasks --verifie-rendu`, `gov:requirements --verifie-rendu`,
 * `lot:paths --check`. Il ne confronte AUCUNE de ses ATTRIBUTIONS : quelle tâche porte quelle
 * exigence, quelle tâche porte quelle garde, quel poste porte quelle tâche, quel lot porte quelle
 * tâche. Ces liens sont écrits DEUX FOIS, dans deux fichiers, et rien ne les compare.
 *
 * DEUX DÉFAUTS RÉELS, MESURÉS SUR CET ARBRE (8e9113f), qui relèvent de cette famille :
 *
 *   — `docs/gates.json` attribue TROIS gardes à `INT-T01a` — `detect-pii.ts`, `contrat-epingle.ts`,
 *     `fixtures-source.ts` — que `docs/tasks.json` ne déclare pas en retour dans les `paths` de
 *     cette tâche. La tâche est `fusionnee`. L'attribution n'est réciproque dans aucun sens, et
 *     `gov:tasks`, `gov:trace`, `lot:paths --check` sont tous verts dessus.
 *
 *   — `pnpm lot:cloture` écrit `t.lot = lotId` INCONDITIONNELLEMENT sur toute tâche présente dans
 *     le rendu du workflow. Une tâche étrangère au lot y passe `fusionnee` avec `"lot": "L-1-04"`
 *     dans un fichier versionné, et rien ne rougit — `docs/lots/` est en `.gitignore`, donc la
 *     composition ne survit pas à un `clone`. La SEULE seconde source qui reste au dépôt est
 *     `docs/journal/`, où chaque clôture nomme son lot sous un titre `## PR #<n>`.
 *
 * CE QUE CE FICHIER PROUVE. Que `scripts/gates/gov-attributions.ts` NOMME la faute — pas qu'elle
 * existe quelque part, mais QUI l'a écrite et OÙ. Chaque famille a son témoin (une source
 * fabriquée qui doit rougir) ET son contre-témoin (une source légitime qui doit rester verte) :
 * une garde qui rougit sur tout ne dit rien de plus qu'une garde qui ne rougit jamais, et la
 * réciproque a déjà coûté une garde retirée dans la semaine.
 *
 * CE QU'IL NE PROUVE PAS, écrit plutôt que tu :
 *   — la 5e occurrence qui motive GOV-037 vit dans une REVUE (« la revue s'appuie sur GOV-033 »),
 *     hors de tout fichier du dépôt : aucune garde de dépôt ne peut la voir ;
 *   — l'en-tête n'est lu que sur ses VINGT premières lignes (le périmètre que l'acceptance fixe) :
 *     une attribution écrite en ligne 21 est invisible ;
 *   — la confrontation `tests{}` ↔ `paths` n'est PAS ici : elle appartient à `scripts/lot/composer.ts`,
 *     hors des `paths` de GOV-037.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  analyser,
  chargerSources,
  FAMILLES,
  type Sources,
} from '../../../scripts/gates/gov-attributions';

// ── fabrique de sources : AUCUN défaut sur la dimension que le test fait varier (RM-11) ───────
//
// Chaque champ est explicite à l'appel. Une fixture « minimale » qui compléterait les champs
// absents transformerait l'absence en présence — c'est exactement le piège que RM-11 nomme.
function sources(s: Partial<Sources>): Sources {
  return {
    taches: s.taches ?? [],
    exigences: s.exigences ?? [],
    gates: s.gates ?? [],
    postes: s.postes ?? [],
    journal: s.journal ?? '',
    entetes: s.entetes ?? [],
    citations: s.citations ?? [],
    dettesGate: s.dettesGate ?? [],
    dettesLot: s.dettesLot ?? [],
    existe: s.existe ?? (() => false),
  };
}

const familles = (f: { famille: string }[]) => [...new Set(f.map((x) => x.famille))].sort();
const texte = (f: { message: string }[]) => f.map((x) => x.message).join('\n');

describe('REQ-GOV-021 — l’attribution exigence ↔ tâche est RÉCIPROQUE', () => {
  it('TÉMOIN : une exigence qui cite une tâche qui ne la cite pas en retour rougit, et les NOMME toutes les deux', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'a_faire' }],
        exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-100'] }],
      })
    );
    expect(familles(f)).toContain('req_tache_non_reciproque');
    expect(texte(f)).toContain('REQ-GOV-900');
    expect(texte(f)).toContain('GOV-100');
  });

  it('TÉMOIN : une tâche qui cite une exigence qui ne la cite pas en retour rougit', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: ['REQ-GOV-900'], owner: null, lot: null, pr: null, statut: 'a_faire' }],
        exigences: [{ id: 'REQ-GOV-900', taches: [] }],
      })
    );
    expect(familles(f)).toContain('req_tache_non_reciproque');
    expect(texte(f)).toContain('REQ-GOV-900');
  });

  it('TÉMOIN : une exigence qui cite une tâche INEXISTANTE rougit en la nommant', () => {
    const f = analyser(sources({ taches: [], exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-999'] }] }));
    expect(texte(f)).toContain('GOV-999');
  });

  it('CONTRE-TÉMOIN : une attribution réciproque des DEUX côtés reste verte', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: ['REQ-GOV-900'], owner: null, lot: null, pr: null, statut: 'a_faire' }],
        exigences: [{ id: 'REQ-GOV-900', taches: ['GOV-100'] }],
      })
    );
    expect(f).toEqual([]);
  });
});

describe('REQ-GOV-021 — l’attribution garde ↔ tâche est RÉCIPROQUE', () => {
  const tacheResolue = {
    id: 'INT-T01a',
    paths: ['packages/contracts/', 'scripts/contracts/export.ts'],
    tests: {},
    reqs: [],
    owner: null,
    lot: null,
    pr: null,
    statut: 'fusionnee',
  };

  it('TÉMOIN — LE DÉFAUT RÉEL : une gate nomme `INT-T01a`, que la tâche ne nomme pas en retour', () => {
    const f = analyser(
      sources({
        taches: [tacheResolue],
        gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'INT-T01a' }],
      })
    );
    expect(familles(f)).toContain('gate_non_reciproque');
    expect(texte(f)).toContain('detectPii');
    expect(texte(f)).toContain('scripts/gates/detect-pii.ts');
    expect(texte(f)).toContain('INT-T01a');
  });

  it('TÉMOIN : une gate attribuée à une tâche qui N’EXISTE PAS rougit en nommant les deux', () => {
    const f = analyser(sources({ taches: [], gates: [{ id: 'gov:zzz', script: 'scripts/gates/zzz.ts', tache: 'GOV-999' }] }));
    expect(familles(f)).toContain('gate_tache_inconnue');
    expect(texte(f)).toContain('gov:zzz');
    expect(texte(f)).toContain('GOV-999');
  });

  it('CONTRE-TÉMOIN : la garde figure dans les `paths` de sa tâche → vert', () => {
    const f = analyser(
      sources({
        taches: [{ ...tacheResolue, paths: ['scripts/gates/detect-pii.ts'] }],
        gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'INT-T01a' }],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : la garde figure dans le `tests{}` de sa tâche → vert', () => {
    const f = analyser(
      sources({
        taches: [{ ...tacheResolue, tests: { 'REQ-X': ['tests/integration/index-partiel.spec.ts#un cas'] } }],
        gates: [{ id: 'idx', script: 'tests/integration/index-partiel.spec.ts', tache: 'INT-T01a' }],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : la garde est sous un RÉPERTOIRE déclaré (`packages/contracts/`) → vert', () => {
    const f = analyser(
      sources({
        taches: [tacheResolue],
        gates: [{ id: 'c', script: 'packages/contracts/verifier.ts', tache: 'INT-T01a' }],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : le `#job` d’un chemin de workflow ne compte pas dans la comparaison', () => {
    const f = analyser(
      sources({
        taches: [{ ...tacheResolue, paths: ['.github/workflows/ci.yml'] }],
        gates: [{ id: 'gate-a', script: '.github/workflows/ci.yml#gate-a', tache: 'INT-T01a' }],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN — CE QUE LA GARDE NE PEUT PAS SAVOIR : des `paths` GABARIT rendent l’attribution INDÉTERMINÉE, pas FAUSSE', () => {
    // 186 des 209 tâches portent encore un chemin gabarit `<dossier>/<son propre id>`, écrit par
    // l'amorçage : il dit « on ne connaît pas encore les chemins », pas « la garde n'est pas à moi ».
    // Condamner ces 186-là rendrait la garde rouge de naissance, donc désarmée dans la semaine.
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-003', paths: ['docs/gouvernance/GOV-003'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'fusionnee' }],
        gates: [{ id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' }],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : une tâche VOISINE peut déclarer la même garde sans en être porteuse', () => {
    // `GOV-025` et `GOV-028` déclarent `gov-identifiants.ts`, que `docs/gates.json` attribue à
    // `GOV-003`. Une garde est CRÉÉE par une tâche puis ÉTENDUE par d'autres : exiger la
    // réciproque dans ce sens-là condamnerait neuf attributions parfaitement saines.
    const f = analyser(
      sources({
        taches: [
          { id: 'GOV-003', paths: ['scripts/gates/gov-identifiants.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'fusionnee' },
          { id: 'GOV-025', paths: ['scripts/gates/gov-identifiants.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'fusionnee' },
        ],
        gates: [{ id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' }],
      })
    );
    expect(f).toEqual([]);
  });
});

describe('REQ-GOV-021 — l’attribution poste ↔ tâche se confronte au registre des agents', () => {
  it('TÉMOIN : un `owner` absent de `docs/agents.json` rougit en nommant la tâche ET le code', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: 'A99', lot: null, pr: null, statut: 'a_faire' }],
        postes: [{ code: 'A01' }],
      })
    );
    expect(familles(f)).toContain('owner_hors_registre');
    expect(texte(f)).toContain('GOV-100');
    expect(texte(f)).toContain('A99');
  });

  it('CONTRE-TÉMOIN : un `owner` vide n’est pas une attribution fausse, c’est une absence', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'a_faire' }],
        postes: [{ code: 'A01' }],
      })
    );
    expect(f).toEqual([]);
  });
});

describe('REQ-GOV-021 — l’attribution lot ↔ tâche est ATTESTÉE par une seconde source', () => {
  const journal = ['## PR #31 — feat(GOV-024): lots L-1-04, L-1-05 et L-1-06', '', '**Fait.** Neuf tâches.', ''].join('\n');

  it('TÉMOIN — LE DÉFAUT RÉEL : une tâche ÉTRANGÈRE au lot, marquée `L-1-04` par `lot:cloture`, rougit', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: 'L-9-99', pr: 31, statut: 'fusionnee' }],
        journal,
      })
    );
    expect(familles(f)).toContain('lot_non_atteste');
    expect(texte(f)).toContain('GOV-100');
    expect(texte(f)).toContain('L-9-99');
    expect(texte(f)).toContain('31');
  });

  it('TÉMOIN : une tâche dont la PR n’a AUCUNE entrée de journal rougit', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: 'L-1-04', pr: 77, statut: 'fusionnee' }],
        journal,
      })
    );
    expect(familles(f)).toContain('lot_non_atteste');
    expect(texte(f)).toContain('77');
  });

  it('CONTRE-TÉMOIN : le lot nommé dans le TITRE de l’entrée de journal suffit', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: 'L-1-04', pr: 31, statut: 'fusionnee' }],
        journal,
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : une tâche SANS lot et SANS PR ne demande aucune attestation', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-100', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'a_faire' }],
        journal,
      })
    );
    expect(f).toEqual([]);
  });
});

describe('REQ-GOV-003 — un identifiant de tâche BIEN FORMÉ qui ne RÉSOUT PAS est refusé', () => {
  // `gov:identifiants` juge la FORME d'un identifiant, jamais sa RÉSOLUTION : `GOV-029` a
  // exactement la bonne forme et ne désignait plus rien. C'est le trou que cette famille ferme.
  const backlog = [{ id: 'GOV-024', paths: ['scripts/lot/corps-de-pr.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'fusionnee' }];

  it('TÉMOIN : un en-tête de `scripts/` nommant `GOV-033`, qui n’existe nulle part, rougit avec le FICHIER et la LIGNE', () => {
    const f = analyser(
      sources({
        taches: backlog,
        entetes: [{ fichier: 'scripts/lot/corps-de-pr.ts', lignes: ['/**', ' * corps-de-pr.ts — arbitrage porté par GOV-033.', ' */'] }],
      })
    );
    expect(familles(f)).toContain('mention_non_resolue');
    expect(texte(f)).toContain('scripts/lot/corps-de-pr.ts:2');
    expect(texte(f)).toContain('GOV-033');
  });

  it('TÉMOIN : la PROSE de `docs/gates.json` — pas seulement son champ `tache` — est lue', () => {
    // La lentille schema a mesuré que sur `gov:plan-state` le champ `tache` n'a JAMAIS bougé
    // pendant que la valse GOV-029 → GOV-032 → GOV-035 se jouait dans le champ `verifie`.
    const f = analyser(
      sources({
        taches: backlog,
        gates: [{ id: 'gov:plan-state', script: 'scripts/gates/gov-etat.ts', tache: 'GOV-024', verifie: 'la lacune que GOV-033 porte' }],
      })
    );
    expect(familles(f)).toContain('mention_non_resolue');
    expect(texte(f)).toContain('gov:plan-state');
    expect(texte(f)).toContain('verifie');
    expect(texte(f)).toContain('GOV-033');
  });

  it('CONTRE-TÉMOIN : une mention DÉCLARÉE — la garde qui NOMME la forme qu’elle interdit — reste verte', () => {
    // « aucun identifiant scindé (INT-T01, GOV-017, EXT-T02) » est la phrase qui PROTÈGE.
    // Une garde qui la ferait rougir forcerait à la retirer : c'est déjà arrivé une fois.
    const f = analyser(
      sources({
        taches: backlog,
        entetes: [{ fichier: 'scripts/gates/gov-tasks.ts', lignes: ['/**', ' * interdiction des identifiants SCINDÉS (`GOV-017`).', ' */'] }],
        citations: [
          { ou: 'scripts/gates/gov-tasks.ts', id: 'GOV-017', nature: 'citation', raison: 'la garde nomme la forme scindée qu’elle interdit' },
        ],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : un identifiant qui RÉSOUT et dont le fichier est dans ses `paths` reste vert', () => {
    const f = analyser(
      sources({
        taches: backlog,
        entetes: [{ fichier: 'scripts/lot/corps-de-pr.ts', lignes: ['/**', ' * corps-de-pr.ts (GOV-024).', ' */'] }],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : un identifiant d’EXIGENCE (`REQ-GOV-003`) n’est pas un identifiant de tâche', () => {
    const f = analyser(
      sources({
        taches: backlog,
        entetes: [{ fichier: 'scripts/lot/corps-de-pr.ts', lignes: ['/**', ' * porte REQ-GOV-003 et REQ-DM-003.', ' */'] }],
      })
    );
    expect(f).toEqual([]);
  });

  it('CONTRE-TÉMOIN : un identifiant de GATE (`G-SEC-ROLES`, `GATE-JUR-PURGE`) n’est pas un identifiant de tâche', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'SEC-08', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'a_faire' }],
        entetes: [{ fichier: 'scripts/a.ts', lignes: ['// G-SEC-ROLES et GATE-JUR-PURGE'] }],
      })
    );
    expect(f).toEqual([]);
  });
});

describe('REQ-GOV-021 — LA GARDE CONFRONTE À L’ÉTAT COURANT DU BACKLOG, elle ne vérifie pas UNE FOIS', () => {
  // Une attribution ne se corrompt pas seulement quand l'auteur se trompe : elle se corrompt quand
  // le BACKLOG bouge. `docs/gates.json` citait `GOV-032` pour la lacune PLAN-STATE, et c'était
  // DÉFENDABLE quand la phrase a été écrite — aucune tâche ne portait alors cette lacune. La
  // phrase est devenue fausse le jour où `GOV-035` a été créée, sans que rien ne soit réécrit.
  it('TÉMOIN : une citation DÉCLARÉE dont l’identifiant s’est mis à RÉSOUDRE rougit — le registre a vieilli', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'GOV-033', paths: ['scripts/a.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'a_faire' }],
        entetes: [{ fichier: 'scripts/a.ts', lignes: ['// GOV-033'] }],
        citations: [{ ou: 'scripts/a.ts', id: 'GOV-033', nature: 'reservation', raison: 'identifiant réservé, pas encore ouvert' }],
      })
    );
    expect(familles(f)).toContain('citation_perimee');
    expect(texte(f)).toContain('GOV-033');
  });

  it('TÉMOIN : une citation DÉCLARÉE dont le site ne porte plus l’identifiant rougit', () => {
    const f = analyser(
      sources({
        taches: [],
        entetes: [{ fichier: 'scripts/a.ts', lignes: ['// plus rien ici'] }],
        citations: [{ ou: 'scripts/a.ts', id: 'GOV-033', nature: 'citation', raison: 'corrigée depuis' }],
      })
    );
    expect(familles(f)).toContain('citation_perimee');
  });

  it('TÉMOIN : une dette de réciprocité DÉCLARÉE mais RÉPARÉE rougit — on ne laisse pas dormir un registre', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'INT-T01a', paths: ['scripts/gates/detect-pii.ts'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'fusionnee' }],
        gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'INT-T01a' }],
        dettesGate: [{ gate: 'detectPii', tache: 'INT-T01a', script: 'scripts/gates/detect-pii.ts', raison: 'livrable absent du dépôt' }],
      })
    );
    expect(familles(f)).toContain('dette_perimee');
    expect(texte(f)).toContain('detectPii');
  });

  it('CONTRE-TÉMOIN : une dette DÉCLARÉE et toujours MESURÉE ne rougit pas — elle est bruyante, pas bloquante', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'INT-T01a', paths: ['packages/contracts/'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'fusionnee' }],
        gates: [{ id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'INT-T01a' }],
        dettesGate: [{ gate: 'detectPii', tache: 'INT-T01a', script: 'scripts/gates/detect-pii.ts', raison: 'livrable absent du dépôt' }],
      })
    );
    expect(f).toEqual([]);
  });

  it('TÉMOIN : une NOUVELLE non-réciprocité, à côté d’une dette déclarée, rougit quand même', () => {
    const f = analyser(
      sources({
        taches: [{ id: 'INT-T01a', paths: ['packages/contracts/'], tests: {}, reqs: [], owner: null, lot: null, pr: null, statut: 'fusionnee' }],
        gates: [
          { id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'INT-T01a' },
          { id: 'nouvelle', script: 'scripts/gates/nouvelle.ts', tache: 'INT-T01a' },
        ],
        dettesGate: [{ gate: 'detectPii', tache: 'INT-T01a', script: 'scripts/gates/detect-pii.ts', raison: 'livrable absent du dépôt' }],
      })
    );
    expect(familles(f)).toContain('gate_non_reciproque');
    expect(texte(f)).toContain('nouvelle');
    expect(texte(f)).not.toContain('detect-pii');
  });
});

describe('REQ-GOV-021 — la garde est VERTE sur le dépôt réel, et son périmètre n’est pas vide', () => {
  it('le dépôt tel qu’il est ne porte aucune attribution non confrontée', () => {
    const s = chargerSources();
    // 🔑 TÉMOIN POSITIF. « Aucune faute » et « rien de lu » sont indiscernables sans lui : c'est le
    // motif de `fichiers-suivis.ts`, et il vaut aussi pour un chargeur qui rendrait des tableaux vides.
    expect(s.taches.length, 'aucune tâche lue : la garde ne mesure RIEN').toBeGreaterThan(0);
    expect(s.exigences.length, 'aucune exigence lue').toBeGreaterThan(0);
    expect(s.gates.length, 'aucune gate lue').toBeGreaterThan(0);
    expect(s.postes.length, 'aucun poste lu').toBeGreaterThan(0);
    expect(s.entetes.length, 'aucun en-tête lu : le balayage de scripts/ et tests/ est muet').toBeGreaterThan(0);
    expect(s.journal.length, 'journal vide : l’attestation des lots ne mesure rien').toBeGreaterThan(0);
    expect(analyser(s).map((f) => f.message)).toEqual([]);
  });
});

describe('REQ-GOV-021 — chaque famille a un témoin ET un contre-témoin, et la garde est CÂBLÉE', () => {
  it('toute famille déclarée par la garde est couverte par un `describe` de ce fichier', () => {
    // 🔴 SANS CECI, AJOUTER UNE FAMILLE SANS TÉMOIN PASSE EN SILENCE. Le compte n'est pas tapé :
    // il est dérivé de `FAMILLES`, que la garde exporte, et confronté au TEXTE de ce fichier.
    const moi = readFileSync('tests/unit/gouvernance/attributions-resolvent.spec.ts', 'utf8');
    const sansTemoin = FAMILLES.filter((f) => !moi.includes(`'${f}'`));
    expect(sansTemoin, 'famille(s) déclarée(s) par la garde et sans témoin ici').toEqual([]);
    expect(FAMILLES.length, '`FAMILLES` est vide : on ne fait pas baisser la dette en la supprimant').toBeGreaterThan(0);
  });

  it('`gov:attributions` et sa preuve existent, sont dans la chaîne `gov:check` et dans la CI', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['gov:attributions']).toBe('tsx scripts/gates/gov-attributions.ts');
    expect(pkg.scripts['gov:attributions:prove']).toBe('tsx scripts/gates/gov-attributions.ts --prove');
    expect(pkg.scripts['gov:check']).toContain('pnpm gov:attributions');
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(ci, 'la garde n’est pas câblée en Gate A').toContain('pnpm gov:attributions');
    expect(ci, 'la PREUVE n’est pas câblée : une garde dont on ne vérifie pas qu’elle sait rougir cesse un jour de garder').toContain(
      'pnpm gov:attributions:prove'
    );
  });
});
