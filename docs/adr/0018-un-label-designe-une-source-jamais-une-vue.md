# partners/ADR-0018 — un label de rôle désigne une SOURCE, jamais une vue dérivée

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-22 |
| **Décideur** | `architecte` — seul rôle qui fait passer un ADR à `accepte` (REQ-GOV-010). |
| **Tâche** | GOV-090 |
| **Exigences servies** | REQ-GOV-010, REQ-GOV-032, REQ-GOV-008 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01 (une écriture, les autres dérivent) |
| **Remplace / remplacé par** | — |

## Contexte

`docs/CHARTE-AGENTS.md` §7 tient le tableau des chemins réservés. Une PR qui touche l'un d'eux sans
porter le label du poste rougit (`gov:pr`, famille `fichier_reserve_sans_label`, REQ-GOV-010).

**Le fait qui a ouvert le dossier.** La définition de « terminé » exige, sur **chaque** PR, que
`docs/PLAN-STATE.md` soit régénéré. Ce fichier était au tableau §7. Toute PR conforme devait donc
porter `role:gardien-spec`, quel que soit son auteur réel — un label posé par construction ne
désigne plus personne.

**Ce qui a été mesuré avant de trancher, et qui a démoli l'argument de départ.**

1. **Le label n'est pas muet à cause de `PLAN-STATE`.** Sur les 34 PR fusionnées depuis la #26,
   **34 portent `role:gardien-spec` — 100 %**. 33 touchent `docs/PLAN-STATE.md`, mais **29 touchent
   aussi `docs/tasks.json`**, réservé au même label et réécrit par `lot:cloture` sur presque chaque
   PR. **Cinq PR seulement** (#29, #39, #41, #44, #45) devaient le label à `PLAN-STATE` seul.
   Retirer cette ligne change donc le label sur **5 PR sur 34**, et le laisse à **85 %**.
2. **`PLAN-STATE` n'était pas la seule vue du tableau.** `docs/REQUIREMENTS.md` en est une aussi —
   son en-tête dit « Ce fichier est une VUE. La source est `docs/requirements.json` » — et elle
   occupait la deuxième ligne. « Les vues ne sont pas au tableau » n'était donc pas un principe que
   le tableau tenait.
3. **Et la faute était plus grave dans l'autre sens.** `docs/requirements.json`, **source des 355
   exigences**, ne figurait ni au §7, ni aux `CONVENTIONS` §8, ni dans `.github/CODEOWNERS`, ni dans
   le `deny` de `.claude/settings.json`. `docs/gates.json`, source elle aussi, n'était que dans le
   `deny`. **Le tableau protégeait deux ombres et laissait deux corps ouverts.**
4. **Le label n'a jamais été le dernier filet sur `PLAN-STATE`.** `.claude/settings.json` porte déjà
   `Write` et `Edit` de ce fichier en `deny` : aucun agent en session ne peut l'éditer par ces
   outils. Le label n'ajoutait rien que le `deny` ne fasse, et le `deny` est le seul des quatre
   registres qui arrête une frappe.
5. **REQ-GOV-010 elle-même contredit le tableau** : elle donne `PLAN-STATE` à l'**orchestrateur** et
   ne nomme pas `docs/tasks.json` parmi les fichiers du gardien du spec. ⚠️ La question du **nom**
   (créer la fiche `A16`, ou reformuler l'exigence) a déjà un porteur — **GOV-023**, et le §4 de la
   charte le dit. **Cet ADR ne la rouvre pas.** Il tranche une autre question, que rien ne
   tranchait : *une vue dérivée est-elle réservable ?*

**Le trou qu'ouvre le retrait, et sa taille réelle.** `pnpm plan-state:verifier` compare la vue
octet par octet **sauf** les rubriques que le générateur nourrit hors du dépôt, via `forge` ; il les
imprime sous `NON COMPARÉ`. Mesure du 2026-09-22 : **5 rubriques sur 14** (« File de fusion »,
« Revendications », « Décisions du jour », « Prochain pas », « Dernier atterrissage ») et 5 lignes du
bloc de reprise sur 10. Or **REQ-GOV-032 exige la comparaison « d'un seul octet »** : ces exemptions
sont une non-conformité mesurée à une exigence active, et elles l'étaient avant cet ADR.

⚠️ Le trou est plus étroit qu'il n'y paraît, et il faut le dire : l'exemption est **dérivée** (seul
ce qui a réellement lu la forge est exempté), `neutraliser()` et `horsDeSaZone` refusent déjà tout
`<`, toute liste, toute citation et tout saut de ligne dans une zone exemptée, et un témoin rend la
vue sous deux forges pour exiger que tout élément exempté change. **Ce qui échappait, c'est la prose
libre d'une ligne qui ne lit rien de la forge** — et il y en a beaucoup : la doctrine de la rubrique
« Revendications » (« Deux sources, aucune troisième… ») tient en une ligne de 450 caractères que
personne ne comparait.

## Décision

**Le tableau du §7 est celui des SOURCES. Un label répond à « qui répond de ce texte ? », et personne
ne répond d'une vue : une vue a un générateur et un mode de vérification.**

1. `docs/PLAN-STATE.md` et `docs/REQUIREMENTS.md` **sortent** du tableau §7 et des `CONVENTIONS` §8
   comme chemins étiquetés. Leur dérive reste un rouge nommé — `plan-state:verifier` et
   `gov:requirements --verifie-rendu`, REQ-GOV-032 — et ce rouge-là, lui, désigne quelque chose.
2. `docs/requirements.json` et `docs/gates.json` **entrent**, `role:gardien-spec`. Ce sont les
   sources dont l'édition est l'acte réel. Le geste est donc **net-neutre à légèrement plus strict**,
   et non un relâchement : deux lignes sortent, deux lignes entrent, et deux sources cessent d'être
   ouvertes.
3. **Le trou `NON COMPARÉ` se ferme là où il vit**, pas par un label : l'attribution des lectures de
   la forge descend de la RUBRIQUE à la LIGNE. Le mécanisme n'est pas neuf — c'est celui que le bloc
   de reprise applique déjà, et dont le générateur écrit lui-même la règle : « ce qu'elle lit de la
   forge lui est attribué, et ce qu'elle ne lit pas la laisse COMPARÉE. Aucune ligne n'est classée à
   la main. » Il n'avait jamais été appliqué aux corps de rubriques.
4. `hors-depot/` devient un **qualifiant de référence croisée**, au même rang que `axionia/`, `ops/`
   et `partners/` (REQ-GOV-008). Les verbes d'écriture du registre se citent `hors-depot/<verbe>`, et
   jamais par un chemin relatif au dépôt.

## Conséquences

**Ce que la décision NE règle pas, et il faut le lire ici plutôt que de le croire réglé.** Après ce
geste, **29 PR sur 34 porteraient encore `role:gardien-spec`**, par `docs/tasks.json`. **Le label
reste muet à 85 %.** Le dé-mutiser demande un autre discriminant — *le label est dû quand le fichier
réservé est édité À LA MAIN, pas quand il est écrit par son geste sanctionné* — dont le mécanisme est
un rendu canonique du registre re-calculé par une garde. **Ce n'est pas livré ici** : cela touche les
verbes hors dépôt, et une tâche séparée le porte. Écrire cet ADR sans cette phrase aurait fait passer
la PR pour la solution d'un problème qu'elle n'a pas résolu.

**Resserrement assumé.** `docs/gates.json` réservé signifie que toute PR qui verse une entrée de
registre porte le label. La fixture `PR_ORDINAIRE` de `gov:pr --prove` a dû le recevoir : QA-T01
déclare ce fichier. Une entrée de `gates.json` peut porter `horsCi`, c'est-à-dire **dispenser une
garde de tourner en CI** — un fichier qui peut exempter mérite un porteur nommé.

**Un piège de grammaire, trouvé en écrivant les deux lignes neuves.** La première colonne du tableau
§7 est **découpée sur la virgule** par `cheminsReserves()`. Une virgule posée dans une parenthèse
explicative coupait la cellule en deux morceaux dont aucun n'était un chemin : la ligne **cessait de
garder son fichier sans que rien ne rougisse**. Le lecteur retire désormais les parenthèses **avant**
de découper, et un témoin de `gov:pr --prove` écrit la ligne avec la virgule piégée et exige que le
chemin reste gardé. Vu rougir par mutation : avec l'ordre d'origine, « le témoin de
`fichier_reserve_sans_label` n'a PAS fait rougir sa famille ».

**Retour arrière.** Remettre les deux vues au tableau et retirer les deux sources : quatre lignes
dans deux fichiers. Le coût réel du retour est ailleurs — il faudrait aussi défaire l'attribution
par ligne du générateur, et rouvrir la non-conformité à REQ-GOV-032.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Retirer `docs/PLAN-STATE.md` du tableau, et rien d'autre | **Mesuré : cela change le label sur 5 PR de 34 et le laisse à 85 %.** Le geste aurait eu l'air de régler la contradiction sans rien dé-mutiser, et il aurait laissé `docs/requirements.json` ouvert. Un correctif qui soulage le symptôme le plus visible est le plus difficile à rouvrir ensuite. |
| Réserver **toutes** les vues dérivées, par cohérence | Rend le label muet sur sept fichiers au lieu d'un, et consacre l'idée qu'on peut répondre d'un texte qu'aucun humain n'écrit. Une cohérence obtenue en généralisant la faute. |
| Garder la ligne et compenser uniquement | Ne répond pas à la question posée — *que désigne le label ?* — et laisse le tableau affirmer un propriétaire pour un fichier qui n'en a pas. La compensation, elle, est retenue : elle est au point 3 de la décision. |
| Faire **entrer les verbes d'écriture dans le dépôt** (défaut B) | **Refusée pour une raison mécanique, pas par prudence.** `.claude/settings.json` met `docs/tasks.json`, `docs/gates.json` et `docs/requirements.json` en `deny` sur `Write` et `Edit`, mais porte en **`allow`** `Bash(node scripts/*)` et `Bash(pnpm *)`. Importer les verbes sous `scripts/` placerait un écrivain qui **contourne le `deny`** à l'intérieur de l'allow-list, en un seul geste. Ce n'est pas un risque, c'est la défaite du mécanisme. |
| Exempter du balayage les citations déjà écrites | Une exception nommée le jour de la livraison est le premier cran du label muet. Le balayage n'a **aucune** exception — il a d'ailleurs épinglé un commentaire de cette même livraison, qui a été reformulé plutôt qu'exempté. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/citation-d-outil-hors-depot.spec.ts` ·
  `it('REQ-GOV-008 — aucun fichier suivi ne nomme un verbe en chemin relatif au depot')` : le
  balayage part de `git ls-files` et de l'inventaire, jamais d'une chaîne cherchée à la main.
- **Assertion** — `tests/unit/gouvernance/plan-state-rubrique-exemptee.spec.ts` ·
  `it('REQ-GOV-032 — une ligne de rubrique exemptée qui ne lit pas la forge est COMPARÉE')` : la
  prose libre d'une rubrique exemptée n'échappe plus au vérificateur.
- **Assertion** — `scripts/gates/gov-pr.ts --prove`, témoin `fichier_reserve_sans_label` avec la
  virgule piégée dans la parenthèse : la grammaire de la première colonne est gardée.
- **`hors-code`** pour le point 1 de la décision — *qu'une vue n'ait pas de porteur* est une règle
  d'attribution, pas un comportement : ce qui est vérifiable, et l'est, c'est que la table produise
  les chemins attendus (témoin ci-dessus) et que la dérive des vues rougisse (REQ-GOV-032).

## Reste à faire

- **Le discriminant du label** — `role:gardien-spec` dû seulement sur une édition manuelle, par un
  rendu canonique du registre confronté par une garde. Tâche séparée ; touche les verbes hors dépôt.
- **`chemin_declare_irresolvable` à la clôture.** Mesuré : **201 des 244 tâches `partners`** déclarent
  au moins un `paths` qui ne résout pas — dont **189 `a_faire`**, où c'est **correct** (un `paths` est
  la promesse d'un fichier à écrire). Une règle d'existence naïve rougirait sur 201 tâches et serait
  désarmée le jour même. Le discriminant est le **moment** : un chemin doit résoudre **à la clôture**.
  Elle part avec un plancher déclaré et un rattrapage nommé pour les **12 tâches déjà `fusionnee`**
  dont le `paths` porte un placeholder (`docs/gouvernance/GOV-0xx`, `scripts/gates/QA-T00`).
  ⚠️ C'est la **deuxième occurrence** de la même famille : `GOV-063` déclare `docs/adr/partners/`, qui
  n'existe pas, et `gov:pr` ne s'en plaint pas — sa confrontation va **fichier → chemin déclaré**, à
  sens unique, et `docs/` est de toute façon hors de `PERIMETRE_DU_CODE`. Le fichier concerné est bien
  couvert, mais par un tout autre mécanisme : la ligne `docs/adr/**` du §7. Le `paths` est inerte dans
  les deux sens.
- **La 8ᵉ case de la définition de terminé atteste l'inattestable** — **troisième occurrence de la
  famille**, mesurée le 2026-09-22 : la case exige que « l'en-tête de build porte le sha fusionné »,
  or `x-partners-build-sha` n'existe **nulle part dans le code** — ni workflow de déploiement, ni
  script. La case ment à la lettre sur chaque fusion, et aucune garde ne le voit. Hors périmètre de
  GOV-090 ; à porter par une tâche.
- **Les treize lignes des sept verbes hors dépôt** qui prescrivent une commande de ce dépôt : aucun
  témoin d'ici ne peut les lire. Le périmètre d'une garde s'arrête au dépôt alors que l'outillage
  déborde ; l'inventaire `VERBES_HORS_DEPOT` est une **copie datée**, pas une garde, et cette
  asymétrie est une dette résiduelle assumée.
- **`.claude/settings.json`** : y ajouter `Write`/`Edit` de `docs/requirements.json`,
  `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`. Ce fichier n'appartient ni à l'architecte ni à
  l'orchestrateur — lot dédié GOV-000 / GOV-023, `--settings` surchargé.
