// @req REQ-UX-047
// @req REQ-SEC-023
// @req REQ-JUR-006
/**
 * UX-P1-57 — le geste minimal de mise en demeure, dans la console (juriste, #703, 5980966503 §3 ;
 * conditions de la sécurité, #703, 5981620953). EN PROCESSUS : l'action de l'écran avec des doubles
 * de Next, du juge des rôles et du geste de la fin de contrat ; l'écran rendu en HTML statique.
 *
 * Le geste lui-même (le fait au journal sans les faits, la décision chiffrée, la notification) est
 * celui de la fin de contrat (`mettreEnDemeure`), jugé par ses propres témoins : ici, ce que l'écran y ajoute. Le droit réservé à
 * l'admin sous step-up, posé AVANT tout travail ; l'article de la liste fermée ; les faits jugés À LA
 * SAISIE, bornés en points de code, avec un refus nommé ; des faits qui ne sortent jamais vers
 * l'adresse ; rien qui compte les mises en demeure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => {
  class Redirection extends Error {
    constructor(readonly vers: string) {
      super(`redirection ${vers}`);
    }
  }
  const MAINTENANT = 1_803_031_200_000;
  /** L'acteur tel que la base le relit DANS la transaction (condition de la sécurité). */
  const relu = {
    ligne: null as null | { role: string; desactiveAt: Date | null; valideAt: Date | null },
    lectures: [] as unknown[],
  };
  const tx = {
    utilisateurConsole: {
      findUnique: async (a: unknown) => {
        relu.lectures.push(a);
        return relu.ligne;
      },
    },
  };
  return {
    relu,
    Redirection,
    MAINTENANT,
    tx,
    D: {
      prisma: { $transaction: async (travail: (t: unknown) => Promise<unknown>) => travail(tx) },
      env: { NODE_ENV: 'test' },
      horloge: { maintenant: () => MAINTENANT },
    },
    jeton: { valeur: 'JETON' as string | undefined },
  };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) =>
      nom === 'session_console' && h.jeton.valeur !== undefined
        ? { value: h.jeton.valeur }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((vers: string) => {
    throw new h.Redirection(vers);
  }),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('../../../src/server/roles/require-role', () => ({ requireRole: vi.fn() }));
vi.mock('../../../src/server/auth/lien-magique-production', () => ({
  COOKIE_DE_SESSION_CONSOLE: { nom: 'session_console' },
  dependancesDuProcessus: vi.fn(() => h.D),
  portsDeRoleConsole: vi.fn(() => ({ ports: 'console' })),
}));
vi.mock('../../../src/server/securite/pii', async (original) => ({
  ...(await original<typeof import('../../../src/server/securite/pii')>()),
  clesPii: vi.fn(() => ({ cles: 'factices' })),
}));
vi.mock('../../../src/server/apporteur/resiliation', async (original) => ({
  ...(await original<typeof import('../../../src/server/apporteur/resiliation')>()),
  mettreEnDemeure: vi.fn(),
}));

import { requireRole, type MotifDeRefusConsole } from '../../../src/server/roles/require-role';
import {
  MATRICE_DES_ROLES as MATRICE,
  roleAutorise,
  ROLES_CONSOLE,
} from '../../../src/server/roles/matrice';
import { ErreurResiliation, mettreEnDemeure } from '../../../src/server/apporteur/resiliation';
import { ARTICLES_MISE_EN_DEMEURE } from '../../../src/domain/apporteur/resiliation';
import { FAITS_ANOMALIE_CARACTERES_MAX, SEUILS } from '../../../src/domain/seuils/ssot';
import { mettreEnDemeureDepuisLaConsole } from '../../../src/server/console/mise-en-demeure/actions';
import { MISE_EN_DEMEURE_CONSOLE as T } from '../../../src/content/micro-copy/console/mise-en-demeure';
import {
  ChargementDeLaMiseEnDemeure,
  EcranMiseEnDemeure,
} from '../../../src/components/console/mise-en-demeure';
import ErreurMiseEnDemeure from '../../../src/app/(console)/console/apporteurs/[id]/mise-en-demeure/error';

const RACINE = join(__dirname, '..', '..', '..');
const ACTIONS = 'src/server/console/mise-en-demeure/actions.ts';
const ADMIN = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' as const };
const APPORTEUR = '0190f0f0-0000-7000-8000-0000000000e1';
const ECRAN = `/console/apporteurs/${APPORTEUR}/mise-en-demeure`;
const MAX = FAITS_ANOMALIE_CARACTERES_MAX.valeur;
const MARQUEUR = 'MARQUEUR-DES-FAITS-7Q';
/** La clé d'idempotence que la page a tirée au rendu, et que le formulaire rapporte. */
const CLE = '0190f0f0-0000-4000-8000-0000000000c1';

function formulaire(
  o: { apporteurId?: string; article?: string; faits?: string; cle?: string } = {}
): FormData {
  const f = new FormData();
  f.set('apporteurId', o.apporteurId ?? APPORTEUR);
  f.set('article', o.article ?? '7');
  f.set('faits', o.faits ?? `Les relevés du mois ne sont pas parvenus. ${MARQUEUR}`);
  f.set('cleIdempotence', o.cle ?? CLE);
  return f;
}

/** L'adresse où l'action renvoie : elle ne revient jamais autrement (redirection). */
async function destination(f: FormData): Promise<string> {
  try {
    await mettreEnDemeureDepuisLaConsole(f);
  } catch (e) {
    if (e instanceof h.Redirection) return e.vers;
    throw e;
  }
  throw new Error('aucune redirection');
}

const accorde = () => vi.mocked(requireRole).mockResolvedValue({ ok: true, utilisateur: ADMIN });
const refuse = (motif: MotifDeRefusConsole) =>
  vi.mocked(requireRole).mockResolvedValue({ ok: false, motif });

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
  vi.mocked(mettreEnDemeure).mockReset();
  vi.mocked(mettreEnDemeure).mockResolvedValue({ decisionId: 'd', evenementId: 1n });
  h.jeton.valeur = 'JETON';
  h.relu.ligne = { role: 'admin', desactiveAt: null, valideAt: new Date(h.MAINTENANT - 1) };
  h.relu.lectures = [];
});

describe('REQ-SEC-023 — le droit : l’admin seul, sous step-up, jugé AVANT tout travail', () => {
  it('REQ-SEC-023 : TÉMOIN — la matrice réserve action:mettre_en_demeure à l’admin, sous step-up', () => {
    expect(MATRICE['action:mettre_en_demeure']).toEqual({ roles: ['admin'], stepUp: true });
    // L'écran, à l'admin seul ; le relèvement est exigé par le geste, que l'action rejuge.
    expect(MATRICE['ecran:mise_en_demeure']).toEqual({ roles: ['admin'], stepUp: false });
    for (const role of ROLES_CONSOLE) {
      expect(roleAutorise('action:mettre_en_demeure', role), role).toBe(role === 'admin');
      expect(roleAutorise('ecran:mise_en_demeure', role), role).toBe(role === 'admin');
    }
  });

  it('REQ-SEC-023 : TÉMOIN — l’action pose sa question à requireRole, avec son droit et le jeton de session', async () => {
    accorde();
    expect(await destination(formulaire())).toBe(`${ECRAN}?envoi=enregistre`);
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith(
      'action:mettre_en_demeure',
      'JETON',
      expect.anything()
    );
  });

  it('REQ-SEC-023 : TÉMOIN — le droit est REJUGÉ en base, dans la transaction, avant le geste (mettreEnDemeure ne le rejuge pas)', async () => {
    accorde();
    await destination(formulaire());
    expect(h.relu.lectures).toEqual([
      {
        where: { id: ADMIN.id },
        select: { role: true, desactiveAt: true, valideAt: true },
      },
    ]);
    // Entre le juge et la transaction, l'acteur a changé : rôle retiré, compte désactivé,
    // administrateur sans validation, ou ligne disparue. Retour à l'accueil, rien n'est écrit.
    const deriva = [
      { role: 'qualifieur', desactiveAt: null, valideAt: new Date(h.MAINTENANT - 1) },
      {
        role: 'admin',
        desactiveAt: new Date(h.MAINTENANT - 1),
        valideAt: new Date(h.MAINTENANT - 1),
      },
      { role: 'admin', desactiveAt: null, valideAt: null },
      null,
    ];
    vi.mocked(mettreEnDemeure).mockClear();
    for (const ligne of deriva) {
      accorde();
      h.relu.ligne = ligne;
      expect(await destination(formulaire()), JSON.stringify(ligne)).toBe('/console');
    }
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });

  it('REQ-SEC-023 : TÉMOIN — un relèvement manquant renvoie à la connexion, l’écran en suite ; rien n’est fait', async () => {
    refuse('releve_requis');
    expect(await destination(formulaire())).toBe(
      `/console/connexion?suite=${encodeURIComponent(ECRAN)}`
    );
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });

  it('REQ-SEC-023 : TÉMOIN — un rôle refusé, un administrateur en attente ou une session absente : retour à l’accueil, rien n’est fait', async () => {
    for (const motif of ['role_refuse', 'admin_en_attente', 'absente'] as const) {
      refuse(motif);
      expect(await destination(formulaire()), motif).toBe('/console');
    }
    h.jeton.valeur = undefined;
    refuse('absente');
    expect(await destination(formulaire())).toBe('/console');
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });

  it('REQ-SEC-023 : un identifiant d’apporteur hors forme ramène à l’accueil, sans écho ni travail', async () => {
    accorde();
    expect(await destination(formulaire({ apporteurId: 'pas-un-uuid' }))).toBe('/console');
    expect(vi.mocked(requireRole)).not.toHaveBeenCalled();
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });
});

describe('REQ-JUR-006 — l’article de la liste fermée, les faits jugés à la saisie', () => {
  it('REQ-JUR-006 : TÉMOIN — le geste part avec l’article, les faits ENTIERS, l’acteur humain et l’instant, dans une transaction', async () => {
    accorde();
    const faits = `Les relevés du mois ne sont pas parvenus. ${MARQUEUR}`;
    await destination(formulaire({ article: '3.7', faits }));
    expect(vi.mocked(mettreEnDemeure)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mettreEnDemeure)).toHaveBeenCalledWith(
      h.tx,
      {
        apporteurId: APPORTEUR,
        article: '3.7',
        faits,
        cleIdempotence: CLE,
        acteur: { par: 'utilisateur_console', id: ADMIN.id },
        maintenant: new Date(h.MAINTENANT),
      },
      { cles: 'factices' }
    );
  });

  it('REQ-JUR-006 : TÉMOIN — un article hors de la liste fermée est refusé, nommé, avant tout travail', async () => {
    accorde();
    for (const article of ['11.2', '', '7 ', 'tout']) {
      expect(await destination(formulaire({ article })), article).toBe(
        `${ECRAN}?refus=article_hors_liste`
      );
    }
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });

  it('REQ-JUR-006 : TÉMOIN — 1 001 points de code sont refusés à la saisie, nommés ; 1 000 sont acceptés ENTIERS', async () => {
    accorde();
    // Des caractères hors du plan de base : deux unités UTF-16 chacun, un point de code.
    const mille = '𝔄'.repeat(MAX);
    expect(await destination(formulaire({ faits: `${mille}𝔄` }))).toBe(
      `${ECRAN}?refus=faits_trop_longs`
    );
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
    expect(await destination(formulaire({ faits: mille }))).toBe(`${ECRAN}?envoi=enregistre`);
    expect(vi.mocked(mettreEnDemeure).mock.calls[0]![1].faits).toBe(mille);
  });

  it('REQ-JUR-006 : TÉMOIN — des faits vides, ou faits seulement d’espaces, sont refusés, nommés', async () => {
    accorde();
    for (const faits of ['', '   ', '\n\t'])
      expect(await destination(formulaire({ faits })), JSON.stringify(faits)).toBe(
        `${ECRAN}?refus=faits_vides`
      );
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });

  it('REQ-JUR-006 : TÉMOIN — un refus de SEC-19 revient à l’écran, nommé ; une autre erreur n’est pas avalée', async () => {
    accorde();
    for (const code of [
      'statut_sans_contrat',
      'apporteur_introuvable',
      'faits_avec_mot_refuse',
      'cle_idempotence_invalide',
      'cle_deja_employee',
    ] as const) {
      vi.mocked(mettreEnDemeure).mockRejectedValueOnce(new ErreurResiliation(code, 'détail'));
      expect(await destination(formulaire()), code).toBe(`${ECRAN}?refus=${code}`);
    }
    vi.mocked(mettreEnDemeure).mockRejectedValueOnce(new Error('panne'));
    await expect(mettreEnDemeureDepuisLaConsole(formulaire())).rejects.toThrow('panne');
  });

  it('REQ-JUR-006 : TÉMOIN — les faits ne sortent jamais vers l’adresse, ni au succès ni au refus', async () => {
    accorde();
    const vues = [await destination(formulaire())];
    vi.mocked(mettreEnDemeure).mockRejectedValueOnce(
      new ErreurResiliation('statut_sans_contrat', MARQUEUR)
    );
    vues.push(await destination(formulaire()));
    vues.push(await destination(formulaire({ faits: `${'x'.repeat(MAX)}${MARQUEUR}` })));
    for (const vue of vues) expect(vue).not.toContain(MARQUEUR);
  });

  // Condition 2 de la sécurité : ni lien ni nom de tiers. Le juge des faits est celui de la fin de
  // contrat (`jugerLesFaitsSaisis`), appelé à la saisie : ses motifs ne sont pas recopiés ici.
  it('REQ-JUR-006 : TÉMOIN — un lien dans les faits est refusé à la saisie, nommé, avant tout envoi', async () => {
    accorde();
    expect(
      await destination(
        formulaire({ faits: 'Voir https://exemple.invalid/preuve pour le détail.' })
      )
    ).toBe(`${ECRAN}?refus=faits_avec_lien`);
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });

  it('REQ-JUR-006 : TÉMOIN — un mot refusé dans les faits est refusé à la saisie, nommé, avant tout envoi', async () => {
    accorde();
    expect(await destination(formulaire({ faits: 'Une fraude constatée sur les relevés.' }))).toBe(
      `${ECRAN}?refus=faits_avec_mot_refuse`
    );
    expect(vi.mocked(mettreEnDemeure)).not.toHaveBeenCalled();
  });

  // Condition 6 de la sécurité : un double clic ou un rejeu ne crée pas deux mises en demeure. La clé
  // d'idempotence est tirée par le serveur au rendu (sécurité, #703, 5982535417) ; le geste la juge.
  it('REQ-JUR-006 : TÉMOIN — le formulaire porte la clé d’idempotence tirée au rendu, que l’action passe au geste', async () => {
    const html = rendre({ etat: 'nominal' });
    const cle = /name="cleIdempotence" value="([0-9a-f-]{36})"/.exec(html)?.[1];
    expect(cle).toBe(CLE);
    accorde();
    const f = formulaire();
    f.set('cleIdempotence', cle!);
    await destination(f);
    expect(vi.mocked(mettreEnDemeure).mock.calls[0]![1]).toMatchObject({ cleIdempotence: cle });
  });

  it('REQ-JUR-006 : TÉMOIN statique — l’action ne lit ni le nombre ni l’historique des mises en demeure', () => {
    const source = readFileSync(join(RACINE, ACTIONS), 'utf8');
    for (const interdit of [/\bcount\b/, /findMany/, /decisionDeContrat/, /envoisDeLArticle/])
      expect(source, String(interdit)).not.toMatch(interdit);
  });
});

function rendre(
  o: Partial<{
    etat: 'nominal' | 'hors_contrat' | 'introuvable';
    refus: keyof typeof T.refus | null;
    enregistree: boolean;
  }> = {}
): string {
  return renderToStaticMarkup(
    createElement(EcranMiseEnDemeure, {
      apporteurId: APPORTEUR,
      etat: o.etat ?? 'nominal',
      action: mettreEnDemeureDepuisLaConsole,
      refus: o.refus ?? null,
      enregistree: o.enregistree ?? false,
      cleIdempotence: CLE,
    })
  );
}
const texteDe = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('REQ-UX-047 — l’écran : le formulaire, ses états, ses refus nommés', () => {
  it('REQ-UX-047 : TÉMOIN — nominal : les six articles de la liste fermée, les faits, l’apporteur caché, un seul bouton', () => {
    const html = rendre();
    const options = [...html.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    expect(options).toEqual([...ARTICLES_MISE_EN_DEMEURE]);
    expect(html).toContain('<textarea name="faits"');
    expect(html).toMatch(/<textarea[^>]* required/);
    expect(html).toContain(`<input type="hidden" name="apporteurId" value="${APPORTEUR}"/>`);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(texteDe(html)).toContain(T.envoyer);
  });

  it('REQ-UX-047 : la borne et le délai sont LUS dans la SSOT, jamais retapés', () => {
    const texte = texteDe(rendre());
    expect(texte).toContain(T.borne(MAX));
    expect(texte).toContain(T.delai(SEUILS.MISE_EN_DEMEURE_JOURS.valeur));
    const source = readFileSync(
      join(RACINE, 'src/content/micro-copy/console/mise-en-demeure.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/\b1[  ]?000\b|\bquinze\b|\b15 jours\b/);
  });

  it('REQ-UX-047 : la consigne dit de ne nommer aucune autre personne, et qu’aucun lien n’est admis', () => {
    expect(texteDe(rendre())).toContain(T.consigne);
    expect(T.consigne).toMatch(/aucune autre personne/);
    expect(T.consigne).toMatch(/lien/);
  });

  it('REQ-UX-047 : TÉMOIN — chaque refus a sa phrase, en alerte ; le succès dit d’où court le délai', () => {
    for (const [code, phrase] of Object.entries(T.refus)) {
      const html = rendre({ refus: code as keyof typeof T.refus });
      expect(html, code).toContain('role="alert"');
      expect(texteDe(html), code).toContain(phrase);
    }
    const succes = texteDe(rendre({ enregistree: true }));
    expect(succes).toContain(T.enregistree);
    expect(T.enregistree).toMatch(/envoi/);
  });

  it('REQ-UX-047 : TÉMOIN — vide : un apporteur hors contrat n’a pas de formulaire, et l’écran dit le geste suivant', () => {
    const html = rendre({ etat: 'hors_contrat' });
    expect(html).not.toContain('<form');
    expect(texteDe(html)).toContain(T.horsContrat.phrase);
    expect(html).toContain(`href="/console/apporteurs/${APPORTEUR}"`);
  });

  it('REQ-UX-047 : introuvable, et chargement : leurs phrases, sans formulaire', () => {
    const introuvable = rendre({ etat: 'introuvable' });
    expect(introuvable).not.toContain('<form');
    expect(texteDe(introuvable)).toContain(T.introuvable.phrase);
    const chargement = renderToStaticMarkup(createElement(ChargementDeLaMiseEnDemeure));
    expect(chargement).toContain('role="status"');
    expect(texteDe(chargement)).toBe(T.chargement);
  });

  it('REQ-UX-047 : TÉMOIN — erreur : la page dit que rien n’est parti, et propose de réessayer, sans détail de l’erreur', () => {
    const html = renderToStaticMarkup(
      createElement(ErreurMiseEnDemeure, {
        error: new Error(`panne ${MARQUEUR}`),
        reset: () => undefined,
      })
    );
    expect(html).toContain('role="alert"');
    expect(texteDe(html)).toContain(T.erreur.phrase);
    expect(T.erreur.phrase).toMatch(/[Rr]ien n’est parti/);
    expect(html).toContain(`<button type="button">${T.erreur.action}</button>`);
    expect(html).not.toContain(MARQUEUR);
  });
});
