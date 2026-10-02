// @req REQ-JUR-039
// @req REQ-JUR-037
// @req REQ-JUR-012
// @req REQ-UX-003
// @req REQ-JUR-060
/**
 * UX-P1-41 — les textes W20 de la confirmation par e-mail, dans la SSOT de micro-copy
 * (`docs/chantiers/W20-confirmation-par-email.md`, texte OPCO d'A07 du 2026-10-02).
 *
 * CE QUE CE FICHIER GARDE :
 *   1. aucun texte vu par l'apporteur ne donne de consigne : la garde lexicale y est verte, et une
 *      consigne posée dans le MÊME fichier la fait rougir (REQ-JUR-039, REQ-JUR-012) ;
 *   2. un champ exigé n'est jamais marqué ; seul le facultatif le dit (REQ-JUR-037) ;
 *   3. l'e-mail au contact suit les règles d'A07 : « récemment », jamais une date ; « apporteur
 *      d'affaires indépendant » ; l'appel PROPOSÉ, jamais annoncé ; le financement « selon votre
 *      éligibilité » ; l'information de l'art. 14 importée de son fichier source, jamais réécrite ;
 *   4. chaque courriel de la liste `COURRIELS_AU_CONTACT` déclare son destinataire, le contact.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COURRIELS_AU_CONTACT,
  controler,
  porteeDuFichier,
  vueDeFixture,
  type FichierVu,
} from '../../../scripts/gates/lexique-apporteurs';
import {
  FORMULAIRE_DU_CONTACT,
  BADGES_DU_DEPOT,
} from '../../../src/content/micro-copy/espace/confirmation-du-depot';
import * as COURRIEL from '../../../src/content/micro-copy/courriels/confirmation-contact';
import * as INFORMATION from '../../../src/content/micro-copy/courriels/information-article-14';
import {
  contexteRendu,
  fauteDuContexte,
  liensDuTexte,
  rendreLeCourriel,
} from '../../../src/domain/confirmation/rendu-du-courriel';
import { CONTEXTE_DEPOT_CARACTERES_MAX } from '../../../src/domain/seuils/ssot';

const FICHIER_DU_DEPOT = 'src/content/micro-copy/espace/confirmation-du-depot.ts';
const fautes = (f: FichierVu) => controler(vueDeFixture([f])).fautes;

describe('REQ-JUR-039 REQ-JUR-012 — les textes de l’apporteur informent, sans consigne', () => {
  const reel = readFileSync(FICHIER_DU_DEPOT, 'utf8');

  it('REQ-JUR-039 : la garde lexicale est verte sur le fichier réel', () => {
    expect(fautes({ chemin: FICHIER_DU_DEPOT, contenu: reel })).toEqual([]);
  });

  it('REQ-JUR-039 REQ-JUR-012 : TÉMOIN — « vous devez confirmer » posé dans le fichier la fait rougir, nommée', () => {
    const casse = reel.replace(
      "titre: 'Qui avez-vous rencontré ?'",
      "titre: 'Vous devez confirmer qui vous avez rencontré'"
    );
    expect(casse).not.toBe(reel);
    const f = fautes({ chemin: FICHIER_DU_DEPOT, contenu: casse });
    expect(f.length).toBeGreaterThan(0);
    expect(JSON.stringify(f)).toContain('devez');
  });
});

describe('REQ-JUR-037 — un champ exigé n’est jamais marqué, seul le facultatif le dit', () => {
  it('REQ-JUR-037 : seul le contexte porte « (facultatif) », et aucun libellé ne dit « obligatoire »', () => {
    const libelles = Object.entries(FORMULAIRE_DU_CONTACT);
    expect(libelles.filter(([, t]) => t.includes('(facultatif)')).map(([k]) => k)).toEqual([
      'contexte',
    ]);
    for (const [, t] of libelles) expect(t.toLowerCase()).not.toContain('obligatoire');
  });

  it('REQ-UX-003 : le badge 🟡 daté porte le libellé choisi par Williams, la date en paramètre', () => {
    expect(BADGES_DU_DEPOT.enAttenteDatee).toBe('En attente · confirmée automatiquement le {date}');
  });
});

describe('REQ-JUR-012 — l’e-mail au contact suit les règles d’A07', () => {
  const textes = Object.values(COURRIEL.COURRIEL_DE_CONFIRMATION).join('\n');

  it('REQ-JUR-012 : « récemment », jamais une date du contact ; « apporteur d’affaires indépendant »', () => {
    expect(COURRIEL.COURRIEL_DE_CONFIRMATION.presentation).toContain('récemment');
    expect(textes).not.toMatch(/\{date|\d{1,2}\/\d{1,2}/);
    expect(textes).toContain("apporteur d'affaires indépendant");
    expect(textes.toLowerCase()).not.toContain('partenaire');
  });

  it('REQ-JUR-012 : l’appel est PROPOSÉ, jamais annoncé ; le financement dépend de l’éligibilité', () => {
    expect(COURRIEL.COURRIEL_DE_CONFIRMATION.appelPropose).toMatch(/^Si vous le souhaitez/);
    expect(textes).not.toMatch(/nous (?:allons|vous) (?:vous )?appeler(?!.*souhaitez)/);
    expect(COURRIEL.COURRIEL_DE_CONFIRMATION.financement).toContain('selon votre éligibilité');
    expect(textes).not.toMatch(/\béligibles?\b|nous nous occupons de tout|Qualiopi/);
  });

  it('REQ-JUR-012 : l’information de l’art. 14 est importée de son fichier source, jamais réécrite', () => {
    expect(COURRIEL.INFORMATION_ARTICLE_14).toBe(INFORMATION.INFORMATION_ARTICLE_14);
    expect(COURRIEL.ORDRE_INFORMATION_ARTICLE_14).toBe(INFORMATION.ORDRE_INFORMATION_ARTICLE_14);
    expect(COURRIEL.LIEN_OPPOSITION).toBe(INFORMATION.LIEN_OPPOSITION);
  });

  it('REQ-JUR-012 : chaque courriel nommé au contact déclare son destinataire, et relève du dépôt', async () => {
    for (const fichier of COURRIELS_AU_CONTACT) {
      const chemin = `src/content/micro-copy/courriels/${fichier}`;
      const module = (await import(`../../../${chemin}`)) as { DESTINATAIRE?: unknown };
      expect([fichier, module.DESTINATAIRE]).toEqual([fichier, 'contact']);
      expect([fichier, porteeDuFichier(chemin)]).toEqual([fichier, 'depot']);
    }
  });
});

// ── le rendu de l'e-mail (`src/domain/confirmation/rendu-du-courriel.ts`) ─────────────────────────

const RLO = String.fromCharCode(0x202e);
const LIENS = {
  lienOui: 'https://partners.exemple.invalid/confirmer/jeton-oui',
  lienNon: 'https://partners.exemple.invalid/confirmer/jeton-non',
  lienOpposition: 'https://partners.exemple.invalid/opposition/jeton',
};
const VALEURS = {
  ...LIENS,
  prenomApporteur: 'Camille',
  nomApporteur: 'Témoin',
  prenomContact: 'Dominique',
  entreprise: 'Entreprise témoin',
  contexte: '',
  responsable: 'Axion-IA',
  siege: '1 rue du Témoin, 75000 Paris',
  baseLegale: "l'intérêt légitime d'Axion-IA",
  prestataireEnvoi: 'un prestataire d’envoi',
  mentionTransfert: '',
  dureeSansSuite: 'trois ans',
  dureeApresDernierContact: 'trois ans',
  adresseDroits: 'Axion-IA, service des données, 1 rue du Témoin, 75000 Paris',
  prenomSignataire: 'Alex',
  nomSignataire: 'Signataire',
};

describe('REQ-JUR-060 — la ligne de contexte : bornée, désamorcée, sans contrôle', () => {
  it('REQ-JUR-060 : TÉMOINS — à la saisie, trop long ou ressemblant à un lien : refusé, nommé', () => {
    expect(fauteDuContexte('')).toBeNull();
    expect(fauteDuContexte('Rencontré au salon des artisans, stand B.')).toBeNull();
    expect(fauteDuContexte('x'.repeat(CONTEXTE_DEPOT_CARACTERES_MAX.valeur + 1))).toBe('trop_long');
    for (const lien of [
      'voir www.piege.example',
      'https://piege.example/x',
      'écrire à nom@piege.example',
      'piege.example',
    ])
      expect([lien, fauteDuContexte(lien)]).toEqual([lien, 'ressemble_a_un_lien']);
  });

  it('REQ-JUR-060 : TÉMOINS — au rendu, contrôle et direction retirés, lignes réduites, liens désamorcés, borne tenue', () => {
    expect(contexteRendu(`Salon${RLO}des artisans`)).toBe('Salondes artisans');
    expect(contexteRendu('Salon\n\n\r\ndes artisans')).toBe('Salon des artisans');
    expect(liensDuTexte(contexteRendu('voir www.piege.example et nom@piege.example'))).toEqual([]);
    expect([...contexteRendu('y'.repeat(500))]).toHaveLength(CONTEXTE_DEPOT_CARACTERES_MAX.valeur);
    expect(contexteRendu('   ')).toBe('');
  });
});

describe('REQ-JUR-060 — l’e-mail rendu : trois liens, et seulement eux', () => {
  it('REQ-JUR-060 : un contexte vide ne laisse ni ligne vide ni libellé seul', () => {
    const { texte } = rendreLeCourriel(VALEURS);
    expect(texte).not.toContain('Contexte indiqué');
    expect(texte).not.toMatch(/\n{3,}/);
  });

  it('REQ-JUR-060 : TÉMOIN — les trois liens sont les SEULS, même avec un contexte qui en imite un', () => {
    const piege = rendreLeCourriel({ ...VALEURS, contexte: 'voir www.piege.example' });
    expect(liensDuTexte(piege.texte).sort()).toEqual(Object.values(LIENS).sort());
    expect(piege.html.match(/<a /g)).toHaveLength(3);
    expect(piege.texte).toContain('Contexte indiqué par Camille : voir www[.]piege[.]example');
  });

  it('REQ-JUR-060 : TÉMOIN — une valeur ne devient jamais une balise dans la version HTML', () => {
    const { html } = rendreLeCourriel({ ...VALEURS, contexte: '<b>gras</b>' });
    expect(html).toContain('&lt;b&gt;gras&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('REQ-JUR-060 : l’objet nomme l’apporteur et l’entreprise, l’information de l’art. 14 est rendue entière', () => {
    const { objet, texte } = rendreLeCourriel(VALEURS);
    expect(objet).toBe('Camille Témoin nous a parlé de Entreprise témoin');
    expect(texte).toContain(INFORMATION.LIEN_OPPOSITION.libelle);
    expect(texte).toContain('Vos données personnelles');
  });
});
