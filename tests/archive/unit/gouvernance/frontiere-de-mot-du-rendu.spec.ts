// @req REQ-GOV-017
// @req REQ-JUR-037
// @req REQ-GOV-003
/**
 * GOV-071 — les gardes lexicale et d'identifiants découpent le texte sur sa forme RENDUE.
 *
 * LE DÉFAUT. Les deux gardes cherchaient leurs termes dans la SOURCE brute, ligne à ligne. Or le
 * lecteur ne lit pas la source : il lit le rendu. Une mise en forme tapée à la main À L'INTÉRIEUR
 * d'un mot — une emphase Markdown, une balise vide, une entité, un caractère invisible, une
 * expression JSX vide — coupe le mot dans la source et le laisse ENTIER à l'écran. Les deux gardes
 * voyaient deux fragments et rendaient « ✅ » ; l'apporteur, lui, lisait le terme interdit.
 *
 * LA MESURE. Une seule fonction rend les lignes (`lignesRendues`, dans `lexique-apporteurs.ts`),
 * importée par `gov-identifiants.ts` : les deux gardes ne peuvent plus découper différemment.
 *
 * CE QUE CE FICHIER ÉPROUVE, famille de rendu par famille de rendu (RM-02) : un témoin dont la
 * source coupe le terme et que le rendu affiche entier, qui DOIT rougir dans les deux gardes ; et
 * un contre-témoin voisin qui DOIT rester vert. Puis le témoin à deux faces, en lançant les deux
 * gardes pour de vrai : sortie non nulle sur un dépôt jetable qui porte le témoin, sortie nulle
 * sur le dépôt réel, avec ses comptes.
 *
 * ⚠️ Aucune étiquette nue n'est TAPÉE ici : la garde des identifiants lit ce fichier. L'étiquette
 * est ASSEMBLÉE à l'exécution, et le terme du lexique est LU dans la SSOT (RM-01).
 */
import { afterAll, describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  MOTIFS,
  MOTIF_GABARIT,
  controler,
  lignesRendues,
  motifDeLaForme,
  vueDeFixture,
  type FichierVu,
} from '../../../scripts/gates/lexique-apporteurs';
import { MOTIF_NU, analyserContenu, fautesDeLigne } from '../../../scripts/gates/gov-identifiants';
import { famillesPourPortee } from '../../../src/domain/lexique/lexique-interdit';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';

// ── les termes, lus et assemblés — jamais tapés ─────────────────────────────

/** Un terme du lexique de portée `depot`, LU dans la SSOT : il vaut donc dans un ADR comme dans l'espace. */
const FORME = famillesPourPortee('depot')
  .flatMap((f) => f.formes)
  .find((f) => /^[a-z]{8,}$/.test(f))!;
const [AVANT, MILIEU, APRES] = [FORME.slice(0, 3), FORME.slice(3, 5), FORME.slice(5)];

/** L'étiquette de relecteur, assemblée : une lettre de la classe, un chiffre. */
const LETTRE = 'D';
const CHIFFRE = '3';
const ETIQUETTE = LETTRE + CHIFFRE;

const ADR_TEMOIN = 'docs/adr/9999-temoin.md';
const ESPACE_TEMOIN = 'src/app/(espace)/temoin.tsx';

/**
 * Les familles de rendu. Chacune coupe la SOURCE à l'intérieur du mot et le laisse entier à
 * l'écran. `coupe(a, b)` rend la source qui colle `a` et `b` sous cette mise en forme.
 */
type FamilleDeRendu = {
  nom: string;
  fichier: string;
  coupe: (a: string, b: string) => string;
  /** Le voisin qui doit rester vert : même mise en forme, mais le rendu SÉPARE, ou ne rend pas. */
  contreTemoin: (a: string, b: string) => string;
};

const FAMILLES_DE_RENDU: FamilleDeRendu[] = [
  {
    nom: 'emphase Markdown au milieu du mot',
    fichier: ADR_TEMOIN,
    coupe: (a, b) => `${a}**${b.slice(0, 1)}**${b.slice(1)}`,
    // Dans un bloc de code, le Markdown ne rend rien : les astérisques restent à l'écran.
    contreTemoin: (a, b) => '```\n' + `${a}**${b.slice(0, 1)}**${b.slice(1)}` + '\n```',
  },
  {
    nom: 'trait d’union conditionnel (invisible)',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => `<p>Votre ${a}­${b}</p>`,
    // Une espace, elle, se voit : les deux fragments restent deux mots.
    contreTemoin: (a, b) => `<p>Votre ${a}­ ${b}</p>`,
  },
  {
    nom: 'espace de largeur nulle',
    fichier: ADR_TEMOIN,
    coupe: (a, b) => `Le tableau affiche ${a}​${b} en tête.`,
    contreTemoin: (a, b) => `Le tableau affiche ${a}​, ${b} en tête.`,
  },
  {
    nom: 'entité HTML numérique',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => `<p>Votre ${a}&#${b.codePointAt(0)};${b.slice(1)}</p>`,
    // Une entité qui rend une PONCTUATION sépare : elle ne recolle rien.
    contreTemoin: (a, b) => `<p>Votre ${a}&amp;${b}</p>`,
  },
  {
    nom: 'balise vide au milieu du mot',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => `<p>Votre ${a}<b></b>${b}</p>`,
    // Une balise de BLOC passe à la ligne au rendu : elle sépare, elle ne recolle rien.
    contreTemoin: (a, b) => `<dl><dt>${a}</dt><dt>${b}</dt></dl>`,
  },
  {
    nom: 'expression JSX vide',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => `<p>Votre ${a}{''}${b}</p>`,
    // `{' '}` rend une espace : deux mots.
    contreTemoin: (a, b) => `<p>Votre ${a}{' '}${b}</p>`,
  },
];

/** Les fautes lexicales d'une source placée à un chemin donné. */
const fautesLexicales = (chemin: string, contenu: string) =>
  controler(vueDeFixture([{ chemin, contenu } satisfies FichierVu])).fautes;

/** Les fautes d'identifiant d'une source placée à un chemin donné, au pipeline COMPLET de la garde. */
const fautesIdentifiant = (chemin: string, contenu: string) =>
  analyserContenu(contenu, chemin, (l, f, i) => fautesDeLigne(l, f, i, MOTIF_NU)).fautes;

// ── 1. la source coupe, le rendu recolle : les deux gardes voient le terme ──

describe('GOV-071 — chaque famille de rendu : témoin rouge, contre-témoin vert (RM-02)', () => {
  for (const r of FAMILLES_DE_RENDU) {
    it(`REQ-GOV-017 / REQ-JUR-037 : ${r.nom} — la garde lexicale voit le terme que la source coupe`, () => {
      const source = r.coupe(AVANT, MILIEU + APRES);
      // La source coupe VRAIMENT le terme : sans rendu, rien ne le trouverait.
      expect(motifDeLaForme(FORME).test(source), 'la source porte déjà le terme entier').toBe(
        false
      );
      const fautes = fautesLexicales(r.fichier, source);
      expect(fautes.map((f) => f.message).join('\n')).toContain(`${r.fichier}:`);
      expect(fautes.map((f) => f.message).join('\n')).toContain(`« ${FORME} »`);
    });

    it(`REQ-GOV-017 / REQ-JUR-037 : ${r.nom} — son contre-témoin reste vert`, () => {
      expect(fautesLexicales(r.fichier, r.contreTemoin(AVANT, MILIEU + APRES))).toEqual([]);
    });

    it(`REQ-GOV-003 : ${r.nom} — la garde des identifiants voit l'étiquette que la source coupe`, () => {
      const source = r.coupe(LETTRE, CHIFFRE);
      expect(new RegExp(MOTIF_NU.source).test(source), 'la source porte déjà l’étiquette').toBe(
        false
      );
      const messages = fautesIdentifiant(r.fichier, source).map((f) => f.message);
      expect(messages.join('\n')).toContain(`« ${ETIQUETTE} »`);
    });

    it(`REQ-GOV-003 : ${r.nom} — son contre-témoin reste vert`, () => {
      expect(fautesIdentifiant(r.fichier, r.contreTemoin(LETTRE, CHIFFRE))).toEqual([]);
    });
  }
});

// ── 2. le découpage vit à un seul endroit (RM-01) ────────────────────────────

describe('GOV-071 — une seule fonction rend les lignes, importée par les deux gardes', () => {
  it('REQ-GOV-003 : gov-identifiants importe le rendu de la garde lexicale et n’en définit aucun', () => {
    const source = readFileSync('scripts/gates/gov-identifiants.ts', 'utf8');
    expect(source).toMatch(
      /import\s*\{[^}]*\blignesRendues\b[^}]*\}\s*from\s*'\.\/lexique-apporteurs'/
    );
    expect(source).not.toMatch(/function\s+lignesRendues\b/);
    expect(source).toMatch(/lignesRendues\(/);
  });

  it('REQ-GOV-017 : la garde lexicale rend chaque fichier avant d’y chercher un terme', () => {
    const source = readFileSync('scripts/gates/lexique-apporteurs.ts', 'utf8');
    expect(source).toMatch(/export function lignesRendues\(/);
    // Deux lecteurs du contenu : le lexique et le gabarit. Les deux passent par le rendu.
    expect((source.match(/lignesRendues\(f\.chemin, f\.contenu\)/g) ?? []).length).toBe(2);
  });

  it('REQ-GOV-017 : le rendu garde le compte des lignes — le numéro nommé est celui de la source', () => {
    const contenu = ['ligne un', '```', 'dans un bloc', '```', 'ligne cinq'].join('\n');
    expect(lignesRendues(ADR_TEMOIN, contenu)).toHaveLength(5);
  });
});

// ── 3. citer n'est pas se servir : la documentation garde son contre-exemple ──

describe('GOV-071 — un document qui EXPLIQUE la règle garde le droit d’écrire son contre-exemple', () => {
  const coupeMd = FAMILLES_DE_RENDU[0]!.coupe;

  it('REQ-GOV-017 : le terme et sa forme coupée, entre accents graves, restent verts', () => {
    // Aucun marqueur de dénégation dans ces phrases : le vert doit venir de la CITATION seule.
    const doc = [
      `Le contre-exemple s'écrit \`${FORME}\` dans la règle.`,
      `La forme coupée \`${coupeMd(AVANT, MILIEU + APRES)}\` recolle au rendu.`,
    ].join('\n');
    const r = controler(vueDeFixture([{ chemin: ADR_TEMOIN, contenu: doc }]));
    expect(r.fautes).toEqual([]);
    expect(r.exemptions.filter((e) => e.genre === 'citation').length).toBeGreaterThan(0);
  });

  it('REQ-JUR-037 : la même forme coupée HORS accents graves rougit — c’est bien le code qui la protège', () => {
    const doc = `La forme coupée ${coupeMd(AVANT, MILIEU + APRES)} recolle au rendu.`;
    expect(fautesLexicales(ADR_TEMOIN, doc).length).toBeGreaterThan(0);
  });

  it('REQ-GOV-003 : l’étiquette coupée, entre accents graves, reste verte', () => {
    const doc = `La forme coupée \`${coupeMd(LETTRE, CHIFFRE)}\` recolle au rendu.`;
    expect(fautesIdentifiant('docs/exemple.md', doc)).toEqual([]);
  });

  it('REQ-GOV-003 : la même étiquette coupée HORS accents graves rougit', () => {
    const doc = `La forme coupée ${coupeMd(LETTRE, CHIFFRE)} recolle au rendu.`;
    expect(fautesIdentifiant('docs/exemple.md', doc).length).toBeGreaterThan(0);
  });
});

// ── 4. le témoin à deux faces : les deux gardes, lancées pour de vrai ────────

const TSX = resolve('node_modules/tsx/dist/cli.mjs');
const GARDES = {
  lexique: resolve('scripts/gates/lexique-apporteurs.ts'),
  identifiants: resolve('scripts/gates/gov-identifiants.ts'),
} as const;

function lancer(garde: string, cwd: string): { code: number; sortie: string } {
  try {
    const sortie = execFileSync(process.execPath, [TSX, garde], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, sortie };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const JETABLES: string[] = [];
afterAll(() => {
  for (const d of JETABLES) rmSync(d, { recursive: true, force: true });
});

/**
 * Un dépôt jetable qui satisfait le périmètre ATTENDU de la garde lexicale : pour chaque motif
 * attendu, un fichier RÉEL du dépôt qui le prend (lu, pas inventé — RM-01). Sans lui, la garde
 * rougirait pour `perimetre_vide`, et le témoin mesurerait autre chose que le rendu.
 */
function depotJetable(): string {
  const depot = mkdtempSync(join(tmpdir(), 'temoin-rendu-'));
  JETABLES.push(depot);
  const suivis = fichiersSuivis();
  for (const m of [...MOTIFS.filter((x) => x.attendu), MOTIF_GABARIT]) {
    const reel = suivis.find((c) => m.reg.test(c));
    if (reel === undefined) throw new Error(`aucun fichier réel pour le motif attendu ${m.nom}`);
    mkdirSync(join(depot, dirname(reel)), { recursive: true });
    copyFileSync(reel, join(depot, reel));
  }
  for (const args of [
    ['init', '-q'],
    ['add', '-A'],
  ]) {
    execFileSync('git', args, { cwd: depot, stdio: 'ignore' });
  }
  return depot;
}

describe('GOV-071 — le témoin à deux faces', () => {
  it('REQ-GOV-017 / REQ-GOV-003 : un texte coupé dans la source, entier au rendu, fait sortir les DEUX gardes en non nul, fichier, ligne et terme nommés', () => {
    const depot = depotJetable();

    // Le contre-témoin du harnais : le même dépôt SANS le témoin sort en zéro dans les deux
    // gardes. Sans lui, un rouge dû au harnais se lirait comme un rouge dû au rendu.
    for (const g of Object.values(GARDES)) {
      const r = lancer(g, depot);
      expect(r.code, `${g} rougit déjà sans le témoin :\n${r.sortie}`).toBe(0);
    }

    const coupeMd = FAMILLES_DE_RENDU[0]!.coupe;
    const temoin = [
      '# Témoin',
      '',
      `Le tableau affiche votre ${coupeMd(AVANT, MILIEU + APRES)} du mois, conforme à ${coupeMd(LETTRE, CHIFFRE)}.`,
    ].join('\n');
    mkdirSync(join(depot, 'docs/adr'), { recursive: true });
    writeFileSync(join(depot, ADR_TEMOIN), temoin, 'utf8');
    execFileSync('git', ['add', '-A'], { cwd: depot, stdio: 'ignore' });

    const lexique = lancer(GARDES.lexique, depot);
    expect(lexique.code, lexique.sortie).not.toBe(0);
    expect(lexique.sortie).toContain(`${ADR_TEMOIN}:3`);
    expect(lexique.sortie).toContain(`« ${FORME} »`);

    const identifiants = lancer(GARDES.identifiants, depot);
    expect(identifiants.code, identifiants.sortie).not.toBe(0);
    expect(identifiants.sortie).toContain(`${ADR_TEMOIN}:3`);
    expect(identifiants.sortie).toContain(`« ${ETIQUETTE} »`);
  }, 180_000);

  it('REQ-JUR-037 / REQ-GOV-003 : les textes du dépôt font sortir les deux gardes en zéro, avec le compte des fichiers et des termes confrontés', () => {
    const lexique = lancer(GARDES.lexique, process.cwd());
    expect(lexique.code, lexique.sortie).toBe(0);
    const fichiersLexique = Number(/(\d+) fichier\(s\) balayé\(s\)/.exec(lexique.sortie)?.[1]);
    const formes = Number(/(\d+) formes appliquées/.exec(lexique.sortie)?.[1]);
    expect(fichiersLexique).toBeGreaterThan(0);
    expect(formes).toBeGreaterThan(0);
    expect(lexique.sortie).toMatch(/\d+ occurrence\(s\) vue\(s\)/);

    const identifiants = lancer(GARDES.identifiants, process.cwd());
    expect(identifiants.code, identifiants.sortie).toBe(0);
    const fichiersId = Number(/(\d+) fichier\(s\) balayé\(s\)/.exec(identifiants.sortie)?.[1]);
    const jetons = Number(/(\d+) jeton\(s\) confronté\(s\)/.exec(identifiants.sortie)?.[1]);
    expect(fichiersId).toBeGreaterThan(0);
    expect(jetons).toBeGreaterThan(0);
  }, 180_000);
});

// ── 5. GOV-106 : le rendu par l'ARBRE, et non par des expressions régulières ──

/**
 * GOV-106 — la JSX se rend par l'AST de TypeScript, le Markdown par son arbre en ligne. Chaque
 * forme ci-dessous est une CONSTRUCTION que le rendu recolle et que la découpe par expressions
 * régulières laissait coupée. Le terme reste ASSEMBLÉ à l'exécution depuis la SSOT : la forme
 * est une fonction de `(a, b)`, jamais un mot tapé.
 */
const MD_TEMOIN = ADR_TEMOIN;
const deb = (b: string) => b.slice(0, 1);
const fin = (b: string) => b.slice(1);
const enP = (s: string) => `<p>Votre ${s}</p>`;

const FORMES_DE_L_ARBRE: FamilleDeRendu[] = [
  ...(['"', "'", '`'] as const).map((q): FamilleDeRendu => ({
    nom: `JSX — littéral de chaîne constant entre accolades (délimiteur ${q})`,
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{${q}${deb(b)}${q}}${fin(b)}`),
    // La VALEUR compte : une espace dans le littéral, et le rendu sépare.
    contreTemoin: (a, b) => enP(`${a}{${q} ${deb(b)}${q}}${fin(b)}`),
  })),
  ...(['null', 'false', 'undefined'] as const).map((v): FamilleDeRendu => ({
    nom: `JSX — expression qui ne rend rien (${v})`,
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{${v}}${b}`),
    // Dans une valeur d'attribut en chaîne, les accolades sont du TEXTE : elles séparent.
    contreTemoin: (a, b) => `<p title="${a}{${v}}${b}">Votre compte</p>`,
  })),
  {
    nom: 'JSX — fragment au milieu du mot',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}<>${deb(b)}</>${fin(b)}`),
    // Dans un commentaire du code, rien n'est rendu : les chevrons restent et séparent.
    contreTemoin: (a, b) => `// ${a}<>${deb(b)}</>${fin(b)}\n${enP('compte')}`,
  },
  {
    nom: 'JSX — composant au milieu du mot',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}<Trans>${deb(b)}</Trans>${fin(b)}`),
    // Une balise de BLOC passe à la ligne : elle sépare.
    contreTemoin: (a, b) => `<div>Votre ${a}<div>${deb(b)}</div>${fin(b)}</div>`,
  },
  {
    nom: 'JSX — balise en ligne AVEC attribut au milieu du mot',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}<span className="a">${deb(b)}</span>${fin(b)}`),
    contreTemoin: (a, b) => `<div>Votre ${a}<div className="a">${deb(b)}</div>${fin(b)}</div>`,
  },
  {
    nom: 'JSX — balise en ligne coupée sur deux lignes',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => `<p>\n  Votre ${a}<span\n    className="a">${deb(b)}</span>${fin(b)}\n</p>`,
    contreTemoin: (a, b) =>
      `<div>\n  Votre ${a}<div\n    className="a">${deb(b)}</div>${fin(b)}\n</div>`,
  },
  {
    nom: 'Markdown — lien au milieu du mot',
    fichier: MD_TEMOIN,
    coupe: (a, b) => `Le tableau affiche ${a}[${deb(b)}](https://x)${fin(b)} en tête.`,
    // Entre accents graves, le lien n'est pas rendu : les crochets restent à l'écran.
    contreTemoin: (a, b) => `Le tableau affiche \`${a}[${deb(b)}](https://x)${fin(b)}\` en tête.`,
  },
  {
    nom: 'Markdown — balise en ligne AVEC attribut au milieu du mot',
    fichier: MD_TEMOIN,
    coupe: (a, b) => `Le tableau affiche ${a}<a href="x">${deb(b)}</a>${fin(b)} en tête.`,
    contreTemoin: (a, b) =>
      `Le tableau affiche \`${a}<a href="x">${deb(b)}</a>${fin(b)}\` en tête.`,
  },
  {
    nom: 'Markdown — balise en ligne coupée sur deux lignes',
    fichier: MD_TEMOIN,
    coupe: (a, b) => `Le tableau affiche ${a}<a\nhref="x">${deb(b)}</a>${fin(b)} en tête.`,
    // Dans un bloc de code clôturé, rien n'est rendu.
    contreTemoin: (a, b) => '```\n' + `${a}<a\nhref="x">${deb(b)}</a>${fin(b)}` + '\n```',
  },
];

describe('GOV-106 — chaque forme que l’arbre recolle : témoin rouge, contre-témoin vert (RM-02)', () => {
  for (const r of FORMES_DE_L_ARBRE) {
    it(`REQ-GOV-017 / REQ-JUR-037 : ${r.nom} — la garde lexicale voit le terme`, () => {
      const source = r.coupe(AVANT, MILIEU + APRES);
      expect(motifDeLaForme(FORME).test(source), 'la source porte déjà le terme entier').toBe(
        false
      );
      const messages = fautesLexicales(r.fichier, source)
        .map((f) => f.message)
        .join('\n');
      // Le numéro nommé est celui de la ligne SOURCE où le mot commence.
      const ligne = source.split('\n').findIndex((l) => l.includes(AVANT)) + 1;
      expect(messages).toContain(`${r.fichier}:${ligne} `);
      expect(messages).toContain(`« ${FORME} »`);
    });

    it(`REQ-GOV-017 / REQ-JUR-037 : ${r.nom} — son contre-témoin reste vert`, () => {
      expect(fautesLexicales(r.fichier, r.contreTemoin(AVANT, MILIEU + APRES))).toEqual([]);
    });

    it(`REQ-GOV-003 : ${r.nom} — la garde des identifiants voit l'étiquette`, () => {
      const source = r.coupe(LETTRE, CHIFFRE);
      expect(new RegExp(MOTIF_NU.source).test(source), 'la source porte déjà l’étiquette').toBe(
        false
      );
      const messages = fautesIdentifiant(r.fichier, source).map((f) => f.message);
      expect(messages.join('\n')).toContain(`« ${ETIQUETTE} »`);
    });

    it(`REQ-GOV-003 : ${r.nom} — son contre-témoin reste vert`, () => {
      expect(fautesIdentifiant(r.fichier, r.contreTemoin(LETTRE, CHIFFRE))).toEqual([]);
    });

    it(`REQ-GOV-017 : ${r.nom} — le rendu garde une ligne pour une ligne`, () => {
      const source = r.coupe(AVANT, MILIEU + APRES);
      expect(lignesRendues(r.fichier, source)).toHaveLength(source.split('\n').length);
    });
  }
});

describe('GOV-106 — ce que le rendu retire de l’écran, la garde le lit encore', () => {
  it('REQ-JUR-037 : le terme porté par un attribut d’une balise effacée reste jugé', () => {
    const source = enP(`${AVANT}<span title="${FORME}">${MILIEU}</span>${APRES}`);
    expect(fautesLexicales(ESPACE_TEMOIN, source).length).toBeGreaterThan(0);
  });

  it('REQ-JUR-037 : le terme porté par la cible d’un lien Markdown reste jugé', () => {
    const source = `Voir [la page](https://x.test/${FORME}) du mois.`;
    expect(fautesLexicales(MD_TEMOIN, source).length).toBeGreaterThan(0);
  });

  it('REQ-GOV-017 : la concaténation constante de chaînes dans une expression JSX est rendue', () => {
    const source = enP(`{'${AVANT}' + '${MILIEU}'}${APRES}`);
    expect(fautesLexicales(ESPACE_TEMOIN, source).length).toBeGreaterThan(0);
  });

  it('REQ-GOV-017 : une expression dont la valeur est inconnue n’est pas inventée — elle sépare', () => {
    const source = enP(`${AVANT}{valeur}${MILIEU + APRES}`);
    expect(fautesLexicales(ESPACE_TEMOIN, source)).toEqual([]);
  });
});

// ── 6. GOV-109 : toute expression JSX dont la valeur rendue est CONSTANTE ────

/**
 * GOV-109 — la garde n'énumère plus des formes : elle ÉVALUE, par l'AST, toute expression JSX dont
 * la valeur rendue est connue sans exécution, et la rend comme React la rend. Chaque témoin ci-
 * dessous construit une valeur rendue qui porte le terme ENTIER, alors que la source le coupe ; le
 * terme reste assemblé depuis la SSOT. Les formes du relevé de sécurité restent hors dépôt : ces
 * témoins couvrent la FAMILLE (la sémantique), pas une liste.
 */
const CONSTANTE_LOCALE = (valeur: string, rendu: string) =>
  `const PART = '${valeur}';\nexport const Temoin = () => ${rendu};`;

const EXPRESSIONS_CONSTANTES: FamilleDeRendu[] = [
  {
    nom: 'gabarit avec substitution constante',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{\`\${'${deb(b)}'}${fin(b)}\`}`),
    contreTemoin: (a, b) => enP(`${a}{\`\${' ${deb(b)}'}${fin(b)}\`}`),
  },
  {
    nom: 'concaténation de trois constantes',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`{'${a}' + '${deb(b)}' + '${fin(b)}'}`),
    contreTemoin: (a, b) => enP(`{'${a}' + ' ' + '${deb(b)}' + '${fin(b)}'}`),
  },
  {
    nom: 'parenthèses imbriquées',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{(('${deb(b)}'))}${fin(b)}`),
    contreTemoin: (a, b) => enP(`${a}{((' ${deb(b)}'))}${fin(b)}`),
  },
  {
    nom: 'ternaire à condition constante',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{true ? '${deb(b)}' : ' '}${fin(b)}`),
    // La branche qui porte le fragment n'est jamais rendue : l'écran montre une espace.
    contreTemoin: (a, b) => enP(`${a}{false ? '${deb(b)}' : ' '}${fin(b)}`),
  },
  {
    nom: 'ternaire à condition numérique constante',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{1 ? '${deb(b)}' : ' '}${fin(b)}`),
    contreTemoin: (a, b) => enP(`${a}{0 ? '${deb(b)}' : ' '}${fin(b)}`),
  },
  {
    nom: 'ternaire à condition inconnue, le terme dans la PREMIÈRE branche',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{etat ? '${deb(b)}' : ' '}${fin(b)}`),
    contreTemoin: (a, b) => enP(`${a}{etat ? ' ' : ' '}${deb(b)}${fin(b)}`),
  },
  {
    nom: 'ternaire à condition inconnue, le terme dans la SECONDE branche',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{etat ? ' ' : '${deb(b)}'}${fin(b)}`),
    contreTemoin: (a, b) => enP(`${a}{etat ? ' ' : ' ${deb(b)}'}${fin(b)}`),
  },
  {
    nom: '&& à gauche constante et vraie',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{true && '${deb(b)}'}${fin(b)}`),
    contreTemoin: (a, b) => enP(`${a}{true && ' '}${deb(b)}${fin(b)}`),
  },
  {
    nom: '|| à gauche constante et fausse',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`${a}{'' || '${deb(b)}'}${fin(b)}`),
    // La gauche est vraie : elle est rendue, et c'est une espace.
    contreTemoin: (a, b) => enP(`${a}{' ' || '${deb(b)}'}${fin(b)}`),
  },
  {
    nom: 'tableau de constantes rendu bout à bout',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => enP(`{['${a}', '${deb(b)}', null, false, ['${fin(b)}']]}`),
    contreTemoin: (a, b) => enP(`{['${a}', ' ', '${deb(b)}', '${fin(b)}']}`),
  },
  {
    nom: 'constante locale du même fichier, résolue',
    fichier: ESPACE_TEMOIN,
    coupe: (a, b) => CONSTANTE_LOCALE(deb(b), enP(`${a}{PART}${fin(b)}`)),
    // Le même nom lié DEUX fois (un paramètre) : la valeur n'est plus connue, rien n'est inventé.
    contreTemoin: (a, b) =>
      `const PART = '${deb(b)}';\nexport const Temoin = ({ PART }: { PART: string }) => ${enP(`${a}{PART}${fin(b)}`)};`,
  },
];

describe('GOV-109 — chaque expression constante rendue : témoin rouge, contre-témoin vert (RM-02)', () => {
  for (const r of EXPRESSIONS_CONSTANTES) {
    it(`REQ-GOV-017 / REQ-JUR-037 : ${r.nom} — la garde lexicale voit le terme rendu`, () => {
      const source = r.coupe(AVANT, MILIEU + APRES);
      expect(motifDeLaForme(FORME).test(source), 'la source porte déjà le terme entier').toBe(
        false
      );
      const messages = fautesLexicales(r.fichier, source)
        .map((f) => f.message)
        .join('\n');
      const ligne = source.split('\n').findIndex((l) => l.includes(AVANT)) + 1;
      expect(messages).toContain(`${r.fichier}:${ligne} `);
      expect(messages).toContain(`« ${FORME} »`);
    });

    it(`REQ-GOV-017 / REQ-JUR-037 : ${r.nom} — son contre-témoin reste vert`, () => {
      expect(fautesLexicales(r.fichier, r.contreTemoin(AVANT, MILIEU + APRES))).toEqual([]);
    });

    it(`REQ-GOV-017 : ${r.nom} — le rendu garde une ligne pour une ligne`, () => {
      const source = r.coupe(AVANT, MILIEU + APRES);
      expect(lignesRendues(r.fichier, source)).toHaveLength(source.split('\n').length);
    });
  }

  it('REQ-GOV-003 : un nombre constant se rend en chiffres — l’étiquette recollée est vue', () => {
    const source = enP(`${LETTRE}{${CHIFFRE}}`);
    expect(new RegExp(MOTIF_NU.source).test(source)).toBe(false);
    expect(
      fautesIdentifiant(ESPACE_TEMOIN, source)
        .map((f) => f.message)
        .join('\n')
    ).toContain(`« ${ETIQUETTE} »`);
    expect(fautesIdentifiant(ESPACE_TEMOIN, enP(`${LETTRE}{' ' + ${CHIFFRE}}`))).toEqual([]);
  });
});

describe('GOV-109 — ce qui reste admis, ce qui n’est pas jugé', () => {
  it('REQ-JUR-037 : une négation déclarée, rendue par une expression constante, reste admise', () => {
    const source = enP(`{'ni ' + '${AVANT}' + '${MILIEU + APRES}' + ' ni rien d’autre'}`);
    expect(fautesLexicales(ESPACE_TEMOIN, source)).toEqual([]);
  });

  it('REQ-JUR-037 : les deux branches d’un ternaire inconnu, toutes deux niées, restent admises', () => {
    const source = enP(`{etat ? 'ni ${AVANT}' : 'aucun ${AVANT}'}${MILIEU + APRES}`);
    expect(fautesLexicales(ESPACE_TEMOIN, source)).toEqual([]);
  });

  it('REQ-JUR-037 : la négation d’une branche n’exempte pas l’autre — chaque affichage est jugé', () => {
    const source = `<p>{etat ? 'aucun ' : ''}${AVANT}{'${MILIEU + APRES}'}</p>`;
    const messages = fautesLexicales(ESPACE_TEMOIN, source).map((f) => f.message);
    expect(messages.join('\n')).toContain(`« ${FORME} »`);
  });

  it('REQ-JUR-037 : TÉMOIN — deux ternaires voisins, une moitié du terme chacun : la paire CROISÉE est jugée', () => {
    // Refus de la lentille `exactitude` (PR #267) : les affichages d'une même ligne se combinent en
    // produit ; la paire de rangs différents (c vrai, d faux) est celle que React affiche.
    const source = enP(`{c ? '${AVANT}' : 'zz'}{d ? 'yy' : '${MILIEU + APRES}'}`);
    const messages = fautesLexicales(ESPACE_TEMOIN, source).map((f) => f.message);
    expect(messages.join('\n')).toContain(`« ${FORME} »`);
  });

  it('REQ-JUR-037 : TÉMOIN — la paire croisée est jugée aussi sur deux lignes sources voisines', () => {
    const source = `<p>\n  {c ? '${AVANT}' : 'zz'}\n  {d ? 'yy' : '${MILIEU + APRES}'}\n</p>`;
    const messages = fautesLexicales(ESPACE_TEMOIN, source).map((f) => f.message);
    expect(messages.join('\n')).toContain(`« ${FORME} »`);
  });

  it('REQ-GOV-017 : une expression dont une branche n’est pas constante n’est pas jugée — elle sépare', () => {
    const source = enP(`${AVANT}{etat ? '${deb(MILIEU)}' : valeur}${fin(MILIEU) + APRES}`);
    expect(fautesLexicales(ESPACE_TEMOIN, source)).toEqual([]);
  });

  it('REQ-GOV-017 : && dont la gauche est inconnue n’est pas jugé — elle sépare', () => {
    const source = enP(`${AVANT}{etat && '${deb(MILIEU)}'}${fin(MILIEU) + APRES}`);
    expect(fautesLexicales(ESPACE_TEMOIN, source)).toEqual([]);
  });
});
