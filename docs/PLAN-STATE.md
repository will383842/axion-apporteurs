# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `87e235a` — 2026-09-23T04:50:19+02:00 |
| Qu’est-ce qui est en vol ? | 1. #102 (rien) · 2. #91 (un contrôle requis rouge ou une revue manquante) · 3. #82 (un conflit avec `main`) · 4. #88 (un conflit avec `main`) · 5. #92 (un conflit avec `main`) · 6. #93 (un conflit avec `main`) · 7. #99 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T08 (A05) · QA-T07 (A05) · GOV-092 (A03) |
| Où en est la phase ? | phase 0 — 20/103 tâches, reste 62.60 j |
| Le prochain pas | fusionner #102, puis SEC-08 — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #112 — 2026-09-23 |

**Ce qu’on tape maintenant.** `gh pr view 102 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

20/103 tâches terminées · reste 62.60 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 204 | JUR-T02, QA-T08, QA-T04, QA-T07, QA-T30, CPL-T22, SEC-08, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 59 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
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

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #102 — docs(GOV-063): ADR 0018 tranche l'homonymie, le nom gov:check est retire des deux cotes | `t/gov-check-homonymie` | rien — fusionnable maintenant |
| 2 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un contrôle requis rouge ou une revue manquante |
| 3 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 4 | #88 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur | `t/qa-t08` | un conflit avec `main` — à résoudre avant tout |
| 5 | #92 — feat(JUR-T01): gabarit de contrat v1 public, variables resolues et refus de publication | `t/jur-t01` | un conflit avec `main` — à résoudre avant tout |
| 6 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un conflit avec `main` — à résoudre avant tout |
| 7 | #99 — feat(GOV-047): pnpm prevol existe enfin, derive du job gate-a et non de la chaine gov:check | `t/gov-047` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T08 — Logger pino structuré, redaction PII, Sentry, notify | A05 | #70 | `a_faire` |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |
| GOV-092 — Une revision de corps de PR servie sans `diff` bloque `gov:entite` DEFINITIVEMENT, et les deux remedes que la garde nomme sont faux | A03 | #111 | `a_faire` |

⚠️ **40 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

`docs/adr/0017-revendication-derivee-de-la-forge.md` — partners/ADR-0017 — La revendication d'une tâche se dérive de la forge, pas du fichier de la branche

Dérivé de `git log` sur `docs/adr/`, jour du dernier atterrissage (2026-09-23). Une décision de Will n’est pas un ADR : elle vit au registre `docs/DECISIONS.md`.

## Prochain pas

**Fusionner #102** — elle est en tête de file et ne bloque sur rien. Lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage.

**SEC-08** — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (1 j, **sur le chemin critique**) : 44 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `87e235a` (2026-09-23T04:50:19+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #112 — 2026-09-23 — fix(GOV-092): une revision servie sans `diff` bloque la porte A, et les deux remedes nommes sont faux

**Fait.** `pnpm gov:entite --corps-publie 102` rendait INDÉTERMINÉ et faisait échouer la porte A, et
le défaut n'était pas l'écart annoncé/lu : il était dans le REMÈDE. Le message de
`revisions_non_lues` nommait deux causes et deux remèdes, et aucun des deux ne s'appliquait à ce
cas-là. La forge sert `diff: null` quand une édition a produit un corps VIDE ou un corps INCHANGÉ,
et la PR #102 porte l'un et l'autre cas, aux horodatages `2026-09-23T00:21:32Z` et
`2026-09-23T00:21:56Z` ; la pagination fonctionnait, `PAGES_MAX` n'était pas atteint, et relancer la
garde ne changeait rien puisque la réponse est stable. `assemblerLecture` CLASSE désormais les
nœuds au lieu d'en écarter certains en silence, `LectureDuCorps` porte `revisionsIllisibles`, et
`jugerCorpsPublie` décompose l'écart en trois causes nommées, chacune avec son message et son
remède. La sortie réutilise le mécanisme déjà conçu pour l'irréparable : une ligne de
`config/exemptions-corps-publie.json` dont l'`empreinte` est ABSENTE absout la révision entière au
lieu d'une coordonnée, `definitive` y est exigé vrai, et elle ne vaut QUE pour une révision
illisible. Les lignes qui absolvent la PR #102 sont posées dans cette PR, avec leur motif. Mesure
d'ouverture rejouée après correctif : exit 0, et le vert imprime la dette qu'il porte.

**Reste.** ⚠ CE PARAGRAPHE A PORTÉ DEUX FOIS UN FAIT CHIFFRÉ FAUX, et la seconde fois était la
CORRECTION de la première. D'abord « les cases 3, 4, 6 et 8 sont vides » ; puis, en corrigeant,
« le corps en cochait deux, 4 et 8 ». La lentille `exactitude` a refusé les deux fois, et elle a
mesuré : **seule la case 3 est vide parmi les sept premières** — « relecteur n'est pas l'auteur », que seules
les lentilles peuvent rendre vraie — et la case 8 atteste la fusion, donc elle ne peut être que vide
avant elle. La leçon est plus large que le chiffre : **une phrase écrite de mémoire dans un document
permanent se vérifie en la MESURANT**, et `gov:pr --pr <n>` la mesure en dix secondes.
Ce qui reste vrai : aucun ADR n'est ouvert parce que l'arbitrage de la forme
large est prescrit par l'acceptance de GOV-092 plutôt que pris ici — s'il mérite son ADR, il
appartient à l'`architecte` (A02) —, aucune route d'interface n'est touchée, et la fusion
appartient à A04.

Les quatre lentilles ont accepté. ⚠ Ce paragraphe a d'abord annoncé « dix dettes » : un total
TAPÉ, qu'aucun des quatre avis ne porte et qu'aucun dédoublonnage n'annonçait — les avis déclarent
sept, cinq, quatre et six. Les dettes se lisent donc **lentille par lentille, dans les avis**, qui
les portent déjà avec leur fichier et leur ligne : `simplicite` revue 5285895325, `securite` revue
5285899400, `exactitude` revue 5285927152, `mutation` revue 5285938658, et les reconfirmations
5286021379, 5286034454, 5286032630 et 5286064623. Aucun total n'est recopié ici : un nombre tapé à
côté de quatre documents qui le portent redevient faux au premier avis suivant. Celles qui suivent méritent
cependant d'être NOMMÉES ici, parce qu'une dette qui n'entre pas au journal cesse d'exister à la
fusion. ⚠ Ce paragraphe a porté DEUX comptes contradictoires sur cette même liste — « trois » à
l'ouverture, « cinq » à la clôture, après qu'un commit en eut ajouté deux sans toucher au premier.
Troisième occurrence de la même classe de défaut sur cette PR. La liste **se compte seule** : plus
aucun nombre ne la précède ni ne la suit.
(1) `mutation` a fait survivre le mutant qui retire le terme d'appariement sur l'absence
d'empreinte : rien ne prouve qu'une exemption de COORDONNÉE ne blanchit pas une révision
ILLISIBLE — le sens inverse, lui, est prouvé. (2) **Le banc de porte A ne sait pas qu'il a cessé
de mesurer** : en retirant du banc les deux témoins neufs, `--corps-publie --prove` sort en 0 et
imprime toujours que ses six familles rougissent, parce que la non-vacuité est au grain de la
FAMILLE alors que les causes neuves vivent DANS une famille. C'est la dette la plus dangereuse de
la PR, et elle a la forme exacte du défaut que la PR ferme : elle est portée par **GOV-094**, versée
ici même, qui fait descendre le grain de la non-vacuité de la FAMILLE à la CAUSE. (3) Le
discriminant des deux formes
étant l'ABSENCE d'une clé, une ligne portant `empriente` mal orthographié est déclarée bien
formée et absout la révision entière — sur la base, la même ligne rougissait. (4) Trois dettes
que le premier tour avait laissées hors du journal, et qui y entrent : le `_commentaire` de
`config/exemptions-corps-publie.json` s'ouvre en s'annonçant exhaustif (« les trois clés doivent
concorder ») et n'annonce la seconde forme qu'en fin de chaîne ; le prédicat de la forme large est
nommé une fois et retapé anonymement cinq fois ailleurs ; et **une seule ligne d'exemption absout
toutes les révisions qui partagent son horodatage**, alors que le commentaire du registre affirme
qu'elle couvre « UNE RÉVISION PRÉCISE ». (5) Et une dernière, nommée ici faute de mieux : le
garde-fou qui **borne à zéro** le compteur
des révisions jamais servies survit à sa mutation. Dès que la forge servirait plus de nœuds qu'elle
n'en annonce, ce compteur passerait sous zéro, l'égalité à zéro qui commande l'évaluation de la
famille des exemptions sans objet deviendrait fausse, et **cette famille cesserait d'être évaluée en
silence**. GOV-094 ne la couvre pas.

**Aucune de ces dettes ne laisse fuir une coordonnée** : `securite` l'a établi en fabriquant douze
scénarios contre le code tel que livré et en balayant la population entière du dépôt, et `mutation`
en posant ses mutants et en rejouant le banc de la porte A.

Les dettes du quatrième point viennent de `simplicite` et de `securite`, la cinquième de `mutation`.

⚠ CETTE PHRASE PORTAIT UNE CLAUSE FAUSSE, et la correction précédente l'avait FABRIQUÉE : elle
ajoutait qu'aucune de ces dettes n'avait été mesurée par la sécurité à l'origine. `securite` et
`exactitude` l'ont mesuré indépendamment : au moins deux le sont — la ligne d'exemption qui absout
toutes les révisions partageant son horodatage, et l'orthographe qui élargit en silence — toutes
deux dans la revue 5285899400, avec leur fichier et leur ligne. La première moitié de la phrase,
elle, a été mesurée exacte par `simplicite`. **Quatrième fois qu'une clause est ajoutée sans
retirer celle qu'elle contredit** : la clause est SUPPRIMÉE, pas nuancée.

Le reste de l'attribution ne se recopie pas ici : chaque avis nomme déjà sa lentille, son fichier
et sa ligne, et les revues sont listées plus haut.

Le registre ne sait toujours pas distinguer une valeur fabriquée d'une valeur réelle : ce résidu est
déclaré dans le `_commentaire` du fichier et cette PR ne le change pas. Rien n'empêche non plus
qu'une ligne de la forme large soit écrite AVANT que la révision devienne illisible — la garde la
refuserait en `exemption_sans_objet`, mais personne ne le verrait venir. Enfin, la cause d'un `diff`
nul est AFFIRMÉE et non mesurée : `UserContentEdit` porte `deletedAt`, que la requête ne demande
pas, et une révision dont le contenu a été SUPPRIMÉ est indiscernable d'un corps vide alors qu'elle
a porté du texte. Sur la population entière du dépôt — 54 PR balayées par `securite` — les deux
seuls nœuds à `diff` nul portent `deletedAt` nul, donc l'affirmation est vraie aujourd'hui ; elle
n'est pas gardée pour demain.

**Appris.** ⚠ Un remède FAUX coûte plus cher qu'un remède absent. Le message nommait deux causes
avec l'autorité d'un diagnostic complet ; le lecteur a donc rejoué une commande qui ne pouvait rien
changer, trois fois, avant de soupçonner le message lui-même. Un message de garde qui énumère des
causes doit dire comment on SÉPARE celle qui s'applique, ou n'en nommer aucune. Deuxième fait
mesuré, et il vaut pour toute garde qui lit une forge : `userContentEdits` rend des nœuds dont les
champs sont nullables, et un `continue` sur un nœud illisible fait DISPARAÎTRE l'information que ce
nœud a existé — elle retombe alors dans un compteur partagé avec une tout autre cause, et les deux
deviennent indiscernables. Classer coûte un champ ; confondre coûte une porte A. Troisième fait :
une exemption mal formée absolvait quand même sa cible, ici comme du côté de la forme à empreinte.
Une ligne illisible qui absout reste indiscernable d'une ligne saine, puisque le verdict est le même
des deux côtés.

### PR #109 — 2026-09-22 — chore(GOV-091): l'entrée de journal de la PR 108 manquait — main était rouge sans elle

**Fait.** L'entrée de journal de la PR 108, absente à sa fusion, est écrite ici, dérivée du corps de
la PR et de son diff. `pnpm gov:etat` repasse d'un défaut (`pr_fusionnee_sans_journal`,
REQ-GOV-023) à neuf familles évaluées sur neuf, et les deux spécifications qui rougissaient pour
cette seule cause — `plan-state-frais.spec.ts` et `une-tache-un-owner.spec.ts` — redeviennent
vertes. Cette PR porte aussi sa PROPRE entrée : sans elle, sa fusion reproduirait le défaut qu'elle
répare.

**Reste.** Le défaut structurel n'est pas fermé ici, et il n'appartient pas au documentaliste :
`pr_fusionnee_sans_journal` ne peut pas rougir AVANT la fusion, son prédicat étant que la PR est
fusionnée. Aucune garde d'avant-fusion ne l'exige : `gov:pr` ne lit jamais `docs/journal/`, et la
seule mention du dossier dans son code est le contre-témoin qui grave ce choix. La seule victime
possible est donc `main`. GOV-052 porte ce remède au registre, et GOV-073 passe avant elle ou avec
elle, sous peine d'une cinquième grammaire d'entrée de journal. GOV-088 reste `a_faire` au registre
alors que sa PR est fusionnée : c'est la dette de clôture de lot, déjà connue.

**Appris.** Le rouge d'une garde qui interroge la forge n'appartient à aucune branche : les deux
spécifications rougissaient sur TOUTE branche sans qu'aucune n'ait changé une ligne, et un seul
fichier de documentation les rend vertes. Mesuré au passage : `pnpm gov:etat` sans `--now`
n'évalue que huit familles sur neuf et sort 0 en le DISANT — un vert local obtenu sans l'instant
est plus faible que celui de la porte A, qui le donne. Mesuré aussi, et c'est un coût qu'on paie
sans le voir : cette PR a d'abord cité la tâche HISTORIQUE qui déclare `docs/journal/`, laquelle
porte `sensible: [auth]` ; `gov:pr` classait alors deux fichiers de prose en « risque élevé, 4
lentilles exigées ». Versée en tâche dédiée à `sensible` vide, la même PR rend « risque ordinaire,
2 lentilles ». Le classificateur mesurait bien ce qu'il annonce : c'est la tâche empruntée qui
mentait sur la nature du geste, et le prix se payait en relectures pendant que `main` était rouge.

### PR #108 — 2026-09-22 — fix(GOV-088): le glossaire interdisait la colonne qu'il prescrit, et un .ts ne peut citer aucun terme interdit

**Fait.** `docs/GLOSSAIRE.md` interdisait en ligne 149 la forme qu'il prescrit en ligne 126 : la
colonne de la table de réception, dont le texte de REQ-DM-036 est repris mot pour mot. La règle
posée se dérive du registre au lieu de nommer un cas : un jeton que le registre attribue AUSSI à un
autre rôle ne peut pas porter un interdit sec — il devient un interdit sous condition, que la garde
n'exerce pas et qu'elle imprime. Trois jetons passent sous condition, et un est récupéré :
`subjectRef` était désarmé par un accident de ponctuation, le tiret cadratin qui suivait le dernier
jeton de la liste. Le compte des interdits exercés va donc de 37 à 35, pas à 34. Un témoin neuf,
`enveloppe_camelcase_hors_contrat`, entre au code ET au registre, les deux sens du refus mesurés :
30 témoins deviennent 31.

**Reste.** Un marqueur de citation pour les fichiers TypeScript a été essayé puis réfuté sur mesure :
le `//` d'une URL ouvre une zone de commentaire et amnistie la même instruction exécutée. La limite
est nommée au glossaire avec son propriétaire, GOV-069. REQ-DM-036 s'épelle elle-même avec un
synonyme interdit : le développeur de SEC-06 lira le mauvais nom dans sa propre exigence. Le §5 du
glossaire porte un avertissement périmé. Le champ `verifie` de `docs/gates.json` n'apparaît dans
aucune vue.

**Appris.** L'accident réparé l'est par l'INSTANCE, pas par la famille : un jeton ajouté en fin de
bloc et suivi d'une glose naîtra désarmé de la même façon. Et la face verte annoncée n'est pas la
ligne que SEC-06 écrira — la même ligne rougit sous la garde des énumérations, la colonne devra
être un enum.

… 39 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

