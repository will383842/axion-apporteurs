// @req REQ-UX-016
// @req REQ-DM-004
/**
 * Le passage d'envoi des notifications de l'espace (DM-55, forme d'A02), jugé en processus sur ses
 * ports : le courriel part APRÈS le commit de la transition, une seule fois, rejouable.
 *
 *   — chaque notification est prise sous verrou (`FOR UPDATE SKIP LOCKED`) : une notification déjà
 *     prise, ou déjà portée par un courriel non échoué, est sautée ;
 *   — le délai court de l'ENVOI EFFECTIF (REQ-UX-016, juriste) : la fenêtre de redéclaration de
 *     `premier_rang_libere` est posée à `envoye_at` + `FILE_FENETRE_REDECLARATION_JOURS`, une fois ;
 *     un courriel en échec ou retenu ne pose rien — aucun délai ne court tant qu'il n'est pas parti ;
 *   — `{dateLimite}` se rend sur la date de l'envoi : le texte ne promet jamais une échéance plus
 *     courte que la vraie.
 */
import { describe, it, expect } from 'vitest';
import {
  FAITS_ANOMALIE_CARACTERES_MAX,
  FUSEAU_DES_DELAIS,
  SEUILS,
  TAILLES_DE_LOT,
} from '../../../src/domain/seuils/ssot';
import {
  fenetreOuverte,
  finDeLaFenetreDeRedeclaration,
  jourLimiteDeLaFenetre,
} from '../../../src/domain/attribution/fenetre-redeclaration';
import { MS_PAR_JOUR, joursDeLaDate } from '../../../src/domain/temps/calendrier-civil';
import { versParis } from '../../../src/domain/temps/paris';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { GABARITS } from '../../../src/server/notifications/table-ssot';
import {
  dateEnClair,
  entrepriseDeLaNotification,
  motifDeLaDecision,
  parametresDeLaNotification,
  rendreDepuisLaBase,
  texteDuPremierRangDansLEspace,
  type SourcesDuRendu,
} from '../../../src/server/attribution/notifications';
import {
  ENTREPRISE_DE_REPLI,
  FAITS_NON_CONSERVES,
  MOIS_EN_TOUTES_LETTRES,
  LIBELLES_DES_CATEGORIES,
  MOTIFS_DES_DECISIONS,
  RAISONS_D_ANNULATION,
} from '../../../src/content/micro-copy/courriels/notifications';
import {
  LONGUEUR_DU_MOTIF_MAX,
  rendreLaNotification,
} from '../../../src/server/notifications/envoyer';
import { LEXIQUE_INTERDIT } from '../../../src/domain/lexique/lexique-interdit';
import { MotifListeNoire } from '@prisma/client';
import {
  MOTIFS_ANNULATION_CONSOLE,
  MOTIFS_LISTE_NOIRE,
} from '../../../src/domain/attribution/machine';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';
import { motifDeLaForme } from '../../../scripts/gates/lexique-apporteurs';
import { randomBytes } from 'node:crypto';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, empreinteRecherche, encryptPii } from '../../../src/server/securite/pii';
import { lireLaChargeDUnFait } from '../../../src/server/evenement/journal';
import {
  MODELE_DE_LA_JUSTIFICATION,
  lireLesFaitsPourLaNotification,
} from '../../../src/server/anomalie/justification';
import { composerLeCourriel } from '../../../src/server/notifications/envoyer';
import {
  depotDesCourriels,
  emettre,
  type LigneCourriel,
  type Relais,
} from '../../../src/server/integrations/zeptomail/emetteur';
import {
  CLES_ENVOYEES_PAR_LE_PASSAGE,
  envoyerLesNotificationsDeLEspace,
  envoyerParLEmetteur,
  portsDuPassage,
  type NotificationAEnvoyer,
  type PortsDuPassage,
} from '../../../src/server/taches/envoyer-notifications-espace';

const MAINTENANT = new Date('2027-05-10T08:00:00.000Z');

const notif = (
  id: string,
  cle: string,
  o: Partial<NotificationAEnvoyer> = {}
): NotificationAEnvoyer => ({
  id,
  cle,
  apporteurId: 'app-1',
  attributionId: `att-${id}`,
  evenementId: '42',
  anomalieId: null,
  decisionContratId: null,
  ...o,
});

type Issue = {
  statut: 'envoye' | 'echec' | 'retenu_adresse_supprimee' | 'retenu_dmarc_non_verifie';
  envoyeAt: Date | null;
};

function ports(
  lot: NotificationAEnvoyer[],
  o: {
    pris?: string[];
    issue?: (n: NotificationAEnvoyer) => Issue;
    sansTexte?: string[];
  } = {}
) {
  const trace: string[] = [];
  const rendus: { id: string; envoyeLe: string }[] = [];
  const fenetres: { attributionId: string; finAt: Date }[] = [];
  const envoyes: string[] = [];
  const p: PortsDuPassage = {
    maintenant: () => MAINTENANT,
    lireLot: async (take) => {
      trace.push(`lot:${take}`);
      return lot;
    },
    dansUneTransaction: async (fn) => {
      trace.push('tx');
      return fn({
        verrouiller: async (n) => !(o.pris ?? []).includes(n.id),
        rendre: async (n, envoyeLe) => {
          if ((o.sansTexte ?? []).includes(n.id)) return { nonRendue: 'parametre_refuse' as const };
          rendus.push({ id: n.id, envoyeLe: envoyeLe.toISOString() });
          return { sujet: `sujet ${n.id}`, corps: `corps ${n.id}` };
        },
        envoyer: async (n) => {
          envoyes.push(n.id);
          return o.issue ? o.issue(n) : { statut: 'envoye', envoyeAt: MAINTENANT };
        },
        poserLaFenetre: async (attributionId, finAt) => {
          fenetres.push({ attributionId, finAt });
        },
      });
    },
  };
  return { p, trace, rendus, fenetres, envoyes };
}

describe('REQ-UX-016 — le passage envoie chaque notification une fois, sous verrou', () => {
  it('REQ-UX-016 : le lot est borné par la SSOT, et chaque notification a SA transaction', async () => {
    const t = ports([notif('n1', 'decision_attribution'), notif('n2', 'decision_attribution')]);
    expect(await envoyerLesNotificationsDeLEspace(t.p)).toEqual({
      envoyees: 2,
      echecs: 0,
      retenues: 0,
      sautees: 0,
      nonRendues: 0,
    });
    expect(t.trace).toEqual([`lot:${TAILLES_DE_LOT.NOTIFICATIONS_ENVOI_LOT.valeur}`, 'tx', 'tx']);
    expect(t.envoyes).toEqual(['n1', 'n2']);
  });

  it('REQ-UX-016 : TÉMOIN — une notification déjà prise (verrou refusé) est sautée, rien n’est envoyé', async () => {
    const t = ports([notif('n1', 'decision_attribution')], { pris: ['n1'] });
    expect(await envoyerLesNotificationsDeLEspace(t.p)).toEqual({
      envoyees: 0,
      echecs: 0,
      retenues: 0,
      sautees: 1,
      nonRendues: 0,
    });
    expect(t.envoyes).toEqual([]);
  });

  it('REQ-UX-016 : TÉMOIN — un texte qui ne se rend pas n’envoie rien, se COMPTE au bilan, et ne bloque pas les suivantes', async () => {
    const t = ports([notif('n1', 'decision_attribution'), notif('n2', 'decision_attribution')], {
      sansTexte: ['n1'],
    });
    expect(await envoyerLesNotificationsDeLEspace(t.p)).toEqual({
      envoyees: 1,
      echecs: 0,
      retenues: 0,
      sautees: 0,
      nonRendues: 1,
      nonRendue_parametre_refuse: 1,
    });
    expect(t.envoyes).toEqual(['n2']);
  });
});

describe('REQ-DM-004 — la fenêtre de redéclaration court de l’ENVOI EFFECTIF', () => {
  it('REQ-DM-004 : TÉMOIN — premier_rang_libere envoyé : la fenêtre finit à minuit (Paris) après le jour envoi + 15, calculée par le domaine', async () => {
    const envoyeAt = new Date(MAINTENANT.getTime() + 1234);
    const t = ports([notif('n1', 'premier_rang_libere')], {
      issue: () => ({ statut: 'envoye', envoyeAt }),
    });
    await envoyerLesNotificationsDeLEspace(t.p);
    expect(t.fenetres).toEqual([
      {
        attributionId: 'att-n1',
        finAt: new Date(finDeLaFenetreDeRedeclaration(envoyeAt.getTime())),
      },
    ]);
  });

  it('REQ-DM-004 : TÉMOIN — relais en panne, puis envoi deux heures plus tard : l’échéance part de l’envoi effectif', async () => {
    const enPanne = ports([notif('n1', 'premier_rang_libere')], {
      issue: () => ({ statut: 'echec', envoyeAt: null }),
    });
    expect(await envoyerLesNotificationsDeLEspace(enPanne.p)).toMatchObject({ echecs: 1 });
    expect(enPanne.fenetres).toEqual([]);

    const plusTard = new Date(MAINTENANT.getTime() + 2 * 3600 * 1000);
    const rejeu = ports([notif('n1', 'premier_rang_libere')], {
      issue: () => ({ statut: 'envoye', envoyeAt: plusTard }),
    });
    await envoyerLesNotificationsDeLEspace(rejeu.p);
    expect(rejeu.fenetres[0]!.finAt.getTime()).toBe(
      finDeLaFenetreDeRedeclaration(plusTard.getTime())
    );
  });

  it.each(['retenu_adresse_supprimee', 'retenu_dmarc_non_verifie'] as const)(
    'REQ-DM-004 : TÉMOIN — un courriel %s ne pose AUCUNE fenêtre : aucun délai ne court',
    async (statut) => {
      const t = ports([notif('n1', 'premier_rang_libere')], {
        issue: () => ({ statut, envoyeAt: null }),
      });
      expect(await envoyerLesNotificationsDeLEspace(t.p)).toMatchObject({ retenues: 1 });
      expect(t.fenetres).toEqual([]);
    }
  );

  it('REQ-DM-004 : une décision envoyée ne pose aucune fenêtre (decision_attribution ne fait courir aucun délai)', async () => {
    const t = ports([notif('n1', 'decision_attribution')]);
    await envoyerLesNotificationsDeLEspace(t.p);
    expect(t.fenetres).toEqual([]);
  });

  it('REQ-DM-004 : le texte se rend sur l’heure de l’envoi, que la fenêtre prend pour origine', async () => {
    const t = ports([notif('n1', 'premier_rang_libere')]);
    await envoyerLesNotificationsDeLEspace(t.p);
    expect(t.rendus).toEqual([{ id: 'n1', envoyeLe: MAINTENANT.toISOString() }]);
  });
});

// ── l'adaptateur Prisma ─────────────────────────────────────────────────────────────────────────

describe('REQ-UX-016 — l’adaptateur du passage, sur la base', () => {
  type Appel = { quoi: string; args: unknown };
  function client(o: { lignes?: unknown[]; verrou?: unknown[] } = {}) {
    const appels: Appel[] = [];
    const tx = {
      $queryRaw: async (sql: TemplateStringsArray, ...valeurs: unknown[]) => {
        appels.push({ quoi: 'verrou', args: { sql: sql.join('?'), valeurs } });
        return o.verrou ?? [{ id: 'n1' }];
      },
      attribution: {
        updateMany: async (args: unknown) => {
          appels.push({ quoi: 'fenetre', args });
          return { count: 1 };
        },
      },
    };
    const prisma = {
      notificationEspace: {
        findMany: async (args: unknown) => {
          appels.push({ quoi: 'lot', args });
          return o.lignes ?? [];
        },
      },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaClient;
    return { prisma, appels };
  }
  const externes = {
    maintenant: () => MAINTENANT,
    rendre: async () => ({ sujet: 's', corps: 'c' }),
    envoyer: async () => ({ statut: 'envoye' as const, envoyeAt: MAINTENANT }),
  };

  it('REQ-UX-016 : le lot — la liste fermée du passage, PORTANT leur événement, sans courriel non échoué, dans l’ordre d’inscription', async () => {
    const c = client({
      lignes: [
        {
          id: 'n1',
          cle: 'premier_rang_libere',
          apporteurId: 'a',
          attributionId: 't',
          evenementId: 42n,
        },
      ],
    });
    const lus = await portsDuPassage(c.prisma, externes).lireLot(7);
    expect(lus).toEqual([
      {
        id: 'n1',
        cle: 'premier_rang_libere',
        apporteurId: 'a',
        attributionId: 't',
        evenementId: '42',
      },
    ]);
    expect(c.appels[0]!.args).toEqual({
      where: {
        cle: { in: [...CLES_ENVOYEES_PAR_LE_PASSAGE] },
        evenementId: { not: null },
        courriels: { none: { statut: { not: 'echec' } } },
      },
      orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
      take: 7,
      select: {
        id: true,
        cle: true,
        apporteurId: true,
        attributionId: true,
        evenementId: true,
        anomalieId: true,
        decisionContratId: true,
      },
    });
  });

  it('REQ-UX-016 : le verrou — FOR UPDATE SKIP LOCKED, et seulement sans courriel non échoué', async () => {
    const pris = client({ verrou: [] });
    const libre = client();
    const n = notif('n1', 'decision_attribution');
    const ports = portsDuPassage(pris.prisma, externes);
    expect(await ports.dansUneTransaction((g) => g.verrouiller(n))).toBe(false);
    expect(
      await portsDuPassage(libre.prisma, externes).dansUneTransaction((g) => g.verrouiller(n))
    ).toBe(true);
    const { sql, valeurs } = libre.appels[0]!.args as { sql: string; valeurs: unknown[] };
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*courriels_envoyes[\s\S]*<> 'echec'/);
    expect(valeurs).toEqual(['n1']);
  });

  it('REQ-DM-004 : la fenêtre n’est posée que si elle est encore NULLE — un rejeu ne la déplace pas', async () => {
    const c = client();
    const finAt = new Date('2027-05-25T08:00:00.000Z');
    await portsDuPassage(c.prisma, externes).dansUneTransaction((g) =>
      g.poserLaFenetre('att-1', finAt)
    );
    expect(c.appels).toEqual([
      {
        quoi: 'fenetre',
        args: {
          where: { id: 'att-1', fenetreRedeclarationFinAt: null },
          data: { fenetreRedeclarationFinAt: finAt },
        },
      },
    ]);
  });
});

describe('REQ-UX-016 — une clé, un seul chemin d’envoi : le passage ou notifier(), jamais les deux', () => {
  const sources = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return sources(chemin);
      return /\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
    });

  /** Le code d'un fichier, sans ses commentaires : une mention en prose n'est pas un appel. */
  const sansCommentaires = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('REQ-UX-016 : la liste du passage est FERMÉE et nommée, chaque clé y a un canal courriel', () => {
    expect([...CLES_ENVOYEES_PAR_LE_PASSAGE]).toEqual([
      'decision_attribution',
      'premier_rang_libere',
      // SEC-19 : la mise en demeure (A02, #713, 5981780677), puis la résiliation (A02, #703).
      'mise_en_demeure',
      'resiliation',
      // DM-25 : l'annulation pour antériorité de la Société, envoyée par le passage.
      'attribution_annulee_anteriorite',
      // EXT-T07 : la prolongation, dont le terme se lit dans la charge de son événement.
      'attribution_prolongee',
    ]);
    for (const cle of CLES_ENVOYEES_PAR_LE_PASSAGE) {
      expect(GABARITS[cle].canaux, cle).toContain('email');
    }
  });

  it('REQ-UX-016 : TÉMOIN — aucun fichier qui appelle notifier() ne nomme une clé du passage', () => {
    const appelants = sources('src').filter(
      (f) =>
        f !== 'src/server/notifications/envoyer.ts' && /\bnotifier\s*\(/.test(sansCommentaires(f))
    );
    const fautifs = appelants.filter((f) =>
      CLES_ENVOYEES_PAR_LE_PASSAGE.some((cle) => readFileSync(f, 'utf8').includes(`'${cle}'`))
    );
    expect(fautifs).toEqual([]);
  });

  it('REQ-UX-016 : TÉMOIN — le passage n’envoie aucune autre clé : son lot lit la liste, et elle seule', () => {
    const passage = readFileSync('src/server/taches/envoyer-notifications-espace.ts', 'utf8');
    expect(passage).toContain('cle: { in: [...CLES_ENVOYEES_PAR_LE_PASSAGE] }');
    expect(passage).not.toMatch(/GABARITS/);
  });
});

// ── le rendu ────────────────────────────────────────────────────────────────────────────────────

describe('REQ-DM-006 — le motif d’une décision, mot pour mot (juriste, rattrapage 98)', () => {
  it('REQ-DM-006 : anomalie_confirmee — l’article 3.7 et les faits retenus', () => {
    expect(
      motifDeLaDecision({ transition: 'anomalie_confirmee', faits: 'deux dépôts le même jour' })
    ).toBe(
      "À la vérification, ce dépôt ne remplit pas les conditions de l'article 3.7 du contrat. Faits retenus : deux dépôts le même jour"
    );
  });

  it.each(['non_confirmee', 'non_confirmee_par_courriel'] as const)(
    'REQ-DM-006 : %s — le même texte, sans paramètre',
    (transition) => {
      expect(motifDeLaDecision({ transition })).toBe(
        "L'entreprise a indiqué expressément n'avoir eu aucun échange avec vous (contrat, article 3.7) ; vous pouvez demander à Axion-IA l'extrait de sa réponse"
      );
    }
  );

  it.each([
    ['demande_de_l_apporteur', undefined, 'à votre demande'],
    [
      'declaration_en_double',
      undefined,
      'vous aviez déjà déposé cette entreprise, et ce dépôt faisait double emploi avec le premier',
    ],
    [
      'entreprise_relevant_de_l_article_3_3_bis',
      'financeur_public',
      "l'entreprise est un financeur public avec lequel Axion-IA est en relation (contrat, article 3.3 bis), situation qui existait déjà à la date de votre dépôt",
    ],
  ] as const)(
    'REQ-DM-006 : annulee_par_la_console, %s — sa raison, en clair',
    (raison, categorie, attendu) => {
      expect(
        motifDeLaDecision({
          transition: 'annulee_par_la_console',
          raison,
          ...(categorie ? { categorie } : {}),
        })
      ).toBe(
        `Axion-IA a annulé ce dépôt avant sa confirmation, pour la raison suivante : ${attendu}`
      );
    }
  );

  it('REQ-DM-006 : erreur_de_saisie_de_la_societe — aucun libellé pour l’apporteur, aucune notification', () => {
    expect(
      motifDeLaDecision({
        transition: 'annulee_par_la_console',
        raison: 'erreur_de_saisie_de_la_societe',
      })
    ).toBeNull();
  });

  it('REQ-DM-006 : aucun texte ne finit par un point : le corps le pose', () => {
    for (const t of Object.values(MOTIFS_DES_DECISIONS)) expect(t.endsWith('.')).toBe(false);
  });

  it.each([
    ['un lien', 'voir https://exemple.test/x'],
    ['une adresse de site', 'voir www.exemple.test'],
    ['« fraude »', 'soupçon de Fraude'],
    ['« anomalie »', 'une anomalie relevée'],
    ['« sanction »', 'sanction appliquée'],
    ['une valeur vide', '   '],
  ])('REQ-DM-006 : TÉMOIN (sécurité) — des faits qui portent %s sont REFUSÉS', (_, faits) => {
    expect(() => motifDeLaDecision({ transition: 'anomalie_confirmee', faits })).toThrow(
      /faits_refuses/
    );
  });

  it.each([
    ['anomalie_confirmee sans faits', { transition: 'anomalie_confirmee' }],
    [
      'une raison sur une autre décision',
      { transition: 'non_confirmee', raison: 'declaration_en_double' },
    ],
    ['annulee_par_la_console sans raison', { transition: 'annulee_par_la_console' }],
    [
      'une catégorie sans 3.3 bis',
      { transition: 'annulee_par_la_console', raison: 'declaration_en_double', categorie: 'x' },
    ],
    [
      '3.3 bis sans catégorie',
      { transition: 'annulee_par_la_console', raison: 'entreprise_relevant_de_l_article_3_3_bis' },
    ],
    ['une transition qui n’est pas une décision', { transition: 'perimee' }],
  ] as const)('REQ-DM-006 : %s — refusé, nommé', (_, e) => {
    expect(() => motifDeLaDecision(e as never)).toThrow(/motif_incoherent/);
  });
});

describe('REQ-DM-004 — la date limite, en clair, à Paris', () => {
  it('REQ-DM-004 : le jour civil de Paris, le mois en toutes lettres', () => {
    expect(dateEnClair(new Date('2027-05-25T08:00:00.000Z'))).toBe('25 mai 2027');
    // 23 h 30 UTC le 31 décembre est déjà le 1er janvier à Paris
    expect(dateEnClair(new Date('2026-12-31T23:30:00.000Z'))).toBe('1 janvier 2027');
  });
});

describe('REQ-UX-016 — les paramètres de chaque clé, exactement', () => {
  it('REQ-UX-016 : decision_attribution — l’entreprise et le motif', () => {
    expect(
      parametresDeLaNotification('decision_attribution', {
        entreprise: 'Société Fictive',
        motif: 'à votre demande',
        envoyeLe: MAINTENANT,
      })
    ).toEqual({ entreprise: 'Société Fictive', motif: 'à votre demande' });
  });

  it('REQ-DM-004 : premier_rang_libere — l’entreprise et la date limite, prise de l’envoi + la fenêtre de la SSOT', () => {
    expect(
      parametresDeLaNotification('premier_rang_libere', {
        entreprise: 'Société Fictive',
        envoyeLe: new Date('2027-05-10T08:00:00.000Z'),
      })
    ).toEqual({ entreprise: 'Société Fictive', dateLimite: '25 mai 2027' });
  });

  it('REQ-UX-016 : une clé hors du passage, ou un motif manquant — refusé', () => {
    expect(() =>
      parametresDeLaNotification('attribution_liberee', { entreprise: 'x', envoyeLe: MAINTENANT })
    ).toThrow(/cle_hors_passage/);
    expect(() =>
      parametresDeLaNotification('decision_attribution', { entreprise: 'x', envoyeLe: MAINTENANT })
    ).toThrow(/motif_manquant/);
  });
});

// ── la fin de la fenêtre de redéclaration (juriste et A02) ─────────────────────────────────────

describe('REQ-DM-004 — la fenêtre finit à MINUIT, heure de Paris, après le jour envoi + 15 jours (borne exclusive)', () => {
  /** Un instant donné en heure de Paris : « AAAA-MM-JJTHH:MM » plus son décalage du moment. */
  const paris = (iso: string) => new Date(iso).getTime();

  it('REQ-DM-004 : TÉMOIN — envoyé le 10 à 23 h 50 (Paris) : la fenêtre ferme le 26 à 0 h (Paris), exclue', () => {
    const fin = finDeLaFenetreDeRedeclaration(paris('2027-05-10T23:50:00.000+02:00'));
    expect(new Date(fin).toISOString()).toBe('2027-05-25T22:00:00.000Z');
  });

  it('REQ-DM-004 : TÉMOIN — envoyé à 23 h 30 (Paris), le jour d’envoi est celui de Paris, pas celui d’UTC', () => {
    // 23 h 30 le 31 janvier à Paris = 22 h 30 UTC le 31 : le jour d'envoi est le 31.
    const fin = finDeLaFenetreDeRedeclaration(paris('2027-01-31T23:30:00.000+01:00'));
    expect(new Date(fin).toISOString()).toBe('2027-02-15T23:00:00.000Z');
  });

  it('REQ-DM-004 : TÉMOIN — fin − 1 ms est dans la fenêtre, fin ne l’est plus (comparaison stricte)', () => {
    const fin = finDeLaFenetreDeRedeclaration(paris('2027-05-10T12:00:00.000+02:00'));
    expect(fenetreOuverte(fin - 1, fin)).toBe(true);
    expect(fenetreOuverte(fin, fin)).toBe(false);
    expect(fenetreOuverte(fin + 1, fin)).toBe(false);
  });

  it.each([
    [
      'la veille du passage à l’heure d’été (mars)',
      '2027-03-27T12:00:00.000+01:00',
      '2027-04-11T22:00:00.000Z',
    ],
    [
      'la veille du passage à l’heure d’hiver (octobre)',
      '2027-10-30T12:00:00.000+02:00',
      '2027-11-14T23:00:00.000Z',
    ],
  ])('REQ-DM-004 : TÉMOIN — envoyé %s : le jour de fin ne bouge pas', (_, envoi, attendu) => {
    expect(new Date(finDeLaFenetreDeRedeclaration(paris(envoi))).toISOString()).toBe(attendu);
  });

  it('REQ-DM-004 : TÉMOIN — sur un échantillon d’heures d’envoi, la fin n’est JAMAIS avant envoi + 15 jours CIVILS', () => {
    const jours = SEUILS.FILE_FENETRE_REDECLARATION_JOURS.valeur;
    const heure = 3600 * 1000;
    const debut = paris('2027-01-01T00:00:00.000+01:00');
    for (let h = 0; h < 24 * 400; h += 7) {
      const envoi = debut + h * heure + 17 * 60 * 1000;
      const fin = finDeLaFenetreDeRedeclaration(envoi);
      const quand = new Date(envoi).toISOString();
      // En jours civils de Paris : le dernier jour ouvert est le jour d'envoi + 15, la fin est son minuit.
      const dernier = jourLimiteDeLaFenetre(fin);
      const { annee, mois, jour } = versParis(envoi);
      expect(joursDeLaDate(dernier) - joursDeLaDate({ annee, mois, jour }), quand).toBe(jours);
      expect(versParis(fin), quand).toMatchObject({
        heure: 0,
        minute: 0,
        seconde: 0,
        milliseconde: 0,
      });
      // En durée absolue : 15 jours, au plus une heure de moins quand l'heure d'été retire une heure,
      // et jamais plus d'un jour au-delà — c'est la fin du jour, pas un report.
      expect(fin - envoi, quand).toBeGreaterThan(jours * MS_PAR_JOUR - heure);
      expect(fin - envoi, quand).toBeLessThanOrEqual((jours + 1) * MS_PAR_JOUR + heure);
    }
  });

  it.each([
    [
      'le 16 mars à 23 h 17 (heure d’été en route : 15 jours moins 17 minutes)',
      '2027-03-16T23:17:00.000+01:00',
      '2027-03-31T22:00:00.000Z',
      -17,
    ],
    [
      'la veille du passage à l’heure d’hiver, à midi (15 jours plus une heure… et la fin du jour)',
      '2027-10-30T12:00:00.000+02:00',
      '2027-11-14T23:00:00.000Z',
      12 * 60 + 60,
    ],
    [
      'un jour ordinaire, à midi',
      '2027-06-10T12:00:00.000+02:00',
      '2027-06-25T22:00:00.000Z',
      12 * 60,
    ],
  ] as const)(
    'REQ-DM-004 : TÉMOIN (forme finale d’A02) — envoyé %s : dernier jour = envoi + 15 jours civils, fin à minuit (Paris) le lendemain',
    (_, envoi, fin, ecartMinutes) => {
      const e = paris(envoi);
      const f = finDeLaFenetreDeRedeclaration(e);
      expect(new Date(f).toISOString()).toBe(fin);
      expect(f - e).toBe(
        SEUILS.FILE_FENETRE_REDECLARATION_JOURS.valeur * MS_PAR_JOUR + ecartMinutes * 60 * 1000
      );
    }
  );

  it('REQ-DM-004 : la date limite affichée est le jour de (fin − 1 ms) : envoi + 15 jours, à Paris', () => {
    const fin = finDeLaFenetreDeRedeclaration(paris('2027-05-10T23:50:00.000+02:00'));
    expect(jourLimiteDeLaFenetre(fin)).toEqual({ annee: 2027, mois: 5, jour: 25 });
  });

  it('REQ-DM-004 : le fuseau des délais est nommé dans la SSOT, à côté de la durée', () => {
    expect(FUSEAU_DES_DELAIS).toBe('Europe/Paris');
  });
});

describe('REQ-UX-016 — l’entreprise nommée dans la notification (juriste)', () => {
  it('REQ-UX-016 : la raison sociale de l’attribution, telle quelle', () => {
    expect(entrepriseDeLaNotification('Société Fictive', '100000001')).toBe('Société Fictive');
  });

  it.each([null, '', '   '])(
    'REQ-UX-016 : TÉMOIN — sans raison sociale (%j), « Entreprise n° » et le numéro saisi au dépôt',
    (raisonSociale) => {
      expect(entrepriseDeLaNotification(raisonSociale, '100000001')).toBe(
        'Entreprise n° 100000001'
      );
      expect(ENTREPRISE_DE_REPLI).toBe('Entreprise n° {numeroEntreprise}');
    }
  );

  it('REQ-UX-016 : TÉMOIN — le TITRE rendu, avec le repli', () => {
    const t = rendreLaNotification('decision_attribution', {
      entreprise: entrepriseDeLaNotification(null, '100000001'),
      motif: 'x',
    });
    expect(t.titre).toBe('Entreprise n° 100000001 : une décision concerne votre dépôt');
  });

  it.each(Object.keys(LIBELLES_DES_CATEGORIES))(
    'REQ-UX-016 : TÉMOIN — la PHRASE rendue pour la catégorie %s, sans un mot du lexique interdit',
    (categorie) => {
      const motif = motifDeLaDecision({
        transition: 'annulee_par_la_console',
        raison: 'entreprise_relevant_de_l_article_3_3_bis',
        categorie: categorie as never,
      })!;
      const t = rendreLaNotification('decision_attribution', {
        entreprise: entrepriseDeLaNotification(null, '100000001'),
        motif,
      });
      expect(t.corps).toContain(
        `${LIBELLES_DES_CATEGORIES[categorie as keyof typeof LIBELLES_DES_CATEGORIES]} (contrat, article 3.3 bis)`
      );
      const rendu = [t.titre, t.appel, t.corps].join(' ');
      for (const famille of LEXIQUE_INTERDIT.filter((f) => f.portee === 'apporteur')) {
        for (const forme of famille.formes) {
          expect(motifDeLaForme(forme).test(rendu), `${famille.nom} : ${forme}`).toBe(false);
        }
      }
    }
  );
});

describe('REQ-DM-006 — le motif d’une annulation par la console, liste fermée dans la charge (forme d’A02)', () => {
  const charge = CHARGES_PAR_TYPE.attribution_etat_modifie;
  const acteur = { par: 'systeme' } as const;
  const base = { de: 'provisoire', vers: 'annulee', transition: 'annulee_par_la_console', acteur };

  it('REQ-DM-006 : la liste est FERMÉE, fixée avec la juriste, sans « autre »', () => {
    expect([...MOTIFS_ANNULATION_CONSOLE]).toEqual([
      'demande_de_l_apporteur',
      'declaration_en_double',
      'entreprise_relevant_de_l_article_3_3_bis',
      'erreur_de_saisie_de_la_societe',
    ]);
  });

  it('REQ-DM-006 : TÉMOIN — annulee_par_la_console EXIGE son motif, et un motif de la liste', () => {
    for (const motifAnnulation of MOTIFS_ANNULATION_CONSOLE) {
      const categorie =
        motifAnnulation === 'entreprise_relevant_de_l_article_3_3_bis'
          ? { categorieRelation: 'administration' }
          : {};
      expect(
        charge.safeParse({ ...base, motifAnnulation, ...categorie }).success,
        motifAnnulation
      ).toBe(true);
    }
    expect(charge.safeParse(base).success).toBe(false);
    expect(charge.safeParse({ ...base, motifAnnulation: 'autre' }).success).toBe(false);
  });

  it('REQ-DM-006 : TÉMOIN — un motif d’annulation sur une autre transition est INTERDIT', () => {
    expect(
      charge.safeParse({
        de: 'provisoire',
        vers: 'annulee',
        transition: 'annulee_par_apporteur',
        acteur,
        motifAnnulation: 'declaration_en_double',
      }).success
    ).toBe(false);
  });

  it('REQ-DM-006 : chaque motif notifiable a son libellé, et l’erreur de saisie de la Société n’en a pas', () => {
    expect(Object.keys(RAISONS_D_ANNULATION).sort()).toEqual(
      MOTIFS_ANNULATION_CONSOLE.filter((m) => m !== 'erreur_de_saisie_de_la_societe').sort()
    );
  });
});

describe('REQ-UX-016 — le courriel de la notification s’écrit dans la transaction du passage, lié à elle', () => {
  const INSTANT = new Date('2027-05-10T08:00:00.000Z');
  const ID_COURRIEL = '0190f3a0-0000-7000-8000-00000000c0c0';
  const ID_NOTIF = '0190f3a0-0000-7000-8000-00000000b0b0';
  const ID_APPORTEUR = '0190f3a0-0000-7000-8000-00000000a0a0';
  const ADRESSE = 'camille@envoi.partners.test';

  function cles() {
    const env: Record<string, string> = { NODE_ENV: 'test' };
    for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
    return clesPii(env);
  }

  function relais(): Relais & { appels: number } {
    const r = {
      appels: 0,
      async envoyer() {
        r.appels += 1;
        return { messageId: 'msg-1' };
      },
    };
    return r;
  }

  /** Un client de TRANSACTION qui enregistre : la ligne doit s'écrire sur lui, pas ailleurs. */
  function transaction(supprimees: readonly string[] = []) {
    const lignes: LigneCourriel[] = [];
    const tx = {
      courrielEnvoye: {
        create: async (q: { data: LigneCourriel }) => {
          lignes.push(q.data);
          return q.data;
        },
      },
      suppressionCourriel: {
        findUnique: async (q: { where: { emailHash: string } }) =>
          supprimees.includes(q.where.emailHash) ? { id: 'x' } : null,
      },
    };
    return { lignes, tx: tx as unknown as PrismaClient };
  }

  const dependances = (dmarcVerifie: boolean, r: Relais, c: ReturnType<typeof cles>) => ({
    configuration: { expediteur: 'camille@envoi.partners.test', dmarcVerifie },
    relais: r,
    cles: c,
    maintenant: () => INSTANT,
    nouvelId: () => ID_COURRIEL,
  });

  it('REQ-UX-016 : TÉMOIN — l’émetteur rend la ligne ENTIÈRE, avec la notification qu’elle porte', async () => {
    const c = cles();
    const t = transaction();
    const ligne = await emettre(
      {
        gabarit: 'premier_rang_libere',
        a: ADRESSE,
        sujet: 'Objet',
        corps: 'Corps',
        apporteurId: ID_APPORTEUR,
        notificationEspaceId: ID_NOTIF,
      },
      { ...dependances(true, relais(), c), depot: depotDesCourriels(t.tx) }
    );
    expect(ligne).toMatchObject({
      statut: 'envoye',
      envoyeAt: INSTANT,
      notificationEspaceId: ID_NOTIF,
    });
    expect(t.lignes).toEqual([ligne]);
  });

  it('REQ-UX-016 : sans notification, la ligne n’en porte aucune : la colonne reste nulle (les autres courriels)', async () => {
    const t = transaction();
    const ligne = await emettre(
      {
        gabarit: 'premier_rang_libere',
        a: ADRESSE,
        sujet: 'Objet',
        corps: 'Corps',
        apporteurId: null,
      },
      { ...dependances(true, relais(), cles()), depot: depotDesCourriels(t.tx) }
    );
    expect(ligne).not.toHaveProperty('notificationEspaceId');
  });

  it('REQ-UX-016 : TÉMOIN — le pont du passage écrit le courriel SUR la transaction, lié à la notification, et rend l’heure de l’envoi', async () => {
    const c = cles();
    const t = transaction();
    const r = relais();
    const envoyer = envoyerParLEmetteur(dependances(true, r, c), async () => ADRESSE);
    const n = notif(ID_NOTIF, 'premier_rang_libere', { apporteurId: ID_APPORTEUR });
    const issue = await envoyer(t.tx, n, { sujet: 'Objet', corps: 'Corps' }, INSTANT);
    expect(issue).toEqual({ statut: 'envoye', envoyeAt: INSTANT });
    expect(r.appels).toBe(1);
    expect(t.lignes).toHaveLength(1);
    expect(t.lignes[0]).toMatchObject({
      gabarit: 'premier_rang_libere',
      apporteurId: ID_APPORTEUR,
      notificationEspaceId: ID_NOTIF,
      emailHash: empreinteRecherche('courriel', ADRESSE, c),
      statut: 'envoye',
    });
  });

  it('REQ-UX-016 : TÉMOIN — retenu (DMARC non vérifié), le courriel ne part pas et ne rend AUCUNE heure : aucun délai ne court', async () => {
    const t = transaction();
    const r = relais();
    const envoyer = envoyerParLEmetteur(dependances(false, r, cles()), async () => ADRESSE);
    const issue = await envoyer(
      t.tx,
      notif(ID_NOTIF, 'premier_rang_libere', { apporteurId: ID_APPORTEUR }),
      {
        sujet: 'Objet',
        corps: 'Corps',
      },
      INSTANT
    );
    expect(issue).toEqual({ statut: 'retenu_dmarc_non_verifie', envoyeAt: null });
    expect(r.appels).toBe(0);
    expect(t.lignes[0]).toMatchObject({ notificationEspaceId: ID_NOTIF, envoyeAt: null });
  });
});

describe('REQ-DM-006 — la catégorie de l’article 3.3 bis, source fermée du motif dans la charge (forme d’A02)', () => {
  const charge = CHARGES_PAR_TYPE.attribution_etat_modifie;
  const acteur = { par: 'systeme' } as const;
  const annulation = {
    de: 'provisoire',
    vers: 'annulee',
    transition: 'annulee_par_la_console',
    acteur,
  } as const;

  it('REQ-DM-006 : la catégorie reprend l’enum de la base, un seul vocabulaire, et chaque valeur a son libellé', () => {
    expect([...MOTIFS_LISTE_NOIRE].sort()).toEqual(Object.values(MotifListeNoire).sort());
    expect(Object.keys(LIBELLES_DES_CATEGORIES).sort()).toEqual([...MOTIFS_LISTE_NOIRE].sort());
  });

  it('REQ-DM-006 : TÉMOIN — le motif de l’article 3.3 bis EXIGE sa catégorie, de la liste', () => {
    const motif = { ...annulation, motifAnnulation: 'entreprise_relevant_de_l_article_3_3_bis' };
    for (const categorieRelation of MOTIFS_LISTE_NOIRE) {
      expect(charge.safeParse({ ...motif, categorieRelation }).success, categorieRelation).toBe(
        true
      );
    }
    expect(charge.safeParse(motif).success).toBe(false);
    expect(charge.safeParse({ ...motif, categorieRelation: 'autre' }).success).toBe(false);
  });

  it('REQ-DM-006 : TÉMOIN — une catégorie sans le motif de l’article 3.3 bis est INTERDITE', () => {
    expect(
      charge.safeParse({
        ...annulation,
        motifAnnulation: 'declaration_en_double',
        categorieRelation: 'administration',
      }).success
    ).toBe(false);
  });
});

describe('REQ-UX-016 — le texte rendu depuis la base, à l’heure de l’envoi ; un non-rendu NOMMÉ (sécurité)', () => {
  const ENVOI = new Date('2027-05-10T08:00:00.000Z');
  const ATT = '0190f3a0-0000-7000-8000-0000000000a1';
  const APP = '0190f3a0-0000-7000-8000-0000000000b2';
  const AUTRE = '0190f3a0-0000-7000-8000-0000000000c3';
  const ANO = '0190f3a0-0000-7000-8000-0000000000d4';
  const console_ = { par: 'utilisateur_console', id: '0190f3a0-0000-7000-8000-0000000000e5' };
  const annulation = (motifAnnulation: string, categorieRelation?: string) => ({
    de: 'provisoire',
    vers: 'annulee',
    transition: 'annulee_par_la_console',
    acteur: console_,
    lienInteret: 'non_declare',
    motifAnnulation,
    ...(categorieRelation === undefined ? {} : { categorieRelation }),
  });
  const anomalie = {
    de: 'provisoire',
    vers: 'invalidee',
    transition: 'anomalie_confirmee',
    acteur: console_,
    lienInteret: 'non_declare',
  };

  function banc(o: {
    attribution?: {
      apporteurId: string | null;
      raisonSociale: string | null;
      siren: string;
    } | null;
    charge?: unknown;
    faits?: Awaited<ReturnType<SourcesDuRendu['faitsDe']>>;
  }) {
    const demandesDeFaits: unknown[] = [];
    const tx = {
      attribution: {
        findUnique: async () =>
          o.attribution === undefined
            ? { apporteurId: APP, raisonSociale: 'Atelier Dupont', siren: '123456789' }
            : o.attribution,
      },
    } as unknown as PrismaClient;
    const sources: SourcesDuRendu = {
      chargeDuFait: async () => (o.charge === undefined ? null : o.charge),
      faitsDe: async (_tx, q) => {
        demandesDeFaits.push(q);
        return o.faits ?? 'purgee';
      },
      composer: (_cle, t) => ({ sujet: t.titre, corps: [t.corps ?? '', t.appel].join(' | ') }),
    };
    return { tx, sources, demandesDeFaits };
  }

  const n = (cle: string, o: Partial<NotificationAEnvoyer> = {}): NotificationAEnvoyer => ({
    id: 'n1',
    cle,
    apporteurId: APP,
    attributionId: ATT,
    evenementId: '42',
    anomalieId: null,
    decisionContratId: null,
    ...o,
  });

  it('REQ-UX-016 : la phrase de la juriste quand les faits ne sont plus conservés, MOT POUR MOT, sans point final', () => {
    expect(FAITS_NON_CONSERVES).toBe(
      'les faits vous ont été indiqués dans le courriel qui vous a informé de cette décision'
    );
  });

  it('REQ-DM-004 : premier_rang_libere se rend avec l’entreprise et la date limite de l’envoi', async () => {
    const b = banc({});
    const r = await rendreDepuisLaBase(b.tx, n('premier_rang_libere'), ENVOI, b.sources);
    expect(JSON.stringify(r)).toContain('Atelier Dupont');
    expect(JSON.stringify(r)).toContain('25 mai 2027');
  });

  it('REQ-DM-006 : une annulation pour l’article 3.3 bis se rend avec sa catégorie, lue dans la charge', async () => {
    const b = banc({
      charge: annulation('entreprise_relevant_de_l_article_3_3_bis', 'financeur_public'),
    });
    const r = await rendreDepuisLaBase(b.tx, n('decision_attribution'), ENVOI, b.sources);
    expect(JSON.stringify(r)).toContain(LIBELLES_DES_CATEGORIES.financeur_public);
  });

  it('REQ-DM-006 : TÉMOIN — les faits d’une anomalie sont demandés pour CETTE attribution et CET apporteur, et rendus', async () => {
    const b = banc({ charge: anomalie, faits: { faits: 'deux dépôts le même jour' } });
    const r = await rendreDepuisLaBase(
      b.tx,
      n('decision_attribution', { anomalieId: ANO }),
      ENVOI,
      b.sources
    );
    expect(b.demandesDeFaits).toStrictEqual([
      { anomalieId: ANO, attributionId: ATT, apporteurId: APP },
    ]);
    expect(JSON.stringify(r)).toContain('deux dépôts le même jour');
  });

  it.each([
    ['purgés', ANO, 'purgee' as const],
    ['sans lien (vidé par la purge ou l’anonymisation)', null, 'purgee' as const],
  ])(
    'REQ-DM-006 : TÉMOIN — des faits %s : le courriel ne part pas, et le motif est NOMMÉ',
    async (_, anomalieId, faits) => {
      const b = banc({ charge: anomalie, faits });
      expect(
        await rendreDepuisLaBase(b.tx, n('decision_attribution', { anomalieId }), ENVOI, b.sources)
      ).toStrictEqual({ nonRendue: 'faits_non_conserves' });
    }
  );

  it('REQ-DM-006 : TÉMOIN — une anomalie que le lecteur refuse ne rend rien, nommée', async () => {
    const b = banc({ charge: anomalie, faits: 'refusee' });
    expect(
      await rendreDepuisLaBase(
        b.tx,
        n('decision_attribution', { anomalieId: ANO }),
        ENVOI,
        b.sources
      )
    ).toStrictEqual({ nonRendue: 'anomalie_refusee' });
  });

  it('REQ-DM-006 : TÉMOIN — une attribution d’un AUTRE apporteur ne rend rien, et aucun fait n’est lu', async () => {
    const b = banc({
      attribution: { apporteurId: AUTRE, raisonSociale: 'X', siren: '123456789' },
      charge: anomalie,
      faits: { faits: 'f' },
    });
    expect(
      await rendreDepuisLaBase(
        b.tx,
        n('decision_attribution', { anomalieId: ANO }),
        ENVOI,
        b.sources
      )
    ).toStrictEqual({ nonRendue: 'apporteur_different' });
    expect(b.demandesDeFaits).toStrictEqual([]);
  });

  it.each([
    ['un fait introuvable', { charge: undefined }, 'fait_introuvable'],
    ['une charge illisible', { charge: { transition: 'inventee' } }, 'charge_illisible'],
    [
      'l’erreur de saisie de la Société',
      { charge: annulation('erreur_de_saisie_de_la_societe') },
      'decision_non_notifiee',
    ],
    [
      'une attribution introuvable',
      { attribution: null, charge: anomalie },
      'attribution_introuvable',
    ],
  ])('REQ-UX-016 : %s ne rend rien, sous un motif fermé', async (_, o, motif) => {
    const b = banc(o as Parameters<typeof banc>[0]);
    expect(
      await rendreDepuisLaBase(b.tx, n('decision_attribution'), ENVOI, b.sources)
    ).toStrictEqual({ nonRendue: motif });
  });

  it('REQ-UX-016 : TÉMOIN — le passage NOMME le motif de chaque non-rendu à son bilan', async () => {
    const p: PortsDuPassage = {
      maintenant: () => ENVOI,
      lireLot: async () => [n('decision_attribution')],
      dansUneTransaction: async (fn) =>
        fn({
          verrouiller: async () => true,
          rendre: async () => ({ nonRendue: 'faits_non_conserves' }),
          envoyer: async () => ({ statut: 'envoye', envoyeAt: ENVOI }),
          poserLaFenetre: async () => undefined,
        }),
    };
    expect(await envoyerLesNotificationsDeLEspace(p)).toMatchObject({
      nonRendues: 1,
      nonRendue_faits_non_conserves: 1,
    });
  });
});

describe('REQ-UX-016 — les trois sources du rendu : la charge, les faits, la composition', () => {
  const ID_ANOMALIE = '0190f3a0-0000-7000-8000-0000000000d4';
  const ATT = '0190f3a0-0000-7000-8000-0000000000a1';
  const APP = '0190f3a0-0000-7000-8000-0000000000b2';
  const AUTRE = '0190f3a0-0000-7000-8000-0000000000c3';
  const clesDuBanc = () => {
    const env: Record<string, string> = { NODE_ENV: 'test' };
    for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
    return clesPii(env);
  };

  it('REQ-UX-016 : la charge d’un fait est lue par l’écrivain unique du journal, par son identifiant', async () => {
    const lus: unknown[] = [];
    const client = {
      evenement: {
        findUnique: async (q: unknown) => {
          lus.push(q);
          return { type: 'attribution_etat_modifie', charge: { transition: 'non_confirmee' } };
        },
      },
    } as unknown as PrismaClient;
    expect(await lireLaChargeDUnFait(client, '42')).toEqual({
      type: 'attribution_etat_modifie',
      charge: { transition: 'non_confirmee' },
    });
    expect(lus).toStrictEqual([
      { where: { id: BigInt(42) }, select: { type: true, charge: true } },
    ]);
  });

  it('REQ-UX-016 : un fait absent se lit null', async () => {
    const client = { evenement: { findUnique: async () => null } } as unknown as PrismaClient;
    expect(await lireLaChargeDUnFait(client, '7')).toBeNull();
  });

  function anomalie(c: ReturnType<typeof clesDuBanc>, o: Record<string, unknown> = {}) {
    return {
      statut: 'confirmee',
      attributionId: ATT,
      apporteurId: APP,
      anonymiseeAt: null,
      justificationChiffre: encryptPii(
        { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: ID_ANOMALIE },
        'deux dépôts le même jour',
        c
      ),
      ...o,
    };
  }
  const txAvec = (ligne: unknown) =>
    ({ anomalie: { findUnique: async () => ligne } }) as unknown as PrismaClient;
  const q = { anomalieId: ID_ANOMALIE, attributionId: ATT, apporteurId: APP };

  it('REQ-DM-006 : TÉMOIN (face admise) — l’anomalie confirmée de CETTE attribution et de CET apporteur rend ses faits', async () => {
    const c = clesDuBanc();
    expect(await lireLesFaitsPourLaNotification(txAvec(anomalie(c)), q, c)).toEqual({
      faits: 'deux dépôts le même jour',
    });
  });

  it.each([
    ['d’un autre apporteur', { apporteurId: AUTRE }],
    ['d’une autre attribution', { attributionId: AUTRE }],
    ['levée', { statut: 'levee' }],
    ['ouverte', { statut: 'ouverte' }],
  ])('REQ-DM-006 : TÉMOIN (face refusée) — une anomalie %s est refusée', async (_, o) => {
    const c = clesDuBanc();
    expect(await lireLesFaitsPourLaNotification(txAvec(anomalie(c, o)), q, c)).toBe('refusee');
  });

  it('REQ-DM-006 : une anomalie introuvable est refusée', async () => {
    expect(await lireLesFaitsPourLaNotification(txAvec(null), q, clesDuBanc())).toBe('refusee');
  });

  it('REQ-DM-006 : TÉMOIN — une justification purgée, ou une anomalie anonymisée, rend « purgee »', async () => {
    const c = clesDuBanc();
    expect(
      await lireLesFaitsPourLaNotification(
        txAvec(anomalie(c, { justificationChiffre: null })),
        q,
        c
      )
    ).toBe('purgee');
    expect(
      await lireLesFaitsPourLaNotification(
        txAvec(anomalie(c, { anonymiseeAt: new Date('2031-01-01T00:00:00.000Z') })),
        q,
        c
      )
    ).toBe('purgee');
  });

  it('REQ-DM-006 : TÉMOIN — le déchiffrement est lié à SA ligne : un bloc d’une autre anomalie est refusé', async () => {
    const c = clesDuBanc();
    const autreBloc = encryptPii(
      { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: AUTRE },
      'les faits d’une autre',
      c
    );
    expect(
      await lireLesFaitsPourLaNotification(
        txAvec(anomalie(c, { justificationChiffre: autreBloc })),
        q,
        c
      )
    ).toBe('refusee');
  });

  /** Les fichiers de src/ qui nomment le lecteur des faits, hors de sa définition. */
  const importeursFautifs = (fichiers: readonly (readonly [string, string])[]) =>
    fichiers
      .filter(([chemin]) => chemin !== 'src/server/anomalie/justification.ts')
      .filter(([, texte]) => /\blireLesFaitsPourLaNotification\b/.test(texte))
      .map(([chemin]) => chemin)
      .filter((chemin) => chemin !== 'src/server/taches/envoyer-notifications-espace.ts');
  const sourcesDe = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return sourcesDe(chemin);
      return /\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
    });

  it('REQ-DM-006 : TÉMOIN (sécurité) — seul le passage d’envoi importe le lecteur des faits', () => {
    const fichiers = sourcesDe('src').map((f) => [f, readFileSync(f, 'utf8')] as const);
    expect(importeursFautifs(fichiers)).toEqual([]);
    expect(
      fichiers.some(
        ([f, t]) =>
          f === 'src/server/taches/envoyer-notifications-espace.ts' &&
          t.includes('lireLesFaitsPourLaNotification')
      )
    ).toBe(true);
  });

  it('REQ-DM-006 : contre-témoin — un importeur de la console, de l’espace ou de la couche d’accès est NOMMÉ', () => {
    const appel = "import { lireLesFaitsPourLaNotification } from '../anomalie/justification';";
    expect(
      importeursFautifs([
        ['src/app/espace/page.tsx', appel],
        ['src/server/console/anomalies.ts', appel],
        ['src/server/acces/for-apporteur.ts', appel],
        ['src/server/taches/envoyer-notifications-espace.ts', appel],
      ])
    ).toEqual([
      'src/app/espace/page.tsx',
      'src/server/console/anomalies.ts',
      'src/server/acces/for-apporteur.ts',
    ]);
  });

  it('REQ-UX-016 : la composition du courriel est celle de notifier() — titre en sujet, corps puis appel et lien', () => {
    const url = new URL('https://espace.partners.test');
    expect(
      composerLeCourriel('premier_rang_libere', { titre: 'T', appel: 'A', corps: 'C' }, url)
    ).toEqual({ sujet: 'T', corps: 'C\n\nA : https://espace.partners.test/deposer' });
    expect(
      composerLeCourriel('decision_attribution', { titre: 'T', appel: 'A', corps: null }, url)
    ).toEqual({ sujet: 'T', corps: 'A' });
  });
});

describe('REQ-DM-004 — UNE heure par notification : le texte et la fenêtre disent la même date (juriste)', () => {
  // 23 h 59 min 59 s à Paris (heure d'été, UTC+2) : un relais qui dure deux secondes passe minuit.
  const AVANT_MINUIT = new Date('2027-05-10T21:59:59.000Z');
  const APRES_MINUIT = new Date('2027-05-10T22:00:01.000Z');

  it('REQ-DM-004 : TÉMOIN — le passage lit l’heure UNE fois par notification, et la donne au rendu ET à l’émetteur', async () => {
    const heures = [AVANT_MINUIT, APRES_MINUIT];
    let lues = 0;
    const vus: { rendu?: string; envoi?: string } = {};
    const fenetres: Date[] = [];
    const p: PortsDuPassage = {
      maintenant: () => heures[Math.min(lues++, heures.length - 1)]!,
      lireLot: async () => [notif('n1', 'premier_rang_libere')],
      dansUneTransaction: async (fn) =>
        fn({
          verrouiller: async () => true,
          rendre: async (_n, envoyeLe) => {
            vus.rendu = envoyeLe.toISOString();
            return { sujet: 's', corps: 'c' };
          },
          envoyer: async (_n, _t, envoyeLe) => {
            vus.envoi = envoyeLe.toISOString();
            return { statut: 'envoye', envoyeAt: envoyeLe };
          },
          poserLaFenetre: async (_a, finAt) => {
            fenetres.push(finAt);
          },
        }),
    };
    await envoyerLesNotificationsDeLEspace(p);
    expect(lues).toBe(1);
    expect(vus).toEqual({ rendu: AVANT_MINUIT.toISOString(), envoi: AVANT_MINUIT.toISOString() });
    // Le jour de la fenêtre est celui que le texte affiche.
    const jour = jourLimiteDeLaFenetre(fenetres[0]!.getTime());
    expect(
      parametresDeLaNotification('premier_rang_libere', { entreprise: 'E', envoyeLe: AVANT_MINUIT })
        .dateLimite
    ).toBe(`${jour.jour} ${MOIS_EN_TOUTES_LETTRES[jour.mois - 1]} ${jour.annee}`);
  });

  it('REQ-DM-004 : TÉMOIN — un relais qui dure au-delà de minuit : le courriel consigné porte l’heure DONNÉE, pas celle d’après le relais', async () => {
    let horloge = AVANT_MINUIT;
    const lignes: LigneCourriel[] = [];
    const tx = {
      courrielEnvoye: {
        create: async (q: { data: LigneCourriel }) => {
          lignes.push(q.data);
          return q.data;
        },
      },
      suppressionCourriel: { findUnique: async () => null },
    } as unknown as PrismaClient;
    const env: Record<string, string> = { NODE_ENV: 'test' };
    for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
    const envoyer = envoyerParLEmetteur(
      {
        configuration: { expediteur: 'camille@envoi.partners.test', dmarcVerifie: true },
        relais: {
          async envoyer() {
            horloge = APRES_MINUIT; // le relais « dure » : l'horloge du monde a passé minuit
            return { messageId: 'msg-1' };
          },
        },
        cles: clesPii(env),
        nouvelId: () => '0190f3a0-0000-7000-8000-00000000c0c0',
      },
      async () => 'destinataire@envoi.partners.test'
    );
    const issue = await envoyer(
      tx,
      notif('0190f3a0-0000-7000-8000-00000000b0b0', 'premier_rang_libere', {
        apporteurId: '0190f3a0-0000-7000-8000-00000000a0a0',
      }),
      { sujet: 's', corps: 'c' },
      AVANT_MINUIT
    );
    expect(horloge).toEqual(APRES_MINUIT);
    expect(issue).toEqual({ statut: 'envoye', envoyeAt: AVANT_MINUIT });
    expect(lignes[0]).toMatchObject({ demandeAt: AVANT_MINUIT, envoyeAt: AVANT_MINUIT });
  });
});

describe('REQ-DM-004 — le texte de l’espace pour premier_rang_libere : la date de la fenêtre POSÉE, ou aucune (juriste)', () => {
  const ENVOI = new Date('2027-05-10T08:00:00.000Z');

  it('REQ-DM-004 : TÉMOIN (face sans envoi) — fenêtre NULLE : aucun texte daté, aucune date nulle part', () => {
    expect(texteDuPremierRangDansLEspace('Atelier Dupont', null)).toBeNull();
  });

  it('REQ-DM-004 : TÉMOIN (face envoyée) — la date affichée est le jour de la fenêtre posée, celle que le courriel a dite', () => {
    const fin = new Date(finDeLaFenetreDeRedeclaration(ENVOI.getTime()));
    const texte = texteDuPremierRangDansLEspace('Atelier Dupont', fin);
    const duCourriel = parametresDeLaNotification('premier_rang_libere', {
      entreprise: 'Atelier Dupont',
      envoyeLe: ENVOI,
    }).dateLimite!;
    expect(duCourriel).toBe('25 mai 2027');
    expect(JSON.stringify(texte)).toContain(duCourriel);
    expect(JSON.stringify(texte)).toContain('Atelier Dupont');
  });

  it('REQ-DM-004 : la date de l’espace suit la fenêtre POSÉE, pas un recalcul : une fenêtre d’un autre jour donne son jour', () => {
    const fin = new Date('2027-06-02T22:00:00.000Z'); // minuit à Paris, le 3 juin : jour limite le 2
    expect(JSON.stringify(texteDuPremierRangDansLEspace('Atelier Dupont', fin))).toContain(
      '2 juin 2027'
    );
  });
});

describe('REQ-DM-006 — les paramètres du motif, à l’ENVOI, selon l’arbitrage de la sécurité (REQ-SEC-022)', () => {
  const ATT = '0190f3a0-0000-7000-8000-0000000000a1';
  const APP = '0190f3a0-0000-7000-8000-0000000000b2';
  const ANO = '0190f3a0-0000-7000-8000-0000000000d4';
  const acteur = { par: 'utilisateur_console', id: '0190f3a0-0000-7000-8000-0000000000e5' };
  const anomalie = {
    de: 'provisoire',
    vers: 'invalidee',
    transition: 'anomalie_confirmee',
    acteur,
    lienInteret: 'non_declare',
  };
  const banc = (
    faits: string,
    attribution = { apporteurId: APP, raisonSociale: 'Atelier Dupont', siren: '123456789' }
  ) => ({
    tx: { attribution: { findUnique: async () => attribution } } as unknown as PrismaClient,
    sources: {
      chargeDuFait: async () => anomalie,
      faitsDe: async () => ({ faits }),
      composer: (_cle: string, t: { titre: string; appel: string; corps: string | null }) => ({
        sujet: t.titre,
        corps: [t.corps ?? '', t.appel].join(' | '),
      }),
    } satisfies SourcesDuRendu,
  });
  const n = {
    cle: 'decision_attribution',
    apporteurId: APP,
    attributionId: ATT,
    evenementId: '42',
    anomalieId: ANO,
  };
  const ENVOI = new Date('2027-05-10T08:00:00.000Z');

  it('REQ-DM-006 : {raison} est FERMÉ — une raison hors de la liste est refusée', () => {
    expect(() =>
      motifDeLaDecision({ transition: 'annulee_par_la_console', raison: 'inventee' as never })
    ).toThrow(/motif_incoherent/);
  });

  it('REQ-DM-006 : {categorie} est FERMÉE — une catégorie hors de la liste est refusée, jamais un nom d’organisme', () => {
    expect(() =>
      motifDeLaDecision({
        transition: 'annulee_par_la_console',
        raison: 'entreprise_relevant_de_l_article_3_3_bis',
        categorie: 'Le Grand Organisme' as never,
      })
    ).toThrow(/motif_incoherent/);
  });

  it('REQ-DM-006 : TÉMOIN — {numeroEntreprise} a la forme fermée de neuf chiffres, sinon refusé', () => {
    expect(entrepriseDeLaNotification(null, '123456789')).toContain('123456789');
    for (const faux of ['12345678', '1234567890', '12345678A', '<b>12345</b>']) {
      expect(() => entrepriseDeLaNotification(null, faux), faux).toThrow(
        /numero_entreprise_invalide/
      );
    }
  });

  it('REQ-DM-006 : TÉMOIN — un numéro hors forme, sans raison sociale : le courriel ne part pas, motif NOMMÉ', async () => {
    const b = banc('deux dépôts le même jour', {
      apporteurId: APP,
      raisonSociale: null as never,
      siren: '12345678',
    });
    expect(await rendreDepuisLaBase(b.tx, n, ENVOI, b.sources)).toStrictEqual({
      nonRendue: 'numero_entreprise_invalide',
    });
  });

  it('REQ-DM-006 : TÉMOIN (texte piégé) — balise échappée, caractères de contrôle et retours à la ligne forcés retirés', async () => {
    const piege = '<b onclick="x()">deux</b> dépôts' + String.fromCharCode(7) + '\r\nle même\tjour';
    const b = banc(piege);
    const r = await rendreDepuisLaBase(b.tx, n, ENVOI, b.sources);
    const texte = JSON.stringify(r);
    expect(texte).toContain('&lt;b onclick=&quot;x()&quot;&gt;deux&lt;/b&gt; dépôts le même jour');
    expect(texte).not.toContain('<b');
    expect(texte).not.toContain(String.fromCharCode(7));
    expect('sujet' in r && r.corps.includes('\r')).toBe(false);
  });

  it('REQ-DM-006 : TÉMOIN (texte piégé) — un lien dans les faits : refusé, nommé', async () => {
    const b = banc('voir https://ailleurs.test/page');
    expect(await rendreDepuisLaBase(b.tx, n, ENVOI, b.sources)).toStrictEqual({
      nonRendue: 'faits_refuses',
    });
  });

  it('REQ-DM-006 : TÉMOIN — la longueur est revérifiée à l’envoi : la borne passe, un caractère de plus est refusé, jamais tronqué', async () => {
    const max = FAITS_ANOMALIE_CARACTERES_MAX.valeur;
    const pile = banc('d'.repeat(max));
    expect('sujet' in (await rendreDepuisLaBase(pile.tx, n, ENVOI, pile.sources))).toBe(true);
    const deTrop = banc('d'.repeat(max + 1));
    expect(await rendreDepuisLaBase(deTrop.tx, n, ENVOI, deTrop.sources)).toStrictEqual({
      nonRendue: 'faits_refuses',
    });
  });

  it('REQ-DM-006 : TÉMOIN — la longueur se compte en points de code : 1 000 émojis (2 000 unités UTF-16) partent entiers', async () => {
    const max = FAITS_ANOMALIE_CARACTERES_MAX.valeur;
    const emojis = String.fromCodePoint(0x1f600).repeat(max);
    expect(emojis.length).toBe(2 * max);
    const b = banc(emojis);
    const r = await rendreDepuisLaBase(b.tx, n, ENVOI, b.sources);
    expect('sujet' in r && r.corps.includes(emojis)).toBe(true);
  });

  it('REQ-DM-006 : la borne de la SSOT est celle de la juriste : 1 000, comptés en points de code', () => {
    expect(FAITS_ANOMALIE_CARACTERES_MAX.valeur).toBe(1000);
    expect(FAITS_ANOMALIE_CARACTERES_MAX.unite).toBe('points_de_code');
  });

  it('REQ-DM-006 : seul {motif} a la borne des faits : toute autre valeur garde 300 points de code', () => {
    expect(() =>
      rendreLaNotification('premier_rang_libere', {
        entreprise: 'e'.repeat(300),
        dateLimite: '25 mai 2027',
      })
    ).not.toThrow();
    expect(() =>
      rendreLaNotification('premier_rang_libere', {
        entreprise: 'e'.repeat(301),
        dateLimite: '25 mai 2027',
      })
    ).toThrow(/parametre_invalide/);
  });

  it('REQ-DM-006 : TÉMOIN (texte piégé) — un caractère de FORMAT dans les faits est retiré, le courriel part', async () => {
    const b = banc('deux' + String.fromCharCode(0x202e) + ' dépôts' + String.fromCharCode(0x200b));
    const r = await rendreDepuisLaBase(b.tx, n, ENVOI, b.sources);
    expect('sujet' in r && r.corps.includes('deux dépôts')).toBe(true);
    expect(JSON.stringify(r)).not.toContain(String.fromCharCode(0x202e));
  });

  it('REQ-DM-006 : TÉMOIN — la borne de {motif} est CALCULÉE : la borne des faits plus le plus long gabarit de motif', () => {
    const plusLong = Math.max(...Object.values(MOTIFS_DES_DECISIONS).map((t) => [...t].length));
    expect(LONGUEUR_DU_MOTIF_MAX).toBe(FAITS_ANOMALIE_CARACTERES_MAX.valeur + plusLong);
  });
});

describe('REQ-UX-016 — un non-rendu lève une alerte Telegram fermée (arbitrage de la sécurité)', () => {
  it('REQ-UX-016 : la catégorie notification_non_rendue est dans la liste fermée des alertes', async () => {
    const { CATEGORIES_ALERTE } = await import('../../../src/server/integrations/telegram/alertes');
    expect(CATEGORIES_ALERTE).toContain('notification_non_rendue');
  });

  it('REQ-UX-016 : TÉMOIN — le message ne porte que le genre, le motif fermé et un nombre : ni identifiant d’objet, ni texte', async () => {
    const { messageDAlerte } = await import('../../../src/server/integrations/telegram/alertes');
    const m = messageDAlerte('alerte', {
      categorie: 'notification_non_rendue',
      id: '0190f3a0-0000-7000-8000-0000000000aa',
      nonRendu: { motif: 'faits_refuses', nombre: 2 },
    });
    expect(m).toContain('[notification_non_rendue]');
    expect(m).toContain('non rendu faits_refuses · 2');
  });

  it('REQ-UX-016 : TÉMOIN — un motif hors de la liste fermée, ou un nombre qui n’est pas un entier, s’écrit « illisible »', async () => {
    const { messageDAlerte } = await import('../../../src/server/integrations/telegram/alertes');
    const m = messageDAlerte('alerte', {
      categorie: 'notification_non_rendue',
      id: '0190f3a0-0000-7000-8000-0000000000aa',
      nonRendu: { motif: 'deux dépôts le même jour, Jean Dupont', nombre: 1.5 },
    });
    expect(m).not.toContain('Dupont');
    expect(m).toContain('non rendu illisible · illisible');
  });

  it('REQ-UX-016 : TÉMOIN — le passage du lanceur alerte UNE fois par motif présent au bilan, avec son nombre, dans l’ordre de la liste fermée', async () => {
    const { alerterLesNonRendus } =
      await import('../../../src/server/taches/envoyer-notifications-espace');
    const alertes: unknown[] = [];
    await alerterLesNonRendus(
      {
        envoyees: 3,
        echecs: 0,
        retenues: 0,
        sautees: 0,
        nonRendues: 3,
        nonRendue_faits_refuses: 2,
        nonRendue_fait_introuvable: 1,
      },
      { alerter: async (o) => (alertes.push(o), 'envoyee') }
    );
    expect(alertes.map((a) => (a as { nonRendu: unknown }).nonRendu)).toEqual([
      { motif: 'fait_introuvable', nombre: 1 },
      { motif: 'faits_refuses', nombre: 2 },
    ]);
    expect(
      alertes.every((a) => (a as { categorie: string }).categorie === 'notification_non_rendue')
    ).toBe(true);
  });

  it('REQ-UX-016 : sans non-rendu, aucune alerte ; sans canal, aucune erreur', async () => {
    const { alerterLesNonRendus } =
      await import('../../../src/server/taches/envoyer-notifications-espace');
    const alertes: unknown[] = [];
    await alerterLesNonRendus(
      { envoyees: 1, echecs: 0, retenues: 0, sautees: 0, nonRendues: 0 },
      { alerter: async (o) => (alertes.push(o), 'envoyee') }
    );
    expect(alertes).toEqual([]);
    await expect(
      alerterLesNonRendus(
        {
          envoyees: 0,
          echecs: 0,
          retenues: 0,
          sautees: 0,
          nonRendues: 1,
          nonRendue_faits_refuses: 1,
        },
        null
      )
    ).resolves.toBeUndefined();
  });

  it('REQ-UX-016 : TÉMOIN (sécurité) — une alerte ne porte JAMAIS que { genre, motif, nombre } : l’id est un uuid frais qui ne désigne rien', async () => {
    const { alerterLesNonRendus } =
      await import('../../../src/server/taches/envoyer-notifications-espace');
    const { messageDAlerte } = await import('../../../src/server/integrations/telegram/alertes');
    const { MOTIFS_DE_NON_RENDU } = await import('../../../src/server/attribution/notifications');
    const objets: Record<string, unknown>[] = [];
    const bilan = {
      envoyees: 0,
      echecs: 0,
      retenues: 0,
      sautees: 0,
      nonRendues: 2,
      nonRendue_faits_refuses: 1,
      nonRendue_apporteur_different: 1,
    };
    await alerterLesNonRendus(bilan, {
      alerter: async (o) => (objets.push(o as never), 'envoyee'),
    });
    await alerterLesNonRendus(bilan, {
      alerter: async (o) => (objets.push(o as never), 'envoyee'),
    });
    for (const o of objets) {
      expect(Object.keys(o).sort()).toEqual(['categorie', 'id', 'nonRendu']);
      expect(Object.keys(o['nonRendu'] as object).sort()).toEqual(['motif', 'nombre']);
      expect(MOTIFS_DE_NON_RENDU).toContain((o['nonRendu'] as { motif: string }).motif);
      // Le message : la catégorie, l'objet technique, le motif fermé, le nombre — et rien d'autre.
      const message = messageDAlerte('alerte', o as never);
      const prefixe = '[notification_non_rendue] objet ';
      expect(message.startsWith(prefixe)).toBe(true);
      expect(message.slice(prefixe.length)).toMatch(/^[0-9a-f-]{36} · non rendu [a-z_]+ · [0-9]+$/);
    }
    // Un uuid FRAIS par alerte : il ne désigne aucune notification, aucune attribution, et ne se répète pas.
    const ids = objets.map((o) => o['id']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('REQ-UX-016 : TÉMOIN (sécurité) — l’id de chaque alerte diffère de tout id de notification et d’attribution du passage', async () => {
    const { alerterLesNonRendus } =
      await import('../../../src/server/taches/envoyer-notifications-espace');
    const lot = Array.from({ length: 5 }, (_, k) =>
      notif('0190f3a0-0000-7000-8000-00000000000' + k, 'decision_attribution', {
        attributionId: '0190f3a0-0000-7000-8000-00000000010' + k,
      })
    );
    const p: PortsDuPassage = {
      maintenant: () => new Date('2027-05-10T08:00:00.000Z'),
      lireLot: async () => lot,
      dansUneTransaction: async (fn) =>
        fn({
          verrouiller: async () => true,
          rendre: async () => ({ nonRendue: 'faits_refuses' as const }),
          envoyer: async () => ({ statut: 'envoye', envoyeAt: null }),
          poserLaFenetre: async () => undefined,
        }),
    };
    const bilan = await envoyerLesNotificationsDeLEspace(p);
    const objets: { id: string }[] = [];
    await alerterLesNonRendus(bilan, { alerter: async (o) => (objets.push(o), 'envoyee') });
    expect(objets.length).toBeGreaterThan(0);
    const duPassage = new Set(lot.flatMap((n) => [n.id, n.attributionId]));
    for (const o of objets) expect(duPassage.has(o.id)).toBe(false);
  });
});

describe('REQ-SEC-008 — la notification d’un courriel est HORS DE L’ESPACE (sécurité, DM-55)', () => {
  it('REQ-SEC-008 : TÉMOIN — notificationEspaceId est une référence VÉRIFIÉE : un creer() qui porte la notification d’un AUTRE apporteur est refusé, sans écriture', async () => {
    const acces = await import('../../../src/server/acces/for-apporteur');
    expect(acces.REFERENCES_CLOISONNEES.courrielEnvoye).toMatchObject({
      notificationEspaceId: 'notificationEspace',
    });
    expect(acces.CLES_REFUSEES.courrielEnvoye).toContain('notificationEspace');
    const methodes: string[] = [];
    const delegue = new Proxy(
      {},
      { get: (_c, nom) => async () => (methodes.push(String(nom)), null) }
    );
    const client = new Proxy({}, { get: () => delegue }) as never;
    let refus = '';
    try {
      // une notification qui n'est pas de la session : la lecture de vérification ne la trouve pas
      const donnees = { notificationEspaceId: '0190f3a0-0000-7000-8000-0000000000b2' };
      await acces
        .forApporteur(client, '0190f3a0-0000-7000-8000-0000000000a1')
        .courrielEnvoye.creer(donnees as never);
    } catch (e) {
      refus = (e as Error).message;
    }
    expect(refus).toBe(acces.REFUS.reference);
    expect(methodes).not.toContain('create');
  });

  /** Les fichiers de la couche de l'espace qui ÉCRIVENT un courriel (creer ou modifier). */
  const ecrivainsDeCourriel = (fichiers: readonly (readonly [string, string])[]) =>
    fichiers
      .filter(([, texte]) => /courrielEnvoye\s*\.\s*(creer|modifier)\b/.test(texte))
      .map(([chemin]) => chemin);
  const sourcesDe = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return sourcesDe(chemin);
      return /\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
    });

  it('REQ-SEC-008 : TÉMOIN (statique) — aucun fichier de la couche de l’espace n’écrit courrielEnvoye', () => {
    // Les deux arbres que vise la règle semgrep de l'espace ; un arbre pas encore créé n'a rien à lire.
    const fichiers = ['src/app/(espace)', 'src/server/espace']
      .filter((d) => existsSync(d))
      .flatMap((d) => sourcesDe(d))
      .map((f) => [f, readFileSync(f, 'utf8')] as const);
    expect(fichiers.length).toBeGreaterThan(0);
    expect(ecrivainsDeCourriel(fichiers)).toEqual([]);
  });

  it('REQ-SEC-008 : contre-témoin — un écrivain de courriel dans l’espace est NOMMÉ', () => {
    expect(
      ecrivainsDeCourriel([
        ['src/server/espace/a.ts', 'await acces.courrielEnvoye.creer({ gabarit: g });'],
        ['src/server/espace/b.ts', 'await acces.courrielEnvoye\n  .modifier(id, {});'],
        ['src/server/espace/c.ts', 'const l = await acces.courrielEnvoye.lister();'],
      ])
    ).toEqual(['src/server/espace/a.ts', 'src/server/espace/b.ts']);
  });

  it('REQ-SEC-008 : TÉMOIN (statique) — le passage d’envoi, le rendu et le lecteur des faits n’importent PAS le journal applicatif', () => {
    for (const f of [
      'src/server/taches/envoyer-notifications-espace.ts',
      'src/server/attribution/notifications.ts',
      'src/server/anomalie/justification.ts',
    ]) {
      const texte = readFileSync(f, 'utf8');
      expect(texte.includes('lib/logger'), f).toBe(false);
      expect(texte, f).not.toMatch(/creerJournal/);
    }
  });
});

describe('REQ-DM-041 — la relation faitDuJournal n’est jamais employée par le code (condition d’A02)', () => {
  /**
   * Les fautes d'un jeu de fichiers : une ÉCRITURE par la relation (`faitDuJournal:` comme clé
   * d'objet, imbriquée ou non) partout, et toute mention hors de la seule déclaration permise — les
   * listes de cloisonnement de la couche d'accès, qui la nomment en chaîne pour la REFUSER.
   */
  const MENTION_PERMISE = 'src/server/acces/for-apporteur.ts';
  const fautes = (fichiers: readonly (readonly [string, string])[]) =>
    fichiers.flatMap(([chemin, texte]) => {
      const f: string[] = [];
      if (/faitDuJournal\s*:/.test(texte)) f.push(`${chemin} : écriture par la relation`);
      const nu = texte.split("'faitDuJournal'").join('');
      if (/faitDuJournal/.test(chemin === MENTION_PERMISE ? nu : texte)) {
        f.push(`${chemin} : mention de la relation`);
      }
      return f;
    });
  const sources = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return sources(chemin);
      return /\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
    });

  it('REQ-DM-041 : TÉMOIN — dans src/, faitDuJournal n’est jamais écrit ni employé ; le code passe par evenementId', () => {
    expect(fautes(sources('src').map((f) => [f, readFileSync(f, 'utf8')] as const))).toEqual([]);
  });

  it('REQ-DM-041 : contre-témoin — une écriture imbriquée dans le journal par la relation est NOMMÉE', () => {
    expect(
      fautes([
        [
          'src/server/factice.ts',
          'await tx.notificationEspace.create({ data: { faitDuJournal: { create: {} } } });',
        ],
        ['src/server/autre.ts', 'const r = n.faitDuJournal;'],
        [MENTION_PERMISE, "const refusees = ['faitDuJournal'];"],
      ])
    ).toEqual([
      'src/server/factice.ts : écriture par la relation',
      'src/server/factice.ts : mention de la relation',
      'src/server/autre.ts : mention de la relation',
    ]);
  });
});

describe('REQ-JUR-007 — l’annulation pour antériorité part par le passage (DM-25)', () => {
  it('REQ-JUR-007 : TÉMOIN — ses paramètres de rendu sont l’entreprise SEULE ; le délai vient de la SSOT, posé par l’envoi', () => {
    expect(
      parametresDeLaNotification('attribution_annulee_anteriorite', {
        entreprise: 'Atelier Dupont',
        envoyeLe: MAINTENANT,
      })
    ).toEqual({ entreprise: 'Atelier Dupont' });
  });
});

describe('REQ-EXT-020 — la prolongation part par le passage (EXT-T07)', () => {
  it('REQ-EXT-020 : TÉMOIN — ses paramètres sont l’entreprise et le nouveau terme ; sans terme, rien ne se rend', () => {
    expect(
      parametresDeLaNotification('attribution_prolongee', {
        entreprise: 'Atelier Dupont',
        date: '2 février 2027',
        envoyeLe: MAINTENANT,
      })
    ).toEqual({ entreprise: 'Atelier Dupont', date: '2 février 2027' });
    expect(() =>
      parametresDeLaNotification('attribution_prolongee', {
        entreprise: 'Atelier Dupont',
        envoyeLe: MAINTENANT,
      })
    ).toThrow(/date_manquante/);
  });
});
