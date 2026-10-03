// @req REQ-JUR-025
/**
 * JUR-T36 (REQ-JUR-025) — la politique de confidentialité PUBLIQUE ne montre ni les questions
 * internes du registre de l'article 30, ni un nom de personne, ni un mot que le lexique de l'espace
 * refuse.
 *
 * CE QUE CE FICHIER GARDE :
 *   1. TÉMOIN : un registre qui porte une question interne, le prénom de l'arbitre et le mot
 *      « attribution » produit une page qui n'en montre AUCUN — et la lecture nomme chaque filtre ;
 *   2. une rubrique encore à compléter reste annoncée, en cours de rédaction, sans sa question ;
 *   3. le registre RÉEL produit une page sans question, sans nom et sans mot interdit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MARQUE_A_COMPLETER,
  extrairePolitique,
  type LecturePolitique,
} from '../../../src/domain/rgpd/politique';
import { famillesPourPortee } from '../../../src/domain/lexique/lexique-interdit';

const REGISTRE = readFileSync('docs/rgpd/registre-article-30.md', 'utf8');

/** Le registre réel, une rubrique de TRT-APPORTEURS remplacée. */
function avecRubrique(nom: string, contenu: string): string {
  const lignes = REGISTRE.split('\n');
  const i = lignes.findIndex((l) => l.startsWith(`| ${nom} |`));
  if (i < 0) throw new Error(`rubrique ${nom} introuvable`);
  const cellules = lignes[i]!.split('|');
  cellules[2] = ` ${contenu} `;
  lignes[i] = cellules.join('|');
  return lignes.join('\n');
}

const FIXTURE = avecRubrique(
  'Finalité',
  `Exécuter le contrat — déclaration des entreprises et attribution. ${MARQUE_A_COMPLETER} Question : Will valide-t-il cette finalité ?`
);

const lue = (registre: string): Extract<LecturePolitique, { ok: true }> => {
  const l = extrairePolitique(registre);
  if (!l.ok) throw new Error(`registre refusé : ${l.refus}`);
  return l;
};

/** Ce que la page reçoit, à plat : le seul texte que l'écran peut afficher. */
const lisible = (l: Extract<LecturePolitique, { ok: true }>): string =>
  JSON.stringify(l.politique);

const FORMES = famillesPourPortee('apporteur').flatMap((f) => f.formes);
const motInterdit = (texte: string): string | undefined =>
  FORMES.find((f) => new RegExp(`(?<![\\p{L}])${f}(?![\\p{L}])`, 'iu').test(texte));

describe('REQ-JUR-025 — la politique publique ne porte aucune note interne', () => {
  it('REQ-JUR-025 : TÉMOIN — question interne, prénom de l’arbitre et mot interdit : la page n’en montre aucun, et chaque filtre est nommé', () => {
    const l = lue(FIXTURE);
    const page = lisible(l);
    expect(page).not.toMatch(/Question/);
    expect(page).not.toMatch(/\bWill\b/);
    expect(page).not.toMatch(/attribution/i);
    expect(l.filtres).toEqual([
      { ou: 'finalite', motif: 'question_interne' },
      { ou: 'finalite', motif: 'lexique_interdit', detail: 'attribution' },
    ]);
  });

  it('REQ-JUR-025 : la rubrique encore à compléter reste annoncée, sans sa question', () => {
    const finalite = lue(FIXTURE).politique.rubriques.find((r) => r.cle === 'finalite');
    expect(finalite?.contenu).toEqual([{ type: 'a_completer' }, { type: 'a_completer' }]);
  });

  it('REQ-JUR-025 : TÉMOIN — un nom de personne dans une note du registre sort de la page, nommé', () => {
    const l = lue(avecRubrique('Destinataires', 'Les équipes de la Société, à confirmer par Will.'));
    expect(lisible(l)).not.toMatch(/\bWill\b/);
    expect(l.filtres).toContainEqual({ ou: 'destinataires', motif: 'nom_de_personne' });
  });

  it('REQ-JUR-025 : le registre RÉEL donne une page sans question, sans nom de personne et sans mot interdit', () => {
    const page = lisible(lue(REGISTRE));
    expect(page).not.toMatch(/Question/);
    expect(page).not.toMatch(/\bWill\b/);
    expect(motInterdit(page)).toBeUndefined();
  });
});
