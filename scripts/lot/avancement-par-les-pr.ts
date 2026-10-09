/**
 * avancement-par-les-pr.ts — L'AVANCEMENT DÉRIVÉ DES PR FUSIONNÉES (GOV-160, décision de Williams du
 * 2026-10-09, #319, commentaire 6077512137, complétée par l'audit des boucles de la coordination).
 *
 * Plus AUCUNE PR n'écrit de statut dans `docs/tasks.json` : 257 commits sur 452 touchaient ce
 * fichier, et chacun le mettait en conflit avec tous les autres. `docs/tasks.json` ne garde que les
 * DÉFINITIONS des tâches ; ce qui est livré se LIT dans la forge : une tâche est livrée quand une PR
 * fusionnée la nomme, par son titre `<type>(<ID>): …` ou par sa ligne `Lot: ID, ID`.
 *
 * USAGE : pnpm avancement            (lecture seule : imprime le décompte, n'écrit rien)
 *         pnpm avancement --json     (la liste des identifiants livrés, pour un autre outil)
 *
 * Le statut écrit dans `docs/tasks.json` reste lu pour le passé (`fusionnee` et au-delà) : l'union
 * des deux sources fait foi, et une tâche `annulee` n'est jamais à faire.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** L'identifiant de tâche que nomme un titre de PR conventionnel. */
const MOTIF_TITRE = /^[a-z]+\(([A-Z][A-Z0-9]*-[A-Za-z0-9-]+)\):\s+\S/;
/** La ligne `Lot:` d'un corps de PR — identifiants séparés par des virgules. */
const MOTIF_LOT = /^Lot:[^\S\r\n]*(.*)$/m;
const MOTIF_ID = /^[A-Z][A-Z0-9]*-[A-Za-z0-9-]+$/;

export type PrFusionnee = { number: number; title: string; body?: string | null };

/** PURE. Les identifiants de tâche qu'une PR fusionnée livre : son titre, plus sa ligne `Lot:`. */
export function idsDeLaPr(pr: PrFusionnee): string[] {
  const ids = new Set<string>();
  const t = MOTIF_TITRE.exec(pr.title);
  if (t) ids.add(t[1]!);
  const lot = MOTIF_LOT.exec(pr.body ?? '');
  if (lot) {
    for (const brut of lot[1]!.split(',')) {
      const id = brut.trim();
      if (MOTIF_ID.test(id)) ids.add(id);
    }
  }
  return [...ids];
}

/** PURE. L'ensemble des identifiants livrés par des PR fusionnées, avec la PR qui les livre. */
export function livreesParLesPr(prs: readonly PrFusionnee[]): Map<string, number> {
  const livrees = new Map<string, number>();
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    for (const id of idsDeLaPr(pr)) if (!livrees.has(id)) livrees.set(id, pr.number);
  }
  return livrees;
}

/** Les PR fusionnées de la forge (lecture seule). Une forge illisible lève : jamais un « rien livré ». */
export function prFusionnees(limite = 2000): PrFusionnee[] {
  const sortie = execFileSync(
    'gh',
    ['pr', 'list', '--state', 'merged', '--limit', String(limite), '--json', 'number,title,body'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(sortie) as PrFusionnee[];
}

const LANCE_EN_SCRIPT = /[\\/]lot[\\/]avancement-par-les-pr\.ts$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const livrees = livreesParLesPr(prFusionnees());
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: { id: string; statut: string; repo: string }[];
  };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(Object.fromEntries(livrees), null, 2));
    process.exit(0);
  }
  const decompte = { livrees: 0, annulees: 0, restantes: 0 };
  for (const t of doc.taches) {
    if (t.statut === 'annulee') decompte.annulees++;
    else if (livrees.has(t.id) || ['fusionnee', 'deployee', 'verifiee'].includes(t.statut))
      decompte.livrees++;
    else decompte.restantes++;
  }
  console.log(
    `Avancement dérivé des PR fusionnées : ${decompte.livrees} livrée(s), ` +
      `${decompte.restantes} restante(s), ${decompte.annulees} annulée(s), ` +
      `sur ${doc.taches.length} tâche(s) définie(s).`
  );
}
