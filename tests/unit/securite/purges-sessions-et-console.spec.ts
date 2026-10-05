// @req REQ-SEC-003
// @req REQ-JUR-068
/**
 * SEC-65 — les deux purges, jugées sans base : un faux client note chaque lecture et chaque écriture.
 * La base réelle (la suppression, le vidage admis par le CHECK, les bornes à la milliseconde, la
 * réinvitation d'une même adresse) est jouée par `tests/integration/purges-sessions-et-console.spec.ts`.
 *
 * CE QUE CE FICHIER GARDE : les durées viennent de la SSOT des durées, avec leur source ; chaque
 * lecture vise l'échu seul, ordonnée et bornée au lot ; le critère est rejugé à l'écriture ; une
 * session est SUPPRIMÉE, un compte perd son nom, son adresse ET l'empreinte dans la même écriture ;
 * les lots se suivent jusqu'à épuisement, et un lot qui n'écrit rien arrête le passage.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  LOT_DE_PURGE_DES_SESSIONS,
  limiteDesSessions,
  purgerLesSessions,
  sessionsEchues,
} from '../../../src/server/taches/purger-sessions-espace';
import {
  LOT_D_EFFACEMENT_DES_COMPTES,
  comptesEchus,
  effacerLesComptesDesactives,
  limiteDesComptesDesactives,
} from '../../../src/server/taches/purger-utilisateurs-console';

const MAINTENANT = new Date('2026-10-15T12:00:00.000Z');

type Appel = {
  where: unknown;
  select?: unknown;
  orderBy?: unknown;
  take?: unknown;
  data?: unknown;
};

/** Un faux client : `lots[i]` lignes à la i-ième lecture ; `compte` dit ce que la base écrit. */
function fauxClient(
  modele: 'sessionEspace' | 'utilisateurConsole',
  lots: number[],
  compte: (n: number) => number = (n) => n
) {
  const lectures: Appel[] = [];
  const ecritures: Appel[] = [];
  let rang = 0;
  const ecrire = async (a: Appel & { where: { id: { in: string[] } } }) => {
    ecritures.push(a);
    return { count: compte(a.where.id.in.length) };
  };
  const client = {
    [modele]: {
      findMany: async (a: Appel) => {
        lectures.push(a);
        const n = lots[rang] ?? 0;
        rang += 1;
        return Array.from({ length: n }, (_, i) => ({ id: `l-${rang}-${i}` }));
      },
      deleteMany: ecrire,
      updateMany: ecrire,
    },
  } as unknown as PrismaClient;
  return { client, lectures, ecritures };
}

describe('REQ-SEC-003 — les sessions finies sont supprimées six mois après leur fin', () => {
  it('REQ-SEC-003 : la durée vient de la SSOT des durées : six mois, décision de Williams du 2026-10-04', () => {
    expect(SEUILS.SESSIONS_CONSERVATION_APRES_FIN_MOIS).toMatchObject({ valeur: 6, unite: 'mois' });
    expect(SEUILS.SESSIONS_CONSERVATION_APRES_FIN_MOIS.source).toContain(
      'décision de Williams du 2026-10-04'
    );
    expect(limiteDesSessions(MAINTENANT)).toEqual(new Date('2026-04-15T12:00:00.000Z'));
  });

  it('REQ-SEC-003 : TÉMOIN — l’échu est la plus tôt de l’expiration et de la révocation, à la limite ou avant', () => {
    const limite = new Date('2026-04-15T12:00:00.000Z');
    expect(sessionsEchues(limite)).toEqual({
      OR: [{ expireAt: { lte: limite } }, { revoqueAt: { lte: limite } }],
    });
  });

  it('REQ-SEC-003 : TÉMOIN — chaque lecture vise l’échu, ordonnée, bornée au lot ; la suppression rejuge le critère', async () => {
    const f = fauxClient('sessionEspace', [2]);
    expect(await purgerLesSessions(f.client, MAINTENANT)).toEqual({ supprimees: 2 });
    const echues = sessionsEchues(limiteDesSessions(MAINTENANT));
    expect(f.lectures[0]).toEqual({
      where: echues,
      select: { id: true },
      orderBy: [{ expireAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DES_SESSIONS,
    });
    expect(f.ecritures).toEqual([{ where: { id: { in: ['l-1-0', 'l-1-1'] }, ...echues } }]);
  });

  it('REQ-SEC-003 : TÉMOIN — par lots jusqu’à épuisement, la somme est celle de la base, et un lot qui n’enlève rien arrête', async () => {
    const f = fauxClient('sessionEspace', [LOT_DE_PURGE_DES_SESSIONS, 3]);
    expect(await purgerLesSessions(f.client, MAINTENANT)).toEqual({
      supprimees: LOT_DE_PURGE_DES_SESSIONS + 3,
    });
    expect(f.lectures).toHaveLength(3);
    const g = fauxClient('sessionEspace', [2, 2, 2], () => 0);
    expect(await purgerLesSessions(g.client, MAINTENANT)).toEqual({ supprimees: 0 });
    expect(g.ecritures).toHaveLength(1);
  });
});

describe('REQ-JUR-068 — un accès désactivé de la console perd sa donnée de personne cinq ans après', () => {
  it('REQ-JUR-068 : la durée vient de la SSOT des durées : cinq ans, décision de Williams du 2026-10-04', () => {
    expect(SEUILS.UTILISATEUR_CONSOLE_DESACTIVE_EFFACE_APRES_ANS).toMatchObject({
      valeur: 5,
      unite: 'ans',
    });
    expect(SEUILS.UTILISATEUR_CONSOLE_DESACTIVE_EFFACE_APRES_ANS.source).toContain(
      'décision de Williams du 2026-10-04'
    );
    expect(limiteDesComptesDesactives(MAINTENANT)).toEqual(new Date('2021-10-15T12:00:00.000Z'));
  });

  it('REQ-JUR-068 : TÉMOIN — l’échu est désactivé à la limite ou avant, et porte encore une donnée de personne', () => {
    const limite = new Date('2021-10-15T12:00:00.000Z');
    expect(comptesEchus(limite)).toEqual({
      desactiveAt: { lte: limite },
      OR: [
        { NOT: { nomChiffre: null } },
        { NOT: { emailChiffre: null } },
        { NOT: { emailHash: null } },
      ],
    });
  });

  it('REQ-JUR-068 : TÉMOIN — le nom, l’adresse ET l’empreinte sont vidés dans la même écriture, qui rejuge le critère', async () => {
    const f = fauxClient('utilisateurConsole', [2]);
    expect(await effacerLesComptesDesactives(f.client, MAINTENANT)).toEqual({ effaces: 2 });
    const echus = comptesEchus(limiteDesComptesDesactives(MAINTENANT));
    expect(f.lectures[0]).toEqual({
      where: echus,
      select: { id: true },
      orderBy: [{ desactiveAt: 'asc' }, { id: 'asc' }],
      take: LOT_D_EFFACEMENT_DES_COMPTES,
    });
    expect(f.ecritures).toEqual([
      {
        where: { id: { in: ['l-1-0', 'l-1-1'] }, ...echus },
        data: { nomChiffre: null, emailChiffre: null, emailHash: null },
      },
    ]);
  });

  it('REQ-JUR-068 : TÉMOIN — par lots jusqu’à épuisement, la somme est celle de la base, et un lot qui n’efface rien arrête', async () => {
    const f = fauxClient('utilisateurConsole', [LOT_D_EFFACEMENT_DES_COMPTES, 1]);
    expect(await effacerLesComptesDesactives(f.client, MAINTENANT)).toEqual({
      effaces: LOT_D_EFFACEMENT_DES_COMPTES + 1,
    });
    expect(f.lectures).toHaveLength(3);
    const g = fauxClient('utilisateurConsole', [2, 2], () => 0);
    expect(await effacerLesComptesDesactives(g.client, MAINTENANT)).toEqual({ effaces: 0 });
    expect(g.ecritures).toHaveLength(1);
  });
});
