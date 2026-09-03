# partners/ADR-0006 — La fusion : file sérialisée, une PR à la fois, atterrissage vérifié

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | GOV-009 |
| **Exigences servies** | REQ-GOV-008, REQ-GOV-014, REQ-GOV-013, REQ-QA-018, REQ-QA-019, REQ-QA-022, REQ-CPL-021 |
| **Décisions du registre citées** | HYP-E1-33, HYP-E1-26, HYP-E1-13 |
| **Règle maison appliquée** | RM-09 |
| **Remplace / remplacé par** | — |

## Contexte

Trois faits, tous constatés, fondent cette décision. Une PR verte peut passer en retard sur la branche
principale **entre** le moment où on lit son état et le moment où on fusionne — c'est arrivé deux fois
le même jour. Deux producteurs de déploiement se privent mutuellement de créneau, et le déploiement
n'arrive jamais. Enfin, un travail d'intégration en échec n'est pas un déploiement cassé, et
réciproquement : la vérité n'est pas dans l'état du travail, elle est dans l'en-tête que sert
l'application déployée.

## Décision

### 1. Une fusion à la fois, dans un historique linéaire

Une seule PR fusionne à la fois sur la branche principale, en écrasement de commits, avec historique
linéaire exigé (REQ-GOV-014, RM-09). Le créneau se réserve **avant** de remettre la branche à jour :
le réserver après, c'est courir après un état qui a déjà changé.

### 2. Lire l'état et fusionner dans le même appel

L'état de fusionnabilité est lu et la fusion exécutée **dans le même appel**. Jamais de fusion
automatique différée, jamais de fusion forcée : entre la lecture et l'action différée, la branche
principale a le temps d'avancer.

### 3. La fusion suivante attend l'atterrissage

La PR suivante n'entre pas dans la file tant que l'application déployée ne sert pas l'empreinte de
commit qui vient d'être fusionnée. C'est ce que mesure `deploy:verify`, et c'est la seule preuve
acceptée qu'un déploiement a eu lieu.

### 4. Aucun workflow ne pousse sur la branche principale

La protection de branche l'interdit, et la matrice d'autonomie des agents refuse la commande
correspondante (REQ-CPL-021, CONVENTIONS §7). Un dépôt qui se pousse lui-même n'a plus d'historique
reproductible.

### 5. La file

C'est la file de fusion native de la forge si elle est disponible, sinon la sérialisation par le
script de lot (`HYP-E1-33`). Dans les deux cas, l'ordre est explicite et lisible dans l'état vivant du
plan.

### 6. Le déploiement et le retour arrière

L'image est construite par la CI et poussée au registre d'images ; l'hébergeur ne fait que la tirer
(REQ-QA-018). Les migrations s'exécutent au démarrage en mode bloquant : en cas d'échec, le processus
sort en erreur rapidement et **l'ancienne instance continue de servir** (REQ-QA-019). Il n'y a **aucun
retour arrière automatique** (`HYP-E1-26`) : le retour arrière est un déclenchement manuel décrit par
un runbook, et il est vérifié sur le même en-tête de build (REQ-QA-022).

### 7. Côté axionia

Un seul auteur produit toutes les PR d'axionia du chantier (`HYP-E1-13`), et la fusion y suit le
runbook dédié : elle n'est pas dans le workflow de lot.

## Conséquences

Le débit de fusion est plafonné par la durée d'un atterrissage. C'est le prix d'un déploiement dont on
sait qu'il a eu lieu, et il est assumé : une PR qui attend son tour n'est pas un incident, une PR
fusionnée dont personne ne sait si elle est en ligne en est un.

La définition de « terminé » se termine par deux cases indissociables : fusionnée **et** atterrissage
vérifié (REQ-GOV-013). Une PR fusionnée sans atterrissage vérifié n'est pas terminée.

Les agents ne fusionnent pas : ils rendent du contenu, et le `release-manager` — seul rôle habilité
à fusionner (REQ-GOV-010) — intègre. C'est ce qui rend la sérialisation possible sans coordination
permanente (`partners/ADR-0005`).

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| La fusion automatique différée | Elle fusionne à un moment qu'on n'observe pas, sur un état qu'on n'a pas relu : c'est précisément le trou par lequel une PR en retard est passée deux fois. |
| Une contrainte de simultanéité au niveau du workflow | Elle annule des travaux en cours au lieu de les mettre en file, et masque l'ordre réel des fusions. |
| Plusieurs producteurs de déploiement en parallèle | Ils se privent mutuellement de créneau ; le déploiement n'arrive jamais, et personne ne sait à qui l'attribuer. |
| Un retour arrière automatique sur échec de disponibilité | Écarté par `HYP-E1-26` : un retour arrière automatique redéploie sans qu'un humain ait constaté la panne, et peut boucler. |

## Ce qui le vérifie

- **Assertion à poser** — par GOV-012 : `aucun-workflow-ne-pousse-sur-main.spec.ts` ·
  `it('REQ-GOV-014 — aucun workflow ne pousse sur la branche principale')`, transposée d'axionia et
  vue rougir sur un témoin de ce dépôt (REQ-GOV-029).
- **Assertion à poser** — par GOV-000, qui porte REQ-CPL-021 : la garde `gov:autonomie` de
  `docs/gates.json`, qui exige la règle de refus correspondante dans `.claude/settings.json`. Sa
  `preuveRouge` y est encore nulle. GOV-012 porte REQ-GOV-014 et ses deux tests
  (`aucun-workflow-ne-pousse-sur-main.spec.ts`, `tout-check-est-cable.spec.ts`) ; déplacer une garde
  d'une tâche à l'autre se fait dans le registre des gardes, pas dans un ADR.
- **Vérification opérationnelle** — `deploy:verify <empreinte>` avant chaque fusion suivante.

## Reste à faire

`docs/PROTOCOLE-FUSION.md` (REQ-GOV-014) et le script `deploy:verify` n'existent pas encore : ils sont
portés par GOV-012, dont cet ADR est le fondement écrit. Tant qu'ils manquent, la règle tient par la
discipline du `release-manager` — seul rôle habilité à fusionner (REQ-GOV-010) — et par
`docs/REGLES-MAISON.md` : c'est-à-dire par rien qui rougisse.
