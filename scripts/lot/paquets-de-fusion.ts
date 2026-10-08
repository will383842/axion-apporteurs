/**
 * La fusion par paquets adaptatifs (GOV-158, REQ-GOV-014) — exception au gel de la phase 1, décidée
 * par Williams le 2026-10-08 (#319, commentaire 6059181319).
 *
 * Ce module est la SOURCE UNIQUE de la composition d'un paquet, de sa taille et de son découpage : le
 * workflow de lot (`scripts/lot/lot.workflow.js`), la fiche du release manager et le skill `lot` le
 * citent, aucun ne recopie ses règles. Un paquet n'est jamais écrit à la main.
 *
 *   - un paquet ne réunit que des PR SANS FICHIER COMMUN ;
 *   - les migrations fusionnent dans l'ordre d'A02, TRANSMIS par l'architecte (`--ordre-a02`) et jamais
 *     deviné : sans lui, ou hors de lui, une migration refuse la composition ; une PR saine dont la
 *     migration suit celle d'une PR écartée ATTEND, elle ne fusionne pas avant elle ;
 *   - le paquet est testé ENSEMBLE, une fois, sur la pointe de `main` ;
 *   - la taille part de TAILLE_DE_DEPART et monte jusqu'à TAILLE_PLAFOND tant que les paquets passent
 *     du premier coup ; un échec la ramène au départ ;
 *   - un échec coupe le paquet en deux, récursivement : la fautive est isolée, les saines fusionnent ;
 *   - chaque fusion reste UNE fusion `--match-head-commit`, une à la fois, gardes inchangées.
 *
 * En ligne de commande (le release manager n'écrit rien : il lit) :
 *   npx tsx scripts/lot/paquets-de-fusion.ts composer --taille 4 --prs 12,15,17 [--ordre-a02 <m1,m2,…>]
 *   npx tsx scripts/lot/paquets-de-fusion.ts attente --prs 15,17 --ecartees 12 [--ordre-a02 <m1,m2,…>]
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

/** Rangs des migrations d'une PR dans l'ordre d'A02 ; refuse un ordre absent ou une migration hors de lui. */
export function rangsDeMigration(
  p: PrAFusionner,
  ordreA02: readonly string[] | undefined
): number[] {
  return migrationsDe(p).map((m) => {
    if (!ordreA02)
      throw new Error(`PR #${p.pr} : la migration ${m} exige l'ordre fixé par A02 (--ordre-a02)`);
    const r = ordreA02.indexOf(m);
    if (r < 0)
      throw new Error(`PR #${p.pr} : la migration ${m} n'est pas dans l'ordre fixé par A02`);
    return r;
  });
}

/**
 * Les PR qui doivent ATTENDRE : celles dont une migration suit, dans l'ordre d'A02, une migration
 * portée par une PR écartée (fautive, ou elle-même en attente). Les fusionner d'abord inverserait
 * l'ordre des migrations sur `main`.
 */
export function enAttente(
  candidates: readonly PrAFusionner[],
  ecartees: readonly PrAFusionner[],
  ordreA02: readonly string[] | undefined
): number[] {
  const attente: number[] = [];
  let seuil = Math.min(Infinity, ...ecartees.flatMap((p) => rangsDeMigration(p, ordreA02)));
  for (const p of candidates) {
    const rangs = rangsDeMigration(p, ordreA02);
    if (rangs.some((r) => r > seuil)) {
      attente.push(p.pr);
      seuil = Math.min(seuil, ...rangs);
    }
  }
  return attente;
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
  const rangDe = (p: PrAFusionner): number => {
    const rangs = rangsDeMigration(p, ordreA02);
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
export type IssueDuPaquet = {
  fusionnees: number[];
  fautives: number[];
  /** Saines retenues : leur migration suit celle d'une PR écartée. */
  enAttente: number[];
  premierCoup: boolean;
};
/** Les fichiers des PR et l'ordre d'A02 : sans eux, aucune PR n'est retenue pour ses migrations. */
export type ContexteDesMigrations = { prs: readonly PrAFusionner[]; ordreA02?: readonly string[] };

/** Teste le paquet ; vert, le fusionne PR par PR ; rouge, le coupe en deux et recommence sur chaque moitié. */
export async function isolerEtFusionner(
  paquet: Paquet,
  x: Executants,
  contexte: ContexteDesMigrations = { prs: [] }
): Promise<IssueDuPaquet> {
  const issue: IssueDuPaquet = { fusionnees: [], fautives: [], enAttente: [], premierCoup: true };
  const de = (n: number): PrAFusionner =>
    contexte.prs.find((p) => p.pr === n) ?? { pr: n, fichiers: [] };
  const retenue = (n: number): boolean =>
    enAttente([de(n)], [...issue.fautives, ...issue.enAttente].map(de), contexte.ordreA02).length >
    0;
  const traiter = async (p: Paquet): Promise<void> => {
    if (!p.length) return;
    if (await x.tester(p)) {
      for (const n of p) {
        if (retenue(n)) {
          issue.enAttente.push(n);
          issue.premierCoup = false;
          continue;
        }
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
/** La ligne de commande, testable : `lireFichiers` rend les fichiers d'une PR (`gh pr view --json files`). */
export function ligneDeCommande(
  argv: readonly string[],
  lireFichiers: (pr: number) => string[]
): string {
  const [commande, ...reste] = argv;
  const brut = (nom: string): string | undefined => {
    const i = reste.indexOf(`--${nom}`);
    return i < 0 ? undefined : reste[i + 1];
  };
  const opt = (nom: string): string => {
    const v = brut(nom);
    if (v === undefined) throw new Error(`--${nom} manquant`);
    return v;
  };
  const liste = (nom: string): number[] => opt(nom).split(',').filter(Boolean).map(Number);
  const ordreA02 = brut('ordre-a02')?.split(',').filter(Boolean);
  const prsDe = (nom: string): PrAFusionner[] =>
    liste(nom).map((pr) => ({ pr, fichiers: lireFichiers(pr) }));
  let sortie: unknown;
  if (commande === 'composer')
    sortie = composerPaquets(prsDe('prs'), Number(opt('taille')), ordreA02);
  else if (commande === 'attente') sortie = enAttente(prsDe('prs'), prsDe('ecartees'), ordreA02);
  else if (commande === 'taille')
    sortie = tailleSuivante(Number(opt('apres')), opt('premier-coup') === 'oui');
  else if (commande === 'moities') sortie = moities(liste('prs'));
  else if (commande === 'commande') sortie = commandeDeFusion(Number(opt('pr')), opt('tete'));
  else throw new Error('commande attendue : composer | attente | taille | moities | commande');
  return typeof sortie === 'string' ? sortie : JSON.stringify(sortie);
}

const LANCE_EN_LIGNE_DE_COMMANDE = /[\\/]paquets-de-fusion\.[tj]s$/.test(process.argv[1] ?? '');
if (LANCE_EN_LIGNE_DE_COMMANDE) {
  const fichiersDe = (n: number): string[] =>
    (
      JSON.parse(
        execFileSync('gh', ['pr', 'view', String(n), '--json', 'files'], { encoding: 'utf8' })
      ) as { files: { path: string }[] }
    ).files.map((f) => f.path);
  process.stdout.write(`${ligneDeCommande(process.argv.slice(2), fichiersDe)}
`);
}
