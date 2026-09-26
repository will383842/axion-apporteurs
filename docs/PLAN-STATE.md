# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `76548e9` — 2026-09-26T06:06:25+02:00 |
| Qu’est-ce qui est en vol ? | 1. #136 (un contrôle requis rouge ou une revue manquante) · 2. #140 (un contrôle requis rouge ou une revue manquante) · 3. #82 (un conflit avec `main`) · 4. #139 (brouillon) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 35/115 tâches, reste 61.60 j |
| Le prochain pas | SEC-03 — Lien magique apporteur (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #139 — 2026-09-26 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

35/115 tâches terminées · reste 61.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 213 | JUR-T02, QA-T04, QA-T07, QA-T30, CPL-T22, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 74 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**22.00 j** sur 23 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.25 j, ph 1) → T-ARG-010 (1 j, ph 2) → DM-15 (1.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **14.75 j**.

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

64 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #136 — feat(INT-T11): adaptateur MCP partners — porte, serrure, contrat porté, harnais 9 contrôles, manifeste vide | `t/lot-l0-04` | un contrôle requis rouge ou une revue manquante |
| 2 | #140 — feat(GOV-101): relectures sans defaut — deux lentilles, accord sur patch, pre-gate, mutation:pr | `t/gov-101` | un contrôle requis rouge ou une revue manquante |
| 3 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 4 | #139 — chore(GOV-102): cadrage du schéma des phases 0 et 1 — une table, un créateur ; champ schema remis droit ; INT-T01c et INT-T26 versées | `t/gov-102` | brouillon — hors file tant qu’il n’est pas prêt |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **41 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, SEC-07, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0013-secrets-et-donnees-personnelles-chiffrees.md` — partners/ADR-0013 — Secrets et données personnelles chiffrées · `docs/adr/0022-carte-du-schema-des-phases-0-et-1.md` — partners/ADR-0022 — La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition · `docs/adr/0023-route-des-coordonnees-de-candidature.md` — partners/ADR-0023 — Les coordonnées d'un candidat se tirent par une route HMAC d'axionia, jamais par un événement

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**SEC-03** — Lien magique apporteur (1 j, **sur le chemin critique**) : 42 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `76548e9` (2026-09-26T06:06:25+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #139 — 2026-09-26 — chore(GOV-102): cadrage du schéma des phases 0 et 1 — une table, un créateur ; champ schema remis droit ; INT-T01c et INT-T26 versées

**Fait.** Le cadrage du schéma des phases 0 et 1 décidé par l'architecte le 2026-09-26, sur
délégation de Will, est inscrit au registre : le champ `schema` de vingt et une tâches est remis
droit (DM-01, pourtant fusionnée, compris), les `paths`, `deps` et acceptances des tâches
créatrices et écrivaines portent désormais le schéma exact de chaque table, avec une acceptance
posée pour DM-07, DM-08, DM-12, SEC-11, CPL-T06, INT-T12 et UX-P1-10, qui n'en avaient pas ;
INT-T01c et INT-T26 sont versées ; le glossaire porte vingt-deux enums nouveaux et, au §4.1, les
treize valeurs de `TypeEvenementJournal` avec leur tâche créatrice ; douze exigences sont amendées
ou alignées sur `EvenementRecu` ; `HYP-A02-RETENTION` et `HYP-A02-VOCABULAIRE-QUALIFICATION`
entrent au registre des décisions. Contrôle champ par champ contre `origin/main` : seuls les champs
décidés changent, aucune entrée perdue, aucun texte raccourci. Gardes jouées à 0 : `gov:tasks`,
`gov:hypotheses`, `gov:requirements`, `gov:attributions`, `gov:identifiants`, `gov:lexique`,
`gov:termes-interdits`, `gov:trace:verifier`, `plan-state:verifier`, `lot:paths:check`, `gov:etat`,
`partners:schema:enums`, `gov:preseance`, `gov:publication` ; specs `tests/unit/contrat/`,
`un-nom-une-garde.spec.ts`, `glossaire-enums.spec.ts`, `termes-interdits.spec.ts` et
`contrat-hash.spec.ts` vertes. `gov:adr` rougit sur les trois renvois du glossaire à
partners/ADR-0022, que l'architecte écrit sur cette même branche.

Puis l'architecte, sur la même branche : partners/ADR-0022 (carte du schéma des phases 0 et 1),
partners/ADR-0023 (route HMAC d'axionia des coordonnées de candidature, troisième API) et la
décision 15 de partners/ADR-0013 (lien « ce n'est pas moi » sans état) sont écrits, l'index est
régénéré et `gov:adr` sort à 0. Les créateurs de valeurs de journal (DM-07, DM-08, DM-11, DM-12,
DM-23, SEC-15, CPL-T06, EXT-T01, EXT-T03) portent `src/domain/evenement/charges.ts` et
`docs/GLOSSAIRE.md` dans leurs `paths`, et `prisma/migrations/` quand il manquait (SEC-15, DM-10-P,
DM-23, EXT-T03) ; INT-T01c porte le fichier de partners/ADR-0023. Sur décision de l'orchestrateur,
les colonnes nom, prénom, téléphone et `phoneHash` de `apporteurs` reviennent à SEC-04, dont
l'acceptance gagne un point (7). La route des coordonnées côté axionia est versée en INT-T27-A
(phase 0, `schema: false`, sensible `rgpd`), et INT-T26 en dépend ; EXT-T01 dépend de DM-12, qui
pose le champ chiffré `texte` qu'elle réutilise. Contrôle champ par champ contre la tête
précédente : seuls ces champs ont changé, une tâche ajoutée.

**Reste.** Trois points de la décision restent dus : les `reqs` à ajouter à SEC-06, SEC-04, DM-12
et UX-P1-08 (aucun verbe n'écrit ce champ) ; l'amendement de REQ-INT-004, REQ-QA-007 et
REQ-GOV-020, porté par l'acceptance d'INT-T01c en même temps que le contrat ; la citation de
REQ-EXT-009 par INT-T26. `ProfessionReglementee` est décidée par partners/ADR-0022 (point 16 :
`expertise_comptable`, `auxiliaire_services_financiers`, `intermediaire_assurance`, un par code NAF
de REQ-JUR-022) et reste à inscrire au glossaire avant DM-11. `QualiteExercice` n'est tirée
d'aucune exigence : la liste des statuts d'exercice et leur libellé dans l'article 14 du contrat
sont une décision de Will, à consigner au registre avant DM-11 (proposition dans
partners/ADR-0022).

**Appris.** Une exigence de phase 1 citée par une tâche de phase 0 fait rougir
`gov:requirements` en `phase_non_derivee`, et aucun verbe n'écrit la phase d'une exigence : une
décision qui rattache une exigence à une tâche plus précoce ne s'applique pas par le registre des
tâches seul. Et la ligne d'un enum déjà présent au schéma ne peut énumérer que ce que le schéma
porte : y inscrire d'avance les valeurs d'une tâche future fait rougir `partners:schema:enums` en
`enum_divergent_du_glossaire` le jour même ; les valeurs décidées vivent à côté (§4.1) et entrent
dans la ligne avec la migration qui les crée. Enfin, une acceptance passée au verbe de réécriture
depuis une chaîne entre guillemets doubles du shell a été corrompue en silence : chaque accent grave
y a été exécuté comme une commande, et le verbe a écrit le reste, exit 0. Réécrite depuis un
fichier, relue sur le disque ; le texte d'un champ de registre ne transite jamais par le shell.

### PR #134 — 2026-09-26 — feat(SEC-03): lien magique apporteur — demande indistincte, consommation unique, empreintes HMAC, tables

**Fait.** Le parcours de connexion existe de bout en bout : l'écran `/connexion` (un champ de
courriel étiqueté, un bouton, une réponse qui ne dépend que de l'état rendu par le noyau) et
l'arrivée `/connexion/<jeton>` (une confirmation, jamais une consommation à l'affichage) appellent
`demanderLien` et `consommerLien` par deux actions serveur. Le câblage
(`src/server/auth/lien-magique-production.ts`) lit MAGIC_LINK_SECRET et SESSION_SECRET par le
lecteur de SEC-01, leurs `kid` par `kidDe`, l'adresse publique au registre de l'entité ; les deux
compteurs appellent `limiter` du registre (`magic:ip`, `magic:courriel`) ; le travail différé part
dans `after()`. La migration `20260926000000_lien_magique_et_session` crée `liens_magiques` et
`sessions_espace` et ajoute à `apporteurs` le courriel chiffré et son empreinte unique
(`email_chiffre`, `email_hash`), que l'adaptateur lit pour trouver le compte et l'adresse stockée.
Seules des empreintes HMAC-SHA-256 sont stockées (partners/ADR-0013, décision 14, vecteur figé vu
rougir). SEC-03 porte la PR.

**Reste.** Le cookie de session `__Host-` et la révocation appartiennent à SEC-04 (REQ-SEC-003) : la
session est enregistrée en base, son jeton n'est pas encore remis au navigateur. L'envoi réel du
courriel appartient à INT-T10 ; hors production le lien part au puits du notifieur (`NOTIFY_SINK`),
qui n'écrit ni le lien ni l'adresse, et en production l'envoi échoue en le disant. Le harnais
d'accessibilité de UX-P0-03 est sur `main`, mais il déclare lui-même les routes réelles « non
mesurées » : le serveur de test du navigateur appartient à QA-T16, et le test du parcours sous ce
harnais attend ce serveur. Les deux routes ont leur entrée `size-limit` (plafond dérivé de
REQ-GOV-028) ; le mesureur par route appartient à QA-T20, et la mesure à la main dit que
`/connexion` pèse 175 099 octets de JavaScript compressé (six fichiers, tous du cadriciel, aucun
composant client), au-dessus des 75 Ko de REQ-UX-033. La page « lien déjà utilisé » et le code de repli appartiennent à UX-P1-04, la lecture
seule du résilié à SEC-19. Les colonnes de courriel de l'apporteur, dues par l'acceptance (1) de
SEC-08, sont posées ici. Le test en base réelle n'a tourné qu'en CI, faute de Docker sur le poste.

**Appris.** `next build` réécrit `tsconfig.json` à chaque passage tant que ses réglages manquent,
et le `allowJs` qu'il propose rend inutiles deux `@ts-expect-error` d'une spec de gouvernance :
les réglages imposés sont écrits une fois, `allowJs` à faux. La garde `securite:rate-famille`
refuse un magasin passé à `limiter` hors des tests : le câblage n'en passe aucun, et le témoin en
base réelle remplace les deux ports de comptage dans le test. Une barre oblique inverse suivie de
`b`, écrite dans un gabarit de script, devient un caractère de contrôle invisible dans le fichier
produit.

**Relecture.** La tête `b579da0` a été refusée par `exactitude` (revue 5323893967) : l'écran et le
câblage manquaient, et le Reste disait à tort qu'aucune tâche ne porte l'envoi (INT-T10 le porte).
Ce tour livre l'écran, les actions et leur câblage, et la spec lit l'oracle des limites au registre,
lui-même confronté au texte de REQ-SEC-002. `mutation` a refusé la même tête (revue 5323944954) :
l'adaptateur a désormais sa spec sur faux client (le filtre d'annulation, la condition transmise,
le nombre rendu), chaque CHECK et chaque branche du déclencheur a son témoin en base et sa lecture
statique, et les statuts qui ouvrent l'espace ont leur spec sous le domaine. Six mutants joués
rougissent. Reste équivalent, nommé : `ecrites !== 1` remplacé par `ecrites < 1` survit, parce
que l'empreinte est unique et qu'une consommation n'écrit jamais deux lignes.

**Relecture, second tour.** La tête `d3d0586` a été acceptée par `schema` et `securite`, refusée
par `exactitude` (revue 5324241478) sur un seul motif : l'écran d'arrivée réécrivait l'état vide de
`/connexion/<jeton>`, déjà déclaré dans `etats-vides.ts`, avec un second titre, une seconde phrase
et le même bouton sous une autre apostrophe. L'issue d'un lien qui ne vaut plus lit désormais cet
état vide mot pour mot, les doublons sont retirés de `vocabulaire.ts`, et deux témoins rougissent
si un écran affiche un texte absent de la micro-copie ou si un texte de l'espace existe en deux
graphies. Deux dettes de `securite` sont fermées : un témoin rougit si le travail différé
s'exécute avant la réponse (vu rougir sur le mutant qui l'exécute tout de suite), et l'issue de la
consommation s'affiche sur `/connexion?issue=`, une URL qui ne porte plus le jeton.
`mutation` a refusé la même tête (revue 5324263876) sur des survivants portés par le code ajouté au
premier tour. Les compteurs du câblage sont jugés par leur effet : seul le magasin change, à la
frontière du registre, et chaque port compte sous son nom et refuse à sa limite plus un, panne
distinguée du refus ; le test en base réelle n'a plus de copie des compteurs. Les actions serveur
et la page d'arrivée ont leur spec (piège évalué, travail différé confié à `after()`, empreinte
réseau à la consommation, aucun jeton ni courriel dans les sorties, affichage qui ne consomme
rien) ; le signalement du piège et l'empreinte réseau ont leurs témoins ; la lecture statique
exige le connecteur OR de chaque colonne immuable et refuse tout désarmement dans la migration ;
le statut des apporteurs d'intégration et le piège des observations sont écrits à chaque appel.
Les quatorze mutants de la revue, rejoués un par un sur l'arbre commité, rougissent tous.

**Porte A.** Les quatre lentilles ont accepté `c26a48b`, et la porte A a rougi (run 36214735286) sur
trois témoins, tous défauts de test, aucun du code. Le témoin « la demande d'un apporteur n'annule
pas le lien d'un autre » ne mesurait rien : son apporteur portait le code de parrainage
`AX00SECL`, que la base refuse (`apporteurs_code_parrainage_format`, le L n'est pas dans
l'alphabet Crockford), et la création échouait avant la demande. Le témoin de la seconde session
attendait le nom de la contrainte dans un message que Prisma ne transmet pas pour une requête
brute (code 23505 et détail seulement) : le bloc lit désormais le nom dans le diagnostic de
Postgres (`GET STACKED DIAGNOSTICS`) et exige `sessions_espace_lien_magique_id_key`, sans se
contenter d'un refus quelconque. Le témoin de `perf:budgets` sur le dépôt réel attendait zéro
route : il lit maintenant le nombre de routes sur les fichiers suivis, et exige autant d'entrées.
Les lignes « red-first, 0 rouge » du journal de la porte sont la sortie des témoins de
`tests/unit/qualite/red-first.spec.ts`, sur leurs dépôts jetables : ce spec est vert, et
`pnpm red-first` sur cette branche juge neuf tests nouveaux, neuf rouges contre `main`.

### PR #131 — 2026-09-26 — chore(GOV-100): cadrage de SEC-03 et SEC-04 — deux tables au schéma, empreinte HMAC des jetons, statuts qui ouvrent l'espace

**Fait.** Le cadrage de l'architecte du 2026-09-26, pris sur délégation de Will, est inscrit au
registre : SEC-03 et SEC-04 portent `schema: true`, SEC-03 crée `liens_magiques` et
`sessions_espace` dans une même migration et ses `paths` portent la migration et les modules de
durées, de dépôt du lien et d'accès à l'espace ; SEC-04 étendra `sessions_espace`. L'empreinte des
jetons d'authentification est la décision 14 de partners/ADR-0013 (HMAC-SHA-256 sous le secret de
l'usage, domaine séparé, `kid` stocké, pas de double clé pour les liens), et `HYP-SEC03-ACCES`
ouvre l'espace aux statuts `signe` et `suspendu` et le ferme à `candidat`, `retenu`, `vivier`,
`refuse`, `kyc_en_cours` et `pret_a_signer`. Les points (1) et (5) de l'acceptance de SEC-03 le
disent. Sur décision du coordinateur, prise sur délégation de Will, la PR aligne aussi REQ-SEC-001 sur la
décision 14, corrige la ligne `suspendu` du glossaire (accès à l'espace maintenu, nouveaux dépôts
refusés) et passe DM-11 à `schema: true`, dette nommée par la PR 124. Après les deux relectures,
REQ-SEC-003 et le point (2) de SEC-04 ne font plus révoquer les sessions à la suspension, seulement
à la résiliation, au changement de courriel ou d'IBAN et pour motif de sécurité (contrat art. 3.8) ;
`HYP-SEC03-ACCES` devient une liste blanche, `HYP-E1-24` exclut les liens de la double clé, et les
art. 3.7 al. 3 et 12.3 que cite `HYP-SEC03-ACCES` ont leur ancrage dans `CONCORDANCES`. GOV-100
porte la PR. Gardes jouées à 0 : `gov:tasks`, `gov:hypotheses`,
`gov:attributions`, `gov:trace:verifier`, `plan-state:verifier`, `lot:paths:check`,
`gov:identifiants`, `gov:lexique`, `gov:termes-interdits`, `gov:adr`, `gov:requirements`,
`gov:preseance`, `partners:schema:enums`, `gov:etat`, `gov:publication`,
`tests/unit/gouvernance/un-nom-une-garde.spec.ts`, `tests/unit/gouvernance/glossaire-enums.spec.ts`
et `tests/unit/contrat/`.

**Reste.** SEC-03 peut être attribuée sur ce cadrage. L'assertion de la décision 14 (un vecteur
figé d'empreinte de lien) est due par SEC-03, celle de la session par SEC-04 : d'ici là,
partners/ADR-0013 reste `propose`. Le mot « suspension » de REQ-SEC-002 et du point (3) de SEC-03
désigne le refus d'une demande de lien au-delà de la limite de débit, pas le statut `suspendu` :
il ne contredit pas `HYP-SEC03-ACCES`.

**Appris.** Aucun verbe hors dépôt ne savait écrire `schema` dans `docs/tasks.json` : la dette
nommée par la PR 124 pour DM-11 bloquait aussi ce cadrage. Le champ est écrivable depuis ce jour
par `reecrire-champ.mjs`, sa valeur jugée booléenne par le schéma du dépôt ; DM-11 a été corrigée
par le même geste dans cette PR. Et une ligne du registre des décisions qui cite un article du
contrat fait rougir REQ-JUR-003 tant que `CONCORDANCES` ne l'ancre pas : les gardes de gouvernance
sortaient à 0, seule `tests/unit/contrat/` le voyait. Une PR qui écrit `docs/DECISIONS.md` la lance.

… 58 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

