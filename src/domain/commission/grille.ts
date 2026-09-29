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
import { z } from 'zod';
import { canonique } from '../evenement/canonique';
import { HASH_HEX_64 } from '../evenement/charges';

/** Le plafond d'un taux : 100 % en points de base. */
export const BPS_MAX = 10_000;

const ligneCommission = z
  .object({
    commissionId: z.string().min(1),
    libelleFr: z.string().min(1),
    kind: z.enum(['flat', 'percent', 'scale']),
    montantCents: z.number().int().positive().nullable(),
    tauxBps: z.number().int().min(1).max(BPS_MAX).nullable(),
  })
  .strict()
  .superRefine((l, ctx) => {
    const attendu = {
      flat: { montantCents: true, tauxBps: false },
      percent: { montantCents: false, tauxBps: true },
      scale: { montantCents: false, tauxBps: false },
    }[l.kind];
    for (const champ of ['montantCents', 'tauxBps'] as const) {
      if ((l[champ] !== null) !== attendu[champ]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [champ],
          message: `commission « ${l.commissionId} » (${l.kind}) : ${champ} ${attendu[champ] ? 'requis' : 'interdit'}`,
        });
      }
    }
  });

const lignePalier = z
  .object({
    tierId: z.string().min(1),
    categorie: z.string().min(1),
    commissionId: z.string().min(1).nullable(),
    statut: z.enum(['taux', 'bareme_indefini']),
    baremeIndefini: z
      .object({
        depuis: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        motif: z.enum([
          'hors_perimetre_w6',
          'bareme_non_publie',
          'palier_sans_bareme',
          'non_declare',
        ]),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((p) => (p.statut === 'taux') === (p.baremeIndefini === null), {
    message: 'un palier « taux » ne porte aucun barème indéfini, et inversement',
    path: ['baremeIndefini'],
  });

const contenuGrille = z
  .object({
    schema: z.literal(1),
    unites: z
      .object({ montant: z.literal('centimes_ht'), taux: z.literal('points_de_base') })
      .strict(),
    grilleVersionEvenement: z.string().regex(/^[0-9a-f]{12}$/),
    commissions: z.array(ligneCommission).min(1),
    paliers: z.array(lignePalier).min(1),
  })
  .strict();

const empreinte = z.string().regex(HASH_HEX_64);

/** Le fichier `commissions.v<N>.json` publié par axionia. */
export const SCHEMA_PUBLICATION_GRILLE = z
  .object({
    version: z.number().int().positive(),
    publieeAt: z.string().datetime(),
    hash: empreinte,
    empreintesLignes: z
      .object({ commissions: z.record(empreinte), paliers: z.record(empreinte) })
      .strict(),
    contenu: contenuGrille,
  })
  .strict();

export type PublicationGrille = z.infer<typeof SCHEMA_PUBLICATION_GRILLE>;
export type ContenuGrille = PublicationGrille['contenu'];

/** Levée quand une publication n'a pas la forme du contrat : le chemin du champ est dans le message. */
export class PublicationIllisible extends Error {
  constructor(readonly defauts: readonly string[]) {
    super(`publication de grille illisible : ${defauts.join(' ; ')}`);
    this.name = 'PublicationIllisible';
  }
}

/** Lit une publication brute, ou LÈVE en nommant chaque champ fautif. Rien n'est complété. */
export function lirePublication(brut: unknown): PublicationGrille {
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
