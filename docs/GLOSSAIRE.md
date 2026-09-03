# Glossaire — Axion Partners

> Livré par **GOV-006** (REQ-GOV-016, REQ-JUR-027, REQ-DM-038). Un terme canonique par concept, ses synonymes
> **interdits**, l'enum Prisma qui le porte et la REQ source. Gate `glossaire-enums.spec.ts` : toute colonne de
> vocabulaire en `String` → rouge ; toute valeur d'enum absente d'ici → rouge ; tout synonyme interdit trouvé dans
> `prisma/**`, `src/**`, `messages/**`, `docs/adr/**` → rouge (`gov:check`).
>
> Règle : les listes ci-dessous sont **dérivées** des REQ citées (RM-01). Si une REQ change, ce fichier est régénéré
> par le `gardien-spec` ; personne n'y ajoute une valeur « en passant ».

## 1. Attribution — 13 états (`EtatAttribution`, REQ-DM-006)

| Valeur                | Sens                                                                                  | Occupant ? |
| --------------------- | ------------------------------------------------------------------------------------- | ---------- |
| `en_attente`          | Déposée sur un SIREN déjà occupé ; dans la file (max 2 par SIREN, REQ-SEC-014)         | non        |
| `provisoire`          | Déposée, horodatée au nom de l'apporteur, pas encore qualifiée ; `aQualifierDepuis` posé | **oui**  |
| `active`              | Qualifiée `confirme` ; fenêtre de 12 mois ouverte (`confirmeeAt`, HYP-E1-9)           | **oui**    |
| `rdv_pris`            | Rendez-vous fixé avec l'entreprise ; `peremptionAt` devient null définitivement         | **oui**    |
| `proposition`         | Devis envoyé (`devis.signe` non encore reçu)                                            | **oui**    |
| `signee`              | Devis signé (`devis.signe` reçu) ; lignes `prevue` créées                               | **oui**    |
| `convertie`           | Premier encaissement reçu (`paiement.recu`) ; reste résoluble jusqu'à `fenetreFinAt`    | **oui**    |
| `figee_resiliation`   | Apporteur résilié ; l'attribution est gelée mais continue d'occuper le SIREN jusqu'à expiration (REQ-ARG-026) | **oui** |
| `invalidee`           | Qualification `non_confirme` ou anomalie confirmée ; texte non accusatoire (REQ-UX-023) | non        |
| `perdue`              | Qualification `perdue` avec `motifPerte`                                                | non        |
| `perimee`             | 90 j sans suite après qualification (`peremptionAt`, REQ-DM-007)                        | non        |
| `expiree`             | `fenetreFinAt` atteinte (12 mois après `confirmeeAt`)                                   | non        |
| `annulee`             | Retirée par l'apporteur ou par la console avant qualification                           | non        |

**`ETATS_OCCUPANTS` = {provisoire, active, rdv_pris, proposition, signee, convertie, figee_resiliation}** (7 états,
REQ-DM-003). Constante unique `src/domain/attribution/etats.ts`, projetée dans l'index partiel
`ON attributions(siren) WHERE statut IN (…)`. Synonymes interdits : `('provisoire','active')` (index à 2 états),
« attribution vivante » sans renvoi à la constante, `ETATS_ACTIFS`.

Colonnes de temps (REQ-DM-007, HYP-E1-9) : `deposeeAt` (dépôt), `confirmeeAt` (qualification `confirme`),
`fenetreFinAt = confirmeeAt + 12 mois` (calculée depuis `parametresVersionId` snapshoté, invariante aux changements de
paramètres), `peremptionAt` (seule colonne recalculée). Synonymes interdits : `deposeLe`, `enregistreeLe`,
`dateDeDepart` (→ `confirmeeAt`).

## 2. Apporteur — 9 états stockés + 2 dérivés (`StatutApporteur`, REQ-DM-011, REQ-CPL-027)

| Valeur           | Sens                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| `candidat`       | Candidature reçue (`candidature.recue`), non décidée                        |
| `retenu`         | Décision positive (étape 3), avant KYC                                      |
| `vivier`         | Décision différée ; ne reçoit aucun onboarding ni relance                   |
| `refuse`         | Décision négative ; purge selon durée de conservation                       |
| `kyc_en_cours`   | Pièces KYC en cours de collecte/vérification                                |
| `pret_a_signer`  | KYC valide, contrat envoyé (`Contrat.statut = envoye`)                      |
| `signe`          | Contrat `signe` en vigueur ; peut déposer                                   |
| `suspendu`       | Accès coupé (`sessionVersion++`), dépôts refusés, aucun envoi hors `toujours` |
| `resilie`        | Sortie de collaboration ; `resiliationMotif ∈ {ordinaire_apporteur, ordinaire_axion, manquement_grave}` — **synonymes interdits** : faute grave, faute, sanction |

**Dérivés, jamais stockés** (REQ-CPL-027, fonction pure `activite(apporteur, depots, now)`) :

- `actif` = au moins un dépôt **confirmé** (attribution passée `active`), jamais « premier dépôt » ni « inscrit ».
- `dormant` = `signe` et > 60 j (paramètre SSOT `DORMANCE_JOURS`) sans dépôt ; **indicateur de console uniquement ;
  jamais d'envoi déclenché par l'inactivité (REQ-JUR-033)** — le job d'envoi de la lettre du réseau ne reçoit aucun
  filtre sur la date du dernier dépôt, et c'est testable.

Synonymes interdits : `actif` en colonne, `inactif`, `churn`, « commercial », « partenaire » pour désigner l'apporteur
(« partenaire » désigne l'outil), `isActive`.

## 3. Ligne de commission (`LigneCommission`, REQ-DM-020, REQ-ARG-017)

`type` enum : `commission`, `reprise`, `parrainage`, `bonus_filleul`.

`statut` enum (6 + 1) — **la valeur `dechue` est supprimée le 2026-09-03 (décision D11) : aucun chemin de code ne peut
la produire, et elle ne doit pas revenir au glossaire, sans quoi la gate `partners:schema:enums` la ferait renaître** :

| Valeur      | Sens                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------ |
| `prevue`    | Créée par `devis.signe` ; attendu, jamais dans un relevé (CHECK)                            |
| `acquise`   | Née **uniquement** d'un `paiement.recu` (REQ-DM-016) ; unicité `(paymentId, lignePrevueId)` |
| `bloquee`   | Acquise mais retenue ; `motifBlocage` non null ssi `bloquee` (CHECK)                        |
| `a_payer`   | Relevée dans un relevé gelé, contrôles de versement passés                                  |
| `payee`     | Dans un lot exporté et rapproché                                                            |
| `annulee`   | Devis annulé avant tout encaissement                                                        |
| `contestee` | Contestation ouverte (REQ-CPL-012) ; sortie `maintenue \| ajustee` → `LigneAjustement`      |

`motifBlocage` enum `MotifBlocage` (REQ-ARG-017 + A2) : `rib_manquant`, `rib_a_verifier`, `siret_invalide`,
`tva_non_declaree`, `mandat_non_signe`, `vigilance_perimee`, `sous_seuil`, `commission_sup_ht`, `a_qualifier`,
`non_resolue`, `regime_tva_inattendu`, `ttc_manquant`, `plafond`, `bareme_indefini`.

Synonymes interdits : `en_attente_encaissement` (→ `prevue`), `en_attente` pour une ligne (réservé à l'attribution),
`pending`, `paid`, `amountHtCents` (→ `montantHtCents`), `amountTtcCents` (→ `montantTtcCents`).

⚠️ Terme **à arbitrer par le `gardien-spec` en GOV-006** : REQ-ARG-026 emploie `conservee` pour une ligne d'un
résilié ordinaire ; cette valeur n'est pas dans l'enum de REQ-DM-020. Proposition : une ligne `prevue` d'un résilié
ordinaire **reste `prevue`** (l'attribution passe `figee_resiliation`) ; `conservee` est un synonyme interdit.

## 4. Autres enums portés par le glossaire

| Enum                   | Valeurs                                                                                   | REQ          |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| `StatutContrat`        | `envoye`, `signe`, `remplace`, `resilie`                                                   | REQ-DM-013   |
| `StatutPieceKyc`       | `manquante`, `a_verifier`, `valide`, `perimee`, `refusee`                                  | REQ-DM-027   |
| `TypePieceKyc`         | `siret`, `tva`, `rib`, `identite`, `vigilance`, `rc_pro`                                   | REQ-DM-027   |
| `ResultatContact`      | `confirme`, `non_confirme`, `injoignable`, `ne_se_souvient_pas`                           | REQ-DM-008   |
| `ResultatVerification` | `libre`, `suivie`, `cliente`, `liste_noire`, `fermee` (journal serveur, jamais exposé tel quel) | REQ-DM-032 |
| `EtatVerificationDto`  | `libre`, `suivie_place_disponible`, `suivie_file_complete`, `non_disponible` — **4 états** exposés à l'apporteur ; un client existant est rendu `non_disponible` ou `suivie_*` ; aucune clé ne distingue cliente de suivie (REQ-UX-007 corrigée, HYP-E1-10) | REQ-UX-007 |
| `IssueDepot`           | `enregistree`, `prioritaire`, `en_attente`, `file_complete`, `fermee`, `financeur`, `deja_connue`, `gele`, `captcha`, `brouillon_hors_ligne` | REQ-UX-002 |
| `StatutLot`            | `brouillon`, `approuve`, `exporte`, `rapproche`                                            | REQ-UX-025   |
| `StatutAnomalie`       | `ouverte`, `levee`, `confirmee`                                                            | REQ-DM-033   |
| `MotifListeNoire`      | `opco`, `france_travail`, `region`, `of_partenaire`, `autre`                               | REQ-DM-028   |
| `OrigineEntrepriseConnue` | `client`, `devis`, `demande_entrante`, `financeur`                                     | REQ-DM-029   |
| `TypeReprise`          | `avoir`, `paiement_rembourse` (synonyme interdit : `payment_refund`)                       | REQ-DM-019   |
| `ConsoleRole`          | `admin`, `qualifieur`, `comptable`, `lecteur`                                              | REQ-SEC-023  |
| `StatutTache`          | `a_faire`, `en_cours`, `en_revue`, `fusionnee`, `deployee`, `verifiee`, `bloquee`, `attente_externe` | REQ-GOV-021 |

## 5. Événements

### `EvenementRecu` — un seul nom

Table de réception des webhooks entrants (axionia, DocuSeal) : `{source enum {axionia, docuseal}, eventId unique par
source, eventType, payloadHash, receivedAt, processedAt, error, retryCount}` (REQ-DM-036, REQ-QA-008, patron
`DocusealWebhookEvent`). Rejouer un événement déjà traité ne produit **aucune** écriture métier.

Synonymes interdits : `WebhookRecu`, `InboundEvent`, `WebhookEvent`, `EventLog` pour cette table. Ne pas confondre
avec `evenements` (journal append-only chaîné du domaine, REQ-DM-041).

### Types d'événements axionia → Partners — liste fermée (REQ-INT-004, source `packages/contracts/events.ts`)

`client.cree` · `client.mis_a_jour` · `client.fusionne` · `candidature.recue` · `devis.signe` · `facture.emise` ·
`facture.annulee` · `avoir.emis` · `paiement.recu` · `paiement.rembourse` · `financement.mis_a_jour` — **11 types**.

Enveloppe camelCase (REQ-INT-003) : `{eventId, eventType, schemaVersion, occurredAt, emittedAt, producer, subjectRef,
sequence, payload}`.

Synonymes interdits (vus rougir par `gov:check`) : `payment.received`, `refund.paid`, `refund.issued`,
`invoice.issued`, `invoice.cancelled`, `avoir.issued`, `devis.signed`, `candidature.submitted`, `client.created`,
`client.updated`, `Invoice`, `Refund`, `PaymentScheduleProfile`, `event_id`/`event_type` (snake_case d'enveloppe).

## 6. Déposer vs Déclarer

- **« Déposer »** est le terme retenu : « déposer un contact », « dépôt », « Mes dépôts », bouton « Déposer », route
  `/deposer`. Il dit ce qui se passe (un dépôt horodaté au nom de l'apporteur), sans évoquer une déclaration fiscale ni
  un devoir.
- **« Déclarer »** est **interdit** dans l'espace apporteur et les e-mails (synonymes interdits : « déclaration »,
  « déclarant », « Déclarer » en libellé de bouton). Une exception : « règle du premier déclarant » dans le contrat et
  le kit J0 est remplacée par « règle du premier dépôt ».
- Corollaire : `deposeeAt` (jamais `declareeAt`), `IssueDepot` (jamais `IssueDeclaration`), tâche UX-P1-01 « bouton
  pré-rempli navigue vers `/deposer?entreprise=<id>` ».

## 7. Rôles console

| Rôle         | Ce qu'il fait                                                                                            | Ce qu'il ne voit ou ne fait jamais                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `admin`      | Tout ; seul à armer le drapeau SEPA (step-up + journal chaîné), lever un gel, suspendre/résilier, exporter DAS2 | Rien de réservé, mais chaque action sensible est journalisée   |
| `qualifieur` | File de qualification, fiche de qualification, rattachement manuel motivé, alertes                        | IBAN en clair, approbation de lot, pain.001, levée de gel, DAS2     |
| `comptable`  | Lots, relevés, autofactures, rapprochement, exports compta, cumuls DAS2 (lecture), vigilance              | Qualification, suspension/résiliation, levée de gel                 |
| `lecteur`    | Lecture des écrans de pilotage sans facturation ni PII (mémoire #871 : le lecteur ne voit pas la facturation) | Toute écriture ; IBAN ; montants par apporteur ; exports        |

Identifiant **unique** : `qualifieur`. Synonyme interdit : `qualificateur` (encore présent dans REQ-SEC-023 et l'annexe
de fusion — corrigé par B-REQ-6), `reviewer`, `reader`, `viewer`.

## 8. Autres termes canoniques

| Terme                   | Définition                                                                                  | Interdits                                  |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| apporteur               | Personne physique ou structure liée par un contrat d'apporteur d'affaires                    | commercial, partenaire, agent, VRP         |
| dépôt                   | Acte par lequel un apporteur dépose un contact (entreprise + personne rencontrée + contexte)  | déclaration, lead, prospect                |
| qualification           | Appel de vérification par Axion-IA (`Qualification`, append-only)                            | validation, scoring du contact             |
| vérification prioritaire | Seuil `seuilPrioritaire = min(palierConfiance, capaciteRestante)` au-delà duquel les dépôts sont qualifiés d'abord ; jamais un plafond | quota, limite, plafond de dépôts |
| palier                  | Capital de confiance (5 → 15 → 25 contacts confirmés), formulé sans objectif ni classement    | niveau de vente, rang, objectif            |
| déclaration non confirmée | Une entreprise déclare ne pas connaître l'apporteur (`Qualification.resultatContact = non_confirme`) ; déclenche la suspension de vérification | **synonymes interdits** : strike, sanction, avertissement, pénalité, faute |
| relevé                  | Gel mensuel des lignes `acquise/reprise/bonus_filleul` (`statement-AAAA-MM`)                | statement (hors jobId), facture            |
| autofacture             | Facture émise par Axion-IA au nom et pour le compte de l'apporteur (mandat)                  | facture apporteur, note d'honoraires       |
| lot                     | `LotPaiement` : ensemble de relevés `a_payer` approuvé et exporté en pain.001                | batch, virement groupé                     |
| grille                  | `COMMERCIAL_COMMISSIONS` de `pricing.ts` publiée par axionia, versionnée par hash, snapshotée au contrat | barème maison, grille Partners   |
| entreprise connue       | SIREN présent chez axionia (client, devis, demande entrante, financeur) — antériorité         | déjà cliente (côté apporteur : « non disponible ») |
| lien de dépôt privé     | Jeton de dépôt (patron `EmargementToken`) permettant un dépôt sans session ; ≠ code de parrainage public | lien magique (réservé à la connexion) |
| code de parrainage      | Code public partageable ; capture `parrainCodeCapture` à la candidature                       | code promo, affiliation                    |
