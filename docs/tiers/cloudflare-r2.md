# Cloudflare R2 — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation Cloudflare n'a été lue à cette date**. Ce qui n'est pas établi porte une formule
> d'attente et le nom de qui doit la lever, sur la même ligne.

## 1. Ce que ce tiers fait pour nous

Le stockage objet Cloudflare R2 reçoit les sauvegardes de la base : une par heure, sous le préfixe
`partners/` (REQ-QA-023, `HYP-E1-5`). Un exercice de restauration mensuel reprend le dernier dépôt sur une
base éphémère, vérifie que les attributions sont présentes et que l'état des migrations est propre, et
alerte en cas d'échec.

C'est le seul tiers du dossier dont la défaillance **ne se voit pas au moment où elle se produit** : une
sauvegarde qui n'est pas déposée ne dérange personne jusqu'au jour où on la cherche. L'exercice mensuel
existe pour cela, et il n'a de valeur que s'il a échoué au moins une fois pour de bon.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | adresse exacte de la documentation du stockage objet **à relever**, non ouverte à ce jour — `A01` répartit la lecture |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — exemple de nommage d'objet copié tel quel par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : la forme des
identifiants d'accès et leur portée, les règles de nommage des objets et des préfixes, la politique de
conservation et de versionnage, et le comportement en cas d'écriture concurrente sur la même clé.

## 3. Données qui lui sont confiées

Un **dépôt complet de la base de production**, donc l'intégralité des données : identités d'apporteurs,
coordonnées chiffrées des tiers rencontrés, montants, journal chaîné. Le chiffrement applicatif des données
sensibles voyage avec le dépôt ; le chiffrement du dépôt lui-même au repos et en transit
est **à confirmer** par le lecteur désigné par `A01`, à la lecture.

Une conséquence à ne pas perdre de vue : la purge des coordonnées d'un tiers (REQ-SEC-030) s'applique à la
base vivante ; les sauvegardes antérieures les contiennent encore jusqu'à leur expiration. La durée de
conservation des sauvegardes est donc un paramètre de conformité, **à confirmer** par Will.

## 4. Quotas et limites

Ce que **nous** appliquons : un dépôt par heure, un préfixe dédié, un exercice de restauration mensuel.

Les limites du service — volume, nombre d'opérations, taille d'objet, coût du stockage et de la sortie — sont
**à confirmer** par Will avec le choix de l'offre. La taille du dépôt croît avec le réseau : la trajectoire
est à surveiller, pas à supposer.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Un dépôt horaire échoue | L'application n'est pas affectée. Le point de reprise s'éloigne d'une heure à chaque dépôt manqué : l'objectif d'une heure n'est plus tenu, en silence |
| Le service est indisponible longtemps | Aucune sauvegarde n'existe pour la période. C'est le mode de panne le plus coûteux du dossier, et le moins visible |
| L'exercice mensuel échoue | Une alerte part par le canal de `telegram.md`. **C'est le seul témoin**, et il dépend d'un tiers qui n'a pas de repli écrit : voir le point ouvert de `telegram.md` |
| Les identifiants d'accès sont perdus ou tournés | Les dépôts échouent ; la rotation suit la procédure de `HYP-E1-24` avec double clé acceptée pendant vingt-quatre heures |

## 6. Point de contact

- Interne : Will, détenteur du compte ; le poste `A01` pour l'exercice mensuel de restauration.
- Externe : canal de support du fournisseur selon l'offre souscrite, **à confirmer** par Will avant
  l'armement de la sauvegarde horaire (REQ-QA-023).

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat / offre souscrite | **à confirmer** par Will |
| Sous-traitance (art. 28 RGPD) | Le fournisseur héberge pour notre compte une copie complète de la base : contrat de sous-traitance nécessaire. Existence et date **à confirmer** par Will |
| Localisation des données | **à confirmer** par Will — la région du conteneur de stockage doit être choisie explicitement et écrite ici, pas héritée d'un défaut |
| Durée de conservation des sauvegardes | **à confirmer** par Will, et à confronter aux durées de `retention.ts` (REQ-SEC-030) |
| Chiffrement au repos du dépôt | **à confirmer** par le lecteur désigné par `A01`, extrait cité à l'appui |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Région du conteneur de stockage | Will | première sauvegarde de production |
| Contrat de sous-traitance signé | Will | première sauvegarde de production |
| Durée de conservation des sauvegardes, confrontée aux durées de purge | Will | armement du cron de sauvegarde |
| Canal de support du fournisseur | Will | armement de la sauvegarde horaire |
| Chiffrement au repos et en transit, extrait cité | `A01` répartit ; le lecteur date sa lecture dans la fiche | premier exercice de restauration |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/cloudflare-r2.md#2-source-officielle
```

Toute fixture de nommage d'objet ou de configuration d'accès porte ces deux lignes. Tant que la rubrique 2
est vide, la seconde ligne porte la mention `non confrontée`.
