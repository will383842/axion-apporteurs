/**
 * condition-de-job.ts — ÉVALUER un `if:` de workflow au lieu d'en chercher le texte. Aucun effet à
 * l'import, aucun accès au disque : le pendant de `lire-yaml.ts`, qui lit le YAML comme la forge le
 * lit, pour la question que la lecture seule ne répond pas — « ce job tourne-t-il sous CET
 * événement ? ».
 *
 * POURQUOI ELLE EXISTE. Deux spécifications jugent le même `if:` du job `gate-a`, pour deux raisons
 * qui ne se confondent pas :
 *   — `revendication-par-branche.spec.ts` exige qu'il ÉCARTE une PR déjà fusionnée, et RIEN d'autre ;
 *   — `gardes-transposees.spec.ts` exige qu'il ne DÉSARME pas `Lint` et `Format` (REQ-GOV-018) — une
 *     condition de job les éteint aussi sûrement qu'un `continue-on-error`.
 * Les deux ont besoin du même verdict. Le recopier des deux côtés en ferait deux sources, donc une
 * divergence à venir (RM-01) ; et une spécification ne s'importe pas — ses `describe` s'enregistre-
 * raient deux fois. La lecture partagée vit donc ici, comme `lire-yaml.ts` avant elle.
 *
 * CE QU'ELLE SAIT LIRE, ET CE QU'ELLE REFUSE. Le sous-ensemble d'expressions que
 * `.github/workflows/` emploie : `${{ … }}`, chemins de contexte, `true`/`false`/`null`, nombres,
 * chaînes entre apostrophes, `==`, `!=`, `!`, `&&`, `||`, parenthèses. TOUT LE RESTE LÈVE — une
 * fonction (`contains`, `success`), un contexte hors périmètre (`secrets`, `env`), un jeton inconnu.
 * C'est le sens de panne voulu : un témoin qui ne comprend pas ce qu'il lit doit rougir, jamais
 * rendre vert par ignorance (RM-02).
 *
 * LES CONVERSIONS SONT CELLES DE GITHUB, PAS CELLES DE JAVASCRIPT, et c'est ce qui rend la condition
 * de `gate-a` lisible : quand les deux opérandes d'une comparaison n'ont pas le même type, les deux
 * sont convertis en NOMBRE (`null` → 0, `false` → 0, `true` → 1). Sur un événement `push`,
 * `github.event.pull_request` est absent, donc `github.event.pull_request.merged` vaut `null`, donc
 * `null != true` est VRAI et le job tourne. Un témoin qui appliquerait les règles de JavaScript
 * (`null !== true` aussi vrai, mais `null == false` faux) conclurait juste par hasard, et faux à la
 * première condition un peu différente.
 */
import { estObjet } from './lire-yaml';

/** Une valeur d'expression GitHub. Les objets n'en sont pas : un chemin qui en désigne un rend `null`. */
export type ValeurGh = string | number | boolean | null;

/** Un contexte d'évaluation : `{ github: { … } }`, réduit à ce que les workflows du dépôt lisent. */
export type ContexteGh = Record<string, unknown>;

/** Un contexte nommé — le nom sert à DIRE quel événement une condition éteint. */
export type ContexteNomme = readonly [string, ContexteGh];

const contexte = (github: Record<string, unknown>): ContexteGh => ({ github });

export const PUSH_MAIN: ContexteGh = contexte({
  event_name: 'push',
  ref: 'refs/heads/main',
  event: {},
});

/** Une demande de fusion OUVERTE : `merged` vaut `false` tant qu'elle ne l'est pas. */
export const PR_OUVERTE = (action: string): ContexteGh =>
  contexte({
    event_name: 'pull_request',
    ref: 'refs/pull/90/merge',
    event: { action, pull_request: { number: 90, merged: false, draft: false } },
  });

/** Une demande de fusion DÉJÀ FUSIONNÉE : sa tête n'est plus une branche, il n'y a rien à mesurer. */
export const PR_FUSIONNEE = (action: string): ContexteGh =>
  contexte({
    event_name: 'pull_request',
    ref: 'refs/pull/89/merge',
    event: { action, pull_request: { number: 89, merged: true, draft: false } },
  });

/**
 * LES ÉVÉNEMENTS QUE LA PORTE A DOIT MESURER. L'édition d'une demande de fusion OUVERTE en fait
 * partie, et ce n'est pas un détail : c'est ainsi qu'on corrige un titre refusé par `gov:pr`, et
 * c'est la raison d'être du type `edited` dans le déclencheur (PR 26). Une condition qui en éteint
 * un seul est un désarmement, quelle que soit son intention.
 */
export const CONTEXTES_MESURES: readonly ContexteNomme[] = [
  ['push sur main', PUSH_MAIN],
  ['PR ouverte, opened', PR_OUVERTE('opened')],
  ['PR ouverte, edited', PR_OUVERTE('edited')],
];

/** Les événements où il n'y a plus rien à lire : la tête a été supprimée par la fusion. */
export const CONTEXTES_FUSIONNES: readonly ContexteNomme[] = [
  ['PR DÉJÀ FUSIONNÉE, edited', PR_FUSIONNEE('edited')],
  ['PR DÉJÀ FUSIONNÉE, labeled', PR_FUSIONNEE('labeled')],
];

const FORMES_DE_JETON = [
  /^\s+/,
  /^(?:&&|\|\||==|!=|!|\(|\))/,
  /^'(?:[^']|'')*'/,
  /^-?\d+(?:\.\d+)?/,
  /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*/,
];

function jetons(source: string): string[] {
  const lus: string[] = [];
  let reste = source;
  while (reste.length > 0) {
    const trouve = FORMES_DE_JETON.map((f) => f.exec(reste)).find((m) => m !== null);
    if (!trouve) throw new Error(`expression GitHub : jeton illisible à « ${reste.slice(0, 24)} »`);
    if (trouve[0].trim() !== '') lus.push(trouve[0]);
    reste = reste.slice(trouve[0].length);
  }
  return lus;
}

/** `null` → 0, `false` → 0, `true` → 1, `''` → 0 — la conversion de GitHub, pas celle de JS. */
function versNombre(v: ValeurGh): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  return v.trim() === '' ? 0 : Number(v);
}

export function versBooleen(v: ValeurGh): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return v !== '';
}

/** Même type → comparaison directe (chaînes insensibles à la casse) ; sinon, les DEUX en nombre. */
function egaux(a: ValeurGh, b: ValeurGh): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if (a === null && b === null) return true;
  if (typeof a === typeof b && a !== null && b !== null) return a === b;
  return versNombre(a) === versNombre(b);
}

/**
 * LE VERDICT D'UNE CONDITION SOUS UN ÉVÉNEMENT. LÈVE sur ce qu'elle ne sait pas lire, y compris une
 * expression non enveloppée dans `${{ … }}` : GitHub tolère la forme nue dans un `if:`, mais
 * l'accepter ici demanderait de deviner où finit l'expression, et deviner est ce qu'on refuse. Le
 * dépôt écrit la forme enveloppée ; le jour où il en écrit une autre, ce module rougit et se lit.
 */
export function evaluerExpression(source: string, ctx: ContexteGh): boolean {
  const enveloppe = /^\s*\$\{\{([\s\S]*)\}\}\s*$/.exec(source);
  if (!enveloppe) {
    throw new Error(`expression GitHub : « ${source} » n'est pas enveloppée dans \${{ … }}`);
  }
  const lus = jetons(enveloppe[1]!);
  let i = 0;
  const suivant = () => lus[i];

  function primaire(): ValeurGh {
    const j = suivant();
    if (j === undefined) throw new Error('expression GitHub : fin prématurée');
    if (j === '(') {
      i += 1;
      const v = ou();
      if (lus[i] !== ')') throw new Error('expression GitHub : parenthèse non refermée');
      i += 1;
      return v;
    }
    if (j === '!') {
      i += 1;
      return !versBooleen(primaire());
    }
    i += 1;
    if (j === 'true') return true;
    if (j === 'false') return false;
    if (j === 'null') return null;
    if (j.startsWith("'")) return j.slice(1, -1).replaceAll("''", "'");
    if (/^-?\d/.test(j)) return Number(j);
    // Un appel de fonction (`contains(…)`, `success()`) se trahit par la parenthèse qui suit : on
    // REFUSE plutôt que de lire le nom comme un chemin de contexte, qui rendrait `null`, donc faux.
    if (lus[i] === '(') throw new Error(`expression GitHub : fonction « ${j} » hors périmètre`);
    const morceaux = j.split('.');
    if (!Object.hasOwn(ctx, morceaux[0]!)) {
      throw new Error(
        `expression GitHub : contexte « ${morceaux[0]} » hors du périmètre du témoin`
      );
    }
    let courant: unknown = ctx;
    for (const m of morceaux) courant = estObjet(courant) ? (courant[m] ?? null) : null;
    if (courant === null || typeof courant === 'object') return null;
    return courant as ValeurGh;
  }

  function comparaison(): ValeurGh {
    const g = primaire();
    const op = suivant();
    if (op !== '==' && op !== '!=') return g;
    i += 1;
    const d = primaire();
    return op === '==' ? egaux(g, d) : !egaux(g, d);
  }

  function et(): ValeurGh {
    let v = comparaison();
    while (suivant() === '&&') {
      i += 1;
      const d = comparaison();
      v = versBooleen(v) ? d : v;
    }
    return v;
  }

  function ou(): ValeurGh {
    let v = et();
    while (suivant() === '||') {
      i += 1;
      const d = et();
      v = versBooleen(v) ? v : d;
    }
    return v;
  }

  const valeur = ou();
  if (i !== lus.length) throw new Error(`expression GitHub : reste « ${lus.slice(i).join(' ')} »`);
  return versBooleen(valeur);
}

/**
 * CE JOB TOURNE-T-IL SOUS CET ÉVÉNEMENT ? `needs:` est SUIVI, et c'est le point : GitHub saute un
 * job dont un prérequis est sauté. Sans cette traversée, un témoin qui juge job par job laisserait
 * passer le déménagement d'une étape dans un job séparé — le défaut d'un témoin qui lit un ordre de
 * texte plutôt qu'un graphe.
 */
export function jobTourne(
  nom: string,
  jobs: Record<string, unknown>,
  ctx: ContexteGh,
  vus: readonly string[] = []
): boolean {
  if (vus.includes(nom)) throw new Error(`cycle de \`needs:\` : ${[...vus, nom].join(' → ')}`);
  const job = jobs[nom];
  if (!estObjet(job)) throw new Error(`job « ${nom} » illisible`);
  const condition = job['if'];
  if (condition !== undefined && typeof condition !== 'string') {
    throw new Error(`job « ${nom} » : \`if:\` n'est pas une chaîne`);
  }
  if (typeof condition === 'string' && !evaluerExpression(condition, ctx)) return false;
  const brut = job['needs'];
  const requis = typeof brut === 'string' ? [brut] : Array.isArray(brut) ? brut : [];
  return requis.every((n) => jobTourne(String(n), jobs, ctx, [...vus, nom]));
}

/**
 * LES ÉVÉNEMENTS QU'UNE CONDITION ÉTEINT parmi ceux qui devaient être mesurés — vide quand elle
 * n'en éteint aucun. Une expression illisible rend UNE entrée nommée plutôt que de lever : le
 * lecteur veut savoir laquelle, pas voir la pile.
 */
export function contextesEteints(
  condition: string,
  contextes: readonly ContexteNomme[] = CONTEXTES_MESURES
): string[] {
  try {
    return contextes.filter(([, ctx]) => !evaluerExpression(condition, ctx)).map(([quoi]) => quoi);
  } catch (e) {
    return [`illisible : ${(e as Error).message}`];
  }
}
