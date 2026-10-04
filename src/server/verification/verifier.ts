/**
 * « Vérifier une entreprise » (SEC-16, REQ-SEC-021, REQ-UX-007, REQ-JUR-011) — le service, sur ses
 * ports. Seul l'appelant authentifié l'atteint : le porteur vient de la session, jamais de la requête.
 *
 * L'ORDRE. Le SIREN est lu strictement ; les deux compteurs (identité, empreinte d'adresse) sont
 * consultés ; puis TOUS les faits sont lus, quelle que soit la cause — le travail, donc le délai, ne
 * dépend pas de la réponse ; la vérification est journalisée ; l'état seul est rendu.
 *
 * ÉCHEC FERMÉ SUR LES LIMITES (rattrapage 96). Aucun chiffre n'est posé tant que Williams n'a pas
 * tranché : un compteur `verif:` ABSENT du registre REFUSE la vérification. « Aucun chiffre » ne
 * devient jamais « pas de limite ». Une adresse sans empreinte ne se compte pas : refusée aussi.
 *
 * Ce service n'envoie aucun e-mail et ne crée aucune demande de confirmation (W20) : il n'en a pas
 * le port. Seul un dépôt en crée une.
 */
import { COMPTEURS, type SujetDeCompteur } from '../securite/rate-limit';
import {
  causeDuJournal,
  etatDeVerification,
  type CauseDeVerification,
  type EtatDeLEntreprise,
  type EtatVerification,
} from '../../domain/verification/etats';

/** Les deux compteurs de REQ-SEC-021 : par identité, par empreinte d'adresse. */
export const COMPTEURS_DE_LA_VERIFICATION = ['verif:identite', 'verif:ip'] as const;
export type CompteurDeVerification = (typeof COMPTEURS_DE_LA_VERIFICATION)[number];

const FORME_SIREN = /^[0-9]{9}$/;

export type Porteur = { apporteurId: string } | { utilisateurConsoleId: string };

export type DemandeDeVerification = {
  porteur: Porteur;
  siren: string;
  /** L'empreinte de l'identité de session, sujet de `verif:identite`. */
  sujetIdentite: SujetDeCompteur;
  /** L'empreinte de l'adresse réseau, sujet de `verif:ip` ; `null` si l'adresse manque. */
  sujetIp: SujetDeCompteur | null;
  /** L'empreinte TRONQUÉE de l'adresse, écrite au journal. */
  ipHash: string | null;
};

export type LigneDuJournal = {
  apporteurId: string | null;
  utilisateurConsoleId: string | null;
  siren: string;
  resultat: CauseDeVerification;
  ipHash: string | null;
};

export type PortsDeVerification = {
  limiter: (nom: CompteurDeVerification, sujet: SujetDeCompteur) => Promise<{ autorise: boolean }>;
  anteriorite: (siren: string) => Promise<boolean>;
  surLaListe: (siren: string) => Promise<boolean>;
  entreprise: (siren: string) => Promise<EtatDeLEntreprise>;
  occupation: (siren: string) => Promise<{ occupee: boolean; enFile: number }>;
  journaliser: (ligne: LigneDuJournal) => Promise<void>;
};

export type ResultatDeVerification =
  { ok: true; dto: { etat: EtatVerification } } | { ok: false; refus: 'siren_invalide' | 'limite' };

const REFUS_LIMITE = { ok: false, refus: 'limite' } as const;

/**
 * Vérifie une entreprise. `registre` est celui des compteurs (`COMPTEURS`) ; il n'est passé
 * autrement que par un témoin.
 */
export async function verifierUneEntreprise(
  ports: PortsDeVerification,
  demande: DemandeDeVerification,
  registre: Readonly<Record<string, unknown>> = COMPTEURS
): Promise<ResultatDeVerification> {
  const { siren } = demande;
  if (!FORME_SIREN.test(siren)) return { ok: false, refus: 'siren_invalide' };

  if (!COMPTEURS_DE_LA_VERIFICATION.every((nom) => Object.hasOwn(registre, nom))) {
    return REFUS_LIMITE;
  }
  if (!(await ports.limiter('verif:identite', demande.sujetIdentite)).autorise) return REFUS_LIMITE;
  if (demande.sujetIp === null) return REFUS_LIMITE;
  if (!(await ports.limiter('verif:ip', demande.sujetIp)).autorise) return REFUS_LIMITE;

  // Tous les faits, toujours : aucune cause ne s'arrête plus tôt qu'une autre.
  const [anteriorite, surLaListe, entreprise, occupation] = await Promise.all([
    ports.anteriorite(siren),
    ports.surLaListe(siren),
    ports.entreprise(siren),
    ports.occupation(siren),
  ]);
  const faits = { anteriorite, surLaListe, entreprise, ...occupation };

  await ports.journaliser({
    apporteurId: 'apporteurId' in demande.porteur ? demande.porteur.apporteurId : null,
    utilisateurConsoleId:
      'utilisateurConsoleId' in demande.porteur ? demande.porteur.utilisateurConsoleId : null,
    siren,
    resultat: causeDuJournal(faits),
    ipHash: demande.ipHash,
  });
  return { ok: true, dto: { etat: etatDeVerification(faits) } };
}
