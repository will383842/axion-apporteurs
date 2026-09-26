/**
 * LE MANIFESTE de l'adaptateur `partners` — ce que le socle épingle par empreinte (INT-T11,
 * REQ-INT-026).
 *
 * Les refus sont ceux du registre du socle (`core/adapter-kit/manifest.ts`, `analyserDefinition`)
 * qui se détectent sans lui : schéma d'entrée fermé jusqu'au dernier sous-objet, aucun nom réservé
 * au contexte dans l'entrée, rang 2 optionnel en sortie, préfixe dérivé, noms uniques, énumérations
 * connues, mode fédéré sans secret — et `tools : vide`. Les RÈGLES sont portées ; le TEXTE ne l'est
 * mot pour mot que pour `tools : vide`, les autres refus sont reformulés.
 *
 * CHAQUE REFUS EST RANGÉ SOUS LE CONTRÔLE DU HARNAIS QUI LE JUGE (`parControle`) : la règle vit ici,
 * une fois, et le harnais la lit au lieu de la retaper.
 *
 * UNE DIVERGENCE AVEC LE SOCLE EST UN REFUS NOMMÉ, JAMAIS UNE ADAPTATION. En phase 0 le registre
 * est vide, et le socle refuserait ce manifeste : le document versionné le dit (`etat: "refuse"`,
 * `refus`), au lieu de retirer la règle pour obtenir un manifeste « publiable ».
 *
 * LE DOCUMENT VERSIONNÉ est `manifeste.json`, écrit par `pnpm mcp:manifeste:ecrire` et confronté au
 * code par `pnpm mcp:manifeste` et par le contrôle 6 du harnais.
 */
import { z } from 'zod/v4';
import {
  DATA_CLASSES,
  EFFECTS,
  ID_ADAPTATEUR,
  IDEMPOTENCES,
  MODE_ADAPTATEUR,
  NOMS_RESERVES_AU_CONTEXTE,
  PAGINATIONS,
  PROFILS_DE_L_ADAPTATEUR,
  PROFILS_DU_SOCLE,
  SCEAU_PROFILS,
  SECRETS_DE_L_ADAPTATEUR,
  VERSION_ADAPTATEUR,
  nomComplet,
  type OutilQuelconque,
} from './socle';
import {
  canoniser,
  empreinteCanonique,
  octetsCanoniques,
  versValeurJson,
  type ObjetJson,
  type ValeurJson,
} from './json-canonique';
import manifesteVersionne from './manifeste.json';
import { OUTILS } from './registre';

export const VERSION_MANIFESTE = 1;

export interface ManifesteOutil {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly effect: string;
  readonly dataClass: string;
  readonly idempotency: string;
  readonly pagination: string;
  readonly inputSchema: ValeurJson;
  readonly outputSchema: ValeurJson;
  readonly maxBytes: number;
  readonly compaction: {
    readonly free: readonly string[];
    readonly tier2: readonly string[];
    readonly aggregateBy: string | null;
  };
  readonly idFields: readonly string[];
  readonly governanceFields: readonly string[];
  readonly bytes: number;
}

export interface Manifeste {
  readonly manifestVersion: number;
  readonly id: string;
  readonly version: string;
  readonly mode: 'hébergé' | 'fédéré';
  readonly profilesVersion: string;
  readonly profilesSha: string;
  readonly profiles: readonly string[];
  readonly secrets: readonly string[];
  readonly tools: readonly ManifesteOutil[];
}

const MOTIF_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MOTIF_VERSION = /^\d+\.\d+\.\d+$/;
const MOTIF_NOM_OUTIL = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;
const CLES_DE_FERMETURE = ['additionalProperties', 'unevaluatedProperties'] as const;

function commeObjet(valeur: ValeurJson | undefined): ObjetJson | null {
  if (valeur === undefined || valeur === null || typeof valeur !== 'object') return null;
  if (Array.isArray(valeur)) return null;
  return valeur as ObjetJson;
}

/** Les sous-schémas d'objet NON fermés, avec leur chemin. */
export function objetsOuverts(schema: ValeurJson): readonly string[] {
  const ouverts: string[] = [];
  const descendre = (valeur: ValeurJson | undefined, chemin: string): void => {
    const objet = commeObjet(valeur);
    if (objet === null) return;
    const estObjet = objet['type'] === 'object' || commeObjet(objet['properties']) !== null;
    if (estObjet && !CLES_DE_FERMETURE.some((cle) => objet[cle] === false)) ouverts.push(chemin);
    for (const cle of ['properties', '$defs', 'definitions', 'patternProperties'] as const) {
      const conteneur = commeObjet(objet[cle]);
      if (conteneur === null) continue;
      for (const [nom, sous] of Object.entries(conteneur))
        descendre(sous, `${chemin}.${cle}.${nom}`);
    }
    for (const cle of ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const) {
      const liste = objet[cle];
      if (Array.isArray(liste))
        liste.forEach((sous, i) => descendre(sous, `${chemin}.${cle}[${i}]`));
    }
    for (const cle of ['items', 'not', 'if', 'then', 'else', 'contains'] as const) {
      descendre(objet[cle], `${chemin}.${cle}`);
    }
  };
  descendre(schema, '$');
  return ouverts;
}

/** Les noms de propriétés d'un schéma, à toute profondeur. */
export function proprietesProfondes(schema: ValeurJson): readonly string[] {
  const noms: string[] = [];
  const descendre = (valeur: ValeurJson | undefined): void => {
    const objet = commeObjet(valeur);
    if (objet === null) return;
    const proprietes = commeObjet(objet['properties']);
    if (proprietes !== null) {
      for (const [nom, sous] of Object.entries(proprietes)) {
        noms.push(nom);
        descendre(sous);
      }
    }
    for (const cle of ['items', 'additionalProperties'] as const) descendre(objet[cle]);
    for (const cle of ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const) {
      const liste = objet[cle];
      if (Array.isArray(liste)) liste.forEach((sous) => descendre(sous));
    }
    const defs = commeObjet(objet['$defs']);
    if (defs !== null) for (const sous of Object.values(defs)) descendre(sous);
  };
  descendre(schema);
  return noms;
}

/** Les propriétés OBLIGATOIRES des éléments de `items`, ou `[]`. */
export function requisDesItems(schemaSortie: ValeurJson): readonly string[] {
  const items = commeObjet(commeObjet(commeObjet(schemaSortie)?.['properties'])?.['items']);
  const requis = commeObjet(items?.['items'])?.['required'];
  return Array.isArray(requis) ? requis.filter((r): r is string => typeof r === 'string') : [];
}

/** Les contrôles du harnais qu'une règle de ce fichier alimente ; le reste relève du manifeste. */
export const CLES_DE_CONTROLE = [
  'effect-dataclass',
  'prefixes-derives',
  'manifeste-sha-stable',
  'autorisation-hors-input',
  'tier2-optionnel',
] as const;
export type CleDeControle = (typeof CLES_DE_CONTROLE)[number];

export interface AnalyseManifeste {
  /** `null` dès qu'une anomalie interdit de le publier. */
  readonly manifeste: Manifeste | null;
  /** Le document tel que le code le produit, publiable ou non : c'est lui qu'on versionne. */
  readonly brouillon: Manifeste;
  readonly anomalies: readonly string[];
  /** Les mêmes refus, rangés par contrôle du harnais. */
  readonly parControle: Readonly<Record<CleDeControle, readonly string[]>>;
  readonly outilsInspectes: number;
}

export function analyserOutils(outils: readonly OutilQuelconque[]): AnalyseManifeste {
  const anomalies: string[] = [];
  const parControle = Object.fromEntries(
    CLES_DE_CONTROLE.map((c) => [c, [] as string[]])
  ) as Record<CleDeControle, string[]>;
  const noter = (cle: CleDeControle, texte: string): void => {
    anomalies.push(texte);
    parControle[cle].push(texte);
  };
  if (!MOTIF_ID.test(ID_ADAPTATEUR))
    noter('manifeste-sha-stable', `id « ${ID_ADAPTATEUR} » hors forme.`);
  if (!MOTIF_VERSION.test(VERSION_ADAPTATEUR))
    noter('manifeste-sha-stable', "version d'adaptateur hors forme.");
  if (MODE_ADAPTATEUR === 'fédéré' && SECRETS_DE_L_ADAPTATEUR.length > 0) {
    noter(
      'manifeste-sha-stable',
      'mode fédéré ⇒ secrets: [] — le socle refuserait l’enregistrement.'
    );
  }
  const profilsConnus = new Set<string>(PROFILS_DU_SOCLE.map((p) => p.nom));
  for (const profil of PROFILS_DE_L_ADAPTATEUR) {
    if (!profilsConnus.has(profil))
      noter('manifeste-sha-stable', `profil « ${profil} » inconnu du socle.`);
  }
  // Le texte du socle, mot pour mot (`core/adapter-kit/manifest.ts`).
  if (outils.length === 0)
    noter('manifeste-sha-stable', "tools : vide — un adaptateur sans outil n'expose rien.");

  const reserves = new Set<string>(NOMS_RESERVES_AU_CONTEXTE);
  const nomsVus = new Set<string>();
  const outilsDuManifeste: ManifesteOutil[] = [];
  for (const outil of outils) {
    const ou = `outil « ${outil.name} »`;
    const avant = anomalies.length;
    if (!MOTIF_NOM_OUTIL.test(outil.name)) noter('manifeste-sha-stable', `${ou} : nom hors forme.`);
    if (outil.name.startsWith(`${ID_ADAPTATEUR}.`)) {
      noter(
        'prefixes-derives',
        `${ou} : le préfixe est DÉRIVÉ de l'id, jamais saisi (contrôle 5).`
      );
    }
    if (!MOTIF_VERSION.test(outil.version))
      noter('manifeste-sha-stable', `${ou} : version hors forme.`);
    if (outil.description.trim() === '') noter('manifeste-sha-stable', `${ou} : description vide.`);
    if (!(EFFECTS as readonly string[]).includes(outil.effect))
      noter('effect-dataclass', `${ou} : effect inconnu.`);
    if (!(DATA_CLASSES as readonly string[]).includes(outil.dataClass)) {
      noter('effect-dataclass', `${ou} : dataClass inconnu.`);
    }
    if (!(IDEMPOTENCES as readonly string[]).includes(outil.idempotency)) {
      noter('manifeste-sha-stable', `${ou} : idempotency inconnu.`);
    }
    if (!(PAGINATIONS as readonly string[]).includes(outil.pagination)) {
      noter('manifeste-sha-stable', `${ou} : pagination inconnu.`);
    }
    if (!Number.isInteger(outil.maxBytes) || outil.maxBytes <= 0) {
      noter('manifeste-sha-stable', `${ou} : maxBytes doit être un entier strictement positif.`);
    }
    if (outil.fixtureMax.trim() === '') noter('manifeste-sha-stable', `${ou} : fixtureMax vide.`);
    const complet = nomComplet(outil.name);
    if (nomsVus.has(complet))
      noter('prefixes-derives', `${ou} : nom complet en double (${complet}).`);
    nomsVus.add(complet);

    let entree: ValeurJson | null = null;
    let sortie: ValeurJson | null = null;
    try {
      entree = versValeurJson(z.toJSONSchema(outil.input, { io: 'input' }), `${ou}, entrée`);
      sortie = versValeurJson(z.toJSONSchema(outil.output, { io: 'output' }), `${ou}, sortie`);
    } catch (erreur) {
      noter(
        'manifeste-sha-stable',
        `${ou} : conversion en JSON Schema impossible — ${(erreur as Error).message}`
      );
    }
    if (entree !== null) {
      const ouverts = objetsOuverts(entree);
      if (ouverts.length > 0) {
        noter(
          'autorisation-hors-input',
          `${ou} : schéma d'entrée OUVERT en ${ouverts.join(', ')} (contrôle 7).`
        );
      }
      const interdits = proprietesProfondes(entree).filter((nom) => reserves.has(nom));
      if (interdits.length > 0) {
        noter(
          'autorisation-hors-input',
          `${ou} : nom(s) réservé(s) au contexte dans l'entrée — ${interdits.join(', ')} (contrôle 7).`
        );
      }
    }
    if (sortie !== null) {
      const ouverts = objetsOuverts(sortie);
      if (ouverts.length > 0)
        noter('manifeste-sha-stable', `${ou} : schéma de sortie OUVERT en ${ouverts.join(', ')}.`);
      const requis = requisDesItems(sortie);
      const obligatoires = outil.compaction.tier2.filter((champ) => requis.includes(champ));
      if (obligatoires.length > 0) {
        noter(
          'tier2-optionnel',
          `${ou} : ${obligatoires.join(', ')} est de rang 2 mais OBLIGATOIRE au schéma de sortie (§ 13.3).`
        );
      }
    }
    if (entree === null || sortie === null || anomalies.length > avant) continue;
    const sansBytes = {
      name: outil.name,
      version: outil.version,
      description: outil.description,
      effect: outil.effect,
      dataClass: outil.dataClass,
      idempotency: outil.idempotency,
      pagination: outil.pagination,
      inputSchema: entree,
      outputSchema: sortie,
      maxBytes: outil.maxBytes,
      compaction: {
        free: [...outil.compaction.free],
        tier2: [...outil.compaction.tier2],
        aggregateBy: outil.compaction.aggregateBy,
      },
      idFields: [...outil.idFields],
      governanceFields: [...outil.governanceFields],
    };
    outilsDuManifeste.push({ ...sansBytes, bytes: octetsCanoniques(sansBytes) });
  }

  const brouillon: Manifeste = {
    manifestVersion: VERSION_MANIFESTE,
    id: ID_ADAPTATEUR,
    version: VERSION_ADAPTATEUR,
    mode: MODE_ADAPTATEUR,
    profilesVersion: SCEAU_PROFILS.version,
    profilesSha: SCEAU_PROFILS.empreinte,
    profiles: [...PROFILS_DE_L_ADAPTATEUR],
    secrets: [...SECRETS_DE_L_ADAPTATEUR],
    tools: outilsDuManifeste,
  };
  return {
    manifeste: anomalies.length === 0 ? brouillon : null,
    brouillon,
    anomalies,
    parControle,
    outilsInspectes: outils.length,
  };
}

/** Le texte canonique : c'est LUI que l'empreinte couvre, pas le fichier indenté. */
export function texteDuManifeste(manifeste: Manifeste): string {
  return canoniser(manifeste as unknown as ValeurJson);
}

export interface DocumentDuManifeste {
  readonly $note: string;
  readonly etat: 'publiable' | 'refuse';
  readonly refus: readonly string[];
  readonly manifestSha: string;
  readonly octetsCanoniques: number;
  readonly manifeste: Manifeste;
}

const NOTE =
  'Généré par `pnpm mcp:manifeste:ecrire`. Ne pas éditer à la main : `pnpm mcp:manifeste` et le ' +
  'contrôle 6 du harnais le confrontent au code. `manifestSha` couvre le texte canonique du ' +
  'manifeste. `etat: "refuse"` : le socle refuserait ce manifeste, pour les motifs de `refus`.';

export function documentDuManifeste(analyse: AnalyseManifeste): DocumentDuManifeste {
  const valeur = analyse.brouillon as unknown as ValeurJson;
  return {
    $note: NOTE,
    etat: analyse.manifeste === null ? 'refuse' : 'publiable',
    refus: [...analyse.anomalies],
    manifestSha: empreinteCanonique(valeur),
    octetsCanoniques: octetsCanoniques(valeur),
    manifeste: analyse.brouillon,
  };
}

/**
 * Confronte un document (par défaut `manifeste.json`) à ce que le code produit. Rend les refus
 * NOMMÉS — `manifeste_diverge` et le champ en cause —, `[]` s'ils sont identiques.
 */
export function confronterManifesteVersionne(
  document: unknown = manifesteVersionne,
  outils: readonly OutilQuelconque[] = OUTILS
): readonly string[] {
  const attendu = documentDuManifeste(analyserOutils(outils));
  let lu: ValeurJson;
  try {
    lu = versValeurJson(document, 'manifeste versionné');
  } catch (erreur) {
    return [`manifeste_illisible : ${(erreur as Error).message}`];
  }
  const objet = commeObjet(lu) ?? {};
  const refus: string[] = [];
  const champs = Object.keys(attendu) as (keyof DocumentDuManifeste)[];
  for (const champ of champs) {
    const a = canoniser(attendu[champ] as unknown as ValeurJson);
    const l = objet[champ] === undefined ? '(absent)' : canoniser(objet[champ] as ValeurJson);
    if (a !== l) {
      refus.push(
        `manifeste_diverge : le champ « ${champ} » du fichier versionné n'est pas ce que le code ` +
          'produit — `pnpm mcp:manifeste:ecrire`, puis relire le diff.'
      );
    }
  }
  for (const champ of Object.keys(objet)) {
    if (!(champs as string[]).includes(champ)) {
      refus.push(`manifeste_diverge : champ « ${champ} » inconnu du document.`);
    }
  }
  return refus;
}
