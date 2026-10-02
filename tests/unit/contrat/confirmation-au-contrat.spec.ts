// @req REQ-DM-042
// @req REQ-JUR-009
/**
 * JUR-T40 — LA CONFIRMATION AU CONTRAT : art. 3.2 (confirmation par réponse ou par contact, règle
 * tacite, fin d'une demande vérifiée), 3.4 (première prise de contact) et 3.7 (journalisation), et
 * l'information de l'apporteur sur son nom.
 *
 * Source : `docs/chantiers/W20-confirmation-par-email.md` (décisions de Williams du 2026-09-29). Le
 * texte est celui de la juriste (A07) ; ce témoin juge ses UNITÉS (`unitesDuGabarit`), sous leur
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

const RESERVE_VERIFICATION =
  "sauf lorsque la demande fait l'objet d'une vérification, auquel cas seule une prise de contact concluante de la Société vaut confirmation";

const VARIABLES_DE_L_ART_3_2 = [
  'CONFIRMATION_TACITE_JOURS',
  'LIBERATION_SIGNALEE_INJOIGNABLE_MAX',
  'LIBERATION_SIGNALEE_JOURS',
  'CARENCE_REDEPOT_APRES_LIBERATION_JOURS',
  'CARENCE_REDEPOT_APRES_SECONDE_LIBERATION_JOURS',
] as const;

describe('REQ-DM-042 — art. 3.2 : la confirmation par réponse ou par contact, la règle tacite', () => {
  it('REQ-DM-042 : al. 3 — la confirmation se fait en réponse à la demande OU lors d’une prise de contact, sous la réserve de la vérification', () => {
    const a = alinea('3.2', 3);
    expect(a).toContain('en réponse à la demande de confirmation');
    expect(a).toContain("lors d'une prise de contact de la Société");
    expect(a).toContain(RESERVE_VERIFICATION);
  });

  it('REQ-DM-042 : al. 5 — la confirmation tacite court de la RÉCEPTION, sous la réserve de la vérification, et ne court pas pendant le rebond', () => {
    const a = alinea('3.2', 5);
    expect(a).toContain('{{CONFIRMATION_TACITE_JOURS}} jours');
    expect(a).toContain('à compter de la réception de la demande de confirmation');
    expect(a).toContain(RESERVE_VERIFICATION);
    expect(a).toContain('ce délai ne court pas');
  });

  it.each([
    "s'efforce de prendre contact",
    'deux jours ouvrés',
    'sans que ce contact ait été tenté',
  ])('REQ-DM-042 : l’ancienne rédaction « %s » n’est plus nulle part dans le gabarit', (ancien) => {
    expect(normaliser(GABARIT)).not.toContain(ancien);
  });

  it('REQ-DM-042 : al. 6 — la fin d’une demande vérifiée et la carence de redépôt sont écrites par variables', () => {
    const a = alinea('3.2', 6);
    for (const v of VARIABLES_DE_L_ART_3_2.slice(1)) expect(a).toContain(`{{${v}}}`);
  });

  it('REQ-DM-042 : RM-10 — aucun des nombres de la SSOT n’est écrit en clair à l’art. 3.2, ni en chiffres ni en lettres', () => {
    const art = normaliser(UNITES.get('3.2')!.alineas.join(' '))
      // Les renvois à un article ou à un alinéa ne sont pas des délais.
      .replace(/articles?\s+\d+(?:\.\d+)?(?:\s+bis)?/gi, '')
      .replace(/alinéas?\s+\d+(?:\s+et\s+\d+)?/gi, '');
    expect(art).not.toMatch(/(?<![\d.])(?:3|30|45|90)(?![\d.])/);
    expect(art).not.toMatch(/\b(?:trois|trente|quarante-cinq|quatre-vingt-dix)\b/i);
  });

  it('REQ-DM-042 : al. 7 — le silence n’a que deux conséquences, et ne fait naître aucune commission', () => {
    const a = alinea('3.2', 7);
    expect(a).toContain('seules conséquences attachées au silence');
    expect(a).toContain('ne fait naître aucune commission');
  });

  it('REQ-DM-042 : les cinq délais de l’art. 3.2 sont des variables du contrat, déclarées sur la SSOT', () => {
    for (const v of VARIABLES_DE_L_ART_3_2) {
      expect(Object.keys(VARIABLES), v).toContain(v);
      expect(VARIABLES[v as keyof typeof VARIABLES], v).toMatchObject({ constante: v });
    }
  });
});

describe('REQ-JUR-009 — l’apporteur est informé que son nom est communiqué', () => {
  it('REQ-JUR-009 : art. 3.2 al. 4 — ses prénom et nom sont communiqués à la personne qu’il déclare', () => {
    const a = alinea('3.2', 4);
    expect(a).toContain('ses prénom et nom sont ainsi communiqués à la personne');
    expect(a).toContain("qu'il déclare");
  });
});

describe('REQ-DM-042 — art. 3.4 et 3.7 : la première prise de contact, la journalisation', () => {
  it('REQ-DM-042 : art. 3.4 al. 2 — la première prise de contact est la première réponse de l’entreprise', () => {
    expect(alinea('3.4', 2)).toContain(
      "La première prise de contact s'entend de la première réponse de l'entreprise"
    );
  });

  it('REQ-DM-042 : art. 3.7 al. 2 — la réponse donnée à la demande de confirmation est journalisée, avec son destinataire', () => {
    const a = alinea('3.7', 2);
    expect(a).toContain('en réponse à la demande de confirmation');
    expect(a).toContain('est journalisée');
    expect(a).toContain('destinataire de la demande');
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
