# partners/ADR-0008 — Le contrat d'événements : enveloppe sur le fil, sept types, empreinte du JSON Schema

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-03 |
| **Décideur** | `architecte` |
| **Tâche** | INT-T01a |
| **Exigences servies** | REQ-INT-003, REQ-INT-004, REQ-INT-029, REQ-QA-007, REQ-GOV-020 |
| **Décisions du registre citées** | — |
| **Règle maison appliquée** | RM-01, RM-03 |
| **Remplace / remplacé par** | — |

## Contexte

Le contrat d'événements axionia → Axion Partners est décrit par deux textes qui ne disent pas la
même chose, et INT-T01a devait écrire l'un des deux. Trois écarts, tous mesurés dans le dépôt.

**Sept types, ou onze ?** Le champ `texte` de REQ-INT-004 écrit « Les types d'événements **sont** :
`client.cree`, `client.mis_a_jour`, `devis.signe`, `facture.emise`, `avoir.emis`, `paiement.recu`,
`paiement.rembourse` ». C'est une liste fermée, et elle fait sept. L'acceptation d'INT-T01a dans
`docs/tasks.json` annonce, elle, « la liste fermée des 11 types littéraux » — en citant REQ-INT-004.
Le nombre onze n'est pas fantaisiste : quatre autres noms d'événements circulent ailleurs dans
`docs/requirements.json` — `candidature.recue` et `financement.mis_a_jour` (REQ-INT-032),
`facture.annulee` (REQ-ARG-010, reprise par REQ-INT-032) et `client.fusionne` (REQ-CPL-014). Sept
plus quatre font onze : l'acceptation compte ce que le registre nomme, mais elle l'attribue à une
exigence qui ne le porte pas.

**`snake_case` ou `camelCase` ?** REQ-INT-003 énumère les neuf champs de l'enveloppe sous leur forme
littérale : `{event_id (uuid v4), event_type, schema_version, occurred_at, emitted_at, producer,
subject_ref, sequence, payload}`. L'acceptation d'INT-T01a écrit « enveloppe camelCase », et
`docs/CONVENTIONS.md` §1 impose le français camelCase aux identifiants de code, « colonnes, champs
de payload » — en exemptant nommément « les noms imposés par un tiers (`pain.001`, `EndToEndId`,
`IBAN`, champs d'API externe) ».

**Zod n'est pas installé.** REQ-INT-003 et REQ-QA-007 nomment Zod. Les dépendances de développement
de ce dépôt sont `@types/node`, `ajv`, `tsx`, `typescript` et `vitest` ; `package.json` et
`pnpm-lock.yaml` sont des fichiers partagés qu'une tâche de lot ne modifie pas seule.

**Ce que le contrat ne référence pas.** `docs/AFFIRMATIONS-AXIONIA.md` a rejoué dans le code
d'axionia (commit `ad53f14a`) les cinq affirmations que REQ-GOV-004 nomme : les deux modèles anglais
sur lesquels quatre documents avaient bâti ce contrat sont **faux**. Repère `AFF-01` : la facture
est `FactureFormation` (`prisma/schema.prisma:6913`), aucun modèle du nom cité n'existe. Repère
`AFF-02` : le remboursement n'est pas un modèle, c'est une valeur d'enum (`schema.prisma:229`,
`:238`). Ce n'est pas une opinion, c'est une lecture datée avec ses numéros de ligne.

## Décision

**Ce qui fait foi est le champ `texte` du registre des exigences, pas l'acceptation d'une tâche.**
La clé de préséance est la **ligne 11 de `docs/PRESEANCE.md` §2** : « Registre
(`docs/requirements.json` + `docs/DECISIONS.md`) contre documents sources hors dépôt (plan
directeur, « fonctionnement », audits, tableaux de bord) → **A** ». L'acceptation d'INT-T01a ne
crée pas la règle : elle la **cite** depuis « audit-outil §2.3 », qui est précisément le document
hors dépôt que le champ `source` de REQ-INT-004 déclare, et que la ligne 11 déclasse. Le
raisonnement est celui du §5 point 8, appliqué à l'estimation d'une tâche : un fichier de pilotage
fait foi sur l'existence, le périmètre et le statut de ce qu'il pilote, **jamais sur le contenu de
la règle métier qu'une exigence porte**.

**L'enveloppe est celle de REQ-INT-003, en `snake_case`, à neuf champs, et fermée.** Les neuf noms
sont ceux du registre, dans son ordre. L'écart avec CONVENTIONS §1 est assumé et borné :
l'enveloppe est un **format de fil** partagé avec un second dépôt, au même titre que les champs
d'API tierce que CONVENTIONS §1 exempte. Le camelCase, les suffixes `…Cents` et `…At` restent la
règle **dans le payload**, qui est du code de ce dépôt. Le schéma porte
`additionalProperties: false` : c'est ce refus qui donne son sens au 422 de REQ-INT-003 et au
passage en `gave_up` de l'outbox.

**La nomenclature est la liste fermée de sept types.** Les quatre autres noms sont recensés dans
`packages/contracts/events.ts` sous `TYPES_HORS_CONTRAT_V1`, chacun avec l'exigence qui le nomme et
la raison pour laquelle il existe. Ils ne sont **pas** dans le contrat en `schema_version` 1 : les
inventer pour atteindre onze serait écrire un contrat que nulle exigence ne porte. La dette est
nommée, pas comblée — l'alignement de REQ-INT-004 revient au `gardien-spec` (§ Reste à faire).

**La source unique est un descripteur TypeScript sans dépendance**, `packages/contracts/enveloppe.ts`
et `packages/contracts/events.ts`. Trois artefacts en sont **dérivés** par
`scripts/contracts/export.ts`, aucun n'est écrit à la main (RM-01) : le JSON Schema canonisé
(`contracts.v1.json`), son empreinte au format `sha256sum` (`contracts.sha256`), et la source Zod
(`events.zod.ts`).

**L'empreinte porte sur le JSON Schema, jamais sur le Zod.** Un objet Zod n'a pas de sérialisation
canonique : deux versions de la bibliothèque rendent deux structures internes pour le même schéma,
et l'empreinte changerait sans que le contrat ait bougé. Le JSON Schema est du texte, canonisé par
tri récursif des clés : c'est lui qui traverse la frontière, et lui qu'on hache.

**Zod est généré, pas transcrit.** `zod` n'étant pas installé, la validation exécutable de ce dépôt
passe aujourd'hui par `ajv`, sur le même JSON Schema que l'autre dépôt lira. `events.zod.ts` est
néanmoins produit dès maintenant, par le même script et depuis le même descripteur : le jour où la
dépendance arrive, il n'y a pas une ligne à retaper — c'est exactement le défaut que REQ-QA-007
existe pour rendre impossible.

**Les payloads restent OUVERTS en `schema_version` 1, et le disent.** Chaque type a son `$defs`,
vide et commenté. Aucun champ n'est deviné : REQ-INT-005, REQ-INT-006 et REQ-INT-032 les énumèrent,
et c'est INT-T01b qui les ferme **depuis le producteur réel**. Trois champs de l'enveloppe sont
également ouverts et le déclarent — `producer` (aucune exigence n'énumère les producteurs),
`subject_ref` (sa forme n'est écrite nulle part) et la **portée** de `sequence` (le registre nomme
le champ sans dire si la monotonie est globale ou par sujet ; c'est INT-T02 qui la tranche).

**`prisma/schema.prisma` n'est pas créé par cette tâche.** Le contrat d'événements est un format de
fil ; il n'impose aucune table à Partners. Les deux tables que l'on pourrait croire siennes ont
chacune leur porteur ailleurs : l'outbox est côté axionia (REQ-INT-001, tâche INT-T02, dont les
chemins PROPOSÉS — `docs/paths-proposes.json`, pas ses `paths[]`, qui portent encore le marque-place
`axionia/INT-T02` — visent `axionia/prisma/schema.prisma`) et le journal d'événements est porté par DM-01
(REQ-DM-041). `docs/paths-proposes.json` compte par ailleurs **41 tâches** qui déclarent
`prisma/schema.prisma` : c'est le deuxième chemin le plus partagé du backlog, et l'ouvrir ici pour
n'y rien écrire aurait bloqué un lot entier.

## Conséquences

- **Une transcription divergente entre les deux dépôts devient visible.** Renommer un champ dans
  `packages/contracts/` sans republier fait rougir `contracts:export --verifier` sur les trois
  artefacts à la fois — c'est la `fixtureRouge` que `docs/gates.json` déclare pour
  `partners:contrat:hash`, et elle a été jouée (voir « Ce qui le vérifie »).
- **Le contrat ne peut plus diverger de son exigence en silence.** Le test de contrat ne recopie ni
  la liste des types ni les champs de l'enveloppe : il les **lit** dans `docs/requirements.json`.
  Un type ajouté au code sans être ajouté à REQ-INT-004 rougit ; une exigence ouverte par le
  `gardien-spec` rougit aussi, et c'est alors le contrat qu'on corrige.
- **Fermer un payload changera l'empreinte, donc rougira des deux côtés** tant que l'autre dépôt
  n'aura pas republié. C'est voulu : c'est le seul moment où une transcription se vérifie.
- **Ce que cette décision coûte.** Deux textes du dépôt restent à aligner par leurs écrivains
  légitimes (§ Reste à faire) ; en attendant, un lecteur qui n'ouvre que `docs/tasks.json` lira
  « 11 types » et « camelCase », et se trompera.
- **Retour arrière.** Si le `gardien-spec` ouvre REQ-INT-004 aux onze types, il n'y a rien à
  restructurer : les quatre noms sont déjà écrits, leur exigence citée, et la couture des `$defs`
  existe. Le geste est de les déplacer de `TYPES_HORS_CONTRAT_V1` vers `TYPES_EVENEMENT`, de
  regénérer, et de republier l'empreinte des deux côtés dans la même fenêtre de fusion. Repasser
  l'enveloppe en camelCase, en revanche, coûterait une `schema_version` 2 et une double lecture
  côté récepteur pendant la bascule.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Écrire onze types, comme l'acceptation | Quatre d'entre eux ne sont portés par aucune liste fermée : les ajouter ici reviendrait à trancher une exigence depuis une PR, ce que `docs/PRESEANCE.md` §2 ligne 11 refuse. Un contrat dont la moitié n'a pas de source est un contrat que personne ne peut vérifier. |
| Inventer quatre types de plus pour atteindre onze | Le décompte serait juste et le contrat faux. Quatre documents ont déjà bâti ce contrat sur deux modèles inexistants (`AFF-01`, `AFF-02`) ; le défaut ne vient pas d'un manque de noms, il vient de noms sans source. |
| Enveloppe en camelCase, comme l'acceptation et CONVENTIONS §1 | REQ-INT-003 énumère les neuf champs **littéralement**, et c'est le format que le second dépôt lit. Traduire la casse d'un format de fil, c'est créer deux vocabulaires pour un seul octet-à-octet, et n'avoir plus aucun moyen de dire lequel est faux. |
| Écrire le Zod à la main maintenant | `zod` n'est pas installé et `package.json` est partagé : rien ne compilerait, rien ne tournerait, et le lot entier serait rouge pour une dépendance absente. Un schéma qu'aucun test n'exécute ne garde rien. |
| Écrire le JSON Schema à la main et en dériver le Zod plus tard | C'est la copie que RM-01 refuse. Le jour où quelqu'un corrige le descripteur sans rouvrir le JSON, celui qui est lu n'est plus celui qui a été corrigé. |
| Hacher le schéma Zod plutôt que le JSON Schema | Un objet Zod n'a pas de sérialisation canonique : l'empreinte bougerait à chaque montée de version de la bibliothèque, et la garde mesurerait la bibliothèque au lieu du contrat. |
| Créer `prisma/schema.prisma` pour y poser l'outbox | L'outbox vit côté axionia (REQ-INT-001, INT-T02). Créer ici un fichier que 41 tâches déclarent, pour n'y rien écrire, revient à réserver le chemin le plus disputé du backlog sans contrepartie. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/integration/contrat-hash.spec.ts` ·
  `it("REQ-INT-003 — l'enveloppe porte les neuf champs du registre, dans la casse du registre")` :
  ce test lit les neuf noms dans le champ `texte` de REQ-INT-003 et les compare, position par
  position, au descripteur. Il verrait mourir aussi bien la casse retenue que l'ordre des champs.
- **Assertion** — `tests/unit/integration/contrat-hash.spec.ts` ·
  `it('REQ-INT-004 — la liste des types est FERMÉE sur les sept que le registre énumère')` : la
  liste est lue dans le registre, jamais recopiée. Un huitième type ajouté au contrat sans exigence
  la fait rougir ; c'est l'assertion qui tient le « sept, pas onze » de cette décision.
- **Assertion** — `tests/unit/integration/contrat-hash.spec.ts` ·
  `it("REQ-QA-007 — contracts.sha256 est l'empreinte du schéma publié, et un champ renommé la change")` :
  l'empreinte est recalculée depuis le fichier publié, puis recalculée sur une copie où un champ a
  été renommé, et les deux doivent différer. Sans ce second calcul, l'empreinte pourrait être une
  constante figée et le test resterait vert.

## Reste à faire

> ⚠️ **Trois points de cette liste ont été FERMÉS par le commit d'intégration du lot L-1-03**
> (`a77508b`), le jour même où cet ADR est passé `accepte` : l'acceptation d'INT-T01a dans
> `docs/tasks.json`, le chemin de `partners:contrat:hash` dans `docs/gates.json`, et les scripts
> `contracts:export` / `contracts:hash` avec leur étape de Gate A. Ils sont retirés ci-dessous
> plutôt que barrés : un lecteur d'un ADR `accepte` qui trouve une tâche déjà faite la refait.
> Relevé par la lentille `schema` (A02) sur la PR 28.

1. **`REQ-INT-004` compte sept types, quatre autres circulent au registre.** L'alignement — les
   ouvrir dans le texte de l'exigence, ou les rattacher explicitement à une `schema_version` 2 —
   revient au `gardien-spec` : `docs/requirements.json` est un fichier réservé
   (`docs/CONVENTIONS.md` §8). Tant qu'il n'est pas fait, `TYPES_HORS_CONTRAT_V1` porte la dette et
   le test la tient. **Trois nombres cohabitent encore** : REQ-QA-007 et REQ-GOV-020 disent cinq
   événements, REQ-INT-004 en dit sept.
2. **`docs/CONVENTIONS.md` §1 ne nomme pas l'exemption du format de fil.** Elle exempte « les noms
   imposés par un tiers » ; un contrat inter-dépôts est le même cas et mérite d'y être écrit, sans
   quoi la prochaine enveloppe sera traduite en camelCase par bonne volonté. `docs/GLOSSAIRE.md` §5
   porte désormais l'écart et ses synonymes interdits — mais **aucune garde ne lit le glossaire**
   tant que GOV-006 n'a pas livré `glossaire-enums.spec.ts` : c'est une consigne, pas un contrôle.
3. **Les payloads et les fixtures réelles sont à INT-T01b**, qui les génère depuis les producteurs
   d'axionia. La fixture livrée ici déclare qu'elle est provisoire et nomme cette tâche.
   **INT-T01b porte désormais `REQ-QA-007`** (`docs/tasks.json`), et c'est le correctif d'un défaut
   que la lentille `schema` a nommé : INT-T01a en était le SEUL porteur, si bien qu'une fois
   `fusionnee`, la matrice de traçabilité déclarait l'exigence couverte — alors que la moitié de son
   texte, « les fixtures sont générées par le producteur réel et non écrites à la main », n'est pas
   tenue et que la fixture le dit elle-même. L'invariant RM-03 aurait disparu du backlog en étant
   rapporté vert. INT-T01b passe aussi **`schema: true`** : elle ferme les `$defs`, donc elle change
   l'empreinte publiée, et sa PR doit porter le label qui appelle l'architecte en relecteur bloquant.
4. **Un arbitrage attend INT-T01b sur la frontière de REQ-INT-029.** Le détecteur de la famille
   `identite_autre_apporteur` est réglé large — il échoue FERMÉ, comme doit le faire une garde de
   confidentialité. Conséquence connue : le champ `parrainCodeCapture` que REQ-INT-032 décrit dans
   le payload de `candidature.recue` le ferait rougir. Ce type n'est pas dans le contrat v1 ; le
   jour où il y entre, il faudra trancher si un code de parrainage est une identité, puis soit
   resserrer le motif, soit écrire l'exemption avec l'exigence qui la porte. Ce n'est pas un
   détail de mise au point : c'est le seul endroit du contrat où la garde et une exigence se
   contrediront, et il vaut mieux qu'il soit écrit avant d'être découvert.
5. **Ce que coûte une évolution, écrit avant d'y être.** Ajouter un champ de *payload* est
   compatible : les sept `$defs/payload_*` sont ouverts, l'ancien consommateur accepte, seule
   l'empreinte bouge. Mais ajouter un **type**, ajouter un champ d'**enveloppe**, ou passer à
   `schema_version` 2 sont tous trois en **lockstep** : l'enum fermé, `additionalProperties: false`
   à la racine et `const: 1` font qu'un consommateur v1 rend 422 sur **tout** événement, de tout
   type, et que REQ-INT-003 les passe en `gave_up`. Rien n'est perdu — REQ-INT-009 garde la ligne
   abandonnée rejouable par `event_id` — mais le flux entier s'arrête tant que les deux dépôts
   n'ont pas republié. Le `held` de REQ-QA-009, qui aurait amorti, a été absorbé par REQ-ARG-003
   dont le texte ne le reprend pas. Une évolution d'enveloppe se planifie donc comme un
   déploiement coordonné, jamais comme un ajout.
6. **Une réserve sur `additionalProperties: false` à la racine.** En JSON Schema 2020-12, il ne voit
   pas les `properties` déclarées dans un `allOf`/`then`. Aujourd'hui les `then` ne redéclarent que
   `payload`, déjà présent à la racine : aucun faux refus. Le jour où INT-T01b posera un champ
   d'**enveloppe** conditionné par le type, il sera rejeté — et le message ne dira pas pourquoi.
7. **La table `EvenementRecu` (REQ-DM-036) est portée par SEC-06**, pas par le contrat. Le contrat
   est un format de fil et n'impose aucune table ; mais `event_id` est la clé d'idempotence du
   récepteur, et le `$comment` de `packages/contracts/enveloppe.ts` le cite désormais avec son
   exigence et son porteur. Aucune table ne manque au backlog — il manquait la citation.
8. **L'empreinte publiée a changé une fois après l'acceptation de cet ADR**, en ajoutant cette
   citation au `$comment` d'`event_id` : `d5a3231…` → `8b0b09a…`. C'est le comportement attendu — le
   texte du schéma a changé, donc son empreinte — et c'est sans conséquence tant qu'aucun dépôt ne
   l'a copiée. Après la première copie côté axionia, tout changement d'empreinte, fût-il un
   commentaire, devient un déploiement coordonné (voir le point 5).
