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
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import {
  envoyerLesNotificationsDeLEspace,
  type NotificationAEnvoyer,
  type PortsDuPassage,
} from '../../../src/server/taches/envoyer-notifications-espace';

const MAINTENANT = new Date('2027-05-10T08:00:00.000Z');
const FENETRE_MS = SEUILS.FILE_FENETRE_REDECLARATION_JOURS.valeur * MS_PAR_JOUR;

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
    expect(t.trace).toEqual([`lot:${SEUILS.NOTIFICATIONS_ENVOI_LOT.valeur}`, 'tx', 'tx']);
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
  it('REQ-DM-004 : TÉMOIN — premier_rang_libere envoyé : la fenêtre vaut envoye_at + la durée de la SSOT, à la milliseconde', async () => {
    const envoyeAt = new Date(MAINTENANT.getTime() + 1234);
    const t = ports([notif('n1', 'premier_rang_libere')], {
      issue: () => ({ statut: 'envoye', envoyeAt }),
    });
    await envoyerLesNotificationsDeLEspace(t.p);
    expect(t.fenetres).toEqual([
      { attributionId: 'att-n1', finAt: new Date(envoyeAt.getTime() + FENETRE_MS) },
    ]);
  });

  it('REQ-DM-004 : TÉMOIN — relais en panne, puis envoi deux heures plus tard : l’échéance est l’envoi + 15 jours', async () => {
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
    expect(rejeu.fenetres[0]!.finAt.getTime()).toBe(plusTard.getTime() + FENETRE_MS);
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
