# Leçons — Axion Partners

<!-- consolidation: 2026-09-05 -->

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
- **Règle maison.** Aucune à ce jour ; même famille que LEC-05 — le contrôle et son déclencheur se conçoivent ensemble.

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

_(rien à consolider — vingt-quatre leçons au journal. Consolidation du 2026-09-05 par le `documentaliste` (A03) : les « appris » des PR #28, #29 et #30 sont devenus LEC-14 à LEC-16, et le lot `L-1-INT-a` a fourni LEC-17 à LEC-24. Une seule a fait règle — RM-14.)_

<!-- a-consolider:fin -->
