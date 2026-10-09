# partners/ADR-0032 — La trace anonymisée des demandes de droits ne garde de ses dates que le mois

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-10-04 |
| **Décideur** | `architecte` — proposé par l'auteur (A05) sous `role:architecte`, d'après la forme d'A02 versée aux rattrapages 108 et 109 et son arbitrage sur #711 (forme (ii)) ; accepté par A02, #711, commentaire 5984256851 (2026-10-04) |
| **Tâche** | DM-68 |
| **Exigences servies** | REQ-JUR-065 |
| **Décisions du registre citées** | — (la troncature est le texte de la juriste, versé au registre des tâches par le rattrapage 108 ; la cinquième date, la voie (a) d'A02 au rattrapage 109 ; la forme (ii), l'arbitrage d'A02 sur #711) |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | amende `partners/ADR-0031` (décisions 5 et 6) : remplace la fonction des déclencheurs `demandes_droits_contact_ajout_seul` et `demandes_droits_contact_troncature` |

## Contexte

`partners/ADR-0031` anonymise la trace d'une demande de droit cinq ans après sa clôture : le lien à
l'attribution s'efface, la ligne reste comme preuve. Mais elle garde ses dates à la milliseconde.
Une date de réception précise, croisée avec un autre registre, peut suffire à retrouver la personne :
la ligne n'est alors anonyme qu'en apparence.

Le texte de la juriste, versé au rattrapage 108, mot pour mot : « À l'anonymisation, dans la même
instruction, les dates de la trace (réception, traitement, prolongation, effacement de la valeur)
sont ramenées au premier jour de leur mois, à minuit UTC ; le gabarit d'ajout seul admet cette
troncature UNE fois, avec l'anonymisation, et rien d'autre. »

La table est en ajout seul. Le gabarit commun `refuser_modification_sauf()` ne connaît que deux
natures, `purge` (vers NULL) et `une_fois` (depuis NULL) : il n'a pas de mode « tronquer ». Remplacer
la fonction d'un déclencheur de protection relève de la famille `journal_desarme` de
`partners:migrations:additive`, qui ne l'absout que par un ADR accepté cité en ligne 1 de la
migration : celui-ci.

Deux formes ont été soumises à A02 : (i) la base VÉRIFIE une troncature faite par la tâche, (ii) la
base FAIT la troncature. A02 a retenu la forme (ii) sur #711 : la troncature devient une GARANTIE de
la base, et non une obligation du code. Une anonymisation écrite par un autre chemin, une console ou
un correctif manuel, ne peut plus laisser une date précise.

## Décision

**1. Une fonction dédiée, sans argument.** `refuser_modification_sauf_droits_contact()` remplace
`refuser_modification_sauf(…)` sur les deux déclencheurs de `demandes_droits_contact`. Son nom
garde le préfixe du gabarit, et chacun de ses refus commence par `refuser_modification_sauf` : les
témoins existants qui attendent ce refus le lisent toujours. Les colonnes sont écrites en dur : la
fonction ne sert qu'à cette table.

**2. Les sept règles d'`partners/ADR-0031` sont conservées, à l'identique.** `traitee_at`, `issue`,
`valeur_purgee_at`, `prolongee_at` et `trace_anonymisee_at` s'écrivent une fois, depuis NULL ;
`valeur_chiffree` et `attribution_id` ne changent que vers NULL. Toute autre colonne modifiée est
refusée. DELETE et TRUNCATE sont refusés.

**3. L'écriture d'anonymisation est celle où `trace_anonymisee_at` passe de NULL à une valeur.**
Dans cette écriture, et dans elle seule, la fonction POSE `recue_at`, `traitee_at`, `prolongee_at`
et `valeur_purgee_at` au début de LEUR PROPRE mois UTC :
`NEW.x := date_trunc('month', OLD.x AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, jamais au fuseau de la
session. Une date NULL reste NULL. La troncature se fait dans la même instruction que
l'anonymisation : aucun appelant ne peut l'oublier.

**4. La cinquième date.** Dans la même écriture, la fonction ramène `trace_anonymisee_at` au début
de SON mois UTC : la trace est datée du premier du mois UTC de l'instant d'anonymisation (voie (a)
d'A02, rattrapage 109). La fonction ne la confronte pas à l'horloge de la base : la tâche reçoit son
instant du lanceur, et ses témoins le simulent.

**5. Une valeur fournie est jugée, jamais écrasée en silence.** Dans l'écriture d'anonymisation, une
valeur FOURNIE pour l'une des quatre dates doit être l'ancienne (la base tronque) ou le début de son
propre mois (déjà tronquée). Toute autre valeur est refusée par un refus nommé, y compris le début
d'un AUTRE mois (condition de la sécurité, rattrapage 109) et une valeur posée sur une date NULL : la
troncature ne déplace jamais une date vers un autre mois.

**6. Le défaut assumé : un déclencheur de protection qui ÉCRIT dans `NEW`.** Il ne fait plus que
refuser : il réécrit la ligne. Le dépôt en a un précédent, `utilisateurs_console_quatre_yeux`, qui
remet la validation à NULL. L'écriture se limite aux cinq dates, et à la seule écriture
d'anonymisation. Les sept règles de la décision 2 sont jugées APRÈS la troncature, sur la ligne
telle qu'elle sera écrite.

**7. Hors de l'écriture d'anonymisation, aucune troncature.** Avant elle, `recue_at` ne change
jamais, et les trois autres dates suivent la seule règle `une_fois`. Après elle, une date tronquée
ne se réécrit pas : `trace_anonymisee_at` n'est plus NULL, l'écriture n'est plus une anonymisation.

**8. L'ordre est préservé.** La troncature est croissante : les CHECK existants tiennent sans
changement (`demandes_droits_contact_prolongation_avant_traitement`, `prolongee_at <= traitee_at` ;
`demandes_droits_contact_valeur_purge_liee`). Les CHECK sont jugés après les déclencheurs `BEFORE`,
donc sur les dates tronquées. Le déclencheur `demandes_droits_contact_horloge` n'agit qu'à
l'INSERT : il ne contredit pas la troncature, qui est un UPDATE.

**9. Aucune fenêtre sans garde.** La fonction est créée d'abord, puis les deux déclencheurs sont
remplacés par `CREATE OR REPLACE TRIGGER`, qui est atomique.

**10. La tâche ne change pas de forme.** `anonymiserLesTracesDesDroits` reste un `updateMany` qui
vide le lien et pose `trace_anonymisee_at` à l'instant du passage ; la base tronque. Le filtre
d'`partners/ADR-0031` est inchangé.

## Conséquences

- Une trace anonymisée ne dit plus que le mois de la réception, du traitement, de la prolongation
  et de l'effacement de la valeur. La preuve du traitement reste : le droit, la donnée visée,
  l'issue, et l'ordre des étapes au mois près.
- La limite des cinq ans se calcule AVANT la troncature, sur les dates exactes : la troncature ne
  change pas l'échéance d'anonymisation.
- Une écriture d'anonymisation relue après coup ne rend pas la valeur qu'elle a fournie pour
  `trace_anonymisee_at` : elle rend son début de mois. Un appelant qui compare doit relire.
- Le gabarit commun n'est pas touché, et aucune autre table ne change.
- Retour arrière : recréer les deux déclencheurs sur `refuser_modification_sauf(…)` avec les sept
  arguments d'`partners/ADR-0031`, puis retirer la fonction dédiée. Les dates déjà tronquées ne se
  restaurent pas : aucune précision ne se réinvente.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Forme (i) : la base vérifie, la tâche tronque | Une troncature obligatoire pour l'appelant reste un geste à ne pas oublier ; la tâche aurait dû quitter l'`updateMany`, et son témoin en processus aurait manqué aux chemins de la tâche. |
| Un mode `tronquer` dans le gabarit commun | Toutes les tables en ajout seul porteraient le risque d'une nature de plus, pour un seul usage. |
| Un second déclencheur qui tronque avant le gabarit | Deux déclencheurs dont l'ordre d'exécution tient au nom : la garantie dépendrait d'un ordre alphabétique. |
| Écraser toute valeur fournie par le début de mois | Un appelant qui fournit une date fausse ne le saurait jamais ; la condition de la sécurité veut un refus. |
| Admettre n'importe quel début de mois | La troncature pourrait déplacer une date vers un autre mois (condition de la sécurité, rattrapage 109). |
| Confronter `trace_anonymisee_at` à `now()` | La tâche reçoit son instant du lanceur ; ses témoins simulent cinq ans d'écart. |
| `DROP TRIGGER` puis `CREATE TRIGGER` | Une fenêtre sans garde entre les deux instructions. |

## Ce qui le vérifie

- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — après l’anonymisation, les cinq dates sont des débuts de mois UTC, et les deux CHECK tiennent')` :
  décisions 3, 4, 8 et 10.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une anonymisation écrite sans troncature est tronquée par la base, dans la même instruction')` :
  décisions 3, 4 et 6.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une demande close le dernier jour du mois à 23 h 30 heure de Paris est tronquée selon son mois UTC')` :
  décision 3.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une valeur qui n’est pas un début de mois UTC est refusée, et le début d’un autre mois aussi')` :
  décision 5.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — à l’anonymisation, une date NULL reste NULL')` : décisions 3 et 5.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une troncature hors de l’écriture d’anonymisation est refusée')` :
  décision 7.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une date tronquée ne se réécrit pas')` : décision 7.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — les deux déclencheurs exécutent la fonction dédiée, remplacés et non doublés')` :
  décisions 1 et 9.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — toute autre modification et DELETE restent refusés, la troncature aussi')` :
  décision 2.

## Reste à faire

Rien.
