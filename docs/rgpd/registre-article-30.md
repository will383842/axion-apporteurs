# Registre des activités de traitement — article 30 du RGPD

> Livré par JUR-T04 (REQ-SEC-030, REQ-JUR-009, REQ-JUR-025, REQ-CPL-009). Test :
> `tests/unit/juridique/registre-rgpd.spec.ts`.
>
> **Règle d'écriture.** Aucun fait sans source. Chaque rubrique cite ce qui la fonde : une exigence de
> `docs/requirements.json`, une ligne de `docs/DECISIONS.md`, un article du gabarit de contrat
> (`docs/contrat/CONTRAT-APPORTEUR-V1.md`), une table du schéma, une fiche tiers. Ce qu'aucune source
> ne porte s'écrit « À compléter — source manquante », suivi de la question posée à Will. Ce n'est
> jamais une valeur plausible. Le test rougit sur une source citée qui n'existe pas, et sur un manque
> déclaré sans sa question.
>
> **Dérivé, jamais recopié (RM-01).** La section 3 est confrontée à `prisma/schema.prisma` à chaque
> exécution du test : une table ajoutée au schéma sans ligne ici fait rougir le test, une ligne ici
> sans table au schéma aussi.
>
> **État : projet.** Ce registre est tenu par écrit, il n'est pas encore opposable : il attend les
> réponses de la section 5 et la signature de l'analyse d'impact (`docs/rgpd/aipd.md`).

## 1. Responsable du traitement

| Rubrique | Contenu | Sources |
| --- | --- | --- |
| Responsable du traitement | L'entité qui signe et qui paie, arrêtée par la décision W1. Sa dénomination, sa forme, ses identifiants et son siège se lisent dans `config/entite.json` (clés `entite.*`), seule source de ces valeurs : ils ne sont pas recopiés ici. La Société est responsable du traitement des coordonnées transmises par l'apporteur | W1 · config/entite.json · contrat art. 7.2 |
| Représentant légal | À compléter — source manquante. Question : qui représente l'entité, et en quelle qualité ? La variable du représentant du gabarit de contrat attend elle aussi cette décision | src/domain/contrat/variables.ts |
| Délégué à la protection des données | Aucun délégué n'est désigné sur le projet (décision du 2026-09-03, rappelée par l'exigence) | REQ-SEC-030 |
| Contact pour l'exercice des droits | L'adresse indiquée en tête du contrat, c'est-à-dire le siège lu dans `config/entite.json`. Adresse électronique : À compléter — source manquante. Question : quelle adresse électronique publier pour l'exercice des droits ? | contrat art. 7.4 · config/entite.json |
| Découpage en traitements | Trois traitements, tels que REQ-SEC-030 en fixe le nombre. Le découpage lui-même : À compléter — source manquante. Question : Will valide-t-il ce découpage — relation avec les apporteurs, coordonnées du tiers rencontré, comptes de la console — qu'aucune source n'énumère ? | REQ-SEC-030 |

## 2. Les trois traitements

### TRT-APPORTEURS — Relation avec les apporteurs d'affaires, de la candidature à la fin du contrat

| Rubrique | Contenu | Sources |
| --- | --- | --- |
| Finalité | Recevoir la candidature transmise par axionia ; conclure et exécuter le contrat d'apporteur — espace personnel, déclaration des entreprises et attribution, rémunération, facturation et paiement, obligations légales de l'apporteur | HYP-E1-7 · REQ-DM-035 · contrat art. 1 · contrat art. 3 · contrat art. 4 · contrat art. 5 · contrat art. 6 |
| Base légale | À compléter — source manquante. Question : quelle base de l'article 6 du RGPD Will retient-il pour chaque finalité — exécution du contrat et mesures précontractuelles pour la candidature et le contrat, obligation légale pour la conservation des pièces et la vigilance, ou une autre ? Aucune exigence ni décision ne l'écrit, alors que la politique de confidentialité doit l'afficher | REQ-JUR-025 |
| Personnes concernées | Les candidats ; les apporteurs, un apporteur étant une personne, qui peut exercer via une structure ; les personnes qui agissent pour le compte d'un apporteur et que celui-ci déclare (associés, préposés, sous-traitants) | W4 · REQ-EXT-014 · table `apporteurs` · contrat art. 2.6 · REQ-CPL-029 |
| Catégories de données | Dérivées du schéma, section 3 : nom, prénom, courriel et téléphone chiffrés et leurs empreintes de recherche ; snapshot de candidature (réponses, score initial et ses composantes, version du barème, canal d'origine, code de parrainage saisi) ; statut et motif de résiliation ; identités de facturation datées (SIREN, régime de TVA) ; jetons de dépôt, liens de connexion et sessions en empreinte, empreinte tronquée d'adresse réseau ; courriels envoyés en empreinte d'adresse ; date et version d'acceptation de la politique de confidentialité ; le nom et le prénom chiffrés et la qualité d'une personne déclarée ; les dépôts refusés (SIREN, motif, canal, date) ; pour chaque dépôt, les empreintes d'adresse réseau et de navigateur. le dossier de conformité (`pieces_kyc`) : type et statut de chaque pièce, dates de vérification, d'expiration, de purge du fichier et de remplacement, référence du fichier stocké, et, pour le RIB seulement, l'IBAN chiffré et son empreinte. Hors schéma à ce jour : les fichiers des pièces eux-mêmes, en stockage privé, et les notes internes de la console | table `apporteurs` · table `identites_facturation` · table `pieces_kyc` · table `sessions_espace` · table `courriels_envoyes` · table `personnes_declarees` · table `depots_refuses` · table `attributions` · REQ-SEC-024 · REQ-DM-027 · HYP-DM06-IBAN · REQ-SEC-039 |
| Origine des données | Le formulaire de candidature, qui reste dans axionia, d'où Partners tire les coordonnées au traitement de la candidature ; puis l'apporteur lui-même, dans son espace et au dossier de conformité | HYP-E1-7 · REQ-DM-035 · docs/adr/0023-route-des-coordonnees-de-candidature.md |
| Durée de conservation | Contrats, autofactures, relevés et preuves de paiement : `CONSERVATION_PIECES_ANS` de la source unique des seuils. Pièce d'identité : purgée dès validation, seule la date de validation reste. CV : purgé avec la candidature à l'échéance du vivier. Notes internes : aussi longtemps que la fiche. Durées table par table : section 3. Fiche de l'apporteur elle-même : À compléter — source manquante. Question : combien de temps la fiche d'un apporteur résilié, ou d'un candidat refusé, est-elle conservée ? | REQ-JUR-029 · REQ-SEC-026 · REQ-EXT-011 · HYP-W15-NOTES |
| Destinataires | Les utilisateurs de la console, selon leur rôle et la matrice des droits, le défaut étant le refus ; les sous-traitants de la section 4. Le parrain ne voit de ses filleuls directs que le prénom, l'initiale du nom et l'état du contrat | REQ-SEC-023 · HYP-W15-FILLEULS-VUE |
| Transferts hors Union européenne | Le push web, si l'apporteur y consent, passe par un sous-traitant hors Union européenne ; la notification ne porte ni coordonnées de tiers ni montant. Pays et garanties du transfert : À compléter — source manquante. Question : quel service de push, quel pays, et quel encadrement du transfert Will retient-il ? | docs/tiers/push-web.md · REQ-UX-014 · REQ-SEC-033 · HYP-D12 |
| Information des personnes | Une politique de confidentialité propre à Partners — base légale, durées, sous-traitants, droits — affichée et acceptée à la première connexion, dont la date et la version sont conservées ; le candidat reçoit la mention de l'article 13. Personnes déclarées : À compléter — source manquante. Question : qui informe une personne déclarée du traitement de son nom (article 14 du RGPD) ? L'apporteur, qui la déclare, au titre de l'article 7 du contrat ? Ou la Société, et par quel support, puisqu'elle n'a ni courriel ni téléphone de cette personne ? | REQ-JUR-025 · REQ-EXT-014 · table `apporteurs` · REQ-CPL-029 |
| Droits et modalités d’exercice | Droits exerçables auprès de la Société à l'adresse de tête du contrat ; export de ses propres données depuis l'espace (articles 15 et 20) ; voie d'accès et d'effacement par jeton, une demande par jour | contrat art. 7.4 · REQ-JUR-025 · REQ-UX-030 · REQ-SEC-030 |
| Mesures de sécurité | Chiffrement AES-256-GCM des nom, courriel, téléphone et IBAN, empreintes HMAC pour la recherche, aucune adresse réseau brute ; pièces du dossier de conformité en stockage privé, servies par URL signée ; secrets distincts validés au démarrage ; journal chaîné sans donnée personnelle ; journaux applicatifs caviardés ; droits portés par un rôle, défaut = refus | REQ-SEC-024 · REQ-SEC-026 · REQ-SEC-028 · REQ-DM-041 · REQ-QA-024 · REQ-SEC-023 |

### TRT-TIERS — Coordonnées du tiers rencontré, contact d'une entreprise déclarée

| Rubrique | Contenu | Sources |
| --- | --- | --- |
| Finalité | Suivre l'affaire née de la déclaration d'une entreprise : prise de contact et qualification par la Société ; détection des doublons et exercice des droits, par empreintes | contrat art. 7.1 · contrat art. 7.2 · REQ-DM-031 · REQ-JUR-009 |
| Base légale | À compléter — source manquante. Question : Will retient-il l'intérêt légitime de la Société (article 6, paragraphe 1, point f du RGPD), que suppose la mise en balance demandée par la tâche, ou une autre base ? Les éléments de la mise en balance sont réunis dans `docs/rgpd/aipd.md` | docs/rgpd/aipd.md |
| Personnes concernées | La personne physique rencontrée par l'apporteur au sein d'une entreprise déclarée | contrat art. 7.1 · REQ-DM-031 |
| Catégories de données | Nom, téléphone et courriel professionnels, chiffrés au repos et doublés d'empreintes HMAC du courriel et du téléphone ; le SIREN de l'entreprise et l'horodatage, conservés après la purge ; le contenu des échanges saisis par l'apporteur. Aucune donnée de l'article 9 n'est transmise. Ces données vivent dans la table `attributions` ; s'y ajoutent la date du contact, qui n'est lue que pour l'article 3.7 du contrat (REQ-JUR-040), et la précision facultative d'un lien d'intérêt déclaré (REQ-UX-039) ; les coordonnées géographiques du siège de l'entreprise, issues des données publiques (EXT-T08), qui peuvent désigner le domicile d'un entrepreneur individuel, tues pour l'apporteur et hors de tout score (REQ-SEC-017, REQ-SEC-020) | REQ-DM-031 · REQ-SEC-024 · REQ-EXT-002 · contrat art. 7.3 · table `attributions` · REQ-JUR-040 · REQ-UX-039 · REQ-SEC-017 · REQ-SEC-020 |
| Origine des données | Collecte indirecte : l'apporteur, responsable de traitement distinct pour cette collecte, transmet les coordonnées ; la Société en devient responsable dès leur réception | contrat art. 7.1 · contrat art. 7.5 |
| Durée de conservation | Purge par tâche planifiée, qui écrit un événement : `CONTACT_PURGE_APRES_LIBERATION_JOURS` après libération (attribution invalidée, perdue, expirée ou périmée), `CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS` après le dernier contact si l'entreprise est convertie. Les valeurs sont celles de l'hypothèse HYP-RGPD-RETENTION, non tranchée ; le fichier de durées qu'elle nomme n'existe pas encore dans le dépôt. Les échanges suivent leur attribution | REQ-SEC-030 · REQ-DM-031 · HYP-RGPD-RETENTION · REQ-EXT-004 |
| Destinataires | Les utilisateurs de la console selon la matrice des droits ; l'apporteur déclarant, qui voit les mêmes échanges que la console. Jamais une notification Telegram, SMS ou push, jamais un journal applicatif. Rôles autorisés à lire les coordonnées : À compléter — source manquante. Question : quels rôles de la matrice lisent les coordonnées du tiers ? | REQ-SEC-023 · REQ-EXT-002 · REQ-SEC-033 · REQ-INT-024 · REQ-QA-024 |
| Transferts hors Union européenne | Aucun transfert par les canaux de notification, qui ne portent jamais ces coordonnées. Hébergement de la base, de ses sauvegardes et des journaux du relais d'envoi : À compléter — source manquante. Question : dans quelles régions sont hébergés la base, ses sauvegardes et les journaux d'envoi du courriel d'information ? | REQ-SEC-033 · docs/tiers/zeptomail.md · docs/tiers/coolify.md · docs/tiers/cloudflare-r2.md |
| Information des personnes | Axion-IA informe elle-même la personne, au titre de l'article 14 du RGPD, au premier contact : la mention est affichée dans le script de qualification, et un courriel d'information est envoyé et journalisé au plus tard lors de la qualification. L'apporteur l'a informée au préalable de la transmission, au titre de l'article 13 | REQ-JUR-009 · contrat art. 7.2 · contrat art. 7.1 · REQ-SEC-030 |
| Droits et modalités d’exercice | Voie d'accès et d'effacement par jeton, une demande par jour, refusée si le limiteur est indisponible ; l'effacement vide le contenu des échanges la concernant et conserve la ligne de journal, dont la chaîne reste vérifiable | REQ-SEC-030 · REQ-EXT-004 · REQ-DM-041 |
| Mesures de sécurité | Chiffrement AES-256-GCM, l'identifiant de ligne servant de données associées ; empreintes HMAC ; journal chaîné sans donnée personnelle ; journaux applicatifs caviardés ; aucune coordonnée dans une notification ; brouillon hors ligne sans coordonnées du tiers, purgé après envoi ou à 24 h ; les coordonnées chiffrées ne franchissent pas la frontière avec axionia | REQ-SEC-024 · REQ-DM-041 · REQ-QA-024 · REQ-SEC-033 · REQ-INT-029 |

### TRT-CONSOLE — Comptes et sessions des utilisateurs de la console

| Rubrique | Contenu | Sources |
| --- | --- | --- |
| Finalité | Authentifier les personnes de la Société qui opèrent la console, et porter le rôle qui fonde chacun de leurs droits | REQ-SEC-023 · table `utilisateurs_console` |
| Base légale | À compléter — source manquante. Question : quelle base de l'article 6 du RGPD Will retient-il pour les comptes de la console ? | REQ-SEC-023 |
| Personnes concernées | Les utilisateurs de la console, un rôle chacun | REQ-SEC-023 · table `utilisateurs_console` |
| Catégories de données | Nom et courriel chiffrés, empreinte du courriel, rôle, date de désactivation ; liens de connexion et sessions en empreinte, empreinte tronquée d'adresse réseau ; courriels envoyés en empreinte d'adresse. Aucun mot de passe | table `utilisateurs_console` · table `liens_magiques` · table `sessions_espace` · table `courriels_envoyes` · REQ-SEC-003 |
| Origine des données | À compléter — source manquante. Question : quel geste, et quel rôle, crée un utilisateur de la console et saisit son nom et son courriel ? | table `utilisateurs_console` |
| Durée de conservation | Liens de connexion et courriels envoyés : durées de l'hypothèse HYP-A02-RETENTION, reprises section 3. Compte et sessions : À compléter — source manquante. Question : combien de temps après sa désactivation un compte de la console et ses sessions sont-ils conservés ? | HYP-A02-RETENTION |
| Destinataires | Les utilisateurs de la console selon la matrice des droits ; les sous-traitants de la section 4 qui hébergent la base et relaient les courriels | REQ-SEC-023 · docs/tiers/coolify.md · docs/tiers/zeptomail.md |
| Transferts hors Union européenne | Les alertes de console passent par Telegram, sous-traitant hors Union européenne ; aucun message ne porte de coordonnées ni de lien vers la console. Pays et garanties du transfert : À compléter — source manquante. Question : quel pays, et quel encadrement du transfert, Will retient-il pour Telegram ? | docs/tiers/telegram.md · REQ-INT-024 · REQ-SEC-033 |
| Information des personnes | À compléter — source manquante. Question : par quel support les utilisateurs de la console sont-ils informés du traitement de leurs données ? | REQ-SEC-023 |
| Droits et modalités d’exercice | À compléter — source manquante. Question : par quelle voie un utilisateur de la console exerce-t-il ses droits ? | REQ-SEC-023 |
| Mesures de sécurité | Connexion par lien magique sans mot de passe : empreinte HMAC, usage unique, durée de vie de quinze minutes ; rôle relu à chaque requête avec la date de désactivation ; sessions révocables | REQ-SEC-001 · REQ-SEC-003 · REQ-SEC-023 · table `liens_magiques` |

## 3. Données stockées — dérivées de `prisma/schema.prisma`

Une ligne par table du schéma, ni plus ni moins : le test confronte cette liste au schéma dans les deux
sens. Une table « sans donnée personnelle » ne porte aucune colonne personnelle au sens des conventions
du schéma (bloc chiffré, empreinte de courriel, de téléphone ou d'adresse réseau, lien vers un apporteur
ou un utilisateur de la console) : le test le vérifie aussi.

| Table | Traitements | Durée de conservation | Sources |
| --- | --- | --- | --- |
| `evenements` | TRT-APPORTEURS, TRT-TIERS | À compléter — source manquante. Question : combien de temps le journal chaîné est-il conservé, sachant qu'il ne porte aucune donnée personnelle mais désigne des agrégats par identifiant ? | table `evenements` · REQ-DM-041 |
| `apporteurs` | TRT-APPORTEURS | À compléter — source manquante. Question : combien de temps la fiche d'un apporteur résilié, ou d'un candidat refusé, est-elle conservée ? | table `apporteurs` · REQ-DM-035 |
| `jetons_depot` | TRT-APPORTEURS | À compléter — source manquante. Question : combien de temps l'empreinte d'un jeton de dépôt révoqué est-elle conservée ? | table `jetons_depot` · REQ-DM-012 |
| `liens_magiques` | TRT-APPORTEURS, TRT-CONSOLE | 30 jours après expiration | HYP-A02-RETENTION |
| `sessions_espace` | TRT-APPORTEURS, TRT-CONSOLE | À compléter — source manquante. Question : combien de temps une session expirée ou révoquée, et son empreinte d'adresse réseau, sont-elles conservées ? | table `sessions_espace` · REQ-SEC-003 |
| `utilisateurs_console` | TRT-CONSOLE | À compléter — source manquante. Question : combien de temps après sa désactivation un compte de la console est-il conservé ? | table `utilisateurs_console` · REQ-SEC-023 |
| `changements_courriel` | TRT-APPORTEURS | 12 mois | HYP-A02-RETENTION |
| `identites_facturation` | TRT-APPORTEURS | Aussi longtemps que les autofactures qui la portent : `CONSERVATION_PIECES_ANS` à compter de la dernière autofacture émise à cette identité. L'identité du fournisseur est une mention obligatoire de la facture, qui se conserve avec elle | table `identites_facturation` · REQ-JUR-029 · REQ-ARG-018 · contrat art. 5.2 · contrat annexe 2 · code de commerce art. L.123-22 · code général des impôts, annexe II, art. 242 nonies A |
| `pieces_kyc` | TRT-APPORTEURS | Par type de pièce. Pièce d'identité : le fichier est purgé dès la validation (`fichier_purge_at`), seules la date de vérification et la ligne restent. RIB (`iban_chiffre`, `iban_hash`) : la pièce courante pendant la relation, puis jusqu'à l'extinction des droits à commission ; une pièce remplacée (`remplacee_at`) : l'IBAN reste chiffré cinq ans après le dernier virement qui l'a utilisé (prescription commerciale), puis il est effacé automatiquement. Attestation de vigilance : cinq ans après la fin du contrat. Attestation d'assurance de responsabilité civile professionnelle : cinq ans après son échéance. Justificatifs d'immatriculation et de régime de TVA (`siret`, `tva`) : aussi longtemps que les autofactures qui s'y rapportent, `CONSERVATION_PIECES_ANS` à compter de la dernière. | table `pieces_kyc` · REQ-DM-027 · HYP-DM06-IBAN · REQ-UX-027 · contrat art. 5.4 · contrat art. 6.2 · contrat art. 6.4 · contrat art. 12.3 · code du travail art. L.8222-1 et D.8222-5 · code civil art. 2224 · code de commerce art. L.110-4 · décision de Williams du 2026-10-02 (IBAN d'un RIB remplacé) |
| `demandes_droits_contact` | TRT-TIERS | La nouvelle valeur d'une rectification (`valeur_chiffree`) : effacée à la clôture de la demande (rectification appliquée ou refus motivé notifié), au plus tard `DROITS_CONTACT_DELAI_REPONSE_MOIS` après la réception, délai porté de `DROITS_CONTACT_PROLONGATION_MOIS` s'il est prolongé ; une tâche de fond l'efface à l'échéance, même sans traitement. La trace sans valeur (droit, donnée visée, dates, suite) : cinq ans après la clôture de la demande, preuve que la demande a été traitée. L'anonymisation à l'échéance relève de la tâche de purge de cette trace, à venir. | table `demandes_droits_contact` · REQ-JUR-065 · RGPD art. 12.3 · code civil art. 2224 · décision de Williams du 2026-10-03 |
| `evenements_recus` | aucune donnée personnelle | 10 ans | HYP-A02-RETENTION · REQ-INT-029 |
| `battements` | aucune donnée personnelle | sans purge | HYP-A02-RETENTION |
| `grilles_commission` | aucune donnée personnelle | sans purge : chaque version reste la preuve du barème appliqué, et la base refuse toute suppression | table `grilles_commission` · REQ-DM-014 |
| `courriels_envoyes` | TRT-APPORTEURS, TRT-TIERS, TRT-CONSOLE | 5 ans après la fin de la relation | HYP-A02-RETENTION · REQ-JUR-009 |
| `suppressions_courriel` | TRT-APPORTEURS, TRT-TIERS, TRT-CONSOLE | tant que l'adresse est supprimée | HYP-A02-RETENTION · REQ-INT-023 |
| `attributions` | TRT-TIERS, TRT-APPORTEURS | Coordonnées du contact (nom, prénom, fonction, courriel, téléphone et contexte chiffrés, empreintes de courriel et de téléphone, précision du lien d'intérêt) : purgées par tâche planifiée, qui écrit l'événement `attribution_contact_purge`, `CONTACT_PURGE_APRES_LIBERATION_JOURS` après la libération (attribution invalidée, perdue, expirée ou périmée) ou `CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS` après le dernier contact si l'entreprise est convertie ; valeurs de l'hypothèse HYP-RGPD-RETENTION, non tranchée. Reste de la ligne (SIREN, horodatages, porteur, version de grille, empreintes d'adresse réseau et de navigateur de l'apporteur, coordonnées géographiques du siège de l'entreprise) : À compléter — source manquante. Question : combien de temps une attribution est-elle conservée après sa fin, sachant qu'elle fonde le calcul des commissions et leur contestation ? | table `attributions` · REQ-SEC-030 · HYP-RGPD-RETENTION · REQ-DM-005 · REQ-DM-031 |
| `depots_refuses` | TRT-APPORTEURS | À compléter — source manquante. Question : combien de temps un dépôt refusé est-il conservé, sachant qu'il ne sert qu'à la contestation écrite du refus (REQ-DM-043) ? | table `depots_refuses` · REQ-DM-043 |
| `personnes_declarees` | TRT-APPORTEURS | Nom et prénom chiffrés : purgés selon une durée À compléter — source manquante. Question : combien de temps après le retrait d'une personne déclarée, ou la fin du contrat de l'apporteur, son nom et son prénom sont-ils conservés ? Qualité et dates de déclaration et de retrait : même question | table `personnes_declarees` · REQ-CPL-029 · contrat art. 2.6 |
| `notifications_espace` | TRT-APPORTEURS | À compléter — source manquante. Question : combien de temps une notification reste-t-elle visible dans l'espace, la preuve étant le courriel (`courriels_envoyes`) ? Proposition d'A07 : 12 mois après l'envoi, et au plus tard jusqu'à l'effacement de la fiche. | table `notifications_espace` · REQ-UX-016 |
| `preferences_notification` | TRT-APPORTEURS | Effacée avec la fiche de l'apporteur : elle hérite de la durée de la fiche. | table `apporteurs` · RGPD art. 5.1.e |

## 4. Destinataires tiers et sous-traitants

Une ligne par fiche de `docs/tiers/` — le test le vérifie —, plus les tiers que le code appelle sans
fiche. La qualification reprend celle de la fiche ; ce que la fiche laisse à confirmer le reste ici.

| Tiers | Fiche | Qualification | Traitements | Données confiées | Localisation et transfert | Sources |
| --- | --- | --- | --- | --- | --- | --- |
| Service de push web | `docs/tiers/push-web.md` | sous-traitant hors Union européenne | TRT-APPORTEURS | Le point de terminaison d'abonnement de l'appareil, donnée pseudonymisée qui désigne un apporteur, et l'événement ; charge utile sans coordonnées de tiers ni montant ; le transfert porte donc une donnée personnelle et doit être encadré | hors Union européenne. À compléter — source manquante. Question : quel service, quel pays et quel encadrement du transfert ? | REQ-SEC-033 · REQ-UX-014 · HYP-D12 |
| Telegram | `docs/tiers/telegram.md` | sous-traitant hors Union européenne | TRT-CONSOLE ; TRT-APPORTEURS dans une version ultérieure | Le texte d'une alerte : catégorie, horodatage et un identifiant technique, donnée pseudonymisée dès qu'il désigne une personne ; aucune coordonnée, aucun lien vers la console ; le transfert doit donc être encadré | hors Union européenne. À compléter — source manquante. Question : quel pays et quel encadrement du transfert ? | REQ-INT-024 · REQ-SEC-033 · REQ-INT-025 · HYP-D12 |
| Relais de courriel | `docs/tiers/zeptomail.md` | sous-traitant | TRT-APPORTEURS, TRT-TIERS, TRT-CONSOLE | Adresses électroniques et contenu des courriels, dont le courriel d'information du tiers | À compléter — source manquante. Question : quelle région effective du compte, et où sont conservés les journaux d'envoi ? | REQ-INT-022 · REQ-INT-023 · REQ-JUR-009 |
| Stockage des sauvegardes | `docs/tiers/cloudflare-r2.md` | sous-traitant | TRT-APPORTEURS, TRT-TIERS, TRT-CONSOLE | Une copie complète de la base, sauvegardée toutes les heures | À compléter — source manquante. Question : quelle région du conteneur de stockage ? | REQ-QA-023 · HYP-E1-5 |
| Hébergeur du serveur | `docs/tiers/coolify.md` | sous-traitant | TRT-APPORTEURS, TRT-TIERS, TRT-CONSOLE | La base de production | À compléter — source manquante. Question : quel hébergeur, et quelle localisation ? | HYP-E1-5 |
| Signature électronique | `docs/tiers/docuseal.md` | sous-traitant | TRT-APPORTEURS | Les données d'identité des signataires | À compléter — source manquante. Question : instance de l'éditeur ou instance auto-hébergée, et où ? | DEC-INT-001 |
| Plateforme comptable | `docs/tiers/tiime.md` | sous-traitant | TRT-APPORTEURS | Des données d'identification d'apporteurs, par l'export comptable | À compléter — source manquante. Question : quelle localisation, et quelle durée de conservation ? | docs/tiers/tiime.md |
| Banque | `docs/tiers/banque.md` | non sous-traitant selon la fiche, à confirmer par Will | TRT-APPORTEURS | Les ordres de virement des commissions | À compléter — source manquante. Question : où l'établissement conserve-t-il les données ? | HYP-W2 |
| Administration fiscale (DAS2) | `docs/tiers/dgfip-das2.md` | destinataire légal, non sous-traitant | TRT-APPORTEURS | La déclaration annuelle des sommes versées | administration française | HYP-D9 · docs/tiers/dgfip-das2.md |
| URSSAF | `docs/tiers/urssaf.md` | non sous-traitant en l'état, à confirmer par Will | TRT-APPORTEURS | La vérification d'une attestation de vigilance remise par l'apporteur | service public français | HYP-D7 · docs/tiers/urssaf.md |
| API de recherche d'entreprises | `docs/tiers/recherche-entreprises.md` | non sous-traitant : données publiques consultées, aucune donnée personnelle confiée | TRT-TIERS | Aucune donnée personnelle : la requête porte sur l'entreprise | À compléter — source manquante. Question : quelle localisation exacte du service ? | REQ-INT-021 |
| GitHub | `docs/tiers/github.md` | non sous-traitant pour les données de production ; comptes des contributeurs à qualifier par Will | aucun des trois | Aucune donnée personnelle de production | À compléter — source manquante. Question : quelle offre, et quelle localisation ? | W13 · docs/tiers/github.md |
| Sentry | aucune fiche | À compléter — source manquante. Question : le service de suivi des erreurs serveur reçoit-il des données personnelles malgré le caviardage, et doit-il avoir sa fiche tiers et son contrat de sous-traitance ? | TRT-APPORTEURS, TRT-TIERS, TRT-CONSOLE | Les erreurs serveur caviardées : chemin, méthode et route, aucun en-tête | À compléter — source manquante. Question : quelle région du compte ? | src/lib/sentry.ts · REQ-QA-024 |

## 5. Questions ouvertes

Chaque « À compléter — source manquante » des sections 1 à 4 porte sa question sur sa propre ligne ;
elles s'adressent toutes à Will, qui arbitre les questions juridiques du projet (`docs/DECISIONS.md` §5).
Les réponses entrent au registre des décisions, puis ici, avec leur identifiant.

**Questions ouvertes du chantier des conseillers salariés (W19).** Ce registre ne décrit encore
aucun traitement de conseillers : il en compte trois, et le quatrième entrera avec la tâche qui le
porte, après la fusion de celle-ci. Ces questions sont écrites ici pour qu'aucune ne soit perdue d'ici
là ; elles s'adressent à Will, comme les autres.

- Quelle est la base légale du traitement des données des conseillers salariés ?
- Qui est le destinataire de l'export paie, et à quel titre ?
- Quelles sont les données minimales du traitement des conseillers ?
- Quelles durées de conservation, dont la prescription salariale ?
- Le CSE doit-il être informé, ou constate-t-on par écrit qu'il n'y en a pas ?
- Quel est le cinquième objet de l'AIPD, pour ce traitement ?
- L'information des conseillers relève-t-elle de l'article 13 ou de l'article 14 ?
- Comment écrire la finalité « contrôle d'incompatibilité » avec le personnel de la Société, dans le
  traitement des apporteurs, sans nommer personne ?

## 6. Ce que ce registre ne contient pas encore

- Les tables des phases suivantes — attributions et qualifications, échanges, pièces du dossier de
  conformité, candidatures et CV, notes internes. Leurs données sont décrites dans les traitements
  ci-dessus d'après leurs exigences ; le jour où une migration les crée, le test exige leur ligne en
  section 3.
- Les valeurs des durées de l'hypothèse HYP-RGPD-RETENTION : elles vivent dans cette ligne du registre
  des décisions, puis dans le fichier de durées que REQ-SEC-030 nomme, jamais ici.
