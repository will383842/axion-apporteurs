# Validation des maquettes — Axion Partners

> **Gate** : une tâche d'écran (`UX-P1-*`, `UX-P2-*`, `UX-P3-*`) n'est **pas attribuable** tant que la
> maquette de son écran n'a pas une ligne « validé » ici. Le test `maquettes-validees.spec.ts` le vérifie.
>
> Pourquoi : le public de l'espace (indépendants de 45 à 68 ans, sur téléphone, dans leur voiture) n'est
> pas celui d'une console. Un écran conçu directement en code par un agent est un écran conçu pour un
> agent. Les maquettes vivent dans `docs/maquettes/<ecran>.html` — pan/zoom, deux thèmes, mobile d'abord.

## Espace apporteur

| Écran | Fichier | Tâche | Validé le | Par |
| --- | --- | --- | --- | --- |
| Accueil (3 chiffres, 1 alerte, 1 champ, 4 onglets) | `accueil.html` | UX-P1-08 | 2026-09-19 | Will |
| Entreprise (recherche + carte 4 états + « Déposer ») | `entreprise.html` | UX-P1-01 | 2026-09-19 | Will |
| Déposer un contact | `deposer.html` | UX-P1-02 | 2026-09-19 | Will |
| Mes entreprises | `mes-entreprises.html` | UX-P1-05 | 2026-09-19 | Will |
| Mes commissions | `mes-commissions.html` | UX-P2-01 | 2026-09-19 | Will |
| Ma conformité / Mon profil | `conformite.html` | UX-P1-09 | 2026-09-19 | Will |

## Console

| Écran | Fichier | Tâche | Validé le | Par |
| --- | --- | --- | --- | --- |
| File de qualification + fiche 60 s | `file-qualification.html` | UX-P1-07 | — | — |
| Lot du mois | `lot-paiement.html` | UX-P2-03 | — | — |
| Cadre de la console, instantané par rôle, accueil par rôle et par phase | `console-cadre.html` | UX-P1-16 | — | — |
| Accès refusé | `acces-refuse.html` | UX-P1-16 | — | — |
| Connexion à la console (lien, code à 6 chiffres, lien déjà utilisé) | `connexion-console.html` | SEC-29 · UX-P1-16 | — | — |
| Utilisateurs de la console et « Votre rôle » | `utilisateurs-console.html` | SEC-30 · UX-P1-20 | — | — |
| Fiche de qualification (W20 : état de la demande, raisons de vérification) | `fiche-qualification.html` | UX-P1-06 | — | — |
| Apporteurs : liste | `apporteurs.html` | UX-P1-12 | — | — |
| Fiche apporteur : cinq blocs, décision, dossier de conformité | `apporteur-fiche.html` | UX-P1-12 · CPL-T07 | — | — |
| Attributions et contrats | `attributions-contrats.html` | UX-P1-13 | — | — |
| Fiche prospect | `fiche-prospect.html` | EXT-T02a | — | — |

### Séance de validation groupée de la console

**Rapprochement avec `docs/CONSOLE-ROUTES.md` (UX-P1-19).** Chaque écran de console de la phase 1 a sa
maquette, sauf deux écarts nommés : l'éditeur de grille (`/console/grille`, UX-P1-14) et la saisie
manuelle d'une candidature (`/console/candidatures`, EXT-T04) n'ont pas de maquette, faute de chemin
dans UX-P1-19 ; la file (UX-P1-07) est `file-qualification.html`, « Votre rôle » (UX-P1-20) est un état de
`utilisateurs-console.html`, le dossier de conformité (CPL-T07) un état de `apporteur-fiche.html`. La
ligne de `fiche-prospect.html` ne nomme que EXT-T02a : la garde ne lit encore que les identifiants
`UX-P…`, et GOV-113 l'élargit.

Les six maquettes de la console se valident **ensemble**, en une séance de Will, parce qu'elles
partagent le même cadre : valider la file sans le cadre, c'est valider un en-tête qui va changer. La
séance est demandée par la PR de UX-P1-18 ; sa date est celle que Will fixe, et elle s'écrit ici le
jour où elle a lieu, ligne par ligne, dans le tableau ci-dessus.

Ordre de lecture proposé : `console-cadre.html` (les quatre rôles, puis « Téléphone 375 »),
`connexion-console.html`, `acces-refuse.html`, `utilisateurs-console.html`, puis
`file-qualification.html` et `lot-paiement.html`, dont seuls les en-têtes ont changé (filtrés par rôle).
La carte des routes qui les relie est `docs/CONSOLE-ROUTES.md`.

Pour la console, Will regarde en plus :

1. Chaque rôle ne voit-il **que** ce qu'il peut ouvrir ? (Le qualifieur sans les lots, le comptable sans
   la qualification, le lecteur sans aucune écriture.)
2. À 375 px, la barre du bas suffit-elle pour le geste principal du rôle, sans défilement horizontal ?
3. Les deux thèmes, clair et sombre, se lisent-ils aussi bien l'un que l'autre ?

## Ce que Will regarde

1. **Le geste principal tient-il en 90 secondes**, sur un téléphone, sans lire de mode d'emploi ?
2. Le vocabulaire est-il celui d'un apporteur (« votre entreprise », « ce que vous touchez ») et non
   celui du schéma (« attribution », « prorata », « déclaration non confirmée ») ?
3. Chaque état bloqué dit-il **pourquoi** et **quoi faire** ?
4. Y a-t-il quelque part un objectif, un classement, un compte à rebours de performance ? (Il ne doit
   pas y en avoir : voir les motifs 1 à 3 de la fiche `juriste`.)

## Comment on valide

Ajouter la date et « Will » dans la ligne de l'écran. Les maquettes s'ouvrent depuis `index.html`,
qui porte aussi les chartes de l'espace et de la console (identité, typographie, couleurs et contrastes
mesurés dans les deux thèmes, tailles tactiles, ton). Une modification substantielle de la maquette
**efface** la validation : la ligne repart vide.
