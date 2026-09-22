/**
 * Le mandataire serveur de l'autocomplétion d'entreprise — INT-T09 (REQ-INT-020, REQ-SEC-013,
 * REQ-QA-028, REQ-UX-020).
 *
 * ⚠️ POURQUOI CE FICHIER NE S'APPELLE PAS `mandataire.ts`, ET NE DOIT PAS L'ÊTRE DE NOUVEAU.
 * `src/config/entite.ts` déclare un POINT DE SORTIE `mandat-autofacturation` — « génération du
 * mandat d'autofacturation » — que `pnpm gov:entite` reconnaît au CHEMIN, sur le motif
 * `(?:mandat|autofacturation)`. `mandataire` contient `mandat` : sous son ancien nom, ce fichier
 * tombait dans ce motif et la garde exigeait de lui un appel à
 * `exigerEntiteRenseignee('mandat-autofacturation')`. Il ne le doit pas, et l'appel aurait été
 * NUISIBLE : les clés qu'exige ce point de sortie comprennent `banqueDebitrice.iban`, encore à la
 * sentinelle en phase 0 — l'autocomplétion d'entreprise aurait levé à chaque frappe, pour un IBAN
 * dont elle n'a que faire.
 * Les deux mots sont des HOMONYMES : ici « mandataire » vaut pour MANDATAIRE SERVEUR, au sens où
 * `src/server/securite/adresse-du-client.ts` l'emploie déjà (le proxy qui parle au tiers à la place
 * du navigateur) ; là-bas « mandat » vaut pour le MANDAT que l'apporteur signe. Le rôle garde donc
 * son nom dans la prose — c'est le vocabulaire du dépôt — et le FICHIER prend celui de ce qu'il
 * expose, `autocompleterEntreprise`, comme ses voisins `cache.ts`, `limiteur.ts` ou `repli.ts`.
 * La collision n'est pas réglée pour autant : tout futur fichier `mandat…ts` sous `src/` la
 * rencontrera. C'est
 * à la tâche de la garde (CPL-T01) de décider si le motif doit discriminer mieux.
 *
 * LE NAVIGATEUR NE JOINT JAMAIS LE TIERS (REQ-SEC-013). Il appelle une action serveur — qui
 * appartient à la tâche de l'écran de dépôt (CONVENTIONS §9 : pas de route HTTP pour un composant) —
 * et cette action appelle `autocompleterEntreprise`. Ce que celle-ci rend est le RENDU : l'objet
 * exact que le navigateur reçoit, passé par un schéma STRICT avant de sortir.
 *
 * L'ORDRE DES CONTRÔLES, et pourquoi :
 *   1. la saisie traverse son schéma (trois caractères au moins) ;
 *   2. l'identité puis l'adresse sont comptées — AVANT le cache : la limite borne ce que l'on
 *      demande, pas ce qu'il en coûte de répondre ; une adresse illisible est refusée (jamais un
 *      seau commun que toutes les requêtes illisibles partageraient) ;
 *   3. le cache (24 h) ; une panne de cache vaut une absence ;
 *   4. le disjoncteur : ouvert, rien ne part ;
 *   5. le débit global (5 par seconde) : c'est le seul compteur qui ne se consomme que si l'appel
 *      part vraiment ;
 *   6. le tiers.
 * Toute issue qui n'est pas une liste de suggestions est la SAISIE MANUELLE, avec son motif :
 * le dépôt n'est jamais bloqué, il continue sans autocomplétion.
 *
 * JOURNALISÉ (REQ-SEC-013) : une ligne par appel — l'issue, le motif, l'origine de la réponse. Ni
 * la saisie, ni l'identité, ni l'adresse, ni leurs empreintes : la ligne dit ce que le mandataire
 * a fait, pas pour qui.
 */
import type { Horloge } from '../../../domain/temps/horloge';
import type { SujetDeCompteur, VerdictDeLimite } from '../../securite/rate-limit';
import {
  cleDeFiche,
  cleDeRecherche,
  relireFiche,
  relireProjection,
  type CacheDeProjections,
} from './cache';
import { classerSuggestions } from './classement';
import type { Disjoncteur, VueDuDisjoncteur } from './disjoncteur';
import type { LimiteurDuMandataire } from './limiteur';
import { PARAMETRES } from './parametres';
import { projeter, type Empreinteur } from './projection';
import { MARQUE_ENTREPRISE_A_VERIFIER } from './repli';
import {
  schemaEntreeAutocompletion,
  schemaReponseAutocompletion,
  type FicheEntreprise,
  type MotifDeSaisieManuelle,
  type Projection,
  type ReponseAutocompletion,
} from './schemas';
import type { ClientDuTiers } from './tiers';

export interface LigneDeJournal {
  readonly signal: 'recherche_entreprises';
  readonly geste: 'autocompletion' | 'fiche';
  readonly issue: ReponseAutocompletion['mode'] | 'fiche';
  readonly motif: MotifDeSaisieManuelle | null;
  readonly origine: 'cache' | 'tiers' | 'aucune';
}

export interface DependancesDuMandataire {
  horloge: Horloge;
  tiers: ClientDuTiers;
  cache: CacheDeProjections;
  limiteur: LimiteurDuMandataire;
  disjoncteur: Disjoncteur;
  empreindre: Empreinteur;
  journaliser: (ligne: LigneDeJournal) => void;
}

/** Qui appelle, en empreintes : l'identité de l'apporteur, l'adresse réseau (`null` si illisible). */
export interface Appelant {
  readonly identite: SujetDeCompteur;
  readonly adresse: SujetDeCompteur | null;
}

/** Un verdict refusé : la limite est atteinte, ou le compteur est aveugle (panne sous `refuser`). */
function motifDeRefus(
  v: VerdictDeLimite,
  siAtteinte: MotifDeSaisieManuelle
): MotifDeSaisieManuelle {
  return v.panne ? 'limiteur_indisponible' : siAtteinte;
}

async function lireLeCache<T>(
  deps: DependancesDuMandataire,
  cle: string,
  relire: (brut: unknown) => T | null
): Promise<T | null> {
  try {
    return relire(await deps.cache.lire(cle));
  } catch {
    return null;
  }
}

async function ecrireLeCache(deps: DependancesDuMandataire, projection: Projection): Promise<void> {
  const ttl = PARAMETRES.cacheSecondes.valeur;
  try {
    for (const fiche of projection.fiches)
      await deps.cache.ecrire(cleDeFiche(fiche.siren), fiche, ttl);
  } catch {
    // Le cache accélère ; il ne décide de rien.
  }
}

type IssueDeLAppel =
  { ok: true; projection: Projection } | { ok: false; motif: MotifDeSaisieManuelle };

/** Les étapes 4 à 6 : disjoncteur, débit global, tiers. Partagées par la recherche et la fiche. */
async function appelerLeTiers(q: string, deps: DependancesDuMandataire): Promise<IssueDeLAppel> {
  const maintenant = deps.horloge.maintenant();
  if (!deps.disjoncteur.autoriser(maintenant)) return { ok: false, motif: 'disjoncteur_ouvert' };
  const debit = await deps.limiteur.global(maintenant);
  if (!debit.autorise) {
    deps.disjoncteur.abandonner();
    return { ok: false, motif: motifDeRefus(debit, 'debit_global') };
  }
  const issue = await deps.tiers(q, maintenant);
  if (!issue.ok) {
    if (issue.motif === 'requete_refusee') deps.disjoncteur.abandonner();
    else deps.disjoncteur.echec(deps.horloge.maintenant(), issue.motif, issue.retryAfterMs);
    return { ok: false, motif: issue.motif };
  }
  deps.disjoncteur.reussite();
  const projection = projeter(issue.reponse, deps.empreindre);
  await ecrireLeCache(deps, projection);
  return { ok: true, projection };
}

/**
 * L'autocomplétion. Ne lève jamais sur une panne : rend la saisie manuelle et son motif. Le rendu
 * est relu par son schéma strict — ce qui n'y est pas déclaré ne sort pas.
 */
export async function autocompleterEntreprise(
  entree: unknown,
  appelant: Appelant,
  deps: DependancesDuMandataire
): Promise<ReponseAutocompletion> {
  let origine: LigneDeJournal['origine'] = 'aucune';
  const rendre = (r: ReponseAutocompletion): ReponseAutocompletion => {
    const sortie = schemaReponseAutocompletion.parse(r);
    deps.journaliser({
      signal: 'recherche_entreprises',
      geste: 'autocompletion',
      issue: sortie.mode,
      motif: sortie.mode === 'saisie_manuelle' ? sortie.motif : null,
      origine,
    });
    return sortie;
  };
  const manuelle = (motif: MotifDeSaisieManuelle) => rendre({ mode: 'saisie_manuelle', motif });

  const lu = schemaEntreeAutocompletion.safeParse(entree);
  if (!lu.success) return rendre({ mode: 'requete_invalide' });
  const { q, ville } = lu.data;

  if (appelant.adresse === null) return manuelle('adresse_illisible');
  const maintenant = deps.horloge.maintenant();
  const parIdentite = await deps.limiteur.identite(appelant.identite, maintenant);
  if (!parIdentite.autorise) return manuelle(motifDeRefus(parIdentite, 'limite_atteinte'));
  const parAdresse = await deps.limiteur.adresse(appelant.adresse, maintenant);
  if (!parAdresse.autorise) return manuelle(motifDeRefus(parAdresse, 'limite_atteinte'));

  const cle = cleDeRecherche(q);
  let projection = await lireLeCache(deps, cle, relireProjection);
  if (projection !== null) {
    origine = 'cache';
  } else {
    const issue = await appelerLeTiers(q, deps);
    if (!issue.ok) return manuelle(issue.motif);
    origine = 'tiers';
    projection = issue.projection;
    try {
      await deps.cache.ecrire(cle, projection, PARAMETRES.cacheSecondes.valeur);
    } catch {
      // Une panne d'écriture n'empêche pas de répondre.
    }
  }
  return rendre({
    mode: 'autocompletion',
    suggestions: classerSuggestions(q, ville ?? null, projection.suggestions),
  });
}

export type IssueDeFiche =
  | { readonly ok: true; readonly fiche: FicheEntreprise }
  | {
      readonly ok: false;
      readonly motif: MotifDeSaisieManuelle | 'siren_inconnu';
      readonly marque: typeof MARQUE_ENTREPRISE_A_VERIFIER;
    };

/**
 * La fiche d'un SIREN choisi, pour le dépôt : du cache si la recherche l'a déjà ramenée, sinon du
 * tiers (sous le disjoncteur et le débit global). Tout échec rend la marque `entreprise_a_verifier`
 * — le dépôt continue, et la qualification reprendra l'enrichissement.
 */
export async function ficheEntreprise(
  siren: string,
  deps: DependancesDuMandataire
): Promise<IssueDeFiche> {
  const echec = (motif: MotifDeSaisieManuelle | 'siren_inconnu'): IssueDeFiche => ({
    ok: false,
    motif,
    marque: MARQUE_ENTREPRISE_A_VERIFIER,
  });
  const journal = (origine: LigneDeJournal['origine'], motif: MotifDeSaisieManuelle | null) =>
    deps.journaliser({
      signal: 'recherche_entreprises',
      geste: 'fiche',
      issue: 'fiche',
      motif,
      origine,
    });
  if (!/^\d{9}$/.test(siren)) return echec('siren_inconnu');
  const enCache = await lireLeCache(deps, cleDeFiche(siren), relireFiche);
  if (enCache !== null) {
    journal('cache', null);
    return { ok: true, fiche: enCache };
  }
  const issue = await appelerLeTiers(siren, deps);
  if (!issue.ok) {
    journal('aucune', issue.motif);
    return echec(issue.motif);
  }
  journal('tiers', null);
  const fiche = issue.projection.fiches.find((f) => f.siren === siren);
  return fiche === undefined ? echec('siren_inconnu') : { ok: true, fiche };
}

/** Ce que la console affichera : l'état du disjoncteur, à l'instant de l'horloge. */
export function etatDuDisjoncteur(
  deps: Pick<DependancesDuMandataire, 'disjoncteur' | 'horloge'>
): VueDuDisjoncteur {
  return deps.disjoncteur.vue(deps.horloge.maintenant());
}
