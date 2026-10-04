// @req REQ-UX-003
// @req REQ-UX-002
/**
 * UX-P0-01b — les libellés que l'apporteur lit pour chacun des treize états de son dépôt
 * (`src/content/micro-copy/espace/etats-attribution.ts`), écrits une fois les états posés dans
 * le schéma.
 *
 * CE QU'IL GARDE :
 *   (1) CHAQUE état de l'enum a son libellé visible et sa phrase d'explication ; la liste des états
 *       est DÉRIVÉE de l'enum (`ETATS_ATTRIBUTION`), jamais retapée (RM-01) ; une date de fin,
 *       quand l'état en a une, est le paramètre `{dateFin}` de sa phrase ;
 *   (2) aucun libellé ne nomme l'autre apporteur, ni par son identité, ni par une date de dépôt, ni
 *       par un stade ; l'état d'attente reprend `FORMULES.dejaReservee` ;
 *   (3) la micro-copie réelle passe la garde lexicale (REQ-UX-003) — c'est le témoin de
 *       `vocabulaire-et-micro-copy.spec.ts`, qui balaie tout `src/content/micro-copy/espace/**` ;
 *   (4) TÉMOIN À DEUX FACES : un état ajouté à l'enum sans son libellé est NOMMÉ ; les treize
 *       états libellés sortent à zéro, avec le compte des états réellement confrontés.
 */
import { describe, it, expect } from 'vitest';
import { ETATS_ATTRIBUTION } from '../../../src/domain/attribution/machine';
import { FORMULES } from '../../../src/content/micro-copy/espace/vocabulaire';
import { LIBELLES_DES_ETATS } from '../../../src/content/micro-copy/espace/etats-attribution';

type Libelles = Readonly<Record<string, { libelle: string; phrase: string } | undefined>>;

/** Les états de `etats` sans libellé ou sans phrase dans `libelles` — NOMMÉS, dans l'ordre de l'enum. */
function etatsSansLibelle(etats: readonly string[], libelles: Libelles): string[] {
  return etats.filter((e) => {
    const l = libelles[e];
    return !l || l.libelle.trim() === '' || l.phrase.trim() === '';
  });
}

/** Ce qu'un texte ne dit jamais de l'occupant : son identité, sa date de dépôt, son stade. */
const NOMME_L_OCCUPANT =
  /(?<![\p{L}])(?:autre apporteur|un apporteur|l['’]apporteur|déposée? (?:le|par)|depuis le|en (?:rendez-vous|proposition|signature) (?:chez|avec) )/iu;

describe('REQ-UX-003 — (1) et (4) chaque état a son libellé, dérivé de l’enum', () => {
  it('REQ-UX-003 : TÉMOIN — les treize états de l’enum sont libellés, et seulement eux', () => {
    expect(ETATS_ATTRIBUTION).toHaveLength(13);
    expect(etatsSansLibelle(ETATS_ATTRIBUTION, LIBELLES_DES_ETATS)).toEqual([]);
    // Aucun libellé pour un état que l'enum ne déclare pas.
    expect(Object.keys(LIBELLES_DES_ETATS).sort()).toEqual([...ETATS_ATTRIBUTION].sort());
  });

  it('REQ-UX-003 : TÉMOIN À DEUX FACES — un état ajouté sans libellé est NOMMÉ ; un libellé vidé aussi', () => {
    expect(etatsSansLibelle([...ETATS_ATTRIBUTION, 'etat_neuf'], LIBELLES_DES_ETATS)).toEqual([
      'etat_neuf',
    ]);
    const vide = { ...LIBELLES_DES_ETATS, perdue: { libelle: '', phrase: 'x' } };
    expect(etatsSansLibelle(ETATS_ATTRIBUTION, vide)).toEqual(['perdue']);
  });

  it('REQ-UX-003 : une date de fin ne s’écrit que par le paramètre `{dateFin}`, jamais en clair', () => {
    for (const e of ETATS_ATTRIBUTION) {
      const { libelle, phrase } = LIBELLES_DES_ETATS[e];
      expect(libelle, e).not.toMatch(/\{/);
      expect(`${libelle} ${phrase}`, e).not.toMatch(/\b\d{1,2}(?:er)? [a-zéû]+ \d{4}\b/);
    }
  });
});

describe('REQ-UX-002 — (2) aucun libellé ne nomme l’autre apporteur', () => {
  it('REQ-UX-002 : TÉMOIN — ni identité, ni date de dépôt, ni stade de l’occupant ; l’attente dit « déjà réservée »', () => {
    for (const e of ETATS_ATTRIBUTION) {
      const { libelle, phrase } = LIBELLES_DES_ETATS[e];
      expect(`${libelle} ${phrase}`, e).not.toMatch(NOMME_L_OCCUPANT);
    }
    expect(LIBELLES_DES_ETATS.en_attente.phrase).toContain(FORMULES.dejaReservee);
  });

  it('REQ-UX-002 : CONTRE-TÉMOINS — la règle rougit sur l’occupant nommé, et laisse passer l’apporteur lui-même', () => {
    for (const faute of [
      'Un autre apporteur suit cette entreprise.',
      'Réservée par un apporteur depuis le 3 mars.',
      'Déposée le 2 mars par une autre personne.',
    ])
      expect(faute).toMatch(NOMME_L_OCCUPANT);
    expect('Votre dépôt est le premier en attente.').not.toMatch(NOMME_L_OCCUPANT);
  });
});

describe('REQ-UX-002 — les textes tranchés par la juriste (2026-10-03)', () => {
  it('REQ-UX-002 : TÉMOIN — mot pour mot, la confirmation en cours, la non-confirmation, l’annulation, la fin sans suite, la fin de contrat et la fin du droit', () => {
    expect(LIBELLES_DES_ETATS.provisoire).toEqual({
      libelle: 'En cours de confirmation',
      phrase:
        'Votre dépôt est enregistré. Axion-IA demande à l’entreprise de confirmer votre échange.',
    });
    expect(LIBELLES_DES_ETATS.invalidee).toEqual({
      libelle: 'Non confirmée',
      phrase: 'Ce dépôt a pris fin. Le motif vous a été indiqué par notification.',
    });
    expect(LIBELLES_DES_ETATS.annulee).toEqual({
      libelle: 'Annulée',
      phrase: 'Ce dépôt est annulé. Le motif vous a été indiqué par notification.',
    });
    expect(LIBELLES_DES_ETATS.perimee).toEqual({
      libelle: 'Terminée sans suite',
      phrase:
        'Aucun rendez-vous, devis ni commande dans le délai prévu par le contrat : ce dépôt a pris fin. L’entreprise est de nouveau disponible.',
    });
    expect(LIBELLES_DES_ETATS.figee_resiliation).toEqual({
      libelle: 'Contrat terminé',
      phrase: 'Votre contrat a pris fin.',
    });
    expect(LIBELLES_DES_ETATS.expiree).toEqual({
      libelle: 'Droit à commission terminé',
      phrase:
        'Ce dépôt a pris fin le {dateFin} : sa durée est écoulée, ou votre contrat a pris fin.',
    });
  });

  it('REQ-UX-002 : TÉMOIN — aucun badge ne dit le motif ni n’accuse, ni ne promet un nouveau dépôt « pour cette fois »', () => {
    for (const e of ETATS_ATTRIBUTION) {
      const t = `${LIBELLES_DES_ETATS[e].libelle} ${LIBELLES_DES_ETATS[e].phrase}`;
      expect(t, e).not.toMatch(/faute|anomalie|fraude|sanction|pour cette fois/i);
    }
  });
});
