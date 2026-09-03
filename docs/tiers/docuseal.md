# DocuSeal — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier
> interne seul : **aucune documentation DocuSeal n'a été lue à cette date**. Ce qui n'est pas établi porte
> une formule d'attente et le nom de qui doit la lever, sur la même ligne ; rien n'est présumé, et aucun
> engagement contractuel n'est affirmé.

## 1. Ce que ce tiers fait pour nous

DocuSeal porte la signature électronique du contrat d'apporteur d'affaires. Le produit lui envoie une
soumission par apporteur `pret_a_signer`, avec le gabarit rempli et le document de présentation des écarts
de grille (REQ-EXT-027) ; il en reçoit, à la complétion, le PDF signé et la piste d'audit, dont les
empreintes SHA-256 sont stockées et recomparées à chaque téléchargement (REQ-SEC-034, REQ-DM-013).

L'instance est **dédiée à Partners**, non partagée avec axionia (`DEC-INT-001`) : une seule adresse de
webhook à tenir, aucun relais par `metadata.kind`, aucun croisement de gabarit possible.

Ce qui dépend de ce tiers : REQ-DM-013, REQ-SEC-034, REQ-INT-019, REQ-JUR-005, REQ-EXT-021, REQ-EXT-027,
REQ-CPL-028.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | adresse exacte de la documentation d'interface programmable **à relever**, non ouverte à ce jour — `A01` répartit la lecture |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — réponse d'exemple copiée telle quelle par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** Ce qui devra y être cité, mot pour
mot : la forme exacte de l'en-tête de signature du webhook, la liste des types d'événements émis, la
réponse de la lecture d'une soumission, et la politique de rejeu. Tant que ces quatre extraits ne sont pas
dans cette fiche, la vérification de signature de REQ-SEC-034 est écrite d'après notre propre spécification
— exactement ce que RM-08 interdit — et toute fixture de ce format porte la mention `non confrontée`
prévue en rubrique 9.

## 3. Données qui lui sont confiées

- Identité de l'apporteur signataire : raison sociale, numéro d'identification, adresse, nom et adresse
  électronique de la personne qui signe.
- Le contrat lui-même, grille annexée comprise. La grille est l'annexe 1 : ces valeurs quittent donc le
  périmètre du dépôt et vivent chez le tiers le temps de la signature.
- `metadata.apporteurId`, confronté à la soumission émise au retour (REQ-SEC-034).

Ne lui sont **jamais** confiées : les coordonnées du tiers rencontré lors d'un dépôt, les données
bancaires, les pièces du dossier de conformité.

## 4. Quotas et limites

Ce que **nous** appliquons : tolérance de signature de 300 secondes sur le webhook, sans repli en clair ;
déduplication par la table `EvenementRecu` (`source = docuseal`), un rejeu ne produisant aucune écriture
métier (REQ-DM-036) ; toute soumission `pending` depuis plus de vingt-quatre heures est réinterrogée
(REQ-INT-019).

Les quotas du tiers — nombre de soumissions du plan souscrit, taille maximale du document, durée de rejeu
des webhooks, limite de débit de l'interface — sont **à confirmer** par le lecteur désigné par `A01` à la
lecture, avant l'ouverture aux apporteurs.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| L'envoi d'une enveloppe échoue | L'apporteur reste `pret_a_signer`, le contrat reste `envoye` ; rien n'est perdu, l'envoi est rejouable. Aucun dépôt n'est possible tant que le contrat n'est pas `signe`, c'est la règle et non une conséquence de la panne |
| Le webhook n'arrive pas | La relance de REQ-INT-019 rattrape le contrat complété par interrogation directe ; c'est le chemin de secours, il existe pour cela |
| L'instance est indisponible plusieurs jours | Les apporteurs déjà `signe` ne sont pas affectés : ils déposent, sont qualifiés et commissionnés normalement. Seule l'entrée de nouveaux apporteurs s'arrête. Un avenant en cours ne bloque rien non plus : un contrat non re-signé n'entraîne aucun refus de dépôt (REQ-CPL-028) |
| La réponse revient sans PDF | Le contrat n'est pas passé `signe` : l'empreinte SHA-256 est une condition, pas un enrichissement (REQ-SEC-034) |

## 6. Point de contact

- Interne : Will, seul détenteur du compte et des secrets de l'instance à ce jour.
- Externe : canal de support du tiers **à relever** par le lecteur désigné par `A01` lors de la première
  lecture, et consigné ici sous forme de rôle et de procédure — jamais d'adresse nominative, le dépôt est
  public (W13).

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat / plan souscrit | **à confirmer** par Will |
| Sous-traitance (art. 28 RGPD) | Le tiers traite pour notre compte des données d'identité de signataires : un contrat de sous-traitance est nécessaire. Existence et date **à confirmer** par Will |
| Localisation des données | **à confirmer** par Will : instance mutualisée hébergée par l'éditeur, ou instance auto-hébergée sur notre propre serveur — les deux existent, et la réponse change la conformité comme le mode dégradé |
| Conservation du document signé chez le tiers | **à confirmer** par Will, avant la première signature réelle ; côté Partners, le PDF et la piste d'audit sont stockés avec leur empreinte |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Instance mutualisée ou auto-hébergée, et où | Will | premier envoi réel |
| Contrat de sous-traitance signé | Will | première signature réelle |
| Conservation du document signé chez le tiers | Will | première signature réelle |
| Forme exacte de l'en-tête de signature du webhook, extrait cité | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant la fixture de REQ-SEC-034 |
| Quotas du plan, durée de rejeu des webhooks | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant l'ouverture aux apporteurs |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/docuseal.md#2-source-officielle
```

Toute fixture de charge utile de webhook, de réponse de lecture d'une soumission ou de gabarit rempli porte
ces deux lignes. Tant que la rubrique 2 est vide, la seconde ligne porte la mention `non confrontée` : la
fixture dit alors qu'elle a été écrite d'après nous, et non d'après le tiers. Le jour où
`fixtures:source` sera armée — elle est en phase 0 dans `docs/gates.json`, sans preuve rouge à ce jour et
son script n'est pas écrit —, une fixture sans en-tête `Source:` sera refusée.
