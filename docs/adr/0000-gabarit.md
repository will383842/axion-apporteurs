# Gabarit d'un ADR — Axion Partners

> Livré par **GOV-009** (REQ-GOV-008). Ce fichier n'est pas une décision : c'est le moule dans lequel
> toutes les autres sont coulées. Il ne porte pas de numéro d'ADR et **l'index l'ignore** — il est le
> seul fichier de `docs/adr/` qui ne soit pas un ADR.
>
> Pour écrire un ADR : copier le moule ci-dessous sous `docs/adr/<nnnn>-<slug>.md`, remplacer chaque
> champ, **ne supprimer aucune rubrique**. Une rubrique vide se voit ; une rubrique absente ne se voit
> pas. Règle maison appliquée : RM-12 (un identifiant nu n'est pas une référence).

## 1. Le moule

```markdown
# partners/ADR-<nnnn> — <le sujet de la décision, en français>

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` \| `accepte` \| `remplace` |
| **Date** | AAAA-MM-JJ — date de rédaction. La date d'acceptation est celle de la PR qui la porte. |
| **Décideur** | `architecte` — seul rôle qui fait passer un ADR à `accepte` (REQ-GOV-010). |
| **Tâche** | <identifiant de la tâche qui livre l'ADR> |
| **Exigences servies** | REQ-…, REQ-… |
| **Décisions du registre citées** | HYP-…, DEC-…, W<n> — forme qualifiée de `docs/DECISIONS.md` (RM-12) |
| **Règle maison appliquée** | RM-nn |
| **Remplace / remplacé par** | `partners/ADR-<nnnn>` ou `—` |

## Contexte

Ce qui est vrai **avant** la décision : la contrainte, le fait constaté, ce qui a déjà coûté cher.
On écrit ici ce qu'on sait, avec sa source (exigence, ligne du registre, fichier). On n'écrit pas
ici ce qu'on souhaite.

## Décision

La décision au présent, en phrases entières, une idée par phrase. Si la décision applique une
hypothèse du registre, elle le dit et cite la ligne : un ADR **consigne** une décision de Will, il
ne la prend jamais.

## Conséquences

Ce que la décision impose au code, aux gardes et aux gens — y compris ce qu'elle coûte. Le retour
arrière est décrit ici : ce qu'il faudrait faire, et à quel prix.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| … | … |

## Ce qui le vérifie

- **Assertion** — `<chemin/du/fichier.spec.ts>` · `it('<titre exact>')` : ce test verrait la décision
  mourir. L'assertion doit **exister** au moment du passage à `accepte`.
- **ou `hors-code`** — <motif en une phrase : pourquoi aucune assertion ne peut porter cette
  décision>. La mention seule ne suffit pas ; le motif fait partie de la mention.

## Reste à faire

Ce que cet ADR laisse ouvert, et la tâche qui le fermera. `—` s'il ne reste rien.
```

## 2. Les règles qui tiennent le dossier

**Un seul dossier.** Tous les ADR de ce dépôt vivent dans `docs/adr/`, jamais dans `docs/adrs/` ni
dans un second dossier « archive ». La dérive constatée qui a motivé REQ-GOV-008 — deux numéros
attribués deux fois, un index figé pendant huit ADR — vient d'un dossier qui s'était dédoublé.

**Numérotation continue.** `0001`, `0002`, … sur quatre chiffres, attribués par l'`architecte`, sans
trou et sans doublon. `0000` est le présent gabarit et n'entre pas dans la suite. Un ADR ne se
supprime pas : on en écrit un nouveau qui le remplace, l'ancien passe `remplace` et pointe le
nouveau, le nouveau pointe l'ancien.

**L'index est dérivé.** `docs/adr/INDEX.md` est **généré depuis le système de fichiers** par
`pnpm adr:index` (`scripts/adr/index.ts`, livré par GOV-009), jamais tenu à la main (RM-01). Un index
écrit à la main est faux le jour où quelqu'un oublie de l'ouvrir : `pnpm adr:index --verifier` et la
garde `gov:adr` rougissent si le fichier sur disque diffère du listage du dossier.

**Toute référence est qualifiée par son dépôt.** On écrit `partners/ADR-0003`, `axionia/ADR-0014`,
`ops/ADR-0050` — y compris dans le titre d'un ADR et y compris entre deux ADR du même dépôt. Trois
dépôts numérotent leurs ADR chacun de leur côté : « ADR-0003 » nu ne désigne rien.

Les guillemets font ici tout le travail, et c'est voulu : la garde `gov:adr` traite un renvoi entre
guillemets comme une **citation** — un document qui explique la règle doit pouvoir écrire son
contre-exemple — et un renvoi entre accents graves comme une **référence**, parce que c'est ainsi
qu'on les écrit partout ailleurs.

**Le statut est un vocabulaire fermé de trois valeurs**, en français comme tout le dépôt
(CONVENTIONS §1) : `propose` (rédigé, pas encore accepté), `accepte` (l'`architecte` l'a accepté dans
une PR), `remplace` (un ADR postérieur le supersède). Aucune autre valeur, aucun `deprecated`.

**Un ADR `accepte` porte une assertion ou la mention `hors-code` motivée** (REQ-GOV-009). Une
décision d'architecture que rien ne peut voir mourir est une intention, pas une décision. Tant que
l'assertion n'est pas écrite et vue rougir (RM-02), l'ADR reste `propose` et nomme la tâche qui la
posera.

## 3. Ce qu'un ADR ne fait jamais

- **Trancher une décision de Will.** Ces décisions vivent dans `docs/DECISIONS.md` ; un ADR les cite
  sous leur forme qualifiée. Un agent à qui il manque une décision rend un `stop`, il ne devine pas.
- **Porter une valeur du réseau.** Le dépôt est public (W13, REQ-GOV-031) : ni montant, ni taux, ni
  seuil de détection, ni explication du pourquoi d'une règle relationnelle. Un ADR dit ce qu'on fait
  et comment on le vérifie ; ces valeurs vivent en configuration ou en base.
- **Recopier une vérité.** Un ADR cite sa source (RM-01) : le registre, l'exigence, le fichier.

## 4. Ce qui tient ce dossier

**La garde `gov:adr`** (`scripts/gates/gov-adr.ts`, ligne inscrite dans `docs/gates.json`) est livrée
avec ce gabarit et tient douze familles de règles, chacune vue rougir sur son propre témoin
(`pnpm gov:adr --prove`, RM-02) : dossier unique ; noms de fichiers conformes ; numéros uniques et
consécutifs depuis `0001`, `0000` exclu ; titre qualifié par son dépôt ; statut dans le vocabulaire
fermé ; six rubriques présentes ; tout ADR `accepte` porteur d'une assertion ou d'un `hors-code`
motivé ; index présent et égal au listage ; toute occurrence de `ADR-nnnn` qualifiée par un nom de
dépôt ; toute référence `partners/ADR-nnnn` désignant un ADR qui existe — c'est le cas d'échec
déclaré au registre, recopié ici mot pour mot : « referencer ADR-9999 dans une PR ». Les guillemets
ne sont pas un ornement : sans eux, cette phrase ferait rougir la garde qu'elle décrit.

**Le test `adr-index-derive.spec.ts`** (déclaré par GOV-009 pour REQ-CPL-018 et REQ-GOV-008) est
livré sous `tests/unit/gouvernance/` : il compare l'index au listage, exerce la garde dans ses deux
modes, et a été vu rougir sur un index amputé à la main.

## 5. Reste à faire

1. **Le vocabulaire `StatutAdr` n'est pas encore au glossaire.** `docs/GLOSSAIRE.md` §4 est la seule
   liste que `glossaire-enums.spec.ts` consulte, et cette garde inspecte explicitement `docs/adr/**`.
   Le `gardien-spec` y inscrit, en GOV-006, `StatutAdr { propose, accepte, remplace }` avec pour
   source REQ-GOV-009 et pour synonymes interdits `Accepted`, `Proposed`, `Superseded`, `deprecated`.
   Ce gabarit ne peut pas l'écrire lui-même : `docs/GLOSSAIRE.md` est un fichier réservé
   (CONVENTIONS §8).
2. **GOV-010 lit `accepte`, pas « Accepted ».** Le texte de REQ-GOV-009 emploie le mot anglais
   *Accepted* ; CONVENTIONS §1 impose le français pour les ADR. Le vocabulaire retenu ici est
   `accepte` : la garde de GOV-010 doit le reconnaître, et le `gardien-spec` reste seul habilité à
   reformuler REQ-GOV-009.
3. **Trois renvois d'ADR restent non qualifiés dans des fichiers réservés** — `docs/DECISIONS.md`
   (deux) et `docs/TASKS.md` (un, rendu depuis `docs/tasks.json`). GOV-009 n'a pas le droit de les
   écrire : `gov:adr` les nomme à chaque exécution au lieu de les refuser, et
   `pnpm gov:adr --strict-registre` les compte comme des fautes. Leur qualification revient au
   `gardien-spec` pour le registre des décisions, à l'orchestrateur pour le backlog.
