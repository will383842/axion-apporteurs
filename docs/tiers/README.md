# Fiches tiers

> Livré par **GOV-015** (REQ-CPL-002, REQ-GOV-022). Rédigé le 2026-09-03.
>
> Une fiche par tiers dont le produit dépend. Chaque fiche dit **ce que le tiers fait pour nous**, les
> **données qui lui sont confiées**, ce qui se passe **s'il tombe**, **qui l'on appelle**, et l'**état de la
> conformité** (contrat, sous-traitance, localisation).
>
> RM-08 : une valeur qu'un tiers doit accepter n'est jamais recopiée depuis notre propre spécification ;
> elle est confrontée à la fiche, et la fixture qui la porte cite la fiche en plus de son producteur réel.

## Zone

Le chemin normatif de ces fiches est **`docs/tiers/`**. Il n'est pas choisi par la tâche : il est imposé par
le texte de REQ-GOV-022, de REQ-INT-016 et de REQ-INT-022, qui nomment `docs/tiers/<nom>.md`.

⚠️ `docs/tasks.json` déclare pour GOV-015 `paths: ["docs/gouvernance/GOV-015"]`, c'est-à-dire une zone où
rien de ce livrable ne tombe. La correction revient au rôle `gardien-spec` / `A01`, seul écrivain de
`docs/tasks.json` (`docs/CONVENTIONS.md` §8) : elle est demandée, elle n'est pas faite ici.

## Ce que ces fiches sont — et où elles s'arrêtent

Aucune de ces fiches ne repose sur une lecture de la documentation du tiers. Elles sont écrites à partir du
dossier interne. **Les quatre éléments de source que REQ-GOV-022 exige — URL officielle, date de lecture,
extrait cité, exemple officiel — sont donc nommés, et leur valeur est une attente affectée à quelqu'un**, et
non un contenu : aucune adresse n'est écrite « de mémoire », parce qu'une adresse recopiée depuis nous-mêmes
est exactement ce que RM-08 interdit, et parce qu'une fixture citerait cette fiche comme preuve.

**Cette tâche est donc livrée partielle, et elle le dit là où on ne peut pas ne pas le lire** : la liste des
rubriques 2 encore vides est plus bas, et le test la compare à ce que les fiches portent réellement. Le jour
où une rubrique 2 est remplie, il faut retirer la fiche de cette liste — sinon le test rougit. Une tâche
partielle qui ne dit pas où elle s'arrête est une tâche fausse.

Ce qui, en revanche, est établi et écrit ici : ce que nous demandons au tiers, ce que nous lui envoyons, les
limites que **nous** appliquons, et ce que le produit fait quand le tiers ne répond pas.

## Les tiers

<!-- tableau-tiers:debut -->

| Fiche | Ce que ce tiers fait pour nous | REQ qui en dépendent | Décisions du registre | S'il tombe |
| --- | --- | --- | --- | --- |
| [`docuseal.md`](./docuseal.md) | Fait signer le contrat d'apporteur, rend le PDF signé et sa piste d'audit | REQ-CPL-028, REQ-DM-013, REQ-DM-036, REQ-EXT-021, REQ-EXT-027, REQ-GOV-022, REQ-INT-019, REQ-JUR-005, REQ-SEC-034 | DEC-INT-001, W13 | Aucune enveloppe ne part ni ne revient ; les contrats déjà signés ne sont pas affectés ; la relance des soumissions en attente rattrape au retour |
| [`zeptomail.md`](./zeptomail.md) | Envoie les e-mails de Partners et rend les rebonds | REQ-GOV-022, REQ-INT-022, REQ-INT-023, REQ-JUR-009, REQ-SEC-030 | DEC-INT-002, W3, W13 | Les envois sont retenus en file et repartent au retour ; rien ne part tant que le drapeau DMARC n'est pas posé |
| [`recherche-entreprises.md`](./recherche-entreprises.md) | Renseigne l'entreprise déposée depuis les données publiques de l'État | REQ-ARG-016, REQ-DM-030, REQ-DM-034, REQ-GOV-022, REQ-INT-020, REQ-INT-021, REQ-QA-028, REQ-SEC-013 | — | Le dépôt bascule en saisie manuelle contrôlée par la clé de Luhn et la fiche est marquée `entreprise_a_verifier` ; le dépôt n'est jamais bloqué |
| [`banque.md`](./banque.md) | Exécute les virements du lot, rend le relevé qui sert au rapprochement | REQ-ARG-020, REQ-ARG-021, REQ-ARG-022, REQ-ARG-034, REQ-CPL-001, REQ-CPL-002, REQ-CPL-011, REQ-CPL-020, REQ-GOV-022, REQ-QA-029, REQ-SEC-023, REQ-UX-025 | HYP-W2, W1, W13 | Le lot reste exporté et les lignes ne passent pas `payee` ; l'alerte de délai de REQ-ARG-034 se lève quand même |
| [`urssaf.md`](./urssaf.md) | Permet de vérifier l'attestation de vigilance remise par l'apporteur | REQ-ARG-016, REQ-ARG-025, REQ-DM-027, REQ-GOV-022, REQ-JUR-003 | — | La pièce reste `a_verifier` ; sous le seuil légal, aucun versement n'est différé de ce fait |
| [`dgfip-das2.md`](./dgfip-das2.md) | Reçoit la déclaration annuelle des sommes versées aux apporteurs | REQ-ARG-024, REQ-CPL-020, REQ-GOV-022, REQ-JUR-015, REQ-SEC-023 | HYP-D9, W13 | Sans effet sur le produit : l'export est un fichier annuel, conservé et re-déposable |
| [`tiime.md`](./tiime.md) | Reçoit les écritures comptables des autofactures et des règlements | REQ-ARG-023, REQ-GOV-022, REQ-INT-016 | EXT-2a | L'export reste un fichier ; il est conservé et ré-importé au retour |
| [`coolify.md`](./coolify.md) | Déploie et sert l'application | REQ-GOV-022, REQ-INT-031, REQ-QA-018, REQ-QA-019, REQ-QA-020, REQ-QA-022, REQ-QA-023 | HYP-E1-5, HYP-E1-24, HYP-E1-26 | Le container en place continue de servir ; aucun retour arrière automatique |
| [`cloudflare-r2.md`](./cloudflare-r2.md) | Reçoit les sauvegardes horaires de la base | REQ-GOV-022, REQ-QA-023, REQ-SEC-030 | HYP-E1-5, HYP-E1-24 | Le point de reprise s'éloigne d'une heure à chaque dépôt manqué ; c'est l'exercice mensuel qui le fait savoir |
| [`github.md`](./github.md) | Héberge le code, construit l'image, porte les secrets, ordonne les fusions | REQ-GOV-014, REQ-GOV-022, REQ-INT-031, REQ-QA-018, REQ-QA-022 | HYP-E1-24, HYP-E1-26, HYP-E1-27, HYP-E1-33, W13 | Ni fusion ni déploiement ; la production tourne sur l'image déjà tirée |
| [`telegram.md`](./telegram.md) | Porte les alertes de console et celle de l'exercice de sauvegarde | REQ-GOV-022, REQ-INT-024, REQ-INT-025, REQ-QA-023, REQ-SEC-033 | HYP-D12, HYP-E1-24 | **Aucun repli écrit à ce jour** : l'alerte est perdue sans trace — c'est le point ouvert de cette tâche |
| [`push-web.md`](./push-web.md) | Remet les notifications de l'espace installable à l'appareil de l'apporteur | REQ-GOV-022, REQ-INT-025, REQ-SEC-033, REQ-UX-014 | HYP-D12, W13 | Aucun droit n'est suspendu : l'espace reste la source, la notification n'était qu'un raccourci |

<!-- tableau-tiers:fin -->

La colonne « REQ qui en dépendent » et la colonne « Décisions du registre » sont **vérifiées** : tout
identifiant cité dans le corps d'une fiche doit figurer dans sa ligne. Une vue dérivée qui ne contient pas
ce que sa source contient diverge dès la première relecture. Le chapeau en citation d'une fiche n'est pas
compté : il cite la tâche, pas les dépendances du tiers.

## Ce qui n'est pas une fiche tiers

- **axionia** n'est pas un tiers : c'est le dépôt frère de la même société. Le contrat qui les relie est un
  schéma versionné copié à hash identique des deux côtés (REQ-QA-007, `packages/contracts`), pas une
  documentation externe à confronter.
- **L'apporteur et l'entreprise déposée** ne sont pas des tiers fournisseurs : ce sont des personnes
  concernées. Leurs droits vivent dans REQ-SEC-030 et REQ-JUR-009.
- **Un service externe de collecte d'erreurs** n'a pas de fiche, et ce n'est pas un oubli. Il est nommé par
  le **titre** de la tâche QA-T08 ; le texte de REQ-QA-024, qui fait foi, n'exige que des journaux
  structurés avec redaction, et ne retient aucun service externe. Le jour où un tel service est retenu, il
  reçoit des journaux applicatifs et devient un tiers au sens de cette page : **le recours à un service
  externe de collecte est à confirmer par Will**, avant QA-T08, et une fiche est due avant le premier
  journal envoyé.

## Le gabarit

Toute fiche porte ces neuf rubriques, avec ces titres exacts et dans cet ordre. Le test s'appuie dessus.

<!-- gabarit:debut -->

```
## 1. Ce que ce tiers fait pour nous
## 2. Source officielle
## 3. Données qui lui sont confiées
## 4. Quotas et limites
## 5. Mode dégradé — s'il tombe
## 6. Point de contact
## 7. Conformité
## 8. À confirmer, et par qui
## 9. Référence à citer dans une fixture
```

<!-- gabarit:fin -->

Une fiche **peut porter des sections supplémentaires** : le test vérifie que les neuf titres apparaissent à
l'identique et dans cet **ordre relatif**, pas qu'ils sont les seuls. Intervertir deux rubriques le fait
rougir ; ajouter une annexe, non.

Les six éléments qu'exige REQ-GOV-022 se lisent ainsi : les quatre éléments de source en rubrique 2, les
quotas en rubrique 4, le comportement en panne en rubrique 5. La rubrique 2 porte ces quatre lignes, avec
ces libellés exacts, **présentes même vides** :

<!-- elements-source:debut -->

```
URL officielle
Date de lecture
Extrait cité
Exemple officiel
```

<!-- elements-source:fin -->

## Ce qu'on ne sait pas encore, et qui doit le lever

Une ligne d'attente sans nom de responsable n'est pas une ligne : c'est un trou. **Toute ligne d'une fiche
qui porte une de ces formules nomme, sur la même ligne, un responsable de la liste fermée.** La rubrique 8
reprend ces attentes avec ce qu'elles bloquent.

Les formules d'attente :

<!-- formules-attente:debut -->

```
à confirmer
à relever
à décider
à nommer
```

<!-- formules-attente:fin -->

La liste fermée des responsables — une entrée par ligne ; une ligne entre deux barres obliques est un motif :

<!-- liste-fermee:debut -->

```
Will
expert-comptable
/A\d{2}/
```

<!-- liste-fermee:fin -->

`Will` tranche ce qui engage la société : contrats, localisation, choix d'un fournisseur, secrets.
`expert-comptable` porte ce qui relève de la comptabilité et de la fiscalité, **à défaut Will**. Un code de
poste (`A01`) porte une **lecture de documentation** : `A01` répartit, et le lecteur date sa lecture dans la
fiche. Aucun autre propriétaire n'est admis : « le lecteur de la documentation » ou « même » ne sont pas des
noms, ce sont des trous déplacés d'un cran.

## Les rubriques 2 encore vides

C'est le reste à faire de GOV-015, fiche par fiche. Le test dérive cette liste des fiches elles-mêmes et la
compare à celle-ci : en retirer une sans avoir rempli sa rubrique 2 fait rougir.

<!-- rubrique2-incomplete:debut -->

```
banque.md
cloudflare-r2.md
coolify.md
dgfip-das2.md
docuseal.md
github.md
push-web.md
recherche-entreprises.md
telegram.md
tiime.md
urssaf.md
zeptomail.md
```

<!-- rubrique2-incomplete:fin -->

## Ce que `fiches-tiers.spec.ts` vérifie

L'acceptation de GOV-015 n'a pas été écrite ; elle est dérivée du texte des deux exigences couvertes. Le
test est `tests/unit/gouvernance/fiches-tiers.spec.ts` et ses contrôles vivent dans
`tests/unit/gouvernance/fiches-tiers.controles.ts` — **sous `tests/unit/`, et non `tests/gov/`** : la
configuration de Vitest n'inclut que `src/**`, `tests/unit/**` et `tests/schemas/**`, et un fichier posé
ailleurs aurait l'air d'un test sans jamais s'exécuter.

Douze familles de contrôle, **chacune livrée avec le défaut qui la fait rougir** (RM-02), exécuté par le
mode `--prove` du module de contrôles :

| # | Famille | Ce qu'elle tient | Le défaut qui la fait rougir |
| --- | --- | --- | --- |
| 1 | `readme_illisible` | Les cinq blocs que le test DÉRIVE de ce fichier sont présents et non vides | retirer le marqueur `gabarit:debut` |
| 2 | `fiche_manquante` | Chaque ligne du tableau « Les tiers » a son fichier | citer une fiche au tableau sans créer le fichier |
| 3 | `fiche_hors_tableau` | Chaque fichier de `docs/tiers/` a sa ligne au tableau | ajouter une fiche que l'index ne nomme pas |
| 4 | `chemin_cite_sans_fiche` | Tout chemin `docs/tiers/<x>.md` cité par `docs/requirements.json` existe | renommer `tiime.md` alors que REQ-INT-016 le cite |
| 5 | `gabarit_incomplet` | Les neuf titres, à l'identique, dans cet ordre relatif | remplacer le titre de la rubrique 5 d'une fiche |
| 6 | `rubrique2_structure` | La rubrique 2 porte ses quatre lignes nommées, même vides | retirer la ligne `Exemple officiel` d'une fiche |
| 7 | `attente_sans_responsable` | Toute formule d'attente nomme un responsable de la liste fermée | écrire « format à confirmer » sans nom |
| 8 | `coordonnee_publiee` | Aucune adresse électronique, aucun identifiant bancaire, aucun numéro, aucun jeton | écrire une adresse de support dans la rubrique 6 |
| 9 | `disjonction_cpl_002` | `banque.md` satisfait l'une **ou** l'autre branche de REQ-CPL-002 | retirer la citation de `HYP-W2` sans renseigner l'établissement |
| 10 | `entete_fixture_manquant` | La rubrique 9 prescrit les DEUX en-têtes, `Source:` et `Confronte-a:` | retirer la ligne `Confronte-a:` d'une fiche |
| 11 | `identifiant_hors_tableau` | Toute exigence ou décision citée par une fiche figure dans sa ligne | citer REQ-QA-029 dans `telegram.md` sans l'ajouter au tableau |
| 12 | `rubrique2_incomplete_non_declaree` | La liste des rubriques 2 vides est dérivée, et déclarée ici | retirer une fiche de la liste sans avoir rempli sa rubrique 2 |

Sept **contre-témoins** doivent rester verts : une section ajoutée à une fiche, une attente confiée à Will,
une attente confiée à l'expert-comptable, une lecture répartie par un code de poste, un nom de domaine qui
n'est pas une adresse électronique, un article du code du travail qui n'est pas un identifiant bancaire, un
horodatage qui n'est pas un numéro de téléphone. Une garde qui rougit sur tout ne dit rien de plus qu'une
garde qui ne rougit jamais.

**Sur REQ-CPL-002**, la disjonction est vérifiée des deux côtés : branche « banque connue » — plus aucune
attente ne subsiste dans `banque.md` ; branche « repli acté » — la fiche cite `HYP-W2`, la saisie manuelle
et l'identifiant de bout en bout. Aucune des deux n'est vraie : rouge.

## Ce que la fixture doit porter, et pourquoi ce sont DEUX lignes

`docs/gates.json` définit `fixtures:source` ainsi : « toute fixture porte un en-tête `Source:` nommant le
producteur réel qui l'a générée ». REQ-GOV-022 exige, elle, une confrontation à la fiche. **Un seul en-tête
ne peut pas porter les deux** : une fixture enregistrée depuis l'API réelle a pour producteur cet
enregistrement, pas un fichier de `docs/`. D'où deux lignes, prescrites par chaque rubrique 9 :

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/<nom>.md#2-source-officielle
```

⚠️ **`fixtures:source` n'est pas armée.** Elle est en phase 0 dans `docs/gates.json`, sa `preuveRouge` y est
nulle, son script `scripts/gates/fixtures-source.ts` n'existe pas et `package.json` ne porte aucun script du
même nom. Les rubriques 9 ne la conjuguent donc pas au présent : elles décrivent ce qu'elle refusera **le
jour où elle sera écrite**, par la tâche qui la porte (`INT-T01a`). Tant que la rubrique 2 d'une fiche est
vide, la seconde ligne porte la mention `non confrontée` — et pour `tiime.md`, où REQ-INT-016 exige la
confrontation, aucune fixture d'export n'est écrite du tout.

## Ce qui manque, et qui doit le fournir

| Ce qui manque | Fiche | Qui | Avant quoi |
| --- | --- | --- | --- |
| Une lecture datée de chaque documentation, avec extrait cité et exemple officiel | toutes | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant que la première fixture du format cesse d'être `non confrontée` |
| Nom de la banque, variante du message acceptée, jeu de caractères, espace de test, format du relevé | `banque.md` | Will | armement SEPA (colonne « À trancher avant » de `HYP-W2`) |
| Format d'import comptable accepté par la plateforme | `tiime.md` | expert-comptable, à défaut Will (`EXT-2a`) | l'écriture de l'export comptable |
| Valeur du seuil de l'exercice, avec sa source et sa date | `dgfip-das2.md` | Will, sur avis de l'expert-comptable | premier calcul de cumul |
| Canal d'alerte de repli quand le canal principal ne répond pas | `telegram.md` | Will | armement de la sauvegarde horaire (REQ-QA-023) |
| Fournisseur et localisation du serveur qui porte l'orchestrateur | `coolify.md` | Will | premier déploiement de production |
| Service de push retenu, et son éditeur | `push-web.md` | Will | première notification |
| Recours, ou non, à un service externe de collecte d'erreurs | aucune fiche à ce jour | Will | QA-T08 |
| Contrat de sous-traitance (art. 28 RGPD) pour chaque tiers qui traite des données pour notre compte | `docuseal.md`, `zeptomail.md`, `cloudflare-r2.md`, `coolify.md`, `tiime.md`, `telegram.md`, `push-web.md` | Will | première signature réelle |
| Qualification au regard de l'article 28 des comptes des personnes qui contribuent | `github.md` | Will | mise en production |
| Qualification au regard de l'article 28 de la banque et de l'organisme de vérification | `banque.md`, `urssaf.md` | Will | première remise réelle, première vérification réelle |
