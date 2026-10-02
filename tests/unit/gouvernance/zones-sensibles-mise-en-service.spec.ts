// @req REQ-GOV-011
// @req REQ-GOV-026
/**
 * QA-T60, point (2) — le fichier qui porte `MISE_EN_SERVICE` est SENSIBLE (note de la lentille
 * securite sur la vérification de l’AIPD avant déploiement).
 *
 * `scripts/gates/runbooks-exerces.ts` porte la date de mise en service, qui garde l'exercice des
 * runbooks avant la première donnée réelle. Le déplacer ou la vider est une décision de sécurité. Le
 * fichier entre donc dans `SEGMENTS_DES_ZONES_SENSIBLES` (`scripts/lot/revues.ts`), segment lu fichier
 * COMPRIS, comme `src/lib/env.ts` : toute PR qui le touche est de risque ÉLEVÉ, nommé, et ses deux
 * lentilles comprennent la sécurité. `CODEOWNERS` ne porte aucune lentille : le mécanisme effectif
 * est `revues.ts`.
 */
import { describe, it, expect } from 'vitest';
import * as LECTEUR from '../../../scripts/lot/revues';

const FICHIER = 'scripts/gates/runbooks-exerces.ts';

/** Une PR synthétique d'une tâche de la zone qualité, qui ne touche que `fichiers`. */
function risque(fichiers: string[]) {
  const tache = { id: 'QA-T99', zone: 'qualite', schema: false, sensible: [] };
  return LECTEUR.risqueDeLaPr({
    titre: 'fix(QA-T99): témoin de la mise en service',
    pr: null,
    taches: [tache],
    tachesBase: [tache],
    fichiers,
    labels: [],
    liste: { source: 'complete' },
  });
}

describe('REQ-GOV-011 REQ-GOV-026 — la mise en service est une zone sensible', () => {
  it('REQ-GOV-011 REQ-GOV-026 : le fichier qui porte MISE_EN_SERVICE est lu comme sensible, par son nom', () => {
    expect(LECTEUR.fichierEnZoneSensible(FICHIER)).toBe(true);
    expect(LECTEUR.SEGMENTS_DES_ZONES_SENSIBLES).toContain('runbooks-exerces');
  });

  it('REQ-GOV-011 REQ-GOV-026 : TÉMOIN — une PR qui ne touche que ce fichier est de risque ÉLEVÉ, nommé, et exige la sécurité', () => {
    const r = risque([FICHIER]);
    expect(r.niveau, r.raisons.join(' ; ')).not.toBe('ordinaire');
    expect(r.raisons.join(' ; ')).toContain(FICHIER);
    expect([...LECTEUR.lentillesExigees(r).toutes]).toContain('securite');
  });

  it('REQ-GOV-011 REQ-GOV-026 : CONTRE-TÉMOIN — une garde voisine, sans la date, reste ordinaire', () => {
    expect(LECTEUR.fichierEnZoneSensible('scripts/gates/gov-lecons.ts')).toBe(false);
    expect(risque(['scripts/gates/gov-lecons.ts']).niveau).toBe('ordinaire');
  });
});
