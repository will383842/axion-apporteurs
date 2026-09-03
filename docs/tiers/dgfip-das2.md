# DGFiP — déclaration DAS2 — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation fiscale n'a été lue à cette date**. Ce qui n'est pas établi porte une formule
> d'attente et le nom de qui doit la lever, sur la même ligne. Cette fiche ne porte aucune interprétation
> fiscale.

## 1. Ce que ce tiers fait pour nous

L'administration fiscale reçoit la déclaration annuelle des sommes versées à des tiers. Le produit en
prépare la matière : cumul par bénéficiaire — identifié par son numéro d'établissement — et par année
civile des montants toutes taxes comprises **effectivement versés**, la date retenue étant celle du débit
bancaire des lots rapprochés, et non celle de l'acquisition de la ligne (REQ-ARG-024).

L'export porte, pour chaque bénéficiaire au-dessus du seuil de l'article 240 du code général des impôts,
l'identité, le numéro d'établissement, l'adresse, la nature « commissions » et le montant. Un apporteur
marqué `isTest` en est exclu (REQ-CPL-020).

⚠️ **Le seuil n'a aujourd'hui aucune valeur.** REQ-ARG-024 se termine par « le seuil n'a pas de valeur par
défaut valide » : la source unique de vérité prévue par RM-10 et REQ-JUR-015 existe, mais elle reste
**vide** tant que la valeur, sa source et sa date n'y sont pas posées. Aucun cumul n'est donc calculable, et
la ligne `HYP-D9` du registre — de réversibilité `avenant` — ne fournit pas un défaut mobilisable ici. La
valeur est **à confirmer** par Will, sur avis de l'expert-comptable.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | page de déclaration des honoraires et sommes versées à des tiers du portail fiscal, et cahier des charges du canal de dépôt — adresses exactes **à relever**, non ouvertes à ce jour, par l'expert-comptable, à défaut Will |
| Date de lecture | **à relever** — le lecteur date ici sa lecture : l'expert-comptable, à défaut Will |
| Extrait cité | **à relever** — copié mot pour mot par l'expert-comptable, à défaut Will |
| Exemple officiel | **à relever** — enregistrement d'exemple copié tel quel par l'expert-comptable, à défaut Will |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : le canal de
dépôt admis pour une société de notre taille, le format de fichier attendu, la structure d'un enregistrement
de bénéficiaire, et l'échéance de dépôt de l'exercice.

## 3. Données qui lui sont confiées

Identité, numéro d'établissement, adresse et montant cumulé versé, par bénéficiaire et par année. Ce sont
des données d'identification professionnelle transmises en exécution d'une obligation légale, non un partage
à notre initiative.

## 4. Quotas et limites

Aucun quota : le dépôt est annuel. La seule limite est l'**échéance de dépôt** de l'exercice concerné,
**à confirmer** par l'expert-comptable, à défaut Will.

Ce que **nous** garantissons de notre côté : le cumul est calculé sur les sommes effectivement versées et
non sur les sommes acquises ; un test de frontière encadre le seuil, dans les deux sens (REQ-ARG-024,
REQ-JUR-015) — il ne peut être écrit qu'une fois la valeur du seuil posée.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Le canal de dépôt est indisponible | Sans effet sur le produit : l'export est un fichier, conservé, re-déposable. Aucun traitement métier n'attend une réponse de l'administration |
| Le fichier est rejeté au dépôt | Le cumul reste calculable et re-exportable à l'identique. Le rejet est une affaire de format, que la lecture de la rubrique 2 doit prévenir |
| Le seuil de l'exercice change | Il vit dans la source unique de vérité avec sa source et sa date ; le changer est un acte tracé, pas une modification de littéral (RM-10) |
| Le seuil de l'exercice n'est pas posé | État actuel : l'export n'est pas calculable, et c'est une attente, pas une panne |

## 6. Point de contact

- Interne : Will. L'export est réservé au rôle `admin` (REQ-SEC-023).
- Externe : l'expert-comptable s'il y en a un, à défaut le service des impôts des entreprises dont dépend la
  société. Aucune coordonnée n'est écrite ici : le dépôt est public (W13).

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat | sans objet : obligation déclarative légale |
| Sous-traitance (art. 28 RGPD) | sans objet : transmission imposée par la loi, l'administration n'agit pas sur nos instructions. Qualification **à confirmer** par Will si un intermédiaire déclarant est retenu |
| Localisation des données | administration française |
| Périmètre | le cumul ignore les apporteurs marqués `isTest` et les lignes non versées : c'est une contrainte testée, pas un usage |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Canal de dépôt et format attendu | expert-comptable, à défaut Will | premier export annuel |
| Échéance de dépôt de l'exercice | expert-comptable, à défaut Will | clôture du premier exercice commissionné |
| Valeur du seuil de l'exercice, avec sa source et sa date, dans la source unique de vérité | Will, sur avis de l'expert-comptable — REQ-ARG-024 : aucune valeur par défaut n'est valide, la source reste vide tant que la décision n'est pas prise | premier calcul de cumul |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/dgfip-das2.md#2-source-officielle
```

Toute fixture d'export annuel porte ces deux lignes. Tant que la rubrique 2 est vide, la seconde ligne porte
la mention `non confrontée`.
