# partners/ADR-0013 — Secrets et données personnelles chiffrées

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-18 |
| **Décideur** | `architecte` — cet ADR est `propose` : il consigne les arbitrages du lead sécurité, il n'est pas encore accepté |
| **Tâche** | SEC-01 |
| **Exigences servies** | REQ-SEC-028, REQ-SEC-024, REQ-SEC-001, REQ-SEC-003 |
| **Décisions du registre citées** | HYP-E1-24 |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

## Contexte

REQ-SEC-028 énumère sept secrets distincts plus `IP_HASH_SALT`, d'au moins 32 octets (64 caractères
hexadécimaux pour la clé), validés par Zod au démarrage, préfixes `dev_` et `stub` refusés en
production, `kid` dans les jetons pour la rotation. HYP-E1-24 ajoute la double clé acceptée pendant
24 heures à la rotation, déclenchée par Will.

REQ-SEC-024 exige, pour les données personnelles, un chiffrement AES-256-GCM avec une donnée
authentifiée liée à la ligne, et des empreintes HMAC salées (`emailHash`, `phoneHash`, `ibanHash`,
`siretHash`) pour les recherches ; aucune adresse réseau brute n'est stockée.

Deux faits rendent ces deux exigences solidaires. D'abord, une empreinte de recherche a besoin d'une
clé : ni `IP_HASH_SALT` (autre usage) ni la clé de chiffrement (autre usage, et toute dérivation
d'une variable vers une autre est refusée par la tâche qui livre le chiffrement) ne peuvent la
fournir. Ensuite, plusieurs tâches écrivent des colonnes de personnes EN PARALLÈLE de celle qui livre
le chiffrement ; elles lisent le dépôt, pas un brief : le format doit être écrit ici avant elles.

## Décision

### Les secrets

1. **Neuf secrets, pas huit.** `src/lib/env.ts` porte les huit de REQ-SEC-028 plus `PII_HASH_KEY`,
   clé des empreintes de recherche des données personnelles. Elle entre avec la validation du boot,
   pour que le schéma n'ait qu'un seul auteur à la fois. C'est un renforcement de la lettre de
   REQ-SEC-028, pas un écart : le témoin confronte les noms que cite l'exigence au schéma par
   INCLUSION.
2. **La liste vit à un seul endroit** : la forme du schéma Zod `schemaSecrets`. `.env.example` porte
   les mêmes noms, sans valeur, et le test les confronte dans les deux sens. Sous `src/` et
   `scripts/`, aucun autre fichier ne cite deux noms de secret entre délimiteurs de chaîne ; une
   lecture `env.NOM` n'est pas une recopie.
3. **Aucun défaut, aucun repli, aucun rognage.** Chaque secret fait au moins 32 octets UTF-8 (des
   octets, pas des caractères) ; la clé de chiffrement fait exactement 64 caractères hexadécimaux,
   motif ancré aux deux bouts. Une valeur entourée d'une espace ou d'un saut de ligne est refusée,
   jamais rognée : elle n'est pas la clé qu'on croit.
4. **L'égalité est un refus à part entière**, jugée sur des empreintes SHA-256 des valeurs, jamais en
   comparant ni en imprimant les valeurs. Chaque groupe de deux noms ou plus qui partagent une valeur
   est UN refus, qui nomme tous les noms du groupe.
5. **Le prédicat « production » échoue FERMÉ.** Les préfixes `dev_` et `stub`, sans égard à la casse,
   sont refusés sauf si `NODE_ENV` vaut exactement `development` ou `test`. `NODE_ENV` absent, mal
   orthographié ou inconnu vaut production.
6. **Le refus nomme la variable et un motif fermé** (`absente`, `trop_courte`, `format_invalide`,
   `espace_en_bordure`, `prefixe_interdit`, `egale_a` suivi des autres noms). Le motif est construit
   par notre code : le texte d'une issue Zod ne sort jamais tel quel. Aucune valeur, aucun fragment,
   aucune longueur n'est imprimée.
7. **Rien n'est évalué à l'import.** `lireEnvironnement(source)` est pure et rend les secrets ou la
   liste des refus ; `exigerEnvironnement(source)` écrit les refus sur la sortie d'erreur et sort en 1.
8. **Le `kid` est dérivé de la valeur** : `kidDe(valeur)` rend les huit premiers caractères
   hexadécimaux de SHA-256 de `partners.kid.v1`, du séparateur U+001F et de la valeur. Aucune variable
   de plus ; stable pour une valeur ; distinct d'un secret à l'autre ; 32 bits d'une empreinte d'un
   secret de 256 bits ne révèlent rien d'exploitable.

### Le format des données personnelles chiffrées (contrat, livré par la tâche du chiffrement)

9. **Algorithme** : AES-256-GCM de `node:crypto`, clé `PII_ENCRYPTION_KEY` utilisée telle quelle
   (32 octets), sans dérivation. IV de 12 octets tiré à chaque chiffrement, étiquette de 16 octets.
10. **Donnée authentifiée** : l'UTF-8 de `JSON.stringify(["partners.pii", 1, modele, champ, id])`.
    L'identifiant de la ligne y est, comme REQ-SEC-024 le demande ; le modèle, le champ et la version
    s'y ajoutent, pour qu'un bloc permuté entre deux champs de la même ligne échoue aussi.
11. **Forme stockée** : une colonne `Bytes` par champ, `0x01` (version) ‖ `kid` (4 octets) ‖ IV (12)
    ‖ étiquette (16) ‖ chiffré ; longueur minimale 33. Les 4 octets du `kid` sont ceux dont `kidDe`
    donne les huit caractères hexadécimaux.
12. **Empreintes de recherche** : HMAC-SHA256 sous `PII_HASH_KEY`, entrée séparée par domaine
    (`partners.empreinte.v1`, U+001F, le type, U+001F, la valeur normalisée), 64 caractères
    hexadécimaux minuscules. **Adresse réseau** : HMAC-SHA256 sous `IP_HASH_SALT`, entrée
    `partners.ip.v1`, U+001F, l'adresse normalisée, tronquée à 16 caractères hexadécimaux ; jamais
    chiffrée, jamais stockée en clair.
13. **Nommage des colonnes** : `…Chiffre` pour un bloc chiffré (`Bytes`), `…Hash` pour une empreinte
    (`String`). Une tâche qui écrit une colonne de personne avant l'arrivée du chiffrement suit ce
    nommage et ce type.

### L'empreinte des jetons d'authentification (ajoutée le 2026-09-26, cadrage de SEC-03 et SEC-04, GOV-100)

14. **Un jeton d'authentification n'est stocké qu'en empreinte HMAC-SHA-256 sous le secret de son usage** :
    `MAGIC_LINK_SECRET` pour le lien de connexion, `SESSION_SECRET` pour la session — **jamais
    `PII_HASH_KEY`**, clé des empreintes de recherche des personnes (décision 12), qui est un autre
    usage. L'entrée est séparée par domaine : `partners.lien.v1`, U+001F, le jeton pour le lien ;
    `partners.session.v1`, U+001F, le jeton pour la session. La sortie fait 64 caractères
    hexadécimaux minuscules (colonne `token_hash`, `char(64)`, unique). Le `kid` du secret employé
    (`kidDe`, décision 8) est **stocké** à côté de l'empreinte (colonne `kid`, `char(8)`), pour que
    la rotation sache sous quelle clé une ligne a été écrite. **Pas de double clé pour les liens** :
    un lien vit 15 minutes (REQ-SEC-001), une rotation laisse expirer ceux de l'ancienne clé au
    lieu de les accepter pendant 24 heures. Un SHA-256 nu est écarté : l'empreinte d'un jeton
    lue en base serait vérifiable hors ligne sans aucun secret.

### Le lien « ce n'est pas moi » (ajoutée le 2026-09-26, cadrage du schéma, GOV-102, partners/ADR-0022)

15. **Le lien « ce n'est pas moi » de l'accusé de dépôt (REQ-SEC-006, SEC-11) est SANS ÉTAT** : aucune
    table, aucune ligne à consommer. Il porte l'identifiant du jeton de dépôt, l'identifiant du dépôt
    et le `kid`, et une signature HMAC-SHA-256 sous `MAGIC_LINK_SECRET`, entrée séparée par domaine :
    `partners.pas-moi.v1`, U+001F, l'identifiant du jeton, U+001F, l'identifiant du dépôt ; sortie de
    64 caractères hexadécimaux minuscules, comparée à temps constant. Son seul effet est de révoquer le
    jeton désigné, et la révocation est **idempotente** : le même lien cliqué deux fois, ou après une
    révocation par un autre chemin, ne change rien et rend la même page. Il ne vaut que pour le jeton
    qu'il nomme : il ne révoque ni session ni autre jeton, et un identifiant de jeton qui n'appartient
    pas à l'apporteur du dépôt rend la même page qu'un lien faux. Pas de double clé : un lien signé sous
    une clé retirée est refusé, et l'apporteur garde la révocation depuis son espace. Un secret neuf est
    écarté : le lien est une preuve de réception d'un courriel à l'adresse de l'apporteur, soit
    exactement l'usage que `MAGIC_LINK_SECRET` couvre, et le domaine séparé empêche qu'une signature de
    l'un vaille pour l'autre.

## Conséquences

- Le démarrage refuse un jeu de secrets incomplet, faible, préfixé en production ou dédoublé, avec un
  code de sortie non nul, avant toute requête. Le coût : chaque environnement (poste, bac d'essai,
  production) doit porter neuf valeurs distinctes ; `.env.example` en donne les noms.
- Le câblage de `exigerEnvironnement()` au démarrage réel du serveur n'est pas posé par cet ADR : tant
  qu'il ne l'est pas, la validation n'est exercée que par ses témoins.
- Le texte de REQ-SEC-028 et la ligne HYP-E1-24 disent « sept secrets plus le sel » ; le code en
  porte huit plus le sel. Leur reformulation appartient au `gardien-spec`.
- Retour arrière : retirer `PII_HASH_KEY` imposerait de dériver la clé des empreintes d'une autre
  variable, ce que la tâche du chiffrement refuse ; rogner les valeurs ferait accepter une clé qui
  n'est pas celle qu'on croit ; ouvrir le prédicat de production ferait passer `stub…` en production
  dès que `NODE_ENV` manque.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Empreinte des jetons en SHA-256 nu | Une base lue suffit à tester un jeton candidat hors ligne ; le HMAC exige en plus le secret de l'usage (décision 14). |
| Empreinte des jetons sous `PII_HASH_KEY` | Un secret pour deux usages : les empreintes de personnes et les jetons partageraient une clé, et une rotation de l'une toucherait l'autre. |
| Double clé pendant 24 heures pour les liens | Un lien vit 15 minutes : l'accepter sous l'ancienne clé allonge la vie d'un jeton après une rotation sans aucun gain. |
| Huit secrets, clé des empreintes dérivée de la clé de chiffrement par HKDF | Deux usages sur une même racine ; la tâche du chiffrement exige que la clé et le sel ne soient ni dérivés d'une autre variable ni partagés. |
| Empreintes sous `IP_HASH_SALT` | Un sel d'adresse réseau servirait aussi aux courriels et aux IBAN : un seul secret pour deux usages. |
| `NODE_ENV !== 'production'` comme prédicat | Échoue ouvert : `NODE_ENV` absent laisserait passer `stub…`. |
| `.trim()` des valeurs | Accepte en silence une valeur collée avec un saut de ligne, qui n'est pas la clé qu'on croit. |
| Comparer les valeurs en clair pour l'égalité | Le refus risquerait de les porter ; les empreintes suffisent. |
| Imprimer le `message` des issues Zod | Selon la version et les options, il peut porter la valeur reçue. |
| Un `kid` porté par une variable de plus | Une variable qui peut diverger de la clé qu'elle désigne ; dérivé de la valeur, il ne peut pas. |
| Valider à l'import du module | Un module qui écrit ou sort au seul fait d'être importé est intestable. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/securite/env-boot.spec.ts` ·
  `it('REQ-SEC-028 : la liste est dérivée du schéma et contient chaque nom que le texte de l’exigence cite')` :
  retirer du schéma un nom que l'exigence cite fait rougir ce contrôle (décision 1).
- **Assertion** — `tests/unit/securite/env-boot.spec.ts` ·
  `it('REQ-SEC-028 : .env.example porte exactement les noms du schéma, dans les deux sens, sans aucune valeur')` :
  un nom ajouté d'un seul côté fait rougir ce contrôle (décision 2).
- **Assertion** — `tests/unit/securite/env-boot.spec.ts` ·
  `it('REQ-SEC-028 : deux secrets égaux sont un refus à part entière — le boot sort en non nul et nomme les deux')` :
  retirer le contrôle d'égalité fait sortir le boot en 0 (décision 4, rouge d'origine).
- **Assertion** — `tests/unit/securite/env-boot.spec.ts` ·
  `it('REQ-SEC-028 : préfixes dev_ et stub refusés hors développement et test, NODE_ENV absent compris')` :
  un prédicat de production ouvert fait rougir ce contrôle (décision 5).
- **Assertion** — `tests/unit/securite/env-boot.spec.ts` ·
  `it('REQ-SEC-028 : aucun refus n’imprime une valeur, un fragment de huit caractères ni une longueur')` :
  un refus qui porte la valeur, un fragment, sa longueur ou un texte hors de la grammaire fermée fait
  rougir ce contrôle (décision 6).
- **Assertion** — `tests/unit/securite/env-boot.spec.ts` ·
  `it('REQ-SEC-028 : importer le module n’évalue rien — seul l’appel au boot juge l’environnement')` :
  une validation déclenchée à l'import fait rougir ce contrôle (décision 7).
- **Assertion** — `tests/unit/securite/env-boot.spec.ts` ·
  `it('REQ-SEC-028 : kidDe rend huit caractères hexadécimaux, stables pour une valeur, distincts d’un secret à l’autre')` :
  un `kid` constant fait rougir ce contrôle (décision 8).
- **Assertion** — `tests/unit/securite/chiffrement-avec-aad.spec.ts` ·
  `it('REQ-SEC-024 : le bloc figé selon l’ADR se déchiffre, et seulement sous sa ligne (vecteur déterministe)')` :
  un octet changé dans le format ou dans l'AAD rend le vecteur figé illisible (décisions 9 à 11).
- **Assertion** — `tests/unit/securite/chiffrement-avec-aad.spec.ts` ·
  `it('REQ-SEC-024 : deux chiffrements du même clair diffèrent, IV compris (IV tiré à chaque chiffrement)')` :
  un IV constant fait rougir ce contrôle (décision 9, mesuré par SEC-08).
- **Assertion** — `tests/unit/securite/chiffrement-avec-aad.spec.ts` ·
  `it('REQ-SEC-024 : un bloc permuté vers un autre champ ou un autre modèle au même identifiant échoue')` :
  une AAD réduite au modèle et à l'identifiant fait rougir ce contrôle (décision 10, mesuré par SEC-08).
- **Assertion** — `tests/unit/securite/chiffrement-avec-aad.spec.ts` ·
  `it('REQ-SEC-024 : un courriel et un téléphone écrits de plusieurs façons donnent l’empreinte figée')` :
  une entrée d'empreinte changée d'un octet fait rougir ce contrôle (décision 12).
- **Assertion** — `tests/unit/securite/chiffrement-avec-aad.spec.ts` ·
  `it('REQ-SEC-024 : une colonne d’adresse réseau en clair (createdIp String?) rougit et nomme la colonne')` :
  la garde `securite:schema-pii` qui admettrait une colonne de personne hors `…Chiffre`/`…Hash` fait
  rougir ce contrôle (décision 13, mesuré par SEC-08).

## Reste à faire

- **Décisions 9 à 13** : leurs assertions sont posées par SEC-08 et citées ci-dessus. Le passage à
  `accepte` reste à l'`architecte`.
- **Le `kid` dans les jetons et la double clé pendant 24 heures** (HYP-E1-24, REQ-QA-030) : l'emploi
  du `kid` appartient aux producteurs de jetons (SEC-03, SEC-04, SEC-11) ; le trousseau à deux clés à
  QA-T04 et QA-T13. Les liens de connexion n'y entrent pas (décision 14).
- **Décision 14** : son assertion est posée par SEC-03 (`tests/integration/lien-magique.spec.ts`, un
  vecteur figé d'empreinte de lien sous `MAGIC_LINK_SECRET` et son domaine) et par SEC-04 pour la
  session. Tant qu'elle n'est pas écrite et vue rougir, la décision reste `propose`.
- **Décision 15** : son assertion est posée par SEC-11 — un vecteur figé de signature sous
  `MAGIC_LINK_SECRET` et le domaine `partners.pas-moi.v1`, une signature d'un autre domaine refusée, et
  le même lien joué deux fois qui ne révoque qu'une fois (compte des révocations, jamais le code de
  réponse).
- **Le câblage au démarrage réel** : QA-T04 appelle `exigerEnvironnement()` depuis le point d'entrée
  du serveur et étend CE schéma, jamais un second.
- **Un secret optionnel** (par exemple celui d'une intégration qui doit rendre 503 s'il manque, INT-T11)
  vivra dans une section distincte du schéma, hors de la liste qui refuse le démarrage.
- **La reformulation de REQ-SEC-028 et de HYP-E1-24** (« huit secrets plus le sel ») : `gardien-spec`.
- Le passage à `accepte` appartient à l'`architecte`.
