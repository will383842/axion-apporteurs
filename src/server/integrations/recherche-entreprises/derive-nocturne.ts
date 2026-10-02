/**
 * Le contrat nocturne contre l'API RÉELLE de recherche d'entreprises — INT-T09 (REQ-QA-028).
 *
 * ⚠️ POURQUOI CE FICHIER NE S'APPELLE PAS `contrat-nocturne.ts`, ET NE DOIT PAS L'ÊTRE DE NOUVEAU.
 * `src/config/entite.ts` déclare un POINT DE SORTIE `contrat-docuseal` — « émission d'un contrat
 * d'apporteur pour signature » — que `pnpm gov:entite` reconnaît au CHEMIN, sur le motif
 * `(?:docuseal|contrat)`. Sous son ancien nom, ce fichier tombait dans ce motif, et la garde
 * exigeait de lui un appel à `exigerEntiteRenseignee('contrat-docuseal')`. Il ne le doit pas : le
 * « contrat » dont il s'agit ici est un CONTRAT D'API — une forme de réponse — et non un contrat
 * que quelqu'un signe. Lui faire appeler ce refus aurait lié la surveillance d'un tiers à l'état du
 * registre BANCAIRE : un IBAN encore à la sentinelle aurait éteint la détection de dérive.
 * Le nom dit donc ce que le fichier MESURE — la dérive — et laisse le mot « contrat » au point de
 * sortie qui le porte vraiment. La collision est un HOMONYME, et elle n'est pas réglée pour autant :
 * tout futur fichier `contrat…ts` sous `src/` la rencontrera. C'est à la tâche de la garde (CPL-T01) de décider
 * si le motif doit discriminer mieux ; le renommage ne fait que retirer CE fichier de sa portée.
 *
 * USAGE : pnpm integration:contrat-gouv
 *         (job `contrat-api-gouv` de `.github/workflows/nightly.yml` — jamais dans une Gate A : un
 *         tiers qui tombe ne doit pas bloquer une PR). Le script du `package.json` est la SEULE
 *         forme admise dans un YAML suivi (REQ-GOV-031) : `npx` résoudrait un paquet hors verrou.
 *
 * Il rejoue chaque cas de `cas-enregistres.ts` — les MÊMES saisies que les fixtures, par la MÊME
 * fabrique d'URL que la production — et signale toute dérive de forme, en deux familles :
 *   `schema`  une réponse que le schéma Zod du client refuse : un champ CONSOMMÉ a disparu ou changé
 *             de type — en production, le parcours basculerait en saisie manuelle à chaque appel ;
 *   `forme`   l'ensemble des clés d'un objet du tiers (réponse, résultat, siège, dirigeant de chaque
 *             type) diffère de celui des fixtures enregistrées : une clé apparue ou disparue, même
 *             non consommée — c'est là qu'un nouveau champ de personne se verrait le premier.
 *   `appel`   un cas que le tiers n'a pas servi (statut ≠ 200, délai, réseau).
 * Sort en 1 sur toute dérive, en la nommant : le job est BLOQUANT, et son échec est l'alerte.
 * Après une dérive lue et comprise, on RÉENREGISTRE les fixtures (`enregistrer-fixtures.ts`) :
 * on ne retouche jamais une fixture à la main (RM-03).
 *
 * Il s'espace lui-même (300 ms, moins de 5 appels par seconde) : ce n'est pas l'application, il
 * ne passe pas par le registre des compteurs.
 */
import { CAS_ENREGISTRES, type CasEnregistre } from './cas-enregistres';
import { lireFixtures, type FixtureEnregistree } from './fixtures';
import { PARAMETRES, urlDeRecherche } from './parametres';
import { schemaReponseDuTiers } from './schemas';

const ESPACEMENT_MS = 300;

type Formes = Map<string, Set<string>>;

/** Les clés de chaque genre d'objet d'une réponse du tiers, réunies sur tout un jeu de réponses. */
export function formesDe(reponses: readonly unknown[]): Formes {
  const formes: Formes = new Map();
  const noter = (genre: string, objet: unknown) => {
    if (typeof objet !== 'object' || objet === null || Array.isArray(objet)) return;
    const cles = formes.get(genre) ?? new Set<string>();
    for (const k of Object.keys(objet)) cles.add(k);
    formes.set(genre, cles);
  };
  for (const reponse of reponses) {
    noter('reponse', reponse);
    for (const r of (reponse as { results?: unknown[] }).results ?? []) {
      noter('resultat', r);
      noter('siege', (r as { siege?: unknown }).siege);
      for (const d of (r as { dirigeants?: { type_dirigeant?: unknown }[] }).dirigeants ?? []) {
        noter(`dirigeant ${String(d.type_dirigeant)}`, d);
      }
    }
  }
  return formes;
}

export function comparerFormes(enregistrees: Formes, vivantes: Formes): string[] {
  const derives: string[] = [];
  for (const genre of new Set([...enregistrees.keys(), ...vivantes.keys()])) {
    const avant = enregistrees.get(genre) ?? new Set<string>();
    const apres = vivantes.get(genre) ?? new Set<string>();
    const apparues = [...apres].filter((k) => !avant.has(k));
    const disparues = [...avant].filter((k) => !apres.has(k));
    if (apparues.length > 0)
      derives.push(`[forme] ${genre} : clé(s) apparue(s) ${apparues.join(', ')}`);
    if (disparues.length > 0)
      derives.push(`[forme] ${genre} : clé(s) disparue(s) ${disparues.join(', ')}`);
  }
  return derives;
}

export const pause = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Un appel au tiers : la production passe `fetch`, le témoin une réponse fabriquée. */
export type Appeler = (url: URL) => Promise<Response>;

export const appelerLeTiers: Appeler = (url) =>
  fetch(url, {
    headers: { accept: 'application/json', 'user-agent': PARAMETRES.agentUtilisateur.valeur },
    signal: AbortSignal.timeout(10_000),
  });

/**
 * QA-T56 (REQ-QA-027) — la patience devant un 429. Le tiers limite son débit : un 429 dit « pas
 * maintenant », pas « mon contrat a changé ». La sonde attend la durée de `Retry-After` (bornée,
 * pour qu'un tiers ne suspende pas le job), rejoue, et après `TENTATIVES_SUR_429` refus le cas est
 * NON MESURÉ — nommé, jamais compté comme dérive, jamais tu.
 */
export const TENTATIVES_SUR_429 = 3;
// En SECONDES, comme `Retry-After` : la conversion est faite une fois, à l'usage.
export const ATTENTE_PAR_DEFAUT_S = 5;
export const ATTENTE_MAXIMALE_S = 60;

/** `Retry-After` en millisecondes : des secondes, ou une date HTTP ; illisible → l'attente par défaut. */
export function attenteDemandee(valeur: string | null, maintenant: number): number {
  const brut = valeur?.trim() ?? '';
  const ms = /^\d+$/.test(brut) ? Number(brut) * 1_000 : Date.parse(brut) - maintenant;
  if (!Number.isFinite(ms) || ms < 0) return ATTENTE_PAR_DEFAUT_S * 1_000;
  return Math.min(ms, ATTENTE_MAXIMALE_S * 1_000);
}

/** Ce que la nuit a mesuré : les dérives (le job rougit) et les cas que le tiers a refusé de servir. */
export interface Mesure {
  readonly derives: readonly string[];
  readonly nonMesures: readonly string[];
}

/**
 * Rejoue chaque cas contre le tiers et confronte les formes aux fixtures. L'appel et l'attente
 * sont INJECTÉS : le témoin juge sans réseau ni horloge.
 */
export async function mesurer(
  lesCas: readonly CasEnregistre[],
  fixtures: readonly FixtureEnregistree[],
  appeler: Appeler,
  attendre: (ms: number) => Promise<void>,
  maintenant: () => number = Date.now
): Promise<Mesure> {
  const derives: string[] = [];
  const nonMesures: string[] = [];
  const vivantes: unknown[] = [];
  const servis = new Set<string>();
  for (const { cas, q } of lesCas) {
    try {
      let reponse = await appeler(urlDeRecherche(q, PARAMETRES.urlDeBase.valeur));
      for (let t = 1; reponse.status === 429 && t < TENTATIVES_SUR_429; t++) {
        await attendre(attenteDemandee(reponse.headers.get('retry-after'), maintenant()));
        reponse = await appeler(urlDeRecherche(q, PARAMETRES.urlDeBase.valeur));
      }
      if (reponse.status === 429) {
        nonMesures.push(cas);
      } else if (reponse.status !== 200) {
        derives.push(`[appel] ${cas} : statut ${reponse.status}`);
      } else {
        const corps: unknown = await reponse.json();
        vivantes.push(corps);
        servis.add(cas);
        const lu = schemaReponseDuTiers.safeParse(corps);
        if (!lu.success) {
          const i = lu.error.issues[0];
          derives.push(`[schema] ${cas} : ${i?.path.join('.') ?? '?'} — ${i?.code ?? '?'}`);
        }
      }
    } catch (e) {
      derives.push(`[appel] ${cas} : ${e instanceof Error ? e.name : 'échec'}`);
    }
    await attendre(ESPACEMENT_MS);
  }
  // Les formes ne se confrontent qu'aux fixtures des cas SERVIS : un cas que le tiers n'a pas
  // servi ne doit pas faire « disparaître » les clés qu'il était seul à porter.
  const enregistrees = formesDe(fixtures.filter((f) => servis.has(f.cas)).map((f) => f.reponse));
  derives.push(...comparerFormes(enregistrees, formesDe(vivantes)));
  return { derives, nonMesures };
}

/**
 * Le verdict imprimé, PUR : « non mesuré » n'est ni une dérive ni un vert silencieux — un
 * avertissement nommé, que l'onglet du job affiche, et la sortie en zéro ; un 429 persistant ne
 * rougit pas le nightly. Toute dérive rend 1.
 */
export function rendreLaMesure(m: Mesure, total: number): { code: 0 | 1; sortie: string } {
  const avertissements = m.nonMesures.map(
    (cas) =>
      `::warning::contrat recherche-entreprises — ${cas} non mesuré : 429 après ${TENTATIVES_SUR_429} tentatives\n`
  );
  const verdict =
    m.derives.length === 0
      ? `✅ contrat recherche-entreprises — ${total - m.nonMesures.length} cas rejoués contre l'API réelle, aucune dérive, ${m.nonMesures.length} non mesuré(s)\n`
      : `❌ contrat recherche-entreprises — ${m.derives.length} dérive(s) :\n${m.derives.map((d) => `  ${d}`).join('\n')}\n`;
  return { code: m.derives.length === 0 ? 0 : 1, sortie: avertissements.join('') + verdict };
}

async function contrat(): Promise<number> {
  const m = await mesurer(CAS_ENREGISTRES, lireFixtures(), appelerLeTiers, pause);
  const { code, sortie } = rendreLaMesure(m, CAS_ENREGISTRES.length);
  process.stdout.write(sortie);
  return code;
}

if (process.argv[1]?.endsWith('derive-nocturne.ts') === true) {
  contrat().then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(2);
    }
  );
}
