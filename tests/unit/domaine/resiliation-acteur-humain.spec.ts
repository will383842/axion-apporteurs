// @req REQ-JUR-042
// @req REQ-DM-011
// @req REQ-SEC-032
// @req REQ-SEC-003
// @req REQ-SEC-005
/**
 * SEC-19 — la résiliation et ce qu'elle ne peut JAMAIS être : une sanction de l'inactivité.
 *
 * REQ-JUR-042 (verrou produit, arrêté par Will le 2026-09-03) : aucun motif de résiliation ne nomme
 * l'inactivité, la dormance, l'activité ni l'absence de dépôt — ni en liste, ni en texte libre. Le
 * cliquet de l'enum lui-même (égal à REQ-DM-011 et au schéma) vit dans
 * `apporteur-matrice-et-statuts.spec.ts` ; ce fichier tient le verrou lexical, avec son contre-témoin.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MOTIFS_RESILIATION } from '../../../src/domain/apporteur/statut';

// La garde d'acceptation (SEC-53) est hors du sujet ici : elle passe, pour que seul le niveau juge.
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
}));
vi.mock('../../../src/server/evenement/journal', () => journalSimule);
// La transition d'une attribution a ses propres témoins (DM-08) : ici, seul l'APPEL est jugé.
const transitionnerSimule = vi.hoisted(() => ({ transitionnerUneAttribution: vi.fn() }));
vi.mock('../../../src/server/attribution/transitionner', () => transitionnerSimule);

const ID = '0190f0a0-0000-7000-8000-0000000000a1';
const MAINTENANT = new Date('2027-03-01T09:00:00.000Z');
const CONSOLE = { par: 'utilisateur_console', id: '0190f0a0-0000-7000-8000-0000000000c1' } as const;

function txSimule(
  statutInitial: string,
  monde: {
    attributions?: { id: string; statut: string }[];
    misesEnDemeure?: { evenementId: bigint; courriels: { envoyeAt: Date }[] }[];
  } = {}
) {
  let statut = statutInitial;
  const lectures: unknown[] = [];
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
    },
  };
  return { tx: tx as never, ordre, mises, revocations, lectures };
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
    const r = await resilierUnApporteur(t.tx, {
      apporteurId: ID,
      motif: 'ordinaire_axion',
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    });
    expect(r).toMatchObject({ de: 'signe', vers: 'resilie' });
    expect(t.mises).toStrictEqual([
      {
        where: { id: ID },
        data: {
          statut: 'resilie',
          resiliationMotif: 'ordinaire_axion',
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
        resiliationMotif: 'ordinaire_axion',
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
    await resilierUnApporteur(depuisSuspendu.tx, {
      apporteurId: ID,
      motif: 'manquement_grave',
      manquement: { article: '6', inexecutionIrremediable: true },
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    });
    expect(depuisSuspendu.mises).toHaveLength(1);
    const deja = txSimule('resilie');
    const e = await refusDe(
      resilierUnApporteur(deja.tx, {
        apporteurId: ID,
        motif: 'ordinaire_axion',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      })
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
      resilierUnApporteur(t.tx, {
        apporteurId: ID,
        motif: 'ordinaire_axion',
        acteur: SYSTEME as never,
        maintenant: MAINTENANT,
      })
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
    await resilierUnApporteur(t.tx, {
      apporteurId: ID,
      motif: 'ordinaire_axion',
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    });
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
      resilierUnApporteur(t.tx, {
        apporteurId: ID,
        motif: 'manquement_grave',
        manquement: { article: '6', inexecutionIrremediable: false },
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      })
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
    const r = await resilierUnApporteur(t.tx, {
      apporteurId: ID,
      motif: 'manquement_grave',
      manquement: { article: '6', inexecutionIrremediable: false },
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    });
    expect(r.vers).toBe('resilie');
  });

  it('REQ-JUR-006 : le manquement accompagne manquement_grave, et lui seul (manquement_incoherent)', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const sans = await refusDe(
      resilierUnApporteur(txSimule('signe').tx, {
        apporteurId: ID,
        motif: 'manquement_grave',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      })
    );
    expect(sans.code).toBe('manquement_incoherent');
    const enTrop = await refusDe(
      resilierUnApporteur(txSimule('signe').tx, {
        apporteurId: ID,
        motif: 'ordinaire_axion',
        manquement: { article: '6', inexecutionIrremediable: true },
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      })
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
    expect(source).toContain('sessionVersion: { increment: 1 }');
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
