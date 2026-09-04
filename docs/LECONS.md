# Leçons — Axion Partners

<!-- consolidation: 2026-09-03 -->

> Livré par **GOV-018** (REQ-GOV-023, moitié « leçons »). Tenu par le `documentaliste` (A03), qui
> ÉCRIT ce qui a été appris et par quoi c'est prouvé — il ne tranche pas.
>
> **La date ci-dessus est machine-lisible, et c'est délibéré.** `pnpm gov:lecons --now <AAAA-MM-JJ>`
> la relit en nightly : si elle a plus de **sept jours** ALORS QUE des entrées attendent dans la
> section « À consolider », c'est rouge. Sans entrée en attente, l'âge seul ne fait pas rougir — un
> rouge qui tombe sans dette est un rouge qu'on apprend à ignorer, et une garde qu'on ignore est
> désarmée (RM-02).
>
> **Ce qu'est une leçon ici.** Un incident MESURÉ, ce qu'on en tire, et l'endroit où on peut le
> rejouer : un SHA, un `chemin:ligne`, ou un message d'erreur verbatim. Une leçon sans son incident
> est un conseil, et un conseil ne se vérifie pas. `gov:lecons` refuse une leçon sans preuve.
>
> **Le lien avec les règles maison.** Chaque leçon dit la ou les `RM-nn` de `docs/REGLES-MAISON.md`
> qu'elle a produites — ou dit qu'elle n'en a produit aucune. Une leçon qui se répète devient une
> règle `RM-13+` **par ADR**, jamais par édition directe : c'est ce qu'écrit la section « Leçons »
> de `docs/REGLES-MAISON.md`.

## Leçons consolidées

### LEC-01 — Un livrable rendu « en entier » efface ce qu'il ne connaît pas

- **Ce qui s'est passé.** Un agent travaille sur l'état du dépôt qu'il a lu AU DÉMARRAGE. Au lot `L-1-01`, trois contre-lectures indépendantes ont trouvé le même `package.json` de livrable qui supprimait la ligne `reprise` sans l'annoncer ; le même livrable aurait effacé les huit étapes de `ci.yml` posées par les tâches intégrées avant lui, et réécrit 93 lignes d'un fichier de test partagé. Rien de tout cela n'était une hypothèse : ça a été rattrapé à la main, tâche par tâche.
- **Ce qu'on en tire.** Un fichier PARTAGÉ se relit comme un **diff**, jamais comme un contenu. Ce qu'un agent veut y ajouter, il l'écrit dans son RENDU en diff exact ; l'intégration applique. Corollaire mesuré : commiter d'abord ce qui traîne — non commitée, la ligne `reprise` disparaissait invisiblement ; commitée, la perte devient un conflit qu'on ne peut pas rater.
- **Où c'est prouvé.** `70b015d` (§ « LA RECOPIE QUI EFFACE »), `59959fe`, et l'outil qui en est né, `scripts/lot/integrer.ts:6`.
- **Règle maison.** Aucune à ce jour — outillée par `pnpm lot:integrer`, qui REFUSE la copie d'un fichier partagé. Candidate à une règle maison neuve, posée par ADR, si le cas se reproduit hors de `L-1-01`.

### LEC-02 — Une liste dite « dérivée » qui est en fait tapée : 14 chemins contre 91 réels

- **Ce qui s'est passé.** `lot:integrer`, l'outil écrit pour tenir RM-01, portait quatorze chemins « partagés » sous un commentaire affirmant que la liste se lisait dans `docs/paths-proposes.json`. Le script ne lisait pas ce fichier : il en recopiait un sous-ensemble figé au moment de l'écriture. La revue a compté 91 chemins partagés dans le backlog contre quatorze dans la liste — absents, entre autres, le gabarit de contrat (5 tâches), les migrations (5), le module de résiliation (5). Le jour où une tâche en livrait un, le script l'aurait COPIÉ au lieu de le refuser : le défaut même qu'il existe pour empêcher.
- **Ce qu'on en tire.** Un commentaire qui dit « ceci est dérivé » n'est pas une dérivation. La question à poser à toute liste est : quel appel de fonction la produit ? Et le contrôle qui la garde ne fige AUCUN total — épingler « 91 » ferait rougir la garde au premier chemin ajouté, pour une raison qui n'est pas un défaut.
- **Où c'est prouvé.** `ff3ef54`, commit « lot:integrer derive « partage » du backlog — 14 chemins tapes, 94 reels » ; l'état corrigé se lit dans `scripts/lot/integrer.ts:30`.
- **Règle maison.** RM-01.

### LEC-03 — `core.autocrlf` : deux gardes rouges sur le poste, vertes en CI

- **Ce qui s'est passé.** `core.autocrlf=true` est le réglage par défaut d'un poste Windows : il extrait en CRLF ce que l'index stocke en LF. Or plusieurs gardes d'ici comparent un fichier DÉRIVÉ au texte que son générateur produit, et un générateur produit du `\n`. Mesure avant correction : `adr-index-derive.spec.ts` et `fiches-tiers.spec.ts` ROUGES en local, VERTS sur la PR #26.
- **Ce qu'on en tire.** L'instrument mentait, et il mentait dans le sens qui rassure le moins souvent : la CI passait, le poste rougissait, et on apprenait à ignorer le poste. `eol=lf` — et pas seulement `text=auto` — est ce qui force l'ARBRE DE TRAVAIL, donc ce que les tests lisent ; `text=auto` seul n'aurait corrigé que l'index, là où le problème n'était pas.
- **Où c'est prouvé.** `.gitattributes:8` et `.gitattributes:13`, posés par `ff3ef54`, qui porte la mesure avant/après.
- **Règle maison.** Aucune à ce jour ; elle SERT RM-02 — une garde dont le rouge dépend du poste finit désarmée.

### LEC-04 — Une garde qui exige une approbation que la plateforme refuse à l'auteur est insatisfiable

- **Ce qui s'est passé.** `gov:pr --pr <n>` exigeait des revues à l'état `APPROVED`. Ce dépôt n'a qu'un seul compte, et la plateforme refuse une approbation venant de l'auteur de la PR. La gate était donc INSATISFIABLE — et la PR #26 a été fusionnée avec ZÉRO revue : la gate n'a jamais tourné verte, personne ne l'a vue rougir, et le geste s'est installé sans elle.
- **Ce qu'on en tire.** Une gate que personne ne peut satisfaire n'est pas une gate : c'est une étape qu'on apprend à sauter, et le jour où elle aurait servi elle est déjà hors du geste. Deux corrections structurelles en sont sorties : l'état de revue ne dit pas le verdict (un commentaire doit porter `Verdict: accepte` ou `Verdict: refuse`), et une case du gabarit qui atteste l'atterrissage ne peut pas être exigée AVANT la fusion — la famille est scindée entre ce qui se juge en CI et ce qui se juge sous `--pr`.
- **Où c'est prouvé.** `scripts/gates/gov-pr.ts:368`, commentaire « ZÉRO revue — la garde n'a jamais été verte, et on a appris à passer outre » ; correctif dans `ff3ef54`.
- **Règle maison.** RM-02.

### LEC-05 — Une garde qui juge un champ que la CI ne relit jamais après correction

- **Ce qui s'est passé.** `gov:pr` juge le titre et les étiquettes de la PR. Sans `types`, l'événement `pull_request` ne se déclenche que sur `opened` / `synchronize` / `reopened` : corriger un titre que la garde vient de refuser ne relançait rien, et rejouer le run rejoue l'événement d'ORIGINE — donc l'ancien titre. Constaté en réel sur la PR #26, deux fois.
- **Ce qu'on en tire.** Une garde qui juge un champ modifiable hors commit doit être déclenchée par la modification de ce champ, sinon elle n'est satisfaisable qu'en poussant un commit vide. Le contrôle et son déclencheur se conçoivent ensemble.
- **Où c'est prouvé.** `a30a60b`, « declenche gate-a sur l edition du titre et des labels de PR ».
- **Règle maison.** Aucune à ce jour.

### LEC-06 — La reprise d'une session ne franchit pas la frontière de session

- **Ce qui s'est passé.** Le cache de reprise d'un lot est lié à la session. Repris depuis une session neuve, les sept correcteurs sont repartis de zéro au lieu de deux — et le message de succès était le même dans les deux cas.
- **Ce qu'on en tire.** Compter les `started` du NOUVEAU journal au lieu de croire le mot « reprise ». Contournement exercé : extraire du journal du run coupé les résultats déjà rendus et les injecter dans une copie du script, après une exécution à blanc avec des bouchons.
- **Où c'est prouvé.** `docs/lots/REPRISE-NOTES.md:36` — ⚠️ fichier **non suivi par git** (`docs/lots/` est en `.gitignore`) : hors de la machine qui l'a écrit, cette leçon n'existait nulle part. C'est exactement le trou que ce journal-ci comble.
- **Règle maison.** Aucune à ce jour.

### LEC-07 — Un `--prove` qui COMPTE des fautes ne prouve aucune famille

- **Ce qui s'est passé.** Le mode `--prove` de `gov:publication` comptait des détections au lieu de vérifier chaque famille de règle. Un de ses témoins ne déclenchait rien — la valeur était collée à un souligné, donc sans frontière de mot — et deux détections d'une autre famille sur la même ligne suffisaient à faire passer la preuve. Trois familles sur quatre étaient réputées prouvées sans l'avoir jamais été.
- **Ce qu'on en tire.** Un témoin PAR famille, et des CONTRE-témoins qui doivent rester verts. Sur les gardes d'ici, les contre-témoins ont attrapé des faux positifs qu'aucun témoin ne pouvait voir : une garde qui refuse tout serait « prouvée » par tous ses témoins. Ajouter une famille sans témoin fait désormais échouer `--prove`.
- **Où c'est prouvé.** `scripts/gates/gov-publication.ts:21` (rubrique « INVARIANT DE LA PREUVE ») ; le diagnostic d'origine est dans `b7deff6`.
- **Règle maison.** RM-02.

### LEC-08 — Un outil de test remonte l'arborescence et attrape la configuration d'un autre chantier

- **Ce qui s'est passé.** Sans `vitest.config.ts` propre, l'outil remontait jusqu'au répertoire personnel, y trouvait la configuration d'un autre projet et échouait sur un fichier d'amorçage absent d'ici. Résultat : **aucun test de ce dépôt ne tournait**, et l'échec ressemblait à un problème de dépendances.
- **Ce qu'on en tire.** Tout dépôt neuf créé sous le répertoire personnel hérite du problème. Une suite qui ne tourne pas ne garde rien : la première chose à vérifier sur un dépôt neuf est le NOMBRE de fichiers de test collectés, pas la couleur du résultat.
- **Où c'est prouvé.** `vitest.config.ts:6` (« ⚠️ CE FICHIER DOIT EXISTER, même minimal ») ; constat d'origine dans `c4a029d`.
- **Règle maison.** Aucune à ce jour ; elle sert RM-02.

### LEC-09 — Un motif ne lit pas une syntaxe

- **Ce qui s'est passé.** La branche principale était protégée par six règles de refus écrites comme des SOUS-CHAÎNES. Chacune suppose une forme de commande — un espace juste avant le nom de la branche, un drapeau collé au verbe. La lentille sécurité a montré deux commandes qui atteignent la branche principale sans qu'aucune des six ne les voie : la destination y est écrite après un deux-points, et le drapeau de force est en fin de ligne.
- **Ce qu'on en tire.** On ne rattrape pas une syntaxe par des morceaux de texte : on la LIT. La défense est un analyseur qui découpe la commande en segments et juge sur les JETONS, appelé en `PreToolUse` — donc avant que la commande n'existe — et TESTABLE, ce qu'une liste de motifs dans un fichier de réglages n'est pas. Les six règles sont conservées : elles doublent. Une garde qui dépend d'un seul mécanisme tombe avec lui.
- **Où c'est prouvé.** `scripts/gates/git-push-sur.js:15` et la garde `gov:autonomie` née du même refus, dans `ff3ef54`.
- **Règle maison.** RM-09.

### LEC-10 — Un tube sous `set -e` rend le code de `tail` : trois gates rouges lues comme vertes

- **Ce qui s'est passé.** Le premier passage de Gate A en local a été lancé en `pnpm <cible> | tail -6` sous `set -e`. Le code de sortie d'un tube est celui de la DERNIÈRE commande — `tail`, donc zéro — et la boucle a imprimé `GATE A LOCAL: OK` sur **trois gates rouges**. Même famille mesurée ailleurs : un contrôle chaîné derrière un autre script puis passé en arrière-plan a rendu « exit 0 » sans une ligne de sortie utile, et le rouge a été trouvé plus tard par la CI. Second effet : la sortie utile d'un échec est au MILIEU du log, pas à la fin — le `tail` ne laisse que le résumé, c'est-à-dire rien d'exploitable.
- **Ce qu'on en tire.** Lire `$?` de CHAQUE commande, jamais celui d'une chaîne. Rediriger vers un FICHIER plutôt que piper avant de tester le succès. Et n'accepter un vert que si la sortie porte la BANNIÈRE de la commande et une durée plausible : une sortie vide n'est pas « aucune erreur », c'est « je n'ai pas vu la commande tourner ». C'est le pire des instruments — il ment dans le sens qui rassure.
- **Où c'est prouvé.** `docs/journal/2026-09.md`, entrée « PR #27 », bloc `**Appris.**` : « le code de sortie d'un tube est celui de `tail`, donc zéro, et la boucle a imprimé `GATE A LOCAL: OK` sur trois gates rouges ». Corroboré hors dépôt par le journal de session du dépôt voisin, fiche `cockpit-reprise-session-2026-07-09`.
- **Règle maison.** RM-02 — une garde n'est verte que si l'instrument qui l'a lue pouvait la voir rouge.

### LEC-11 — Un total écrit à la main redevient faux à la ligne suivante

- **Ce qui s'est passé.** Un document de gouvernance affirmait « les dix sources qui citent un fichier du dépôt voisin sans ligne » et les énumérait. Recompté sur les 353 exigences : 26 exigences, 29 mentions. Même famille ailleurs : le plan directeur a porté trois totaux différents pour le même backlog, un texte de reprise annonçait « les cinq gardes » puis « les six » alors qu'elles étaient sept.
- **Ce qu'on en tire.** Le compte à la main est remplacé par la RÈGLE, avec deux ou trois exemples introduits comme tels. Et quand un nombre est le défaut lui-même, on le SUPPRIME au lieu de le corriger : corrigé, il revieillit ; supprimé, il ne peut plus mentir.
- **Où c'est prouvé.** `dc9e611` (« J'ai compté moi-même sur les 353 exigences : 26 exigences, 29 mentions ») et `ce8fd06` (« c'est le nombre lui-même qui est le défaut, pas sa valeur »).
- **Règle maison.** RM-01.

### LEC-12 — Trois endroits citaient un script qui n'avait jamais été écrit

- **Ce qui s'est passé.** La compétence de lot revendiquait une tâche par un appel à `gh issue edit`, le composeur lisait le numéro d'issue, et le schéma du backlog documentait ce champ comme « écrit par `pnpm gov:issues --sync` ». Ce script n'existait pas : les 197 tâches portaient `issue: null`, et la première session d'autopilote s'arrêtait à la revendication, faute de numéro à citer. Même famille : `lot:composer` existait mais aucune entrée de `package.json` ne l'appelait, et l'acceptation d'une tâche affirmait qu'un fichier de CI appelait une commande d'agrégation — il liste chaque garde une par une et ne l'appelle jamais.
- **Ce qu'on en tire.** Une citation n'est pas une existence. Avant de bâtir sur une commande nommée dans un document, l'EXÉCUTER une fois. Une garde utile ici : toute commande citée dans un document du dépôt existe dans les scripts.
- **Où c'est prouvé.** `bdf1e5c` et `scripts/lot/issues.ts:8` ; l'écart sur la CI est constaté dans `3d818a6` et redit dans `docs/lots/REPRISE-NOTES.md:57`.
- **Règle maison.** Aucune à ce jour.

### LEC-13 — Une CI toujours rouge ne garde plus rien : la DETTE va en nightly, la RÉGRESSION en Gate A

- **Ce qui s'est passé.** Deux contrôles mesurent une dette et non une régression : le décompte des gates réellement armées, et l'exigence d'une date d'arbitrage sur chaque clause irréversible du contrat. Câblés en Gate A, ils auraient été rouges en permanence — la plupart des gates du socle n'ont ni script ni preuve, et huit clauses attendent une décision de Will, ce qui est l'état NORMAL du projet.
- **Ce qu'on en tire.** Un contrôle de dette rouge sur une PR bloque tout le monde pour un manque que la PR n'a pas créé ; on apprend alors à le contourner. Il va en nightly, où son rouge est un décompte lu le matin. Ce qui entre en Gate A, c'est la PREUVE de la garde — qui ne dépend d'aucun état du dépôt. Et on ne fait jamais taire un job par `continue-on-error` : un job qui ne bloque rien ne garde rien.
- **Où c'est prouvé.** `.github/workflows/nightly.yml:8` (« ⚠️ CE WORKFLOW EST ROUGE TANT QUE LA PHASE -1 N'EST PAS SORTIE, et c'est ce qu'on lui demande ») ; l'arbitrage jumeau sur le contrôle d'avant-envoi est dans `25a96de`.
- **Règle maison.** RM-02.

## À consolider

> **`gov:lecons` lit DEUX sources d'« appris », et les nomme à chaque exécution.**
>
> 1. **Le journal de session** — `docs/journal/*.md`, livré par **GOV-008** (même lot). Chaque
>    entrée `## PR #<n>` porte un bloc `**Appris.**`. Un « appris » est **consolidé** quand ce
>    fichier-ci cite le numéro de sa PR ; aucune bijection n'est exigée — plusieurs « appris » se
>    fondent souvent en une seule leçon, et exiger un pour un ferait rougir un travail de synthèse
>    bien fait.
> 2. **La boîte aux lettres ci-dessous** — pour ce qui ne tient pas dans une entrée de PR : un
>    piège d'outillage, un défaut de poste. Une entrée cite **sa tâche, sa PR ou son lot** ; sans
>    origine, personne ne sait à qui en demander le détail, et elle finit consolidée de mémoire.
>
> Au-delà de **sept jours** sans consolidation avec des entrées en attente dans l'une ou l'autre
> source, la garde rougit. Sans entrée en attente, l'âge seul ne fait rien.
>
> ⚠️ **Ce que REQ-GOV-023 dit, et qui ne pouvait pas être suivi à la lettre.** L'exigence situe les
> « appris » dans `docs/PLAN-STATE.md`. C'est impossible : ce fichier est **dérivé**
> (`scripts/plan-state/build.ts` en est le seul écrivain, et il ne rend aucun journal), donc
> personne ne peut y écrire un « appris » à la main. Le champ existait pourtant côté outillage
> depuis le premier jour — `scripts/lot/lot.workflow.js:43` le déclare et sa ligne 50 l'EXIGE de
> chaque rendu de développeur — mais **rien ne le persistait** : `scripts/lot/cloture.ts:34` ne
> retient du rendu que la tâche, la branche, la PR, l'arrêt et la fusion. Les leçons du lot
> `L-1-01` n'ont survécu que parce qu'un humain les a recopiées dans un fichier que git ne suit
> même pas. Le journal par PR de GOV-008 est ce que l'exigence VOULAIT dire ; c'est lui qui fait
> foi, et `docs/PLAN-STATE.md` reste une vue.

<!-- a-consolider:debut -->

_(rien à consolider — les treize leçons ci-dessus l'ont été le 2026-09-03.)_

<!-- a-consolider:fin -->
