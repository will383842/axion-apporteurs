// @req REQ-UX-047
// @req REQ-UX-016
// @req REQ-JUR-006
/**
 * UX-P1-59 — l'espace de l'apporteur affiche `mise_en_demeure` et `resiliation` (SEC-19), que le
 * lecteur d'UX-P1-54 écartait encore (rattrapage 114a).
 *
 * CE QU'IL PROUVE (conditions de la sécurité, #726, 5984213408) :
 *   1. le lecteur ne rend QUE les trois clés `premier_rang_libere`, `mise_en_demeure`, `resiliation` ;
 *   2. la décision est lue par un lecteur RÉSERVÉ, l'apporteur de la session DANS LE `where` : la
 *      décision d'un autre apporteur n'est jamais déchiffrée, la notification est écartée ;
 *   3. le texte affiché est celui du gabarit de la juriste (`rendreLaNotification`) ; l'écran ne
 *      reçoit que six champs de texte, jamais l'auteur de la décision ni un identifiant d'employé ;
 *   4. les faits passent le même nettoyage et la même borne qu'à l'envoi, SANS l'échappement HTML du
 *      courriel ; un `<script>` dans les faits s'affiche comme du texte (React échappe) ;
 *   5. rien des faits ne sort vers un journal (témoin MARQUEUR) ;
 *   6. un résilié en `lecture` ouvre `/notifications` et y voit sa résiliation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EcranNotifications } from '../../../src/app/(espace)/notifications/ecran';
import { routeOuverte, niveauDAcces } from '../../../src/domain/apporteur/acces-espace';
import { FAITS_ANOMALIE_CARACTERES_MAX } from '../../../src/domain/seuils/ssot';
import { MODELE_DECISION_DE_CONTRAT } from '../../../src/server/apporteur/resiliation';
import { CHAMPS_PII, encryptPii, type ClesPii } from '../../../src/server/securite/pii';
import { PARAMETRES_DE_LA_SSOT } from '../../../src/server/notifications/envoyer';
import {
  CLES_RENDUES_DANS_L_ESPACE,
  faitsPourLEcran,
  notificationsDeLEspace,
  type ClientDesNotifications,
} from '../../../src/server/notifications/notifications-de-l-espace';

const MOI = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTRE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EMPLOYE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DECISION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MARQUEUR = 'MARQUEUR-UXP159-FAITS';

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
async function clesDeTest(): Promise<ClesPii> {
  const { clesPii } = await import('../../../src/server/securite/pii');
  const { NOMS_DES_SECRETS } = await import('../../../src/lib/env');
  return clesPii({
    NODE_ENV: 'test',
    ...Object.fromEntries(
      NOMS_DES_SECRETS.map((n) => [n, `temoin-ux-p1-59-${n.toLowerCase()}-`.padEnd(48, '0')])
    ),
    PII_ENCRYPTION_KEY: 'f'.repeat(64),
  });
}

type Decision = {
  id: string;
  apporteurId: string;
  geste: 'mise_en_demeure' | 'resiliation';
  article: string | null;
  texteChiffre: Uint8Array | null;
  dateReception: Date | null;
  dateEffet: Date | null;
  evenementId: bigint;
  textePurgeAt: Date | null;
  acteurId: string;
};

type Notification = {
  id: string;
  apporteurId: string;
  cle: string;
  creeAt: Date;
  evenementId: bigint | null;
  decisionContratId: string | null;
  attribution: null;
};

/** Un faux client : il applique le `where` reçu, et garde la trace de chaque lecture de décision. */
function client(
  notifications: Notification[],
  decisions: Decision[],
  evenements: Record<string, { type: string; charge: unknown }>
) {
  const lecturesDeDecision: Array<{ where: Record<string, unknown> }> = [];
  const c = {
    notificationEspace: {
      findMany: async (args: { where: { apporteurId: string; cle: { in: string[] } } }) =>
        notifications.filter(
          (n) => n.apporteurId === args.where.apporteurId && args.where.cle.in.includes(n.cle)
        ),
    },
    decisionDeContrat: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        lecturesDeDecision.push(args);
        return (
          decisions.find((d) =>
            Object.entries(args.where).every(([k, v]) => (d as Record<string, unknown>)[k] === v)
          ) ?? null
        );
      },
    },
    evenement: {
      findUnique: async (args: { where: { id: bigint } }) =>
        evenements[String(args.where.id)] ?? null,
    },
  } as unknown as ClientDesNotifications;
  return { c, lecturesDeDecision };
}

const quand = new Date('2027-06-01T08:00:00.000Z');

async function miseEnDemeure(faits: string, apporteurId = MOI) {
  const cles = await clesDeTest();
  const decision: Decision = {
    id: DECISION,
    apporteurId,
    geste: 'mise_en_demeure',
    article: '7.2',
    texteChiffre: encryptPii(
      { modele: MODELE_DECISION_DE_CONTRAT, champ: CHAMPS_PII.texte.chiffre, id: DECISION },
      faits,
      cles
    ),
    dateReception: null,
    dateEffet: null,
    evenementId: 41n,
    textePurgeAt: null,
    acteurId: EMPLOYE,
  };
  const notification: Notification = {
    id: '1',
    apporteurId: MOI,
    cle: 'mise_en_demeure',
    creeAt: quand,
    evenementId: 41n,
    decisionContratId: DECISION,
    attribution: null,
  };
  return { cles, decision, notification };
}

afterEach(() => vi.restoreAllMocks());

describe('REQ-UX-016 — l’espace rend mise_en_demeure et resiliation (UX-P1-59)', () => {
  it('REQ-UX-016 : les clés rendues sont EXACTEMENT premier_rang_libere, mise_en_demeure et resiliation', () => {
    expect([...CLES_RENDUES_DANS_L_ESPACE].sort()).toEqual(
      ['mise_en_demeure', 'premier_rang_libere', 'resiliation'].sort()
    );
  });

  it('REQ-JUR-006 : la mise en demeure s’affiche avec le gabarit de la juriste, l’article et les faits', async () => {
    const { cles, decision, notification } = await miseEnDemeure('Trois dépôts sans accord.');
    const { c } = client([notification], [decision], {});
    const [n] = await notificationsDeLEspace(c, MOI, { cles });
    expect(n?.titre).toBe('Mise en demeure de remédier à un manquement au contrat');
    expect(n?.corps).toContain("à l'article 7.2 du contrat : Trois dépôts sans accord.");
    expect(n?.corps).toContain(PARAMETRES_DE_LA_SSOT.delaiMiseEnDemeure!);
    expect(n?.route).toBe('/mes-entreprises');
  });

  it('REQ-JUR-006 : TÉMOIN — la décision est lue avec l’apporteur de la SESSION dans le where', async () => {
    const { cles, decision, notification } = await miseEnDemeure('Faits.');
    const { c, lecturesDeDecision } = client([notification], [decision], {});
    await notificationsDeLEspace(c, MOI, { cles });
    expect(lecturesDeDecision).toHaveLength(1);
    expect(lecturesDeDecision[0]!.where).toMatchObject({ id: DECISION, apporteurId: MOI });
  });

  it('REQ-JUR-006 : TÉMOIN à deux faces — la décision d’un AUTRE apporteur n’est pas rendue', async () => {
    const autre = await miseEnDemeure('Faits d’un autre.', AUTRE);
    const { c } = client([autre.notification], [autre.decision], {});
    expect(await notificationsDeLEspace(c, MOI, { cles: autre.cles })).toEqual([]);
    const mienne = await miseEnDemeure('Mes faits.');
    const r = client([mienne.notification], [mienne.decision], {});
    expect(await notificationsDeLEspace(r.c, MOI, { cles: mienne.cles })).toHaveLength(1);
  });

  it('REQ-JUR-006 : l’écran ne reçoit que six champs, jamais l’auteur de la décision', async () => {
    const { cles, decision, notification } = await miseEnDemeure('Faits.');
    const { c } = client([notification], [decision], {});
    const [n] = await notificationsDeLEspace(c, MOI, { cles });
    expect(Object.keys(n!).sort()).toEqual(['appel', 'corps', 'id', 'quand', 'route', 'titre']);
    expect(JSON.stringify(n)).not.toContain(EMPLOYE);
    expect(JSON.stringify(n)).not.toContain(DECISION);
  });

  it('REQ-JUR-006 : sans clés de déchiffrement, la notification du contrat n’est pas rendue (échec fermé)', async () => {
    const { decision, notification } = await miseEnDemeure('Faits.');
    const { c } = client([notification], [decision], {});
    expect(await notificationsDeLEspace(c, MOI)).toEqual([]);
  });

  it.todo('REQ-JUR-006 : des faits purgés donnent le texte FERMÉ (question 1 posée sur #620)');
});

describe('REQ-UX-047 — les faits à l’écran : même nettoyage, même borne, sans échappement HTML', () => {
  it('REQ-UX-047 : nettoyés comme à l’envoi, et non échappés', () => {
    expect(faitsPourLEcran('  deux\n\tlignes  ')).toBe('deux lignes');
    expect(faitsPourLEcran('a & b < c')).toBe('a & b < c');
  });

  it('REQ-UX-047 : au-delà de la borne en POINTS DE CODE, rien ne s’affiche — jamais tronqué', () => {
    const max = FAITS_ANOMALIE_CARACTERES_MAX.valeur;
    expect(faitsPourLEcran('é'.repeat(max))).toBe('é'.repeat(max));
    expect(faitsPourLEcran('😀'.repeat(max + 1))).toBeNull();
    expect(faitsPourLEcran('   ')).toBeNull();
  });

  it('REQ-UX-047 : TÉMOIN à deux faces — un <script> dans les faits s’affiche comme du texte', async () => {
    const { cles, decision, notification } = await miseEnDemeure('<script>alert(1)</script>');
    const { c } = client([notification], [decision], {});
    const rendues = await notificationsDeLEspace(c, MOI, { cles });
    expect(rendues[0]?.corps).toContain('<script>alert(1)</script>');
    const html = renderToStaticMarkup(
      createElement(EcranNotifications, { notifications: rendues })
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('&amp;lt;');
  });

  it('REQ-UX-047 : TÉMOIN MARQUEUR — les faits ne sortent vers aucun journal', async () => {
    const sorties = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined)
    );
    const { cles, decision, notification } = await miseEnDemeure(MARQUEUR);
    const { c } = client([notification], [decision], {});
    await notificationsDeLEspace(c, MOI, { cles });
    for (const s of sorties) expect(JSON.stringify(s.mock.calls)).not.toContain(MARQUEUR);
  });
});

describe('REQ-UX-016 — la résiliation, vue par le résilié en lecture', () => {
  const resiliation = async () => {
    const cles = await clesDeTest();
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const decision: Decision = {
      id,
      apporteurId: MOI,
      geste: 'resiliation',
      article: null,
      texteChiffre: null,
      dateReception: new Date('2027-05-02T00:00:00.000Z'),
      dateEffet: new Date('2027-08-02T00:00:00.000Z'),
      evenementId: 52n,
      textePurgeAt: null,
      acteurId: EMPLOYE,
    };
    const notification: Notification = {
      id: '2',
      apporteurId: MOI,
      cle: 'resiliation',
      creeAt: quand,
      evenementId: 52n,
      decisionContratId: id,
      attribution: null,
    };
    const evenements = {
      '52': {
        type: 'apporteur_statut_modifie',
        charge: {
          de: 'signe',
          vers: 'resilie',
          transition: 'resilier',
          resiliationMotif: 'ordinaire_apporteur',
          acteur: { par: 'utilisateur_console', id: EMPLOYE },
        },
      },
    };
    return { cles, decision, notification, evenements };
  };

  it('REQ-UX-016 : la résiliation s’affiche avec le paragraphe de son motif, lu dans la charge de son événement', async () => {
    const { cles, decision, notification, evenements } = await resiliation();
    const { c } = client([notification], [decision], evenements);
    const [n] = await notificationsDeLEspace(c, MOI, { cles });
    expect(n?.titre).toBe("Fin de votre contrat d'apporteur");
    expect(n?.corps).toContain('votre décision de résilier le contrat');
    expect(n?.route).toBe('/mes-commissions');
  });

  it('REQ-UX-016 : TÉMOIN — un résilié en `lecture` ouvre /notifications (SEGMENTS_LECTURE)', () => {
    expect(niveauDAcces('resilie', true)).toBe('lecture');
    expect(routeOuverte('lecture', 'notifications')).toBe(true);
  });
});
