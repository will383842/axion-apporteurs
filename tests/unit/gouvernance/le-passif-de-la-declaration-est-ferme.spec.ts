// @req REQ-GOV-026
/**
 * LE PASSIF DE LA DÉCLARATION EST FERMÉ — GOV-127 (REQ-GOV-026).
 *
 * Une livraison dont la PR portait, À L'INSTANT DE LA FUSION, un titre qui déclare la tâche, mais dont
 * le squash a pris une autre première ligne, est refusée par la clôture (`tache_etrangere_a_la_pr`,
 * `titre_d_ecrasement_non_conforme`). Une seule livraison de ce genre, antérieure à la convention de
 * déclaration côté axion-ia, est levée sur arbitrage écrit : elle vit dans une liste FERMÉE et datée.
 * Rien d'autre n'est levé.
 *
 * TÉMOIN À PLUSIEURS FACES : l'entrée passe ; la même livraison avec un autre sha, une autre PR ou un
 * titre à la fusion qui ne déclare pas la tâche reste refusée ; une livraison hors liste reste refusée.
 */
import { describe, it, expect } from 'vitest';
import {
  PASSIF_DE_LA_DECLARATION,
  passifDeLaDeclaration,
  type Livraison,
} from '../../../scripts/lot/cloture';

const ENTREE = PASSIF_DE_LA_DECLARATION[0]!;
const TITRE_A_LA_FUSION = `feat(${ENTREE.tache}): file de sortie, écrite dans la transaction (#${ENTREE.pr})`;

function livraison(p: Partial<Livraison> = {}): Livraison {
  return {
    pr: ENTREE.pr,
    sha: ENTREE.sha,
    titre: null,
    titreNonConforme: {
      lu: `feat(partners): file de sortie (${ENTREE.tache}) (#${ENTREE.pr})`,
      attendu: TITRE_A_LA_FUSION,
    },
    ...p,
  };
}

describe('REQ-GOV-026 — le passif de la déclaration est une liste fermée, et rien d’autre ne lève les refus (GOV-127)', () => {
  it('REQ-GOV-026 — la liste est FERMÉE : une seule entrée, datée, avec son arbitrage écrit', () => {
    expect(PASSIF_DE_LA_DECLARATION).toHaveLength(1);
    expect(ENTREE.tache).toBe('INT-T02');
    expect(ENTREE.pr).toBe(1180);
    expect(ENTREE.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(ENTREE.date).toBe('2026-09-29');
    expect(ENTREE.arbitrage).toMatch(/arbitrage -d7 sur délégation de Williams/);
    expect(ENTREE.arbitrage).toMatch(/aucune règle assouplie/);
  });

  it('REQ-GOV-026 — TÉMOIN : la livraison au passif, nommée à la fusion, est levée', () => {
    expect(passifDeLaDeclaration(ENTREE.tache, livraison())).toBe(ENTREE);
  });

  it('REQ-GOV-026 — TÉMOIN : un autre sha, une autre PR ou une autre tâche restent refusés', () => {
    expect(passifDeLaDeclaration(ENTREE.tache, livraison({ sha: '0'.repeat(40) }))).toBeNull();
    expect(
      passifDeLaDeclaration(ENTREE.tache, livraison({ sha: ENTREE.sha.slice(0, 7) }))
    ).toBeNull();
    expect(passifDeLaDeclaration(ENTREE.tache, livraison({ pr: ENTREE.pr + 1 }))).toBeNull();
    expect(passifDeLaDeclaration('INT-T03', livraison())).toBeNull();
  });

  it('REQ-GOV-026 — TÉMOIN : un titre à la fusion qui ne déclare pas la tâche reste refusé', () => {
    const autre = livraison({
      titreNonConforme: {
        lu: `feat(partners): file de sortie (#${ENTREE.pr})`,
        attendu: `feat(partners): file de sortie (#${ENTREE.pr})`,
      },
    });
    expect(passifDeLaDeclaration(ENTREE.tache, autre)).toBeNull();
    expect(
      passifDeLaDeclaration(ENTREE.tache, livraison({ titreNonConforme: null, titre: null }))
    ).toBeNull();
  });

  it('REQ-GOV-026 — TÉMOIN : une livraison hors liste, au squash non conforme, reste refusée', () => {
    const horsListe = { ...ENTREE, tache: 'INT-T03', pr: 1225 };
    expect(
      passifDeLaDeclaration(
        'INT-T03',
        livraison({
          pr: 1225,
          titreNonConforme: {
            lu: 'feat(partners): x (#1225)',
            attendu: 'feat(INT-T03): x (#1225)',
          },
        })
      )
    ).toBeNull();
    // Contre-témoin : la même livraison passerait SI elle était dans la liste — c'est la liste qui décide.
    expect(
      passifDeLaDeclaration(
        'INT-T03',
        livraison({
          pr: 1225,
          titreNonConforme: {
            lu: 'feat(partners): x (#1225)',
            attendu: 'feat(INT-T03): x (#1225)',
          },
        }),
        [horsListe]
      )
    ).toBe(horsListe);
  });
});
