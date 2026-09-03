# Registre des décisions — Axion Partners

> **Rôle de ce fichier** : chaque décision du projet y a une ligne. Soit elle est **tranchée**, soit elle
> porte une **hypothèse par défaut datée** que les agents codent en attendant. Une décision qui n'est ni
> l'un ni l'autre **arrête l'autopilote** : le développeur rend `stop`, il ne devine pas.
>
> **Réversibilité** — c'est la colonne qui décide *à quel coût* on revient sur la décision :
> `paramètre` (modifiable en base, on peut attendre) · `migration` (coût technique, à trancher avant la
> phase concernée) · **`avenant`** (touche le contrat signé → chaque changement postérieur impose une
> campagne de re-signature à tout le réseau).
>
> **`À trancher avant`** — c'est la colonne qui décide *quand*. Elle est **distincte** de la phase de mise
> en œuvre : une ligne `avenant` porte toujours « premier DocuSeal », même si son code n'est écrit qu'en
> phase 2. Un autopilote qui lit la colonne « Phase de mise en œuvre » pour savoir quand demander une
> décision se trompe de colonne.
>
> **`Tranchée`** — date ISO de l'arbitrage de Will, ou `—`. C'est la seule marque lisible par un test :
> `decisions-ouvertes.spec.ts` rougit tant qu'une ligne `avenant` porte `—` dans cette colonne. Les
> mentions en prose (« ✅ tranchée … » collé à un identifiant) ne sont pas des marques : elles n'ont
> jamais pu faire rougir quoi que ce soit.
>
> Gate `gov:identifiants` : tout code ou ADR citant un identifiant absent de ce fichier rougit.
> Généré et tenu par le gardien du spec (tâche GOV-005). Dernière mise à jour : 2026-09-03.

## 0. Identifiants d'origine → identifiant canonique

Les relecteurs ont nommé certaines décisions autrement que ce registre. Ces noms survivent dans
`docs/tasks.json` (champ `hyp`) et dans les documents sources. Le tableau ci-dessous les résout.
Il est **lu par `pnpm gov:tasks`** : une tâche qui repose sur un identifiant absent d'ici *et* absent
des sections 1 et 2 fait rougir la garde. Chaque correspondance était déjà écrite en prose dans la
ligne canonique — ce tableau ne décide rien, il rend lisible par la machine ce qui ne l'était que
par un lecteur attentif.

| Identifiant cité | Canonique | Où la correspondance est écrite |
| --- | --- | --- |
| `W2` | `HYP-W2` | §2, ligne « Banque réceptrice du SEPA » |
| `W5` | `HYP-W5` | §2, ligne « Stack » |
| `W7` | `HYP-W7` | §2, ligne « Signal *déjà travaillée* » |
| `HYP-BEB-D2` | `HYP-W5` | §2 — « absorbe `HYP-BEB-D2`, l'identifiant cité par GOV-009 » |
| `HYP-W6` | `HYP-W6-BIS` | §2 — « absorbe […] l'orthographe `HYP-W6` » |
| `DEC-BEB-A12` | `HYP-W6-BIS` | §2 — « absorbe `DEC-BEB-A12` […] cité par DM-03-A » |
| `DEC-DM-013` | `HYP-E1-7` | §2 — « absorbe `DEC-DM-013` et `DEC-INT-010` » |
| `DEC-INT-010` | `HYP-E1-7` | §2 — même ligne |
| `DEC-INT-002` | `W3` | §1 — « Sous-domaine d'envoi dédié […] aligné DMARC (`DEC-INT-002`) » |
| `DEC-INT-004` | `EXT-2a` | §1 — « identifiant d'origine `DEC-INT-004` (E.3-5) » |
| `DEC-ABUS-C12` | `HYP-C12` | §2 — « absorbe `DEC-ABUS-C12`, l'identifiant cité par DM-10-A » |

## 1. Sans valeur par défaut possible — bloquent le code

| Id | Décision | Pourquoi aucune hypothèse | Phase bloquée | Propriétaire |
| --- | --- | --- | --- | --- |
| **W1** ✅ *tranchée 2026-09-03* | Entité qui signe et qui paie | **AXION IA SAS** — SIREN `108018631`, SIRET `10801863100011`, TVA `FR51108018631`, 11 Avenue Paul Verlaine, ELITE BUREAUX boîte 53, 38100 Grenoble (source : `src/lib/identite-legale-ssot.ts`). ⚠️ **Axion-IA OÜ n'existe plus** : toute mention est à retirer du dossier. Reste l'**IBAN débiteur**, nécessaire en phase 2 seulement, à poser en secret — jamais dans une conversation | — | −1 |
| **W3** ✅ *tranchée 2026-09-03* | Domaine servi et domaine d'envoi | **`apporteurs.axion-ia.com`** pour l'espace — le mot colle au vocabulaire du contrat, ce qui sert la cohérence d'ensemble. Sous-domaine d'envoi dédié pour les e-mails, aligné DMARC (`DEC-INT-002`). **Aucune perte de trafic** : l'espace est authentifié donc `noindex` par nature, et la seule page qui capte du trafic — `/devenir-commercial-ia` — reste sur `axion-ia.com` | migration | −1 |
| **W4** ✅ *tranchée 2026-09-03* | Têtes de réseau | **Un apporteur = une personne**, qui peut exercer via une structure (EURL, SASU, micro-entreprise) : le SIREN du KYC est celui de sa société, cela ne change pas le modèle. Un compte, un contrat, une grille par personne. **La tâche DM-22 (`Structure` + `Utilisateur`) est supprimée** (−1,5 j) | — | −1 |
| **W6** ✅ *tranchée 2026-09-03* | Périmètre commissionné (réversibilité **avenant** — la grille est l'annexe 1 du contrat) | **Quatre familles commissionnées** : formations collectives, accompagnement 1-to-1, audits, implémentations — **30 paliers**. **Cinq familles NON commissionnées, écrites dans l'annexe** : développement web, maintenance, coaching récurrent, conférences, interventions sur demande. La dégressivité des gros programmes se règle par un taux plus bas au palier, pas par une règle | 0 (tranchée) | Will |
| **W9** ✅ *tranchée 2026-09-03* | Prolongation de la fenêtre | **OUI.** Lorsqu'un devis est **en cours** au terme des 12 mois, l'attribution est prolongée de **3 mois, une seule fois, automatiquement**, les deux parties étant informées. La prolongation est journalisée et visible dans la fiche. L'exception est étroite et vérifiable : le devis en cours est la preuve que l'affaire est réelle, ce qui évite d'affaiblir la borne des 12 mois (protection contre le portefeuille permanent). Variable `{{PROLONGATION_DEVIS}}` = oui, art. 3.4 al. 4 conservé | **avenant** | 1 |
| **W11** ✅ *tranchée 2026-09-03* | Arrêter le contrat v1 | **Figé par Will.** `CONTRAT-APPORTEUR-V1.md` — 23 articles, 23 identifiants `CL-*`, annexe 1 à 30 paliers, annexe 2 mandat d'autofacturation. Il reste à **remplir** : les variables `{{SOCIETE}}`… depuis W1, les 30 montants de l'annexe 1 (`W6-a`), et l'alinéa 3.4 selon W9 | **avenant** | 1 |
| **W12** ✅ *tranchée 2026-09-03* | Plancher de la grille | La grille d'un contrat **peut** descendre sous la grille publiée ; en contrepartie la **page publique passe en formulation indicative** (tâche JUR-T29) et chaque écart porte un **motif obligatoire** | 0 (tranchée) | Will |
| **W13** ✅ *tranchée 2026-09-03* | Dépôt et publication | Dépôt **`will383842/axion-apporteurs`, PUBLIC** (décision de Will : les minutes d'Actions y sont illimitées). ⚠️ **Public ne signifie pas tout publier** : trois catégories restent **hors dépôt** (`REQ-GOV-031`, garde `pnpm gov:publication`) — (a) les **notes d'analyse juridique** et tout commentaire expliquant le *pourquoi* d'une règle relationnelle ; (b) tous les **seuils de détection d'abus** (signaux, quotas, fenêtres) — publiés, ils indiquent comment rester en dessous ; (c) les **montants de la grille** et l'économie du réseau. Ces valeurs vivent en configuration ou en base, jamais dans un fichier versionné | migration | −1 |
| **EXT-2a** | Format d'import comptable TIIME (FEC / CSV / API) — identifiant d'origine `DEC-INT-004` (E.3-5) | Aucun défaut possible : le format dépend de ce que TIIME accepte, non d'un choix interne. Un défaut inventé produirait un export qu'aucun import ne relit | 2 (avant T-ARG-030) | Expert-comptable **ou Will** |

> `EXT-2` **n'est plus dans cette section** : ses questions ont toutes un défaut dans le registre
> (`HYP-D9`, `HYP-E1-30`, `HYP-D7`). Elle est descendue en §2. Une ligne ne peut pas être à la fois
> « bloque le code » et « prend les défauts du registre » — c'était la contradiction relevée le 2026-09-03.

## 2. Hypothèses par défaut — le code avance

| Id | Décision | Hypothèse appliquée | Réversibilité | Phase de mise en œuvre | À trancher avant | Tranchée |
| --- | --- | --- | --- | --- | --- | --- |
| HYP-W2 | Banque réceptrice du SEPA | Générateur `pain.001.001.03` générique + **saisie manuelle avec EndToEndId** ; la banque ne gate que le mois à blanc | paramètre | 2 | armement SEPA | — |
| HYP-W5 | Stack (absorbe `HYP-BEB-D2`, l'identifiant cité par GOV-009) | Next.js 16 + Prisma + Postgres 16 + Redis/BullMQ + Tailwind v4 (ADR-0001) | — | −1 | sortie de phase −1 | — |
| HYP-W7 | Signal « déjà travaillée » | L'écran Vérifier distingue `libre` de `libre_deja_travaillee` — **sans** identité, **sans** date précise, **sans** résultat ; un signal (jamais un refus) s'ouvre lorsque la part de dépôts sur des entreprises déjà travaillées dépasse le seuil de configuration | paramètre | 1 | — | — |
| HYP-D3 | Seuil de dépôt | `seuilPrioritaire = min(palierConfiance, capaciteRestante)` ; `surchargeManuelle > 0` remplace le min ; **une seule fonction pure** ; jamais un plafond | paramètre | 1 | — | — |
| HYP-C1 | Naissance de l'attribution | **Provisoire** jusqu'à confirmation par l'entreprise lors de la qualification | **avenant** | 1 | **premier DocuSeal** | — |
| HYP-C4 | Collision sur un SIREN | File d'attente, **maximum 2**, promotion automatique | paramètre | 1 | — | — |
| HYP-C6 | Identifiants | Code public de parrainage ≠ **jeton de dépôt privé** (hash en base, révocable, un seul actif) | migration | 1 | — | — |
| HYP-E1-9 | Départ des 12 mois | `fenetreFinAt = confirmeeAt + 12 mois` ; aucune fenêtre tant que non confirmée ; **art. 3.4** du gabarit écrit ainsi | **avenant** | 1 | **premier DocuSeal** | — |
| HYP-E1-10 | Entrée « Vérifier une entreprise » | **Un seul champ Entreprise sur `/`**, résultat sur `/entreprise?q=`, barre à quatre onglets (Accueil · Mes entreprises · Mes commissions · Plus) | paramètre | 0 | — | — |
| HYP-E1-11 | Dépôts au-delà de 30 en 24 h | **Captcha, jamais de refus** : le dépôt supplémentaire est accepté, horodaté et opposable (REQ-DM-010, issue `captcha` de REQ-UX-002) | paramètre | 1 | — | — |
| HYP-E1-12 | Dépôt hors-ligne | Horodaté **à la réception** par le serveur, affiché comme tel ; base contractuelle = **art. 3.5 al. 4** du gabarit (convention de preuve) | **avenant** | 1 | **premier DocuSeal** | — |
| HYP-E1-14 | Friction sur le changement de RIB | **Un seul mécanisme, celui du KYC** : le nouveau RIB est une `PieceKyc` `a_verifier`, step-up exigé, IBAN masqué, notification à l'ancienne adresse et à l'ancien numéro, alerte console ; ligne `bloquee` motif `rib_a_verifier` si le RIB n'est pas `valide` à la date du relevé. **Ni carence 72 h, ni verrou 7 j** (arbitrage REQ-SEC-025 / REQ-UX-027) | paramètre | 2 | — | — |
| HYP-C9 | Entreprises à 0 salarié | **Signal**, jamais un rejet | paramètre | 1 | — | — |
| HYP-C12 | Antériorité d'Axion-IA (absorbe `DEC-ABUS-C12`, l'identifiant cité par DM-10-A) | Client · devis < 6 mois · formulaire/Calendly < 90 j · fenêtre 180 j | paramètre | 1 | — | — |
| HYP-D7 | Attestation de vigilance | **Bloqué par défaut** : aucun versement sans attestation valide, quel que soit le cumul ; le seuil de 5 000 € ne sert qu'au rappel J-15 et à la DAS2 | paramètre | 2 | — | — |
| HYP-D9 | Autofacturation | Oui dès la V1, mandat dans le contrat, série par apporteur ; seuil DAS2 = paramètre (2 400 €, à confirmer avec l'expert-comptable) | **avenant** | 2 | **premier DocuSeal** | — |
| **HYP-D11** | Sortie de collaboration | **Aucune déchéance** : les lignes `acquise` sont payées au dernier relevé sans le seuil de versement minimal (`HYP-E1-17`), les lignes `prevue` suivent la règle ordinaire du contrat art. 12.3. **Aucun barème de sanctions graduées, aucun compteur, aucun « contradictoire »** : la suspension est une mesure de vérification à motifs fermés (`non_confirme`, `fraude`), la résiliation une décision humaine motivée avec préavis. La valeur `dechue` est retirée de l'enum | **avenant** | 1 | **premier DocuSeal** | **2026-09-03** |
| HYP-D12 | Notifications apporteurs | E-mail + push PWA en V1 ; Telegram/SMS en V2 | paramètre | 3 | — | — |
| HYP-D14 | Bonus de parrainage | Un forfait (montant en configuration, `{{BONUS_FILLEUL}}`) dû à la **première ligne acquise** du filleul, jamais à l'inscription. ⚠️ **Aucune base contractuelle aujourd'hui** : l'art. 4.6 affirme l'inverse (« Aucune somme n'est due au titre de l'inscription elle-même » et ne prévoit pas ce forfait). À trancher avec W11 : soit le bonus est écrit au 4.6 (`{{BONUS_FILLEUL}}`), soit cette ligne est retirée | **avenant** | 2 | **premier DocuSeal** | — |
| HYP-E1-7 | Frontière candidature (absorbe `DEC-DM-013` et `DEC-INT-010`, les identifiants cités par DM-06 et INT-T21-P) | Le tunnel **reste dans axionia** en V1 ; axionia émet `candidature.recue` ; migration = V2. Backfill : clients avec SIREN et devis signés depuis le 2026-08-13, **aucun** `paiement.recu` antérieur | paramètre | 0 | — | — |
| HYP-E1-5 | Hébergement | Serveur Coolify **dédié** ; previews ≤ 2 simultanées, TTL 48 h ; RPO/RTO 1 h ; sauvegardes R2 préfixe `partners/` — coût soumis à Will | migration | 0 | — | — |
| HYP-E1-13 | Producteur axionia | **Un seul auteur** (poste A08) pour toutes les PR axionia du chantier ; créneau annoncé, runbook suivi | — | 0 | — | — |
| HYP-E1-15 | Session de l'espace | **30 jours** (la sécurité prime sur le confort) | paramètre | 0 | — | — |
| HYP-E1-17 | Dernier relevé d'un résilié | Versé **sans** le seuil de versement minimal | paramètre | 2 | — | — |
| HYP-E1-19 | Parrainage — taux, propagation et fenêtre | Taux versionné (valeur en configuration), appliqué aux lignes `commission` **et** `reprise` du filleul (même méthode d'arrondi) ; fenêtre = `contratFilleulSigneAt + 12 mois`, éligibilité mesurée sur `dateRef` ; profondeur 1, jamais de ligne pour le parrain du parrain (REQ-DM-023) | **avenant** | 2 | **premier DocuSeal** | — |
| HYP-E1-22 | Ligne acquise bloquée par le KYC | Conservée **sans limite de durée**, rappel mensuel, **aucune déchéance automatique** ; le versement reste dû tant que le KYC peut être complété. Base contractuelle : art. 5.4 du gabarit (« les sommes dont le versement est différé demeurent acquises à l'Apporteur ») | **avenant** | 1 | **premier DocuSeal** | — |
| HYP-E1-24 | Secrets et rotation | Sept secrets distincts + `IP_HASH_SALT`, ≥ 32 octets, validés par Zod au boot, `kid` dans les jetons ; **double clé acceptée pendant 24 h** à la rotation, déclenchée par Will (REQ-SEC-028, REQ-QA-030) | — | −1 | — | — |
| HYP-E1-25 | SLO de visibilité d'un événement | **Pas d'engagement « visible sous 1 min » en V1** : la réconciliation sous 24 h fait foi ; les métriques SLA 48 h p50/p95 sont calculées à la lecture, jamais stockées en double (REQ-QA-025) | paramètre | 2 | — | — |
| HYP-E1-26 | Retour arrière | **Aucun rollback automatique** : un `readyz` 503 laisse l'ancien container servi (REQ-QA-019) ; le retour arrière est déclenché à la main par le runbook `workflow_dispatch` et vérifié sur `x-partners-build-sha` (REQ-QA-022) | — | 0 | — | — |
| HYP-E1-27 | Dépôt et image | ⚠️ **Renversée par W13** (tranchée le 2026-09-03) : le dépôt est **`will383842/axion-apporteurs`, PUBLIC**. Ce qui subsiste de cette ligne : l'**image GHCR reste privée** (Coolify tire avec un PAT `read:packages`). Gate `gov:depot-visibilite` | migration | −1 | — | — |
| HYP-E1-30 | TVA inattendue sur une facture | `regimeTva ≠ assujetti` ou `montantTtcCents` null → ligne `bloquee` (`regime_tva_inattendu` / `ttc_manquant`) + alerte ; **jamais de repli HT = TTC** | paramètre | 2 | — | — |
| HYP-E1-31 | « Mes filleuls » | Gains de parrainage **agrégés par mois**, jamais montant par filleul (REQ-UX-006) | paramètre | 2 | — | — |
| HYP-E1-33 | File de fusion | GitHub Merge Queue natif si disponible ; sinon sérialisation par le script de lot | — | −1 | — | — |
| HYP-W6-BIS | Grille, en attendant W6 (absorbe `DEC-BEB-A12` et l'orthographe `HYP-W6`, les identifiants cités par DM-03-A et par `GATES.md` — l'identifiant canonique est `HYP-W6-BIS`) | Toute ligne de `PRICING_CATEGORIES` sans `commissionId` → `bareme_indefini` bloquant + alerte au boot ; une journée valorisée au-dessus du plafond de configuration → `bloquee` motif `plafond` | paramètre | 0 | — | — |
| HYP-QUALIOPI | Discours financement | Formulation SSOT = phrase validée par Will le 2026-08-19 ; **gate lexicale inconditionnelle** (ne lit aucun drapeau) sur « prise en charge à 100 % », « financé par Qualiopi », « sans avance de frais », « Qualiopi » nu | — | 0 | — | — |
| HYP-TENANT | Multi-tenant | **Mono-tenant** en V1, aucune colonne tenant (ADR-0002) | migration | −1 | — | — |
| HYP-RESIDENCE | Résidence fiscale | **Française obligatoire** (SIRET FR actif), refus fermé au KYC. ⚠️ **Aucune stipulation contractuelle ne la porte** aujourd'hui, alors que REQ-CPL-004 refuse en dur un SIRET non français. Deux issues, au choix de Will : ajouter à l'art. 6.1 « L'Apporteur exerce depuis un établissement immatriculé en France (SIRET actif) », ou ramener cette ligne à `paramètre` et assouplir REQ-CPL-004 | **avenant** | 1 | **premier DocuSeal** | — |
| HYP-ORACLE | « Déjà cliente » vs « déjà suivie » | 4 états `{libre, suivie_place_disponible, suivie_file_complete, non_disponible}` ; **aucune clé ne distingue** cliente de suivie | paramètre | 1 | — | — |
| HYP-RGPD-RETENTION | Durées de conservation des coordonnées du tiers rencontré | `CONTACT_PURGE_APRES_LIBERATION_JOURS` = **90** (états `invalidee`/`perdue`/`expiree`/`perimee`) et `CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS` = **1 095**, dans `retention.ts` ; un test HYP échoue si l'une des deux valeurs change (REQ-SEC-030) | paramètre | 1 | — | — |
| HYP-JUR-PROF-REGLEMENTEES | Professions réglementées au KYC | **Signal bloquant** « attestation spécifique requise » sur les codes NAF **69.20Z, 66.19B, 66.22Z** ; enum `ProfessionReglementee` typé ; la liste vit sous ce marqueur avec un test qui échoue si elle change, jusqu'à la décision de Will consignée ici (REQ-JUR-022). La couverture contractuelle est l'art. 23 du gabarit (déclarations de l'Apporteur) | paramètre | 1 | — | — |
| DEC-INT-001 | Instance DocuSeal (E.1-23) | **Instance dédiée** à Partners, non partagée avec axionia : une seule URL de webhook à gérer, aucun relais par `metadata.kind`, aucun risque de fuite croisée de gabarit | migration | 0 | — | — |
| EXT-2 | Autofacturation et fiscalité : mentions du mandat, procédure d'acceptation, seuil DAS2 2026, TVA franchise/assujetti, règle de reprise | Les défauts du registre s'appliquent et le code avance : `HYP-D9` (mandat au contrat, série par apporteur, seuil DAS2 2 400 €), `HYP-E1-30` (TVA inattendue → ligne `bloquee`, jamais de repli), `HYP-D7` (vigilance bloquante). Relecture par un expert-comptable **s'il y en a un** ; sinon les défauts restent et deviennent la décision de Will | paramètre | 2 | armement SEPA | — |
| **W10** | Extraction de CV (arbitrage `EXT-1bis`) | **Aide à la lecture** : extrait des faits vers les champs du formulaire, chacun modifiable ; rien enregistré sans validation humaine ; **aucun score, aucun rang, aucun avis de compatibilité**. Le score reste la fonction déterministe à barème publié, qui oriente et ne rejette jamais. ⚠️ **Drapeau `CV_EXTRACTION_ENABLED` fermé et le restant** : son ouverture est une décision ultérieure de Will, consignée ici et datée en base (`CV_EXTRACTION_AUTORISEE_LE`, sous step-up). La saisie manuelle absorbe 30 à 60 candidatures/semaine | paramètre | 3 | — | **2026-09-03** |

## 3. Décisions déjà actées dans les documents sources

Les décisions **A1–A16** (`audit-attribution-apporteurs-siren.md` §8), **B1–B13**
(`tableaux-de-bord-apporteurs.md` §8), **C1–C15** (`audit-anti-abus-reseau-apporteurs.md` §7) et
**D1–D17** (`audit-outil-apporteurs-bout-en-bout-2026-09-03.md` §11) sont retenues telles quelles, **sauf**
celles reprises ci-dessus. En cas de contradiction entre un document et ce registre, **ce registre prévaut**.

## 4. Ce qui change quand Will tranche

1. Le gardien du spec écrit la **date ISO dans la colonne `Tranchée`** et déplace, s'il y a lieu, la ligne
   de la section 2 vers la section 1 (ou l'inverse).
2. Si la décision était marquée `avenant` et que des contrats sont déjà signés : une tâche de campagne de
   re-signature (INT-T23) est créée **avant** toute autre. C'est précisément ce que la colonne
   `À trancher avant` sert à éviter.
3. `pnpm plan-state:build` recalcule les questions ouvertes ; l'autopilote peut reprendre.

## 5. Ce que ce registre NE contient pas, et pourquoi

- **Aucune ligne `avocat` ni `DPO`** : il n'y a pas d'avocat sur le projet (acté le 2026-09-03, plan §0.2).
  Les questions juridiques sont arbitrées par Will, option conservatrice par défaut. Une tâche qui attend
  un « avis d'avocat » est une tâche inéligible à vie.
- **Aucune valeur par défaut pour W1, W3, W4, W9 et W11** : ce sont les cinq décisions que rien ne peut
  remplacer (W6, W10 et W12 l'étaient aussi jusqu'au 2026-09-03, où Will les a tranchées).
- **Aucun barème de sanctions, aucune déchéance, aucun compteur de gradation** : retirés du produit le
  2026-09-03 (`HYP-D11`). Le vocabulaire disciplinaire (sanction, faute grave, contradictoire,
  avertissement) n'a plus de ligne ici et n'en aura pas.
