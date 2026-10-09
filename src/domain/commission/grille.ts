/**
 * La grille de commission publiée par axionia, telle que Partners la reçoit — DM-03-P (REQ-DM-014,
 * qui absorbe REQ-ARG-031 ; REQ-INT-017).
 *
 * UNE SEULE SOURCE, ET CE N'EST PAS CE DÉPÔT. La grille naît de `pricing.ts` d'axionia ; l'export
 * (DM-03-A, `src/server/partners-sync/grille/export.ts` là-bas) en produit `commissions.v<N>.json` :
 * un contenu, son empreinte, et l'empreinte de CHAQUE ligne. Partners n'y retape rien (RM-01) : il
 * VÉRIFIE ce qu'il reçoit, puis le stocke tel quel (`src/server/grille/import.ts`). Aucune valeur de
 * la grille n'est écrite dans ce dépôt public (`docs/PRESEANCE.md` §3.4) : les tests lisent une
 * publication PSEUDONYMISÉE par le producteur lui-même.
 *
 * DEUX NIVEAUX D'EMPREINTE, ET POURQUOI. L'empreinte du contenu dit QU'un octet a changé ; seule
 * l'empreinte de ligne dit LEQUEL. Un centime modifié sans toucher les empreintes annoncées sort donc
 * NOMMÉ — la ligne, l'empreinte annoncée, l'empreinte recalculée — et non comme un « contenu
 * altéré » anonyme qu'il faudrait chercher à la main dans deux cents lignes.
 *
 * L'EMPREINTE est le SHA-256 hexadécimal de la forme canonique (`canonique`, sous-ensemble de
 * RFC 8785, le même algorithme que l'export d'axionia) : l'ordre des clés ne compte pas, et un passage
 * par `jsonb` ne change donc rien. Seuls les entiers sûrs sont admis : centimes et points de base.
 *
 * LA FORME EST FERMÉE. Un champ inconnu, un montant à virgule, un forfait sans montant ou un
 * pourcentage hors de ]0, 10000] points de base sont REFUSÉS, jamais complétés : une commission
 * calculée sur une ligne devinée est une perte d'argent silencieuse.
 *
 * Domaine pur : aucune I/O, aucune horloge.
 */
import { createHash } from 'node:crypto';
import { canonique } from '../evenement/canonique';
import {
  BPS_MAX,
  GENRES_DE_COMMISSION,
  SCHEMAS_LISIBLES,
  SCHEMA_PUBLICATION_GRILLE,
  type ContenuGrille,
  type GenreDeCommission,
  type LigneCommissionPubliee,
  type PublicationGrille,
} from '../../../packages/contracts/grille';

// La FORME vit dans le contrat (`packages/contracts/grille.ts`, INT-T47-P) : ce module la lit, il
// n'en porte aucune copie. Ses noms restent exportés d'ici pour les appelants du domaine.
export { BPS_MAX, SCHEMA_PUBLICATION_GRILLE, type ContenuGrille, type PublicationGrille };

// ── La correspondance des types de commission (INT-T47-P, décision A02 du 2026-10-02) ──────────

/** Les trois types de ligne de Partners (`TypeLigneGrille`, docs/GLOSSAIRE.md §4). */
export type TypeDeLigne = 'forfait' | 'pourcentage' | 'aucune';

/**
 * UN SEUL ENDROIT : le genre d'axion-ia vers le type de Partners. `scale` est un barème non publié
 * (HYP-W6-BIS) : il n'est JAMAIS un montant, et devient `aucune`. Fermée par son type : une quatrième
 * valeur ne compile pas, et à l'exécution elle lève (`typeDeLigne`).
 */
export const CORRESPONDANCE_DES_TYPES = {
  flat: 'forfait',
  percent: 'pourcentage',
  scale: 'aucune',
} as const satisfies Readonly<Record<GenreDeCommission, TypeDeLigne>>;

/** Le type de Partners d'un genre d'axion-ia ; un genre hors des trois LÈVE, nommé. */
export function typeDeLigne(genre: string): TypeDeLigne {
  const genres: readonly string[] = GENRES_DE_COMMISSION;
  if (!genres.includes(genre)) {
    throw new Error(`genre de commission inconnu : « ${genre} » — ni flat, ni percent, ni scale`);
  }
  return CORRESPONDANCE_DES_TYPES[genre as GenreDeCommission];
}

/** La commission telle qu'elle s'AFFICHE pour un palier : dérivée, jamais publiée. */
export type CommissionPubliee =
  | { readonly type: 'forfait'; readonly montantCents: number }
  | { readonly type: 'pourcentage'; readonly tauxBps: number }
  | { readonly type: 'aucune' };

/**
 * La commission PUBLIÉE d'une ligne : DÉRIVÉE par la correspondance, à partir de la ligne de
 * commission reçue — jamais lue dans la publication, qui ne la porte pas (contrat d'A02). C'est
 * elle qui remplit `PUBLIEE_<palier>` de l'annexe.
 */
export function commissionPubliee(ligne: LigneCommissionPubliee): CommissionPubliee {
  const type = typeDeLigne(ligne.kind);
  if (type === 'forfait' && ligne.montantCents !== null) {
    return { type, montantCents: ligne.montantCents };
  }
  if (type === 'pourcentage' && ligne.tauxBps !== null) return { type, tauxBps: ligne.tauxBps };
  return { type: 'aucune' };
}

/** Ce que l'annexe lit d'un palier en schema 2 : l'éligibilité au CPF et le prix de référence. */
export type ChampsDuSchema2 = {
  readonly tierId: string;
  readonly cpfEligible: boolean;
  readonly prixReferenceHtCents: number | null;
};

/** Levée quand une publication en schema 1 est lue pour ce que seul le schema 2 porte. */
export class ChampsDuSchema2Absents extends Error {
  constructor(readonly version: number) {
    super(`publication en schema 1, champs du schema 2 absents (v${version})`);
    this.name = 'ChampsDuSchema2Absents';
  }
}

/**
 * Les champs du schema 2 de chaque palier, pour l'annexe du contrat (DM-23 l'appelle). Une
 * publication en schema 1 REFUSE : jamais `false` ni un prix nul par défaut, qui feraient dire à
 * l'annexe ce que la grille n'a pas publié.
 */
export function champsDuSchema2(pub: PublicationGrille): ChampsDuSchema2[] {
  if (pub.contenu.schema !== 2) throw new ChampsDuSchema2Absents(pub.version);
  return pub.contenu.paliers.map((p) => ({
    tierId: p.tierId,
    cpfEligible: p.cpfEligible,
    prixReferenceHtCents: p.prixReferenceHtCents,
  }));
}

/** Levée quand une publication n'a pas la forme du contrat : le chemin du champ est dans le message. */
export class PublicationIllisible extends Error {
  constructor(readonly defauts: readonly string[]) {
    super(`publication de grille illisible : ${defauts.join(' ; ')}`);
    this.name = 'PublicationIllisible';
  }
}

/** Lit une publication brute, ou LÈVE en nommant chaque champ fautif. Rien n'est complété. */
export function lirePublication(brut: unknown): PublicationGrille {
  const schema: unknown =
    typeof brut === 'object' && brut !== null
      ? (brut as { contenu?: { schema?: unknown } }).contenu?.schema
      : undefined;
  const lisibles: readonly unknown[] = SCHEMAS_LISIBLES;
  if (schema !== undefined && !lisibles.includes(schema)) {
    // INT-T47-P : une forme que Partners ne connaît pas est REFUSÉE, nommée — échec fermé.
    throw new PublicationIllisible([
      `contenu.schema : schema ${typeof schema === 'string' ? `"${schema}"` : String(schema)} inconnu — Partners lit ${SCHEMAS_LISIBLES.join(' et ')}`,
    ]);
  }
  const r = SCHEMA_PUBLICATION_GRILLE.safeParse(brut);
  if (!r.success) {
    throw new PublicationIllisible(
      r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
    );
  }
  return r.data;
}

/** SHA-256 hexadécimal de la forme canonique : la MÊME règle que l'export d'axionia. */
export function empreinteGrille(valeur: unknown): string {
  return createHash('sha256').update(canonique(valeur)).digest('hex');
}

export type FauteGrille = {
  readonly famille:
    | 'empreinte_du_contenu'
    | 'ligne_divergente'
    | 'ligne_sans_empreinte'
    | 'empreinte_sans_ligne'
    | 'ligne_en_double';
  /** `commission:<id>` ou `palier:<id>` ; absent pour l'empreinte du contenu. */
  readonly ligne: string | null;
  readonly message: string;
};

export type VerdictGrille = {
  /** Les lignes de barème RÉELLEMENT confrontées : « 0 » ne se lit jamais comme « aucun défaut ». */
  readonly lignesConfrontees: number;
  readonly fautes: readonly FauteGrille[];
};

function confronterFamille(
  famille: 'commission' | 'palier',
  lignes: ReadonlyArray<{ readonly id: string; readonly ligne: unknown }>,
  annoncees: Readonly<Record<string, string>>
): FauteGrille[] {
  const fautes: FauteGrille[] = [];
  const vues = new Set<string>();
  for (const { id, ligne } of lignes) {
    const nom = `${famille}:${id}`;
    if (vues.has(id)) {
      fautes.push({ famille: 'ligne_en_double', ligne: nom, message: `${nom} figure deux fois` });
      continue;
    }
    vues.add(id);
    const annoncee = Object.hasOwn(annoncees, id) ? annoncees[id] : undefined;
    if (annoncee === undefined) {
      fautes.push({
        famille: 'ligne_sans_empreinte',
        ligne: nom,
        message: `${nom} n'a aucune empreinte annoncée`,
      });
      continue;
    }
    const recalculee = empreinteGrille(ligne);
    if (recalculee !== annoncee) {
      fautes.push({
        famille: 'ligne_divergente',
        ligne: nom,
        message: `${nom} : empreinte annoncée ${annoncee} ≠ recalculée ${recalculee}`,
      });
    }
  }
  for (const id of Object.keys(annoncees)) {
    if (!vues.has(id)) {
      fautes.push({
        famille: 'empreinte_sans_ligne',
        ligne: `${famille}:${id}`,
        message: `${famille}:${id} a une empreinte annoncée mais aucune ligne`,
      });
    }
  }
  return fautes;
}

/**
 * Confronte chaque ligne à son empreinte annoncée, puis le contenu entier à la sienne. Une faute
 * de ligne nomme la ligne ; l'empreinte du contenu attrape ce qu'aucune ligne ne porte (unités,
 * version d'événement, ordre).
 */
export function verifierPublication(pub: PublicationGrille): VerdictGrille {
  const { commissions, paliers } = pub.contenu;
  const fautes = [
    ...confronterFamille(
      'commission',
      commissions.map((l) => ({ id: l.commissionId, ligne: l })),
      pub.empreintesLignes.commissions
    ),
    ...confronterFamille(
      'palier',
      paliers.map((l) => ({ id: l.tierId, ligne: l })),
      pub.empreintesLignes.paliers
    ),
  ];
  const recalculee = empreinteGrille(pub.contenu);
  if (recalculee !== pub.hash) {
    fautes.push({
      famille: 'empreinte_du_contenu',
      ligne: null,
      message: `v${pub.version} : empreinte annoncée ${pub.hash} ≠ recalculée ${recalculee}`,
    });
  }
  return { lignesConfrontees: commissions.length + paliers.length, fautes };
}

/** Une version déjà en base : son numéro et son empreinte, rien d'autre. */
export type VersionImportee = { readonly version: number; readonly hash: string };

export type DecisionImport =
  | { readonly statut: 'a_ecrire' }
  | { readonly statut: 'deja_importee' }
  | { readonly statut: 'contradictoire'; readonly messages: readonly string[] };

/**
 * Que faire d'une publication VÉRIFIÉE, au vu des versions déjà en base (acceptation 4) : la même
 * version sous la même empreinte est déjà là, et ne s'écrit pas deux fois ; un numéro connu sous
 * une autre empreinte, ou une empreinte connue sous un autre numéro, se contredisent et se
 * refusent nommément — une version importée n'est jamais réécrite.
 */
export function decisionDImport(
  pub: Pick<PublicationGrille, 'version' | 'hash'>,
  existantes: readonly VersionImportee[]
): DecisionImport {
  const pertinentes = existantes.filter((e) => e.version === pub.version || e.hash === pub.hash);
  if (pertinentes.some((e) => e.version === pub.version && e.hash === pub.hash)) {
    return { statut: 'deja_importee' };
  }
  if (pertinentes.length === 0) return { statut: 'a_ecrire' };
  return {
    statut: 'contradictoire',
    messages: pertinentes.map((e) =>
      e.version === pub.version
        ? `v${pub.version} est déjà importée sous l'empreinte ${e.hash} : une version importée n'est jamais réécrite`
        : `l'empreinte ${pub.hash} est déjà importée comme v${e.version}, pas v${pub.version}`
    ),
  };
}
