# partners/ADR-0005 — La gouvernance : ce qui est source, ce qui est vue, qui écrit quoi

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | GOV-009 |
| **Exigences servies** | REQ-GOV-008, REQ-GOV-001, REQ-GOV-002, REQ-QA-014, REQ-GOV-010, REQ-GOV-015, REQ-GOV-021, REQ-GOV-031, REQ-CPL-021 |
| **Décisions du registre citées** | W13 |
| **Règle maison appliquée** | RM-01 |
| **Remplace / remplacé par** | — |

## Contexte

Un projet mené par une flotte d'agents produit sa dette la plus chère dans ses **documents** : deux
fichiers qui se contredisent, une décision prise et jamais écrite, un chiffre recopié qui ne change
qu'à deux endroits sur trois. Le plan directeur a porté trois totaux différents pour le même
portefeuille de tâches. Aucun de ces défauts n'était visible : rien ne disait quel fichier faisait foi
ni qui avait le droit de l'écrire.

## Décision

### 1. Trois natures de fichiers, une seule règle : une vue ne s'édite pas

Deux lignes de ce tableau décrivent un fichier **qui n'existe pas encore** : elles portent la mention
« à venir » et la tâche qui les fermera. Un tableau qu'on lit comme un constat alors qu'il décrit une
intention est exactement le défaut que cet ADR prétend traiter.

| Fichier | Nature | Écrivain |
| --- | --- | --- |
| `docs/requirements.json` | **source** | `gardien-spec` |
| `docs/REQUIREMENTS.md` | **vue** générée depuis la source | aucun script du dépôt ne la régénère aujourd'hui ; écrivain réservé `gardien-spec` (CONVENTIONS §8) |
| `docs/tasks.json` | **source** | `gardien-spec`, et l'orchestrateur pour la composition d'un lot |
| `docs/TASKS.md` | **vue** générée depuis `tasks.json` | le script (`pnpm gov:tasks --render`) |
| `docs/DECISIONS.md` | **source** | `gardien-spec` seul |
| `docs/GLOSSAIRE.md` | **source** | `gardien-spec` seul |
| `docs/PRESEANCE.md` | **source** — **à venir**, GOV-002 (REQ-GOV-002) | `gardien-spec` seul |
| `docs/gates.json` | **source** | la tâche qui pose la garde |
| `docs/REGLES-MAISON.md`, `docs/CONVENTIONS.md` | **source** | lot dédié, jamais une édition de passage |
| `docs/adr/**` | **source** | rédigé par la tâche, accepté par l'`architecte`, indexé par le `documentaliste` |
| `docs/adr/INDEX.md` | **vue** dérivée du système de fichiers | le script (`pnpm adr:index` ; le gabarit `0000` n'est pas indexé) |
| `docs/PLAN-STATE.md` | **vue** dérivée des tâches, des tickets et de git | le script (`pnpm plan-state:build`), commité par l'orchestrateur seul (poste A01, CONVENTIONS §8) |
| Matrice de traçabilité | **vue** dérivée des tests et des PR (REQ-QA-014) — **à venir**, GOV-011 pose `req:check`, QA-T03 l'arme en Gate A | le script |

Éditer une vue à la main n'est pas un raccourci : c'est un défaut, parce que la prochaine génération
l'effacera sans que personne ne s'en aperçoive. La correction d'une vue se fait dans sa **source** ou
dans le **script** qui la produit.

### 2. Ce qui prévaut en cas d'écart

Le **registre des décisions** prévaut sur les documents sources qui l'ont alimenté. `CONVENTIONS.md`
prévaut sur le paragraphe correspondant du plan directeur. Pour une règle métier présente dans deux
documents, `docs/PRESEANCE.md` désigne la version en vigueur et l'exigence qui la porte (REQ-GOV-002).

### 3. Ce qu'un ADR fait, et ce qu'il ne fait pas

Un ADR consigne une décision d'architecture que rien d'autre ne porte (REQ-GOV-008). Il **ne tranche
jamais une décision de Will** : celles-ci vivent au registre, tranchées ou tenues par une hypothèse
datée. Une tâche à qui il manque une décision sans hypothèse **s'arrête** et le dit ; elle ne devine
pas (REQ-GOV-015). Seul l'`architecte` accepte un ADR (REQ-GOV-010).

### 4. Une garde n'existe qu'après avoir rougi

Toute garde a une ligne dans `docs/gates.json` portant son cas d'échec et la preuve qu'elle a échoué
avant de garder quoi que ce soit (RM-02). Une garde armée sans preuve peut mesurer autre chose que sa
cible pendant des mois sans que rien ne le signale.

### 5. Le dépôt est public

W13 l'a tranché. Trois catégories n'y entrent jamais (REQ-GOV-031) : l'analyse du risque relationnel
et toute explication du pourquoi d'une règle relationnelle ; les seuils de détection d'abus ; les
montants et les taux du réseau. Un test dit **ce qu'il vérifie**, jamais pourquoi. Ces valeurs vivent
en configuration ou en base.

### 6. Un identifiant se cite qualifié

`HYP-…`, `DEC-…`, `W<n>`, `REQ-…`, `RM-nn` (RM-12). Une étiquette de relecteur ne résout pas, ne se
date pas et n'a pas de propriétaire.

### 7. L'autonomie des agents est un fichier, pas une intention

La matrice d'autonomie **est** `.claude/settings.json` et son crochet d'environnement (REQ-CPL-021) :
`gov:autonomie`, posée par GOV-000, **rougira** sur toute ligne de la matrice sans règle
correspondante. Son script n'est pas écrit et sa `preuveRouge` est encore nulle dans
`docs/gates.json` — au présent, cette phrase décrit une intention, pas un contrôle (RM-02).

## Conséquences

Le `release-manager` est **le seul à fusionner** et l'orchestrateur le seul à écrire l'état du plan
(REQ-GOV-010, qui définit neuf rôles à droit exclusif) : les autres rôles **rendent** du contenu, ils
ne l'écrivent pas dans le dépôt. Les leads de domaine découpent et valident l'acceptation ; ils ne
fusionnent pas. C'est ce partage qui permet de sérialiser les fusions (`partners/ADR-0006`).

Une question ouverte n'est plus un blocage silencieux : elle devient une ligne du registre avec un
propriétaire et une échéance, ou un arrêt explicite de la tâche.

Le prix de cette organisation est réel : plus de scripts, plus de gardes, et l'obligation de passer
par une source pour corriger une phrase visible. Il est payé une fois ; l'incohérence, elle, se paie
à chaque lecture.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Tenir l'index des ADR et l'état du plan à la main | Un index tenu à la main s'arrête le jour où quelqu'un oublie de l'ouvrir ; c'est exactement la dérive qui a motivé REQ-GOV-008. |
| Un document unique de spécification | Personne ne sait plus qui écrit quoi, et deux agents écrivent la même section en même temps. |
| Laisser chaque agent éditer les documents partagés | Sept documents ont numéroté leurs décisions chacun de leur côté ; on en garde la trace dans la table de résolution du registre. |

## Ce qui le vérifie

- **Assertion déjà disponible** — `tests/unit/gouvernance/gardes.spec.ts` ·
  `describe("gov:identifiants — citer n'est pas se servir")` ·
  `it('sait rougir : 3 témoins et 10 contre-témoins')` : la citation qualifiée des identifiants est
  tenue par une garde, et cette garde a été vue rougir.
- **Assertion déjà disponible** — `tests/unit/gouvernance/gardes.spec.ts` ·
  `describe('la preuve n’est pas un décompte')` · `it('exige un témoin par famille, pas un total de
  fautes')` : la règle de publication est tenue par `gov:publication`, dont la preuve énumère ses
  familles une par une. Les titres du `describe.each` voisin (« est verte sur l’état du dépôt »,
  « sait rougir : ses N familles… ») sont **instanciés quatre fois** et leur nombre est **calculé** :
  on cite ici les titres littéraux, pas un gabarit de chaîne.
- **Assertion déjà disponible** — `tests/unit/gouvernance/gardes.spec.ts` ·
  `it('laisse passer les lignes « avenant » en attente, et les NOMME')` : le registre est lu par une
  garde, donc il n'est pas décoratif.
- **Assertion déjà disponible** — `tests/unit/gouvernance/adr-index-derive.spec.ts` ·
  `it('REQ-GOV-008 — docs/adr/INDEX.md est égal au listage de docs/adr/, gabarit exclu')` : la ligne
  `docs/adr/INDEX.md` de ce tableau est vérifiée, pas seulement affirmée.
- **Assertion à poser** — par GOV-011, qui pose `req:check` : la matrice de traçabilité dérivée, qui
  rougit dans les deux sens d'orphelinat. Le texte en vigueur est REQ-QA-014 (portée par QA-T03, qui
  l'arme en Gate A) ; REQ-GOV-005 y est absorbée et n'est plus le texte à citer.

## Reste à faire

Deux lignes du tableau du §1 ne sont **pas encore vraies**, et ce sont les deux seules :

- `docs/PRESEANCE.md` est cité comme source et comme arbitre du §2, et il n'existe pas dans `docs/` —
  GOV-002 le posera (REQ-GOV-002, REQ-GOV-030) ;
- la matrice de traçabilité n'a ni script ni fichier — GOV-011 pose `req:check`, QA-T03 l'arme.

- `docs/REQUIREMENTS.md` se déclare vue sans avoir de générateur dans le dépôt :
  `scripts/gates/gov-requirements.ts` n'importe que `readFileSync` et `existsSync`, et aucun
  `writeFileSync` du dépôt ne vise ce fichier (les trois qui existent visent `TASKS.md`,
  `PLAN-STATE.md` et `tasks.json`). La garde du registre en tient la COHÉRENCE, pas l'écriture —
  GOV-001 porte cette dette.

Les trois vues réellement dérivées aujourd'hui : `docs/TASKS.md` (rendu par `pnpm gov:tasks --render`,
en-tête « Ce fichier est une VUE » compris), `docs/PLAN-STATE.md` et `docs/adr/INDEX.md`, livré avec
cet ADR.

Une ligne de `docs/gates.json` reste périmée : l'entrée `gov:tasks` déclare encore, dans son champ
`verifie`, que « la vue TASKS.md n'est pas encore generee dans ce depot ». Elle l'est. La correction
revient à la tâche propriétaire de cette entrée (GOV-017a, étendue par GOV-017b) ; cet ADR la nomme
et ne la réécrit pas.
