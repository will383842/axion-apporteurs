<!--
GABARIT DE PR — Axion Partners (GOV-007 : REQ-GOV-010, REQ-GOV-011, REQ-GOV-012, REQ-GOV-013).
Lu par la garde `pnpm gov:pr` (`scripts/gates/gov-pr.ts`), livrée avec ce gabarit.

LES NOMS DE MARQUEURS SONT CITÉS ICI SANS LEURS DÉLIMITEURS. Un commentaire HTML ne s'imbrique
pas : écrire un délimiteur de fin à l'intérieur de ce bloc le refermerait au premier, tout le
texte suivant s'afficherait en clair dans chaque PR, et chaque marqueur existerait en double —
la garde ancrerait alors sur la mauvaise occurrence. Chaque marqueur apparaît UNE SEULE FOIS
dans ce fichier, et `gov:pr` rougit si ce n'est plus vrai.

  · les HUIT cases de la définition de « terminé » vivent entre les marqueurs dod:debut et
    dod:fin, et nulle part ailleurs : aucune autre case à cocher dans le corps ;
  · le bloc ROUGE/VERT vit entre rouge-vert:debut et rouge-vert:fin ;
  · la section Attaque vit entre attaque:debut et attaque:fin. Elle est EXIGÉE si la tâche porte
    un champ `sensible` non vide, ou si le diff touche commissions/, attributions/, auth/ ou espace/ ;
  · la règle maison est un CHAMP, entre regle-maison:debut et regle-maison:fin — en case, elle
    ferait une neuvième case et fausserait le compte de REQ-GOV-013 ;
  · `Auteur:` n'apparaît jamais dans `Relecteur:`, et l'auteur ne s'auto-approuve pas. La règle
    porte sur l'auteur et sur les LENTILLES (`exactitude`, `securite`, `simplicite`) plus la
    vérification de mutation — jamais sur l'unicité des codes de poste : un même poste peut tenir
    trois lectures distinctes.

Ne retire aucun marqueur : ils sont l'ancrage de la garde, pas de la décoration.

LE CORPS D'UNE PR EST PUBLIC, ET AUCUNE GARDE NE LE LIT : `gov:publication` n'inspecte que les
fichiers suivis par git. Si un message d'échec porte une valeur que REQ-GOV-031 garde hors dépôt,
remplace CETTE VALEUR et elle seule par «valeur en configuration», nomme la constante qui la
porte, et laisse tout le reste du message verbatim.

Titre de la PR : `<type>(<ID-TÂCHE>): <titre>` (`docs/CONVENTIONS.md` §5).
-->

## Identité

Auteur: A__
Relecteur: A__ exactitude · A__ securite · A__ simplicite · A__ mutation
Couvre: REQ-___

## Ce que fait cette PR

<!-- Deux à cinq phrases. Ce que le code fait, pas comment il est écrit. -->

## ROUGE avant VERT (REQ-GOV-012, RM-02)

<!-- rouge-vert:debut -->

ROUGE : (colle ici le message d'échec verbatim du premier `pnpm vitest run <fichier>` — pas une reformulation, pas un résumé)
VERT : (l'état après le correctif minimal)
Rouge constaté par: A__

<!-- rouge-vert:fin -->

> Une PR qui ajoute un `*.spec.ts`, un script de `scripts/gates/`, une contrainte de base, un lint
> ou une étape de workflow sans ce bloc rempli est refusée.
> Si l'auteur n'a pas d'outil d'exécution — c'est le cas de **A07** `juriste`, qui n'a pas `Bash` —
> **A10** `verificateur-rouge` produit le rouge et signe la ligne `Rouge constaté par:`
> (`docs/CHARTE-AGENTS.md` §6, cinquième suppléance). Le rouge se constate ; il ne s'affirme pas.

## Attaque (REQ-GOV-011)

<!-- attaque:debut -->

sans objet : la tâche ne porte pas de champ `sensible` et le diff ne touche aucune zone concernée

<!-- attaque:fin -->

> Exigée si la tâche porte un champ `sensible` non vide, ou si le diff touche `commissions/`,
> `attributions/`, `auth/` ou `espace/`. Trois lignes : le scénario joué, le résultat obtenu, qui
> l'a joué. Le refus de la lentille `securite` vaut veto à lui seul sur ces PR.

## Règle maison appliquée

<!-- regle-maison:debut -->

Règle maison appliquée: RM-__ — vue dans (fichier):(ligne)

<!-- regle-maison:fin -->

## Définition de « terminé » (REQ-GOV-013)

<!-- dod:debut -->

- [ ] Les REQ couvertes sont listées dans `Couvre:`, et le code ne fait rien de plus qu'elles.
- [ ] Chaque REQ a son test, nommé par son identifiant, annoté `// @req`, et vu ROUGE avant le correctif.
- [ ] Relecteur ≠ auteur : trois lentilles distinctes plus l'avis de mutation, l'auteur ne s'auto-approuve pas.
- [ ] ADR ouverte si une décision de conception a été prise, ou `stop` rendu si elle appartient à Will.
- [ ] Glossaire et vocabulaire à jour : aucune colonne de vocabulaire en chaîne libre, aucun libellé recopié.
- [ ] Mesure avant/après du poids de la route si une route d'interface est touchée, à la main, chiffres collés.
- [ ] `docs/PLAN-STATE.md` régénéré par `pnpm plan-state:build`, jamais édité à la main.
- [ ] Fusionnée par A04 et atterrissage vérifié : l'en-tête de build porte le sha fusionné.

<!-- dod:fin -->
