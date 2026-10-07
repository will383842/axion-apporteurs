// @req REQ-JUR-003
/**
 * JUR-T66 — le gabarit RECOPIE le contrat v2 d'axion-ia (décision de Williams du 2026-10-07, #474,
 * 6032680253), dans LES DEUX SENS, phrase par phrase, sur le modèle de la comparaison par programme de
 * l'exactitude (pré-relecture de #810, 6040114529). Seuls subsistent les NEUF écarts admis par la
 * coordination sous la délégation de Williams (#474, 6033964636), et la variable du (b) de l'art. 3.4
 * al. 3 : chacun est une exception NOMINATIVE, et chacune doit encore se trouver (une exception devenue
 * inutile rougit aussi). Tout autre écart rougit, en nommant la phrase.
 *
 * LA SOURCE est `tests/fixtures/contrat/contrat-v2-axion-ia.md` : le corps et l'annexe 2 du v2, nombres
 * masqués (l'économie du réseau ne va pas dans un dépôt public). Les variables `{{X}}` et les nombres
 * valent un joker « § », des deux côtés ; l'emphase, les commentaires et les apostrophes typographiques
 * sont normalisés. L'annexe 1 et la table de correspondance des clauses sont hors du champ : propres à
 * Partners, par construction.
 *
 * Écrit par A06 (auteur écrans), qui n'est pas l'autrice du gabarit (A07) : règle du croisement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const FIXTURE = readFileSync('tests/fixtures/contrat/contrat-v2-axion-ia.md', 'utf8');
const V2_CORPS = FIXTURE.slice(0, FIXTURE.indexOf('<!-- annexe 2 -->'));
const V2_ANNEXE_2 = FIXTURE.slice(FIXTURE.indexOf('<!-- annexe 2 -->'));
const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');
const G_CORPS = GABARIT.slice(
  GABARIT.indexOf("## Contrat d'apporteur d'affaires"),
  GABARIT.indexOf('## Annexe 1')
);
const G_ANNEXE_2 = readFileSync('docs/contrat/ANNEXE-2-MANDAT.md', 'utf8');

/**
 * Les termes que `gov:publication` refuse hors du gabarit : la fixture les masque en « ⁂ », et le gabarit
 * l'est de même ici. La liste est LUE dans la garde : ce fichier ne les écrit pas.
 */
const MASQUES = [
  ...(/const DOCTRINE = \[([\s\S]*?)\];/
    .exec(readFileSync('scripts/gates/gov-publication.ts', 'utf8'))![1]!
    .matchAll(/'([^']+)'/g) ?? []),
].map((m) => m[1]!);
const RE_MASQUES = new RegExp(
  MASQUES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi'
);

/** La forme comparable : variables et nombres en joker, emphase et commentaires retirés, blancs réduits. */
function norme(t: string): string {
  return t
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(RE_MASQUES, '⁂')
    .replace(/`/g, '')
    .replace(/\{\{[A-Z0-9_]+\}\}/g, '§')
    .replace(/\d+(?:[  .,]\d+)*/g, '§')
    .replace(/§\s*[%€]/g, '§')
    .replace(/\*+/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les phrases d'un texte normé, d'au moins douze caractères. */
function phrases(t: string): string[] {
  return norme(t)
    .split(/(?<=[.!?:;])\s+(?=[A-ZÀ-Ý"(§—-])/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 12);
}

/** Les phrases de `de` absentes de `vers`, mot pour mot sous la forme comparable. */
function absentes(de: string, vers: string): string[] {
  const v = norme(vers);
  return phrases(de).filter((p) => !v.includes(p));
}

/**
 * LES ÉCARTS ADMIS, chacun par le DÉBUT de sa phrase (forme comparable) et sa source : l'adaptation n°
 * de 6033964636, ou la variable du (b). Côté gabarit, puis côté v2.
 */
type Ecart = { readonly debut: string; readonly raison: string };
const ADMIS_GABARIT: readonly Ecart[] = [
  { debut: '§, § au capital de §, immatriculée', raison: 'adaptation 9 : l’en-tête en variables' },
  {
    debut: '§ Les opérations que le contrat confie à la Société',
    raison:
      'adaptation 1 : le fond de l’art. 2.8 retiré, sans « manuellement » (Williams, 6032680617)',
  },
  {
    debut:
      'Le retard de la Société dans l’une de ces opérations ne prive l’Apporteur d’aucun droit, et la Société conserve',
    raison:
      'adaptation 1 : « renonciation » laissée aux seules chaînes de l’art. 19 (lexique-apporteurs)',
  },
  {
    debut:
      'L’attribution naît de la déclaration de l’entreprise, adressée par l’Apporteur au moyen du formulaire',
    raison: 'adaptation 2',
  },
  {
    debut: '(b) la Société a tenu un rendez-vous',
    raison: 'le (b) de l’art. 3.4 al. 3 en variable de la SSOT',
  },
  { debut: 'L’Apporteur conserve ses moyens d’accès', raison: 'adaptation 3' },
  { debut: 'Toute déclaration enregistrée avec ses moyens d’accès', raison: 'adaptation 4' },
  { debut: 'Le parrain a accès, par son espace en ligne, au montant', raison: 'adaptation 5' },
  {
    debut: 'L’Apporteur reçoit par courrier électronique ses autofactures',
    raison: 'adaptation 6',
  },
  { debut: 'Il peut obtenir sur simple demande écrite à la Société', raison: 'adaptation 7' },
  { debut: 'L’Apporteur est identifié par le lien de connexion', raison: 'adaptation 8' },
  {
    debut: 'La Société — § · L’Apporteur — §',
    raison: 'adaptation 9 : le bloc de signature en variables',
  },
];
const ADMIS_V2: readonly Ecart[] = [
  {
    debut: 'AXION IA SAS, société par actions simplifiée',
    raison: 'adaptation 9 : l’en-tête en variables',
  },
  { debut: '§ — Période de démarrage.', raison: 'adaptation 1 : l’art. 2.8 retiré' },
  { debut: 'Tant que l’espace en ligne n’est pas ouvert', raison: 'adaptation 1' },
  { debut: 'Les délais qui courent de plein droit', raison: 'adaptation 1' },
  { debut: 'Elle ne reporte aucun délai de paiement', raison: 'adaptation 1' },
  {
    debut: 'L’encaissement, au sens de l’article §',
    raison: 'adaptation 1 : l’encaissement, repris à l’art. 4.0',
  },
  { debut: 'Les opérations que le contrat confie à la Société', raison: 'adaptation 1' },
  {
    debut:
      'Le retard de la Société dans l’une de ces opérations ne prive l’Apporteur d’aucun droit et ne vaut pas',
    raison: 'adaptation 1',
  },
  {
    debut: 'Les stipulations qui supposent une fonction de l’espace en ligne',
    raison: 'adaptation 1',
  },
  { debut: 'Le présent article ne crée aucune obligation nouvelle', raison: 'adaptation 1' },
  { debut: 'Si l’espace en ligne est ouvert', raison: 'adaptation 1' },
  {
    debut:
      'L’attribution naît de la déclaration de l’entreprise, adressée par l’Apporteur par courrier électronique',
    raison: 'adaptation 2',
  },
  {
    debut: '(b) la Société a tenu un rendez-vous',
    raison: 'le (b) de l’art. 3.4 al. 3 en variable de la SSOT',
  },
  { debut: 'L’Apporteur conserve son lien personnel', raison: 'adaptation 3' },
  { debut: 'Toute déclaration enregistrée au moyen de son lien personnel', raison: 'adaptation 4' },
  { debut: 'Le parrain a accès, par son espace en ligne ou', raison: 'adaptation 5' },
  {
    debut: 'L’Apporteur reçoit par courrier électronique ses autofactures',
    raison: 'adaptation 6',
  },
  { debut: 'Il peut obtenir sur simple demande à contact@axion-ia.com', raison: 'adaptation 7' },
  { debut: 'L’Apporteur est identifié par le lien personnel', raison: 'adaptation 8' },
];

/** Range chaque phrase absente sous l'écart admis qui la nomme ; rend les orphelines et les exceptions inutiles. */
function confronter(absences: readonly string[], admis: readonly Ecart[]) {
  const debuts = admis.map((e) => norme(e.debut));
  const orphelines = absences.filter((p) => !debuts.some((d) => p.startsWith(d)));
  const inutiles = admis.filter((_, i) => !absences.some((p) => p.startsWith(debuts[i]!)));
  return { orphelines, inutiles: inutiles.map((e) => `${e.debut} (${e.raison})`) };
}

describe('REQ-JUR-003 — le gabarit recopie le contrat v2 d’axion-ia, dans les deux sens (JUR-T66)', () => {
  it('REQ-JUR-003 : TÉMOIN — du gabarit vers le v2 : toute phrase absente du v2 est l’un des écarts admis, et chaque écart admis subsiste', () => {
    const r = confronter(absentes(G_CORPS, V2_CORPS), ADMIS_GABARIT);
    expect(r.orphelines, 'phrases du gabarit absentes du v2, hors des écarts admis').toEqual([]);
    expect(r.inutiles, 'écarts admis qui ne se trouvent plus').toEqual([]);
  });

  it('REQ-JUR-003 : TÉMOIN — du v2 vers le gabarit : toute phrase du v2 absente du gabarit est l’un des écarts admis, et chaque écart admis subsiste', () => {
    const r = confronter(absentes(V2_CORPS, G_CORPS), ADMIS_V2);
    expect(r.orphelines, 'phrases du v2 absentes du gabarit, hors des écarts admis').toEqual([]);
    expect(r.inutiles, 'écarts admis qui ne se trouvent plus').toEqual([]);
  });

  it('REQ-JUR-003 : TÉMOIN — l’annexe 2 (le mandat d’autofacturation) recopie le v2 mot pour mot, dans les deux sens', () => {
    expect(absentes(G_ANNEXE_2, V2_ANNEXE_2)).toEqual([]);
    expect(absentes(V2_ANNEXE_2, G_ANNEXE_2)).toEqual([]);
  });

  it('REQ-JUR-003 : TÉMOIN — la comparaison sait rougir : une phrase changée dans le gabarit devient orpheline', () => {
    const altere = G_CORPS.replace(
      'Chaque partie peut résilier le contrat à tout moment',
      'Chaque partie peut résilier le contrat quand elle le veut'
    );
    expect(altere).not.toBe(G_CORPS);
    expect(confronter(absentes(altere, V2_CORPS), ADMIS_GABARIT).orphelines).toHaveLength(1);
  });

  it('REQ-JUR-003 : la fixture ne porte aucun nombre (l’économie du réseau reste hors du dépôt public), ni l’annexe 1', () => {
    // Hors de ses commentaires (la source, sa date, le marqueur de l’annexe), le texte du v2 ne garde
    // aucun chiffre.
    expect(FIXTURE.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/\d/);
    expect(FIXTURE).not.toContain('## Annexe 1');
  });
});
