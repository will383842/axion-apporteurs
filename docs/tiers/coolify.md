# Coolify et l'hébergement — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation Coolify n'a été lue à cette date**. Ce qui n'est pas établi porte une formule
> d'attente et le nom de qui doit la lever, sur la même ligne.

> **Deux tiers, pas un.** Coolify est le logiciel d'orchestration ; il tourne sur un serveur qui appartient
> à quelqu'un. C'est l'**hébergeur du serveur** qui détient les données et détermine la localisation, et il
> n'est **pas nommé à ce jour**. Confondre les deux ferait écrire une conformité qui n'existe pas.

## 1. Ce que ce tiers fait pour nous

Coolify déploie et sert l'application. Il **tire** l'image depuis le registre et ne construit rien : la
construction a lieu en intégration continue (REQ-QA-018). Son test de santé pointe sur la sonde de
disponibilité, qui répond en échec tant que la base, le cache, la validation des variables d'environnement
ou les migrations en attente ne sont pas au vert (REQ-QA-020).

L'hypothèse `HYP-E1-5` retient un serveur **dédié** au produit, des environnements de prévisualisation
limités à deux simultanés avec une durée de vie de quarante-huit heures, et des objectifs de perte de
données et de reprise d'une heure. Le coût est soumis à Will.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | adresse exacte de la documentation de l'orchestrateur **à relever**, non ouverte à ce jour — `A01` répartit la lecture |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — configuration d'exemple copiée telle quelle par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : la façon
dont les variables d'environnement sont posées et lues, la sémantique exacte du test de santé, le
comportement au démarrage d'un container qui échoue, et la procédure de retour à une image antérieure. Les
trois dernières commandent des exigences de vérification, elles ne peuvent pas être déduites de notre
spécification.

## 3. Données qui lui sont confiées

Toutes. C'est le tiers le plus exposé du dossier : le serveur porte la base de production, donc les données
chiffrées des apporteurs et des tiers rencontrés, les journaux applicatifs, et les secrets posés en variables
d'environnement — sept secrets distincts plus le sel de hachage des adresses réseau (`HYP-E1-24`).

Les secrets ne transitent jamais en clair dans une conversation ni dans le dépôt : ils sont posés depuis les
secrets du dépôt, par un workflow dédié, vers l'orchestrateur (REQ-INT-031).

## 4. Quotas et limites

Ce que **nous** appliquons : deux environnements de prévisualisation simultanés au plus, durée de vie de
quarante-huit heures ; le test de santé pointe sur la sonde de disponibilité ; les migrations sont exécutées
au démarrage en mode bloquant, un échec sortant en erreur en moins d'une minute (REQ-QA-019).

Les limites du serveur — processeur, mémoire, stockage, bande passante — dépendent de l'hébergeur et sont
**à confirmer** par Will avec le choix de l'offre.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Le déploiement échoue au démarrage | L'entrée en service échoue en erreur et **l'ancien container reste servi** (REQ-QA-019). L'utilisateur ne voit rien |
| La sonde de disponibilité répond en échec | Aucun retour arrière automatique : c'est la règle, pas un manque (`HYP-E1-26`). Le retour arrière est déclenché à la main par le runbook, et vérifié sur l'en-tête de version servie (REQ-QA-022) |
| Coolify lui-même est indisponible | L'application continue de servir : l'orchestrateur n'est pas dans le chemin de la requête. Ce qui s'arrête est la capacité à déployer |
| Le serveur tombe | Le produit est arrêté. La reprise s'appuie sur la sauvegarde horaire de `cloudflare-r2.md`, pour un objectif de reprise d'une heure — **objectif jamais mesuré à ce jour**, seul l'exercice mensuel de REQ-QA-023 pourra le dire |

## 6. Point de contact

- Interne : Will, détenteur du serveur et des accès ; le poste `A01` pour la vérification d'atterrissage
  d'un déploiement.
- Externe : support de l'hébergeur, **à nommer** par Will une fois l'offre choisie ; l'orchestrateur étant
  un logiciel libre, son support n'est pas contractuel sauf souscription, **à confirmer** par Will avant la
  mise en production.

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat | offre d'hébergement **à confirmer** par Will (coût soumis à Will, `HYP-E1-5`). L'orchestrateur est un logiciel installé : sans souscription, il n'y a pas de contrat avec son éditeur |
| Sous-traitance (art. 28 RGPD) | L'hébergeur du serveur est sous-traitant : il détient la base de production. Contrat de sous-traitance **à confirmer** par Will, et il ne pourra l'être qu'une fois l'hébergeur nommé |
| Localisation des données | **à confirmer** par Will — c'est la question qui décide de tout le reste sur cette ligne |
| Secrets | posés par workflow, jamais en clair (REQ-INT-031) ; rotation avec double clé acceptée pendant vingt-quatre heures, déclenchée par Will (`HYP-E1-24`) |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Hébergeur du serveur, offre et localisation | Will | premier déploiement de production |
| Contrat de sous-traitance avec l'hébergeur | Will | première donnée réelle en base |
| Sémantique exacte du test de santé et de la reprise après échec, extraits cités | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant la preuve rouge de REQ-QA-020 |
| Souscription à un support de l'orchestrateur, ou non | Will | mise en production |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/coolify.md#2-source-officielle
```

Toute fixture de configuration de déploiement ou de réponse de sonde porte ces deux lignes. Tant que la
rubrique 2 est vide, la seconde ligne porte la mention `non confrontée`.
