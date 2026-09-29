// @req REQ-GOV-010
/**
 * LE LOT DÉDIÉ DU GARDIEN-SPEC — GOV-116 (REQ-GOV-010, `partners/ADR-0028`).
 *
 * Ce qui se juge sans lancer de session : le contenu des réglages et les règles qui en résultent.
 * (b) PREUVE POSITIVE : le lot ouvre `docs/DECISIONS.md`, `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`,
 * et eux seuls ; tout autre fichier réservé reste en `deny`, et les hooks du projet sont conservés.
 * (c) PREUVE NÉGATIVE : une session ordinaire, lancée sans la procédure, porte les six règles
 * d'écriture de ces trois fichiers en `deny`. Le reste (l'exécution réelle) est une trace datée de
 * Williams, jointe à la PR.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CHEMIN_REGLAGES_DU_LOT,
  CHEMIN_REGLAGES_DU_PROJET,
  COMMANDE_DU_LOT,
  FICHIERS_DU_LOT,
  REGLES_DU_LOT,
  reglagesDuLot,
  reglesNonInterditesAuProjet,
  rendre,
  verifier,
  type Reglages,
} from '../../../scripts/lot/lot-dedie-gardien-spec';

const PROJET = JSON.parse(readFileSync(CHEMIN_REGLAGES_DU_PROJET, 'utf8')) as Reglages;
const LOT = reglagesDuLot(PROJET);
const RESERVES_HORS_LOT = ['docs/tasks.json', 'docs/gates.json', '.claude/settings.json'];

describe('REQ-GOV-010 — le lot dédié du gardien-spec ouvre trois fichiers et eux seuls (GOV-116)', () => {
  it('REQ-GOV-010 — (b) le lot autorise l’écriture des trois fichiers, et ne les interdit plus', () => {
    for (const r of REGLES_DU_LOT) {
      expect(LOT.permissions?.allow, r).toContain(r);
      expect(LOT.permissions?.deny, r).not.toContain(r);
    }
    expect([...FICHIERS_DU_LOT]).toEqual([
      'docs/DECISIONS.md',
      'docs/GLOSSAIRE.md',
      'docs/PRESEANCE.md',
    ]);
  });

  it('REQ-GOV-010 — (b) tout autre fichier réservé reste interdit dans le lot', () => {
    for (const f of RESERVES_HORS_LOT) {
      expect(LOT.permissions?.deny, f).toContain(`Write(${f})`);
      expect(LOT.permissions?.deny, f).toContain(`Edit(${f})`);
    }
    // Le lot n'interdit rien de moins que le projet, sauf les six règles du lot.
    const attendu = (PROJET.permissions?.deny ?? []).filter((r) => !REGLES_DU_LOT.includes(r));
    expect(LOT.permissions?.deny).toEqual(attendu);
  });

  it('REQ-GOV-010 — (b) les hooks et l’environnement du projet sont conservés dans le lot', () => {
    expect(LOT.hooks).toEqual(PROJET.hooks);
    expect(LOT.env).toEqual(PROJET.env);
  });

  it('REQ-GOV-010 — le fichier du lot sur disque est EXACTEMENT le rendu des réglages du projet', () => {
    expect(readFileSync(CHEMIN_REGLAGES_DU_LOT, 'utf8')).toBe(rendre(PROJET));
  });

  it('REQ-GOV-010 — la procédure écarte les réglages du projet et charge ceux du lot', () => {
    expect(COMMANDE_DU_LOT).toBe(
      'claude --setting-sources user --settings config/lot-dedie-gardien-spec.settings.json'
    );
  });

  it('REQ-GOV-010 — TÉMOIN (c) : des réglages de projet qui oublient une règle laissent une session ordinaire écrire, et c’est nommé', () => {
    const troue: Reglages = {
      permissions: {
        deny: (PROJET.permissions?.deny ?? []).filter((r) => r !== 'Write(docs/DECISIONS.md)'),
      },
    };
    expect(reglesNonInterditesAuProjet(troue)).toContain('Write(docs/DECISIONS.md)');
  });

  it('REQ-GOV-010 — (c) PREUVE NÉGATIVE : une session ordinaire porte les six règles du lot en deny', () => {
    expect(reglesNonInterditesAuProjet(PROJET)).toEqual([]);
    expect(verifier()).toEqual([]);
  });
});
