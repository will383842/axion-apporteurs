# partners/ADR-0020 — Une PR de lot déclare ses tâches dans un champ `Lot:`, et la garde le croit exactement autant que le titre

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-23 |
| **Décideur** | `architecte` — la décision change ce qui AUTORISE un fichier dans une PR : elle touche le périmètre d'une gate bloquante, pas seulement son message |
| **Tâche** | GOV-096 |
| **Exigences servies** | REQ-GOV-021, REQ-GOV-007 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-02, RM-11 |
| **Remplace / remplacé par** | — |

## Contexte

### La forme normale d'une PR de ce dépôt est le LOT, et la garde ne sait pas la lire

`docs/CONVENTIONS.md` §5 et `partners/ADR-0007` fixent la forme normale : **un lot, une branche, une
PR, un commit par tâche**. Une PR par tâche a été écartée, chiffres à l'appui, parce que les créneaux
de fusion coûtent plus que le travail qu'ils gardent.

Or `gov:pr` ne sait pas de quelles tâches une PR de lot est faite. `tachesDeLaPr()`
(`scripts/lot/revues.ts`) apparie une tâche à une PR sur **deux** signaux, et une PR de lot n'en
satisfait aucun pour ses tâches non titrées :

| signal | pourquoi il ne suffit pas |
| --- | --- |
| l'identifiant du **TITRE** | le titre est `<type>(<ID-TÂCHE>): <titre>` — il ne peut nommer **qu'une** tâche |
| le champ `pr` du **REGISTRE** | il n'est écrit que par `pnpm lot:cloture`, dont l'invariant exige `fusion.atterri === true` : donc **après** la fusion |

Une PR de lot voit donc, avant sa fusion, **une seule** de ses tâches. C'est l'exact symétrique du
défaut que le docblock de `tachesDeLaPr()` décrit déjà pour la PR 31 (« le titre seul ne nomme qu'une
tâche, alors qu'une PR de lot en porte neuf ») — sauf que le remède posé ce jour-là, le champ `pr`,
n'est pas lisible au moment où la garde s'exécute.

### Ce que ça coûte, mesuré le 2026-09-23 sur la PR #114

La PR #114 porte six tâches. `pnpm gov:pr -- --pr 114` rougit :

```
── fichier_hors_paths_des_taches (1)
   La PR modifie 12 fichier(s) de code qu'aucune de ses tâches ne déclare : … Tâche(s) citée(s) :
   GOV-082 — chemins déclarés (`paths` ∪ `tests{}`) : scripts/gates/gov-trace.ts,
   tests/unit/gouvernance/une-liste-vide-n-est-pas-une-reponse.spec.ts.
```

Neuf des douze fichiers nommés **sont** déclarés — par les cinq autres tâches du lot, que la garde ne
voit pas. Tant que ce défaut existe, **aucune PR de lot n'est fusionnable**, et le lot est la seule
forme qui divise le coût du protocole de relecture.

### Le remède que la garde prescrivait est faux, et c'est ce qui rend le défaut bloquant

Le message de la famille prescrivait : « Ajoute le chemin à la tâche par `outils/ajouter-path.mjs` ».
Appliqué à une PR de lot, cela revient à écrire dans `paths` de la tâche du **titre** des fichiers qui
appartiennent à **cinq autres tâches**. Or la disjonction des lots — l'invariant « deux tâches d'un
lot n'ont jamais de chemin en commun » — se calcule sur ces mêmes `paths` : on obtiendrait une
disjonction fausse, et le composeur sérialiserait ou laisserait se chevaucher des lots sur la foi
d'un registre qu'on aurait menti. Le lead du lot L0-02 a refusé de le faire.

## Décision

**Le corps d'une PR porte un champ `Lot:`**, à la section Identité du gabarit, à côté d'`Auteur:`, de
`Relecteur:` et de `Couvre:`. Il porte les identifiants des tâches que la PR livre **en plus** de
celle que son titre nomme, séparés par des **virgules** ; il reste **vide** pour une PR à une seule
tâche.

**`tachesDeLaPr()` résout par l'UNION DES TROIS** : `t.pr === <numéro>`, l'identifiant du titre, les
identifiants déclarés dans `Lot:` — et rien d'autre. La propriété de **monotonie** que son docblock
nomme est préservée : un renseignement de plus ne peut que faire grossir l'ensemble, donc la garde
obtient toujours un sur-ensemble de ce que le composeur du corps voit, et « la garde exige moins que
le corps n'affiche » reste impossible par construction.

**Le niveau de confiance ne change pas — c'est le cœur de cette décision, et c'est l'objection
qu'elle doit soutenir.** On pourrait lire ce champ comme une clé que l'auteur d'une PR se donne à
lui-même pour élargir ce qu'il a le droit d'écrire. Ce serait vrai si le titre n'existait pas. Mais
le **titre est déjà écrit par l'auteur**, dans le même corps de PR, sans contreseing, et la garde le
croit depuis le premier jour : c'est lui qui résout la tâche dont les `paths` autorisent des fichiers.
`Lot:` est **exactement aussi fiable** — même auteur, même texte, même absence de vérification
externe — et il est **explicite et auditable** là où le titre est implicite : un relecteur lit une
ligne qui énumère ce que la PR prétend porter, au lieu de le deviner. Ce qu'on ajoute n'est pas un
pouvoir neuf ; c'est la même déclaration, rendue lisible.

Et elle est **plus bornée que le titre ne l'a jamais été**. Quatre refus, chacun vu rougir sur son
témoin, et un identifiant refusé **n'élargit rien** — le sens de défaillance reste fermé :

| refus | famille | ce qu'il empêche |
| --- | --- | --- |
| identifiant absent du registre | `lot_tache_inconnue` | une faute de frappe élargit le lot en silence |
| identifiant déjà livré | `lot_tache_livree` | une PR rouvre une tâche livrée pour emprunter ses `paths` |
| identifiant portant un `pr` différent | `deux_pr_meme_tache` | deux PR se disputent une tâche (REQ-GOV-007) |
| champ mal formé | `lot_mal_forme` | une liste vide rendue avec le code zéro passe pour « pas de lot » |

**Le nom `deux_pr_meme_tache` est REPRIS de `gov:etat`, jamais doublé** (`partners/ADR-0011` : une
seule implémentation par règle). Les deux gardes observent la même règle sur deux **populations
disjointes**, et aucune ne peut voir ce que l'autre voit : `gov:etat` compare les **titres de toutes
les PR ouvertes** de la forge, donc lit le réseau ; `gov:pr` confronte le champ `pr` du **registre** à
la **seule** PR qu'il juge, sans aucun appel réseau. Les fusionner obligerait la garde d'une PR à
lister la forge — c'est-à-dire à ouvrir une seconde source, dans le fichier même qui existe pour
n'en avoir qu'une.

**`Lot:` vide ou absent laisse le comportement INCHANGÉ**, et ce n'est pas une tolérance : c'est le
cas de la très grande majorité des PR, et une gate qui exigerait un champ rempli de tout le monde
pour servir une minorité se ferait contourner dans la semaine. Un contre-témoin le garde.

## Conséquences

- **Le champ est dans `CHAMPS`** (`scripts/gates/gov-pr.ts`), donc `champ_gabarit_absent` rougit s'il
  disparaît du **gabarit**. Il n'est **jamais** exigé rempli dans le corps d'une PR.
- **`risqueDeLaPr()` reçoit la même union.** Sans elle, une tâche `sensible` ou `schema: true` portée
  par une autre tâche du lot que celle du titre serait invisible au risque : ni section « Attaque »,
  ni approbation bloquante de l'architecte. La monotonie vaut ici aussi — un renseignement de plus ne
  peut que faire **monter** le risque.
- **Le message de `fichier_hors_paths_des_taches` cesse de prescrire le remède faux** sur une PR de
  lot : il nomme `Lot:` avant `ajouter-path.mjs`.
- **Ce que cela coûte à l'auteur d'une PR de lot** : une ligne à remplir, et une ligne de plus à
  tenir à jour si le lot change de composition. Un lot qui change de composition après l'ouverture de
  sa PR doit corriger deux endroits — le corps et le registre — au lieu d'un.
- **Ce que cela ne fait pas** : le champ ne remplace ni la revendication (labels `en_cours` +
  `owner:` de l'issue, champ `owner` du registre — `docs/PLAN-STATE.md` §Revendications), ni la
  clôture. `pnpm lot:cloture` reste le seul écrivain de `statut`, `pr`, `branch` et `owner`
  (`docs/PRESEANCE.md` §1).
- **Retour arrière.** Il tient en trois gestes, et il rend le dépôt à l'état où aucune PR de lot
  n'est fusionnable : retirer le quatrième paramètre de `tachesDeLaPr()` et l'`idsDuLot` de
  `EntreeDuRisque` ; retirer `resoudreLeLot()` et les quatre familles de `gov-pr.ts` ; retirer le
  champ du gabarit et de `CHAMPS`. Ce n'est pas un `git revert` neutre : il faudrait alors décider
  d'autre chose pour les PR de lot, et cet autre chose exige son propre ADR.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Ajouter les chemins des autres tâches aux `paths` de la tâche du titre (`ajouter-path.mjs`) | C'est le remède que la garde prescrivait, et il est **faux** : il écrit dans le registre que la tâche du titre touche des fichiers qui appartiennent à cinq autres tâches. La disjonction des lots se calcule sur ces mêmes `paths` — on obtiendrait une disjonction mensongère, et le défaut se propagerait du message de la garde au registre lui-même. |
| Faire écrire `t.pr` par le composeur du lot, à l'ouverture de la PR | `pnpm lot:cloture` est le **seul** écrivain de `pr` dans `docs/tasks.json` (`docs/PRESEANCE.md` §1), et son invariant `fusion.atterri === true` existe pour qu'un `pr` au registre signifie « livrée, atterrie ». Lui faire dire aussi « en cours de relecture » rendrait le champ ambigu partout où il est lu — y compris dans la famille `deux_pr_meme_tache` qu'on vient de fermer. |
| Lire la composition du lot dans `docs/lots/<id>/lot.json` | Ce dossier est en `.gitignore` (voir RM-13, dernier paragraphe) : il ne survit ni à un `clone`, ni à un changement de machine. Une garde qui lirait un fichier absent de l'arbre serait verte par accident chez tout le monde sauf chez celui qui a composé le lot. |
| Dériver les tâches du lot des **commits** de la branche (un commit par tâche, §5) | La convention porte sur le titre du commit, qu'aucune garde ne confronte à quoi que ce soit ; et la garde lirait alors `git log`, c'est-à-dire une **troisième** source de « quelles tâches cette PR porte », là où `tachesDeLaPr()` existe pour n'en avoir qu'une. À confiance identique, on préfère la source qui est déjà lue. |
| Exiger le champ `Lot:` rempli sur toute PR | Rendrait la garde insatisfiable pour la très grande majorité des PR, qui portent une seule tâche — déjà nommée par le titre. Une gate que tout le monde doit contourner se fait retirer dans la semaine (RM-02, LEC-13). |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/gov-pr-lit-une-pr-de-lot.spec.ts` ·
  `it('REQ-GOV-021 — avec `Lot:`, les six tâches de la PR #114 résolvent')` : si l'union cessait de
  lire le champ, cette assertion rendrait la seule tâche du titre.
- **Assertion** — `tests/unit/gouvernance/gov-pr-lit-une-pr-de-lot.spec.ts` ·
  `it('REQ-GOV-007 — un identifiant qui porte un `pr` DIFFÉRENT est refusé : deux PR ne se disputent pas une tâche')` :
  elle verrait mourir le refus qui borne le champ du côté de REQ-GOV-007.
- **Assertion** — `tests/unit/gouvernance/gov-pr-lit-une-pr-de-lot.spec.ts` ·
  `it('REQ-GOV-021 — `Lot:` vide ou absent : aucun refus, aucun identifiant (contre-témoin)')` : elle
  verrait mourir la décision « le cas ordinaire reste inchangé ».

## Reste à faire

1. **Le composeur du corps de PR (`scripts/lot/corps-de-pr.ts`) ne remplit pas encore `Lot:`.** Il
   passe `null` au lecteur unique et décrit ce que la PR déclare porter ; rien ne l'empêche
   aujourd'hui de composer un corps de lot dont le champ reste vide. La monotonie protège la garde —
   elle obtient un sur-ensemble, jamais l'inverse — mais l'auteur d'un lot doit remplir la ligne à la
   main. La tâche qui automatisera ce remplissage appartient à `lot:composer` (GOV-012) et n'est pas
   ouverte.
2. **Aucune garde ne confronte le champ `Lot:` aux COMMITS de la branche.** Une PR de lot pourrait
   déclarer une tâche qu'elle ne livre pas : le champ lui ouvrirait les `paths` de cette tâche sans
   qu'elle y écrive quoi que ce soit. C'est un élargissement, jamais une autorisation d'écrire hors
   du dépôt, et il reste borné par les quatre refus — mais il est **dit plutôt que supposé**, et la
   garde qui le fermerait lirait `git log`, c'est-à-dire la troisième source écartée ci-dessus.
