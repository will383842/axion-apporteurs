/**
 * git-push-sur.js — décide si une commande `git push` a le droit de partir. (REQ-CPL-021, RM-09)
 *
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL N'EST PAS UNE LIGNE DE PLUS DANS `deny`.
 *
 * La matrice d'autonomie interdit de pousser sur la branche principale par six règles `deny`
 * écrites comme des sous-chaînes : `git push origin main*`, `git push * main*`, `git push --force*`,
 * `git push -f*`… Chacune suppose une FORME de la commande — un espace juste avant `main`, un
 * drapeau collé au verbe. Or git ne l'impose pas. La lentille `securite` a montré, sur la PR 27,
 * deux commandes qui atteignent la branche principale sans qu'aucune des six ne les voie :
 *
 *     git push origin lot/L-9-99-integration:main --force
 *     git push -u origin lot/quelquechose:main
 *
 * La destination y est écrite après un DEUX-POINTS, et le drapeau de force est en fin de ligne.
 * Élargir l'`allow` à `lot/*` élargissait donc aussi cette porte. Ajouter d'autres sous-chaînes ne
 * ferme rien : on ne rattrape pas une syntaxe par des morceaux de texte, on la LIT.
 *
 * Ce module lit. Il découpe la commande en segments (`;`, `&&`, `||`, `|`), isole ceux qui appellent
 * `git push`, et juge sur les JETONS : la destination réelle de chaque refspec, et la présence d'un
 * drapeau qui écrase. C'est appelé par `hook-env.js` en `PreToolUse`, donc AVANT que la commande
 * n'existe — et c'est testable, ce qu'une liste de motifs dans un fichier de réglages n'est pas.
 *
 * Ce module ne remplace pas les règles `deny` : il les double. Une garde qui dépend d'un seul
 * mécanisme tombe avec lui.
 */

/** Les branches qu'un agent ne pousse jamais, sous aucune forme. */
const PROTEGEES = ['main', 'master'];

/** Les drapeaux qui écrasent l'historique distant, ou qui poussent plus que ce qu'on nomme. */
const DRAPEAUX_INTERDITS = [
  '--force',
  '-f',
  '--force-with-lease',
  '--force-if-includes',
  '--mirror',
  '--all',
  '--tags', // pousse des références qu'aucun refspec de la ligne ne nomme
];

/**
 * Découpe une ligne de shell en segments de commande. Grossier À DESSEIN : on ne cherche pas à
 * comprendre le shell, seulement à ne rater aucun `git push` caché derrière un `&&`.
 */
function segments(ligne) {
  return ligne
    .split(/\|\||&&|[;|\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Les jetons d'un segment, guillemets retirés. */
function jetons(segment) {
  const bruts = segment.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return bruts.map((t) => t.replace(/^["']|["']$/g, ''));
}

/** La destination d'un refspec : ce qui suit le dernier `:`, sinon le refspec lui-même. */
function destination(refspec) {
  const sansPlus = refspec.replace(/^\+/, '');
  const i = sansPlus.lastIndexOf(':');
  const dst = i >= 0 ? sansPlus.slice(i + 1) : sansPlus;
  return dst.replace(/^refs\/heads\//, '');
}

/**
 * Juge UNE ligne de commande.
 * @returns {{ refuse: boolean, motif: string | null }}
 */
function jugerPush(ligne) {
  for (const segment of segments(ligne)) {
    const t = jetons(segment);
    // `git` doit être EN POSITION DE COMMANDE — premier jeton du segment, éventuellement précédé
    // d'affectations d'environnement, de `sudo`, `env`, `command` ou `exec`. Chercher `git`
    // n'importe où dans la ligne refuserait `echo git push origin main` et
    // `grep -rn "git push origin main" docs/`, qui ne poussent rien. Le fichier voisin
    // `hook-env.js` porte déjà la trace de cette erreur : un test « n'importe où dans la ligne »
    // y refusait un `git commit -m` dont le MESSAGE parlait de la variable gardée ; l'agent ne
    // comprenait pas, réessayait, et brûlait ses deux tentatives. Une garde trop large ne garde
    // pas mieux — elle apprend à être contournée.
    const PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'nohup', 'time']);
    let iGit = 0;
    while (iGit < t.length && (PREFIXES.has(t[iGit]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[iGit] || ""))) {
      iGit++;
    }
    const verbe = t[iGit];
    if (verbe === undefined) continue;
    if (!(verbe === 'git' || verbe.endsWith('/git') || verbe.endsWith('\\git.exe'))) continue;
    const apres = t.slice(iGit + 1);
    const iPush = apres.indexOf('push');
    if (iPush < 0) continue;
    const args = apres.slice(iPush + 1);

    for (const a of args) {
      if (DRAPEAUX_INTERDITS.includes(a)) {
        return {
          refuse: true,
          motif:
            `\`${a}\` sur un \`git push\`. Un agent ne réécrit jamais l'historique distant et ne ` +
            `pousse que la référence qu'il nomme (RM-09). Si une branche a divergé, elle se remet à ` +
            `jour par \`git merge origin/main\`, jamais par écrasement.`,
        };
      }
      // `--force=…` et compagnie : le drapeau collé à sa valeur.
      if (/^--force(-with-lease|-if-includes)?=/.test(a)) {
        return { refuse: true, motif: `\`${a}\` sur un \`git push\` : écrasement de l'historique distant (RM-09).` };
      }
    }

    // Un `git push` SANS refspec pousse ce que `push.default` decide — sur une branche `main`
    // locale, c'est `main`. La garde ne peut pas lire la configuration du poste depuis un hook,
    // et une garde qui doit deviner ne garde rien : on exige la reference nommee.
    const refspecs = args.filter((a) => !a.startsWith('-'));
    if (refspecs.length < 2) {
      return {
        refuse: true,
        motif:
          "`git push` sans refspec explicite : ce qui part depend de `push.default` et de la " +
          "branche courante, que ce hook ne peut pas lire. Ecris la destination — " +
          '`git push -u origin lot/<id>` — pour que la commande dise ce qu\'elle fait.',
      };
    }

    for (const a of args) {
      if (a.startsWith('-')) continue; // un drapeau n'est pas un refspec
      const dst = destination(a);
      if (PROTEGEES.includes(dst)) {
        return {
          refuse: true,
          motif:
            `cette commande pousse vers \`${dst}\` (refspec « ${a} »). La branche principale ne ` +
            `reçoit que des fusions de PR, jamais un push (REQ-GOV-014). ` +
            `Ouvre une PR depuis une branche \`lot/…\` ou \`t/…\`.`,
        };
      }
      if (a.startsWith('+')) {
        return {
          refuse: true,
          motif: `refspec « ${a} » : le \`+\` initial est un écrasement forcé, refusé comme \`--force\` (RM-09).`,
        };
      }
    }
  }
  return { refuse: false, motif: null };
}

module.exports = { jugerPush, PROTEGEES, DRAPEAUX_INTERDITS, destination, segments, jetons };
