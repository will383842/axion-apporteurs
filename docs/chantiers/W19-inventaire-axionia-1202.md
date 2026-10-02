# Inventaire W19 — la PR axion-ia #1202 et les deux populations

> JUR-T33 (REQ-JUR-043, REQ-CPL-030), chantier W19 (`docs/chantiers/W19-conseillers-salaries.md`).
> Rédigé par A07 le 2026-10-01. **Constat seul** : lecture d'axion-ia, sans aucune modification de ce
> dépôt. Il ne demande pas de défaire la PR, et se termine par une question à Williams.
>
> Périmètre (réponse de Williams à la question 1 de W19, 2026-09-29) : la seule PR axion-ia #1202.
> L'annonce de recrutement « Responsable du réseau commercial » n'en fait pas partie. Les autres surfaces
> d'axion-ia relèvent de la réponse à la question 12 (aucun accès du conseiller à axion-ia en V1).

## 1. Ce qui a été lu

- La PR axion-ia #1202, « CV Indeed et analyse dans la fiche, cadre « poste salarié » ». Elle a été fusionnée le
  2026-09-28 (commit de fusion `c933766a`) et elle est contenue dans `a12e58165`.
- La branche `main` d'axion-ia au commit `782cc971`. Les lignes citées ci-dessous sont celles de ce commit.

## 2. Constat

1. **La fiche d'un apporteur porte un cadre « poste salarié ».**
   `src/app/[locale]/(admin)/[adminPrefix]/submissions/_v2/CvCandidatDetail.tsx:20-31` rend, dans la
   console d'axion-ia, l'avertissement « A postulé pour un poste de commercial SALARIÉ », suivi du canal et
   de l'annonce, puis de la consigne interne « pendant l'échange, vérifier qu'elle accepte un statut
   d'indépendant rémunéré à la commission, sans salaire ».
2. **Ce cadre n'est affiché que sur une fiche d'apporteur.**
   `src/app/[locale]/(admin)/[adminPrefix]/submissions/_v2/SubmissionDetailContent.tsx:135` ne lit
   `details.candidatureSalariee` que si la fiche est un contact apporteur, et la ligne `:209` affiche
   le cadre.
3. **La donnée.** `src/lib/commercial-application/cv-candidat.ts:16` et `:22` décrivent
   `details.candidatureSalariee = { canal, annonce }`, et la ligne `:109` la lit.
4. **Comment la personne entre dans le tunnel des apporteurs.**
   `scripts/import-cv-apporteurs.mjs:20-25` : pour chaque CV reçu par l'annonce Indeed, le script
   rattache le CV à une fiche d'apporteur existante, retrouvée par l'empreinte de l'adresse, **ou crée une
   fiche d'apporteur** (statut « new », aucun e-mail envoyé). Il pose `details.candidatureSalariee` sauf si
   la personne n'a pas répondu à l'annonce salariée (`:170`). La personne qui visait un poste salarié est
   donc **placée dans le tunnel des apporteurs** (Contacts › Commercial) sans geste de sa part.
5. **Un autre parcours existe déjà dans axion-ia.**
   `src/features/admin-job-applications/proposer-reseau-actions.ts:1-27` (décision de Williams du
   2026-09-28) : à une personne qui a postulé à une offre d'emploi, Axion-IA **propose** le réseau
   d'apporteurs par un premier message, dans une variante dédiée, et « le consentement n'est pas
   simulé ». L'import du point 4 n'emprunte pas ce parcours.
6. **Rien de cela ne traverse vers Partners.** `src/server/partners/payloads.ts:831` et suivantes
   n'envoient à Partners que des champs nommés de `details` : les réponses de `details.candidature`,
   le score (`details.score` et `details.scoreParts`, `:956-957`), le canal (`details.source`) et
   `details.funnel`. `details.candidatureSalariee` et `details.cv` n'en font pas partie : aucune donnée
   de la PR #1202 n'atteint ce dépôt.

## 3. Ce que le constat touche

- **REQ-CPL-030** : le tunnel des apporteurs accueille des personnes qui ont postulé à un poste salarié,
  et c'est par ce canal que les deux populations se mêlent. Le contrôle croisé de REQ-CPL-030 vise un
  conseiller actif. Il ne voit pas une personne qui a seulement postulé.
- **REQ-JUR-043** : rien n'est atteint côté apporteur. Le cadre ne vit que dans la console d'axion-ia, et
  rien n'en est envoyé à l'apporteur ni à Partners.

## 4. Question à Williams

**Pour une personne arrivée par l'annonce salariée Indeed, préférez-vous :**

- **A (recommandé)** : qu'elle n'entre dans le tunnel des apporteurs qu'après avoir accepté la
  proposition, par le parcours « proposer le réseau » qui existe déjà (point 5) ? L'import du point 4
  garderait alors la fiche de candidature, et l'invitation au réseau partirait par ce parcours. Le cadre
  « poste salarié » resterait utile jusqu'à l'échange.
- **B** : la laisser telle quelle dans le tunnel des apporteurs, avec le cadre actuel, et lever le
  malentendu pendant l'échange de 15 minutes ?

Recommandation : **A**. Les deux populations restent séparées dès l'entrée (REQ-CPL-030), avec un
mécanisme qu'axion-ia possède déjà, et la PR #1202 n'est pas défaite : seul le point d'entrée de
l'import change. Ce changement serait une tâche d'axion-ia, hors de ce dépôt.
