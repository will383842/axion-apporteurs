# API recherche-entreprises — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation de l'API n'a été lue à cette date**. Ce qui n'est pas établi porte une formule
> d'attente et le nom de qui doit la lever, sur la même ligne.

## 1. Ce que ce tiers fait pour nous

L'API publique de recherche d'entreprises de l'État renseigne l'entreprise au moment du dépôt : elle est la
source des champs structurés stockés sur l'attribution — raison sociale, numéro d'établissement du siège,
code postal, commune, département, région, code d'activité, tranche d'effectif, nature juridique, état
administratif (REQ-DM-030, REQ-INT-021). Aucune adresse n'est stockée en texte libre seul.

Elle est appelée **exclusivement par un proxy serveur** : le navigateur ne la joint jamais (REQ-SEC-013).

Ce qu'elle ne fait pas, et qu'aucune source ne fait : établir un lien capitalistique entre deux numéros
d'identification. Le rattachement d'une commande passée par une société liée n'est jamais automatique ; il
est décidé, motivé et tracé (REQ-DM-034).

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-19 |
| --- | --- |
| URL officielle | https://recherche-entreprises.api.gouv.fr/openapi.json — la documentation interactive publiée par le service (lue par `INT-T09`) |
| Date de lecture | 2026-09-19, par `INT-T09` |
| Extrait cité | « L'API accepte **au maximum 7 requêtes par seconde** par adresse IP. Une limite de 30 requêtes par seconde par ASN est aussi en place. » — « Lorsque la limite est dépassée, le serveur renvoie une réponse **HTTP 429 – Too Many Requests**. L'en-tête **`Retry-After`** indique le délai à respecter avant d'effectuer une nouvelle requête. » — « Il est recommandé d'inclure un en-tête **`User-Agent`** explicite et descriptif dans toutes les requêtes. » — `statut_diffusion` : « Toutes les unités légales diffusibles ont le statut de diffusion à "O". Les unités légales ayant fait l'objet d'une demande d'opposition ont le statut de diffusion à "P" pour diffusion partielle » — `per_page` : « limité à 25 » |
| Exemple officiel | **à relever** — la documentation ne publie qu'un exemple par champ, pas de réponse complète ; le lecteur désigné par `A01` dit si l'on s'en contente |

⚠️ **Cette rubrique est incomplète.** Lu et cité le 2026-09-19 : la limite de débit, la politique de
`Retry-After`, la sémantique de `statut_diffusion`, le contenu de `dirigeants` (personne physique : `nom`,
`prenoms`, `annee_de_naissance`, `date_de_naissance`, `qualite`, `nationalite` ; personne morale : `siren`,
`denomination`, `qualite`). La documentation ne dit rien de la sémantique de `etat_administratif` au niveau de
l'unité légale — les réponses réelles enregistrées portent `A` et `C`. Tant qu'aucune réponse d'exemple
complète n'est publiée, les fixtures de REQ-QA-028 sont enregistrées depuis l'API réelle mais **non
confrontées** à une réponse publiée.

## 3. Données qui lui sont confiées

Ce que nous **envoyons** : le texte saisi par l'apporteur — raison sociale ou numéro d'identification de
l'entreprise qu'il s'apprête à déposer. Aucune donnée de l'apporteur ni du tiers rencontré n'accompagne la
requête ; l'appel passe par notre serveur, l'adresse réseau de l'apporteur n'est donc pas exposée.

Ce que nous **recevons et conservons** : les champs structurés de REQ-INT-021. Des dirigeants, seulement une
empreinte normalisée du nom et la qualité ; **jamais** l'année de naissance. Le tableau des dirigeants n'est
jamais renvoyé au navigateur (REQ-SEC-013), et `statut_diffusion` est respecté à l'affichage
(REQ-INT-021).

## 4. Quotas et limites

Ce que **nous** appliquons, et qui n'est pas ce que le tiers autorise :

| Limite | Valeur | Exigence |
| --- | --- | --- |
| Débit global sortant | 5 requêtes par seconde | REQ-INT-020, REQ-QA-028 |
| Anti-rebond de l'autocomplétion | 300 ms | REQ-INT-020 |
| Cache | 24 h | REQ-INT-020, REQ-SEC-013 |
| Plafond par identité d'apporteur | 120 par 24 h (compteur `depot:entreprise-identite` du registre SEC-10) | REQ-SEC-013 |
| Plafond par empreinte d'adresse réseau | non chiffré par l'exigence : le compteur `depot:entreprise-ip` attend sa configuration | REQ-SEC-013 |
| Paramètres d'appel | `minimal=true&include=siege,dirigeants` | REQ-INT-020 |
| Coupe-circuit | ouvert aussitôt sur un 429 jusqu'à l'échéance de `Retry-After` ; ouvert après 3 échecs consécutifs (délai, 5xx, réponse illisible) pour 30 s ; un seul essai à l'échéance — seuils choisis par `INT-T09`, qu'aucune exigence ne chiffre | REQ-QA-028 |
| Délai d'attente d'un appel | 1,5 s — choisi par `INT-T09`, qu'aucune exigence ne chiffre | REQ-INT-020 |
| `Retry-After` | respecté | REQ-INT-020 |

Le quota annoncé par le tiers, lu le 2026-09-19 (rubrique 2) : 7 requêtes par seconde par adresse IP, 30 par
ASN, et 3 caractères au moins par saisie (réponse d'erreur du service). Notre limite de 5 par seconde est en
dessous. S'il baisse, c'est la nôtre qui change — et le contrat nocturne le dira avant les utilisateurs.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Refus de service, dépassement de délai, ou erreur serveur | Le dépôt bascule en **saisie manuelle** du numéro d'identification, contrôlé par la clé de Luhn, et la fiche est marquée `entreprise_a_verifier`. **Le dépôt n'est jamais bloqué** (REQ-INT-020) : l'horodatage au nom de l'apporteur est ce qui compte, et il ne dépend pas d'un tiers |
| Réponse partielle ou champ manquant | Le schéma Zod refuse la réponse plutôt que de compléter : une fonction qui « complète » vérifie, elle ne fabrique pas (RM-03). La fiche part en `entreprise_a_verifier` |
| Indisponibilité longue | Les dépôts continuent en saisie manuelle ; la qualification reprend l'enrichissement au retour. C'est le seul tiers dont la panne est traversée à chaud par un apporteur : c'est pourquoi le repli est dans le chemin nominal, et non dans un runbook |
| Le contrat de l'API change | Le test de contrat nocturne, exécuté contre l'API réelle, est bloquant et alerte (REQ-QA-028) ; il est le seul à voir une évolution que personne ne nous annonce |

## 6. Point de contact

- Interne : le poste `A01` pour la surveillance du test de contrat nocturne ; Will pour toute démarche
  auprès de l'administration.
- Externe : l'API est publique et gratuite ; le canal de remontée de l'éditeur public
  est **à relever** par le lecteur désigné par `A01`, à la première lecture.

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat | aucun : API publique, sans souscription connue. **Aucun engagement de disponibilité n'est présumé** — c'est précisément pourquoi le repli de REQ-INT-020 existe. Conditions d'utilisation **à relever** par le lecteur désigné par `A01` |
| Sous-traitance (art. 28 RGPD) | sans objet en l'état : nous consommons des données publiques, nous ne lui confions pas de données personnelles pour traitement. Qualification **à confirmer** par Will si la requête venait à porter une donnée du déposant |
| Localisation des données | service de l'administration française ; localisation exacte **à confirmer** par Will, avant l'ouverture des dépôts |
| Données de dirigeants | le produit ne conserve qu'une empreinte et une qualité, et respecte `statut_diffusion` : c'est une contrainte du produit, pas une tolérance du tiers |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Conditions d'utilisation (la limite de débit est lue, rubrique 2) | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant l'ouverture des dépôts |
| Réponse d'exemple officielle collée dans la rubrique 2 | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant l'écriture des fixtures de REQ-QA-028 |
| Sémantique exacte de `etat_administratif` (celle de `statut_diffusion` est lue, rubrique 2) | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant le contrôle de validité du numéro d'identification de REQ-ARG-016 |
| Localisation exacte du service | Will | ouverture des dépôts |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier — c'est elle qui exige que le producteur réel soit nommé (RM-03).

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/recherche-entreprises.md#2-source-officielle
```

Les fixtures de REQ-QA-028 sont **enregistrées et datées** depuis l'API réelle, jamais tapées à la main
(RM-03) : la première ligne nomme cet enregistrement. La seconde porte la mention `non confrontée` tant que
la rubrique 2 est vide.
