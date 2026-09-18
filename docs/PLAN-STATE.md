# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `300b72d` — 2026-09-18T23:17:08+02:00 |
| Qu’est-ce qui est en vol ? | 1. #59 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T01 (A05) · GOV-039 (A05) · GOV-041 (A05) · GOV-043 (A05) · GOV-044 (A05) · GOV-056 (A05) |
| Où en est la phase ? | phase 0 — 0/98 tâches, reste 75.85 j |
| Le prochain pas | QA-T01 — Squelette de tests et Gate A bloquante (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #55 — 2026-09-17 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

0/98 tâches terminées · reste 75.85 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 219 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 39 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
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
| 1 | #59 — feat(QA-T01): squelette de tests et Gate A bloquante, domaine a 100 %, lint sans tolerance | `t/qa-t01` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T01 — Squelette de tests et Gate A bloquante | A05 | #56 | `a_faire` |
| GOV-039 — Quatre-vingt-huit titres de test etiquetes par l'exigence d'un AUTRE sujet | A05 | #52 | `a_faire` |
| GOV-041 — La cloture ecrit un statut sur une entree qu'elle n'a pas verifiee | A05 | #50 | `a_faire` |
| GOV-043 — Le controle compensatoire de la tracabilite ne couvre qu'un quart du backlog | A05 | #58 | `a_faire` |
| GOV-044 — Une garde absente du registre s'exempte elle-meme de la garde qui verifie qu'on l'appelle | A05 | #51 | `a_faire` |
| GOV-056 — Le composeur compare des `paths` quand les taches promettent des `tests{}`, et rien ne juge les fichiers d une PR | A05 | #49 | `a_faire` |

⚠️ **20 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, GOV-035, GOV-036, GOV-037, GOV-030, GOV-031 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-18 (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre `docs/DECISIONS.md`, tranchées ou tenues par une hypothèse datée.

## Prochain pas

**QA-T01** — Squelette de tests et Gate A bloquante (0.5 j, **sur le chemin critique**) : 34 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `300b72d` (2026-09-18T23:17:08+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #55 — 2026-09-17 — test(GOV-039): un titre de test confronte son identifiant au texte de l exigence nommee

**Fait.** `gov:requirements` confronte désormais `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` au registre :
pour chacune des 28 fusions décidées, la survivante doit être active, chaque absorbée doit porter son
renvoi, et chaque MARQUEUR du texte décidé — les 66 spans de code de l'arbitrage, dérivés et jamais
listés — doit se retrouver dans le texte appliqué. Le rouge d'origine portait sur REQ-QA-014, que
cette PR couvre : l'arbitrage rendu exigeait « le titre `it()` contient son identifiant » et « les
corps de PR listent `Couvre: REQ-nnn` », et le texte appliqué disait l'inverse. Le texte en vigueur les
reprend, sans perdre la clause `@req`. Les 87 titres de la garde d'entité qui s'étiquetaient
REQ-CPL-018 en parlant d'IBAN, de BIC et de SIREN portent REQ-GOV-031 ; le seul titre qui teste
REQ-CPL-018 pour de bon n'a pas bougé et un témoin le protège en exigeant que tout titre qui la nomme
LISE sa ligne source. Cinq titres nommaient une exigence absorbée sans son renvoi : ils le portent.
Après trois refus de lentille le 2026-09-18, la spécification lit les titres par LA lecture de
`gov:trace`, et sur son périmètre, sortis dans `scripts/lot/titres-ecrits.ts` ; la garde juge un
marqueur comme jeton délimité — `siren` et `signe` ne tenaient que par sous-chaîne, et rejoignent la
dette — et nomme toute puce de fusion qu'elle ne sait pas lire, compte déclaré de l'annexe à l'appui.

**Reste.** Vingt-cinq clauses décidées manquent encore au texte appliqué de quinze exigences ; elles
sont déclarées, datées et motivées dans `DETTE_TEXTE_DECIDE`, et aucune n'est réparable par un agent —
sept touchent à l'ARGENT, cinq à la SÉCURITÉ, deux portent un ré-arbitrage postérieur à l'annexe qui
périme l'annexe elle-même, et non le registre. Le geste juste y est un ADR, pas un champ réécrit. La
part non mécanisable de GOV-039 — « ce titre parle-t-il du bon sujet » — reste une RELECTURE NOMMÉE :
quatre mécanisations ont été mesurées et abandonnées, leurs chiffres sont dans l'en-tête de la
spécification. La dette GOV-082 reste ouverte. La dette relevée sur la PR 48 qui annonçait un écart
14 contre 13 est PÉRIMÉE : `--prove` mesure bien 14 sur la tête fusionnée.

**Appris.** Nommer une tâche dans la prose d'une entrée de `docs/gates.json` exige que le FICHIER de
cette gate soit dans les `paths` de la tâche nommée — pas dans ceux de la tâche qui écrit.
`gov:attributions` a refusé en `mention_hors_paths` un amendement daté qui se contentait de se
signer : la prose d'une gate se date, elle ne s'attribue qu'au porteur du script. Et un module de
garde importé par sa propre spécification tue le worker `vitest` au premier `process.exit` : sans
`LANCE_EN_SCRIPT`, la suite entière sort en `no tests` sur le refus `process.exit unexpectedly`
du worker — une garde qui EXÉCUTE son code au lieu d'en lire le texte paie d'abord ce prix-là.
Une lecture qu'on ne peut pas importer finit recopiée, et la copie est la plus pauvre : la seconde
lecture des titres ratait quinze titres à identifiant, et une exigence absorbée y passait en exit 0.

### PR #54 — 2026-09-17 — feat(GOV-044): le perimetre des gardes se derive du disque, le registre s y confronte

**Fait.** La famille `garde_ecrite_jamais_appelee` de `gov:conventions` tirait sa population du
registre : un script de garde absent de `docs/gates.json` n'était jamais confronté à la question de
savoir si quelqu'un l'appelle, et la gate sortait en zéro. Le périmètre part désormais du DISQUE —
les fichiers `scripts/gates/*.ts` suivis par git — et le registre est ce qu'on lui confronte. Une
garde écrite que le registre ne nomme pas est un refus nommé, `garde_hors_registre` ; le décompte
des deux populations est imprimé à chaque passage ; une garde délibérément hors CI se DÉCLARE dans
un champ `horsCi` d'au moins soixante caractères, la même exigence que pour un périmètre vide. Le
filtre `g.phase` au plus `-1` n'est pas reconduit, et la décision est écrite à côté du code avec sa
mesure : c'était un proxy de « déjà écrite », que le disque remplace par le fait. Trois témoins
gardent ce choix — phase 0 non câblée rouge, phase 0 câblée verte, phase future non écrite
silencieuse. Vingt-trois témoins, aucune assertion d'orthographe : chacun exécute le contrôle, la
confrontation, le périmètre ou le script entier, et la population est recomptée hors de sa fonction
par un `git ls-files` lu dans le test. Les deux gardes hors registre, `gov:attributions` et
`gov:attestation`, y sont inscrites par `outils/ajouter-entree.mjs`, le verbe d'ajout né le
2026-09-18 pour ce geste, avec son motif au journal des réécritures : 115 entrées deviennent 117,
dix-neuf lignes ajoutées, aucune retirée. La seconde porte le premier champ `horsCi` du registre.
Chaque preuve versée a été remesurée sur la tête avant l'écriture : les quatre dettes retirées par
la PR 48, réinsérées, font sortir `gov:attributions` en 1 sur quatre `dette_perimee` ; un SHA nul
posé sur `INT-T01b` passe la forme et `gov:attestation --en-ligne` le rejette en HTTP 422. Le refus
`garde_hors_registre` conseillait `reecrire-champ.mjs`, qui refuse précisément une entrée absente ;
il nomme maintenant `ajouter-entree.mjs`, et un témoin l'épingle. La lentille mutation a refusé la
tête `6a88e1b` : deux mutants survivaient, qui absolvaient toute garde dès qu'une entrée du
registre porte un alias, parce que chaque témoin tournait sur un registre injecté sans alias ni
`horsCi`. Cinq témoins partent désormais du registre RÉEL : retirer l'entrée de chaque garde
inscrite, une garde neuve sans entrée, le décâblage de chaque garde à alias, et le même jeu lancé
dans un dépôt jetable dont on lit le code de sortie. Les deux mutants sont tués, la garde n'a pas
changé.

**Reste.** Les huit cases de la définition de terminé, que Will coche, et la relecture de la
lentille mutation sur la nouvelle tête. Hors périmètre et non touché : le tri des entrées de registre sans script sur le
disque — autre dépôt, phase future, entrée fautive — qui appartient à GOV-051, et que le rendu
compte à trente sans les distinguer. Effet de bord déclaré : `gov-conventions.ts` est partagé par
quatre tâches, donc GOV-051 n'est pas composable tant que cette PR est ouverte.

**Appris.** LE VERBE QUI MANQUE EST LA CAUSE DU TROU QU'ON MESURE. L'acceptance datait du 2026-09-12
et disait « le SEUL des 24 scripts » ; la mesure du jour en donne VINGT-SIX, dont DEUX hors registre
— `gov-attestation.ts`, et `gov-attributions.ts`, la garde livrée par la PR 45, ajoutée au trou
pendant qu'on le décrivait. On a d'abord lu cet écart comme une négligence de livraison. Il n'en est
pas une : `docs/gates.json` n'a pas de verbe d'ajout, donc TOUTE garde neuve atterrit hors du
registre, par construction, et le trou se régénère à chaque livraison. L'acceptance n'est pas
réécrite, délibérément : sa mesure était vraie et datée, et l'écart entre les deux EST la
démonstration de la thèse — un registre tenu à la main se périme pendant qu'on l'écrit. Second
apprentissage, plus étroit : une garde peut avoir une raison ÉCRITE de ne pas être câblée —
`gov:attestation` interroge la forge par `gh` et GOV-038 l'a laissée hors CI exprès — et tant que ce
motif ne vit nulle part qu'une garde puisse lire, il ne reste que deux issues, un rouge permanent
qu'on apprend à ignorer, ou le silence. C'est pour cela que la déclaration est un champ du registre
et pas un commentaire. Troisième : un refus qui propose le mauvais geste est un piège poli. Celui-ci
nommait un verbe qui répond « aucune entrée » sur exactement le cas qu'il décrit ; on le suit, il
refuse, et le trou reste ouvert avec une conscience tranquille. Quatrième, apporté par la lentille
mutation : un témoin dont les données n'ont pas la FORME du vrai registre ne garde que la forme qu'il
a inventée. Dix-huit témoins verts ne disaient rien des alias parce qu'aucun n'en portait.

### PR #53 — 2026-09-17 — fix(GOV-041): la cloture refuse un resultat etranger au lot et un lotId absent

**Fait.** `pnpm lot:cloture`, seul écrivain de `statut`, `pr`, `branch` et `owner` dans
`docs/tasks.json`, ne pouvait pas dire quelles tâches le lot portait : il ne lisait nulle part la
liste de ses membres et posait `lot` sur toute entrée que le rendu nommait. Le périmètre d'un lot se
LIT désormais, et il a deux sources dont la préséance est écrite plutôt que subie :
`docs/lots/lotId/lot.json` fait foi, et à son défaut — le dossier est ignoré par git, donc le fichier
n'existe que dans l'arbre où le composeur a tourné et rien ne le régénère — le champ `lot` de
`docs/tasks.json`, qui est suivi et que le rendu ne contrôle pas. Un identifiant que le rendu nomme
et que le périmètre ne contient pas est un refus `tache_etrangere_au_lot` ; un rendu sans `lotId` est
un refus `lot_du_rendu_absent`, là où seul un `lotId` FAUX était refusé ; une absence de périmètre
est un refus `lot_introuvable`, jamais un périmètre vide. Les trois refus sont posés EN AMONT de la
boucle qui écrit : ni la branche qui pose `fusionnee`, ni celle qui recompte la tentative n'écrit
quoi que ce soit quand l'un d'eux se lève, et les témoins le vérifient par l'EFFET, pas par le
message. Le module s'importe enfin sans le moindre effet de bord, sous `LANCE_EN_SCRIPT` ancré sur
son dossier, son nom et la fin de chaîne — le patron de `scripts/plan-state/build.ts` et de
`scripts/lot/composer.ts` — et sa règle est EXPORTÉE : `perimetreDuLot`, `controlerLePerimetre` et
`cloturerLeLot` sont APPELÉES par vingt et un témoins, dont quatre qui lancent le SCRIPT ENTIER sur
un dépôt jetable.

**Reste.** Les huit cases de la définition de « terminé » sont vides : l'auteur ne les coche pas,
c'est Will qui atteste. Le troisième trou de la mesure du 2026-09-09 — pour une tâche LOCALE, rien
n'écrit ni ne vérifie le sha de fusion — est porté par GOV-042, qui étend l'attestation aux tâches
locales ; l'ordre D-15 impose GOV-041 puis GOV-042 puis la dette numéro 2, en trois lots successifs,
parce que les trois partagent `scripts/lot/cloture.ts`. Deux silences subsistent et ne sont pas
couverts ici : un résultat sans `dev.taskId` est ignoré avec un avertissement, et surtout un membre
du lot dont le rendu ne dit RIEN ne reçoit rien — ni statut, ni tentative — alors que c'est le
miroir exact du trou que cette PR ferme. Il faudra une tâche pour ce second cas. Le composeur
n'exclut toujours pas les tâches déjà composées, et `docs/lots/` reste hors suivi. Enfin, deux rouges
de `pnpm test` sont HORS de ce diff et restent dus : `gov:etat` rougit en
`pr_sur_tache_non_revendiquee` sur les deux PR sœurs du lot, parce que leur revendication n'a été
écrite que dans le `docs/tasks.json` de leur propre arbre. Le geste qui l'éteint est
`reclasser --revendiquer` sur CETTE branche pour les deux autres tâches ; le classificateur de
permissions me l'a refusé, et c'est à l'orchestrateur de le poser sur les trois branches.

**Appris.** Un contrôle rangé sous la condition qui l'a fait naître garde la moitié des cas, et la
moitié se mesure. Huit pannes fabriquées sur ce correctif, toutes vues : deux d'entre elles se
bornent à REDESCENDRE le contrôle de périmètre dans la branche `fusionnee`, là où le défaut avait
été observé en 2026-09-09. Elles laissent seize témoins sur vingt et un VERTS, et seuls ceux qui
mesurent l'EFFET — aucun statut écrit — les tuent ; le témoin qui appelle la fonction de contrôle
directement reste vert sous les deux. Plus net encore : tant qu'un rendu contient au moins un
résultat fusionné, un refus mal placé se déclenche quand même et PARAÎT garder. Il faut un rendu
dont AUCUN résultat n'est fusionné pour voir l'intrus se faire recompter `attempts` en silence.
Deuxième fait mesuré : glisser l'intrus au MILIEU du rendu plutôt qu'en queue distingue « tous » de
« le dernier » — un contrôle réduit à `slice(-1)` reste vert sur un intrus en fin de liste et tue
trois témoins sur un intrus au milieu. Troisième fait, et il coûte un tour à qui l'ignore :
`gov:attributions` ne relit que les VINGT premières lignes d'un fichier pour y chercher des noms de
tâches. Nommer, dans l'en-tête d'un fichier, la tâche dont on raconte l'incident fondateur est un
`mention_hors_paths` — le lecteur suivant irait chercher chez elle un fichier qui n'est pas à elle.
Le fait se raconte donc plus bas, ou sans le nom.

… 18 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

