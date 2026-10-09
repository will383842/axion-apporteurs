// @req REQ-DM-003
// @req REQ-INT-004
/**
 * `grammaire-des-zones-de-prose.spec.ts` — LA GRAMMAIRE qui découpe SQL, Prisma et prose pour la garde
 * `gov:termes-interdits`, éprouvée sur les constructions VALIDES des trois langages.
 *
 * POURQUOI. L'exemption de citation ne vaut que dans une zone que la garde a reconnue : un commentaire
 * SQL ou Prisma, un bloc ou un span de code, des guillemets français. Une grammaire qui ignore une
 * construction valide ouvre une zone là où le consommateur n'en voit pas, et un terme interdit passe :
 *   — SQL : un marqueur de commentaire DANS une chaîne, un identifiant cité, une chaîne à dollars, une
 *     chaîne échappée `E'…'`, un commentaire de bloc IMBRIQUÉ (PostgreSQL les imbrique) ;
 *   — Prisma : `//` dans une chaîne (une URL) ;
 *   — prose : un accent grave ouvert dans un TITRE, un span sur plusieurs lignes d'un paragraphe, des
 *     suites d'accents graves de longueurs différentes, un accent grave échappé, une « clôture » que le
 *     rendu CommonMark ne voit pas.
 * Chaque témoin est ROUGE et nomme fichier ET ligne ; chaque contre-témoin est VERT. Une construction
 * jamais refermée est REFUSÉE en la nommant, jamais traversée. La garde imprime le compte des zones
 * qu'elle a réellement découpées.
 *
 * Les restes joints : la garde juge le BLOB de l'index (un fichier déclaré inchangé ne sort plus vert
 * en local), la preuve n'éprouve chaque témoin qu'UNE fois, et la troncature de la sortie est bornée
 * par une constante éprouvée des deux côtés.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as garde from '../../../scripts/gates/gov-check';
import type { Vue } from '../../../scripts/gates/gov-check';

const SCRIPT = resolve('scripts/gates/gov-check.ts');
const TSX = resolve('node_modules/tsx/dist/cli.mjs');
const LF = String.fromCharCode(10);
const AG = String.fromCharCode(96);
const AG3 = AG.repeat(3);
const BS = String.fromCharCode(92);

/** La vue conforme, plus un seul fichier. */
const avec = (chemin: string, texte: string): Vue => ({
  ...garde.VUE_CONFORME,
  fichiers: [...garde.VUE_CONFORME.fichiers, garde.fichierTexte(chemin, texte)],
});

type Cas = { id: string; chemin: string; lignes: string[] };
type Rouge = Cas & { famille: string; ligne: number };

/** Chaque témoin porte UN terme interdit, dans une zone que la grammaire NE doit PAS exempter. */
const ROUGES: Rouge[] = [
  {
    id: 'sql_tirets_dans_une_chaine',
    chemin: 'prisma/migrations/0009_chaine/migration.sql',
    lignes: [
      '-- Seed du gabarit de relance.',
      `INSERT INTO gabarits (cle, corps) VALUES ('relance', '-- note : ${AG}payment.received${AG} relance');`,
    ],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'sql_bloc_ouvert_dans_une_chaine',
    chemin: 'prisma/migrations/0010_bloc/migration.sql',
    lignes: [
      "INSERT INTO gabarits (cle, corps) VALUES ('motif', '/*');",
      `UPDATE evenements SET type = '${AG}payment.received${AG}' WHERE id = 1;`,
      "INSERT INTO gabarits (cle, corps) VALUES ('fin', '*/');",
    ],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'sql_bloc_imbrique_referme',
    chemin: 'prisma/migrations/0011_imbrique/migration.sql',
    lignes: [
      `/* niveau 1 /* niveau 2 */ -- fin du niveau 1 */ UPDATE evenements SET type = '${AG}payment.received${AG}';`,
    ],
    famille: 'evenement_hors_nomenclature',
    ligne: 1,
  },
  {
    id: 'sql_terme_nu_dans_un_bloc_imbrique',
    chemin: 'prisma/migrations/0012_imbrique_nu/migration.sql',
    lignes: [
      '/* niveau 1 /* niveau 2 */',
      'le producteur emet payment.received',
      '*/',
      'SELECT 1;',
    ],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'sql_chaine_a_dollars',
    chemin: 'prisma/migrations/0013_dollars/migration.sql',
    lignes: [`DO $corps$ BEGIN RAISE NOTICE '-- ${AG}payment.received${AG}'; END $corps$;`],
    famille: 'evenement_hors_nomenclature',
    ligne: 1,
  },
  {
    id: 'sql_chaine_echappee',
    chemin: 'prisma/migrations/0014_echappee/migration.sql',
    lignes: [`INSERT INTO t VALUES (E'l${BS}'appel -- ${AG}payment.received${AG}');`],
    famille: 'evenement_hors_nomenclature',
    ligne: 1,
  },
  {
    id: 'sql_identifiant_cite',
    chemin: 'prisma/migrations/0015_identifiant/migration.sql',
    lignes: [`SELECT "a -- b" AS x, '${AG}payment.received${AG}' AS y;`],
    famille: 'evenement_hors_nomenclature',
    ligne: 1,
  },
  {
    id: 'prisma_url_dans_une_chaine',
    chemin: 'prisma/url.prisma',
    lignes: [
      'model Facture {',
      '  id  String @id',
      `  url String @default("https://exemple.fr/${AG}Invoice${AG}")`,
      '}',
    ],
    famille: 'terme_axionia_invalide',
    ligne: 3,
  },
  {
    id: 'prisma_guillemet_echappe',
    chemin: 'prisma/echappe.prisma',
    lignes: [
      'model Facture {',
      `  note String @default("dit ${BS}"// ${AG}Invoice${AG}${BS}" ici")`,
      '}',
    ],
    famille: 'terme_axionia_invalide',
    ligne: 2,
  },
  {
    id: 'prose_accent_grave_ouvert_dans_un_titre',
    chemin: 'docs/adr/9001-titre.md',
    lignes: [
      `# Le contrat ${AG} des événements`,
      `le producteur emet payment.received ${AG} a la signature`,
    ],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'prose_span_multiligne_mal_apparie',
    chemin: 'docs/adr/9002-multiligne.md',
    lignes: [
      `un span ${AG}ouvert ici`,
      'continue',
      `et ferme${AG} puis le producteur emet payment.received ${AG}x`,
      `y${AG}`,
    ],
    famille: 'evenement_hors_nomenclature',
    ligne: 3,
  },
  {
    id: 'prose_info_de_bloc_a_accent_grave',
    chemin: 'docs/adr/9003-info.md',
    lignes: [`${AG3}js${AG}x${AG}`, 'le producteur emet payment.received', AG3],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'prose_cloture_indentee_de_quatre',
    chemin: 'docs/adr/9004-indente.md',
    lignes: [`    ${AG3}`, 'le producteur emet payment.received', `    ${AG3}`],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'prose_rangees_de_tableau_sans_barre_initiale',
    chemin: 'docs/adr/9007-tableau.md',
    lignes: [`a | ${AG}b`, '--- | ---', `payment.received | c${AG}`],
    famille: 'evenement_hors_nomenclature',
    ligne: 3,
  },
  {
    id: 'prose_deux_items_de_liste',
    chemin: 'docs/adr/9008-liste.md',
    lignes: [`- a ${AG}b`, `- payment.received c${AG}`],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'prose_citation_markdown_interrompt_le_paragraphe',
    chemin: 'docs/adr/9010-citation.md',
    lignes: [`a ${AG}b`, `> payment.received c${AG}`],
    famille: 'evenement_hors_nomenclature',
    ligne: 2,
  },
  {
    id: 'prose_titre_souligne',
    chemin: 'docs/adr/9009-souligne.md',
    lignes: [`a ${AG}b`, '---', `payment.received c${AG}`],
    famille: 'evenement_hors_nomenclature',
    ligne: 3,
  },
  {
    id: 'prose_longueurs_inegales',
    chemin: 'docs/adr/9005-longueurs.md',
    lignes: [`le producteur emet ${AG}${AG}payment.received${AG} a la signature`],
    famille: 'evenement_hors_nomenclature',
    ligne: 1,
  },
  {
    id: 'prose_accent_grave_echappe',
    chemin: 'docs/adr/9006-echappe.md',
    lignes: [`le producteur emet ${BS}${AG}payment.received${AG} a la signature`],
    famille: 'evenement_hors_nomenclature',
    ligne: 1,
  },
];

/** Chaque contre-témoin porte un terme interdit DANS une zone que le consommateur reconnaît. */
const VERTS: Cas[] = [
  {
    id: 'sql_citation_dans_un_bloc_imbrique',
    chemin: 'prisma/migrations/0020_imbrique/migration.sql',
    lignes: [`/* niveau 1 /* niveau 2 */ encore commenté : ${AG}Invoice${AG} */`, 'SELECT 1;'],
  },
  {
    id: 'sql_commentaire_apres_une_chaine_a_tirets',
    chemin: 'prisma/migrations/0021_apres/migration.sql',
    lignes: [`INSERT INTO t VALUES ('-- rien'); -- ${AG}payment.received${AG} est refusé`],
  },
  {
    id: 'sql_commentaire_apres_une_chaine_a_dollars',
    chemin: 'prisma/migrations/0022_dollars/migration.sql',
    lignes: [`DO $$ BEGIN PERFORM 'x'; END $$; -- ${AG}payment.received${AG}`],
  },
  {
    id: 'sql_apostrophe_dans_un_commentaire',
    chemin: 'prisma/migrations/0023_apostrophe/migration.sql',
    lignes: [
      `-- c'est ${AG}payment.received${AG} que l'on écarte`,
      `/* l'ancien ${AG}Invoice${AG} */ SELECT 1;`,
    ],
  },
  {
    id: 'prisma_commentaire_apres_une_url',
    chemin: 'prisma/lien.prisma',
    lignes: [
      'model Lien {',
      `  url String @default("https://exemple.fr") // ${AG}Invoice${AG} a disparu`,
      '}',
    ],
  },
  {
    id: 'prose_span_sur_trois_lignes',
    chemin: 'docs/adr/9010-trois.md',
    lignes: [`la table porte ${AG}{source,`, 'eventId,', `payment.received}${AG} en entier`],
  },
  {
    id: 'prose_span_double_contenant_un_simple',
    chemin: 'docs/adr/9011-double.md',
    lignes: [`le nom ${AG}${AG}payment.received ${AG} suffixe${AG}${AG} est refusé`],
  },
  {
    id: 'prose_blocs_emboites',
    chemin: 'docs/adr/9012-emboites.md',
    // La clôture intérieure, plus courte, ne ferme pas le bloc extérieur : ce qui la suit y reste.
    lignes: [`${AG}${AG3}md`, `${AG3}ts`, 'x', AG3, 'const f: Invoice = lire();', `${AG}${AG3}`],
  },
  {
    id: 'prose_cloture_a_info_ne_ferme_pas',
    chemin: 'docs/adr/9013-info.md',
    lignes: [
      AG3,
      'le contre-exemple :',
      `${AG3} fin`,
      'le producteur emettait payment.received',
      AG3,
    ],
  },
  {
    id: 'prose_bloc_a_tildes',
    chemin: 'docs/adr/9014-tildes.md',
    lignes: ['~~~', 'le producteur emettait payment.received', '~~~'],
  },
  {
    id: 'prose_titre_a_span_ferme',
    chemin: 'docs/adr/9015-titre.md',
    lignes: [`# Le nom ${AG}payment.received${AG} est refusé`, '', 'la suite'],
  },
  {
    id: 'prose_citation_markdown_sur_deux_lignes',
    chemin: 'docs/adr/9016-citation.md',
    lignes: [`> la table ${AG}{source,`, `> payment.received}${AG} en entier`],
  },
];

/** Les constructions jamais refermées : REFUSÉES en les nommant, et le fichier jugé SANS exemption. */
const NON_RECONNUES: (Cas & { ligne: number; construction: RegExp })[] = [
  {
    id: 'sql_chaine_jamais_refermee',
    chemin: 'prisma/migrations/0030_ouverte/migration.sql',
    lignes: ["INSERT INTO t VALUES ('ouverte);", `-- ${AG}payment.received${AG}`],
    ligne: 1,
    construction: /chaîne entre apostrophes/,
  },
  {
    id: 'sql_bloc_imbrique_jamais_referme',
    chemin: 'prisma/migrations/0031_bloc/migration.sql',
    lignes: ['/* niveau 1 /* niveau 2 */', 'SELECT 1;'],
    ligne: 1,
    construction: /commentaire de bloc/,
  },
  {
    id: 'sql_dollars_jamais_refermes',
    chemin: 'prisma/migrations/0032_dollars/migration.sql',
    lignes: ['DO $corps$ BEGIN', 'END;'],
    ligne: 1,
    construction: /chaîne à dollars/,
  },
  {
    id: 'prisma_chaine_jamais_refermee',
    chemin: 'prisma/ouverte.prisma',
    // La chaîne ne franchit pas sa ligne : le guillemet de la suivante ne la referme pas.
    lignes: [
      'model Lien {',
      '  url String @default("https://exemple.fr)',
      '  nom String @default("x")',
      '}',
    ],
    ligne: 2,
    construction: /chaîne entre guillemets/,
  },
];

describe('REQ-DM-003, REQ-INT-004 — la grammaire reconnaît les constructions valides des trois langages', () => {
  it.each(ROUGES)(
    'REQ-DM-003, REQ-INT-004 : témoin ROUGE $id — la garde nomme le fichier et la ligne',
    (t) => {
      const fautes = garde.controler(avec(t.chemin, t.lignes.join(LF)));
      expect(
        fautes.map((f) => f.famille),
        fautes.map((f) => f.message).join(LF)
      ).toEqual([t.famille]);
      expect(fautes[0]!.message).toContain(`${t.chemin}:${t.ligne} —`);
    }
  );

  it.each(VERTS)('REQ-DM-003, REQ-INT-004 : contre-témoin VERT $id', (c) => {
    const fautes = garde.controler(avec(c.chemin, c.lignes.join(LF)));
    expect(fautes.map((f) => f.message)).toEqual([]);
  });

  it.each(NON_RECONNUES)(
    'REQ-DM-003, REQ-INT-004 : $id — REFUSÉE en nommant la construction et sa ligne, jamais traversée',
    (n) => {
      const fautes = garde.controler(avec(n.chemin, n.lignes.join(LF)));
      const refus = fautes.filter((f) => f.famille === 'contenu_illisible');
      expect(refus, fautes.map((f) => f.message).join(LF)).toHaveLength(1);
      expect(refus[0]!.message).toContain(`${n.chemin}:${n.ligne} —`);
      expect(refus[0]!.message).toMatch(n.construction);
    }
  );

  it('REQ-DM-003 : une construction non reconnue laisse le fichier jugé SANS aucune exemption', () => {
    const n = NON_RECONNUES[0]!;
    const fautes = garde.controler(avec(n.chemin, n.lignes.join(LF)));
    expect(fautes.map((f) => f.famille).sort()).toEqual([
      'contenu_illisible',
      'evenement_hors_nomenclature',
    ]);
    expect(fautes.find((f) => f.famille === 'evenement_hors_nomenclature')!.message).toContain(
      `${n.chemin}:2 —`
    );
    // Même la citation d'un commentaire RECONNU avant la construction ouverte n'exempte plus rien.
    const avant = garde.controler(
      avec(
        n.chemin,
        [`-- ${AG}payment.received${AG} cité`, "INSERT INTO t VALUES ('ouverte);"].join(LF)
      )
    );
    expect(avant.map((f) => f.famille).sort()).toEqual([
      'contenu_illisible',
      'evenement_hors_nomenclature',
    ]);
  });

  it('REQ-DM-003, REQ-INT-004 : la découpe est UNE fonction, et elle rend ses zones par nature', () => {
    const sql = garde.decouper(
      'prisma/migrations/0040/migration.sql',
      // L'apostrophe doublée reste DANS sa chaîne : trois chaînes, pas quatre.
      [`-- ${AG}a${AG}`, "SELECT 'x''y', \"y\", $$z$$;", '/* b /* c */ d */'].join(LF)
    );
    expect(sql.nonReconnue).toBeUndefined();
    expect(sql.zones.map((z) => z.nature)).toEqual([
      'commentaire',
      'chaine',
      'chaine',
      'chaine',
      'commentaire',
    ]);
    const prose = garde.decouper(
      'docs/adr/0040.md',
      [`# un ${AG}titre${AG}`, '', `« cite »`, '', AG3, 'code', AG3].join(LF)
    );
    expect(prose.zones.map((z) => z.nature).sort()).toEqual([
      'bloc_de_code',
      'guillemets',
      'span_de_code',
    ]);
    expect(garde.decouper('src/x.ts', `const a = ${AG}b${AG};`).zones).toEqual([]);
  });
});

describe('REQ-DM-003, REQ-INT-004 — les lignes LONGUES sont éprouvées', () => {
  const MEBIOCTET = 1024 * 1024;

  it('REQ-INT-004 : en prose, un span d’un mébioctet exempte son contenu, et le terme qui le suit rougit sur sa ligne', () => {
    const long = 'x'.repeat(MEBIOCTET);
    const vert = `un span ${AG}${long} payment.received${AG} referme`;
    expect(garde.controler(avec('docs/adr/9020-long.md', vert))).toEqual([]);
    const rouge = `ligne un${LF}${AG}${long}${AG} le producteur emet payment.received`;
    const fautes = garde.controler(avec('docs/adr/9021-long.md', rouge));
    expect(fautes.map((f) => f.message).join(LF)).toContain('docs/adr/9021-long.md:2 —');
  });

  it('REQ-INT-004 : en prose, des suites d’accents graves toutes différentes sur une ligne longue sont lues en temps linéaire', () => {
    // Chaque suite n'a aucune fermante de sa longueur : une recherche naïve serait quadratique.
    const suites = Array.from({ length: 1400 }, (_v, i) => AG.repeat(i + 1)).join('a');
    expect(suites.length).toBeGreaterThan(MEBIOCTET / 2);
    const debut = Date.now();
    const fautes = garde.controler(
      avec('docs/adr/9022-suites.md', `${suites} le producteur emet payment.received`)
    );
    expect(Date.now() - debut).toBeLessThan(20_000);
    expect(fautes.map((f) => f.message).join(LF)).toContain('docs/adr/9022-suites.md:1 —');
  });

  it('REQ-DM-003 : en SQL, une chaîne d’un mébioctet referme la zone, et un marqueur qu’elle porte ne commente rien', () => {
    const long = 'x'.repeat(MEBIOCTET);
    const vert = `SELECT '${long}'; -- ${AG}payment.received${AG}`;
    expect(garde.controler(avec('prisma/migrations/0050/migration.sql', vert))).toEqual([]);
    const rouge = `UPDATE t SET a = '${long} -- ', b = '${AG}payment.received${AG}';`;
    const fautes = garde.controler(avec('prisma/migrations/0051/migration.sql', rouge));
    expect(fautes.map((f) => f.message).join(LF)).toContain(
      'prisma/migrations/0051/migration.sql:1 —'
    );
  });
});

describe('REQ-DM-003, REQ-INT-004 — la sortie compte les zones découpées, et sa troncature est bornée', () => {
  it('REQ-INT-004 : la garde imprime le compte des fichiers à grammaire et des zones qu’elle a découpées', () => {
    const vue: Vue = {
      ...garde.VUE_CONFORME,
      fichiers: [
        ...garde.VUE_CONFORME.fichiers,
        garde.fichierTexte('docs/adr/0001-a.md', `un ${AG}span${AG} et « des guillemets »`),
        garde.fichierTexte('prisma/migrations/0001/migration.sql', "-- note\nSELECT 'x';"),
      ],
    };
    const sortie = garde.decisionDeLaGarde(vue).lignes.join(LF);
    expect(sortie).toContain('Zones découpées : 4 zone(s) dans 2 fichier(s) à grammaire');
  });

  it('REQ-INT-004 : au-delà de FAUTES_IMPRIMEES fautes, la sortie tronque et compte le reste — à la borne, rien n’est tronqué', () => {
    const n = garde.FAUTES_IMPRIMEES;
    expect(n).toBeGreaterThan(0);
    const vueDe = (k: number): Vue =>
      avec('src/server/fautes.ts', Array.from({ length: k }, () => 'Invoice').join(LF));
    const juste = garde.decisionDeLaGarde(vueDe(n)).lignes;
    expect(juste.filter((l) => l.startsWith('   [terme_axionia_invalide]'))).toHaveLength(n);
    expect(juste.join(LF)).not.toContain('autre(s).');
    const plus = garde.decisionDeLaGarde(vueDe(n + 1)).lignes;
    expect(plus.filter((l) => l.startsWith('   [terme_axionia_invalide]'))).toHaveLength(n);
    expect(plus).toContain('   … et 1 autre(s).');
  });

  it('REQ-INT-004 : la preuve n’éprouve chaque témoin qu’UNE fois', () => {
    const appels = new Map<string, number>();
    const temoins = garde.TEMOINS.map((t) => ({
      ...t,
      vue: () => {
        appels.set(t.id, (appels.get(t.id) ?? 0) + 1);
        return t.vue();
      },
    }));
    const decision = garde.decisionDeLaPreuve({
      ...garde.entreesDeLaPreuve(readFileSync('docs/gates.json', 'utf8')),
      temoins,
    });
    expect(decision.code, decision.lignes.join(LF)).toBe(0);
    expect(
      [...appels.values()].every((n) => n === 1),
      JSON.stringify([...appels])
    ).toBe(true);
    expect(appels.size).toBe(garde.TEMOINS.length);
  });
});

// ── la garde lancée pour de vrai, sur des dépôts jetables ─────────────────────

function lancerDans(depot: string): { code: number | null; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, SCRIPT], {
    cwd: depot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: '',
    } /* GOV-160 : balayage complet, même lancé dans une PR */,
  });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function poser(depot: string, fichiers: Record<string, string | Uint8Array>): void {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(join(depot, dirname(chemin)), { recursive: true });
    writeFileSync(join(depot, chemin), contenu);
  }
  execFileSync('git', ['add', '-A'], { cwd: depot, stdio: 'pipe' });
}

function depotJetable(prefixe: string): string {
  const depot = mkdtempSync(join(tmpdir(), prefixe));
  execFileSync('git', ['init', '-q'], { cwd: depot });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: depot });
  poser(depot, {
    'docs/GLOSSAIRE.md': readFileSync('docs/GLOSSAIRE.md'),
    'docs/requirements.json': readFileSync('docs/requirements.json'),
    'src/rien.ts': 'export const rien = true;\n',
  });
  return depot;
}

const cas = (id: string): Rouge => ROUGES.find((r) => r.id === id)!;

describe('REQ-DM-003, REQ-INT-004 — le témoin à deux faces, par la ligne de commande', () => {
  it('REQ-DM-003, REQ-INT-004 : une chaîne SQL, un commentaire imbriqué et un titre font sortir 1 en nommant fichier et ligne ; sans eux, 0 et le compte des zones', () => {
    const depot = depotJetable('g69-deux-faces-');
    try {
      poser(depot, {
        'docs/adr/0001-propre.md': `# Titre ${AG}cite${AG}${LF}${LF}un span ${AG}x${AG}${LF}`,
        'prisma/migrations/0001_propre/migration.sql': `-- note ${AG}Invoice${AG}${LF}SELECT 'x';${LF}`,
      });
      const propre = lancerDans(depot);
      expect(propre.code, propre.sortie).toBe(0);
      expect(propre.sortie).toContain('Zones découpées : 4 zone(s) dans 2 fichier(s) à grammaire');

      const appats = [
        cas('sql_tirets_dans_une_chaine'),
        cas('sql_terme_nu_dans_un_bloc_imbrique'),
        cas('sql_bloc_imbrique_referme'),
        cas('prose_accent_grave_ouvert_dans_un_titre'),
      ];
      poser(depot, Object.fromEntries(appats.map((a) => [a.chemin, a.lignes.join(LF) + LF])));
      const fautif = lancerDans(depot);
      expect(fautif.code, fautif.sortie).toBe(1);
      for (const a of appats) {
        expect(fautif.sortie).toContain(`[${a.famille}] ${a.chemin}:${a.ligne} —`);
      }
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  }, 180_000);

  it('REQ-INT-004 : un fichier déclaré inchangé dans l’index est jugé sur son BLOB — le vert local ne ment plus', () => {
    const depot = depotJetable('g69-inchange-');
    try {
      for (const [drapeau, chemin] of [
        ['--assume-unchanged', 'docs/adr/0200-inchange.md'],
        ['--skip-worktree', 'docs/adr/0201-saute.md'],
      ] as const) {
        poser(depot, { [chemin]: `le producteur emet payment.received${LF}` });
        execFileSync(
          'git',
          [
            '-c',
            'user.email=t@t',
            '-c',
            'user.name=t',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '-qm',
            drapeau,
          ],
          { cwd: depot, stdio: 'pipe' }
        );
        execFileSync('git', ['update-index', drapeau, chemin], { cwd: depot });
        writeFileSync(join(depot, chemin), `rien a signaler${LF}`);
        const statut = execFileSync('git', ['status', '--porcelain'], {
          cwd: depot,
          encoding: 'utf8',
        });
        expect(statut, drapeau).not.toContain(chemin);
      }
      const r = lancerDans(depot);
      expect(r.code, r.sortie).toBe(1);
      expect(r.sortie).toContain('[evenement_hors_nomenclature] docs/adr/0200-inchange.md:1 —');
      expect(r.sortie).toContain('[evenement_hors_nomenclature] docs/adr/0201-saute.md:1 —');
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  }, 180_000);
});

describe('REQ-DM-003, REQ-INT-004 — le dépôt réel : zéro, avec le compte des zones réellement découpées', () => {
  it('REQ-DM-003, REQ-INT-004 : la garde sort 0 sur le dépôt et imprime un compte de zones égal à celui des fichiers à grammaire suivis', () => {
    const racines = [
      ...garde.racinesDuGlossaire(readFileSync('docs/GLOSSAIRE.md', 'utf8')),
      'packages/contracts/',
    ];
    const aGrammaire = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter((c) => racines.some((r) => c.startsWith(r)))
      .filter((c) => garde.EXTENSIONS_QUI_CITENT.includes(/\.([^./]+)$/.exec(c)?.[1] ?? ''));
    expect(aGrammaire.length).toBeGreaterThan(0);
    const zones = aGrammaire.reduce(
      (s, c) =>
        s +
        garde.decouper(c, execFileSync('git', ['show', `:${c}`], { encoding: 'utf8' })).zones
          .length,
      0
    );
    expect(zones).toBeGreaterThan(0);
    const r = spawnSync(process.execPath, [TSX, SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: '',
      } /* GOV-160 : balayage complet, même lancé dans une PR */,
    });
    const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    expect(r.status, sortie).toBe(0);
    expect(sortie).toContain(
      `Zones découpées : ${zones} zone(s) dans ${aGrammaire.length} fichier(s) à grammaire`
    );
  }, 180_000);
});
