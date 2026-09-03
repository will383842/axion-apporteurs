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

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | adresse exacte de la documentation publique **à relever**, non ouverte à ce jour — `A01` répartit la lecture |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — réponse d'exemple complète copiée telle quelle par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : la limite de
débit annoncée, la sémantique de `etat_administratif`, celle de `statut_diffusion`, le contenu exact de
`dirigeants`, et la politique de l'en-tête `Retry-After`. Une réponse d'exemple complète doit être collée
ici : c'est elle, et non notre schéma, qui fait foi. Tant qu'elle manque, les fixtures de REQ-QA-028 sont
enregistrées depuis l'API réelle mais **non confrontées** à une réponse publiée.

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
| Plafond par identité d'apporteur et par empreinte d'adresse réseau | valeur portée par la configuration, jamais par un fichier versionné | REQ-SEC-013 |
| Paramètres d'appel | `minimal=true&include=siege,dirigeants` | REQ-INT-020 |
| Coupe-circuit | armé sur échecs répétés | REQ-QA-028 |
| `Retry-After` | respecté | REQ-INT-020 |

Le quota réellement annoncé par le tiers est **à confirmer** par le lecteur désigné par `A01`, avant
l'ouverture des dépôts. S'il se révèle inférieur à notre limite, c'est la nôtre qui change — et le test de
contrat le dira avant les utilisateurs.

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
| Limite de débit annoncée, et conditions d'utilisation | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant l'ouverture des dépôts |
| Réponse d'exemple officielle collée dans la rubrique 2 | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant l'écriture des fixtures de REQ-QA-028 |
| Sémantique exacte de `etat_administratif` et de `statut_diffusion` | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant le contrôle de validité du numéro d'identification de REQ-ARG-016 |
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
