/**
 * gh-sur.js — décide si une commande `gh` a le droit de partir. (REQ-CPL-021, REQ-GOV-014)
 *
 * POURQUOI CE FICHIER EXISTE. C'est le deuxième trou de la même famille que `git-push-sur.js`,
 * trouvé le 2026-09-04 par la tâche GOV-012 puis par GOV-008, chacune de son côté.
 *
 * 1. LA PROTECTION DE BRANCHE. La matrice d'autonomie croyait l'interdire par
 *
 *        "Bash(gh api * /branches/main/protection*)"
 *
 *    Cette règle exige une ESPACE devant `/branches`. La commande réelle de `gh` n'en a jamais :
 *
 *        gh api repos/will383842/axion-apporteurs/branches/main/protection
 *
 *    La règle ne pouvait donc matcher qu'une commande INVALIDE — et `"Bash(gh api*)"` est en
 *    `allow`. `gh api -X DELETE …/branches/main/protection` efface toute la protection de la
 *    branche principale sans rencontrer le moindre refus. La lecture a été jouée et est passée ;
 *    aucune écriture ne l'a été.
 *
 * 2. LE VOL DE REVENDICATION. `"Bash(gh issue edit*)"` est en `allow` et aucune règle ne couvre
 *    `--remove-label`. Un agent peut donc retirer `owner:A01` d'une issue, poser `owner:A05`, et
 *    ouvrir sa PR : l'état final ne porte qu'UN revendiqueur, la garde `gov:etat` est verte, et
 *    REQ-GOV-007 est respectée à la lettre pendant que le verrou a été forcé. Le détecter côté
 *    forge est IMPOSSIBLE : `W13` a tranché un dépôt personnel à un seul compte GitHub, donc
 *    A01 et A05 y sont la même identité. La seule barrière possible est locale — celle-ci.
 *
 * On ne rattrape pas une syntaxe par des morceaux de texte. Ce module LIT la commande, comme son
 * voisin `git-push-sur.js` : segments, jetons, sous-commande, drapeaux. Les règles `deny` restent
 * en place et le DOUBLENT — une garde qui dépend d'un seul mécanisme tombe avec lui.
 */

/** Les méthodes HTTP qui ÉCRIVENT. `gh api` sans méthode fait un GET : lire est permis. */
const METHODES_ECRITURE = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Les points d'entrée d'API qu'un agent ne touche jamais, même en lecture seule apparente. */
const CHEMINS_INTERDITS_EN_ECRITURE = [
  '/branches/main/protection',
  '/branches/master/protection',
  '/rulesets',
  '/actions/permissions',
  '/collaborators',
  '/keys',
  '/hooks',
];

/** Découpe une ligne de shell en segments. Grossier à dessein : ne rater aucun `gh` caché. */
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

/**
 * Juge UNE ligne de commande.
 * @returns {{ refuse: boolean, motif: string | null }}
 */
function jugerGh(ligne) {
  for (const segment of segments(ligne)) {
    const t = jetons(segment);

    // `gh` doit être EN POSITION DE COMMANDE. Chercher `gh` n'importe où refuserait
    // `echo gh api ...` et `grep -rn "gh issue edit" docs/`, qui n'appellent rien. Même
    // raisonnement que dans `git-push-sur.js` : une garde trop large apprend à être contournée.
    const PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'nohup', 'time']);
    let i = 0;
    while (i < t.length && (PREFIXES.has(t[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i] || ''))) i++;
    const verbe = t[i];
    if (verbe === undefined) continue;
    if (!(verbe === 'gh' || verbe.endsWith('/gh') || verbe.endsWith('\\gh.exe'))) continue;

    const args = t.slice(i + 1);
    const sousCommande = args.find((a) => !a.startsWith('-'));

    // ── `gh api` ─────────────────────────────────────────────────────────────
    if (sousCommande === 'api') {
      let methode = 'GET';
      for (let k = 0; k < args.length; k++) {
        const a = args[k];
        if (a === '-X' || a === '--method') methode = (args[k + 1] || '').toUpperCase();
        else if (a.startsWith('--method=')) methode = a.slice('--method='.length).toUpperCase();
        // `-f`/`--field`/`--input` posent un corps : gh bascule alors en POST tout seul.
        else if (a === '-f' || a === '--field' || a === '--raw-field' || a === '--input') {
          if (methode === 'GET') methode = 'POST';
        }
      }
      const ecrit = METHODES_ECRITURE.includes(methode);
      const cible = args.find((a) => !a.startsWith('-') && a !== 'api' && a.includes('/')) || '';

      const interdit = CHEMINS_INTERDITS_EN_ECRITURE.find((c) => cible.includes(c));
      if (ecrit && interdit !== undefined) {
        return {
          refuse: true,
          motif:
            `\`gh api ${methode} ${cible}\` — écriture sur « ${interdit} ». La protection de la ` +
            `branche principale, les règles du dépôt, ses collaborateurs et ses clés ne se ` +
            `modifient jamais depuis un poste d'agent (REQ-GOV-014, REQ-CPL-021). ` +
            `La LECTURE du même chemin reste permise : c'est ainsi que \`gov:depot-visibilite\` ` +
            `vérifie que la protection est en place.`,
        };
      }
      if (ecrit && /\/(repos|orgs)\//.test(cible) && /\/(visibility|topics|transfer)\b/.test(cible)) {
        return {
          refuse: true,
          motif: `\`gh api ${methode} ${cible}\` — la visibilité du dépôt est tranchée par W13, pas par un agent.`,
        };
      }
      continue;
    }

    // ── `gh issue edit` / `gh pr edit` — le vol de revendication ─────────────
    if (sousCommande === 'issue' || sousCommande === 'pr') {
      const apres = args.slice(args.indexOf(sousCommande) + 1);
      if (apres.includes('edit')) {
        for (let k = 0; k < apres.length; k++) {
          const a = apres[k];
          const valeur = a.includes('=') ? a.slice(a.indexOf('=') + 1) : apres[k + 1] || '';
          const estRetrait = a === '--remove-label' || a.startsWith('--remove-label=');
          if (estRetrait && /^(owner:|en_cours\b)/.test(valeur)) {
            return {
              refuse: true,
              motif:
                `\`--remove-label ${valeur}\` retire la REVENDICATION d'une tâche. Sur un dépôt à ` +
                `un seul compte (W13), la forge ne peut pas distinguer deux agents : rien, côté ` +
                `GitHub, ne verrait qu'un agent a pris la tâche d'un autre — l'état final ne ` +
                `porterait qu'un revendiqueur et \`gov:etat\` serait verte (REQ-GOV-007). ` +
                `Une revendication se relâche par \`pnpm lot:cloture\`, qui écrit le statut, ou ` +
                `elle expire d'elle-même après six heures.`,
            };
          }
        }
      }
    }
  }
  return { refuse: false, motif: null };
}

module.exports = { jugerGh, METHODES_ECRITURE, CHEMINS_INTERDITS_EN_ECRITURE, segments, jetons };
