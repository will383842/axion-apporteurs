// @req REQ-DM-003
// @req REQ-INT-004
/**
 * `termes-interdits.spec.ts` — le contrôle de la garde `gov:check` (GOV-030).
 *
 * CE QU'IL EXERCE :
 *   1. les DÉRIVATIONS (RM-01) : types, modèles refusés, synonymes et racines se LISENT dans leurs
 *      sources, et les fixtures de la preuve sont assérées ÉGALES aux sources réelles ;
 *   2. la famille `liste_litterale_d_etats` (REQ-DM-003, `partners/ADR-0011`) : une seule
 *      implémentation, une portée qui est une RACINE et jamais une extension, une lecture confrontée
 *      à git, et la conclusion « hors famille » de `gov:check` dérivée du même prédicat ;
 *   3. ce que les deux gardes ont RÉELLEMENT LU — chemin, et contenu PAR EMPREINTE — confronté à une
 *      lecture indépendante (`git ls-files`, octets relus sur le disque dans le test), sur une population
 *      générée, sur le dépôt réel et sur des dépôts jetables, jusqu'à la DERNIÈRE ligne d'un fichier de
 *      plus d'un mébioctet ; les comptes imprimés en viennent ;
 *   4. la LIGNE : LF la termine, et toute autre fin de ligne qu'un consommateur coupe est refusée ;
 *      l'exemption de citation se lit sur la DERNIÈRE extension du nom ;
 *   5. les DÉCISIONS de `--prove` et de la garde, fonctions pures : la population (familles, refus,
 *      extensions qui citent, témoins) vient du SEUL registre, et chaque retrait y est nommé.
 * Les cas que `TEMOINS` et `CONTRE_TEMOINS` portent ne sont pas restatés : `decisionDeLaPreuve` les
 * juge, et elle est exercée ici.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  controler,
  examiner,
  fichierTexte,
  typesEvenementDeLaReq,
  modelesRefusesDAxionia,
  synonymesDuGlossaire,
  racinesDuGlossaire,
  populationDuRegistre,
  cleDeCouverture,
  ecartsDePopulation,
  eprouver,
  entreesDeLaPreuve,
  decisionDeLaPreuve,
  decisionDeLaGarde,
  perimetreDeLaVue,
  FAMILLES,
  EXTENSIONS_QUI_CITENT,
  TEMOINS,
  CONTRE_TEMOINS,
  VUE_CONFORME,
  vueDuDepot,
  type Temoin,
  type Vue,
} from '../../../scripts/gates/gov-check';
import {
  controler as controlerVocabulaire,
  vueDuDepot as vueDuVocabulaire,
  VUE_CONFORME as VUE_VOCABULAIRE,
  RACINES_CODE,
  dansLaPorteeDesEtats,
  finDeLigneEtrangere,
} from '../../../scripts/gates/schema-enums';
import { TYPES_EVENEMENT } from '../../../packages/contracts/events';

const SCRIPT = 'scripts/gates/gov-check.ts';
const SCRIPT_VOCABULAIRE = 'scripts/gates/schema-enums.ts';
const TSX = resolve('node_modules/tsx/dist/cli.mjs');
/** Oracle du test : le paquet de contrats, racine que la garde ajoute à celles du glossaire. */
const RACINE_CONTRATS = 'packages/contracts/';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Une garde lancée par son chemin dans un dépôt donné. */
function lancerDans(depot: string, script: string): { code: number | null; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, script], { cwd: depot, encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Les familles rougies par une vue. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

/** La vue conforme, plus un seul fichier : le témoin ne bouge que pour UNE raison. */
function avecFichier(chemin: string, contenu: string): Vue {
  return { ...VUE_CONFORME, fichiers: [...VUE_CONFORME.fichiers, fichierTexte(chemin, contenu)] };
}

const temoin = (id: string): Temoin => TEMOINS.find((t) => t.id === id)!;

/**
 * LA LECTURE INDÉPENDANTE : les fichiers que git suit, et les OCTETS que le disque en rend, relus dans
 * le test, jamais par la garde. Le disque et non le blob : la garde lit le disque, et un fichier modifié
 * non commité les fait diverger légitimement. Les entrées de sous-module (mode 160000) ne sont pas des
 * fichiers. Le contenu se confronte par EMPREINTE : une taille égale ne dit rien d'octets remplacés.
 */
function suivisEtOctets(cwd: string): Map<string, Buffer> {
  const chemins = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-s', '-z'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .map((e) => e.split('\t') as [string, string])
    .filter(([meta]) => !meta.startsWith('160000 '))
    .map(([, chemin]) => chemin);
  return new Map(chemins.map((chemin) => [chemin, readFileSync(join(cwd, chemin))]));
}

/** L'empreinte d'un contenu : l'oracle de « lu en entier », là où une taille égale laisserait passer des octets remplacés. */
const sha256 = (contenu: Uint8Array | string): string =>
  createHash('sha256').update(contenu).digest('hex');

/** Les comptes qu'une garde qui lit tout sous ses racines DOIT imprimer, calculés depuis git et le disque. */
function perimetreAttendu(fichiers: Map<string, Uint8Array>, racines: readonly string[]) {
  const parRacine = racines.map((racine) => ({ racine, n: 0, octets: 0 }));
  let hors = 0;
  for (const [chemin, octets] of fichiers) {
    const rang = parRacine.find((r) => chemin.startsWith(r.racine));
    if (rang) {
      rang.n++;
      rang.octets += octets.length;
    } else hors++;
  }
  const lus = parRacine.reduce((s, r) => s + r.n, 0);
  return {
    perimetre:
      `Périmètre : ${lus} fichier(s) lu(s) en entier sur ${fichiers.size} suivi(s) — ` +
      parRacine.map((r) => `${r.racine} ${r.n} (${r.octets} octets)`).join(', '),
    hors: `Hors périmètre : ${hors} fichier(s) suivi(s)`,
  };
}

/** Les racines de `gov:check` sur un glossaire donné — l'oracle du test. */
const racinesDeLaGarde = (glossaire: string): string[] => [
  ...racinesDuGlossaire(glossaire),
  RACINE_CONTRATS,
];

/**
 * La population des extensions : celle de TOUT fichier suivi du dépôt, plus des formes que le dépôt
 * ne porte pas encore. Le vide est le fichier sans extension.
 */
function extensionsDeLaPopulation(): string[] {
  const suivies = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((c) => /\.([^./]+)$/.exec(c)?.[1] ?? '');
  const absentes = [
    'tsx',
    'mts',
    'cts',
    'mjs',
    'cjs',
    'js',
    'json',
    'jsonc',
    'html',
    'mdx',
    'txt',
    'yaml',
    'extensionlongue',
    '',
  ];
  return [...new Set([...suivies, ...absentes])];
}
/**
 * Les chemins d'une extension : le nom simple, un nom COMPOSÉ dont l'avant-dernière extension dirait
 * l'inverse, et un DOSSIER à point. L'exemption se lit sur la dernière extension du nom : ni
 * l'avant-dernière, ni celle d'un dossier ne la donnent.
 */
function cheminsSondes(racine: string, extension: string): string[] {
  if (extension === '') return [`${racine}sonde/fichier`, `${racine}v1.md/fichier`];
  const inverse = EXTENSIONS_QUI_CITENT.includes(extension) ? 'ts' : 'md';
  return [
    `${racine}sonde/fichier.${extension}`,
    `${racine}sonde/fichier.${inverse}.${extension}`,
    `${racine}v1.${inverse}/fichier.${extension}`,
  ];
}

/** Oracle du test : la portée de la famille des listes d'états, écrite une fois ici. */
const dansLesRacinesCode = (chemin: string): boolean =>
  RACINES_CODE.some((r) => chemin.startsWith(`${r}/`));

/** Posés par leur code : un retour chariot ou un séparateur écrit dans ce fichier le couperait lui-même. */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const AG = String.fromCharCode(96);

/** Le nombre de lignes neutres d'un GROS fichier : sa dernière ligne est la 20 001ᵉ. */
const LIGNES_DU_GROS = 20_000;

/** Plus d'un mébioctet et vingt mille lignes, puis `derniere` : au-delà de toute fenêtre qu'on écrirait. */
function gros(derniere: string): string {
  const texte =
    `ligne neutre é, assez longue pour que vingt mille lignes dépassent un mébioctet.${LF}`.repeat(
      LIGNES_DU_GROS
    ) + derniere;
  expect(Buffer.byteLength(texte, 'utf8')).toBeGreaterThanOrEqual(1024 * 1024);
  return texte;
}

/**
 * F6' — lancé depuis la racine d'un dépôt : la vue de `gov:check`, le texte que la garde a PARCOURU
 * et la lecture de `partners:schema:enums` sont confrontés, fichier par fichier et PAR EMPREINTE, aux
 * octets que le disque rend à ce test.
 */
function confronterAuDisque(): void {
  const disque = suivisEtOctets('.');
  const empreinte = (chemin: string): string => sha256(disque.get(chemin)!);
  const racines = racinesDeLaGarde(readFileSync('docs/GLOSSAIRE.md', 'utf8'));

  const vue = vueDuDepot();
  expect(vue.fichiers.map((f) => f.chemin).sort()).toEqual([...disque.keys()].sort());
  for (const f of vue.fichiers)
    expect('octets' in f ? sha256(f.octets) : f.erreur, f.chemin).toBe(empreinte(f.chemin));

  const { examines } = examiner(vue);
  expect(examines.map((x) => x.chemin).sort()).toEqual(
    [...disque.keys()].filter((c) => racines.some((r) => c.startsWith(r))).sort()
  );
  for (const x of examines) expect(x.empreinte, x.chemin).toBe(empreinte(x.chemin));

  const lus = vueDuVocabulaire().code;
  expect(lus.map((f) => f.chemin).sort()).toEqual(
    [...disque.keys()].filter(dansLesRacinesCode).sort()
  );
  for (const f of lus) expect(sha256(f.contenu), f.chemin).toBe(empreinte(f.chemin));
}

function depotJetable(prefixe: string, fichiers: Record<string, string | Uint8Array>): string {
  const depot = mkdtempSync(join(tmpdir(), prefixe));
  execFileSync('git', ['init', '-q'], { cwd: depot });
  poser(depot, {
    'docs/GLOSSAIRE.md': readFileSync('docs/GLOSSAIRE.md'),
    'docs/requirements.json': readFileSync('docs/requirements.json'),
    ...fichiers,
  });
  return depot;
}
function poser(depot: string, fichiers: Record<string, string | Uint8Array>): void {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(join(depot, dirname(chemin)), { recursive: true });
    writeFileSync(join(depot, chemin), contenu);
  }
  execFileSync('git', ['add', '-A'], { cwd: depot });
}

describe('REQ-INT-004 — la nomenclature des événements est LUE, jamais recopiée', () => {
  it('REQ-INT-004 : les sept types se lisent dans le texte de l’exigence', () => {
    const derives = typesEvenementDeLaReq(VUE_CONFORME.reqInt004);
    expect(derives).toHaveLength(7);
    expect(derives).toContain('paiement.rembourse');

    // Renversement : un type retiré d'une COPIE du texte disparaît de la dérivation.
    const ampute = VUE_CONFORME.reqInt004.replace(', `paiement.rembourse`', '');
    expect(typesEvenementDeLaReq(ampute)).toHaveLength(6);
    expect(typesEvenementDeLaReq(ampute)).not.toContain('paiement.rembourse');
  });

  it('REQ-INT-004 : `Invoice` et `Refund` sont dérivés de la clause de l’exigence', () => {
    const refuses = modelesRefusesDAxionia(VUE_CONFORME.reqInt004, VUE_CONFORME.glossaire);
    expect(refuses).toEqual(expect.arrayContaining(['Invoice', 'Refund']));

    const autre = VUE_CONFORME.reqInt004.replace('`Refund`', '`Booking`');
    expect(modelesRefusesDAxionia(autre, VUE_CONFORME.glossaire)).toContain('Booking');
  });

  it('REQ-INT-004 : chacune des DEUX sources réelles rend, seule, les modèles refusés', () => {
    // Sans ce contrôle, la perte de la clause de l'exigence serait muette : le glossaire la couvre.
    const reel = vueDuDepot();
    expect(modelesRefusesDAxionia(reel.reqInt004, '')).toEqual(
      expect.arrayContaining(['Invoice', 'Refund'])
    );
    expect(modelesRefusesDAxionia('', reel.glossaire)).toEqual(
      expect.arrayContaining(['Invoice', 'Refund'])
    );
  });

  it('REQ-INT-004 : un nom en anglais et un nom valide ne rougissent pas la même famille', () => {
    const anglais = familles(avecFichier('docs/adr/0011-temoin.md', 'devis.signed'));
    expect(anglais).toContain('evenement_hors_nomenclature');
    expect(anglais).not.toContain('evenement_litteral_hors_contrat');
  });
});

describe('REQ-DM-003 — la famille des listes d’états a UNE SEULE implémentation (RM-06)', () => {
  // `partners/ADR-0011` : les deux contrôles jugent les MÊMES entrées par les deux gardes.
  const ENTREES = [
    {
      chemin: 'prisma/migrations/0001_index/migration.sql',
      contenu: "WHERE statut IN ('provisoire','active')",
    },
    { chemin: 'src/server/x.ts', contenu: "if (s === 'provisoire' || s === 'active') return;" },
  ];

  it('REQ-DM-003 : gov:check ne porte PLUS la famille des listes d’états — ni dans FAMILLES, ni au verdict', () => {
    expect(FAMILLES.map((f) => f.nom)).not.toContain('liste_litterale_d_etats');
    for (const e of ENTREES) {
      expect(familles(avecFichier(e.chemin, e.contenu)), e.chemin).not.toContain(
        'liste_litterale_d_etats'
      );
    }
  });

  it('REQ-DM-003 : sur la même entrée, la seule implémentation rougit — la clause IN comme la forme booléenne', () => {
    for (const e of ENTREES) {
      expect(
        controlerVocabulaire({ ...VUE_VOCABULAIRE, code: [e] }).map((f) => f.famille),
        e.chemin
      ).toEqual(['liste_litterale_d_etats']);
    }
  });

  it('REQ-DM-003 : sa portée est une racine, jamais une extension — et tout fichier de la portée est jugé', () => {
    // Élargir les racines est un arbitrage du `gardien-spec` : `docs/REGLES-MAISON.md` (RM-01),
    // `docs/CONVENTIONS.md` §2 et `partners/ADR-0011` les nomment, et ce test rougit avant eux.
    expect([...RACINES_CODE], 'la portée a changé : les documents qui la nomment aussi').toEqual([
      'src',
      'prisma',
      'scripts',
    ]);
    const racines = [
      ...RACINES_CODE.map((r) => `${r}/`),
      'docs/',
      'messages/',
      'srcx/',
      RACINE_CONTRATS,
    ];
    for (const racine of racines) {
      for (const extension of extensionsDeLaPopulation()) {
        for (const chemin of cheminsSondes(racine, extension)) {
          const attendu = dansLesRacinesCode(chemin);
          expect(dansLaPorteeDesEtats(chemin), chemin).toBe(attendu);
          if (!attendu) continue;
          const code = [{ chemin, contenu: "const vivantes = ['provisoire', 'active'];" }];
          expect(
            controlerVocabulaire({ ...VUE_VOCABULAIRE, code }).map((f) => f.famille),
            chemin
          ).toEqual(['liste_litterale_d_etats']);
        }
      }
    }
  });

  it('REQ-DM-003 : la lecture de partners:schema:enums est l’ensemble des suivis de sa portée, chaque contenu à l’empreinte du disque', () => {
    confronterAuDisque();
  });

  it('REQ-DM-003 : partners:schema:enums juge la DERNIÈRE ligne d’un fichier de plus d’un mébioctet', () => {
    const chemin = 'scripts/lot/gros.js';
    const code = [{ chemin, contenu: gros("const vivantes = ['provisoire', 'active'];") }];
    expect(
      controlerVocabulaire({ ...VUE_VOCABULAIRE, code })
        .map((f) => f.message)
        .join(LF)
    ).toContain(`${chemin}:${LIGNES_DU_GROS + 1} — liste littérale d'états occupants`);
    const coupe = [{ chemin, contenu: gros(`const a = 1;${CR}const b = 2;`) }];
    expect(controlerVocabulaire({ ...VUE_VOCABULAIRE, code: coupe }).map((f) => f.famille)).toEqual(
      ['fin_de_ligne_non_lf']
    );
  });

  it('REQ-DM-003 : dépôt jetable — une liste d’états en .js, .json, .mts ou en dernière ligne d’un gros fichier rougit, et un CR seul est refusé', () => {
    const depot = depotJetable('g30-enums-', {
      'prisma/schema.prisma': readFileSync('prisma/schema.prisma'),
      'src/domain/attribution/etats.ts': readFileSync('src/domain/attribution/etats.ts'),
      'scripts/lot/neutre.js': gros('// fin'),
    });
    try {
      const propre = lancerDans(depot, resolve(SCRIPT_VOCABULAIRE));
      expect(propre.code, propre.sortie).toBe(0);

      const liste = `const vivantes = ['provisoire', 'active'];${LF}`;
      const appats = [
        'scripts/lot/requete.js',
        'scripts/lot/requete.json',
        'src/server/requete.mts',
      ];
      poser(depot, {
        ...Object.fromEntries(appats.map((c) => [c, liste])),
        'scripts/lot/gros.js': gros(liste),
        'scripts/lot/coupe.ts': `const a = 1;${CR}const b = 2;${LF}`,
      });
      const fautif = lancerDans(depot, resolve(SCRIPT_VOCABULAIRE));
      expect(fautif.code, fautif.sortie).toBe(1);
      for (const c of appats) expect(fautif.sortie).toContain(`[liste_litterale_d_etats] ${c}:1`);
      expect(fautif.sortie).toContain(
        `[liste_litterale_d_etats] scripts/lot/gros.js:${LIGNES_DU_GROS + 1}`
      );
      expect(fautif.sortie).toContain('[fin_de_ligne_non_lf] scripts/lot/coupe.ts:1');
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  }, 180_000);

  it('REQ-DM-003 : la conclusion « hors famille » de gov:check dérive du prédicat de la famille', () => {
    // Le dépôt réel, et une vue dont les racines couvrent chaque racine de la famille et d'autres :
    // une liste de racines retapée coïnciderait avec la première, pas avec la seconde.
    const synthetique: Vue = {
      ...VUE_CONFORME,
      racines: [...RACINES_CODE.map((r) => `${r}/`), `${RACINES_CODE[0]}/sous/`, 'docs/', 'srcx/'],
    };
    for (const vue of [vueDuDepot(), synthetique]) {
      const hors = perimetreDeLaVue(vue).racines.filter((r) => !dansLesRacinesCode(r));
      expect(decisionDeLaGarde(vue).lignes.join('\n')).toContain(
        `qui lit tout fichier suivi sous ${RACINES_CODE.map((r) => `${r}/`).join(', ')}. ` +
          `Racine(s) de cette garde hors de cette portée : ${hors.join(', ') || 'aucune'} —`
      );
    }
  });
});

describe('GOV-030 — synonymes interdits du glossaire', () => {
  it('REQ-INT-004 : les synonymes se LISENT dans le glossaire — amputé, il n’en garde plus', () => {
    const sansQualificateur: Vue = {
      ...VUE_CONFORME,
      glossaire: VUE_CONFORME.glossaire.replace('`qualificateur`', '`un_autre_terme`'),
      fichiers: [
        ...VUE_CONFORME.fichiers,
        fichierTexte('src/roles.ts', "const r = 'qualificateur';"),
      ],
    };
    expect(familles(sansQualificateur)).not.toContain('synonyme_interdit_du_glossaire');
  });

  it('REQ-INT-004 : un synonyme déclaré SOUS CONDITION n’est pas exercé, et la garde le DIT', () => {
    const conditionnels = synonymesDuGlossaire(VUE_CONFORME.glossaire).filter((s) => !s.exerce);
    expect(conditionnels.map((s) => s.terme)).toContain('actif');
    expect(decisionDeLaGarde(VUE_CONFORME).lignes.join('\n')).toMatch(/NON exercé[^\n]*actif/);
  });
});

describe('GOV-030 — les sources, et les fixtures ÉGALES aux sources réelles', () => {
  it('REQ-INT-004 : les fixtures de la preuve rendent ce que les sources réelles rendent', () => {
    const reel = vueDuDepot();
    expect(racinesDuGlossaire(VUE_CONFORME.glossaire)).toEqual(racinesDuGlossaire(reel.glossaire));
    expect(modelesRefusesDAxionia(VUE_CONFORME.reqInt004, VUE_CONFORME.glossaire).sort()).toEqual(
      modelesRefusesDAxionia(reel.reqInt004, reel.glossaire).sort()
    );
    expect(typesEvenementDeLaReq(VUE_CONFORME.reqInt004).sort()).toEqual(
      typesEvenementDeLaReq(reel.reqInt004).sort()
    );
    expect([...VUE_CONFORME.typesDuContrat].sort()).toEqual([...TYPES_EVENEMENT].sort());
    // Un synonyme et un nom d'événement que le champ `verifie` de `docs/gates.json` nomme : le
    // glossaire réel doit les rendre exercés.
    expect(
      synonymesDuGlossaire(reel.glossaire)
        .filter((s) => s.exerce)
        .map((s) => s.terme)
    ).toEqual(expect.arrayContaining(['qualificateur', 'payment.received']));
  });

  it('REQ-INT-004 : le contrat du dépôt et l’exigence disent la même chose', () => {
    expect([...TYPES_EVENEMENT].sort()).toEqual(
      typesEvenementDeLaReq(vueDuDepot().reqInt004).sort()
    );
  });

  it('REQ-DM-003 : le périmètre est LU dans l’en-tête du glossaire — quatre racines', () => {
    expect(racinesDuGlossaire(vueDuDepot().glossaire)).toEqual([
      'prisma/',
      'src/',
      'messages/',
      'docs/adr/',
    ]);

    const ampute = vueDuDepot().glossaire.replace(', `docs/adr/**`', '');
    expect(racinesDuGlossaire(ampute)).not.toContain('docs/adr/');
  });
});

describe('GOV-030 — ce que la garde a EXAMINÉ, confronté à une lecture indépendante', () => {
  it('REQ-INT-004 : la vue du dépôt porte TOUS les fichiers suivis, et elle comme le texte parcouru ont l’empreinte du disque', () => {
    confronterAuDisque();
  });

  it('REQ-INT-004 : population générée — tout fichier sous une racine est EXAMINÉ en entier, quelle que soit son extension', () => {
    const racines = racinesDeLaGarde(VUE_CONFORME.glossaire);
    const population = [...racines, 'docs/', 'scripts/', 'messagesx/'].flatMap((racine, r) =>
      extensionsDeLaPopulation().flatMap((extension, e) =>
        cheminsSondes(racine, extension).map((chemin) =>
          // Des tailles au-delà de 4 Kio, et des caractères sur plusieurs octets.
          fichierTexte(chemin, `ligne neutre é${LF}`.repeat(1 + ((r + e) % 3) * 200))
        )
      )
    );
    const vue: Vue = { ...VUE_CONFORME, fichiers: population };
    const octets = new Map(
      population.map((f) => [f.chemin, 'octets' in f ? f.octets : new Uint8Array()])
    );
    const attendus = [...octets]
      .filter(([chemin]) => racines.some((r) => chemin.startsWith(r)))
      .map(([chemin, o]) => ({ chemin, octets: o.length, empreinte: sha256(o) }))
      .sort((a, b) => a.chemin.localeCompare(b.chemin));
    const { fautes, examines } = examiner(vue);
    expect(fautes).toEqual([]);
    expect(
      examines
        .map((x) => ({ chemin: x.chemin, octets: x.octets, empreinte: x.empreinte }))
        .sort((a, b) => a.chemin.localeCompare(b.chemin))
    ).toEqual(attendus);

    const attendu = perimetreAttendu(octets, racines);
    const sortie = decisionDeLaGarde(vue).lignes.join(LF);
    expect(sortie).toContain(attendu.perimetre);
    expect(sortie).toContain(attendu.hors);
  });

  it('REQ-INT-004 : un fichier de plus d’un mébioctet est lu jusqu’à sa DERNIÈRE ligne sous chaque racine — un terme y rougit, un NUL ou un CR y est refusé', () => {
    for (const racine of racinesDeLaGarde(VUE_CONFORME.glossaire)) {
      const chemin = `${racine}sonde/gros.txt`;
      const texte = gros('le producteur emet payment.received');
      const { fautes, examines } = examiner(avecFichier(chemin, texte));
      expect(fautes.map((f) => f.message).join(LF), chemin).toContain(
        `${chemin}:${LIGNES_DU_GROS + 1} — « payment.received »`
      );
      expect(examines.find((x) => x.chemin === chemin)?.empreinte, chemin).toBe(sha256(texte));
    }
    const chemin = 'docs/adr/9989-gros.md';
    expect(familles(avecFichier(chemin, gros(String.fromCharCode(0))))).toEqual([
      'contenu_illisible',
    ]);
    expect(familles(avecFichier(chemin, gros(`a${CR}b`)))).toEqual(['fin_de_ligne_non_lf']);
  });

  it('REQ-INT-004 : en code, toute extension qui ne cite pas laisse rougir un terme entre accents graves ou guillemets — nom composé et dossier à point compris', () => {
    for (const extension of extensionsDeLaPopulation().filter(
      (e) => !EXTENSIONS_QUI_CITENT.includes(e)
    )) {
      for (const chemin of cheminsSondes('src/', extension)) {
        for (const contenu of [`${AG}payment.received${AG}`, '« payment.received »']) {
          expect(familles(avecFichier(chemin, contenu)), `${chemin} : ${contenu}`).toContain(
            'evenement_hors_nomenclature'
          );
        }
      }
    }
  });

  it('REQ-INT-004 : une extension qui cite exempte sa citation quand elle est la DERNIÈRE du nom, composé ou non', () => {
    // La même ligne cite dans les trois grammaires : span en prose, commentaire SQL, commentaire à barres.
    const citation = `-- // ${AG}payment.received${AG}`;
    for (const extension of EXTENSIONS_QUI_CITENT) {
      for (const chemin of cheminsSondes('prisma/', extension)) {
        expect(familles(avecFichier(chemin, citation)), chemin).toEqual([]);
      }
    }
  });

  it('REQ-INT-004 : les racines vides sont nommées', () => {
    expect(decisionDeLaGarde(VUE_CONFORME).lignes.join('\n')).toContain(
      'Racine(s) VIDE(S) : prisma/, messages/, docs/adr/, packages/contracts/'
    );
  });
});

describe('GOV-030 — une ligne est ce que LF termine : toute autre fin de ligne qu’un consommateur coupe est REFUSÉE', () => {
  /**
   * Les trois formes où une fin de ligne que la garde ne coupait pas faisait couvrir, par un commentaire
   * ou une citation, une instruction, une déclaration ou un paragraphe : PostgreSQL, Prisma et
   * CommonMark coupent au CR seul. `ligne` est celle du terme quand LF sépare.
   */
  const COUVERTURES = [
    {
      chemin: 'prisma/migrations/0005_cr/migration.sql',
      lignes: [
        `-- ouvre ${AG}`,
        "UPDATE evenements SET type = 'payment.received';",
        `-- ferme ${AG}`,
      ],
      famille: 'evenement_hors_nomenclature',
      ligne: 2,
    },
    {
      chemin: 'prisma/cr.prisma',
      lignes: [`/// ouvre ${AG}`, 'model Invoice {', '  id String @id', '}', `/// ferme ${AG}`],
      famille: 'terme_axionia_invalide',
      ligne: 2,
    },
    {
      chemin: 'docs/adr/9990-cr.md',
      lignes: [
        `un paragraphe ouvre ${AG}`,
        '',
        'le producteur emet payment.received',
        '',
        `et un autre referme ${AG}`,
      ],
      famille: 'evenement_hors_nomenclature',
      ligne: 3,
    },
  ];

  it('REQ-INT-004 : la règle — LF et CRLF sont des fins de ligne ; CR seul, U+2028 et U+2029 sont nommés avec leur ligne', () => {
    expect(finDeLigneEtrangere(`a${CR}${LF}b${LF}c`)).toBeUndefined();
    expect(finDeLigneEtrangere(`a${String.fromCharCode(0x85)}b`)).toBeUndefined();
    expect(finDeLigneEtrangere(`a${LF}b${CR}c`)).toEqual({ ligne: 2, code: 'U+000D' });
    expect(finDeLigneEtrangere(`a${LF}${LF}b${String.fromCharCode(0x2028)}`)).toEqual({
      ligne: 3,
      code: 'U+2028',
    });
    expect(finDeLigneEtrangere(`${String.fromCharCode(0x2029)}`)).toEqual({
      ligne: 1,
      code: 'U+2029',
    });
    expect(finDeLigneEtrangere(`a${CR}`)).toEqual({ ligne: 1, code: 'U+000D' });
  });

  it('REQ-INT-004 : les trois couvertures rougissent en LF et en CRLF sur le terme, et sont REFUSÉES au CR seul', () => {
    for (const c of COUVERTURES) {
      for (const separateur of [LF, `${CR}${LF}`]) {
        const fautes = controler(avecFichier(c.chemin, c.lignes.join(separateur)));
        expect(
          fautes.map((f) => f.famille),
          c.chemin
        ).toEqual([c.famille]);
        expect(fautes[0]!.message).toContain(`${c.chemin}:${c.ligne} —`);
      }
      const coupe = controler(avecFichier(c.chemin, c.lignes.join(CR)));
      expect(
        coupe.map((f) => f.famille),
        c.chemin
      ).toEqual(['fin_de_ligne_non_lf']);
      expect(coupe[0]!.message).toContain(`${c.chemin}:1 — `);
    }
  });

  it('REQ-INT-004 : un séparateur Unicode dans le code, et une fin de ligne étrangère dans une SOURCE, sont refusés en les nommant', () => {
    for (const code of [0x2028, 0x2029]) {
      const fautes = controler(
        avecFichier(
          'src/server/separateur.ts',
          `// note${String.fromCharCode(code)}export const x = 1;`
        )
      );
      expect(fautes.map((f) => f.famille)).toEqual(['fin_de_ligne_non_lf']);
      expect(fautes[0]!.message).toContain(`U+${code.toString(16).toUpperCase()}`);
    }
    for (const [source, vue] of [
      ['REQ-INT-004', { ...VUE_CONFORME, reqInt004: `${VUE_CONFORME.reqInt004}${CR}suite` }],
      ['docs/GLOSSAIRE.md', { ...VUE_CONFORME, glossaire: `${VUE_CONFORME.glossaire}${CR}suite` }],
    ] as const) {
      const fautes = controler(vue).filter((f) => f.famille === 'fin_de_ligne_non_lf');
      expect(fautes.map((f) => f.message).join(LF), source).toContain(`${source}:`);
    }
  });

  it('REQ-DM-003 : partners:schema:enums applique la MÊME règle — un CR seul dans le schéma y cacherait une colonne en chaîne', () => {
    const modele = ['model Attribution {', '  id     String @id', '  statut String', '}', ''];
    for (const separateur of [LF, `${CR}${LF}`]) {
      const schema = VUE_VOCABULAIRE.schema + modele.join(separateur);
      expect(controlerVocabulaire({ ...VUE_VOCABULAIRE, schema }).map((f) => f.famille)).toEqual([
        'colonne_vocabulaire_en_chaine',
      ]);
    }
    const coupe = VUE_VOCABULAIRE.schema + modele.join(CR);
    expect(
      controlerVocabulaire({ ...VUE_VOCABULAIRE, schema: coupe }).map((f) => f.famille)
    ).toEqual(['fin_de_ligne_non_lf']);
    for (const champ of ['reqDm003', 'glossaire', 'etatsSource'] as const) {
      const vue = { ...VUE_VOCABULAIRE, [champ]: `${VUE_VOCABULAIRE[champ]}${CR}suite` };
      expect(
        controlerVocabulaire(vue).map((f) => f.famille),
        champ
      ).toContain('fin_de_ligne_non_lf');
    }
  });
});

describe('GOV-030 — la preuve : population du SEUL registre, décision PURE', () => {
  const registre = (): string => readFileSync('docs/gates.json', 'utf8');
  const entrees = () => entreesDeLaPreuve(registre());

  /** Le registre réel, amputé d'un nom dans UNE liste du champ `verifie` de `gov:check`. */
  function registreAmpute(etiquette: string, nom: string): string {
    const r = JSON.parse(registre()) as { gates: { id: string; verifie: string }[] };
    const entree = r.gates.find((g) => g.id === 'gov:check')!;
    const avant = entree.verifie;
    entree.verifie = avant.replace(
      new RegExp(`(${etiquette}\\s*:\\s*)([a-z0-9_,\\s]+?)(\\s*(?:;|$))`),
      (_m, tete: string, liste: string, fin: string) =>
        tete +
        liste
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== nom)
          .join(', ') +
        fin
    );
    expect(entree.verifie, `« ${nom} » introuvable sous « ${etiquette} »`).not.toBe(avant);
    return JSON.stringify(r);
  }

  it('sur le registre réel la décision est 0, et `--prove` sort de CETTE décision', () => {
    const decision = decisionDeLaPreuve(entrees());
    expect(decision.code, decision.lignes.join('\n')).toBe(0);
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(decision.lignes[0]);
  });

  it('RÉCIPROQUE, sur TOUS les témoins : en retirer un du CODE découvre SA clé et rend 1', () => {
    const population = populationDuRegistre(registre());
    expect(population.temoins).toHaveLength(TEMOINS.length);
    for (const t of TEMOINS) {
      const reste = TEMOINS.filter((x) => x !== t);
      const { manque } = ecartsDePopulation(population, { ...entrees(), temoins: reste });
      expect(manque, `retirer « ${t.id} » doit découvrir sa clé`).toContain(t.id);
      expect(decisionDeLaPreuve({ ...entrees(), temoins: reste }).code, t.id).toBe(1);
    }
  });

  it('la population des témoins vient du SEUL registre : chacun, retiré du registre seul, rend 1 en le NOMMANT', () => {
    for (const t of TEMOINS) {
      const decision = decisionDeLaPreuve({
        ...entrees(),
        registre: registreAmpute('temoins', t.id),
      });
      expect(decision.code, t.id).toBe(1);
      expect(decision.lignes.join('\n')).toContain(
        `témoins : le code et docs/gates.json ont divergé — dans le code seulement : ${t.id} ;`
      );
    }
  });

  it('les extensions qui citent sont ancrées au registre dans les deux sens, et la phrase imprimée en dérive', () => {
    expect(populationDuRegistre(registre()).citent).toEqual([...EXTENSIONS_QUI_CITENT]);
    for (const extension of EXTENSIONS_QUI_CITENT) {
      const retiree = decisionDeLaPreuve({
        ...entrees(),
        registre: registreAmpute('extensions qui citent', extension),
      });
      expect(retiree.code, extension).toBe(1);
      expect(retiree.lignes.join('\n')).toContain(`dans le code seulement : ${extension} ;`);
    }
    const ajoutee = decisionDeLaPreuve({
      ...entrees(),
      citent: [...EXTENSIONS_QUI_CITENT, 'json'],
    });
    expect(ajoutee.code).toBe(1);
    expect(ajoutee.lignes.join('\n')).toContain('dans le code seulement : json ;');
    expect(decisionDeLaGarde(VUE_CONFORME).lignes.join('\n')).toContain(
      `seules ${EXTENSIONS_QUI_CITENT.map((e) => `.${e}`).join(', ')} accordent une exemption de citation`
    );
  });

  it('une famille retirée du CODE seul rend 1 en la NOMMANT', () => {
    const [retiree, ...reste] = entrees().familles;
    const decision = decisionDeLaPreuve({ ...entrees(), familles: reste });
    expect(decision.code).toBe(1);
    expect(decision.lignes.join('\n')).toContain(`au registre seulement : ${retiree}`);
  });

  it('un refus retiré du REGISTRE seul rend ses témoins ORPHELINS', () => {
    const population = populationDuRegistre(registre());
    const [retire, ...reste] = population.refus;
    const ecarts = ecartsDePopulation({ ...population, refus: reste }, entrees());
    expect(ecarts.orphelins.join('\n')).toContain(cleDeCouverture('source_illisible', retire));
    expect(ecarts.divergences.join('\n')).toContain(`dans le code seulement : ${retire}`);
  });

  it('un registre muet, en double ou illisible est un REFUS, jamais une population vide', () => {
    const muet = JSON.stringify({ gates: [{ id: 'gov:check', verifie: 'termes interdits' }] });
    expect(() => populationDuRegistre(muet)).toThrow(/ne nomme aucun/);
    const double = JSON.stringify({
      gates: [
        { id: 'gov:check', verifie: 'x' },
        { id: 'gov:check', verifie: 'y' },
      ],
    });
    expect(() => populationDuRegistre(double)).toThrow(/2 entrée/);

    const illisible = decisionDeLaPreuve({ ...entrees(), registre: new Error('ENOENT') });
    expect(illisible.code).toBe(1);
    expect(illisible.lignes.join('\n')).toContain('ILLISIBLE');
  });

  it('un témoin qui ne MORD pas ne couvre rien : vue muette, autre famille, AUTRE REFUS', () => {
    const muet: Temoin = {
      id: 'muet',
      famille: 'synonyme_interdit_du_glossaire',
      quoi: 'muet',
      vue: () => VUE_CONFORME,
    };
    const autreFamille: Temoin = {
      id: 'autre_famille',
      famille: 'synonyme_interdit_du_glossaire',
      quoi: 'rougit pour une autre famille',
      vue: temoin('modele_dans_le_code').vue,
    };
    // Même famille, refus différent : ce contrat perd des noms mais n'est pas VIDE.
    const autreRefus: Temoin = {
      id: 'autre_refus',
      famille: 'source_illisible',
      refus: 'contrat_sans_evenement',
      quoi: 'rougit pour un autre refus',
      vue: temoin('contrat_et_exigence_divergents').vue,
    };
    for (const t of [muet, autreFamille, autreRefus]) {
      const rapport = eprouver([t]);
      expect(rapport.couvertes.size, t.quoi).toBe(0);
      expect(rapport.sansMorsure, t.quoi).toEqual([t]);
    }
    const decision = decisionDeLaPreuve({ ...entrees(), temoins: [...TEMOINS, autreRefus] });
    expect(decision.code).toBe(1);
    expect(decision.lignes.join('\n')).toContain("(autre_refus) n'a PAS fait rougir");
  });

  it('un contre-témoin qui rougit rend 1 : faux positif nommé', () => {
    const decision = decisionDeLaPreuve({
      ...entrees(),
      contreTemoins: [...CONTRE_TEMOINS, { quoi: 'appât', vue: temoin('modele_dans_le_code').vue }],
    });
    expect(decision.code).toBe(1);
    expect(decision.lignes.join('\n')).toContain('Faux positif : « appât »');
  });

  it('zéro témoin ne couvre RIEN — la population du registre reste entière', () => {
    const population = populationDuRegistre(registre());
    const { manque } = ecartsDePopulation(population, { ...entrees(), temoins: [] });
    expect(manque).toHaveLength(
      population.familles.length + population.refus.length + population.temoins.length
    );
  });
});

describe('GOV-030 — la garde : décision PURE, et sortie vue sur de vrais dépôts', () => {
  it('REQ-INT-004 : une vue fautive rend 1 ; le dépôt rend 0 et la ligne de commande imprime les comptes de git et du disque', () => {
    expect(decisionDeLaGarde(temoin('modele_dans_le_code').vue()).code).toBe(1);
    const reel = decisionDeLaGarde(vueDuDepot());
    expect(reel.code, reel.lignes.join('\n')).toBe(0);
    const { code, sortie } = lancer();
    expect(code).toBe(0);
    expect(sortie).toContain(reel.lignes[0]);
    const attendu = perimetreAttendu(
      suivisEtOctets('.'),
      racinesDeLaGarde(readFileSync('docs/GLOSSAIRE.md', 'utf8'))
    );
    expect(sortie).toContain(attendu.perimetre);
    expect(sortie).toContain(attendu.hors);
  });

  it('REQ-INT-004 : dépôt jetable — comptes de git et octets du disque quelle que soit l’extension, puis 1 avec ou sans extension', () => {
    const neutre = 'ligne neutre é\n';
    const depot = depotJetable('g30-lu-', {
      'src/rien.ts': 'export const rien = true;\n',
      'src/composant.tsx': neutre,
      'src/emails/bienvenue.html': neutre,
      'src/LISEZMOI': neutre,
      'src/avec-bom.ts': Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from(neutre)]),
      'messages/fr.json': '{ "titre": "Bienvenue" }\n',
      'docs/adr/0099-gros.md': gros('la fin du document'),
      'scripts/hors.js': neutre,
    });
    try {
      const propre = lancerDans(depot, resolve(SCRIPT));
      expect(propre.code, propre.sortie).toBe(0);
      const attendu = perimetreAttendu(
        suivisEtOctets(depot),
        racinesDeLaGarde(readFileSync('docs/GLOSSAIRE.md', 'utf8'))
      );
      expect(propre.sortie).toContain(attendu.perimetre);
      expect(propre.sortie).toContain(attendu.hors);

      // Le terme en DERNIÈRE ligne d'un fichier de plus d'un mébioctet : aucune fenêtre ne le verrait.
      poser(depot, { 'docs/adr/0100-appat.md': gros(`le producteur emet payment.received${LF}`) });
      for (const script of [resolve(SCRIPT), resolve(SCRIPT).replace(/\.ts$/, '')]) {
        const fautif = lancerDans(depot, script);
        expect(fautif.code, `${script}\n${fautif.sortie}`).toBe(1);
        expect(fautif.sortie).toContain(
          `[evenement_hors_nomenclature] docs/adr/0100-appat.md:${LIGNES_DU_GROS + 1}`
        );
      }
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  }, 180_000);

  it('REQ-INT-004 : dépôt jetable — un contenu que la garde ne lit pas en entier est REFUSÉ en le nommant', () => {
    const depot = depotJetable('g30-il-', { 'src/rien.ts': 'export const rien = true;\n' });
    try {
      const propre = lancerDans(depot, resolve(SCRIPT));
      expect(propre.code, propre.sortie).toBe(0);

      const utf16 = Uint8Array.from(
        [...'le producteur emet payment.received'].flatMap((c) => [c.charCodeAt(0), 0])
      );
      poser(depot, {
        'src/content/page.txt': utf16,
        'docs/adr/0101-latin1.md': Uint8Array.from([0x72, 0xe9, 0x73, 0x75, 0x6d, 0xe9, 0x0a]),
        'prisma/migrations/0002_cr/migration.sql': `-- ouvre ${AG}${CR}UPDATE evenements SET type = 'payment.received';${CR}-- ferme ${AG}${LF}`,
      });
      const sousModule = join(depot, 'src/sous-module');
      mkdirSync(sousModule, { recursive: true });
      const git = (args: string[]) =>
        execFileSync(
          'git',
          ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
          {
            cwd: sousModule,
            stdio: 'pipe',
          }
        );
      git(['init', '-q']);
      writeFileSync(join(sousModule, 'x.txt'), 'x\n');
      git(['add', '-A']);
      git(['commit', '-q', '-m', 'x']);
      execFileSync('git', ['add', '-A'], { cwd: depot, stdio: 'pipe' });

      const fautif = lancerDans(depot, resolve(SCRIPT));
      expect(fautif.code, fautif.sortie).toBe(1);
      for (const chemin of ['src/content/page.txt', 'docs/adr/0101-latin1.md', 'src/sous-module']) {
        expect(fautif.sortie, fautif.sortie).toContain(`[contenu_illisible] ${chemin}`);
      }
      expect(fautif.sortie).toContain(
        '[fin_de_ligne_non_lf] prisma/migrations/0002_cr/migration.sql:1'
      );
      // Trois illisibles et un coupé : le compte imprimé est celui des fichiers refusés sans être jugés.
      expect(fautif.sortie).toContain('; 4 refusé(s) sans être jugé(s)');
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  }, 180_000);

  it('REQ-INT-004 : dépôt jetable lu dans CE processus — vue, texte parcouru et lecture de partners:schema:enums ont l’empreinte du disque, fichier par fichier', () => {
    const racines = racinesDeLaGarde(readFileSync('docs/GLOSSAIRE.md', 'utf8'));
    const fichiers: Record<string, string | Uint8Array> = {
      'prisma/schema.prisma': readFileSync('prisma/schema.prisma'),
      'src/domain/attribution/etats.ts': readFileSync('src/domain/attribution/etats.ts'),
      'docs/adr/0098-gros.md': gros('la fin du document'),
      'scripts/lot/gros.js': gros('// la fin du script'),
    };
    for (const racine of [...racines, 'scripts/', 'docs/']) {
      for (const extension of extensionsDeLaPopulation()) {
        for (const chemin of cheminsSondes(racine, extension))
          fichiers[chemin] = `ligne neutre é${LF}`.repeat(2);
      }
    }
    const depot = depotJetable('g30-ep-', fichiers);
    const ici = process.cwd();
    try {
      process.chdir(depot);
      confronterAuDisque();
      expect(examiner(vueDuDepot()).fautes).toEqual([]);
    } finally {
      process.chdir(ici);
      rmSync(depot, { recursive: true, force: true });
    }
  }, 180_000);
});
