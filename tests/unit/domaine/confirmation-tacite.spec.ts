// @req REQ-DM-006
// @req REQ-DM-008
/**
 * DM-24 — la confirmation tacite, jugée PURE, sur le contrat v2, art. 3.2 (arbitrage #319
 * 6035632726, précisions de la juriste 6035645682 et 6036770037).
 *
 * Ce que le fichier tient :
 *   — les durées se lisent dans la SSOT, jamais un 30 en clair ;
 *   — le départ : le premier message de la Société non retourné en erreur ; à défaut de prise de
 *     contact dans le délai, l'expiration de ce délai, même sans message ;
 *   — un message en erreur suspend ; une adresse corrigée fait courir le délai DE SA COMMUNICATION,
 *     même si la Société tarde à renvoyer ; une nouvelle erreur suspend de nouveau ;
 *   — aucun régime de vérification : rien d'autre ne retarde la confirmation.
 * Les jours sont des jours CIVILS de Paris, à la même heure (`ajouterJoursCivilsParis`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  confirmationTaciteDue,
  departDuDelaiDeConfirmation,
  echeanceDeLaConfirmationTacite,
  type FaitsDeLaConfirmationTacite,
} from '../../../src/domain/attribution/confirmation-tacite';
import { ajouterJoursCivilsParis } from '../../../src/domain/temps/sla';
import { ErreurTemps } from '../../../src/domain/temps/erreurs';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const JOUR = 86_400_000;
const MINUTE = 60_000;
/** Le dépôt : le 1er février 2027 à 10 h, heure de Paris (hiver, UTC+1). */
const DEPOT = Date.UTC(2027, 1, 1, 9, 0);
const TACITE = SEUILS.CONFIRMATION_TACITE_JOURS.valeur;
const PRISE = SEUILS.PRISE_DE_CONTACT_SOCIETE_JOURS.valeur;
/** Plus N jours civils, à la même heure de Paris : en hiver comme ici, N × 24 h. */
const j = (n: number, depuis = DEPOT) => ajouterJoursCivilsParis(depuis, n);

const envoi = (emiseAt: number, revoqueeAt: number | null = null) => ({ emiseAt, revoqueeAt });

const faits = (f: Partial<FaitsDeLaConfirmationTacite>): FaitsDeLaConfirmationTacite => ({
  deposeeAt: DEPOT,
  etatDeLaDemande: 'envoyee',
  emissions: [],
  ...f,
});

describe('REQ-DM-006 — ajouterJoursCivilsParis : la même heure de Paris, N jours civils plus tard', () => {
  it('REQ-DM-006 : en hiver, N jours valent N × 24 h', () => {
    expect(ajouterJoursCivilsParis(DEPOT, 30)).toBe(DEPOT + 30 * JOUR);
    expect(ajouterJoursCivilsParis(DEPOT, 0)).toBe(DEPOT);
  });

  it('REQ-DM-006 : TÉMOIN — à travers le passage à l’heure d’été, l’heure de Paris est gardée (une heure de moins)', () => {
    // 15 mars 2027, 10 h à Paris (UTC+1) ; le 14 avril, 10 h à Paris (UTC+2).
    const mars = Date.UTC(2027, 2, 15, 9, 0);
    expect(ajouterJoursCivilsParis(mars, 30)).toBe(Date.UTC(2027, 3, 14, 8, 0));
  });

  it.each([-1, 1.5, Number.NaN])('REQ-DM-006 : une durée %s est refusée, nommée', (n) => {
    expect(() => ajouterJoursCivilsParis(DEPOT, n)).toThrow(ErreurTemps);
    expect(() => ajouterJoursCivilsParis(DEPOT, n)).toThrow(/duree_invalide/);
  });
});

describe('REQ-DM-006 — les durées viennent de la SSOT', () => {
  it('REQ-DM-006 : CONFIRMATION_TACITE_JOURS et PRISE_DE_CONTACT_SOCIETE_JOURS valent 30, art. 3.2', () => {
    expect([TACITE, PRISE]).toEqual([30, 30]);
  });

  it('REQ-DM-006 : TÉMOIN — le module ne porte aucune durée en clair', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', '..', 'src/domain/attribution/confirmation-tacite.ts'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(source).not.toMatch(/\b(30|45)\b/);
  });
});

describe('REQ-DM-008 — le départ du délai (v2, art. 3.2)', () => {
  it('REQ-DM-008 : un premier message reçu à J+3 fait courir le délai de J+3', () => {
    expect(departDuDelaiDeConfirmation(faits({ emissions: [envoi(j(3))] }))).toBe(j(3));
  });

  it('REQ-DM-008 : sans aucun message, le délai court de l’expiration de la prise de contact, même sans message', () => {
    expect(departDuDelaiDeConfirmation(faits({ etatDeLaDemande: 'planifiee' }))).toBe(j(PRISE));
    expect(departDuDelaiDeConfirmation(faits({ etatDeLaDemande: null }))).toBe(j(PRISE));
  });

  it('REQ-DM-008 : TÉMOIN — un premier message APRÈS le délai de prise de contact ne repousse pas le départ : la Société ne tire pas avantage de son retard', () => {
    expect(departDuDelaiDeConfirmation(faits({ emissions: [envoi(j(PRISE + 5))] }))).toBe(j(PRISE));
  });

  it('REQ-DM-008 : un message pile à l’échéance de la prise de contact est dans le délai', () => {
    expect(departDuDelaiDeConfirmation(faits({ emissions: [envoi(j(PRISE))] }))).toBe(j(PRISE));
  });
});

describe('REQ-DM-008 — le message en erreur (juriste, 6036770037)', () => {
  it('REQ-DM-008 : TÉMOIN — un message en erreur et aucune correction : aucun départ, donc aucune confirmation à J+30 ni après', () => {
    const f = faits({ etatDeLaDemande: 'rebond', emissions: [envoi(j(2))] });
    expect(departDuDelaiDeConfirmation(f)).toBeNull();
    expect(echeanceDeLaConfirmationTacite(f)).toBeNull();
    expect(confirmationTaciteDue(f, j(TACITE + 2))).toBe(false);
    expect(confirmationTaciteDue(f, j(90))).toBe(false);
  });

  it('REQ-DM-008 : TÉMOIN — une correction communiquée à J+10 fait courir le délai de J+10, même sans nouvel envoi reçu', () => {
    const f = faits({ emissions: [envoi(j(2), j(10)), envoi(j(10))] });
    expect(departDuDelaiDeConfirmation(f)).toBe(j(10));
    expect(confirmationTaciteDue(f, j(10 + TACITE) - MINUTE)).toBe(false);
    expect(confirmationTaciteDue(f, j(10 + TACITE))).toBe(true);
  });

  it('REQ-DM-008 : TÉMOIN — une correction, puis une nouvelle erreur : le délai est de nouveau suspendu', () => {
    const f = faits({ etatDeLaDemande: 'rebond', emissions: [envoi(j(2), j(10)), envoi(j(10))] });
    expect(departDuDelaiDeConfirmation(f)).toBeNull();
    expect(confirmationTaciteDue(f, j(60))).toBe(false);
  });

  it('REQ-DM-008 : deux corrections : le délai court de la DERNIÈRE communiquée', () => {
    const f = faits({
      emissions: [envoi(j(2), j(10)), envoi(j(10), j(20)), envoi(j(20))],
    });
    expect(departDuDelaiDeConfirmation(f)).toBe(j(20));
  });

  it('REQ-DM-008 : l’ordre de lecture des émissions est indifférent', () => {
    const f = faits({ emissions: [envoi(j(20)), envoi(j(2), j(10)), envoi(j(10), j(20))] });
    expect(departDuDelaiDeConfirmation(f)).toBe(j(20));
  });
});

describe('REQ-DM-006 — l’échéance et la bascule « tout ce qui est dû à l’instant t »', () => {
  it('REQ-DM-006 : TÉMOIN — réception à J : à l’échéance moins une minute, rien ; à l’échéance, due', () => {
    const f = faits({ emissions: [envoi(j(0))] });
    expect(echeanceDeLaConfirmationTacite(f)).toBe(j(TACITE));
    expect(confirmationTaciteDue(f, j(TACITE) - MINUTE)).toBe(false);
    expect(confirmationTaciteDue(f, j(TACITE))).toBe(true);
    expect(confirmationTaciteDue(f, j(TACITE) + JOUR)).toBe(true);
  });

  it('REQ-DM-006 : sans prise de contact, la confirmation est due à J+PRISE+TACITE', () => {
    const f = faits({ etatDeLaDemande: 'planifiee' });
    expect(echeanceDeLaConfirmationTacite(f)).toBe(j(PRISE + TACITE));
  });
});
