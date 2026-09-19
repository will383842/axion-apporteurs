# partners/ADR-0016 — Deux arbitrages du 2026-09-03 datés dans l'annexe des fusions : la date de référence d'une commande et les trois contrôles de versement

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-19 |
| **Décideur** | `architecte` — cet ADR est `propose` : il consigne deux arbitrages que Will a rendus le 2026-09-03 (M-10, contrat art. 4.4 ; A-4 et A-5, art. 5.4 réécrit), il n'en prend aucun |
| **Tâche** | — aucune tâche ouverte ne porte la résorption des dettes de texte décidé ; la dette avait été déclarée par GOV-039 |
| **Exigences servies** | REQ-DM-022, REQ-ARG-016, REQ-QA-014 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

> ⚠️ **Numéro.** Au 2026-09-19, `main` porte `0014` (PR 78) et `0015` (PR 75) : cet ADR prend donc
> `0016`. S'il devait encore changer à l'atterrissage, les deux renvois de
> `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` et celui de `scripts/gates/gov-requirements.ts` suivent le
> renumérotage.

## Contexte

`docs/REQUIREMENTS-ANNEXE-FUSIONS.md` consigne les fusions du registre, chacune avec son texte
décidé. La garde `gov:requirements` (famille `texte_decide_perdu`, livrée par GOV-039) exige que le
texte survivant reprenne chaque marqueur de ce texte décidé ; une perte non reprise se déclarait dans
`DETTE_TEXTE_DECIDE`. Le 2026-09-19, sur décision de Will, 23 des 25 clauses déclarées ont été remises
dans le registre. Deux ne pouvaient pas l'être, parce que l'annexe n'avait jamais reçu un arbitrage
rendu **le même jour** que les fusions, et que le registre, lui, porte :

1. **REQ-DM-022, la date de référence d'une commande.** L'annexe posait `dateRef = devis.acceptedAt` :
   la date de signature du seul **devis**. L'arbitrage M-10 du 2026-09-03 a réécrit l'article 4.4 du
   contrat : la commande est le devis, le bon de commande **ou** la convention de formation signé, et
   la date retenue est celle de cette signature, à défaut celle de la première facture. Réinsérer
   l'ancienne formule priverait le bon de commande et la convention de leur date de référence.
2. **REQ-ARG-016, les contrôles de versement.** L'annexe gardait « contrat `signe` » et le régime TVA
   déclaré parmi les contrôles bloquants. Les arbitrages A-4 et A-5 du 2026-09-03, sur l'article 5.4
   réécrit, les ramènent à **trois, et trois seulement** — SIREN actif, coordonnées bancaires au nom
   de l'apporteur, attestation de vigilance au seuil légal — ; le régime TVA ne sert qu'à émettre une
   autofacture, et le mandat manquant ne bloque plus rien. Remettre le contrat signé comme quatrième
   contrôle contredirait le texte appliqué.

Par la ligne 14 de `docs/PRESEANCE.md` §2, c'est le registre qui prévaut sur l'annexe. Dans ces deux
cas, c'est donc l'**annexe** qui était périmée, pas le registre.

## Décision

Les deux puces de fusion portent la correction du 2026-09-03 **datée en ligne**, sur le modèle des
corrections A-2, A-4 et A-5 déjà présentes dans la même annexe. La formule d'origine y reste lisible,
hors code, pour que l'historique de l'arbitrage ne se perde pas.

- La puce de REQ-DM-022 porte désormais `dateRef` (date de signature de la commande), son repli
  `facture.emiseAt` et `prevue` — les marqueurs que REQ-DM-022 reprend déjà.
- La puce de REQ-ARG-016 porte les trois contrôles, `piecesBloquantPaiement`, `mandat_non_signe`
  retiré de `MotifBlocage`, `valide`, `bloque` et `a_payer` — les marqueurs que REQ-ARG-016 reprend
  déjà. Le contrat signé n'y est plus un marqueur.

Aucune ligne du registre des exigences n'est réécrite par cet ADR. Les dettes
`REQ-DM-022 / dateRef = devis.acceptedAt` et `REQ-ARG-016 / signe` sortent de `DETTE_TEXTE_DECIDE`,
qui devient **vide** ; la garde l'exige, puisqu'une dette qui ne correspond plus à aucune clause
décidée de l'annexe fait refuser `dette_texte_decide_perimee`.

Cet ADR ne décide rien : les arbitrages M-10, A-4 et A-5 sont ceux de Will, le 2026-09-03. Il
consigne seulement que l'annexe les porte désormais.

## Conséquences

La garde confronte REQ-DM-022 et REQ-ARG-016 au texte décidé **en vigueur** : si l'un des deux perd un
marqueur de son champ `texte`, elle rougit en `texte_decide_perdu`, sans dette qui l'excuse.

Le registre des dettes étant vide, la famille `dette_texte_decide_perimee` ne peut plus être amenée au
binaire par une donnée : ses témoins passent une dette fabriquée par le paramètre `dettes` de
`controler()` et de `modeNormal()`, dont la valeur par défaut reste le registre.

Le renvoi à cet ADR vit dans deux puces de l'annexe que `gov:adr` juge : un renumérotage à
l'atterrissage doit renommer ce fichier **et** corriger les deux puces, sinon `gov:adr` refuse un
renvoi vers un ADR absent.

Retour arrière : rendre aux puces leur formule d'origine et redéclarer les deux dettes. Coût : deux
règles d'argent remplacées redeviennent, pour la garde, le texte « décidé ».

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Réinsérer les formules d'origine dans REQ-DM-022 et REQ-ARG-016 | Elles contredisent les articles 4.4 et 5.4 réécrits : la commande se réduirait au devis, et le contrat signé redeviendrait un quatrième contrôle bloquant. |
| Garder les deux dettes déclarées, sans rien dater | Elles affirmeraient deux clauses perdues qui ont en réalité été remplacées : elles feraient croire à un manque, et le vrai arbitrage resterait invisible depuis l'annexe. |
| Retirer les deux puces de fusion de l'annexe | Les fusions restent vraies (REQ-ARG-009 et REQ-JUR-018 sont absorbées) ; les retirer ferait diverger le compte déclaré de l'annexe et tairait l'arbitrage. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/titres-de-test-resolvent.spec.ts` ·
  `it('REQ-QA-014 — le dépôt RÉEL : aucune clause décidée perdue qui ne soit déclarée en dette')` :
  si REQ-DM-022 ou REQ-ARG-016 perd un marqueur du texte décidé, ce test rougit.
- **Assertion** — `tests/unit/gouvernance/titres-de-test-resolvent.spec.ts` ·
  `it('REQ-QA-014 — le registre réel des dettes est RÉSORBÉ : zéro clause décidée déclarée perdue')` :
  si une dette revient dans `DETTE_TEXTE_DECIDE`, ce test rougit.

## Reste à faire

- Passage à `accepte` par l'`architecte`.
