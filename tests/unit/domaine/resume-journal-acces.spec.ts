// @req REQ-SEC-058
/**
 * SEC-59 — la SÉRIALISATION des lignes du journal des accès avant l'empreinte, fixée par un VECTEUR
 * (A02, rattrapage 104) : un séparateur explicite (tabulation), un saut de ligne après CHAQUE ligne,
 * NULL écrit `\N`, des dates en ISO 8601 UTC à la milliseconde, les lignes triées par
 * (`survenu_at`, `id`). Un jour sans ligne a l'empreinte de la chaîne vide.
 *
 * Les empreintes attendues ont été calculées HORS du code testé, par un script indépendant
 * (`hashlib.sha256` sur le texte ci-dessous) : le test ne se recopie pas lui-même.
 */
import { describe, it, expect } from 'vitest';
import {
  empreintesDuJour,
  serialiserLesLignes,
  type LigneDuJournalDesAcces,
} from '../../../src/domain/evenement/resume-journal-acces';

const U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const L1: LigneDuJournalDesAcces = {
  id: '00000000-0000-4000-8000-000000000001',
  nature: 'connexion',
  survenuAt: new Date('2027-01-10T08:00:00.000Z'),
  utilisateurConsoleId: U,
  cibleId: null,
  ipHash: 'abcdef0123456789',
};
/** Même instant que L1, id plus grand : l'ordre est (survenu_at, id). Une ligne PURGÉE : tout à NULL. */
const L3: LigneDuJournalDesAcces = {
  id: '00000000-0000-4000-8000-000000000003',
  nature: 'lecture_journal_acces',
  survenuAt: new Date('2027-01-10T08:00:00.000Z'),
  utilisateurConsoleId: null,
  cibleId: null,
  ipHash: null,
};
const L2: LigneDuJournalDesAcces = {
  id: '00000000-0000-4000-8000-000000000002',
  nature: 'lecture_coordonnees_apporteur',
  survenuAt: new Date('2027-01-10T23:59:59.999Z'),
  utilisateurConsoleId: U,
  cibleId: C,
  ipHash: 'fedcba9876543210',
};

const COMPLETE =
  '00000000-0000-4000-8000-000000000001\tconnexion\t2027-01-10T08:00:00.000Z\t' +
  `${U}\t\\N\tabcdef0123456789\n` +
  '00000000-0000-4000-8000-000000000003\tlecture_journal_acces\t2027-01-10T08:00:00.000Z\t\\N\t\\N\t\\N\n' +
  '00000000-0000-4000-8000-000000000002\tlecture_coordonnees_apporteur\t2027-01-10T23:59:59.999Z\t' +
  `${U}\t${C}\tfedcba9876543210\n`;

const SURVIVANTE =
  '00000000-0000-4000-8000-000000000001\tconnexion\t2027-01-10T08:00:00.000Z\n' +
  '00000000-0000-4000-8000-000000000003\tlecture_journal_acces\t2027-01-10T08:00:00.000Z\n' +
  '00000000-0000-4000-8000-000000000002\tlecture_coordonnees_apporteur\t2027-01-10T23:59:59.999Z\n';

describe('REQ-SEC-058 — SEC-59 : la sérialisation fixée, avec son vecteur', () => {
  it('REQ-SEC-058 : TÉMOIN — le texte des lignes complètes : tabulation, \\N pour NULL, ISO UTC à la milliseconde, triées par (survenu_at, id)', () => {
    // Fournies dans le désordre : le tri est celui de la fonction, pas celui de l'appelant.
    expect(serialiserLesLignes([L2, L3, L1], 'complete')).toBe(COMPLETE);
  });

  it('REQ-SEC-058 : TÉMOIN — le texte des seules colonnes qui survivent à la purge : id, nature, survenu_at', () => {
    expect(serialiserLesLignes([L3, L2, L1], 'survivante')).toBe(SURVIVANTE);
  });

  it('REQ-SEC-058 : VECTEUR FIGÉ — les deux empreintes et le nombre, calculés hors du code', () => {
    expect(empreintesDuJour([L2, L1, L3])).toEqual({
      lignesNombre: 3,
      empreinteComplete: '683a3d7584fd442d26cbff6e5f39b278db0f78063761a7fa8dc38f107f906e9d',
      empreinteSurvivante: 'b4a5626d2442a92c2d1c658a4eb8bc3dcee0964c8b4c767449ad8e391baa2772',
    });
  });

  it('REQ-SEC-058 : un jour sans ligne : zéro ligne et l’empreinte de la chaîne vide, deux fois', () => {
    const vide = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(empreintesDuJour([])).toEqual({
      lignesNombre: 0,
      empreinteComplete: vide,
      empreinteSurvivante: vide,
    });
    expect(serialiserLesLignes([], 'complete')).toBe('');
  });

  it('REQ-SEC-058 : la purge ne change PAS l’empreinte survivante, et change la complète', () => {
    const purgee = { ...L1, utilisateurConsoleId: null, ipHash: null };
    expect(empreintesDuJour([purgee, L2, L3]).empreinteSurvivante).toBe(
      empreintesDuJour([L1, L2, L3]).empreinteSurvivante
    );
    expect(empreintesDuJour([purgee, L2, L3]).empreinteComplete).not.toBe(
      empreintesDuJour([L1, L2, L3]).empreinteComplete
    );
  });

  it('REQ-SEC-058 : une modification d’une colonne qui survit à la purge change l’empreinte survivante', () => {
    for (const modifiee of [
      { ...L1, nature: 'lecture_coordonnees_contact' as const },
      { ...L1, survenuAt: new Date('2027-01-10T08:00:00.001Z') },
      { ...L1, id: '00000000-0000-4000-8000-000000000009' },
    ]) {
      expect(empreintesDuJour([modifiee, L2, L3]).empreinteSurvivante).not.toBe(
        empreintesDuJour([L1, L2, L3]).empreinteSurvivante
      );
    }
    // Une ligne retirée, ou ajoutée : le nombre et les deux empreintes bougent.
    expect(empreintesDuJour([L1, L2]).lignesNombre).toBe(2);
    expect(empreintesDuJour([L1, L2]).empreinteSurvivante).not.toBe(
      empreintesDuJour([L1, L2, L3]).empreinteSurvivante
    );
  });

  it('REQ-SEC-058 : la fonction ne modifie pas le tableau reçu', () => {
    const lignes = [L2, L1, L3];
    serialiserLesLignes(lignes, 'complete');
    expect(lignes).toEqual([L2, L1, L3]);
  });
});
