# Gates — Axion Partners

> ⚠️ **Ce fichier est une VUE. La source est `docs/gates.json`.**
> Livré par **QA-T00** (REQ-QA-013, règle maison RM-02), régénéré par
> `pnpm gov:gates-derivees --render` — tableaux ET totaux comptés à la génération, jamais tapés.
> Une correction écrite ici à la main disparaît au rendu suivant : elle se fait dans le registre
> pour les données, dans `scripts/gates/gates-derivees.ts` pour la prose.
>
> `gov:gates-derivees` apparie les deux sens : une ligne sans entrée de même `id` → rouge, une
> entrée sans ligne → rouge. La colonne « Alias » cite les autres noms sous lesquels la même gate
> est appelée ; un alias ne crée **jamais** une seconde ligne.
>
> La garde qui compte l'armement : `pnpm gates:prouvees --phase <n>`
> (`scripts/gates/gates-prouvees.ts`). Elle refuse toute gate de phase au plus n qui n'a pas un
> `id`, un `script` présent sur le disque **et lancé par un workflow**, une `fixtureRouge`, une
> `phase` entière et une `preuveRouge` qui référence un run.

## 1. Le compte par phase

| Phase | Ce qu'elle est | Gates | Prouvées | Restent à prouver |
| ----- | -------------- | ----: | -------: | ----------------: |
| -1 | Socle de gouvernance | 32 | 20 | 12 |
| 0 | Fondations, sécurité, charte | 43 | 1 | 42 |
| 1 | Parcours, attribution, intégrations | 21 | 0 | 21 |
| 2 | Argent et versements | 11 | 0 | 11 |
| 3 | Clôture et obligations annuelles | 3 | 0 | 3 |
| **Total** | | **110** | **21** | **89** |

La phase d'une gate est celle **à la sortie de laquelle** elle doit exister, être bloquante et
avoir rougi. Une gate sans phase entière n'entre dans le périmètre d'aucune sortie :
`gates:prouvees` la refuse quel que soit `--phase`.

## 2. Les gates armées

Ce sont les seules dont on a la trace d'un échec provoqué. La colonne « Preuve rouge » est le
champ `preuveRouge` du registre, recopié verbatim par le rendu.

### Phase -1 — armées (20)

| Gate | Tâche | Script | Alias | Preuve rouge |
| ---- | ----- | ------ | ----- | ------------ |
| `req:check` | GOV-011 | `scripts/gates/gov-trace.ts` | `gov:trace` | pnpm gov:trace --prove — 10 familles, un temoin chacune, 8 contre-temoins verts ; et `pnpm gov:trace` sur la branche lot/L-1-03-integration le 2026-09-04, 16 ruptures nommees (7 req_sans_test, 3 test_promis_absent, 6 req_non_citee_par_son_test) |
| `gov:identifiants` | GOV-003 | `scripts/gates/gov-identifiants.ts` | — | pnpm gov:identifiants:prove — 3 temoins rouges, 10 contre-temoins verts ; et, depuis GOV-025, 10 temoins de POSITION rougissent — dont 5 que l'ancienne lookahead MANQUAIT — pendant que 27 contre-temoins de position restent verts, les 13 lignes de la §0 du registre des decisions comprises, et les renvois POINTES que GOV-025 a du rendre a nouveau verts ; et, depuis GOV-028, 9 temoins de DELIMITEUR rougissent — dont ceux que la neutralisation d'avant CACHAIT sous 120 caracteres et voyait au-dela, ce qui faisait dependre le verdict de la LONGUEUR du voisinage — pendant que 8 contre-temoins de syntaxe restent verts, que 2 temoins d'apostrophe que la fausse paire de quotes cachait a l'inverse rougissent, et que 2 exemptions nommees sont exercees DES DEUX COTES ; `pnpm gov:identifiants:compter` rejoue les trois comptes globaux |
| `gov:adr` | GOV-009 | `scripts/gates/gov-adr.ts` | — | 16 familles, un temoin chacune, 11 contre-temoins verts (pnpm gov:adr --prove) |
| `gov:tasks` | GOV-017a | `scripts/gates/gov-tasks.ts` | — | pnpm gov:tasks:prove — 12 familles, chacune vue rougir sur son propre defaut injecte, 2 contre-temoins verts sur les deux formes de branche (partners/ADR-0007) ; et, depuis GOV-024, le mode --verifie-rendu vu rougir en famille vue_perimee sur une vue perime d'une seule tache livree, vu rougir en vue_absente sur une vue manquante, et vu rester vert sur le depot a jour |
| `gov:pr` | GOV-007 | `scripts/gates/gov-pr.ts` | — | 16 familles, un temoin chacune, 6 contre-temoins verts dont celui de la scission dod (pnpm gov:pr --prove) |
| `gov:depot-visibilite` | GOV-012 | `scripts/gates/gov-depot.ts` | — | pnpm gov:depot-visibilite:prove — 9 familles, chacune vue rougir sur son propre defaut injecte, 5 etapes de workflow legitimes en contre-temoins |
| `gov:autonomie` | GOV-000 | `scripts/gates/gov-autonomie.ts` | — | pnpm gov:autonomie:prove — 4 familles (deny_manquant, hook_non_declare, hook_sans_analyse, commande_laissee_passer), un temoin chacune, 17 commandes dangereuses refusees et 12 legitimes acceptees en contre-temoins — dont `gh api -X DELETE .../branches/main/protection` et `gh issue edit --remove-label owner:A01`, les deux trous trouves le 2026-09-04 |
| `gov:sonde` | GOV-004 | `scripts/gates/gov-sonde.ts` | — | 11 familles, un temoin chacune, 5 contre-temoins verts (pnpm gov:sonde --prove) |
| `gov:hypotheses` | GOV-005 | `scripts/gates/gov-hypotheses.ts` | `HYP-*` | pnpm gov:hypotheses:prove — 10 familles vues rougir sur une fixture minimale |
| `gov:agents` | GOV-023 | `scripts/gates/gov-agents.ts` | — | pnpm gov:agents:prove — 14 familles vues rougir sur leur temoin, 7 contre-temoins verts |
| `gov:entite` | CPL-T01 | `scripts/gates/gov-entite.ts` | — | pnpm gov:entite:prove — 11 familles, un temoin chacune sur un univers INJECTE, dont secret_commite (un IBAN commite dans un fichier suivi) et valeur_recopiee (un SIREN du registre recopie ailleurs) ; 7 contre-temoins restent verts, dont l'univers conforme |
| `gates:prouvees` | QA-T00 | `scripts/gates/gates-prouvees.ts` | — | 10 familles, un temoin chacune, 8 contre-temoins verts, 5 temoins de forme (pnpm gates:prouvees:prove) |
| `partners:contrat:hash` | INT-T01a | `tests/unit/integration/contrat-hash.spec.ts` | — | renommage de `occurred_at` en `occurredAt` dans packages/contracts/enveloppe.ts, 2026-09-03 : 4 cas sur 9 rouges + `contracts:export --verifier` rouge sur les 3 artefacts |
| `GATE-JUR-TEXTES-APPORTEURS` | GOV-013 | `scripts/gates/lexique-apporteurs.ts` | `GATE-UX-JARGON`, `gov:lexique` | pnpm gov:lexique:prove — 11 familles rougissent chacune sur son temoin, 8 positions limites rougissent, 4 controles positifs rougissent, 13 contre-temoins restent verts, dont la phrase de partners/ADR-0009 « valeurs du monde reel » verbatim |
| `gov:publication` | GOV-000 | `scripts/gates/gov-publication.ts` | — | pnpm gov:publication:prove — 7 familles vues rougir, 5 contre-temoins vus rester verts |
| `gov:requirements` | GOV-001 | `scripts/gates/gov-requirements.ts` | — | pnpm gov:requirements:prove — 11 familles, chacune vue rougir sur son defaut injecte ; et, depuis GOV-024, le mode --verifie-rendu vu rougir en famille vue_perimee sur une vue perime d'UNE exigence, l'ecart nomme « 353 pour 354 », et vu rester vert sur le depot a jour |
| `gov:preseance` | GOV-002 | `scripts/gates/gov-preseance.ts` | — | 7 familles, un temoin chacune, 8 contre-temoins verts (pnpm gov:preseance --prove) |
| `gov:inventaire` | GOV-020 | `scripts/gates/gov-inventaire.ts` | — | pnpm gov:inventaire:prove — 7 familles, chacune vue rougir sur son propre defaut injecte, 6 contre-temoins verts. Rouge reel constate sur le fichier : « docs/INVENTAIRE-CHANTIERS.md:79 — le chantier « C5 » porte l'etat « code » alors que ce depot ne dit pas ce que l'etiquette DESIGNE » |
| `gov:lecons` | GOV-018 | `scripts/gates/gov-lecons.ts` | — | pnpm gov:lecons --prove — 12 familles, 13 temoins (consolidation_perimee en a deux, un par source), 9 contre-temoins verts |
| `gov:etat` | GOV-008 | `scripts/gates/gov-etat.ts` | — | pnpm gov:etat:prove — 9 familles, un temoin chacune, 8 contre-temoins verts ; plus 6 scenarios joues contre la garde reelle via un gh compromis |

### Phase 0 — armées (1)

| Gate | Tâche | Script | Alias | Preuve rouge |
| ---- | ----- | ------ | ----- | ------------ |
| `partners:schema:enums` | DM-02 | `scripts/gates/schema-enums.ts` | `GATE-JUR-ENUMS`, `GATE-ARG-enum`, `gov:glossaire` | pnpm partners:schema:enums:prove — 8 familles rougissent chacune sur son temoin, 6 contre-temoins restent verts ; la vue est INJECTEE et non lue sur le disque (RM-11), sans quoi la preuve mesurerait le depot du jour au lieu de la garde |

## 3. Ce qui reste à prouver

Aucune de ces **89** entrées ne porte de `preuveRouge` : personne ne les a vues rougir.
Le périmètre d'un appel est celui de SA phase : `pnpm gates:prouvees --phase -1` ne juge que les
gates de phase -1, `--phase 0` y ajoute celles de phase 0, et ainsi de suite. Le compte des manques
n'est pas recopié ici : il se lit dans la sortie de la commande, famille par famille, et il change à
chaque script écrit — un nombre recopié serait faux le lendemain. Ce qui, en revanche, ne bouge pas :
les quatre familles du script — `script_manquant`, `script_introuvable`, `ancre_introuvable`,
`script_non_cable` — s'excluent l'une l'autre, et `preuve_rouge_absente` exclut
`preuve_rouge_non_referencee`. Sur le seul ARMEMENT, une gate ne peut donc être nommée que dans
trois familles : une du script, `fixture_rouge_vide`, et une de la preuve. Les familles
d'identité — `id_manquant`, `id_double` — s'y AJOUTENT : elles sont jugées sur tout le registre,
dans une passe séparée, et se cumulent avec les précédentes. Une même gate peut donc être nommée
dans quatre familles au plus. Ce paragraphe décrit le code ; aucune garde ne l’apparie — la
sortie de la commande, elle, fait foi.

### Phase -1 — socle de gouvernance (12)

| Gate | Tâche | Script | Alias |
| ---- | ----- | ------ | ----- |
| `gov:check` | GOV-000 | `scripts/gates/gov-check.ts` | — |
| `gov:plan-state` | GOV-008 | `tests/unit/gouvernance/plan-state-frais.spec.ts` | — |
| `aucun-workflow-ne-pousse-sur-main` | GOV-012 | `tests/unit/gouvernance/aucun-workflow-ne-pousse-sur-main.spec.ts` | — |
| `tout-check-est-cable` | GOV-012 | `tests/unit/gouvernance/tout-check-est-cable.spec.ts` | — |
| `gov:gates-derivees` | QA-T00 | `scripts/gates/gates-derivees.ts` | — |
| `GATE-JUR-SEUILS-SSOT` | JUR-T02 | `scripts/gates/seuils-ssot.ts` | `ssot:seuils` |
| `detectPii` | INT-T01a | `scripts/gates/detect-pii.ts` | — |
| `gov:contrat` | INT-T01a | `scripts/gates/contrat-epingle.ts` | — |
| `gate-a` | GOV-000 | `.github/workflows/ci.yml#gate-a` | — |
| `gate-deploiement` | GOV-000 | `scripts/gates/deploy-verify.ts` | — |
| `notify-sink-hors-prod` | GOV-000 | `scripts/gates/hook-env.js` | — |
| `gov:derivation` | GOV-014 | `scripts/gates/gov-derivation.ts` | — |

### Phase 0 — fondations, sécurité, charte (42)

| Gate | Tâche | Script | Alias |
| ---- | ----- | ------ | ----- |
| `partners:schema:cents` | DM-02 | `scripts/gates/schema-cents.ts` | — |
| `partners:migrations:additive` | QA-T11 | `scripts/gates/migrations-additive.ts` | — |
| `G-SEC-SCHEMA-PII` | SEC-08 | `scripts/gates/schema-pii.ts` | — |
| `partners:journal:immutable` | DM-01 | `tests/integration/journal.spec.ts` | `G-SEC-AUDIT`, `GATE-JUR-JOURNAL-IMMUABLE`, `GATE-ARG-immutabilite` |
| `journal:sans-pii` | DM-01 | `scripts/gates/journal-sans-pii.ts` | — |
| `aucun-annee-de-naissance` | INT-T09 | `scripts/gates/aucun-annee-de-naissance.ts` | — |
| `partners:money:conservation` | DM-04 | `tests/domain/conservation.spec.ts` | `GATE-ARG-prorata` |
| `partners:grille:check` | DM-03-A | `scripts/gates/grille-check.ts` | `GATE-ARG-derivation-grille`, `GATE-JUR-GRILLE-DERIVEE`, `GATE-UX-GRILLE` |
| `idor:check` | SEC-05 | `tests/security/idor.spec.ts` | `G-SEC-IDOR`, `GATE-UX-CLOISONNEMENT` |
| `G-SEC-AST-PRISMA` | QA-T07 | `scripts/gates/ast-prisma.ts` | — |
| `G-SEC-RATE-FAMILLE` | SEC-10 | `scripts/gates/rate-famille.ts` | — |
| `G-SEC-REVOCATION` | SEC-04 | `tests/security/revocation.spec.ts` | — |
| `G-SEC-ROLES` | SEC-17 | `scripts/gates/roles.ts` | `GATE-UX-ROLES` |
| `G-SEC-HEADERS` | SEC-02 | `tests/security/headers.spec.ts` | — |
| `G-SEC-ENV` | SEC-01 | `scripts/gates/env-boot.spec.ts` | — |
| `G-SEC-CI-BLOQUANTE` | QA-T01 | `tests/unit/ci/aucune-gate-en-continue-on-error.spec.ts` | — |
| `cliquet-ecrivains` | INT-T03 | `scripts/gates/cliquet-ecrivains.ts` | — |
| `inertie` | INT-T02 | `scripts/gates/inertie.ts` | — |
| `harnais-mcp` | INT-T11 | `scripts/gates/harnais-mcp.ts` | — |
| `api-gouv-degrade` | INT-T09 | `tests/integration/api-gouv.spec.ts` | — |
| `email-emetteur` | INT-T10 | `tests/unit/email/emetteur.spec.ts` | — |
| `jur:aucun-agregat-reseau` | JUR-T26 | `scripts/gates/jur-aucun-agregat-reseau.ts` | — |
| `jur:aucune-progression` | JUR-T26 | `scripts/gates/jur-aucune-progression.ts` | — |
| `jur:revue-apporteur-facing` | JUR-T26 | `scripts/gates/jur-revue-apporteur-facing.ts` | — |
| `jur:copy-indicative` | JUR-T29 | `scripts/gates/jur-copy-indicative.ts` | — |
| `jur:grille-chiffree` | JUR-T01 | `scripts/gates/jur-grille-chiffree.ts` | — |
| `GATE-JUR-VOCAB-PUBLIC` | JUR-T03 | `scripts/gates/vocab-public.ts` | — |
| `GATE-JUR-CONTRAT-COMPLET` | JUR-T01 | `tests/unit/contrat/contract-template-complete.spec.ts` | — |
| `GATE-UX-A11Y` | UX-P0-03 | `tests/a11y/axe.spec.ts` | — |
| `GATE-UX-CIBLES` | UX-P0-03 | `tests/a11y/cibles.spec.ts` | — |
| `GATE-UX-REFLOW` | UX-P0-03 | `tests/a11y/reflow.spec.ts` | — |
| `perf:bundle` | QA-T20 | `scripts/gates/bundle-par-route.ts` | `GATE-UX-BUNDLE` |
| `maquettes-validees` | UX-P0-02 | `scripts/gates/maquettes-validees.ts` | — |
| `gate-sec` | QA-T07 | `.github/workflows/ci.yml#gate-sec` | — |
| `gate-b` | QA-T02 | `.github/workflows/ci.yml#gate-b` | — |
| `gate-c` | QA-T05 | `scripts/gates/gate-c.sh` | — |
| `gate-d` | QA-T11 | `scripts/gates/gate-d.sh` | — |
| `mutation` | QA-T30 | `scripts/gates/stryker.sh` | — |
| `gate-nightly` | QA-T00 | `.github/workflows/nightly.yml` | — |
| `red-first` | CPL-T22 | `.github/workflows/red-first.yml` | — |
| `fixtures:source` | INT-T01a | `scripts/gates/fixtures-source.ts` | — |
| `jur:lexique-social` | JUR-T26 | `scripts/gates/jur-lexique-social.ts` | — |

### Phase 1 — parcours, attribution, intégrations (21)

| Gate | Tâche | Script | Alias |
| ---- | ----- | ------ | ----- |
| `partners:schema:partial-index` | DM-07 | `tests/integration/index-partiel.spec.ts` | — |
| `partners:transitions:exhaustive` | DM-08 | `tests/domain/transitions.spec.ts` | — |
| `GATE-UX-EXHAUSTIVITE` | UX-P0-01 | `scripts/gates/ux-exhaustivite.ts` | — |
| `GATE-JUR-PURGE` | DM-13 | `tests/integration/purge.spec.ts` | `G-SEC-RGPD-PURGE` |
| `partners:webhook:idempotent` | SEC-06 | `tests/integration/webhook.spec.ts` | `GATE-ARG-idempotence` |
| `partners:grille:complete` | UX-P1-14 | `scripts/gates/grille-complete.ts` | — |
| `G-SEC-CONCURRENCE` | SEC-12 | `tests/integration/concurrence.spec.ts` | — |
| `G-SEC-WEBHOOK` | SEC-06 | `tests/security/webhook-signature.spec.ts` | — |
| `G-SEC-ORACLE` | SEC-16 | `tests/security/oracle.spec.ts` | `GATE-JUR-VERIFIER-BINAIRE` |
| `G-SEC-NOTIF` | INT-T14 | `tests/security/notif-sans-pii.spec.ts` | — |
| `docuseal-strict` | INT-T12 | `tests/integration/docuseal.spec.ts` | — |
| `webhook-4-verdicts` | SEC-06 | `tests/integration/webhook-verdicts.spec.ts` | — |
| `frontiere` | SEC-07 | `tests/integration/frontiere.spec.ts` | — |
| `sante` | QA-T19 | `scripts/gates/sante.ts` | — |
| `reconciliation-quotidienne` | INT-T08-A | `tests/integration/reconciliation.spec.ts` | — |
| `jur:suspension-motifs-fermes` | JUR-T24 | `tests/domain/suspension-motifs.spec.ts` | — |
| `GATE-JUR-SIGNATURE-AVANT-DEPOT` | INT-T12 | `tests/integration/signature-avant-depot.spec.ts` | — |
| `GATE-JUR-ACTEUR-HUMAIN` | SEC-19 | `tests/domain/acteur-humain.spec.ts` | — |
| `GATE-UX-ETATS-VIDES` | UX-P1-08 | `tests/ux/etats-vides.spec.ts` | — |
| `GATE-UX-HORS-LIGNE` | UX-P1-03 | `tests/ux/hors-ligne.spec.ts` | — |
| `spec-espace-mobile` | QA-T16 | `tests/unit/ci/spec-espace-mobile.spec.ts` | — |

### Phase 2 — argent et versements (11)

| Gate | Tâche | Script | Alias |
| ---- | ----- | ------ | ----- |
| `partners:grille:contrat` | T-ARG-037 | `tests/domain/grille-du-contrat.spec.ts` | — |
| `argent:contre-calcul` | T-ARG-036 | `tests/argent/contre-calcul.spec.ts` | — |
| `GATE-ARG-rejeu-golden` | T-ARG-022 | `tests/argent/rejeu-golden.spec.ts` | — |
| `GATE-ARG-double-paiement` | T-ARG-015 | `tests/argent/double-paiement.spec.ts` | — |
| `GATE-ARG-sepa-xsd` | T-ARG-018 | `tests/argent/sepa-xsd.spec.ts` | — |
| `GATE-ARG-echec-ferme` | JUR-T16 | `tests/argent/controles-versement.spec.ts` | `GATE-JUR-VERSEMENT-ECHEC-FERME` |
| `GATE-ARG-non-silence` | DM-15 | `tests/argent/non-silence.spec.ts` | — |
| `GATE-ARG-tva-snapshot` | T-ARG-016 | `tests/argent/tva-snapshot.spec.ts` | — |
| `GATE-JUR-FAIT-GENERATEUR` | DM-15 | `tests/domain/fait-generateur.spec.ts` | — |
| `GATE-ARG-cloisonnement` | INT-T17 | `tests/security/cloisonnement-documents.spec.ts` | — |
| `mois-a-blanc` | CPL-T11 | `scripts/gates/mois-a-blanc.ts` | — |

### Phase 3 — clôture et obligations annuelles (3)

| Gate | Tâche | Script | Alias |
| ---- | ----- | ------ | ----- |
| `partners:rgpd:export-complet` | DM-20 | `tests/integration/rgpd-export.spec.ts` | — |
| `GATE-ARG-das2-seuil` | DM-19 | `tests/argent/das2.spec.ts` | — |
| `lexique-financement-ressources` | UX-P3-02 | `scripts/gates/lexique-financement-ressources.ts` | — |

## 4. Comment on arme une gate

Trois gestes, dans cet ordre, et le dernier ne se saute pas :

1. **Écrire le script** au chemin exact que porte le registre, **et le câbler dans un workflow**.
   Un chemin qui ne résout pas est un manque (`script_introuvable`) ; un script que rien ne lance
   en est un autre (`script_non_cable`) ; `fichier#job` exige en plus que le job existe.
2. **Injecter la `fixtureRouge`** du registre et faire tourner la gate. Si elle reste verte, elle ne
   mesure pas sa cible : on corrige la gate, pas la fixture.
3. **Archiver le rouge** — message verbatim dans le bloc ROUGE/VERT de la PR (REQ-GOV-013), puis la
   référence dans le champ `preuveRouge` de `docs/gates.json` : l'URL du run, ou
   `pnpm <garde>:prove — <ce qui a été vu rougir>`. Un « TODO » y est refusé. Enfin,
   `pnpm gov:gates-derivees --render` pour que cette vue suive.

Une garde livrée avec un mode `--prove` cite ce mode comme preuve : c'est le patron des gates du
§2, où chaque famille de contrôle a son témoin vu rougir et ses contre-témoins vus rester verts.

## 5. Ce que cette vue ne dit pas

- **Si une gate est verte aujourd'hui.** Elle dit qu'une gate est armée, pas qu'elle passe : c'est
  la CI qui le dit.
- **Si le check est bloquant.** `gates:prouvees` voit qu'un workflow lance le script ; elle ne voit
  ni les checks requis de la branche, ni un `continue-on-error` qui neutraliserait le job. C'est
  `G-SEC-CI-BLOQUANTE` (QA-T01) qui refuse le second, et `tout-check-est-cable` (GOV-012) qui tient
  le premier.
- **Si la `fixtureRouge` rougit ENCORE.** Le registre décrit « une fixtureRouge qui rougit encore,
  rejouée en nightly par `prove.sh` ». Cette vue et `gates:prouvees` vérifient qu'une fixture est
  **nommée**, jamais qu'elle rougit toujours : une gate dont la cible a dérivé reste ici « armée ».
  Le rejeu — injecter la fixture, attendre un rouge, en nightly — n'est PAS livré par QA-T00. Il est
  nommé dans l'en-tête de `.github/workflows/nightly.yml`, avec les huit autres contrôles que le
  registre attribue à `gate-nightly` et qui n'existent pas encore : c'est là qu'il a une adresse,
  au lieu de disparaître entre le titre de la tâche et le livrable.
- **La prose de ce fichier.** Les tableaux sont appariés au registre ; les paragraphes, non. Ils
  vivent dans `scripts/gates/gates-derivees.ts` et se corrigent là.

