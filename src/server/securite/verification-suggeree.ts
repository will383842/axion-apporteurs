/**
 * SEC-41 (REQ-SEC-060, HYP-W20-VERIFICATION) — les raisons « Vérification suggérée » : une liste
 * FERMÉE, des comparaisons par EMPREINTES, la console seulement, aucun effet défavorable automatique.
 *
 * CE QU'UNE RAISON FAIT. Elle trie la liste d'appels (en tête) et rend la demande SIGNALÉE. Le
 * prédicat pur `demandeSignalee` est lu par la réponse du contact (un clic « Oui » n'y est pas
 * retenu), par la confirmation tacite (aucune promotion par le seul silence), par la libération sans
 * appel concluant et par la liste d'appels ; aucun d'eux n'en recopie la règle. Ce n'est pas un effet
 * défavorable au sens de REQ-SEC-017 : l'attribution reste provisoire et réservée, et la confirmation
 * passe par la revue humaine d'un appel.
 *
 * CE QU'UNE RAISON NE FAIT JAMAIS. Elle n'entre pas dans le score de sincérité (les deux listes sont
 * disjointes, et le signal « contact générique » du score porte sur le NOM, la raison « adresse
 * générique » sur l'ADRESSE : ils ne se cumulent pas) ; elle n'ouvre rien, n'écrit rien au journal,
 * ne part dans aucun message ni aucun canal d'exploitation, n'atteint aucun écran de l'espace. Seul
 * l'état « appel attendu » du badge en est dérivé côté serveur, par un autre module, jamais la
 * raison ni leur nombre.
 *
 * CE QU'ELLE NE LIT JAMAIS (note de la lentille sécurité, rattrapage 55) : ni le compte, ni le
 * rythme, ni l'heure, ni le lieu, ni la zone, ni le secteur, ni la méthode de l'apporteur. La rafale
 * et les premiers dépôts restent des critères de tri d'une revue humaine, jamais des raisons.
 * `tests/unit/securite/verification-suggeree.spec.ts` lit cette source et rougit sur un témoin qui
 * en lirait un.
 *
 * LES EMPREINTES (REQ-SEC-024). Toute comparaison entre deux personnes passe par les empreintes HMAC
 * déjà stockées (`emailHash`, `phoneHash`, `ipHash`, `clicIpHash`) : jamais deux clairs comparés.
 * L'adresse du contact n'est déchiffrée que pour en lire la FORME (partie locale, domaine).
 */
import type { EtatDemandeConfirmation, PrismaClient } from '@prisma/client';
import { decryptPii, type ClesPii } from './pii';

/** L'enum FERMÉ des raisons (HYP-W20-VERIFICATION). Aucune de rythme ni de nombre de dépôts. */
export const RAISONS_DE_VERIFICATION = [
  /** Une adresse d'un fournisseur de messagerie grand public : acceptée, jamais refusée. */
  'adresse_webmail',
  /** Une adresse dont la partie locale désigne un service, pas une personne (HYP-W20-DESTINATAIRE). */
  'adresse_generique',
  /** Le domaine de l'adresse n'est ni le site connu de l'entreprise, ni l'un de ses sous-domaines. */
  'domaine_different_du_site',
  /** L'e-mail ou le téléphone du contact a l'empreinte de ceux de l'apporteur. */
  'coordonnee_de_l_apporteur',
  /** Le même e-mail ou téléphone de contact, par empreinte, sur une autre entreprise. */
  'contact_sur_plusieurs_entreprises',
  /** L'empreinte d'IP du clic est celle d'une session de l'apporteur. */
  'clic_depuis_l_ip_de_l_apporteur',
  /** La demande est EN rebond ; la demande née d'une correction est jugée sur sa propre adresse. */
  'rebond',
] as const;
export type RaisonDeVerification = (typeof RAISONS_DE_VERIFICATION)[number];

/** Les faits qu'une raison peut lire, et RIEN d'autre. Les empreintes sont celles de la base. */
export type FaitsDeVerification = {
  /** L'adresse saisie pour le contact, en clair dans la mémoire du passage seulement. */
  readonly adresseDuContact: string | null;
  /** Le domaine du site connu de l'entreprise ; inconnu, la comparaison n'a rien à comparer. */
  readonly domaineDuSite: string | null;
  readonly empreintesDuContact: {
    readonly email: string | null;
    readonly telephone: string | null;
  };
  readonly empreintesDeLApporteur: {
    readonly email: string | null;
    readonly telephone: string | null;
  };
  readonly contactSurUneAutreEntreprise: boolean;
  /** L'empreinte tronquée de l'adresse réseau du clic, s'il y en a eu un. */
  readonly clicIpHash: string | null;
  /** Les empreintes d'adresse réseau des sessions de l'apporteur. */
  readonly ipHashesDeLApporteur: readonly string[];
  readonly etatDeLaDemande: EtatDemandeConfirmation | null;
};

/** Les domaines des messageries grand public : un domaine EXACT, jamais une sous-chaîne. */
const DOMAINES_WEBMAIL: ReadonlySet<string> = new Set([
  'aol.com',
  'free.fr',
  'gmail.com',
  'gmx.com',
  'gmx.fr',
  'googlemail.com',
  'hotmail.com',
  'hotmail.fr',
  'icloud.com',
  'laposte.net',
  'live.com',
  'live.fr',
  'mac.com',
  'me.com',
  'msn.com',
  'neuf.fr',
  'numericable.fr',
  'orange.fr',
  'outlook.com',
  'outlook.fr',
  'proton.me',
  'protonmail.com',
  'sfr.fr',
  'wanadoo.fr',
  'yahoo.com',
  'yahoo.fr',
  'ymail.com',
]);

/** Les parties locales qui désignent un service, jamais une personne : la partie locale EXACTE. */
const PARTIES_LOCALES_GENERIQUES: ReadonlySet<string> = new Set([
  'accueil',
  'admin',
  'administration',
  'bonjour',
  'commercial',
  'compta',
  'comptabilite',
  'contact',
  'direction',
  'hello',
  'info',
  'infos',
  'office',
  'reception',
  'secretariat',
  'service',
  'standard',
]);

/** La partie locale et le domaine d'une adresse, en minuscules ; `null` si ce n'est pas une adresse. */
function decouper(adresse: string): { locale: string; domaine: string } | null {
  const a = adresse.trim().toLowerCase();
  const i = a.lastIndexOf('@');
  if (i <= 0 || i === a.length - 1) return null;
  return { locale: a.slice(0, i), domaine: a.slice(i + 1) };
}

/** Le domaine d'un site, sans protocole, chemin, port ni préfixe `www.`, en minuscules. */
function domaineNormalise(site: string): string {
  return site
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/:?#].*$/, '')
    .replace(/^www\./, '');
}

const egales = (a: string | null, b: string | null) => a !== null && b !== null && a === b;

/**
 * Les raisons PRÉSENTES, dans l'ordre de la liste fermée. PURE : elle ne lit que ses faits. Une
 * adresse webmail ne porte pas en plus la raison de domaine : son domaine n'est jamais celui d'une
 * entreprise.
 */
export function raisonsDeVerification(f: FaitsDeVerification): RaisonDeVerification[] {
  const adresse = f.adresseDuContact === null ? null : decouper(f.adresseDuContact);
  const webmail = adresse !== null && DOMAINES_WEBMAIL.has(adresse.domaine);
  const site = f.domaineDuSite === null ? null : domaineNormalise(f.domaineDuSite);
  const presentes: Record<RaisonDeVerification, boolean> = {
    adresse_webmail: webmail,
    adresse_generique: adresse !== null && PARTIES_LOCALES_GENERIQUES.has(adresse.locale),
    domaine_different_du_site:
      adresse !== null &&
      !webmail &&
      site !== null &&
      site !== '' &&
      adresse.domaine !== site &&
      !adresse.domaine.endsWith(`.${site}`),
    coordonnee_de_l_apporteur:
      egales(f.empreintesDuContact.email, f.empreintesDeLApporteur.email) ||
      egales(f.empreintesDuContact.telephone, f.empreintesDeLApporteur.telephone),
    contact_sur_plusieurs_entreprises: f.contactSurUneAutreEntreprise,
    clic_depuis_l_ip_de_l_apporteur:
      f.clicIpHash !== null && f.ipHashesDeLApporteur.includes(f.clicIpHash),
    rebond: f.etatDeLaDemande === 'rebond',
  };
  return RAISONS_DE_VERIFICATION.filter((r) => presentes[r]);
}

/** Le prédicat PUR « demande signalée » : vrai dès UNE raison, quelle qu'elle soit. */
export function demandeSignalee(f: FaitsDeVerification): boolean {
  return raisonsDeVerification(f).length > 0;
}

// ── la lecture des faits, en base ────────────────────────────────────────────────────────────────

/**
 * Les faits d'une attribution, lus en base : son contact, son apporteur, sa demande et le dernier
 * clic de ses émissions. `clicIpHash`, fourni, remplace le clic stocké : c'est l'empreinte du clic EN
 * COURS, que la réponse du contact juge à l'instant du clic. LECTURE SEULE.
 */
export async function faitsDeVerification(
  prisma: PrismaClient,
  p: {
    attributionId: string;
    domaineDuSite: string | null;
    cles: ClesPii;
    clicIpHash?: string | null;
  }
): Promise<FaitsDeVerification> {
  const a = await prisma.attribution.findUniqueOrThrow({
    where: { id: p.attributionId },
    select: {
      id: true,
      apporteurId: true,
      siren: true,
      emailChiffre: true,
      emailHash: true,
      phoneHash: true,
      apporteur: { select: { emailHash: true, phoneHash: true } },
    },
  });
  const demande = await prisma.demandeConfirmation.findUnique({
    where: { attributionId: a.id },
    select: {
      etat: true,
      emissions: {
        where: { clicIpHash: { not: null } },
        select: { clicIpHash: true },
        orderBy: { emiseAt: 'desc' },
        take: 1,
      },
    },
  });
  const memeContact = [
    ...(a.emailHash === null ? [] : [{ emailHash: a.emailHash }]),
    ...(a.phoneHash === null ? [] : [{ phoneHash: a.phoneHash }]),
  ];
  const autre =
    memeContact.length === 0
      ? null
      : await prisma.attribution.findFirst({
          where: { id: { not: a.id }, siren: { not: a.siren }, OR: memeContact },
          select: { id: true },
        });
  const sessions =
    a.apporteurId === null
      ? []
      : await prisma.sessionEspace.findMany({
          where: { apporteurId: a.apporteurId, ipHash: { not: null } },
          select: { ipHash: true },
        });
  return {
    adresseDuContact:
      a.emailChiffre === null
        ? null
        : decryptPii(
            { modele: 'attribution', champ: 'emailChiffre', id: a.id },
            a.emailChiffre,
            p.cles
          ),
    domaineDuSite: p.domaineDuSite,
    empreintesDuContact: { email: a.emailHash, telephone: a.phoneHash },
    empreintesDeLApporteur: {
      email: a.apporteur?.emailHash ?? null,
      telephone: a.apporteur?.phoneHash ?? null,
    },
    contactSurUneAutreEntreprise: autre !== null,
    clicIpHash:
      p.clicIpHash !== undefined ? p.clicIpHash : (demande?.emissions[0]?.clicIpHash ?? null),
    ipHashesDeLApporteur: sessions.flatMap((s) => (s.ipHash === null ? [] : [s.ipHash])),
    etatDeLaDemande: demande?.etat ?? null,
  };
}

/**
 * Pour la CONSOLE seulement (liste d'appels, fiche de qualification) : les raisons et le prédicat.
 * Aucun écran de l'espace ne l'appelle ; la garde du test le vérifie.
 */
export async function lireLaVerification(
  prisma: PrismaClient,
  p: {
    attributionId: string;
    domaineDuSite: string | null;
    cles: ClesPii;
    clicIpHash?: string | null;
  }
): Promise<{ raisons: RaisonDeVerification[]; signalee: boolean }> {
  const raisons = raisonsDeVerification(await faitsDeVerification(prisma, p));
  return { raisons, signalee: raisons.length > 0 };
}
