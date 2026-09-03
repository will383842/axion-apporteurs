# Prompt type — un développeur reçoit sa tâche

> Modèle utilisé par `scripts/lot/lot.workflow.js` (étape « Dev »). Il ne remplace pas la fiche de rôle
> `.claude/agents/dev-partners.md` : il la **complète** avec la tâche du jour.

---

Tâche à traiter :

```json
{ …l'entrée de docs/tasks.json, telle quelle… }
```

Documents à lire **avant d'écrire quoi que ce soit**, dans cet ordre :

1. `docs/PLAN-STATE.md` — où en est le projet, ce qui est bloqué
2. `docs/REGLES-MAISON.md` — les règles qui ont déjà coûté cher
3. `docs/CONVENTIONS.md` — nommage, argent, branches, worktrees, pré-vol
4. Ta fiche de rôle
5. **Chaque REQ citée dans ta tâche**, mot à mot, dans `docs/REQUIREMENTS.md`
6. Les sections de `docs/spec/` que ta tâche référence — **et `docs/CONSTATS.md` si elles y sont
   corrigées** (les 7 documents affirment des choses fausses sur le code d'axionia : `Invoice` et `Refund`
   ont été supprimés, `Payment.amountCents` est un TTC, la chaîne de résolution passe par des colonnes
   optionnelles)

Horodatage de référence pour ce lot : `{{now}}`.

## Cycle imposé

1. Worktree et branche `t/{{id-minuscule}}`.
2. **Le test d'abord**, annoté `// @req REQ-…`. Lance-le : il **doit** échouer. Copie le message d'échec
   **verbatim** — il va dans ta PR et dans ton rendu ; sans lui, la revue refuse.
3. Le code **minimal** qui le fait passer. Le périmètre est celui des REQ citées, pas un de plus.
4. `pnpm prevol`, commits conventionnels, push, `gh pr create` avec : REQ couvertes, bloc ROUGE/VERT,
   section « Attaque » si la tâche est sensible.

## Si tu es bloqué

- Une `hyp` de ta tâche n'a **pas d'entrée** dans `docs/DECISIONS.md` → `stop`, motif
  `decision_sans_hypothese`.
- Une REQ **ne se teste pas** → `stop`, motif `req_non_testable`. Elle retourne en spécification.
- Un tiers est indisponible **sans repli écrit** → `stop`, motif `dependance_externe_sans_repli`.

**Ne devine jamais.** Un `stop` coûte une heure ; une hypothèse inventée coûte une campagne de
re-signature ou un versement erroné.

## Ton rendu

```json
{
  "taskId": "…", "branch": "t/…", "pr": 0, "statut": "livree",
  "rouge": "<message verbatim de l'échec, AVANT le code>",
  "vert": true,
  "reqCouvertes": ["REQ-…"],
  "appris": ["ce qu'un autre agent doit savoir et qui n'est écrit nulle part"],
  "stop": null
}
```

Le champ `appris` n'est pas décoratif : c'est par lui que les règles maison s'écrivent.
