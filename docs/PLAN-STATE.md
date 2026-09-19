# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `f37659e` — 2026-09-19T10:37:25+02:00 |
| Qu’est-ce qui est en vol ? | 1. #75 (un conflit avec `main`) · 2. #76 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T01 (A05) · SEC-01 (A05) · SEC-02 (A05) · SEC-10 (A05) · DM-01 (A05) · CPL-T13 (A05) · GOV-077 (A05) |
| Où en est la phase ? | phase 0 — 5/98 tâches, reste 72.10 j |
| Le prochain pas | QA-T01 — Squelette de tests et Gate A bloquante (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #78 — 2026-09-19 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

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
| 1 | #75 — feat(DM-01): socle du schema Partners et journal Evenement chaine immuable | `t/dm-01` | un conflit avec `main` — à résoudre avant tout |
| 2 | #76 — feat(SEC-10): compteurs de debit a conduite sur panne requise, garde de famille, pot de miel | `t/sec-10` | un conflit avec `main` — à résoudre avant tout |

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
| CPL-T13 — Module `temps` : Clock injectable, Europe/Paris, calendrier fériés FR, SLA commun, règle HYP-D3 en fonction pure | A05 | #67 | `a_faire` |
| GOV-077 — La garde des demandes de fusion confond aucune revue lue et toutes les revues refusent | A05 | #57 | `a_faire` |

⚠️ **25 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0012-relecture-proportionnee-au-risque.md` — partners/ADR-0012 — La relecture d'une PR se proportionne à son risque, et l'ordinaire se prouve · `docs/adr/0013-secrets-et-donnees-personnelles-chiffrees.md` — partners/ADR-0013 — Secrets et données personnelles chiffrées · `docs/adr/0014-temps-paris-jours-ouvres.md` — partners/ADR-0014 — Le temps du métier : horloge injectée, heure de Paris calculée, jours ouvrés versionnés

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-19). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

**QA-T01** — Squelette de tests et Gate A bloquante (0.5 j, **sur le chemin critique**) : 32 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `f37659e` (2026-09-19T10:37:25+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

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

### PR #74 — 2026-09-19 — feat(SEC-02): en-têtes de sécurité et CSP par nonce

**Fait.** Toute réponse que voit `src/proxy.ts` porte une CSP construite autour d'un nonce neuf,
tiré dans la fonction par `crypto.getRandomValues` sur 16 octets, posée sur la réponse et transmise à
la requête, avec `Cache-Control: private, no-store`. `next.config.ts` pose HSTS preload, `nosniff`,
`Referrer-Policy` et une `Permissions-Policy` restrictive sur `'/(.*)'`. La source unique est
`src/server/securite/entetes.ts`. `next` 16.3.1, `react` et `react-dom` 19.2.8 entrent au dépôt en
versions exactes, sans aucune page. Le témoin juge la vraie couche par les outils de test de Next,
sur 17 routes dérivées de `src/app` et de la carte `docs/ESPACE-ROUTES.md`, 1003 réponses, 0 défaut ;
38 mutants joués, 38 tués. `G-SEC-HEADERS.verifie` ne promet plus de routes tapées qui n'existaient
pas.

**Reste.** La mesure au navigateur, le rendu dynamique qui porte le nonce, les styles en attribut
que la politique bloque et les règles de spéculation de Next sont des charges de la première page,
SEC-03. La préséance du `Cache-Control` du proxy sur celui d'une page statique n'est pas prouvée ici.
Cinq specs voisines, dont celle de SEC-01, assertent `NodeJS.ProcessEnv` à la frontière d'un sous-processus : dette, tant
que `next` déclare `NODE_ENV` obligatoire.

**Appris.** Importer `type { NextConfig } from 'next'` charge les types globaux de `next`, qui
rendent `NODE_ENV` obligatoire et en lecture seule dans tout le projet : sept erreurs de typecheck
dans cinq specs, dont quatre qui n'écrivent jamais `NODE_ENV` mais construisent l'environnement d'un
enfant sans lui. Les outils de test de Next lèvent une erreur d'invariant sur
`AsyncLocalStorage` tant que `next/dist/server/node-environment-baseline` n'est pas importé en
premier. Et la doc de 16.3.1 nomme `unstable_doesProxyMatch`, que le paquet n'exporte pas.

### PR #73 — 2026-09-19 — feat(SEC-01): secrets distincts et validation d'environnement au boot

**Fait.** `src/lib/env.ts` porte la liste unique des neuf secrets (les huit de REQ-SEC-028 plus
`PII_HASH_KEY`) en schéma Zod, et `exigerEnvironnement()` refuse de démarrer, code de sortie 1, sur
un secret absent, trop court en octets, hors format, entouré d'une espace, préfixé `dev_` ou `stub`
hors `development` et `test`, ou égal à un autre (empreintes SHA-256). `kidDe()` et
`partners/ADR-0013` (`propose`, contrat du format chiffré) sont livrés ; `G-SEC-ENV` a sa preuve rouge.

**Reste.** Le câblage au démarrage réel du serveur et la double clé pendant 24 heures sont à QA-T04 ;
l'emploi du `kid` dans les jetons à SEC-03, SEC-04 et SEC-11 ; les assertions du format chiffré à
SEC-08. La reformulation de REQ-SEC-028 et HYP-E1-24 (huit secrets plus le sel) revient à A01.

**Appris.** `npx tsx` coûte 7 à 9 s par lancement sur ce poste, `node --import tsx` 0,7 s : une spec
qui juge une quinzaine de codes de sortie passe de deux minutes à quinze secondes. Et un témoin qui
colle un préfixe voisin devant un hexadécimal au hasard est instable : `stu` suivi d'un `b` tiré une
fois sur seize devient `stub`, et le vert dépendait du tirage.

… 24 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

