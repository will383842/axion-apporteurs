# Runbook — résiliation du contrat d'apporteur, par écrit (phase 1)

> Livré par JUR-T59 (REQ-JUR-065), à la demande de la juriste (rattrapage 88). Autrice : A07. Il doit
> exister **avant le premier contrat**. Il nomme des articles, des tables et des écrans, **jamais une
> personne**. Les délais vivent dans la SSOT (`src/domain/seuils/ssot.ts`) ; ce runbook ne les recopie
> pas.

## 1. Recevoir l'écrit

1. **La résiliation se fait par écrit** (contrat art. 11.1 et 11.2) : un courriel ou un courrier. Un
   message oral ne suffit pas. Si l'apporteur annonce sa décision par téléphone, on lui demande de
   l'écrire.
2. **Noter la date de réception** de l'écrit : c'est elle qui fait courir le préavis. On garde l'écrit
   lui-même (courriel ou courrier scanné) comme preuve, dans le dossier de l'apporteur tenu par la
   Société, hors du dépôt public.
3. **Une résiliation venant de la Société** est décidée par une personne habilitée de la Société. L'écrit
   est adressé à l'apporteur à son adresse enregistrée, et la date d'envoi est notée.

## 2. Vérifier l'auteur

- L'écrit vient de **l'adresse enregistrée de l'apporteur** (comparer son empreinte à
  `apporteurs.email_hash`), ou il est signé de lui.
- En cas de doute, on lui demande de **confirmer depuis son espace connecté** ou par retour du courriel
  envoyé à son adresse enregistrée. Une résiliation dont l'auteur n'est pas établi n'est pas enregistrée.
- Pour une **personne morale**, l'écrit vient de son représentant ou d'une personne qu'il désigne.

## 3. Le motif et le préavis

| Cas | Article | Préavis | Ce qu'il faut |
| --- | --- | --- | --- |
| L'apporteur résilie | 11.1 | `PREAVIS_JOURS`, à compter de la réception | L'écrit, sans motif à donner |
| La Société résilie, sans motif | 11.1 | `PREAVIS_JOURS`, à compter de la réception par l'apporteur | L'écrit de la Société |
| La Société résilie pour inexécution (art. 3.7, 6, 7, 8 ou 9) ou pour une déclaration inexacte (art. 23) | 11.2 | Aucun | Une **mise en demeure** d'y remédier, restée sans effet pendant **quinze jours** (sauf inexécution irrémédiable), puis une **décision motivée**, écrite |
| Décès, cessation d'activité, radiation | 12.5 | Aucun | La preuve du fait (acte, extrait du registre) ; le contrat prend fin de plein droit |

- Le préavis est le même quelle que soit l'ancienneté de la relation (art. 11.1).
- **Une mise en demeure n'est ni un avertissement, ni une mesure disciplinaire, ni un antécédent**
  (art. 11.2). On ne décide jamais rien sur le nombre de mises en demeure ou de suspensions passées.
- L'ouverture d'une **procédure collective** contre l'apporteur ne met pas fin au contrat (art. 12.5). On
  ne résilie pas pour ce seul motif.
- **Le geste en console a lieu à la DATE D'EFFET** : à la fin du préavis, ou à la date de la décision
  motivée, ou à la date du fait pour l'art. 12.5. Jamais à la réception d'une lettre qui ouvre un préavis.

## 4. Le geste de résiliation en console

- Il est réservé au rôle nommé qui porte la résiliation (DM-63). Il est contrôlé côté serveur et
  journalisé avec l'utilisateur de la console qui l'accomplit (`src/server/apporteur/resiliation.ts`).
- Le motif enregistré (`apporteurs.resiliation_motif`) est choisi selon le cas du tableau :
  - `ordinaire_apporteur` pour une résiliation par l'apporteur ;
  - `ordinaire_axion` pour une résiliation par la Société sans motif ;
  - `manquement_grave` pour une résiliation au titre de l'art. 11.2.

  La fin de plein droit de l'art. 12.5 aura la valeur `fin_de_plein_droit` (DM-64). Tant que cette valeur
  n'est pas livrée, il faut ouvrir une décision avant le geste, sans choisir une valeur qui dirait autre
  chose que le fait. **Une procédure collective n'est pas une fin de plein droit** (art. 12.5) : elle ne
  donne lieu à aucun geste de résiliation.
- Le statut de l'apporteur passe à `resilie`.

## 5. Les effets (art. 12, DM-63)

Ils s'appliquent d'eux-mêmes au geste, dans la même transaction :
- les attributions **provisoires** et les déclarations **en attente** sont **annulées**, et les entreprises
  redeviennent librement déclarables ;
- les attributions **définitives sans commande prennent fin** ;
- une attribution dont une **commande a été signée** avant la fin du contrat, ou pendant le préavis,
  **continue d'ouvrir droit** à commission, même non encore confirmée : la commission est due quand la
  Société a encaissé l'intégralité du prix, **quelle que soit la date de cet encaissement** (art. 12.3 et 4.2) ;
- les **commissions acquises** et non encore facturées **sont facturées par autofacture et versées** dans
  les conditions des art. 5.1 et 5.3, **sans montant minimum** (art. 12.2), et **aucune commission acquise
  n'est perdue** ;
- un **solde négatif** s'impute sur les commissions à venir (art. 12.4) ;
- **l'accès à l'espace prend fin** à la date de fin du contrat ; ses autofactures, ses avoirs, leurs
  décomptes et le motif de tout blocage lui sont envoyés par courriel jusqu'à l'extinction de ses droits
  (art. 12.3, SEC-70).

**Fin de plein droit (art. 12.5) : à qui verser.** Les commissions acquises à la date de la fin sont
versées, selon le cas, à l'apporteur, à ses ayants droit (décès) ou au mandataire désigné (mandataire
successoral ou de justice). Le versement attend que soient fournis :
- la justification de leur qualité (acte de notoriété, ou décision qui désigne le mandataire) ;
- des coordonnées bancaires à leur nom.

L'article 5.4 est alors écarté pour le seul numéro SIREN (art. 12.5). Les pièces reçues rejoignent le dossier de l'apporteur tenu par la Société,
hors du dépôt public. Elles ne sont recopiées nulle part ailleurs.

On vérifie, après le geste, que ces effets apparaissent sur la fiche de l'apporteur. Si l'un manque, il ne
faut rien corriger à la main : on ouvre un incident.

## 6. Informer l'apporteur

Un écrit à son adresse enregistrée, qui dit :
- la date de réception de son écrit, ou celle de l'envoi de la Société ;
- **la date d'effet** ;
- l'article appliqué, et, pour l'art. 11.2, la décision motivée ;
- les effets de la section 5, en particulier : ses commandes signées continuent de lui ouvrir droit, ses
  commissions acquises lui seront payées, son accès à l'espace prend fin avec le contrat, et ses
  documents lui sont envoyés par courriel ;
- l'adresse à laquelle écrire pour toute question ou contestation.

Le courriel envoyé est tracé dans `courriels_envoyes`.

## 7. L'espace de l'apporteur après le geste (SEC-70, art. 12.3, REQ-SEC-032)

Réécrit par SEC-70 sur le contrat v2 (art. 12.3 : « son lien personnel est révoqué à la fin du
contrat »), dans le cadre posé par la sécurité. Il remplace la lecture seule de SEC-19.

- **Toutes ses sessions tombent au geste.** La base incrémente sa version de session à la résiliation
  (migration `sessions_revocables`) : chaque appareil connecté est déconnecté à la requête suivante.
  Il n'y a rien à faire en console.
- **L'accès à l'espace prend fin à la date de fin du contrat, sans exception.** Il ne se reconnecte
  plus : une demande de lien reçoit la même réponse qu'une adresse inconnue, et un lien déjà émis
  n'ouvre aucune session. Ses droits en cours (une commande signée avant la fin) n'y changent rien.
- **Ses documents lui parviennent par courriel**, à l'adresse vérifiée de son compte, jusqu'à
  l'extinction de ses droits : ses autofactures, ses avoirs, leurs décomptes et le motif de tout
  blocage. Aucun relevé, aucune autofacture ni aucun motif de blocage n'est émis à ce jour : il n'y a
  rien à lui envoyer. Les tâches qui les émettront ne sont mises en service qu'avec l'envoi par
  courriel, à son émission, de tout document destiné à un apporteur résilié.
- **Ce qu'il peut encore faire, par écrit** à l'adresse de contact de la Société : obtenir la copie de
  son contrat, de ses autofactures et de ses contestations ; contester une commission ou une décision
  dans les délais du contrat (art. 5.5) ; exercer ses droits RGPD (`docs/runbooks/demandes-de-droits.md`).
  Une contestation reçue ainsi est saisie **en console**.
- **Son RIB ne change plus en libre service.** Ses commissions continuent d'être payées (art. 12.3) :
  s'il faut changer ses coordonnées bancaires, il l'écrit, et le changement se fait **en console**, avec
  la validation à quatre yeux du RIB (CPL-T24). Aucun versement ne part vers un RIB non validé.
- **S'il signale qu'il ne peut plus se connecter**, c'est le fonctionnement voulu : on lui répond par
  écrit que l'accès a pris fin avec le contrat, et que ses documents lui sont envoyés par courriel.
