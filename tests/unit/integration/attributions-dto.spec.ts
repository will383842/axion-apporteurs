// @req REQ-INT-014
/**
 * INT-T07-P — l'API 1, `GET /api/integrations/axionia/attributions?siren=`, côté Partners.
 *
 * Ce que le fichier tient :
 *   — la route est DÉCLARÉE au contrat (`packages/contracts/api.ts`), sous des `$defs` fermés
 *     préfixés `api_attributions` : le paramètre `siren`, les en-têtes de la requête dont
 *     `x-axionia-kid` EXIGÉ (avenant A01 du 2026-09-30), et la réponse à quatre champs ;
 *   — la forme que la frontière admet (`api-entrante.ts`) est DÉRIVÉE de ce `$defs` : un champ
 *     ajouté au contrat sans la frontière, ou l'inverse, fait rougir ;
 *   — `nomAffichable` (décision de Williams du 2026-10-01, option B) : null pour `libre`, et aucun
 *     autre champ n'est admis.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import {
  API_ATTRIBUTIONS,
  API_DU_CONTRAT,
  ENTETE_KID_AXIONIA,
  defsApi,
} from '../../../packages/contracts/api';
import { contratJsonSchema } from '../../../packages/contracts/events';
import {
  CHAMPS_DE_LA_REPONSE,
  STATUTS_D_ATTRIBUTION,
  schemaReponseAttribution,
} from '../../../src/server/integrations/axionia/api-entrante';
import {
  lecteurDeLaBase,
  nomAffichable,
  VARIABLE_CLE_REFERENCE,
  lecteurDeProduction,
  referenceOpaque,
} from '../../../src/server/integrations/axionia/attributions-dto';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';
import { clesPii, encryptPii } from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

/** Le client de production, simulé : on compte ses constructions et on choisit sa ligne. */
const prod = vi.hoisted(() => ({ constructions: 0, ligne: null as unknown }));
vi.mock('@prisma/client', async (original) => ({
  ...(await original<typeof import('@prisma/client')>()),
  PrismaClient: class {
    constructor() {
      prod.constructions += 1;
    }
    attribution = { findFirst: async () => prod.ligne };
  },
}));

type Schema = Record<string, unknown>;
const NOMS = [
  'api_attributions_parametres',
  'api_attributions_requete_entetes',
  'api_attributions_reponse',
] as const;
const defs = () => contratJsonSchema()['$defs'] as Record<string, Schema>;
const REF = '6f1c2a3e-9b8d-4c7e-a1f2-3b4c5d6e7f80';

describe('REQ-INT-014 — l’API 1 est déclarée au contrat', () => {
  it('REQ-INT-014 : la route est une API du contrat, GET, au chemin que la frontière sert', () => {
    expect(API_DU_CONTRAT).toContain(API_ATTRIBUTIONS);
    expect(API_ATTRIBUTIONS.methode).toBe('GET');
    expect(API_ATTRIBUTIONS.chemin).toBe('/api/integrations/axionia/attributions');
    expect(API_ATTRIBUTIONS.prefixeDefs).toBe('api_attributions');
  });

  it('REQ-INT-014 : ses trois $defs sont dans contratJsonSchema, donc sous l’empreinte', () => {
    for (const nom of NOMS) {
      expect(Object.keys(defsApi()), nom).toContain(nom);
      expect(Object.keys(defs()), nom).toContain(nom);
    }
  });

  it('REQ-INT-014 : le paramètre est FERMÉ — le seul `siren`, neuf chiffres', () => {
    const p = defs().api_attributions_parametres!;
    expect(p.additionalProperties).toBe(false);
    expect(p.required).toEqual(['siren']);
    expect((p.properties as Record<string, Schema>).siren).toEqual({
      type: 'string',
      pattern: '^[0-9]{9}$',
    });
  });

  it('REQ-INT-014 : les en-têtes EXIGENT le jeton porteur et `x-axionia-kid` (avenant A01, QA-T52)', () => {
    const e = defs().api_attributions_requete_entetes!;
    expect(e.required).toEqual(['authorization', ENTETE_KID_AXIONIA]);
    const props = e.properties as Record<string, Schema>;
    expect(props.authorization).toEqual({ type: 'string', pattern: '^Bearer \\S+$' });
    expect(props[ENTETE_KID_AXIONIA]).toEqual({ type: 'string', pattern: '^[0-9a-f]{8}$' });
    expect(String(e.$comment)).toMatch(/kidDe\(AXIONIA_API_TOKEN\)/);
  });

  it('REQ-INT-014 : la réponse est FERMÉE à quatre champs, tous exigés, nuls compris', () => {
    const r = defs().api_attributions_reponse!;
    expect(r.additionalProperties).toBe(false);
    expect(r.required).toEqual(['statut', 'until', 'apporteurRef', 'nomAffichable']);
    const props = r.properties as Record<string, Schema>;
    expect(props.statut).toEqual({ type: 'string', enum: ['libre', 'attribuee', 'cliente'] });
    expect(String(r.$comment)).toMatch(/jamais e-mail, téléphone, identifiant ni adresse/);
  });
});

describe('REQ-INT-014 — la forme admise par la frontière est dérivée du contrat', () => {
  it('REQ-INT-014 : les champs et les statuts de la frontière SONT ceux du $defs', () => {
    const r = defs().api_attributions_reponse!;
    expect([...CHAMPS_DE_LA_REPONSE]).toEqual(r.required);
    const props = r.properties as Record<string, Schema>;
    expect([...STATUTS_D_ATTRIBUTION]).toEqual(props.statut!.enum);
  });

  it('REQ-INT-014 : une entreprise attribuée rend son nom affichable', () => {
    const lu = {
      statut: 'attribuee',
      until: '2027-03',
      apporteurRef: REF,
      nomAffichable: 'Paul D.',
    };
    expect(schemaReponseAttribution.safeParse(lu)).toEqual({ success: true, data: lu });
  });

  it('REQ-INT-014 : une entreprise libre rend null — un nom porté par « libre » est refusé', () => {
    const libre = { statut: 'libre', until: null, apporteurRef: null, nomAffichable: null };
    expect(schemaReponseAttribution.safeParse(libre).success).toBe(true);
    expect(schemaReponseAttribution.safeParse({ ...libre, nomAffichable: 'Paul D.' }).success).toBe(
      false
    );
  });

  it('REQ-INT-014 : aucun champ de plus n’est admis, ni un nom absent', () => {
    const juste = {
      statut: 'attribuee',
      until: '2027-03',
      apporteurRef: REF,
      nomAffichable: 'Paul D.',
    };
    expect(schemaReponseAttribution.safeParse({ ...juste, email: 'p@x.test' }).success).toBe(false);
    const sansNom: Partial<typeof juste> = { ...juste };
    delete sansNom.nomAffichable;
    expect(schemaReponseAttribution.safeParse(sansNom).success).toBe(false);
  });

  it('REQ-INT-014 : le nom affichable n’est jamais une adresse de courriel ni un numéro', () => {
    const base = { statut: 'attribuee', until: '2027-03', apporteurRef: REF };
    for (const nomAffichable of [
      'paul.dupont@example.test',
      '06 12 34 56 78',
      '',
      'x'.repeat(65),
    ]) {
      expect(
        schemaReponseAttribution.safeParse({ ...base, nomAffichable }).success,
        nomAffichable
      ).toBe(false);
    }
  });
});

// ── Le lecteur (`attributions-dto.ts`) : arbitrage de la coordination du 2026-10-04 (#561) ───────

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-int-t07-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'b'.repeat(64),
});
const CLE_REF = { APPORTEUR_REF_KEY: 'c'.repeat(64) };
const APPORTEUR = '11111111-1111-4111-8111-111111111111';
const CONSEILLER = '22222222-2222-4222-8222-222222222222';
const FIN = new Date('2027-03-15T10:00:00.000Z');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const bloc = (modele: string, champ: string, id: string, clair: string) =>
  Buffer.from(encryptPii({ modele, champ, id }, clair, CLES));

type Ligne = Record<string, unknown>;
function base(ligne: Ligne | null) {
  const findFirst = vi.fn(async () => ligne);
  return { findFirst, prisma: { attribution: { findFirst } } as unknown as PrismaClient };
}
const parApporteur = (
  statut: string,
  dates: Ligne = { fenetreFinAt: FIN, peremptionAt: null }
) => ({
  statut,
  ...dates,
  apporteur: {
    id: APPORTEUR,
    prenomChiffre: bloc('Apporteur', 'prenomChiffre', APPORTEUR, 'Paul'),
    nomChiffre: bloc('Apporteur', 'nomChiffre', APPORTEUR, 'Dupont'),
  },
  utilisateurConsole: null,
});
const parConseiller = (statut: string, nom = 'Julie Martin') => ({
  statut,
  fenetreFinAt: FIN,
  peremptionAt: null,
  apporteur: null,
  utilisateurConsole: {
    id: CONSEILLER,
    nomChiffre: bloc('UtilisateurConsole', 'nomChiffre', CONSEILLER, nom),
  },
});
const lire = (ligne: Ligne | null, cleReference: { APPORTEUR_REF_KEY: string } = CLE_REF) => {
  const b = base(ligne);
  return { b, lecture: lecteurDeLaBase(b.prisma, { cles: CLES, cleReference })(SIREN_TEMOIN) };
};
const SIREN_TEMOIN = '552100554';

describe('REQ-INT-014 — le statut se lit dans l’attribution qui OCCUPE le SIREN', () => {
  it('REQ-INT-014 : une seule lecture, des seuls états occupants, la même quel que soit le porteur', async () => {
    const { b, lecture } = lire(null);
    expect(await lecture).toBeNull();
    expect(b.findFirst).toHaveBeenCalledTimes(1);
    expect(b.findFirst).toHaveBeenCalledWith({
      where: { siren: SIREN_TEMOIN, statut: { in: [...ETATS_OCCUPANTS] } },
      select: {
        statut: true,
        fenetreFinAt: true,
        peremptionAt: true,
        apporteur: { select: { id: true, prenomChiffre: true, nomChiffre: true } },
        utilisateurConsole: { select: { id: true, nomChiffre: true } },
      },
    });
  });

  it.each(ETATS_OCCUPANTS.filter((e) => e !== 'convertie'))(
    'REQ-INT-014 : `%s` occupe — `attribuee`',
    async (etat) => {
      expect(await lire(parApporteur(etat)).lecture).toMatchObject({ statut: 'attribuee' });
    }
  );

  it('REQ-INT-014 : `convertie` — `cliente`, sans échéance, le porteur nommé', async () => {
    const r = await lire(parApporteur('convertie')).lecture;
    expect(r).toMatchObject({ statut: 'cliente', until: null, nomAffichable: 'Paul D.' });
    expect(schemaReponseAttribution.safeParse(r).success).toBe(true);
  });

  it('REQ-INT-014 : aucune attribution occupante — null, que la frontière rend « libre »', async () => {
    expect(await lire(null).lecture).toBeNull();
  });
});

describe('REQ-INT-014 — `until`, le mois à Paris de la fin de fenêtre, sinon de la péremption', () => {
  it('REQ-INT-014 : la fin de fenêtre l’emporte', async () => {
    const r = await lire(
      parApporteur('active', { fenetreFinAt: FIN, peremptionAt: new Date('2026-12-01T00:00:00Z') })
    ).lecture;
    expect(r).toMatchObject({ until: '2027-03' });
  });

  it('REQ-INT-014 : sans fin de fenêtre, la péremption', async () => {
    const r = await lire(
      parApporteur('provisoire', {
        fenetreFinAt: null,
        peremptionAt: new Date('2026-12-01T12:00:00Z'),
      })
    ).lecture;
    expect(r).toMatchObject({ until: '2026-12' });
  });

  it('REQ-INT-014 : le mois est celui de PARIS — 23 h 30 UTC le dernier jour du mois est déjà le mois suivant', async () => {
    const r = await lire(
      parApporteur('active', { fenetreFinAt: new Date('2027-02-28T23:30:00Z'), peremptionAt: null })
    ).lecture;
    expect(r).toMatchObject({ until: '2027-03' });
  });

  it('REQ-INT-014 : ni fin de fenêtre ni péremption — null, jamais une date inventée', async () => {
    const r = await lire(parApporteur('active', { fenetreFinAt: null, peremptionAt: null }))
      .lecture;
    expect(r).toMatchObject({ until: null });
  });
});

describe('REQ-INT-014 — `apporteurRef`, opaque, de même forme pour les deux populations (W19)', () => {
  it('REQ-INT-014 : un UUID, stable pour un même porteur, qui n’est pas son identifiant', async () => {
    const a = (await lire(parApporteur('active')).lecture) as { apporteurRef: string };
    const b = (await lire(parApporteur('rdv_pris')).lecture) as { apporteurRef: string };
    expect(a.apporteurRef).toMatch(UUID);
    expect(a.apporteurRef).toBe(b.apporteurRef);
    expect(a.apporteurRef).not.toBe(APPORTEUR);
    expect(a.apporteurRef).toBe(referenceOpaque('apporteur', APPORTEUR, CLE_REF));
  });

  it('REQ-INT-014 : la référence dépend de la clé — une autre clé, une autre référence', () => {
    expect(referenceOpaque('apporteur', APPORTEUR, CLE_REF)).not.toBe(
      referenceOpaque('apporteur', APPORTEUR, { APPORTEUR_REF_KEY: 'd'.repeat(64) })
    );
    expect(referenceOpaque('apporteur', APPORTEUR, CLE_REF)).not.toBe(
      referenceOpaque('console', CONSEILLER, CLE_REF)
    );
  });

  it('REQ-INT-014 : une clé absente ou trop courte — la lecture lève, jamais une référence faible', async () => {
    await expect(lire(parApporteur('active'), { APPORTEUR_REF_KEY: '' }).lecture).rejects.toThrow(
      /cle_reference/
    );
    await expect(
      lire(parApporteur('active'), { APPORTEUR_REF_KEY: 'c'.repeat(31) }).lecture
    ).rejects.toThrow(/cle_reference/);
  });

  it('REQ-INT-014 : 32 octets exactement suffisent — le plancher est inclus', () => {
    expect(referenceOpaque('apporteur', APPORTEUR, { APPORTEUR_REF_KEY: 'c'.repeat(32) })).toMatch(
      UUID
    );
  });

  it('REQ-INT-014 : la clé est `APPORTEUR_REF_KEY` (revue sécurité du 2026-10-04), et rien d’autre', () => {
    expect(VARIABLE_CLE_REFERENCE).toBe('APPORTEUR_REF_KEY');
  });

  it('REQ-INT-014 : HMAC-SHA-256 de « partners.apporteur-ref.v1|population|id », 128 bits en UUID version 8', () => {
    const attendu = createHmac('sha256', CLE_REF.APPORTEUR_REF_KEY)
      .update(`partners.apporteur-ref.v1|apporteur|${APPORTEUR}`, 'utf8')
      .digest();
    attendu[6] = (attendu[6]! & 0x0f) | 0x80;
    attendu[8] = (attendu[8]! & 0x3f) | 0x80;
    const x = attendu.subarray(0, 16).toString('hex');
    const r = referenceOpaque('apporteur', APPORTEUR, CLE_REF);
    expect(r).toBe(
      `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
    );
    expect(r[14]).toBe('8');
    expect('89ab').toContain(r[19]);
  });

  it('REQ-INT-014 : un MÊME identifiant donne deux références selon la population — jamais de collision apporteur / console', () => {
    const id = APPORTEUR;
    expect(referenceOpaque('apporteur', id, CLE_REF)).not.toBe(
      referenceOpaque('console', id, CLE_REF)
    );
    expect(referenceOpaque('console', id, CLE_REF)).toBe(referenceOpaque('console', id, CLE_REF));
    for (const p of ['apporteur', 'console'] as const) {
      expect(referenceOpaque(p, id, CLE_REF)).not.toBe(id);
    }
  });

  it('REQ-INT-014 : un conseiller est dérivé sous la population `console`', async () => {
    const c = (await lire(parConseiller('active')).lecture) as { apporteurRef: string };
    expect(c.apporteurRef).toBe(referenceOpaque('console', CONSEILLER, CLE_REF));
  });

  it('REQ-INT-014 : TÉMOIN STATIQUE — le module de dérivation n’importe aucun journal applicatif', () => {
    const source = readFileSync('src/server/integrations/axionia/attributions-dto.ts', 'utf8');
    const imports = [...source.matchAll(/^import[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) {
      expect(i).not.toMatch(/logger|journal|pino|sentry/i);
    }
  });

  it('REQ-SEC-042 : un conseiller au même stade répond comme un apporteur — même forme, hors la seule référence', async () => {
    const a = (await lire(parApporteur('active')).lecture) as Record<string, unknown>;
    const c = (await lire(parConseiller('active', 'Paul Durand')).lecture) as Record<
      string,
      unknown
    >;
    expect(Object.keys(c)).toEqual(Object.keys(a));
    expect({ ...c, apporteurRef: null }).toEqual({ ...a, apporteurRef: null });
    expect(c.apporteurRef).toMatch(UUID);
    expect(c.apporteurRef).not.toBe(a.apporteurRef);
  });
});

describe('REQ-INT-014 — `nomAffichable`, le prénom et l’initiale du nom, rien d’autre', () => {
  it('REQ-INT-014 : un apporteur — son prénom et l’initiale de son nom', async () => {
    expect(await lire(parApporteur('active')).lecture).toMatchObject({ nomAffichable: 'Paul D.' });
  });

  it('REQ-INT-014 : un conseiller — le premier mot de son nom et l’initiale du dernier, sans mention de rôle', async () => {
    expect(await lire(parConseiller('active')).lecture).toMatchObject({
      nomAffichable: 'Julie M.',
    });
    expect(await lire(parConseiller('active', 'Marie de La Tour')).lecture).toMatchObject({
      nomAffichable: 'Marie T.',
    });
    expect(await lire(parConseiller('active', 'Paul')).lecture).toMatchObject({
      nomAffichable: 'Paul',
    });
  });

  it.each([
    ['un prénom et un nom', 'Jean-Pierre', 'dupont', 'Jean-Pierre D.'],
    ['des espaces en trop', '  Anne  ', '  le  Gall ', 'Anne L.'],
    ['un prénom seul', 'Paul', null, 'Paul'],
    ['un prénom composé de deux mots, sans nom', 'Jean Paul', null, 'Jean Paul'],
    ['un prénom composé de deux mots, et un nom', 'Jean Paul', 'Martin', 'Jean Paul M.'],
    ['un nom seul : rien, l’initiale ne suffit pas', null, 'Dupont', null],
    ['ni l’un ni l’autre', null, null, null],
    ['un courriel glissé dans le prénom', 'paul@example.test', 'Dupont', null],
    ['un numéro glissé dans le prénom', '0612345678', 'Dupont', null],
  ])('REQ-INT-014 : %s', (_q, prenom, nom, attendu) => {
    expect(nomAffichable(prenom, nom)).toBe(attendu);
  });

  it('REQ-INT-014 : un prénom ou un nom absent de la fiche (colonne nulle) — rien n’est déchiffré, le nom suit la règle', async () => {
    const sansPrenom = parApporteur('active');
    (sansPrenom.apporteur as Ligne).prenomChiffre = null;
    expect(await lire(sansPrenom).lecture).toMatchObject({ nomAffichable: null });
    const sansNom = parApporteur('active');
    (sansNom.apporteur as Ligne).nomChiffre = null;
    expect(await lire(sansNom).lecture).toMatchObject({ nomAffichable: 'Paul' });
    const conseiller = parConseiller('active');
    (conseiller.utilisateurConsole as Ligne).nomChiffre = null;
    expect(await lire(conseiller).lecture).toMatchObject({ nomAffichable: null });
  });

  it('REQ-INT-014 : une ligne sans aucun porteur — la lecture lève, jamais une réponse sans porteur', async () => {
    await expect(
      lire({ ...parApporteur('active'), apporteur: null, utilisateurConsole: null }).lecture
    ).rejects.toThrow(/attribution_sans_porteur/);
  });

  it('REQ-INT-014 : un bloc illisible — la lecture lève (503), le nom ne passe jamais en clair', async () => {
    const ligne = parApporteur('active');
    ligne.apporteur.nomChiffre = Buffer.from('pas un bloc');
    await expect(lire(ligne).lecture).rejects.toThrow();
  });

  it('REQ-INT-014 : chaque réponse rendue est conforme au contrat', async () => {
    for (const l of [parApporteur('active'), parApporteur('convertie'), parConseiller('signee')]) {
      expect(schemaReponseAttribution.safeParse(await lire(l).lecture).success).toBe(true);
    }
  });
});

describe('REQ-INT-014 — le lecteur de production : clés relues à chaque appel, un seul client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const environnement = (cleReference: string | undefined) => {
    for (const n of NOMS_DES_SECRETS) {
      vi.stubEnv(n, `temoin-int-t07-${n.toLowerCase()}-`.padEnd(48, '0'));
    }
    vi.stubEnv('PII_ENCRYPTION_KEY', 'b'.repeat(64));
    vi.stubEnv(VARIABLE_CLE_REFERENCE, cleReference);
  };

  it('REQ-INT-014 : la clé posée — la réponse est lue, déchiffrée et dérivée sous la clé de l’environnement', async () => {
    environnement(CLE_REF.APPORTEUR_REF_KEY);
    prod.ligne = parApporteur('active');
    const r = await lecteurDeProduction(SIREN_TEMOIN);
    expect(r).toEqual({
      statut: 'attribuee',
      until: '2027-03',
      apporteurRef: referenceOpaque('apporteur', APPORTEUR, CLE_REF),
      nomAffichable: 'Paul D.',
    });
    await lecteurDeProduction(SIREN_TEMOIN);
    expect(prod.constructions).toBe(1);
  });

  it('REQ-INT-014 : la clé absente — la lecture lève (503), jamais une référence sous une clé vide', async () => {
    environnement(undefined);
    prod.ligne = parApporteur('active');
    await expect(lecteurDeProduction(SIREN_TEMOIN)).rejects.toThrow(/cle_reference/);
  });
});
