// @req REQ-JUR-065
/**
 * JUR-T59 — le runbook de la résiliation (`docs/runbooks/resiliation.md`), écrit par la juriste à la
 * demande du rattrapage 88. Témoin écrit par A05 pour A07, qui n'a pas d'outil d'exécution
 * (charte §6).
 *
 * CE QU'IL PROUVE : le runbook existe ; il cite les art. 11.1, 11.2 et 12 ; il NOMME le préavis par
 * `PREAVIS_JOURS`, sans nombre de jours en chiffres ; il nomme la tâche du geste de résiliation et la DATE D'EFFET ;
 * et il ne contient ni adresse électronique, ni numéro de téléphone, ni nom de personne.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PERSONNES_DU_REGISTRE } from '../../../src/domain/rgpd/politique';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const CHEMIN = 'docs/runbooks/resiliation.md';
const lire = () => readFileSync(CHEMIN, 'utf8');
/**
 * Le texte lu comme une phrase : sur une seule ligne, sans les marques de citation ni de gras du Markdown, avec une
 * seule forme d'apostrophe. Une phrase coupée par un retour à la ligne ou mise en gras se lit entière.
 */
const aplati = () =>
  lire().replace(/^> ?/gm, '').replace(/\*\*/g, '').replace(/’/g, "'").replace(/\s+/g, ' ');

describe('REQ-JUR-065 — le runbook de la résiliation', () => {
  it('REQ-JUR-065 : le runbook existe', () => {
    expect(existsSync(CHEMIN)).toBe(true);
  });

  it('REQ-JUR-065 : il cite les art. 11.1, 11.2 et 12', () => {
    const t = aplati();
    expect(t).toMatch(/art\. 11\.1/);
    expect(t).toMatch(/art\. 11\.2/);
    expect(t).toMatch(/art\. 12(?:\.\d)?\b/);
  });

  it('REQ-JUR-065 : le préavis se NOMME `PREAVIS_JOURS`, constante de la SSOT, sans nombre de jours en chiffres', () => {
    const t = lire();
    expect(Object.hasOwn(SEUILS, 'PREAVIS_JOURS')).toBe(true);
    expect(t).toContain('`PREAVIS_JOURS`');
    expect(t).not.toMatch(/\b\d+\s*jours?\b/);
    expect(t).not.toContain(`${SEUILS.PREAVIS_JOURS.valeur} jours`);
  });

  it('REQ-JUR-065 : il nomme DM-63, et le geste en console a lieu à la DATE D’EFFET', () => {
    const t = aplati();
    expect(t).toContain('DM-63');
    expect(t).toContain("Le geste en console a lieu à la DATE D'EFFET");
  });

  it('REQ-JUR-065 : il ne contient ni adresse électronique, ni numéro de téléphone, ni nom de personne', () => {
    const t = lire();
    expect(t).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(t).not.toMatch(/(?:\+33|\b0)[1-9](?:[ .-]?\d{2}){4}\b/);
    for (const nom of PERSONNES_DU_REGISTRE) expect(t).not.toMatch(new RegExp(`\\b${nom}\\b`));
  });
});
