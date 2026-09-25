/**
 * `grille-chiffree.ts` — `jur:grille-chiffree` (JUR-T01) : l'annexe 1 d'un contrat ne dit jamais
 * « forfait », « barème » ou « pourcentage » sans le chiffre qui en fait une contrepartie
 * DÉTERMINÉE. Une cellule « forfait » seule, dans un contrat signé, laisse le prix de la mise en
 * relation à la discrétion de la Société.
 *
 * Deux usages, une seule règle :
 *   — sur le gabarit SOURCE (`scripts/gates/jur-grille-chiffree.ts`), où les montants sont des
 *     variables : aucune cellule n'y porte le mot, la garde est un fil tendu contre le mot retapé ;
 *   — sur le gabarit RENDU (`exigerGabaritPubliable`), où les variables ont pris leur valeur : c'est
 *     là que la règle protège vraiment, au moment où le texte part à la signature.
 *
 * LIMITE. La règle lit des cellules de tableau Markdown ; une contrepartie écrite en prose hors
 * tableau lui échappe, et un chiffre sans rapport (« forfait 2026 ») la satisfait.
 *
 * PUR : le texte arrive en argument.
 */
import { cellulesDeLAnnexe1, sectionAnnexe1 } from './gabarit';

export type FauteDeGrille = {
  readonly famille: 'annexe_absente' | 'mot_sans_valeur';
  readonly message: string;
};

const MOT = /\b(forfait|bar[èe]me|pourcentage)/i;

export function fautesGrilleChiffree(texte: string): FauteDeGrille[] {
  if (sectionAnnexe1(texte) === null) {
    return [
      {
        famille: 'annexe_absente',
        message:
          'Aucune section « ## Annexe 1 » : la garde ne lit rien, et un vert sur rien ne garde rien.',
      },
    ];
  }
  return cellulesDeLAnnexe1(texte)
    .filter((c) => MOT.test(c) && !/\d/.test(c))
    .map((c) => ({
      famille: 'mot_sans_valeur' as const,
      message:
        `Annexe 1 — la cellule « ${c} » nomme ${MOT.exec(c)![1]!.toLowerCase()} sans valeur ` +
        `numérique : la contrepartie doit être déterminée à la signature.`,
    }));
}
