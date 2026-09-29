# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `4a1d940` — 2026-09-29T21:24:40+02:00 |
| Qu’est-ce qui est en vol ? | 1. #242 (un conflit avec `main`) · 2. #254 (un conflit avec `main`) |
| Qui tient quoi ? | GOV-124 (A01) · GOV-126 (A01) |
| Où en est la phase ? | phase 0 — 104/131 tâches, reste 20.50 j |
| Le prochain pas | QA-T06 — Preview par PR sur Coolify, base éphémère, seed déterministe |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #254 — 2026-09-29 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

104/131 tâches terminées · reste 20.50 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 184 | QA-T06, QA-T12, QA-T13, DM-03-A, DM-03-P, DM-04, INT-T02, INT-T03, INT-T04, INT-T05, INT-T22, JUR-T03 … (12 affichées sur 184 — liste complète : `docs/TASKS.md`) |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 143 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … (12 affichées sur 143 — liste complète : `docs/TASKS.md`) |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**25.25 j** sur 25 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → ~~SEC-08~~ (1 j, ph 0) → ~~SEC-03~~ (1 j, ph 0) → ~~SEC-04~~ (1 j, ph 0) → ~~SEC-17~~ (1 j, ph 0) → DM-07 (1 j, ph 1) → DM-08 (1.5 j, ph 1) → DM-12 (0.5 j, ph 1) → SEC-11 (1 j, ph 1) → SEC-12 (1.5 j, ph 1) → SEC-14 (1 j, ph 1) → SEC-15 (1 j, ph 1) → DM-41 (1.25 j, ph 1) → SEC-41 (1.25 j, ph 1) → DM-43 (1 j, ph 1) → UX-P1-07 (1.5 j, ph 1) → QA-T16 (1 j, ph 1) → QA-T40 (1.5 j, ph 1)

Reste sur ce chemin : **15.00 j**.

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
| 1 | #242 — feat(JUR-T34): la politique de confidentialite de l'espace, tiree du registre de l'article 30 et acceptee a la premiere connexion | `t/jur-t34` | un conflit avec `main` — à résoudre avant tout |
| 2 | #254 — docs(GOV-017a): W20, questions 18 et 19 tranchees — aucune tacite d'une demande signalee, liberee apres 3 injoignables ou 45 jours | `t/w20-q18-q19` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-124 — Une seule lentille pour une PR sans risque, derivee par risqueDeLaPr ; deux pour tout le reste et dans le doute | A01 | #247 | `a_faire` |
| GOV-126 — Le temoin d'une garde vaut la garde : les tests de gouvernance, de securite et d'integration restent a deux lentilles | A01 | #249 | `a_faire` |

⚠️ **13 revendication(s) périmée(s)** — QA-T07, GOV-042, GOV-045, GOV-050, GOV-051, GOV-053, GOV-054, GOV-055, GOV-060, GOV-072, GOV-079, GOV-093, INT-T01c : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0025-les-decisions-de-gouvernance-de-will-s-ecrivent-en-adr.md` — partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre · `docs/adr/0026-une-lentille-pour-une-pr-sans-risque.md` — partners/ADR-0026 — Une lentille pour une PR sans risque, deux pour tout le reste et dans le doute

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**QA-T06** — Preview par PR sur Coolify, base éphémère, seed déterministe (1 j) : 14 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `4a1d940` (2026-09-29T21:24:40+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #254 — 2026-09-29 — docs(GOV-017a): W20, questions 18 et 19 tranchees — aucune tacite d'une demande signalee, liberee apres 3 injoignables ou 45 jours

**Fait.** Les réponses de Williams du 2026-09-29, vers 20 h (session -d7), sont reportées dans
`docs/chantiers/W20-confirmation-par-email.md` et au registre. Question 18 : la valeur par défaut est
retenue, une demande signalée n'est jamais confirmée par le seul silence. Question 19, proposée par la
lentille securite : sans appel concluant, la demande signalée est libérée, sans aucune sanction, après
3 appels `injoignable` ou 45 jours après l'envoi, au premier terme ; les deux valeurs sont des
paramètres de la SSOT ; l'entreprise redevient disponible, l'apporteur reçoit une notification neutre et
peut redéposer aux règles ordinaires. Au plan : HYP-W20-TACITE mise à jour, HYP-W20-LIBERATION créée,
REQ-DM-063 proposée, REQ-DM-042, REQ-DM-008, REQ-SEC-060, REQ-DM-062 et REQ-UX-062 mises à jour, badge
« Réservation terminée », risque 1 point ii fermé, réponses datées au §9. Au registre, par
`reecrire-champ` : acceptances de DM-24, DM-13, SEC-41, UX-P1-05, UX-P1-41, UX-P1-43, JUR-T40,
JUR-T01b, QA-T40, QA-T41 et avenant (8) de GOV-112 ; dépendances : DM-13 dépend de DM-40, SEC-41, UX-P1-10 et
DM-24 de SEC-41 ; DM-13 passe de 0,75 à 1 j. Puis les arbitrages de -d7 sur délégation de Williams
du même jour : les précisions de la libération (45 jours depuis la première demande, seuls les
`injoignable`, rebond non corrigé libéré de même, état `perimee`, badge et notification) sont validées,
et le redépôt en boucle est fermé par une carence : le même apporteur ne redépose pas le même SIREN
pendant 30 jours, 90 après une deuxième libération, sans sanction et sans valeur d'enum nouvelle
(HYP-W20-CARENCE-REDEPOT, REQ-DM-063). Question 20 tranchée le même jour par -d7 sur délégation de
Williams, défaut retenu : pendant la carence, le redépôt n'atteint pas le formulaire, l'écran dit « Vous
pourrez déposer cette entreprise à nouveau à partir du (date). » sans bouton « Déposer », une requête
forgée reçoit une erreur serveur qui n'est pas une issue de dépôt, consigne W19 maintenue ; la carence
reste à 90 jours au-delà de deux libérations. DM-13, SEC-41,
JUR-T40, JUR-T01b, QA-T40, QA-T41 et GOV-112 réécrites de nouveau ; DM-13 passe à 1,25 j. Phase 1 :
18,0 j.

**Reste.** La passe gardien-spec de GOV-112 écrit HYP-W20-LIBERATION et REQ-DM-063 avec les autres.
Questions 16 et 17 toujours ouvertes. L'écran de la carence est tranché par le même arbitrage : UX-P1-02
(formulaire de dépôt) et la carte « Vérifier » UX-P1-01, dont les acceptances le portent. Aucune tâche W20 n'est livrée par cette PR.

**Appris.** Borner une attente change aussi le texte qui disait « la seule conséquence du silence » :
la phrase vivait dans l'exigence, le contrat proposé et la relecture du contrat, et une seule copie
oubliée aurait promis le contraire de la règle. Un test qui disait « toujours rouge à 60 jours » est
devenu faux par la même réponse : une borne se relit dans tous les témoins datés.

### PR #251 — 2026-09-29 — chore(GOV-012): registre rattrape, HT encaisse tranche par Williams, paths du lot A et de JUR-T29, GOV-125 versee

**Fait.** Treizième rattrapage. Williams a tranché le HT encaissé : axion-ia le calcule pour chaque
paiement, et REQ-INT-005 et INT-T05 sont amendées dans ce sens. INT-T22 prend pour déclencheur
l'action « prêt à signer », par la préséance d'une décision de Williams. Les chemins du lot A et de
JUR-T29 sont ceux que la forge et les gardes ont mesurés. GOV-062 et QA-T11 sont closes.

**Reste.** GOV-125, versée ici : tant que le motif de branche ignore les branches d'axion-ia,
DM-03-A, INT-T02 et INT-T27-A, pourtant en production, ne peuvent pas être closes, ni les tâches
qui en dépendent.

**Appris.** Deux exigences actives peuvent se contredire sans qu'aucune garde ne le voie : c'est un
auteur, au moment de coder, qui l'a relevé. La contradiction se tranche par une décision écrite,
jamais par l'acceptance la plus récente.

### PR #250 — 2026-09-29 — feat(GOV-126): le temoin d'une garde vaut la garde, tests de gouvernance, securite et integration a deux lentilles

**Fait.** Les tests de gouvernance, de sécurité et d'intégration restent à deux lentilles : une PR
qui ne toucherait que le témoin d'une garde ne peut plus l'affaiblir sous une seule relecture.

**Reste.** Aucune PR n'a encore été fusionnée à une seule lentille : la règle entre en usage avec
cette fermeture.

**Appris.** Un témoin fait partie de la garde qu'il prouve : l'autoriser à une lentille, c'était
autoriser la garde elle-même par un détour.

… 3 entrée(s) affichée(s) sur 110 ; les 107 plus ancienne(s) se lisent dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

