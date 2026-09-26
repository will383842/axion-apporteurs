# Index des ADR — Axion Partners

> ⚠️ **Ce fichier est une VUE. La source est le contenu de `docs/adr/`.**
> Regénéré par `pnpm adr:index`, jamais édité à la main : un index tenu à la main est faux
> le jour où quelqu’un oublie de l’ouvrir, et rien ne le signale (RM-01, REQ-GOV-008).
> `pnpm adr:index --verifier` et la garde `gov:adr` rougissent si ce fichier diffère du listage.
>
> `0000-gabarit.md` est le moule, pas un ADR : il n’est pas indexé.

**24 ADR · 16 `propose`, 8 `accepte`, 0 `remplace`.**

| ADR | Titre | Statut | Date | Tâche |
| --- | --- | --- | --- | --- |
| [`partners/ADR-0001`](0001-pile-technique.md) | La pile technique | `propose` | 2026-09-03 | GOV-009 |
| [`partners/ADR-0002`](0002-frontiere-axionia-sources-de-verite-mono-tenant.md) | La frontière avec axionia, les sources de vérité, le mono-tenant | `propose` | 2026-09-03 | GOV-009 |
| [`partners/ADR-0003`](0003-grille-publiee-et-grille-par-contrat.md) | La grille publiée et la grille par contrat | `propose` | 2026-09-03 | GOV-009 |
| [`partners/ADR-0004`](0004-authentification-et-roles.md) | Authentification et rôles : le défaut est le refus | `propose` | 2026-09-03 | GOV-009 |
| [`partners/ADR-0005`](0005-gouvernance-source-vue-et-ecrivains.md) | La gouvernance : ce qui est source, ce qui est vue, qui écrit quoi | `propose` | 2026-09-03 | GOV-009 |
| [`partners/ADR-0006`](0006-fusion-serialisee-et-atterrissage-verifie.md) | La fusion : file sérialisée, une PR à la fois, atterrissage vérifié | `propose` | 2026-09-03 | GOV-009 |
| [`partners/ADR-0007`](0007-la-branche-porte-le-lot-pas-la-tache.md) | La branche porte le LOT, la tâche porte le COMMIT | `accepte` | 2026-09-03 | GOV-012 |
| [`partners/ADR-0008`](0008-contrat-evenements-enveloppe-et-nomenclature.md) | Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema | `accepte` | 2026-09-03 | INT-T01a |
| [`partners/ADR-0009`](0009-valeurs-du-monde-reel.md) | Une valeur que seul Will connaît est une CONFIGURATION, pas un blocage de plan | `accepte` | 2026-09-05 | CPL-T01 |
| [`partners/ADR-0010`](0010-une-gate-bloquante-et-sa-dette-declaree.md) | Une gate bloquante dont l'exception s'écrit, plutôt qu'une gate qu'on n'exécute pas | `propose` | 2026-09-05 | CPL-T01 |
| [`partners/ADR-0011`](0011-une-seule-implementation-des-listes-d-etats.md) | Les listes d'états occupants ont UNE implémentation, et son discriminant est la couverture | `propose` | 2026-09-14 | GOV-030 |
| [`partners/ADR-0012`](0012-relecture-proportionnee-au-risque.md) | La relecture d'une PR se proportionne à son risque, et l'ordinaire se prouve | `propose` | 2026-09-18 | GOV-077 |
| [`partners/ADR-0013`](0013-secrets-et-donnees-personnelles-chiffrees.md) | Secrets et données personnelles chiffrées | `propose` | 2026-09-18 | SEC-01 |
| [`partners/ADR-0014`](0014-temps-paris-jours-ouvres.md) | Le temps du métier : horloge injectée, heure de Paris calculée, jours ouvrés versionnés | `propose` | 2026-09-19 | CPL-T13 |
| [`partners/ADR-0015`](0015-journal-evenement-chaine-immuable.md) | Le journal Evenement : chaîné, refusé à toute modification par la base, sans donnée personnelle | `accepte` | 2026-09-19 | DM-01 |
| [`partners/ADR-0016`](0016-deux-arbitrages-du-2026-09-03-dates-dans-l-annexe-des-fusions.md) | Deux arbitrages du 2026-09-03 datés dans l'annexe des fusions : la date de référence d'une commande et les trois contrôles de versement | `propose` | 2026-09-19 | — aucune tâche ouverte ne porte la résorption des dettes de texte décidé ; la dette avait été déclarée par GOV-039 |
| [`partners/ADR-0017`](0017-revendication-derivee-de-la-forge.md) | La revendication d'une tâche se dérive de la forge, pas du fichier de la branche | `accepte` | 2026-09-21 | GOV-059 |
| [`partners/ADR-0018`](0018-un-nom-une-garde-gov-check-retire-des-deux-cotes.md) | Un nom, une garde : `gov:check` est retiré des deux côtés | `accepte` | 2026-09-22 | GOV-063 |
| [`partners/ADR-0019`](0019-un-label-designe-une-source-jamais-une-vue.md) | un label de rôle désigne une SOURCE, jamais une vue dérivée | `accepte` | 2026-09-22 | GOV-090 |
| [`partners/ADR-0020`](0020-le-champ-lot-declare-les-taches-d-une-pr-de-lot.md) | Une PR de lot déclare ses tâches dans un champ `Lot:`, et la garde le croit exactement autant que le titre | `accepte` | 2026-09-23 | GOV-096 |
| [`partners/ADR-0021`](0021-quatre-lentilles-pour-l-argent-la-securite-et-les-donnees.md) | Quatre lentilles pour l'argent, la sécurité et les données, deux pour le reste ; la prose inexacte est une dette, pas un refus | `propose` | 2026-09-25 | GOV-097 |
| [`partners/ADR-0022`](0022-carte-du-schema-des-phases-0-et-1.md) | La carte du schéma des phases 0 et 1 : une table, un créateur ; un type de journal par genre de transition | `propose` | 2026-09-26 | GOV-102 |
| [`partners/ADR-0023`](0023-route-des-coordonnees-de-candidature.md) | Les coordonnées d'un candidat se tirent par une route HMAC d'axionia, jamais par un événement | `propose` | 2026-09-26 | INT-T01c |
| [`partners/ADR-0024`](0024-deux-lentilles-mutation-par-stryker-et-relectures-sans-defaut.md) | Deux lentilles partout, la mutation mesurée par Stryker, et les relectures qui ne corrigent aucun défaut | `propose` | 2026-09-26 | GOV-101 |
