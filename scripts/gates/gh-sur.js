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
  // AJOUTÉ apres la lentille securite de la PR 28, qui l'a JOUÉ : sans cette ligne,
  //     gh api --method=DELETE repos/o/r/issues/12/labels/owner:A01
  // retire la revendication d'un autre agent par l'API REST, la ou `gh issue edit
  // --remove-label` etait refuse. Fermer une porte et laisser l'autre ouverte ne ferme rien.
  '/labels',
];

/**
 * Les drapeaux de `gh api` qui CONSOMMENT l'argument suivant. Sans cette liste, le point d'entree
 * etait cherche comme « le premier jeton sans tiret qui contient un / » — et la VALEUR d'un
 * en-tete le volait :
 *     gh api -H "Accept: application/vnd.github+json" -X DELETE repos/o/r/keys/1
 * y designait `application/vnd.github+json` comme cible, donc aucun chemin interdit reconnu.
 * JOUÉ par la lentille securite sur la PR 28 : l'ecriture sur /keys, /hooks, /collaborators et
 * /rulesets passait le hook ET les `deny`.
 */
const DRAPEAUX_A_VALEUR = new Set([
  '-X', '--method', '-H', '--header', '-f', '--field', '-F', '--raw-field',
  '--input', '-q', '--jq', '-t', '--template', '--cache', '--hostname', '-R', '--repo',
  '-p', '--preview', '--slurp',
]);

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
      // On lit les arguments EN SACHANT lesquels consomment le suivant. Un balayage naif prend la
      // valeur d'un `-H` pour le point d'entree (cf. DRAPEAUX_A_VALEUR).
      const apresApi = args.slice(args.indexOf('api') + 1);
      let methode = 'GET';
      let cible = '';
      const valeursDeChamp = [];
      for (let k = 0; k < apresApi.length; k++) {
        const a = apresApi[k];
        if (a === '-X' || a === '--method') {
          methode = (apresApi[k + 1] || '').toUpperCase();
          k++;
          continue;
        }
        if (a.startsWith('--method=')) {
          methode = a.slice('--method='.length).toUpperCase();
          continue;
        }
        // `-XDELETE` colle a sa valeur : forme acceptee par gh, invisible pour un motif.
        if (/^-X./.test(a)) {
          methode = a.slice(2).toUpperCase();
          continue;
        }
        if (a === '-f' || a === '--field' || a === '-F' || a === '--raw-field' || a === '--input') {
          if (methode === 'GET') methode = 'POST';
          if (apresApi[k + 1] !== undefined) valeursDeChamp.push(apresApi[k + 1]);
          k++;
          continue;
        }
        if (/^--?(f|F|field|raw-field)=/.test(a)) {
          if (methode === 'GET') methode = 'POST';
          valeursDeChamp.push(a.slice(a.indexOf('=') + 1));
          continue;
        }
        if (DRAPEAUX_A_VALEUR.has(a)) {
          k++;
          continue;
        }
        if (a.startsWith('-')) continue;
        if (cible === '') cible = a;
      }
      const ecrit = METHODES_ECRITURE.includes(methode);

      // GRAPHQL. Le point d'entree vaut `graphql` et ne contient aucun `/` : la liste des chemins
      // interdits, qui est REST, ne le juge pas. JOUÉ sur la PR 28 :
      //     gh api graphql -f query='mutation{deleteBranchProtectionRule(...)}'
      // Le trou n°1 etait referme cote REST et rouvert cote GraphQL. Une mutation GraphQL ECRIT,
      // par definition : on la refuse, et les requetes de lecture restent permises.
      if (cible === 'graphql' || cible.endsWith('/graphql')) {
        // On teste le SEGMENT ENTIER, pas seulement les valeurs de champ collectees. Le decoupage
        // en jetons casse sur les espaces hors guillemets : `-f query="  MUTATION { x }"` donne
        // les jetons `query="`, `MUTATION`, `{`, `x`, `}"` — le corps ne se recompose pas. Sur un
        // point d entree GraphQL, chercher le mot dans toute la ligne echoue FERME.
        const corps = segment;
        // On juge sur la MUTATION, jamais sur la methode : GraphQL POSTe TOUJOURS, requetes de
        // lecture comprises. Tester `ecrit` ici refusait une simple requete de LECTURE, et une
        // garde qui refuse les lectures se fait desarmer dans la semaine.
        if (/\bmutation\b/i.test(corps)) {
          return {
            refuse: true,
            motif:
              `\`gh api graphql\` avec une MUTATION. Le point d'entree GraphQL n'a pas de chemin REST : ` +
              `la liste des routes interdites ne le voit pas, et c'est par la qu'on refermait une porte ` +
              `en en laissant une autre ouverte. Une requete de LECTURE reste permise.`,
          };
        }
        continue;
      }

      const interdit = CHEMINS_INTERDITS_EN_ECRITURE.find((c) => cible.includes(c));
      if (ecrit && interdit !== undefined) {
        return {
          refuse: true,
          motif:
            `\`gh api ${methode} ${cible}\` — ecriture sur « ${interdit} ». La protection de la ` +
            `branche principale, les regles du depot, ses collaborateurs, ses cles et les etiquettes ` +
            `d'une issue ne se modifient jamais depuis un poste d'agent (REQ-GOV-014, REQ-GOV-007, ` +
            `REQ-CPL-021). La LECTURE du meme chemin reste permise : c'est ainsi que ` +
            `\`gov:depot-visibilite\` verifie que la protection est en place.`,
        };
      }
      if (ecrit && /\/(repos|orgs)\//.test(cible) && /\/(visibility|topics|transfer)\b/.test(cible)) {
        return {
          refuse: true,
          motif: `\`gh api ${methode} ${cible}\` — la visibilite du depot est tranchee par W13, pas par un agent.`,
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
          // La valeur est une LISTE separee par des virgules — `gh` l'accepte, et le motif ancre
          // `^owner:` ne voyait que le premier element. JOUÉ sur la PR 28 :
          //     gh issue edit 12 --remove-label "prio:haute,owner:A01"
          // passait le hook ET les `deny`. On juge chaque element.
          const etiquettes = valeur.split(',').map((x) => x.trim()).filter((x) => x !== '');
          if (estRetrait && etiquettes.some((e) => /^(owner:|en_cours\b)/.test(e))) {
            const volee = etiquettes.find((e) => /^(owner:|en_cours\b)/.test(e)) ?? valeur;
            return {
              refuse: true,
              motif:
                `\`--remove-label ${volee}\` retire la REVENDICATION d'une tâche. Sur un dépôt à ` +
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
