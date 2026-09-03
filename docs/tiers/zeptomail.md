# ZeptoMail — fiche tiers

> Livrée par **GOV-015** (REQ-GOV-022, RM-08). Rédigée le 2026-09-03 à partir du dossier interne seul :
> **aucune documentation ZeptoMail n'a été lue à cette date**, et **aucun rapport d'agrégation DMARC n'a été
> reçu**. Ce qui n'est pas établi porte une formule d'attente et le nom de qui doit la lever, sur la même
> ligne.

## 1. Ce que ce tiers fait pour nous

ZeptoMail achemine les e-mails de Partners : information du prospect au premier contact (REQ-JUR-009),
invitation à signer, mise à disposition du relevé, rappels d'échéance de pièces. Il rend les rebonds par
webhook, ce qui alimente une liste de suppression : un envoi vers une adresse supprimée est retenu et
visible, jamais tenté en silence (REQ-INT-023).

Cette fiche est **nommée par REQ-INT-022** : le drapeau `PARTNERS_EMAIL_DMARC_VERIFIE` ne peut être posé
qu'avec, ici, la référence datée du rapport d'agrégation montrant `dkim=pass` et `spf=pass` pour le domaine
d'envoi. La fiche n'est donc pas une documentation d'accompagnement : c'est la pièce qui autorise l'envoi.

## 2. Source officielle

| Élément exigé par REQ-GOV-022 | État au 2026-09-03 |
| --- | --- |
| URL officielle | adresse exacte de la page d'envoi de l'interface programmable **à relever**, non ouverte à ce jour — `A01` répartit la lecture |
| Date de lecture | **à relever** — le lecteur désigné par `A01` date ici sa propre lecture |
| Extrait cité | **à relever** — copié mot pour mot par le lecteur désigné par `A01` |
| Exemple officiel | **à relever** — charge utile d'exemple copiée telle quelle par le lecteur désigné par `A01` |

⚠️ **Cette rubrique est vide, et c'est le reste à faire de la tâche.** À y citer mot pour mot lors de la
lecture : la valeur exacte à inclure dans l'enregistrement SPF, la forme de l'enregistrement DKIM publié, la
construction de l'en-tête de signature du webhook de rebonds, et la nomenclature des motifs de rebond.

### Preuve d'alignement DMARC — condition de REQ-INT-022

| Élément | État au 2026-09-03 |
| --- | --- |
| Domaine d'envoi | sous-domaine dédié de l'espace, aligné DMARC (W3, `DEC-INT-002`) — nom exact **à confirmer** par Will |
| Inclusion SPF du service publiée | **à confirmer** par Will, avant la pose du drapeau |
| Sélecteur DKIM publié | **à confirmer** par Will, avant la pose du drapeau |
| Rapport d'agrégation montrant `dkim=pass` et `spf=pass` | aucun à ce jour — date de réception et référence **à relever** ici par Will |
| `PARTNERS_EMAIL_DMARC_VERIFIE` | fermé, et le reste tant que la ligne ci-dessus est vide |

Un test prouve qu'aucun envoi ne part sans ce drapeau (REQ-INT-022). Poser le drapeau sans remplir ce
tableau vide la garde de son objet.

## 3. Données qui lui sont confiées

- Adresse électronique et nom du destinataire : apporteur, ou tiers rencontré lors d'un dépôt pour
  l'information de l'article 14 RGPD (REQ-JUR-009).
- Le corps du message. Il ne contient jamais de coordonnées bancaires ni de pièce du dossier de conformité ;
  le relevé et l'autofacture sont **mis à disposition dans l'espace**, l'e-mail signale la mise à
  disposition.
- L'adresse d'expédition est une adresse humaine du domaine d'envoi ; jamais une adresse de non-réponse
  (REQ-INT-022).

## 4. Quotas et limites

Ce que **nous** appliquons : liste de suppression alimentée par les rebonds, tout envoi vers une adresse
supprimée étant retenu et visible ; vérification de l'en-tête de signature en base64 après décodage des
caractères échappés, avec une tolérance de 300 secondes (REQ-INT-023).

Les quotas du tiers — volume quotidien du plan, limite de débit, taille du message, durée de conservation
des rebonds — sont **à confirmer** par le lecteur désigné par `A01`, avant la fixture de REQ-INT-023.
L'ordre de grandeur à couvrir est celui du réseau en régime établi : information de contact, cycle mensuel
de relevés, rappels d'échéance.

## 5. Mode dégradé — s'il tombe

| Panne | Ce que fait le produit |
| --- | --- |
| L'interface refuse l'envoi | Le message reste en file et repart au retour ; aucun message n'est perdu, aucun n'est envoyé deux fois — l'identifiant d'envoi est idempotent |
| Le service est indisponible plusieurs heures | Rien de métier ne s'arrête : le dépôt, la qualification, le calcul et le relevé ne dépendent d'aucun e-mail. Ce qui se dégrade est le délai d'information, pas le droit |
| Le webhook de rebonds n'arrive pas | La liste de suppression n'est pas alimentée ; le risque est d'insister sur une adresse morte, pas d'écrire une donnée fausse. Le rattrapage se fait à la reprise |
| Le drapeau DMARC n'est pas posé | **Aucun envoi automatique ne part.** Ce n'est pas une panne, c'est la règle : un e-mail qui part d'un domaine non aligné abîme durablement la remise de tous les suivants |

L'information de l'article 14 RGPD (REQ-JUR-009) est due « au plus tard lors de la qualification » : une
panne longue est donc à surveiller, l'e-mail étant ici le support d'une obligation, non un confort.

## 6. Point de contact

- Interne : Will, détenteur du compte et de la zone DNS du domaine d'envoi.
- Externe : canal de support **à relever** par le lecteur désigné par `A01` à la première lecture, et
  consigné comme rôle et procédure — jamais une coordonnée nominative, le dépôt est public (W13).

## 7. Conformité

| Objet | État au 2026-09-03 |
| --- | --- |
| Contrat / plan souscrit | **à confirmer** par Will |
| Sous-traitance (art. 28 RGPD) | Le tiers traite pour notre compte des adresses électroniques de personnes physiques : contrat de sous-traitance nécessaire. Existence et date **à confirmer** par Will |
| Localisation des données | l'inclusion SPF vise le domaine européen du service ; la région effective du compte et le lieu de conservation des journaux d'envoi sont **à confirmer** par Will, avant le premier envoi réel |
| Durée de conservation des messages et des journaux chez le tiers | **à confirmer** par Will — elle doit être compatible avec les durées de `retention.ts` (REQ-SEC-030) |

## 8. À confirmer, et par qui

| Question | Qui | Avant quoi |
| --- | --- | --- |
| Nom exact du sous-domaine d'envoi | Will | publication SPF et DKIM |
| Publication SPF et DKIM, puis rapport d'agrégation daté | Will | pose de `PARTNERS_EMAIL_DMARC_VERIFIE` |
| Contrat de sous-traitance signé | Will | premier envoi vers un tiers rencontré |
| Forme de l'en-tête de signature du webhook, extrait cité | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant la fixture de REQ-INT-023 |
| Quotas du plan et nomenclature des motifs de rebond | `A01` répartit ; le lecteur date sa lecture dans la fiche | avant la fixture de REQ-INT-023 |
| Région du compte et durée de conservation | Will | premier envoi réel |

## 9. Référence à citer dans une fixture

Deux en-têtes distincts, et non un seul : le premier nomme **qui a produit** la fixture, le second nomme
**ce à quoi elle a été confrontée**. Un seul en-tête ne peut pas porter les deux, et la garde
`fixtures:source` lit le premier.

```
Source: <producteur réel, et date de l'enregistrement>
Confronte-a: docs/tiers/zeptomail.md#2-source-officielle
```

Toute fixture de charge utile de rebond ou d'en-tête signé porte ces deux lignes. Tant que la rubrique 2
est vide, la seconde ligne porte la mention `non confrontée`.
