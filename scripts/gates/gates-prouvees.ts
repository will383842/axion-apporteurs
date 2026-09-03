/**
 * gates-prouvees.ts — la garde des gates prouvées (QA-T00, REQ-QA-013, règle maison RM-02).
 *
 * USAGE : pnpm gates:prouvees --phase <n>   (échoue si une gate de phase au plus n n'est pas armée)
 *         pnpm gates:prouvees --prove       (un témoin par famille, chacun vu rougir ; contre-témoins verts)
 *
 * POURQUOI ELLE EXISTE. Une garde qu'on n'a jamais vue rougir ne garde rien : elle peut mesurer
 * autre chose que sa cible pendant des mois sans que personne ne s'en aperçoive — la gate
 * Lighthouse d'axionia a mesuré le runner, et un job laissé en `continue-on-error` n'a jamais rien
 * bloqué. `docs/gates.json` porte des dizaines d'entrées ; une poignée seulement porte une
 * `preuveRouge`. Les autres sont une intention, pas une garde. Cette garde-ci compte ce qui est
 * RÉELLEMENT armé à la sortie d'une phase, et nomme ce qui ne l'est pas — un décompte global
 * aurait laissé le reste anonyme, donc sans propriétaire.
 *
 * CE QU'ELLE VÉRIFIE, pour toute entrée de phase au plus n :
 *   — un `id` : sans lui, la gate ne se cite pas dans une PR et ne se retrouve pas dans un run ;
 *   — un `script` qui EXISTE sur le disque. Le champ vaut un chemin de fichier, ou `fichier#ancre`
 *     pour un job de workflow : dans ce cas le fichier doit exister ET porter le job nommé, sans
 *     quoi la gate pointe vers un job que personne n'exécute ;
 *   — ce script CÂBLÉ dans un workflow : `docs/gates.json` exige « un script câblé dans un check
 *     requis ». Un script écrit que rien ne lance ne garde rien de plus qu'un script absent ;
 *   — une `fixtureRouge` non vide : le cas d'échec qu'on sait injecter. Sans elle, personne ne
 *     saura refaire rougir la gate le jour où on doutera d'elle ;
 *   — une `phase` entière : une gate qu'on ne sait pas situer n'entre dans le périmètre d'aucune
 *     phase et sort de tous les comptes — celle-là est jugée quel que soit `--phase` ;
 *   — une `preuveRouge` non nulle ET qui RÉFÉRENCE quelque chose : une URL de run, ou la forme
 *     `pnpm <garde>:prove — <ce qui a été vu rougir>`. « TODO » n'est pas une preuve.
 * L'identité (`id` manquant, `id` répété, alias qui recouvre un id) est vérifiée sur TOUT le
 * registre, périmètre ou non : deux entrées pour un seul nom rendent indiscernables la gate qui a
 * rougi et celle qui n'a rien fait.
 *
 * CE QU'ELLE NE FAIT PAS — trois écarts avec le contrat écrit dans `docs/gates.json`, à lever
 * ailleurs, et nommés ici pour qu'ils ne se perdent pas :
 *   — elle ne lance aucune gate et ne dit pas si elle est verte aujourd'hui : c'est la CI ;
 *   — elle ne REJOUE aucune `fixtureRouge`. Le registre dit « une fixtureRouge qui rougit ENCORE
 *     (rejouée en nightly par prove.sh) » ; ici on vérifie qu'une fixture est NOMMÉE, jamais
 *     qu'elle rougit toujours. Une gate dont la cible a dérivé reste donc « armée » à ses yeux ;
 *   — elle ne dit pas si le check est BLOQUANT. Elle voit que le script est cité dans un workflow,
 *     pas qu'il figure dans les checks requis de la branche ni qu'aucun `continue-on-error` ne le
 *     neutralise : c'est `G-SEC-CI-BLOQUANTE` (QA-T01) et `tout-check-est-cable` (GOV-012).
 * Elle ne remplit jamais une `preuveRouge` toute seule : une preuve se gagne, elle ne se déduit
 * pas d'un fichier présent.
 *
 * INVARIANT DE LA PREUVE. `--prove` n'accepte pas un décompte de fautes : il exige qu'un témoin
 * fasse rougir CHAQUE famille, et que des contre-témoins restent verts. Le registre réel ne peut
 * pas servir de base verte — il est rouge, et c'est précisément ce que cette garde établit ; la
 * preuve tourne donc sur une fixture minimale et sur un disque FEINT, injecté, pour qu'elle ne
 * dépende pas de ce que le dépôt contient le jour où elle passe (RM-11 : aucun défaut sur ce que
 * la preuve fait varier). Les deux fonctions qui lisent vraiment le monde — `ancreDansLeTexte` et
 * le câblage — sont pures et ont leurs propres témoins, sur des chaînes littérales.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';

const CHEMIN_REGISTRE = 'docs/gates.json';

/** Au-delà de ce nombre, on ne recopie pas cent messages identiques : le nom suffit, l'explication est en tête de famille. */
const DETAIL_MAX = 8;

type Gate = {
  id?: unknown;
  phase?: unknown;
  script?: unknown;
  tache?: unknown;
  verifie?: unknown;
  fixtureRouge?: unknown;
  preuveRouge?: unknown;
  alias?: unknown;
};

type Faute = { famille: string; gate: string; phase: number | null; message: string };

/** Les familles de contrôle. `--prove` en exige une preuve chacune, et refuse d'en laisser une sans témoin. */
const FAMILLES: { nom: string; explication: string }[] = [
  { nom: 'id_manquant', explication: "sans id, une gate ne se cite ni dans une PR ni dans un run." },
  { nom: 'id_double', explication: "deux entrées pour un seul nom : on ne saura pas laquelle a rougi." },
  { nom: 'script_manquant', explication: "aucun script : on ne sait pas quoi lancer." },
  { nom: 'script_introuvable', explication: "le script est annoncé au registre, il n'est pas écrit sur le disque." },
  { nom: 'ancre_introuvable', explication: "le fichier de workflow existe, le job nommé n'y est pas." },
  { nom: 'script_non_cable', explication: "le script existe, aucun workflow ne le lance : rien ne l'exécute jamais." },
  { nom: 'fixture_rouge_vide', explication: "aucun cas d'échec nommé : personne ne saura refaire rougir la gate." },
  { nom: 'phase_non_entiere', explication: "gate non situable : elle n'entre dans le périmètre d'aucune phase." },
  { nom: 'preuve_rouge_absente', explication: "gate jamais vue rougir : elle est une intention, pas une garde (RM-02)." },
  { nom: 'preuve_rouge_non_referencee', explication: "la preuve ne référence rien : un mot de remplissage n'est pas un run rouge." },
];
const NOMS_FAMILLES = FAMILLES.map((f) => f.nom);

/**
 * Le disque est INJECTÉ. La preuve ne doit dépendre d'aucun fichier réel, sans quoi elle
 * verdirait ou rougirait au gré de ce que le dépôt contient le jour où elle tourne.
 */
type Disque = {
  fichierExiste(chemin: string): boolean;
  lire(chemin: string): string | null;
  workflows(): string[];
};

function echapper(valeur: string): string {
  return valeur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Un job de workflow : une CLÉ, au niveau d'indentation de `jobs:`, pas une occurrence du mot.
 * Fonction pure — c'est elle que `--prove` exerce sur des chaînes littérales, parce qu'un témoin
 * qui passe par un disque feint ne prouve rien de la regex elle-même.
 */
export function ancreDansLeTexte(texte: string, ancre: string): boolean {
  if (ancre === '') return false;
  return new RegExp(`^[ \\t]{0,8}${echapper(ancre)}[ \\t]*:`, 'm').test(texte);
}

const DISQUE_REEL: Disque = {
  fichierExiste: (chemin) => existsSync(chemin),
  lire: (chemin) => {
    try {
      return readFileSync(chemin, 'utf8');
    } catch {
      return null;
    }
  },
  workflows: () => {
    try {
      return readdirSync('.github/workflows')
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map((f) => `.github/workflows/${f}`);
    } catch {
      return [];
    }
  },
};

const texte = (valeur: unknown): string => (typeof valeur === 'string' ? valeur.trim() : '');
const phaseDe = (valeur: unknown): number | null =>
  typeof valeur === 'number' && Number.isInteger(valeur) ? valeur : null;

/** Une preuve référence un run rouge : une URL, ou la forme verbatim des gardes déjà armées. */
const FORME_PROVE = /^pnpm\s+[A-Za-z0-9:_.-]+:prove(?:\s+--[A-Za-z0-9-]+)*\s+—\s+\S.*$/u;
export function preuveReference(valeur: string): boolean {
  return /^https?:\/\/\S+$/u.test(valeur) || FORME_PROVE.test(valeur);
}

/**
 * Le câblage. Un script est câblé si un workflow le lance — directement, par une commande pnpm
 * qui y mène, ou parce que c'est un test que le lanceur de tests ramasse. Les préfixes de test
 * sont DÉRIVÉS de `vitest.config.ts`, jamais retapés : un `include` qui rétrécit doit faire
 * rougir cette garde, pas la laisser croire qu'un test hors périmètre tourne encore.
 */
class Cablage {
  private readonly textes: string[];
  private readonly commandes: Record<string, string>;
  private readonly inclus: string[];
  private readonly exclus: string[];

  constructor(disque: Disque) {
    this.textes = disque.workflows().map((w) => disque.lire(w) ?? '');
    const brut = disque.lire('package.json');
    let commandes: Record<string, string> = {};
    if (brut !== null) {
      try {
        commandes = (JSON.parse(brut) as { scripts?: Record<string, string> }).scripts ?? {};
      } catch {
        commandes = {};
      }
    }
    this.commandes = commandes;
    const config = disque.lire('vitest.config.ts') ?? '';
    this.inclus = Cablage.prefixes(config, 'include');
    this.exclus = Cablage.prefixes(config, 'exclude');
  }

  /** `tests/unit/**\/*.spec.ts` → `tests/unit/` : la partie littérale, avant le premier joker. */
  private static prefixes(config: string, cle: string): string[] {
    const bloc = new RegExp(`${cle}\\s*:\\s*\\[([\\s\\S]*?)\\]`).exec(config);
    if (bloc === null) return [];
    return [...bloc[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!.split('*')[0]!).filter((p) => p !== '');
  }

  private static nomsPnpm(commande: string): string[] {
    return [...commande.matchAll(/pnpm\s+(?:run\s+)?([A-Za-z0-9:_.-]+)/g)].map((m) => m[1]!);
  }

  private mene(nom: string, chemin: string, vus: Set<string>): boolean {
    if (vus.has(nom)) return false;
    vus.add(nom);
    const commande = this.commandes[nom];
    if (commande === undefined) return false;
    if (commande.includes(chemin)) return true;
    return Cablage.nomsPnpm(commande).some((n) => this.mene(n, chemin, vus));
  }

  private lanceurDeTests(): boolean {
    return this.textes.some((t) =>
      Cablage.nomsPnpm(t).some((n) => (this.commandes[n] ?? '').includes('vitest'))
    );
  }

  couvre(chemin: string): boolean {
    // Un job de workflow est son propre check : le fichier EST ce que la CI exécute.
    if (chemin.startsWith('.github/workflows/')) return true;
    for (const t of this.textes) {
      if (t.includes(chemin)) return true;
      if (Cablage.nomsPnpm(t).some((n) => this.mene(n, chemin, new Set()))) return true;
    }
    const ramasseParVitest =
      this.inclus.some((p) => chemin.startsWith(p)) && !this.exclus.some((p) => chemin.startsWith(p));
    return ramasseParVitest && this.lanceurDeTests();
  }
}

function controler(gates: Gate[], phaseMax: number, disque: Disque): Faute[] {
  const fautes: Faute[] = [];
  const cablage = new Cablage(disque);
  const nomme = (g: Gate, i: number): string => texte(g.id) || `entrée n°${i + 1}`;
  const ajouter = (famille: string, g: Gate, i: number, message: string): void => {
    fautes.push({ famille, gate: nomme(g, i), phase: phaseDe(g.phase), message });
  };

  // ── L'identité, sur tout le registre ───────────────────────────────────────
  const parId = new Map<string, number>();
  for (const [i, g] of gates.entries()) {
    const id = texte(g.id);
    if (id === '') {
      ajouter('id_manquant', g, i, "pas d'id : elle ne peut être ni citée dans une PR ni retrouvée dans un run.");
      continue;
    }
    const premiere = parId.get(id);
    if (premiere !== undefined) {
      ajouter('id_double', g, i, `« ${id} » figure déjà à l'entrée n°${premiere + 1}.`);
    } else {
      parId.set(id, i);
    }
  }

  // Un alias est un AUTRE NOM de la même gate ; il ne crée jamais une seconde entrée.
  const parAlias = new Map<string, string>();
  for (const [i, g] of gates.entries()) {
    const id = texte(g.id);
    const alias = Array.isArray(g.alias) ? g.alias : [];
    for (const brut of alias) {
      const nom = texte(brut);
      if (nom === '') continue;
      const proprietaire = parAlias.get(nom);
      if (parId.has(nom)) {
        ajouter('id_double', g, i, `l'alias « ${nom} » porte le nom d'une entrée du registre.`);
      } else if (proprietaire !== undefined && proprietaire !== id) {
        ajouter('id_double', g, i, `l'alias « ${nom} » est déjà celui de « ${proprietaire} ».`);
      } else {
        parAlias.set(nom, id);
      }
    }
  }

  // ── L'armement, sur le périmètre de la phase ───────────────────────────────
  for (const [i, g] of gates.entries()) {
    const phase = phaseDe(g.phase);
    if (phase === null) {
      ajouter(
        'phase_non_entiere',
        g,
        i,
        `phase = ${JSON.stringify(g.phase)} : une gate qu'on ne sait pas situer sort de tous les comptes.`
      );
      continue;
    }
    if (phase > phaseMax) continue;

    const script = texte(g.script);
    if (script === '') {
      ajouter('script_manquant', g, i, "aucun script : on ne sait pas quoi lancer pour la faire rougir.");
    } else {
      const coupure = script.indexOf('#');
      const chemin = coupure === -1 ? script : script.slice(0, coupure);
      const ancre = coupure === -1 ? '' : script.slice(coupure + 1);
      if (!disque.fichierExiste(chemin)) {
        ajouter('script_introuvable', g, i, `« ${chemin} » n'existe pas : la gate est annoncée, pas écrite.`);
      } else if (ancre !== '' && !ancreDansLeTexte(disque.lire(chemin) ?? '', ancre)) {
        ajouter('ancre_introuvable', g, i, `« ${chemin} » ne porte pas le job « ${ancre} ».`);
      } else if (!cablage.couvre(chemin)) {
        ajouter(
          'script_non_cable',
          g,
          i,
          `« ${chemin} » existe mais aucun workflow ne le lance : écrit, jamais exécuté.`
        );
      }
    }

    if (texte(g.fixtureRouge) === '') {
      ajouter('fixture_rouge_vide', g, i, "fixtureRouge vide : aucun cas d'échec nommé, donc rien à rejouer.");
    }
    const preuve = texte(g.preuveRouge);
    if (preuve === '') {
      ajouter('preuve_rouge_absente', g, i, "preuveRouge absente : cette gate n'a jamais été vue rougir.");
    } else if (!preuveReference(preuve)) {
      ajouter(
        'preuve_rouge_non_referencee',
        g,
        i,
        `preuveRouge = « ${preuve} » ne référence rien. Attendu : l'URL du run rouge archivé, ` +
          `ou « pnpm <garde>:prove — <ce qui a été vu rougir> ».`
      );
    }
  }

  return fautes;
}

// ── mode --prove : chaque famille rougit sur son témoin, les contre-témoins restent verts ──
if (process.argv.includes('--prove')) {
  /**
   * Fixture de preuve. Source : la FORME des entrées de `docs/gates.json` (mêmes champs, mêmes
   * types, même convention `fichier#job`) ; les valeurs sont neutres et n'existent que pour la
   * preuve. Le registre réel ne peut pas servir de base verte : il est rouge aujourd'hui.
   */
  const REGISTRE_SAIN: Gate[] = [
    {
      id: 'exemple:socle',
      phase: -1,
      script: 'scripts/gates/exemple-socle.ts',
      tache: 'QA-T00',
      verifie: "forme d'une entrée du registre",
      fixtureRouge: 'retirer le champ que la garde exige',
      preuveRouge: 'pnpm exemple:socle:prove — deux familles vues rougir',
    },
    {
      id: 'exemple:atelier',
      phase: 0,
      script: '.github/workflows/ci.yml#exemple-job',
      tache: 'QA-T00',
      verifie: 'un job de workflow',
      alias: ['exemple:autre-nom'],
      fixtureRouge: 'mettre le job en échec',
      preuveRouge: 'https://github.com/exemple/depot/actions/runs/1',
    },
    {
      id: 'exemple:plus-tard',
      phase: 2,
      script: 'tests/unit/exemple/plus-tard.spec.ts',
      tache: 'QA-T00',
      verifie: 'une gate hors du périmètre',
      fixtureRouge: 'fausser le total attendu',
      preuveRouge: null,
    },
  ];

  const CI_FEINTE = [
    'name: Feinte',
    'jobs:',
    '  exemple-job:',
    '    steps:',
    '      # exemple-commente:',
    '      - run: pnpm exemple:socle',
    '      - run: pnpm test',
    '',
  ].join('\n');

  const PACKAGE_FEINT = JSON.stringify({
    scripts: { 'exemple:socle': 'tsx scripts/gates/exemple-socle.ts', test: 'vitest run' },
  });

  const VITEST_FEINT = "include: ['tests/unit/**/*.spec.ts'], exclude: ['node_modules', 'tests/integration/**'],";

  const FICHIERS_FEINTS: Record<string, string> = {
    'scripts/gates/exemple-socle.ts': '// une garde',
    'scripts/gates/exemple-jamais-lance.ts': '// une garde que rien ne lance',
    'tests/unit/exemple/plus-tard.spec.ts': '// un test',
    'tests/integration/exemple/hors-lanceur.spec.ts': '// un test hors include',
    '.github/workflows/ci.yml': CI_FEINTE,
    'package.json': PACKAGE_FEINT,
    'vitest.config.ts': VITEST_FEINT,
  };

  const DISQUE_FEINT: Disque = {
    fichierExiste: (chemin) => chemin in FICHIERS_FEINTS,
    lire: (chemin) => FICHIERS_FEINTS[chemin] ?? null,
    workflows: () => ['.github/workflows/ci.yml'],
  };

  /** La phase à laquelle tourne la preuve : le périmètre contient les deux premières gates, pas la troisième. */
  const PHASE_DE_PREUVE = 0;
  const copie = (): Gate[] => JSON.parse(JSON.stringify(REGISTRE_SAIN)) as Gate[];

  const base = controler(copie(), PHASE_DE_PREUVE, DISQUE_FEINT);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'une fixture DÉJÀ fautive (${base.length}) — corrige-la d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.gate} : ${f.message}`));
    process.exit(1);
  }

  const TEMOINS: { famille: string; quoi: string; defaut: () => Gate[] }[] = [
    {
      famille: 'id_manquant',
      quoi: 'une entrée sans id',
      defaut: () => { const r = copie(); r[0]!.id = ''; return r; },
    },
    {
      famille: 'id_double',
      quoi: 'deux entrées pour un seul nom',
      defaut: () => { const r = copie(); r.push(JSON.parse(JSON.stringify(r[0]!)) as Gate); return r; },
    },
    {
      famille: 'id_double',
      quoi: "un alias qui recouvre l'id d'une autre entrée",
      defaut: () => { const r = copie(); r[1]!.alias = ['exemple:socle']; return r; },
    },
    {
      famille: 'script_manquant',
      quoi: 'une gate du périmètre sans script',
      defaut: () => { const r = copie(); r[0]!.script = ''; return r; },
    },
    {
      famille: 'script_introuvable',
      quoi: 'un script annoncé mais jamais écrit',
      defaut: () => { const r = copie(); r[0]!.script = 'scripts/gates/jamais-ecrit.ts'; return r; },
    },
    {
      famille: 'ancre_introuvable',
      quoi: 'un job absent du fichier de workflow',
      defaut: () => { const r = copie(); r[1]!.script = '.github/workflows/ci.yml#job-absent'; return r; },
    },
    {
      famille: 'script_non_cable',
      quoi: "un script écrit qu'aucun workflow ne lance",
      defaut: () => { const r = copie(); r[0]!.script = 'scripts/gates/exemple-jamais-lance.ts'; return r; },
    },
    {
      famille: 'script_non_cable',
      quoi: "un test écrit que l'`include` du lanceur ne ramasse pas",
      defaut: () => { const r = copie(); r[0]!.script = 'tests/integration/exemple/hors-lanceur.spec.ts'; return r; },
    },
    {
      famille: 'fixture_rouge_vide',
      quoi: 'une fixture rouge réduite à des espaces',
      defaut: () => { const r = copie(); r[1]!.fixtureRouge = '   '; return r; },
    },
    {
      famille: 'phase_non_entiere',
      quoi: 'une phase écrite en texte — jugée même hors périmètre',
      defaut: () => { const r = copie(); r[2]!.phase = '2'; return r; },
    },
    {
      famille: 'preuve_rouge_absente',
      quoi: 'une gate du périmètre jamais vue rougir',
      defaut: () => { const r = copie(); r[1]!.preuveRouge = null; return r; },
    },
    {
      famille: 'preuve_rouge_non_referencee',
      quoi: "une preuve remplie avec « TODO »",
      defaut: () => { const r = copie(); r[1]!.preuveRouge = 'TODO'; return r; },
    },
    {
      famille: 'preuve_rouge_non_referencee',
      quoi: 'une preuve réduite à un tiret',
      defaut: () => { const r = copie(); r[0]!.preuveRouge = '—'; return r; },
    },
  ];

  /** Ce qui RESSEMBLE à une faute sans en être une. Sans eux, la garde serait large et inutilisable. */
  const CONTRE_TEMOINS: { quoi: string; cas: () => Gate[] }[] = [
    { quoi: 'la fixture saine elle-même', cas: () => copie() },
    {
      quoi: "une gate de phase ultérieure sans preuveRouge : hors périmètre, elle attend son tour",
      cas: () => { const r = copie(); r[2]!.phase = 3; r[2]!.preuveRouge = null; return r; },
    },
    {
      quoi: 'plusieurs alias sur une même gate : un autre nom ne crée pas une seconde entrée',
      cas: () => { const r = copie(); r[0]!.alias = ['exemple:socle-bis', 'exemple:encore-un-nom']; return r; },
    },
    {
      quoi: "un job de workflow dont l'ancre existe bien dans le fichier",
      cas: () => { const r = copie(); r[0]!.script = '.github/workflows/ci.yml#exemple-job'; return r; },
    },
    {
      quoi: 'une phase négative : le socle est un entier comme un autre',
      cas: () => { const r = copie(); r[2]!.phase = -1; r[2]!.preuveRouge = 'https://github.com/exemple/depot/actions/runs/2'; return r; },
    },
    {
      quoi: "un test du périmètre : le lanceur de tests le ramasse, il est câblé",
      cas: () => { const r = copie(); r[2]!.phase = -1; r[2]!.preuveRouge = 'pnpm exemple:test:prove — une famille vue rougir'; return r; },
    },
    {
      quoi: 'une preuve sous forme d’URL de run archivé',
      cas: () => { const r = copie(); r[0]!.preuveRouge = 'https://github.com/exemple/depot/actions/runs/3'; return r; },
    },
    {
      quoi: 'une preuve sous la forme verbatim des gardes déjà armées',
      cas: () => { const r = copie(); r[0]!.preuveRouge = 'pnpm gov:publication:prove — 7 familles vues rougir, 5 contre-temoins vus rester verts'; return r; },
    },
  ];

  /**
   * Les témoins de forme. `ancreDansLeTexte` est la seule ligne de la garde qui décide sur du
   * TEXTE de workflow : un témoin qui passe par le disque feint ne prouve rien de sa regex.
   */
  const YAML_TEMOIN = [
    'name: Exemple',
    'jobs:',
    '  gate-a:',
    '    steps:',
    '      # gate-sec:',
    '      - run: pnpm gate-sec',
    '',
  ].join('\n');
  const FORMES: { quoi: string; obtenu: boolean; attendu: boolean }[] = [
    { quoi: 'le job nommé est une clé sous `jobs:`', obtenu: ancreDansLeTexte(YAML_TEMOIN, 'gate-a'), attendu: true },
    { quoi: 'un job absent du fichier', obtenu: ancreDansLeTexte(YAML_TEMOIN, 'gate-b'), attendu: false },
    { quoi: 'le nom en COMMENTAIRE ne fait pas un job', obtenu: ancreDansLeTexte(YAML_TEMOIN, 'gate-sec'), attendu: false },
    { quoi: 'une ancre vide ne vaut jamais vrai', obtenu: ancreDansLeTexte(YAML_TEMOIN, ''), attendu: false },
    { quoi: 'un point n’est pas un joker de regex', obtenu: ancreDansLeTexte('  gateXa:\n', 'gate.a'), attendu: false },
  ];

  for (const f of FORMES) {
    if (f.obtenu !== f.attendu) {
      console.error(
        `❌ ancreDansLeTexte : « ${f.quoi} » rend ${f.obtenu}, attendu ${f.attendu}. ` +
          `La règle qui décide d'un job de workflow ne fait pas ce qu'elle dit.`
      );
      process.exit(1);
    }
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut(), PHASE_DE_PREUVE, DISQUE_FEINT);
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin « ${t.quoi} » n'a PAS fait rougir la famille « ${t.famille} » ` +
          `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      process.exit(1);
    }
    prouvees.add(t.famille);
  }

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.cas(), PHASE_DE_PREUVE, DISQUE_FEINT);
    if (f.length > 0) {
      console.error(`❌ Faux positif : « ${c.quoi} » a rougi. La garde est trop large.`);
      f.slice(0, 3).forEach((x) => console.error(`   [${x.famille}] ${x.gate} : ${x.message}`));
      process.exit(1);
    }
  }

  const sansTemoin = NOMS_FAMILLES.filter((n) => !prouvees.has(n));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  console.log(
    `✅ Les ${NOMS_FAMILLES.length} familles rougissent chacune sur son témoin, ` +
      `${CONTRE_TEMOINS.length} contre-témoins restent verts, ${FORMES.length} témoins de forme sur ` +
      `ancreDansLeTexte — preuve faite.`
  );
  TEMOINS.forEach((t) => console.log(`   • ${t.famille} — ${t.quoi}`));
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
function lirePhase(argv: string[]): { valeur: number } | { erreur: string } {
  const colle = argv.find((a) => a.startsWith('--phase='));
  const separe = argv.indexOf('--phase');
  const brut = colle !== undefined ? colle.slice('--phase='.length) : separe !== -1 ? argv[separe + 1] : undefined;
  if (brut === undefined || brut.trim() === '') {
    return {
      erreur:
        "il manque le niveau de phase. USAGE : pnpm gates:prouvees --phase <n> (n entier, -1 pour le socle). " +
        "La phase ne se devine pas : c'est elle qui dit quelles gates doivent DÉJÀ être armées.",
    };
  }
  const valeur = Number(brut);
  if (!Number.isInteger(valeur)) return { erreur: `« ${brut} » n'est pas un niveau de phase entier.` };
  return { valeur };
}

const phaseLue = lirePhase(process.argv.slice(2));
if ('erreur' in phaseLue) {
  console.error(`❌ gates:prouvees — ${phaseLue.erreur}`);
  process.exit(1);
}
const phaseMax = phaseLue.valeur;

if (!existsSync(CHEMIN_REGISTRE)) {
  console.error(`❌ gates:prouvees — ${CHEMIN_REGISTRE} est introuvable : le registre des gates est la source.`);
  process.exit(1);
}
const doc = JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { gates?: unknown };
if (!Array.isArray(doc.gates)) {
  console.error(`❌ gates:prouvees — ${CHEMIN_REGISTRE} ne porte pas de tableau « gates ».`);
  process.exit(1);
}
const gates = doc.gates as Gate[];

const dansLePerimetre = gates.filter((g) => {
  const p = phaseDe(g.phase);
  return p !== null && p <= phaseMax;
});
const fautes = controler(gates, phaseMax, DISQUE_REEL);

if (fautes.length === 0) {
  const parPhase = new Map<number, number>();
  for (const g of dansLePerimetre) {
    const p = phaseDe(g.phase)!;
    parPhase.set(p, (parPhase.get(p) ?? 0) + 1);
  }
  const detail = [...parPhase.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([p, n]) => `phase ${p} : ${n}`)
    .join(' · ');
  console.log(
    `✅ gates:prouvees — périmètre « phase au plus ${phaseMax} » : ${dansLePerimetre.length} gate(s) sur ` +
      `${gates.length}, toutes armées (script écrit, lancé par un workflow, fixture rouge nommée, ` +
      `référence de preuve rouge renseignée).`
  );
  console.log(`   ${detail}`);
  console.log(
    `   Hors périmètre : ${gates.length - dansLePerimetre.length} gate(s), à armer avant la phase où elles tombent.`
  );
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);

console.error(
  `❌ gates:prouvees — ${fautes.length} manque(s) sur le périmètre « phase au plus ${phaseMax} » ` +
    `(${dansLePerimetre.length} gate(s) concernées, ${gates.length} au registre) :\n`
);
for (const { nom, explication } of FAMILLES) {
  const liste = parFamille.get(nom);
  if (liste === undefined || liste.length === 0) continue;
  console.error(`   ── ${nom} (${liste.length}) — ${explication}`);
  if (liste.length <= DETAIL_MAX) {
    liste.forEach((f) => console.error(`      ${f.gate} : ${f.message}`));
    continue;
  }
  const parPhase = new Map<number | null, string[]>();
  for (const f of liste) parPhase.set(f.phase, [...(parPhase.get(f.phase) ?? []), f.gate]);
  const cles = [...parPhase.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b));
  for (const cle of cles) {
    const noms = parPhase.get(cle) ?? [];
    const titre = cle === null ? 'phase non situable' : `phase ${cle}`;
    console.error(`      ${titre} (${noms.length}) : ${noms.join(', ')}`);
  }
}
console.error(
  `\n   Une gate s'arme en trois gestes : écrire son script ET le câbler dans un workflow, injecter sa ` +
    `fixtureRouge et LA VOIR ROUGIR, puis inscrire la référence du run rouge dans ${CHEMIN_REGISTRE}. ` +
    `Une gate qui n'a jamais rougi n'existe pas (RM-02).`
);
process.exit(1);
