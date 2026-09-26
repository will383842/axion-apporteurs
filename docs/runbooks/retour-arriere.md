# Runbook — retour arrière d'une image d'Axion Partners

> Livré par QA-T04 (REQ-QA-019). Ce runbook est le SEUL emploi admis de l'échappatoire de migration :
> `tests/integration/sondes-de-vie.spec.ts` refuse qu'un autre fichier qui s'exécute ou se déploie
> l'écrive.

## Quand

L'image fraîchement déployée sert mal, et l'on veut remettre en service l'image **précédente**. Les
migrations sont additives (REQ-DM-037) : le schéma déjà migré accepte l'ancienne image. La migration
n'a donc rien à faire au redémarrage de l'ancienne image, et elle ne doit pas être rejouée par elle.

## Geste

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
