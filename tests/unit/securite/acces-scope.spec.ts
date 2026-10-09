// @req REQ-SEC-008
// @req REQ-QA-011 → REQ-SEC-008
// @req REQ-SEC-022
// @req REQ-DM-043
// @req REQ-QA-012 → REQ-SEC-022
// @req REQ-DM-031
// @req REQ-DM-064
/**
 * `acces-scope.spec.ts` — la couche d'accès cloisonnée de l'espace apporteur (SEC-05), SANS base :
 * `forApporteur` est jugée sur un faux client qui ENREGISTRE chaque appel et ses arguments. Ce que
 * la base réelle fait de ces arguments — et l'attaque d'un apporteur contre un autre — est jugé dans
 * `tests/integration/idor.spec.ts`.
 *
 * CE QU'IL PROUVE.
 *   1. Chaque méthode de chaque vue cloisonnée injecte l'identifiant de la SESSION dans la clause de
 *      filtrage, en conjonction (`AND`) avec ce que l'appelant écrit : aucun `where` fourni — pas
 *      même un `apporteurId` étranger — ne remplace ni n'élargit le filtre (REQ-SEC-008).
 *   2. Aucune écriture ne déplace une ligne : une donnée qui porte `id`, `apporteurId`, une relation
 *      ou une clé étrangère non déclarée est refusée AVANT tout appel ; une référence déclarée vers
 *      une autre table cloisonnée est vérifiée par la vue de la session.
 *   3. La liste des modèles cloisonnés et des clés refusées n'est pas crue sur parole : elle est
 *      CONFRONTÉE, dans les deux sens, au schéma généré (`Prisma.dmmf`) — un modèle neuf portant
 *      `apporteurId` sans vue, ou une relation neuve sans refus, fait rougir (RM-01).
 *   4. Un identifiant d'apporteur absent, vide ou mal formé fait ÉCHOUER la construction de la
 *      couche : `where: { apporteurId: undefined }` ne filtre rien, et c'est ce qu'on refuse.
 *   5. La ressource étrangère répond 404, jamais 403, par UNE réponse dont statut, en-têtes et corps
 *      sont identiques octet à octet à ceux d'un identifiant inexistant (REQ-SEC-022).
 *   6. TÉMOIN À DEUX FACES sur la forme : la vue d'une occupation étrangère ne porte QUE la date de
 *      fin ; la même comparaison de forme rougit sur une projection qui laisse passer l'identité, la
 *      date de dépôt ou le stade (REQ-QA-012, absorbée par REQ-SEC-022).
 *   7. La règle semgrep qui interdit le client nu sous l'espace est CONSOMMÉE, pas réécrite : ce
 *      fichier vérifie qu'elle vise bien les deux arbres de l'espace et que la couche est hors d'eux.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  CHAMPS_RENDUS,
  CHAMPS_TUS,
  CLES_REFUSEES,
  OPTIONS_DE_LECTURE,
  RELATIONS,
  SECRETS,
  CORPS_INTROUVABLE,
  MODELES_CLOISONNES,
  MODELES_SANS_VUE_APPORTEUR,
  REFERENCES_CLOISONNEES,
  REFUS,
  forApporteur,
  introuvable,
  repondre,
  vueDeLOccupationEtrangere,
  type ClientCloisonnable,
} from '../../../src/server/acces/for-apporteur';
import {
  ISSUES_DE_REFUS_STOCKEES,
  MOTIFS_REFUS_DEPOT,
} from '../../../src/domain/depot/motifs-refus';
import { CHAMPS_PII } from '../../../src/server/securite/pii';

const A = randomUUID();
const B = randomUUID();

const METHODES = ['findFirst', 'findMany', 'count', 'create', 'updateMany'] as const;
type Methode = (typeof METHODES)[number];

interface Appel {
  modele: string;
  methode: Methode;
  args: unknown;
}

/** Un faux client : chaque délégué enregistre ses appels et rend la réponse réglée pour sa méthode. */
function fauxClient() {
  const appels: Appel[] = [];
  const reponses: Record<Methode, unknown> = {
    findFirst: null,
    findMany: [],
    count: 0,
    create: { id: 'cree' },
    updateMany: { count: 1 },
  };
  const delegue = (modele: string) =>
    Object.fromEntries(
      METHODES.map((methode) => [
        methode,
        (args: unknown) => {
          appels.push({ modele, methode, args });
          return Promise.resolve(reponses[methode]);
        },
      ])
    );
  const client = Object.fromEntries(
    [...MODELES_CLOISONNES, 'apporteur'].map((m) => [m, delegue(m)])
  ) as unknown as ClientCloisonnable;
  return { client, appels, reponses };
}

async function refusDe(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('aucun refus');
}

const portee = (where: unknown, apporteurId: string) => ({ AND: [where, { apporteurId }] });

/** La sélection EXPLICITE qu'une lecture ou une création doit porter (GOV-111). */
const selection = (modele: (typeof MODELES_CLOISONNES)[number]) =>
  Object.fromEntries(CHAMPS_RENDUS[modele].map((c) => [c, true]));

/** Une donnée d'essai passée à la couche sans son type : c'est la couche qu'on juge, pas le compilateur. */
const brut = (o: object): never => o as never;

describe('REQ-SEC-008 — chaque méthode injecte l’apporteur de la session', () => {
  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.trouver(id) filtre par l’id ET par l’apporteur de la session, en une requête',
    async (modele) => {
      const { client, appels } = fauxClient();
      const id = randomUUID();
      expect(await forApporteur(client, A)[modele].trouver(id)).toBeNull();
      expect(appels).toEqual([
        {
          modele,
          methode: 'findFirst',
          args: { where: portee({ id }, A), select: selection(modele) },
        },
      ]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.lister() sans filtre ne liste que l’apporteur de la session',
    async (modele) => {
      const { client, appels, reponses } = fauxClient();
      reponses.findMany = [{ id: 'x' }];
      expect(await forApporteur(client, A)[modele].lister()).toEqual([{ id: 'x' }]);
      expect(appels).toEqual([
        { modele, methode: 'findMany', args: { where: portee({}, A), select: selection(modele) } },
      ]);
    }
  );

  // SEC-47 a changé la face de ces témoins : un filtre sur `apporteurId` (colonne TUE) était
  // gardé en CONJONCTION ; il est désormais REFUSÉ avant tout appel, comme tout filtre sur une
  // colonne non rendue. La conjonction reste prouvée par `lister()` sans filtre (ci-dessus) et par
  // un filtre sur une colonne RENDUE (ci-dessous).
  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.lister({ where: { id } }) reste en CONJONCTION avec la session — jamais un remplacement',
    async (modele) => {
      const { client, appels } = fauxClient();
      const id = randomUUID();
      await forApporteur(client, A)[modele].lister({
        where: { id },
        orderBy: { id: 'asc' },
        take: 7,
      });
      expect(appels).toEqual([
        {
          modele,
          methode: 'findMany',
          args: {
            where: portee({ id }, A),
            orderBy: { id: 'asc' },
            take: 7,
            select: selection(modele),
          },
        },
      ]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s — SEC-47 : un filtre sur apporteurId (colonne tue) est REFUSÉ avant tout appel, en lecture comme en compte',
    async (modele) => {
      const { client, appels } = fauxClient();
      const vue = forApporteur(client, A)[modele];
      expect(await refusDe(vue.lister(brut({ where: { apporteurId: B } })))).toBe(REFUS.forme);
      expect(await refusDe(vue.compter(brut({ apporteurId: B })))).toBe(REFUS.forme);
      expect(appels).toEqual([]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.compter() compte sous la même conjonction, avec ou sans filtre',
    async (modele) => {
      const { client, appels, reponses } = fauxClient();
      reponses.count = 3;
      const vue = forApporteur(client, A)[modele];
      const id = randomUUID();
      expect(await vue.compter()).toBe(3);
      expect(await vue.compter({ id })).toBe(3);
      expect(appels).toEqual([
        { modele, methode: 'count', args: { where: portee({}, A) } },
        { modele, methode: 'count', args: { where: portee({ id }, A) } },
      ]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.modifier(id) n’écrit que sous la conjonction ; 0 ligne touchée = introuvable, 1 = modifiee',
    async (modele) => {
      const { client, appels, reponses } = fauxClient();
      const id = randomUUID();
      const vue = forApporteur(client, A)[modele];
      const data = { creeAt: new Date(0) };
      expect(await vue.modifier(id, data as never)).toBe('modifiee');
      reponses.updateMany = { count: 0 };
      expect(await vue.modifier(id, data as never)).toBe('introuvable');
      expect(appels).toEqual([
        { modele, methode: 'updateMany', args: { where: portee({ id }, A), data } },
        { modele, methode: 'updateMany', args: { where: portee({ id }, A), data } },
      ]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.creer(data) écrit l’apporteur de la session dans la ligne créée',
    async (modele) => {
      const { client, appels } = fauxClient();
      const data = { kid: '0123abcd' };
      expect(await forApporteur(client, A)[modele].creer(data as never)).toEqual({ id: 'cree' });
      expect(appels).toEqual([
        {
          modele,
          methode: 'create',
          args: { data: { kid: '0123abcd', apporteurId: A }, select: selection(modele) },
        },
      ]);
    }
  );

  it('REQ-SEC-008 : moi() ne lit que l’apporteur de la session, par son identifiant', async () => {
    const { client, appels, reponses } = fauxClient();
    reponses.findFirst = { id: A };
    expect(await forApporteur(client, A).moi()).toEqual({ id: A });
    expect(appels).toEqual([
      {
        modele: 'apporteur',
        methode: 'findFirst',
        // SEC-47 : la fiche part avec sa sélection explicite, comme les modèles cloisonnés.
        args: {
          where: { id: A },
          select: Object.fromEntries(CHAMPS_RENDUS.apporteur.map((c) => [c, true])),
        },
      },
    ]);
  });

  it('REQ-SEC-008 : l’identifiant de la session est exposé tel quel, en lecture', () => {
    expect(forApporteur(fauxClient().client, A).apporteurId).toBe(A);
  });
});

describe('REQ-SEC-008 — aucune écriture ne déplace une ligne vers un autre apporteur', () => {
  const cas = MODELES_CLOISONNES.flatMap((m) => CLES_REFUSEES[m].map((cle) => [m, cle] as const));

  it.each(cas)(
    'REQ-SEC-008 : %s.creer refuse la clé « %s » AVANT tout appel à la base',
    async (modele, cle) => {
      const { client, appels } = fauxClient();
      const vue = forApporteur(client, A)[modele];
      expect(await refusDe(vue.creer(brut({ [cle]: B })))).toBe(REFUS.cle);
      expect(appels).toEqual([]);
    }
  );

  it.each(cas)(
    'REQ-SEC-008 : %s.modifier refuse la clé « %s » AVANT tout appel à la base',
    async (modele, cle) => {
      const { client, appels } = fauxClient();
      const vue = forApporteur(client, A)[modele];
      expect(await refusDe(vue.modifier(randomUUID(), brut({ [cle]: B })))).toBe(REFUS.cle);
      expect(appels).toEqual([]);
    }
  );

  // LE PROTOTYPE N'EST PAS IGNORÉ, IL EST REFUSÉ (lentille `securite`, #200). Le sérialiseur de
  // Prisma parcourt les arguments par `for…in` : il ENVOIE une clé héritée que `Object.hasOwn`
  // ne voit pas. Un témoin sur ce faux client ne pouvait pas le voir — les témoins sur le VRAI
  // sérialiseur sont plus bas. Toute donnée qui n'est pas un objet simple est refusée, dans les
  // deux méthodes d'écriture, avant tout appel.
  it.each(['creer', 'modifier'] as const)(
    'REQ-SEC-008 : %s refuse une clé portée par un PROTOTYPE, sans rien appeler',
    async (methode) => {
      const { client, appels } = fauxClient();
      const data = Object.create({ apporteurId: B }) as Record<string, unknown>;
      data.kid = '0123abcd';
      const vue = forApporteur(client, A).jetonDepot;
      const appel =
        methode === 'creer' ? vue.creer(data as never) : vue.modifier(randomUUID(), data as never);
      expect(await refusDe(appel)).toBe(REFUS.forme);
      expect(appels).toEqual([]);
    }
  );

  it.each(['creer', 'modifier'] as const)(
    'REQ-SEC-008 : %s refuse un ACCESSEUR, qui rendrait une valeur au contrôle et une autre à l’écriture',
    async (methode) => {
      const { client, appels } = fauxClient();
      let lectures = 0;
      const data = {
        get lienMagiqueId() {
          lectures += 1;
          return lectures === 1 ? randomUUID() : B;
        },
      };
      const vue = forApporteur(client, A).sessionEspace;
      const appel =
        methode === 'creer' ? vue.creer(data as never) : vue.modifier(randomUUID(), data as never);
      expect(await refusDe(appel)).toBe(REFUS.forme);
      expect(appels).toEqual([]);
    }
  );

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['une chaîne', 'apporteurId'],
    ['un nombre', 42],
  ])(
    'REQ-SEC-008 : une donnée qui n’est pas un objet (%s) est refusée, sans rien appeler',
    async (_nom, valeur) => {
      const { client, appels } = fauxClient();
      expect(await refusDe(forApporteur(client, A).jetonDepot.creer(valeur as never))).toBe(
        REFUS.forme
      );
      expect(appels).toEqual([]);
    }
  );

  it('REQ-SEC-008 : une propriété NON ÉNUMÉRABLE est refusée, pas tue', async () => {
    const { client, appels } = fauxClient();
    const data: Record<string, unknown> = { kid: '0123abcd' };
    Object.defineProperty(data, 'kid2', { value: 'cache', enumerable: false });
    expect(await refusDe(forApporteur(client, A).jetonDepot.creer(data as never))).toBe(
      REFUS.forme
    );
    expect(appels).toEqual([]);
  });

  it('REQ-SEC-008 : CONTRE-TÉMOIN — un objet simple et un objet sans prototype s’écrivent', async () => {
    const { client, appels } = fauxClient();
    const sansPrototype = Object.assign(Object.create(null) as Record<string, unknown>, {
      kid: 'sans-proto',
    });
    const simple: Record<string, unknown> = { kid: '0123abcd' };
    await forApporteur(client, A).jetonDepot.creer(simple as never);
    await forApporteur(client, A).jetonDepot.creer(sansPrototype as never);
    expect(appels.map((a) => (a.args as { data: unknown }).data)).toEqual([
      { kid: '0123abcd', apporteurId: A },
      { kid: 'sans-proto', apporteurId: A },
    ]);
  });

  it('REQ-SEC-008 : une référence déclarée vers une table cloisonnée est vérifiée par la vue de la SESSION — étrangère : refus, sans écriture', async () => {
    const { client, appels } = fauxClient();
    const lien = randomUUID();
    const vue = forApporteur(client, A).sessionEspace;
    expect(await refusDe(vue.creer(brut({ lienMagiqueId: lien })))).toBe(REFUS.reference);
    expect(await refusDe(vue.modifier(randomUUID(), brut({ lienMagiqueId: lien })))).toBe(
      REFUS.reference
    );
    expect(appels).toEqual([
      {
        modele: 'lienMagique',
        methode: 'findFirst',
        args: { where: portee({ id: lien }, A), select: selection('lienMagique') },
      },
      {
        modele: 'lienMagique',
        methode: 'findFirst',
        args: { where: portee({ id: lien }, A), select: selection('lienMagique') },
      },
    ]);
  });

  it('REQ-SEC-008 : la même référence, à l’apporteur de la session, passe — contre-témoin', async () => {
    const { client, appels, reponses } = fauxClient();
    const lien = randomUUID();
    const id = randomUUID();
    reponses.findFirst = { id: lien };
    const vue = forApporteur(client, A).sessionEspace;
    await vue.creer(brut({ lienMagiqueId: lien }));
    expect(await vue.modifier(id, brut({ lienMagiqueId: lien }))).toBe('modifiee');
    expect(appels.map((a) => [a.modele, a.methode])).toEqual([
      ['lienMagique', 'findFirst'],
      ['sessionEspace', 'create'],
      ['lienMagique', 'findFirst'],
      ['sessionEspace', 'updateMany'],
    ]);
    expect(appels[1]!.args).toEqual({
      data: { lienMagiqueId: lien, apporteurId: A },
      select: selection('sessionEspace'),
    });
  });

  it('REQ-SEC-008 : une référence absente ou nulle n’est pas lue — rien à vérifier', async () => {
    const { client, appels } = fauxClient();
    const vue = forApporteur(client, A).sessionEspace;
    await vue.modifier(randomUUID(), brut({ derniereVueAt: null }));
    await vue.modifier(randomUUID(), brut({ lienMagiqueId: null }));
    expect(appels.map((a) => a.methode)).toEqual(['updateMany', 'updateMany']);
  });
});

describe('REQ-SEC-008 — la couche échoue FERMÉE sur un identifiant douteux', () => {
  it.each([
    ['vide', ''],
    ['absent', undefined],
    ['nul', null],
    ['un nombre', 42],
    ['sans tirets', A.replaceAll('-', '')],
    ['préfixé', `x${A}`],
    ['suffixé', `${A}x`],
    ['un segment trop court', `${A.slice(0, 7)}-${A.slice(9)}`],
    ['une lettre hors hexadécimal', `g${A.slice(1)}`],
    ['un objet qui se rend en uuid', { toString: () => A }],
  ])('REQ-SEC-008 : un identifiant d’apporteur %s fait échouer la construction', (_, valeur) => {
    expect(() => forApporteur(fauxClient().client, valeur as string)).toThrow(REFUS.identifiant);
  });

  it('REQ-SEC-008 : un identifiant en majuscules est accepté (la base compare les uuid sans casse)', () => {
    expect(forApporteur(fauxClient().client, A.toUpperCase()).apporteurId).toBe(A.toUpperCase());
  });

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s — trouver et modifier sur un id mal formé rendent introuvable SANS requête (jamais une erreur de base)',
    async (modele) => {
      const { client, appels } = fauxClient();
      const vue = forApporteur(client, A)[modele];
      expect(await vue.trouver('pas-un-uuid')).toBeNull();
      expect(await vue.trouver(undefined as unknown as string)).toBeNull();
      expect(await vue.modifier('pas-un-uuid', brut({}))).toBe('introuvable');
      expect(appels).toEqual([]);
    }
  );
});

describe('REQ-QA-011 → REQ-SEC-008 — la liste des modèles cloisonnés est confrontée au schéma généré', () => {
  const modeles = Prisma.dmmf.datamodel.models;
  const delegue = (nom: string) => nom.charAt(0).toLowerCase() + nom.slice(1);

  it('REQ-QA-011 → REQ-SEC-008 : les modèles cloisonnés sont EXACTEMENT ceux du schéma qui portent `apporteurId`, hors des modèles SANS VUE déclarés', () => {
    const portantApporteur = modeles
      .filter((m) => m.fields.some((f) => f.name === 'apporteurId'))
      .map((m) => delegue(m.name))
      .sort();
    expect(portantApporteur.length).toBeGreaterThan(0);
    expect([...MODELES_CLOISONNES, ...MODELES_SANS_VUE_APPORTEUR].sort()).toEqual(portantApporteur);
  });

  it('REQ-SEC-008 : TÉMOIN — les modèles sans vue sont EXACTEMENT l’anomalie (DM-12), l’appareil connu (SEC-55) et la décision de contrat (SEC-19)', () => {
    expect([...MODELES_SANS_VUE_APPORTEUR]).toEqual([
      'anomalie',
      'appareilConnu',
      'decisionDeContrat',
    ]);
  });

  it('REQ-SEC-008 : TÉMOIN — SEC-55 : l’appareil connu n’a AUCUNE vue dans l’espace, et aucune relation de l’espace n’y mène', () => {
    const vues = forApporteur(fauxClient().client, A) as unknown as Record<string, unknown>;
    expect(Object.hasOwn(vues, 'appareilConnu')).toBe(false);
    for (const m of modeles) {
      const d = delegue(m.name);
      if (!(MODELES_CLOISONNES as readonly string[]).includes(d)) continue;
      expect(
        m.fields.filter((x) => x.kind === 'object' && x.type === 'AppareilConnu'),
        d
      ).toEqual([]);
    }
  });

  it('REQ-SEC-008 : TÉMOIN — DM-12 : l’anomalie n’a AUCUNE vue dans l’espace, et aucune relation de l’espace n’y mène', () => {
    expect([...MODELES_SANS_VUE_APPORTEUR]).toContain('anomalie');
    const vues = forApporteur(fauxClient().client, A) as unknown as Record<string, unknown>;
    expect(Object.hasOwn(vues, 'anomalie')).toBe(false);
    const relations = RELATIONS as unknown as Record<string, readonly string[]>;
    const refusees = CLES_REFUSEES as unknown as Record<string, readonly string[]>;
    for (const m of modeles) {
      for (const f of m.fields.filter((x) => x.kind === 'object' && x.type === 'Anomalie')) {
        const d = delegue(m.name);
        if (!(MODELES_CLOISONNES as readonly string[]).includes(d)) continue;
        expect(relations[d], `${d}.${f.name}`).toContain(f.name);
        expect(refusees[d], `${d}.${f.name}`).toContain(f.name);
      }
    }
  });

  it.each(MODELES_CLOISONNES)(
    'REQ-QA-011 → REQ-SEC-008 : %s — `id`, chaque relation et chaque clé étrangère sont refusées ou déclarées en référence vérifiée',
    (modele) => {
      const m = modeles.find((x) => delegue(x.name) === modele)!;
      const relations = m.fields.filter((f) => f.kind === 'object');
      const etrangeres = relations.flatMap((f) => [...(f.relationFromFields ?? [])]);
      const references = Object.keys(REFERENCES_CLOISONNEES[modele] ?? {});
      const attendues = ['id', ...relations.map((f) => f.name), ...etrangeres]
        .filter((c) => !references.includes(c))
        .sort();
      expect([...CLES_REFUSEES[modele]].sort()).toEqual([...new Set(attendues)].sort());
      for (const [colonne, cible] of Object.entries(REFERENCES_CLOISONNEES[modele] ?? {})) {
        const relation = relations.find((f) => (f.relationFromFields ?? []).includes(colonne));
        expect(relation, `${modele}.${colonne}`).toBeDefined();
        expect(delegue(relation!.type)).toBe(cible);
        expect(MODELES_CLOISONNES as readonly string[]).toContain(cible);
      }
    }
  );

  it('REQ-QA-011 → REQ-SEC-008 : toute clé étrangère vers une AUTRE table cloisonnée est une référence vérifiée, jamais un simple refus silencieux', () => {
    for (const modele of MODELES_CLOISONNES) {
      const m = modeles.find((x) => delegue(x.name) === modele)!;
      for (const f of m.fields.filter((x) => x.kind === 'object')) {
        const versCloisonnee = (MODELES_CLOISONNES as readonly string[]).includes(delegue(f.type));
        // Une clé COMPOSITE (DM-11 : `(piece_kyc_id, piece_kyc_type)` vers la pièce `rib`) se vérifie par
        // son identifiant, sa PREMIÈRE colonne ; le discriminant qui la complète n'est pas une référence.
        for (const [i, colonne] of (f.relationFromFields ?? []).entries()) {
          const declaree = Object.keys(REFERENCES_CLOISONNEES[modele] ?? {}).includes(colonne);
          expect(declaree, `${modele}.${colonne}`).toBe(versCloisonnee && i === 0);
        }
      }
    }
  });
});

describe('REQ-SEC-008 — la règle semgrep de l’espace est consommée, pas réécrite', () => {
  it('REQ-SEC-008 : la règle maison vise les deux arbres de l’espace, et la couche vit hors d’eux', () => {
    const regles = readFileSync('.semgrep.yml', 'utf8');
    const debut = regles.indexOf('- id: axion-prisma-hors-couche-d-acces');
    expect(debut).toBeGreaterThan(-1);
    const fin = regles.indexOf('- id:', debut + 1);
    const regle = regles.slice(debut, fin);
    expect(regle).toContain('"/src/app/(espace)/**"');
    expect(regle).toContain('"/src/server/espace/**"');
    expect(regles.split('- id: axion-prisma-hors-couche-d-acces').length).toBe(2);
    const couche = 'src/server/acces/for-apporteur.ts';
    expect(couche.startsWith('src/app/(espace)/')).toBe(false);
    expect(couche.startsWith('src/server/espace/')).toBe(false);
  });
});

describe('REQ-SEC-022 — une ressource étrangère répond 404, identique à l’inexistante', () => {
  async function octets(r: Response) {
    return {
      statut: r.status,
      entetes: [...r.headers.entries()].sort(),
      corps: Buffer.from(await r.arrayBuffer()).toString('hex'),
    };
  }

  it('REQ-SEC-022 : introuvable() rend 404 — jamais 403 —, un corps fixe, sans cache ni devinette de type', async () => {
    const r = introuvable();
    expect(r.status).toBe(404);
    expect(r.status).not.toBe(403);
    expect(await r.text()).toBe(CORPS_INTROUVABLE);
    expect(CORPS_INTROUVABLE).toBe('{"error":"introuvable"}');
    expect([...r.headers.entries()].sort()).toEqual([
      ['cache-control', 'no-store'],
      ['content-type', 'application/json; charset=utf-8'],
      ['x-content-type-options', 'nosniff'],
    ]);
  });

  it('REQ-SEC-022 : deux réponses introuvables sont identiques OCTET À OCTET, et chacune est neuve (un corps se lit une fois)', async () => {
    const a = introuvable();
    const b = introuvable();
    expect(a).not.toBe(b);
    expect(await octets(a)).toEqual(await octets(b));
  });

  it('REQ-SEC-022 : repondre(null) est introuvable() octet à octet, quel que soit le rendu — JSON ou PDF ; repondre(ligne) rend la ligne', async () => {
    const pdf = () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        headers: { 'content-type': 'application/pdf' },
      });
    const json = (l: { id: string }) => Response.json(l);
    expect(await octets(repondre(null, pdf))).toEqual(await octets(introuvable()));
    expect(await octets(repondre(null, json))).toEqual(await octets(introuvable()));
    const rendue = repondre({ id: 'x' }, json);
    expect(rendue.status).toBe(200);
    expect(await rendue.json()).toEqual({ id: 'x' });
  });
});

describe('REQ-QA-012 → REQ-SEC-022 — l’occupation d’un autre apporteur ne révèle que sa date de fin', () => {
  /** La forme d'une réponse : ses clés, triées, récursivement. */
  function forme(v: unknown): unknown {
    if (v === null || typeof v !== 'object' || v instanceof Date) return typeof v;
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, forme((v as Record<string, unknown>)[k])])
    );
  }
  const FORME_ADMISE = { finAt: 'object' };

  const ligneEtrangere = {
    id: randomUUID(),
    apporteurId: B,
    nom: 'Nom de l’autre apporteur',
    codeParrainage: 'AX7K2M9Q',
    deposeAt: new Date('2026-09-01T08:00:00Z'),
    etat: 'rdv_pris',
    finAt: new Date('2026-12-01T00:00:00Z'),
  };

  it('REQ-QA-012 → REQ-SEC-022 : TÉMOIN À DEUX FACES — la vue livrée a la forme admise ; une projection qui recopie la ligne rougit à la même comparaison', () => {
    const vue = vueDeLOccupationEtrangere(ligneEtrangere);
    expect(forme(vue)).toEqual(FORME_ADMISE);
    expect(vue).toEqual({ finAt: ligneEtrangere.finAt });
    const fuyante = { ...ligneEtrangere };
    expect(forme(fuyante)).not.toEqual(FORME_ADMISE);
  });

  it('REQ-QA-012 → REQ-SEC-022 : ni identifiant, ni nom, ni code, ni date de dépôt, ni stade ne traversent — même sérialisés', () => {
    const texte = JSON.stringify(vueDeLOccupationEtrangere(ligneEtrangere));
    for (const secret of [
      ligneEtrangere.id,
      B,
      ligneEtrangere.nom,
      ligneEtrangere.codeParrainage,
      ligneEtrangere.deposeAt.toISOString(),
      ligneEtrangere.etat,
    ]) {
      expect(texte).not.toContain(secret);
    }
    expect(texte).toBe(`{"finAt":"${ligneEtrangere.finAt.toISOString()}"}`);
  });

  it('REQ-QA-012 → REQ-SEC-022 : une occupation sans date de fin rend une date de fin nulle, rien de plus', () => {
    expect(vueDeLOccupationEtrangere({ ...ligneEtrangere, finAt: null })).toEqual({ finAt: null });
  });
});

/**
 * LES MÊMES REFUS, SUR LE FAUX CLIENT. Les témoins sur le VRAI sérialiseur de Prisma vivent dans
 * `tests/integration/idor.spec.ts` : instancier `PrismaClient` dans un test unitaire fait paniquer
 * le moteur dans le bac à sable de Stryker. Ici, la preuve est qu'aucun appel ne part.
 */
describe('REQ-SEC-008 — un corps JSON qui touche au prototype est refusé avant tout appel', () => {
  it.each([
    ['modifier', 'jetonDepot', `{"kid":"x","__proto__":{"apporteurId":"${B}"}}`],
    ['creer', 'jetonDepot', `{"kid":"x","__proto__":{"apporteurId":"${B}"}}`],
    ['modifier', 'sessionEspace', `{"__proto__":{"lienMagiqueId":"${B}"}}`],
  ] as const)(
    'REQ-SEC-008 : %s d’un corps JSON portant `__proto__` (%s) est refusé, sans rien appeler',
    async (methode, modele, corps) => {
      const { client, appels } = fauxClient();
      const vue = forApporteur(client, A)[modele];
      const data: unknown = JSON.parse(corps);
      const appel =
        methode === 'creer' ? vue.creer(data as never) : vue.modifier(randomUUID(), data as never);
      expect(await refusDe(appel)).toBe(REFUS.forme);
      expect(appels).toEqual([]);
    }
  );

  it.each(['constructor', 'toString', 'hasOwnProperty'])(
    'REQ-SEC-008 : une clé `%s`, membre du prototype des objets, est refusée comme `__proto__`',
    async (cle) => {
      const { client, appels } = fauxClient();
      const data: unknown = JSON.parse(`{"kid":"x","${cle}":{"apporteurId":"${B}"}}`);
      expect(
        await refusDe(forApporteur(client, A).jetonDepot.modifier(randomUUID(), data as never))
      ).toBe(REFUS.forme);
      expect(appels).toEqual([]);
    }
  );
});

// ── GOV-111 — les options de lecture, les filtres de relation, la sélection explicite ──────────────

describe('REQ-SEC-008 — GOV-111 : les options de lecture sont une liste blanche', () => {
  it('les options admises sont where, orderBy et take, et elles seules', () => {
    expect([...OPTIONS_DE_LECTURE].sort()).toEqual(['orderBy', 'take', 'where']);
  });

  it.each([
    ['select', { select: { tokenHash: true } }],
    ['include', { include: { apporteur: true } }],
    ['skip', { skip: 1 }],
    ['cursor', { cursor: { id: randomUUID() } }],
    ['distinct', { distinct: ['id'] }],
    ['une clé inconnue', { omit: { id: true } }],
  ])('REQ-SEC-008 : lister() refuse %s, avant tout appel', async (_nom, options) => {
    for (const modele of MODELES_CLOISONNES) {
      const { client, appels } = fauxClient();
      expect(await refusDe(forApporteur(client, A)[modele].lister(brut(options)))).toBe(
        REFUS.forme
      );
      expect(appels).toEqual([]);
    }
  });

  it.each([
    ['un décimal', 1.5],
    ['une chaîne', '7'],
    ['NaN', Number.NaN],
  ])('REQ-SEC-008 : take doit être un entier — %s est refusé', async (_nom, take) => {
    const { client, appels } = fauxClient();
    expect(await refusDe(forApporteur(client, A).jetonDepot.lister(brut({ take })))).toBe(
      REFUS.forme
    );
    expect(appels).toEqual([]);
  });

  it('REQ-SEC-008 : un objet d’options au prototype piégé est refusé, comme une donnée écrite', async () => {
    const { client, appels } = fauxClient();
    const piege = Object.create({ include: { apporteur: true } }) as object;
    expect(await refusDe(forApporteur(client, A).jetonDepot.lister(brut(piege)))).toBe(REFUS.forme);
    expect(appels).toEqual([]);
  });
});

describe('REQ-SEC-008 — GOV-111 : aucun filtre ni tri ne traverse une relation', () => {
  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s — chaque relation du schéma est refusée en where, à toute profondeur, et en orderBy',
    async (modele) => {
      for (const relation of RELATIONS[modele]) {
        for (const where of [
          { [relation]: { is: {} } },
          { AND: [{ id: randomUUID() }, { [relation]: {} }] },
          { OR: [{ NOT: { [relation]: {} } }] },
          { NOT: [{ [relation]: {} }] },
        ]) {
          const { client, appels } = fauxClient();
          const vue = forApporteur(client, A)[modele];
          expect(await refusDe(vue.lister(brut({ where })))).toBe(REFUS.forme);
          expect(await refusDe(vue.compter(brut(where)))).toBe(REFUS.forme);
          expect(appels).toEqual([]);
        }
        for (const orderBy of [
          { [relation]: { id: 'asc' } },
          [{ id: 'asc' }, { [relation]: {} }],
        ]) {
          const { client, appels } = fauxClient();
          expect(await refusDe(forApporteur(client, A)[modele].lister(brut({ orderBy })))).toBe(
            REFUS.forme
          );
          expect(appels).toEqual([]);
        }
      }
    }
  );

  it('REQ-SEC-008 : CONTRE-TÉMOIN — un filtre de colonne, dans AND/OR/NOT, passe', async () => {
    const { client, appels } = fauxClient();
    const where = { AND: [{ revoqueAt: null }], OR: [{ NOT: { creeAt: { lt: new Date(0) } } }] };
    await forApporteur(client, A).jetonDepot.lister(brut({ where }));
    expect(appels).toHaveLength(1);
  });

  it.each(MODELES_CLOISONNES)(
    'REQ-QA-011 → REQ-SEC-008 : %s — RELATIONS est EXACTEMENT la liste des relations du schéma généré',
    (modele) => {
      const m = Prisma.dmmf.datamodel.models.find(
        (x) => x.name.charAt(0).toLowerCase() + x.name.slice(1) === modele
      )!;
      const attendues = m.fields.filter((f) => f.kind === 'object').map((f) => f.name);
      expect([...RELATIONS[modele]].sort()).toEqual(attendues.sort());
    }
  );
});

/** Les fautes de classement des colonnes, chacune NOMMÉE par sa famille. */
function fautesDeClassement(
  rendus: Readonly<Record<string, readonly string[]>>,
  tus: Readonly<Record<string, readonly string[]>>
): string[] {
  const f: string[] = [];
  for (const modele of MODELES_CLOISONNES) {
    const m = Prisma.dmmf.datamodel.models.find(
      (x) => x.name.charAt(0).toLowerCase() + x.name.slice(1) === modele
    )!;
    const colonnes = m.fields.filter((x) => x.kind !== 'object').map((x) => x.name);
    const r = rendus[modele] ?? [];
    const t = tus[modele] ?? [];
    for (const c of colonnes) {
      if (!r.includes(c) && !t.includes(c)) f.push(`colonne_non_classee : ${modele}.${c}`);
      if (r.includes(c) && t.includes(c)) f.push(`colonne_classee_deux_fois : ${modele}.${c}`);
    }
    for (const c of [...r, ...t])
      if (!colonnes.includes(c)) f.push(`colonne_inconnue : ${modele}.${c}`);
    for (const c of r)
      if ((SECRETS as readonly string[]).includes(c)) f.push(`secret_rendu : ${modele}.${c}`);
  }
  return f;
}

describe('REQ-SEC-008 — GOV-111 : la couche ne rend qu’une sélection EXPLICITE, sans secret', () => {
  it('REQ-SEC-008 : les vingt-trois secrets sont figés — les six de GOV-111, les quatre de la fiche (SEC-47), les sept du dépôt (DM-07), l’IBAN de la pièce rib (DM-11), le jeton de la page des droits (DM-59), le texte et la réponse d’une contestation et la justification d’une anomalie (DM-12)', () => {
    expect(Object.isFrozen(SECRETS)).toBe(true);
    expect([...SECRETS].sort()).toEqual(
      [
        'codeHash',
        'emailChiffre',
        'emailHash',
        'ipHash',
        'kid',
        'tokenHash',
        'nomChiffre',
        'prenomChiffre',
        'telephoneChiffre',
        'phoneHash',
        'nomContactChiffre',
        'prenomContactChiffre',
        'fonctionContactChiffre',
        'contexteChiffre',
        'codePostalChiffre',
        'lienInteretPrecisionChiffre',
        'agentHash',
        'ibanChiffre',
        'ibanHash',
        'jetonDroitsHash',
        'texteChiffre',
        'reponseChiffre',
        'justificationChiffre',
      ].sort()
    );
  });

  it('REQ-QA-011 → REQ-SEC-008 : chaque colonne du schéma (Json et enum compris) est RENDUE ou TUE, une seule fois, et aucun secret n’est rendu', () => {
    expect(fautesDeClassement(CHAMPS_RENDUS, CHAMPS_TUS)).toEqual([]);
  });

  it.each([
    [
      'tokenHash ajouté aux champs rendus du jeton',
      { ...CHAMPS_RENDUS, jetonDepot: [...CHAMPS_RENDUS.jetonDepot, 'tokenHash'] },
      CHAMPS_TUS,
      'secret_rendu',
    ],
    [
      'une colonne retirée des deux listes',
      { ...CHAMPS_RENDUS, jetonDepot: CHAMPS_RENDUS.jetonDepot.filter((c) => c !== 'creeAt') },
      CHAMPS_TUS,
      'colonne_non_classee',
    ],
    [
      'une colonne inventée',
      { ...CHAMPS_RENDUS, jetonDepot: [...CHAMPS_RENDUS.jetonDepot, 'nouvelleColonne'] },
      CHAMPS_TUS,
      'colonne_inconnue',
    ],
  ] as const)('REQ-SEC-008 : TÉMOIN — %s rougit en « %s »', (_quoi, rendus, tus, famille) => {
    const f = fautesDeClassement(rendus, tus);
    expect(
      f.some((x) => x.startsWith(famille)),
      f.join('\n')
    ).toBe(true);
  });

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s — trouver, lister et creer portent la sélection DANS la requête, sans include',
    async (modele) => {
      const { client, appels } = fauxClient();
      const vue = forApporteur(client, A)[modele];
      await vue.trouver(randomUUID());
      await vue.lister();
      await vue.creer(brut({}));
      for (const a of appels) {
        const args = a.args as Record<string, unknown>;
        expect(args.select, `${modele}.${a.methode}`).toEqual(selection(modele));
        expect(Object.hasOwn(args, 'include'), `${modele}.${a.methode}`).toBe(false);
        for (const s of SECRETS) expect(Object.hasOwn(args.select as object, s)).toBe(false);
      }
    }
  );
});

describe('REQ-DM-031 — DM-07 : le vocabulaire et les colonnes du dépôt, confrontés au schéma généré', () => {
  const enums = Prisma.dmmf.datamodel.enums;
  const valeurs = (nom: string) =>
    (enums.find((e) => e.name === nom)?.values ?? []).map((v) => v.name);

  it('REQ-DM-031 : MOTIFS_REFUS_DEPOT est EXACTEMENT l’enum MotifRefusDepot, dans l’ordre, et chaque refus de catégorie y est', () => {
    expect([...MOTIFS_REFUS_DEPOT]).toEqual(valeurs('MotifRefusDepot'));
    expect(MOTIFS_REFUS_DEPOT).toHaveLength(7);
    for (const issue of ISSUES_DE_REFUS_STOCKEES) expect(MOTIFS_REFUS_DEPOT).toContain(issue);
  });

  it('REQ-DM-031 : le contact rencontré n’est JAMAIS rendu — chaque colonne chiffrée ou empreinte de l’attribution est tue et secrète', () => {
    const attribution = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Attribution')!;
    const sensibles = attribution.fields
      .map((f) => f.name)
      .filter((n) => n.endsWith('Chiffre') || n.endsWith('Hash'));
    expect(sensibles.length).toBeGreaterThan(0);
    for (const c of sensibles) {
      expect(CHAMPS_TUS.attribution as readonly string[], c).toContain(c);
      expect(SECRETS as readonly string[], c).toContain(c);
    }
  });

  it('REQ-DM-031 : les coordonnées au micro-degré ne sont JAMAIS rendues — tues, absentes de chaque sélection de la vue apporteur', async () => {
    const coordonnees = ['latitudeMicrodeg', 'longitudeMicrodeg'];
    for (const c of coordonnees) {
      expect(CHAMPS_TUS.attribution as readonly string[], c).toContain(c);
      expect(CHAMPS_RENDUS.attribution as readonly string[], c).not.toContain(c);
    }
    const { client, appels } = fauxClient();
    const vue = forApporteur(client, A).attribution;
    await vue.trouver(randomUUID());
    await vue.lister();
    expect(appels.length).toBeGreaterThan(0);
    for (const a of appels) {
      const select = (a.args as { select: Record<string, unknown> }).select;
      for (const c of coordonnees)
        expect(Object.hasOwn(select, c), `${a.methode}.${c}`).toBe(false);
    }
    expect(await refusDe(vue.lister(brut({ where: { latitudeMicrodeg: 0 } })))).toBe(REFUS.forme);
  });

  it('REQ-DM-064 : l’IDCC saisi est la saisie de l’apporteur — rendu, en clair, dans chaque sélection de sa vue, et jamais un secret', async () => {
    expect(CHAMPS_RENDUS.attribution as readonly string[]).toContain('idccSaisi');
    expect(CHAMPS_TUS.attribution as readonly string[]).not.toContain('idccSaisi');
    expect(SECRETS as readonly string[]).not.toContain('idccSaisi');
    const { client, appels } = fauxClient();
    const vue = forApporteur(client, A).attribution;
    await vue.trouver(randomUUID());
    await vue.lister();
    expect(appels.length).toBeGreaterThan(0);
    for (const a of appels) {
      const select = (a.args as { select: Record<string, unknown> }).select;
      expect(select['idccSaisi'], `${a.methode}.idccSaisi`).toBe(true);
    }
  });

  it('REQ-DM-031 : chaque colonne chiffrée de l’attribution est écrite par colonnesPii — un champ de CHAMPS_PII, sans empreinte de nom', () => {
    const attribution = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Attribution')!;
    const chiffrees = attribution.fields.map((f) => f.name).filter((n) => n.endsWith('Chiffre'));
    const ecrites = Object.values(CHAMPS_PII).map((d) => d.chiffre as string);
    for (const c of chiffrees) expect(ecrites, c).toContain(c);
    expect('empreinte' in CHAMPS_PII.nomContact).toBe(false);
    expect('empreinte' in CHAMPS_PII.fonctionContact).toBe(false);
  });
});

describe('REQ-DM-043 — DM-53 : le refus reste visible, son SIREN rendu NULL une fois purgé, la date de purge jamais rendue', () => {
  const colonnes = Prisma.dmmf.datamodel.models
    .find((m) => m.name === 'DepotRefuse')!
    .fields.filter((f) => f.kind !== 'object')
    .map((f) => f.name);

  it('REQ-DM-043 : siren est RENDU, sirenPurgeAt est TU — dans les listes et dans chaque sélection de la vue', async () => {
    expect(CHAMPS_RENDUS.depotRefuse as readonly string[]).toContain('siren');
    expect(CHAMPS_RENDUS.depotRefuse as readonly string[]).not.toContain('sirenPurgeAt');
    expect(CHAMPS_TUS.depotRefuse as readonly string[]).toContain('sirenPurgeAt');
    const { client, appels } = fauxClient();
    const vue = forApporteur(client, A).depotRefuse;
    await vue.trouver(randomUUID());
    await vue.lister();
    expect(appels.length).toBeGreaterThan(0);
    for (const a of appels) {
      const select = (a.args as { select: Record<string, unknown> }).select;
      expect(select, a.methode).toEqual(selection('depotRefuse'));
      expect(Object.hasOwn(select, 'siren'), `${a.methode}.siren`).toBe(true);
      expect(Object.hasOwn(select, 'sirenPurgeAt'), `${a.methode}.sirenPurgeAt`).toBe(false);
    }
  });

  it('REQ-DM-043 : TÉMOIN À DEUX FACES — la sélection livrée tait la date de purge ; une COPIE de toutes les colonnes la rendrait, et rougit à la même comparaison', async () => {
    const { client, appels } = fauxClient();
    await forApporteur(client, A).depotRefuse.lister();
    const livree = Object.keys((appels[0]!.args as { select: object }).select).sort();
    const copie = [...colonnes].sort();
    const tue = (cles: string[]) => !cles.includes('sirenPurgeAt');
    expect(tue(livree)).toBe(true);
    expect(tue(copie)).toBe(false);
    expect(copie).not.toEqual(livree);
  });

  it('REQ-DM-043 : un refus purgé est rendu avec un SIREN NULL — la ligne reste visible, sans lui', async () => {
    const { client, reponses } = fauxClient();
    const purge = {
      id: randomUUID(),
      siren: null,
      motif: 'file_complete',
      canal: 'espace',
      refuseAt: new Date(0),
    };
    reponses.findFirst = purge;
    const rendu = (await forApporteur(client, A).depotRefuse.trouver(purge.id)) as Record<
      string,
      unknown
    >;
    expect(rendu).toEqual(purge);
    expect(rendu['siren']).toBeNull();
    expect(Object.hasOwn(rendu, 'sirenPurgeAt')).toBe(false);
  });
});

describe('REQ-SEC-008 — GOV-111 : la lecture ne transmet que ce qui a été demandé', () => {
  it('REQ-SEC-008 : sans take, aucune clé take ne part ; avec take, elle part telle quelle', async () => {
    const { client, appels } = fauxClient();
    const vue = forApporteur(client, A).jetonDepot;
    await vue.lister(brut({ where: { revoqueAt: null } }));
    await vue.lister(brut({ where: { revoqueAt: null }, take: 5 }));
    expect(appels).toHaveLength(2);
    const sansTake = appels[0]!.args as Record<string, unknown>;
    const avecTake = appels[1]!.args as Record<string, unknown>;
    expect(Object.keys(sansTake).sort()).toEqual(['select', 'where']);
    expect('take' in sansTake).toBe(false);
    expect(Object.keys(avecTake).sort()).toEqual(['select', 'take', 'where']);
    expect(avecTake.take).toBe(5);
  });

  it('REQ-SEC-008 : DÉFENSE EN PROFONDEUR — une relation classée par erreur parmi les colonnes rendues reste refusée en filtre et en tri', async () => {
    // La confrontation au schéma interdit ce classement ; on le force ici pour juger la garde
    // des relations SEULE, sans l'appui de la liste des colonnes rendues.
    const rendus = CHAMPS_RENDUS.jetonDepot as unknown as string[];
    rendus.push('apporteur');
    try {
      const { client, appels } = fauxClient();
      const vue = forApporteur(client, A).jetonDepot;
      expect(await refusDe(vue.lister(brut({ where: { apporteur: { is: {} } } })))).toBe(
        REFUS.forme
      );
      expect(await refusDe(vue.lister(brut({ orderBy: { apporteur: { id: 'asc' } } })))).toBe(
        REFUS.forme
      );
      expect(await refusDe(vue.compter(brut({ apporteur: {} })))).toBe(REFUS.forme);
      expect(appels).toEqual([]);
    } finally {
      rendus.pop();
    }
    expect(CHAMPS_RENDUS.jetonDepot).not.toContain('apporteur');
  });
});
