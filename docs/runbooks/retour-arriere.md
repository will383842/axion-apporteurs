# Runbook — retour arrière d'une image d'Axion Partners

> Livré par QA-T04 (REQ-QA-019). Ce runbook est le SEUL emploi admis de l'échappatoire de migration :
> `tests/integration/sondes-de-vie.spec.ts` refuse qu'un autre fichier qui s'exécute ou se déploie
> l'écrive.
>
> **Où il s'exerce** (amendement (7)-(8) de QA-T13, 2026-09-30) : en `preview`, ou, faute de serveur
> d'aperçus (décision de Williams), en `production-avant-donnees`. Dans ce second cas, l'exercice a lieu sur la
> production STRICTEMENT avant la date de mise en service (`MISE_EN_SERVICE`,
> `scripts/gates/runbooks-exerces.ts`), sur un semis synthétique, sans aucune donnée réelle. Les journaux
> et les alertes de l'exercice sont vidés ou marqués. Le bloc « Exécuté le » en fin de fichier fait foi.

## Quand

L'image fraîchement déployée sert mal, et l'on veut remettre en service l'image **précédente**. Les
migrations sont additives (REQ-DM-037) : le schéma déjà migré accepte l'ancienne image. La migration
n'a donc rien à faire au redémarrage de l'ancienne image, et elle ne doit pas être rejouée par elle.

**Pas de retour automatique** (arbitrage du 2026-09-30, accepté par la lentille `securite`) : la sonde
de la plateforme est coupée sur l'application, parce que l'image n'a ni `curl` ni `wget`. Seul le
HEALTHCHECK de l'image, en node, fait foi. Un nouveau conteneur malade donne donc une **coupure
visible**, et non un retour automatique à l'ancien conteneur : le job `deployer` rougit (NON ATTERRI),
et le geste est ce runbook. Mieux vaut une coupure qu'on voit qu'une mauvaise version servie en
silence.

## Par la forge — le geste ordinaire (QA-T13, REQ-QA-022)

Lancer le workflow `Retour arriere` à la main, avec le sha COMPLET de l'image à remettre en service.
Il ne part que de la branche principale, et lit ses secrets dans l'**environnement GitHub
`production`** (jamais au niveau du dépôt). Seul un sha déjà livré est admis : ancêtre de `main`, et
dont l'image `sha-<7>` a été publiée.
Il fait les étapes ci-dessous dans l'ordre, et VÉRIFIE : l'en-tête `x-partners-build-sha` servi vaut le
sha cible, et `GET /api/readyz` répond 200. Il remet `SKIP_MIGRATE` à `0` quoi qu'il arrive. Il partage
la file du déploiement ordinaire : il attend un déploiement en cours, il ne l'écrase pas. Rouge : lire son
motif (sha non servi, readyz, refus de la plateforme) avant tout autre geste.

**Condition de mise en service** (arbitrage de la coordination sur délégation de Williams, 2026-09-30) :
ce workflow ne vise que l'application de production. Exercé en `production-avant-donnees`, il lève
cette condition. Sinon, il s'exerce une fois pour de vrai au premier déploiement réel, AVANT la première
donnée réelle. En `preview`, c'est le geste à la main ci-dessous qui s'exerce.

## Geste — à la main, si la forge est indisponible

1. Sur la plateforme, choisir l'image précédente (son étiquette `sha-<court>`).
2. Poser la variable d'exécution `SKIP_MIGRATE=1` sur l'application, **pour ce seul déploiement**.
3. Déployer. L'entrée écrit sur la sortie d'erreur que la migration est sautée, puis lance le serveur.
4. Lire `GET /api/readyz` : 200, et `enDefaut` vide. Un 503 nomme le sous-système en défaut. Les
   migrations que l'ancienne image porte sont toutes appliquées : la case `migrations` n'a aucune
   raison d'y être en défaut, et si elle l'est, le retour arrière s'arrête là.
5. **Retirer `SKIP_MIGRATE`** dès le déploiement suivant : laissée en place, elle ferait démarrer une
   image neuve sur un schéma qu'elle n'a pas migré.

## Ce que ce runbook ne fait jamais

- Aucune commande manuelle contre la base de production (`docs/CONVENTIONS.md` §7).
- Aucune autre valeur que `1` : toute autre valeur n'est pas l'échappatoire, et la migration est
  tentée.

## Exécuté le

Exécuté le : 2026-09-30 · environnement : production-avant-donnees · SHA : 88363221c375c59392540f25ed8a447f98db02c0 · corps : 980bcfa4f4d3 · résultat : vert, rollback.yml run 36736051182 depuis 6f0b3e9d, sha cible servi (essai 3/60), readyz 200, échappatoire remise à 0 par l'étape always(), puis retour en avant par le déploiement de de2f9c13 (run 36737903234, sha servi vérifié)
