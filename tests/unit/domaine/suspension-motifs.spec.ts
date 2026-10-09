// @req REQ-JUR-031
// @req REQ-JUR-032
// @req REQ-DM-010
/**
 * JUR-T24 — la suspension n'est fondée que sur ses deux motifs, et sur rien d'autre (REQ-JUR-031) :
 * « aucun compteur de volume, de rythme, de délai de réponse ou de méthode ne peut l'atteindre ».
 * Le type de l'entrée est fermé ; ce fichier tient le TEST D'APPEL qui va avec : un motif forcé hors
 * de la liste (un appelant qui contourne le type) est refusé À L'EXÉCUTION, la liste fermée
 * `MOTIFS_DE_SUSPENSION` faisant foi. Aucun palier ni seuil de dépôts ne fonde une suspension
 * (REQ-JUR-032, REQ-DM-010).
 */
import { describe, it, expect } from 'vitest';
import {
  ErreurDeSuspension,
  type FaitsDeSuspension,
  MOTIFS_DE_SUSPENSION,
  jugerLaPose,
} from '../../../src/domain/apporteur/suspension';

/** 2026-10-07 09:30 à Paris (heure d'été, UTC+2). */
const POSEE = Date.UTC(2026, 9, 7, 7, 30);

const refus = (f: () => void): string => {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurDeSuspension) return e.code;
    throw e;
  }
  return 'aucun refus';
};

/** Un motif forcé : ce qu'un appelant obtiendrait en contournant le type de l'entrée. */
const force = (motif: string): FaitsDeSuspension =>
  ({ motif, indicationRecueAt: POSEE - 3_600_000 }) as unknown as FaitsDeSuspension;

describe('REQ-JUR-031 — la suspension n’accepte que ses deux motifs, à l’exécution comme au type', () => {
  it('REQ-JUR-031 : un motif de volume, de rythme, de délai, de méthode ou de palier, forcé hors du type, est REFUSÉ', () => {
    for (const motif of ['volume', 'rythme', 'delai_de_reponse', 'methode', 'palier', 'seuil']) {
      expect(
        refus(() => jugerLaPose({ statut: 'signe', etatGel: 'libre', faits: force(motif) }, POSEE))
      ).toBe('motif_hors_liste');
    }
  });

  it('REQ-JUR-031 : contre-témoin — chacun des motifs de la liste fermée reste admis', () => {
    expect(() =>
      jugerLaPose(
        { statut: 'signe', etatGel: 'libre', faits: force(MOTIFS_DE_SUSPENSION[0]) },
        POSEE
      )
    ).not.toThrow();
    expect(() =>
      jugerLaPose({
        statut: 'signe',
        etatGel: 'libre',
        faits: {
          motif: MOTIFS_DE_SUSPENSION[1],
          anomalie: { id: 'a', confirmeeParUnHumain: true },
        },
      })
    ).not.toThrow();
  });

  it('REQ-JUR-031 : le type de l’entrée est fermé — un motif de volume ne compile pas', () => {
    const faits: FaitsDeSuspension = {
      // @ts-expect-error — « volume » n'est pas un motif de suspension.
      motif: 'volume',
      indicationRecueAt: POSEE,
    };
    expect(refus(() => jugerLaPose({ statut: 'signe', etatGel: 'libre', faits }, POSEE))).toBe(
      'motif_hors_liste'
    );
  });
});
