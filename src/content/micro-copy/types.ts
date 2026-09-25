/**
 * Les formes de la micro-copie — la SOURCE UNIQUE des libellés de l'espace et de la console
 * (UX-P0-01, REQ-UX-002, REQ-UX-019).
 *
 * OÙ VIT UN LIBELLÉ. Sous `src/content/micro-copy/` (ou dans `messages/fr.json`), et nulle part
 * ailleurs : un composant lit la micro-copie, il n'écrit aucun texte. La garde
 * `scripts/gates/ux-exhaustivite.ts` (famille `libelle_en_dur`) le vérifie sur chaque `.tsx`.
 *
 * DEUX DOSSIERS, DEUX PORTÉES. `espace/` est lu par l'apporteur : `gov:lexique` le juge à la
 * portée la plus stricte (REQ-UX-003, REQ-JUR-037). `console/` est lu par Axion-IA
 * seul : il relève de la seule portée du dépôt (REQ-GOV-017). Un texte vu par un apporteur
 * n'a donc rien à faire sous `console/`.
 *
 * LES PARAMÈTRES. Une valeur variable s'écrit `{nom}` (une date, le nom du contact, un seuil) : le
 * texte ne porte jamais la valeur elle-même. Les seuils affichés viennent de leur source unique
 * (RM-10), jamais d'un littéral recopié ici. Un refus ne porte AUCUN paramètre : il ne dit ni qui
 * ni quand (REQ-UX-002, REQ-SEC-022).
 */

/** Une action : son libellé, et la route de `docs/ESPACE-ROUTES.md` où elle mène (`null` : sur place). */
export type ActionEcran = {
  readonly libelle: string;
  readonly route: string | null;
};

/** Le texte d'une issue de dépôt (REQ-UX-002). La mention d'horodatage est DÉRIVÉE, pas écrite ici. */
export type TexteIssue = {
  readonly pastille: string;
  readonly titre: string;
  readonly pourquoi: string;
  readonly quoiFaire: string;
  readonly actionPrincipale: ActionEcran;
  readonly actionSecondaire: ActionEcran | null;
};

/** L'état vide d'un écran (REQ-UX-019) : un titre, une phrase, une action principale. */
export type EtatVide = {
  readonly titre: string;
  readonly phrase: string;
  readonly action: ActionEcran;
};
