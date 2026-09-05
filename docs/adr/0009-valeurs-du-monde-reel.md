# partners/ADR-0009 — Une valeur que seul Will connaît est une CONFIGURATION, pas un blocage de plan

| Champ | Valeur |
| --- | --- |
| **Statut** | `accepte` |
| **Date** | 2026-09-05 |
| **Décideur** | `architecte` |
| **Tâche** | CPL-T01 |
| **Exigences servies** | REQ-CPL-001, REQ-CPL-002, REQ-CPL-003, REQ-CPL-004, REQ-CPL-017, REQ-GOV-027, REQ-GOV-031 — l'exigence de tenance qui complète la liste est consignée par `partners/ADR-0002`, seul ADR autorisé à la citer (`adr-index-derive.spec.ts`) |
| **Décisions du registre citées** | W1, W3, W4, W9, W13, HYP-W2 |
| **Règle maison appliquée** | RM-01, RM-02 |
| **Remplace / remplacé par** | — |

## Contexte

### Le gel, et son mécanisme exact

`CPL-T01` est en phase −1 et portait le statut `attente_externe`. Ce statut n'est pas une étiquette
d'information : trois pièces de l'outillage le lisent, et leur composition n'a pas d'échappatoire.

- `scripts/gates/gov-pr.ts`, famille `phase_gelee` (REQ-GOV-027), refuse toute PR dont le label
  `phase:N` dépasse la phase courante.
- Dans ce même fichier, `phaseCourante()` calcule la phase courante comme le **`min`** des phases
  portant encore une tâche non livrée ; le barème des statuts livrés vient de
  `scripts/lot/avancement.ts`, seule source (RM-01).
- `scripts/lot/composer.ts` écarte une tâche `attente_externe` **avant** le filtre général, avec sa
  raison — elle n'entre donc jamais dans un lot.

Une tâche `attente_externe` n'est jamais composée, donc jamais livrée, donc sa phase ne se clôt
jamais, donc toutes les phases suivantes sont gelées à vie. Ce n'est pas une attente : c'est une
impasse, et elle est **silencieuse** — `gov:tasks` reste vert, `gov:pr` reste vert, et la seule
trace est un chiffre qui ne bouge plus dans `docs/PLAN-STATE.md`.

Mesure du 2026-09-05 sur `docs/tasks.json` : 201 lignes pour 151 j d'effort ; les phases 0 à 3 en
portent **171, soit 132,5 j**. Une seule ligne de backlog les tenait toutes.

### Ce qui était déjà tranché — et que cet ADR ne rouvre pas

Trois des décisions portées par `CPL-T01` sont **tranchées au registre depuis le 2026-09-03**, et
leur ligne de `docs/DECISIONS.md` §1 porte la valeur :

- `W1` — l'entité qui signe et qui paie : **AXION IA SAS**, avec son SIREN, son SIRET, son numéro de
  TVA et son siège. La même ligne écrit qu'`Axion-IA OÜ` n'existe plus et que toute mention est à
  retirer du dossier.
- `W3` — le domaine servi, avec son motif.
- `W4` — un apporteur est une personne, qui peut exercer via une structure ; la tâche `DM-22` qui
  aurait posé un second modèle est supprimée.

`W9` est tranchée le même jour. Son motif est écrit dans sa ligne de `docs/DECISIONS.md` §1, dans
les termes que Will a choisis. Cet ADR ne la tranche pas, ne la reformule pas et ne la déplace pas :
il la **cite**, et cette ligne est la seule source à lire. Un ADR consigne une décision de Will, il
ne la prend jamais (`docs/adr/0000-gabarit.md` §3, `partners/ADR-0005` §3).

Une version antérieure de ce document présentait ces quatre lignes comme ouvertes, et fondait cette
affirmation sur un relevé d'occurrences du dépôt voisin. Le relevé était **périmé** et le registre
prévaut (`partners/ADR-0005` §2). L'affirmation est retirée, et l'argument ci-dessous n'en dépend
pas.

### Ce qui reste — et qui n'est pas une décision en attente

Une seule valeur du monde réel manque encore : les **coordonnées bancaires débitrices** (`W2`, que
la §0 du registre résout en `HYP-W2`). Elle n'est pas une décision qu'on attend : c'est un
**secret**. `W13` a rendu ce dépôt public, et `REQ-GOV-031` en exclut ce qui, une fois poussé, ne
peut plus être repris — forks, caches et miroirs compris.

C'est là que porte le raisonnement, et il ne repose sur aucun état du dépôt à une date donnée : une
valeur secrète n'entre pas dans un dépôt public **quel que soit le moment où on la connaît**. La
sentinelle n'attend pas que Will décide ; elle tient une frontière **permanente**. Le jour où l'IBAN
est connu ne change rien à ce que le dépôt a le droit de porter.

### Le patron existe déjà, à côté

`axionia` construit ses images sans base de données ni Redis grâce à une valeur sentinelle,
`stub.invalid`, reconnue au niveau des singletons `prisma.ts` et `redis.ts` (`axionia/AGENTS.md`,
axionia/ADR-0026). Le build n'attend pas la production : il s'exécute contre une valeur qui se
déclare fausse.

### La confusion à défaire

`attente_externe` a été posé sur `CPL-T01` comme si **écrire le code** dépendait de la valeur. C'est
faux. Seule la **mise en service** en dépend.

## Décision

**1. Les valeurs du monde réel sont une configuration à sentinelle, et cessent d'être un état de
tâche.**

Un registre unique, `config/entite.json`, porte l'entité (`W1`), les domaines (`W3`), le périmètre
(`W4`, REQ-CPL-004, et l'exigence de tenance que `partners/ADR-0002` consigne) et les coordonnées
bancaires (`HYP-W2`). Tout champ non renseigné vaut la sentinelle **`A-RENSEIGNER`**, littérale et
cherchable — jamais une chaîne vide, jamais
`null`, jamais un exemple plausible. Un numéro d'exemple oublié dans un document signé ne se
distingue pas d'une vraie valeur : c'est le seul remplissage que le registre refuse en plus du vide.

**2. Le régime d'un champ est DÉRIVÉ de sa source, jamais tapé (RM-01).**
`src/config/entite.ts` déclare, pour chaque champ, la ligne qui fait autorité — une ligne de
`docs/DECISIONS.md` ou une exigence de `docs/REQUIREMENTS.md` — et trois régimes en découlent :

- **secret** : les coordonnées bancaires débitrices. Dans le dépôt, elles ne prennent **que** la
  sentinelle ; la valeur réelle arrive par les variables d'environnement nommées dans `CHAMPS`.
- **arrêté** : le champ dont la ligne source porte sa marque de clôture. Le registre porte la
  valeur, et la garde vérifie qu'elle se retrouve **mot pour mot** dans la ligne source.
- **en attente** : tout le reste. Sentinelle, et la mise en service refuse.

Rouvrir une décision — retirer sa marque de clôture — remet ses champs à la sentinelle **sans qu'une
ligne de code bouge**. C'est la propriété qui rend cet ADR inoffensif si le registre change demain.

**3. Aucun code ne recopie ces valeurs.** Contrat, mandat d'autofacturation, fichier de virement,
export annuel et mentions légales les **lisent** tous par `src/config/entite.ts` (RM-01). Le SIREN du
contrat, celui du mandat et celui du virement sont donc le même octet, ce qui était déjà l'exigence
de REQ-CPL-001.

**4. Une garde tient la frontière, dans les DEUX sens — c'est elle qui rend la sentinelle sûre.**
`gov:entite` refuse la **mise en service** tant qu'un champ vaut la sentinelle, à chacun des quatre
points de sortie déclarés (émission d'un contrat, génération d'un mandat, écriture d'un fichier de
virement, export annuel). Elle refuse **symétriquement** qu'une coordonnée bancaire réelle soit
commitée. En revanche elle n'empêche ni le build, ni les tests, ni le développement : les phases 0 à
3 se codent et se prouvent contre la sentinelle.

Ses **onze** familles ont chacune leur témoin rouge, et **sept** contre-témoins restent verts, dont
l'univers conforme (RM-02). Sans ces contre-témoins, une garde qui rougit toujours finirait
désarmée.

**5. `CPL-T01` cesse d'être `attente_externe` et devient une tâche de code**, livrable
immédiatement : le registre, son lecteur unique, la garde et ses témoins. Ce qui reste à Will n'est
plus une décision qui bloque, mais **une valeur à poser en environnement** le jour du premier mandat
ou du premier virement — et elle n'entrera pas dans le dépôt ce jour-là non plus.

**6. Cet ADR ne tranche aucune décision de Will.** Il en cite six, et le registre reste la seule
source de leur valeur comme de leur motif.

## Conséquences

- La phase −1 peut se clore. Les 171 tâches des phases 0 à 3 redeviennent atteignables.
- **Deux des quatre points de sortie acceptent déjà** : `contrat-docuseal` et `export-das2`, parce
  que `W1`, `W3` et `W4` sont tranchées. `mandat-autofacturation` et `sepa-pain001` refusent, tous
  deux sur les coordonnées bancaires débitrices. Cette liste n'est **écrite nulle part** : elle se
  dérive du registre, donc des lignes de décision, et elle changera d'elle-même. La première version
  du test affirmait les quatre sur la foi de ce document, et elle est tombée.
- `JUR-T01b` et `JUR-T01c` restent `attente_externe` en **phase 1** : ils ne gèlent ni la phase −1 ni
  la phase 0. Le même patron leur sera appliqué le moment venu — le gabarit se code, la valeur se
  saisit.
- Risque assumé : un développeur pourrait prendre `A-RENSEIGNER` pour une valeur valide. C'est ce que
  la garde interdit, et c'est pourquoi la sentinelle est un mot français en majuscules plutôt qu'une
  chaîne d'apparence technique — aucun formulaire, aucun contrat et aucune banque ne l'accepterait.
- Retour arrière : il consisterait à remettre `CPL-T01` en `attente_externe`. Il regèlerait les mêmes
  171 tâches, et `verrou-de-phase.spec.ts` le rendrait visible au lieu de le laisser silencieux.
- ⛔ **Ce qui reste à Will, et qui n'est plus bloquant** : l'IBAN et le BIC débiteurs, à poser dans
  les variables d'environnement nommées par `src/config/entite.ts`, **jamais** dans le dépôt.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Laisser `CPL-T01` en `attente_externe` jusqu'à la saisie | Le gel n'est pas proportionnel à ce qui manque : une ligne tient 171 tâches, et rien ne le signale — `gov:tasks` et `gov:pr` restent verts. |
| Écrire une valeur d'exemple plausible en attendant | Un numéro d'exemple oublié dans un document signé ne se distingue pas d'une vraie valeur. La garde refuse cette forme au même titre que le vide. |
| Une chaîne vide ou `null` | Ne se cherche pas, et se confond avec une lecture qui a échoué. La sentinelle est littérale précisément pour être trouvable. |
| Porter l'IBAN débiteur dans le dépôt une fois qu'il sera connu | Le dépôt est public (`W13`, REQ-GOV-031) : ce qui y est poussé y reste. La frontière ne dépend pas du moment où la valeur est connue. |
| Trancher `W9` ici | Elle est tranchée au registre depuis le 2026-09-03, motif compris, dans sa ligne de `docs/DECISIONS.md` §1. Un ADR qui s'attribue une décision prise ailleurs déplace la source de vérité, et la session suivante ne sait plus laquelle fait foi. |
| Rouvrir `W1`, `W3` ou `W4` sur la foi d'un relevé du code | Le registre prévaut sur les documents et les relevés qui l'ont alimenté (`partners/ADR-0005` §2). Un relevé date ; une ligne de registre se date elle-même. |
| Énumérer dans le code les points de sortie qui refusent aujourd'hui | Ce serait figer l'état d'un jour. La liste se dérive de `manquantsPour`, donc du registre, donc de la décision (RM-01). |
| Ne garder que le refus à l'exécution | Il ne rougirait qu'en production, c'est-à-dire le jour où l'argent part. La reconnaissance d'un point de sortie par son **chemin** fonctionne avant même que le fichier existe, et vient en plus du refus, jamais à sa place. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/gouvernance/entite-registre.spec.ts` ·
  `it('l’IBAN débiteur vaut la sentinelle DANS LE DÉPÔT, et se résout par l’environnement')` : c'est
  l'assertion qui porte le cœur de cette décision — la frontière permanente. Elle exige que le champ
  soit déclaré secret, qu'il vaille la sentinelle dans le dépôt, et qu'il se résolve par sa variable
  d'environnement. Retirer le régime secret, ou porter la valeur dans le fichier, la fait rougir.
- **Assertion** — `tests/unit/gouvernance/entite-registre.spec.ts` ·
  `it('un IBAN d’apparence réelle COMMITÉ fait rougir la garde (REQ-GOV-031)')` : le second sens de
  la garde. Sans lui, la sentinelle ne protégerait que contre l'oubli, pas contre l'empressement.
- **Assertion** — `tests/unit/gouvernance/entite-registre.spec.ts` ·
  `it('aujourd’hui, ce sont les deux points de sortie qui touchent l’ARGENT qui refusent')` : le
  témoin positif du refus, et la mesure qui corrige ce document. Il nomme les deux points qui
  refusent et le champ qui leur manque, sans que la liste soit écrite à la main.
- **Assertion** — `tests/unit/gouvernance/entite-registre.spec.ts` ·
  `it('une décision ROUVERTE rend la sentinelle obligatoire — le régime est dérivé, pas tapé')` : le
  point 2 de la décision. Retirer une marque de clôture au registre rend la valeur portée fautive,
  sans qu'une ligne de code change.
- **Assertion** — `tests/unit/gouvernance/entite-registre.spec.ts` ·
  `it('est VERTE sur le dépôt : elle n’empêche ni le build, ni les tests, ni le développement')` :
  la moitié de la décision qu'on oublie de garder. Une garde qui bloquerait le build serait
  exactement le blocage de plan que cet ADR défait.
- **Assertion** — `tests/unit/gouvernance/verrou-de-phase.spec.ts` ·
  `it('la phase courante ne porte aucune tâche hors d’atteinte du composeur')` : remettre `CPL-T01`
  hors d'atteinte du composeur fait rougir ce contrôle, avec le nombre de tâches et de jours gelés
  dans le message.
- **Assertion** — `tests/unit/gouvernance/verrou-de-phase.spec.ts` ·
  `it('les tâches qui gèleront une phase ultérieure sont nommées, jamais découvertes après coup')` :
  la liste des tâches différées ne se choisit pas, elle s'additionne, et tout ajout passe par un ADR.

## Reste à faire

- **L'IBAN et le BIC débiteurs** (`HYP-W2`) : saisie de Will dans les variables d'environnement
  nommées par `src/config/entite.ts`, le jour du premier mandat d'autofacturation ou du premier
  fichier de virement. Ce n'est pas une décision et ce n'est pas une tâche de code : c'est un secret
  qui n'entre jamais dans le dépôt.
- **Le sous-domaine d'envoi des courriels** (`domaines.envoi`) : `W3` en décide le principe, pas le
  nom. Sentinelle en attendant, sans effet sur la mise en service.
- **Les quatre valeurs que la banque n'a pas encore données** — BIC de la banque réceptrice, jeu de
  caractères, espace de test, format CSV du relevé (`HYP-W2`, REQ-CPL-002). Elles ne retiennent que
  `sepa-pain001`, et sont à obtenir avant l'armement SEPA.
- **`JUR-T01b` et `JUR-T01c`** restent différées en phase 1, arbitrées ici : elles porteront le même
  patron — gabarit codé, valeur saisie — et une tâche livrera cet arbitrage avant la clôture de la
  phase 0.
- **Les quatre points de sortie n'existent pas encore en code.** `POINTS_DE_SORTIE` est leur
  déclaration anticipée ; la garde reconnaît par son chemin celui qui atterrirait sans appeler le
  refus, et c'est la tâche qui écrira chacun de ces fichiers qui posera l'appel.
