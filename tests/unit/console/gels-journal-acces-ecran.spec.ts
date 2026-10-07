// @req REQ-SEC-023
// @req REQ-UX-047
/**
 * L'écran des gels du journal des accès, rendu EN PROCESSUS par son composant pur, et son droit RELU
 * en base sur un faux client. La règle du gel (poser, lever, quatre yeux, événement) est jugée par
 * `tests/unit/securite/gels-journal-acces.spec.ts` et par le témoin d'intégration du module.
 *
 * CE QUE CE FICHIER GARDE.
 *   (1) REQ-SEC-023 — le droit de l'écran : un administrateur VALIDÉ, actif, voit poser ET lever ;
 *       tout autre rôle, un administrateur en attente ou désactivé, ne voit ni l'écran ni le geste.
 *       Le droit est relu EN BASE, et un refus ne lit aucun gel.
 *   (2) REQ-SEC-023 — le rendu : le formulaire de pose et le bouton de levée n'existent que si le
 *       droit les ouvre ; un gel levé n'a plus de bouton.
 *   (3) REQ-UX-047 — chaque refus du module a sa phrase, et celui où personne d'autre ne peut lever
 *       le dit : « aucun autre administrateur ». Aucun texte en dur dans le composant.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleRole, PrismaClient } from '@prisma/client';
import { MATRICE_DES_ROLES, ROLES_CONSOLE, roleAutorise } from '../../../src/server/roles/matrice';
import {
  CurseurDesGelsIllisible,
  droitsDuLecteurSurLesGels,
  droitsSurLesGels,
  lireLesGels,
  type MotifDuGel,
} from '../../../src/server/console/gels-journal-acces';
import { GELS_JOURNAL_ACCES_PAGE_MAX } from '../../../src/domain/seuils/ssot';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii } from '../../../src/server/securite/pii';
import { GELS_JOURNAL_ACCES as T } from '../../../src/content/micro-copy/console/gels-journal-acces';
import {
  EcranDesGels,
  type GelAffiche,
} from '../../../src/app/(console)/console/journal-des-acces/gels/_gels/ecran';
import { ROUTES_LIVREES_DE_LA_CONSOLE } from '../../../src/server/console/navigation';
import {
  lireLaSaisieDuGel,
  lireLeGelALever,
} from '../../../src/app/(console)/console/journal-des-acces/gels/_gels/saisie';

const DEPUIS = new Date('2026-01-01T00:00:00.000Z');
const POSE = new Date('2028-05-01T09:00:00.000Z');
const LECTEUR = '0190f0f0-0000-7000-8000-00000000000a';
const ADMIN = { id: LECTEUR, role: 'admin' as const };
const ECRAN = 'src/app/(console)/console/journal-des-acces/gels/_gels/ecran.tsx';

type Lu = { role: ConsoleRole; desactiveAt: Date | null; valideAt: Date | null };
const valide = (role: ConsoleRole): Lu => ({ role, desactiveAt: null, valideAt: DEPUIS });

const rien = async (): Promise<void> => undefined;
const ACTIONS = { poser: rien, lever: rien };

const gel = (extra: Partial<GelAffiche> = {}): GelAffiche => ({
  id: '0190f0f0-0000-7000-8000-00000000000e',
  motif: 'litige',
  reference: 'LIT-0042',
  portee: 'utilisateur',
  depuis: DEPUIS,
  jusquA: null,
  poseAt: POSE,
  leveAt: null,
  ...extra,
});

const date = (d: Date) => d.toISOString().slice(0, 10);

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-ecran-gel-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});

function rendu(
  o: {
    gels?: GelAffiche[];
    droits?: { poser: boolean; lever: boolean };
    refus?: MotifDuGel | null;
  } = {}
) {
  return renderToStaticMarkup(
    createElement(EcranDesGels, {
      gels: o.gels ?? [gel()],
      droits: o.droits ?? { poser: true, lever: true },
      actions: ACTIONS,
      refus: o.refus ?? null,
      date,
    })
  );
}

describe('REQ-SEC-023 — (1) le droit de l’écran des gels', () => {
  it('REQ-SEC-023 — un administrateur validé et actif voit poser ET lever', () => {
    expect(droitsSurLesGels(valide('admin'))).toEqual({ poser: true, lever: true });
  });

  it('REQ-SEC-023 — TÉMOIN : l’administrateur en attente, désactivé, ou inconnu ne voit rien', () => {
    expect(droitsSurLesGels({ role: 'admin', desactiveAt: null, valideAt: null })).toBeNull();
    expect(droitsSurLesGels({ role: 'admin', desactiveAt: POSE, valideAt: DEPUIS })).toBeNull();
    expect(droitsSurLesGels(null)).toBeNull();
  });

  it('REQ-SEC-023 — TÉMOIN : chaque rôle que la matrice n’ouvre pas aux gels ne voit rien, validé ou non', () => {
    // Le droit de l'écran, un seul pour l'onglet et la lecture (condition 2 de la sécurité).
    expect(MATRICE_DES_ROLES['ecran:gels_journal_acces']).toEqual({
      roles: ['admin'],
      stepUp: false,
    });
    const autres = ROLES_CONSOLE.filter((r) => !roleAutorise('ecran:gels_journal_acces', r));
    // La liste n'est pas vide : sinon ce témoin ne jugerait rien.
    expect(autres).toEqual(['qualifieur', 'comptable', 'lecteur']);
    for (const r of autres) expect(droitsSurLesGels(valide(r)), r).toBeNull();
  });

  it('REQ-SEC-023 — le droit est RELU en base, sur le lecteur seul ; un refus ne lit aucun gel', async () => {
    const appels: { modele: string; args: unknown }[] = [];
    const client = (lu: Lu | null) =>
      ({
        utilisateurConsole: {
          findUnique: async (a: unknown) => {
            appels.push({ modele: 'utilisateurConsole', args: a });
            return lu;
          },
        },
        journalAccesConsoleGel: {
          findMany: async (a: unknown) => {
            appels.push({ modele: 'journalAccesConsoleGel', args: a });
            return [];
          },
        },
      }) as unknown as PrismaClient;

    expect(await droitsDuLecteurSurLesGels(client(valide('admin')), LECTEUR)).toEqual({
      poser: true,
      lever: true,
    });
    expect(appels).toEqual([
      {
        modele: 'utilisateurConsole',
        args: {
          where: { id: LECTEUR },
          select: { role: true, desactiveAt: true, valideAt: true },
        },
      },
    ]);
    appels.length = 0;
    expect(
      await droitsDuLecteurSurLesGels(
        client({ role: 'admin', desactiveAt: null, valideAt: null }),
        LECTEUR
      )
    ).toBeNull();
    expect(appels.map((a) => a.modele)).toEqual(['utilisateurConsole']);
  });
});

describe('REQ-SEC-023 — (2) le rendu : le geste n’existe que si le droit l’ouvre', () => {
  it('REQ-SEC-023 — l’administrateur validé voit le formulaire de pose et le bouton de levée', () => {
    const html = rendu();
    expect(html).toContain(T.poser.titre);
    expect(html).toContain(`>${T.poser.envoyer}</button>`);
    expect(html).toContain(`>${T.actions.lever}</button>`);
    expect(html).toContain('name="gelId" value="0190f0f0-0000-7000-8000-00000000000e"');
  });

  it('REQ-SEC-023 — TÉMOIN : sans le droit, ni formulaire de pose ni bouton de levée', () => {
    const html = rendu({ droits: { poser: false, lever: false } });
    expect(html).not.toContain(T.poser.titre);
    expect(html).not.toContain('<form');
    expect(html).not.toContain(T.actions.lever);
  });

  it('REQ-SEC-023 — un gel levé n’a plus de bouton : il dit quand il l’a été', () => {
    const html = rendu({ gels: [gel({ leveAt: new Date('2028-05-20T09:00:00.000Z') })] });
    expect(html).not.toContain(`>${T.actions.lever}</button>`);
    expect(html).toContain(T.etats.leve('2028-05-20'));
  });

  it('REQ-SEC-023 — la liste ne montre ni l’auteur ni la personne visée : la portée, son type seul', () => {
    const html = rendu();
    expect(html).toContain(T.portees.utilisateur);
    expect(html).toContain('LIT-0042');
    expect(html).not.toMatch(/poseParId|utilisateurViseId|cibleId/);
  });
});

describe('REQ-UX-047 — (3) les refus, les états et la source unique des textes', () => {
  it('REQ-UX-047 — chaque refus du module a sa phrase, rendue telle quelle', () => {
    const motifs: MotifDuGel[] = [
      'droit_absent',
      'introuvable',
      'deja_leve',
      'leveur_interdit',
      'aucun_autre_administrateur',
    ];
    expect(Object.keys(T.refus).sort()).toEqual([...motifs].sort());
    for (const m of motifs) expect(rendu({ refus: m })).toContain(T.refus[m]);
  });

  it('REQ-UX-047 — quand personne d’autre ne peut lever, l’écran le dit : « aucun autre administrateur »', () => {
    expect(T.refus.aucun_autre_administrateur).toMatch(/aucun autre administrateur/);
    const html = rendu({ refus: 'aucun_autre_administrateur' });
    expect(html).toContain('role="alert"');
    expect(html).toContain(T.refus.aucun_autre_administrateur);
  });

  it('REQ-UX-047 — l’état vide dit le geste suivant, et reste muet sur la pose sans le droit', () => {
    expect(rendu({ gels: [] })).toContain(T.vide.titre);
    expect(rendu({ gels: [] })).toContain(T.vide.phrase);
    const sansDroit = rendu({ gels: [], droits: { poser: false, lever: false } });
    expect(sansDroit).toContain(T.vide.titre);
    expect(sansDroit).not.toContain(T.poser.titre);
    expect(sansDroit).not.toContain(T.poser.envoyer);
    expect(sansDroit).not.toContain('<form');
  });

  it('REQ-UX-047 — aucun texte en dur dans le composant : tout vient de la micro-copie', () => {
    const source = readFileSync(ECRAN, 'utf8');
    expect(source).toMatch(/content\/micro-copy\/console\/gels-journal-acces/);
    // Après une balise ouvrante, rien que des expressions : aucun mot écrit à la main.
    const texteEnDur = /<[a-z][^<>]*>\s*[A-Za-zÀ-ÿ][^<>{}]*</g;
    expect(source.match(texteEnDur) ?? []).toEqual([]);
    // TÉMOIN : le même contrôle voit un libellé tapé dans un bouton.
    expect('<button type="submit">Lever</button>'.match(texteEnDur)).toHaveLength(1);
  });
});

describe('REQ-SEC-023 — (4) la saisie de la pose, fermée avant tout travail', () => {
  const formulaire = (o: Record<string, string>) => {
    const f = new FormData();
    const base = {
      motif: 'litige',
      reference: 'LIT-0042',
      portee: 'utilisateur',
      identifiant: '0190F0F0-0000-7000-8000-00000000000C',
      depuis: '2026-01-01',
      jusquA: '',
    };
    for (const [k, v] of Object.entries({ ...base, ...o })) f.set(k, v);
    return f;
  };

  it('REQ-SEC-023 — une saisie juste est lue : jours de Paris, fin de jour incluse, identifiant en minuscules', () => {
    expect(lireLaSaisieDuGel(formulaire({ jusquA: '2026-07-31' }))).toEqual({
      motif: 'litige',
      reference: 'LIT-0042',
      portee: 'utilisateur',
      identifiant: '0190f0f0-0000-7000-8000-00000000000c',
      // Minuit à Paris en hiver : 23 h UTC la veille.
      depuis: new Date('2025-12-31T23:00:00.000Z'),
      // La dernière milliseconde du 31 juillet à Paris, en été.
      jusquA: new Date('2026-07-31T21:59:59.999Z'),
    });
    expect(lireLaSaisieDuGel(formulaire({}))?.jusquA).toBeNull();
  });

  it('REQ-SEC-023 — TÉMOINS : chaque forme fautive rend null, sans rien écrire', () => {
    for (const faute of [
      { motif: 'autre' },
      { portee: 'tous' },
      { identifiant: '42' },
      { reference: '' },
      { depuis: '' },
      { depuis: '2026-02-30' },
      { jusquA: '2025-12-31' },
      { jusquA: 'demain' },
    ] as Record<string, string>[])
      expect(lireLaSaisieDuGel(formulaire(faute)), JSON.stringify(faute)).toBeNull();
  });

  it('REQ-SEC-023 — TÉMOIN (RM-01) : motifs et portées viennent de leur source unique, jamais d’une copie', async () => {
    // Une valeur ajoutée à la source (`charges.ts`, confrontée au schéma par la garde des
    // énumérations) doit être lue par la saisie : une copie locale la refuserait en silence.
    vi.resetModules();
    vi.doMock('../../../src/domain/evenement/charges', async (origine) => ({
      ...(await origine<Record<string, unknown>>()),
      MOTIFS_GEL_JOURNAL: ['incident', 'litige', 'temoin_motif'],
      PORTEES_GEL_JOURNAL: ['utilisateur', 'cible', 'temoin_portee'],
    }));
    try {
      const { lireLaSaisieDuGel: lire } = await import(
        '../../../src/app/(console)/console/journal-des-acces/gels/_gels/saisie'
      );
      expect(lire(formulaire({ motif: 'temoin_motif' }))?.motif).toBe('temoin_motif');
      expect(lire(formulaire({ portee: 'temoin_portee' }))?.portee).toBe('temoin_portee');
      expect(lire(formulaire({ motif: 'autre' }))).toBeNull();
    } finally {
      vi.doUnmock('../../../src/domain/evenement/charges');
      vi.resetModules();
    }
  });

  it('REQ-SEC-023 — TÉMOINS : l’identifiant du gel à lever est un UUID, sinon la saisie est refusée', () => {
    const avec = (gelId: string) => {
      const f = new FormData();
      f.set('gelId', gelId);
      return f;
    };
    expect(lireLeGelALever(avec('0190F0F0-0000-7000-8000-00000000000E'))).toBe(
      '0190f0f0-0000-7000-8000-00000000000e'
    );
    for (const faute of ['', '42', 'x'.repeat(36), "0190f0f0-0000-7000-8000-00000000000e' OR 1"])
      expect(lireLeGelALever(avec(faute)), faute).toBeNull();
    expect(lireLeGelALever(new FormData())).toBeNull();
  });
});

// ── (5) la liste des gels : bornée, paginée par curseur, tracée avant le rendu ──

type GelEnBase = {
  id: string;
  motif: 'incident' | 'litige';
  reference: string;
  utilisateurViseId: string | null;
  cibleId: string | null;
  depuis: Date;
  jusquA: Date | null;
  poseAt: Date;
  leveAt: Date | null;
};

const VISE_A = '0190f0f0-0000-7000-8000-0000000000a1';
const VISE_B = '0190f0f0-0000-7000-8000-0000000000b2';
const UNE_CIBLE = '0190f0f0-0000-7000-8000-0000000000c3';

/** `n` gels, du plus récent au plus ancien, posés une heure d'écart, tous sur `vise`. */
function gelsEnBase(n: number, vise: (i: number) => Partial<GelEnBase> = () => ({})): GelEnBase[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `0190f0f0-0000-7000-8000-${String(1000 + i).padStart(12, '0')}`,
    motif: 'litige' as const,
    reference: `LIT-${String(i).padStart(4, '0')}`,
    utilisateurViseId: VISE_A,
    cibleId: null,
    depuis: DEPUIS,
    jusquA: null,
    poseAt: new Date(POSE.getTime() - i * 3_600_000),
    leveAt: null,
    ...vise(i),
  }));
}

/**
 * Un faux client qui applique le keyset et l'ordre comme la base : il juge le `where` qu'il reçoit,
 * au lieu de rendre une liste fixe — sinon la reprise après la dernière ligne ne serait pas jugée.
 */
function base(o: { lecteur?: Lu | null; gels?: GelEnBase[]; traceEchoue?: boolean } = {}) {
  const appels: string[] = [];
  const traces: { utilisateurConsoleId: string; nature: string; cibleId: string | null }[] = [];
  const lecteur = o.lecteur === undefined ? valide('admin') : o.lecteur;
  const gels = o.gels ?? [];
  type Where = {
    OR?: ({ poseAt: { lt: Date } } | { poseAt: Date; id: { lt: string } })[];
  };
  const tx = {
    utilisateurConsole: {
      findUnique: async () => {
        appels.push('lecteur');
        return lecteur;
      },
    },
    journalAccesConsoleGel: {
      findMany: async (a: { where?: Where; take: number; orderBy: unknown }) => {
        appels.push('gels');
        expect(a.orderBy).toEqual([{ poseAt: 'desc' }, { id: 'desc' }]);
        const apres = (g: GelEnBase) =>
          !a.where?.OR ||
          a.where.OR.some((c) =>
            'id' in c
              ? g.poseAt.getTime() === c.poseAt.getTime() && g.id < c.id.lt
              : g.poseAt < c.poseAt.lt
          );
        return [...gels]
          .sort((x, y) => y.poseAt.getTime() - x.poseAt.getTime() || (x.id < y.id ? 1 : -1))
          .filter(apres)
          .slice(0, a.take);
      },
    },
    journalAccesConsole: {
      create: async (a: {
        data: { utilisateurConsoleId: string; nature: string; cibleId: string | null };
      }) => {
        appels.push('trace');
        if (o.traceEchoue) throw new Error('écriture refusée');
        traces.push({
          utilisateurConsoleId: a.data.utilisateurConsoleId,
          nature: a.data.nature,
          cibleId: a.data.cibleId,
        });
        return a;
      },
    },
  };
  const client = {
    ...tx,
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push('transaction');
      return f(tx);
    },
  } as unknown as PrismaClient;
  return { client, appels, traces };
}

const lire = (client: PrismaClient, o: { curseur?: string | null; taille?: number } = {}) =>
  lireLesGels(
    client,
    { lecteur: ADMIN, adresse: null, curseur: o.curseur ?? null, taille: o.taille },
    CLES
  );

describe('REQ-SEC-023 — (5) la liste des gels, bornée et paginée par curseur', () => {
  it('REQ-SEC-023 — la borne est en SSOT, à 50 lignes, avec sa source', () => {
    expect(GELS_JOURNAL_ACCES_PAGE_MAX.valeur).toBe(50);
    expect(GELS_JOURNAL_ACCES_PAGE_MAX.source).toMatch(/coordination.*sécurité/);
  });

  it('REQ-SEC-023 — TÉMOIN : une page ne dépasse jamais la borne, même quand on en demande plus', async () => {
    const { client } = base({ gels: gelsEnBase(120) });
    const page = await lire(client, { taille: 500 });
    expect(page.gels).toHaveLength(GELS_JOURNAL_ACCES_PAGE_MAX.valeur);
    expect(page.suivant).not.toBeNull();
    expect((await lire(client, { taille: 3 })).gels).toHaveLength(3);
    expect((await lire(client, { taille: 0 })).gels).toHaveLength(1);
  });

  it('REQ-SEC-023 — TÉMOIN : la page suivante reprend exactement après la dernière ligne rendue', async () => {
    // Deux gels posés au MÊME instant : seul l'identifiant les départage.
    const gels = gelsEnBase(7, (i) => (i === 3 || i === 4 ? { poseAt: POSE } : {}));
    const { client } = base({ gels });
    const vus: string[] = [];
    let curseur: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof lire>> = await lire(client, { curseur, taille: 2 });
      vus.push(...page.gels.map((g) => g.id));
      curseur = page.suivant;
    } while (curseur !== null);
    const attendu = [...gels]
      .sort((x, y) => y.poseAt.getTime() - x.poseAt.getTime() || (x.id < y.id ? 1 : -1))
      .map((g) => g.id);
    expect(vus).toEqual(attendu);
  });

  it('REQ-SEC-023 — TÉMOIN : un curseur forgé ou illisible est refusé sans rien lire', async () => {
    for (const forge of ['nimportequoi', 'AAAA', btoa('2028.pas-un-id'), '../../etc']) {
      const { client, appels } = base({ gels: gelsEnBase(3) });
      await expect(lire(client, { curseur: forge }), forge).rejects.toBeInstanceOf(
        CurseurDesGelsIllisible
      );
      expect(appels, forge).toEqual([]);
    }
  });

  it('REQ-SEC-023 — la liste ne rend que le motif, la référence, le type de portée et les dates', async () => {
    const { client } = base({ gels: gelsEnBase(1) });
    const [g] = (await lire(client)).gels;
    expect(Object.keys(g!).sort()).toEqual(
      ['id', 'motif', 'reference', 'portee', 'depuis', 'jusquA', 'poseAt', 'leveAt'].sort()
    );
    expect(g!.portee).toBe('utilisateur');
  });
});

describe('REQ-SEC-023 — (6) chaque page lue écrit ses traces avant d’être rendue', () => {
  it('REQ-SEC-023 — TÉMOIN : deux gels sur le même utilisateur, UNE ligne pour lui, au nom du lecteur', async () => {
    const gels = gelsEnBase(3, (i) => (i === 2 ? { utilisateurViseId: VISE_B } : {}));
    const { client, traces, appels } = base({ gels });
    await lire(client);
    expect(traces).toEqual([
      { utilisateurConsoleId: LECTEUR, nature: 'lecture_journal_acces', cibleId: VISE_A },
      { utilisateurConsoleId: LECTEUR, nature: 'lecture_journal_acces', cibleId: VISE_B },
    ]);
    // Dans UNE transaction : le rôle relu, la page lue, les traces écrites.
    expect(appels).toEqual(['transaction', 'lecteur', 'gels', 'trace', 'trace']);
  });

  it('REQ-SEC-023 — TÉMOIN : une page de gels sur des cibles n’écrit aucune ligne', async () => {
    const gels = gelsEnBase(2, () => ({ utilisateurViseId: null, cibleId: UNE_CIBLE }));
    const { client, traces } = base({ gels });
    const page = await lire(client);
    expect(traces).toEqual([]);
    expect(page.gels.map((g) => g.portee)).toEqual(['cible', 'cible']);
  });

  it('REQ-SEC-023 — TÉMOIN : une trace qui échoue fait échouer la lecture, rien n’est rendu', async () => {
    const { client } = base({ gels: gelsEnBase(2), traceEchoue: true });
    await expect(lire(client)).rejects.toThrow('écriture refusée');
  });

  it('REQ-SEC-023 — TÉMOIN : un rôle de session non admis est refusé sans lire ni écrire', async () => {
    for (const role of ['qualifieur', 'comptable', 'lecteur'] as const) {
      const { client, appels } = base({ lecteur: valide(role), gels: gelsEnBase(2) });
      await expect(
        lireLesGels(client, { lecteur: { id: LECTEUR, role }, adresse: null, curseur: null }, CLES)
      ).rejects.toMatchObject({ motif: 'droit_absent' });
      expect(appels, role).toEqual(['transaction']);
    }
  });

  it('REQ-SEC-023 — TÉMOIN : un rôle non admis, ou un admin en attente, ne lit rien et n’écrit rien', async () => {
    for (const lecteur of [
      valide('lecteur'),
      valide('qualifieur'),
      { role: 'admin' as const, desactiveAt: null, valideAt: null },
      null,
    ]) {
      const { client, appels } = base({ lecteur, gels: gelsEnBase(2) });
      await expect(lire(client)).rejects.toMatchObject({ motif: 'droit_absent' });
      expect(appels, JSON.stringify(lecteur)).toEqual(['transaction', 'lecteur']);
    }
  });
});

describe('REQ-SEC-023 — (7) l’onglet : la route est livrée, et seul l’admin validé en voit le lien', () => {
  const UTILISATEURS = 'src/app/(console)/console/utilisateurs/page.tsx';

  /** Le lien vers les gels, et la condition qui l'ouvre, lus dans la source de l'administration. */
  function fautesDuLien(source: string): string[] {
    const fautes: string[] = [];
    const lien = /\{(\w+)\s*\?\s*\(?\s*<p>\s*<a href="\/console\/journal-des-acces\/gels">/.exec(
      source
    );
    if (!lien) return ['lien absent, ou ouvert sans condition'];
    const garde = new RegExp(
      `const ${lien[1]} =\\s*\\(?\\s*await droitsDuLecteurSurLesGels\\(d\\.prisma, moi\\)`
    );
    if (!garde.test(source)) fautes.push(`« ${lien[1]} » n’est pas le droit relu des gels`);
    return fautes;
  }

  it('REQ-SEC-023 — le lien depuis l’administration n’existe que sous le droit relu des gels', () => {
    expect(fautesDuLien(readFileSync(UTILISATEURS, 'utf8'))).toEqual([]);
  });

  it('REQ-SEC-023 — TÉMOINS : un lien ouvert sans condition, ou sous une autre condition, rougit', () => {
    const source = readFileSync(UTILISATEURS, 'utf8');
    const sansCondition = source.replace(/\{(\w+)\s*\?\s*\(?\s*<p>/, '{true ? (<p>');
    expect(fautesDuLien(sansCondition)).not.toEqual([]);
    expect(
      fautesDuLien(source.replace(/await droitsDuLecteurSurLesGels\(d\.prisma, moi\)/, 'true'))
    ).not.toEqual([]);
  });

  it('REQ-SEC-023 — la route est dite livrée, dans la carte ET dans la navigation', () => {
    expect(ROUTES_LIVREES_DE_LA_CONSOLE).toContain('/console/journal-des-acces/gels');
    expect(
      readFileSync('docs/CONSOLE-ROUTES.md', 'utf8')
        .split('\n')
        .some((l) =>
          /^\| `\/console\/journal-des-acces\/gels` \|.*\| admin \| 1 \| livrée \|/.test(l)
        )
    ).toBe(true);
  });
});
