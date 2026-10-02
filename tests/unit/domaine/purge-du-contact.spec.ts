// @req REQ-DM-031
// @req REQ-SEC-030
/**
 * La purge du contact d'une attribution — ce qui se juge sans base (REQ-DM-031, REQ-SEC-030,
 * HYP-RGPD-RETENTION).
 *
 * CE QU'IL PROUVE :
 *   1. LES DURÉES (test HYP) : 90 jours après la libération, 1 095 jours après le dernier contact
 *      d'une convertie ; un changement de l'une ou l'autre fait rougir ce test, et doit passer par
 *      une décision datée au registre ;
 *   2. LE SOUS-MODULE DE LA SSOT : chaque durée de `retention.ts` est dans `SEUILS`, à l'identique,
 *      et AUCUNE n'est définie aussi dans `ssot.ts` ;
 *   3. L'ÉCHÉANCE, statut par statut de la matrice : libérée → +90 j ; convertie → +1 095 j ; tout
 *      autre statut, dont tout occupant non converti → aucune purge ;
 *   4. L'ENTREPRISE INDIVIDUELLE, lue sur la nature juridique ;
 *   5. LES COLONNES effacées, exactement, et la tâche inscrite au registre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EtatAttribution } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { DUREES_DE_RETENTION } from '../../../src/domain/seuils/retention';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import {
  COLONNES_DU_CONTACT,
  ETATS_LIBERES,
  echeanceDePurge,
  coordonneesSEffacent,
} from '../../../src/server/taches/purger-contacts';
import { TACHES } from '../../../src/server/taches/registre';
import { inscriptions } from '../../../src/server/taches/inscriptions';
import type { PrismaClient } from '@prisma/client';

const REFERENCE = new Date('2026-10-02T08:00:00.000Z');
const plus = (jours: number) => new Date(REFERENCE.getTime() + jours * MS_PAR_JOUR);

describe('REQ-SEC-030 — les durées de conservation du contact (HYP-RGPD-RETENTION)', () => {
  it('REQ-SEC-030 : TEST HYP — 90 jours après la libération, 1 095 après le dernier contact d’une convertie', () => {
    expect(SEUILS.CONTACT_PURGE_APRES_LIBERATION_JOURS.valeur).toBe(90);
    expect(SEUILS.CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS.valeur).toBe(1095);
    for (const s of Object.values(DUREES_DE_RETENTION)) {
      expect(s.unite).toBe('jours');
      expect(s.source).toContain('HYP-RGPD-RETENTION');
      expect(s.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('REQ-SEC-030 : retention.ts est un sous-module de la SSOT — chaque durée dans SEUILS, aucune définie aux deux endroits', () => {
    const cles = Object.keys(DUREES_DE_RETENTION);
    expect(cles.length).toBeGreaterThan(0);
    const texteSsot = readFileSync('src/domain/seuils/ssot.ts', 'utf8');
    for (const cle of cles) {
      expect(SEUILS[cle as keyof typeof SEUILS]).toBe(
        DUREES_DE_RETENTION[cle as keyof typeof DUREES_DE_RETENTION]
      );
      expect(texteSsot).not.toMatch(new RegExp(`^\\s+${cle}\\s*:`, 'm'));
    }
  });
});

describe('REQ-DM-031 — l’échéance de la purge, statut par statut', () => {
  it('REQ-DM-031 : les états libérés sont invalidee, perdue, expiree et perimee', () => {
    expect([...ETATS_LIBERES].sort()).toEqual(['expiree', 'invalidee', 'perdue', 'perimee']);
  });

  it.each(Object.values(EtatAttribution))(
    'REQ-DM-031 : %s — échéance lue dans la SSOT, ou aucune purge',
    (statut) => {
      const e = echeanceDePurge(statut, REFERENCE);
      if ((ETATS_LIBERES as readonly string[]).includes(statut)) {
        expect(e).toEqual(plus(SEUILS.CONTACT_PURGE_APRES_LIBERATION_JOURS.valeur));
      } else if (statut === 'convertie') {
        expect(e).toEqual(plus(SEUILS.CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS.valeur));
      } else {
        expect(e).toBeNull();
      }
    }
  );

  it('REQ-DM-031 : aucun occupant non converti n’a d’échéance', () => {
    for (const s of ETATS_OCCUPANTS.filter((e) => e !== 'convertie')) {
      expect(echeanceDePurge(s, REFERENCE)).toBeNull();
    }
  });
});

describe('REQ-DM-031 — ce que la purge efface', () => {
  it('REQ-DM-031 : les coordonnées du siège s’effacent, sauf pour une personne morale PROUVÉE (échec fermé)', () => {
    // Entrepreneur individuel : catégorie juridique INSEE de premier rang 1.
    expect(coordonneesSEffacent('1000')).toBe(true);
    // Une forme inconnue peut être une entreprise individuelle : elle est traitée comme telle.
    for (const inconnue of [null, '', ' ', '57', '57100', 'x710', '0000', '2110', '2900']) {
      expect(coordonneesSEffacent(inconnue)).toBe(true);
    }
    // Seule une personne morale prouvée garde ses coordonnées.
    for (const morale of ['5710', '9220', '7210', '3120']) {
      expect(coordonneesSEffacent(morale)).toBe(false);
    }
  });

  it('REQ-DM-031 : les colonnes du contact effacées, exactement — lien_interet_declare reste', () => {
    expect([...COLONNES_DU_CONTACT].sort()).toEqual([
      'contexte_chiffre',
      'email_chiffre',
      'email_hash',
      'fonction_contact_chiffre',
      'lien_interet_precision_chiffre',
      'nom_contact_chiffre',
      'phone_hash',
      'prenom_contact_chiffre',
      'telephone_chiffre',
    ]);
    expect(COLONNES_DU_CONTACT).not.toContain('lien_interet_declare');
  });

  it('REQ-DM-031 : la purge est une tâche du registre, inscrite au lanceur', () => {
    expect(TACHES.contacts_purger).toEqual({ req: 'REQ-DM-031' });
    // Aucun appel n'est fait : on ne lit que la composition.
    const client: unknown = {};
    expect(typeof inscriptions(client as PrismaClient).contacts_purger).toBe('function');
  });
});
