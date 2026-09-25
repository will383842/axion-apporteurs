# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `835d899` — 2026-09-25T23:02:20+02:00 |
| Qu’est-ce qui est en vol ? | 1. #91 (un contrôle requis rouge ou une revue manquante) · 2. #93 (un contrôle requis rouge ou une revue manquante) · 3. #82 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 33/110 tâches, reste 58.60 j |
| Le prochain pas | SEC-03 — Lien magique apporteur (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #128 — 2026-09-25 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

33/110 tâches terminées · reste 58.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 210 | JUR-T02, QA-T04, QA-T07, QA-T30, CPL-T22, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 72 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **13.50 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

- W9
- W6
- DEC-INT-002 — **bloquante (§1 du registre)**
- W12
- W11

## Hypothèses par défaut appliquées

60 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un contrôle requis rouge ou une revue manquante |
| 2 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un contrôle requis rouge ou une revue manquante |
| 3 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **52 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T03, SEC-08, SEC-07, DM-06, JUR-T01, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-047, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091, GOV-092, GOV-095, GOV-096, GOV-098, GOV-097, GOV-099 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0013-secrets-et-donnees-personnelles-chiffrees.md` — partners/ADR-0013 — Secrets et données personnelles chiffrées · `docs/adr/0020-le-champ-lot-declare-les-taches-d-une-pr-de-lot.md` — partners/ADR-0020 — Une PR de lot déclare ses tâches dans un champ `Lot:`, et la garde le croit exactement autant que le titre · `docs/adr/0021-quatre-lentilles-pour-l-argent-la-securite-et-les-donnees.md` — partners/ADR-0021 — Quatre lentilles pour l'argent, la sécurité et les données, deux pour le reste ; la prose inexacte est une dette, pas un refus

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**SEC-03** — Lien magique apporteur (1 j, **sur le chemin critique**) : 42 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `835d899` (2026-09-25T23:02:20+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #128 — 2026-09-25 — feat(DM-06): entite Apporteur, statut et matrice, code de parrainage, jetons, isTest, identites datees

**Fait.** L'entité Apporteur existe : `StatutApporteur` (neuf valeurs), `MotifResiliation` et
`RegimeTva` au schéma, tables `apporteurs`, `jetons_depot` et `identites_facturation` par une
migration additive, CHECK de forme et déclencheur `jetons_depot_revocation_definitive` en SQL brut.
Le domaine `src/domain/apporteur/` porte la matrice de transitions, le code de parrainage Crockford
sur 30 bits, le jeton de dépôt (empreinte seule), `actif` et `dormant` dérivés avec la durée en
paramètre, la population hors `isTest`, les autofactures par identité datée et le snapshot de
candidature figé, en parité sur la fixture du producteur réel.

**Reste.** La spec d'intégration `tests/integration/apporteur-jeton-depot.spec.ts` n'a tourné qu'en
CI : pas de démon Docker sur le poste de l'auteur. Les effets de la résiliation (attributions,
lignes, événements) et la trace nominative d'une surcharge de seuil ne sont pas ici. La matrice de
transitions est dérivée du sens des statuts au glossaire §2 : une flèche manquante s'ajoute par la
tâche qui la cite. `scripts/gates/gov-attributions.ts` est touché hors des `paths` de DM-06, pour
déclarer en contexte la ligne `Source:` de la fixture.

**Appris.** `gov:publication` lit tout `montantCents: NN` à deux chiffres ou plus comme un montant de
grille, y compris dans un test : un témoin d'agrégat s'écrit avec des montants à un chiffre.
`gov:attributions` lit la ligne `Source:` d'une fixture comme une attribution : nommer la tâche du
producteur exige une déclaration `contexte` dans `CITATIONS_DECLAREES`.

**Relecture.** L'architecte A02 a refusé la tête `9178314` (revue 5321833681) sur deux motifs, et
`exactitude` et `securite`, qui acceptaient, relevaient des dettes voisines. (1) Le déclencheur ne
comparait que `revoque_at` : changer l'empreinte d'un jeton révoqué puis réinsérer l'ancienne le
réactivait, et `TRUNCATE` passait. Désormais une ligne révoquée est gelée (tout `UPDATE` et tout
`DELETE` refusés), l'empreinte ne change jamais, même sur un jeton actif, un déclencheur
d'instruction refuse `TRUNCATE`, et `CHECK revoque_at >= cree_at` est posé ; trois témoins
d'intégration et une lecture statique de la migration, qui rougit sans Docker. (2) La matrice
passe à la forme `statut x evenement -> statut` de CONVENTIONS §2 : liste fermée
`EVENEMENTS_APPORTEUR`, un événement par flèche, flèches inchangées, balayage de 9 x 9 cellules.
Le champ de la demande s'appelle `evenementApporteur` : `journal:sans-pii` réserve le mot nu du
journal à son écrivain unique. Enfin la source d'aléa de production du code de parrainage est
exportée (`sourceAleatoireSysteme`, sur `crypto.getRandomValues`), avec un test qui la prouve non
constante.

`mutation` a refusé la même tête (revue 5321894722) : aucun test ne fixait les flèches, le balayage
lisait la matrice qu'il jugeait. Les couples attendus sont désormais écrits en littéraux dans la
spec, confrontés dans les deux sens ; un motif hors vocabulaire est refusé (`motif_inconnu`) ; le
jeton en clair est prouvé égal aux octets injectés et son empreinte à leur SHA-256 ; le refus d'une
charge nomme le champ, jamais une valeur. Rejoué par le harnais du relecteur, adapté à la matrice
réécrite : 15 mutants sur 15 tués, dont les cinq survivants d'avant.

Tour 3 : A02, `exactitude` et `securite` acceptent `6e69616` ; `mutation` refuse (revue
5322200613) et `gate-a` est rouge sur la couverture des branches (90 % sur
`snapshot-candidature.ts`). Un témoin fixe désormais le refus d'une charge qui n'est pas un objet
(`(racine)`), la couverture de `src/domain/apporteur/**` est à 100 %. La contrainte
`jetons_depot_revocation_apres_creation` est lue par la spec statique et jouée en intégration. La
lecture statique de la migration juge la FORME des branches du déclencheur (chaque condition
suivie d'un RAISE) et leur ORDRE, et refuse une clause WHEN : les mutants qui ne rougissaient
qu'en intégration rougissent sans Docker. La valeur refusée par la matrice est nommée et bornée à
64 caractères ; plusieurs motifs hors liste sont essayés ; un espion prouve que la source de
production délègue à `crypto.getRandomValues`. Onze mutants rejoués, onze tués.

Dettes nommées, non traitées ici : aucune sortie depuis `kyc_en_cours` ni `pret_a_signer` hors
l'avancée, car ni le glossaire §2 ni REQ-DM-011 n'en prévoient (un KYC abandonné reste bloqué ; à
trancher avant la tâche qui la citera) ; `parrain_code_capture` reste sans borne, faute de valeur
décidée ; le chevauchement d'identités de facturation n'est refusé que par le domaine, une
contrainte `EXCLUDE USING gist` demande l'extension `btree_gist` et revient à la tâche qui écrit
les identités ; l'effacement d'un apporteur passe par l'anonymisation, ses jetons révoqués étant
indélébiles.

### PR #126 — 2026-09-25 — feat(SEC-08): chiffrement PII avec AAD, empreintes HMAC, empreinte d'adresse seule, garde de schema

**Fait.** `src/server/securite/pii.ts` porte la primitive des données personnelles, au format de
`partners/ADR-0013`. `clesPii(process.env)` fait juger l'environnement par `lireEnvironnement`
(SEC-01) et rend trois clés, une par usage, dans un type marqué que nulle autre fonction ne
fabrique. `encryptPii` et `decryptPii` chiffrent en AES-256-GCM, IV tiré à chaque appel, avec
l'AAD `["partners.pii",1,modele,champ,id]` : un bloc déplacé vers une autre ligne, un autre champ
ou un autre modèle échoue en nommant l'échec d'authentification. `colonnesPii` est le chemin
d'écriture : il rend l'identifiant lié, les blocs de suffixe `Chiffre` et les empreintes
`emailHash`, `phoneHash`, `ibanHash`. `empreinteRecherche` fait un HMAC sous `PII_HASH_KEY` pour
le courriel, le téléphone, l'IBAN (clé jugée par `cleIbanValide`) et le SIRET.
`empreinteAdresseReseau` appelle `empreinteAdresse` de la frontière sous `IP_HASH_SALT`. La garde
`securite:schema-pii` (alias `G-SEC-SCHEMA-PII`, câblée en CI avec son `:prove`, 10 familles,
32 témoins, 5 contre-témoins) refuse deux choses : une colonne de personne en clair dans le
schéma, et un bloc ou une empreinte écrits hors de `pii.ts`. 24 tests. Huit défauts injectés un à
un ont chacun fait rougir leur contrôle.

**Reste.** Aucun modèle de personne n'existe encore : DM-06 et DM-07 poseront les premières
colonnes, et la garde les jugera. L'IBAN de la pièce RIB (DM-11) passera par `colonnesPii`. La
double clé de rotation (HYP-E1-24) appartient à QA-T04 et QA-T13. Le module client unique
`src/server/db.ts`, que `journal-sans-pii.ts` attribue à SEC-08, n'est pas dans les chemins de la
tâche et n'est pas posé. Le passage de `partners/ADR-0013` à `accepte` appartient à l'architecte.

**Appris.** La branche du 19/09 recopiait la normalisation IPv6 de SEC-10 et le HMAC d'adresse de
SEC-07, arrivés sur main après elle : une branche reprise se relit contre le main du jour, pas
contre celui de sa naissance. Un type marqué ne se construit pas par un littéral sous la règle
`consistent-type-assertions` : on type d'abord l'objet sans la marque, puis on l'affirme.
`gates:prouvees` ne reconnaît une preuve que sous la forme `pnpm <garde>:prove`, suivie d'un tiret
cadratin : un trait d'union simple la déclare non référencée. Une garde dont l'identifiant de
registre diffère de son nom de commande grossit une dette figée par `un-nom-une-garde.spec.ts` :
l'identifiant est donc le nom de commande, et l'ancien nom `G-SEC-...` passe en alias. Une garde
qui balaie les fichiers suivis s'inscrit aussi dans les deux registres de
`refus-de-rendre-et-de-publier.spec.ts` (sorties déclarées, gardes qui balaient), et établit son
périmètre avant de lire quoi que ce soit.

**Relecture.** La tête `a7e647a` a été refusée par `securite` (revue 5321613521, veto rgpd) et
par `simplicite` (5321613688). `securite` : la garde remontait d'un littéral jusqu'à `data` sans
traverser un ternaire, un ET logique ni un étalement. Ainsi
`data: { ...(ip ? { ipHash: ip } : {}) }` et `data: { ...(e && { emailHash: e }) }` sortaient en
0. La garde DESCEND désormais depuis la valeur de la clé d'écriture : objets, tableaux,
étalements, ternaires sur leurs deux branches, `&&`, `||`, `??`, parenthèses, `as`, `satisfies`,
`!`. Elle juge une valeur protégée sur chacune de ces branches. Les clés d'écriture comprennent
aussi `createMany`, `updateMany`, `upsert` et `connectOrCreate`. Un champ protégé posé sous la clé
dans une forme qu'elle ne descend pas (un appel, une fonction) rougit la nouvelle famille
`ecriture_non_jugee`, en échec fermé. Seuls les arguments d'une fonction de `pii.ts` en sont
exemptés. Les deux scénarios du relecteur, `??`, `satisfies`, un objet imbriqué conditionnel et
une fonction immédiate sont des témoins. Un producteur dans un ternaire est un contre-témoin, et il
était un faux positif avant. Couper une branche de la descente fait rougir `--prove`.
`simplicite` : le test retapait l'expression de `HASH_HEX_64` ; il l'importe. Mutée en 63
caractères, la copie restait verte et l'import rougit. L'alias `segments` est retiré. Dette
laissée : `empreinteAdresseReseau` ne normalise pas son entrée. Elle attend le sujet que rend
`adresseDuClient` (une IPv4, ou le /64 d'une IPv6), et une IPv6 complète passée par erreur serait
hachée entière. La normaliser demande d'accepter la forme /64 et d'ajouter un motif de refus : cela
reviendra au premier appelant (DM-07). Le lexique ne reconnaît pas `remoteAddr` : cela relève du
propriétaire de `champs.ts`. Le registre `docs/gates.json` (champs `verifie` et `preuveRouge`,
réécrits par `hors-depot/reecrire-champ.mjs`) et sa vue `docs/GATES.md` décrivent la nouvelle
portée : sept clés d'écriture, 10 familles, 21 témoins, 5 contre-témoins.

Second tour : `exactitude`, `securite` (veto levé) et `simplicite` acceptent la tête `2c2a6cf`, et
`mutation` la refuse (5321838301). Cinq mutants de la garde survivaient. Chacun rendait admise une
écriture de clair dans une colonne de suffixe Hash : tout appel pris pour un producteur, la clé
`update` d'un `upsert` retirée, la branche fausse d'un ternaire en valeur ignorée, un ET logique en
valeur toujours admis, et `||` ou `??` jugés sur leur seul opérande droit. Onze témoins les tuent,
dans le spec comme au `--prove`, qui passe à 32 témoins. Le spec exige désormais la FAMILLE et plus
seulement le code 1 : sans cela, `ecriture_non_jugee` masquait la coupure d'une branche de la
descente. Dix mutants ont été rejoués sur le correctif, et chacun fait rougir le spec et le
`--prove`. La règle de descente, écrite deux fois, n'est plus écrite qu'une fois (`issues`). La
limite déclarée nomme aussi `Object.fromEntries` et les méthodes homonymes d'une fonction de
`pii.ts`. Les champs `preuveRouge` et `verifie` sont réécrits par le même verbe. Les clés
`createMany`, `updateMany`, `upsert` et `connectOrCreate` sont redondantes : en écriture Prisma
imbriquée, elles vivent toujours sous une clé `data`, `create` ou `update`. Les retirer toutes les
quatre est un mutant qui survit (rejoué), et c'est un mutant équivalent pour toute écriture posée
dans l'appel. `main` a été refusionnée pour un conflit sur le cliquet des sorties déclarées (51 d'un
côté, 54 de l'autre, 55 après la fusion).

### PR #124 — 2026-09-25 — chore(GOV-099): cadrage de DM-06 — sourceCanal transporte, IBAN hors DM-06, glossaire

**Fait.** Les trois contradictions sur lesquelles le développeur de DM-06 avait rendu `stop` sont
levées au registre, par les décisions du 2026-09-25 prises par l'orchestrateur sur délégation de
Will : `sourceCanal` devient une chaîne transportée figée (REQ-DM-035 amendée,
`HYP-DM06-SOURCE-CANAL`), sa dérivation vers `CanalCandidature` passe à EXT-T03 ; l'IBAN sort de
DM-06 pour la pièce RIB du KYC chiffrée par SEC-08 (REQ-CPL-005 amendée, `HYP-DM06-IBAN`, DM-11
dépend de SEC-08) ; le glossaire porte `StatutApporteur`, `MotifResiliation`, `RegimeTva` et
`CanalCandidature` au §4. Code de parrainage fixé (`HYP-DM06-CODE-PARRAINAGE`), `DORMANCE_JOURS`
en paramètre, témoin du dépôt au-delà du seuil déplacé vers DM-09, `paths` et `tests` de DM-06
complétés. GOV-099 porte la PR.

**Reste.** DM-06 peut reprendre sur ce cadrage. EXT-T03 porte désormais la table chemin → canal
et ses tests ; DM-09 porte le témoin de REQ-DM-010. La SSOT des seuils (JUR-T02) reste à écrire :
d'ici là, `DORMANCE_JOURS` n'existe qu'en paramètre. La lentille exactitude a refusé `99cc471`-`2cefb8f` : DM-06 devait poser une référence vers `PieceKyc`, qui n'existe qu'avec DM-11, dépendante de DM-06. La référence à la pièce RIB part entièrement dans DM-11 ; DM-06 crée `IdentitesFacturation` sans colonne de RIB. Le journal de dépassement de `sourceCanal` consigne sa longueur, jamais sa valeur, et la dette « `linkedin`/`jobboard` seulement par `utm` » est nommée dans EXT-T03. Reste une dette : DM-11 écrit désormais le schéma (`prisma/schema.prisma` et `prisma/migrations/` dans ses `paths`) mais porte encore `schema: false`, champ qu'aucun verbe hors dépôt n'écrit ; `lot:paths` le signale dans `schemaContredit`, à corriger avant son attribution.

**Appris.** `partners:schema:enums` ne confronte que les enums DÉCLARÉS par le schéma Prisma au
glossaire : un enum que le glossaire énumère sans qu'il existe encore dans le schéma ne rougit
pas. Poser `StatutApporteur` et ses voisins au §4 AVANT DM-06 fait que la première migration de
DM-06 sera jugée contre ces valeurs, au lieu d'en fixer elle-même le vocabulaire.

… 51 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

