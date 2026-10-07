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
   **secrets de l'environnement `production`**, jamais dans une conversation ni dans un fichier
   (REQ-INT-031).
3. La reporter sur la plateforme par le workflow `Provisionnement Coolify`, lancé à la main : il pose
   les variables depuis ces secrets et n'imprime aucune valeur.
4. Redéployer, puis vérifier : `pnpm deploy:verify <sha>` sort en 0, et un événement de test du tiers
   est accepté.
5. Les événements refusés pendant la désynchronisation n'ont PAS été enregistrés par Partners : les
   faire réémettre par le tiers, selon sa propre procédure (sa fiche dans `docs/tiers/`).

## Rotation voulue d'un secret d'axionia, sans refus (QA-T52, REQ-QA-030)

Pour `AXIONIA_WEBHOOK_SECRET` et `AXIONIA_API_TOKEN` : Partners accepte une clé courante et une clé
précédente, et c'est le `kid` présenté par axionia (`x-axionia-kid`, dérivé de la valeur) qui choisit
la clé. Un `kid` absent ou inconnu est refusé ; aucune clé n'est essayée au hasard. L'ordre compte :

1. **Partners d'abord.** Poser dans les secrets de l'environnement `production` `<NOM>_PRECEDENT` = la
   valeur ACTUELLE, `<NOM>_PRECEDENT_ECHEANCE` = un instant ISO 8601 UTC au plus 24 h plus tard, et
   `<NOM>` = la NOUVELLE valeur. Les deux variables de la paire se posent ensemble : le provisionnement
   puis le démarrage refusent sinon, en les nommant (`docs/env.md`). Reporter par `Provisionnement
   Coolify` (il pose la paire quand elle est présente), redéployer, `pnpm deploy:verify`.
2. **axionia ensuite.** Lui faire adopter la nouvelle valeur ; son `kid` suit, puisqu'il dérive de la
   valeur. Jusqu'à l'échéance, un envoi encore signé par l'ancienne valeur passe sous l'ancien `kid`.
3. **Vérifier** qu'un événement de test émis sous le nouveau `kid` est accepté.
4. **Après l'échéance**, la clé précédente est refusée (motif `cle_precedente_echue`). Retirer les deux
   variables `_PRECEDENT` des secrets de l'environnement `production` ET de l'application sur la
   plateforme : le provisionnement pose, il n'efface pas.

Inverser 1 et 2 fait refuser par Partners tout envoi d'axionia, pour `kid` inconnu, jusqu'à l'étape 1.

## Bascule datée d'`APPORTEUR_REF_KEY` (compromission seulement, SEC-63)

`APPORTEUR_REF_KEY` dérive la référence opaque d'un porteur (`apporteurRef`) que Partners donne à
axion-ia. Elle est **hors rotation courante** : la changer change TOUTES les références d'un coup.
Une compromission seule n'expose que la possibilité de relier une référence à un identifiant interne,
qui n'est jamais publié. Elle se traite ainsi, et **seulement sur une décision écrite de Williams** :

1. Dater la bascule avec axion-ia : le jour et l'heure où les nouvelles références remplacent les
   anciennes.
2. À l'heure dite, poser la nouvelle valeur d'`APPORTEUR_REF_KEY` dans les **secrets de
   l'environnement `production`** (au moins 32 octets, distincte de toutes les autres clés), puis
   relancer le workflow `Provisionnement Coolify` et redéployer.
3. axion-ia remplace les références qu'il garde par les nouvelles, à leur prochaine lecture de l'API
   des attributions. Partners ne stocke aucune correspondance : il recalcule chaque référence.
4. Noter la bascule ci-dessous, sans aucune valeur.

## Ce que ce runbook ne fait jamais

- Aucune valeur de secret écrite dans un fichier, une PR, un journal ou une conversation.
- Aucune désactivation de la vérification de signature « le temps de réparer ».

## Exécuté le

Exécuté le : — · environnement : — · SHA : — · résultat : —
