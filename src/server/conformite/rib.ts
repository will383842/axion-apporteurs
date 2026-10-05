/**
 * Le RIB à quatre yeux (CPL-T24, REQ-UX-027, REQ-DM-027 ; forme d'A02 des rattrapages 105 et 106 ;
 * conditions de la sécurité).
 *
 * UN RIB NE DEVIENT VERSABLE QU'APRÈS DEUX REGARDS DISTINCTS :
 *  — VÉRIFIER (`verifierUnRib`) : un administrateur contrôle HORS BANDE, par un appel à un numéro
 *    connu par ailleurs, jamais celui de la pièce ; le regard et sa date s'écrivent une fois ;
 *  — CONFIRMER (`confirmerUnRib`) : un AUTRE administrateur validé confirme, et la pièce passe
 *    `valide` DANS LA MÊME ÉCRITURE ; la courante, s'il y en a une, est écartée (`remplacee_at`).
 * Les deux gestes relèvent de `action:verifier_rib` (admin, sous step-up). Personne ne vérifie ni
 * ne confirme un RIB sur un dossier qu'il a ouvert : l'acteur d'`ouvrir_kyc` est relu au journal. La
 * base tient le reste, contre tout appelant : la garde `pieces_kyc_rib_quatre_yeux_garde`
 * (administrateur actif et validé, écriture unique, `valide` seulement par la confirmation) et les
 * CHECK (deux personnes, confirmation après vérification).
 *
 * LE JUGE DU VERSEMENT (`exigerUnRibVersable`), pour l'ordre de virement (T-ARG-018) : dans SA
 * transaction, la pièce est relue sous `FOR SHARE`, et le refus est FERMÉ (`rib_non_valide`, sans dire
 * laquelle des conditions a manqué). L'empreinte de l'IBAN validé est celle de la pièce : la base la
 * fige (SEC-49), un changement de RIB est une nouvelle pièce.
 *
 * CE MODULE NE LIT JAMAIS L'IBAN (condition de la sécurité) : ni son bloc chiffré, ni le fichier de
 * la pièce, ni aucun déchiffrement. Aucune route ni aucun écran ne l'appelle encore : la lecture de
 * l'IBAN pour le contrôle hors bande viendra avec l'écran, par un lecteur journalisé (SEC-58).
 * Aucune donnée de personne dans un refus ou un événement.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { ajouterEvenement } from '../evenement/journal';
import { roleAutorise } from '../roles/matrice';
import { empreinteRecherche, type ClesPii } from '../securite/pii';
import type { ActeurDuDossier } from './dossier';

export type MotifDuRib =
  | 'droit_absent'
  | 'introuvable'
  | 'pas_un_rib'
  | 'pas_a_verifier'
  | 'deja_verifie'
  | 'pas_encore_verifie'
  | 'deja_confirme'
  | 'meme_regard'
  | 'auteur_de_l_ouverture';

export class ErreurRibQuatreYeux extends Error {
  constructor(readonly motif: MotifDuRib) {
    super(`rib_quatre_yeux : ${motif}`);
    this.name = 'ErreurRibQuatreYeux';
  }
}

/** Le refus FERMÉ du versement : il ne dit pas laquelle des conditions a manqué. */
export class RibNonValide extends Error {
  constructor() {
    super('rib_non_valide');
    this.name = 'RibNonValide';
  }
}

type Tx = Prisma.TransactionClient;

/** L'écriture d'un événement chaîné ; injectable pour le témoin en processus. */
type EcrireUnEvenement = (tx: Tx, e: Parameters<typeof ajouterEvenement>[1]) => Promise<unknown>;

const DROIT = 'action:verifier_rib';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigerLeDroit(acteur: ActeurDuDossier): void {
  if (!roleAutorise(DROIT, acteur.role)) throw new ErreurRibQuatreYeux('droit_absent');
}

/** La pièce, lue pour un regard : son type, son état et ses deux regards ; jamais l'IBAN. */
function lireLaPiece(tx: Tx, pieceId: string) {
  return tx.pieceKyc.findUnique({
    where: { id: pieceId },
    select: {
      id: true,
      apporteurId: true,
      type: true,
      statut: true,
      ribVerifieParId: true,
      ribVerifieAt: true,
      ribConfirmeAt: true,
    },
  });
}

/** Refuse l'acteur s'il a ouvert le dossier de cet apporteur : l'ouverture est relue au journal. */
async function exigerUnAutreQueLOuvreur(tx: Tx, apporteurId: string, acteurId: string) {
  const ouvreurs = await tx.$queryRaw<{ id: string | null }[]>`
    SELECT "charge"->'acteur'->>'id' AS id FROM "evenements"
    WHERE "agregat_id" = ${apporteurId}::uuid AND "type" = 'apporteur_statut_modifie'
      AND "charge"->>'transition' = 'ouvrir_kyc'`;
  if (ouvreurs.some((o) => o.id === acteurId))
    throw new ErreurRibQuatreYeux('auteur_de_l_ouverture');
}

/** Le premier regard : vérifier hors bande un RIB à vérifier. Le statut ne change pas. */
export async function verifierUnRib(
  prisma: PrismaClient,
  d: { acteur: ActeurDuDossier; pieceId: string; maintenant: Date }
): Promise<void> {
  exigerLeDroit(d.acteur);
  await prisma.$transaction(async (tx) => {
    const piece = await lireLaPiece(tx, d.pieceId);
    if (piece === null) throw new ErreurRibQuatreYeux('introuvable');
    // Ce module n'écrit QUE des RIB : tout autre type est refusé avant toute écriture.
    if (piece.type !== 'rib') throw new ErreurRibQuatreYeux('pas_un_rib');
    if (piece.statut !== 'a_verifier') throw new ErreurRibQuatreYeux('pas_a_verifier');
    if (piece.ribVerifieAt !== null) throw new ErreurRibQuatreYeux('deja_verifie');
    await exigerUnAutreQueLOuvreur(tx, piece.apporteurId, d.acteur.id);
    const { count } = await tx.pieceKyc.updateMany({
      where: { id: piece.id, type: 'rib', statut: 'a_verifier', ribVerifieAt: null },
      data: { ribVerifieParId: d.acteur.id, ribVerifieAt: d.maintenant },
    });
    if (count === 0) throw new ErreurRibQuatreYeux('deja_verifie');
  });
}

/**
 * Le second regard : un AUTRE administrateur confirme un RIB vérifié ; la pièce passe `valide` dans
 * la même écriture, la courante est écartée, et l'événement est écrit, sans IBAN ni empreinte.
 */
export async function confirmerUnRib(
  prisma: PrismaClient,
  d: {
    acteur: ActeurDuDossier;
    pieceId: string;
    maintenant: Date;
    evenement?: EcrireUnEvenement;
  }
): Promise<void> {
  exigerLeDroit(d.acteur);
  const ecrire = d.evenement ?? ajouterEvenement;
  await prisma.$transaction(async (tx) => {
    const piece = await lireLaPiece(tx, d.pieceId);
    if (piece === null) throw new ErreurRibQuatreYeux('introuvable');
    // Ce module n'écrit QUE des RIB : tout autre type est refusé avant toute écriture.
    if (piece.type !== 'rib') throw new ErreurRibQuatreYeux('pas_un_rib');
    if (piece.statut !== 'a_verifier') throw new ErreurRibQuatreYeux('pas_a_verifier');
    if (piece.ribVerifieAt === null) throw new ErreurRibQuatreYeux('pas_encore_verifie');
    if (piece.ribConfirmeAt !== null) throw new ErreurRibQuatreYeux('deja_confirme');
    if (piece.ribVerifieParId === d.acteur.id) throw new ErreurRibQuatreYeux('meme_regard');
    await exigerUnAutreQueLOuvreur(tx, piece.apporteurId, d.acteur.id);
    const courante = await tx.pieceKyc.findFirst({
      where: {
        apporteurId: piece.apporteurId,
        type: 'rib',
        remplaceeAt: null,
        statut: { not: 'a_verifier' },
        id: { not: piece.id },
      },
      select: { id: true },
    });
    if (courante !== null)
      await tx.pieceKyc.update({ where: { id: courante.id }, data: { remplaceeAt: d.maintenant } });
    const { count } = await tx.pieceKyc.updateMany({
      where: {
        id: piece.id,
        type: 'rib',
        statut: 'a_verifier',
        ribVerifieAt: { not: null },
        ribConfirmeAt: null,
      },
      data: {
        statut: 'valide',
        verifieeAt: d.maintenant,
        ribConfirmeParId: d.acteur.id,
        ribConfirmeAt: d.maintenant,
      },
    });
    if (count === 0) throw new ErreurRibQuatreYeux('deja_confirme');
    await ecrire(tx, {
      type: 'piece_kyc_statut_modifie',
      agregat: 'piece_kyc',
      agregatId: piece.id,
      survenuAt: d.maintenant,
      charge: {
        de: 'a_verifier',
        vers: 'valide',
        type: 'rib',
        acteur: { par: 'utilisateur_console', id: d.acteur.id },
      },
    });
  });
}

/**
 * Le juge du versement (T-ARG-018) : la pièce existe, est un RIB de l'APPORTEUR payé, `valide`,
 * confirmée à quatre yeux, non remplacée, et son empreinte est celle de l'IBAN réellement payé,
 * calculée ici par le module même de la pièce. Relue sous `FOR SHARE`, dans la transaction du
 * versement : un remplacement concurrent ne passe pas entre la vérification et l'ordre. Sinon,
 * `rib_non_valide`, sans détail.
 */
export async function exigerUnRibVersable(
  tx: Tx,
  d: { pieceId: string; apporteurId: string; ibanPaye: string; cles: ClesPii }
): Promise<void> {
  if (!UUID.test(d.pieceId)) throw new RibNonValide();
  const [p] = await tx.$queryRaw<
    {
      apporteur_id: string;
      type: string;
      statut: string;
      rib_verifie_at: Date | null;
      rib_confirme_at: Date | null;
      remplacee_at: Date | null;
      iban_hash: string | null;
    }[]
  >`SELECT "apporteur_id", "type", "statut", "rib_verifie_at", "rib_confirme_at", "remplacee_at", "iban_hash" FROM "pieces_kyc" WHERE "id" = ${d.pieceId}::uuid FOR SHARE`;
  const versable =
    p !== undefined &&
    p.type === 'rib' &&
    p.apporteur_id === d.apporteurId &&
    p.statut === 'valide' &&
    p.rib_verifie_at !== null &&
    p.rib_confirme_at !== null &&
    p.remplacee_at === null &&
    p.iban_hash !== null &&
    p.iban_hash === empreinteDuPaye(d.ibanPaye, d.cles);
  if (!versable) throw new RibNonValide();
}

/** L'empreinte de l'IBAN payé, ou `null` s'il n'en a pas la forme : le refus reste fermé. */
function empreinteDuPaye(iban: string, cles: ClesPii): string | null {
  try {
    return empreinteRecherche('iban', iban, cles);
  } catch {
    return null;
  }
}
