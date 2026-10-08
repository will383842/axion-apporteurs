/**
 * « Vérifier une entreprise » (SEC-16, REQ-SEC-021, REQ-UX-007, REQ-JUR-011) — le service, sur ses
 * ports. Seul l'appelant authentifié l'atteint : le porteur vient de la session, jamais de la requête.
 *
 * L'ORDRE. Le SIREN est lu strictement ; les deux compteurs (identité, empreinte d'adresse) sont
 * consultés ; le registre public l'est ensuite, et son silence refuse (`registre_indisponible`) ;
 * puis TOUS les autres faits sont lus, quelle que soit la cause — le travail, donc le délai, ne
 * dépend pas de la réponse ; la vérification est journalisée ; l'état seul est rendu.
 *
 * ÉCHEC FERMÉ SUR LES LIMITES (rattrapage 96, SEC-72). Les plafonds sont hors dépôt, dans un secret
 * (`compterAuRegistre`) : absents ou illisibles, chaque compteur REFUSE la vérification.
 * « Aucun chiffre » ne devient jamais « pas de limite ». Le refus est le même pour les trois fenêtres ;
 * il n'écrit rien et n'est lu par aucune décision. Le DÉPÔT ne passe jamais par ce service. Les noms des compteurs ne s'écrivent qu'au
 * registre (garde `securite:rate-famille`) : ce service ne demande que QUOI compter. Une adresse
 * sans empreinte ne se compte pas : refusée aussi.
 *
 * Ce service n'envoie aucun e-mail et ne crée aucune demande de confirmation (W20) : il n'en a pas
 * le port. Seul un dépôt en crée une.
 */
import type { SujetDeCompteur } from '../securite/rate-limit';
import {
  causeDuJournal,
  dejaDeclareeParLePasse,
  etatDeVerification,
  type CauseDeVerification,
  type EtatDeLEntreprise,
  type EtatVerification,
} from '../../domain/verification/etats';

/** Ce que REQ-SEC-021 compte : l'identité de session, et l'empreinte de l'adresse réseau. */
export const SUJETS_COMPTES = ['identite', 'ip'] as const;
export type SujetCompte = (typeof SUJETS_COMPTES)[number];

const FORME_SIREN = /^[0-9]{9}$/;

export type Porteur = { apporteurId: string } | { utilisateurConsoleId: string };

export type DemandeDeVerification = {
  porteur: Porteur;
  siren: string;
  /** L'empreinte de l'identité de session. */
  sujetIdentite: SujetDeCompteur;
  /** L'empreinte de l'adresse réseau ; `null` si l'adresse manque. */
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
  compter: (quoi: SujetCompte, sujet: SujetDeCompteur) => Promise<{ autorise: boolean }>;
  anteriorite: (siren: string) => Promise<boolean>;
  surLaListe: (siren: string) => Promise<boolean>;
  /**
   * L'état de l'entreprise au registre public, consulté à CHAQUE vérification. `indisponible` :
   * panne, disjoncteur ouvert, débit, ou réponse sans état lisible.
   */
  entreprise: (siren: string) => Promise<EtatDeLEntreprise | 'indisponible'>;
  occupation: (siren: string) => Promise<{ occupee: boolean; enFile: number }>;
  /**
   * EXT-T06 : la fin de la DERNIÈRE attribution terminée sur le SIREN, par le lecteur réservé du
   * journal ; `null` si aucune, ou si elle est illisible (échec fermé : aucun signal).
   */
  derniereFin: (siren: string) => Promise<Date | null>;
  maintenant: () => Date;
  journaliser: (ligne: LigneDuJournal) => Promise<void>;
};

export type ResultatDeVerification =
  /**
   * EXT-T06 (REQ-EXT-006, condition 1 de la sécurité) : `dejaDeclaree` est TOUJOURS présent, à la même
   * place, vrai ou faux : la forme de la réponse ne dit rien. Il n'est vrai que pour `libre`, et pour
   * un apporteur ; jamais pour la console.
   */
  | { ok: true; dto: { etat: EtatVerification; dejaDeclaree: boolean } }
  | { ok: false; refus: 'siren_invalide' | 'limite' | 'registre_indisponible' };

const REFUS_LIMITE = { ok: false, refus: 'limite' } as const;

/** Vérifie une entreprise. */
export async function verifierUneEntreprise(
  ports: PortsDeVerification,
  demande: DemandeDeVerification
): Promise<ResultatDeVerification> {
  const { siren } = demande;
  if (!FORME_SIREN.test(siren)) return { ok: false, refus: 'siren_invalide' };

  if (!(await ports.compter('identite', demande.sujetIdentite)).autorise) return REFUS_LIMITE;
  if (demande.sujetIp === null) return REFUS_LIMITE;
  if (!(await ports.compter('ip', demande.sujetIp)).autorise) return REFUS_LIMITE;

  // Le registre public d'abord, à chaque vérification. Muet, il fait refuser AVANT toute autre
  // lecture, quel que soit l'état interne : le refus ne dit rien de l'entreprise, et il a déjà été
  // compté au débit (aucune sonde gratuite pendant une panne). Rien n'est mis en cache ici.
  const entreprise = await ports.entreprise(siren);
  if (entreprise === 'indisponible') return { ok: false, refus: 'registre_indisponible' };
  // Puis tous les faits, toujours : aucune cause ne s'arrête plus tôt qu'une autre.
  // La dernière fin aussi, TOUJOURS, dans la même lecture : le délai ne dépend pas du signal.
  const [anteriorite, surLaListe, occupation, derniereFin] = await Promise.all([
    ports.anteriorite(siren),
    ports.surLaListe(siren),
    ports.occupation(siren),
    ports.derniereFin(siren).catch(() => null),
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
  // Le signal n'est ni journalisé ni stocké : il se dérive ici, et seulement pour un apporteur.
  const dejaDeclaree =
    'apporteurId' in demande.porteur &&
    dejaDeclareeParLePasse(faits, derniereFin?.getTime() ?? null, ports.maintenant().getTime());
  return { ok: true, dto: { etat: etatDeVerification(faits), dejaDeclaree } };
}
