/**
 * porte-finale.ts — GOV-142 : l'unique étape du job `gate-a`, le seul que la protection exige.
 *
 * POURQUOI. Quand un job dont `gate-a` dépend échoue, GitHub SAUTE `gate-a` ; et une vérification
 * requise « skipped » compte comme réussie. `gate-a` tourne donc toujours (`always()` au job, avec la
 * garde de fusion) et c'est CETTE étape qui juge : chaque job de `needs` doit valoir EXACTEMENT
 * `success`. `failure`, `cancelled`, `skipped` ou toute autre valeur rougit, nommée.
 *
 * LA LISTE EST FERMÉE ET DÉRIVÉE : `RESULTATS` reçoit `${{ toJSON(needs) }}`, donc exactement les jobs
 * que `needs` nomme, sans seconde écriture. Que `needs` nomme TOUS les autres jobs, c'est le témoin
 * `gov:ci-etapes` (`porte_finale_incomplete`) qui le juge. Un objet vide ou illisible rougit.
 */

/** PURE. Les refus, à partir de `toJSON(needs)`. */
export function jugerLesResultats(texte: string | undefined): string[] {
  let lu: unknown;
  try {
    lu = JSON.parse(texte ?? '');
  } catch {
    return ['RESULTATS illisible : attendu toJSON(needs)'];
  }
  if (typeof lu !== 'object' || lu === null || Array.isArray(lu)) {
    return ['RESULTATS n’est pas un objet de jobs'];
  }
  const jobs = Object.entries(lu as Record<string, unknown>);
  if (jobs.length === 0) return ['RESULTATS ne nomme aucun job : la porte finale ne juge rien'];
  return jobs.flatMap(([nom, v]) => {
    const resultat =
      typeof v === 'object' && v !== null ? (v as { result?: unknown }).result : undefined;
    return resultat === 'success' ? [] : [`le job « ${nom} » vaut « ${String(resultat)} »`];
  });
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/ci/porte-finale.ts')) {
  const refus = jugerLesResultats(process.env.RESULTATS);
  if (refus.length > 0) {
    for (const r of refus) console.error(`::error::${r}`);
    process.exit(1);
  }
  console.log(
    `✅ porte finale — ${Object.keys(JSON.parse(process.env.RESULTATS!)).length} job(s), tous en success.`
  );
  process.exit(0);
}
