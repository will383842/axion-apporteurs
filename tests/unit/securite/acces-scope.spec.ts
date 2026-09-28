// @req REQ-SEC-008
// @req REQ-QA-011 → REQ-SEC-008
// @req REQ-SEC-022
// @req REQ-QA-012 → REQ-SEC-022
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
  CLES_REFUSEES,
  CORPS_INTROUVABLE,
  MODELES_CLOISONNES,
  REFERENCES_CLOISONNEES,
  REFUS,
  forApporteur,
  introuvable,
  repondre,
  vueDeLOccupationEtrangere,
  type ClientCloisonnable,
} from '../../../src/server/acces/for-apporteur';

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
        { modele, methode: 'findFirst', args: { where: portee({ id }, A) } },
      ]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.lister() sans filtre ne liste que l’apporteur de la session',
    async (modele) => {
      const { client, appels, reponses } = fauxClient();
      reponses.findMany = [{ id: 'x' }];
      expect(await forApporteur(client, A)[modele].lister()).toEqual([{ id: 'x' }]);
      expect(appels).toEqual([{ modele, methode: 'findMany', args: { where: portee({}, A) } }]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.lister({ where: { apporteurId: B } }) reste en CONJONCTION avec la session — jamais un remplacement',
    async (modele) => {
      const { client, appels } = fauxClient();
      await forApporteur(client, A)[modele].lister({
        where: { apporteurId: B },
        orderBy: { id: 'asc' },
        take: 7,
      });
      expect(appels).toEqual([
        {
          modele,
          methode: 'findMany',
          args: { where: portee({ apporteurId: B }, A), orderBy: { id: 'asc' }, take: 7 },
        },
      ]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s.compter() compte sous la même conjonction, avec ou sans filtre',
    async (modele) => {
      const { client, appels, reponses } = fauxClient();
      reponses.count = 3;
      const vue = forApporteur(client, A)[modele];
      expect(await vue.compter()).toBe(3);
      expect(await vue.compter({ apporteurId: B })).toBe(3);
      expect(appels).toEqual([
        { modele, methode: 'count', args: { where: portee({}, A) } },
        { modele, methode: 'count', args: { where: portee({ apporteurId: B }, A) } },
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
        { modele, methode: 'create', args: { data: { kid: '0123abcd', apporteurId: A } } },
      ]);
    }
  );

  it('REQ-SEC-008 : moi() ne lit que l’apporteur de la session, par son identifiant', async () => {
    const { client, appels, reponses } = fauxClient();
    reponses.findFirst = { id: A };
    expect(await forApporteur(client, A).moi()).toEqual({ id: A });
    expect(appels).toEqual([
      { modele: 'apporteur', methode: 'findFirst', args: { where: { id: A } } },
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

  it('REQ-SEC-008 : une clé refusée portée par un prototype ne compte pas — seule une clé PROPRE refuse', async () => {
    const { client, appels } = fauxClient();
    const data = Object.create({ apporteurId: B }) as Record<string, unknown>;
    data.kid = '0123abcd';
    await forApporteur(client, A).jetonDepot.creer(data as never);
    expect(appels).toEqual([
      {
        modele: 'jetonDepot',
        methode: 'create',
        args: { data: { kid: '0123abcd', apporteurId: A } },
      },
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
      { modele: 'lienMagique', methode: 'findFirst', args: { where: portee({ id: lien }, A) } },
      { modele: 'lienMagique', methode: 'findFirst', args: { where: portee({ id: lien }, A) } },
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
    expect(appels[1]!.args).toEqual({ data: { lienMagiqueId: lien, apporteurId: A } });
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

describe('REQ-QA-011 — la liste des modèles cloisonnés est confrontée au schéma généré', () => {
  const modeles = Prisma.dmmf.datamodel.models;
  const delegue = (nom: string) => nom.charAt(0).toLowerCase() + nom.slice(1);

  it('REQ-QA-011 : les modèles cloisonnés sont EXACTEMENT ceux du schéma qui portent `apporteurId`', () => {
    const portantApporteur = modeles
      .filter((m) => m.fields.some((f) => f.name === 'apporteurId'))
      .map((m) => delegue(m.name))
      .sort();
    expect(portantApporteur.length).toBeGreaterThan(0);
    expect([...MODELES_CLOISONNES].sort()).toEqual(portantApporteur);
  });

  it.each(MODELES_CLOISONNES)(
    'REQ-QA-011 : %s — `id`, chaque relation et chaque clé étrangère sont refusées ou déclarées en référence vérifiée',
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

  it('REQ-QA-011 : toute clé étrangère vers une AUTRE table cloisonnée est une référence vérifiée, jamais un simple refus silencieux', () => {
    for (const modele of MODELES_CLOISONNES) {
      const m = modeles.find((x) => delegue(x.name) === modele)!;
      for (const f of m.fields.filter((x) => x.kind === 'object')) {
        const versCloisonnee = (MODELES_CLOISONNES as readonly string[]).includes(delegue(f.type));
        for (const colonne of f.relationFromFields ?? []) {
          const declaree = Object.keys(REFERENCES_CLOISONNEES[modele] ?? {}).includes(colonne);
          expect(declaree, `${modele}.${colonne}`).toBe(versCloisonnee);
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

describe('REQ-QA-012 — l’occupation d’un autre apporteur ne révèle que sa date de fin', () => {
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

  it('REQ-QA-012 : TÉMOIN À DEUX FACES — la vue livrée a la forme admise ; une projection qui recopie la ligne rougit à la même comparaison', () => {
    const vue = vueDeLOccupationEtrangere(ligneEtrangere);
    expect(forme(vue)).toEqual(FORME_ADMISE);
    expect(vue).toEqual({ finAt: ligneEtrangere.finAt });
    const fuyante = { ...ligneEtrangere };
    expect(forme(fuyante)).not.toEqual(FORME_ADMISE);
  });

  it('REQ-QA-012 : ni identifiant, ni nom, ni code, ni date de dépôt, ni stade ne traversent — même sérialisés', () => {
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

  it('REQ-QA-012 : une occupation sans date de fin rend une date de fin nulle, rien de plus', () => {
    expect(vueDeLOccupationEtrangere({ ...ligneEtrangere, finAt: null })).toEqual({ finAt: null });
  });
});
