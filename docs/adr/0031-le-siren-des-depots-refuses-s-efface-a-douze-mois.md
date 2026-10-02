# partners/ADR-0031 — Le SIREN des dépôts refusés s'efface à douze mois, la ligne reste comme trace

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-10-02 |
| **Décideur** | `architecte` — cet ADR consigne la forme (a) arrêtée par A02 au rattrapage 56 ; il passe `accepte` quand A02 l'a relu et accepté, et que ses assertions existent |
| **Tâche** | DM-53 |
| **Exigences servies** | REQ-DM-043, REQ-DM-037 |
| **Décisions du registre citées** | HYP-A02-RETENTION (`depots_refuses` : 12 mois) |
| **Règle maison appliquée** | RM-01, RM-02, RM-10 |
| **Remplace / remplacé par** | amende le déclencheur `depots_refuses_ajout_seul` de la migration `20261002000300_depot_persistance` |

## Contexte

`depots_refuses` garde la trace de chaque dépôt refusé, pour qu'un refus reste contestable
(REQ-DM-043). Sa table est en AJOUT SEUL : branchée sur `refuser_modification_sauf()` SANS
exception, elle garde le SIREN pour toujours.

Or HYP-A02-RETENTION fixe la conservation de `depots_refuses` à douze mois. Et le SIREN d'une
entreprise individuelle est une donnée personnelle (avis d'A07) : le garder sans terme serait une
conservation sans base.

REQ-DM-037 veut des migrations additives. Assouplir une protection ne s'écrit pas par ajout : un
second déclencheur ne lèverait pas le refus du premier, et remplacer un déclencheur de protection
relève de la famille `journal_desarme` de `partners:migrations:additive`. Celle-ci n'absout un tel
remplacement QUE par un ADR accepté : celui-ci.

## Décision

**1. Le SIREN s'efface, la ligne reste.** Douze mois après `refuse_at`
(`DEPOT_REFUSE_SIREN_PURGE_APRES_MOIS`, `src/domain/seuils/retention.ts`, sous HYP-A02-RETENTION),
une tâche planifiée du lanceur (`siren_refuses_purger`) met `siren` à NULL. Le refus reste visible
de l'apporteur, sans SIREN : apporteur, motif, canal et date.

**2. Jamais une empreinte à la place.** Un SIREN a 10⁹ valeurs possibles : son empreinte se
retrouve par force brute, et garder une empreinte reviendrait à garder le SIREN.

**3. Une date de purge, liée au SIREN.** `siren_purge_at` date la purge. Le CHECK
`depots_refuses_siren_purge_liee` (`(siren IS NULL) = (siren_purge_at IS NOT NULL)`) la lie au SIREN :
elle sert d'idempotence et distingue une purge d'un NULL anormal.

**4. Le gabarit reçoit DEUX exceptions, et seulement elles.** Le déclencheur devient
`refuser_modification_sauf('purge:siren', 'une_fois:siren_purge_at')` : le SIREN ne change que vers
NULL, et sa date ne s'écrit qu'une fois. Toute autre modification reste refusée ; DELETE et TRUNCATE
restent refusés, et le déclencheur de troncature est inchangé.

**5. Aucune fenêtre sans garde.** Le remplacement s'écrit `CREATE OR REPLACE TRIGGER` (condition de
la lentille sécurité) : il est atomique.

## Conséquences

- `siren` devient nullable : `depots_refuses_siren_forme` reste vrai sur NULL, et `siren` reste rendu
  à l'apporteur par la couche cloisonnée, NULL une fois purgé ; `sirenPurgeAt` est tue.
- La contestation d'un refus de plus de douze mois ne peut plus s'appuyer sur le SIREN conservé.
  C'est la conséquence voulue de la durée de conservation.
- Retour arrière : recréer le déclencheur sans argument, retirer la contrainte et la colonne, puis
  `SET NOT NULL` sur le SIREN. Il ÉCHOUE dès qu'un SIREN a été purgé : aucune valeur ne s'invente,
  et il faudrait un ADR qui remplace celui-ci.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Une empreinte du SIREN à la place | 10⁹ valeurs : l'empreinte se renverse par force brute. |
| Supprimer la ligne entière à douze mois | La trace du refus disparaîtrait, et la table est en ajout seul : un DELETE serait une seconde exception, plus large. |
| Un second déclencheur qui autorise la purge | Le premier refuserait toujours : un déclencheur ne lève pas le refus d'un autre. |
| `DROP TRIGGER` puis `CREATE TRIGGER` | Une fenêtre sans garde entre les deux instructions ; `CREATE OR REPLACE` l'évite. |

## Ce qui le vérifie

- **Assertion** — `tests/integration/depots-refuses-purge-siren.spec.ts` ·
  `it('REQ-DM-043 : TÉMOINS — sous l’échéance rien ; pile et au-delà, SIREN à NULL, date posée, la ligne reste')` :
  décisions 1 et 3.
- **Assertion** — `tests/integration/depots-refuses-purge-siren.spec.ts` ·
  `it('REQ-DM-043 : la date de purge est LIÉE au SIREN — ni l’un sans l’autre')` : décision 3.
- **Assertion** — `tests/integration/depots-refuses-purge-siren.spec.ts` ·
  `it('REQ-DM-043 : un SIREN purgé ne revient pas, et la date de purge ne se réécrit pas')` :
  décision 4.
- **Assertion** — `tests/integration/ajout-seul-gabarit.spec.ts` ·
  `it('REQ-DM-043 : TÉMOIN — toute autre modification d’un refus est refusée')` : décision 4.

## Reste à faire

- Relecture et acceptation par A02 ; l'ADR passe alors `accepte`, et la migration qui le cite en
  ligne 1 est absoute de `journal_desarme`.
- `gov:adr` exige des numéros consécutifs : cet ADR attend l'ADR 0030 (INT-T28) ; à défaut, les
  numéros s'échangent à la PR.
