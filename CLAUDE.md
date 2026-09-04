# Axion Partners — à lire AVANT d'écrire quoi que ce soit

## 1. Le premier geste n'est jamais celui qu'on croit

**Ouvre `docs/REPRISE-SESSION.md` et lis son premier paragraphe avant toute autre chose.**
C'est la note de passation entre sessions, elle vit dans le dépôt, et son §1 dit **le geste exact**
par lequel commencer. Ce geste change d'une session à l'autre.

Cette instruction vaut quelle que soit la formulation de la demande. « Continue l'implémentation »,
« reprends le projet », « lance le lot suivant » et « avance » veulent **tous** dire : lis la note,
puis fais ce que son §1 dit — et pas autre chose.

## 2. La règle qui rend le §1 nécessaire

**On ne compose JAMAIS un lot tant qu'une PR portant la clôture du lot précédent est ouverte.**

Le composeur (`pnpm lot:composer`) lit les statuts de `docs/tasks.json` **sur la branche courante**.
Une clôture qui n'a pas atterri sur `main` n'y est pas : le composeur recomposerait les mêmes
tâches, et le travail de la PR ouverte serait écrasé ou dupliqué. Avant de composer :

```bash
gh pr list --state open        # une PR de clôture ouverte ? on la finit d'abord.
```

⚠️ Cette garde n'est **pas** armée : rien ne rougit si on l'enfreint. C'est une consigne, pas un
contrôle — traite-la comme telle, c'est-à-dire avec plus de méfiance, pas moins. L'armer
(`lot:composer` refuse tant qu'une PR de clôture est ouverte, avec son témoin et son
contre-témoin) est une tâche qui vaut d'être prise.

## 3. Lancer la session DEPUIS le dépôt

```bash
cd C:\Users\willi\Documents\Projets\axion-apporteurs
```

Le registre des agents est figé à la racine de la session. Lancée d'ailleurs, les fiches de rôle ne
résolvent pas : l'autopilote meurt au premier agent, ou — pire — tourne avec des relecteurs qui
peuvent écrire.

## 4. Les trois choses qui font perdre une demi-journée

- **Gate A locale : lire le `$?` de CHAQUE commande, jamais un tube.** `pnpm <cible> | tail -6`
  rend le code de `tail`, donc zéro. Ça a déjà imprimé `GATE A LOCAL: OK` sur trois gates rouges.
- **L'entrée de journal s'écrit sur la branche de la PR, avec le reste, AVANT la fusion.**
  L'oubli coûte une PR entière et un `main` rouge dans l'intervalle — c'est arrivé.
- **`pnpm plan-state:build` est le DERNIER geste avant le push**, après l'entrée de journal :
  `docs/PLAN-STATE.md` **rend** le journal, il ne le stocke pas.

## 5. Ce qui fait autorité, et dans quel ordre

`docs/PRESEANCE.md` tranche. En résumé : les **sources** sont `docs/tasks.json`,
`docs/requirements.json`, `docs/DECISIONS.md`, `docs/journal/`, `docs/adr/` ; tout le reste est une
**vue générée** qu'on ne modifie jamais à la main. `docs/REPRISE-SESSION.md` ne fait autorité sur
rien : c'est une note de passation, ses chiffres sont datés et périment.

`docs/PROTOCOLE-FUSION.md` pour fusionner. `docs/CHARTE-AGENTS.md` pour les rôles et les lentilles.
Le protocole complet d'un lot, de bout en bout, est en fin de `docs/REPRISE-SESSION.md`.
