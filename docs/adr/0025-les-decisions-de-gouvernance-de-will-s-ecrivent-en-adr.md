# partners/ADR-0025 — Les décisions de gouvernance de Will s'écrivent en ADR : la règle d'arrêt du 2026-09-15 et les arbitrages des 15 et 16 septembre

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-29 |
| **Décideur** | `architecte` — cet ADR consigne des décisions de Will retrouvées dans les sources du dépôt et de la forge ; il n'en prend aucune, et il n'est pas encore accepté |
| **Tâche** | GOV-058 |
| **Exigences servies** | REQ-GOV-008, REQ-GOV-011, REQ-GOV-013 |
| **Décisions du registre citées** | `W14` (règle 2), `W16` — `docs/DECISIONS.md` §1 |
| **Règle maison appliquée** | RM-01, RM-02, RM-12 |
| **Remplace / remplacé par** | — |

## Contexte

Le 2026-09-15, Will a fixé la **règle d'arrêt** des relectures : un refus ne bloque que sur un écart
démontré et ouvert. Des avis rendus ce jour-là sur les PR #36, #39, #41, #44 et #45 s'en réclament,
puis ceux des PR #46, #47, #48 et suivantes. Mesuré le 2026-09-29, elle n'était **énoncée** dans le
dépôt qu'à un endroit : la rubrique « Fait » de l'entrée de la PR #36 dans `docs/journal/2026-09.md`.
Les entrées des PR #102 et #114 la nomment sans l'énoncer. Le reste vivait hors dépôt : corps de PR,
avis des lentilles. Pendant ce temps, `docs/CHARTE-AGENTS.md` §6
écrivait que « **tout** `Verdict: refuse` bloque », et `docs/PROTOCOLE-FUSION.md` (pas 2) que le refus
de `securite` vaut veto, sans rien dire de la condition. Un lecteur arrivé après le 15 lisait une règle
que personne n'appliquait.

**Le texte de Will lui-même n'est pas retrouvé.** Aucune source du dépôt ni de la forge ne le cite
entre guillemets comme sien. Ce qui est retrouvé, ce sont trois reformulations concordantes par les
agents qui l'ont appliqué, le jour même :

- l'entrée de journal de la PR #36 : « un refus ne bloque que sur un échec **ouvert**, fabriqué et vu ;
  le reste est une dette » ;
- le corps de la PR #44, rubrique « Dettes déclarées (règle d'arrêt) » : « Décision de Will du 15/09 :
  un refus ne bloque que s'il démontre une vraie faute qui passe en exit 0 » ;
- l'avis `A10 · mutation` 5206281536 sur la PR #44 (2026-09-15T06:24Z), qui corrige une consigne plus
  large que le texte : « Le texte de Will du 15/09 n'en parle pas : un refus ne bloque que s'il
  démontre, par une panne fabriquée et vue, qu'une vraie faute passe en exit 0 (échec OUVERT) sur ce
  que la garde prétend garder. Tout autre motif, dont un cas limite ou une limite déjà déclarée, est une
  DETTE. »

L'acceptance de la tâche nomme trois autres décisions et demande celles du 15 **et** du 16 septembre.
Deux ont été retrouvées avec leur source, deux autres, que le corps de la PR #46 range avec elles,
aussi ; deux ne l'ont pas été (table ci-dessous).

**Le lieu.** L'acceptance demande « un ADR de `docs/adr/partners/` ». REQ-GOV-008 interdit un second
dossier d'ADR, et `gov:adr` rougit en `dossier_double` sur un sous-dossier. `partners/` se lit donc ici
comme le **qualificatif de série** (`partners/ADR-nnnn`), pas comme un chemin : c'est la lecture qu'a
déjà faite `partners/ADR-0018`, dont la tâche déclarait le même chemin (constat écrit sous « Reste à
faire » de `partners/ADR-0019`).

**Le registre.** L'acceptance écarte `docs/DECISIONS.md` comme « registre PRODUIT, sans écrivain ».
Mesuré le 2026-09-29, deux faits le nuancent, et cet ADR ne les tranche pas : la charte (§4) donne ce
registre à **A01** ; et depuis le 2026-09-25 il porte des lignes de gouvernance (`W14`, `W16`, `W17`,
`W18`), chacune renvoyant à l'ADR qui en écrit l'application.

## Décision

**Le lieu nommé.** Une décision de gouvernance de Will s'écrit dans un ADR de `docs/adr/`, série
`partners/`, selon le gabarit `docs/adr/0000-gabarit.md`. Une décision de gouvernance est une règle qui
dit comment les agents relisent, refusent, cochent, clôturent ou fusionnent. L'ADR la **consigne** : il
cite sa date, sa source et ses mots quand ils sont retrouvés, et ne la reformule pas en décision
nouvelle. Ce qui n'est pas retrouvé s'écrit « non retrouvé ».

**L'écrivain.** **A02** `architecte` rédige l'ADR et le fait passer à `accepte` (charte §3 et §4,
label `role:architecte`). **A03** `documentaliste` l'indexe, par `pnpm adr:index` (charte §7). Aucun
de ces deux postes ne décide : une décision que les sources ne portent pas est rendue à Will.

**Règle d'arrêt.** Décision de Will du 2026-09-15 : un refus ne bloque que sur un écart démontré et ouvert — une panne fabriquée et vue, où une vraie faute passe en exit 0 sur ce que le code prétend garder ; tout autre motif est une dette, nommée dans l'avis et non bloquante.

La règle tient dans la main de la lentille, pas dans la garde : `gov:pr` ne distingue pas les motifs,
et bloque sur tout `Verdict: refuse`. Une lentille qui n'a pas démontré d'échec ouvert rend donc
`Verdict: accepte` et liste ses dettes.

**Réversibilité.** La règle se retire ou se modifie par une décision de Will postérieure, écrite dans un
ADR qui remplace celui-ci. Le retour arrière ne rejuge aucune PR fusionnée : les dettes nommées sous la
règle restent des dettes. Il coûte un passage sur `docs/CHARTE-AGENTS.md` et
`docs/PROTOCOLE-FUSION.md`, que la garde de cet ADR désigne phrase par phrase.

### Les décisions des 15 et 16 septembre

| Date | Décision | Décideur | Source | Portée | Réversibilité |
| --- | --- | --- | --- | --- | --- |
| 2026-09-15 | Règle d'arrêt : un refus ne bloque que sur un écart démontré et ouvert ; le reste est une dette | Will | `docs/journal/2026-09.md`, entrée de la PR #36 ; corps de la PR #44 ; avis 5206281536 et 5205878925 | Toute relecture par lentille, sur toute PR, depuis le 2026-09-15 | Par une décision de Will écrite dans un ADR qui remplace celui-ci ; aucune PR fusionnée n'est rejugée |
| 2026-09-15 selon le corps de la PR #46 ; 2026-09-16 selon `docs/tasks.json` | Les cinquième et sixième livrables de GOV-037 en sortent et deviennent GOV-056, phase 0 | Will | Corps de la PR #46 (« Trois décisions de Will du 15/09 ») ; `acceptance` de GOV-037 et de GOV-056 dans `docs/tasks.json` (« le 2026-09-16 par décision de Will ») — les deux dates sont écrites telles quelles, aucune source ne les départage | Le registre des tâches : périmètre de GOV-037 et de GOV-056 | Consommée : GOV-056 est `fusionnee` (PR #48). Revenir en arrière demanderait une tâche neuve, pas une réécriture |
| 2026-09-15 | L'`acceptance` de GOV-036 est alignée sur ce que la PR #39 a livré | Will | Corps de la PR #46 ; entrée de journal de la PR #46 | Le registre des tâches : le texte d'acceptance d'une tâche déjà livrée | Réécriture du champ par l'outil hors dépôt, sur une nouvelle décision |
| 2026-09-15 | L'`acceptance` de GOV-049 admet la tâche livrée seule, sans lot | Will | Corps de la PR #46 ; avis `A09 · securite` 5226762407 sur la PR #46, qui la nomme « Décision de Will » | Le registre des tâches, et la clôture d'une tâche seule | Réécriture du champ par l'outil hors dépôt, sur une nouvelle décision |
| non retrouvé | Qui coche les cases 3 et 8 de la définition de « terminé » | non retrouvé | Aucune décision datée du 15 ou du 16 n'est retrouvée. Ce qui est écrit : l'avis `A09 · securite` 5226762407 (2026-09-16) dit que les cases vides sont « le travail d'A04 avant la fusion » ; le corps de la PR #48 (2026-09-17) dit « c'est Will qui atteste » ; `docs/PROTOCOLE-FUSION.md`, pas 8, fait cocher la huitième après la fusion | Aucune tant que la décision n'est pas retrouvée | Sans objet : rien n'est consigné |
| non retrouvé | Le nom de la garde des termes interdits | non retrouvé | Aucune décision de Will datée du 15 ou du 16 n'est retrouvée. Le 2026-09-15, le corps de la PR #44 écrit un « choix d'intégration » de son auteur, les scripts `gov:termes-interdits` et `gov:termes-interdits:prove`, qui « ne tranchent pas l'homonymie ». La question est tranchée le 2026-09-22 par `partners/ADR-0018`, décideur `architecte` | Aucune ici : `partners/ADR-0018` la porte | Sans objet : rien n'est consigné |

Deux décisions datées du 2026-09-16 sont écrites dans `docs/tasks.json` sans que leur décideur soit
nommé : les avertissements ESLint rendus en erreur (acceptance de QA-T01) et le report des trois gates
d'accessibilité à la phase 1 (acceptance de UX-P0-03). Elles sont déjà dans le dépôt, et ce sont des
règles de gate, pas de relecture. Cet ADR ne les consigne pas.

## Conséquences

- **Les documents tenus d'accord.** Ce sont les documents Markdown que la tâche déclare dans ses
  `paths`, hors du dossier des ADR : `docs/CHARTE-AGENTS.md` et `docs/PROTOCOLE-FUSION.md`. Toute phrase
  de ces documents qui affirme qu'un refus bloque cite `partners/ADR-0025`. La garde est
  `tests/unit/gouvernance/decisions-de-gouvernance-ecrites.spec.ts`. Elle confronte chaque affirmation
  à la ligne ouverte par « Règle d'arrêt. » ci-dessus. Une affirmation qui ne la cite pas fait fauter
  la garde, qui nomme les deux endroits.
- **L'articulation avec `W14` (règle 2) et le veto.** Le 2026-09-15, l'avis d'une lentille sur une
  tâche sans `sensible` « compte à la majorité » (avis de la PR #45) ; le veto de `securite` du
  2026-09-18 retire cette majorité. Aucune source retrouvée ne dit qu'il lève la règle d'arrêt, et
  l'entrée de journal de la PR #102 l'applique encore le 2026-09-23. `W14` (règle 2), du 2026-09-25, dit ce qu'un refus **vise** : un défaut de code ou de
  test, ou une affirmation fausse sur la sécurité, l'argent ou les données. Sur un défaut de code ou de
  test, les deux textes se recouvrent : la règle d'arrêt dit quand ce refus bloque. L'affirmation fausse
  de prose, elle, ne sort aucun code, et aucune source retrouvée ne dit si elle doit être démontrée au
  sens de la règle d'arrêt. Cet ADR ne tranche pas ce point (« Reste à faire »).
- **Ce que la garde ne voit pas.** Une affirmation écrite sans aucun mot de la famille « refus » échappe
  au motif lexical. C'est une limite déclarée dans l'en-tête de la spécification, pas un vert.
- **Le coût.** Chaque phrase neuve de la charte ou du protocole qui parle d'un refus bloquant doit citer
  cet ADR. C'est le prix voulu : une règle de relecture non citée est ce qui a coûté ce défaut.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Un sous-dossier `docs/adr/partners/` | REQ-GOV-008 impose un dossier unique ; `gov:adr` rougit en `dossier_double` |
| Écrire les décisions dans `docs/DECISIONS.md` | Fichier réservé à A01, hors des `paths` de la tâche ; l'acceptance l'écarte |
| Retirer de la charte la phrase « tout `Verdict: refuse` bloque » | Elle est vraie de `gov:pr` : la retirer effacerait un fait sur l'outil au lieu d'y accorder la règle |
| Compléter les deux décisions non retrouvées à partir de la pratique observée | Ce serait inventer une décision de Will ; le gabarit l'interdit (§3) |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/decisions-de-gouvernance-ecrites.spec.ts` ·
  `it('REQ-GOV-011 · contre-témoin : le dépôt accordé rend zéro faute, avec le compte des affirmations confrontées')` :
  une phrase de la charte ou du protocole qui affirme qu'un refus bloque sans citer cet ADR la fait
  rougir. Son témoin, dans le même fichier, plante une telle phrase dans une copie de travail et exige
  que la faute nomme la phrase et la ligne de la règle.

## Reste à faire

- **L'articulation de `W14` (règle 2) avec la règle d'arrêt**, pour une affirmation fausse de prose
  sur la sécurité, l'argent ou les données : rendue à Will. Aucune tâche ouverte ne la porte.
- **Les deux décisions non retrouvées** — qui coche les cases 3 et 8, et le nom de la garde des termes
  interdits : si Will confirme qu'il les a prises le 15 ou le 16, elles s'ajoutent à la table, avec leur
  source.
- **Le passage à `accepte`** par A02, qui juge alors l'assertion ci-dessus.
- **`partners/ADR-0012`** annonce qu'il citera sa décision du 2026-09-18 dans le lieu que cet ADR
  nomme. Ce fichier est hors des `paths` de cette tâche.
