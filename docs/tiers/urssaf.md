# URSSAF — attestation de vigilance — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune page du portail n'a été lue à cette date**. Ce qui n'est pas établi porte une formule d'attente
> et le nom de qui doit la lever, sur la même ligne.

## 1. Ce que ce tiers fait pour nous

L'apporteur remet une attestation de vigilance ; l'organisme permet d'en vérifier l'authenticité au moyen du
code de sécurité qu'elle porte. Le produit enregistre ce code et le résultat de la vérification, et calcule
`valideJusquAu` à six mois de la date de l'attestation, avec un rappel quinze jours avant l'échéance
(REQ-ARG-025).

La vérification a une conséquence d'argent : un relevé passe bloqué, motif `vigilance_perimee`, avant
numérotation, lorsque le cumul atteint le seuil légal des articles L.8222-1 et D.8222-5 du code du travail
— seuil porté par la source unique de vérité, avec sa source et sa date (RM-10) — et qu'aucune attestation
valide n'existe. **Sous ce seuil, l'absence d'attestation ne diffère aucun versement** et lève seulement une
alerte de console (REQ-ARG-016, REQ-ARG-025).

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | page de vérification d'une attestation de vigilance du portail de l'organisme — adresse exacte **à relever**, non ouverte à ce jour, par le lecteur désigné par `A01` |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — résultat de vérification d'exemple copié tel quel par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot : la forme du
code de sécurité, la durée de validité annoncée de l'attestation, et la formulation exacte du résultat de
vérification. La durée de six mois retenue par le produit doit être confrontée à cette source, et non à
notre propre spécification (RM-08).

## 3. Données qui lui sont confiées

Le numéro d'identification de l'apporteur et le code de sécurité figurant sur l'attestation qu'il a lui-même
remise. Rien d'autre : ni coordonnées, ni montants, ni données de dépôt.

Côté Partners, l'attestation est une pièce du dossier de conformité (`PieceKyc` de type `vigilance`), avec
une échéance obligatoire (REQ-DM-027) et une purge de son fichier.

## 4. Quotas et limites

La vérification est **manuelle** et ponctuelle : elle a lieu à la remise de la pièce, puis à chaque
renouvellement. Aucun appel automatisé n'est acté à ce jour. L'existence d'une voie automatisée et ses
quotas sont **à confirmer** par Will, avant toute automatisation du contrôle ; en son absence, la limite est
celle du travail humain du rôle qui vérifie.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Le portail est indisponible au moment de la vérification | La pièce reste `a_verifier`. Elle n'est ni `valide` ni `refusee` : une indisponibilité ne produit jamais un verdict |
| L'indisponibilité se prolonge | Sous le seuil légal, **aucun versement n'est différé de ce fait** ; au-dessus, le relevé est bloqué avec un motif visible par l'apporteur. La règle est la même que le portail réponde ou non : c'est la loi qui commande, pas la disponibilité du service |
| Une attestation périmée n'est pas renouvelée | Rappel quinze jours avant l'échéance, puis alerte de console. L'attestation de responsabilité civile professionnelle, elle, ne bloque **aucun** versement (REQ-DM-027) : ne pas confondre les deux pièces |

## 6. Point de contact

- Interne : rôle `comptable` pour la vérification et le suivi des échéances ; Will pour toute question
  d'interprétation.
- Externe : canal de l'organisme **à relever** par le lecteur désigné par `A01` à la première lecture,
  consigné comme procédure.

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat | aucun : service public de vérification |
| Sous-traitance (art. 28 RGPD) | sans objet en l'état : nous vérifions une pièce que l'apporteur nous remet, nous ne confions aucun traitement. Qualification **à confirmer** par Will ; la fiche ne la présume pas |
| Localisation des données | service public français |
| Base contractuelle côté apporteur | article 6.4 du gabarit de contrat et clause `CL-VIGILANCE` (REQ-JUR-003) |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Adresse exacte de la page de vérification et forme du code de sécurité | `A01` répartit ; le lecteur date sa lecture dans la fiche | première vérification réelle |
| Durée de validité annoncée, confrontée aux six mois retenus | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant l'écriture du calcul de `valideJusquAu` |
| Existence d'une voie de vérification automatisée | Will | avant toute automatisation du contrôle |
| Qualification au regard de l'article 28 | Will | première vérification réelle |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/urssaf.md#2-source-officielle
```

Toute fixture d'attestation ou de résultat de vérification porte ces deux lignes. Tant que la rubrique 2 est
vide, la seconde ligne porte la mention `non confrontée`.
