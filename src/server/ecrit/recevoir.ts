/**
 * L'ÉCRIT de l'apporteur — « Écrire à Axion-IA » (arbitrage #319 6038136969 ; forme d'A02 #319
 * 6038168915 ; textes et condition de la juriste #474 6038112933, #319 6038148824).
 *
 * Un écrit est un texte, reçu une fois. Sa date de RÉCEPTION est posée par la BASE à l'insertion (une
 * valeur fournie serait écrasée) ; c'est elle que la confirmation affiche, et elle que cite une
 * contestation enregistrée ensuite par la console : jamais l'instant d'une saisie. La confirmation ne
 * s'affiche qu'APRÈS l'écriture réussie : cette fonction rend la date lue sur la ligne écrite.
 *
 * Le texte est nettoyé, jugé non vide et borné par `ECRIT_CARACTERES_MAX` (points de code), sans
 * troncature ; il est chiffré sous l'AAD de SON écrit. Il n'entre ni au journal ni dans un message.
 * L'écriture passe par la COUCHE de cloisonnement (modèle en ajout seul) : l'apporteur est celui de la
 * SESSION, posé par la couche, jamais lu dans la requête ; elle ne rend que l'identifiant et la date.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ECRIT_CARACTERES_MAX } from '../../domain/seuils/ssot';
import { encryptPii, nettoyerUnTexteSaisi, type ClesPii } from '../securite/pii';
import type { AccesApporteur } from '../acces/for-apporteur';

/** Le modèle de l'AAD du texte d'un écrit. */
export const MODELE_DE_L_ECRIT = 'EcritApporteur';

export type RefusDeLEcrit =
  'demande_invalide' | 'cle_invalide' | 'cle_deja_employee' | 'message_vide' | 'trop_long';

export class ErreurEcrit extends Error {
  constructor(readonly motif: RefusDeLEcrit) {
    super(`écrit : ${motif}`);
    this.name = 'ErreurEcrit';
  }
}

/** Le texte saisi, jugé AVANT toute écriture : un refus n'écrit rien. */
export function jugerLEcrit(brut: string): string {
  const texte = nettoyerUnTexteSaisi(brut);
  if (texte.trim() === '') throw new ErreurEcrit('message_vide');
  if ([...texte].length > ECRIT_CARACTERES_MAX.valeur) throw new ErreurEcrit('trop_long');
  return texte;
}

/**
 * La demande, FERMÉE (sécurité) : un champ hors liste — un `id`, un apporteur, une date — la fait
 * REFUSER, jamais ignorer. L'identifiant de l'écrit est tiré ici, par le serveur, et par lui seul.
 */
const DEMANDE_D_ECRIT = z.object({ texte: z.string(), cleIdempotence: z.string() }).strict();
const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La violation d'unicité de Prisma : la clé a été employée entre la lecture et l'écriture. */
const estUnDoublon = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';

/** Reçoit l'écrit de l'apporteur de la session ; rend son identifiant et sa date, POSÉE PAR LA BASE. */
export async function recevoirUnEcrit(
  acces: Pick<AccesApporteur, 'ecritApporteur'>,
  d: { texte: string; cleIdempotence: string },
  cles: ClesPii
): Promise<{ ecritId: string; recuAt: Date }> {
  const demande = DEMANDE_D_ECRIT.safeParse(d);
  if (!demande.success) throw new ErreurEcrit('demande_invalide');
  const { cleIdempotence } = demande.data;
  // La clé tirée au rendu, rapportée telle quelle : absente ou mal formée, refusée AVANT l'écriture.
  if (!FORME_UUID.test(cleIdempotence)) throw new ErreurEcrit('cle_invalide');
  const texte = jugerLEcrit(demande.data.texte);
  // Une clé déjà employée dans la MÊME session rend l'écrit existant : même id, même date.
  const dejaRecu = async () =>
    (await acces.ecritApporteur.lister({ where: { cleIdempotence }, take: 1 }))[0];
  const existant = await dejaRecu();
  if (existant !== undefined) return { ecritId: existant.id, recuAt: existant.recuAt };
  const id = randomUUID();
  try {
    const ecrit = await acces.ecritApporteur.creer({
      id,
      cleIdempotence,
      texteChiffre: Buffer.from(
        encryptPii({ modele: MODELE_DE_L_ECRIT, champ: 'texteChiffre', id }, texte, cles)
      ),
    });
    return { ecritId: ecrit.id, recuAt: ecrit.recuAt };
  } catch (e) {
    if (!estUnDoublon(e)) throw e;
    // Deux envois concurrents : le second relit celui qui a gagné, s'il est de la session ; une clé
    // d'un AUTRE apporteur est refusée, sans rien en dire.
    const gagnant = await dejaRecu();
    if (gagnant !== undefined) return { ecritId: gagnant.id, recuAt: gagnant.recuAt };
    throw new ErreurEcrit('cle_deja_employee');
  }
}
