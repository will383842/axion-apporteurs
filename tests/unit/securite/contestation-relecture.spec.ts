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
import {
  MODELE_DE_LA_CONTESTATION,
  relireLaContestation,
  type ClientDesContestations,
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
  ...o,
});

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
      recueAt: RECUE,
      repondue: true,
    });
    expect(await relire([piegee({ repondueAt: null })])).toMatchObject({
      etat: 'purgee',
      repondue: false,
    });
    expect(lu).toBe(false);
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
 * LA GARDE DE L'ESPACE (sécurité, #775, 6032748282) : un résilié dont les droits courent (`lecture`)
 * relit ses contestations ; aucune action ne lui est ouverte ; `ferme` et `limite` n'ouvrent pas le
 * segment ; `ACTIONS_PERMISES_EN_LECTURE` ne gagne rien.
 */
describe('REQ-DM-043 — le segment « contestations » : lu en lecture, jamais écrit', () => {
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

  it('REQ-DM-043 : TÉMOIN — « contestations » est dans SEGMENTS_LECTURE ET dans SEGMENTS_PLEINS, jamais dans SEGMENTS_LIMITES', async () => {
    const m = await import('../../../src/domain/apporteur/acces-espace');
    expect(m.SEGMENTS_LECTURE).toContain('contestations');
    expect(m.SEGMENTS_PLEINS).toContain('contestations');
    expect(m.SEGMENTS_LIMITES).not.toContain('contestations');
    expect(m.routeOuverte('plein', 'contestations')).toBe(true);
    expect(m.routeOuverte('lecture', 'contestations')).toBe(true);
    expect(m.routeOuverte('limite', 'contestations')).toBe(false);
    expect(m.routeOuverte('ferme', 'contestations')).toBe(false);
  });

  it('REQ-DM-043 : TÉMOIN — un résilié dont les droits courent ouvre la page, en lecture ; sans droits en cours (ferme), refusé', async () => {
    const { pageEspace } = await import('../../../src/server/auth/session');
    const lu = await pageEspace('contestations', 'jeton', ports('resilie', true));
    expect(lu.ok && lu.session.niveau).toBe('lecture');
    expect(await pageEspace('contestations', 'jeton', ports('resilie', false))).toMatchObject({
      ok: false,
    });
  });

  // @no-red-first: avant l'ajout, le segment inconnu était déjà refusé à tout niveau, défaut fermé
  it('REQ-DM-043 : TÉMOIN — une ouverture limitée n’ouvre pas le segment', async () => {
    const { pageEspace } = await import('../../../src/server/auth/session');
    expect(await pageEspace('contestations', 'jeton', ports('kyc_en_cours', false))).toMatchObject({
      ok: false,
    });
  });

  it('REQ-DM-043 : TÉMOIN — toute action de contestation est refusée en lecture (lecture_seule), sans exécuter le corps', async () => {
    const { actionEspace, ACTIONS_PERMISES_EN_LECTURE } =
      await import('../../../src/server/auth/session');
    expect(ACTIONS_PERMISES_EN_LECTURE).not.toContain('contestations');
    const corps = vi.fn(async () => 'ecrit');
    expect(await actionEspace('contestations', 'jeton', ports('resilie', true), corps)).toEqual({
      ok: false,
      motif: 'lecture_seule',
    });
    expect(corps).not.toHaveBeenCalled();
  });
});
