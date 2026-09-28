/**
 * for-apporteur.ts — la couche d'accès cloisonnée de l'espace apporteur (SEC-05 ; REQ-SEC-008,
 * REQ-SEC-009, REQ-SEC-022, REQ-ARG-029, REQ-UX-006).
 *
 * TOUTE LECTURE ET TOUTE ÉCRITURE DE L'ESPACE PASSENT PAR ICI. L'espace (`src/app/(espace)/**`,
 * `src/server/espace/**`) ne voit jamais le client de base : la règle semgrep maison
 * `axion-prisma-hors-couche-d-acces` le refuse, et cette couche est la seule porte qui lui reste.
 * Elle reçoit l'identifiant d'apporteur de la SESSION — jamais celui d'un paramètre de requête — et
 * l'injecte dans chaque clause de filtrage.
 *
 * CINQ RÈGLES, ET CE QUI LES TIENT.
 *  1. CONJONCTION, JAMAIS REMPLACEMENT. Chaque `where` devient `{ AND: [where, { apporteurId }] }`.
 *     Ce que l'appelant écrit — un `apporteurId` étranger, un `OR`, une relation — ne peut que
 *     RESTREINDRE ce que la session voit, jamais l'élargir.
 *  2. ÉCHEC FERMÉ SUR L'IDENTIFIANT. `where: { apporteurId: undefined }` ne filtre RIEN : un
 *     identifiant d'apporteur absent ou mal formé fait lever la construction de la couche. Un id de
 *     ressource mal formé rend « introuvable » sans requête, comme un id inexistant.
 *  3. AUCUNE ÉCRITURE NE DÉPLACE UNE LIGNE. `id`, `apporteurId`, chaque relation et chaque clé
 *     étrangère d'un modèle sont refusés en écriture AVANT tout appel (`CLES_REFUSEES`) ; une clé
 *     étrangère vers une AUTRE table cloisonnée est admise seulement si la ligne visée est visible
 *     par la même session (`REFERENCES_CLOISONNEES`). Ces deux listes sont confrontées au schéma
 *     généré par `tests/unit/securite/acces-scope.spec.ts` : un modèle ou une relation neufs
 *     rougissent tant qu'ils n'y sont pas.
 *  4. 404, JAMAIS 403, ET TOUJOURS LE MÊME. `introuvable()` rend une réponse neuve, identique octet
 *     à octet à chaque appel ; `repondre(null, …)` la rend quel que soit le rendu prévu (JSON, PDF).
 *     L'id d'un autre apporteur et un id inexistant passent par la MÊME requête (`trouver`), et
 *     aboutissent à la MÊME réponse : rien ne distingue les deux chemins.
 *  5. CE QUI TRAVERSE LE CLOISONNEMENT EST UNE LISTE BLANCHE. L'occupation d'une entreprise par un
 *     autre apporteur ne se dit qu'avec sa date de fin (`vueDeLOccupationEtrangere`) : ni
 *     identifiant, ni nom, ni date de dépôt, ni stade.
 *
 * LIMITES DÉCLARÉES.
 *  a) La couche rend les LIGNES entières de la session ; la projection vers un DTO de l'espace
 *     appartient à l'écran qui l'affiche.
 *  b) Une colonne UNIQUE autre que l'id (une empreinte de jeton) peut, en création, entrer en
 *     collision avec la ligne d'un autre apporteur : l'erreur de base qui en résulte dit qu'une
 *     valeur existe. Ces colonnes portent des empreintes de secrets tirés au hasard ; qui connaît
 *     l'empreinte d'un autre a déjà son secret.
 *  c) Un chemin qui n'appelle pas cette couche n'est pas vu d'ici : c'est la règle semgrep et la
 *     gate `idor:check` (`tests/integration/idor.spec.ts`) qui le ferment.
 */

import type {
  Apporteur,
  ChangementCourriel,
  CourrielEnvoye,
  IdentiteFacturation,
  JetonDepot,
  LienMagique,
  Prisma,
  PrismaClient,
  SessionEspace,
} from '@prisma/client';

// ── ce qui est cloisonné ─────────────────────────────────────────────────────────────────────────

/** Les délégués du client dont les lignes appartiennent à un apporteur (colonne `apporteurId`). */
export const MODELES_CLOISONNES = [
  'changementCourriel',
  'courrielEnvoye',
  'identiteFacturation',
  'jetonDepot',
  'lienMagique',
  'sessionEspace',
] as const;
export type ModeleCloisonne = (typeof MODELES_CLOISONNES)[number];

/** Les clés qu'aucune écriture de l'espace ne porte : identité de la ligne, propriétaire, relations. */
export const CLES_REFUSEES = {
  changementCourriel: ['id', 'apporteurId', 'apporteur'],
  courrielEnvoye: ['id', 'apporteurId', 'apporteur'],
  identiteFacturation: ['id', 'apporteurId', 'apporteur'],
  jetonDepot: ['id', 'apporteurId', 'apporteur'],
  lienMagique: [
    'id',
    'apporteurId',
    'apporteur',
    'utilisateurConsoleId',
    'utilisateurConsole',
    'session',
  ],
  sessionEspace: [
    'id',
    'apporteurId',
    'apporteur',
    'utilisateurConsoleId',
    'utilisateurConsole',
    'lienMagique',
  ],
} as const satisfies Record<ModeleCloisonne, readonly string[]>;

/** Les clés étrangères vers une autre table cloisonnée : admises si la ligne visée est de la session. */
export const REFERENCES_CLOISONNEES: Partial<
  Record<ModeleCloisonne, Readonly<Record<string, ModeleCloisonne>>>
> = {
  sessionEspace: { lienMagiqueId: 'lienMagique' },
};

/** Les messages de refus : une liste FERMÉE, qui part au journal et jamais au navigateur. */
export const REFUS = {
  identifiant: 'acces_identifiant_d_apporteur_invalide',
  cle: 'acces_ecriture_d_une_cle_refusee',
  reference: 'acces_reference_hors_session',
} as const;

// ── les vues ─────────────────────────────────────────────────────────────────────────────────────

/** Ce qu'une vue cloisonnée permet : chaque méthode filtre par l'apporteur de la session. */
export interface VueCloisonnee<R, W, C, U, O> {
  /** La ligne de la session, ou `null` — pour un id étranger comme pour un id inexistant. */
  trouver(id: string): Promise<R | null>;
  lister(options?: { where?: W; orderBy?: O; take?: number }): Promise<R[]>;
  compter(where?: W): Promise<number>;
  creer(data: C): Promise<R>;
  /** Modifie la ligne de la session ; `introuvable` pour un id étranger comme pour un inexistant. */
  modifier(id: string, data: U): Promise<'modifiee' | 'introuvable'>;
}

/** Le délégué tel que la vue l'appelle : cinq méthodes, rien d'autre. */
interface Delegue<R, W, C, U, O> {
  findFirst(args: { where: W }): PromiseLike<R | null>;
  findMany(args: { where: W; orderBy?: O; take?: number }): PromiseLike<R[]>;
  count(args: { where: W }): PromiseLike<number>;
  create(args: { data: C }): PromiseLike<R>;
  updateMany(args: { where: W; data: U }): PromiseLike<{ count: number }>;
}

type SansProprietaire<C> = Omit<C, 'id' | 'apporteurId' | 'apporteur'>;

// Les types du schéma généré, par alias : un argument de type ne commence jamais par le namespace.
type WChangement = Prisma.ChangementCourrielWhereInput;
type CChangement = Prisma.ChangementCourrielUncheckedCreateInput;
type UChangement = Prisma.ChangementCourrielUncheckedUpdateManyInput;
type OChangement = Prisma.ChangementCourrielOrderByWithRelationInput;
type WCourriel = Prisma.CourrielEnvoyeWhereInput;
type CCourriel = Prisma.CourrielEnvoyeUncheckedCreateInput;
type UCourriel = Prisma.CourrielEnvoyeUncheckedUpdateManyInput;
type OCourriel = Prisma.CourrielEnvoyeOrderByWithRelationInput;
type WIdentite = Prisma.IdentiteFacturationWhereInput;
type CIdentite = Prisma.IdentiteFacturationUncheckedCreateInput;
type UIdentite = Prisma.IdentiteFacturationUncheckedUpdateManyInput;
type OIdentite = Prisma.IdentiteFacturationOrderByWithRelationInput;
type WJeton = Prisma.JetonDepotWhereInput;
type CJeton = Prisma.JetonDepotUncheckedCreateInput;
type UJeton = Prisma.JetonDepotUncheckedUpdateManyInput;
type OJeton = Prisma.JetonDepotOrderByWithRelationInput;
type WLien = Prisma.LienMagiqueWhereInput;
type CLien = Prisma.LienMagiqueUncheckedCreateInput;
type ULien = Prisma.LienMagiqueUncheckedUpdateManyInput;
type OLien = Prisma.LienMagiqueOrderByWithRelationInput;
type WSession = Prisma.SessionEspaceWhereInput;
type CSession = Prisma.SessionEspaceUncheckedCreateInput;
type USession = Prisma.SessionEspaceUncheckedUpdateManyInput;
type OSession = Prisma.SessionEspaceOrderByWithRelationInput;

/** L'accès de l'espace, pour UN apporteur : une vue par modèle cloisonné, et sa propre fiche. */
export interface AccesApporteur {
  readonly apporteurId: string;
  /** La fiche de l'apporteur de la session. */
  moi(): Promise<Apporteur | null>;
  changementCourriel: VueCloisonnee<
    ChangementCourriel,
    WChangement,
    SansProprietaire<CChangement>,
    UChangement,
    OChangement
  >;
  courrielEnvoye: VueCloisonnee<
    CourrielEnvoye,
    WCourriel,
    SansProprietaire<CCourriel>,
    UCourriel,
    OCourriel
  >;
  identiteFacturation: VueCloisonnee<
    IdentiteFacturation,
    WIdentite,
    SansProprietaire<CIdentite>,
    UIdentite,
    OIdentite
  >;
  jetonDepot: VueCloisonnee<JetonDepot, WJeton, SansProprietaire<CJeton>, UJeton, OJeton>;
  lienMagique: VueCloisonnee<LienMagique, WLien, SansProprietaire<CLien>, ULien, OLien>;
  sessionEspace: VueCloisonnee<
    SessionEspace,
    WSession,
    SansProprietaire<CSession>,
    USession,
    OSession
  >;
}

/** Le client dont la couche a besoin : les délégués cloisonnés et celui de l'apporteur. */
export type ClientCloisonnable = Pick<PrismaClient, ModeleCloisonne | 'apporteur'>;

// ── la construction ──────────────────────────────────────────────────────────────────────────────

const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function estUnUuid(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && FORME_UUID.test(valeur);
}

/**
 * La couche d'accès de l'apporteur de la SESSION. `apporteurId` vient de la session vérifiée en
 * base, jamais d'une entrée de la requête.
 */
export function forApporteur(client: ClientCloisonnable, apporteurId: string): AccesApporteur {
  if (!estUnUuid(apporteurId)) throw new Error(REFUS.identifiant);

  /** La vue d'un modèle ; ses références se vérifient par la vue de leur cible, même session. */
  function vue(
    modele: ModeleCloisonne
  ): VueCloisonnee<unknown, unknown, unknown, unknown, unknown> {
    const delegue = client[modele] as unknown as Delegue<
      unknown,
      unknown,
      unknown,
      unknown,
      unknown
    >;
    return cloisonner(modele, delegue, apporteurId, (cible, id) => vue(cible).trouver(id));
  }
  const vues: unknown = Object.fromEntries(MODELES_CLOISONNES.map((m) => [m, vue(m)]));

  return {
    apporteurId,
    moi: () => client.apporteur.findFirst({ where: { id: apporteurId } }),
    ...(vues as Omit<AccesApporteur, 'apporteurId' | 'moi'>),
  };
}

function cloisonner<R, W, C, U, O>(
  modele: ModeleCloisonne,
  delegue: Delegue<R, W, C, U, O>,
  apporteurId: string,
  visible: (modele: ModeleCloisonne, id: string) => Promise<unknown>
): VueCloisonnee<R, W, C, U, O> {
  const portee = (where: unknown): W => {
    const conjonction: unknown = { AND: [where, { apporteurId }] };
    return conjonction as W;
  };

  /** Refuse les clés interdites, puis vérifie chaque référence déclarée par la vue de la session. */
  async function verifier(data: object): Promise<void> {
    for (const cle of CLES_REFUSEES[modele]) {
      if (Object.hasOwn(data, cle)) throw new Error(REFUS.cle);
    }
    for (const [colonne, cible] of Object.entries(REFERENCES_CLOISONNEES[modele] ?? {})) {
      const valeur: unknown = new Map(Object.entries(data)).get(colonne);
      if (valeur === undefined || valeur === null) continue;
      if ((await visible(cible, String(valeur))) === null) throw new Error(REFUS.reference);
    }
  }

  return {
    async trouver(id) {
      if (!estUnUuid(id)) return null;
      return delegue.findFirst({ where: portee({ id }) });
    },
    async lister(options) {
      return delegue.findMany({ ...options, where: portee(options?.where ?? {}) });
    },
    async compter(where) {
      return delegue.count({ where: portee(where ?? {}) });
    },
    async creer(data) {
      await verifier(data as object);
      return delegue.create({ data: { ...data, apporteurId } });
    },
    async modifier(id, data) {
      if (!estUnUuid(id)) return 'introuvable';
      await verifier(data as object);
      const { count } = await delegue.updateMany({ where: portee({ id }), data });
      return count === 1 ? 'modifiee' : 'introuvable';
    },
  };
}

// ── la réponse à une ressource absente ───────────────────────────────────────────────────────────

/** Le corps unique d'une ressource introuvable — étrangère ou inexistante, on ne dit pas laquelle. */
export const CORPS_INTROUVABLE = '{"error":"introuvable"}';

/** Une réponse 404 NEUVE à chaque appel (un corps ne se lit qu'une fois), identique octet à octet. */
export function introuvable(): Response {
  return new Response(CORPS_INTROUVABLE, {
    status: 404,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** La ligne rendue par `rendre`, ou `introuvable()` — quel que soit le format que `rendre` aurait produit. */
export function repondre<R>(ligne: R | null, rendre: (ligne: R) => Response): Response {
  return ligne === null ? introuvable() : rendre(ligne);
}

// ── ce qui traverse le cloisonnement ─────────────────────────────────────────────────────────────

/** Ce que l'espace peut dire de l'occupation d'une entreprise par un autre apporteur : sa fin. */
export interface OccupationEtrangere {
  finAt: Date | null;
}

/** Liste blanche : de la ligne d'un autre apporteur, seule la date de fin traverse (REQ-SEC-022). */
export function vueDeLOccupationEtrangere(ligne: { finAt: Date | null }): OccupationEtrangere {
  return { finAt: ligne.finAt };
}
