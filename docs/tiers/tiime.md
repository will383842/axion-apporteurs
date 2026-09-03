# TIIME — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, REQ-INT-016, RM-08). Rédigée le 2026-09-03 à partir du dossier
> interne seul : **aucune documentation TIIME n'a été lue à cette date**. Ce qui n'est pas établi porte une
> formule d'attente et le nom de qui doit la lever, sur la même ligne.

> ⚠️ **Cette fiche est incomplète par décision manquante, pas par négligence.** Le format d'import
> comptable est la ligne `EXT-2a` du registre, section 1 : elle est **sans valeur par défaut possible**,
> parce que le format dépend de ce que la plateforme accepte et non d'un choix interne. Un format inventé
> ici produirait un export qu'aucun import ne relit. Le propriétaire de la décision est l'expert-comptable,
> à défaut Will.

## 1. Ce que ce tiers fait pour nous

La plateforme comptable reçoit les écritures produites par Partners (REQ-ARG-023) :

- par autofacture, une pièce au compte 6222 pour le montant hors taxes, une pièce au compte 44566 pour la
  taxe si elle est due, en contrepartie du compte 401 auxiliaire de l'apporteur pour le montant toutes
  taxes comprises, datée de l'autofacture ;
- par règlement rapproché, une pièce 401 contre 512, datée de la banque ;
- chaque pièce est équilibrée, et c'est une propriété testée avant tout export.

REQ-INT-016 exige que le format soit décrit **ici**, avec un exemple officiel, et qu'un test valide l'export
contre cet exemple. Tant que la rubrique 2 est vide, ce test ne peut pas exister.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | documentation d'import de la plateforme — **à confirmer** par l'expert-comptable, à défaut Will : la voie d'import n'est pas choisie (`EXT-2a`) |
| Date de lecture | **à relever** — le lecteur date ici sa lecture : l'expert-comptable, à défaut Will |
| Extrait cité | **à relever** — copié mot pour mot par l'expert-comptable, à défaut Will |
| Exemple officiel | **à relever** — fichier d'exemple fourni par la plateforme, collé tel quel, par l'expert-comptable, à défaut Will |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche — ici, elle est bloquée en amont par
`EXT-2a`.** Ce qui devra y figurer : le nom de la voie retenue parmi celles que la plateforme propose, la
structure d'un enregistrement, le codage des caractères, le séparateur et la forme des dates s'il s'agit
d'un fichier, et **un fichier d'exemple fourni par la plateforme** — pas un fichier que nous aurions
produit.

## 3. Données qui lui sont confiées

Identité et numéro d'établissement de l'apporteur en tant que compte auxiliaire, numéro et date
d'autofacture, montants hors taxes, taxe et toutes taxes comprises, dates de règlement.

Ne lui sont jamais confiées : les coordonnées du tiers rencontré, les identifiants bancaires, les pièces du
dossier de conformité.

## 4. Quotas et limites

Inconnus, et indissociables de la voie d'import retenue : un dépôt de fichier périodique et une interface
programmable n'ont ni la même limite, ni le même mode de panne. **À confirmer** par l'expert-comptable, à
défaut Will, avec la décision `EXT-2a`.

Ce que **nous** garantissons : l'export est déterministe et rejouable ; un même arrêté ré-exporté rend le
même contenu.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| L'import échoue ou la plateforme est indisponible | Sans effet sur la chaîne d'argent : l'export est un fichier produit et conservé, ré-importable au retour. Ni le calcul, ni le relevé, ni le versement n'attendent la comptabilité |
| Le format change chez le tiers | L'export devient invalide en silence — c'est le risque propre à ce tiers. La parade est le test de REQ-INT-016 contre l'exemple officiel : sans lui, un changement de format se découvre à la clôture |
| La voie d'import n'est pas choisie | État actuel. L'export n'est pas écrit ; il attend `EXT-2a` |

## 6. Point de contact

- Interne : rôle `comptable` pour l'export, Will pour la relation avec la plateforme.
- Externe : l'expert-comptable s'il y en a un — le registre rappelle qu'il n'y en a pas nécessairement, et
  qu'à défaut les décisions reviennent à Will.

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat / abonnement | **à confirmer** par Will |
| Sous-traitance (art. 28 RGPD) | La plateforme traite pour notre compte des données d'identification d'apporteurs : contrat de sous-traitance nécessaire. Existence et date **à confirmer** par Will |
| Localisation des données | **à confirmer** par Will, avant le premier export réel |
| Durée de conservation chez le tiers | **à confirmer** par Will, avant le premier export réel — elle doit être compatible avec les durées de conservation comptables et avec `retention.ts` |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Voie d'import retenue et format accepté (`EXT-2a`) | expert-comptable, à défaut Will | l'écriture de l'export comptable |
| Fichier d'exemple officiel, collé en rubrique 2 | expert-comptable, à défaut Will | avant le test de REQ-INT-016 |
| Contrat de sous-traitance signé | Will | premier export réel |
| Localisation des données et durée de conservation | Will | premier export réel |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/tiime.md#2-source-officielle
```

REQ-INT-016 rend ces deux lignes obligatoires sur **chaque** fixture d'export comptable. Ici, la mention
`non confrontée` ne suffit pas : aucune fixture d'export ne peut être écrite tant que la rubrique 2 est
vide — l'écrire quand même reviendrait à figer notre propre spécification en preuve, ce que RM-08 interdit.
