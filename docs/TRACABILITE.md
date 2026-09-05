# Matrice de traçabilité — Axion Apporteurs

> ⚠️ **Ce fichier est une VUE. Ses sources sont `docs/requirements.json`, `docs/tasks.json`
> et les fichiers de test présents sur le disque.**
> Regénérée par `pnpm gov:trace --render`, jamais éditée à la main : une correction tapée
> ici disparaît au rendu suivant, et une matrice tenue à la main est fausse le jour où
> quelqu’un oublie de l’ouvrir (RM-01, REQ-GOV-005 → REQ-QA-014).
> `pnpm gov:trace --verifier` rougit si ce fichier diffère de ce que les sources produisent.
>
> **Le maillon PR n’est pas écrit ici.** Il est contrôlé par `pnpm gov:trace`, qui lit les
> corps de PR fusionnées (`Couvre: REQ-…`). Une vue dont le contenu dépendrait d’un appel
> réseau mesurerait la disponibilité de l’outil, pas la dérivation de la vue.
>
> **« Réputée testée » est DÉRIVÉ, pas lu.** Le registre ne porte aucune échelle de
> maturité : une exigence l’est dès qu’une des tâches qui la portent est livrée.

**321 exigences actives · 31 réputées testées · 31 couvertes · 0 orphelines.**

206 tâches, dont 21 livrées · 31 fichiers de test exécutés par `vitest` sur 31 présents.

## Exigences réputées testées

| Exigence | Tâches porteuses | Tests qui la citent | État |
| --- | --- | --- | --- |
| `REQ-CPL-002` | `CPL-T01`, `GOV-015`, `T-ARG-018` | `tests/unit/gouvernance/entite-registre.spec.ts`, `tests/unit/gouvernance/fiches-tiers.spec.ts` | couverte |
| `REQ-CPL-018` | `CPL-T01`, `GOV-009` | `tests/unit/gouvernance/adr-index-derive.spec.ts`, `tests/unit/gouvernance/entite-registre.spec.ts` | couverte |
| `REQ-CPL-021` | `GOV-000`, `QA-T04` | `tests/unit/gouvernance/autonomie.spec.ts` | couverte |
| `REQ-GOV-001` | `GOV-001` | `tests/unit/gouvernance/gardes.spec.ts` | couverte |
| `REQ-GOV-002` | `GOV-002` | `tests/unit/gouvernance/preseance.spec.ts` | couverte |
| `REQ-GOV-003` | `GOV-003`, `GOV-005`, `GOV-025`, `GOV-028` | `tests/unit/gouvernance/citation-json-vs-prose.spec.ts`, `tests/unit/gouvernance/gardes.spec.ts`, `tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts` | couverte |
| `REQ-GOV-004` | `GOV-004` | `tests/unit/gouvernance/affirmations-verifiees.spec.ts` | couverte |
| `REQ-GOV-006` | `GOV-008`, `GOV-032` | `tests/unit/gouvernance/plan-state-frais.spec.ts` | couverte |
| `REQ-GOV-007` | `GOV-008` | `tests/unit/gouvernance/une-tache-un-owner.spec.ts` | couverte |
| `REQ-GOV-008` | `GOV-009` | `tests/unit/gouvernance/adr-index-derive.spec.ts`, `tests/unit/gouvernance/attestation-inter-depot.spec.ts` | couverte |
| `REQ-GOV-009` | `GOV-010`, `GOV-022` | `tests/unit/gouvernance/adr-assertion-existe.spec.ts` | couverte |
| `REQ-GOV-010` | `GOV-007`, `GOV-023` | `tests/gov/charte-pr.spec.ts`, `tests/unit/gouvernance/fiches-agents.spec.ts` | couverte |
| `REQ-GOV-011` | `GOV-007`, `GOV-021` | `tests/gov/charte-pr.spec.ts` | couverte |
| `REQ-GOV-012` | `GOV-007` | `tests/gov/charte-pr.spec.ts` | couverte |
| `REQ-GOV-013` | `GOV-007` | `tests/gov/charte-pr.spec.ts` | couverte |
| `REQ-GOV-014` | `GOV-000`, `GOV-012` | `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts`, `tests/unit/gouvernance/tout-check-est-cable.spec.ts` | couverte |
| `REQ-GOV-015` | `GOV-005`, `GOV-022`, `GOV-027`, `JUR-T01b` | `tests/unit/gouvernance/gardes.spec.ts`, `tests/unit/gouvernance/registre-lecteur-unique.spec.ts` | couverte |
| `REQ-GOV-021` | `GOV-017a`, `GOV-017b`, `GOV-024`, `GOV-027` | `tests/unit/gouvernance/paths-derives.spec.ts`, `tests/unit/gouvernance/registre-lecteur-unique.spec.ts`, `tests/unit/gouvernance/vues-derivees.spec.ts` | couverte |
| `REQ-GOV-022` | `GOV-015` | `tests/unit/gouvernance/fiches-tiers.spec.ts` | couverte |
| `REQ-GOV-023` | `GOV-008`, `GOV-018` | `tests/unit/gouvernance/plan-state-frais.spec.ts`, `tests/unit/gouvernance/regles-maison.spec.ts` | couverte |
| `REQ-GOV-024` | `GOV-018`, `GOV-026` | `tests/unit/gouvernance/regles-maison.spec.ts` | couverte |
| `REQ-GOV-025` | `GOV-017a`, `GOV-017b` | `tests/unit/gouvernance/attestation-inter-depot.spec.ts`, `tests/unit/gouvernance/paths-derives.spec.ts` | couverte |
| `REQ-GOV-026` | `GOV-001`, `GOV-020` | `tests/unit/gouvernance/attestation-inter-depot.spec.ts`, `tests/unit/gouvernance/inventaire-prouve.spec.ts` | couverte |
| `REQ-GOV-027` | `CPL-T23`, `GOV-017a`, `GOV-017b`, `GOV-022` | `tests/gov/charte-pr.spec.ts`, `tests/unit/gouvernance/verrou-de-phase.spec.ts` | couverte |
| `REQ-GOV-030` | `GOV-002` | `tests/unit/gouvernance/preseance.spec.ts` | couverte |
| `REQ-GOV-031` | `GOV-000` | `tests/unit/gouvernance/entite-registre.spec.ts`, `tests/unit/gouvernance/gardes.spec.ts` | couverte |
| `REQ-INT-003` | `INT-T01a` | `tests/unit/integration/contrat-hash.spec.ts` | couverte |
| `REQ-INT-004` | `GOV-030`, `INT-T01a`, `INT-T05` | `tests/unit/integration/contrat-hash.spec.ts` | couverte |
| `REQ-INT-029` | `INT-T01a` | `tests/unit/integration/contrat-hash.spec.ts` | couverte |
| `REQ-QA-007` | `INT-T01a`, `INT-T01b` | `tests/unit/integration/contrat-hash.spec.ts` | couverte |
| `REQ-QA-013` | `QA-T00`, `QA-T01`, `QA-T07`, `QA-T28` | `tests/unit/gouvernance/tout-check-est-cable.spec.ts` | couverte |

## Exigences actives dont aucune tâche n’est encore livrée

| Exigence | Phase | Tâches porteuses | Tests déclarés |
| --- | ---: | --- | --- |
| `REQ-ARG-002` | -1 | `INT-T01b`, `SEC-06`, `T-ARG-022` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-ARG-003` | 0 | `SEC-06`, `T-ARG-022` | — |
| `REQ-ARG-004` | 0 | `DM-04`, `T-ARG-036`, `T-ARG-037` | — |
| `REQ-ARG-005` | -1 | `DM-15`, `INT-T01b`, `INT-T05` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-ARG-007` | 0 | `DM-04` | — |
| `REQ-ARG-008` | 2 | `DM-15`, `T-ARG-037` | — |
| `REQ-ARG-010` | 2 | `DM-15` | — |
| `REQ-ARG-012` | 2 | `DM-16` | — |
| `REQ-ARG-013` | 2 | `DM-16` | — |
| `REQ-ARG-014` | 2 | `T-ARG-015` | — |
| `REQ-ARG-015` | 2 | `T-ARG-015`, `T-ARG-033`, `T-ARG-038` | — |
| `REQ-ARG-016` | 2 | `JUR-T16`, `T-ARG-015`, `T-ARG-032`, `T-ARG-038` | — |
| `REQ-ARG-017` | 0 | `CPL-T12`, `DM-04`, `T-ARG-010`, `T-ARG-015`, `T-ARG-039`, `UX-P2-01` | — |
| `REQ-ARG-018` | 1 | `JUR-T01c`, `T-ARG-016`, `T-ARG-038`, `T-ARG-039` | — |
| `REQ-ARG-019` | 2 | `T-ARG-017` | — |
| `REQ-ARG-020` | 2 | `T-ARG-018` | — |
| `REQ-ARG-021` | 2 | `T-ARG-010`, `T-ARG-018`, `T-ARG-019` | — |
| `REQ-ARG-022` | 2 | `T-ARG-019` | — |
| `REQ-ARG-023` | 3 | `T-ARG-030` | — |
| `REQ-ARG-024` | 2 | `DM-19` | — |
| `REQ-ARG-025` | 2 | `JUR-T16`, `T-ARG-032` | — |
| `REQ-ARG-026` | 2 | `DM-18`, `T-ARG-033`, `T-ARG-038` | — |
| `REQ-ARG-027` | 2 | `DM-15`, `T-ARG-010`, `T-ARG-035` | — |
| `REQ-ARG-028` | 2 | `T-ARG-016`, `T-ARG-034` | — |
| `REQ-ARG-029` | 0 | `INT-T17`, `SEC-05` | — |
| `REQ-ARG-032` | 2 | `UX-P2-01` | — |
| `REQ-ARG-033` | 2 | `T-ARG-010`, `T-ARG-016` | — |
| `REQ-ARG-034` | 2 | `JUR-T16`, `T-ARG-015`, `T-ARG-039` | — |
| `REQ-ARG-035` | 2 | `T-ARG-016`, `T-ARG-033`, `T-ARG-038`, `UX-P2-04` | — |
| `REQ-CPL-001` | -1 | `CPL-T01`, `T-ARG-018` | `tests/unit/gouvernance/entite-registre.spec.ts` |
| `REQ-CPL-003` | -1 | `CPL-T01` | `tests/unit/gouvernance/entite-registre.spec.ts` |
| `REQ-CPL-004` | -1 | `CPL-T01`, `DM-11` | `tests/unit/gouvernance/entite-registre.spec.ts` |
| `REQ-CPL-005` | 0 | `DM-06`, `DM-11` | — |
| `REQ-CPL-006` | 1 | `CPL-T06` | — |
| `REQ-CPL-007` | 2 | `INT-T23`, `UX-P2-05` | — |
| `REQ-CPL-008` | 1 | `SEC-12` | — |
| `REQ-CPL-009` | 0 | `JUR-T04` | — |
| `REQ-CPL-010` | 2 | `CPL-T12`, `T-ARG-010` | — |
| `REQ-CPL-011` | 2 | `CPL-T11`, `CPL-T23`, `T-ARG-015` | — |
| `REQ-CPL-012` | 0 | `CPL-T12`, `JUR-T01` | `contract-template-complete.spec.ts` |
| `REQ-CPL-013` | 0 | `CPL-T13` | — |
| `REQ-CPL-014` | 2 | `CPL-T14-A`, `CPL-T14-P` | — |
| `REQ-CPL-015` | -1 | `CPL-T15`, `INT-T01b`, `INT-T22` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-CPL-016` | 1 | `INT-T21-P` | — |
| `REQ-CPL-017` | -1 | `CPL-T01` | `tests/unit/gouvernance/entite-registre.spec.ts` |
| `REQ-CPL-019` | 1 | `UX-P1-09` | — |
| `REQ-CPL-020` | 0 | `DM-06`, `T-ARG-015` | — |
| `REQ-CPL-022` | 0 | `CPL-T22` | — |
| `REQ-CPL-023` | 3 | `UX-P3-02` | — |
| `REQ-CPL-024` | 1 | `DM-09`, `UX-P1-06` | — |
| `REQ-CPL-025` | 3 | `T-ARG-033` | — |
| `REQ-CPL-026` | 0 | `CPL-T13` | — |
| `REQ-CPL-027` | 0 | `DM-06`, `JUR-T24`, `UX-P1-12`, `UX-P3-06` | — |
| `REQ-CPL-028` | 1 | `INT-T23`, `INT-T24` | — |
| `REQ-CPL-029` | 1 | `UX-P1-15` | — |
| `REQ-DM-001` | 0 | `DM-01`, `DM-02` | — |
| `REQ-DM-002` | 1 | `DM-07` | — |
| `REQ-DM-003` | -1 | `DM-02`, `DM-07`, `GOV-006`, `GOV-030` | `glossaire-enums.spec.ts`, `tests/unit/gouvernance/termes-interdits.spec.ts` |
| `REQ-DM-004` | 1 | `DM-07`, `DM-08`, `DM-13` | — |
| `REQ-DM-005` | 1 | `DM-07` | — |
| `REQ-DM-006` | 1 | `DM-08`, `DM-13`, `DM-24` | — |
| `REQ-DM-007` | 1 | `DM-08`, `DM-13` | — |
| `REQ-DM-008` | 1 | `DM-09`, `DM-24` | — |
| `REQ-DM-009` | 1 | `DM-09` | — |
| `REQ-DM-010` | 0 | `DM-06`, `DM-09`, `JUR-T24`, `SEC-12` | — |
| `REQ-DM-011` | 0 | `DM-06`, `DM-18`, `SEC-19` | — |
| `REQ-DM-012` | 0 | `DM-06` | — |
| `REQ-DM-013` | 1 | `DM-11`, `DM-23`, `INT-T23` | — |
| `REQ-DM-014` | 0 | `DM-03-A`, `DM-03-P` | — |
| `REQ-DM-015` | 0 | `DM-04` | — |
| `REQ-DM-016` | 2 | `DM-15` | — |
| `REQ-DM-017` | 0 | `DM-04`, `DM-15` | — |
| `REQ-DM-018` | -1 | `DM-15`, `INT-T01b` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-DM-019` | 2 | `DM-15` | — |
| `REQ-DM-020` | 2 | `T-ARG-010` | — |
| `REQ-DM-021` | 0 | `DM-15`, `INT-T03` | — |
| `REQ-DM-022` | 1 | `DM-08`, `DM-15` | — |
| `REQ-DM-023` | 2 | `DM-16` | — |
| `REQ-DM-024` | 0 | `DM-01`, `DM-20` | — |
| `REQ-DM-025` | 2 | `T-ARG-015` | — |
| `REQ-DM-026` | 2 | `T-ARG-010`, `T-ARG-019` | — |
| `REQ-DM-027` | 1 | `DM-11`, `DM-19`, `JUR-T16`, `T-ARG-032` | — |
| `REQ-DM-028` | 1 | `DM-10-P` | — |
| `REQ-DM-029` | 1 | `DM-10-P` | — |
| `REQ-DM-030` | 1 | `DM-07`, `DM-21` | — |
| `REQ-DM-031` | 1 | `DM-07`, `DM-13`, `DM-20` | — |
| `REQ-DM-032` | 1 | `DM-12` | — |
| `REQ-DM-033` | 1 | `DM-12`, `SEC-14` | — |
| `REQ-DM-034` | 1 | `DM-12`, `T-ARG-035` | — |
| `REQ-DM-035` | 0 | `DM-06`, `INT-T22` | — |
| `REQ-DM-036` | 0 | `SEC-06` | — |
| `REQ-DM-037` | 0 | `DM-02` | — |
| `REQ-DM-038` | 0 | `DM-01`, `DM-02` | — |
| `REQ-DM-039` | -1 | `INT-T01b`, `INT-T05` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-DM-040` | -1 | `DM-04`, `INT-T01b` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-DM-041` | 0 | `DM-01`, `DM-20` | — |
| `REQ-DM-042` | 1 | `DM-13`, `DM-24` | — |
| `REQ-DM-043` | 1 | `DM-25` | — |
| `REQ-EXT-001` | 1 | `EXT-T01` | — |
| `REQ-EXT-002` | 1 | `EXT-T01` | — |
| `REQ-EXT-003` | 1 | `EXT-T01`, `EXT-T02a` | — |
| `REQ-EXT-004` | 1 | `EXT-T01` | — |
| `REQ-EXT-005` | 1 | `EXT-T02a`, `EXT-T02b` | — |
| `REQ-EXT-006` | 1 | `EXT-T06` | — |
| `REQ-EXT-007` | 1 | `EXT-T06` | — |
| `REQ-EXT-008` | 1 | `EXT-T03`, `EXT-T05` | — |
| `REQ-EXT-009` | 1 | `EXT-T03`, `EXT-T05` | — |
| `REQ-EXT-010` | 1 | `EXT-T03` | — |
| `REQ-EXT-011` | 1 | `EXT-T04` | — |
| `REQ-EXT-012` | 1 | `EXT-T04` | — |
| `REQ-EXT-013` | 3 | `EXT-T11` | — |
| `REQ-EXT-014` | 1 | `EXT-T04` | — |
| `REQ-EXT-015` | 1 | `EXT-T08` | — |
| `REQ-EXT-016` | 3 | `EXT-T09` | — |
| `REQ-EXT-017` | 3 | `EXT-T09` | — |
| `REQ-EXT-018` | 3 | `EXT-T09` | — |
| `REQ-EXT-019` | 3 | `EXT-T10` | — |
| `REQ-EXT-020` | 2 | `EXT-T07` | — |
| `REQ-EXT-021` | 1 | `DM-23` | — |
| `REQ-EXT-022` | 1 | `DM-23`, `T-ARG-037` | — |
| `REQ-EXT-023` | 1 | `DM-23`, `UX-P1-14` | — |
| `REQ-EXT-024` | 1 | `DM-23`, `UX-P1-14` | — |
| `REQ-EXT-025` | 1 | `DM-23`, `T-ARG-037`, `UX-P2-07` | — |
| `REQ-EXT-026` | 1 | `DM-23` | — |
| `REQ-EXT-027` | 1 | `DM-23`, `UX-P1-14` | — |
| `REQ-EXT-028` | 0 | `JUR-T02` | — |
| `REQ-EXT-029` | 2 | `UX-P2-04` | — |
| `REQ-GOV-016` | -1 | `GOV-006` | `glossaire-enums.spec.ts` |
| `REQ-GOV-017` | -1 | `GOV-013` | `lexique.spec.ts` |
| `REQ-GOV-018` | -1 | `GOV-014`, `GOV-031` | `gardes-transposees.spec.ts`, `tests/unit/gouvernance/gardes-transposees.spec.ts` |
| `REQ-GOV-028` | -1 | `GOV-019` | `poids-du-bundle-garde-vraiment.spec.ts` |
| `REQ-GOV-029` | -1 | `GOV-014` | `gardes-transposees.spec.ts` |
| `REQ-GOV-032` | -1 | `GOV-024` | `tests/unit/gouvernance/vues-derivees.spec.ts` |
| `REQ-GOV-033` | -1 | `GOV-029` | `tests/unit/gouvernance/lot-identifiant-unique.spec.ts` |
| `REQ-INT-001` | 0 | `INT-T02` | `outbox-produit-des-evenements-valides.spec.ts` |
| `REQ-INT-005` | -1 | `INT-T01b`, `INT-T05` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-INT-006` | -1 | `INT-T01b`, `INT-T04` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-INT-007` | 0 | `INT-T03`, `INT-T04`, `INT-T05`, `SEC-28` | — |
| `REQ-INT-008` | 0 | `INT-T02` | `outbox-produit-des-evenements-valides.spec.ts` |
| `REQ-INT-009` | 0 | `INT-T02` | `outbox-produit-des-evenements-valides.spec.ts` |
| `REQ-INT-011` | 0 | `INT-T21-A`, `INT-T21-P`, `SEC-06` | — |
| `REQ-INT-012` | 0 | `INT-T02`, `INT-T08-A`, `INT-T08-P`, `INT-T21-A`, `INT-T21-P` | `outbox-produit-des-evenements-valides.spec.ts` |
| `REQ-INT-013` | 1 | `INT-T08-A`, `INT-T08-P` | — |
| `REQ-INT-014` | 0 | `INT-T07-A`, `INT-T07-P`, `SEC-07` | — |
| `REQ-INT-015` | 0 | `INT-T03`, `INT-T07-A`, `INT-T07-P` | — |
| `REQ-INT-016` | 2 | `INT-T17`, `T-ARG-030` | — |
| `REQ-INT-017` | 0 | `DM-03-A`, `DM-03-P` | — |
| `REQ-INT-019` | 1 | `INT-T12`, `INT-T24` | — |
| `REQ-INT-020` | 0 | `INT-T09` | — |
| `REQ-INT-021` | 0 | `INT-T09` | — |
| `REQ-INT-022` | 0 | `INT-T10` | — |
| `REQ-INT-023` | 0 | `INT-T10` | — |
| `REQ-INT-024` | 0 | `INT-T14` | — |
| `REQ-INT-025` | 3 | `UX-P3-01` | — |
| `REQ-INT-026` | 0 | `INT-T11` | — |
| `REQ-INT-027` | 1 | `INT-T13`, `INT-T17` | — |
| `REQ-INT-030` | 1 | `INT-T08-A`, `INT-T08-P`, `QA-T19` | — |
| `REQ-INT-031` | 0 | `INT-T02` | `outbox-produit-des-evenements-valides.spec.ts` |
| `REQ-INT-032` | -1 | `DM-15`, `INT-T01b`, `INT-T05`, `INT-T22` | `axionia/src/server/partners/__tests__/commission.spec.ts`, `axionia/src/server/partners/__tests__/derivation-ht.spec.ts`, `axionia/src/server/partners/__tests__/enveloppe.spec.ts`, `axionia/src/server/partners/__tests__/fixtures-et-frontiere.spec.ts`, `axionia/src/server/partners/__tests__/payloads.spec.ts`, `axionia/src/server/partners/__tests__/transcription-du-contrat.spec.ts` |
| `REQ-JUR-001` | 0 | `JUR-T03`, `JUR-T29` | `remuneration-indicative.spec.ts`, `vocabulaire-apporteur.spec.ts` |
| `REQ-JUR-002` | 0 | `JUR-T03`, `JUR-T29` | `remuneration-indicative.spec.ts`, `vocabulaire-apporteur.spec.ts` |
| `REQ-JUR-003` | 0 | `JUR-T01`, `JUR-T01b` | `contract-template-complete.spec.ts`, `decisions-ouvertes.spec.ts` |
| `REQ-JUR-004` | 1 | `INT-T12`, `INT-T23` | — |
| `REQ-JUR-005` | 1 | `INT-T12` | — |
| `REQ-JUR-006` | 1 | `DM-09` | — |
| `REQ-JUR-007` | 0 | `DM-25`, `JUR-T01`, `JUR-T01b`, `T-ARG-033` | `contract-template-complete.spec.ts`, `decisions-ouvertes.spec.ts` |
| `REQ-JUR-008` | 1 | `SEC-12` | — |
| `REQ-JUR-009` | 0 | `JUR-T04`, `JUR-T09` | — |
| `REQ-JUR-011` | 1 | `SEC-16` | — |
| `REQ-JUR-012` | 1 | `JUR-T13`, `UX-P1-11` | `textes-apporteurs-charte-relationnelle.spec.ts` |
| `REQ-JUR-013` | 1 | `JUR-T13`, `UX-P1-11` | `textes-apporteurs-charte-relationnelle.spec.ts` |
| `REQ-JUR-015` | 0 | `JUR-T02` | — |
| `REQ-JUR-020` | 2 | `DM-16` | — |
| `REQ-JUR-022` | 1 | `DM-11` | — |
| `REQ-JUR-023` | 0 | `DM-23`, `JUR-T01`, `SEC-12` | `contract-template-complete.spec.ts` |
| `REQ-JUR-024` | 0 | `JUR-T03` | `vocabulaire-apporteur.spec.ts` |
| `REQ-JUR-025` | 0 | `EXT-T01`, `JUR-T04`, `T-ARG-033` | — |
| `REQ-JUR-028` | 1 | `SEC-21` | — |
| `REQ-JUR-029` | 0 | `DM-11`, `JUR-T02`, `T-ARG-033` | — |
| `REQ-JUR-030` | 3 | `JUR-T22` | — |
| `REQ-JUR-031` | 0 | `JUR-T24`, `JUR-T27`, `JUR-T28`, `SEC-14`, `SEC-15`, `UX-P1-12` | `contrat-sobre.spec.ts` |
| `REQ-JUR-032` | 1 | `JUR-T24` | — |
| `REQ-JUR-033` | 1 | `JUR-T25`, `UX-P1-10`, `UX-P3-06` | — |
| `REQ-JUR-034` | 0 | `JUR-T26` | — |
| `REQ-JUR-035` | 0 | `JUR-T26` | — |
| `REQ-JUR-036` | 0 | `JUR-T26` | — |
| `REQ-JUR-037` | 0 | `JUR-T26` | — |
| `REQ-JUR-038` | 3 | `GOV-022` | — |
| `REQ-JUR-039` | 1 | `JUR-T30`, `UX-P1-10` | — |
| `REQ-JUR-040` | 1 | `JUR-T30`, `SEC-14` | — |
| `REQ-JUR-041` | 0 | `JUR-T29`, `JUR-T30`, `UX-P1-11`, `UX-P3-02` | `remuneration-indicative.spec.ts` |
| `REQ-JUR-042` | 1 | `JUR-T24`, `SEC-19`, `UX-P1-10`, `UX-P1-12` | — |
| `REQ-QA-001` | 0 | `QA-T01` | `aucune-gate-en-continue-on-error.spec.ts` |
| `REQ-QA-002` | 0 | `QA-T01`, `QA-T30` | `aucune-gate-en-continue-on-error.spec.ts` |
| `REQ-QA-003` | 2 | `QA-T21` | — |
| `REQ-QA-004` | 1 | `DM-08` | — |
| `REQ-QA-005` | 2 | `QA-T28`, `QA-T29` | — |
| `REQ-QA-006` | 0 | `QA-T02` | — |
| `REQ-QA-014` | 0 | `QA-T03` | `req-check.spec.ts` |
| `REQ-QA-015` | 0 | `QA-T06` | — |
| `REQ-QA-016` | 0 | `QA-T16`, `UX-P0-03` | — |
| `REQ-QA-017` | 1 | `QA-T16` | — |
| `REQ-QA-018` | 0 | `QA-T05` | — |
| `REQ-QA-019` | 0 | `QA-T04` | — |
| `REQ-QA-020` | 0 | `QA-T04` | — |
| `REQ-QA-021` | 0 | `QA-T11` | — |
| `REQ-QA-022` | 0 | `QA-T13` | — |
| `REQ-QA-023` | 0 | `QA-T12` | — |
| `REQ-QA-024` | 0 | `QA-T08` | — |
| `REQ-QA-025` | 1 | `QA-T19` | — |
| `REQ-QA-026` | 1 | `INT-T08-P`, `QA-T19`, `QA-T27` | — |
| `REQ-QA-027` | 0 | `CPL-T13`, `DM-13`, `T-ARG-015` | — |
| `REQ-QA-028` | 0 | `INT-T09` | — |
| `REQ-QA-029` | 2 | `T-ARG-018` | — |
| `REQ-QA-030` | 0 | `QA-T04`, `QA-T13` | — |
| `REQ-QA-032` | 0 | `QA-T05` | — |
| `REQ-QA-034` | 0 | `QA-T13`, `QA-T25` | — |
| `REQ-QA-035` | 0 | `DM-06`, `INT-T22` | — |
| `REQ-SEC-001` | 0 | `SEC-03` | — |
| `REQ-SEC-002` | 0 | `SEC-03` | — |
| `REQ-SEC-003` | 0 | `SEC-04`, `SEC-19`, `UX-P1-04` | — |
| `REQ-SEC-004` | 0 | `SEC-04`, `SEC-22` | — |
| `REQ-SEC-005` | 1 | `SEC-11`, `SEC-19`, `UX-P1-11` | — |
| `REQ-SEC-006` | 1 | `SEC-11` | — |
| `REQ-SEC-008` | 0 | `SEC-05` | — |
| `REQ-SEC-009` | 0 | `SEC-05`, `UX-P2-06` | — |
| `REQ-SEC-010` | 0 | `SEC-06` | — |
| `REQ-SEC-012` | 0 | `SEC-07` | — |
| `REQ-SEC-013` | 0 | `INT-T09` | — |
| `REQ-SEC-014` | 1 | `DM-07`, `SEC-12` | — |
| `REQ-SEC-016` | 0 | `SEC-03`, `SEC-10` | — |
| `REQ-SEC-017` | 1 | `SEC-14` | — |
| `REQ-SEC-018` | 1 | `SEC-15` | — |
| `REQ-SEC-019` | 1 | `SEC-15`, `SEC-28` | — |
| `REQ-SEC-020` | 1 | `SEC-12`, `SEC-14` | — |
| `REQ-SEC-021` | 1 | `SEC-16` | — |
| `REQ-SEC-022` | 0 | `DM-10-P`, `DM-25`, `SEC-05`, `SEC-12`, `SEC-16` | — |
| `REQ-SEC-023` | 0 | `SEC-17` | — |
| `REQ-SEC-024` | 0 | `SEC-08` | — |
| `REQ-SEC-025` | 2 | `SEC-22` | — |
| `REQ-SEC-026` | 1 | `DM-11` | — |
| `REQ-SEC-028` | 0 | `SEC-01` | — |
| `REQ-SEC-029` | 0 | `SEC-02` | — |
| `REQ-SEC-030` | 0 | `DM-20`, `JUR-T04` | — |
| `REQ-SEC-031` | 1 | `SEC-18` | — |
| `REQ-SEC-032` | 1 | `SEC-12`, `SEC-19`, `T-ARG-038` | — |
| `REQ-SEC-033` | 1 | `SEC-26`, `UX-P1-03` | — |
| `REQ-SEC-034` | 1 | `INT-T12` | — |
| `REQ-SEC-035` | 0 | `SEC-10` | — |
| `REQ-SEC-036` | 1 | `SEC-14` | — |
| `REQ-SEC-037` | 1 | `SEC-21` | — |
| `REQ-SEC-038` | 1 | `SEC-14`, `SEC-15`, `SEC-28` | — |
| `REQ-UX-001` | 1 | `UX-P1-01`, `UX-P1-02` | — |
| `REQ-UX-002` | 0 | `DM-25`, `SEC-12`, `UX-P0-01`, `UX-P1-02`, `UX-P3-05` | — |
| `REQ-UX-003` | 0 | `UX-P0-01`, `UX-P1-10`, `UX-P3-02` | — |
| `REQ-UX-004` | 1 | `UX-P1-05` | — |
| `REQ-UX-005` | 2 | `UX-P2-01`, `UX-P2-06` | — |
| `REQ-UX-006` | 0 | `DM-16`, `SEC-05`, `UX-P2-04`, `UX-P2-06` | — |
| `REQ-UX-007` | 1 | `SEC-16`, `UX-P1-01` | — |
| `REQ-UX-008` | 0 | `UX-P0-02`, `UX-P1-08` | `maquettes-validees.spec.ts` |
| `REQ-UX-009` | 2 | `UX-P2-02` | — |
| `REQ-UX-010` | 2 | `UX-P2-01` | — |
| `REQ-UX-011` | 2 | `UX-P2-01`, `UX-P2-05` | — |
| `REQ-UX-012` | 2 | `UX-P2-01` | — |
| `REQ-UX-013` | 1 | `UX-P1-03` | — |
| `REQ-UX-014` | 3 | `UX-P3-01` | — |
| `REQ-UX-015` | 1 | `UX-P1-04` | — |
| `REQ-UX-016` | 1 | `INT-T24`, `UX-P1-09`, `UX-P1-10`, `UX-P1-11`, `UX-P3-01`, `UX-P3-06` | — |
| `REQ-UX-017` | 0 | `UX-P0-02`, `UX-P0-03` | `maquettes-validees.spec.ts` |
| `REQ-UX-018` | 0 | `UX-P0-03`, `UX-P3-04` | — |
| `REQ-UX-019` | 0 | `UX-P0-01`, `UX-P1-08` | — |
| `REQ-UX-020` | 0 | `INT-T09` | — |
| `REQ-UX-021` | 1 | `UX-P1-06` | — |
| `REQ-UX-022` | 0 | `CPL-T13`, `UX-P1-07` | — |
| `REQ-UX-023` | 1 | `UX-P1-05` | — |
| `REQ-UX-025` | 2 | `T-ARG-017`, `UX-P2-03` | — |
| `REQ-UX-026` | 1 | `UX-P1-14`, `UX-P2-05`, `UX-P2-07` | — |
| `REQ-UX-027` | 1 | `SEC-22`, `UX-P1-09` | — |
| `REQ-UX-028` | 0 | `CPL-T13`, `UX-P3-03` | — |
| `REQ-UX-029` | 3 | `UX-P3-02` | — |
| `REQ-UX-030` | 2 | `UX-P2-04` | — |
| `REQ-UX-031` | 1 | `UX-P1-09`, `UX-P3-05` | — |
| `REQ-UX-032` | 2 | `UX-P2-04` | — |
| `REQ-UX-033` | 0 | `QA-T20`, `UX-P1-08`, `UX-P3-01` | — |
| `REQ-UX-034` | 0 | `UX-P0-02` | `maquettes-validees.spec.ts` |
| `REQ-UX-035` | 3 | `CPL-T15`, `UX-P3-04` | — |
| `REQ-UX-036` | 1 | `UX-P1-12` | — |
| `REQ-UX-037` | 1 | `UX-P1-13` | — |
| `REQ-UX-038` | 1 | `DM-13`, `UX-P1-10` | — |
| `REQ-UX-039` | 1 | `SEC-12`, `UX-P1-02`, `UX-P1-15` | — |

## Exigences absorbées — le texte en vigueur est celui de la survivante

| Exigence | Remplacée par | Tâches qui la citent encore |
| --- | --- | --- |
| `REQ-ARG-001` | `REQ-DM-016` | `DM-15`, `INT-T05` |
| `REQ-ARG-006` | `REQ-DM-015` | `DM-04`, `INT-T01b`, `T-ARG-035` |
| `REQ-ARG-009` | `REQ-DM-022` | `DM-15` |
| `REQ-ARG-011` | `REQ-DM-023` | `DM-16` |
| `REQ-ARG-030` | `REQ-DM-021` | `DM-15`, `INT-T01b`, `INT-T05`, `T-ARG-035` |
| `REQ-ARG-031` | `REQ-DM-014` | `DM-03-A`, `DM-03-P` |
| `REQ-GOV-005` | `REQ-QA-014` | `GOV-011`, `GOV-022` |
| `REQ-GOV-019` | `REQ-DM-014` | `DM-03-A` |
| `REQ-GOV-020` | `REQ-QA-007` | `INT-T01a` |
| `REQ-INT-002` | `REQ-SEC-010` | `INT-T02` |
| `REQ-INT-010` | `REQ-DM-036` | `SEC-06` |
| `REQ-INT-018` | `REQ-SEC-034` | `INT-T12`, `INT-T24` |
| `REQ-INT-028` | `REQ-DM-029` | — |
| `REQ-JUR-010` | `REQ-DM-031` | `DM-20` |
| `REQ-JUR-014` | `REQ-ARG-025` | `T-ARG-032` |
| `REQ-JUR-016` | `REQ-ARG-024` | `DM-19` |
| `REQ-JUR-017` | `REQ-ARG-018` | `JUR-T01c`, `T-ARG-016` |
| `REQ-JUR-018` | `REQ-ARG-016` | `DM-11`, `JUR-T16`, `T-ARG-032` |
| `REQ-JUR-019` | `REQ-DM-014` | `DM-03-A`, `DM-23`, `JUR-T29` |
| `REQ-JUR-021` | `REQ-ARG-012` | `DM-16`, `SEC-18` |
| `REQ-JUR-026` | `REQ-DM-024` | `DM-01` |
| `REQ-JUR-027` | `REQ-DM-038` | `DM-02`, `GOV-006` |
| `REQ-QA-008` | `REQ-SEC-010` | `INT-T01b`, `SEC-06` |
| `REQ-QA-009` | `REQ-ARG-003` | `QA-T27`, `SEC-06`, `T-ARG-022` |
| `REQ-QA-010` | `REQ-SEC-009` | `SEC-05` |
| `REQ-QA-011` | `REQ-SEC-008` | `QA-T07`, `SEC-05` |
| `REQ-QA-012` | `REQ-SEC-022` | `SEC-05`, `SEC-16` |
| `REQ-QA-031` | `REQ-UX-033` | `QA-T16`, `QA-T20`, `QA-T20b` |
| `REQ-QA-033` | `REQ-GOV-014` | `QA-T05` |
| `REQ-SEC-007` | `REQ-DM-012` | `SEC-11` |
| `REQ-SEC-011` | `REQ-DM-036` | `DM-15`, `SEC-06` |
| `REQ-SEC-015` | `REQ-DM-010` | `SEC-12` |
| `REQ-SEC-027` | `REQ-DM-024` | `DM-01`, `DM-20` |
| `REQ-UX-024` | `REQ-SEC-023` | `SEC-17`, `UX-P2-03`, `UX-P3-05` |

## Couverture des modules et des étapes

Les 21 modules et les 12 étapes de l’audit de bout en bout, tels que le registre les porte.

| Module | Exigences | Dont réputées testées |
| ---: | ---: | ---: |
| 1 | 13 | 1 |
| 2 | 3 | 0 |
| 3 | 1 | 0 |
| 4 | 15 | 0 |
| 5 | 15 | 1 |
| 6 | 1 | 0 |
| 7 | 1 | 0 |
| 8 | 13 | 0 |
| 9 | 36 | 4 |
| 10 | 6 | 0 |
| 11 | 5 | 0 |
| 12 | 13 | 0 |
| 13 | 32 | 1 |
| 14 | 13 | 0 |
| 15 | 23 | 2 |
| 16 | 8 | 0 |
| 17 | 15 | 1 |
| 18 | 3 | 0 |
| 19 | 1 | 0 |
| 20 | 3 | 0 |
| 21 | 11 | 0 |

| Étape | Exigences | Dont réputées testées |
| ---: | ---: | ---: |
| 1 | 3 | 0 |
| 2 | 12 | 0 |
| 3 | 1 | 0 |
| 4 | 16 | 0 |
| 5 | 17 | 1 |
| 6 | 2 | 0 |
| 7 | 52 | 3 |
| 8 | 12 | 0 |
| 9 | 23 | 4 |
| 10 | 63 | 4 |
| 11 | 30 | 2 |
| 12 | 14 | 0 |

## Fichiers de test

| Fichier | Exécuté par vitest | Exigences citées |
| --- | --- | --- |
| `tests/gov/charte-pr.spec.ts` | oui | `REQ-GOV-010`, `REQ-GOV-011`, `REQ-GOV-012`, `REQ-GOV-013`, `REQ-GOV-027` |
| `tests/unit/gouvernance/adr-assertion-existe.spec.ts` | oui | `REQ-GOV-009` |
| `tests/unit/gouvernance/adr-index-derive.spec.ts` | oui | `REQ-CPL-018`, `REQ-GOV-008` |
| `tests/unit/gouvernance/affirmations-verifiees.spec.ts` | oui | `REQ-GOV-004` |
| `tests/unit/gouvernance/attestation-inter-depot.spec.ts` | oui | `REQ-GOV-008`, `REQ-GOV-025`, `REQ-GOV-026` |
| `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts` | oui | `REQ-GOV-014` |
| `tests/unit/gouvernance/autonomie.spec.ts` | oui | `REQ-CPL-021` |
| `tests/unit/gouvernance/citation-json-vs-prose.spec.ts` | oui | `REQ-GOV-003` |
| `tests/unit/gouvernance/entite-registre.spec.ts` | oui | `REQ-CPL-001`, `REQ-CPL-002`, `REQ-CPL-003`, `REQ-CPL-004`, `REQ-CPL-017`, `REQ-CPL-018`, `REQ-GOV-031` |
| `tests/unit/gouvernance/fiches-agents.spec.ts` | oui | `REQ-GOV-010` |
| `tests/unit/gouvernance/fiches-tiers.spec.ts` | oui | `REQ-CPL-002`, `REQ-GOV-022` |
| `tests/unit/gouvernance/gardes-transposees.spec.ts` | oui | `REQ-GOV-018`, `REQ-GOV-029` |
| `tests/unit/gouvernance/gardes.spec.ts` | oui | `REQ-GOV-001`, `REQ-GOV-003`, `REQ-GOV-015`, `REQ-GOV-031` |
| `tests/unit/gouvernance/glossaire-enums.spec.ts` | oui | `REQ-DM-003`, `REQ-DM-038`, `REQ-GOV-016`, `REQ-JUR-027` |
| `tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts` | oui | `REQ-GOV-003` |
| `tests/unit/gouvernance/integration-livrable.spec.ts` | oui | — |
| `tests/unit/gouvernance/inventaire-prouve.spec.ts` | oui | `REQ-GOV-026` |
| `tests/unit/gouvernance/lexique.spec.ts` | oui | `REQ-GOV-017`, `REQ-JUR-037` |
| `tests/unit/gouvernance/lot-identifiant-unique.spec.ts` | oui | `REQ-GOV-033` |
| `tests/unit/gouvernance/paths-derives.spec.ts` | oui | `REQ-GOV-021`, `REQ-GOV-025` |
| `tests/unit/gouvernance/plan-state-frais.spec.ts` | oui | `REQ-GOV-006`, `REQ-GOV-023` |
| `tests/unit/gouvernance/poids-du-bundle-garde-vraiment.spec.ts` | oui | `REQ-GOV-028` |
| `tests/unit/gouvernance/preseance.spec.ts` | oui | `REQ-DM-034`, `REQ-GOV-002`, `REQ-GOV-030` |
| `tests/unit/gouvernance/registre-lecteur-unique.spec.ts` | oui | `REQ-GOV-015`, `REQ-GOV-021` |
| `tests/unit/gouvernance/regles-maison.spec.ts` | oui | `REQ-GOV-023`, `REQ-GOV-024` |
| `tests/unit/gouvernance/tout-check-est-cable.spec.ts` | oui | `REQ-GOV-014`, `REQ-QA-013` |
| `tests/unit/gouvernance/tracabilite.spec.ts` | oui | `REQ-GOV-005`, `REQ-QA-014` |
| `tests/unit/gouvernance/une-tache-un-owner.spec.ts` | oui | `REQ-GOV-007` |
| `tests/unit/gouvernance/verrou-de-phase.spec.ts` | oui | `REQ-GOV-027` |
| `tests/unit/gouvernance/vues-derivees.spec.ts` | oui | `REQ-GOV-021`, `REQ-GOV-032` |
| `tests/unit/integration/contrat-hash.spec.ts` | oui | `REQ-GOV-020`, `REQ-INT-003`, `REQ-INT-004`, `REQ-INT-029`, `REQ-QA-007` |
