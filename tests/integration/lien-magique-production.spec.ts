// @req REQ-SEC-001
// @req REQ-INT-022
/**
 * SEC-42, en base RÉELLE — l'envoi du lien magique par l'émetteur écrit EXACTEMENT une ligne
 * `courriels_envoyes`, et le jeton du lien n'y est conservé sous aucune forme.
 *
 * Le dépôt des courriels (`depotDesCourriels`) est celui de la production ; le relais est simulé
 * (le client du prestataire n'est pas livré), et le drapeau DMARC est posé ou non selon le cas. Les
 * mêmes règles, dépôt simulé : `tests/unit/securite/lien-magique-emis-en-production.spec.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { domaines } from '../../src/config/entite';
import { clesPii } from '../../src/server/securite/pii';
import { envoiParLEmetteur } from '../../src/server/auth/lien-magique-production';
import { depotDesCourriels } from '../../src/server/integrations/zeptomail/emetteur';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec42-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const JETON = 'JETON-TEMOIN-SEC42-INTEGRATION-0000000000';

function envoi(dmarcVerifie: boolean, appels: string[]) {
  return envoiParLEmetteur(() => ({
    configuration: { expediteur: `contact@${domaines().envoi}`, dmarcVerifie },
    relais: {
      async envoyer(m) {
        appels.push(m.a);
        return { messageId: 'id-relais-integration' };
      },
    },
    depot: depotDesCourriels(base.prisma),
    cles: clesPii(ENV),
    maintenant: () => new Date('2026-10-01T23:00:00.000Z'),
    nouvelId: randomUUID,
  }));
}

describe('REQ-SEC-001 REQ-INT-022 — une ligne par envoi, sans jeton, en base réelle', () => {
  it('REQ-SEC-001 · REQ-INT-022 : drapeau posé — UNE ligne `envoye`, UN appel, et le jeton absent de la ligne', async () => {
    const avant = await base.prisma.courrielEnvoye.count();
    const appels: string[] = [];
    await envoi(true, appels).envoyer({
      a: 'marie@example.org',
      sujet: 'Votre lien de connexion',
      corps: `Bonjour\n\nhttps://partners.example.org/connexion/${JETON}`,
    });
    expect(appels).toEqual(['marie@example.org']);
    expect(await base.prisma.courrielEnvoye.count()).toBe(avant + 1);
    const ligne = await base.prisma.courrielEnvoye.findFirstOrThrow({
      orderBy: { demandeAt: 'desc' },
    });
    expect(ligne).toMatchObject({ gabarit: 'lien_magique', statut: 'envoye' });
    expect(JSON.stringify(ligne)).not.toContain(JETON);
    expect(JSON.stringify(ligne)).not.toContain('marie@example.org');
  });

  it('REQ-SEC-001 · REQ-INT-022 : drapeau fermé — la ligne est retenue, AUCUN appel', async () => {
    const appels: string[] = [];
    await envoi(false, appels).envoyer({
      a: 'paul@example.org',
      sujet: 'Votre lien de connexion',
      corps: `https://partners.example.org/connexion/${JETON}`,
    });
    expect(appels).toEqual([]);
    const ligne = await base.prisma.courrielEnvoye.findFirstOrThrow({
      where: { statut: 'retenu_dmarc_non_verifie' },
    });
    expect(JSON.stringify(ligne)).not.toContain(JETON);
  });
});
