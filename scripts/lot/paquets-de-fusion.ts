/**
 * La fusion par paquets adaptatifs (GOV-158, REQ-GOV-014) — exception au gel de la phase 1, décidée
 * par Williams le 2026-10-08 (#319, commentaire 6059181319).
 *
 * Ce module est la SOURCE UNIQUE de la composition d'un paquet, de sa taille et de son découpage : le
 * workflow de lot (`scripts/lot/lot.workflow.js`), la fiche du release manager et le skill `lot` le
 * citent, aucun ne recopie ses règles. Un paquet n'est jamais écrit à la main.
 *
 *   - un paquet ne réunit que des PR SANS FICHIER COMMUN ;
 *   - les migrations fusionnent dans l'ordre d'A02 — par défaut l'ordre d'application de Prisma, celui
 *     des noms de dossier que l'architecte horodate ; une migration hors de cet ordre refuse le paquet ;
 *   - le paquet est testé ENSEMBLE, une fois, sur la pointe de `main` ;
 *   - la taille part de TAILLE_DE_DEPART et monte jusqu'à TAILLE_PLAFOND tant que les paquets passent
 *     du premier coup ; un échec la ramène au départ ;
 *   - un échec coupe le paquet en deux, récursivement : la fautive est isolée, les saines fusionnent ;
 *   - chaque fusion reste UNE fusion `--match-head-commit`, une à la fois, gardes inchangées.
 *
 * En ligne de commande (le release manager n'écrit rien : il lit) :
 *   npx tsx scripts/lot/paquets-de-fusion.ts composer --taille 4 --prs 12,15,17
 *   npx tsx scripts/lot/paquets-de-fusion.ts taille --apres 4 --premier-coup oui|non
 *   npx tsx scripts/lot/paquets-de-fusion.ts moities --prs 12,15,17
 *   npx tsx scripts/lot/paquets-de-fusion.ts commande --pr 12 --tete <sha de tête, 40 hexadécimaux>
 */
import { execFileSync } from 'node:child_process';

export const TAILLE_DE_DEPART = 4;
export const TAILLE_PLAFOND = 10;

export type PrAFusionner = { pr: number; fichiers: readonly string[] };
export type Paquet = number[];

const MIGRATION = /^prisma\/migrations\/([^/]+)\/migration\.sql$/;

/** Les migrations qu'une PR ajoute, par nom de dossier. */
export function migrationsDe(p: PrAFusionner): string[] {
  return p.fichiers.flatMap((f) => {
    const m = MIGRATION.exec(f);
    return m ? [m[1]!] : [];
  });
}

/**
 * Ordonne les PR selon l'ordre d'A02 de leurs migrations (tri stable : une PR sans migration garde sa
 * place relative), puis les range en paquets d'au plus `taille` PR sans fichier commun. Une PR qui
 * partage un fichier avec le paquet en cours FERME ce paquet : elle ouvre le suivant, et l'ordre de
 * fusion reste celui des migrations.
 */
export function composerPaquets(
  prs: readonly PrAFusionner[],
  taille: number,
  ordreA02?: readonly string[]
): Paquet[] {
  if (!Number.isInteger(taille) || taille < 1)
    throw new Error(`taille de paquet invalide : ${taille}`);
  const ordre = ordreA02 ?? [...new Set(prs.flatMap(migrationsDe))].sort();
  const rangDe = (p: PrAFusionner): number => {
    const rangs = migrationsDe(p).map((m) => {
      const r = ordre.indexOf(m);
      if (r < 0)
        throw new Error(`PR #${p.pr} : la migration ${m} n'est pas dans l'ordre fixé par A02`);
      return r;
    });
    return rangs.length ? Math.min(...rangs) : -1;
  };
  const rangs = new Map(prs.map((p) => [p.pr, rangDe(p)]));
  // Une PR sans migration (-1) ne change pas de place par rapport à ses voisines sans migration ;
  // celles qui en portent sont replacées entre elles dans l'ordre d'A02.
  const avecMigration = prs.filter((p) => rangs.get(p.pr)! >= 0);
  const triees = [...avecMigration].sort((a, b) => rangs.get(a.pr)! - rangs.get(b.pr)!);
  let i = 0;
  const sequence = prs.map((p) => (rangs.get(p.pr)! >= 0 ? triees[i++]! : p));

  const paquets: Paquet[] = [];
  let courant: Paquet = [];
  let fichiers = new Set<string>();
  for (const p of sequence) {
    const commun = p.fichiers.some((f) => fichiers.has(f));
    if (courant.length && (commun || courant.length >= taille)) {
      paquets.push(courant);
      courant = [];
      fichiers = new Set();
    }
    courant.push(p.pr);
    for (const f of p.fichiers) fichiers.add(f);
  }
  if (courant.length) paquets.push(courant);
  return paquets;
}

/** Taille du paquet suivant : elle double jusqu'au plafond après un succès du premier coup, revient au départ sinon. */
export function tailleSuivante(taille: number, premierCoup: boolean): number {
  return premierCoup
    ? Math.min(Math.max(taille, TAILLE_DE_DEPART) * 2, TAILLE_PLAFOND)
    : TAILLE_DE_DEPART;
}

/** Coupe un paquet en deux, sans perdre ni réordonner une PR. */
export function moities(paquet: readonly number[]): [Paquet, Paquet] {
  const m = Math.floor(paquet.length / 2);
  return [paquet.slice(0, m), paquet.slice(m)];
}

export type Executants = {
  /** Teste le paquet ENSEMBLE, une fois, sur la pointe de `main`. */
  tester: (paquet: Paquet) => Promise<boolean>;
  /** Fusionne UNE PR, gardes comprises ; lève si une garde refuse. */
  fusionner: (pr: number) => Promise<void>;
};
export type IssueDuPaquet = { fusionnees: number[]; fautives: number[]; premierCoup: boolean };

/** Teste le paquet ; vert, le fusionne PR par PR ; rouge, le coupe en deux et recommence sur chaque moitié. */
export async function isolerEtFusionner(paquet: Paquet, x: Executants): Promise<IssueDuPaquet> {
  const issue: IssueDuPaquet = { fusionnees: [], fautives: [], premierCoup: true };
  const traiter = async (p: Paquet): Promise<void> => {
    if (!p.length) return;
    if (await x.tester(p)) {
      for (const n of p) {
        try {
          await x.fusionner(n);
          issue.fusionnees.push(n);
        } catch {
          issue.fautives.push(n);
          issue.premierCoup = false;
        }
      }
      return;
    }
    issue.premierCoup = false;
    if (p.length === 1) {
      issue.fautives.push(p[0]!);
      return;
    }
    const [a, b] = moities(p);
    await traiter(a);
    await traiter(b);
  };
  await traiter(paquet);
  return issue;
}

/** La commande de fusion d'UNE PR — tête imposée, squash, ligne `Lot:` recopiée (GOV-104). */
export function commandeDeFusion(pr: number, tete: string): string {
  if (!/^[0-9a-f]{40}$/.test(tete))
    throw new Error(`PR #${pr} : tête « ${tete} » — 40 hexadécimaux exigés`);
  return (
    `gh pr merge ${pr} --squash --match-head-commit ${tete}` +
    ` --subject "$(gh pr view ${pr} --json title -q .title) (#${pr})"` +
    ` --body "$(gh pr view ${pr} --json body -q .body | grep -m1 '^Lot:')" --delete-branch`
  );
}

// ── ligne de commande ────────────────────────────────────────────────────────────────────────────
const LANCE_EN_LIGNE_DE_COMMANDE = /[\\/]paquets-de-fusion\.[tj]s$/.test(process.argv[1] ?? '');
if (LANCE_EN_LIGNE_DE_COMMANDE) {
  const [commande, ...reste] = process.argv.slice(2);
  const opt = (nom: string): string => {
    const i = reste.indexOf(`--${nom}`);
    if (i < 0 || reste[i + 1] === undefined) throw new Error(`--${nom} manquant`);
    return reste[i + 1]!;
  };
  const numeros = () => opt('prs').split(',').map(Number);
  const fichiersDe = (n: number): string[] =>
    (
      JSON.parse(
        execFileSync('gh', ['pr', 'view', String(n), '--json', 'files'], { encoding: 'utf8' })
      ) as { files: { path: string }[] }
    ).files.map((f) => f.path);
  let sortie: unknown;
  if (commande === 'composer')
    sortie = composerPaquets(
      numeros().map((pr) => ({ pr, fichiers: fichiersDe(pr) })),
      Number(opt('taille'))
    );
  else if (commande === 'taille')
    sortie = tailleSuivante(Number(opt('apres')), opt('premier-coup') === 'oui');
  else if (commande === 'moities') sortie = moities(numeros());
  else if (commande === 'commande') sortie = commandeDeFusion(Number(opt('pr')), opt('tete'));
  else throw new Error('commande attendue : composer | taille | moities | commande');
  process.stdout.write(`${typeof sortie === 'string' ? sortie : JSON.stringify(sortie)}\n`);
}
