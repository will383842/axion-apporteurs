# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `4c1fa00` — 2026-09-26T08:39:08+02:00 |
| Qu’est-ce qui est en vol ? | 1. #140 (un contrôle requis rouge ou une revue manquante) · 2. #141 (un contrôle requis rouge ou une revue manquante) · 3. #82 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 43/115 tâches, reste 55.60 j |
| Le prochain pas | SEC-04 — Sessions révocables en base, `sessionVersion`, step-up (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #141 — 2026-09-26 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

43/115 tâches terminées · reste 55.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 205 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 82 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**22.00 j** sur 23 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.25 j, ph 1) → T-ARG-010 (1 j, ph 2) → DM-15 (1.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **13.75 j**.

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
| 1 | #140 — feat(GOV-101): relectures sans defaut — deux lentilles, accord sur patch, pre-gate, mutation:pr | `t/gov-101` | un contrôle requis rouge ou une revue manquante |
| 2 | #141 — chore(GOV-012): registre rattrape, huit taches livrees par des PR fusionnees passent fusionnee | `t/registre-fusionnees-2` | un contrôle requis rouge ou une revue manquante |
| 3 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |

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

**SEC-04** — Sessions révocables en base, `sessionVersion`, step-up (1 j, **sur le chemin critique**) : 36 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `4c1fa00` (2026-09-26T08:39:08+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #141 — 2026-09-26 — chore(GOV-012): registre rattrape, huit taches livrees par des PR fusionnees passent fusionnee

**Fait.** Huit tâches livrées par des PR fusionnées portaient encore `a_faire` : GOV-100 (PR 131), QA-T04, CPL-T22, QA-T30 et UX-P0-03 (PR 130, lot L0-03), SEC-03 (PR 134), INT-T11 (PR 136) et GOV-102 (PR 139). Elles passent `fusionnee` par `reclasser.mjs`, revendication constatée sur l'issue puis livraison constatée sur la forge, jamais à la main ; chaque couple a été confronté à la main au titre ou au champ `Lot:` de sa PR. Les trois tâches du lot sans issue en ont reçu une chacune (issues 142, 143 et 144), sur décision du donneur d'ordre. La phase 0 passe de 35 à 43 tâches terminées sur 115, et le prochain pas quitte SEC-03, déjà livrée, pour SEC-04.

**Reste.** Les six tâches du lot de la PR 114 restent exclues (majuscule de `t/lot-L0-02`), et GOV-063 attend toujours GOV-061. QA-T30 porte la réserve écrite par la PR 130 : seuil de rupture à 79, et le blocage à 80 % sur les fichiers touchés n'existe pas. Le retard de fond reste l'objet de GOV-057.

**Appris.** Une PR de lot peut avoir une tête `t/lot-...` et un champ `Lot:` vide : la PR 136 a composé trois tâches et n'en a livré qu'une, INT-T11, les deux autres rendues en `stop`. La tête de branche ne dit donc pas combien de tâches une PR livre ; seuls le titre et le champ `Lot:` le disent. Et une issue de lot ne peut revendiquer que la tâche qui ouvre son titre : le verbe ancre l'identifiant en tête et n'accepte qu'une tâche par issue, si bien qu'une tâche de lot sans issue propre ne passe pas `fusionnee` tant qu'on ne lui en ouvre pas une.

Porte A : deux rouges sur la tête 79f50e2, verts sur `main` 4c1fa00, donc causés par cette PR, et d'une seule cause. Le témoin REQ-INT-026 « tâche repreneuse sans REQ-INT-027 » désignait INT-T11 et lisait son statut dans le registre réel : passée `fusionnee`, elle déclenchait d'abord la famille « est livrée », qui masquait celle que le cas garde. Le témoin REQ-QA-006 « démon absent », qui dérive ses comptes du disque, rougissait par ricochet : `adaptateur-mcp.spec.ts` est l'un des trois fichiers autonomes, et il échouait. Correctif : le statut de la repreneuse est posé dans la fixture (`a_faire`), la famille attendue reste la même ; le fichier de test est ajouté aux chemins de GOV-012 par `ajouter-path.mjs`. Mesuré en local : les 30 cas du fichier verts, le témoin REQ-QA-006 vert (6 dépendants en échec, 3 autonomes au vert), et le cas corrigé rougit encore quand on neutralise dans le harnais le contrôle de REQ-INT-027 (code 0 au lieu de 1). Un témoin qui nomme une tâche réelle pour son CONTENU dépend aussi de son STATUT, et un rattrapage du registre le décale.

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

**Relecture.** Lentille `securite` : accord. Lentille `exactitude` : refus sur un seul défaut,
INT-T26 et EXT-T03 écrivaient ou lisaient les colonnes de coordonnées de `apporteurs` que SEC-04
crée, sans dépendance vers SEC-04 ; SEC-04 est ajoutée à leurs `deps` depuis un fichier, relue sur
le disque. Au passage : la décision 15 de partners/ADR-0013 précise que l'ouverture du lien « ce
n'est pas moi » ne révoque rien, seule l'action de la page le fait, à cause des analyseurs de liens
des messageries ; partners/ADR-0023 impose désormais le plafond de lecture qu'elle invoquait (cinq
lectures par candidature sur vingt-quatre heures, point (7) d'INT-T27-A) ; UX-P1-09 reçoit une
acceptance, dont une réponse identique quand la nouvelle adresse est déjà portée par un autre
apporteur ; l'apostrophe perdue du point 3 d'INT-T26 est rendue, et le point 2 d'INT-T05 ne compte
plus sept types ; partners/ADR-0022 nomme les tâches qui étendent `apporteurs`, colonne par colonne.
Seconde relecture sur bed1887 : les deux lentilles accordent.

**Porte A.** Deux rouges réels, causés par le registre que cette PR modifie. (1) Le témoin
« REQ-GOV-011, cas 1 » lisait DM-01 dans le registre réel : DM-01 passée `schema: true`, la
troisième lentille attendue devenait `schema` au lieu de `simplicite`. Les tâches de la PR fictive
sont désormais fixées à `schema: false` dans le témoin, qui porte sur la sensibilité au milieu de la
liste ; le risque élevé vient toujours du `sensible` réel de DM-01. (2) Le témoin du plancher de
`gov:trace` retirait une tranche partant du milieu de la liste, et la tranche débordait dès que le
périmètre dépassait deux fois le plancher (la tâche versée ici l'a fait passer) : son départ est
borné à la liste, même correctif que la PR 136. Les deux specs passent en local, 45 cas ; leurs
fichiers entrent aux `paths` de GOV-102.

**Reste.** DM-11 cite encore REQ-DM-013 alors que `contrats` naît de DM-23 : aucun verbe n'écrit le
champ `reqs`, la citation reste jusqu'à ce qu'un verbe le permette. Trois points de la décision restent dus : les `reqs` à ajouter à SEC-06, SEC-04, DM-12
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

### PR #136 — 2026-09-26 — feat(INT-T11): adaptateur MCP partners — porte, serrure, contrat porté, harnais 9 contrôles, manifeste vide

**Fait.** Lot L0-04 composé de trois tâches, une seule livrée : INT-T11. `POST /api/mcp` juge dans
cet ordre le secret propre `PARTNERS_MCP_SHARED_SECRET` (absent : 503), le limiteur avant la serrure
(429, ou 503 en panne), la serrure `x-mcp-secret` à temps constant (401), puis le JSON-RPC. Le contrat
du socle axion-ops est porté dans `src/server/mcp/socle.ts`, valeurs lues et sceau exécuté au commit
`473e2aa`. Le manifeste est versionné dans `src/server/mcp/manifeste.json` et confronté au code par
`pnpm mcp:manifeste`. Le registre est vide : le socle refuse un manifeste sans outil, et le fichier
porte ce refus au lieu de le contourner. `pnpm harnais-mcp`, en porte A, joue les neuf contrôles, le
rang 2 optionnel et le sceau, et imprime ce que chacun a confronté.

**Reste.** SEC-06 rendue en stop : la table `WebhookRecu` de REQ-DM-036 et les index uniques sur
`paymentId` et `refundId` exigent le schéma, et la tâche porte `schema: false` (question à A02).
INT-T10 rendue en stop pour la même raison : la liste de suppression de REQ-INT-023 et l'envoi retenu
exigent une table ou une valeur de plus dans `TypeEvenementJournal` (question à A02) ; la forme de
`Producer-Signature` attend aussi sa lecture dans `docs/tiers/zeptomail.md`. La route servie refuse
tout (503) tant que le registre de débit ne porte pas de compteur pour elle : la limite et la conduite
sur panne sont à chiffrer dans REQ-INT-026, et la famille `mcp:` à ouvrir dans REQ-SEC-016, par le
gardien de la spécification avant INT-T13. Le secret est à poser par Will selon REQ-INT-031 ; il est désormais dans `schemaSecrets`, donc
exigé au démarrage : sans lui, l'instance refuse de démarrer. Le
plafond de 6 500 octets par outil et `detectPii` sur les jeux maximaux viennent avec le premier outil
(INT-T13, INT-T17).

**Appris.** Le socle refuse un manifeste sans outil (`tools : vide`) et ses contrôles par outil ont
un plancher de 1 : un adaptateur de phase 0 qui porterait le harnais du socle à l'identique serait
rouge par construction. Le vide se déclare donc, avec un motif et la tâche qui le reprend, et le
harnais refuse la déclaration dès qu'un outil existe. Le registre de débit ne peut porter un compteur
que si l'exigence citée écrit sa conduite sur panne après l'ancre : une porte neuve sans chiffre dans
son exigence ne se branche sur aucun limiteur réel, elle refuse. Enfin, le contrôle 2 du socle lit le
source brut, commentaires compris : écrire le nom de l'environnement global dans un commentaire d'un
fichier de l'adaptateur suffit à le faire rougir. Et un fichier de `src/` dont le nom contient
`contrat` est pris par `gov:entite` pour le point de sortie du contrat d'apporteur : le contrat du socle
vit donc dans `socle.ts`. Enfin, un fichier de `tests/integration/` ne nomme pas l'objet global
du processus, sauf `execPath` : la garde statique du harnais de conteneurs le refuse. Une variable
d'environnement s'y pose par `vi.stubEnv`, et un binaire s'y lance par `execPath` et le chemin de
`tsx`.

**Relecture.** Sur la tête `569c8e8`, `exactitude` (5324475209) et `securite` (5324475255)
acceptent ; `simplicite` refuse (5324475297) et `mutation` refuse (5324475334). `simplicite` : les
boucles des contrôles 7 et 13.3 parcouraient le brouillon du manifeste, qui exclut justement les
outils en anomalie ; le contrôle 13.3 imprimait vert sur un champ de rang 2 obligatoire.
`analyserOutils` range désormais chaque refus sous le contrôle qui le juge, et les contrôles 1, 5,
6, 7 et 13.3 le lisent au lieu de retaper la règle ; un outil injecté par règle rougit son
contrôle. La comparaison à temps constant et le limiteur non déclaré vivent dans
`src/server/securite/primitives-de-porte.ts`, partagé avec la frontière axionia, et l'étape
`mcp:manifeste` de la porte A, qui rejouait le contrôle 6, est retirée. `mutation` : les cinq
conditions du périmètre vide, le contrôle 2 vidé, les planchers des contrôles 8 et 9, le limiteur
consulté une seule fois et le champ inconnu du manifeste survivaient ; chacun a désormais son
témoin, et les seize mutants rejoués sur la spec sont tous tués. Dans le même tour, sur la dette
de `securite` : `PARTNERS_MCP_SHARED_SECRET` entre dans `schemaSecrets` et suit REQ-SEC-028 (trop
court, égal à un autre secret ou préfixé `dev_` en production : 503), les deux 503 d'avant la
serrure portent le même corps, et le corps est borné à 128 Ko (413), borne de REQ-SEC-010. Appris :
un mutant écrit `[] && x` vaut `x` en JavaScript, un tableau vide étant vrai ; il ne mute rien, et
sa survie ne dit rien de la garde. Enfin, la Gate A de ce tour a rougi sur le témoin du plancher de
`gov:trace` : INT-T11 porte son périmètre à 90 tâches, exactement deux fois le plancher, et la tranche
prise au milieu de la liste débordait d'une case. La tranche est désormais bornée à la liste.

… 60 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

