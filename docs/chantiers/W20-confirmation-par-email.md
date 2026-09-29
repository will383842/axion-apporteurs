# Chantier W20 — confirmation du dépôt par e-mail, appel en dernier recours

> **Statut : PLAN, versé en partie au registre.** Ce fichier est la source d'entrée du chantier W20,
> décidé par Williams le 2026-09-29 (session -d7) et placé en **phase 1**. La PR qui le porte **verse
> quatorze tâches** `a_faire` en phase 1 (§5), en ne citant que des exigences **existantes**, et
> **amende quatorze tâches existantes** (§6), quinze depuis le 2026-09-29 (UX-P1-05, après la réponse de Williams),
> seize depuis la correction du 2026-09-29 (avenant de GOV-112, porteur de la passe gardien-spec W20), par `hors-depot/reecrire-champ.mjs` et
> `hors-depot/poser-champ.mjs` (texte brut, `--si-inchange`, motif consigné). Elle n'écrit ni
> `docs/DECISIONS.md`, ni `docs/GLOSSAIRE.md`, ni `docs/PRESEANCE.md`, ni `docs/requirements.json` :
> les hypothèses du §2 et les exigences du §3 y entreront par la **passe gardien-spec**, dans le lot
> dédié que livre GOV-116 (question 14). **Porteur au registre** (correction du 2026-09-29, dette
> bloquante de la lentille exactitude sur `2340a63`) : l'acceptance de GOV-112 porte un avenant qui lui
> fait écrire les exigences et les hypothèses W20 dans le même lot, après GOV-116, et vingt et une tâches
> W20 dépendent de GOV-112 (§6). Aucune tâche GOV nouvelle.
>
> **Correction de sécurité du 2026-09-29 (refus de la lentille securite sur `2340a63`).** L'apporteur
> pouvait se confirmer lui-même : une adresse webmail qu'il contrôle, un clic « Oui » depuis une autre IP,
> et le clic était retenu ; à défaut, la confirmation tacite menait au même résultat en trente jours.
> Désormais, sur une demande **signalée** (qui porte une raison de vérification), aucun clic « Oui »
> n'est retenu et le silence ne confirme jamais (question 18, tranchée le 2026-09-29) : seul un appel
> concluant de la Société confirme, et sans lui la demande est libérée (question 19) (HYP-W20-SOURCE,
> HYP-W20-TACITE, HYP-W20-LIBERATION, HYP-W20-BADGE, §8 risque 1).
>
> **Ce qu'il ne décide pas.** Le principe est la décision de Williams. Chaque modalité non dite par
> Williams est une hypothèse par défaut, lue « par défaut : … (HYP-W20-X) », réversible, et ouverte
> tant que la question du §9 qui la vise n'a pas reçu de réponse datée.
>
> **Réponses de Williams du 2026-09-29 (session -d7).** Williams a tranché la question 2 (confirmation
> tacite : trente jours à compter de la **réception** de l'e-mail, délai qui ne commence pas tant qu'un
> rebond n'est pas corrigé) et a confirmé les valeurs par défaut des quatorze autres questions telles
> qu'elles sont écrites au §9. Il a aussi posé une exigence d'expérience : l'apporteur n'a rien à
> retenir, un seul badge d'état le lui montre (HYP-W20-BADGE, §4). Les questions 16 et 17, nées de cette
> réponse, restent ouvertes avec leur valeur par défaut.
>
> **Réponses de Williams du 2026-09-29, vers 20 h (session -d7), questions 18 et 19.** Question 18 : la
> valeur par défaut est retenue, une demande signalée ne devient **jamais** confirmée par le seul
> silence ; elle reste provisoire jusqu'à un appel concluant. Question 19, proposée par la lentille
> securite et acceptée avec les valeurs recommandées : une demande signalée sans appel concluant est
> **libérée** automatiquement, sans aucune sanction pour l'apporteur, après 3 tentatives d'appel
> `injoignable` **ou** 45 jours après l'envoi de la demande, selon ce qui arrive en premier ; les deux
> valeurs sont des paramètres de la SSOT. L'entreprise redevient disponible, l'apporteur reçoit une
> notification neutre et peut redéposer, et le nouveau dépôt suit les règles ordinaires. Portées dans
> HYP-W20-TACITE, HYP-W20-LIBERATION (nouvelle), HYP-W20-BADGE, REQ-DM-063 (proposée), REQ-DM-042,
> REQ-DM-008, REQ-SEC-060, REQ-DM-062 et REQ-UX-062, au §8 (risque 1, point ii, fermé) et dans DM-24,
> DM-13, SEC-41, UX-P1-05, UX-P1-41, UX-P1-43, JUR-T40, JUR-T01b, QA-T40, QA-T41 et l'avenant de GOV-112.
>
> **Identifiants.** Bloc réservé à W20, pour ne pas croiser les auteurs en cours (session -bf :
> UX-P1-21+, DM-33+, SEC-35+, INT-T29+, JUR-T36+, QA-T35+ ; W19 : UX-P1-16 à UX-P1-20, SEC-29 à
> SEC-34, DM-30 à DM-32, QA-T31 à QA-T33, JUR-T31 à JUR-T33) : **UX-P1-40+, DM-40+, SEC-40+,
> INT-T40+, JUR-T40+, QA-T40+**. Vérifiés libres le 2026-09-29 sur `main` (`fa90f83`) et sur les
> branches des PR ouvertes (#237, #239, #241, #242) et de toutes les branches distantes non
> fusionnées. **DM-42 n'est pas employé** : la consigne de chantier nommait « DM-42 » parmi les tâches
> à amender, alors qu'aucune tâche DM-42 n'existe ; c'est REQ-DM-042 (confirmation tacite), portée par
> DM-24, qui est visée. Laisser DM-42 libre évite qu'un même jeton désigne deux choses. Les exigences
> proposées au §3 prennent le bloc **REQ-xx-060+** (libre dans chaque famille, au-delà des
> réservations de W19).

## Sommaire

1. [Décision](#1-décision)
2. [Hypothèses W20](#2-hypothèses-w20)
3. [Exigences nouvelles et amendées](#3-exigences-nouvelles-et-amendées)
4. [Le parcours, écran par écran](#4-le-parcours-écran-par-écran)
5. [Tâches nouvelles](#5-tâches-nouvelles)
6. [Tâches existantes amendées](#6-tâches-existantes-amendées)
7. [Compatibilité](#7-compatibilité)
8. [Risques](#8-risques)
9. [Questions à Williams](#9-questions-à-williams)
10. [Chiffrage](#10-chiffrage)

---

## 1. Décision

**Décision de Williams du 2026-09-29 (session -d7) : le chantier W20 entre au plan, en phase 1.** Le
dépôt d'un contact est confirmé d'abord **par un e-mail envoyé au contact rencontré**, et
l'appel d'Axion-IA devient le **dernier recours** : il ne vise plus tous les dépôts, mais un échantillon
aléatoire et des cas ciblés. Contenu, rendu vérifiable :

1. **Formulaire de dépôt.** SIRET pré-rempli, puis le contact rencontré. Nom, fonction, e-mail et
   téléphone sont exigés ; le contexte est court. La simple vérification d'un SIRET (« Vérifier une
   entreprise ») n'envoie **jamais** d'e-mail.
2. **Message informatif, non bloquant, sans fenêtre modale**, juste au-dessus du bouton :
   « <Prénom Nom> (<Entreprise>) va recevoir un e-mail d'Axion-IA dans les 15 minutes pour confirmer
   votre échange. Elle pourra aussi être contactée par téléphone. » Le bouton s'appelle « Déposer et
   prévenir <Prénom Nom> ». Le message **informe** et ne donne aucune consigne (REQ-JUR-039, garde
   lexicale). Tous les textes passent par la SSOT de micro-copy.
3. **Délai de 15 minutes avant l'envoi.** L'apporteur peut annuler ou corriger le dépôt pendant ce
   délai, par une action « Annuler ». Passé ce délai, l'e-mail part vers l'adresse du contact, jamais
   vers une adresse générique de l'entreprise.
4. **L'e-mail** dit qui a été rencontré et dans quel contexte ; il porte deux liens uniques à usage
   unique (« Oui, nous avons échangé » / « Non »), l'information de l'article 14 du RGPD (fusionnée
   avec JUR-T09) et un lien d'opposition. Tout est journalisé. Délivrabilité : domaine d'envoi
   authentifié ; un rebond produit une alerte et propose à l'apporteur de corriger.
5. **« Oui »** confirme la rencontre : nouvelle source de confirmation, à côté de la qualification
   téléphonique (REQ-DM-008). **Sauf sur une demande signalée** (point 7) : le clic y est journalisé
   comme indice, le dépôt reste provisoire, et seul un appel concluant le confirme (HYP-W20-SOURCE,
   correction de sécurité du 2026-09-29). **« Non »** invalide le dépôt selon les règles actuelles de
   `non_confirme`, y compris la faculté de suspension (REQ-SEC-018). **Sans réponse** après N jours
   ouvrés (paramètre SSOT, 5 par défaut), le dépôt passe dans la liste d'appels.
6. **Appels.** Un échantillon **aléatoire** (paramètre), **plus** des appels **ciblés** : e-mail sans
   réponse, raison de vérification, premiers dépôts d'un nouvel apporteur (paramètre). La console
   affiche une liste « À appeler aujourd'hui » triée par priorité, intégrée à la file de qualification
   existante (UX-P1-06, UX-P1-07). Les valeurs par défaut de l'échantillon et du nombre de premiers
   dépôts appelés, données par Williams, **ne sont pas écrites dans ce dépôt public** (REQ-GOV-031,
   question 12).
7. **Adresses webmail acceptées** (Gmail et autres), avec la mention console « Vérification
   suggérée » et sa raison. Autres raisons : domaine différent du site de l'entreprise ; e-mail ou
   téléphone du contact égal à celui de l'apporteur (comparaison par empreinte) ; même contact
   réutilisé pour plusieurs entreprises ; rafale de dépôts ; clic de confirmation depuis la même
   empreinte d'IP que la session de l'apporteur. Ces dépôts passent en tête de la liste d'appels,
   intégrés aux contrôles existants (SEC-14, REQ-SEC-017 : **aucun effet défavorable automatique**).
   Une demande qui porte une raison est dite **signalée** : un clic « Oui » n'y vaut pas confirmation,
   et le silence ne la confirme pas (question 18) ; l'attribution reste réservée à l'apporteur, rien ne
   lui est retiré, seul le raccourci du clic et du silence est remplacé par un appel prioritaire.
8. **Conseillers salariés (W19)** : pas d'e-mail automatique par défaut (HYP-W20-SALARIES).
9. **Contrat, art. 3.2** : la confirmation se fait par clic du contact **ou** par contact d'Axion-IA.
   **Confirmation tacite, tranchée par Williams le 2026-09-29 (question 2)** : au bout de 30 jours sans
   réponse du contact et sans appel concluant, l'entreprise reste réservée à l'apporteur, le dépôt est
   réputé confirmé ; **sauf rebond** : tant que l'e-mail revient en erreur et que l'apporteur n'a pas
   corrigé l'adresse, le délai ne commence pas. Le délai court de la **réception** de l'e-mail, c'est-à-dire
   d'un envoi sans rebond (HYP-W20-TACITE). **Une demande signalée n'est jamais confirmée par le seul
   silence** (question 18, tranchée par Williams le 2026-09-29) ; **sans appel concluant, elle est
   libérée** après 3 appels `injoignable` ou 45 jours après l'envoi de la demande, au premier des deux
   termes, sans aucune sanction (question 19, HYP-W20-LIBERATION). Portée dans DM-24, DM-13, JUR-T40,
   JUR-T01b et JUR-T09. Aucune commission sans paiement réel : la confirmation tacite réserve
   l'entreprise, elle ne paie rien.
10. **Expérience** fluide, intuitive, moderne, sans friction (exigence transverse de Williams) ;
    REQ-UX-001 (au plus 8 interactions, 90 s) respectée ; cinq états par écran ; mobile impeccable.

**Ce qui ne bouge pas.** L'horodatage serveur au dépôt (REQ-DM-005) décide de l'antériorité ;
l'attribution naît `provisoire` ; seul `non_confirme` éteint une attribution **au titre de l'art. 3.7**
(REQ-DM-008) — la libération d'une demande signalée restée sans appel concluant (question 19) met fin à
la réservation sans rien imputer à personne, comme une péremption ; la suspension reste une **faculté** posée par un humain (REQ-SEC-018, SEC-15) ; aucun
compteur ni aucun rythme n'atteint l'apporteur (REQ-JUR-031, REQ-SEC-017) ; le contrat d'événements v2
avec axion-ia est inchangé ; aucune donnée ne quitte Partners hors l'e-mail lui-même (relais ZeptoMail,
INT-T10).

## 2. Hypothèses W20

À inscrire au §2 de `docs/DECISIONS.md` par la passe gardien-spec (question 14). Tant qu'elles n'y
sont pas, **aucune tâche ne les cite dans son champ `hyp`** (`scripts/lot/tasks.schema.json` exige
qu'une HYP citée ait sa ligne au registre) : les tâches versées les citent dans leur acceptance, et la
passe gardien-spec les portera dans `hyp` par le verbe de GOV-117.

| Id | Décision | Hypothèse appliquée | Réversibilité | Phase | À trancher avant | Tranchée |
| --- | --- | --- | --- | --- | --- | --- |
| HYP-W20-DELAI | Délai avant envoi (3) | `DELAI_AVANT_ENVOI_CONFIRMATION_MINUTES` = 15, SSOT (`src/domain/seuils/ssot.ts`). Le délai court de l'horodatage serveur du dépôt (REQ-DM-005), y compris pour un dépôt hors ligne ou par lien privé, reçu plus tard (UX-P1-03) | paramètre | 1 | — | Williams, 2026-09-29 : 15 minutes |
| HYP-W20-ANNULATION | Annuler ou corriger (3) | Le dépôt occupe l'entreprise dès sa réception : l'horodatage ne dépend pas de l'envoi de l'e-mail. Pendant le délai, « Annuler » fait passer l'attribution à `annulee` (valeur existante de REQ-DM-006) par un événement, libère l'entreprise sur-le-champ et n'emporte **aucune** autre conséquence : ce n'est ni un refus, ni un signal, ni une ligne comptée. « Corriger » ne porte que sur le contact et le contexte : c'est une **révision tracée** (ancienne valeur conservée, chiffrée), qui ne change pas `deposeeAt` ; changer d'entreprise n'est pas une correction (annuler, puis déposer). Après le délai, plus d'annulation ni de correction libre par l'apporteur, hors rebond (HYP-W20-REBOND) | migration | 1 | DM-40 | — |
| HYP-W20-DESTINATAIRE | Adresse de l'envoi (3) | L'e-mail part vers l'adresse **saisie pour le contact**, jamais vers une adresse tirée d'un autre registre (catalogue du CRM Pro, fiche entreprise, standard). Une adresse de forme générique saisie pour le contact (du type accueil ou contact de l'entreprise) est **acceptée** et reçoit l'e-mail ; elle ajoute la raison « adresse générique » (question 5) | paramètre | 1 | — | Par défaut, confirmée par Williams le 2026-09-29 (question 5) |
| HYP-W20-SOURCE | Clic « Oui » (5) | Un clic « Oui » confirme l'attribution comme une Qualification `confirme` : passage à `active`, `confirmeeAt` posée à l'instant du clic, `fenetreFinAt` qui court de cette date. Sa source est `courriel`, à côté de `appel` (REQ-DM-008 amendée). **Exception, élargie le 2026-09-29 (refus de la lentille securite sur `2340a63`)** : un clic « Oui » sur une demande **signalée**, c'est-à-dire qui porte **une** raison de vérification de HYP-W20-VERIFICATION à l'instant du clic (adresse webmail, adresse générique, domaine différent du site de l'entreprise, e-mail ou téléphone du contact égal à celui de l'apporteur par empreinte, contact réutilisé pour plusieurs entreprises, clic depuis la même empreinte d'IP qu'une session récente de l'apporteur, et toute autre raison de la liste), **n'est pas retenu** comme confirmation. La demande passe en `clic_non_retenu`, le clic est journalisé comme **indice** (date, empreinte d'IP tronquée, termes), l'attribution reste `provisoire` et part **en tête** de la liste d'appels ; seul un appel concluant de la Société (Qualification `confirme`) la confirme. Le clic non retenu ne pose pas `premierContactAt` (HYP-W20-PREMIER-CONTACT) et ne produit rien d'autre : aucune Anomalie, aucun score, aucune suspension. Un clic « Non » confirmé en second geste reste pris en compte sur une demande signalée (HYP-W20-NON). La raison est jugée à l'instant du clic ; une raison apparue après un clic retenu n'a aucun effet rétroactif. La raison « rebond » ne vaut que pour la demande en rebond : la demande née d'une correction est jugée sur sa propre adresse (question 3) | avenant | 1 | premier DocuSeal | Par défaut, confirmée par Williams le 2026-09-29 (question 3) pour le clic depuis l'empreinte d'IP de l'apporteur ; élargie à toute raison de vérification le 2026-09-29, correction de sécurité, réversible |
| HYP-W20-NON | Clic « Non » (5) | Le lien « Non » ouvre une page qui demande de confirmer en un second geste (« Je confirme n'avoir eu aucun échange avec <apporteur> ») : c'est l'indication **expresse** de l'art. 3.7. Ce second geste vaut `non_confirme` : attribution `invalidee`, entrée console qui ouvre la **faculté** de suspension (SEC-15), notification à l'apporteur avec la catégorie et sans le nom de la personne qui a répondu ; l'extrait de la réponse lui est communiqué sur demande (REQ-DM-008) | avenant | 1 | premier DocuSeal | Williams, 2026-09-29 : « Non » invalide selon les règles de `non_confirme` ; second geste et invalidation directe, valeur par défaut de la question 4, confirmés le 2026-09-29 |
| HYP-W20-LIEN | Validité des liens (4) | Deux jetons par demande (« Oui », « Non »), aléatoires, stockés **hachés**, à usage unique : la première réponse fait foi pour les deux. Un lien reste valable tant que l'attribution est `provisoire`, et au plus jusqu'à l'échéance de la confirmation tacite (HYP-W20-TACITE) ; les jetons d'une demande en rebond sont révoqués à la correction. L'ouverture d'un lien (requête GET) **ne change rien** : seule l'action sur la page (requête POST) répond, pour que les analyseurs de liens des messageries ne répondent jamais à la place du contact. Après une réponse, la page dit « Votre réponse a bien été enregistrée » ; changer d'avis passe par un échange humain avec Axion-IA | migration | 1 | SEC-40 | — |
| HYP-W20-SANS-REPONSE | Délai sans réponse (5) | `CONFIRMATION_SANS_REPONSE_JOURS_OUVRES` = 5, SSOT, jours ouvrés du calendrier de CPL-T13. Passé ce délai sans clic, le dépôt entre dans la liste d'appels ; le délai court de l'envoi effectif de l'e-mail, pas du dépôt | paramètre | 1 | — | Williams, 2026-09-29 : 5 jours ouvrés |
| HYP-W20-APPELS | Échantillon et appels ciblés (6) | Le tirage de l'échantillon est fait **au dépôt**, par un générateur cryptographique, stocké avec la demande et jamais servi à l'espace : l'apporteur ne peut ni le prévoir ni le rejouer. Appels ciblés : sans réponse (HYP-W20-SANS-REPONSE), rebond non corrigé, raison de vérification suggérée, premiers dépôts d'un nouvel apporteur. Taux d'échantillon et nombre de premiers dépôts : paramètres dont la valeur vit **hors dépôt** (REQ-GOV-031), comme les réglages des contrôles de SEC-14 ; seules les clés sont dans la SSOT (question 12) | paramètre | 1 | — | Williams, 2026-09-29 : le principe et les valeurs par défaut (tenues hors dépôt) ; valeur par défaut de la question 12 confirmée le 2026-09-29 |
| HYP-W20-VERIFICATION | Raisons de vérification (7) | Liste fermée de raisons, affichées **en console seulement**, dans la liste d'appels et la fiche de qualification : adresse webmail, adresse générique, domaine différent du site de l'entreprise, e-mail ou téléphone du contact égal à celui de l'apporteur (empreintes HMAC, REQ-SEC-024), même contact sur plusieurs entreprises, clic depuis la même empreinte d'IP que la session de l'apporteur, rebond. Une raison **trie** la liste d'appels (en tête) et **rend la demande signalée** : un clic « Oui » n'y est pas retenu (HYP-W20-SOURCE), le silence ne la confirme jamais (HYP-W20-TACITE, question 18, tranchée par Williams le 2026-09-29) et, sans appel concluant, elle est libérée au premier des deux termes de HYP-W20-LIBERATION (question 19). Ce n'est pas un effet défavorable au sens de REQ-SEC-017 : l'attribution reste `provisoire` et réservée, rien n'est retiré à l'apporteur, et la confirmation passe par la revue humaine que REQ-SEC-017 permet, un appel de la Société. La libération (HYP-W20-LIBERATION) n'en est pas un non plus, par décision de Williams du 2026-09-29 (question 19) : elle ne sanctionne rien, n'ouvre ni Anomalie ni suspension, n'impute rien à l'apporteur ni au contact, et borne dans le temps une réservation que personne n'a pu confirmer ; l'apporteur peut redéposer aux conditions ordinaires. Elle n'a aucun autre effet : aucune Anomalie, aucune entrée dans le score de SEC-14, aucune notification, aucune alerte Telegram, aucun DTO de l'espace : seul l'état du badge « appel attendu » en est dérivé côté serveur (HYP-W20-BADGE), jamais la raison, leur nombre ni le clic non retenu ; la notification de la libération (HYP-W20-LIBERATION) ne nomme ni la raison ni la vérification. **La rafale de dépôts et les premiers dépôts sont des critères de tri, jamais des raisons affichées** : REQ-SEC-017 et REQ-SEC-021 excluent le rythme de toute alerte, et ne le laissent subsister que comme critère de priorisation d'une revue humaine (question 6) | paramètre | 1 | — | Par défaut, confirmée par Williams le 2026-09-29 (question 6) |
| HYP-W20-REBOND | Rebond (4) | Un rebond définitif (webhook d'INT-T10) met la demande en `rebond`, place le dépôt en tête de la liste d'appels, et affiche à l'apporteur, dans l'espace et par e-mail, un message **informatif** qui propose de corriger l'adresse. Une correction après rebond crée une nouvelle demande (nouveaux jetons, anciens révoqués) qui part sans nouveau délai d'annulation. Corrections après rebond bornées par `CORRECTIONS_ADRESSE_MAX` = 2, SSOT ; au-delà, le dépôt reste dans la liste d'appels et l'action « Corriger l'adresse » disparaît. **Tant que le rebond n'est pas corrigé, le délai de la confirmation tacite ne commence pas** (HYP-W20-TACITE) ; après correction, l'e-mail repart, le délai court de ce nouvel envoi s'il ne rebondit pas, et l'apporteur reçoit une notification informative (clé de la table SSOT des notifications, UX-P1-10, `faitCourirUnDelai: false`) | paramètre | 1 | — | Williams, 2026-09-29 : un rebond non corrigé empêche le délai tacite de commencer (question 2) ; le reste par défaut |
| HYP-W20-TACITE | Confirmation tacite (9) | **Tranchée par Williams le 2026-09-29 (session -d7, question 2).** Au bout de `CONFIRMATION_TACITE_JOURS` (= 30, SSOT) sans réponse du contact et sans appel concluant, l'entreprise reste réservée à l'apporteur : l'attribution est **réputée confirmée**. Le délai court de la **réception** de l'e-mail de confirmation, c'est-à-dire de l'envoi effectif d'une demande à laquelle aucun rebond n'est rattaché (`recueAt`, dérivée de la demande, jamais saisie). **Sauf rebond** : tant que la demande est en `rebond` et que l'apporteur n'a pas corrigé l'adresse, le délai **ne commence pas** ; la correction fait repartir l'e-mail, et le délai court de ce nouvel envoi s'il ne rebondit pas. Un rebond rattaché après coup à un envoi lui retire sa qualité de réception : le délai n'avait pas commencé. « Appel concluant » : une Qualification `confirme` ou `non_confirme` ; `injoignable` et `ne_se_souvient_pas` ne le sont pas. Pour une demande non signalée, la promotion reste l'**unique** conséquence attachée au silence (REQ-DM-042) ; pour une demande signalée, c'est la libération de HYP-W20-LIBERATION, sans sanction (question 19) ; la promotion réserve l'entreprise et ne crée aucune commission, qui ne naît que d'un paiement réel. La proposition initiale (délai compté de la déclaration, que le contact ait été tenté ou non) est écartée. **Demande signalée, tranchée par Williams le 2026-09-29 (question 18, née de la correction de sécurité du même jour)** : une demande qui porte une raison de vérification (HYP-W20-VERIFICATION) à l'échéance n'est **jamais** promue par le seul silence ; elle reste `provisoire`, en tête de la liste d'appels, jusqu'à un appel concluant (`confirme` la confirme, `non_confirme` l'invalide), puis suit le régime ordinaire, péremption comprise (REQ-DM-007) ; **sans appel concluant, elle est libérée** au premier des deux termes de HYP-W20-LIBERATION (question 19). Sans cette règle, une adresse que l'apporteur contrôle et laisse muette ne rebondit pas, l'appel au numéro saisi finit `injoignable`, non concluant, et la tacite confirme au trentième jour | avenant | 1 | premier DocuSeal | Williams, 2026-09-29 : 30 jours à compter de la réception de l'e-mail, délai non commencé tant qu'un rebond n'est pas corrigé (question 2) ; aucune confirmation tacite d'une demande signalée, valeur par défaut retenue (question 18) |
| HYP-W20-LIBERATION | Libération d'une demande signalée (question 19) | **Tranchée par Williams le 2026-09-29 (session -d7, question 19, proposée par la lentille securite, valeurs recommandées acceptées).** Une attribution `provisoire` dont la demande est **signalée** (HYP-W20-VERIFICATION) et qui n'a reçu aucun appel concluant (Qualification `confirme` ou `non_confirme`) est **libérée** automatiquement au **premier** des deux termes : la `LIBERATION_SIGNALEE_INJOIGNABLE_MAX`-ième Qualification `injoignable` (= 3, SSOT), ou `LIBERATION_SIGNALEE_JOURS` jours (= 45, SSOT) après l'**envoi** de la demande. Les deux valeurs sont des paramètres de la SSOT (`src/domain/seuils/ssot.ts`), modifiables ; leur source est l'art. 3.2 amendé (JUR-T40), et changer une valeur change aussi le gabarit du contrat. Effets, dans une seule transaction, par le passage « tout ce qui est dû à l'instant t » (REQ-QA-027) : l'attribution passe en `perimee` (valeur existante de REQ-DM-006, déjà comptée parmi les états qui libèrent une entreprise et font courir la purge de REQ-SEC-030) par un événement propre `liberee_sans_confirmation` (un type de journal par genre de transition, partners/ADR-0022), distinct de la péremption de REQ-DM-007 (`peremptionAt` reste null) ; la demande passe en `expiree` et ses jetons sont révoqués ; l'entreprise **redevient disponible** aux conditions ordinaires d'une libération, file d'attente comprise (art. 3.5, DM-13) ; l'apporteur reçoit une **notification neutre** (clé de la table SSOT des notifications, UX-P1-10, `faitCourirUnDelai: false`, texte dans la SSOT de micro-copy, garde lexicale verte, aucune consigne), texte proposé : « La réservation de <Entreprise> a pris fin sans confirmation. L'entreprise est de nouveau disponible. » ; le badge devient ⚪ « Réservation terminée · l'entreprise est de nouveau disponible » (HYP-W20-BADGE). **Aucune sanction** : aucune suspension, aucune Anomalie, aucune entrée dans le score de SEC-14, aucun signal défavorable, rien d'imputé à l'apporteur ni au contact, et la notification ne nomme ni la raison, ni la vérification, ni le nombre d'appels. L'apporteur peut redéposer l'entreprise ensuite : le nouveau dépôt suit les règles ordinaires (nouvelle demande, jugée sur ses propres raisons à l'instant de son envoi et de ses clics). **Précisions par défaut, non dites par Williams, réversibles** : (a) les 45 jours courent de l'envoi effectif de la **première** demande de l'attribution ; une correction d'adresse après rebond ne les fait pas repartir, sans quoi deux corrections (`CORRECTIONS_ADRESSE_MAX`) tripleraient la réservation ; une demande encore `planifiee` ou `retenue` n'a pas été envoyée, et le délai ne court pas (question 16) ; (b) seules les Qualifications `injoignable` comptent, jamais `ne_se_souvient_pas` ni un e-mail sans réponse (DM-13, point 3) ; (c) une demande en rebond non corrigé porte la raison « rebond », elle est donc signalée et relève de la libération | paramètre | 1 | — | Williams, 2026-09-29 (question 19) : 3 tentatives `injoignable` ou 45 jours après l'envoi, au premier terme, sans sanction, notification neutre, redépôt aux règles ordinaires ; les précisions (a) à (c) et le libellé du badge par défaut |
| HYP-W20-BADGE | Ce que l'apporteur voit (exigence d'expérience) | Dans « Mes entreprises » (UX-P1-05) et sur la carte du dépôt (UX-P1-43), **un seul badge** d'état, avec sa date et au plus une action, dérivé côté serveur par une fonction pure, horloge injectée, partie de `statutApporteur` (REQ-UX-004) : 🟢 « Confirmée » (attribution `active`, par clic, appel ou confirmation tacite) ; 🟡 « En attente de confirmation · réservée pour vous jusqu'au <date> » (`provisoire` hors rebond non corrigé et hors demande signalée, y compris sans réponse, `injoignable`, `ne_se_souvient_pas` : rien d'autre n'est visible) ; 🟡 « En attente de confirmation — Axion-IA va appeler votre contact » (demande **signalée**, clic non retenu compris, correction de sécurité du 2026-09-29 et question 18) : **sans date tacite ni phrase d'aide**, formulation neutre, sans consigne, dans la SSOT de micro-copy ; garantie d'expérience de l'apporteur honnête (un artisan sur Gmail, par exemple) : ces dépôts sont appelés **en priorité**, en tête de la liste d'appels ; le badge ne dit ni la raison, ni leur nombre ; 🔴 « E-mail non reçu par le contact », action unique « Corriger l'adresse » (demande en `rebond` non corrigé ; sans action au-delà de `CORRECTIONS_ADRESSE_MAX`) ; ⚪ « Non confirmée par le contact » (`invalidee` par `non_confirme`) ; ⚪ « Réservation terminée · l'entreprise est de nouveau disponible » (attribution libérée, HYP-W20-LIBERATION, question 19 : `perimee` par l'événement `liberee_sans_confirmation`), **sans date, sans action, sans phrase d'aide**, formulation neutre qui ne dit ni la raison, ni la vérification, ni le nombre d'appels. La date est le jour de l'échéance tacite (`recueAt` + `CONFIRMATION_TACITE_JOURS`), écrite en toutes lettres (« 29 octobre 2026 ») dans le fuseau de l'apporteur ; le badge passe seul à 🟢 le jour affiché. 🔴 prime sur le libellé de la demande signalée tant que le rebond n'est pas corrigé. Une seule phrase d'aide, sous le 🟡 daté et sous 🔴, jamais sous le libellé de la demande signalée : « Sans réponse de votre contact, l'entreprise reste réservée pour vous 30 jours après la réception de notre e-mail. », le nombre lu de la SSOT. Textes dans la SSOT de micro-copy, garde lexicale verte ; chaque badge porte son libellé, la pastille est décorative (`aria-hidden`), la couleur n'est jamais seule porteuse du sens. Avant l'envoi effectif, et pendant un envoi retenu, 🟡 sans date (question 16) ; fuseau Europe/Paris tant que l'apporteur n'a pas de fuseau propre (question 17) | paramètre | 1 | UX-P1-05 | Williams, 2026-09-29 : un badge, quatre états, une date, au plus une action, une phrase d'aide ; les points des questions 16 et 17 par défaut ; le libellé de la demande signalée, sans date, suit la réponse à la question 18 (2026-09-29) ; l'état après libération suit la réponse à la question 19 (2026-09-29), son libellé est par défaut |
| HYP-W20-PREMIER-CONTACT | Point de départ de la péremption | `premierContactAt` (contrat art. 3.4, « première prise de contact de la Société ») est posé par la **première réponse** du contact — un clic retenu, ou un appel qui l'a joint ; un clic non retenu sur une demande signalée ne le pose pas — et **pas** par l'envoi de l'e-mail : un e-mail resté sans réponse n'est pas un contact « qui a eu lieu » (art. 3.4 al. 2). Le chrono de péremption de DM-13 ne change pas de règle, seulement de source (question 10) | avenant | 1 | premier DocuSeal | Par défaut, confirmée par Williams le 2026-09-29 (question 10) |
| HYP-W20-IDENTITE-APPORTEUR | Ce que l'e-mail dit de l'apporteur (4) | L'e-mail nomme l'apporteur par ses prénom et nom, jamais par ses coordonnées. Il ne donne **pas la date du contact** : `dateContact` n'est recueillie qu'aux fins de l'art. 3.7 et n'a que deux lectures autorisées (REQ-JUR-040) ; l'e-mail dit « récemment ». Le contrat informe l'apporteur que son nom est communiqué à la personne qu'il déclare (JUR-T40) (questions 7 et 8) | avenant | 1 | premier DocuSeal | Par défaut, confirmée par Williams le 2026-09-29 (questions 7 et 8) |
| HYP-W20-CONTEXTE | Le contexte dans l'e-mail (1, 4) | Le contexte est **facultatif**, au plus `CONTEXTE_DEPOT_CARACTERES_MAX` = 140 caractères, SSOT. Tout champ saisi par l'apporteur et repris dans l'e-mail (nom du contact, contexte) est rendu en **texte brut**, échappé, sans lien cliquable (une adresse web y est neutralisée), sans HTML (question 1) | paramètre | 1 | — | Par défaut, confirmée par Williams le 2026-09-29 (question 1) |
| HYP-W20-OPPOSITION | Lien d'opposition (4) | Le lien d'opposition vaut pour **la personne** : ses empreintes d'e-mail et de téléphone entrent dans une liste d'opposition, et ni e-mail ni appel d'Axion-IA ne lui parvient plus au titre de Partners. Le dépôt suit alors le régime « ne se prononce pas » (art. 3.2 al. 3). L'opposition de la personne n'est pas l'opposition au démarchage **de l'entreprise** (art. 3.3 bis d), qui reste un motif de refus distinct (question 9) | migration | 1 | DM-40 | Par défaut, confirmée par Williams le 2026-09-29 (question 9) |
| HYP-W20-SALARIES | Conseillers salariés (8) | Une prise en charge par un conseiller salarié (W19, DM-30, phase 2) **ne crée aucune demande de confirmation** et n'envoie aucun e-mail automatique. Réversible : un paramètre activerait la même demande pour les conseillers sans changer le schéma (question 11) | paramètre | 2 | DM-30 | Williams, 2026-09-29 : pas d'e-mail par défaut ; question 11 confirmée le 2026-09-29 |

## 3. Exigences nouvelles et amendées

**Aucune n'est écrite par cette PR.** `docs/requirements.json` est réservé à A01 et aucun verbe hors
dépôt ne sait encore **ajouter** une exigence ; les textes ci-dessous sont proposés à la passe
gardien-spec (question 14), qui les inscrit puis porte les identifiants dans le champ `reqs` des tâches
du §5 par le verbe de GOV-117. Les amendements passent par `hors-depot/reecrire-champ.mjs`, **au mot près
du texte décidé**.

### 3.1 Exigences nouvelles (jetons provisoires)

**REQ-DM-060 — La demande de confirmation par e-mail.** Tout dépôt d'un apporteur reçu par le serveur
crée, dans la même transaction, une demande de confirmation liée à l'attribution. Elle part par e-mail
`DELAI_AVANT_ENVOI_CONFIRMATION_MINUTES` après l'horodatage du dépôt (SSOT), vers l'adresse saisie pour le
contact et jamais une autre. Pendant ce délai, l'apporteur peut annuler (attribution `annulee`, entreprise
libérée, aucune autre conséquence) ou corriger le contact et le contexte (révision tracée, `deposeeAt`
inchangé). « Vérifier une entreprise » ne crée jamais de demande ; une prise en charge par un conseiller
salarié non plus (HYP-W20-SALARIES). États de la demande, enum fermé : `planifiee`, `annulee`, `envoyee`,
`retenue` (envoi retenu par le relais, REQ-INT-023), `rebond`, `repondue_oui`, `repondue_non`,
`clic_non_retenu`, `opposee`, `expiree`. Chaque changement écrit un événement dans la même transaction.
Tests : annulation à T+14 min → `annulee`, aucun envoi ; T+16 min → envoi unique ; deux passages du job
→ un seul envoi ; « Vérifier » → aucune demande.

**REQ-DM-061 — La réponse du contact.** Un « Oui » retenu confirme l'attribution (source `courriel`) ; un
« Non » confirmé en second geste vaut `non_confirme` (REQ-DM-008, art. 3.7), avec les mêmes effets qu'au
téléphone. La réponse est journalisée avec sa date, son destinataire et ses termes (libellé du bouton et
version du texte de la page), et l'extrait en est communiqué à l'apporteur sur demande. La première
réponse fait foi ; les suivantes affichent « déjà enregistrée » sans rien écrire. **Un « Oui » sur une
demande signalée** (qui porte une raison de vérification de REQ-SEC-060 à l'instant du clic, dont le clic
depuis la même empreinte d'IP qu'une session récente de l'apporteur) **n'est pas retenu** : la demande
passe en `clic_non_retenu`, le clic est journalisé comme indice, l'attribution reste `provisoire` et part
en tête de la liste d'appels ; seule une Qualification `confirme` la confirme (HYP-W20-SOURCE). Un « Non »
confirmé en second geste est pris en compte sur une demande signalée comme sur une autre. Tests :
Oui → `active` et `confirmeeAt` ; Non (second geste) → `invalidee` et entrée console, **aucune
suspension automatique** ; GET seul → rien ; double POST → une seule réponse ; clic depuis l'empreinte de
l'apporteur → `provisoire`, tête de liste ; adresse webmail contrôlée par l'apporteur et « Oui » depuis
une autre IP → `provisoire`, tête de liste, `premierContactAt` non posé ; « Non » en second geste sur une
demande signalée → `invalidee`.

**REQ-DM-062 — La liste « À appeler aujourd'hui ».** Un dépôt `provisoire` entre dans la liste d'appels
s'il est tiré dans l'échantillon, s'il fait partie des premiers dépôts d'un nouvel apporteur, si sa demande
est en rebond non corrigé, si elle est restée sans réponse `CONFIRMATION_SANS_REPONSE_JOURS_OUVRES` après
l'envoi, ou s'il porte une raison de vérification (REQ-SEC-060). Il en sort à la première réponse
(clic retenu ou qualification) ; un clic non retenu ne l'en fait pas sortir, et un dépôt signalé n'en
sort que par une qualification concluante ou par sa libération (REQ-DM-063). La liste est triée par priorité : raison de vérification, puis rebond,
puis premiers dépôts et critères de tri de revue humaine, puis sans réponse, puis échantillon ; à
priorité égale, `aQualifierDepuis` croissant. Le tri est une fonction pure, horloge injectée. Tests : un
cas par entrée ; ordre de tri ; un dépôt confirmé par clic n'y figure jamais ; un dépôt libéré n'y
figure plus.

**REQ-DM-063 — La libération d'une demande signalée (réponse de Williams du 2026-09-29, question 19).**
Une attribution `provisoire` dont la demande de confirmation est signalée (REQ-SEC-060) et qui n'a reçu
aucune Qualification `confirme` ni `non_confirme` est libérée, par le passage « tout ce qui est dû à
l'instant t » (REQ-QA-027), horloge injectée, au premier des deux termes : la
`LIBERATION_SIGNALEE_INJOIGNABLE_MAX`-ième Qualification `injoignable` (= 3, SSOT) ou
`LIBERATION_SIGNALEE_JOURS` (= 45, SSOT) jours après l'envoi effectif de la première demande de
l'attribution, qu'une correction d'adresse ne fait pas repartir. Dans la même transaction : attribution
`perimee` par l'événement `liberee_sans_confirmation`, distinct de la péremption de REQ-DM-007
(`peremptionAt` reste null) ; demande `expiree`, jetons révoqués ; entreprise de nouveau disponible,
file d'attente comprise ; notification neutre à l'apporteur (table SSOT des notifications,
`faitCourirUnDelai: false`, garde lexicale). **Aucune sanction** : aucune suspension, aucune Anomalie,
aucune entrée dans le score de SEC-14, rien d'imputé à personne ; la notification ne dit ni la raison ni
la vérification. Un nouveau dépôt de la même entreprise par le même apporteur suit les règles ordinaires.
Tests, horloge figée : deux `injoignable` → rien ; le troisième → libérée au passage suivant, une seule
fois ; envoi à J sans appel : J+45 moins une minute → rien, J+45 → libérée ; `ne_se_souvient_pas` ×3 → rien ; appel `confirme` à
J+40 → `active`, aucune libération ; demande non signalée, trois `injoignable` → aucune libération ;
correction d'adresse à J+30 → libération toujours à J+45 ; libération → aucune Anomalie, aucune
suspension, aucun signal, une seule notification ; deux passages → un seul événement ; redépôt après
libération → nouvelle attribution `provisoire` et nouvelle demande.

**REQ-SEC-060 — Les raisons de vérification suggérée.** Les raisons forment un enum fermé
(HYP-W20-VERIFICATION). Elles ne sont lues que par la liste d'appels et la fiche de qualification de la
console, et par les trois règles de la demande signalée : aucun clic « Oui » retenu (REQ-DM-061),
aucune confirmation tacite (REQ-DM-042 amendée, question 18, tranchée le 2026-09-29) et la libération
sans appel concluant (REQ-DM-063, question 19). Seuls l'état « appel attendu » du badge de REQ-UX-062
et, après libération, l'état « Réservation terminée » en sont dérivés côté serveur, jamais la raison ;
la libération n'est pas un effet défavorable au sens de REQ-SEC-017 (décision de Williams du
2026-09-29 : aucune sanction, aucune Anomalie, aucune suspension, redépôt aux règles ordinaires) ; garde AST : aucune raison n'atteint un DTO de l'espace, le score de SEC-14, une Anomalie, une
notification ou une alerte ; le rythme et le nombre de dépôts n'entrent dans aucune raison (REQ-SEC-017,
REQ-SEC-021, REQ-JUR-031). Comparaisons par empreintes HMAC seulement (REQ-SEC-024). Tests : un témoin
positif et un négatif par raison ; une raison lue depuis `src/app/(espace)/` → rouge ; une raison
« rafale » dans l'enum → rouge ; une raison dans le texte ou la charge de la notification de libération
→ rouge.

**REQ-SEC-061 — Les jetons de confirmation.** Deux jetons par demande, d'au moins 256 bits d'aléa,
stockés hachés, à usage unique, expirant avec la demande. Réponse identique pour un jeton inconnu,
expiré ou déjà consommé (aucun oracle sur l'existence d'une attribution). La page de réponse ne révèle
que le nom de l'entreprise et le prénom et nom de l'apporteur. Débit limité par empreinte d'IP ; en-têtes
`Referrer-Policy: no-referrer` et `X-Robots-Tag: noindex` ; aucun jeton dans un journal applicatif. Tests :
rejeu → sans effet ; jeton forgé → même réponse qu'un jeton expiré, octet pour octet ; GET → aucune
écriture.

**REQ-INT-060 — L'envoi différé et le rebond.** Un job « tout ce qui est dû à l'instant t » (REQ-QA-027)
envoie les demandes échues par l'émetteur d'INT-T10, qui retient l'envoi sans le drapeau DMARC
(REQ-INT-022) ou vers une adresse supprimée (REQ-INT-023). Le webhook de rebond rattache le rebond à sa
demande par l'identifiant du message, passe la demande en `rebond`, et déclenche la notification
informative de l'apporteur (clé de la table SSOT des notifications). Tests : drapeau faux → aucune
requête au relais, demande `retenue` visible ; rebond signé → `rebond` et une notification ; rebond mal
signé → rien ; worker arrêté puis relancé → rattrapage sans doublon.

**REQ-UX-060 — Le formulaire de dépôt et son message.** Le formulaire porte l'entreprise pré-remplie
(SIRET affiché, jamais saisi deux fois), le nom et prénom, la fonction, l'e-mail et le téléphone du
contact, exigés côté serveur ; le contexte est facultatif et court. Au-dessus du bouton, un message
informatif non bloquant, sans fenêtre modale, dit qui va recevoir l'e-mail, dans quel délai et pourquoi ;
le bouton se nomme « Déposer et prévenir <Prénom Nom> ». Après l'envoi du formulaire, l'écran dit à
quelle heure l'e-mail partira et propose « Annuler » et « Corriger » jusque-là. Tous les textes viennent
de la SSOT de micro-copy et passent la garde lexicale (REQ-JUR-037) : aucun texte n'est une consigne, et
un champ exigé n'est jamais marqué « obligatoire » (mot interdit par REQ-JUR-037 ; seuls les champs
facultatifs portent « (facultatif) »). Budget : REQ-UX-001 amendée.

**REQ-UX-061 — La page de réponse du contact.** Page publique, hors session, mobile d'abord, qui passe
REQ-UX-017 (cibles de 48 px, texte de 18 px, 320 px sans défilement horizontal). Deux actions visibles
sans défilement ; « Non » demande un second geste explicite ; information de l'art. 14 et lien
d'opposition sur la page. Cinq états : question posée, réponse enregistrée, déjà répondu, lien inconnu
ou expiré (même état, sans oracle), erreur réseau avec reprise.

**REQ-UX-062 — Le badge d'état de la confirmation (exigence d'expérience de Williams, 2026-09-29).**
L'apporteur n'a rien à retenir : dans « Mes entreprises » et sur la carte du dépôt, chaque dépôt en phase
de confirmation porte **un seul** badge, avec sa date et au plus une action, dérivé serveur par une
fonction pure exhaustive, horloge injectée (HYP-W20-BADGE) : 🟢 « Confirmée » ; 🟡 « En attente de
confirmation · réservée pour vous jusqu'au <date> », date en toutes lettres dans le fuseau de
l'apporteur, qui passe seul à 🟢 le jour affiché ; pour une demande signalée (REQ-SEC-060), 🟡 « En
attente de confirmation — Axion-IA va appeler votre contact », sans date ni phrase d'aide, le dépôt
étant appelé en priorité ; 🔴 « E-mail non reçu par le contact », action unique
« Corriger l'adresse », après laquelle l'e-mail repart, le délai démarre et l'apporteur est notifié
(UX-P1-10) ; ⚪ « Non confirmée par le contact » ; après une libération (REQ-DM-063), ⚪ « Réservation
terminée · l'entreprise est de nouveau disponible », sans date, sans action ni phrase d'aide, qui ne dit
ni la raison, ni la vérification, ni le nombre d'appels. Une seule phrase d'aide : « Sans réponse de votre
contact, l'entreprise reste réservée pour vous 30 jours après la réception de notre e-mail. » Textes dans
la SSOT de micro-copy, garde lexicale verte (aucune consigne, aucun « obligatoire ») ; chaque badge a son
libellé, la couleur n'est jamais seule porteuse du sens. Aucune raison de vérification, aucun tirage
d'échantillon, aucun clic non retenu n'est lisible dans le badge : le libellé de la demande signalée dit
seulement qu'un appel est attendu. Cinq états par écran. Tests : un cas par badge ; demande signalée →
libellé d'appel attendu, sans date, et aucune bascule vers 🟢 à trente jours ; demande signalée libérée
→ ⚪ « Réservation terminée », sans date ni action ; bascule 🟡 → 🟢 à l'échéance, horloge figée, y compris une échéance à 23 h 59 ; date écrite
identique au changement d'heure ; rebond → 🔴 ; correction → 🟡 avec la nouvelle date ; une valeur d'état
sans badge fait échouer le typecheck.

**REQ-JUR-060 — Ce que dit l'e-mail au contact.** L'e-mail est envoyé depuis une adresse humaine d'un
domaine authentifié (REQ-INT-022). Il nomme l'apporteur (prénom et nom), l'entreprise et le contexte s'il
existe, sans date du contact (REQ-JUR-040) ; il porte les deux liens, l'information de l'art. 14 (identité
du responsable, finalité, base légale, destinataires, durée, droits, source des données : l'apporteur) et
un lien d'opposition. Il ne demande rien d'autre qu'un clic ; il ne contient ni pièce jointe ni lien
autre que ceux-là. Le texte envoyé est versionné et la version est journalisée avec l'envoi.

### 3.2 Exigences amendées (texte proposé)

- **REQ-UX-001** — ajouter : « Les quatre coordonnées du contact (nom, fonction, e-mail, téléphone) sont
  exigées et comptent dans le budget ; le contexte est facultatif et n'y compte pas ; la case
  d'information de REQ-JUR-008 est présentée cochée par défaut. Décompte de référence : saisie de
  l'entreprise (1), choix du résultat (2), nom (3), fonction (4), e-mail (5), téléphone (6), bouton
  « Déposer et prévenir » (7), soit une interaction de marge. » Le décompte est à confirmer sur la maquette
  UX-P1-40 ; si le passage par la carte Entreprise ajoute un geste (« Déposer »), il reste 8 sans marge.
- **REQ-DM-008** — ajouter : « Une confirmation a une **source** : `appel` (Qualification) ou `courriel`
  (réponse au lien, REQ-DM-061). Les deux ont les mêmes effets sur l'attribution ; `non_confirme` peut
  naître d'un appel ou d'un « Non » confirmé en second geste. Sur une demande signalée (REQ-SEC-060),
  seule la source `appel` confirme. Une demande signalée qui n'a reçu aucun appel concluant est libérée
  selon REQ-DM-063 (trois `injoignable` ou 45 jours après l'envoi) : ce n'est pas une extinction au titre
  de l'art. 3.7, rien n'est imputé à personne, et `injoignable` reste sans effet sur une demande non
  signalée. » (dernière phrase : réponse de Williams à la question 19, 2026-09-29)
- **REQ-DM-042** — règle tranchée par Williams le 2026-09-29 (HYP-W20-TACITE). Remplacer la condition
  « provisoire dont l'enregistrement remonte à plus de `CONFIRMATION_TACITE_JOURS` sans Qualification
  `confirme` ni `non_confirme` » par : « `provisoire` dont la demande de confirmation a été **reçue**
  depuis plus de `CONFIRMATION_TACITE_JOURS`, sans confirmation ni `non_confirme`, par appel ou par
  courriel. La réception est l'envoi effectif d'une demande à laquelle aucun rebond n'est rattaché
  (`recueAt`). **Le délai ne commence pas tant que la demande est en rebond non corrigé** ; la
  correction de l'adresse par l'apporteur fait repartir l'e-mail, et le délai court de ce nouvel envoi
  s'il ne rebondit pas ; un rebond rattaché après coup retire à l'envoi sa qualité de réception. **Une
  demande qui porte une raison de vérification (REQ-SEC-060) à l'échéance n'est jamais promue par le
  silence** : elle reste `provisoire` jusqu'à une Qualification concluante, puis suit le régime
  ordinaire ; sans Qualification concluante, elle est libérée selon REQ-DM-063. Pour une demande non
  signalée, la promotion est la seule conséquence attachée au silence ; pour une demande signalée, c'est
  la libération, sans sanction. » (réponses de Williams aux questions 18 et 19, 2026-09-29 ; la phrase
  actuelle « C'est la seule conséquence attachée au défaut ou au retard de contact » est remplacée par
  celle-ci). La motivation devient l'art. 3.2
  amendé (JUR-T40). Tests frontière ajoutés : réception à J, J+29 aucune promotion, J+30 une seule ;
  rebond à J+1 non corrigé, J+90 aucune promotion (la demande en rebond est signalée, libérée à J+45,
  REQ-DM-063) ; correction à J+10 puis envoi sans rebond, promotion à
  J+40 et pas avant ; clic « Oui » retenu ou appel `confirme` avant l'échéance, aucune promotion tacite ;
  demande signalée silencieuse, J+30 aucune promotion et, à J+45, libération et jamais de promotion ; demande signalée puis appel `confirme` à
  J+35, `active` à J+35.
- **REQ-UX-004 et REQ-UX-023** — pour un dépôt en phase de confirmation, le libellé de `statutApporteur`
  est le badge de REQ-UX-062, et la phrase « prochaine étape » est sa phrase d'aide ; les phrases de
  REQ-UX-023 ne s'y ajoutent pas, et « Nous vous appelons d'abord (vérification prioritaire) » n'est
  jamais affichée pour une raison de vérification W20 (HYP-W20-VERIFICATION).
- **REQ-UX-022** — préciser que `aQualifierDepuis` est posée à l'**entrée dans la liste d'appels**
  (REQ-DM-062), et non plus au dépôt, pour les dépôts confirmés par e-mail en premier lieu : le SLA de
  48 h ouvrées porte sur un appel à passer, pas sur un dépôt que personne n'a à appeler.
- **REQ-UX-038** — l'e-mail « nous n'avons pas encore pu joindre » part à J+5 ouvrés **sans
  confirmation**, par clic ou par appel, et non plus « sans qualification » (question 13).
- **REQ-JUR-009** — « au premier contact » : l'information de l'art. 14 est portée par l'e-mail de
  confirmation, envoyé dans les 15 minutes, et reste affichée dans le script de qualification pour les
  appels.
- **REQ-JUR-008** — le texte de la case devient « Cette personne sait qu'Axion-IA va la contacter. »
  (e-mail et téléphone) ; sa version est enregistrée, comme aujourd'hui.

## 4. Le parcours, écran par écran

**Espace apporteur, dépôt (`/deposer`, UX-P1-02).** L'entreprise arrive pré-remplie de « Vérifier une
entreprise » ou de la recherche (raison sociale, ville, SIRET en lecture seule, « Changer »). Puis
« Qui avez-vous rencontré ? » : nom et prénom, fonction, e-mail (`inputmode="email"`), téléphone
(`inputmode="tel"`), contexte (facultatif, compteur de caractères discret). Champs empilés, étiquettes
toujours visibles, clavier adapté, touche « Suivant ». Message informatif au-dessus du bouton, mis à jour
à la frappe du nom ; bouton « Déposer et prévenir <Prénom Nom> », qui se replie en « Déposer et
prévenir » tant que le nom est vide ou trop long pour 320 px. Cinq états : vide (entreprise à choisir),
saisie, envoi en cours, erreur (message par champ, jamais une erreur brute), hors ligne (brouillon,
REQ-UX-013 : l'heure retenue est celle de la réception, et le délai de 15 minutes court de là).

**Espace apporteur, après le dépôt (UX-P1-43).** L'issue de `IssueDepot` s'affiche comme aujourd'hui,
avec une ligne : « L'e-mail partira vers <heure>. Vous pouvez encore annuler ou corriger ce dépôt
jusque-là. » et deux actions « Annuler » et « Corriger ». Annuler demande une confirmation en ligne dans
la même carte (pas de fenêtre modale). Après l'heure, la carte dit « E-mail envoyé à <Prénom Nom> » ;
puis « <Prénom Nom> a confirmé votre échange » à la réponse. Rebond : « L'e-mail n'a pas pu être remis à
<adresse>. Si vous avez une autre adresse pour <Prénom Nom>, vous pouvez la corriger ici. Axion-IA
pourra aussi l'appeler. » Cinq états : délai en cours, envoyé, confirmé, rebond, erreur. Passé le délai
avant envoi, la carte porte le badge de REQ-UX-062 et plus rien d'autre : en rebond, l'action unique est
« Corriger l'adresse » ; la correction enregistrée, l'e-mail repart, le badge redevient 🟡 avec sa
nouvelle date, et l'apporteur reçoit une notification informative (UX-P1-10).

**Espace apporteur, « Mes entreprises » et carte du dépôt : le badge (UX-P1-05, UX-P1-43,
HYP-W20-BADGE).** L'apporteur n'a rien à retenir, l'écran le lui montre. Chaque ligne porte **un seul**
badge, sa date et au plus une action :

| Badge | Quand | Date | Action |
| --- | --- | --- | --- |
| 🟢 « Confirmée » | attribution `active` : clic « Oui » retenu, appel `confirme` ou confirmation tacite | — | — |
| 🟡 « En attente de confirmation · réservée pour vous jusqu'au <date> » | `provisoire`, e-mail reçu (envoyé sans rebond), sans réponse ni appel concluant, demande **non signalée** | jour de l'échéance, en toutes lettres, fuseau de l'apporteur ; passe seul à 🟢 ce jour-là | — |
| 🟡 « En attente de confirmation — Axion-IA va appeler votre contact » | `provisoire`, demande **signalée** (raison de vérification, clic non retenu compris) ; appelée en priorité ; ni le clic ni le silence ne la confirment (question 18) ; sans appel concluant, libérée au premier terme de la question 19 | — (aucune date tacite ni date de libération) | — |
| 🔴 « E-mail non reçu par le contact » | demande en `rebond` non corrigé ; le délai ne court pas | — | « Corriger l'adresse » (absente au-delà de `CORRECTIONS_ADRESSE_MAX`) |
| ⚪ « Non confirmée par le contact » | `invalidee` par `non_confirme` (« Non » en second geste, ou appel) | — | — |
| ⚪ « Réservation terminée · l'entreprise est de nouveau disponible » | demande **signalée** libérée sans appel concluant : trois appels `injoignable` ou 45 jours après l'envoi, au premier terme (question 19, HYP-W20-LIBERATION, REQ-DM-063) ; aucune sanction ; une notification neutre l'accompagne | — | — |

Phrase d'aide unique, sous le 🟡 daté et sous 🔴, jamais sous le libellé de la demande signalée : « Sans
réponse de votre contact, l'entreprise reste réservée pour vous 30 jours après la réception de notre
e-mail. » 🔴 prime sur le libellé de la demande signalée tant que le rebond n'est pas corrigé. Chaque badge
a son libellé écrit ; la pastille de couleur est décorative et n'est jamais seule porteuse du sens
(REQ-UX-017). Aucun tirage, aucune raison de vérification, aucun clic non retenu n'y paraît : le libellé
de la demande signalée dit seulement qu'un appel est attendu (ce qu'il révèle est au §8, risque 1). Avant l'envoi effectif (délai de 15 minutes, envoi
retenu), 🟡 sans date (question 16). Cinq états de « Mes entreprises » : liste, vide (guide vers le
premier dépôt, REQ-UX-019), chargement, erreur avec reprise, hors ligne (dernière liste connue, avec son
heure). Cinq états de la carte du dépôt : ceux de UX-P1-43 ci-dessus.

**Après une libération (question 19).** Le libellé ⚪ « Réservation terminée · l'entreprise est de
nouveau disponible » vit dans la SSOT de micro-copy (UX-P1-41), comme les autres ; il ne porte ni date,
ni action, ni phrase d'aide, et ne dit ni la raison, ni la vérification, ni le nombre d'appels. La
notification qui l'accompagne est une clé de la table SSOT des notifications (UX-P1-10,
`faitCourirUnDelai: false`), informative et sans consigne, garde lexicale verte ; texte proposé :
« La réservation de <Entreprise> a pris fin sans confirmation. L'entreprise est de nouveau disponible. »
L'apporteur peut redéposer l'entreprise depuis « Vérifier une entreprise », comme toute entreprise
libre : le nouveau dépôt suit les règles ordinaires.

**Page publique du contact (`/confirmer/<jeton>`, UX-P1-42).** « Bonjour <Prénom Nom>. <Prénom Nom de
l'apporteur> nous indique avoir échangé avec vous récemment au sujet de <Entreprise>. Est-ce exact ? »
Deux boutons pleine largeur, « Oui, nous avons échangé » et « Non ». « Non » affiche en place une seconde
question et un bouton « Je confirme n'avoir eu aucun échange ». Sous les boutons, l'information de
l'art. 14 dépliable et « Ne plus être contacté(e) par Axion-IA ». Cinq états : question, merci, déjà
répondu, lien inconnu ou expiré (un seul texte), erreur avec « Réessayer ».

**E-mail au contact (INT-T40, textes UX-P1-41, information JUR-T09).** Objet : « Votre échange avec
<Prénom Nom de l'apporteur> ». Corps court, lisible sur téléphone, les deux liens en boutons, le reste en
texte ; version texte seul jointe (multipart), aucune image distante, aucun pixel de suivi.

**Console, « À appeler aujourd'hui » (UX-P1-07, fiche UX-P1-06).** En tête de la file de qualification,
un onglet par défaut « À appeler aujourd'hui », trié par priorité (REQ-DM-062), chaque ligne portant sa
raison en clair (« Adresse webmail — vérification suggérée », « Sans réponse depuis 5 jours ouvrés »,
« Tiré au sort », « Premier dépôt de l'apporteur »), le bouton `tel:` et le chrono SLA. La fiche montre
l'état de la demande (planifiée, envoyée, remise, rebond, réponse avec son horodatage) avant la zone de
qualification. Cinq états : liste, vide (« Personne à appeler aujourd'hui »), chargement, erreur, conflit
de version (REQ-CPL-024).

## 5. Tâches nouvelles

Quatorze tâches, **toutes versées en phase 1 par la PR qui porte ce fichier**, `a_faire`, sans
attribution. Elles ne citent que des exigences existantes ; l'identifiant de l'exigence nouvelle du §3
qu'elles réalisent est dit dans leur acceptance, et la passe gardien-spec l'ajoutera à `reqs`.
Chacune porte son champ `tests{}` (exigence citée → fichier de test à écrire), posé par
`hors-depot/poser-champ.mjs` : `docs/paths-proposes.json` en dérive ses chemins, et `gov:trace` refuse
qu'une tâche nomme comme preuve un test existant qui ne cite pas l'exigence.
Chaque ligne : phase · zone · schéma · sensible · estimation · dépendances · exigences · chemins.
Défauts : repo `partners`, `hyp` vide sauf mention, `externe` null.

#### UX-P1-40 — Maquettes W20 : dépôt révisé, page de réponse du contact, « À appeler aujourd'hui »
- 1 · espace · non · [] · 1,25 j (1 j au versement, +0,25 j pour le badge, 2026-09-29) · deps : GOV-112 · reqs : REQ-UX-001, REQ-UX-019, REQ-UX-022
- Chemins : `docs/maquettes/deposer.html`, `docs/maquettes/confirmation-contact.html`, `docs/maquettes/file-qualification.html`, `docs/maquettes/mes-entreprises.html` (ajouté le 2026-09-29), `docs/maquettes/VALIDATION.md`, `docs/ESPACE-ROUTES.md`, `tests/unit/espace/maquettes-confirmation-par-courriel.spec.ts` · label `role:ux-redaction`
- Acceptance : maquette `deposer.html` révisée (champs du §4, message, bouton nommé, carte « Annuler /
  Corriger », rebond) et **décompte des interactions écrit sur la maquette** (REQ-UX-001) ; nouvelle
  `confirmation-contact.html` (cinq états, 320 à 414 px, deux thèmes) ; `file-qualification.html` gagne
  « À appeler aujourd'hui » ; `mes-entreprises.html` (validée le 2026-09-19 pour UX-P1-05) gagne les quatre
  badges de REQ-UX-062, leur date, l'action « Corriger l'adresse » et la phrase d'aide, et se revalide.
  La route `/confirmer/<jeton>` entre dans `ESPACE-ROUTES.md`. Validation de
  Williams consignée dans `VALIDATION.md` avant toute tâche d'écran W20.

#### UX-P1-41 — Micro-copy W20 dans la SSOT : message, bouton, annulation, rebond, e-mail et page du contact, raisons de console
- 1 · espace · non · [] · 0,75 j · deps : UX-P1-40, JUR-T09, GOV-112 · reqs : REQ-JUR-039, REQ-JUR-037, REQ-UX-003, REQ-JUR-012
- Chemins : `src/content/micro-copy/espace/confirmation-du-depot.ts`, `src/content/micro-copy/public/confirmation-contact.ts`, `src/content/micro-copy/courriels/confirmation-contact.ts`, `src/content/micro-copy/console/a-appeler.ts`, `tests/unit/micro-copy/confirmation-par-courriel.spec.ts`
- Acceptance : réalise la part texte de REQ-UX-060, REQ-UX-061 et REQ-JUR-060. Aucun texte recopié hors
  SSOT ; gabarits à variables (prénom, nom, entreprise, heure), rendus sans HTML des valeurs saisies
  (HYP-W20-CONTEXTE). Textes du badge de REQ-UX-062 (quatre libellés, action « Corriger l'adresse »,
  phrase d'aide, notification de l'e-mail reparti), plus le libellé ⚪ « Réservation terminée · l'entreprise
  est de nouveau disponible » et le texte de la notification de libération (question 19) ; fin du message « Axion-IA pourra aussi
  l'appeler. » (question 15, confirmée). Garde lexicale verte sur tout texte vu par l'apporteur ; aucun
  impératif de méthode, aucun « obligatoire ». Témoin : un texte « vous devez confirmer » dans le fichier → rouge.

#### DM-40 — Demande de confirmation par e-mail : schéma, états, délai d'annulation, correction tracée
- 1 · domaine · **oui** · [attribution, rgpd] · 1,5 j · hyp : HYP-C1 · deps : DM-07, DM-08, CPL-T13, INT-T10, JUR-T02, GOV-112 · reqs : REQ-DM-008, REQ-DM-031, REQ-SEC-024, REQ-DM-005
- Chemins : `prisma/schema.prisma`, `prisma/migrations/`, `src/domain/confirmation/demande.ts`, `src/domain/seuils/ssot.ts`, `src/domain/evenement/charges.ts`, `src/server/securite/pii.ts`, `docs/rgpd/registre-article-30.md`, `tests/unit/domaine/demande-de-confirmation.spec.ts`, `tests/integration/demande-de-confirmation.spec.ts` · label `schema`
- Acceptance : réalise REQ-DM-060 (HYP-W20-DELAI, HYP-W20-ANNULATION, HYP-W20-DESTINATAIRE,
  HYP-W20-OPPOSITION, HYP-W20-SALARIES). Table des demandes et de leurs jetons hachés, enum d'états
  fermé, colonnes de révision chiffrées, empreinte d'IP du clic (tronquée, salée) ; paramètres SSOT du §2
  (les valeurs d'échantillon restent hors dépôt). **La table ajoutée reçoit sa ligne au §3 du registre de
  l'article 30 dans la même PR** : `tests/unit/juridique/registre-rgpd.spec.ts` rougit sinon.

#### SEC-40 — Jetons de confirmation à usage unique : aléa, hachage, GET sans effet, réponse sans oracle
- 1 · securite · non · [attribution, auth, rgpd] · 1 j · deps : DM-40, GOV-112 · reqs : REQ-SEC-024, REQ-DM-008
- Chemins : `src/server/confirmation/jetons.ts`, `tests/unit/securite/jetons-de-confirmation.spec.ts`, `tests/integration/jetons-de-confirmation.spec.ts`
- Acceptance : réalise REQ-SEC-061 (HYP-W20-LIEN). Témoins à deux faces : jeton valide → réponse une
  fois ; même jeton rejoué, jeton forgé, jeton expiré → réponse identique octet pour octet ; un GET
  répété (analyseur de liens simulé) n'écrit rien.

#### INT-T40 — Envoi différé de la demande et rebonds : job échu, émetteur ZeptoMail, rattachement du rebond, notification de l'apporteur
- 1 · integration · non · [attribution, rgpd] · 1,25 j · deps : DM-40, SEC-40, UX-P1-41, UX-P1-10, GOV-112 · reqs : REQ-INT-022, REQ-INT-023, REQ-JUR-009, REQ-QA-027
- Chemins : `src/server/confirmation/envoi.ts`, `src/server/confirmation/rebonds.ts`, `src/server/notifications/table-ssot.ts`, `tests/integration/envoi-differe-de-la-confirmation.spec.ts`, `tests/unit/email/gabarit-confirmation-contact.spec.ts`
- Acceptance : réalise REQ-INT-060 et la part envoi de REQ-JUR-060 (HYP-W20-REBOND). Le job ne part
  jamais avant l'échéance, jamais deux fois ; une demande annulée n'envoie rien ; le rebond suit
  HYP-W20-REBOND. La notification de rebond à l'apporteur est informative (REQ-JUR-039) et ne fait courir
  aucun délai (`faitCourirUnDelai: false`).

#### DM-41 — Réponse du contact : « Oui » confirme, « Non » confirmé vaut non_confirme, clic non retenu, journal
- 1 · domaine · non · [attribution] · 1,25 j · hyp : HYP-C1 · deps : DM-40, SEC-40, DM-09, SEC-15, GOV-112 · reqs : REQ-DM-008, REQ-DM-006, REQ-SEC-018, REQ-DM-042
- Chemins : `src/domain/confirmation/reponse.ts`, `src/server/confirmation/reponse.ts`, `tests/unit/domaine/reponse-du-contact.spec.ts`, `tests/integration/reponse-du-contact.spec.ts`
- Acceptance : réalise REQ-DM-061 (HYP-W20-SOURCE, HYP-W20-NON, HYP-W20-PREMIER-CONTACT). Transitions
  par la matrice de DM-08, événement dans la même transaction ; « Non » ouvre l'entrée console de SEC-15
  et ne suspend rien ; `premierContactAt` posé par la première réponse retenue. Correction de sécurité
  du 2026-09-29 : un « Oui » sur une demande signalée (toute raison de SEC-41 à l'instant du clic) n'est
  pas retenu, est journalisé comme indice, laisse le dépôt `provisoire` en tête de la liste d'appels ;
  seule une Qualification `confirme` le confirme ; un « Non » en second geste y reste pris en compte.

#### DM-43 — Liste « À appeler aujourd'hui » : entrée, sortie et tri par priorité, en fonction pure
- 1 · domaine · non · [attribution] · 1 j · deps : DM-40, SEC-41, CPL-T13, GOV-112 · reqs : REQ-UX-022, REQ-SEC-017, REQ-JUR-031, REQ-CPL-013
- Chemins : `src/domain/confirmation/liste-d-appels.ts`, `tests/unit/domaine/liste-d-appels.spec.ts`, `tests/integration/liste-d-appels.spec.ts`
- Acceptance : réalise REQ-DM-062 (HYP-W20-APPELS, HYP-W20-SANS-REPONSE). Tirage de l'échantillon au
  dépôt par générateur cryptographique, stocké, jamais servi à l'espace ; valeurs lues d'une
  configuration hors dépôt, clé absente = aucun échantillon et un avertissement d'exploitation, jamais un
  défaut deviné. Aucune donnée de rythme n'entre dans une raison affichée.

#### SEC-41 — Raisons « Vérification suggérée » : liste fermée, empreintes, console seulement, aucun effet défavorable
- 1 · securite · non · [attribution, rgpd] · 1,25 j · deps : SEC-14, DM-40, DM-41, GOV-112 · reqs : REQ-SEC-017, REQ-SEC-036, REQ-SEC-024, REQ-SEC-021, REQ-JUR-031
- Chemins : `src/server/securite/verification-suggeree.ts`, `tests/unit/securite/verification-suggeree.spec.ts`, `tests/integration/verification-suggeree.spec.ts`
- Acceptance : réalise REQ-SEC-060 (HYP-W20-VERIFICATION). Branchée à côté des contrôles de SEC-14,
  sans entrer dans son score ; la raison « contact générique » de SEC-14 et « adresse générique » ne se
  cumulent pas. Garde AST et témoins de REQ-SEC-060. Correction de sécurité du 2026-09-29 : expose un
  prédicat pur « demande signalée », lu par DM-41 (clic non retenu), DM-24 (aucune promotion tacite,
  question 18, tranchée le 2026-09-29), DM-13 (libération sans appel concluant, question 19) et DM-43
  (tête de liste) ; seul l'état « appel attendu » du badge en atteint l'espace,
  jamais la raison ; la raison « rebond » ne vaut que pour la demande en rebond.

#### UX-P1-42 — Page publique de réponse du contact : deux actions, second geste pour « Non », art. 14, opposition, cinq états
- 1 · espace · non · [attribution, rgpd] · 1 j · deps : UX-P1-40, UX-P1-41, DM-41, SEC-40, GOV-112 · reqs : REQ-JUR-009, REQ-UX-017, REQ-UX-019, REQ-DM-008
- Chemins : `src/app/(public)/confirmer/[jeton]/page.tsx`, `src/app/(public)/confirmer/[jeton]/actions.ts`, `tests/unit/public/page-de-confirmation.spec.ts`, `tests/e2e/public/confirmation-contact.spec.ts`
- Acceptance : réalise REQ-UX-061. Réponse en au plus 2 interactions pour « Oui », 3 pour « Non »
  (E2E mobile-chrome) ; axe-core sans violation sérieuse ; aucune ressource tierce chargée.

#### UX-P1-43 — Annuler ou corriger un dépôt pendant le délai, corriger l'adresse après un rebond
- 1 · espace · non · [attribution, espace] · 1,25 j (1 j au versement, +0,25 j pour la correction qui fait repartir l'e-mail et le délai, 2026-09-29) · deps : UX-P1-02, DM-40, INT-T40, UX-P1-41, UX-P1-05, GOV-112 · reqs : REQ-UX-002, REQ-UX-019, REQ-JUR-039
- Chemins : `src/components/espace/depot-avant-envoi.tsx`, `src/server/confirmation/annulation.ts`, `tests/unit/espace/annuler-ou-corriger.spec.ts`, `tests/e2e/espace/annuler-ou-corriger.spec.ts`
- Acceptance : réalise la part « après le dépôt » de REQ-UX-060 (HYP-W20-ANNULATION, HYP-W20-REBOND).
  Annuler en au plus 2 interactions depuis la carte ; un refus serveur passé l'échéance dit pourquoi, sans
  erreur brute ; cloisonnement : l'annulation d'un dépôt d'un autre apporteur rend le 404 identique
  (REQ-SEC-009). Passé le délai, la carte porte le badge de REQ-UX-062 (composant de UX-P1-05) ; « Corriger
  l'adresse » en rebond crée la nouvelle demande, l'e-mail repart, le délai tacite démarre à sa réception,
  et une notification informative prévient l'apporteur (UX-P1-10). Si la nouvelle demande est signalée,
  la carte porte le libellé « Axion-IA va appeler votre contact », sans date ; si elle est libérée
  (question 19), la carte porte ⚪ « Réservation terminée », sans action.

#### JUR-T40 — Gabarit de contrat v1 : art. 3.2 (clic ou contact d'Axion-IA, règle tacite tranchée), 3.4, 3.7 et information de l'apporteur sur son nom
- 1 · juridique · non · [] · 0,5 j · hyp : HYP-C1 · deps : JUR-T01, GOV-112 · reqs : REQ-JUR-003, REQ-DM-042, REQ-JUR-009
- Chemins : `docs/contrat/CONTRAT-APPORTEUR-V1.md`, `tests/unit/contrat/confirmation-au-contrat.spec.ts`
- Acceptance : art. 3.2 : confirmation par la réponse du contact à la demande de la Société (clic) **ou**
  lors d'une prise de contact de la Société, « … sauf lorsque la demande fait l'objet d'une vérification,
  auquel cas seule une prise de contact concluante de la Société vaut confirmation » (correction de
  sécurité du 2026-09-29) ; confirmation tacite réécrite selon HYP-W20-TACITE,
  **tranchée par Williams le 2026-09-29**, texte proposé : « À défaut de réponse de l'entreprise et de
  prise de contact concluante dans un délai de trente jours à compter de la réception de la demande de
  confirmation, l'attribution est réputée confirmée, sauf lorsque la demande fait l'objet d'une
  vérification, auquel cas seule une prise de contact concluante de la Société vaut confirmation. La
  demande est réputée reçue lorsqu'elle a été envoyée à l'adresse déclarée sans être retournée en erreur ;
  tant qu'elle revient en erreur et que l'Apporteur n'a pas communiqué une adresse corrigée, ce délai ne
  court pas. Lorsque la demande fait l'objet d'une vérification et qu'aucune prise de contact concluante
  n'a eu lieu, l'attribution prend fin après trois tentatives de prise de contact restées sans réponse ou
  à l'expiration d'un délai de quarante-cinq jours à compter de l'envoi de la demande, selon ce qui
  survient en premier, sans aucune conséquence pour l'Apporteur, qui peut déclarer à nouveau l'entreprise
  dans les conditions ordinaires. La confirmation réputée acquise et, pour une demande qui fait l'objet
  d'une vérification, la fin de l'attribution sont les seules conséquences attachées au silence de
  l'entreprise. » (la réserve de la vérification suit la réponse de Williams à la question 18, la fin
  de l'attribution sa réponse à la question 19, 2026-09-29 ; les deux nombres sont ceux de la SSOT) ; art. 3.4 : « première prise de contact » lue selon
  HYP-W20-PREMIER-CONTACT ; art. 3.7 : la réponse par clic est journalisée avec sa date, la personne
  destinataire et ses termes ; l'apporteur est informé que ses prénom et nom sont communiqués à la
  personne qu'il déclare (HYP-W20-IDENTITE-APPORTEUR). Identifiants de clause inchangés (REQ-JUR-003).

#### JUR-T41 — Registre de l'article 30 et AIPD : TRT-TIERS gagne la confirmation par e-mail
- 1 · juridique · non · [rgpd] · 0,5 j · deps : JUR-T04, DM-40 · reqs : REQ-JUR-009, REQ-DM-031
- Chemins : `docs/rgpd/registre-article-30.md`, `docs/rgpd/aipd.md`, `tests/unit/juridique/confirmation-par-courriel-au-registre.spec.ts`
- Acceptance : TRT-TIERS : finalité « confirmation de l'échange par e-mail », données (réponse,
  horodatage, empreinte d'IP du clic, jetons hachés), destinataire (relais d'envoi déjà listé), durées,
  opposition (HYP-W20-OPPOSITION) ; l'AIPD nomme le risque d'un e-mail parti à une mauvaise adresse et sa
  mesure (liste de suppression, un seul envoi, aucune relance au contact). Toute rubrique sans source
  s'écrit « À compléter », avec sa question.

#### QA-T40 — E2E W20 : dépôt complet en au plus 8 interactions, annulation, envoi à l'échéance, réponses, rebond, liste d'appels
- 1 · qualite · non · [] · 1,5 j (1,25 j au versement, +0,25 j pour la bascule du badge et le rebond corrigé, 2026-09-29) · deps : QA-T16, UX-P1-02, UX-P1-07, UX-P1-42, UX-P1-43, INT-T40, DM-41, GOV-112 · reqs : REQ-QA-017, REQ-UX-001, REQ-DM-008, REQ-QA-027
- Chemins : `tests/e2e/espace/depot-avec-confirmation-par-courriel.spec.ts`, `tests/e2e/console/a-appeler-aujourd-hui.spec.ts`
- Acceptance : parcours mobile (iPhone et Pixel) avec horloge simulée : dépôt en au plus 8 interactions
  et 90 s, contact complet ; annulation avant l'échéance → aucun envoi ; échéance → un envoi ; « Oui » →
  confirmée dans l'espace ; « Non » → issue de non-confirmation ; rebond → message et correction ; la
  console montre le dépôt dans « À appeler aujourd'hui » au bon rang. Horloge figée : badge 🟡 avec sa
  date en toutes lettres, bascule 🟡 → 🟢 le jour affiché, rebond → 🔴, correction → e-mail reparti, 🟡
  avec la nouvelle date et notification ; aucune bascule tant que le rebond n'est pas corrigé. Témoin de
  la correction de sécurité du 2026-09-29 : une demande signalée (adresse webmail) et silencieuse pendant
  trente jours reste non confirmée, badge « Axion-IA va appeler votre contact » sans date, et figure
  en tête de « À appeler aujourd'hui ». Témoins de la réponse à la question 19 (2026-09-29), horloge
  figée : une demande signalée qui reçoit trois appels `injoignable` est libérée, badge ⚪ « Réservation
  terminée », une notification ; une demande signalée sans appel est libérée 45 jours après l'envoi, et
  pas avant ; un redépôt de la même entreprise repart aux règles ordinaires ; un rebond jamais corrigé
  ne passe jamais à 🟢 et finit libéré 45 jours après l'envoi.

#### QA-T41 — Témoins d'attaque : fraude à la confirmation
- 1 · qualite · non · [attribution, rgpd] · 1 j · deps : SEC-40, SEC-41, DM-41, INT-T40, UX-P1-42, GOV-112 · reqs : REQ-SEC-017, REQ-SEC-024, REQ-DM-008
- Chemins : `tests/integration/attaque-fraude-a-la-confirmation.spec.ts`
- Acceptance : un témoin par scénario du §8 (risques 1 à 5), chacun vu rouge sur une mutation de la
  garde qu'il vise ; plus un témoin du contact inventé : une adresse qui rebondit ne fait jamais courir
  le délai tacite, et une mutation qui le fait partir de l'envoi ou du dépôt rougit ; aucun détail de réglage des contrôles dans le test (REQ-GOV-031).
  Témoins de la correction de sécurité du 2026-09-29, chacun vu rouge sur la mutation qui retient le clic
  ou promeut le silence : une adresse webmail contrôlée par l'apporteur et un « Oui » depuis une autre IP
  laissent le dépôt `provisoire` ; une demande signalée et silencieuse pendant trente jours reste non
  confirmée. Témoins de la réponse à la question 19 (2026-09-29), chacun vu rouge sur sa mutation : trois
  `injoignable` → libérée ; 45 jours après l'envoi → libérée, et une mutation qui fait repartir le délai
  à la correction d'adresse rougit ; la libération n'ouvre ni Anomalie, ni suspension, ni signal, et une
  mutation qui en pose un rougit ; une notification neutre, une seule, sans raison ni vérification.

## 6. Tâches existantes amendées

Toutes par la PR qui porte ce fichier (UX-P1-05 ajoutée le 2026-09-29, après la réponse de Williams), par `hors-depot/reecrire-champ.mjs` (acceptance présente) ou
`hors-depot/poser-champ.mjs` (acceptance absente, sous la forme « Contraintes W20 à intégrer : … »),
texte brut, `--si-inchange`, motif consigné. Aucune écriture de `reqs`, `hyp` ni `zone` : le verbe de
GOV-117 n'existe pas encore.

**Dépendance de GOV-112, posée le 2026-09-29** (dette bloquante de la lentille exactitude sur `2340a63`) :
toute tâche W20 dont l'acceptance s'appuie sur une exigence W20 nouvelle ou amendée dépend de GOV-112,
qui les écrit. Vingt et une tâches : DM-24, DM-41, JUR-T40 et UX-P1-05 (nommées par la lentille), puis
DM-40, DM-43, SEC-40, SEC-41, INT-T40, UX-P1-40, UX-P1-41, UX-P1-42, UX-P1-43, QA-T40, QA-T41 (tâches
nouvelles qui réalisent une REQ-xx-060+ ou éprouvent REQ-DM-061 et REQ-DM-042 amendée), UX-P1-02
(REQ-UX-001 amendée), UX-P1-06 (REQ-DM-008 amendée), UX-P1-07 (REQ-UX-022 amendée), DM-13 (REQ-UX-038
amendée, REQ-DM-063 depuis la question 19), JUR-T09 (REQ-JUR-060) et SEC-12 (REQ-JUR-008 amendée). JUR-T41 n'en dépend pas : son
acceptance ne lit aucune exigence W20.

| Tâche | Geste | Ce qui change | Estimation |
| --- | --- | --- | --- |
| UX-P1-02 | pose d'acceptance | formulaire du §4 : quatre coordonnées exigées, contexte facultatif, message informatif, bouton nommé, décompte REQ-UX-001 | 1 → 1,25 j |
| UX-P1-06 | pose d'acceptance | la fiche affiche l'état de la demande et la raison de vérification ; l'appel est la seconde source de confirmation | 1 → 1,25 j |
| UX-P1-07 | titre réécrit, pose d'acceptance, dépendance DM-43 | « À appeler aujourd'hui » intégrée à la file, tri de REQ-DM-062, SLA sur l'entrée dans la liste | 1 → 1,5 j |
| DM-08 | réécriture d'acceptance | transitions `provisoire → annulee` (annulation dans le délai), `provisoire → active` (clic retenu), `provisoire → invalidee` (« Non » confirmé), dans la matrice, par genre de transition | 1,25 → 1,5 j |
| DM-09 | réécriture d'acceptance | la Qualification reste append-only ; une confirmation par clic compte pour la dérivation du palier comme une Qualification `confirme` | inchangée |
| DM-13 | pose d'acceptance, puis réécriture et dépendances DM-40, SEC-41 et UX-P1-10 le 2026-09-29 (question 19) | péremption comptée depuis la première réponse (HYP-W20-PREMIER-CONTACT) ; e-mail J+5 de REQ-UX-038 « sans confirmation » ; libération d'une demande signalée sans appel concluant (REQ-DM-063, HYP-W20-LIBERATION) : trois `injoignable` ou 45 jours après l'envoi, `perimee` par `liberee_sans_confirmation`, notification neutre, aucune sanction | 0,75 → 1 j le 2026-09-29 (un terme de plus au passage, une transition, une clé de notification, leurs témoins) |
| DM-24 | réécriture d'acceptance, dépendance DM-40 | condition « sans confirmation ni `non_confirme`, par appel ou par courriel » ; règle HYP-W20-TACITE tranchée le 2026-09-29 : délai compté de la réception (`recueAt`), non commencé pendant un rebond non corrigé, bascule le jour affiché par le badge ; correction de sécurité du 2026-09-29 : aucune promotion d'une demande signalée (question 18, tranchée le 2026-09-29), qui relève de la libération de DM-13 (question 19) ; dépendances GOV-112 et SEC-41 (prédicat « demande signalée », ajoutée le 2026-09-29) | 0,5 → 0,75 j au versement, → 1 j le 2026-09-29 (lecture de la demande, rebond, correction, échéance au jour affiché) |
| SEC-12 | pose d'acceptance | contrôle serveur des quatre coordonnées ; nouveau texte versionné de la case (REQ-JUR-008) ; « Vérifier » ne crée aucune demande | 1,25 → 1,5 j |
| SEC-14 | réécriture d'acceptance | les raisons de vérification W20 n'entrent pas dans le score ; pas de double comptage avec « contact générique » | inchangée |
| SEC-15 | réécriture d'acceptance | un « Non » par e-mail ouvre la même entrée console qu'un `non_confirme` par appel ; les faits notifiés citent la réponse et sa date | inchangée |
| SEC-16 | pose d'acceptance | « Vérifier une entreprise » n'envoie jamais d'e-mail et ne crée aucune demande : témoin | inchangée |
| JUR-T09 | pose d'acceptance, puis réécriture le 2026-09-29 | l'information de l'art. 14 est portée par l'e-mail de confirmation (REQ-JUR-060) et le script d'appel ; texte fusionné, lien d'opposition, journal ; règle HYP-W20-TACITE tranchée rappelée, avec la réserve de la demande signalée (2026-09-29) ; dépendance GOV-112 | 0,5 → 0,75 j |
| JUR-T01b | réécriture d'acceptance, dépendance JUR-T40 | la relecture du gabarit v1 par Williams porte aussi l'art. 3.2 de W20, dont le texte de la règle tacite tranchée le 2026-09-29 (réception de l'e-mail, délai non commencé pendant un rebond non corrigé) et, depuis la correction de sécurité du 2026-09-29, la réserve de la demande qui fait l'objet d'une vérification, puis sa libération (question 19) | inchangée (0 j) |
| UX-P1-05 | pose d'acceptance, dépendances DM-40 et DM-24 (2026-09-29) | le badge unique de REQ-UX-062 : quatre états, date en toutes lettres, action « Corriger l'adresse », phrase d'aide, cinq états de l'écran ; libellé de la demande signalée, sans date (2026-09-29) ; état ⚪ « Réservation terminée » après libération (question 19) ; dépendance GOV-112 | 1 → 1,25 j (l'état ajouté le 2026-09-29 est absorbé : un cas de plus dans la même fonction pure) |
| QA-T16 | pose d'acceptance | le parcours de REQ-QA-017 se mesure avec les quatre coordonnées du contact ; le parcours W20 complet est dans QA-T40 | inchangée |
| GOV-112 | avenant d'acceptance (2026-09-29, dette bloquante de la lentille exactitude) | écrit AUSSI, dans le même lot gardien-spec après GOV-116, les dix-huit HYP-W20 du §2 (HYP-W20-LIBERATION ajoutée le 2026-09-29, question 19), les onze exigences nouvelles du §3.1 (REQ-DM-060, REQ-DM-061, REQ-DM-062, REQ-DM-063 ajoutée le 2026-09-29, REQ-SEC-060, REQ-SEC-061, REQ-INT-060, REQ-UX-060, REQ-UX-061, REQ-UX-062, REQ-JUR-060) et les neuf amendements du §3.2 (REQ-UX-001, REQ-DM-008, REQ-DM-042, REQ-UX-004, REQ-UX-023, REQ-UX-022, REQ-UX-038, REQ-JUR-009, REQ-JUR-008), et les questions 18 et 19 avec leur réponse datée du 2026-09-29 ; aucune tâche GOV nouvelle | non rechiffrée ici (≈ 0,5 j, §10) |

## 7. Compatibilité

**Ticket #220 (SIRET obligatoire, durée de 6 mois, catalogue de prospects du CRM Pro) — rien n'est
tranché ici.** W20 est écrit pour tenir quelle que soit la réponse :

- **SIRET obligatoire** (point 6 du ticket) : le formulaire W20 affiche déjà le SIRET pré-rempli ; le
  rendre exigé ne change ni le décompte (il est pré-rempli, jamais saisi deux fois) ni les tâches W20.
  REQ-UX-001 dit aujourd'hui « aucun champ SIREN/SIRET obligatoire » : c'est la réponse au ticket qui
  l'amendera, pas W20.
- **Durée de 6 mois** (point 7) : W20 n'emploie aucune durée d'attribution en dur ; la fenêtre court de
  `confirmeeAt`, posée par le clic ou l'appel, quelle que soit sa valeur (`{{FENETRE_MOIS}}`).
- **Catalogue de prospects** (points 1 à 4) : le catalogue pré-remplirait **l'entreprise**, jamais **le
  contact**. Le contact rencontré reste exigé et saisi par l'apporteur ; l'e-mail part vers cette
  adresse, jamais vers l'e-mail générique publié du catalogue (HYP-W20-DESTINATAIRE).
- **Antériorité par « SIRET saisi et contact eu »** (point 5) : W20 fournit la preuve du contact (clic
  journalisé, ou appel) ; l'horodatage du dépôt reste celui du serveur de Partners.

**W19 (conseillers salariés).** Aucune demande de confirmation pour une prise en charge (HYP-W20-SALARIES) ;
côté apporteur, une entreprise prise en charge reste indiscernable d'une occupation par un apporteur, et
W20 n'y ajoute aucune différence visible.

**Auteurs en cours.** Aucune tâche W20 ne touche un fichier d'une PR ouverte (#237, #239, #241, #242).
DM-40 écrit le registre de l'article 30 que JUR-T04 a livré : il s'y ajoute une ligne, rien ne s'y
réécrit.

## 8. Risques

1. **Le fraudeur saisit sa propre adresse, ou celle d'un complice.** **Ce paragraphe déclarait le cas
   fermé, à tort** (refus de la lentille securite sur `2340a63`) : l'apporteur saisissait une adresse
   webmail qu'il contrôle, admise au point 7 du §1, changeait d'IP et cliquait « Oui » ; HYP-W20-SOURCE
   retenait ce clic, et la raison « webmail » ne faisait que trier la liste d'appels. La confirmation
   tacite menait au même résultat en trente jours : une adresse muette ne rebondit pas, et l'appel au
   numéro saisi finit `injoignable`, non concluant.
   **Ce qui est fermé depuis le 2026-09-29.** Sur une demande signalée (toute raison de
   HYP-W20-VERIFICATION), aucun clic « Oui » n'est retenu (HYP-W20-SOURCE) et le silence ne confirme
   jamais (HYP-W20-TACITE, question 18) : seule une Qualification `confirme` d'un appel de la
   Société confirme le dépôt. **Tranché par Williams le 2026-09-29** : la valeur par défaut de la
   question 18 est retenue, et la question 19 borne la réservation qui en résulte. Les autres contrôles restent : empreintes des coordonnées de l'apporteur,
   domaine étranger au site, contact réutilisé, échantillon imprévisible, premiers dépôts appelés.
   **Ce qui reste possible.** (i) Une adresse qu'aucune raison ne signale et que le fraudeur contrôle :
   celle d'un complice au domaine du site de l'entreprise, ou un domaine acheté pour l'occasion quand
   l'entreprise n'a pas de site connu, la comparaison de domaine n'ayant alors rien à comparer ; un clic
   depuis une autre IP y est retenu, ou la tacite confirme au trentième jour. Seuls l'échantillon, les
   premiers dépôts appelés et le contrôle humain de l'art. 3.7 le rattrapent. (ii) **Fermé le 2026-09-29
   (question 19, proposée par la lentille securite, tranchée par Williams).** Un dépôt signalé que la
   Société ne joignait jamais (numéro saisi muet, `injoignable` répété) restait `provisoire` et gardait
   l'entreprise réservée sans terme, la péremption ne courant qu'à partir d'un premier contact
   (REQ-DM-007). Il est désormais libéré après trois `injoignable` ou 45 jours après l'envoi, au premier
   terme (REQ-DM-063, HYP-W20-LIBERATION), sans aucune sanction ; l'entreprise redevient disponible,
   file d'attente comprise. Le rebond jamais corrigé, qui porte la raison « rebond », est borné de même.
   **Ce qui en reste** : l'apporteur peut redéposer la même entreprise, et le nouveau dépôt suit les règles
   ordinaires (réponse de Williams) ; un fraudeur qui redépose avec la même adresse muette obtient une
   nouvelle réservation signalée, de nouveau bornée. Le cycle est borné par la file d'attente (un autre
   apporteur inscrit passe avant le redépôt, art. 3.5), par l'appel prioritaire de chaque dépôt signalé et
   par la raison « même contact sur plusieurs entreprises » ; aucune règle n'en limite le nombre. Le
   redépôt n'est pas une reconduction au sens de l'art. 3.4 bis (il ouvre une attribution nouvelle, de
   nouveau bornée), mais sa répétition touche l'intention de cet article (pas de portefeuille permanent) :
   la limiter serait une modalité nouvelle, à décider par Williams, pas par ce plan. (iii) Le libellé « Axion-IA va
   appeler votre contact » dit à l'apporteur qu'une vérification existe, jamais laquelle ; un fraudeur y
   apprend que son clic n'a pas compté, sans rien pouvoir en tirer, puisque aucun clic ne sera retenu sur
   cette demande.
   **Pourquoi c'est borné.** Aucune commission sans paiement réel : un dépôt confirmé à tort ne rapporte
   rien tant que la Société n'a pas vendu et encaissé, et la vente passe par un échange réel avec
   l'entreprise, qui fait apparaître le faux contact (art. 3.7, `non_confirme`). Le dépôt signalé part en
   tête de la liste d'appels : la durée pendant laquelle il occupe l'entreprise sans vérification se
   compte en jours ouvrés, et elle est plafonnée à 45 jours ou trois appels sans réponse (question 19).
   Une fois le contact joint, la péremption ordinaire de 90 jours
   court (REQ-DM-007). Aucun de ces contrôles ne produit d'effet défavorable automatique : l'apporteur
   honnête garde l'entreprise réservée et ne perd que le raccourci du clic et du silence.
2. **Les analyseurs de liens des messageries ouvrent les liens avant le destinataire.** Un lien à usage
   unique qui répondrait à l'ouverture ferait répondre une machine — et un « Non » machinal invaliderait
   un dépôt honnête. Fermé : l'ouverture ne change rien, seule l'action sur la page répond, et « Non »
   exige un second geste (HYP-W20-LIEN, HYP-W20-NON, SEC-40).
3. **L'e-mail d'Axion-IA comme relais d'hameçonnage.** L'apporteur choisit le destinataire et une partie
   du texte d'un e-mail parti d'un domaine authentifié. Fermé : champs saisis rendus en texte brut, liens
   neutralisés, contexte court, aucune pièce jointe, un seul e-mail par dépôt, aucune relance au contact,
   liste d'opposition et de suppression.
4. **Jetons devinés ou rejoués.** Aléa d'au moins 256 bits, stockage haché, usage unique, réponse
   identique pour tout jeton non valable, débit limité (SEC-40).
5. **Mauvaise adresse, « Non » d'un inconnu.** Une faute de frappe peut envoyer l'e-mail à un tiers, qui
   répondrait « Non ». Borné : le second geste, le nom de l'entreprise et de l'apporteur sur la page, la
   faculté de suspension restée humaine (REQ-SEC-018), l'extrait communiqué à l'apporteur et la
   contestation écrite. Question 4 : faut-il un appel avant d'invalider quand une raison de vérification
   existe ?
6. **Délivrabilité.** Un sous-domaine neuf tombe souvent en indésirables : beaucoup de « sans réponse »,
   donc plus d'appels. Mesure : le drapeau DMARC d'INT-T10, l'adresse humaine, un texte sans lien tiers ;
   la charge d'appels reste bornée par l'échantillon et ne dépasse jamais celle d'aujourd'hui, où tous les
   dépôts sont appelés.
7. **Contrat.** Si le gabarit v1 part en DocuSeal avant JUR-T40, le clic n'est pas une confirmation
   contractuelle et la règle tacite reste celle d'aujourd'hui : JUR-T01b dépend de JUR-T40.
8. **Garde de l'art. 2.7.** « Sans réponse après N jours » porte sur le **contact**, jamais sur
   l'apporteur ; la garde de JUR-T30 (délais de réponse hors de tout déclencheur) doit viser l'apporteur
   sans condamner ce délai : les noms de code le distinguent (`reponseDuContact`), et JUR-T30 le relit.
9. **Budget d'interactions sans marge.** Le décompte du §3.2 laisse une interaction de marge si
   l'entreprise est choisie directement dans le formulaire, aucune si le passage par la carte
   Entreprise ajoute un geste ; un contexte exigé ferait dépasser le budget (question 1).

## 9. Questions à Williams

Chaque question commence par la valeur qui s'applique sans réponse. Les questions 1 à 15 ont reçu leur
réponse le 2026-09-29 ; les questions 16 et 17, nées de cette réponse, restent ouvertes. La question 18,
née de la correction de sécurité du même jour, et la question 19, proposée par la lentille securite, ont
reçu leur réponse le 2026-09-29 vers 20 h (session -d7).

1. **Par défaut : le contexte est facultatif**, au plus 140 caractères. Exigé, il ferait dépasser le
   budget de REQ-UX-001 d'une interaction. (HYP-W20-CONTEXTE)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
2. **Proposition initiale (écartée) : réputée confirmée à 30 jours de la déclaration si ni réponse ni appel concluant**,
   que le contact ait été tenté ou non (HYP-W20-TACITE). Alternative : suspendre le délai tant que
   l'e-mail est en rebond non corrigé et qu'aucun appel n'a abouti — plus protectrice pour la Société
   contre un contact inventé, moins favorable à l'apporteur, et à écrire au contrat.
   **Réponse de Williams (2026-09-29, session -d7)** : au bout de 30 jours sans réponse du contact et
   sans appel concluant, l'entreprise reste réservée à l'apporteur, le dépôt est réputé confirmé ; **sauf
   si l'e-mail revient en erreur** : le délai ne commence pas tant que l'apporteur n'a pas corrigé
   l'adresse. Le délai court de la **réception** de l'e-mail, c'est-à-dire d'un envoi sans rebond.
   Inchangé : aucune commission sans paiement réel ; appels au hasard et ciblés ; alertes « vérification
   suggérée ». Portée dans HYP-W20-TACITE, REQ-DM-042, DM-24, JUR-T40, JUR-T01b, JUR-T09, et dans
   le badge de REQ-UX-062 (HYP-W20-BADGE).
3. **Par défaut : un clic depuis la même empreinte d'IP que la session de l'apporteur n'est pas retenu**
   (le dépôt reste provisoire et part en tête des appels). Alternative : le retenir, et appeler.
   (HYP-W20-SOURCE)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29. **Élargie le
   même jour** (correction de sécurité, refus de la lentille securite sur `2340a63`) : le clic n'est
   retenu sur aucune demande signalée, quelle que soit sa raison ; la règle confirmée pour l'empreinte
   d'IP en est un cas. Réversible, comme l'hypothèse.
4. **Par défaut : le « Non » confirmé en second geste invalide directement**, comme vous l'avez décidé.
   Alternative : appeler d'abord quand une raison de vérification existe. (HYP-W20-NON)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
5. **Par défaut : une adresse générique saisie pour le contact est acceptée**, reçoit l'e-mail et porte
   la raison « adresse générique ». Alternative : l'écran propose, sans bloquer, de saisir l'adresse
   directe. (HYP-W20-DESTINATAIRE)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
6. **Par défaut : la rafale et les premiers dépôts trient la liste d'appels sans être affichés comme
   « Vérification suggérée »** : REQ-SEC-017 et REQ-SEC-021 excluent le rythme de toute alerte.
   Alternative : les afficher, ce qui demande d'amender ces deux exigences. (HYP-W20-VERIFICATION)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
7. **Par défaut : l'e-mail nomme l'apporteur par ses prénom et nom.** Alternative : prénom seul.
   (HYP-W20-IDENTITE-APPORTEUR)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
8. **Par défaut : l'e-mail ne donne pas la date du contact** (REQ-JUR-040). (HYP-W20-IDENTITE-APPORTEUR)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
9. **Par défaut : le lien d'opposition vaut pour la personne**, pas pour l'entreprise.
   (HYP-W20-OPPOSITION)
   **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
10. **Par défaut : la péremption de 90 jours part de la première réponse du contact**, pas de l'envoi de
    l'e-mail. (HYP-W20-PREMIER-CONTACT)
    **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
11. **Par défaut : aucun e-mail pour les conseillers salariés** (votre décision), réversible par un
    paramètre. (HYP-W20-SALARIES)
    **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
12. **Par défaut : le taux d'échantillon et le nombre de premiers dépôts appelés vivent hors dépôt**,
    comme les réglages des contrôles de SEC-14 : le dépôt est public (REQ-GOV-031), et publier la part
    des dépôts appelés dirait au fraudeur ses chances. Seules les clés sont dans la SSOT. Alternative :
    les écrire dans la SSOT publique, comme le délai de 15 minutes. (HYP-W20-APPELS)
    **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
13. **Par défaut : l'e-mail à l'apporteur de REQ-UX-038 (« nous n'avons pas encore pu joindre ») est
    maintenu**, déclenché par l'absence de confirmation à J+5 ouvrés. Alternative : le retirer, la carte
    de l'espace disant déjà l'état de la demande.
    **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
14. **Par défaut : la passe gardien-spec W20** (hypothèses du §2, exigences du §3, `reqs` et `hyp` des
    tâches versées) **se fait dans le même lot dédié que GOV-112**, après GOV-116, sans tâche GOV
    nouvelle (gel de la gouvernance) ; l'avenant de l'acceptance de GOV-112 s'écrit quand vous le
    confirmez. Alternative : une tâche dédiée, ce que le gel interdit aujourd'hui.
    **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29. **Avenant de
    l'acceptance de GOV-112 écrit le 2026-09-29** (dette bloquante de la lentille exactitude sur
    `2340a63` : la passe gardien-spec W20 n'avait aucun porteur au registre) : GOV-112 écrit aussi les
    HYP-W20 et les exigences W20, liste exacte au §6, dans le même lot, après GOV-116. C'est un avenant à
    une tâche existante, pas une tâche GOV nouvelle. Vingt et une tâches W20 dépendent de GOV-112 (§6).
15. **Par défaut : le message se termine par « Axion-IA pourra aussi l'appeler. »** au lieu de « Elle
    pourra aussi être contactée par téléphone. », pour ne pas supposer le genre du contact ; le reste de
    votre texte est repris mot pour mot. Alternative : votre texte tel quel, avec « Il ou elle ».
    **Réponse (2026-09-29)** : acceptée par défaut, confirmée par Williams le 2026-09-29.
16. **Ouverte, née de la réponse à la question 2. Par défaut : avant l'envoi effectif** (délai de 15
    minutes, ou envoi retenu par le relais, REQ-INT-023), **le délai tacite ne court pas et le badge 🟡
    ne porte pas de date.** Un envoi retenu est un incident d'exploitation, visible en console et jamais
    imputé à l'apporteur. Alternative : faire courir le délai de l'échéance d'envoi prévue, même retenue.
    (HYP-W20-BADGE, HYP-W20-TACITE)
17. **Ouverte, née de l'exigence d'expérience. Par défaut : le « fuseau de l'apporteur » est Europe/Paris**,
    fuseau unique du métier (REQ-CPL-013), tant que l'apporteur n'a pas de fuseau propre ; en ajouter un
    toucherait le schéma. Alternative : un fuseau par apporteur, pris de son profil. (HYP-W20-BADGE)
18. **Tranchée le 2026-09-29 (réponse ci-dessous), née de la correction de sécurité du 2026-09-29 (refus de la lentille securite sur
    `2340a63`). Question : une demande signalée devient-elle confirmée au bout de trente jours de
    silence, comme les autres ? Par défaut : NON.** Une demande qui porte une raison de vérification ne
    devient jamais confirmée par le seul silence ; elle reste provisoire, entreprise réservée, jusqu'à un
    appel concluant de la Société, puis suit la péremption ordinaire. Garantie d'expérience pour
    l'apporteur honnête (un artisan sur Gmail, par exemple) : ces dépôts sont appelés **en priorité**, en
    tête de « À appeler aujourd'hui », et son badge dit « En attente de confirmation — Axion-IA va
    appeler votre contact », sans date tacite. Prix du défaut : un contact honnête qu'on ne joint jamais
    laisse le dépôt provisoire sans terme, ce que REQ-DM-042 avait été créée pour éviter (§8, risque 1,
    point ii). Alternative : la tacite s'applique aussi à la demande signalée, et le fraudeur à l'adresse
    muette obtient sa confirmation au trentième jour. (HYP-W20-TACITE, HYP-W20-BADGE)
    **Réponse de Williams (2026-09-29, vers 20 h, session -d7)** : la valeur par défaut est retenue. Une
    demande signalée ne devient **jamais** confirmée par le seul silence ; il n'y a pas de confirmation
    tacite, elle reste provisoire jusqu'à un appel concluant. Le prix nommé ci-dessus (réservation sans
    terme) est fermé par la réponse à la question 19. Portée dans HYP-W20-TACITE, REQ-DM-042, DM-24,
    JUR-T40 et JUR-T01b.
19. **Proposée par la lentille securite (2026-09-29), née du prix de la question 18. Question : une demande
    signalée qu'aucun appel concluant ne vient confirmer garde-t-elle l'entreprise réservée sans terme ?
    Recommandation : non, elle est libérée automatiquement, sans sanction, après 3 tentatives d'appel
    `injoignable` ou 45 jours après l'envoi de la demande, au premier des deux termes, les deux valeurs en
    paramètres de la SSOT.** Alternative : la réservation sans terme du défaut de la question 18.
    (HYP-W20-LIBERATION, HYP-W20-BADGE)
    **Réponse de Williams (2026-09-29, vers 20 h, session -d7)** : acceptée avec les valeurs recommandées.
    Une demande signalée sans appel concluant est **libérée** automatiquement, sans aucune sanction pour
    l'apporteur, après 3 tentatives d'appel « injoignable » **ou** au bout de 45 jours depuis l'envoi de la
    demande, selon ce qui arrive en premier. Les deux valeurs sont des paramètres de la SSOT, modifiables.
    L'entreprise redevient disponible. L'apporteur est informé par une notification neutre (SSOT des
    notifications, aucune consigne, garde lexicale). Il peut redéposer ensuite, et le nouveau dépôt suit
    les règles ordinaires. Aucune suspension ni anomalie ne naît de cette libération. Précisions par
    défaut, non dites par Williams et réversibles (HYP-W20-LIBERATION, points a à c) : les 45 jours
    courent de l'envoi de la première demande, qu'une correction d'adresse ne fait pas repartir ; seules
    les Qualifications `injoignable` comptent ; une demande en rebond non corrigé est signalée et relève
    de la libération ; le libellé du badge et le texte de la notification. Portée dans
    HYP-W20-LIBERATION, REQ-DM-063, REQ-DM-042, REQ-DM-008, REQ-SEC-060, REQ-DM-062, REQ-UX-062, DM-13,
    DM-24, SEC-41, UX-P1-05, UX-P1-41, UX-P1-43, JUR-T40, JUR-T01b, QA-T40, QA-T41 et l'avenant de
    GOV-112 ; le §8 (risque 1, point ii) en nomme ce qui reste (le redépôt répété).

## 10. Chiffrage

**Phase 1 : 17,75 j**, dont 15,0 j de tâches nouvelles et 2,75 j d'amendements (17,5 j avant la réponse de
Williams à la question 19, +0,25 j à DM-13, ci-dessous). Au versement : 16,25 j
(14,25 + 2,0) ; **+1,25 j le 2026-09-29**, après la réponse de Williams à la question 2 et son exigence
d'expérience : le badge et la correction qui fait repartir le délai ajoutent du travail réel à UX-P1-40
(maquette de « Mes entreprises »), UX-P1-43 (correction, nouvel envoi, notification), QA-T40 (bascule
horloge figée, rebond corrigé), DM-24 (délai lu de la réception, rebond) et UX-P1-05 (badge). Inchangées :
UX-P1-41 (six textes de plus dans la SSOT), JUR-T40 (le texte est tranché, plus d'alternative à rédiger),
QA-T41 (un témoin de plus dans le même fichier), JUR-T01b et JUR-T09.

| Ensemble | Tâches | Jours |
| --- | --- | --- |
| Écrans et textes | UX-P1-40 (1,25), UX-P1-41 (0,75), UX-P1-42 (1), UX-P1-43 (1,25) | 4,25 |
| Domaine | DM-40 (1,5), DM-41 (1,25), DM-43 (1) | 3,75 |
| Sécurité | SEC-40 (1), SEC-41 (1,25) | 2,25 |
| Intégration | INT-T40 (1,25) | 1,25 |
| Juridique | JUR-T40 (0,5), JUR-T41 (0,5) | 1,0 |
| Qualité | QA-T40 (1,5), QA-T41 (1) | 2,5 |
| Amendements | UX-P1-02 (+0,25), UX-P1-06 (+0,25), UX-P1-07 (+0,5), DM-08 (+0,25), DM-24 (+0,5), SEC-12 (+0,25), JUR-T09 (+0,25), UX-P1-05 (+0,25), DM-13 (+0,25) | 2,75 |
| **Total phase 1** | | **17,75** |

**Correction de sécurité du 2026-09-29 : aucun rechiffrage.** Elle simplifie la règle du clic (un
prédicat « demande signalée » au lieu d'un cas d'empreinte d'IP), ajoute un libellé à la SSOT et au
badge, une condition au job tacite et trois témoins dans des fichiers de test déjà nommés (DM-41, DM-24,
QA-T40, QA-T41) : l'écart est absorbé par les estimations en place, et il est nommé ici pour être relu.

**Réponses de Williams aux questions 18 et 19 (2026-09-29, vers 20 h) : +0,25 j, à DM-13 seulement.** La
libération ajoute du travail réel à DM-13 (0,75 → 1 j) : un terme de plus au passage « tout ce qui est dû
à l'instant t » (trois `injoignable` ou 45 jours), la transition `provisoire → perimee` par
`liberee_sans_confirmation`, deux paramètres de la SSOT, une clé de notification et leurs témoins.
Absorbé ailleurs, et nommé pour être relu : UX-P1-05 (un cas de plus dans la même fonction pure),
UX-P1-41 (un libellé et un texte de notification), UX-P1-43 (le badge est celui de UX-P1-05), SEC-41
(un lecteur de plus du même prédicat), DM-24 (la question 18 retient la règle déjà écrite), JUR-T40 (une
phrase de l'art. 3.2), JUR-T01b (relecture), QA-T40 et QA-T41 (des témoins dans des fichiers déjà
nommés).

Hors chiffrage : la passe gardien-spec W20 (environ 0,5 j, dans le lot dédié de GOV-112, question 14,
porteur écrit par l'avenant du 2026-09-29),
et la validation des maquettes par Williams. **Effet sur les dates** : W20 allonge la phase 1 ; il ne
touche pas la phase 0. Le chemin critique de la phase 1 passe par DM-07 → DM-08 → DM-40 → DM-41 →
UX-P1-42 → QA-T40 ; il se relit dans `docs/PLAN-STATE.md`, rendu par son générateur après le versement.
**Ce qui est économisé** en exploitation : l'appel systématique de chaque dépôt disparaît au profit de
l'échantillon et des appels ciblés.
