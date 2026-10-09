# Routes de la console — carte unique

> Pendant de `docs/ESPACE-ROUTES.md` pour la console d'Axion-IA (REQ-UX-048). Une tâche d'écran de
> console cite sa ligne ici ; deux écrans ne partagent jamais une route. Toutes les routes vivent sous
> `/console/`.
>
> **Ce fichier est la carte, pas la source des droits.** Les droits sont dans la matrice unique
> `src/server/roles/matrice.ts` (REQ-SEC-023, RM-05) : la navigation de la console en est DÉRIVÉE, et
> le défaut y est le refus. La colonne « Rôles » ci-dessous est la **proposition** que chaque tâche
> d'écran inscrit dans la matrice sous la forme d'un droit `ecran:<nom>` ; si les deux divergent, la
> matrice fait foi et cette carte se corrige. À ce jour la matrice ne porte encore aucun droit
> `ecran:*` : chaque écran y entre avec la tâche qui le livre.
>
> Le rôle `conseiller_salarie` n'a **aucun** écran de console en V1 (REQ-SEC-041) : il n'apparaît dans
> aucune ligne, et la connexion le refuse comme une adresse inconnue.

## Colonnes

- **Route** : le chemin, sous `/console/`. `[id]` est un identifiant opaque, jamais un SIREN.
- **Rôles** : `admin`, `qualifieur`, `comptable`, `lecteur` (`docs/GLOSSAIRE.md` §7). « lecture »
  signale un accès sans aucune écriture.
- **Phase** : la phase du plan qui livre l'écran.
- **Statut** : `prévue` ou `livrée`. Une route passe à `livrée` dans la PR qui la livre.
- **Écran principal** : `oui` désigne un écran soumis au test de premier usage (REQ-UX-047 point 7).

## Navigation de premier niveau

Sept entrées au plus sur le bureau, groupées par métier ; en dessous de 768 px, une barre inférieure de
trois entrées et un bouton « Menu » qui ouvre le reste, sans défilement horizontal à 320 px. Une entrée
n'apparaît que si le rôle a le droit de l'écran ET que l'écran est livré : aucun onglet ne mène à un
écran prévu. L'accueil n'est pas une entrée : `/console` mène à l'écran préféré du rôle (section
suivante), et la marque « Console Axion Partners », en tête de chaque page, y ramène.

| Ordre | Entrée | Route d'arrivée | Rôles | Phase |
| --- | --- | --- | --- | --- |
| 1 | Qualification | `/console/qualification` | admin, qualifieur, lecteur (lecture) | 1 |
| 2 | Apporteurs | `/console/apporteurs` | admin, qualifieur, comptable | 1 |
| 3 | Prospects | `/console/attributions` | admin, qualifieur, lecteur (lecture) | 1 |
| 4 | Argent | `/console/lots` | admin, comptable | 2 |
| 5 | Pilotage | `/console/pilotage` | admin | 3 |
| 6 | Statistiques | `/console/statistiques` | admin, lecteur | 3 |
| 7 | Administration | `/console/utilisateurs` | admin | 1 |

Hors de la barre, dans l'en-tête : la recherche globale (bornée par la matrice, UX-P1-20) et le menu du
compte (« Votre rôle », « Se déconnecter »). En mobile, ces deux-là passent dans « Menu ».

En phase 1, ce que chaque rôle voit (instantanés dans `console-cadre.html`) :

| Rôle | Bureau | Barre mobile |
| --- | --- | --- |
| admin | Qualification · Apporteurs · Prospects · Administration | Qualification · Apporteurs · Prospects · Menu |
| qualifieur | Qualification · Apporteurs · Prospects | Qualification · Apporteurs · Prospects · Menu |
| comptable | Apporteurs | Apporteurs · Menu |
| lecteur | Qualification · Prospects | Qualification · Prospects · Menu |

## Accueil par rôle et par phase

`/console` mène à la **première route livrée** de la liste de préférence du rôle. Si aucune ne l'est
encore, l'accueil montre un état vide guidant qui dit ce qui arrive et à quel moment ; jamais un 404.

| Rôle | Liste de préférence | En phase 1 |
| --- | --- | --- |
| admin | `/console/qualification`, `/console/apporteurs` | la file de qualification |
| qualifieur | `/console/qualification` | la file de qualification |
| comptable | `/console/lots`, `/console/apporteurs` | la liste des apporteurs, et un encart qui annonce les lots à l'ouverture des versements |
| lecteur | `/console/statistiques`, `/console/qualification` | la file de qualification, en lecture |

## Connexion et pages transverses

| Route | Écran | Rôles | Phase | Statut | REQ | Maquette | Tâche | Écran principal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/console/connexion` | Connexion : adresse, lien et code à 6 chiffres ; message identique que l'adresse existe ou non | tous, sans session | 1 | livrée | REQ-UX-048, REQ-SEC-003 | `connexion-console.html` | SEC-29 | oui |
| `/console/connexion/[jeton]` | Consommation du lien (usage unique), page « lien déjà utilisé », atterrissage sur l'URL demandée | tous, sans session | 1 | livrée | REQ-UX-048, REQ-UX-015 | `connexion-console.html` | SEC-29 | non |
| `/console` | Accueil de repli par rôle et par phase | admin, qualifieur, comptable, lecteur | 1 | livrée | REQ-UX-048, REQ-UX-019 | `console-cadre.html` | UX-P1-16 | oui |
| `/console/acces-refuse` | Accès refusé : ce que le rôle permet, qui peut le changer, le retour à l'accueil | tous, avec session | 1 | livrée | REQ-UX-048, REQ-SEC-023 | `acces-refuse.html` | UX-P1-16 | non |
| `/console/votre-role` | Votre rôle, dérivé du glossaire §7 | admin, qualifieur, comptable, lecteur | 1 | prévue | REQ-UX-048 | `utilisateurs-console.html` (état « Votre rôle ») | UX-P1-20 | non |

## Écrans de la phase 1

| Route | Écran | Rôles | Phase | Statut | REQ | Maquette | Tâche | Écran principal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/console/qualification` | File de qualification, onglet « À appeler aujourd'hui » | admin, qualifieur, lecteur (lecture) | 1 | prévue | REQ-UX-022, REQ-UX-048 | `file-qualification.html` | UX-P1-07 | oui |
| `/console/qualification/[id]` | Fiche de qualification | admin, qualifieur | 1 | prévue | REQ-UX-021, REQ-CPL-024 | `fiche-qualification.html` | UX-P1-06 | oui |
| `/console/apporteurs` | Liste des apporteurs | admin, qualifieur, comptable | 1 | prévue | REQ-CPL-027, REQ-UX-036 | `apporteurs.html` | UX-P1-12 | oui |
| `/console/apporteurs/[id]` | Fiche apporteur, cinq blocs, décision retenu, vivier ou refusé | admin, qualifieur, comptable | 1 | prévue | REQ-CPL-027, REQ-JUR-031 | `apporteur-fiche.html` | UX-P1-12 | non |
| `/console/apporteurs/[id]/conformite` | Dossier de conformité : pièces, vérification, ouverture et validation | admin, qualifieur | 1 | livrée | REQ-DM-027 | `apporteur-fiche.html` (bloc conformité) | CPL-T07 | non |
| `/console/apporteurs/[id]/mise-en-demeure` | Mise en demeure : article de la liste fermée, faits, envoi daté par le courriel | admin | 1 | livrée | REQ-UX-047, REQ-JUR-006 | `mise-en-demeure.html` | UX-P1-57 | non |
| `/console/anomalies` | Anomalies de sincérité ouvertes, les plus anciennes d'abord, sans score, rang ni seuil | admin | 1 | livrée | REQ-UX-047, REQ-SEC-023 | `anomalies.html` | UX-P1-56 | non |
| `/console/anomalies/[id]` | Confirmer une anomalie de sincérité avec ses faits retenus, chiffrés ; aucun gel posé | admin | 1 | livrée | REQ-UX-047, REQ-SEC-023, REQ-DM-033 | `anomalies.html` | UX-P1-56 | non |
| `/console/attributions` | Attributions : filtres état, département, apporteur ; rattachement manuel motivé | admin, qualifieur, lecteur (lecture) | 1 | prévue | REQ-UX-037 | `attributions-contrats.html` | UX-P1-13 | non |
| `/console/attributions/[id]` | Fiche prospect : échanges, fiche de qualification, journal | admin, qualifieur | 1 | prévue | REQ-EXT-003, REQ-EXT-005 | `fiche-prospect.html` | EXT-T02a | non |
| `/console/contrats` | Contrats : versions signées | admin, comptable | 1 | prévue | REQ-UX-037 | `attributions-contrats.html` | UX-P1-13 | non |
| `/console/grille` | Éditeur de grille : modèles, édition en masse, complétude | admin | 1 | prévue | REQ-EXT-023, REQ-UX-026 | `grille-console.html` | UX-P1-14 | non |
| `/console/candidatures` | Saisie manuelle d'une candidature et pièce jointe | admin | 1 | prévue | REQ-EXT-011, REQ-EXT-012 | `saisie-manuelle-console.html` | EXT-T04 | non |
| `/console/utilisateurs` | Utilisateurs : invitation qui expire, rôle expliqué, désactivation immédiate | admin | 1 | livrée | REQ-SEC-023, REQ-DM-024 | `utilisateurs-console.html` | SEC-30 | non |
| `/console/journal-des-acces/gels` | Gels du journal des accès : poser et lever sous step-up, liste bornée et paginée, ouverte depuis l'administration ; « aucun autre administrateur » quand personne ne peut lever | admin | 1 | livrée | REQ-SEC-023, REQ-UX-047 | — | UX-P1-53 | non |

## Écrans des phases 2 et 3

| Route | Écran | Rôles | Phase | Statut | REQ | Maquette | Tâche | Écran principal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/console/lots` | Lot du mois : machine d'états, export unique, rapprochement | admin, comptable | 2 | prévue | REQ-UX-025, REQ-SEC-023 | `lot-paiement.html` | UX-P2-03 | oui |
| `/console/commissions` | Registre des commissions | admin, comptable | 2 | prévue | REQ-ARG-027, REQ-DM-015 | — | T-ARG-035 | non |
| `/console/argent/paie` | Export paie, base de calcul par ligne | admin, comptable | 2 | prévue | REQ-ARG-037, REQ-ARG-038 | — | UX-P2-10 | non |
| `/console/parametres` | Paramètres : grille en lecture seule | admin, comptable, lecteur (lecture) | 2 | prévue | REQ-CPL-007, REQ-UX-026 | — | UX-P2-05 | non |
| `/console/apporteurs/lignee` | Lignée d'un apporteur, liste et arbre | admin | 2 | prévue | REQ-UX-040 | — | UX-P2-08 | non |
| `/console/conseillers` | Fiche conseiller : plans de part variable et objectifs, réaffectation motivée | admin | 2 | prévue | REQ-ARG-038, REQ-DM-048 | — | UX-P2-12 | non |
| `/console/pilotage` | Pilotage : entonnoir, territoire, tableau de bord nominatif des conseillers ; refus serveur pour tout autre rôle (décision de Williams, UX-P3-04) | admin | 3 | prévue | REQ-UX-035 | — | UX-P3-04 | non |
| `/console/conformite` | Conformité et anomalies : pièces, échéances, cumuls annuels | admin, comptable | 3 | prévue | REQ-UX-031, REQ-SEC-023 | — | UX-P3-05 | non |
| `/console/statistiques` | Statistiques : agrégats en tableaux filtrables, sans aucune donnée nominative | admin, lecteur | 3 | prévue | REQ-UX-042, REQ-UX-044 | — | UX-P3-07 | non |
| `/console/apporteurs/notes` | Notes internes par apporteur | admin, qualifieur | 3 | prévue | REQ-SEC-039 | — | UX-P3-10 | non |
| `/console/bibliotheque` | Bibliothèque de documents | admin | 3 | prévue | REQ-UX-046 | — | UX-P3-12 | non |

Une maquette marquée `—` n'existe pas encore : elle vient de UX-P1-45 pour l'espace, de UX-P2-14,
UX-P2-15 ou UX-P3-13 pour la console. Les maquettes de la phase 1 qui manquent (`fiche-qualification`,
`apporteurs`, `apporteur-fiche`, `attributions-contrats`, `fiche-prospect`) sont produites par UX-P1-19.

## Règles qui s'appliquent à toutes les routes

1. **Bureau d'abord, mobile tenu** : maquette à 1280×800 et à 375×667 ; cibles ≥ 44 px en mobile et
   ≥ 24 px sur le bureau, `axe` = 0 violation sérieuse ou critique (REQ-UX-018).
2. **Cinq états** par écran : nominal, vide qui montre le geste suivant, chargement, erreur qui dit quoi
   faire, accès refusé (REQ-UX-047 point 3, REQ-UX-019).
3. **Deux thèmes**, clair et sombre, jetons de la charte de console (`docs/maquettes/index.html`).
4. **Un refus ne divulgue rien** : une ressource qu'un rôle ne peut pas voir rend la page d'accès refusé
   pour un écran, et un 404 indiscernable d'un identifiant inexistant pour une ressource (RM-05).
