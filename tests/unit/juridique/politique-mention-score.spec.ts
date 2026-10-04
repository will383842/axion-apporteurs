// @req REQ-JUR-025
/**
 * JUR-T60 — la politique de confidentialité RENDUE depuis le registre (`src/domain/rgpd/politique.ts`)
 * mentionne le score de candidature, sa finalité et l'intervention humaine. Témoin écrit par A05 pour
 * A07, qui n'a pas d'outil d'exécution (charte §6), sur le brief de la juriste.
 *
 * Il juge la politique rendue, pas le seul fichier : une phrase présente au registre mais retenue par
 * la lecture (note interne, nom de personne, mot refusé) n'atteindrait jamais la page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  extrairePolitique,
  segmentsEnCours,
  type Politique,
} from '../../../src/domain/rgpd/politique';
import { CHEMIN_DU_REGISTRE } from '../../../src/server/rgpd/acceptation';

const MENTION =
  " ; éclairer la décision d'admission d'un candidat : un score, calculé à partir des réponses du formulaire de candidature, sert à la seule décision d'admission ; cette décision est prise par une personne de la Société, que le score éclaire sans la prendre ; le score ne repose sur aucune donnée de l'article 9 du RGPD ni sur aucun critère discriminatoire, et il n'est plus jamais utilisé après la décision d'admission";

function rendue(registre: string): Politique {
  const lue = extrairePolitique(registre);
  if (!lue.ok) throw new Error(`registre illisible : ${lue.refus}`);
  return lue.politique;
}

const REGISTRE = readFileSync(CHEMIN_DU_REGISTRE, 'utf8');

/** Le texte rendu de la Finalité, sans les passages en cours de rédaction. */
function finalite(p: Politique): string {
  const r = p.rubriques.find((x) => x.cle === 'finalite');
  if (r === undefined) throw new Error('rubrique Finalité absente de la politique rendue');
  return r.contenu
    .map((s) => (s.type === 'texte' ? s.texte : ''))
    .join(' ')
    .replace(/’/g, "'");
}

describe('REQ-JUR-025 — la politique rendue mentionne le score de candidature', () => {
  it('REQ-JUR-025 : (a) le score de candidature, calculé à partir des réponses du formulaire', () => {
    expect(finalite(rendue(REGISTRE))).toContain(
      'un score, calculé à partir des réponses du formulaire de candidature'
    );
  });

  it('REQ-JUR-025 : (b) sa finalité : la seule décision d’admission', () => {
    expect(finalite(rendue(REGISTRE))).toContain("sert à la seule décision d'admission");
  });

  it('REQ-JUR-025 : (c) l’intervention humaine : une personne de la Société décide, le score éclaire', () => {
    expect(finalite(rendue(REGISTRE))).toContain(
      'prise par une personne de la Société, que le score éclaire sans la prendre'
    );
  });

  it('REQ-JUR-025 : (d) la mention n’ajoute aucun passage « à compléter » — la Finalité n’en porte aucun, et la politique en compte autant sans elle', () => {
    const avec = rendue(REGISTRE);
    const r = avec.rubriques.find((x) => x.cle === 'finalite')!;
    expect(r.contenu.filter((s) => s.type === 'a_completer')).toEqual([]);
    // Le registre SANS la phrase ajoutée : le même compte de passages en cours de rédaction.
    expect(REGISTRE).toContain(MENTION);
    const sans = rendue(REGISTRE.replace(MENTION, ''));
    expect(segmentsEnCours(avec)).toBe(segmentsEnCours(sans));
  });
});
