# Routes de l'espace apporteur — carte unique

> Source unique du routage de l'espace. Une tâche d'écran cite sa ligne ici ; deux écrans ne partagent
> jamais une route. Hypothèse appliquée (HYP-E1-10) : **un seul champ sur l'accueil**, une barre à
> **4 onglets**, tout le reste sous « Plus ».
>
> Toutes ces routes sont **cloisonnées** : la ressource d'un autre apporteur rend un **404 byte-identique**
> à un identifiant inexistant (`idor:check` énumère cette liste depuis le système de fichiers, pas depuis
> ce document — ce fichier est la carte, pas la source du test).
>
> La colonne **« Écran principal »** (`oui` ou `non`) désigne les écrans soumis au test de premier usage
> (REQ-UX-047 point 7). La console a sa propre carte, `docs/CONSOLE-ROUTES.md`, qui porte la même colonne.

## Barre de navigation (4 onglets)

| Onglet | Route | Écran | REQ | Maquette | Tâche | Écran principal |
| --- | --- | --- | --- | --- | --- | --- |
| Accueil | `/` | 3 chiffres · 1 alerte priorisée · 1 champ Entreprise · états vides | REQ-UX-008, REQ-UX-019, REQ-UX-033 | `accueil.html` | UX-P1-08 | oui |
| Mes entreprises | `/mes-entreprises` | Liste, statut, prochaine étape **et par qui**, compte à rebours | REQ-UX-004, REQ-UX-023 | `mes-entreprises.html` | UX-P1-05 | oui |
| Mes commissions | `/mes-commissions` | Ventilation par payeur, échéance, prévisionnel, motif de blocage | REQ-UX-005, REQ-UX-010/011/012 | `mes-commissions.html` | UX-P2-01 | oui |
| Plus | `/plus` | Documents · Filleuls · Conformité · Profil · Ressources · Aide | REQ-UX-006, REQ-UX-030 | `conformite.html` (état « Onglet Plus ») | UX-P2-04 | non |

## Le geste principal

| Route | Écran | Détail | REQ | Maquette | Tâche | Écran principal |
| --- | --- | --- | --- | --- | --- | --- |
| `/entreprise?q=` | **Vérifier une entreprise** | Recherche, carte à **4 états** (`libre`, `suivie_place_disponible`, `suivie_file_complete`, `non_disponible`), bouton « Déposer » pré-rempli, compteur 30/jour | REQ-UX-001, REQ-UX-007 | `entreprise.html` | UX-P1-01 | oui |
| `/deposer` | Déposer un contact | Autocomplétion < 300 ms, tolérance aux fautes, ville en aide, repli manuel, issues de `IssueDepot` rendues | REQ-UX-001, REQ-UX-002, REQ-UX-020 | `deposer.html` | UX-P1-02 | oui |
| `/d/<jeton>` | **Dépôt sans connexion** | Même formulaire, par lien privé ; brouillon hors-ligne (IndexedDB), envoi au retour du réseau, **horodatage à la réception** | REQ-UX-013, REQ-SEC-033 | `depot-lien-prive.html` | UX-P1-03 | oui |

> ⚠️ `/entreprise` exige une **session** (30/jour, journalisé) ; `/d/<jeton>` n'exige qu'un jeton et ne
> permet **que** le dépôt — jamais la consultation. Vérifier est gratuit et en lecture seule ; déposer
> exige la preuve de contact. C'est cette asymétrie qui empêche le squattage par la porte de devant.

## Sous « Plus »

| Route | Écran | REQ | Maquette | Tâche | Écran principal |
| --- | --- | --- | --- | --- | --- |
| `/documents` | Contrat (chaque version), avenants, relevés, autofactures, attestation annuelle, export RGPD | REQ-UX-006, REQ-UX-030, REQ-UX-032 | — | UX-P2-04 | non |
| `/filleuls` | Filleuls, règle des 12 mois en **texte fixe** sans aucune date calculée (W15), lien de parrainage partageable — **agrégé, sans montant par filleul** ; liste des filleuls directs réduite à trois clés exactes — prénom, initiale du nom, état du contrat (« en signature » ou « signé », règle fermée de REQ-UX-041, sur l'ensemble des versions du contrat) —, jamais les filleuls des filleuls (W15) ; aucune échéance ni date propre à un filleul, ni par filleul ni agrégée | REQ-UX-030, REQ-UX-041 | — | UX-P2-04, UX-P2-09 | non |
| `/conformite` | Pièces KYC avec état et upload — c'est ici qu'on voit pourquoi un paiement est bloqué | REQ-UX-016, REQ-UX-027 | `conformite.html` | UX-P1-09 | oui |
| `/profil` | Zones, secteur, disponibilité, canal de notification, RIB (step-up), e-mail (confirmation sur l'ancienne adresse) | REQ-UX-027, REQ-UX-031, REQ-CPL-019 | `conformite.html` | UX-P1-09 | non |
| `/profil/personnes` | Personnes qui agissent pour l'apporteur : liste déclarative, sans compte ni session ; proposée au dépôt | REQ-UX-039 | `personnes.html` | UX-P1-15 | non |
| `/mon-contrat` | Mon contrat : version à signer, annexe générée de la grille avec ses écarts justifiés, signature, état de l'enveloppe ; atteignable en ouverture limitée (SEC-43) | REQ-UX-047, REQ-CPL-006 | `mon-contrat.html` | UX-P1-44 | oui |
| `/notifications` | Notifications de l'espace ; leur ouverture ne fait courir aucun délai | REQ-UX-016, REQ-JUR-039 | `notifications.html` | UX-P1-08 | non |
| `/contestations/[id]` | Ma contestation : relire son écrit et la réponse d'Axion-IA, et seulement les siens ; en ouverture pleine seulement (un résilié reçoit la réponse d'une contestation inconnue), sans aucune action | REQ-DM-043, REQ-UX-047 | `contestation.html` | UX-P1-51 | non |
| `/activite` | Mon activité — ses chiffres, son palier, **aucun objectif, aucun classement** | REQ-UX-029 | — | UX-P3-02 | non |
| `/ressources` | Kit, grille de sa version de contrat, FAQ, replay, argumentaires par palier | REQ-CPL-023 | — | UX-P3-02 | non |
| `/aide` | Fil de conversation avec Axion-IA, FAQ d'abord, engagement 2 jours ouvrés | REQ-UX-028 | — | UX-P3-03 | non |

## Connexion

| Route | Rôle | REQ | Tâche | Écran principal |
| --- | --- | --- | --- | --- |
| `/connexion` | Demande de lien magique (message identique que l'adresse existe ou non), maquette `connexion.html` | REQ-SEC-001, REQ-SEC-016 | SEC-03 | oui |
| `/connexion/<jeton>` | Consommation du lien (usage unique) ; page dédiée si déjà consommé ; code à 6 chiffres en repli | REQ-UX-015 | UX-P1-04 | non |

## Hors des onglets

| Route | Rôle | REQ | Tâche | Écran principal |
| --- | --- | --- | --- | --- |
| `/confidentialite` | Politique de confidentialité dérivée du registre de l'article 30 ; lisible sans session ; acceptée à la première connexion, puis à chaque nouvelle version | REQ-JUR-025 | JUR-T34 | non |
| `/mes-entreprises/<id>` | Fiche d'une entreprise : frise des étapes et des échanges, échanges visibles de la Société ; la fiche d'un autre compte rend la même page qu'un identifiant inexistant ; maquette `mes-entreprises-fiche.html` | REQ-EXT-002, REQ-EXT-003 | EXT-T01 | oui |
| `/confirmer/<jeton>` | Réponse du contact rencontré (W20) : page publique, hors session, sans oracle ; deux actions, second geste pour « Non », information de l'article 14 et opposition ; ouvrir le lien ne répond rien, seule l'action sur la page répond. Maquette `confirmation-contact.html` | REQ-UX-061 | UX-P1-42 | oui |

## Ouverture — qui atteint quoi (SEC-43)

décision de Williams du 2026-10-01 ; forme à plat, décision A02 du 2026-10-02. Quatre niveaux, un
seul verdict (`src/domain/apporteur/acces-espace.ts`) : **pleine** pour `signe` et `suspendu`,
**limitée** pour `kyc_en_cours` et `pret_a_signer`, **lecture** pour `resilie` tant que ses droits
courent (SEC-19 : au moins une attribution `figee_resiliation`), **fermée** pour tout autre statut. Le segment est
le premier dossier sous `src/app/(espace)/` (l'accueil s'appelle `accueil`), et ses listes sont
fermées dans le domaine : cette table les RAPPORTE, elle n'en est pas la source.

| Segment | Ouverture | Ce qui le tient |
| --- | --- | --- |
| `conformite`, `mon-contrat` | limitée (et pleine) | `SEGMENTS_LIMITES` |
| `confidentialite` | page publique ; l'action d'acceptation, limitée (et pleine) | `SEGMENT_DE_L_ACCEPTATION` |
| `accueil`, `mes-entreprises`, `mes-commissions`, `plus`, `entreprise`, `deposer`, `documents`, `filleuls`, `profil`, `notifications`, `activite`, `ressources`, `aide` | pleine seulement | `SEGMENTS_PLEINS` |
| `connexion`, `d`, `confirmer` | publique, sans session | `SEGMENTS_PUBLICS` |

En **lecture** (SEC-19, liste blanche de la sécurité, #703) : `accueil`, `mes-commissions`,
`mes-entreprises`, `notifications`, `documents`, `mon-contrat` et l'acceptation de la politique
répondent, et eux seuls (`SEGMENTS_LECTURE`, défaut fermé : un segment ajouté plus tard aux autres
listes n'y entre que par décision). Aucune écriture : `actionEspace`, `exigerSessionRelevee` et la
garde de l'appareil refusent la lecture (`lecture_seule`), sauf l'acceptation de la politique.

Chaque page et chaque route appellent `exigerSessionPour(<son segment>)`, et chaque action serveur
`actionEspace(<son segment>, …)`, comme **premier acte** ; un layout ne protège jamais. Un segment
absent de ces listes est refusé à tout niveau. Le témoin du disque
(`tests/unit/securite/acces-espace-avant-signature.spec.ts`) dérive le segment de chaque chemin et
rougit sur un fichier non protégé, au mauvais segment, ou dont l'appel n'est pas le premier acte.

## Règles qui s'appliquent à toutes les routes

1. **Mobile d'abord** : cibles ≥ 48 px, corps ≥ 18 px, reflow à 320 px et zoom 200 %, `axe` = 0.
2. **Budget** : ≤ 75 KB gz de First Load JS **par route**, mesuré par script maison.
3. **Aucun montant avant `devis.signe`** dans un DTO ; **jamais** l'identité d'un autre apporteur.
4. Chaque état affiché dit **pourquoi** et **quoi faire** ; le `switch` sur l'enum d'affichage est exhaustif.
