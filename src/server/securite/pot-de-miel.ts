/**
 * Le pot de miel observable. (SEC-10, REQ-SEC-035)
 *
 * Trois primitives, et ce qu'elles garantissent :
 *   — le signalement ne porte JAMAIS la valeur saisie, ni un extrait, ni sa longueur : il est
 *     reconstruit champ par champ depuis une liste fermée, quoi que l'appelant lui passe ;
 *   — l'accusé n'est émis que si la ligne existe, relue AVANT l'envoi ;
 *   — le chemin qui travaille et celui qui ne travaille pas répondent au même plancher de durée,
 *     et un dépassement du plancher est RAPPORTÉ, pas tu : c'est une différence observable.
 *
 * Le puits de phase 0 est une ligne JSON sur la sortie d'erreur ; la table des anomalies n'existe
 * pas encore, et ce module ne la simule pas.
 */

/** Le verdict sur le champ. Aucune autre heuristique ne vit dans ce dépôt. */
export function evaluerPotDeMiel(valeurDuChamp: string | null | undefined): { piege: boolean } {
  return { piege: valeurDuChamp !== null && valeurDuChamp !== undefined && valeurDuChamp !== '' };
}

/**
 * Les formulaires qui portent un pot de miel : une union FERMÉE. Un formulaire inconnu ne compile
 * pas, et un cast qui en ferait passer un est refusé au signalement.
 */
export const FORMULAIRES_A_POT_DE_MIEL = ['connexion', 'depot'] as const;
export type FormulaireAPotDeMiel = (typeof FORMULAIRES_A_POT_DE_MIEL)[number];

export interface SignalDePotDeMiel {
  readonly formulaire: FormulaireAPotDeMiel;
  readonly apporteurId?: string;
  readonly adresseHash?: string;
  readonly survenuAt: number;
}

export type PuitsDePotDeMiel = (ligne: string) => void;

export const puitsSurStderr: PuitsDePotDeMiel = (ligne) => {
  process.stderr.write(`${ligne}\n`);
};

/**
 * La charge est RECONSTRUITE depuis ses seuls champs admis : un objet plus large, passé par une
 * variable d'un type élargi, ne fait rien sortir de plus.
 */
export function signalerPotDeMiel(
  signal: SignalDePotDeMiel,
  puits: PuitsDePotDeMiel = puitsSurStderr
): void {
  if (!(FORMULAIRES_A_POT_DE_MIEL as readonly string[]).includes(signal.formulaire)) {
    throw new Error('formulaire_inconnu : le pot de miel ne signale que ses formulaires déclarés');
  }
  const charge: Record<string, string> = {
    evenement: 'pot_de_miel',
    formulaire: signal.formulaire,
    survenuAt: new Date(signal.survenuAt).toISOString(),
  };
  if (signal.apporteurId !== undefined) charge.apporteurId = signal.apporteurId;
  if (signal.adresseHash !== undefined) charge.adresseHash = signal.adresseHash;
  puits(JSON.stringify(charge));
}

/** L'horloge est injectée : ce module ne lit ni n'attend aucune heure par lui-même. */
export interface HorlogeDePlancher {
  maintenantMs(): number;
  attendre(ms: number): Promise<void>;
}

export interface ReponseAuPlancher<T> {
  readonly valeur: T;
  /** Le travail a duré plus que le plancher : la réponse s'en distingue, et c'est dit. */
  readonly depasse: boolean;
}

/**
 * Exécute le travail, puis attend jusqu'au plancher. Le chemin qui ne travaille pas passe un
 * travail vide et répond au même instant. Un travail qui lève attend aussi le plancher avant de
 * relever : l'échec ne répond pas plus tôt que le succès.
 */
export async function executerAuPlancher<T>(
  plancherMs: number,
  travail: () => Promise<T>,
  horloge: HorlogeDePlancher
): Promise<ReponseAuPlancher<T>> {
  const debut = horloge.maintenantMs();
  const atteindreLePlancher = async (): Promise<boolean> => {
    const ecoule = horloge.maintenantMs() - debut;
    if (ecoule < plancherMs) await horloge.attendre(plancherMs - ecoule);
    return ecoule > plancherMs;
  };
  let valeur: T;
  try {
    valeur = await travail();
  } catch (erreur) {
    await atteindreLePlancher();
    throw erreur;
  }
  const depasse = await atteindreLePlancher();
  return { valeur, depasse };
}

/** Relit la ligne AVANT d'accuser ; absente, rien n'est envoyé. */
export async function accuserSiLaLigneExiste<L>(
  id: string,
  lire: (id: string) => Promise<L | null>,
  envoyer: (ligne: L) => Promise<void>
): Promise<{ envoye: boolean }> {
  const ligne = await lire(id);
  if (ligne === null) return { envoye: false };
  await envoyer(ligne);
  return { envoye: true };
}
