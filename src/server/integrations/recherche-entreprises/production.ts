/**
 * Le câblage de production du mandataire — INT-T09.
 *
 * C'est ici, et seulement ici, que les dépendances réelles se rencontrent : `fetch`, le cache
 * Redis, les compteurs du registre, le disjoncteur DU PROCESSUS, l'horloge système, la clé des
 * empreintes. Les tests n'importent pas ce fichier : ils assemblent leurs propres dépendances.
 *
 * LES SUJETS DES COMPTEURS SONT DES EMPREINTES. L'identité de l'apporteur est empreinte sous la
 * clé des personnes, l'adresse réseau sous le sel des adresses : deux usages, deux clés (SEC-01).
 * L'empreinte d'adresse est CELLE de la frontière d'axionia (`empreinteAdresse`, 16 hex) : une
 * adresse a une seule empreinte dans tout le dépôt, et le rapprochement de REQ-SEC-017 la relie.
 * Ces deux clés sont reçues par leur TYPE — `CleDesPersonnes`, `ClesDEmpreinte`, déclarés dans
 * `src/lib/env.ts` —, jamais par leurs noms retapés : la liste des secrets vit là et nulle part
 * ailleurs (REQ-SEC-028, RM-01), et chaque fonction ne reçoit que la clé dont elle se sert. Aucune
 * valeur en clair n'entre dans une clé du cache. L'adresse est lue depuis la DROITE de
 * `X-Forwarded-For` par `adresseDuClient` (SEC-10) ; illisible, elle vaut `null`, et le mandataire
 * refuse l'autocomplétion — la saisie manuelle reste offerte.
 */
import { horlogeSysteme } from '../../../lib/horloge';
import { creerJournal, type Journal } from '../../../lib/logger';
import { empreinteAdresse } from '../axionia/api-entrante';
import type { CleDesPersonnes, ClesDEmpreinte } from '../../../lib/env';
import { adresseDuClient, SAUTS_DE_CONFIANCE } from '../../securite/adresse-du-client';
import { sujetDepuisEmpreinte } from '../../securite/rate-limit';
import { cacheRedis } from './cache';
import { creerDisjoncteur, type VueDuDisjoncteur } from './disjoncteur';
import { limiteurDuRegistre } from './limiteur';
import type { Appelant, DependancesDuMandataire, LigneDeJournal } from './autocompletion';
import { PARAMETRES } from './parametres';
import { empreinteEtiquetee, empreinteurDeDirigeants } from './projection';
import { clientDuTiers } from './tiers';

/** UN disjoncteur par processus : son état est ce que la console lit. */
const disjoncteurDuProcessus = creerDisjoncteur();

/** Ce que la console affiche (REQ-INT-020 : « l'état ouvert est visible en console »). */
export function vueDuDisjoncteurDuProcessus(): VueDuDisjoncteur {
  return disjoncteurDuProcessus.vue(horlogeSysteme.maintenant());
}

let journal: Journal | null = null;

/** Le journal applicatif caviardant (QA-T08), créé au premier appel, jamais à l'import. */
function journaliser(ligne: LigneDeJournal): void {
  journal ??= creerJournal();
  journal.info(ligne.signal, { ...ligne });
}

export function dependancesDeProduction(secrets: CleDesPersonnes): DependancesDuMandataire {
  return {
    horloge: horlogeSysteme,
    tiers: clientDuTiers({
      fetch,
      urlDeBase: PARAMETRES.urlDeBase.valeur,
      delaiMs: PARAMETRES.delaiAttenteMs.valeur,
    }),
    cache: cacheRedis,
    limiteur: limiteurDuRegistre,
    disjoncteur: disjoncteurDuProcessus,
    empreindre: empreinteurDeDirigeants(secrets.PII_HASH_KEY),
    journaliser,
  };
}

/** Les sujets des compteurs pour un appel : l'identité de l'apporteur et l'en-tête de la requête. */
export function appelantDepuis(
  identifiantApporteur: string,
  entetes: Headers,
  secrets: ClesDEmpreinte
): Appelant {
  const adresse = adresseDuClient(entetes, SAUTS_DE_CONFIANCE);
  return {
    identite: sujetDepuisEmpreinte(
      empreinteEtiquetee(secrets.PII_HASH_KEY, 'partners.apporteur.v1', identifiantApporteur)
    ),
    adresse:
      adresse === null
        ? null
        : sujetDepuisEmpreinte(empreinteAdresse(adresse, secrets.IP_HASH_SALT)),
  };
}
