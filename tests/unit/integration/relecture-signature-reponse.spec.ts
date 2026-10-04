// @req REQ-INT-012
// @req REQ-INT-013
/**
 * INT-T74-P — la réponse de relecture est signée sur une chaîne CANONIQUE, construite par UNE
 * fonction partagée par le contrat (`packages/contracts/signature-relecture.ts`, condition 3 de la
 * sécurité, forme d'A02) : `<horodatage>.<after_sequence>.<limit>.<x-axionia-derniere-sequence>.
 * <x-axionia-suite>.<corps exact>`, l'ordre déclaré au `$comment` de la route dans
 * `contracts.v3.json`.
 *
 * LES VECTEURS sont figés HORS DU CODE : leur HMAC est calculé par `openssl`, la commande est écrite
 * dans le fichier. Axion-ia reprend le même fichier ; deux implémentations qui rendent la même
 * chaîne et le même HMAC sur ces vecteurs signent et vérifient la même chose.
 *
 * LES NOMBRES s'écrivent en base 10, sans zéro de tête : une seule écriture par valeur, sans quoi
 * deux chaînes distinctes signeraient la même lecture. Tout autre nombre est REFUSÉ, jamais
 * normalisé.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  chaineCanoniqueDeRelecture,
  NombreNonCanonique,
} from '../../../packages/contracts/signature-relecture';
import { artefacts } from '../../../scripts/contracts/export';
import { kidDe, type Trousseau } from '../../../src/lib/env';
import {
  CHEMIN_RELECTURE,
  LIMITE_PAR_PAGE,
  clientRelecture,
  type CanalAxionia,
} from '../../../src/server/integrations/axionia/relecture';
import { clientRejeu } from '../../../src/server/integrations/axionia/reconciliation';

type Vecteur = {
  nom: string;
  entrees: {
    horodatage: string;
    afterSequence: string;
    limit: string;
    derniereSequence: string;
    suite: string;
    corps: string;
  };
  chaine: string;
  hmacSha256: string;
};
const FICHIER = JSON.parse(
  readFileSync('packages/contracts/fixtures/signature-relecture.vecteurs.json', 'utf8')
) as { secret: string; commande: string; vecteurs: Vecteur[] };

const hmac = (chaine: string) =>
  createHmac('sha256', FICHIER.secret).update(chaine, 'utf8').digest('hex');

describe('REQ-INT-012 — la chaîne canonique de la réponse de relecture (INT-T74-P)', () => {
  it('REQ-INT-012 : le fichier porte au moins quatre vecteurs (page pleine, page vide, dernière page, au-delà de MAX_SAFE_INTEGER) et la commande openssl qui les a calculés', () => {
    expect(FICHIER.vecteurs.map((v) => v.nom)).toEqual(
      expect.arrayContaining([
        'page pleine',
        'page vide',
        'dernière page',
        'au-delà de MAX_SAFE_INTEGER',
      ])
    );
    expect(FICHIER.commande).toMatch(/^printf '%s' .* \| openssl dgst -sha256 -hmac /);
  });

  it('REQ-INT-012 : chaque vecteur donne la chaîne attendue, et son HMAC est celui calculé par openssl', () => {
    for (const v of FICHIER.vecteurs) {
      const chaine = chaineCanoniqueDeRelecture(v.entrees);
      expect(chaine, v.nom).toBe(v.chaine);
      expect(hmac(chaine), v.nom).toBe(v.hmacSha256);
    }
  });

  it('REQ-INT-012 : les nombres entiers et bigint s’écrivent comme leur forme décimale', () => {
    const v = FICHIER.vecteurs[0]!;
    expect(
      chaineCanoniqueDeRelecture({
        ...v.entrees,
        afterSequence: 3n,
        limit: 100,
        derniereSequence: 5n,
        suite: 1,
      })
    ).toBe(v.chaine);
  });

  it.each([
    ['un zéro de tête', '03'],
    ['un négatif', '-1'],
    ['un décimal', '1.5'],
    ['un signe plus', '+3'],
    ['une chaîne vide', ''],
    ['des espaces', ' 3'],
    ['une notation exponentielle', '3e2'],
  ])(
    'REQ-INT-012 : un nombre non canonique (%s) est REFUSÉ, nommé, jamais normalisé',
    (_cas, valeur) => {
      const v = FICHIER.vecteurs[0]!;
      for (const champ of [
        'horodatage',
        'afterSequence',
        'limit',
        'derniereSequence',
        'suite',
      ] as const) {
        expect(() => chaineCanoniqueDeRelecture({ ...v.entrees, [champ]: valeur }), champ).toThrow(
          NombreNonCanonique
        );
      }
    }
  );

  it('REQ-INT-012 : un nombre JavaScript négatif, non entier ou non sûr est refusé', () => {
    const v = FICHIER.vecteurs[0]!;
    for (const valeur of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, -1n]) {
      expect(() => chaineCanoniqueDeRelecture({ ...v.entrees, afterSequence: valeur })).toThrow(
        NombreNonCanonique
      );
    }
  });

  it('REQ-INT-012 : TÉMOIN au-delà de MAX_SAFE_INTEGER — la chaîne porte la séquence EXACTE ; sa forme bigint la rend, sa forme number est refusée', () => {
    const v = FICHIER.vecteurs.find((x) => x.nom === 'au-delà de MAX_SAFE_INTEGER')!;
    expect(v.entrees.afterSequence).toBe('9007199254740993');
    expect(BigInt(v.entrees.afterSequence) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(
      chaineCanoniqueDeRelecture({
        ...v.entrees,
        afterSequence: 9007199254740993n,
        derniereSequence: 9007199254740993n,
      })
    ).toBe(v.chaine);
    // Le même nombre en `number` s'arrondit à 9007199254740992 : il signerait une AUTRE lecture.
    expect(() =>
      chaineCanoniqueDeRelecture({ ...v.entrees, afterSequence: Number('9007199254740993') })
    ).toThrow(NombreNonCanonique);
  });

  it('REQ-INT-012 : la suite ne vaut que 0 ou 1', () => {
    const v = FICHIER.vecteurs[0]!;
    expect(() => chaineCanoniqueDeRelecture({ ...v.entrees, suite: '2' })).toThrow(
      NombreNonCanonique
    );
  });

  it('REQ-INT-012 : TÉMOIN — une page authentique, rejouée sur une autre after_sequence ou une autre limit, ne vérifie plus', () => {
    const v = FICHIER.vecteurs[0]!;
    const signee = v.hmacSha256;
    expect(hmac(chaineCanoniqueDeRelecture({ ...v.entrees, afterSequence: '10' }))).not.toBe(
      signee
    );
    expect(hmac(chaineCanoniqueDeRelecture({ ...v.entrees, limit: '500' }))).not.toBe(signee);
    expect(hmac(chaineCanoniqueDeRelecture({ ...v.entrees, suite: '0' }))).not.toBe(signee);
    expect(hmac(chaineCanoniqueDeRelecture(v.entrees))).toBe(signee);
  });
});

// ── le client : la réponse de relecture se vérifie sur la chaîne canonique, et sur elle seule ─────

const MAINTENANT_MS = Date.UTC(2026, 9, 4, 8, 0, 0);
const T = String(Math.floor(MAINTENANT_MS / 1000));
const SECRET_EMISSION = randomBytes(32).toString('hex');
const TROUSSEAU: Trousseau = { courante: SECRET_EMISSION, precedente: null };
const sous = (chaine: string) =>
  createHmac('sha256', SECRET_EMISSION).update(chaine, 'utf8').digest('hex');

type Page = {
  corps: string;
  derniere: string;
  suite: string;
  /** Ce que la SIGNATURE couvre, quand il diffère de ce qui est demandé ou servi. */
  signee?: { afterSequence?: string; limit?: string; derniere?: string; suite?: string };
  /** La forme COURTE `<t>.<corps>`, que la bascule ne tolère jamais. */
  formeCourte?: boolean;
  horodatage?: string;
  sans?: string[];
};

/** Un axion-ia qui sert la page donnée, signée sur la chaîne canonique de la requête REÇUE. */
function canal(p: Page, maintenantMs = MAINTENANT_MS) {
  const appeler = (async (entree: URL | RequestInfo) => {
    const u = new URL(String(entree));
    const t = p.horodatage ?? T;
    const signature = p.formeCourte
      ? sous(`${t}.${p.corps}`)
      : // L'oracle joint à la main, sans la fonction jugée : l'ordre du `$comment` du contrat.
        sous(
          [
            t,
            p.signee?.afterSequence ?? u.searchParams.get('after_sequence'),
            p.signee?.limit ?? u.searchParams.get('limit'),
            p.signee?.derniere ?? p.derniere,
            p.signee?.suite ?? p.suite,
            p.corps,
          ].join('.')
        );
    const entetes: Record<string, string> = {
      'x-axionia-timestamp': t,
      'x-axionia-signature': signature,
      'x-axionia-kid': kidDe(SECRET_EMISSION),
      'x-axionia-derniere-sequence': p.derniere,
      'x-axionia-suite': p.suite,
    };
    for (const k of p.sans ?? []) delete entetes[k];
    return new Response(p.corps, { status: 200, headers: entetes });
  }) as typeof fetch;
  const c: CanalAxionia = {
    urlAxionia: 'https://axion-ia.test',
    secretRelecture: 'secret-de-relecture',
    trousseauEmission: TROUSSEAU,
    appeler,
    maintenantMs: () => maintenantMs,
  };
  return c;
}

const ligne = (sequence: number) =>
  JSON.stringify({ event_id: randomUUID(), event_type: 'client.cree', sequence, payload: {} });

/** La page que la file rend après 3 : les séquences 4 et 5, et il en reste. */
const APRES_3: Page = { corps: [ligne(4), ligne(5)].join('\n'), derniere: '5', suite: '1' };

describe('REQ-INT-012 — le client de relecture vérifie la chaîne CANONIQUE (INT-T74-P)', () => {
  it('REQ-INT-012 : une page signée sur la chaîne canonique de SA requête est rendue', async () => {
    const r = await clientRelecture(canal(APRES_3))(3n);
    expect(r.ok && [r.lignes.map((l) => l.sequence), r.derniereSequence, r.suite]).toEqual([
      [4n, 5n],
      5n,
      true,
    ]);
  });

  it('REQ-INT-012 : TÉMOIN LOCKSTEP — la forme courte `<horodatage>.<corps>` est REFUSÉE, jamais acceptée en repli', async () => {
    expect(await clientRelecture(canal({ ...APRES_3, formeCourte: true }))(3n)).toEqual({
      ok: false,
      motif: 'signature_refusee',
    });
  });

  it('REQ-INT-012 : TÉMOIN « D1 » — une page authentique d’une AUTRE lecture (after_sequence=10) servie à une demande à 3 est refusée', async () => {
    const autre: Page = {
      corps: [ligne(11), ligne(12)].join('\n'),
      derniere: '12',
      suite: '1',
      signee: { afterSequence: '10' },
    };
    expect(await clientRelecture(canal(autre))(3n)).toEqual({
      ok: false,
      motif: 'signature_refusee',
    });
    // L'autre face : la même page, servie à SA lecture, passe.
    expect((await clientRelecture(canal({ ...autre, signee: undefined }))(10n)).ok).toBe(true);
  });

  it('REQ-INT-012 : TÉMOIN au-delà de MAX_SAFE_INTEGER — la page vide au curseur 9007199254740993 est rendue sans arrondi ; signée pour le curseur arrondi, refusée', async () => {
    const vide: Page = { corps: '', derniere: '9007199254740993', suite: '0' };
    const r = await clientRelecture(canal(vide))(9007199254740993n);
    expect(r.ok && [r.lignes, r.derniereSequence, r.suite]).toEqual([[], 9007199254740993n, false]);
    expect(
      await clientRelecture(canal({ ...vide, signee: { afterSequence: '9007199254740992' } }))(
        9007199254740993n
      )
    ).toEqual({ ok: false, motif: 'signature_refusee' });
  });

  it('REQ-INT-012 : une page authentique signée pour une autre `limit` est refusée', async () => {
    expect(await clientRelecture(canal({ ...APRES_3, signee: { limit: '500' } }))(3n)).toEqual({
      ok: false,
      motif: 'signature_refusee',
    });
    expect(String(LIMITE_PAR_PAGE)).not.toBe('500');
  });

  it('REQ-INT-012 : TÉMOIN « D2 » — un en-tête X-Axionia-Suite modifié APRÈS la signature est refusé', async () => {
    expect(
      await clientRelecture(canal({ ...APRES_3, suite: '0', signee: { suite: '1' } }))(3n)
    ).toEqual({ ok: false, motif: 'signature_refusee' });
  });

  it('REQ-INT-012 : un en-tête X-Axionia-Derniere-Sequence modifié après la signature est refusé', async () => {
    const page: Page = {
      corps: ligne(4),
      derniere: '4',
      suite: '0',
      signee: { derniere: '9' },
    };
    expect(await clientRelecture(canal(page))(3n)).toEqual({
      ok: false,
      motif: 'signature_refusee',
    });
  });

  it.each([
    ['x-axionia-derniere-sequence', 'entete_illisible'],
    ['x-axionia-suite', 'entete_illisible'],
    ['x-axionia-timestamp', 'signature_refusee'],
    ['x-axionia-signature', 'signature_refusee'],
  ])('REQ-INT-012 : TÉMOIN — un en-tête signé absent (%s) est refusé', async (entete, motif) => {
    expect(await clientRelecture(canal({ ...APRES_3, sans: [entete] }))(3n)).toEqual({
      ok: false,
      motif,
    });
  });

  it('REQ-INT-012 : un en-tête numérique écrit avec un zéro de tête est refusé, jamais normalisé', async () => {
    expect(await clientRelecture(canal({ ...APRES_3, derniere: '05' }))(3n)).toEqual({
      ok: false,
      motif: 'entete_illisible',
    });
    expect(await clientRelecture(canal({ ...APRES_3, horodatage: `0${T}` }))(3n)).toEqual({
      ok: false,
      motif: 'signature_refusee',
    });
  });

  it('REQ-INT-012 : TÉMOIN FRAÎCHEUR à deux faces, à la milliseconde — 300 s passent, 300 s et 1 ms sont refusées', async () => {
    const t0 = Number(T) * 1000;
    for (const ecart of [300_000, -300_000]) {
      expect((await clientRelecture(canal(APRES_3, t0 + ecart))(3n)).ok, String(ecart)).toBe(true);
    }
    for (const ecart of [300_001, -300_001]) {
      expect(await clientRelecture(canal(APRES_3, t0 + ecart))(3n), String(ecart)).toEqual({
        ok: false,
        motif: 'signature_refusee',
      });
    }
  });

  it('REQ-INT-012 : TÉMOIN BOM à deux faces — une page AUTHENTIQUE préfixée d’un indicateur d’ordre est refusée `ligne_illisible`, jamais lue en le retirant ; sans lui, elle passe', async () => {
    expect((await clientRelecture(canal(APRES_3))(3n)).ok).toBe(true);
    expect(
      await clientRelecture(canal({ ...APRES_3, corps: `\uFEFF${APRES_3.corps}` }))(3n)
    ).toEqual({ ok: false, motif: 'ligne_illisible' });
  });

  it('REQ-INT-012 : la cible demandée est celle que la chaîne lie — `after_sequence` et `limit` en chiffres canoniques', async () => {
    const cibles: string[] = [];
    const c = canal(APRES_3);
    const appeler = c.appeler;
    await clientRelecture({
      ...c,
      appeler: (async (e: URL | RequestInfo, i?: RequestInit) => {
        const u = new URL(String(e));
        cibles.push(`${u.pathname}${u.search}`);
        return appeler(e, i);
      }) as typeof fetch,
    })(3n);
    expect(cibles).toEqual([`${CHEMIN_RELECTURE}?after_sequence=3&limit=${LIMITE_PAR_PAGE}`]);
  });
});

// ── le rejeu : la réponse dit EXACTEMENT ce qui a été demandé ──────────────────────────────────────

/**
 * Un axion-ia qui répond `reponse` à la demande de rejeu, signé (forme du rejeu, inchangée). `prefixe`
 * précède le JSON dans les octets SIGNÉS : la réponse reste authentique.
 */
function canalDeRejeu(reponse: unknown, maintenantMs = MAINTENANT_MS, prefixe = '') {
  const corps = prefixe + JSON.stringify(reponse);
  const appeler = (async () =>
    new Response(corps, {
      status: 200,
      headers: {
        'x-axionia-timestamp': T,
        'x-axionia-signature': sous(`${T}.${corps}`),
        'x-axionia-kid': kidDe(SECRET_EMISSION),
      },
    })) as typeof fetch;
  return {
    urlAxionia: 'https://axion-ia.test',
    secretRelecture: 'secret-de-relecture',
    trousseauEmission: TROUSSEAU,
    appeler,
    maintenantMs: () => maintenantMs,
  } satisfies CanalAxionia;
}

describe('REQ-INT-013 — la réponse de rejeu : rearmes ∪ introuvables égale EXACTEMENT la demande (INT-T74-P)', () => {
  const [a, b, x] = [randomUUID(), randomUUID(), randomUUID()];

  it('REQ-INT-013 : TÉMOIN à deux faces — la réponse de SA demande passe ; celle d’une autre demande est refusée, nommée', async () => {
    expect(await clientRejeu(canalDeRejeu({ rearmes: [a], introuvables: [b] }))([a, b])).toEqual({
      ok: true,
      rearmes: 1,
      introuvables: 1,
    });
    // La face refusée a la TAILLE de la demande : seule la vérification identifiant par identifiant
    // la distingue, jamais la comparaison des tailles.
    expect(await clientRejeu(canalDeRejeu({ rearmes: [x], introuvables: [b] }))([a, b])).toEqual({
      ok: false,
      motif: 'reponse_hors_demande',
    });
  });

  it('REQ-INT-013 : TÉMOIN BOM à deux faces — la réponse AUTHENTIQUE préfixée d’un indicateur d’ordre est refusée `reponse_illisible` (échec fermé) ; sans lui, elle passe', async () => {
    const reponse = { rearmes: [a], introuvables: [b] };
    expect((await clientRejeu(canalDeRejeu(reponse))([a, b])).ok).toBe(true);
    expect(await clientRejeu(canalDeRejeu(reponse, MAINTENANT_MS, '\uFEFF'))([a, b])).toEqual({
      ok: false,
      motif: 'reponse_illisible',
    });
  });

  it('REQ-INT-013 : la demande est jugée dédoublonnée — un identifiant demandé deux fois se rend une fois', async () => {
    expect(await clientRejeu(canalDeRejeu({ rearmes: [a], introuvables: [] }))([a, a])).toEqual({
      ok: true,
      rearmes: 1,
      introuvables: 0,
    });
  });

  it.each<[string, unknown]>([
    ['un identifiant demandé manque', { rearmes: [a], introuvables: [] }],
    ['un identifiant non demandé s’ajoute', { rearmes: [a, b, x], introuvables: [] }],
    ['un identifiant est à la fois réarmé et introuvable', { rearmes: [a, b], introuvables: [b] }],
    ['un identifiant est rendu deux fois', { rearmes: [a, a, b], introuvables: [] }],
    ['un identifiant n’est pas une chaîne', { rearmes: [a, 1], introuvables: [b] }],
    // De MÊME TAILLE que la demande `[a, b]` : la comparaison des tailles ne les refuse pas.
    [
      'même taille — un identifiant non demandé à la place d’un demandé',
      { rearmes: [a], introuvables: [x] },
    ],
    ['même taille — un identifiant rendu deux fois', { rearmes: [a, a], introuvables: [] }],
    [
      'même taille — un identifiant à la fois réarmé et introuvable',
      { rearmes: [a], introuvables: [a] },
    ],
    ['même taille — un identifiant n’est pas une chaîne', { rearmes: [a, 1], introuvables: [] }],
  ])('REQ-INT-013 : réponse refusée `reponse_hors_demande` — %s', async (_cas, reponse) => {
    expect(await clientRejeu(canalDeRejeu(reponse))([a, b])).toEqual({
      ok: false,
      motif: 'reponse_hors_demande',
    });
  });

  it('REQ-INT-013 : TÉMOIN FRAÎCHEUR à deux faces, à la milliseconde, sur la réponse de rejeu', async () => {
    const t0 = Number(T) * 1000;
    const r = { rearmes: [a], introuvables: [b] };
    expect((await clientRejeu(canalDeRejeu(r, t0 + 300_000))([a, b])).ok).toBe(true);
    expect(await clientRejeu(canalDeRejeu(r, t0 + 300_001))([a, b])).toEqual({
      ok: false,
      motif: 'signature_refusee',
    });
  });
});

// ── l'empreinte couvre la fonction partagée et ses vecteurs ───────────────────────────────────────

describe('REQ-INT-012 — contracts.sha256 couvre la chaîne canonique et ses vecteurs (INT-T74-P)', () => {
  const FICHIERS = [
    'signature-relecture.ts',
    'fixtures/signature-relecture.vecteurs.json',
  ] as const;
  // Les octets se lisent à la RACINE DU DÉPÔT, pas dans le répertoire courant : le bac à sable de
  // Stryker (sous `.stryker-tmp/`, dans le dépôt) ajoute `// @ts-nocheck` en tête de chaque `.ts`
  // qu'il copie, et l'empreinte d'une copie ainsi altérée ne dirait rien du fichier publié.
  const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const sha = (chemin: string) =>
    createHash('sha256')
      .update(readFileSync(`${racine}/packages/contracts/${chemin}`))
      .digest('hex');

  it('REQ-INT-012 : les deux fichiers ont leur ligne, APRÈS celle de contracts.v3.json, lue en premier par axion-ia', () => {
    const lignes = readFileSync(`${racine}/packages/contracts/contracts.sha256`, 'utf8')
      .trimEnd()
      .split('\n');
    expect(lignes[0]).toMatch(/^[0-9a-f]{64} {2}contracts\.v3\.json$/);
    expect(lignes.slice(1)).toEqual(FICHIERS.map((f) => `${sha(f)}  ${f}`));
  });

  it('REQ-INT-012 : l’empreinte est DÉRIVÉE par `pnpm contracts:export`, jamais écrite à la main', () => {
    const rendu = artefacts(racine).find((a) => a.chemin.endsWith('contracts.sha256'));
    expect(rendu?.contenu).toBe(
      readFileSync(`${racine}/packages/contracts/contracts.sha256`, 'utf8')
    );
  });
});
