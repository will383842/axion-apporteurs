# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `0a34b88` — 2026-09-27T03:08:19+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (rien) · 2. #158 (rien) · 3. #165 (un contrôle requis rouge ou une revue manquante) · 4. #166 (un contrôle requis rouge ou une revue manquante) · 5. #168 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 43/116 tâches, reste 56.60 j |
| Le prochain pas | fusionner #82, puis SEC-04 — Sessions révocables en base, `sessionVersion`, step-up (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #148 — 2026-09-26 |

**Ce qu’on tape maintenant.** `gh pr view 82 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

43/116 tâches terminées · reste 56.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 206 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … |
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
| 1 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | rien — fusionnable maintenant |
| 2 | #158 — chore(GOV-053): lot L0-06 — PLAN-STATE à la ligne, rubriques dues, lecteur unique, forme des chemins | `t/lot-l0-06` | rien — fusionnable maintenant |
| 3 | #165 — feat(SEC-17): lot L0-07 — rôles console, matrice unique, requireRole ; gates structurelles de la charte | `t/lot-l0-07` | un contrôle requis rouge ou une revue manquante |
| 4 | #166 — chore(GOV-012): registre rattrape, quatre taches livrees par des PR fusionnees passent fusionnee | `t/registre-rattrapage-3` | un contrôle requis rouge ou une revue manquante |
| 5 | #168 — chore(GOV-045): lot L0-08 — refus nommés, clé double, schema/paths, attestation, occurrences | `t/lot-l0-08` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **41 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, SEC-07, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0008-contrat-evenements-enveloppe-et-nomenclature.md` — partners/ADR-0008 — Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema · `docs/adr/0022-carte-du-schema-des-phases-0-et-1.md` — partners/ADR-0022 — La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition · `docs/adr/0023-route-des-coordonnees-de-candidature.md` — partners/ADR-0023 — Les coordonnées d'un candidat se tirent par une route HMAC d'axionia, jamais par un événement

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**Fusionner #82** — elle est en tête de file et ne bloque sur rien.

**SEC-04** — Sessions révocables en base, `sessionVersion`, step-up (1 j, **sur le chemin critique**) : 37 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `0a34b88` (2026-09-27T03:08:19+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #148 — 2026-09-26 — feat(SEC-04): sessions revocables en base, sessionVersion tenue par la base, relevement

**Fait.** La session de l'espace apporteur est révocable. La consommation d'un lien pose enfin le cookie `__Host-partners-session` (HttpOnly, Secure, SameSite=Lax, Path=/, 30 jours dérivés de `DUREES_AUTH`). `exigerSession` relit en base, à chaque appel, la session, la version et le statut de l'apporteur, et nomme un motif fermé ; `exigerSessionRelevee` exige un lien consommé depuis moins de 10 minutes par la session COURANTE. La base tient `sessionVersion` : le déclencheur `apporteurs_version_de_session` incrémente d'un cran à la résiliation et au changement d'empreinte de courriel, jamais à la suspension, et refuse toute descente ; chaque session ouverte copie la version de son apporteur ; une révocation est définitive. La migration `20260926100000_sessions_revocables` pose aussi les coordonnées chiffrées de l'apporteur (nom, prénom, téléphone et `phone_hash` non unique), l'acceptation de la politique de confidentialité, le code et ses essais sur `liens_magiques`, et la table `changements_courriel` ; module du semeur `prisma/seed/05-sessions.ts`. Mutation : 100 pour cent, 103 mutants sur 103.

**Reste.** Appeler `exigerSession` depuis chaque page et action de l'espace, et effacer le cookie sur refus : SEC-05. Le déclencheur du changement de coordonnée bancaire : SEC-22, avec sa table. L'effet différé du changement de courriel et l'annulation des liens en vol vers l'ancienne adresse : UX-P1-09. La session en lecture seule après résiliation : SEC-19. Les chemins de SEC-04 attendent quatre ajouts au registre, nommés dans le corps de la PR, et `G-SEC-REVOCATION.preuveRouge` reste à poser.

**Appris.** Stryker laisse survivre un mutant STATIQUE : une constante fléchée de module (`const refus = (motif) => ...`) est évaluée au chargement, avant toute activation de mutant, et `() => undefined` y survit alors que chaque test qui l'appelle rougirait. Une déclaration de fonction est évaluée à l'appel : même code, mutant tué. Et Prisma ne rend que la CLÉ d'une unicité violée, jamais le nom de l'index, même en SQL brut par `$executeRawUnsafe` : pour qu'un témoin nomme un index unique partiel, un bloc `DO` relève `CONSTRAINT_NAME` par `GET STACKED DIAGNOSTICS` et le relance dans son message. Les messages des `RAISE EXCEPTION` et des CHECK, eux, traversent.

### PR #145 — 2026-09-26 — feat(SEC-06): lot L0-05 — réception des webhooks axionia, événements reçus et battements ; émetteur e-mail et rebonds

**Fait.** SEC-06 porte la PR, INT-T10 est dans son champ `Lot:`. La réception des événements
d'axionia vérifie le secret dédié, borne le corps à 128 Ko avant de le lire en entier, vérifie la
signature `<secondes>.<corps exact>` à temps constant avec une tolérance de 300 s, juge l'enveloppe
par le Zod publié du contrat et la frontière de REQ-INT-029, puis inscrit l'événement dans
`evenements_recus` avant tout traitement ; le doublon, par `event_id` ou par `paymentId`, est refusé
par la base et rend 200 `{duplicate:true}`. Une version inconnue bien formée est inscrite `held`. Le
travail de fond, confié à `after()`, met en attente le devis sans client et le paiement sans
facture, les réveille à l'arrivée du parent, écrit `en_erreur` sous le nom de l'erreur, et un
battement par passage dans `battements`. La migration `20260927000000_evenements_recus_et_battements`
pose les enums, les tables, les CHECK, les deux index partiels et le déclencheur qui ne laisse
écrire que les cinq colonnes du traitement. L'émetteur d'INT-T10 écrit une ligne `courriels_envoyes`
par demande, retenue et visible quand l'adresse est supprimée ou que le drapeau DMARC n'est pas
vrai, sans appel au relais ; le webhook des rebonds vérifie `Producer-Signature` et seul un rebond
définitif ajoute une ligne à `suppressions_courriel`. Migration
`20260927000100_courriels_envoyes_et_suppressions`, secret et variables dans `src/lib/env.ts`.

**Reste.** Les libellés de `type_evenement_recu` sont tranchés : la base porte la valeur de fil
dont le point devient un souligné, sans `@map`, forme que le point 10 de `partners/ADR-0022`
amendé (`6025808`) et l'acceptance (9) de SEC-06 prescrivent désormais, avis A02 rendu en
revue 5327468600 sur `6025808`. Les effets métier du traitement appartiennent à DM-10-P et
DM-15, qui se brancheront sur le port `dispatch`. La reprise automatique d'un événement
`en_erreur` n'est portée par aucune tâche à ce jour. L'appel réel à l'interface d'envoi du relais et le câblage de
`demanderEnvoi` dans l'envoi du lien magique de SEC-03 attendent la lecture de la rubrique 2 de
`docs/tiers/zeptomail.md`, que `A01` répartit, et la pose du drapeau par Will. La charge réelle d'un
rebond, à enregistrer en fixture, attend la même lecture. Les preuves rouges de
`partners:webhook:idempotent` et `webhook-4-verdicts` attendent un passage de porte A. REQ-QA-026
reste à verser aux `reqs` de SEC-06 par le `gardien-spec`.

**Appris.** Le schéma tranché par l'architecte et une garde bloquante peuvent se contredire : un
libellé Postgres `client.cree` posé par `@map` est refusé par `gov:termes-interdits`, qui lit
`prisma/` et n'exempte que les commentaires des fichiers `.prisma` et `.sql`. Les fixtures du
producteur axionia pseudonymisent `subject_ref` et le payload séparément : l'identifiant du sujet
n'y est plus celui que la charge porte, et une dépendance entre deux événements ne se rejoue pas
sur ces fixtures. Déplacer une constante vers un module partagé fait rougir le contrôle 3 de
`harnais-mcp` : la liste des symboles que la porte MCP peut importer vit dans
`src/server/mcp/registre.ts`. `journal:sans-pii` refuse le mot nu `evenement` jusque dans le nom
d'un paramètre de type.

**Porte A.** Les trois specs d'intégration, écrites sans Docker sur le poste, ont tourné en porte A
(run 36254413689) et sont vertes du premier coup : `webhook.spec.ts` 31 tests,
`webhook-verdicts.spec.ts` 9, `webhook-rebonds.spec.ts` 10. La porte a rougi sur un seul témoin,
`titres-de-test-resolvent.spec.ts` : des titres de test nommaient REQ-QA-008, REQ-QA-009,
REQ-INT-010 et REQ-SEC-011, absorbées. Les titres nomment désormais la survivante, et l'annotation
garde l'absorbée avec son renvoi, la seule forme que `gov:trace` et ce témoin acceptent ensemble.

**Mutation.** La porte A du run 36272143938 a rougi sur Stryker seul : 38,18 % pour un seuil de
79 %, parce que `vitest.mutation.config.ts` ne lançait pas `tests/unit/email/**` (les deux modules
du relais à 0 %, sans couverture) et que la porte MCP, touchée d'une ligne, n'était jugée que par un
test d'intégration. Les tests du relais entrent dans la passe, et des témoins en processus tuent les
survivants : la porte MCP, les adaptateurs Prisma sur un client qui enregistre, les corps de refus,
les bornes et les réarmements. `pnpm mutation:pr` rend 93,99 % en local : 1110 mutants tués sur 1181
jugés. Les 71 restants : 51 dans `src/lib/env.ts`, du code antérieur à la PR dont les tests vivent
hors de ses `paths` ; la constante `CORPS_MAX_OCTETS`, mutée au chargement du module que la passe
incrémentale ne recharge pas (le témoin de la borne rougit sur ce mutant posé à la main) ; 19
équivalents nommés dans le corps de la PR — encodage `utf8` passé à une API
qui l'a par défaut, repli `?? ''` ou `?? '0'` qui donne le même verdict, garde redondante avec la
suivante. La lentille `securite` a relevé que la seconde tentative de `Producer-Signature` vérifiait
le HMAC sur le corps percent-décodé puis lisait le corps reçu : le verdict porte désormais le texte
vérifié, et c'est lui qui est lu. Le rejeu d'une livraison du relais n'est pas borné (le `ts` n'est
pas signé) : sans effet tant que la suppression reste idempotente, dette nommée dans la fiche.

### PR #141 — 2026-09-26 — chore(GOV-012): registre rattrape, huit taches livrees par des PR fusionnees passent fusionnee

**Fait.** Huit tâches livrées par des PR fusionnées portaient encore `a_faire` : GOV-100 (PR 131), QA-T04, CPL-T22, QA-T30 et UX-P0-03 (PR 130, lot L0-03), SEC-03 (PR 134), INT-T11 (PR 136) et GOV-102 (PR 139). Elles passent `fusionnee` par `reclasser.mjs`, revendication constatée sur l'issue puis livraison constatée sur la forge, jamais à la main ; chaque couple a été confronté à la main au titre ou au champ `Lot:` de sa PR. Les trois tâches du lot sans issue en ont reçu une chacune (issues 142, 143 et 144), sur décision du donneur d'ordre. La phase 0 passe de 35 à 43 tâches terminées sur 115, et le prochain pas quitte SEC-03, déjà livrée, pour SEC-04.

**Reste.** Les six tâches du lot de la PR 114 restent exclues (majuscule de `t/lot-L0-02`), et GOV-063 attend toujours GOV-061. QA-T30 porte la réserve écrite par la PR 130 : seuil de rupture à 79, et le blocage à 80 % sur les fichiers touchés n'existe pas. Le retard de fond reste l'objet de GOV-057.

**Appris.** Une PR de lot peut avoir une tête `t/lot-...` et un champ `Lot:` vide : la PR 136 a composé trois tâches et n'en a livré qu'une, INT-T11, les deux autres rendues en `stop`. La tête de branche ne dit donc pas combien de tâches une PR livre ; seuls le titre et le champ `Lot:` le disent. Et une issue de lot ne peut revendiquer que la tâche qui ouvre son titre : le verbe ancre l'identifiant en tête et n'accepte qu'une tâche par issue, si bien qu'une tâche de lot sans issue propre ne passe pas `fusionnee` tant qu'on ne lui en ouvre pas une.

Porte A : deux rouges sur la tête 79f50e2, verts sur `main` 4c1fa00, donc causés par cette PR, et d'une seule cause. Le témoin REQ-INT-026 « tâche repreneuse sans REQ-INT-027 » désignait INT-T11 et lisait son statut dans le registre réel : passée `fusionnee`, elle déclenchait d'abord la famille « est livrée », qui masquait celle que le cas garde. Le témoin REQ-QA-006 « démon absent », qui dérive ses comptes du disque, rougissait par ricochet : `adaptateur-mcp.spec.ts` est l'un des trois fichiers autonomes, et il échouait. Correctif : le statut de la repreneuse est posé dans la fixture (`a_faire`), la famille attendue reste la même ; le fichier de test est ajouté aux chemins de GOV-012 par `ajouter-path.mjs`. Mesuré en local : les 30 cas du fichier verts, le témoin REQ-QA-006 vert (6 dépendants en échec, 3 autonomes au vert), et le cas corrigé rougit encore quand on neutralise dans le harnais le contrôle de REQ-INT-027 (code 0 au lieu de 1). Un témoin qui nomme une tâche réelle pour son CONTENU dépend aussi de son STATUT, et un rattrapage du registre le décale.

… 63 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

