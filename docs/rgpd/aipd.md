# Analyse d'impact relative à la protection des données (AIPD)

> Livrée par JUR-T04 (REQ-CPL-009, REQ-JUR-009). Test : `tests/unit/juridique/registre-rgpd.spec.ts`.
>
> REQ-CPL-009 exige une AIPD **réalisée et signée avant le premier dépôt réel**, couvrant le profilage
> d'anomalie, le score, les données de tiers et les données financières. Ce document réunit les faits
> que le dépôt établit, chacun avec sa source, et déclare ce qu'aucune source ne porte : « À compléter —
> source manquante », suivi de la question posée à Will. Il ne cote aucun risque à la place de celui
> qui signe.
>
> Les traitements analysés sont ceux du registre de l'article 30 (`docs/rgpd/registre-article-30.md`) :
> TRT-APPORTEURS, TRT-TIERS et TRT-CONSOLE.

## 1. Description des traitements

| Élément | Constat | Sources |
| --- | --- | --- |
| Traitements couverts | Les trois traitements du registre, avec leurs finalités, catégories de données, durées et destinataires | docs/rgpd/registre-article-30.md · REQ-SEC-030 |
| Responsable du traitement | L'entité arrêtée par la décision W1, dont les valeurs se lisent dans `config/entite.json` | W1 · config/entite.json |
| Délégué à la protection des données | Aucun délégué n'est désigné sur le projet | REQ-SEC-030 |

## 2. Périmètre imposé par REQ-CPL-009

### Profilage d’anomalie

| Élément | Constat | Sources |
| --- | --- | --- |
| Ce qui est mesuré | Cinq signaux, qui décrivent exclusivement le contenu de ce qui est déclaré : nom du contact comparé à celui du dirigeant par empreintes, contact générique, texte court ou identique, identités multiples par empreinte d'adresse réseau et agent, ordre des SIREN déclarés. Ni le rythme, ni l'horaire, ni le lieu n'y entrent | REQ-SEC-017 |
| Effet d'un signal | Le franchissement du seuil n'a aucun effet défavorable automatique. La suspension des déclarations n'est ouverte que par une déclaration non confirmée par l'entreprise ou par une fraude, jamais par un compteur de volume, de rythme, de délai ou de méthode | REQ-SEC-017 · REQ-JUR-031 · HYP-D11 |
| Signal « déjà travaillée » | Un signal, jamais un refus, sans identité, sans date précise et sans résultat | HYP-W7 |
| Seuils de détection | Ils vivent en configuration ou en base, jamais dans le dépôt public | W13 |
| Décision individuelle automatisée | Aucun effet défavorable automatique n'est attaché à un signal. Qui revoit un signal, et sous quel délai : À compléter — source manquante. Question : Will confirme-t-il qu'aucun signal ne produit seul d'effet juridique ou d'effet similaire pour l'apporteur, et qui examine un signal ouvert ? | REQ-SEC-017 |

### Score

| Élément | Constat | Sources |
| --- | --- | --- |
| Score de candidature | Une fonction déterministe à barème publié, qui oriente l'ordre des rappels et ne rejette jamais ; le score initial, ses composantes et la version du barème sont figés avec la candidature | W10 · REQ-EXT-014 · REQ-DM-035 |
| Extraction de CV | Une aide à la lecture : des faits proposés dans les champs du formulaire, chacun modifiable, rien d'enregistré sans validation humaine, aucun score, aucun rang, aucun avis de compatibilité ; le drapeau reste fermé jusqu'à une décision de Will | W10 |
| Information du candidat | Mention de l'article 13 : données collectées, durée de conservation, le fait que le score oriente l'ordre des rappels sans jamais rejeter, et le droit à un réexamen humain | REQ-EXT-014 |
| Score de sincérité | Traité avec le profilage d'anomalie ci-dessus | REQ-SEC-017 |

### Données de tiers

| Élément | Constat | Sources |
| --- | --- | --- |
| Collecte | Indirecte : l'apporteur transmet les coordonnées professionnelles d'une personne qu'il a informée ; la Société en devient responsable dès leur réception | contrat art. 7.1 · contrat art. 7.5 |
| Minimisation | Nom, téléphone et courriel professionnels ; aucune donnée de l'article 9 | REQ-DM-031 · contrat art. 7.3 |
| Information | Axion-IA informe elle-même la personne au premier contact, au titre de l'article 14 : mention dans le script de qualification, courriel d'information envoyé et journalisé au plus tard lors de la qualification | REQ-JUR-009 · contrat art. 7.2 |
| Conservation | Purge planifiée selon HYP-RGPD-RETENTION ; le SIREN et l'horodatage restent | REQ-SEC-030 · REQ-DM-031 · HYP-RGPD-RETENTION |
| Droits | Accès et effacement par jeton, une demande par jour ; l'effacement vide le contenu des échanges | REQ-SEC-030 · REQ-EXT-004 |
| Échanges saisis par l'apporteur | Tous visibles de la Société : l'espace reste sous sa responsabilité de traitement unique, sans sous-traitance entre les parties | REQ-EXT-002 · contrat art. 7.5 |
| Confidentialité | Chiffrement au repos, empreintes HMAC, aucune coordonnée dans une notification, un journal ou un payload venu d'axionia | REQ-SEC-024 · REQ-SEC-033 · REQ-QA-024 · REQ-INT-029 |

### Données financières

| Élément | Constat | Sources |
| --- | --- | --- |
| IBAN | Dans la pièce RIB du dossier de conformité seulement, chiffré, recherché par empreinte ; aucune autre table ne le porte | HYP-DM06-IBAN · REQ-CPL-005 · REQ-SEC-024 |
| Changement de RIB | Un seul mécanisme, celui du dossier de conformité : nouvelle pièce à vérifier, authentification renforcée, IBAN masqué, notification à l'ancienne adresse et à l'ancien numéro, alerte en console | HYP-E1-14 |
| Pièces du dossier de conformité | Stockage privé, servi par URL signée ; la pièce d'identité est purgée dès validation | REQ-SEC-026 · REQ-JUR-029 |
| Pièces comptables | Contrats, autofactures, relevés et preuves de paiement conservés `CONSERVATION_PIECES_ANS` | REQ-JUR-029 |
| Montants hors de l'espace | Aucun montant dans une notification Telegram, SMS ou push ; aucun montant par filleul montré au parrain | REQ-SEC-033 · REQ-INT-025 · HYP-W15-FILLEULS-VUE |

## 3. Sous-traitants hors Union européenne

| Élément | Constat | Sources |
| --- | --- | --- |
| Push web | Sous-traitant hors Union européenne, opt-in explicite ; charge utile sans coordonnées de tiers ni montant. Service, pays et encadrement du transfert : À compléter — source manquante. Question : quel service, quel pays, et quel encadrement Will retient-il ? | docs/tiers/push-web.md · REQ-UX-014 · REQ-SEC-033 |
| Telegram | Sous-traitant hors Union européenne pour les alertes de console ; aucune coordonnée, aucun lien de console. Pays et encadrement du transfert : À compléter — source manquante. Question : quel pays, et quel encadrement Will retient-il ? | docs/tiers/telegram.md · REQ-INT-024 · REQ-SEC-033 |
| Suivi des erreurs (Sentry) | Transfert CANDIDAT : la région du compte n'est pas connue, et les erreurs serveur caviardées peuvent encore porter un identifiant. À compléter — source manquante. Question : quelle région, et faut-il une fiche tiers et un contrat de sous-traitance ? | src/lib/sentry.ts · REQ-QA-024 |
| Sauvegardes | Transfert CANDIDAT : la région du conteneur de stockage n'est pas connue, et la sauvegarde est une copie complète de la base. À compléter — source manquante. Question : quelle région, et quel encadrement si elle est hors de l'Union ? | docs/tiers/cloudflare-r2.md · REQ-QA-023 |

## 4. Évaluation des risques

| Élément | Constat | Sources |
| --- | --- | --- |
| Pièces du dossier de conformité (`pieces_kyc`) | Données à caractère hautement personnel : un document d'identité et des coordonnées bancaires, dont la compromission permet une usurpation d'identité ou une fraude au virement | REQ-DM-027 · HYP-DM06-IBAN |
| Risque — détournement de RIB | Fraude au changement de coordonnées bancaires. Mesure : un nouveau RIB naît `a_verifier` pendant que l'ancien reste actif, avec une vérification hors bande avant activation | REQ-UX-027 · REQ-DM-027 |
| Risque — fuite de pièces d'identité | Mesures : purge du fichier dès la validation, stockage privé, URL signées à courte durée | REQ-SEC-026 · REQ-JUR-029 |
| Risque — accès interne excessif | Mesures : droits par rôle, défaut = refus, et accès journalisé | REQ-SEC-023 |
| Risque — courriel de confirmation parti à une mauvaise adresse | Si l'adresse saisie pour le contact est erronée, la demande de confirmation atteint une autre personne, qui apprend qu'un échange avec l'apporteur est déclaré au nom de son entreprise. Mesures : un seul envoi par déclaration et aucune relance au contact ; liste de suppression et liste d'opposition, consultées avant tout envoi ; un « Non » ne vaut qu'après un second geste de confirmation ; jetons et adresse réseau du clic gardés en empreinte seulement | HYP-W20-DESTINATAIRE · HYP-W20-NON · HYP-W20-OPPOSITION · REQ-DM-060 · docs/chantiers/W20-confirmation-par-email.md |
| Cotation des risques | À compléter — source manquante. Question : quelle vraisemblance et quelle gravité Will retient-il, pour chacun des quatre objets de la section 2, d'un accès illégitime, d'une modification non désirée et d'une disparition des données ? | REQ-CPL-009 |
| Mesures complémentaires | À compléter — source manquante. Question : au-delà des mesures sourcées ci-dessus, quelles mesures Will ajoute-t-il au vu de la cotation ? | REQ-CPL-009 |

## Mise en balance de l'intérêt légitime (LIA) — TRT-TIERS

La base légale du traitement TRT-TIERS n'est arrêtée par aucune source (registre, section 2). Si Will
retient l'intérêt légitime, cette mise en balance en porte les éléments ; elle ne conclut pas à sa place.

| Test | Éléments du dépôt | Sources |
| --- | --- | --- |
| Intérêt poursuivi | Suivre l'affaire née de la déclaration d'une entreprise par un apporteur | contrat art. 7.2 · REQ-DM-031 |
| Nécessité | Les seules coordonnées professionnelles de la personne rencontrée, chiffrées ; aucune donnée de l'article 9 | contrat art. 7.1 · contrat art. 7.3 · REQ-DM-031 |
| Attentes raisonnables | La personne a été informée de la transmission par l'apporteur, puis l'est par Axion-IA au premier contact | contrat art. 7.1 · REQ-JUR-009 |
| Garanties | Purge planifiée, chiffrement, droits d'accès et d'effacement par jeton, aucune coordonnée dans une notification ou un journal | HYP-RGPD-RETENTION · REQ-SEC-024 · REQ-SEC-030 · REQ-SEC-033 |
| Opposition | Par le lien d'opposition du courriel de confirmation : ses empreintes d'e-mail et de téléphone entrent dans une liste d'opposition, plus aucun e-mail ni appel d'Axion-IA ne lui parvient au titre de Partners, et la déclaration suit le régime « ne se prononce pas » (contrat art. 3.2 alinéa 3) | REQ-SEC-030 · HYP-W20-OPPOSITION |

Conclusion : À compléter — source manquante. Question : Will conclut-il que l'intérêt légitime de la Société l'emporte sur les droits de la personne rencontrée, et consigne-t-il cette décision au registre des décisions ?

## Signature

État : non signée

Condition : REQ-CPL-009 exige cette analyse signée avant le premier dépôt réel. Le signataire est Will,
qui arbitre les questions juridiques du projet en l'absence d'avocat et de délégué (`docs/DECISIONS.md`
§5). La signature s'écrit ici sous la forme « signée le AAAA-MM-JJ par Will », une fois les manques
ci-dessus comblés.
