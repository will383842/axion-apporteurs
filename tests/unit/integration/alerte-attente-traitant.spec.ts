// @req REQ-DM-036
// @req REQ-ARG-003
/**
 * INT-T54 — une attente `traitant:<type>` ou de PARENT au-delà de son seuil de la SSOT émet une
 * alerte `attente_depassee`, une par (forme, type) et par FRANCHISSEMENT ; le message ne porte que
 * la forme, le type, le nombre et l'âge de la plus ancienne — ni référence, ni charge, ni identifiant.
 *
 * Partagé avec la reprise bornée des coordonnées, qui livre dans le même lot : une seule catégorie, un seul
 * alerteur, un seuil par forme.
 */
import { describe, it, expect } from 'vitest';
import { TypeEvenementRecu } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import {
  PREFIXE_ATTENTE_TRAITANT,
  formeDeLAttente,
  franchissements,
  seuilDAttenteMs,
  type AttenteEnCours,
} from '../../../src/server/queue/workers/evenement-recu';
import {
  CATEGORIES_ALERTE,
  messageDAlerte,
} from '../../../src/server/integrations/telegram/alertes';
import { objetDAlerte } from '../../../src/server/taches/inscriptions';

const MAINTENANT = new Date('2026-10-10T08:00:00.000Z');
const SEUIL = SEUILS.ATTENTE_D_UNE_DEPENDANCE_JOURS.valeur * MS_PAR_JOUR;
const ilYa = (ms: number) => new Date(MAINTENANT.getTime() - ms);

const traitant = (ilYaMs: number, type = TypeEvenementRecu.devis_signe): AttenteEnCours => ({
  eventType: type,
  dependanceRef: `${PREFIXE_ATTENTE_TRAITANT}${type}`,
  receivedAt: ilYa(ilYaMs),
});
const parent = (ilYaMs: number): AttenteEnCours => ({
  eventType: TypeEvenementRecu.paiement_recu,
  dependanceRef: 'facture:11111111-1111-4111-8111-111111111111',
  receivedAt: ilYa(ilYaMs),
});

describe('REQ-DM-036 REQ-ARG-003 — l’alerte d’une attente au-delà de son seuil', () => {
  it('REQ-DM-036 : la catégorie `attente_depassee` est close et neuve ; le seuil vient de la SSOT, avec sa source et sa date', () => {
    expect(CATEGORIES_ALERTE).toContain('attente_depassee');
    expect(seuilDAttenteMs('traitant')).toBe(SEUIL);
    expect(seuilDAttenteMs('parent')).toBe(SEUIL);
    expect(SEUILS.ATTENTE_D_UNE_DEPENDANCE_JOURS.source).not.toBe('');
    expect(SEUILS.ATTENTE_D_UNE_DEPENDANCE_JOURS.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('REQ-ARG-003 : une attente SOUS le seuil n’alerte pas', () => {
    expect(
      franchissements([traitant(SEUIL - 1)], { maintenant: MAINTENANT, depuis: null })
    ).toEqual([]);
  });

  it('REQ-ARG-003 : au-delà, UNE alerte par (forme, type), qui compte toutes ses attentes et dit l’âge de la plus ancienne', () => {
    const f = franchissements([traitant(SEUIL + 1), traitant(SEUIL + 3 * MS_PAR_JOUR)], {
      maintenant: MAINTENANT,
      depuis: null,
    });
    expect(f).toEqual([
      { forme: 'traitant', type: TypeEvenementRecu.devis_signe, nombre: 2, plusAncienneJours: 5 },
    ]);
  });

  it('REQ-ARG-003 : une attente de PARENT au-delà du seuil alerte aussi, sous le même dédoublonnage', () => {
    const f = franchissements([parent(SEUIL + 1), parent(SEUIL + 2)], {
      maintenant: MAINTENANT,
      depuis: null,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      forme: 'parent',
      type: TypeEvenementRecu.paiement_recu,
      nombre: 2,
    });
    expect(formeDeLAttente('facture:x')).toBe('parent');
  });

  it('REQ-ARG-003 : DÉDOUBLONNAGE — déjà franchie avant le dernier passage réussi, l’attente n’alerte plus', () => {
    const vieille = traitant(SEUIL + 10 * 60_000);
    const depuis = ilYa(60_000);
    expect(franchissements([vieille], { maintenant: MAINTENANT, depuis })).toEqual([]);
  });

  it('REQ-ARG-003 : une attente qui franchit son seuil DEPUIS le dernier passage réussi alerte, une fois', () => {
    const franchit = traitant(SEUIL + 30_000);
    const depuis = ilYa(60_000);
    expect(franchissements([franchit], { maintenant: MAINTENANT, depuis })).toHaveLength(1);
  });

  it('REQ-ARG-003 : PREMIER passage (aucun succès) — le stock déjà au-delà alerte une fois', () => {
    const stock = [traitant(SEUIL + 30 * MS_PAR_JOUR), parent(SEUIL + 1)];
    expect(franchissements(stock, { maintenant: MAINTENANT, depuis: null })).toHaveLength(2);
  });

  it('REQ-DM-036 : le message ne porte ni référence, ni charge, ni identifiant d’événement — la forme, le type, le nombre, l’âge', () => {
    const [f] = franchissements([parent(SEUIL + 1)], { maintenant: MAINTENANT, depuis: null });
    const texte = messageDAlerte('alerte', objetDAlerte(f!));
    expect(texte).toContain('[attente_depassee]');
    expect(texte).toContain('attente parent');
    expect(texte).toContain(`type ${TypeEvenementRecu.paiement_recu}`);
    expect(texte).toContain('1 au-delà');
    expect(texte).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(texte).not.toContain('facture:');
  });

  it('REQ-DM-036 : une forme ou un type hors liste n’entre pas dans le message', () => {
    const texte = messageDAlerte('alerte', {
      categorie: 'attente_depassee',
      id: '22222222-2222-4222-8222-222222222222',
      attente: { forme: 'marie@example.org', type: 'x', nombre: -1, plusAncienneJours: 1.5 },
    });
    expect(texte).not.toContain('marie@example.org');
    expect(texte).toContain('attente illisible · type illisible · illisible au-delà');
  });
});
