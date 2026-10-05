// @req REQ-UX-027
// @req REQ-DM-027
/**
 * CPL-T24 — le RIB à quatre yeux, jugé sans base : un faux client note chaque lecture et chaque
 * écriture, dans l'ordre. La base réelle (la garde `pieces_kyc_rib_quatre_yeux`, les CHECK, le verrou
 * `FOR SHARE`) est jouée par `tests/integration/rib-quatre-yeux.spec.ts`.
 *
 * CE QUE CE FICHIER GARDE : le droit `action:verifier_rib` ; chaque refus nommé AVANT toute écriture
 * (une autre pièce qu'un RIB, un état qui ne convient pas, le même regard, l'auteur de l'ouverture du
 * dossier) ; l'écriture exacte de chaque regard ; la confirmation qui pose `valide` dans la MÊME
 * écriture, écarte la courante et écrit son événement sans IBAN ni empreinte ; le juge du versement,
 * fermé, à cinq faces ; et le témoin statique de la sécurité : `rib.ts` ne lit jamais l'IBAN.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  ErreurRibQuatreYeux,
  RibNonValide,
  confirmerUnRib,
  exigerUnRibVersable,
  verifierUnRib,
} from '../../../src/server/conformite/rib';
import { clesPii, empreinteRecherche } from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const ADMIN = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' } as const;
const AUTRE_ADMIN = { id: '0190f0f0-0000-7000-8000-0000000000a2', role: 'admin' } as const;
const APPORTEUR = '0190f0f0-0000-7000-8000-0000000000b1';
const PIECE = '0190f0f0-0000-7000-8000-0000000000c1';
const COURANTE = '0190f0f0-0000-7000-8000-0000000000c2';
const MAINTENANT = new Date('2026-10-05T10:00:00.000Z');

/**
 * Un IBAN français de TEST, fabriqué à l'exécution depuis des numéros fictifs : la clé RIB et la clé
 * de contrôle sont calculées, aucune coordonnée réelle n'est écrite dans le dépôt (`gov:entite`).
 */
function ibanDeTest(banque: string, guichet: string, compte: string): string {
  const reste = (chiffres: string) => [...chiffres].reduce((r, c) => (r * 10 + Number(c)) % 97, 0);
  const cle = 97 - ((89 * Number(banque) + 15 * Number(guichet) + 3 * Number(compte)) % 97);
  const bban = `${banque}${guichet}${compte}${String(cle).padStart(2, '0')}`;
  // « FR » vaut 15 27 ; la clé de contrôle est 98 moins le reste de (bban + FR00) modulo 97.
  const controle = 98 - reste(`${bban}152700`);
  return `FR${String(controle).padStart(2, '0')}${bban}`;
}
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-cpl-t24-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});
const IBAN = ibanDeTest('90001', '00002', '00000012345');

type Piece = {
  id: string;
  apporteurId: string;
  type: string;
  statut: string;
  ribVerifieParId: string | null;
  ribVerifieAt: Date | null;
  ribConfirmeAt: Date | null;
};
const pieceRib = (p: Partial<Piece> = {}): Piece => ({
  id: PIECE,
  apporteurId: APPORTEUR,
  type: 'rib',
  statut: 'a_verifier',
  ribVerifieParId: null,
  ribVerifieAt: null,
  ribConfirmeAt: null,
  ...p,
});

/** Un faux client : la pièce lue, les ouvreurs du dossier au journal, la courante ; tout est noté. */
function fauxClient(o: {
  piece: Piece | null;
  ouvreurs?: string[];
  courante?: string | null;
  compte?: number;
}) {
  const appels: { quoi: string; args: unknown }[] = [];
  const tx = {
    pieceKyc: {
      findUnique: async (args: unknown) => {
        appels.push({ quoi: 'lire', args });
        return o.piece;
      },
      findFirst: async (args: unknown) => {
        appels.push({ quoi: 'courante', args });
        return o.courante ? { id: o.courante } : null;
      },
      update: async (args: unknown) => {
        appels.push({ quoi: 'ecarter', args });
        return {};
      },
      updateMany: async (args: unknown) => {
        appels.push({ quoi: 'ecrire', args });
        return { count: o.compte ?? 1 };
      },
    },
    $queryRaw: async (chaines: TemplateStringsArray, ...valeurs: unknown[]) => {
      const sql = Prisma.sql(chaines, ...valeurs);
      appels.push({ quoi: 'ouvreurs', args: { sql: sql.sql, valeurs: sql.values } });
      return (o.ouvreurs ?? []).map((id) => ({ id }));
    },
  };
  const evenements: unknown[] = [];
  const client = {
    $transaction: async (f: (t: unknown) => Promise<unknown>) => f(tx),
  } as unknown as PrismaClient;
  return { client, appels, evenements, tx };
}

async function motif(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurRibQuatreYeux) return e.motif;
    throw e;
  }
  return 'aucun refus';
}

const ecritures = (appels: { quoi: string }[]) =>
  appels.filter((a) => a.quoi === 'ecrire' || a.quoi === 'ecarter');

describe('REQ-DM-027 — vérifier un RIB : le premier regard', () => {
  it('REQ-DM-027 : TÉMOIN — un non-administrateur est refusé, sans transaction', async () => {
    const f = fauxClient({ piece: pieceRib() });
    for (const role of ['qualifieur', 'comptable', 'lecteur'] as const)
      expect(
        await motif(
          verifierUnRib(f.client, {
            acteur: { id: ADMIN.id, role },
            pieceId: PIECE,
            maintenant: MAINTENANT,
          })
        )
      ).toBe('droit_absent');
    expect(f.appels).toEqual([]);
  });

  it('REQ-DM-027 : TÉMOIN — une autre pièce qu’un RIB est refusée, nommée, AVANT toute écriture', async () => {
    const f = fauxClient({ piece: pieceRib({ type: 'identite' }) });
    expect(
      await motif(
        verifierUnRib(f.client, { acteur: ADMIN, pieceId: PIECE, maintenant: MAINTENANT })
      )
    ).toBe('pas_un_rib');
    expect(ecritures(f.appels)).toEqual([]);
  });

  it('REQ-DM-027 : TÉMOIN — une pièce introuvable, déjà vérifiée ou qui n’est plus à vérifier est refusée, sans écriture', async () => {
    for (const [piece, attendu] of [
      [null, 'introuvable'],
      [pieceRib({ ribVerifieParId: AUTRE_ADMIN.id, ribVerifieAt: MAINTENANT }), 'deja_verifie'],
      [pieceRib({ statut: 'valide' }), 'pas_a_verifier'],
    ] as const) {
      const f = fauxClient({ piece });
      expect(
        await motif(
          verifierUnRib(f.client, { acteur: ADMIN, pieceId: PIECE, maintenant: MAINTENANT })
        ),
        attendu
      ).toBe(attendu);
      expect(ecritures(f.appels)).toEqual([]);
    }
  });

  it('REQ-DM-027 : TÉMOIN — l’auteur de l’ouverture du dossier, relu au journal, est refusé', async () => {
    const f = fauxClient({ piece: pieceRib(), ouvreurs: [ADMIN.id] });
    expect(
      await motif(
        verifierUnRib(f.client, { acteur: ADMIN, pieceId: PIECE, maintenant: MAINTENANT })
      )
    ).toBe('auteur_de_l_ouverture');
    expect(ecritures(f.appels)).toEqual([]);
    const lecture = f.appels.find((a) => a.quoi === 'ouvreurs')!.args as {
      sql: string;
      valeurs: unknown[];
    };
    expect(lecture.sql).toMatch(/FROM "evenements"/);
    expect(lecture.sql).toMatch(/"type" = 'apporteur_statut_modifie'/);
    expect(lecture.sql).toMatch(/"charge"->>'transition' = 'ouvrir_kyc'/);
    expect(lecture.valeurs).toEqual([APPORTEUR]);
  });

  it('REQ-DM-027 : TÉMOIN — la vérification pose le regard et sa date, une fois, sans toucher le statut', async () => {
    const f = fauxClient({ piece: pieceRib(), ouvreurs: [AUTRE_ADMIN.id] });
    await verifierUnRib(f.client, { acteur: ADMIN, pieceId: PIECE, maintenant: MAINTENANT });
    expect(ecritures(f.appels)).toEqual([
      {
        quoi: 'ecrire',
        args: {
          where: { id: PIECE, type: 'rib', statut: 'a_verifier', ribVerifieAt: null },
          data: { ribVerifieParId: ADMIN.id, ribVerifieAt: MAINTENANT },
        },
      },
    ]);
  });

  it('REQ-DM-027 : une écriture qui ne touche rien (concurrence) est refusée, nommée', async () => {
    const f = fauxClient({ piece: pieceRib(), compte: 0 });
    expect(
      await motif(
        verifierUnRib(f.client, { acteur: ADMIN, pieceId: PIECE, maintenant: MAINTENANT })
      )
    ).toBe('deja_verifie');
  });
});

describe('REQ-UX-027 — confirmer un RIB : le second regard pose `valide` dans la même écriture', () => {
  const verifie = (p: Partial<Piece> = {}) =>
    pieceRib({
      ribVerifieParId: ADMIN.id,
      ribVerifieAt: new Date(MAINTENANT.getTime() - 60_000),
      ...p,
    });

  it('REQ-UX-027 : TÉMOIN — une confirmation sans vérification, déjà posée, ou par la même personne est refusée, sans écriture', async () => {
    for (const [piece, acteur, attendu] of [
      [pieceRib(), AUTRE_ADMIN, 'pas_encore_verifie'],
      [verifie({ ribConfirmeAt: MAINTENANT }), AUTRE_ADMIN, 'deja_confirme'],
      [verifie(), ADMIN, 'meme_regard'],
      [verifie({ type: 'rc_pro' }), AUTRE_ADMIN, 'pas_un_rib'],
    ] as const) {
      const f = fauxClient({ piece });
      expect(
        await motif(confirmerUnRib(f.client, { acteur, pieceId: PIECE, maintenant: MAINTENANT })),
        attendu
      ).toBe(attendu);
      expect(ecritures(f.appels)).toEqual([]);
    }
  });

  it('REQ-UX-027 : TÉMOIN — l’auteur de l’ouverture est refusé au second regard aussi', async () => {
    const f = fauxClient({ piece: verifie(), ouvreurs: [AUTRE_ADMIN.id] });
    expect(
      await motif(
        confirmerUnRib(f.client, { acteur: AUTRE_ADMIN, pieceId: PIECE, maintenant: MAINTENANT })
      )
    ).toBe('auteur_de_l_ouverture');
    expect(ecritures(f.appels)).toEqual([]);
  });

  it('REQ-UX-027 : TÉMOIN — la confirmation écarte la courante, puis pose `valide`, le regard et sa date dans la MÊME écriture', async () => {
    const f = fauxClient({ piece: verifie(), courante: COURANTE });
    const evenements: unknown[] = [];
    await confirmerUnRib(f.client, {
      acteur: AUTRE_ADMIN,
      pieceId: PIECE,
      maintenant: MAINTENANT,
      ecrireUnFait: async (_tx, e) => void evenements.push(e),
    });
    expect(ecritures(f.appels)).toEqual([
      { quoi: 'ecarter', args: { where: { id: COURANTE }, data: { remplaceeAt: MAINTENANT } } },
      {
        quoi: 'ecrire',
        args: {
          where: {
            id: PIECE,
            type: 'rib',
            statut: 'a_verifier',
            ribVerifieAt: { not: null },
            ribConfirmeAt: null,
          },
          data: {
            statut: 'valide',
            verifieeAt: MAINTENANT,
            ribConfirmeParId: AUTRE_ADMIN.id,
            ribConfirmeAt: MAINTENANT,
          },
        },
      },
    ]);
    expect(evenements).toEqual([
      {
        type: 'piece_kyc_statut_modifie',
        agregat: 'piece_kyc',
        agregatId: PIECE,
        survenuAt: MAINTENANT,
        charge: {
          de: 'a_verifier',
          vers: 'valide',
          type: 'rib',
          acteur: { par: 'utilisateur_console', id: AUTRE_ADMIN.id },
        },
      },
    ]);
    // Ni IBAN, ni BIC, ni empreinte dans la charge chaînée (condition de la sécurité).
    expect(JSON.stringify(evenements)).not.toMatch(/iban|bic|hash|empreinte/i);
  });
});

describe('REQ-UX-027 — aucun versement vers un RIB non validé : le juge du versement, fermé', () => {
  const empreinte = empreinteRecherche('iban', IBAN, CLES);
  const ligne = (p: Record<string, unknown> = {}) => ({
    apporteur_id: APPORTEUR,
    type: 'rib',
    statut: 'valide',
    rib_verifie_at: new Date(MAINTENANT.getTime() - 120_000),
    rib_confirme_at: new Date(MAINTENANT.getTime() - 60_000),
    remplacee_at: null,
    iban_hash: empreinte,
    ...p,
  });
  function tx(lignes: Record<string, unknown>[]) {
    const lectures: { sql: string; valeurs: unknown[] }[] = [];
    return {
      lectures,
      tx: {
        $queryRaw: async (chaines: TemplateStringsArray, ...valeurs: unknown[]) => {
          const s = Prisma.sql(chaines, ...valeurs);
          lectures.push({ sql: s.sql, valeurs: s.values });
          return lignes;
        },
      } as unknown as Prisma.TransactionClient,
    };
  }
  const exiger = (
    t: Prisma.TransactionClient,
    p: Partial<{ apporteurId: string; ibanPaye: string; pieceId: string }> = {}
  ) =>
    exigerUnRibVersable(t, {
      pieceId: PIECE,
      apporteurId: APPORTEUR,
      ibanPaye: IBAN,
      cles: CLES,
      ...p,
    });

  it('REQ-UX-027 : TÉMOIN — la pièce confirmée, non remplacée, au bon apporteur et à la bonne empreinte passe ; elle est lue sous FOR SHARE', async () => {
    const t = tx([ligne()]);
    await expect(exiger(t.tx)).resolves.toBeUndefined();
    expect(t.lectures[0]!.sql).toMatch(/FROM "pieces_kyc" WHERE "id" = \?::uuid FOR SHARE/);
    expect(t.lectures[0]!.valeurs).toEqual([PIECE]);
  });

  it('REQ-UX-027 : TÉMOIN À DEUX FACES — remplacée, d’un autre apporteur, d’une autre empreinte, à vérifier, ou validée par une seule personne : rib_non_valide, sans détail', async () => {
    const autreIban = `${IBAN.slice(0, -1)}8`;
    for (const [nom, lignes, p] of [
      ['remplacée', [ligne({ remplacee_at: MAINTENANT })], {}],
      ['autre apporteur', [ligne()], { apporteurId: '0190f0f0-0000-7000-8000-0000000000b2' }],
      ['empreinte différente d’un caractère', [ligne()], { ibanPaye: autreIban }],
      [
        'un autre IBAN valide',
        [ligne()],
        { ibanPaye: ibanDeTest('90001', '00002', '00000067890') },
      ],
      ['à vérifier', [ligne({ statut: 'a_verifier', rib_confirme_at: null })], {}],
      ['une seule personne', [ligne({ rib_confirme_at: null })], {}],
      ['pas un RIB', [ligne({ type: 'identite' })], {}],
      ['introuvable', [], {}],
    ] as const) {
      const t = tx([...lignes]);
      const refus = await exiger(t.tx, p).then(
        () => null,
        (e: unknown) => e
      );
      expect(refus, nom).toBeInstanceOf(RibNonValide);
      expect((refus as Error).message, nom).toBe('rib_non_valide');
    }
  });

  it('REQ-UX-027 : un identifiant de pièce hors forme est refusé, fermé, sans lecture', async () => {
    const t = tx([ligne()]);
    await expect(exiger(t.tx, { pieceId: 'pas-un-uuid' })).rejects.toBeInstanceOf(RibNonValide);
    expect(t.lectures).toEqual([]);
  });
});

describe('REQ-DM-027 — rib.ts ne lit jamais l’IBAN (condition de la sécurité, CPL-T24)', () => {
  const source = readFileSync('src/server/conformite/rib.ts', 'utf8');

  it('REQ-DM-027 : TÉMOIN STATIQUE — ni decryptPii, ni lecteur du stockage, ni ibanChiffre, ni fichierRef', () => {
    expect(source).not.toMatch(/decryptPii|ibanChiffre|iban_chiffre|fichierRef|fichier_ref/);
    expect(source).not.toMatch(/from '[^']*stockage[^']*'/);
  });

  it('REQ-DM-027 : TÉMOIN STATIQUE — aucune route ni écran : rib.ts n’est importé par aucun fichier de src/app', () => {
    // Lu sur le disque, sans git : le bac à sable de la mutation n'est pas un dépôt.
    const sources = (dossier: string): string[] =>
      readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
        const chemin = `${dossier}/${e.name}`;
        if (e.isDirectory()) return sources(chemin);
        return /\.tsx?$/.test(e.name) ? [chemin] : [];
      });
    const fichiers = sources('src/app');
    expect(fichiers.length).toBeGreaterThan(0);
    const importeurs = fichiers.filter((f) => /conformite\/rib['"]/.test(readFileSync(f, 'utf8')));
    expect(importeurs).toEqual([]);
  });
});
