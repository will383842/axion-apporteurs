# Reprendre Axion Partners — note de passation

> **Ce fichier n'est pas une source.** Il ne décide rien, ne définit aucune règle, et ne fait foi
> contre aucun document de `docs/PRESEANCE.md`. C'est une note de passation entre sessions : ce
> qu'une session a compris, et qui coûterait une demi-journée à réapprendre. Les chiffres qu'il cite
> sont datés et périment ; les sources vivantes sont `docs/PLAN-STATE.md` (vue régénérée),
> `docs/tasks.json` (statuts), `docs/journal/` (fait / reste / appris par PR) et `docs/LECONS.md`.
>
> Il vit dans le dépôt, et pas dans `docs/lots/` — ce dossier est en `.gitignore`, la note qui s'y
> trouvait aurait disparu au premier `clone`.

## Reprendre en trente secondes

```bash
cd C:\Users\willi\Documents\Projets\axion-apporteurs   # ⚠️ DEPUIS le dépôt, sinon les 15 fiches
claude                                                  #    de rôle ne résolvent pas
```

### ⚠️ Le premier geste de la prochaine session n'est PAS de composer un lot

**La PR #30 est ouverte et incomplète — elle se finit avant tout le reste.** Elle porte la clôture
de `L-1-03`, son corps est écrit, sa Gate A locale rejouée en entier, mais **les quatre lentilles
n'ont pas rendu leur verdict** : la session du 2026-09-04 avait pour consigne de clôturer et de
s'arrêter là. La 3ᵉ case de la définition de « terminé » est laissée **vide exprès**, et
`pnpm gov:pr --pr 30` est ROUGE tant que les revues manquent — c'est l'état voulu, pas un oubli.

```bash
cd C:\Users\willi\Documents\Projets\axion-apporteurs
git checkout lot/L-1-03-cloture && git pull
pnpm gov:pr --pr 30            # lit ce qui manque : lentilles_manquantes + la 3e case
# → 4 lentilles : exactitude · securite · simplicite · mutation, chacune en commentaire
#   portant « Verdict: accepte|refuse ». Le DERNIER verdict par couple (poste, lentille) prime.
# → cocher la 3e case une fois les quatre verdicts postés
pnpm gov:pr --pr 30            # doit être VERT avant de fusionner
bash <gate-a>                  # les 37 étapes, chaque $? lu, jamais un tube
gh pr merge 30 --squash --delete-branch     # état relu et fusion dans le MÊME appel
# → Pas 7 : origin/main au sha d'écrasement ET le run Gate A du push VERT
pnpm gov:pr --apres-fusion 30  # coche la 8e case APRÈS avoir lu le run
```

**Ensuite seulement**, et pas avant, la phrase d'amorçage habituelle — **« Relance l'implémentation
d'Axion Partners au lot suivant. »** — et le geste qui la sert :

```bash
pnpm plan-state:build          # régénère l'état vivant
pnpm reprise                   # régénère docs/lots/REPRISE.md depuis git + GitHub
pnpm lot:composer -- --phase -1 --repo partners --max 8 --now <AAAA-MM-JJ>
```

Le composeur sort le lot suivant tout seul. **Il n'y a rien à décider pour redémarrer.**

## L'état au 2026-09-04

**Sur `main` : 12 tâches sur 197, 9,50 j sur 149 — 6,4 % de l'effort.**
**Sur la branche de la PR #30, qui n'est pas fusionnée : 20 tâches, 13,50 j — 9,1 %.**

La distinction n'est pas un détail de présentation : `L-1-01` est clos (PR #27 fusionnée), mais
`L-1-03` **ne l'est pas encore** — ses huit tâches ne passent `fusionnee` que sur
`lot/L-1-03-cloture`, et cet état n'atteindra `main` qu'à la fusion de #30. Tant que #30 est
ouverte, tout chiffre lu dans `docs/tasks.json` sur cette branche décrit un futur, pas un acquis.
La phase −1 sera à **20/26** une fois #30 fusionnée ; les quatre autres phases sont à 0 et
**gelées** : une garde refuse toute PR d'une phase ultérieure tant que la courante n'est pas close.

| Lot | PR | État | Ce qu'il a livré |
| --- | --- | --- | --- |
| `L-1-01` | #26, #27 | fusionnées | 7 tâches de gouvernance, `partners/ADR-0007`, LF partout |
| `L-1-03` | #28 | fusionnée `9597865` | 8 tâches, 7 gardes armées, 16 ruptures de traçabilité fermées |
| — | #29 | fusionnée `ab5caf5` | l'entrée de journal manquante de #28 ; `main` repassé VERT |
| — | **#30** | **OUVERTE, à finir** | la clôture de `L-1-03` — 4 lentilles à passer, voir le §1 |

`L-1-02` n'existe pas : le composeur a sauté le numéro après une composition abandonnée.

### Ce qui est vrai du dépôt aujourd'hui

- **37 étapes de Gate A** (25 avant `L-1-03`), toutes vertes, rejouées avec leur code de sortie réel.
- **217 tests, 19 fichiers** (92 et 8 avant le lot).
- **18 gardes armées sur 109** déclarées. C'est la mesure la plus honnête de l'avancement : une garde
  ne compte que si on l'a **vue rougir**, preuve archivée au registre `docs/gates.json`.
- **353 exigences**, 319 actives, 34 absorbées. **22** réputées testées sur `main`, **31** sur la
  branche de #30 — `pnpm gov:trace` le vérifie et il est **bloquant**. Aucun test n'a été ajouté
  entre les deux : c'est la **clôture** qui rend visibles les promesses `tests{}` de huit tâches
  jusque-là non livrées. Un chiffre de traçabilité se lit toujours en regard du statut des tâches,
  et sur une branche nommée — jamais seul.

## Ce que ces lots ont trouvé, et qu'il ne faut pas réapprendre

Des défauts **réels**, tous antérieurs, tous fermés. Ils disent comment ce dépôt se trompe.

### Trois trous dans la matrice d'autonomie, tous de la même famille

Une règle `deny` de `.claude/settings.json` est une **sous-chaîne** : elle ne refuse que la forme
exacte qu'elle décrit, et `git` comme `gh` en acceptent dix autres.

1. `Bash(git push * main*)` exige une espace avant `main` → `git push origin lot/x:main --force`
   traversait les six règles.
2. `Bash(gh api * /branches/main/protection*)` exige une espace devant `/branches`, que la commande
   réelle n'a **jamais** → la règle ne pouvait matcher qu'une commande **invalide**, pendant que
   `Bash(gh api*)` était en `allow`.
3. `Bash(gh issue edit*)` en `allow`, rien sur `--remove-label` → un agent retirait `owner:A01`,
   posait le sien, et l'état final ne portait qu'un revendiqueur. **Indétectable côté forge** : `W13`
   a tranché un dépôt à un seul compte, où deux agents sont la même identité.

**La réponse n'est jamais d'ajouter des sous-chaînes.** `scripts/gates/git-push-sur.js` et
`scripts/gates/gh-sur.js` **lisent** la commande — segments, jetons, méthode HTTP, destination réelle
du refspec — et sont appelés par le hook `PreToolUse`. Les motifs restent : ils **doublent** le hook.
Quatre variantes ont encore été trouvées au second tour : **un analyseur écrit trop vite laisse
passer autant qu'un motif**. Tout est témoin de `pnpm gov:autonomie --prove` : 23 refusées, 16
acceptées.

### Une gate insatisfiable est une gate qu'on apprend à sauter

`gov:pr` a présenté ce défaut **trois fois**, sous trois formes :

- elle exigeait des revues `APPROVED`, que GitHub refuse à l'auteur de sa propre PR (un seul compte,
  `W13`) — la PR #26 a été fusionnée avec **zéro revue** et la garde n'a jamais tourné verte ;
- elle exigeait la 8ᵉ case « fusionnée et atterrissage vérifié » **avant** la fusion ;
- un refus de lentille restait compté **pour toujours** : une PR refusée une fois ne pouvait plus
  jamais être fusionnée, quoi qu'on corrige.

Correctifs : `APPROVED` **ou** `COMMENTED` portant `Verdict: accepte|refuse` ; la 8ᵉ case sous
`--apres-fusion <n>` ; le **dernier** verdict par couple (poste, lentille) prime. Chacun a son
contre-témoin — sans quoi la règle n'est qu'un commentaire.

### Quatre instruments qui mentaient

- **`pnpm <cible> | tail -n` sous `set -e`** rend le code de `tail`. A imprimé `GATE A LOCAL: OK` sur
  trois gates rouges. Toute boucle de vérification lit `$?` de la commande elle-même.
- **`core.autocrlf`** rendait rouges en local, et verts en CI, tous les tests qui comparent un fichier
  dérivé au texte de son générateur. `.gitattributes` `eol=lf` — `eol`, pas `text=auto` seul.
- **Le parallélisme de vitest.** 19 fichiers qui lancent chacun des gardes en sous-processus saturent
  la machine : 11 échecs en parallèle libre, 0 fichier par fichier, 4 en séquentiel (tous réels).
  `poolOptions.forks.maxForks: 3` — 166 s au lieu de 397 s. **Sept « échecs » sur onze ne disaient
  rien du code.**
- **`pnpm test` vs `npx vitest run`.** Les `npm_config_*` fuient dans le `npx` fils, qui écrit sur
  **stderr après** la charge utile. Un test qui parsait le JSON du premier `{` à la fin de la sortie
  était vert sous l'un, rouge sous l'autre, même arbre.

### Un test qui exige le défaut l'épingle au lieu de l'attraper

`tracabilite.spec.ts` exigeait que `gov:trace` **sorte en erreur** et nomme REQ-GOV-031 — vrai le
jour de sa livraison, faux dès qu'on corrige. Réécrit contre `--prove`, qui juge un univers de
fixture.

### Une garde ne juge pas forcément ce que son propre lot écrit

`gov:trace` écartait les tâches non livrées. Les huit tâches du lot étaient `a_faire` : **les 33
entrées `tests{}` que le lot écrivait n'étaient confrontées au disque par aucune garde**, et une
promesse inventée est passée — dans la tâche qui livre la garde censée l'attraper. Le critère juste
n'est pas le statut, c'est l'**existence du fichier**.

### Un document sans garde a quand même autorité

`docs/GLOSSAIRE.md` §5 annonçait onze types et une enveloppe **camelCase** en citant
`packages/contracts/events.ts` comme sa source, avec `event_id` en synonyme interdit « vu rougir par
`gov:check` » — que **rien** ne vérifie. `docs/PRESEANCE.md` §2 donne au glossaire la primauté sur
les termes. Trouvé par la lentille `schema` **dans un fichier que la PR ne touchait pas**.

⚠️ **`glossaire-enums.spec.ts` (GOV-006) n'existe toujours pas.** Tant qu'il n'est pas livré, le
glossaire est une consigne, pas un contrôle.

### Une obligation post-fusion n'est gardée par personne avant la fusion

REQ-GOV-023 exige qu'une PR fusionnée soit **précédée** de son entrée de journal. La PR #28 a été
fusionnée sans la sienne : `gov:etat` ne voit `pr_fusionnee_sans_journal` que **lorsque la PR est
fusionnée**, donc sur `main`, donc trop tard pour refuser quoi que ce soit — sa seule victime
possible est la branche par défaut. La garde qui existe est un **détecteur d'incident, pas un
garde-fou**. Coût mesuré de l'oubli : une PR entière (#29), sa Gate A, et un `main` rouge dans
l'intervalle.

**Conséquence pratique : l'entrée de journal s'écrit sur la branche du lot, dans le même push que le
code.** Ne pas la remettre à la fin.

### Une Gate A locale verte ne dit rien du corps de la PR

`pnpm gov:pr` **sans** `--pr <n>` ne juge que la structure du gabarit, de CODEOWNERS et de la charte.
Les familles qui lisent la PR elle-même — `attaque_absente`, `fichier_reserve_sans_label`, les
lentilles — ne sont évaluées qu'avec `--pr`. Une Gate A locale 37/37 verte a donc laissé passer deux
défauts que la CI a rendus tout de suite. **Après avoir ouvert une PR, lancer `pnpm gov:pr --pr <n>`
en plus de la Gate A locale.**

Les deux défauts, tous deux réels : `docs/PLAN-STATE.md` est un fichier **réservé** et exige le label
`role:gardien-spec` ; et la section **Attaque** est obligatoire dès que la tâche porte un champ
`sensible` non vide — `GOV-008` porte `sensible: [auth]`, ce qu'on ne devine pas depuis le diff.

### Le motif du premier échec de clôture n'est écrit nulle part

`lot:cloture` calcule un motif pour toute tâche non livrée, **l'imprime** — par exemple
`fusion non atterrie : motif absent` — puis, à la **première** tentative, écrit `t.motif = null` et
remet `owner` et `branch` à `null` : une tâche qui repart doit repartir propre. Le motif n'est
persisté qu'à la **deuxième** tentative, quand la tâche bascule `bloquee`. C'est délibéré, mais la
conséquence l'est moins : **la raison du premier échec n'existe que dans la sortie console du run
qui l'a produite.** Une session qui ne l'a pas lue ne la retrouvera jamais — ni dans `tasks.json`,
ni dans PLAN-STATE. Si un jour une clôture fait retomber une tâche `a_faire`, coller la sortie dans
le corps de la PR avant de fermer le terminal.

Mesuré en jouant l'attaque de la PR #30 : avec `atterri: false` sur la seule `GOV-010`, les sept
autres tâches passent bien `fusionnee` et elle seule retombe `a_faire` avec `attempts: 1`.
L'invariant se juge **tâche par tâche**, pas en bloc : un rendu partiellement faux ne contamine pas
les lignes saines, et ne les protège pas non plus.

### Un fichier que git ne suit pas n'est lu par AUCUNE garde

`gov:identifiants` finit par « aucun identifiant nu **dans les fichiers suivis** », et c'est la
portée de presque toutes les gardes de ce dépôt : `gov:publication` le dit explicitement, et le
gabarit de PR prévient déjà que le corps d'une PR n'est lu par aucune d'elles. Cette note a vécu
plusieurs sessions dans `docs/lots/`, en `.gitignore` — donc hors de portée de tout. **Le commit qui
l'a fait entrer dans le dépôt a immédiatement rendu la CI rouge sur six défauts qui y dormaient
depuis le début**, aucun introduit ce jour-là.

Ce n'est pas un argument pour la laisser dehors : c'est la démonstration que « vert » ne veut rien
dire sur ce qu'aucune garde ne regarde. La conséquence pratique, quand on commite un document
jusque-là ignoré : s'attendre à un rouge, et le lire comme un inventaire de dette, pas comme une
régression.

### Cette note a déjà annoncé comme acquis un chiffre qui ne l'était pas

L'état du 2026-09-04 écrivait « 20 tâches sur 197, 13,50 j, 9,1 % » **avant** que
`pnpm lot:cloture` n'ait tourné : le dépôt était alors à 12 tâches, 9,50 j et 6,4 %. Le chiffre
annonçait la clôture au lieu de la constater ; il est devenu vrai quelques heures plus tard, ce qui
est exactement ce qui rend ce genre d'erreur indétectable après coup. **Une note de passation
n'écrit un chiffre qu'après l'avoir lu**, et le lit dans `docs/tasks.json`, pas dans son intention.

**Huit agents en parallèle sur le même arbre**, chacun sur ses propres fichiers, avec **interdiction
absolue de toucher un fichier partagé** (`package.json`, `ci.yml`, `docs/tasks.json`,
`docs/gates.json`, `vitest.config.ts`, `gardes.spec.ts`…). Ils rendent leurs diffs dans un bloc
`## RENDU` ; l'orchestrateur les applique **en une seule passe**. Vérifié : `git diff` sur les vingt
chemins réservés était vide à la fin de chaque rendu. Aucune collision sur huit agents simultanés.

**Les quatre lentilles valent leur coût, et pas seulement sur du code.** Sur `L-1-03` : trois refus
au premier tour, quatre défauts joués au second ; la lentille `schema` a trouvé son défaut le plus
grave **dans un fichier hors du diff**. Sur `L-1-03` la PR #29 — deux fichiers de documentation,
zéro ligne exécutable — a récolté **deux refus, tous deux fondés** : un chiffre faux dans le champ
que le README décrit comme « ce qu'un lecteur croira sur parole », et une phrase d'en-tête que
l'insertion de deux entrées rendait fausse. **Ne pas dispenser une PR documentaire des lentilles.**

**Ce qui ne marche pas** : demander une lentille « simplicité » sur une PR `schema` — l'architecte la
remplace, et `gov:pr` le vérifie. Et lancer les agents depuis une session dont la racine n'est pas le
dépôt : les fiches de rôle ne résolvent pas, l'autopilote meurt au premier agent.

⚠️ **Ne pas faire tourner un agent `verificateur-rouge` (qui mute l'arbre) pendant une Gate A
locale** : la mutation et la garde se croisent sur le même fichier, et le rouge obtenu ne dit rien.

## Reste Will — et rien d'autre ne bloque

**129 tâches sur 197 (94,75 j, 64 % de l'effort) sont libres de toute décision.** Il y a de quoi
travailler très longtemps sans rien demander.

Le mur est la **phase 2 (argent)**, dont 62 % de l'effort dépend de trois arbitrages :

| | |
| --- | --- |
| `CPL-T01` | **W1** entité contractante · **W2** banque · **W3** domaine · **W4** têtes de réseau · **W9** prolongation de fenêtre si un devis est en cours |
| `JUR-T01b` | le **contrat v1 arrêté** : les 8 clauses `avenant` (`pnpm gov:hypotheses --avant-docuseal` les nomme) + les 30 montants `{{COM_*}}` de l'annexe 1. Irréversible au **premier envoi DocuSeal** : après, les changer impose une re-signature à tout le réseau |
| `JUR-T01c` | le **mandat d'autofacturation** (expert-comptable, sinon défauts du registre) + l'**IBAN débiteur**, nécessaire en phase 2 seulement |

Effort libre par phase : **−1 : 100 % · 0 : 91 % · 1 : 81 % · 2 : 38 % · 3 : 21 %**.
La phase 0 ne pourra pas **se clôturer** sans le contrat (3,25 j juridiques) — c'est le premier point
de contact réel, et il est loin.

## Ce qui reste ouvert, nommément

- **Six étiquettes de chantier sur huit n'ont aucun référent** dans ce dépôt (« C2 », « C4 »,
  « C5 », « C6 », « C7 », « C8 » de `docs/INVENTAIRE-CHANTIERS.md`). REQ-GOV-026 affirme
  « C5 codé » sur une étiquette dont rien ici ne dit ce qu'elle désigne. Pour les remplir : la liste
  des huit chantiers avec, pour chacun, l'intitulé et le fichier d'axionia qu'il désigne. Les
  guillemets ne sont pas de la coquetterie : `gov:identifiants` traite un identifiant entre
  guillemets comme une **citation**, et hors guillemets comme une **référence** qui doit résoudre.
- **Trois nombres cohabitent** pour le contrat d'événements : REQ-QA-007 et REQ-GOV-020 disent
  5 événements, REQ-INT-004 en dit 7, l'ancienne acceptation 11. Le code suit REQ-INT-004 ; l'écart
  est consigné dans `partners/ADR-0008`. À aligner par le `gardien-spec`.
- **REQ-GOV-010 nomme un rôle « orchestrateur » qui n'aura pas de fiche** : `gov:pr` exige une ligne
  du §2 de la charte par fiche, donc une seizième fiche rendrait la garde rouge sur tout le dépôt. Le
  §4 attribue déjà ses deux droits à A01 + l'outillage. Ce qui manque est un nom dans le texte de
  l'exigence.
- **Sept revendications périmées** : `lot:cloture` écrit le backlog mais n'efface pas les labels
  d'issue. Nommées dans PLAN-STATE, volontairement pas gardées — une gate rouge en permanence sur une
  dette connue ne garde plus rien.
- **`deploy:verify` n'existe pas**, alors que l'acceptation de GOV-000 et `partners/ADR-0006` le
  nomment. Le Pas 7 de `docs/PROTOCOLE-FUSION.md` porte un repli daté : `git fetch && git log -1
  origin/main` doit rendre l'empreinte d'écrasement **et** le run `Gate A` du `push` sur `main` doit
  être vert. Ce repli a servi, et il a attrapé un vrai rouge.
- **Le titre de la PR #28 annonce « six gardes armees » ; ce sont sept** (11 → 18 dans
  `docs/gates.json`). Un titre fusionné ne se réécrit pas : l'écart est consigné dans l'entrée de
  journal de #28.
- **Le message du commit `a77508b` écrit « QUATRE fichiers » puis en énumère six.** C'est six. Non
  réparable sans réécrire un commit poussé.

## Le protocole d'un lot, de bout en bout

```bash
pnpm lot:composer -- --phase <n> --repo partners --max 8 --now <AAAA-MM-JJ>
for n in <issues>; do gh issue edit $n --add-label en_cours --add-label "owner:A01"; done
git checkout -b lot/L<phase>-<seq>-integration
# → lancer N agents dev-partners en parallèle, un par tâche, chacun avec :
#     · sa REQ et son acceptance
#     · l'interdiction NOMMÉE des fichiers partagés
#     · ROUGE avant VERT, message verbatim exigé dans le RENDU
#     · un mode --prove avec témoins ET contre-témoins
# → appliquer les diffs partagés EN UNE PASSE
# → écrire l'ENTRÉE DE JOURNAL de la PR, sur la branche, avec le reste
# → régénérer les vues : lot:paths · adr:index · gov:gates-derivees --render
#                        gov:trace --render · plan-state:build
bash <gate-a>            # les 37 étapes, avec leur CODE DE SORTIE, jamais un tube
git commit               # un commit par tâche + un commit d'intégration
gh pr create             # gabarit 8 cases, bloc ROUGE/VERT verbatim, section Attaque si sensible
pnpm gov:pr --pr <n>     # ⚠️ APRÈS l'ouverture : la Gate A locale ne juge PAS le corps de la PR
# → 4 lentilles : exactitude · securite · simplicite (ou schema si label) · mutation
#   le DERNIER verdict par couple (poste, lentille) prime : après correctif, redemander un verdict
pnpm gov:pr --pr <n>     # doit être VERT avant de fusionner
gh pr merge <n> --squash --delete-branch
# → Pas 7 : git fetch && git log -1 origin/main, ET le run Gate A du push sur main VERT
pnpm gov:pr --apres-fusion <n>
# → écrire docs/lots/<lot>/resultat.json (non suivi par git), puis :
pnpm lot:cloture -- --lot <id> --owner A01
```

⚠️ **Gate A locale** : lire `$?` de chaque commande. `pnpm <cible> | tail -6` rend le code de `tail`.
⚠️ **`docs/lots/` est en `.gitignore`** : `lot.json` et `resultat.json` ne sont pas suivis par git.
⚠️ **La clôture est une PR à elle seule** : `lot:cloture` écrit `docs/tasks.json`, et son invariant
exige `fusion.atterri === true` — donc l'atterrissage de la PR du lot doit être **vérifié avant**.
