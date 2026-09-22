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

### Deux implémentations possibles, deux verdicts opposés

Sur `main`, `scripts/gates/schema-enums.ts` (GOV-006, `partners:schema:enums`) porte la famille
`liste_litterale_d_etats` au seuil de TROIS noms d'états sur une ligne, et un contre-témoin exécutable y
déclare légitime la comparaison booléenne à deux états.

Le registre prêtait la même famille à la garde des termes interdits, que GOV-030 écrit
(`gov:check` à l'époque ; `gov:termes-interdits` depuis `partners/ADR-0017`). L'y écrire au seuil de DEUX
donnait deux gardes, dans le même job `gate-a`, aux verdicts **opposés** sur la même entrée : la
comparaison que GOV-006 déclare légitime est exactement celle que GOV-030 condamnait. Toutes deux
restaient vertes tant que le code ne porte aucune comparaison de ce genre : la divergence était
**silencieuse**.

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

- `partners:schema:enums` lit tout fichier SUIVI sous `src`, `prisma` et `scripts`, quelle que soit son
  extension : une liste d'extensions échoue ouvert sur celle qu'elle oublie, et les `.js` et `.json`
  suivis sous `scripts/` n'étaient pas lus. La portée tient dans `dansLaPorteeDesEtats` ; la lecture en
  dérive, et `gov-check.ts` en dérive, à chaque exécution, celles de ses racines que la famille ne couvre
  pas (« Hors famille »). Aucune garde n'y tient cette famille. Au seuil DEUX, le dépôt est vert.
- `schema-enums.ts` s'exempte lui-même : sa fixture et ses témoins sont des listes d'états. Cette
  exemption a son contre-témoin dans `--prove`.
- Une ligne est ce que LF termine, CRLF compris. Un texte lu qui porte une autre fin de ligne qu'un
  consommateur coupe (CR seul, U+2028, U+2029) est refusé par `fin_de_ligne_non_lf`, règle
  `finDeLigneEtrangere` que `gov-check.ts` importe.
- Limites de lecture : la garde lit chaque fichier en UTF-8 sans refuser ce qu'elle ne sait pas décoder
  (un fichier UTF-16 sous `scripts/` sort en 0), et un sous-module sous ses racines la fait échouer sur
  une erreur brute, non nommée.
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
  `it('REQ-DM-003 : gov:termes-interdits ne porte PLUS la famille des listes d’états — ni dans FAMILLES, ni au verdict')` :
  réintroduire la famille dans `gov-check.ts` fait rougir ce contrôle.
- **Assertion** — `tests/unit/gouvernance/termes-interdits.spec.ts` ·
  `it('REQ-DM-003 : sa portée est une racine, jamais une extension — et tout fichier de la portée est jugé')` :
  remettre un filtre d'extension dans la portée fait rougir ce contrôle.
- **Assertion** — `tests/unit/gouvernance/termes-interdits.spec.ts` ·
  `it('REQ-DM-003 : sur la même entrée, la seule implémentation rougit — la clause IN comme la forme booléenne')` :
  remonter le seuil, ou faire basculer le verdict sur l'opérateur, fait rougir ce contrôle.
- **Assertion** — `tests/unit/gouvernance/glossaire-enums.spec.ts` ·
  `it('liste_litterale_d_etats — la SOURCE unique, elle, a le droit de la porter')` : le contre-témoin
  qui empêche la garde d'interdire la solution qu'elle exige.

## Amendement — DM-02, 2026-09-19 : l'unité est le GROUPE, et la règle porte sur le code

Mesuré sur la garde de GOV-030 : l'unité « ligne » échouait OUVERT. Une liste d'états écrite sur
plusieurs lignes (`[\n 'provisoire',\n 'active'\n]`), des membres sans guillemets
(`enum X { provisoire, active }`) et une clause SQL coupée (`IN (\n'signee',\n'convertie')`) sortaient
en 0. La décision 2 se lit désormais ainsi :

1. **L'unité de détection est le plus petit groupe parenthésé** (`()`, `[]`, `{}`) après retrait des
   commentaires ; on compte ses membres DIRECTS, chaînes ou identifiants nus. Le groupe rougit s'il
   nomme au moins deux états occupants et si l'ensemble de ses noms d'états n'est pas l'enum
   `EtatAttribution` COMPLET (un `switch` exhaustif sur les treize n'est pas une liste d'occupants).
2. **La règle porte sur le CODE, pas sur les commentaires.** Un commentaire qui cite deux états
   n'implémente rien : il ne rougit plus. Le code écrit à côté de lui, si.
3. **La projection exacte est légitime par RÈGLE, pas par chemin.** Dans `prisma/migrations/**`, et là
   seulement : le `CREATE TYPE "etat_attribution" AS ENUM (…)` aux treize valeurs, et une clause dont la
   liste est EXACTEMENT `clauseEtatsOccupants()`. Aucune exemption de chemin n'est ajoutée à
   `PORTEURS_LEGITIMES`.

Vérifié par `tests/unit/domaine/gardes-de-schema.spec.ts` ·
`it('REQ-JUR-027 → REQ-DM-038 : une liste sur plusieurs lignes rougit')`,
`it('REQ-JUR-027 → REQ-DM-038 : un commentaire qui cite deux états ne rougit plus, le code à côté si')` et
`it('REQ-JUR-027 → REQ-DM-038 : la projection exacte est légitime par RÈGLE — en migration, et là seulement')`.

## Reste à faire

- Les racines de `gov-check.ts` que cette famille ne garde pas (`messages/`, `docs/adr/`,
  `packages/contracts/` à la date de cet ADR) : les ajouter à `RACINES_CODE`, ou arbitrer qu'elles n'en
  ont pas besoin, appartient au `gardien-spec`. Ajoutée, une racine est lue quelle que soit
  l'extension — le JSON de `messages/` compris.
- Le passage à `accepte` appartient à l'`architecte`.
