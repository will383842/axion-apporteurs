# Liste de mise en service — la première donnée réelle d'Axion Partners

> Livrée par QA-T13 (REQ-QA-034), sur arbitrage de la coordination (délégation de Williams,
> 2026-09-30). Elle rassemble, dans l'ordre, les conditions de la sauvegarde (REQ-QA-023), des
> runbooks (REQ-QA-034), de la rotation des secrets (REQ-QA-030) et de la lentille `securite`. Aucune
> donnée réelle (apporteur, candidat, client) n'entre dans Partners tant qu'une case reste vide.
> Chaque case cochée porte sa date et sa preuve (run, sha ou commande).

## 1. Avant les exercices

- [ ] **Date de mise en service PRÉVUE posée** par Williams : `MISE_EN_SERVICE` dans
      `scripts/gates/runbooks-exerces.ts` (valeur, source, date de vérification). Sans elle, aucun
      exercice `production-avant-donnees` n'est admis.
- [ ] Production provisionnée (`Provisionnement Coolify`), déployée, `pnpm deploy:verify <sha>` vert.
- [ ] Base de production semée de données SYNTHÉTIQUES seulement.
- [ ] Canal Partners d'axion-ia FERMÉ : `PARTNERS_SYNC_ENABLED` faux côté axion-ia, constaté.

## 2. Les exercices, en `production-avant-donnees`

- [ ] `retour-arriere.md` exercé ; `rollback.yml` exercé pour de vrai (sha cible servi, `readyz` 200,
      `SKIP_MIGRATE` remis à `0`).
- [ ] `migration-echouee.md` exercé ; ensuite, la base de production est **RECRÉÉE** (suppression puis
      provisionnement), semée à nouveau, et `deploy:verify` est vert.
- [ ] `secret-desynchronise.md` exercé, de préférence par une rotation à double clé, canal d'axion-ia
      toujours fermé.
- [ ] Les trois blocs « Exécuté le » sont écrits (date, sha, empreinte du corps), et
      `pnpm runbooks:exerces` sort en 0.
- [ ] Journaux applicatifs et alertes Telegram de l'exercice vidés ou marqués.

## 3. Sauvegarde (REQ-QA-023)

- [ ] `PARTNERS_SAUVEGARDE_ACTIVEE` = `oui`, posé AVANT `Sauvegarde` / `configurer`.
- [ ] `configurer`, un vidage, `rechiffrer`, puis `exercice` : **verdict réussi** sous
      `partners/exercices/`.
- [ ] La garde des clairs et la fraîcheur nocturne sont vertes.

## 4. Les clés, juste avant l'ouverture

- [ ] Les **cinq clés du coffre** sont régénérées : `PII_HASH_KEY`, `PII_ENCRYPTION_KEY`,
      `AXIONIA_WEBHOOK_SECRET`, `AXIONIA_API_TOKEN`, `AXIONIA_RELECTURE_SECRET`. Aucune valeur manipulée
      pendant les exercices ne reste en service. Elles sont copiées dans le gestionnaire de mots de
      passe, puis le provisionnement est relancé et l'application redéployée.
- [ ] Les trois `AXIONIA_*` sont recopiés côté axion-ia (`PARTNERS_SYNC_SECRET`,
      `PARTNERS_RELECTURE_SECRET`), selon la correspondance tenue par axion-ia.
- [ ] Base de production vidée de son semis synthétique, puis `deploy:verify` vert.

## 5. L'ouverture, dans cet ordre

- [ ] `MISE_EN_SERVICE` ramenée au jour de la première donnée réelle, si celui-ci précède la date
      prévue. La date ne fait que reculer vers le réel ; un report plus tardif est une décision datée
      de Williams, tracée dans `docs/DECISIONS.md`.
- [ ] `PARTNERS_SYNC_ENABLED` ouvert côté axion-ia, **en DERNIER**.
- [ ] Première donnée réelle : date et sha consignés ci-dessous.

## Mise en service

Mise en service le : — · sha : — · par : —
