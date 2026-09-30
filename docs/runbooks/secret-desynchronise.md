# Runbook — un secret est désynchronisé entre Partners et un tiers

> Livré par QA-T13 (REQ-QA-034). À exercer avant la clôture de la phase 0.
>
> **Où il s'exerce** (amendement (7)-(8) de QA-T13, 2026-09-30) : en `preview`, ou, faute de serveur
> d'aperçus (décision de Williams), en `production-avant-donnees`. Dans ce second cas, l'exercice a lieu sur la
> production STRICTEMENT avant la date de mise en service (`MISE_EN_SERVICE`,
> `scripts/gates/runbooks-exerces.ts`), sur un semis synthétique, sans aucune donnée réelle. Les journaux
> et les alertes de l'exercice sont vidés ou marqués. Le bloc « Exécuté le » en fin de fichier fait foi.
>
> En `production-avant-donnees` : l'exercice passe de préférence par une rotation à double clé
> (REQ-QA-030) plutôt que par un vrai désaccord. Le canal Partners d'axion-ia est **FERMÉ**
> (`PARTNERS_SYNC_ENABLED` faux, constaté avant et après), car axion-ia sert déjà des données réelles.
> Tous les secrets touchés sont **régénérés** à la fin : aucune valeur manipulée ne reste en service.

## Le symptôme

Les webhooks d'un tiers (axionia, DocuSeal, le relais de courriel) ou les appels d'axionia sont refusés
en série pour signature ou jeton invalide, alors que le tiers les émet. Les deux côtés ne portent plus
la même valeur : un secret a été changé d'un seul côté.

## Geste

1. Identifier le secret par la route qui refuse : `AXIONIA_WEBHOOK_SECRET`, `AXIONIA_API_TOKEN`,
   `DOCUSEAL_WEBHOOK_SECRET`, `ZEPTOMAIL_WEBHOOK_SECRET`, `AXIONIA_RELECTURE_SECRET` (`docs/env.md`).
2. Choisir la valeur qui fait foi — celle du tiers, sauf rotation voulue — et la poser dans les
   **secrets du dépôt**, jamais dans une conversation ni dans un fichier (REQ-INT-031).
3. La reporter sur la plateforme par le workflow `Provisionnement Coolify`, lancé à la main : il pose
   les variables depuis les secrets du dépôt et n'imprime aucune valeur.
4. Redéployer, puis vérifier : `pnpm deploy:verify <sha>` sort en 0, et un événement de test du tiers
   est accepté.
5. Les événements refusés pendant la désynchronisation n'ont PAS été enregistrés par Partners : les
   faire réémettre par le tiers, selon sa propre procédure (sa fiche dans `docs/tiers/`).

## Ce que ce runbook ne fait jamais

- Aucune valeur de secret écrite dans un fichier, une PR, un journal ou une conversation.
- Aucune désactivation de la vérification de signature « le temps de réparer ».

## Exécuté le

Exécuté le : — · environnement : — · SHA : — · résultat : —
