/**
 * Le lexique UNIQUE des noms de champ qui désignent une donnée personnelle — DM-01 (REQ-DM-041).
 *
 * UN SEUL LEXIQUE DANS LE DÉPÔT (RM-01). La garde du journal (`journal:sans-pii`) l'importe ; toute
 * autre garde qui doit reconnaître un champ de personne — dans le schéma, dans un contrat —
 * l'importe aussi, au lieu d'en écrire un second qui divergerait du premier à la première entrée.
 *
 * CE QU'IL EST, ET CE QU'IL N'EST PAS. Il RECONNAÎT ; il ne décide pas. Aucune politique ici : que
 * l'empreinte d'une adresse IP soit admise dans une charge est la règle du journal, qu'une colonne de
 * personne soit chiffrée est la règle du schéma. Chacune vit dans sa garde.
 *
 * SEGMENTS EXACTS, JAMAIS SOUS-CHAÎNES. `nombreDeDepots`, `nomenclature`, `hotel` ne portent aucun
 * segment de personne, et une recherche par sous-chaîne les accuserait tous (`nom`, `tel`). Un nom
 * se découpe en camelCase, en snake_case, en kebab-case et sur les sigles (`IPAddress` → `ip`,
 * `address`), pour lire aussi bien le champ TypeScript que sa colonne `@map`.
 *
 * Domaine pur : aucune I/O.
 */

export type CategoriePersonnelle = 'identite' | 'contact' | 'bancaire' | 'reseau' | 'postal';

export type EntreeLexique = { segment: string; categorie: CategoriePersonnelle };

/** Les catégories de REQ-DM-041 : « jamais nom, e-mail, téléphone, IBAN, adresse » — et l'IP. */
export const LEXIQUE_CHAMPS_PERSONNELS: readonly EntreeLexique[] = [
  { segment: 'nom', categorie: 'identite' },
  { segment: 'prenom', categorie: 'identite' },
  { segment: 'name', categorie: 'identite' },
  { segment: 'email', categorie: 'contact' },
  { segment: 'courriel', categorie: 'contact' },
  { segment: 'mail', categorie: 'contact' },
  { segment: 'telephone', categorie: 'contact' },
  { segment: 'tel', categorie: 'contact' },
  { segment: 'phone', categorie: 'contact' },
  { segment: 'mobile', categorie: 'contact' },
  { segment: 'portable', categorie: 'contact' },
  { segment: 'iban', categorie: 'bancaire' },
  { segment: 'bic', categorie: 'bancaire' },
  { segment: 'rib', categorie: 'bancaire' },
  { segment: 'ip', categorie: 'reseau' },
  { segment: 'adresse', categorie: 'postal' },
  { segment: 'address', categorie: 'postal' },
  { segment: 'rue', categorie: 'postal' },
  { segment: 'ville', categorie: 'postal' },
  { segment: 'postal', categorie: 'postal' },
];

const PAR_SEGMENT = new Map(LEXIQUE_CHAMPS_PERSONNELS.map((e) => [e.segment, e]));

/**
 * Les segments d'un nom, en minuscules : `nomContact` → `nom`, `contact` ; `telephone_mobile` →
 * `telephone`, `mobile` ; `IPAddress` → `ip`, `address`.
 */
export function segmentsDuNom(nom: string): string[] {
  return nom
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((s) => s.length > 0)
    .map((s) => s.toLowerCase());
}

/** Les entrées du lexique que porte un nom, dans l'ordre de ses segments. */
export function segmentsPersonnels(nom: string): EntreeLexique[] {
  return segmentsDuNom(nom).flatMap((s) => {
    const e = PAR_SEGMENT.get(s);
    return e ? [e] : [];
  });
}
