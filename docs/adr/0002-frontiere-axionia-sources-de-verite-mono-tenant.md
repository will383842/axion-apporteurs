# partners/ADR-0002 — La frontière avec axionia, les sources de vérité, le mono-tenant

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | GOV-009 |
| **Exigences servies** | REQ-CPL-018, REQ-GOV-008, REQ-INT-001, REQ-INT-003, REQ-INT-004, REQ-INT-014, REQ-INT-016, REQ-QA-007, REQ-SEC-010, REQ-SEC-013 |
| **Décisions du registre citées** | HYP-TENANT, HYP-E1-7, DEC-INT-001, W1, W13 |
| **Règle maison appliquée** | RM-01 |
| **Remplace / remplacé par** | — |

## Contexte

Deux dépôts servent un seul produit. axionia connaît les clients, les devis, les factures et les
encaissements ; Partners connaît les apporteurs, les attributions et les commissions. Quatre documents
de travail ont bâti un contrat sur des modèles supprimés d'axionia depuis un mois, parce que personne
n'avait écrit **qui détient quoi**. Séparément, l'audit de complétude a demandé qu'on dise si le
produit porte une notion de locataire (REQ-CPL-018) : une colonne posée « au cas où » et jamais
filtrée est un faux cloisonnement, et il est plus coûteux à retirer qu'à ajouter.

## Décision

### 1. La frontière est un contrat, jamais un accès

axionia est **producteur**, Partners est **consommateur**. Rien ne traverse autrement que par le
contrat versionné de `packages/contracts`, copié à empreinte identique des deux côtés (REQ-QA-007) :

- l'enveloppe d'événement et son schéma sont portés à l'identique des deux côtés (REQ-INT-003) ;
- la liste des types d'événements est **fermée** et se lit au glossaire §5, dont la source est
  `packages/contracts` (REQ-INT-004, étendue par REQ-CPL-014 et REQ-INT-032) ; on ne l'énumère pas
  ailleurs, on la cite ;
- chaque événement est écrit dans une file de sortie **dans la transaction métier** qui le produit —
  un retour arrière métier ne laisse aucun événement (REQ-INT-001) ;
- chaque requête entrante est signée et vérifiée en temps constant, hors fenêtre elle est refusée
  (REQ-SEC-010) ; chaque identifiant d'événement est enregistré avant traitement, un rejeu ne produit
  aucune écriture métier (glossaire §5) ;
- dans l'autre sens, Partners n'expose que deux points d'entrée à axionia, minimaux et authentifiés
  (REQ-INT-014, REQ-INT-016).

**Aucune base partagée, aucun import de code d'axionia, aucune lecture croisée.** Le tunnel de
candidature reste chez axionia en V1, qui émet l'événement correspondant (`HYP-E1-7`). L'instance de
signature électronique de Partners est dédiée et non partagée avec axionia (`DEC-INT-001`).

### 2. Une vérité, un détenteur

| Vérité | Détenteur | Ailleurs |
| --- | --- | --- |
| Grille de commissions | axionia, dans son fichier de tarification | Dérivée par export et empreinte, jamais retapée (`partners/ADR-0003`) |
| Client, devis, facture, encaissement | axionia | Partners n'en garde que ce que l'événement porte |
| Apporteur, attribution, ligne, relevé, lot | Partners | axionia ne les lit que par les deux points d'entrée dédiés |
| États d'une attribution | REQ-DM-003, une constante unique | Projetée en SQL, jamais réécrite en liste (RM-06) |
| Seuils et durées | Une source unique datée (RM-10) | Aucun littéral ailleurs |
| Identité légale de la société qui signe et qui paie | Décision W1 au registre, et la source qu'elle nomme | Citée, jamais recopiée |
| Données publiques d'entreprise | L'API publique, via un mandataire serveur (REQ-SEC-013) | **Aucun référentiel local** ; la réponse rendue à l'apporteur ne porte jamais les dirigeants |
| Secrets | L'hébergeur, posés par le workflow prévu | Jamais dans le dépôt, jamais dans une conversation (W13) |

### 3. Mono-tenant

Partners est **mono-tenant en V1** (`HYP-TENANT`, REQ-CPL-018) : **aucune colonne de locataire**,
aucune clause de filtrage par locataire, une base par déploiement. Le cloisonnement qui existe
réellement est celui d'un apporteur vis-à-vis des autres, et il est porté par la couche d'accès et
par le refus par défaut (`partners/ADR-0004`), pas par une colonne.

## Conséquences

Un second réseau, si un jour il existe, est un second déploiement : c'est un acte d'exploitation, pas
une migration de schéma. Le registre classe `HYP-TENANT` en réversibilité `migration` : y revenir
coûterait une colonne, un remplissage, des index et la relecture de chaque requête — c'est le prix
annoncé, et il est payé une fois, plus tard, si le besoin existe.

Parce que la frontière est un contrat, un changement d'un seul côté doit **rougir** : c'est la raison
d'être de l'empreinte partagée et des fixtures générées par le producteur réel (RM-03).

Parce qu'il n'y a pas de référentiel d'entreprises local, une panne de l'API publique dégrade le
dépôt en saisie contrôlée au lieu de l'interrompre — le comportement en panne fait partie du contrat
du tiers (RM-08).

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Lire directement la base d'axionia | Deux schémas couplés sans version ni rejeu ; toute évolution d'axionia casserait Partners en silence. |
| Poser une colonne de locataire « au cas où » | Une colonne que personne ne filtre donne l'illusion du cloisonnement et fait baisser la garde sur le vrai contrôle, qui est le refus par défaut (RM-05). |
| Reconstruire un référentiel d'entreprises local | Décision d'architecture déjà assumée : la fraîcheur viendrait de nous, la responsabilité aussi, pour un service que l'API publique rend déjà. |
| Une instance de signature partagée avec axionia | Une seule adresse de rappel pour deux produits, un aiguillage par métadonnée, et un risque de fuite croisée de gabarit (`DEC-INT-001`). |

## Ce qui le vérifie

- **Assertion déjà disponible** — `tests/unit/gouvernance/adr-index-derive.spec.ts` ·
  `it('REQ-CPL-018 — un ADR consigne le mono-tenant, cite HYP-TENANT et refuse la colonne de locataire')`.
  Elle est portée par GOV-009, qui porte REQ-CPL-018 avec CPL-T01 : la couverture d'une exigence de
  phase −1 ne se sous-traite pas à une tâche de phase 0 qui ne la cite pas.
- **Extension à poser** — quand `prisma/schema.prisma` existera, la même assertion lira le schéma et
  rougira sur tout champ ou modèle nommé comme un locataire. Elle revient à DM-01, la tâche du socle
  du schéma — mais DM-01 ne cite pas REQ-CPL-018 dans ses `reqs` : l'ajout au backlog revient au
  `gardien-spec`, et cet ADR ne le décrète pas.
- **Assertion à poser** — par les tâches d'intégration : l'égalité des empreintes du contrat des deux
  côtés (garde `contracts:hash`, REQ-QA-007).

## Reste à faire

Le dossier `packages/contracts` n'existe pas encore dans ce dépôt ; tant qu'il n'existe pas, la table
des détenteurs ci-dessus est la seule référence écrite, et c'est une faiblesse assumée de la phase −1.
