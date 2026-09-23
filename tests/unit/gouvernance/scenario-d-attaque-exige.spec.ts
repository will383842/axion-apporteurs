/**
 * scenario-d-attaque-exige.spec.ts — GOV-078.
 *
 * @req REQ-GOV-011
 * @req REQ-GOV-021
 *
 * MESURE QUI OUVRE LA TÂCHE, le 2026-09-16 SUR LA PR 46. La section « Attaque » n'était exigée que
 * par deux déclencheurs, et les DEUX manquaient le cas le plus courant de la phase 0.
 *
 * (1) LE DÉCLENCHEUR PAR ZONE ÉTAIT MORT. Il comparait le DÉBUT du chemin d'un fichier à quatre
 * préfixes de répertoire — `commissions/`, `attributions/`, `auth/`, `espace/` — qui ne
 * correspondent à AUCUN chemin du dépôt : zéro fichier suivi commence par l'un d'eux, et zéro
 * fichier suivi les contient même au milieu de son chemin. Il n'avait donc jamais rien déclenché,
 * et il n'aurait rien déclenché quand les répertoires réels seraient apparus, parce que ceux-ci
 * vivront sous `src/`.
 *
 * (2) LE DÉCLENCHEUR PAR TÂCHE résout les tâches d'une PR par le numéro qu'elles PORTENT ou par
 * l'identifiant du titre. Une PR qui RÉÉCRIT LA PROSE d'une tâche sensible — son texte
 * d'acceptation, son titre, ses champs dans le registre — ne « porte » donc pas cette tâche : la
 * tâche pointe une autre PR, et le titre nomme autre chose. Le scénario d'attaque n'était exigé par
 * PERSONNE. C'est exactement ce qui s'est passé sur la PR 46 avec une tâche marquée argent : le
 * contenu était propre, aucune garde ne l'exigeait — un vert qui ne mesurait rien.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  controler,
  zonesSensiblesTouchees,
  tachesReecritesEtSensibles,
  empreinteDeLEntree,
  type Depot,
  type Pr,
  type Tache,
} from '../../../scripts/gates/gov-pr';

const CHEMIN_TACHES = 'docs/tasks.json';

/** Une tâche projetée, telle que `gov:pr` la lit. */
function tache(sur: Partial<Tache> = {}): Tache {
  const base: Tache = {
    id: 'T-ARG-999',
    sensible: ['argent'],
    zone: 'argent',
    schema: false,
    pr: null,
    paths: ['docs/tasks.json'],
    tests: null,
    empreinte: 'aaa',
  };
  return { ...base, ...sur };
}

/** Le dépôt réel : gabarit, CODEOWNERS et charte ne sont pas l'objet de ce fichier. */
function depot(taches: Tache[]): Depot {
  return {
    gabarit: readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8'),
    codeowners: readFileSync('.github/CODEOWNERS', 'utf8'),
    charte: readFileSync('docs/CHARTE-AGENTS.md', 'utf8'),
    architecte: readFileSync('.claude/agents/architecte.md', 'utf8'),
    fiches: [],
    taches,
  };
}

/** Une PR dont SEULE la section « Attaque » est en jeu : tout le reste est hors sujet ici. */
function pr(sur: Partial<Pr>): Pr {
  const base: Pr = {
    numero: 999,
    titre: 'docs(GOV-078): la prose d’une tache',
    corps: '',
    labels: [],
    fichiers: [CHEMIN_TACHES],
    revues: null,
    tachesBase: null,
  };
  return { ...base, ...sur };
}

/** Les messages de la famille `attaque_absente`, l'unité de mesure de ce fichier. */
const attaque = (d: Depot, p: Pr): string[] =>
  controler(d, p)
    .filter((f) => f.famille === 'attaque_absente')
    .map((f) => f.message);

describe('gov:pr — le scénario d’attaque est exigé là où il manquait (GOV-078)', () => {
  it('REQ-GOV-011 — le déclencheur par zone compare des chemins RÉELS, et non des préfixes tapés', () => {
    // Le préfixe tapé ne répondait à rien : aucun fichier du dépôt ne commence par `auth/`.
    expect(zonesSensiblesTouchees(['src/lib/auth/session.ts'])).toEqual([
      { zone: 'auth', sous: 'src/lib/auth' },
    ]);
    expect(zonesSensiblesTouchees(['src/domain/commissions/calcul.ts'])).toEqual([
      { zone: 'commissions', sous: 'src/domain/commissions' },
    ]);
    // Un GROUPE DE ROUTES porte des parenthèses, et elles n'en changent pas le nom.
    expect(zonesSensiblesTouchees(['src/app/(espace)/page.tsx'])).toEqual([
      { zone: 'espace', sous: 'src/app/(espace)' },
    ]);
    // Une zone est un RÉPERTOIRE : un fichier qui porte le mot dans son nom n'en est pas une.
    expect(zonesSensiblesTouchees(['docs/commissions-et-prorata.md'])).toEqual([]);
    expect(zonesSensiblesTouchees(['docs/tasks.json'])).toEqual([]);
  });

  it('REQ-GOV-011 — sur le dépôt RÉEL, aucun fichier suivi ne commence par les préfixes tapés', () => {
    // La mesure du 2026-09-16, rejouée : c'est ELLE qui prouve que l'ancien déclencheur était mort.
    const suivis = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const parPrefixe = suivis.filter((f) =>
      ['commissions/', 'attributions/', 'auth/', 'espace/'].some((z) => f.startsWith(z))
    );
    expect(parPrefixe).toEqual([]);
  });

  it('REQ-GOV-011 — un fichier sous le chemin RÉEL d’une zone sensible déclenche l’exigence', () => {
    const messages = attaque(
      depot([tache({ sensible: [] })]),
      pr({ fichiers: ['src/lib/auth/session.ts'] })
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('src/lib/auth/ (auth)');
  });

  it('REQ-GOV-021 — une PR qui RÉÉCRIT l’entrée d’une tâche sensible exige le scénario', () => {
    const avant = tache({ empreinte: 'avant' });
    const apres = tache({ empreinte: 'apres' });
    const messages = attaque(depot([apres]), pr({ tachesBase: [avant] }));
    expect(messages).toHaveLength(1);
    // LA SORTIE NOMME LA TÂCHE ET LE MOTIF.
    expect(messages[0]).toContain('T-ARG-999');
    expect(messages[0]).toContain('RÉÉCRITE');
    expect(messages[0]).toContain('argent');
  });

  it('REQ-GOV-021 — la même PR avec sa section remplie sort en zéro', () => {
    const avant = tache({ empreinte: 'avant' });
    const apres = tache({ empreinte: 'apres' });
    const corps = [
      '<!-- attaque:debut -->',
      'Scénario joué : un apporteur tente de se réattribuer un filleul. Résultat : refusé. Joué par A09.',
      '<!-- attaque:fin -->',
    ].join('\n');
    expect(attaque(depot([apres]), pr({ tachesBase: [avant], corps }))).toEqual([]);
  });

  it('REQ-GOV-021 — une tâche NON sensible réécrite n’exige rien : la garde reste proportionnée', () => {
    const avant = tache({ sensible: [], empreinte: 'avant' });
    const apres = tache({ sensible: [], empreinte: 'apres' });
    expect(attaque(depot([apres]), pr({ tachesBase: [avant] }))).toEqual([]);
  });

  it('REQ-GOV-021 — une tâche sensible INCHANGÉE n’exige rien non plus', () => {
    const t = tache({ empreinte: 'pareil' });
    expect(attaque(depot([t]), pr({ tachesBase: [{ ...t }] }))).toEqual([]);
  });

  it('REQ-GOV-021 — RETIRER le marquage sensible est une réécriture, et elle est vue', () => {
    // Le sens qu'on oublie : la tâche n'est plus sensible SUR LA TÊTE. Lire la seule tête laisserait
    // une PR se désarmer elle-même.
    const avant = tache({ sensible: ['argent'], empreinte: 'avant' });
    const apres = tache({ sensible: [], empreinte: 'apres' });
    expect(tachesReecritesEtSensibles([apres], [avant]).map((t) => t.id)).toEqual(['T-ARG-999']);
  });

  it('REQ-GOV-021 — une tâche VERSÉE n’est pas une tâche réécrite', () => {
    expect(tachesReecritesEtSensibles([tache()], [])).toEqual([]);
  });

  it('REQ-GOV-021 — une empreinte ABSENTE n’est jamais lue comme « inchangée »', () => {
    const avant = tache({ empreinte: null });
    const apres = tache({ empreinte: null });
    expect(tachesReecritesEtSensibles([apres], [avant]).map((t) => t.id)).toEqual(['T-ARG-999']);
  });

  it('REQ-GOV-021 — le registre dans le diff avec une BASE illisible exige le scénario', () => {
    const messages = attaque(
      depot([tache({ sensible: [] })]),
      pr({ fichiers: [CHEMIN_TACHES], tachesBase: null })
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('illisible');
  });

  it('REQ-GOV-011 — l’empreinte porte la PROSE, que la projection ne portait pas', () => {
    const a = { id: 'X', titre: 'un titre', acceptance: 'une prose' };
    const b = { id: 'X', titre: 'un titre', acceptance: 'une AUTRE prose' };
    expect(empreinteDeLEntree(a)).not.toBe(empreinteDeLEntree(b));
    // L'ordre des clés ne fait PAS une réécriture : sinon la garde accuserait un formatage.
    expect(empreinteDeLEntree({ b: 1, a: 2 })).toBe(empreinteDeLEntree({ a: 2, b: 1 }));
  });
});
