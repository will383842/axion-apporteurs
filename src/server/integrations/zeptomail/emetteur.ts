/**
 * L'émetteur de courriels de Partners — INT-T10 (REQ-INT-022, REQ-INT-023, REQ-UX-016).
 *
 * CHAQUE DEMANDE ÉCRIT SA LIGNE, qu'elle parte ou non, dans `courriels_envoyes` : le gabarit,
 * l'EMPREINTE de l'adresse, le statut, l'instant de la demande et, s'il est parti, l'instant de
 * l'envoi — la date qui fait courir un délai (REQ-UX-016). Ni adresse, ni sujet, ni corps. Dans cet
 * ordre, et chaque retenue est VISIBLE, jamais jetée en silence :
 *   1. la demande est jugée (gabarit de la table des notifications, destinataire unique sans saut de
 *      ligne, sujet sans caractère de contrôle, apporteur uuid) → refus levé AVANT toute écriture :
 *      une demande hors forme est une faute du code appelant, pas un envoi retenu ;
 *   2. l'adresse est SUPPRIMÉE (rebond définitif) → `retenu_adresse_supprimee`, AUCUN appel ;
 *   3. le drapeau DMARC n'est pas vrai → `retenu_dmarc_non_verifie`, AUCUN appel (REQ-INT-022) ;
 *   4. le relais est appelé UNE fois → `envoye`, ou `echec` sous un code fermé.
 *
 * L'EXPÉDITEUR est une adresse HUMAINE du domaine d'envoi du registre de l'entité (W3) : une adresse
 * sans réponse, d'un autre domaine, ou un domaine non renseigné font refuser la CONFIGURATION —
 * l'émetteur ne se construit pas.
 *
 * LE RELAIS EST UN PORT. L'appel réel à l'interface d'envoi du tiers n'est pas livré ici : sa forme
 * attend la lecture de `docs/tiers/zeptomail.md` §2, et le drapeau DMARC reste fermé tant que la
 * fiche ne porte pas le rapport d'agrégation daté. Aucun courriel ne peut donc partir de
 * production, et c'est l'état voulu.
 */
import type { PrismaClient, StatutCourriel } from '@prisma/client';
import { z } from 'zod';
import { estSentinelle } from '../../../config/entite';
import { schemaConfiguration } from '../../../lib/env';
import { schemaGabarit } from '../../notifications/table-ssot';
import { empreinteRecherche, type ClesPii } from '../../securite/pii';

// ── La configuration ────────────────────────────────────────────────────────────────────────────

export const MOTIFS_DE_CONFIGURATION = [
  'expediteur_absent',
  'expediteur_illisible',
  'expediteur_sans_reponse',
  'domaine_non_renseigne',
  'domaine_different',
] as const;
export type MotifDeConfiguration = (typeof MOTIFS_DE_CONFIGURATION)[number];

export class ConfigurationRefusee extends Error {
  constructor(readonly motif: MotifDeConfiguration) {
    super(`configuration_refusee : ${motif}`);
    this.name = 'ConfigurationRefusee';
  }
}

export interface ConfigurationDeLEmetteur {
  readonly expediteur: string;
  readonly dmarcVerifie: boolean;
}

/**
 * Une adresse, une seule : ni espace, ni virgule, ni point-virgule, ni chevron, ni caractère de
 * contrôle — un saut de ligne dans un destinataire est une injection d'en-tête.
 */
const FORME_D_ADRESSE =
  /^[^\s@,;<>()"\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/** Un caractère de contrôle (sous 0x20, ou 0x7f) : dans un en-tête, il ouvre une ligne de plus. */
function porteUnControle(x: string): boolean {
  for (let i = 0; i < x.length; i++) {
    const c = x.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

const ADRESSE = { test: (x: string) => !porteUnControle(x) && FORME_D_ADRESSE.test(x) };

/** Les formes de « ne pas répondre », jugées sans séparateurs ni casse. */
const SANS_REPONSE = /noreply|nereply|donotreply|nepasrepondre|nerepondezpas/;

const lectureDeLEmetteur = schemaConfiguration.pick({
  PARTNERS_EMAIL_DMARC_VERIFIE: true,
  PARTNERS_EMAIL_EXPEDITEUR: true,
});

/**
 * La configuration, lue dans l'environnement par le schéma de `src/lib/env.ts` : le drapeau n'est
 * vrai que s'il vaut exactement `true` — absent ou illisible, il est faux.
 */
export function configurationDeLEmetteur(
  env: Readonly<Record<string, string | undefined>>,
  domaineEnvoi: string
): ConfigurationDeLEmetteur {
  const lu = lectureDeLEmetteur.safeParse(env);
  const expediteur = lu.success ? lu.data.PARTNERS_EMAIL_EXPEDITEUR : undefined;
  if (expediteur === undefined) throw new ConfigurationRefusee('expediteur_absent');
  if (!ADRESSE.test(expediteur)) throw new ConfigurationRefusee('expediteur_illisible');
  const [local, domaine] = expediteur.split('@') as [string, string];
  if (SANS_REPONSE.test(local.toLowerCase().replace(/[^a-z]/g, ''))) {
    throw new ConfigurationRefusee('expediteur_sans_reponse');
  }
  if (estSentinelle(domaineEnvoi) || domaineEnvoi.trim() === '') {
    throw new ConfigurationRefusee('domaine_non_renseigne');
  }
  if (domaine.toLowerCase() !== domaineEnvoi.toLowerCase()) {
    throw new ConfigurationRefusee('domaine_different');
  }
  return {
    expediteur,
    dmarcVerifie: lu.success && lu.data.PARTNERS_EMAIL_DMARC_VERIFIE === 'true',
  };
}

// ── La demande ──────────────────────────────────────────────────────────────────────────────────

export const MOTIFS_DE_DEMANDE = [
  'gabarit_inconnu',
  'destinataire_invalide',
  'sujet_invalide',
  'apporteur_invalide',
] as const;
export type MotifDeDemande = (typeof MOTIFS_DE_DEMANDE)[number];

export class DemandeRefusee extends Error {
  constructor(readonly motif: MotifDeDemande) {
    super(`demande_refusee : ${motif}`);
    this.name = 'DemandeRefusee';
  }
}

export interface DemandeDEnvoi {
  gabarit: string;
  a: string;
  sujet: string;
  corps: string;
  apporteurId: string | null;
}

/** Une ligne de `courriels_envoyes` : aucune adresse, aucun corps. */
export interface LigneCourriel {
  id: string;
  gabarit: string;
  emailHash: string;
  apporteurId: string | null;
  statut: StatutCourriel;
  demandeAt: Date;
  envoyeAt: Date | null;
  fournisseurMessageId: string | null;
  erreur: string | null;
}

export interface Relais {
  /** `reference` : l'identifiant de la ligne, pour rattacher un rebond à l'envoi. */
  envoyer(message: {
    de: string;
    a: string;
    sujet: string;
    corps: string;
    reference: string;
  }): Promise<{ messageId: string }>;
}

export interface DepotDesCourriels {
  estSupprimee(emailHash: string): Promise<boolean>;
  consigner(ligne: LigneCourriel): Promise<void>;
}

export interface DependancesDeLEmetteur {
  configuration: ConfigurationDeLEmetteur;
  relais: Relais;
  depot: DepotDesCourriels;
  cles: ClesPii;
  maintenant: () => Date;
  nouvelId: () => string;
}

/** Un sujet : une ligne, sans caractère de contrôle, borné. */
const SUJET = { test: (x: string) => x.length > 0 && x.length <= 250 && !porteUnControle(x) };
/** Ce que la colonne `fournisseur_message_id` peut tenir : visible, sans espace, borné. */
const IDENTIFIANT_DU_RELAIS = /^[\x21-\x7e]{1,200}$/;

function jugerLaDemande(demande: DemandeDEnvoi): void {
  if (!schemaGabarit.safeParse(demande.gabarit).success)
    throw new DemandeRefusee('gabarit_inconnu');
  if (!ADRESSE.test(demande.a)) throw new DemandeRefusee('destinataire_invalide');
  if (!SUJET.test(demande.sujet)) throw new DemandeRefusee('sujet_invalide');
  if (demande.apporteurId !== null && !z.string().uuid().safeParse(demande.apporteurId).success) {
    throw new DemandeRefusee('apporteur_invalide');
  }
}

export async function demanderEnvoi(
  demande: DemandeDEnvoi,
  d: DependancesDeLEmetteur
): Promise<StatutCourriel> {
  jugerLaDemande(demande);
  const ligne: LigneCourriel = {
    id: d.nouvelId(),
    gabarit: demande.gabarit,
    emailHash: empreinteRecherche('courriel', demande.a, d.cles),
    apporteurId: demande.apporteurId,
    statut: 'echec',
    demandeAt: d.maintenant(),
    envoyeAt: null,
    fournisseurMessageId: null,
    erreur: null,
  };

  if (await d.depot.estSupprimee(ligne.emailHash)) {
    ligne.statut = 'retenu_adresse_supprimee';
  } else if (!d.configuration.dmarcVerifie) {
    ligne.statut = 'retenu_dmarc_non_verifie';
  } else {
    try {
      const { messageId } = await d.relais.envoyer({
        de: d.configuration.expediteur,
        a: demande.a,
        sujet: demande.sujet,
        corps: demande.corps,
        reference: ligne.id,
      });
      ligne.statut = 'envoye';
      ligne.envoyeAt = d.maintenant();
      ligne.fournisseurMessageId = IDENTIFIANT_DU_RELAIS.test(messageId) ? messageId : null;
    } catch {
      // Un code FERMÉ : la réponse du relais peut citer l'adresse.
      ligne.erreur = 'relais_en_echec';
    }
  }
  await d.depot.consigner(ligne);
  return ligne.statut;
}

// ── L'adaptateur Prisma ─────────────────────────────────────────────────────────────────────────

export function depotDesCourriels(prisma: PrismaClient): DepotDesCourriels {
  return {
    async estSupprimee(emailHash) {
      const l = await prisma.suppressionCourriel.findUnique({
        where: { emailHash },
        select: { id: true },
      });
      return l !== null;
    },
    async consigner(ligne) {
      // L'empreinte a été produite par `empreinteRecherche` dans `demanderEnvoi`, seul chemin qui
      // construit une `LigneCourriel`.
      await prisma.courrielEnvoye.create({ data: ligne });
    },
  };
}
