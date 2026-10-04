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
import { FUSEAU_DES_DELAIS, SEUILS, TAILLES_DE_LOT } from '../../../src/domain/seuils/ssot';
import {
  fenetreOuverte,
  finDeLaFenetreDeRedeclaration,
  jourLimiteDeLaFenetre,
} from '../../../src/domain/attribution/fenetre-redeclaration';
import { MS_PAR_JOUR, joursDeLaDate } from '../../../src/domain/temps/calendrier-civil';
import { versParis } from '../../../src/domain/temps/paris';
import { readdirSync, readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { GABARITS } from '../../../src/server/notifications/table-ssot';
import {
  dateEnClair,
  motifDeLaDecision,
  parametresDeLaNotification,
} from '../../../src/server/attribution/notifications';
import { MOTIFS_DES_DECISIONS } from '../../../src/content/micro-copy/courriels/notifications';
import {
  CLES_ENVOYEES_PAR_LE_PASSAGE,
  envoyerLesNotificationsDeLEspace,
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
          if ((o.sansTexte ?? []).includes(n.id)) return null;
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
    });
    expect(t.envoyes).toEqual([]);
  });

  it('REQ-UX-016 : un texte qui ne se rend pas (paramètre manquant) lève : rien n’est tu', async () => {
    const t = ports([notif('n1', 'decision_attribution')], { sansTexte: ['n1'] });
    await expect(envoyerLesNotificationsDeLEspace(t.p)).rejects.toThrow(/texte_introuvable/);
    expect(t.envoyes).toEqual([]);
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
      select: { id: true, cle: true, apporteurId: true, attributionId: true, evenementId: true },
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
      'Financeur public',
      'Financeur public (contrat, article 3.3 bis), situation qui existait déjà à la date de votre dépôt',
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

  it('REQ-DM-004 : la date limite affichée est le jour de (fin − 1 ms) : envoi + 15 jours, à Paris', () => {
    const fin = finDeLaFenetreDeRedeclaration(paris('2027-05-10T23:50:00.000+02:00'));
    expect(jourLimiteDeLaFenetre(fin)).toEqual({ annee: 2027, mois: 5, jour: 25 });
  });

  it('REQ-DM-004 : le fuseau des délais est nommé dans la SSOT, à côté de la durée', () => {
    expect(FUSEAU_DES_DELAIS).toBe('Europe/Paris');
  });
});
