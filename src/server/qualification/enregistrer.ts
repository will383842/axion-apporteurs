/**
 * DM-09 — l'écriture d'une Qualification (REQ-DM-008, REQ-CPL-024, REQ-DM-031). Dans UNE SEULE
 * transaction, celle de l'appelant :
 *   1. le VERROU OPTIMISTE : `attributions.version_qualification` passe de la version attendue à la
 *      suivante, ou rien n'est écrit et le refus rend la version COURANTE (REQ-CPL-024) ;
 *   2. la qualification est INSÉRÉE, en ajout seul ; la personne interrogée et les termes de sa réponse
 *      naissent chiffrés par `colonnesPii`, liés à l'identifiant de la ligne ;
 *   3. le PREMIER CONTACT : une qualification qui a JOINT le contact (tout résultat sauf `injoignable`)
 *      pose `premier_contact_at` s'il est encore nul (contrat art. 3.4, HYP-W20-PREMIER-CONTACT) ;
 *   4. l'EFFET du résultat (`effetDuResultat`) passe par l'écrivain des transitions de DM-08, importé
 *      tel quel, avec le même client de transaction : `non_confirme` éteint l'attribution
 *      (`non_confirmee`) ; `confirme` la confirme quand elle est encore `provisoire` ; les autres la
 *      maintiennent. Un refus de la machine lève, et RIEN n'est écrit, qualification comprise.
 *
 * Aucun taux ni palier par apporteur n'est dérivé ici : Williams a retiré le palier le 2026-10-03,
 * « non pas pour le moment ».
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  effetDuResultat,
  jugerLaVersion,
  type JugementDeVersion,
  type ResultatContact,
} from '../../domain/qualification/qualification';
import { confirmerUneAttribution, transitionnerUneAttribution } from '../attribution/transitionner';
import { colonnesPii, type ClesPii } from '../securite/pii';

type Tx = Prisma.TransactionClient;

export interface Saisie {
  readonly attributionId: string;
  /** La version de la fiche que l'écran a lue. */
  readonly versionLue: number;
  readonly resultatContact: ResultatContact;
  readonly interet: 'eleve' | 'moyen' | 'faible' | 'nul' | null;
  readonly prochaineEtape: 'rdv' | 'rappeler' | 'proposition' | 'perdue' | 'aucune';
  readonly motifPerte:
    'pas_de_besoin' | 'deja_equipe' | 'hors_cible' | 'injoignable_definitif' | 'autre' | null;
  readonly rdvAt: Date | null;
  readonly rappelerAt: Date | null;
  readonly personneInterrogee: string | null;
  readonly termesReponse: string | null;
  readonly auteurId: string;
  readonly maintenant: Date;
  readonly cles: ClesPii;
}

export type IssueDEnregistrement =
  | { readonly ok: true; readonly qualificationId: string; readonly version: number }
  | Extract<JugementDeVersion, { ok: false }>;

/** Écrit la qualification et son effet, ou rend le refus du verrou optimiste. */
export async function enregistrerUneQualification(
  tx: Tx,
  s: Saisie
): Promise<IssueDEnregistrement> {
  const [ligne] = await tx.$queryRaw<{ version: number; statut: string }[]>`
    SELECT version_qualification AS version, statut::text AS statut
    FROM attributions WHERE id = ${s.attributionId}::uuid FOR UPDATE`;
  if (!ligne) throw new Error('attribution_introuvable');
  const jugement = jugerLaVersion({ attendue: s.versionLue, courante: ligne.version });
  if (!jugement.ok) return jugement;

  const version = ligne.version + 1;
  await tx.attribution.update({
    where: { id: s.attributionId },
    data: { versionQualification: version },
  });

  const id = randomUUID();
  await tx.qualification.create({
    data: {
      attributionId: s.attributionId,
      resultatContact: s.resultatContact,
      interet: s.interet,
      prochaineEtape: s.prochaineEtape,
      motifPerte: s.motifPerte,
      rdvAt: s.rdvAt,
      rappelerAt: s.rappelerAt,
      auteurId: s.auteurId,
      // Les blocs naissent de colonnesPii, ÉTALÉ (garde securite:schema-pii) ; son `id` est celui de
      // la ligne. Prisma 5 accepte un Uint8Array là où il type Buffer.
      ...(colonnesPii(
        { modele: 'qualification', id },
        { personneInterrogee: s.personneInterrogee, termesReponse: s.termesReponse },
        s.cles
      ) as unknown as Pick<
        Prisma.QualificationUncheckedCreateInput,
        'id' | 'personneInterrogeeChiffre' | 'termesReponseChiffre'
      >),
    },
  });

  if (s.resultatContact !== 'injoignable') {
    await tx.attribution.updateMany({
      where: { id: s.attributionId, premierContactAt: null },
      data: { premierContactAt: s.maintenant },
    });
  }

  const effet = effetDuResultat(s.resultatContact);
  const acteur = { par: 'utilisateur_console' as const, id: s.auteurId };
  if (effet.attribution === 'eteinte') {
    await transitionnerUneAttribution(tx, {
      attributionId: s.attributionId,
      transition: 'non_confirmee',
      acteur,
      maintenant: s.maintenant,
    });
  } else if (effet.attribution === 'confirmee' && ligne.statut === 'provisoire') {
    await confirmerUneAttribution(tx, {
      attributionId: s.attributionId,
      transition: 'confirmee',
      acteur,
      maintenant: s.maintenant,
      // L'existence d'une commande valable rattachée est portée par DM-15, pas encore livrée : une
      // attribution ne peut pas en porter avant elle.
      commandeValableRattachee: false,
    });
  }
  return { ok: true, qualificationId: id, version };
}
