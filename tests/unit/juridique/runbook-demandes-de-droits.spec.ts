// @req REQ-JUR-065
/**
 * JUR-T59 — le runbook des demandes de droits (`docs/runbooks/demandes-de-droits.md`), tel que la
 * juriste l'a écrit et que la lentille sécurité l'a complété. Témoin écrit par A05 pour A07, qui n'a
 * pas d'outil d'exécution (charte §6).
 *
 * CE QU'IL PROUVE : le runbook existe ; il cite le délai d'un mois de l'art. 12.3 ; il exige de
 * joindre les anomalies qui visent l'apporteur, avec leurs cinq éléments ; il dit qu'il cesse de
 * servir pour l'accès à la livraison de l'export de l'art. 15 ; il NOMME les durées de la SSOT sans les
 * recopier ; il exige une procédure dédiée en lecture seule, un chiffrement nommé et une phrase de
 * passe longue, jamais envoyée avec le fichier ; il porte l'étape de caviardage des tiers. Et il ne
 * contient ni adresse électronique, ni numéro de téléphone, ni nom de personne.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PERSONNES_DU_REGISTRE } from '../../../src/domain/rgpd/politique';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const CHEMIN = 'docs/runbooks/demandes-de-droits.md';
const lire = () => readFileSync(CHEMIN, 'utf8');
/**
 * Le texte lu comme une phrase : sur une seule ligne, sans les marques de citation ni de gras du Markdown, avec une
 * seule forme d'apostrophe. Une phrase coupée par un retour à la ligne ou mise en gras se lit entière.
 */
const aplati = () =>
  lire().replace(/^> ?/gm, '').replace(/\*\*/g, '').replace(/’/g, "'").replace(/\s+/g, ' ');

describe('REQ-JUR-065 — le runbook des demandes de droits', () => {
  it('REQ-JUR-065 : le runbook existe', () => {
    expect(existsSync(CHEMIN)).toBe(true);
  });

  it('REQ-JUR-065 : il cite le délai de réponse d’un mois de l’art. 12.3', () => {
    expect(aplati()).toMatch(/au plus tard un mois.{0,40}art\. 12\.3/);
  });

  it('REQ-JUR-065 : il exige de joindre les anomalies qui visent l’apporteur, avec leur existence, leur date, leur catégorie, leur statut et la suite donnée', () => {
    const t = aplati();
    const debut = t.indexOf("LES ANOMALIES QUI VISENT L'APPORTEUR — à joindre expressément");
    expect(debut).toBeGreaterThan(-1);
    const section = t.slice(debut, debut + 1500);
    for (const element of ['existence', 'date', 'catégorie', 'statut', 'la suite donnée']) {
      expect(section, element).toContain(element);
    }
  });

  it('REQ-JUR-065 : il dit qu’il cesse de servir pour l’accès à la livraison de l’export de l’art. 15 (DM-20)', () => {
    expect(aplati()).toMatch(/tant que l'export de l'article 15 \(DM-20\) n'est pas livré/);
    expect(aplati()).toMatch(/cesse de servir/);
  });

  it('REQ-JUR-065 : il NOMME les durées de la SSOT, et n’en recopie aucune valeur en chiffres', () => {
    const t = lire();
    const noms = Object.keys(SEUILS).filter((n) => n.startsWith('DROITS_CONTACT_'));
    const cites = noms.filter((n) => t.includes(n));
    expect(cites).toEqual(
      expect.arrayContaining([
        'DROITS_CONTACT_DELAI_REPONSE_MOIS',
        'DROITS_CONTACT_PROLONGATION_MOIS',
      ])
    );
    expect(t).not.toMatch(/\b\d+\s*(?:mois|jours?|ans?)\b/);
  });

  it('REQ-JUR-065 : le fichier d’accès se construit par une procédure dédiée, en lecture seule, tracée — jamais une requête libre', () => {
    const t = aplati();
    expect(t).toContain('Une procédure dédiée, en lecture seule');
    expect(t).toMatch(/Elle est tracée/);
    expect(t).toContain('Jamais une requête libre dans une console de base de données');
  });

  it('REQ-JUR-065 : le chiffrement est nommé (AES-256, 7z ou age), jamais le ZIP ancien ; la phrase de passe fait au moins 20 caractères et ne part jamais avec le fichier', () => {
    const t = aplati();
    expect(t).toContain('AES-256');
    expect(t).toMatch(/\b7z\b/);
    expect(t).toMatch(/fichier age\b/);
    expect(t).toContain('Jamais le chiffrement ZIP ancien');
    expect(t).toContain('fait au moins 20 caractères');
    expect(t).toContain('Jamais par le même courriel que le fichier');
  });

  it('REQ-JUR-065 : l’étape « Relire et caviarder les tiers » porte les justifications d’anomalie, les contestations et les traces du journal', () => {
    const t = aplati();
    const debut = t.indexOf('Relire et caviarder les tiers');
    expect(debut).toBeGreaterThan(-1);
    const etape = t.slice(debut, debut + 600);
    for (const texte of [
      "les justifications d'anomalie",
      'les contestations et leurs réponses',
      'les traces du journal',
    ]) {
      expect(etape, texte).toContain(texte);
    }
  });

  it('REQ-JUR-065 : il ne contient ni adresse électronique, ni numéro de téléphone, ni nom de personne', () => {
    const t = lire();
    expect(t).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(t).not.toMatch(/(?:\+33|\b0)[1-9](?:[ .-]?\d{2}){4}\b/);
    for (const nom of PERSONNES_DU_REGISTRE) expect(t).not.toMatch(new RegExp(`\\b${nom}\\b`));
  });
});
