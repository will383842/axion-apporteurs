#!/usr/bin/env node
/**
 * hook-env.js — garde-fou d'environnement pour les agents (REQ-CPL-021).
 *
 * RÔLE   : appelé en `PreToolUse` sur chaque commande Bash. Refuse la commande si l'environnement
 *          pourrait toucher de la production ou envoyer un message à une vraie personne.
 * ENTRÉE : le JSON du hook sur stdin ({ tool_name, tool_input: { command } }).
 * SORTIE : code 0 = autorisé ; code 2 + message sur stderr = refusé (le message revient à l'agent).
 *
 * INVARIANTS GARDÉS
 *   1. `DATABASE_URL` doit être locale (localhost/127.0.0.1), un testcontainer, ou la magic string
 *      d'un build sans base. Toute autre valeur = production ou préproduction = refus.
 *   2. Hors production, `NOTIFY_SINK` doit valoir "true" : aucun e-mail, SMS, Telegram ou enveloppe
 *      DocuSeal ne part vers une vraie personne depuis un poste d'agent ou la CI.
 *   3. Aucune commande ne peut fixer ces variables en ligne (`DATABASE_URL=… pnpm …`).
 *   4. Aucun `git push` n'atteint la branche principale, et aucun n'ecrase l'historique distant.
 *      Ce quatrieme invariant DOUBLE les six regles `deny` de `.claude/settings.json`, qui sont
 *      des sous-chaines et supposent donc une FORME de commande. La lentille `securite` a montre
 *      sur la PR 27 que `git push origin lot/x:main --force` et `git push -u origin lot/x:main`
 *      passent entre toutes les six : la destination y est ecrite apres un deux-points, le
 *      drapeau de force est en fin de ligne. On ne rattrape pas une syntaxe par des morceaux de
 *      texte — `git-push-sur.js` la LIT. Voir ce fichier pour le detail.
 *   5. Aucune commande `gh` n'ecrit sur la protection de la branche principale, ni ne retire
 *      la revendication d'une tache. MEME FAMILLE DE DEFAUT que l'invariant 4, trouvee deux
 *      fois le 2026-09-04 : la regle `Bash(gh api * /branches/main/protection*)` exige une
 *      ESPACE devant `/branches`, que la commande reelle de `gh` n'a jamais — elle ne peut
 *      donc matcher qu'une commande INVALIDE, pendant que `Bash(gh api*)` est en `allow`.
 *      Voir `gh-sur.js`.
 *
 * POURQUOI : 40 agents qui testent, ce sont 40 sources d'envois réels. La règle est portée par un
 * hook et non par une consigne, parce qu'une consigne ne rougit pas.
 */

const { jugerPush } = require('./git-push-sur.js');
const { jugerGh } = require('./gh-sur.js');

const LOCAL = /^(postgres(ql)?:\/\/)[^@]*@(localhost|127\.0\.0\.1|db|postgres)(:\d+)?\//i;
const TESTCONTAINER = /^(postgres(ql)?:\/\/)[^@]*@(localhost|127\.0\.0\.1):\d{4,5}\//i;
const STUB = /stub\.invalid/i;

function refuser(message) {
  process.stderr.write(`[hook-env] REFUSÉ — ${message}\n`);
  process.exit(2);
}

let brut = '';
process.stdin.on('data', (c) => (brut += c));
process.stdin.on('end', () => {
  let commande = '';
  try {
    commande = (JSON.parse(brut || '{}').tool_input || {}).command || '';
  } catch {
    // entrée illisible : on n'a rien à garder, on laisse passer (le hook n'est pas un antivirus)
    process.exit(0);
  }

  // 3. surcharge en ligne interdite — ancrée en POSITION DE COMMANDE.
  //    Un test sur « n'importe où dans la ligne » refusait `grep -rn "NOTIFY_SINK=true" .env.example`
  //    et `git commit -m "chore(env): NOTIFY_SINK=true en dev"` avec un message parlant de surcharge :
  //    l'agent ne comprenait pas, réessayait, et consommait ses deux tentatives.
  if (/(^|[;&|]\s*|\benv\s+)(DATABASE_URL|REDIS_URL|NOTIFY_SINK|SEPA_EXPORT_ENABLED)\s*=/.test(commande)) {
    refuser(
      "une variable d'environnement gardée est fixée en tête de commande. " +
        'Ces valeurs viennent de `.env.local` ou de `.claude/settings.json`, jamais de la ligne de commande. ' +
        '(si tu voulais seulement citer la variable dans un texte, mets-la entre guillemets sans le signe `=` collé)'
    );
  }

  // 4. la branche principale et l'historique distant — juges sur les JETONS, pas sur du texte.
  const verdict = jugerPush(commande);
  if (verdict.refuse) refuser(verdict.motif);

  // 5. la forge — meme lecture par jetons, pour la meme raison.
  const verdictGh = jugerGh(commande);
  if (verdictGh.refuse) refuser(verdictGh.motif);

  const url = process.env.DATABASE_URL || '';
  if (url && !(LOCAL.test(url) || TESTCONTAINER.test(url) || STUB.test(url))) {
    refuser(
      `DATABASE_URL ne pointe pas sur une base locale (${url.replace(/:[^:@/]+@/, ':***@')}). ` +
        'Un agent ne touche jamais une base distante : la migration passe par le pipeline gardé par Gate D.'
    );
  }

  const prod = process.env.NODE_ENV === 'production' && process.env.PARTNERS_ENV === 'production';
  if (!prod && process.env.NOTIFY_SINK !== 'true') {
    refuser(
      'NOTIFY_SINK doit valoir "true" hors production. ' +
        "Sans lui, un test peut envoyer un e-mail, un SMS ou une enveloppe DocuSeal à une vraie personne."
    );
  }

  process.exit(0);
});
