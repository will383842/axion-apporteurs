# Liste de mise en service — la première donnée réelle d'Axion Partners

> Livrée par QA-T13 (REQ-QA-034), sur arbitrage de la coordination (délégation de Williams,
> 2026-09-30). Elle rassemble, dans l'ordre, les conditions de la sauvegarde (REQ-QA-023), des
> runbooks (REQ-QA-034), de la rotation des secrets (REQ-QA-030), du registre de l'entité
> (REQ-CPL-001) et de la lentille `securite`. Aucune donnée réelle (apporteur, candidat, client)
> n'entre dans Partners tant qu'une case reste vide. Chaque case cochée porte sa date et sa preuve
> (run, sha ou commande).
>
> **Porteur** : qui fait le geste. « Williams » désigne un geste humain sur la forge, la plateforme ou
> un tiers ; « l'auteur » désigne la session qui consigne la preuve dans le dépôt ; « la session
> axion-ia » désigne celle qui tient ce dépôt.

## 1. Avant les exercices

- [ ] **Date de mise en service PRÉVUE posée** par Williams : `MISE_EN_SERVICE` dans
      `scripts/gates/runbooks-exerces.ts` (valeur, source, date de vérification). Sans elle, aucun
      exercice `production-avant-donnees` n'est admis. _Porteur : Williams (décision), l'auteur (PR)._
- [ ] Production provisionnée (`Provisionnement Coolify`), déployée, `pnpm deploy:verify <sha>` vert.
      _Porteur : Williams ou une session autorisée aux gestes de production._
- [ ] Base de production semée de données SYNTHÉTIQUES seulement. _Porteur : Williams (plateforme)._
- [ ] Canal Partners d'axion-ia FERMÉ : `PARTNERS_SYNC_ENABLED` faux côté axion-ia, constaté.
      _Porteur : la session axion-ia (constat daté)._
- [ ] **Forge** : l'environnement `production` n'accepte que la branche `main` ; aucun secret ne reste au
      niveau du dépôt ; relecteurs requis sur `production` (recommandé). _Porteur : Williams
      (`poser-secrets-production.ps1 -Etape nettoyer`, réglages de la forge)._
- [ ] **Provisionnement** (REQ-INT-031) : aucune ressource nommée `axion-partners-postgres`,
      `axion-partners-redis` ou `axion-partners` n'existe hors du projet `Axion-Partners` de la plateforme.
      _Porteur : Williams (constat dans la plateforme)._
- [ ] **Données personnelles dans le dépôt public** : tant que la garde `detectPii` n'est pas armée,
      toute PR qui touche `tests/fixtures/**` ou `docs/spec/**` passe par un scan à la main de la lentille
      `securite`. La case se coche à l'armement de `detectPii`. _Porteur : la lentille `securite`,
      jusqu'à l'armement._

## 2. Les exercices, en `production-avant-donnees`

- [ ] `retour-arriere.md` exercé ; `rollback.yml` exercé pour de vrai (sha cible servi, `readyz` 200,
      variable d'échappatoire de migration REMISE À 0 par l'étape finale du workflow). 0 est sans
      risque : l'entrée (`docker-entrypoint.sh`) ne saute la migration que sur la valeur `1` exacte.
      Témoin : `tests/integration/sondes-de-vie.spec.ts`, cas REQ-QA-019 « … saute la migration, le dit
      sur la sortie d'erreur, et lance le serveur » : une autre valeur (`true`) ne saute PAS la
      migration. _Porteur : Williams ou une session autorisée (gestes), l'auteur (consignation)._
- [ ] `migration-echouee.md` exercé ; ensuite, la base de production est **RECRÉÉE** (suppression puis
      provisionnement), semée à nouveau, et `deploy:verify` est vert. _Porteur : Williams (gestes),
      l'auteur (constats et consignation)._
- [ ] `secret-desynchronise.md` exercé, de préférence par une rotation à double clé, canal d'axion-ia
      toujours fermé. _Porteur : Williams (gestes et envois signés), l'auteur (consignation)._
- [ ] Les trois blocs « Exécuté le » sont écrits (date, sha, empreinte du corps), et
      `pnpm runbooks:exerces` sort en 0. _Porteur : l'auteur (PR de consignation)._
- [ ] Journaux applicatifs et alertes Telegram de l'exercice vidés ou marqués. _Porteur : Williams
      (plateforme, salon d'alerte)._

## 3. Sauvegarde et alertes (REQ-QA-023)

- [ ] Cloudflare R2 : versionnage et rétention d'objets DÉSACTIVÉS sur le préfixe `partners/` ; la clé
      d'accès du bucket est bornée à ce bucket et à ce préfixe. _Porteur : Williams (Cloudflare)._
- [ ] `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` posés dans l'environnement `production`, et une alerte
      `rechiffrement_echoue` réellement REÇUE dans le salon (échec provoqué pendant l'exercice).
      _Porteur : Williams (secrets, réception), l'auteur (consignation)._
- [ ] `PARTNERS_SAUVEGARDE_ACTIVEE` = `oui`, posé AVANT `Sauvegarde` / `configurer`. _Porteur :
      Williams (`poser-secrets-production.ps1 -Etape sauvegarde`)._
- [ ] `configurer`, un vidage, `rechiffrer`, puis `exercice` : **verdict réussi** sous
      `partners/exercices/`. _Porteur : Williams (gestes manuels de `Sauvegarde`), l'auteur (lecture du
      verdict)._
- [ ] La garde des clairs et la fraîcheur nocturne sont vertes. _Porteur : la forge (nightly),
      constat de l'auteur._
- [ ] `deploy.yml` alerte (catégorie close `deploiement_non_atterri`) sur un `deploy:verify` rouge
      PROVOQUÉ, et l'alerte est REÇUE. Sans retour automatique de la plateforme, c'est ce rouge qui
      voit un déploiement malade. _Porteur : la tâche que verse A01 (code), Williams (réception)._

## 4. Les clés et l'entité, juste avant l'ouverture

- [ ] Les **cinq clés du coffre** sont régénérées : `PII_HASH_KEY`, `PII_ENCRYPTION_KEY`,
      `AXIONIA_WEBHOOK_SECRET`, `AXIONIA_API_TOKEN`, `AXIONIA_RELECTURE_SECRET`. Aucune valeur manipulée
      pendant les exercices ne reste en service. Elles sont copiées dans le gestionnaire de mots de
      passe, puis le provisionnement est relancé et l'application redéployée. _Porteur : Williams
      (`poser-secrets-production.ps1`)._
- [ ] Côté axion-ia, **deux** secrets sont recopiés : `PARTNERS_SYNC_SECRET` et `PARTNERS_RELECTURE_SECRET`,
      selon la correspondance tenue par axion-ia. Le troisième, `AXIONIA_API_TOKEN`, n'a pas encore de
      nom côté axion-ia : à recopier quand axion-ia appellera l'API entrante de Partners. _Porteur :
      Williams (valeurs), la session axion-ia (correspondance)._
- [ ] Rotation d'exercice terminée : les `<NOM>_PRECEDENT` et `<NOM>_PRECEDENT_ECHEANCE` sont retirés des
      secrets de `production` ET de l'application sur la plateforme (le provisionnement pose, il
      n'efface pas). _Porteur : Williams._
- [ ] **Registre de l'entité renseigné** (REQ-CPL-001) : `pnpm gov:entite` ne compte plus AUCUNE
      sentinelle `A-RENSEIGNER`. Cinq champs se renseignent dans `config/entite.json` : `domaines.envoi`,
      `banqueReceptrice.bic`, `banqueReceptrice.jeuDeCaracteres`, `banqueReceptrice.espaceDeTest`,
      `banqueReceptrice.formatReleveCsv`. Deux champs arrivent par l'environnement `production`, et JAMAIS
      par le dépôt, qui est public : `PARTNERS_IBAN_DEBITEUR` et `PARTNERS_BIC_DEBITEUR`. Tant qu'une
      sentinelle reste, les quatre points de sortie refusent : contrat, mandat, virement, export annuel.
      _Porteur : Williams (valeurs et décisions), l'auteur (PR du registre, garde verte)._
- [ ] Base de production vidée de son semis synthétique, puis `deploy:verify` vert. _Porteur :
      Williams._

## 5. L'ouverture, dans cet ordre

- [ ] `MISE_EN_SERVICE` ramenée au jour de la première donnée réelle, si celui-ci précède la date
      prévue. La date ne fait que reculer vers le réel ; un report plus tardif est une décision datée
      de Williams, tracée dans `docs/DECISIONS.md`. _Porteur : Williams (décision), l'auteur (PR)._
- [x] La double clé de rotation (PR 297, REQ-QA-030) est DÉPLOYÉE en production. _Porteur : la forge
      (déploiement de la fusion), constat de l'auteur._ **Fait le 2026-09-30** : `75602591` (squash de
      la PR 297) atterri, run 36743836589 ; puis `a6545de9`, qui la contient, atterri, run 36750173679.
      `https://apporteurs.axion-ia.com/api/readyz` répond 200 avec `X-Partners-Build-Sha: a6545de9…`.
- [x] Le refus de lecture des coordonnées retirées (axion-ia, PR 1250) est DÉPLOYÉ en production côté
      axion-ia. _Porteur : la session axion-ia._ **Fait le 2026-09-30** : `2bbe3482` (squash de la PR
      1250) servi par axion-ia.com (`x-axion-build-sha`), run « Build & Deploy » 36735033118, job de
      déploiement vert.
- [ ] `PARTNERS_SYNC_ENABLED` ouvert côté axion-ia, **en DERNIER**, après les deux cases précédentes.
      _Porteur : Williams._
- [ ] Première donnée réelle : date et sha consignés ci-dessous. _Porteur : Williams, l'auteur (PR)._

## Mise en service

Mise en service le : — · sha : — · par : —
