// @req REQ-JUR-031
/**
 * `contrat-sobre.spec.ts` — JUR-T27 : le gabarit de contrat est SOBRE.
 *
 * CE QU'IL TIENT (acceptation de JUR-T27, `HYP-D11`, décision du 2026-09-03).
 *   1. Le gabarit remis à l'apporteur ne contient plus « déchéance », « sanction », « faute grave »
 *      ni « contradictoire », sous aucune flexion.
 *   2. Il ne contient AUCUN barème de gradation : ni échelle ordinale de manquements (« premier…,
 *      deuxième…, troisième… »), ni « strike », ni gradation ou mesure graduée. Le contrat énonce
 *      une obligation de sincérité (art. 3.7) et une faculté de résiliation motivée (art. 11.2),
 *      sans échelle (REQ-JUR-031).
 *   3. Il CONSERVE ses clauses de protection : clé SIREN, fenêtre d'attribution bornée, absence
 *      d'exclusivité et de mandat, premier déclarant, parrainage sur ventes, CPF, RGPD,
 *      autofacturation, compétence. Chacune est vérifiée par son identifiant `CL-*` posé ET par un
 *      fragment de son texte : un retrait qui ne laisserait que le titre rougit.
 *
 * LIMITE DÉCLARÉE. C'est un contrôle LEXICAL : une réécriture qui garde les mots et change le sens
 * n'est vue que par la relecture de Will, qui précède toute signature.
 *
 * @no-red-first: le gabarit est déjà sobre depuis sa rédaction (PR #92) ; ce fichier fige
 * l'acceptation de JUR-T27, et son rouge a été constaté sur un témoin — une clause réintroduisant
 * « déchéance », « faute grave » et « contradictoire » dans l'art. 11 — copié dans la PR.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clausesPosees,
  normaliser,
  texteRemis,
  unitesDuGabarit,
} from '../../../src/domain/contrat/gabarit';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const ANNEXE_2 = readFileSync('docs/contrat/ANNEXE-2-MANDAT.md', 'utf8');

/** Les mots que l'acceptation retire, avec leurs flexions. */
const VOCABULAIRE_RETIRE: readonly [string, RegExp][] = [
  ['déchéance', /d[ée]ch[ée]ances?|d[ée]chus?|d[ée]chues?|d[ée]choir/i],
  ['sanction', /sanction(?:s|n[ée]e?s?|ner)?/i],
  ['faute grave', /fautes?\s+graves?/i],
  ['contradictoire', /contradictoires?/i],
];

/** Ce qui fait un barème de gradation : une échelle, jamais un mot isolé. */
const MARQUES_DE_GRADATION: readonly [string, RegExp][] = [
  ['strike', /\bstrikes?\b/i],
  ['gradation', /gradation|gradu[ée]e?s?|graduelle/i],
  [
    'échelle ordinale de manquements',
    /(premier|deuxi[èe]me|second|troisi[èe]me|nouveau)\s+(manquement|avertissement|incident|signalement)/i,
  ],
  [
    'compteur de manquements',
    /(au[- ]del[àa] de|[àa] partir de|apr[èe]s)\s+\S+\s+(manquements|avertissements|mises en demeure|suspensions)/i,
  ],
];

/** Les fautes d'un texte, pour les deux listes : le mot, la ligne. */
function fautesDeSobriete(texte: string): string[] {
  const fautes: string[] = [];
  texte.split(/\r?\n/).forEach((ligne, i) => {
    for (const [nom, motif] of [...VOCABULAIRE_RETIRE, ...MARQUES_DE_GRADATION]) {
      if (motif.test(ligne)) fautes.push(`${nom} (ligne ${i + 1})`);
    }
  });
  return fautes;
}

/** Les clauses de protection : l'identifiant posé, et le fragment qui la porte dans son article. */
const PROTECTIONS: readonly { objet: string; clause: string; unite: string; fragment: RegExp }[] = [
  { objet: 'clé SIREN', clause: 'CL-ATTRIBUTION', unite: '3.6', fragment: /son propre SIREN/ },
  // Contrat v2 d'axion-ia : la fenêtre est bornée à l'art. 3.4, et l'absence de reconduction
  // est l'art. 3.4 bis ; la note de l'art. 3.4 n'est plus dans le v2.
  {
    objet: 'fenêtre bornée',
    clause: 'CL-DUREE',
    unite: '3.4',
    fragment: /\{\{FENETRE_MOIS\}\} mois à compter de sa confirmation/,
  },
  {
    objet: 'sans reconduction',
    clause: 'CL-DUREE',
    unite: '3.4 bis',
    fragment:
      /ne se renouvelle pas et ne fait l'objet d'aucune reconduction, tacite ou automatique/,
  },
  {
    objet: 'absence d’exclusivité',
    clause: 'CL-LIBERTE-EXERCICE',
    unite: '2',
    fragment: /exclusivit/,
  },
  { objet: 'absence de mandat', clause: 'CL-PORTEE', unite: '1', fragment: /mandat/ },
  {
    objet: 'premier déclarant',
    clause: 'CL-ATTRIBUTION',
    unite: '3.5',
    fragment: /l'horodatage serveur le plus ancien/,
  },
  {
    objet: 'parrainage sur ventes',
    clause: 'CL-PARRAINAGE',
    unite: '4.6',
    fragment: /commissions du filleul nées de commandes signées/,
  },
  { objet: 'CPF', clause: 'CL-CPF', unite: '8.1', fragment: /compte personnel de formation/ },
  {
    objet: 'RGPD',
    clause: 'CL-RGPD',
    unite: '7',
    fragment: /responsable de traitement|données personnelles/,
  },
  {
    objet: 'autofacturation',
    clause: 'CL-AUTOFACTURATION',
    unite: '5.2',
    fragment: /Autofacturation/,
  },
  { objet: 'compétence', clause: 'CL-DROIT', unite: '14', fragment: /comp[ée]tence/i },
];

const texteDeLUnite = (texte: string, numero: string): string => {
  const u = unitesDuGabarit(texte).get(numero);
  return u === undefined ? '' : normaliser([...u.alineas, ...u.notes].join(' '));
};

describe('REQ-JUR-031 — le gabarit de contrat est sobre', () => {
  it('REQ-JUR-031 — ni « déchéance », ni « sanction », ni « faute grave », ni « contradictoire »', () => {
    expect(fautesDeSobriete(texteRemis(GABARIT))).toEqual([]);
    expect(fautesDeSobriete(ANNEXE_2)).toEqual([]);
  });

  it('REQ-JUR-031 — TÉMOIN : chaque mot retiré, réintroduit, fait rougir et se nomme', () => {
    for (const [nom, phrase] of [
      ['déchéance', 'la déchéance des commissions'],
      ['déchéance', "l'Apporteur est déchu de ses droits"],
      ['sanction', 'les sanctions applicables'],
      ['faute grave', 'en cas de faute grave'],
      ['contradictoire', 'après une procédure contradictoire'],
    ] as const) {
      expect(fautesDeSobriete(`${texteRemis(GABARIT)}\n${phrase}`), phrase).toEqual([
        `${nom} (ligne ${texteRemis(GABARIT).split(/\r?\n/).length + 1})`,
      ]);
    }
  });

  it('REQ-JUR-031 — aucun barème de gradation, et TÉMOIN : une échelle réintroduite rougit', () => {
    expect(fautesDeSobriete(texteRemis(GABARIT))).toEqual([]);
    for (const phrase of [
      'Au premier manquement, un rappel ; au deuxième, une suspension.',
      'Trois strikes entraînent la résiliation.',
      'Les mesures sont graduées selon la gravité.',
      'Au-delà de deux mises en demeure, le contrat est résilié.',
    ]) {
      expect(fautesDeSobriete(phrase).length, phrase).toBeGreaterThan(0);
    }
  });

  it('REQ-JUR-031 — CONTRE-TÉMOIN : les négations et le barème de prix de l’annexe 1 restent verts', () => {
    // « aucun barème » (art. 3.7) et « sur barème » (grille publiée) ne sont pas une échelle de
    // manquements : la garde ne vise pas le mot, elle vise la gradation.
    expect(texteRemis(GABARIT)).toMatch(/aucun barème/);
    expect(
      fautesDeSobriete('Elle n’obéit à aucun barème, à aucun compteur et à aucun seuil.')
    ).toEqual([]);
  });

  it.each(PROTECTIONS)(
    'REQ-JUR-031 — la clause de protection « $objet » est conservée ($clause, art. $unite)',
    ({ clause, unite, fragment }) => {
      expect(clausesPosees(GABARIT).map((c) => c.id)).toContain(clause);
      expect(texteDeLUnite(GABARIT, unite)).toMatch(fragment);
    }
  );

  it('REQ-JUR-031 — TÉMOIN : une clause de protection retirée rougit', () => {
    const sansCpf = GABARIT.replace(/compte\s+personnel\s+de\s+formation/g, 'dispositif');
    expect(texteDeLUnite(sansCpf, '8.1')).not.toMatch(/compte personnel de formation/);
  });
});
