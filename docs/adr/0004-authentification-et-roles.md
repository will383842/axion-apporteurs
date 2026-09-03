# partners/ADR-0004 — Authentification et rôles : le défaut est le refus

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | GOV-009 |
| **Exigences servies** | REQ-GOV-008, REQ-SEC-001, REQ-SEC-003, REQ-SEC-004, REQ-SEC-005, REQ-SEC-008, REQ-SEC-009, REQ-SEC-023 |
| **Décisions du registre citées** | HYP-E1-15, HYP-E1-14, HYP-C6 |
| **Règle maison appliquée** | RM-05 |
| **Remplace / remplacé par** | — |

## Contexte

Deux populations accèdent au produit : l'**apporteur**, dans son espace, qui ne doit jamais voir les
données d'un autre apporteur ; et l'**équipe**, dans la console, où chacun n'a que ce que son métier
exige. Un droit oublié ne se voit presque jamais : sur un autre produit de la maison, un rôle de
lecture voyait la facturation que la personne chargée du secrétariat ne voyait pas, et une fonction
extraite avait perdu la garde que son appelant portait (RM-05, RM-07).

## Décision

### 1. L'espace apporteur : pas de mot de passe

La connexion se fait par **lien magique** à durée de vie courte, à usage unique, stocké seulement sous
forme d'empreinte, et la réponse du formulaire est **identique** que l'adresse existe ou non
(REQ-SEC-001). La demande est limitée par adresse et par empreinte d'adresse réseau, et en cas de
panne du compteur, **on refuse** (REQ-SEC-002).

La session est un cookie `__Host-`, enregistré en base, révocable, d'une durée de **trente jours**
(REQ-SEC-003, `HYP-E1-15` : la sécurité prime sur le confort). Une suspension, une résiliation, un
changement d'adresse ou de coordonnées bancaires incrémente `sessionVersion` et invalide toutes les
sessions antérieures.

Tout changement de coordonnées bancaires, d'adresse électronique ou de téléphone exige un **relèvement
d'authentification** : un lien magique consommé à l'instant (REQ-SEC-004).

### 2. Le cloisonnement est porté par une seule porte

Toute lecture et toute écriture de l'espace passent par la couche d'accès qui injecte l'identifiant de
l'apporteur de la session dans la clause de filtrage ; **aucun accès direct à la base** n'est écrit
sous les dossiers de l'espace (REQ-SEC-008). Une ressource appartenant à un autre apporteur rend un
**404 strictement identique** à celui d'un identifiant inexistant, documents PDF compris
(REQ-SEC-009) : un 403 confirmerait l'existence de la ressource.

Le masquage s'écrit dans le sens qui, en panne, ne cache rien à qui en a besoin et ne montre rien à
qui ne doit pas voir : on verrouille le sens de la condition, jamais la seule présence du conteneur
(RM-05).

### 3. La console : une matrice, et rien en dehors

Quatre rôles, et **un seul identifiant par rôle** : `admin`, `qualifieur`, `comptable`, `lecteur`
(REQ-SEC-023, glossaire §7). Les droits vivent dans **une** matrice écran × rôle × action, dans un
fichier unique ; chaque action serveur et chaque route de la console appelle la vérification de rôle.

**L'absence de règle est un refus.** Un écran ajouté sans ligne de matrice est inaccessible, et c'est
voulu : le coût d'un écran injoignable une heure est sans commune mesure avec celui d'un droit ouvert
à tout le monde pendant six mois.

### 4. Déposer sans session

Le dépôt sans session passe par un **jeton de dépôt privé**, lié à l'apporteur, stocké sous forme
d'empreinte, révocable, un seul actif à la fois (REQ-SEC-005). Il n'est **jamais** dérivé du code de
parrainage public, qui est une tout autre chose (`HYP-C6`, glossaire §8).

### 5. Le changement de coordonnées bancaires n'a qu'un mécanisme

Celui du dossier de conformité (`HYP-E1-14`) : la nouvelle pièce est à vérifier, le relèvement
d'authentification est exigé, l'identifiant bancaire est affiché masqué, l'ancienne adresse et
l'ancien numéro sont prévenus, une alerte est levée en console, et la ligne concernée est retenue avec
le motif `rib_a_verifier` tant que la pièce n'est pas validée à la date du relevé.

## Conséquences

Toute extraction de fonction emporte ses gardes ou les réinstalle chez son nouvel appelant, et la PR
cite les appelants d'origine (RM-07). Toute PR touchant l'authentification ou l'espace porte la
section « Attaque » du gabarit de PR (CONVENTIONS §5).

L'absence de mot de passe supprime la réinitialisation, le stockage d'empreintes de mots de passe et
la réutilisation entre services ; en échange, la boîte aux lettres de l'apporteur devient le facteur
d'authentification, ce que le relèvement pour les actions sensibles compense.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Mot de passe et second facteur pour l'espace | Une surface de plus, un parcours de réinitialisation de plus, pour une population qui se connecte rarement ; le relèvement ponctuel couvre le risque réel, qui est le changement de coordonnées bancaires. |
| Un droit porté par un booléen sur la personne | Un booléen ne s'énumère pas : on ne peut ni le relire écran par écran, ni prouver qu'aucun trou ne subsiste. Une matrice se lit. |
| Répondre 403 sur une ressource d'un autre apporteur | Le code de refus révèle l'existence de la ressource et permet de cartographier le réseau. |
| Réutiliser le code de parrainage public comme jeton de dépôt | Un identifiant public ne se révoque pas sans casser tous les partages déjà faits (`HYP-C6`). |

## Ce qui le vérifie

- **Assertion à poser** — par SEC-05, qui porte REQ-SEC-008 et REQ-SEC-009 : `tests/security/idor.spec.ts` ·
  `it('REQ-SEC-009 — une ressource d'un autre apporteur rend un 404 identique à celui d'un identifiant
  inexistant')`, sur une liste de routes dérivée du système de fichiers, documents PDF compris. C'est
  la garde `idor:check` du registre des gardes.
- **Assertion à poser** — par QA-T07 : la garde d'analyse syntaxique `G-SEC-AST-PRISMA`
  (`docs/gates.json`), qui refuse tout accès direct à la base hors de la couche d'accès sous les
  dossiers de l'espace (REQ-SEC-008, portée par SEC-05). Deux tâches, deux objets : SEC-05 écrit la
  porte, QA-T07 écrit la règle qui interdit de passer à côté.

## Reste à faire

REQ-SEC-025 décrit encore une période de carence et une exclusion du lot en cours pour le changement
de coordonnées bancaires, là où `HYP-E1-14` a retenu le seul mécanisme du dossier de conformité. Le
registre prévaut, et cet ADR applique le registre ; la mise en cohérence du texte de l'exigence
revient au `gardien-spec`, pas à un ADR.
