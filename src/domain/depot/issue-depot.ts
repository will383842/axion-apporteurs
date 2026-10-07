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
  // DM-13 (art. 3.4 bis ; juriste, #319 6037169174 ; A02) : un refus SANS ÉCRITURE, hors des refus
  // de catégorie : l'apporteur corrige la date du contact et redépose.
  'nouveau_contact_requis',
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
  nouveau_contact_requis: 'rien_a_votre_nom',
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

// ── la décision d'un dépôt d'apporteur (SEC-12) ─────────────────────────────────────────────────

/**
 * Les places de la file derrière un occupant : deux déclarations au plus (contrat art. 3.3 bis c).
 * La base tient la même borne (CHECK `attributions_rang_attente`, rang 1 ou 2).
 */
export const PLACES_EN_ATTENTE = 2;

/**
 * Les faits d'un dépôt, lus par le serveur SOUS les verrous de la transaction. Aucun ne dit QUI
 * occupe l'entreprise : un apporteur et une prise en charge par la Société ou ses préposés donnent
 * les mêmes faits, donc le même refus. La réserve de l'art. 3.5 al. 4 n'y figure pas : elle n'est
 * pas une occupation et ne fait jamais refuser une déclaration.
 */
export interface FaitsDuDepot {
  readonly apporteurGele: boolean;
  /** Art. 3.3 bis a. */
  readonly etablissementCesse: boolean;
  /** Art. 3.3 (`client`, `devis`) et art. 3.3 bis b (`financeur`, la liste tenue par la Société). */
  readonly anteriorite: 'aucune' | 'client' | 'devis' | 'financeur';
  /** Art. 3.3 bis d. */
  readonly oppositionDemarchage: boolean;
  /**
   * Art. 3.4 bis (DM-13) : la dernière attribution de cet apporteur sur ce SIREN a pris fin par son
   * terme, et la date du contact n'est pas postérieure au jour du terme (`nouveauContactManquant`).
   */
  readonly nouveauContactManquant: boolean;
  /** Une attribution dans un état occupant existe pour ce SIREN. */
  readonly occupee: boolean;
  /** Le nombre de déclarations déjà en attente pour ce SIREN, de 0 à `PLACES_EN_ATTENTE`. */
  readonly enAttente: number;
  readonly verificationPrioritaire: boolean;
}

export type DecisionDeDepot =
  | {
      readonly issue: 'enregistree' | 'prioritaire';
      readonly statut: 'provisoire';
      readonly rangAttente: null;
    }
  | { readonly issue: 'en_attente'; readonly statut: 'en_attente'; readonly rangAttente: 1 | 2 }
  | {
      readonly issue: (typeof ISSUES_DE_REFUS)[number] | 'gele' | 'nouveau_contact_requis';
      readonly statut: null;
      readonly rangAttente: null;
    };

const REFUS = (
  issue: (typeof ISSUES_DE_REFUS)[number] | 'gele' | 'nouveau_contact_requis'
): DecisionDeDepot => ({
  issue,
  statut: null,
  rangAttente: null,
});

const ANTERIORITES = {
  financeur: 'entreprise_hors_perimetre',
  client: 'anteriorite_client',
  devis: 'anteriorite_devis',
} as const;

/** L'issue d'un dépôt d'apporteur, dans l'ordre du contrat ; rien n'est deviné. */
export function deciderDuDepot(f: FaitsDuDepot): DecisionDeDepot {
  if (!Number.isInteger(f.enAttente) || f.enAttente < 0 || f.enAttente > PLACES_EN_ATTENTE) {
    throw new RangeError(
      `enAttente : un entier de 0 à ${PLACES_EN_ATTENTE} attendu, ${f.enAttente} reçu`
    );
  }
  if (f.apporteurGele) return REFUS('gele');
  if (f.etablissementCesse) return REFUS('etablissement_cesse');
  if (f.anteriorite !== 'aucune') return REFUS(ANTERIORITES[f.anteriorite]);
  // Art. 3.4 bis : APRÈS l'antériorité (une entreprise devenue cliente reste refusée par elle), AVANT
  // l'occupation (juriste, 6037169174).
  if (f.nouveauContactManquant) return REFUS('nouveau_contact_requis');
  if (f.oppositionDemarchage) return REFUS('opposition_demarchage');
  if (f.occupee) {
    if (f.enAttente === PLACES_EN_ATTENTE) return REFUS('file_complete');
    return { issue: 'en_attente', statut: 'en_attente', rangAttente: f.enAttente === 0 ? 1 : 2 };
  }
  return {
    issue: f.verificationPrioritaire ? 'prioritaire' : 'enregistree',
    statut: 'provisoire',
    rangAttente: null,
  };
}
