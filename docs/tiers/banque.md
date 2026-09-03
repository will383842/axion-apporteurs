# Banque réceptrice des virements — fiche tiers

> Livrée par **GOV-015** (REQ-CPL-002, REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier
> interne seul. **La banque n'est pas nommée à ce jour** ; aucune de ses spécifications n'a été lue. Ce qui
> n'est pas établi porte une formule d'attente et le nom de qui doit lever l'attente, sur la même ligne.

## 1. Ce que ce tiers fait pour nous

La banque exécute les virements des lots de paiement approuvés, et rend le relevé qui permet de rapprocher
chaque débit de la ligne qui l'a produit (REQ-ARG-022). C'est le dernier maillon de la chaîne d'argent : ce
qu'elle refuse n'est pas versé, et ce qu'elle exécute rend une ligne `payee`.

Ce qui dépend d'elle : REQ-CPL-002, REQ-CPL-011, REQ-ARG-020, REQ-ARG-021, REQ-ARG-022, REQ-UX-025, la
cohérence d'entité de REQ-CPL-001, la validation du fichier contre le schéma versionné de REQ-QA-029, et
l'alerte de délai de REQ-ARG-034.

### État de REQ-CPL-002 — la disjonction, et de quel côté elle tombe

REQ-CPL-002 est satisfaite si la banque est connue **ou** si la saisie manuelle avec `EndToEndId` est actée.
**C'est la seconde branche qui est vraie aujourd'hui** : `HYP-W2` du registre acte un générateur
`pain.001.001.03` générique et la saisie manuelle avec `EndToEndId`, la banque ne conditionnant que le mois
à blanc de REQ-CPL-011. La ligne est de réversibilité `paramètre` et se tranche « avant armement SEPA ».

La première branche reste donc vide, et elle est écrite ici pour qu'on voie ce qui manque :

| Élément exigé par REQ-CPL-002 | État au 2026-09-03 |
| --- | --- |
| Établissement | **à confirmer** par Will |
| Version du message acceptée | `pain.001.001.03` retenu par défaut (`HYP-W2`) ; variante réellement acceptée **à confirmer** par Will |
| BIC | **à confirmer** par Will |
| Jeu de caractères accepté | jeu SEPA retenu par défaut, translittération des caractères hors jeu (REQ-QA-029) ; règle réelle de l'établissement **à confirmer** par Will |
| Espace de test | **à confirmer** par Will — son existence décide si le mois à blanc de REQ-CPL-011 se joue à vide ou en production |
| Format du relevé importé pour le rapprochement | **à confirmer** par Will |

Tant que ce tableau porte une attente, le produit fonctionne par la seconde branche : le fichier est
produit et conservé, la remise est manuelle, et le rapprochement se fait sur l'identifiant de bout en bout.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | deux sources, aucune ouverte à ce jour : le guide de mise en œuvre du virement SEPA du Conseil européen des paiements, et le guide d'intégration de l'établissement, qui prime — adresses **à relever** par Will, qui nomme d'abord l'établissement (`HYP-W2`) |
| Date de lecture | **à relever** : le guide public par le lecteur désigné par `A01`, le guide d'intégration par Will |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01`, une fois la source ouverte |
| Exemple officiel | **à relever** — fichier d'exemple fourni par l'établissement, collé tel quel, par Will |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** Tant qu'elle l'est, aucune fixture de
format bancaire n'est confrontée à autre chose qu'à notre propre spécification : elle porte alors la mention
`non confrontée` prévue en rubrique 9, et la branche `HYP-W2` qui la rend générique.

Le schéma XSD ISO 20022 est, lui, **versionné dans le dépôt** et le fichier généré est validé contre lui en
intégration continue (REQ-QA-029). Un fichier valide au regard du schéma peut néanmoins être refusé par un
établissement : c'est ce que la lecture du guide d'intégration doit lever, et c'est la raison d'être de
cette fiche.

## 3. Données qui lui sont confiées

- L'identifiant bancaire de chaque apporteur bénéficiaire et le nom de son titulaire.
- Le montant à verser, solde toutes taxes comprises du relevé.
- L'identifiant de bout en bout : préfixe `AP` suivi de l'identifiant du relevé, trente-cinq caractères au
  plus (REQ-ARG-020).
- La référence libre, qui porte le numéro d'autofacture.
- L'identifiant bancaire débiteur de l'entité contractante. Il est **posé en secret**, jamais dans un
  fichier versionné ni dans une conversation (W1).

Ne lui sont jamais confiées : les coordonnées du tiers rencontré, ni aucune donnée de dépôt. Une ligne
d'apporteur marqué `isTest` n'apparaît jamais dans un fichier de remise (REQ-CPL-020).

## 4. Quotas et limites

Ce que **nous** appliquons : un seul groupe de paiement par fichier, un fichier par lot passé à l'état
exporté ; l'identifiant de bout en bout est posé à l'approbation et unique par ligne ; le fichier est généré
une seule fois, son empreinte est stockée, et tout ré-export rend **les mêmes octets** (REQ-ARG-020) ; une
régénération exige un motif et invalide l'identifiant de message précédent (REQ-UX-025).

Les limites de l'établissement — nombre de virements par remise, montant unitaire ou cumulé, horaires de
coupure, canal de dépôt — sont **à confirmer** par Will, avant le premier fichier de remise.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| Le drapeau `SEPA_EXPORT_ENABLED` est fermé | Aucun fichier n'est remis. Le lot suit sa machine d'états, l'indicateur de délai mesure quand même, et l'alerte de REQ-ARG-034 se lève quand même : le produit ne confond jamais « pas encore armé » et « à l'heure » |
| La banque refuse le fichier | Le lot ne franchit pas l'état exporté et rien ne passe `payee`. La régénération exige un motif ; l'identifiant de message précédent est invalidé, ce qui interdit une double remise (REQ-UX-025) |
| Le service bancaire est indisponible | Le versement est différé, pas perdu. Le compteur de REQ-ARG-034 continue de courir : une panne bancaire ne suspend ni le délai contractuel ni l'alerte |
| Un virement revient | Le relevé passe `rejete`, ses lignes redeviennent relevables **sans nouvelle autofacture**, et la pièce bancaire de l'apporteur repasse `a_verifier` (REQ-ARG-022) |
| Le relevé importé ne rapproche pas par l'identifiant de bout en bout | Repli documenté : rapprochement par montant exact, identifiant bancaire et date à trois jours près, **avec confirmation humaine** (REQ-ARG-022) |

Le repli global, tant que la banque n'est pas nommée : la remise est **manuelle**, et l'identifiant de bout
en bout reste la clé de rapprochement (`HYP-W2`).

## 6. Point de contact

- Interne : Will, seul titulaire des accès bancaires et seul à armer le drapeau de remise, sous
  authentification renforcée et journal chaîné (REQ-SEC-023).
- Externe : le conseiller de l'établissement, **à nommer** ici par son rôle par Will une fois la banque
  choisie — jamais par une coordonnée nominative, le dépôt est public (W13).

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat | Convention de compte de la société. Établissement **à confirmer** par Will |
| Sous-traitance (art. 28 RGPD) | La banque exécute une obligation qui lui est propre et n'agit pas sur nos instructions au sens de l'article 28. Cette qualification est **à confirmer** par Will ; la fiche ne la présume pas |
| Localisation des données | **à confirmer** par Will, avant la première remise réelle |
| Cohérence de l'entité | Contrat, mandat d'autofacturation et fichier de remise portent le même numéro d'identification et le même identifiant bancaire débiteur ; un test compare les trois fixtures (REQ-CPL-001). Il ne peut être écrit qu'une fois l'identifiant débiteur posé en secret |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Nom de l'établissement, BIC, variante du message acceptée | Will | armement SEPA (`HYP-W2`) |
| Jeu de caractères et règle de translittération de l'établissement | Will | mois à blanc (REQ-CPL-011) |
| Existence d'un espace de test | Will | mois à blanc (REQ-CPL-011) |
| Format du relevé importé | Will | le rapprochement de REQ-ARG-022 |
| Identifiant bancaire débiteur, posé en secret | Will | premier fichier de remise |
| Localisation des données de l'établissement | Will | première remise réelle |
| Les quatre éléments de la rubrique 2 | Will pour le guide de l'établissement ; `A01` répartit la lecture du guide public | avant qu'une fixture de format bancaire cesse d'être `non confrontée` |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/banque.md#2-source-officielle
```

Toute fixture de fichier de remise, tout jeu de caractères de translittération et toute fixture de relevé
importé portent ces deux lignes. Tant que la rubrique 2 est vide, la seconde ligne se lit
`Confronte-a: docs/tiers/banque.md#2-source-officielle (non confrontée)` : la fixture dit alors qu'elle est
**générique**, adossée à la branche `HYP-W2`, et non validée par un établissement.
