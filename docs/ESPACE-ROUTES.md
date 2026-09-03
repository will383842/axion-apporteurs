# Routes de l'espace apporteur — carte unique

> Source unique du routage de l'espace. Une tâche d'écran cite sa ligne ici ; deux écrans ne partagent
> jamais une route. Hypothèse appliquée (HYP-E1-10) : **un seul champ sur l'accueil**, une barre à
> **4 onglets**, tout le reste sous « Plus ».
>
> Toutes ces routes sont **cloisonnées** : la ressource d'un autre apporteur rend un **404 byte-identique**
> à un identifiant inexistant (`idor:check` énumère cette liste depuis le système de fichiers, pas depuis
> ce document — ce fichier est la carte, pas la source du test).

## Barre de navigation (4 onglets)

| Onglet | Route | Écran | REQ | Maquette | Tâche |
| --- | --- | --- | --- | --- | --- |
| Accueil | `/` | 3 chiffres · 1 alerte priorisée · 1 champ Entreprise · états vides | REQ-UX-008, REQ-UX-019, REQ-UX-033 | `accueil.html` | UX-P1-08 |
| Mes entreprises | `/mes-entreprises` | Liste, statut, prochaine étape **et par qui**, compte à rebours | REQ-UX-004, REQ-UX-023 | `mes-entreprises.html` | UX-P1-05 |
| Mes commissions | `/mes-commissions` | Ventilation par payeur, échéance, prévisionnel, motif de blocage | REQ-UX-005, REQ-UX-010/011/012 | `mes-commissions.html` | UX-P2-01 |
| Plus | `/plus` | Documents · Filleuls · Conformité · Profil · Ressources · Aide | REQ-UX-006, REQ-UX-030 | — | UX-P2-04 |

## Le geste principal

| Route | Écran | Détail | REQ | Tâche |
| --- | --- | --- | --- | --- |
| `/entreprise?q=` | **Vérifier une entreprise** | Recherche, carte à **4 états** (`libre`, `suivie_place_disponible`, `suivie_file_complete`, `non_disponible`), bouton « Déclarer » pré-rempli, compteur 30/jour | REQ-UX-001, REQ-UX-007 | UX-P1-01 |
| `/deposer` | Déposer un contact | Autocomplétion < 300 ms, tolérance aux fautes, ville en aide, repli manuel, 10 issues rendues | REQ-UX-001, REQ-UX-002, REQ-UX-020 | UX-P1-02 |
| `/d/<jeton>` | **Dépôt sans connexion** | Même formulaire, par lien privé ; brouillon hors-ligne (IndexedDB), envoi au retour du réseau, **horodatage à la réception** | REQ-UX-013, REQ-SEC-033 | UX-P1-03 |

> ⚠️ `/entreprise` exige une **session** (30/jour, journalisé) ; `/d/<jeton>` n'exige qu'un jeton et ne
> permet **que** le dépôt — jamais la consultation. Vérifier est gratuit et en lecture seule ; déposer
> exige la preuve de contact. C'est cette asymétrie qui empêche le squattage par la porte de devant.

## Sous « Plus »

| Route | Écran | REQ | Tâche |
| --- | --- | --- | --- |
| `/documents` | Contrat (chaque version), avenants, relevés, autofactures, attestation annuelle, export RGPD | REQ-UX-006, REQ-UX-030, REQ-UX-032 | UX-P2-04 |
| `/filleuls` | Filleuls, échéance des 12 mois, lien de parrainage partageable — **agrégé, sans montant par filleul** | REQ-UX-030 | UX-P2-04 |
| `/conformite` | Pièces KYC avec état et upload — c'est ici qu'on voit pourquoi un paiement est bloqué | REQ-UX-016, REQ-UX-027 | UX-P1-09 |
| `/profil` | Zones, secteur, disponibilité, canal de notification, RIB (step-up), e-mail (confirmation sur l'ancienne adresse) | REQ-UX-027, REQ-UX-031, REQ-CPL-019 | UX-P1-09 |
| `/activite` | Mon activité — ses chiffres, son palier, **aucun objectif, aucun classement** | REQ-UX-029 | UX-P3-02 |
| `/ressources` | Kit, grille de sa version de contrat, FAQ, replay, argumentaires par palier | REQ-CPL-023 | UX-P3-02 |
| `/aide` | Fil de conversation avec Axion-IA, FAQ d'abord, engagement 2 jours ouvrés | REQ-UX-028 | UX-P3-03 |

## Connexion

| Route | Rôle | REQ | Tâche |
| --- | --- | --- | --- |
| `/connexion` | Demande de lien magique (message identique que l'adresse existe ou non) | REQ-SEC-001, REQ-SEC-016 | SEC-03 |
| `/connexion/<jeton>` | Consommation du lien (usage unique) ; page dédiée si déjà consommé ; code à 6 chiffres en repli | REQ-UX-015 | UX-P1-04 |

## Règles qui s'appliquent à toutes les routes

1. **Mobile d'abord** : cibles ≥ 48 px, corps ≥ 18 px, reflow à 320 px et zoom 200 %, `axe` = 0.
2. **Budget** : ≤ 75 KB gz de First Load JS **par route**, mesuré par script maison.
3. **Aucun montant avant `devis.signe`** dans un DTO ; **jamais** l'identité d'un autre apporteur.
4. Chaque état affiché dit **pourquoi** et **quoi faire** ; le `switch` sur l'enum d'affichage est exhaustif.
