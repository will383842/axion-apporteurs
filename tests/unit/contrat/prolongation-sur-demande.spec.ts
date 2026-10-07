// @req REQ-EXT-020
/**
 * JUR-T54 (REQ-EXT-020) — l'art. 3.4 al. 3 : la prolongation de l'attribution, recopiée du contrat
 * apporteur v2 d'axion-ia que Williams a validé (décision du 2026-10-07, #474, 6032423244).
 *
 * L'attribution est prolongée de trois mois, UNE seule fois et SANS démarche de l'Apporteur, lorsqu'au
 * terme de la période l'une de trois conditions de la Société est remplie : (a) un devis en cours, (b) un
 * rendez-vous TENU ou un échange dans les derniers jours (`PROLONGATION_FAITS_RECENTS_JOURS`, SSOT),
 * (c) un dossier de financement en cours d'instruction. La voie « demande de l'Apporteur » du brouillon
 * est retirée : le v2 exclut toute démarche de l'Apporteur. Avec elle disparaît
 * `PROLONGATION_DEMANDE_OUVERTE_JOURS`.
 *
 * Le témoin juge le gabarit RENDU avec la valeur de la SSOT (RM-10 : le texte ne retape aucun nombre),
 * blancs et gras normalisés. Il est écrit par A06, pas par l'autrice du texte (A07), règle du
 * croisement.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { rendre } from '../../../src/domain/contrat/gabarit';
import { VARIABLES } from '../../../src/domain/contrat/variables';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');

/** Un seuil lu par son nom : `undefined` s'il n'existe pas (le témoin rougit, il ne plante pas). */
const seuil = (nom: string) =>
  (
    SEUILS as unknown as Readonly<Record<string, { valeur: number; unite: string; source: string }>>
  )[nom];
const FAITS_RECENTS = seuil('PROLONGATION_FAITS_RECENTS_JOURS');

const RENDU = rendre(
  GABARIT,
  FAITS_RECENTS === undefined
    ? {}
    : { PROLONGATION_FAITS_RECENTS_JOURS: String(FAITS_RECENTS.valeur) },
  []
);

/** L'art. 3.4 rendu, de son intitulé à celui de l'article suivant : blancs normalisés, sans le gras. */
function article(debut: string, suivant: string): string {
  const i = RENDU.indexOf(debut);
  const j = RENDU.indexOf(suivant, i + debut.length);
  if (i < 0 || j < 0) throw new Error(`article introuvable : ${debut}`);
  return RENDU.slice(i, j).replace(/\*\*/g, '').replace(/\s+/g, ' ');
}
const ART_3_4 = article('**3.4 — ', '**3.5 — ');

describe('REQ-EXT-020 — la prolongation de l’art. 3.4 al. 3, recopiée du contrat v2', () => {
  it('REQ-EXT-020 : TÉMOIN — PROLONGATION_FAITS_RECENTS_JOURS vaut 30 jours, sourcée, et le gabarit la lit par sa variable', () => {
    expect(FAITS_RECENTS).toBeDefined();
    expect(FAITS_RECENTS).toMatchObject({ valeur: 30, unite: 'jours' });
    expect(FAITS_RECENTS!.source).toMatch(/3\.4/);
    expect(VARIABLES['PROLONGATION_FAITS_RECENTS_JOURS']).toMatchObject({
      genre: 'seuil',
      constante: 'PROLONGATION_FAITS_RECENTS_JOURS',
    });
    expect(GABARIT).toContain('{{PROLONGATION_FAITS_RECENTS_JOURS}} derniers jours');
    // Aucun nombre retapé : le rendu porte la valeur de la SSOT, et rien n'y reste à résoudre.
    expect(ART_3_4).not.toContain('{{PROLONGATION_FAITS_RECENTS_JOURS}}');
  });

  it('REQ-EXT-020 : TÉMOIN — une seule prolongation de trois mois, sans démarche de l’Apporteur, et les trois conditions de la Société', () => {
    expect(ART_3_4).toContain(
      "L'attribution est prolongée de trois mois, une seule fois et sans démarche de l'Apporteur, lorsqu'au " +
        "terme de la période l'une des conditions suivantes est remplie : (a) un devis émis par la Société à " +
        "l'entreprise est en cours ; (b) la Société a tenu un rendez-vous ou eu un échange avec l'entreprise au " +
        `cours des ${FAITS_RECENTS?.valeur ?? '?'} derniers jours ; (c) un dossier de financement de la ` +
        "prestation, notamment auprès d'un opérateur de compétences, est en cours d'instruction."
    );
    expect(ART_3_4).toContain(
      "Ces conditions s'apprécient sur les seules données de la Société ; aucune ne dépend de l'activité de " +
        "l'Apporteur."
    );
    expect(ART_3_4).toContain("L'Apporteur est informé de la prolongation.");
  });

  // @no-red-first: main ne porte pas non plus de voie de demande, le brouillon la portait sans être fusionné
  it('REQ-EXT-020 : TÉMOIN — aucune voie « demande de l’Apporteur », et un rendez-vous TENU, jamais « planifié »', () => {
    for (const voie of [
      /demande de l'Apporteur/i,
      /l'Apporteur la demande/i,
      /à la demande de l'Apporteur/i,
      /sur (sa )?demande/i,
      /confirme son intérêt/i,
    ])
      expect(ART_3_4, String(voie)).not.toMatch(voie);
    expect(ART_3_4).not.toMatch(/planifi/i);
    expect(seuil('PROLONGATION_DEMANDE_OUVERTE_JOURS')).toBeUndefined();
    expect(VARIABLES['PROLONGATION_DEMANDE_OUVERTE_JOURS']).toBeUndefined();
    expect(GABARIT).not.toContain('PROLONGATION_DEMANDE_OUVERTE_JOURS');
  });

  it('REQ-EXT-020 : l’ancienne phrase, le seul devis en cours, a disparu', () => {
    expect(ART_3_4).not.toContain(
      "Lorsqu'un devis est en cours au terme de la période, l'attribution est prolongée de trois mois"
    );
  });
});
