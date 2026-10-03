# Chantier W19 — conseillers salariés dans Partners : le plan à inscrire

> **Statut : VERSÉ PAR GOV-115 (2026-09-30). Ce fichier est désormais HISTORIQUE : les registres font
> foi** (`docs/DECISIONS.md`, `docs/requirements.json`, `docs/tasks.json`, `docs/GLOSSAIRE.md`). Écarts
> de transcription décidés par A01 et tracés dans la PR de GOV-112 et GOV-115 : la durée d'attribution
> est de 6 mois depuis la décision de Williams du 2026-09-30 (REQ-DM-048 et DM-13 renvoient à
> `FENETRE_MOIS`, aucun « 12 mois » recopié) ; les exigences nouvelles sont entrées par le verbe
> `ajouter-exigence.mjs` en session ordinaire, le lot dédié de GOV-116 n'écrivant que les trois fichiers
> réservés ; les fiches « externe will » portent la validation de Williams dans leur acceptance, avec
> `externe` nul (patron UX-P1-40).
>
> **Statut d'origine : PROPOSITION DE PLAN, pas encore au registre.** Ce fichier est la **source d'entrée** de
> deux tâches versées au backlog par la même PR : **GOV-112** (inscrire la décision, les hypothèses,
> les exigences et le glossaire) et **GOV-115** (verser les tâches W19, amender les tâches existantes,
> poser REQ-UX-047 sur les tâches d'écran). La même PR verse aussi deux tâches d'outillage :
> **GOV-116** (le lot dédié du `gardien-spec`) et **GOV-117** (écrire `reqs`, `hyp` et `zone` d'une
> tâche existante). Il ne décide rien : le principe est la décision de Will du 2026-09-29, le plan est
> celui de l'architecte (A02) après cinq lentilles, et ce fichier le **transcrit**.
>
> **Réponses de Williams du 2026-09-29 (session -d7), appliquées dans tout le plan** : question 1
> (rien à faire sur l'annonce axion-ia), question 2 (art. 3.5 retenu, art. 3.3 c) rejeté), question 12
> (aucun accès du conseiller à axion-ia en V1), question 13 (pas d'avocat, aucune exception),
> question 20 (option A : GOV-117), question 21 (GOV-116) et question 22 (option A : les conseillers
> travaillent dans le CRM Pro, le registre d'antériorité reste dans Partners, exposé par une « API 3 »).
> Leur texte daté est au §9, avec la réponse de la gouvernance Partners au ticket #220.
>
> **Deux ensembles, chiffrés à part (§10).** Le **chantier salariés W19** (21,0 j, outillage du
> registre compris) et le **lot transverse « confort de la console pour tous les rôles »** (15,7 j :
> admin, qualifieur, comptable, lecteur), que Williams garde au plan le 2026-09-29 et qui ne suppose
> plus aucun conseiller dans la console. Total Partners : **36,7 j**. Le travail du CRM Pro
> (≈ 5,5 j) est hors du registre Partners.
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
> mécanisme en « reste à faire ». Williams a choisi, le 2026-09-29, que **GOV-116** l'écrive, le
> documente et le teste (§5, question 21). GOV-112, et toute tâche W19 qui écrit `docs/GLOSSAIRE.md`,
> `docs/DECISIONS.md` ou `docs/PRESEANCE.md`, dépendent donc de GOV-116.
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

**Le choix de Williams sur le concours (question 2, réponse du 2026-09-29, session -d7).** L'architecte
proposait un nouvel art. 3.3 c) : la prise en charge par la Société devenait une antériorité de la
Société, avec un refus motivé et une valeur `anteriorite_suivi`. **Williams le rejette et retient
l'art. 3.5**, où la Société est traitée comme un autre apporteur. Ses mots : « l'apporteur voit que
l'entreprise est déjà faite par quelqu'un d'autre, pour éviter deux commissions à verser (les
commerciaux d'Axion-IA sont aussi commissionnés sur les ventes), comme si c'était un autre apporteur ».
Conséquences :

- côté apporteur, une prise en charge par un conseiller est **INDISCERNABLE** d'une occupation par un
  autre apporteur : même issue de dépôt, même texte, mêmes états visibles, mêmes délais, et même
  réponse de l'API 1 et de « Vérifier une entreprise » (REQ-SEC-042) ;
- **aucune valeur nouvelle** `anteriorite_suivi` dans `IssueDepot` ni `MotifRefusDepot` ;
- un seul bénéficiaire par attribution (question 7 : par défaut, pas de double rémunération) ;
- le contrat (JUR-T31, art. 3.5) dit en termes généraux que l'entreprise peut être déjà prise « par un
  autre apporteur ou par la Société ou ses préposés », sans que l'outil révèle jamais qui.

**Les trois défauts que le plan reprochait à 3.5 deviennent des exigences de conception** :

- (i) fuite par l'état `active` immédiat : la prise en charge suit la même chronologie et les mêmes
  états visibles qu'un dépôt d'apporteur (HYP-W19-CYCLE, DM-08) ;
- (ii) tenue par l'API 1 : même réponse qu'une attribution d'apporteur, sous un test d'indistinction
  (REQ-INT-014 amendée, QA-T31) ;
- (iii) la Société concurrente de ses cocontractants : risque **accepté par Williams** (§11), borné par
  les garde-fous anti-abus ci-dessous (limites, délai après un acte d'apporteur, fenêtre du rang 1,
  quatre yeux).

L'identité et la nature salariée du préposé ne sont jamais révélées. Une file d'apporteurs se forme
derrière une prise en charge comme derrière un apporteur ; le conseiller, lui, n'entre jamais en file.

**Le lieu de travail des conseillers (question 22, réponse de Williams du 2026-09-29 : option A).**
Les conseillers travaillent au quotidien dans le **CRM Pro** (dépôt séparé `will383842/axion-crm-pro`).
**Partners décide** : le registre d'antériorité unique reste dans Partners, qui seul enregistre une
prise en charge. La répartition :

- **Partners** : le registre (DM-07 et DM-08 amendées, porteur XOR apporteur / conseiller) ; la
  transaction de prise en charge (DM-30) et le « Vérifier » du conseiller (DM-31), exposés au CRM Pro par
  l'**API 3** (SEC-34, décrite par l'ADR INT-T28) ; toutes les bornes W19 (cycle, délai d'attente,
  limites, départ, non-exploitation, anti-cumul) ; la fiche conseiller côté admin et la réaffectation à
  quatre yeux (UX-P2-12) ; la part variable et l'export paie (T-ARG-040, T-ARG-041, T-ARG-042) ; le
  contrat, le RGPD, la garde lexicale et l'indiscernabilité côté apporteur (question 2, QA-T31) ; le
  rattachement des identités conseiller entre le CRM Pro et Partners (DM-32).
- **CRM Pro** (≈ 5,5 j, hors du registre Partners, à faire par la session CRM Pro dans son dépôt,
  APRÈS le gel du contrat de l'API 3) : un rôle « commercial » neuf, sans export, sans suppression et
  sans accès en masse aux données personnelles, qui ne réutilise pas le rôle `operator` ; le bouton
  « Prendre en charge », le statut « à vous / non disponible », la liste « Mes entreprises » et l'avis
  J-15 ; le durcissement multi-utilisateur.
- **axion-ia** : devis, signature et facture, toujours par la direction. Le contrat d'événements v2
  reste inchangé. Aucun accès du conseiller à axion-ia en V1 (question 12).

Conséquences dans ce plan : **UX-P2-11** (espace de travail du conseiller dans la console) est
**supprimée** ; GOV-114, SEC-32, DM-31, UX-P2-15 et UX-P2-10 sont **réduites** ; **INT-T28** (ADR de
l'API 3), **SEC-34** (l'API 3, son jeton et ses tests) et **DM-32** (rattachement des identités) sont
**ajoutées**. Le conseiller n'a aucune session de console Partners en V1. HYP-W19-SESSION-CONSOLE,
HYP-W19-HORS-LIGNE et HYP-W19-A11Y-CONSEILLER quittent la §2 : ce sont des exigences du rôle CRM,
listées dans l'ADR INT-T28 pour la session CRM Pro.

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
- le conseiller voit « non disponible », sans mois, dans le CRM Pro comme dans toute réponse de l'API 3 ;
- l'API 3 n'accepte qu'un jeton de service propre, limité à ses routes, et Partners vérifie lui-même
  que le conseiller désigné est actif (SEC-34, DM-32).

**Droit du variable (juriste)** : un plan n'est actif qu'après son acceptation par le salarié et n'est
jamais rétroactif ; le sort du variable à la sortie et la régularisation sont posés en HYP ; information
du CSE, ou constat écrit qu'il n'y en a pas, avant la mise en service (HYP-W19-CSE). **Pas d'avocat, et
aucune exception à `docs/DECISIONS.md` §5 (question 13, réponse de Williams du 2026-09-29)** : aucun avis
en droit social n'est attendu. Chaque point de droit social (statut, VRP, clause de variable, sortie,
CSE) prend l'option la plus prudente par défaut, marquée « à arbitrer par Williams », et ne bloque
aucune tâche (table du §9, question 13).

**L'exigence d'expérience de Williams est outillée et chiffrée pour TOUS les rôles, dans un lot
transverse distinct du chantier salariés : « confort de la console pour tous les rôles »** (admin,
qualifieur, comptable, lecteur ; décision de Williams du 2026-09-29, qui le garde au plan). Ce lot ne
suppose aucun conseiller dans la console : il vaut par lui-même, et resterait entier si W19 était retiré.
Il compte SEC-29, SEC-30, UX-P1-16, UX-P1-18, UX-P1-19, UX-P1-20, GOV-113, QA-T33, UX-P2-14, UX-P3-13
et les passes REQ-UX-047 sur les écrans existants (15,7 j, §10).

- REQ-UX-047 CITE REQ-UX-017, REQ-UX-018 et REQ-UX-019 au lieu de les contredire. Budgets en SSOT,
  mesurés par une fixture (QA-T33), temps réel de première action, test de premier usage par une personne
  du public.
- Accueil par rôle ET par phase, avec un repli guidant : pas de 404 pour le comptable, le lecteur ni
  l'admin en phase 1.
- Des producteurs de maquettes : UX-P1-18, UX-P1-19, UX-P2-14 et UX-P3-13 pour la console de tous les
  rôles ; UX-P2-15, réduite, pour la paie et la fiche conseiller de l'admin (chantier W19).
- Cadre de console réactif à 375 px (un admin ou un comptable consulte aussi sur téléphone), code à
  6 chiffres à la connexion de console, recherche globale et page « Votre rôle ».
- Une passe de GOV-115 écrit REQ-UX-047 dans le champ `reqs` des tâches d'écran `a_faire` existantes,
  par le verbe que livre GOV-117 (question 20, option A), avant que GOV-113 rougisse : 45 à `c60e2f3` (46 mesurées, moins JUR-T04, nommée parce que sa branche
  `t/jur-t04` est en travail). La liste est re-mesurée à la fusion de `main` : la scission de JUR-T04
  décidée par Williams le 2026-09-29 crée une tâche d'écran `/confidentialite` qui y entre.

**Coût, chiffré à part (§10)** : **chantier salariés W19 : 21,0 j** (19,25 j propres aux salariés,
après la question 22, et 1,75 j d'outillage du registre, GOV-116 à 1 j et GOV-117 à 0,75 j) ; **lot
transverse « confort de la console pour tous les rôles » : 15,7 j**, dont 4,2 j d'ajustement REQ-UX-047
des écrans existants ; **total Partners : 36,7 j** (37,45 j avant la question 22, 16,5 j dans le plan
initial), plus 0,5 j optionnel (JUR-T03). Le travail du CRM Pro (≈ 5,5 j) n'est pas au registre
Partners. Chemin critique : 22,00 → 22,75 j (DM-07 +0,5, DM-08 +0,25), à recalculer par GOV-115 avec
GOV-116 et GOV-117 en amont (§10).

## 2. Nom du rôle

Identifiant d'enum `conseiller_salarie`, ajouté à `ConsoleRole` par SEC-31 (phase 2). C'est le rôle du
porteur d'une prise en charge dans le registre de Partners ; il n'ouvre aucune session de console en V1,
le conseiller travaillant dans le CRM Pro (question 22). Dans le CRM Pro, le rôle neuf s'appelle
« commercial » : ce nom appartient au dépôt du CRM Pro, n'entre ni au glossaire ni au code de Partners,
et l'API 3 ne le transporte jamais. Libellé de console « Conseiller salarié », pluriel « Conseillers
salariés ». Terme de glossaire « conseiller salarié ». Son
acte s'appelle « prendre en charge une entreprise » (terme de glossaire « prise en charge (Société) »,
événement `prise_en_charge_par_la_societe`). Il ne « dépose » ni ne « déclare » jamais : ces verbes
restent ceux de l'apporteur (REQ-JUR-044, GLOSSAIRE §6).

**Termes à verser au GLOSSAIRE §8 par GOV-112, libellés fixés ici une fois pour toutes :**

- **« conseiller salarié »** : utilisateur de console au rôle `conseiller_salarie`, préposé de la Société.
- **« prise en charge (Société) »** : l'acte horodaté par le serveur par lequel un préposé de la Société
  inscrit une entreprise comme prise par la Société, au sens de l'art. 3.5 amendé du contrat
  (entreprise déjà prise « par un autre apporteur ou par la Société ou ses préposés »). **Ce n'est
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
`deny` Write/Edit (`.claude/settings.json:96-103`). Ce lancement passe par le mécanisme du lot dédié
avec `--settings` surchargé, qui n'existe pas encore : Williams a choisi le 2026-09-29 que GOV-116
l'écrive et le teste (question 21), et GOV-112 en dépend. Aucun mot de la doctrine de `gov:publication` (`scripts/gates/gov-publication.ts:33-41`) ne
doit y figurer.

### §1 — une ligne, cinq colonnes

**Seul le principe est tranché** par Williams le 2026-09-29. Chaque modalité est une hypothèse par
défaut, lue « par défaut : … (HYP-W19-X) », et reste ouverte tant que la question du §9 qui la vise n'a
pas reçu de réponse datée.

| Id | Décision | Contenu | Phase | Propriétaire |
| --- | --- | --- | --- | --- |
| **W19** ✅ *principe tranché 2026-09-29* | Conseillers salariés dans Partners, strictement séparés des apporteurs | **Principe tranché par Will le 2026-09-29 : deux populations, un seul registre d'entreprises, deux chaînes d'argent, cloisonnement strict entre les deux populations.** Les modalités ci-dessous sont des hypothèses par défaut, non tranchées. **(a) Rôle et cloisonnement.** Tranché par Williams le 2026-09-29 (question 22, option A) : le salarié travaille dans le CRM Pro ; Partners garde le registre d'antériorité unique et seul y enregistre une prise en charge, par la console admin ou par l'API 3. Par défaut : dans Partners, le salarié est un utilisateur de console au rôle `conseiller_salarie`, porteur d'attributions, sans session de console en V1 (HYP-W19-NOM-ROLE). Par défaut : il n'entre jamais dans l'espace, n'a aucun droit hérité et ne voit que ses prises en charge (HYP-W19-VISIBILITE). Aucun écran, e-mail ni document de l'espace ne le nomme, ne le compare ni ne le mesure. Par défaut : seuls le contrat et la notice RGPD en parlent, au titre des « préposés de la Société » et du « personnel de la Société » (REQ-JUR-043, REQ-SEC-041, REQ-SEC-042 ; question 14). **(b) Une seule base d'entreprises.** Même base, même index d'occupation par SIREN, même horodatage serveur (REQ-DM-048 ; par défaut : HYP-W19-PORTEUR). L'acte du conseiller est une prise en charge (Société), au vocabulaire distinct (REQ-JUR-044). Tranché par Williams le 2026-09-29 (question 2) : vue par l'apporteur, c'est une occupation indiscernable de celle d'un autre apporteur (art. 3.5 amendé, HYP-W19-CONCOURS), avec les mêmes issue, texte, états, délais et réponses de l'API 1 et de « Vérifier » ; l'art. 3.3 c) est rejeté ; un seul bénéficiaire par attribution. Par défaut : mêmes bornes que l'apporteur, la Société comptant comme un seul porteur, avec un délai d'attente, une fenêtre réservée au rang 1, des limites par conseiller et par Société et une clause de non-exploitation (HYP-W19-CYCLE, HYP-W19-CARENCE, HYP-W19-LIMITES, HYP-W19-NON-EXPLOITATION, HYP-W19-DEPART, HYP-W19-SOURCE, HYP-W19-IDENTITE-CRM ; questions 4 et 5). **(c) La part variable passe par un export paie.** Aucune ligne de commission, aucun relevé, aucune autofacture, aucun lot, aucune DAS2, aucun parrainage. Par défaut : le plan de part variable est accepté par le salarié, jamais rétroactif, validé à quatre yeux, et vit hors dépôt ; il n'est jamais indexé sur l'activité des apporteurs (REQ-ARG-036, REQ-ARG-037, REQ-ARG-038, REQ-JUR-045, HYP-W19-PART-VARIABLE, HYP-W19-VARIABLE-SORTIE, HYP-W19-REGULARISATION, HYP-W19-QUATRE-YEUX, HYP-W19-FORMAT-PAIE, HYP-W19-DROITS-PAIE ; questions 6 à 8). **(d) Protections de l'apporteur inchangées.** REQ-JUR-*, garde lexicale, aucune instruction, aucun contrôle d'activité. Par défaut : une personne n'appartient qu'à une seule population (REQ-CPL-030, HYP-W19-ANTI-CUMUL, HYP-W19-ROLE-MOUVANT ; question 9). Par défaut : aucun objectif, chiffré ou non, ni classement de conseiller (HYP-W19-OBJECTIFS ; question 10). Par défaut : le CSE est informé, ou un constat écrit dit qu'il n'y en a pas, avant la mise en service (HYP-W19-CSE ; question 14). **(e) Exigence transverse, lot « confort de la console pour tous les rôles », distinct du chantier salariés.** Chaque rôle de console (admin, qualifieur, comptable, lecteur) a une navigation dérivée de la matrice, un accueil par phase et des écrans dont le budget est mesuré et le premier usage testé (REQ-UX-047, REQ-UX-048). La session, le hors-ligne et l'accessibilité du conseiller sont des exigences du rôle CRM, listées dans l'ADR de l'API 3 (INT-T28) | 1 et 2 (principe tranché, modalités par défaut) | Will |

### §2 — vingt et une lignes, sept colonnes

Vingt-trois avant la question 22 : HYP-W19-SESSION-CONSOLE, HYP-W19-HORS-LIGNE et
HYP-W19-A11Y-CONSEILLER sortent de la §2 (réponse de Williams du 2026-09-29, question 22). Le conseiller
n'ayant aucune session de console Partners, ce sont des exigences du rôle « commercial » du CRM Pro,
listées dans l'ADR de l'API 3 (INT-T28) pour la session CRM Pro, avec les valeurs proposées au plan
(session de 12 h au plus et 8 h d'inactivité, reconnexion en 3 gestes ; pas de brouillon persistant,
aucune occupation avant la réponse de Partners ; cibles d'au moins 48 px et corps de texte d'au moins
16 px).

Vingt et une depuis la relecture de la lentille `securite` sur #230 (`830a648`) : HYP-W19-IDENTITE-CRM entre en §2, parce que l'identité
du conseiller transmise par l'API 3 est une hypothèse de confiance envers le CRM Pro, qui doit se lire
comme telle et se trancher comme les autres ; et la valeur par défaut de la limite de la Société
(HYP-W19-LIMITES) est abaissée, parce que c'est elle, et non la limite par conseiller, qui borne un CRM
Pro compromis.

| Id | Décision | Hypothèse appliquée | Réversibilité | Phase | À trancher avant | Tranchée |
| --- | --- | --- | --- | --- | --- | --- |
| HYP-W19-NOM-ROLE | Nom du rôle (a) | `conseiller_salarie`, « Conseiller salarié » ; acte « prendre en charge » | migration | 2 | SEC-31 | — |
| HYP-W19-PORTEUR | Porteur (b) | Une seule table `attributions`. `apporteur_id` XOR `utilisateur_console_id` (patron SEC-17). Grille présente si et seulement si le porteur est un apporteur. `CanalDepot.console` si et seulement si le porteur est un conseiller, si et seulement si `jeton_depot_id IS NULL`. Un déclencheur exige un `conseiller_salarie` non désactivé | migration | 1 | DM-07 | — |
| HYP-W19-CONCOURS | Concours avec l'apporteur (b) | Art. 3.5 amendé : vue par l'apporteur, une prise en charge par un préposé de la Société est une occupation par « un autre apporteur ou par la Société ou ses préposés », indiscernable de celle d'un apporteur : même issue de dépôt, même texte, mêmes états visibles, mêmes délais, même réponse de l'API 1 et de « Vérifier ». Aucune valeur nouvelle d'`IssueDepot` ni de `MotifRefusDepot`. Une file d'apporteurs se forme derrière elle comme derrière un apporteur. Un seul bénéficiaire par attribution. Le contrat le dit en termes généraux ; l'outil ne révèle jamais qui occupe. Alternative rejetée : art. 3.3 c) (antériorité de la Société, `anteriorite_suivi`) | avenant | 1 | premier DocuSeal | Williams, 2026-09-29 (question 2) : art. 3.5 |
| HYP-W19-NON-EXPLOITATION | Non-exploitation (b) | La Société n'utilise ni les vérifications, ni les déclarations refusées ou en attente, ni les coordonnées déclarées par un apporteur pour prendre en charge une entreprise. Techniquement : délai `RESERVE_APRES_ACTE_APPORTEUR_JOURS` = 30 (SSOT) | avenant | 1 | premier DocuSeal | — |
| HYP-W19-CYCLE | Cycle (b) | Naissance par `prise_en_charge_par_la_societe`. Vue de l'espace et de l'API 1, la prise en charge suit la MÊME chronologie, les MÊMES états visibles et les MÊMES délais qu'un dépôt d'apporteur (exigence de conception de la question 2) : même état d'entrée, passage à `active` au même délai que la confirmation d'un dépôt, par l'horloge serveur et sans qualifieur ; même date « jusqu'au » au même moment. En interne : ni qualification par un qualifieur, ni `non_confirme`, ni gel, ni `figee_resiliation`, ni contestation, ni rang en file pour le conseiller ; aucune de ces différences ne se voit de l'espace. Péremption de 90 jours et fenêtre de 12 mois sans reconduction, aux mêmes règles visibles que l'apporteur. Prolongation W9 identique à celle de l'apporteur. Hors palier, taux et capacité. Les bornes de 90 jours et de 12 mois s'écrivent aussi au contrat (JUR-T31 (2)) : après signature, les changer demande un avenant | migration | 1 | DM-08 ; premier DocuSeal | — |
| HYP-W19-CARENCE | Délai d'attente (b) | Aucun conseiller ne prend en charge un SIREN libéré depuis moins de `CARENCE_CONSEILLER_JOURS` = 90 [SUPPRIMÉE le 2026-10-02 (réponse « A. »)], quel que soit le porteur sortant, la Société comptant comme un seul porteur. SIREN fermé aux conseillers pendant la fenêtre `FILE_FENETRE_REDECLARATION_JOURS` d'un rang 1. Borne écrite au contrat v1 par JUR-T31 (2), son porteur : la changer après signature demande un avenant | avenant | 1 | premier DocuSeal | — |
| HYP-W19-LIMITES | Volume (b) | Limite par conseiller, égale à la limite de l'apporteur, et limite de la Société FIXE, égale à la limite d'UN apporteur quel que soit le nombre de conseillers actifs (SSOT) ; la relever est une décision datée de Will. Valeur abaissée après la relecture de la lentille `securite` sur #230 (`830a648`) : l'identité du conseiller est affirmée par le CRM Pro (HYP-W19-IDENTITE-CRM), donc un CRM Pro compromis, ou son jeton, peut nommer tour à tour chaque conseiller actif ; la limite par conseiller se multiplie alors par leur nombre, et seule la limite de la Société borne le flux entier. L'ancienne valeur (limite de l'apporteur × nombre de conseillers actifs) la faisait croître avec l'effectif, c'est-à-dire avec ce qu'un appelant compromis peut consommer. Alerte de volume sur le jeton et sur la Société, agrégée et jamais nominative, active sans condition (SEC-34) ; anomalie par conseiller au-delà d'un seuil journalier, active une fois la condition HYP-W19-CSE remplie. Le mot « quota » n'est jamais employé (famille `quota` du lexique interdit, `src/domain/lexique/lexique-interdit.ts:109-116`). Le contrat ne donne aucune valeur de limite : l'hypothèse reste un paramètre | paramètre | 2 | — | — |
| HYP-W19-DEPART | Départ (b) | À la désactivation, les prises en charge sans suite (ni rendez-vous ni devis) deviennent `perimee` sous 15 jours. Les autres courent jusqu'à leur terme, sans prolongation. Réaffectation seulement de conseiller à conseiller, par `admin`, motivée, validée à quatre yeux, notifiée au conseiller dépossédé. Jamais vers ou depuis un apporteur | migration | 1 | DM-08 | — |
| HYP-W19-SOURCE | Source (b) | Seule une prise en charge enregistrée par Partners (console admin ou API 3) occupe un SIREN ; rien n'est déduit d'un statut CRM ni d'un devis. Contrat d'événements v2 inchangé | paramètre | 2 | — | Williams, 2026-09-29 (question 22) : texte ci-contre |
| HYP-W19-IDENTITE-CRM | Identité du conseiller à l'API 3 (a) | HYPOTHÈSE DE CONFIANCE envers le CRM Pro : l'identité du conseiller qui appelle l'API 3 est affirmée par le CRM Pro. Elle est dérivée de la session CRM Pro authentifiée du conseiller, jamais saisie ni choisie dans un champ. Partners vérifie ce qu'il peut vérifier : le jeton de service, et une référence rattachée par DM-32 à un `conseiller_salarie` actif ; il ne prouve pas que la personne derrière la session est celle que la référence désigne. Un CRM Pro compromis, ou son jeton, peut donc agir au nom de tout conseiller actif. Ce qui borne alors le dommage : la limite de la Société, fixe (HYP-W19-LIMITES), l'alerte de volume sans condition (SEC-34), le journal de chaque appel, la révocation du jeton. Alternative non retenue par défaut : une assertion signée par conseiller et vérifiée par Partners, qui demande une seconde authentification | migration | 1 | INT-T28 | — |
| HYP-W19-ROLE-MOUVANT | Changement de rôle (d) | Refus de quitter `conseiller_salarie` tant que la personne porte une attribution occupante. Refus d'y passer depuis `qualifieur` ou `admin` avant `DELAI_CHANGEMENT_POPULATION_JOURS` = 180 (SSOT). Contrôle anti-cumul à tout passage vers ce rôle | paramètre | 2 | — | — |
| HYP-W19-ANTI-CUMUL | Une personne, une population (d) | Contrôle croisé de l'empreinte de courriel (même domaine, `src/server/securite/pii.ts:298-302`), téléphone sur décision de Will. C'est un signal, pas une protection. Candidature d'un conseiller actif : BLOQUÉE jusqu'à revue humaine. Apporteur embauché : contrat résilié avant l'activation du compte, commissions acquises versées par la chaîne des apporteurs, aucune attribution transférée. Ni parrain ni filleul | paramètre | 2 | — | — |
| HYP-W19-PART-VARIABLE | Part variable (c) | Plan versionné par conseiller, jamais dans le dépôt. Actif seulement après `accepte_at` et l'empreinte du document présenté. Date d'effet au moins égale à l'acceptation et au jour courant, et postérieure à la dernière période exportée. Fait générateur : `paiement.recu` sur une attribution du conseiller lui-même, jamais un agrégat du réseau. Aucune lecture de `COMMERCIAL_COMMISSIONS` ni du champ `commission` de `devis.signe` | migration | 2 | T-ARG-040 | — |
| HYP-W19-VARIABLE-SORTIE | Variable après départ (c) | Un encaissement postérieur au départ reste dû au sortant et part dans la dernière période ouverte, puis clôture. Point de droit social : option la plus prudente par défaut, à arbitrer par Williams ; aucun avis extérieur (question 13, `docs/DECISIONS.md` §5) ; ne bloque aucune tâche | migration | 2 | T-ARG-040 | — |
| HYP-W19-REGULARISATION | Avoir ou impayé (c) | Ligne négative reportée sur la période suivante, jamais sur un export figé, jamais exportée comme une retenue | paramètre | 2 | — | — |
| HYP-W19-QUATRE-YEUX | Séparation des fonctions (c) | Plan, réaffectation et validation de l'export : l'auteur et le validateur sont deux personnes distinctes, parmi les `admin` et `comptable` (patron REQ-CPL-010). Création d'un admin : validée par un autre admin s'il en existe un. Toute création d'admin ou de conseiller, et toute réaffectation, est notifiée à tous les admins | paramètre | 2 | — | — |
| HYP-W19-FORMAT-PAIE | Format (c) | CSV générique par période : matricule, période, rubrique, montant « à porter en paie », référence opaque. Empreinte stockée, ré-export identique à l'octet | paramètre | 2 | — | — |
| HYP-W19-DROITS-PAIE | Droits (c) | `action:exporter_paie` et `ecran:parts_variables` pour `admin` et `comptable`, avec step-up et journal. Le conseiller n'a aucun écran Partners en V1 (question 22) : aucune restitution de sa part n'y est servie, le bulletin fait foi | paramètre | 2 | — | — |
| HYP-W19-VISIBILITE | Ce que le conseiller voit (a) | Ses prises en charge seulement, servies au CRM Pro par l'API 3. Pour le reste, « non disponible », SANS mois, SANS identité, stade ni population, pour toutes les causes. Pas de responsable des conseillers en V1 | paramètre | 2 | — | — |
| HYP-W19-OBJECTIFS | Pilotage (d) | Aucun objectif, chiffré ou non, ni classement de conseiller. Onglets séparés. Le lecteur ne voit que des agrégats, et une cellule de moins de 3 conseillers est masquée. Vue nominative réservée à l'admin, avec journal de lecture | paramètre | 3 | — | — |
| HYP-W19-CSE | Information préalable (d) | Information du CSE, ou constat écrit et daté par Will qu'il n'y en a pas, avant la mise en service de DM-30 et de l'API 3 (SEC-34). Point de droit social : option la plus prudente, à arbitrer par Williams (question 13) ; condition de mise en service, qui ne bloque la livraison d'aucune tâche. Aucun indicateur d'activité du conseiller n'est restitué | paramètre | 2 | mise en service de DM-30 et de SEC-34 | — |

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
- Vue de l'espace et de l'API 1, l'attribution du conseiller suit la même chronologie, les mêmes états
  visibles et les mêmes délais que celle d'un apporteur (HYP-W19-CYCLE). Sa fenêtre de 12 mois n'est
  pas reconduite. W9 s'applique à l'identique. Ce qui diffère en interne (aucun qualifieur, aucune
  confirmation par un apporteur, aucun rang) ne se voit jamais de l'espace.
- Le conseiller n'entre jamais en file : CHECK `rang_attente IS NULL OR apporteur_id IS NOT NULL`. Une
  file d'apporteurs se forme derrière sa prise en charge comme derrière un apporteur (art. 3.5).
- Pour la non-reconduction et le délai d'attente, la Société compte comme UN seul porteur : aucun
  conseiller ne reprend un SIREN libéré depuis moins de `CARENCE_CONSEILLER_JOURS` [SUPPRIMÉE le 2026-10-02 (réponse « A. »)], quel que soit le porteur
  sortant. Le SIREN est aussi fermé aux conseillers pendant la fenêtre de redéclaration d'un rang 1, et
  pendant `RESERVE_APRES_ACTE_APPORTEUR_JOURS` après une vérification ou un dépôt refusé d'un apporteur.
- Limites par conseiller et par Société (HYP-W19-LIMITES).
- Une prise en charge ne naît que dans Partners, par la console admin ou par l'API 3 ; aucun statut du
  CRM Pro n'occupe un SIREN (HYP-W19-SOURCE, question 22).
- Porteurs : DM-07, DM-08, DM-30, SEC-34.
- *Justification* : principe (b), avec les corrections de la sécurité et du gardien. Sans elles, un relais
  entre conseillers A → B → C reconstitue le « portefeuille permanent » que l'art. 3.4 bis interdit
  (`docs/contrat/CONTRAT-APPORTEUR-V1.md:163-169`). Un porteur de rôle quelconque, ou un porteur promu
  qualifieur, jugerait ses concurrents. La garde `cibleDeLIndex` ne lit qu'une table
  (`scripts/gates/schema-enums.ts:348-353`).

**REQ-SEC-041** — Le rôle `conseiller_salarie` n'a aucun droit existant de la matrice et aucun écran ni
aucune action sur les apporteurs : fiche, liste, lignée, notes, statistiques, exports, file, rattachement,
contestation, anomalie, suspension, gel, IBAN, lot, DAS2, vérifications d'apporteurs.
- Toutes ses lectures passent par `forConseiller(utilisateurConsoleId)`. L'identifiant vient de la
  référence de conseiller que présente l'API 3, rattachée par DM-32 et vérifiée active par Partners à
  chaque appel ; jamais d'un paramètre libre. La ligne d'un autre conseiller rend une réponse identique à
  celle d'une ligne inexistante.
- Aucune session de console n'est ouverte au rôle en V1 (question 22) : il n'a aucun écran dans Partners.
- Aucun `decide_par_id`, `traite_par_id` ni `repondue_par_id` ne désigne un conseiller (déclencheur).
- Changement de rôle : on ne quitte pas `conseiller_salarie` en portant une attribution occupante, et on n'y
  entre pas depuis qualifieur ou admin avant `DELAI_CHANGEMENT_POPULATION_JOURS`.
- Aucune lecture croisée de `verifications` entre populations.
- Porteurs : SEC-31, SEC-32, DM-12, DM-32, SEC-34.
- *Justification* : la matrice ne connaît que des couples droit × rôle (`src/server/roles/matrice.ts:31-39`).
  Le rôle est relu à chaque requête (`src/server/roles/require-role.ts:70-73`) et il est modifiable
  (SEC-30). Un test ne tient pas face à un changement de rôle postérieur à l'écriture.

**REQ-SEC-042** — Aucune réponse de l'espace ni de l'API 1 ne distingue une entreprise prise en charge par
un conseiller d'une entreprise occupée par un autre apporteur, ni ne révèle l'identité, le rôle ou la
nature salariée de la personne qui l'a prise en charge pour la Société.
- L'issue de dépôt, son texte, l'état de « Vérifier », la date « jusqu'au » et les délais servis à un
  apporteur sur un SIREN pris en charge sont identiques octet à octet à ceux d'un SIREN occupé par un
  apporteur au même stade et aux mêmes dates. C'est vrai à J+0, au passage à `active`, après une
  prolongation W9 et à la libération, notifications au rang 1 comprises.
- Aucune valeur nouvelle d'`IssueDepot` ni de `MotifRefusDepot` (question 2).
- Aucune clé ni valeur de DTO de l'espace ne porte la population.
- L'API 1 est DANS cette égalité : elle rend la même réponse que pour une attribution d'apporteur au même
  stade (REQ-INT-014 amendée).
- Porteurs : SEC-16, DM-08, DM-30, DM-31, INT-T07-P, QA-T31.
- *Justification* : décision de Williams du 2026-09-29 (question 2, art. 3.5). Les deux objections du plan
  deviennent des exigences : REQ-UX-007 n'affiche la date que pour `active`, donc la prise en charge doit
  devenir `active` au même moment qu'un dépôt d'apporteur (HYP-W19-CYCLE) ; l'API 1
  (`src/server/integrations/api-entrante.ts:95-113`) doit rendre la même réponse, sous un test
  d'indistinction.

**REQ-JUR-043** — Aucun écran, e-mail, notification, document ni export destiné à un apporteur ne nomme,
ne compare ni ne mesure un conseiller salarié.
- Exceptions EXPLICITES, par défaut et soumises à Williams (question 14) : le contrat (`docs/contrat/**`),
  dont l'art. 3.5 amendé dit, en termes généraux et sans jamais désigner l'occupant d'une entreprise
  donnée, qu'elle peut être déjà prise « par un autre apporteur ou par la Société ou ses préposés »,
  écrit en toutes lettres pour ne pas se confondre avec les
  « préposés » de l'apporteur de l'art. 1 (`docs/contrat/CONTRAT-APPORTEUR-V1.md:92`), précédent qui
  mentionne déjà les salariés de la Société (`:84`) ; et la notice RGPD de l'apporteur, qui décrit la
  finalité « contrôle d'incompatibilité avec le personnel de la Société » sans nommer personne.
- Aucun tableau de console ne classe ensemble apporteurs et conseillers. Seuls des totaux par origine sont
  admis.
- Aucune action d'un conseiller ne produit de message vers un apporteur.
- Porteurs : GOV-114, JUR-T32, QA-T31.
- *Justification* : la version initiale interdisait ce que la transparence RGPD (finalité nouvelle du
  contrôle croisé, art. 13 et 6.4 RGPD, à confirmer) et l'art. 3.5 amendé imposent de dire.

**REQ-JUR-044** — L'acte d'un conseiller n'emprunte ni le vocabulaire, ni le formulaire, ni les issues de
l'apporteur.
- Console : « prendre en charge une entreprise », événement `prise_en_charge_par_la_societe`, enum
  `IssuePriseEnCharge` distinct d'`IssueDepot`.
- Jamais « déposer », « déclarer », « réservée » ni « commission ».
- API 3 et CRM Pro : le même vocabulaire (« prendre en charge », « à vous », « non disponible »), exigé
  par l'ADR INT-T28 pour le rôle CRM ; aucune route ni aucun champ de l'API 3 n'emprunte le vocabulaire
  de l'apporteur.
- Au contrat, l'art. 3.5 amendé nomme « la Société ou ses préposés » à côté des autres apporteurs, en
  termes généraux ; l'acte d'un préposé n'y est jamais « une déclaration ». Côté apporteur, l'issue est
  celle du concours entre apporteurs (question 2) ; c'est côté console que le vocabulaire diffère.
- Porteurs : DM-30, INT-T28, SEC-34, JUR-T31 (UX-P2-11, supprimée par la question 22, ne l'est plus).
- *Justification* : indice de « service organisé » soulevé par le juriste (Cass. soc. 13 nov. 1996, à
  confirmer). Un processus au libellé identique rapprocherait l'apporteur du préposé. Le moteur
  d'anti-doublon reste commun, car c'est le principe (b).

**REQ-JUR-045** — Aucune rémunération de salarié, dans Partners comme dans axion-ia, n'est indexée sur
l'activité, le volume ou la performance des apporteurs. Le fait générateur du variable d'un conseiller est
une attribution qu'il porte lui-même. Porteur : T-ARG-040.
- *Justification* : un variable de salarié indexé sur l'activité des apporteurs serait un indice de
  direction du réseau ; `pricing.ts:828` (axion-ia) emploie « réseau commercial » pour désigner les
  apporteurs. L'annonce de recrutement d'axion-ia n'est pas une preuve retenue ici : Williams la déclare
  indépendante de Partners (question 1, 2026-09-29).

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

**REQ-UX-047** (transverse, lot « confort de la console pour tous les rôles ») — Toute tâche qui livre un
écran de Partners (espace, console) porte dans son acceptance les huit points suivants. Le conseiller
n'a aucun écran dans Partners (question 22) : ses écrans sont ceux du CRM Pro, hors de cette exigence.
1. Le geste principal et son budget, lus dans la SSOT `BUDGETS_UX` (`src/domain/seuils/ssot.ts`) :
   consultation ≤ 3 interactions, saisie ≤ 8. Une exigence existante plus stricte prime (REQ-UX-001,
   REQ-UX-021). Mesure par la fixture QA-T33.
2. Première action : visible sans défilement à 375×667 (espace, console mobile) ou 1280×800
   (console), atteinte en ≤ 3 tabulations, cliquable en ≤ 2 s sur le profil réseau « 4G ralentie » défini
   dans `BUDGETS_UX` (débit et latence, sourcés, posés par GOV-113).
3. Cinq états : nominal, vide qui montre le geste suivant, chargement, erreur qui dit quoi faire, accès
   refusé (REQ-UX-019 amendée).
4. Libellés tirés de la micro-copy SSOT du public et des termes du glossaire, sans identifiant technique.
5. Accessibilité et cibles : REQ-UX-017 (espace) et REQ-UX-018 (console) s'appliquent telles quelles, dans
   les deux thèmes.
6. Maquette produite par le poste `ux-redaction` et validée dans `docs/maquettes/VALIDATION.md`.
7. Écrans principaux, déclarés par la colonne « écran principal » de `docs/CONSOLE-ROUTES.md` et de
   `docs/ESPACE-ROUTES.md` : test de premier usage. Une personne du public, qui n'a jamais vu l'outil,
   reçoit une consigne d'une phrase. On consigne le temps de première action (≤ 10 s), le temps total dans le
   budget, les hésitations et un verbatim. Par défaut (question 17) : si Williams fournit une personne du
   public, le test est joué par elle ; sinon, le test est joué par un agent qui n'a pas écrit l'écran et la
   trace consignée dit qu'aucune personne du public n'était disponible.
8. E-mails : un seul appel à l'action, libellé tiré de la SSOT, lien qui mène à l'écran utile.
- Porteurs de la garde : GOV-113, QA-T33.
- *Justification* : l'exigence de Williams, pour tous les rôles de console et pour l'apporteur ; elle ne
  dépend d'aucun conseiller dans la console. La version initiale recopiait et contredisait REQ-UX-017 et
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
| REQ-SEC-003 | La session de 30 jours et `apporteurs.sessionVersion` visent l'espace. La session de console est courte : durée maximale et expiration d'inactivité sont des paramètres sourcés de `durees.ts`, posés par SEC-29 et validés par Williams, avec une `sessionVersion` sur `utilisateurs_console`, incrémentée au changement de rôle, à la désactivation et à la demande. Lot transverse « confort de la console pour tous les rôles ». | `src/server/auth/durees.ts:19` applique 30 jours aux deux populations. `jugerAcces` ne compare aucune version (`src/server/roles/require-role.ts:66-73`). La console porte l'administration des rôles, l'argent et les exports : une session de 30 jours sans révocation y est trop longue pour tout rôle, sans supposer aucun conseiller. |
| REQ-SEC-023 | L'enum passe à `{ admin, qualifieur, comptable, lecteur, conseiller_salarie }`, sans aucun des sept droits réservés. Amendement daté W19, écrit **dans la PR de SEC-31**, avec l'enum, GLOSSAIRE l.124 et §7 (sans le marqueur des synonymes interdits). | `scripts/gates/schema-enums.ts:65-66` impose l'égalité entre l'enum et le glossaire. `gov-check.ts:269` transformerait un marqueur §7 en interdit sec sur `src/**`. |
| REQ-UX-002, REQ-SEC-022 | **AUCUN amendement** (question 2 : art. 3.5, art. 3.3 c) rejeté). Aucune valeur `anteriorite_suivi` ; les deux enums restent alignés un pour un sur les articles 3.3 et 3.3 bis, à douze valeurs. Le dépôt d'un apporteur sur un SIREN pris en charge reçoit l'issue existante d'une occupation par un apporteur. | `src/domain/depot/issue-depot.ts:3-10` aligne l'enum un pour un sur les articles 3.3 et 3.3 bis, et `ux-exhaustivite` le relit dans les deux sens : une valeur propre à la Société la distinguerait. |
| REQ-UX-007 | Un SIREN pris en charge par un conseiller est rendu à l'apporteur comme un SIREN occupé par un autre apporteur au même stade : même état (`suivie_place_disponible` ou `suivie_file_complete`), même date « jusqu'au », au même moment. Cela ne tranche pas la contradiction 4 ou 5 états, que le gardien-spec règle avant SEC-16. | Question 2 (art. 3.5). `docs/GLOSSAIRE.md:117` (4 états) contre REQ-UX-007 (5 états). |
| REQ-DM-014 | « Contrat, Attribution *dont le porteur est un apporteur* et LigneCommission référencent une version » ; une attribution de conseiller ne référence aucune grille. | `COMMERCIAL_COMMISSIONS` est la grille des apporteurs (axion-ia `pricing.ts:808-809`). |
| REQ-DM-004, REQ-DM-007, REQ-DM-008, REQ-DM-009, REQ-DM-012, REQ-DM-042 | Une phrase de portée chacune. DM-004 : la file est réservée aux apporteurs ; elle se forme derrière une prise en charge de la Société comme derrière un apporteur (art. 3.5), et la fenêtre du rang 1 est fermée aux conseillers. DM-007 : pour un porteur conseiller, la péremption suit les mêmes délais visibles que pour un apporteur (HYP-W19-CYCLE). DM-008 : qualification, `non_confirme` et gel ne concernent que l'apporteur ; l'état visible d'une prise en charge suit la même chronologie qu'un dépôt. DM-009 : palier et taux se dérivent des seules qualifications d'apporteurs. DM-012 : la limite comptée sur l'identité concerne l'apporteur ; celle du conseiller suit HYP-W19-LIMITES. DM-042 : la confirmation tacite est réservée à l'apporteur ; le passage visible d'une prise en charge à `active` suit le même délai. | Table un pour un demandée par le gardien-spec. Le texte de REQ-DM-012 (code de parrainage, jetons, quota) ne traite pas de la confirmation tacite. |
| REQ-DM-021, REQ-DM-043 | DM-021 : la résolution d'un encaissement aiguille d'abord selon le porteur ; un porteur conseiller délègue à la chaîne de part variable et crée zéro LigneCommission. DM-043 : l'annulation n'a lieu que si `connueDepuisAt < deposeeAt` ; pour un porteur conseiller, information en console seulement. | Évite l'auto-attribution par antériorité (lentille sécurité). La clause d'attestation d'un refus `anteriorite_suivi` tombe avec la valeur (question 2). |
| REQ-INT-014 | Une attribution de conseiller répond comme une attribution d'apporteur au même stade : `attribuee`, `until`, et une `apporteurRef` opaque de même forme que celle d'un apporteur. Jamais `libre`, jamais un champ de plus, jamais une valeur qui distingue la population. Test d'indistinction (QA-T31). Le consommateur axion-ia (INT-T07-A) ne peut pas distinguer : aucune commission d'apporteur n'est versée sur la foi de l'API 1, la chaîne d'argent de Partners aiguillant par porteur réel (REQ-DM-021). | Question 2 : « même réponse de l'API 1 ». La voie « `apporteurRef: null`, porté par la Société » du plan est abandonnée : elle distinguait la population (`api-entrante.ts:95-113`). |
| REQ-QA-016 | Le cadre de console à 375 px s'exécute aussi sur mobile-safari et mobile-chrome. Un spec du cadre de console sans projet mobile fait rougir la CI. Lot transverse « confort de la console pour tous les rôles » ; aucun parcours de conseiller n'existe dans Partners (question 22). | La console n'est jouée que sur bureau (`playwright.config.ts:40`), alors que le cadre réactif à 375 px est livré à tous les rôles. |
| REQ-GOV-031 | Extension : plans de part variable, montants et matricules des salariés n'entrent jamais dans le dépôt ni dans les journaux (valeurs factices dans les seeds). Témoin ajouté à `gov:publication`. | W13 couvre l'économie du réseau, pas la paie ; une rémunération individuelle est une donnée personnelle. |
| REQ-SEC-030, REQ-CPL-009 | SEC-030 : quatre traitements, dont un dédié aux conseillers ; le traitement des apporteurs gagne la finalité « contrôle d'incompatibilité avec le personnel de la Société ». CPL-009 : 5e objet de l'AIPD, « gestion des prises en charge et calcul de la rémunération variable des conseillers », signé avant la première prise en charge. Porteur : JUR-T32, **après la fusion de JUR-T04**. | L'intitulé initial « évaluation et surveillance de l'activité » contredisait HYP-W19-OBJECTIFS. `t/jur-t04:tests/unit/juridique/registre-rgpd.spec.ts:258` (`toHaveLength(3)`) : le fichier n'existe que sur la branche poussée de JUR-T04, pas sur `main`. |
| REQ-UX-042, REQ-SEC-039, REQ-DM-023 | UX-042 : dimension « origine » dans chaque agrégat, onglets séparés ; le lecteur ne voit que des agrégats de conseillers, avec masquage sous 3. SEC-039 : écrire une note interne est refusé au conseiller. DM-023 : un conseiller n'est ni parrain ni filleul. | Ni force de vente unique reconstituée, ni mesure nominative d'un salarié pour un rôle qui n'en a pas besoin (lentille sécurité). |

**Réparties hors de GOV-112** (elles s'écrivent avec le code qui les porte) : REQ-SEC-023 (SEC-31),
REQ-SEC-030 et REQ-CPL-009 (JUR-T32). REQ-UX-002 et REQ-SEC-022 ne sont plus amendées (question 2).

## 5. Tâches nouvelles

Trente-six tâches. Trente-quatre avant la question 22 (le plan disait « les 31 autres » : on en comptait
30, rectifié à la transcription ; GOV-116 et GOV-117 s'y étaient ajoutées) ; la réponse de Williams du
2026-09-29 à la question 22 **supprime UX-P2-11** et **ajoute INT-T28, SEC-34 et DM-32**, premiers
identifiants libres de leur famille après les réservations (§8, point 1). **GOV-112, GOV-115, GOV-116 et
GOV-117 sont versées par la PR qui porte ce fichier** ; les trente-deux autres le seront par GOV-115, en un
seul `--depuis`, une fois les exigences qu'elles citent inscrites par GOV-112 (`verser-tache` refuse une
REQ inexistante).

**Deux ensembles, repérés dans chaque fiche.** Les tâches marquées **« lot transverse »** forment le lot
« confort de la console pour tous les rôles » (admin, qualifieur, comptable, lecteur) : SEC-29, SEC-30,
UX-P1-16, UX-P1-18, UX-P1-19, UX-P1-20, GOV-113, QA-T33, UX-P2-14 et UX-P3-13, auxquelles s'ajoute la passe
REQ-UX-047 de GOV-115 sur les écrans existants. Williams les garde au plan (2026-09-29) ; elles ne
supposent aucun conseiller dans la console et se justifient par les rôles qui y travaillent. Toutes les
autres forment le chantier salariés W19. Chaque ligne donne : phase · poste · zone · schéma ·
sensible · hypothèses · externe · estimation · dépendances · exigences · chemins, puis l'acceptance.
**Règle de défaut, pour tout champ qu'une ligne ne donne pas** (champs obligatoires de
`scripts/lot/tasks.schema.json`) : repo `partners`, schema false, sensible [], hyp [], externe null.

### Phase 0

> ⚠️ **Ordre imposé par une garde, mesuré à la transcription.** Dès que GOV-112 écrit les hypothèses de
> réversibilité `migration` ou `avenant`, `gov:hypotheses` exige qu'une tâche cite chacune dans son champ
> `hyp` (famille `decision_irreversible_sans_porteur`) ; or ces porteurs sont versés par GOV-115. **GOV-112
> et GOV-115 partent donc dans la même PR**, un commit par tâche, GOV-112 d'abord — comme GOV-098, qui a
> inscrit sa décision et versé ses tâches ensemble. Le plan de l'architecte les séparait.

#### GOV-112 — Inscrire la décision W19 : §1, 21 HYP, REQ nouvelles et amendées, glossaire (conseiller salarié, prise en charge (Société), plan de part variable, ActiviteFacturation)
- **Méta** : phase 0 · `gardien-spec` · zone gouvernance · repo partners · schema false · sensible [attribution, argent, auth] · hyp [] · externe null · 0,5 j · label `role:gardien-spec`
- **Deps** : GOV-116 (le lot dédié avec `--settings` surchargé ; décision de Williams du 2026-09-29, question 21) · **Reqs** : REQ-GOV-015
- **Paths** : `docs/DECISIONS.md`, `docs/requirements.json`, `docs/GLOSSAIRE.md`, `docs/PRESEANCE.md`, `docs/TRACABILITE.md`, `docs/PLAN-STATE.md`, `docs/journal/`
- **Acceptance** : versée au registre, voir `docs/tasks.json`.

#### GOV-115 — Verser les tâches W19, amender les tâches existantes, poser REQ-UX-047 sur les tâches d'écran à faire
- **Méta** : phase 0 · `gardien-spec` · zone gouvernance · repo partners · schema false · sensible [] · hyp [] · externe null · 0,75 j · label `role:gardien-spec`
- **Deps** : GOV-112, GOV-117 (la passe REQ-UX-047 et les écritures de `reqs`, `hyp` et `zone` du §6 passent par son verbe) · **Reqs** : REQ-GOV-015 (REQ-UX-047 n'existe qu'après GOV-112 ; une fois GOV-117 fusionnée, les champs `reqs` s'écrivent directement, §6)
- **Paths** : `docs/tasks.json`, `docs/TASKS.md`, `docs/TRACABILITE.md`, `docs/paths-proposes.json`, `docs/PLAN-STATE.md`, `docs/journal/`
- **Acceptance** : versée au registre, voir `docs/tasks.json`.

#### GOV-116 — Lot dédié du gardien-spec avec `--settings` surchargé : procédure, réglages, preuve qu'il écrit les trois fichiers réservés et eux seuls, preuve qu'une session ordinaire reste bloquée
- **Méta** : phase 0 · A01 gouvernance · zone gouvernance · repo partners · schema false · sensible [] · hyp [] · externe null · 1 j · label `role:gardien-spec`
- **Deps** : — · **Reqs** : REQ-GOV-010 (le gardien du spec seul à modifier DECISIONS, GLOSSAIRE et PRESEANCE)
- **Paths** : `docs/CONVENTIONS.md`, `docs/CHARTE-AGENTS.md`, `docs/adr/`, `scripts/lot/lot-dedie-gardien-spec.ts`, `config/lot-dedie-gardien-spec.settings.json`, `tests/unit/gouvernance/lot-dedie-gardien-spec.spec.ts`, `package.json`, `docs/journal/`
- **Acceptance** : versée au registre, voir `docs/tasks.json`. Résumé : décision de Williams du 2026-09-29 (question 21). Le mécanisme est nommé (`docs/CONVENTIONS.md` §8, `docs/CHARTE-AGENTS.md` §7) mais n'existe nulle part, et un fichier passé par `claude --settings` s'ajoute aux réglages sans lever un `deny` déjà présent dans `.claude/settings.json`. (a) Procédure exacte : commande, dossier de lancement, fichier de réglages, lancée par Williams seul. (b) Preuve qu'elle permet d'écrire `docs/DECISIONS.md`, `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`, et UNIQUEMENT eux. (c) Preuve qu'une session ordinaire reste bloquée. (d) Documentation dans CONVENTIONS §8 et dans l'ADR concerné. Si la solution touche `.claude/settings.json` (réservé à GOV-000/GOV-023), Williams applique ou approuve lui-même ce changement. (g) Relecture du processus : la lentille `securite` relit la PR de GOV-116 sous l'angle de la sécurité du processus (qui lance le lot, ce qu'il ouvre et à qui, ce qu'une session ordinaire ne peut pas s'accorder) ; réserve de la relecture de la lentille `securite` sur #230 (`830a648`), écrite dans l'acceptance du registre par `reecrire-champ`.

#### GOV-117 — Outil d'écriture du registre : écrire `reqs`, `hyp` et `zone` d'une tâche existante, validés contre le schéma, les REQ et les HYP existantes, et journalisés
- **Méta** : phase 0 · A01 gouvernance · zone gouvernance · repo partners · schema false · sensible [] · hyp [] · externe null · 0,75 j · label `role:gardien-spec`
- **Deps** : — · **Reqs** : REQ-GOV-021 (chaque tâche porte ses REQ couvertes et ses dépendances)
- **Paths** : `scripts/lot/chemins-de-tache.ts`, `docs/journal/`. Le changement lui-même vit hors dépôt (`hors-depot/outils-backlog.mjs`, `hors-depot/reecrire-champ.mjs`, `hors-depot/poser-champ.mjs`) ; le dépôt n'en porte que l'inventaire daté des verbes et le journal.
- **Acceptance** : versée au registre, voir `docs/tasks.json`. Résumé : réponse de Williams du 2026-09-29 (question 20, option A). `CHAMPS_ECRIVABLES` gagne `reqs`, `hyp` et `zone` pour `tasks.json`, sans rouvrir aucun champ d'attribution. Garde-fous : valeur validée contre `scripts/lot/tasks.schema.json` ; toute REQ citée existe dans `docs/requirements.json` et n'est pas citée deux fois ; toute HYP citée a une ligne dans la §2 de `docs/DECISIONS.md` ; la cohérence de phase est rejouée ; `exigences[].taches` et `phase` sont redérivés après une écriture de `reqs`, et relus sur le disque ; motif obligatoire, `--si-inchange`, ligne au journal des réécritures. Chaque refus a son témoin vu rouge.

### Phase 1

#### SEC-29 — Connexion de la console : lien et code à 6 chiffres, page « lien déjà utilisé », session courte, atterrissage direct et redirection bornée
- **Méta** : **lot transverse** · phase 1 · lead sécurité · zone securite · schema false · sensible [auth] · hyp [] · 1,25 j
- **Pourquoi, pour tous les rôles** : aucun admin, qualifieur, comptable ni lecteur ne peut aujourd'hui recevoir de lien de console, et la session de console dure 30 jours sans révocation, sur l'outil qui porte l'argent, les exports et l'administration des rôles. Rien ici ne suppose un conseiller.
- **Deps** : SEC-17, SEC-04, UX-P0-01, UX-P1-04, GOV-115, UX-P1-18, QA-T33 · **Reqs** : REQ-UX-048, REQ-UX-047, REQ-UX-015, REQ-SEC-003
- **Paths** : `src/server/auth/lien-magique.ts`, `src/server/auth/durees.ts`, `src/server/roles/require-role.ts`, `src/app/(console)/console/connexion/`, `src/server/notifications/table-ssot.ts`, `src/content/micro-copy/console/connexion.ts`, `tests/unit/securite/lien-magique-console.spec.ts`, `tests/integration/connexion-console.spec.ts`, `tests/e2e/console/connexion.spec.ts`
- **Acceptance** : TÂCHE SENSIBLE (auth). AUCUNE MIGRATION : `liens_magiques` et `sessions_espace` portent déjà `utilisateur_console_id` (SEC-17). (1) Port `trouverUtilisateurConsole(emailHash)`, route `/console/connexion` et gabarit `lien_magique_console` : un seul appel à l'action et un code à 6 chiffres, par le mécanisme d'UX-P1-04 réutilisé et non recopié. (2) Un compte désactivé ne reçoit rien. La réponse est indistincte, que l'adresse soit inconnue, désactivée ou appartienne à l'autre population. (3) Un lien ou un code consommé ouvre la session et REDIRIGE en une action vers l'accueil du rôle (UX-P1-16), ou vers l'URL demandée seulement si elle est relative, commence par `/console/`, sans `//` ni schéma. Témoins d'open redirect. (4) Page « lien déjà utilisé » avec « M'envoyer un nouveau lien », jamais une erreur brute. L'URL demandée est conservée à travers le code. (5) Session de console courte : durée maximale et expiration d'inactivité (lue sur `lastSeenAt`) sont des paramètres sourcés de `durees.ts`, proposés par la tâche et validés par Williams avant la fusion ; pas de « rester connecté ». Aucune hypothèse W19 ne fixe ces valeurs : la session du conseiller est une exigence du rôle CRM (question 22). (6) Témoins à deux faces : un lien de console à `/connexion` n'ouvre rien (`lien-magique.ts:263` préservé), et inversement. (7) REQ-UX-047 : ≤ 2 interactions du clic dans l'e-mail à l'accueil, ≤ 3 par code (E2E mobile-chrome et bureau). Cinq états, REQ-UX-018, maquette UX-P1-18 validée.

#### SEC-30 — Administration des utilisateurs de console : invitation qui expire, rôle expliqué, désactivation immédiate, sessionVersion, journal, step-up, aucune auto-promotion
- **Méta** : **lot transverse** · phase 1 · lead sécurité · zone securite · schema true (label `schema`, seule de sa famille dans son lot) · sensible [auth] · hyp [HYP-W19-QUATRE-YEUX] · label `role:gardien-spec` pour `docs/GLOSSAIRE.md` (fichier réservé : lot dédié avec `--settings` surchargé, GOV-116, ou écriture humaine par Williams) · 1,5 j
- **Pourquoi, pour tous les rôles** : les utilisateurs de console ne naissent aujourd'hui que par le seed ; aucun admin ne peut inviter un qualifieur ou un comptable, ni désactiver un départ avec effet immédiat. Rien ici ne suppose un conseiller.
- **Deps** : SEC-17, SEC-29, GOV-115, UX-P1-18 · **Reqs** : REQ-SEC-023, REQ-SEC-003, REQ-DM-024, REQ-UX-048, REQ-UX-047
- **Paths** : `prisma/schema.prisma`, `prisma/migrations/`, `src/domain/evenement/charges.ts`, `src/server/console/utilisateurs/`, `src/app/(console)/console/utilisateurs/`, `src/server/roles/matrice.ts`, `src/server/roles/require-role.ts`, `src/content/micro-copy/console/utilisateurs.ts`, `tests/integration/utilisateurs-console-administration.spec.ts`, `tests/unit/securite/matrice-des-roles.spec.ts`, `docs/GLOSSAIRE.md`
- **Acceptance** : ELLE ÉCRIT LE SCHÉMA. (1) Migrations additives : `AgregatJournal.utilisateur_console` par ADD VALUE, non employé dans la même migration (partners/ADR-0022 §13), et `utilisateurs_console.session_version`. GLOSSAIRE aligné dans la même PR, par le lot dédié (GOV-116) ou par Williams, jamais hors de ce cadre. Événement `utilisateur_console_modifie {de, vers, acteurId}` dans la même transaction que tout changement. (2) `sessionVersion` incrémentée au changement de rôle, à la désactivation et à la demande. `jugerAcces` la compare, et toutes les sessions tombent à la requête suivante (témoin). (3) Droits `ecran:utilisateurs_console` et `action:gerer_utilisateur_console` réservés à admin, avec step-up déclaré dans la matrice. Pas d'auto-changement de rôle (refus nommé). (4) Une invitation expire (SSOT). Toute création d'admin est notifiée à tous les admins. Elle est validée par un autre admin s'il en existe un (HYP-W19-QUATRE-YEUX). (5) L'écran de création dit en une phrase, pour chaque rôle, ce qu'il voit et ne voit jamais, dérivée du GLOSSAIRE §7. (6) Témoins : changement sans événement → transaction échouée ; auto-promotion → refus. (7) REQ-UX-047 : inviter en ≤ 4 interactions, désactiver en ≤ 3 (E2E). Cinq états, maquette UX-P1-18.

#### UX-P1-18 — Maquettes et carte des routes de la console : cadre (bureau et 375 px), connexion, utilisateurs, accès refusé, en-têtes filtrés par rôle
- **Méta** : **lot transverse** · phase 1 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will (validation groupée) · 1 j
- **Pourquoi, pour tous les rôles** : aucune maquette de console n'est validée, la navigation des maquettes n'est pas filtrée par rôle et aucune carte des routes de la console n'existe.
- **Deps** : GOV-115 · **Reqs** : REQ-UX-048, REQ-UX-047, REQ-UX-018
- **Paths** : `docs/CONSOLE-ROUTES.md`, `docs/ESPACE-ROUTES.md`, `docs/maquettes/console-cadre.html`, `docs/maquettes/connexion-console.html`, `docs/maquettes/utilisateurs-console.html`, `docs/maquettes/acces-refuse.html`, `docs/maquettes/file-qualification.html`, `docs/maquettes/lot-paiement.html`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) `CONSOLE-ROUTES.md`, pendant d'`ESPACE-ROUTES` : route, écran, rôle, phase, statut prévue ou livrée, REQ, maquette, et une colonne « écran principal » (oui ou non) qui désigne les écrans soumis au test de premier usage (REQ-UX-047 point 7). Tout sous `/console/`. `ESPACE-ROUTES.md` reçoit la même colonne. (2) `console-cadre.html` en 1280×800 et 375×667 : ≤ 7 entrées sur bureau, barre ≤ 4 plus menu en mobile, instantané par rôle (qualifieur, comptable, lecteur, admin ; aucun conseiller, qui n'a pas de console en V1). Accueil de repli par rôle et par phase. (3) Les en-têtes de `file-qualification.html` et `lot-paiement.html` sont filtrés par rôle : le qualifieur ne voit plus les lots (`:800-806`), le comptable ne voit plus la qualification. (4) Chaque maquette montre ses cinq états, dans les deux thèmes, avec une micro-copy de console proposée. (5) Une séance de validation groupée de Will est planifiée. Ses lignes sont posées dans `VALIDATION.md`.

#### UX-P1-19 — Maquettes des écrans de console de la phase 1 : file, fiche de qualification, apporteurs (liste et fiche), attributions et contrats, fiche prospect
- **Méta** : **lot transverse** · phase 1 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · 1,5 j
- **Pourquoi, pour tous les rôles** : les écrans de console de la phase 1 (qualifieur, admin) seraient codés sans maquette validée.
- **Deps** : UX-P1-18 · **Reqs** : REQ-UX-047, REQ-UX-018, REQ-UX-021
- **Paths** : `docs/maquettes/fiche-qualification.html`, `docs/maquettes/apporteurs.html`, `docs/maquettes/apporteur-fiche.html`, `docs/maquettes/attributions-contrats.html`, `docs/maquettes/fiche-prospect.html`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Une maquette par écran de console de la phase 1 listé dans `CONSOLE-ROUTES` : UX-P1-06, UX-P1-07, UX-P1-12, UX-P1-13, EXT-T02a. La liste est rapprochée de la carte et tout écart est nommé. (2) Chacune montre son geste principal et son budget (REQ-UX-021 : fiche de qualification en ≤ 6 interactions), ses cinq états et ses deux thèmes, avec des libellés tirés du glossaire. (3) Aucune phrase « l'apporteur verra » sur une entreprise prise en charge par la Société. (4) Validation groupée de Will, dans `VALIDATION.md`.

#### UX-P1-16 — Cadre de la console : navigation dérivée de la matrice, réactive à 375 px, accueil par rôle et par phase, accès refusé
- **Méta** : **lot transverse** · phase 1 · lead console · zone console · schema false · sensible [auth] · 1,5 j
- **Pourquoi, pour tous les rôles** : la matrice n'a aucun droit `ecran:*`, les accueils envisagés (lot, pilotage, alertes) n'existent qu'en phase 2 ou 3, et un comptable ou un lecteur arriverait en phase 1 sur un écran absent.
- **Deps** : SEC-29, SEC-17, UX-P0-03, GOV-113, UX-P1-18, QA-T33 · **Reqs** : REQ-UX-048, REQ-UX-047, REQ-UX-018, REQ-UX-019
- **Paths** : `src/app/(console)/console/layout.tsx`, `src/app/(console)/console/page.tsx`, `src/app/(console)/console/acces-refuse/page.tsx`, `src/components/console/navigation.tsx`, `src/server/console/navigation.ts`, `src/server/roles/matrice.ts`, `src/content/micro-copy/console/`, `tests/unit/console/navigation-par-role.spec.ts`, `tests/e2e/console/atterrissage.spec.ts`
- **Acceptance** : (1) Droits `ecran:*` ajoutés à la matrice pour les écrans de la phase 1. La navigation est DÉRIVÉE de ces droits. Témoin : ajouter un droit fait apparaître l'entrée, sans autre modification. (2) Bureau : ≤ 7 entrées groupées. Moins de 768 px : barre ≤ 4 entrées plus menu, cibles ≥ 44 px (REQ-UX-018), 320 px sans défilement horizontal. Un `conseiller_salarie` n'a aucune entrée : sa connexion de console mène à l'écran d'accès refusé, qui le renvoie au CRM Pro (question 22). Instantanés par rôle à 1280 et à 375. (3) L'accueil est la première route LIVRÉE de la liste de préférence du rôle, lue dans `CONSOLE-ROUTES` : qualifieur → file ; admin → « à traiter aujourd'hui », repli sur Utilisateurs ; comptable → lot du mois, repli sur un état vide guidant qui dit « arrive en phase 2 » ; lecteur → pilotage, repli sur Apporteurs en lecture seule si le droit existe. Test : pour chaque rôle et chaque phase, l'accueil résout vers une route livrée ou un repli déclaré, jamais un 404. (4) L'écran d'accès refusé dit ce que l'utilisateur peut faire et à qui s'adresser. États vides en micro-copy de console. (5) REQ-UX-047 : première action utile en ≤ 1 interaction depuis l'accueil, première action cliquable en ≤ 2 s (QA-T33). REQ-UX-018 dans les deux thèmes.

#### UX-P1-20 — Recherche globale de la console bornée par les droits, et page « Votre rôle »
- **Méta** : **lot transverse** · phase 1 · lead console · zone console · sensible [rgpd] · 0,75 j
- **Pourquoi, pour tous les rôles** : un admin ou un qualifieur qui cherche un SIREN ou un apporteur n'a aujourd'hui aucun point d'entrée, et aucun rôle ne sait ce qu'il voit ou ne voit pas.
- **Deps** : UX-P1-16, SEC-08, UX-P1-12 · **Reqs** : REQ-UX-048, REQ-UX-047
- **Paths** : `src/components/console/recherche.tsx`, `src/server/console/recherche.ts`, `src/app/(console)/console/votre-role/page.tsx`, `tests/integration/recherche-console.spec.ts`
- **Acceptance** : (1) Un champ de recherche dans le cadre, avec le raccourci « / ». Il cherche par SIREN, par nom d'entreprise et, pour un apporteur, par courriel exact via l'empreinte (SEC-08). Aucune recherche sur un nom chiffré. (2) Les résultats sont filtrés par la matrice et la couche d'accès. Témoin : un rôle sans droit sur les apporteurs n'en voit aucun. (3) La page « Votre rôle » est dérivée du GLOSSAIRE §7, jamais retapée. (4) REQ-UX-047 : de n'importe quel écran à une fiche en ≤ 3 interactions. État « aucun résultat » guidant, cinq états.

#### UX-P1-17 — Micro-copy de l'occupation : une entreprise prise en charge par un conseiller reçoit les formules existantes d'une occupation par un apporteur, sans rien révéler
- **Méta** : phase 1 · `ux-redaction` · zone espace · label `role:ux-redaction` · revue juriste · externe will · 0,5 j
- **Deps** : UX-P0-01, GOV-115, JUR-T31 · **Reqs** : REQ-SEC-042, REQ-UX-002, REQ-JUR-043
- **Paths** : `src/content/micro-copy/espace/vocabulaire.ts`, `docs/maquettes/deposer.html`, `docs/maquettes/entreprise.html`, `docs/maquettes/mes-entreprises.html`, `docs/maquettes/VALIDATION.md`, `tests/unit/espace/vocabulaire-et-micro-copy.spec.ts`
- **Acceptance** : CAS HYP-W19-CONCOURS TRANCHÉ (art. 3.5, Williams, 2026-09-29, question 2). (1) L'écran reprend les formules existantes `FORMULES.dejaReservee` et `FORMULES.finDuDroit` (`vocabulaire.ts:39-40`), sans nouvelle tournure ni le verbe « suivre » pour une entreprise (relecture juridique du 2026-09-19, `issues-depot.ts:7`, `vocabulaire.ts:9-11`). Aucune formule propre à la Société. (2) `DEJA_CONNUE` (`issues-depot.ts:55-63`) est INCHANGÉ : il reste le texte des seules antériorités client et devis de l'art. 3.3. (3) Test : aucun texte de `src/content/micro-copy/espace/**` ne contient un nom de rôle de console ni une forme composée du nom du rôle (famille `population_interne` de GOV-114) ; « salarié » et « conseiller » seuls ne sont pas visés. Témoin vert : « former ses salariés » (`etats-vides.ts:24`) passe. Témoin rouge : une formule qui nomme la Société comme occupante, ou « suivi », « suivie » ou « suivait » dans `vocabulaire.ts`, fait rougir. (4) Les maquettes entreprise, deposer et mes-entreprises sont relues : aucune ne distingue un occupant conseiller. Will dit si une revalidation est nécessaire ; si oui, revalidation groupée le même jour, pour ne pas bloquer UX-P1-01/02.

#### GOV-113 — Garde UX des écrans : REQ-UX-047, maquette validée et cinq états pour toute tâche d'écran, console comprise ; BUDGETS_UX en SSOT
- **Méta** : **lot transverse** · phase 1 · A01 gouvernance · zone gouvernance · label `role:gardien-spec` pour `gates.json` · 0,75 j
- **Pourquoi, pour tous les rôles** : la garde des maquettes ne voit que les identifiants UX-P*, et plusieurs écrans de console sont classés en zone `espace` : un écran de console peut être codé sans maquette ni cinq états.
- **Deps** : GOV-115, GOV-117 · **Reqs** : REQ-UX-047, REQ-UX-019
- **Paths** : `scripts/gates/maquettes-validees.ts`, `scripts/gates/ux-exhaustivite.ts`, `scripts/gates/ux-ecrans.ts`, `src/domain/seuils/ssot.ts`, `tests/unit/gouvernance/ux-ecrans.spec.ts`, `docs/gates.json`
- **Acceptance** : (1) Toute tâche `a_faire` ayant un chemin sous `src/app/(espace|console)`, ou désignée dans `ESPACE-ROUTES` ou `CONSOLE-ROUTES`, cite REQ-UX-047 et a une ligne de validation, quel que soit son préfixe. « Cite » se lit dans le champ `reqs` SEUL, écrit par le verbe de GOV-117 (question 20, option A) : aucun repli par l'acceptance. Le motif `IDENTIFIANT` (`maquettes-validees.ts:96`) est élargi. (2) `ux-exhaustivite` exige les cinq états et lit `CONSOLE-ROUTES`. (3) Chaque gabarit de `table-ssot.ts` a un seul appel à l'action, et son libellé vient de la SSOT. (4) `BUDGETS_UX` est une seule source, dans `ssot.ts` : 3 et 8 interactions, 3 tabulations, 2 s, 10 s ; le profil réseau « 4G ralentie » (débit descendant, débit montant, latence, chacun sourcé et daté). Aucune valeur propre au conseiller : ses cibles et son corps de texte sont des exigences du rôle CRM (question 22). (5) Témoin à deux faces : une tâche de console sans validation rougit et nomme la tâche. (6) La garde n'est pas rétroactive sur les tâches fusionnées. Elle n'est armée qu'après la fusion de GOV-115. (7) L'entrée `gates.json` passe par `hors-depot/ajouter-entree.mjs`.

#### QA-T33 — Fixture Playwright « budget de gestes » : comptage des interactions, chrono de la première action, visible sans défilement
- **Méta** : **lot transverse** · phase 1 · lead qualité · zone qualite (test écrit par un autre agent que les auteurs des écrans) · 0,75 j
- **Pourquoi, pour tous les rôles** : REQ-UX-001 et REQ-UX-021 fixent des budgets de gestes que rien ne mesure ; la fixture sert l'apporteur comme le qualifieur et le comptable.
- **Deps** : GOV-113 · **Reqs** : REQ-UX-047, REQ-QA-016
- **Paths** : `tests/e2e/fixtures/budget-de-gestes.ts`, `tests/unit/qualite/budget-de-gestes.spec.ts`, `playwright.config.ts`
- **Acceptance** : (1) La fixture `budgetDeGestes` compte les clics, les saisies et les tabulations, et lit ses seuils dans `BUDGETS_UX`. (2) Chrono de la première action cliquable sur le profil « 4G ralentie » lu dans `BUDGETS_UX`. (3) Assertion « visible sans défilement » à 375×667 et 1280×800. (4) Témoin rouge : un parcours de 9 saisies échoue face au budget de 8. (5) Les projets mobile-safari et mobile-chrome sont disponibles pour `console/**`.

#### JUR-T31 — Contrat v1 : art. 3.5 amendé (entreprise déjà prise par un autre apporteur ou par la Société ou ses préposés), bornes de la Société, clause de non-exploitation, avant le premier DocuSeal
- **Méta** : phase 1 · juriste · zone juridique · hyp [HYP-W19-CONCOURS, HYP-W19-NON-EXPLOITATION, HYP-W19-CARENCE] · externe will (validation du texte) · 0,75 j
- **Deps** : GOV-115 · **Reqs** : REQ-SEC-042, REQ-DM-048, REQ-JUR-044, REQ-DM-043
- **Paths** : `docs/contrat/CONTRAT-APPORTEUR-V1.md`, `tests/unit/contrat/contract-template-complete.spec.ts`
- **Acceptance** : ARBITRAGE RENDU : art. 3.5 retenu, art. 3.3 c) rejeté (Williams, 2026-09-29, question 2). (1) L'art. 3.5 est amendé en termes généraux : l'entreprise peut être déjà prise « par un autre apporteur ou par la Société ou ses préposés » ; l'effet pour l'apporteur est le même quel que soit l'occupant ; la Société ne révèle jamais qui occupe une entreprise donnée. Aucun art. 3.3 c), aucune catégorie de refus nouvelle. Jamais le mot « suivi ». L'acte d'un préposé n'est jamais « une déclaration ». (2) Bornes de la Société, tous préposés confondus, écrites avec les variables du gabarit et jamais en dur (RM-10) : les mêmes durées qu'une attribution d'apporteur (`{{PEREMPTION_JOURS}}` jours, `{{FENETRE_MOIS}}` mois), pas de reconduction, délai d'attente de `{{CARENCE_CONSEILLER_JOURS}}` jours après toute libération (variable nouvelle, déclarée au gabarit), entreprise fermée à la Société pendant la fenêtre d'un rang 1. (3) Clause de non-exploitation (HYP-W19-NON-EXPLOITATION). (4) Le mode de preuve de l'horodatage (journal chaîné) est le même quel que soit l'occupant, et ne révèle pas qui. (5) Le contrat dit « préposés de la Société » en toutes lettres, pour lever l'homonymie avec les « préposés » de l'apporteur à l'art. 1 (`CONTRAT-APPORTEUR-V1.md:92`), jamais le mot que GLOSSAIRE §8 interdit pour l'apporteur. (6) `contract-template-complete.spec.ts` reste vert. (7) L'arbitrage de Williams est daté dans la colonne « Tranchée » de HYP-W19-CONCOURS ; le texte amendé est validé par Williams avant INT-T12. La note d'analyse hors dépôt sur l'indice de service organisé est relue. (8) Aucun point non sourcé présenté comme un fait ; un point de droit non tranché prend l'option la plus prudente, marquée « à arbitrer par Williams » (question 13 : pas d'avocat).

#### JUR-T33 — Inventaire axion-ia de la PR #1202 : candidature à un poste salarié affichée sur la fiche d'un apporteur, personne laissée dans le tunnel des apporteurs
- **Méta** : phase 1 · juriste · zone juridique · repo partners (lecture seule d'axion-ia, écriture dans `docs/tiers/` de ce dépôt ; ce n'est pas une tâche du poste A08) · aucune écriture dans axion-ia · 0,25 j
- **Deps** : GOV-115 · **Reqs** : REQ-JUR-043, REQ-CPL-030
- **Paths** : `docs/chantiers/W19-inventaire-axionia-1202.md` (déplacé de `docs/tiers/axionia-populations.md` au rattrapage 45 : un inventaire n'est pas une fiche de tiers)
- **Acceptance** : Périmètre réduit par la réponse de Williams à la question 1 (2026-09-29) : JUR-T33 n'inventorie plus que la PR axion-ia #1202, sans rien exiger sur l'annonce de recrutement « Responsable du réseau commercial », qui reste indépendante de Partners et n'est pas inventoriée. Constat avec `chemin:ligne` : le cadre « A postulé pour un poste de commercial SALARIÉ » de la fiche apporteur et `details.candidatureSalariee`, ajoutés par la PR axion-ia #1202 (fusionnée le 2026-09-28, incluse dans `a12e58165`) ; la personne reste dans le tunnel des apporteurs, canal de mélange des deux populations (REQ-CPL-030). On ne demande pas de défaire la PR. Le constat se termine par une question à Williams, avec recommandation. Aucune modification d'axion-ia. Les autres surfaces d'axion-ia (espace ressources, rôle d'un salarié qui fait des devis, champ `commission`, lien croisé) sont réglées par la réponse de Williams à la question 12 (2026-09-29) : aucun accès du conseiller à axion-ia en V1 ; devis, signature et facture restent faits par la direction.

#### INT-T28 — ADR de l'API 3 : le contrat entre Partners et le CRM Pro pour la prise en charge d'une entreprise par un conseiller, figé avant toute ligne de code du CRM
- **Méta** : phase 1 · A01 (architecte) · zone integration · repo partners · schema false · sensible [attribution, auth] · hyp [HYP-W19-SOURCE, HYP-W19-VISIBILITE, HYP-W19-IDENTITE-CRM, HYP-W19-LIMITES] · externe will (validation du contrat) · 0,5 j · ajoutée le 2026-09-29 (question 22)
- **Deps** : GOV-115 · **Reqs** : REQ-DM-048, REQ-SEC-041, REQ-SEC-042, REQ-JUR-044
- **Paths** : `docs/adr/` (un ADR neuf, au premier numéro libre à sa rédaction), `docs/tiers/crm-pro.md`, `docs/journal/`
- **Acceptance** : Réponse de Williams du 2026-09-29 à la question 22 (option A) : les conseillers travaillent dans le CRM Pro, Partners garde le registre et décide. AUCUN CODE. (1) ROUTES, sous `/api/integrations/crm-pro/`, corps et codes de réponse écrits et versionnés : `POST /prises-en-charge` (SIREN, référence du conseiller, clé d'idempotence) répond `acceptee` avec `until`, ou `non_disponible` sans aucun détail (ni mois, ni cause, ni occupant) ; la même clé d'idempotence rend la même réponse ; `GET /prises-en-charge?conseiller=` rend les prises en charge de ce seul conseiller ; l'avis J-15, dans la forme que l'ADR fixe (champ d'échéance de la liste ou route dédiée), produit par UX-P2-13. (2) AUTHENTIFICATION : un jeton de service propre au CRM Pro, distinct de celui de l'API 1, limité à ces routes ; débit limité ; journal de chaque appel ; alerte de volume sur le jeton et sur la Société, agrégée et jamais nominative, active dès l'émission du jeton et sans condition, et alerte d'anomalie par conseiller une fois la condition HYP-W19-CSE remplie (SEC-34, point (4)). Rotation décrite ; le secret ne transite jamais par le dépôt ni une conversation (REQ-INT-031). (3) IDENTITÉ : la référence du conseiller est rattachée à un utilisateur de console `conseiller_salarie` par DM-32, et Partners vérifie à chaque appel que ce conseiller est actif ; le CRM Pro ne désigne jamais un apporteur ni un autre rôle. L'ADR l'écrit comme une HYPOTHÈSE DE CONFIANCE (HYP-W19-IDENTITE-CRM, relecture de la lentille `securite` sur #230 (`830a648`)) : l'identité est dérivée de la session CRM Pro authentifiée du conseiller, jamais saisie ni choisie dans un champ ; Partners vérifie le jeton et le rattachement d'une référence active, pas la personne. L'ADR nomme ce qu'un CRM Pro compromis peut faire (agir au nom de tout conseiller actif) et ce qui le borne : la limite de la Société, fixe et basse (HYP-W19-LIMITES), l'alerte de volume sans condition, le journal, la révocation du jeton. (4) BORNES : toutes appliquées par Partners seul (cycle, délai d'attente, fenêtre du rang 1, limites, délai après un acte d'apporteur, départ, anti-cumul) ; le CRM Pro n'en calcule aucune et ne garde rien qui vaudrait décision. (5) SOURCE : seule une prise en charge enregistrée par Partners (console admin ou API 3) occupe un SIREN ; rien n'est déduit d'un statut CRM ni d'un devis (HYP-W19-SOURCE). Partners indisponible : le CRM Pro l'affiche et n'enregistre rien. (6) EXIGENCES DU RÔLE CRM, listées pour la session CRM Pro, qui les réalise dans son dépôt : rôle « commercial » neuf, sans export, sans suppression, sans accès en masse aux données personnelles, qui ne réutilise pas `operator` ; session de 12 h au plus, expirée après 8 h d'inactivité, reconnexion en au plus 3 gestes ; pas de brouillon persistant, aucune occupation affichée avant la réponse de Partners ; cibles d'au moins 48 px et corps de texte d'au moins 16 px ; vocabulaire de REQ-JUR-044 ; présentation de la notice et de la déclaration de conflit d'intérêts à la première connexion ; durcissement multi-utilisateur. Les valeurs de session, de hors-ligne et d'accessibilité sont celles que le plan W19 tenait en hypothèses avant la question 22. (7) CE QUE L'API 3 NE TRANSPORTE JAMAIS : le nom de rôle du CRM Pro, l'identité ou la population d'un autre occupant, une donnée d'apporteur. (8) Le contrat est validé par Williams et l'ADR accepté AVANT toute ligne de code du CRM Pro ; son gel est signalé sur le ticket #220 ; tout changement ultérieur est une nouvelle version de l'ADR. Fiche `docs/tiers/crm-pro.md` : le CRM Pro comme système appelant, ses données, son jeton.

### Phase 2

#### GOV-114 — Durcissement lexical et étanchéité, sur le patron GOV-109 (témoins hors dépôt)
- **Méta** : phase 2 · A01 gouvernance + juriste · zone gouvernance · hyp [HYP-W19-OBJECTIFS] · **0,75 j** (1 j avant la question 22 : aucune micro-copy de conseiller à couvrir dans la console)
- **Deps** : GOV-112, GOV-109 · **Reqs** : REQ-GOV-017, REQ-JUR-037, REQ-JUR-043, REQ-JUR-034
- **Paths** : `scripts/gates/lexique-apporteurs.ts`, `src/domain/lexique/lexique-interdit.ts`, `tests/unit/gouvernance/lexique.spec.ts`, `scripts/gates/jur-aucun-agregat-reseau.ts`, `tests/unit/juridique/charte-relationnelle.spec.ts`, `scripts/lot/revues.ts`
- **Acceptance** : (1) `gov:lexique` voit les formes d'identifiants de `prisma/**` et `src/**` que la note confidentielle hors dépôt décrit, en réutilisant `segments()`. Les témoins sont des formes CONFIDENTIELLES tenues hors dépôt, comme GOV-109 : ni l'acceptance, ni les commits, ni le journal ne les énumèrent ni n'en décrivent le mécanisme. Une seule exception déclarée, datée et justifiée : l'identifiant importé de la grille axion-ia, sur son fichier d'import. (2) Famille `population_interne`, portée apporteur, sur les seules formes COMPOSÉES du nom du rôle, jamais sur « conseiller » seul (`docs/tiers/banque.md:96`). Le cliquet de longueur passe sciemment à 11. Témoin dans la micro-copy de l'espace ; témoin vert : « former ses salariés » (`etats-vides.ts:24`) passe. (3) `import_console` : aucun fichier de l'espace, des e-mails apporteur ni de `src/server/pdf/**` n'importe `src/server/console/**`, `src/server/prise-en-charge/**`, `src/server/integrations/crm-pro/**`, `src/domain/part-variable/**`, `src/domain/statistiques/**` ni `src/domain/pilotage/**`. Un témoin par chemin. (4) `revues.ts` : segments sensibles `paie`, `part-variable`, `conseiller`, `prise-en-charge`, `crm-pro`. (5) Aucune portée réduite. Réduite par la question 22 : il n'existe plus de micro-copy de conseiller dans la console à couvrir.
- *Note de transcription* : le plan de l'architecte décrivait en clair, au point (1) et au §2, la classe de formes que la garde ne voit pas encore. Ce dépôt est public et la règle maison du chantier GOV-109 veut que ces formes restent hors dépôt ; la description est donc renvoyée à la note confidentielle.

#### SEC-31 — Rôle `conseiller_salarie` : enum, glossaire §7 sans marqueur, REQ-SEC-023, zéro droit hérité, règles de changement de rôle, déclaration de conflit d'intérêts, seed
- **Méta** : phase 2 · lead sécurité · zone securite · schema true (label `schema`) · sensible [auth] · hyp [HYP-W19-NOM-ROLE, HYP-W19-ROLE-MOUVANT] · label `role:gardien-spec` pour `docs/requirements.json` et pour `docs/GLOSSAIRE.md` (fichier réservé : lot dédié avec `--settings` surchargé, GOV-116, ou écriture humaine par Williams) · 0,75 j
- **Deps** : SEC-30, GOV-114, SEC-17 · **Reqs** : REQ-SEC-023, REQ-SEC-041
- **Paths** : `prisma/schema.prisma`, `prisma/migrations/`, `src/server/roles/matrice.ts`, `src/server/console/utilisateurs/`, `scripts/gates/roles.ts`, `tests/unit/securite/matrice-des-roles.spec.ts`, `tests/unit/gouvernance/glossaire-enums.spec.ts`, `prisma/seed/06-console.ts`, `docs/GLOSSAIRE.md`, `docs/requirements.json`
- **Acceptance** : (1) `ALTER TYPE "console_role" ADD VALUE 'conseiller_salarie'`. Dans la même PR : GLOSSAIRE l.124, ligne §7 SANS le marqueur des synonymes interdits ni accents graves (`gov-check.ts:269`), et REQ-SEC-023 par le verbe. `partners:schema:enums` et `gov:termes-interdits` restent verts. (2) Le cliquet de `matrice-des-roles.spec.ts:78` est réécrit par un autre agent. Les droits sensibles sont calculés depuis `Object.values(ConsoleRole)`. (3) Test : aucun droit du rôle ne porte sur un écran ou une action d'apporteur. (4) Changement de rôle, avec témoins : on ne quitte pas `conseiller_salarie` en portant une attribution occupante ; on n'y entre pas depuis qualifieur ou admin avant `DELAI_CHANGEMENT_POPULATION_JOURS`. (5) À la création d'un conseiller par l'admin, une déclaration de conflit d'intérêts est enregistrée (version et date conservées) ; sa présentation au salarié, avec la notice, est une exigence du rôle CRM listée dans l'ADR INT-T28. (6) Seed d'un conseiller de démonstration, valeurs factices. (7) Aucune session de console n'est ouverte au rôle en V1 (question 22) : une connexion de console d'un `conseiller_salarie` mène à l'écran d'accès refusé d'UX-P1-16, qui renvoie au CRM Pro (témoin).

#### SEC-32 — Couche d'accès `forConseiller` : cloisonnement par ligne, réponse identique, règle semgrep, IDOR
- **Méta** : phase 2 · lead sécurité · zone securite · sensible [auth, attribution, rgpd] · **0,5 j** (1 j avant la question 22 : plus aucun écran ni aucune session de conseiller dans la console, la seule surface est l'API 3)
- **Deps** : SEC-31, DM-07, SEC-05, GOV-111 · **Reqs** : REQ-SEC-041, REQ-SEC-009
- **Paths** : `src/server/acces/for-conseiller.ts`, `src/server/acces/for-apporteur.ts`, `.semgrep.yml`, `tests/unit/securite/acces-conseiller.spec.ts`, `tests/integration/idor-conseiller.spec.ts`
- **Acceptance** : (1) `forConseiller(utilisateurConsoleId)` : identifiant fourni par l'appelant authentifié (la référence rattachée par DM-32 et vérifiée par SEC-34, jamais un paramètre libre), filtre en AND, clés de porteur refusées en écriture, réponse identique octet à octet pour la ligne d'un autre conseiller et pour une ligne inexistante. (2) Les `CLES_REFUSEES` de `forApporteur` gagnent `utilisateurConsoleId` (`for-apporteur.ts:233-265`). (3) Semgrep : aucun client Prisma direct sous `src/server/prise-en-charge/**` ni `src/server/integrations/crm-pro/**`. (4) IDOR : conseiller A contre les prises en charge de B, conseiller contre attribution d'apporteur, conseiller contre `verifications` d'apporteur. Chaque fois : réponse identique et même requête SQL. (5) Mutation : retirer le filtre fait rougir. (6) Dérivation depuis le schéma, dans les deux sens.

#### SEC-33 — Une personne, une population : contrôle croisé du courriel, candidature bloquée, apporteur embauché, signal de fuite
- **Méta** : phase 2 · lead sécurité · zone securite · sensible [auth, rgpd] · hyp [HYP-W19-ANTI-CUMUL] · 0,75 j
- **Deps** : SEC-31, INT-T26, SEC-18, DM-31 · **Reqs** : REQ-CPL-030, REQ-SEC-017
- **Paths** : `src/domain/population/exclusivite.ts`, `src/server/integrations/axionia/candidature-recue.ts`, `src/server/console/utilisateurs/creer.ts`, `tests/integration/exclusivite-des-populations.spec.ts`
- **Acceptance** : (1) La création d'un conseiller, ou le passage vers ce rôle, dont l'empreinte de courriel (domaine `partners.empreinte.v1`, `pii.ts:298-302`) correspond à un apporteur non résilié est refusé avec un motif nommé. Téléphone seulement si Will le décide. (2) Une candidature (INT-T26, fonction unique) ou une saisie EXT-T03 qui correspond à un conseiller actif est BLOQUÉE : ni activation ni DocuSeal avant la revue humaine. Une anomalie console est ouverte. (3) Apporteur embauché : son contrat doit être résilié avant l'activation du compte. Ses droits acquis restent dans la chaîne des apporteurs, et aucune attribution n'est transférée (témoin). (4) Aucune réponse ne révèle la population. (5) Signal admin « SIREN vérifié par un conseiller puis déposé par un apporteur sous N jours ». Il est sans effet sur l'apporteur, et n'est activé qu'une fois la condition HYP-W19-CSE remplie ; la livraison de la tâche n'en dépend pas. (6) Témoins à deux faces dans chaque sens.

#### DM-30 — Prise en charge d'une entreprise par un conseiller : transaction commune, bornes de la Société, limites, délais, indistinction côté apporteur
- **Méta** : phase 2 · lead domaine · zone domaine · sensible [attribution] · hyp [HYP-W19-CYCLE, HYP-W19-CARENCE, HYP-W19-LIMITES, HYP-W19-SOURCE, HYP-W19-NON-EXPLOITATION, HYP-W19-CSE, HYP-W19-CONCOURS] (HYP-W19-PORTEUR et HYP-W19-DEPART sont écrites sur DM-07 et DM-08 par le verbe de GOV-117, question 20 : plus de port provisoire par DM-30) · 1,5 j
- **Deps** : SEC-32, SEC-12, SEC-16, DM-10-P, DM-08, JUR-T31 · **Reqs** : REQ-DM-048, REQ-SEC-042, REQ-JUR-044, REQ-SEC-014, REQ-DM-005
- **Paths** : `src/domain/depot/prise-en-charge.ts`, `src/domain/depot/issue-prise-en-charge.ts`, `src/server/prise-en-charge/prendre-en-charge.ts`, `src/server/securite/rate-limit.ts`, `src/domain/seuils/ssot.ts`, `tests/unit/domaine/prise-en-charge.spec.ts`, `tests/integration/prise-en-charge.spec.ts`
- **Acceptance** : TÂCHE SENSIBLE (attribution). (0) Une seule fonction de prise en charge, appelée par l'API 3 (SEC-34) et par la console admin (UX-P2-12), jamais recopiée : c'est la seule écriture qui fasse naître une prise en charge (HYP-W19-SOURCE, question 22). (1) La tâche APPELLE la transaction de SEC-12 sans la recopier : verrou SIREN, index, horodatage, antériorité DM-10-P, établissement cessé, liste 3.3 bis (b) et registre d'opposition (témoin nommé pour l'opposition). (2) Le porteur est un `conseiller_salarie` actif, vérifié par Partners au moment de la transaction (référence rattachée par DM-32 pour l'API 3, choix de l'admin en console), sinon `role_refuse`. Naissance par `prise_en_charge_par_la_societe`, canal `console` ; l'état visible depuis l'espace et l'API 1 suit la chronologie d'un dépôt d'apporteur (HYP-W19-CYCLE, machine de DM-08). (3) `IssuePriseEnCharge` renvoie `non_disponible`, SANS mois et sans identité, dans tous ces cas : SIREN occupé ; délai d'attente après toute libération (témoin : relais A → B à J+90 refusé) ; fenêtre d'un rang 1 (témoin : rang 1 notifié, prise en charge à J+1 refusée) ; moins de `RESERVE_APRES_ACTE_APPORTEUR_JOURS` après une vérification ou un dépôt refusé d'un apporteur. (4) Limites par conseiller (verrou par `utilisateurConsoleId`) et par Société, en SSOT (HYP-W19-LIMITES). Anomalie au-delà du seuil journalier. (5) Côté apporteur (question 2, art. 3.5) : AUCUNE valeur ajoutée à `IssueDepot`, `MotifRefusDepot` ni `ISSUES_DE_REFUS` ; `ux-exhaustivite` reste verte à 12 valeurs. Le dépôt d'un apporteur sur un SIREN pris en charge reçoit l'issue d'une occupation par un apporteur (`en_attente` au rang 1 ou 2, ou `file_complete`), et « Vérifier » le même état et la même date. Témoin d'indistinction, repris par QA-T31 : corps identiques octet à octet face à un occupant apporteur au même stade et aux mêmes dates. (6) Case d'information du tiers exigée côté serveur. Origine de la collecte (art. 13) au journal. (7) Course mixte : 20 concurrents, apporteurs et conseillers, donnent exactement un occupant. (8) Mise en service après l'AIPD signée et la condition HYP-W19-CSE remplie ; ni l'une ni l'autre ne bloque la livraison de la tâche.

#### DM-31 — « Vérifier » du conseiller : fonction et DTO minimal servis par l'API 3, limites par conseiller et par Société, aucune réponse d'apporteur qui distingue l'occupant
- **Méta** : phase 2 · lead domaine · zone domaine · sensible [attribution, rgpd] · hyp [HYP-W19-VISIBILITE] · **0,5 j** (1 j avant la question 22 : ni écran ni route de console ; l'exposition et le signal de balayage passent à SEC-34)
- **Deps** : DM-30 · **Reqs** : REQ-SEC-042, REQ-SEC-041, REQ-DM-043, REQ-SEC-016
- **Paths** : `src/server/prise-en-charge/verifier.ts`, `src/server/securite/rate-limit.ts`, `tests/integration/verifier-conseiller.spec.ts`
- **Acceptance** : (1) Réutilise la fonction de SEC-16. Le DTO rend trois réponses : libre ; pris en charge par vous jusqu'en <mois> (« à vous » dans le CRM Pro) ; non disponible (sans mois), pour toutes les causes, client ou devis d'Axion-IA compris. Une réponse « connue d'Axion-IA » distincte laisserait déduire qu'un SIREN « non disponible » et non client est tenu par un apporteur (HYP-W19-VISIBILITE ; question 10). (2) Journal dans `verifications` avec le porteur XOR. Limites par conseiller et par Société (surPanne : refuser). Aucune lecture croisée entre populations. (3) La fonction est servie au CRM Pro par l'API 3 (SEC-34), qui porte l'alerte d'anomalie ; aucune route de console. (4) Aucune réponse, preuve d'horodatage ni pièce servie à un apporteur ne distingue un occupant conseiller d'un occupant apporteur (question 2) ; il n'existe pas d'attestation propre à la Société. (5) Aucune référence à une tâche inexistante.

#### ~~UX-P2-11~~ — SUPPRIMÉE (réponse de Williams du 2026-09-29, question 22)
L'espace de travail du conseiller (accueil, Vérifier / Prendre en charge, Mes entreprises, Aide) vit dans le CRM Pro : bouton « Prendre en charge », statut « à vous / non disponible », liste « Mes entreprises » et avis J-15, faits par la session CRM Pro dans son dépôt après le gel du contrat de l'API 3 (INT-T28). L'identifiant n'est pas réemployé. Ses exigences de session, de hors-ligne et d'accessibilité sont listées dans l'ADR INT-T28 pour le rôle CRM. −1 j.

#### SEC-34 — API 3 : prise en charge et « Vérifier » servis au CRM Pro, jeton de service propre, débit limité, journal, alerte d'anomalie, identité du conseiller vérifiée par Partners
- **Méta** : phase 2 · lead sécurité · zone securite · schema false · sensible [auth, attribution] · hyp [HYP-W19-SOURCE, HYP-W19-VISIBILITE, HYP-W19-LIMITES, HYP-W19-IDENTITE-CRM, HYP-W19-CSE] · 1,5 j · ajoutée le 2026-09-29 (question 22)
- **Deps** : INT-T28, DM-30, DM-31, DM-32, SEC-32 · **Reqs** : REQ-DM-048, REQ-SEC-041, REQ-SEC-042, REQ-JUR-044
- **Paths** : `src/app/api/integrations/crm-pro/`, `src/server/integrations/crm-pro/api-prises-en-charge.ts`, `src/server/integrations/crm-pro/jeton-de-service.ts`, `src/server/securite/rate-limit.ts`, `tests/unit/securite/jeton-crm-pro.spec.ts`, `tests/integration/api-prises-en-charge.spec.ts`
- **Acceptance** : TÂCHE SENSIBLE (auth, attribution). Le contrat est celui de l'ADR INT-T28, accepté ; la tâche le réalise sans l'étendre. (1) `POST /prises-en-charge` appelle la fonction unique de DM-30 : `acceptee` avec `until`, ou `non_disponible` sans aucun détail ; la clé d'idempotence rejouée rend la même réponse, sans seconde écriture. (2) `GET /prises-en-charge?conseiller=` passe par `forConseiller` (SEC-32) : les prises en charge de ce seul conseiller. Le « Vérifier » de DM-31 est servi dans la forme de l'ADR. (3) Jeton de service propre au CRM Pro, distinct de celui de l'API 1, limité à ces routes (témoin : ce jeton refusé ailleurs, et le jeton de l'API 1 refusé ici) ; sans jeton, réponse identique à une route inexistante (patron REQ-SEC-012) ; secret en configuration seulement (REQ-INT-031). (4) Débit limité par jeton et par conseiller, en SSOT ; journal de chaque appel, sans donnée personnelle dans pino ; DEUX alertes à l'admin (relecture de la lentille `securite` sur #230 (`830a648`), option la plus prudente retenue). (a) Une alerte de VOLUME, active SANS CONDITION dès que le jeton existe, sur le jeton et sur la Société, agrégée et jamais nominative : appels par fenêtre, prises en charge et « Vérifier » par jour, séquence de SIREN comprise, seuils en SSOT ; témoin : un balayage réparti sous le seuil de chaque conseiller mais au-dessus du seuil de la Société la déclenche, condition HYP-W19-CSE non remplie. (b) L'alerte d'anomalie PAR CONSEILLER, activée une fois la condition HYP-W19-CSE remplie. La mise en service de l'API 3 reste liée à HYP-W19-CSE ; la livraison ne dépend ni de l'une ni de l'autre. Pourquoi (a) plutôt que de seulement lier la mise en service à HYP-W19-CSE : ce lien tient par une procédure humaine, qui peut être devancée (jeton émis pour une recette, essai sur données réelles), alors que (a) est une garde technique qui ne dépend d'aucun geste ; elle couvre le cas que HYP-W19-IDENTITE-CRM laisse ouvert, un CRM Pro compromis qui répartit ses appels entre les conseillers ; et, agrégée, elle ne mesure aucun salarié : ce n'est pas un indicateur d'activité du conseiller au sens de HYP-W19-CSE. (5) Identité : la référence de conseiller est résolue par DM-32 et le conseiller vérifié actif à chaque appel ; une référence inconnue, désactivée ou d'un autre rôle rend la même réponse de refus. Partners ne tient pas pour prouvée l'identité de la personne (HYP-W19-IDENTITE-CRM) : la limite de la Société s'applique quel que soit le conseiller désigné (témoin : N conseillers actifs, un appel chacun, refus au-delà de la limite de la Société). (6) Toutes les bornes W19 sont appliquées par DM-30 et DM-31, jamais par l'appelant ; aucun statut du CRM Pro n'occupe un SIREN. (7) Tests d'intégration de chaque route, de chaque refus et de l'idempotence, écrits par un autre agent que l'auteur ; chaque témoin vu rouge d'abord.

#### DM-32 — Rattachement des identités conseiller entre le CRM Pro et Partners
- **Méta** : phase 2 · lead domaine · zone domaine · schema true (label `schema`) · sensible [auth] · hyp [HYP-W19-QUATRE-YEUX, HYP-W19-IDENTITE-CRM] · 0,5 j · ajoutée le 2026-09-29 (question 22)
- **Deps** : SEC-31, INT-T28 · **Reqs** : REQ-SEC-041, REQ-CPL-030
- **Paths** : `prisma/schema.prisma`, `prisma/migrations/`, `src/server/console/utilisateurs/rattachement-crm.ts`, `tests/integration/rattachement-crm.spec.ts`
- **Acceptance** : ELLE ÉCRIT LE SCHÉMA. (1) Migration additive : une référence opaque du CRM Pro, unique, sur l'utilisateur de console `conseiller_salarie` (forme fixée par l'ADR INT-T28) ; aucune autre donnée du CRM Pro n'est copiée. (2) Le rattachement est posé et retiré par un admin, notifié à tous les admins (HYP-W19-QUATRE-YEUX), journalisé par un événement dans la même transaction. (3) Une référence ne désigne qu'un seul conseiller, jamais un apporteur ni un autre rôle (témoin) ; à la désactivation du conseiller, la référence cesse d'être acceptée par l'API 3 à la requête suivante (témoin). (4) Aucune réponse ne révèle la population d'une personne (REQ-CPL-030).

#### UX-P2-12 — Fiche conseiller (admin) : plans de part variable, réaffectation motivée en masse, anomalies
- **Méta** : phase 2 · lead console · zone console · sensible [argent, attribution] · 1 j
- **Deps** : DM-08, DM-30, T-ARG-042, SEC-32, UX-P1-16, UX-P2-15 · **Reqs** : REQ-UX-047, REQ-ARG-038, REQ-DM-048
- **Paths** : `src/app/(console)/console/conseillers/`, `src/server/console/conseillers/`, `src/server/roles/matrice.ts`, `src/content/micro-copy/console/conseillers.ts`, `tests/e2e/console/fiche-conseiller.spec.ts`
- **Acceptance** : (1) Action `action:reaffecter_porteur` (admin, step-up, motif) déclarée dans la matrice. Réaffectation de conseiller à conseiller seulement, validée à quatre yeux (T-ARG-042), notifiée au conseiller dépossédé et aux admins. (2) Saisie d'un plan en ≤ 6 interactions : versions, date d'effet et état d'acceptation visibles. (3) Réaffectation en masse en ≤ 5 interactions, avec l'aperçu des entreprises concernées. (4) Lien vers les anomalies du conseiller. (5) Cinq états, maquette UX-P2-15, REQ-UX-018. (6) C'est la « console admin » de HYP-W19-SOURCE (question 22) : depuis la fiche, l'admin peut enregistrer une prise en charge pour un conseiller actif, par la fonction unique de DM-30, avec les mêmes bornes et les mêmes réponses que l'API 3 ; estimation inchangée, à confirmer par GOV-115.

#### UX-P2-13 — Avis au conseiller : échéance proche (J-15) et fin de prise en charge, calculés par Partners et servis au CRM Pro par l'API 3
- **Méta** : phase 2 · lead console · zone console · 0,5 j (estimation inchangée ; canal réorienté par la question 22 : l'avis J-15 s'affiche dans le CRM Pro, l'API 3 le sert)
- **Deps** : DM-30, DM-13, SEC-34 · **Reqs** : REQ-JUR-043
- **Paths** : `src/server/prise-en-charge/avis.ts`, `src/domain/seuils/ssot.ts`, `tests/unit/notifications/avis-conseiller.spec.ts`
- **Acceptance** : (1) Partners calcule, pour chaque prise en charge, l'échéance proche (J-15, délai en SSOT) et la fin, dérivées des seules dates, sans rien mémoriser de l'activité du conseiller. (2) Ces avis sont servis au CRM Pro dans la forme fixée par l'ADR INT-T28 (champ d'échéance de la liste ou route dédiée de l'API 3) ; le CRM Pro les affiche. (3) Aucun avis n'atteint un apporteur (témoin). (4) Aucun avis ne compare ni ne mesure le conseiller. REQ-UX-047 ne s'applique pas : aucun écran de Partners n'est livré.

#### UX-P2-14 — Maquettes des écrans de console de la phase 2 (lot apporteurs, écrans d'argent et d'exception existants)
- **Méta** : **lot transverse** · phase 2 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · 1 j
- **Pourquoi, pour tous les rôles** : le lot des apporteurs, les écrans d'argent et d'exception du comptable et de l'admin seraient codés sans maquette validée.
- **Deps** : UX-P1-18 · **Reqs** : REQ-UX-047, REQ-UX-018
- **Paths** : `docs/maquettes/`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Une maquette par écran de console de la phase 2 listé dans `CONSOLE-ROUTES` (UX-P2-03, UX-P2-05 et les écrans EXT de console), avec la liste rapprochée. (2) Cinq états, deux thèmes, budget du geste principal. (3) Aucune ligne de conseiller dans le lot. (4) Validation groupée de Will.

#### UX-P2-15 — Maquettes de la paie et de la fiche conseiller (admin, comptable) : export paie, fiche conseiller
- **Méta** : phase 2 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · **0,5 j** (1 j avant la question 22 : les écrans du conseiller, accueil, prise en charge, mes entreprises et ma part variable, sont ceux du CRM Pro)
- **Deps** : UX-P1-18, GOV-112 · **Reqs** : REQ-UX-047, REQ-JUR-044
- **Paths** : `docs/maquettes/export-paie.html`, `docs/maquettes/fiche-conseiller.html`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Écrans admin et comptable en 1280×800 et 375×667. Aucune maquette d'écran du conseiller : il n'a aucun écran dans Partners (question 22). (2) Vocabulaire REQ-JUR-044. Aucun terme de l'apporteur. (3) Cinq états et deux thèmes. (4) Validation groupée de Will.

#### QA-T31 — Témoins d'indistinction à trois populations : côté apporteur octet à octet face à un occupant apporteur, absence d'oracle côté conseiller (API 3), même réponse de l'API 1
- **Méta** : phase 2 · lead qualité · zone qualite (autre agent que l'auteur du code) · 0,75 j
- **Deps** : DM-31, SEC-32, SEC-34, INT-T07-P · **Reqs** : REQ-SEC-042, REQ-SEC-009, REQ-INT-014, REQ-DM-048
- **Paths** : `tests/integration/trois-populations.spec.ts`, `tests/integration/idor.spec.ts`, `tests/integration/frontiere.spec.ts`, `tests/unit/securite/acces-scope.spec.ts`
- **Acceptance** : Exigence de Williams (question 2, 2026-09-29) : une prise en charge est indiscernable d'une occupation par un autre apporteur. (1) Seed : deux apporteurs et deux conseillers, et deux SIREN jumeaux, l'un pris en charge par un conseiller, l'autre occupé par un apporteur, aux mêmes dates. (2) TEST D'INDISTINCTION OCTET À OCTET côté apporteur : pour les deux SIREN jumeaux, le dépôt d'un apporteur, « Vérifier une entreprise », l'écran « entreprise », et la notification au rang 1 à la libération donnent des réponses identiques octet à octet (statut HTTP, corps, en-têtes applicatifs), une fois neutralisés le seul SIREN et le seul nom d'entreprise, et rien d'autre. Contrôlé à J+0, au passage à `active`, après une prolongation W9 et à la libération, avec des dates réelles. Aucune valeur `anteriorite_suivi` n'existe. (3) Aucune clé ni valeur de DTO de l'espace ne porte un segment de population. (4) Côté conseiller, dans toute réponse de l'API 3, `non_disponible` est identique quelle que soit la cause : apporteur, autre conseiller, client ou devis d'Axion-IA, délai d'attente, fenêtre du rang 1, acte d'apporteur récent. (5) API 1 : pour les deux SIREN jumeaux, réponse identique octet à octet hors la seule valeur opaque d'`apporteurRef`, de même forme ; `attribuee`, même `until`, aucun champ de plus. (6) Chaque témoin est vu rouge d'abord : une formule propre à la Société, un état `active` avancé, ou une `apporteurRef` nulle fait rougir. (7) CLAUSE JUMELLE, HORS DU CORPS (relecture de la lentille `securite` sur #230 (`830a648`)) : l'égalité octet à octet ne couvre ni le temps de réponse ni l'instant des notifications, qui distingueraient l'occupant aussi sûrement qu'un octet. Pour les deux SIREN jumeaux : (a) TEMPS DE RÉPONSE : le dépôt, « Vérifier une entreprise », l'écran « entreprise » et l'API 1 font le MÊME travail jusqu'à la réponse, soit la même suite de requêtes au registre (nombre et forme, relevés par un compteur de requêtes), et aucune branche, lecture ni appel propre à la Société avant la réponse ; une mesure au chronomètre n'est pas un témoin stable en CI et ne remplace pas cette égalité : elle s'y ajoute en information (médianes sur des appels alternés, écart imprimé). (b) INSTANT DES NOTIFICATIONS : sous horloge figée, la notification au rang 1 à la libération, le passage à `active` et la date « jusqu'au » sont planifiés et émis au même instant, par la même tâche et le même lot d'envoi, quel que soit l'occupant ; les horodatages servis (corps, en-tête `Date`, courriel) sont identiques. Témoins vus rouges d'abord : une requête de plus propre à la Société, un délai artificiel sur une seule branche, ou une notification envoyée par un chemin propre à la Société font rougir.

#### JUR-T32 — RGPD des conseillers : quatrième traitement, finalité d'incompatibilité côté apporteurs, AIPD 5e objet, CSE, notice, durées
- **Méta** : phase 2 · juriste (registre et notice, sur des points tranchés) · points de droit social en HYP arbitrés par Will · zone juridique · label `role:gardien-spec` pour `requirements.json` · 1 j
- **Deps** : JUR-T04, SEC-31, et la tâche de la page `/confidentialite` née de la scission de JUR-T04 décidée par Williams le 2026-09-29 (identifiant relevé à la fusion de `main`, JUR-T34 ou au-delà) · **Reqs** : REQ-SEC-030, REQ-CPL-009, REQ-JUR-043
- **Paths** : `docs/rgpd/registre-article-30.md`, `docs/rgpd/aipd.md`, `tests/unit/juridique/registre-rgpd.spec.ts`, `src/domain/seuils/ssot.ts`, `docs/rgpd/notice-conseiller.md`, `src/app/(espace)/confidentialite/page.tsx`, `docs/requirements.json`
- **Acceptance** : (1) REQ-SEC-030 passe à quatre traitements par le verbe. Le test passe à 4. Traitement des conseillers : finalités, base légale, données minimales (matricule, éléments variables ; jamais NIR, fixe ni RIB), destinataire avec sa fiche `docs/tiers/`. (1 bis) Le CRM Pro est inscrit comme système qui traite les données des conseillers (question 22) : ce qu'il reçoit et renvoie par l'API 3 (référence de conseiller, SIREN, réponses), où il est hébergé, qui y accède, avec la fiche `docs/tiers/crm-pro.md` d'INT-T28. (2) Le traitement des apporteurs gagne la finalité « contrôle d'incompatibilité avec le personnel de la Société ». La notice de l'apporteur (page `/confidentialite`) la mentionne sans nommer personne, si Williams la retient (question 14). (3) REQ-CPL-009 : 5e objet, « gestion des prises en charge et calcul de la rémunération variable ». Il est signé avant la première prise en charge. (4) HYP-W19-CSE : information ou consultation du CSE, ou constat écrit de Will qu'il n'y en a pas, daté, condition de la mise en service de DM-30 et de l'API 3 (SEC-34) ; elle ne bloque la livraison d'aucune tâche (question 13). (5) Notice du conseiller rédigée et versionnée dans Partners (`docs/rgpd/notice-conseiller.md`) ; sa présentation et son accusé à la première connexion au CRM Pro sont une exigence du rôle CRM listée dans l'ADR INT-T28, version et date conservées. (6) Durées dans `ssot.ts` sous un marqueur HYP, dont les justificatifs de variable pendant au moins la prescription salariale (à confirmer). (7) Vérification qu'aucun écran ne restitue un indicateur d'activité d'un conseiller. (8) Origine art. 13 ou art. 14 dans TRT-TIERS. (9) Tout point de droit social non sourcé prend l'option la plus prudente, marquée « à arbitrer par Williams », avec sa question ; aucun avis extérieur n'est attendu (question 13) et aucun ne bloque la tâche.

#### T-ARG-040 — Chaîne de part variable : plan accepté et non rétroactif, matricule chiffré, lignes nées de l'encaissement, régularisation, tables immuables
- **Méta** : phase 2 · lead argent · zone argent · schema true (label `schema`) · sensible [argent, attribution, rgpd] · hyp [HYP-W19-PART-VARIABLE, HYP-W19-VARIABLE-SORTIE, HYP-W19-REGULARISATION] · label `role:gardien-spec` pour `docs/GLOSSAIRE.md` (fichier réservé : lot dédié avec `--settings` surchargé, GOV-116, ou écriture humaine par Williams) · 1,5 j
- **Deps** : DM-15, T-ARG-034, SEC-31, DM-04 · **Reqs** : REQ-ARG-036, REQ-ARG-038, REQ-JUR-045, REQ-DM-021
- **Paths** : `prisma/schema.prisma`, `prisma/migrations/`, `src/domain/part-variable/calcul.ts`, `src/domain/part-variable/adaptateur-grille.ts`, `src/server/part-variable/naissance.ts`, `src/domain/evenement/charges.ts`, `src/server/securite/pii.ts`, `tests/unit/domaine/part-variable.spec.ts`, `tests/integration/part-variable.spec.ts`, `docs/GLOSSAIRE.md`
- **Acceptance** : ELLE ÉCRIT LE SCHÉMA. (1) Tables `plans_part_variable` (conseiller, version, date d'effet, empreinte du document, `accepte_at`, `valide_par_id`) et `lignes_part_variable`, plus `utilisateurs_console.matricule_chiffre` (`colonnesPii`, AAD). FK vers `utilisateurs_console` seulement. Déclencheurs anti-UPDATE/DELETE. (2) Aucun plan actif sans `accepte_at`. L'acceptation du salarié se recueille hors de la console, le conseiller n'ayant aucun écran Partners (question 22) : l'admin l'enregistre avec la version et l'empreinte du document accepté. Date d'effet au moins égale à l'acceptation et au jour courant, et postérieure à la dernière période exportée (témoin de rétroactivité refusée). (3) `paiement.recu` sur une attribution du conseiller lui-même donne une ligne par la fonction pure de DM-04, et zéro LigneCommission. La signature de DM-04 retenue est celle de l'avenant A01 (`46968b5`) : `grille: ContenuGrille` et `commissionId`. Un adaptateur (`adaptateur-grille.ts`) traduit le plan de part variable accepté en `ContenuGrille`, lignes au champ `kind` (`flat`, `percent`, `scale`) de DM-03-P, sans modifier DM-04 ni rendre `GrilleCommission` générique. Jamais d'agrégat du réseau. Le champ `commission` de `devis.signe` n'est jamais lu. (4) Palier absent : anomalie, jamais zéro, jamais de repli sur une grille. (5) Un avoir ou un impayé donne une ligne négative reportée sur la période suivante, jamais sur un export figé ni en retenue. Un encaissement après le départ suit HYP-W19-VARIABLE-SORTIE. (6) Agrégat `part_variable` par ADD VALUE. Charges sans nom ni montant. Rien dans pino. (7) Seeds factices, `gov:publication` vert. (8) Garde AST dans les deux sens.

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

#### UX-P2-10 — Écran « Export paie » (admin, comptable), avec la base de calcul par ligne
- **Méta** : phase 2 · lead console · zone console · sensible [argent] · **0,5 j** (1 j avant la question 22 : l'écran « Ma part variable » du conseiller est retiré, le conseiller n'ayant aucun écran Partners)
- **Deps** : T-ARG-041, UX-P1-16, UX-P2-15 · **Reqs** : REQ-UX-047, REQ-ARG-037, REQ-ARG-038
- **Paths** : `src/app/(console)/console/argent/paie/`, `src/content/micro-copy/console/paie.ts`, `tests/e2e/console/export-paie.spec.ts`
- **Acceptance** : (1) Sous « Argent », « Export paie » est une entrée DISTINCTE du « Lot apporteurs », jamais dans le même tableau. États lisibles : brouillon → validé par une seconde personne → exporté. Justificatif par ligne : entreprise, encaissement, forfait ou taux du plan accepté. Ni IBAN ni le mot « lot ». (2) Aucune restitution au conseiller dans Partners en V1 (HYP-W19-DROITS-PAIE) : le bulletin fait foi. (3) REQ-UX-047 : exporter un mois en ≤ 4 interactions (E2E). Cinq états, maquette UX-P2-15, REQ-UX-018.

#### QA-T32 — Partition de l'argent entre populations : contre-calcul, rejeu, avoir après export, encaissement après départ, fraude par la même personne
- **Méta** : phase 2 · lead qualité · zone qualite · 0,75 j
- **Deps** : T-ARG-040, T-ARG-041, T-ARG-036 · **Reqs** : REQ-ARG-036, REQ-ARG-038, REQ-ARG-003
- **Paths** : `tests/argent/partition-des-populations.spec.ts`, `tests/argent/contre-calcul.sql`
- **Acceptance** : (1) Un `paiement.recu` sur un conseiller donne 0 LigneCommission, 0 relevé, 0 autofacture, 0 ligne de lot, 0 DAS2 et 1 ligne de part variable. (2) Contre-calcul SQL sur des scénarios nommés : SIREN du conseiller, SIREN passé d'un apporteur à la Société, au plus une rémunération par encaissement. (3) Property-based : total apporteurs + total conseillers = total né. (4) Témoins : avoir après export reporté, encaissement après départ, plan rétroactif refusé, validation par la même personne refusée. (5) Chaque témoin est vu rouge d'abord.

### Phase 3

#### UX-P3-13 — Maquettes des écrans de console de la phase 3 (pilotage, conformité et anomalies, statistiques, notes)
- **Méta** : **lot transverse** · phase 3 · `ux-redaction` · zone console · label `role:ux-redaction` · externe will · 1,5 j
- **Pourquoi, pour tous les rôles** : le pilotage du lecteur, la conformité et les anomalies de l'admin, les statistiques et les notes seraient codés sans maquette validée. L'onglet « Conseillers salariés » du point (2) n'y ajoute qu'un onglet.
- **Deps** : UX-P1-18 · **Reqs** : REQ-UX-047, REQ-UX-018, REQ-UX-042
- **Paths** : `docs/maquettes/`, `docs/maquettes/VALIDATION.md`
- **Acceptance** : (1) Une maquette par écran de console de la phase 3 listé dans `CONSOLE-ROUTES` (UX-P3-04, UX-P3-05, UX-P3-07, UX-P3-10…). (2) Onglets « Réseau d'apporteurs » et « Conseillers salariés » séparés. Le lecteur ne voit que des agrégats, masqués sous 3 conseillers. (3) Cinq états, deux thèmes, budget du geste principal. (4) Validation groupée de Will.

## 6. Tâches existantes à amender

Toutes par GOV-115, par `hors-depot/reecrire-champ.mjs` (ou `hors-depot/poser-champ.mjs` pour une
acceptance encore absente), avec motif et `--si-inchange` ; `reqs`, `hyp` et `zone` par le même outil
une fois étendu par GOV-117 (question 20, option A). **Aucune n'est amendée par la PR qui porte ce
fichier** : les exigences qu'elles citeraient n'existent pas encore (GOV-112).

**Les lignes « À la pose de son acceptance » ne sont pas différées.** Sur chaque tâche cible dont
l'acceptance est vide à la fusion de `main` (mesuré le 2026-09-29 : SEC-12, SEC-16, INT-T07-P, UX-P1-04,
DM-13, DM-15, T-ARG-015, T-ARG-016, T-ARG-018, DM-19, T-ARG-035), GOV-115 les écrit dès son passage par
`hors-depot/poser-champ.mjs`, sous la forme « Contraintes W19 à intégrer : … », que l'auteur de
l'acceptance reprend. Ce fichier ne devient historique qu'une fois ces lignes posées.

> ⚠️ **TROU D'OUTILLAGE, MESURÉ À LA TRANSCRIPTION (2026-09-29), FERMÉ PAR GOV-117.** Les verbes
> hors dépôt n'écrivent sur une tâche existante que `titre`, `acceptance`, `tests`, `sensible`, `deps`,
> `estimateDays` et `schema` (`CHAMPS_ECRIVABLES` de `hors-depot/outils-backlog.mjs`) ; `paths` passe par
> `hors-depot/ajouter-path.mjs` et `hors-depot/retirer-path.mjs`. **Aucun verbe n'écrit `reqs`, `hyp` ni
> `zone`.** Or ce tableau en demande sur DM-07, DM-08, JUR-T01b, INT-T12, les dix tâches qui passent en
> zone `console`, et les tâches de la passe REQ-UX-047. Écrire ces champs à la main contournerait le
> `deny` de `docs/tasks.json`. **Williams a retenu l'option A le 2026-09-29 (question 20)** : GOV-117
> étend l'outil à ces trois champs, et GOV-115 en dépend. Il n'y a donc plus de repli : REQ-UX-047 s'écrit
> dans le champ `reqs` (jamais seulement dans l'acceptance), les dix tâches de console passent en zone
> `console` au registre, et HYP-W19-PORTEUR et HYP-W19-DEPART sont écrites dans le champ `hyp` de DM-07 et
> DM-08, leurs vrais porteurs.

| Tâche(s) | Changement |
| --- | --- |
| DM-07 | AVANT toute revendication. hyp [HYP-W19-PORTEUR, HYP-W19-CYCLE] et reqs + REQ-DM-048 par le verbe de GOV-117, estimateDays 1 → 1,5 (chemin critique). (1) `CanalDepot` reçoit `console`. (2) `apporteurId` devient nullable et `utilisateurConsoleId` est ajouté (nullable, FK Restrict, index). Contraintes : CHECK XOR des deux porteurs ; CHECK grille présente si et seulement si le porteur est un apporteur ; CHECK canal `console` si et seulement si le porteur est un conseiller, et alors `jeton_depot_id IS NULL` ; CHECK sur `rang_attente` réservé à l'apporteur ; `peremption_suspendue_at` suit HYP-W19-CYCLE (mêmes délais visibles). (3) DÉCLENCHEUR : `utilisateur_console_id` désigne un utilisateur de rôle `conseiller_salarie` non désactivé ; au moment de DM-07, aucune valeur ne passe tant que SEC-31 n'est pas là. (4) `depots_refuses` et `personnes_declarees` restent réservées aux apporteurs. (5) Témoins : attribution d'apporteur sans grille refusée ; attribution de conseiller avec grille refusée ; porteur de rôle qualifieur refusé ; apporteur puis conseiller sur le même SIREN refusé, et inversement. |
| DM-08 | hyp [HYP-W19-CYCLE, HYP-W19-DEPART] par le verbe de GOV-117, reqs + REQ-SEC-042, estimateDays 1,25 → 1,5. (1) Entrée dérivée « type de porteur ». (2) Événement de naissance `prise_en_charge_par_la_societe`. Vu de l'espace et de l'API 1, l'état suit la même chronologie qu'un dépôt d'apporteur (question 2, HYP-W19-CYCLE) : même état d'entrée, passage à `active` au même délai que la confirmation d'un dépôt, par l'horloge serveur et sans qualifieur. (3) Refus typé, pour un conseiller, de : confirmation tacite par un apporteur, `non_confirme`, gel, `figee_resiliation`, rang, contestation ; aucun de ces refus ne se voit de l'espace. (4) Prolongation W9 identique à celle de l'apporteur. (5) Événement `porteur_reaffecte {de, vers, acteurId, motif}`, de conseiller à conseiller seulement. (6) Désactivation : les prises en charge sans suite passent `perimee` sous 15 jours. (7) Test exhaustif des triplets (état, événement, type de porteur), et test : à chaque stade, l'état visible d'une prise en charge égale celui d'un dépôt d'apporteur aux mêmes dates. Les 13 valeurs d'`EtatAttribution` sont inchangées. |
| DM-12 | Sans changer l'estimation. `verifications` reçoit le porteur XOR. `decide_par_id`, `traite_par_id` et `repondue_par_id` ne désignent jamais un conseiller : DÉCLENCHEUR, et non une assertion de test. |
| DM-09, DM-13, DM-24 | DM-09 : palier, taux et `verificationPrioritaire` se dérivent des seules qualifications d'apporteurs (témoin de volume). DM-13 (acceptance à poser) : péremption et expiration à 12 mois du conseiller aux mêmes délais visibles que l'apporteur (HYP-W19-CYCLE) ; la fin notifie le rang 1 ; le délai d'attente de la Société démarre à toute libération. DM-24 : ne sélectionne jamais un porteur conseiller (témoin à deux faces). |
| DM-25 | L'annulation n'a lieu que si `connueDepuisAt < deposeeAt` (témoin : un devis postérieur n'annule rien). Pour un porteur conseiller, information en console seulement. |
| SEC-12 | À la pose de son acceptance : la file est réservée aux apporteurs, et elle se forme derrière une prise en charge comme derrière un apporteur ; le verrou de limite vaut par porteur (`apporteurId`, ou `utilisateurConsoleId` pour DM-30) ; le verrou SIREN est commun ; la transaction est exposée comme une fonction réutilisable ; l'issue d'un dépôt sur une prise en charge est celle d'une occupation par un apporteur ; jamais de valeur `anteriorite_suivi` (question 2). |
| SEC-16 | À la pose de son acceptance : un SIREN pris en charge par un conseiller est rendu comme un SIREN occupé par un apporteur au même stade (même état, même date « jusqu'au », question 2). Faire trancher d'abord, par le gardien-spec, la contradiction 4 états (`docs/GLOSSAIRE.md:117`) / 5 états (REQ-UX-007) / binaire (REQ-JUR-011). |
| INT-T07-P | À la pose de son acceptance : une attribution de conseiller répond comme une attribution d'apporteur au même stade : `attribuee`, `until`, `apporteurRef` opaque de même forme (question 2 : même réponse de l'API 1). Test de forme refusant tout champ de plus, et test d'indistinction repris par QA-T31. Aucune commission d'apporteur n'est déduite de l'API 1 côté axion-ia : la chaîne d'argent de Partners aiguille par porteur réel (REQ-DM-021). Le déplacement vers `packages/contracts/` est RETIRÉ du chantier : il imposerait `schema: true` et une copie à hash identique côté axion-ia, non chiffrées. |
| DM-04 | **AUCUN amendement par GOV-115 (arbitrage rendu le 2026-09-29).** La signature de l'avenant A01 est RETENUE : `grille: ContenuGrille` et `commissionId`, champ `kind` (`flat`, `percent`, `scale`) de la grille DM-03-P, plafond de REQ-ARG-007 en SSOT et `src/domain/seuils/ssot.ts` dans les paths (commits `46968b5` et `2dd080d` de la session qui tient DM-04, branche `t/dm-04`). Seule cette session réécrit l'entrée DM-04, par sa propre PR. La part variable ne touche pas DM-04 : T-ARG-040 (3) traduit le plan de part variable en `ContenuGrille` par un adaptateur de phase 2. Les cinq valeurs d'`ActiviteFacturation` que l'avenant laisse au gardien-spec entrent au glossaire par GOV-112 (§2). |
| JUR-T03 | (a) Correction du chemin, qui est `axionia/src/content/recrutement/commercial-offer.ts` (le chemin déclaré `axionia/src/content/commercial-offer.ts` n'existe pas). (b) Extension RECOMMANDÉE comme obligatoire (+0,5 j, 1 → 1,5), sous réserve de Williams : titre et héros en « apporteur d'affaires » (`commercial-offer.ts:76`) ; retrait des mots-clés « offre d'emploi » et « poste de commercial » (`:369`, `:386`) ; `careers/categories.ts:88-96` ne renvoie plus vers `/devenir-commercial-ia`. L'annonce de recrutement « Responsable du réseau commercial » n'y entre pas : Williams la déclare indépendante de Partners (question 1, 2026-09-29). |
| JUR-T01b, INT-T12 | deps + JUR-T31, hyp + HYP-W19-CONCOURS (par le verbe de GOV-117). Aucun DocuSeal avant la fusion de JUR-T31 : art. 3.5 amendé et clause de non-exploitation validés par Williams. L'arbitrage de principe est rendu (question 2, 2026-09-29). |
| UX-P1-01, UX-P1-02 | deps + UX-P1-17, QA-T33 (UX-P1-18 n'est pas requise : espace). Budget REQ-UX-001 mesuré par la fixture QA-T33. Test : aucune issue ne nomme un rôle de console, et aucune ne distingue un occupant conseiller. ⚠️ Par UX-P1-17, ces deux écrans héritent du bloqueur externe JUR-T31 (validation du texte par Williams) ; le chemin critique n'en est pas affecté (recalcul : 22,75 j inchangés). |
| UX-P1-04 | À la pose de son acceptance : un lien d'apporteur consommé redirige en une action vers « / » ou vers l'URL demandée, bornée aux chemins relatifs de l'espace. Fin du cul-de-sac de `src/app/(espace)/connexion/ecran.tsx:76-82`. Le mécanisme du code à 6 chiffres est écrit pour être réutilisé par SEC-29. |
| UX-P1-06, UX-P1-07, UX-P1-12, UX-P1-13, EXT-T02a, UX-P2-03, UX-P2-05, UX-P3-04, UX-P3-05, T-ARG-035 | La zone passe de `espace` à `console` au registre, par le verbe de GOV-117 (question 20, option A) (UX-P1-06 est aujourd'hui en zone `espace`, vérifié), avec des chemins réels sous `src/app/(console)/console/…` ; deps + UX-P1-16 et la tâche de maquettes de la phase (UX-P1-19, UX-P2-14, UX-P3-13) ; chaque tâche ajoute son droit `ecran:*` et cite REQ-UX-047 et REQ-UX-048. En plus : UX-P1-07 : aucune prise en charge dans la file ; UX-P1-13 : filtre « amenée par » (pastille avec icône et mot), aucun droit pour le conseiller ; UX-P2-03 : test d'absence de toute ligne de conseiller ; UX-P3-05 : devient l'accueil « à traiter aujourd'hui » de l'admin quand il est livré. `zone` et `reqs` s'écrivent par le verbe de GOV-117 (encadré ci-dessus). |
| Les tâches d'écran à faire (45 à `c60e2f3`) | Par la passe de GOV-115, qui DÉPEND de GOV-117 : toute tâche `a_faire` ayant un chemin sous `src/app`, SAUF les trente-deux tâches W19 versées par GOV-115 (leurs tâches d'écran citent déjà REQ-UX-047) et SAUF JUR-T04 (nommée : sa branche `t/jur-t04` est en travail, pas de rétroactivité). Chacune reçoit REQ-UX-047 dans son champ `reqs` (par le verbe de GOV-117, jamais par une simple citation dans l'acceptance), son droit `ecran:*`, sa dépendance de maquette, +0,1 j (42 tâches, 4,2 j, à `c60e2f3`), et une ligne « geste principal : … ; budget : … » dans son acceptance, ou une dette nommée par tâche quand le geste n'est pas encore connu. EXT-T01, EXT-T09 et UX-P3-12, déjà à 1,5 j, absorbent le coût grâce à la fixture QA-T33. La liste est MESURÉE à la fusion de `main` et jointe à la PR ; elle n'est pas recopiée ici. La tâche `/confidentialite` née de la scission de JUR-T04 y entre si elle existe alors : l'écart de décompte est nommé. |
| DM-15 | À la pose de son acceptance, sans changer l'estimation : le premier geste aiguille selon le porteur, par un POINT D'EXTENSION nommé (patron SEC-12) que DM-15 livre et teste avec un délégué factice ; un porteur conseiller y branche T-ARG-040, qui dépend de DM-15 : DM-15 ne teste donc pas la délégation réelle. Témoin nommé. |
| T-ARG-015, T-ARG-016, T-ARG-018, DM-19, T-ARG-035 | À la pose de leurs acceptances : types fermés à `apporteurId` NOT NULL, et test d'absence de toute donnée de conseiller dans le relevé, l'autofacture, le pain.001, la DAS2 et le registre « Commissions ». |
| T-ARG-037, DM-23, DM-16 | T-ARG-037 : repli à 60 jours réservé aux apporteurs ; garde AST dans les deux sens. DM-23 : GrilleModele, GrilleContrat et contrats réservés aux apporteurs (témoin). DM-16 : un conseiller n'est ni parrain ni filleul, dans les deux sens. |
| DM-29, UX-P3-07, UX-P3-09, UX-P3-11 | DM-29 : dimension « origine » dont la somme égale le total. UX-P3-07 : onglets séparés ; le lecteur ne voit que des agrégats de conseillers, avec masquage sous 3 ; le nominatif est réservé à l'admin, avec journal de lecture et témoin `role_refuse`. UX-P3-09 : export des conseillers par l'admin seul. UX-P3-11 : aucune alerte ne vise un conseiller ; `activite()` n'est pas réutilisée. |
| UX-P3-10, DM-20 | UX-P3-10 : `action:ecrire_note_interne` refusée au conseiller (témoin). DM-20 : l'export d'accès du conseiller est produit par l'admin en console, le conseiller n'y ayant aucune session (question 22) ; son effacement est borné par la conservation de paie. |
| UX-P2-06, QA-T29, QA-T16 | Cloisonnement sur trois populations. Course mixte de 50 dépôts et prises en charge. QA-T16 utilise la fixture QA-T33 ; le conseiller n'a aucun parcours dans Partners (question 22), l'API 3 est couverte par SEC-34 et QA-T31. |
| UX-P1-08 | La liste « Plus » est dérivée de la carte des routes : `docs/ESPACE-ROUTES.md:18` en a 6, `scripts/gates/etats-vides.ts:39-43` en a 5 (Filleuls manque). La teinte « ok / versé » est distinguée de l'accent d'action en thème sombre. |
| JUR-T04 | AUCUN changement de périmètre ni de compte : trois traitements (`t/jur-t04:tests/unit/juridique/registre-rgpd.spec.ts:258`, fichier absent de `main`). Seulement des « Questions ouvertes » (voir §8). Exclue de la passe REQ-UX-047, nommément. Scission décidée par Williams le 2026-09-29 : la page `/confidentialite` devient une tâche à part (identifiant JUR-T34 ou au-delà), qui entre dans la passe et que JUR-T32 attend. |

## 7. Modifications du livré

Aucune n'est faite ici : chacune devient le travail d'une tâche.

| Quoi | Preuve | Urgence | Tâche porteuse |
| --- | --- | --- | --- |
| Ajouter au registre W19, les 21 HYP-W19-* (23 avant la question 22 ; 20 avant l'entrée de HYP-W19-IDENTITE-CRM, relecture `securite` de #230) et les 12 REQ nouvelles. Corriger HYP-C4 et PRESEANCE §3.2 (promotion automatique périmée). Aligner GLOSSAIRE §8 « entreprise connue » sur REQ-DM-029. Ajouter au §8 les entrées « conseiller salarié », « prise en charge (Société) » (sens financier en interdit), « plan de part variable » et les cinq valeurs d'`ActiviteFacturation`, sans marqueur exercé (§2). | `docs/DECISIONS.md:80` (HYP-C4) contre REQ-DM-004 ; `docs/GLOSSAIRE.md:320` ; le registre ne connaît que W1-W18 ; `scripts/gates/gov-check.ts:269` et `:280-318` | avant phase 1 | GOV-112 |
| Chemin déclaré de JUR-T03 : `axionia/src/content/commercial-offer.ts` n'existe pas ; le vrai fichier est `axionia/src/content/recrutement/commercial-offer.ts`. | Constat du plan, confirmé par le gardien-spec (fichier réel, lignes 76, 369 et 386) | avant la suite de la phase 0 | GOV-115 |
| Point (1) de l'acceptance de DM-04 : signature `grille: ContenuGrille` et `commissionId` de l'avenant A01, RETENUE par arbitrage du 2026-09-29 ; GOV-115 ne l'amende pas (§6). | Branche locale `t/dm-04`, commits `46968b5` (avenant) et `2dd080d` (`src/domain/commission/calcul.ts:25-33`) | avant la suite de la phase 0 | DM-04 (session qui la tient) |
| REQ-UX-047 posée sur les tâches d'écran `a_faire` existantes (45 à `c60e2f3`, re-mesurées à la fusion de `main`) avant que GOV-113 ne s'arme, faute de quoi la phase 1 gèle. +0,1 j par tâche. | `docs/tasks.json` à `c60e2f3` : 46 tâches non fusionnées ont un chemin sous `src/app` (21 en phase 1, 11 en phase 2, 13 en phase 3, plus JUR-T04). EXT-T01, EXT-T09 et UX-P3-12 sont déjà à 1,5 j. | avant phase 1 | GOV-115 |
| Connexion de la console : aucun utilisateur de console ne peut recevoir de lien. L'écran de réussite de l'espace est un cul-de-sac. La console n'a ni code à 6 chiffres ni page « lien déjà utilisé ». | `src/server/auth/lien-magique.ts:106`, `:195-196`, `:263` ; `src/app/(espace)/connexion/ecran.tsx:76-82` ; `src/server/notifications/table-ssot.ts:14-17` (un seul gabarit) ; REQ-UX-015 (code et page dédiée, pour l'espace seulement) | avant phase 1 | SEC-29 (console), UX-P1-04 (espace) |
| La session de 30 jours de REQ-SEC-003 s'applique aussi à la console, sans `sessionVersion` pour les utilisateurs de console. | `src/server/auth/durees.ts:18-19` ; `src/server/roles/require-role.ts:66-73` ; `prisma/schema.prisma:290-304` | avant phase 1 | SEC-29 (durée), SEC-30 (`sessionVersion`) |
| Console : navigation non filtrée par rôle dans les maquettes, aucune maquette de console validée, aucune tâche qui les produise. Les accueils envisagés ne sont livrés qu'en phase 2 ou 3. | `docs/maquettes/file-qualification.html:800-806` ; `docs/maquettes/VALIDATION.md:21-26` (« — ») ; seule UX-P0-02 (fusionnée, espace) produit des maquettes ; UX-P2-03 en phase 2, UX-P3-04 et UX-P3-05 en phase 3 ; `src/server/roles/matrice.ts:31-39` n'a aucun droit `ecran:*` | avant phase 1 | UX-P1-18, UX-P1-19, UX-P1-16 |
| Garde des maquettes limitée aux identifiants UX-P* : des écrans de console peuvent être codés sans maquette. Plusieurs tâches d'écran de console sont classées en zone `espace`. | `scripts/gates/maquettes-validees.ts:96` ; `docs/tasks.json` : UX-P1-06, UX-P1-12, EXT-T02a et UX-P3-05 en zone `espace` (vérifié), acceptances vides | avant phase 1 | GOV-113, GOV-115 |
| Le contrat v1 ne connaît que l'antériorité client ou devis (3.3) et le concours entre apporteurs (3.5). Une prise en charge par la Société n'a aucune base écrite. Williams retient l'art. 3.5 (question 2) : il est amendé pour dire, en termes généraux, que l'entreprise peut être déjà prise « par un autre apporteur ou par la Société ou ses préposés ». `IssueDepot` reste aligné un pour un sur 3.3 et 3.3 bis : aucune 13e valeur. | `docs/contrat/CONTRAT-APPORTEUR-V1.md:131-145` et `:172-178` ; `src/domain/depot/issue-depot.ts:3-10` et `:16-29` | avant phase 1 | JUR-T31 (texte), DM-30 et QA-T31 (indistinction, phase 2) |
| Le lot dédié du `gardien-spec` avec `--settings` surchargé est nommé mais n'existe nulle part ; un fichier passé par `claude --settings` s'ajoute aux réglages sans lever un `deny` déjà présent. | `docs/CONVENTIONS.md` §8 ; `docs/CHARTE-AGENTS.md` §7 ; `partners/ADR-0019` (« reste à faire ») ; `.claude/settings.json:96-103` | avant la suite de la phase 0 | GOV-116 |
| Aucun verbe hors dépôt n'écrit `reqs`, `hyp` ni `zone` d'une tâche existante. | `CHAMPS_ECRIVABLES` de `hors-depot/outils-backlog.mjs` | avant la suite de la phase 0 | GOV-117 |
| Le rôle console est figé à quatre valeurs (enum, REQ-SEC-023, GLOSSAIRE l.124 et §7, test littéral). | `prisma/schema.prisma:59-66` ; `src/server/roles/matrice.ts:27-28` ; `tests/unit/securite/matrice-des-roles.spec.ts:78` et `:96-111` ; `docs/GLOSSAIRE.md:124` | plus tard | SEC-31 |
| La garde lexicale a des limites de lecture sur les identifiants composés, et aucune famille de portée apporteur ne nomme la population salariée ; `import_console` ne reconnaît que le segment `console`. Correction sur le patron GOV-109, témoins hors dépôt. | `src/domain/lexique/lexique-interdit.ts` (10 familles) ; `scripts/gates/jur-aucun-agregat-reseau.ts:121` ; `scripts/lot/revues.ts:1214-1248` ; acceptance de GOV-109 | plus tard | GOV-114 |
| Couche d'accès : `CLES_REFUSEES` doit refuser `utilisateurConsoleId`, et il faut un cloisonnement par ligne côté console. | `src/server/acces/for-apporteur.ts:233-265` ; `src/server/roles/require-role.ts:106-131` | plus tard | SEC-32 |
| Point unique de création d'un Apporteur : y greffer le contrôle croisé du courriel et le blocage de la candidature d'un conseiller actif. Aucun téléphone ni matricule n'existe pour un utilisateur de console. | `prisma/schema.prisma:178`, `:295`, `:290-304` ; `docs/tasks.json` INT-T26 (3) ; `src/server/securite/pii.ts:298-302` | plus tard | SEC-33, T-ARG-040 (matricule) |
| axion-ia : la copy publique appelle « commercial » l'apporteur. La PR axion-ia #1202 affiche sur la fiche d'un apporteur une candidature à un poste salarié et laisse la personne dans le tunnel des apporteurs. L'espace ressources connaît un destinataire « commercial ». `AdminRole` n'a aucun rôle restreint pour un salarié qui fait des devis. L'annonce de recrutement d'axion-ia n'est pas un constat de ce plan (question 1). | axion-ia `src/content/recrutement/commercial-offer.ts:76`, `:369`, `:386` ; `careers/categories.ts:88-96` ; `pricing.ts:828` ; `prisma/schema.prisma:8167-8170`, `:177-189` ; `visibility-mapping.ts:18` (constats sur `a12e58165`) | avant la suite de la phase 0 | JUR-T03 (extension, question 11), JUR-T33 (PR #1202 seule) ; les autres surfaces relèvent de la question 12 |

## 8. Consignes aux auteurs en cours

1. **Identifiants réservés au chantier W19** — ne les prenez pas : GOV-112 à GOV-117 (GOV-116, le lot
   dédié avec `--settings` surchargé, et GOV-117, l'écriture de `reqs`, `hyp` et `zone`, sont versées sur
   la branche W19), SEC-29 à SEC-33, UX-P1-16 à UX-P1-20, UX-P2-10 à UX-P2-15, UX-P3-13, JUR-T31 à
   JUR-T33, DM-30, DM-31, T-ARG-040 à T-ARG-042, QA-T31 à QA-T33, et, ajoutées le 2026-09-29 par la
   question 22, **INT-T28, SEC-34 et DM-32** (premier identifiant libre de chaque famille après ces
   réservations, vérifié sur `origin/main` à `7ff56c8` et sur les branches des PR ouvertes). UX-P2-11,
   supprimée, reste réservée et n'est jamais réemployée. Ce sont des jetons, fixés à la dernière
   fusion de `main` dans la branche de GOV-112 et GOV-115. **Aucune garde ne les protège** : seules
   GOV-112, GOV-115, GOV-116 et GOV-117 existent au registre de la branche, et `verser-tache` ne refuse
   qu'un identifiant déjà présent dans l'arbre où il tourne. **Numéros GOV des autres sessions** (consigne
   du coordinateur, 2026-09-29) : GOV-118 à GOV-122 sont versées par la PR #219 de la session -bf,
   fusionnée (`7ff56c8`) et intégrée à cette branche par `pnpm vues:fusion` sans collision ; la session -bf prend ses nouvelles GOV de **GOV-123 à GOV-149**, la session -66 à partir de
   **GOV-150**. **Premiers numéros libres des autres familles, après les réservations W19 : SEC-35, UX-P1-21,
   UX-P2-16, UX-P3-14, JUR-T34, DM-33, T-ARG-043, QA-T34, INT-T29** (familles non touchées : EXT-T12,
   CPL-T24). Un versement est imminent : la page `/confidentialite` issue de la scission de JUR-T04 prend
   JUR-T34 ou au-delà. GOV-115 vérifie, à sa fusion de `main`, qu'aucun jeton n'a été pris. Mesuré à l'intégration de `c4b0e3f` (2026-09-29) : aucun jeton W19 n'est pris sur `main` ; hors des réservations W19, JUR-T34 et JUR-T35 sont prises par la PR #233 et QA-T34 par la PR #221, ouvertes.
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
   déclencheur, estimation 1 → 1,5, `hyp` et `reqs` écrits par le verbe de GOV-117).
4 ter. **SEC-12, SEC-16, DM-08, DM-13, INT-T07-P** (question 2, art. 3.5) : côté apporteur, une prise en
   charge par un conseiller est indiscernable d'une occupation par un autre apporteur (même issue, texte,
   états visibles, délais, même réponse de l'API 1 et de « Vérifier »). Aucun point d'extension pour une
   issue d'antériorité de la Société, aucune valeur `anteriorite_suivi`, aucune `apporteurRef: null` pour
   la Société.
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
    `MotifRefusDepot`, `CanalDepot` ni `AgregatJournal` (W19 n'ajoutera jamais de valeur à `IssueDepot`
    ni à `MotifRefusDepot` : question 2). Aucun point de droit social n'attend d'avocat (question 13) :
    prenez l'option la plus prudente, écrivez « à arbitrer par Williams », et ne bloquez rien. Ne touchez pas au GLOSSAIRE §7. N'écrivez jamais le
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
    s'ouvrent que lorsqu'aucune PR de clôture n'est ouverte (RM-13) : la PR #219 de la session -bf en
    était une ; elle est fusionnée (`7ff56c8`), et `pnpm vues:fusion` a intégré GOV-118 à GOV-122 à cette
    branche avant l'ouverture de sa PR. En cas de conflit, passez par
    `hors-depot/fusionner-registre.mjs`. Un conflit de vue dérivée se résout par `pnpm vues:fusion`,
    jamais à la main.
15. **Relais** : chaque session reçoit ce §8 EN ENTIER, points 11 et 14 compris, pas un résumé.

## 9. Questions à Williams

Chaque question commence par l'hypothèse qui s'applique sans réponse. Là où aucune HYP n'existe, la
question le dit et donne l'option conservatrice (`docs/DECISIONS.md` §5). Une réponse datée remplit la
colonne « Tranchée » de l'hypothèse visée. **Les questions 1, 2, 12, 13, 20, 21 et 22 ont reçu la
réponse datée de Williams le 2026-09-29 (session -d7)** ; les questions 15, 16 et 18 sont sans objet
dans Partners depuis la question 22 ; les autres restent ouvertes.

1. **RÉPONSE DE WILLIAMS, 2026-09-29 (session -d7) : RIEN À FAIRE.** L'annonce axion-ia « Responsable du
   réseau commercial » reste indépendante de Partners. Elle sort des actions, des bloqueurs et des
   questions de ce plan, et aucune tâche W19 n'exige rien sur elle. JUR-T33 n'inventorie plus que la PR
   axion-ia #1202 (fusionnée le 2026-09-28), qui affiche sur la fiche d'un apporteur une candidature à un
   poste salarié et laisse la personne dans le tunnel des apporteurs, sans demander de la défaire.
2. **RÉPONSE DE WILLIAMS, 2026-09-29 (session -d7) : ART. 3.5 RETENU, ART. 3.3 c) REJETÉ.** Ses mots :
   « l'apporteur voit que l'entreprise est déjà faite par quelqu'un d'autre, pour éviter deux commissions
   à verser (les commerciaux d'Axion-IA sont aussi commissionnés sur les ventes), comme si c'était un
   autre apporteur ». HYP-W19-CONCOURS est tranchée. Williams a confirmé que cette réponse fait foi : elle
   remplace le point 8 du ticket #220 (« antériorité de la Société »). Conséquences écrites dans tout le plan : côté
   apporteur, une prise en charge par un conseiller est indiscernable d'une occupation par un autre
   apporteur (même issue de dépôt, même texte, mêmes états visibles, mêmes délais, même réponse de
   l'API 1 et de « Vérifier une entreprise ») ; aucune valeur `anteriorite_suivi` dans `IssueDepot` ni
   `MotifRefusDepot` ; un seul bénéficiaire par attribution ; le contrat (JUR-T31, art. 3.5) dit en termes
   généraux que l'entreprise peut être déjà prise « par un autre apporteur ou par la Société ou ses
   préposés », sans que l'outil révèle jamais qui. Les trois défauts reprochés à 3.5 deviennent des
   exigences de conception : (i) même chronologie et mêmes états visibles qu'un dépôt d'apporteur
   (HYP-W19-CYCLE, DM-08) ; (ii) même réponse de l'API 1, sous un test d'indistinction (REQ-INT-014,
   QA-T31) ; (iii) risque « Société concurrente de ses cocontractants » accepté par Williams (§11,
   risque 5), avec les garde-fous anti-abus prévus.
3. **Par défaut : `conseiller_salarie`, affiché « Conseiller salarié », dont l'acte est « prendre en charge
   une entreprise » (HYP-W19-NOM-ROLE).** Le validez-vous ? Alternatives : `vendeur_salarie`, ou
   `charge_affaires` (déconseillé).
4. **Par défaut : HYP-W19-CYCLE, HYP-W19-CARENCE, HYP-W19-NON-EXPLOITATION, HYP-W19-LIMITES et HYP-W19-IDENTITE-CRM.** Naissance
   directe « active », péremption de 90 j dès la prise en charge, sans suspension, et 12 mois sans
   reconduction ; la Société comptée comme UN seul porteur, avec un délai d'attente de 90 j après toute
   libération et le SIREN fermé pendant la fenêtre de 15 j d'un rang 1 ; un délai de 30 j après une
   vérification ou un dépôt refusé d'un apporteur ; des limites par conseiller et par Société, celle de la
   Société FIXE, égale à celle d'un apporteur quel que soit le nombre de conseillers, parce que l'identité
   du conseiller est affirmée par le CRM Pro (hypothèse de confiance) et que c'est cette limite qui borne un
   CRM Pro compromis. Les bornes
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
   ne touche aucun variable sur une entreprise portée par un apporteur. D'accord ? (La réponse à la
   question 2, « pour éviter deux commissions à verser », va dans le sens de ce défaut ; il reste un
   défaut tant que la question 7 n'a pas sa réponse datée.)
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
12. **RÉPONSE DE WILLIAMS, 2026-09-29 (session -d7) : AUCUN ACCÈS DU CONSEILLER À AXION-IA EN V1.**
    Question simplifiée : devis, signature et facture restent faits par la direction dans axion-ia ; le
    conseiller n'y a aucun rôle, aucun lien croisé ni SSO ; il travaille dans le CRM Pro (question 22).
13. **RÉPONSE DE WILLIAMS, 2026-09-29 (session -d7) : PAS D'AVOCAT, ET PAS D'EXCEPTION À `docs/DECISIONS.md`
    §5.** L'avis en droit social est retiré de tout le plan. Chaque point de droit social prend l'option la
    plus prudente par défaut, marquée « à arbitrer par Williams », et ne bloque aucune tâche :

    | Point | Option la plus prudente, par défaut | Où elle s'applique |
    | --- | --- | --- |
    | Statut | Contrat de travail écrit ; rien dans Partners ne présume l'exclusion d'un statut protecteur. À arbitrer par Williams | JUR-T32 |
    | VRP | Le statut VRP est tenu pour possible (L.7313-1 et suivants C. trav., à confirmer) : aucune règle de Partners ne repose sur son exclusion. À arbitrer par Williams | JUR-T32, T-ARG-040 |
    | Clause de variable | Accord écrit du salarié avant tout effet, jamais rétroactive, jamais modifiée unilatéralement (REQ-ARG-038). À arbitrer par Williams | T-ARG-040, T-ARG-042 |
    | Sortie | Un encaissement postérieur au départ reste dû au sortant (HYP-W19-VARIABLE-SORTIE). À arbitrer par Williams | T-ARG-040 |
    | CSE | Information du CSE, ou constat écrit et daté qu'il n'y en a pas, avant la mise en service ; condition de mise en service, jamais un blocage de tâche (HYP-W19-CSE). À arbitrer par Williams | JUR-T32, DM-30, SEC-34 |
14. **Par défaut : HYP-W19-CSE (pas de mise en service sans information du CSE ou votre constat écrit qu'il
    n'y en a pas) ; aucune HYP pour la base légale, option conservatrice : exécution du contrat de travail,
    à confirmer.** Quel est l'effectif, et existe-t-il un CSE ? Quelle base légale retenez-vous pour la part
    variable ? Et retenez-vous, dans la notice RGPD des APPORTEURS, la finalité « contrôle d'incompatibilité
    avec le personnel de la Société » (REQ-JUR-043), seule mention des salariés qu'un apporteur lirait hors
    du contrat ?
15. **SANS OBJET DANS PARTNERS depuis la question 22.** La session du conseiller (12 h au plus, 8 h
    d'inactivité, reconnexion en 3 gestes) est une exigence du rôle CRM, listée dans l'ADR INT-T28. La
    session de console des autres rôles est un paramètre de SEC-29, validé par Williams avant sa fusion.
16. **SANS OBJET DANS PARTNERS depuis la question 22.** Le hors-ligne du conseiller (pas de brouillon
    persistant, aucune occupation avant la réponse de Partners) est une exigence du rôle CRM, listée dans
    l'ADR INT-T28.
17. **Par défaut : le test de premier usage est joué par une personne du public si vous en fournissez une,
    sinon par un agent qui n'a pas écrit l'écran, avec une trace qui le dit (REQ-UX-047 point 7).**
    Pouvez-vous fournir, pour chaque public de Partners (apporteur de 45 à 68 ans, qualifieur, comptable, admin),
    une personne qui n'a jamais vu l'outil, avant la mise en service des écrans principaux ?
18. **Par défaut : « 0 violation serious ou critical » (REQ-UX-017/018).** Gardez-vous cette règle, ou
    voulez-vous WCAG 2.2 AA complet partout ? (Les valeurs du conseiller, cibles de 48 px et corps d'au
    moins 16 px, sont sans objet dans Partners depuis la question 22 : exigence du rôle CRM, ADR INT-T28.)
19. **Par défaut : les conseillers ne travaillent qu'à partir de la phase 2.** Les corrections transverses
    sont TRANCHÉES par Williams le 2026-09-29 : il les garde au plan, présentées comme le lot « confort de
    la console pour tous les rôles », distinct du chantier salariés. Chiffrage séparé (§10) : chantier W19
    21,0 j, lot transverse 15,7 j, total Partners 36,7 j. Reste ouverte la seule date de démarrage des
    conseillers (phase 2 par défaut).
20. **RÉPONSE DE WILLIAMS, 2026-09-29 (session -d7) : OPTION A, EXTENSION.** L'outil d'écriture du
    registre (`hors-depot/reecrire-champ.mjs` et `hors-depot/poser-champ.mjs`, ou leur équivalent) est
    étendu aux champs `reqs`, `hyp` et `zone` d'une tâche existante, par **GOV-117** (phase 0, §5), versée
    sur la branche W19. Garde-fous : validation contre le schéma, REQ et HYP existantes, journal des
    réécritures. Le repli « citation dans l'acceptance » est retiré de GOV-113 et de GOV-115 : les champs
    s'écrivent directement une fois GOV-117 fusionnée, la passe REQ-UX-047 dépend de GOV-117, et
    HYP-W19-PORTEUR et HYP-W19-DEPART sont écrites sur DM-07 et DM-08.
21. **RÉPONSE DE WILLIAMS, 2026-09-29 (session -d7) : GOV-116.** (Ajoutée après la transcription ; la
    question était restée ouverte : faut-il un lot dédié outillé, ou une écriture par Williams lui-même ?)
    GOV-116 (phase 0, §5), versée sur la branche W19, écrit, documente et teste le lot dédié du
    `gardien-spec` avec `--settings` surchargé. GOV-112 en dépend ; l'écriture humaine par Williams n'est
    plus la voie prévue.
22. **RÉPONSE DE WILLIAMS, 2026-09-29 (session -d7) : OPTION A, LE CRM PRO.** Les commerciaux salariés
    travaillent au quotidien dans le CRM Pro (dépôt séparé `will383842/axion-crm-pro`). **Partners décide :
    le registre d'antériorité unique reste dans Partners.** Partners garde le registre (DM-07 et DM-08
    amendées, porteur XOR), la transaction de prise en charge (DM-30) et le « Vérifier » (DM-31) exposés
    par l'API 3, toutes les bornes W19, la fiche conseiller et la réaffectation à quatre yeux (UX-P2-12),
    la part variable et l'export paie (T-ARG-040, T-ARG-041, T-ARG-042), le contrat, le RGPD, la garde
    lexicale et l'indiscernabilité côté apporteur. Le CRM Pro fait, dans son dépôt et après le gel du
    contrat de l'API 3, le rôle « commercial » neuf (sans export, sans suppression, sans accès en masse aux
    données personnelles, sans réutiliser `operator`), le bouton « Prendre en charge », le statut « à vous
    / non disponible », « Mes entreprises », l'avis J-15 et le durcissement multi-utilisateur (≈ 5,5 j, hors
    registre Partners). axion-ia garde devis, signature et facture, par la direction ; contrat d'événements
    v2 inchangé. Tâches : UX-P2-11 supprimée ; GOV-114, SEC-32, DM-31, UX-P2-15 et UX-P2-10 réduites ;
    INT-T28, SEC-34 et DM-32 ajoutées ; JUR-T32 inscrit le CRM Pro ; HYP-W19-SOURCE réécrite ;
    HYP-W19-SESSION-CONSOLE, HYP-W19-HORS-LIGNE et HYP-W19-A11Y-CONSEILLER deviennent des exigences du rôle
    CRM, listées dans l'ADR INT-T28.

### Réponse de la gouvernance Partners au ticket #220

Le ticket #220 (décisions de Williams du 2026-09-29, ouvert par la session « organisation du CRM Pro »)
reçoit cette réponse ; le commentaire publié sur le ticket en reprend l'essentiel, sans aucun détail de
sécurité.

**Ce qui est accepté.**

- **Point 8, commerciaux salariés** : ils travaillent dans le CRM Pro, avec des droits limités
  (question 22, option A). La même règle d'antériorité vaut entre apporteurs et commerciaux : un seul
  registre, dans Partners, horodaté par le serveur de Partners. Seule une prise en charge enregistrée par
  Partners (console admin ou API 3) occupe une entreprise ; rien n'est déduit d'un statut du CRM Pro ni
  d'un devis (HYP-W19-SOURCE).
- **Ce qui est remplacé** : « leur prise en charge devient une antériorité de la Société » cède la place à
  la réponse de Williams à la question 2 (art. 3.5) : vue par l'apporteur, une prise en charge est
  indiscernable d'une occupation par un autre apporteur. Aucune antériorité propre à la Société, aucun
  motif de refus nouveau.
- **Répartition du travail** : celle de la question 22 ci-dessus. La part du CRM Pro (≈ 5,5 j) est faite
  par la session CRM Pro dans son dépôt ; elle n'entre pas au registre de Partners.

**Le contrat de l'API 3, à figer AVANT toute ligne de code du CRM Pro.** L'ADR INT-T28 le décrit : les
routes (`POST /prises-en-charge` avec SIREN, référence du conseiller et clé d'idempotence, qui répond
`acceptee` avec `until` ou `non_disponible` sans détail ; `GET /prises-en-charge?conseiller=` ; l'avis
J-15), l'authentification par un jeton de service propre et limité à ces routes, le débit limité, le
journal et l'alerte d'anomalie, l'identité du conseiller vérifiée par Partners (conseiller actif), toutes
les bornes appliquées par Partners, et les exigences du rôle CRM (session, hors-ligne, accessibilité,
vocabulaire, notice). Le gel est signalé sur le ticket #220 quand l'ADR est accepté et le contrat validé
par Williams. SEC-34 le réalise ensuite côté Partners.

**Traité dans un chantier séparé, hors de ce plan.**

- La durée de suivi de **6 mois au lieu de 12** (point 7) ; W19 reste compatible, parce qu'il emploie la
  variable `{{FENETRE_MOIS}}` du gabarit et jamais la valeur en dur (les « 12 mois » de ce plan se lisent
  comme la valeur de cette variable à la date de rédaction).
- Le **SIRET obligatoire au dépôt** (point 6).

**Non tranché par cette réponse.** Le point 5, en ce qu'il lie l'antériorité au SIRET saisi, suit le
chantier du SIRET. Le catalogue de prospects du CRM Pro (points 1 à 4, remplacement de
`partners/ADR-0002`, second fournisseur au sens de `partners/ADR-0008`, avis du juriste sur REQ-JUR-039,
maquette `deposer.html`) n'est pas traité par W19 : il reste à instruire selon les règles de Partners, et
aucune ligne de code du catalogue ne s'écrit avant sa propre réponse.



## 10. Chiffrage et effet sur les dates

**Deux ensembles, chiffrés à part** (décision de Williams du 2026-09-29, questions 19 et 22) :

| Ensemble | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Total |
| --- | --- | --- | --- | --- | --- |
| Chantier salariés W19 (outillage du registre compris) | 3,0 j | 2,75 j | 15,25 j | — | **21,0 j** |
| Lot transverse « confort de la console pour tous les rôles » | — | 11,0 j | 2,1 j | 2,6 j | **15,7 j** |
| **Total Partners** | 3,0 j | 13,75 j | 17,35 j | 2,6 j | **36,7 j** |

Plus 0,5 j optionnel (JUR-T03, question 11). **Hors registre Partners** : ≈ 5,5 j du CRM Pro, faits par
la session CRM Pro dans son dépôt après le gel du contrat de l'API 3. Avant la question 22, le total
Partners était de 37,45 j (35,95 j avant les autres réponses du 2026-09-29, 16,5 j dans le plan initial).
Base mesurée : registre à `c60e2f3`, environ 136 j restent estimés ; chemin critique à 22,00 j, dont
11,75 j restants (`docs/PLAN-STATE.md:40-44`). Les phases sont des barrières : le composeur ne rend
éligible que la phase courante (`scripts/lot/composer.ts:11` et `:173`).

**Chantier salariés W19 : 21,0 j** (19,25 j propres aux salariés, 1,75 j d'outillage du registre).

- **Phase 0 : 3,0 j.** GOV-116 (1) et GOV-117 (0,75), l'outillage ; GOV-112 (0,5) et GOV-115 (0,75).
  Chaîne : GOV-116 → GOV-112 → GOV-115, soit 2,25 j, GOV-117 courant en parallèle de GOV-116 et attendue
  par GOV-115. Environ +0,3 à +1,0 jour calendaire si cette chaîne court en parallèle du reste de la
  phase 0, jusqu'à +2,25 si elle en devient le dernier chemin (non re-mesuré ici). Rien ne change pour
  DM-03-A, DM-03-P, les INT ni JUR-T04.
- **Phase 1 : 2,75 j.** UX-P1-17 (0,5), JUR-T31 (0,75), JUR-T33 (0,25, réduite à la seule PR axion-ia
  #1202 par la question 1), DM-07 (+0,5), DM-08 (+0,25), INT-T28 (0,5, ADR de l'API 3, question 22).
  Chemin critique : 22,00 → **22,75 j**, reste 11,75 → 12,50 j, à recalculer par GOV-115 (4) avec GOV-116
  et GOV-117 en amont ; INT-T28 n'est pas sur le chemin critique.
- **Phase 2 : 15,25 j.** GOV-114 (0,75), SEC-31 (0,75), SEC-32 (0,5), SEC-33 (0,75), DM-30 (1,5), DM-31
  (0,5), SEC-34 (1,5), DM-32 (0,5), UX-P2-12 (1), UX-P2-13 (0,5), UX-P2-15 (0,5), QA-T31 (0,75), JUR-T32
  (1), T-ARG-040 (1,5), T-ARG-042 (0,75), T-ARG-041 (1,25), UX-P2-10 (0,5), QA-T32 (0,75). Branche prise
  en charge : GOV-114 → SEC-31 → SEC-32 → DM-30 → DM-31 → SEC-34 → QA-T31, soit 6,25 j (7,0 j avant la
  question 22), contre 7,5 j restants sur le chemin de la phase 2 : la marge passe de 0,5 à 1,25 j.
  Branche argent après DM-15 : T-ARG-040 → T-ARG-042 → T-ARG-041 → UX-P2-10, soit 4,0 j contre 5,0 j.
  Sérialisation réelle : SEC-31, DM-32 et T-ARG-040 écrivent le schéma, et une seule tâche `schema` passe
  par lot.
- **Écart dû à la question 22 : −0,75 j** sur le propre aux salariés (20,0 → 19,25 j) : UX-P2-11
  supprimée (−1) ; GOV-114 (−0,25), SEC-32, DM-31, UX-P2-15 et UX-P2-10 (−0,5 chacune) réduites ;
  INT-T28 (+0,5), SEC-34 (+1,5) et DM-32 (+0,5) ajoutées ; UX-P2-13 réorientée vers l'API 3 sans changer
  d'estimation.

**Lot transverse « confort de la console pour tous les rôles » : 15,7 j**, gardé par Williams le
2026-09-29 ; aucune de ses tâches ne suppose un conseiller dans la console.

- **Phase 1 : 11,0 j.** SEC-29 (1,25), SEC-30 (1,5), UX-P1-18 (1), UX-P1-19 (1,5), UX-P1-16 (1,5),
  UX-P1-20 (0,75), GOV-113 (0,75), QA-T33 (0,75), et 2,0 j de passe REQ-UX-047 (20 écrans × 0,1 j).
- **Phase 2 : 2,1 j.** UX-P2-14 (1) et 1,1 j de passe REQ-UX-047.
- **Phase 3 : 2,6 j.** UX-P3-13 (1,5) et 1,1 j de passe REQ-UX-047.
- La passe REQ-UX-047 compte 4,2 j en tout (42 tâches × 0,1 j à `c60e2f3`), re-mesurée à la fusion de
  `main` par GOV-115.

**Effet calendaire, repris du chiffrage précédent et non re-mesuré** : démarrage de la phase 2 décalé
d'environ +1,4 à +4,2 jours calendaires ; en phase 2, avec assez d'agents, la fin de phase ne bouge pas,
et si le débit limite, compter +1,9 à +5,8 jours calendaires (fourchette haute désormais surestimée de
1,25 j de travail) ; phase 3 : +0,3 à +0,8 jour calendaire ; si le débit est limitant sur tout le projet,
+3,9 à +13,1 jours calendaires.

**Bloqueurs externes nouveaux** : validations groupées des maquettes par Will (cinq séances) ; validation par
Williams du texte de l'art. 3.5 amendé (JUR-T31), qui conditionne JUR-T01b et INT-T12, déjà premier bloqueur
de date, et, par UX-P1-17, les écrans d'espace UX-P1-01 et UX-P1-02 (chemin critique inchangé) — l'arbitrage
de principe est rendu (question 2) ; validation par Williams du contrat de l'API 3 (INT-T28), qui
conditionne SEC-34 et tout le travail du CRM Pro ; HYP-W19-CSE, qui conditionne la mise en service des
conseillers, jamais la livraison d'une tâche. **Aucun avis en droit social n'est un bloqueur** : pas
d'avocat, pas d'exception (question 13, `docs/DECISIONS.md` §5). L'annonce de recrutement d'axion-ia n'est
pas un bloqueur (question 1).

**Bloqueurs d'outillage** : GOV-112 attend GOV-116 (le lot dédié avec `--settings` surchargé, question 21) ;
GOV-115, sa passe REQ-UX-047 et ses écritures de `reqs`, `hyp` et `zone` attendent GOV-117 (question 20).
Si la solution de GOV-116 touche `.claude/settings.json`, Williams applique ou approuve lui-même ce changement.

C'est une projection, pas un engagement : aucune mesure n'existe de l'écart entre l'estimé et le réel, et
les estimations de phase 1 et 2 précèdent leurs acceptances. Les réductions de GOV-114, SEC-32, DM-31,
UX-P2-15 et UX-P2-10 sont celles de ce plan après la question 22 ; GOV-115 les relit au versement.

## 11. Risques

1. **« Service organisé »** (objection du juriste, acceptée en partie) : côté CRM Pro et API 3, le
   vocabulaire, le formulaire et les issues du conseiller diffèrent de ceux de l'apporteur (REQ-JUR-044) ; côté apporteur,
   l'issue est celle du concours entre apporteurs (art. 3.5, question 2). Le MOTEUR anti-doublon (index,
   transaction, horodatage) reste commun, parce que c'est le principe (b) posé par Williams et la seule façon
   d'éviter deux occupants. Le risque résiduel reste à évaluer par la note d'analyse hors dépôt ; il n'y a
   pas d'avis extérieur (question 13) : option la plus prudente, à arbitrer par Williams.
2. **Formule unique datée, identique des deux côtés** (objection UX, rejetée) : l'apporteur reçoit la
   formule d'une occupation par un apporteur, datée comme elle (art. 3.5), et le conseiller « non
   disponible » sans mois, à la demande de la sécurité (oracle). Unifier leur libellé révélerait la
   population. Le support s'appuie sur la carte des issues, pas sur le libellé.
3. **Délai après un acte d'apporteur** : un apporteur malveillant pourrait bloquer la Société 30 jours sur un
   SIREN en le vérifiant. C'est borné par la limite de vérification journalière de REQ-UX-007 et accepté,
   parce que la protection de l'apporteur l'emporte. Réponse uniforme « non disponible » : aucun oracle.
4. **Contrat** : si le gabarit v1 part en DocuSeal avant JUR-T31, l'art. 3.5 amendé et la clause de
   non-exploitation deviennent un avenant à faire re-signer par tout le réseau. D'où INT-T12 et JUR-T01b qui
   dépendent de JUR-T31.
5. **La Société concurrente de ses cocontractants — RISQUE ACCEPTÉ PAR WILLIAMS (question 2, 2026-09-29).**
   Avec l'art. 3.5, la Société peut occuper, par ses préposés, une entreprise qu'un apporteur visait, sans
   que l'apporteur le sache. Williams l'accepte pour éviter deux rémunérations sur une même vente. Garde-fous
   anti-abus maintenus : limites par conseiller et par Société (HYP-W19-LIMITES) ; délai de
   `RESERVE_APRES_ACTE_APPORTEUR_JOURS` après une vérification ou un dépôt refusé d'un apporteur, et clause
   de non-exploitation (HYP-W19-NON-EXPLOITATION) ; fenêtre du rang 1 fermée aux conseillers et Société
   comptée comme un seul porteur (HYP-W19-CARENCE) ; quatre yeux sur les plans, les réaffectations et
   l'export paie (HYP-W19-QUATRE-YEUX).
5 bis. **API 1 indistincte** : axion-ia croit l'entreprise tenue par un apporteur. Aucune commission
   d'apporteur ne doit en être déduite côté axion-ia : Partners calcule et verse selon le porteur réel
   (REQ-DM-021), et INT-T07-P le vérifie. Le champ `commission` de `devis.signe` reste un calcul d'axion-ia
   sur la grille des apporteurs (§8, point 5) ; le conseiller n'a aucun accès à axion-ia en V1 (question 12).
6. **Collision de registre** : GOV-112 et GOV-115 écrivent `tasks.json` et `requirements.json` pendant que
   deux sessions codent. Parade : jetons fixés au dernier rebase, identifiants réservés et plages GOV par
   session (§8), `fusionner-registre`, RM-13 (la PR W19 ne s'est ouverte qu'après la fusion de la PR #219).
7. **Gel de la phase 1** : si GOV-113 s'arme avant la passe de GOV-115, ou si les validations groupées de Will
   tardent, les écrans de console deviennent inattribuables. GOV-113 dépend donc de GOV-115, et les séances de
   validation sont planifiées dans UX-P1-18 et UX-P1-19.
8. **Garde lexicale** : jusqu'à GOV-114, ses limites de lecture restent ouvertes. Les formes précises sont
   tenues hors dépôt (patron GOV-109) pour ne pas publier le contournement.
9. **Quatre yeux** : si une seule personne tient les rôles admin et comptable, plans, réaffectations et
   exports sont bloqués par construction (question 8). C'est voulu : aucun contournement n'est prévu.
10. **Session de console courte** (lot transverse) : friction pour l'admin, le qualifieur, le comptable et
    le lecteur, compensée par le code à 6 chiffres et le retour à l'URL demandée ; la durée est un
    paramètre de SEC-29. La session du conseiller relève du CRM Pro (ADR INT-T28).
10 bis. **Contrat de l'API 3 non figé** (question 22) : si le CRM Pro code avant l'acceptation de l'ADR
    INT-T28, les deux dépôts divergent et le registre peut recevoir des appels que Partners ne sait pas
    juger. Parade : aucune ligne du CRM Pro avant le gel signalé sur le ticket #220 (§8, point 14 bis) ;
    toute évolution passe par une nouvelle version de l'ADR.
10 ter. **Un second système appelle le registre** (question 22) : le CRM Pro devient un appelant
    authentifié de Partners. Parade : jeton propre et limité, débit limité, journal, alerte d'anomalie,
    identité du conseiller et toutes les bornes vérifiées par Partners seul (SEC-34, DM-32) ; aucun statut
    du CRM Pro n'occupe une entreprise (HYP-W19-SOURCE). Limite déclarée : l'identité du conseiller est une
    hypothèse de confiance envers le CRM Pro (HYP-W19-IDENTITE-CRM) ; un CRM Pro compromis agit au nom de
    tout conseiller actif, et ce qui le borne est la limite de la Société, fixe (HYP-W19-LIMITES), et
    l'alerte de volume active sans condition (SEC-34).
11. **Droit du travail et RGPD** : sans information du CSE, ou sans constat écrit, et sans AIPD, les
    conseillers ne sont pas mis en service ; aucune tâche n'en est bloquée. Plusieurs références restent à
    confirmer par Williams, sans avis extérieur (question 13), car elles ne sont pas sourcées dans le dépôt :
    Cass. soc. 13 nov. 1996, art. 1171, 1104 et 1112-1 C. civ., art. 6.4 et 13 RGPD,
    L.1222-4, L.2312-38, L.3245-1, L.3251-1 et L.7313-11 C. trav.
12. **Anti-cumul par empreinte** : c'est un signal contournable (seconde adresse, prête-nom), pas une
    protection. La défense repose sur la déclaration de conflit d'intérêts et sur la revue humaine.
13. **Marge de la phase 2** : la branche prise en charge (6,25 j depuis la question 22, 7,0 j avant) reste
    sous le chemin restant (7,5 j) avec 1,25 j de marge. SEC-34 y entre à 1,5 j : son glissement est le
    premier à surveiller.
14. **Glissement** : si Williams avance les conseillers en phase 1, la phase 1 prend environ 15 j de plus
    (15,25 j de phase 2 du chantier W19) et la phase 2 démarre d'autant plus tard.
15. **Chiffrage** : 36,7 j pour Partners (37,45 j avant la question 22, 16,5 j dans le plan initial), en
    deux ensembles : chantier W19 21,0 j (dont 1,75 j d'outillage du registre, GOV-116 et GOV-117) et lot
    transverse « confort de la console pour tous les rôles » 15,7 j (dont 4,2 j de passe sur les écrans
    existants et 5 j de maquettes), gardé par Williams le 2026-09-29. S'y ajoutent ≈ 5,5 j du CRM Pro, hors
    registre Partners.

## 12. Expérience par population

L'exigence de Williams : quiconque arrive sur l'outil trouve une expérience fluide, sans friction, intuitive,
moderne, parfaitement organisée, utilisable sans formation ; chaque rôle voit une navigation pensée pour lui,
sans fonctions parasites d'un autre rôle.

| Population | Parcours clés | Frictions corrigées | Tâches porteuses |
| --- | --- | --- | --- |
| **Apporteur d'affaires** (espace, mobile) | Recevoir le lien ou le code, puis entrer dans l'espace en une action, sur l'URL demandée. Vérifier puis déposer : au plus 8 interactions et 90 s (REQ-UX-001), mesurés par la fixture QA-T33. Chaque issue dit pourquoi et quoi faire. Une entreprise prise en charge par un conseiller se présente exactement comme une entreprise occupée par un autre apporteur : mêmes formules, mêmes états, même date, même file (art. 3.5, question 2). Consulter « Mes entreprises ». Ne jamais rien voir d'un salarié. | Cul-de-sac après le lien (`ecran.tsx:76-82`) : redirection directe. Aucune issue propre à la Société : l'apporteur lit l'occupation qu'il connaît déjà, et le contrat (art. 3.5 amendé) dit que l'occupant peut être la Société ou ses préposés. Liste « Plus » incohérente, 6 contre 5 entrées : liste dérivée. Teinte « versé » confondue avec l'accent en thème sombre. Seuils de REQ-UX-017 (48 px, corps de 18 px) protégés contre toute régression. Test de premier usage par une personne de 45 à 68 ans. Page publique d'axion-ia qui décrit l'activité comme un métier salarié : JUR-T03. | UX-P1-04, UX-P1-17, UX-P1-08, UX-P1-01, UX-P1-02, QA-T33, JUR-T31, JUR-T03, QA-T31 |
| **Conseiller salarié** (CRM Pro, question 22 ; aucun écran dans Partners) | Il travaille dans le CRM Pro, sous le rôle « commercial » : « Prendre en charge », statut « à vous / non disponible », « Mes entreprises », avis J-15, faits par la session CRM Pro. Partners, par l'API 3, décide de chaque prise en charge, applique toutes les bornes et sert ses seules entreprises ; ses exigences de session, de hors-ligne et d'accessibilité sont listées pour le CRM Pro dans l'ADR INT-T28. Sa part variable est calculée et exportée par Partners ; le bulletin fait foi. | Aucun rôle ni aucune identité rattachée n'existaient : rôle `conseiller_salarie` (SEC-31) et rattachement des identités (DM-32). Aucun rappel avant la perte d'une entreprise : avis J-15 calculé par Partners (UX-P2-13). Réponse opaque sur une entreprise occupée : « non disponible », uniforme et assumé. Vocabulaire parasite de l'apporteur (déposer, commission, lot, objectif) : exclu du contrat de l'API 3. Aucune mesure de son activité. | SEC-31, SEC-32, DM-30, DM-31, SEC-34, DM-32, INT-T28, UX-P2-13, JUR-T32 |
| **Administrateur** (console) | Accueil « à traiter aujourd'hui », avec repli sur Utilisateurs en phase 1. Inviter en au plus 4 interactions, l'écran expliquant chaque rôle en une phrase. Désactiver avec effet immédiat. Recherche globale depuis tout écran (« / »), en au plus 3 interactions vers une fiche. Fiche conseiller : saisir un plan en au plus 6 interactions, réaffecter en masse en au plus 5, avec aperçu. Valider l'acte d'une autre personne. Totaux par origine, sans classement mêlé. | Utilisateurs créés seulement par le seed : écran d'administration. Aucune carte des routes ni navigation par métier : navigation dérivée. Accueil sur un écran inexistant en phase 1 : repli guidant. Aucun écran d'accès refusé. Réaffectation et plan de part variable sans écran : UX-P2-12. Risque de tout faire seul : quatre yeux et notifications. Page « Votre rôle ». | SEC-30, UX-P1-16, UX-P1-18, UX-P1-20, UX-P2-12, T-ARG-042, GOV-113 |
| **Qualifieur** (console) | Arrivée directe sur la file de qualification, triée. Fiche en ligne en au plus 6 interactions (REQ-UX-021). Recherche par SIREN. Aucune entrée d'un autre métier. | La maquette montrait les lots au qualifieur (`file-qualification.html:800-806`) : navigation filtrée. Aucune maquette validée de ses écrans : UX-P1-19. Les prises en charge de la Société n'entrent jamais dans sa file. Un qualifieur ne peut pas devenir conseiller avant un délai, ce qui protège les apporteurs dont il a vu les dépôts. | UX-P1-16, UX-P1-19, UX-P1-07, UX-P1-06, DM-09, DM-31, SEC-31 |
| **Comptable** (console) | Phase 1 : accueil de repli guidant, qui dit que le lot du mois arrive en phase 2 et ce qui est déjà consultable. Phase 2 : arrivée sur le lot du mois, approbation et pain.001. « Export paie » est une entrée distincte sous « Argent » : valider l'acte d'une autre personne et exporter en au plus 4 interactions. La régénération est motivée. | La maquette montrait la qualification au comptable : navigation filtrée. Accueil sur un écran inexistant en phase 1 : repli. Risque de ranger la paie dans le lot SEPA : écrans et tables séparés. Aucune séparation des fonctions : quatre yeux. | UX-P1-16, UX-P1-18, UX-P2-03, UX-P2-14, T-ARG-041, T-ARG-042, UX-P2-10 |
| **Lecteur** (console) | Phase 1 : repli sur Apporteurs en lecture seule si le droit existe, sinon un état guidant. Phase 3 : pilotage, avec les onglets « Réseau d'apporteurs » et « Conseillers salariés ». Ce dernier ne montre que des agrégats, masqués sous 3. Aucun montant individuel, aucun export, aucune donnée de paie. | Accueil sur le pilotage, qui n'est livré qu'en phase 3 : repli. Tableau nominatif de salariés visible par un rôle qui n'en a pas besoin : agrégats seulement. Maquettes de la phase 3 produites (UX-P3-13). | UX-P1-16, DM-29, UX-P3-07, UX-P3-09, UX-P3-13 |
