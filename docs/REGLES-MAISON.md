# Règles maison — Axion Partners

> Livré par **GOV-018** (REQ-GOV-024), étendu par **GOV-026**. Neuf règles héritées d'axionia et d'axion-ops, plus trois
> que le plan directeur cite sans les numéroter, plus une treizième née de la revue qui a retiré le `CLAUDE.md` racine
> de la PR #30 : elle n'existait que dans ce fichier d'amorçage, et elle a disparu avec lui — plus une
> quatorzième consolidée le 2026-09-05 par le `documentaliste` (A03), sur demande de l'intégration du
> lot `L-1-INT-a`, après deux rencontres du même piège le même jour par deux agents qui ne se parlaient pas. Chaque règle porte un
> numéro `RM-nn` ; les ADR et le gabarit de PR (« Règle maison
> appliquée : RM-nn ») y renvoient par numéro, jamais par paraphrase. Test : `tests/unit/gouvernance/regles-maison.spec.ts`
> (chaque RM a une section ; les neuf règles que REQ-GOV-024 énumère sont chacune couvertes).
>
> Ordre de lecture d'une session d'agent (REQ-GOV-023) : `docs/PLAN-STATE.md` → **ce fichier** → la fiche de rôle →
> la tâche → ses REQ. Un agent qui n'a pas lu ce fichier ne prend pas de tâche.

| RM    | Règle                                                   | Gate qui la vérifie                                    |
| ----- | ------------------------------------------------------- | ------------------------------------------------------ |
| RM-01 | Dériver, jamais recopier                                | `gov:derivation`, `partners:grille:check`, `contracts:hash` |
| RM-02 | Une garde ne vaut que si on l'a vue rougir              | `red-first`, `gates:prouvees`, bloc ROUGE/VERT de la PR |
| RM-03 | Fixtures depuis le producteur réel                      | `fixtures:source` (`Source:` obligatoire)               |
| RM-04 | Une colonne de vocabulaire est un enum                  | `schema:enums`, `glossaire-enums.spec.ts`               |
| RM-05 | Masquage qui échoue ouvert · droit par rôle, défaut = refus | `idor:check`, `requireRole` en garde AST             |
| RM-06 | Index unique partiel dérivé de la constante d'états     | `pg_indexes` test, `gov:check` (liste littérale interdite) |
| RM-07 | Chercher les appelants avant d'extraire                 | revue lentille « simplicité & dérivation »              |
| RM-08 | Une valeur qu'un tiers doit accepter se confronte à sa doc | `fixtures:source` vers `docs/tiers/<nom>.md`         |
| RM-09 | Une fusion à la fois, l'atterrissage vérifié            | `deploy:verify`, `aucun-workflow-ne-pousse-sur-main`    |
| RM-10 | Un seuil, une source, une date — aucun littéral         | `ssot:seuils` (JUR-T02)                                 |
| RM-11 | Aucun défaut sur ce que le test fait varier             | revue lentille « exactitude », `verificateur-rouge`     |
| RM-12 | Un identifiant nu n'est pas une référence               | `gov:identifiants`                                      |
| RM-13 | Aucun lot composé tant qu'une PR de clôture est ouverte | `gov:etat` (`deux_pr_meme_tache`), Pas 7 du protocole de fusion |
| RM-14 | Un fichier neuf est invisible tant qu'il n'est pas à l'index | aucune — `git status --short` avant les gardes, rattrapé par la Gate A de la PR |

---

## RM-01 — Dériver, jamais recopier

**Énoncé.** Toute vérité a une seule source ; ailleurs on la **dérive** (script, import, hash) ou on la **cite**, on ne la
retape pas. Grille de commissions : `axionia/src/content/pricing.ts` → JSON + hash → Partners (REQ-GOV-019,
REQ-ARG-031, REQ-JUR-019). Contrat d'événements : `packages/contracts` → copie à hash identique côté axionia
(REQ-QA-007). États occupants : `ETATS_OCCUPANTS` dérivée de REQ-DM-003, une constante TS → SQL généré. Tableau §10 du
plan, `TASKS.md`, `PLAN-STATE.md`, `TRACEABILITY.md` : **générés**.

**Pourquoi.** Deux copies divergent toujours ; celle qui est lue n'est jamais celle qui a été corrigée. Le plan
directeur lui-même a porté trois totaux différents pour le même backlog.

**Comment on la voit.** Un `diff` entre la source et la copie régénérée est vide ; un hash embarqué = hash recalculé ;
`gov:check` refuse toute liste littérale d'états hors REQ-DM-003.

## RM-02 — Une garde ne vaut que si on l'a vue rougir

**Énoncé.** Toute garde (test, gate CI, lint, hook) est livrée avec la preuve qu'elle a **échoué** avant le correctif :
bloc « ROUGE : <message verbatim> / VERT : <état> » dans la PR (REQ-GOV-012), `prove.sh <gate>` avec `fixtureRouge`,
`preuveRouge` dans `gates.json` (QA-T00). `red-first` : le test est commité avant le code.

**Pourquoi.** Une gate qui n'a jamais rougi peut mesurer autre chose que sa cible (une gate Lighthouse d'axionia a
mesuré le runner pendant des mois ; une gate `continue-on-error` n'a jamais bloqué personne).

**Comment on la voit.** `gates:prouvees` : chaque gate de phase ≤ N a une `preuveRouge` ; `G-SEC-CI-BLOQUANTE`
refuse tout job en `continue-on-error`.

## RM-03 — Fixtures depuis le producteur réel

**Énoncé.** Une fixture est **générée** depuis le schéma ou le producteur réel (`scripts/partners/fixtures.ts` côté
axionia, base de dev, pseudonymisée), jamais tapée à la main ; elle porte `Source:` (REQ-GOV-020). Une fonction qui
« complète » une fixture **vérifie**, elle ne fabrique pas.

**Pourquoi.** Quatre documents ont bâti un contrat sur `Invoice` et `Refund`, modèles supprimés depuis un mois. Une
fixture au nom local a tenu vert un lot entier qui préfixait deux fois.

**Comment on la voit.** `fixtures:source` rougit sur une fixture sans `Source:` ; le test de contrat tourne sur les
mêmes fichiers des deux côtés.

## RM-04 — Une colonne de vocabulaire est un enum

**Énoncé.** Toute colonne `statut|status|etat|type|motif|resultat|origine|kind|palier|priorite` est un enum Prisma
(REQ-DM-038, REQ-JUR-027, REQ-ARG-017) ; chaque valeur est dans `docs/GLOSSAIRE.md` ; aucun repli `LIBELLES[x] ?? x`.

**Pourquoi.** « valide » contre « validee », une phrase à la place de `reseau_handicap` : deux indicateurs Qualiopi
rouges pour un seed qui écrivait n'importe quoi dans une `String`. Le type attrape ce qu'aucune regex ne voit.

**Comment on la voit.** `schema:enums` (colonne `String` nommée comme un vocabulaire → rouge) ;
`glossaire-enums.spec.ts` (valeur hors glossaire → rouge) ; `statutApporteur()` exhaustif avec `switch … never`.

## RM-05 — Masquage qui échoue ouvert · droit porté par un rôle, défaut = refus

**Énoncé.** Un droit est porté par un **rôle** (`admin`, `qualifieur`, `comptable`, `lecteur`), déclaré dans une
matrice unique, vérifié par `requireRole` dans chaque Server Action et route ; l'absence de règle = **refus**
(REQ-SEC-023). Un masquage conditionnel s'écrit dans le sens qui, en panne, **ne cache rien à qui en a besoin** et
**ne montre rien à qui ne doit pas voir** : on verrouille le sens, pas la présence du conteneur. Ressource étrangère =
404 byte-identique.

**Pourquoi.** Le rôle `reader` d'axionia voyait la facturation que la secrétaire ne voyait pas ; une fonction extraite
avait perdu le `requireAdminRead()` de son appelant.

**Comment on la voit.** `idor:check` sur toutes les routes paramétrées ; garde AST : aucun `prisma.` sous
`src/app/(espace)/**` hors `forApporteur()` ; test « client existant et attribution active → DTO byte-identique ».

## RM-06 — Index unique partiel dérivé de la constante d'états

**Énoncé.** L'unicité d'une attribution vivante par SIREN est un **index unique partiel** en SQL brut,
`WHERE statut IN (ETATS_OCCUPANTS)`, la liste étant générée depuis la même constante que le code (REQ-DM-003) ; un
test lit `pg_indexes` et compare.

**Pourquoi.** L'index proposé par les documents couvrait 2 états sur 7 ; deux attributions vivantes sur un même SIREN
étaient possibles, et Prisma ne sait ni déclarer ni détecter la dérive d'un index partiel.

**Comment on la voit.** `gov:check` refuse `('provisoire','active')` et toute liste littérale ; `pg_indexes.spec.ts`
compare la définition en base à la constante.

## RM-07 — Chercher les appelants avant d'extraire

**Énoncé.** Avant d'extraire, déplacer ou renommer une fonction, lister ses **appelants** et les gardes qu'ils
portaient ; une extraction emporte les gardes avec elle ou les réinstalle dans le nouvel appelant.

**Pourquoi.** Extraire une fonction lui retire les gardes de son appelant ; un `rmSync` sur un dossier qu'on n'a pas
créé efface le travail du voisin.

**Comment on la voit.** Lentille « simplicité & dérivation » de la revue : toute extraction cite ses appelants dans
la PR ; l'auditeur sécurité rejoue l'appelant d'origine.

## RM-08 — Une valeur qu'un tiers doit accepter se confronte à sa doc

**Énoncé.** Toute valeur produite pour un tiers (API recherche-entreprises, DocuSeal, SEPA pain.001, DAS2, URSSAF,
IBAN/BIC, TIIME, ZeptoMail) est confrontée à `docs/tiers/<nom>.md` : URL officielle, date de lecture, extrait cité,
exemple officiel, quotas, comportement en panne (REQ-GOV-022). On ne recopie jamais depuis **notre** spec.

**Pourquoi.** Une valeur recopiée depuis la spec interne a été refusée par le tiers, endpoint par endpoint.

**Comment on la voit.** Fixture d'un format tiers sans `Source:` vers la fiche → rouge ; pain.001 validé contre le
XSD versionné dans le dépôt (REQ-QA-029).

## RM-09 — Une fusion à la fois, l'atterrissage vérifié

**Énoncé.** Une seule PR fusionne à la fois sur `main` (squash, `required_linear_history`) ; le créneau se réserve
**avant** `update-branch` ; `mergeStateStatus` est lu et la fusion exécutée **dans le même appel** ; la suivante attend
`x-partners-build-sha` = sha fusionné (REQ-GOV-014, REQ-QA-033). Jamais `--auto`, jamais deux producteurs, jamais de
`concurrency` au niveau workflow.

**Pourquoi.** Une PR verte passe BEHIND entre la vérification et le `merge` (deux fois le même jour) ; deux
producteurs affament le déploiement ; un run `failure` n'est pas un déploiement cassé — la vérité est dans l'en-tête
de build.

**Comment on la voit.** `deploy:verify <sha>` ; `aucun-workflow-ne-pousse-sur-main.spec.ts` ; `.claude/settings.json`
refuse `git push origin main*`.

## RM-10 — Un seuil, une source, une date — aucun littéral

**Énoncé.** Les seuils et durées légaux ou métier (DAS2, vigilance 500 000 cents, 6 mois, seuil de versement minimal, **30 j de préavis de
résiliation ordinaire — `PREAVIS_JOURS`, contrat art. 11.1**, 12 mois, 90 j, 60 j de dormance, 30 j de session) vivent
dans **une** SSOT avec `source` et `verifieLe` (REQ-JUR-015) ; aucun littéral ailleurs ; une constante sans source fait
échouer le test.

⛔ **La SSOT ne contient AUCUNE constante de gradation ni de délai de « contradictoire »** (décision du 2026-09-03) :
le `CONTRADICTOIRE_JOURS = 7` qui figurait ici est supprimé, et un test échoue s'il — ou un seuil de « strikes » —
réapparaît.

**Pourquoi.** Une hypothèse de chiffrage survit à sa parenthèse ; un « 2 400 € » recopié dans trois fichiers ne
change qu'à deux endroits.

**Comment on la voit.** `ssot:seuils` (JUR-T02) : grep-test `2400|5000|50|90|12` hors SSOT → rouge ; `HYP-*` posé
sur chaque valeur qui dépend d'une décision.

## RM-11 — Aucun défaut sur ce que le test fait varier

**Énoncé.** Un helper de test n'a **aucun paramètre par défaut** sur la dimension que le test fait varier ; une
fixture explicite chaque champ dont dépend l'assertion ; « absent » et « présent » sont deux fixtures, pas une
valeur par défaut.

**Pourquoi.** Un paramètre par défaut dans un helper transforme l'absence en présence ; le test passe sur un code qui
ne lit jamais le champ.

**Comment on la voit.** Lentille « exactitude » ; `verificateur-rouge` mute le champ varié et exige un rouge.

## RM-12 — Un identifiant nu n'est pas une référence

**Énoncé.** Toute décision, constat ou exigence cités le sont par identifiant **qualifié** (`DEC-BEB-D03`,
`REQ-DM-003`, `F-SEC-04`, `HYP-E1-9`), jamais « conforme à D3 » ; toute décision citée existe dans
`docs/DECISIONS.md` (REQ-GOV-003, REQ-GOV-015).

**Pourquoi.** Sept documents ont numéroté leurs décisions A/B/C/D chacun de leur côté ; « C12 » désigne deux choses
selon le document lu.

**Comment on la voit.** `gov:identifiants` : `\b[ABCDR]\d{1,2}\b` nu dans une PR, un ADR ou un commentaire → rouge ;
marqueur `// HYP-` sans entrée dans `DECISIONS.md` → rouge.

## RM-13 — Aucun lot composé tant qu'une PR de clôture est ouverte

**Énoncé.** `pnpm lot:composer` ne se lance qu'une fois la PR de clôture du lot précédent **fusionnée**, son
atterrissage vérifié (Pas 7 de `docs/PROTOCOLE-FUSION.md`) et `pnpm lot:cloture` passé. Une session qui trouve une PR
de clôture ouverte la **finit** — verdicts des quatre lentilles, `pnpm gov:pr --pr <n>` vert, fusion, atterrissage,
clôture — avant tout autre geste, et ne compose rien dans l'intervalle. La règle vaut aussi pour la lecture : tant que
cette PR est ouverte, un chiffre d'avancement se lit **sur une branche nommée**, jamais seul.

**Pourquoi.** `pnpm lot:cloture` est le seul écrivain de `statut`, `pr`, `branch` et `owner` dans `docs/tasks.json`
(`docs/PRESEANCE.md` §1), et il écrit **sur la branche de clôture**. Tant que celle-ci n'est pas fusionnée, les tâches
du lot précédent restent `a_faire` dans la source que le composeur lit : il les juge éligibles et les recompose. On
obtient deux branches, deux PR sur la même tâche, et deux agents sur les mêmes `paths` — alors que l'invariant
« deux tâches d'un lot n'ont jamais de chemin en commun » est calculé **à l'intérieur** d'un lot, jamais entre deux
lots. Mesuré sur la PR #30 : `main` portait 12 tâches livrées, la branche de clôture en portait 20 ; tout chiffre lu
sur la branche décrivait un futur, pas un acquis.

Et surtout : cette règle a déjà été perdue une fois. Elle ne vivait que dans le `CLAUDE.md` racine écrit par la
PR #30, hors de tout registre ; le fichier a été retiré, la règle avec lui, sans qu'aucune garde ne s'en aperçoive.
Une règle de gouvernance qui n'a pas de numéro n'est référencée par aucun ADR ni par le champ « Règle maison
appliquée » du gabarit de PR — elle disparaît à la première réécriture du fichier qui la porte. C'est le motif de son
enregistrement ici, et la raison de ne pas la retirer par commodité : la retirer coûterait exactement ce qu'elle a
déjà coûté.

**Comment on la voit.** `gov:etat --now <ISO>` en donne le **symptôme** : la famille `deux_pr_meme_tache` rougit dès
que deux PR ouvertes citent la même tâche, ce qui est la conséquence directe d'une composition faite trop tôt ;
`pr_sur_tache_non_revendiquee` attrape la même situation par l'autre bout. Le Pas 7 de `docs/PROTOCOLE-FUSION.md`
impose la vérification d'atterrissage qui précède la clôture, et l'invariant de `pnpm lot:cloture`
(`fusion.atterri === true`) refuse de clore un lot dont la PR n'a pas atterri.

⚠️ **La cause, elle, n'est gardée par rien à ce jour, et c'est dit plutôt que supposé.** Aucune garde n'interroge la
forge avant de composer : `pnpm lot:composer` ne refuse que d'**écraser** un `docs/lots/L<phase>-<seq>/lot.json`
existant, et `docs/lots/` est en `.gitignore` — ce refus ne survit donc pas à un `clone`, ni à un changement de
machine. La famille qui manque se nomme : « une PR ouverte portant la clôture du lot précédent interdit la
composition ». Elle appartient à `lot:composer` (GOV-012), pas à ce fichier.

## RM-14 — Un fichier neuf est invisible tant qu'il n'est pas à l'index

_Posée le 2026-09-05 par le `documentaliste` (A03), sur demande de l'intégration du lot `L-1-INT-a` et sur deux
rencontres du même jour rapportées par `GOV-026` et `CPL-T01`. La section « Leçons » ci-dessous veut qu'une règle
naisse d'un ADR plutôt que d'une édition directe : cette régularisation appartient à l'`architecte` (A02) et
n'est pas faite. Elle est écrite ici plutôt que tue, parce qu'une règle non numérotée n'est citée par aucun ADR ni
par le champ « Règle maison appliquée » du gabarit de PR — c'est exactement ce qui a coûté RM-13 une fois déjà._

**Énoncé.** La plupart des gardes de ce dépôt balaient `git ls-files`. Un fichier neuf, écrit mais jamais ajouté
à l'index, n'est lu par aucune d'elles ; le vert qu'elles rendent ne dit rien de lui. Tout agent qui livre un
fichier neuf le rend visible à l'index — `git add -N <chemin>` suffit, et n'engage aucun contenu — **avant** de
lancer ses gardes et avant de conclure. Un « vert » obtenu sur un fichier hors index n'est pas un verdict.

> ⚠️ **CORRECTION DU 2026-09-05, mesurée en livrant `GOV-028`.** La première rédaction de cet énoncé disait
> « balaient `git ls-files`, **jamais le disque** ». C'est faux, et une règle maison qui généralise trop est pire
> qu'une règle absente : elle fait tenir pour acquis un geste de diagnostic qui ne suffit pas. **`gov:trace`
> parcourt le DISQUE** (`readdirSync`, `scripts/gates/gov-trace.ts`) : mesuré, après `git rm --cached` d'un
> fichier de test neuf, elle continuait de le voir — il a fallu le sortir de l'arbre pour qu'il disparaisse.
> Le risque s'y **inverse** donc : un fichier présent sur le disque et absent de l'index y est déjà jugé, et
> `git status --short` ne le dit pas. La règle vaut pour les gardes qui lisent l'index ; devant un vert
> surprenant, lire COMMENT la garde énumère ses fichiers reste le seul geste sûr.

**Pourquoi.** L'absence ne s'imprime pas : rien ne distingue ce vert-là d'un vert légitime. Mesuré sur cet arbre
le 2026-09-05, un document neuf portant une étiquette de relecteur non qualifiée — laissé hors index,
`pnpm gov:identifiants` ne le voit pas et ne relève que la dette antérieure de `docs/gates.json` ; le **même**
fichier après `git add -N`, la **même** commande en relève une de plus et la nomme, ligne comprise. Rien n'avait
changé que sa visibilité à l'index. Cinq gardes au moins sont concernées :
`scripts/gates/gov-identifiants.ts:154`, `scripts/gates/gov-publication.ts:149`,
`scripts/gates/gov-entite.ts:386`, `scripts/gates/gov-preseance.ts:272`,
`scripts/gates/lexique-apporteurs.ts:346`. Le corollaire vaut dans l'autre sens et évite un faux diagnostic :
commiter un document jusque-là ignoré rend visible d'un coup la dette qui y dormait — c'est un inventaire, pas une
régression ; la PR #30 en a fait rougir six d'un coup en faisant entrer `docs/REPRISE-SESSION.md` dans le dépôt.

**Comment on la voit.** Rien ne l'arrête à ce jour, et c'est dit plutôt que supposé : une garde qui comparerait le
disque à l'index rougirait sur tout brouillon légitime, et une garde qui rougit toujours finit désarmée (RM-02).
Le contrôle est procédural et tient en un geste — `git status --short` avant de lancer ses gardes, la liste des `??`
étant exactement ce qu'aucune d'elles ne lira. Le filet d'après est la Gate A de la PR, qui juge l'arbre **tel qu'il
est poussé**, donc indexé : elle rattrape après coup, au prix d'un aller-retour, ce que la session n'a pas vu.

---

## Leçons

Les « appris » rendus par les agents (bloc `## RENDU`) sont consolidés chaque semaine par le `documentaliste` dans
`docs/LECONS.md`, qui porte une date de consolidation machine-lisible : `gov:lecons` rougit au-delà de sept jours si
des « appris » attendent. Une leçon qui se répète devient une règle par ADR, jamais par édition directe de ce fichier.
