# partners/ADR-0033 — Le contrat de l'API 3 : Partners enregistre et décide, le CRM Pro demande et affiche

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-10-09 |
| **Décideur** | `architecte` — la lentille `schema` (A02) relit et décide ; Williams VALIDE le contrat avant toute ligne de code du CRM Pro ; l'auteur ne le passe jamais `accepte` lui-même |
| **Tâche** | INT-T28 |
| **Exigences servies** | REQ-DM-048, REQ-SEC-041, REQ-SEC-042, REQ-JUR-044, REQ-INT-031, REQ-SEC-012 |
| **Décisions du registre citées** | W19, HYP-W19-SOURCE, HYP-W19-VISIBILITE, HYP-W19-IDENTITE-CRM, HYP-W19-LIMITES, HYP-W19-CSE, HYP-W19-CYCLE, HYP-W19-CARENCE (en partie levée par REQ-DM-048), HYP-W19-DEPART, HYP-W19-ANTI-CUMUL |
| **Règle maison appliquée** | RM-01, RM-05, RM-10 |
| **Remplace / remplacé par** | `—` (la fiche de la tâche nommait ce fichier `0031` ; ce numéro a été pris entre-temps, l'ADR prend le premier numéro libre) |

## Contexte

Williams a tranché le 2026-09-29 la question 22 du chantier des conseillers salariés (`docs/DECISIONS.md`,
ligne W19 et §9, option A) : les conseillers travaillent au quotidien dans le CRM Pro (dépôt séparé
`will383842/axion-crm-pro`), et **Partners garde le registre d'antériorité unique**. Seul Partners
enregistre une prise en charge, par la console admin ou par l'API 3 (HYP-W19-SOURCE, tranchée). La
réponse de la gouvernance Partners au ticket #220 exige que le contrat de cette API soit **figé avant
toute ligne de code du CRM Pro**.

Ce qui est vrai avant la décision :

- **Un nom à désambiguïser.** partners/ADR-0023 appelle « troisième API du contrat » la route des
  coordonnées de candidature qu'axionia sert à Partners. L'**API 3** du registre W19 est une autre
  chose : la route que **Partners** sert au **CRM Pro**. Elle est nommée ici « API 3 (CRM Pro) » ; elle
  n'appartient pas au contrat versionné partagé avec axionia (`packages/contracts`) et n'en change
  pas l'empreinte.
- **L'identité de l'appelant n'est pas prouvable par Partners.** Le conseiller s'authentifie dans le
  CRM Pro, pas dans Partners : aucune session de console n'est ouverte au rôle `conseiller_salarie` en
  V1 (REQ-SEC-041). Partners ne voit qu'un service qui appelle avec un jeton et une référence de
  conseiller. La lentille `securite` l'a relevé sur la PR #230 (tête `830a648`) ; le registre l'a inscrit
  comme hypothèse de confiance (HYP-W19-IDENTITE-CRM).
- **L'indistinction côté apporteur est déjà décidée.** Vu par un apporteur, une prise en charge est
  indiscernable d'une occupation par un autre apporteur (question 2, art. 3.5 ; REQ-SEC-042). L'API 3
  ne doit rien ouvrir qui permette à un tiers de reconstituer cette différence.
- **Les fonctions existent dans les tâches, pas encore dans le code.** La prise en charge est la
  fonction unique de DM-30 ; le « Vérifier » du conseiller est celle de DM-31 ; le rattachement des
  références est DM-32 ; les avis d'échéance sont UX-P2-13 ; la route, son jeton et ses tests sont
  SEC-34. Cet ADR fixe ce que ces tâches réalisent, sans l'étendre.

## Décision

**1. Trois routes, versionnées dans le chemin.** Toutes vivent sous `/api/integrations/crm-pro/v1/`.
Le corps des requêtes et des réponses est en JSON, en `camelCase` comme l'API 1 (REQ-INT-014). Le
schéma est FERMÉ : un champ inconnu en entrée est refusé (`400`), et aucun champ n'est ajouté en sortie
sans une nouvelle version de cet ADR.

| Route | Entrée | Réponse `200` |
| --- | --- | --- |
| `POST /prises-en-charge` | `{ siren, conseillerRef, cleIdempotence }` | `{ issue: "acceptee", until: "AAAA-MM" }` ou `{ issue: "non_disponible" }` |
| `GET /prises-en-charge?conseiller=<conseillerRef>` | — | `{ prisesEnCharge: [{ siren, until: "AAAA-MM", avis: null \| "echeance_proche" \| "terminee" }] }` |
| `POST /verifications` | `{ siren, conseillerRef }` | `{ etat: "libre" }`, `{ etat: "a_vous", until: "AAAA-MM" }` ou `{ etat: "non_disponible" }` |

- `siren` : neuf chiffres, clé de Luhn vérifiée ; un SIREN invalide rend `400`, jamais
  `non_disponible`.
- `conseillerRef` : la référence opaque que DM-32 rattache à un utilisateur de console
  `conseiller_salarie` (décision 3).
- `cleIdempotence` : un UUID choisi par le CRM Pro pour CET acte. La même clé avec le même corps rend
  la MÊME réponse, sans seconde écriture, pendant la durée de rétention de la clé (`SSOT`, défaut
  proposé : 24 heures). La même clé avec un corps différent rend `409`.
- `non_disponible` ne porte AUCUN détail : ni mois, ni cause, ni occupant, ni stade, ni population
  (HYP-W19-VISIBILITE). Il couvre toutes les causes : SIREN occupé par un apporteur ou par un autre
  conseiller, client ou devis d'Axion-IA, fenêtre de redéclaration d'un rang 1, délai après une
  vérification ou un dépôt refusé d'un apporteur, et tout délai d'attente que Partners appliquerait.
  Le délai d'attente propre aux conseillers après une libération (`CARENCE_CONSEILLER_JOURS`,
  HYP-W19-CARENCE) a été supprimé le 2026-10-02 (REQ-DM-048, réponse « A. ») : le contrat n'en dépend
  pas, puisque la cause n'est jamais transportée.
- Le « Vérifier » passe en `POST` pour que le SIREN ne figure dans aucune URL, donc dans aucun journal
  d'accès intermédiaire ; l'API 1 garde sa forme (`GET ?siren=`), qui n'est pas changée ici.
- La liste rend les prises en charge du SEUL conseiller désigné, actives, et celles terminées depuis
  moins du délai d'avis (`SSOT`, défaut proposé : 15 jours), pour que le CRM Pro affiche la fin.

**2. L'avis d'échéance est un champ de la liste, pas une route.** `avis` vaut `echeance_proche` à
partir de quinze jours avant le terme (délai en `SSOT`), `terminee` après le terme, `null` sinon. Il
est calculé par Partners à partir des seules dates (UX-P2-13), sans rien mémoriser de l'activité du
conseiller. Le CRM Pro le lit en même temps que la liste, et n'a donc aucune route de plus à
interroger : une route dédiée doublerait la surface sans rien apporter que la liste n'ait déjà.

**3. Les codes de refus sont fermés.** Le corps d'erreur est `{ erreur: "<code>" }`, sans message libre.

| Statut | Code | Quand |
| --- | --- | --- |
| `404` | — (corps vide) | Jeton absent, faux, ou jeton d'une autre API : la réponse est celle d'une route inexistante (patron REQ-SEC-012) |
| `400` | `requete_invalide` | Corps hors schéma, SIREN invalide, champ inconnu |
| `403` | `conseiller_refuse` | Référence inconnue, retirée, désactivée, ou rattachée à un autre rôle : UNE seule réponse pour toutes ces causes |
| `409` | `cle_reutilisee` | Même clé d'idempotence, corps différent |
| `429` | `debit_depasse` | Débit du jeton ou du conseiller dépassé |
| `429` | `limite_atteinte` | Limite de prises en charge du conseiller ou de la Société atteinte (HYP-W19-LIMITES) |
| `503` | `indisponible` | Partners ne peut pas décider (base, limiteur en panne : `surPanne: refuser`) |

La limite de prises en charge est jugée AVANT toute lecture du SIREN : `limite_atteinte` ne dépend pas
du SIREN demandé et n'apprend rien de lui. Le mot employé est « limite », jamais un autre terme du
lexique interdit (famille `quota`).

**4. Authentification par un jeton de service propre.** Un jeton bearer d'au moins 32 octets, comparé
en temps constant, distinct de celui de l'API 1 et limité aux trois routes ci-dessus : le jeton de
l'API 1 est refusé ici, et celui-ci l'est partout ailleurs. Une liste d'adresses autorisées s'ajoute si
le CRM Pro sort par une adresse fixe, à confirmer par Will. Le secret vit en configuration seulement :
posé par les secrets GitHub, le workflow `coolify-poser-variable.yml`, puis Coolify (REQ-INT-031) ;
il ne transite jamais par le dépôt ni par une conversation.

- **Rotation** : Partners accepte deux valeurs, la courante et la précédente, pendant une fenêtre de
  recouvrement (`SSOT`, défaut proposé : 7 jours) ; le CRM Pro bascule sur la nouvelle, puis la
  précédente est retirée.
- **Révocation** : retirer les deux valeurs. Toute requête rend alors `404` dès le redéploiement de la
  variable ; la révocation est donc un geste d'exploitation chronométré, décrit par SEC-34 dans
  `docs/tiers/coolify.md`.

**5. Débit, journal, alertes.** Débit limité par jeton et par conseiller, valeurs en `SSOT`
(`src/server/securite/rate-limit.ts`), conduite sur panne `refuser`. Chaque appel est journalisé :
route, issue, SIREN, empreinte à clé de la référence du conseiller, empreinte de l'adresse ; jamais un
nom, un courriel ni le jeton. Deux alertes à l'admin, portées par SEC-34 :

- une alerte de **volume**, sur le jeton et sur la Société, agrégée et JAMAIS nominative, active SANS
  condition dès l'émission du jeton : elle voit un balayage réparti entre les conseillers ;
- une alerte d'**anomalie par conseiller**, activée une fois la condition HYP-W19-CSE remplie.

**6. Identité : une hypothèse de confiance, écrite comme telle (HYP-W19-IDENTITE-CRM).** La référence
du conseiller est rattachée par DM-32 à un utilisateur de console `conseiller_salarie`, et Partners
vérifie à CHAQUE appel que cet utilisateur est actif et de ce rôle. Le CRM Pro dérive la référence de
la session authentifiée du conseiller ; elle n'est jamais saisie ni choisie dans un champ. Le CRM Pro
ne désigne jamais un apporteur ni un autre rôle.

Partners vérifie le jeton et le rattachement d'une référence active. **Il ne vérifie pas la personne.**
Un CRM Pro compromis, ou son jeton volé, peut donc **agir au nom de tout conseiller actif** : prendre
en charge, vérifier, lister. Ce qui borne alors le dommage :

- la **limite de la Société, fixe et basse**, égale à celle d'un seul apporteur quel que soit le nombre
  de conseillers actifs (HYP-W19-LIMITES) : nommer tour à tour chaque conseiller ne la multiplie pas ;
- l'**alerte de volume sans condition** (décision 5) ;
- le **journal de chaque appel**, qui permet de défaire ce qui a été fait ;
- la **révocation du jeton** (décision 4).

**7. Toutes les bornes sont appliquées par Partners seul.** Cycle, délai d'attente, fenêtre du rang 1,
limites, délai après un acte d'apporteur, départ, anti-cumul (HYP-W19-CYCLE, REQ-DM-048,
HYP-W19-LIMITES, HYP-W19-DEPART, HYP-W19-ANTI-CUMUL) : le CRM Pro n'en calcule aucune et ne garde rien
qui vaudrait décision. Il affiche ce que Partners répond. Une borne ajoutée, retirée ou chiffrée
autrement ne change pas ce contrat : elle se lit dans la seule réponse `non_disponible` ou
`limite_atteinte`, toujours sans cause.

**8. La source est Partners.** Seule une prise en charge enregistrée par Partners occupe un SIREN ; rien
n'est déduit d'un statut du CRM Pro ni d'un devis (HYP-W19-SOURCE). Partners injoignable ou en `503` :
le CRM Pro l'affiche et n'enregistre rien, pas même un brouillon.

**9. Ce que l'API 3 ne transporte jamais.** Le nom du rôle du CRM Pro ; l'identité, le rôle ou la
population d'un autre occupant ; une donnée d'apporteur ; le nom ou le courriel du conseiller (DM-32
ne copie aucune autre donnée du CRM Pro que la référence) ; un mois ou une cause derrière
`non_disponible`.

**10. Exigences du rôle CRM.** Elles sont réalisées par la session du CRM Pro, dans son dépôt ; Partners
ne les teste pas, et elles conditionnent la validation du contrat par Williams :

- un rôle « commercial » NEUF, qui ne réutilise pas `operator` : sans export, sans suppression, sans
  accès en masse aux données personnelles ;
- une session de 12 heures au plus, expirée après 8 heures d'inactivité, et une reconnexion en
  3 gestes au plus ;
- aucun brouillon persistant, et aucune occupation affichée avant la réponse de Partners ;
- des cibles d'au moins 48 px et un corps de texte d'au moins 16 px ;
- le vocabulaire de REQ-JUR-044 : « prendre en charge », « à vous », « non disponible », et aucun mot
  du vocabulaire de l'apporteur ;
- la notice d'information et la déclaration de conflit d'intérêts présentées à la première connexion ;
- le durcissement multi-utilisateur du CRM Pro.

Les valeurs de session, de hors-ligne et d'accessibilité sont celles que le plan W19 tenait en
hypothèses avant la question 22.

**11. Gel et changement.** Le contrat est validé par Williams et l'ADR accepté AVANT toute ligne de
code du CRM Pro ; le gel est signalé sur le ticket #220. Tout changement ultérieur est une nouvelle
version de cet ADR, et une nouvelle version de chemin (`/v2/`) si la forme d'une route change.

## Conséquences

- SEC-34 réalise les trois routes, le jeton, le débit, le journal et les deux alertes, sans rien
  ajouter ; DM-30 et DM-31 fournissent les fonctions appelées ; DM-32 fixe la forme de la référence
  (chaîne opaque de 1 à 64 caractères `[A-Za-z0-9_-]`, unique) ; UX-P2-13 calcule `avis`.
- Le CRM Pro dépend de la disponibilité de Partners pour toute prise en charge : c'est le prix de la
  source unique. Aucun mode dégradé n'enregistre quoi que ce soit côté CRM.
- Une limite de Société basse peut gêner les conseillers quand ils sont nombreux. La relever est une
  décision datée de Will (HYP-W19-LIMITES), et elle relève d'autant la borne d'un CRM Pro compromis.
- Retour arrière : remplacer l'hypothèse de confiance par une assertion signée par conseiller
  demanderait une migration (DM-32), une seconde authentification côté CRM Pro et une version `/v2/`
  du contrat ; un ADR remplaçant celui-ci le dirait.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Une assertion signée par conseiller, vérifiée par Partners | C'est l'alternative de HYP-W19-IDENTITE-CRM, non retenue par défaut (question 4) : elle demande une seconde authentification du conseiller, et la limite fixe de la Société borne déjà le cas compromis. Elle reste la voie si la limite devait monter. |
| Une route dédiée pour l'avis d'échéance | Elle doublerait la surface de l'API sans rien servir que la liste ne porte déjà. |
| `non_disponible` pour une limite atteinte | Le conseiller croirait l'entreprise prise alors qu'elle est libre ; `limite_atteinte`, jugé avant la lecture du SIREN, ne révèle rien de lui. |
| Le « Vérifier » en `GET ?siren=` comme l'API 1 | Le SIREN tomberait dans les journaux d'accès de chaque intermédiaire ; le corps d'un `POST` n'y tombe pas. |
| Réutiliser le jeton de l'API 1 | Un jeton compromis ouvrirait les deux API ; et la révocation de l'un couperait l'autre. |
| Une version d'en-tête plutôt que de chemin | Une version de chemin se voit dans chaque journal et se route sans lire la requête. |

## Ce qui le vérifie

- **hors-code** — cet ADR est au statut `propose` : il fixe un contrat que SEC-34, DM-30, DM-31, DM-32
  et UX-P2-13 réaliseront, et aucune de ces tâches n'a encore de code ; ses assertions sont listées
  sous « Reste à faire » et s'écriront avec elles.

## Reste à faire

- **Validation** : relecture et décision de la lentille `schema` (A02), puis validation du contrat par
  Williams ; gel signalé sur le ticket #220.
- **Assertions à poser par SEC-34** (tests d'intégration écrits par un autre agent que l'auteur) :
  le jeton de l'API 1 refusé ici et celui-ci refusé ailleurs ; sans jeton, une réponse identique à une
  route inexistante ; une clé d'idempotence rejouée rend la même réponse sans seconde écriture ; une
  référence inconnue, désactivée ou d'un autre rôle rend le même `403` ; N conseillers actifs, un appel
  chacun, refusés au-delà de la limite de la Société ; l'alerte de volume se lève sur un balayage
  réparti, condition HYP-W19-CSE non remplie.
- **Assertions à poser par DM-30 et DM-31** : `non_disponible` identique pour toutes les causes ;
  aucune réponse servie à un apporteur ne distingue un occupant conseiller (REQ-SEC-042).
- **À confirmer par Will** : la liste d'adresses autorisées, selon que le CRM Pro sort par une adresse
  fixe ; les valeurs de débit et de limite en `SSOT`, que SEC-34 et DM-30 chiffrent.
- **Mise en service** : liée à la condition HYP-W19-CSE ; la livraison des tâches n'en dépend pas.
