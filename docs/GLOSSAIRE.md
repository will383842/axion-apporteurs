# Glossaire — Axion Partners

> Livré par **GOV-006** (REQ-GOV-016, REQ-JUR-027, REQ-DM-038). Un terme canonique par concept, ses synonymes
> **interdits**, l'enum Prisma qui le porte et la REQ source. Gate `glossaire-enums.spec.ts` : toute colonne de
> vocabulaire en `String` → rouge ; toute valeur d'enum absente d'ici → rouge ; tout synonyme interdit trouvé dans
> `prisma/**`, `src/**`, `messages/**`, `docs/adr/**` → rouge (`gov:termes-interdits`).
>
> Règle : les listes ci-dessous sont **dérivées** des REQ citées (RM-01). Si une REQ change, ce fichier est régénéré
> par le `gardien-spec` ; personne n'y ajoute une valeur « en passant ».
>
> **Citer un terme interdit : où c'est possible, et où ça ne l'est pas.** L'exemption de citation de `gov:termes-interdits` se
> lit sur la **dernière** extension du nom, et trois grammaires seulement l'accordent : `.md` (prose), `.sql` et
> `.prisma` (dans un commentaire). **Un fichier `.ts` n'en a aucune** — et c'est la plus grosse population du
> périmètre : 26 des 49 fichiers lus au 2026-09-22. On n'y écrit donc pas un terme interdit, même pour expliquer
> pourquoi il l'est. **La règle est de le nommer par son rôle ET de donner l'adresse de la ligne qui le porte**
> (« les deux modèles qu'`AFF-01` déclare disparus, `docs/GLOSSAIRE.md` §5 »), jamais une paraphrase sans adresse :
> c'est une paraphrase sans adresse qui a rendu l'en-tête de `packages/contracts/events.ts` illisible — « l'un n'a
> jamais eu de modèle et l'autre est une valeur d'enum » ne dit pas lequel est lequel. Le contournement cessait
> d'être écrit nulle part, et chaque agent le redécouvrait : il est écrit ici.
>
> **Pourquoi aucun marqueur de citation n'est posé en `.ts`, et à qui appartient la levée.** Un marqueur a été
> essayé, puis REFUSÉ **sur mesure**, le 2026-09-22 : en ajoutant `ts` aux grammaires qui citent, une même ligne
> portant un usage RÉEL et exécuté passe de ROUGE à VERT dès qu'une URL apparaît plus tôt sur cette ligne, parce
> que le `//` de `https://` y ouvre une zone de commentaire. Un marqueur qui peut taire un vrai défaut n'est pas un
> marqueur. La grammaire qui saurait distinguer une chaîne d'un commentaire est le livrable de **GOV-069** ; tant
> qu'elle n'existe pas, l'absence d'exemption en `.ts` est une limite **nommée**, pas un oubli.

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
| `suspendu`       | Accès à l'espace **maintenu** (aucun jeton révoqué, `sessionVersion` inchangé) ; nouveaux dépôts refusés ; aucun envoi hors `toujours` (REQ-SEC-032, REQ-SEC-019, `HYP-SEC03-ACCES`) |
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

`statut` enum (6 + 1) — **la valeur `dechue` est supprimée le 2026-09-03 (décision `HYP-D11`) : aucun chemin de code ne peut
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

`motifBlocage` enum `MotifBlocage` (REQ-ARG-017, complété par la synthèse des juges du 2026-09-03) : `rib_manquant`, `rib_a_verifier`, `siret_invalide`,
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
| `IssueDepot`           | `enregistree`, `prioritaire`, `en_attente`, `file_complete`, `anteriorite_client`, `anteriorite_devis`, `etablissement_cesse`, `entreprise_hors_perimetre`, `opposition_demarchage`, `gele`, `captcha`, `brouillon_hors_ligne` — alignée le 2026-09-26 sur REQ-UX-002 et sur `ISSUES_DEPOT` : `fermee`, `financeur` et `deja_connue` sont renommées sur les catégories du contrat | REQ-UX-002 |
| `StatutLot`            | `brouillon`, `approuve`, `exporte`, `rapproche`                                            | REQ-UX-025   |
| `StatutAnomalie`       | `ouverte`, `levee`, `confirmee`                                                            | REQ-DM-033   |
| `MotifListeNoire`      | `opco`, `france_travail`, `region`, `of_partenaire`, `autre`                               | REQ-DM-028   |
| `OrigineEntrepriseConnue` | `client`, `devis`, `financeur` — `demande_entrante` retirée le 2026-09-26, comme REQ-DM-029 l'a retirée : aucun événement ne la transporte | REQ-DM-029   |
| `TypeReprise`          | `avoir`, `paiement_rembourse` (synonyme interdit : `payment_refund`)                       | REQ-DM-019   |
| `ConsoleRole`          | `admin`, `qualifieur`, `comptable`, `lecteur`                                              | REQ-SEC-023  |
| `StatutApporteur`      | `candidat`, `retenu`, `vivier`, `refuse`, `kyc_en_cours`, `pret_a_signer`, `signe`, `suspendu`, `resilie` — sens au §2 ; `actif` et `dormant` sont dérivés, jamais stockés | REQ-DM-011 |
| `MotifResiliation`     | `ordinaire_apporteur`, `ordinaire_axion`, `manquement_grave` — colonne `resiliationMotif` | REQ-DM-011 |
| `RegimeTva`            | `assujetti`, `franchise_293b` — historique daté, figé sur chaque autofacture | REQ-ARG-033 |
| `CanalCandidature`     | `site`, `linkedin`, `jobboard`, `saisie_console`, `autre` — dérivé par EXT-T03 de `sourceCanal`, chaîne transportée figée ; chemin inconnu → `autre`, journalisé | REQ-DM-035, REQ-EXT-008 |
| `StatutTache`          | `a_faire`, `en_cours`, `en_revue`, `fusionnee`, `deployee`, `verifiee`, `bloquee`, `attente_externe`, `proposee` — **neuf valeurs**, celles de `scripts/lot/tasks.schema.json` ; `proposee` manquait ici depuis GOV-017a et rien ne l'attrapait | REQ-GOV-021 |
| `TypeEvenementJournal` | `journal_ouvert` — la genèse du journal `evenements`, écrite par la première migration et portant l'algorithme de hachage ; ensuite, un type par GENRE de transition journalisée (partners/ADR-0022), chacun à charge fermée sans donnée personnelle ; les treize valeurs décidées pour les phases 0 et 1 et leur tâche créatrice sont au §4.1, et chacune entre dans cette ligne avec la migration qui la crée | REQ-DM-024, REQ-DM-041 |
| `AgregatJournal`       | `attribution`, `apporteur`, `ligne_commission`, `releve`, `piece_kyc`, `contrat` — l'agrégat dont la transition s'écrit au journal, dans la même transaction ; l'événement le désigne par `agregatId`, jamais par une donnée de la personne | REQ-DM-024 |
| `SourceEvenementRecu`  | `axionia`, `docuseal` — colonne `source` de `EvenementRecu` (SEC-06) | REQ-DM-036 |
| `TypeEvenementRecu`    | `client_cree`, `client_mis_a_jour`, `devis_signe`, `facture_emise`, `avoir_emis`, `paiement_recu`, `paiement_rembourse` — identifiant Prisma en snake_case, libellé Postgres égal au nom de fil par `@map` (`client_cree` porte `client.cree`), généré depuis `TYPES_EVENEMENT` (SEC-06) ; INT-T01c y fera entrer `candidature_recue`, `financement_mis_a_jour`, `facture_annulee` et `client_fusionne`, INT-T12 `submission_completed`, `form_declined` et `submission_expired` : chacune passe dans cette liste avec la migration qui la crée | REQ-DM-036, REQ-INT-004 |
| `StatutEvenementRecu`  | `recu`, `traite`, `en_attente_dependance`, `held`, `en_erreur` — `held` : un événement bien formé de `schema_version` inconnue, inscrit et alerté, jamais rejeté (SEC-06) | REQ-DM-036, REQ-ARG-003, REQ-INT-011 |
| `StatutCourriel`       | `envoye`, `retenu_adresse_supprimee`, `retenu_dmarc_non_verifie`, `echec` — colonne `statut` de `courriels_envoyes` (INT-T10) : un envoi retenu est visible, jamais jeté | REQ-INT-022, REQ-INT-023 |
| `MotifSuppressionCourriel` | `rebond_definitif` — une valeur de plainte n'y entre que si le relais émet réellement cet événement (INT-T10) | REQ-INT-023 |
| `CanalDepot`           | `espace`, `lien_prive` — le canal d'un dépôt ou d'un refus (DM-07) | REQ-DM-012 |
| `EtatAdministratif`    | `actif`, `cesse` — projection de l'état administratif rendu par l'API publique, « A » et « C » (DM-07) ; ce `actif` qualifie un établissement, jamais un apporteur | REQ-DM-030 |
| `CategorieEntreprise`  | `pme`, `eti`, `ge` — catégorie rendue par l'API publique (DM-07) | REQ-DM-030 |
| `MotifRefusDepot`      | `anteriorite_client`, `anteriorite_devis`, `etablissement_cesse`, `entreprise_hors_perimetre`, `file_complete`, `opposition_demarchage`, `insincerite` — sept exactement, colonne `motif` de `depots_refuses` (DM-07) | REQ-SEC-022 |
| `InteretContact`       | `eleve`, `moyen`, `faible`, `nul` — `HYP-A02-VOCABULAIRE-QUALIFICATION` (DM-09) | REQ-DM-008 |
| `ProchaineEtape`       | `rdv`, `rappeler`, `proposition`, `perdue`, `aucune` — `HYP-A02-VOCABULAIRE-QUALIFICATION` (DM-09) | REQ-DM-008, REQ-UX-021 |
| `MotifPerte`           | `pas_de_besoin`, `deja_equipe`, `hors_cible`, `injoignable_definitif`, `autre` — `HYP-A02-VOCABULAIRE-QUALIFICATION` (DM-09) ; aucune valeur `non_confirme` : une déclaration `non_confirme` mène l'attribution à `invalidee` | REQ-DM-008, REQ-UX-021 |
| `TypeAnomalie`         | `sincerite`, `appareil_inconnu`, `ramassage`, `auto_parrainage` — aucune valeur de rythme (DM-12) | REQ-DM-033, REQ-SEC-017 |
| `ObjetContestation`    | `refus_depot`, `annulation_attribution`, `demande_rattachement` — objet d'une contestation écrite (DM-12) | REQ-DM-043, REQ-DM-034 |
| `EtatGel`              | `libre`, `gele_non_confirmation`, `gele_fraude` — le statut vaut `suspendu` si et seulement si le gel n'est pas `libre` (SEC-15) | REQ-SEC-019, REQ-SEC-038 |
| `ResultatDecisionCandidature` | `retenu`, `vivier`, `refuse` — une décision est une ligne nouvelle, jamais une réécriture (CPL-T06) | REQ-CPL-006 |
| `StatutEnveloppe`      | `envoyee`, `signee`, `refusee`, `expiree`, `annulee` — l'enveloppe DocuSeal d'un contrat (INT-T12) | REQ-SEC-034, REQ-JUR-004 |
| `CanalEchange`         | `appel`, `email`, `visite`, `linkedin`, `autre` — canal d'un échange saisi (EXT-T01) | REQ-EXT-002 |
| `OrigineCandidature`   | `tunnel`, `saisie_console`, `import`, `parrainage` — origine d'une candidature (EXT-T03) | REQ-EXT-008 |
| `TypeFichierCv`        | `pdf`, `docx`, `jpg`, `png` — type RÉEL d'un CV, vérifié par ses octets (EXT-T03) | REQ-EXT-011 |
| `TypeLigneGrille`      | `forfait`, `pourcentage`, `aucune` — type d'une ligne de grille (DM-23) | REQ-EXT-026 |
| `FamillePrestation`    | `formation_collective`, `accompagnement_individuel`, `audit`, `implementation` — famille d'une ligne de grille (DM-23) | REQ-EXT-026 |

> ⚠️ **La légende d'avancement de REQ-GOV-026 n'est PAS un enum de colonne**, et n'a donc pas de
> ligne dans ce tableau. Ses sept états — `specifie`, `code`, `teste`, `revu`, `fusionne`,
> `deploye`, `verifie_en_prod` — forment une **échelle ordonnée de lecture**, jamais écrite dans un
> fichier de données : elle est **dérivée** de `StatutTache` par le barème unique de
> `scripts/gates/gov-inventaire.ts`, dont l'exhaustivité sur les neuf statuts est vérifiée par
> `pnpm gov:inventaire` — un dixième statut sans rang rougit. Écrire une colonne « avancement » à
> côté de « statut » serait la faute que RM-04 nomme : deux copies du même vocabulaire divergent
> toujours. Détail dans `docs/INVENTAIRE-CHANTIERS.md` §1.


### 4.1 Valeurs de `TypeEvenementJournal` décidées pour les phases 0 et 1 (partners/ADR-0022)

Un type par **GENRE** de transition, pas par transition : ajouter un événement à une matrice modifie une
charge Zod de `src/domain/evenement/charges.ts`, jamais le schéma. Chaque valeur entre dans la ligne
`TypeEvenementJournal` du §4 **avec la migration de sa tâche créatrice**, et pas avant : la ligne énumère ce
que le schéma porte, sans quoi `partners:schema:enums` rougirait en `enum_divergent_du_glossaire`. Un texte
qui nomme un événement pointé — `attribution.confirmee_tacitement` (REQ-DM-042) — désigne
`attribution_etat_modifie` avec `evenement: 'confirmee_tacitement'`.

| Valeur | Agrégat | Créateur | Charge fermée |
| --- | --- | --- | --- |
| `attribution_etat_modifie` | `attribution` | DM-08 | `{de, vers, evenement, acteurId?, lienInteret?}` ; `de` : `EtatAttribution` ou nul ; `evenement` : `z.enum(EVENEMENTS_ATTRIBUTION)` ; `lienInteret` : `declare` ou `non_declare` |
| `attribution_peremption_suspendue` | `attribution` | DM-08 | `{acteurId, suspendueAt}` |
| `attribution_contact_purge` | `attribution` | DM-07 | `{purgeAt}` |
| `apporteur_statut_modifie` | `apporteur` | CPL-T06 | `{de, vers, evenement, resiliationMotif?, acteurId?}` ; `evenement` : `z.enum(EVENEMENTS_APPORTEUR)` |
| `apporteur_gel_modifie` | `apporteur` | SEC-15 | `{de, vers, par, anomalieId?, acteurId?}` ; `de` et `vers` : `EtatGel` ; `par` : `role` ou `plein_droit` |
| `anomalie_statut_modifie` | `apporteur` | DM-12 | `{anomalieId, de?, vers, acteurId?}` |
| `contestation_modifiee` | `apporteur` | DM-12 | `{contestationId, de?, vers, acteurId?}` |
| `rattachement_manuel_modifie` | `attribution` | DM-12 | `{rattachementId, vers, acteurId}` ; `vers` : `decide` ou `revoque` |
| `piece_kyc_statut_modifie` | `piece_kyc` | DM-11 | `{de, vers, type, acteurId?}` ; `vers` : `StatutPieceKyc` ; `type` : `TypePieceKyc` |
| `contrat_statut_modifie` | `contrat` | DM-23 | `{de?, vers, acteurId?}` ; `vers` : `StatutContrat` |
| `grille_contrat_modifiee` | `contrat` | DM-23 | `{grilleContratId, lignes, acteurId}` ; `lignes` : les identifiants des lignes modifiées, jamais un compte |
| `echange_saisi` | `attribution` | EXT-T01 | `{echangeId, canal}` ; `canal` : `CanalEchange` |
| `candidature_rattachee` | `apporteur` | EXT-T03 | `{apporteurIdRattache}` |

Un booléen s'écrit dans une charge `z.enum(['oui', 'non'])`, jamais une chaîne libre (REQ-DM-041).

## 5. Événements

### `EvenementRecu` — un seul nom

Table de réception des webhooks entrants (axionia, DocuSeal) : `{source enum {axionia, docuseal}, eventId unique par
source, eventType, payloadHash, receivedAt, processedAt, error, retryCount}` (REQ-DM-036, REQ-QA-008, patron
`DocusealWebhookEvent`). Rejouer un événement déjà traité ne produit **aucune** écriture métier. Confirmé le
2026-09-26 (partners/ADR-0022, REQ-DM-036 amendée) : modèle `EvenementRecu`, table `evenements_recus`, créée par
SEC-06 ; ses enums sont `SourceEvenementRecu`, `TypeEvenementRecu` et `StatutEvenementRecu` (§4).

Synonymes interdits : `WebhookRecu`, `InboundEvent`, `WebhookEvent`, `EventLog` pour cette table. Ne pas confondre
avec `evenements` (journal append-only chaîné du domaine, REQ-DM-041).

### Types d'événements axionia → Partners — liste fermée de SEPT (REQ-INT-004, source `packages/contracts/events.ts`)

`client.cree` · `client.mis_a_jour` · `devis.signe` · `facture.emise` · `avoir.emis` · `paiement.recu` ·
`paiement.rembourse` — **7 types**, ceux que REQ-INT-004 énumère, nommés sur les modèles RÉELS d'axionia.

Quatre autres noms d'événements existent au registre et sont **hors contrat v1**, recensés dans
`TYPES_HORS_CONTRAT_V1` avec l'exigence qui les nomme : `candidature.recue` et `financement.mis_a_jour`
(REQ-INT-032), `facture.annulee` (REQ-ARG-010), `client.fusionne` (REQ-CPL-014). Sept plus quatre font les
onze qu'un texte antérieur annonçait — aucun n'est perdu, aucun n'est inventé.

**Enveloppe : `snake_case`** (REQ-INT-003) : `{event_id, event_type, schema_version, occurred_at, emitted_at,
producer, subject_ref, sequence, payload}`. C'est un écart ASSUMÉ à `docs/CONVENTIONS.md` §1, borné par
`partners/ADR-0008` : l'enveloppe est un **format de fil**, au même titre que les champs d'une API tierce que
le §1 exempte nommément. Le camelCase et les suffixes `…Cents` / `…At` restent la règle **dans le payload** et
partout ailleurs dans le code.

Synonymes interdits : `occurredAt`, `emittedAt`, `subjectRef` ; `payment.received`, `refund.paid`,
`refund.issued`, `invoice.issued`, `invoice.cancelled`, `avoir.issued`, `devis.signed`,
`candidature.submitted`, `client.created`, `client.updated` ; `Invoice`, `Refund`,
`PaymentScheduleProfile` — des modèles supprimés d'axionia qu'aucun événement ne référence.

Synonymes interdits : `eventId` dans l'enveloppe de fil, `eventType` dans l'enveloppe de fil,
`schemaVersion` dans l'enveloppe de fil — trois jetons que le registre attribue AUSSI à un autre
rôle, donc trois interdits que la garde n'exerce pas et qu'elle imprime.

> ⚠️ **L'INTERDIT CI-DESSUS A RANGÉ, JUSQU'AU 2026-09-22, PARMI LES INTERDITS SECS LA FORME EXACTE QUE
> CE MÊME §5 PRESCRIT DANS SON PREMIER PARAGRAPHE.** `eventId` et `eventType` y étaient refusés sans
> condition, alors que le paragraphe de `EvenementRecu` les épelle comme les colonnes de la table
> (REQ-DM-036). Le piège était **armé**, pas déclenché : au 2026-09-22, aucun des six jetons
> n'apparaissait dans `prisma/`, `src/`, `messages/`, `docs/adr/` ni `packages/contracts/`. La tâche
> qui allait le déclencher est **SEC-06** (`a_faire`, REQ-DM-036) : son développeur aurait écrit la
> colonne que l'exigence épelle, vu `pnpm gov:termes-interdits` rougir sur le glossaire, et n'aurait
> eu sous les yeux ni ce raisonnement ni de quoi trancher.
>
> **Ce qui a été tranché.** Les deux lignes parlent de deux objets différents : une **colonne de
> stockage interne**, camelCase par `docs/CONVENTIONS.md` §1, et un **champ de l'enveloppe de fil**,
> snake_case par REQ-INT-003 et `partners/ADR-0008`. L'interdit visait le second et attrapait le
> premier : juste dans son intention, trop large dans sa forme. Il n'est pas affaibli, il est ramené
> à son intention, par une règle qui vaut pour **tout** terme de ce fichier et pas pour ce cas-ci —
> **un jeton que le registre attribue AUSSI à un autre rôle ne peut pas porter un interdit SEC** : il
> devient un interdit sous condition, que la garde n'exerce pas et qu'elle **imprime**, plutôt qu'un
> rouge qu'on apprendra à contourner. Mesure du 2026-09-22, faite dans `docs/requirements.json` et
> dans ce fichier : `eventId` est attribué par sept exigences (REQ-DM-016, REQ-DM-036, REQ-SEC-011,
> REQ-ARG-002, REQ-ARG-027, REQ-QA-008, REQ-QA-024) **et** par §5 lui-même ; `schemaVersion` par
> trois (REQ-ARG-003, REQ-QA-007, REQ-QA-009) ; `eventType` par §5 lui-même. Les trois autres —
> `occurredAt`, `emittedAt`, `subjectRef` — ne sont réclamés nulle part ailleurs : leur interdit
> reste SEC, et la garde le tient.
>
> **Ce qui garde réellement la casse de l'enveloppe** n'est pas cette liste de jetons, et ne l'a
> jamais été : c'est l'égalité, champ par champ et **dans l'ordre**, entre `CHAMPS_ENVELOPPE`
> (`packages/contracts/enveloppe.ts`) et les neuf noms que REQ-INT-003 épelle. Une liste fermée
> comparée par égalité voit une casse fausse ; un balayage de jeton ne voit qu'un mot, et ne saura
> jamais dire si ce mot est une colonne ou un champ de fil.
>
> ⚠️ **Effet de bord mesuré, et réparé au passage.** `subjectRef` n'était **pas** exercé avant ce
> jour : le tiret cadratin qui suivait le dernier jeton de la liste en faisait, aux yeux de la garde,
> un interdit « sous condition » — sans que personne l'ait voulu, et sans que rien le dise. Le compte
> des synonymes exercés passe donc de **37 à 35**, et non de 37 à 34.

> ⚠️ **CE PARAGRAPHE DISAIT L'INVERSE JUSQU'AU 2026-09-04, en citant `events.ts` comme sa source.** Il
> annonçait **onze** types et une enveloppe **camelCase**, et rangeait `event_id` / `event_type` parmi les
> synonymes interdits « **vus rougir par `gov:check`** ». Trois choses étaient fausses à la fois : le compte,
> la casse, et le fait qu'une garde le vérifie — `grep -rn GLOSSAIRE scripts/gates/*.ts` ne rend rien, et le
> `glossaire-enums.spec.ts` que **GOV-006** promet n'existe sur aucun chemin du dépôt.
>
> Ce n'est pas un détail de rédaction. `docs/PRESEANCE.md` §2 donne au glossaire la **primauté** sur tout
> autre document « sur un terme et ses synonymes interdits », et précise qu'il n'est dérivé de personne sur
> ce point. Le prochain agent qui écrivait un producteur lisait donc ce paragraphe, écrivait `eventId`, et
> **aucune garde ne le voyait**. Trouvé par la lentille `schema` (A02) sur la PR 28, dans un fichier que la
> PR ne touchait pas — c'est-à-dire par quelqu'un qui est allé lire ce que le diff ne montrait pas.
>
> ⚠️ **Aucune garde ne lit encore ce paragraphe.** Tant que **GOV-006** n'a pas livré
> `glossaire-enums.spec.ts`, cette liste est une consigne, pas un contrôle. Le dire vaut mieux que laisser
> croire le contraire, comme ce fichier le faisait.

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
| lignée                  | Filleuls d'un apporteur (premier niveau) et filleuls de ceux-ci (second niveau), dérivés de `Parrainage`, jamais stockés ; lecture seule, console (REQ-DM-045, W15). Le second niveau n'est jamais rémunéré | downline, réseau de vente |
| équipe                  | Un apporteur et sa lignée ; les équipes se chevauchent, leurs totaux ne s'additionnent pas (`HYP-W15-EQUIPE`). Terme de **console seulement**, jamais montré à un apporteur | groupe de vente |
