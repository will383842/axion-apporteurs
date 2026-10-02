/**
 * Le rendu de l'e-mail au contact (W20 : REQ-UX-061, REQ-JUR-060, HYP-W20-CONTEXTE) — fonctions PURES,
 * sans envoi ni journal ni lecture du contrat : l'émetteur (INT-T40) fournit les valeurs, ces
 * fonctions rendent l'objet, la version texte et la version HTML. Les textes viennent tous de la SSOT
 * de micro-copy (`src/content/micro-copy/courriels/confirmation-contact.ts`) ; aucun n'est écrit ici.
 *
 * LA LIGNE DE CONTEXTE est la seule saisie libre de l'apporteur reprise dans un e-mail signé
 * Axion-IA : un risque d'hameçonnage. Conditions de la lentille sécurité (2026-10-02), chacune tenue
 * ici et témoignée :
 *   (a) longueur BORNÉE par `CONTEXTE_DEPOT_CARACTERES_MAX` (SSOT) ;
 *   (b) ce qui peut devenir un lien (adresse web, « www. », nom de domaine, adresse de courriel) est
 *       REFUSÉ à la saisie (`fauteDuContexte`) et NEUTRALISÉ au rendu (`contexteRendu`) ;
 *   (c) les caractères de contrôle et de direction (dont U+202E) sont retirés, les retours à la ligne
 *       réduits ;
 *   (d) l'e-mail porte TROIS liens au plus, en comptant ceux qu'un client de messagerie FABRIQUE à
 *       partir du texte en clair (`liensDuTexte`).
 * Vide, la ligne de contexte est ABSENTE : ni ligne vide, ni libellé seul.
 */
import { CONTEXTE_DEPOT_CARACTERES_MAX } from '../seuils/ssot';
import {
  COURRIEL_DE_CONFIRMATION,
  INFORMATION_ARTICLE_14,
  LIEN_OPPOSITION,
  ORDRE_DU_COURRIEL,
  ORDRE_INFORMATION_ARTICLE_14,
} from '../../content/micro-copy/courriels/confirmation-contact';

/** Les valeurs que l'émetteur fournit : chaque `{nom}` des textes, et les trois adresses des liens. */
export type ValeursDuCourriel = Readonly<Record<string, string>> & {
  readonly lienOui: string;
  readonly lienNon: string;
  readonly lienOpposition: string;
};

export type CourrielRendu = { objet: string; texte: string; html: string };

/** Ce qu'un client de messagerie transforme en lien : adresse web, « www. », domaine, courriel. */
const RESSEMBLE_A_UN_LIEN =
  /\b(?:[a-z][a-z0-9+.-]*:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?)/gi;

/** Contrôle (\p{Cc}) et format (\p{Cf}, dont les marques de direction et les espaces nulles). */
const CONTROLE_OU_FORMAT = /[\p{Cc}\p{Cf}]/gu;

/** Une saisie de contexte refusée, nommée ; `null` si elle est admise (vide compris). */
export function fauteDuContexte(saisie: string): 'trop_long' | 'ressemble_a_un_lien' | null {
  if ([...saisie].length > CONTEXTE_DEPOT_CARACTERES_MAX.valeur) return 'trop_long';
  RESSEMBLE_A_UN_LIEN.lastIndex = 0;
  if (RESSEMBLE_A_UN_LIEN.test(saisie)) return 'ressemble_a_un_lien';
  return null;
}

/**
 * Le contexte tel que l'e-mail le rend : retours à la ligne et blancs réduits à une espace, contrôle et
 * format retirés, tout lien désamorcé (« exemple[.]com », « nom[@]domaine »), borné. Vide → `''`.
 */
export function contexteRendu(saisie: string): string {
  // Les retours à la ligne (dont U+2028 et U+2029) sont des blancs : `\s` les réduit à une espace,
  // AVANT que le contrôle et le format ne soient retirés, pour qu'aucun mot ne se colle au suivant.
  const aplati = saisie
    .replace(/\s+/g, ' ')
    .replace(CONTROLE_OU_FORMAT, '')
    .replace(/\s+/g, ' ')
    .trim();
  const desamorce = aplati.replace(RESSEMBLE_A_UN_LIEN, (lien) =>
    lien.replace(/:\/\//g, '[://]').replace(/\./g, '[.]').replace(/@/g, '[@]')
  );
  return [...desamorce].slice(0, CONTEXTE_DEPOT_CARACTERES_MAX.valeur).join('').trim();
}

/** Les liens qu'un client de messagerie verrait dans un texte en clair. */
export function liensDuTexte(texte: string): string[] {
  return [...texte.matchAll(RESSEMBLE_A_UN_LIEN)].map((m) => m[0]);
}

const PARAMETRE = /\{([a-zA-Z]+)\}/g;

function remplir(gabarit: string, valeurs: Readonly<Record<string, string>>): string {
  return gabarit.replace(PARAMETRE, (_, nom: string) => {
    const v = valeurs[nom];
    if (v === undefined) throw new Error(`valeur_manquante : {${nom}}`);
    return v;
  });
}

/** Échappe un texte pour le HTML : aucune valeur ne devient une balise ni un attribut. */
export function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * L'e-mail rendu. Le contexte fourni est passé par `contexteRendu` ; sa ligne disparaît s'il est vide.
 * Les trois liens sont les SEULS liens : les deux réponses et l'opposition.
 */
export function rendreLeCourriel(valeurs: ValeursDuCourriel): CourrielRendu {
  const contexte = contexteRendu(valeurs['contexte'] ?? '');
  const v: Readonly<Record<string, string>> = { ...valeurs, contexte };
  const lignes: { texte: string; lien?: string }[] = [];
  for (const cle of ORDRE_DU_COURRIEL) {
    if (cle === 'contexte' && contexte === '') continue;
    const texte = remplir(COURRIEL_DE_CONFIRMATION[cle], v);
    const lien = cle === 'oui' ? valeurs.lienOui : cle === 'non' ? valeurs.lienNon : undefined;
    lignes.push(lien === undefined ? { texte } : { texte, lien });
  }
  for (const cle of ORDRE_INFORMATION_ARTICLE_14)
    lignes.push({ texte: remplir(INFORMATION_ARTICLE_14[cle], v) });
  lignes.push({ texte: LIEN_OPPOSITION.libelle, lien: valeurs.lienOpposition });
  lignes.push({ texte: remplir(COURRIEL_DE_CONFIRMATION.signature, v) });

  const texte = lignes.map((l) => (l.lien ? `${l.texte} : ${l.lien}` : l.texte)).join('\n\n');
  const html = lignes
    .map((l) =>
      l.lien
        ? `<p><a href="${echapperHtml(l.lien)}">${echapperHtml(l.texte)}</a></p>`
        : `<p>${echapperHtml(l.texte)}</p>`
    )
    .join('\n');
  return { objet: remplir(COURRIEL_DE_CONFIRMATION.objet, v), texte, html };
}
