# Runbook — fusionner une PR côté axionia

> **Ce runbook n'est PAS dans le workflow de lot.** Il est exécuté par l'orchestrateur, à la main, parce
> qu'`axionia` est un dépôt **partagé** : d'autres sessions Claude y travaillent en parallèle, et son
> workflow de déploiement porte `concurrency: cancel-in-progress`. Fusionner pendant un build en vol
> **tue ce build** et laisse la production en arrière.

## 0. Ce qu'il faut savoir avant de réserver

- Le build d'axionia dure **~50 minutes** (mesuré 2026-09-03, dont 48 sur le seul job d'image), pas 25 :
  le SSG couvre 17 629 routes. Le budget du workflow est de 90 min.
- **`gh pr list` ne montre pas les déploiements en vol.** Une PR fusionnée il y a 40 minutes est encore
  en train de construire. C'est l'erreur classique : réserver trop tôt.

## 1. Lire l'état réel — jamais un document

```bash
gh run list --branch main --workflow "Build & Deploy · GHCR + Coolify (axion-ia.com)" --limit 1
curl -sI https://axion-ia.com/fr | grep -i x-axion-build-sha
gh pr list --state open --json number,title,mergeStateStatus,updatedAt
```

Un build en cours → **on attend**. Un run `failure` n'est pas forcément un déploiement cassé : lis les
jobs un par un (`cancelled` ≠ `failure`), la vérité est dans `x-axion-build-sha`.

## 2. Annoncer le créneau — avant l'`update-branch`, pas avant le `merge`

Le coût n'est pas la fusion : c'est que `main` bouge **pendant** les gates. Une branche remise à jour au
mauvais moment refait 40 minutes de gates pour rien.

```
ListAgents
SendMessage → « Je réserve le créneau de fusion axionia pour la PR #<n> (chantier Partners).
               Build en cours : <aucun | sha, démarré à HH:MM>. Je rends le créneau après vérification
               de l'atterrissage. »
```

Attendre l'accusé des sessions actives. S'il y a déjà un créneau réservé, **on attend son signal de fin**.

## 3. Mettre à jour, vérifier et fusionner

```bash
gh pr update-branch <n>
gh pr checks <n> --watch
# Relire l'état ET fusionner dans le MÊME appel : une PR verte peut passer BEHIND entre les deux
gh pr view <n> --json mergeStateStatus && gh pr merge <n> --squash --delete-branch
```

⚠️ Jamais `--auto` : il ne met pas à jour une branche BEHIND et attend indéfiniment.

## 4. Vérifier l'atterrissage, puis rendre le créneau

```bash
# jusqu'à ce que l'en-tête porte le sha fusionné (compter ~50 min)
curl -sI https://axion-ia.com/fr | grep -i x-axion-build-sha
```

```
SendMessage → « Atterrissage vérifié : x-axion-build-sha = <sha>. Créneau libre. »
```

## 5. Si ça se passe mal

| Symptôme | Conduite |
| --- | --- |
| Le run est `cancelled` en plein déploiement | Une autre fusion a démarré. **Ne pas re-fusionner** : relancer le workflow sur le sha, prévenir la session concernée. |
| Seul le gate de performance est rouge | La version **est** en production. On le note, on ne rejoue pas la fusion. |
| `x-axion-build-sha` ne bouge pas après 60 min | Lire les jobs ; si le job d'image a échoué, corriger avant de refusionner quoi que ce soit. |
| Deux sessions ont réservé en même temps | Celle qui a annoncé la **première** garde le créneau ; l'autre annule son `update-branch`. |

## Ce qu'on ne fait jamais ici

- Toucher à la `concurrency` du workflow : le niveau workflow a déjà été essayé, abandonné (file qui
  s'empile), et le fichier porte un « NE PAS remettre ».
- Fusionner deux PR Partners d'affilée sans vérifier l'atterrissage de la première.
- Recopier une valeur de production vers un environnement de preview.
