# partners/ADR-0010 — Une gate bloquante dont l'exception s'écrit, plutôt qu'une gate qu'on n'exécute pas

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-05 |
| **Décideur** | `architecte` — cet ADR est `propose` : il consigne un arbitrage pris en autopilote, il n'est pas encore accepté |
| **Tâche** | CPL-T01 |
| **Exigences servies** | REQ-GOV-031 |
| **Décisions du registre citées** | W13 — le dépôt est PUBLIC |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

## Contexte

### Le fait qui a tout déclenché

`docs/pr/31.tpl.md` — le gabarit du corps de la PR #31 — était balayé par `gov:entite` : un IBAN à
clé mod-97 valide y aurait fait rougir la garde. **L'artefact que ce gabarit existe pour produire ne
l'était pas.** `pnpm pr:corps` ne figurait dans aucun workflow, et `docs/gates.json` ne portait
aucune entrée pour lui.

Le défaut ne vit pas dans le corps courant. GitHub sert `userContentEdits` — l'historique d'édition
d'un corps de PR — **à quiconque le demande, en GraphQL, sans droit particulier**. Trois révisions du
corps de la PR #31 portent un IBAN à clé mod-97 vraie, masqué depuis dans le corps courant.

> **Masquer ne dépublie pas.** Ce dépôt savait qu'un commit est irréversible ; il ne savait pas
> qu'un corps de PR édité l'est aussi.

La valeur en cause est **fabriquée** — c'était la sonde d'un relecteur, aucun compte n'existe
derrière, il n'y a rien à révoquer. Ce n'est donc pas un incident. C'est un **avertissement gratuit**
avant la phase 2, où la valeur sera celle d'AXION.

### Le piège dans lequel je suis tombé, et qui est le vrai sujet de cet ADR

L'historique d'édition est **immuable**. Une garde qui refuse un corps portant une coordonnée rend
donc `1` sur la PR #31 **pour toujours**. J'ai d'abord conclu qu'il ne fallait pas la câbler en
bloquant : seule la preuve hors ligne entrerait dans Gate A, le mode en ligne se lançant « à la main
avant fusion ».

Cette conclusion est fausse, et sa réfutation tient en une question posée à voix haute :

> **Qui, concrètement, la lancera ?**

Il n'y avait pas de réponse. Un mécanisme dont la partie active est l'attention d'un humain n'est pas
un mécanisme. Et la maison connaît déjà ce motif sous une autre forme : sur `axion-ia`, toutes les
gates de budget portent `continue-on-error: true`, si bien qu'aucune PR alourdissant le bundle ne
rougit — pendant que les revues écrivent depuis des mois « le risque est couvert par la gate ».
**Une gate qui ne bloque pas produit une fausse sécurité, laquelle est pire que pas de gate.**

Mais la crainte qui m'y avait conduit est légitime, et elle est écrite ailleurs dans ce dépôt : *une
gate insatisfiable s'apprend à se sauter*. Une gate rouge que personne ne peut faire verdir est
désarmée dans la semaine, et son désarmement est présenté comme une correction.

**Les deux termes sont vrais en même temps.** C'est la tension que cet ADR tranche.

## Décision

**Le mode en ligne entre dans Gate A comme étape bloquante, et l'exception s'écrit.**

1. `pnpm gov:entite:corps` fait passer le corps **publié** d'une PR **et son historique d'édition**
   par le **même `coordonneesDe`** que les fichiers suivis. Le numéro de PR est **lu dans
   l'événement**, jamais recopié.

2. **Trois codes, et le sens de défaillance est FERMÉ** : `0` conforme, `1` défaut constaté,
   `2` **indéterminé**. Un `2` **fait échouer**. Trois raisons, dans l'ordre :
   - un vert produit par une lecture qui n'a pas eu lieu est le **défaut même** que cette garde
     existe pour empêcher ; l'admettre au niveau de la CI le réintroduit d'un cran plus haut, là où
     personne ne le regarde ;
   - « laisser passer un `2` en le signalant » n'a aucun **mécanisme** : un avertissement dans un
     journal de job n'est lu par personne, et un `2` permanent devient invisible en une semaine.
     La seule chose qui garantisse qu'un `2` se remarque, c'est qu'il bloque ;
   - la lecture **réessaie trois fois** et imprime le numéro d'essai, de sorte qu'une intermittence
     devienne de la latence et jamais une couleur.

3. **`config/exemptions-corps-publie.json` déclare les révisions IRRÉPARABLES.** C'est ce qui rend la
   garde satisfiable sans l'affaiblir. Trois propriétés, chacune décidée contre une tentation :
   - **le grain est la RÉVISION, jamais la PR.** Exempter « la PR #31 » absoudrait d'avance tout ce
     qui reste à y écrire ;
   - **trois clés doivent concorder** — `pr`, horodatage exact, **empreinte SHA-256 complète**.
     Jamais la valeur : la garde imprime l'empreinte dans son message d'échec, pour qu'on n'ait
     jamais à écrire une coordonnée pour déclarer une ligne ;
   - **le corps COURANT n'est jamais exemptable.** Il s'édite. Une exemption qui le couvrirait ne
     serait pas une dette déclarée, ce serait une **permission de publier**. La frontière
     « irréparable / pas encore réparé » est toute la légitimité du registre.

4. **Le vert est bavard.** Quand il repose sur une exemption, il l'affiche — date, propriétaire,
   motif — et le dit en toutes lettres : *« ce vert repose sur une dette DÉCLARÉE, pas sur une
   absence de défaut »*. C'est la contre-mesure au niveau humain, celui que le code ne garde pas.

5. **Ce registre est gouverné comme une source de décision**, parce qu'il en est une. Une mesure de
   la lentille `schema` a montré qu'il ne l'était pas : chaque registre porteur de décision du dépôt
   confronté à cinq surfaces (`CODEOWNERS`, la liste `deny`, le §7 de la charte, `PRESEANCE.md`, un
   ADR) — `docs/DECISIONS.md` et `docs/tasks.json` **5/5**, `config/entite.json` **1/5**,
   `config/exemptions-corps-publie.json` **0/5**. Le seul du dépôt.

   > **La ligne qui sépare les deux cas : `config/entite.json` ne peut que CONTRAINDRE ;
   > `config/exemptions-corps-publie.json` peut ABSOUDRE.**

   Il rejoint donc `.github/CODEOWNERS` et le §7 de la charte, et une ligne qui y est ajoutée passe
   devant un relecteur comme n'importe quelle décision.

## Conséquences

- **Sur la PR #31** : la garde rend `0` grâce à trois lignes de registre, et l'affiche à chaque
  passage. Ces lignes portent `definitive: true` — l'historique d'édition étant immuable, elles ne se
  referment **jamais**. Le drapeau existe pour qu'on ne les relise pas un jour comme un report qu'on
  aurait oublié de solder.
- **Sur les PR futures** : écrire une coordonnée dans un corps de PR devient un défaut **constaté**,
  et le seul remède est de **changer la coordonnée**, pas le texte. La garde le dit explicitement
  dans son message.
- **Coût** : Gate A dépend désormais d'un appel réseau à la forge sur les événements
  `pull_request`. Le job porte des `permissions:` explicites (`contents: read`, `pull-requests:
  read`) : le défaut de `GITHUB_TOKEN` se règle au niveau du dépôt ou de l'organisation, et le jour
  où quelqu'un le passe en restreint, la garde deviendrait insatisfiable sans que personne ne l'ait
  décidé. **Nommer le droit ici, c'est le soustraire à un réglage qu'on ne relit jamais.**
- **Retour arrière** : retirer l'étape de `ci.yml` suffit à désarmer la garde ; c'est un geste d'une
  ligne, visible en revue, et cet ADR est ce qui le rendra discutable plutôt qu'anodin.

## Alternatives écartées

- **Ne pas câbler le mode en ligne, et le lancer à la main.** Écartée : personne ne le lancerait.
  C'est la décision que j'avais d'abord prise, et sa réfutation est au §Contexte.
- **`continue-on-error: true` sur l'étape.** Écartée : c'est précisément le motif qui, sur l'autre
  dépôt de la maison, fait écrire aux revues « le risque est couvert par la gate » sur une gate qui
  ne garde rien.
- **Faire passer un `2` en le signalant** (annotation, label, compteur). Écartée après recherche :
  toutes ces formes reposent sur quelqu'un qui regarde. Aucune n'est un mécanisme.
- **Exempter la PR entière plutôt que les révisions.** Écartée : absoudrait d'avance ce qui n'est pas
  encore écrit.
- **Tronquer l'empreinte à 16 hex** pour la lisibilité. Écartée : 16 hex se collisionnent en 2³²
  essais, et la ligne absoudrait alors une **autre** coordonnée que celle examinée.
- **Supprimer et rouvrir la PR #31** pour effacer l'historique. Écartée : la valeur est fabriquée,
  donc le bénéfice est nul, et le coût est la perte de vingt et une revues et de toute la trace du
  raisonnement — qui est le livrable de cette phase autant que le code.

## Ce qui le vérifie

- `pnpm gov:entite:corps:prove` — **six familles** vues rougir sur une lecture **injectée**
  (coordonnée dans le corps courant, coordonnée dans une révision, lecture impossible, révisions non
  lues, exemption malformée, exemption sans objet) ; **six contre-témoins** verts, dont la forme
  masquée du gabarit et une révision **déclarée** au registre.
- Sur données réelles, PR #31 : registre intact → `0` · une exemption retirée → `1` **sur la seule
  révision redevenue non déclarée**, les deux autres restant couvertes · empreinte périmée → `1`
  **plus** `exemption_sans_objet` · motif vidé → `1` `exemption_malformee` · horodatage inconnu → `1`
  plus `exemption_sans_objet`.
- Le corps courant est inexemptable **par construction** — la garde exige `c.revision`, et la lentille
  `securite` l'a vérifié à la lecture du code, pas sur parole.
- L'appariement des trois exemptions est correct sur le réel : **douze** révisions servies, l'empreinte
  portée par exactement les trois horodatages déclarés.

## Reste à faire

- **Paginer `userContentEdits`.** La lecture demande `first: 100` sans pagination alors que
  `totalCount` compte toutes les éditions : au-delà de cent, `revisions_non_lues` rend `2` **sans
  remède**, aucune exemption ne couvrant cette famille. C'est le **contre-exemple** à la thèse
  « aucun état durable légitime où la CI d'un dépôt public ne peut pas lire le corps de ses PR » —
  cette PR porte déjà douze révisions en une journée, parce que le corps se régénère à chaque tour.
  Le réessai ×3 ne protège pas d'une réponse **stable et incomplète**.
- **Écrire dans le registre ce qu'il ne peut pas prouver** : rien de mécanique ne distingue « valeur
  fabriquée » d'une valeur réelle qu'on n'aurait pas voulu changer, l'empreinte ne pouvant être
  confrontée à rien puisque la valeur réelle ne vit jamais dans le dépôt. Résidu inhérent, à écrire
  plutôt qu'à laisser déduire.
- **`gov:entite:corps` n'a pas d'entrée dans `gates:prouvees`** au titre de son mode en ligne : la
  garde y est déclarée par son script, partagé avec `gov:entite`. À trancher si cela suffit.
