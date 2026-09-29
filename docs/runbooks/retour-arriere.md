# Runbook — retour arrière d'une image d'Axion Partners

> Livré par QA-T04 (REQ-QA-019). Ce runbook est le SEUL emploi admis de l'échappatoire de migration :
> `tests/integration/sondes-de-vie.spec.ts` refuse qu'un autre fichier qui s'exécute ou se déploie
> l'écrive.

## Quand

L'image fraîchement déployée sert mal, et l'on veut remettre en service l'image **précédente**. Les
migrations sont additives (REQ-DM-037) : le schéma déjà migré accepte l'ancienne image. La migration
n'a donc rien à faire au redémarrage de l'ancienne image, et elle ne doit pas être rejouée par elle.

## Par la forge — le geste ordinaire (QA-T13, REQ-QA-022)

Lancer le workflow `Retour arriere` à la main, avec le sha COMPLET de l'image à remettre en service.
Il fait les étapes ci-dessous dans l'ordre, et VÉRIFIE : l'en-tête `x-partners-build-sha` servi vaut le
sha cible, et `GET /api/readyz` répond 200. Il remet `SKIP_MIGRATE` à `0` quoi qu'il arrive. Il partage
la file du déploiement ordinaire : il attend un déploiement en cours, il ne l'écrase pas. Rouge : lire son
motif (sha non servi, readyz, refus de la plateforme) avant tout autre geste.

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

Exécuté le : — · environnement : — · SHA : — · résultat : —
