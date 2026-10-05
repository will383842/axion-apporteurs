// @req REQ-INT-012
// @req REQ-INT-013
// @req REQ-QA-026
/**
 * INT-T08-P, SANS base — le client de relecture, le client de rejeu et le passage de réconciliation,
 * sur des ports en mémoire (rattrapage 81 : le témoin que la mesure de mutation exécute ; le témoin
 * en base réelle est `tests/integration/reconciliation-quotidienne.spec.ts`).
 *
 * L'autre côté rejoue la sémantique des routes RÉELLES d'axion-ia, sous le secret d'émission, avec
 * son kid : la page de relecture est signée sur la chaîne CANONIQUE que le `$comment` de la route
 * déclare (INT-T74-P), `<t>.<after_sequence>.<limit>.<derniere>.<suite>.<corps>` ; la réponse de
 * rejeu, sur `<t>.<corps>`. NDJSON ; `X-Axionia-Derniere-Sequence`, `X-Axionia-Suite`.
 */
import { describe, it, expect } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { kidDe, type Trousseau } from '../../../src/lib/env';
import {
  CHEMIN_RELECTURE,
  LIMITE_PAR_PAGE,
  clientRelecture,
  type CanalAxionia,
  type LirePage,
  type PageRelue,
} from '../../../src/server/integrations/axionia/relecture';
import {
  CHEMIN_REJEU,
  PAGES_MAX_PAR_PASSAGE,
  RECOUVREMENT_SEQUENCES,
  REJEU_MAX_PAR_APPEL,
  clientRejeu,
  reconcilier,
  type Rejouer,
  type Signal,
} from '../../../src/server/integrations/axionia/reconciliation';
import { passageQuotidien } from '../../../src/server/jobs/reconciliation';
import {
  lancerLesPassages,
  type Passage,
  type VerrouConsultatif,
} from '../../../src/server/taches/lanceur';
import type { Battre } from '../../../src/server/queue/workers/evenement-recu';
import {
  GENRES_RECONCILIATION,
  messageDAlerte,
} from '../../../src/server/integrations/telegram/alertes';

const MAINTENANT_MS = Date.UTC(2026, 9, 3, 6, 0, 0);
const SECRET_EMISSION = randomBytes(32).toString('hex');
const TROUSSEAU: Trousseau = { courante: SECRET_EMISSION, precedente: null };
const T = String(Math.floor(MAINTENANT_MS / 1000));
const sous = (chaine: string) =>
  createHmac('sha256', SECRET_EMISSION).update(chaine, 'utf8').digest('hex');

type Reponse = { statut?: number; corps?: string; entetes?: Record<string, string | null> };

/** Un canal dont `appeler` rend la réponse donnée, signée par défaut, et note les appels. */
function canal(
  reponse: Reponse | (() => never),
  url: string | undefined = 'https://axion-ia.test'
) {
  const appels: { cible: string; init: RequestInit | undefined }[] = [];
  const appeler = (async (entree: URL | RequestInfo, init?: RequestInit) => {
    const u = new URL(String(entree));
    appels.push({ cible: `${u.pathname}${u.search}`, init });
    if (typeof reponse === 'function') return reponse();
    const corps = reponse.corps ?? '';
    const entetes: Record<string, string> = {
      'x-axionia-timestamp': T,
      'x-axionia-kid': kidDe(SECRET_EMISSION),
    };
    const { 'x-axionia-signature': signature, ...autres } = reponse.entetes ?? {};
    for (const [k, v] of Object.entries(autres)) {
      if (v === null) delete entetes[k];
      else entetes[k] = v;
    }
    // La relecture signe la chaîne canonique de la requête REÇUE et des en-têtes SERVIS ; le rejeu,
    // `<t>.<corps>`. Une signature imposée par le cas remplace la calculée.
    entetes['x-axionia-signature'] =
      u.pathname === CHEMIN_RELECTURE
        ? sous(
            [
              T,
              u.searchParams.get('after_sequence'),
              u.searchParams.get('limit'),
              entetes['x-axionia-derniere-sequence'] ?? '',
              entetes['x-axionia-suite'] ?? '',
              corps,
            ].join('.')
          )
        : sous(`${T}.${corps}`);
    if (signature === null) delete entetes['x-axionia-signature'];
    else if (signature !== undefined) entetes['x-axionia-signature'] = signature;
    return new Response(corps, { status: reponse.statut ?? 200, headers: entetes });
  }) as typeof fetch;
  const c: CanalAxionia = {
    urlAxionia: url,
    secretRelecture: 'secret-de-relecture',
    trousseauEmission: TROUSSEAU,
    appeler,
    maintenantMs: () => MAINTENANT_MS,
  };
  return { c, appels };
}

const ligne = (sequence: number, eventId = randomUUID()) =>
  JSON.stringify({ event_id: eventId, event_type: 'client.cree', sequence, payload: {} });

const page = (lignes: string[], derniere: string, suite: '0' | '1'): Reponse => ({
  corps: lignes.join('\n'),
  entetes: { 'x-axionia-derniere-sequence': derniere, 'x-axionia-suite': suite },
});

const lire = async (r: Reponse | (() => never), apres = 0n) => clientRelecture(canal(r).c)(apres);

describe('REQ-INT-012 — le client de relecture : une page entière, ou un refus nommé', () => {
  it('REQ-INT-012 : une page conforme est rendue — lignes, dernière séquence, suite ; la cible signée est exacte', async () => {
    const { c, appels } = canal(page([ligne(4), ligne(5)], '5', '1'));
    const r = await clientRelecture(c)(3n);
    expect(r.ok && r.lignes.map((l) => l.sequence)).toEqual([4n, 5n]);
    expect(r.ok && [r.derniereSequence, r.suite]).toEqual([5n, true]);
    expect(appels[0]!.cible).toBe(`${CHEMIN_RELECTURE}?after_sequence=3&limit=${LIMITE_PAR_PAGE}`);
    const h = new Headers(appels[0]!.init?.headers);
    const t = h.get('x-partners-timestamp')!;
    expect(t).toBe(T);
    expect(h.get('x-partners-signature')).toBe(
      createHmac('sha256', 'secret-de-relecture').update(`${t}.${appels[0]!.cible}`).digest('hex')
    );
    expect(appels[0]!.init?.method).toBe('GET');
    expect(appels[0]!.init?.redirect).toBe('error');
    expect(appels[0]!.init?.cache).toBe('no-store');
  });

  it('REQ-INT-012 : une page vide rend le point de départ, sans suite', async () => {
    const r = await lire(page([], '7', '0'), 7n);
    expect(r).toEqual({ ok: true, lignes: [], derniereSequence: 7n, suite: false });
  });

  it('REQ-INT-012 : sans adresse d’axion-ia, aucun appel — `canal_non_configure`', async () => {
    const { c, appels } = canal(page([], '0', '0'));
    expect(await clientRelecture({ ...c, urlAxionia: undefined })(0n)).toEqual({
      ok: false,
      motif: 'canal_non_configure',
    });
    expect(appels).toEqual([]);
  });

  it('REQ-INT-012 : un appel qui lève rend `appel_echoue`', async () => {
    const r = await lire(() => {
      throw new Error('réseau');
    });
    expect(r).toEqual({ ok: false, motif: 'appel_echoue' });
  });

  it('REQ-INT-012 : un statut autre que 200 est nommé', async () => {
    expect(await lire({ statut: 503 })).toEqual({ ok: false, motif: 'statut_503' });
  });

  it.each<[string, Record<string, string | null>]>([
    ['signature absente', { 'x-axionia-signature': null }],
    ['kid absent', { 'x-axionia-kid': null }],
    ['signature fausse', { 'x-axionia-signature': 'a'.repeat(64) }],
  ])('REQ-INT-012 : réponse refusée `signature_refusee` — %s', async (_cas, entetes) => {
    const r = await lire({
      ...page([ligne(1)], '1', '0'),
      entetes: { 'x-axionia-derniere-sequence': '1', 'x-axionia-suite': '0', ...entetes },
    });
    expect(r).toEqual({ ok: false, motif: 'signature_refusee' });
  });

  it.each<[string, Reponse]>([
    ['dernière séquence absente', page([ligne(1)], '', '0')],
    ['dernière séquence non entière', page([ligne(1)], '1.5', '0')],
    ['suite absente', { corps: ligne(1), entetes: { 'x-axionia-derniere-sequence': '1' } }],
    ['suite hors de 0 et 1', page([ligne(1)], '1', '2' as '1')],
    ['dernière séquence qui ne suit pas la dernière ligne', page([ligne(1)], '9', '0')],
    ['page vide qui fait avancer le curseur', page([], '9', '0')],
  ])('REQ-INT-012 : en-tête refusé `entete_illisible` — %s', async (_cas, r) => {
    expect(await lire(r)).toEqual({ ok: false, motif: 'entete_illisible' });
  });

  it.each<[string, string]>([
    ['pas du JSON', 'pas du json'],
    ['un tableau', '[1]'],
    ['nul', 'null'],
    ['sans event_id', JSON.stringify({ sequence: 1 })],
    ['event_id vide', JSON.stringify({ event_id: '', sequence: 1 })],
    ['event_id non chaîne', JSON.stringify({ event_id: 1, sequence: 1 })],
    ['séquence en chaîne', JSON.stringify({ event_id: 'x', sequence: '1' })],
    ['séquence décimale', JSON.stringify({ event_id: 'x', sequence: 1.5 })],
    ['séquence nulle', JSON.stringify({ event_id: 'x', sequence: 0 })],
  ])('REQ-INT-012 : ligne refusée `ligne_illisible` — %s', async (_cas, corps) => {
    expect(await lire(page([corps], '1', '0'))).toEqual({ ok: false, motif: 'ligne_illisible' });
  });

  it('REQ-INT-012 : une ligne qui ne dépasse pas le point de départ, ou qui recule, est refusée `ligne_hors_ordre`', async () => {
    expect(await lire(page([ligne(3)], '3', '0'), 3n)).toEqual({
      ok: false,
      motif: 'ligne_hors_ordre',
    });
    expect(await lire(page([ligne(5), ligne(4)], '4', '0'))).toEqual({
      ok: false,
      motif: 'ligne_hors_ordre',
    });
  });
});

describe('REQ-INT-013 — le client de rejeu : signé sur le chemin et le corps', () => {
  it('REQ-INT-013 : la demande porte les identifiants, signée sur `<chemin>\\n<corps>`, et rend les comptes', async () => {
    const ids = [randomUUID(), randomUUID()];
    const { c, appels } = canal({
      corps: JSON.stringify({ rearmes: [ids[0]], introuvables: [ids[1]] }),
    });
    expect(await clientRejeu(c)(ids)).toEqual({ ok: true, rearmes: 1, introuvables: 1 });
    const a = appels[0]!;
    expect([a.cible, a.init?.method, a.init?.body]).toEqual([
      CHEMIN_REJEU,
      'POST',
      JSON.stringify({ eventIds: ids }),
    ]);
    const h = new Headers(a.init?.headers);
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('x-partners-signature')).toBe(
      createHmac('sha256', 'secret-de-relecture')
        .update(
          `${h.get('x-partners-timestamp')}.${CHEMIN_REJEU}\n${JSON.stringify({ eventIds: ids })}`
        )
        .digest('hex')
    );
  });

  it.each([
    'pas du json',
    '{}',
    JSON.stringify({ rearmes: [] }),
    JSON.stringify({ introuvables: [] }),
    'null',
  ])('REQ-INT-013 : une réponse illisible est refusée — %s', async (corps) => {
    expect(await clientRejeu(canal({ corps }).c)([randomUUID()])).toEqual({
      ok: false,
      motif: 'reponse_illisible',
    });
  });

  it('REQ-INT-013 : un rejeu refusé par axion-ia (429) est nommé', async () => {
    expect(await clientRejeu(canal({ statut: 429 }).c)([randomUUID()])).toEqual({
      ok: false,
      motif: 'statut_429',
    });
  });
});

/** Une file en mémoire, lue par pages de `limite`. */
function fileEnMemoire(sequences: number[], limite = LIMITE_PAR_PAGE) {
  const lignes = sequences.map((s) => ({ eventId: `e${s}`, sequence: BigInt(s), corps: '' }));
  const lectures: bigint[] = [];
  const lirePage: LirePage = async (apres) => {
    lectures.push(apres);
    const suivantes = lignes.filter((l) => l.sequence > apres);
    const rendues = suivantes.slice(0, limite);
    return {
      ok: true,
      lignes: rendues,
      derniereSequence: rendues.at(-1)?.sequence ?? apres,
      suite: suivantes.length > limite,
    } satisfies PageRelue;
  };
  return { lirePage, lectures };
}

function passage(o: { recue: bigint; recus: string[]; lire: LirePage; rejouer?: Rejouer }) {
  const signaux: Signal[] = [];
  const demandes: string[][] = [];
  const rejouer: Rejouer =
    o.rejouer ??
    (async (ids) => {
      demandes.push([...ids]);
      return { ok: true, rearmes: ids.length, introuvables: 0 };
    });
  const run = () =>
    reconcilier({
      curseur: async () => o.recue,
      dejaRecus: async (ids) => new Set(ids.filter((i) => o.recus.includes(i))),
      lire: o.lire,
      rejouer,
      signaler: async (s) => {
        signaux.push(s);
      },
    });
  return { run, signaux, demandes };
}

describe('REQ-INT-013 — le passage : recouvrement, trous nommés en interne, nombre au dehors', () => {
  it('REQ-INT-013 : la relecture part de la plus haute séquence reçue moins le recouvrement, jamais sous zéro', async () => {
    const haut = fileEnMemoire([]);
    await passage({ recue: 900n, recus: [], lire: haut.lirePage }).run();
    expect(haut.lectures[0]).toBe(900n - RECOUVREMENT_SEQUENCES);
    const bas = fileEnMemoire([]);
    await passage({ recue: 10n, recus: [], lire: bas.lirePage }).run();
    expect(bas.lectures[0]).toBe(0n);
    const egal = fileEnMemoire([]);
    await passage({ recue: RECOUVREMENT_SEQUENCES, recus: [], lire: egal.lirePage }).run();
    expect(egal.lectures[0]).toBe(0n);
  });

  it('REQ-INT-013 : les trous sont NOMMÉS dans le retour du passage, et seul leur NOMBRE part au signal', async () => {
    const f = fileEnMemoire([1, 2, 3, 4]);
    const p = passage({ recue: 4n, recus: ['e1', 'e3'], lire: f.lirePage });
    const r = await p.run();
    expect(r).toEqual({
      pages: 1,
      relus: 4,
      manquants: 2,
      rearmes: 2,
      introuvables: 0,
      eventIdsManquants: ['e2', 'e4'],
    });
    expect(p.signaux).toEqual([{ genre: 'trou_rattrape', nombre: 2 }]);
    expect(p.demandes).toEqual([['e2', 'e4']]);
  });

  it('REQ-INT-013 : rien ne manque — aucun signal, aucun rejeu, des compteurs à zéro et une liste vide', async () => {
    const f = fileEnMemoire([1, 2]);
    const p = passage({ recue: 2n, recus: ['e1', 'e2'], lire: f.lirePage });
    expect(await p.run()).toEqual({
      pages: 1,
      relus: 2,
      manquants: 0,
      rearmes: 0,
      introuvables: 0,
      eventIdsManquants: [],
    });
    expect([p.signaux, p.demandes]).toEqual([[], []]);
  });

  it('REQ-INT-013 : le rejeu part par lots de `REJEU_MAX_PAR_APPEL`, et ses comptes s’additionnent', async () => {
    const n = REJEU_MAX_PAR_APPEL + 5;
    const f = fileEnMemoire(
      Array.from({ length: n }, (_, i) => i + 1),
      1000
    );
    const p = passage({
      recue: 0n,
      recus: [],
      lire: f.lirePage,
      rejouer: async (ids) => ({ ok: true, rearmes: ids.length - 1, introuvables: 1 }),
    });
    const r = await p.run();
    expect([r.rearmes, r.introuvables]).toEqual([n - 2, 2]);
  });

  it('REQ-INT-013 : les lots du rejeu ont la borne exacte', async () => {
    const n = REJEU_MAX_PAR_APPEL + 5;
    const f = fileEnMemoire(
      Array.from({ length: n }, (_, i) => i + 1),
      1000
    );
    const p = passage({ recue: 0n, recus: [], lire: f.lirePage });
    await p.run();
    expect(p.demandes.map((d) => d.length)).toEqual([REJEU_MAX_PAR_APPEL, 5]);
  });

  it('REQ-INT-013 : la relecture s’arrête à la borne des pages et le signale, avec le nombre de pages', async () => {
    const f = fileEnMemoire(
      Array.from({ length: PAGES_MAX_PAR_PASSAGE + 3 }, (_, i) => i + 1),
      1
    );
    const p = passage({ recue: 0n, recus: [], lire: f.lirePage });
    const r = await p.run();
    expect(f.lectures).toHaveLength(PAGES_MAX_PAR_PASSAGE);
    expect(r.pages).toBe(PAGES_MAX_PAR_PASSAGE);
    expect(p.signaux[0]).toEqual({ genre: 'relecture_bornee', nombre: PAGES_MAX_PAR_PASSAGE });
  });

  it('REQ-INT-013 : une relecture en échec est signalée avec son motif, et le passage LÈVE', async () => {
    const p = passage({
      recue: 0n,
      recus: [],
      lire: async () => ({ ok: false, motif: 'statut_503' }),
    });
    await expect(p.run()).rejects.toThrow('relecture_echouee : statut_503');
    expect(p.signaux).toEqual([{ genre: 'relecture_echouee', motif: 'statut_503' }]);
  });

  it('REQ-INT-013 : un rejeu en échec est signalé avec son motif, et le passage LÈVE', async () => {
    const f = fileEnMemoire([1]);
    const p = passage({
      recue: 0n,
      recus: [],
      lire: f.lirePage,
      rejouer: async () => ({ ok: false, motif: 'statut_429' }),
    });
    await expect(p.run()).rejects.toThrow('rejeu_echoue : statut_429');
    expect(p.signaux).toEqual([
      { genre: 'trou_rattrape', nombre: 1 },
      { genre: 'rejeu_echoue', motif: 'statut_429' },
    ]);
  });
});

describe('REQ-QA-026 — la tâche quotidienne et son alerte', () => {
  const compteurs = {
    pages: 1,
    relus: 0,
    manquants: 0,
    rearmes: 0,
    introuvables: 0,
    eventIdsManquants: [],
  };

  it('REQ-QA-026 : réussie le même jour UTC → différée ; la veille, ou jamais → jouée', async () => {
    let jouee = 0;
    const reconcilierCompte = async () => {
      jouee += 1;
      return compteurs;
    };
    const maintenant = () => new Date(MAINTENANT_MS);
    const essai = (dernier: Date | null) =>
      passageQuotidien({
        dernierSucces: async () => dernier,
        derniersCompteurs: async () => null,
        maintenant,
        reconcilier: reconcilierCompte,
      })();
    expect(await essai(new Date(Date.UTC(2026, 9, 3, 0, 0, 0)))).toEqual({ differee: 1 });
    expect(jouee).toBe(0);
    expect(await essai(new Date(Date.UTC(2026, 9, 2, 23, 59, 59)))).toEqual(compteurs);
    expect(await essai(null)).toEqual(compteurs);
    expect(jouee).toBe(2);
  });

  it('REQ-INT-013 : les event_id manquants RESTENT au battement tout le jour — chaque minute différée reporte le résultat du passage', async () => {
    // Le battement tel que l'écrit le dépôt (`depotDuTravail().battre`) : un succès REMPLACE la
    // colonne des compteurs ; le lanceur joue la tâche chaque minute, sous son verrou.
    let battement: { succesAt: Date | null; compteurs: unknown } = {
      succesAt: null,
      compteurs: null,
    };
    const battre: Battre = async (_tache, b) => {
      if ('succesAt' in b) battement = { succesAt: b.succesAt, compteurs: { ...b.compteurs } };
    };
    const verrou: VerrouConsultatif = {
      sous: async (_cle, travail) => ({ pris: true, valeur: await travail() }),
    };
    const resultat = { ...compteurs, manquants: 1, rearmes: 1, eventIdsManquants: ['e7'] };
    let jouee = 0;
    let instant = Date.UTC(2026, 9, 3, 0, 1, 0);
    const maintenant = () => new Date(instant);
    const inscriptions = {
      reconciliation_axionia: passageQuotidien({
        dernierSucces: async () => battement.succesAt,
        derniersCompteurs: async () => battement.compteurs,
        maintenant,
        reconcilier: async () => {
          jouee += 1;
          return resultat;
        },
      }) as unknown as Passage,
    };
    const minute = () => lancerLesPassages({ inscriptions, verrou, battre, maintenant });

    expect(await minute()).toEqual({ reconciliation_axionia: 'joue' });
    expect(battement.compteurs).toEqual(resultat);
    for (const decalage of [1, 2, 60]) {
      instant = Date.UTC(2026, 9, 3, 0, 1 + decalage, 0);
      expect(await minute()).toEqual({ reconciliation_axionia: 'joue' });
      expect(battement.compteurs).toEqual({ ...resultat, differee: 1 });
    }
    expect(jouee).toBe(1);
    // Le lendemain, le passage est rejoué, et son résultat remplace celui de la veille.
    instant = Date.UTC(2026, 9, 4, 0, 1, 0);
    await minute();
    expect(jouee).toBe(2);
    expect(battement.compteurs).toEqual(resultat);
  });

  it('REQ-QA-026 : différée, elle ne reporte que des compteurs en objet — une colonne nulle, une liste, un nombre ou un texte ne reportent rien', async () => {
    const essai = (porte: unknown) =>
      passageQuotidien({
        dernierSucces: async () => new Date(MAINTENANT_MS),
        derniersCompteurs: async () => porte,
        maintenant: () => new Date(MAINTENANT_MS),
        reconcilier: async () => {
          throw new Error('jamais appelée le jour même');
        },
      })();
    for (const porte of [null, ['e7'], 4, 'e7'])
      expect(await essai(porte)).toEqual({ differee: 1 });
    expect(await essai({ manquants: 2, eventIdsManquants: ['e7'] })).toEqual({
      manquants: 2,
      eventIdsManquants: ['e7'],
      differee: 1,
    });
    expect(await essai({ differee: 5 })).toEqual({ differee: 1 });
  });

  it('REQ-QA-026 : les genres d’alerte sont ceux des signaux, et l’alerte ne montre qu’un genre, un motif fermé et un nombre', () => {
    expect([...GENRES_RECONCILIATION].sort()).toEqual(
      [
        'relecture_bornee',
        'relecture_echouee',
        'rejeu_echoue',
        'trou_rattrape',
        // INT-T73-P : le signal du passage des sommes, qui ne porte que son nombre.
        'ecart_de_sommes',
      ].sort()
    );
    const id = randomUUID();
    expect(
      messageDAlerte('alerte', {
        categorie: 'reconciliation',
        id,
        reconciliation: { genre: 'trou_rattrape', nombre: 4 },
      })
    ).toBe(`[reconciliation] objet ${id} · réconciliation trou_rattrape · 4`);
    expect(
      messageDAlerte('alerte', {
        categorie: 'reconciliation',
        id,
        reconciliation: { genre: 'relecture_echouee', motif: 'statut_503' },
      })
    ).toBe(`[reconciliation] objet ${id} · réconciliation relecture_echouee · motif statut_503`);
  });

  it('REQ-QA-026 : TÉMOIN — un genre hors liste, un motif qui n’a pas la forme fermée ou un nombre négatif sont rendus « illisible »', () => {
    const texte = messageDAlerte('alerte', {
      categorie: 'reconciliation',
      id: randomUUID(),
      reconciliation: { genre: 'jean@exemple.fr', motif: 'Jean Dupont', nombre: -1 },
    });
    expect(texte).not.toContain('jean');
    expect(texte).not.toContain('Dupont');
    expect(texte).toContain('réconciliation illisible · motif illisible · illisible');
  });
});
