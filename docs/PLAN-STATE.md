# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `5e73b88` — 2026-09-28T07:14:42+02:00 |
| Qu’est-ce qui est en vol ? | 1. #82 (rien) · 2. #175 (rien) · 3. #181 (rien) · 4. #185 (rien) · 5. #182 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | QA-T07 (A05) · GOV-057 (A01) |
| Où en est la phase ? | phase 0 — 59/116 tâches, reste 45.35 j |
| Le prochain pas | fusionner #82, puis SEC-17 — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #180 — 2026-09-27 |

**Ce qu’on tape maintenant.** `gh pr view 82 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

59/116 tâches terminées · reste 45.35 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 190 | JUR-T02, QA-T07, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03 … (12 affichées sur 190 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 98 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 98 — liste complète : `docs/TASKS.md`) |
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
| 2 | #175 — chore(GOV-083): lot L0-09 — gates sans script triees, porte A confrontee, causes temoignees, journal | `t/lot-l0-09` | rien — fusionnable maintenant |
| 3 | #181 — chore(GOV-012): registre rattrape, cinq taches livrees par deux PR fusionnees passent fusionnee | `t/gov-cloture-l0-07-l0-10` | rien — fusionnable maintenant |
| 4 | #185 — feat(GOV-103): la forme t/ du motif de branch admet les majuscules | `t/gov-103` | rien — fusionnable maintenant |
| 5 | #182 — fix(GOV-057): lot:cloture --tache clot une tache livree seule, sans inventer de lot | `t/gov-057` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| GOV-057 — Le pas 8 du protocole de fusion ne sait pas clore une tache livree seule, hors de tout lot | A01 | #183 | `a_faire` |

⚠️ **12 revendication(s) périmée(s)** — GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-28 (jour du dernier atterrissage).

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**Fusionner #82** — elle est en tête de file et ne bloque sur rien.

**SEC-17** — Rôles console : enum `ConsoleRole { admin, qualifieur, comptable, lecteur }`, matrice SSOT, `requireRole`, garde AST (1 j, **sur le chemin critique**) : 27 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `5e73b88` (2026-09-28T07:14:42+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #180 — 2026-09-27 — feat(JUR-T02): lot L0-10 — SSOT des délais du contrat, contrat sobre figé, alertes Telegram sans PII

**Fait.** JUR-T02 porte la PR, et JUR-T27 et INT-T14 sont dans son champ `Lot:`. La SSOT
`src/domain/seuils/ssot.ts` porte 27 constantes sourcées et datées, sans gradation ni contradictoire.
La garde `scripts/gates/seuils-ssot.ts` refuse un seuil ou un délai retapé dans `src/`, un préavis
indexé sur l'ancienneté, et une valeur qui diverge entre le gabarit et la SSOT ; son `--prove` joue
neuf familles. Le gabarit de contrat, déjà sobre, n'est pas modifié : `contrat-sobre.spec.ts` fige
l'acceptation de JUR-T27, et le texte final reste relu par Will avant toute signature. L'alerteur
Telegram dédoublonne, plafonne par catégorie et par heure, et sa garde nomme tout champ personnel
qui franchirait le canal. Le 2026-09-27T09:09Z, les paths de JUR-T02 couvrant désormais
`package.json`, `ci.yml` et `vitest.mutation.config.ts`, la garde est câblée : scripts
`ssot:seuils` et `ssot:seuils:prove`, deux étapes du job `gate-a` après la grille chiffrée, et
`tests/unit/juridique/` jugé sous mutation, deux tests écartés et nommés (balayage `git ls-files`,
lecture du texte instrumenté de la SSOT). Le 2026-09-27T09:24Z, l'entrée du registre porte le nom
de sa commande, `ssot:seuils`, et l'ancien identifiant n'y survit qu'en alias (`partners/ADR-0018`) :
`un-nom-une-garde.spec.ts` ne compte plus que ses trois écarts. Les `preuveRouge` de `ssot:seuils`
et de `G-SEC-NOTIF` sont posés. Les deux sorties non nulles de `scripts/gates/seuils-ssot.ts` sont
déclarées au cliquet de `refus-de-rendre-et-de-publier.spec.ts` et nommées dans `REFUS_NOMMES`,
témoins d'effet à zéro : dette déclarée. Le 2026-09-27T10:57Z, sur la porte A rouge et l'avis `securite` :
la garde établit son périmètre par la source unique `fichiersSuivisOuRefus` et figure parmi les
gardes qui balaient le dépôt. Les motifs de montant écrits forme par forme laissent place à deux
règles qui normalisent : tout nombre, lu sans séparateur de milliers, est confronté aux montants de
la SSOT ; tout produit de littéraux entiers est évalué et confronté à chaque délai de la SSOT en
jours, heures, minutes, secondes et millisecondes. L'alerteur n'admet comme identifiant que le
format des identifiants d'agrégat du dépôt, et compte plafond et dédoublonnage sur la forme
affichée. La garde sans PII voit le montant formaté en euros.

**Reste.** `docs/GARDES-AXIONIA.md` cite encore l'ancien identifiant, que l'alias résout : le
fichier est hors des paths du lot. La PR #175, non fusionnée, fige les étapes de `gate-a` dans `PORTE_A_FIGEE`
(`scripts/gates/gov-conventions.ts`) : les deux étapes ajoutées ici y manquent, et la PR qui
fusionnera en second résout ce conflit sémantique, que `git` ne signale pas. `FENETRE_MOIS` attend la question `JUR-T01-Q02` : `docs/DECISIONS.md` (`HYP-E1-9`) porte
12 mois, et la décision de Will du 2026-09-22, à 6 mois, n'est pas encore au registre. Les
catégories d'alerte n'ont pas de liste fermée : leur format est borné, pas leur nombre, et une
liste fermée se déclare au glossaire. L'appel réel au bot
attend la rubrique 2 de `docs/tiers/telegram.md` et les noms des deux secrets dans `src/lib/env.ts`.
Sous mutation, la SSOT n'a aucun mutant jugé : toutes ses valeurs sont évaluées au chargement du
module, donc statiques et hors score (`ignoreStatic`) ; ce sont ses tests en processus qui les
figent. GOV-082 n'est pas dans ce lot : elle est livrée par la PR #114 (fusionnée, `32ea43d`), et
son attestation reste bloquée par `branche_de_la_forge_refusee` (tête `t/lot-L0-02`) ; la décision
(l'outil ou le schéma) reste à prendre.

**Appris.** `gov:publication` refuse `montantCents` suivi d'un nombre, même sur un objet témoin
factice. Elle refuse aussi le seuil de versement écrit en euros dans un commentaire, alors que la même valeur en centimes,
sous la clé `SEUIL_VERSEMENT`, passe. Un script placé sous `scripts/gates/` est jugé par
`gov:conventions` dès qu'il existe : s'il n'est appelé par aucun workflow, la pré-porte rougit
tant que le registre ne le câble pas ou ne lui donne pas de `horsCi`. Une tâche dont les `paths` ne
couvrent ni `package.json` ni `ci.yml` ne peut donc pas livrer seule une garde neuve. Enfin,
`vitest.mutation.config.ts` n'inclut qu'une liste fermée de dossiers de tests : une source mutée dont
le test vit ailleurs sort « sans couverture », pas « survivante ». Et le rapport incrémental de `pnpm mutation:pr` REPREND
un résultat « sans couverture » quand seuls les tests ont changé : cinq mutants de la SSOT y restaient
« sans couverture » après l'ajout de ses tests. Sans le fichier incrémental local, ils sont statiques,
hors score.

### PR #176 — 2026-09-27 — chore(GOV-012): registre rattrape, douze taches livrees par des PR fusionnees passent fusionnee

**Fait.** Treize tâches livrées par les PR 158, 169 et 168 portaient encore `a_faire`. Douze passent `fusionnee` par `reclasser.mjs` : GOV-053, GOV-055, GOV-060, GOV-079, GOV-050 et GOV-051 (PR 158, lot L0-06), INT-T01c (PR 169), GOV-045, GOV-054, GOV-072, GOV-093 et GOV-042 (PR 168, lot L0-08). Chaque revendication est constatée sur son issue déjà ouverte (150 à 155, 167, 159 à 163), puis la livraison sur la forge. Chaque attestation est lue dans `origin/main` par `cloture.ts --rattraper-attestations`. La phase 0 passe de 47 à 59 tâches terminées sur 116, reste 45,35 jours.

**Reste.** GOV-074 reste `a_faire` : la PR 168 écrit qu'elle ne livre pas toute son acceptance (comparaison par préfixe et exemptions sans second producteur non identifiées une à une, `DETTE_GABARIT_LIVREE` au grain du site). Décision à prendre : une tâche fille pour le reste, ou une acceptance rétrécie par avenant. Les PR 114 et 102 restent dans l'état écrit par la PR 166.

**Appris.** Depuis GOV-042, `--fusionnee` ne suffit plus : `reclasser.mjs` n'écrit pas l'attestation, et `gov:tasks` rougit sans elle. Le rattrapage du dépôt la lit dans l'historique, en filtrant le sujet par `(#<pr>)` avant de chercher l'identifiant. Ce filtre est nécessaire : le message de la PR 168 nomme aussi GOV-055, livrée par la PR 158. Sans le filtre, la recherche aurait trouvé deux commits et laissé l'attestation vide.

### PR #169 — 2026-09-27 — feat(INT-T01c): contrat v2 — onze types, charges fermées, route des coordonnées du candidat

**Fait.** Le contrat d'événements passe en `schema_version` 2 : `TYPES_EVENEMENT` fait onze, les quatre types entrants en fin de liste, et l'enum `type_evenement_recu` les reçoit par une migration additive (`20260927000300`). Les onze charges sont fermées dans `packages/contracts/payloads.ts` et confrontées clé pour clé, dans les deux sens, à la fixture du producteur réel copiée sous `tests/fixtures/axionia/fixtures-producteur.v1.json`. La frontière porte une exemption nommée, par chemin, de `payload.parrainCodeCapture` sur la candidature seulement ; `packages/contracts/api.ts` publie, sous l'empreinte, le schéma de la route des coordonnées du candidat (partners/ADR-0023). Empreinte `8b0b09a...` → `e8ce08f...`.

**Reste.** Le lockstep du registre : textes de REQ-INT-004 (onze types, `schema_version` 2) et REQ-QA-007 (trois API), deux titres de test promis par INT-T01a, les `paths` d'INT-T01c, puis les vues ; REQ-DM-018 écrit encore l'ancien nom du HT encaissé. Côté axionia, dans la même fenêtre (INT-T05, INT-T22) : copie de `contracts.v2.json`, émission des quatre types, renommage du HT encaissé en `montantHtCents`, fixtures régénérées en v2, exemption par chemin ; la route elle-même (INT-T27-A) et son client (INT-T26). Le récepteur ne juge pas encore les charges fermées : le Zod généré ne projette que l'enveloppe.

**Appris.** Un nom d'événement qui ENTRE au contrat devient interdit en clair partout ailleurs : `gov:termes-interdits` refuse un nom VALIDE écrit hors de `packages/contracts`, commentaires `.ts` compris, alors qu'il tolérait le même nom tant qu'il était hors nomenclature — ajouter un type rougit donc des fichiers que le diff du contrat ne touche pas (ici `src/domain/apporteur/snapshot-candidature.ts`). Et le producteur v1 émettait un champ (`paiement.recu`) sous un nom que le glossaire interdit sec : fermer une charge fidèlement au producteur peut buter sur le glossaire, qui prime ; le renommage se nomme alors dans le test, pas dans la fixture.

… 3 entrée(s) affichée(s) sur 73 ; les 70 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

