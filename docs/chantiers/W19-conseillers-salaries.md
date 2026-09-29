# Chantier W19 — conseillers salariés dans Partners : le plan à inscrire

> **Statut : PROPOSITION DE PLAN, pas encore au registre.** Ce fichier est la **source d'entrée** de
> deux tâches versées au backlog par la même PR : **GOV-112** (inscrire la décision, les hypothèses,
> les exigences et le glossaire) et **GOV-115** (verser les tâches W19, amender les tâches existantes,
> poser REQ-UX-047 sur les tâches d'écran). Il ne décide rien : le principe est la décision de Will du
> 2026-09-29, le plan est celui de l'architecte (A02) après cinq lentilles, et ce fichier le **transcrit**.
>
> **Pourquoi il existe.** `docs/DECISIONS.md`, `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md` ne s'écrivent
> que dans un lot dédié du `gardien-spec` lancé avec `--settings` surchargé (`docs/CONVENTIONS.md` §8,
> `docs/CHARTE-AGENTS.md` §9) ; aucun verbe hors dépôt ne sait encore **ajouter** une exigence à
> `docs/requirements.json` (docblock de `hors-depot/ajouter-entree.mjs`). Un plan qui ne vivrait que
> dans une note de session serait perdu : il vit donc ici, relu en PR, jusqu'à ce que GOV-112 et GOV-115
> l'aient versé dans les registres. **Après GOV-115, ce fichier est historique** : les registres font foi.
> Le JSON de l'architecte (`plan-final.json`, hors dépôt) n'est plus une référence : il compte 19
> questions et cite REQ-UX-047 dans les `reqs` de GOV-115 ; ce fichier et le registre font foi.
>
> **Le lot dédié n'existe pas encore (constaté le 2026-09-29).** Aucune commande, aucun fichier de
> réglages ne lance le `gardien-spec` avec `--settings` surchargé ; `partners/ADR-0019` range ce
> mécanisme en « reste à faire ». **GOV-116** est réservé à la tâche qui l'écrira et le testera ; elle
> n'est pas versée ici. GOV-112, et toute tâche W19 qui écrit `docs/GLOSSAIRE.md`, `docs/DECISIONS.md`
> ou `docs/PRESEANCE.md`, dépendent donc de ce mécanisme **ou** d'une écriture humaine par Williams.
>
> **Identifiants.** Tous les identifiants de tâche, d'exigence et d'hypothèse ci-dessous sont des
> **jetons provisoires**, libres à `c60e2f3` (vérifié le 2026-09-29), fixés à la dernière fusion de
> `main` dans la branche de GOV-112 et GOV-115 (`pnpm vues:fusion`, `docs/PROTOCOLE-FUSION.md`, jamais
> un rebase commit par commit), dépendances et acceptances comprises.
>
> **Preuves.** Chaque constat cite sa preuve. Les preuves en `chemin:ligne` sont celles du plan de
> l'architecte, relevées à `c60e2f3` pour ce dépôt et à `a12e58165` pour axion-ia ; elles se rejouent,
> elles ne se recopient pas. Une rectification relevée à la transcription : le marqueur des synonymes
> interdits est lu par `scripts/gates/gov-check.ts:269` (`MARQUEUR_SYNONYMES`), non `:268`.

## Sommaire

1. [Synthèse](#1-synthèse)
2. [Nom du rôle](#2-nom-du-rôle)
3. [La décision à tracer (§1 et §2 de DECISIONS)](#3-la-décision-à-tracer)
4. [Exigences nouvelles et amendées](#4-exigences-nouvelles-et-amendées)
5. [Tâches nouvelles](#5-tâches-nouvelles)
6. [Tâches existantes à amender](#6-tâches-existantes-à-amender)
7. [Modifications du livré](#7-modifications-du-livré)
8. [Consignes aux auteurs en cours](#8-consignes-aux-auteurs-en-cours)
9. [Questions à Williams](#9-questions-à-williams)
10. [Chiffrage et effet sur les dates](#10-chiffrage-et-effet-sur-les-dates)
11. [Risques](#11-risques)
12. [Expérience par population](#12-expérience-par-population)

---

## 1. Synthèse

**Ce qui ne bouge pas.** Le socle tient :

- population XOR, avec la CHECK « une population » de SEC-17 ;
- `jugerSession` refuse une session de console (`src/server/auth/session.ts:92-95`) et la matrice refuse
  par défaut (`src/server/roles/matrice.ts:8-11`) ;
- une seule table `attributions` avec le même index d'occupation par SIREN ;
- deux chaînes d'argent disjointes ;
- tout le travail propre aux salariés part en phase 2.

**Le changement de fond (juriste, gardien-spec, sécurité).** Le plan initial assimilait la Société à
« un autre Apporteur » (art. 3.5) et promettait une indistinction octet à octet. Cette voie avait trois
défauts : elle place la Société en concurrente de ses cocontractants ; elle fuit par l'état `active`
immédiat ; l'API 1 ne peut pas la tenir.

Elle est remplacée par la voie de la transparence contractuelle, hypothèse par défaut : un nouvel
art. **3.3 c)**. L'entreprise que la Société a elle-même « prise en charge » (sens défini au §2, distinct
de la prise en charge financière de l'art. 9) est une **antériorité de la Société**. L'apporteur reçoit alors le refus motivé et contestable qui existe déjà
(texte `DEJA_CONNUE`, `src/content/micro-copy/espace/issues-depot.ts:55-63`, partagé par les
antériorités, REQ-UX-002) :

- `IssueDepot` et `MotifRefusDepot` gagnent une valeur `anteriorite_suivi`, par décision tracée ;
- la contestation reçoit une attestation d'antériorité tirée du journal chaîné.

L'identité et la nature salariée du préposé ne sont jamais révélées. Il n'y a plus de file d'apporteurs
derrière la Société.

**Vocabulaire distinct de celui de l'apporteur (REQ-JUR-044)** : « prendre en charge une entreprise »,
événement `prise_en_charge_par_la_societe`. Cela lève aussi le conflit avec GLOSSAIRE §6 (déposer ou
déclarer).

**Abus de la Société fermés (sécurité, gardien)** :

- la Société compte comme UN seul porteur pour la non-reconduction et la carence, après toute libération ;
- la fenêtre de 15 jours du rang 1 est fermée aux conseillers ;
- délai après une vérification ou un dépôt refusé d'un apporteur, et clause de non-exploitation au contrat ;
- limites par conseiller et par Société (jamais « quota », mot du lexique interdit) ;
- un déclencheur SQL impose que le porteur soit un `conseiller_salarie` actif, et un porteur ne change pas de rôle ;
- quatre yeux sur les plans de part variable, les réaffectations et l'export paie ;
- le conseiller voit « non disponible », sans mois ;
- session de console courte, redirection bornée, `sessionVersion` pour la console.

**Droit du variable (juriste)** : un plan n'est actif qu'après son acceptation par le salarié et n'est
jamais rétroactif ; le sort du variable à la sortie et la régularisation sont posés en HYP ; information
du CSE, ou constat écrit qu'il n'y en a pas, avant la mise en service (HYP-W19-CSE) ; les points de droit
social sont soumis à Williams et ne sont pas tranchés par le juriste. Un avis en droit social n'intervient
que si Williams accorde l'exception de la question 13 à « pas d'avocat sur le projet » (`docs/DECISIONS.md`
§5) ; sinon, arbitrage de Williams, option conservatrice par défaut.

**L'exigence d'expérience de Williams est outillée et chiffrée pour TOUS les rôles** :

- REQ-UX-047 CITE REQ-UX-017, REQ-UX-018 et REQ-UX-019 au lieu de les contredire. Budgets en SSOT,
  mesurés par une fixture (QA-T33), temps réel de première action, test de premier usage par une personne
  du public.
- Accueil par rôle ET par phase, avec un repli guidant : pas de 404 pour le comptable, le lecteur ni
  l'admin en phase 1.
- Des producteurs de maquettes : UX-P1-18, UX-P1-19, UX-P2-14, UX-P2-15 et UX-P3-13.
- Cadre de console réactif à 375 px, code à 6 chiffres à la connexion de console, recherche globale et
  page « Votre rôle ».
- Une passe `reecrire-champ` pose REQ-UX-047 sur les tâches d'écran `a_faire` existantes, avant que
  GOV-113 rougisse : 45 à `c60e2f3` (46 mesurées, moins JUR-T04, nommée parce que sa branche
  `t/jur-t04` est en travail). La liste est re-mesurée à la fusion de `main` : la scission de JUR-T04
  décidée par Williams le 2026-09-29 crée une tâche d'écran `/confidentialite` qui y entre.

**Coût : 35,95 j** (16,5 dans le plan initial), plus 0,5 j optionnel (JUR-T03) : 15,7 j de corrections
transverses pour tous les rôles, dont 4,2 j d'ajustement REQ-UX-047 des écrans existants ; 20,25 j propres
aux salariés. Chemin critique : 22,00 → 22,75 j (DM-07 +0,5, DM-08 +0,25).

## 2. Nom du rôle

Identifiant d'enum `conseiller_salarie`, ajouté à `ConsoleRole` par SEC-31 (phase 2). Libellé de console
« Conseiller salarié », pluriel « Conseillers salariés ». Terme de glossaire « conseiller salarié ». Son
acte s'appelle « prendre en charge une entreprise » (terme de glossaire « prise en charge (Société) »,
événement `prise_en_charge_par_la_societe`). Il ne « dépose » ni ne « déclare » jamais : ces verbes
restent ceux de l'apporteur (REQ-JUR-044, GLOSSAIRE §6).

**Termes à verser au GLOSSAIRE §8 par GOV-112, libellés fixés ici une fois pour toutes :**

- **« conseiller salarié »** : utilisateur de console au rôle `conseiller_salarie`, préposé de la Société.
- **« prise en charge (Société) »** : l'acte horodaté par le serveur par lequel un préposé de la Société
  inscrit une entreprise comme connue de la Société, au sens de l'art. 3.3 c) du contrat. **Ce n'est
  jamais la prise en charge financière** d'une prestation par un financeur (OPCO, CPF), sens que le
  contrat emploie déjà à l'art. 9 (`docs/contrat/CONTRAT-APPORTEUR-V1.md:490` et `:493`) : ce sens
  financier va dans la colonne « Interdits » de l'entrée. Le libellé de l'entrée est toujours « prise en
  charge (Société) » (titres et acceptances de GOV-112 compris) ; en prose, « pris en charge par la Société »
  reste une tournure, jamais un second terme ; « prise en charge du suivi » n'est jamais employé.
- **« plan de part variable »** : terme canonique de la rémunération variable d'un conseiller. Le mot
  « barème » n'est pas employé dans ce sens : GLOSSAIRE §8 range déjà « barème maison » parmi les
  interdits de « grille » (`docs/GLOSSAIRE.md:319`).
- **Les cinq valeurs d'`ActiviteFacturation`** : `formation`, `un_a_un`, `audit`, `implementation`,
  `site_web` (axion-ia `prisma/schema.prisma:4930-4936` à `a12e58165`, relues au versement). L'avenant
  A01 de DM-04 (commit `46968b5`, branche locale `t/dm-04`) les laisse au gardien-spec.

**Pourquoi ce nom.**

1. Il ne contient aucune forme des familles de portée `depot` du lexique interdit
   (`src/domain/lexique/lexique-interdit.ts:83-126`). Il ne dépend donc d'aucune limite de lecture de
   `gov:lexique` ; GOV-114 durcit la garde sur le patron de GOV-109, formes tenues hors dépôt.
2. Il ne reprend aucun interdit de l'apporteur au GLOSSAIRE §8 (`docs/GLOSSAIRE.md:310`). Il évite
   « équipe » (HYP-W15-EQUIPE) et « affaires », trop proche d'« apporteur d'affaires » pour un public
   sans formation.
3. « salarié » dit la nature de la personne. Ce mot n'appartient à aucune famille de portée `depot`.

**« conseiller » existe déjà dans les dépôts, avec d'autres sens** : `docs/tiers/banque.md:96` (« le
conseiller de l'établissement »), et environ 62 lignes d'axion-ia au sens de « vous conseiller »
(`src/components/services/formation/FormationContactBand.tsx:46`, côté axion-ia). Il n'existe nulle part
comme nom de rôle. La famille `population_interne` de GOV-114 ne vise donc que les formes composées,
jamais « conseiller » seul.

**Piège de glossaire (vérifié).** `gov:termes-interdits` lit toute ligne du glossaire qui porte le
marqueur des synonymes interdits et applique chaque terme entre accents graves comme un interdit sec sur
`src/**` (`scripts/gates/gov-check.ts:269` et `:280-318`). Or `src/domain/lexique/lexique-interdit.ts`
contient le mot que l'on veut interdire. La ligne §7 du rôle ne porte donc **ni ce marqueur ni d'accents
graves**. Les interdits (commercial, vendeur, équipe, apporteur, chargé d'affaires) vont dans la colonne
« Interdits » de l'entrée §8, qui n'est pas exercée.

**Statut.** Hypothèse par défaut HYP-W19-NOM-ROLE (réversibilité `migration`, à trancher avant SEC-31).
Alternatives proposées à Williams : `vendeur_salarie`, ou `charge_affaires` (déconseillé).

## 3. La décision à tracer

À écrire par la session `gardien-spec` que Williams lance, dans GOV-112 : `docs/DECISIONS.md` est en
`deny` Write/Edit (`.claude/settings.json:96-103`). Ce lancement suppose le mécanisme du lot dédié
avec `--settings` surchargé, qui n'existe pas encore (GOV-116, réservé) ; à défaut, Williams écrit
lui-même. Aucun mot de la doctrine de `gov:publication` (`scripts/gates/gov-publication.ts:33-41`) ne
doit y figurer.

### §1 — une ligne, cinq colonnes

**Seul le principe est tranché** par Williams le 2026-09-29. Chaque modalité est une hypothèse par
défaut, lue « par défaut : … (HYP-W19-X) », et reste ouverte tant que la question du §9 qui la vise n'a
pas reçu de réponse datée.

| Id | Décision | Contenu | Phase | Propriétaire |
| --- | --- | --- | --- | --- |
| **W19** ✅ *principe tranché 2026-09-29* | Conseillers salariés dans Partners, strictement séparés des apporteurs | **Principe tranché par Will le 2026-09-29 : deux populations, un seul registre d'entreprises, deux chaînes d'argent, cloisonnement strict entre les deux populations.** Les modalités ci-dessous sont des hypothèses par défaut, non tranchées. **(a) Rôle et cloisonnement.** Par défaut : le salarié est un utilisateur de console au rôle `conseiller_salarie` (HYP-W19-NOM-ROLE). Par défaut : il n'entre jamais dans l'espace, n'a aucun droit hérité et ne voit que ses prises en charge (HYP-W19-VISIBILITE). Aucun écran, e-mail ni document de l'espace ne le nomme, ne le compare ni ne le mesure. Par défaut : seuls le contrat et la notice RGPD en parlent, au titre des « préposés de la Société » et du « personnel de la Société » (REQ-JUR-043, REQ-SEC-041, REQ-SEC-042 ; question 14). **(b) Une seule base d'entreprises.** Même base, même index d'occupation par SIREN, même horodatage serveur (REQ-DM-048 ; par défaut : HYP-W19-PORTEUR). L'acte du conseiller est une prise en charge (Société), au vocabulaire distinct (REQ-JUR-044). Par défaut : vue par l'apporteur, c'est une antériorité de la Société (art. 3.3 c, HYP-W19-CONCOURS ; question 2), avec refus motivé et contestable. Par défaut : mêmes bornes que l'apporteur, la Société comptant comme un seul porteur, avec un délai d'attente, une fenêtre réservée au rang 1, des limites par conseiller et par Société et une clause de non-exploitation (HYP-W19-CYCLE, HYP-W19-CARENCE, HYP-W19-LIMITES, HYP-W19-NON-EXPLOITATION, HYP-W19-DEPART, HYP-W19-SOURCE ; questions 4 et 5). **(c) La part variable passe par un export paie.** Aucune ligne de commission, aucun relevé, aucune autofacture, aucun lot, aucune DAS2, aucun parrainage. Par défaut : le plan de part variable est accepté par le salarié, jamais rétroactif, validé à quatre yeux, et vit hors dépôt ; il n'est jamais indexé sur l'activité des apporteurs (REQ-ARG-036, REQ-ARG-037, REQ-ARG-038, REQ-JUR-045, HYP-W19-PART-VARIABLE, HYP-W19-VARIABLE-SORTIE, HYP-W19-REGULARISATION, HYP-W19-QUATRE-YEUX, HYP-W19-FORMAT-PAIE, HYP-W19-DROITS-PAIE ; questions 6 à 8). **(d) Protections de l'apporteur inchangées.** REQ-JUR-*, garde lexicale, aucune instruction, aucun contrôle d'activité. Par défaut : une personne n'appartient qu'à une seule population (REQ-CPL-030, HYP-W19-ANTI-CUMUL, HYP-W19-ROLE-MOUVANT ; question 9). Par défaut : aucun objectif, chiffré ou non, ni classement de conseiller (HYP-W19-OBJECTIFS ; question 10). Par défaut : le CSE est informé, ou un constat écrit dit qu'il n'y en a pas, avant la mise en service (HYP-W19-CSE ; question 14). **(e) Exigence transverse.** Chaque rôle a une navigation dérivée de la matrice, un accueil par phase et des écrans dont le budget est mesuré et le premier usage testé (REQ-UX-047, REQ-UX-048). Par défaut : HYP-W19-SESSION-CONSOLE, HYP-W19-HORS-LIGNE et HYP-W19-A11Y-CONSEILLER (questions 15, 16 et 18) | 1 et 2 (principe tranché, modalités par défaut) | Will |

### §2 — vingt-trois lignes, sept colonnes

| Id | Décision | Hypothèse appliquée | Réversibilité | Phase | À trancher avant | Tranchée |
| --- | --- | --- | --- | --- | --- | --- |
| HYP-W19-NOM-ROLE | Nom du rôle (a) | `conseiller_salarie`, « Conseiller salarié » ; acte « prendre en charge » | migration | 2 | SEC-31 | — |
| HYP-W19-PORTEUR | Porteur (b) | Une seule table `attributions`. `apporteur_id` XOR `utilisateur_console_id` (patron SEC-17). Grille présente si et seulement si le porteur est un apporteur. `CanalDepot.console` si et seulement si le porteur est un conseiller, si et seulement si `jeton_depot_id IS NULL`. Un déclencheur exige un `conseiller_salarie` non désactivé | migration | 1 | DM-07 | — |
| HYP-W19-CONCOURS | Concours avec l'apporteur (b) | Art. 3.3 c) : une prise en charge horodatée par la Société est une antériorité de la Société pendant sa durée. Refus motivé et contestation sous 15 jours avec attestation d'antériorité du journal, sans identité. `IssueDepot` et `MotifRefusDepot` gagnent `anteriorite_suivi`, affichée avec le texte `DEJA_CONNUE`. Aucune file derrière la Société. Alternative non retenue : art. 3.5 avec indistinction | avenant | 1 | premier DocuSeal | — |
| HYP-W19-NON-EXPLOITATION | Non-exploitation (b) | La Société n'utilise ni les vérifications, ni les déclarations refusées ou en attente, ni les coordonnées déclarées par un apporteur pour prendre en charge une entreprise. Techniquement : délai `RESERVE_APRES_ACTE_APPORTEUR_JOURS` = 30 (SSOT) | avenant | 1 | premier DocuSeal | — |
| HYP-W19-CYCLE | Cycle (b) | Naissance directement `active` par `prise_en_charge_par_la_societe` (`confirmeeAt` = `deposeeAt`). Ni qualification, ni confirmation tacite, ni `non_confirme`, ni gel, ni `figee_resiliation`, ni contestation, ni file. Péremption de 90 jours depuis `deposeeAt`, jamais suspendue. Fenêtre de 12 mois sans reconduction. Prolongation W9 identique à celle de l'apporteur. Hors palier, taux et capacité. Les bornes de 90 jours et de 12 mois s'écrivent aussi au contrat (JUR-T31 (2)) : après signature, les changer demande un avenant | migration | 1 | DM-08 ; premier DocuSeal | — |
| HYP-W19-CARENCE | Délai d'attente (b) | Aucun conseiller ne prend en charge un SIREN libéré depuis moins de `CARENCE_CONSEILLER_JOURS` = 90, quel que soit le porteur sortant, la Société comptant comme un seul porteur. SIREN fermé aux conseillers pendant la fenêtre `FILE_FENETRE_REDECLARATION_JOURS` d'un rang 1. Borne écrite au contrat v1 par JUR-T31 (2), son porteur : la changer après signature demande un avenant | avenant | 1 | premier DocuSeal | — |
| HYP-W19-LIMITES | Volume (b) | Limite par conseiller, égale à la limite de l'apporteur, et limite de la Société, égale à la limite de l'apporteur × nombre de conseillers actifs (SSOT). Anomalie console au-delà d'un seuil journalier. Le mot « quota » n'est jamais employé (famille `quota` du lexique interdit, `src/domain/lexique/lexique-interdit.ts:109-116`). Le contrat ne donne aucune valeur de limite : l'hypothèse reste un paramètre | paramètre | 2 | — | — |
| HYP-W19-DEPART | Départ (b) | À la désactivation, les prises en charge sans suite (ni rendez-vous ni devis) deviennent `perimee` sous 15 jours. Les autres courent jusqu'à leur terme, sans prolongation. Réaffectation seulement de conseiller à conseiller, par `admin`, motivée, validée à quatre yeux, notifiée au conseiller dépossédé. Jamais vers ou depuis un apporteur | migration | 1 | DM-08 | — |
| HYP-W19-SOURCE | Source (b) | Seule une prise en charge dans la console Partners occupe un SIREN. Rien n'est déduit du CRM ni d'un devis d'axion-ia. Contrat d'événements v2 inchangé | paramètre | 2 | — | — |
| HYP-W19-ROLE-MOUVANT | Changement de rôle (d) | Refus de quitter `conseiller_salarie` tant que la personne porte une attribution occupante. Refus d'y passer depuis `qualifieur` ou `admin` avant `DELAI_CHANGEMENT_POPULATION_JOURS` = 180 (SSOT). Contrôle anti-cumul à tout passage vers ce rôle | paramètre | 2 | — | — |
| HYP-W19-ANTI-CUMUL | Une personne, une population (d) | Contrôle croisé de l'empreinte de courriel (même domaine, `src/server/securite/pii.ts:298-302`), téléphone sur décision de Will. C'est un signal, pas une protection. Candidature d'un conseiller actif : BLOQUÉE jusqu'à revue humaine. Apporteur embauché : contrat résilié avant l'activation du compte, commissions acquises versées par la chaîne des apporteurs, aucune attribution transférée. Ni parrain ni filleul | paramètre | 2 | — | — |
| HYP-W19-PART-VARIABLE | Part variable (c) | Plan versionné par conseiller, jamais dans le dépôt. Actif seulement après `accepte_at` et l'empreinte du document présenté. Date d'effet au moins égale à l'acceptation et au jour courant, et postérieure à la dernière période exportée. Fait générateur : `paiement.recu` sur une attribution du conseiller lui-même, jamais un agrégat du réseau. Aucune lecture de `COMMERCIAL_COMMISSIONS` ni du champ `commission` de `devis.signe` | migration | 2 | T-ARG-040 | — |
| HYP-W19-VARIABLE-SORTIE | Variable après départ (c) | Un encaissement postérieur au départ reste dû au sortant et part dans la dernière période ouverte, puis clôture. À confirmer par un avis en droit social si Williams accorde l'exception de la question 13 ; sinon arbitrage de Williams, option conservatrice par défaut (`docs/DECISIONS.md` §5) | migration | 2 | T-ARG-040 | — |
| HYP-W19-REGULARISATION | Avoir ou impayé (c) | Ligne négative reportée sur la période suivante, jamais sur un export figé, jamais exportée comme une retenue | paramètre | 2 | — | — |
| HYP-W19-QUATRE-YEUX | Séparation des fonctions (c) | Plan, réaffectation et validation de l'export : l'auteur et le validateur sont deux personnes distinctes, parmi les `admin` et `comptable` (patron REQ-CPL-010). Création d'un admin : validée par un autre admin s'il en existe un. Toute création d'admin ou de conseiller, et toute réaffectation, est notifiée à tous les admins | paramètre | 2 | — | — |
| HYP-W19-FORMAT-PAIE | Format (c) | CSV générique par période : matricule, période, rubrique, montant « à porter en paie », référence opaque. Empreinte stockée, ré-export identique à l'octet | paramètre | 2 | — | — |
| HYP-W19-DROITS-PAIE | Droits (c) | `action:exporter_paie` et `ecran:parts_variables` pour `admin` et `comptable`, avec step-up et journal. Le conseiller ne voit que sa propre part | paramètre | 2 | — | — |
| HYP-W19-VISIBILITE | Ce que le conseiller voit (a) | Ses prises en charge seulement. Pour le reste, « non disponible », SANS mois, SANS identité, stade ni population, pour toutes les causes. Pas de responsable des conseillers en V1 | paramètre | 2 | — | — |
| HYP-W19-OBJECTIFS | Pilotage (d) | Aucun objectif, chiffré ou non, ni classement de conseiller. Onglets séparés. Le lecteur ne voit que des agrégats, et une cellule de moins de 3 conseillers est masquée. Vue nominative réservée à l'admin, avec journal de lecture | paramètre | 3 | — | — |
| HYP-W19-CSE | Information préalable (d) | Information du CSE, ou constat écrit et daté par Will qu'il n'y en a pas, avant la mise en service de DM-30 et UX-P2-11. Aucun indicateur d'activité du conseiller n'est restitué | paramètre | 2 | DM-30 | — |
| HYP-W19-SESSION-CONSOLE | Session de console (e) | 12 heures au plus, expiration après 8 heures d'inactivité (SSOT `durees.ts`, sourcée). Pas d'option « rester connecté ». Reconnexion par lien ou code en au plus 3 interactions, qui ramène à l'URL demandée. REQ-SEC-003 recentrée sur l'espace | paramètre | 1 | — | — |
| HYP-W19-HORS-LIGNE | Conseiller sans réseau (e) | Pas de brouillon persistant : message clair, saisie gardée à l'écran, aucune occupation avant l'horodatage serveur | paramètre | 2 | — | — |
| HYP-W19-A11Y-CONSEILLER | Cibles et corps de texte du conseiller (e) | Écrans du conseiller et barre inférieure de la console quand le rôle est `conseiller_salarie` : cibles d'au moins 48 px, corps de texte d'au moins 16 px, valeurs en SSOT (`BUDGETS_UX`, `src/domain/seuils/ssot.ts`), citées et jamais recopiées par REQ-UX-047, UX-P1-16 et UX-P2-11. Les autres rôles de console gardent REQ-UX-018 | paramètre | 2 | — | — |

### Corrections du registre dans la même PR (GOV-112)

- HYP-C4 (`docs/DECISIONS.md:80`, « promotion automatique ») et PRESEANCE §3.2 alignés sur REQ-DM-004 ;
- GLOSSAIRE §8 « entreprise connue » (`docs/GLOSSAIRE.md:320`) aligné sur REQ-DM-029.

## 4. Exigences nouvelles et amendées

Les douze exigences nouvelles entrent dans `docs/requirements.json` par GOV-112, avec `taches: []` et
`phase: null` (la dérivation les remet d'équerre au versement des tâches, GOV-115). Les amendements
passent par `hors-depot/reecrire-champ.mjs`, avec motif et `--si-inchange`, **au mot près du texte
décidé** : ils ne s'écrivent donc qu'après la ligne W19 du registre.

### 4.1 Exigences nouvelles

**REQ-DM-048** — Le porteur d'une attribution est exclusif : soit un apporteur, soit un utilisateur de
console de rôle `conseiller_salarie` non désactivé.
- Le rôle est vérifié par un DÉCLENCHEUR à l'INSERT et à l'UPDATE du porteur. Un CHECK ne suffit pas : le
  rôle vit dans une autre table.
- Une seule table `attributions`, avec CHECK XOR, un index d'occupation unique par SIREN et l'horodatage de
  transaction (REQ-DM-005), communs aux deux porteurs.
- L'attribution du conseiller naît `active`. Sa péremption court depuis `deposeeAt`, sans suspension. Sa
  fenêtre de 12 mois n'est pas reconduite. W9 s'applique à l'identique.
- Elle n'entre jamais en file : CHECK `rang_attente IS NULL OR apporteur_id IS NOT NULL`, idem pour
  `peremption_suspendue_at`.
- Pour la non-reconduction et le délai d'attente, la Société compte comme UN seul porteur : aucun
  conseiller ne reprend un SIREN libéré depuis moins de `CARENCE_CONSEILLER_JOURS`, quel que soit le porteur
  sortant. Le SIREN est aussi fermé aux conseillers pendant la fenêtre de redéclaration d'un rang 1, et
  pendant `RESERVE_APRES_ACTE_APPORTEUR_JOURS` après une vérification ou un dépôt refusé d'un apporteur.
- Limites par conseiller et par Société (HYP-W19-LIMITES).
- Porteurs : DM-07, DM-08, DM-30.
- *Justification* : principe (b), avec les corrections de la sécurité et du gardien. Sans elles, un relais
  entre conseillers A → B → C reconstitue le « portefeuille permanent » que l'art. 3.4 bis interdit
  (`docs/contrat/CONTRAT-APPORTEUR-V1.md:163-169`). Un porteur de rôle quelconque, ou un porteur promu
  qualifieur, jugerait ses concurrents. La garde `cibleDeLIndex` ne lit qu'une table
  (`scripts/gates/schema-enums.ts:348-353`).

**REQ-SEC-041** — Le rôle `conseiller_salarie` n'a aucun droit existant de la matrice et aucun écran ni
aucune action sur les apporteurs : fiche, liste, lignée, notes, statistiques, exports, file, rattachement,
contestation, anomalie, suspension, gel, IBAN, lot, DAS2, vérifications d'apporteurs.
- Toutes ses lectures passent par `forConseiller(utilisateurConsoleId)`, avec l'identifiant pris de la
  session. La ligne d'un autre conseiller rend un 404 identique.
- Aucun `decide_par_id`, `traite_par_id` ni `repondue_par_id` ne désigne un conseiller (déclencheur).
- Changement de rôle : on ne quitte pas `conseiller_salarie` en portant une attribution occupante, et on n'y
  entre pas depuis qualifieur ou admin avant `DELAI_CHANGEMENT_POPULATION_JOURS`.
- Aucune lecture croisée de `verifications` entre populations.
- Porteurs : SEC-31, SEC-32, DM-12.
- *Justification* : la matrice ne connaît que des couples droit × rôle (`src/server/roles/matrice.ts:31-39`).
  Le rôle est relu à chaque requête (`src/server/roles/require-role.ts:70-73`) et il est modifiable
  (SEC-30). Un test ne tient pas face à un changement de rôle postérieur à l'écriture.

**REQ-SEC-042** — Aucune réponse de l'espace ne révèle l'identité, le rôle ni la nature salariée de la
personne qui a pris en charge une entreprise pour la Société.
- L'issue `anteriorite_suivi` et l'état de « Vérifier » d'un SIREN pris en charge par la Société sont
  identiques octet à octet à ceux d'une antériorité client ou devis : même texte `DEJA_CONNUE`, état
  `non_disponible`, pas de date. C'est vrai à J+0 comme après une prolongation W9.
- Aucune clé ni valeur de DTO de l'espace ne porte la population.
- L'API 1, servie à la Société elle-même, est HORS de cette égalité. Elle garde une forme identique et une
  sémantique écrite (REQ-INT-014).
- Porteurs : SEC-16, DM-30, DM-31, QA-T31.
- *Justification* : l'indistinction totale avec un apporteur était fausse par construction : REQ-UX-007
  n'affiche la date que pour `active`, et la Société naît `active`. L'API 1 ne pouvait pas y satisfaire
  (`src/server/integrations/api-entrante.ts:95-113`). La voie 3.3 c) s'aligne sur le précédent REQ-UX-002
  (« l'apporteur ne sait pas laquelle » des antériorités, `issues-depot.ts:54`).

**REQ-JUR-043** — Aucun écran, e-mail, notification, document ni export destiné à un apporteur ne nomme,
ne compare ni ne mesure un conseiller salarié.
- Exceptions EXPLICITES, par défaut et soumises à Williams (question 14) : le contrat (`docs/contrat/**`),
  qui parle des « préposés de la Société », écrit en toutes lettres pour ne pas se confondre avec les
  « préposés » de l'apporteur de l'art. 1 (`docs/contrat/CONTRAT-APPORTEUR-V1.md:92`), précédent qui
  mentionne déjà les salariés de la Société (`:84`) ; et la notice RGPD de l'apporteur, qui décrit la
  finalité « contrôle d'incompatibilité avec le personnel de la Société » sans nommer personne.
- Aucun tableau de console ne classe ensemble apporteurs et conseillers. Seuls des totaux par origine sont
  admis.
- Aucune action d'un conseiller ne produit de message vers un apporteur.
- Porteurs : GOV-114, JUR-T32, QA-T31.
- *Justification* : la version initiale interdisait ce que la transparence RGPD (finalité nouvelle du
  contrôle croisé, art. 13 et 6.4 RGPD, à confirmer) et l'art. 3.3 c) imposent de dire.

**REQ-JUR-044** — L'acte d'un conseiller n'emprunte ni le vocabulaire, ni le formulaire, ni les issues de
l'apporteur.
- Console : « prendre en charge une entreprise », événement `prise_en_charge_par_la_societe`, enum
  `IssuePriseEnCharge` distinct d'`IssueDepot`.
- Jamais « déposer », « déclarer », « réservée » ni « commission ».
- Au contrat, c'est une connaissance propre de la Société (art. 3.3 c), jamais « la déclaration d'un autre
  Apporteur ».
- Porteurs : DM-30, UX-P2-11, JUR-T31.
- *Justification* : indice de « service organisé » soulevé par le juriste (Cass. soc. 13 nov. 1996, à
  confirmer). Un processus au libellé identique rapprocherait l'apporteur du préposé. Le moteur
  d'anti-doublon reste commun, car c'est le principe (b).

**REQ-JUR-045** — Aucune rémunération de salarié, dans Partners comme dans axion-ia, n'est indexée sur
l'activité, le volume ou la performance des apporteurs. Le fait générateur du variable d'un conseiller est
une attribution qu'il porte lui-même. Porteurs : T-ARG-040 et JUR-T03 (extension, sous réserve de Williams).
- *Justification* : l'annonce publiée d'axion-ia `careers-gen/responsable-reseau-commercial.json` dit
  « variable indexé sur la performance du réseau », « tu fixes les objectifs ». `pricing.ts:828` (axion-ia)
  emploie « réseau commercial » pour désigner les apporteurs. C'est une preuve publique de direction du
  réseau.

**REQ-ARG-036** — La part variable vit dans des tables propres, avec une FK vers `utilisateurs_console`
seulement : `plans_part_variable`, `lignes_part_variable`, `exports_paie`, et `matricule_chiffre` sur
`utilisateurs_console`.
- LigneCommission, Relevé, Autofacture, LotPaiement, pain.001, DAS2, parrainage, repli à 60 jours et seuils
  de versement n'acceptent qu'un apporteur.
- Le plan de part variable ne dérive jamais de `COMMERCIAL_COMMISSIONS` et n'entre pas dans le dépôt.
- Ni plan, ni montant, ni matricule dans pino.
- Porteurs : T-ARG-040, QA-T32.
- *Justification* : principe (c). Les invariants d'argent sont écrits pour l'apporteur seul. Le matricule
  exporté n'existait dans aucun schéma (`prisma/schema.prisma:290-304`).

**REQ-ARG-037** — L'export paie est produit par période. Il est figé et haché, son ré-export est identique
à l'octet, et une régénération est motivée.
- Réservé à `admin` et `comptable`, avec step-up déclaré dans la matrice.
- Validé par une personne distincte de celle qui a modifié un plan ou réaffecté une attribution sur la
  période.
- Journalisé.
- Contenu : matricule, période, rubrique, montant « à porter en paie », référence opaque. Jamais une
  retenue, jamais sous `src/server/pdf/`, jamais envoyé par e-mail.
- Porteurs : T-ARG-041, UX-P2-10.
- *Justification* : principe (c) plus la séparation des fonctions (lentille sécurité, patron REQ-CPL-010,
  `docs/REQUIREMENTS.md:701` à `c60e2f3`).

**REQ-ARG-038** — Un plan de part variable ne prend effet qu'après son acceptation par le conseiller :
`accepte_at`, version et empreinte du document présenté.
- Sa date d'effet est au moins égale à l'acceptation et au jour courant, et postérieure à la dernière
  période exportée. Il n'est jamais rétroactif.
- Il est validé à quatre yeux.
- Les justificatifs par ligne (entreprise, devis, encaissement) sont conservés au moins pendant la durée de
  prescription salariale (3 ans, L.3245-1, à confirmer).
- Le sort des encaissements postérieurs au départ et des régularisations suit HYP-W19-VARIABLE-SORTIE et
  HYP-W19-REGULARISATION.
- Porteurs : T-ARG-040, T-ARG-042.
- *Justification* : lentille juriste (la rémunération contractuelle ne se modifie pas unilatéralement,
  jurisprudence de la chambre sociale, à confirmer) ; lentille sécurité (plan rétroactif) ; lentille
  complétude (fin de vie de l'argent non traitée).

**REQ-CPL-030** — Une personne n'est pas à la fois apporteur non résilié et `conseiller_salarie` actif.
- Contrôle croisé de l'empreinte de courriel à la création d'un utilisateur de console, à tout passage vers
  `conseiller_salarie`, et à la création ou à l'activation d'un apporteur.
- Une candidature correspondant à un conseiller actif est BLOQUÉE jusqu'à revue humaine : aucune
  activation, aucun DocuSeal.
- Un apporteur embauché voit son contrat résilié avant l'activation de son compte. Ses droits acquis
  (art. 4) sont versés par la chaîne des apporteurs.
- Ce contrôle est un signal, pas une protection. S'y ajoute une déclaration de conflit d'intérêts accusée à
  l'invitation.
- Aucune réponse ne révèle la population.
- Porteurs : SEC-31, SEC-33.
- *Justification* : l'unicité n'est vérifiée que table par table (`prisma/schema.prisma:178` et `:295`). Le
  téléphone n'existe pas pour la console. Les droits acquis sont au contrat
  (`docs/contrat/CONTRAT-APPORTEUR-V1.md:270-282`).

**REQ-UX-047** (transverse) — Toute tâche qui livre un écran (espace, console, conseiller) porte dans son
acceptance les huit points suivants.
1. Le geste principal et son budget, lus dans la SSOT `BUDGETS_UX` (`src/domain/seuils/ssot.ts`) :
   consultation ≤ 3 interactions, saisie ≤ 8. Une exigence existante plus stricte prime (REQ-UX-001,
   REQ-UX-021). Mesure par la fixture QA-T33.
2. Première action : visible sans défilement à 375×667 (espace, conseiller, console mobile) ou 1280×800
   (console), atteinte en ≤ 3 tabulations, cliquable en ≤ 2 s sur le profil réseau « 4G ralentie » défini
   dans `BUDGETS_UX` (débit et latence, sourcés, posés par GOV-113).
3. Cinq états : nominal, vide qui montre le geste suivant, chargement, erreur qui dit quoi faire, accès
   refusé (REQ-UX-019 amendée).
4. Libellés tirés de la micro-copy SSOT du public et des termes du glossaire, sans identifiant technique.
5. Accessibilité et cibles : REQ-UX-017 (espace) et REQ-UX-018 (console) s'appliquent telles quelles, dans
   les deux thèmes. Écrans du conseiller : les cibles et le corps de texte de HYP-W19-A11Y-CONSEILLER, lus
   dans `BUDGETS_UX`.
6. Maquette produite par le poste `ux-redaction` et validée dans `docs/maquettes/VALIDATION.md`.
7. Écrans principaux, déclarés par la colonne « écran principal » de `docs/CONSOLE-ROUTES.md` et de
   `docs/ESPACE-ROUTES.md` : test de premier usage. Une personne du public, qui n'a jamais vu l'outil,
   reçoit une consigne d'une phrase. On consigne le temps de première action (≤ 10 s), le temps total dans le
   budget, les hésitations et un verbatim. Par défaut (question 17) : si Williams fournit une personne du
   public, le test est joué par elle ; sinon, le test est joué par un agent qui n'a pas écrit l'écran et la
   trace consignée dit qu'aucune personne du public n'était disponible.
8. E-mails : un seul appel à l'action, libellé tiré de la SSOT, lien qui mène à l'écran utile.
- Porteurs de la garde : GOV-113, QA-T33.
- *Justification* : l'exigence de Williams. La version initiale recopiait et contredisait REQ-UX-017 et
  REQ-UX-018, ce que RM-01 et RM-10 interdisent ; elle ne mesurait ni un vrai temps ni la compréhension par
  un novice.

**REQ-UX-048** — Carte des routes unique pour la console (`docs/CONSOLE-ROUTES.md`) : route, écran, rôle,
phase et statut (prévue ou livrée), REQ, maquette.
- Navigation DÉRIVÉE des droits `ecran:*` de la matrice.
- Bureau : ≤ 7 entrées de premier niveau groupées par métier. Moins de 768 px : barre inférieure de ≤ 4
  entrées plus un menu, sans défilement horizontal à 320 px.
- Accueil par rôle ET par phase : la première route livrée de la liste de préférence du rôle. À défaut, un
  état vide guidant qui dit ce qui arrive et quand. Jamais de 404.
- Connexion propre à la console : lien et code à 6 chiffres, page « lien déjà utilisé ». Elle mène à
  l'accueil ou à l'URL demandée (chemin relatif `/console/`) en une action.
- Écran d'accès refusé qui explique quoi faire.
- Recherche globale bornée par la matrice.
- Page « Votre rôle » dérivée du GLOSSAIRE §7.
- Porteurs : SEC-29, UX-P1-16, UX-P1-18, UX-P1-20.
- *Justification* : `scripts/gates/etats-vides.ts:5` (« Aucune carte des routes de la console ») ;
  `docs/maquettes/file-qualification.html:800-806` montre les lots au qualifieur ; les accueils visés par le
  plan initial (lot, pilotage, alertes) n'existent qu'en phase 2 ou 3 (`docs/tasks.json`).

### 4.2 Exigences amendées

| Exigence | Amendement | Justification |
| --- | --- | --- |
| REQ-UX-019 | L'état vide déclaré par écran devient la déclaration des cinq états de REQ-UX-047 (point 3), pour l'espace et la console. `ux-exhaustivite` lit aussi `docs/CONSOLE-ROUTES.md`. | Pas deux standards (gardien-spec, lentille UX). La garde actuelle ne vérifie que l'état vide par route (`scripts/gates/etats-vides.ts:1-4`). |
| REQ-SEC-003 | La session de 30 jours et `apporteurs.sessionVersion` visent l'espace. La session de console suit HYP-W19-SESSION-CONSOLE (12 h au plus, 8 h d'inactivité), avec une `sessionVersion` sur `utilisateurs_console`, incrémentée au changement de rôle, à la désactivation et à la demande. | `src/server/auth/durees.ts:19` applique 30 jours aux deux populations. `jugerAcces` ne compare aucune version (`src/server/roles/require-role.ts:66-73`). Le conseiller travaille sur un téléphone qui peut se perdre. |
| REQ-SEC-023 | L'enum passe à `{ admin, qualifieur, comptable, lecteur, conseiller_salarie }`, sans aucun des sept droits réservés. Amendement daté W19, écrit **dans la PR de SEC-31**, avec l'enum, GLOSSAIRE l.124 et §7 (sans le marqueur des synonymes interdits). | `scripts/gates/schema-enums.ts:65-66` impose l'égalité entre l'enum et le glossaire. `gov-check.ts:269` transformerait un marqueur §7 en interdit sec sur `src/**`. |
| REQ-UX-002, REQ-SEC-022 | Ajout de la catégorie 3.3 c) : `anteriorite_suivi` dans `ISSUES_DEPOT`, `ISSUES_DE_REFUS` et `MotifRefusDepot`, affichée avec le texte commun `DEJA_CONNUE`, horodatage `rien_a_votre_nom`, avec lien de contestation. Écrit **dans la PR de DM-30**, qui ajoute la valeur. | `src/domain/depot/issue-depot.ts:3-10` aligne l'enum un pour un sur les articles 3.3 et 3.3 bis, et `ux-exhaustivite` le relit dans les deux sens. |
| REQ-UX-007 | Un SIREN pris en charge par la Société est rendu à l'apporteur comme une antériorité client : `non_disponible`, sans date. Cela ne tranche pas la contradiction 4 ou 5 états, que le gardien-spec règle avant SEC-16. | `docs/GLOSSAIRE.md:117` (4 états, un client existant rendu `non_disponible`) contre REQ-UX-007 (5 états). |
| REQ-DM-014 | « Contrat, Attribution *dont le porteur est un apporteur* et LigneCommission référencent une version » ; une attribution de conseiller ne référence aucune grille. | `COMMERCIAL_COMMISSIONS` est la grille des apporteurs (axion-ia `pricing.ts:808-809`). |
| REQ-DM-004, REQ-DM-007, REQ-DM-008, REQ-DM-009, REQ-DM-012, REQ-DM-042 | Une phrase de portée chacune. DM-004 : la file est réservée aux apporteurs, et aucune file ne se forme derrière une prise en charge de la Société (refus 3.3 c). DM-007 : pour un porteur conseiller, la péremption court depuis `deposeeAt`, sans suspension. DM-008 : qualification, `non_confirme` et gel ne concernent que l'apporteur. DM-009 : palier et taux se dérivent des seules qualifications d'apporteurs. DM-012 : la limite comptée sur l'identité concerne l'apporteur ; celle du conseiller suit HYP-W19-LIMITES. DM-042 : la confirmation tacite est réservée à l'apporteur. | Table un pour un demandée par le gardien-spec. Le texte de REQ-DM-012 (code de parrainage, jetons, quota) ne traite pas de la confirmation tacite. |
| REQ-DM-021, REQ-DM-043 | DM-021 : la résolution d'un encaissement aiguille d'abord selon le porteur ; un porteur conseiller délègue à la chaîne de part variable et crée zéro LigneCommission. DM-043 : l'annulation n'a lieu que si `connueDepuisAt < deposeeAt` ; pour un porteur conseiller, information en console seulement ; la contestation d'un refus `anteriorite_suivi` reçoit une attestation d'antériorité tirée du journal chaîné. | Évite l'auto-attribution par antériorité (lentille sécurité). Une contestation doit avoir une preuve (lentille juriste). |
| REQ-INT-014 | Une attribution de conseiller répond `attribuee`, avec `until` et `apporteurRef: null`, documenté comme « porté par la Société ». Jamais `libre`, jamais un champ de plus. Le consommateur axion-ia (INT-T07-A) ne calcule aucune commission d'apporteur et n'alerte pas « attribuée à un apporteur ». | Voie (i) retenue face à la contradiction relevée par deux lentilles : l'API 1 est servie à la Société elle-même (`api-entrante.ts:95-113`). |
| REQ-QA-016 | Les parcours du `conseiller_salarie` et le cadre de console à 375 px s'exécutent aussi sur mobile-safari et mobile-chrome. Un spec de `console/conseiller/**` sans projet mobile fait rougir la CI. | La console n'est jouée que sur bureau (`playwright.config.ts:40`). |
| REQ-GOV-031 | Extension : plans de part variable, montants et matricules des salariés n'entrent jamais dans le dépôt ni dans les journaux (valeurs factices dans les seeds). Témoin ajouté à `gov:publication`. | W13 couvre l'économie du réseau, pas la paie ; une rémunération individuelle est une donnée personnelle. |
| REQ-SEC-030, REQ-CPL-009 | SEC-030 : quatre traitements, dont un dédié aux conseillers ; le traitement des apporteurs gagne la finalité « contrôle d'incompatibilité avec le personnel de la Société ». CPL-009 : 5e objet de l'AIPD, « gestion des prises en charge et calcul de la rémunération variable des conseillers », signé avant la première prise en charge. Porteur : JUR-T32, **après la fusion de JUR-T04**. | L'intitulé initial « évaluation et surveillance de l'activité » contredisait HYP-W19-OBJECTIFS. `t/jur-t04:tests/unit/juridique/registre-rgpd.spec.ts:258` (`toHaveLength(3)`) : le fichier n'existe que sur la branche poussée de JUR-T04, pas sur `main`. |
| REQ-UX-042, REQ-SEC-039, REQ-DM-023 | UX-042 : dimension « origine » dans chaque agrégat, onglets séparés ; le lecteur ne voit que des agrégats de conseillers, avec masquage sous 3. SEC-039 : écrire une note interne est refusé au conseiller. DM-023 : un conseiller n'est ni parrain ni filleul. | Ni force de vente unique reconstituée, ni mesure nominative d'un salarié pour un rôle qui n'en a pas besoin (lentille sécurité). |

**Réparties hors de GOV-112** (elles s'écrivent avec le code qui les porte) : REQ-SEC-023 (SEC-31),
REQ-SEC-030 et REQ-CPL-009 (JUR-T32), REQ-UX-002 et REQ-SEC-022 (DM-30).

## 5. Tâches nouvelles

Trente-deux tâches (le plan disait « les 31 autres » : on en compte 30, liste ci-dessous, rectifié à la
transcription). **GOV-112 et GOV-115 sont versées par la PR qui porte ce fichier** ; les trente autres le seront par GOV-115, en un seul `--depuis`, une fois les exigences qu'elles citent inscrites par
GOV-112 (`verser-tache` refuse une REQ inexistante). Chaque ligne donne : phase · poste · zone · schéma ·
sensible · hypothèses · externe · estimation · dépendances · exigences · chemins, puis l'acceptance.
**Règle de défaut, pour tout champ qu'une ligne ne donne pas** (champs obligatoires de
`scripts/lot/tasks.schema.json`) : repo `partners`, schema false, sensible [], hyp [], externe null.

### Phase 0

> ⚠️ **Ordre imposé par une garde, mesuré à la transcription.** Dès que GOV-112 écrit les hypothèses de
> réversibilité `migration` ou `avenant`, `gov:hypotheses` exige qu'une tâche cite chacune dans son champ
> `hyp` (famille `decision_irreversible_sans_porteur`) ; or ces porteurs sont versés par GOV-115. **GOV-112
> et GOV-115 partent donc dans la même PR**, un commit par tâche, GOV-112 d'abord — comme GOV-098, qui a
> inscrit sa décision et versé ses tâches ensemble. Le plan de l'architecte les séparait.

#### GOV-112 — Inscrire la décision W19 : §1, 23 HYP, REQ nouvelles et amendées, glossaire (conseiller salarié, prise en charge (Société), plan de part variable, ActiviteFacturation)
- **Méta** : phase 0 · `gardien-spec` · zone gouvernance · repo partners · schema false · sensible [attribution, argent, auth] · hyp [] · externe null · 0,5 j · label `role:gardien-spec`
- **Deps** : — au registre. **Dépend du mécanisme du lot dédié avec `--settings` surchargé (GOV-116, réservé, non versé), ou d'une écriture humaine par Williams** des trois fichiers réservés · **Reqs** : REQ-GOV-015
- **Paths** : `docs/DECISIONS.md`, `docs/requirements.json`, `docs/GLOSSAIRE.md`, `docs/PRESEANCE.md`, `docs/TRACABILITE.md`, `docs/PLAN-STATE.md`, `docs/journal/`
- **Acceptance** : versée au registre, voir `docs/tasks.json`.

#### GOV-115 — Verser les tâches W19, amender les tâches existantes, poser REQ-UX-047 sur les tâches d'écran à faire
- **Méta** : phase 0 · `gardien-spec` · zone gouvernance · repo partners · schema false · sensible [] · hyp [] · externe null · 0,75 j · label `role:gardien-spec`
- **Deps** : GOV-112 · **Reqs** : REQ-GOV-015 (REQ-UX-047 n'existe pas encore et `reqs` n'est écrivable par aucun verbe après versement : GOV-115 la cite dans son acceptance, §6)
- **Paths** : `docs/tasks.json`, `docs/TASKS.md`, `docs/TRACABILITE.md`, `docs/paths-proposes.json`, `docs/PLAN-STATE.md`, `docs/journal/`
- **Acceptance** : versée au registre, voir `docs/tasks.json`.

### Phase 1

#### SEC-29 — Connexion de la console : lien et code à 6 chiffres, page « lien déjà utilisé », session courte, atterrissage direct et redirection bornée
- **Méta** : phase 1 · lead sécurité · zone securite · schema false · sensible [auth] · hyp [HYP-W19-SESSION-CONSOLE] · 1,25 j
- **Deps** : SEC-17, SEC-04, UX-P0-01, UX-P1-04, GOV-115, UX-P1-18, QA-T33 · **Reqs** : REQ-UX-048, REQ-UX-047, REQ-UX-015, REQ-SEC-003
- **Paths** : `src/server/auth/lien-magique.ts`, `src/server/auth/durees.ts`, `src/server/roles/require-role.ts`, `src/app/(console)/console/connexion/`, `src/server/notifications/table-ssot.ts`, `src/content/micro-copy/console/connexion.ts`, `tests/unit/securite/lien-magique-console.spec.ts`, `tests/integration/connexion-console.spec.ts`, `tests/e2e/console/connexion.spec.ts`
- **Acceptance** : TÂCHE SENSIBLE (auth). AUCUNE MIGRATION : `liens_magiques` et `sessions_espace` portent déjà `utilisateur_console_id` (SEC-17). (1) Port `trouverUtilisateurConsole(emailHash)`, route `/console/connexion` et gabarit `lien_magique_console` : un seul appel à l'action et un code à 6 chiffres, par le mécanisme d'UX-P1-04 réutilisé et non recopié. (2) Un compte désactivé ne reçoit rien. La réponse est indistincte, que l'adresse soit inconnue, désactivée ou appartienne à l'autre population. (3) Un lien ou un code consommé ouvre la session et REDIRIGE en une action vers l'accueil du rôle (UX-P1-16), ou vers l'URL demandée seulement si elle est relative, commence par `/console/`, sans `//` ni schéma. Témoins d'open redirect. (4) Page « lien déjà utilisé » avec « M'envoyer un nouveau lien », jamais une erreur brute. L'URL demandée est conservée à travers le code. (5) Durée de session selon HYP-W19-SESSION-CONSOLE, dans `durees.ts` (sourcée) : 12 h au plus, 8 h d'inactivité lue sur `lastSeenAt`. Pas de « rester connecté ». (6) Témoins à deux faces : un lien de console à `/connexion` n'ouvre rien (`lien-magique.ts:263` préservé), et inversement. (7) REQ-UX-047 : ≤ 2 interactions du clic dans l'e-mail à l'accueil, ≤ 3 par code (E2E mobile-chrome et bureau). Cinq états, REQ-UX-018, maquette UX-P1-18 validée.

#### SEC-30 — Administration des utilisateurs de console : invitation qui expire, rôle expliqué, désactivation immédiate, sessionVersion, journal, step-up, aucune auto-promotion
- **Méta** : phase 1 · lead sécurité · zone securite · schema true (label `schema`, seule de sa famille dans son lot) · sensible [auth] · hyp [HYP-W19-QUATRE-YEUX] · label `role:gardien-spec` pour `docs/GLOSSAIRE.md` (fichier réservé : lot dédié avec `--settings` surchargé, GOV-116, ou écriture humaine par Williams) · 1,5 j
- **Deps** : SEC-17, SEC-29, GOV-115, UX-P1-18 · **Reqs** : REQ-SEC-023, REQ-SEC-003, REQ-DM-024, REQ-UX-048, REQ-UX-047
- **Paths** : `prisma/schema.prisma`, `prisma/migrations/`, `src/domain/evenement/charges.ts`, `src/server/console/utilisateurs/`, `src/app/(console)/console/utilisateurs/`, `src/server/roles/matrice.ts`, `src/server/roles/require-role.ts`, `src/content/micro-copy/console/utilisateurs.ts`, `tests/integration/utilisateurs-console-administration.spec.ts`, `tests/unit/securite/matrice-des-roles.spec.ts`, `docs/GLOSSAIRE.md`
- **Acceptance** : ELLE ÉCRIT LE SCHÉMA. (1) Migrations additives : `AgregatJournal.utilisateur_console` par ADD VALUE, non employé dans la même migration (partners/ADR-0022 §13), et `utilisateurs_console.session_version`. GLOSSAIRE aligné dans la même PR, par le lot dédié (GOV-116) ou par Williams, jamais hors de ce cadre. Événement `utilisateur_console_modifie {de, vers, acteurId}` dans la même transaction que tout changement. (2) `sessionVersion` incrémentée au changement de rôle, à la désactivation et à la demande. `jugerAcces` la compare, et toutes les sessions tombent à la requête suivante (témoin). (3) Droits `ecran:utilisateurs_console` et `action:gerer_utilisateur_console` réservés à admin, avec step-up déclaré dans la matrice. Pas d'auto-changement de rôle (refus nommé). (4) Une invitation expire (SSOT). Toute création d'admin est notifiée à tous les admins. Elle est validée par un autre admin s'il en existe un (HYP-W19-QUATRE-YEUX). (5) L'écran de création dit en une phrase, pour chaque rôle, ce qu'il voit et ne voit jamais, dérivée du GLOSSAIRE §7. (6) Témoins : changement sans événement → transaction échouée ; auto-promotion → refus. (7) REQ-UX-047 : inviter en ≤ 4 interactions, désactiver en ≤ 3 (E2E). Cinq états, maquette UX-P1-18.

#### UX-P1-18 — Maquettes et carte des routes de la console : cadre (bureau et 375 px), connexion, utilisateurs, accès refusé, en-têtes filtrés par rôle
- **Méta** : phase 1 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will (validation groupée) · 1 j
- **Deps** : GOV-115 · **Reqs** : REQ-UX-048, REQ-UX-047, REQ-UX-018
- **Paths** : `docs/CONSOLE-ROUTES.md`, `docs/ESPACE-ROUTES.md`, `docs/maquettes/console-cadre.html`, `docs/maquettes/connexion-console.html`, `docs/maquettes/utilisateurs-console.html`, `docs/maquettes/acces-refuse.html`, `docs/maquettes/file-qualification.html`, `docs/maquettes/lot-paiement.html`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) `CONSOLE-ROUTES.md`, pendant d'`ESPACE-ROUTES` : route, écran, rôle, phase, statut prévue ou livrée, REQ, maquette, et une colonne « écran principal » (oui ou non) qui désigne les écrans soumis au test de premier usage (REQ-UX-047 point 7). Tout sous `/console/`. `ESPACE-ROUTES.md` reçoit la même colonne. (2) `console-cadre.html` en 1280×800 et 375×667 : ≤ 7 entrées sur bureau, barre ≤ 4 plus menu en mobile, instantané par rôle (qualifieur, comptable, lecteur, admin, conseiller prévu). Accueil de repli par rôle et par phase. (3) Les en-têtes de `file-qualification.html` et `lot-paiement.html` sont filtrés par rôle : le qualifieur ne voit plus les lots (`:800-806`), le comptable ne voit plus la qualification. (4) Chaque maquette montre ses cinq états, dans les deux thèmes, avec une micro-copy de console proposée. (5) Une séance de validation groupée de Will est planifiée. Ses lignes sont posées dans `VALIDATION.md`.

#### UX-P1-19 — Maquettes des écrans de console de la phase 1 : file, fiche de qualification, apporteurs (liste et fiche), attributions et contrats, fiche prospect
- **Méta** : phase 1 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · 1,5 j
- **Deps** : UX-P1-18 · **Reqs** : REQ-UX-047, REQ-UX-018, REQ-UX-021
- **Paths** : `docs/maquettes/fiche-qualification.html`, `docs/maquettes/apporteurs.html`, `docs/maquettes/apporteur-fiche.html`, `docs/maquettes/attributions-contrats.html`, `docs/maquettes/fiche-prospect.html`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Une maquette par écran de console de la phase 1 listé dans `CONSOLE-ROUTES` : UX-P1-06, UX-P1-07, UX-P1-12, UX-P1-13, EXT-T02a. La liste est rapprochée de la carte et tout écart est nommé. (2) Chacune montre son geste principal et son budget (REQ-UX-021 : fiche de qualification en ≤ 6 interactions), ses cinq états et ses deux thèmes, avec des libellés tirés du glossaire. (3) Aucune phrase « l'apporteur verra » sur une entreprise prise en charge par la Société. (4) Validation groupée de Will, dans `VALIDATION.md`.

#### UX-P1-16 — Cadre de la console : navigation dérivée de la matrice, réactive à 375 px, accueil par rôle et par phase, accès refusé
- **Méta** : phase 1 · lead console · zone console · schema false · sensible [auth] · 1,5 j
- **Deps** : SEC-29, SEC-17, UX-P0-03, GOV-113, UX-P1-18, QA-T33 · **Reqs** : REQ-UX-048, REQ-UX-047, REQ-UX-018, REQ-UX-019
- **Paths** : `src/app/(console)/console/layout.tsx`, `src/app/(console)/console/page.tsx`, `src/app/(console)/console/acces-refuse/page.tsx`, `src/components/console/navigation.tsx`, `src/server/console/navigation.ts`, `src/server/roles/matrice.ts`, `src/content/micro-copy/console/`, `tests/unit/console/navigation-par-role.spec.ts`, `tests/e2e/console/atterrissage.spec.ts`
- **Acceptance** : (1) Droits `ecran:*` ajoutés à la matrice pour les écrans de la phase 1. La navigation est DÉRIVÉE de ces droits. Témoin : ajouter un droit fait apparaître l'entrée, sans autre modification. (2) Bureau : ≤ 7 entrées groupées. Moins de 768 px : barre ≤ 4 entrées plus menu, cibles ≥ 44 px (REQ-UX-018), et celles de HYP-W19-A11Y-CONSEILLER (lues dans `BUDGETS_UX`) quand le rôle est `conseiller_salarie`, 320 px sans défilement horizontal. Instantanés par rôle à 1280 et à 375. (3) L'accueil est la première route LIVRÉE de la liste de préférence du rôle, lue dans `CONSOLE-ROUTES` : qualifieur → file ; admin → « à traiter aujourd'hui », repli sur Utilisateurs ; comptable → lot du mois, repli sur un état vide guidant qui dit « arrive en phase 2 » ; lecteur → pilotage, repli sur Apporteurs en lecture seule si le droit existe. Test : pour chaque rôle et chaque phase, l'accueil résout vers une route livrée ou un repli déclaré, jamais un 404. (4) L'écran d'accès refusé dit ce que l'utilisateur peut faire et à qui s'adresser. États vides en micro-copy de console. (5) REQ-UX-047 : première action utile en ≤ 1 interaction depuis l'accueil, première action cliquable en ≤ 2 s (QA-T33). REQ-UX-018 dans les deux thèmes.

#### UX-P1-20 — Recherche globale de la console bornée par les droits, et page « Votre rôle »
- **Méta** : phase 1 · lead console · zone console · sensible [rgpd] · 0,75 j
- **Deps** : UX-P1-16, SEC-08, UX-P1-12 · **Reqs** : REQ-UX-048, REQ-UX-047
- **Paths** : `src/components/console/recherche.tsx`, `src/server/console/recherche.ts`, `src/app/(console)/console/votre-role/page.tsx`, `tests/integration/recherche-console.spec.ts`
- **Acceptance** : (1) Un champ de recherche dans le cadre, avec le raccourci « / ». Il cherche par SIREN, par nom d'entreprise et, pour un apporteur, par courriel exact via l'empreinte (SEC-08). Aucune recherche sur un nom chiffré. (2) Les résultats sont filtrés par la matrice et la couche d'accès. Témoin : un rôle sans droit sur les apporteurs n'en voit aucun. (3) La page « Votre rôle » est dérivée du GLOSSAIRE §7, jamais retapée. (4) REQ-UX-047 : de n'importe quel écran à une fiche en ≤ 3 interactions. État « aucun résultat » guidant, cinq états.

#### UX-P1-17 — Micro-copy de l'antériorité : le texte DEJA_CONNUE couvre la prise en charge (Société) de l'art. 3.3 c), sans révéler qui
- **Méta** : phase 1 · `ux-redaction` · zone espace · label `role:ux-redaction` · revue juriste · externe will · 0,5 j
- **Deps** : UX-P0-01, GOV-115, JUR-T31 · **Reqs** : REQ-SEC-042, REQ-UX-002, REQ-JUR-043
- **Paths** : `src/content/micro-copy/espace/issues-depot.ts`, `docs/maquettes/deposer.html`, `docs/maquettes/entreprise.html`, `docs/maquettes/VALIDATION.md`, `tests/unit/espace/vocabulaire-et-micro-copy.spec.ts`
- **Acceptance** : CAS HYP-W19-CONCOURS par défaut (3.3 c). (1) `DEJA_CONNUE.pourquoi` (`issues-depot.ts:55-63`) reste vrai pour les trois antériorités sans les distinguer. Proposition : « Axion-IA connaissait déjà cette entreprise avant votre dépôt (contrat, article 3.3). » Il garde le lien de contestation. Jamais le verbe « suivre » pour une entreprise (relecture juridique du 2026-09-19, `issues-depot.ts:7`, `vocabulaire.ts:9-11`). (2) `dejaReservee` (`vocabulaire.ts:39`) est inchangé : seul un apporteur occupe au sens de l'espace. (3) Test : aucun texte de `src/content/micro-copy/espace/**` ne contient un nom de rôle de console ni une forme composée du nom du rôle (famille `population_interne` de GOV-114) ; « salarié » et « conseiller » seuls ne sont pas visés. Témoin vert : « former ses salariés » (`etats-vides.ts:24`) passe. Témoin rouge : « suivi », « suivie » ou « suivait » dans `issues-depot.ts` fait rougir. (4) Will dit si ce changement de micro-copy est substantiel. S'il l'est, revalidation groupée le même jour, pour ne pas bloquer UX-P1-01/02. CAS ALTERNATIF (3.5, indistinction) : l'écran reprend les formules existantes `FORMULES.dejaReservee` et `FORMULES.finDuDroit` (`vocabulaire.ts:39-40`), sans nouvelle tournure ni « suivre », avec les maquettes entreprise, deposer et mes-entreprises revalidées.

#### GOV-113 — Garde UX des écrans : REQ-UX-047, maquette validée et cinq états pour toute tâche d'écran, console comprise ; BUDGETS_UX en SSOT
- **Méta** : phase 1 · A01 gouvernance · zone gouvernance · label `role:gardien-spec` pour `gates.json` · 0,75 j
- **Deps** : GOV-115 · **Reqs** : REQ-UX-047, REQ-UX-019
- **Paths** : `scripts/gates/maquettes-validees.ts`, `scripts/gates/ux-exhaustivite.ts`, `scripts/gates/ux-ecrans.ts`, `src/domain/seuils/ssot.ts`, `tests/unit/gouvernance/ux-ecrans.spec.ts`, `docs/gates.json`
- **Acceptance** : (1) Toute tâche `a_faire` ayant un chemin sous `src/app/(espace|console)`, ou désignée dans `ESPACE-ROUTES` ou `CONSOLE-ROUTES`, cite REQ-UX-047 et a une ligne de validation, quel que soit son préfixe. « Cite » se lit dans le champ `reqs` ; si Williams refuse la question 20, la garde accepte comme repli la citation de REQ-UX-047 dans l'acceptance, et ce repli est nommé dans son message. Le motif `IDENTIFIANT` (`maquettes-validees.ts:96`) est élargi. (2) `ux-exhaustivite` exige les cinq états et lit `CONSOLE-ROUTES`. (3) Chaque gabarit de `table-ssot.ts` a un seul appel à l'action, et son libellé vient de la SSOT. (4) `BUDGETS_UX` est une seule source, dans `ssot.ts` : 3 et 8 interactions, 3 tabulations, 2 s, 10 s ; le profil réseau « 4G ralentie » (débit descendant, débit montant, latence, chacun sourcé et daté) ; les cibles et le corps de texte de HYP-W19-A11Y-CONSEILLER. (5) Témoin à deux faces : une tâche de console sans validation rougit et nomme la tâche. (6) La garde n'est pas rétroactive sur les tâches fusionnées. Elle n'est armée qu'après la fusion de GOV-115. (7) L'entrée `gates.json` passe par `hors-depot/ajouter-entree.mjs`.

#### QA-T33 — Fixture Playwright « budget de gestes » : comptage des interactions, chrono de la première action, visible sans défilement
- **Méta** : phase 1 · lead qualité · zone qualite (test écrit par un autre agent que les auteurs des écrans) · 0,75 j
- **Deps** : GOV-113 · **Reqs** : REQ-UX-047, REQ-QA-016
- **Paths** : `tests/e2e/fixtures/budget-de-gestes.ts`, `tests/unit/qualite/budget-de-gestes.spec.ts`, `playwright.config.ts`
- **Acceptance** : (1) La fixture `budgetDeGestes` compte les clics, les saisies et les tabulations, et lit ses seuils dans `BUDGETS_UX`. (2) Chrono de la première action cliquable sur le profil « 4G ralentie » lu dans `BUDGETS_UX`. (3) Assertion « visible sans défilement » à 375×667 et 1280×800. (4) Témoin rouge : un parcours de 9 saisies échoue face au budget de 8. (5) Les projets mobile-safari et mobile-chrome sont disponibles pour `console/**`.

#### JUR-T31 — Contrat v1 : art. 3.3 c) « prise en charge (Société) », bornes de la Société, attestation d'antériorité, clause de non-exploitation, avant le premier DocuSeal
- **Méta** : phase 1 · juriste · zone juridique · hyp [HYP-W19-CONCOURS, HYP-W19-NON-EXPLOITATION, HYP-W19-CARENCE] · externe will · 0,75 j
- **Deps** : GOV-115 · **Reqs** : REQ-SEC-022, REQ-DM-048, REQ-JUR-044, REQ-DM-043
- **Paths** : `docs/contrat/CONTRAT-APPORTEUR-V1.md`, `tests/unit/contrat/contract-template-complete.spec.ts`
- **Acceptance** : (1) Nouvel art. 3.3 c) : « entreprise que la Société a elle-même prise en charge, par un acte horodaté par son serveur, pendant la durée de cette prise en charge ». L'article définit l'expression « prise en charge », au sens du présent article, et la distingue de la prise en charge financière d'une prestation par un financeur (art. 9). Jamais le mot « suivi ». Même refus motivé et même contestation sous 15 jours que 3.3. C'est la connaissance propre de la Société, jamais « la déclaration d'un autre Apporteur ». (2) Bornes de la Société, tous préposés confondus, écrites avec les variables du gabarit et jamais en dur (RM-10) : `{{PEREMPTION_JOURS}}` jours, `{{FENETRE_MOIS}}` mois, pas de reconduction, délai d'attente de `{{CARENCE_CONSEILLER_JOURS}}` jours après toute libération (variable nouvelle, déclarée au gabarit), SIREN fermé pendant la fenêtre d'un rang 1. (3) Clause de non-exploitation (HYP-W19-NON-EXPLOITATION). (4) La contestation reçoit une attestation d'antériorité : horodatage et empreinte du maillon, sans identité. Mention du mode de preuve face à la Société elle-même. (5) Le contrat dit « préposés de la Société » en toutes lettres, pour lever l'homonymie avec les « préposés » de l'apporteur à l'art. 1 (`CONTRAT-APPORTEUR-V1.md:92`), jamais le mot que GLOSSAIRE §8 interdit pour l'apporteur. (6) La variante 3.5 (indistinction) est écrite pour l'arbitrage. (7) `contract-template-complete.spec.ts` reste vert. (8) L'arbitrage de Will est daté dans la colonne « Tranchée » avant INT-T12. La note d'analyse hors dépôt sur l'indice de service organisé est relue. (9) Aucun point non sourcé présenté comme un fait.

#### JUR-T33 — Inventaire axion-ia des surfaces « commercial » : espace ressources, rôle d'un salarié qui fait des devis, champ commission, annonce, catégories d'emplois
- **Méta** : phase 1 · juriste · zone juridique · repo partners (lecture seule d'axion-ia, écriture dans `docs/tiers/` de ce dépôt ; ce n'est pas une tâche du poste A08) · aucune écriture dans axion-ia · 0,5 j
- **Deps** : GOV-115 · **Reqs** : REQ-JUR-043, REQ-JUR-045
- **Paths** : `docs/tiers/axionia-populations.md`
- **Acceptance** : Constat avec `chemin:ligne` pour chaque point : (1) destinataires de `DocumentRecipientRole.commercial` et `EquipeRole` (axion-ia `prisma/schema.prisma:8167-8170`, `visibility-mapping.ts:18`) ; (2) `AdminRole` qu'aurait un conseiller qui fait des devis, et son accès aux candidatures (axion-ia `prisma/schema.prisma:177-189`, `JobApplication.assignedToId`) ; (3) affichage du champ `commission` d'un `devis.signe` sur un SIREN pris en charge par la Société ; (4) état de l'annonce « Responsable du réseau commercial » et de `careers/categories.ts:88-96` ; (5) lien croisé ou SSO entre les deux consoles ; (6) le cadre « A postulé pour un poste de commercial SALARIÉ » de la fiche apporteur et `details.candidatureSalariee`, ajoutés par la PR axion-ia #1202 (fusionnée le 2026-09-28, incluse dans `a12e58165`) : la personne reste dans le tunnel des apporteurs, canal de mélange des deux populations ; on ne demande pas de défaire la PR. Chaque point se termine par une question à Williams, avec recommandation. Aucune modification d'axion-ia.

### Phase 2

#### GOV-114 — Durcissement lexical et étanchéité, sur le patron GOV-109 (témoins hors dépôt)
- **Méta** : phase 2 · A01 gouvernance + juriste · zone gouvernance · hyp [HYP-W19-OBJECTIFS] · 1 j
- **Deps** : GOV-112, GOV-109 · **Reqs** : REQ-GOV-017, REQ-JUR-037, REQ-JUR-043, REQ-JUR-034
- **Paths** : `scripts/gates/lexique-apporteurs.ts`, `src/domain/lexique/lexique-interdit.ts`, `tests/unit/gouvernance/lexique.spec.ts`, `scripts/gates/jur-aucun-agregat-reseau.ts`, `tests/unit/juridique/charte-relationnelle.spec.ts`, `scripts/lot/revues.ts`
- **Acceptance** : (1) `gov:lexique` voit les formes d'identifiants de `prisma/**` et `src/**` que la note confidentielle hors dépôt décrit, en réutilisant `segments()`. Les témoins sont des formes CONFIDENTIELLES tenues hors dépôt, comme GOV-109 : ni l'acceptance, ni les commits, ni le journal ne les énumèrent ni n'en décrivent le mécanisme. Une seule exception déclarée, datée et justifiée : l'identifiant importé de la grille axion-ia, sur son fichier d'import. (2) Famille `population_interne`, portée apporteur, sur les seules formes COMPOSÉES du nom du rôle, jamais sur « conseiller » seul (`docs/tiers/banque.md:96`). Le cliquet de longueur passe sciemment à 11. Témoin dans la micro-copy de l'espace ; témoin vert : « former ses salariés » (`etats-vides.ts:24`) passe. (3) `import_console` : aucun fichier de l'espace, des e-mails apporteur ni de `src/server/pdf/**` n'importe `src/server/console/**`, `src/domain/part-variable/**`, `src/domain/statistiques/**` ni `src/domain/pilotage/**`. Un témoin par chemin. (4) `revues.ts` : segments sensibles `paie`, `part-variable`, `conseiller`, `prise-en-charge`. (5) Aucune portée réduite.
- *Note de transcription* : le plan de l'architecte décrivait en clair, au point (1) et au §2, la classe de formes que la garde ne voit pas encore. Ce dépôt est public et la règle maison du chantier GOV-109 veut que ces formes restent hors dépôt ; la description est donc renvoyée à la note confidentielle.

#### SEC-31 — Rôle `conseiller_salarie` : enum, glossaire §7 sans marqueur, REQ-SEC-023, zéro droit hérité, règles de changement de rôle, déclaration de conflit d'intérêts, seed
- **Méta** : phase 2 · lead sécurité · zone securite · schema true (label `schema`) · sensible [auth] · hyp [HYP-W19-NOM-ROLE, HYP-W19-ROLE-MOUVANT] · label `role:gardien-spec` pour `docs/requirements.json` et pour `docs/GLOSSAIRE.md` (fichier réservé : lot dédié avec `--settings` surchargé, GOV-116, ou écriture humaine par Williams) · 0,75 j
- **Deps** : SEC-30, GOV-114, SEC-17 · **Reqs** : REQ-SEC-023, REQ-SEC-041
- **Paths** : `prisma/schema.prisma`, `prisma/migrations/`, `src/server/roles/matrice.ts`, `src/server/console/utilisateurs/`, `scripts/gates/roles.ts`, `tests/unit/securite/matrice-des-roles.spec.ts`, `tests/unit/gouvernance/glossaire-enums.spec.ts`, `prisma/seed/06-console.ts`, `docs/GLOSSAIRE.md`, `docs/requirements.json`
- **Acceptance** : (1) `ALTER TYPE "console_role" ADD VALUE 'conseiller_salarie'`. Dans la même PR : GLOSSAIRE l.124, ligne §7 SANS le marqueur des synonymes interdits ni accents graves (`gov-check.ts:269`), et REQ-SEC-023 par le verbe. `partners:schema:enums` et `gov:termes-interdits` restent verts. (2) Le cliquet de `matrice-des-roles.spec.ts:78` est réécrit par un autre agent. Les droits sensibles sont calculés depuis `Object.values(ConsoleRole)`. (3) Test : aucun droit du rôle ne porte sur un écran ou une action d'apporteur. (4) Changement de rôle, avec témoins : on ne quitte pas `conseiller_salarie` en portant une attribution occupante ; on n'y entre pas depuis qualifieur ou admin avant `DELAI_CHANGEMENT_POPULATION_JOURS`. (5) À l'invitation d'un conseiller, une déclaration de conflit d'intérêts est accusée (version et date conservées). Son budget : ≤ 3 interactions avec la notice. (6) Seed d'un conseiller de démonstration, valeurs factices.

#### SEC-32 — Couche d'accès `forConseiller` : cloisonnement par ligne, 404 identique, règle semgrep, IDOR
- **Méta** : phase 2 · lead sécurité · zone securite · sensible [auth, attribution, rgpd] · 1 j
- **Deps** : SEC-31, DM-07, SEC-05, GOV-111 · **Reqs** : REQ-SEC-041, REQ-SEC-009
- **Paths** : `src/server/acces/for-conseiller.ts`, `src/server/acces/for-apporteur.ts`, `.semgrep.yml`, `tests/unit/securite/acces-conseiller.spec.ts`, `tests/integration/idor-conseiller.spec.ts`
- **Acceptance** : (1) `forConseiller(utilisateurConsoleId)` : identifiant pris de la session, filtre en AND, clés de porteur refusées en écriture, 404 identique octet à octet. (2) Les `CLES_REFUSEES` de `forApporteur` gagnent `utilisateurConsoleId` (`for-apporteur.ts:233-265`). (3) Semgrep : aucun client Prisma direct sous `console/conseiller/**`. (4) IDOR : A contre B, conseiller contre attribution d'apporteur, conseiller contre `verifications` d'apporteur, session de conseiller dans l'espace. Chaque fois : 404 identique et même requête SQL. (5) Mutation : retirer le filtre fait rougir. (6) Dérivation depuis le schéma, dans les deux sens.

#### SEC-33 — Une personne, une population : contrôle croisé du courriel, candidature bloquée, apporteur embauché, signal de fuite
- **Méta** : phase 2 · lead sécurité · zone securite · sensible [auth, rgpd] · hyp [HYP-W19-ANTI-CUMUL] · 0,75 j
- **Deps** : SEC-31, INT-T26, SEC-18, DM-31 · **Reqs** : REQ-CPL-030, REQ-SEC-017
- **Paths** : `src/domain/population/exclusivite.ts`, `src/server/integrations/axionia/candidature-recue.ts`, `src/server/console/utilisateurs/creer.ts`, `tests/integration/exclusivite-des-populations.spec.ts`
- **Acceptance** : (1) La création d'un conseiller, ou le passage vers ce rôle, dont l'empreinte de courriel (domaine `partners.empreinte.v1`, `pii.ts:298-302`) correspond à un apporteur non résilié est refusé avec un motif nommé. Téléphone seulement si Will le décide. (2) Une candidature (INT-T26, fonction unique) ou une saisie EXT-T03 qui correspond à un conseiller actif est BLOQUÉE : ni activation ni DocuSeal avant la revue humaine. Une anomalie console est ouverte. (3) Apporteur embauché : son contrat doit être résilié avant l'activation du compte. Ses droits acquis restent dans la chaîne des apporteurs, et aucune attribution n'est transférée (témoin). (4) Aucune réponse ne révèle la population. (5) Signal admin « SIREN vérifié par un conseiller puis déposé par un apporteur sous N jours ». Il est sans effet sur l'apporteur et actif seulement après HYP-W19-CSE tranchée. (6) Témoins à deux faces dans chaque sens.

#### DM-30 — Prise en charge d'une entreprise par un conseiller : transaction commune, bornes de la Société, limites, délais, `anteriorite_suivi` côté apporteur
- **Méta** : phase 2 · lead domaine · zone domaine · sensible [attribution] · hyp [HYP-W19-CYCLE, HYP-W19-CARENCE, HYP-W19-LIMITES, HYP-W19-SOURCE, HYP-W19-NON-EXPLOITATION, HYP-W19-CSE, HYP-W19-PORTEUR, HYP-W19-DEPART] (PORTEUR et DEPART à titre PROVISOIRE, faute de verbe qui écrive `hyp` sur DM-07 et DM-08. Écart de phase nommé : l'arbitrage est réclamé par DM-30 en phase 2, alors que ces hypothèses sont à trancher avant DM-07 et DM-08 en phase 1. Le repli disparaît si Williams accorde la question 20) · label `role:gardien-spec` pour REQ-UX-002 et REQ-SEC-022 · 1,5 j
- **Deps** : SEC-32, SEC-12, SEC-16, DM-10-P, DM-08, JUR-T31 · **Reqs** : REQ-DM-048, REQ-SEC-042, REQ-JUR-044, REQ-SEC-014, REQ-DM-005, REQ-UX-002, REQ-SEC-022
- **Paths** : `src/domain/depot/prise-en-charge.ts`, `src/domain/depot/issue-prise-en-charge.ts`, `src/domain/depot/issue-depot.ts`, `src/content/micro-copy/espace/issues-depot.ts`, `src/server/console/conseiller/prendre-en-charge.ts`, `src/server/securite/rate-limit.ts`, `src/domain/seuils/ssot.ts`, `tests/unit/domaine/prise-en-charge.spec.ts`, `tests/integration/prise-en-charge.spec.ts`, `docs/requirements.json`
- **Acceptance** : TÂCHE SENSIBLE (attribution). (1) La tâche APPELLE la transaction de SEC-12 sans la recopier : verrou SIREN, index, horodatage, antériorité DM-10-P, établissement cessé, liste 3.3 bis (b) et registre d'opposition (témoin nommé pour l'opposition). (2) Rôle `conseiller_salarie` actif, lu dans la session, sinon `role_refuse`. Naissance `active` par `prise_en_charge_par_la_societe`, canal `console`. (3) `IssuePriseEnCharge` renvoie `non_disponible`, SANS mois et sans identité, dans tous ces cas : SIREN occupé ; délai d'attente après toute libération (témoin : relais A → B à J+90 refusé) ; fenêtre d'un rang 1 (témoin : rang 1 notifié, prise en charge à J+1 refusée) ; moins de `RESERVE_APRES_ACTE_APPORTEUR_JOURS` après une vérification ou un dépôt refusé d'un apporteur. (4) Limites par conseiller (verrou par `utilisateurConsoleId`) et par Société, en SSOT (HYP-W19-LIMITES). Anomalie au-delà du seuil journalier. (5) Côté apporteur : `anteriorite_suivi` ajoutée à `ISSUES_DEPOT` et `ISSUES_DE_REFUS`. Texte `DEJA_CONNUE`, `rien_a_votre_nom`, lien de contestation. REQ-UX-002 et REQ-SEC-022 amendées dans la même PR. `ux-exhaustivite` verte à 13 valeurs. (6) Case d'information du tiers exigée côté serveur. Origine de la collecte (art. 13) au journal. (7) Course mixte : 20 concurrents, apporteurs et conseillers, donnent exactement un occupant. (8) Pas de mise en service avant HYP-W19-CSE et l'AIPD tranchées.

#### DM-31 — « Vérifier » du conseiller et attestation d'antériorité : DTO minimal, limites par conseiller et par Société, signal de balayage
- **Méta** : phase 2 · lead domaine · zone domaine · sensible [attribution, rgpd] · hyp [HYP-W19-VISIBILITE] · 1 j
- **Deps** : DM-30 · **Reqs** : REQ-SEC-042, REQ-SEC-041, REQ-DM-043, REQ-SEC-016
- **Paths** : `src/server/console/conseiller/verifier.ts`, `src/server/console/contestation/attestation.ts`, `src/server/securite/rate-limit.ts`, `tests/integration/verifier-conseiller.spec.ts`, `tests/unit/domaine/attestation-anteriorite.spec.ts`
- **Acceptance** : (1) Réutilise la fonction de SEC-16. Le DTO rend trois réponses : libre ; pris en charge par vous jusqu'en <mois> ; non disponible (sans mois), pour toutes les causes, client ou devis d'Axion-IA compris. Une réponse « connue d'Axion-IA » distincte laisserait déduire qu'un SIREN « non disponible » et non client est tenu par un apporteur (HYP-W19-VISIBILITE ; question 10). (2) Journal dans `verifications` avec le porteur XOR. Limites `verif:console-identite` et `verif:console-societe` (surPanne : refuser). Aucune lecture croisée entre populations. (3) Signal « séquence ou balayage de SIREN » : anomalie admin, active seulement après HYP-W19-CSE. (4) La contestation d'un `anteriorite_suivi` produit une attestation d'antériorité (horodatage et empreinte du maillon, sans identité), servie à la console pour la réponse motivée sous 15 jours. (5) Aucune référence à une tâche inexistante.

#### UX-P2-11 — Espace de travail du conseiller, mobile d'abord : accueil, Vérifier / Prendre en charge, Mes entreprises, Aide
- **Méta** : phase 2 · lead console · zone console · hyp [HYP-W19-HORS-LIGNE, HYP-W19-A11Y-CONSEILLER] · 1 j
- **Deps** : DM-31, UX-P1-16, JUR-T32, UX-P2-15 · **Reqs** : REQ-UX-047, REQ-UX-048, REQ-QA-016, REQ-SEC-041, REQ-JUR-044
- **Paths** : `src/app/(console)/console/conseiller/`, `src/content/micro-copy/console/conseiller.ts`, `tests/e2e/console/conseiller/`
- **Acceptance** : (1) Quatre entrées : « Vérifier / Prendre en charge », « Mes entreprises », « Ma part variable », « Aide ». Aucune entrée d'apporteur. (2) L'accueil montre ses prises en charge triées par échéance, un champ Vérifier et « à échéance dans 15 jours ». Tout est dérivé des dates. Rien n'est mémorisé de ses visites ni de son activité. (3) REQ-UX-047 sur mobile-safari et mobile-chrome : de l'accueil à la prise en charge confirmée en ≤ 8 interactions et ≤ 90 s. Autocomplétion INT-T09 et repli « je ne trouve pas ». Cibles et corps de texte de HYP-W19-A11Y-CONSEILLER, lus dans `BUDGETS_UX`. (4) Chaque issue dit quoi faire. Libellés sans « déposer », « déclarer », « réservée », « commission », « équipe » ni « objectif ». (5) Hors ligne selon HYP-W19-HORS-LIGNE. (6) La notice et la déclaration s'affichent à la première connexion et comptent dans le budget. (7) Cinq états, REQ-UX-018, maquette UX-P2-15, test de premier usage par un conseiller. (8) Mise en service conditionnée par JUR-T32 (AIPD) et HYP-W19-CSE.

#### UX-P2-12 — Fiche conseiller (admin) : plans de part variable, réaffectation motivée en masse, anomalies
- **Méta** : phase 2 · lead console · zone console · sensible [argent, attribution] · 1 j
- **Deps** : DM-08, T-ARG-042, SEC-32, UX-P1-16, UX-P2-15 · **Reqs** : REQ-UX-047, REQ-ARG-038, REQ-DM-048
- **Paths** : `src/app/(console)/console/conseillers/`, `src/server/console/conseillers/`, `src/server/roles/matrice.ts`, `src/content/micro-copy/console/conseillers.ts`, `tests/e2e/console/fiche-conseiller.spec.ts`
- **Acceptance** : (1) Action `action:reaffecter_porteur` (admin, step-up, motif) déclarée dans la matrice. Réaffectation de conseiller à conseiller seulement, validée à quatre yeux (T-ARG-042), notifiée au conseiller dépossédé et aux admins. (2) Saisie d'un plan en ≤ 6 interactions : versions, date d'effet et état d'acceptation visibles. (3) Réaffectation en masse en ≤ 5 interactions, avec l'aperçu des entreprises concernées. (4) Lien vers les anomalies du conseiller. (5) Cinq états, maquette UX-P2-15, REQ-UX-018.

#### UX-P2-13 — Avis au conseiller : échéance proche et fin de prise en charge, par e-mail de console
- **Méta** : phase 2 · lead console · zone console · 0,5 j
- **Deps** : DM-30, DM-13, SEC-29 · **Reqs** : REQ-UX-047, REQ-JUR-043
- **Paths** : `src/server/notifications/table-ssot.ts`, `src/server/notifications/console/`, `src/content/micro-copy/console/avis-conseiller.ts`, `tests/unit/notifications/avis-conseiller.spec.ts`
- **Acceptance** : (1) Gabarits de console `echeance_proche_conseiller` (J-15) et `prise_en_charge_terminee`, avec un seul appel à l'action vers l'entreprise. (2) Envoi à l'utilisateur de console seulement. Test : aucun de ces gabarits n'atteint un apporteur. (3) Aucun rappel ne compare ni ne mesure le conseiller.

#### UX-P2-14 — Maquettes des écrans de console de la phase 2 (lot apporteurs, écrans d'argent et d'exception existants)
- **Méta** : phase 2 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · 1 j
- **Deps** : UX-P1-18 · **Reqs** : REQ-UX-047, REQ-UX-018
- **Paths** : `docs/maquettes/`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Une maquette par écran de console de la phase 2 listé dans `CONSOLE-ROUTES` (UX-P2-03, UX-P2-05 et les écrans EXT de console), avec la liste rapprochée. (2) Cinq états, deux thèmes, budget du geste principal. (3) Aucune ligne de conseiller dans le lot. (4) Validation groupée de Will.

#### UX-P2-15 — Maquettes du conseiller et de la paie : accueil, prise en charge, mes entreprises, ma part variable, export paie, fiche conseiller
- **Méta** : phase 2 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · 1 j
- **Deps** : UX-P1-18, GOV-112 · **Reqs** : REQ-UX-047, REQ-JUR-044
- **Paths** : `docs/maquettes/conseiller-accueil.html`, `docs/maquettes/prise-en-charge.html`, `docs/maquettes/part-variable.html`, `docs/maquettes/export-paie.html`, `docs/maquettes/fiche-conseiller.html`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Écrans du conseiller en 375×667 d'abord, puis sur bureau. Écrans admin et comptable en 1280×800 et 375. (2) Vocabulaire REQ-JUR-044. Aucun terme de l'apporteur. (3) Cinq états et deux thèmes. (4) Validation groupée de Will.

#### QA-T31 — Témoins à trois populations : antériorité indistincte côté apporteur, absence d'oracle côté conseiller, forme de l'API 1
- **Méta** : phase 2 · lead qualité · zone qualite (autre agent que l'auteur du code) · 0,75 j
- **Deps** : DM-31, SEC-32, INT-T07-P · **Reqs** : REQ-SEC-042, REQ-SEC-009, REQ-INT-014, REQ-DM-048
- **Paths** : `tests/integration/trois-populations.spec.ts`, `tests/integration/idor.spec.ts`, `tests/integration/frontiere.spec.ts`, `tests/unit/securite/acces-scope.spec.ts`
- **Acceptance** : (1) Seed : deux apporteurs et deux conseillers. (2) Le dépôt d'un apporteur sur un SIREN pris en charge donne un corps identique octet à octet à une antériorité client ou devis. Vérifier renvoie `non_disponible`, identique à un SIREN client. Contrôlé à J+0 et après une prolongation W9, avec des dates réelles. (3) Aucune clé de DTO de l'espace ne porte un segment de population. (4) Côté conseiller, `non_disponible` est identique quelle que soit la cause : apporteur, autre conseiller, client ou devis d'Axion-IA, délai d'attente, fenêtre du rang 1, acte d'apporteur récent. (5) API 1 : forme identique, `attribuee` et `apporteurRef: null`, aucun champ de plus. (6) Chaque témoin est vu rouge d'abord.

#### JUR-T32 — RGPD des conseillers : quatrième traitement, finalité d'incompatibilité côté apporteurs, AIPD 5e objet, CSE, notice, durées
- **Méta** : phase 2 · juriste (registre et notice, sur des points tranchés) · points de droit social en HYP arbitrés par Will · zone juridique · label `role:gardien-spec` pour `requirements.json` · 1 j
- **Deps** : JUR-T04, SEC-31, et la tâche de la page `/confidentialite` née de la scission de JUR-T04 décidée par Williams le 2026-09-29 (identifiant relevé à la fusion de `main`, JUR-T34 ou au-delà) · **Reqs** : REQ-SEC-030, REQ-CPL-009, REQ-JUR-043
- **Paths** : `docs/rgpd/registre-article-30.md`, `docs/rgpd/aipd.md`, `tests/unit/juridique/registre-rgpd.spec.ts`, `src/domain/seuils/ssot.ts`, `src/content/micro-copy/console/notice-conseiller.ts`, `src/app/(espace)/confidentialite/page.tsx`, `docs/requirements.json`
- **Acceptance** : (1) REQ-SEC-030 passe à quatre traitements par le verbe. Le test passe à 4. Traitement des conseillers : finalités, base légale, données minimales (matricule, éléments variables ; jamais NIR, fixe ni RIB), destinataire avec sa fiche `docs/tiers/`. (2) Le traitement des apporteurs gagne la finalité « contrôle d'incompatibilité avec le personnel de la Société ». La notice de l'apporteur (page `/confidentialite`) la mentionne sans nommer personne, si Williams la retient (question 14). (3) REQ-CPL-009 : 5e objet, « gestion des prises en charge et calcul de la rémunération variable ». Il est signé avant la première prise en charge. (4) HYP-W19-CSE : information ou consultation du CSE, ou constat écrit de Will qu'il n'y en a pas, daté, BLOQUANT pour la mise en service de DM-30 et UX-P2-11. (5) Notice du conseiller accusée à la première connexion, avec version et date. (6) Durées dans `ssot.ts` sous un marqueur HYP, dont les justificatifs de variable pendant au moins la prescription salariale (à confirmer). (7) Vérification qu'aucun écran ne restitue un indicateur d'activité d'un conseiller. (8) Origine art. 13 ou art. 14 dans TRT-TIERS. (9) Tout point de droit social non sourcé est marqué « À compléter », avec sa question.

#### T-ARG-040 — Chaîne de part variable : plan accepté et non rétroactif, matricule chiffré, lignes nées de l'encaissement, régularisation, tables immuables
- **Méta** : phase 2 · lead argent · zone argent · schema true (label `schema`) · sensible [argent, attribution, rgpd] · hyp [HYP-W19-PART-VARIABLE, HYP-W19-VARIABLE-SORTIE, HYP-W19-REGULARISATION] · label `role:gardien-spec` pour `docs/GLOSSAIRE.md` (fichier réservé : lot dédié avec `--settings` surchargé, GOV-116, ou écriture humaine par Williams) · 1,5 j
- **Deps** : DM-15, T-ARG-034, SEC-31, DM-04 · **Reqs** : REQ-ARG-036, REQ-ARG-038, REQ-JUR-045, REQ-DM-021
- **Paths** : `prisma/schema.prisma`, `prisma/migrations/`, `src/domain/part-variable/calcul.ts`, `src/domain/part-variable/adaptateur-grille.ts`, `src/server/part-variable/naissance.ts`, `src/domain/evenement/charges.ts`, `src/server/securite/pii.ts`, `tests/unit/domaine/part-variable.spec.ts`, `tests/integration/part-variable.spec.ts`, `docs/GLOSSAIRE.md`
- **Acceptance** : ELLE ÉCRIT LE SCHÉMA. (1) Tables `plans_part_variable` (conseiller, version, date d'effet, empreinte du document, `accepte_at`, `valide_par_id`) et `lignes_part_variable`, plus `utilisateurs_console.matricule_chiffre` (`colonnesPii`, AAD). FK vers `utilisateurs_console` seulement. Déclencheurs anti-UPDATE/DELETE. (2) Aucun plan actif sans `accepte_at`. Date d'effet au moins égale à l'acceptation et au jour courant, et postérieure à la dernière période exportée (témoin de rétroactivité refusée). (3) `paiement.recu` sur une attribution du conseiller lui-même donne une ligne par la fonction pure de DM-04, et zéro LigneCommission. La signature de DM-04 retenue est celle de l'avenant A01 (`46968b5`) : `grille: ContenuGrille` et `commissionId`. Un adaptateur (`adaptateur-grille.ts`) traduit le plan de part variable accepté en `ContenuGrille`, lignes au champ `kind` (`flat`, `percent`, `scale`) de DM-03-P, sans modifier DM-04 ni rendre `GrilleCommission` générique. Jamais d'agrégat du réseau. Le champ `commission` de `devis.signe` n'est jamais lu. (4) Palier absent : anomalie, jamais zéro, jamais de repli sur une grille. (5) Un avoir ou un impayé donne une ligne négative reportée sur la période suivante, jamais sur un export figé ni en retenue. Un encaissement après le départ suit HYP-W19-VARIABLE-SORTIE. (6) Agrégat `part_variable` par ADD VALUE. Charges sans nom ni montant. Rien dans pino. (7) Seeds factices, `gov:publication` vert. (8) Garde AST dans les deux sens.

#### T-ARG-042 — Quatre yeux sur l'argent des conseillers : plan, réaffectation et export validés par une seconde personne, notifications
- **Méta** : phase 2 · lead argent · zone argent · sensible [argent] · hyp [HYP-W19-QUATRE-YEUX] · 0,75 j
- **Deps** : T-ARG-040, SEC-30 · **Reqs** : REQ-ARG-038, REQ-ARG-037, REQ-CPL-010
- **Paths** : `src/server/part-variable/validation.ts`, `src/server/roles/matrice.ts`, `tests/integration/quatre-yeux-part-variable.spec.ts`
- **Acceptance** : (1) Un plan saisi par X n'est actif qu'après validation par Y ≠ X, admin ou comptable (patron REQ-CPL-010). Même règle pour une réaffectation. (2) Un export de période est validé par une personne distincte de l'auteur de toute modification de plan ou réaffectation sur la période. (3) Toute création ou validation est notifiée à tous les admins. (4) S'il n'existe qu'une seule personne habilitée, blocage avec un message nommé. Jamais de contournement. (5) Témoins : même personne refusée, deux personnes acceptées.

#### T-ARG-041 — Export paie mensuel : période figée et validée, empreinte, ré-export identique, régularisations, droits et journal
- **Méta** : phase 2 · lead argent · zone argent · sensible [argent, rgpd] · hyp [HYP-W19-FORMAT-PAIE, HYP-W19-DROITS-PAIE] · 1,25 j
- **Deps** : T-ARG-040, T-ARG-042 · **Reqs** : REQ-ARG-037, REQ-GOV-022
- **Paths** : `src/server/console/paie/export.ts`, `src/server/roles/matrice.ts`, `tests/unit/argent/export-paie.spec.ts`, `tests/integration/export-paie.spec.ts`, `docs/tiers/paie-generique.md`
- **Acceptance** : (1) Fiche `docs/tiers/paie-generique.md`, avec son hypothèse datée. (2) `action:exporter_paie` réservé à admin et comptable, avec step-up déclaré. Tout autre rôle reçoit `role_refuse`. (3) L'export est figé après validation (T-ARG-042) et haché. Le ré-export est identique à l'octet. Une régénération est motivée et journalisée. (4) Contenu : matricule, déchiffré à l'export seulement ; période ; rubrique ; montant « à porter en paie », régularisations comprises ; référence opaque. Aucune donnée d'apporteur. Formules CSV neutralisées. (5) Le module vit sous `src/server/console/paie/`, jamais sous `src/server/pdf/`.

#### UX-P2-10 — Écrans « Export paie » (admin, comptable) et « Ma part variable » (conseiller, avec base de calcul)
- **Méta** : phase 2 · lead console · zone console · sensible [argent] · 1 j
- **Deps** : T-ARG-041, UX-P1-16, SEC-32, UX-P2-15 · **Reqs** : REQ-UX-047, REQ-ARG-037, REQ-ARG-038
- **Paths** : `src/app/(console)/console/argent/paie/`, `src/app/(console)/console/conseiller/part-variable/`, `src/content/micro-copy/console/paie.ts`, `tests/e2e/console/export-paie.spec.ts`
- **Acceptance** : (1) Sous « Argent », « Export paie » est une entrée DISTINCTE du « Lot apporteurs », jamais dans le même tableau. États lisibles : brouillon → validé par une seconde personne → exporté. Justificatif par ligne. Ni IBAN ni le mot « lot ». (2) « Ma part variable », servie par `forConseiller` : acquis, prévu, porté en paie de <mois>, base de calcul par ligne (entreprise, encaissement, forfait ou taux du plan accepté), plan accepté consultable, « le bulletin fait foi ». (3) REQ-UX-047 : exporter un mois en ≤ 4 interactions (E2E). Cinq états, maquette UX-P2-15, REQ-UX-018.

#### QA-T32 — Partition de l'argent entre populations : contre-calcul, rejeu, avoir après export, encaissement après départ, fraude par la même personne
- **Méta** : phase 2 · lead qualité · zone qualite · 0,75 j
- **Deps** : T-ARG-040, T-ARG-041, T-ARG-036 · **Reqs** : REQ-ARG-036, REQ-ARG-038, REQ-ARG-003
- **Paths** : `tests/argent/partition-des-populations.spec.ts`, `tests/argent/contre-calcul.sql`
- **Acceptance** : (1) Un `paiement.recu` sur un conseiller donne 0 LigneCommission, 0 relevé, 0 autofacture, 0 ligne de lot, 0 DAS2 et 1 ligne de part variable. (2) Contre-calcul SQL sur des scénarios nommés : SIREN du conseiller, SIREN passé d'un apporteur à la Société, au plus une rémunération par encaissement. (3) Property-based : total apporteurs + total conseillers = total né. (4) Témoins : avoir après export reporté, encaissement après départ, plan rétroactif refusé, validation par la même personne refusée. (5) Chaque témoin est vu rouge d'abord.

### Phase 3

#### UX-P3-13 — Maquettes des écrans de console de la phase 3 (pilotage, conformité et anomalies, statistiques, notes)
- **Méta** : phase 3 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · 1,5 j
- **Deps** : UX-P1-18 · **Reqs** : REQ-UX-047, REQ-UX-018, REQ-UX-042
- **Paths** : `docs/maquettes/`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Une maquette par écran de console de la phase 3 listé dans `CONSOLE-ROUTES` (UX-P3-04, UX-P3-05, UX-P3-07, UX-P3-10…). (2) Onglets « Réseau d'apporteurs » et « Conseillers salariés » séparés. Le lecteur ne voit que des agrégats, masqués sous 3 conseillers. (3) Cinq états, deux thèmes, budget du geste principal. (4) Validation groupée de Will.

## 6. Tâches existantes à amender

Toutes par GOV-115, par `hors-depot/reecrire-champ.mjs` (ou `hors-depot/poser-champ.mjs` pour une
acceptance encore absente), avec motif et `--si-inchange`. **Aucune n'est amendée par la PR qui porte ce
fichier** : les exigences qu'elles citeraient n'existent pas encore (GOV-112).

**Les lignes « À la pose de son acceptance » ne sont pas différées.** Sur chaque tâche cible dont
l'acceptance est vide à la fusion de `main` (mesuré le 2026-09-29 : SEC-12, SEC-16, INT-T07-P, UX-P1-04,
DM-13, DM-15, T-ARG-015, T-ARG-016, T-ARG-018, DM-19, T-ARG-035), GOV-115 les écrit dès son passage par
`hors-depot/poser-champ.mjs`, sous la forme « Contraintes W19 à intégrer : … », que l'auteur de
l'acceptance reprend. Ce fichier ne devient historique qu'une fois ces lignes posées.

> ⚠️ **TROU D'OUTILLAGE, MESURÉ À LA TRANSCRIPTION (2026-09-29), que le plan ne voyait pas.** Les verbes
> hors dépôt n'écrivent sur une tâche existante que `titre`, `acceptance`, `tests`, `sensible`, `deps`,
> `estimateDays` et `schema` (`CHAMPS_ECRIVABLES` de `hors-depot/outils-backlog.mjs`) ; `paths` passe par
> `hors-depot/ajouter-path.mjs` et `hors-depot/retirer-path.mjs`. **Aucun verbe n'écrit `reqs`, `hyp` ni
> `zone`.** Or ce tableau en demande sur DM-07, DM-08, JUR-T01b, INT-T12, les dix tâches qui passent en
> zone `console`, et les tâches de la passe REQ-UX-047. Écrire ces champs à la main contournerait le
> `deny` de `docs/tasks.json`. GOV-115 ne peut donc les appliquer qu'après une extension de la liste des
> champs écrivables, geste sur les outils hors dépôt qui relève de Will ; à défaut, elle applique
> `acceptance`, `deps` et `estimateDays` (la référence à REQ-UX-047 s'écrit alors dans l'acceptance), et
> la dette est NOMMÉE : GOV-113 (1) lit, en repli déclaré, la citation de REQ-UX-047 dans l'acceptance ;
> les dix tâches de console gardent leur zone `espace` au registre, et leur acceptance écrit le reclassement
> en zone `console` et leurs chemins réels ; HYP-W19-PORTEUR et HYP-W19-DEPART restent portées par DM-30 à
> titre provisoire. C'est la question 20 du §9.

| Tâche(s) | Changement |
| --- | --- |
| DM-07 | AVANT toute revendication. hyp [HYP-W19-PORTEUR, HYP-W19-CYCLE], reqs + REQ-DM-048, estimateDays 1 → 1,5 (chemin critique). (1) `CanalDepot` reçoit `console`. (2) `apporteurId` devient nullable et `utilisateurConsoleId` est ajouté (nullable, FK Restrict, index). Contraintes : CHECK XOR des deux porteurs ; CHECK grille présente si et seulement si le porteur est un apporteur ; CHECK canal `console` si et seulement si le porteur est un conseiller, et alors `jeton_depot_id IS NULL` ; CHECK sur `rang_attente` et `peremption_suspendue_at` réservés à l'apporteur. (3) DÉCLENCHEUR : `utilisateur_console_id` désigne un utilisateur de rôle `conseiller_salarie` non désactivé ; au moment de DM-07, aucune valeur ne passe tant que SEC-31 n'est pas là. (4) `depots_refuses` et `personnes_declarees` restent réservées aux apporteurs. (5) Témoins : attribution d'apporteur sans grille refusée ; attribution de conseiller avec grille refusée ; porteur de rôle qualifieur refusé ; apporteur puis conseiller sur le même SIREN refusé, et inversement. |
| DM-08 | hyp [HYP-W19-CYCLE, HYP-W19-DEPART], estimateDays 1,25 → 1,5. (1) Entrée dérivée « type de porteur ». (2) Événement de naissance `prise_en_charge_par_la_societe` (null → active, `confirmeeAt` = `deposeeAt`). (3) Refus typé, pour un conseiller, de : confirmation tacite, `non_confirme`, gel, `figee_resiliation`, rang, contestation. (4) Prolongation W9 identique à celle de l'apporteur. (5) Événement `porteur_reaffecte {de, vers, acteurId, motif}`, de conseiller à conseiller seulement. (6) Désactivation : les prises en charge sans suite passent `perimee` sous 15 jours. (7) Test exhaustif des triplets (état, événement, type de porteur). Les 13 valeurs d'`EtatAttribution` sont inchangées. |
| DM-12 | Sans changer l'estimation. `verifications` reçoit le porteur XOR. `decide_par_id`, `traite_par_id` et `repondue_par_id` ne désignent jamais un conseiller : DÉCLENCHEUR, et non une assertion de test. |
| DM-09, DM-13, DM-24 | DM-09 : palier, taux et `verificationPrioritaire` se dérivent des seules qualifications d'apporteurs (témoin de volume). DM-13 (acceptance à poser) : péremption du conseiller depuis `deposeeAt`, sans suspension ; expiration à 12 mois ; la fin notifie le rang 1 ; le délai d'attente de la Société démarre à toute libération. DM-24 : ne sélectionne jamais un porteur conseiller (témoin à deux faces). |
| DM-25 | L'annulation n'a lieu que si `connueDepuisAt < deposeeAt` (témoin : un devis postérieur n'annule rien). Pour un porteur conseiller, information en console seulement. |
| SEC-12 | À la pose de son acceptance : la file est réservée aux apporteurs ; le verrou de limite vaut par porteur (`apporteurId`, ou `utilisateurConsoleId` pour DM-30) ; le verrou SIREN est commun ; la transaction est exposée comme une fonction réutilisable, avec un point d'extension pour l'issue d'antériorité ; aucune valeur `anteriorite_suivi` avant DM-30. |
| SEC-16 | À la pose de son acceptance : un SIREN occupé par la Société est rendu `non_disponible`, comme un client. Faire trancher d'abord, par le gardien-spec, la contradiction 4 états (`docs/GLOSSAIRE.md:117`) / 5 états (REQ-UX-007) / binaire (REQ-JUR-011). |
| INT-T07-P | À la pose de son acceptance : une attribution de conseiller répond `attribuee`, avec `until` et `apporteurRef: null`, documenté « porté par la Société ». Test de forme refusant tout champ de plus. Le déplacement vers `packages/contracts/` est RETIRÉ du chantier : il imposerait `schema: true` et une copie à hash identique côté axion-ia, non chiffrées. |
| DM-04 | **AUCUN amendement par GOV-115 (arbitrage rendu le 2026-09-29).** La signature de l'avenant A01 est RETENUE : `grille: ContenuGrille` et `commissionId`, champ `kind` (`flat`, `percent`, `scale`) de la grille DM-03-P, plafond de REQ-ARG-007 en SSOT et `src/domain/seuils/ssot.ts` dans les paths (commits `46968b5` et `2dd080d` de la session qui tient DM-04, branche `t/dm-04`). Seule cette session réécrit l'entrée DM-04, par sa propre PR. La part variable ne touche pas DM-04 : T-ARG-040 (3) traduit le plan de part variable en `ContenuGrille` par un adaptateur de phase 2. Les cinq valeurs d'`ActiviteFacturation` que l'avenant laisse au gardien-spec entrent au glossaire par GOV-112 (§2). |
| JUR-T03 | (a) Correction du chemin, qui est `axionia/src/content/recrutement/commercial-offer.ts` (le chemin déclaré `axionia/src/content/commercial-offer.ts` n'existe pas). (b) Extension RECOMMANDÉE comme obligatoire (+0,5 j, 1 → 1,5), sous réserve de Williams : titre et héros en « apporteur d'affaires » (`commercial-offer.ts:76`) ; retrait des mots-clés « offre d'emploi » et « poste de commercial » (`:369`, `:386`) ; `careers/categories.ts:88-96` ne renvoie plus vers `/devenir-commercial-ia` ; REQ-JUR-045 portée sur l'annonce « Responsable du réseau commercial » (réécriture en « équipe salariée », variable jamais indexé sur le réseau), si Williams le décide. |
| JUR-T01b, INT-T12 | deps + JUR-T31, hyp + HYP-W19-CONCOURS. Aucun DocuSeal avant l'arbitrage daté de l'art. 3.3 c) et de la clause de non-exploitation. |
| UX-P1-01, UX-P1-02 | deps + UX-P1-17, QA-T33 (UX-P1-18 n'est pas requise : espace). Budget REQ-UX-001 mesuré par la fixture QA-T33. Test : aucune issue ne nomme un rôle de console. ⚠️ Par UX-P1-17, ces deux écrans héritent du bloqueur externe JUR-T31 (arbitrage daté de Williams) ; le chemin critique n'en est pas affecté (recalcul : 22,75 j inchangés). |
| UX-P1-04 | À la pose de son acceptance : un lien d'apporteur consommé redirige en une action vers « / » ou vers l'URL demandée, bornée aux chemins relatifs de l'espace. Fin du cul-de-sac de `src/app/(espace)/connexion/ecran.tsx:76-82`. Le mécanisme du code à 6 chiffres est écrit pour être réutilisé par SEC-29. |
| UX-P1-06, UX-P1-07, UX-P1-12, UX-P1-13, EXT-T02a, UX-P2-03, UX-P2-05, UX-P3-04, UX-P3-05, T-ARG-035 | La zone passe de `espace` à `console` (si la question 20 est refusée : écrit dans l'acceptance de chaque tâche, dette nommée ci-dessus) (UX-P1-06 est aujourd'hui en zone `espace`, vérifié), avec des chemins réels sous `src/app/(console)/console/…` ; deps + UX-P1-16 et la tâche de maquettes de la phase (UX-P1-19, UX-P2-14, UX-P3-13) ; chaque tâche ajoute son droit `ecran:*` et cite REQ-UX-047 et REQ-UX-048. En plus : UX-P1-07 : aucune prise en charge dans la file ; UX-P1-13 : filtre « amenée par » (pastille avec icône et mot), aucun droit pour le conseiller ; UX-P2-03 : test d'absence de toute ligne de conseiller ; UX-P3-05 : devient l'accueil « à traiter aujourd'hui » de l'admin quand il est livré. ⚠️ `zone` et `reqs` ne sont écrivables par aucun verbe (encadré ci-dessus). |
| Les tâches d'écran à faire (45 à `c60e2f3`) | Par la passe de GOV-115 : toute tâche `a_faire` ayant un chemin sous `src/app`, SAUF les trente tâches W19 versées par GOV-115 (elles citent déjà REQ-UX-047) et SAUF JUR-T04 (nommée : sa branche `t/jur-t04` est en travail, pas de rétroactivité). Chacune reçoit reqs + REQ-UX-047, son droit `ecran:*`, sa dépendance de maquette, +0,1 j (42 tâches, 4,2 j, à `c60e2f3`), et une ligne « geste principal : … ; budget : … » dans son acceptance, ou une dette nommée par tâche quand le geste n'est pas encore connu. EXT-T01, EXT-T09 et UX-P3-12, déjà à 1,5 j, absorbent le coût grâce à la fixture QA-T33. La liste est MESURÉE à la fusion de `main` et jointe à la PR ; elle n'est pas recopiée ici. La tâche `/confidentialite` née de la scission de JUR-T04 y entre si elle existe alors : l'écart de décompte est nommé. |
| DM-15 | À la pose de son acceptance, sans changer l'estimation : le premier geste aiguille selon le porteur, par un POINT D'EXTENSION nommé (patron SEC-12) que DM-15 livre et teste avec un délégué factice ; un porteur conseiller y branche T-ARG-040, qui dépend de DM-15 : DM-15 ne teste donc pas la délégation réelle. Témoin nommé. |
| T-ARG-015, T-ARG-016, T-ARG-018, DM-19, T-ARG-035 | À la pose de leurs acceptances : types fermés à `apporteurId` NOT NULL, et test d'absence de toute donnée de conseiller dans le relevé, l'autofacture, le pain.001, la DAS2 et le registre « Commissions ». |
| T-ARG-037, DM-23, DM-16 | T-ARG-037 : repli à 60 jours réservé aux apporteurs ; garde AST dans les deux sens. DM-23 : GrilleModele, GrilleContrat et contrats réservés aux apporteurs (témoin). DM-16 : un conseiller n'est ni parrain ni filleul, dans les deux sens. |
| DM-29, UX-P3-07, UX-P3-09, UX-P3-11 | DM-29 : dimension « origine » dont la somme égale le total. UX-P3-07 : onglets séparés ; le lecteur ne voit que des agrégats de conseillers, avec masquage sous 3 ; le nominatif est réservé à l'admin, avec journal de lecture et témoin `role_refuse`. UX-P3-09 : export des conseillers par l'admin seul. UX-P3-11 : aucune alerte ne vise un conseiller ; `activite()` n'est pas réutilisée. |
| UX-P3-10, DM-20 | UX-P3-10 : `action:ecrire_note_interne` refusée au conseiller (témoin). DM-20 : l'export d'accès du conseiller est servi par la console ; son effacement est borné par la conservation de paie. |
| UX-P2-06, QA-T29, QA-T16 | Cloisonnement sur trois populations. Course mixte de 50 dépôts et prises en charge. QA-T16 couvre aussi le conseiller sur mobile et utilise la fixture QA-T33. |
| UX-P1-08 | La liste « Plus » est dérivée de la carte des routes : `docs/ESPACE-ROUTES.md:18` en a 6, `scripts/gates/etats-vides.ts:39-43` en a 5 (Filleuls manque). La teinte « ok / versé » est distinguée de l'accent d'action en thème sombre. |
| JUR-T04 | AUCUN changement de périmètre ni de compte : trois traitements (`t/jur-t04:tests/unit/juridique/registre-rgpd.spec.ts:258`, fichier absent de `main`). Seulement des « Questions ouvertes » (voir §8). Exclue de la passe REQ-UX-047, nommément. Scission décidée par Williams le 2026-09-29 : la page `/confidentialite` devient une tâche à part (identifiant JUR-T34 ou au-delà), qui entre dans la passe et que JUR-T32 attend. |

## 7. Modifications du livré

Aucune n'est faite ici : chacune devient le travail d'une tâche.

| Quoi | Preuve | Urgence | Tâche porteuse |
| --- | --- | --- | --- |
| Ajouter au registre W19, les 23 HYP-W19-* et les 12 REQ nouvelles. Corriger HYP-C4 et PRESEANCE §3.2 (promotion automatique périmée). Aligner GLOSSAIRE §8 « entreprise connue » sur REQ-DM-029. Ajouter au §8 les entrées « conseiller salarié », « prise en charge (Société) » (sens financier en interdit), « plan de part variable » et les cinq valeurs d'`ActiviteFacturation`, sans marqueur exercé (§2). | `docs/DECISIONS.md:80` (HYP-C4) contre REQ-DM-004 ; `docs/GLOSSAIRE.md:320` ; le registre ne connaît que W1-W18 ; `scripts/gates/gov-check.ts:269` et `:280-318` | avant phase 1 | GOV-112 |
| Chemin déclaré de JUR-T03 : `axionia/src/content/commercial-offer.ts` n'existe pas ; le vrai fichier est `axionia/src/content/recrutement/commercial-offer.ts`. | Constat du plan, confirmé par le gardien-spec (fichier réel, lignes 76, 369 et 386) | avant la suite de la phase 0 | GOV-115 |
| Point (1) de l'acceptance de DM-04 : signature `grille: ContenuGrille` et `commissionId` de l'avenant A01, RETENUE par arbitrage du 2026-09-29 ; GOV-115 ne l'amende pas (§6). | Branche locale `t/dm-04`, commits `46968b5` (avenant) et `2dd080d` (`src/domain/commission/calcul.ts:25-33`) | avant la suite de la phase 0 | DM-04 (session qui la tient) |
| REQ-UX-047 posée sur les tâches d'écran `a_faire` existantes (45 à `c60e2f3`, re-mesurées à la fusion de `main`) avant que GOV-113 ne s'arme, faute de quoi la phase 1 gèle. +0,1 j par tâche. | `docs/tasks.json` à `c60e2f3` : 46 tâches non fusionnées ont un chemin sous `src/app` (21 en phase 1, 11 en phase 2, 13 en phase 3, plus JUR-T04). EXT-T01, EXT-T09 et UX-P3-12 sont déjà à 1,5 j. | avant phase 1 | GOV-115 |
| Connexion de la console : aucun utilisateur de console ne peut recevoir de lien. L'écran de réussite de l'espace est un cul-de-sac. La console n'a ni code à 6 chiffres ni page « lien déjà utilisé ». | `src/server/auth/lien-magique.ts:106`, `:195-196`, `:263` ; `src/app/(espace)/connexion/ecran.tsx:76-82` ; `src/server/notifications/table-ssot.ts:14-17` (un seul gabarit) ; REQ-UX-015 (code et page dédiée, pour l'espace seulement) | avant phase 1 | SEC-29 (console), UX-P1-04 (espace) |
| La session de 30 jours de REQ-SEC-003 s'applique aussi à la console, sans `sessionVersion` pour les utilisateurs de console. | `src/server/auth/durees.ts:18-19` ; `src/server/roles/require-role.ts:66-73` ; `prisma/schema.prisma:290-304` | avant phase 1 | SEC-29 (durée), SEC-30 (`sessionVersion`) |
| Console : navigation non filtrée par rôle dans les maquettes, aucune maquette de console validée, aucune tâche qui les produise. Les accueils envisagés ne sont livrés qu'en phase 2 ou 3. | `docs/maquettes/file-qualification.html:800-806` ; `docs/maquettes/VALIDATION.md:21-26` (« — ») ; seule UX-P0-02 (fusionnée, espace) produit des maquettes ; UX-P2-03 en phase 2, UX-P3-04 et UX-P3-05 en phase 3 ; `src/server/roles/matrice.ts:31-39` n'a aucun droit `ecran:*` | avant phase 1 | UX-P1-18, UX-P1-19, UX-P1-16 |
| Garde des maquettes limitée aux identifiants UX-P* : des écrans de console peuvent être codés sans maquette. Plusieurs tâches d'écran de console sont classées en zone `espace`. | `scripts/gates/maquettes-validees.ts:96` ; `docs/tasks.json` : UX-P1-06, UX-P1-12, EXT-T02a et UX-P3-05 en zone `espace` (vérifié), acceptances vides | avant phase 1 | GOV-113, GOV-115 |
| Le contrat v1 ne connaît que l'antériorité client ou devis (3.3) et le concours entre apporteurs (3.5). Une prise en charge par la Société n'a aucune base écrite. `IssueDepot` est aligné un pour un sur 3.3 et 3.3 bis : un 3.3 c) implique une 13e valeur. | `docs/contrat/CONTRAT-APPORTEUR-V1.md:131-145` et `:172-178` ; `src/domain/depot/issue-depot.ts:3-10` et `:16-29` ; `issues-depot.ts:54-63` | avant phase 1 | JUR-T31 (texte), DM-30 (valeur d'enum, phase 2) |
| Le rôle console est figé à quatre valeurs (enum, REQ-SEC-023, GLOSSAIRE l.124 et §7, test littéral). | `prisma/schema.prisma:59-66` ; `src/server/roles/matrice.ts:27-28` ; `tests/unit/securite/matrice-des-roles.spec.ts:78` et `:96-111` ; `docs/GLOSSAIRE.md:124` | plus tard | SEC-31 |
| La garde lexicale a des limites de lecture sur les identifiants composés, et aucune famille de portée apporteur ne nomme la population salariée ; `import_console` ne reconnaît que le segment `console`. Correction sur le patron GOV-109, témoins hors dépôt. | `src/domain/lexique/lexique-interdit.ts` (10 familles) ; `scripts/gates/jur-aucun-agregat-reseau.ts:121` ; `scripts/lot/revues.ts:1214-1248` ; acceptance de GOV-109 | plus tard | GOV-114 |
| Couche d'accès : `CLES_REFUSEES` doit refuser `utilisateurConsoleId`, et il faut un cloisonnement par ligne côté console. | `src/server/acces/for-apporteur.ts:233-265` ; `src/server/roles/require-role.ts:106-131` | plus tard | SEC-32 |
| Point unique de création d'un Apporteur : y greffer le contrôle croisé du courriel et le blocage de la candidature d'un conseiller actif. Aucun téléphone ni matricule n'existe pour un utilisateur de console. | `prisma/schema.prisma:178`, `:295`, `:290-304` ; `docs/tasks.json` INT-T26 (3) ; `src/server/securite/pii.ts:298-302` | plus tard | SEC-33, T-ARG-040 (matricule) |
| axion-ia : la copy publique appelle « commercial » l'apporteur. L'annonce salariée « Responsable du réseau commercial » fixe des objectifs et indexe un variable sur le réseau. L'espace ressources connaît un destinataire « commercial ». `AdminRole` n'a aucun rôle restreint pour un salarié qui fait des devis. | axion-ia `src/content/recrutement/commercial-offer.ts:76`, `:369`, `:386` ; `careers/categories.ts:88-96` ; `careers-gen/responsable-reseau-commercial.json` ; `pricing.ts:828` ; `prisma/schema.prisma:8167-8170`, `:177-189` ; `visibility-mapping.ts:18` (constats sur `a12e58165`) | avant la suite de la phase 0 | JUR-T03 (extension), JUR-T33 (inventaire) ; l'annonce relève de Williams, hors registre Partners |

## 8. Consignes aux auteurs en cours

1. **Identifiants réservés au chantier W19** — ne les prenez pas : GOV-112 à GOV-116 (GOV-116 est réservé
   à la tâche future qui écrira et testera le lot dédié avec `--settings` surchargé), SEC-29 à SEC-33,
   UX-P1-16 à UX-P1-20, UX-P2-10 à UX-P2-15, UX-P3-13, JUR-T31 à JUR-T33, DM-30, DM-31, T-ARG-040 à
   T-ARG-042, QA-T31 à QA-T33. Ce sont des jetons, fixés à la dernière fusion de `main` dans la branche de
   GOV-112 et GOV-115. **Aucune garde ne les protège** : seules GOV-112 et GOV-115 existent au registre,
   et `verser-tache` ne refuse qu'un identifiant déjà présent dans l'arbre où il tourne. **Premiers
   numéros libres pour toute autre tâche : GOV-117, SEC-34, UX-P1-21, UX-P2-16, UX-P3-14, JUR-T34, DM-32,
   T-ARG-043, QA-T34** (les autres familles ne sont pas touchées : INT-T28, EXT-T12, CPL-T24). Deux
   versements sont imminents : la page `/confidentialite` issue de la scission de JUR-T04 prend JUR-T34 ou
   au-delà, et toute nouvelle GOV prend GOV-117 ou au-delà. GOV-115 vérifie, à sa fusion de `main`,
   qu'aucun jeton n'a été pris.
2. **DM-03-A** (axion-ia) : n'ajoutez rien pour les salariés. `COMMERCIAL_COMMISSIONS` reste la grille des
   seuls apporteurs, et le commentaire « Barème de commission du réseau apporteurs » est juste : gardez-le.
   `/api/partners/grille` ne publie que cette grille.
3. **DM-03-P** : inchangée. Ne rendez pas `GrilleCommission` générique. L'obligation de grille sera limitée
   aux porteurs apporteurs par DM-07 amendée.
4. **DM-04** : la signature de votre avenant A01 (`46968b5`, `2dd080d`) est RETENUE par l'arbitrage du
   2026-09-29 ; GOV-115 ne réécrit plus l'entrée DM-04, seule votre PR le fait. Poussez `t/dm-04` (en
   `wip:`, sans PR si elle n'est pas prête) pour que l'avenant ne vive pas que sur un poste. N'écrivez pas
   les cinq valeurs d'`ActiviteFacturation` au glossaire : GOV-112 les verse.
4 bis. **DM-07** : ne la revendiquez pas avant que GOV-115 l'ait amendée (§6 : porteur XOR, CHECK,
   déclencheur, estimation 1 → 1,5).
5. **INT-T02 à INT-T05** (axion-ia) : le contrat d'événements v2 est INCHANGÉ. N'ajoutez aucun champ
   vendeur, auteur de devis, salarié ou population, et n'ouvrez pas de v3. Partners résout par le SIREN. Le
   champ `commission` de `devis.signe` reste calculé sur la grille des apporteurs.
6. **INT-T22** : aucun changement. Signalez seulement, dans votre journal, l'écart entre « émission à
   l'écriture de Submission » et « émission au clic prêt à signer » (axion-ia ADR 0051 §c).
7. **INT-T26** : n'ajoutez aucun contrôle croisé maintenant (aucun conseiller avant la phase 2). Gardez la
   création ET l'activation d'un Apporteur dans UNE seule fonction transactionnelle, sans autre chemin
   d'activation : SEC-33 y posera un blocage avant activation sans rien réécrire.
8. **INT-T27-A** : la route des coordonnées reste limitée aux candidatures émises ; elle ne doit jamais
   pouvoir servir un utilisateur de console.
9. **JUR-T04** : ne changez PAS le compte de trois traitements
   (`t/jur-t04:tests/unit/juridique/registre-rgpd.spec.ts:258`). Ajoutez aux
   « Questions ouvertes » du registre : base légale du traitement des conseillers ; destinataire de l'export
   paie ; données minimales ; durées, dont la prescription salariale ; CSE ; objet 5 de l'AIPD ; art. 13 ou
   art. 14 ; finalité « contrôle d'incompatibilité avec le personnel de la Société » dans le traitement des
   APPORTEURS et sa mention dans leur notice. N'écrivez rien d'autre sur les salariés dans la politique de
   l'espace : JUR-T32 le fera après votre fusion. La même consigne vaut pour l'auteur de la tâche
   `/confidentialite` née de la scission (JUR-T34 ou au-delà) : la mention « contrôle d'incompatibilité »
   dans la notice des apporteurs est écrite par JUR-T32, qui attend cette tâche.
10. **JUR-T03 et JUR-T29** : attendez la réponse de Williams sur l'extension de JUR-T03, et prenez le chemin
    corrigé `src/content/recrutement/commercial-offer.ts`.
11. **Tous les auteurs de la phase 0** : n'ajoutez aucune valeur à `ConsoleRole`, `IssueDepot`,
    `MotifRefusDepot`, `CanalDepot` ni `AgregatJournal`. Ne touchez pas au GLOSSAIRE §7. N'écrivez jamais le
    marqueur des synonymes interdits suivi de termes entre accents graves sans lancer
    `gov:termes-interdits`. Aucun identifiant ne doit contenir un terme du lexique interdit, quelle que soit
    la casse ou la composition : un vert de la garde n'est pas une permission. N'éditez pas
    `docs/DECISIONS.md`.
12. **Auteurs d'écrans** (phase 0 en cours et futurs) : nommez vos budgets de gestes et vos cinq états dès
    maintenant. La passe REQ-UX-047 de GOV-115 les rendra obligatoires sur toute tâche d'écran `a_faire`,
    jamais rétroactivement sur une tâche fusionnée.
13. **Auteurs des GOV en cours** (GOV-062, GOV-109, GOV-110 ; GOV-084 est fusionnée, #216) : rien à changer. GOV-114 dépendra de
    GOV-109 et en reprendra le patron des témoins hors dépôt.
14. **Coordination** : GOV-112 puis GOV-115 écrivent `docs/tasks.json` et `docs/requirements.json`. Elles ne
    s'ouvrent que lorsqu'aucune PR de clôture n'est ouverte (RM-13). En cas de conflit, passez par
    `hors-depot/fusionner-registre.mjs`. Un conflit de vue dérivée se résout par `pnpm vues:fusion`,
    jamais à la main.
15. **Relais** : chaque session reçoit ce §8 EN ENTIER, points 11 et 14 compris, pas un résumé.

## 9. Questions à Williams

Chaque question commence par l'hypothèse qui s'applique sans réponse. Là où aucune HYP n'existe, la
question le dit et donne l'option conservatrice (`docs/DECISIONS.md` §5). Une réponse datée remplit la
colonne « Tranchée » de l'hypothèse visée.

1. **URGENT. Par défaut : aucune HYP ; option conservatrice, dépublier l'annonce tant que vous n'avez pas
   décidé.** L'annonce axion-ia « Responsable du réseau commercial » est publiée. Elle dit « tu fixes les
   objectifs », parle de KPI et d'un « variable indexé sur la performance du réseau ». Si ce poste encadre
   les apporteurs, l'architecte recommande fermement de la dépublier tout de suite : c'est une preuve
   publique de direction du réseau, qu'aucune correction dans Partners ne neutralise. S'il n'encadre que des
   salariés, il faut la réécrire en « équipe salariée », sans « réseau », et le variable ne doit jamais être
   indexé sur les apporteurs (REQ-JUR-045). Par ailleurs, la PR axion-ia #1202 (fusionnée le 2026-09-28)
   affiche sur la fiche d'un apporteur « A postulé pour un poste de commercial SALARIÉ » et le laisse dans
   le tunnel des apporteurs : c'est un canal de mélange des deux populations, inventorié par JUR-T33, sans
   demander de la défaire. Que décidez-vous ?
2. **Par défaut : art. 3.3 c) (HYP-W19-CONCOURS), avenant, à trancher avant le premier DocuSeal.** La prise
   en charge (Société) est une antériorité de la Société ; l'apporteur reçoit le refus « déjà connue de la
   Société », motivé et contestable, avec une attestation horodatée sans identité. Autre option : l'art. 3.5,
   où la Société est « un autre apporteur » et où tout est indistinct ; le juriste la juge déséquilibrée et
   moins loyale, et elle fuit techniquement. Laquelle retenez-vous ?
3. **Par défaut : `conseiller_salarie`, affiché « Conseiller salarié », dont l'acte est « prendre en charge
   une entreprise » (HYP-W19-NOM-ROLE).** Le validez-vous ? Alternatives : `vendeur_salarie`, ou
   `charge_affaires` (déconseillé).
4. **Par défaut : HYP-W19-CYCLE, HYP-W19-CARENCE, HYP-W19-NON-EXPLOITATION et HYP-W19-LIMITES.** Naissance
   directe « active », péremption de 90 j dès la prise en charge, sans suspension, et 12 mois sans
   reconduction ; la Société comptée comme UN seul porteur, avec un délai d'attente de 90 j après toute
   libération et le SIREN fermé pendant la fenêtre de 15 j d'un rang 1 ; un délai de 30 j après une
   vérification ou un dépôt refusé d'un apporteur ; des limites par conseiller et par Société. Les bornes
   écrites au contrat (90 j, 12 mois, délai d'attente) deviennent un avenant après le premier DocuSeal.
   Confirmez-vous ?
5. **Par défaut : HYP-W19-DEPART.** Les prises en charge sans rendez-vous ni devis d'un conseiller qui part
   tombent sous 15 j, les autres courent jusqu'à leur terme, et une réaffectation vers un autre conseiller
   est possible, motivée, validée par une seconde personne, jamais vers un apporteur. D'accord ?
6. **Par défaut : HYP-W19-PART-VARIABLE (fait générateur `paiement.recu`, c'est-à-dire l'encaissement ;
   plan accepté par le salarié avant d'être actif, jamais rétroactif), HYP-W19-VARIABLE-SORTIE (un
   encaissement après le départ reste dû au sortant), HYP-W19-REGULARISATION (un impayé se régularise sur
   la période suivante, jamais en retenue) et HYP-W19-FORMAT-PAIE (Partners n'exporte que le brut « à porter
   en paie »).** Retenez-vous l'encaissement plutôt que la signature, et ces quatre défauts ?
7. **Par défaut : un seul bénéficiaire par attribution (REQ-JUR-045, HYP-W19-PART-VARIABLE).** Un conseiller
   ne touche aucun variable sur une entreprise portée par un apporteur. D'accord ?
8. **Par défaut : HYP-W19-FORMAT-PAIE (CSV générique) et HYP-W19-QUATRE-YEUX ; aucune HYP pour le
   destinataire de l'export, option conservatrice : l'export reste téléchargé par un admin ou un comptable,
   jamais envoyé.** Qui reçoit l'export (logiciel, cabinet) et sous quel format ? Combien de personnes
   auront les rôles admin et comptable ? La règle des quatre yeux exige au moins deux personnes, sinon ces
   actes sont bloqués.
9. **Par défaut : HYP-W19-ANTI-CUMUL (une personne, une population ; téléphone non collecté).** La
   candidature d'un conseiller actif est bloquée jusqu'à une revue humaine ; un apporteur embauché voit son
   contrat résilié avant l'activation, ses commissions acquises versées normalement et aucune entreprise
   transférée. Le confirmez-vous, et voulez-vous collecter le téléphone des conseillers pour ce contrôle ?
10. **Par défaut : HYP-W19-VISIBILITE et HYP-W19-OBJECTIFS ; pas de responsable des conseillers en V1.** Le
    conseiller ne voit que ses entreprises, et « non disponible » sans date pour toutes les autres, client
    d'Axion-IA compris. Le lecteur ne voit que des agrégats de conseillers. Aucun objectif ni classement.
    Validez-vous ? Voulez-vous un rôle de responsable des conseillers, ou l'admin suffit-il ?
11. **Par défaut : JUR-T03 n'est PAS étendue ; seul son chemin est corrigé.** Acceptez-vous de l'étendre
    (+0,5 j en phase 0), recommandé comme obligatoire, pour retirer « Devenez commercial IA », les mots-clés
    d'emploi et le lien des offres salariées vers `/devenir-commercial-ia` ?
12. **Par défaut : aucune HYP ; option conservatrice, aucun accès d'un conseiller à axion-ia, aucun lien
    croisé ni SSO.** Quel rôle donner, dans axion-ia, à un conseiller qui établit des devis : un rôle
    restreint, sans accès aux candidatures d'apporteurs ? Qui sont les destinataires « commercial » de
    l'espace ressources ? Voulez-vous un lien croisé ou un SSO entre les deux consoles ?
13. **Par défaut : pas d'avocat (`docs/DECISIONS.md` §5) ; les points de droit social sont arbitrés par vous,
    option conservatrice.** Rendez-vous OBLIGATOIRE, avant T-ARG-040 et DM-30, une exception limitée à ce
    chantier : un avis en droit social (statut, VRP ou non, clause de variable, sortie, CSE) et sur
    l'art. 3.3 c) ? Sans cette exception, aucun avis n'est attendu ni bloquant.
14. **Par défaut : HYP-W19-CSE (pas de mise en service sans information du CSE ou votre constat écrit qu'il
    n'y en a pas) ; aucune HYP pour la base légale, option conservatrice : exécution du contrat de travail,
    à confirmer.** Quel est l'effectif, et existe-t-il un CSE ? Quelle base légale retenez-vous pour la part
    variable ? Et retenez-vous, dans la notice RGPD des APPORTEURS, la finalité « contrôle d'incompatibilité
    avec le personnel de la Société » (REQ-JUR-043), seule mention des salariés qu'un apporteur lirait hors
    du contrat ?
15. **Par défaut : HYP-W19-SESSION-CONSOLE (12 h au plus, 8 h d'inactivité, reconnexion par lien ou code en
    3 gestes).** Est-ce acceptable pour un conseiller sur le terrain ?
16. **Par défaut : HYP-W19-HORS-LIGNE (un message clair, sans brouillon persistant).** Vous suffit-il, ou
    voulez-vous le brouillon hors ligne de l'apporteur (environ +0,5 j) ?
17. **Par défaut : le test de premier usage est joué par une personne du public si vous en fournissez une,
    sinon par un agent qui n'a pas écrit l'écran, avec une trace qui le dit (REQ-UX-047 point 7).**
    Pouvez-vous fournir, pour chaque public (apporteur de 45 à 68 ans, qualifieur, comptable, conseiller),
    une personne qui n'a jamais vu l'outil, avant la mise en service des écrans principaux ?
18. **Par défaut : « 0 violation serious ou critical » (REQ-UX-017/018) ; pour le conseiller,
    HYP-W19-A11Y-CONSEILLER (cibles de 48 px, corps d'au moins 16 px).** Gardez-vous cette règle, ou
    voulez-vous WCAG 2.2 AA complet partout ? Validez-vous les valeurs du conseiller ?
19. **Par défaut : les conseillers ne travaillent qu'à partir de la phase 2, et toutes les corrections
    transverses restent au plan.** Le chantier complet coûte 35,95 j, dont 15,7 j de corrections
    d'expérience pour tous les rôles. Le validez-vous ? Sinon, faut-il reporter une partie des corrections
    transverses (par exemple UX-P1-20 ou UX-P3-13) ?
20. **Par défaut : pas d'extension ; `reqs`, `hyp` et `zone` s'écrivent dans les acceptances et la dette est
    nommée (§6).** (Ajoutée à la transcription.) Aucun verbe hors dépôt n'écrit `reqs`, `hyp` ni `zone`
    d'une tâche existante. Autorisez-vous l'extension de la liste des champs écrivables de
    `hors-depot/outils-backlog.mjs` à ces trois champs (motif obligatoire et journal, comme les autres),
    avant GOV-115 ? Sans elle, GOV-113 lit la citation de REQ-UX-047 dans l'acceptance en repli déclaré,
    et HYP-W19-PORTEUR et HYP-W19-DEPART restent portées par DM-30 à titre provisoire.

## 10. Chiffrage et effet sur les dates

**Total : 35,95 j**, plus 0,5 j optionnel (JUR-T03). Base mesurée : registre à `c60e2f3`, environ 136 j
restent estimés ; chemin critique à 22,00 j, dont 11,75 j restants (`docs/PLAN-STATE.md:40-44`). Les phases
sont des barrières : le composeur ne rend éligible que la phase courante (`scripts/lot/composer.ts:11` et
`:173`).

- **Phase 0 : +1,25 j** (GOV-112 à 0,5 j, GOV-115 à 0,75 j), plus 0,5 j optionnel si JUR-T03 est étendue ;
  environ +0,1 à +0,4 jour calendaire. Rien ne change pour DM-03-A, DM-03-P, les INT ni JUR-T04.
- **Phase 1 : +13,5 j.** 9,0 j de corrections transverses pour tous les rôles de console : SEC-29 (1,25),
  SEC-30 (1,5), UX-P1-18 (1), UX-P1-19 (1,5), UX-P1-16 (1,5), UX-P1-20 (0,75), GOV-113 (0,75), QA-T33 (0,75).
  2,0 j de passe REQ-UX-047 : 20 écrans × 0,1 j. 2,5 j propres à W19 : UX-P1-17 (0,5), JUR-T31 (0,75), JUR-T33
  (0,5), DM-07 (+0,5), DM-08 (+0,25). Chemin critique : 22,00 → **22,75 j**, reste 11,75 → 12,50 j. Démarrage
  de la phase 2 décalé d'environ **+1,4 à +4,2 jours calendaires**, au débit repris du plan initial (non
  re-mesuré ici).
- **Phase 2 : +18,6 j.** 16,5 j W19, UX-P2-14 (1 j) et 1,1 j de passe REQ-UX-047. Branche prise en charge :
  GOV-114 → SEC-31 → SEC-32 → DM-30 → DM-31 → UX-P2-11 → QA-T31, soit 7,0 j, contre 7,5 j restants sur le
  chemin de la phase 2 : la marge n'est que de 0,5 j. Branche argent après DM-15 : T-ARG-040 → T-ARG-042 →
  T-ARG-041 → UX-P2-10, soit 4,5 j contre 5,0 j. Avec assez d'agents, la fin de phase ne bouge pas ; si le
  débit limite, compter **+1,9 à +5,8 jours calendaires**. Sérialisation réelle : SEC-31 et T-ARG-040
  écrivent le schéma, et une seule tâche `schema` passe par lot.
- **Phase 3 : +2,6 j** (UX-P3-13 à 1,5 j, passe à 1,1 j), soit +0,3 à +0,8 jour calendaire.
- **Si le débit est limitant sur tout le projet** : +3,7 à +11,2 jours calendaires.

**Bloqueurs externes nouveaux** : validations groupées des maquettes par Will (cinq séances) ; arbitrage de
l'art. 3.3 c), qui conditionne JUR-T01b et INT-T12, déjà premier bloqueur de date, et, par UX-P1-17, les
écrans d'espace UX-P1-01 et UX-P1-02 (chemin critique inchangé) ; HYP-W19-CSE, qui conditionne la mise en
service des conseillers. Un avis en droit social n'est un bloqueur que si Williams accorde l'exception de
la question 13 ; tant qu'elle n'est pas tranchée, il n'en est pas un (`docs/DECISIONS.md` §5).

**Bloqueur d'outillage** : GOV-112 attend le lot dédié avec `--settings` surchargé (GOV-116, réservé, non
versé) ou une écriture humaine par Williams des trois fichiers réservés.

**Répartition** : 15,7 j de corrections d'expérience pour tous les rôles existants, 20,25 j propres aux
salariés. C'est une projection, pas un engagement : aucune mesure n'existe de l'écart entre l'estimé et le
réel, et les estimations de phase 1 précèdent leurs acceptances.

## 11. Risques

1. **« Service organisé »** (objection du juriste, acceptée en partie) : le vocabulaire, le formulaire, les
   issues et la qualification contractuelle diffèrent désormais (REQ-JUR-044, art. 3.3 c). Le MOTEUR
   anti-doublon (index, transaction, horodatage) reste commun, parce que c'est le principe (b) posé par
   Williams et la seule façon d'éviter deux occupants. Le risque résiduel reste à évaluer par la note
   d'analyse hors dépôt, et par un avis en droit social seulement si la question 13 l'accorde.
2. **Formule unique datée, identique des deux côtés** (objection UX, rejetée) : avec
   l'art. 3.3 c), l'apporteur reçoit « déjà connue de la Société », comme pour toute antériorité, et le
   conseiller « non disponible » sans mois, à la demande de la sécurité (oracle). Unifier leur libellé
   révélerait la population. Le support s'appuie sur la carte des issues, pas sur le libellé.
3. **Délai après un acte d'apporteur** : un apporteur malveillant pourrait bloquer la Société 30 jours sur un
   SIREN en le vérifiant. C'est borné par la limite de vérification journalière de REQ-UX-007 et accepté,
   parce que la protection de l'apporteur l'emporte. Réponse uniforme « non disponible » : aucun oracle.
4. **Contrat** : si le gabarit v1 part en DocuSeal avant JUR-T31, l'art. 3.3 c) et la clause de
   non-exploitation deviennent un avenant à faire re-signer par tout le réseau. D'où INT-T12 et JUR-T01b qui
   dépendent de JUR-T31.
5. **Annonce publique d'axion-ia** : tant qu'elle reste en ligne sous sa forme actuelle, le principe (d) est
   fragilisé quoi que fasse Partners. Hors du registre Partners, cela relève de la seule décision de Williams
   (question 1).
6. **Collision de registre** : GOV-112 et GOV-115 écrivent `tasks.json` et `requirements.json` pendant que
   deux sessions codent. Parade : jetons fixés au dernier rebase, identifiants réservés (§8),
   `fusionner-registre`, RM-13.
7. **Gel de la phase 1** : si GOV-113 s'arme avant la passe de GOV-115, ou si les validations groupées de Will
   tardent, les écrans de console deviennent inattribuables. GOV-113 dépend donc de GOV-115, et les séances de
   validation sont planifiées dans UX-P1-18 et UX-P1-19.
8. **Garde lexicale** : jusqu'à GOV-114, ses limites de lecture restent ouvertes. Les formes précises sont
   tenues hors dépôt (patron GOV-109) pour ne pas publier le contournement.
9. **Quatre yeux** : si une seule personne tient les rôles admin et comptable, plans, réaffectations et
   exports sont bloqués par construction (question 8). C'est voulu : aucun contournement n'est prévu.
10. **Session de console courte** : friction pour le conseiller sur le terrain, compensée par le code à
    6 chiffres et le retour à l'URL demandée. Si Williams juge 12 h trop court, c'est un paramètre.
11. **Droit du travail et RGPD** : sans information du CSE, ou sans constat écrit, et sans AIPD, les
    conseillers ne sont pas mis en service. Plusieurs références restent à confirmer, car elles ne sont pas
    sourcées dans le dépôt : Cass. soc. 13 nov. 1996, art. 1171, 1104 et 1112-1 C. civ., art. 6.4 et 13 RGPD,
    L.1222-4, L.2312-38, L.3245-1, L.3251-1 et L.7313-11 C. trav.
12. **Anti-cumul par empreinte** : c'est un signal contournable (seconde adresse, prête-nom), pas une
    protection. La défense repose sur la déclaration de conflit d'intérêts et sur la revue humaine.
13. **Marge de la phase 2** : la branche prise en charge (7,0 j) frôle le chemin restant (7,5 j). Un
    glissement de 0,5 j la fait passer sur le chemin critique.
14. **Glissement** : si Williams avance les conseillers en phase 1, la phase 1 prend environ 17 j de plus et
    la phase 2 démarre d'autant plus tard.
15. **Chiffrage** : 35,95 j au lieu des 16,5 j du plan initial. L'écart vient surtout des corrections
    d'expérience pour tous les rôles (15,7 j, dont 4,2 j de passe sur les écrans existants et 5 j de
    maquettes). Reporter UX-P1-20 ou UX-P3-13 est possible, mais réduit l'exigence « sans formation ».

## 12. Expérience par population

L'exigence de Williams : quiconque arrive sur l'outil trouve une expérience fluide, sans friction, intuitive,
moderne, parfaitement organisée, utilisable sans formation ; chaque rôle voit une navigation pensée pour lui,
sans fonctions parasites d'un autre rôle.

| Population | Parcours clés | Frictions corrigées | Tâches porteuses |
| --- | --- | --- | --- |
| **Apporteur d'affaires** (espace, mobile) | Recevoir le lien ou le code, puis entrer dans l'espace en une action, sur l'URL demandée. Vérifier puis déposer : au plus 8 interactions et 90 s (REQ-UX-001), mesurés par la fixture QA-T33. Chaque issue dit pourquoi et quoi faire. Une entreprise prise en charge (Société) donne « déjà connue de la Société », avec la possibilité de contester et une preuve horodatée. Consulter « Mes entreprises ». Ne jamais rien voir d'un salarié. | Cul-de-sac après le lien (`ecran.tsx:76-82`) : redirection directe. Refus opaque face à la Société : motif contractuel (3.3 c), contestation et attestation. Liste « Plus » incohérente, 6 contre 5 entrées : liste dérivée. Teinte « versé » confondue avec l'accent en thème sombre. Seuils de REQ-UX-017 (48 px, corps de 18 px) protégés contre toute régression. Test de premier usage par une personne de 45 à 68 ans. Page publique d'axion-ia qui décrit l'activité comme un métier salarié : JUR-T03. | UX-P1-04, UX-P1-17, UX-P1-08, UX-P1-01, UX-P1-02, QA-T33, JUR-T31, JUR-T03, QA-T31 |
| **Conseiller salarié** (console, mobile d'abord) | Invitation, puis premier accès : notice et déclaration en au plus 3 gestes, puis son accueil : ses entreprises triées par échéance, un champ Vérifier, « à échéance dans 15 jours ». Vérifier puis prendre en charge en au plus 8 interactions et 90 s sur téléphone, avec autocomplétion et repli manuel. Avis par e-mail à J-15 et à la fin. « Ma part variable » avec la base de calcul ligne par ligne et le plan accepté. Quatre entrées de navigation, barre inférieure en mobile. | Aucun rôle, aucune connexion ni aucun écran n'existaient. Aucun rappel avant la perte d'une entreprise : avis à J-15. Console seulement sur bureau : cadre à 375 px, cibles et corps de HYP-W19-A11Y-CONSEILLER, projets mobiles. Réponse opaque sur une entreprise occupée : « non disponible », uniforme et assumé. Vocabulaire parasite de l'apporteur (déposer, commission, lot, objectif) : retiré. Aucun contrôle de son calcul de variable : base par ligne. Aucune mesure de son activité. | SEC-29, SEC-30, SEC-31, SEC-32, DM-30, DM-31, UX-P2-11, UX-P2-13, UX-P2-10, UX-P2-15, JUR-T32 |
| **Administrateur** (console) | Accueil « à traiter aujourd'hui », avec repli sur Utilisateurs en phase 1. Inviter en au plus 4 interactions, l'écran expliquant chaque rôle en une phrase. Désactiver avec effet immédiat. Recherche globale depuis tout écran (« / »), en au plus 3 interactions vers une fiche. Fiche conseiller : saisir un plan en au plus 6 interactions, réaffecter en masse en au plus 5, avec aperçu. Valider l'acte d'une autre personne. Totaux par origine, sans classement mêlé. | Utilisateurs créés seulement par le seed : écran d'administration. Aucune carte des routes ni navigation par métier : navigation dérivée. Accueil sur un écran inexistant en phase 1 : repli guidant. Aucun écran d'accès refusé. Réaffectation et plan de part variable sans écran : UX-P2-12. Risque de tout faire seul : quatre yeux et notifications. Page « Votre rôle ». | SEC-30, UX-P1-16, UX-P1-18, UX-P1-20, UX-P2-12, T-ARG-042, GOV-113 |
| **Qualifieur** (console) | Arrivée directe sur la file de qualification, triée. Fiche en ligne en au plus 6 interactions (REQ-UX-021). Recherche par SIREN. Aucune entrée d'un autre métier. La réponse à une contestation d'antériorité s'appuie sur l'attestation générée. | La maquette montrait les lots au qualifieur (`file-qualification.html:800-806`) : navigation filtrée. Aucune maquette validée de ses écrans : UX-P1-19. Les prises en charge de la Société n'entrent jamais dans sa file. Un qualifieur ne peut pas devenir conseiller avant un délai, ce qui protège les apporteurs dont il a vu les dépôts. | UX-P1-16, UX-P1-19, UX-P1-07, UX-P1-06, DM-09, DM-31, SEC-31 |
| **Comptable** (console) | Phase 1 : accueil de repli guidant, qui dit que le lot du mois arrive en phase 2 et ce qui est déjà consultable. Phase 2 : arrivée sur le lot du mois, approbation et pain.001. « Export paie » est une entrée distincte sous « Argent » : valider l'acte d'une autre personne et exporter en au plus 4 interactions. La régénération est motivée. | La maquette montrait la qualification au comptable : navigation filtrée. Accueil sur un écran inexistant en phase 1 : repli. Risque de ranger la paie dans le lot SEPA : écrans et tables séparés. Aucune séparation des fonctions : quatre yeux. | UX-P1-16, UX-P1-18, UX-P2-03, UX-P2-14, T-ARG-041, T-ARG-042, UX-P2-10 |
| **Lecteur** (console) | Phase 1 : repli sur Apporteurs en lecture seule si le droit existe, sinon un état guidant. Phase 3 : pilotage, avec les onglets « Réseau d'apporteurs » et « Conseillers salariés ». Ce dernier ne montre que des agrégats, masqués sous 3. Aucun montant individuel, aucun export, aucune donnée de paie. | Accueil sur le pilotage, qui n'est livré qu'en phase 3 : repli. Tableau nominatif de salariés visible par un rôle qui n'en a pas besoin : agrégats seulement. Maquettes de la phase 3 produites (UX-P3-13). | UX-P1-16, DM-29, UX-P3-07, UX-P3-09, UX-P3-13 |
