// @req REQ-DM-042
// @req REQ-JUR-009
/**
 * JUR-T40, réécrit sur le contrat v2 — LA CONFIRMATION AU CONTRAT : art. 3.2 (prise de contact par la
 * Société, confirmation par l'entreprise, règle tacite, fin faute d'adresse valide), 3.4 (premier
 * échange) et 3.7 (journalisation), et l'information de l'apporteur sur son nom.
 *
 * Source : le contrat apporteur v2 d'axion-ia, validé par Williams le 2026-10-05, qui fait foi
 * (décision du 2026-10-07, #474, 6032680253), recopié par la juriste (A07). Ce témoin est écrit par
 * A06, règle du croisement ; ce témoin juge ses UNITÉS (`unitesDuGabarit`), sous leur
 * forme comparable (`normaliser`), sans retaper aucune valeur : les délais sont des variables de la
 * SSOT (RM-10, amendement A1-13 de la vérification V2), et aucun nombre qu'elles portent ne doit être
 * écrit en clair à l'art. 3.2.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser, unitesDuGabarit } from '../../../src/domain/contrat/gabarit';
import { VARIABLES } from '../../../src/domain/contrat/variables';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const UNITES = unitesDuGabarit(GABARIT);

/** L'alinéa `n` (compté à partir de 1, notes exclues) d'une unité, sous sa forme comparable. */
function alinea(unite: string, n: number): string {
  const u = UNITES.get(unite);
  expect(u, `unité ${unite} absente du gabarit`).toBeDefined();
  return normaliser(u!.alineas[n - 1] ?? '');
}

/** Les délais que l'art. 3.2 du v2 écrit par variables. */
const VARIABLES_DE_L_ART_3_2 = [
  'CONFIRMATION_TACITE_JOURS',
  'LIBERATION_SIGNALEE_JOURS',
  'CARENCE_REDEPOT_APRES_LIBERATION_JOURS',
  'PRISE_DE_CONTACT_SOCIETE_JOURS',
] as const;

/** Les variables du brouillon que le v2 ne connaît plus. */
const VARIABLES_RETIREES = [
  'LIBERATION_SIGNALEE_INJOIGNABLE_MAX',
  'CARENCE_REDEPOT_APRES_SECONDE_LIBERATION_JOURS',
] as const;

describe('REQ-DM-042 — art. 3.2 (v2) : la prise de contact, la confirmation par l’entreprise, la règle tacite', () => {
  it('REQ-DM-042 : al. 3 — l’attribution est d’abord provisoire, et la Société prend contact avec la personne déclarée', () => {
    const a = alinea('3.2', 3);
    expect(a).toContain("L'attribution est d'abord provisoire.");
    expect(a).toContain(
      "Après l'enregistrement de la déclaration, la Société prend contact avec la personne déclarée, notamment par courrier électronique, pour lui présenter ses services."
    );
  });

  it('REQ-DM-042 : al. 4 — la confirmation vient de l’entreprise ; la règle tacite court de la prise de contact, et pas pendant un retour en erreur', () => {
    const a = alinea('3.2', 4);
    expect(a).toContain(
      "L'attribution devient définitive dès que l'entreprise répond à la Société, prend rendez-vous avec elle ou échange avec elle, sans indiquer n'avoir eu aucun échange avec l'Apporteur."
    );
    expect(a).toContain(
      '{{CONFIRMATION_TACITE_JOURS}} jours à compter de la prise de contact (envoi du premier message de la Société)'
    );
    expect(a).toContain(
      "Tant que le message revient en erreur et que l'Apporteur n'a pas communiqué une adresse corrigée, ce délai ne court pas"
    );
  });

  it('REQ-DM-042 : al. 4 — la fin faute d’adresse valide, la carence de redépôt et le délai de prise de contact sont écrits par variables', () => {
    const a = alinea('3.2', 4);
    expect(a).toContain('{{LIBERATION_SIGNALEE_JOURS}} jours à compter de la déclaration');
    expect(a).toContain(
      "il ne peut déclarer à nouveau la même entreprise qu'à l'expiration d'un délai de {{CARENCE_REDEPOT_APRES_LIBERATION_JOURS}} jours"
    );
    expect(a).toContain(
      "La Société prend contact avec la personne déclarée dans les {{PRISE_DE_CONTACT_SOCIETE_JOURS}} jours de l'enregistrement de la déclaration"
    );
  });

  it.each([
    "s'efforce de prendre contact",
    'deux jours ouvrés',
    'sans que ce contact ait été tenté',
    'en réponse à la demande de confirmation',
  ])('REQ-DM-042 : l’ancienne rédaction « %s » n’est plus à l’art. 3.2', (ancien) => {
    // « deux jours ouvrés » revient à l'art. 5.3, pour le délai indicatif de versement : le témoin
    // juge l'article de la confirmation.
    expect(normaliser(UNITES.get('3.2')!.alineas.join(' '))).not.toContain(ancien);
  });

  it('REQ-DM-042 : RM-10 — aucun des nombres de la SSOT n’est écrit en clair à l’art. 3.2, ni en chiffres ni en lettres', () => {
    const art = normaliser(UNITES.get('3.2')!.alineas.join(' '))
      // Les renvois à un article ou à un alinéa ne sont pas des délais.
      .replace(/articles?\s+\d+(?:\.\d+)?(?:\s+bis)?/gi, '')
      .replace(/alinéas?\s+\d+(?:\s+et\s+\d+)?/gi, '');
    expect(art).not.toMatch(/(?<![\d.])(?:3|30|45|90)(?![\d.])/);
    expect(art).not.toMatch(/\b(?:trois|trente|quarante-cinq|quatre-vingt-dix)\b/i);
  });

  it('REQ-DM-042 : al. 5 — le silence n’a que deux conséquences, et ne fait naître aucune commission', () => {
    const a = alinea('3.2', 5);
    expect(a).toContain(
      "La confirmation réputée acquise et la fin de l'attribution faute d'adresse valide sont les seules conséquences attachées au silence de l'entreprise."
    );
    expect(a).toContain('La confirmation réputée acquise ne fait naître aucune commission');
  });

  it('REQ-DM-042 : les délais de l’art. 3.2 sont des variables du contrat, déclarées sur la SSOT ; celles du brouillon n’y sont plus', () => {
    for (const v of VARIABLES_DE_L_ART_3_2) {
      expect(Object.keys(VARIABLES), v).toContain(v);
      expect(VARIABLES[v as keyof typeof VARIABLES], v).toMatchObject({ constante: v });
    }
    for (const v of VARIABLES_RETIREES) {
      expect(Object.keys(VARIABLES), v).not.toContain(v);
      expect(GABARIT).not.toContain(`{{${v}}}`);
    }
  });
});

describe('REQ-JUR-009 — l’apporteur est informé que son nom est communiqué', () => {
  it('REQ-JUR-009 : art. 3.2 al. 3 — ses prénom et nom sont communiqués à la personne qu’il déclare, jamais ses coordonnées', () => {
    const a = alinea('3.2', 3);
    expect(a).toContain(
      "l'Apporteur est informé que ses prénom et nom sont ainsi communiqués à la personne qu'il déclare ; ses coordonnées ne lui sont pas communiquées."
    );
  });
});

describe('REQ-DM-042 — art. 3.4 et 3.7 : le premier échange, la journalisation', () => {
  it('REQ-DM-042 : art. 3.4 al. 2 — le premier échange est la première réponse de l’entreprise ; la prise de contact n’en tient pas lieu', () => {
    const a = alinea('3.4', 2);
    expect(a).toContain(
      "Le premier échange s'entend de la première réponse de l'entreprise à la Société, quel qu'en soit le moyen"
    );
    expect(a).toContain(
      "l'envoi d'un message resté sans réponse, notamment la prise de contact de l'article 3.2, n'en tient pas lieu"
    );
  });

  it('REQ-DM-042 : art. 3.7 al. 2 — la réponse de l’entreprise est journalisée, avec sa date, son auteur et ses termes', () => {
    expect(alinea('3.7', 2)).toContain(
      "La réponse de l'entreprise est journalisée avec sa date, la personne qui l'a donnée, et ses termes"
    );
  });
});

/**
 * Le registre écrit la valeur de chaque délai de l'art. 3.2 sous la forme « `NOM` (= N, SSOT) ».
 * Les valeurs sont modifiables, mais jamais en silence : une SSOT qui change sans que le registre
 * le dise est une divergence (attaque jouée sur JUR-T40, qui ne rougissait pas).
 */
describe('REQ-DM-042 — les délais de l’art. 3.2 : la SSOT dit ce que le registre écrit', () => {
  const REGISTRE = readFileSync('docs/DECISIONS.md', 'utf8');
  it.each([
    'LIBERATION_SIGNALEE_INJOIGNABLE_MAX',
    'LIBERATION_SIGNALEE_JOURS',
    'CARENCE_REDEPOT_APRES_LIBERATION_JOURS',
    'CARENCE_REDEPOT_APRES_SECONDE_LIBERATION_JOURS',
  ] as const)('REQ-DM-042 : %s — la valeur de la SSOT est celle du registre', (nom) => {
    // Le nom, puis au plus soixante caractères sans parenthèse, puis « (= N, SSOT) ».
    const debut = REGISTRE.indexOf('`' + nom + '`');
    const ecrite =
      debut === -1
        ? null
        : /^[^(]{0,60}\(= (\d+), SSOT\)/.exec(REGISTRE.slice(debut + nom.length + 2));
    expect(ecrite, `${nom} : aucune valeur « (= N, SSOT) » au registre`).not.toBeNull();
    expect(SEUILS[nom].valeur).toBe(Number(ecrite![1]));
  });
});
