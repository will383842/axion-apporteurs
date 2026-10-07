# Leçons — Axion Partners

<!-- consolidation: 2026-10-07 -->

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
> règle `RM-15+` **par ADR**, jamais par édition directe : c'est ce qu'écrit la section « Leçons »
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

### LEC-14 — Une garde ne juge pas forcément ce que son propre lot écrit

- **Ce qui s'est passé.** `gov:trace` ne confrontait au disque que les promesses `tests{}` des tâches LIVRÉES. Les huit tâches du lot `L-1-03` étaient encore `a_faire` au moment où elles écrivaient les leurs : les trente-trois entrées `tests{}` que le lot posait n'étaient relues par aucune garde, et une promesse de test inventée est passée dans la tâche même qui livrait la garde censée l'attraper.
- **Ce qu'on en tire.** Le critère juste n'est pas le STATUT de la tâche mais l'EXISTENCE du fichier. Et il a fallu élargir deux choses, pas une : le contrôle, puis la résolution des titres de test — un contrôle élargi dont la source ne l'est pas ne contrôle rien. Une garde livrée dans un lot doit être passée sur ce lot-là avant d'être réputée armée.
- **Où c'est prouvé.** `9597865` ; `docs/journal/2026-09.md`, entrée « PR #28 », bloc `**Appris.**` : « une promesse inventée est passée dans la tâche même qui livre la garde censée l'attraper ».
- **Règle maison.** Aucune à ce jour ; elle sert RM-02 — une garde qui ne regarde pas ce que son lot écrit n'a jamais pu rougir dessus.

### LEC-15 — Une obligation qui s'évalue APRÈS la fusion est un détecteur d'incident, pas un garde-fou

- **Ce qui s'est passé.** `gov:etat` ne voit la famille `pr_fusionnee_sans_journal` que lorsque la PR est fusionnée — donc sur `main`, donc trop tard pour refuser quoi que ce soit. La PR #28 est passée sans son entrée de journal ; le run `Gate A` du `push` sur `main` est resté rouge jusqu'à ce que la PR #29 l'écrive. Coût mesuré de l'oubli : une PR entière, sa Gate A complète, et un `main` rouge dans l'intervalle.
- **Ce qu'on en tire.** Le protocole demande l'entrée sur la branche de la PR, mais rien ne le vérifie au moment où c'est encore réparable sans un second aller-retour. Une règle et le MOMENT où elle s'évalue se conçoivent ensemble : décalée d'un cran après la fusion, la même règle change de nature — elle nomme l'incident au lieu de l'empêcher, et sa seule victime possible devient la branche par défaut.
- **Où c'est prouvé.** `ab5caf5` ; `docs/journal/2026-09.md`, entrée « PR #29 » : « sa seule victime possible est la branche par défaut ».
- **Règle maison.** RM-15 ; même famille que LEC-05 — le contrôle et son déclencheur se conçoivent ensemble.

### LEC-16 — Le motif du PREMIER échec de clôture n'est écrit nulle part

- **Ce qui s'est passé.** `scripts/lot/cloture.ts:106` calcule le motif d'un refus de clôture — « fusion non atterrie : motif absent » — puis, à la première tentative, `scripts/lot/cloture.ts:118` remet `t.motif` à `null`, parce qu'une tâche qui repart doit repartir propre. Le motif n'est persisté qu'à la DEUXIÈME tentative, quand la tâche bascule `bloquee` (`scripts/lot/cloture.ts:112`). Entre les deux, il n'existe que dans la sortie console du run.
- **Ce qu'on en tire.** Une session qui n'a pas lu cette sortie-là ne retrouvera jamais la raison du premier refus : le registre dira `a_faire`, `attempts: 1`, `motif: null`. Le même run a montré l'autre moitié, rassurante : l'invariant se juge TÂCHE PAR TÂCHE — avec `atterri: false` sur la seule `GOV-010`, les sept autres passent `fusionnee` et elle seule retombe `a_faire`. Un rendu partiellement faux ne contamine pas les lignes saines, et ne les protège pas non plus.
- **Où c'est prouvé.** `794245c` ; `scripts/lot/cloture.ts:118` ; `docs/journal/2026-09.md`, entrée « PR #30 ».
- **Règle maison.** Aucune à ce jour.

### LEC-17 — Une preuve organisée par FAMILLE ne dit rien des POSITIONS

- **Ce qui s'est passé.** `gov:identifiants` avait ses trois familles prouvées et ses dix contre-témoins verts. Sa lookahead négative incluait le point : une étiquette de relecteur collée à un point final n'était pas vue, la même suivie d'une espace l'était. Ses propres témoins évitaient tous cette position. Le fait décisif : la lookahead remise dans son état cassé, la preuve affichait TOUJOURS « 3 témoins rougissent, 10 contre-témoins restent verts — preuve faite » et la garde rendait 0 sur le dépôt. La cécité était totale et silencieuse.
- **Ce qu'on en tire.** Deux axes, pas un. La FAMILLE dit ce qui est refusé ; la POSITION dit où la garde regarde. Une preuve organisée par familles seules peut rester verte sur le texte qu'elle condamne. Le correctif est mesuré et non deviné — trois variantes de la lookahead confrontées aux fichiers suivis, une seule change le verdict — et dix positions limites sont désormais déclarées, chacune avec son témoin, la fin de phrase et la fin de ligne comprises.
- **Où c'est prouvé.** `fee4617` ; `scripts/gates/gov-identifiants.ts:176` (« la famille dit CE QUI est refusé, la position dit OÙ la garde regarde ») ; `tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts`.
- **Règle maison.** RM-02.

### LEC-18 — Un drapeau « ce témoin exerce le défaut » se vérifie DANS LES DEUX SENS

- **Ce qui s'est passé.** Chaque témoin de position porte un drapeau `manqueParLAncienne`. La preuve ne le croit pas : elle rejoue le témoin contre la lookahead d'avant et refuse DEUX fois. Un témoin annoncé aveugle que l'ancienne voyait déjà n'exerce pas le défaut — c'est précisément le témoin qui verdit sur le texte qu'il condamne (`scripts/gates/gov-identifiants.ts:346`). Un témoin annoncé vu que l'ancienne manquait signale une cécité PLUS LARGE que documentée (`scripts/gates/gov-identifiants.ts:354`).
- **Ce qu'on en tire.** Vérifié d'un seul côté, un tel drapeau décrit l'INTENTION de l'auteur, pas le code. Sur les dix témoins, cinq sont annoncés aveugles et le sont, cinq sont annoncés vus et le sont : c'est le double refus qui rend le compte crédible, pas le commentaire qui l'accompagne.
- **Où c'est prouvé.** `scripts/gates/gov-identifiants.ts:198` — le contrat du drapeau ; la sortie du 2026-09-05 : « 10 témoins de position rougissent, dont 5 que l'ancienne lookahead MANQUAIT ».
- **Règle maison.** RM-02.

### LEC-19 — La version CASSÉE gardée DANS le module rend le rejeu permanent

- **Ce qui s'est passé.** Rejouer une garde contre son état d'avant est d'ordinaire un geste de session : on remet la ligne, on regarde, on l'enlève — et la démonstration meurt avec la session. Deux tâches du même lot ont fait l'inverse. `gov:identifiants` conserve l'ancienne lookahead sous `MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE`, que rien n'appelle pour juger (`scripts/gates/gov-identifiants.ts:68`). `scripts/lot/registre-decisions.ts:195` conserve `lireRegistreHerite`, le lecteur que le composeur portait avant, mot pour mot : rien ne le consulte pour juger, il sert aux témoins des tests et au décompte que le composeur IMPRIME.
- **Ce qu'on en tire.** Le prix est une constante morte et un peu de bruit à la lecture. Le gain est double : aucune régression ne peut réintroduire le défaut sans faire rougir, et l'effet du remède se MESURE au lieu de se supposer — dix-huit tâches que la lecture d'avant écartait pour une raison de décision redeviennent éligibles, une le reste. Deux occurrences le même jour, dans deux tâches qui ne se parlaient pas : c'est un patron, pas une trouvaille.
- **Où c'est prouvé.** `fee4617` et `88fa798` ; `scripts/lot/registre-decisions.ts:178` (« CECI N'EST PAS UN SECOND LECTEUR. C'est la FIXTURE du défaut »).
- **Règle maison.** RM-02.

### LEC-20 — Le compteur d'une preuve est un contrat lu ailleurs

- **Ce qui s'est passé.** La ligne « 3 témoins rougissent, 10 contre-témoins restent verts » n'est pas un message décoratif : `tests/unit/gouvernance/gardes.spec.ts:108` l'asserte mot pour mot, `docs/gates.json:48` la recopie comme preuve rouge, et `docs/GATES.md:43` la porte dans sa vue dérivée. Enrichir la preuve en GONFLANT ces compteurs aurait rougi trois fichiers d'un coup, dont un registre et une vue réservés à d'autres postes.
- **Ce qu'on en tire.** Une preuve s'enrichit par AJOUT — une SECONDE ligne, « 10 témoins de position … 24 contre-témoins de position » — jamais en modifiant la première. Avant de toucher au compteur d'une garde, chercher qui le lit ; la réponse est rarement « personne ». Corollaire pour qui écrit une garde neuve : un compteur placé dans un message de succès devient un contrat dès qu'un test l'asserte.
- **Où c'est prouvé.** `tests/unit/gouvernance/gardes.spec.ts:108` ; `docs/gates.json:48` ; `docs/GATES.md:43`.
- **Règle maison.** RM-01 — trois copies d'une même valeur ; on n'en corrige aucune, on ajoute à côté.

### LEC-21 — Un test peut ne pas vérifier ce que son en-tête annonce

- **Ce qui s'est passé.** L'en-tête de `tests/unit/gouvernance/regles-maison.spec.ts` annonçait « chaque RM a une section ». Le test comparait deux listes de TITRES : celle des `## RM-nn — …` et celle des lignes du tableau de tête. Une section réduite à son seul titre, ou privée de son « Pourquoi », restait VERTE. Le défaut n'a pas été trouvé par une gate : il a été trouvé en relisant l'en-tête à côté du code.
- **Ce qu'on en tire.** L'en-tête d'un test n'est pas une assertion, et la distance entre les deux ne rougit jamais. Ce qui manquait ici est exactement ce qui empêche qu'on retire une règle par commodité six mois plus tard : son POURQUOI. Les trois rubriques — énoncé, pourquoi, garde qui la voit — sont désormais exigées section par section, une rubrique vide comptant pour absente, et la règle a été rejouée contre la version cassée avant d'être posée.
- **Où c'est prouvé.** `d84d073` ; `tests/unit/gouvernance/regles-maison.spec.ts:138` : « Elle comparait la liste des titres … Une section réduite à son seul titre … passait au vert ».
- **Règle maison.** RM-02.

### LEC-22 — C'est le CODE qui a corrigé le DOCUMENT

- **Ce qui s'est passé.** `docs/adr/0009-valeurs-du-monde-reel.md` déclare quatre points de sortie — les endroits où une valeur quitte le dépôt — et affirmait que la garde les refusait tous les quatre. `gov:entite` dérive le régime de chaque champ de sa LIGNE DE DÉCISION : `W1`, `W3` et `W4` étant tranchées le 2026-09-03, deux points acceptent déjà (`contrat-docuseal`, `export-das2`) et deux seulement refusent (`mandat-autofacturation`, `sepa-pain001`), l'un et l'autre sur les coordonnées bancaires débitrices. La première version du test affirmait les quatre sur la foi de l'ADR, et elle est tombée.
- **Ce qu'on en tire.** Une liste écrite à la main fige l'état d'un jour ; dérivée du registre, elle changera d'elle-même quand une décision changera. Conséquence lue par un humain : ce qui reste à trancher n'est pas « quatre valeurs » mais UNE. Et l'ordre de correction est celui-ci — quand un document et le code se contredisent, c'est le document qu'on corrige, en gardant trace de ce qu'il disait ; l'ADR porte désormais la correction et la raison de sa chute.
- **Où c'est prouvé.** `4b152e6` ; `docs/adr/0009-valeurs-du-monde-reel.md:135` ; `tests/unit/gouvernance/entite-registre.spec.ts:261`. Revérifié le 2026-09-05 : `pnpm gov:entite` rend 0 et compte « 12 arrêté(s) et attesté(s) par leur ligne de décision, 5 à la sentinelle ».
- **Règle maison.** RM-01.

### LEC-23 — Une vue générée sans vérificateur dérive en silence

- **Ce qui s'est passé.** Deux vues, deux trous distincts. `docs/REQUIREMENTS.md` n'avait AUCUN générateur alors que son bandeau affirmait que `pnpm gov:requirements` en tenait la cohérence : elle annonçait 353 exigences quand le registre en portait 354. `docs/TASKS.md` avait un générateur mais aucun vérificateur : dans la PR #30, `lot:cloture` a fait passer vingt tâches à `fusionnee` dans `docs/tasks.json` sans que la vue soit régénérée — elle est restée à cinq. Quinze d'écart sur le fichier qu'on ouvre justement pour savoir où en est le chantier.
- **Ce qu'on en tire.** Un générateur n'est pas un vérificateur. Sans un mode qui COMPARE et sort 1 sans rien écrire, une vue dérive et rien ne rougit — une garde qui répare ce qu'elle contrôle est toujours verte, donc ne garde rien. Deux précisions payées comptant : le message NOMME l'écart en unités du domaine (« la vue annonce 353 exigence(s), le registre en porte 354 ») plutôt que « les deux fichiers diffèrent », et les fins de ligne sont normalisées avant comparaison, sans quoi la garde mesurerait `core.autocrlf` (LEC-03). Enfin, aucune gate n'a vu l'écart : des relecteurs l'ont vu à la lecture, trois fois indépendamment, dans la PR même qui le créait — et il y a été corrigé.
- **Où c'est prouvé.** `88fa798` ; l'état d'avant se relit dans `794245c`, dont le diff de `docs/TASKS.md` porte la seule ligne « Terminees » passant de 5 à 20.
- **Règle maison.** RM-01.

### LEC-24 — Un fichier neuf hors de l'index est invisible pour les gardes

- **Ce qui s'est passé.** Cinq gardes au moins balaient `git ls-files`, pas le disque (`scripts/gates/gov-identifiants.ts:154`, `scripts/gates/gov-publication.ts:149`, `scripts/gates/gov-entite.ts:386`, `scripts/gates/gov-preseance.ts:272`, `scripts/gates/lexique-apporteurs.ts:346`). Mesuré sur cet arbre le 2026-09-05 : un document neuf portant une étiquette de relecteur non qualifiée, laissé hors index, `pnpm gov:identifiants` ne le voit pas ; le MÊME fichier rendu visible par `git add -N`, la MÊME commande le relève et nomme sa ligne. Rien n'avait changé que sa visibilité à l'index. Le corollaire s'est vu à la PR #30 dans l'autre sens : faire entrer `docs/REPRISE-SESSION.md` dans le dépôt a rendu la CI rouge sur six étiquettes qui y dormaient depuis des sessions, aucune introduite ce jour-là.
- **Ce qu'on en tire.** Un « vert » obtenu sur un fichier hors index n'est pas un verdict, et rien ne le distingue d'un vert légitime — l'absence ne s'imprime pas. L'intégration du lot rapporte deux rencontres du même piège le MÊME JOUR par deux agents qui ne se parlaient pas (`GOV-026` et `CPL-T01`) : c'est ce qui a fait passer ce constat de leçon à règle. Elle est enregistrée sous RM-14 ; la régularisation par ADR que demande la section « Leçons » de `docs/REGLES-MAISON.md` reste à faire.
- **Où c'est prouvé.** `docs/journal/2026-09.md`, entrée « PR #30 » : « un fichier que git ne suit pas n'est lu par aucune garde » ; `scripts/gates/gov-identifiants.ts:154` ; mesure du 2026-09-05 rejouée dans `docs/REGLES-MAISON.md`, section RM-14.
- **Règle maison.** RM-14.

### LEC-25 — Stryker ne mute que ce qu'il exécute : la constante de module, le dossier hors configuration et la base réelle lui échappent

- **Ce qui s'est passé.** Trois causes distinctes de « sans couverture » ou de survivants, chacune rencontrée plusieurs fois. Une constante fléchée de module est évaluée au chargement, avant l'activation des mutants : `() => undefined` y survit alors que chaque test qui l'appelle rougirait, et la même logique écrite en déclaration de fonction est tuée. Un témoin rangé dans un dossier que `vitest.mutation.config.ts` n'inclut pas laisse le code « sans couverture » — non pas survivant, absent du score. Enfin, Stryker ne lance ni Docker ni la base : un module prouvé seulement en intégration sort entier en mutants non couverts (28 % mesurés sur une projection jugée seulement sur le banc Docker, 86 % une fois jugée en processus sur un faux client fidèle aux requêtes qu'elle émet). S'y ajoute que Stryker mute le fichier ENTIER qu'une PR touche : une ligne ajoutée à un fichier partagé fait payer à la PR la dette de témoins de tout le fichier, et l'intégration de `main` peut faire bouger ce score sans que la PR ait changé son propre code.
- **Ce qu'on en tire.** La mutation d'une PR se prépare dès les `paths` : pour chaque module de `src/server/` créé, un témoin en processus, dans un dossier que la configuration de mutation joue, sur un client simulé qui enregistre requêtes et valeurs. Ce qui est évalué au chargement (motif, `Set`, chaîne de domaine) se déplace dans la fonction qui le lit. Un témoin qui lit le TEXTE d'une source s'écarte de la seule suite de mutation, jamais en écartant un fichier entier : le bac à sable instrumente les sources et ajoute `// @ts-nocheck` en tête de chaque `.ts`, si bien qu'une empreinte ou un compte d'occurrences y change.
- **Où c'est prouvé.** `9d6fbad0` (mutant statique d'une constante fléchée) ; `aa9bd4ac` (28 % puis 86 % sur la projection) ; `22b346c6` (« Stryker ne joue que les tests unitaires ») ; `9df72375` (« Un fichier touché est muté en entier »).
- **Règle maison.** Aucune à ce jour ; elle sert RM-02 — un mutant qu'aucun test n'exerce est un rouge qu'on ne peut pas voir.
- **Consolide.** #130, #140, #148, #165, #180, #338, #339, #351, #369, #482, #524, #568, #572, #610, #622, #636, #640, #648, #687, #693, #695, #718, #722, #738, #739.

### LEC-26 — Une liste de formes interdites se contourne par la forme suivante : on inverse la liste

- **Ce qui s'est passé.** Une garde d'exports a fermé les formes UNE PAR UNE : huit tours de relecture ont chacun trouvé la suivante (CommonJS, `var` de bloc, nom calculé d'un membre, fichier `icon` ou `sitemap` que Next sert par son NOM). Même histoire sur les règles semgrep, où chaque lecture textuelle d'une liaison a eu sa faille, sur la garde lexicale du rendu JSX, sur le découpage d'une commande shell par expression régulière (trois tours, trois formes passées : `set +e`, `eval`, un `&&` non final), et sur un filtre de journal qui ne jugeait que les clés propres alors que le sérialiseur parcourt aussi les clés héritées.
- **Ce qu'on en tire.** Ce qui arrête la course n'est pas une forme de plus dans la liste des refus, mais l'inversion de la liste : n'admettre que les formes dont la garde sait juger le corps, et refuser toutes les autres, y compris celles que le langage ajoutera. Quand c'est possible, évaluer la VALEUR rendue plutôt que reconnaître une écriture ; quand la forme n'est pas dans l'arbre syntaxique, refuser le texte entier plutôt que lire la liaison. Corollaire : une garde qui refuse une forme se respecte en écrivant la forme qu'elle connaît, jamais en cherchant la variante qu'elle ne voit pas.
- **Où c'est prouvé.** `4dd40e48` (« huit tours de relecture ont chacun trouvé la suivante ») ; `dc6cfcb9` (« évaluer la valeur rendue ferme toute la famille d'un coup ») ; `9ed1f980` (le shell) ; `f71cda5e` (« Un filtre se reconstruit, il ne se lit pas »).
- **Règle maison.** Aucune à ce jour ; même famille que LEC-09 — on ne rattrape pas une syntaxe par des morceaux de texte.
- **Consolide.** #76, #82, #165, #175, #267, #345, #497, #646.

### LEC-27 — Une garde vue rougir sur le MAUVAIS cas n'a pas été vue rougir

- **Ce qui s'est passé.** Deux témoins exigeaient un rouge sur un numéro public d'un TIERS : la garde avait bien été « vue rougir », mais sur le cas fautif, et elle a traversé une livraison, une revue et une fusion en tenant vert le défaut. Ailleurs, la fixture « conforme » d'une preuve portait elle-même le défaut que la garde fermait ; un témoin rougissait par une exception plutôt que par l'échec fermé qu'on lui prêtait ; un témoin à taux unitaire ne distinguait pas un produit d'un quotient ; un oracle qui appelait la fonction jugée la prouvait par elle-même ; un témoin d'échec fermé rougissait sur la mauvaise issue parce qu'il confondait toute exception avec un refus ; un témoin qui choisissait « la première tâche à faire » dépendait de l'état du registre.
- **Ce qu'on en tire.** Ce qu'une garde protège se mesure en la cassant, jamais en lisant son intention : chaque témoin nomme l'issue EXACTE qu'il attend, porte des données qui ont la FORME du vrai registre (clé absente et clé à `null` ne jugent pas la même moitié d'une règle), et départage les règles voisines par une valeur calculée ailleurs. Quand un correctif oblige à inverser un témoin existant, c'est le témoin, pas seulement le code, qui portait la faute. Un témoin qui ne tourne nulle part est pire qu'un témoin absent. Et une source qu'on s'apprête à vider se rend injectable AVANT, sinon on emporte avec elle le seul moyen de prouver que la garde sait encore rougir.
- **Où c'est prouvé.** `8184c884` (« Une garde vue rougir ne dit rien si on l'a vue rougir sur le mauvais cas ») ; `7f830072` (fixture conforme par accident) ; `0687957a` (taux égal à un) ; `8e9274a8` (oracle qui appelle la fonction jugée) ; `b95216b7` (échec fermé sur la mauvaise issue).
- **Règle maison.** RM-02.
- **Consolide.** #31, #46, #48, #53, #54, #64, #83, #100, #107, #108, #116, #141, #158, #182, #218, #228, #231, #250, #415, #420, #525, #665, #681, #712.

### LEC-28 — Un test ajouté à du code déjà juste naît vert : son rouge s'obtient par mutation, et se décrit

- **Ce qui s'est passé.** Quatre tâches d'un même lot ont été construites code d'abord, leur rouge obtenu par mutation du correctif ; rien dans l'outillage ne distingue ce rouge d'un rouge obtenu avant le code, et les deux s'écrivent pareil dans un corps de PR. Le cas revient sous deux formes légitimes : un test ajouté à un fichier existant n'est pas jugé rouge-avant-vert par la garde, et un espion posé sur du code déjà correct naît vert.
- **Ce qu'on en tire.** Le bloc ROUGE/VERT dit COMMENT le rouge a été obtenu. Quand il vient d'une mutation à la main, elle est décrite pour être rejouée. Quand un témoin change de face sur arbitrage, ou qu'un filtre borné change la face de témoins existants, la PR le nomme : sans quoi la relecture lit un affaiblissement là où il y a une décision.
- **Où c'est prouvé.** `32ea43d0` (« rien dans l'outillage ne distingue un rouge obtenu par mutation d'un rouge obtenu avant le code ») ; `b92385a6` ; `7e34b578`.
- **Règle maison.** RM-02.
- **Consolide.** #114, #217, #381, #391, #453, #513.

### LEC-29 — La traçabilité lit le titre du `it()`, et la clôture est le moment où elle juge

- **Ce qui s'est passé.** Une exigence citée en `// @req` en tête de fichier, ou dans un `describe`, n'est pas citée pour la matrice : `gov:trace` lit le titre du cas exécuté. Le constat est revenu plus d'une dizaine de fois, presque toujours au moment de clore une tâche livrée : une maquette fusionnée sans test qui cite son exigence laisse la tâche impossible à clore, une tâche dont le périmètre a changé garde ses promesses de test d'avant, et une tâche versée sans `tests{}` fait échouer `lot:paths`, qui dérive ses chemins des tests nommés et non du champ `paths`. `vitest list --json` omet d'ailleurs `it.skip` et `it.todo` : une promesse vers un test sauté se lisait « titre absent », jamais « non vert ».
- **Ce qu'on en tire.** La traçabilité se pose avec la livraison, pas après : chaque exigence a un titre de cas qui la nomme, dans la PR même. Une exigence se rend à la tâche qui la teste ; la faire citer par un titre de test pour verdir la matrice serait lui mentir. Et une clôture se vérifie avec `gov:trace`, pas seulement avec `gov:tasks`.
- **Où c'est prouvé.** `2e38febd` (« Une annotation `@req` en tête de fichier ne suffit pas ») ; `23b3ca27` et `9253f1a8` (maquettes impossibles à clore) ; `57391479` (`vitest list --json` omet les tests sautés) ; `d13c4262` (`lot:paths` dérive des tests nommés).
- **Règle maison.** Aucune à ce jour.
- **Consolide.** #47, #61, #81, #122, #145, #244, #282, #309, #358, #359, #378, #437, #473, #492, #493, #510, #528, #529, #577, #589, #607.

### LEC-30 — Un registre en retard ne coûte pas un compteur faux : il fait refaire du travail livré

- **Ce qui s'est passé.** Le composeur a proposé cinq tâches déjà livrées pour le lot suivant parce que leur clôture n'avait pas atterri ; une commande de clôture exigeait un fichier de `docs/lots/`, donc absent de la machine qui reprenait, et ne se lançait simplement pas — sans rien dire. Les gestes du registre ont montré leurs bords un à un : un verbe vérifiait la fusion sans confronter la tâche au titre de la PR (une tâche a été attestée par la PR d'une autre, exit 0), un autre ignorait les dépendances, aucun ne savait écrire certains champs, et un registre devenait infermable faute d'UN verbe. Deux rattrapages ouverts en même temps citent la même tâche et se refusent ; une clôture écrite sur une base qui ne porte pas la revendication se perd à la fusion.
- **Ce qu'on en tire.** Une clôture se juge avec ses dépendances, sur la base à jour, et au premier atterrissage vérifié — pas à la fusion du code, ni sur le titre de la PR. Une PR fusionnée n'est pas une tâche livrée quand son acceptance dépend d'un tiers absent. Un rattrapage petit, ouvert sitôt le précédent fusionné et préparé par un script rejouable, tient la chaîne critique ; un rattrapage de plus s'ajoute à la PR ouverte au lieu d'en ouvrir une seconde. Et quand aucun outil ne sait écrire un arbitrage, l'exception devient elle-même une règle écrite et testée : le registre ne s'édite pas à la main.
- **Où c'est prouvé.** `20a4c9f8` (« Le composeur proposait cinq de ces douze tâches pour le lot suivant ») ; `f59bc400` (« Une commande qu'on ne peut pas lancer ne rougit pas ») ; `02a7949d` (attestation par la PR d'une autre tâche, exit 0) ; `ab3c66aa` (`deux_pr_meme_tache`).
- **Règle maison.** RM-13 — c'est le symptôme même qu'elle garde ; ces cas en sont les variantes que la règle ne nomme pas encore.
- **Consolide.** #32, #46, #54, #129, #131, #139, #141, #166, #176, #181, #185, #187, #199, #207, #230, #239, #246, #253, #255, #261, #262, #279, #291, #294, #300, #307, #311, #317, #318, #319, #320, #323, #326, #327, #330, #411, #455, #485, #503, #555, #580, #611, #666, #673, #676, #696, #699, #700, #701.

### LEC-31 — Une résolution de conflit est un choix, et une branche empilée se reconstruit, elle ne se fusionne pas

- **Ce qui s'est passé.** Résoudre un conflit de journal du côté de `main` a rendu au fichier les corrections que la branche y avait faites, en silence. Une branche construite sur une autre branche de PR, fusionnée ensuite par écrasement, n'a plus su réconcilier cinq fichiers ; le même cas est revenu sur deux autres tâches. Une branche reprise recopiait du code arrivé sur `main` après sa naissance. L'état « en conflit » affiché par la forge était faux pour trois branches sur six, parce que la forge n'applique pas le pilote de fusion local des vues dérivées. Et le merge ne protège que ce que les DEUX branches ont touché : un devis de réconciliation mesuré à 8 conflits en valait 22 deux fusions plus tard.
- **Ce qu'on en tire.** Une branche empilée dont la base est fusionnée se rebâtit depuis `main` par cherry-pick de ses seuls commits, sans rebase poussé ni force-push. Une branche reprise se relit contre le `main` du jour. Avant de conclure qu'une branche est en conflit, la mesure juste est `git merge-tree`. Deux tâches qui écrivent le même registre se font l'une après l'autre. Et une règle qui s'applique « à partir de maintenant » ne rattrape pas les branches déjà ouvertes : elles se relisent contre elle avant leur fusion.
- **Où c'est prouvé.** `6d727b0d` (« Une résolution de conflit n'est pas une fusion de deux textes : c'est un CHOIX ») ; `055590bc` ; `f80abdc4` ; `51b0d1b1` (`git merge-tree` sur six branches) ; `d864ca87` (8 conflits puis 22).
- **Règle maison.** Aucune à ce jour ; elle sert RM-09.
- **Consolide.** #33, #36, #45, #93, #113, #126, #188, #195, #464, #598, #612, #684, #731.

### LEC-32 — Mesurer avant d'écrire : une commande dit ce qu'elle rend, pas ce qu'on lui fait dire

- **Ce qui s'est passé.** `git log -1 -- <fichier>` a été lu comme « qui a écrit cette ligne » : une PR a été accusée à tort, et la fausse trouvaille s'est propagée dans un commit, une entrée de journal, un corps de PR et un brief de relecture avant qu'une lentille ne la mesure. La même entrée annonçait ensuite trois lignes là où `git grep` en rendait cinq. Ailleurs : un verrou de phase décrit par une note de reprise a traversé cinq jours sans que personne relise le champ `phase` qu'il incriminait ; une acceptance comptait neuf orphelins, la mesure du jour en donnait deux ; une recherche faite sur une branche de rattrapage voyait le dépôt d'avant ses fusions ; un nom (« forme normale », « batterie permanente ») désignait une chose que le code ne faisait pas.
- **Ce qu'on en tire.** La question « cette ligne existe-t-elle sur cette base ? » se pose à `git grep` sur un sha, AVANT d'écrire ; la paternité d'une ligne se demande à `git blame` ou `git log -S`. Un compte qui décrit une commande est celui que la commande rend. Une absence se vérifie sur la tête de `main`. Une affirmation de branchement se mesure à l'appel réel. Plus une trouvaille est spectaculaire, plus elle se mesure avant d'être écrite.
- **Où c'est prouvé.** `954fe5a1` (« `git log -1 -- <fichier>` repond « dernier commit qui a TOUCHE le fichier » ») ; `8e9113f3` (« un verrou se vérifie sur le registre, pas sur la note qui le décrit ») ; `14a85940` (neuf orphelins, puis deux).
- **Règle maison.** RM-01 — un total retapé redevient faux ; même famille que LEC-11.
- **Consolide.** #34, #35, #99, #102, #118, #216, #219, #233, #425, #516, #570, #574, #716, #730, #745.

### LEC-33 — Dans un dépôt public, chaque commit et chaque révision de corps sont publiés

- **Ce qui s'est passé.** Un IBAN d'exemple collé une fois dans un bloc ROUGE verbatim est resté dans l'historique des révisions du corps : la PR a été fermée et remplacée, code inchangé. Une garde qui ne jugeait que la tête laissait passer ce que portaient les commits intermédiaires, publiés eux aussi, même écrasés à la fusion. Une entrée de journal a affirmé un fait faux sur du code hors de son diff — invérifiable par sa propre CI. Les témoins d'une forme de contournement deviennent publics dès la poussée de la branche.
- **Ce qu'on en tire.** Un corps se vérifie avec le détecteur de la garde avant sa première publication. Une garde de publication juge chaque commit de la PR. Une entrée de journal n'affirme sur le code que ce qui a été mesuré ; une fausse mauvaise nouvelle, sur un document qu'aucune garde ne relit, survit des mois et décrédibilise le reste de la phrase. Ce qui sort vers le public se dérive de ce qui est tranché : la structure se montre, l'économie du réseau jamais. Une citation reste exacte : une remarque glissée dedans se met entre crochets, un extrait dit où il s'arrête, et un accord donné en message privé n'est pas une source citable.
- **Où c'est prouvé.** `310cf0c1` (« le corps d'une PR garde chacune de ses révisions ») ; `fa90f835` (« Sur un dépôt public, la tête n'est pas ce qui est publié ») ; `8184c884` (l'entrée de journal invérifiable par sa propre CI).
- **Règle maison.** Aucune à ce jour ; la règle de publication est en tête de `README.md`, la décision au registre `docs/DECISIONS.md`.
- **Consolide.** #88, #107, #206, #235, #407, #535, #713, #723, #732, #736, #759.

### LEC-34 — Un vert sur le poste ne certifie ni la CI ni ce qui est publié

- **Ce qui s'est passé.** Un fichier marqué inchangé dans l'index sortait en 0 en local et en 1 en CI, qui extrait le blob. Une garde qui lit les octets du BLOB indexé continuait de rougir après une correction faite sur le disque mais non indexée. Sous Windows, un vert local ne disait rien d'une sortie lue par un pipe sous Linux, où le pipe est asynchrone et `process.exit` n'attend pas qu'il se vide. `npx` lancé depuis un dossier sans `node_modules` jugeait la garde sous un autre `tsx` que la porte A. `pnpm test --opt` est refusé en « Unknown options » et sort en 0 ; `pnpm ls` lance la commande intégrée, jamais le script. Un mandataire `gh.cmd` en tête de `PATH` n'est jamais trouvé par Node sous Windows. `refs/stash` est partagé entre les arbres de travail d'un même dépôt. Prettier recoupe les lignes et rend `git diff -w` aveugle à un reformatage, et peut rendre inerte un `@ts-expect-error` en découpant un import.
- **Ce qu'on en tire.** `git add` fait partie de la mesure. Le typecheck se relance APRÈS le formatage. On lance un script par `pnpm run <nom>`. Ne jamais utiliser `git stash` dans un arbre de travail de ce dépôt. Et un vert n'est accepté que si la commande a pu être vue rouge dans les mêmes conditions que la CI — c'est la suite de LEC-03 et LEC-10.
- **Où c'est prouvé.** `d084b0b8` (« un vert local ne certifie pas ce qui est publié ») ; `9f698f0a` (« une correction non indexee est invisible pour cette garde ») ; `a68802f3` (le pipe sous Linux) ; `8c70f52a` (« Unknown options » et sortie en 0) ; `f7ea7c32` (`refs/stash` partagé) ; `3625f6c1` (`PATHEXT`).
- **Règle maison.** RM-14 pour la moitié « index » ; RM-02 pour le reste.
- **Consolide.** #39, #41, #44, #59, #73, #74, #79, #86, #91, #114, #118, #120, #134, #175, #394, #416, #578, #644.

### LEC-35 — Une garde qui lit la forge mesure la file si elle ne se borne pas à l'histoire de ce qu'elle teste

- **Ce qui s'est passé.** Les spécifications d'une garde qui interroge la forge rougissaient sur TOUTE branche, sans qu'aucune n'ait changé une ligne. Le même rouge a coûté deux portes A dans une journée. Une fusion voisine devenait une fausse alerte tant que la garde jugeait par date et non par le graphe. Une égalité à la seconde, crue théorique, était le cas courant. La forge plafonne sans erreur une liste de fichiers à cent. Un run annulé reste attaché à sa tête, et éditer un corps après la poussée en attache un.
- **Ce qu'on en tire.** Une garde qui lit l'état vivant de la forge le restreint à l'histoire de ce qu'elle teste, et c'est le graphe qui dit l'appartenance, pas la date. « Non ancêtre » et « introuvable » ne se confondent pas : un clone superficiel ne doit jamais exempter une PR. Une donnée lue « maintenant » pour juger un fait passé se relit à l'instant de ce fait. Une liste servie par la forge se compare au nombre que la PR annonce. Le corps d'une PR s'écrit avant la première poussée ; une tête neuve relance une porte complète.
- **Où c'est prouvé.** `93a7c32b` (« Le rouge d'une garde qui interroge la forge n'appartient à aucune branche ») ; `39bf5c55` (« la date d'une fusion ne dit pas si elle appartient à cet arbre, le graphe le dit ») ; `a42f88a9` (clone superficiel) ; `a8221af1` (plafond à cent fichiers).
- **Règle maison.** Aucune à ce jour.
- **Consolide.** #89, #109, #112, #168, #211, #225, #226, #467, #471, #472, #550, #637, #639, #654.

### LEC-36 — Une garde lexicale lit aussi le texte qui la raconte

- **Ce qui s'est passé.** Le docblock qui expliquait un défaut a fait rougir la garde qui le ferme, sur son propre texte ; une spec qui citait un marqueur en prose a fait rougir la garde red-first ; une URL encodée en commentaire se lisait comme un identifiant nu ; une apostrophe dans un commentaire de `vitest.config.ts` ouvrait un faux motif et rendait un dossier de tests invisible ; nommer une tâche voisine dans les vingt premières lignes d'un fichier le fait rougir en `mention_hors_paths`. Une négation écrite avec les mots d'un marqueur a été lue comme une affirmation. Un texte versé mot pour mot passe aussi par le lexique de l'espace et la règle de publication : un nom de colonne, un nom d'événement entré au contrat, ou un montant en clair dans un témoin y sont refusés hors de leur source.
- **Ce qu'on en tire.** Les commentaires se retirent avant de compter, et une directive ouvre une ligne de commentaire. On n'écrit jamais les mots d'un marqueur pour dire qu'il ne s'applique pas. Le fait fondateur d'un fichier se raconte plus bas que sa vingtième ligne, ou sans le nom. Une garde qui protège une table ne la nomme pas : elle dérive la table protégée des déclencheurs que les migrations posent. Et la substitution d'un mot refusé dans un texte versé se fait avec l'accord de son auteur, mot pour mot.
- **Où c'est prouvé.** `32ea43d0` (« Le docblock qui explique le défaut faisait rougir la garde qui le ferme ») ; `809a746a` et `8c70f52a` (les vingt premières lignes de `gov:attributions`) ; `fd41c0d6` (l'apostrophe dans `vitest.config.ts`) ; `d23ae7df` (la négation lue comme une affirmation).
- **Règle maison.** RM-12 pour les identifiants lus dans les commentaires ; RM-01 pour la table dérivée de ses déclencheurs.
- **Consolide.** #55, #75, #78, #84, #92, #128, #136, #169, #518, #605, #635, #659, #733.

### LEC-37 — La base dit ce qu'elle tient, à condition de lui demander au bon endroit

- **Ce qui s'est passé.** Prisma ne rend que la CLÉ d'une unicité violée, jamais le nom de l'index, même en SQL brut ; Postgres enchaîne les déclencheurs `BEFORE` d'une même table dans l'ordre alphabétique de leurs noms, et un déclencheur `BEFORE` parle avant les contraintes. Un objet `pg_temp` vit autant que la connexion, pas que la transaction, et le pool le rend au test suivant. Un verrou consultatif ne ferme la course que pour ceux qui le prennent. Céder la propriété d'une table protégée ne protège rien tant que le serveur se connecte en superutilisateur, et une restauration en `--no-owner` jette cette protection en silence. Relâcher un `NOT NULL` est additif, mais sans le `CHECK` posé en même temps il ouvrait un état interdit. Un remplacement de texte ancré sur une fin de ligne a touché toutes les relations du schéma qui la partageaient, et seule la porte D l'a vu.
- **Ce qu'on en tire.** Un index unique ferme la course pour tout écrivain ; le nom d'un index se prouve par `pg_indexes`. Un témoin en base qui dépend d'un état de connexion tient dans une seule transaction. Une protection commence au rôle de connexion, et un témoin de restauration juge l'état restauré, pas le code de sortie. Une valeur d'enum vit dans trois sources que le registre tient égales, et son ajout est irréversible : on confronte son nom aux gardes lexicales AVANT la première PR. Avant d'ajouter un verrou ou une table cloisonnée, chercher qui écrit déjà dans la table et faire entrer ces fichiers aux `paths`.
- **Où c'est prouvé.** `9d6fbad0` (« Prisma ne rend que la CLÉ d'une unicité violée ») ; `4dd40e48` (ordre alphabétique des déclencheurs) ; `f49647a7` (`pg_temp`) ; `834d67d1` (superutilisateur) ; `ea9a4b63` (`--no-owner`) ; `e8158d57` (le remplacement ancré).
- **Règle maison.** RM-06 pour l'index unique partiel ; RM-04 pour l'enum ; aucune pour le reste.
- **Consolide.** #124, #346, #361, #389, #392, #396, #399, #403, #404, #432, #444, #480, #511, #512, #515, #517, #522, #523, #556, #582, #586, #587, #601, #609, #615, #632, #714, #749.

### LEC-38 — Une alerte placée dans ce qu'elle surveille meurt avec lui

- **Ce qui s'est passé.** Une alerte posée dans le job qu'elle surveille est morte avec lui, et le silence est passé pour un succès. Une alerte sur échec ne bornait pas une durée : un planificateur qui saute n'échoue pas. Une alerte codée sans ses secrets dans le workflow qui la lance échouait en silence. Un saut en code 0 convient à une attente connue d'un déclencheur automatique, mais sur un geste d'opérateur il dit « fait » alors que rien n'a eu lieu. Un job requis qui échoue fait sauter celui qui en dépend, et un saut requis compte comme un succès ; un `if: always()` en aval ou un `continue-on-error` contourne un ordre d'étapes en restant « à sa place ». Une étape de porte qui lance une commande intégrée de pnpm, ou un `run:` de plusieurs lignes, casse le pré-contrôle local.
- **Ce qu'on en tire.** Une durée se tient par une garde qui mesure l'âge, et c'est elle qui alerte. Les chemins d'une tâche d'alerte comprennent le workflow qui l'appelle. La règle de sortie se juge au déclencheur, pas au script. La porte finale tourne toujours, et son étape juge chaque résultat. Une étape de workflow est un script nommé, et une variable partagée entre étapes passe par l'`env:` de chacune. Un runbook porte l'empreinte de son corps, se finit avant l'exercice, et nomme qui a le droit de mener un geste de production jusqu'au bout, retour en avant compris.
- **Où c'est prouvé.** `a3ea83c5` (« Une alerte placée dans le job qu'elle surveille meurt avec lui ») ; `79b2a333` (« un planificateur qui saute n'échoue pas ») ; `b39d3b33` (le saut en code 0) ; `315044f7` (« un saut requis compte comme un succès ») ; `c267ea1f` (`if: always()` et `continue-on-error`).
- **Règle maison.** RM-02 ; même famille que LEC-13 — un job qui ne bloque rien ne garde rien.
- **Consolide.** #100, #221, #245, #272, #283, #288, #289, #292, #297, #298, #301, #302, #304, #305, #306, #308, #313, #339, #385, #387, #397, #463, #521, #531, #579, #594.

### LEC-39 — Quand deux textes se contredisent, écrire la moitié juste donne l'assurance que l'affaire est close

- **Ce qui s'est passé.** Deux exigences se contredisaient sur ce que la frontière doit rendre ; la préséance tranchait, le code était juste, mais la PR appliquait une clause et écartait l'autre en silence, et le fichier écrivait l'une des deux divergences en taisant l'autre. Le motif est revenu sous toutes ses formes : deux exigences actives contradictoires relevées par un auteur au moment de coder ; une borne posée dans une exigence et oubliée dans le texte du contrat proposé et dans un témoin daté ; une acceptance qui exigeait un refus contre le contrat publié alors que le contrat ne portait pas la contrainte ; une décision orale qui défaisait une règle plus ancienne sans la nommer ; une précision promise par un courriel, absente du contrat.
- **Ce qu'on en tire.** Une contradiction se tranche par une décision écrite au registre, jamais par l'acceptance la plus récente ; quand la préséance ne suffit pas, elle passe par les lentilles qui portent le fond, et ce qu'elles ne tranchent pas monte à Williams. Une décision prise contre l'avis d'une lentille s'inscrit avec sa source et le risque accepté. Une exigence qui change avec son code s'amende dans la PR du code. Un texte d'auteur se verse tel quel, depuis le fichier de son auteur, relu au moment du versement ; une forme déjà versée se relit avant d'en proposer une autre. Une remarque non bloquante qui ne devient pas une tâche se perd.
- **Où c'est prouvé.** `e6b1df4e` (« quand deux textes se contredisent, ecrire la moitie juste donne l'assurance que l'affaire est close ») ; `53e765e2` (« La contradiction se tranche par une décision écrite, jamais par l'acceptance la plus récente ») ; `6d36f60a` (la borne oubliée dans trois copies) ; `7cbe0035` (trois exigences de même rang).
- **Règle maison.** Aucune à ce jour ; l'arbitrage document par document est `docs/PRESEANCE.md`.
- **Consolide.** #90, #251, #254, #285, #310, #321, #322, #370, #376, #377, #384, #414, #433, #434, #443, #454, #465, #466, #504, #509, #536, #547, #551, #560, #562, #591, #647, #655, #658, #667, #680, #694, #698, #756.

### LEC-40 — Une date ou une durée se juge à sa valeur exacte, aux bords, et dans tous les textes qui la portent

- **Ce qui s'est passé.** `setUTCMonth` déborde : deux mois avant un 30 avril, il rend le 2 mars, et une ligne sortait avant son échéance — les témoins choisis ne tombaient ni en fin de mois ni de part et d'autre d'un changement d'heure. Une latitude arrondie au-delà de quatre-vingt-dix degrés devenait quatre-vingt-dix pile. Une garde qui écrit les durées en lettres plafonnait sous mille, et la première durée de conservation en jours l'a dépassée. Une session gardait une empreinte réseau au-delà de ce que le registre annonce, parce qu'elle finissait à la plus tardive de deux dates au lieu du premier événement qui la clôt. Le lanceur est un processus neuf à chaque passage : un dédoublonnage en mémoire n'y tient pas. Un oracle vivant a trouvé une année à dix fériés là où le test en supposait onze.
- **Ce qu'on en tire.** Les témoins datés couvrent les bords — fin de mois, changement d'heure, égalité. Une borne se juge sur la valeur exacte. Ce qu'une garde dérive d'une source couvre tout ce que la source peut contenir. Une durée annoncée est une durée appliquée par une constante de la SSOT, une purge et ses témoins ; une durée tranchée sans tâche qui l'applique reste lettre morte. Et une durée se lit dans la règle qui la fonde au lieu d'être recopiée.
- **Où c'est prouvé.** `2faea210` (« `setUTCMonth` déborde ») ; `bd379797` (la borne exacte) ; `faa61b25` (le plafond de la garde des durées) ; `3042f57c` (la session) ; `f37659e4` (l'oracle de Gauss).
- **Règle maison.** RM-10.
- **Consolide.** #400, #441, #484, #491, #532, #604, #610, #671, #740.

### LEC-41 — Le contrat d'événements se tient par ses artefacts publiés, et un traitant absent n'est pas un succès

- **Ce qui s'est passé.** Un port métier qui « ne fait rien » pour un type inconnu laissait le worker conclure `traite`, et un `traite` n'est jamais rejoué. Repartir de la plus haute séquence reçue ne retrouvait jamais un événement perdu au milieu de la file — c'est une mutation survivante qui l'a montré. Le rejeu d'un événement en attente ignorait sa version, et une version inventée était jugée conforme. Valider contre le contrat publié a rendu visibles les charges factices d'anciens témoins. Un nom d'événement qui entre au contrat devient interdit en clair partout ailleurs, y compris dans des fichiers que le diff du contrat ne touche pas.
- **Ce qu'on en tire.** L'absence de traitant est un état, pas un succès. On relit en recouvrement. Une montée de contrat garde chaque artefact publié, pas seulement le dernier ; un numéro de version se fige à sa première adoption par l'autre côté, pas à sa fusion — avant, on l'amende et seule l'empreinte bouge. « Facultatif au contrat » ne veut pas dire « facultatif pour le récepteur ». Une projection dont le marquage n'est pas dans la transaction du traitant se recalcule depuis les faits. Les témoins partent de la charge du producteur réel. Et ce qu'un contrat d'API ne dit pas se lit dans le code du tiers, avec sa source, sa date et sa limite.
- **Où c'est prouvé.** `c478d8e7` (« L'absence de traitant est un état, pas un succès ») ; `f642921f` (la relecture en recouvrement) ; `975c8884` (la version ignorée au rejeu) ; `544d76ab` (les charges factices) ; `9620e4d3` (le nom d'événement entré au contrat).
- **Règle maison.** RM-03 pour les fixtures depuis le producteur réel ; RM-08 pour ce qu'un tiers doit accepter.
- **Consolide.** #237, #287, #333, #379, #388, #402, #481, #490, #539, #553, #585, #622, #645, #657, #670, #710, #720.

### LEC-42 — Un refus se rejuge là où l'on écrit, et un écran se vérifie au-delà de sa capture

- **Ce qui s'est passé.** Un refus qui ne vivait que dans une redirection se contournait par un lien direct. Un groupe de routes ne protège ni une action ni une route d'API. Une action de serveur rangée hors des dossiers que lit la garde des rôles lui échappait sans bruit : la garde confrontait une action au lieu de quatre, et seul son compte le montrait. Une entrée de navigation qui ne lit que le droit menait à un écran absent. Deux aperçus validés à l'œil cachaient un texte clair sur un fond devenu clair, hors de ce que la capture montrait. Une politique de contenu stricte casse sans bruit : le navigateur ignore le style refusé. Une variable insérée après une préposition rend la phrase fautive dès qu'une seule valeur commence par une voyelle.
- **Ce qu'on en tire.** Une condition d'accès est un appel exigé au premier acte, vérifié sur le disque et rejugé sur chaque route, pas une place dans l'arborescence. Une garde de cloisonnement se prouve par ses brèches, avec et sans la couche. Un port qui rend un booléen garde une catégorie hors de la réponse plus sûrement qu'un test sur la réponse. Une maquette de console dessine l'accès refusé comme l'état vide, et une maquette qui change après sa séance se marque « à revalider ». Une micro-copie se relit avec chacune de ses valeurs, et contre les autres textes du même parcours.
- **Où c'est prouvé.** `7917d1a4` (« Un refus qui ne vit que dans une redirection se contourne par un lien direct ») ; `3c77301b` (le groupe de routes) ; `92a7e48a` (une action au lieu de quatre) ; `0552b3d5` et `b8800428` (ce que la capture ne montrait pas).
- **Règle maison.** RM-05.
- **Consolide.** #200, #342, #360, #368, #372, #401, #405, #423, #435, #449, #450, #477, #501, #552, #559, #575, #590, #596, #606, #660, #663, #675, #705, #707, #709, #726.

### LEC-43 — Un chemin, une exemption et un témoin se déplacent ensemble, dans le même commit

- **Ce qui s'est passé.** Déclarer un chemin a périmé une exemption ailleurs ; retirer un chemin qu'une garde désignait encore a cassé la réciprocité ; une citation déclarée est devenue fausse le jour où la tâche citée a pris le fichier ; retirer un gabarit a fait tomber les exemptions qu'il portait, et retirer un masque tolérant a fait apparaître treize citations que personne n'avait déclarées. Une dette versée sans les chemins qu'elle exige ne peut pas être faite par son auteur. Une tâche qui cite le chemin d'une garde dans ses `paths` ne la promet pas pour autant.
- **Ce qu'on en tire.** Les deux gestes — déclarer et retirer l'exemption, déplacer un témoin et l'écrire à l'arrivée — vont dans le même commit. On retire après le réalignement, jamais avant. Une garde nouvelle qui rougirait `main` se livre avec le nettoyage de `main`, jamais avec une liste d'exemptions ; une exception se conditionne sur le couple exact qu'elle nomme, et une exemption « à celui qui a migré » compte ses bénéficiaires. Déclarer un fichier au registre des refus oblige à nommer toutes ses sorties. Une exigence qui suppose un code absent se partage : la fonction à la tâche qui la porte, l'appel à celle qui écrira l'appelant. Une exemption retirée dit qu'elle est périmée et qui la portera.
- **Où c'est prouvé.** `f7a9c78e` (« Déclarer un chemin peut périmer une exemption ailleurs ») ; `9cd0360d` (la réciprocité) ; `9bc8ab7f` (la citation déclarée) ; `c60e2f38` (« Un masque tolérant cache plus que ce qu'il nomme ») ; `96d0e8ac` (le nettoyage de `main`).
- **Règle maison.** Aucune à ce jour ; elle sert RM-14 — un chemin hors déclaration est un chemin qu'aucune garde ne relie à son porteur.
- **Consolide.** #209, #316, #390, #418, #426, #448, #460, #461, #475, #476, #478, #487, #500, #514, #520, #549, #623, #626, #669, #702, #725, #738, #742.

### LEC-44 — Un secret ou une donnée personnelle ne se protège pas par motif : on la retire du chemin

- **Ce qui s'est passé.** Un caviardage par motif couvrait le lien de dépôt, pas le lien de connexion, de même forme et de même prix. L'option `redact` de pino juge des chemins : un objet un cran plus bas, un tableau ou une clé en casse différente passaient. Une exemption par forme hexadécimale laissait passer un IBAN en minuscules à la forme d'une empreinte. Le chiffrement des données personnelles tire un vecteur aléatoire : une garde de déterminisme qui compare les octets rougit à tort, une qui les ignore laisse passer un clair. Une empreinte courte d'un petit espace de valeurs se renverse par énumération. Une double clé que le code savait lire n'était jamais alimentée en production, faute de passer par le provisionnement.
- **Ce qu'on en tire.** Quand une nouvelle URL porte un secret, le motif du journaliseur se pose dans le même diff que la route, et seul un parcours de la ligne finale voit toutes les formes. On déchiffre avant de comparer. Pseudonymiser une donnée, c'est aussi recalculer chaque empreinte qui en dérive. L'identifiant de clé se dérive de la valeur. La minimisation se gagne au plan, avant le code ; une donnée qu'un traitement relira se retire au moment où il l'a consommée ; un nom de table passe en paramètre depuis son écrivain. Une forme valable pour une lecture ne se transpose pas à une autre.
- **Où c'est prouvé.** `68417b40` (« Un caviardage par motif ne protège que les formes qu'il connaît ») ; `310cf0c1` (l'option `redact` et l'exemption hexadécimale) ; `f0c14455` (le vecteur aléatoire) ; `50b0b9ce` (l'empreinte courte) ; `75602591` (la double clé jamais alimentée).
- **Règle maison.** RM-05.
- **Consolide.** #214, #281, #314, #430, #593, #750.

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

_(rien à consolider — quarante-quatre leçons au journal. Consolidation du 2026-09-05 par le `documentaliste` (A03) : les « appris » des PR #28, #29 et #30 sont devenus LEC-14 à LEC-16, et le lot `L-1-INT-a` a fourni LEC-17 à LEC-24. Consolidation du 2026-10-07 par le même poste : les 373 « appris » du journal de session restés en attente, des PR #31 à #759, ont été lus un à un et fondus en LEC-25 à LEC-44 ; chaque leçon nomme les PR qu'elle consolide sous « Consolide ». Aucune n'a fait règle : celles qui se répètent assez pour y prétendre — LEC-25, LEC-29, LEC-30 — attendent une ADR, que ce poste ne prend pas.)_

<!-- a-consolider:fin -->

## Après lancement

> Dettes de relecture NON bloquantes, rangées ici par le gel de la gouvernance (décision de Williams
> du 2026-09-29) : aucune ne devient tâche avant le lancement. Chacune cite sa tâche ou sa PR. Ce ne
> sont pas des leçons : `gov:lecons` ne les lit pas, et aucune n'attend de consolidation.

- **INT-T27-A** — `contracts.v1.json` n'est pas dans les `paths` de la tâche.
- **GOV-062** (PR #241) — quatre limites déclarées : actions tirées par étiquette, `GITHUB_ENV` écrit hors `.ts`, `ECRIT_L_ARBRE`, `nightly.yml` non confronté.
- **QA-T05 / QA-T06** — images Docker tirées par étiquette, non par empreinte.
- **GOV-127** (PR #257) — le passif de la déclaration ne compare pas le champ `depot`.
- **INT-T05** (axion-ia #1228) — cohérence du HT reçu non vérifiée côté Partners : la somme des HT des paiements ne doit pas dépasser le HT de la facture.
- **JUR-T40** — `sensible` vide, à réexaminer.
- **GOV-124** (PR #248) — l'exclusion d'une lentille est une liste, pas une règle dérivée : REGLES-MAISON, LECONS, maquettes/VALIDATION, ESPACE-ROUTES et journal/README restent à une lentille.
- **JUR-T34** (PR #242) — historique des versions acceptées de la politique ; micro-copie « Votre espace s'ouvre… ».
- **GOV-117** (PR #259) — l'acceptance (7) cite `gov:tasks` là où la garde est `gov:requirements` ; pas d'option `--abaisse-le-risque` pour les outils hors dépôt.
- **QA-T34** — `docs/gates.json`, porte de déploiement : le champ `tache` reste GOV-000 (non écrivable par les outils, voulu) alors que QA-T34 livre `deploy-verify`.
- **GOV-128** (PR #278) — le champ `date` d'une entrée du passif n'est pas documenté : pour #1228, c'est la date de l'arbitrage (2026-09-30), la fusion étant du 2026-09-29 en UTC.
- **QA-T50** (PR #271, revue exactitude) — la section « Paths » du corps omet le témoin des refus et `package.json`.
- **JUR-T29** (axion-ia #1232, revue exactitude) — l'expression OBJET de la garde `jur-copy-indicative` ne reconnaît ni entreprise, ni client, ni mois près d'un montant ; le test du courriel d'avant signature juge le fichier entier, et en français seulement ; « sans aucune limite » reste sous l'indicatif.
- **GOV-123** (PR #275) — `dateDUneVue` date une vue hors git par HEAD, non par son rendu : `plan_state_perime` ne voit plus une vue périmée sur un poste (la CI rend avant de juger) ; `gov-etat` lit PLAN-STATE sans garde d'absence ; le gabarit de PR (case « PLAN-STATE régénéré »), CODEOWNERS (vues possédées, sources non) et REPRISE-SESSION décrivent encore des vues commitées ; deux témoins copient une vue du disque local.
- **GOV-123** (PR #275, revue securite) — `nightly.yml` ne rend pas les vues avant ses gardes (une lecture de vue y serait un ENOENT, donc un échec fermé) ; la règle « toute garde qui décide lit la source, jamais une vue » n'a pas de contrôle propre.
- **QA-T34** (PR #268) — fusionnée par A01 sur porte A verte et deux accords lus à la main, sans rejouer `gov:pr --pr 268`, qui était rouge (case 3 de la DoD vide ; un accord au format « Verdict : **accepte** » classé sans verdict). Les deux accords portaient bien sur la tête fusionnée : rien à défaire. Depuis, `gov:pr --pr <n>` vert précède chaque fusion.
- **QA-T20** (PR #263, revue exactitude) — la déclaration du chemin `perf/budgets.json` le dit « lu par perf:bundle », ce qui est faux ; `/confidentialite` garde un ancien motif de chemin qui ne désigne plus rien.
- **JUR-T29** (axion-ia #1240, arbitrage -d7) — la mention de l'AI Act ne reconnaît pas ses alias, dont « RIA » (règlement sur l'intelligence artificielle) : une formulation qui les emploie échappe à la garde.
- **JUR-T29** (axion-ia #1241, relevé par l'auteur) — `projection_mensuelle` ne lit un rythme qu'en unités : un montant suivi de « par mois, à titre indicatif », de « /mois », de « par an », ou écrit à l'anglaise suivi de « a month », passe. À élargir à an, année, semaine, year et week ; un montant « /mois » ne doit pas être excusable.
- **JUR-T29** (axion-ia #1241, relevé par l'auteur) — `ai_act_trop_large` ne reconnaît pas l'alias « règlement européen sur l'IA » (complément de l'entrée « RIA » ci-dessus), et rougit à tort au pluriel (« Toutes les entreprises qui utilisent l'IA ont des obligations ») : il manque un contre-témoin.
- **JUR-T29** (axion-ia #1241, relevé par l'auteur) — une exception excuse la ligne entière (`includes`) au lieu du seul fragment qu'elle vise.
- **JUR-T29** (axion-ia #1241, relevé par l'auteur) — `{formatAmount(...)}` n'est pas vu quand la garde lit ligne à ligne ; il faut une fenêtre de ±2 lignes.
- **QA-T12** (PR #280, revues exactitude et securite) — aucun témoin ne montre le refus de configurer la sauvegarde sans son signal d'activation.
- **QA-T53** (PR #293, revues exactitude et securite) — aucun témoin n'exécute `alerteDeLaForge` (`scripts/sauvegarde/cycle.ts`), ni « sauvegarde activée et canal Telegram absent ⇒ le run rougit », ni « sans canal, la garde des clairs juge quand même », alors que `docs/runbooks/sauvegarde.md` et le journal de la PR 293 le promettent.
- **INT-T41** (axion-ia #1242, arbitrage de la coordination) — le déploiement a échoué à l'étape Lighthouse post-déploiement, sur `/fr/appel` seulement (iframe Calendly : score desktop aléatoire, 63 à 73 déjà sur un run vert) ; l'atterrissage était pourtant vérifié (image déployée, Coolify vert, healthz 200). Le seuil Lighthouse desktop de `/appel` est à rendre stable ou à exclure, faute de quoi il rougit des déploiements sains.
