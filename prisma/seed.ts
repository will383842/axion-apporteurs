/**
 * prisma/seed.ts — le semeur des bases de preview (QA-T06, REQ-QA-015 ; partners/ADR-0022 point 14).
 *
 * USAGE : tsx prisma/seed.ts                         sème `DATABASE_URL`
 *         tsx prisma/seed.ts --verifier <A> <B>      sème deux bases NEUVES et les compare
 *         tsx prisma/seed.ts --comparer <A> <B>      compare deux bases déjà semées
 *   Entrées, toutes exigées, aucune par défaut : `SEMEUR_INSTANT` (ISO — l'horloge du semis) et les
 *   clés `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`, `IP_HASH_SALT` de l'environnement semé.
 *
 * UNE PREVIEW EST SEMÉE, JAMAIS COPIÉE. Aucune donnée de production n'entre ici : le semeur écrit ce
 * que ses modules fabriquent à partir d'entrées fixes, et rien d'autre.
 *
 * ── CE QU'IL FAIT ────────────────────────────────────────────────────────────────────────────
 *
 * Il n'écrit AUCUNE table lui-même. Il exécute, dans l'ordre de leur préfixe, les modules
 * `prisma/seed/<NN>-<table>.ts`, chacun livré par la tâche qui crée sa table, et leur passe un
 * CONTEXTE déterministe : l'instant du semis (jamais l'horloge du poste), un générateur d'uuid v5
 * d'un espace de noms fixe (jamais un tirage), et les clés de l'environnement pour `colonnesPii`.
 * Un module sans export par défaut est une faute nommée, pas un module sauté.
 *
 * ── LA GARDE : DEUX SEMIS, LES MÊMES DONNÉES ─────────────────────────────────────────────────
 *
 * `--verifier` sème deux bases neuves et les compare table par table, toutes les tables du schéma
 * (lues dans le modèle de Prisma, jamais énumérées ici). Les colonnes chiffrées tirent un vecteur
 * aléatoire : elles sont DÉCHIFFRÉES avant d'être comparées, faute de quoi un semeur qui écrirait un
 * clair au hasard passerait. Une divergence fait sortir en 1 en NOMMANT la table ; le vert imprime le
 * nombre de tables confrontées.
 */
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { clesPii, decryptPii, type ClesPii } from '../src/server/securite/pii';

/** L'espace de noms des identifiants semés : fixe, pour qu'un même nom donne le même uuid partout. */
export const ESPACE_DE_NOMS = '6f1d2c3a-5b4e-4f8a-9c7d-0e1f2a3b4c5d';

/** uuid v5 (RFC 4122 §4.3) : SHA-1 de l'espace de noms et du nom. Aucun tirage. */
export function uuidV5(nom: string, espace: string = ESPACE_DE_NOMS): string {
  const octetsEspace = Buffer.from(espace.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(octetsEspace).update(nom, 'utf8').digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export type ContexteDeSemis = {
  readonly maintenant: Date;
  readonly uuid: (nom: string) => string;
  readonly cles: ClesPii;
};

export function contexteDeSemis(maintenant: Date, cles: ClesPii): ContexteDeSemis {
  return { maintenant, uuid: (nom) => uuidV5(nom), cles };
}

export type ModuleDeSemis = {
  nom: string;
  semer: (prisma: PrismaClient, ctx: ContexteDeSemis) => Promise<void>;
};

const DOSSIER = join(fileURLToPath(new URL('.', import.meta.url)), 'seed');
const FORME_DU_NOM = /^(\d{2})-[a-z0-9-]+\.ts$/;

/** Les modules de `prisma/seed/`, dans l'ordre de leur préfixe ; chacun porte un export par défaut. */
export async function modulesDeSemis(dossier: string = DOSSIER): Promise<ModuleDeSemis[]> {
  const fichiers = readdirSync(dossier)
    .filter((f) => FORME_DU_NOM.test(f))
    .sort();
  const modules: ModuleDeSemis[] = [];
  for (const f of fichiers) {
    const m = (await import(pathToFileURL(join(dossier, f)).href)) as { default?: unknown };
    if (typeof m.default !== 'function') {
      throw new Error(
        `prisma/seed/${f} n'a pas d'export par défaut (prisma, contexte) : le semeur ne devine pas`
      );
    }
    modules.push({ nom: f.replace(/\.ts$/, ''), semer: m.default as ModuleDeSemis['semer'] });
  }
  return modules;
}

export async function semer(
  prisma: PrismaClient,
  ctx: ContexteDeSemis,
  modules?: readonly ModuleDeSemis[]
): Promise<string[]> {
  const liste = modules ?? (await modulesDeSemis());
  for (const m of liste) await m.semer(prisma, ctx);
  return liste.map((m) => m.nom);
}

// ── la comparaison ───────────────────────────────────────────────────────────────────────────

type Valeur = unknown;
const delegue = (modele: string) => `${modele[0]!.toLowerCase()}${modele.slice(1)}`;

function normaliser(
  modele: Prisma.DMMF.Model,
  ligne: Record<string, Valeur>,
  cles: ClesPii
): Record<string, Valeur> {
  const sortie: Record<string, Valeur> = {};
  for (const champ of modele.fields) {
    if (champ.kind === 'object') continue;
    const v = ligne[champ.name];
    if (v instanceof Uint8Array) {
      try {
        sortie[champ.name] =
          `clair:${decryptPii({ modele: modele.name, id: String(ligne.id), champ: champ.name }, v, cles)}`;
      } catch {
        sortie[champ.name] = `octets:${createHash('sha256').update(v).digest('hex')}`;
      }
    } else if (v instanceof Date) sortie[champ.name] = v.toISOString();
    else if (typeof v === 'bigint') sortie[champ.name] = v.toString();
    else if (v !== null && typeof v === 'object' && 'toFixed' in (v as object))
      sortie[champ.name] = String(v);
    else sortie[champ.name] = v;
  }
  return sortie;
}

export type Ecart = { table: string; motif: string };

/** Chaque table du schéma, lue dans les deux bases, normalisée, triée, comparée. */
export async function comparerBases(
  a: PrismaClient,
  b: PrismaClient,
  cles: ClesPii
): Promise<Ecart[]> {
  const ecarts: Ecart[] = [];
  for (const modele of Prisma.dmmf.datamodel.models) {
    const lire = async (p: PrismaClient) => {
      const d = (
        p as unknown as Record<string, { findMany: () => Promise<Record<string, Valeur>[]> }>
      )[delegue(modele.name)];
      if (!d) throw new Error(`délégué Prisma introuvable pour ${modele.name}`);
      return (await d.findMany()).map((l) => JSON.stringify(normaliser(modele, l, cles))).sort();
    };
    const [la, lb] = [await lire(a), await lire(b)];
    if (la.length !== lb.length) {
      ecarts.push({ table: modele.name, motif: `${la.length} ligne(s) contre ${lb.length}` });
    } else if (la.some((l, i) => l !== lb[i])) {
      ecarts.push({ table: modele.name, motif: 'mêmes nombres de lignes, contenus différents' });
    }
  }
  return ecarts;
}

export function nombreDeTables(): number {
  return Prisma.dmmf.datamodel.models.length;
}

// ── la ligne de commande ─────────────────────────────────────────────────────────────────────

function entrees(): { ctx: ContexteDeSemis; cles: ClesPii } {
  const brut = process.env.SEMEUR_INSTANT ?? '';
  const maintenant = new Date(brut);
  if (brut === '' || Number.isNaN(maintenant.getTime())) {
    throw new Error('SEMEUR_INSTANT (ISO) est exigé : le semeur ne lit jamais l’horloge du poste');
  }
  const cles = clesPii(process.env);
  return { ctx: contexteDeSemis(maintenant, cles), cles };
}

async function avec<T>(url: string, f: (p: PrismaClient) => Promise<T>): Promise<T> {
  const p = new PrismaClient({ datasourceUrl: url });
  try {
    return await f(p);
  } finally {
    await p.$disconnect();
  }
}

async function principal(argv: string[]): Promise<number> {
  const { ctx, cles } = entrees();
  const mode = argv[0];
  if (mode === '--verifier' || mode === '--comparer') {
    const [a, b] = [argv[1], argv[2]];
    if (!a || !b) throw new Error(`usage : ${mode} <base A> <base B>`);
    if (mode === '--verifier') {
      await avec(a, (p) => semer(p, ctx));
      await avec(b, (p) => semer(p, ctx));
    }
    const ecarts = await avec(a, (pa) => avec(b, (pb) => comparerBases(pa, pb, cles)));
    if (ecarts.length > 0) {
      process.stderr.write(
        `❌ semeur — ${ecarts.length} table(s) divergent entre les deux bases :\n`
      );
      for (const e of ecarts) process.stderr.write(`   ${e.table} : ${e.motif}\n`);
      return 1;
    }
    process.stdout.write(
      `✅ semeur — ${nombreDeTables()} table(s) confrontée(s), aucune divergence.\n`
    );
    return 0;
  }
  const url = process.env.DATABASE_URL ?? '';
  if (url === '') throw new Error('DATABASE_URL est exigée');
  const semes = await avec(url, (p) => semer(p, ctx));
  process.stdout.write(`✅ semeur — ${semes.length} module(s) exécuté(s) : ${semes.join(', ')}\n`);
  return 0;
}

const APPELE_DIRECTEMENT = /seed\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  principal(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: Error) => {
      process.stderr.write(`❌ ${e.message}\n`);
      process.exitCode = 1;
    }
  );
}
