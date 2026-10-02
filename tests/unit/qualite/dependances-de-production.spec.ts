// @req REQ-QA-018
/**
 * QA-T61 — ce que la production importe ou exécute est une `dependencies` (note de la lentille
 * securite sur INT-T45, acceptance de A02, étendue par A02 le 2026-10-02 à `prisma` et au point
 * d'entrée du conteneur).
 *
 * Le Dockerfile installe aujourd'hui TOUT (`pnpm install --frozen-lockfile`) : rien ne casse. Mais une
 * image « production seule » (`--prod`) perdrait chaque paquet que la production tire de
 * `devDependencies`, et ne démarrerait plus. Ce fichier ferme ce risque avant qu'il ne se présente :
 *   (1) tout import de paquet sous `src/` (hors `import type`, effacé à la compilation) ;
 *   (2) le binaire de chaque script de `package.json` lancé en production ;
 *   (3) tout paquet que `docker-entrypoint.sh` EXÉCUTE, sous toutes les formes d'appel reconnues
 *       (`node …/node_modules/<paquet>/…`, `node_modules/.bin/<bin>`, `pnpm exec <bin>`, `npx <bin>`,
 *       `pnpm <script>`) ; une forme d'appel NON reconnue rougit en se nommant, jamais ignorée ;
 * est déclaré en `dependencies`, sinon le témoin rougit en NOMMANT le paquet. `prisma` (le CLI) et
 * `@prisma/client` portent la MÊME version exacte. `pnpm-lock.yaml` range chaque paquet du même côté
 * que `package.json`, au même spécificateur. Le point d'entrée est LU, jamais modifié.
 * Chaque règle est jugée sur le dépôt réel ET sur un dépôt cassé d'un geste (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';

type Paquet = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};
type Depot = {
  paquet: Paquet;
  sources: readonly { chemin: string; texte: string }[];
  pointDEntree: string;
  lock: string;
  /** Le binaire → le paquet qui le fournit, lu dans `node_modules/<paquet>/package.json`. */
  binaires: ReadonlyMap<string, string>;
};

/**
 * Les scripts que la PRODUCTION lance : les tâches de fond du conteneur, et les étapes du job de
 * déploiement. Liste fermée, nommée : un script de production ajouté sans s'y inscrire n'est pas jugé,
 * et c'est la revue qui l'y fait entrer.
 */
const LANCES_EN_PRODUCTION = (scripts: Record<string, string>): string[] =>
  Object.keys(scripts).filter(
    (s) => s === 'taches:lancer' || s === 'aipd:signee' || s.startsWith('deploy:')
  );

const NATIFS = new Set(builtinModules);
function paquetDe(specificateur: string): string | null {
  if (specificateur.startsWith('.') || specificateur.startsWith('/')) return null;
  if (specificateur.startsWith('node:') || NATIFS.has(specificateur.split('/')[0]!)) return null;
  const morceaux = specificateur.split('/');
  return specificateur.startsWith('@') ? `${morceaux[0]}/${morceaux[1]}` : morceaux[0]!;
}

function importsDe(texte: string): string[] {
  const vus: string[] = [];
  const motifs = [
    /^\s*import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /^\s*export\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const m of motifs) for (const r of texte.matchAll(m)) vus.push(r[1]!);
  return vus;
}

/** Les mots qui lancent un programme JavaScript ; tout appel par l'un d'eux doit être reconnu. */
const LANCEURS = /\b(node|nodejs|pnpm|npx|yarn|bun|deno|tsx|ts-node|prisma|next)\b/;

/**
 * Ce que le point d'entrée EXÉCUTE : les paquets reconnus, et les formes d'appel inconnues. Les
 * variables posées dans le fichier (`NOM="…"`) sont substituées avant la lecture.
 */
export function appelsDuPointDEntree(
  texte: string,
  binaires: ReadonlyMap<string, string>,
  scripts: Record<string, string>
): { paquets: string[]; inconnues: string[] } {
  const paquets: string[] = [];
  const inconnues: string[] = [];
  const variables = new Map<string, string>();
  const parBinaire = (bin: string, ligne: string) => {
    const p = binaires.get(bin);
    if (p === undefined) inconnues.push(`binaire « ${bin} » sans paquet connu : ${ligne}`);
    else paquets.push(p);
  };
  for (const brute of texte.replace(/\r\n/g, '\n').split('\n')) {
    const sansCommentaire = brute.replace(/(^|\s)#.*$/, '').trim();
    if (sansCommentaire === '') continue;
    const affectation = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(sansCommentaire);
    if (affectation) {
      // Seule une valeur LITTÉRALE se substitue ; une substitution de commande (`$(…)`) reste la variable.
      const valeur = affectation[2]!.replace(/^"(.*)"$/, '$1');
      if (!/\$\(|\s/.test(valeur)) variables.set(affectation[1]!, valeur);
      continue;
    }
    // `echo "…"` : du texte imprimé, pas un appel.
    const ligne = sansCommentaire
      .replace(/\becho\s+"[^"]*"/g, '')
      .replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (m, v: string) => variables.get(v) ?? m)
      .replace(/"/g, '');
    let reconnu = false;
    for (const r of ligne.matchAll(/\bnode\s+(\S+)/g)) {
      reconnu = true;
      const p = /node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//.exec(r[1]!);
      if (p && p[1] !== '.bin') paquets.push(p[1]!);
      else inconnues.push(`node lance « ${r[1]} », hors node_modules/<paquet>/ : ${brute.trim()}`);
    }
    for (const r of ligne.matchAll(/node_modules\/\.bin\/(\S+)/g)) {
      reconnu = true;
      parBinaire(r[1]!, brute.trim());
    }
    for (const r of ligne.matchAll(/\b(?:pnpm\s+exec|npx)\s+(\S+)/g)) {
      reconnu = true;
      parBinaire(r[1]!, brute.trim());
    }
    for (const r of ligne.matchAll(/\bpnpm\s+(?!exec\b)(\S+)/g)) {
      reconnu = true;
      const commande = scripts[r[1]!];
      if (commande === undefined) inconnues.push(`pnpm ${r[1]} : aucun script de ce nom`);
      else parBinaire(commande.trim().split(/\s+/)[0]!, brute.trim());
    }
    if (!reconnu && LANCEURS.test(ligne.replace(/node_modules\/\S*/g, '')))
      inconnues.push(`forme d'appel non reconnue : ${brute.trim()}`);
  }
  return { paquets: [...new Set(paquets)], inconnues };
}

/** Les deux listes de l'importeur racine du lock, lues ligne à ligne : `nom → spécificateur`. */
function cotesDuLock(
  lock: string
): Record<'dependencies' | 'devDependencies', Map<string, string>> {
  // `pnpm` 9 laisse une ligne vide entre `importers:` et l'importeur racine.
  const racine = /\nimporters:\n\n? {2}\.:\n([\s\S]*?)(?=\n {2}\S|\n\S)/.exec(lock)?.[1] ?? '';
  const cotes = {
    dependencies: new Map<string, string>(),
    devDependencies: new Map<string, string>(),
  };
  let cote: keyof typeof cotes | null = null;
  let nom: string | null = null;
  for (const l of racine.split('\n')) {
    const c = /^ {4}(dependencies|devDependencies):\s*$/.exec(l);
    if (c) {
      cote = c[1] as keyof typeof cotes;
      continue;
    }
    if (/^ {4}\S/.test(l)) cote = null;
    const n = /^ {6}(?:'([^']+)'|(\S+)):\s*$/.exec(l);
    if (n) nom = n[1] ?? n[2]!;
    const s = /^ {8}specifier: (.+)$/.exec(l);
    if (s && cote && nom) cotes[cote].set(nom, s[1]!.replace(/^'(.*)'$/, '$1'));
  }
  return cotes;
}

function fautes(d: Depot): string[] {
  const f: string[] = [];
  const prod = new Set(Object.keys(d.paquet.dependencies));
  const exiger = (paquet: string, ou: string) => {
    if (!prod.has(paquet))
      f.push(`paquet_hors_dependencies : ${paquet} (${ou}) n'est pas en dependencies`);
  };
  for (const s of d.sources)
    for (const i of importsDe(s.texte)) {
      const p = paquetDe(i);
      if (p !== null) exiger(p, `importé par ${s.chemin}`);
    }
  for (const s of LANCES_EN_PRODUCTION(d.paquet.scripts)) {
    const binaire = d.paquet.scripts[s]!.trim().split(/\s+/)[0]!;
    if (binaire !== 'node' && binaire !== 'sh')
      exiger(d.binaires.get(binaire) ?? binaire, `binaire du script ${s}`);
  }
  const entree = appelsDuPointDEntree(d.pointDEntree, d.binaires, d.paquet.scripts);
  for (const p of entree.paquets) exiger(p, 'exécuté par docker-entrypoint.sh');
  for (const i of entree.inconnues) f.push(`appel_non_reconnu : docker-entrypoint.sh — ${i}`);
  const cli = d.paquet.dependencies['prisma'];
  const client = d.paquet.dependencies['@prisma/client'];
  if (cli === undefined || cli !== client || !/^\d+\.\d+\.\d+$/.test(cli))
    f.push(
      `prisma_desaccorde : le CLI (${cli ?? 'absent'}) et le client (${client ?? 'absent'}) ne portent pas la même version exacte en dependencies`
    );
  const lock = cotesDuLock(d.lock);
  for (const cote of ['dependencies', 'devDependencies'] as const) {
    const attendu = Object.entries(d.paquet[cote]).sort();
    const lu = [...lock[cote].entries()].sort();
    if (JSON.stringify(attendu) !== JSON.stringify(lu))
      f.push(
        `lock_divergent : la section ${cote} de pnpm-lock.yaml ne reprend pas celle de package.json`
      );
  }
  return [...new Set(f)];
}

function sourcesDe(dossier: string): { chemin: string; texte: string }[] {
  const out: { chemin: string; texte: string }[] = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = `${dossier}/${e.name}`;
    if (e.isDirectory()) out.push(...sourcesDe(chemin));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name))
      out.push({ chemin, texte: readFileSync(chemin, 'utf8') });
  }
  return out;
}

function binairesDe(p: Paquet): Map<string, string> {
  const m = new Map<string, string>();
  for (const nom of [...Object.keys(p.dependencies), ...Object.keys(p.devDependencies)]) {
    const fichier = `node_modules/${nom}/package.json`;
    if (!existsSync(fichier)) continue;
    const bin = (JSON.parse(readFileSync(fichier, 'utf8')) as { bin?: unknown }).bin;
    if (typeof bin === 'string') m.set(nom.split('/').pop()!, nom);
    else if (typeof bin === 'object' && bin !== null)
      for (const b of Object.keys(bin)) m.set(b, nom);
  }
  return m;
}

const PAQUET = JSON.parse(readFileSync('package.json', 'utf8')) as Paquet;
const REEL: Depot = {
  paquet: PAQUET,
  sources: sourcesDe('src'),
  pointDEntree: readFileSync('docker-entrypoint.sh', 'utf8'),
  lock: readFileSync('pnpm-lock.yaml', 'utf8').replace(/\r\n/g, '\n'),
  binaires: binairesDe(PAQUET),
};

/** Le dépôt réel, un paquet passé en devDependencies — package.json ET lock, pour ne casser qu'une règle. */
function enDev(nom: string): Depot {
  const p = structuredClone(REEL.paquet);
  p.devDependencies[nom] = p.dependencies[nom]!;
  delete p.dependencies[nom];
  const bloc = new RegExp(
    `\\n {6}${nom.replace(/[/@]/g, '\\$&')}:\\n {8}specifier: [^\\n]+\\n {8}version: [^\\n]+`
  );
  const trouve = bloc.exec(REEL.lock)?.[0] ?? '';
  const sans = REEL.lock.replace(trouve, '');
  const lock = sans.replace('\n    devDependencies:', `\n    devDependencies:${trouve}`);
  return { ...REEL, paquet: p, lock };
}

describe('REQ-QA-018 — ce que la production importe ou exécute est une dependencies', () => {
  it('REQ-QA-018 : le dépôt réel ne tire aucun paquet de production de devDependencies, et le lock concorde', () => {
    expect(fautes(REEL)).toEqual([]);
  });

  it('REQ-QA-018 : ajv, tsx et prisma sont en dependencies, à plage identique, prisma à la version du client', () => {
    expect(REEL.paquet.dependencies['ajv']).toBe('^8.17.1');
    expect(REEL.paquet.dependencies['tsx']).toBe('^4.19.2');
    expect(REEL.paquet.dependencies['prisma']).toBe('5.22.0');
    expect(REEL.paquet.dependencies['@prisma/client']).toBe(REEL.paquet.dependencies['prisma']);
    for (const nom of ['ajv', 'tsx', 'prisma'])
      expect(REEL.paquet.devDependencies[nom]).toBeUndefined();
  });

  it('REQ-QA-018 : le point d’entrée réel est lu : prisma et tsx exécutés, aucune forme d’appel inconnue', () => {
    const e = appelsDuPointDEntree(REEL.pointDEntree, REEL.binaires, REEL.paquet.scripts);
    expect(e.inconnues).toEqual([]);
    expect(e.paquets.sort()).toEqual(['prisma', 'tsx']);
  });

  it('REQ-QA-018 : TÉMOINS — un import, un binaire de script, un paquet du point d’entrée remis en devDependencies rougissent, nommés', () => {
    expect(fautes(enDev('ajv'))).toContain(
      "paquet_hors_dependencies : ajv (importé par src/server/integrations/axionia/candidature-recue.ts) n'est pas en dependencies"
    );
    expect(fautes(enDev('tsx'))).toContain(
      "paquet_hors_dependencies : tsx (binaire du script taches:lancer) n'est pas en dependencies"
    );
    expect(fautes(enDev('prisma'))).toContain(
      "paquet_hors_dependencies : prisma (exécuté par docker-entrypoint.sh) n'est pas en dependencies"
    );
    expect(
      fautes({
        ...REEL,
        sources: [
          ...REEL.sources,
          { chemin: 'src/y.ts', texte: "import type { A } from 'paquet-fantome';\n" },
        ],
      })
    ).toEqual([]);
  });

  it('REQ-QA-018 : TÉMOINS — chaque forme d’appel du point d’entrée est lue, une forme inconnue rougit', () => {
    const avec = (ligne: string) =>
      appelsDuPointDEntree(`${REEL.pointDEntree}\n${ligne}\n`, REEL.binaires, REEL.paquet.scripts);
    expect(avec('node_modules/.bin/vitest run').paquets).toContain('vitest');
    expect(avec('pnpm exec eslint .').paquets).toContain('eslint');
    expect(avec('npx playwright test').paquets).toContain('@playwright/test');
    expect(avec('pnpm taches:lancer').paquets).toContain('tsx');
    expect(avec('yarn start').inconnues).toEqual(["forme d'appel non reconnue : yarn start"]);
    expect(avec('node -e "1"').inconnues.length).toBe(1);
    expect(fautes({ ...REEL, pointDEntree: `${REEL.pointDEntree}\npnpm exec vitest\n` })).toContain(
      "paquet_hors_dependencies : vitest (exécuté par docker-entrypoint.sh) n'est pas en dependencies"
    );
  });

  it('REQ-QA-018 : TÉMOINS — prisma désaccordé du client, ou un lock qui diverge, rougissent', () => {
    const p = structuredClone(REEL.paquet);
    p.dependencies['prisma'] = '^5.22.0';
    expect(fautes({ ...REEL, paquet: p }).some((x) => x.startsWith('prisma_desaccorde'))).toBe(
      true
    );
    expect(
      fautes({
        ...REEL,
        lock: REEL.lock.replace(
          /\n {6}zod:\n {8}specifier: [^\n]+/,
          '\n      zod:\n        specifier: 9.9.9'
        ),
      })
    ).toEqual([
      'lock_divergent : la section dependencies de pnpm-lock.yaml ne reprend pas celle de package.json',
    ]);
  });
});
