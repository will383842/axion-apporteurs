// @req REQ-JUR-015
// @req REQ-EXT-028
// @req REQ-JUR-029
/**
 * `seuils-ssot.spec.ts` — `ssot:seuils` (JUR-T02).
 *
 * CE QU'IL TIENT.
 *   1. La source unique des seuils et des délais (`src/domain/seuils/ssot.ts`) porte TOUS les délais
 *      du contrat, chacun nommé d'après son article, avec une source et une date de vérification ;
 *      elle ne porte AUCUNE constante de gradation ni de délai de contradictoire (décision du
 *      2026-09-03, `HYP-D11`).
 *   2. Aucun littéral de seuil ou de délai du contrat n'est retapé ailleurs dans `src/` — les
 *      montants 2 400 / 5 000 / 50 € sous toutes leurs formes, et les durées 2, 3, 6, 10, 12, 15,
 *      24, 30, 60 et 90 attachées à une unité de temps.
 *   3. Aucune fonction ne calcule un préavis à partir d'une ancienneté (REQ-JUR-015, M-16).
 *   4. COHÉRENCE GABARIT ↔ SSOT, sur le modèle de REQ-EXT-028 (a) : chaque valeur que le gabarit
 *      écrit dans l'article nommé par la constante est celle de la constante ; une variable
 *      `{{…}}` de genre `seuil` résout vers une constante, sauf celle qu'une question ouverte tient
 *      (aucune depuis le 2026-09-30 : `FENETRE_MOIS`, tenue jusque-là par `JUR-T01-Q02`, vaut 6
 *      mois dans la SSOT, HYP-E1-9 tranchée).
 *
 * Chaque face est jouée des deux côtés : le dépôt réel sort sans faute, un témoin fait rougir.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SEUILS, type Seuil } from '../../../src/domain/seuils/ssot';
import {
  enLettres,
  EXEMPTIONS,
  controlerDepot,
  fautesDeCoherence,
  fautesDeLaSsot,
  litterauxHorsSsot,
  preavisIndexes,
} from '../../../scripts/gates/seuils-ssot';
import { VARIABLES } from '../../../src/domain/contrat/variables';
import { QUESTIONS_POUR_WILL } from '../../../src/domain/contrat/decisions';

const lire = (chemin: string): string => readFileSync(chemin, 'utf8');
const GABARIT = lire('docs/contrat/CONTRAT-APPORTEUR-V1.md');
const ANNEXE_2 = lire('docs/contrat/ANNEXE-2-MANDAT.md');

/** L'acceptation de JUR-T02, constante par constante : le nom, la valeur, l'unité. */
const ATTENDUES: readonly [string, number, Seuil['unite']][] = [
  ['PRISE_DE_CONTACT_JOURS_OUVRES', 2, 'jours_ouvres'],
  ['CONFIRMATION_TACITE_JOURS', 30, 'jours'],
  // Le contrat v2 : le délai de prise de contact de la Société (art. 3.2, contrat v2 d'axion-ia).
  ['PRISE_DE_CONTACT_SOCIETE_JOURS', 30, 'jours'],
  ['FILE_FENETRE_REDECLARATION_JOURS', 15, 'jours'],
  ['FILE_EXPIRATION_MOIS', 12, 'mois'],
  ['SUSPENSION_MAX_JOURS', 15, 'jours'],
  ['ANTERIORITE_CLIENT_MOIS', 24, 'mois'],
  ['ANTERIORITE_DEVIS_MOIS', 6, 'mois'],
  ['PEREMPTION_JOURS', 90, 'jours'],
  ['PROLONGATION_DEVIS_MOIS', 3, 'mois'],
  ['MISE_EN_DEMEURE_JOURS', 15, 'jours'],
  ['REPONSE_CONTESTATION_JOURS', 30, 'jours'],
  ['CONTESTATION_FACTURE_JOURS', 30, 'jours'],
  ['FORCLUSION_CONTESTATION_MOIS', 12, 'mois'],
  ['REPRISE_MOIS', 12, 'mois'],
  ['IMPUTATION_MOIS', 12, 'mois'],
  ['VERSEMENT_JOURS_OUVRES', 2, 'jours_ouvres'],
  ['VERSEMENT_PLAFOND_JOURS', 30, 'jours'],
  ['SEUIL_VERSEMENT', 5000, 'centimes'],
  ['SEUIL_VIGILANCE', 500000, 'centimes'],
  ['SEUIL_DAS2', 240000, 'centimes'],
  ['VIGILANCE_PERIODICITE_MOIS', 6, 'mois'],
  ['PREAVIS_JOURS', 30, 'jours'],
  ['PALIER_HORS_GRILLE_JOURS', 60, 'jours'],
  ['MANDAT_DENONCIATION_JOURS', 30, 'jours'],
  ['CONFIDENTIALITE_ANS', 2, 'ans'],
  ['FORCE_MAJEURE_MOIS', 3, 'mois'],
  ['CONSERVATION_PIECES_ANS', 10, 'ans'],
];

const seuil = (s: Partial<Seuil>): Seuil => ({
  valeur: 15,
  unite: 'jours',
  source: 'contrat art. 11.2',
  renvois: [{ document: 'contrat', unite: '11.2' }],
  verifieLe: '2026-09-27',
  ...s,
});

describe('REQ-JUR-015 — la SSOT porte tous les délais du contrat, sourcés et datés', () => {
  it.each(ATTENDUES)('REQ-JUR-015 — %s vaut %d (%s)', (nom, valeur, unite) => {
    const s = (SEUILS as Record<string, Seuil>)[nom];
    expect(s, `${nom} absente de la SSOT`).toBeDefined();
    expect(s!.valeur).toBe(valeur);
    expect(s!.unite).toBe(unite);
  });

  it('REQ-JUR-015 — la SSOT réelle est sans faute : chaque constante a une source et une date ISO', () => {
    expect(fautesDeLaSsot(SEUILS)).toEqual([]);
    for (const [nom, s] of Object.entries(SEUILS as Record<string, Seuil>)) {
      expect(s.source.trim(), nom).not.toBe('');
      expect(s.verifieLe, nom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('REQ-JUR-015 — TÉMOIN : une constante sans source, ou sans date, fait rougir et se nomme', () => {
    const fautes = fautesDeLaSsot({
      SANS_SOURCE_JOURS: seuil({ source: '  ' }),
      SANS_DATE_JOURS: seuil({ verifieLe: 'bientôt' }),
    });
    expect(fautes.map((f) => [f.famille, f.cle])).toEqual([
      ['seuil_sans_source', 'SANS_SOURCE_JOURS'],
      ['seuil_sans_date', 'SANS_DATE_JOURS'],
    ]);
  });

  it('REQ-JUR-015 — TÉMOIN : CONTRADICTOIRE_JOURS ou un seuil de strikes dans la SSOT fait rougir', () => {
    const fautes = fautesDeLaSsot({
      ...SEUILS,
      CONTRADICTOIRE_JOURS: seuil({ valeur: 7 }),
      SEUIL_STRIKES: seuil({ valeur: 3, unite: 'mois' }),
      GRADATION_PALIERS_MOIS: seuil({ valeur: 3, unite: 'mois' }),
    });
    expect(fautes.map((f) => f.cle)).toEqual([
      'CONTRADICTOIRE_JOURS',
      'SEUIL_STRIKES',
      'GRADATION_PALIERS_MOIS',
    ]);
    expect(new Set(fautes.map((f) => f.famille))).toEqual(new Set(['constante_de_gradation']));
  });
});

describe('REQ-JUR-015 — une source qui cite un texte de loi dit si elle l’a lu', () => {
  /**
   * `verifieLe` est la date de la dernière confrontation de la valeur À SA SOURCE. Une source qui
   * nomme un texte de loi sans dire s'il a été lu, sous cette date, AFFIRME une confrontation qui
   * n'a pas eu lieu — et ces valeurs sont des montants et des délais contractuels.
   *
   * 🔴 CE TÉMOIN EXISTE PARCE QUE LE CONTRÔLE À L'ŒIL A ÉCHOUÉ. Une première correction a cherché
   * une FORMULATION (« non relu », « à confirmer ») et a conclu « ce sont les DEUX seuls, vérifié
   * sur les 27 ». Trois seuils citaient encore une loi en silence : `VERSEMENT_PLAFOND_JOURS`
   * (C. com. L.441-10), `VIGILANCE_PERIODICITE_MOIS` (C. trav. D.8222-5) et
   * `CONSERVATION_PIECES_ANS` (C. com. L.123-22). Une revue `exactitude` les a nommés.
   * Le témoin cherche donc la CITATION, jamais la formulation.
   */
  // Les abréviations ET les codes écrits en mots : une revue `securite` a relevé que « Code du
  // travail » seul échappait à la première version, qui ne lisait que `C. trav`. Un détecteur qui
  // ne voit qu'une écriture laisse passer l'autre, et son vert ne dit rien.
  const CITE_UNE_LOI =
    /C\.\s*(?:trav|com|civ)\b|\b[LDR]\.\d|art\.\s*[LDR]\.\d|BOFiP|code\s+(?:du\s+travail|de\s+commerce|civil|g[ée]n[ée]ral\s+des\s+imp[oô]ts)/i;

  /**
   * Ce qui compte comme un ÉTAT DÉCLARÉ du texte de loi lui-même. Le mot « confronté » seul ne
   * suffit pas, et c'est une revue `exactitude` qui l'a montré : « contrat art. 5.3 (valeur
   * confrontée) ; C. com. L.441-10 » contient « confront », et la loi y est pourtant citée en
   * silence — le mot porte sur la VALEUR, pas sur le texte. Le témoin exige donc l'une des deux
   * formes qui parlent du texte : « non encore confronté », ou une lecture datée.
   */
  const ETAT_DU_TEXTE_DECLARE = /non encore confront|confront[ée]+\s+le\s+\d{4}-\d{2}-\d{2}/i;

  it('REQ-JUR-015 — chaque source citant une loi dit si le texte a été confronté', () => {
    const muets = Object.entries(SEUILS)
      .filter(([, s]) => CITE_UNE_LOI.test(s.source) && !ETAT_DU_TEXTE_DECLARE.test(s.source))
      .map(([cle, s]) => `${cle} : « ${s.source} »`);
    expect(
      muets,
      `ces sources citent un texte de loi sans dire s’il a été confronté, sous une date de vérification qui l’affirme :\n${muets.join('\n')}`
    ).toEqual([]);
  });

  it('REQ-JUR-015 — TÉMOIN : « valeur confrontée » ne suffit PAS à dédouaner la loi citée', () => {
    // Le contre-exemple exact que la revue a donné. Sans ce témoin, un `confront` portant sur la
    // valeur laisserait passer une loi citée en silence, et le vert du test ci-dessus mentirait.
    const piege = 'contrat art. 5.3 (valeur confrontée) ; C. com. L.441-10';
    expect(CITE_UNE_LOI.test(piege), 'la loi y est bien citée').toBe(true);
    expect(
      ETAT_DU_TEXTE_DECLARE.test(piege),
      '« valeur confrontée » parle de la valeur, pas du texte : ce piège doit être vu comme muet'
    ).toBe(false);
    // Et les deux formes qui, elles, parlent du texte.
    for (const bonne of [
      'REQ-ARG-025 (valeur confrontée) — À RELIRE, non encore confronté : C. trav. L.8222-1',
      'C. com. L.441-10, confronté le 2026-09-27',
    ]) {
      expect(ETAT_DU_TEXTE_DECLARE.test(bonne), `« ${bonne} » déclare l’état du texte`).toBe(true);
    }
  });

  it('REQ-JUR-015 — TÉMOIN : une source qui cite une loi en silence est vue, abrégée OU en mots', () => {
    // Le témoin éprouve le DÉTECTEUR, pas la SSOT : sans lui, une expression trop étroite rendrait
    // la liste vide et le vert ne voudrait rien dire.
    //
    // 🔴 CE TÉMOIN A DÉJÀ ÉTÉ TROP ÉTROIT, ET C'EST POURQUOI LES ÉCRITURES EN MOTS Y SONT. Une
    // première version du détecteur ne lisait que les abréviations (`C. trav.`), et « Code du
    // travail » lui échappait ; l'élargissement a été vérifié par une commande jetable, donc par
    // rien de durable. Une revue `securite` l'a relevé : la liste ci-dessous ne portait aucune
    // écriture en mots, et l'élargissement n'était vu rougir par AUCUN test. Une vérification qui
    // ne vit pas dans un témoin n'a pas eu lieu.
    for (const texte of [
      'contrat art. 5.3 ; C. com. L.441-10, I',
      'C. trav. D.8222-5',
      'REQ-JUR-029 ; C. com. L.123-22',
      'Code du travail, article D.8222-5',
      'code de commerce, article L.123-22',
      'code général des impôts, article 240',
      'Code civil',
    ]) {
      expect(CITE_UNE_LOI.test(texte), `« ${texte} » doit être vu comme citant une loi`).toBe(true);
      expect(/confront/i.test(texte), `« ${texte} » ne dit PAS avoir été confronté`).toBe(false);
    }
    // Et ce qui n'est PAS une loi ne doit pas être pris : un article de contrat, une exigence, une
    // hypothèse du registre. Sans ces contre-cas, un détecteur qui prendrait tout passerait aussi.
    for (const texte of ['contrat art. 5.5', 'REQ-JUR-015', 'HYP-D9', 'contrat art. 3.3 et 5.6']) {
      expect(CITE_UNE_LOI.test(texte), `« ${texte} » n’est pas une citation de loi`).toBe(false);
    }
  });
});

describe('RM-01 — les durées des motifs sont DÉRIVÉES de la SSOT, jamais retapées', () => {
  const SOURCE = readFileSync('scripts/gates/seuils-ssot.ts', 'utf8');

  /** Les durées de la SSOT, telles que la garde doit les dériver. */
  const DUREES_ATTENDUES = [
    ...new Set(
      Object.values(SEUILS)
        .filter((s) => s.unite !== 'centimes')
        .map((s) => s.valeur)
    ),
  ];

  it('RM-01 — la dérivation est écrite : les durées viennent de SEUILS, filtrées sur leur unité', () => {
    for (const morceau of ['VALEURS_DE_DUREE', 'Object.values(SEUILS)', "s.unite !== 'centimes'"]) {
      expect(
        SOURCE.includes(morceau),
        `la garde doit DÉRIVER ses durées de la SSOT : « ${morceau} » manque à sa source`
      ).toBe(true);
    }
  });

  it('RM-01 — TÉMOIN : la liste des durées retapée à la main est refusée', () => {
    // Une liste écrite à la main COÏNCIDE le jour où on l'écrit — c'était le cas ici, mesuré : les
    // deux ensembles valaient `2 3 6 10 12 15 24 30 60 90`, sans écart d'aucun côté. Elle mentait
    // le jour suivant : un `45` versé à la SSOT aurait laissé passer « 45 jours » écrit en dur dans
    // `src/`. Ce témoin refuse la FORME, pas la valeur, parce que c'est la forme qui se dégrade
    // sans bruit — et il refuse les deux ordres, croissant comme décroissant.
    const croissant = `(?:${[...DUREES_ATTENDUES].sort((a, b) => a - b).join('|')})`;
    const decroissant = `(?:${[...DUREES_ATTENDUES].sort((a, b) => b - a).join('|')})`;
    for (const litteral of [croissant, decroissant]) {
      expect(
        SOURCE.includes(litteral),
        `une alternance littérale de durées est réapparue (« ${litteral} ») : dérive-la de SEUILS`
      ).toBe(false);
    }
  });

  it('RM-01 — les mots des durées viennent de enLettres(), et chaque durée en a un', () => {
    const durees = [
      ...new Set(
        Object.values(SEUILS)
          .filter((s) => s.unite !== 'centimes')
          .map((s) => s.valeur)
      ),
    ];
    expect(durees.length, 'la SSOT doit porter au moins une durée').toBeGreaterThan(0);
    for (const n of durees) {
      expect(
        enLettres(n),
        `la durée ${n} de la SSOT n'a pas de mot : le motif en lettres l'ignorerait`
      ).not.toBeNull();
    }
  });

  it('RM-01 — TÉMOIN : enLettres() couvre 0 à 999 999, avec les règles du « s » de cent et de quatre-vingts (QA-T57)', () => {
    expect(enLettres(99)).toBe('quatre-vingt-dix-neuf');
    expect(enLettres(100)).toBe('cent');
    expect(enLettres(101)).toBe('cent un');
    expect(enLettres(120)).toBe('cent vingt');
    expect(enLettres(200)).toBe('deux cents');
    expect(enLettres(201)).toBe('deux cent un');
    expect(enLettres(280)).toBe('deux cent quatre-vingts');
    expect(enLettres(999)).toBe('neuf cent quatre-vingt-dix-neuf');
    // Au-delà de 999 : « mille » invariable, sans « un » devant ; « cent » et « quatre-vingts »
    // perdent leur « s » devant « mille ».
    expect(enLettres(1000)).toBe('mille');
    expect(enLettres(1001)).toBe('mille un');
    expect(enLettres(1095)).toBe('mille quatre-vingt-quinze');
    expect(enLettres(2000)).toBe('deux mille');
    expect(enLettres(80000)).toBe('quatre-vingt mille');
    expect(enLettres(200000)).toBe('deux cent mille');
    expect(enLettres(999999)).toBe(
      'neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf'
    );
    expect(enLettres(1000000)).toBeNull();
    expect(enLettres(-1)).toBeNull();
    expect(enLettres(1.5)).toBeNull();
  });
});

describe('REQ-JUR-015 — aucun littéral de seuil ni de délai hors de la SSOT', () => {
  it('REQ-JUR-015 — le dépôt réel est sans faute, et le compte des fichiers lus est imprimé', () => {
    const r = controlerDepot('.');
    expect(r.fautes).toEqual([]);
    // Un vert sur zéro fichier lu ne dit rien : le compte est dérivé du disque, jamais tapé.
    expect(r.fichiersLus).toBeGreaterThan(50);
  });

  it.each([
    ['const seuilDas2 = 2400;', '2400'],
    ['const s = 240_000;', '240_000'],
    ['if (cumul >= 500000) bloquer();', '500000'],
    ['const minimum = 5_000;', '5_000'],
    ['const fin = ajouterMois(debut, 12);', '12'],
    ['const limite = debut + 15 * MS_PAR_JOUR;', '15'],
    ['const limite = MS_PAR_JOUR * 60 + debut;', '60'],
    ["const texte = 'vous avez 30 jours pour contester';", '30'],
    ['const texte = `dans les quinze jours de la réception`;', 'quinze'],
    ["const texte = 'une antériorité de vingt-quatre mois';", 'vingt-quatre'],
    ['const d = addDays(x, 90);', '90'],
    ['const p = { mois: 6 };', '6'],
  ])('REQ-JUR-015 — TÉMOIN : « %s » hors SSOT fait rougir et nomme %s', (ligne, litteral) => {
    const fautes = litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: ligne }]);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]!.famille).toBe('litteral_hors_ssot');
    expect(fautes[0]!.message).toContain('src/server/temoin.ts:1');
    expect(fautes[0]!.message).toContain(litteral);
  });

  it.each([
    ['// quinze jours, art. 11.2 — un commentaire ne s’exécute pas', 'commentaire'],
    ["const renvoi = 'contrat, article 3.3 bis';", 'numéro d’article'],
    ['const n = liste.slice(0, 12);', 'nombre sans unité de temps'],
    ['const jour = mois <= 2 ? 1 : 0;', 'arithmétique du calendrier civil'],
    ['const d = SEUILS.PREAVIS_JOURS.valeur * MS_PAR_JOUR;', 'lecture de la SSOT'],
  ])('REQ-JUR-015 — CONTRE-TÉMOIN : « %s » reste vert (%s)', (ligne) => {
    expect(litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: ligne }])).toEqual([]);
  });

  it('REQ-JUR-015 — la SSOT elle-même est le seul fichier où ces littéraux s’écrivent', () => {
    const texte = lire('src/domain/seuils/ssot.ts');
    expect(litterauxHorsSsot([{ chemin: 'src/domain/seuils/ssot.ts', texte }])).toEqual([]);
    expect(
      litterauxHorsSsot([{ chemin: 'src/domain/seuils/copie.ts', texte }]).length
    ).toBeGreaterThan(0);
  });

  it('REQ-JUR-015 — une exemption déclarée qui ne correspond plus à rien rougit à son tour', () => {
    expect(EXEMPTIONS.length).toBeGreaterThan(0);
    const fautes = litterauxHorsSsot(
      EXEMPTIONS.map((e) => ({ chemin: e.chemin, texte: '' })),
      EXEMPTIONS
    );
    expect(fautes.map((f) => f.famille)).toEqual(EXEMPTIONS.map(() => 'exemption_orpheline'));
  });

  it('REQ-JUR-015 — TÉMOIN : une fonction qui calcule un préavis depuis une ancienneté fait rougir', () => {
    const temoin = [
      'export function preavisEnJours(anciennete: number): number {',
      '  return Math.min(SEUILS.PREAVIS_JOURS.valeur + anciennete, 180);',
      '}',
    ].join('\n');
    const fautes = preavisIndexes([{ chemin: 'src/server/resiliation.ts', texte: temoin }]);
    expect(fautes.map((f) => f.famille)).toEqual(['preavis_indexe']);
    expect(fautes[0]!.message).toContain('src/server/resiliation.ts:1');
    const sain = 'export const preavis = (): number => SEUILS.PREAVIS_JOURS.valeur;';
    expect(preavisIndexes([{ chemin: 'src/server/resiliation.ts', texte: sain }])).toEqual([]);
  });
});

describe('REQ-EXT-028 — cohérence gabarit ↔ SSOT, cellule à cellule', () => {
  it('REQ-EXT-028 — chaque valeur écrite dans l’article nommé est celle de la constante', () => {
    expect(fautesDeCoherence({ seuils: SEUILS, gabarit: GABARIT, annexe2: ANNEXE_2 })).toEqual([]);
  });

  it('REQ-EXT-028 — chaque constante qui renvoie au contrat y renvoie réellement', () => {
    const renvoyees = Object.values(SEUILS as Record<string, Seuil>).filter(
      (s) => s.renvois.length > 0
    );
    // Les délais du contrat sont la population de cette cohérence : si elle s'effondre, le vert
    // ne mesure plus rien.
    expect(renvoyees.length).toBeGreaterThanOrEqual(20);
  });

  it('REQ-EXT-028 — TÉMOIN : une constante qui diverge du gabarit rougit et nomme l’article', () => {
    const fautes = fautesDeCoherence({
      seuils: { ...SEUILS, MISE_EN_DEMEURE_JOURS: seuil({ valeur: 8 }) },
      gabarit: GABARIT,
      annexe2: ANNEXE_2,
    });
    expect(fautes.map((f) => [f.famille, f.cle])).toEqual([
      ['gabarit_diverge', 'MISE_EN_DEMEURE_JOURS'],
    ]);
    expect(fautes[0]!.message).toContain('11.2');
  });

  it('REQ-EXT-028 — TÉMOIN : un article modifié dans le gabarit rougit aussi', () => {
    const gabaritModifie = GABARIT.replace(
      'restée sans effet pendant quinze jours',
      'restée sans effet pendant huit jours'
    );
    expect(gabaritModifie).not.toBe(GABARIT);
    const fautes = fautesDeCoherence({
      seuils: SEUILS,
      gabarit: gabaritModifie,
      annexe2: ANNEXE_2,
    });
    expect(fautes.map((f) => f.cle)).toEqual(['MISE_EN_DEMEURE_JOURS']);
  });

  it('REQ-EXT-028 — chaque variable `seuil` du gabarit résout vers la SSOT, sauf celle d’une question ouverte', () => {
    const tenuesParUneQuestion = new Set(QUESTIONS_POUR_WILL.flatMap((q) => q.variables));
    const seuilsDuGabarit = Object.entries(VARIABLES)
      .filter(([, s]) => s.genre === 'seuil')
      .map(([nom, s]) => [nom, s.genre === 'seuil' ? s.constante : ''] as const);
    expect(seuilsDuGabarit.length).toBeGreaterThan(0);
    for (const [nom, constante] of seuilsDuGabarit) {
      if (tenuesParUneQuestion.has(nom)) {
        // La SSOT n'invente pas une valeur que Will n'a pas inscrite au registre.
        expect(Object.hasOwn(SEUILS, constante), `${constante} attend sa question`).toBe(false);
      } else {
        expect(Object.hasOwn(SEUILS, constante), `${constante} absente de la SSOT`).toBe(true);
      }
    }
  });
});

describe('REQ-JUR-029 — la durée de conservation des pièces vit dans la SSOT', () => {
  it('REQ-JUR-029 — dix ans, avec sa source', () => {
    const s = (SEUILS as Record<string, Seuil>).CONSERVATION_PIECES_ANS!;
    expect([s.valeur, s.unite]).toEqual([10, 'ans']);
    expect(s.source).toMatch(/REQ-JUR-029/);
  });
});

describe('REQ-JUR-015 — un montant de seuil se reconnaît quel que soit son séparateur de milliers', () => {
  // Règle, pas motif : tout nombre écrit dans `src/` est lu sans ses séparateurs de milliers, puis
  // confronté aux montants de la SSOT (centimes et euros). Un séparateur par ligne.
  it.each([
    ["const libelle = 'seuil de 2 400 €';", '2 400', 'espace'],
    ["const libelle = 'vigilance à 5 000 €';", '5 000', 'espace insécable U+00A0'],
    ["const libelle = 'vigilance à 5 000 €';", '5 000', 'espace fine insécable U+202F'],
    ["const libelle = 'seuil de 2 400 euros';", '2 400', 'espace fine U+2009'],
    ["const libelle = 'seuil de 2.400 EUR';", '2.400', 'point'],
    ['const libelle = "seuil de 2\'400 CHF";', "2'400", 'apostrophe'],
    ['const s = 2_400;', '2_400', 'souligné'],
    ["const libelle = 'seuil de 2,400';", '2,400', 'virgule entre groupes de trois'],
    ["const libelle = 'cumul de 240 000 centimes';", '240 000', 'centimes, espace'],
    [
      "const libelle = 'versement dès 50,00 €';",
      '50,00',
      'petit montant en euros, décimales nulles',
    ],
    ["const libelle = 'seuil de 2 400,00 €';", '2 400', 'milliers et décimales nulles'],
  ])('REQ-JUR-015 — TÉMOIN : « %s » fait rougir et nomme %s (%s)', (ligne, litteral) => {
    const fautes = litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: ligne }]);
    expect(fautes.map((f) => f.famille)).toEqual(['litteral_hors_ssot']);
    expect(fautes[0]!.message).toContain(litteral);
  });

  it.each([
    ["const libelle = '12 400 €';", 'un autre montant, dont 2 400 n’est que la fin'],
    ["const libelle = '2 400,50 €';", 'décimales non nulles : ce n’est pas le seuil'],
    ["const libelle = 'lot de 50 pièces';", 'petit nombre sans unité monétaire'],
    ["const version = '1.2.400';", 'numéro de version'],
  ])('REQ-JUR-015 — CONTRE-TÉMOIN : « %s » reste vert (%s)', (ligne) => {
    expect(litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: ligne }])).toEqual([]);
  });
});

describe('REQ-JUR-015 — un délai de la SSOT se reconnaît dans tout produit de littéraux', () => {
  // Règle, pas motif : tout produit de littéraux entiers est évalué, dans n'importe quel ordre et
  // parenthèses comprises, puis confronté à chaque délai de la SSOT exprimé en millisecondes,
  // secondes, minutes, heures et jours.
  it.each([
    ['const d = 1000 * 60 * 60 * 24 * 30;', '30 jours', 'millisecondes, ordre croissant'],
    ['const d = 15 * 24 * 3600 * 1000;', '15 jours', 'millisecondes, secondes par heure'],
    ['const d = (60 * 60) * (24 * 90) * 1000;', '90 jours', 'parenthèses'],
    ['const d = 60 * 60 * 24 * 15;', '15 jours', 'secondes'],
    ['const d = 60 * 24 * 30;', '30 jours', 'minutes'],
    ['const d = 24 * 2;', '2 jours', 'heures'],
    ['const d = 3 * 30 * 24 * 60 * 60 * 1000;', '90 jours', 'trois mois de trente jours'],
    ['const d = 1_000 *\n  86_400 * 60;', '60 jours', 'sur deux lignes, séparateurs `_`'],
  ])('REQ-JUR-015 — TÉMOIN : « %s » fait rougir et nomme %s (%s)', (ligne, delai) => {
    const fautes = litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: ligne }]);
    expect(fautes.map((f) => f.famille)).toEqual(['litteral_hors_ssot']);
    expect(fautes[0]!.message).toContain(delai);
    expect(fautes[0]!.message).toContain('src/server/temoin.ts:1');
  });

  it.each([
    ['const aire = 7 * 11;', 'un produit sans rapport'],
    ['const MS_PAR_HEURE = 60 * 60 * 1000;', 'une heure, qui n’est aucun délai'],
    ['const MS_PAR_JOUR = 24 * 60 * 60 * 1000;', 'un jour, qui n’est aucun délai'],
    ['const CORPS_MAX_OCTETS = 128 * 1024;', 'une taille en octets'],
    ['const x = v.2 * 15;', 'une décimale n’est pas un entier'],
  ])('REQ-JUR-015 — CONTRE-TÉMOIN : « %s » reste vert (%s)', (ligne) => {
    expect(litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: ligne }])).toEqual([]);
  });
});
