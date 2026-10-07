/**
 * deposer.ts — la transaction de dépôt d'un apporteur (SEC-12 ; REQ-SEC-014, REQ-SEC-022,
 * REQ-SEC-032, REQ-JUR-008, REQ-CPL-008).
 *
 * L'ORDRE, ET POURQUOI.
 *   1. La SAISIE se juge avant toute écriture, au serveur : les quatre coordonnées du contact (nom,
 *      prénom, fonction, e-mail, téléphone), chacune nommée si elle manque ou est hors forme ; la
 *      case d'information des tiers cochée. Une adresse webmail ou générique passe (HYP-W20-DESTINATAIRE).
 *   2. Dans UNE transaction : le verrou consultatif du PORTEUR, puis celui du SIREN, toujours dans cet
 *      ordre ; puis le statut de l'apporteur relu SOUS VERROU de sa ligne. Un statut qui n'ouvre pas
 *      pleinement l'espace (résilié compris) ne dépose pas : `DepotInterdit`, rien n'est écrit.
 *      Suspendu : l'issue est `gele`, rien n'est écrit.
 *   3. Les faits, lus sous les verrous : l'antériorité (locale, DM-10-P), l'état administratif de la
 *      fiche déjà lue par l'écran (aucun appel réseau ici), l'opposition au démarchage (port),
 *      l'occupation et la file. Le porteur de l'occupant n'est jamais lu : un apporteur et une prise
 *      en charge par la Société donnent le même refus.
 *   4. La décision pure (`deciderDuDepot`). Un refus de catégorie est tracé dans `depots_refuses` ;
 *      un dépôt enregistré naît (`deposee` ou `deposee_en_file`), est journalisé, et sa demande de
 *      confirmation naît dans la MÊME transaction — pour l'occupant seulement : une déclaration en
 *      file n'appelle personne tant qu'elle n'occupe pas.
 *   5. APRÈS la transaction, un refus de catégorie est notifié (`refus_declaration`, obligatoire, sans
 *      délai : les quinze jours de l'art. 3.3 courent contre la Société). Ses paramètres DÉRIVENT de
 *      l'issue rendue à l'écran : les deux antériorités envoient donc les mêmes octets. `gele` n'est
 *      pas un refus de catégorie et ne notifie rien ici.
 *
 * `deposee_at` est écrit par la BASE, sous le verrou par SIREN (déclencheur `attributions_horloge_du_depot`).
 * La transaction est exposée (`deposerDans`) pour qu'une autre écriture la compose.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  deciderDuDepot,
  estUnRefus,
  type FaitsDuDepot,
  type IssueDepot,
} from '../../domain/depot/issue-depot';
import { niveauDAcces } from '../../domain/apporteur/acces-espace';
import { ETATS_OCCUPANTS } from '../../domain/attribution/etats';
import { redepotPermis } from '../../domain/attribution/echeances';
import { derniereFinSansAdresseValide } from '../evenement/journal';
import { anterioriteDe, verrouillerLesSirens } from '../entreprise-connue/projection';
import { journaliserLaNaissance } from '../attribution/transitionner';
import { creerLaDemande } from '../confirmation/demandes';
import { tirerLesJetonsDeLaDemande } from '../confirmation/jetons';
import {
  colonnesPii,
  empreinteAdresseReseau,
  empreinteRecherche,
  type ClesPii,
} from '../securite/pii';
import { CASE_INFORMATION_TIERS } from '../../content/micro-copy/espace/information-tiers';
import { issueRendue } from '../../content/micro-copy/espace/issues-depot';
import type { DemandeDeNotification } from '../notifications/envoyer';
import { limiter, sujetDepuisEmpreinte } from '../securite/rate-limit';

type Tx = Prisma.TransactionClient;

/**
 * La version du texte de la case d'information des tiers, enregistrée au dépôt (REQ-JUR-008) :
 * les 32 premiers caractères hexadécimaux du SHA-256 du texte (colonne de 32 caractères). DÉRIVÉE,
 * jamais tapée : un texte réécrit a une autre version, et le texte accepté reste identifiable.
 */
export function versionDeLInformationDesTiers(): string {
  return createHash('sha256').update(CASE_INFORMATION_TIERS).digest('hex').slice(0, 32);
}

export interface ContactDuDepot {
  readonly nom: string;
  readonly prenom: string;
  readonly fonction: string;
  readonly email: string;
  readonly telephone: string;
}

export interface SaisieDuDepot {
  readonly siren: string;
  readonly siret: string | null;
  /** La date calendaire du contact, `AAAA-MM-JJ`. */
  readonly dateContact: string;
  readonly contact: ContactDuDepot;
  readonly contexte: string | null;
  readonly informationTiersCochee: boolean;
  readonly lienInteretDeclare: boolean;
}

/** La fiche de l'entreprise telle que l'écran l'a lue ; nulle si l'API publique n'a pas répondu. */
export interface FicheDuDepot {
  readonly raisonSociale: string | null;
  readonly etatAdministratif: 'actif' | 'cesse' | null;
}

export interface DemandeDeDepot {
  readonly apporteurId: string;
  readonly canal: 'espace' | 'lien_prive';
  readonly jetonDepotId: string | null;
  readonly saisie: SaisieDuDepot;
  readonly fiche: FicheDuDepot;
  /** L'adresse réseau du client, telle que lue par le serveur ; jamais stockée, seule son empreinte. */
  readonly adresseReseau: string | null;
  /**
   * L'identifiant de la session de l'espace (canal `espace`), tel que le cookie le porte ; jamais
   * stocké, seule son empreinte sert de sujet au compteur `depot:session`. Le canal `lien_prive`
   * n'en a pas : sa session est le jeton du lien (`jetonDepotId`).
   */
  readonly session: string | null;
  /** La réponse au défi anti-automatisation, si l'écran en a présenté un. */
  readonly reponseCaptcha: string | null;
  /** L'en-tête de navigateur ; jamais stocké, seule son empreinte (type `agent`). */
  readonly agentUtilisateur: string | null;
  readonly clientCapturedAt: Date | null;
}

export interface PortsDuDepot {
  readonly cles: ClesPii;
  /** Le secret des jetons de confirmation (DM-40). */
  readonly secretConfirmation: string;
  maintenant(): Date;
  /** Art. 3.3 bis d : le registre d'opposition tenu par la Société. */
  oppositionDemarchage(tx: Tx, siren: string): Promise<boolean>;
  /** L'adresse de l'apporteur, déchiffrée par l'appelant : le courriel du refus y part. */
  adresseDe(apporteurId: string): Promise<string>;
  /** L'émetteur des notifications (`notifier`, lié à la couche cloisonnée du destinataire). */
  notifier(apporteurId: string, demande: DemandeDeNotification): Promise<unknown>;
  /** La limite de débit technique (`controlerLeDebit` en production), jugée avant toute lecture. */
  debit(sujets: SujetsDuDebit): Promise<DebitDuDepot>;
  /**
   * Le défi anti-automatisation (REQ-DM-010) : décidé sur un signal TECHNIQUE de l'empreinte réseau,
   * identique pour tous. Le port ne reçoit ni l'apporteur ni ses dépôts — il ne peut pas les compter.
   */
  captcha(ipHash: string | null, reponse: string | null): Promise<VerdictDuCaptcha>;
}

/** `a_presenter` : l'écran montre le défi, rien n'est écrit ; `resolu` ne refuse aucun dépôt. */
export type VerdictDuCaptcha = 'non_requis' | 'resolu' | 'a_presenter';

export interface DebitDuDepot {
  readonly autorise: boolean;
  /** Quand réessayer (ms), si la limite est atteinte ; `null` sinon. */
  readonly repriseAt: number | null;
}

/** Au-delà du débit : la requête est à réessayer. Rien n'est écrit, rien n'est compté à l'apporteur. */
export interface DepotAReessayer {
  readonly reessayer: true;
  readonly repriseAt: number | null;
}

/** Les deux sujets de la limite de débit : des EMPREINTES, jamais l'apporteur. La session est due. */
export interface SujetsDuDebit {
  readonly ip: string | null;
  readonly session: string;
}

/**
 * Un dépôt sans session ni jeton : refusé avant toute lecture. Le compteur de session est
 * obligatoire, et un dépôt n'est jamais jugé sur la seule empreinte réseau. Rien n'est écrit.
 */
export class SessionDeDepotAbsente extends Error {
  constructor() {
    super('session_absente : un dépôt porte une session de l’espace ou le jeton de son lien');
    this.name = 'SessionDeDepotAbsente';
  }
}

/**
 * L'empreinte de la session du déposant, sujet du compteur `depot:session` : l'identifiant de session
 * de l'espace, ou le jeton du lien privé. HMAC-SHA256 sous PII_HASH_KEY, séparé par domaine et par
 * canal : la valeur en clair n'entre jamais dans une clé du cache, et l'apporteur n'y entre pas.
 */
export function empreinteDeSession(demande: DemandeDeDepot, cles: ClesPii): string | null {
  const valeur = demande.canal === 'lien_prive' ? demande.jetonDepotId : demande.session;
  if (valeur === null || valeur === undefined) return null;
  return createHmac('sha256', cles.empreintes)
    .update(['partners.depot.session.v1', demande.canal, valeur].join('\u001f'), 'utf8')
    .digest('hex');
}

/**
 * LA limite de débit du dépôt (REQ-DM-009, texte de la juriste, arbitrage du 2026-10-04) :
 * TECHNIQUE, identique pour tous, sur l'empreinte réseau (`depot:ip`) ET l'empreinte de session
 * (`depot:session`), sur une fenêtre de l'ordre de la minute — jamais un compteur par apporteur.
 * La session est obligatoire ; l'adresse, quand elle manque, n'est pas comptée. Chacun peut seul
 * faire réessayer ; son seul effet est là : aucune trace au dossier, aucun statut.
 */
export async function controlerLeDebit(
  sujets: SujetsDuDebit,
  maintenantMs: number
): Promise<DebitDuDepot> {
  const verdicts = [];
  if (sujets.ip !== null) {
    verdicts.push(await limiter('depot:ip', sujetDepuisEmpreinte(sujets.ip), maintenantMs));
  }
  verdicts.push(await limiter('depot:session', sujetDepuisEmpreinte(sujets.session), maintenantMs));
  const refus = verdicts.filter((v) => !v.autorise);
  if (refus.length === 0) return { autorise: true, repriseAt: null };
  const reprises = refus.flatMap((v) => (v.repriseAt === null ? [] : [v.repriseAt]));
  return { autorise: false, repriseAt: reprises.length === 0 ? null : Math.max(...reprises) };
}

export interface IssueDuDepot {
  readonly issue: IssueDepot;
  readonly attributionId: string | null;
}

export type ChampDeSaisie = keyof ContactDuDepot | 'informationTiers';

/** Une saisie refusée au serveur : chaque champ en cause est NOMMÉ, jamais un refus muet. */
export class ErreurSaisieDepot extends Error {
  readonly champs: readonly ChampDeSaisie[];

  constructor(champs: readonly ChampDeSaisie[]) {
    super(`saisie_refusee : ${champs.join(', ')}`);
    this.name = 'ErreurSaisieDepot';
    this.champs = champs;
  }
}

/** Un apporteur dont le statut n'ouvre pas le dépôt (résilié compris) : rien n'est écrit. */
export class DepotInterdit extends Error {
  constructor() {
    super('depot_interdit : le statut relu de l’apporteur n’ouvre pas le dépôt');
    this.name = 'DepotInterdit';
  }
}

/**
 * DM-13 (art. 3.2 du v2) : le même apporteur redépose la même entreprise pendant la carence qui suit
 * une fin faute d'adresse valide. Une erreur TYPÉE du serveur, hors `IssueDepot` : rien n'est écrit,
 * aucune trace, aucune sanction.
 */
export class RedepotEnCarence extends Error {
  constructor() {
    super('redepot_en_carence : la carence qui suit une fin faute d’adresse valide court encore');
    this.name = 'RedepotEnCarence';
  }
}

const forme = (type: 'courriel' | 'telephone', valeur: string, cles: ClesPii): boolean => {
  try {
    empreinteRecherche(type, valeur, cles);
    return true;
  } catch {
    return false;
  }
};

/** Les champs refusés de la saisie, dans l'ordre du formulaire ; vide si tout est recevable. */
export function champsRefuses(saisie: SaisieDuDepot, cles: ClesPii): ChampDeSaisie[] {
  const c = saisie.contact;
  const refuses: ChampDeSaisie[] = [];
  for (const champ of ['nom', 'prenom', 'fonction'] as const) {
    if (c[champ].trim() === '') refuses.push(champ);
  }
  if (!forme('courriel', c.email, cles)) refuses.push('email');
  if (!forme('telephone', c.telephone, cles)) refuses.push('telephone');
  if (!saisie.informationTiersCochee) refuses.push('informationTiers');
  return refuses;
}

async function verrou(tx: Tx, cle: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cle}, 0))`;
}

/** Le dépôt, dans une transaction ouverte par l'appelant. */
export async function deposerDans(
  tx: Tx,
  demande: DemandeDeDepot,
  ports: PortsDuDepot
): Promise<IssueDuDepot> {
  const refuses = champsRefuses(demande.saisie, ports.cles);
  if (refuses.length > 0) throw new ErreurSaisieDepot(refuses);
  const { apporteurId } = demande;
  const { siren } = demande.saisie;
  const maintenant = ports.maintenant();

  await verrou(tx, `verrou-du-depot.porteur.${apporteurId}`);
  await verrou(tx, `verrou-du-depot.siren.${siren}`);
  // La projection de l'antériorité écrit sous ce verrou (domaine `partners.entreprise_connue`) :
  // le dépôt le prend aussi, pour lire l'antériorité APRÈS une projection en cours, jamais avant.
  await verrouillerLesSirens(tx, [siren]);

  const [a] = await tx.$queryRaw<{ statut: string }[]>`
    SELECT statut::text AS statut
      FROM apporteurs WHERE id = ${apporteurId}::uuid FOR UPDATE`;
  if (a === undefined || niveauDAcces(a.statut) !== 'plein') throw new DepotInterdit();

  // DM-13 : la carence se dérive des attributions de CE couple périmées faute d'adresse valide.
  const perimees = await tx.attribution.findMany({
    where: { apporteurId, siren, statut: 'perimee' },
    select: { id: true },
  });
  if (perimees.length > 0) {
    const fin = await derniereFinSansAdresseValide(
      tx,
      perimees.map((p) => p.id)
    );
    if (!redepotPermis(fin === null ? null : fin.getTime(), maintenant.getTime())) {
      throw new RedepotEnCarence();
    }
  }

  const anteriorite = await anterioriteDe(tx, siren, maintenant);
  const occupants = await tx.attribution.count({
    where: { siren, statut: { in: [...ETATS_OCCUPANTS] } },
  });
  const enAttente = await tx.attribution.count({ where: { siren, statut: 'en_attente' } });
  const faits: FaitsDuDepot = {
    apporteurGele: a.statut === 'suspendu',
    etablissementCesse: demande.fiche.etatAdministratif === 'cesse',
    anteriorite: anteriorite.connue ? anteriorite.origine : 'aucune',
    oppositionDemarchage: await ports.oppositionDemarchage(tx, siren),
    occupee: occupants > 0,
    enAttente,
    verificationPrioritaire: false,
  };
  const decision = deciderDuDepot(faits);

  if (decision.statut === null) {
    if (decision.issue !== 'gele') {
      await tx.depotRefuse.create({
        data: {
          apporteurId,
          siren,
          motif: decision.issue,
          canal: demande.canal,
          refuseAt: maintenant,
        },
      });
    }
    return { issue: decision.issue, attributionId: null };
  }

  const grille = await tx.grilleCommission.findFirst({
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (grille === null) throw new Error('grille_absente : aucune grille de commission publiée');

  const id = randomUUID();
  const s = demande.saisie;
  await tx.attribution.create({
    data: {
      ...(colonnesPii(
        { modele: 'attribution', id },
        {
          nomContact: s.contact.nom.trim(),
          prenomContact: s.contact.prenom.trim(),
          fonctionContact: s.contact.fonction.trim(),
          email: s.contact.email,
          telephone: s.contact.telephone,
          contexte: s.contexte,
        },
        ports.cles
      ) as unknown as Prisma.AttributionUncheckedCreateInput),
      id,
      apporteurId,
      statut: decision.statut,
      rangAttente: decision.rangAttente,
      siren,
      siret: s.siret,
      grilleCommissionId: grille.id,
      canal: demande.canal,
      jetonDepotId: demande.jetonDepotId,
      clientCapturedAt: demande.clientCapturedAt,
      dateContact: new Date(`${s.dateContact}T00:00:00.000Z`),
      informationTiersVersion: versionDeLInformationDesTiers(),
      verificationPrioritaire: faits.verificationPrioritaire,
      entrepriseAVerifier: demande.fiche.etatAdministratif === null,
      raisonSociale: demande.fiche.raisonSociale,
      etatAdministratif: demande.fiche.etatAdministratif,
      lienInteretDeclare: s.lienInteretDeclare,
      ipHash:
        demande.adresseReseau === null
          ? null
          : empreinteAdresseReseau(demande.adresseReseau, ports.cles),
      agentHash:
        demande.agentUtilisateur === null
          ? null
          : empreinteRecherche('agent', demande.agentUtilisateur, ports.cles),
    },
  });
  const acteur = { par: 'apporteur' as const, id: apporteurId };
  await journaliserLaNaissance(tx, {
    attributionId: id,
    transition: decision.statut === 'provisoire' ? 'deposee' : 'deposee_en_file',
    acteur,
    maintenant,
  });
  if (decision.statut === 'provisoire') {
    const jetons = tirerLesJetonsDeLaDemande(ports.secretConfirmation);
    await creerLaDemande(tx, {
      attributionId: id,
      jetonOuiHash: jetons.oui.empreinte,
      jetonNonHash: jetons.non.empreinte,
      acteur,
    });
  }
  return { issue: decision.issue, attributionId: id };
}

const PREFIXE_DU_REFUS = 'Pas enregistré : ';

/**
 * Les paramètres de `refus_declaration`, DÉRIVÉS du texte que l'écran affiche pour cette issue
 * (RM-01) : la catégorie est son titre sans le préfixe commun, le motif son « pourquoi » sans le
 * point final (le gabarit le pose).
 */
export function parametresDuRefus(issue: IssueDepot, entreprise: string): Record<string, string> {
  const t = issueRendue(issue);
  if (!t.titre.startsWith(PREFIXE_DU_REFUS)) {
    throw new Error(`refus_sans_categorie : l'issue ${issue} n'est pas un refus de l'écran`);
  }
  return {
    entreprise,
    categorie: t.titre.slice(PREFIXE_DU_REFUS.length),
    motif: t.pourquoi.replace(/\.$/, ''),
  };
}

/**
 * Le dépôt, dans sa propre transaction, derrière la limite de débit ; un refus de catégorie est
 * notifié après elle.
 */
export async function deposer(
  prisma: PrismaClient,
  demande: DemandeDeDepot,
  ports: PortsDuDepot
): Promise<IssueDuDepot | DepotAReessayer> {
  const ipHash =
    demande.adresseReseau === null
      ? null
      : empreinteAdresseReseau(demande.adresseReseau, ports.cles);
  const session = empreinteDeSession(demande, ports.cles);
  if (session === null) throw new SessionDeDepotAbsente();
  const d = await ports.debit({ ip: ipHash, session });
  if (!d.autorise) return { reessayer: true, repriseAt: d.repriseAt };
  if ((await ports.captcha(ipHash, demande.reponseCaptcha)) === 'a_presenter') {
    return { issue: 'captcha', attributionId: null };
  }
  const r = await prisma.$transaction((tx) => deposerDans(tx, demande, ports), { timeout: 30_000 });
  if (estUnRefus(r.issue)) {
    await ports.notifier(demande.apporteurId, {
      cle: 'refus_declaration',
      a: await ports.adresseDe(demande.apporteurId),
      parametres: parametresDuRefus(r.issue, demande.fiche.raisonSociale ?? demande.saisie.siren),
      attributionId: null,
    });
  }
  return r;
}
