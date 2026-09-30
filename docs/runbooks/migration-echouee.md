# Runbook — une migration échoue au déploiement

> Livré par QA-T13 (REQ-QA-034), sur le comportement posé par QA-T04 (REQ-QA-019). À exercer avant la
> clôture de la phase 0.
>
> **Où il s'exerce** (amendement (7)-(8) de QA-T13, 2026-09-30) : en `preview`, ou, faute de serveur
> d'aperçus (décision de Williams), en `production-avant-donnees`. Dans ce second cas, l'exercice a lieu sur la
> production STRICTEMENT avant la date de mise en service (`MISE_EN_SERVICE`,
> `scripts/gates/runbooks-exerces.ts`), sur un semis synthétique, sans aucune donnée réelle. Les journaux
> et les alertes de l'exercice sont vidés ou marqués. Le bloc « Exécuté le » en fin de fichier fait foi.
>
> En `production-avant-donnees`, après l'exercice, la base de production est **RECRÉÉE** (suppression,
> puis provisionnement), semée à nouveau, et `pnpm deploy:verify` est vert. Aucune ligne
> `_prisma_migrations` ni aucun objet de la migration cassée ne survit.

## Ce qui s'est passé, et ce qui ne s'est pas passé

L'entrée de l'image (`docker-entrypoint.sh`) migre **avant** de lancer le serveur, en bloquant, en moins
de 60 s. Une migration en échec fait sortir l'entrée en code non nul : le serveur n'est jamais lancé,
l'instance ne devient jamais saine (`HEALTHCHECK` sur `/api/readyz`), et **la plateforme continue de
servir l'ancien conteneur**. Rien n'est cassé côté utilisateur : c'est le déploiement qui a échoué.

## Geste

1. Lire l'en-tête servi : `pnpm deploy:verify <sha-fusionné>` sort en 1 et nomme les deux sha — le sha
   servi est l'ancien. C'est la confirmation que l'ancien conteneur sert toujours.
2. Lire les journaux du conteneur refusé sur la plateforme : la ligne « Demarrage refuse : la migration a
   echoue ou depasse 55 s » et l'erreur de Prisma qui la précède nomment la migration.
3. **Corriger en avant** : une nouvelle PR qui corrige la migration (les migrations sont additives,
   REQ-DM-037), passée par la file de fusion ordinaire. Jamais une commande manuelle contre la base de
   production (`docs/CONVENTIONS.md` §7).
4. Si l'ancien conteneur ne sert plus (redémarrage de la plateforme entre-temps) : appliquer
   `docs/runbooks/retour-arriere.md`.
5. Après la fusion du correctif : `pnpm deploy:verify <sha>` sort en 0.

## Ce que ce runbook ne fait jamais

- Aucune modification à la main de la table `_prisma_migrations`.
- Aucune migration jouée depuis un poste contre la base de production.

## Exécuté le

Exécuté le : — · environnement : — · SHA : — · résultat : —
