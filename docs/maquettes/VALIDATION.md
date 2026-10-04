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
| Entreprise (recherche + carte 4 états + « Déposer ») — à revalider (« Personne ne suit… » devient « disponible », et l'attente porte la phrase de la juriste, après la validation du 19/09) | `entreprise.html` | UX-P1-01 | 2026-09-19 | Will |
| Déposer un contact (W20 : quatre coordonnées, message, carte Annuler / Corriger) — à revalider (« Un autre apporteur suit… » devient « déjà réservée », après la validation du 03/10) | `deposer.html` | UX-P1-02 | 2026-10-03 | Will |
| Mes entreprises (W20 : badges de la confirmation) — à revalider (libellé du rattrapage 70, après la validation du 03/10) | `mes-entreprises.html` | UX-P1-05 | 2026-10-03 | Will |
| Réponse du contact (page publique /confirmer) | `confirmation-contact.html` | UX-P1-42 | 2026-10-03 | Will |
| Mes commissions | `mes-commissions.html` | UX-P2-01 | 2026-09-19 | Will |
| Ma conformité / Mon profil (ouverture limitée, état vide) | `conformite.html` | UX-P1-09 | 2026-10-03 | Will |
| Se connecter (lien, code à 6 chiffres, lien déjà utilisé) | `connexion.html` | UX-P1-04 | 2026-10-03 | Will |
| Mon contrat | `mon-contrat.html` | UX-P1-44 | 2026-10-03 | Will |
| Fiche d'une entreprise (frise, échanges) | `mes-entreprises-fiche.html` | EXT-T01 | 2026-10-03 | Will |
| Personnes qui agissent pour l'apporteur | `personnes.html` | UX-P1-15 | 2026-10-03 | Will |
| Dépôt par lien privé | `depot-lien-prive.html` | UX-P1-03 | 2026-10-03 | Will |
| Notifications | `notifications.html` | UX-P1-08 · UX-P1-54 | 2026-10-03 | Will |

### Séance de validation W20 (confirmation par e-mail)

Quatre maquettes, à valider ensemble avant toute tâche d'écran W20 (UX-P1-40, `docs/chantiers/W20-confirmation-par-email.md` §4) :
`deposer.html` (le formulaire, le message au-dessus du bouton, le décompte des interactions écrit dans la
note de l'état « Formulaire (depuis la carte) », la carte « Annuler / Corriger » et ses suites),
`mes-entreprises.html` (l'état « Les badges de la confirmation »), `confirmation-contact.html` (la page du
contact, de 320 à 414 px) et `file-qualification.html` (l'onglet « À appeler aujourd'hui », qui se valide
avec les maquettes de la console). `deposer.html` et `mes-entreprises.html`, validées le 2026-09-19, ont
changé en substance : leur ligne repart vide.

**Séance du 2026-10-03.** Williams valide les trois maquettes de l'espace de la série dans la même séance :
`deposer.html` (« OUI PARFAIT »), `mes-entreprises.html` (« OUI ») et `confirmation-contact.html` (« OUI »).
`file-qualification.html` n'est PAS validée (« POUR la console d'adminsitration, j'ai l'impression qu'il fait
très veillote et j'aurai aimé plutot un sidebar et que ce soit plus moderne ») : elle se valide avec les
maquettes de la console, refondues par UX-P1-50. La tâche d'écran de la file attend donc sa maquette ; celles
de l'espace ont les leurs.

### Séance de style du 2026-10-03 (UX-P1-49)

Williams, verbatim : « JE TROUVE QU4IL MANQUE UN PEU DE CONTRASTE ET CA fait très textuel non ? ». Un aperçu
AVANT/APRÈS de `index.html` et d'`accueil.html` lui est montré. Sur la version 3, orange en fond, il
répond : « NON C4ETAIT MIEUX JUSTE AVANT ». La version 2 est donc retenue. Le bloc charte des treize maquettes de l'espace prend cette
version, à l'identique :
- terracotta pour l'action, fond ivoire, texte et navigation mocha, bleu pour l'information et le focus ;
- l'issue heureuse en vert ; l'alerte en rouge distinct du terracotta ;
- cartes et encarts cadrés et ombrés.

C'est un changement de STYLE SEUL, demandé par Williams : aucun texte, aucune disposition ne bouge. Les
validations ci-dessus ne sont donc PAS remises à vide.

`mon-contrat.html` reçoit en plus son correctif mobile : à 360 px, aucun défilement horizontal, et les
tableaux de l'annexe passent en cartes sous 640 px.

## Console

| Écran | Fichier | Tâche | Validé le | Par |
| --- | --- | --- | --- | --- |
| File de qualification + fiche 60 s | `file-qualification.html` | UX-P1-07 | 2026-10-03 | Will |
| Lot du mois | `lot-paiement.html` | UX-P2-03 | 2026-10-03 | Will |
| Cadre de la console, instantané par rôle, accueil par rôle et par phase | `console-cadre.html` | UX-P1-16 | 2026-10-03 | Will |
| Accès refusé | `acces-refuse.html` | UX-P1-16 | 2026-10-03 | Will |
| Connexion à la console (lien, code à 6 chiffres, lien déjà utilisé) | `connexion-console.html` | SEC-29 · UX-P1-16 | 2026-10-03 | Will |
| Utilisateurs de la console et « Votre rôle » | `utilisateurs-console.html` | SEC-30 · UX-P1-20 | 2026-10-03 | Will |
| Fiche de qualification (W20 : état de la demande, raisons de vérification) | `fiche-qualification.html` | UX-P1-06 | 2026-10-03 | Will |
| Apporteurs : liste | `apporteurs.html` | UX-P1-12 | 2026-10-03 | Will |
| Fiche apporteur : cinq blocs, décision, dossier de conformité | `apporteur-fiche.html` | UX-P1-12 · CPL-T07 | 2026-10-03 | Will |
| Attributions et contrats | `attributions-contrats.html` | UX-P1-13 | 2026-10-03 | Will |
| Fiche prospect | `fiche-prospect.html` | EXT-T02a | 2026-10-03 | Will |
| Éditeur de grille (modèle, édition en masse, complétude) | `grille-console.html` | UX-P1-14 | 2026-10-03 | Will |
| Saisie manuelle d'une candidature et CV | `saisie-manuelle-console.html` | EXT-T04 | 2026-10-03 | Will |

### Refonte de la console en barre latérale (UX-P1-50)

Williams, verbatim : « POUR la console d'adminsitration, j'ai l'impression qu'il fait très veillote et
j'aurai aimé plutot un sidebar et que ce soit plus moderne ». L'aperçu de `console-cadre.html` en barre
latérale lui a été montré, puis il a été propagé aux treize maquettes de la console, avec une seule marque
pour l'espace et la console (rattrapage 85). Au bureau, la barre latérale groupe les entrées par métier.
Sous 768 px, la barre du bas reste, et son « Menu » ouvre la barre latérale en tiroir (REQ-UX-048). Les
entrées, les rôles, les états et les textes ne changent pas. Aucune ligne de la console n'était validée :
aucune ne repart à vide, et la séance groupée ci-dessous se tient sur cette version.

### Séance du 2026-10-03 : la console validée, en version épurée (UX-P1-52)

Les treize maquettes ont été montrées à Williams dans l'ordre de lecture ci-dessous.
`console-cadre.html`, dans sa version à barre latérale d'avant l'épuration, est validée : « OUI ». La
première `connexion-console.html` est refusée, verbatim :
« JE trouve que ca fait enormement texte avec manque de contraste un peu... on se perd tellement il y a
d'informaitons non ? ».

La console est alors ÉPURÉE :
- l'atelier est replié par défaut, derrière un bouton « États et notes » ;
- l'écran de connexion garde un titre, un champ, un bouton et une phrase d'aide ;
- cartes, tableaux et états vides sont détachés sur fond ivoire ;
- les textes longs sont ramenés à « quoi, puis quoi faire ». Les phrases à valeur contractuelle ou
  juridique ne bougent pas ;
- le refus d'un code reprend le texte unique de la juriste (rattrapage 88) : « Ce code n'est pas
  valable. Demandez un nouveau lien de connexion. »

Réponses de Williams, verbatim :
- sur le style épuré (« Ce style épuré vous convient ? […] ») : « OK », ce qui valide la nouvelle `connexion-console.html` ;
- `acces-refuse.html` : « OUI » ;
- pour les dix autres : « VALIDE TOUS LES ECRANS direcmtent ».

### Séance de validation groupée de la console

**Rapprochement avec `docs/CONSOLE-ROUTES.md` (UX-P1-19).** Chaque écran de console de la phase 1 a sa
maquette ; les deux écarts relevés par UX-P1-19, l'éditeur de grille (`/console/grille`, UX-P1-14) et la
saisie manuelle d'une candidature (`/console/candidatures`, EXT-T04), sont comblés par UX-P1-46 ; la file (UX-P1-07) est `file-qualification.html`, « Votre rôle » (UX-P1-20) est un état de
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
2. Le vocabulaire est-il celui d'un apporteur (« votre entreprise », « ce qui vous revient ») et non
   celui du schéma (« attribution », « prorata », « déclaration non confirmée ») ?
3. Chaque état bloqué dit-il **pourquoi** et **quoi faire** ?
4. Y a-t-il quelque part un objectif, un classement, un compte à rebours de performance ? (Il ne doit
   pas y en avoir : voir les motifs 1 à 3 de la fiche `juriste`.)

## Comment on valide

Ajouter la date et « Will » dans la ligne de l'écran. Les maquettes s'ouvrent depuis `index.html`,
qui porte aussi les chartes de l'espace et de la console (identité, typographie, couleurs et contrastes
mesurés dans les deux thèmes, tailles tactiles, ton). Une modification substantielle de la maquette
**efface** la validation : la ligne repart vide.
