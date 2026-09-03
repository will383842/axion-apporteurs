# Affirmations sur le code d'axionia — vérification

> Livré par **GOV-004** (REQ-GOV-004). Le dossier de spécification affirme des choses sur le code du dépôt
> voisin `axionia`. Ce fichier les rejoue une par une **dans le code**, et rend un verdict par affirmation.
> Aucune conclusion n'est recopiée d'un document source : chaque ligne du tableau porte le chemin et la ligne
> où je l'ai lue.
>
> **Objet vérifié.** Dépôt `axionia`, branche `main`, commit `ad53f14a81f559c806500a78a6e545bba20ada88`
> (2026-09-03). L'arbre de travail portait trois fichiers modifiés au moment de la lecture — `.gitignore`,
> `docs/contrat-apporteur-clauses.md`, `scripts/verifier-kit-bitwarden.sh` — dont **aucun** sous `prisma/`
> ni `src/` : les numéros de ligne cités ici correspondent donc exactement au commit.
>
> **Chaque ligne porte son SHA.** La dernière colonne se lit `AAAA-MM-JJ @ <SHA court>`. Ce n'est pas une
> redite de l'en-tête : une ligne revérifiée plus tard portera une autre date et un autre SHA, et c'est le
> couple date + SHA qui rend la preuve rejouable. `pnpm gov:sonde` rougit sur une colonne vide, mal formée,
> ou sur une preuve sans `chemin:ligne`.
>
> **Trois verdicts, et un quatrième.** `vérifiée` = le code dit ce que l'affirmation dit. `FAUSSE` = le code
> dit autre chose, et la colonne de preuve dit quoi. `partielle` = une part est exacte, une part ne l'est pas.
> **`non vérifiable`** = je n'ai pas pu la trancher depuis les sources ; la raison est écrite. Une affirmation
> non vérifiable n'est jamais rendue « vérifiée » — c'est la règle qui a manqué aux documents sources.
>
> **Les repères `AFF-nn` sont des étiquettes, pas un ordre.** Ils sont stables : une tâche qui cite `AFF-22`
> doit retrouver la même affirmation dans six mois. Les repères ajoutés après la première rédaction sont
> donc écrits à la suite, jamais intercalés.
>
> **Lexique.** Les chemins de fichiers d'axionia sont cités **verbatim**, entre accents graves. Certains
> contiennent un mot que le lexique de `docs/CONVENTIONS.md` §1 proscrit dans la prose du dépôt Partners :
> un chemin est une citation, pas une désignation, et le tronquer rendrait la preuve invérifiable. Si la garde
> lexicale les refuse, c'est un arbitrage du lead, pas une réécriture de la preuve.
>
> **Barre verticale.** Dans une cellule de tableau, une barre verticale s'échappe (`\|`) **même entre accents
> graves** : les accents graves ne protègent pas le séparateur de colonnes. `pnpm gov:sonde` rougit sur une
> barre nue dans une cellule.

---

## 1. Les cinq affirmations que REQ-GOV-004 nomme

Le texte de REQ-GOV-004 nomme cinq affirmations à invalider. Les voici sous leur libellé exact — celui de
l'exigence, entre guillemets — en regard de leur repère dans le tableau §2. Les cinq sont **FAUSSES**, et les
cinq figurent au registre `docs/DECISIONS.md` §6 avec la mention FAUSSE et la réalité constatée.

| Libellé de REQ-GOV-004 | Repère | Ce que le code porte à la place |
| --- | --- | --- |
| « `Invoice` » | `AFF-01` | Aucun modèle. La facture est `FactureFormation` (`prisma/schema.prisma:6913`) |
| « `Refund` » | `AFF-02` | Aucun modèle. Le remboursement est une valeur d'enum (`schema.prisma:229`, `:238`) |
| « `payerSiret` » | `AFF-05` | Zéro occurrence. Le SIRET vit sur la facture (`schema.prisma:6954`) |
| « montant HT encaissé » | `AFF-04` | Le montant est confronté au **TTC** de la facture (`facture-libre.ts:586`) |
| « C3 codé » | `AFF-06` | La chaîne de résolution client est **nullable à quatre maillons** : un encaissement peut n'être rattaché à aucun SIREN |

**La correspondance de « C3 codé » est établie, pas devinée.** L'étiquette n'a pas de ligne propre au
registre : `docs/DECISIONS.md` ne porte ni cette étiquette ni sa forme qualifiée, et sa §0 ne la résout pas.
Ce qu'elle désigne est en revanche déterminé par le texte de REQ-GOV-004 lui-même, qui l'aligne sur les
quatre autres libellés — tous des faits de la **chaîne encaissement → client** —, et par l'acceptation de
GOV-004, qui la range entre « HT encaissé » et « patron Calendly ». C'est donc `AFF-06`, la seule affirmation
du tableau qui porte sur la complétude de cette chaîne. Si le lead conteste ce rattachement, la ligne à
corriger est celle-ci, et elle seule : les quatre autres sont littérales.

---

## 2. Tableau des affirmations

| Repère | Affirmation | Verdict | Où je l'ai vérifiée | Vérifié le |
| --- | --- | --- | --- | --- |
| AFF-01 | Le modèle `Invoice` existe dans le schéma d'axionia | **FAUSSE** | `axionia/prisma/schema.prisma` — aucun `model Invoice` ; seule trace, un commentaire à la ligne `6910` (« Distincte de `Invoice` (booking générique) ») | 2026-09-03 @ ad53f14a |
| AFF-02 | Le modèle `Refund` existe dans le schéma d'axionia | **FAUSSE** | `axionia/prisma/schema.prisma` — aucun `model Refund` ; le remboursement est la valeur `refund` de `PaymentType` (`prisma/schema.prisma:229`) et `refunded` de `PaymentStatus` (`prisma/schema.prisma:238`) | 2026-09-03 @ ad53f14a |
| AFF-03 | Le modèle `PaymentScheduleProfile` existe | **FAUSSE** | Zéro occurrence dans `axionia/prisma/**` et `axionia/src/**`. L'échéancier tient dans l'enum `PaymentType` = `deposit`, `installment_2`, `installment_3`, `balance`, `refund` (`prisma/schema.prisma:224-230`) | 2026-09-03 @ ad53f14a |
| AFF-04 | `Payment.amountCents` porte un montant **HT** | **FAUSSE** — c'est du **TTC** | `axionia/src/server/qualiopi/financements/facture-libre.ts:582-586` : la somme des `amountCents` est confrontée à `montantTtcCents ?? montantHtCents` ; même calcul dans `src/server/actions/qualiopi/rapprochement.ts:110-121` et `src/app/[locale]/(admin)/[adminPrefix]/qualiopi/facturation/[id]/page.tsx:190-197`. Le champ lui-même est nu : `prisma/schema.prisma:1574` | 2026-09-03 @ ad53f14a |
| AFF-05 | Un champ `payerSiret` existe sur `Payment` (ou ailleurs) | **FAUSSE** | Zéro occurrence de `payerSiret` dans `axionia/prisma/**` et `axionia/src/**`. Le SIRET du destinataire vit sur la facture : `prisma/schema.prisma:6954` (`destinataireSiret`, nullable) | 2026-09-03 @ ad53f14a |
| AFF-06 | La chaîne qui remonte d'un encaissement au SIREN du client est complète | **FAUSSE** — elle est optionnelle à quatre maillons | `axionia/prisma/schema.prisma` : `Payment.factureFormationId String?` (`prisma/schema.prisma:1565`, `onDelete: SetNull`) → `FactureFormation.clientId String?` (`prisma/schema.prisma:6924`) et `.sessionId String?` (`prisma/schema.prisma:6943`) → `TrainingSession.clientId String?` (`prisma/schema.prisma:5371`) → `Client.siren String?` (`prisma/schema.prisma:4670`). Un encaissement peut n'être rattaché à aucun SIREN | 2026-09-03 @ ad53f14a |
| AFF-07 | Le seul chemin obligatoire vers un client est le devis | **vérifiée** | `axionia/prisma/schema.prisma:4781` : `Devis.clientId String` non nullable, `onDelete: Restrict`. C'est le seul maillon non optionnel de la chaîne | 2026-09-03 @ ad53f14a |
| AFF-08 | `Client.siren` est unique, ou au moins indexé | **FAUSSE** | `axionia/prisma/schema.prisma:4668-4670` : `siret` et `siren` sont `String?` sans `@unique` ; les seuls index du modèle sont `statut`, `nafCode`, `opcoIdentifie` (`prisma/schema.prisma:4749-4751`), confirmés par la migration `prisma/migrations/20260606140000_qualiopi_t2_crm_clients_devis/migration.sql:66-75` | 2026-09-03 @ ad53f14a |
| AFF-09 | Un SIREN unique existe quelque part chez axionia | **vérifiée** — mais pas dans le CRM | `axionia/prisma/schema.prisma:9688` : `ProspectionCompany.siren String @unique`. L'unicité du SIREN existe côté prospection, jamais côté `Client` | 2026-09-03 @ ad53f14a |
| AFF-10 | Booking V1 est encore en place chez axionia | **FAUSSE** | `axionia/prisma/schema.prisma:1548-1554` : système supprimé le 2026-08-26, 15 tables droppées ; migration `prisma/migrations/20260826160000_suppression_systeme_booking/migration.sql`, commit `eaa49f6e6` du 2026-08-26 | 2026-09-03 @ ad53f14a |
| AFF-11 | De Booking V1 ne subsistent que `Payment` et `DocusealWebhookEvent` | **partielle** | Les deux modèles subsistent bien (`prisma/schema.prisma:1562` et `prisma/schema.prisma:1608`), mais subsistent **aussi** trois références souples sans clé étrangère — `TrainerFeeLine.bookingId` (`prisma/schema.prisma:5074`), `CoachingSession.bookingId` (`prisma/schema.prisma:8407`), `CoachingContract.bookingId` (`prisma/schema.prisma:8855`) —, le drapeau `Payment.isHistorical` (`prisma/schema.prisma:1590`) et le catalogue `src/content/booking-catalog.ts` | 2026-09-03 @ ad53f14a |
| AFF-12 | Les modèles supprimés le sont « depuis un mois » (formulation de RM-03) | **partielle** — c'est une semaine | La date de suppression est portée par le schéma lui-même : `prisma/schema.prisma:1549` (« Système Booking V1 SUPPRIMÉ le 2026-08-26 »), confirmée par le commit `eaa49f6e6` ( `git log -1 -- prisma/migrations/20260826160000_suppression_systeme_booking/migration.sql`), soit huit jours avant la vérification | 2026-09-03 @ ad53f14a |
| AFF-13 | L'événement `payment.received` existe dans le code d'axionia | **FAUSSE** | Zéro occurrence dans `axionia/src/**` et `axionia/prisma/**` | 2026-09-03 @ ad53f14a |
| AFF-14 | L'événement `devis.signed` existe dans le code d'axionia | **FAUSSE** | Zéro occurrence. Et le devis n'a pas d'état « signé » : `DevisStatut` = `brouillon`, `envoye`, `accepte`, `refuse`, `expire`, `transforme_convention` (`prisma/schema.prisma:4651-4658`), horodaté par `acceptedAt` (`prisma/schema.prisma:4807`) | 2026-09-03 @ ad53f14a |
| AFF-15 | L'événement `refund.issued` existe dans le code d'axionia | **FAUSSE** | Zéro occurrence dans `axionia/src/**` et `axionia/prisma/**` | 2026-09-03 @ ad53f14a |
| AFF-16 | Les onze types d'événements attendus par Partners sont émis par axionia | **FAUSSE** — aucun ne l'est | Aucune occurrence de `client.cree`, `client.mis_a_jour`, `client.fusionne`, `candidature.recue`, `devis.signe`, `facture.emise`, `facture.annulee`, `avoir.emis`, `paiement.recu`, `paiement.rembourse`, `financement.mis_a_jour` comme type d'événement dans `axionia/src/**`. Les rares correspondances textuelles sont des valeurs d'enum sans rapport (`opcoStatut = paiement_recu`, `src/app/[locale]/(admin)/[adminPrefix]/planning/page.tsx:96`) ou des noms de gabarits d'e-mail (`src/lib/email/templates/index.tsx:183`) | 2026-09-03 @ ad53f14a |
| AFF-17 | Un canal d'événements sortant existe chez axionia | **partielle** | Il existe, mais il vise un CRM tiers, pas Partners, et sa liste est fermée sur d'autres types : `src/server/crm-sync/types.ts:24-34` (`form_submission`, `calendly_booked`, `calendly_completed`, `calendly_canceled`, `calendly_no_show`, `newsletter_optin`, `newsletter_optout`, `review_posted`, `application_submitted`, `opt_out`) | 2026-09-03 @ ad53f14a |
| AFF-18 | L'enveloppe d'événement d'axionia est en camelCase | **FAUSSE** | `axionia/src/server/crm-sync/types.ts:69-79` : `schema_version`, `event_id`, `event_type`, `occurred_at`, `subject_ref` — snake_case. Ni `emittedAt`, ni `producer`, ni `sequence` n'existent | 2026-09-03 @ ad53f14a |
| AFF-19 | Le patron d'émission fiable (outbox, idempotence, réessai avec recul) existe déjà chez axionia | **vérifiée** | `axionia/prisma/schema.prisma:10350` (`CrmSyncOutbox` : `eventId @unique`, `attempts`, `nextAttemptAt`, `lastError`) et `prisma/schema.prisma:10338-10348` (`CrmSyncStatus`, dont `gave_up` = refus définitif) ; rejeu par `src/server/queue/workers/crm-sync-worker.ts:63` | 2026-09-03 @ ad53f14a |
| AFF-20 | Le patron de réception `DocusealWebhookEvent` existe et sert de modèle à `EvenementRecu` | **vérifiée** | `axionia/prisma/schema.prisma:1608-1626` : `docusealEventId @unique`, `payload`, `processedAt`, `error`, `retryCount`, `receivedAt`. Contrôle de signature puis idempotence sur conflit d'unicité dans `src/app/api/docuseal/webhook/route.ts:36-84` (`PRISMA_UNIQUE_CONSTRAINT = "P2002"`, `src/app/api/docuseal/webhook/route.ts:36`) | 2026-09-03 @ ad53f14a |
| AFF-21 | Le patron `EmargementToken` (jeton haché, révocable, à expiration) existe | **vérifiée** | `axionia/prisma/schema.prisma:7900-7943` : `tokenHash @unique` (SHA-256, le clair ne vit que dans l'URL), `expiresAt`, `usedAt`, `revokedAt` + motif, `createdIpHash`, `destinataireEmailSha256` | 2026-09-03 @ ad53f14a |
| AFF-22 | Ce patron garantit « un seul jeton actif » (hypothèse `HYP-C6`) | **vérifiée** | Deux index uniques **partiels** en SQL brut, dans la même migration que la table et dans sa suite : `prisma/migrations/20260721120000_qualiopi_emargement_signe/migration.sql:338-340` — `emargement_token_enrollment_actif ON "emargement_tokens" ("enrollment_id") WHERE "revoked_at" IS NULL AND "enrollment_id" IS NOT NULL`, précédé du commentaire « Un seul jeton vivant par inscription » (`prisma/migrations/20260721120000_qualiopi_emargement_signe/migration.sql:336-337`) — et `prisma/migrations/20260724120000_afest_seance_signatures_reelles/migration.sql:161-163` — `emargement_token_coaching_role_actif ON "emargement_tokens" ("coaching_id", "coaching_role") WHERE "revoked_at" IS NULL AND "coaching_id" IS NOT NULL`, l'unicité portant là sur le couple (parcours, rôle) et non sur le seul parcours (`prisma/migrations/20260724120000_afest_seance_signatures_reelles/migration.sql:157-160`). Le bloc d'index généré par Prisma (`prisma/migrations/20260721120000_qualiopi_emargement_signe/migration.sql:147-156`) ne porte que `token_hash`, `enrollment_id`, `coaching_id`, `expires_at` : s'arrêter à ce bloc fait conclure l'inverse | 2026-09-03 @ ad53f14a |
| AFF-23 | L'index unique **partiel** en SQL brut est une pratique déjà éprouvée chez axionia | **vérifiée** | Les DDL, pas les commentaires : `prisma/migrations/20260721120000_qualiopi_emargement_signe/migration.sql:292-294` (`emargement_signature_creneau_active … WHERE "revoked_at" IS NULL AND "creneau_id" IS NOT NULL`) et `prisma/migrations/20260730090000_document_signature_token_canal_a/migration.sql:205-207` (`document_signature_token_actif ON "document_signature_tokens"("document_genere_id", "partie") WHERE "revoked_at" IS NULL`). Le motif est expliqué en prose aux lignes `prisma/migrations/20260721120000_qualiopi_emargement_signe/migration.sql:40-42` et `prisma/migrations/20260730090000_document_signature_token_canal_a/migration.sql:199-204` — renvoi secondaire seulement : un commentaire n'est pas une instruction | 2026-09-03 @ ad53f14a |
| AFF-24 | `src/content/pricing.ts` porte bien `COMMERCIAL_COMMISSIONS` | **vérifiée** | `axionia/src/content/pricing.ts:836` ; type `CommercialCommission` déclaré `src/content/pricing.ts:778-806` ; accès unitaire `getCommissionById` `src/content/pricing.ts:904` | 2026-09-03 @ ad53f14a |
| AFF-25 | Chaque ligne de `PRICING_CATEGORIES` porte un `commissionId` (formulation de `HYP-W6-BIS`) | **FAUSSE** | Le champ `commissionId` n'existe nulle part dans `axionia/src/content/pricing.ts`. Le lien existe **en sens inverse** et il est facultatif : `CommercialCommission.basisTierId?` désigne le `PricingTier` vendu (`src/content/pricing.ts:801`), et le commentaire `src/content/pricing.ts:795-800` précise que certains produits n'ont pas de palier publié. `PRICING_CATEGORIES` (`src/content/pricing.ts:914`) n'est qu'un regroupement de tableaux de `PricingTier` (`src/content/pricing.ts:48`) | 2026-09-03 @ ad53f14a |
| AFF-26 | La forme de rémunération d'une ligne est un vocabulaire fermé | **vérifiée** | `axionia/src/content/pricing.ts:791` : `kind: "flat" \| "percent" \| "scale"`, avec un champ de valeur distinct par forme (`src/content/pricing.ts:793`, `src/content/pricing.ts:795`). C'est un vocabulaire fermé en TypeScript, pas en base — il faudra le porter en enum Prisma côté Partners (RM-04) | 2026-09-03 @ ad53f14a |
| AFF-27 | Aucun test ne lit `COMMERCIAL_COMMISSIONS` | **FAUSSE** — aujourd'hui ; exacte hier | `axionia/src/content/__tests__/commission-taux-unique.spec.ts:23` l'importe et l'exerce ; l'en-tête du fichier (`src/content/__tests__/commission-taux-unique.spec.ts:11`) rappelle que ce n'était pas le cas avant le 2026-08-18, et dit ce que le test aurait attrapé | 2026-09-03 @ ad53f14a |
| AFF-28 | axionia expose déjà un export de la grille, ou son empreinte, à destination de Partners | **FAUSSE** | Aucun dossier `axionia/scripts/partners/`, aucune occurrence de `partners` dans `axionia/package.json`. La dérivation prévue par RM-01 (grille → JSON + empreinte → Partners) est entièrement à construire | 2026-09-03 @ ad53f14a |
| AFF-29 | L'identité légale du code d'axionia concorde avec la décision W1 | **vérifiée** | `axionia/src/lib/identite-legale-ssot.ts:42-74` : module sans aucun import, portant `legalName` (`src/lib/identite-legale-ssot.ts:51`), la rue, le complément de domiciliation, le code postal, la ville, `siren` (`src/lib/identite-legale-ssot.ts:70`), `siret` (`src/lib/identite-legale-ssot.ts:72`), `vat` (`src/lib/identite-legale-ssot.ts:74`), sourcés Kbis et avis SIRENE. Les valeurs concordent avec la ligne W1 de `docs/DECISIONS.md` | 2026-09-03 @ ad53f14a |
| AFF-30 | Une entité estonienne subsiste dans le code d'axionia | **partielle** — elle subsiste comme **défaut de colonne en base** | Elle subsiste : `prisma/migrations/20260516142017_add_image_bank_tables/migration.sql:32` porte `"copyright_holder" VARCHAR(255) NOT NULL DEFAULT 'Axion-IA OÜ'`, et c'est la **seule** migration à toucher cette colonne — le défaut appliqué en base reste donc celui-là. Le schéma déclare l'inverse (`prisma/schema.prisma:3356`, `@default("Axion-IA")`) : la divergence n'est rattrapée qu'à la lecture, par le nettoyage `src/server/image-bank/constants.ts:63-71` (`raw.replace(/\s*OÜ/gi, "")`, `src/server/image-bank/constants.ts:71`). Deux occurrences de plus hors du périmètre `src/**` initialement balayé : `src/server/image-bank/services/image-attribute-validator.service.ts:52` et `src/content/keywords/j-presse.ts:26`. Les deux gardes citées comme preuve d'absence — `src/lib/legal-identity.test.ts:179`, `src/lib/email/templates/templates-coverage.test.ts:68` — portent sur les gabarits et l'identité rendue, **pas** sur le défaut SQL, qu'aucune d'elles ne lit | 2026-09-03 @ ad53f14a |
| AFF-31 | Une garde interdit un identifiant d'immatriculation en dur dans le code d'axionia | **partielle** — constat sur le motif, sans verdict sur la garde | Le motif est `(SIREN\|SIRET)\s+[0-9]{9,14}` (`scripts/check-anti-siren.sh:9`) : il exige le mot en capitales **suivi d'espaces** puis de chiffres. Dans `src/lib/identite-legale-ssot.ts:70-72` la valeur est portée par une clé en minuscules suivie de deux points, elle n'est donc pas atteinte par ce motif. **Ce n'est pas une garde verte à tort** : son propre en-tête borne sa portée à l'avant-immatriculation — « vérifie qu'aucun vrai numéro SIREN n'est hardcodé hors URL avant l'immatriculation officielle » (`scripts/check-anti-siren.sh:2-4`). L'immatriculation étant acquise (W1), la SSOT qui porte le numéro est le cas prévu par l'en-tête, pas un cas oublié. Constat pour axionia : la garde n'a plus d'objet sous cette forme, à retirer ou à recibler — décision qui n'appartient pas à ce dépôt | 2026-09-03 @ ad53f14a |
| AFF-32 | Le tunnel de candidature reste dans axionia (hypothèse `HYP-E1-7`) | **vérifiée** | `axionia/src/app/[locale]/devenir-commercial-ia/candidature/page.tsx:38` monte l'assistant `src/components/forms/commercial-application/CommercialApplicationWizard.tsx`, qui importe la Server Action (`src/components/forms/commercial-application/CommercialApplicationWizard.tsx:17`) et l'appelle (`src/components/forms/commercial-application/CommercialApplicationWizard.tsx:189`). L'action elle-même est déclarée `src/features/commercial-application/actions.ts:173` et persiste `src/features/commercial-application/actions.ts:288-320` | 2026-09-03 @ ad53f14a |
| AFF-33 | Ce tunnel écrit dans un modèle dédié à la candidature | **FAUSSE** | `axionia/src/features/commercial-application/actions.ts:290-320` : il écrit une `Submission` de type `contact`, la nature réelle vivant dans le JSON `details` (`unifiedType: "recrutement"`, `subType: "candidature-commerciale"`), lu par un filtre de console. Aucun modèle dédié ; la règle RM-04 (une colonne de vocabulaire est un enum) n'y est pas tenue | 2026-09-03 @ ad53f14a |
| AFF-34 | Ce tunnel émet un événement que Partners pourrait consommer | **partielle** — il émet, mais pas vers Partners | Il émet : `src/features/commercial-application/actions.ts:22` importe `syncCandidateToCrm` depuis `@/server/crm-sync`, appelé à `src/features/commercial-application/actions.ts:382` avec `subjectRef: "site:submission:<id>"` et `family: "candidat_commercial"` ; côté canal, `syncCandidateToCrm` fait `dispatch("application_submitted", …)` (`src/server/crm-sync/index.ts:148`), donc une écriture d'outbox `CrmSyncOutbox` (`prisma/schema.prisma:10350`). C'est le **seul** flux d'événements réel qu'axionia produise. Ce que Partners ne peut pas consommer, c'est le type et l'enveloppe : liste fermée sur d'autres types (`AFF-17`), enveloppe snake_case sans émetteur ni numéro d'ordre (`AFF-18`), destination CRM tiers. Les deux autres sorties sont des mises en file d'e-mail (`src/features/commercial-application/actions.ts:528` et `src/features/commercial-application/actions.ts:541`) | 2026-09-03 @ ad53f14a |
| AFF-35 | Les coordonnées saisies par ce tunnel sont chiffrées au repos | **vérifiée** | `axionia/src/features/commercial-application/actions.ts:295-297` : `encryptPii` sur le nom, l'adresse e-mail et le téléphone | 2026-09-03 @ ad53f14a |
| AFF-36 | axionia n'expose que des Server Actions, pas d'API REST | **FAUSSE** | 55 fichiers `route.ts` sous `axionia/src/app/api/`, chacun exportant un gestionnaire HTTP — par exemple `src/app/api/docuseal/webhook/route.ts:38` (`export async function POST`) (`find src/app/api -name route.ts \| wc -l`), dont `src/app/api/docuseal/webhook/route.ts`, `src/app/api/calendly/webhook/route.ts`, `src/app/api/zeptomail/webhook/route.ts`, `src/app/api/internal/crm-webhook/route.ts`, `src/app/api/gdpr-export/route.ts` | 2026-09-03 @ ad53f14a |
| AFF-37 | L'encaissement par prestataire de paiement est actif chez axionia | **FAUSSE** | Le SDK subsiste (`src/lib/stripe.ts:1`), mais la route d'entrée, la création de session de paiement et les remboursements sont **supprimés** ; l'absence est verrouillée sur trois surfaces à la fois — code, en-tête de sécurité, notice de sous-traitance — par `src/lib/stripe-eteint.spec.ts:1-45`. Les encaissements réels se saisissent à la main (`src/server/qualiopi/financements/facture-libre.ts:563-578`) | 2026-09-03 @ ad53f14a |
| AFF-38 | La pile d'axionia est celle qu'annonce l'hypothèse `HYP-W5` | **vérifiée** | Le registre écrit, verbatim : « Next.js 16 + Prisma + Postgres 16 + Redis/BullMQ + Tailwind v4 (ADR-0001) » (`docs/DECISIONS.md:71`). Le relevé le confirme : `axionia/package.json:166` `next` en `16.3.1`, `package.json:173` et `package.json:127` `prisma` et `@prisma/client` en `^5.22.0`, `package.json:175` `react` en `19.2.8`, `package.json:168` `next-intl`, `package.json:154` `bullmq`, `package.json:224` `tailwindcss` en `^4`. **La formulation « Next 16.2 / Prisma 5.22 » n'est pas celle du registre** : aucune source lue du dépôt Partners ne la porte, et rendre un verdict contre elle aurait été juger une hypothèse que personne n'a écrite | 2026-09-03 @ ad53f14a |
| AFF-39 | Le patron de relevé mensuel gelé existe déjà chez axionia | **vérifiée** | `axionia/prisma/schema.prisma:5122-5158` : `TrainerStatement`, unicité `(trainerId, periodeYear, periodeMonth)`, statuts `StatementStatut` (`prisma/schema.prisma:5010-5022`), lignes rattachées dont le statut `valide` est décrit comme « figé dans un relevé validé, ne se recalcule plus » (`prisma/schema.prisma:4999-5008`) | 2026-09-03 @ ad53f14a |
| AFF-40 | Les conventions de nommage de `docs/CONVENTIONS.md` §1 sont déjà tenues chez axionia | **FAUSSE** | Elles le sont par endroits — `totalHtCents`, `tvaCents`, `totalTtcCents`, `montantHtCents`, `montantTtcCents`, `emiseAt`, `echeanceAt` — et pas ailleurs : `Payment.amountCents` (`prisma/schema.prisma:1574`), `paidAt`, `failedAt`, `receivedReference`, `isHistorical` sont en anglais. Le suffixe `…Cents` est tenu, la langue ne l'est pas | 2026-09-03 @ ad53f14a |
| AFF-41 | Le contrat de build sur hôte de remplacement existe et est documenté | **vérifiée** | `axionia/src/app/api/mcp/route.ts:28` et `src/app/api/mcp/route.ts:66` (l'échappée est en tête de gestionnaire, `HOTE_DE_BUILD = "stub.invalid"`), `src/app/api/admin/embeddings-health/route.ts:11`, décision `docs/adr/0026-build-externalisation-ghcr.md` | 2026-09-03 @ ad53f14a |
| AFF-45 | Le webhook Calendly d'axionia est un patron de réception réemployable pour `EvenementRecu` | **FAUSSE** | Il ne persiste rien et ne rejoue rien. `src/app/api/calendly/webhook/route.ts:89` vérifie la signature (`verifyCalendlySignature`, importé `src/app/api/calendly/webhook/route.ts:39`), puis le gestionnaire se contente de **relancer un sondage** : `discoverNewCalendlyEvents()` (`src/app/api/calendly/webhook/route.ts:131`) ou `refreshUpcomingCalendlyEvents()` (`src/app/api/calendly/webhook/route.ts:143`). Aucun modèle de réception : il n'existe pas de `CalendlyWebhookEvent` dans `prisma/schema.prisma` ; l'idempotence est portée par le modèle métier `CalendlyEvent.inviteeUri @unique` (`prisma/schema.prisma:4165`), pas par un journal d'événements reçus. Un échec de traitement répond `200` volontairement (`src/app/api/calendly/webhook/route.ts:149-154`) : le webhook est un **accélérateur** du sondage, jamais la source de vérité. Le patron réemployable est celui de `DocusealWebhookEvent` (`AFF-20`), qui persiste, déduplique et compte ses reprises. Émission vers le CRM tiers : `syncCalendlyEventToCrm` (`src/server/crm-sync/index.ts:99-109`), qui passe par la même outbox qu'`AFF-19` | 2026-09-03 @ ad53f14a |
| AFF-46 | Le score de candidature est enregistré avec la version du barème qui l'a produit | **FAUSSE** | Le score est calculé (`scoreCandidature(d)`, `src/features/commercial-application/actions.ts:286`, importé `src/features/commercial-application/actions.ts:32`) et ses trois faces sont écrites dans le JSON `details` de la `Submission` — `score`, `scorePriorite`, `scoreParts` (`src/features/commercial-application/actions.ts:306-308`). Aucune version, aucune empreinte du barème n'est écrite à côté : `SCORE_POIDS` (`src/lib/commercial-application/scoring.ts:28`) est une constante `as const` sans identifiant de version, et rien dans `src/lib/commercial-application/scoring.ts` ni dans `src/features/commercial-application/actions.ts` n'en calcule d'empreinte. Un score relu demain ne dit donc pas quel barème l'a produit. REQ-DM-035 exige côté Partners un `scoreBaremeVersion` (empreinte de `SCORE_POIDS`) : ce champ est à créer, il n'a pas d'antécédent à reprendre | 2026-09-03 @ ad53f14a |
| AFF-47 | La copie publique d'axionia interpole une valeur de rémunération d'apporteur dans un JSON-LD | **vérifiée** | `axionia/src/app/[locale]/memo-isere/page.tsx:690` : la clé `description` du JSON-LD `JobPosting` construit sa phrase avec un appel `commission(…)`, dans un objet `jobJsonLd` ouvert `src/app/[locale]/memo-isere/page.tsx:686`. C'est la ligne que la source de REQ-JUR-024 cite ; elle est ici datée et rattachée à un SHA, ce qu'une citation `chemin:ligne` nue ne permettait pas | 2026-09-03 @ ad53f14a |

---

## 3. Les trois affirmations que je n'ai pas pu vérifier

Elles ne sont pas « vérifiées ». Elles sont ouvertes, et voici ce qui manque pour les fermer.

| Repère | Affirmation | Pourquoi elle reste ouverte | Ce qu'il faudrait |
| --- | --- | --- | --- |
| AFF-42 | « Zéro ligne en base dans `payments` » (affirmé par `axionia/src/lib/stripe-eteint.spec.ts:8`) | Je lis des sources, pas une base. L'affirmation vit dans un commentaire de test, et aucun cas du fichier ne l'exerce : c'est une constatation d'audit datée du 2026-08-04, pas une garde | Un comptage lu sur la base de production, daté, ou un cas de test qui l'exerce et qui rougit s'il devient faux |
| AFF-43 | Le code vérifié ici est celui qui sert en production | Rien dans l'arbre ne dit quel commit est déployé ; l'en-tête de build n'est lisible que sur l'environnement servi | Lire l'en-tête `x-axion-build-sha` de l'environnement d'axionia et le confronter au commit `ad53f14a81f` |
| AFF-44 | Le contrat d'entrée du CRM tiers est le miroir exact de `src/server/crm-sync/types.ts` (affirmé `src/server/crm-sync/types.ts:1-8` et `src/server/crm-sync/types.ts:39-45`) | Le dépôt du CRM n'est pas sur ce poste. Le fichier prévient lui-même qu'aucun compilateur ne relie les deux dépôts et qu'un écart passé s'est soldé par un refus définitif côté outbox | Lire le fichier de contrat côté CRM et comparer les deux listes, ou faire porter la comparaison par une garde partagée |

---

## 4. Ce que ces verdicts changent pour le dossier de spécification

1. **Aucun contrat d'événements ne peut être dérivé d'axionia aujourd'hui.** Les onze types attendus par
   Partners n'existent pas (`AFF-16`), l'enveloppe est en snake_case et n'a ni émetteur ni numéro d'ordre
   (`AFF-18`). Ce que la spécification décrit comme une intégration est une **construction complète**, à faire
   côté axionia. Le patron à réemployer est celui de l'outbox de synchronisation (`AFF-19`) — qu'un flux réel
   emprunte déjà, celui de la candidature (`AFF-34`).
2. **Le rattachement d'un encaissement à un SIREN n'est pas garanti par la base.** Quatre maillons nullables
   séparent un encaissement d'un SIREN (`AFF-06`), et `Client.siren` n'est ni unique ni indexé (`AFF-08`). Toute
   règle de Partners qui suppose « un encaissement → un SIREN » doit prévoir le cas non résolu, et le rendre
   visible plutôt que de le combler par défaut.
3. **`Payment.amountCents` est du TTC.** Une ligne de commission calculée sur ce montant sans conversion serait
   assise sur une base incluant la taxe. La spécification impose des montants HT (`docs/CONVENTIONS.md` §3) :
   la conversion doit être explicite, et le régime de taxe de la facture lu en même temps
   (`FactureFormation.regimeTva`, `prisma/schema.prisma:6968`) — ce qui est exactement le cas que
   `HYP-E1-30` prévoit de bloquer.
4. **L'hypothèse `HYP-W6-BIS` désigne un champ qui n'existe pas** (`AFF-25`). Sa garde ne peut pas être écrite
   telle qu'elle est formulée. La reformulation à soumettre au `gardien-spec` : la garde porte sur
   `CommercialCommission.basisTierId`, dans le sens inverse de celui qui est écrit.
5. **Cinq patrons sont réellement réemployables** : l'émission fiable par outbox (`AFF-19`), la réception
   idempotente (`AFF-20`), le jeton haché révocable (`AFF-21`), l'index unique partiel en SQL brut (`AFF-23`)
   et le relevé mensuel gelé (`AFF-39`). Les réemployer, c'est les **dériver** avec leur source, pas les
   retaper (RM-01). Le sixième candidat, le webhook Calendly, n'en est pas un (`AFF-45`) : il ne persiste pas
   ce qu'il reçoit.
6. **L'unicité « un seul jeton actif » d'`HYP-C6` a déjà un patron, et il n'était pas là où on l'a cherché**
   (`AFF-22`). Elle s'écrit en SQL brut dans la migration, pas dans le schéma Prisma — deux index uniques
   partiels, l'un sur le parcours, l'autre sur le couple (parcours, rôle). Le contexte à double clé est le
   plus instructif pour Partners : la clé d'unicité se choisit avec le rôle du porteur du lien, sinon deux
   liens légitimes s'excluent. Rien de tout cela n'est à réinventer.
7. **Une garde d'axionia a perdu son objet, ce qui n'est pas la même chose qu'être verte à tort** (`AFF-31`).
   Son en-tête borne explicitement sa portée à l'avant-immatriculation ; depuis W1, le fichier qui porte le
   numéro est le cas prévu. Le constat utile pour Partners est le mécanisme, pas le verdict : un motif écrit
   pour une forme d'écriture (mot en capitales + espaces + chiffres) ne couvre pas la même valeur écrite sous
   une autre forme (clé en minuscules + deux points). Une garde qui ne tient que dans une forme d'écriture ne
   garde pas une valeur.
8. **Le snapshot de score de REQ-DM-035 n'a pas d'antécédent** (`AFF-46`). axionia écrit le score et son
   détail, jamais la version du barème. Le champ `scoreBaremeVersion` est à créer côté Partners, et c'est
   lui qui rendra un score relu explicable ; sans lui, un barème modifié réécrit silencieusement le sens de
   toutes les candidatures passées.

---

## 5. Refaire la vérification

Les commandes ci-dessous se lancent **depuis la racine d'axionia**. Elles ne rejouent pas tout : elles
rejouent les repères nommés en regard de chacune. Une affirmation qui change de verdict est une ligne à
corriger ici, avec une nouvelle date **et un nouveau SHA**.

```sh
# Le commit contre lequel les lignes sont datées (AFF-43)
git rev-parse HEAD

# AFF-01, AFF-02, AFF-03
grep -n '^model Invoice\|^model Refund\|^model PaymentScheduleProfile' prisma/schema.prisma

# AFF-03, AFF-05
grep -rn 'payerSiret\|PaymentScheduleProfile' prisma/ src/

# AFF-13, AFF-14, AFF-15
grep -rn 'payment\.received\|devis\.signed\|refund\.issued' src/ prisma/

# AFF-04
grep -n 'amountCents' src/server/qualiopi/financements/facture-libre.ts

# AFF-06, AFF-08, AFF-09
grep -n 'siren\|siret' prisma/schema.prisma

# AFF-22, AFF-23 — LE BLOC SQL BRUT, PAS LE BLOC GÉNÉRÉ PAR PRISMA
grep -rn 'emargement_tokens' prisma/migrations/
grep -rn -A2 'CREATE UNIQUE INDEX' prisma/migrations/ | grep -i 'where'

# AFF-24, AFF-25, AFF-26
grep -n 'commissionId\|COMMERCIAL_COMMISSIONS\|basisTierId' src/content/pricing.ts

# AFF-28
ls scripts/partners 2>&1

# AFF-30 — le défaut de colonne vit dans les migrations, pas dans le schéma
grep -rn 'OÜ' prisma/migrations/ prisma/schema.prisma src/

# AFF-31
sed -n '1,20p' scripts/check-anti-siren.sh

# AFF-34
grep -n 'syncCandidateToCrm' src/features/commercial-application/actions.ts src/server/crm-sync/index.ts

# AFF-36
find src/app/api -name route.ts | wc -l

# AFF-40
grep -n 'amountCents\|paidAt\|failedAt\|isHistorical' prisma/schema.prisma

# AFF-45
grep -rn 'CalendlyWebhookEvent\|inviteeUri' prisma/schema.prisma
grep -n 'discoverNewCalendlyEvents\|refreshUpcomingCalendlyEvents' src/app/api/calendly/webhook/route.ts

# AFF-46
grep -n 'scoreCandidature\|scoreParts\|SCORE_POIDS' src/features/commercial-application/actions.ts src/lib/commercial-application/scoring.ts

# AFF-47
sed -n '686,695p' 'src/app/[locale]/memo-isere/page.tsx'
```

Côté Partners, `pnpm gov:sonde` rejoue automatiquement la part de ce tableau qui est réductible à une
recherche exacte, dès lors que le dépôt voisin est accessible ; `pnpm gov:sonde --exiger-axionia` refuse de
passer au vert quand il ne l'est pas.

> **Tenue à jour.** Ce fichier est daté, pas permanent : il dit ce que le code d'axionia portait au commit
> `ad53f14a81f` le 2026-09-03. Toute tâche qui s'appuie sur une de ces lignes cite son repère `AFF-nn` et
> **revérifie** si le commit d'axionia a changé. Un verdict recopié sans revérification est exactement la
> faute que cette tâche corrige.

---

## 6. Ce que REQ-GOV-004 exige en plus de ce tableau, et où c'est livré

Le texte de l'exigence porte trois obligations. Aucune n'est satisfaite par le seul tableau §2.

| Obligation de REQ-GOV-004 | Où elle est tenue |
| --- | --- |
| « une colonne "vérifié le" non vide (chemin, ligne, date, SHA) » | La cinquième colonne du tableau §2, forme `AAAA-MM-JJ @ <SHA court>`, et la colonne de preuve, qui porte le `chemin:ligne`. Contrôlées par les familles `date_ou_sha_manquant` et `preuve_sans_ancre` de `pnpm gov:sonde` |
| « `pnpm gov:check` rougit si une source de type code a la colonne vide » | `gov:sonde` est enchaînée dans `pnpm gov:check` (`package.json`). Sa famille `source_axionia_sans_repere` refuse toute source de `docs/requirements.json` ou `docs/tasks.json` qui **localise** une affirmation dans du code (`chemin.ext:ligne`) sans être couverte par un repère `AFF-nn` du tableau §2. La seule source du registre dans ce cas au 2026-09-03 — celle de REQ-JUR-024, `memo-isere/page.tsx:690` — est couverte par `AFF-47` |
| « les affirmations invalidées … figurent dans `docs/DECISIONS-INDEX.md` avec la mention FAUSSE et la réalité constatée, et un test vérifie la présence de ces cinq entrées » | `docs/DECISIONS.md` §6 — c'est le même fichier, et ce n'est pas une interprétation : l'acceptation de **GOV-005**, la tâche qui porte REQ-GOV-003, l'écrit — « livrable `docs/DECISIONS.md` (= `DECISIONS-INDEX.md` de REQ-GOV-003, un seul nom) » (`docs/TASKS.md:106`). Le test est `tests/unit/gouvernance/affirmations-verifiees.spec.ts` ; la famille `invalidee_absente_du_registre` de `gov:sonde` tient la même règle en CI |

⚠️ **`docs/DECISIONS.md` est un fichier réservé** (`docs/CONVENTIONS.md` §8 : écrivain `gardien-spec`, lot
dédié). GOV-004 **fournit** le contenu de sa §6 et le contrôle qui la garde ; l'écriture au dépôt passe par
le `gardien-spec`. Un développeur qui trouverait la §6 absente ne la réécrit pas : il rend `stop` et
réclame le relais, sinon les deux fichiers divergent et la garde rougit sans que personne sache pour qui.

Ce qui reste **hors** du périmètre de GOV-004, et qui appartient au registre lui-même : toute source de
`docs/requirements.json` qui **désigne** un fichier d'axionia sans donner de ligne. Aucun compte n'est écrit
ici : un total recopié à la main redevient faux à la première exigence ajoutée, sans que rien ne le signale.
Trois exemples, donnés comme tels et non comme une liste close — `src/env.ts` (REQ-SEC-028), `src/proxy.ts`
(REQ-SEC-029), `scripts/check-anti-siren.sh` (REQ-GOV-029).
Ce sont des **désignations de patron**, pas des affirmations localisées : elles ne portent aucun fait à
démentir, donc rien à dater. Si l'une d'elles devient une affirmation — le jour où une exigence dira ce que
le fichier contient, et à quelle ligne — elle tombe sous la famille `source_axionia_sans_repere` et exige
son repère `AFF-nn`. La garde est écrite pour attraper ce basculement.
