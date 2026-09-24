# partners/ADR-0019 — un label de rôle désigne une SOURCE, jamais une vue dérivée

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
4. **Le label n'a jamais été un filet sur `PLAN-STATE` — il n'en est pas un du tout.** La famille
   `fichier_reserve_sans_label` vérifie qu'une PR **porte** un label. Le label se pose par
   `gh pr create --label` ou `gh label`, l'un et l'autre en `allow` de `.claude/settings.json` :
   **l'auteur de la PR se l'attribue à lui-même en un geste.** C'est une déclaration d'imputation,
   pas une barrière, et `gov-pr.ts` l'écrivait déjà — « le label seul est le plus faible des trois :
   il se pose à la main, donc il s'oublie à la main ». Ce que le retrait de la ligne coûte, c'est
   ce signal-là, et rien de plus. `.claude/settings.json`, lui, porte `Write` et `Edit` de ce
   fichier en `deny`. ⚠️ **Et ce `deny` est un registre DÉCLARÉ, pas une barrière universelle** : il
   n'arrête une frappe que dans une session dont le répertoire de projet est la racine de ce dépôt,
   et rien ici ne mesure qu'il y soit chargé. L'écrire autrement serait, une fois de plus, affirmer
   une protection qu'on n'exerce pas — le défaut même que cet ADR répare.
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
   ⚠️ **Ce rouge ne couvre pas tout `docs/PLAN-STATE.md`, et la phrase précédente ne doit pas se
   lire comme s'il le couvrait** : ce que `plan-state:verifier` compare et ce qu'il laisse libre est
   écrit en toutes lettres sous « Ce que `plan-state:verifier` couvre, et ce qu'il ne couvre pas »,
   dans les conséquences, avec l'attaque qui reste possible. `gov:requirements --verifie-rendu`,
   lui, ne confronte la vue qu'à sa source — il ne dit rien de la source, qui est précisément ce
   que le point 2 réserve.
2. `docs/requirements.json` et `docs/gates.json` **entrent**, `role:gardien-spec`. Ce sont les
   sources dont l'édition est l'acte réel. Le geste est donc **net-neutre à légèrement plus strict**,
   et non un relâchement : deux lignes sortent, deux lignes entrent, et deux sources cessent d'être
   ouvertes.
3. **Le trou `NON COMPARÉ` se rétrécit là où il vit**, pas par un label : l'attribution des lectures
   de la forge descend de la RUBRIQUE à la LIGNE, et seules les lignes **émises sans condition**
   sont comparées, **par présence** et non par position. Le mécanisme n'est pas neuf — c'est celui que le bloc
   de reprise applique déjà, et dont le générateur écrit lui-même la règle : « ce qu'elle lit de la
   forge lui est attribué, et ce qu'elle ne lit pas la laisse COMPARÉE. Aucune ligne n'est classée à
   la main. » Il n'avait jamais été appliqué aux corps de rubriques.
   **Et la règle a une conséquence sur la façon d'ÉCRIRE le générateur, qui est la moitié du
   remède** : une prose invariante posée à l'intérieur d'une branche que la forge décide est
   exemptée par sa seule PRÉSENCE. Elle se sort donc de la branche. Les **cinq** rubriques exemptées
   sont converties — aucune ne reste sous `NON CONVERTI` — et les doctrines d'ordre de fusion, du
   pas suivant, du jour des décisions et du SHA d'atterrissage sont désormais émises hors de toute
   condition, donc comparées octet par octet.
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

**⚠️ LA PREMIÈRE ÉCRITURE DU POINT 3 ÉTAIT FAUSSE, ET C'EST UN TÉMOIN EXISTANT QUI L'A DIT.**
Elle comparait les lignes **par position**, et refusait qu'une rubrique exemptée change de nombre
de lignes. Le témoin « exemption portante » de `vues-derivees.spec.ts` — qui rend la vue sous DEUX
forges — l'a fait rougir immédiatement : « File de fusion » porte **8 lignes sous une forge et 3
sous l'autre**, puisqu'elle en écrit une par PR ouverte. Dans ces rubriques, **le nombre de lignes
est lui-même une valeur de la forge**, donc la position d'une ligne aussi.

La seconde erreur était plus profonde et vient du même témoin : **une prose émise dans une branche
que la forge décide dépend de la forge par sa PRÉSENCE**, même si son texte n'en porte aucune
valeur. `if (!forge.file().length)` choisit entre « Aucune PR ouverte » et le tableau : les deux
proses sont littérales, aucune des deux n'est comparable. La règle finale ne compare donc que les
lignes **émises sans condition**, et la comparaison se fait **par présence, jamais par position**.

**⚠️ LE PREMIER TOUR NE CONVERTISSAIT QUE DEUX RUBRIQUES SUR CINQ, ET SON COMPTEUR NE LE DISAIT
PAS.** Le vert imprimait « 1 ligne comparée » — **seul des quatre compteurs de cette sortie à ne
pas porter sa population**. Un compteur sans dénominateur ment par omission : « 1 » se lit comme un
succès alors qu'il ne dit rien du reste. Deux lentilles l'ont refusé, et sur les deux points — la
mesure ET la couverture.

**Ce que ça coûte, dit en chiffres plutôt qu'en intention, et rejoué sur la tête de branche.**
Commande : `pnpm plan-state:verifier`, le 2026-09-24.

- **avant** (`c83b8d3`) : `1 ligne(s) COMPARÉE(S) À L'INTÉRIEUR des rubriques exemptées`, sans
  dénominateur, et `NON CONVERTI — « Décisions du jour » · « Prochain pas » · « Dernier
  atterrissage »` ;
- **après** : `6 ligne(s) non vide(s) COMPARÉE(S) sur 28 À L'INTÉRIEUR des rubriques exemptées`, et
  **plus aucune rubrique non convertie** — la ligne `NON CONVERTI` a disparu, faute de population.

⚠️ **Ce dénominateur n'est pas une constante, et ne se recopie pas** : « File de fusion » écrit une
ligne par PR ouverte, donc la population bouge avec la forge. C'est un nombre que la gate IMPRIME,
jamais un nombre qu'un document tient à jour.

### Ce que `plan-state:verifier` couvre, et ce qu'il ne couvre pas

C'est la contrepartie exacte du point 1 de la décision, et elle s'écrit ici en toutes lettres plutôt
que de se déduire d'un « la dérive reste un rouge nommé ».

**Couvert, octet par octet** : les neuf rubriques qui ne lisent rien hors du dépôt, l'ordre et
l'unicité des quatorze rubriques, les mesures du domaine, la forme du bloc de reprise, et —
depuis cette tâche — **toute ligne d'une rubrique exemptée qui est émise sans condition**, ce qui
inclut les quatre doctrines : ordre de fusion (RM-09), pas suivant, provenance des décisions du
jour, lecture du SHA d'atterrissage.

**Non couvert, et ça ne peut pas l'être ici** : le CONTENU d'une ligne nourrie par la forge. Dans
« Prochain pas », c'est **le numéro de la PR en tête de file** ; dans « File de fusion », les lignes
du tableau ; dans « Dernier atterrissage », le SHA et sa date. Les comparer reviendrait à mesurer la
disponibilité et l'instant de `gh`, pas la dérivation de la vue : la gate rougirait à chaque PR
ouverte ailleurs, et une gate qui rougit tous les jours se fait désarmer dans la semaine (RM-02).

**L'attaque qui reste possible, nommée plutôt que sous-entendue.** Une PR qui ne touche que `docs/`
régénère la vue, puis réécrit à la main le numéro exempté de « Prochain pas » pour se désigner
elle-même. `gov:pr` reste vert — `docs/` n'est pas dans `PERIMETRE_DU_CODE`, c'est une décision
écrite dans `gov-pr.ts` et non un oubli — et `plan-state:verifier` reste vert, puisque ce numéro
vient de la forge. **Cette attaque était déjà possible AVANT ce geste**, et le label ne l'arrêtait
pas : il suffisait à la PR de s'attribuer `role:gardien-spec` (mesure 4 ci-dessus). Ce que le
retrait change n'est donc pas la faisabilité de l'attaque, mais la perte d'un signal d'imputation
que son auteur posait lui-même.

**Ce qui l'arrête vraiment, et où ça se décide** : la revue. `docs/PLAN-STATE.md` est un fichier
**dérivé** — un diff qui le montre modifié autrement que par une régénération est visible à l'œil
dans la PR, et les lentilles jugent toute PR. La voie mécanique, elle, existe et n'est pas prise
ici : rapprocher « Prochain pas » de la file en la RECALCULANT à la vérification, c'est-à-dire
accepter de mesurer la forge. **C'est l'objet de `GOV-053`**, dont cette tâche exécute la première
moitié — la descente de la rubrique à la ligne. La seconde moitié reste due, et cette phrase est là
pour qu'on ne la croie pas faite.

**Un piège de grammaire, trouvé en écrivant les deux lignes neuves.** La première colonne du tableau
§7 est **découpée sur la virgule**. Une virgule posée dans une parenthèse explicative coupait la
cellule en deux morceaux dont aucun n'était un chemin : la ligne **cessait de garder son fichier
sans que rien ne rougisse**. ⚠️ **Il y a DEUX lecteurs de cette colonne, et un seul est réparé.**
`cheminsReserves()` (`scripts/lot/chemins-de-tache.ts`, lu par `gov:pr`) retire désormais les
parenthèses **avant** de découper, et un témoin de `gov:pr --prove` écrit la ligne avec la virgule
piégée et exige que le chemin reste gardé — vu rougir par mutation : avec l'ordre d'origine, « le
témoin de `fichier_reserve_sans_label` n'a PAS fait rougir sa famille ».
`cheminsReservesDeLaCharte()` (`scripts/gates/gov-agents.ts`, lu par `gov:agents`) **découpe
d'abord**. Il est **inerte aujourd'hui** — aucune ligne du §7 ne porte de virgule dans une
parenthèse, et le §7 l'interdit désormais en toutes lettres — mais c'est une règle de prose qui
tient un défaut de code. `scripts/gates/gov-agents.ts` n'est pas dans les `paths` de GOV-090 : le
corriger ici aurait été écrire hors de ce qu'on a déclaré écrire. **C'est une dette, elle est au
« Reste à faire ».**

**Retour arrière.** Remettre les deux vues au tableau et retirer les deux sources : quatre lignes
dans deux fichiers. Le coût réel du retour est ailleurs — il faudrait aussi défaire l'attribution
par ligne du générateur, et rouvrir la non-conformité à REQ-GOV-032.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Retirer `docs/PLAN-STATE.md` du tableau, et rien d'autre | **Mesuré : cela change le label sur 5 PR de 34 et le laisse à 85 %.** Le geste aurait eu l'air de régler la contradiction sans rien dé-mutiser, et il aurait laissé `docs/requirements.json` ouvert. Un correctif qui soulage le symptôme le plus visible est le plus difficile à rouvrir ensuite. |
| Réserver **toutes** les vues dérivées, par cohérence | Rend le label muet sur sept fichiers au lieu d'un, et consacre l'idée qu'on peut répondre d'un texte qu'aucun humain n'écrit. Une cohérence obtenue en généralisant la faute. |
| Garder la ligne et compenser uniquement | Ne répond pas à la question posée — *que désigne le label ?* — et laisse le tableau affirmer un propriétaire pour un fichier qui n'en a pas. La compensation, elle, est retenue : elle est au point 3 de la décision. |
| Faire **entrer les verbes d'écriture dans le dépôt** (défaut B) | **Refusée pour une raison mécanique, pas par prudence.** `.claude/settings.json` met `docs/tasks.json` et `docs/gates.json` en `deny` sur `Write` et `Edit`, mais porte en **`allow`** `Bash(node scripts/*)` et `Bash(pnpm *)`. Importer les verbes sous `scripts/` placerait un écrivain qui **contourne le `deny`** à l'intérieur de l'allow-list, en un seul geste. Ce n'est pas un risque, c'est la défaite du mécanisme. ⚠️ **Cette case a affirmé que `docs/requirements.json` y était AUSSI. C'est faux, et le §_Contexte_ point 3 de cet ADR l'écrivait correctement** : le `deny` porte `docs/PLAN-STATE.md`, `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, `docs/tasks.json`, `docs/gates.json` et `.claude/settings.json` — la SOURCE des exigences n'y est pas. La raison mécanique tient sur deux fichiers des trois, ce qui suffit à écarter l'alternative ; elle ne s'appuie, pour le troisième, sur rien. Le combler appartient au lot `--settings` surchargé (« Reste à faire »). |
| Exempter du balayage les citations déjà écrites | Une exception nommée le jour de la livraison est le premier cran du label muet. Le balayage n'a **aucune** exception — il a d'ailleurs épinglé un commentaire de cette même livraison, qui a été reformulé plutôt qu'exempté. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/citation-d-outil-hors-depot.spec.ts` ·
  `it('REQ-GOV-008 — aucun fichier suivi ne nomme un verbe en chemin relatif au depot')` : le
  balayage part de `git ls-files` et de l'inventaire, jamais d'une chaîne cherchée à la main.
- **Assertion** — `tests/unit/gouvernance/plan-state-rubrique-exemptee.spec.ts` ·
  `it('REQ-GOV-032 — une ligne de rubrique exemptée qui ne lit pas la forge est COMPARÉE')` : la
  prose libre d'une rubrique exemptée n'échappe plus au vérificateur.
- **Assertion** — `tests/unit/gouvernance/plan-state-rubrique-exemptee.spec.ts` ·
  `it('REQ-GOV-032 — « File de fusion » : la doctrine RM-09 est COMPARÉE, elle aussi')` : la ligne
  qui fixe l'ordre de fusion était émise dans une branche que la forge décide, donc exemptée par sa
  seule présence et réécrivable à la main **sans que le vert la nomme**. Vue rougir avant le
  correctif : `la doctrine d'ordre de fusion réécrite à la main est restée verte … expected +0 to be 1`.
- **Assertion** — `tests/unit/gouvernance/plan-state-rubrique-exemptee.spec.ts` ·
  `it('REQ-GOV-032 — « Prochain pas » : la tâche suivante et sa doctrine sont COMPARÉES')` : la
  rubrique que A04 lit sous RM-09 cesse d'être libre en entier. Ce qui y reste libre — le numéro de
  la PR en tête de file — est nommé dans les conséquences.
- **Assertion** — `tests/unit/gouvernance/plan-state-rubrique-exemptee.spec.ts` ·
  `it('REQ-GOV-032 — le vert COMPTE les lignes gagnées SUR LEUR POPULATION, et nomme le reste')` :
  le compteur porte son dénominateur, et le numérateur ne peut pas le dépasser.
- **Assertion** — `scripts/gates/gov-pr.ts --prove`, témoin `fichier_reserve_sans_label` avec la
  virgule piégée dans la parenthèse : la grammaire de la première colonne est gardée.
- **`hors-code`** pour le point 1 de la décision — *qu'une vue n'ait pas de porteur* est une règle
  d'attribution, pas un comportement : ce qui est vérifiable, et l'est, c'est que la table produise
  les chemins attendus (témoin ci-dessus) et que la dérive des vues rougisse (REQ-GOV-032).

## Reste à faire

- **Le discriminant du label** — `role:gardien-spec` dû seulement sur une édition manuelle, par un
  rendu canonique du registre confronté par une garde. Tâche séparée ; touche les verbes hors dépôt.
- **`chemin_declare_irresolvable` à la clôture.** Mesuré **le 2026-09-24 sur la tête de
  `t/gov-label-et-outils`**, en confrontant au disque chaque `paths` des tâches `repo: partners` de
  `docs/tasks.json` : **199 des 251** déclarent au moins un `paths` qui ne résout pas — dont
  **187 `a_faire`**, où c'est **correct** (un `paths` est la promesse d'un fichier à écrire), et
  **12 `fusionnee`**. ⚠️ **Ces trois nombres bougent à chaque tâche versée** : ils portent donc leur
  date et leur mode de calcul, et ne se recopient pas d'une révision à l'autre — la première
  écriture de cette ligne disait « 201 des 244 », sans date, et aucune révision ne rend 244.
  Une règle d'existence naïve rougirait sur les 199 et serait désarmée le jour même. Le discriminant
  est le **moment** : un chemin doit résoudre **à la clôture**. Elle part avec un plancher déclaré et
  un rattrapage nommé pour les tâches déjà `fusionnee` dont le `paths` porte un placeholder
  (`docs/gouvernance/GOV-0xx`, `scripts/gates/QA-T00`).
  ⚠️ C'est la **deuxième occurrence** de la même famille : `GOV-063` déclare `docs/adr/partners/`, qui
  n'existe pas, et `gov:pr` ne s'en plaint pas — sa confrontation va **fichier → chemin déclaré**, à
  sens unique, et `docs/` est de toute façon hors de `PERIMETRE_DU_CODE`. Le fichier concerné est bien
  couvert, mais par un tout autre mécanisme : la ligne `docs/adr/**` du §7. Le `paths` est inerte dans
  les deux sens.
- **La 8ᵉ case de la définition de terminé atteste l'inattestable** — **troisième occurrence de la
  famille**. La case exige que « l'en-tête de build porte le sha fusionné ». Mesuré le 2026-09-24,
  et dit exactement plutôt que largement : `.github/workflows/` ne porte que `ci.yml` et
  `nightly.yml` — **aucun workflow de déploiement** ; `package.json` ne déclare **aucun script
  `deploy:verify`** ; et `git grep x-partners-build-sha -- scripts/` ne rend que **deux proses qui
  le PRESCRIVENT** (`scripts/lot/lot.workflow.js`, `scripts/plan-state/build.ts`), jamais un
  producteur ni un lecteur de l'en-tête. ⚠️ La première écriture de cette ligne disait « n'existe
  nulle part dans le code » : un `git grep` la réfute en une seconde, alors que le fait qu'elle
  vise — **rien ne produit ni ne lit cet en-tête** — tient. La case ment à la lettre sur chaque
  fusion, et aucune garde ne le voit. Hors périmètre de GOV-090 ; à porter par une tâche.
  **`docs/PLAN-STATE.md` continue de prescrire cette vérification**, et c'est délibéré : elle est
  exigée par REQ-GOV-014 et `docs/PROTOCOLE-FUSION.md`. Ce qui manque est l'outillage, pas la règle ;
  retirer la phrase de la vue aurait fait disparaître une exigence au lieu d'une dette.
- **Le second lecteur de la première colonne du §7** — `cheminsReservesDeLaCharte()` dans
  `scripts/gates/gov-agents.ts` découpe sur la virgule **avant** de retirer les parenthèses, l'ordre
  exact que `cheminsReserves()` a corrigé. Inerte aujourd'hui (aucune ligne du §7 ne porte de virgule
  en parenthèse), et le §7 interdit désormais la forme — mais une règle de prose tient un défaut de
  code. Hors des `paths` de GOV-090 ; une tâche le prend avec son témoin.
- **Les treize lignes des sept verbes hors dépôt** qui prescrivent une commande de ce dépôt : aucun
  témoin d'ici ne peut les lire. Le périmètre d'une garde s'arrête au dépôt alors que l'outillage
  déborde ; l'inventaire `VERBES_HORS_DEPOT` est une **copie datée**, pas une garde, et cette
  asymétrie est une dette résiduelle assumée.
- **Le balayage ne voit que les VERBES, pas le dossier hors dépôt.** `citationsFautives()` cherche le
  préfixe fautif suivi d'un élément de `VERBES_HORS_DEPOT` : une citation qui nomme un **document**
  du dossier passe. Constaté sur cette PR même — la fusion de `main` avait rendu au journal
  **deux** citations, le témoin en a vu **une** (`expected [ Array(1) ] to deeply equal []`), et la
  seconde, `DETTE-DES-SUCCEDANES.md`, a été corrigée à la main sans qu'aucune garde le dise.
  Élargir le balayage à tout le dossier demande d'en connaître le contenu, donc de recopier une
  seconde liste hors dépôt : c'est la même dette de copie que ci-dessus, et elle se traite avec.
- **`.claude/settings.json`** : y ajouter `Write`/`Edit` de `docs/requirements.json`,
  `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`. Ce fichier n'appartient ni à l'architecte ni à
  l'orchestrateur — lot dédié GOV-000 / GOV-023, `--settings` surchargé.
