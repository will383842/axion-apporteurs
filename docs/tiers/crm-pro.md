# CRM Pro — fiche tiers

> Livrée par **INT-T28** (REQ-SEC-041, REQ-SEC-042, REQ-JUR-044, REQ-INT-031). Rédigée le 2026-10-09.
> Le CRM Pro n'est pas un fournisseur : c'est le système de la Société où travaillent les conseillers
> salariés (décision W19, question 22). Il est fiché ici parce qu'il **appelle** Partners avec un jeton
> de service, et que ce qui lui est confié, ce qu'il peut faire et ce qui se passe s'il tombe doivent se
> lire au même endroit que pour les autres systèmes extérieurs. Le contrat qui le relie à Partners est
> partners/ADR-0033.

## 1. Ce que ce tiers fait pour nous

Le CRM Pro est l'outil quotidien des conseillers salariés (dépôt séparé `will383842/axion-crm-pro`). Il
**demande** à Partners, par l'API 3, de prendre en charge une entreprise au nom d'un conseiller, de
vérifier si une entreprise est libre, et de lister les prises en charge de ce conseiller avec leurs avis
d'échéance. Il **affiche** ce que Partners répond.

Il ne décide rien : Partners garde le registre d'antériorité unique et applique toutes les bornes
(HYP-W19-SOURCE). Une prise en charge n'existe que si Partners l'a enregistrée ; aucun statut du CRM Pro
ni aucun devis n'occupe une entreprise.

## 2. Source officielle

Le CRM Pro n'a pas de documentation propre qui s'imposerait à Partners : c'est **Partners** qui fixe le
contrat, et le CRM Pro qui s'y conforme. La source qui fait foi est donc l'ADR du contrat.

| Élément exigé par REQ-GOV-022 | État au 2026-10-09 |
| --- | --- |
| URL officielle | `docs/adr/0033-le-contrat-de-l-api-3-entre-partners-et-le-crm-pro.md`, partners/ADR-0033 |
| Date de lecture | 2026-10-09, date de rédaction de l'ADR au statut `propose` |
| Extrait cité | « Seule une prise en charge enregistrée par Partners occupe un SIREN ; rien n'est déduit d'un statut du CRM Pro ni d'un devis » (décision 8) |
| Exemple officiel | **à relever** par A01 : la première réponse servie par la route de SEC-34, collée telle quelle, une fois le contrat validé par Will |

## 3. Données qui lui sont confiées

Par réponse de l'API 3, et pour le SEUL conseiller désigné : le SIREN demandé, l'issue de la demande
(`acceptee` ou `non_disponible`), l'état d'une vérification (`libre`, `a_vous` ou `non_disponible`), le
mois de fin d'une prise en charge du conseiller et son avis d'échéance.

Ne lui sont jamais confiés : l'identité, le rôle ou la population d'un autre occupant, une donnée
d'apporteur, le mois ou la cause derrière `non_disponible` (HYP-W19-VISIBILITE).

Ce que Partners reçoit de lui : le SIREN, la référence opaque du conseiller (rattachée par DM-32) et une
clé d'idempotence. Aucune autre donnée du CRM Pro n'est copiée dans Partners.

## 4. Quotas et limites

Ce que **nous** appliquons à l'appelant, valeurs en `SSOT` et chiffrées par SEC-34 et DM-30 :

- un débit par jeton et par conseiller, conduite sur panne `refuser` ;
- une limite de prises en charge par conseiller, et une limite de la Société FIXE, égale à celle d'un
  seul apporteur quel que soit le nombre de conseillers actifs (HYP-W19-LIMITES) ;
- une alerte de volume agrégée sur le jeton et sur la Société, active sans condition ; une alerte
  d'anomalie par conseiller une fois la condition HYP-W19-CSE remplie.

Ce que le CRM Pro accepte de nous : il n'a pas de limite propre qui contraindrait Partners.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Le CRM Pro est indisponible | Sans effet sur Partners ni sur les apporteurs. Les prises en charge déjà enregistrées courent ; l'admin peut prendre en charge par la console |
| Partners est indisponible pour le CRM Pro | Le CRM Pro l'affiche et n'enregistre rien, pas même un brouillon (partners/ADR-0033, décision 8) |
| Le CRM Pro ou son jeton est compromis | Il peut agir au nom de tout conseiller actif (HYP-W19-IDENTITE-CRM). Bornes : limite fixe de la Société, alerte de volume, journal de chaque appel, révocation du jeton |

## 6. Point de contact

- Interne : la session « organisation du CRM Pro », sur le ticket #220, pour le contrat ; Will pour
  l'émission, la rotation et la révocation du jeton.
- Externe : aucun, le CRM Pro est un système de la Société.

## 7. Conformité

| Objet | État au 2026-10-09 |
| --- | --- |
| Contrat / abonnement | Sans objet : système de la Société |
| Sous-traitance (art. 28 RGPD) | Sans objet : même responsable de traitement. Le CRM Pro est inscrit comme système qui traite les données des conseillers au registre de l'article 30 par JUR-T32 |
| Localisation des données | **à confirmer** par Will, avant l'émission du jeton |
| Secret du jeton | Posé par les secrets GitHub, le workflow `coolify-poser-variable.yml`, puis Coolify ; jamais dans le dépôt ni une conversation (REQ-INT-031) |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Validation du contrat de l'API 3 | Will | toute ligne de code du CRM Pro |
| Adresse de sortie fixe du CRM Pro, pour une liste d'adresses autorisées | Will | l'émission du jeton |
| Localisation des données du CRM Pro | Will | l'émission du jeton |
| Exemple officiel collé en rubrique 2 | A01 | la recette de SEC-34 |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/crm-pro.md#2-source-officielle
```

Tant que la rubrique 2 n'a pas son exemple officiel, une fixture de l'API 3 porte la mention
`non confrontée` et cite partners/ADR-0033 comme contrat.
