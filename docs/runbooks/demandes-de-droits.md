# Runbook — demandes de droits (RGPD), traitement à la main

> Livré par JUR-T59 (REQ-JUR-065). Autrice : A07. Ce runbook nomme des tables, des constantes et des
> écrans, **jamais une personne**. Il ne contient aucune donnée réelle.
>
> **Durée de vie.** Pour la demande d'ACCÈS d'un apporteur, ce runbook sert **tant que l'export de
> l'article 15 (DM-20) n'est pas livré**. Dès sa livraison, l'accès se traite par l'export, et la
> section 3 cesse de servir. Les sections 1, 2 et 4 restent en vigueur.

## 1. Recevoir la demande

1. **Qui peut demander.** Toute personne dont Partners traite les données : un apporteur ou un candidat,
   ou un contact déclaré (la personne rencontrée dans une entreprise). Les droits sont l'accès (art. 15),
   la rectification (art. 16), l'effacement (art. 17), la limitation (art. 18) et l'opposition (art. 21).
2. **Par où.** Par écrit, à l'adresse de contact indiquée dans la politique de confidentialité, par
   courrier, ou depuis l'espace de l'apporteur. Une demande orale est consignée par écrit par la personne
   qui la reçoit.
3. **La date de réception fait courir le délai.** Il faut répondre **au plus tard un mois** après la
   réception (art. 12.3), même pour dire qu'on ne peut pas donner suite. Le délai peut être **prolongé de
   deux mois** si la demande est complexe ou si les demandes sont nombreuses. La personne doit alors en être
   informée **dans le premier mois**, avec les motifs. Les durées vivent dans
   `src/domain/seuils/retention.ts` (`DROITS_CONTACT_DELAI_REPONSE_MOIS`,
   `DROITS_CONTACT_PROLONGATION_MOIS`) ; ce runbook ne les recopie pas.
4. **Tracer.**
   - **Demande d'un contact déclaré** : une ligne `demandes_droits_contact` (DM-59). `recue_at` est posée
     par la base, et c'est elle qui fait foi pour le délai. Une prolongation pose `prolongee_at`, une seule
     fois. La clôture pose `traitee_at` et `issue` (`appliquee` ou `refusee`).
   - **Demande d'un apporteur ou d'un candidat** : aucune table ne la porte encore. Il faut consigner la
     date de réception, le droit exercé et la suite donnée dans le registre des demandes tenu par la
     Société, hors du dépôt public. La date de l'écrit reçu fait foi.
5. **Vérifier l'identité, sans excès.** On répond à la personne concernée, et à elle seule.
   - **Apporteur** : la demande vient de l'adresse enregistrée (comparer son empreinte à
     `apporteurs.email_hash`) ou de son espace connecté.
   - **Contact** : la demande vient de l'adresse ou du téléphone enregistrés pour l'attribution, ou de la
     page du contact.
   - **En cas de doute raisonnable**, on demande un élément complémentaire, jamais une pièce d'identité par
     principe. Le délai court dès que l'identité est établie.

## 2. Ce qu'on ne fait jamais

- Révéler à un apporteur qui occupe une entreprise (contrat art. 3.5), ou la donnée d'une autre personne.
- Recopier la demande, ses pièces ou la réponse dans un journal applicatif, dans Sentry, dans une issue ou
  dans une PR. Seuls les identifiants circulent.
- Laisser passer le délai sans réponse : une réponse d'attente motivée vaut mieux que le silence.

## 3. Répondre à la main à une demande d'ACCÈS d'un apporteur (jusqu'à l'export de DM-20)

La réponse comprend **une copie des données** et les **informations de l'art. 15.1** :
- les finalités ;
- les catégories de données ;
- les destinataires ;
- la durée de conservation ;
- les droits de la personne, dont celui de saisir la CNIL ;
- la source des données lorsqu'elles n'ont pas été collectées auprès d'elle ;
- l'existence d'un traitement qui l'éclaire, avec l'intervention humaine.

Ces informations se lisent dans la politique de confidentialité et dans `docs/rgpd/registre-article-30.md`.

**Les données à rassembler** :

1. **La fiche** (`apporteurs`) : identité, coordonnées déchiffrées, statut, qualité d'exercice,
   acceptation de la politique et sa version, dates.
2. **La candidature** : les réponses, ainsi que le **score initial et ses composantes**, présentés comme
   une pièce de la décision d'admission, que l'on éclaire sans la prendre. Le **détail du barème** n'est pas
   joint.
3. **L'activité** : attributions et déclarations de l'apporteur (`attributions`, `depots_refuses`),
   vérifications (`verifications`), alertes de libération, notifications (`notifications_espace`),
   courriels envoyés (`courriels_envoyes`), contestations (`contestations`) et leurs réponses.
4. **Les pièces et la facturation** : pièces du KYC (`pieces_kyc`, leur liste et leur état ; les pièces
   elles-mêmes sur demande), identités de facturation, relevés, autofactures et commissions.
5. **LES ANOMALIES QUI VISENT L'APPORTEUR — à joindre expressément.** Pour chaque ligne `anomalies` dont
   `apporteur_id` est celui du demandeur, et pour lui seul :
   - son **existence** ;
   - sa **date** (`ouverte_at`, et `traite_at` le cas échéant) ;
   - sa **catégorie** (`type`) ;
   - son **statut** (`ouverte`, `levee`, `confirmee`) ;
   - **la suite donnée**, c'est-à-dire la mesure notifiée, s'il y en a une.

   Le **score** et la **justification** de l'anomalie, tus à l'écran, **sont joints** ; la justification
   est déchiffrée pour ce seul demandeur. Seuls peuvent être tus **le détail des seuils et la pondération
   interne de la détection**, dans la mesure nécessaire à son efficacité, **et jamais l'anomalie
   elle-même**. Une anomalie déjà anonymisée (`anonymisee_at`) ne se rattache plus à personne : elle n'est
   plus une donnée de l'apporteur.
6. **Les traces du journal** qui portent sur l'apporteur, extraites par ses identifiants (contrat
   art. 3.5 : l'extrait ne révèle pas qui occupe une entreprise).

**Ne sont pas joints** :
- les données d'une autre personne (les autres apporteurs, et les contacts déclarés au-delà de ce que
  l'apporteur a lui-même transmis) ;
- l'identité de l'utilisateur de la console qui a traité une anomalie ;
- l'identité de l'occupant d'une entreprise.

**Envoi** : un fichier chiffré, transmis à l'adresse vérifiée (section 1.5), avec le mot de passe par un
autre canal. On note la date de l'envoi dans la trace de la demande. Ce fichier n'est conservé nulle part
ailleurs.

## 4. Les autres droits, en bref

- **Rectification** : on corrige la donnée visée. Pour un contact, la valeur nouvelle est portée chiffrée
  par `demandes_droits_contact.valeur_chiffree`, puis effacée à la clôture (DM-59).
- **Effacement** : on efface, sauf les données que la Société doit garder comme preuve ou par obligation
  légale (pièces comptables, preuve d'une attribution). La réponse dit lesquelles, pourquoi et jusqu'à
  quand.
- **Opposition à la prospection** : elle est absolue. L'empreinte entre à la liste de suppression
  (`suppressions_courriel`), et l'opposition est transmise au CRM Pro (INT-T69-P).
- **Limitation** : on gèle l'usage de la donnée, qui reste conservée, le temps de la vérification.
