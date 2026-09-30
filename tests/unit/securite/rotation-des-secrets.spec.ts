// @req REQ-QA-030
/**
 * `rotation-des-secrets.spec.ts` — la double clé de REQ-QA-030 (QA-T52).
 *
 * CE QUI EST JUGÉ ICI : le TROUSSEAU d'un secret en rotation. Une clé courante, toujours acceptée ;
 * une clé précédente, acceptée jusqu'à son échéance et refusée après, le refus NOMMÉ. Le `kid`
 * présenté choisit la clé : il est dérivé de la valeur par `kidDe` (partners/ADR-0013, décision 8),
 * jamais porté par une variable. Un `kid` inconnu ou absent est un refus : on n'essaie jamais
 * toutes les clés contre une signature qui ne dit pas laquelle elle vise.
 *
 * TÉMOIN À DEUX FACES : chaque cas est joué des deux côtés de l'échéance, à la milliseconde.
 *
 * L'ENVIRONNEMENT : `<NOM>_PRECEDENT` et `<NOM>_PRECEDENT_ECHEANCE` (ISO 8601 UTC) se posent
 * ensemble ou pas du tout ; l'échéance est au plus à 24 h du démarrage ; la clé précédente est un
 * secret comme les autres (au moins 32 octets, distincte de toutes). Les refus nomment la variable
 * et un motif fermé, jamais la valeur.
 *
 * RM-11 : chaque instant et chaque clé est posé explicitement dans le cas qui le fait varier.
 */
import { describe, it, expect } from 'vitest';
import {
  ROTATION_MAX_MS,
  NOMS_EN_ROTATION,
  cleDuKid,
  kidDe,
  lireTrousseaux,
  type Trousseau,
} from '../../../src/lib/env';

const COURANTE = 'c'.repeat(40) + '-courante';
const PRECEDENTE = 'p'.repeat(40) + '-precedente';
const INCONNUE = 'i'.repeat(40) + '-inconnue';
const ECHEANCE_MS = Date.parse('2026-09-30T12:00:00.000Z');

const enRotation: Trousseau = {
  courante: COURANTE,
  precedente: { valeur: PRECEDENTE, echeanceMs: ECHEANCE_MS },
};
const sansPrecedente: Trousseau = { courante: COURANTE, precedente: null };

describe('REQ-QA-030 — le kid choisit la clé, et la clé précédente meurt à son échéance', () => {
  it('REQ-QA-030 : la clé courante passe, avant comme après l’échéance de la précédente', () => {
    for (const t of [ECHEANCE_MS - 1, ECHEANCE_MS, ECHEANCE_MS + 86_400_000]) {
      expect(cleDuKid(enRotation, kidDe(COURANTE), t)).toEqual({
        ok: true,
        cle: COURANTE,
        laquelle: 'courante',
      });
    }
  });

  it('REQ-QA-030 : la clé précédente passe une milliseconde avant l’échéance, et est refusée à l’échéance', () => {
    expect(cleDuKid(enRotation, kidDe(PRECEDENTE), ECHEANCE_MS - 1)).toEqual({
      ok: true,
      cle: PRECEDENTE,
      laquelle: 'precedente',
    });
    expect(cleDuKid(enRotation, kidDe(PRECEDENTE), ECHEANCE_MS)).toEqual({
      ok: false,
      motif: 'cle_precedente_echue',
    });
  });

  it('REQ-QA-030 : un kid inconnu est refusé, même avant l’échéance, et le refus le nomme', () => {
    expect(cleDuKid(enRotation, kidDe(INCONNUE), ECHEANCE_MS - 1)).toEqual({
      ok: false,
      motif: 'kid_inconnu',
    });
  });

  it('REQ-QA-030 : un kid absent ou vide est refusé, jamais remplacé par un essai de toutes les clés', () => {
    expect(cleDuKid(enRotation, null, ECHEANCE_MS - 1)).toEqual({ ok: false, motif: 'kid_absent' });
    expect(cleDuKid(enRotation, '', ECHEANCE_MS - 1)).toEqual({ ok: false, motif: 'kid_absent' });
  });

  it('REQ-QA-030 : sans clé précédente, son ancien kid est inconnu', () => {
    expect(cleDuKid(sansPrecedente, kidDe(PRECEDENTE), ECHEANCE_MS - 1)).toEqual({
      ok: false,
      motif: 'kid_inconnu',
    });
  });
});

/** Un jeu de secrets valide et distinct, dérivé des noms, jamais tapé (même règle que les autres tests). */
function secretsValides() {
  const s = {
    NODE_ENV: 'test',
    SESSION_SECRET: 'a'.repeat(32) + '-session',
    MAGIC_LINK_SECRET: 'a'.repeat(32) + '-lien',
    DEPOSIT_TOKEN_SECRET: 'a'.repeat(32) + '-depot',
    AXIONIA_WEBHOOK_SECRET: 'a'.repeat(32) + '-webhook',
    AXIONIA_API_TOKEN: 'a'.repeat(32) + '-api',
    DOCUSEAL_WEBHOOK_SECRET: 'a'.repeat(32) + '-docuseal',
    PII_ENCRYPTION_KEY: 'ab'.repeat(32),
    IP_HASH_SALT: 'a'.repeat(32) + '-sel',
    PII_HASH_KEY: 'a'.repeat(32) + '-empreintes',
    PARTNERS_MCP_SHARED_SECRET: 'a'.repeat(32) + '-mcp',
    ZEPTOMAIL_WEBHOOK_SECRET: 'a'.repeat(32) + '-zepto',
    AXIONIA_RELECTURE_SECRET: 'a'.repeat(32) + '-relecture',
  };
  return s;
}

const DEMARRAGE_MS = Date.parse('2026-09-30T00:00:00.000Z');
const DANS_24_H = new Date(DEMARRAGE_MS + ROTATION_MAX_MS).toISOString();

describe('REQ-QA-030 — la clé précédente se déclare dans l’environnement, et nulle part ailleurs', () => {
  it('REQ-QA-030 : les deux secrets d’axionia sont en rotation, et eux seuls (DocuSeal suivra son récepteur)', () => {
    expect([...NOMS_EN_ROTATION].sort()).toEqual(
      ['AXIONIA_API_TOKEN', 'AXIONIA_WEBHOOK_SECRET'].sort()
    );
  });

  it('REQ-QA-030 : sans variable de rotation, chaque trousseau n’a que sa clé courante', () => {
    const lu = lireTrousseaux(secretsValides(), DEMARRAGE_MS);
    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    expect(lu.trousseaux.AXIONIA_WEBHOOK_SECRET).toEqual({
      courante: secretsValides().AXIONIA_WEBHOOK_SECRET,
      precedente: null,
    });
  });

  it('REQ-QA-030 : une clé précédente et son échéance à 24 h pile sont lues ensemble', () => {
    const src = {
      ...secretsValides(),
      AXIONIA_WEBHOOK_SECRET_PRECEDENT: PRECEDENTE,
      AXIONIA_WEBHOOK_SECRET_PRECEDENT_ECHEANCE: DANS_24_H,
    };
    const lu = lireTrousseaux(src, DEMARRAGE_MS);
    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    expect(lu.trousseaux.AXIONIA_WEBHOOK_SECRET.precedente).toEqual({
      valeur: PRECEDENTE,
      echeanceMs: DEMARRAGE_MS + ROTATION_MAX_MS,
    });
  });

  it('REQ-QA-030 : chaque faute de rotation est un refus nommé, jamais la valeur', () => {
    const cas: [Record<string, string>, string, string][] = [
      [
        { AXIONIA_API_TOKEN_PRECEDENT: PRECEDENTE },
        'AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE',
        'absente',
      ],
      [
        { AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE: DANS_24_H },
        'AXIONIA_API_TOKEN_PRECEDENT',
        'absente',
      ],
      [
        {
          AXIONIA_API_TOKEN_PRECEDENT: PRECEDENTE,
          AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE: new Date(
            DEMARRAGE_MS + ROTATION_MAX_MS + 1
          ).toISOString(),
        },
        'AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE',
        'echeance_au_dela_de_24_h',
      ],
      [
        {
          AXIONIA_API_TOKEN_PRECEDENT: PRECEDENTE,
          AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE: '30/09/2026 12:00',
        },
        'AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE',
        'format_invalide',
      ],
      [
        { AXIONIA_API_TOKEN_PRECEDENT: 'courte', AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE: DANS_24_H },
        'AXIONIA_API_TOKEN_PRECEDENT',
        'trop_courte',
      ],
      [
        {
          AXIONIA_API_TOKEN_PRECEDENT: secretsValides().AXIONIA_API_TOKEN,
          AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE: DANS_24_H,
        },
        'AXIONIA_API_TOKEN_PRECEDENT',
        'egale_a',
      ],
    ];
    for (const [ajout, variable, motif] of cas) {
      const lu = lireTrousseaux({ ...secretsValides(), ...ajout }, DEMARRAGE_MS);
      expect(lu.ok, `${variable} ${motif}`).toBe(false);
      if (lu.ok) continue;
      expect(lu.refus.map((r) => [r.variable, r.motif])).toContainEqual([variable, motif]);
      const imprime = JSON.stringify(lu.refus);
      expect(imprime).not.toContain(PRECEDENTE);
      expect(imprime).not.toContain(secretsValides().AXIONIA_API_TOKEN);
    }
  });

  it('REQ-QA-030 : une échéance déjà passée au démarrage est lue, et la clé est aussitôt refusée', () => {
    const src = {
      ...secretsValides(),
      AXIONIA_WEBHOOK_SECRET_PRECEDENT: PRECEDENTE,
      AXIONIA_WEBHOOK_SECRET_PRECEDENT_ECHEANCE: new Date(DEMARRAGE_MS - 1).toISOString(),
    };
    const lu = lireTrousseaux(src, DEMARRAGE_MS);
    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    expect(cleDuKid(lu.trousseaux.AXIONIA_WEBHOOK_SECRET, kidDe(PRECEDENTE), DEMARRAGE_MS)).toEqual(
      { ok: false, motif: 'cle_precedente_echue' }
    );
  });
});
