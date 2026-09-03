# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.
>
> **Ceci est le gabarit v0**, écrit avant la première exécution. Le premier `plan-state:build` l'écrase.
> Ses chiffres sont ceux mesurés dans `TASKS.md` et `DECISIONS.md` au 2026-09-03 (vérification mécanique).

## Phase courante : −1 (Gouvernance)

0/27 tâches terminées · 27 à faire · ~17 j estimés.
Le dépôt `axion-partners` **n'existe pas encore** : la toute première tâche est **GOV-000**, qui le crée,
pose la CI minimale, l'outillage de lot et déplace ce dossier. Voir la section « 0. Amorçage » de
`.claude/skills/lot/SKILL.md`.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `a_faire` | 27 | GOV-000, GOV-007, GOV-001, JUR-T02, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010, GOV-011, GOV-012, GOV-013, GOV-014, GOV-015, GOV-017a, GOV-017b, GOV-019, GOV-020, GOV-023, QA-T00, INT-T01a, INT-T01b, CPL-T01 |
| `en_cours` | 0 | — |
| `en_revue` | 0 | — |
| `fusionnee` | 0 | — |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 1 | JUR-T01c — mandat d'autofacturation (expert-comptable **ou**, à défaut, décision de Will avec les défauts du registre) |

> Total du backlog : **179 tâches** réparties en 5 phases (−1 : 27 · 0 : 49 · 1 : 57 · 2 : 38 · 3 : 21 au
> dernier comptage mécanique), pour **≈ 144,75 j**.

## Bloquées

Aucune tâche `bloquee`.

**JUR-T01c** est en `attente_externe` : elle attend l'avis d'un expert-comptable sur le mandat
d'autofacturation. Si Axion-IA n'en a pas, elle bascule en décision de Will et prend les défauts du
registre — elle ne bloque alors plus rien.

> 🔴 **Il n'y a pas d'avocat sur ce projet** (décision de Will, 2026-09-03). Aucune tâche n'attend une
> relecture juridique ; `externe: "avocat"` n'existe pas dans le schéma. La décision **W11** (Will arrête
> le contrat v1) remplace ce qui était une relecture externe.

## Questions ouvertes pour Will

Six décisions sans valeur par défaut possible (`docs/DECISIONS.md` §1) :

| # | Décision | Bloque |
| --- | --- | --- |
| **W1** | L'entité qui signe et qui paie (SAS ou OÜ) — SIREN et IBAN débiteur | Sortie de phase −1 · tout le volet contractuel et fiscal |
| **W3** | Domaine servi (DNS/WAF) et domaine d'envoi des e-mails | Sortie de phase −1 |
| **W4** | Têtes de réseau : personne physique, ou `Structure` + `Utilisateur` | Sortie de phase −1 · schéma v1 (DM-22) |
| **W9** | Prolongation de 3 mois de la fenêtre si un devis est en cours au terme — type **avenant** | Premier envoi DocuSeal |
| **W11** | Arrêter le contrat v1 (le gabarit est écrit : `CONTRAT-APPORTEUR-V1.md`) | Premier envoi DocuSeal |
| **EXT-2a** | Autofacturation, seuil DAS2, TVA — expert-comptable **ou** Will | Armement du SEPA (phase 2) |

Six questions ouvertes, plafond dix : l'autopilote peut avancer.

> ✅ **Déjà tranchées** : W6 (quatre familles commissionnées, 30 paliers) · W10 (extraction de CV = aide à
> la lecture, drapeau fermé) · W12 (la grille peut descendre sous la grille publiée, la page publique passe
> en formulation indicative).

## Hypothèses par défaut appliquées

**43 décisions** portent une hypothèse datée dans `docs/DECISIONS.md` §2, avec leur réversibilité.

⚠️ **Neuf** d'entre elles sont de réversibilité **`avenant`** : elles touchent le contrat signé et se
tranchent **avant le premier envoi DocuSeal**, pas quand leur phase arrive. Une modification ultérieure
impose une campagne de re-signature à tout le réseau (contrat art. 13).

## PR ouvertes

Aucune.

## Dernier atterrissage

Le dépôt n'existe pas encore : c'est l'objet de **GOV-000**, la première tâche. Une fois le dépôt créé,
cette section porte le sha de `origin/main` et la date du dernier `x-partners-build-sha` vérifié.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

## Dernière critique de complétude

**2026-09-03** — Deux passes de vérification adversariale (6 juges, puis 6 vérificateurs) ont produit
**96 corrections consolidées**, appliquées par 7 agents et vérifiées mécaniquement : 179 tâches, 341
exigences uniques, 102 gates dans `gates.json` en correspondance 1:1 avec `GATES.md`, contrat à 23 articles
et 22 identifiants `CL-*`, annexe 1 à 30 paliers.

Les artefacts d'outillage (34 fichiers) sont prêts dans `docs/partners/artefacts/` et n'attendent que le
déplacement par GOV-000.
