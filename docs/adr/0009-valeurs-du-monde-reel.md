# partners/ADR-0009 — Une valeur que seul Will connaît est une CONFIGURATION, pas un blocage de plan

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-04 |
| **Décideur** | `architecte` |
| **Tâche** | CPL-T01 |
| **Exigences servies** | REQ-GOV-031, REQ-CPL-001 |
| **Décisions du registre citées** | W1, W2, W3, W4, W9, W11 |
| **Règle maison appliquée** | RM-01 |
| **Remplace / remplacé par** | — |

## Contexte

`CPL-T01` est en phase −1, au statut `attente_externe`, porteuse de `W1` (entité contractante) et
`W9` (prolongation de la fenêtre d'attribution). Elle bloque `JUR-T01`, `JUR-T01b`, `JUR-T01c` et
`T-ARG-018` en aval direct.

Ce blocage n'est pas local. Une garde de phase refuse toute PR d'une phase ultérieure tant que la
phase courante n'est pas close : **tant que `CPL-T01` reste ouverte, la phase −1 ne se clôt pas, et
les 171 tâches des phases 0 à 3 — 135,5 j sur 149 — sont inatteignables.** Une seule ligne de
backlog gèle 91 % du chantier.

Deux faits mesurés le 2026-09-04 :

1. **`W1` n'a pas de valeur devinable, et le dépôt le prouve.** Un relevé sur `axionia/src` et
   `axionia/docs` rend **deux** entités en concurrence — `Axion-IA SAS` (135 occurrences) et
   `Axion-IA OÜ` (35). Les seuls numéros de TVA présents sont des gabarits (`FR12123456789`,
   `FR99999999999`, `FR76123456789`…). Choisir entre une SAS française et une OÜ estonienne pour
   contracter avec des apporteurs français engage la TVA, la DAS2, l'attestation de vigilance
   URSSAF et le droit applicable. Ce n'est pas un arbitrage de conception : c'est un fait
   d'organisation.
2. **Le dépôt voisin résout déjà exactement ce problème.** `axionia` construit ses images sans base
   de données ni Redis grâce à une **valeur sentinelle**, `stub.invalid`, reconnue au niveau des
   singletons `prisma.ts` et `redis.ts` (`axionia/AGENTS.md`, ADR 0026). Le build n'attend pas la
   production : il s'exécute contre une valeur qui se déclare fausse.

La confusion à défaire : `attente_externe` a été posé sur `CPL-T01` comme si **écrire le code**
dépendait de la valeur. C'est faux. Seule la **mise en service** en dépend.

## Décision

**1. Les valeurs que seul Will peut fournir deviennent une configuration à sentinelle, et cessent
d'être un état de tâche.**

Un registre unique, `config/entite.json`, porte `W1` (dénomination, forme, SIREN, TVA, siège),
`W2` (IBAN et BIC débiteurs), `W3` (domaine) et `W4` (têtes de réseau). Chaque champ non renseigné
vaut la sentinelle **`A-RENSEIGNER`**, littérale et cherchable — jamais une chaîne vide, jamais
`null`, jamais un exemple plausible. Une valeur d'exemple est le seul remplissage interdit : un
`FR12123456789` oublié dans un contrat signé ne se distingue pas d'une vraie valeur.

**2. Aucun code ne recopie ces valeurs.** Contrat, mandat d'autofacturation, fichier SEPA, export
DAS2 et mentions légales les lisent tous depuis ce registre (RM-01). Le SIREN du contrat, celui du
mandat et celui du fichier SEPA sont donc le même octet, ce qui était déjà l'exigence de `W1`.

**3. Une garde tient la frontière — c'est elle qui rend la sentinelle sûre.**
`gov:entite` refuse la mise en service tant qu'un champ vaut `A-RENSEIGNER`, et elle est appelée
partout où une valeur quitte le dépôt : émission d'un contrat DocuSeal, génération d'un mandat,
écriture d'un fichier SEPA, export DAS2. En revanche elle **n'empêche ni le build, ni les tests, ni
le développement** : les phases 0 à 3 se codent et se prouvent contre la sentinelle.

La garde porte son témoin et son contre-témoin : un champ à `A-RENSEIGNER` la fait rougir sur
chacun des quatre points de sortie ; un registre complet la laisse verte. Sans le contre-témoin,
une garde qui rougit toujours finirait désarmée — c'est LEC-13.

**4. `CPL-T01` cesse d'être `attente_externe` et devient une tâche de code**, livrable
immédiatement : le registre, ses lecteurs, la garde, ses deux témoins. Ce qui reste à Will n'est
plus une décision qui bloque, mais **quatre valeurs à saisir**, le jour du premier contrat réel.

**5. `W9` est tranchée ici : la fenêtre d'attribution est prolongée jusqu'au terme du devis en
cours, plafonnée à trois mois.**

`W9` est une clause `avenant` — la changer après le premier envoi DocuSeal impose une campagne de
re-signature à tout le réseau. Elle devait donc être tranchée avant, et elle l'est.

La règle du registre veut qu'entre une option avantageuse mais discutable et une option neutre et
incontestable, on prenne la seconde. Appliquée ici, elle **retient** la prolongation, et non
l'inverse : sans elle, la Société aurait un intérêt mécanique à laisser une négociation dépasser le
terme des douze mois pour ne pas devoir la commission. C'est exactement le genre de clause qu'un
juge retourne contre son rédacteur. La prolongation est donc la branche *incontestable*.

Elle est neutre au regard de la requalification, et c'est ce qui permet de la retenir : elle
n'institue aucun mandat, aucun objectif, aucun quota, aucun compte rendu d'activité. Elle se
déclenche sur un **fait objectif et daté** — un devis émis avant l'expiration — jamais sur une
appréciation de l'activité de l'apporteur. Voir `ANTI-REQUALIFICATION.md` §2.

## Conséquences

- La phase −1 peut se clore. Les 171 tâches restantes redeviennent atteignables.
- `JUR-T01b` (contrat v1 arrêté) et `JUR-T01c` (mandat d'autofacturation) restent `attente_externe`
  en **phase 1** : ils ne bloquent plus la phase −1 ni la phase 0. Le même patron leur sera
  appliqué le moment venu — le gabarit se code, la valeur se saisit.
- Risque assumé : un développeur pourrait prendre `A-RENSEIGNER` pour une valeur valide. C'est ce
  que la garde interdit, et c'est pourquoi la sentinelle est un mot français en majuscules plutôt
  qu'une chaîne d'apparence technique.
- ⛔ **Ce qui reste à Will, et qui n'est plus bloquant** : quatre valeurs à saisir dans
  `config/entite.json` avant le premier contrat réel — l'entité (SAS ou OÜ), l'IBAN débiteur, le
  domaine, les têtes de réseau.
