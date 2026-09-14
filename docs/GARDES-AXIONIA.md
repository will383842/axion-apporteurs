# Gardes d'axionia — transposer, adapter, écarter, différer

> Livré par **GOV-014** (REQ-GOV-029). `docs/CONVENTIONS.md` fixe les règles ; **ce fichier décide qui les tient**.
> Une ligne par garde candidate, quatre décisions possibles, un motif pour chacune.
>
> **Pourquoi un fichier à part.** `docs/CONVENTIONS.md` est normatif et se lit en entier avant d'écrire une ligne de
> code ; ce registre-ci est un **journal de décisions daté**, qu'on rouvre au moment précis où l'on se demande « et
> cette garde d'axionia, pourquoi ne l'a-t-on pas prise ? ». Les mêler aurait noyé neuf règles applicables sous dix-sept
> lignes d'archéologie. Le lien est posé dans les deux sens : les conventions renvoient ici en tête, et les §9 à §11 des
> conventions sont l'application de ce registre.
>
> **Ce que le test exige de chaque ligne** (`tests/unit/gouvernance/gardes-transposees.spec.ts`) :
>
> - les **sept** gardes que REQ-GOV-029 nomme ont chacune une ligne — la liste est LUE dans `docs/REQUIREMENTS.md`,
>   jamais recopiée ici, pour qu'une candidate ajoutée à l'exigence fasse rougir au lieu de passer inaperçue (RM-01) ;
> - la décision est prise dans un **vocabulaire fermé** : `transposer`, `adapter`, `écarter`, `différer` ;
> - le motif fait **au moins 80 caractères**. « Parce que c'est documentaire » en fait 28, et c'est exactement la
>   formule que ce dépôt a mesurée puis refusée ;
> - une garde `transposer` ou `adapter` **nomme un fichier de ce dépôt, et il existe** ;
> - une garde `différer` **nomme la tâche qui la reprend, et cette tâche est au backlog**. C'est la seule chose qui
>   distingue « différée » d'« oubliée ».
>
> **Comment axionia a été lu.** Arbre de travail `C:\Users\willi\Documents\Projets\Axion-IA\axionia`, **2026-09-05**,
> en LECTURE SEULE (trois autres sessions y travaillaient ; aucune commande d'écriture, `git` compris, n'y a été
> lancée). ⚠️ Les chemins ci-dessous ne portent donc **pas de SHA** : je n'ai pas pu lire le commit. Ce ne sont pas des
> lignes de `docs/AFFIRMATIONS-AXIONIA.md`, qui exige `AAAA-MM-JJ @ <SHA court>` et qu'on ne peut pas satisfaire sans
> interroger le dépôt. Une affirmation datée sans SHA se revérifie ; elle ne se rejoue pas. C'est un écart assumé,
> nommé, et rendu dans la PR.

## 1. Les sept gardes que REQ-GOV-029 nomme

| Garde | Fichier réel côté axionia | Décision | Reprise | Motif |
| --- | --- | --- | --- | --- |
| `anti-siren` | `scripts/check-anti-siren.sh` | écarter | `CPL-T01` | La règle d'axionia refuse tout SIREN écrit dans `src/` tant que la société n'est pas immatriculée. Partners est dans la situation exactement INVERSE : l'entité porte un SIREN légitime, qui doit vivre dans un registre unique et être dérivé partout ailleurs (RM-01). Transposer la règle telle quelle interdirait la seule écriture licite du numéro et laisserait passer les copies, c'est-à-dire l'inverse de ce qu'on veut. La règle utile appartient à la tâche qui pose ce registre d'entité. |
| `use-client` | `scripts/check-use-client.ts` | transposer | `scripts/gates/gov-conventions.ts`, famille `use_client_sans_motif` | La règle se transpose sans changement : toute directive `"use client"` porte un `// use-client: <raison>` collé. Elle est posée AVANT la première ligne de rendu de ce dépôt, à dessein — le premier composant naîtra justifié, au lieu qu'on ait à rattraper une centaine de directives plus tard. Le périmètre est aujourd'hui vide, et la garde le DIT : elle imprime « 0 composant », son motif et la tâche qui l'ouvrira, au lieu de rendre un vert silencieux. Deux corrections au passage : le parcours d'axionia lit `src/` par `readdirSync` et lève quand le dossier n'existe pas ; ici la vue est injectée, donc la garde reste jugeable sans arborescence. |
| `use-server exports` | `tests/unit/ci/un-fichier-use-server-n-exporte-que-des-fonctions.spec.ts` | adapter | `scripts/gates/gov-conventions.ts`, famille `use_server_export_interdit` | Le briefing donnait cette garde pour inexistante côté axionia ; elle existe, sous `tests/unit/ci/`, hors du dossier `scripts/` où la recherche avait été faite. Elle est donc ADAPTÉE, pas écrite de zéro. Deux écarts assumés. (1) Son détecteur retient les TROIS premières instructions du fichier et y cherche la directive en multi-ligne : mon contre-témoin « un `"use server"` dans le corps d'une fonction ne marque pas le module » l'a fait rougir sur un `export const revalider` parfaitement licite. Ici, seule la PREMIÈRE instruction marque le module. (2) Sa liste de DETTE n'est pas reprise : Partners n'a aucune dette à absoudre, et une liste d'exceptions sans cause devient une porte. |
| `zod` | `scripts/check-zod.ts` | écarter | `INT-T01a` | Le script porte lui-même la mention « Sprint 0 stub » : quand `src/lib/schemas` n'existe pas, il sort en 0 avec un avertissement. C'est le cas d'école que ce dépôt refuse de reproduire — une garde qui se tait quand son périmètre est vide ne garde rien, et sa verdeur se lit comme une absence de problème. Pire : même peuplé, il vérifie seulement qu'un fichier de schéma a un test frère ; il ne vérifie JAMAIS qu'une entrée est validée. Ce n'est pas la garde que REQ-GOV-018 demande. La règle « Zod à toute entrée » est fixée au §9 des conventions, et son contrôle appartient à la tâche qui pose les schémas du contrat, puis à la gate sécurité. |
| `isolation` | `scripts/content-gen/isolation-check.ts`, `scripts/image-bank/isolation-check.ts`, `scripts/qualiopi/isolation-check.ts` | adapter | `scripts/gates/gov-conventions.ts`, famille `isolation_depot` | Les trois copies d'axionia cloisonnent un CHANTIER dans ses dossiers, avec une liste d'exceptions qui a dépassé la soixantaine d'entrées commentées. Partners n'a pas de chantier cloisonné ; il a une frontière autrement plus coûteuse à franchir, celle des DEUX DÉPÔTS. La forme transposée est donc : le préfixe des chemins d'une tâche s'accorde à son `repo`. La moitié « une tâche axionia ne revendique pas un chemin d'ici » était déjà gardée par `tests/unit/gouvernance/paths-derives.spec.ts` ; la réciproque ne l'était par rien, et une garde à sens unique est un défaut que ce dépôt a déjà payé ailleurs. |
| `surface Server Actions` | `tests/unit/ci/surface-server-actions.spec.ts` | adapter | `scripts/gates/gov-conventions.ts`, famille `use_server_reexport` | Le fichier d'axionia que le briefing désignait sous ce nom (`tests/integration/server-actions.test.ts`) n'est PAS une garde de surface : c'est un test fonctionnel de schémas, lié à une base de données et au domaine d'axionia, intransposable. La vraie garde de surface est celle-ci, et sa règle est structurelle donc portable : un module `"use server"` ne contient aucun ré-export par spécificateur, parce que chaque nom ré-exporté devient un point d'entrée HTTP appelable sans cookie ni session. Elle a trouvé deux fuites réelles côté axionia le 2026-08-19, dont une lecture de table entière sans garde. |
| `aucun-workflow-ne-pousse-sur-main` | `tests/unit/ci/aucun-workflow-ne-pousse-sur-main.spec.ts` | transposer | `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts` | Déjà transposée, et FAITE : GOV-012 l'a livrée, et `gov:depot-visibilite` en porte une seconde lecture (famille `workflow_pousse_sur_main`) sur des vues injectées. La ligne est consignée parce qu'une décision « déjà faite » qu'on ne écrit nulle part se refait. ⚠️ Un écart constaté en la vérifiant : `docs/gates.json` la déclare sous `tests/unit/ci/…`, alors que le fichier vit sous `tests/unit/gouvernance/…` — même divergence pour `tout-check-est-cable`. Le registre est un fichier partagé ; la correction est rendue en texte dans la PR. |

## 2. Les autres gardes d'axionia, examinées et décidées

Une garde qu'on ne mentionne pas est une garde qu'on redécouvrira dans six mois. Les huit repérées hors REQ-GOV-029
sont donc décidées ici aussi, plus deux qui n'ont pas de nom dans l'exigence et qui comptent.

| Garde | Fichier réel côté axionia | Décision | Reprise | Motif |
| --- | --- | --- | --- | --- |
| `check-anti-hex` (couleurs en dur) | `scripts/check-anti-hex.sh` | différer | `UX-P0-02` | La règle — aucune couleur hexadécimale hors des jetons de style — suppose une charte et une feuille de style, dont Partners n'a ni l'une ni l'autre. La poser maintenant donnerait une garde à périmètre vide sans même la règle qu'elle protège : on ne peut pas refuser une valeur en dur tant qu'on n'a pas décidé de quoi elle est la copie. Elle se pose avec la charte de l'espace. |
| `check-admin-nav-routes` | `scripts/check-admin-nav-routes.ts` | différer | `UX-P1-08` | Chaque entrée de menu doit pointer une route qui existe : un renommage de dossier laisse sinon une entrée qui mène à un 404, en silence. Partners n'a ni console ni navigation. À reprendre AVEC sa réciproque, qui manque toujours côté axionia et qu'on ne veut pas hériter à moitié : une route sans aucune entrée de menu n'est gardée par rien, et il en restait douze après trois familles d'exemptions automatiques. |
| `check-i18n` (parité FR/EN) | `scripts/check-i18n.ts` | écarter | — | Partners est monolingue français par le §1 des conventions : il n'y a pas de second fichier de messages avec lequel comparer. Une garde de parité sur une seule langue est un périmètre vide PERMANENT, que ni un motif ni une tâche successeur ne rendraient honnête. À noter que le locale anglais d'axionia est lui-même désactivé depuis le 2026-05-16. |
| `check-contrast` (WCAG) | `scripts/check-contrast.ts` | écarter | `UX-P0-03` | Doublon : `GATE-UX-A11Y` est déjà au registre `docs/gates.json` et couvre le contraste par l'outil `axe`, qui mesure le rendu réel plutôt que des paires de jetons déclarées. Deux gardes qui disent la même chose finissent par se contredire, et c'est la plus lâche des deux qu'on garde. |
| `check-radius` (rayons de bordure) | `scripts/check-radius.ts` | différer | `UX-P0-02` | Même raison que les couleurs en dur : la règle encode une décision de design (rayons de 2 à 8 pixels) qui n'a pas été prise pour Partners. Transposer un seuil de charte avant la charte, c'est recopier la décision d'un autre produit et se priver de la prendre. |
| `check-knowledge-banned-words` | `scripts/check-knowledge-banned-words.ts` | écarter | — | Sa liste de motifs est VIDE côté axionia depuis la décision du 2026-08-10 : le script passe systématiquement et ne garde plus rien, il est conservé comme point d'entrée. Transposer un point d'entrée vide serait ajouter une gate verte de plus. Le besoin équivalent — le lexique proscrit de la prose apporteur — est déjà porté par `GATE-JUR-TEXTES-APPORTEURS` et `jur:copy-indicative`. |
| `check-positionnement` | `scripts/check-positionnement.ts` | écarter | — | La garde surveille deux surfaces éditoriales propres au site d'axionia et au vocabulaire de son repositionnement commercial. Partners n'a pas de surface éditoriale publique, et son propre vocabulaire proscrit est gardé par `GATE-JUR-VOCAB-PUBLIC` et `jur:revue-apporteur-facing`. Rien à transposer, un doublon à ne pas créer. |
| `check-schema` (JSON-LD) | `scripts/check-schema.ts` | écarter | — | La garde valide les données structurées destinées aux moteurs de recherche ; elle n'est plus un stub et délègue à une vraie spécification. Partners est une console privée derrière authentification : aucune page indexable, donc aucune donnée structurée à valider. Le périmètre n'est pas vide par avance de phase, il est vide par nature. |
| `gardes-isolation-sont-appelees` | `tests/unit/ci/gardes-isolation-sont-appelees.spec.ts` | adapter | `scripts/gates/gov-conventions.ts`, famille `garde_ecrite_jamais_appelee` | Non nommée par REQ-GOV-029, et pourtant la plus instructive du lot : elle est née du constat que `qualiopi:isolation-check` existait depuis des mois sans être câblé nulle part, en cumulant 88 violations, pendant que la seule des trois gardes appelée par la CI affichait zéro. La forme adaptée pour Partners est plus large et se DÉRIVE du registre : toute gate de `docs/gates.json` dont le script existe sur le disque est appelée par un workflow ou par `.claude/settings.json`. Dix-neuf gardes du socle sont dans ce périmètre aujourd'hui, toutes câblées. |
| `gov:derivation` | aucun équivalent côté axionia | différer | `DM-03-A` | Ce n'est pas une garde d'axionia : c'est une entrée de `docs/gates.json` que le registre attribue à GOV-014, sans script et sans `preuveRouge`. Son périmètre — la grille, les seuils légaux, les listes d'états, les libellés d'énumération — n'existe dans ce dépôt à AUCUN endroit aujourd'hui : l'écrire maintenant produirait exactement la garde à périmètre vide que ce registre refuse. Elle se pose avec la première valeur qui a deux lieux possibles, c'est-à-dire avec la grille dérivée d'axionia ; les seuils sont déjà couverts par `GATE-JUR-SEUILS-SSOT` et les énumérations par `partners:schema:enums`. La ré-attribution de l'entrée est rendue en texte dans la PR, `docs/gates.json` étant un fichier partagé. |

**Hors périmètre de GOV-014, et ce n'est pas un oubli.** `tests/unit/ci/poids-du-bundle-garde-vraiment.spec.ts` et
`tests/unit/ci/size-limit-buckets.spec.ts` sont traités par **GOV-019** (budgets de performance), livrée dans le même
lot. Les décider ici aurait créé deux vérités concurrentes sur la même garde, dans la même PR.

## 3. Ce que les décisions retenues ont donné

`scripts/gates/gov-conventions.ts` porte huit familles, chacune avec son témoin rouge et ses contre-témoins verts
(`pnpm gov:conventions --prove`). Trois d'entre elles ont un périmètre **vide** aujourd'hui, et la garde l'imprime à
chaque exécution avec son motif et la tâche qui l'ouvrira — c'est la seule chose qui empêche une transposition
prématurée de se déguiser en couverture.

| Famille | Origine | Périmètre au 2026-09-05 |
| --- | --- | --- |
| `use_server_export_interdit` | `use-server exports`, adaptée | 0 module — le dépôt n'a pas de `src/` |
| `use_server_reexport` | `surface Server Actions`, adaptée | 0 module — idem |
| `use_client_sans_motif` | `use-client`, transposée | 0 composant — idem |
| `lint_non_bloquant` | REQ-GOV-018, écrite | 0 étape — `ci.yml` est un fichier partagé, l'étape est rendue en texte |
| `outillage_non_epingle` | REQ-GOV-018, écrite | 0 étape — idem |
| `isolation_depot` | `isolation`, adaptée | 197 tâches relues |
| `garde_ecrite_jamais_appelee` | `gardes-isolation-sont-appelees`, adaptée | 19 gardes du socle relues |
| `perimetre_vide_sans_motif` | la doctrine elle-même | 5 périmètres déclarés, 3 vides et motivés |
