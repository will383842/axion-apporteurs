# partners/ADR-0011 — Les listes d'états occupants ont UNE implémentation, et son discriminant est la couverture

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-14 |
| **Décideur** | `architecte` — cet ADR est `propose` : il consigne un arbitrage rendu pendant la relecture de GOV-030, il n'est pas encore accepté |
| **Tâche** | GOV-030 |
| **Exigences servies** | REQ-DM-003 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-06, RM-01, RM-02 |
| **Remplace / remplacé par** | — |

## Contexte

### Deux implémentations, deux verdicts opposés

Deux gardes portaient la famille `liste_litterale_d_etats`, sous le même nom et avec la même liste
dérivée de REQ-DM-003 :

- `scripts/gates/schema-enums.ts` (GOV-006, `partners:schema:enums`), au seuil de TROIS noms d'états
  sur une ligne ;
- `scripts/gates/gov-check.ts`, dans la première rédaction de GOV-030, au seuil de DEUX.

Elles tournaient dans le même job `gate-a` de la CI, et rendaient des verdicts **opposés** sur la
même entrée : la comparaison booléenne à deux états que GOV-006 déclarait légitime — par un
contre-témoin exécutable — était exactement celle que GOV-030 condamnait. Les deux restaient vertes
parce que `src/` ne porte que trois fichiers : la divergence était **silencieuse**. C'est la lentille
`simplicite` qui l'a mesurée.

### La propriété protégée n'est pas un nombre de noms

RM-06 protège une **couverture**. L'en-tête de `src/domain/attribution/etats.ts` le rappelle :
l'index que les documents d'origine proposaient ne couvrait que deux des sept états occupants. Sous
un seuil de trois, cet index passait — c'est-à-dire le défaut exact que la famille existe pour voir.

### Le discriminant par la syntaxe a été proposé, puis réfuté

Une première proposition distinguait « comparaison booléenne légitime » et « énumération littérale
interdite ». Elle a été réfutée en relecture : un verdict qui bascule sur l'opérateur est un oracle.
Il suffirait de réécrire la clause d'index en comparaisons pour verdir la garde, alors que les deux
formes portent la même propriété.

## Décision

1. **La famille `liste_litterale_d_etats` a une seule implémentation** : `scripts/gates/schema-enums.ts`.
   `scripts/gates/gov-check.ts` ne la porte plus, et le dit à chaque exécution.
2. **Le discriminant est la couverture.** Une ligne qui nomme, entre délimiteurs de chaîne, au moins
   deux des états de `ETATS_OCCUPANTS`, hors de la source unique, est rouge — la clause `IN (…)` comme
   la comparaison enchaînée par `||`. Un seul nom n'est pas une énumération. Les sept recopiés en sont
   une, et rougissent aussi (RM-01).
3. **Le prédicat légitime passe par une exemption nommée**, `PORTEURS_LEGITIMES`, dont chaque entrée
   porte son motif et dont chaque exemption a un contre-témoin atteignable dans le périmètre de la
   garde. Jamais par un seuil.
4. **Le contre-témoin qui assérait l'inverse se retourne.** Il quitte `CONTRE_TEMOINS` pour `TEMOINS`.
   Une assertion exécutable devenue fausse ne s'habille pas d'une exemption : elle se déplace là où
   elle redit ce qui est vrai.

## Conséquences

- `partners:schema:enums` balaie `src`, `prisma` et `scripts`, en `.ts`, `.tsx`, `.prisma` et `.sql`.
  Les trois racines que `gov-check.ts` lisait et qu'elle ne lit pas — `messages/`, `docs/adr/`,
  `packages/contracts/` — ne sont gardées par **aucune** garde sur cette famille. `gov-check.ts`
  l'imprime à chaque exécution, sous « Hors famille ».
- En contrepartie, la racine `scripts/` est gardée. Mesuré pendant la relecture : au seuil DEUX, les
  sept lignes fautives du dépôt vivaient toutes dans `gov-check.ts` lui-même ; elles sont parties avec
  la famille, et le seuil DEUX est vert sur le dépôt.
- `schema-enums.ts` s'exempte lui-même : sa fixture et ses témoins sont des listes d'états. Cette
  exemption a son contre-témoin dans `--prove`.
- Retour arrière : remonter le seuil à trois referait passer l'index à deux états, et ferait tomber le
  témoin booléen de `partners:schema:enums --prove`.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Garder les deux implémentations | Deux gardes qui rendent des verdicts opposés sur la même entrée ne peuvent pas être toutes deux prouvées, et leur divergence ne se voit pas. |
| Garder la famille dans `gov-check.ts` et la retirer de GOV-006 | `schema-enums.ts` tient déjà l'égalité de `ETATS_OCCUPANTS` à REQ-DM-003 : la liste et ses copies se jugent au même endroit, et `scripts/` y est lu. |
| Le seuil de TROIS | L'index à deux états passe dessous. |
| « comparaison booléenne légitime, énumération interdite » | Un verdict qui bascule sur l'opérateur est un oracle : la réécriture de la clause suffit à le verdir. |
| Exempter le contre-témoin au lieu de le retourner | Il était une assertion. Devenue fausse, l'exempter garderait en exécutable une affirmation fausse. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/termes-interdits.spec.ts` ·
  `it('REQ-DM-003 : gov:check ne porte PLUS la famille des listes d’états — ni dans FAMILLES, ni au verdict')` :
  réintroduire la famille dans `gov-check.ts` fait rougir ce contrôle.
- **Assertion** — `tests/unit/gouvernance/termes-interdits.spec.ts` ·
  `it('REQ-DM-003 : sur la même entrée, la seule implémentation rougit — la clause IN comme la forme booléenne')` :
  remonter le seuil, ou faire basculer le verdict sur l'opérateur, fait rougir ce contrôle.
- **Assertion** — `tests/unit/gouvernance/glossaire-enums.spec.ts` ·
  `it('liste_litterale_d_etats — la SOURCE unique, elle, a le droit de la porter')` : le contre-témoin
  qui empêche la garde d'interdire la solution qu'elle exige.

## Reste à faire

- Les trois racines que cette famille ne garde pas (`messages/`, `docs/adr/`, `packages/contracts/`) :
  les ajouter à `RACINES_CODE`, ou arbitrer qu'elles n'en ont pas besoin, appartient au
  `gardien-spec`.
- Le passage à `accepte` appartient à l'`architecte`.
