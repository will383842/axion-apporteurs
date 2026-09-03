# partners/ADR-0003 — La grille publiée et la grille par contrat

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | GOV-009 |
| **Exigences servies** | REQ-GOV-008, REQ-DM-014, REQ-INT-006, REQ-INT-017, REQ-GOV-031 |
| **Décisions du registre citées** | W6, W11, W12, W13, HYP-W6-BIS |
| **Règle maison appliquée** | RM-01 |
| **Remplace / remplacé par** | — |

## Contexte

Deux notions portaient le même nom dans les documents de travail, et cette confusion a produit des
écarts de calcul : la **grille publiée** — celle qu'axionia expose et fait évoluer — et la **grille
d'un contrat** — celle qui est opposable à un apporteur donné parce qu'elle était en vigueur quand il
a signé. La grille est par ailleurs l'annexe 1 du contrat (W11), ce qui rend toute évolution de son
périmètre coûteuse : W6 porte la réversibilité `avenant`.

Ce dépôt est public (W13). REQ-GOV-031 lui interdit de porter les valeurs du réseau. Le présent ADR
décrit donc un **mécanisme**, et ne contient aucune valeur.

## Décision

### 1. Une seule source, dérivée

La grille a **une** source : le fichier de tarification d'axionia. Un script de publication en dérive
un document canonique et son empreinte SHA-256 ; axionia le publie avec son numéro de version
(REQ-INT-017) ; Partners conserve chaque version reçue (REQ-DM-014). **Aucune valeur n'est retapée
dans Partners** (RM-01), et l'écran de paramètres affiche la version sans jamais la modifier.

Le calcul de la part commissionnée d'un devis appartient à axionia : le devis signé porte, ligne par
ligne, l'identifiant de barème retenu (REQ-INT-006). Partners ne détient aucune copie de la grille et
n'a donc aucune occasion d'en diverger.

### 2. La grille publiée est versionnée et immuable

Une publication **crée** une version ; elle n'en modifie aucune. C'est ce qui permet de dire, un an
plus tard, ce qui était en vigueur à une date donnée.

### 3. La grille d'un contrat est un instantané

Le contrat référence une version et en fige le contenu à la signature ; l'attribution et la ligne de
commission portent la même référence. **Le montant d'une ligne ne change jamais parce qu'une nouvelle
version a été publiée** (REQ-DM-014) : une évolution de la grille vaut pour l'avenir, jamais pour ce
qui est déjà né.

### 4. Un contrat peut descendre sous la version publiée

W12 l'autorise, et dans ce sens-là seulement : la grille d'un contrat **peut descendre sous** la
grille publiée. Deux contreparties, toutes deux tranchées avec elle : la page publique passe en
formulation indicative (tâche JUR-T29), et **chaque écart porte un motif écrit** — un écart sans
motif est un écart qu'on ne saura pas expliquer.

### 5. Aucune valeur par défaut sur un barème manquant

Une entrée de la tarification d'axionia sans correspondance dans la grille ne prend **aucune** valeur
par défaut : elle bloque au démarrage avec une alerte, et la ligne concernée est retenue avec le motif
`bareme_indefini` (`HYP-W6-BIS`, glossaire §3). Le périmètre de ce qui est commissionné est celui de
la décision W6 au registre ; cet ADR le cite et n'en recopie ni le décompte ni le contenu (RM-01) —
un décompte recopié est une seconde source, et c'est celle qu'on lit quand la première a changé.

## Conséquences

Modifier la tarification d'axionia **sans republier** fera diverger l'empreinte embarquée de
l'empreinte recalculée, et la garde de dérivation `partners:grille:check` **rougira des deux côtés** :
c'est son cas d'échec, déjà inscrit dans `docs/gates.json`. Elle est posée par DM-03-A et DM-03-P ;
son script n'est pas écrit et sa `preuveRouge` y est encore nulle — au présent, elle ne garde rien
(RM-02).

W6 porte la réversibilité `avenant` : une évolution du périmètre commissionné impose une campagne de
re-signature à tout le réseau (INT-T23, `docs/DECISIONS.md` §4). Ce n'est pas un effet de bord du
code, c'est le coût de l'annexe 1.

Parce que la valeur d'une ligne est figée à sa naissance, une correction se fait par une ligne
d'ajustement, jamais par une réécriture (REQ-ARG-028).

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Recopier la grille dans Partners | Deux copies divergent toujours, et celle qui est lue n'est jamais celle qui a été corrigée (RM-01). |
| Calculer la part commissionnée dans Partners à partir des libellés d'activité | Le libellé n'est pas un identifiant ; la fonction de calcul vit là où vit la tarification (REQ-INT-006). |
| Une grille unique, sans version | Un montant déjà acquis changerait rétroactivement à la première évolution — inacceptable pour une somme due. |
| Un barème par défaut quand la correspondance manque | Un défaut silencieux produit une somme fausse qu'aucune alerte ne signale ; le blocage explicite est préférable (`HYP-W6-BIS`). |

## Ce qui le vérifie

- **Assertion à poser** — par DM-03-A et DM-03-P : la garde `partners:grille:check`, qui compare
  l'empreinte publiée à l'empreinte recalculée des deux côtés, vérifie qu'aucun littéral de barème
  n'existe hors instantané, et exige pour chaque entrée soit une correspondance, soit une entrée
  `bareme_indefini` explicite et datée.
- **Assertion déjà disponible** — `tests/unit/gouvernance/gardes.spec.ts` ·
  `describe('la preuve n’est pas un décompte')` · `it('exige un témoin par famille, pas un total de
  fautes')` : ce titre est **littéral** et il nomme `gov:publication`, la garde qui refuse qu'une
  valeur du réseau entre dans ce dépôt — la moitié publique de cette décision. Le titre voisin,
  « sait rougir : ses N familles… », est **calculé** dans un `describe.each` : le citer figerait un
  nombre qui change dès qu'une famille est ajoutée à la garde.

## Reste à faire

W11 laisse l'annexe 1 à **remplir** ; ce remplissage n'a pas lieu dans ce dépôt (REQ-GOV-031). Cet ADR
ne dit rien du contenu de la grille et n'a pas à en dire quoi que ce soit.

W12 tranche un seul sens : une grille de contrat qui **descend** sous la grille publiée. Le sens
ascendant n'est pas tranché et cet ADR ne le tranche pas — s'il devient nécessaire, il devient une
ligne du registre des décisions, pas une lecture large de W12.
