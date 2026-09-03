# Telegram — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation Telegram n'a été lue à cette date**. Ce qui n'est pas établi porte une formule
> d'attente et le nom de qui doit la lever, sur la même ligne.

> ⚠️ **Point ouvert rendu avec cette tâche.** Ce tiers porte l'alerte de l'exercice de restauration
> (REQ-QA-023) et les alertes de console (REQ-INT-024), et **aucun canal de repli n'est écrit dans le
> dossier**. S'il ne répond pas, l'alerte n'est pas remise et rien ne le dit : la panne du canal d'alerte est
> silencieuse par construction. Le choix du repli appartient à Will.

## 1. Ce que ce tiers fait pour nous

Un robot dédié porte les alertes de console de Partners, avec déduplication et plafond horaire par catégorie
(REQ-INT-024). Aucun message ne contient de coordonnées de tiers ni de lien vers la console : le canal est
un avertisseur, jamais un porteur de données.

Il porte aussi l'alerte d'échec de l'exercice mensuel de restauration (REQ-QA-023) — voir
`cloudflare-r2.md`, où cette alerte est le seul témoin d'une sauvegarde qui ne serait plus faite.

Les notifications **aux apporteurs** par ce canal relèvent d'une version ultérieure (`HYP-D12`) et exigent,
le jour venu, une liaison par jeton signé à usage unique et un consentement journalisé, le contenu se
limitant à l'événement (REQ-INT-025).

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | adresse exacte de la documentation de l'interface de robot **à relever**, non ouverte à ce jour — `A01` répartit la lecture |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — charge utile d'exemple copiée telle quelle par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : la limite de
débit d'envoi d'un robot, le comportement en cas de dépassement, la durée de vie d'un message, et la façon
dont une remise échouée est signifiée à l'émetteur — c'est ce dernier point qui décide si la panne peut
cesser d'être silencieuse.

## 3. Données qui lui sont confiées

Le texte de l'alerte, et lui seul : catégorie, horodatage, identifiant technique de l'objet concerné.
**Jamais** de nom, d'adresse, de téléphone, de montant par apporteur, ni de lien vers la console
(REQ-INT-024, REQ-SEC-033). Cette contrainte est testable et doit l'être : un canal d'alerte est le lieu où
les données fuient par confort.

## 4. Quotas et limites

Ce que **nous** appliquons : déduplication des alertes identiques et plafond horaire par catégorie
(REQ-INT-024) — un incident répété ne doit pas noyer le canal, et le plafond fait partie de la garde, pas de
l'optimisation. Sa valeur vit en configuration, pas dans un fichier versionné.

La limite de débit du tiers est **à confirmer** par le lecteur désigné par `A01`, avant le test de plafond
de REQ-INT-024.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Le service ne répond pas | **L'alerte n'est pas remise, et rien ne le dit.** Aucun repli n'est écrit à ce jour. C'est le point ouvert de cette fiche |
| Le plafond horaire est atteint | Les alertes supplémentaires de la catégorie sont retenues : c'est voulu, et cela suppose que la console reste consultable pour voir ce qui a été retenu |
| Le robot est révoqué ou son jeton tourné | Plus aucune alerte ne part. La rotation suit `HYP-E1-24` |

**Repli attendu, à décider par Will** : au minimum, une trace persistante de chaque alerte, lisible dans la
console indépendamment du canal, afin qu'une alerte non remise reste retrouvable ; et, pour l'exercice de
restauration, un second canal indépendant. Tant que cette ligne est ouverte, REQ-QA-023 repose sur un tiers
unique.

## 6. Point de contact

- Interne : Will, détenteur du robot et du jeton ; le poste `A01` pour la surveillance du canal.
- Externe : aucun support contractuel connu, l'interface de robot étant publique — **à confirmer** par Will
  avant l'armement de la sauvegarde horaire (REQ-QA-023).

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat | aucun contrat connu : interface programmable publique de robot — **à confirmer** par Will avant la première alerte de production |
| Sous-traitance (art. 28 RGPD) | Qualifié sous-traitant hors Union européenne par l'acceptation de JUR-T04, qui l'inscrit au registre de l'article 30 et à l'analyse d'impact, sans attendre l'ouverture des notifications aux apporteurs. Les messages ne portent aucune donnée personnelle (REQ-INT-024, REQ-SEC-033 — testable), ce qui limite le traitement sans le supprimer. Contrat de l'article 28 et encadrement du transfert : **à confirmer** par Will, avant la première alerte de production |
| Localisation des données | hors Union européenne selon l'acceptation de JUR-T04 ; pays exact **à confirmer** par Will, avant la première alerte de production |
| Destinataires | les personnes admises dans le fil d'alerte sont des destinataires de fait : la liste est **à confirmer** par Will, et à revoir à chaque départ |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Canal de repli, et trace persistante des alertes en console | Will | armement de la sauvegarde horaire (REQ-QA-023) |
| Contrat de l'article 28, transfert hors Union européenne et pays d'hébergement | Will | première alerte de production |
| Liste des personnes admises dans le fil d'alerte | Will | première alerte de production |
| Canal de support, s'il en existe un | Will | armement de la sauvegarde horaire |
| Limite de débit et signification d'une remise échouée, extraits cités | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant le test de plafond de REQ-INT-024 |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/telegram.md#2-source-officielle
```

Toute fixture de charge utile d'alerte porte ces deux lignes ; tant que la rubrique 2 est vide, la seconde
porte la mention `non confrontée`. La fixture qui prouve l'absence de données personnelles dans un message
est la plus importante des trois familles d'alerte.
