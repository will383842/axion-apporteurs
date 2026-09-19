/**
 * La projection d'une réponse du tiers — INT-T09 (REQ-INT-021, REQ-SEC-013).
 *
 * D'UNE RÉPONSE LUE, DEUX OBJETS, ET SEULEMENT DEUX :
 *   — la SUGGESTION, ce que le navigateur verra : SIREN, SIRET du siège, nom, code postal et
 *     commune — ces deux derniers retirés dès que la diffusion n'est pas pleine (`statut_diffusion`
 *     de l'unité légale OU du siège différent de `O` : échec fermé, une valeur inconnue vaut
 *     partielle) ;
 *   — la FICHE, ce que le serveur persistera : exactement les champs de REQ-INT-021, et des
 *     dirigeants une EMPREINTE et la qualité.
 *
 * L'EMPREINTE D'UN DIRIGEANT. HMAC-SHA-256 sous `PII_HASH_KEY` — la clé des empreintes de recherche
 * des données personnelles (`src/lib/env.ts`), jamais une empreinte nue qu'un dictionnaire de noms
 * inverserait. Le texte empreint est NORMALISÉ (casse, accents, ponctuation, espaces) pour que le
 * signal interne rapproche « Jean-Émile » et « JEAN EMILE ». Un dirigeant personne morale est
 * empreint sur sa dénomination, sous une étiquette distincte : l'exigence ne dit que « nom +
 * prénoms », et l'option retenue est la plus fermée — rien en clair (question ouverte au rendu).
 */
import { createHmac } from 'node:crypto';
import type {
  DirigeantDuTiers,
  FicheEntreprise,
  Projection,
  ReponseDuTiers,
  ResultatDuTiers,
  Suggestion,
} from './schemas';
import { schemaProjection } from './schemas';

/** Rend l'empreinte (64 hexadécimaux) d'un texte déjà normalisé. */
export type Empreinteur = (texteNormalise: string) => string;

const ETIQUETTE = 'partners.dirigeant.v1';

/** La fabrique de l'empreinteur : la clé est reçue, jamais lue ici. */
export function empreinteurDeDirigeants(cle: string): Empreinteur {
  if (cle === '') throw new Error('empreinteur_sans_cle : une empreinte sans clé est inversible');
  return (texte) =>
    createHmac('sha256', cle).update(`${ETIQUETTE}\u001f${texte}`, 'utf8').digest('hex');
}

/** Majuscules, sans accents, toute ponctuation réduite à une espace, espaces réduites. */
function normaliser(texte: string | null): string {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Le texte empreint d'une personne physique : nom et prénoms normalisés, séparés sans ambiguïté. */
export function normaliserNomDeDirigeant(nom: string | null, prenoms: string | null): string {
  return `pp\u001f${normaliser(nom)}\u001f${normaliser(prenoms)}`;
}

function texteDuDirigeant(d: DirigeantDuTiers): string {
  return d.type_dirigeant === 'personne physique'
    ? normaliserNomDeDirigeant(d.nom, d.prenoms)
    : `pm\u001f${normaliser(d.denomination)}`;
}

/** Échec fermé : seul `O` est une diffusion pleine. */
function diffusionPleine(r: ResultatDuTiers): boolean {
  return r.statut_diffusion === 'O' && r.siege.statut_diffusion_etablissement === 'O';
}

export function versSuggestion(r: ResultatDuTiers): Suggestion {
  const pleine = diffusionPleine(r);
  return {
    siren: r.siren,
    siret: r.siege.siret,
    nom: r.nom_complet,
    codePostal: pleine ? r.siege.code_postal : null,
    commune: pleine ? r.siege.libelle_commune : null,
  };
}

export function versFiche(r: ResultatDuTiers, empreindre: Empreinteur): FicheEntreprise {
  return {
    siren: r.siren,
    siret: r.siege.siret,
    nom_complet: r.nom_complet,
    nature_juridique: r.nature_juridique,
    activite_principale: r.activite_principale,
    tranche_effectif_salarie: r.tranche_effectif_salarie,
    etat_administratif: r.etat_administratif,
    categorie_entreprise: r.categorie_entreprise,
    siege: {
      code_postal: r.siege.code_postal,
      libelle_commune: r.siege.libelle_commune,
      departement: r.siege.departement,
      region: r.siege.region,
    },
    dirigeants: r.dirigeants.map((d) => ({
      empreinte: empreindre(texteDuDirigeant(d)),
      qualite: d.qualite,
    })),
  };
}

/** La projection d'une réponse entière, repassée par son schéma strict : rien d'autre ne sort. */
export function projeter(reponse: ReponseDuTiers, empreindre: Empreinteur): Projection {
  return schemaProjection.parse({
    suggestions: reponse.results.map(versSuggestion),
    fiches: reponse.results.map((r) => versFiche(r, empreindre)),
  });
}
