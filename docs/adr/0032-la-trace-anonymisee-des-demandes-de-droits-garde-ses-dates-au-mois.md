# partners/ADR-0032 — La trace anonymisée des demandes de droits ne garde de ses dates que le mois

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-10-04 |
| **Décideur** | `architecte` — proposé par l'auteur (A05) sous `role:architecte`, d'après la forme d'A02 versée aux rattrapages 108 et 109 ; à accepter par A02 avant le code |
| **Tâche** | DM-68 |
| **Exigences servies** | REQ-JUR-065 |
| **Décisions du registre citées** | — (la troncature est le texte de la juriste, versé au registre des tâches par le rattrapage 108 ; la cinquième date, la voie (a) d'A02 au rattrapage 109) |
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

## Décision

**1. Une fonction dédiée, sans argument.** `refuser_modification_sauf_droits_contact()` remplace
`refuser_modification_sauf(…)` sur les deux déclencheurs de `demandes_droits_contact`. Son nom
garde le préfixe du gabarit : chaque refus se nomme encore `refuser_modification_sauf…`. Les colonnes
sont écrites en dur : la fonction ne sert qu'à cette table.

**2. Les sept règles d'`partners/ADR-0031` sont conservées, à l'identique.** `traitee_at`, `issue`,
`valeur_purgee_at`, `prolongee_at` et `trace_anonymisee_at` s'écrivent une fois, depuis NULL ;
`valeur_chiffree` et `attribution_id` ne changent que vers NULL. Toute autre colonne modifiée est
refusée. DELETE et TRUNCATE sont refusés.

**3. L'écriture d'anonymisation est celle où `trace_anonymisee_at` passe de NULL à une valeur.**
Dans cette écriture, et dans elle seule, `recue_at`, `traitee_at`, `prolongee_at` et
`valeur_purgee_at` sont remplacées par le début de LEUR PROPRE mois UTC :
`date_trunc('month', OLD.x AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, jamais au fuseau de la session.
Aucun autre début de mois n'est admis (condition de la sécurité, rattrapage 109) : la troncature ne
déplace jamais une date vers un autre mois. Une date NULL reste NULL.

**4. La troncature est OBLIGATOIRE dans l'écriture d'anonymisation.** La fonction refuse une
anonymisation qui laisse l'une des quatre dates différente du début de son mois. La base garantit
ainsi le témoin de la juriste : après l'anonymisation, aucune date de la ligne n'a de jour ni
d'heure autres que le premier du mois à minuit. Sans cette obligation, un appelant qui oublierait
la troncature produirait une ligne anonymisée en apparence seulement, sans que rien ne rougisse.

**5. La cinquième date.** `trace_anonymisee_at` est écrite au premier du mois UTC de l'instant
d'anonymisation (voie (a) d'A02, rattrapage 109). La fonction refuse une valeur qui n'est pas un
début de mois UTC. Elle ne la confronte pas à l'horloge de la base : la tâche reçoit son instant du
lanceur, et ses témoins le simulent.

**6. Hors de l'écriture d'anonymisation, aucune troncature.** Avant elle, `recue_at` ne change
jamais, et les trois autres dates suivent la seule règle `une_fois`. Après elle, une date tronquée
ne se réécrit pas : `trace_anonymisee_at` n'est plus NULL, l'écriture n'est plus une anonymisation.

**7. L'ordre est préservé.** La troncature est croissante : les CHECK existants tiennent sans
changement (`demandes_droits_contact_prolongation_avant_traitement`, `prolongee_at <= traitee_at` ;
`demandes_droits_contact_valeur_purge_liee`). Le déclencheur `demandes_droits_contact_horloge`
n'agit qu'à l'INSERT : il ne contredit pas la troncature, qui est un UPDATE.

**8. Aucune fenêtre sans garde.** La fonction est créée d'abord, puis les deux déclencheurs sont
remplacés par `CREATE OR REPLACE TRIGGER`, qui est atomique.

**9. La tâche tronque dans la même instruction.** `anonymiserLesTracesDesDroits` passe d'un
`updateMany` à une seule instruction SQL paramétrée, qui vide le lien, pose `trace_anonymisee_at`
et tronque les quatre dates. Le filtre d'`partners/ADR-0031` est inchangé.

## Conséquences

- Une trace anonymisée ne dit plus que le mois de la réception, du traitement, de la prolongation
  et de l'effacement de la valeur. La preuve du traitement reste : le droit, la donnée visée,
  l'issue, et l'ordre des étapes au mois près.
- La limite des cinq ans se calcule AVANT la troncature, sur les dates exactes : la troncature ne
  change pas l'échéance d'anonymisation.
- Le gabarit commun n'est pas touché, et aucune autre table ne change.
- Retour arrière : recréer les deux déclencheurs sur `refuser_modification_sauf(…)` avec les sept
  arguments d'`partners/ADR-0031`, puis retirer la fonction dédiée. Les dates déjà tronquées ne se
  restaurent pas : aucune précision ne se réinvente.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Un mode `tronquer` dans le gabarit commun | Toutes les tables en ajout seul porteraient le risque d'une nature de plus, pour un seul usage. |
| Un second déclencheur qui tronque avant le gabarit | Le gabarit verrait quand même `recue_at` changer, et refuserait : un déclencheur ne lève pas le refus d'un autre. |
| Admettre n'importe quel début de mois | La troncature pourrait déplacer une date vers un autre mois (condition de la sécurité, rattrapage 109). |
| Une troncature permise mais pas obligatoire | Un appelant qui l'oublie produit une trace dont les dates trahissent la personne, sans aucun refus. |
| Confronter `trace_anonymisee_at` à `now()` | La tâche reçoit son instant du lanceur ; ses témoins simulent cinq ans d'écart. |
| `DROP TRIGGER` puis `CREATE TRIGGER` | Une fenêtre sans garde entre les deux instructions. |

## Ce qui le vérifie

- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — après l’anonymisation, les cinq dates sont des débuts de mois UTC, et les deux CHECK tiennent')` :
  décisions 3, 5 et 7.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une troncature hors de l’écriture d’anonymisation est refusée')` :
  décision 6.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une date tronquée ne se réécrit pas')` : décision 6.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une valeur qui n’est pas un début de mois UTC est refusée, et le début d’un autre mois aussi')` :
  décisions 3 et 5.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une anonymisation qui ne tronque pas est refusée')` : décision 4.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — une demande close le dernier jour du mois à 23 h 30 heure de Paris est tronquée selon son mois UTC')` :
  décision 3.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — les deux déclencheurs exécutent la fonction dédiée, remplacés et non doublés')` :
  décisions 1 et 8.
- **Assertion** — `tests/integration/demandes-droits-contact-anonymisation.spec.ts` ·
  `it('REQ-JUR-065 : TÉMOIN — toute autre modification et DELETE restent refusés, la troncature aussi')` :
  décision 2.

## Reste à faire

- L'acceptation par A02, avant le code (registre des tâches, DM-68).
- Le numéro : `gov:adr` exige des numéros consécutifs, et le 0032 est le premier libre sur `main`
  à la rédaction. Si un autre ADR le prend avant la fusion, celui-ci prend le suivant.
