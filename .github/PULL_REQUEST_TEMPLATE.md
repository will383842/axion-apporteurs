<!--
GABARIT DE PR — GOV-160 (décision de Williams du 2026-10-09, #319, 6077512137). Lu par `pnpm gov:pr`
(`scripts/gates/gov-pr-niveaux.ts`). Titre : `<type>(<ID-TÂCHE>): <titre>`.

Le NIVEAU se calcule sur les fichiers de la PR (et sa tâche) ; la garde l'imprime :
  · critique (argent, commissions, RIB, journal, authentification, cloisonnement, données
    personnelles, CI et gardes) : lentilles exactitude ET securite, bloc ROUGE/VERT verbatim et
    section Attaque remplis ; le refus de securite vaut veto ;
  · normal : une lentille ; les deux blocs peuvent rester tels quels ;
  · léger (écrans, textes, docs, outillage) : aucune lentille.
L'avis `schema` de l'architecte n'est exigé que si une migration n'est pas purement additive.
Aucune PR n'écrit de statut dans docs/tasks.json : l'avancement se dérive des PR fusionnées.
Le corps est PUBLIC : aucune coordonnée, aucune valeur gardée hors dépôt.
-->

## Ce que fait cette PR

Lot:

<!-- Deux à cinq phrases. `Lot:` : les autres tâches livrées, séparées par des virgules, ou vide. -->

## ROUGE avant VERT (critique seulement)

<!-- rouge-vert:debut -->

ROUGE : (message d'échec verbatim du test, lancé AVANT le code)
VERT : (l'état après le code minimal)

<!-- rouge-vert:fin -->

## Attaque (critique seulement)

<!-- attaque:debut -->

(le scénario joué, le résultat obtenu, qui l'a joué)

<!-- attaque:fin -->
