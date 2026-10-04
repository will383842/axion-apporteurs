# axion-ia — fiche tiers

> Livrée par **INT-T51** (REQ-INT-012). Rédigée le 2026-10-04, à partir du code des deux dépôts lu ce
> jour-là. axion-ia est le dépôt frère de la même société : le contrat des événements reste le schéma
> versionné de `packages/contracts`, copié à hash identique des deux côtés. Cette fiche ne le remplace
> pas : elle documente les deux routes de RATTRAPAGE qui ne passent pas par le relais des webhooks, la
> relecture par `after_sequence` et le rejeu (`rejouerEvenement`), et qui les déclenche.

## 1. Ce que ce tiers fait pour nous

axion-ia émet vers Partners les événements du contrat (clients, devis, factures, paiements…) par son
relais signé. Quand un envoi se perd, deux routes d'axion-ia permettent à Partners de le rattraper sans
rien reconstruire :

- **La relecture** — `GET /api/partners/evenements?after_sequence=<n>&limit=<n>` : axion-ia rend les
  corps STOCKÉS de sa file de sortie, octet pour octet, un par ligne (NDJSON), à partir de la séquence
  donnée. L'en-tête `X-Axionia-Derniere-Sequence` porte la séquence de la dernière ligne rendue,
  `X-Axionia-Suite` vaut `1` s'il en reste. Côté Partners, le client unique de cette route est
  `src/server/integrations/axionia/relecture.ts` (`clientRelecture`, `CHEMIN_RELECTURE`).
- **Le rejeu** — `POST /api/partners/reconciliation`, corps `{"eventIds": [...]}` : axion-ia RÉARME les
  lignes de sa file (`rejouerEvenement` : `pending`, tentatives à zéro, dues maintenant, erreur
  effacée). Le corps et la séquence ne changent pas : le même octet repart par le relais, signé comme au
  premier envoi, sous l'identifiant d'ORIGINE, et la réception de Partners le déduplique par
  `event_id`. Un identifiant inconnu n'écrit rien et revient dans `introuvables`. Côté Partners, le
  client est `clientRejeu` dans `src/server/integrations/axionia/reconciliation.ts` (`CHEMIN_REJEU`).

**Qui les déclenche.** Partners seul, jamais axion-ia ni un humain à la main. La tâche
`reconciliation_axionia` (inscrite dans `src/server/taches/inscriptions.ts`, registre
`src/server/taches/registre.ts`) est jouée par le lanceur à chaque minute et n'est DUE qu'une fois par
jour civil UTC (`src/server/jobs/reconciliation.ts`) ; un passage qui échoue n'écrit pas de succès, la
minute suivante le retente. Un passage :

1. relit depuis la plus haute séquence REÇUE d'axion-ia, moins `RECOUVREMENT_SEQUENCES`, page après
   page, au plus `PAGES_MAX_PAR_PASSAGE` pages ;
2. tient pour un TROU tout `event_id` relu qui n'a jamais été inscrit dans `evenements_recus` ;
3. demande le rejeu des trous, par paquets d'au plus `REJEU_MAX_PAR_APPEL` identifiants.

Rien de relu n'est inscrit directement : la seule porte d'écriture reste la réception des webhooks. Les
`event_id` manquants sont nommés dans Partners seulement (battement de la tâche) et dans la demande de
rejeu ; jamais dans un signal, une alerte ou un journal.

Ce qui dépend de ce tiers : REQ-INT-012, REQ-INT-013, REQ-SEC-010.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-10-04 |
| --- | --- |
| URL officielle | le code du dépôt frère, branche `main` au commit `c22f9f340c394e714dcf6699baf79f777ef5d951` : `src/server/partners-sync/relecture.ts` et `src/server/partners-sync/reconciliation.ts`, servis par `src/app/api/partners/evenements/route.ts` et `src/app/api/partners/reconciliation/route.ts` |
| Date de lecture | 2026-10-04, par l'auteur de cette fiche, sur le commit ci-dessus |
| Extrait cité | relecture : « Partners rattrape une lacune en relisant la file de sortie à partir d'un numéro de séquence. La réponse porte la charge EXACTE conservée : les `corps` stockés, octet pour octet, un par ligne » ; rejeu : « axionia RÉARME les lignes de sa file de sortie : `pending`, tentatives à zéro, dues maintenant, erreur effacée. Le CORPS et la SÉQUENCE ne changent pas » |
| Exemple officiel | la chaîne signée d'une relecture, telle que le dépôt frère la documente : `<horodatage>.<chemin et requête exacts>`, soit le chemin `/api/partners/evenements` suivi de sa requête `after_sequence` et `limit` ; celle d'un rejeu : `<horodatage>.<chemin>`, un saut de ligne, puis le corps |

## 3. Données qui lui sont confiées

- Dans une demande de rejeu : les `event_id` manquants, et rien d'autre.
- Dans une demande de relecture : une séquence et une taille de page.

Ne lui sont **jamais** confiées par ces deux routes : une donnée d'apporteur, une coordonnée, une charge
d'événement. Le flux inverse (ce qu'axion-ia émet vers Partners) relève du contrat, pas de cette fiche.

## 4. Quotas et limites

Ce que **nous** appliquons : une page de relecture est bornée par `LIMITE_PAR_PAGE`, sous la borne du
serveur (`LIMITE_MAX` du dépôt frère, qui refuse au-delà) ; un passage par `PAGES_MAX_PAR_PASSAGE`, et
au-delà il s'arrête et le signale (`relecture_bornee`) ; une demande de rejeu par `REJEU_MAX_PAR_APPEL`,
la même borne que le serveur ; un appel attend au plus dix secondes.

Ce que **le dépôt frère** applique : une fenêtre de signature de 300 secondes sur les deux routes
(REQ-SEC-010), comparaison à temps constant ; le rejeu est soumis à son limiteur (`DEBIT_REJEU`, clé
`partners:reconciliation`) et REFUSÉ si le compteur est aveugle — un rejeu n'est jamais urgent, le
passage suivant rappelle. Les valeurs de ce débit vivent dans son code, elles ne sont pas recopiées ici.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| La relecture échoue (canal non configuré, appel en erreur, statut autre que 200, signature refusée, en-tête ou ligne illisible) | La page est refusée ENTIÈRE, avec son motif ; le passage échoue (`relecture_echouee`) et le suivant reprend du même curseur. Une moitié de page n'est jamais lue |
| Le rejeu est refusé (limiteur, panne, réponse illisible) | Le passage échoue (`rejeu_echoue`) ; les trous restent nommés au battement, le passage suivant les redemande |
| Les deux routes sont fermées (canal fermé, secret absent : 404 côté axion-ia) | Aucun rattrapage ; les événements livrés par le relais continuent d'arriver normalement. Le battement de la tâche dit l'échec chaque jour |
| Un événement rejoué arrive deux fois | La réception le déduplique par `event_id` : aucune écriture métier en double |

## 6. Point de contact

- Interne : Will, détenteur des deux dépôts et des secrets des deux côtés.
- Externe : aucun — c'est un dépôt de la même société. Un écart de forme se corrige par une tâche
  appariée dans chaque dépôt, jamais par une adaptation d'un seul côté.

## 7. Conformité

| Objet | État au 2026-10-04 |
| --- | --- |
| Contrat / plan souscrit | Sans objet : dépôt de la même société, aucun contrat de service |
| Sous-traitance (art. 28 RGPD) | Sans objet : même responsable de traitement (une autre application de la Société), ni sous-traitant ni destinataire tiers ; la relecture rend des enveloppes complètes du contrat, coordonnées du candidat comprises |
| Localisation des données | Celle de l'hébergement d'axion-ia, hors du périmètre de cette fiche |
| Secrets | Le secret de relecture signe les requêtes des deux routes ; le secret d'émission signe les réponses. La page de relecture se vérifie sur la forme CANONIQUE `<horodatage>.<after_sequence>.<limit>.<x-axionia-derniere-sequence>.<x-axionia-suite>.<corps exact>`, construite par la fonction partagée du contrat (`packages/contracts/signature-relecture.ts`, vecteurs figés par `openssl`, couverts par `contracts.sha256`) : elle lie la page à sa requête, et la forme courte n'est jamais acceptée en repli. Toute réponse, relecture ou rejeu, est refusée hors d'une fraîcheur de 300 s sur `x-axionia-timestamp`. La réponse de rejeu garde sa forme `<horodatage>.<corps>` et n'est acceptée que si `rearmes ∪ introuvables` égale exactement l'ensemble dédoublonné des identifiants demandés, `rearmes ∩ introuvables` étant vide (INT-T74-P) |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| La bascule de la forme canonique : Partners l'exige dès la fusion d'INT-T74-P, qui ne fusionne qu'après INT-T72-A, qui la pose côté axion-ia. La route de relecture est déclarée au contrat depuis #639 (`API_RELECTURE`, son `$comment` porte l'ordre canonique) | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant la fusion d'INT-T74-P |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/axionia.md#2-source-officielle
```

Toute fixture de page de relecture ou de réponse de rejeu porte ces deux lignes.
