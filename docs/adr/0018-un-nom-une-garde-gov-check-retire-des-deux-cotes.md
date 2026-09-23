# partners/ADR-0018 — Un nom, une garde : `gov:check` est retiré des deux côtés

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-22 |
| **Décideur** | `architecte` — l'homonymie engage un identifiant que six documents citent ; l'acceptation de GOV-030 la renvoyait explicitement à un ADR |
| **Tâche** | GOV-063 |
| **Exigences servies** | REQ-GOV-008, REQ-GOV-012, REQ-QA-013 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

## Contexte

### Le nom désignait deux choses, et la seule qu'on pouvait taper était la mauvaise

Mesuré sur `571b1eb` :

| ce qui porte le nom | ce que c'est | qui l'exécute |
| --- | --- | --- |
| l'entrée `gov:check` de `docs/gates.json` | la garde des termes interdits, `scripts/gates/gov-check.ts` | `pnpm gov:termes-interdits`, en porte A, bloquante |
| le script `gov:check` de `package.json` | une CHAÎNE de dix-sept gardes de gouvernance | un développeur qui le tape |

La garde imprimait son identifiant de registre dans son verdict — « ❌ gov:check — 2 faute(s) ». Ce nom
était **typable**, et ce qu'il lançait n'était **pas** cette garde.

### Ce que ça a coûté, et le piège s'est refermé sur son lecteur

Un synonyme interdit du glossaire — celui que `docs/GLOSSAIRE.md` §5 nomme pour l'enveloppe des
événements — est monté jusqu'à une demande de fusion ouverte, alors que la garde était **armée**, en
porte A **bloquante**, sans tolérance d'échec, et que le fichier fautif était dans son périmètre depuis
la seconde où il a été écrit. Le développeur a lu le rouge, tapé `pnpm gov:check`, obtenu **dix-sept
verts**, et conclu à un aléa de forge.

Un rouge dont le nom ne reproduit pas le rouge est pire qu'un rouge muet : il **certifie** la mauvaise
conclusion. C'est la même famille que la leçon d'axionia sur les gardes écrites et jamais appelées, un
cran plus loin — ici la garde tournait, et c'est le lecteur du rouge qu'on égarait.

### La chaîne est, en plus, un second exemplaire de la porte A

Mesuré le 2026-09-22 sur `571b1eb`, par dérivation du job `gate-a` de `.github/workflows/ci.yml` :

| source | étapes |
| --- | --- |
| la chaîne de `package.json` | **17** |
| les lignes `run: pnpm …` du job `gate-a` (hors installation) | **70** |
| jouées dans la porte et **absentes** de la chaîne | **53** |

GOV-047 compte **65** étapes jouées et en écarte cinq qu'elle nomme ; les deux comptes disent la même
chose. Une chaîne tenue à la main qui rejoue un quart d'une porte est un **second exemplaire** de cette
porte (RM-01), et elle dérive le jour où quelqu'un ajoute une étape à la porte sans y penser. C'est déjà
arrivé : aucun `…:prove`, ni `lint`, ni `typecheck`, ni `test`, ni la garde des termes interdits elle-même
n'y figurent.

### Deux fichiers réservés emploient déjà le même nom pour les deux choses

`docs/GLOSSAIRE.md` (lignes 6 et 157) écrit `gov:check` pour désigner **la garde** ; `docs/REQUIREMENTS.md`
(REQ-GOV-001, REQ-GOV-004) écrit `pnpm gov:check` pour désigner **la chaîne**. Les deux sont en écriture
réservée au `gardien-spec`. L'homonymie n'est donc pas une coquetterie de `package.json` : elle a
contaminé le registre normatif, des deux côtés, sans qu'aucune garde puisse le voir.

### Et la reconnaissance de l'appel tenait à un commentaire

`scripts/gates/gov-conventions.ts` conclut qu'une garde est appelée en cherchant, dans le texte des
workflows, son identifiant OU le chemin de son script. Le job jouait `pnpm gov:termes-interdits` — ni l'un
ni l'autre. La famille `garde_ecrite_jamais_appelee` restait verte uniquement parce qu'un **commentaire**
du YAML citait le littéral `gov:check`. Retirer ce commentaire faisait rougir à tort une garde parfaitement
câblée ; le garder tenait une gate bloquante par une ligne de prose. Le journal du 2026-09 a versé le remède
en dette : déclarer un alias au registre, et rendre la reconnaissance aveugle aux commentaires.

## Décision

1. **Un nom ambigu se RETIRE, il ne se réattribue pas.** `gov:check` ne désigne plus rien qui s'exécute
   dans ce dépôt : ni identifiant de registre, ni script de `package.json`. Réattribuer le nom au
   survivant aurait déplacé le piège au lieu de le fermer — `docs/GLOSSAIRE.md` continuerait de lire
   « rouge (`gov:check`) » à propos de la garde, en désignant désormais la chaîne. Celui qui tape
   `pnpm gov:check` obtient maintenant une erreur bruyante, et non dix-sept verts.
2. **L'entrée du registre prend l'identifiant `gov:termes-interdits`** — c'est-à-dire **la commande qui la
   lance**. L'identifiant au registre et la commande sont désormais le même mot pour cette garde.
3. **Tout ce que la garde imprime dérive de son identifiant** (`ID_REGISTRE`, exporté par
   `scripts/gates/gov-check.ts`). Le vert et le rouge portent ce nom parce qu'ils le **lisent** ; un
   littéral recopié dans un verdict est exactement ce qui a coûté la session (RM-01).
4. **La chaîne de `package.json` prend le nom `gov:partiel`.** Son nom dit ce qu'elle est : une partie. Elle
   n'a plus le droit de s'appeler comme la porte, parce qu'elle n'en joue qu'un quart.
5. **La chaîne est condamnée, par expansion puis contraction.** Le seul pré-vol légitime est celui qui
   **dérive** de `ci.yml` : `pnpm prevol`, livré par GOV-047. Le jour où il atterrit sur la branche
   principale, `gov:partiel` disparaît. Elle survit jusque-là parce que la supprimer aujourd'hui ferait
   pointer `scripts/reprise.ts` vers une commande qui n'existe pas — le défaut exact que GOV-047 ferme.
6. **Le fichier `scripts/gates/gov-check.ts` garde son nom.** Un chemin n'est pas une commande : personne
   ne le tape en lisant un rouge, et le registre le relie à son identifiant. Le renommer coûterait une
   migration de références sans fermer quoi que ce soit.

## Conséquences

- **La reconnaissance de l'appel ne lit plus un commentaire.** L'identifiant du registre est maintenant le
  littéral écrit dans le `run:` du job : `garde_ecrite_jamais_appelee` le voit dans le YAML **nu**. Le
  commentaire de onze lignes qui portait la gate a été remplacé par sept lignes qui expliquent, sans plus
  rien tenir. La clause 3 de l'acceptance de GOV-063 est fermée **par construction**.
- **L'alias devient sans objet**, et avec lui les deux verbes d'outillage que GOV-063 annonçait comme
  manquants (écrire un champ d'alias, poser une première valeur sur un champ vide du registre). Un alias
  aurait fait vivre deux noms pour une chose — l'inverse de ce que cet ADR décide.
- **L'invariant posé est une famille, pas le cas nommé** : aucun identifiant de `docs/gates.json` n'est,
  dans `package.json`, le nom d'autre chose que sa propre garde. Vingt-neuf entrées sont jugées par cette
  règle ; une seule la violait.
- **Le sens inverse n'est pas fermé et il est FIGÉ** : trois scripts lancent la garde d'une entrée sans en
  porter l'identifiant (`gov:lexique`, `gov:maquettes-validees`, `securite:rate-famille`). Aucune des trois
  n'imprime un nom qu'on puisse taper à tort, et c'est la seule raison pour laquelle elles survivent. Un
  quatrième écart rougit.
- **Ce qui garde le nom, ce sont les récits** : le journal, l'en-tête des gardes, la prose de
  `docs/REPRISE-SESSION.md`. Réécrire l'histoire d'un défaut, c'est perdre la leçon. Le nom est retiré de
  tout ce qui **résout** ; il reste partout où il **raconte**.
- **Deux fichiers réservés restent à corriger** et cet ADR ne peut pas les écrire (voir « Reste à faire »).
- **Retour arrière** : rendre à la chaîne le nom `gov:check` remet le rouge de la garde en contradiction
  avec la commande qui le reproduit, et fait rougir quatre témoins de
  `tests/unit/gouvernance/un-nom-une-garde.spec.ts`. Il faudrait alors réécrire l'ADR, pas le contourner.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| **Renommer seulement l'entrée du registre**, et laisser la chaîne s'appeler `gov:check` | Le piège se déplace au lieu de se fermer : `docs/GLOSSAIRE.md` dit « rouge (`gov:check`) » de la garde, et ce nom désignerait désormais la chaîne. Un lecteur du glossaire taperait encore la mauvaise commande, et obtiendrait encore des verts. |
| **Renommer seulement le script de `package.json`**, et laisser l'entrée s'appeler `gov:check` | Ferme la moitié qui blesse, et laisse l'identifiant du registre divergent de la commande qui le lance : la reconnaissance de l'appel continue de tenir au littéral d'un commentaire, et l'alias reste nécessaire — donc deux noms pour une chose. |
| **Ajouter `gov:termes-interdits` à la chaîne** | Ne ferme rien : le nom désignerait toujours deux choses, et la chaîne resterait un quart de la porte — un quart qui se croit tout. C'est de surcroît le geste que le témoin de GOV-047 fige pour forcer à relire cet arbitrage : le faire sans ADR aurait été le contourner. |
| Déclarer un `alias` au registre, comme le journal du 2026-09 l'avait esquissé | Fait vivre deux noms pour une même garde, et demande deux verbes d'outillage qui n'existent pas. On retire l'ambiguïté, on ne l'inscrit pas au registre. |
| Supprimer la chaîne tout de suite | `scripts/reprise.ts` pointerait vers une commande qui n'existe pas — le défaut exact que GOV-047 ferme. La contraction attend son remplaçant, comme une migration attend son image N-1. |
| Renommer le fichier `scripts/gates/gov-check.ts` | Un chemin n'est pas une commande : nul ne le tape en lisant un rouge. Le renommer déplacerait des références dans le registre, la vue des gates et deux gardes, sans fermer un seul piège. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/un-nom-une-garde.spec.ts` ·
  `it('REQ-GOV-008, REQ-GOV-012 — le nom imprimé par la garde est une commande qui existe et qui lance CETTE garde-là')` : remettre un
  littéral dans le verdict de la garde, ou séparer l'identifiant du registre de la commande, fait rougir ce
  contrôle.
- **Assertion** — `tests/unit/gouvernance/un-nom-une-garde.spec.ts` ·
  `it('REQ-GOV-008 — aucun identifiant du registre n’est, dans package.json, le nom d’AUTRE CHOSE')` : c'est la famille, et
  non le cas nommé — toute future entrée qui porterait le nom d'une chaîne rougit.
- **Assertion** — `tests/unit/gouvernance/un-nom-une-garde.spec.ts` ·
  ``it('REQ-GOV-008 — `gov:check` ne désigne plus rien qui s’exécute : ni script, ni identifiant de registre')`` :
  réattribuer le nom retiré, d'un côté ou de l'autre, fait rougir ce contrôle.
- **Assertion** — `tests/unit/gouvernance/un-nom-une-garde.spec.ts` ·
  `it('REQ-QA-013 — la reconnaissance de l’appel survit au retrait de TOUS les commentaires de ci.yml')` : remettre la
  gate sous la garde d'un commentaire fait rougir ce contrôle.
- **Assertion** — `tests/unit/gouvernance/un-nom-une-garde.spec.ts` ·
  `it('REQ-QA-013 — la chaîne survivante est un sous-ensemble STRICT de la porte A, et son nom ne dit plus « check »')` :
  les deux comptes sont dérivés de `ci.yml` et de `package.json`, jamais gravés.

## Reste à faire

1. **`docs/GLOSSAIRE.md` (lignes 6 et 157) nomme encore la garde `gov:check`.** Fichier réservé au
   `gardien-spec` (CONVENTIONS §8) : cet ADR ne l'écrit pas. Tant que la clause n'est pas reformulée, la
   garde continue de lire ses racines dans cette ligne — la lecture ne porte que sur les chemins entre
   accents graves, avant la flèche, donc rien ne casse ; seul le nom cité est périmé.
2. **`docs/REQUIREMENTS.md` et `docs/requirements.json` (REQ-GOV-001, REQ-GOV-004) écrivent
   `pnpm gov:check` pour la chaîne.** Même écrivain réservé, même renvoi.
3. **Le champ `preuveRouge` de l'entrée reste vide** — clause 2 de l'acceptance de GOV-063, non prise ici :
   elle demande une exécution archivée, pas une décision de conception.
4. **La contraction** : supprimer `gov:partiel` de `package.json` et repointer `scripts/reprise.ts` sur
   `pnpm prevol`, le jour où GOV-047 atterrit sur la branche principale.
5. **Le témoin de GOV-047**, qui lit la chaîne sous son ancien nom, devient muet au lieu de rougir après
   cet ADR : sa mise à jour appartient à la PR de GOV-047, qui est en vol. Le fait qu'il figeait est repris
   ici, sous le nom neuf, par le cinquième contrôle de
   `tests/unit/gouvernance/un-nom-une-garde.spec.ts`.
