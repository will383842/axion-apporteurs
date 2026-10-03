// @req REQ-DM-033
/**
 * Le LECTEUR UNIQUE de la justification d'une anomalie (cadrage de la sécurité, point 4) : seuls les
 * rôles habilités (qualifieur, admin) la déchiffrent, le refus tombe AVANT toute lecture, et le clair
 * n'apparaît dans aucune sortie (console, flux standard). Une justification purgée se lit `null`.
 * Le client est simulé : on juge l'ordre et le refus ; la base juge la forme en intégration.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, colonnesPii } from '../../../src/server/securite/pii';
import {
  LectureDeJustificationRefusee,
  MODELE_DE_LA_JUSTIFICATION,
  lireLaJustification,
} from '../../../src/server/anomalie/justification';

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-justification-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});
const CLAIR = 'parrainage croisé constaté sur deux fiches';

function client(bloc: Uint8Array | null) {
  const lectures: unknown[] = [];
  return {
    lectures,
    prisma: {
      anomalie: {
        findUnique: async (args: unknown) => {
          lectures.push(args);
          return { justificationChiffre: bloc };
        },
      },
    },
  };
}

const chiffree = (id: string) =>
  colonnesPii({ modele: MODELE_DE_LA_JUSTIFICATION, id }, { justification: CLAIR }, CLES)
    .justificationChiffre as Uint8Array;

afterEach(() => vi.restoreAllMocks());

describe('REQ-DM-033 — la justification d’une anomalie : un lecteur unique, des rôles habilités', () => {
  it.each(['qualifieur', 'admin'] as const)(
    'REQ-DM-033 : le rôle %s déchiffre la justification de SA ligne',
    async (role) => {
      const id = randomUUID();
      const c = client(chiffree(id));
      expect(await lireLaJustification(c.prisma, { anomalieId: id, role }, CLES)).toBe(CLAIR);
      expect(c.lectures).toEqual([{ where: { id }, select: { justificationChiffre: true } }]);
    }
  );

  it.each(['comptable', 'lecteur'] as const)(
    'REQ-DM-033 : TÉMOIN — le rôle %s est refusé AVANT toute lecture',
    async (role) => {
      const id = randomUUID();
      const c = client(chiffree(id));
      await expect(
        lireLaJustification(c.prisma, { anomalieId: id, role }, CLES)
      ).rejects.toBeInstanceOf(LectureDeJustificationRefusee);
      expect(c.lectures).toEqual([]);
    }
  );

  it('REQ-DM-033 : TÉMOIN — un bloc déplacé d’une autre anomalie ne se déchiffre pas', async () => {
    const c = client(chiffree(randomUUID()));
    await expect(
      lireLaJustification(c.prisma, { anomalieId: randomUUID(), role: 'admin' }, CLES)
    ).rejects.toThrow();
  });

  it('REQ-DM-033 : une justification purgée, ou une anomalie introuvable, se lit null', async () => {
    expect(
      await lireLaJustification(
        client(null).prisma,
        { anomalieId: randomUUID(), role: 'admin' },
        CLES
      )
    ).toBeNull();
    const introuvable = { anomalie: { findUnique: async () => null } };
    expect(
      await lireLaJustification(introuvable, { anomalieId: randomUUID(), role: 'admin' }, CLES)
    ).toBeNull();
  });

  it('REQ-DM-033 : TÉMOIN — le clair n’apparaît dans AUCUNE sortie : console et flux standard capturés', async () => {
    const sorties: string[] = [];
    const capter = (...a: unknown[]) => void sorties.push(a.map(String).join(' '));
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation(capter);
    }
    vi.spyOn(process.stdout, 'write').mockImplementation((t: string | Uint8Array) => {
      sorties.push(String(t));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((t: string | Uint8Array) => {
      sorties.push(String(t));
      return true;
    });
    const id = randomUUID();
    await lireLaJustification(client(chiffree(id)).prisma, { anomalieId: id, role: 'admin' }, CLES);
    await lireLaJustification(
      client(chiffree(id)).prisma,
      { anomalieId: id, role: 'lecteur' },
      CLES
    ).catch(() => undefined);
    expect(sorties.join('\n')).not.toContain(CLAIR);
  });
});
