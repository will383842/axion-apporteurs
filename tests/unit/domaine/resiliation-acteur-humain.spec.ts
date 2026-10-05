// @req REQ-JUR-042
// @req REQ-DM-011
// @req REQ-SEC-032
// @req REQ-SEC-003
// @req REQ-SEC-005
// @req REQ-JUR-006
// @req REQ-JUR-015
/**
 * SEC-19 — la résiliation et ce qu'elle ne peut JAMAIS être : une sanction de l'inactivité.
 *
 * REQ-JUR-042 (verrou produit, arrêté par Will le 2026-09-03) : aucun motif de résiliation ne nomme
 * l'inactivité, la dormance, l'activité ni l'absence de dépôt — ni en liste, ni en texte libre. Le
 * cliquet de l'enum lui-même (égal à REQ-DM-011 et au schéma) vit dans
 * `apporteur-matrice-et-statuts.spec.ts` ; ce fichier tient le verrou lexical, avec son contre-témoin.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { MOTIFS_RESILIATION } from '../../../src/domain/apporteur/statut';

// La garde d'acceptation de la politique est hors du sujet ici : elle passe, pour que seul le niveau juge.
vi.mock('../../../src/server/auth/garde-espace', async (original) => ({
  ...(await original<typeof import('../../../src/server/auth/garde-espace')>()),
  exigerAcceptation: async () => ({ ok: true }),
}));

/** Les formes d'un motif d'inactivité, en minuscules et sans accents. */
const INACTIVITE = /inactiv|dormant|dormance|activite|absence|sans_depot|aucun_depot|silence/;

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const motifsDInactivite = (motifs: readonly string[]) =>
  motifs.filter((m) => INACTIVITE.test(sansAccents(m)));

describe('REQ-JUR-042 — aucun motif de résiliation ne nomme l’inactivité', () => {
  it('REQ-JUR-042 : TÉMOIN — les motifs de résiliation sont exactement les quatre de REQ-DM-011, aucun d’inactivité', () => {
    expect([...MOTIFS_RESILIATION]).toEqual([
      'ordinaire_apporteur',
      'ordinaire_axion',
      'manquement_grave',
      'fin_de_plein_droit',
    ]);
    expect(motifsDInactivite(MOTIFS_RESILIATION)).toEqual([]);
  });

  it('REQ-JUR-042 : contre-témoin — un motif d’inactivité, quelle que soit sa forme, est NOMMÉ', () => {
    expect(
      motifsDInactivite([
        'manquement_grave',
        'inactivite_prolongee',
        'apporteur_dormant',
        'absence_de_depot',
        'Inactivité',
      ])
    ).toEqual(['inactivite_prolongee', 'apporteur_dormant', 'absence_de_depot', 'Inactivité']);
  });
});

/**
 * Le CŒUR de la transaction de résiliation, en processus (client simulé) : le verrou de la ligne,
 * la matrice, le statut et son motif, l'incrément de `sessionVersion`, l'événement par l'écrivain
 * unique, la révocation des jetons — et un acteur HUMAIN seulement (garde GATE-JUR-ACTEUR-HUMAIN).
 */
const journalSimule = vi.hoisted(() => ({
  ajouterEvenement: vi.fn(),
  lireLaChargeDUnFait: vi.fn(),
  passageQuiCiteLaDecision: vi.fn(),
}));
vi.mock('../../../src/server/evenement/journal', () => journalSimule);
// La transition d'une attribution a ses propres témoins (DM-08) : ici, seul l'APPEL est jugé.
const transitionnerSimule = vi.hoisted(() => ({ transitionnerUneAttribution: vi.fn() }));
vi.mock('../../../src/server/attribution/transitionner', () => transitionnerSimule);

const ID = '0190f0a0-0000-7000-8000-0000000000a1';
/** Une clé d'idempotence, tirée par le serveur au rendu du formulaire. */
const CLE = '0190f0a0-0000-4000-8000-00000000c1e0';
const MAINTENANT = new Date('2027-03-01T09:00:00.000Z');
const CONSOLE = { par: 'utilisateur_console', id: '0190f0a0-0000-7000-8000-0000000000c1' } as const;

function txSimule(
  statutInitial: string,
  monde: {
    attributions?: { id: string; statut: string }[];
    misesEnDemeure?: { evenementId: bigint; courriels: { envoyeAt: Date }[] }[];
    decisionDeMemeCle?: Record<string, unknown> | null;
  } = {}
) {
  let statut = statutInitial;
  const lectures: unknown[] = [];
  const ecrits: Record<string, unknown>[] = [];
  const ordre: string[] = [];
  const mises: unknown[] = [];
  const revocations: unknown[] = [];
  const tx = {
    $queryRaw: async () => {
      ordre.push('verrou');
      return [{ statut }];
    },
    apporteur: {
      update: async (q: { data: { statut?: string } }) => {
        ordre.push('apporteur.update');
        mises.push(q);
        if (q.data.statut) statut = q.data.statut;
        return {};
      },
    },
    jetonDepot: {
      updateMany: async (q: unknown) => {
        ordre.push('jetons');
        revocations.push(q);
        return { count: 1 };
      },
    },
    attribution: {
      findMany: async (q: unknown) => {
        ordre.push('attributions');
        lectures.push(q);
        return monde.attributions ?? [];
      },
    },
    notificationEspace: {
      findMany: async (q: unknown) => {
        ordre.push('mises_en_demeure');
        lectures.push(q);
        return monde.misesEnDemeure ?? [];
      },
      create: async (q: unknown) => {
        ordre.push('notification');
        ecrits.push({ notification: q });
        return { id: 'n-1' };
      },
    },
    decisionDeContrat: {
      findUnique: async (q: unknown) => {
        ordre.push('meme_cle');
        lectures.push(q);
        return monde.decisionDeMemeCle ?? null;
      },
      create: async (q: unknown) => {
        ordre.push('decision');
        ecrits.push({ decision: q });
        return {};
      },
    },
  };
  return { tx: tx as never, ordre, mises, revocations, lectures, ecrits };
}

async function refusDe(p: Promise<unknown>): Promise<{ code: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code: string };
  }
  throw new Error('aucun refus');
}

describe('REQ-SEC-032 — la transaction de résiliation : statut, sessions, journal, jetons', () => {
  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '1', selfHash: 'x' });
    journalSimule.lireLaChargeDUnFait.mockReset();
    transitionnerSimule.transitionnerUneAttribution.mockReset();
    transitionnerSimule.transitionnerUneAttribution.mockResolvedValue({});
  });

  it('REQ-SEC-032 : TÉMOIN — signe → resilie, motif posé, sessionVersion incrémentée, événement écrit, jetons révoqués, dans cet ordre', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const t = txSimule('signe');
    const r = await resilierUnApporteur(
      t.tx,
      {
        apporteurId: ID,
        motif: 'ordinaire_apporteur',
        dateReception: MAINTENANT,
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      },
      await clesDeTest()
    );
    expect(r).toMatchObject({ de: 'signe', vers: 'resilie' });
    expect(t.mises).toStrictEqual([
      {
        where: { id: ID },
        data: {
          statut: 'resilie',
          resiliationMotif: 'ordinaire_apporteur',
          sessionVersion: { increment: 1 },
        },
      },
    ]);
    expect(journalSimule.ajouterEvenement.mock.calls[0]![1]).toMatchObject({
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: ID,
      survenuAt: MAINTENANT,
      charge: {
        de: 'signe',
        vers: 'resilie',
        transition: 'resilier',
        resiliationMotif: 'ordinaire_apporteur',
        acteur: CONSOLE,
      },
    });
    expect(t.revocations).toStrictEqual([
      { where: { apporteurId: ID, revoqueAt: null }, data: { revoqueAt: MAINTENANT } },
    ]);
    expect(t.ordre[0]).toBe('verrou');
    expect(t.ordre.indexOf('apporteur.update')).toBeLessThan(t.ordre.indexOf('jetons'));
  });

  it('REQ-SEC-032 : une suspension se résilie aussi ; un statut sans flèche est refusé, et rien n’est écrit', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const depuisSuspendu = txSimule('suspendu');
    await resilierUnApporteur(
      depuisSuspendu.tx,
      {
        apporteurId: ID,
        motif: 'manquement_grave',
        manquement: { article: '6', inexecutionIrremediable: true },
        motifDeLaDecision: 'Dépôts fictifs répétés',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      },
      await clesDeTest()
    );
    expect(depuisSuspendu.mises).toHaveLength(1);
    const deja = txSimule('resilie');
    const e = await refusDe(
      resilierUnApporteur(
        deja.tx,
        {
          apporteurId: ID,
          motif: 'ordinaire_apporteur',
          dateReception: MAINTENANT,
          acteur: CONSOLE,
          maintenant: MAINTENANT,
        },
        await clesDeTest()
      )
    );
    expect(e.code).toBe('transition_refusee');
    expect(deja.mises).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).toHaveBeenCalledTimes(1);
  });

  it('REQ-JUR-042 : TÉMOIN (acteur humain) — une résiliation par le SYSTÈME est refusée, nommée, et rien n’est écrit', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const t = txSimule('signe');
    const SYSTEME = { par: 'systeme' };
    const e = await refusDe(
      resilierUnApporteur(
        t.tx,
        {
          apporteurId: ID,
          motif: 'ordinaire_apporteur',
          dateReception: MAINTENANT,
          acteur: SYSTEME as never,
          maintenant: MAINTENANT,
        },
        await clesDeTest()
      )
    );
    expect(e.code).toBe('acteur_non_humain');
    expect(t.ordre).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-DM-011 : TÉMOIN — la résiliation transitionne TOUTES les attributions à traiter : figee avec commande, fin_de_contrat sans', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const attributions = [
      { id: 'a-attente', statut: 'en_attente' },
      { id: 'a-provisoire', statut: 'provisoire' },
      { id: 'a-active', statut: 'active' },
      { id: 'a-rdv', statut: 'rdv_pris' },
      { id: 'a-proposition', statut: 'proposition' },
      { id: 'a-signee', statut: 'signee' },
      { id: 'a-convertie', statut: 'convertie' },
    ];
    const t = txSimule('signe', { attributions });
    await resilierUnApporteur(
      t.tx,
      {
        apporteurId: ID,
        motif: 'ordinaire_apporteur',
        dateReception: MAINTENANT,
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      },
      await clesDeTest()
    );
    expect(t.lectures[0]).toStrictEqual({
      where: {
        apporteurId: ID,
        statut: {
          in: [
            'en_attente',
            'provisoire',
            'active',
            'rdv_pris',
            'proposition',
            'signee',
            'convertie',
          ],
        },
      },
      select: { id: true, statut: true },
      orderBy: { id: 'asc' },
    });
    const appels = transitionnerSimule.transitionnerUneAttribution.mock.calls.map((c) => c[1]);
    expect(appels).toStrictEqual(
      attributions.map((a) => ({
        attributionId: a.id,
        transition: a.statut === 'signee' || a.statut === 'convertie' ? 'figee' : 'fin_de_contrat',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      }))
    );
    // Les attributions après le statut et son événement, avant les jetons.
    expect(t.ordre.indexOf('apporteur.update')).toBeLessThan(t.ordre.indexOf('attributions'));
    expect(t.ordre.indexOf('attributions')).toBeLessThan(t.ordre.indexOf('jetons'));
  });

  it('REQ-JUR-006 : TÉMOIN — manquement_grave sans mise en demeure ÉCHUE du même article est refusée (mise_en_demeure_requise), et rien n’est écrit', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    // Une mise en demeure de l'article 6, envoyée il y a 5 jours ; une autre, de l'article 7, échue.
    journalSimule.lireLaChargeDUnFait.mockImplementation(async (_tx: unknown, id: string) => ({
      type: 'apporteur_mis_en_demeure',
      charge: { article: id === '11' ? '6' : '7', acteur: CONSOLE },
    }));
    const t = txSimule('signe', {
      misesEnDemeure: [
        {
          evenementId: 11n,
          courriels: [{ envoyeAt: new Date(MAINTENANT.getTime() - 5 * 86_400_000) }],
        },
        {
          evenementId: 12n,
          courriels: [{ envoyeAt: new Date(MAINTENANT.getTime() - 40 * 86_400_000) }],
        },
      ],
    });
    const e = await refusDe(
      resilierUnApporteur(
        t.tx,
        {
          apporteurId: ID,
          motif: 'manquement_grave',
          manquement: { article: '6', inexecutionIrremediable: false },
          motifDeLaDecision: 'Dépôts fictifs répétés',
          acteur: CONSOLE,
          maintenant: MAINTENANT,
        },
        await clesDeTest()
      )
    );
    expect(e.code).toBe('mise_en_demeure_requise');
    expect(t.mises).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
    expect(t.lectures[0]).toStrictEqual({
      where: { apporteurId: ID, cle: 'mise_en_demeure', evenementId: { not: null } },
      select: {
        evenementId: true,
        courriels: { where: { statut: 'envoye' }, select: { envoyeAt: true } },
      },
    });
  });

  it('REQ-JUR-006 : manquement_grave est admise avec une mise en demeure du même article, envoyée et échue', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    journalSimule.lireLaChargeDUnFait.mockResolvedValue({
      type: 'apporteur_mis_en_demeure',
      charge: { article: '6', acteur: CONSOLE },
    });
    const t = txSimule('signe', {
      misesEnDemeure: [
        {
          evenementId: 11n,
          courriels: [{ envoyeAt: new Date(MAINTENANT.getTime() - 40 * 86_400_000) }],
        },
      ],
    });
    const r = await resilierUnApporteur(
      t.tx,
      {
        apporteurId: ID,
        motif: 'manquement_grave',
        manquement: { article: '6', inexecutionIrremediable: false },
        motifDeLaDecision: 'Dépôts fictifs répétés',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      },
      await clesDeTest()
    );
    expect(r.vers).toBe('resilie');
  });

  it('REQ-JUR-006 : le manquement accompagne manquement_grave, et lui seul (manquement_incoherent)', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const sans = await refusDe(
      resilierUnApporteur(
        txSimule('signe').tx,
        {
          apporteurId: ID,
          motif: 'manquement_grave',
          acteur: CONSOLE,
          maintenant: MAINTENANT,
        },
        await clesDeTest()
      )
    );
    expect(sans.code).toBe('manquement_incoherent');
    const enTrop = await refusDe(
      resilierUnApporteur(
        txSimule('signe').tx,
        {
          apporteurId: ID,
          motif: 'ordinaire_apporteur',
          dateReception: MAINTENANT,
          manquement: { article: '6', inexecutionIrremediable: true },
          acteur: CONSOLE,
          maintenant: MAINTENANT,
        },
        await clesDeTest()
      )
    );
    expect(enTrop.code).toBe('manquement_incoherent');
  });
});

/**
 * La LECTURE SEULE d'un apporteur résilié (REQ-SEC-032, art. 12.3), dans le cadre de la sécurité et
 * d'A02 (#703) : une liste blanche EXPLICITE de segments, défaut fermé ; ouverte tant qu'au moins une
 * attribution `figee_resiliation` n'est pas éteinte (`droitsEnCours`), fermée ensuite.
 */
describe('REQ-SEC-032 — le niveau « lecture » d’un résilié', () => {
  it('REQ-SEC-032 : TÉMOIN — un résilié dont les droits courent est en LECTURE ; sans droits, l’espace est FERMÉ', async () => {
    const { niveauDAcces, peutOuvrirLEspace } =
      await import('../../../src/domain/apporteur/acces-espace');
    expect(niveauDAcces('resilie', true)).toBe('lecture');
    expect(peutOuvrirLEspace('resilie', true)).toBe(true);
    expect(niveauDAcces('resilie', false)).toBe('ferme');
    expect(niveauDAcces('resilie')).toBe('ferme');
    // les droits en cours ne changent rien aux autres statuts
    expect(niveauDAcces('signe', true)).toBe('plein');
    expect(niveauDAcces('refuse', true)).toBe('ferme');
  });

  it('REQ-SEC-032 : TÉMOIN — la liste blanche de lecture est EXACTEMENT celle de la sécurité', async () => {
    const { SEGMENTS_LECTURE } = await import('../../../src/domain/apporteur/acces-espace');
    expect([...SEGMENTS_LECTURE]).toEqual([
      'accueil',
      'mes-commissions',
      'mes-entreprises',
      'notifications',
      'documents',
      'mon-contrat',
    ]);
  });

  it('REQ-SEC-032 : TÉMOIN — en lecture, seuls les segments de la liste s’ouvrent, plus l’acceptation ; tout le reste est refusé, défaut fermé', async () => {
    const m = await import('../../../src/domain/apporteur/acces-espace');
    for (const s of m.SEGMENTS_LECTURE) expect(m.routeOuverte('lecture', s), s).toBe(true);
    expect(m.routeOuverte('lecture', m.SEGMENT_DE_L_ACCEPTATION)).toBe(true);
    const lus: readonly string[] = m.SEGMENTS_LECTURE;
    for (const s of [...m.SEGMENTS_PLEINS, ...m.SEGMENTS_LIMITES].filter((x) => !lus.includes(x))) {
      expect(m.routeOuverte('lecture', s), s).toBe(false);
    }
    for (const s of [
      'deposer',
      'entreprise',
      'filleuls',
      'profil',
      'conformite',
      'segment-futur',
    ]) {
      expect(m.routeOuverte('lecture', s), s).toBe(false);
    }
  });

  it('REQ-SEC-032 : la liste de lecture est un SOUS-ENSEMBLE des segments protégés existants', async () => {
    const m = await import('../../../src/domain/apporteur/acces-espace');
    const proteges: readonly string[] = [...m.SEGMENTS_PLEINS, ...m.SEGMENTS_LIMITES];
    for (const s of m.SEGMENTS_LECTURE) expect(proteges, s).toContain(s);
  });
});

/**
 * La SESSION porte le refus d'écriture (critère 2 de la sécurité, #703) : le niveau `lecture` est
 * refusé — motif `lecture_seule` — par `actionEspace()` et par `exigerSessionRelevee()`, sauf
 * l'acceptation de la politique, geste nommé. Le niveau se relit en base à chaque requête.
 */
describe('REQ-SEC-032 — la session d’un résilié ne peut plus écrire', () => {
  const MAINTENANT = new Date('2026-10-04T10:00:00Z');

  function ports(statut: string, droitsEnCours: boolean, lienConsommeAt: Date | null = MAINTENANT) {
    return {
      maintenant: () => MAINTENANT,
      configuration: { secret: 'secret-de-test-factice-de-trente-deux-caracteres', kid: 'k1' },
      depot: {
        lire: async () => ({
          id: 'session-1',
          apporteurId: 'apporteur-1',
          kid: 'k1',
          expireAt: new Date('2026-10-05T10:00:00Z'),
          revoqueAt: null,
          sessionVersion: 2,
          apporteur: { statut, sessionVersion: 2, droitsEnCours },
          lienMagique: { consommeAt: lienConsommeAt },
        }),
        marquerVue: async () => {},
        lister: async () => [],
        revoquer: async () => 0,
        incrementerVersion: async () => {},
      },
    };
  }

  it('REQ-SEC-032 : TÉMOIN — le motif lecture_seule est dans la liste FERMÉE des refus', async () => {
    const { MOTIFS_DE_REFUS } = await import('../../../src/server/auth/session');
    expect(MOTIFS_DE_REFUS).toContain('lecture_seule');
  });

  it('REQ-SEC-032 : TÉMOIN — le juge rend la LECTURE à un résilié dont les droits courent, et FERME sans eux', async () => {
    const { exigerSession } = await import('../../../src/server/auth/session');
    const lu = await exigerSession('jeton', ports('resilie', true));
    expect(lu.ok && lu.session.niveau).toBe('lecture');
    expect(await exigerSession('jeton', ports('resilie', false))).toEqual({
      ok: false,
      motif: 'statut_ferme',
    });
  });

  it('REQ-SEC-032 : TÉMOIN — actionEspace REFUSE la lecture (lecture_seule) sans exécuter le corps', async () => {
    const { actionEspace } = await import('../../../src/server/auth/session');
    const corps = vi.fn(async () => 'ecrit');
    for (const segment of ['mes-commissions', 'mon-contrat', 'notifications'] as const) {
      expect(await actionEspace(segment, 'jeton', ports('resilie', true), corps)).toEqual({
        ok: false,
        motif: 'lecture_seule',
      });
    }
    expect(corps).not.toHaveBeenCalled();
  });

  it('REQ-SEC-032 : actionEspace laisse passer l’ACCEPTATION de la politique, geste nommé de la lecture', async () => {
    const { actionEspace } = await import('../../../src/server/auth/session');
    const { SEGMENT_DE_L_ACCEPTATION } = await import('../../../src/domain/apporteur/acces-espace');
    expect(
      await actionEspace(
        SEGMENT_DE_L_ACCEPTATION,
        'jeton',
        ports('resilie', true),
        async () => 'acceptee'
      )
    ).toEqual({ ok: true, valeur: 'acceptee' });
  });

  it('REQ-SEC-032 : contre-témoin — un apporteur signé écrit toujours par actionEspace', async () => {
    const { actionEspace } = await import('../../../src/server/auth/session');
    expect(
      await actionEspace('mes-commissions', 'jeton', ports('signe', false), async () => 'ecrit')
    ).toEqual({ ok: true, valeur: 'ecrit' });
  });

  it('REQ-SEC-032 : TÉMOIN — exigerSessionRelevee REFUSE la lecture, même relevée de frais', async () => {
    const { exigerSessionRelevee } = await import('../../../src/server/auth/session');
    expect(await exigerSessionRelevee('jeton', ports('resilie', true))).toEqual({
      ok: false,
      motif: 'lecture_seule',
    });
    const signe = await exigerSessionRelevee('jeton', ports('signe', false));
    expect(signe.ok).toBe(true);
  });

  it('REQ-SEC-032 : TÉMOIN — une session ouverte AVANT la résiliation ne peut plus écrire APRÈS : le niveau se relit à chaque requête', async () => {
    const { actionEspace } = await import('../../../src/server/auth/session');
    let statut = 'signe';
    let droits = false;
    const p = ports('signe', false);
    const lire = p.depot.lire;
    p.depot.lire = async () => {
      const l = await lire();
      return { ...l, apporteur: { statut, sessionVersion: 2, droitsEnCours: droits } };
    };
    expect((await actionEspace('mes-commissions', 'jeton', p, async () => 1)).ok).toBe(true);
    statut = 'resilie';
    droits = true;
    expect(await actionEspace('mes-commissions', 'jeton', p, async () => 2)).toEqual({
      ok: false,
      motif: 'lecture_seule',
    });
  });
});

/**
 * La sécurité (#703, 5981521068) : la résiliation RÉVOQUE toutes les sessions — la base incrémente la
 * version de session au passage à `resilie` (migration `sessions_revocables`). Une session ouverte
 * AVANT est refusée à la requête suivante, quels que soient les droits en cours.
 */
describe('REQ-SEC-032 — la résiliation révoque les sessions ouvertes', () => {
  it('REQ-SEC-032 : TÉMOIN — une session ouverte avant la résiliation est refusée à la requête suivante (version_perimee), même avec des droits en cours', async () => {
    const { jugerSession } = await import('../../../src/server/auth/session');
    const maintenant = new Date('2026-10-04T10:00:00Z');
    const ouverteAvant = {
      id: 'session-1',
      apporteurId: 'apporteur-1',
      kid: 'k1',
      expireAt: new Date('2026-10-05T10:00:00Z'),
      revoqueAt: null,
      sessionVersion: 2,
      lienMagique: { consommeAt: maintenant },
    };
    expect(
      jugerSession(
        { ...ouverteAvant, apporteur: { statut: 'signe', sessionVersion: 2 } },
        maintenant,
        'k1'
      ).ok
    ).toBe(true);
    // après le geste : la base a porté la version de l'apporteur à 3
    expect(
      jugerSession(
        {
          ...ouverteAvant,
          apporteur: { statut: 'resilie', sessionVersion: 3, droitsEnCours: true },
        },
        maintenant,
        'k1'
      )
    ).toEqual({ ok: false, motif: 'version_perimee' });
  });

  it('REQ-SEC-032 : TÉMOIN — le geste porte la version de session d’un cran, en plus du déclencheur', async () => {
    const source = (await import('node:fs')).readFileSync(
      'src/server/apporteur/resiliation.ts',
      'utf8'
    );
    // Une forme qui survit à l'instrumentation de Stryker : la mutation enveloppe l'objet dans un ternaire
    // sans en retirer le texte (vu rougir au run initial de la mutation, PR 718).
    expect(source).toMatch(/sessionVersion:[\s\S]{0,200}?\{\s*increment: 1\s*\}/);
  });
});

/**
 * La résiliation pour manquement (art. 11.2, REQ-JUR-006 ; A02, #703, 5980982895 §2) : refusée
 * (`mise_en_demeure_requise`) sans une mise en demeure du MÊME article, dont le courriel est ENVOYÉ et
 * le délai ÉCHU. Borne exclusive en jours civils de Paris, comme la fenêtre de DM-55 ; refusée avant
 * l'échéance et pile à l'échéance, admise à l'échéance plus 1 ms. Seule exception : l'inexécution
 * irrémédiable, cochée et motivée.
 */
describe('REQ-JUR-006 — la mise en demeure préalable de l’art. 11.2', () => {
  // Envoyée le 1er octobre 2026 à 10 h, heure de Paris (8 h UTC, heure d'été).
  const ENVOI = Date.parse('2026-10-01T08:00:00.000Z');

  it('REQ-JUR-006 : TÉMOIN — l’échéance est minuit, heure de Paris, du jour qui suit l’envoi + MISE_EN_DEMEURE_JOURS', async () => {
    const { echeanceDeLaMiseEnDemeure } = await import('../../../src/domain/apporteur/resiliation');
    const { SEUILS } = await import('../../../src/domain/seuils/ssot');
    expect(SEUILS.MISE_EN_DEMEURE_JOURS.valeur).toBe(15);
    // 1er + 15 = 16 octobre ; minuit du 17 octobre à Paris = 16 octobre 22 h UTC (heure d'été).
    expect(new Date(echeanceDeLaMiseEnDemeure(ENVOI)).toISOString()).toBe(
      '2026-10-16T22:00:00.000Z'
    );
    // Le changement d'heure (25 octobre) ne déplace pas le jour : envoi le 20 → minuit du 5 novembre.
    expect(
      new Date(echeanceDeLaMiseEnDemeure(Date.parse('2026-10-20T08:00:00.000Z'))).toISOString()
    ).toBe('2026-11-04T23:00:00.000Z');
  });

  it('REQ-JUR-006 : TÉMOIN — refusée sans mise en demeure, avant l’échéance et pile à l’échéance ; admise à l’échéance plus 1 ms', async () => {
    const { echeanceDeLaMiseEnDemeure, jugerLaResiliationPourManquement } =
      await import('../../../src/domain/apporteur/resiliation');
    const echeance = echeanceDeLaMiseEnDemeure(ENVOI);
    const juger = (maintenant: number, envois: (number | null)[]) =>
      jugerLaResiliationPourManquement({
        envoisDeLArticle: envois,
        maintenant,
        inexecutionIrremediable: false,
      });
    expect(juger(echeance + 1, [])).toEqual({ ok: false, motif: 'mise_en_demeure_requise' });
    expect(juger(echeance - 1, [ENVOI])).toEqual({ ok: false, motif: 'mise_en_demeure_requise' });
    expect(juger(echeance, [ENVOI])).toEqual({ ok: false, motif: 'mise_en_demeure_requise' });
    expect(juger(echeance + 1, [ENVOI])).toEqual({ ok: true });
    // Un courriel non envoyé (envoye_at nul) ne fait courir aucun délai.
    expect(juger(echeance + 1, [null])).toEqual({ ok: false, motif: 'mise_en_demeure_requise' });
    // Une seule mise en demeure échue suffit, quelle que soit sa place.
    expect(juger(echeance + 1, [null, ENVOI + 5 * 86_400_000, ENVOI])).toEqual({ ok: true });
  });

  it('REQ-JUR-006 : l’inexécution irrémédiable, cochée, dispense de la mise en demeure', async () => {
    const { jugerLaResiliationPourManquement } =
      await import('../../../src/domain/apporteur/resiliation');
    expect(
      jugerLaResiliationPourManquement({
        envoisDeLArticle: [],
        maintenant: ENVOI,
        inexecutionIrremediable: true,
      })
    ).toEqual({ ok: true });
  });

  it('REQ-JUR-006 : TÉMOIN STATIQUE — rien ne COMPTE les mises en demeure (art. 11.2, dernière phrase)', () => {
    for (const f of [
      'src/domain/apporteur/resiliation.ts',
      'src/server/apporteur/resiliation.ts',
    ]) {
      const source = readFileSync(f, 'utf8');
      expect(source, f).not.toMatch(/envoisDeLArticle\.length|_count|\.count\(|COUNT\(/);
    }
  });
});

/**
 * Les deux notifications du contrat (juriste, #703, 5980966503 ; A02, 5980982895 §1) : leur rendu.
 * La mise en demeure pose son délai en toutes lettres depuis la SSOT ; la résiliation compose le
 * paragraphe de son MOTIF, puis le paragraphe commun.
 */
describe('REQ-JUR-006 — le rendu de la mise en demeure et de la résiliation', () => {
  it('REQ-JUR-006 : TÉMOIN — la mise en demeure rend « quinze jours » depuis la SSOT ; l’émetteur ne fournit que l’article et les faits', async () => {
    const { rendreLaNotification, parametresDe } =
      await import('../../../src/server/notifications/envoyer');
    expect(parametresDe('mise_en_demeure')).toEqual(['article', 'faits']);
    const t = rendreLaNotification('mise_en_demeure', { article: '6', faits: 'Le dépôt de mars' });
    expect(t.corps).toContain('dans un délai de quinze jours à compter');
    expect(t.corps).toContain("à l'article 6 du contrat : Le dépôt de mars.");
  });

  it('REQ-JUR-006 : TÉMOIN — les faits de la mise en demeure ont la borne de DM-55, au point de code près', async () => {
    const { rendreLaNotification } = await import('../../../src/server/notifications/envoyer');
    const { FAITS_ANOMALIE_CARACTERES_MAX } = await import('../../../src/domain/seuils/ssot');
    const max = FAITS_ANOMALIE_CARACTERES_MAX.valeur;
    expect(() =>
      rendreLaNotification('mise_en_demeure', { article: '6', faits: 'é'.repeat(max) })
    ).not.toThrow();
    expect(() =>
      rendreLaNotification('mise_en_demeure', { article: '6', faits: 'é'.repeat(max + 1) })
    ).toThrow('parametre_invalide');
  });

  it('REQ-DM-011 : TÉMOIN — la résiliation compose le paragraphe de son MOTIF, puis le paragraphe commun ; chaque motif nomme ses paramètres', async () => {
    const { rendreLaNotification, parametresDe } =
      await import('../../../src/server/notifications/envoyer');
    const { PARAGRAPHE_COMMUN_DE_LA_RESILIATION } =
      await import('../../../src/content/micro-copy/courriels/notifications');
    expect(parametresDe('resiliation', 'ordinaire_apporteur')).toEqual([
      'dateEffet',
      'dateReception',
    ]);
    expect(parametresDe('resiliation', 'ordinaire_axion')).toEqual(['dateEffet']);
    expect(parametresDe('resiliation', 'manquement_grave')).toEqual(['dateEffet', 'motif']);
    expect(parametresDe('resiliation', 'fin_de_plein_droit')).toEqual(['dateEffet']);
    const t = rendreLaNotification(
      'resiliation',
      { dateEffet: '1er novembre 2026' },
      'ordinaire_axion'
    );
    expect(t.titre).toBe("Fin de votre contrat d'apporteur");
    expect(t.corps).toBe(
      "Axion-IA résilie votre contrat d'apporteur, comme le permet l'article 11.1. Le préavis court à compter de l'envoi de ce message : le contrat prend fin le 1er novembre 2026. " +
        PARAGRAPHE_COMMUN_DE_LA_RESILIATION
    );
    expect(t.corps).toContain(
      "Vous gardez l'accès en lecture à votre espace jusqu'à l'extinction de vos droits : reconnectez-vous avec votre adresse e-mail pour y accéder."
    );
  });

  it('REQ-DM-011 : la résiliation sans motif, ou avec une cause d’une autre clé, est refusée ; aucune autre clé ne reçoit de motif', async () => {
    const { rendreLaNotification } = await import('../../../src/server/notifications/envoyer');
    expect(() => rendreLaNotification('resiliation', { dateEffet: 'x' })).toThrow(
      'cause_manquante'
    );
    expect(() =>
      rendreLaNotification('resiliation', { dateEffet: 'x' }, 'demande_verifiee' as never)
    ).toThrow('cause_manquante');
    expect(() =>
      rendreLaNotification(
        'mise_en_demeure',
        { article: '6', faits: 'x' },
        'ordinaire_axion' as never
      )
    ).toThrow('cause_en_trop');
  });
});

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
async function clesDeTest() {
  const { clesPii } = await import('../../../src/server/securite/pii');
  const { NOMS_DES_SECRETS } = await import('../../../src/lib/env');
  return clesPii({
    NODE_ENV: 'test',
    ...Object.fromEntries(
      NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-19-${n.toLowerCase()}-`.padEnd(48, '0')])
    ),
    PII_ENCRYPTION_KEY: 'e'.repeat(64),
  });
}

/**
 * Les ÉMETTEURS des deux notifications du contrat (A02, #703, 5980982895 et 5982083436) : chaque
 * geste écrit son fait au journal, sa décision (le texte CHIFFRÉ, jamais au journal) et sa
 * notification, qui porte l'événement ET la décision — le passage enverra le courriel.
 */
describe('REQ-JUR-006 — les émetteurs : la mise en demeure et la décision de résiliation', () => {
  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '41', selfHash: 'x' });
    transitionnerSimule.transitionnerUneAttribution.mockReset();
    transitionnerSimule.transitionnerUneAttribution.mockResolvedValue({});
  });

  it('REQ-JUR-006 : TÉMOIN — la mise en demeure écrit son fait {article, acteur}, sa décision chiffrée et sa notification liée aux deux', async () => {
    const { mettreEnDemeure } = await import('../../../src/server/apporteur/resiliation');
    const { decryptPii } = await import('../../../src/server/securite/pii');
    const cles = await clesDeTest();
    const t = txSimule('signe');
    const r = await mettreEnDemeure(
      t.tx,
      {
        apporteurId: ID,
        article: '6',
        faits: 'Trois dépôts sans échange réel',
        cleIdempotence: CLE,
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      },
      cles
    );
    expect(journalSimule.ajouterEvenement.mock.calls[0]![1]).toStrictEqual({
      type: 'apporteur_mis_en_demeure',
      agregat: 'apporteur',
      agregatId: ID,
      survenuAt: MAINTENANT,
      charge: { article: '6', acteur: CONSOLE },
    });
    const decision = (t.ecrits[0] as { decision: { data: Record<string, unknown> } }).decision.data;
    expect(decision).toMatchObject({
      id: r.decisionId,
      apporteurId: ID,
      geste: 'mise_en_demeure',
      article: '6',
      evenementId: 41n,
    });
    expect(decision).not.toHaveProperty('dateEffet');
    expect(
      decryptPii(
        { modele: 'DecisionDeContrat', champ: 'texteChiffre', id: r.decisionId },
        decision.texteChiffre as Uint8Array,
        cles
      )
    ).toBe('Trois dépôts sans échange réel');
    expect((t.ecrits[1] as { notification: unknown }).notification).toStrictEqual({
      data: {
        apporteurId: ID,
        cle: 'mise_en_demeure',
        evenementId: 41n,
        decisionContratId: r.decisionId,
      },
    });
    expect(t.ordre).toStrictEqual(['verrou', 'meme_cle', 'decision', 'notification']);
  });

  it('REQ-JUR-006 : la mise en demeure est refusée, nommée, sans rien écrire : acteur système, article hors liste, faits vides ou trop longs, apporteur sans contrat', async () => {
    const { mettreEnDemeure } = await import('../../../src/server/apporteur/resiliation');
    const { FAITS_ANOMALIE_CARACTERES_MAX } = await import('../../../src/domain/seuils/ssot');
    const cles = await clesDeTest();
    const base = {
      apporteurId: ID,
      article: '6' as const,
      faits: 'Des faits',
      cleIdempotence: CLE,
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    };
    const code = async (statut: string, d: Record<string, unknown>) => {
      const t = txSimule(statut);
      const demande: unknown = { ...base, ...d };
      const e = await refusDe(mettreEnDemeure(t.tx, demande as never, cles));
      expect(t.ecrits).toStrictEqual([]);
      return e.code;
    };
    expect(await code('signe', { acteur: { par: 'systeme' } })).toBe('acteur_non_humain');
    expect(await code('signe', { article: '11.2' })).toBe('article_hors_liste');
    expect(await code('signe', { faits: '   ' })).toBe('faits_vides');
    expect(await code('signe', { faits: 'Voir https://exemple.test/x' })).toBe('faits_avec_lien');
    expect(await code('signe', { faits: 'Une fraude avérée' })).toBe('faits_avec_mot_refuse');
    expect(
      await code('signe', { faits: 'x'.repeat(FAITS_ANOMALIE_CARACTERES_MAX.valeur + 1) })
    ).toBe('faits_trop_longs');
    expect(await code('resilie', {})).toBe('statut_sans_contrat');
    expect(await code('kyc_en_cours', {})).toBe('statut_sans_contrat');
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-DM-011 : TÉMOIN — la résiliation écrit sa décision (dates à Paris) et sa notification, liées à l’événement du statut', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const cles = await clesDeTest();
    const t = txSimule('signe');
    await resilierUnApporteur(
      t.tx,
      {
        apporteurId: ID,
        motif: 'ordinaire_apporteur',
        dateReception: new Date('2027-01-29T23:30:00.000Z'),
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      },
      cles
    );
    const decision = (
      t.ecrits.find((e) => 'decision' in e) as { decision: { data: Record<string, unknown> } }
    ).decision.data;
    // 29 janvier 23 h 30 UTC = 30 janvier à Paris ; le geste du 1er mars à 10 h, Paris.
    expect(decision).toMatchObject({
      apporteurId: ID,
      geste: 'resiliation',
      dateReception: new Date('2027-01-30T00:00:00.000Z'),
      dateEffet: new Date('2027-03-01T00:00:00.000Z'),
      evenementId: 41n,
    });
    expect(decision).not.toHaveProperty('texteChiffre');
    const notification = (
      t.ecrits.find((e) => 'notification' in e) as {
        notification: { data: Record<string, unknown> };
      }
    ).notification.data;
    expect(notification).toStrictEqual({
      apporteurId: ID,
      cle: 'resiliation',
      evenementId: 41n,
      decisionContratId: decision.id,
    });
  });

  it('REQ-JUR-006 : TÉMOIN (A02, 5982202417) — manquement_grave SANS texte est refusé ; les motifs ordinaires et la fin de plein droit passent sans texte, et refusent un texte', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const cles = await clesDeTest();
    const demande = (motif: string, motifDeLaDecision?: string) => ({
      apporteurId: ID,
      motif,
      ...(motif === 'manquement_grave'
        ? { manquement: { article: '6', inexecutionIrremediable: true } }
        : {}),
      ...(motifDeLaDecision === undefined ? {} : { motifDeLaDecision }),
      ...(motif === 'ordinaire_apporteur' ? { dateReception: MAINTENANT } : {}),
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    });
    const sans = txSimule('signe');
    expect(
      (await refusDe(resilierUnApporteur(sans.tx, demande('manquement_grave') as never, cles))).code
    ).toBe('motif_de_la_decision_incoherent');
    expect(sans.mises).toStrictEqual([]);
    const avec = txSimule('signe');
    await resilierUnApporteur(
      avec.tx,
      demande('manquement_grave', 'Dépôts fictifs répétés') as never,
      cles
    );
    expect(avec.ecrits.find((e) => 'decision' in e)).toBeDefined();
    for (const motif of ['ordinaire_apporteur', 'fin_de_plein_droit']) {
      const t = txSimule('signe');
      await resilierUnApporteur(t.tx, demande(motif) as never, cles);
      const d = txSimule('signe');
      expect(
        (await refusDe(resilierUnApporteur(d.tx, demande(motif, 'Un texte') as never, cles))).code,
        motif
      ).toBe('motif_de_la_decision_incoherent');
    }
  });
});

/**
 * Le RENDU des deux notifications du contrat par le passage, à l'heure de l'envoi (A02, 5982083436) :
 * depuis la décision liée — le texte déchiffré, les dates — et, pour la résiliation, le motif lu dans
 * la charge de SON événement. Échec FERMÉ : un texte purgé, une décision d'un autre apporteur ou
 * absente ne rendent rien.
 */
describe('REQ-JUR-006 — le rendu par le passage, depuis la décision', () => {
  const composer = (cle: string, t: { titre: string; corps: string | null }) => ({
    sujet: `[${cle}] ${t.titre}`,
    corps: t.corps ?? '',
  });

  async function monde(decision: Record<string, unknown> | null) {
    const cles = await clesDeTest();
    const lus: unknown[] = [];
    const tx = {
      decisionDeContrat: {
        findUnique: async (q: unknown) => {
          lus.push(q);
          return decision;
        },
      },
    };
    return { tx: tx as never, cles, lus };
  }

  async function chiffre(id: string, texte: string) {
    const { colonnesPii } = await import('../../../src/server/securite/pii');
    return (
      colonnesPii({ modele: 'DecisionDeContrat', id }, { texte }, await clesDeTest())
        .texteChiffre ?? null
    );
  }

  const N = (cle: string, o: Record<string, unknown> = {}) => ({
    id: 'n-1',
    cle,
    apporteurId: ID,
    attributionId: null,
    evenementId: '41',
    anomalieId: null,
    decisionContratId: 'd-1',
    ...o,
  });

  it('REQ-JUR-006 : TÉMOIN — la mise en demeure se rend depuis SA décision : l’article et les faits déchiffrés, échappés', async () => {
    const { rendreUneDecisionDeContrat } =
      await import('../../../src/server/apporteur/resiliation');
    const m = await monde({
      apporteurId: ID,
      geste: 'mise_en_demeure',
      article: '7',
      texteChiffre: await chiffre('d-1', 'Dépôts <répétés>'),
      dateReception: null,
      dateEffet: null,
      evenementId: 41n,
      textePurgeAt: null,
    });
    const r = await rendreUneDecisionDeContrat(m.tx, N('mise_en_demeure'), {
      cles: m.cles,
      composer,
    });
    expect(r).toMatchObject({
      sujet: '[mise_en_demeure] Mise en demeure de remédier à un manquement au contrat',
    });
    expect((r as { corps: string }).corps).toContain(
      "à l'article 7 du contrat : Dépôts &lt;répétés&gt;."
    );
    expect(m.lus[0]).toStrictEqual({
      where: { id: 'd-1' },
      select: {
        apporteurId: true,
        geste: true,
        article: true,
        texteChiffre: true,
        dateReception: true,
        dateEffet: true,
        evenementId: true,
        textePurgeAt: true,
      },
    });
  });

  it('REQ-DM-011 : TÉMOIN — la résiliation se rend depuis SA décision et le motif de SON événement : dates en clair, à Paris', async () => {
    const { rendreUneDecisionDeContrat } =
      await import('../../../src/server/apporteur/resiliation');
    journalSimule.lireLaChargeDUnFait.mockResolvedValue({
      type: 'apporteur_statut_modifie',
      charge: {
        de: 'signe',
        vers: 'resilie',
        transition: 'resilier',
        resiliationMotif: 'ordinaire_apporteur',
        acteur: CONSOLE,
      },
    });
    const m = await monde({
      apporteurId: ID,
      geste: 'resiliation',
      article: null,
      texteChiffre: null,
      dateReception: new Date('2027-01-30T00:00:00.000Z'),
      dateEffet: new Date('2027-03-01T00:00:00.000Z'),
      evenementId: 41n,
      textePurgeAt: null,
    });
    const r = await rendreUneDecisionDeContrat(m.tx, N('resiliation'), { cles: m.cles, composer });
    expect((r as { corps: string }).corps).toMatch(
      /^Axion-IA a bien reçu, le 30 janvier 2027, votre décision de résilier le contrat\. Celui-ci prend fin le 1 mars 2027,/
    );
    expect(journalSimule.lireLaChargeDUnFait).toHaveBeenCalledWith(m.tx, '41');
  });

  it('REQ-JUR-006 : TÉMOIN — échec FERMÉ : texte purgé, décision absente ou déliée, d’un autre apporteur, d’un autre geste ou d’un autre fait', async () => {
    const { rendreUneDecisionDeContrat } =
      await import('../../../src/server/apporteur/resiliation');
    const juste = {
      apporteurId: ID,
      geste: 'mise_en_demeure',
      article: '6',
      texteChiffre: null as Uint8Array | null,
      dateReception: null,
      dateEffet: null,
      evenementId: 41n,
      textePurgeAt: null as Date | null,
    };
    juste.texteChiffre = await chiffre('d-1', 'Des faits');
    const rendre = async (d: Record<string, unknown> | null, n = N('mise_en_demeure')) => {
      const m = await monde(d);
      return rendreUneDecisionDeContrat(m.tx, n, { cles: m.cles, composer });
    };
    expect(await rendre({ ...juste, texteChiffre: null, textePurgeAt: MAINTENANT })).toEqual({
      nonRendue: 'faits_non_conserves',
    });
    expect(await rendre(null)).toEqual({ nonRendue: 'fait_introuvable' });
    expect(await rendre(juste, N('mise_en_demeure', { decisionContratId: null }))).toEqual({
      nonRendue: 'faits_non_conserves',
    });
    expect(await rendre({ ...juste, apporteurId: 'autre' })).toEqual({
      nonRendue: 'apporteur_different',
    });
    expect(await rendre({ ...juste, geste: 'resiliation' })).toEqual({
      nonRendue: 'charge_illisible',
    });
    expect(await rendre({ ...juste, evenementId: 99n })).toEqual({ nonRendue: 'fait_introuvable' });
  });
});

/**
 * La sécurité (#703, 5981521068, condition 1) : la reconnexion par lien reste OUVERTE au résilié dont
 * les droits courent — en demande de lien comme en consommation —, et la session neuve naît au niveau
 * LECTURE, jamais PLEIN. Les droits ne sont lus que pour un résilié ; un port absent vaut « aucun
 * droit » : défaut fermé.
 */
describe('REQ-SEC-032 — la reconnexion par lien d’un résilié', () => {
  it('REQ-SEC-032 : TÉMOIN — un résilié dont les droits courent peut recevoir et consommer un lien ; sans droits, non', async () => {
    const { ouvertureDuCompte } = await import('../../../src/server/auth/lien-magique');
    const lus: string[] = [];
    const droits = (v: boolean) => async (id: string) => {
      lus.push(id);
      return v;
    };
    expect(await ouvertureDuCompte('resilie', 'a-1', droits(true))).toBe(true);
    expect(await ouvertureDuCompte('resilie', 'a-1', droits(false))).toBe(false);
    // Port absent : aucun droit, défaut fermé.
    expect(await ouvertureDuCompte('resilie', 'a-1', undefined)).toBe(false);
    expect(lus).toStrictEqual(['a-1', 'a-1']);
  });

  it('REQ-SEC-032 : les droits ne sont lus QUE pour un résilié ; les autres statuts gardent leur jugement', async () => {
    const { ouvertureDuCompte } = await import('../../../src/server/auth/lien-magique');
    const lire = vi.fn(async () => true);
    expect(await ouvertureDuCompte('signe', 'a-1', lire)).toBe(true);
    expect(await ouvertureDuCompte('kyc_en_cours', 'a-1', lire)).toBe(true);
    expect(await ouvertureDuCompte('refuse', 'a-1', lire)).toBe(false);
    expect(await ouvertureDuCompte(null, 'a-1', lire)).toBe(false);
    expect(lire).not.toHaveBeenCalled();
  });

  it('REQ-SEC-032 : TÉMOIN — la session neuve d’un résilié naît au niveau LECTURE, jamais PLEIN', async () => {
    const { jugerSession } = await import('../../../src/server/auth/session');
    const v = jugerSession(
      {
        id: 's-1',
        apporteurId: 'a-1',
        kid: 'k1',
        expireAt: new Date('2027-03-02T00:00:00.000Z'),
        revoqueAt: null,
        sessionVersion: 3,
        apporteur: { statut: 'resilie', sessionVersion: 3, droitsEnCours: true },
        lienMagique: { consommeAt: MAINTENANT },
      },
      MAINTENANT,
      'k1'
    );
    expect(v.ok && v.session.niveau).toBe('lecture');
  });

  it('REQ-SEC-032 : TÉMOIN STATIQUE — la demande ET la consommation du lien passent par ouvertureDuCompte, jamais par peutOuvrirLEspace seul', () => {
    const source = readFileSync('src/server/auth/lien-magique.ts', 'utf8');
    // Les APPELANTS, pas les occurrences : l'instrumentation de la mutation recopie un appel dans les
    // branches de ses ternaires (vu au premier passage de la mutation, PR 718), jamais une fonction.
    const appelants = source
      .split(/\n(?=(?:export )?(?:async )?function )/)
      .filter((f) => /await ouvertureDuCompte\(/.test(f))
      .map((f) => /function (\w+)/.exec(f)?.[1]);
    expect(appelants).toEqual(['emettreLien', 'ouvrirLaSession']);
    const horsDuJuge = source.split('export async function ouvertureDuCompte')[0]!;
    expect(horsDuJuge).not.toMatch(/peutOuvrirLEspace\(/);
  });
});

/**
 * La juriste (#703, 5982404858), voie (2) retenue par la coordination : le préavis d'une résiliation
 * par la Société court de l'ENVOI de l'écrit. SEC-66 lève le refus d'`ordinaire_axion` par son geste
 * dédié (`notifierLaResiliationParLaSociete`, puis la tâche à la date d'effet). La résiliation À LA
 * MAIN, elle, refuse toujours ce motif : le passage à `resilie` se fait par la tâche, et non à la main.
 */
describe('REQ-JUR-006 — ordinaire_axion passe par la notification préalable, jamais à la main', () => {
  it('REQ-JUR-006 : TÉMOIN — la résiliation ordinaire_axion à la main est refusée (preavis_non_notifie), et rien n’est écrit ; son chemin est le geste de SEC-66', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '1', selfHash: 'x' });
    const t = txSimule('signe');
    const e = await refusDe(
      resilierUnApporteur(
        t.tx,
        { apporteurId: ID, motif: 'ordinaire_axion', acteur: CONSOLE, maintenant: MAINTENANT },
        await clesDeTest()
      )
    );
    expect(e.code).toBe('preavis_non_notifie');
    expect(t.ordre).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
  });
});

/**
 * La sécurité (#703, critère 2) : la garde des actions sensibles de l'appareil appelle `exigerSession`
 * directement ; elle REFUSE donc elle-même le niveau `lecture` (`lecture_seule`), AVANT de juger
 * l'appareil.
 */
describe('REQ-SEC-032 — la garde de l’appareil refuse la lecture', () => {
  it('REQ-SEC-032 : TÉMOIN — exigerAppareilConfirme rend lecture_seule pour un résilié en lecture, sans lire l’appareil', async () => {
    const { exigerAppareilConfirme } = await import('../../../src/server/auth/appareil');
    const lus: string[] = [];
    const session = {
      maintenant: () => MAINTENANT,
      configuration: { secret: 'secret-de-test-factice-de-trente-deux-caracteres', kid: 'k1' },
      depot: {
        lire: async () => ({
          id: 's-1',
          apporteurId: 'a-1',
          kid: 'k1',
          expireAt: new Date('2027-03-02T00:00:00.000Z'),
          revoqueAt: null,
          sessionVersion: 3,
          apporteur: { statut: 'resilie', sessionVersion: 3, droitsEnCours: true },
          lienMagique: { consommeAt: MAINTENANT },
        }),
        marquerVue: async () => {},
        lister: async () => [],
        revoquer: async () => 0,
        incrementerVersion: async () => {},
      },
    };
    const ports = new Proxy(
      { session },
      {
        get(cible, cle) {
          if (cle !== 'session' && cle !== 'then') lus.push(String(cle));
          return (cible as Record<string | symbol, unknown>)[cle];
        },
      }
    );
    expect(await exigerAppareilConfirme('jeton', 'appareil-1', ports as never)).toEqual({
      ok: false,
      motif: 'lecture_seule',
    });
    expect(lus).toStrictEqual([]);
  });
});

/**
 * La sécurité (#703, critère 2) : TÉMOIN STATIQUE — tout fichier `'use server'` de l'espace passe par
 * `actionEspace` ou par une garde qui juge le niveau (`exigerSessionRelevee`, `exigerAppareilConfirme`),
 * sinon il rougit. Seule exemption NOMMÉE : la connexion, qui OUVRE une session au lieu d'en porter
 * une (demande et consommation du lien).
 */
describe('REQ-SEC-032 — aucune action serveur de l’espace n’échappe au jugement du niveau', () => {
  const GARDES = /\b(?:actionEspace|exigerSessionRelevee|exigerAppareilConfirme)\(/;
  const EXEMPTIONS: Record<string, string> = {
    'src/app/(espace)/connexion/actions.ts':
      'la connexion ouvre la session (lien et code) : aucune session à juger',
  };

  function fichiersDe(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
      const chemin = `${dossier}/${nom}`;
      return statSync(chemin).isDirectory() ? fichiersDe(chemin) : [chemin];
    });
  }

  it('REQ-SEC-032 : TÉMOIN — chaque fichier « use server » de l’espace juge le niveau, ou est une exemption nommée', () => {
    const actions = fichiersDe('src/app/(espace)').filter(
      (f) => /\.tsx?$/.test(f) && /^\s*['"]use server['"]/m.test(readFileSync(f, 'utf8'))
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const f of actions) {
      if (Object.hasOwn(EXEMPTIONS, f)) continue;
      expect(readFileSync(f, 'utf8'), f).toMatch(GARDES);
    }
    // Chaque exemption existe encore, et reste une action serveur : une exemption morte rougit.
    for (const f of Object.keys(EXEMPTIONS)) expect(actions, f).toContain(f);
  });
});

/**
 * Le JUGE UNIQUE des faits saisis par une personne (sécurité, #703, 5981620953, condition 2) : vide,
 * borne de DM-55 en points de code, liens et mots refusés — un refus NOMMÉ. Le même contrôle de contenu
 * que celui des décisions de DM-55 ; la mise en demeure et la décision motivée l'appliquent.
 */
describe('REQ-JUR-006 — le juge unique des faits saisis', () => {
  it('REQ-JUR-006 : TÉMOIN — vide, trop long, avec un lien ou un mot refusé : chaque refus est nommé ; un texte juste passe', async () => {
    const { jugerLesFaitsSaisis } = await import('../../../src/server/attribution/notifications');
    const { FAITS_ANOMALIE_CARACTERES_MAX } = await import('../../../src/domain/seuils/ssot');
    const max = FAITS_ANOMALIE_CARACTERES_MAX.valeur;
    expect(jugerLesFaitsSaisis('Trois dépôts sans échange réel')).toEqual({ ok: true });
    expect(jugerLesFaitsSaisis('é'.repeat(max))).toEqual({ ok: true });
    expect(jugerLesFaitsSaisis(' \n\t ')).toEqual({ ok: false, motif: 'faits_vides' });
    expect(jugerLesFaitsSaisis('é'.repeat(max + 1))).toEqual({
      ok: false,
      motif: 'faits_trop_longs',
    });
    for (const lien of ['https://a.b', 'voir www.site', 'site.fr', 'x.com']) {
      expect(jugerLesFaitsSaisis(`Faits : ${lien}`), lien).toEqual({
        ok: false,
        motif: 'faits_avec_lien',
      });
    }
    for (const mot of ['fraude', 'Anomalies', 'SANCTION']) {
      expect(jugerLesFaitsSaisis(`Une ${mot} relevée`), mot).toEqual({
        ok: false,
        motif: 'faits_avec_mot_refuse',
      });
    }
  });

  it('REQ-JUR-006 : la décision motivée d’une résiliation passe par le même juge', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const e = await refusDe(
      resilierUnApporteur(
        txSimule('signe').tx,
        {
          apporteurId: ID,
          motif: 'manquement_grave',
          manquement: { article: '6', inexecutionIrremediable: true },
          motifDeLaDecision: 'Voir https://exemple.test',
          acteur: CONSOLE,
          maintenant: MAINTENANT,
        },
        await clesDeTest()
      )
    );
    expect(e.code).toBe('faits_avec_lien');
  });
});

/**
 * L'IDEMPOTENCE de la mise en demeure (sécurité, #703, 5982535417 ; forme d'A02, 5982552283) : une clé
 * tirée par le serveur au rendu, revalidée en UUID ; sous le verrou de l'apporteur, seule la ligne de
 * la MÊME clé est lue. Même contenu (apporteur, article, empreinte des faits, acteur de SON fait) : la
 * décision existante est rendue, sans rien écrire. Autre contenu, ou ligne purgée : `cle_deja_employee`.
 */
describe('REQ-JUR-006 — l’idempotence de la mise en demeure', () => {
  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '41', selfHash: 'x' });
    journalSimule.lireLaChargeDUnFait.mockReset();
    journalSimule.lireLaChargeDUnFait.mockResolvedValue({
      type: 'apporteur_mis_en_demeure',
      charge: { article: '6', acteur: CONSOLE },
    });
  });

  const demande = (o: Record<string, unknown> = {}): never => {
    const d: unknown = {
      apporteurId: ID,
      article: '6',
      faits: 'Trois dépôts  sans échange réel',
      cleIdempotence: CLE,
      acteur: CONSOLE,
      maintenant: MAINTENANT,
      ...o,
    };
    return d as never;
  };

  async function empreinte(faits: string) {
    const { empreinteRecherche } = await import('../../../src/server/securite/pii');
    return empreinteRecherche('faits_mise_en_demeure', faits, await clesDeTest());
  }

  it('REQ-JUR-006 : TÉMOIN — une clé absente ou forgée est refusée (cle_idempotence_invalide), sans rien lire ni écrire', async () => {
    const { mettreEnDemeure } = await import('../../../src/server/apporteur/resiliation');
    for (const cle of [undefined, '', 'pas-un-uuid', '0190f0a0-0000-7000-8000', 42]) {
      const t = txSimule('signe');
      const e = await refusDe(
        mettreEnDemeure(t.tx, demande({ cleIdempotence: cle }), await clesDeTest())
      );
      expect(e.code, String(cle)).toBe('cle_idempotence_invalide');
      expect(t.ordre).toStrictEqual([]);
    }
  });

  it('REQ-JUR-006 : TÉMOIN — la décision porte sa clé et l’empreinte des faits NETTOYÉS ; le texte chiffré est ce même clair', async () => {
    const { mettreEnDemeure } = await import('../../../src/server/apporteur/resiliation');
    const { decryptPii } = await import('../../../src/server/securite/pii');
    const t = txSimule('signe');
    const r = await mettreEnDemeure(t.tx, demande(), await clesDeTest());
    const d = (t.ecrits[0] as { decision: { data: Record<string, unknown> } }).decision.data;
    expect(d.cleIdempotence).toBe(CLE);
    expect(d.faitsEmpreinte).toBe(await empreinte('Trois dépôts sans échange réel'));
    expect(
      decryptPii(
        { modele: 'DecisionDeContrat', champ: 'texteChiffre', id: r.decisionId },
        d.texteChiffre as Uint8Array,
        await clesDeTest()
      )
    ).toBe('Trois dépôts sans échange réel');
    expect(t.lectures).toContainEqual({
      where: { cleIdempotence: CLE },
      select: {
        id: true,
        apporteurId: true,
        geste: true,
        article: true,
        faitsEmpreinte: true,
        evenementId: true,
      },
    });
  });

  it('REQ-JUR-006 : TÉMOIN — la même clé et le même contenu rendent la décision EXISTANTE, sans fait, sans décision, sans notification', async () => {
    const { mettreEnDemeure } = await import('../../../src/server/apporteur/resiliation');
    const t = txSimule('signe', {
      decisionDeMemeCle: {
        id: 'd-existante',
        apporteurId: ID,
        geste: 'mise_en_demeure',
        article: '6',
        faitsEmpreinte: await empreinte('Trois dépôts sans échange réel'),
        evenementId: 7n,
      },
    });
    const r = await mettreEnDemeure(t.tx, demande(), await clesDeTest());
    expect(r).toStrictEqual({ decisionId: 'd-existante', evenementId: 7n, rejouee: true });
    expect(t.ecrits).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
    expect(journalSimule.lireLaChargeDUnFait).toHaveBeenCalledWith(t.tx, '7');
  });

  it('REQ-JUR-006 : TÉMOIN — la même clé avec un autre contenu, ou une ligne déjà purgée, est refusée (cle_deja_employee), sans rien écrire', async () => {
    const { mettreEnDemeure } = await import('../../../src/server/apporteur/resiliation');
    const juste = {
      id: 'd-existante',
      apporteurId: ID,
      geste: 'mise_en_demeure',
      article: '6',
      faitsEmpreinte: await empreinte('Trois dépôts sans échange réel'),
      evenementId: 7n,
    };
    const cas: [string, Record<string, unknown>, Record<string, unknown>][] = [
      ['autre article', {}, { article: '7' }],
      ['autres faits', {}, { faits: 'D’autres faits' }],
      ['autre apporteur', { apporteurId: 'autre' }, {}],
      ['ligne purgée', { faitsEmpreinte: null }, {}],
      ['autre geste', { geste: 'resiliation' }, {}],
    ];
    for (const [nom, ligne, d] of cas) {
      const t = txSimule('signe', { decisionDeMemeCle: { ...juste, ...ligne } });
      const e = await refusDe(mettreEnDemeure(t.tx, demande(d), await clesDeTest()));
      expect(e.code, nom).toBe('cle_deja_employee');
      expect(t.ecrits, nom).toStrictEqual([]);
    }
    // Un autre acteur, lu dans le fait de la ligne.
    journalSimule.lireLaChargeDUnFait.mockResolvedValue({
      type: 'apporteur_mis_en_demeure',
      charge: {
        article: '6',
        acteur: { par: 'utilisateur_console', id: '0190f0a0-0000-7000-8000-0000000000c2' },
      },
    });
    const t = txSimule('signe', { decisionDeMemeCle: juste });
    expect((await refusDe(mettreEnDemeure(t.tx, demande(), await clesDeTest()))).code).toBe(
      'cle_deja_employee'
    );
  });

  it('REQ-JUR-006 : TÉMOIN — l’empreinte d’un même texte, avant et après nettoyage, est identique ; deux textes différents en donnent deux', async () => {
    expect(await empreinte('Des  faits\n précis ')).toBe(await empreinte('Des faits précis'));
    expect(await empreinte('Des faits précis')).not.toBe(await empreinte('Des faits imprécis'));
  });

  it('REQ-JUR-006 : TÉMOIN STATIQUE — mettreEnDemeure ne lit aucune mise en demeure antérieure : la ligne de SA clé, et rien d’autre', () => {
    const source = readFileSync('src/server/apporteur/resiliation.ts', 'utf8');
    const corps = source.slice(
      source.indexOf('export async function mettreEnDemeure'),
      source.indexOf('\n}\n', source.indexOf('export async function mettreEnDemeure'))
    );
    expect(corps).not.toMatch(/findMany|findFirst|count\(|envoisDeLArticle|notificationEspace/);
    // Des formes que l'instrumentation de la mutation garde : elle enveloppe chaque objet dans un
    // ternaire, sans en retirer le texte (vu au premier passage de la mutation, PR 718).
    expect(new Set(corps.match(/\.\w+\.findUnique\(/g))).toEqual(
      new Set(['.decisionDeContrat.findUnique('])
    );
    for (const appel of corps.split(/(?=\.findUnique\()/).slice(1)) {
      expect(appel).toMatch(
        /^\.findUnique\([\s\S]{0,200}?where:[\s\S]{0,120}?\{\s*cleIdempotence\s*\}/
      );
    }
  });

  it('REQ-JUR-006 : le prédicat « sous contrat » du domaine : signé ou suspendu, et rien d’autre', async () => {
    const { estSousContrat } = await import('../../../src/domain/apporteur/resiliation');
    const { STATUTS_APPORTEUR } = await import('../../../src/domain/apporteur/statut');
    expect(STATUTS_APPORTEUR.filter((s) => estSousContrat(s))).toEqual(['signe', 'suspendu']);
    expect(estSousContrat(null)).toBe(false);
  });
});

// ── SEC-66 : la résiliation par la Société (`ordinaire_axion`), forme (b) d'A02 ─────────────────

describe('REQ-JUR-015 — SEC-66 : la date d’effet et l’opposabilité, règles pures', () => {
  it('REQ-JUR-015 : TÉMOIN — la date d’effet est le jour civil de PARIS de la décision plus le préavis', async () => {
    const { dateEffetDeLaResiliationParLaSociete, jourCivilDeParis } =
      await import('../../../src/domain/apporteur/resiliation');
    // 23 h 30 à Paris le 4 octobre (UTC+2) : le jour de Paris est le 4, le jour UTC aussi.
    expect(jourCivilDeParis(Date.parse('2026-10-04T21:30:00.000Z'))).toBe('2026-10-04');
    expect(dateEffetDeLaResiliationParLaSociete(Date.parse('2026-10-04T21:30:00.000Z'))).toBe(
      '2026-11-03'
    );
    // Minuit à Paris le 5 : encore le 4 en UTC, mais le 5 à Paris.
    expect(jourCivilDeParis(Date.parse('2026-10-04T22:00:00.000Z'))).toBe('2026-10-05');
    expect(dateEffetDeLaResiliationParLaSociete(Date.parse('2026-10-04T22:00:00.000Z'))).toBe(
      '2026-11-04'
    );
    // Les mois et jours sur deux chiffres ; le passage d'année.
    expect(dateEffetDeLaResiliationParLaSociete(Date.parse('2026-12-15T10:00:00.000Z'))).toBe(
      '2027-01-14'
    );
    expect(jourCivilDeParis(Date.parse('2027-01-05T10:00:00.000Z'))).toBe('2027-01-05');
  });

  it('REQ-JUR-015 : TÉMOIN — opposable si et seulement si un courriel est ENVOYÉ le jour de Paris de la décision', async () => {
    const { estUneResiliationOpposable } =
      await import('../../../src/domain/apporteur/resiliation');
    const jour = '2026-10-04';
    const a = (statut: string, iso: string | null) => ({
      statut,
      envoyeAt: iso === null ? null : Date.parse(iso),
    });
    const juge = (...courriels: ReturnType<typeof a>[]) =>
      estUneResiliationOpposable({ dateReception: jour, courriels });
    expect(juge(a('envoye', '2026-10-04T21:59:59.999Z'))).toBe(true);
    expect(juge(a('envoye', '2026-10-03T22:00:00.000Z'))).toBe(true);
    expect(juge(a('envoye', '2026-10-04T22:00:00.000Z'))).toBe(false);
    expect(juge(a('envoye', '2026-10-03T21:59:59.999Z'))).toBe(false);
    expect(juge(a('echec', '2026-10-04T08:00:00.000Z'))).toBe(false);
    expect(juge(a('retenu_dmarc_non_verifie', '2026-10-04T08:00:00.000Z'))).toBe(false);
    expect(juge(a('envoye', null))).toBe(false);
    expect(juge()).toBe(false);
    // Un échec puis un envoi le même jour : opposable.
    expect(juge(a('echec', null), a('envoye', '2026-10-04T09:00:00.000Z'))).toBe(true);
  });

  it('REQ-JUR-015 : TÉMOIN — la date d’effet est atteinte à minuit, heure de Paris, de son jour', async () => {
    const { dateEffetAtteinte } = await import('../../../src/domain/apporteur/resiliation');
    expect(dateEffetAtteinte('2026-11-03', Date.parse('2026-11-02T22:59:59.999Z'))).toBe(false);
    expect(dateEffetAtteinte('2026-11-03', Date.parse('2026-11-02T23:00:00.000Z'))).toBe(true);
    expect(dateEffetAtteinte('2026-11-03', Date.parse('2026-12-01T08:00:00.000Z'))).toBe(true);
  });
});

/** Le monde de la tâche à la date d'effet : le verrou, les décisions, et ce qu'on écrit. */
function mondeDeLaTache(
  statutInitial: string,
  decisions: {
    id: string;
    evenementId: bigint;
    dateReception: Date | null;
    dateEffet: Date | null;
    courriels: { statut: string; envoyeAt: Date | null }[];
  }[]
) {
  const t = txSimule(statutInitial);
  const lectures: unknown[] = [];
  (t.tx as unknown as Record<string, unknown>).decisionDeContrat = {
    findMany: async (q: unknown) => {
      t.ordre.push('decisions');
      lectures.push(q);
      return decisions.map((d) => ({
        id: d.id,
        evenementId: d.evenementId,
        dateReception: d.dateReception,
        dateEffet: d.dateEffet,
        notificationsEspace: [{ courriels: d.courriels }],
      }));
    },
  };
  return { ...t, lecturesDesDecisions: lectures };
}

const NOTIFIEE = (dateEffet = '2026-11-03', acteur: unknown = CONSOLE) => ({
  type: 'apporteur_resiliation_notifiee',
  charge: { motif: 'ordinaire_axion', dateEffet, acteur },
});
const JOUR = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ENVOYE_LE_4 = { statut: 'envoye', envoyeAt: new Date('2026-10-04T08:00:00.000Z') };
const EFFET = new Date('2026-11-02T23:00:00.000Z');

describe('REQ-JUR-015 — SEC-66 : le geste « notifier la résiliation par la Société »', () => {
  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '77', selfHash: 'x' });
  });

  it('REQ-JUR-015 : TÉMOIN — sous le verrou : l’événement, la décision datée et la notification, sans changement de statut', async () => {
    const { notifierLaResiliationParLaSociete } =
      await import('../../../src/server/apporteur/resiliation');
    const t = txSimule('signe');
    const decision = new Date('2026-10-04T21:30:00.000Z');
    const r = await notifierLaResiliationParLaSociete(
      t.tx,
      { apporteurId: ID, acteur: CONSOLE, maintenant: decision },
      await clesDeTest()
    );
    expect(r.evenementId).toBe(77n);
    expect(r.dateEffet).toStrictEqual(JOUR('2026-11-03'));
    expect(t.ordre).toStrictEqual(['verrou', 'decision', 'notification']);
    expect(journalSimule.ajouterEvenement.mock.calls[0]![1]).toStrictEqual({
      type: 'apporteur_resiliation_notifiee',
      agregat: 'apporteur',
      agregatId: ID,
      survenuAt: decision,
      charge: { motif: 'ordinaire_axion', dateEffet: '2026-11-03', acteur: CONSOLE },
    });
    const ecrit = t.ecrits[0] as { decision: { data: Record<string, unknown> } };
    expect(ecrit.decision.data).toMatchObject({
      apporteurId: ID,
      geste: 'resiliation',
      dateReception: JOUR('2026-10-04'),
      dateEffet: JOUR('2026-11-03'),
      evenementId: 77n,
    });
    expect(ecrit.decision.data).not.toHaveProperty('texteChiffre');
    expect(t.ecrits[1]).toMatchObject({
      notification: { data: { apporteurId: ID, cle: 'resiliation', evenementId: 77n } },
    });
    expect(r.decisionId).toBe(
      (t.ecrits[1] as { notification: { data: { decisionContratId: string } } }).notification.data
        .decisionContratId
    );
    // Aucun changement de statut, aucune attribution touchée, aucun jeton révoqué.
    expect(t.mises).toStrictEqual([]);
    expect(t.revocations).toStrictEqual([]);
  });

  it('REQ-JUR-015 : TÉMOIN — un suspendu se notifie aussi ; le système et un apporteur hors contrat sont refusés, sans rien écrire', async () => {
    const { notifierLaResiliationParLaSociete } =
      await import('../../../src/server/apporteur/resiliation');
    const suspendu = txSimule('suspendu');
    await notifierLaResiliationParLaSociete(
      suspendu.tx,
      { apporteurId: ID, acteur: CONSOLE, maintenant: MAINTENANT },
      await clesDeTest()
    );
    expect(suspendu.ecrits).toHaveLength(2);
    const systeme = txSimule('signe');
    const e1 = await refusDe(
      notifierLaResiliationParLaSociete(
        systeme.tx,
        { apporteurId: ID, acteur: { par: 'systeme' } as never, maintenant: MAINTENANT },
        await clesDeTest()
      )
    );
    expect(e1.code).toBe('acteur_non_humain');
    expect(systeme.ordre).toStrictEqual([]);
    for (const statut of ['candidat', 'resilie', 'en_signature']) {
      const t = txSimule(statut);
      const e = await refusDe(
        notifierLaResiliationParLaSociete(
          t.tx,
          { apporteurId: ID, acteur: CONSOLE, maintenant: MAINTENANT },
          await clesDeTest()
        )
      );
      expect(e.code, statut).toBe('statut_sans_contrat');
      expect(t.ordre, statut).toStrictEqual(['verrou']);
    }
    expect(journalSimule.ajouterEvenement).toHaveBeenCalledTimes(1);
  });
});

describe('REQ-JUR-015 — SEC-66 : la date d’effet, pour un apporteur', () => {
  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '90', selfHash: 'x' });
    journalSimule.lireLaChargeDUnFait.mockReset();
    journalSimule.lireLaChargeDUnFait.mockResolvedValue(NOTIFIEE());
    journalSimule.passageQuiCiteLaDecision.mockReset();
    journalSimule.passageQuiCiteLaDecision.mockResolvedValue(null);
    transitionnerSimule.transitionnerUneAttribution.mockReset();
    transitionnerSimule.transitionnerUneAttribution.mockResolvedValue({});
  });

  const OPPOSABLE = {
    id: 'd-1',
    evenementId: 41n,
    dateReception: JOUR('2026-10-04'),
    dateEffet: JOUR('2026-11-03'),
    courriels: [ENVOYE_LE_4],
  };

  it('REQ-JUR-015 : TÉMOIN — à la date d’effet : resilie, ordinaire_axion, la décision CITÉE, l’acteur de la décision, puis les effets de l’art. 12', async () => {
    const { resilierALaDateDEffetUnApporteur } =
      await import('../../../src/server/apporteur/resiliation');
    const m = mondeDeLaTache('signe', [OPPOSABLE]);
    expect(await resilierALaDateDEffetUnApporteur(m.tx, ID, EFFET)).toBe(true);
    expect(m.lecturesDesDecisions[0]).toStrictEqual({
      where: { apporteurId: ID, geste: 'resiliation' },
      select: {
        id: true,
        evenementId: true,
        dateReception: true,
        dateEffet: true,
        notificationsEspace: {
          select: { courriels: { select: { statut: true, envoyeAt: true } } },
        },
      },
      orderBy: { evenementId: 'desc' },
    });
    expect(journalSimule.lireLaChargeDUnFait).toHaveBeenCalledWith(m.tx, '41');
    expect(journalSimule.passageQuiCiteLaDecision).toHaveBeenCalledWith(m.tx, '41');
    expect(m.mises).toStrictEqual([
      {
        where: { id: ID },
        data: {
          statut: 'resilie',
          resiliationMotif: 'ordinaire_axion',
          sessionVersion: { increment: 1 },
        },
      },
    ]);
    expect(journalSimule.ajouterEvenement.mock.calls[0]![1]).toStrictEqual({
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: ID,
      survenuAt: EFFET,
      charge: {
        de: 'signe',
        vers: 'resilie',
        transition: 'resilier',
        resiliationMotif: 'ordinaire_axion',
        decisionEvenementId: '41',
        acteur: CONSOLE,
      },
    });
    expect(m.ordre).toStrictEqual([
      'verrou',
      'decisions',
      'apporteur.update',
      'attributions',
      'verrou',
      'jetons',
    ]);
    // Aucune seconde décision, aucune seconde notification.
    expect(m.ecrits).toStrictEqual([]);
  });

  it('REQ-JUR-015 : TÉMOIN — rien avant la date d’effet, rien sans décision opposable, rien hors contrat', async () => {
    const { resilierALaDateDEffetUnApporteur } =
      await import('../../../src/server/apporteur/resiliation');
    const veille = mondeDeLaTache('signe', [OPPOSABLE]);
    expect(
      await resilierALaDateDEffetUnApporteur(veille.tx, ID, new Date('2026-11-02T22:59:59.999Z'))
    ).toBe(false);
    expect(veille.mises).toStrictEqual([]);
    const caduques = [
      { ...OPPOSABLE, courriels: [] },
      { ...OPPOSABLE, courriels: [{ statut: 'echec', envoyeAt: null }] },
      {
        ...OPPOSABLE,
        courriels: [{ statut: 'envoye', envoyeAt: new Date('2026-10-04T22:00:00.000Z') }],
      },
      { ...OPPOSABLE, dateReception: null },
      { ...OPPOSABLE, dateEffet: null },
    ];
    for (const d of caduques) {
      const m = mondeDeLaTache('signe', [d]);
      expect(await resilierALaDateDEffetUnApporteur(m.tx, ID, EFFET)).toBe(false);
      expect(m.mises).toStrictEqual([]);
    }
    for (const statut of ['resilie', 'candidat']) {
      const m = mondeDeLaTache(statut, [OPPOSABLE]);
      expect(await resilierALaDateDEffetUnApporteur(m.tx, ID, EFFET), statut).toBe(false);
      expect(m.ordre, statut).toStrictEqual(['verrou']);
    }
    const suspendu = mondeDeLaTache('suspendu', [OPPOSABLE]);
    expect(await resilierALaDateDEffetUnApporteur(suspendu.tx, ID, EFFET)).toBe(true);
    expect(journalSimule.ajouterEvenement).toHaveBeenCalledTimes(1);
  });

  it('REQ-JUR-015 : TÉMOIN — seule une décision de la Société compte : une autre résiliation, ou une charge illisible, est passée', async () => {
    const { resilierALaDateDEffetUnApporteur } =
      await import('../../../src/server/apporteur/resiliation');
    const autres = [
      { type: 'apporteur_statut_modifie', charge: { resiliationMotif: 'ordinaire_apporteur' } },
      { type: 'apporteur_resiliation_notifiee', charge: { motif: 'ordinaire_axion' } },
      null,
    ];
    for (const fait of autres) {
      journalSimule.lireLaChargeDUnFait.mockResolvedValueOnce(fait);
      const m = mondeDeLaTache('signe', [OPPOSABLE]);
      expect(await resilierALaDateDEffetUnApporteur(m.tx, ID, EFFET)).toBe(false);
      expect(m.mises).toStrictEqual([]);
    }
  });

  it('REQ-ARG-026 : TÉMOIN — la plus récente opposable compte : une caduque plus récente est passée, une opposable plus récente l’emporte', async () => {
    const { resilierALaDateDEffetUnApporteur } =
      await import('../../../src/server/apporteur/resiliation');
    const plusRecente = {
      id: 'd-2',
      evenementId: 52n,
      dateReception: JOUR('2026-10-11'),
      dateEffet: JOUR('2026-11-10'),
      courriels: [{ statut: 'envoye', envoyeAt: new Date('2026-10-11T08:00:00.000Z') }],
    };
    // La plus récente, opposable, n'est pas échue : rien, même si l'ancienne l'est.
    journalSimule.lireLaChargeDUnFait.mockResolvedValue(NOTIFIEE('2026-11-10'));
    const m1 = mondeDeLaTache('signe', [plusRecente, OPPOSABLE]);
    expect(await resilierALaDateDEffetUnApporteur(m1.tx, ID, EFFET)).toBe(false);
    expect(journalSimule.lireLaChargeDUnFait).toHaveBeenCalledTimes(1);
    // La plus récente, caduque : l'ancienne, opposable, compte.
    journalSimule.lireLaChargeDUnFait.mockReset();
    journalSimule.lireLaChargeDUnFait.mockResolvedValue(NOTIFIEE());
    const m2 = mondeDeLaTache('signe', [{ ...plusRecente, courriels: [] }, OPPOSABLE]);
    expect(await resilierALaDateDEffetUnApporteur(m2.tx, ID, EFFET)).toBe(true);
    expect(journalSimule.ajouterEvenement.mock.calls[0]![1]).toMatchObject({
      charge: { decisionEvenementId: '41' },
    });
  });

  it('REQ-JUR-015 : TÉMOIN — une décision déjà citée est refusée, nommée, et rien n’est écrit', async () => {
    const { resilierALaDateDEffetUnApporteur } =
      await import('../../../src/server/apporteur/resiliation');
    journalSimule.passageQuiCiteLaDecision.mockResolvedValue('88');
    const m = mondeDeLaTache('signe', [OPPOSABLE]);
    const e = await refusDe(resilierALaDateDEffetUnApporteur(m.tx, ID, EFFET));
    expect(e.code).toBe('decision_deja_citee');
    expect(m.mises).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-JUR-015 : TÉMOIN — le rendu d’une décision de la Société : le jour même il annonce la date, un autre jour ou sans instant il refuse', async () => {
    const { rendreUneDecisionDeContrat } =
      await import('../../../src/server/apporteur/resiliation');
    const decision = {
      apporteurId: ID,
      geste: 'resiliation',
      article: null,
      texteChiffre: null,
      dateReception: JOUR('2026-10-04'),
      dateEffet: JOUR('2026-11-03'),
      evenementId: 41n,
      textePurgeAt: null,
    };
    const tx = { decisionDeContrat: { findUnique: async () => decision } } as never;
    const n = {
      cle: 'resiliation',
      apporteurId: ID,
      evenementId: '41',
      decisionContratId: 'd-1',
    };
    const composer = (cle: string, t: { corps: string | null }) => ({
      sujet: cle,
      corps: t.corps ?? '',
    });
    const cles = await clesDeTest();
    const rendre = (envoyeLe?: Date) =>
      rendreUneDecisionDeContrat(tx, n, {
        cles,
        composer,
        ...(envoyeLe === undefined ? {} : { envoyeLe }),
      });
    const r = await rendre(new Date('2026-10-04T21:59:59.999Z'));
    expect((r as { corps: string }).corps).toContain(
      "Axion-IA résilie votre contrat d'apporteur, comme le permet l'article 11.1. Le préavis court à compter de l'envoi de ce message : le contrat prend fin le 3 novembre 2026."
    );
    expect(await rendre(new Date('2026-10-04T22:00:00.000Z'))).toEqual({
      nonRendue: 'decision_non_notifiee',
    });
    expect(await rendre(new Date('2026-10-03T21:59:59.999Z'))).toEqual({
      nonRendue: 'decision_non_notifiee',
    });
    expect(await rendre()).toEqual({ nonRendue: 'decision_non_notifiee' });
    // Une charge de décision illisible ne se rend pas.
    journalSimule.lireLaChargeDUnFait.mockResolvedValue({
      type: 'apporteur_resiliation_notifiee',
      charge: { motif: 'ordinaire_apporteur' },
    });
    expect(await rendre(new Date('2026-10-04T08:00:00.000Z'))).toEqual({
      nonRendue: 'charge_illisible',
    });
    // Le passage à `resilie` sans motif ne se rend pas non plus.
    journalSimule.lireLaChargeDUnFait.mockResolvedValue({
      type: 'apporteur_statut_modifie',
      charge: { de: 'signe', vers: 'suspendu', transition: 'suspendre', acteur: CONSOLE },
    });
    expect(await rendre(new Date('2026-10-04T08:00:00.000Z'))).toEqual({
      nonRendue: 'charge_illisible',
    });
  });
});

describe('REQ-JUR-015 — SEC-66 : le passage du lanceur à la date d’effet', () => {
  const resiliationSimulee = vi.hoisted(() => ({ parApporteur: vi.fn() }));

  it('REQ-JUR-015 : TÉMOIN — le passage lit les candidats sous contrat dont la date d’effet est atteinte, une transaction par apporteur, et nomme ses refus', async () => {
    vi.resetModules();
    vi.doMock('../../../src/server/apporteur/resiliation', async (original) => ({
      ...(await original<typeof import('../../../src/server/apporteur/resiliation')>()),
      resilierALaDateDEffetUnApporteur: resiliationSimulee.parApporteur,
    }));
    const { resilierALaDateDEffet } =
      await import('../../../src/server/taches/resilier-a-date-effet');
    const { ErreurResiliation } = await import('../../../src/server/apporteur/resiliation');
    const lus: unknown[] = [];
    const transactions: string[] = [];
    const prisma = {
      decisionDeContrat: {
        findMany: async (q: unknown) => {
          lus.push(q);
          return [{ apporteurId: 'a-1' }, { apporteurId: 'a-2' }, { apporteurId: 'a-3' }];
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        transactions.push('tx');
        return fn('TX');
      },
    };
    resiliationSimulee.parApporteur
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new ErreurResiliation('decision_deja_citee', 'déjà citée'))
      .mockResolvedValueOnce(false);
    const bilan = await resilierALaDateDEffet(prisma as never, EFFET);
    expect(bilan).toStrictEqual({ resilies: 1, refus_decision_deja_citee: 1 });
    expect(lus[0]).toStrictEqual({
      where: {
        geste: 'resiliation',
        dateEffet: { lte: JOUR('2026-11-03') },
        apporteur: { statut: { in: ['signe', 'suspendu'] } },
      },
      select: { apporteurId: true },
      distinct: ['apporteurId'],
      orderBy: { apporteurId: 'asc' },
    });
    expect(transactions).toHaveLength(3);
    expect(resiliationSimulee.parApporteur.mock.calls).toStrictEqual([
      ['TX', 'a-1', EFFET],
      ['TX', 'a-2', EFFET],
      ['TX', 'a-3', EFFET],
    ]);
    // Une erreur qui n'est pas un refus nommé remonte.
    resiliationSimulee.parApporteur.mockRejectedValueOnce(new Error('base perdue'));
    await expect(resilierALaDateDEffet(prisma as never, EFFET)).rejects.toThrow('base perdue');
    vi.doUnmock('../../../src/server/apporteur/resiliation');
    vi.resetModules();
  });
});
