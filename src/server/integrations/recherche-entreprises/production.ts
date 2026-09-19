/**
 * Le câblage de production du mandataire — INT-T09.
 *
 * C'est ici, et seulement ici, que les dépendances réelles se rencontrent : `fetch`, le cache
 * Redis, les compteurs du registre, le disjoncteur DU PROCESSUS, l'horloge système, la clé des
 * empreintes. Les tests n'importent pas ce fichier : ils assemblent leurs propres dépendances.
 *
 * LES SUJETS DES COMPTEURS SONT DES EMPREINTES. L'identité de l'apporteur est empreinte sous
 * `PII_HASH_KEY`, l'adresse réseau sous `IP_HASH_SALT` (SEC-01 : deux usages, deux clés) ; aucune
 * valeur en clair n'entre dans une clé du cache. L'adresse est lue depuis la DROITE de
 * `X-Forwarded-For` par `adresseDuClient` (SEC-10) ; illisible, elle vaut `null`, et le mandataire
 * refuse l'autocomplétion — la saisie manuelle reste offerte.
 */
import { createHmac } from 'node:crypto';
import { horlogeSysteme } from '../../../lib/horloge';
import type { Secrets } from '../../../lib/env';
import { adresseDuClient, SAUTS_DE_CONFIANCE } from '../../securite/adresse-du-client';
import { sujetDepuisEmpreinte } from '../../securite/rate-limit';
import { cacheRedis } from './cache';
import { creerDisjoncteur } from './disjoncteur';
import { limiteurDuRegistre } from './limiteur';
import type { Appelant, DependancesDuMandataire, LigneDeJournal } from './mandataire';
import { PARAMETRES } from './parametres';
import { empreinteurDeDirigeants } from './projection';
import { clientDuTiers } from './tiers';

/** UN disjoncteur par processus : son état est ce que la console lit. */
const disjoncteurDuProcessus = creerDisjoncteur();

/** Le puits de phase 0 : une ligne JSON sur la sortie d'erreur, sans donnée de personne. */
function journaliserSurStderr(ligne: LigneDeJournal): void {
  process.stderr.write(`${JSON.stringify(ligne)}\n`);
}

export function dependancesDeProduction(
  secrets: Pick<Secrets, 'PII_HASH_KEY'>
): DependancesDuMandataire {
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
    journaliser: journaliserSurStderr,
  };
}

function empreinte(cle: string, etiquette: string, valeur: string): string {
  return createHmac('sha256', cle).update(`${etiquette}\u001f${valeur}`, 'utf8').digest('hex');
}

/** Les sujets des compteurs pour un appel : l'identité de l'apporteur et l'en-tête de la requête. */
export function appelantDepuis(
  identifiantApporteur: string,
  entetes: Headers,
  secrets: Pick<Secrets, 'PII_HASH_KEY' | 'IP_HASH_SALT'>
): Appelant {
  const adresse = adresseDuClient(entetes, SAUTS_DE_CONFIANCE);
  return {
    identite: sujetDepuisEmpreinte(
      empreinte(secrets.PII_HASH_KEY, 'partners.apporteur.v1', identifiantApporteur)
    ),
    adresse:
      adresse === null
        ? null
        : sujetDepuisEmpreinte(empreinte(secrets.IP_HASH_SALT, 'partners.adresse.v1', adresse)),
  };
}
