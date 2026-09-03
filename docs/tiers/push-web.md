# Service de notifications push (PWA) — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation n'a été lue à cette date**, et **le service n'est pas nommé**. Ce qui n'est pas
> établi porte une formule d'attente et le nom de qui doit la lever, sur la même ligne.

> ⚠️ **Ce tiers existe déjà dans le dossier, même si personne ne l'a encore choisi.** `HYP-D12` retient
> « e-mail et push PWA en V1 », REQ-UX-014 impose des notifications opt-in qui ouvrent la route profonde de
> l'événement, REQ-SEC-033 encadre leur contenu au même titre que celui du canal d'alerte, et l'acceptation
> de JUR-T04 range le push parmi les sous-traitants hors Union européenne, avec registre de l'article 30 et
> analyse d'impact. Une fiche absente aurait laissé croire qu'aucun tiers ne reçoit ces données.

## 1. Ce que ce tiers fait pour nous

L'espace est une application installable ; le navigateur ou le système de l'apporteur enregistre un
abonnement auprès du service de notification de son éditeur, et c'est ce service — non Partners — qui remet
la notification à l'appareil. Le produit ne fait que lui remettre un message adressé à un point de
terminaison d'abonnement.

Ce qui dépend de ce tiers : REQ-UX-014 (notifications opt-in explicite, jamais demandées à la première
visite, chaque notification ouvrant la route profonde de l'événement) et REQ-SEC-033 (contenu sans
coordonnées de tiers et sans montant). Le canal de la version ultérieure est traité dans `telegram.md`
(REQ-INT-025).

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | service non choisi : la documentation du protocole de push web et celle du service de l'éditeur sont **à confirmer** par Will, qui nomme d'abord le service |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture, une fois le service nommé |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — charge utile d'exemple copiée telle quelle par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : la forme
d'un abonnement, la taille maximale et le chiffrement de la charge utile, la durée de vie d'un message, la
signification d'un abonnement expiré, et la limite de débit.

## 3. Données qui lui sont confiées

- Le **point de terminaison d'abonnement** et ses clés publiques, produits par le navigateur ou le système
  de l'apporteur. C'est un identifiant d'appareil : il désigne une personne sans la nommer.
- Le **contenu de l'événement**, strictement limité par REQ-SEC-033 : ni coordonnées du tiers rencontré, ni
  montant. La notification annonce qu'il s'est passé quelque chose et ouvre la route ; elle ne transporte
  pas ce qui s'est passé.

Ne lui sont **jamais** confiées : l'identité de l'apporteur, les données du dépôt, les montants, les pièces
du dossier de conformité.

## 4. Quotas et limites

Ce que **nous** appliquons : l'abonnement n'est demandé qu'après un geste explicite de l'apporteur, jamais à
la première visite (REQ-UX-014) ; le contenu est réduit à l'événement (REQ-SEC-033) ; un abonnement expiré
est retiré au premier refus du service.

Les limites du service — taille de la charge utile, débit, durée de rétention d'un message non remis — sont
**à confirmer** par le lecteur désigné par `A01`, une fois le service nommé.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Le service ne remet pas la notification | **Aucun droit n'est suspendu.** L'espace reste la source : l'apporteur y voit l'événement, la notification n'est qu'un raccourci. Rien ne dépend de sa remise |
| L'apporteur refuse ou retire son consentement | Le produit n'insiste pas et n'ouvre aucun autre canal à sa place ; l'e-mail reste le support des informations dues |
| L'abonnement expire | Il est retiré ; l'apporteur peut en créer un nouveau depuis l'espace |
| Le service est indisponible longtemps | Sans effet mesurable : la file de notifications s'épuise et rien ne s'accumule côté produit |

## 6. Point de contact

- Interne : Will, propriétaire du compte du service une fois celui-ci choisi ; le poste `A01` pour la
  surveillance des refus d'abonnement.
- Externe : canal de support de l'éditeur, **à nommer** par Will une fois le service choisi — jamais une
  coordonnée nominative, le dépôt est public (W13).

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat | service non choisi ; existence d'un contrat **à confirmer** par Will, avant la première notification |
| Sous-traitance (art. 28 RGPD) | Qualifié sous-traitant hors Union européenne par l'acceptation de JUR-T04, qui l'inscrit au registre de l'article 30 et à l'analyse d'impact. Contrat de l'article 28 et encadrement du transfert : **à confirmer** par Will, avant la première notification |
| Localisation des données | hors Union européenne selon l'acceptation de JUR-T04 ; pays exact **à confirmer** par Will, avant la première notification |
| Contenu transmis | limité à l'événement par REQ-SEC-033 ; c'est une contrainte du produit, testable, et non une tolérance du tiers |
| Base légale du consentement | opt-in explicite de REQ-UX-014, journalisé ; retrait aussi simple que le don |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Service de push retenu, et son éditeur | Will | première notification |
| Contrat de l'article 28, transfert hors Union européenne et pays d'hébergement | Will | première notification |
| Canal de support de l'éditeur | Will | première notification |
| Taille de charge utile, débit, rétention d'un message non remis, extraits cités | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant la fixture de charge utile |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/push-web.md#2-source-officielle
```

Toute fixture de charge utile de notification porte ces deux lignes. Tant que la rubrique 2 est vide, la
seconde porte la mention `non confrontée` — et, le service n'étant pas nommé, aucune fixture n'est écrite à
ce jour.
