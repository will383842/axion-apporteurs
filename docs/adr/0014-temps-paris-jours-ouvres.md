# partners/ADR-0014 — Le temps du métier : horloge injectée, heure de Paris calculée, jours ouvrés versionnés

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-09-19 |
| **Décideur** | `architecte` — cet ADR est `propose` : il consigne les arbitrages du brief de la tâche et les décisions de l'orchestrateur du 2026-09-19 ; seul l'`architecte` le fait passer à `accepte` |
| **Tâche** | CPL-T13 |
| **Exigences servies** | REQ-CPL-013, REQ-CPL-026, REQ-QA-027, REQ-UX-022, REQ-UX-028 |
| **Décisions du registre citées** | HYP-D3 |
| **Règle maison appliquée** | RM-01, RM-03, RM-10 |
| **Remplace / remplacé par** | — |

## Contexte

`docs/CONVENTIONS.md` §3 pose trois choses sans dire comment les tenir : tout horodatage est stocké
en UTC ; la conversion vers `Europe/Paris` est un fait d'affichage et de règle métier ;
`src/domain/**` est pur, « aucun `new Date()` — horloge injectée par le module `temps` ». Le lint du
domaine (QA-T01) refuse `new Date(…)` sous toutes ses formes, avec ou sans argument, et `Date.now`.

Cinq exigences attendent ce module : REQ-CPL-013 (horloge injectable, fuseau unique, fériés
versionnés, tests aux changements d'heure et au 29 février), REQ-QA-027 pour sa part « le domaine
reçoit une Clock », REQ-UX-022 (chrono de 48 h ouvrées, calendrier des fériés France), REQ-UX-028
(« réponse sous 2 jours ouvrés » mesurée par le même module), REQ-CPL-026 (capacité réelle et seuil
de vérification prioritaire, dont la formule est HYP-D3). Ses consommateurs sont DM-09 (dépôt),
UX-P1-07 (file de qualification), DM-13 (crons), UX-P3-03 (fil Aide) et le délai contractuel de
paiement de dix jours ouvrés (contrat, art. 5.3) : c'est un CONTRAT, pas un utilitaire.

## Décision

**T1 — Aucun objet du moteur pour le calendrier.** `src/domain/temps/` ne nomme ni l'objet date du
moteur, ni son API d'internationalisation, ni `performance`, ni `process`, ni `globalThis` — un
témoin propre au module le vérifie, plus strict que le lint. Le calendrier se calcule en
arithmétique : numéro de jour depuis le 1970-01-01 ↔ (année, mois, jour) par les algorithmes
`days_from_civil` / `civil_from_days` de Howard Hinnant ; jour de semaine = `(numéro + 4) mod 7`.

**T2 — La règle de Paris est codée, la base de fuseaux est un oracle.** UTC+1 l'hiver, UTC+2 l'été ;
passage le dernier dimanche de mars à 01:00 UTC, retour le dernier dimanche d'octobre à 01:00 UTC
(directive 2000/84/CE). La base de fuseaux du moteur est une entrée cachée — un résultat qui change
avec la version du moteur n'est pas une fonction pure — : elle ne sert que d'ORACLE, dans le test.

**Les deux heures sans réponse unique.** Au printemps, une heure inexistante (02:00-02:59) est
décalée après le saut, de la durée du saut (02:30 → 03:30). À l'automne, une heure ambiguë rend sa
première occurrence (heure d'été).

**T3 — Bornes : les années CIVILES DE PARIS 1996 à 2099**, soit les instants de 1995-12-31T23:00Z
inclus à 2099-12-31T23:00Z exclu (décision de l'orchestrateur du 2026-09-19 : un module de l'heure
de Paris borne en heure de Paris). Hors bornes : levée `hors_calendrier` qui nomme l'instant. Le
témoin des bornes du brief (sa panne n° 7) se lit donc à 1995-12-31T22:59:59.999Z (levée), et 1995-12-31T23:59Z est
1996-01-01 00:59 à Paris (accepté). La France suit la règle européenne actuelle depuis 1996 ; si
l'Union abolit le changement d'heure, c'est une nouvelle version du module, pas un correctif.

**Horloge.** `Horloge { maintenant(): Instant }`, `Instant` = millisecondes UTC entières.
`horlogeFigee(instant)` vit dans le domaine ; `horlogeSysteme` vit dans `src/lib/horloge.ts`, seul
endroit du code qui lit l'heure de la machine. `tests/setup.ts` ne fige AUCUNE horloge globale
(T9) : un temps simulé global fausserait les délais des gardes lancées en sous-processus et
masquerait un domaine qui lirait l'heure.

**Fériés versionnés.** `CALENDRIER_FERIES_FR` porte `version`, `date` et `source` (Code du travail,
article L3133-1) et les onze fêtes légales, chacune avec son attribut `chome`. Pâques est calculée
(algorithme grégorien anonyme) ; lundi de Pâques, Ascension et lundi de Pentecôte s'en déduisent.
Un jour OUVRÉ est un jour du lundi au vendredi qui n'est pas un férié chômé. Alsace-Moselle hors
calendrier (établissement en Isère).

**T6 — Le lundi de Pentecôte est férié au calendrier et TRAVAILLÉ par défaut**
(`LUNDI_DE_PENTECOTE_CHOME = false`). Motif : le module calcule aussi un délai que la Société DOIT
(dix jours ouvrés, art. 5.3) ; compter chômé un jour travaillé ferait payer un jour trop tard. Le
défaut sûr est l'échéance la plus courte. **Question ouverte à Will** : « le lundi de Pentecôte
est-il chômé chez AXION IA ? » — la réponse change cette constante et la `version` du calendrier,
rien d'autre.

**T4 — Une seule unité de SLA.** Une heure ouvrée est une heure civile de Paris écoulée pendant un
jour ouvré, sans plage horaire. `echeanceOuvree(debut, heures)` et `heuresOuvreesEcoulees(debut,
fin)` : 48 h ouvrées et 2 jours ouvrés sont la même fonction. Un départ hors jour ouvré compte
depuis le début du jour ouvré suivant. **L'échéance est EXCLUSIVE** : c'est le premier instant où la
durée écoulée atteint la durée demandée (vendredi 0 h + 24 h = samedi 0 h ; vendredi 15 h + 48 h =
mardi 15 h). Les changements d'heure tombent un dimanche, jamais un jour ouvré : le test le
vérifie sur 1996-2099.

**Capacité et seuil prioritaire (HYP-D3).** `capaciteSurPeriode` = somme, sur les jours ouvrés de la période
(bornes comprises), des qualifieurs non absents multipliée par la capacité par qualifieur et par
jour. `seuilPrioritaire({ palierConfiance, capaciteRestante, surchargeManuelle })` =
`surchargeManuelle` si elle est > 0, sinon `min(palierConfiance, capaciteRestante)` ; jamais un
plafond ; toute valeur négative ou non entière est refusée par une levée qui nomme le champ.

## Conséquences

- Tout code applicatif qui a besoin de « maintenant » reçoit une `Horloge` ; le domaine n'en
  construit jamais d'autre que `horlogeFigee`.
- Une échéance hors 1996-2099 lève au lieu de rendre une valeur approchée : un appelant qui
  calcule près de 2099 doit traiter `hors_calendrier`.
- Changer un attribut `chome` est une nouvelle version du calendrier : les échéances déjà posées
  l'ont été sous l'ancienne, et ce module ne les recalcule pas.
- Coût : le test d'oracle confronte environ 250 000 instants à la base de fuseaux (≈ 9 s pour les
  deux fichiers de test). Retour arrière : remplacer le calcul par la base du moteur, au prix de la
  pureté du domaine et d'un résultat dépendant de la version du moteur.

## Alternatives écartées

| Alternative | Pourquoi elle est écartée |
| --- | --- |
| Lire le fuseau dans la base du moteur, dans le domaine | Entrée cachée : le résultat change avec la version du moteur, le domaine n'est plus une fonction pure. |
| Une bibliothèque de dates (date-fns-tz, Luxon, Temporal) | Même entrée cachée, plus une dépendance à épingler ; la règle européenne tient en quelques lignes vérifiées par oracle. |
| Heures ouvrées sur une plage (9 h-18 h) | REQ-UX-028 égale « 2 jours ouvrés » aux 48 h ouvrées de REQ-UX-022 : une seule unité, sans plage. |
| Bornes en années UTC | Un module de l'heure de Paris rendrait des dates de Paris (2100-01-01 00:30) qu'aucune de ses fonctions ne sait traiter. |
| Lundi de Pentecôte chômé par défaut | Reculerait d'un jour un délai que la Société doit, si le jour est en réalité travaillé. |
| Un temps simulé global dans `tests/setup.ts` | Fausserait les délais des gardes en sous-processus et masquerait un domaine qui lirait l'heure. |

## Ce qui le vérifie

- **Assertion** — `tests/unit/domaine/temps-horloge-et-feries.spec.ts` ·
  `it('REQ-QA-027 — aucun fichier de src/domain/temps/ ne nomme Date, Intl, performance, process ni globalThis')` :
  T1 et T2 ; un nom interdit dans un fichier du module fait rougir, avec le fichier et la ligne.
- **Assertion** — `tests/unit/domaine/temps-horloge-et-feries.spec.ts` ·
  `it('REQ-CPL-013 — de 1996 à 2099 : 48 h autour de chaque changement d’heure au quart d’heure, et midi de chaque jour, concordent avec l’oracle')` :
  la règle européenne ; un dimanche décalé ou une heure de bascule fausse fait rougir.
- **Assertion** — `tests/unit/domaine/temps-horloge-et-feries.spec.ts` ·
  `it('REQ-CPL-013 — hors des années 1996 à 2099 de Paris : levée hors_calendrier qui nomme l’instant')` :
  T3, les bornes en heure de Paris.
- **Assertion** — `tests/unit/domaine/temps-horloge-et-feries.spec.ts` ·
  `it('REQ-CPL-013 — le lundi de Pentecôte est férié au calendrier et TRAVAILLÉ par défaut ; basculer son attribut « chômé » change les jours ouvrés de mai 2027')` :
  T6.
- **Assertion** — `tests/unit/domaine/temps-horloge-et-feries.spec.ts` ·
  `it('REQ-UX-022 — un départ hors jour ouvré compte depuis le début du jour ouvré suivant ; l’échéance est exclusive')` :
  T4, la sémantique de l'échéance.
- **Assertion** — `tests/unit/domaine/seuil-prioritaire.spec.ts` ·
  `it('REQ-CPL-026 — une surcharge manuelle > 0 remplace le min, même au-delà du palier : jamais un plafond')` :
  HYP-D3.

## Reste à faire

- La réponse de Will sur le lundi de Pentecôte : une ligne et une version du calendrier.
- Le témoin des noms interdits est propre à `src/domain/temps/` : GOV-076 le généralise à tout
  `src/domain/**` ou le rend inutile.
- Le relevé unique et le rattrapage des crons (reste de REQ-QA-027) : DM-13 et T-ARG-015.
- La formule d'AFFICHAGE du SLA paramétré par la capacité (REQ-CPL-026, première phrase) : ce module
  fournit la capacité, la formule revient à UX-P1-07 — si elle y manque, c'est une question produit
  pour Will.
