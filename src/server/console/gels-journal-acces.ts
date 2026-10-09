/**
 * Le gel du journal des accès à la console (SEC-61, forme d'A02 accordée avec la sécurité).
 *
 * Un gel vise UNE portée, un utilisateur de la console OU une cible, et protège de la purge les lignes
 * de cette portée survenues depuis `depuis` et jusqu'à `jusqu_a` inclus, futures comprises si `jusqu_a` est
 * nul, tant qu'il est OUVERT. `jusqu_a` ne se modifie pas : une nouvelle période passe par un nouveau gel. La base tient la
 * forme (CHECK de portée, de période, de référence, « pas sur soi », quatre yeux de la levée), la garde
 * dédiée (un gel naît ouvert, seule la levée s'écrit, une fois) et le filet sur le journal. Ce module
 * ajoute ce que la base ne peut pas dire : le droit relu en base, et l'événement chaîné.
 *
 * POSER et LEVER : un admin VALIDÉ (jamais un administrateur en attente), sous step-up — les deux
 * droits portent `stepUp: true` dans la matrice, et l'acteur arrive JUGÉ par `requireRole`. Le rôle,
 * la désactivation et la validation sont RELUS dans la transaction. La levée est faite par un AUTRE
 * que l'auteur et que la personne visée ; s'il n'existe aucun autre administrateur validé, le gel ne
 * se lève pas (échec fermé, motif `aucun_autre_administrateur`).
 *
 * LA LISTE (condition de la sécurité, #620) : BORNÉE par `GELS_JOURNAL_ACCES_PAGE_MAX`, paginée par un
 * curseur keyset sur `(pose_at desc, id desc)`, jamais par décalage ; le curseur est opaque et validé
 * AVANT toute lecture. Dans UNE transaction : le droit relu (le défaut est le refus), la page lue, puis
 * une ligne `lecture_journal_acces` par utilisateur de la console DISTINCT visé dans la page, au nom
 * du lecteur ; seulement ensuite la page est rendue. Une trace qui échoue fait échouer la lecture. Un
 * gel sur une cible n'écrit pas de ligne. La liste ne rend ni l'auteur ni la personne visée.
 *
 * L'ÉVÉNEMENT, dans la MÊME transaction : `journal_acces_gel_modifie` sur l'agrégat `journal_acces_gel`
 * (l'id du gel). Sa charge ne porte AUCUN identifiant d'employé ni de cible, et la référence n'y est
 * qu'en empreinte (HMAC sous PII_HASH_KEY, `reference_gel`).
 */
import { randomUUID } from 'node:crypto';
import type {
  ConsoleRole,
  MotifGelJournal,
  Prisma,
  PrismaClient,
  UtilisateurConsole,
} from '@prisma/client';
import { ajouterEvenement } from '../evenement/journal';
import { roleAutorise } from '../roles/matrice';
import { empreinteAdresseReseau, empreinteRecherche, type ClesPii } from '../securite/pii';
import { GELS_JOURNAL_ACCES_PAGE_MAX } from '../../domain/seuils/ssot';

export type MotifDuGel =
  'droit_absent' | 'introuvable' | 'deja_leve' | 'leveur_interdit' | 'aucun_autre_administrateur';

export class ErreurGelJournal extends Error {
  constructor(readonly motif: MotifDuGel) {
    super(`gel_journal_acces : ${motif}`);
    this.name = 'ErreurGelJournal';
  }
}

export interface ActeurDuGel {
  readonly id: string;
  readonly role: ConsoleRole;
}

/** La portée d'un gel : un utilisateur de la console, OU une cible (un apporteur, une attribution). */
export type PorteeDuGel =
  | { readonly type: 'utilisateur'; readonly utilisateurId: string }
  | { readonly type: 'cible'; readonly cibleId: string };

type Tx = Prisma.TransactionClient;

/** Le droit de l'acteur, RELU en base : admin, actif, validé ; sinon refusé. */
async function exigerUnAdministrateurValide(
  tx: Tx,
  acteur: ActeurDuGel,
  droit:
    'action:poser_gel_journal_acces' | 'action:lever_gel_journal_acces' | 'ecran:gels_journal_acces'
): Promise<void> {
  if (!roleAutorise(droit, acteur.role)) throw new ErreurGelJournal('droit_absent');
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteur.id },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    lu.valideAt === null ||
    !roleAutorise(droit, lu.role)
  )
    throw new ErreurGelJournal('droit_absent');
}

/** Ce que l'écran des gels ouvre au lecteur : poser et lever, ou rien (`null`). */
export type DroitsSurLesGels = { readonly poser: boolean; readonly lever: boolean };

/**
 * Le droit de l'écran, jugé sur la ligne RELUE du lecteur : un admin actif et VALIDÉ voit poser et
 * lever ; un administrateur en attente, désactivé, inconnu, ou tout autre rôle ne voit rien.
 */
export function droitsSurLesGels(
  lu: Pick<UtilisateurConsole, 'role' | 'desactiveAt' | 'valideAt'> | null
): DroitsSurLesGels | null {
  if (lu === null || lu.desactiveAt !== null || lu.valideAt === null) return null;
  if (!roleAutorise('ecran:gels_journal_acces', lu.role)) return null;
  const poser = roleAutorise('action:poser_gel_journal_acces', lu.role);
  const lever = roleAutorise('action:lever_gel_journal_acces', lu.role);
  return poser || lever ? { poser, lever } : null;
}

/** Le droit de l'écran, RELU en base sur le lecteur seul. Un refus ne lit rien d'autre. */
export async function droitsDuLecteurSurLesGels(
  prisma: Pick<PrismaClient, 'utilisateurConsole'>,
  lecteurId: string
): Promise<DroitsSurLesGels | null> {
  return droitsSurLesGels(
    await prisma.utilisateurConsole.findUnique({
      where: { id: lecteurId },
      select: { role: true, desactiveAt: true, valideAt: true },
    })
  );
}

const empreinteDeLaReference = (reference: string, cles: ClesPii) =>
  empreinteRecherche('reference_gel', reference, cles);

/** Poser un gel, OUVERT, et son événement. Rend l'id du gel. */
export async function poserUnGel(
  prisma: PrismaClient,
  d: {
    acteur: ActeurDuGel;
    portee: PorteeDuGel;
    motif: MotifGelJournal;
    reference: string;
    depuis: Date;
    jusquA?: Date | null;
    maintenant: Date;
  },
  cles: ClesPii
): Promise<{ id: string }> {
  // L'empreinte d'abord : une référence hors forme est refusée avant toute écriture.
  const referenceEmpreinte = empreinteDeLaReference(d.reference, cles);
  const reference = d.reference.trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    await exigerUnAdministrateurValide(tx, d.acteur, 'action:poser_gel_journal_acces');
    if (d.portee.type === 'utilisateur') {
      const vise = await tx.utilisateurConsole.findUnique({
        where: { id: d.portee.utilisateurId },
        select: { id: true },
      });
      if (vise === null) throw new ErreurGelJournal('introuvable');
    }
    const id = randomUUID();
    await tx.journalAccesConsoleGel.create({
      data: {
        id,
        motif: d.motif,
        reference,
        utilisateurViseId: d.portee.type === 'utilisateur' ? d.portee.utilisateurId : null,
        cibleId: d.portee.type === 'cible' ? d.portee.cibleId : null,
        depuis: d.depuis,
        jusquA: d.jusquA ?? null,
        poseParId: d.acteur.id,
        poseAt: d.maintenant,
      },
    });
    await ajouterEvenement(tx, {
      type: 'journal_acces_gel_modifie',
      agregat: 'journal_acces_gel',
      agregatId: id,
      survenuAt: d.maintenant,
      charge: {
        geste: 'poser',
        motif: d.motif,
        portee: { type: d.portee.type },
        referenceEmpreinte,
        acteur: { par: 'utilisateur_console' },
      },
    });
    return { id };
  });
}

/** Lever un gel OUVERT, par un AUTRE administrateur validé que l'auteur et que la personne visée. */
export async function leverUnGel(
  prisma: PrismaClient,
  d: { acteur: ActeurDuGel; gelId: string; maintenant: Date },
  cles: ClesPii
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await exigerUnAdministrateurValide(tx, d.acteur, 'action:lever_gel_journal_acces');
    const gel = await tx.journalAccesConsoleGel.findUnique({ where: { id: d.gelId } });
    if (gel === null) throw new ErreurGelJournal('introuvable');
    if (gel.leveAt !== null) throw new ErreurGelJournal('deja_leve');
    const exclus = [gel.poseParId, gel.utilisateurViseId].filter((x): x is string => x !== null);
    if (exclus.includes(d.acteur.id)) {
      // Personne d'autre ne pourrait-il lever ? Alors le gel reste posé, et l'écran le dit.
      // Les autres administrateurs actifs, et leur validation LUE (un en attente ne lève pas).
      const autres = await tx.utilisateurConsole.findMany({
        where: { role: 'admin', desactiveAt: null, id: { notIn: exclus } },
        select: { id: true, valideAt: true },
      });
      const personne = !autres.some((a) => a.valideAt !== null);
      throw new ErreurGelJournal(personne ? 'aucun_autre_administrateur' : 'leveur_interdit');
    }
    const { count } = await tx.journalAccesConsoleGel.updateMany({
      where: { id: gel.id, leveAt: null },
      data: { leveParId: d.acteur.id, leveAt: d.maintenant },
    });
    if (count === 0) throw new ErreurGelJournal('deja_leve');
    await ajouterEvenement(tx, {
      type: 'journal_acces_gel_modifie',
      agregat: 'journal_acces_gel',
      agregatId: gel.id,
      survenuAt: d.maintenant,
      charge: {
        geste: 'lever',
        motif: gel.motif,
        portee: { type: gel.utilisateurViseId === null ? 'cible' : 'utilisateur' },
        referenceEmpreinte: empreinteDeLaReference(gel.reference, cles),
        acteur: { par: 'utilisateur_console' },
      },
    });
  });
}

/** Levée quand le curseur de la liste est forgé ou illisible : rien n'est lu. */
export class CurseurDesGelsIllisible extends Error {
  constructor() {
    super('curseur de la liste des gels illisible');
    this.name = 'CurseurDesGelsIllisible';
  }
}

/** Un gel de la liste : aucun identifiant de personne ni de cible, la portée par son type seul. */
export interface GelDeLaListe {
  readonly id: string;
  readonly motif: MotifGelJournal;
  readonly reference: string;
  readonly portee: 'utilisateur' | 'cible';
  readonly depuis: Date;
  readonly jusquA: Date | null;
  readonly poseAt: Date;
  readonly leveAt: Date | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POSITION = /^(\d{1,15})\.([0-9a-f-]{36})$/;

/** Le curseur : la position de la dernière ligne rendue, opaque pour le navigateur. */
function ecrireLeCurseur(g: { poseAt: Date; id: string }): string {
  return Buffer.from(`${g.poseAt.getTime()}.${g.id}`, 'utf8').toString('base64url');
}

/** Le curseur relu ; toute autre forme est refusée AVANT de lire. */
function lireLeCurseur(curseur: string): { poseAt: Date; id: string } {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(curseur)) throw new CurseurDesGelsIllisible();
  const m = POSITION.exec(Buffer.from(curseur, 'base64url').toString('utf8'));
  if (!m || !UUID.test(m[2]!)) throw new CurseurDesGelsIllisible();
  return { poseAt: new Date(Number(m[1])), id: m[2]! };
}

/** La taille de page : celle demandée, ramenée entre 1 et le plafond ; le plafond par défaut. */
function tailleDeLaPage(demandee: number | undefined): number {
  const max = GELS_JOURNAL_ACCES_PAGE_MAX.valeur;
  if (demandee === undefined || !Number.isFinite(demandee)) return max;
  return Math.min(max, Math.max(1, Math.trunc(demandee)));
}

/** Une page de la liste des gels, les plus récents d'abord, tracée avant d'être rendue. */
export async function lireLesGels(
  prisma: PrismaClient,
  d: { lecteur: ActeurDuGel; adresse: string | null; curseur: string | null; taille?: number },
  cles: ClesPii
): Promise<{ gels: GelDeLaListe[]; suivant: string | null }> {
  const apres = d.curseur === null ? null : lireLeCurseur(d.curseur);
  const taille = tailleDeLaPage(d.taille);
  return prisma.$transaction(async (tx) => {
    // La règle des gestes : le rôle de la session, puis l'admin actif et VALIDÉ relu en base.
    await exigerUnAdministrateurValide(tx, d.lecteur, 'ecran:gels_journal_acces');
    const lues = await tx.journalAccesConsoleGel.findMany({
      ...(apres === null
        ? {}
        : {
            where: {
              OR: [
                { poseAt: { lt: apres.poseAt } },
                { poseAt: apres.poseAt, id: { lt: apres.id } },
              ],
            },
          }),
      orderBy: [{ poseAt: 'desc' }, { id: 'desc' }],
      take: taille + 1,
      select: {
        id: true,
        motif: true,
        reference: true,
        utilisateurViseId: true,
        depuis: true,
        jusquA: true,
        poseAt: true,
        leveAt: true,
      },
    });
    const page = lues.slice(0, taille);
    const vises = [
      ...new Set(page.map((g) => g.utilisateurViseId).filter((x): x is string => x !== null)),
    ];
    for (const vise of vises)
      await tx.journalAccesConsole.create({
        data: {
          id: randomUUID(),
          utilisateurConsoleId: d.lecteur.id,
          nature: 'lecture_journal_acces',
          cibleId: vise,
          ipHash: d.adresse === null ? null : empreinteAdresseReseau(d.adresse, cles),
        },
      });
    const derniere = page.at(-1);
    return {
      gels: page.map((g) => ({
        id: g.id,
        motif: g.motif,
        reference: g.reference,
        portee: g.utilisateurViseId === null ? 'cible' : 'utilisateur',
        depuis: g.depuis,
        jusquA: g.jusquA,
        poseAt: g.poseAt,
        leveAt: g.leveAt,
      })),
      suivant: lues.length > taille && derniere ? ecrireLeCurseur(derniere) : null,
    };
  });
}
