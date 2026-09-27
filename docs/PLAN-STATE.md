# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `9620e4d` — 2026-09-27T06:30:49+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (rien) · 2. #165 (un contrôle requis rouge ou une revue manquante) · 3. #168 (un contrôle requis rouge ou une revue manquante) · 4. #175 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 47/116 tâches, reste 53.10 j |
| Le prochain pas | fusionner #82, puis SEC-17 — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #169 — 2026-09-27 |

**Ce qu’on tape maintenant.** `gh pr view 82 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

47/116 tâches terminées · reste 53.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 202 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … (12 affichées sur 202 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 86 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 86 — liste complète : `docs/TASKS.md`) |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**22.00 j** sur 23 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.25 j, ph 1) → T-ARG-010 (1 j, ph 2) → DM-15 (1.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **12.75 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

Aucune : toutes les décisions dont la phase courante dépend sont codables dans `docs/DECISIONS.md` — tranchées, ou portées par une hypothèse par défaut.

## Hypothèses par défaut appliquées

60 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | rien — fusionnable maintenant |
| 2 | #165 — feat(SEC-17): lot L0-07 — rôles console, matrice unique, requireRole ; gates structurelles de la charte | `t/lot-l0-07` | un contrôle requis rouge ou une revue manquante |
| 3 | #168 — chore(GOV-045): lot L0-08 — refus nommés, clé double, schema/paths, attestation, occurrences | `t/lot-l0-08` | un contrôle requis rouge ou une revue manquante |
| 4 | #175 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal | `t/lot-l0-09` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

## Décisions du jour

`docs/adr/0008-contrat-evenements-enveloppe-et-nomenclature.md` — partners/ADR-0008 — Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema · `docs/adr/0022-carte-du-schema-des-phases-0-et-1.md` — partners/ADR-0022 — La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition · `docs/adr/0023-route-des-coordonnees-de-candidature.md` — partners/ADR-0023 — Les coordonnées d'un candidat se tirent par une route HMAC d'axionia, jamais par un événement

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**Fusionner #82** — elle est en tête de file et ne bloque sur rien.

**SEC-17** — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (1 j, **sur le chemin critique**) : 35 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `9620e4d` (2026-09-27T06:30:49+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #169 — 2026-09-27 — feat(INT-T01c): contrat v2 — onze types, charges fermées, route des coordonnées du candidat

**Fait.** Le contrat d'événements passe en `schema_version` 2 : `TYPES_EVENEMENT` fait onze, les quatre types entrants en fin de liste, et l'enum `type_evenement_recu` les reçoit par une migration additive (`20260927000300`). Les onze charges sont fermées dans `packages/contracts/payloads.ts` et confrontées clé pour clé, dans les deux sens, à la fixture du producteur réel copiée sous `tests/fixtures/axionia/fixtures-producteur.v1.json`. La frontière porte une exemption nommée, par chemin, de `payload.parrainCodeCapture` sur la candidature seulement ; `packages/contracts/api.ts` publie, sous l'empreinte, le schéma de la route des coordonnées du candidat (partners/ADR-0023). Empreinte `8b0b09a...` → `e8ce08f...`.

**Reste.** Le lockstep du registre : textes de REQ-INT-004 (onze types, `schema_version` 2) et REQ-QA-007 (trois API), deux titres de test promis par INT-T01a, les `paths` d'INT-T01c, puis les vues ; REQ-DM-018 écrit encore l'ancien nom du HT encaissé. Côté axionia, dans la même fenêtre (INT-T05, INT-T22) : copie de `contracts.v2.json`, émission des quatre types, renommage du HT encaissé en `montantHtCents`, fixtures régénérées en v2, exemption par chemin ; la route elle-même (INT-T27-A) et son client (INT-T26). Le récepteur ne juge pas encore les charges fermées : le Zod généré ne projette que l'enveloppe.

**Appris.** Un nom d'événement qui ENTRE au contrat devient interdit en clair partout ailleurs : `gov:termes-interdits` refuse un nom VALIDE écrit hors de `packages/contracts`, commentaires `.ts` compris, alors qu'il tolérait le même nom tant qu'il était hors nomenclature — ajouter un type rougit donc des fichiers que le diff du contrat ne touche pas (ici `src/domain/apporteur/snapshot-candidature.ts`). Et le producteur v1 émettait un champ (`paiement.recu`) sous un nom que le glossaire interdit sec : fermer une charge fidèlement au producteur peut buter sur le glossaire, qui prime ; le renommage se nomme alors dans le test, pas dans la fixture.

### PR #166 — 2026-09-27 — chore(GOV-012): registre rattrape, quatre taches livrees par des PR fusionnees passent fusionnee

**Fait.** Onze tâches livrées par des PR fusionnées portaient encore `a_faire`. Quatre passent `fusionnee` par `reclasser.mjs` : GOV-101 (PR 140), SEC-04 (PR 148), SEC-06 et INT-T10 (PR 145, lot L0-05). Pour chacune, la revendication est constatée sur son issue déjà ouverte (137, 149, 146, 147), puis la livraison sur la forge, jamais à la main. Chaque couple a été confronté à la main au titre ou au champ `Lot:` de sa PR. La phase 0 passe de 43 à 47 tâches terminées sur 116, et le prochain pas quitte SEC-04, déjà livrée, pour SEC-17.

**Reste.** Les six tâches du lot de la PR 114 restent `a_faire`, et cette fois le refus est joué : le verbe rend `branche_de_la_forge_refusee` sur `t/lot-L0-02`, avec ou sans `--branche-divergente`. Aucune issue n'a été ouverte pour les cinq tâches de ce lot qui n'en ont pas. GOV-063 reste `a_faire` : sa dépendance GOV-061 ne l'est pas encore. Décision à prendre pour le lot 114 : l'outil, ou le schéma.

**Appris.** `--branche-divergente` ne lève qu'une divergence entre la tête de PR et une branche déjà portée par la tâche. Il ne permet pas d'écrire une tête hors motif sur une tâche qui n'a pas de branche : pour ces tâches, aucune voie ne mène à `fusionnee`. Et `--fusionnee` ne regarde pas les dépendances. Joué sur GOV-063, il écrit `fusionnee` avec exit 0 ; seule la garde `gov:tasks` refuse ensuite, en `dep_non_livree`. Les deux gestes ont été défaits avant les écritures légitimes, avec un sha256 identique à celui d'`origin/main`.

### PR #165 — 2026-09-27 — feat(SEC-17): lot L0-07 — rôles console, matrice unique, requireRole ; gates structurelles de la charte

**Fait.** SEC-17 : la table `utilisateurs_console` (rôle `ConsoleRole`, courriel et nom chiffrés, empreinte unique, `desactive_at`), la connexion de la console par le même lien magique (`utilisateur_console_id` sur `liens_magiques` et `sessions_espace`, `apporteur_id` relâché, CHECK d'une seule population, population figée par deux déclencheurs neufs), migration `20260927000200_utilisateurs_console` et module du semeur `prisma/seed/06-console.ts`. La matrice des droits par rôle vit dans `src/server/roles/matrice.ts`, défaut = refus ; `requireRole` relit rôle et désactivation à chaque requête ; l'espace refuse une session et un lien de la console. La garde `securite:roles` dérive du disque les actions et routes de la console — toute valeur exportée d'un module `'use server'` et toute méthode HTTP d'un `route.ts`, sous toute forme d'export — et les confronte à la matrice rôle par rôle ; un site dont le corps ne s'établit pas dans le fichier est une faute nommée (`export_non_jugeable`), jamais un silence. Ne s'établissent que la déclaration de fonction et la `const`, déclarées une fois et jamais réassignées ; une liaison réassignable, une déstructuration exportée (un site par nom lié) et un import-equals exporté ne se jugent pas ; un `var` de portée module, où qu'il soit hors d'une fonction, d'une classe ou d'un espace de noms (bloc, `if`, `try`, boucle, `for (var x of y)`), est une liaison réassignable ; un export n'est écarté comme type que s'il est marqué `type` (`export type { X }` ou `{ type X }`), et un `export { X }` non marqué d'un nom sans valeur établie ne se juge pas — un réexport de type s'écrit `export type` ; les fichiers JavaScript du périmètre sont lus, et une méthode qui porte la directive est une action. Un fichier du périmètre qui nomme l'objet des exports CommonJS ou une voie qui y mène (`exports`, `module`, `require`, `eval`, un interne du bundler, même liés localement ; `this` ou `arguments` hors d'une fonction ; `with`) est `export_non_jugeable`, motif « module CommonJS » : ses sites ne se dérivent que des exports ES. Seul le `requireRole` importé de `src/server/roles/require-role`, déclaré une fois dans le fichier et jamais réassigné, garde un site : un homonyme local, un import d'ailleurs, un nom masqué ou `x.requireRole` sur un objet quelconque ne gardent pas. JUR-T26 : `jur:aucun-agregat-reseau`, `jur:aucune-progression`, `jur:revue-apporteur-facing` (label, checklist des douze motifs, revue A07 sous `--pr`, CODEOWNERS), `jur:lexique-social`, et la gate lexicale étendue aux ressources diffusées et aux composants de l'espace. `scripts/gates/jur-revue-apporteur-facing.ts`, qui juge la revue A07, devient une racine de la garde des revues (`RACINES_DE_LA_GARDE_DES_REVUES`). Mutation : 100 pour cent, 269 mutants sur 269.

**Reste.** La route de connexion de la console et le premier écran, avec sa ligne dans la matrice : UX-P1-12. Au registre, le `verifie` et la `preuveRouge` de `securite:roles` sont relevés sur le 4e tour (9632350) ; leur relevé sur le module CommonJS et la porte importée reste à écrire. Le périmètre de `GATE-JUR-TEXTES-APPORTEURS` est écrit dans son `verifie`, comme les chemins de SEC-17 et JUR-T26 et le `verifie` et la `preuveRouge` des cinq gardes. Déclarés hors de la garde : `layout`, `default` et les autres fichiers de routage qui ne sont ni `page` ni `route` (aucun site n'y est jugé), un `requireRole` présent dans une fermeture jamais appelée ou un paramètre par défaut, et l'évaluation dynamique de code (`Function`, `eval` indirect, `vm`, minuteur à chaîne) comme toute mutation des exports par une voie d'exécution. Le mot « challenge » au lexique interdit : REQ-JUR-012, JUR-T13.

**Appris.** Stryker mute le fichier ENTIER que la PR touche : modifier une ligne de `lien-magique.ts` a fait remonter quinze survivants de SEC-03, dont neuf statiques — un motif, une chaîne de domaine, un `Set` en constante de module sont évalués au chargement, avant toute activation de mutant. Les passer dans la fonction qui les lit les fait tuer par les tests existants ; un encodage `utf8` écrit là où l'API l'a par défaut, ou un `typeof` avant un `includes`, sont des mutants ÉQUIVALENTS qu'on retire au lieu de les tester. Et Postgres enchaîne les déclencheurs `BEFORE` d'une même table dans l'ordre ALPHABÉTIQUE de leurs noms : c'est ce qui laisse corriger la sortie d'un déclencheur protégé par un déclencheur neuf, sans réécrire la fonction protégée que `partners:migrations:additive` interdit de remplacer. Enfin, une garde qui énumère les formes d'export qu'elle reconnaît laisse passer en silence toutes les autres : elle doit compter CHAQUE valeur exportée comme un site, et faire de celles dont elle ne voit pas le corps une faute. Et une garde qui suit un nom local juge la valeur que le module sert à la FIN de son évaluation : l'initialiseur d'une liaison réassignable ne dit rien de cette valeur, et un type homonyme ne retire pas la valeur importée qui porte le même nom. Un `var` n'a pas la portée de son bloc mais celle de sa fonction — au premier niveau d'un module, celle du module : une garde qui ne relève les liaisons que dans les instructions de premier niveau prend pour un type le nom qu'un `var` de bloc lie comme valeur. Le remède sûr n'est pas de mieux compter les valeurs, mais de n'écarter comme type que ce que le code MARQUE `type`. Une garde qui dérive ses sites de la syntaxe d'export ES ne voit RIEN dans un fichier CommonJS, que Next charge pourtant par `require` et sert : un fichier sans site sortait en zéro. Le remède n'est pas de juger le CommonJS, mais de refuser, dans tout fichier du périmètre, les noms qui mènent à l'objet des exports. Et une garde qui reconnaît la porte à son NOM accepte n'importe quel homonyme : la porte est une liaison importée d'un module précis, pas un nom.

… 3 entrée(s) affichée(s) sur 70 ; les 67 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

