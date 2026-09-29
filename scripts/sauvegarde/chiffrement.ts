/**
 * chiffrement.ts — le chiffrement CÔTÉ CLIENT des vidages de Partners (QA-T12, REQ-QA-023).
 *
 * Arbitrage -d7 sur délégation de Williams du 2026-09-29 : le chiffrement natif de R2 au repos ne
 * suffit pas avant la première donnée réelle ; chaque vidage est chiffré par Partners, avec une clé
 * PROPRE à Partners (`PARTNERS_BACKUP_PASSPHRASE`), jamais celle d'un autre produit.
 *
 * FORMAT, version 1 — tout est dans le fichier, rien n'est à deviner au déchiffrement :
 *
 *   MAGIE (19 octets, `PARTNERS-VIDAGE-V1\n`) · sel (16) · vecteur (12) · étiquette GCM (16) · chiffré
 *
 * AES-256-GCM authentifie le contenu : un octet retiré, ajouté ou changé, ou une mauvaise clé, et
 * le déchiffrement échoue — l'exercice le nomme AVANT toute restauration. La clé est dérivée de la
 * phrase par scrypt, avec un sel tiré à chaque chiffrement : deux vidages identiques ne donnent
 * jamais le même fichier. Un fichier sans l'en-tête est nommé « non chiffré » : c'est le refus
 * qu'exige l'avenant de la tâche.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const MAGIE = Buffer.from('PARTNERS-VIDAGE-V1\n', 'ascii');
const SEL = 16;
const VECTEUR = 12;
const ETIQUETTE = 16;
/** Une phrase de passe courte se devine : au moins 32 caractères, comme les secrets de l'application. */
const LONGUEUR_MINIMALE = 32;

function cle(phrase: string, sel: Buffer): Buffer {
  if (phrase.length < LONGUEUR_MINIMALE) {
    throw new Error(
      `PARTNERS_BACKUP_PASSPHRASE doit compter au moins ${LONGUEUR_MINIMALE} caractères`
    );
  }
  return scryptSync(phrase, sel, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function chiffrer(clair: Buffer, phrase: string): Buffer {
  const sel = randomBytes(SEL);
  const vecteur = randomBytes(VECTEUR);
  const c = createCipheriv('aes-256-gcm', cle(phrase, sel), vecteur);
  const chiffre = Buffer.concat([c.update(clair), c.final()]);
  return Buffer.concat([MAGIE, sel, vecteur, c.getAuthTag(), chiffre]);
}

export function estChiffre(fichier: Buffer): boolean {
  return fichier.subarray(0, MAGIE.length).equals(MAGIE);
}

export function dechiffrer(fichier: Buffer, phrase: string): Buffer {
  if (!estChiffre(fichier)) {
    throw new Error('vidage non chiffré côté client : en-tête PARTNERS-VIDAGE-V1 absent');
  }
  let i = MAGIE.length;
  const sel = fichier.subarray(i, (i += SEL));
  const vecteur = fichier.subarray(i, (i += VECTEUR));
  const etiquette = fichier.subarray(i, (i += ETIQUETTE));
  if (etiquette.length !== ETIQUETTE) throw new Error('vidage altéré : en-tête incomplet');
  const d = createDecipheriv('aes-256-gcm', cle(phrase, sel), vecteur);
  d.setAuthTag(etiquette);
  try {
    return Buffer.concat([d.update(fichier.subarray(i)), d.final()]);
  } catch {
    throw new Error('vidage altéré ou mauvaise clé : l’authentification GCM a échoué');
  }
}
