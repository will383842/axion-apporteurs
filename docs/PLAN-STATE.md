# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `310cf0c` — 2026-09-25T19:18:06+02:00 |
| Qu’est-ce qui est en vol ? | 1. #92 (un contrôle requis rouge ou une revue manquante) · 2. #82 (un conflit avec `main`) · 3. #91 (un conflit avec `main`) · 4. #93 (un conflit avec `main`) · 5. #124 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T08 (A05) · QA-T07 (A05) · GOV-092 (A03) · GOV-090 (A02) |
| Où en est la phase ? | phase 0 — 21/110 tâches, reste 66.10 j |
| Le prochain pas | SEC-08 — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #124 — 2026-09-25 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

21/110 tâches terminées · reste 66.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 222 | JUR-T02, QA-T08, QA-T04, QA-T07, QA-T30, CPL-T22, SEC-08, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 60 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **14.50 j**.

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
| 1 | #92 — feat(JUR-T01): gabarit de contrat v1 public, variables resolues et refus de publication | `t/jur-t01` | un contrôle requis rouge ou une revue manquante |
| 2 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 3 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un conflit avec `main` — à résoudre avant tout |
| 4 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un conflit avec `main` — à résoudre avant tout |
| 5 | #124 — chore(GOV-099): cadrage de DM-06 — sourceCanal transporte, IBAN hors DM-06, glossaire | `t/cadrage-dm-06` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T08 — Logger pino structuré, redaction PII, Sentry, notify | A05 | #70 | `a_faire` |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| GOV-092 — Une revision de corps de PR servie sans `diff` bloque `gov:entite` DEFINITIVEMENT, et les deux remedes que la garde nomme sont faux | A03 | #111 | `a_faire` |
| GOV-090 — La table des chemins reserves etiquette des VUES et laisse deux SOURCES ouvertes, et une garde prescrit un outil par un chemin irresolvable | A02 | #106 | `a_faire` |

⚠️ **41 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, SEC-07, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0020-le-champ-lot-declare-les-taches-d-une-pr-de-lot.md` — partners/ADR-0020 — Une PR de lot déclare ses tâches dans un champ `Lot:`, et la garde le croit exactement autant que le titre · `docs/adr/0021-quatre-lentilles-pour-l-argent-la-securite-et-les-donnees.md` — partners/ADR-0021 — Quatre lentilles pour l'argent, la sécurité et les données, deux pour le reste ; la prose inexacte est une dette, pas un refus

Dérivé de `git log` sur `docs/adr/`, restreint au jour du dernier atterrissage. Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`, tranchée ou tenue par une hypothèse datée.

## Prochain pas

**SEC-08** — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (1 j, **sur le chemin critique**) : 50 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

Deux pas, jamais un seul : la fusion en tête de file d’abord — lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage —, la tâche ensuite. L’ordre de la file se corrige à la rubrique « File de fusion », jamais ici.

## Dernier atterrissage

`origin/main` = `310cf0c` (2026-09-25T19:18:06+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

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
d'ici là, `DORMANCE_JOURS` n'existe qu'en paramètre.

**Appris.** `partners:schema:enums` ne confronte que les enums DÉCLARÉS par le schéma Prisma au
glossaire : un enum que le glossaire énumère sans qu'il existe encore dans le schéma ne rougit
pas. Poser `StatutApporteur` et ses voisins au §4 AVANT DM-06 fait que la première migration de
DM-06 sera jugée contre ces valeurs, au lieu d'en fixer elle-même le vocabulaire.

### PR #122 — 2026-09-25 — chore(GOV-098): perimetre fonctionnel decide par Will le 2026-09-25 — lignees, parrain, statistiques, bibliotheque

**Fait.** La décision de Will du 2026-09-25 est au registre : ligne `W15` en §1 de
`docs/DECISIONS.md`, dix hypothèses `HYP-W15-*` en §2, treize exigences nouvelles (REQ-DM-044 à 047,
REQ-UX-040 à 046, REQ-SEC-039 et 040) et REQ-UX-006 amendée — la liste des filleuls directs, réduite
au prénom, à l'initiale du nom et à l'état du contrat, devient la seule exception à l'interdiction
d'identité ; le montant reste agrégé par mois. Douze tâches versées par `hors-depot/verser-tache.mjs`
(DM-26 à 29, UX-P2-08 et 09, UX-P3-07 à 12), plus GOV-098 qui porte la PR ; aucune n'est livrée ici.
Le glossaire définit « lignée » et « équipe » ; `docs/ESPACE-ROUTES.md` rattache `/filleuls` à
REQ-UX-041.

**Reste.** Deux hypothèses `avenant` attendent Will avant le premier DocuSeal :
`HYP-W15-ART-4-6` (la liste des filleuls face à l'art. 4.6 al. 6 du gabarit) et
`HYP-W15-PARRAIN-A-DATE` (retirer au parrain d'origine les lignes futures n'a aucune base écrite
dans l'art. 4.6 al. 1). DM-26 et UX-P2-09 portaient « NE PAS ARMER » tant qu'elles étaient ouvertes. **Will les a tranchées le 2026-09-25** (« fais selon tes recommandations ») : art. 4.6 al. 6 amendé — liste réduite à « en signature » et « signé », le filleul au contrat résilié sort de la liste — et clause de correction du rattachement à motifs limitatifs ; la rédaction est portée par l'acceptance de JUR-T01, le texte définitif reste soumis à la relecture de Will (JUR-T01b).
Deux spécifications longues — `vues-derivees.spec.ts` et `refus-de-rendre-et-de-publier.spec.ts` —
n'ont pas été jouées dans l'arbre local (plus de dix minutes sous 1,3 Go libres) : la CI les juge.

Les lentilles `exactitude` et `securite` ont refusé `e57057d` : les états `signature_en_cours` et `termine` n'existaient dans aucune énumération (`StatutContrat` = `envoye|signe|remplace|resilie`), et le chemin d'export art. 15 des notes n'était pas nommé. Corrigé : table fermée dérivée du seul contrat courant, statut de l'apporteur filleul jamais lu, échec fermé ; notes jamais dans un écran de l'espace, incluses dans l'export art. 15 par la seule fonction d'export exemptée. Au tour suivant (`1467a95`), les deux lentilles ont refusé la « version courante », que rien ne définit : un avenant envoyé faisait repasser un filleul signé à « en signature ». La règle se dérive désormais de l'ensemble des versions ; l'échéance des 12 mois sur un filleul unique est nommée comme dette dans `HYP-W15-FILLEULS-VUE`. Cette dette est ensuite tranchée le 2026-09-25 par délégation de Will : l'échéance agrégée n'est pas affichée tant que moins de deux filleuls sont dans leur fenêtre (acceptance d'UX-P2-04). La lentille securite a refusé cette règle sur `4504684` (toute agrégation de dates vaut la date d'un filleul, et le seuil fuit) : l'échéance n'est plus affichée du tout, remplacée par un texte fixe, et une relation reprise se lit sur les versions postérieures à la dernière résiliation.

**Appris.** `pnpm lot:paths` ne lit pas le champ `paths` d'une tâche : il dérive ses chemins de sa
table manuelle, du registre des gardes, du champ `tests` et du drapeau `schema`. Une tâche versée
sans `tests` ni `schema` le fait JETER (« n'a aucun chemin ») ; `hors-depot/verser-tache.mjs` ne le
voit pas. Poser `tests` par `hors-depot/poser-champ.mjs` le lève. Et le code NAF que W15 demandait
de capter était déjà stocké au dépôt (REQ-INT-021, REQ-DM-030) : seul le repli manuel le laissait nul.

### PR #120 — 2026-09-25 — feat(GOV-097): quatre lentilles pour l'argent, la securite et les donnees, deux pour le reste

**Fait.** Décision de Will du 2026-09-25 (`W14`, `partners/ADR-0021`). `risqueDeLaPr()` ne prouve
plus qu'une PR est anodine par deux listes blanches : elle cherche des signaux. Élevé si une tâche
porte `sensible` non vide ou absent, `schema: true`, une zone `argent`/`securite`, une zone absente
ou inconnue du schéma du registre ; si la PR porte le label ou un chemin de schéma, un fichier en
zone sensible du code, un fichier du processus (garde des revues, dossier caché, racine,
`config/`) ; ou si le diff est vide, incomplet, sans tâche, sans base lisible. Une zone `espace`,
`juridique`, `integration`, `domaine` ou une autre zone à `sensible: []` qui touche du code
neutre se relit à deux lentilles. Fusion de `main` après #114 : une seule lecture par segment,
`segmentsNommesTouches()` dans `scripts/lot/revues.ts`, sert la section « Attaque » (liste
`ZONES_SENSIBLES`, répertoires seuls) et le risque (liste `SEGMENTS_DES_ZONES_SENSIBLES`, nom de
fichier compris). La charte §6 et le poste A09 disent qu'une inexactitude de prose est une dette, pas un
refus.

**Reste.** Les tâches qui manipulent des données personnelles avec `sensible: []` passent à deux
lentilles si leurs fichiers évitent les zones sensibles : le remède est de leur porter `rgpd` au
registre (`gardien-spec`). La section « Attaque » lit par segment depuis #114, mais sur la liste
étroite `ZONES_SENSIBLES` : `src/proxy.ts` élève le risque sans l'exiger ; l'élargir est un
changement de REQ-GOV-011, hors de cette tâche. La règle (2) n'est outillée
par rien : `gov:pr` bloque sur tout `Verdict: refuse`.

**Appris.** `ZONES_SENSIBLES` (`commissions/`, `attributions/`, `auth/`, `espace/`) se lisait en
préfixe depuis la racine, et aucun fichier suivi du dépôt ne commençait par l'un d'eux : le code vit sous
`src/`. Une liste « de zones sensibles » peut donc être juste en mots et ne rien désigner sur le
disque ; la reprendre telle quelle pour le risque aurait fait passer tout le code produit à deux
lentilles sans qu'aucun témoin ne rougisse. Le signal se lit maintenant par segments de chemin. —
Le gain de la décision (1) est borné par le registre : mesuré par le code, 31 tâches `partners`
restantes ordinaires avant, 43 après, relecture comprise, 38 sur 195 depuis la fusion de #116 ; la cause dominante de l'élevé est `sensible` non vide, que la
décision garde. — `refs/stash` est PARTAGÉ entre les arbres de travail d'un même dépôt : un
`git stash pop` lancé dans un arbre a tenté d'appliquer le remisage d'une autre session (refusé par
git, rien d'appliqué). Ne jamais utiliser `git stash` dans un arbre de travail de ce dépôt.

**Relecture.** Deux refus sur `11a0502`. `securite` (5316365953) : le code de sécurité déjà au
dépôt redescendait à deux lentilles : `api-entrante.ts` (SEC-07, `auth`), l'attrape-tout
`[...inconnu]/route.ts`, les deux `journal.ts` (DM-01, `rgpd`) ressortaient ordinaires sous
`feat(INT-T11)`. Remède : la sensibilité suit le FICHIER. `fichiersDesTachesAElever()` rend élevé
tout fichier du code produit (`src/`) qu'une tâche quelconque du registre, base et tête, déclare
(`paths` et `tests{}`, par `cheminsDeLaTache()`) si elle élèverait seule une PR ; la raison nomme le
fichier et la tâche. La liste des segments gagne `session`, `sessions`, `crypto`, `chiffrement`,
`cloisonnement`, `middleware` ; aucun des 250 fichiers suivis sous `docs/`, `scripts/`, `tests/`,
`src/` n'y répond. `nuDuSegment()`, lecture unique de l'Attaque et du risque, retire désormais
`[...x]`, `[[...x]]`, `@x`, `(.)x`, `(..)x`, `(...)x` répétés. `mutation` (5316513348) : la casse
et la frontière répertoire/fichier de l'Attaque ont chacune leur témoin, vus rougir sous la
mutation. Pourquoi `src/` seul : étendue à tout le dépôt, la règle rendait 24 tâches `partners`
ordinaires sur 194, moins que les 31 d'avant GOV-097, parce que des tâches de gouvernance portent
`sensible` sur des scripts partagés (GOV-008 pour `scripts/plan-state/build.ts`, GOV-018 pour
`scripts/gates/gov-lecons.ts`). Limitée au code produit, elle en rend 43 ; 38 sur 195 après la fusion
de #116, dont `revues.ts` importe `gov-attributions.ts`, qui entre dans la garde des revues et fait
monter GOV-073, GOV-074, GOV-075, GOV-081 et GOV-084 ; les scripts de contrôle
gardent leurs propres signaux, et un `scripts/gates/*` hors de la garde reste ordinaire (dette déjà
relevée par `securite`).

… 47 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

