# GitHub — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation GitHub n'a été lue à cette date**. Ce qui n'est pas établi porte une formule
> d'attente et le nom de qui doit la lever, sur la même ligne.

## 1. Ce que ce tiers fait pour nous

GitHub porte quatre choses, et il faut les distinguer parce qu'elles ne tombent pas ensemble :

1. **Le dépôt de code**, `will383842/axion-apporteurs`, **public** (W13). Ce qui y est poussé est
   définitivement lisible, y compris après un passage en privé. La garde `pnpm gov:publication` refuse trois
   catégories de contenu, et cette fiche s'y soumet comme les autres.
2. **La construction de l'image**, en intégration continue, poussée au registre du même fournisseur, marquée
   `latest` et `sha-` suivi des sept premiers caractères de l'empreinte du commit (REQ-QA-018). L'image est
   **privée**, et c'est ce qui subsiste de `HYP-E1-27` après W13 : le déploiement la tire avec un jeton en
   lecture seule sur les paquets.
3. **Les secrets**, posés au dépôt puis transmis à l'hébergement par un workflow dédié, jamais en clair dans
   une conversation (REQ-INT-031).
4. **L'ordonnancement des fusions** : une seule fusion à la fois sur la branche principale, historique
   linéaire, atterrissage vérifié sur l'en-tête de version servie avant la fusion suivante (REQ-GOV-014,
   RM-09). Aucun workflow ne doit pousser sur la branche principale ; la garde
   `aucun-workflow-ne-pousse-sur-main` est déclarée dans `docs/gates.json` (tâche GOV-012), sans preuve
   rouge à ce jour, et son fichier `tests/unit/ci/aucun-workflow-ne-pousse-sur-main.spec.ts` n'est pas
   écrit — c'est GOV-012 qui l'armera.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | adresses exactes des documentations de l'intégration continue et du registre de paquets **à relever**, non ouvertes à ce jour — `A01` répartit la lecture |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — extrait de configuration d'exemple copié tel quel par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : la portée
exacte du jeton de lecture des paquets, la règle de protection de branche qui impose l'historique linéaire,
la disponibilité de la file de fusion native (`HYP-E1-33`), et le comportement d'un travail marqué pour ne
pas interrompre le flux — le dossier interdit ce marquage sur toute gate bloquante (RM-02), et cette
interdiction doit s'appuyer sur la documentation, pas sur le souvenir.

## 3. Données qui lui sont confiées

- **Le code source, publiquement.** C'est la décision W13, et elle commande la règle de publication : ni
  analyse du risque relationnel, ni valeurs de détection, ni économie du réseau.
- **Les secrets d'exécution**, dans le coffre du dépôt, jamais lisibles en clair dans un journal de
  construction.
- **L'image applicative**, privée.

Aucune donnée personnelle d'apporteur ni de tiers rencontré n'est confiée à ce tiers : les fixtures sont
générées et pseudonymisées (RM-03), et rien de la base de production n'y transite. Restent les comptes des
personnes qui contribuent, qui sont des données personnelles détenues par le tiers pour son propre compte.

## 4. Quotas et limites

Les minutes d'intégration continue sont illimitées sur un dépôt public — c'est l'un des motifs de W13. Les
limites de stockage du registre d'images, de taille d'artefact et de débit de l'interface programmable sont
**à confirmer** par le lecteur désigné par `A01` à la lecture.

Ce que **nous** appliquons : une gate de vérification bloquante démarre l'image avec une base et un cache
éphémères et exige une sonde de disponibilité verte avec aucune migration en attente en trois minutes au
plus (REQ-QA-018) ; une fusion à la fois ; aucun travail marqué comme non bloquant.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| L'intégration continue est indisponible | Ni construction, ni fusion, ni déploiement. **La production tourne** : elle sert l'image déjà tirée. Le coût est un arrêt de la livraison, pas du service |
| Le registre d'images est indisponible | L'hébergement ne peut pas tirer une nouvelle image ; l'ancien container reste servi (`HYP-E1-26`). Le retour arrière manuel de REQ-QA-022 est lui aussi indisponible tant que le registre ne répond pas — c'est la limite connue de cette procédure |
| Le dépôt est indisponible | Le travail des agents s'arrête. Aucune conséquence sur la production |
| Une fusion part pendant que l'atterrissage n'est pas vérifié | La règle l'interdit et l'outillage la fait respecter : créneau réservé avant la mise à jour de branche, état de fusion lu et fusion exécutée dans le même appel (RM-09) |

## 6. Point de contact

- Interne : Will, propriétaire du compte et du dépôt ; le poste `A01`, seul producteur de fusion.
- Externe : canal de support du fournisseur selon l'offre souscrite, **à confirmer** par Will avant la mise
  en production.

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat / offre souscrite | **à confirmer** par Will |
| Sous-traitance (art. 28 RGPD) | Aucune donnée personnelle de production n'y est traitée : ce tiers n'est pas sous-traitant à ce titre. Restent les comptes des personnes qui contribuent — qualification **à confirmer** par Will, avant la mise en production |
| Localisation des données | **à confirmer** par Will, avant la mise en production |
| Visibilité | dépôt **public** (W13) ; image **privée** (`HYP-E1-27`), avec une gate de visibilité du dépôt |
| Secrets | dans le coffre du dépôt, transmis par workflow, jamais en clair (REQ-INT-031) ; rotation sous `HYP-E1-24` |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Portée exacte du jeton de lecture des paquets, extrait cité | `A01` répartit ; le lecteur date sa lecture dans la fiche | premier tirage d'image par l'hébergement |
| Disponibilité de la file de fusion native (`HYP-E1-33`) | `A01` répartit ; le lecteur date sa lecture dans la fiche | premier lot à deux producteurs |
| Offre souscrite, localisation et canal de support | Will | mise en production |
| Qualification des comptes des personnes qui contribuent au regard de l'article 28 | Will | mise en production |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/github.md#2-source-officielle
```

Toute fixture de configuration de workflow ou de marquage d'image porte ces deux lignes. Tant que la
rubrique 2 est vide, la seconde ligne porte la mention `non confrontée`.
