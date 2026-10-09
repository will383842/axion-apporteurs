// @req REQ-JUR-039
// @req REQ-JUR-037
// @req REQ-JUR-012
// @req REQ-UX-003
// @req REQ-JUR-060
// @req REQ-UX-060
// @req REQ-UX-061
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
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  CARENCE_DU_REDEPOT,
} from '../../../src/content/micro-copy/espace/confirmation-du-depot';
import {
  ETATS_DE_LA_PAGE,
  PAGE_DE_CONFIRMATION,
} from '../../../src/content/micro-copy/public/confirmation-contact';
import * as COURRIEL from '../../../src/content/micro-copy/courriels/confirmation-contact';
import * as INFORMATION from '../../../src/content/micro-copy/courriels/information-article-14';
/**
 * LE RENDU EST IMPORTÉ À NEUF À CHAQUE TEST : la borne du contexte, l'expression des liens et la
 * liste des valeurs de l'entité sont évaluées au chargement du module. Importées une fois en tête de
 * fichier, elles resteraient en cache, et un mutant de ces lignes ne serait jamais évalué (même cause
 * que `seuils-ssot-en-processus.spec.ts`).
 */
type Rendu = typeof import('../../../src/domain/confirmation/rendu-du-courriel');
type Seuils = typeof import('../../../src/domain/seuils/ssot');
let contexteRendu: Rendu['contexteRendu'];
let fauteDuContexte: Rendu['fauteDuContexte'];
let LiensNonConformes: Rendu['LiensNonConformes'];
let exigerTroisLiens: Rendu['exigerTroisLiens'];
let liensDuTexte: Rendu['liensDuTexte'];
let rendreLeCourriel: Rendu['rendreLeCourriel'];
let CONTEXTE_DEPOT_CARACTERES_MAX: Seuils['CONTEXTE_DEPOT_CARACTERES_MAX'];
beforeEach(async () => {
  vi.resetModules();
  const rendu = await import('../../../src/domain/confirmation/rendu-du-courriel');
  ({
    contexteRendu,
    fauteDuContexte,
    LiensNonConformes,
    exigerTroisLiens,
    liensDuTexte,
    rendreLeCourriel,
  } = rendu);
  ({ CONTEXTE_DEPOT_CARACTERES_MAX } = await import('../../../src/domain/seuils/ssot'));
});

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
  it('REQ-UX-060 REQ-JUR-037 : seul le contexte porte « (facultatif) », et aucun libellé ne dit « obligatoire »', () => {
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
  dureeProspection: 'trois ans',
  dureeDementi: 'cinq ans',
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

describe('REQ-JUR-060 — toute valeur est désamorcée, et l’e-mail refuse de partir avec un quatrième lien', () => {
  it('REQ-JUR-060 : TÉMOIN — un nom d’entreprise comme « boutique-exemple.fr » est rendu désamorcé, avec trois liens', () => {
    const { objet, texte, html } = rendreLeCourriel({
      ...VALEURS,
      entreprise: 'boutique-exemple.fr',
    });
    expect(texte).toContain('boutique-exemple[.]fr');
    expect(objet).toContain('boutique-exemple[.]fr');
    expect(liensDuTexte(objet)).toEqual([]);
    expect(liensDuTexte(texte).sort()).toEqual(Object.values(LIENS).sort());
    expect(html.match(/<a /g)).toHaveLength(3);
  });

  it('REQ-JUR-060 : TÉMOIN — une valeur non désamorcée (une adresse électronique de l’entité) fait lever l’échec fermé, nommé', () => {
    expect(() => rendreLeCourriel({ ...VALEURS, adresseDroits: 'droits@exemple.invalid' })).toThrow(
      LiensNonConformes
    );
    expect(() => rendreLeCourriel({ ...VALEURS, siege: 'voir www.piege.example' })).toThrow(
      /liens_non_conformes/
    );
  });
});

describe('REQ-UX-003 — la fin d’une réservation se dit selon sa cause (A07)', () => {
  it('REQ-UX-003 : TÉMOIN ANTI-RETOUR — la demande vérifiée libérée ne porte plus « de nouveau disponible », mais sa date de redépôt', () => {
    expect(BADGES_DU_DEPOT.reservationTermineeVerifiee).toBe(
      'Réservation terminée · nouveau dépôt possible à partir du {dateRedepot}'
    );
    expect(BADGES_DU_DEPOT.reservationTermineeVerifiee).not.toContain('de nouveau disponible');
    expect(BADGES_DU_DEPOT.reservationTerminee).toBe(
      "Réservation terminée · l'entreprise est de nouveau disponible"
    );
    expect(CARENCE_DU_REDEPOT).toContain('{dateRedepot}');
  });

  it('REQ-UX-061 REQ-JUR-060 : l’opposition de la page publique DÉRIVE celle de l’art. 14, sans promettre davantage', () => {
    expect(PAGE_DE_CONFIRMATION.opposition).toBe(INFORMATION.LIEN_OPPOSITION.libelle);
  });
});

describe('REQ-UX-060 REQ-UX-061 — le message du dépôt, et la page de réponse du contact', () => {
  it('REQ-UX-060 : le message avant le bouton dit qui reçoit l’e-mail, dans quel délai et pourquoi ; le bouton nomme le contact', () => {
    const m = FORMULAIRE_DU_CONTACT.messageAvantLeBouton;
    expect(m).toContain('{prenomContact} {nomContact}');
    expect(m).toContain('{delaiAvantEnvoi}');
    expect(m).toContain('pour confirmer votre échange');
    expect(FORMULAIRE_DU_CONTACT.bouton).toBe('Déposer et prévenir {prenomContact} {nomContact}');
    expect(FORMULAIRE_DU_CONTACT.boutonCourt).toBe('Déposer et prévenir');
  });

  it('REQ-UX-061 : deux réponses explicites, un second geste pour « Non », et les cinq états de la page', () => {
    expect([PAGE_DE_CONFIRMATION.oui, PAGE_DE_CONFIRMATION.non]).toEqual([
      'Oui, nous avons échangé',
      'Non',
    ]);
    expect(PAGE_DE_CONFIRMATION.confirmerLeNon).toBe("Je confirme n'avoir eu aucun échange");
    expect(PAGE_DE_CONFIRMATION.question).toBeTruthy();
    expect(Object.keys(ETATS_DE_LA_PAGE)).toEqual([
      'merci',
      'dejaRepondu',
      'lienInvalide',
      'erreur',
      'reessayer',
    ]);
  });
});

describe('REQ-JUR-060 — chaque branche du rendu a son témoin', () => {
  /** Les valeurs du témoin, privées d'une clé. */
  const sans = (cle: string) =>
    Object.fromEntries(Object.entries(VALEURS).filter(([k]) => k !== cle));

  it('REQ-JUR-060 : TÉMOIN — un objet qui porterait un lien est refusé, nommé, même si le texte est conforme', () => {
    const { texte } = rendreLeCourriel(VALEURS);
    expect(() => exigerTroisLiens('Voir www.piege.example', texte, VALEURS)).toThrow(
      /liens_non_conformes : l'objet porte www\.piege\.example/
    );
    expect(() => exigerTroisLiens('Un objet sans lien', texte, VALEURS)).not.toThrow();
  });

  it('REQ-JUR-060 : TÉMOIN — une valeur manquante pour un paramètre des textes est refusée, nommée', () => {
    const sansSiege = sans('siege');
    expect(() => rendreLeCourriel(sansSiege as typeof VALEURS)).toThrow(
      /valeur_manquante : \{siege\}/
    );
  });

  it('REQ-JUR-060 : un contexte absent (et non vide) laisse aussi l’e-mail sans ligne de contexte', () => {
    const sansContexte = sans('contexte');
    const { texte } = rendreLeCourriel(sansContexte as typeof VALEURS);
    expect(texte).not.toContain('Contexte indiqué');
    expect(liensDuTexte(texte).sort()).toEqual(Object.values(LIENS).sort());
  });
});

describe('REQ-JUR-060 — la borne du contexte est celle de la SSOT, entière', () => {
  it('REQ-JUR-060 : la constante porte sa valeur, son unité, sa source et sa date, exactement', () => {
    expect(CONTEXTE_DEPOT_CARACTERES_MAX).toEqual({
      valeur: 140,
      unite: 'caracteres',
      source: 'docs/chantiers/W20-confirmation-par-email.md §2, HYP-W20-CONTEXTE',
      verifieLe: '2026-10-02',
    });
  });

  it('REQ-JUR-060 : TÉMOIN — 140 caractères passent, 141 sont refusés ; le rendu borne à 140', () => {
    expect(fauteDuContexte('a'.repeat(140))).toBeNull();
    expect(fauteDuContexte('a'.repeat(141))).toBe('trop_long');
    expect([...contexteRendu('b'.repeat(141))]).toHaveLength(140);
  });
});

describe('REQ-JUR-060 — chaque lien reconnu l’est en entier, et chaque refus dit tout', () => {
  const ZWSP = String.fromCharCode(0x200b);
  const message = (geste: () => void): string => {
    try {
      geste();
    } catch (e) {
      return `${(e as Error).name} | ${(e as Error).message}`;
    }
    return 'aucun refus';
  };

  it('REQ-JUR-060 : TÉMOINS — adresse de courriel, « www. », protocole, domaine avec chemin : reconnus en entier', () => {
    expect(liensDuTexte('écrire à jean.dupont@mail.piege.example')).toEqual([
      'jean.dupont@mail.piege.example',
    ]);
    expect(liensDuTexte('voir www.piège maintenant')).toEqual(['www.piège']);
    expect(liensDuTexte('voir https://piège maintenant')).toEqual(['https://piège']);
    expect(liensDuTexte('boutique-exemple.fr/promo?x=1 ici')).toEqual([
      'boutique-exemple.fr/promo?x=1',
    ]);
    expect(liensDuTexte('site.fr et a.b')).toEqual(['site.fr']);
  });

  it('REQ-JUR-060 : TÉMOINS — le désamorçage est exact, et la borne se prend après les blancs retirés', () => {
    expect(contexteRendu('jean.dupont@piege.example https://piege.example')).toBe(
      'jean[.]dupont[@]piege[.]example https[://]piege[.]example'
    );
    expect(contexteRendu(` ${'a'.repeat(140)}`)).toBe('a'.repeat(140));
    expect(contexteRendu(`${'a'.repeat(139)} b`)).toBe('a'.repeat(139));
    expect(contexteRendu(`a ${ZWSP} b`)).toBe('a b');
  });

  it('REQ-JUR-060 : TÉMOIN — une valeur rendue perd ses caractères de direction, sans rien d’autre', () => {
    const { objet } = rendreLeCourriel({ ...VALEURS, entreprise: `Entreprise${RLO} témoin` });
    expect(objet).toBe('Camille Témoin nous a parlé de Entreprise témoin');
  });

  it('REQ-JUR-060 : TÉMOINS — les refus sont nommés et listent chaque lien vu', () => {
    const { texte } = rendreLeCourriel(VALEURS);
    expect(message(() => exigerTroisLiens('www.a.example et www.b.example', texte, VALEURS))).toBe(
      "LiensNonConformes | liens_non_conformes : l'objet porte www.a.example, www.b.example"
    );
    expect(
      message(() =>
        exigerTroisLiens('Objet', 'voir https://y.example et https://x.example', VALEURS)
      )
    ).toBe(
      'LiensNonConformes | liens_non_conformes : le texte porte 2 lien(s) : https://x.example, https://y.example'
    );
  });

  it('REQ-JUR-060 : TÉMOIN — la version HTML échappe esperluette et guillemets, un paragraphe par ligne', () => {
    const { html } = rendreLeCourriel({ ...VALEURS, contexte: `Tom & "Jerry's"` });
    expect(html).toContain('Tom &amp; &quot;Jerry&#39;s&quot;');
    expect(html).toContain('</p>\n<p>');
  });
});
