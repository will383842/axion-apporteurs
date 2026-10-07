// @req REQ-DM-043
/**
 * UX-P1-51 (REQ-DM-043) — le LECTEUR UNIQUE d'une contestation pour l'espace (`relire.ts`), EN
 * PROCESSUS : un faux client, de vraies clés de banc, un vrai chiffrement.
 *
 * CONDITIONS DE LA SÉCURITÉ (acceptance) : seulement la contestation de l'apporteur de la SESSION ; une
 * contestation d'un autre apporteur, ou inconnue, reçoit la MÊME réponse ; le texte et la réponse se
 * déchiffrent CHAMP PAR CHAMP sous une AAD liée à l'identifiant de la contestation et au champ ; jamais
 * de sélection générique ; rien au journal. Un chiffré permuté entre deux contestations, ou entre le
 * texte et la réponse, échoue au déchiffrement.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, encryptPii } from '../../../src/server/securite/pii';
import { echeanceDeReponse } from '../../../src/domain/anomalie/regles';
import { MODELE_CONTESTATION } from '../../../prisma/seed/12-console-cas';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  EcranChargementContestation,
  EcranContestation,
} from '../../../src/app/(espace)/contestations/[id]/ecran';
import {
  MODELE_DE_LA_CONTESTATION,
  refusRenduIndisponible,
  relireLaContestation,
  type ClientDesContestations,
  type ContestationRelue,
} from '../../../src/server/contestation/relire';

const ID = '0190f3a0-0000-7000-8000-0000000000c1';
const AUTRE_ID = '0190f3a0-0000-7000-8000-0000000000c2';
const APP = '0190f3a0-0000-7000-8000-0000000000b2';
const AUTRE_APP = '0190f3a0-0000-7000-8000-0000000000b3';
const MARQUEUR = 'MARQUEUR-CONTESTATION-51';
const RECUE = new Date('2026-10-03T09:00:00.000Z');
const REPONDUE = new Date('2026-10-10T14:00:00.000Z');

const clesDuBanc = () => {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  return clesPii(env);
};
const CLES = clesDuBanc();
const chiffre = (champ: 'texteChiffre' | 'reponseChiffre', id: string, clair: string) =>
  encryptPii({ modele: MODELE_DE_LA_CONTESTATION, champ, id }, clair, CLES);

type Ligne = {
  id: string;
  apporteurId: string;
  objet: string;
  recueAt: Date;
  texteChiffre: Uint8Array | null;
  reponseChiffre: Uint8Array | null;
  repondueAt: Date | null;
  purgeeAt: Date | null;
  depotRefuse: { siren: string | null; apporteurId: string } | null;
  attribution: { raisonSociale: string | null; siren: string; apporteurId: string | null } | null;
};
const ligne = (o: Partial<Ligne> = {}): Ligne => ({
  id: ID,
  apporteurId: APP,
  objet: 'refus_depot',
  recueAt: RECUE,
  texteChiffre: chiffre('texteChiffre', ID, `Je conteste ce refus. ${MARQUEUR}`),
  reponseChiffre: chiffre('reponseChiffre', ID, `Le refus est maintenu. ${MARQUEUR}`),
  repondueAt: REPONDUE,
  purgeeAt: null,
  depotRefuse: { siren: '732829320', apporteurId: APP },
  attribution: null,
  ...o,
});
/** L'entreprise du dépôt refusé par défaut : son numéro, au repli de la juriste. */
const ENTREPRISE = 'Entreprise n° 732829320';

/** Un faux client qui filtre comme la base : par l'identifiant ET par l'apporteur du `where`. */
function client(lignes: Ligne[]) {
  const requetes: unknown[] = [];
  const c = {
    contestation: {
      findFirst: async (args: { where: { id: string; apporteurId: string } }) => {
        requetes.push(args);
        return (
          lignes.find((l) => l.id === args.where.id && l.apporteurId === args.where.apporteurId) ??
          null
        );
      },
    },
  } as unknown as ClientDesContestations;
  return { c, requetes };
}
const relire = (lignes: Ligne[], id = ID, apporteurId = APP) =>
  relireLaContestation(client(lignes).c, { contestationId: id, apporteurId }, CLES);

afterEach(() => vi.restoreAllMocks());

describe('REQ-DM-043 — l’apporteur relit SA contestation, et seulement la sienne', () => {
  it('REQ-DM-043 : TÉMOIN — la requête porte l’apporteur de la session dans son where, et une sélection explicite, jamais générique', async () => {
    const { c, requetes } = client([ligne()]);
    await relireLaContestation(c, { contestationId: ID, apporteurId: APP }, CLES);
    expect(requetes).toEqual([
      {
        where: { id: ID, apporteurId: APP },
        select: {
          objet: true,
          recueAt: true,
          texteChiffre: true,
          reponseChiffre: true,
          repondueAt: true,
          purgeeAt: true,
          depotRefuse: { select: { siren: true, apporteurId: true } },
          attribution: { select: { raisonSociale: true, siren: true, apporteurId: true } },
        },
      },
    ]);
  });

  it('REQ-DM-043 : TÉMOIN — la contestation d’un autre apporteur reçoit la MÊME réponse qu’une contestation inconnue', async () => {
    const dAutrui = await relire([ligne({ apporteurId: AUTRE_APP })]);
    const inconnue = await relire([ligne()], AUTRE_ID);
    expect(dAutrui).toEqual({ etat: 'indisponible' });
    expect(inconnue).toEqual(dAutrui);
  });

  it('REQ-DM-043 : TÉMOIN — répondue : le texte et la réponse, déchiffrés champ par champ, avec l’objet et les dates', async () => {
    expect(await relire([ligne()])).toEqual({
      etat: 'repondue',
      objet: 'refus_depot',
      entreprise: ENTREPRISE,
      recueAt: RECUE,
      texte: `Je conteste ce refus. ${MARQUEUR}`,
      reponse: `Le refus est maintenu. ${MARQUEUR}`,
      repondueAt: REPONDUE,
    });
  });

  it('REQ-DM-043 : en attente : le texte seul, et l’échéance de réponse DÉRIVÉE de la réception', async () => {
    expect(await relire([ligne({ reponseChiffre: null, repondueAt: null })])).toEqual({
      etat: 'en_attente',
      objet: 'refus_depot',
      entreprise: ENTREPRISE,
      recueAt: RECUE,
      texte: `Je conteste ce refus. ${MARQUEUR}`,
      echeance: new Date(echeanceDeReponse(RECUE.getTime())),
    });
  });

  it('REQ-DM-043 : TÉMOIN — un chiffré permuté entre deux contestations, ou entre le texte et la réponse, échoue au déchiffrement', async () => {
    const dUneAutre = chiffre('texteChiffre', AUTRE_ID, 'le texte d’une autre contestation');
    expect(await relire([ligne({ texteChiffre: dUneAutre })])).toEqual({ etat: 'illisible' });
    const reponseEnTexte = chiffre('reponseChiffre', ID, 'une réponse posée comme texte');
    expect(await relire([ligne({ texteChiffre: reponseEnTexte })])).toEqual({
      etat: 'illisible',
    });
    const texteEnReponse = chiffre('texteChiffre', ID, 'un texte posé comme réponse');
    expect(await relire([ligne({ reponseChiffre: texteEnReponse })])).toEqual({
      etat: 'illisible',
    });
  });

  it('REQ-DM-043 : TÉMOIN — purgée : l’objet, la réception et le statut restent, sans rien déchiffrer', async () => {
    let lu = false;
    const piegee = (o: Partial<Ligne>) => {
      const l = ligne({ purgeeAt: new Date('2027-10-03T00:00:00.000Z'), ...o });
      for (const champ of ['texteChiffre', 'reponseChiffre'] as const)
        Object.defineProperty(l, champ, {
          get: () => {
            lu = true;
            return null;
          },
        });
      return l;
    };
    expect(await relire([piegee({})])).toEqual({
      etat: 'purgee',
      objet: 'refus_depot',
      entreprise: ENTREPRISE,
      recueAt: RECUE,
      repondue: true,
    });
    expect(await relire([piegee({ repondueAt: null })])).toMatchObject({
      etat: 'purgee',
      repondue: false,
    });
    expect(lu).toBe(false);
  });

  it('REQ-DM-043 : TÉMOIN — l’entreprise : sa raison sociale, ou son numéro au repli ; jamais celle d’un lien d’autrui, ni un numéro purgé', async () => {
    const attribution = (o: Partial<NonNullable<Ligne['attribution']>> = {}) => ({
      raisonSociale: 'Boulangerie Démo du Lac',
      siren: '552100554',
      apporteurId: APP,
      ...o,
    });
    const avec = async (o: Partial<Ligne>) =>
      ((await relire([ligne(o)])) as { entreprise?: string | null }).entreprise;
    expect(
      await avec({ objet: 'annulation_attribution', depotRefuse: null, attribution: attribution() })
    ).toBe('Boulangerie Démo du Lac');
    expect(
      await avec({ depotRefuse: null, attribution: attribution({ raisonSociale: null }) })
    ).toBe('Entreprise n° 552100554');
    expect(
      await avec({ depotRefuse: null, attribution: attribution({ apporteurId: AUTRE_APP }) })
    ).toBeNull();
    // Une attribution sans apporteur (portée par un conseiller) n'est pas la sienne : échec fermé.
    expect(
      await avec({ depotRefuse: null, attribution: attribution({ apporteurId: null }) })
    ).toBeNull();
    expect(await avec({ depotRefuse: { siren: '732829320', apporteurId: AUTRE_APP } })).toBeNull();
    expect(await avec({ depotRefuse: { siren: null, apporteurId: APP } })).toBeNull();
    expect(await avec({ depotRefuse: null, attribution: null })).toBeNull();
  });

  it('REQ-DM-043 : un texte absent hors d’une purge n’est pas rendu à moitié : la contestation est illisible', async () => {
    expect(await relire([ligne({ texteChiffre: null })])).toEqual({ etat: 'illisible' });
  });

  it('REQ-DM-043 : TÉMOIN MARQUEUR — rien du texte ni de la réponse n’est consigné', async () => {
    const sorties: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void sorties.push(a));
    await relire([ligne()]);
    await relire([ligne({ texteChiffre: chiffre('texteChiffre', AUTRE_ID, MARQUEUR) })]);
    expect(JSON.stringify(sorties)).not.toContain(MARQUEUR);
  });

  it('REQ-DM-043 : le lecteur déchiffre sous le MÊME modèle que l’écrivain (le semeur)', () => {
    expect(MODELE_DE_LA_CONTESTATION).toBe(MODELE_CONTESTATION);
  });
});

/**
 * LA GARDE DE L'ESPACE (arbitrage de la coordination sur #775 : le contrat v2 fait foi, art. 12.3,
 * SEC-70) : « contestations » s'ouvre en PLEIN seulement ; un résilié reçoit la même page qu'une
 * contestation inconnue ; aucune action n'est ouverte en lecture.
 */
describe('REQ-DM-043 — le segment « contestations » : ouverture pleine seulement', () => {
  const MAINTENANT = new Date('2026-10-07T10:00:00Z');
  function ports(statut: string, droitsEnCours: boolean) {
    return {
      maintenant: () => MAINTENANT,
      configuration: { secret: 'secret-de-test-factice-de-trente-deux-caracteres', kid: 'k1' },
      depot: {
        lire: async () => ({
          id: 'session-1',
          apporteurId: 'apporteur-1',
          kid: 'k1',
          expireAt: new Date('2026-10-08T10:00:00Z'),
          revoqueAt: null,
          sessionVersion: 2,
          apporteur: { statut, sessionVersion: 2, droitsEnCours },
          lienMagique: { consommeAt: MAINTENANT },
        }),
        marquerVue: async () => {},
        lister: async () => [],
        revoquer: async () => 0,
        incrementerVersion: async () => {},
      },
      // SEC-53 : la politique courante est acceptée, pour que seul le niveau d'accès décide.
      acceptation: {
        lirePolitique: () => ({
          ok: true as const,
          politique: { rubriques: [], destinataires: [], version: 'v' },
          filtres: [],
        }),
        depot: {
          lire: async () => ({ accepteeAt: MAINTENANT, version: 'v' }),
          ecrire: async () => undefined,
        },
      },
    };
  }

  it('REQ-DM-043 : TÉMOIN — « contestations » est dans SEGMENTS_PLEINS, ni dans SEGMENTS_LECTURE ni dans SEGMENTS_LIMITES', async () => {
    const m = await import('../../../src/domain/apporteur/acces-espace');
    expect(m.SEGMENTS_PLEINS).toContain('contestations');
    expect(m.SEGMENTS_LECTURE).not.toContain('contestations');
    expect(m.SEGMENTS_LIMITES).not.toContain('contestations');
    expect(m.routeOuverte('plein', 'contestations')).toBe(true);
    expect(m.routeOuverte('lecture', 'contestations')).toBe(false);
    expect(m.routeOuverte('limite', 'contestations')).toBe(false);
    expect(m.routeOuverte('ferme', 'contestations')).toBe(false);
  });

  it('REQ-DM-043 : TÉMOIN — un résilié est refusé, et la page lui rend la MÊME réponse qu’une contestation inconnue', async () => {
    const { pageEspace } = await import('../../../src/server/auth/session');
    const resilie = await pageEspace('contestations', 'jeton', ports('resilie', true));
    expect(resilie).toEqual({ ok: false, motif: 'hors_ouverture_limitee' });
    expect(refusRenduIndisponible('hors_ouverture_limitee')).toBe(true);
    // Les autres refus gardent leur redirection : sans session, vers la connexion.
    expect(refusRenduIndisponible('absente')).toBe(false);
    expect(refusRenduIndisponible('acceptation_requise')).toBe(false);
    const date = (d: Date) => d.toISOString();
    const page = (c: ContestationRelue) =>
      renderToStaticMarkup(createElement(EcranContestation, { contestationId: ID, c, date }));
    const inconnue = await relire([]);
    expect(page({ etat: 'indisponible' })).toBe(page(inconnue));
  });

  it('REQ-DM-043 : un apporteur signé ouvre la page, en plein', async () => {
    const { pageEspace } = await import('../../../src/server/auth/session');
    const v = await pageEspace('contestations', 'jeton', ports('signe', true));
    expect(v.ok && v.session.niveau).toBe('plein');
  });

  // @no-red-first: avant l'ajout, le segment inconnu était déjà refusé à tout niveau, défaut fermé
  it('REQ-DM-043 : TÉMOIN — une ouverture limitée n’ouvre pas le segment', async () => {
    const { pageEspace } = await import('../../../src/server/auth/session');
    expect(await pageEspace('contestations', 'jeton', ports('kyc_en_cours', false))).toMatchObject({
      ok: false,
    });
  });

  it('REQ-DM-043 : TÉMOIN — aucune action de contestation n’est permise en lecture', async () => {
    const { ACTIONS_PERMISES_EN_LECTURE } = await import('../../../src/server/auth/session');
    expect(ACTIONS_PERMISES_EN_LECTURE).not.toContain('contestations');
  });
});

/** L'écran « Ma contestation », rendu en HTML statique pour chaque état du lecteur. */
describe('REQ-UX-047 — l’écran « Ma contestation » : ses six états, et rien que ce que le lecteur rend', () => {
  const date = (d: Date) => d.toISOString().slice(0, 10);
  const rendre = (c: ContestationRelue) =>
    renderToStaticMarkup(createElement(EcranContestation, { contestationId: ID, c, date }));
  const texteDe = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  const base = {
    objet: 'refus_depot' as const,
    entreprise: 'Entreprise n° 732829320',
    recueAt: RECUE,
  };
  const repondue: ContestationRelue = {
    etat: 'repondue',
    ...base,
    texte: `Je conteste ce refus. ${MARQUEUR}`,
    reponse: 'Le refus est maintenu.',
    repondueAt: REPONDUE,
  };

  it('REQ-UX-047 : TÉMOIN — répondue : l’objet, l’entreprise, l’écrit et la réponse d’Axion-IA, datés', () => {
    const t = texteDe(rendre(repondue));
    expect(t).toContain('Refus d’un dépôt · Entreprise n° 732829320');
    expect(t).toContain('Votre écrit, reçu le 2026-10-03');
    expect(t).toContain(`Je conteste ce refus. ${MARQUEUR}`);
    expect(t).toContain('Réponse d’Axion-IA, le 2026-10-10');
    expect(t).toContain('Le refus est maintenu.');
  });

  it('REQ-UX-047 : TÉMOIN — en attente : l’échéance, et le délai LU dans la SSOT, sans paramètre resté brut', () => {
    const echeance = new Date(echeanceDeReponse(RECUE.getTime()));
    const t = texteDe(
      rendre({ etat: 'en_attente', ...base, texte: 'Je conteste ce refus.', echeance })
    );
    expect(t).toContain(
      `Axion-IA vous répond de façon motivée dans les ${SEUILS.REPONSE_CONTESTATION_JOURS.valeur} ${SEUILS.REPONSE_CONTESTATION_JOURS.unite} qui suivent la réception de votre écrit, au plus tard le ${date(echeance)}.`
    );
    expect(t).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it('REQ-UX-047 : TÉMOIN — purgée : EXACTEMENT le texte de la juriste, l’objet, la date et le statut, et aucun fragment de l’ancien texte', () => {
    const t = texteDe(rendre({ etat: 'purgee', ...base, repondue: true }));
    expect(t).toContain(
      "Le texte de cette contestation et la réponse d'Axion-IA ne sont plus conservés, leur durée de conservation ayant pris fin."
    );
    expect(t).toContain('Contestation reçue le 2026-10-03 · réponse donnée');
    expect(t).toContain('Refus d’un dépôt · Entreprise n° 732829320');
    expect(t).not.toContain(MARQUEUR);
    expect(texteDe(rendre({ etat: 'purgee', ...base, repondue: false }))).toContain(
      'en attente de réponse'
    );
  });

  it('REQ-UX-047 : TÉMOIN — indisponible : ni objet, ni entreprise, ni date ; un geste vers Mes entreprises', () => {
    const html = rendre({ etat: 'indisponible' });
    const t = texteDe(html);
    expect(t).toContain('Cette contestation n’est pas disponible');
    expect(t).not.toMatch(/Refus d’un dépôt|Entreprise n°|2026/);
    expect(html).toContain('href="/mes-entreprises"');
  });

  it('REQ-UX-047 : illisible : une alerte sans détail, et un geste pour réessayer ; le chargement est annoncé', () => {
    const html = rendre({ etat: 'illisible' });
    expect(html).toContain('role="alert"');
    expect(texteDe(html)).toContain('Votre contestation ne s’affiche pas');
    expect(html).toContain(`href="/contestations/${ID}"`);
    const chargement = renderToStaticMarkup(createElement(EcranChargementContestation));
    expect(chargement).toContain('role="status"');
  });

  it('REQ-UX-047 : TÉMOIN — l’interface dit « Axion-IA », jamais « la Société », dans aucun état', () => {
    for (const c of [
      repondue,
      { etat: 'en_attente', ...base, texte: 'x', echeance: REPONDUE } as const,
      { etat: 'purgee', ...base, repondue: true } as const,
      { etat: 'indisponible' } as const,
      { etat: 'illisible' } as const,
    ])
      expect(texteDe(rendre(c)), c.etat).not.toMatch(/la Société/i);
  });

  it('REQ-UX-047 : TÉMOIN à deux faces — un <script> dans l’écrit s’affiche comme du TEXTE, échappé une fois', () => {
    const html = rendre({ ...repondue, texte: '<script>alert(1)</script> & co' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('&amp;lt;');
  });
});
