# Inventaire des huit chantiers — état d'avancement prouvé

> Livré par **GOV-020** (REQ-GOV-026). Garde : `pnpm gov:inventaire`
> (`scripts/gates/gov-inventaire.ts`). Test : `tests/unit/gouvernance/inventaire-prouve.spec.ts`.
>
> REQ-GOV-026 demande que « l'inventaire initial » soit consigné dans `docs/PLAN-STATE.md`.
> **Il ne peut pas l'être** : `PLAN-STATE.md` est un fichier **dérivé** (`pnpm plan-state:build`),
> interdit d'écriture par `.claude/settings.json`, et régénéré depuis `docs/tasks.json`, les issues
> et git. Une ligne écrite là disparaît au rendu suivant. L'inventaire vit donc **ici**, dans un
> fichier source, et c'est la garde qui le tient — pas une relecture.

## 1. La légende, et pourquoi il n'y en a qu'une

REQ-GOV-026 fixe sept états d'avancement. Écrits sans accent, comme tous les enums du dépôt
(`docs/CONVENTIONS.md` §2, RM-04), et **ordonnés** — « ≥ codé » n'a de sens que sur une échelle :

| Rang | État | Ce qu'il affirme |
| ---: | ---- | ---------------- |
| 1 | `specifie` | une exigence écrite le décrit ; rien n'existe encore |
| 2 | `code` | du code existe **quelque part** — dans ce dépôt ou dans `axionia` |
| 3 | `teste` | ce code porte un test qu'on a vu rougir avant lui (RM-02) |
| 4 | `revu` | un relecteur ≠ auteur l'a accepté |
| 5 | `fusionne` | il est sur `main` |
| 6 | `deploye` | il est sur l'image déployée |
| 7 | `verifie_en_prod` | il a été observé vivant en production |

**Ce n'est PAS un second vocabulaire de statut.** `docs/tasks.json` porte déjà l'enum
`StatutTache` (`scripts/lot/tasks.schema.json`), et c'est le **seul** vocabulaire qu'on écrit.
La légende ci-dessus est une **échelle de lecture** : la garde en dérive un rang depuis le statut,
elle ne l'écrit jamais dans le backlog. Le barème de dérivation est unique, il vit dans
`scripts/gates/gov-inventaire.ts`, et il est **exhaustif sur l'enum du schéma** : ajouter un
statut au schéma sans lui donner de rang fait rougir la garde.

Le rang d'un statut est le **plancher garanti**, jamais l'optimisme. `en_cours` vaut `specifie` :
une tâche revendiquée il y a une minute n'a pas encore de code, et une garde qui l'exigerait
rougirait sur l'acte même de prendre une tâche.

| Statut du backlog | Rang lu | Pourquoi ce plancher |
| ----------------- | ------- | -------------------- |
| `proposee` | *aucun* | une dette proposée n'est pas encore au registre arbitré |
| `a_faire` | `specifie` | la tâche existe, rien n'a commencé |
| `en_cours` | `specifie` | revendiquée n'est pas codée |
| `bloquee` | `specifie` | l'arrêt ne fait pas reculer, il ne fait pas avancer non plus |
| `attente_externe` | `specifie` | idem |
| `en_revue` | `teste` | il y a une PR ouverte : le code et son bloc ROUGE/VERT existent |
| `fusionnee` | `fusionne` | squash sur `main`, approbation d'un relecteur ≠ auteur |
| `deployee` | `deploye` | |
| `verifiee` | `verifie_en_prod` | |

## 2. Ce qui compte comme preuve

Deux formes, celles que REQ-GOV-026 nomme, et rien d'autre :

- **un chemin de fichier** qui existe sur le disque, pris dans `paths[]` de `docs/tasks.json`
  **ou** dans `docs/paths-proposes.json` — la vue dérivée qui porte les chemins réels ;
- **un SHA de commit** qui résout dans ce dépôt (`git rev-parse --verify`). Pour une tâche, il est
  **dérivé** : c'est le commit dont la portée conventionnelle cite son identifiant
  (`feat(GOV-004): …`), jamais un SHA recopié à la main.

Un numéro de PR n'est **pas** une preuve : REQ-GOV-026 dit « chemin de fichier ou SHA », et une
tâche fusionnée du dépôt (`GOV-000`) n'a aucun numéro de PR — la fusion a précédé l'ouverture des
PR. Exiger `pr` non nul aurait fait rougir la garde sur une tâche légitimement livrée.

## 3. L'inventaire

⚠️ **Les étiquettes ci-dessous sont citées, jamais employées comme références.** Elles viennent
d'un document de spécification qui n'est pas dans ce dépôt. C'est exactement ce que RM-12 refuse :
un identifiant nu ne résout pas. Trois espaces de noms distincts se disputent ces étiquettes dans
ce seul dépôt — la ligne « HYP-C1 » du registre des décisions (naissance de l'attribution), la
série des décisions de l'audit anti-abus (`docs/DECISIONS.md` §3), et les chantiers de
REQ-GOV-026. Elles ne désignent pas la même chose.

| Étiquette | Référent résolu dans ce dépôt | État | Preuve | Ce que REQ-GOV-026 en dit |
| --------- | ----------------------------- | ---- | ------ | ------------------------- |
| « C1 » | **oui** — le calcul de priorité d'une candidature, `src/lib/commercial-application/scoring.ts` d'axionia. Correspondance établie par `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` (fusion REQ-QA-035 / REQ-DM-035 / REQ-GOV-026), qui écrit « la transposition de C1 » suivie du nom du fichier | `code` | `docs/AFFIRMATIONS-AXIONIA.md` | « codé dans axionia à transposer » — **concordant**. Le repère `AFF-46` cite `scoring.ts` ligne à ligne au commit `ad53f14a` d'axionia. La transposition reste à faire côté Partners (`DM-035`) |
| « C2 » | **non** | — | — | « non codé » — **invérifiable ici** : aucun document de ce dépôt ne dit ce que cette étiquette désigne |
| « C3 » | **oui** — la chaîne de résolution encaissement → client. Correspondance établie par `docs/AFFIRMATIONS-AXIONIA.md` §1, qui l'apparie explicitement au repère `AFF-06` et explique pourquoi | `specifie` | — | « non codé » — **concordant, et prouvé** : `AFF-06` rend l'affirmation FAUSSE, la chaîne est nullable à quatre maillons |
| « C4 » | **non** | — | — | « non codé » — **invérifiable ici** |
| « C5 » | **non** | — | — | « codé » — **invérifiable ici, et c'est la ligne qui coûte** : REQ-GOV-026 affirme un état `code`, qui exigerait une preuve, sur une étiquette dont rien dans ce dépôt ne donne le référent. Aucun état n'est écrit plutôt qu'un état inventé |
| « C6 » | **non** | — | — | « non codé » — **invérifiable ici** |
| « C7 » | **non** | — | — | « non codé » — **invérifiable ici** |
| « C8 » | **non** | — | — | « non codé » — **invérifiable ici** |

## 4. Ce que cet inventaire ne fait pas, et ce qu'il attend

- **Il n'invente aucun référent.** Six étiquettes sur huit n'en ont pas dans ce dépôt ; leur
  cellule « État » est vide, et la garde rougit si quelqu'un y écrit un état. Une preuve inventée
  est pire qu'une preuve absente : elle rend vert un contrôle qui ne mesure plus rien.
- **Il ne cherche pas la définition ailleurs.** Le document qui numérote ces chantiers — le plan
  directeur, §10 — n'est pas versionné ici : `docs/spec/` n'existe pas.
- **Ce qu'il faut pour compléter les six lignes** : la liste des huit chantiers avec, pour chacun,
  son intitulé et le fichier d'axionia qu'il désigne. Dès qu'elle est écrite dans ce dépôt, chaque
  ligne se remplit et la garde exige sa preuve. Tant qu'elle ne l'est pas, l'inventaire dit ce que
  le dépôt sait — pas plus.
