/**
 * `publication.ts` — le REFUS de publier un gabarit incomplet (REQ-JUR-003 : « un gabarit
 * incomplet ne peut pas être publié »). C'est la défense à l'exécution : la génération d'un contrat
 * pour signature (INT-T12) l'appelle, et elle vaut là où les gardes du dépôt se taisent —
 * sur le texte RENDU, avec les valeurs du jour.
 *
 * Elle refuse, en nommant chaque motif :
 *   — tant qu'une question pour Will reste ouverte (`QUESTIONS_POUR_WILL`) ;
 *   — si un identifiant de la table de correspondance n'est pas posé, si un identifiant posé n'y
 *     figure pas, ou si une clause retirée est posée ;
 *   — si une variable reste sans valeur une fois le texte rendu ;
 *   — si une cellule de l'annexe 1 rendue nomme un forfait, un barème ou un pourcentage sans chiffre.
 *
 * PUR : tout arrive en argument, sans valeur par défaut (RM-11).
 */
import {
  CLAUSES_RETIREES,
  clausesPosees,
  rendre,
  tableDeCorrespondance,
  texteRemis,
  variablesDuTexte,
} from './gabarit';
import { fautesGrilleChiffree } from './grille-chiffree';

export type EntreePublication = {
  readonly gabarit: string;
  readonly annexe2: string;
  readonly valeurs: Readonly<Record<string, string>>;
  readonly questionsOuvertes: readonly { readonly id: string }[];
};

export class GabaritNonPubliable extends Error {
  constructor(readonly motifs: readonly string[]) {
    super(`Gabarit de contrat non publiable :\n  - ${motifs.join('\n  - ')}`);
    this.name = 'GabaritNonPubliable';
  }
}

export function motifsDeRefus(e: EntreePublication): string[] {
  const motifs: string[] = [];
  if (e.questionsOuvertes.length > 0) {
    motifs.push(
      `${e.questionsOuvertes.length} question(s) ouverte(s) : ${e.questionsOuvertes.map((q) => q.id).join(', ')}`
    );
  }
  const table = tableDeCorrespondance(e.gabarit).map((l) => l.id);
  const posees = clausesPosees(e.gabarit).map((c) => c.id);
  if (table.length === 0) motifs.push('table de correspondance des clauses absente');
  for (const id of table) if (!posees.includes(id)) motifs.push(`clause ${id} non posée`);
  for (const id of posees) {
    if ((CLAUSES_RETIREES as readonly string[]).includes(id))
      motifs.push(`clause retirée ${id} posée`);
    else if (!table.includes(id)) motifs.push(`clause ${id} absente de la table de correspondance`);
  }
  const rendu = rendre(`${texteRemis(e.gabarit)}\n${e.annexe2}`, e.valeurs);
  for (const nom of variablesDuTexte(rendu)) motifs.push(`variable non résolue {{${nom}}}`);
  for (const f of fautesGrilleChiffree(rendu)) motifs.push(f.message);
  return motifs;
}

export function exigerGabaritPubliable(e: EntreePublication): void {
  const motifs = motifsDeRefus(e);
  if (motifs.length > 0) throw new GabaritNonPubliable(motifs);
}
