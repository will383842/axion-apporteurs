/**
 * SEC-59 (REQ-SEC-058) — la SÉRIALISATION des lignes du journal des accès à la console, avant
 * l'empreinte du résumé quotidien. Elle est FIXÉE ici, par une seule fonction, et un VECTEUR figé
 * (`tests/unit/domaine/resume-journal-acces.spec.ts`) la garde : changer un octet change toutes les
 * empreintes déjà écrites au journal chaîné, qui ne se réécrit pas.
 *
 * La forme (A02, rattrapage 104) :
 *   — une ligne = ses colonnes dans l'ordre, séparées par une TABULATION, puis un saut de ligne ;
 *   — NULL s'écrit `\N` ;
 *   — une date s'écrit en ISO 8601 UTC, à la milliseconde ;
 *   — les lignes sont triées par (`survenu_at`, `id`), l'instant d'abord, puis l'identifiant en ordre
 *     d'octets (un UUID est en minuscules, à tirets) ;
 *   — un jour sans ligne donne le texte vide, donc l'empreinte de la chaîne vide.
 *
 * Deux jeux de colonnes : les lignes COMPLÈTES (`id`, `nature`, `survenu_at`, `utilisateur_console_id`,
 * `cible_id`, `ip_hash`), vérifiables jusqu'à la purge, et les seules colonnes qui SURVIVENT à la
 * purge (`id`, `nature`, `survenu_at`), vérifiables pour toujours.
 */
import { createHash } from 'node:crypto';

/** Une ligne du journal des accès, telle que la tâche la lit : les colonnes hachées, rien d'autre. */
export interface LigneDuJournalDesAcces {
  id: string;
  nature: string;
  survenuAt: Date;
  utilisateurConsoleId: string | null;
  cibleId: string | null;
  ipHash: string | null;
}

export type JeuDeColonnes = 'complete' | 'survivante';

/** Le marqueur de NULL dans le texte. */
const NUL = '\\N';

const comparer = (a: LigneDuJournalDesAcces, b: LigneDuJournalDesAcces): number => {
  const t = a.survenuAt.getTime() - b.survenuAt.getTime();
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Le texte d'une ligne : ses colonnes, tabulées, puis un saut de ligne. */
function texteDeLaLigne(l: LigneDuJournalDesAcces, jeu: JeuDeColonnes): string {
  const survivantes = [l.id, l.nature, l.survenuAt.toISOString()];
  const colonnes =
    jeu === 'survivante'
      ? survivantes
      : [...survivantes, l.utilisateurConsoleId ?? NUL, l.cibleId ?? NUL, l.ipHash ?? NUL];
  return `${colonnes.join('\t')}\n`;
}

/** Le texte des lignes, triées par (survenu_at, id) : la fonction ne modifie pas le tableau reçu. */
export function serialiserLesLignes(
  lignes: readonly LigneDuJournalDesAcces[],
  jeu: JeuDeColonnes
): string {
  return [...lignes]
    .sort(comparer)
    .map((l) => texteDeLaLigne(l, jeu))
    .join('');
}

const sha256 = (texte: string): string => createHash('sha256').update(texte, 'utf8').digest('hex');

/** Ce qu'un résumé porte d'un jour : le nombre de lignes et les deux empreintes. */
export function empreintesDuJour(lignes: readonly LigneDuJournalDesAcces[]): {
  lignesNombre: number;
  empreinteComplete: string;
  empreinteSurvivante: string;
} {
  return {
    lignesNombre: lignes.length,
    empreinteComplete: sha256(serialiserLesLignes(lignes, 'complete')),
    empreinteSurvivante: sha256(serialiserLesLignes(lignes, 'survivante')),
  };
}
