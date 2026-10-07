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

- [x] **Date de mise en service PRÉVUE posée** par Williams : `MISE_EN_SERVICE` dans
      `scripts/gates/runbooks-exerces.ts` (valeur, source, date de vérification). Sans elle, aucun
      exercice `production-avant-donnees` n'est admis. _Porteur : Williams (décision), l'auteur (PR)._
      **Fait le 2026-09-30** : `2026-12-31`, décision de Williams (16h17), posée par la PR 302.
- [ ] Production provisionnée (`Provisionnement Coolify`), déployée, `pnpm deploy:verify <sha>` vert.
      _Porteur : Williams ou une session autorisée aux gestes de production._
- [ ] Tâche planifiée Coolify, chaque minute : `pnpm taches:lancer` (le lanceur des passages
      planifiés, GOV-137). Constat : un battement récent pour chaque tâche inscrite, et un code non
      nul quand une tâche échoue. _Porteur : Williams (plateforme), constat de l'auteur._
- [ ] Base de production semée de données SYNTHÉTIQUES seulement. _Porteur : Williams (plateforme)._
- [ ] Canal Partners d'axion-ia FERMÉ : `PARTNERS_SYNC_ENABLED` faux côté axion-ia, constaté.
      _Porteur : la session axion-ia (constat daté)._
- [ ] **INT-T56 fusionnée AVANT toute ouverture du canal** : `PARTNERS_SYNC_ENABLED` reste faux tant que
      la charge des candidatures n'est pas minimisée (`partners/ADR-0029`). Sa migration ÉCHOUE, à
      dessein, si une `candidature_recue` traitée porte encore `reponsesJson` (requête :
      `SELECT count(*) FROM evenements_recus WHERE event_type = 'candidature_recue' AND statut =
      'traite' AND charge ? 'reponsesJson'`) ; aucune n'existe tant que le canal est fermé. Si le
      déploiement échoue pour cette raison : ne rien réécrire à la main, ouvrir une décision. Une
      candidature `en_erreur` minimisée à 30 jours (plafond provisoire) ne peut plus être retraitée.
      _Porteur : Williams (réception), après la fusion d'INT-T56._
- [ ] **Contrat d'événements v3 fusionné AVANT toute ouverture du canal, et AVANT DM-15** (INT-T46-P,
      rattrapage 46) : les montants en centimes du contrat publié portent `minimum: 0`, sauf ceux de
      `avoir.emis`, négatifs par conception. Constat : `packages/contracts/contracts.v3.json` est le
      contrat courant, et un paiement reçu au montant négatif y est refusé 422
      (`tests/integration/devis-emis.spec.ts`). Côté axion-ia, la copie du contrat est la v3, à
      empreinte identique (INT-T46-A, lockstep). _Porteur : Williams (réception), après la fusion
      d'INT-T46-P._
- [ ] **Forge** : l'environnement `production` n'accepte que la branche `main` ; aucun secret ne reste au
      niveau du dépôt ; relecteurs requis sur `production` (recommandé). _Porteur : Williams
      (`poser-secrets-production.ps1 -Etape nettoyer`, réglages de la forge)._
- [ ] **Provisionnement** (REQ-INT-031) : aucune ressource nommée `axion-partners-postgres`,
      `axion-partners-redis` ou `axion-partners` n'existe hors du projet `Axion-Partners` de la plateforme.
      _Porteur : Williams (constat dans la plateforme)._
- [ ] **Rôle d'exécution du serveur** (QA-T62, REQ-DM-024) : le secret `PARTNERS_DB_EXECUTION_SECRET`
      (au moins 32 caractères parmi `A-Z a-z 0-9 _ . ~ -`) est posé dans l'environnement `production`
      de la forge, `Provisionnement Coolify` est relancé (il pose `DATABASE_MIGRATION_URL` et
      `DATABASE_URL`), puis l'application est redéployée : l'entrée de l'image provisionne
      `partners_app` et relance le serveur sous lui. Constat en production, connecté sous
      `DATABASE_URL` : `rolsuper` faux, aucune appartenance à `partners_journal`, et
      `ALTER TABLE evenements DISABLE TRIGGER ALL` refusé en `42501`. _Porteur : Williams (secret),
      constat de l'auteur._
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
- [ ] **Canal d'alerte du SERVEUR** (INT-T49, INT-T54) : `TELEGRAM_BOT_TOKEN` (secret de l'environnement
      `production`) et `TELEGRAM_CHAT_ID` (secret du même environnement, une seule source avec
      backup.yml, deploy.yml et nightly.yml) passent à l'APPLICATION par le provisionnement :
      **provisionnement relancé**, et une alerte `attente_depassee` d'essai
      réellement REÇUE dans le salon. À cocher
      AVANT l'ouverture du canal côté axion-ia : sans ce canal, une attente au-delà de son seuil fait
      échouer le passage du lanceur (`canal_alerte_absent`), sans jamais perdre l'alerte. _Porteur :
      Williams (valeurs, réception), l'auteur (consignation)._
- [ ] `PARTNERS_SAUVEGARDE_ACTIVEE` = `oui`, posé AVANT `Sauvegarde` / `configurer`. _Porteur :
      Williams (`poser-secrets-production.ps1 -Etape sauvegarde`)._
- [ ] `configurer`, un vidage, `rechiffrer`, puis `exercice` : **verdict réussi** sous
      `partners/exercices/`. _Porteur : Williams (gestes manuels de `Sauvegarde`), l'auteur (lecture du
      verdict)._
- [ ] La garde des clairs et la fraîcheur nocturne sont vertes. _Porteur : la forge (nightly),
      constat de l'auteur._
- [ ] `deploy.yml` alerte (catégorie close `deploiement_non_atterri`) sur un `deploy:verify` rouge
      PROVOQUÉ, et l'alerte est REÇUE. Sans retour automatique de la plateforme, c'est ce rouge qui
      voit un déploiement malade. _Porteur : QA-T54 (code), Williams (réception)._ **Code livré par
      QA-T54** : le job `alerter` de `deploy.yml` (après un `deployer` rouge ou annulé, seul lecteur
      de `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID`), témoin
      `tests/unit/qualite/alerte-deploiement-non-atterri.spec.ts`. La case reste ouverte tant que la
      réception d'une alerte provoquée n'est pas constatée.

## 4. Les clés et l'entité, juste avant l'ouverture

- [ ] **`APPORTEUR_REF_KEY` est posée dans les secrets de l'environnement `production` AVANT le
      déploiement de la version qui l'exige** (SEC-63) : sans elle, le provisionnement échoue en la
      nommant, et le serveur refuserait de démarrer. Ordre : poser APPORTEUR_REF_KEY par
      POSER-SECRETS-PRODUCTION.bat avant le déploiement (13e secret du script, au coffre), relancer le
      provisionnement,
      puis déployer. _Porteur : Williams (`poser-secrets-production.ps1`)._

- [ ] Les **six clés du coffre** sont régénérées : `PII_HASH_KEY`, `PII_ENCRYPTION_KEY`,
      `AXIONIA_WEBHOOK_SECRET`, `AXIONIA_API_TOKEN`, `AXIONIA_RELECTURE_SECRET` et
      `APPORTEUR_REF_KEY` (SEC-63 : la clé de pseudonymisation des porteurs, stable et hors rotation
      ensuite ; la régénérer AVANT l'ouverture ne casse rien, puisqu'axion-ia ne garde encore aucune
      référence). Aucune valeur manipulée
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
      sentinelle `A-RENSEIGNER` parmi les champs NON secrets. Cinq champs se renseignent dans `config/entite.json` : `domaines.envoi`,
      `banqueReceptrice.bic`, `banqueReceptrice.jeuDeCaracteres`, `banqueReceptrice.espaceDeTest`,
      `banqueReceptrice.formatReleveCsv`. Deux champs arrivent par l'environnement `production`, et JAMAIS
      par le dépôt, qui est public : `PARTNERS_IBAN_DEBITEUR` et `PARTNERS_BIC_DEBITEUR`. Dans le fichier, ces
      deux champs de `banqueDebitrice` gardent `A-RENSEIGNER` POUR TOUJOURS, et c'est voulu : la garde
      ne les compte pas comme sentinelles. Tant qu'une
      sentinelle reste, les quatre points de sortie refusent : contrat, mandat, virement, export annuel.
      _Porteur : Williams (valeurs et décisions), l'auteur (PR du registre, garde verte)._
- [ ] **Information de l'article 14 tranchée au registre** (REQ-JUR-009, REQ-JUR-060, JUR-T09) : la base
      légale de TRT-TIERS, les durées de conservation du tiers (HYP-RGPD-RETENTION) et la localisation de
      l'hébergement du serveur et des sauvegardes (`docs/tiers/coolify.md`, `docs/tiers/cloudflare-r2.md`)
      sont décidées dans `docs/DECISIONS.md` — l'hôte d'envoi est documenté comme `smtp.zeptomail.eu` dans des
      commentaires du code d'axion-ia (AFF-48) ; la valeur effective de `SMTP_HOST` sur `axion-ia-worker` est
      constatée dans Coolify et datée avant de cocher cette case —, et les paramètres du
      texte (`src/content/micro-copy/courriels/information-article-14.ts`) les rendent. Tant que cette
      case n'est pas cochée, **aucun e-mail de confirmation réel ne part**. Cochée après réception par
      Williams. _Porteur : Williams (les trois décisions), A07 (relecture du texte rendu)._
- [ ] **Purge planifiée du contact active** (REQ-DM-031, REQ-SEC-030, DM-48) : la tâche
      `contacts_purger` est inscrite au lanceur et bat chaque minute ; les durées de
      `src/domain/seuils/retention.ts` (HYP-RGPD-RETENTION) sont confirmées par Williams au registre.
      Sans cette case, aucune coordonnée d'un tiers réel n'entre en base. _Porteur : Williams (les
      durées), constat de l'auteur (un battement récent de `contacts_purger`)._
- [ ] Base de production vidée de son semis synthétique, puis `deploy:verify` vert. _Porteur :
      Williams._
- [ ] **Relais de courriels** (INT-T57, REQ-INT-022), AVANT le drapeau d'allumage de l'envoi réel
      (`PARTNERS_EMAIL_DMARC_VERIFIE`) : l'hôte d'envoi est relevé dans « Setup info » de l'agent
      d'envoi, daté dans `docs/tiers/zeptomail.md` §2, et IDENTIQUE à `ZEPTOMAIL_API_URL` ; son pays
      CONCORDE avec `{mentionTransfert}` de JUR-T09 (le centre de données annoncé aux personnes) ;
      `ZEPTOMAIL_SEND_TOKEN` et `ZEPTOMAIL_API_URL` sont posés dans l'environnement `production`.
      `ZEPTOMAIL_SEND_TOKEN` est le jeton d'un agent d'envoi PROPRE à Partners, distinct de tout jeton
      d'axion-ia ; constaté dans la console ZeptoMail avant l'allumage. Le
      drapeau allumé sans eux, le démarrage refuse (`requise_envoi_actif`). _Porteur : Williams
      (relevé, valeurs, drapeau), constat de l'auteur._

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
- [ ] Le passage EXCLUSIF des événements reçus (INT-T55, REQ-ARG-003) est FUSIONNÉ et DÉPLOYÉ : la route
      du webhook et le lanceur prennent le même verrou, et un passage ne dépasse pas son budget. Sans
      lui, deux webhooks rapprochés dispatchent deux fois le même événement. `PARTNERS_SYNC_ENABLED`
      reste faux jusque-là. _Porteur : la forge (déploiement de la fusion), constat de l'auteur ;
      cochée après réception par Williams._
- [ ] `PARTNERS_SYNC_ENABLED` ouvert côté axion-ia, **en DERNIER**, après les cases précédentes.
      _Porteur : Williams._
- [ ] Première donnée réelle : date et sha consignés ci-dessous. _Porteur : Williams, l'auteur (PR)._

## Mise en service

Mise en service le : — · sha : — · par : —
