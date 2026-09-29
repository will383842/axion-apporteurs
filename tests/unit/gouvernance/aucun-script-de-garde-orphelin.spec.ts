// @req REQ-GOV-021
// @req REQ-GOV-003
/**
 * AUCUN SCRIPT DE GARDE SANS PORTEUR (GOV-084).
 *
 * Un script suivi sous `scripts/gates/` que nulle tâche ne déclare est une garde que personne ne
 * porte : elle survit tant qu'elle passe, et le jour où elle casse, rien ne dit qui la répare. La
 * liste se DÉRIVE des fichiers suivis (`chargerSources`), jamais d'une liste tapée ; la famille
 * `script_de_garde_sans_porteur` a son témoin et son contre-témoin dans la garde (`prouver()`, que
 * `attributions-resolvent.spec.ts` rejoue). Ici, les deux faces sur le dépôt RÉEL.
 */
import { describe, it, expect } from 'vitest';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import {
  analyser,
  chargerSources,
  rendre,
  DOSSIER_DES_GARDES,
} from '../../../scripts/gates/gov-attributions';

describe('REQ-GOV-021 / REQ-GOV-003 — tout script de garde suivi a une tâche porteuse (GOV-084)', () => {
  it('REQ-GOV-021 — TÉMOIN : un script de garde neuf, suivi et revendiqué par aucune tâche, fait sortir la garde en non nul et le NOMME', () => {
    const s = chargerSources(fichiersSuivis());
    const neuf = `${DOSSIER_DES_GARDES}garde-neuve-sans-porteur.ts`;
    const verdict = analyser({ ...s, scriptsDeGarde: [...(s.scriptsDeGarde ?? []), neuf] });
    const rendu = rendre(verdict);
    expect(rendu.code).toBe(1);
    const siennes = verdict.fautes.filter((f) => f.famille === 'script_de_garde_sans_porteur');
    expect(siennes).toHaveLength(1);
    expect(siennes[0]?.message).toContain(neuf);
    expect(rendu.lignes.join('\n')).toContain('[script_de_garde_sans_porteur]');
  });

  it('REQ-GOV-021 — TÉMOIN (GOV-118) : une liste de scripts LUE et VIDE fait sortir la garde en non nul — zéro confronté n’est pas un vert', () => {
    const s = chargerSources(fichiersSuivis());
    const verdict = analyser({ ...s, scriptsDeGarde: [] });
    expect(rendre(verdict).code).toBe(1);
    expect(
      verdict.fautes.some(
        (f) => f.famille === 'script_de_garde_sans_porteur' && f.message.includes('aucun script')
      )
    ).toBe(true);
  });

  it('REQ-GOV-003 — le dépôt réel : chaque script suivi sous scripts/gates/ est confronté, tous ont un porteur, la garde sort en zéro et imprime le compte', () => {
    const suivis = fichiersSuivis();
    const s = chargerSources(suivis);
    const attendus = suivis.filter((f) => f.startsWith(DOSSIER_DES_GARDES));
    expect(attendus.length).toBeGreaterThan(0);
    expect(s.scriptsDeGarde).toEqual(attendus);
    const rendu = rendre(analyser(s));
    expect(rendu.code).toBe(0);
    expect(rendu.lignes.join('\n')).toContain(
      `${attendus.length} script(s) de garde suivi(s) sous ${DOSSIER_DES_GARDES} confronté(s)`
    );
  });
});
