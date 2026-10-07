// @req REQ-INT-022
// @req REQ-INT-023
/**
 * INT-T57 — le client HTTP du relais de courriels (ZeptoMail), qui remplace le port de production
 * qui refusait. `fetch` est simulé ; la forme de la requête est confrontée à l'exemple
 * officiel, transcrit dans `tests/fixtures/tiers/zeptomail-envoi.json` (lu le 2026-10-02, RM-08).
 *
 * CE QU'IL PROUVE :
 *   1. la requête : `POST <hôte>/v1.1/email`, `Authorization: Zoho-enczapikey <jeton>`, corps JSON de
 *      la forme officielle ; la réponse est réduite au `messageId` (`request_id`) ;
 *   2. l'hôte : une liste FERMÉE d'hôtes lus à la source ; toute autre URL est un refus nommé ;
 *   3. le délai est borné ; un échec rend une erreur NOMMÉE, jamais la sortie du prestataire ;
 *   4. une nouvelle tentative seulement quand le prestataire a REFUSÉ avant d'accepter (429) : jamais
 *      après une réponse incertaine (délai, 5xx, réseau) — aucun double envoi ;
 *   5. ni jeton, ni adresse, ni corps dans une erreur rendue ;
 *   6. sans configuration, le relais refuse `relais_non_configure` (REQ-INT-022 : rien ne part).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  EXIGES_SI_ENVOI_ACTIF,
  NOMS_DES_SECRETS,
  NOMS_DES_SECRETS_CONDITIONNELS,
  lireDemarrage,
} from '../../../src/lib/env';
import {
  CHEMIN_D_ENVOI,
  DELAI_D_ENVOI_MS,
  ECHECS_DU_RELAIS,
  HOTES_D_ENVOI,
  relaisZeptomail,
} from '../../../src/server/integrations/zeptomail/relais';

const FIXTURE = JSON.parse(readFileSync('tests/fixtures/tiers/zeptomail-envoi.json', 'utf8')) as {
  requete: { methode: string; chemin: string; corps: Record<string, unknown> };
  reponse200: { request_id: string };
  reponse400: unknown;
};

const JETON = 'jeton-temoin-int-t57-0123456789abcdefghijklmnop';
const URL_EU = 'https://api.zeptomail.eu/v1.1/email';
const MESSAGE = {
  de: 'contact@envoi.example.org',
  a: 'marie@example.org',
  sujet: 'Votre lien de connexion',
  corps: 'Bonjour\n\nhttps://partners.example.org/connexion/JETON-DU-LIEN',
  reference: '00000000-0000-4000-8000-000000000057',
};

type Appel = { url: string; init: RequestInit };

/** Un `fetch` simulé : chaque appel rend la réponse suivante de la liste (ou lève). */
function fetchSimule(reponses: Array<Response | Error | 'jamais'>) {
  const appels: Appel[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), init: init ?? {} });
    const r = reponses.shift();
    if (r === undefined) throw new Error('appel en trop');
    if (r === 'jamais') {
      return new Promise<Response>((_, rejeter) => {
        init?.signal?.addEventListener('abort', () => rejeter(init.signal!.reason));
      });
    }
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { f, appels };
}

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });

/** Le relais sous test ; `url` et `jeton` passent TELS QUELS, `undefined` compris. */
const relaisAvec = (f: typeof fetch, url: string | undefined, jeton: string | undefined) =>
  relaisZeptomail({ url, jeton, fetch: f, attendre: async () => undefined });
const relais = (f: typeof fetch, url: string = URL_EU) => relaisAvec(f, url, JETON);

async function echecDe(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('aucun échec');
}

describe('REQ-INT-022 — la requête a la forme officielle, la réponse se réduit au messageId', () => {
  it('REQ-INT-022 : POST au chemin officiel, jeton dans `Zoho-enczapikey`, corps de la forme de l’exemple officiel', async () => {
    const { f, appels } = fetchSimule([json(200, FIXTURE.reponse200)]);
    const r = await relais(f).envoyer(MESSAGE);
    expect(r).toEqual({ messageId: FIXTURE.reponse200.request_id });
    expect(appels).toHaveLength(1);
    const { url, init } = appels[0]!;
    expect(new URL(url).pathname).toBe(FIXTURE.requete.chemin);
    expect(CHEMIN_D_ENVOI).toBe(FIXTURE.requete.chemin);
    expect(init.method).toBe(FIXTURE.requete.methode);
    const entetes = new Headers(init.headers);
    expect(entetes.get('authorization')).toBe(`Zoho-enczapikey ${JETON}`);
    expect(entetes.get('content-type')).toBe('application/json');
    // Le jeton ne voyage QUE dans Authorization : ni dans l'URL entière (requête comprise), ni dans
    // aucun autre en-tête, ni dans le corps.
    expect(url).not.toContain(JETON);
    expect(new URL(url).search).toBe('');
    for (const [nom, valeur] of entetes.entries()) {
      if (nom !== 'authorization') expect(valeur, nom).not.toContain(JETON);
    }
    expect(String(init.body)).not.toContain(JETON);
    const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(corps).sort()).toEqual(Object.keys(FIXTURE.requete.corps).sort());
    expect(corps).toEqual({
      from: { address: MESSAGE.de },
      to: [{ email_address: { address: MESSAGE.a } }],
      subject: MESSAGE.sujet,
      textbody: MESSAGE.corps,
      client_reference: MESSAGE.reference,
      // UX-P1-64 (condition 6 du logo distant) : le suivi du fournisseur est éteint à chaque envoi.
      track_opens: false,
      track_clicks: false,
    });
  });

  it('REQ-INT-022 : une réponse 200 sans `request_id` lisible est un échec nommé, pas un envoi', async () => {
    const { f } = fetchSimule([json(200, { message: 'OK' })]);
    expect((await echecDe(relais(f).envoyer(MESSAGE))).message).toBe('relais_reponse_illisible');
  });
});

describe('REQ-INT-022 — l’hôte d’envoi : une liste fermée', () => {
  it('REQ-INT-022 : les hôtes admis sont ceux lus à la source, plus l’hôte européen (source tierce, à confirmer)', () => {
    expect([...HOTES_D_ENVOI].sort()).toEqual(
      ['api.zeptomail.com', 'api.zeptomail.eu', 'cpaas.zoho.com'].sort()
    );
  });

  it.each([
    ['un autre hôte', 'https://evil.example/v1.1/email'],
    ['un sous-domaine imité', 'https://api.zeptomail.eu.evil.example/v1.1/email'],
    ['http en clair', 'http://api.zeptomail.eu/v1.1/email'],
    ['un autre chemin', 'https://api.zeptomail.eu/v1.1/email/batch'],
    ['une URL illisible', 'pas une url'],
  ])('REQ-INT-022 : %s est refusé `relais_url_refusee`, sans aucun appel', async (_q, url) => {
    const { f, appels } = fetchSimule([json(200, FIXTURE.reponse200)]);
    expect((await echecDe(relais(f, url).envoyer(MESSAGE))).message).toBe('relais_url_refusee');
    expect(appels).toEqual([]);
  });

  it.each([
    ['sans URL', undefined, JETON],
    ['sans jeton', URL_EU, undefined],
    ['jeton vide', URL_EU, ''],
  ])(
    'REQ-INT-022 : %s, le relais refuse `relais_non_configure` et rien ne part',
    async (_q, url, jeton) => {
      const { f, appels } = fetchSimule([json(200, FIXTURE.reponse200)]);
      expect((await echecDe(relaisAvec(f, url, jeton).envoyer(MESSAGE))).message).toBe(
        'relais_non_configure'
      );
      expect(appels).toEqual([]);
    }
  );
});

describe('REQ-INT-023 — délai borné, échecs nommés, aucune nouvelle tentative incertaine', () => {
  it('REQ-INT-023 : le délai est borné ; dépassé, l’échec est `relais_delai_depasse` et rien n’est retenté', async () => {
    expect(DELAI_D_ENVOI_MS).toBeGreaterThan(0);
    expect(DELAI_D_ENVOI_MS).toBeLessThanOrEqual(30_000);
    const { f, appels } = fetchSimule(['jamais']);
    const r = relaisZeptomail({
      url: URL_EU,
      jeton: JETON,
      fetch: f,
      delaiMs: 5,
      attendre: async () => undefined,
    });
    expect((await echecDe(r.envoyer(MESSAGE))).message).toBe('relais_delai_depasse');
    expect(appels).toHaveLength(1);
  });

  it.each([
    [400, 'relais_requete_refusee'],
    [401, 'relais_refus_authentification'],
    [403, 'relais_refus_authentification'],
    [422, 'relais_requete_refusee'],
    [500, 'relais_indisponible'],
    [503, 'relais_indisponible'],
  ])('REQ-INT-023 : une réponse %i rend `%s`, UN seul appel', async (statut, code) => {
    const { f, appels } = fetchSimule([json(statut, FIXTURE.reponse400)]);
    expect((await echecDe(relais(f).envoyer(MESSAGE))).message).toBe(code);
    expect(appels).toHaveLength(1);
  });

  it('REQ-INT-022 : AUCUNE redirection n’est suivie — `redirect: error`, et la redirection refusée par fetch échoue fermé, sans second envoi du corps', async () => {
    const { f, appels } = fetchSimule([new TypeError('unexpected redirect')]);
    expect((await echecDe(relais(f).envoyer(MESSAGE))).message).toBe('relais_injoignable');
    expect(appels).toHaveLength(1);
    expect(appels[0]!.init.redirect).toBe('error');
  });

  it.each([307, 308])(
    'REQ-INT-022 : une réponse %i qui arriverait quand même est refusée `relais_redirection_refusee`, un seul appel',
    async (statut) => {
      const { f, appels } = fetchSimule([
        new Response(null, {
          status: statut,
          headers: { location: 'https://evil.example/v1.1/email' },
        }),
      ]);
      expect((await echecDe(relais(f).envoyer(MESSAGE))).message).toBe(
        'relais_redirection_refusee'
      );
      expect(appels).toHaveLength(1);
    }
  );

  it('REQ-INT-023 : une panne réseau rend `relais_injoignable`, sans nouvelle tentative (l’envoi a pu partir)', async () => {
    const { f, appels } = fetchSimule([new TypeError('fetch failed')]);
    expect((await echecDe(relais(f).envoyer(MESSAGE))).message).toBe('relais_injoignable');
    expect(appels).toHaveLength(1);
  });

  it('REQ-INT-023 : un 429 (refusé AVANT acceptation) est retenté une fois ; le second essai réussit, un seul envoi accepté', async () => {
    const { f, appels } = fetchSimule([json(429, {}), json(200, FIXTURE.reponse200)]);
    expect(await relais(f).envoyer(MESSAGE)).toEqual({ messageId: FIXTURE.reponse200.request_id });
    expect(appels).toHaveLength(2);
    expect(appels[1]!.init.body).toBe(appels[0]!.init.body);
  });

  it('REQ-INT-023 : deux 429 de suite rendent `relais_debit_depasse`, et pas de troisième appel', async () => {
    const { f, appels } = fetchSimule([json(429, {}), json(429, {})]);
    expect((await echecDe(relais(f).envoyer(MESSAGE))).message).toBe('relais_debit_depasse');
    expect(appels).toHaveLength(2);
  });

  it('REQ-INT-023 : chaque échec rendu appartient à la liste FERMÉE', () => {
    expect([...ECHECS_DU_RELAIS].sort()).toEqual(
      [
        'relais_debit_depasse',
        'relais_delai_depasse',
        'relais_indisponible',
        'relais_injoignable',
        'relais_non_configure',
        'relais_refus_authentification',
        'relais_redirection_refusee',
        'relais_reponse_illisible',
        'relais_requete_refusee',
        'relais_url_refusee',
      ].sort()
    );
  });
});

describe('REQ-INT-022 — ni jeton, ni adresse, ni corps dans une erreur rendue', () => {
  it('REQ-INT-022 : une sortie du prestataire qui cite tout n’est JAMAIS rendue', async () => {
    const bavard = {
      data: { error_code: 'TM_3004', message: `${JETON} ${MESSAGE.a} ${MESSAGE.corps}` },
    };
    for (const reponse of [json(400, bavard), new Error(`${JETON} ${MESSAGE.a}`)]) {
      const { f } = fetchSimule([reponse]);
      const e = await echecDe(relais(f).envoyer(MESSAGE));
      const vu = JSON.stringify({ message: e.message, name: e.name, cause: String(e.cause ?? '') });
      for (const secret of [JETON, MESSAGE.a, 'JETON-DU-LIEN', 'TM_3004'])
        expect(vu).not.toContain(secret);
    }
  });
});

describe('REQ-INT-022 — le démarrage : le jeton et l’URL ne sont exigés que si l’envoi réel est allumé', () => {
  const base = (): Record<string, string> => {
    const env: Record<string, string> = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://partners@localhost:5432/partners',
      REDIS_URL: 'redis://localhost:6379',
      NOTIFY_SINK: 'true',
    };
    for (const nom of NOMS_DES_SECRETS)
      if (nom !== 'ZEPTOMAIL_SEND_TOKEN')
        env[nom] =
          nom === 'PII_ENCRYPTION_KEY'
            ? randomBytes(32).toString('hex')
            : randomBytes(24).toString('hex');
    return env;
  };
  const refusDe = (env: Record<string, string>) => {
    const r = lireDemarrage(env);
    return r.ok ? [] : r.refus.map((x) => `${x.variable} : ${x.motif}`);
  };

  it('REQ-INT-022 : envoi ÉTEINT, jeton et URL absents — le serveur démarre', () => {
    expect(refusDe(base())).toEqual([]);
    expect(refusDe({ ...base(), PARTNERS_EMAIL_DMARC_VERIFIE: 'false' })).toEqual([]);
  });

  it('REQ-INT-022 : envoi ALLUMÉ, jeton et URL absents — le démarrage échoue en les nommant', () => {
    expect(refusDe({ ...base(), PARTNERS_EMAIL_DMARC_VERIFIE: 'true' })).toEqual([
      'ZEPTOMAIL_SEND_TOKEN : requise_envoi_actif',
      'ZEPTOMAIL_API_URL : requise_envoi_actif',
    ]);
    expect([...EXIGES_SI_ENVOI_ACTIF]).toEqual(['ZEPTOMAIL_SEND_TOKEN', 'ZEPTOMAIL_API_URL']);
  });

  it('REQ-INT-022 : envoi ALLUMÉ, jeton et URL posés — le serveur démarre ; posé, le jeton suit les règles des secrets', () => {
    const allume = {
      ...base(),
      PARTNERS_EMAIL_DMARC_VERIFIE: 'true',
      ZEPTOMAIL_API_URL: 'https://api.zeptomail.eu/v1.1/email',
      ZEPTOMAIL_SEND_TOKEN: randomBytes(24).toString('hex'),
    };
    expect(refusDe(allume)).toEqual([]);
    expect(NOMS_DES_SECRETS_CONDITIONNELS).toContain('ZEPTOMAIL_SEND_TOKEN');
    expect(NOMS_DES_SECRETS).not.toContain('ZEPTOMAIL_SEND_TOKEN');
    expect(refusDe({ ...allume, ZEPTOMAIL_SEND_TOKEN: 'court' })).toEqual([
      'ZEPTOMAIL_SEND_TOKEN : trop_courte',
    ]);
  });
});

/**
 * LE MODULE RECHARGÉ. Le chemin d'envoi et la liste des hôtes sont évalués AU CHARGEMENT : importés
 * une fois en tête de fichier, ils seraient lus avant que l'outil de mutation n'active son mutant.
 * Ces témoins vident le cache des modules et réimportent la source, puis jugent ses constantes à la
 * valeur près ET leur effet (chaque hôte admis part, au chemin exact).
 */
type ModuleRelais = typeof import('../../../src/server/integrations/zeptomail/relais');

async function relaisRecharge(): Promise<ModuleRelais> {
  vi.resetModules();
  return import('../../../src/server/integrations/zeptomail/relais');
}

/** Un jeton factice, fabriqué à l'exécution. */
const JETON_FACTICE = 'jeton-factice-'.padEnd(48, 'x');
const MESSAGE_FACTICE = {
  de: 'contact@envoi.exemple.invalid',
  a: 'destinataire@exemple.invalid',
  sujet: 'Votre lien de connexion',
  corps: 'Bonjour\n\nhttps://partners.exemple.invalid/connexion/LIEN-FACTICE',
  reference: '00000000-0000-4000-8000-000000000058',
};

describe('REQ-INT-022 — le module rechargé : le chemin et les hôtes, à la valeur près', () => {
  it('REQ-INT-022 : le chemin d’envoi est exactement `/v1.1/email`, et les trois hôtes sont exactement ceux-ci, dans cet ordre', async () => {
    const m = await relaisRecharge();
    expect(m.CHEMIN_D_ENVOI).toBe('/v1.1/email');
    expect(m.HOTES_D_ENVOI).toEqual(['cpaas.zoho.com', 'api.zeptomail.com', 'api.zeptomail.eu']);
    expect(Object.isFrozen(m.HOTES_D_ENVOI)).toBe(true);
  });

  it.each(['cpaas.zoho.com', 'api.zeptomail.com', 'api.zeptomail.eu'])(
    'REQ-INT-022 : l’hôte %s, au chemin exact, est admis et l’envoi part — un appel, à cette URL',
    async (hote) => {
      const m = await relaisRecharge();
      const { f, appels } = fetchSimule([json(200, { request_id: 'id-factice-1' })]);
      const r = m.relaisZeptomail({
        url: `https://${hote}/v1.1/email`,
        jeton: JETON_FACTICE,
        fetch: f,
        attendre: async () => undefined,
      });
      expect(await r.envoyer(MESSAGE_FACTICE)).toEqual({ messageId: 'id-factice-1' });
      expect(appels.map((a) => a.url)).toEqual([`https://${hote}/v1.1/email`]);
    }
  );
});

describe('REQ-INT-022 — l’URL d’envoi : ni port, ni requête, ni identifiants', () => {
  it.each([
    ['un port explicite', 'https://api.zeptomail.eu:8443/v1.1/email'],
    ['une chaîne de requête', 'https://api.zeptomail.eu/v1.1/email?compte=x'],
    ['un nom d’utilisateur', 'https://utilisateur@api.zeptomail.eu/v1.1/email'],
    ['un mot de passe seul', 'https://:motdepasse@api.zeptomail.eu/v1.1/email'],
  ])('REQ-INT-022 : %s est refusé `relais_url_refusee`, sans aucun appel', async (_q, url) => {
    const { f, appels } = fetchSimule([json(200, FIXTURE.reponse200)]);
    expect((await echecDe(relais(f, url).envoyer(MESSAGE_FACTICE))).message).toBe(
      'relais_url_refusee'
    );
    expect(appels).toEqual([]);
  });

  it('REQ-INT-022 : une URL VIDE est un relais non configuré, pas une URL refusée', async () => {
    const { f, appels } = fetchSimule([json(200, FIXTURE.reponse200)]);
    const e = await echecDe(relaisAvec(f, '', JETON_FACTICE).envoyer(MESSAGE_FACTICE));
    expect(e.message).toBe('relais_non_configure');
    expect(appels).toEqual([]);
  });
});

describe('REQ-INT-023 — les échecs nommés : bornes de statut, abandon, réponse illisible', () => {
  it('REQ-INT-023 : l’erreur rendue se nomme `ErreurDuRelais` et ne porte que son code', async () => {
    const { f } = fetchSimule([json(400, FIXTURE.reponse400)]);
    const e = await echecDe(relais(f).envoyer(MESSAGE_FACTICE));
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ErreurDuRelais');
    expect(e.message).toBe('relais_requete_refusee');
  });

  it.each([
    [300, 'relais_redirection_refusee'],
    [399, 'relais_redirection_refusee'],
    [204, 'relais_requete_refusee'],
    [299, 'relais_requete_refusee'],
    [400, 'relais_requete_refusee'],
  ])(
    'REQ-INT-023 : une réponse %i rend `%s` — les bornes de la plage de redirection',
    async (statut, code) => {
      const { f, appels } = fetchSimule([new Response(null, { status: statut })]);
      expect((await echecDe(relais(f).envoyer(MESSAGE_FACTICE))).message).toBe(code);
      expect(appels).toHaveLength(1);
    }
  );

  it('REQ-INT-023 : un abandon (`AbortError`) rend `relais_delai_depasse`, comme un délai dépassé', async () => {
    for (const erreur of [
      new DOMException('abandon', 'AbortError'),
      Object.assign(new Error('abandon'), { name: 'AbortError' }),
    ]) {
      const { f, appels } = fetchSimule([erreur]);
      expect((await echecDe(relais(f).envoyer(MESSAGE_FACTICE))).message).toBe(
        'relais_delai_depasse'
      );
      expect(appels).toHaveLength(1);
    }
  });

  it.each([
    ['un corps qui n’est pas du JSON', () => new Response('pas du json', { status: 200 })],
    ['un JSON nul', () => json(200, null)],
    ['un `request_id` vide', () => json(200, { request_id: '' })],
    ['un `request_id` non textuel', () => json(200, { request_id: 57 })],
  ])(
    'REQ-INT-022 : 200 avec %s est `relais_reponse_illisible`, jamais un envoi',
    async (_q, rep) => {
      const { f } = fetchSimule([rep()]);
      const e = await echecDe(relais(f).envoyer(MESSAGE_FACTICE));
      expect(e.name).toBe('ErreurDuRelais');
      expect(e.message).toBe('relais_reponse_illisible');
    }
  );
});

describe('REQ-INT-023 — la pause après un refus de débit', () => {
  it('REQ-INT-023 : la pause injectée est appelée UNE fois, d’une seconde, entre les deux essais', async () => {
    const pauses: number[] = [];
    const { f, appels } = fetchSimule([json(429, {}), json(200, FIXTURE.reponse200)]);
    const r = relaisZeptomail({
      url: URL_EU,
      jeton: JETON_FACTICE,
      fetch: f,
      attendre: async (ms) => void pauses.push(ms),
    });
    expect(await r.envoyer(MESSAGE_FACTICE)).toEqual({ messageId: FIXTURE.reponse200.request_id });
    expect(pauses).toEqual([1_000]);
    expect(appels).toHaveLength(2);
  });

  it('REQ-INT-023 : sans pause injectée, le second essai part après une seconde d’horloge, pas avant', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const { f, appels } = fetchSimule([json(429, {}), json(200, FIXTURE.reponse200)]);
      const r = relaisZeptomail({ url: URL_EU, jeton: JETON_FACTICE, fetch: f });
      const envoi = r.envoyer(MESSAGE_FACTICE);
      await vi.advanceTimersByTimeAsync(999);
      expect(appels).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await envoi).toEqual({ messageId: FIXTURE.reponse200.request_id });
      expect(appels).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
