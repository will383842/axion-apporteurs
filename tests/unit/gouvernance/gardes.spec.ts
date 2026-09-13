/**
 * Les gardes de gouvernance, exercées comme des tests.
 *
 * POURQUOI CE FICHIER EXISTE. Les gardes tournent déjà dans la CI (job `gate-a`). Ce qu'elles ne
 * faisaient pas, c'est PROUVER leur propre capacité à rougir depuis `pnpm test` — et le schéma
 * `tasks.schema.json` exige, pour toute tâche livrée, des `tests` qui la couvrent. Une tâche de
 * gouvernance dont le seul contrôle est une garde n'avait aucun test à déclarer : elle ne pouvait
 * donc jamais passer `fusionnee` sans qu'on écrive un état invalide.
 *
 * Chaque garde est exercée DEUX FOIS :
 *   1. sur l'état du dépôt      → doit sortir 0 ;
 *   2. en mode `--prove`        → doit sortir 0 APRÈS avoir vu rougir chacune de ses familles.
 *
 * Le mode `--prove` échoue lui-même si une famille de règle n'a pas de témoin, ou si un
 * contre-témoin rougit. C'est lui qui porte la preuve ; ce test le rend exécutable ici.
 *
 * ⚠️ LES ANNOTATIONS CI-DESSOUS MANQUAIENT, ET LEUR ABSENCE A COÛTÉ SIX PR. Ce fichier portait
 * douze promesses de couverture dans `docs/tasks.json` et AUCUNE annotation `@req` — si bien que
 * la deuxième case de la définition de « terminé » (« chaque REQ a son test, nommé par son
 * identifiant, annoté `// @req` ») a été cochée sur les PR de GOV-000, GOV-001, GOV-003, GOV-005,
 * GOV-017a et QA-T00 sans être vraie. `pnpm gov:trace`, livrée par GOV-011 le 2026-09-04, l'a vu :
 * treize de ses seize ruptures tenaient à ce seul fichier.
 *
 * Les quatre exigences ci-dessous sont celles que ce fichier exerce RÉELLEMENT — vérifié une par
 * une contre le `describe` qui les couvre. Les autres promesses ont été RE-POINTÉES vers les
 * fichiers qui les portent vraiment, dans `docs/tasks.json` : les écrire ici aurait été refaire
 * la faute d'un cran plus bas.
 *
 * @req REQ-GOV-031  la règle de publication du dépôt public — les deux cas `gov:publication`
 * @req REQ-GOV-001  le registre d'exigences unique — les deux cas `gov:requirements`
 * @req REQ-GOV-003  aucun identifiant nu — `describe("gov:identifiants — citer n'est pas se servir")`
 * @req REQ-GOV-015  le registre des décisions — `describe('gov:hypotheses — le verrou du premier envoi DocuSeal')`
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { FAMILLES_ATTESTATION } from '../../../scripts/lot/attestation';

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const GARDES = [
  { nom: 'gov:publication', script: 'scripts/gates/gov-publication.ts', familles: 7 },
  // Les 12 familles d'origine de `gov:tasks`, plus celles de l'attestation inter-dépôt (GOV-038).
  // La seconde moitié est DÉRIVÉE de son module : recopier « 19 » ici aurait fait de ce fichier la
  // deuxième source d'un même compte, et c'est le compte qui sert justement à détecter la perte
  // silencieuse d'une famille. Le 12 reste écrit — il n'a pas de source importable, la liste vivant
  // dans un script à effets de bord au chargement.
  { nom: 'gov:tasks', script: 'scripts/gates/gov-tasks.ts', familles: 12 + FAMILLES_ATTESTATION.length },
  { nom: 'gov:requirements', script: 'scripts/gates/gov-requirements.ts', familles: 11 },
  { nom: 'gov:hypotheses', script: 'scripts/gates/gov-hypotheses.ts', familles: 10 },
];

describe.each(GARDES)('$nom', ({ script, familles }) => {
  it('est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer(script);
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it(`sait rougir : ses ${familles} familles ont chacune un témoin`, () => {
    const { code, sortie } = lancer(script, '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`Les ${familles} familles rougissent`);
  });
});

describe('la preuve n’est pas un décompte', () => {
  it('exige un témoin par famille, pas un total de fautes', () => {
    // Le --prove de gov:publication a compté des fautes jusqu'au 2026-09-03 : deux détections de
    // doctrine sur une même ligne suffisaient, et trois familles sur quatre étaient réputées
    // prouvées sans l'avoir jamais été. La sortie doit énumérer les familles, une par une.
    const { sortie } = lancer('scripts/gates/gov-publication.ts', '--prove');
    const lignes = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(lignes.length).toBe(7);
  });
});

describe('gov:hypotheses — le verrou du premier envoi DocuSeal', () => {
  it('laisse passer les lignes « avenant » en attente, et les NOMME', () => {
    // Huit lignes `avenant` attendent une décision de Will : c'est l'état normal du projet.
    // Les faire rougir à chaque PR rendrait la CI définitivement rouge, et une CI toujours
    // rouge ne garde plus rien. Elles doivent donc passer — mais être dites.
    const { code, sortie } = lancer('scripts/gates/gov-hypotheses.ts');
    expect(code).toBe(0);
    expect(sortie).toContain('PREMIER ENVOI DOCUSEAL');
  });

  it('ROUGIT sous --avant-docuseal tant qu’une ligne « avenant » n’est pas datée', () => {
    // Le même registre, le même instant : seul le drapeau change. C'est ce contrôle qui
    // s'arme au jalon du premier contrat envoyé, quand chaque changement d'une clause
    // `avenant` impose une campagne de re-signature à tout le réseau.
    const { code, sortie } = lancer('scripts/gates/gov-hypotheses.ts', '--avant-docuseal');
    expect(code).not.toBe(0);
    expect(sortie).toContain('avenant_non_tranchee');
  });
});

describe("gov:identifiants — citer n'est pas se servir", () => {
  it('est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer('scripts/gates/gov-identifiants.ts');
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('sait rougir : 3 témoins et 10 contre-témoins', () => {
    // Les contre-témoins comptent autant que les témoins ici : la garde a d'abord rougi sur
    // CINQ occurrences qui étaient sa propre documentation (« conforme à D3 » cité comme
    // contre-exemple), et sur les quinze codes de poste des agents (A01…A15).
    const { code, sortie } = lancer('scripts/gates/gov-identifiants.ts', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('3 témoins rougissent, 10 contre-témoins restent verts');
  });
});

describe('gates:prouvees — le décompte de ce qui est réellement armé', () => {
  const SCRIPT = 'scripts/gates/gates-prouvees.ts';

  it('sait rougir : ses 10 familles ont chacune un témoin, sur un disque feint', () => {
    // La preuve ne touche pas au dépôt : registre de fixture et disque INJECTÉ. Sans quoi elle
    // verdirait ou rougirait au gré des fichiers présents le jour où elle tourne (RM-11).
    const { code, sortie } = lancer(SCRIPT, '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('Les 10 familles rougissent');
  });

  it('ROUGIT sur le socle : la phase -1 n’est pas sortie, et c’est ce que le test fige', () => {
    // Ce test dit l'inverse des autres : ici le ROUGE est l'état attendu. La plupart des gates
    // de phase -1 n'ont ni script écrit ni preuveRouge ; le jour où ce test devra être réécrit
    // sera le jour où la phase -1 sort, et ce sera une décision, pas un effet de bord.
    const { code, sortie } = lancer(SCRIPT, '--phase', '-1');
    expect(code).not.toBe(0);
    expect(sortie).toContain('script_introuvable');
    expect(sortie).toContain('preuve_rouge_absente');
  });

  it('REFUSE de deviner la phase quand on ne la lui donne pas', () => {
    // Une phase par défaut aurait rendu la garde silencieusement fausse : c'est elle qui décide
    // du périmètre, donc de ce qui doit DÉJÀ être armé. Sans elle, on ne juge rien.
    const { code, sortie } = lancer(SCRIPT);
    expect(code).not.toBe(0);
    expect(sortie).toContain('il manque le niveau de phase');
  });
});
