/**
 * corps-de-pr.ts — REND le corps d'une PR depuis les sources du dépôt (GOV-024, REQ-GOV-032).
 *
 * ⚠️ L'EN-TÊTE NOMMAIT `GOV-035`, ET C'EST LA QUATRIÈME FOIS DE LA JOURNÉE QU'UNE ATTRIBUTION
 * EST FAUSSE. `docs/tasks.json` range ce fichier dans les `paths` de GOV-024 ; l'acceptance de
 * GOV-035 écrit elle-même qu'elle ne le porte pas. Les NOMBRES de ce dépôt se dérivent désormais ;
 * les ATTRIBUTIONS, non — rien ne confronte le nom de tâche écrit dans un en-tête ou dans
 * `docs/gates.json.tache` aux `paths` du backlog. C'est l'objet de GOV-037.
 *
 * USAGE : pnpm pr:corps -- --gabarit <fichier.tpl.md> --sortie <fichier.md> --tests <journal>
 *         (les trois sont OBLIGATOIRES : sans `--tests`, le rendu échoue. Les crochets qu'a portés
 *          cette ligne étaient le repli silencieux de la règle 2, ressuscité en prose.)
 *
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST DANS LE DÉPÔT.
 *
 * La lentille `exactitude` a rendu quatre verdicts sur la PR #31, et son observation de clôture
 * vaut plus que ses vingt constats : après que les compteurs du journal et de `docs/gates.json`
 * ont été rendus DÉRIVÉS, les affirmations fausses qui restaient étaient TOUTES dans ce que le
 * script ne rendait pas.
 *
 *     « La frontière de la dérivation est devenue la frontière de la vérité. »
 *
 * Le corps de PR est donc entré dans le périmètre de la dérivation. Mais la première version de ce
 * générateur vivait dans un répertoire de travail HORS DU DÉPÔT — et la même lentille a retourné
 * son observation contre le remède : un générateur d'artefact publié qui n'a ni chemin, ni tâche,
 * ni étape de CI, et qui disparaît avec la session, déplace la frontière de la dérivation sans
 * déplacer celle du DÉPÔT. Il est ici pour cette raison, et pour aucune autre.
 *
 * ── DEUX RÈGLES QUE CE FICHIER TIENT, ET QUI VIENNENT D'ERREURS PAYÉES ────────────────────────
 *
 * 1. UN MARQUEUR NON RÉSOLU FAIT ÉCHOUER LE RENDU. Un corps publié avec `{{TACHES}}` dedans est
 *    pire qu'un compteur faux : il a l'air d'un gabarit oublié, donc personne ne le lit.
 *
 * 2. AUCUNE VALEUR N'A DE REPLI SILENCIEUX. La première version faisait retomber les compteurs de
 *    la suite de tests sur `'?'` quand le journal manquait — or `'?'` n'est pas un marqueur, donc
 *    la règle 1 ne le couvrait pas. Résultat mesuré : le corps a publié « 385 tests » alors que la
 *    suite en comptait 387, parce que le générateur avait lu le journal du commit PRÉCÉDENT.
 *    🔑 Un repli qui a l'air d'une valeur échappe à la garde qui vérifie les valeurs. Ici, un
 *    journal absent, illisible ou plus vieux que `HEAD` fait ÉCHOUER le rendu.
 *
 * ── ET UNE TROISIÈME, SUR LA DÉRIVATION ELLE-MÊME ────────────────────────────────────────────
 *
 * 3. UNE DÉRIVATION SE FAIT SUR L'EXPRESSION QUI PORTE LE SENS, PAS SUR CE QUI LUI RESSEMBLE.
 *    `CHAMPS_TOTAL` a d'abord été tiré d'un `grep -c "cle:"` : il rendait 23 là où `CHAMPS.length`
 *    vaut 19, d'autres structures du module portant la même clé. Le corps a publié « 7 champs sur
 *    23 » — une affirmation fausse produite par la machine installée pour ne plus en produire.
 *    🔑 Une dérivation faite sur la mauvaise expression n'est pas plus vraie qu'un nombre tapé :
 *    elle est seulement plus difficile à mettre en doute, puisqu'elle a l'air calculée.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { CHAMPS } from '../../src/config/entite';
import { lireRevues, tachesDeLaPr, tachesSchemaDeLaPr, toucheSchema, type RevueBrute } from './revues';

/**
 * ⚠️ LE CHAMP `schema` MANQUAIT À CE TYPE, ET C'EST CE MANQUE QUI A CHOISI LE SIGNAL FAIBLE.
 *
 * Le signal fort était déjà sous la main — `surLaPr`, les tâches que cette PR porte — mais le type
 * ne déclarait pas `schema`, donc le champ n'existait pas pour ce module, donc le discriminant
 * s'est rabattu sur le label, qu'on pose et qu'on oublie à la main. Le type dit ce qu'un module
 * peut voir : ce qu'il tait, le code ne peut pas le lire, et il ira chercher plus faible ailleurs.
 */
type Tache = {
  id: string;
  phase: number;
  statut: string;
  pr?: number | null;
  reqs: string[];
  schema?: boolean;
};

const LIVREE = new Set(['fusionnee', 'deployee', 'verifiee']);
const MOTS: Record<number, string> = {
  1: 'une', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six',
  7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix', 11: 'onze', 12: 'douze',
};

function arg(nom: string): string | null {
  const i = process.argv.indexOf(`--${nom}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : null;
}

/**
 * Les compteurs de la suite, LUS dans son journal — et REFUSÉS si ce journal est plus ancien que
 * le dernier commit. Un corps qui annonce les tests d'un commit précédent est une affirmation
 * fausse sur l'état du code, pas une approximation.
 */
function suite(chemin: string | null): { fichiers: string; tests: string } {
  if (!chemin) throw new Error('`--tests <journal>` est obligatoire : sans lui le corps annoncerait des tests qu’il n’a pas lus.');
  if (!existsSync(chemin)) throw new Error(`journal de tests introuvable : ${chemin}`);
  const dateJournal = statSync(chemin).mtimeMs;
  const dateHead = Number(execFileSync('git', ['log', '-1', '--format=%ct'], { encoding: 'utf8' }).trim()) * 1000;
  if (dateJournal < dateHead) {
    throw new Error(
      `le journal de tests (${new Date(dateJournal).toISOString()}) est ANTÉRIEUR au dernier commit ` +
        `(${new Date(dateHead).toISOString()}) : il décrit un autre état du code. Relance la suite.`
    );
  }
  const t = readFileSync(chemin, 'utf8').replace(/\[[0-9;]*m/g, '');
  const f = /Test Files\s+(\d+) passed \((\d+)\)/.exec(t);
  const n = /Tests\s+(\d+) passed \((\d+)\)/.exec(t);
  if (!f || !n) throw new Error(`journal de tests illisible : ni « Test Files … passed » ni « Tests … passed » dans ${chemin}`);
  return { fichiers: `${f[1]}/${f[2]}`, tests: `${n[1]}/${n[2]}` };
}

/**
 * LA CASE « RELECTEUR ≠ AUTEUR » SE DÉRIVE DES REVUES, ET C'EST LA SORTIE D'UN PIÈGE.
 *
 * 🔴 Le piège, trouvé par le `release-manager` en refusant de fusionner la PR #31. Le gabarit vit
 * DANS le dépôt. Cocher à la main la case qui dit « les revues sont faites » exigeait donc un
 * commit — qui déplaçait la tête, et invalidait les revues qu'on venait de déclarer faites. Le
 * pas 5 du protocole (« le diff approuvé est le diff fusionné ») devenait **insatisfiable en
 * boucle** : chaque geste pour le satisfaire le brisait.
 *
 * La case n'est donc plus un caractère qu'on tape : c'est une ASSERTION DÉRIVÉE du pas 5.
 *
 * 🔴 ET LA PREMIÈRE DÉRIVATION ÉTAIT FAUSSE DANS LE SENS PERMISSIF — quatre fois. Deux relecteurs
 * et une passe de mutation l'ont mesuré le même jour sur `41bc814` : elle n'authentifiait
 * personne (dépôt PUBLIC, quatre avis forgés par un compte tiers cochaient la case, et un avis
 * forgé EFFAÇAIT le veto d'un vrai refus de `securite`), elle acceptait `A99` comme poste, elle
 * tirait le discriminant `schema` du seul label — plus faible que la gate qu'elle supplée, qui le
 * lit sur les FICHIERS — et elle classait le dernier verdict par lentille seule, si bien qu'un
 * accord d'un AUTRE poste effaçait un refus. Deux mutants type-propres y survivaient, `tsc` à 0
 * et la suite verte : la comparaison de `commit_id` neutralisée, et la liste des lentilles
 * tronquée à une seule — le corps publiait alors « les 1 lentilles ont accepté » pendant que
 * `securite` refusait.
 *
 * 🔑 CE FICHIER DIAGNOSTIQUAIT CORRECTEMENT QUE `gov:pr` ÉTAIT AVEUGLE AU PAS 5, PUIS HÉRITAIT DU
 * MÊME DÉFAUT. La lecture des revues n'est donc plus écrite ici : elle est dans
 * `scripts/lot/revues.ts`, importée par ce composeur ET par `scripts/gates/gov-pr.ts`. Deux
 * copies divergent toujours, et celle qui est lue n'est jamais celle qui a été corrigée (RM-01).
 *
 * ⚠️ CE QUE CETTE CASE NE PEUT PAS DIRE, ET QU'ELLE DIT PLUTÔT QUE DE LE TAIRE. « Relecteur ≠
 * auteur » est vérifiée au niveau du POSTE — c'est le niveau où la charte la définit (§6 : « le
 * code du champ `Auteur:` n'apparaît jamais dans `Relecteur:` »). Au niveau des COMPTES GitHub,
 * ce dépôt n'en a qu'un (W13) : toutes les revues viennent du compte de l'auteur, et la propriété
 * n'y est pas mesurable. Le détail publié le NOMME. On ne coche jamais ce qu'on ne mesure pas.
 */
function caseRevues(
  pr: number,
  gabarit: string,
  /**
   * Le fait « cette PR touche au schéma PAR SES TÂCHES », DÉRIVÉ une seule fois par
   * `tachesSchemaDeLaPr()` et transmis. Ce module composait ici son propre `some(t => t.schema)`,
   * pendant que `gov-pr.ts` composait un `find()` sur la seule tâche du titre : deux entrées pour
   * un lecteur unique, et elles divergeaient (mesuré le 2026-09-05 sur la PR 31).
   */
  tachesSchema: boolean
): { marque: string; detail: string } {
  let tete: string;
  let labels: string[];
  let fichiers: string[];
  let revues: RevueBrute[];
  let auteurCompte: string | null;
  try {
    const meta = JSON.parse(
      execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${pr}`], { encoding: 'utf8', maxBuffer: 32e6 })
    ) as {
      head: { sha: string };
      user?: { login?: string };
      labels?: { name: string }[];
    };
    tete = meta.head.sha;
    auteurCompte = meta.user?.login ?? null;
    labels = (meta.labels ?? []).map((l) => l.name);
    fichiers = (
      JSON.parse(
        execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${pr}/files`, '--paginate'], {
          encoding: 'utf8',
          maxBuffer: 32e6,
        })
      ) as { filename: string }[]
    ).map((f) => f.filename);
    revues = JSON.parse(
      execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${pr}/reviews`, '--paginate'], {
        encoding: 'utf8',
        maxBuffer: 32e6,
      })
    ) as RevueBrute[];
  } catch {
    return { marque: '[ ]', detail: 'revues illisibles (GitHub injoignable) — la case reste vide' };
  }

  const lecture = lireRevues({
    revues,
    // LE PLUS STRICT DES TROIS SIGNAUX GAGNE : les fichiers de la PR, le champ `schema` des tâches
    // qu'elle porte, le label. Le label seul était la lecture d'avant — la plus faible des trois,
    // et plus faible que celle de la gate que cette case supplée.
    schema: toucheSchema({ fichiers, labels, tachesSchema }),
    tete,
    auteurPoste: /^Auteur:\s*(A\d{2})\s*$/m.exec(gabarit)?.[1] ?? null,
    auteurCompte,
  });
  return { marque: lecture.coche ? '[x]' : '[ ]', detail: lecture.detail };
}

export function valeurs(pr: number, journalTests: string | null, gabarit: string): Record<string, string> {
  const T = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] }).taches;
  const G = (JSON.parse(readFileSync('docs/gates.json', 'utf8')) as { gates: { preuveRouge: string | null }[] }).gates;
  const R = (JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as { exigences: unknown[] }).exigences;
  // L'ENSEMBLE des tâches de la PR, par la dérivation UNIQUE. Le composeur passe `null` pour le
  // titre : il n'en a pas en main, et il décrit ce que la PR DÉCLARE porter. La garde, elle, le
  // connaît et obtient donc un sur-ensemble — jamais l'inverse (monotonie, voir `tachesDeLaPr`).
  const surLaPr = tachesDeLaPr(T, pr, null);
  const s = suite(journalTests);
  const c = caseRevues(pr, gabarit, tachesSchemaDeLaPr(T, pr, null));

  return {
    TACHES: String(T.length),
    GATES: String(G.length),
    GATES_ARMEES: String(G.filter((g) => g.preuveRouge).length),
    EXIGENCES: String(R.length),
    NB_SUR_LA_PR: String(surLaPr.length),
    MOT_SUR_LA_PR: MOTS[surLaPr.length] ?? String(surLaPr.length),
    LISTE_SUR_LA_PR: surLaPr.map((t) => '`' + t.id + '`').join(', '),
    RESTE_PHASE_MOINS_1: T.filter((t) => t.phase === -1 && !LIVREE.has(t.statut) && t.pr !== pr)
      .map((t) => '`' + t.id + '`')
      .join(', '),
    // Dérivé de `CHAMPS`, jamais d'un motif qui lui ressemble — voir la règle 3 en tête.
    CHAMPS_SANS_ANCRE: String(CHAMPS.filter((c) => c.ancre === null).length),
    CHAMPS_TOTAL: String(CHAMPS.length),
    SUITE_FICHIERS: s.fichiers,
    SUITE_TESTS: s.tests,
    COUVRE: couvre(surLaPr).join(', '),
    DOD_REVUES: c.marque,
    DOD_REVUES_DETAIL: c.detail,
  };
}

/**
 * LES EXIGENCES COUVERTES, DÉRIVÉES DES TÂCHES DE LA PR — ET CE QUE CE CHAMP N'ATTESTE PAS.
 *
 * 🔴 LE DÉFAUT, MESURÉ LE 2026-09-05 SUR LA PR 31 : `Couvre:` était le SEUL champ du corps qui ne
 * se dérivait de rien. Tapé à la main dans `docs/pr/31.tpl.md:5`, il annonçait dix-neuf exigences
 * là où les neuf tâches de la PR en portent dix-sept — `REQ-GOV-026` et `REQ-GOV-031` en trop.
 * Et `scripts/gates/gov-entite.ts` désigne nommément `GOV-036` comme le travail NON FAIT pour
 * `REQ-GOV-031` : le corps annonçait donc couvrir une exigence dont le dépôt écrit ailleurs
 * qu'elle reste à faire. C'est la quatrième affirmation fausse du même jour, et toutes étaient
 * dans ce que le script ne rendait pas — « la frontière de la dérivation est devenue la frontière
 * de la vérité », et ce champ était de l'autre côté.
 *
 * ⚠️ CE QUE LE MARQUEUR ATTESTE, ET CE QU'IL N'ATTESTE PAS. La case de DoD dit deux choses :
 *
 *     « Les REQ couvertes sont listées dans `Couvre:`, ET le code ne fait rien de plus qu'elles. »
 *
 * La PREMIÈRE moitié devient dérivée : la liste est exactement l'union des `reqs` des tâches que
 * la PR porte, donc elle ne peut plus ni oublier ni inventer une exigence.
 *
 * La SECONDE ne l'est pas, et ne peut pas l'être ici : « le code ne fait rien de plus » est un
 * jugement sur le DIFF, que seule une relecture rend — c'est la lentille `simplicite`, et c'est
 * pour cela qu'elle existe. Ce marqueur ne la remplace pas, ne la supplée pas, et ne doit pas
 * laisser croire qu'il la couvre : une valeur VRAIE qui a l'air d'en dire plus qu'elle ne peut est
 * exactement le piège dont sort ce fichier (règle 3 en tête). Ce que la ligne `Couvre:` affirme
 * désormais, mot pour mot : « voici les exigences que les tâches de cette PR DÉCLARENT porter » —
 * et non « voici tout ce que ce diff fait ».
 *
 * La liste n'a pas d'autre source que `docs/tasks.json`, la même que `{{LISTE_SUR_LA_PR}}` : deux
 * champs du même corps tirés de deux ensembles différents divergeraient (RM-01).
 */
export function couvre(taches: readonly { reqs?: string[] }[]): string[] {
  return [...new Set(taches.flatMap((t) => t.reqs ?? []))].sort();
}

/** La ligne `Couvre:` découpée comme un humain la lit — virgules, accents graves, espaces. */
function reqsListees(ligne: string): string[] {
  return ligne
    .split(',')
    .map((r) => r.replace(/`/g, '').trim())
    .filter(Boolean);
}

/**
 * LA LIGNE `Couvre:` RENDUE DOIT ÊTRE CELLE QU'ON A DÉRIVÉE. Le contrôle ne se contente pas du
 * marqueur, parce qu'un marqueur ne protège que ce qu'il remplace : un gabarit qui RE-TAPE la
 * liste — la forme d'hier, et celle qu'un copier-coller ramène — n'aurait plus aucun marqueur à
 * résoudre, donc plus aucune garde. L'échec a la même forme que celui d'un marqueur non résolu,
 * et pour la même raison : un corps publié qui affirme faux est pire qu'un corps qui ne se rend
 * pas, parce qu'il a l'air fini.
 */
export function verifierCouvre(corps: string, attendues: readonly string[]): void {
  const m = /^Couvre:[ \t]*(.*)$/m.exec(corps);
  if (!m) {
    throw new Error(
      'le corps rendu ne porte aucune ligne `Couvre:` : la case de DoD qui la cite ne peut pas être vérifiée.'
    );
  }
  const listees = reqsListees(m[1] ?? '');
  const enTrop = listees.filter((r) => !attendues.includes(r));
  const manquantes = attendues.filter((r) => !listees.includes(r));
  if (enTrop.length === 0 && manquantes.length === 0) return;
  throw new Error(
    '`Couvre:` diverge des exigences que les tâches de la PR déclarent porter — ' +
      `${listees.length} listée(s), ${attendues.length} dérivée(s) de docs/tasks.json.` +
      (enTrop.length > 0 ? ` EN TROP (annoncée(s) sans tâche qui la porte) : ${enTrop.join(', ')}.` : '') +
      (manquantes.length > 0 ? ` MANQUANTE(S) : ${manquantes.join(', ')}.` : '') +
      ' Remplace la ligne tapée par le marqueur {{COUVRE}} : ce champ ne se tape plus.'
  );
}

export function rendre(gabarit: string, v: Record<string, string>): string {
  let out = gabarit;
  for (const [k, val] of Object.entries(v)) out = out.split(`{{${k}}}`).join(val);
  const restants = [...out.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]);
  if (restants.length > 0) {
    throw new Error(`marqueur(s) non résolu(s) : ${[...new Set(restants)].join(', ')}`);
  }
  if (v['COUVRE'] !== undefined) verifierCouvre(out, reqsListees(v['COUVRE']));
  return out;
}

if (process.argv[1]?.endsWith('corps-de-pr.ts')) {
  const gabarit = arg('gabarit');
  const sortie = arg('sortie');
  const pr = Number(arg('pr') ?? '31');
  if (!gabarit || !sortie) {
    console.error('usage: pnpm pr:corps -- --gabarit <x.tpl.md> --sortie <x.md> --tests <journal> [--pr <n>]');
    process.exit(1);
  }
  try {
    const texte = readFileSync(gabarit, 'utf8');
    const v = valeurs(pr, arg('tests'), texte);
    writeFileSync(sortie, rendre(texte, v));
    console.log(`✅ ${sortie} rendu depuis les sources du dépôt :`);
    for (const [k, val] of Object.entries(v)) console.log(`   ${k.padEnd(20)} ${val}`);
  } catch (e) {
    console.error(`❌ pr:corps — ${(e as Error).message}`);
    process.exit(1);
  }
}
