# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## Phase courante : -1

12/26 tâches terminées · reste 7.00 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `a_faire` | 182 | GOV-018, GOV-008, GOV-006, GOV-010, GOV-011, GOV-012, GOV-013, GOV-014, INT-T01a, INT-T01b, GOV-019, GOV-020 … |
| `en_cours` | 0 | — |
| `en_revue` | 0 | — |
| `fusionnee` | 12 | GOV-000, GOV-007, GOV-001, GOV-002, GOV-003, GOV-004, GOV-005, GOV-009, GOV-015, GOV-017a, GOV-017b, QA-T00 |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 3 | CPL-T01 · JUR-T01b · JUR-T01c |

## Chemin critique

**19.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → GOV-012 (0.5 j, ph -1) → GOV-013 (0.25 j, ph -1) → GOV-014 (1 j, ph -1) → QA-T01 (0.5 j, ph 0) → DM-01 (1 j, ph 0) → DM-02 (0.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **18.25 j**.

## Bloquées

- **CPL-T01** — Décisions sans valeur par défaut à trancher par Will : W1 entité contractante, W9 prolongation de fenêtre si devis en cours · attend will
- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

- W1
- W11
- W2
- W3
- W4
- W5
- W6
- W9
- externe:will

## Hypothèses par défaut appliquées

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## PR ouvertes

- #27 `lot/L-1-01-cloture` — BLOCKED

## Dernier atterrissage

`origin/main` = `9272c04` (2026-09-03T21:44:51+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

