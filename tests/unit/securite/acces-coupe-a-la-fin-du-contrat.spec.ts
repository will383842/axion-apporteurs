// @req REQ-SEC-032
// @req REQ-DM-011
/**
 * SEC-70 — contrat v2, art. 12.3 : « son lien personnel est révoqué à la fin du contrat ». L'ACCÈS À
 * L'ESPACE est coupé à la fin du contrat (décision de Williams, art. 2.8 ; fiche de la juriste ALN-04 ;
 * conditions de la sécurité, #474 6032838727 ; arbitrage de la coordination, #319 6040096872).
 *
 * Il INVERSE l'ancien niveau `lecture` du résilié : un résilié n'ouvre plus rien, quels que soient ses droits
 * en cours (condition 1) ; une session déjà ouverte tombe à la requête suivante, puisque le niveau est
 * rejugé à chaque requête (condition 2) ; un lien demandé ou déjà émis n'ouvre aucune session. Le
 * paragraphe commun de la résiliation perd sa phrase de reconnexion, remplacée par celle de la juriste
 * (#703, 6033893005), mot pour mot.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  niveauDAcces,
  peutOuvrirLEspace,
  routeOuverte,
  SEGMENTS_LECTURE,
  SEGMENTS_LIMITES,
  SEGMENTS_PLEINS,
  SEGMENT_DE_L_ACCEPTATION,
} from '../../../src/domain/apporteur/acces-espace';
import { STATUTS_APPORTEUR } from '../../../src/domain/apporteur/statut';
import { GABARITS } from '../../../src/server/notifications/table-ssot';
import { composerLeCourriel } from '../../../src/server/notifications/envoyer';
import { adresseDeContact, registreDuDepot, type Registre } from '../../../src/config/entite';
import { jugerSession, type LigneDeSession } from '../../../src/server/auth/session';
import { ouvertureDuCompte } from '../../../src/server/auth/lien-magique';
import {
  PARAGRAPHE_COMMUN_DE_LA_RESILIATION,
  TEXTES_DES_NOTIFICATIONS,
} from '../../../src/content/micro-copy/courriels/notifications';

const MAINTENANT = new Date('2027-03-14T10:00:00.000Z');
const KID = 'k1';
const APPORTEUR = '0190f0c2-0000-7000-8000-0000000000e1';

/**
 * Les anciennes signatures, avec les DROITS EN COURS (au moins une attribution `figee_resiliation`) :
 * SEC-70 les retire. Les témoins les appellent ENCORE ainsi pour prouver qu'aucun droit en cours ne
 * rouvre l'espace, quelle que soit la signature.
 */
const niveauAvecDroits = niveauDAcces as (statut: string, droitsEnCours?: boolean) => string;
const ouvertureAvecDroits = ouvertureDuCompte as (
  statut: string | null,
  apporteurId?: string,
  droitsEnCours?: (id: string) => Promise<boolean>
) => Promise<boolean>;

/** Le paragraphe commun de la juriste (#839, 6044465062), MOT POUR MOT. */
const PARAGRAPHE_DE_LA_JURISTE =
  "Vos dépôts en cours de confirmation et vos dépôts en attente sont annulés ; vos réservations sans commande prennent fin. Les commandes signées avant la fin du contrat, ou pendant le préavis, continuent de vous ouvrir droit à commission, même si votre dépôt n'était pas encore confirmé : la commission vous est due quand Axion-IA en a encaissé l'intégralité du prix, quelle que soit la date de cet encaissement. Les commissions déjà acquises vous sont facturées par autofacture et versées dans les conditions du contrat, sans montant minimum. Votre accès à l'espace en ligne prend fin à la date de fin du contrat. Vos autofactures, leurs décomptes et le motif de tout blocage vous sont envoyés par courrier électronique jusqu'à l'extinction de vos droits ; vous pouvez obtenir sur simple demande écrite à Axion-IA la copie de votre contrat, de vos autofactures et de vos contestations, et contester par écrit une commission ou une décision dans les délais du contrat.";

/** La phrase de la juriste (#703, 6033893005), MOT POUR MOT. */
const PHRASE_DE_LA_JURISTE =
  "Votre accès à l'espace en ligne prend fin à la date de fin du contrat. Vos autofactures, leurs décomptes et le motif de tout blocage vous sont envoyés par courrier électronique jusqu'à l'extinction de vos droits ; vous pouvez obtenir sur simple demande écrite à Axion-IA la copie de votre contrat, de vos autofactures et de vos contestations, et contester par écrit une commission ou une décision dans les délais du contrat.";

describe('REQ-SEC-032 — SEC-70 : à la fin du contrat, l’espace est FERMÉ au résilié', () => {
  it('REQ-SEC-032 : TÉMOIN — un résilié n’ouvre RIEN, pas même en lecture, MÊME avec des droits en cours', () => {
    expect(niveauAvecDroits('resilie', true)).toBe('ferme');
    expect(niveauDAcces('resilie')).toBe('ferme');
    expect(peutOuvrirLEspace('resilie')).toBe(false);
  });

  it('REQ-SEC-032 : TÉMOIN — une session d’un résilié aux droits en cours, déjà ouverte (en lecture sous l’ancienne règle), est refusée à la requête suivante (statut_ferme)', () => {
    // L'ancienne forme : les droits en cours y figuraient encore.
    const ancienneForme = { statut: 'resilie', sessionVersion: 3, droitsEnCours: true };
    const ligne: LigneDeSession = {
      id: 's1',
      apporteurId: APPORTEUR,
      kid: KID,
      expireAt: new Date(MAINTENANT.getTime() + 3_600_000),
      revoqueAt: null,
      sessionVersion: 3,
      apporteur: ancienneForme,
      lienMagique: { consommeAt: MAINTENANT },
    };
    expect(jugerSession(ligne, MAINTENANT, KID)).toEqual({ ok: false, motif: 'statut_ferme' });
  });

  it('REQ-SEC-032 : TÉMOIN — un résilié ne reçoit ni ne consomme aucun lien : son compte n’ouvre rien', async () => {
    expect(await ouvertureAvecDroits('resilie', APPORTEUR, async () => true)).toBe(false);
    // Les autres statuts gardent leur jugement : le signé ouvre, l'inconnu non.
    expect(await ouvertureDuCompte('signe')).toBe(true);
    expect(await ouvertureDuCompte(null)).toBe(false);
  });
});

describe('REQ-DM-011 — SEC-70 : le paragraphe commun de la résiliation, réécrit sur le v2 (art. 12.3 et 5.5)', () => {
  it('REQ-DM-011 : TÉMOIN — il ne contient plus de phrase de reconnexion, et finit par la phrase de la juriste, mot pour mot', () => {
    expect(PARAGRAPHE_COMMUN_DE_LA_RESILIATION).not.toMatch(/reconnect|en lecture/i);
    expect(PARAGRAPHE_COMMUN_DE_LA_RESILIATION.endsWith(PHRASE_DE_LA_JURISTE)).toBe(true);
  });

  it('REQ-DM-011 : TÉMOIN — le paragraphe est EXACTEMENT celui de la juriste (#839, 6044465062) : l’acquisition à l’encaissement intégral (art. 4.2), l’autofacture sans montant minimum (art. 12.2)', () => {
    expect(PARAGRAPHE_COMMUN_DE_LA_RESILIATION).toBe(PARAGRAPHE_DE_LA_JURISTE);
    expect(PARAGRAPHE_COMMUN_DE_LA_RESILIATION).not.toMatch(/au fur et à mesure|dernier relevé/);
  });
});

describe('REQ-SEC-032 — SEC-70 : le runbook de la résiliation, section 7, réécrit', () => {
  it('REQ-SEC-032 : TÉMOIN — la section 7 dit l’accès coupé et l’envoi par courriel ; elle ne promet plus ni reconnexion ni lecture', () => {
    const t = readFileSync('docs/runbooks/resiliation.md', 'utf8');
    const s7 = t.slice(t.indexOf('## 7.'));
    expect(s7).toContain(
      "L'accès à l'espace prend fin à la date de fin du contrat, sans exception."
    );
    expect(s7).toContain('par courriel');
    expect(s7).not.toMatch(/se reconnecte par lien|en lecture seule/i);
    expect(t).not.toMatch(/garde l'accès en lecture|accès en lecture\*\* de l'apporteur/);
  });
});

/** Les fichiers d'un dossier, récursivement. */
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((e) => {
    const chemin = join(dossier, e);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

describe('REQ-SEC-032 — SEC-70 : toutes les entrées passent par la garde de session (condition 2 de la sécurité)', () => {
  it('REQ-SEC-032 : TÉMOIN — hors de l’espace, les routes du serveur sont une liste FERMÉE, sans aucune route d’apporteur ni téléchargement : une entrée neuve doit être jugée ici', () => {
    // Les pages, routes et actions de `src/app/(espace)` appellent chacune `pageEspace` ou
    // `actionEspace` pour LEUR segment (témoin du disque, acces-espace-avant-signature.spec.ts) :
    // c'est là que le niveau, et donc la fin du contrat, est rejugé à chaque requête.
    const horsEspace = fichiers('src/app')
      .map((f) => f.split('\\').join('/'))
      .filter((f) => /\/route\.[cm]?[jt]sx?$/.test(f) && !f.includes('/(espace)/'))
      .sort();
    expect(horsEspace).toEqual([
      'src/app/api/integrations/axionia/[...inconnu]/route.ts',
      'src/app/api/integrations/axionia/attributions/route.ts',
      'src/app/api/livez/route.ts',
      'src/app/api/mcp/route.ts',
      'src/app/api/readyz/route.ts',
      'src/app/api/webhooks/axionia/route.ts',
      'src/app/api/webhooks/zeptomail/route.ts',
    ]);
  });
});

describe('REQ-SEC-032 — SEC-70 : le rendu de la résiliation reste en défense, inatteignable (condition 4 de la sécurité)', () => {
  it('REQ-SEC-032 : TÉMOIN — aucun statut, connu ou non, n’est plus jamais en LECTURE', () => {
    for (const statut of [...STATUTS_APPORTEUR, 'inconnu', '', 'RESILIE']) {
      expect(niveauDAcces(statut), statut).not.toBe('lecture');
    }
  });

  it('REQ-SEC-032 : TÉMOIN — pour un résilié, AUCUN segment de l’espace ne s’ouvre, ni la liste des notifications, ni aucune route où mène une notification', () => {
    const niveau = niveauDAcces('resilie');
    const routes = Object.values(GABARITS).flatMap((g): string[] => {
      const route: string | null = g.route;
      return route === null ? [] : [route.split('/')[1] ?? ''];
    });
    for (const seg of [
      ...SEGMENTS_PLEINS,
      ...SEGMENTS_LIMITES,
      ...SEGMENTS_LECTURE,
      SEGMENT_DE_L_ACCEPTATION,
      'notifications',
      ...routes,
    ]) {
      expect(routeOuverte(niveau, seg), seg).toBe(false);
    }
  });
});

describe('REQ-DM-011 — SEC-70 : l’appel du courriel de résiliation (juriste, #824 6043086595)', () => {
  it('REQ-DM-011 : TÉMOIN — l’appel est « Écrire à Axion-IA », mot pour mot, et ne mène à AUCUNE route de l’espace', () => {
    expect(TEXTES_DES_NOTIFICATIONS.resiliation.appel).toBe('Écrire à Axion-IA');
    expect(GABARITS.resiliation.route).toBeNull();
    const espace = new URL('https://espace.exemple.test/');
    const texte = { titre: 't', appel: TEXTES_DES_NOTIFICATIONS.resiliation.appel, corps: 'c' };
    const { corps } = composerLeCourriel('resiliation', texte, espace, null);
    expect(corps).not.toContain(espace.host);
    expect(corps).not.toMatch(/Voir mes commissions/);
  });

  it('REQ-DM-011 : TÉMOIN à deux faces — l’appel mène au mailto: de l’adresse de contact de l’entité ; sans adresse renseignée, il part SANS lien, jamais un mailto vide', () => {
    const espace = new URL('https://espace.exemple.test/');
    const texte = { titre: 't', appel: 'Écrire à Axion-IA', corps: 'c' };
    expect(composerLeCourriel('resiliation', texte, espace, 'contact@exemple.test').corps).toBe(
      'c\n\nÉcrire à Axion-IA : mailto:contact@exemple.test'
    );
    const sans = composerLeCourriel('resiliation', texte, espace, null).corps;
    expect(sans).toBe('c\n\nÉcrire à Axion-IA');
    expect(sans).not.toContain('mailto:');
    // Une autre notification garde son lien vers l'espace : le contact ne vaut que pour la résiliation.
    const autre = composerLeCourriel(
      'mise_en_demeure',
      texte,
      espace,
      'contact@exemple.test'
    ).corps;
    expect(autre).not.toContain('mailto:');
  });

  it('REQ-DM-011 : TÉMOIN — l’adresse de contact se lit au REGISTRE de l’entité ; à renseigner, absente ou hors forme : null (échec fermé)', () => {
    // Le registre du dépôt, auquel le témoin greffe la clé posée par UX-P1-64.
    const base = registreDuDepot();
    const registre = (v: string | undefined): Registre => {
      const entite = { ...base.entite, adresseDeContact: v };
      return { ...base, entite };
    };
    expect(adresseDeContact(registre('contact@exemple.test'))).toBe('contact@exemple.test');
    expect(adresseDeContact(registre('A-RENSEIGNER'))).toBeNull();
    expect(adresseDeContact(registre('pas une adresse'))).toBeNull();
    expect(adresseDeContact(registre(undefined))).toBeNull();
    expect(adresseDeContact({ ...base, entite: { ...base.entite } })).toBeNull();
  });
});
