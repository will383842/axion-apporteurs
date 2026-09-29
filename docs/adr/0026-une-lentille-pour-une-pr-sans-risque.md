# partners/ADR-0026 — Une lentille pour une PR sans risque, deux pour tout le reste et dans le doute

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-29 |
| **Décideur** | `architecte` — cet ADR consigne une décision de Williams et la façon dont elle est appliquée ; il n'est pas encore accepté |
| **Tâche** | GOV-124 |
| **Exigences servies** | REQ-GOV-011, REQ-GOV-013 |
| **Décisions du registre citées** | `W16` — `docs/DECISIONS.md` §1 |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | amende `partners/ADR-0024` : sa règle « deux lentilles partout » ; le reste est conservé |

## Contexte

Mesuré le 2026-09-29 : chaque PR, même une page de documentation ou un rattrapage du registre,
attendait deux avis, et les deux lentilles étaient le goulot du chantier. Le même jour, vers 18 h,
Williams a décidé, en exception au gel de la gouvernance : « une seule lentille pour les PR sans
risque (docs, tests, outillage interne), deux lentilles pour tout le reste ». Il l'a confirmé
directement dans la session A01. Les deux lentilles ont annoncé leurs exigences avant le code : un
classement dérivé et fermé, et ce qui est illisible vaut deux.

## Décision

1. `lentillesExigees()` rend **une** lentille, `exactitude`, quand `risqueDeLaPr()` classe la PR
   ordinaire **et** pose `uneLentille`. Dans tous les autres cas, elle rend les deux (`exactitude`,
   `securite`), plus `schema` dès que la PR touche au schéma.
2. `uneLentille` est **dérivé** dans `risqueDeLaPr()`, jamais déclaré par l'auteur. Il n'est vrai que si
   toutes ces conditions tiennent : au moins une tâche est résolue ; chaque tâche résolue, sur la tête
   comme sur la base, est d'une zone de `ZONES_A_UNE_LENTILLE` (gouvernance, qualité) ; le diff n'est
   pas vide ; chaque fichier est sous `RACINES_A_UNE_LENTILLE` (`docs/`, `tests/`, `scripts/vues/`,
   `scripts/plan-state/`). `scripts/lot/` n'y est pas : il porte la garde des revues, la clôture et
   les écrivains du registre.
3. Les deux listes sont des listes d'**autorisation**, donc fermées. Tout chemin qu'elles ne nomment
   pas reste à deux lentilles : `src/`, `scripts/gates/`, `scripts/lot/`, `scripts/image/`, `prisma/`, `config/`, la
   racine, les dossiers cachés, et tout dossier à venir. Toute zone qu'elles ne nomment pas aussi :
   l'argent, la sécurité, le juridique, les données du domaine, l'intégration, le déploiement.
4. La garde des revues reste à deux lentilles : `risqueDeLaPr()` l'élève avant de lire la liste.
5. **Les registres du calcul et les textes du processus valent deux lentilles, même sous `docs/`**
   (`EXCLUS_D_UNE_LENTILLE`). Il s'agit de `docs/tasks.json`, `docs/requirements.json`,
   `docs/DECISIONS.md`, `docs/agents.json`, `docs/gates.json`, la charte, les conventions, le
   protocole de fusion, `docs/adr/` et les schémas des registres. C'est un relevé de la lentille
   `exactitude` sur la PR #246 : relu par une seule lentille, un `sensible` retiré d'une tâche ferait
   passer à une lentille toutes ses PR suivantes, sans `securite`. Les rattrapages du registre restent
   donc à deux lentilles.

## Conséquences

Une PR de documentation, de tests ou d'outillage des vues n'attend plus qu'un avis. Le refus
d'`exactitude` y bloque seul. La lentille `securite` garde son veto sur tout le reste.

**Limite déclarée, dépôt public** (relevé de la lentille `securite`, PR #246). Une PR de documentation
ou de tests peut, sans toucher au code, décrire la limite d'une garde (une forme de contournement) ou
porter des fixtures. Le dépôt est public, et une seule lentille, `exactitude`, la relira. Aucune
dérivation ne sait lire l'intention d'un texte : la règle ne le prétend pas. Deux protections
restent : les données de fixture sont jugées en porte A par `gov:entite` sur chaque commit de la PR
(GOV-066), quelle que soit la lentille ; et l'auteur qui décrit un contournement le place dans une PR
qui touche aussi la garde concernée, sous `scripts/gates/`, donc à deux lentilles.

## Alternatives écartées

- **Élargir le risque « ordinaire » actuel** : il laisse ordinaires des fichiers de `src/` hors zone
  sensible et des `scripts/gates/*` hors de la garde des revues (dette nommée dans `revues.ts`).
  Une lentille y serait trop peu.
- **Un label posé par l'auteur** : le classement serait déclaré, pas dérivé.

## Ce qui le vérifie

`tests/unit/gouvernance/une-lentille-pour-une-pr-sans-risque.spec.ts` : une PR de documentation seule
exige une lentille ; la même PR avec un fichier sous `src/` ou `scripts/gates/` en exige deux ; une
liste incomplète, une tâche non résolue ou une zone hors liste aussi ; aucun label n'y change rien.

## Reste à faire

Accepter cet ADR (architecte).
