# partners/ADR-0031 — La trace des demandes de droits s'anonymise à cinq ans, la ligne reste comme preuve

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-10-03 |
| **Décideur** | `architecte` — cet ADR consigne la forme d'A02 versée au rattrapage 79 (patron de DM-53, `partners/ADR-0030`) ; accepté par A02 en revue de la PR de DM-60, le 2026-10-03 (revue 5400573808) |
| **Tâche** | DM-60 |
| **Exigences servies** | REQ-JUR-065, REQ-DM-037 |
| **Décisions du registre citées** | — (la durée de cinq ans est une décision de Williams du 2026-10-03, versée au registre des tâches par le rattrapage 79) |
| **Règle maison appliquée** | RM-01, RM-02, RM-10 |
| **Remplace / remplacé par** | amende les déclencheurs `demandes_droits_contact_ajout_seul` et `demandes_droits_contact_troncature` de la migration `20261002001600_demandes_droits_contact` ; amendé par `partners/ADR-0032` (décisions 5 et 6 : la fonction des deux déclencheurs) |

## Contexte

`demandes_droits_contact` garde la trace de chaque demande de droit du contact (DM-59) : le droit, la
donnée visée, l'issue et les dates, sans aucune valeur en clair. Cette trace est la preuve que la
demande a été traitée. Mais elle reste liée à l'attribution, donc à une personne : la garder sans
terme serait une conservation sans base.

La durée est fixée par Williams le 2026-10-03 : cinq ans après la clôture de la demande (le délai de
prescription de droit commun, code civil art. 2224). Elle vit dans `retention.ts`
(`DROITS_CONTACT_TRACE_ANS`). Le registre de l'article 30 l'écrivait déjà ; il annonçait l'exécution
« à venir ».

La table est en AJOUT SEUL, branchée sur `refuser_modification_sauf()` avec les exceptions de DM-59.
Vider le lien est une exception de plus, et remplacer un déclencheur de protection relève de la
famille `journal_desarme` de `partners:migrations:additive`. Celle-ci n'absout un tel remplacement
QUE par un ADR accepté : celui-ci.

## Décision

**1. Le lien s'efface, la ligne reste.** Cinq ans après `COALESCE(traitee_at, recue_at)`, une tâche
planifiée du lanceur (`droits_contact_anonymiser`) met `attribution_id` à NULL et pose
`trace_anonymisee_at`, en une seule instruction. La ligne garde le droit, la donnée visée, l'issue
et les dates, sans lien à une personne.

**2. Une demande jamais close compte de sa réception.** Le délai légal de réponse est d'un mois,
trois au plus : une demande sans réponse au bout de cinq ans est une anomalie, et la minimisation
l'emporte.

**3. Une date d'anonymisation, liée au lien.** Le CHECK `demandes_droits_contact_trace_anonymisee_liee`
(`(attribution_id IS NULL) = (trace_anonymisee_at IS NOT NULL)`) lie la date au lien vidé : elle sert
d'idempotence et distingue une anonymisation d'un NULL anormal.

**4. Une trace anonymisée ne porte aucune valeur.** Le CHECK
`demandes_droits_contact_anonymisee_sans_valeur` (`trace_anonymisee_at IS NULL OR valeur_chiffree IS
NULL`) refuse d'anonymiser une demande qui garde la valeur d'une rectification. La tâche ne prend
donc pas une telle demande : le filet de DM-59 (`droits_contact_purger`) efface d'abord la valeur, et
le passage suivant anonymise. Sans ce filtre, une seule ligne anormale ferait tomber toute
l'instruction, et plus rien ne serait anonymisé.

**5. Le gabarit reçoit DEUX exceptions de plus, et seulement elles.** Les deux déclencheurs, de ligne
et de troncature, deviennent `refuser_modification_sauf('une_fois:traitee_at', 'une_fois:issue',
'purge:valeur_chiffree', 'une_fois:valeur_purgee_at', 'une_fois:prolongee_at',
'purge:attribution_id', 'une_fois:trace_anonymisee_at')` : les arguments de DM-59 dans leur ordre,
puis le lien qui ne change que vers NULL et sa date qui ne s'écrit qu'une fois. Toute autre
modification reste refusée ; DELETE et TRUNCATE restent refusés.

**6. Aucune fenêtre sans garde.** Le remplacement s'écrit `CREATE OR REPLACE TRIGGER` : il est
atomique.

**7. La clé et les index ne changent pas.** La clé étrangère vers `attributions` reste en RESTRICT
(une valeur NULL n'est pas vérifiée). L'index btree `demandes_droits_contact_attribution_id_idx`
admet les NULL ; l'index partiel `demandes_droits_contact_a_traiter_idx` n'est pas touché. Seule la
colonne perd son NOT NULL, et le champ Prisma devient `attributionId String?`, relation optionnelle.

## Conséquences

- Une demande de plus de cinq ans ne dit plus de quelle attribution, ni donc de quel contact, elle
  venait. C'est la conséquence voulue de la durée de conservation.
- La limite recule par `setUTCFullYear` : la trace d'une demande close un 29 février s'anonymise un
  jour avant ses cinq ans, la limite tombant au 1er mars. L'écart raccourcit la conservation et ne
  l'allonge jamais (même note qu'A02 sur `partners/ADR-0030`).
- Aucun événement de journal n'est écrit : la date liée en tient lieu, comme pour DM-53.
- Retour arrière : recréer les deux déclencheurs avec les cinq arguments de DM-59, retirer les deux
  contraintes et la colonne, puis `SET NOT NULL` sur `attribution_id`. Il ÉCHOUE dès qu'une trace a
  été anonymisée : aucun lien ne se réinvente, et il faudrait un ADR qui remplace celui-ci.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Supprimer la ligne à cinq ans | La preuve que la demande a été traitée disparaîtrait, et la table est en ajout seul : un DELETE serait une exception plus large. |
| Une empreinte de l'attribution à la place du lien | Une empreinte d'un identifiant connu se retrouve en la recalculant : garder l'empreinte reviendrait à garder le lien. |
| Anonymiser sans filtrer les demandes qui portent encore une valeur | Le CHECK de la décision 4 ferait tomber toute l'instruction pour une seule ligne anormale. |
| Un second déclencheur qui autorise la purge du lien | Le premier refuserait toujours : un déclencheur ne lève pas le refus d'un autre. |
| `DROP TRIGGER` puis `CREATE TRIGGER` | Une fenêtre sans garde entre les deux instructions ; `CREATE OR REPLACE` l'évite. |

## Ce qui le vérifie

- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOINS — sous l’échéance rien ; pile et au-delà, lien vidé et date posée, la ligne restant')` :
  décision 1.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une demande jamais close s’anonymise cinq ans après sa RÉCEPTION, et pas la veille')` :
  décision 2.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — la date posée sans vider le lien, ou le lien vidé sans la date, refusés sur le CHECK')` :
  décision 3.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — l’anonymisation d’une demande qui porte encore une valeur est refusée')` :
  décision 4.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une demande qui porte encore sa valeur n’est pas anonymisée par la tâche, et ne bloque pas les autres')` :
  décision 4.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — le lien ne revient pas, et la date ne se réécrit pas')` : décision 5.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — toute autre modification et DELETE restent refusés, la troncature aussi')` :
  décision 5.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — les deux déclencheurs exécutent la fonction dédiée, remplacés et non doublés')` :
  décisions 5 et 6, telles qu'amendées par `partners/ADR-0032` : les sept règles y sont écrites en
  dur dans une fonction dédiée, qui remplace les arguments du gabarit.

## Reste à faire

- `gov:adr` exige des numéros consécutifs : les ADR 0031 et 0032 n'étant pas sur `main` à
  l'ouverture de la PR, celui-ci prend le 0031 (comme au rattrapage 59). Le registre des tâches
  nomme `docs/adr/0033-la-trace-des-demandes-de-droits-s-anonymise-a-cinq-ans.md` : le chemin se
  corrige au rattrapage, et les ADR réservés à INT-T28 et à DM-58 prendront les
  numéros suivants.
