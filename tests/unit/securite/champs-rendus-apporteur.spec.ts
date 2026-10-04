// @req REQ-SEC-008
/**
 * SEC-47 — la fiche de l'apporteur passe par `CHAMPS_RENDUS`, comme les modèles cloisonnés
 * (dette nommée par la PR #345 ; exigences de la lentille sécurité, mot pour mot à
 * l'acceptance).
 *
 * CE QU'IL PROUVE :
 *   1. `moi()` ne rend aucune colonne hors de `CHAMPS_RENDUS.apporteur` : la sélection part DANS la
 *      requête, et aucun secret ni champ tu n'y figure ;
 *   2. chaque colonne d'Apporteur du schéma généré est classée (rendue ou tue, une seule fois) ; une
 *      colonne ajoutée sans classement fait rougir la confrontation ;
 *   3. SECRETS porte aussi nomChiffre, prenomChiffre, telephoneChiffre et phoneHash ; sont TUS
 *      seuilVerificationPrioritaire, scoreInitial, scorePartsJson, reponsesJson et isTest ;
 *   4. un filtre ou un tri sur une colonne non rendue est refusé avant tout appel, à toute
 *      profondeur logique : pas d'oracle sur tokenHash, emailHash ou kid.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  CHAMPS_RENDUS,
  CHAMPS_TUS,
  CLES_REFUSEES,
  MODELES_CLOISONNES,
  REFUS,
  SECRETS,
  forApporteur,
  type ClientCloisonnable,
} from '../../../src/server/acces/for-apporteur';

const A = randomUUID();

interface Appel {
  modele: string;
  methode: string;
  args: unknown;
}

/** Un faux client : chaque délégué enregistre ses appels et rend une réponse vide. */
function fauxClient() {
  const appels: Appel[] = [];
  const reponses: Record<string, unknown> = {
    findFirst: null,
    findMany: [],
    count: 0,
    create: { id: 'cree' },
    updateMany: { count: 1 },
  };
  const delegue = (modele: string) =>
    Object.fromEntries(
      Object.keys(reponses).map((methode) => [
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
  return { client, appels };
}

async function refusDe(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('aucun refus');
}

/** Une donnée d'essai passée à la couche sans son type : c'est la couche qu'on juge. */
const brut = (o: object): never => o as never;

/** Les colonnes (non relationnelles) d'Apporteur dans le schéma généré. */
const COLONNES_APPORTEUR = Prisma.dmmf.datamodel.models
  .find((m) => m.name === 'Apporteur')!
  .fields.filter((f) => f.kind !== 'object')
  .map((f) => f.name);

/** Les fautes de classement d'une liste de colonnes, chacune NOMMÉE par sa famille. */
function fautesDeClassement(
  colonnes: readonly string[],
  rendus: readonly string[],
  tus: readonly string[]
): string[] {
  const f: string[] = [];
  for (const c of colonnes) {
    if (!rendus.includes(c) && !tus.includes(c)) f.push(`colonne_non_classee : apporteur.${c}`);
    if (rendus.includes(c) && tus.includes(c)) f.push(`colonne_classee_deux_fois : apporteur.${c}`);
  }
  for (const c of [...rendus, ...tus])
    if (!colonnes.includes(c)) f.push(`colonne_inconnue : apporteur.${c}`);
  for (const c of rendus)
    if ((SECRETS as readonly string[]).includes(c)) f.push(`secret_rendu : apporteur.${c}`);
  return f;
}

const rendus = (): readonly string[] =>
  (CHAMPS_RENDUS as unknown as Record<string, readonly string[]>)['apporteur'] ?? [];
const tus = (): readonly string[] =>
  (CHAMPS_TUS as unknown as Record<string, readonly string[]>)['apporteur'] ?? [];

describe('REQ-SEC-008 — SEC-47 : moi() ne rend que les champs classés RENDUS', () => {
  it('REQ-SEC-008 : moi() porte la sélection EXPLICITE de CHAMPS_RENDUS.apporteur, dans la requête, et filtre par l’apporteur de la session', async () => {
    const { client, appels } = fauxClient();
    await forApporteur(client, A).moi();
    expect(appels).toHaveLength(1);
    const { modele, methode, args } = appels[0]!;
    expect([modele, methode]).toEqual(['apporteur', 'findFirst']);
    const a = args as { where: unknown; select?: Record<string, unknown> };
    expect(a.where).toEqual({ id: A });
    expect(rendus().length).toBeGreaterThan(0);
    expect(a.select).toEqual(Object.fromEntries(rendus().map((c) => [c, true])));
  });

  it('REQ-SEC-008 : aucune colonne tue ni aucun secret n’est demandé par moi()', async () => {
    const { client, appels } = fauxClient();
    await forApporteur(client, A).moi();
    const select = ((appels[0]!.args as { select?: object }).select ?? {}) as object;
    for (const c of [...tus(), ...SECRETS]) expect(Object.hasOwn(select, c), c).toBe(false);
  });
});

describe('REQ-SEC-008 — SEC-47 : Apporteur classé colonne par colonne, sous la même garde', () => {
  it('REQ-SEC-008 : chaque colonne d’Apporteur du schéma généré est RENDUE ou TUE, une seule fois, et aucun secret n’est rendu', () => {
    expect(fautesDeClassement(COLONNES_APPORTEUR, rendus(), tus())).toEqual([]);
  });

  it('REQ-SEC-008 : TÉMOIN — une colonne ajoutée au schéma sans classement rougit en « colonne_non_classee »', () => {
    const f = fautesDeClassement([...COLONNES_APPORTEUR, 'nouvelleColonne'], rendus(), tus());
    expect(f).toContain('colonne_non_classee : apporteur.nouvelleColonne');
  });

  it('REQ-SEC-008 : TÉMOIN — un secret ajouté aux champs rendus rougit en « secret_rendu »', () => {
    const f = fautesDeClassement(COLONNES_APPORTEUR, [...rendus(), 'phoneHash'], tus());
    expect(f.some((x) => x.startsWith('secret_rendu : apporteur.phoneHash'))).toBe(true);
  });

  it('REQ-SEC-008 : SECRETS porte les identités chiffrées et l’empreinte du téléphone, toujours figé', () => {
    expect(Object.isFrozen(SECRETS)).toBe(true);
    for (const s of ['nomChiffre', 'prenomChiffre', 'telephoneChiffre', 'phoneHash'])
      expect(SECRETS as readonly string[]).toContain(s);
  });

  it('REQ-SEC-008 : sont TUS le seuil de vérification, le score, ses parts, les réponses et le marqueur de test', () => {
    for (const c of [
      'seuilVerificationPrioritaire',
      'scoreInitial',
      'scorePartsJson',
      'reponsesJson',
      'isTest',
    ])
      expect(tus()).toContain(c);
  });
});

describe('REQ-SEC-008 — SEC-47 : filtres et tris bornés aux champs RENDUS', () => {
  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s — un filtre ou un tri sur chaque colonne TUE est refusé, avant tout appel',
    async (modele) => {
      for (const colonne of CHAMPS_TUS[modele]) {
        const { client, appels } = fauxClient();
        const vue = forApporteur(client, A)[modele];
        const cas = [
          vue.lister(brut({ where: { [colonne]: 'x' } })),
          vue.lister(brut({ where: { OR: [{ id: 'x' }, { NOT: { [colonne]: 'x' } }] } })),
          vue.lister(brut({ orderBy: { [colonne]: 'asc' } })),
          vue.lister(brut({ orderBy: [{ id: 'asc' }, { [colonne]: 'desc' }] })),
          vue.compter(brut({ AND: [{ [colonne]: { startsWith: 'a' } }] })),
        ];
        for (const promesse of cas) expect(await refusDe(promesse), colonne).toBe(REFUS.forme);
        expect(appels, colonne).toEqual([]);
      }
    }
  );

  it('REQ-SEC-008 : TÉMOIN — pas d’oracle sur tokenHash, emailHash ou kid', async () => {
    const { client, appels } = fauxClient();
    const acces = forApporteur(client, A);
    for (const promesse of [
      acces.jetonDepot.compter(brut({ tokenHash: { startsWith: '0' } })),
      acces.changementCourriel.lister(brut({ where: { emailHash: { gt: '8' } } })),
      acces.sessionEspace.lister(brut({ orderBy: { kid: 'asc' } })),
    ])
      expect(await refusDe(promesse)).toBe(REFUS.forme);
    expect(appels).toEqual([]);
  });

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s — un filtre et un tri sur une colonne RENDUE passent, en conjonction avec la session',
    async (modele) => {
      const { client, appels } = fauxClient();
      await forApporteur(client, A)[modele].lister(
        brut({ where: { id: 'x' }, orderBy: [{ id: 'asc' }] })
      );
      expect(appels).toHaveLength(1);
      expect((appels[0]!.args as { where: unknown }).where).toEqual({
        AND: [{ id: 'x' }, { apporteurId: A }],
      });
    }
  );
});

describe('REQ-SEC-008 — DM-50 et DM-56 : la qualité d’exercice, la profession et le statut juridique déclarés, rendus sur SA fiche seulement', () => {
  const DECLAREES = ['qualiteExercice', 'professionReglementee', 'statutJuridique'] as const;

  it('REQ-SEC-008 : moi() rend la qualité d’exercice, la profession réglementée et le statut juridique que l’apporteur a déclarés', async () => {
    const { client, appels } = fauxClient();
    await forApporteur(client, A).moi();
    const select = (appels[0]!.args as { select?: Record<string, unknown> }).select ?? {};
    for (const c of DECLAREES) {
      expect(rendus(), c).toContain(c);
      expect(tus(), c).not.toContain(c);
      expect(select[c], c).toBe(true);
    }
  });

  it('REQ-SEC-008 : aucune relation ne mène à la fiche : `apporteur` est refusé sur chaque modèle cloisonné qui la porte', () => {
    const versApporteur = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.kind === 'object' && f.type === 'Apporteur'))
      .map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1))
      .filter((m) => (MODELES_CLOISONNES as readonly string[]).includes(m));
    expect(versApporteur.length).toBeGreaterThan(0);
    const refusees = CLES_REFUSEES as unknown as Record<string, readonly string[]>;
    for (const m of versApporteur) expect(refusees[m], m).toContain('apporteur');
  });
});
