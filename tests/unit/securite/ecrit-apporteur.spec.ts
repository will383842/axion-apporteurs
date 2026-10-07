// @req REQ-DM-043
// @req REQ-SEC-016
/**
 * UX-P1-62 — l'écrit de l'apporteur (« Écrire à Axion-IA »), EN PROCESSUS : le juge du texte, l'écrivain
 * par la couche de cloisonnement, le débit par le second secret (conditions a à g de la sécurité,
 * relayées par la coordination ; forme d'A02 #319 6038168915 et 6038475209 ; textes de la juriste
 * #319 6038148824). Toutes les valeurs de plafond sont FACTICES.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  CLES_DES_PLAFONDS_DE_L_ECRIT,
  COMPTEURS,
  SECRET_DU_COMPTEUR,
  VARIABLE_DES_PLAFONDS_DE_L_ECRIT,
  limiter,
  lirePlafondsDeLEcrit,
  sujetDepuisEmpreinte,
} from '../../../src/server/securite/rate-limit';
import {
  ErreurEcrit,
  MODELE_DE_L_ECRIT,
  jugerLEcrit,
  recevoirUnEcrit,
} from '../../../src/server/ecrit/recevoir';
import { ECRIT_CARACTERES_MAX } from '../../../src/domain/seuils/ssot';
import {
  CLES_REFUSEES,
  MODELES_EN_AJOUT_SEUL,
  type AccesApporteur,
} from '../../../src/server/acces/for-apporteur';
import { clesPii, decryptPii } from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const FACTICES = 'session=2;apporteur=5;fenetre_session_minutes=10;fenetre_apporteur_minutes=600';
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-ux-p1-62-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'b'.repeat(64),
});
const MARQUEUR = 'ECRIT-DE-TEMOIN-62';

/** Un double de la couche : la création seule, typée comme l'écrivain la reçoit. */
function couche(
  creer: (data: Record<string, unknown>) => Promise<{ id: string; recuAt: Date }>,
  lister: () => Promise<{ id: string; recuAt: Date }[]> = async () => []
) {
  const double = { ecritApporteur: { creer, lister } };
  return double as unknown as Pick<AccesApporteur, 'ecritApporteur'>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('REQ-SEC-016 — le débit de l’écrit : deux compteurs hors dépôt, SON secret, échec fermé', () => {
  it('REQ-SEC-016 : les deux compteurs `ecrit:` portent la sentinelle hors dépôt, `refuser`, et lisent SEUL le secret de l’écrit', () => {
    for (const nom of ['ecrit:session', 'ecrit:apporteur'] as const) {
      expect(COMPTEURS[nom]).toMatchObject({
        prefixe: 'ecrit:',
        limite: 'hors-depot',
        fenetreSecondes: 'hors-depot',
        surPanne: 'refuser',
      });
      expect(SECRET_DU_COMPTEUR[nom]).toBe('PARTNERS_ECRIT_PLAFONDS');
    }
  });

  it('REQ-SEC-016 : TÉMOIN — une forme valide se lit, clé par clé', () => {
    const l = lirePlafondsDeLEcrit(FACTICES);
    expect(l.ok).toBe(true);
    if (l.ok)
      expect(Object.keys(l.plafonds).sort()).toEqual([...CLES_DES_PLAFONDS_DE_L_ECRIT].sort());
  });

  it.each([
    ['absent', undefined, '(forme)', 'absent'],
    ['inconnue', `${FACTICES};ip=3`, '(forme)', 'inconnue'],
    ['en double', `${FACTICES};session=1`, 'session', 'en_double'],
    [
      'absente',
      'session=2;apporteur=5;fenetre_session_minutes=10',
      'fenetre_apporteur_minutes',
      'absente',
    ],
    ['limite nulle', FACTICES.replace('session=2', 'session=0'), 'session', 'hors_bornes'],
    [
      'session au-dessus de l’apporteur',
      FACTICES.replace('session=2', 'session=9'),
      'session',
      'incoherente',
    ],
  ] as const)(
    'REQ-SEC-016 : TÉMOIN — %s : refusé, la clé et un motif fermé, jamais la valeur',
    (_l, t, cle, motif) => {
      const l = lirePlafondsDeLEcrit(t);
      expect(l).toEqual({ ok: false, cle, motif });
      expect(JSON.stringify(l)).not.toMatch(/\d/);
    }
  );

  it('REQ-SEC-016 : TÉMOIN — sans secret, ou avec le secret de la VÉRIFICATION seul, chaque compteur de l’écrit REFUSE', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const sujet = sujetDepuisEmpreinte('c'.repeat(64));
    vi.stubEnv(
      'PARTNERS_VERIFICATION_PLAFONDS',
      'identite_jour=7;identite_court=2;ip_jour=9;fenetre_jour_minutes=600;fenetre_court_minutes=5'
    );
    vi.stubEnv(VARIABLE_DES_PLAFONDS_DE_L_ECRIT, '');
    for (const nom of ['ecrit:session', 'ecrit:apporteur'] as const) {
      expect(await limiter(nom, sujet, 0)).toMatchObject({
        autorise: false,
        panne: true,
        motif: 'limite_non_configuree',
      });
    }
  });
});

describe('REQ-DM-043 — le texte de l’écrit : jugé à la saisie, borné en points de code', () => {
  it('REQ-DM-043 : TÉMOIN — vide, il est refusé par son CODE seul', () => {
    for (const vide of ['', '   ', '\n\t']) {
      expect(() => jugerLEcrit(vide)).toThrow(ErreurEcrit);
      try {
        jugerLEcrit(vide);
      } catch (e) {
        expect((e as ErreurEcrit).motif).toBe('message_vide');
      }
    }
  });

  it('REQ-DM-043 : TÉMOIN — la borne de la SSOT, en POINTS DE CODE : la borne passe, un de plus est refusé, jamais tronqué', () => {
    const emoji = '😀';
    expect([...jugerLEcrit(emoji.repeat(ECRIT_CARACTERES_MAX.valeur))]).toHaveLength(
      ECRIT_CARACTERES_MAX.valeur
    );
    expect(() => jugerLEcrit(emoji.repeat(ECRIT_CARACTERES_MAX.valeur + 1))).toThrow(/trop_long/);
  });
});

describe('REQ-DM-043 — l’écrivain passe par la COUCHE, en ajout seul', () => {
  it('REQ-DM-043 : l’écrit est un modèle cloisonné en ajout seul ; l’apporteur, la date et la purge ne s’écrivent jamais de l’espace', () => {
    expect(MODELES_EN_AJOUT_SEUL).toContain('ecritApporteur');
    expect([...CLES_REFUSEES.ecritApporteur].sort()).toEqual(
      ['apporteur', 'apporteurId', 'recuAt', 'textePurgeAt'].sort()
    );
  });

  it('REQ-DM-043 : TÉMOIN — l’écrivain ne passe ni apporteur ni date ; il chiffre sous l’AAD de SON écrit, et rend la date de la ligne écrite', async () => {
    const recu = new Date('2026-10-08T12:32:00.000Z');
    const appels: Record<string, unknown>[] = [];
    const acces = couche(async (data) => {
      appels.push(data);
      return { id: String(data.id), recuAt: recu };
    });
    const r = await recevoirUnEcrit(
      acces,
      { cleIdempotence: randomUUID(), texte: `Je conteste. ${MARQUEUR}` },
      CLES
    );
    expect(appels).toHaveLength(1);
    expect(Object.keys(appels[0]!).sort()).toEqual(['cleIdempotence', 'id', 'texteChiffre']);
    expect(r).toEqual({ ecritId: appels[0]!.id, recuAt: recu });
    const clair = decryptPii(
      { modele: MODELE_DE_L_ECRIT, champ: 'texteChiffre', id: appels[0]!.id as string },
      appels[0]!.texteChiffre as Uint8Array,
      CLES
    );
    expect(clair).toBe(`Je conteste. ${MARQUEUR}`);
    expect(JSON.stringify(r)).not.toContain(MARQUEUR);
  });

  it('REQ-DM-043 : TÉMOIN — une demande qui porte un `id`, ou tout champ hors liste, est REFUSÉE par le schéma strict, et rien n’est créé', async () => {
    const creer = vi.fn();
    const FORGE = '00000000-0000-4000-8000-000000000000';
    for (const surplus of [{ id: FORGE }, { apporteurId: FORGE }, { recuAt: new Date(0) }]) {
      const demande: Record<string, unknown> = {
        texte: 'Écrit.',
        cleIdempotence: randomUUID(),
        ...surplus,
      };
      await expect(
        recevoirUnEcrit(couche(creer), demande as { texte: string; cleIdempotence: string }, CLES)
      ).rejects.toThrow(/demande_invalide/);
    }
    expect(creer).not.toHaveBeenCalled();
  });

  it('REQ-DM-043 : TÉMOIN — l’écrit créé porte un id tiré par le SERVEUR, neuf à chaque écrit, différent de tout id fourni', async () => {
    const ids: string[] = [];
    const acces = couche(async (data) => {
      ids.push(String(data.id));
      return { id: String(data.id), recuAt: new Date(0) };
    });
    await recevoirUnEcrit(acces, { cleIdempotence: randomUUID(), texte: 'Écrit.' }, CLES);
    await recevoirUnEcrit(acces, { cleIdempotence: randomUUID(), texte: 'Écrit.' }, CLES);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain('00000000-0000-4000-8000-000000000000');
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('REQ-DM-043 : TÉMOIN — l’AAD lie le texte à SON écrit : relu sous l’id de sa ligne, il passe ; relu sous un autre id, il échoue', async () => {
    let chiffre: Uint8Array | undefined;
    let id = '';
    await recevoirUnEcrit(
      couche(async (data) => {
        chiffre = data.texteChiffre as Uint8Array;
        id = String(data.id);
        return { id, recuAt: new Date(0) };
      }),
      { cleIdempotence: randomUUID(), texte: `Écrit. ${MARQUEUR}` },
      CLES
    );
    const lire = (sous: string) =>
      decryptPii({ modele: MODELE_DE_L_ECRIT, champ: 'texteChiffre', id: sous }, chiffre!, CLES);
    expect(lire(id)).toBe(`Écrit. ${MARQUEUR}`);
    expect(() => lire('0190a5c0-0000-7000-8000-00000000ffff')).toThrow();
  });

  it('REQ-DM-043 : TÉMOIN statique — `SansProprietaireAvecId` n’est employé QUE pour l’écrit, dans la couche ; tout autre emploi rougit', () => {
    const couche = readFileSync('src/server/acces/for-apporteur.ts', 'utf8');
    // La déclaration du type (`SansProprietaireAvecId<C> =`) n'est pas un emploi.
    const emplois = [...couche.matchAll(/SansProprietaireAvecId<([A-Za-z]+)>(?!s*=)/g)].map(
      (m) => m[1]
    );
    expect(emplois).toEqual(['CEcrit']);
    const sources = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const c = `${d}/${n}`;
        return statSync(c).isDirectory() ? sources(c) : /\.tsx?$/.test(n) ? [c] : [];
      });
    const ailleurs = sources('src').filter(
      (c) =>
        c !== 'src/server/acces/for-apporteur.ts' &&
        readFileSync(c, 'utf8').includes('SansProprietaireAvecId')
    );
    expect(ailleurs).toEqual([]);
  });

  it('REQ-DM-043 : TÉMOIN — un texte refusé n’écrit RIEN', async () => {
    const creer = vi.fn();
    await expect(
      recevoirUnEcrit(couche(creer), { cleIdempotence: randomUUID(), texte: ' ' }, CLES)
    ).rejects.toThrow(/message_vide/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('REQ-DM-043 : TÉMOIN statique — le texte de l’écrit n’entre dans aucun journal, événement ni notification', () => {
    const sources = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const c = `${d}/${n}`;
        return statSync(c).isDirectory() ? sources(c) : /\.tsx?$/.test(n) ? [c] : [];
      });
    for (const c of sources('src/server/ecrit')) {
      const code = readFileSync(c, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(code, c).not.toMatch(
        /ajouterEvenement|notificationEspace|console\.|logger|process\.stderr/
      );
    }
  });
});

describe('REQ-DM-043 — la clé d’idempotence : un envoi rejoué ne crée pas deux écrits (condition e)', () => {
  const RECU = {
    id: '0190a5c0-0000-7000-8000-00000000e001',
    recuAt: new Date('2026-10-08T12:32:00.000Z'),
  };

  it('REQ-DM-043 : TÉMOIN — une clé absente ou mal formée est refusée AVANT toute écriture', async () => {
    const creer = vi.fn();
    for (const cle of ['', 'pas-une-cle', '1234']) {
      await expect(
        recevoirUnEcrit(couche(creer), { cleIdempotence: cle, texte: 'Écrit.' }, CLES)
      ).rejects.toThrow(/cle_invalide/);
    }
    expect(creer).not.toHaveBeenCalled();
  });

  it('REQ-DM-043 : TÉMOIN — une clé déjà employée dans la MÊME session rend l’écrit existant, sans second écrit', async () => {
    const creer = vi.fn();
    const r = await recevoirUnEcrit(
      couche(creer, async () => [RECU]),
      { cleIdempotence: randomUUID(), texte: 'Écrit.' },
      CLES
    );
    expect(r).toEqual({ ecritId: RECU.id, recuAt: RECU.recuAt });
    expect(creer).not.toHaveBeenCalled();
  });

  it('REQ-DM-043 : TÉMOIN — deux envois concurrents : le second, sur la violation d’unicité, relit et rend l’écrit du premier', async () => {
    let lectures = 0;
    const r = await recevoirUnEcrit(
      couche(
        async () => {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        },
        async () => (lectures++ === 0 ? [] : [RECU])
      ),
      { cleIdempotence: randomUUID(), texte: 'Écrit.' },
      CLES
    );
    expect(r).toEqual({ ecritId: RECU.id, recuAt: RECU.recuAt });
  });

  it('REQ-DM-043 : TÉMOIN — la clé d’un AUTRE apporteur est refusée par son code seul, sans rien révéler', async () => {
    const refus = recevoirUnEcrit(
      couche(async () => {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }),
      { cleIdempotence: randomUUID(), texte: `Écrit. ${MARQUEUR}` },
      CLES
    );
    await expect(refus).rejects.toThrow(/^écrit : cle_deja_employee$/);
  });
});
