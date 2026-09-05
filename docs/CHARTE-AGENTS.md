# Charte des agents — Axion Partners

> Livré par **GOV-007** (REQ-GOV-010, REQ-GOV-011, REQ-GOV-012, REQ-GOV-013). Ce fichier est **dérivé**
> des quinze fiches de `.claude/agents/*.md` (RM-01) : la fiche dit ce qu'un poste fait, la charte lui donne
> son **code** et fixe ce qui se passe **entre** les postes — qui relit qui, qui fusionne, qui supplée qui.
> Une fiche qui change fait changer cette charte ; l'inverse n'est jamais vrai. Les fiches sont tenues par le
> lot dédié GOV-000 / GOV-023.
>
> **Ce qui garde ce fichier, et ce qui ne le garde pas.** `pnpm gov:pr` (`scripts/gates/gov-pr.ts`) est livrée
> avec cette charte : elle contrôle le gabarit de PR, `.github/CODEOWNERS`, le tableau des postes du §2, la
> lentille du §6 et le tableau des chemins réservés du §7 ; son mode `pnpm gov:pr:prove` fait rougir chacune
> de ses familles sur son propre témoin. Son test est `tests/gov/charte-pr.spec.ts`.
> Deux autres gardes sont **déclarées et non écrites** : `gov:agents` (les cinq sections de chaque fiche,
> tâche GOV-023) et `gov:autonomie` (`.claude/settings.json`, tâche GOV-000) portent toutes deux
> `"preuveRouge": null` dans `docs/gates.json`. Tant qu'elles n'ont pas été vues rougir, **rien** dans ce
> dépôt ne vérifie ni le contenu des fiches ni la matrice d'autonomie : ne pas s'y appuyer.

## 1. Ordre de lecture d'une session (REQ-GOV-023, RM-01)

Un agent qui prend une tâche lit, **dans cet ordre**, avant d'écrire une ligne :

1. `docs/PLAN-STATE.md` — où en est le projet, ce qui est bloqué (fichier dérivé, jamais édité à la main) ;
2. `docs/REGLES-MAISON.md` — les douze règles `RM-nn` qui ont coûté cher ;
3. `docs/CONVENTIONS.md` — nommage, argent en centimes, branches, worktrees, pré-vol ;
4. **sa fiche de rôle**, `.claude/agents/<fiche>.md` ;
5. sa tâche dans `docs/tasks.json` ;
6. **le texte de chaque REQ citée**, mot à mot, dans `docs/REQUIREMENTS.md` ;
7. les sections de `docs/spec/` que la tâche référence — `docs/CONSTATS.md` prévaut sur elles.

> Cette lecture **ne se garde pas** : aucun test ne prouve qu'un agent a lu. Ce qui se garde, c'est ce
> qu'elle produit — les REQ citées dans la PR, le bloc ROUGE/VERT verbatim, les identifiants qualifiés,
> l'absence de valeur recopiée. Un agent qui n'a pas lu se voit à sa PR, pas à une case cochée.

## 2. Les quinze codes de poste

Le code identifie le poste dans `docs/tasks.json` (champ `owner`), dans `.github/CODEOWNERS` et dans les
champs `Auteur:` / `Relecteur:` du gabarit de PR. Le schéma imposé par `scripts/lot/tasks.schema.json` est
`^A[0-9]{2}$` : **deux chiffres, zéro de tête compris**. C'est ce zéro qui distingue un code de poste d'une
étiquette de relecteur nue, que `gov:identifiants` refuse (RM-12) ; « A5 » ou « A2 » ne sont pas des codes.

Trois codes sont **ancrés** et ne se rediscutent pas ici : A01 et A02 par `docs/CONVENTIONS.md` (§8 :
`docs/tasks.json` appartient à `gardien-spec` / A01 ; §5 : `CODEOWNERS prisma/** @A02`), A08 par le registre
des décisions (`HYP-E1-13`, « un seul auteur, poste A08, pour toutes les PR axionia »). Les douze autres
suivent quatre blocs, et le bloc explique le numéro :

- **A01–A04, les quatre droits exclusifs** — un fichier réservé ou un acte réservé ;
- **A05–A08, ceux qui écrivent le produit** — du plus central au plus éloigné du dépôt ;
- **A09–A12, ceux qui jugent** — du plus étroit au plus large : une ligne de diff, une garde, un lot, une zone ;
- **A13–A15, les trois audits de fin de phase** — dans l'ordre de la phase où chacun devient bloquant.

Ce tableau porte **une ligne par fiche de `.claude/agents/`, ni plus ni moins** : `gov:pr` rougit sur une
fiche sans ligne, sur une ligne sans fiche, et sur deux lignes qui porteraient le même code.

| Code | Fiche | Poste | Outils déclarés (`tools:`) | Écrit ? |
| --- | --- | --- | --- | --- |
| A01 | `gardien-spec` | Gardien du spec | Read, Write, Edit, Grep, Glob, Bash | oui |
| A02 | `architecte` | Architecte | Read, Write, Edit, Grep, Glob, Bash | oui |
| A03 | `documentaliste` | Documentaliste | Read, Write, Edit, Grep, Glob, Bash | oui |
| A04 | `release-manager` | Release manager | Read, Grep, Glob, Bash | **non** |
| A05 | `dev-partners` | Développeur Partners | Read, Write, Edit, Grep, Glob, Bash | oui |
| A06 | `ux-redaction` | UX et rédaction | Read, Write, Edit, Grep, Glob, Bash | oui |
| A07 | `juriste` | Conformité contractuelle et relationnelle | Read, Write, Edit, Grep, Glob | oui, **sans Bash** |
| A08 | `dev-axionia` | Développeur côté axionia | Read, Write, Edit, Grep, Glob, Bash | oui, **dans l'autre dépôt** |
| A09 | `relecteur` | Relecteur d'une lentille | Read, Grep, Glob, Bash | **non** |
| A10 | `verificateur-rouge` | Vérificateur « vu rougir » | Read, Write, Edit, Grep, Glob, Bash | oui, **pour muter puis restaurer** |
| A11 | `critique-completude` | Critique de complétude | Read, Grep, Glob, Bash | **non** |
| A12 | `lead` | Lead de zone (zone en paramètre) | Read, Write, Edit, Grep, Glob, Bash | oui |
| A13 | `auditeur-securite` | Auditeur sécurité | Read, Write, Edit, Grep, Glob, Bash | oui, **jamais le code audité** |
| A14 | `auditeur-integration` | Auditeur d'intégration | Read, Write, Edit, Grep, Glob, Bash | oui, **des deux côtés** |
| A15 | `auditeur-argent` | Auditeur d'argent | Read, Write, Edit, Grep, Glob, Bash | oui, **jamais le code audité** |

## 3. Les quinze postes, un par un

**A01 · `gardien-spec` — le gardien du spec.**
*Fait.* Tient `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, `docs/GLOSSAIRE.md`, `docs/PRESEANCE.md`, la
traçabilité générée et la copie figée de `docs/spec/`. Compose `docs/tasks.json`. Commite `docs/PLAN-STATE.md`,
qui est dérivé. Refuse une PR sans REQ, un test sans annotation `// @req`, un identifiant nu, une REQ non
testable. À chaque clôture de phase, vérifie que chaque REQ a un test annoté, existant et vert, que chaque
module et chaque étape sont couverts, et rejoue les affirmations des documents contre le dépôt.
*Jamais.* N'écrit pas de code applicatif. N'interprète pas seul une ambiguïté : il ouvre une ADR ou remonte
la question à Will ou à l'expert-comptable.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A02 · `architecte` — la forme des données et des contrats.**
*Fait.* `prisma/schema.prisma` et les migrations ; `packages/contracts/` — les onze événements et les deux
API, consommés des deux côtés, avec leur hash. Rédige les ADR : une question de conception non tranchée par
les documents s'y règle, jamais par un choix silencieux dans une PR. Sur toute PR portant le label `schema`,
il **remplace la troisième lentille** (`simplicite`) et son approbation est **bloquante** — sa fiche
`.claude/agents/architecte.md` et `docs/CONVENTIONS.md` §5 le disent dans ces termes : une PR `schema` reçoit
**trois** lentilles, pas quatre.
*Jamais.* N'implémente ni écran, ni e-mail, ni cas d'usage. N'accepte pas une migration qui perd de la donnée
sans ADR **et** sauvegarde vérifiée. Ne réintroduit pas de référentiel entreprises local.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A03 · `documentaliste` — la mémoire écrite.**
*Fait.* `docs/adr/` (numérotation continue, index dérivé du système de fichiers), `docs/runbooks/` (une
procédure exercée au moins une fois en preview), `CHANGELOG.md` (une ligne par PR fusionnée, avec sa tâche et
ses REQ), `docs/tiers/` (une fiche par dépendance externe : URL officielle, date de lecture, extrait, exemple
officiel, comportement en panne). Consolide chaque semaine les blocs « appris » rendus par les agents dans
`docs/LECONS.md`, qui porte sa date de dernière consolidation.
*Jamais.* Ne tranche pas : il écrit ce qui a été décidé, et par qui. Ne réécrit pas les sept documents de
`docs/spec/`. Ne supprime pas une ADR — on la remplace par une ADR qui la supersède. N'édite pas
`docs/PLAN-STATE.md` à la main : il améliore le script qui le génère.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A04 · `release-manager` — seul à fusionner (RM-09).**
*Fait.* Une PR à la fois sur `main`. Réserve le créneau **avant** `update-branch`, attend toutes les gates
vertes, relit `mergeStateStatus` **et** fusionne dans le même appel (`--squash --delete-branch`), puis vérifie
l'atterrissage : l'en-tête `x-partners-build-sha` doit valoir le sha fusionné. Tant que ce n'est pas vrai, la
PR suivante attend. Lance `pnpm gov:pr --pr <numéro>` **avant** de fusionner : c'est le seul moment où les
revues existent (§8). Lit un run rouge job par job : `cancelled` n'est pas `failure`, et la vérité est dans
l'en-tête de build, pas dans la couleur du run.
*Jamais.* Ne fusionne pas une PR dont il est l'auteur — A12 le supplée (§6). Jamais `--auto`, jamais `--force`,
jamais de push sur `main`, jamais de fusion côté axionia (ce dépôt a sa propre file, partagée avec d'autres
sessions).
*Outils.* Read, Grep, Glob, Bash — **privé d'écriture** (§5).

**A05 · `dev-partners` — développeur d'Axion Partners.**
*Fait.* Prend **une** tâche, crée lui-même son worktree et sa branche, écrit **le test d'abord** avec son
annotation `// @req`, le lance, copie le message d'échec verbatim, écrit le code **minimal**, passe
`pnpm prevol`, ouvre la PR. Rend `livree` ou `stop`.
*Jamais.* Ne devine pas une décision : si sa tâche cite une hypothèse absente de `docs/DECISIONS.md`, ou si
une REQ n'est pas testable, il rend `stop` avec le motif — il ne code pas « en attendant ». Ne touche pas
`prisma/**` ni `packages/contracts/**` si sa tâche ne porte pas `schema: true`. Ne recopie aucune valeur qui
existe ailleurs (RM-01) ni aucune liste littérale d'états occupants (RM-06). Ne fusionne pas, ne relit pas sa
propre PR, n'écrit aucun fichier réservé (§7).
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A06 · `ux-redaction` — ce que l'apporteur lit.**
*Fait.* Maquettes `docs/maquettes/<ecran>.html` et leur ligne dans `docs/maquettes/VALIDATION.md` (écran, date,
validé par Will) — une tâche d'écran n'est pas attribuable tant que sa maquette n'est pas validée. Micro-copy,
états vides, accessibilité WCAG 2.2 AA, `switch` d'affichage exhaustif. Chaque état dit **pourquoi** et
**quoi faire**.
*Jamais.* Ne publie aucune ressource diffusée aux apporteurs sans relecture de Will et sans que chaque
affirmation porte sa source. N'affiche pas de montant avant signature, ni l'identité d'un autre apporteur.
N'emploie pas le lexique interdit ni les formulations de financement refusées par la garde lexicale, qui est
inconditionnelle.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A07 · `juriste` — ce que l'apporteur signe, et ce que l'outil a le droit de dire.**
*Fait.* Tient le gabarit de contrat (clauses en variables, version figée à chaque signature, avenants), la
checkliste des douze motifs à refuser, le lexique interdit, et la liste fermée des documents remis. Repasse à
chaque fin de phase **tous** les écrans et **tous** les e-mails déjà livrés, pas seulement les nouveaux.
*Ce que la charte ne peut pas affirmer.* Sa fiche écrit que la checkliste est « recopiée et cochée dans toute
PR portant le label `apporteur-facing` ». **Cet ancrage n'existe pas encore** : le gabarit de PR ne porte
aucune section `apporteur-facing`, `.github/CODEOWNERS` ne donne aucun chemin à A07, et `gov:pr` n'a donc rien
à compter. Tant que la tâche juridique qui pose ce label ne l'a pas livré (§9), la checkliste est tenue par
A07 à la main, et par rien d'autre.
*Jamais.* N'écrit pas de code applicatif. Ne laisse pas partir une enveloppe de signature avant que le contrat
soit arrêté. Ne laisse pas publier une affirmation de financement hors formulation validée. **Ne justifie pas
une règle relationnelle dans un fichier de ce dépôt** (REQ-GOV-031, `pnpm gov:publication`) : la note qui fonde
ces règles n'est pas ici, elle lui est fournie avec sa tâche.
*Outils.* Read, Write, Edit, Grep, Glob — **pas de Bash** : il lit et il écrit du texte, il ne lance aucune
commande. C'est ce qui lui vaut une suppléance dédiée au §6 : il ne peut pas produire un ROUGE.

**A08 · `dev-axionia` — l'autre dépôt.**
*Fait.* Implémente les producteurs d'événements vers Partners, et rien d'autre : nom exact de
`packages/contracts/events.ts`, fixtures **générées** depuis le producteur réel avec leur `Source:`, cliquet
nominatif sur chaque écrivain, inertie totale sans `PARTNERS_SYNC_ENABLED`. Lit `axionia/AGENTS.md` en entier
et le runbook de fusion avant d'ouvrir quoi que ce soit. `HYP-E1-13` fixe qu'il est le **seul auteur** des PR
axionia du chantier.
*Jamais.* Ne fusionne pas : il ouvre la PR, rend son numéro, s'arrête. Ne touche pas au contrat de build de
l'autre dépôt. Ne lance aucune migration contre une base distante. Ne crée jamais de jonction `node_modules`
dans un worktree.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A09 · `relecteur` — une lentille, un avis.**
*Fait.* Reçoit la tâche, le numéro de PR et **sa** lentille — `exactitude`, `securite` ou `simplicite` — et ne
lit que sous celle-là. Vérifie d'abord que le test annoncé comme rouge porte réellement sur la REQ et que le
message verbatim est plausible au vu du test écrit. Chaque motif de refus cite **un fichier et une ligne**.
Ouvre sa revue GitHub par la ligne `A09 · <sa lentille>` : c'est ce que `gov:pr` compte (§8).
*Jamais.* Ne modifie rien (il n'a ni Write ni Edit, c'est volontaire). Ne relit pas une PR dont il est
l'auteur — ce cas ne peut pas se produire, faute d'outil d'écriture. Ne propose pas de réécriture complète :
il nomme le défaut, le développeur choisit le remède. Ne refuse pas sur un motif déjà arbitré au registre.
*Outils.* Read, Grep, Glob, Bash — **privé d'écriture** (§5).

**A10 · `verificateur-rouge` — la preuve que la garde garde (RM-02).**
*Fait.* Pour chaque garde introduite par la PR : mute (inverse une condition, retire un `where`, supprime un
`CHECK`, retire la clause `WHERE` d'un index partiel), lance le test qui devrait la couvrir, note le message,
**restaure**. Cherche en plus les trois pièges : fixture écrite à la main, paramètre par défaut sur ce que le
test fait varier (RM-11), test qui teste son mock. Ouvre sa revue par `A10 · mutation`.
*Jamais.* Ne corrige pas le code qu'il mute. Ne laisse aucune mutation en place — `git status` propre avant de
rendre.
*Outils.* Read, Write, Edit, Grep, Glob, Bash. Il écrit, mais **uniquement pour muter puis restaurer** : aucun
de ses changements n'entre dans une PR.

**A11 · `critique-completude` — qu'est-ce qui manque ?**
*Fait.* À chaque fin de lot et de phase, cherche les orphelins dans les deux sens (une REQ sans test, un test
sans REQ), les étapes du cycle sans tâche, les tiers sans plan de repli, les décisions prises et jamais
enregistrées, les événements consommés dont personne n'est l'émetteur, les fins de vie non traitées. Pour
chaque manque : **quoi**, **où**, et la **tâche à créer**.
*Jamais.* Ne corrige rien lui-même : ses manques deviennent des issues arbitrées par A01. Ne répète pas un
constat déjà enregistré. Ne rend pas une liste vide par confort — s'il ne trouve rien, il dit **où** il a
cherché.
*Outils.* Read, Grep, Glob, Bash — **privé d'écriture** (§5).

**A12 · `lead` — la cohérence d'une zone.**
*Fait.* Sa zone lui est donnée en paramètre (`domaine`, `securite`, `argent`, `integration`, `espace`,
`console`, `qualite`, `devops`). Découpe une exigence en tâches d'au plus une session, à chemins disjoints,
avec un critère d'acceptation vérifiable et les tests qui le prouvent — une tâche dont il ne sait pas écrire le
test n'est pas prête. Répond aux questions de conception ; si la réponse n'existe dans aucun document, elle
devient une ADR. Tranche après **deux** tours de revue échoués : il accepte en justifiant, ou renvoie la tâche
en `bloquee` avec un motif exact. Il n'y a pas de troisième tour. Code lui-même les briques fondatrices de sa
zone. **Supplée A04** (§6).
*Jamais.* N'est jamais le seul relecteur d'une PR de sa zone. N'accepte pas une tâche qui déborde sa zone sans
en parler à A02. Ne tranche pas une question qui appartient à Will ou à l'expert-comptable : il rend `stop`.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A13 · `auditeur-securite` — le cloisonnement, à chaque fin de phase (bloquant dès la phase 0).**
*Fait.* Test IDOR en boîte noire : deux apporteurs complets, **toutes** les routes et Server Actions de
l'espace énumérées depuis le système de fichiers, chacune appelée avec la session de l'un et l'identifiant de
l'autre puis avec un identifiant inexistant, et l'exigence d'un **404 strictement identique** — même statut,
même corps, PDF inclus. Vérifie la garde en retirant un `where` au hasard : le test doit rougir. Couvre aussi
les jetons, les rôles de console, les webhooks, les API sortantes, les oracles, la PII et les secrets.
*Jamais.* Ne corrige pas le code audité : il rend le constat et le scénario. Ne rend pas un rapport sans preuve
rejouable — une commande, une réponse, un fichier. N'exige pas l'égalité des temps de réponse : derrière un CDN
c'est du bruit, et un test instable finit désactivé.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A14 · `auditeur-integration` — la frontière entre les deux dépôts (bloquant en phase 1).**
*Fait.* Rejoue la séquence complète d'un cycle de vente en la dégradant : même identifiant livré trois fois,
ordre inverse, événement manquant, producteur indisponible plusieurs jours, version de schéma inconnue,
signature altérée, corps trop grand, horodatage hors tolérance. Vérifie que le hash du contrat est identique
des deux côtés en renommant vraiment un champ, que les fixtures viennent du producteur réel, que le cliquet
nominatif rougit, et que la réconciliation compare **deux** choses indépendantes.
*Jamais.* Ne teste pas uniquement le côté Partners : un contrat vérifié par son seul consommateur n'est pas un
contrat. N'accepte pas « ça marche en nominal » — son périmètre est exactement ce qui ne l'est pas.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

**A15 · `auditeur-argent` — le contre-calcul (gate de la phase 2).**
*Fait.* Écrit **en SQL**, depuis les règles des documents, une implémentation indépendante du calcul, et la
confronte au domaine sur cinquante scénarios nommés dont le résultat attendu a été calculé à la main :
l'écart doit être nul, au centime. Ajoute les propriétés tirées au sort (au moins cinq cents tirages chacune) :
la somme des parts est le total, jamais plus ; toute part est dans l'intervalle ; le calcul est sur le HT ;
rejouer les encaissements dans un autre ordre donne le même état final.
*Jamais.* Ne lit pas l'implémentation TypeScript avant d'écrire son SQL — c'est tout l'intérêt du poste. Ne
modifie pas le code audité : il rend l'écart, le développeur corrige. Ne valide pas le mois à blanc : cette
feuille est produite par l'expert-comptable ou par Will, **jamais par un agent**.
*Outils.* Read, Write, Edit, Grep, Glob, Bash.

## 4. Les neuf droits exclusifs de REQ-GOV-010, portés par ces quinze postes

| Droit exclusif (REQ-GOV-010) | Poste qui le porte | Comment on le voit |
| --- | --- | --- |
| Orchestrateur : attribue les tâches, écrit `PLAN-STATE` | **A01**, avec l'outillage de lot | `docs/tasks.json` et `docs/PLAN-STATE.md` sont réservés à A01 (`docs/CONVENTIONS.md` §8) ; `pnpm lot:cloture` est le seul écrivain de `statut`, `pr`, `branch`, `owner` (acceptation de GOV-000) |
| Architecte : seul à accepter un ADR | **A02** | `docs/adr/**` dans `.github/CODEOWNERS` ; approbation bloquante sur le label `schema` |
| Gardien du spec : seul à modifier les registres | **A01** | `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, `docs/GLOSSAIRE.md`, `docs/PRESEANCE.md` réservés |
| Leads de domaine : découpent, valident l'acceptation | **A12** | une fiche, huit zones en paramètre ; l'arbitrage au deuxième tour est le sien |
| Développeurs : une tâche revendiquée à la fois | **A05** (Partners) et **A08** (axionia) | `owner` de la tâche ; une tâche = une PR ≤ 600 lignes de diff |
| Relecteurs adversariaux | **A09** (trois lentilles) et **A13**, **A14**, **A15** (fins de phase) | trois avis distincts par PR ; veto de la lentille sécurité sur tâche `sensible` |
| Vérificateurs de tests | **A10** | un avis « mutation » par PR ; une garde sans mutation vue rougir est nommée |
| Release manager : seul à fusionner | **A04** | une PR à la fois, atterrissage vérifié avant la suivante |
| Documentaliste : `LECONS.md` | **A03** | date de dernière consolidation portée par le fichier |

> **L'orchestrateur n'a pas de fiche, et c'est tranché ici.** `.claude/agents/` ne contient aucune fiche
> `orchestrateur`, et cette charte n'invente pas un seizième poste. Les deux droits que REQ-GOV-010 donne à
> l'orchestrateur sont exercés, **aujourd'hui et sans zone grise**, par A01 et par l'outillage de lot :
> `docs/CONVENTIONS.md` §8 réserve `docs/tasks.json` et `docs/PLAN-STATE.md` à A01, et l'acceptation de
> GOV-000 dans `docs/tasks.json` désigne `pnpm lot:cloture` comme l'écrivain de `statut`, `pr`, `branch` et
> `owner`. Il n'existe donc aucun label `role:orchestrateur`, et il n'en manque aucun : le tableau du §7 ne
> laisse pas de chemin sans porteur.
> Ce qui reste ouvert n'est pas un droit, c'est un **nom** : faut-il créer la fiche et le code `A16`, ou
> reformuler REQ-GOV-010 ? Cette question a déjà un porteur identifié — **GOV-023**, la seule autre tâche que
> `docs/requirements.json` déclare sur REQ-GOV-010. Elle n'a pas besoin d'une ADR pour exister : elle a un
> identifiant de tâche, et la reformulation d'une exigence appartient à A01, pas à cette charte.

## 5. Les postes privés d'écriture

Trois postes n'ont **ni `Write` ni `Edit`**, et c'est délibéré : ils jugent un travail qu'ils ne peuvent pas
modifier, donc ils ne peuvent jamais être l'auteur de ce qu'ils jugent.

| Code | Fiche | Ce que la privation garantit |
| --- | --- | --- |
| **A04** | `release-manager` | Celui qui fusionne ne peut pas retoucher ce qu'il fusionne : le diff approuvé est le diff fusionné |
| **A09** | `relecteur` | Un relecteur ne peut pas réécrire à la place du développeur : il nomme le défaut, l'auteur choisit le remède |
| **A11** | `critique-completude` | Un manque devient une tâche arbitrée, jamais un correctif glissé dans le lot en cours |

Deux privations plus étroites, à ne pas confondre avec les précédentes :

- **A07** (`juriste`) a `Write` et `Edit` mais **pas `Bash`** : il n'exécute rien, il lit et écrit du texte.
- **A10** (`verificateur-rouge`) a `Write` et `Edit`, mais uniquement pour **muter puis restaurer** ; il rend
  un dépôt propre et aucun de ses changements n'entre dans une PR.

## 6. Relecteur ≠ auteur, et les suppléances (REQ-GOV-011)

**La règle.** Un agent ne relit jamais son propre code. Chaque PR porte `Auteur:` et `Relecteur:` ; le code du
champ `Auteur:` n'apparaît **jamais** dans `Relecteur:`, et l'auteur ne s'auto-approuve pas. `gov:pr` rougit
sur les deux cas.

**Les trois lentilles.** Toute PR reçoit trois avis indépendants, portés par A09 : `exactitude` (le code fait-il
exactement ce que disent les REQ citées, ni plus ni moins), `securite` (cloisonnement, défaut = refus, 404
byte-identique, PII, journal, idempotence, absence d'oracle), `simplicite` (dérivation depuis une source unique,
aucune duplication, nommage français conforme). Un même poste apparaît trois fois dans `Relecteur:` : ce sont
trois **lectures** distinctes, pas trois postes distincts — la règle porte sur les lentilles, jamais sur
l'unicité des codes.

**La troisième lentille sur une PR `schema`.** Toute PR touchant `prisma/**` ou `packages/contracts/**` porte
le label `schema`. Sur cette PR, **A02 remplace la lentille `simplicite`** et son approbation est
**bloquante**. Le compte ne change pas : trois lentilles, dont la troisième est tenue par l'architecte. C'est
la formulation de sa fiche (`.claude/agents/architecte.md`), de `docs/CONVENTIONS.md` §5 et de l'acceptation
de GOV-007 — **aucune lentille n'est ajoutée**, l'une d'elles change de titulaire.

**La mutation.** A10 rend un avis distinct, en plus des trois lentilles : chaque garde introduite a été vue
rougir sur une mutation réelle.

**Le veto.** Sur une tâche dont le champ `sensible` contient `argent`, `attribution`, `auth`, `espace` ou
`rgpd`, le refus de la lentille `securite` **bloque à lui seul** ; les deux autres restent à la majorité. Un
veto se justifie par un scénario d'attaque, jamais par une préférence de style. Ces PR portent en plus la
section « Attaque » du gabarit : scénario joué, résultat, qui l'a joué.

**Les suppléances.** Cinq cas, et un seul principe : *un poste n'exerce pas sur sa propre PR le droit ou l'acte
qui lui est réservé — et un poste ne peut pas exercer un acte que son outillage lui interdit.*

| PR dont l'auteur est… | Ce qui lui est retiré | Qui supplée | Pourquoi celui-là |
| --- | --- | --- | --- |
| **A04** `release-manager` | la fusion | **A12** | Le lead tient déjà la file de lot et l'arbitrage ; il applique la même séquence, sans en sauter une étape |
| **A02** `architecte`, sur une PR `schema` | la troisième lentille, bloquante | **A12** (lead de la zone `domaine`), plus **A14** si `packages/contracts/**` est touché | Un contrat vaut des deux côtés : quand l'architecte est l'auteur, c'est l'auditeur d'intégration qui vérifie que le hash rougit encore |
| **A12** `lead` | l'arbitrage après deux tours | **A02** | Une brique fondatrice est une question de conception ; elle remonte à l'architecte, jamais à son auteur |
| **A01** `gardien-spec` | rien de plus que la règle commune | les trois lentilles de **A09**, et **A11** dit ce qui manque | Les registres se relisent comme du code : REQ citées, identifiants qualifiés, valeurs dérivées |
| **A07** `juriste` | l'exécution de la garde et la production du ROUGE | **A10** `verificateur-rouge` | A07 n'a **pas `Bash`** : il ne peut lancer aucun test, donc jamais produire le bloc ROUGE/VERT qu'exige REQ-GOV-012 — et une garde lexicale est un lint, donc soumise à cette exigence. A07 écrit la règle, A10 la voit rougir et signe la ligne `Rouge constaté par:` du gabarit. Sans cette ligne, le seul poste qui tient la charte relationnelle n'aurait aucun chemin de livraison |

> **Ce que la suppléance ne transporte pas.** A04 est privé d'écriture ; A12 ne l'est pas. Quand A12 fusionne à
> la place de A04, la propriété « celui qui fusionne ne modifie pas ce qu'il fusionne » n'est plus tenue par
> l'outillage : elle est tenue par la règle, et elle se vérifie — le sha lu au moment de l'approbation est le
> sha fusionné, et `deploy:verify` le confronte à l'en-tête de build. Une suppléance qui déplacerait le diff
> entre l'approbation et la fusion est un défaut, pas un raccourci.

## 7. Fichiers réservés et label exigé (gate de REQ-GOV-010)

Une PR qui modifie un chemin réservé **sans porter le label du poste** rougit (`gov:pr`, famille
`fichier_reserve_sans_label`). Le label suit le nom de la fiche (`docs/CONVENTIONS.md` §5 : `role:<fiche>`) ;
le code de poste, lui, va dans le champ `Auteur:`. **Ce tableau est lu par le script**, ligne par ligne : le
modifier change ce que la garde exige.

Les six premières lignes sont exactement les six lignes de `docs/CONVENTIONS.md` §8, sans ajout ni retrait. La **septième** est venue avec `partners/ADR-0010` : elle ne vient pas des `CONVENTIONS`,
et elle est écrite ici parce qu'un registre qui peut ABSOUDRE une gate bloquante doit passer
devant un relecteur comme une décision, pas comme une ligne de configuration :

| Chemin réservé | Poste | Label exigé | Où la règle est écrite |
| --- | --- | --- | --- |
| `docs/PLAN-STATE.md` (**dérivé**) | A01 commite, `pnpm plan-state:build` produit | `role:gardien-spec` | `docs/CONVENTIONS.md` §8 |
| `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, `docs/GLOSSAIRE.md`, `docs/PRESEANCE.md` | A01 | `role:gardien-spec` | `docs/CONVENTIONS.md` §8, lot dédié avec `--settings` surchargé |
| `docs/tasks.json` | A01 (composition), jamais un développeur | `role:gardien-spec` | `docs/CONVENTIONS.md` §8 |
| `prisma/**`, `packages/contracts/**` | A02, approbation bloquante | `schema` | `docs/CONVENTIONS.md` §5 et §8 ; `.github/CODEOWNERS` |
| `docs/adr/**` | A02 accepte, A03 indexe | `role:architecte` | `docs/CONVENTIONS.md` §8 |
| `.claude/settings.json`, `.claude/agents/**` | **aucun agent en session** : lot dédié GOV-000 / GOV-023, lancé avec `--settings` surchargé | — | `docs/CONVENTIONS.md` §8 ; `.claude/settings.json` porte lui-même `deny` sur `Write` et `Edit` de ce fichier |
| `config/exemptions-corps-publie.json` | A01 commite ; **approbation bloquante de la lentille `securite`** | — | `partners/ADR-0010` ; `.github/CODEOWNERS` — **le seul fichier du dépôt qui puisse ABSOUDRE un rouge bloquant** : une ligne y transforme un échec de Gate A en vert. `config/entite.json` ne peut que CONTRAINDRE ; celui-ci absout. Le label est celui du poste qui commite, comme les autres registres ; l'approbation bloquante est portée par le protocole de revue et par CODEOWNERS, ce dépôt n'ayant pas de label de rôle pour cette lentille. |

Deux chemins de plus, qui ne viennent pas de `docs/CONVENTIONS.md` §8 mais des fiches — leur source est dite
dans la dernière colonne, et c'est à ce titre qu'ils entrent ici (RM-01) :

| Chemin réservé | Poste | Label exigé | Où la règle est écrite |
| --- | --- | --- | --- |
| `docs/runbooks/**`, `docs/tiers/**`, `CHANGELOG.md` | A03 | `role:documentaliste` | fiche `.claude/agents/documentaliste.md`, section « Ce que tu tiens » |
| `docs/LECONS.md` | A03 | `role:documentaliste` | `docs/REGLES-MAISON.md`, section « Leçons » (l.181-185) — aucune fiche de `.claude/agents/` ne porte ce chemin |
| `docs/maquettes/**` | A06 | `role:ux-redaction` | fiche `.claude/agents/ux-redaction.md` (validation de Will avant attribution) |

La ligne `.claude/**` porte `—` : **aucun label ne l'ouvre**, parce qu'aucun agent en session n'a le droit
d'écrire ces fichiers. `gov:pr` ne compte donc pas de label sur elle ; ce qui la garde, c'est le `deny` de
`.claude/settings.json`, et la garde `gov:autonomie` **le jour où elle sera écrite** (`docs/gates.json` :
`"preuveRouge": null`, tâche GOV-000). Écrire ici qu'elle appartient à A01 aurait déclaré propriétaire un
poste que la matrice d'autonomie empêche d'écrire.

## 8. Le gabarit de PR, et ce que la garde lit vraiment

`.github/PULL_REQUEST_TEMPLATE.md` porte la définition de « terminé » : **huit cases** (REQ-GOV-013), les champs
`Auteur:`, `Relecteur:`, `Couvre:`, le bloc **ROUGE/VERT** verbatim avec sa ligne `Rouge constaté par:`
(REQ-GOV-012, RM-02), le **champ** « Règle maison appliquée » et la section « Attaque » (REQ-GOV-011).

Les huit cases vivent entre les marqueurs `dod:debut` et `dod:fin`, et **nulle part ailleurs** : c'est là que
`gov:pr` compte. La règle maison est un **champ**, pas une case — en case, elle en ferait neuf, et un compteur
naïf validerait une PR à qui il manque une case de la définition. Les noms des marqueurs sont cités ici sans
leurs délimiteurs : un commentaire HTML ne s'imbrique pas, et écrire un délimiteur de fin à l'intérieur du
commentaire d'en-tête du gabarit le refermerait — le reste s'afficherait en clair dans chaque PR et chaque
marqueur existerait en double.

**Quand chaque famille est évaluée.** `gov:pr` n'a pas accès aux mêmes faits à tous les moments :

| Moment | Commande | Ce qui est contrôlé |
| --- | --- | --- |
| Toute PR, dans `gate-a` | `pnpm gov:pr` | la structure (gabarit, CODEOWNERS, §2, §6, §7) ; puis, si l'événement GitHub fournit la PR : titre, champs, huit cases, bloc ROUGE/VERT, section Attaque, labels des chemins réservés |
| Avant la fusion, par A04 | `pnpm gov:pr --pr <numéro>` | tout ce qui précède **plus** les revues : trois lentilles distinctes, l'avis de mutation, l'approbation de A02 sur `schema`, l'auteur qui ne s'auto-approuve pas |
| À chaque exécution de la garde | `pnpm gov:pr:prove` | chaque famille de règle rougit sur son propre témoin, et les contre-témoins restent verts |

Les revues **n'existent pas** au moment où l'événement `pull_request` déclenche la CI : une gate qui les
exigerait serait rouge sur toute PR non encore relue, donc verte de fait au bout de trois jours. C'est
pourquoi elles sont contrôlées par une commande que le release manager lance, et que sa fiche cite au §3.
Cette limite est une **dépendance à un geste humain**, pas une garde : elle est écrite ici pour qu'on ne la
prenne pas pour ce qu'elle n'est pas.

## 9. Ce que cette charte ne fixe pas

- **La correspondance code de poste → compte GitHub, poste par poste.** `.github/CODEOWNERS` ne peut pas
  nommer `@A01`…`@A15` : GitHub ne résout pas ces noms, marque la ligne « Unknown owner » et **ignore la
  règle**. Le fichier livré nomme donc, en règle effective, le seul collaborateur du dépôt
  `will383842/axion-apporteurs` (décision `W13`), et porte le code de poste en commentaire au-dessus de
  chaque chemin. Le jour où un compte par poste existera, seule la colonne des propriétaires changera.
- **La fiche `orchestrateur`** (§4) — **tranché par GOV-023 : elle n'existera pas.** La garde
  `gov:pr` exige une ligne du §2 par fiche, ni plus ni moins : une seizième fiche sans son code au
  §2 ne serait pas un ajout, ce serait une panne — `pnpm gov:pr` rougirait sur tout le dépôt. Sur
  le fond il n'y a pas de trou : le §4 attribue déjà les deux droits de l'orchestrateur (attribuer,
  écrire PLAN-STATE) à **A01 + l'outillage de lot**, et `gov:agents` VÉRIFIE que les neuf droits
  exclusifs du §4 citent des postes qui existent dans `docs/agents.json`. Ce qui manque est un nom
  dans le TEXTE de REQ-GOV-010 — reformulation à faire par le `gardien-spec`, pas une fiche à créer.
- **`docs/LECONS.md`** : livré par **GOV-018** avec sa gate de fraîcheur `gov:lecons` (REQ-GOV-023,
  moitié « leçons »). GOV-008 en fournit la source amont : le journal de session `docs/journal/`.
- **La revue `apporteur-facing` bloquante de A07** (§3) : le label, la section du gabarit et les chemins de
  `CODEOWNERS` sont posés par la tâche juridique qui la porte, pas ici — cette charte ne préempte pas le
  périmètre d'une autre tâche, et elle n'affirme pas non plus que le mécanisme existe déjà.
- **Le contenu des fiches** : elles sont la source (RM-01). Corriger un poste, c'est corriger sa fiche dans le
  lot GOV-023, puis régénérer cette charte.
