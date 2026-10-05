// @req REQ-UX-016
// @req REQ-UX-047
/**
 * UX-P1-58 — l'espace de l'apporteur affiche `decision_attribution` et son motif. Ce fichier juge
 * d'abord le LECTEUR DÉDIÉ des faits d'une anomalie pour l'espace (sécurité, #726, 5984281779,
 * voie (b)) : un lecteur par usage, avec son propre témoin « seul appelant ».
 *
 * - L'acteur est l'apporteur de la SESSION, jamais un identifiant de la requête : le triplet
 *   anomalie, attribution et apporteur est rejugé ; une anomalie d'un autre apporteur rend
 *   `refusee`, sans rien déchiffrer.
 * - Seules les faits d'une anomalie CONFIRMÉE, liée à SA notification `decision_attribution`, sont
 *   rendus ; purgée ou anonymisée, elle rend `purgee`.
 * - Le lecteur du passage d'envoi garde son témoin, inchangé ; aucun troisième appelant.
 * - Rien du contenu n'est journalisé.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { FAITS_ANOMALIE_CARACTERES_MAX } from '../../../src/domain/seuils/ssot';
import {
  ETATS_ATTRIBUTION,
  TRANSITIONS_ATTRIBUTION,
  type TransitionAttribution,
} from '../../../src/domain/attribution/machine';
import { NOTIFICATIONS } from '../../../src/content/micro-copy/espace/notifications';
import type { TexteRendu } from '../../../src/server/notifications/envoyer';
import { GABARITS } from '../../../src/server/notifications/table-ssot';
import {
  entrepriseDeLaNotification,
  rendreDepuisLaBase,
  texteDeLaDecisionDansLEspace,
} from '../../../src/server/attribution/notifications';
import {
  notificationsDeLEspace,
  type ClientDesNotifications,
} from '../../../src/server/notifications/notifications-de-l-espace';
import { EcranNotifications } from '../../../src/app/(espace)/notifications/ecran';
import { clesPii, encryptPii } from '../../../src/server/securite/pii';
import {
  MODELE_DE_LA_JUSTIFICATION,
  lireLesFaitsPourLEspace,
  type ClientDesFaitsDeLEspace,
} from '../../../src/server/anomalie/justification';

const NOTIF = '0190f3a0-0000-7000-8000-0000000000e5';
const ANOMALIE = '0190f3a0-0000-7000-8000-0000000000d4';
const ATT = '0190f3a0-0000-7000-8000-0000000000a1';
const APP = '0190f3a0-0000-7000-8000-0000000000b2';
const AUTRE = '0190f3a0-0000-7000-8000-0000000000c3';
const MARQUEUR = 'MARQUEUR-FAITS-ESPACE-58';

const clesDuBanc = () => {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  return clesPii(env);
};
const CLES = clesDuBanc();

type Notification = {
  apporteurId: string;
  cle: string;
  attributionId: string | null;
  anomalieId: string | null;
};
type Anomalie = {
  statut: string;
  attributionId: string;
  apporteurId: string;
  anonymiseeAt: Date | null;
  justificationChiffre: Uint8Array | null;
};

const notification = (o: Partial<Notification> = {}): Notification => ({
  apporteurId: APP,
  cle: 'decision_attribution',
  attributionId: ATT,
  anomalieId: ANOMALIE,
  ...o,
});
const anomalie = (o: Partial<Anomalie> = {}): Anomalie => ({
  statut: 'confirmee',
  attributionId: ATT,
  apporteurId: APP,
  anonymiseeAt: null,
  justificationChiffre: encryptPii(
    { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: ANOMALIE },
    `deux dépôts le même jour ${MARQUEUR}`,
    CLES
  ),
  ...o,
});

/** Un faux client : la notification et l'anomalie lues, et chaque lecture consignée. */
function client(n: Notification | null, a: Anomalie | null) {
  const lectures: { table: string; args: unknown }[] = [];
  const c = {
    notificationEspace: {
      findUnique: async (args: unknown) => {
        lectures.push({ table: 'notificationEspace', args });
        return n;
      },
    },
    anomalie: {
      findUnique: async (args: unknown) => {
        lectures.push({ table: 'anomalie', args });
        return a;
      },
    },
  } as unknown as ClientDesFaitsDeLEspace;
  return { c, lectures };
}
const lire = (n: Notification | null, a: Anomalie | null, apporteurId = APP) =>
  lireLesFaitsPourLEspace(client(n, a).c, { notificationId: NOTIF, apporteurId }, CLES);

afterEach(() => vi.restoreAllMocks());

describe('REQ-UX-016 — le lecteur dédié de l’espace : les faits de SA décision, et rien d’autre', () => {
  it('REQ-UX-016 : TÉMOIN face admise — l’anomalie confirmée de SA notification rend ses faits', async () => {
    const { c, lectures } = client(notification(), anomalie());
    expect(
      await lireLesFaitsPourLEspace(c, { notificationId: NOTIF, apporteurId: APP }, CLES)
    ).toEqual({ faits: `deux dépôts le même jour ${MARQUEUR}` });
    expect(lectures[0]).toEqual({
      table: 'notificationEspace',
      args: {
        where: { id: NOTIF },
        select: { apporteurId: true, cle: true, attributionId: true, anomalieId: true },
      },
    });
    expect(lectures[1]!.args).toMatchObject({ where: { id: ANOMALIE } });
  });

  it('REQ-UX-016 : TÉMOIN — la notification d’un AUTRE apporteur rend `refusee`, sans lire l’anomalie', async () => {
    const { c, lectures } = client(notification({ apporteurId: AUTRE }), anomalie());
    expect(
      await lireLesFaitsPourLEspace(c, { notificationId: NOTIF, apporteurId: APP }, CLES)
    ).toBe('refusee');
    expect(lectures.map((l) => l.table)).toEqual(['notificationEspace']);
    expect(await lire(null, anomalie())).toBe('refusee');
  });

  it('REQ-UX-016 : une autre clé que `decision_attribution`, ou une notification sans attribution, rend `refusee`', async () => {
    expect(await lire(notification({ cle: 'premier_rang_libere' }), anomalie())).toBe('refusee');
    expect(await lire(notification({ attributionId: null }), anomalie())).toBe('refusee');
  });

  it('REQ-UX-016 : TÉMOIN — une anomalie d’un autre apporteur, d’une autre attribution ou non confirmée rend `refusee`, sans rien déchiffrer', async () => {
    let lu = false;
    const piegee = (o: Partial<Anomalie>): Anomalie => {
      const a = anomalie(o);
      Object.defineProperty(a, 'justificationChiffre', {
        get: () => {
          lu = true;
          return null;
        },
      });
      return a;
    };
    for (const o of [
      { apporteurId: AUTRE },
      { attributionId: AUTRE },
      { statut: 'ouverte' },
      { statut: 'levee' },
    ]) {
      expect(await lire(notification(), piegee(o)), JSON.stringify(o)).toBe('refusee');
    }
    expect(lu).toBe(false);
    expect(await lire(notification(), null)).toBe('refusee');
  });

  it('REQ-UX-016 : TÉMOIN — purgée, anonymisée, ou détachée de la notification, l’anomalie rend `purgee`', async () => {
    expect(await lire(notification(), anomalie({ justificationChiffre: null }))).toBe('purgee');
    expect(await lire(notification(), anomalie({ anonymiseeAt: new Date(0) }))).toBe('purgee');
    expect(await lire(notification({ anomalieId: null }), anomalie())).toBe('purgee');
  });

  it('REQ-UX-016 : un bloc qui ne se déchiffre pas sous la donnée authentifiée de SA ligne rend `refusee`', async () => {
    const ailleurs = encryptPii(
      { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: AUTRE },
      'faits d’une autre ligne',
      CLES
    );
    expect(await lire(notification(), anomalie({ justificationChiffre: ailleurs }))).toBe(
      'refusee'
    );
  });

  it('REQ-UX-016 : TÉMOIN MARQUEUR — le lecteur ne consigne rien du contenu', async () => {
    const sorties: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void sorties.push(a));
    await lire(notification(), anomalie());
    await lire(notification(), anomalie({ apporteurId: AUTRE }));
    expect(JSON.stringify(sorties)).not.toContain(MARQUEUR);
  });
});

const sourcesDe = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = `${dossier}/${e.name}`;
    if (e.isDirectory()) return sourcesDe(chemin);
    return /\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
  });

describe('REQ-UX-016 — un lecteur, un appelant (sécurité, voie (b))', () => {
  const fichiers = sourcesDe('src').map((f) => [f, readFileSync(f, 'utf8')] as const);

  it('REQ-UX-016 : TÉMOIN — seul le lecteur des notifications de l’espace appelle le lecteur dédié', () => {
    const appelants = fichiers
      .filter(([f]) => f !== 'src/server/anomalie/justification.ts')
      .filter(([, t]) => /\blireLesFaitsPourLEspace\b/.test(t))
      .map(([f]) => f);
    expect(appelants).toEqual(['src/server/notifications/notifications-de-l-espace.ts']);
  });

  it('REQ-UX-016 : aucun module de l’écran de l’espace n’importe la justification directement', () => {
    const fautifs = fichiers
      .filter(([f]) => f.startsWith('src/app/(espace)/'))
      .filter(([, t]) => /anomalie\/justification/.test(t))
      .map(([f]) => f);
    expect(fautifs).toEqual([]);
  });
});

// ── le rendu de `decision_attribution` dans l'espace ────────────────────────────────────────────

const ENTREPRISE_BRUTE = { raisonSociale: 'Boulangerie Exemple', siren: '732829320' };
/** Une charge VALIDE du fait : `de` et `vers` dérivés de la machine, jamais recopiés. */
const charge = (transition: string) => {
  const de = ETATS_ATTRIBUTION.find(
    (e) => TRANSITIONS_ATTRIBUTION[e][transition as TransitionAttribution] !== undefined
  )!;
  return {
    de,
    vers: TRANSITIONS_ATTRIBUTION[de][transition as TransitionAttribution],
    transition,
    acteur: { par: 'utilisateur_console', id: '0190f3a0-0000-7000-8000-0000000000f6' },
    lienInteret: 'non_declare',
  };
};

/** Le texte que le COURRIEL rend pour la même décision, capté à la composition. */
async function texteDuCourriel(faits: string): Promise<TexteRendu> {
  let capte: TexteRendu | null = null;
  const tx = {
    attribution: {
      findUnique: async () => ({ apporteurId: APP, ...ENTREPRISE_BRUTE }),
    },
  } as unknown as Prisma.TransactionClient;
  const rendu = await rendreDepuisLaBase(
    tx,
    {
      cle: 'decision_attribution',
      apporteurId: APP,
      attributionId: ATT,
      evenementId: '42',
      anomalieId: ANOMALIE,
    },
    new Date('2026-10-05T08:00:00.000Z'),
    {
      chargeDuFait: async () => charge('anomalie_confirmee'),
      faitsDe: async () => ({ faits }),
      composer: (_cle, texte) => {
        capte = texte;
        return { sujet: texte.titre, corps: texte.corps ?? '' };
      },
    }
  );
  expect(rendu).not.toHaveProperty('nonRendue');
  return capte!;
}
const entreprise = entrepriseDeLaNotification(
  ENTREPRISE_BRUTE.raisonSociale,
  ENTREPRISE_BRUTE.siren
);

describe('REQ-UX-016 — l’espace rend la MÊME décision que le courriel, et les faits purgés par le texte de la juriste', () => {
  it('REQ-UX-016 : TÉMOIN — avec des faits présents, l’espace et le courriel rendent la même chaîne', async () => {
    const faits = 'deux dépôts le même jour';
    expect(
      texteDeLaDecisionDansLEspace(entreprise, charge('anomalie_confirmee'), { faits })
    ).toEqual(await texteDuCourriel(faits));
  });

  it('REQ-UX-016 : TÉMOIN — avec des faits purgés, l’espace rend EXACTEMENT la phrase de la juriste, et le reste du motif', () => {
    const t = texteDeLaDecisionDansLEspace(entreprise, charge('anomalie_confirmee'), 'purgee');
    expect(t).not.toBeNull();
    expect(NOTIFICATIONS.faitsNonConserves).toBe(
      "Faits retenus : leur détail n'est plus conservé, sa durée de conservation ayant pris fin"
    );
    expect(t!.corps).toContain(
      "À la vérification, ce dépôt ne remplit pas les conditions de l'article 3.7 du contrat. " +
        NOTIFICATIONS.faitsNonConserves
    );
    expect(t!.corps).not.toContain('{faits}');
    expect(t!.corps).not.toContain('Faits retenus : .');
  });

  it('REQ-UX-016 : TÉMOIN à deux faces — un <script> dans les faits s’affiche comme du TEXTE, échappé une fois', () => {
    const faits = '<script>alert(1)</script> & co';
    const t = texteDeLaDecisionDansLEspace(entreprise, charge('anomalie_confirmee'), { faits });
    // Face 1 : le texte rendu n'est PAS échappé pour le HTML (le courriel l'est, l'écran non).
    expect(t!.corps).toContain('<script>alert(1)</script> & co');
    // Face 2 : à l'écran, React l'échappe une seule fois.
    const html = renderToStaticMarkup(
      createElement(EcranNotifications, {
        notifications: [
          {
            id: NOTIF,
            titre: t!.titre,
            corps: t!.corps,
            appel: t!.appel,
            route: null,
            quand: '5 octobre 2026',
          },
        ],
      })
    );
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('&amp;lt;');
  });

  it('REQ-UX-016 : au-delà de la borne, avec un lien, refusés ou absents, les faits ne s’affichent pas — jamais tronqués', () => {
    const au = (faits: Parameters<typeof texteDeLaDecisionDansLEspace>[2]) =>
      texteDeLaDecisionDansLEspace(entreprise, charge('anomalie_confirmee'), faits);
    expect(au({ faits: 'x'.repeat(FAITS_ANOMALIE_CARACTERES_MAX.valeur + 1) })).toBeNull();
    expect(au({ faits: 'x'.repeat(FAITS_ANOMALIE_CARACTERES_MAX.valeur) })).not.toBeNull();
    expect(au({ faits: 'voir https://exemple.invalid' })).toBeNull();
    expect(au('refusee')).toBeNull();
    expect(au(null)).toBeNull();
  });

  it('REQ-UX-016 : les autres décisions ne portent pas de faits, et ne changent pas ; une charge illisible n’est pas rendue', () => {
    const t = texteDeLaDecisionDansLEspace(entreprise, charge('non_confirmee'), null);
    expect(t).not.toBeNull();
    expect(t!.corps).toContain(
      "L'entreprise a indiqué expressément n'avoir eu aucun échange avec vous"
    );
    expect(texteDeLaDecisionDansLEspace(entreprise, { pas: 'une charge' }, null)).toBeNull();
  });
});

// ── le lecteur de l'espace rend `decision_attribution` ───────────────────────────────────────────

describe('REQ-UX-047 — la liste de l’espace porte la décision, pour l’apporteur de la session seul', () => {
  type LigneNotif = {
    id: string;
    apporteurId: string;
    cle: string;
    creeAt: Date;
    evenementId: bigint | null;
    attributionId: string | null;
    anomalieId: string | null;
  };
  function clientDeLaListe(lignes: LigneNotif[], a: Anomalie | null) {
    return {
      notificationEspace: {
        findMany: async (args: { where: { apporteurId: string; cle: { in: string[] } } }) =>
          lignes
            .filter(
              (l) => l.apporteurId === args.where.apporteurId && args.where.cle.in.includes(l.cle)
            )
            .map((l) => ({
              id: l.id,
              cle: l.cle,
              creeAt: l.creeAt,
              evenementId: l.evenementId,
              attribution:
                l.attributionId === null
                  ? null
                  : {
                      apporteurId: l.apporteurId,
                      ...ENTREPRISE_BRUTE,
                      fenetreRedeclarationFinAt: null,
                    },
            })),
        findUnique: async (args: { where: { id: string } }) => {
          const l = lignes.find((x) => x.id === args.where.id);
          return l === undefined
            ? null
            : {
                apporteurId: l.apporteurId,
                cle: l.cle,
                attributionId: l.attributionId,
                anomalieId: l.anomalieId,
              };
        },
      },
      anomalie: { findUnique: async () => a },
    } as unknown as ClientDesNotifications;
  }
  const ligne = (o: Partial<LigneNotif> = {}): LigneNotif => ({
    id: NOTIF,
    apporteurId: APP,
    cle: 'decision_attribution',
    creeAt: new Date('2026-10-05T08:00:00.000Z'),
    evenementId: 42n,
    attributionId: ATT,
    anomalieId: ANOMALIE,
    ...o,
  });

  it('REQ-UX-047 : TÉMOIN — la décision de l’apporteur est rendue, avec le motif et ses faits, par le lecteur dédié', async () => {
    const rendues = await notificationsDeLEspace(clientDeLaListe([ligne()], anomalie()), APP, {
      cles: CLES,
      chargeDuFait: async () => ({
        type: 'attribution_etat_modifie',
        charge: charge('anomalie_confirmee'),
      }),
    });
    expect(rendues).toHaveLength(1);
    expect(rendues[0]!.corps).toContain(`deux dépôts le même jour ${MARQUEUR}`);
    expect(rendues[0]!.route).toBe(GABARITS.decision_attribution.route);
  });

  it('REQ-UX-047 : TÉMOIN — purgée, la décision reste affichée avec le texte fermé ; refusée, elle est écartée', async () => {
    const purgee = await notificationsDeLEspace(
      clientDeLaListe([ligne()], anomalie({ justificationChiffre: null })),
      APP,
      {
        cles: CLES,
        chargeDuFait: async () => ({
          type: 'attribution_etat_modifie',
          charge: charge('anomalie_confirmee'),
        }),
      }
    );
    expect(purgee[0]!.corps).toContain(NOTIFICATIONS.faitsNonConserves);
    const refusee = await notificationsDeLEspace(
      clientDeLaListe([ligne()], anomalie({ apporteurId: AUTRE })),
      APP,
      {
        cles: CLES,
        chargeDuFait: async () => ({
          type: 'attribution_etat_modifie',
          charge: charge('anomalie_confirmee'),
        }),
      }
    );
    expect(refusee).toEqual([]);
  });

  it('REQ-UX-047 : sans sources, une décision n’est pas rendue, jamais à moitié ; une décision sans faits l’est avec ses sources', async () => {
    expect(await notificationsDeLEspace(clientDeLaListe([ligne()], anomalie()), APP)).toEqual([]);
    const sansFaits = await notificationsDeLEspace(
      clientDeLaListe([ligne({ anomalieId: null })], null),
      APP,
      {
        cles: CLES,
        chargeDuFait: async () => ({
          type: 'attribution_etat_modifie',
          charge: charge('non_confirmee'),
        }),
      }
    );
    expect(sansFaits).toHaveLength(1);
  });

  it('REQ-UX-047 : TÉMOIN MARQUEUR — la liste ne consigne rien des faits', async () => {
    const sorties: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void sorties.push(a));
    await notificationsDeLEspace(clientDeLaListe([ligne()], anomalie()), APP, {
      cles: CLES,
      chargeDuFait: async () => ({
        type: 'attribution_etat_modifie',
        charge: charge('anomalie_confirmee'),
      }),
    });
    expect(JSON.stringify(sorties)).not.toContain(MARQUEUR);
  });
});
