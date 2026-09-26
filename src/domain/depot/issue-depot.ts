/**
 * `IssueDepot` — l'issue d'un dépôt telle que l'apporteur la voit (REQ-UX-002).
 *
 * LA SOURCE, ET CE QUI LA TIENT. REQ-UX-002 aligne cet enum « un pour un sur les catégories des
 * articles 3.3 et 3.3 bis » du contrat et en écrit les douze valeurs. `docs/GLOSSAIRE.md` §4 en
 * porte encore une version antérieure (`fermee`, `financeur`, `deja_connue`) : `docs/PRESEANCE.md`
 * §5.7 tranche, l'exigence prime. `src/domain/**` est pur — aucune lecture du registre ici — et la
 * constante est donc écrite UNE fois ; la garde `scripts/gates/ux-exhaustivite.ts` la relit contre
 * le texte de REQ-UX-002 à chaque exécution, dans les deux sens : une valeur sans base
 * contractuelle rougit, une catégorie du contrat sans valeur rougit (RM-01, copie TENUE).
 *
 * CE QUE CE FICHIER NE PORTE PAS : un seul mot vu par l'apporteur. Les textes vivent dans
 * `src/content/micro-copy/espace/issues-depot.ts` et nulle part ailleurs.
 */

export const ISSUES_DEPOT = [
  'enregistree',
  'prioritaire',
  'en_attente',
  'file_complete',
  'anteriorite_client',
  'anteriorite_devis',
  'etablissement_cesse',
  'entreprise_hors_perimetre',
  'opposition_demarchage',
  'gele',
  'captcha',
  'brouillon_hors_ligne',
] as const;

/** L'issue d'un dépôt — dérivée de la constante, jamais retapée. */
export type IssueDepot = (typeof ISSUES_DEPOT)[number];

/**
 * Ce que l'issue dit de l'HORODATAGE — REQ-UX-002 exige que le texte dise « explicitement si le
 * dépôt est horodaté à son nom ». Trois cas, pas deux : le brouillon hors ligne n'est horodaté
 * qu'à la réception par le serveur (REQ-UX-013, HYP-E1-12), et le dire autrement promettrait une
 * heure que l'apporteur n'a pas.
 */
export const HORODATAGES = ['a_votre_nom', 'rien_a_votre_nom', 'a_la_reception'] as const;
export type Horodatage = (typeof HORODATAGES)[number];

/**
 * L'horodatage de chaque issue. `captcha` est rangé à « rien à votre nom » : tant que la
 * vérification n'est pas passée, dire « enregistré à votre nom » annoncerait un droit que le
 * serveur n'a pas encore posé — c'est l'option qui ne promet rien (question ouverte : HYP-E1-11
 * dit le dépôt « accepté, horodaté et opposable » sans dire À QUEL MOMENT il l'est).
 */
export const HORODATAGE_DE_L_ISSUE = {
  enregistree: 'a_votre_nom',
  prioritaire: 'a_votre_nom',
  en_attente: 'a_votre_nom',
  file_complete: 'rien_a_votre_nom',
  anteriorite_client: 'rien_a_votre_nom',
  anteriorite_devis: 'rien_a_votre_nom',
  etablissement_cesse: 'rien_a_votre_nom',
  entreprise_hors_perimetre: 'rien_a_votre_nom',
  opposition_demarchage: 'rien_a_votre_nom',
  gele: 'rien_a_votre_nom',
  captcha: 'rien_a_votre_nom',
  brouillon_hors_ligne: 'a_la_reception',
} as const satisfies { readonly [I in IssueDepot]: Horodatage };

/**
 * Les issues qui sont un REFUS DE CATÉGORIE : exactement les valeurs communes à `IssueDepot` et à
 * `MotifRefusDepot` (REQ-SEC-022). Chacune est notifiée avec sa catégorie, sans qui ni quand, dit
 * n'emporter aucune autre conséquence, et porte le lien de contestation écrite (REQ-DM-043). La
 * garde relit REQ-SEC-022 et refuse toute divergence.
 *
 * `gele` n'y est pas : c'est une suspension le temps d'un échange (REQ-JUR-031), pas un refus de
 * catégorie, et la maquette validée ne lui donne pas le lien de contestation (question ouverte :
 * REQ-DM-043 rend « tout refus de dépôt » contestable par écrit).
 */
export const ISSUES_DE_REFUS = [
  'file_complete',
  'anteriorite_client',
  'anteriorite_devis',
  'etablissement_cesse',
  'entreprise_hors_perimetre',
  'opposition_demarchage',
] as const satisfies readonly IssueDepot[];

/** Vrai si l'issue est un refus de catégorie (REQ-SEC-022). */
export function estUnRefus(issue: IssueDepot): boolean {
  return (ISSUES_DE_REFUS as readonly IssueDepot[]).includes(issue);
}
