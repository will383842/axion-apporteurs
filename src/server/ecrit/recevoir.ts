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
 * L'apporteur est celui de la SESSION, passé par l'appelant, jamais lu dans la requête.
 */
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ECRIT_CARACTERES_MAX } from '../../domain/seuils/ssot';
import { encryptPii, nettoyerUnTexteSaisi, type ClesPii } from '../securite/pii';

/** Le modèle de l'AAD du texte d'un écrit. */
export const MODELE_DE_L_ECRIT = 'EcritApporteur';

export type RefusDeLEcrit = 'message_vide' | 'trop_long';

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

/** Reçoit l'écrit de l'apporteur de la session ; rend son identifiant et sa date, POSÉE PAR LA BASE. */
export async function recevoirUnEcrit(
  prisma: Pick<PrismaClient, 'ecritApporteur'>,
  d: { apporteurId: string; texte: string },
  cles: ClesPii
): Promise<{ ecritId: string; recuAt: Date }> {
  const texte = jugerLEcrit(d.texte);
  const id = randomUUID();
  const ecrit = await prisma.ecritApporteur.create({
    data: {
      id,
      apporteurId: d.apporteurId,
      texteChiffre: Buffer.from(
        encryptPii({ modele: MODELE_DE_L_ECRIT, champ: 'texteChiffre', id }, texte, cles)
      ),
    },
    select: { id: true, recuAt: true },
  });
  return { ecritId: ecrit.id, recuAt: ecrit.recuAt };
}
