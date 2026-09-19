# Index des ADR — Axion Partners

> ⚠️ **Ce fichier est une VUE. La source est le contenu de `docs/adr/`.**
> Regénéré par `pnpm adr:index`, jamais édité à la main : un index tenu à la main est faux
> le jour où quelqu’un oublie de l’ouvrir, et rien ne le signale (RM-01, REQ-GOV-008).
> `pnpm adr:index --verifier` et la garde `gov:adr` rougissent si ce fichier diffère du listage.
>
> `0000-gabarit.md` est le moule, pas un ADR : il n’est pas indexé.

**15 ADR · 11 `propose`, 4 `accepte`, 0 `remplace`.**

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
