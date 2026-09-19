# partners/ADR-0014 — Le journal Evenement : chaîné, refusé à toute modification par la base, sans donnée personnelle

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-19 |
| **Décideur** | `architecte` — l'approbation bloquante de la lentille `schema` sur la tête de la PR qui porte cet ADR EST son acceptation ; un refus fait changer l'ADR avec le code |
| **Tâche** | DM-01 |
| **Exigences servies** | REQ-DM-001, REQ-DM-024, REQ-DM-038, REQ-DM-041 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-02, RM-04, RM-11 |
| **Remplace / remplacé par** | — |

## Contexte

Le schéma Partners n'avait aucun modèle : `prisma/schema.prisma` ne portait que deux enums, posés pour
que la garde du vocabulaire ait un sujet. Le journal `Evenement` est la première table, et toutes les
transitions d'agrégat (attribution, apporteur, ligne de commission, relevé, pièce KYC, contrat) y
écriront leur événement dans la même transaction (REQ-DM-024).

Trois propriétés sont exigées, et elles se tiennent entre elles. Le journal est **append-only et
chaîné** (REQ-DM-024) ; le refus doit être celui de la **base**, pour qu'un client qui contourne
l'application s'y heurte aussi. La charge d'un événement est un **schéma fermé** sans donnée
personnelle (REQ-DM-041) : un journal que la base interdit de modifier ne peut pas effacer une donnée
personnelle qu'on y aurait écrite, et le droit à l'effacement buterait sur le déclencheur. Enfin,
**après l'effacement d'un tiers, la chaîne reste vérifiable** : c'est la conséquence de la charge
fermée, à prouver en base réelle.

Côté axionia, le patron existe (`EmargementSignature` et sa forme canonique RFC 8785), mais dans un
autre dépôt : il se porte, il ne s'importe pas.

## Décision

**Décision 1 — Algorithme `sha256-jcs-v1`.** `selfHash = hex(SHA-256(UTF-8(prevHash + canonique(e))))`, où
`e = { agregat, agregatId, charge, survenuAt, type }`. Toutes les colonnes qui portent un sens sont
hachées, pas la seule charge : hacher la charge seule laisserait `type` ou `agregatId` réécrits sans
que la chaîne le voie. `id` n'est pas haché. `canonique()` est le portage du sous-ensemble RFC 8785
d'axionia : clés triées, aucun espace, entiers sûrs seulement (`-0` devient `0`), et **lève** sur un
flottant, `undefined`, `bigint`, une fonction, un symbole, une `Date` ou un objet non simple, en
nommant le chemin. Toute colonne ajoutée plus tard est hors hachage et le dit, ou exige un nouvel
algorithme par ADR.

**Décision 2 — Genèse.** La première migration insère une ligne `journal_ouvert`, `prevHash` à 64 zéros,
`survenuAt` à la date du nom de la migration, charge `{ algorithme: 'sha256-jcs-v1' }`. Elle ancre la
chaîne et y inscrit l'algorithme. Son `selfHash` est calculé par le domaine (`GENESE`) et recopié en
littéral dans `migration.sql` : deux copies, tenues égales par un test qui lit le fichier. Deux
vecteurs de référence (la genèse et un maillon aux champs d'agrégat remplis) sont calculés HORS du
code, par Python `hashlib` et par `sha256sum`, et figés en littéraux dans le test : la forme canonique
ne peut pas dériver des deux côtés à la fois. `verifierChaine()` ÉPINGLE la genèse à `GENESE` : une
ligne de genèse dont le `selfHash` n'est pas celui du domaine, ou dont le contenu ne lui correspond
plus, rend `genese_alteree` — sans cela, une genèse forgée et une chaîne recalculée sur elle
passaient.

**Décision 3 — Linéarité.** `UNIQUE(prev_hash)` interdit la bifurcation et une seconde genèse. L'écrivain
prend `pg_advisory_xact_lock` sur une clé fixe puis lit la tête dans la même transaction ; sous READ
COMMITTED, la lecture postérieure au verrou voit le dernier commit. Si le verrou manquait, l'unicité
fait échouer fermé (23505) : c'est le filet, pas le mécanisme. La chaîne est **globale** : le débit du
réseau d'apporteurs ne justifie pas un chaînage par agrégat.

**Décision 4 — Charge fermée.** Un schéma Zod `.strict()` par type (`CHARGES_PAR_TYPE`), dont chaque feuille
appartient à une liste fermée de formes : identifiant `uuid`, empreinte sur `HASH_HEX_64` (cette
constante, par identité), enum ou littéral de chaîne, entier sur un champ suffixé `Cents`, horodatage
`datetime`, déballés d'`optional` / `nullable`, objet imbriqué `.strict()`. `z.string()` nu est
refusé. En seconde couche, un nom de champ dont un segment est au **lexique unique** des champs de
personne (`src/domain/donnees-personnelles/champs.ts`, exporté pour toute autre garde) rougit, sauf
s'il est une empreinte (`…Hash` sur `HASH_HEX_64`). La garde `journal:sans-pii` juge les schémas eux-
mêmes ; `ajouterEvenement()` les applique à l'exécution, avant toute écriture, et son refus nomme le
chemin et le code de chaque écart, jamais la valeur reçue. **La charge n'est fermée que si
`ajouterEvenement()` est le SEUL écrivain** : la garde ne chasse pas une orthographe d'appel (un
délégué pris en variable, déstructuré, entre crochets, une requête construite à part passent sous
toute liste de formes) ; elle refuse toute MENTION de la table ou du délégué — le mot `evenements`
en toute casse, le mot `evenement` en minuscules, identifiant, propriété, chaîne, gabarit ou clé —
dans tout fichier suivi sous `src/`, `scripts/` ou `packages/`, toutes extensions (famille
`ecrivain_hors_journal`, échec fermé : une simple lecture hors de l'écrivain rougit aussi). Le chemin
d'un import statique n'est pas une mention, et le type Prisma `Evenement` reste admis. La liste
blanche est courte et nommée : l'écrivain unique, le domaine pur `src/domain/evenement/` (qui ne peut
porter ni le délégué ni la moindre trace d'un client), la garde elle-même, et des fichiers qui
nomment le mot sans toucher la table, chacun à un compte de mentions FIGÉ (`LISTE_BLANCHE_COMPTEE`).

**Décision 5 — Immuabilité par la base.** Un déclencheur de ligne `evenements_append_only` refuse `UPDATE` et
`DELETE` ; un déclencheur d'instruction `evenements_append_only_troncature` refuse `TRUNCATE`, qu'un
déclencheur de ligne ne voit pas. Le message nomme le déclencheur et l'opération. Deux `CHECK`
tiennent la forme des hashes (64 hexadécimaux minuscules) et la complétude du couple
`agregat` / `agregat_id`. Aucune colonne hachée ne porte de `@default`.

**Décision 6 — Conventions du schéma, pour tout le dépôt.** Tables, colonnes et enums en snake_case par
`@map` / `@@map` ; identifiant d'agrégat `String @id @default(uuid()) @db.Uuid` ; horodatage
`DateTime @db.Timestamptz(3)` suffixé `At` ; montant `Int` suffixé `Cents`. Un enum n'entre au schéma
qu'avec la colonne qui l'écrit. Le `CREATE TYPE` généré est reformaté une valeur par ligne, comme dans
le schéma : c'est la projection de l'enum complet, que `partners:schema:enums` lit ligne à ligne.

**Décision 7 — Les tests d'intégration tournent dans `pnpm test`.** `tests/integration/**` entre dans
l'`include` de `vitest.config.ts` : `gov:trace` lit ce fichier, et un spec exclu y vaudrait « non
exécuté ». Conséquence assumée (`partners/ADR-0001` : la dépendance à Docker devient structurelle) :
la suite exige le démon Docker, en CI comme en local. Le harnais (`tests/integration/harnais.ts`)
lance `pgvector/pgvector:pg16`, applique les migrations par `prisma migrate deploy` avec l'URL du
conteneur, et lève en nommant le démon s'il est absent.

**Décision 8 — `ajouterEvenement()` n'accepte qu'une transaction, par deux défenses.** Le TYPE protège
l'appel DIRECT : le paramètre est typé `ClientDeTransaction<T>`, qui rend `never` tout client portant
encore `$transaction`, et un `@ts-expect-error` du témoin d'intégration voit `pnpm typecheck` rougir si
la règle se perd. Il ne voit PAS un client nu passé par un intermédiaire typé
`Prisma.TransactionClient` (un `Omit<>` du client, auquel un `PrismaClient` s'assigne) : c'est le REFUS
À L'EXÉCUTION qui protège tout le reste — `ajouterEvenement()` lève si le client porte `$transaction`,
ce qui est faux dans une transaction interactive (même sur un client `$extends`) et vrai sur le client
nu ; un témoin en base réelle le prouve, compte de lignes inchangé. `agregatId` est validé comme UUID
à tirets et normalisé en minuscules AVANT le hachage (Postgres le rend sous cette forme : haché
autrement, le maillon serait en `hash_altere` pour toujours et masquerait les altérations suivantes).
Aucun client Prisma n'est créé sous `src/` par cette décision. `survenuAt` vient de l'appelant : rien
dans le domaine ne lit l'heure.

## Conséquences

- Chaque tâche qui journalise un type neuf ajoute sa valeur à l'enum `TypeEvenementJournal`, sa
  charge fermée à `CHARGES_PAR_TYPE`, et la valeur au glossaire par le gardien-spec : la garde rougit
  dans les deux sens tant que les trois ne concordent pas.
- L'acteur d'une action va dans la charge de son type, sous forme d'identifiant ; pas de colonne
  d'acteur, pas de `@@index` de lecture par agrégat tant qu'aucune tâche ne lit par agrégat (additifs,
  non hachés).
- Une session qui lance la suite complète démarre Docker d'abord.
- **Ce que la chaîne détecte, exactement.** Une altération qui laisse une ligne ou un lien
  incohérent : colonne réécrite, ligne supprimée au MILIEU, genèse forgée — pourvu que l'acteur ne
  recalcule pas la queue. Une troncature de la queue ne recalcule rien et N'EST PAS vue pour autant :
  c'est la limite (b).
- **Limites déclarées, pas des défauts.** (a) Un acteur qui a les droits du propriétaire — ou le rôle
  applicatif lui-même, tant que les rôles ne sont pas séparés — peut désarmer le déclencheur
  (`ALTER TABLE … DISABLE TRIGGER`, `ALTER COLUMN … TYPE … USING` qui réécrit les lignes sans
  déclencheur de ligne, `session_replication_role = replica` pour un superutilisateur), réécrire une
  ligne et **RECALCULER toute la queue** : l'algorithme est public et sans secret, et ce n'est **PAS
  détecté** tant que la tête n'est pas ancrée hors de la base (DM-20). Un test le tient
  (`journal-chaine.spec.ts`, « LIMITE ») : il rougira le jour où l'ancrage existera. La séparation du
  rôle de migration et d'un rôle applicatif sans `UPDATE` / `DELETE` relève du déploiement. (b) Une
  troncature de la **queue** n'est pas détectable par la chaîne seule, pour la même raison. (c) La
  chaîne prouve l'**ordre**, pas l'**auteur** : même après la séparation des rôles, un rôle qui peut
  insérer peut ajouter un maillon à l'empreinte valide. (d) La clause « le worker de purge ne
  référence pas la table » de `partners:journal:immutable` est sans objet tant qu'aucun worker
  n'existe. (e) La garde de l'écrivain unique ne voit pas un nom calculé (`'evene' + 'ment'`), un
  client hors du dépôt, `prisma/` (migrations et graine), ni une extension `$extends` ou une requête
  TypedSQL qui ne nomme pas le mot.
- Retour arrière : une migration qui retire les déclencheurs — visible au diff ; `verifierChaine()`
  continue de voir une altération du milieu non recalculée ; ni le recalcul (a) ni la troncature
  de queue (b).

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Hacher en SQL (`pgcrypto`, `sha256()`) | La forme `jsonb::text` n'est pas la forme canonique du code : deux implémentations du même hash, qui divergent au premier ordre de clés. |
| `REVOKE UPDATE, DELETE` seul | Le propriétaire de la table garde ses droits : le refus ne serait pas celui de la base pour le rôle qui migre. |
| `prev_hash` nullable, clé étrangère et index unique partiel de genèse | Prisma ne modélise pas l'index partiel et proposerait son `DROP INDEX` à chaque `migrate diff`. |
| Chaînage par agrégat | Plusieurs chaînes à ancrer, pour un débit qui ne l'exige pas ; REQ-DM-024 parle d'un journal. |
| Liste noire de noms de champ seule | Une chaîne libre nommée `motif` porte un courriel aussi bien qu'un champ `email` : la liste fermée des FORMES est la première couche. |

## Ce qui le vérifie

- **Assertion** — `tests/integration/journal.spec.ts` · `it('REQ-JUR-026 → REQ-DM-024 : un test tente une modification (UPDATE) et attend un refus nommé')` : sans le déclencheur de ligne, l'`UPDATE` modifie une ligne.
- **Assertion** — `tests/integration/journal.spec.ts` · `it('REQ-SEC-027 → REQ-DM-024 : TRUNCATE, que le déclencheur de ligne ne voit pas, est refusé aussi')` : sans le déclencheur d'instruction, la table se vide.
- **Assertion** — `tests/integration/journal.spec.ts` · `it('REQ-DM-024 : deux écrivains concurrents se suivent au lieu de bifurquer (verrou consultatif)')` : sans le verrou, la seconde écriture échoue sur `UNIQUE(prev_hash)`.
- **Assertion** — `tests/integration/journal.spec.ts` · `it('REQ-DM-041 : après l’effacement d’un tiers, verifierChaine() reste sans faute — et « purger » la charge est refusé')` : la conséquence de la charge fermée, en base réelle.
- **Assertion** — `tests/unit/domaine/journal-chaine.spec.ts` · `it('REQ-DM-024 : le self_hash que la migration insère est celui que le domaine calcule')` : la genèse de la migration et celle du domaine ne divergent pas.
- **Assertion** — `tests/unit/domaine/journal-chaine.spec.ts` · `it('REQ-DM-024 : une ligne du milieu supprimée → maillon_orphelin nomme la ligne SUIVANTE')` : la chaîne se suit par ses liens de hash.
- **Assertion** — `tests/unit/domaine/journal-charge-fermee.spec.ts` · `it('REQ-DM-041 : une chaîne nue rougit — une chaîne libre peut porter un courriel')` : la liste fermée des formes est la première couche.
- **Assertion** — `tests/unit/domaine/journal-charge-fermee.spec.ts` · `it('REQ-DM-041 : le second écrivain de la revue (src/server/bac/ecrivain-bis.ts) rougit, nommé')` : la charge n'est fermée que si l'écrivain est unique.
- **Assertion** — `tests/unit/domaine/journal-chaine.spec.ts` · `it('REQ-DM-024 : LIMITE — une ligne du milieu réécrite PUIS la queue recalculée passe inaperçue sans ancrage externe')` : la limite (a), tenue au lieu d'être tue.
- **Assertion** — `tests/unit/domaine/schema-centimes.spec.ts` · `it('REQ-DM-001 : le schéma du dépôt ne porte aucun Float, aucun Decimal, aucun montant hors Cents')` : la convention d'argent du schéma.

## Reste à faire

- Vérification périodique de la chaîne et ancrage de la tête hors de la base (qui fermera la limite
  (a) et la troncature de queue), purge encadrée si elle est décidée : la tâche du journal en phase 3
  (DM-20). Une clé HMAC hors base a été écartée pour l'instant : elle ne vaut que si le rôle qui écrit
  ne peut pas la lire, ce qui suppose la séparation des rôles.
- Séparation des rôles Postgres (migration, applicatif sans `UPDATE` / `DELETE`) : déploiement.
- Le prédicat des centimes de `schema-centimes.spec.ts` sera remplacé par l'import de la garde
  `partners:schema:cents` quand elle existera.
- Le SIREN n'est pas dans la liste fermée des formes : la tâche qui en aura besoin l'ajoute en amendant
  cet ADR.
