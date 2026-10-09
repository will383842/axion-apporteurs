/**
 * L'écrivain et le lecteur du journal `Evenement` — DM-01 (REQ-DM-024, REQ-DM-041,
 * partners/ADR-0015 décisions 3 et 8).
 *
 * `ajouterEvenement()` N'ACCEPTE QU'UNE TRANSACTION. REQ-DM-024 exige que toute transition
 * d'agrégat écrive son événement « dans la même transaction ». DEUX DÉFENSES, et chacune dit ce
 * qu'elle couvre :
 *   — le TYPE (`ClientDeTransaction<T>`) refuse à la compilation l'appel DIRECT avec un client qui
 *     porte `$transaction` (témoin `@ts-expect-error` dans `tests/integration/journal.spec.ts`). Il
 *     ne voit pas un client nu passé par un intermédiaire typé `Prisma.TransactionClient` : ce type
 *     n'est qu'un `Omit<>` du client, et un `PrismaClient` s'y range ;
 *   — le REFUS À L'EXÉCUTION protège tout le reste : un client qui porte encore `$transaction` n'est
 *     pas celui d'une transaction interactive ouverte, et
 *     `ajouterEvenement()` lève avant tout accès à la base.
 *   — un client `$extends` NE COMPILE PAS ici (TS2345 : son client de transaction ne satisfait pas
 *     `Prisma.TransactionClient`) : échec fermé, et aucun témoin ne dit ce que ferait le refus à
 *     l'exécution sur lui — la première tâche qui étend le client le mesurera.
 *
 * LINÉARITÉ (décision 3). Chaîne GLOBALE : l'écrivain prend `pg_advisory_xact_lock` sur une clé fixe,
 * PUIS lit la tête, dans la même transaction. Sous READ COMMITTED (défaut de Postgres et de Prisma),
 * la lecture postérieure au verrou voit le dernier commit : deux écrivains concurrents se suivent au
 * lieu de bifurquer. Si le verrou venait à manquer, `UNIQUE(prev_hash)` fait échouer FERMÉ (23505) —
 * c'est le filet, pas le mécanisme. Le verrou est relâché au commit ou au rollback.
 *
 * CHARGE FERMÉE (REQ-DM-041). La charge traverse le schéma `.strict()` de son type AVANT toute
 * écriture : une clé en trop lève, et rien n'est écrit. Le refus NOMME le chemin et le code de chaque
 * écart, JAMAIS la valeur reçue : la `ZodError` d'origine la recopie (`received: …`), et un appelant
 * qui journalise `error.message` écrirait la donnée personnelle qu'on vient de refuser.
 *
 * `agregatId` est un UUID sous sa forme canonique à tirets, NORMALISÉ en minuscules AVANT le hachage.
 * Postgres rend toujours la forme canonique minuscule : haché sous une autre forme, le maillon serait
 * en `hash_altere` pour toujours, sur une table qu'on ne corrige pas, et masquerait toute altération
 * suivante. Une autre forme (sans tirets, accolades) est refusée.
 *
 * Ce fichier est le SEUL écrivain de la table (`journal:sans-pii`, famille `ecrivain_hors_journal`).
 * Aucun client Prisma n'est créé ici : ce module reçoit celui de l'appelant.
 */
import type { Prisma, PrismaClient, TypeEvenementJournal, AgregatJournal } from '@prisma/client';
import { CHARGES_PAR_TYPE, TRANSITIONS_DU_JOURNAL_APPORTEUR } from '../../domain/evenement/charges';
import { ETATS_TERMINES, type TransitionAttribution } from '../../domain/attribution/machine';
import { calculerSelfHash, type LigneJournal } from '../../domain/evenement/journal';

/**
 * SEC-50 : le nom qualifié de la table du journal, écrit UNE fois, ici, chez son seul écrivain (RM-01).
 * Le constat du rôle d'exécution le reçoit en PARAMÈTRE pour lire le propriétaire et les privilèges
 * de la table, sans jamais la nommer lui-même ni y écrire.
 */
export const TABLE_DU_JOURNAL = 'public.evenements';

/** La clé du verrou consultatif de l'écrivain : une seule chaîne, donc une seule clé. */
const CLE_VERROU = 'evenements';

/** Un UUID sous sa forme canonique à tirets, toute casse. */
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le client d'une transaction OUVERTE : un client qui porte encore `$transaction` est refusé. */
export type ClientDeTransaction<T> = T & ('$transaction' extends keyof T ? never : unknown);

export type NouvelEvenement = {
  type: TypeEvenementJournal;
  agregat?: AgregatJournal | null;
  agregatId?: string | null;
  /** Fourni par l'appelant (horloge injectée) : rien ici ne lit l'heure. */
  survenuAt: Date;
  charge: unknown;
};

/** La charge, parsée par le schéma fermé de son type ; le refus ne porte aucune valeur reçue. */
function chargeFermee(type: TypeEvenementJournal, charge: unknown): Prisma.InputJsonObject {
  const r = CHARGES_PAR_TYPE[type].safeParse(charge);
  if (r.success) return r.data;
  const ecarts = r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} ${i.code}`);
  throw new Error(`charge refusée pour le type ${type} : ${ecarts.join(', ')}`);
}

/** L'identifiant d'agrégat, sous la forme que Postgres rendra : minuscules, à tirets. */
function agregatIdCanonique(agregatId: string | null | undefined): string | null {
  if (agregatId === null || agregatId === undefined) return null;
  if (!UUID_CANONIQUE.test(agregatId)) {
    throw new Error('agregatId refusé : un UUID sous sa forme canonique à tirets est attendu');
  }
  return agregatId.toLowerCase();
}

export async function ajouterEvenement<T extends Prisma.TransactionClient>(
  tx: ClientDeTransaction<T>,
  e: NouvelEvenement
): Promise<{ id: string; selfHash: string }> {
  // Le type ne protège que l'appel direct : un client nu passé par un intermédiaire typé
  // `Prisma.TransactionClient` compile. Ce refus-là tient pour tous les chemins.
  if ('$transaction' in tx) {
    throw new Error(
      'ajouterEvenement exige une transaction ouverte : reçu un client hors transaction'
    );
  }
  // Parse et normalisation AVANT le verrou : un refus ne prend rien et n'écrit rien.
  const charge = chargeFermee(e.type, e.charge);
  const enregistrement = {
    type: e.type,
    agregat: e.agregat ?? null,
    agregatId: agregatIdCanonique(e.agregatId),
    survenuAt: e.survenuAt.toISOString(),
    charge,
  };

  // `$executeRaw`, pas `$queryRaw` : Prisma ne sait pas désérialiser la colonne `void` du résultat.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${CLE_VERROU}, 0))`;
  const tete = await tx.evenement.findFirst({
    orderBy: { id: 'desc' },
    select: { selfHash: true },
  });
  if (!tete) {
    throw new Error(
      'journal sans genèse : la table `evenements` est vide, la première migration ne l’a pas ouverte'
    );
  }

  const selfHash = calculerSelfHash(tete.selfHash, enregistrement);
  const cree = await tx.evenement.create({
    data: { ...enregistrement, survenuAt: e.survenuAt, prevHash: tete.selfHash, selfHash },
    select: { id: true },
  });
  return { id: cree.id.toString(), selfHash };
}

/** Le journal entier, dans la forme que `verifierChaine()` lit : ids en chaîne, dates en ISO UTC. */
export async function lireJournal(
  client: PrismaClient | Prisma.TransactionClient
): Promise<LigneJournal[]> {
  const lignes = await client.evenement.findMany({ orderBy: { id: 'asc' } });
  return lignes.map((l) => ({
    id: l.id.toString(),
    type: l.type,
    agregat: l.agregat,
    agregatId: l.agregatId,
    survenuAt: l.survenuAt.toISOString(),
    charge: l.charge,
    prevHash: l.prevHash,
    selfHash: l.selfHash,
  }));
}

/** La taille d'un lot de lecture du journal : une lecture bornée, jamais toute la table d'un coup. */
const LOT_DU_JOURNAL = 1000;

/**
 * DM-45 — le journal lu PAR LOTS ordonnés par id, dans la forme que `verifierChaine()` lit. L'ordre
 * des lots n'est qu'une lecture : la vérification suit les liens de hash, pas l'ordre des ids.
 */
export async function lireJournalParLots(
  client: PrismaClient | Prisma.TransactionClient,
  taille: number = LOT_DU_JOURNAL
): Promise<LigneJournal[]> {
  const lignes: LigneJournal[] = [];
  let apres: bigint | null = null;
  for (;;) {
    const lot: Awaited<ReturnType<typeof client.evenement.findMany>> =
      await client.evenement.findMany({
        where: apres === null ? {} : { id: { gt: apres } },
        orderBy: { id: 'asc' },
        take: taille,
      });
    for (const l of lot)
      lignes.push({
        id: l.id.toString(),
        type: l.type,
        agregat: l.agregat,
        agregatId: l.agregatId,
        survenuAt: l.survenuAt.toISOString(),
        charge: l.charge,
        prevHash: l.prevHash,
        selfHash: l.selfHash,
      });
    if (lot.length < taille) return lignes;
    apres = lot[lot.length - 1]!.id;
  }
}

/**
 * DM-55 — la charge d'UN fait, par son identifiant : ce que le rendu d'une notification de la machine
 * relit à l'heure de l'envoi (transition, motif, catégorie). Une lecture seule, par l'écrivain unique
 * du journal ; `null` si le fait n'existe pas.
 */
export async function lireLaChargeDUnFait(
  client: PrismaClient | Prisma.TransactionClient,
  id: string
): Promise<{ type: string; charge: unknown } | null> {
  const l = await client.evenement.findUnique({
    where: { id: BigInt(id) },
    select: { type: true, charge: true },
  });
  return l === null ? null : { type: l.type, charge: l.charge };
}

/**
 * SEC-66 (A02, #561, 5988205180) — la trace DURABLE de l'opposabilité d'une résiliation par la
 * Société : le passage à `resilie` qui CITE la ligne `decisions_de_contrat` (`decisionContratId`),
 * ou `null` s'il n'est cité par aucun passage — la décision est alors caduque, sans aucune colonne
 * d'état. Le journal n'est jamais purgé : la réponse survit à la purge de la notification et de son
 * courriel. Deux lecteurs : la tâche de la date d'effet, SANS filtre (une décision n'est citée qu'une
 * fois, sur quelque apporteur que ce soit : `decision_deja_citee`) ; la purge des textes (DM-70,
 * départ des cinq ans d'une mise en demeure), AVEC le filtre `apporteurId` : un passage d'un autre
 * apporteur ne rend jamais opposable la décision de celui-ci. Une lecture seule, par le module du
 * journal.
 */
export async function passageQuiCiteLaDecision(
  client: PrismaClient | Prisma.TransactionClient,
  decisionContratId: string,
  apporteurId?: string
): Promise<string | null> {
  if (apporteurId !== undefined && !UUID_CANONIQUE.test(apporteurId)) {
    throw new Error('lecture_du_journal_refusee : agrégat hors forme');
  }
  const l = await client.evenement.findFirst({
    where: {
      type: 'apporteur_statut_modifie',
      ...(apporteurId === undefined
        ? {}
        : { agregat: 'apporteur' as const, agregatId: apporteurId }),
      charge: { path: ['decisionContratId'], equals: decisionContratId },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return l === null ? null : l.id.toString();
}

/**
 * SEC-15 — la FIN d'une suspension, lue au journal par son écrivain unique (A02, #794, 6036174464,
 * d'après la juriste, 6036161128) : la PREMIÈRE levée du gel postérieure au fait de la pose ; à défaut,
 * le premier passage de l'apporteur à `resilie` (la fin du contrat). La garde du gel interdit un gel
 * vers un autre gel : pose et levée alternent, et chaque suspension a SA levée. Le premier fait du gel
 * qui suit la pose EST sa levée ; illisible, ou qui ne lève pas, il rend null — jamais sauté — et le
 * texte de la décision est gardé (échec fermé). Seuls l'instant et sa source sortent.
 */
export async function finDUneSuspension(
  client: PrismaClient | Prisma.TransactionClient,
  agregatId: string,
  poseEvenementId: bigint
): Promise<{ fin: Date; par: 'levee' | 'fin_du_contrat' } | null> {
  if (!UUID_CANONIQUE.test(agregatId)) {
    throw new Error('lecture_du_journal_refusee : agrégat hors forme');
  }
  const apres = { agregat: 'apporteur' as const, agregatId, id: { gt: poseEvenementId } };
  const gel = await client.evenement.findFirst({
    where: { ...apres, type: 'apporteur_gel_modifie' },
    orderBy: { id: 'asc' },
    select: { survenuAt: true, charge: true },
  });
  if (gel !== null) {
    const lu = CHARGES_PAR_TYPE.apporteur_gel_modifie.safeParse(gel.charge);
    if (!lu.success || lu.data.vers !== 'libre') return null;
    return { fin: gel.survenuAt, par: 'levee' };
  }
  const resiliation = await client.evenement.findFirst({
    where: {
      ...apres,
      type: 'apporteur_statut_modifie',
      charge: { path: ['vers'], equals: 'resilie' },
    },
    orderBy: { id: 'asc' },
    select: { survenuAt: true, charge: true },
  });
  if (resiliation === null) return null;
  const lue = CHARGES_PAR_TYPE.apporteur_statut_modifie.safeParse(resiliation.charge);
  if (!lue.success || lue.data.vers !== 'resilie') return null;
  return { fin: resiliation.survenuAt, par: 'fin_du_contrat' };
}

/** Une transition de l'apporteur, telle que le journal la nomme : la liste FERMÉE de sa charge. */
export type TransitionDeLApporteur = (typeof TRANSITIONS_DU_JOURNAL_APPORTEUR)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CPL-T24 — les ACTEURS d'une transition de l'apporteur, relus au journal (conditions d'A02 et de la
 * sécurité sur #753). Une lecture seule, par l'écrivain unique du journal (garde `journal:sans-pii`),
 * paramétrée, par l'agrégat et le TYPE (`apporteur_statut_modifie`), sur une transition de la liste
 * fermée. Chaque charge est jugée par SON schéma Zod ; seul l'identifiant de l'acteur sort, `null`
 * pour le système, jamais la charge, le type ni une date. Une entrée hors forme, ou une charge qui
 * ne se lit pas, lève : un échec fermé. Le RIB à quatre yeux y lit qui a ouvert le dossier.
 */
export async function acteursDUneTransition(
  client: PrismaClient | Prisma.TransactionClient,
  agregatId: string,
  transition: TransitionDeLApporteur
): Promise<(string | null)[]> {
  if (
    !UUID.test(agregatId) ||
    !(TRANSITIONS_DU_JOURNAL_APPORTEUR as readonly string[]).includes(transition)
  )
    throw new Error('lecture_du_journal_refusee : agrégat ou transition hors forme');
  const faits = await client.evenement.findMany({
    where: {
      agregat: 'apporteur',
      agregatId,
      type: 'apporteur_statut_modifie',
      charge: { path: ['transition'], equals: transition },
    },
    select: { charge: true },
  });
  return faits.map((f) => {
    const lu = CHARGES_PAR_TYPE.apporteur_statut_modifie.safeParse(f.charge);
    if (!lu.success) throw new Error('lecture_du_journal_refusee : charge hors schéma');
    return lu.data.acteur.id ?? null;
  });
}

/**
 * EXT-T06 — LECTEUR RÉSERVÉ du signal « Déjà déposée par le passé » (conditions de la sécurité, relayées
 * par la coordination). Il rend la date de fin de la DERNIÈRE attribution terminée sur ce SIREN, quel
 * qu'en soit le porteur, ou `null` ; RIEN d'autre : ni porteur, ni identifiant, ni charge, ni nombre.
 *   — Les événements se trouvent par les ATTRIBUTIONS du SIREN (`agregat_id` parmi leurs ids), jamais
 *     en lisant un SIREN dans une charge.
 *   — UNE seule requête, agrégée en base (le dernier événement de chaque attribution, par une jointure
 *     latérale) : le temps de réponse ne dépend pas du nombre d'attributions terminées (note de la
 *     sécurité sur #812).
 *   — Une attribution compte si son état est dans la liste FERMÉE `ETATS_TERMINES`, et si son DERNIER
 *     `attribution_etat_modifie` dit, lisiblement, qu'elle y est passée ; la fin est son `survenuAt`.
 *   — ÉCHEC FERMÉ : une charge illisible, un événement absent ou discordant, une erreur de lecture
 *     rendent `null`, donc AUCUN signal : échouer ne rend rien de différent de « jamais déposée ».
 * Seul le service de la vérification l'appelle ; le booléen se calcule en mémoire, jamais stocké ni
 * journalisé.
 */
export async function derniereFinSurLeSiren(
  client: Pick<PrismaClient, '$queryRaw'> | Prisma.TransactionClient,
  siren: string
): Promise<Date | null> {
  try {
    const terminees = await client.$queryRaw<
      { statut: string; survenu_at: Date | null; charge: unknown }[]
    >`
      SELECT a.statut::text AS statut, d.survenu_at, d.charge
      FROM attributions a
      LEFT JOIN LATERAL (
        SELECT e.survenu_at, e.charge FROM evenements e
        WHERE e.type = 'attribution_etat_modifie' AND e.agregat = 'attribution' AND e.agregat_id = a.id
        ORDER BY e.survenu_at DESC, e.id DESC
        LIMIT 1
      ) d ON true
      WHERE a.siren = ${siren} AND a.statut::text = ANY(${[...ETATS_TERMINES]}::text[])`;
    let fin: Date | null = null;
    for (const a of terminees) {
      const lue = CHARGES_PAR_TYPE.attribution_etat_modifie.safeParse(a.charge);
      if (a.survenu_at === null || !lue.success || lue.data.vers !== a.statut) return null;
      if (fin === null || a.survenu_at > fin) fin = a.survenu_at;
    }
    return fin;
  } catch {
    return null;
  }
}

/**
 * DM-73 — LECTEUR RÉSERVÉ de la chaîne des commissions : pour chaque attribution d'un SIREN, hors file,
 * la DERNIÈRE transition au journal et son instant ; une attribution sans fait n'y figure pas. UNE
 * requête, par les attributions du SIREN (jointure latérale), comme `derniereFinSurLeSiren`. Seuls la
 * transition et l'instant sortent, jamais la charge. Chaque charge est jugée par SON schéma ; une
 * charge illisible LÈVE : la désignation d'un bénéficiaire échoue fermée, elle ne devine pas.
 */
export async function dernieresTransitionsSurLeSiren(
  client: Pick<PrismaClient, '$queryRaw'> | Prisma.TransactionClient,
  siren: string
): Promise<{ attributionId: string; transition: TransitionAttribution; survenuAt: Date }[]> {
  const lignes = await client.$queryRaw<{ id: string; survenu_at: Date; charge: unknown }[]>`
    SELECT a.id::text AS id, d.survenu_at, d.charge
    FROM attributions a
    JOIN LATERAL (
      SELECT e.survenu_at, e.charge FROM evenements e
      WHERE e.type = 'attribution_etat_modifie' AND e.agregat = 'attribution' AND e.agregat_id = a.id
      ORDER BY e.id DESC
      LIMIT 1
    ) d ON true
    WHERE a.siren = ${siren} AND a.statut::text <> 'en_attente'`;
  return lignes.map((l) => {
    const lue = CHARGES_PAR_TYPE.attribution_etat_modifie.safeParse(l.charge);
    if (!lue.success) throw new Error('lecture_du_journal_refusee : charge hors schéma');
    return { attributionId: l.id, transition: lue.data.transition, survenuAt: l.survenu_at };
  });
}
