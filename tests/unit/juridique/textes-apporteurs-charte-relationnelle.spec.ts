// @req REQ-JUR-012
// @req REQ-JUR-013
/**
 * JUR-T13 — la charte relationnelle sur les écrans et les courriels (REQ-JUR-012, REQ-JUR-013).
 *
 * L'apporteur n'est ni un salarié ni un vendeur : aucun texte qui lui est destiné ne porte d'objectif
 * chiffré, de classement, de quota, de formation exigée, ni de conséquence à son inactivité, et le
 * webinaire comme toute formation lui sont présentés comme facultatifs. La garde existe
 * (`scripts/gates/lexique-apporteurs.ts`) : JUR-T13 l'ÉTEND (`src/domain/lexique/lexique-interdit.ts`),
 * elle n'en crée pas une autre. Les formes viennent d'A07, propriétaire de la charte.
 *
 * CE QUE CE FICHIER GARDE :
 *   1. chaque mot du motif écrit DANS l'exigence REQ-JUR-012 (lu dans `docs/requirements.json`,
 *      jamais retapé) rougit, glissé dans la micro-copie de l'espace ET dans un courriel ;
 *   2. les CONTRE-TÉMOINS relevés par l'audit du 2026-10-02 restent verts : « organismes de
 *      formation » (une exclusion du contrat, pas une formation exigée) et la suspension des dépôts
 *      après un courrier non distribué (une raison de contact, pas une inactivité).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEXIQUE_INTERDIT } from '../../../src/domain/lexique/lexique-interdit';
import { controler, vueDeFixture, type FichierVu } from '../../../scripts/gates/lexique-apporteurs';

const exigence = (id: string): string => {
  const r = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
    exigences: { id: string; texte: string }[];
  };
  const e = r.exigences.find((x) => x.id === id);
  if (!e) throw new Error(`${id} absente de docs/requirements.json`);
  return e.texte;
};

/** Le motif que REQ-JUR-012 écrit en toutes lettres, découpé en ses alternatives. */
function motsDuMotif(texte: string): string[] {
  const motif = /\(\/([^/]+)\/\)/.exec(texte)?.[1];
  if (!motif) throw new Error('REQ-JUR-012 ne porte plus de motif entre (/ … /)');
  return motif.split('|').map((m) => m.replace('\\d', '10'));
}

const MICRO_ESPACE = (contenu: string): FichierVu => ({
  chemin: 'src/content/micro-copy/espace/issues-depot.ts',
  contenu,
});
const COURRIEL = (contenu: string): FichierVu => ({
  // Le chemin des courriels destinés aux apporteurs, tel que la garde le reconnaît.
  chemin: 'emails/apporteur/message.tsx',
  contenu,
});
const fautes = (f: FichierVu) => controler(vueDeFixture([f])).fautes;

/**
 * Les formes des trois familles ajoutées, écrites ICI en littéral, d'après le texte d'A07 du
 * 2026-10-02 : retirer une forme de la liste de production fait rougir ce fichier, au lieu de passer
 * en silence.
 */
const NOUVELLES: Record<string, { reqs: string[]; formes: string[] }> = {
  challenge: {
    reqs: ['REQ-JUR-012'],
    formes: [
      'challenge',
      'challenges',
      'challenger',
      'compétition',
      'compétitions',
      'défi du mois',
      'défis du mois',
    ],
  },
  formation_exigee: {
    reqs: ['REQ-JUR-012', 'REQ-JUR-013'],
    formes: [
      'formation exigée',
      'formations exigées',
      'formation requise',
      'formations requises',
      'formation préalable',
      'formations préalables',
      'webinaire exigé',
      'webinaires exigés',
      'webinaire requis',
      'webinaires requis',
      'webinaire préalable',
      'webinaires préalables',
      'présence requise',
      'présence exigée',
      'participation requise',
      'participation exigée',
      'module à valider',
      'modules à valider',
      'suivez la formation',
      'suivez le webinaire',
      'assistez au webinaire',
      'participez au webinaire',
      'inscrivez-vous au webinaire',
    ],
  },
  inactivite_sanctionnee: {
    reqs: ['REQ-JUR-012', 'REQ-JUR-039'],
    formes: [
      'inactivité',
      'inactif',
      'inactifs',
      'inactive',
      'inactives',
      'compte désactivé',
      'compte suspendu',
      'dernière connexion',
      'dernières connexions',
    ],
  },
};

describe('REQ-JUR-012 REQ-JUR-013 — les trois familles d’A07 entrent au lexique, et chaque forme rougit', () => {
  it('REQ-JUR-012 REQ-JUR-013 : les familles existent, en portée apporteur, avec leurs exigences et leurs formes exactes', () => {
    for (const [nom, attendu] of Object.entries(NOUVELLES)) {
      const f = LEXIQUE_INTERDIT.find((x) => x.nom === nom);
      expect([nom, f?.portee, f?.reqs, f?.formes]).toEqual([
        nom,
        'apporteur',
        attendu.reqs,
        attendu.formes,
      ]);
    }
  });

  it('REQ-JUR-012 REQ-JUR-013 : chaque forme, dans la micro-copie de l’espace, rougit EN SON NOM de famille', () => {
    for (const [nom, { formes }] of Object.entries(NOUVELLES))
      for (const forme of formes)
        expect([
          forme,
          fautes(MICRO_ESPACE(`  titre: 'Rappel : ${forme} pour ce mois',`)).some(
            (f) => f.famille === nom
          ),
        ]).toEqual([forme, true]);
  });

  it('REQ-JUR-012 REQ-JUR-013 : les dénégations d’A07 restent vertes, sans marqueur ajouté', () => {
    for (const phrase of [
      'sans formation préalable',
      'aucune présence requise',
      'sans challenge ni classement',
      'aucune conséquence de votre inactivité',
      "rien ne change en cas d'inactivité",
      'jamais de compte désactivé',
      "aucune formation n'est exigée",
      'le webinaire est facultatif',
      'vous pouvez vous inscrire au webinaire',
    ])
      expect([phrase, fautes(MICRO_ESPACE(`  texte: '${phrase.replace(/'/g, "\\'")}',`))]).toEqual([
        phrase,
        [],
      ]);
  });

  it('REQ-JUR-012 REQ-JUR-013 : les familles existantes que REQ-JUR-012 nomme la citent, et injonction cite REQ-JUR-013', () => {
    for (const nom of ['objectif', 'quota', 'classement', 'palmares', 'injonction'])
      expect([nom, LEXIQUE_INTERDIT.find((x) => x.nom === nom)?.reqs]).toEqual([
        nom,
        expect.arrayContaining(['REQ-JUR-012']),
      ]);
    expect(LEXIQUE_INTERDIT.find((x) => x.nom === 'injonction')?.reqs).toContain('REQ-JUR-013');
  });
});

describe('REQ-JUR-012 — aucun objectif, classement, quota ni injonction dans les textes des apporteurs', () => {
  const mots = motsDuMotif(exigence('REQ-JUR-012'));

  it('REQ-JUR-012 : le motif est lu dans l’exigence, et il porte ses sept alternatives', () => {
    expect(mots).toEqual([
      'objectif',
      'quota',
      'classement',
      'top 10',
      'challenge',
      'obligatoire',
      'vous devez',
    ]);
  });

  it('REQ-JUR-012 : chaque mot du motif, glissé dans la micro-copie de l’espace, rougit', () => {
    for (const m of mots)
      expect([m, fautes(MICRO_ESPACE(`  titre: 'Votre ${m} de la semaine',`)).length > 0]).toEqual([
        m,
        true,
      ]);
  });

  it('REQ-JUR-012 : chaque mot du motif, glissé dans un courriel, rougit', () => {
    for (const m of mots)
      expect([m, fautes(COURRIEL(`  corps: 'Rappel : ${m} pour ce mois.',`)).length > 0]).toEqual([
        m,
        true,
      ]);
  });

  it('REQ-JUR-012 : CONTRE-TÉMOINS de l’audit — les organismes de formation et la suspension pour courrier non distribué restent verts', () => {
    expect(
      fautes(
        MICRO_ESPACE(
          "  pourquoi: 'Le contrat met à part les administrations, les organismes qui financent la formation et les organismes de formation qui travaillent avec Axion-IA.',"
        )
      )
    ).toEqual([]);
    expect(
      fautes(
        MICRO_ESPACE(
          '  depotsSuspendus: "vos nouveaux dépôts sont suspendus le temps d\'un échange avec Axion-IA",'
        )
      )
    ).toEqual([]);
  });
});
