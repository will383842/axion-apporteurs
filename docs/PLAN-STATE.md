# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `6237f96` — 2026-09-13T10:31:35+02:00 |
| Qu’est-ce qui est en vol ? | 1. #36 (rien) |
| Qui tient quoi ? | GOV-035 (A01) |
| Où en est la phase ? | phase -1 — 34/39 tâches, reste 3.50 j |
| Le prochain pas | fusionner #36, puis GOV-035 — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 0 question(s) pour Will |
| Dernière entrée de journal | PR #35 — 2026-09-13 |

**Ce qu’on tape maintenant.** `gh pr view 36 --json mergeStateStatus` puis la fusion dans le MÊME appel (RM-09). Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : -1

34/39 tâches terminées · reste 3.50 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `a_faire` | 191 | JUR-T02, QA-T01, SEC-01, SEC-02, SEC-10, QA-T08, DM-01, DM-02, QA-T02, QA-T04, QA-T03, QA-T07 … |
| `en_cours` | 0 | — |
| `en_revue` | 0 | — |
| `fusionnee` | 34 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |

## Chemin critique

**19.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (0.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **16.50 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

Aucune : toutes les décisions dont la phase courante dépend ont une hypothèse posée dans `docs/DECISIONS.md`.

## Hypothèses par défaut appliquées

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #36 — feat(GOV-035): docs/PLAN-STATE.md avait un generateur et aucun verificateur | `t/gov-035` | rien — fusionnable maintenant |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:<Axx>` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| GOV-035 — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur | A01 | #37 | `a_faire` |

⚠️ **15 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-13 (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre `docs/DECISIONS.md`, tranchées ou tenues par une hypothèse datée.

## Prochain pas

1. **Fusionner #36** — elle est en tête de file et ne bloque sur rien. Lire `mergeStateStatus` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage.
2. **GOV-035** — docs/PLAN-STATE.md est la cinquieme vue de REQ-GOV-032, et la seule sans verificateur (0.5 j) : 5 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `6237f96` (2026-09-13T10:31:35+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

> Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #35 — 2026-09-13 — docs(GOV-023): entree de journal de la PR 34, et la boucle qui la produit

**Fait.** `main` était rouge sur Gate A depuis la fusion de la PR #34 —
`pr_fusionnee_sans_journal`, REQ-GOV-023. Cette PR écrit l'entrée qui manquait et porte **aussi la
sienne**, celle que vous lisez. Elle régénère `docs/PLAN-STATE.md` : cette régénération n'est pas
cosmétique — sans elle la boucle se referme par l'autre bout, `plan_state_perime` (mesuré par A10 ·
mutation, et corroboré par la CI réelle : Gate A est `failure` sur `758d318`, le commit qui pose
l'entrée sans régénérer la vue).

**Reste.** **GOV-052** — l'obligation ne s'évalue qu'APRÈS la fusion, donc sur `main`, donc trop
tard pour refuser quoi que ce soit. La tâche porte la garde pré-fusion et sa règle `RM-15` ; elle
n'est acceptée que sur un témoin vu rouge, jamais sur « la règle est écrite ». Elle ferme aussi le
trou réciproque mesuré ici : une entrée `## PR #99` pour une PR **inexistante** passe les neuf
familles, exit 0 — un journal public peut affirmer un atterrissage qui n'a pas eu lieu.

**Appris.** *Une règle écrite pour un lecteur n'a pas de témoin, et une pratique sans témoin se perd
sans que sa perte fasse de bruit.* Le compte se rejoue, il ne se retape pas :

```
for n in 28..34 ; git show <commit de fusion #n>:docs/journal/2026-09.md | grep -qE "^## PR #$n "
```

→ **#28, #33, #34 rouges** à leur fusion ; **#29, #30, #31, #32 vertes**. La règle a donc **tenu
quatre fusions d'affilée, puis s'est perdue** — et rien ne l'a vu. `ab5caf5` (#29) ajoute *les deux*
en-têtes, `#29` et `#28`, dans le même commit : c'est le **précédent** exact de ce que cette PR
fait, pas sa découverte. La règle n'était pas absente non plus — `docs/journal/README.md` la donne
mot pour mot, `docs/REPRISE-SESSION.md` la répète, et `docs/LECONS.md` LEC-15 en tire déjà la leçon
en concluant « Règle maison. **Aucune à ce jour** ». Trois rédactions et une leçon n'ont pas suffi ;
une quatrième n'aurait pas suffi davantage. **Une leçon qui ne devient pas une garde se réapprend.**

⚠️ Et c'est la seconde fois de suite que ce lot **retape un total plutôt que de le dériver** : la
PR #34 avait déjà payé quatre fois le motif « le nombre est retapé et faux », et son remède — retirer
le nombre, mettre la commande qui le rend — était écrit. Le premier jet de cette entrée annonçait
« six PR » là où la mesure en donne trois. Le remède connu n'a pas été appliqué parce qu'il vivait
dans une entrée de journal, c'est-à-dire, encore, dans de la prose.

### PR #34 — 2026-09-13 — chore(GOV-038): clot le lot L-1-05 et verse dix manques mesures en taches

**Fait.** Le lot `L-1-05` est clos — `GOV-014`, `GOV-019`, `GOV-028` et `GOV-038` passent
`fusionnee`, la phase −1 va de 30/39 à 34/39, et Gate A, rouge depuis la fusion de #33, se referme.
Onze manques mesurés entrent au backlog (`GOV-041`→`GOV-051`) : six ouverts le 2026-09-09 qui ne
vivaient que dans un document **hors dépôt**, un trouvé par une garde sur moi, un rencontré en
faisant le travail, trois trouvés par les lentilles de cette PR. 212 → 223 tâches, 157,25 → 163,75 j.

⚠️ **`GOV-038` portait `lot: null`.** La liste des tâches d'une clôture se dérive du champ `lot`
parce que `docs/lots/` est hors git : aucune clôture ne l'aurait jamais vue, et elle serait restée
`en_cours` pour toujours. Mesuré par mutation, refait par exactitude : l'état d'avant reconstitué,
quatre vues régénérées, `gov:check` **16/16 exit 0** — rien ne rougit. Versé en `GOV-049`.

**Reste.** Cinq tâches de phase −1, 3,50 j, **toutes écrites et poussées** : `GOV-030`, `GOV-031`,
`GOV-035`, `GOV-036`, `GOV-037`. Trois d'entre elles écrivent dans `.github/workflows/ci.yml` et ne
peuvent donc pas partager un lot — elles atterriront une par une. `GOV-037` introduit un
`process.exit(1)` à déclarer au cliquet **au moment de sa fusion**, le seuil étant global. Et
`INT-T01a` reste `fusionnee` sans livrable : le repasser `a_faire` fait baisser le pourcentage,
c'est un arbitrage de Will. Restent aussi cinq **succédanés** énumérés dans
`outils/DETTE-DES-SUCCEDANES.md`, avec le geste unique qui les ferme.

**Appris.** Onze tours, huit têtes, quarante-cinq verdicts, **zéro faux vert dans le livrable** —
et onze défauts réels dans les OUTILS qui l'écrivent. Trois choses, chacune payée d'un rouge.

D'abord, **le nom ne fait pas la chose**. J'ai appelé « forme normale » un inventaire de menaces,
pendant quatre rédactions, sans jamais appeler la normalisation ; « batterie permanente » un
dossier temporaire ; « quatre clauses » un code qui en appliquait trois ; et j'ai intitulé un commit
d'après un correctif qu'il ne portait pas. Le contrôle de chemin a échoué QUATRE fois, en sens
opposés : une liste blanche de caractères refusait 51 des 665 chemins réels — elle interdisait du
légitime, en silence ; puis une liste de menaces qu'une seule espace en tête défaisait ; puis la
même, qu'un caractère invisible défaisait encore ; puis une clause restée inventaire, que `./x`
défaisait. Chaque fois, le dégât dépassait l'écrivain : `gov-conventions.ts` teste
`p.startsWith('axionia/')`, et un `<U+200B>` devant un chemin du dépôt voisin amenait
`pnpm gov:check` de exit 1 à **16/16 exit 0**, sur un caractère invisible dans un diff.

Ensuite, et c'est la formulation d'une lentille qui explique les quatre d'un coup : **l'instrument
mesurait un succédané au lieu de la chose**. Un code de sortie tenu pour un refus — une trace de
pile comptée « conforme » ; une espèce tenue pour la branche — un compteur INFALSIFIABLE affichant
zéro depuis huit tours ; le texte source tenu pour la population — une branche de huit caractères
hors du seuil ; les octets du disque tenus pour le contenu — trois valeurs d'empreinte pour un même
sha. *Une seule décision de conception payée quatre fois : le témoin est à l'extérieur de son sujet,
donc il re-dérive du dehors ce que le sujet pourrait exposer.* Corollaire, d'une autre lentille sur
elle-même : **falsifiable n'est pas exhaustif** — un témoin vu rougir prouve qu'il PEUT parler,
jamais qu'il parle de TOUT son sujet.

Enfin, **le pas 5 ne protégeait que la tête du dépôt**. Les outils qui écrivent `docs/tasks.json`
n'étaient versionnés nulle part : deux lentilles ont accepté sur une version dont il ne restait
aucune trace, et un correctif écrit à 07:02 a disparu à 07:05 sans laisser d'absence mesurable.
Pire, mesuré : **onze empreintes distinctes sur douze courses** de la batterie — le fichier jugé
était réécrit pendant sa lecture, et des refus fermés depuis cinq tours en ressortaient VERTS. Cela
a refermé un mystère qu'une lentille avait eu l'honnêteté de ne pas retenir deux tours plus tôt :
un chemin hostile accepté qu'elle ne savait pas reproduire n'était pas un trou de l'écrivain,
**c'était une lecture en plein milieu d'une écriture**. Le dossier est désormais un dépôt git sans
remote, un verdict nomme le COUPLE (sha du dépôt, sha des outils), les outils sont GELÉS pendant un
tour, et un changement d'ÉCRIVAIN périme le livrable quand un changement d'INSTRUMENT ne périme que
la mesure.

### PR #33 — 2026-09-12 — chore(GOV-014): reconcilie gov-038 — quatre taches de phase -1, et le faux vert qui n'entrait en conflit avec rien

**Fait.** `lot/gov-038-attestation`, orpheline depuis le 2026-09-05, est réconciliée avec `main` par
un merge à deux parents (`8e9113f` + `f856704`). Elle apporte `GOV-014`, `INT-T01b`, `GOV-019`,
`GOV-028` et `GOV-038` elle-même. **22 conflits, ~128 blocs** : 7 vues régénérées jamais résolues,
2 registres fusionnés **par identifiant** avec un outil hors dépôt qui REFUSE et NOMME toute entrée
touchée des deux côtés (4 dans `gates.json`, 10 dans `tasks.json` — aucune résolue par une règle),
et 5 gardes tranchées au sur-ensemble, mesuré export par export. Le dépôt passe de 29 à 30 tâches
livrées sur 212, de 16,75 à 17,75 j sur 157,25.

**Le faux vert est arrivé sans aucun conflit.** `scripts/gates/gov-conventions.ts` est un fichier
NEUF de `gov-038` : il portait le `try/catch { return [] }` que la PR #31 avait fermé pour les cinq
autres gardes, et `package.json` le faisait déjà entrer dans la chaîne bloquante `gov:check`. Un
fichier ajouté d'un seul côté ne se confronte à rien — aucun conflit ne l'a signalé. Converti :
**six** gardes passent désormais par la source unique.

**Reste.** Onze tours de revue, vingt-deux motifs rendus par les quatre lentilles — et **aucun** ne
portait sur la résolution des conflits : tous visaient le code ajouté hors résolution, ou le récit.
`GARDES_QUI_BALAIENT` a dû être **renversée** — dérivée du disque, puis DÉCLARÉE — parce qu'une
population dérivée de la présence du correctif ne voit pas celui qui le perd. Le plancher du cliquet
a demandé quatre rédactions avant de tenir. Restent versés en tâches, non corrigés ici (A11) : le
cliquet garde un COMPTE et non une IDENTITÉ (25 sorties échangeables sur les 8 entrées à delta nul,
et le registre ne couvre que 12 fichiers sur 33) ; `perf-budgets.ts:472` porte un
`if (!existsSync(racine)) return []` qu'aucune tâche ne porte ; et `gov-attestation.ts` est le seul
des 24 scripts de garde absent de `docs/gates.json`, ce qui l'exempte de la famille
`garde_ecrite_jamais_appelee` que ce lot livre — la forme exacte du défaut qu'il vient de renverser
ailleurs, réintroduite le même jour.

**Appris.** Trois choses, chacune payée d'un rouge. D'abord, **le merge ne protège que ce que les
DEUX branches ont touché** : un correctif qu'une branche n'a pas vu passer rentre par la porte
qu'aucune garde ne surveille, et le devis d'une réconciliation ne vieillit que dans un sens — 8
conflits mesurés contre une tête, 22 contre `main` deux fusions plus tard. Ensuite, **une garde qui
cherche ses sujets par le correctif qu'ils portent ne verra jamais celui qui le perd** ; la liste
doit être une déclaration, que seul un humain retire, et la réciproque n'attrape que l'oubli
inverse. Enfin, **corriger aux numéros de ligne d'un relecteur n'est pas corriger le défaut** :
deux fois dans cette PR j'ai fermé l'occurrence citée en laissant les autres, et c'est la lentille
qui a dû revenir. Un relecteur qui cite une ligne donne un exemple, jamais l'inventaire. Corollaire
mesuré le même jour : un commentaire qui survit à son code ne décrit plus rien, il désinforme — le
fichier affirmait à trois endroits l'inverse du design livré.

… 7 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

