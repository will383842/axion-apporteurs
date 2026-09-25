# partners/ADR-0021 — Quatre lentilles pour l'argent, la sécurité et les données, deux pour le reste ; la prose inexacte est une dette, pas un refus

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-25 |
| **Décideur** | `architecte` — cet ADR consigne une décision de Will et la façon dont elle est appliquée ; il n'est pas encore accepté |
| **Tâche** | GOV-097 |
| **Exigences servies** | REQ-GOV-011 |
| **Décisions du registre citées** | `W14` |
| **Règle maison appliquée** | RM-01, RM-02, RM-11 |
| **Remplace / remplacé par** | amende `partners/ADR-0012` : la frontière entre risque ordinaire et risque élevé |

## Contexte

`partners/ADR-0012` (GOV-077) a fait dépendre le nombre de lentilles du **risque** d'une PR, et a
fixé la frontière par deux **listes blanches** : une PR n'était ordinaire que si chacune de ses
tâches était en zone `gouvernance` ou `qualite`, et chacun de ses fichiers sous `docs/`, `scripts/`
ou `tests/`. Tout le reste montait à quatre lentilles — `exactitude`, `securite`, `simplicite` (ou
`schema`) et l'avis `mutation` —, et **chaque refus fait relire les quatre**.

Le 2026-09-25, Will a demandé pourquoi c'était si long. La mesure rapportée avec sa réponse : sept
fusions le 22/09, puis deux, une, une ; 156 des 207 tâches restantes en risque élevé.

La décision de Will (`W14`, `docs/DECISIONS.md` §1) :

1. **Quatre lentilles seulement pour l'argent, la sécurité et les données ; deux (`exactitude`,
   `securite`) pour tout le reste.**
2. **Une inexactitude de PROSE** — corps de PR, journal, ADR, commentaire, docblock — **n'est plus un
   motif de refus** : c'est une dette nommée dans la revue, corrigée au passage suivant. Un refus vise
   un défaut de code ou de test, ou une affirmation fausse qui porte sur la sécurité, l'argent ou les
   données.

## Décision

### (1) La frontière du risque, par signaux

`risqueDeLaPr()` (`scripts/lot/revues.ts`) reste **la seule dérivation**, appelée par `gov:pr` et
par le composeur du corps. Elle ne prouve plus qu'une PR est anodine : elle **cherche** si elle
touche l'argent, la sécurité ou les données. Une PR est de risque **élevé** si et seulement si l'un
de ces signaux est présent :

| Signal | D'où il vient | Pourquoi |
| --- | --- | --- |
| une tâche de la PR (titre, `pr`, `Lot:` ; tête **et** base) porte `sensible` non vide | le registre | `argent`, `attribution`, `auth`, `espace`, `rgpd` : c'est l'argent, la sécurité et les données |
| … ou `sensible` **absent** | le registre | un champ absent ne prouve rien — conservé de `partners/ADR-0012` |
| … ou `schema: true` | le registre | la lentille `schema` de l'architecte |
| … ou une `zone` de `ZONES_A_RISQUE_ELEVE` (`argent`, `securite`) | le registre | la zone compte seule, même à `sensible: []` |
| … ou une `zone` absente, ou que `scripts/lot/tasks.schema.json` ne déclare pas | le schéma, **lu** (RM-01) | une valeur imprévue n'est rien prouvé |
| le label `schema`, ou un chemin de schéma (charte §7) | la PR | inchangé |
| un fichier dans une **zone sensible du code** | `SEGMENTS_DES_ZONES_SENSIBLES` | un segment du chemin nomme l'argent, la sécurité ou les données |
| un fichier du **processus** : la garde des revues, un dossier caché (`.github/`, `.claude/`…), la racine, `config/` | `cheminsDeLaGardeDesRevues()`, `fichierDuProcessus()` | ces fichiers peuvent désarmer les gardes : c'est la sécurité du processus |
| diff vide, liste incomplète, aucune tâche résolue, registre de base illisible | la forge, le registre | échec **fermé**, conservé |

**Ce qui cesse d'élever** : une zone autre que l'argent et la sécurité (`espace`, `juridique`,
`integration`, `domaine`, `console`, `devops`) avec `sensible: []`, et un fichier de code produit
hors des zones sensibles.

**Les listes sont des données nommées**, pas des conditions éparpillées : `ZONES_A_RISQUE_ELEVE`,
`ZONES_SENSIBLES` (qui quitte `scripts/gates/gov-pr.ts` pour le lecteur unique : la section
« Attaque » et le risque la lisent tous deux), `SEGMENTS_DES_ZONES_SENSIBLES`, qui en dérive, et
`DOSSIERS_DU_PROCESSUS`. Les zones connues se lisent dans le schéma du registre, qui entre à ce
titre dans la garde des revues.

### Pourquoi des segments, et pas les préfixes de `ZONES_SENSIBLES`

`ZONES_SENSIBLES` se lit en préfixe depuis la racine (`f.startsWith('auth/')`). Mesuré le
2026-09-25 sur `3625f6c` : **aucun fichier suivi du dépôt ne commence par l'un d'eux** — le code vit
sous `src/`. Repris tel quel, le signal « fichier en zone sensible » n'aurait jamais rien élevé, et
toute PR de code produit à `sensible: []` serait passée à deux lentilles sans que rien ne rougisse.
Un segment se reconnaît à toute profondeur : `src/server/auth/session.ts`,
`src/app/(espace)/connexion/page.tsx`, `src/domain/commission/calcul.ts`, `src/proxy.ts`,
`src/lib/env.ts`.

### Ce qui reste à quatre lentilles, et pourquoi — le processus

La garde des revues, la CI et la racine ne portent ni argent ni données : elles restent élevées
parce qu'elles décident **de ce que les autres PR doivent subir**. Une PR relue à deux lentilles qui
pourrait affaiblir `risqueDeLaPr()`, un workflow, `package.json`, `eslint.config.mjs`, `CLAUDE.md` ou
`.claude/settings.json` désarmerait la règle qui décide combien de lentilles relisent toutes les
autres. C'est la sécurité du processus, et la décision (1) la range sous « sécurité ». Cette PR-ci
touche la garde des revues : elle est elle-même relue par quatre lentilles.

### (2) La prose inexacte est une dette

Écrite dans `docs/CHARTE-AGENTS.md` §6 et dans les interdits du poste A09 (`docs/agents.json`,
fiche `.claude/agents/relecteur.md` régénérée). La lentille rend `Verdict: accepte` et nomme
l'inexactitude comme dette, fichier et ligne. ⚠️ **Rien ne l'outille** : `gov:pr` ne lit pas les
motifs, et tout `Verdict: refuse` bloque. La règle tient dans la main de la lentille.

## Conséquences

- **Le gain, calculé par le code et non à la main** (registre de `3625f6c`, chaque tâche restante
  jugée en PR synthétique à une tâche sur ses `paths` ∪ `tests{}`) : sur les tâches `partners`
  restantes, **31 ordinaires avant, 43 après** ; tous dépôts confondus, **31 avant, 49 après** sur
  208. Le spec `quatre-lentilles-pour-l-argent-la-securite-et-les-donnees.spec.ts` imprime la ligne
  `GOV-097 — tâches partners restantes : …` à chaque exécution : c'est elle qui fait foi, pas ce
  paragraphe.
- **Le gain de (1) est borné par le registre.** La cause dominante de l'élevé n'était pas la liste
  blanche de zones : c'est `sensible` non vide, que la décision garde. La plus grande part du gain
  attendu vient donc de (2), qui réduit le nombre de **tours**, pas le nombre de lentilles.
- **Limite déclarée — les données se lisent par `sensible`.** `partners/ADR-0012` avait mesuré huit
  tâches qui manipulent des données personnelles avec `sensible: []` (INT-T09, INT-T10, INT-T11,
  INT-T13, JUR-T09, UX-P1-07, UX-P3-03, EXT-T05). La liste blanche de zones les rattrapait ; cette
  règle ne les rattrape que si leurs fichiers tombent dans une zone sensible ou du processus. C'est
  une **erreur du registre**, et son remède est au registre : y porter `rgpd`.
- **Les segments sont une liste, et une liste s'oublie.** Un dossier neuf de l'argent nommé
  autrement (`src/paiement/`) passerait ordinaire. Le filet reste la tâche : un travail d'argent
  porte `sensible: [argent]` ou la zone `argent`.

## Alternatives écartées

- **Garder la liste blanche de zones et n'ajouter que `src/` aux chemins ordinaires** : n'aurait rien
  déclassé — la zone suffisait à élever.
- **Lire `ZONES_SENSIBLES` en préfixe** : inerte sur ce dépôt (voir ci-dessus).
- **Descendre la garde des revues, la CI et la racine à deux lentilles** : c'est exactement la PR
  qui peut désarmer toutes les autres.
- **Outiller (2) dans `gov:pr`** (un refus « de prose » qui ne bloquerait pas) : la garde ne sait
  pas juger si une phrase porte sur l'argent ; un tel déclassement serait une porte ouverte à tout
  refus.

## Ce qui le vérifie

- `tests/unit/gouvernance/quatre-lentilles-pour-l-argent-la-securite-et-les-donnees.spec.ts` — vu
  rouge avant le code sur trois témoins (la tâche `espace` à `sensible: []` touchant `src/`, chaque
  zone hors argent et sécurité, le schéma dans la garde), et ses contre-témoins élevés.
- `tests/unit/gouvernance/lentilles-selon-le-risque.spec.ts` — l'oracle indépendant du cas 9 réécrit
  sur la règle neuve : il doit trouver **exactement** les mêmes tâches ordinaires que le code.
- `pnpm gov:pr:prove` — sort en 0, toutes ses familles gardées, un témoin (zone `securite`, deux
  lentilles) et un contre-témoin (zone `espace` touchant `src/`, deux lentilles) de plus.

## Retour arrière

Revenir à `partners/ADR-0012` : rétablir `ZONES_A_RISQUE_ORDINAIRE` (`gouvernance`, `qualite`) et
`CHEMINS_A_RISQUE_ORDINAIRE` (`docs/`, `scripts/`, `tests/`) dans `tacheAElever()` et à la place des
deux signaux de fichiers, et revenir sur les témoins réécrits. Le sens de défaillance reste fermé
dans les deux règles : le retour arrière ne peut qu'**élever** davantage de PR. La règle (2) se retire
par la charte et l'entrée A09 de `docs/agents.json`.

## Reste à faire

- Porter `rgpd` sur les tâches qui manipulent des données personnelles avec `sensible: []` — geste
  du `gardien-spec`, hors de cette tâche.
- La section « Attaque » lit toujours `ZONES_SENSIBLES` **en préfixe** (`scripts/gates/gov-pr.ts`) :
  inerte sur les fichiers de `src/`, elle ne s'exige que par `sensible`. La faire lire par segments
  est un changement de REQ-GOV-011, hors de cette tâche.
