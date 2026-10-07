// @req REQ-JUR-039
// @req REQ-JUR-040
// @req REQ-JUR-041
/**
 * JUR-T30 — les gardes de l'art. 2.7 du contrat : l'apporteur organise librement son activité, et le
 * produit ne reconstitue ni ne restitue son rythme. Ce fichier juge les gardes en processus, sur des
 * fichiers INJECTÉS (RM-11) ; leur preuve binaire est `pnpm <garde>:prove`.
 *
 * (a) `jur:aucune-instruction` — une donnée d'activité (dernière vue, dernier usage) ne se lit que dans
 * deux listes fermées (l'usage de SES sessions rendu à l'apporteur seul, l'authentification, la purge ;
 * les salariés de la console à part), et la SSOT du lexique garde `injonction` et `compte_rendu`.
 *
 * (b) `jur:date-contact-inerte` — `dateContact` est la seule donnée du contrat d'où un rythme
 * d'activité peut être reconstitué : elle ne se lit que dans une liste FERMÉE de lieux, sans aucun
 * découpage temporel.
 *
 * (c) `jur:supports-de-presentation` — aucun support de présentation (logo, charte, signature, visuel,
 * carte) n'est servi à l'apporteur, les documents servis sont des PDF, et l'expression bannie par
 * l'art. 1.2 n'est écrite que là où l'interdiction est citée.
 */
import { describe, it, expect } from 'vitest';
import {
  FAMILLES,
  LIEUX_PERMIS,
  estJuge,
  jugerLesLectures,
} from '../../../scripts/gates/jur-date-contact-inerte';
import {
  FAMILLES_EXIGEES,
  LIEUX_APPORTEUR,
  LIEUX_CONSOLE,
  jugerLeLexique,
  jugerLesDonnees,
} from '../../../scripts/gates/jur-aucune-instruction';
import { LEXIQUE_INTERDIT } from '../../../src/domain/lexique/lexique-interdit';
import {
  EXEMPTIONS_KIT_DE_VENTE,
  estServi,
  jugerLesSupports,
} from '../../../scripts/gates/jur-supports-de-presentation';

const fichier = (chemin: string, source: string) => ({ chemin, source });
const familles = (chemin: string, source: string) =>
  jugerLesLectures([fichier(chemin, source)]).fautes.map((f) => f.famille);

describe('REQ-JUR-040 — jur:date-contact-inerte : la date du contact ne se lit que dans ses lieux permis', () => {
  it('REQ-JUR-040 : la liste fermée des lieux permis est EXACTEMENT celle-ci, chacun avec sa raison', () => {
    expect(Object.keys(LIEUX_PERMIS).sort()).toEqual([
      'src/server/acces/for-apporteur.ts',
      'src/server/anomalie/sincerite.ts',
      'src/server/depot/deposer.ts',
    ]);
    for (const raison of Object.values(LIEUX_PERMIS)) expect(raison.length).toBeGreaterThan(20);
  });

  it('REQ-JUR-040 : TÉMOIN — un groupBy par tranche sur dateContact, hors de la liste, rougit', () => {
    expect(
      familles(
        'src/server/console/statistiques.ts',
        "export const r = (p: P) => p.attribution.groupBy({ by: ['dateContact'], _count: true });"
      )
    ).toContain('lecture_hors_liste');
  });

  it('REQ-JUR-040 : TÉMOIN — la colonne date_contact nommée dans du SQL, hors de la liste, rougit', () => {
    expect(
      familles(
        'src/server/taches/rythme.ts',
        'export const q = `SELECT date_contact FROM attributions`;'
      )
    ).toContain('lecture_hors_liste');
  });

  it('REQ-JUR-040 : TÉMOIN — même dans un lieu permis, une heure extraite ou une troncature SQL rougit', () => {
    const permis = 'src/server/anomalie/sincerite.ts';
    expect(familles(permis, 'export const h = (a: A) => a.dateContact.getHours();')).toEqual([
      'agregation_temporelle',
    ]);
    expect(
      familles(permis, "export const q = `SELECT date_trunc('hour', date_contact) FROM x`;")
    ).toEqual(['agregation_temporelle']);
  });

  it('REQ-JUR-040 : contre-témoins — la donnée lue telle quelle dans un lieu permis, une autre date groupée ailleurs : vert', () => {
    expect(familles('src/server/depot/deposer.ts', "const champs = ['dateContact'];")).toEqual([]);
    expect(
      familles(
        'src/server/console/x.ts',
        "export const r = (p: P) => p.x.groupBy({ by: ['creeAt'] });"
      )
    ).toEqual([]);
  });

  it('REQ-JUR-040 : un test n’est pas jugé ; un fichier illisible est nommé ; les familles sont fermées', () => {
    expect(estJuge('src/server/depot/deposer.spec.ts')).toBe(false);
    expect(estJuge('src/server/depot/deposer.ts')).toBe(true);
    expect(familles('src/server/x.ts', 'export const a = {')).toEqual(['source_illisible']);
    expect([...FAMILLES]).toEqual([
      'lecture_hors_liste',
      'agregation_temporelle',
      'source_illisible',
    ]);
  });
});

const supports = (chemin: string, texte: string | null = null) =>
  jugerLesSupports([{ chemin, texte }]).fautes.map((f) => f.famille);

describe('REQ-JUR-041 — jur:supports-de-presentation : aucun support de présentation, aucun document modifiable, aucun kit de vente', () => {
  it('REQ-JUR-041 : TÉMOIN — l’expression bannie, hors des exemptions nommées, rougit ; dans une exemption, non', () => {
    expect(
      supports('src/content/micro-copy/espace/ressources.ts', "const t = 'Le kit de vente.';")
    ).toEqual(['kit_de_vente']);
    expect(supports('src/server/x.ts', 'export const kitDeVente = 1;')).toEqual(['kit_de_vente']);
    expect(supports('docs/requirements.json', '{"t": "kit de vente"}')).toEqual([]);
    expect(Object.keys(EXEMPTIONS_KIT_DE_VENTE)).toContain(
      'src/domain/lexique/lexique-interdit.ts'
    );
  });

  it('REQ-JUR-041 : TÉMOIN — un logo, un gabarit de signature ou une image servis à l’apporteur rougissent', () => {
    expect(supports('public/logo-axion.png')).toEqual(['support_de_presentation']);
    expect(supports('src/content/ressources/signature-email.html', '<p></p>')).toEqual([
      'support_de_presentation',
    ]);
    expect(supports('src/app/(espace)/accueil/visuel.svg')).toEqual(['support_de_presentation']);
  });

  it('REQ-JUR-041 : TÉMOIN — un document modifiable servi rougit ; un PDF, non', () => {
    expect(supports('ressources/offre.pptx')).toEqual(['document_modifiable']);
    expect(supports('ressources/offre.docx')).toEqual(['document_modifiable']);
    expect(supports('ressources/documents-de-presentation.pdf')).toEqual([]);
  });

  it('REQ-JUR-041 : contre-témoins — la page de signature du contrat (du code), un logo de la console : vert', () => {
    expect(
      supports('src/app/(espace)/mon-contrat/signature/page.tsx', 'export default 1;')
    ).toEqual([]);
    expect(estServi('src/app/(console)/console/logo.svg')).toBe(false);
    expect(supports('src/app/(console)/console/logo.svg')).toEqual([]);
  });
});

const donnees = (chemin: string, source: string) =>
  jugerLesDonnees([{ chemin, source }]).fautes.map((f) => f.famille);

describe('REQ-JUR-039 — jur:aucune-instruction : aucune consigne, aucune activité mesurée', () => {
  it('REQ-JUR-039 : TÉMOIN — une relance née de la dernière vue, un score sur le dernier usage, une colonne lue par la console : rouges', () => {
    expect(
      donnees('src/server/taches/relancer.ts', 'export const r = (s: S) => s.derniereVueAt;')
    ).toEqual(['activite_hors_liste']);
    expect(
      donnees('src/domain/score/assiduite.ts', 'export const s = (j: J) => j.dernierUsageAt;')
    ).toEqual(['activite_hors_liste']);
    expect(
      donnees(
        'src/server/console/apporteurs.ts',
        'export const q = `SELECT derniere_vue_at FROM s`;'
      )
    ).toEqual(['activite_hors_liste']);
  });

  it('REQ-JUR-039 : les listes fermées sont celles de la juriste (#840, 6044978580), la console À PART', () => {
    expect(Object.keys(LIEUX_APPORTEUR).sort()).toEqual([
      'src/domain/apporteur/identifiants.ts',
      'src/server/acces/for-apporteur.ts',
      'src/server/auth/appareil.ts',
      'src/server/auth/lien-magique.ts',
      'src/server/auth/session.ts',
      'src/server/taches/purger-appareils.ts',
    ]);
    expect(Object.keys(LIEUX_CONSOLE).sort()).toEqual([
      'src/app/(console)/console/utilisateurs/page.tsx',
      'src/content/micro-copy/console/utilisateurs.ts',
      'src/server/roles/require-role.ts',
    ]);
    expect(donnees('src/server/acces/for-apporteur.ts', "const c = ['derniereVueAt'];")).toEqual(
      []
    );
  });

  it('REQ-JUR-039 : TÉMOIN — la SSOT du lexique garde « injonction » et « compte_rendu » en portée apporteur', () => {
    expect([...FAMILLES_EXIGEES]).toEqual(['injonction', 'compte_rendu']);
    expect(jugerLeLexique(LEXIQUE_INTERDIT)).toEqual([]);
    expect(
      jugerLeLexique([{ nom: 'injonction', portee: 'apporteur' }]).map((f) => f.famille)
    ).toEqual(['famille_lexicale_absente']);
  });
});
