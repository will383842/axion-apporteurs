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
| Accueil (3 chiffres, 1 alerte, 1 champ, 4 onglets) | `accueil.html` | UX-P1-08 | — | — |
| Entreprise (recherche + carte 4 états + « Déclarer ») | `entreprise.html` | UX-P1-01 | — | — |
| Déposer un contact | `deposer.html` | UX-P1-02 | — | — |
| Mes entreprises | `mes-entreprises.html` | UX-P1-05 | — | — |
| Mes commissions | `mes-commissions.html` | UX-P2-01 | — | — |
| Ma conformité / Mon profil | `conformite.html` | UX-P1-09 | — | — |

## Console

| Écran | Fichier | Tâche | Validé le | Par |
| --- | --- | --- | --- | --- |
| File de qualification + fiche 60 s | `file-qualification.html` | UX-P1-07 | — | — |
| Lot du mois | `lot-paiement.html` | UX-P2-03 | — | — |

## Ce que Will regarde

1. **Le geste principal tient-il en 90 secondes**, sur un téléphone, sans lire de mode d'emploi ?
2. Le vocabulaire est-il celui d'un apporteur (« votre entreprise », « ce que vous touchez ») et non
   celui du schéma (« attribution », « prorata », « déclaration non confirmée ») ?
3. Chaque état bloqué dit-il **pourquoi** et **quoi faire** ?
4. Y a-t-il quelque part un objectif, un classement, un compte à rebours de performance ? (Il ne doit
   pas y en avoir : voir les motifs 1 à 3 de la fiche `juriste`.)

## Comment on valide

Ajouter la date et « Will » dans la ligne de l'écran. Une modification substantielle de la maquette
**efface** la validation : la ligne repart vide.
