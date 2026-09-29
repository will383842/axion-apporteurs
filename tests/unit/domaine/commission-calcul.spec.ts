// @req REQ-DM-015
// @req REQ-ARG-006 → REQ-DM-015
// @req REQ-ARG-007
// @req REQ-ARG-017
// @req REQ-DM-040
/**
 * Le calcul de commission d'une ligne, fonction pure — DM-04 (avenant A01 du 2026-09-29).
 *
 * LA GRILLE est la publication du producteur, pseudonymisée par lui (la fixture de l’import de la grille) : aucune
 * valeur réelle de la grille n'entre dans ce dépôt, et aucune n'est tapée ici. Les montants attendus
 * se LISENT dans la grille — un forfait vaut le `montantCents` de sa ligne, pas un nombre recopié.
 *
 * LE CHOIX DU BARÈME vit une seule fois, dans axionia : la ligne de devis arrive avec son
 * `commissionId`. L'activité et les journées sont des entrées, jamais un sélecteur (avenant A01).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculerCommission, type EntreeCalcul } from '../../../src/domain/commission/calcul';
import {
  BPS_MAX,
  lirePublication,
  type ContenuGrille,
} from '../../../src/domain/commission/grille';
import { PARAMETRES } from '../../../src/domain/seuils/ssot';

const FIXTURE = join(
  __dirname,
  '..',
  '..',
  'fixtures',
  'axionia',
  'commissions.v1.pseudonymise.json'
);
const grille: ContenuGrille = lirePublication(
  (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { publication: unknown }).publication
).contenu;

const ligneDe = (kind: 'flat' | 'percent' | 'scale') => {
  const l = grille.commissions.find((c) => c.kind === kind);
  if (!l) throw new Error(`témoin mal posé : aucune commission « ${kind} » dans la grille`);
  return l;
};

/**
 * Les cinq valeurs de l'enum `ActiviteFacturation` d'axionia (`prisma/schema.prisma` d'axionia,
 * lu le 2026-09-29). Elles ne sont pas encore au glossaire de ce dépôt : le `gardien-spec` les
 * verse. Cette liste ne sert qu'à PROUVER qu'aucune d'elles ne change le verdict.
 */
const ACTIVITES = ['formation', 'un_a_un', 'audit', 'implementation', 'site_web'] as const;

/** Une entrée où CHAQUE champ dont dépend l'assertion est explicite (RM-11). */
const entree = (e: Omit<EntreeCalcul, 'grille'>): EntreeCalcul => ({ grille, ...e });

describe('REQ-DM-015 — une fonction pure : un montant en centimes, ou un blocage motivé', () => {
  it('REQ-DM-015 : un forfait vaut le montant de sa ligne de grille', () => {
    const flat = ligneDe('flat');
    expect(
      calculerCommission(
        entree({
          commissionId: flat.commissionId,
          activite: 'formation',
          jours: 1,
          montantHtCents: 1_000_000,
        })
      )
    ).toEqual({
      statut: 'calculee',
      commissionId: flat.commissionId,
      montantCents: flat.montantCents,
    });
  });

  it('REQ-DM-015, REQ-ARG-006 → REQ-DM-015 — TÉMOIN : le forfait se compte UNE fois, jamais multiplié par les journées (correction du 2026-09-03)', () => {
    const flat = ligneDe('flat');
    const pour = (jours: number) =>
      calculerCommission(
        entree({
          commissionId: flat.commissionId,
          activite: 'formation',
          jours,
          montantHtCents: 1_000_000,
        })
      );
    expect(pour(2)).toEqual(pour(1));
    expect(pour(5)).toEqual(pour(1));
    expect(pour(2)).toMatchObject({ montantCents: flat.montantCents });
  });

  it('REQ-DM-015 : un pourcentage vaut round(tauxBps × HT / 10 000 bps), en entiers', () => {
    const pct = ligneDe('percent');
    const base = BPS_MAX; // 100 % en points de base
    // HT choisi pour tomber sur un demi-centime : l'arrondi va au centime supérieur.
    const ht = base / 2;
    const attendu = Math.floor((pct.tauxBps! * ht * 2 + base) / (2 * base));
    expect(
      calculerCommission(
        entree({
          commissionId: pct.commissionId,
          activite: 'audit',
          jours: null,
          montantHtCents: ht,
        })
      )
    ).toEqual({ statut: 'calculee', commissionId: pct.commissionId, montantCents: attendu });
  });

  it('REQ-DM-015 : une commission `scale` BLOQUE (a_qualifier), jamais zéro', () => {
    const scale = ligneDe('scale');
    expect(
      calculerCommission(
        entree({
          commissionId: scale.commissionId,
          activite: 'un_a_un',
          jours: 1,
          montantHtCents: 100_000,
        })
      )
    ).toEqual({ statut: 'bloquee', commissionId: scale.commissionId, motifBlocage: 'a_qualifier' });
  });

  it('REQ-DM-015 : sans commissionId, ou un commissionId absent de la grille : bloquée, jamais zéro', () => {
    expect(
      calculerCommission(
        entree({ commissionId: null, activite: 'site_web', jours: null, montantHtCents: 100_000 })
      )
    ).toEqual({ statut: 'bloquee', commissionId: null, motifBlocage: 'a_qualifier' });
    expect(
      calculerCommission(
        entree({
          commissionId: 'commission-inconnue',
          activite: 'audit',
          jours: null,
          montantHtCents: 100_000,
        })
      )
    ).toEqual({
      statut: 'bloquee',
      commissionId: 'commission-inconnue',
      motifBlocage: 'a_qualifier',
    });
  });

  it('REQ-DM-015, REQ-DM-040 : pour les cinq activités, le verdict ne dépend QUE de commissionId', () => {
    for (const c of grille.commissions) {
      const verdicts = ACTIVITES.map((activite) =>
        calculerCommission(
          entree({ commissionId: c.commissionId, activite, jours: 2, montantHtCents: 1_000_000 })
        )
      );
      expect(new Set(verdicts.map((v) => JSON.stringify(v))).size, c.commissionId).toBe(1);
    }
  });

  it('REQ-DM-015 : une entrée hors domaine (HT négatif ou non entier) bloque, sans lever', () => {
    const flat = ligneDe('flat');
    for (const montantHtCents of [-1, 1.5, Number.NaN]) {
      expect(
        calculerCommission(
          entree({
            commissionId: flat.commissionId,
            activite: 'formation',
            jours: 1,
            montantHtCents,
          })
        )
      ).toEqual({
        statut: 'bloquee',
        commissionId: flat.commissionId,
        motifBlocage: 'a_qualifier',
      });
    }
  });
});

describe('REQ-ARG-007, REQ-ARG-017 — le plafond, lu dans la SSOT des seuils', () => {
  it('REQ-ARG-007, REQ-ARG-017 — TÉMOIN : une commission supérieure au plafond du HT bloque (commission_sup_ht)', () => {
    const flat = ligneDe('flat');
    // Un HT d'un centime de moins que le forfait : le forfait dépasse 100 % du HT.
    expect(
      calculerCommission(
        entree({
          commissionId: flat.commissionId,
          activite: 'formation',
          jours: 1,
          montantHtCents: flat.montantCents! - 1,
        })
      )
    ).toEqual({
      statut: 'bloquee',
      commissionId: flat.commissionId,
      motifBlocage: 'commission_sup_ht',
    });
    // Contre-témoin : au plafond exactement, la ligne passe.
    expect(
      calculerCommission(
        entree({
          commissionId: flat.commissionId,
          activite: 'formation',
          jours: 1,
          montantHtCents: flat.montantCents!,
        })
      )
    ).toMatchObject({ statut: 'calculee' });
  });

  it('REQ-ARG-007 : le plafond vient de la SSOT, avec sa source et sa date', () => {
    expect(PARAMETRES.PLAFOND_COMMISSION_BPS).toMatchObject({ unite: 'points_de_base' });
    expect(PARAMETRES.PLAFOND_COMMISSION_BPS.source).toMatch(/REQ-ARG-007/);
    expect(PARAMETRES.PLAFOND_COMMISSION_BPS.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
