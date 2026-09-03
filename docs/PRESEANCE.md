# Préséance — Axion Apporteurs

> Livré par **GOV-002** (REQ-GOV-002, REQ-GOV-030). Ce fichier répond à une seule question : **quand deux
> documents se contredisent, lequel fait foi ?** Il ne crée aucune règle métier — il désigne, pour chaque
> contradiction connue, le texte en vigueur et la REQ qui le porte.
>
> Écrivain : `gardien-spec`, lot dédié (`docs/CONVENTIONS.md` §8).
>
> Garde et test, livrés avec ce fichier : `scripts/gates/gov-preseance.ts` (sept familles de règle, chacune
> vue rougir sous `--prove`) et `tests/unit/gouvernance/preseance.spec.ts`, qui l'exécute dans la suite.
> Ce que la garde tient est écrit en §6.
>
> Ce dépôt est public : cette table dit **quel texte prime**, jamais les valeurs que ces textes portent
> (REQ-GOV-031, garde `pnpm gov:publication`).

## 1. Les trois règles déjà établies

**Une vue générée ne fait jamais foi contre sa source.** `docs/TASKS.md`, `docs/REQUIREMENTS.md` et
`docs/PLAN-STATE.md` sont réécrits par leur générateur : une correction tapée dans la vue disparaît à la
régénération suivante, sans laisser de trace de son passage. Les sources sont `docs/tasks.json`,
`docs/requirements.json` et — pour l'état vivant — `docs/tasks.json` complété par les issues et par git
(RM-01).

**La préséance interne des exigences est DM > INT > SEC > les autres.** Quand deux exigences décrivent la
même règle, celle du domaine le plus proche de la donnée survit et absorbe l'autre ; l'identifiant absorbé
n'est pas supprimé — il porte un renvoi « → voir REQ-… » et continue de résoudre pour les tâches qui le
citent (`docs/REQUIREMENTS-ANNEXE-FUSIONS.md`).

**Le statut d'une tâche a un seul écrivain.** Trois textes différents portent cette règle, et les
confondre a déjà produit une citation fausse :

- l'enum `StatutTache` et les champs obligatoires d'une tâche sont portés par **REQ-GOV-021** (que
  `docs/GLOSSAIRE.md` §4 cite comme l'exigence de cet enum) ;
- **`pnpm lot:cloture` est l'écrivain** de `statut`, `pr`, `branch` et `owner` dans `docs/tasks.json` :
  c'est l'acceptation de la tâche GOV-000 dans `docs/tasks.json` qui l'écrit, et elle seule ;
- **`docs/PLAN-STATE.md` affiche l'état sans jamais le décider** : l'écriture de l'état vivant passe par
  l'orchestrateur, seul écrivain (**REQ-GOV-007**), et `.claude/settings.json` interdit d'éditer le
  fichier à la main.

## 2. Quand deux documents se contredisent

| # | Document A | Document B | Ce qui prime | Pourquoi |
| ---: | --- | --- | --- | --- |
| 1 | `docs/requirements.json` | `docs/REQUIREMENTS.md` | **A** | Le Markdown est une vue régénérée : la correction qu'on y tape est perdue au rendu suivant, sans laisser de trace de son passage. Aucune garde ne compare aujourd'hui la vue à sa source — voir §5. |
| 2 | `docs/tasks.json` | `docs/TASKS.md` | **A** | Même raison, et les totaux de la vue sont comptés à la génération : trois comptages tenus à la main ont déjà circulé, tous faux. |
| 3 | `docs/tasks.json` | `docs/PLAN-STATE.md` | **A** | `PLAN-STATE.md` est dérivé de `tasks.json`, des issues et de git : il rend l'état, il ne l'écrit pas, et `.claude/settings.json` interdit de l'éditer. |
| 4 | `docs/DECISIONS.md` | tout autre document, sur une **décision** | **A** | Le registre porte la seule marque qu'un test sait lire — la date de la colonne `Tranchée` ; une mention en prose n'a jamais fait rougir quoi que ce soit. |
| 5 | `docs/requirements.json` | `docs/DECISIONS.md`, sur une **règle testable** | **A ou B, selon la colonne `Tranchée`** | **A** quand les deux textes décrivent la même règle et que la ligne du registre n'est pas datée en colonne `Tranchée` : une règle ne se code pas depuis une hypothèse encore ouverte. **B** quand elle l'est : une décision tranchée et datée est le texte en vigueur jusqu'au réalignement de la REQ par le `gardien-spec`. Et en l'**absence** de REQ, c'est l'hypothèse par défaut du registre que le code applique — c'est sa raison d'être, écrite en tête de `docs/DECISIONS.md`. |
| 6 | `docs/requirements.json` | `docs/GLOSSAIRE.md`, sur une **liste de valeurs** | **A** | Les listes du glossaire sont dérivées des exigences qu'il cite (RM-01) : quand elles divergent, c'est le glossaire qu'on régénère, jamais l'exigence qu'on aligne. |
| 7 | `docs/GLOSSAIRE.md` | tout autre document, sur un **terme et ses synonymes interdits** | **A** | Le glossaire est la source du vocabulaire (REQ-GOV-016) : il n'est dérivé de personne sur ce point. L'écart entre une valeur d'enum et le glossaire est tenu par la garde de schéma `partners:schema:enums`, déclarée au registre des gardes **sans preuve rouge** à ce jour : aujourd'hui, rien ne rougit sur un synonyme interdit employé en prose. |
| 8 | `docs/REGLES-MAISON.md` | `docs/CONVENTIONS.md` | **A** | Une convention est la forme que prend une règle maison ; une convention qui l'affaiblit est une convention à corriger, pas une exception à respecter. |
| 9 | `docs/gates.json` | `docs/REGLES-MAISON.md` et `GATES.md`, sur **le nom, le script et la preuve d'une garde** | **A** | `gates.json` est le registre des gardes : une garde citée ailleurs et absente d'ici n'existe pas, et c'est son champ `preuveRouge` — non nul ou non — qui dit si elle a déjà été vue rougir. |
| 10 | `.claude/settings.json` | `docs/CONVENTIONS.md` §7 | **A** | La matrice d'autonomie **est** le fichier de réglages — c'est le registre des gardes qui l'écrit ainsi, à l'entrée `gov:autonomie`, et REQ-CPL-021 exige que cette matrice existe : la prose ne bloque aucun appel, seul le fichier le fait. Cette entrée du registre est déclarée **sans preuve rouge** à ce jour. |
| 11 | Registre (`docs/requirements.json` + `docs/DECISIONS.md`) | documents sources hors dépôt (plan directeur, « fonctionnement », audits, tableaux de bord) | **A** | Ces documents ont été écrits chacun de leur côté ; le registre est le seul endroit où leurs contradictions ont été arbitrées (`DECISIONS.md` §3). |
| 12 | Exigence survivante | exigence absorbée | **A** | L'identifiant absorbé résout encore pour ne pas casser les tâches qui le citent, mais son texte n'est plus celui qu'on code. |
| 13 | Gabarit de contrat (`docs/contrat/`, posé par JUR-T01) | Registre | **aucun des deux** | Un article de contrat engage le réseau : l'écart ne se tranche pas dans un fichier de gouvernance, il ouvre une ligne `avenant` du registre à trancher avant le premier envoi DocuSeal — en attendant, le code suit le registre et l'article n'est pas modifié en silence. |
| 14 | `docs/requirements.json` | `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` | **A** | L'annexe consigne la fusion et son motif ; le texte que le code applique est le champ `texte` du registre — c'est lui, et lui seul, que lit `pnpm gov:requirements`. Les deux divergent déjà : voir §5. |
| 15 | REQ-GOV-031 | `.claude/agents/gardien-spec.md`, ligne `docs/spec/` | **A** | La fiche de rôle confie au `gardien-spec` une « Copie **figée** des 7 documents, avec les bandeaux de préséance ». Une copie figée entre **telle quelle**, avec tout ce que ces documents portent ; or c'est la règle de publication qui décide de ce qui entre dans un dépôt public, jamais une fiche de rôle. Tant que ces sept documents n'ont pas été relus ligne à ligne au regard de REQ-GOV-031, leur copie n'entre pas : c'est la §3 ci-dessous qui fait foi ici. Correction de la fiche : voir §5. |

## 3. Les sept couples de règles connus (REQ-GOV-002)

Chaque couple donne : ce que dit la version périmée, ce qui fait foi, l'exigence qui le porte, et ce qu'un
test vérifie pour que la version retenue reste celle qui tourne.

### 3.1 `quota` — le seuil de dépôt

- **Version périmée.** Les documents sources décrivent un plafond de dépôts au-delà duquel un dépôt est
  refusé.
- **Ce qui fait foi.** Aucun dépôt n'est jamais refusé pour dépassement : au-delà du seuil, l'attribution
  est acceptée, horodatée, opposable, et porte `verificationPrioritaire`. Le dépassement change l'ordre
  dans lequel les dépôts sont qualifiés, pas le droit de l'apporteur.
- **Exigence porteuse.** **REQ-DM-010** (qui absorbe REQ-SEC-015), avec `HYP-D3` pour le calcul du seuil et
  `HYP-E1-11` pour la voie au-delà — un captcha, jamais un refus.
- **Vocabulaire.** « vérification prioritaire » est le terme canonique ; « quota », « limite » et « plafond
  de dépôts » sont des synonymes interdits (`GLOSSAIRE.md` §8).
- **Ce que le test vérifie.** Un dépôt au-delà du seuil produit une attribution acceptée, horodatée et
  opposable, portant `verificationPrioritaire = true` ; aucun chemin ne mène à un état de refus pour
  dépassement (REQ-DM-010, qui absorbe REQ-SEC-015 ; `HYP-E1-11`).

### 3.2 `collision` — deux apporteurs sur le même SIREN

- **Version périmée.** Le second dépôt est refusé ; l'unicité est tenue par un index construit sur une
  liste littérale de deux états.
- **Ce qui fait foi.** Au plus une attribution occupante par SIREN, tenue par un index unique partiel dont
  la liste des sept états occupants est projetée depuis la constante unique `ETATS_OCCUPANTS` ; le dépôt
  suivant entre dans une file d'attente bornée avec promotion automatique ; ce qui est rendu à l'apporteur
  ne dit ni qui, ni quand, ni où en est l'autre.
- **Exigences porteuses.** **REQ-DM-003** (l'index), **REQ-SEC-014** (verrous et concurrence),
  **REQ-SEC-022** et **REQ-JUR-011** (ce que le message ne révèle pas), avec `HYP-C4` pour la file.
- **Ce que le test vérifie.** RM-06 : un test lit `pg_indexes` et compare la définition de l'index en base
  à la constante `ETATS_OCCUPANTS`. L'index proposé par les documents sources couvrait **deux états sur
  sept**, ce qui laissait deux attributions vivantes coexister sur un même SIREN.

### 3.3 `cycle de vie` — les états d'attribution

- **Version périmée.** Chaque document source porte sa propre liste d'états, plus courte, et des
  transitions laissées implicites.
- **Ce qui fait foi.** Un enum fermé de treize états et une matrice `from × événement → to` ; une transition
  absente de la matrice lève une erreur typée et n'écrit rien.
- **Exigence porteuse.** **REQ-DM-006** ; `GLOSSAIRE.md` §1 en est la vue lisible et **REQ-DM-003** en
  découpe le sous-ensemble occupant.
- **Ce que le test vérifie.** RM-04 et RM-06 : l'enum et l'index viennent de la même constante, et la
  matrice est rendue exhaustivement — une liste d'états recopiée diverge de la matrice qui la fait tourner.

### 3.4 `barème` — la grille de commissions

- **Version périmée.** Toute grille retapée dans Partners, et toute valeur citée dans un document de
  spécification.
- **Ce qui fait foi.** Une seule source, `pricing.ts` d'axionia. L'export produit un JSON canonique et son
  empreinte, chargés dans l'entité versionnée `GrilleCommission {version, contenuJson, hash, publieeAt}` ;
  Contrat, Attribution et ligne référencent une version ; Partners ne retape aucune valeur, et l'écran
  Paramètres l'affiche en lecture seule.
- **Exigence porteuse.** **REQ-DM-014** (qui absorbe REQ-GOV-019, REQ-ARG-031 et REQ-JUR-019) ; le
  périmètre commissionné est tranché par W6. `HYP-W6-BIS` traite la ligne sans barème ; le motif qu'elle
  nomme n'est pas une valeur d'enum, voir la puce suivante.
- **Ligne sans barème.** Une ligne dont le palier n'a pas d'entrée dans la grille est `bloquee` avec
  `motifBlocage = a_qualifier` ; « barème indéfini » est un **libellé de cas**, jamais une valeur de
  l'enum `MotifBlocage`, et ce qui est rendu à l'apporteur est « Prestation hors grille de commissions »
  (REQ-ARG-017, REQ-DM-015, REQ-EXT-025, REQ-UX-011). Les textes qui écrivent encore « motif
  `bareme_indefini` » — `HYP-W6-BIS` et `GLOSSAIRE.md` §3 — désignent ce cas ; voir §5.
- **Dépôt public.** Aucune valeur de la grille n'est commitée dans ce dépôt (REQ-GOV-031) : le contenu vit
  dans l'entité `GrilleCommission`, en base. Cette table dit d'où il vient, jamais ce qu'il vaut.
- **Ce que le test vérifie.** RM-01 : l'empreinte embarquée est égale à l'empreinte recalculée depuis
  `pricing.ts`. Deux copies d'un barème divergent toujours, et celle qui est lue n'est jamais celle qui a
  été corrigée.

### 3.5 `naissance de l'attribution`

- **Version périmée.** L'attribution naît définitive au dépôt, et la fenêtre de douze mois court depuis le
  dépôt.
- **Ce qui fait foi.** Le dépôt crée une attribution `provisoire`, horodatée au nom de l'apporteur par le
  serveur et opposable ; elle devient `active` lorsque l'entreprise confirme lors de la qualification ;
  `fenetreFinAt` se calcule depuis `confirmeeAt`, jamais depuis `deposeeAt`.
- **Exigences porteuses.** **REQ-DM-006** (l'état), **REQ-DM-005** (l'horodatage serveur), **REQ-DM-008**
  (la qualification qui confirme), avec `HYP-C1` et `HYP-E1-9`.
- **Réversibilité.** Ces deux hypothèses sont marquées `avenant` : les rouvrir impose une campagne de
  re-signature, elles se tranchent avant le premier envoi DocuSeal.
- **Ce que le test vérifie.** Une attribution non confirmée n'a pas de `fenetreFinAt` ; après une
  qualification `confirme`, `fenetreFinAt` est calculée depuis `confirmeeAt` et jamais depuis `deposeeAt`
  (REQ-DM-005, REQ-DM-006, REQ-DM-008 ; `HYP-C1` et `HYP-E1-9`, marquées `avenant`).

### 3.6 `péremption`

- **Version périmée.** Le chrono court à compter du dépôt — ou de la qualification — quoi qu'il arrive
  ensuite.
- **Ce qui fait foi.** `peremptionAt` reste **null** tant que la Société n'a pas eu son premier contact avec
  l'entreprise déclarée (`premierContactAt`, posé par la Qualification) ; il devient null définitivement dès
  qu'une suite existe (`rdv_pris` ou plus) ; le marqueur `peremptionSuspendueMotifSociete`, posé par un rôle
  habilité, motivé et journalisé, neutralise le chrono ; la durée elle-même vit dans la SSOT sous
  `PEREMPTION_JOURS`, jamais en littéral.
- **Exigence porteuse.** **REQ-DM-007**, avec RM-10 pour la durée.
- **Ce que le test vérifie.** Sans `premierContactAt`, `peremptionAt` est null ; une suite existante le
  remet à null définitivement ; le marqueur posé empêche tout passage en `perimee` au cron ; aucun littéral
  de durée hors SSOT (REQ-DM-007, RM-10).

### 3.7 `zéro arbitrage` — l'exception unique est portée par REQ-DM-034

- **Version périmée.** Le produit rattachait automatiquement une commande à une attribution par lien de
  groupe, quand le contrat disait l'inverse.
- **Ce qui fait foi (REQ-DM-034).** Aucune résolution d'encaissement ne s'arbitre au jugé ; l'unique
  exception est le `RattachementManuel`, décidé par la Société, motivé, tracé, révocable, journalisé et
  notifié à l'apporteur avec son motif. À défaut de résolution, la ligne porte le motif `siren_manquant`
  (REQ-DM-021) et une Anomalie s'ouvre en console — jamais un silence, jamais un rejet. Le registre et son
  annexe de fusion divergent sur le nom de ce motif : voir §5.
- **Exigences porteuses.** **REQ-DM-034** (l'exception et sa trace), **REQ-DM-021** (la résolution qui ne
  devine pas), **REQ-GOV-030** (la garde).
- **Garde.** Toute occurrence de l'expression dans `docs/`, `prisma/` ou `src/` cite `REQ-DM-034` sur la
  même ligne ou la ligne suivante (REQ-GOV-030). C'est la première des sept familles de
  `scripts/gates/gov-preseance.ts` — voir §6.

## 4. Bandeaux

Un bandeau se pose **en tête du fichier**, ou **juste sous le titre de la section** visée, avant toute
autre ligne. Il dit trois choses et rien d'autre : que le texte qui suit n'est plus la référence, quel
texte l'est, et à quelle date il a été remplacé.

Trois familles de cibles, qui ne se traitent pas de la même façon :

- **Les vues générées** (§4.1) portent déjà leur bandeau, **émis par leur générateur**. On ne le colle
  jamais à la main : le rendu suivant l'écraserait, et deux de ces fichiers sont en `deny` d'écriture dans
  `.claude/settings.json`.
- **Le gabarit de contrat a sa place dans le dépôt**, sous `docs/contrat/` — chemin que
  `scripts/gates/gov-publication.ts` déclare exempt, et que la tâche JUR-T01 pose. Le bandeau s'y pose donc
  **en dépôt**, avec cette tâche, l'article sous les yeux.
- **Les documents « fonctionnement », le plan directeur, les audits et les tableaux de bord** ne sont pas
  dans ce dépôt public (REQ-GOV-031) : le bandeau se pose sur la copie de travail hors dépôt, et c'est la
  §3 ci-dessus qui fait foi ici.

### 4.1 Vue générée — bandeau ÉMIS PAR LE GÉNÉRATEUR, jamais collé

Ce bandeau est produit par la commande qui rend le fichier : `pnpm gov:tasks --render` pour
`docs/TASKS.md`, la conversion du registre pour `docs/REQUIREMENTS.md`, `pnpm plan-state:build` pour
`docs/PLAN-STATE.md`. Les trois le portent déjà, chacun dans sa formulation. La forme de référence est
celle-ci ; la faire évoluer, c'est modifier le **générateur**.

```markdown
> ⚠️ **Ce fichier est une VUE. La source est `<chemin de la source JSON>`.**
> Il est réécrit par `<commande de génération>`, jamais à la main : une correction tapée ici disparaît à la
> régénération suivante. En cas d'écart entre cette vue et sa source, **la source fait foi** — voir
> `docs/PRESEANCE.md` §2.
```

### 4.2 Document supersédé — en tête du fichier entier

```markdown
> 🛑 **Ce document ne fait plus foi.** Il est conservé pour son historique et pour les identifiants qu'il a
> nommés. Le texte en vigueur est le registre des exigences (`docs/requirements.json`) et le registre des
> décisions (`docs/DECISIONS.md`) ; l'arbitrage document par document est dans `docs/PRESEANCE.md`.
> Remplacé le <AAAA-MM-JJ> par <ID-TÂCHE>. Ne rien coder depuis ce fichier.
```

### 4.3 Section remplacée par une exigence

```markdown
> 🛑 **Section périmée — remplacée par REQ-<DOMAINE>-nnn.** Ce qui suit a été arbitré : le texte en vigueur
> est celui de `REQ-<DOMAINE>-nnn` dans `docs/requirements.json`. La contradiction et son arbitrage sont
> consignés dans `docs/PRESEANCE.md` §3. Remplacée le <AAAA-MM-JJ> par <ID-TÂCHE>.
```

### 4.4 Section dominée sur un point — le reste du texte tient

```markdown
> ⚠️ **Section dominée sur un point.** Le texte de cette section reste en vigueur, **sauf** sur <la règle en
> cause>, où `REQ-<DOMAINE>-nnn` prime — voir `docs/PRESEANCE.md` §3. Aucune autre partie de la section
> n'est affectée : ne pas la lire comme abrogée.
```

### 4.5 Identifiant absorbé — dans le registre des exigences

```markdown
> **Identifiant conservé, texte non en vigueur.** `REQ-<DOMAINE>-nnn` est absorbée par
> `REQ-<DOMAINE>-mmm` : l'identifiant continue de résoudre pour les tâches qui le citent, et le texte à
> coder est celui de la survivante. **→ voir REQ-<DOMAINE>-mmm.**
```

### 4.6 Écart contractuel — sur un article du gabarit de contrat

```markdown
> ⚠️ **Écart connu entre cet article et le produit.** L'article reste le texte qui engage le réseau ;
> l'écart est enregistré au registre des décisions comme une ligne `avenant`, à trancher avant le premier
> envoi DocuSeal. Tant qu'elle n'est pas tranchée, le code suit le registre et l'article n'est pas modifié
> en silence. Voir `docs/DECISIONS.md` et `docs/PRESEANCE.md` §2, ligne 13.
```

### 4.7 Où chaque bandeau se pose

**Comment cette colonne se remplit — et pourquoi deux cases restent vides.** « Ce qui prime » n'est pas
choisi par thème : il se **lit** dans le champ `source` du registre, qui nomme la section d'origine de
chaque exigence. Deux des six cibles de l'acceptation ne résolvent nulle part — ni en `source`, ni ailleurs
dans le dépôt : la case reste ouverte, et le point est remonté en §5, il n'est pas deviné.

| Document et section | Bandeau | Ce qui prime | Arbitrage écrit en | État |
| --- | --- | --- | --- | --- |
| « fonctionnement §3.2 » | §4.3 | **indéterminé** — aucune exigence ne nomme cette section, ici ou ailleurs | §5, point 2 | **stop** |
| « fonctionnement R3 » — horodatage, verrous, secret de la file | §4.3 | REQ-DM-005, REQ-SEC-012, REQ-SEC-014, REQ-JUR-011, REQ-GOV-030 — les cinq exigences qui nomment cette section en `source` | §3.2, §3.5 et §3.7 | à poser hors dépôt |
| « fonctionnement R5 » | §4.3 | **indéterminé** — aucune exigence ne nomme cette section, ici ou ailleurs | §5, point 2 | **stop** |
| « fonctionnement §9 » — états d'attribution | §4.3 | REQ-DM-006 | §3.3 | à poser hors dépôt |
| Contrat art. 1.2 — définitions | §4.4, puis §4.6 si l'écart subsiste | le vocabulaire : le terme canonique du glossaire (REQ-GOV-016), et REQ-JUR-041 sur les documents remis à l'apporteur. Aucune exigence ne cite cet article en `source` ; deux le citent dans leur texte — REQ-JUR-041 et REQ-CPL-023 — et toutes deux sur ce seul point | §2, ligne 7 | à poser dans `docs/contrat/` avec JUR-T01, l'article sous les yeux |
| Contrat art. 1.5 — dépôt et horodatage | §4.4, puis §4.6 si l'écart subsiste | REQ-DM-005 et REQ-UX-013 — les deux exigences qui nomment cet article en `source` | §3.5 | à poser dans `docs/contrat/` avec JUR-T01 |
| `docs/TASKS.md`, `docs/REQUIREMENTS.md`, `docs/PLAN-STATE.md` | §4.1 | leur source JSON | §2, lignes 1 à 3 | **déjà posé, par le générateur** |
| Exigences absorbées du registre | §4.5 | l'exigence survivante | §2, ligne 12 | **déjà posé** par GOV-001 |

## 5. Ce qui reste à faire

1. **Inscrire la garde au registre.** `scripts/gates/gov-preseance.ts` et
   `tests/unit/gouvernance/preseance.spec.ts` sont livrés ici ; il reste l'entrée `gov:preseance` dans
   `docs/gates.json` (script, tâche GOV-002, `fixtureRouge`, `preuveRouge`), l'alias `pnpm gov:preseance`
   dans `package.json`, et l'étape correspondante dans `.github/workflows/ci.yml`, le job de Gate A.
   Ce qui se vérifie : `docs/gates.json` est en `deny` de `Write`/`Edit` dans `.claude/settings.json`,
   et l'acceptation de GOV-000 énumère une liste **fermée** de huit scripts où `gov:preseance` ne
   figure pas ; GOV-000 porte en outre `"statut": "fusionnee"`.
   Ces trois écritures n'ont donc **aucun porteur vivant** dans `docs/tasks.json` : elles ont été
   faites à l'intégration du lot, sous la tâche propriétaire de la garde, comme les quatre gardes
   déjà au registre l'ont été avant elle. En attendant, la garde tourne dans la CI : le test
   l'exécute sous `pnpm test`, dans ses deux modes.
2. **Deux bandeaux sur six ne peuvent pas être nommés — stop.** L'acceptation de GOV-002 vise
   « fonctionnement §3.2/R3/R5/§9 ». Deux résolvent depuis le champ `source` du registre : « R3 » vers
   REQ-DM-005, REQ-SEC-012, REQ-SEC-014, REQ-JUR-011 et REQ-GOV-030 ; « §9 » vers REQ-DM-006. Les deux
   autres ne résolvent nulle part : les chaînes « fonctionnement §3.2 » et « fonctionnement R5 »
   n'apparaissent dans aucun fichier du dépôt **hormis l'acceptation elle-même**, et le document qui porte
   ces sections vit hors de ce dépôt public. La règle qui prime sur ces deux sections ne peut donc être
   nommée ni depuis le registre, ni depuis le dépôt.
3. **Le motif d'un encaissement non résolu porte deux noms.** Le champ `texte` de REQ-DM-021 écrit
   `siren_manquant`, motif **absent** de l'enum `MotifBlocage` de REQ-ARG-017 ;
   `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` écrit `non_resolue` pour le même cas, valeur qui, elle, figure
   bien à l'enum. Par la ligne 14 de la §2, c'est le champ `texte` du registre qui est appliqué — d'où la
   rédaction de la §3.7. L'alignement des trois textes revient au `gardien-spec`.
4. **`MotifBlocage` n'a pas la même longueur selon le document.** REQ-ARG-017 arrête neuf valeurs et retire
   nommément `mandat_non_signe` ; `docs/GLOSSAIRE.md` §3 en liste quatorze, dont `mandat_non_signe`,
   `bareme_indefini`, `plafond`, `regime_tva_inattendu` et `ttc_manquant`. Par la ligne 6 de la §2,
   l'exigence prime : c'est le glossaire que le `gardien-spec` régénère. `HYP-W6-BIS`, qui écrit encore
   « motif `bareme_indefini` », désigne le cas et non une valeur d'enum (§3.4).
5. **Aucune garde ne compare `docs/REQUIREMENTS.md` à `docs/requirements.json`.** Le bandeau de la vue
   affirme pourtant que « la cohérence des deux est tenue par `pnpm gov:requirements` » ; les contrôles
   énumérés par le registre des gardes pour cette garde ne comparent jamais la vue à sa source. À aligner
   par le `gardien-spec` — soit en corrigeant le bandeau du générateur, soit en ajoutant une entrée au
   registre des gardes avec sa preuve rouge.
6. **La fiche de rôle du `gardien-spec` confie `docs/spec/`** : une « Copie **figée** des 7 documents, avec
   les bandeaux de préséance ». Elle contredit REQ-GOV-031 (ligne 15 de la §2). Correction à porter par
   GOV-000 / GOV-023, qui tiennent `.claude/agents/`.
7. **`IssueDepot` : le glossaire garde trois valeurs que l'exigence a renommées.** `docs/GLOSSAIRE.md` §4
   énumère `fermee`, `financeur` et `deja_connue`, que REQ-UX-002 déclare renommées sur les catégories des
   articles 3.3 et 3.3 bis. Par la ligne 6 de la §2, l'exigence prime.
8. **Deux plafonds d'estimation cohabitent.** REQ-GOV-021 fixe l'estimation d'une tâche à un jour au plus,
   tandis que la garde `pnpm gov:tasks` et la vue `docs/TASKS.md` appliquent un jour et demi. Par la
   ligne 9 de la §2, `gates.json` fait foi sur le nom et l'existence d'une garde, jamais sur le contenu de
   la règle qu'elle applique : c'est l'exigence ou la garde qu'il faut aligner, et l'écart revient au
   `gardien-spec`.

## 6. Ce que la garde tient (`scripts/gates/gov-preseance.ts`)

Sept familles de règle, chacune avec son témoin sous `--prove`, et des contre-témoins qui doivent rester
verts. Une famille sans témoin fait échouer la preuve (RM-02).

| Famille | Ce qu'elle refuse | Portée |
| --- | --- | --- |
| `expression_sans_ancre` | l'expression arbitrée en §3.7 écrite sans `REQ-DM-034` sur la même ligne ou la suivante | fichiers suivis sous `docs/`, `prisma/`, `src/` (REQ-GOV-030) |
| `couple_absent` | l'une des sept clés de REQ-GOV-002 sans sous-section en §3 | `docs/PRESEANCE.md` |
| `couple_sans_exigence` | une sous-section de §3 qui ne nomme aucune exigence | `docs/PRESEANCE.md` |
| `table_trop_courte` | moins de sept couples arbitrés en §2 (acceptation de GOV-002) | `docs/PRESEANCE.md` |
| `exigence_inconnue` | un identifiant `REQ-…` cité ici et absent de `docs/requirements.json` | `docs/PRESEANCE.md` |
| `garde_non_prouvee_invoquee` | une garde dont `docs/gates.json` porte `preuveRouge: null`, citée entre accents graves sans être dite **sans preuve rouge** | `docs/PRESEANCE.md` |
| `colonnes_incoherentes` | une ligne de tableau qui n'a pas le nombre de colonnes de son en-tête — une barre verticale non échappée dans une cellule, que les accents graves ne protègent pas | `docs/PRESEANCE.md` |

Deux exemptions, écrites et bornées, pour la famille `expression_sans_ancre` : `docs/requirements.json` et
sa vue `docs/REQUIREMENTS.md`. Le registre est l'endroit où la règle est **définie** — REQ-GOV-002 énumère
les sept clés, REQ-DM-034 énonce l'exception — et l'ancre y est portée par la structure du document, non
par le voisinage de ligne. C'est la même exemption, pour la même raison, que `gov:identifiants` accorde au
registre.
