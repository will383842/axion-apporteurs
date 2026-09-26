# partners/ADR-0023 — Les coordonnées d'un candidat se tirent par une route HMAC d'axionia, jamais par un événement

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-26 |
| **Décideur** | `architecte` — décision technique prise sur délégation de Will ; elle passe `accepte` quand ses assertions existent (Reste à faire) |
| **Tâche** | INT-T01c |
| **Exigences servies** | REQ-INT-029, REQ-INT-032, REQ-INT-012, REQ-SEC-024, REQ-DM-035 |
| **Décisions du registre citées** | `HYP-A02-RETENTION` |
| **Règle maison appliquée** | RM-01, RM-03 |
| **Remplace / remplacé par** | amende `partners/ADR-0008` : le contrat compte désormais trois API |

## Contexte

Sans candidature reçue, aucun apporteur n'existe dans Partners (REQ-INT-032), et sans son adresse de
courriel, Partners ne peut lui envoyer ni lien de connexion (SEC-03) ni invitation. Or cette adresse ne
traverse pas la frontière :

- côté axionia, l'identité du candidat vit dans les colonnes chiffrées du modèle `Submission` (nom,
  courriel, téléphone), et non dans ses réponses au formulaire ; la charge de `candidature.recue` que
  décrit REQ-INT-032 ne la porte pas ;
- la frontière du contrat refuse toute coordonnée de personne dans une charge, et le fait en échouant
  fermé (`FRONTIERE_INTERDITE`, `packages/contracts/events.ts`, partners/ADR-0008) ;
- la file de sortie d'axionia conserve le corps exact de chaque événement pour la relecture
  (REQ-INT-012) : une coordonnée placée dans une charge y serait recopiée EN CLAIR, pour toute la durée
  de conservation de la file, alors qu'axionia la garde chiffrée partout ailleurs.

## Décision

**1. Le contrat d'événements reste sans donnée personnelle.** Aucun type, `candidature.recue` compris,
ne porte de nom, de courriel, de téléphone ni d'adresse. La garde `coordonnees_du_contact` n'est ni
affaiblie ni exemptée.

**2. Partners TIRE les coordonnées au traitement de `candidature.recue`**, par une route d'axionia :
`GET /api/partners/candidatures/{candidatureId}/coordonnees`. C'est la troisième API du contrat, à
côté de la vérification d'attribution et de la relecture ; son schéma de réponse vit dans
`packages/contracts/api.ts`, sous la même empreinte que le reste du contrat.

**3. Authentification et portée.** Même authentification que la relecture : signature HMAC-SHA-256
de l'horodatage et de la requête, tolérance de 300 s, comparaison à temps constant, secret dédié à
l'intégration, liste d'autorisation d'adresses réseau. La route ne répond que pour une candidature
effectivement émise vers Partners (une ligne existe dans la file de sortie pour ce `candidatureId`) ;
tout autre identifiant rend la même réponse qu'un identifiant inexistant.

**4. Réponse minimale et fermée** : `{nom, prenom, email, telephone}`, chaque champ nul s'il est
absent, aucun autre champ (schéma fermé). Rien n'est mis en cache côté axionia.

**5. Journal d'appel sans clair.** Chaque appel est journalisé côté axionia avec l'identifiant de
candidature, l'empreinte de l'adresse réseau et le résultat — jamais une coordonnée.

**6. Côté Partners, le clair ne vit que le temps du traitement.** Les coordonnées reçues sont écrites
par `colonnesPii` dans les colonnes chiffrées et les empreintes de `apporteurs`, dans la transaction
qui crée l'apporteur ; elles n'entrent ni dans `evenements_recus`, ni au journal, ni dans un message
d'erreur.

**7. Une panne ne perd rien et ne crée rien d'incomplet.** Si la route échoue, l'événement reçu reste
`en_attente_dependance` avec `dependance_ref = 'coordonnees:<candidatureId>'` et il est rejoué ; aucun
apporteur n'est créé sans adresse.

## Conséquences

- axionia porte une route de plus, tenue par une tâche de son dépôt (versée par GOV-102), dont
  INT-T26 dépend ; le schéma de réponse change l'empreinte du contrat, donc se publie des deux côtés
  dans la même fenêtre (partners/ADR-0008).
- Le traitement d'une candidature fait un aller-retour réseau de plus ; il est hors requête (travail
  de fond de SEC-06), et son échec retarde la création de l'apporteur sans la perdre.
- La file de sortie d'axionia et le journal de réception de Partners restent sans donnée personnelle :
  un effacement de candidat ne touche ni l'un ni l'autre.
- Retour arrière : porter les coordonnées dans la charge supprimerait la route mais recopierait des
  clairs dans une file conservée, et obligerait à exempter la garde de frontière ; il faudrait un ADR
  qui remplace celui-ci.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Coordonnées dans la charge de `candidature.recue`, avec une exemption de la garde de frontière | Le corps exact est conservé dans la file de sortie pour la relecture : un clair de plus, conservé longtemps, là où axionia chiffre partout ailleurs ; et une garde exemptée une fois l'est ensuite pour d'autres. |
| Coordonnées dans la charge, chiffrées par axionia | La signature porte sur le corps exact, et Partners devrait détenir la clé d'axionia : deux dépôts partageraient un secret de chiffrement. |
| Faire ressaisir ses coordonnées au candidat dans Partners | Il faut déjà son adresse pour l'inviter à le faire. |
| Tirer les coordonnées à chaque besoin | La route deviendrait un annuaire interrogeable à volonté ; une seule lecture, au traitement, suffit. |

## Ce qui le vérifie

- **hors-code** — aucune assertion n'existe encore : la route et son client sont livrés par la tâche
  axionia versée par GOV-102 et par INT-T26, et les assertions attendues sont listées ci-dessous.

## Reste à faire

- **Assertions à poser** : côté axionia, un identifiant non émis vers Partners rend la même réponse
  qu'un identifiant inexistant, une signature fausse ou hors fenêtre est refusée, et le journal d'appel
  ne porte aucune coordonnée ; côté Partners (INT-T26), une route en panne laisse zéro apporteur et un
  événement en attente, puis la reprise en crée exactement un, et aucune coordonnée n'apparaît dans
  `evenements_recus`.
- REQ-QA-007 et le texte de partners/ADR-0008 disent encore « deux API » : l'alignement est porté par
  INT-T01c avec le `gardien-spec`.
