# partners/ADR-0017 — La revendication d'une tâche se dérive de la forge, pas du fichier de la branche

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-21 |
| **Décideur** | `architecte` — seul rôle qui fait passer un ADR à `accepte` (REQ-GOV-010). Cet ADR consigne le choix fait entre les deux formes que l'acceptation de GOV-059 offrait ; il ne tranche aucune décision de Will. |
| **Tâche** | GOV-059 |
| **Exigences servies** | REQ-GOV-007 |
| **Décisions du registre citées** | W13 — le dépôt `will383842/axion-apporteurs` est **public** (`docs/DECISIONS.md`, tranchée le 2026-09-03 ; règle de publication REQ-GOV-031) |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

## Contexte

REQ-GOV-007 demande deux choses d'une même garde : qu'une tâche ait **au plus un `owner` à la fois**, et que **deux PR ouvertes citant la même tâche** rougissent. `scripts/gates/gov-etat.ts` lit les PR ouvertes **globalement**, pour tout le dépôt, alors que la revendication vivait dans `docs/tasks.json` — un fichier de la **branche jugée**. Chaque branche devait donc porter les revendications de toutes les autres, et la N+1ᵉ PR rougissait les N déjà ouvertes jusqu'à un commit de « revendication sœur » poussé sur chacune : un coût de synchronisation **en carré** du nombre de branches ouvertes.

Le défaut n'est pas théorique, il a été mesuré le 2026-09-21 : `pr_sur_tache_non_revendiquee` s'est allumé sur les PR #84 et #86 à la seule ouverture de la PR #89, sans qu'aucune des trois n'ait changé d'une ligne.

L'acceptation de GOV-059 (`docs/tasks.json`, champ `acceptance`) offrait explicitement deux formes et interdisait le mélange : « la revendication se DERIVE au lieu de se recopier par branche, ou le lecteur des demandes ouvertes se restreint a la branche jugee — l'un ou l'autre, jamais les deux a moitie ».

Deux faits bornent le choix :

- `docs/PLAN-STATE.md`, que la lettre de REQ-GOV-007 désigne, ne peut pas porter la revendication : c'est une **vue dérivée** (partners/ADR-0005 §1) et `.claude/settings.json` en refuse l'écriture. Ce qu'on y écrirait serait effacé à la génération suivante.
- Le dépôt est **public** (W13, REQ-GOV-031). Mesure du 2026-09-21 : `gh repo view` rend `isPrivate=false, visibility=PUBLIC` sur `will383842/axion-apporteurs`.

## Décision

La revendication d'une tâche se **dérive de la forge**. Une issue **ouverte** dont le titre commence par `<ID> — ` — la forme que pose `scripts/lot/issues.ts` — et qui porte **à la fois** le label `en_cours` et un label `owner:<Axx>` revendique `<ID>`, quoi que dise le `docs/tasks.json` de la branche jugée. GitHub est la seule source que toutes les branches lisent de la même manière.

Le lecteur des PR ouvertes **reste global** : la seconde forme offerte par l'acceptation — restreindre le lecteur à la branche jugée — est écartée, et le motif est en « Alternatives écartées ».

Trois bords sont fermés avec la décision, et chacun porte son assertion : un titre qui nomme une tâche inconnue ne revendique rien, ni par préfixe ni par mention ; une issue titrée mais sans `en_cours` ne revendique pas ; deux issues ouvertes revendiquant la même tâche pour deux `owner:` différents restent `revendication_multiple`.

La garde continue de lire la revendication **consolidée** — le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul — et rougit quand les deux sources nomment deux revendiqueurs différents. La dérivation s'ajoute à cette lecture, elle ne la remplace pas.

## Conséquences

**La source de vérité de la revendication change de nature.** Elle quitte `docs/tasks.json` — un fichier versionné, relu par quatre lentilles, tenu par CODEOWNERS, dont chaque modification laisse un diff — pour des **labels GitHub**, qui n'entrent dans aucune revue de code et ne laissent de trace que dans le fil de l'issue. C'est le cœur de cet ADR, et c'est ce qu'il faut savoir avant de juger la surface d'attaque.

**Qui peut écrire cette source, mesuré et non supposé.** Le dépôt est public : **ouvrir une issue est à la portée de tout compte GitHub**. Poser un label ne l'est pas — il faut le droit `triage` ou `write`. Et la garde ne lit jamais un titre d'issue sans label : elle écarte toute issue sans `owner:` **avant** d'en lire le titre (`scripts/gates/gov-etat.ts:352`) et exige en plus `en_cours` (`:357`). Aucun workflow de `.github/workflows/` — il y en a deux, `ci.yml` et `nightly.yml` — ne pose de label : ni étape `--add-label`, ni déclencheur `issues:`. **La barrière réelle est le droit de poser un label, pas celui d'ouvrir une issue.** Toute lecture qui décrit la surface comme « un titre d'issue que n'importe qui peut écrire » est fausse, et elle est fausse sur un dépôt public, c'est-à-dire lisible par ceux qu'elle renseignerait.

**Deux écarts naissent de CE choix**, mesurés par la lentille `securite` sur `f186f5d`, sans veto :

- la valeur écrite après `owner:` n'est **jamais confrontée** à la forme `<Axx>` annoncée en tête de la garde (`gov-etat.ts:32`). Un label nommé exactement `owner:` produit un propriétaire **vide** qui compte quand même : la tâche passe pour revendiquée, par personne. RM-05 veut le refus par défaut ; ici le défaut accepte. L'écart n'ajoute aucune capacité par-dessus le droit `triage` déjà nécessaire.
- la garde **ne relie jamais l'auteur d'une PR au propriétaire de la revendication**. Un agent peut ouvrir une PR sur une tâche prise par un autre tant que le vrai propriétaire n'a pas ouvert la sienne. Le défaut est **antérieur** à cette décision, mais la dérivation le rend **structurel au lieu d'accidentel** : avant, ce cas rougissait parfois — par le coût en carré, donc par accident — et ce coût est précisément ce que la décision supprime.

**Ce que la décision fait disparaître.** Le commit de « revendication sœur » n'existe plus : une branche n'a plus à recopier la revendication des autres, et le plafond de parallélisme de la phase 0 cesse d'être fixé par le nombre de branches ouvertes.

**Retour arrière.** Revenir à la forme « lecteur restreint à la branche jugée » demande quatre gestes, dont un est un renoncement : (a) retirer la carte `revendicationsParTitre` et la lecture de labels (`gov-etat.ts:143`, `:352-358`) ; (b) restreindre `gh pr list` à la branche jugée, c'est-à-dire ne plus lire qu'une seule PR — ce qui **ferme la famille `deux_pr_meme_tache`** que REQ-GOV-007 exige en toutes lettres (« deux PR ouvertes citant la même tâche → rouge ») ; (c) rétablir la recopie de `issue` et `owner` dans le `docs/tasks.json` de chaque branche, et avec elle le coût en carré ; (d) réécrire les assertions de `tests/unit/gouvernance/revendication-par-branche.spec.ts`. Ce retour n'est donc pas un `git revert` : il rend au registre une garde amputée de la moitié de son exigence, et il exige son propre ADR.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Restreindre le lecteur des PR ouvertes à la branche jugée | Elle rend la garde **aveugle aux PR concurrentes** — or c'est exactement ce que REQ-GOV-007 demande de voir : « Gate : deux PR ouvertes citant la même tâche → rouge ». Le coût en carré tomberait, et la moitié de l'exigence avec lui. |
| Écrire la revendication dans `docs/PLAN-STATE.md`, à la lettre de REQ-GOV-007 | PLAN-STATE est une **vue dérivée** (partners/ADR-0005 §1) et `.claude/settings.json` en refuse l'écriture : ce qu'on y écrirait serait effacé à la génération suivante. La lettre de l'exigence désigne une source qui n'en est pas une. |
| Garder la recopie par branche, mais la faire poser par un verbe | La revendication resterait **par branche** : la N+1ᵉ PR continuerait de rougir les N déjà ouvertes jusqu'à ce que le verbe ait tourné sur chacune. Le coût en carré serait automatisé, pas supprimé. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/revendication-par-branche.spec.ts` · `it('REQ-GOV-007 — trois PR ouvertes, chacune revendiquée par le seul titre de son issue en cours : zéro défaut')` : les trois tâches du banc ne sont revendiquées par **aucun** `docs/tasks.json` — seuls le titre et les labels de leur issue les portent. Retirer la dérivation par le titre, et les trois PR ressortent en `pr_sur_tache_non_revendiquee` : c'est la décision elle-même qui meurt, pas un de ses bords.
- **Assertion** — `tests/unit/gouvernance/revendication-par-branche.spec.ts` · ``it('REQ-GOV-007 — une issue titrée mais sans `en_cours` ne revendique pas')`` : la barrière décrite en « Conséquences » est celle-là. Une issue correctement titrée, portant `owner:A05` mais pas `en_cours`, ne revendique rien. Si cette exigence tombe, la surface s'élargit sans qu'aucune autre assertion ne s'en aperçoive.

## Reste à faire

- **La convention `<ID> — ` est recopiée à la main à trois endroits** : le producteur (`scripts/lot/issues.ts:163`), la garde (`gov-etat.ts:356`) et la fixture du test. Trois lentilles l'ont trouvée par trois chemins distincts (`securite`, `simplicite`, `mutation`), et le mutant qui change le séparateur du titre produit par `lot:issues` laisse **tout vert**. RM-01 : une seule source, dérivée. Aucune tâche ne la porte à ce jour.
- **`docs/tasks.json` porte encore `issue` et `owner` écrits à la main** sur GOV-059 — dans la PR même qui établit que la recopie par branche n'a plus lieu d'être, et alors que `owner` est documenté comme écrit par `pnpm lot:cloture` seul.
- **Confronter la valeur après `owner:` à la forme `<Axx>`**, ou la dériver de `docs/agents.json` (RM-01, RM-05).
- **Relier l'auteur d'une PR au propriétaire de la revendication** : une famille `pr_hors_revendication` comparant `author` de la PR à `owner:` de l'issue, ce qui exige de demander `author` dans `gh pr list --json`.
- **`gov:etat:prove` ne couvre rien du code neuf** : ses témoins injectent la carte des revendications déjà construite, si bien que l'analyse du titre, de `en_cours` et des labels n'y passe jamais. Toute la dérivation ne repose que sur `revendication-par-branche.spec.ts` (RM-02).
- **`--limit 200` sur `gh issue list` porte désormais seul la revendication** : au-delà de 200 issues ouvertes, une revendication disparaît en silence et `revendication_multiple` échoue **ouvert**. Mesure du 2026-09-21 : 46 issues ouvertes, 5 PR ouvertes, 37 fusionnées.
- **Question qui appartient à Will, et que cet ADR ne tranche pas** : accepter que le droit de revendiquer une tâche se réduise au droit `triage` sur un dépôt public, ou exiger une seconde barrière (par exemple le lien auteur ↔ propriétaire ci-dessus, rendu bloquant). La décision de forme est consignée ici ; le niveau d'exigence sur cette surface est une décision de Will, à porter au registre.
