# Protocole de fusion — Axion Partners

> Livré par **GOV-012** (REQ-GOV-014). Ce fichier ne décide rien : il **dérive**. La décision est
> dans `partners/ADR-0006` (file sérialisée, atterrissage vérifié) et `partners/ADR-0007` (la branche
> porte le lot) ; la règle est `RM-09` de `docs/REGLES-MAISON.md` ; la forme des branches, des titres
> et des libellés est la ligne « Fusion » de `docs/CONVENTIONS.md` §5 ; le poste habilité est **A04**
> `release-manager`, décrit par `docs/CHARTE-AGENTS.md` §4 et sa fiche. Aucune de ces valeurs n'est
> recopiée ici (RM-01) : ce document est la **suite de gestes**, dans l'ordre, avec la commande exacte
> et ce qu'on lit pour savoir que le pas est réussi.
>
> Gardes : `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts` ·
> `tests/unit/gouvernance/tout-check-est-cable.spec.ts` · `npx tsx scripts/gates/gov-depot.ts`
> (`gov:depot-visibilite`).

## Ce que ce protocole empêche, et qui est arrivé

Trois faits, mesurés, tiennent chacun un pas de la suite ci-dessous.

1. **Une PR verte passe `BEHIND` entre le moment où on lit son état et celui où on fusionne** — deux
   fois le même jour sur le dépôt voisin. C'est pourquoi le pas 6 lit `mergeStateStatus` **et**
   fusionne dans le même appel, et pourquoi le créneau se réserve **avant** `update-branch` (pas 1) :
   le réserver après, c'est courir après un état déjà changé.
2. **Un travail d'intégration en échec n'est pas un déploiement cassé, et réciproquement.** La vérité
   n'est pas la couleur du run, elle est dans l'en-tête servi par l'application déployée (pas 7).
3. **Les règles de refus par sous-chaîne ne voient pas toutes les formes d'une commande.** Sur la
   PR 27, `git push origin lot/x:main --force` et `git push -u origin lot/x:main` passaient entre
   les six règles `deny` de `.claude/settings.json`. Ce qui garde vraiment, c'est
   `scripts/gates/git-push-sur.js`, qui **lit** la commande — et c'est le même module qui juge les
   workflows, pour que la porte du runner et celle du poste soient gardées par la même lecture.

## Qui, et quoi

| | |
| --- | --- |
| Qui fusionne | **A04** `release-manager`, seul (REQ-GOV-010, RM-09). Suppléé par **A12** quand la PR est de A04 (`docs/CHARTE-AGENTS.md` §6) |
| Ce qui fusionne | **un lot** = une PR = un commit par tâche (`partners/ADR-0007`) |
| Comment | `gh pr merge --squash --delete-branch` — écrasement de commits, historique linéaire exigé sur `main` |
| Combien à la fois | **une**. La suivante attend l'atterrissage de la précédente |
| Jamais | `--auto` (fusionne à un instant qu'on n'observe pas, sur un état qu'on n'a pas relu) · `--admin` (passe outre les checks requis) · `--force` et tout push vers `main` |

Les trois formes interdites ci-dessus ne sont pas seulement déconseillées : la matrice d'autonomie
les **refuse** — `Bash(gh pr merge * --auto*)`, `Bash(gh pr merge * --admin*)`,
`Bash(git push *--force*)` dans `.claude/settings.json`, doublées par `jugerPush` pour tout ce qui
ressemble à un push. Une commande refusée par la matrice n'est pas un obstacle à contourner : c'est
le protocole qui parle. Si un pas paraît exiger l'une d'elles, le pas est mal compris ou la situation
est un incident — dans les deux cas, on s'arrête et on remonte à Will.

---

## La suite de gestes

Chaque pas donne la **commande** exacte et **ce qu'on lit**. Un pas dont on ne peut pas lire le
critère n'est pas réussi : il est *non vérifié*, ce qui n'est ni un succès ni un échec, et ce qui
interdit de passer au suivant.

### Pas 0 — L'état de la forge, une fois par session

**Commande.** `npx tsx scripts/gates/gov-depot.ts`

**Ce qu'on lit.** Le code de sortie. `0` : la visibilité du dépôt est celle que **W13** a tranchée,
le check requis de `main` porte le nom exact du job que `.github/workflows/ci.yml` produit,
l'historique linéaire est exigé, l'écrasement est refusé, aucun workflow ne pousse sur la branche
principale. `1` : un défaut constaté, la fusion n'ouvre pas. `2` : **INDÉTERMINÉ** — la garde n'a pas
pu lire la protection de branche, soit que le jeton n'en ait pas le droit, soit que la matrice ait
refusé la commande (`.claude/settings.json` porte une règle visant
`gh api * /branches/main/protection*`). Un `2` n'autorise rien : il se lève avec un jeton qui a le
droit de lire, ou il se consigne dans le créneau comme un contrôle non joué.

### Pas 1 — Réserver le créneau, AVANT toute remise à jour

**Commande.** Annoncer la PR qui prend le créneau dans le canal du lot, et vérifier qu'aucune autre
n'est en vol : `gh pr list --state open --json number,title,mergeStateStatus`

**Ce qu'on lit.** Aucune autre PR déclarée en cours de fusion. « En vol » n'est pas « en gates » : la
file se lit dans la liste des PR ouvertes et dans le créneau annoncé, jamais dans l'intuition. Ce pas
précède le pas 4 — réserver après avoir remis la branche à jour, c'est réserver un état qui a déjà
changé.

### Pas 2 — La définition de « terminé », revues comprises

**Commande.** `pnpm gov:pr --pr <numéro>`

**Ce qu'on lit.** Vert. C'est le seul moment où les revues existent : l'événement `pull_request` de la
CI n'en porte aucune, donc `gate-a` ne peut pas les juger (`docs/CHARTE-AGENTS.md` §8). Sont vérifiés
ici : trois lentilles distinctes, l'avis de mutation, l'auteur qui ne s'auto-approuve pas, les sept
premières cases de la DoD, le bloc ROUGE/VERT, et la section « Attaque » si la tâche est `sensible` —
où le refus de la lentille `securite` vaut **veto**, à lui seul.

### Pas 3 — Les gates, sur le commit qui sera fusionné

**Commande.** `gh pr checks <numéro>`

**Ce qu'on lit.** `gate-a` en `pass`. Deux pièges nommés : un check `Expected — Waiting for status`
n'arrivera **jamais** si son nom ne correspond à aucun job (c'est ce que le pas 0 contrôle) ; et
« aucune suite de contrôle » n'est pas un vert — l'absence de check se diagnostique par
`gh api repos/{owner}/{repo}/commits/<sha>/check-suites`, jamais en attendant.

### Pas 4 — Remettre la branche à jour, si et seulement si elle est en retard

**Commande.** `gh pr update-branch <numéro>`

**Ce qu'on lit.** `mergeStateStatus` repasse de `BEHIND` à `CLEAN` après le nouveau tour de gates.
Le créneau est **déjà** réservé (pas 1) : c'est ce qui garantit qu'aucune autre fusion ne remettra
cette branche en retard pendant que ses gates tournent. Chaque fusion sur `main` remet en `BEHIND`
**toutes** les PR ouvertes ; c'est la raison d'être de la sérialisation, pas un incident.

### Pas 5 — Le diff approuvé est le diff fusionné

**Commande.** `gh pr view <numéro> --json headRefOid,reviews`

**Ce qu'on lit.** L'empreinte de tête est celle qui portait les approbations du pas 2. Si elle a
changé depuis, les revues portent sur autre chose : on retourne au pas 2. A04 est privé d'écriture,
donc il ne peut pas retoucher ce qu'il fusionne ; quand A12 le supplée, cette propriété n'est plus
tenue par l'outillage — elle est tenue par **ce pas**.

### Pas 6 — Lire l'état et fusionner dans le MÊME appel

**Commande.**
```bash
gh pr view <numéro> --json mergeStateStatus -q .mergeStateStatus \
  && gh pr merge <numéro> --squash --delete-branch
```

**Ce qu'on lit.** `CLEAN` imprimé, puis la confirmation de fusion. Les deux dans la même sortie :
c'est tout l'objet du pas. Séparer la lecture de l'action rouvre exactement la fenêtre par laquelle
une PR passée `BEHIND` a été fusionnée deux fois. `--squash` et `--delete-branch` ne sont pas des
préférences : le premier tient l'historique linéaire exigé par la protection de branche, le second
évite qu'une branche de lot fusionnée reste poussable.

### Pas 7 — L'atterrissage, avant la fusion suivante

**Commande.** `curl -sI https://<hôte-servi>/ | grep -i x-partners-build-sha`

**Ce qu'on lit.** L'en-tête `x-partners-build-sha` vaut l'empreinte du commit d'écrasement produit au
pas 6. Tant que ce n'est pas vrai, la PR suivante **n'entre pas** dans la file. Un run rouge ne
suffit pas à conclure qu'un déploiement a échoué, et un run vert ne suffit pas à conclure qu'il a eu
lieu : la vérité est cet en-tête. Une migration en échec, elle, laisse l'instance précédente servir —
donc l'ancien sha — et c'est précisément ce que ce pas détecte.

> ⚠️ **Aujourd'hui, en phase −1, rien n'est déployé** : il n'existe ni hôte servi ni en-tête à lire,
> et `pnpm deploy:verify` — nommé par l'acceptation de GOV-000 et par `partners/ADR-0006` — n'est pas
> encore déclaré dans `package.json`. Ce qui tient lieu d'atterrissage jusqu'au premier déploiement :
> `git fetch origin && git log --oneline -1 origin/main` doit rendre l'empreinte d'écrasement, et le
> run `Gate A` déclenché par le `push` sur `main` doit être vert. Ce repli est daté : il tombe le jour
> où le script existe, et ce document est alors corrigé par la tâche qui le livre.

### Pas 8 — Attester, puis rendre le créneau

**Commande.** `pnpm gov:pr --apres-fusion <numéro>` puis `pnpm lot:cloture --lot <id-de-lot>`

**Ce qu'on lit.** La huitième case de la DoD cochée — « fusionnée **et** atterrissage vérifié » : les
deux sont indissociables, une PR fusionnée dont personne ne sait si elle est en ligne n'est pas
terminée. Puis les lignes `statut`, `pr`, `branch`, `owner` écrites dans `docs/tasks.json` par le
seul outil qui a le droit de les écrire, et `docs/PLAN-STATE.md` régénéré. Le créneau est libre : la
PR suivante peut prendre le pas 1.

---

## Ce que ce protocole ne couvre pas

- **Le dépôt `axionia`.** Il a sa propre file, partagée avec d'autres sessions, et son propre
  runbook. A04 n'y fusionne pas (`partners/ADR-0006` §7).
- **Le retour arrière.** Il n'est pas automatique (`HYP-E1-26`) : c'est un déclenchement manuel, et il
  se vérifie sur le même en-tête qu'au pas 7. La révocation d'une tâche est un `git revert` de **son**
  commit, ce que l'historique linéaire de `partners/ADR-0007` garde atomique.
- **La protection de branche elle-même.** Ce document ne la modifie pas et ne dit pas comment la
  modifier : la matrice d'autonomie refuse l'écriture comme la lecture, et un changement de
  protection est une décision de Will, exécutée hors de toute session d'agent.
