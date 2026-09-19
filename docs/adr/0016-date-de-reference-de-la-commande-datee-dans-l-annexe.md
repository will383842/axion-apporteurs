# partners/ADR-0016 — La date de référence d'une commande : l'arbitrage du 2026-09-03 daté dans l'annexe des fusions

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-19 |
| **Décideur** | `architecte` — cet ADR est `propose` : il consigne un arbitrage que Will a rendu le 2026-09-03 (M-10, contrat art. 4.4), il n'en prend aucun |
| **Tâche** | — aucune tâche ouverte ne porte la résorption des dettes de texte décidé ; la dette avait été déclarée par GOV-039 |
| **Exigences servies** | REQ-DM-022, REQ-QA-014 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

> ⚠️ **Numéro provisoire.** `0014` est le plus petit numéro libre sur `main` au 2026-09-19. Deux
> branches ouvertes en portent déjà un `0014` (`t/dm-01`, `t/cpl-t13`) : le numéro se fixe à
> l'atterrissage, et le renvoi de `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` suit le renumérotage.

## Contexte

`docs/REQUIREMENTS-ANNEXE-FUSIONS.md` consigne la fusion qui garde REQ-DM-022 et absorbe REQ-ARG-009.
Son texte décidé posait `dateRef = devis.acceptedAt` : la date de référence d'une ligne était la date
de signature du **devis**, avec repli sur la date d'émission de la facture.

Le même jour, 2026-09-03, la synthèse des examens a réécrit l'article 4.4 du contrat (arbitrage M-10) :
la commande est le devis, le bon de commande **ou** la convention de formation signé par l'entreprise
attribuée, et la date retenue est celle de cette signature, à défaut celle de la première facture.
Le champ `texte` de REQ-DM-022 porte cet arbitrage, et le cite dans sa `source`. L'annexe, elle, n'a
jamais été datée : elle portait encore l'ancienne formule.

La garde `gov:requirements` (famille `texte_decide_perdu`, livrée par GOV-039) exige que le texte
survivant reprenne chaque marqueur du texte décidé. Elle lisait donc l'ancienne formule comme une
clause perdue, et la perte était déclarée en dette dans `DETTE_TEXTE_DECIDE`. Or réinsérer
`dateRef = devis.acceptedAt` dans REQ-DM-022 aurait réécrit, dans le texte appliqué, une règle d'argent
que Will avait remplacée : une commande signée par bon de commande ou par convention de formation
aurait perdu sa date de référence.

Par la ligne 14 de `docs/PRESEANCE.md` §2, c'est le registre qui prévaut sur l'annexe. Ici, c'est donc
l'**annexe** qui était périmée, pas le registre.

## Décision

La puce de fusion de REQ-DM-022 dans `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` porte la correction du
2026-09-03, M-10, **datée en ligne** sur le modèle des corrections A-2, A-4 et A-5 déjà présentes dans
la même annexe. La formule d'origine y reste lisible, hors code, pour que l'historique de l'arbitrage
ne se perde pas.

Le texte décidé porte désormais `dateRef` (date de signature de la commande), son repli
`facture.emiseAt` et `prevue`. Ce sont les marqueurs que REQ-DM-022 reprend déjà : aucune ligne du
registre n'est réécrite.

La dette `REQ-DM-022 / dateRef = devis.acceptedAt` sort de `DETTE_TEXTE_DECIDE`. La garde l'exige :
une dette qui ne correspond plus à aucune clause décidée de l'annexe fait refuser
`dette_texte_decide_perimee`.

Cet ADR ne décide rien : l'arbitrage M-10 est celui de Will, le 2026-09-03. Il consigne seulement que
l'annexe le porte désormais.

## Conséquences

La garde confronte REQ-DM-022 au texte décidé **en vigueur** : si la définition de la commande se perd
de nouveau du champ `texte`, elle rougit en `texte_decide_perdu`, sans dette qui l'excuse.

Le renvoi à cet ADR vit dans une puce de l'annexe que `gov:adr` juge : un renumérotage à
l'atterrissage doit renommer ce fichier **et** corriger la puce, sinon `gov:adr` refuse un renvoi vers
un ADR absent.

Retour arrière : rendre à la puce la formule d'origine et redéclarer la dette. Coût : une règle
d'argent remplacée redevient, pour la garde, le texte « décidé ».

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Réinsérer la formule d'origine dans REQ-DM-022 | Elle contredit l'article 4.4 réécrit : le bon de commande et la convention de formation perdraient leur date de référence. |
| Garder la dette déclarée, sans rien dater | La dette affirmerait une clause perdue qui a en réalité été remplacée : elle ferait croire à un manque, et le vrai arbitrage resterait invisible depuis l'annexe. |
| Retirer la puce de fusion de l'annexe | La fusion reste vraie (REQ-ARG-009 est absorbée) ; la retirer ferait diverger le compte déclaré de l'annexe et tairait l'arbitrage. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/titres-de-test-resolvent.spec.ts` ·
  `it('REQ-QA-014 — le dépôt RÉEL : aucune clause décidée perdue qui ne soit déclarée en dette')` :
  si REQ-DM-022 perd `dateRef` ou `facture.emiseAt`, ce test rougit.
- **Assertion** — `tests/unit/gouvernance/titres-de-test-resolvent.spec.ts` ·
  `it('REQ-QA-014 — et aucune dette PÉRIMÉE : une clause redevenue présente doit être RETIRÉE du registre des dettes')` :
  si la dette de REQ-DM-022 revient dans `DETTE_TEXTE_DECIDE`, ce test rougit.

## Reste à faire

- Passage à `accepte` par l'`architecte`.
- **REQ-DM-015** : sa dette `scale` reste déclarée. L'arbitrage A-2 du 2026-09-03 concerne le forfait
  (`flat`), que l'annexe porte déjà en ligne, et non la clause `scale`. Il n'y a donc aucun arbitrage
  postérieur à dater : restaurer la clause, ou non, revient à Will.
