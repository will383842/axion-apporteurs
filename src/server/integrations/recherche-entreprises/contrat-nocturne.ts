/**
 * Le contrat nocturne contre l'API RÉELLE de recherche d'entreprises — INT-T09 (REQ-QA-028).
 *
 * USAGE : npx tsx src/server/integrations/recherche-entreprises/contrat-nocturne.ts
 *         (job `contrat-api-gouv` de `.github/workflows/nightly.yml` — jamais dans une Gate A : un
 *         tiers qui tombe ne doit pas bloquer une PR)
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
import { CAS_ENREGISTRES } from './cas-enregistres';
import { lireFixtures } from './fixtures';
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

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function contrat(): Promise<number> {
  const derives: string[] = [];
  const vivantes: unknown[] = [];
  for (const { cas, q } of CAS_ENREGISTRES) {
    try {
      const reponse = await fetch(urlDeRecherche(q, PARAMETRES.urlDeBase.valeur), {
        headers: { accept: 'application/json', 'user-agent': PARAMETRES.agentUtilisateur.valeur },
        signal: AbortSignal.timeout(10_000),
      });
      if (reponse.status !== 200) {
        derives.push(`[appel] ${cas} : statut ${reponse.status}`);
      } else {
        const corps: unknown = await reponse.json();
        vivantes.push(corps);
        const lu = schemaReponseDuTiers.safeParse(corps);
        if (!lu.success) {
          const i = lu.error.issues[0];
          derives.push(`[schema] ${cas} : ${i?.path.join('.') ?? '?'} — ${i?.code ?? '?'}`);
        }
      }
    } catch (e) {
      derives.push(`[appel] ${cas} : ${e instanceof Error ? e.name : 'échec'}`);
    }
    await pause(ESPACEMENT_MS);
  }
  const enregistrees = formesDe(lireFixtures().map((f) => f.reponse));
  derives.push(...comparerFormes(enregistrees, formesDe(vivantes)));
  process.stdout.write(
    derives.length === 0
      ? `✅ contrat recherche-entreprises — ${CAS_ENREGISTRES.length} cas rejoués contre l'API réelle, aucune dérive\n`
      : `❌ contrat recherche-entreprises — ${derives.length} dérive(s) :\n${derives.map((d) => `  ${d}`).join('\n')}\n`
  );
  return derives.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith('contrat-nocturne.ts') === true) {
  contrat().then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(2);
    }
  );
}
