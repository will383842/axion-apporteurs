# partners/ADR-0022 — La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-26 |
| **Décideur** | `architecte` — décision technique prise sur délégation de Will ; elle passe `accepte` quand ses assertions existent (Reste à faire) |
| **Tâche** | GOV-102 |
| **Exigences servies** | REQ-DM-001, REQ-DM-024, REQ-DM-036, REQ-DM-037, REQ-DM-038, REQ-DM-041, REQ-SEC-024, REQ-QA-021, REQ-QA-026 |
| **Décisions du registre citées** | `HYP-A02-RETENTION`, `HYP-A02-VOCABULAIRE-QUALIFICATION`, `HYP-JUR-PROF-REGLEMENTEES`, `HYP-DM06-IBAN` |
| **Règle maison appliquée** | RM-01, RM-04, RM-06, RM-11 |
| **Remplace / remplacé par** | — |

## Contexte

Le champ `schema` d'une tâche décide qui relit sa PR (l'architecte en troisième lentille) et qu'elle
est seule de sa famille dans son lot. Au 2026-09-26, ce champ mentait sur une vingtaine de tâches des
phases 0 et 1 : des acceptances écrivaient « ELLE ÉCRIT LE SCHÉMA » sous `schema: false` (SEC-06,
DM-03-P), des tâches créaient des tables sans le dire (INT-T10, DM-09, DM-12), et d'autres portaient
`schema: true` pour un fichier qui n'est pas la base (`scripts/lot/tasks.schema.json`). Chaque cas
arrêtait un développeur ; GOV-093 en recensait sept.

Trois faits mesurés rendaient une décision d'ensemble nécessaire plutôt qu'un cas par cas :

- **Plusieurs tables avaient deux créateurs possibles, ou aucun.** `contrats` pouvait naître de DM-11,
  de DM-23 ou d'INT-T12 ; si DM-11 la créait, DM-23 devait y ajouter une colonne `NOT NULL` sans défaut,
  ce que la porte D refuse (REQ-QA-021). Personne ne créait `battements` (REQ-QA-026) avant des crons
  qui en ont besoin.
- **Chaque valeur de `TypeEvenementJournal` coûte une migration.** Écrire un type par transition
  aurait rendu `schema` chaque tâche de cron ou d'écran qui journalise quelque chose.
- **La garde du vocabulaire cherche une SOUS-CHAÎNE** (`NOMS_DE_VOCABULAIRE`,
  `scripts/gates/schema-enums.ts`) : une colonne de texte libre nommée `motifEcart` ou `palierId`
  rougit, alors que c'est une justification rédigée ou un identifiant.

## Décision

**1. Une table, un créateur.** Chaque table des phases 0 et 1 a exactement une tâche créatrice ; les
autres y écrivent sans migration. Le registre des créateurs est porté par les acceptances des tâches
(`docs/tasks.json`, GOV-102) : `grilles_commission` par DM-03-P ; `evenements_recus` et `battements`
par SEC-06 ; `courriels_envoyes` et `suppressions_courriel` par INT-T10 ; `utilisateurs_console` par
SEC-17 ; `changements_courriel` par SEC-04 ; `attributions`, `depots_refuses` et
`personnes_declarees` par DM-07 ; `qualifications` par DM-09 ; `entreprises_connues` et
`sirens_liste_noire` par DM-10-P ; `pieces_kyc` par DM-11 ; `verifications`, `alertes_liberation`,
`anomalies`, `rattachements_manuels` et `contestations` par DM-12 ; `contrats` et les tables de grille
par DM-23 ; `enveloppes_signature` par INT-T12 ; `decisions_candidature` par CPL-T06 ; `echanges` par
EXT-T01 ; `campagnes_recrutement` et `pieces_jointes_candidature` par EXT-T03 ;
`notifications_espace` et `preferences_notification` par UX-P1-10. Côté axionia,
`partners_sync_outbox` par INT-T02.

**2. Le créateur pose d'un coup toutes les colonnes connues des phases 0 et 1**, nulles quand elles ne
sont pas écrites à la naissance. C'est ce qui laisse `schema: false` les tâches d'écran et de cron.

**3. `contrats` naît de DM-23**, avec la référence à la grille du contrat non nulle dès sa création ;
DM-11 ne crée que le dossier de conformité ; INT-T12 crée l'enveloppe de signature.

**4. Journal : un type par GENRE de transition, jamais par transition.** `attribution_etat_modifie`
porte `{de, vers, evenement}`, où `evenement` est un `z.enum` dérivé de la matrice d'états ;
`apporteur_statut_modifie` fait de même pour l'apporteur. Ajouter un événement à une matrice modifie
une charge Zod de `src/domain/evenement/charges.ts`, jamais le schéma. Les treize valeurs des phases
0 et 1 et leur créateur sont au glossaire §4.1. Chacune entre dans la ligne `TypeEvenementJournal` du
glossaire avec la migration qui la crée, pas avant. Un texte qui nomme un événement pointé désigne le
type de son genre avec la valeur d'`evenement` correspondante.

**5. Un vocabulaire fermé s'appelle `motif` et c'est un enum ; une explication rédigée s'appelle
`justification`**, en `Text` avec un `CHECK` de longueur minimale. Un identifiant de palier s'appelle
`commissionId`, le nom de REQ-INT-006.

**6. Données personnelles.** Toute colonne dont un segment est au lexique de
`src/domain/donnees-personnelles/champs.ts` est un bloc `…Chiffre` écrit par `colonnesPii`, ou une
empreinte `…Hash` écrite par `empreinteRecherche` ; l'adresse réseau n'est jamais qu'une empreinte
tronquée. Un texte libre qui décrit une personne ou une relation est chiffré même hors lexique. Une
tâche qui chiffre un champ nouveau étend `CHAMPS_PII` (`src/server/securite/pii.ts`) : l'AAD porte le
nom du champ, il n'existe pas de champ générique. Deux types d'empreinte s'ajoutent : `nom_personne`
(DM-07, qui aligne l'empreinte des dirigeants d'INT-T09) et `agent` (l'en-tête de navigateur, DM-07).

**7. Aucun nombre flottant, quel que soit le nom.** Coordonnées géographiques en micro-degrés `Int`,
taux en points de base `Int`, montants en centimes `Int …Cents`.

**8. Ce qui se dérive ne se stocke pas** : l'échéance d'un jeton de dépôt, le compte des tentatives
de contact, le plafond de vérifications, le départage de deux dépôts simultanés (identifiant de
l'événement de dépôt au journal, REQ-DM-005), l'échéance de réponse à une contestation.

**9. Trois exceptions ASSUMÉES à « tout vocabulaire est un enum »** : `battements.tache`,
`courriels_envoyes.gabarit` et la clé de notification (`notifications_espace.cle`,
`preferences_notification.cle`). Ce sont des clés de tables de code tenues en source unique (registre
des tâches de fond, table des notifications) ; un enum Postgres en serait une seconde copie, et ferait
de chaque nouveau cron ou gabarit une PR `schema`. Forme imposée : `VarChar(64)`,
`CHECK (x ~ '^[a-z][a-z0-9_]*$')`, validation Zod contre la table de code à l'écriture, et un test
d'intégration qui confronte les valeurs écrites à cette table. Aucune règle métier ne branche sur
elles.

**10. Valeurs de fil pointées.** Un enum dont les valeurs viennent d'un format de fil porte
l'identifiant Prisma en `snake_case` et le libellé Postgres exact par `@map`
(`client_cree @map("client.cree")`) ; les valeurs d'axionia sont générées depuis `TYPES_EVENEMENT`
(`packages/contracts/events.ts`), et un test compare les libellés de `pg_enum` à cette constante.

**11. Forme commune.** Identifiant `uuid` ; horodatages `Timestamptz(3)` suffixés `At`, sans défaut
sur ce qui est haché ou opposable ; une date calendaire sans heure est `@db.Date` et ne prend pas le
suffixe ; clés étrangères en `Restrict` ; toute table en ajout seul reçoit les déclencheurs du journal
(ligne et troncature).

**12. Purge.** Une colonne `…Chiffre` d'un tiers est remise à nul par le cron de purge ; le
déclencheur d'une table en ajout seul l'autorise, et seulement cela. Les durées vivent dans
`src/domain/seuils/retention.ts` sous `HYP-A02-RETENTION`.

**13. Migrations en parallèle.** Le lot qui fusionne en second renomme son dossier de migration avec
un horodatage postérieur au dernier de `main` et régénère la partie calculée par Prisma. Une
migration qui ajoute une valeur d'enum ne l'emploie pas dans le même fichier.

**14. Semeur.** `prisma/seed.ts` (QA-T06) exécute dans l'ordre de leur préfixe les modules
`prisma/seed/<NN>-<table>.ts`, chacun livré par la tâche qui crée sa table : le fichier commun n'est
touché qu'une fois.

**15. File de sortie d'axionia.** Le numéro de séquence est global et attribué par le relais, sous
verrou consultatif, au premier envoi — jamais dans la transaction métier, où un ordre de validation
différent de l'ordre des numéros ferait sauter une ligne à la relecture. Le corps transmis est
conservé en texte, octet pour octet, jamais en `Json`.

**16. Deux vocabulaires de conformité.** `ProfessionReglementee` porte une valeur par code NAF de
REQ-JUR-022 : `expertise_comptable` (69.20Z), `auxiliaire_services_financiers` (66.19B),
`intermediaire_assurance` (66.22Z), sous `HYP-JUR-PROF-REGLEMENTEES`. `QualiteExercice` n'est tiré
d'aucune exigence : ses valeurs attendent une décision (Reste à faire).

## Conséquences

- Le champ `schema` de vingt et une tâches est remis droit ; quatorze tâches `schema` restent à livrer
  en phase 1, huit en phase 0 côté Partners. Chacune est seule de sa famille dans son lot : le
  composeur les sérialise, et c'est le prix d'une base qui n'a qu'un auteur à la fois.
- Une tâche qui a besoin d'une colonne dans une table qu'elle ne crée pas la demande par une PR de
  cadrage, jamais par une migration « au passage ».
- La charge Zod d'un type de genre grossit avec la matrice ; la garde `journal:sans-pii` la juge comme
  toute charge. Un booléen s'y écrit par un enum à deux valeurs.
- Les trois exceptions du point 9 échappent à la garde du vocabulaire : ce qui les tient est leur test
  d'intégration, et une exception sans ce test est une chaîne libre.
- Retour arrière : repasser à un type de journal par transition coûte une migration par type et
  aucune perte (les charges portent déjà l'événement) ; déplacer une table vers un autre créateur
  coûte un amendement des deux acceptances.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Un type de journal par transition | Une migration et une PR `schema` pour chaque cron ou écran qui journalise ; les lots se sérialisent sur un fichier que personne n'a besoin de toucher. |
| Chaque tâche ajoute les colonnes dont elle a besoin | Deux créateurs pour une table, des migrations croisées, et des colonnes `NOT NULL` ajoutées après coup que la porte D refuse. |
| Enum Postgres pour les gabarits de courriel et les tâches de fond | Seconde copie d'une table de code ; chaque nouvel envoi ou cron devient une PR `schema`. |
| Nommer `motif…` un texte libre et exempter la colonne | Une exemption par colonne est une porte ouverte ; séparer le nom de la justification du nom du vocabulaire est la distinction que la garde cherche. |
| `Decimal` pour les coordonnées | La garde des centimes refuse tout flottant, quel que soit son nom ; l'entier en micro-degrés est exact et déterministe. |
| Séquence d'émission posée par l'auto-incrément dans la transaction métier | Des trous, et un ordre de validation différent de l'ordre des numéros : un lecteur `after_sequence` perdrait des lignes. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/glossaire-enums.spec.ts` et `pnpm partners:schema:enums` tiennent
  déjà le vocabulaire (points 4, 5 et 10 pour les valeurs posées). Les assertions propres à cet ADR
  sont à poser par les tâches créatrices et sont listées sous « Reste à faire » : tant qu'elles
  n'existent pas, l'ADR reste `propose`.

## Reste à faire

- **Assertions à poser** : SEC-06 (libellés de `pg_enum` égaux à `TYPES_EVENEMENT`, point 10 ; index
  partiels relus dans `pg_indexes`) ; DM-08 (la charge de `attribution_etat_modifie` dérive son enum
  de la matrice, point 4) ; INT-T10 et UX-P1-10 (test d'intégration des clés de table de code, point
  9) ; INT-T02 (deux transactions validées dans l'ordre inverse, aucune ligne sautée, point 15) ;
  QA-T06 (le semeur exécute les modules dans l'ordre, point 14).
- **`QualiteExercice`** : aucune exigence ne l'énumère. La variable `{{APPORTEUR_QUALITE}}` du gabarit
  (article 14) et la validité de la clause attributive de compétence dépendent de la qualité de
  commerçant ; la liste des statuts d'exercice acceptés et leur libellé dans le contrat sont une
  décision de Will (pas d'avocat sur le projet), à consigner au registre avant DM-11. Proposition de
  l'architecte : `commercant`, `artisan`, `profession_liberale`, `association`, `autre`, la clause ne
  jouant que pour `commercant`.
- Les deux vocabulaires du point 16 entrent au glossaire par le `gardien-spec`, avant DM-11.
