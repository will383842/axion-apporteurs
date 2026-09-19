# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `5b306f8` — 2026-09-19T15:23:32+02:00 |
| Qu’est-ce qui est en vol ? | 1. #75 (rien) · 2. #76 (rien) · 3. #81 (un contrôle requis rouge ou une revue manquante) |
| Qui tient quoi ? | QA-T01 (A05) · SEC-01 (A05) · SEC-02 (A05) · SEC-10 (A05) · DM-01 (A05) · QA-T03 (A05) · UX-P0-02 (A05) · CPL-T13 (A05) · GOV-077 (A05) |
| Où en est la phase ? | phase 0 — 5/98 tâches, reste 72.10 j |
| Le prochain pas | fusionner #75, puis QA-T01 — Squelette de tests et Gate A bloquante (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #79 — 2026-09-19 |

**Ce qu’on tape maintenant.** `gh pr view 75 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

5/98 tâches terminées · reste 72.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 214 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 44 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (1.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **17.50 j**.

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

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #75 — feat(DM-01): socle du schema Partners et journal Evenement chaine immuable | `t/dm-01` | rien — fusionnable maintenant |
| 2 | #76 — feat(SEC-10): compteurs de debit a conduite sur panne requise, garde de famille, pot de miel | `t/sec-10` | rien — fusionnable maintenant |
| 3 | #81 — feat(QA-T03): req:check juge chaque paire (tache, REQ) - deux formes et test vert | `t/qa-t03` | un contrôle requis rouge ou une revue manquante |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T01 — Squelette de tests et Gate A bloquante | A05 | #56 | `a_faire` |
| SEC-01 — Secrets distincts et validation d'environnement au boot | A05 | #60 | `a_faire` |
| SEC-02 — En-têtes de sécurité et CSP par nonce | A05 | #66 | `a_faire` |
| SEC-10 — Bibliothèque rate-limit avec garde de famille, honeypot observable | A05 | #71 | `a_faire` |
| DM-01 — Socle du schéma Partners : conventions, enums de base, journal Evenement chaîné immuable | A05 | #62 | `a_faire` |
| QA-T03 — Traçabilité REQ→test : requirements.yaml, @req, req:check | A05 | #80 | `a_faire` |
| UX-P0-02 — Maquettes des 6 écrans clés + charte de l'espace | A05 | #77 | `a_faire` |
| CPL-T13 — Module `temps` : Clock injectable, Europe/Paris, calendrier fériés FR, SLA commun, règle HYP-D3 en fonction pure | A05 | #67 | `a_faire` |
| GOV-077 — La garde des demandes de fusion confond aucune revue lue et toutes les revues refusent | A05 | #57 | `a_faire` |

⚠️ **25 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0012-relecture-proportionnee-au-risque.md` — partners/ADR-0012 — La relecture d'une PR se proportionne à son risque, et l'ordinaire se prouve · `docs/adr/0013-secrets-et-donnees-personnelles-chiffrees.md` — partners/ADR-0013 — Secrets et données personnelles chiffrées · `docs/adr/0014-temps-paris-jours-ouvres.md` — partners/ADR-0014 — Le temps du métier : horloge injectée, heure de Paris calculée, jours ouvrés versionnés

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-19). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

**Fusionner #75** — elle est en tête de file et ne bloque sur rien. Lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage.

**QA-T01** — Squelette de tests et Gate A bloquante (0.5 j, **sur le chemin critique**) : 32 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `5b306f8` (2026-09-19T15:23:32+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #79 — 2026-09-19 — docs(UX-P0-02): maquettes des huit écrans et garde maquettes-validees

**Fait.** Huit maquettes autonomes sous `docs/maquettes/` : six pour l'espace, deux pour la console. Elles couvrent 90 états et viennent avec une charte (`index.html`) aux contrastes mesurés dans les deux thèmes de l'espace. La garde `maquettes-validees` lit `VALIDATION.md` par ses en-têtes. Elle refuse une validation écrite à moitié ou signée par un autre que Will, et rougit sur toute tâche d'écran attribuée sans maquette validée ; elle est câblée en Gate A. La spec prouve aussi la forme de l'accueil (REQ-UX-008), le contraste recalculé depuis chaque maquette (REQ-UX-034) et la moitié statique de REQ-UX-017. Elle a été vue rouge avant la garde, et six mutants de la garde ont été tués. Les six maquettes de l'espace portent `2026-09-19 | Will`. Will a donné la validation lui-même, en séance avec l'orchestrateur, en répondant « oui parfait » à « Valider les six maquettes de l'espace apporteur ». Cette réponse vaut aussi pour les onze choix par défaut des notes. L'orchestrateur a écrit les six lignes dans `1c6d94b`, avec les mots de Will dans le message de ce commit ; l'auteur de la PR ne les a pas écrites. La garde libère UX-P1-01, UX-P1-02, UX-P1-05, UX-P1-08, UX-P1-09 et UX-P2-01. Le composeur lit désormais le tableau par le lecteur de la garde, et non plus par position de colonne.

**Reste.** Les deux maquettes de console (UX-P1-07, UX-P2-03) attendent la validation de Will. Restent aussi la moitié dynamique de REQ-UX-017 (UX-P0-03) et la dérive du GLOSSAIRE sur `IssueDepot` et `MotifBlocage`.

**Appris.** Prettier coupe les balises fermantes d'un HTML long (`</a` puis `>` à la ligne suivante). Une spec qui cherche `</label>` en texte exact ne trouve jamais la fermante, et juge alors « étiqueté » tout champ placé après une étiquette. Le témoin était trop indulgent sans rougir. Et le composeur lisait l'avant-dernière cellule du tableau, « Par », sous un commentaire qui disait « Validé le ».

### PR #78 — 2026-09-19 — feat(CPL-T13): module temps pur - horloge injectee, heure de Paris, feries FR, SLA ouvre, seuil HYP-D3

**Fait.** Le module `temps` vit sous `src/domain/temps/`, pur : horloge injectée (`horlogeFigee`
dans le domaine, `horlogeSysteme` dans `src/lib/horloge.ts`), heure légale de Paris calculée par la
règle européenne, bornée aux années civiles de Paris 1996-2099, fériés FR versionnés avec leur
attribut chômé, SLA en heures ouvrées à échéance exclusive, capacité réelle et seuil prioritaire
(HYP-D3). Les conversions sont confrontées à `Intl.DateTimeFormat` dans le test, jamais dans le
domaine : 131 496 heures de 2026 à 2040, 78 338 points autour des changements d'heure de 1996 à
2099. 38 mutants joués, 38 tués. `partners/ADR-0014` (`propose`) en est le contrat.

**Reste.** La question à Will sur le lundi de Pentecôte (travaillé par défaut, une constante) ; le
numéro d'ADR, fixé à l'atterrissage (0014 aujourd'hui, 0015 si DM-01 atterrit avant) ; le relevé unique et le
rattrapage des crons de REQ-QA-027, qui sont à DM-13 et T-ARG-015.

**Appris.** Un oracle vivant trouve ce qu'un attendu tapé aurait figé faux : le test supposait onze
fériés distincts par an, et 1997 n'en a que dix (l'Ascension tombe le 8 mai). Le témoin dérive
maintenant ces années de l'oracle de Gauss au lieu de les écrire. Et une URL encodée en commentaire
(le « â » de Pâques en pourcentages) se lit comme un identifiant nu : la garde lit les commentaires.

### PR #76 — 2026-09-19 — feat(SEC-10): compteurs de debit a conduite sur panne requise, garde de famille, pot de miel

**Fait.** Registre unique des compteurs de débit (`src/server/securite/rate-limit.ts`) : conduite sur
panne requise par le type, relue en échec fermé à l'exécution, source et `verifieLe` sur chaque limite.
Sujet réduit à une empreinte typée, adresse du client lue depuis la droite de `X-Forwarded-For`, pot de
miel observable. La garde `G-SEC-RATE-FAMILLE` exécute chaque compteur contre un cache qui lève. Elle est
câblée en Gate A. Correctif groupé après les quatre lentilles : IPv6 canonique et regroupée par /64,
magasin opaque, garde fermée à toute référence indirecte à `limiter` et lisant `src/` et `scripts/`
sous toutes les extensions, valeurs et conduites confrontées au texte de l'exigence. 83 tests,
56 mutants joués dont 51 tués.

**Reste.** La spec d'intégration sur Redis réel attend QA-T02 ; la mesure de la phase A est au corps.
`depot:identite` attend sa configuration (UX-P1-02, SEC-21). `REDIS_URL` doit entrer au schéma
d'environnement (QA-T04), et `SAUTS_DE_CONFIANCE` doit être mesuré au déploiement (QA-T05). Quatre
mutants ioredis survivent : ils sont équivalents sous `connect()` explicite.

**Appris.** Avec `lazyConnect` et sans file hors ligne, `ioredis` fait échouer TOUTE première commande :
le client ne se connecte qu'en tâche de fond. Et contre un serveur qui accepte puis se tait, sa promesse
de connexion n'aboutit qu'à la fermeture par le pair, c'est-à-dire jamais. Des options « rapides » ne
suffisent pas : il faut un témoin de délai contre un serveur muet, qui a mesuré 1041 ms avant correctif
et 529 ms après. Une garde qui cherche un appel par son NOM est contournée par tout ce qui n'est pas
un appel : il faut refuser toute autre référence au nom, pas énumérer les détours.

… 26 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

