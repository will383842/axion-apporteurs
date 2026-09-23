# PLAN-STATE — état vivant d'Axion Partners

> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les
> PR GitHub, et git. Ne jamais l'éditer à la main (`.claude/settings.json` l'interdit) : modifier l'issue.

## REPRENDRE EN 30 SECONDES

| Question | Réponse |
| --- | --- |
| Où est `main` ? | `e6b1df4` — 2026-09-23T01:47:47+02:00 |
| Qu’est-ce qui est en vol ? | 1. #92 (un contrôle requis rouge ou une revue manquante) · 2. #93 (un contrôle requis rouge ou une revue manquante) · 3. #102 (un contrôle requis rouge ou une revue manquante) · 4. #112 (un contrôle requis rouge ou une revue manquante) · 5. #82 (un conflit avec `main`) · 6. #88 (un conflit avec `main`) · 7. #91 (un conflit avec `main`) · 8. #99 (un conflit avec `main`) |
| Qui tient quoi ? | QA-T08 (A05) · QA-T07 (A05) |
| Où en est la phase ? | phase 0 — 20/101 tâches, reste 62.10 j |
| Le prochain pas | SEC-08 — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (chemin critique) |
| Ce qui bloque | 2 tâche(s) bloquée(s) ou en attente externe · 5 question(s) pour Will |
| Dernière entrée de journal | PR #109 — 2026-09-22 |

**Ce qu’on tape maintenant.** débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état. Avant d’écrire une ligne : `docs/REGLES-MAISON.md`, la fiche de rôle, la tâche, ses REQ.

## Phase courante : 0

20/101 tâches terminées · reste 62.10 j estimés.

## Tâches

| Statut | Nombre | Détail |
| --- | --- | --- |
| `proposee` | 0 | — |
| `a_faire` | 202 | JUR-T02, QA-T08, QA-T04, QA-T07, QA-T30, CPL-T22, SEC-08, QA-T05, QA-T11, QA-T06, QA-T12, QA-T13 … |
| `en_cours` | 0 | — |
| `bloquee` | 0 | — |
| `attente_externe` | 2 | JUR-T01b · JUR-T01c |
| `en_revue` | 0 | — |
| `fusionnee` | 59 | GOV-000, GOV-007, GOV-001, GOV-018, GOV-008, GOV-002, GOV-003, GOV-004, GOV-005, GOV-006, GOV-009, GOV-010 … |
| `deployee` | 0 | — |
| `verifiee` | 0 | — |

## Chemin critique

**20.75 j** sur 22 taches enchainees — duree PLANCHER du projet. Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.

~~GOV-000~~ (1 j, ph -1) → ~~GOV-007~~ (0.5 j, ph -1) → ~~GOV-012~~ (0.5 j, ph -1) → ~~GOV-013~~ (0.25 j, ph -1) → ~~GOV-014~~ (1 j, ph -1) → ~~QA-T01~~ (0.5 j, ph 0) → ~~DM-01~~ (1 j, ph 0) → ~~DM-02~~ (1.5 j, ph 0) → SEC-08 (1 j, ph 0) → SEC-03 (1 j, ph 0) → SEC-04 (1 j, ph 0) → SEC-17 (1 j, ph 0) → DM-11 (1.5 j, ph 1) → INT-T12 (1.5 j, ph 1) → JUR-T16 (0.5 j, ph 2) → T-ARG-015 (1 j, ph 2) → T-ARG-016 (1.5 j, ph 2) → T-ARG-017 (0.5 j, ph 2) → T-ARG-018 (1 j, ph 2) → T-ARG-019 (1 j, ph 2) → T-ARG-030 (1 j, ph 3) → T-ARG-033 (1 j, ph 3)

Reste sur ce chemin : **14.50 j**.

## Bloquées

- **JUR-T01b** — Contrat v1 arrêté par Will · attend will
- **JUR-T01c** — Mandat d'autofacturation validé — expert-comptable s'il y en a un, sinon décision de Will avec les défauts du registre · attend expert_comptable

## Questions ouvertes pour Will

- W9
- W6
- DEC-INT-002 — **bloquante (§1 du registre)**
- W12
- W11

## Hypothèses par défaut appliquées

47 décisions portent une hypothèse datée dans `docs/DECISIONS.md` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.

## File de fusion

| # | PR | Branche | Ce qui la bloque |
| --- | --- | --- | --- |
| 1 | #92 — feat(JUR-T01): gabarit de contrat v1 public, variables resolues et refus de publication | `t/jur-t01` | un contrôle requis rouge ou une revue manquante |
| 2 | #93 — feat(UX-P0-01): vocabulaire et micro-copie SSOT de l'espace, garde d'exhaustivite | `t/ux-p0-01` | un contrôle requis rouge ou une revue manquante |
| 3 | #102 — docs(GOV-063): ADR 0018 tranche l'homonymie, le nom gov:check est retire des deux cotes | `t/gov-check-homonymie` | un contrôle requis rouge ou une revue manquante |
| 4 | #112 — fix(GOV-092): une revision servie sans `diff` bloque la porte A, et les deux remedes nommes sont faux | `t/gov-092` | un contrôle requis rouge ou une revue manquante |
| 5 | #82 — feat(QA-T07): gate securite semgrep, regles maison vues rougir, image epinglee | `t/qa-t07` | un conflit avec `main` — à résoudre avant tout |
| 6 | #88 — feat(QA-T08): journal pino caviarde sur la ligne finale, Sentry filtre, notifieur | `t/qa-t08` | un conflit avec `main` — à résoudre avant tout |
| 7 | #91 — feat(INT-T09): mandataire recherche-entreprises — cache, limiteur, disjoncteur, repli, minimisation, fixtures | `t/int-t09` | un conflit avec `main` — à résoudre avant tout |
| 8 | #99 — feat(GOV-047): pnpm prevol existe enfin, derive du job gate-a et non de la chaine gov:check | `t/gov-047` | un conflit avec `main` — à résoudre avant tout |

Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.

## Revendications

Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.

| Tâche | Revendiquée par | Issue | Statut |
| --- | --- | --- | --- |
| QA-T08 — Logger pino structuré, redaction PII, Sentry, notify | A05 | #70 | `a_faire` |
| QA-T07 — Gate sécurité : semgrep | A05 | #69 | `a_faire` |

⚠️ **40 revendication(s) périmée(s)** — GOV-007, GOV-018, GOV-008, GOV-002, GOV-004, GOV-009, GOV-010, GOV-011, GOV-012, GOV-015, INT-T01a, GOV-017b, GOV-020, GOV-023, QA-T00, QA-T01, SEC-01, SEC-02, SEC-10, DM-01, DM-02, QA-T02, QA-T03, UX-P0-02, CPL-T13, GOV-035, GOV-036, GOV-037, GOV-039, GOV-030, GOV-031, GOV-041, GOV-043, GOV-044, GOV-056, GOV-059, GOV-077, GOV-089, GOV-088, GOV-091 : leur issue porte encore un label `owner:` alors que la tâche est livrée. `pnpm lot:cloture` écrit `docs/tasks.json` mais n’efface pas les labels ; la dette appartient à GOV-012.

## Décisions du jour

Aucun ADR daté du 2026-09-23 (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre `docs/DECISIONS.md`, tranchées ou tenues par une hypothèse datée.

## Prochain pas

**SEC-08** — Chiffrement PII avec AAD, hash de recherche, hash IP seul, garde de schéma (1 j, **sur le chemin critique**) : 42 tâche(s) éligible(s) en tout. `pnpm lot:composer` compose le lot.

## Dernier atterrissage

`origin/main` = `e6b1df4` (2026-09-23T01:47:47+02:00). Vérifier `x-partners-build-sha` avant toute nouvelle fusion.

Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.

## Journal

Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.

### PR #109 — 2026-09-22 — chore(GOV-091): l'entrée de journal de la PR 108 manquait — main était rouge sans elle

**Fait.** L'entrée de journal de la PR 108, absente à sa fusion, est écrite ici, dérivée du corps de
la PR et de son diff. `pnpm gov:etat` repasse d'un défaut (`pr_fusionnee_sans_journal`,
REQ-GOV-023) à neuf familles évaluées sur neuf, et les deux spécifications qui rougissaient pour
cette seule cause — `plan-state-frais.spec.ts` et `une-tache-un-owner.spec.ts` — redeviennent
vertes. Cette PR porte aussi sa PROPRE entrée : sans elle, sa fusion reproduirait le défaut qu'elle
répare.

**Reste.** Le défaut structurel n'est pas fermé ici, et il n'appartient pas au documentaliste :
`pr_fusionnee_sans_journal` ne peut pas rougir AVANT la fusion, son prédicat étant que la PR est
fusionnée. Aucune garde d'avant-fusion ne l'exige : `gov:pr` ne lit jamais `docs/journal/`, et la
seule mention du dossier dans son code est le contre-témoin qui grave ce choix. La seule victime
possible est donc `main`. GOV-052 porte ce remède au registre, et GOV-073 passe avant elle ou avec
elle, sous peine d'une cinquième grammaire d'entrée de journal. GOV-088 reste `a_faire` au registre
alors que sa PR est fusionnée : c'est la dette de clôture de lot, déjà connue.

**Appris.** Le rouge d'une garde qui interroge la forge n'appartient à aucune branche : les deux
spécifications rougissaient sur TOUTE branche sans qu'aucune n'ait changé une ligne, et un seul
fichier de documentation les rend vertes. Mesuré au passage : `pnpm gov:etat` sans `--now`
n'évalue que huit familles sur neuf et sort 0 en le DISANT — un vert local obtenu sans l'instant
est plus faible que celui de la porte A, qui le donne. Mesuré aussi, et c'est un coût qu'on paie
sans le voir : cette PR a d'abord cité la tâche HISTORIQUE qui déclare `docs/journal/`, laquelle
porte `sensible: [auth]` ; `gov:pr` classait alors deux fichiers de prose en « risque élevé, 4
lentilles exigées ». Versée en tâche dédiée à `sensible` vide, la même PR rend « risque ordinaire,
2 lentilles ». Le classificateur mesurait bien ce qu'il annonce : c'est la tâche empruntée qui
mentait sur la nature du geste, et le prix se payait en relectures pendant que `main` était rouge.

### PR #108 — 2026-09-22 — fix(GOV-088): le glossaire interdisait la colonne qu'il prescrit, et un .ts ne peut citer aucun terme interdit

**Fait.** `docs/GLOSSAIRE.md` interdisait en ligne 149 la forme qu'il prescrit en ligne 126 : la
colonne de la table de réception, dont le texte de REQ-DM-036 est repris mot pour mot. La règle
posée se dérive du registre au lieu de nommer un cas : un jeton que le registre attribue AUSSI à un
autre rôle ne peut pas porter un interdit sec — il devient un interdit sous condition, que la garde
n'exerce pas et qu'elle imprime. Trois jetons passent sous condition, et un est récupéré :
`subjectRef` était désarmé par un accident de ponctuation, le tiret cadratin qui suivait le dernier
jeton de la liste. Le compte des interdits exercés va donc de 37 à 35, pas à 34. Un témoin neuf,
`enveloppe_camelcase_hors_contrat`, entre au code ET au registre, les deux sens du refus mesurés :
30 témoins deviennent 31.

**Reste.** Un marqueur de citation pour les fichiers TypeScript a été essayé puis réfuté sur mesure :
le `//` d'une URL ouvre une zone de commentaire et amnistie la même instruction exécutée. La limite
est nommée au glossaire avec son propriétaire, GOV-069. REQ-DM-036 s'épelle elle-même avec un
synonyme interdit : le développeur de SEC-06 lira le mauvais nom dans sa propre exigence. Le §5 du
glossaire porte un avertissement périmé. Le champ `verifie` de `docs/gates.json` n'apparaît dans
aucune vue.

**Appris.** L'accident réparé l'est par l'INSTANCE, pas par la famille : un jeton ajouté en fin de
bloc et suivi d'une glose naîtra désarmé de la même façon. Et la face verte annoncée n'est pas la
ligne que SEC-06 écrira — la même ligne rougit sous la garde des énumérations, la colonne devra
être un enum.

### PR #107 — 2026-09-22 — fix(GOV-089): un numero PUBLIC se juge a son porteur, pas a son mot-cle — 452 defauts, 448 sur des tiers

**Fait.** `gov:entite` refusait un SIREN, un SIRET ou un numéro de TVA parce qu'il SUIT le mot
`siren` ou `siret`, sans jamais regarder DE QUI il s'agit : mesuré sur la branche qui enregistre les
fixtures de l'API publique d'entreprises, 452 défauts, dont 448 portaient sur des entreprises
TIERCES — DANONE, la SNCF, EDF, des communes — et 4 seulement sur les identifiants de l'entité ; la
garde réclamait donc une place dans `config/entite.json` pour le SIREN de DANONE. Le régime se lit
désormais sur le PORTEUR et non sur le mot-clé : un numéro public n'est refusé que s'il est le
nôtre, et la liste des nôtres est DÉRIVÉE de `config/entite.json` par une source unique que
`valeur_recopiee` et l'arme publique de `coordonnee_en_clair` lisent toutes les deux, de la même
façon, par contenance — un SIRET porte le SIREN de son entité. La cécité qui accompagne cette
dérivation est REFUSÉE et pas seulement rendue visible : la famille `aucune_reference_publique` est
une FAMILLE et non une levée, parce qu'un fait sur l'univers jugé passe par le canal de refus quand
une erreur de programmation, elle, lève ; et le compte imprimé dans chaque vert compte les
identifiants APPARIABLES, dérivés des formes elles-mêmes, jamais les entrées du registre. Mesure
finale sur le dépôt réel : 452 défauts ramenés à 4, aucun vrai défaut tu, `valeur_recopiee` active
jusque DANS une fixture.

**Reste.** `REQ-GOV-031` est TRONQUÉE dans sa source `docs/requirements.json` : elle annonce
« Trois catégories n'y entrent jamais : » et n'en nomme aucune, alors que trois gardes et dix
tâches — celle-ci comprise, que cette PR vient d'y rattacher — dérivent d'elle tout leur mandat ;
cela appartient à GOV-066, dont l'acceptance refuse déjà
qu'une exigence promette ce que la garde ne fait pas. Les 4 défauts restants — le SIREN et le SIRET
de l'entité en dur dans `tests/fixtures/recherche-entreprises/21-organisme-de-formation.json` — sont
justes et non corrigés ici : les fermer est un changement d'intention de test, pas un
rafraîchissement, et ce cas en cache un autre, `liste_id_organisme_formation` valant `null`, si bien
que le cas qui existe pour exercer ce champ ne l'exerce pas. Portée assumée et nommée plutôt que
tue : la classe « identifiant de tiers en fixture dans un dépôt PUBLIC » n'est plus couverte par
aucune famille, et sa protection repose désormais ENTIÈREMENT sur la pseudonymisation
d'`enregistrer-fixtures.ts`, qu'aucune garde de cette PR ni d'ailleurs ne tient — c'est un transfert
de protection, pas un détail, et il vaut d'être su de qui touchera ce script. Deux angles morts
pré-existants de la forme, mesurés
et désormais écrits dans la limite déclarée sans être fermés : la forme de TVA est sensible à la
CASSE, et un groupe de chiffres plus long que la fenêtre attendue n'ouvre aucune frontière de mot.
Enfin, `tests/unit/gouvernance/entite-registre.spec.ts` est dans les `paths` de GOV-040, GOV-067 et
GOV-089 : aucune des trois ne doit être composée dans le même lot qu'une autre, et l'acceptance de
GOV-089 ne nomme que GOV-067, donc elle est plus étroite que le fait.

**Appris.** DEUX TÉMOINS EXERÇAIENT LE MAUVAIS PORTEUR, et gravaient donc la sur-attrape en porte A :
le mode de preuve et le banc d'essai exigeaient un ROUGE sur le SIREN et la TVA d'un TIERS dans du
code, si bien que la garde avait bien été « vue rougir » au sens de RM-02 mais sur le mauvais cas,
et qu'elle a traversé une livraison, une revue à quatre lentilles et une fusion en tenant vert le
défaut même qu'on vient de corriger. Une garde vue rougir ne dit rien si on l'a vue rougir sur le
mauvais cas ; et quand un correctif oblige à INVERSER un témoin existant, c'est le signe que le
témoin, et pas seulement le code, portait la faute. Deux corollaires mesurés le même jour : la ligne
finale que le mode de preuve imprimait affirmait le comportement fautif, donc un vert qui commente
son propre comportement est une affirmation à maintenir comme du code — c'est la famille que
`gov:sonde` existe pour marquer ; et unifier la SOURCE de deux familles unifie aussi leur MODE DE
PANNE, si bien qu'un compteur destiné à rendre une cécité visible doit être ancré DANS LES DEUX SENS
par son témoin, ne pouvant être ni nul quand des numéros sont cherchés, ni non nul quand aucun ne
l'est — mutés l'un après l'autre, les deux ont d'abord survécu. Enfin, ce même défaut s'est rejoué
EN PROSE dans la première rédaction de cette entrée, et deux lentilles l'ont refusée pour cela : j'y
affirmais des dates de naissance en clair dans les fixtures, en jugeant sur le MOT-CLÉ — le champ
`date_de_naissance` existe — au lieu du PORTEUR, c'est-à-dire de la valeur. Elle est en réalité
tirée du MÊME HMAC que le nom, sous la MÊME clé aléatoire non conservée, deux lignes plus bas dans
le même retour d'objet ; mesuré sur les fixtures, 352 valeurs sur 352 dans la plage générée, aucune
réelle, et le script n'a qu'un seul commit — il n'a donc jamais existé d'état où la phrase était
vraie. Deux choses à en retenir. Une entrée de journal peut affirmer un fait sur du code qui n'est
PAS dans le diff de sa PR : elle est alors INVÉRIFIABLE par sa propre CI, et ce qu'elle avance doit
avoir été mesuré, jamais retenu de mémoire. Et dans un dépôt PUBLIC, sur un document qu'aucune garde
ne relit, une fausse MAUVAISE nouvelle est plus coûteuse qu'une omission : elle survit des mois et
elle décrédibilise la portée bien réelle énoncée dans la même phrase — un reste qu'on vérifie et
qu'on trouve faux est un reste qu'on cesse de lire.

… 38 entrée(s) plus ancienne(s) dans `docs/journal/`.

## Dette déclarée

Aucune tâche `proposee` en attente d'arbitrage.

