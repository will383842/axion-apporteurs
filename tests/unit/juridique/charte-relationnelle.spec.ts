// @req REQ-JUR-034
// @req REQ-JUR-035
// @req REQ-JUR-036
// @req REQ-JUR-037
/**
 * `charte-relationnelle.spec.ts` — les gardes STRUCTURELLES de la charte relationnelle (JUR-T26).
 *
 * Décision de Will : classements et statistiques côté console SEULEMENT, jamais montrés à un
 * apporteur ; ni challenge ni progression entre apporteurs. Ces quatre gardes en tiennent la
 * partie qui se lit dans le code, avant tout écran :
 *   1. `jur:aucun-agregat-reseau` (REQ-JUR-034) : aucun DTO de l'espace ne porte une valeur agrégée
 *      du réseau, et l'espace n'importe aucun module de la console ;
 *   2. `jur:aucune-progression` (REQ-JUR-035) : aucun nom ni type de progression vers un seuil ;
 *   3. `jur:revue-apporteur-facing` (REQ-JUR-036) : une PR qui touche ce qu'un apporteur lit porte
 *      le label `apporteur-facing`, la checklist des douze motifs cochée, et la revue du juriste,
 *      déclarée dans CODEOWNERS ;
 *   4. la gate lexicale durcie (REQ-JUR-037) : ressources diffusées et composants de l'espace entrent
 *      dans la portée apporteur, et `jur:lexique-social` refuse le vocabulaire et les rubriques d'un
 *      bulletin de paie jusque dans les gabarits de documents remis.
 * Chaque garde : un témoin qui rougit en nommant la faute, un contre-témoin vert, et le binaire
 * sur le dépôt qui sort en 0 en imprimant ce qu'il a confronté.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  jugerLesDto,
  segments,
  type FichierVu,
} from '../../../scripts/gates/jur-aucun-agregat-reseau';
import { NOMS_DE_PROGRESSION, jugerLesNoms } from '../../../scripts/gates/jur-aucune-progression';
import {
  MARQUEUR_DEBUT,
  MARQUEUR_FIN,
  PERIMETRE_APPORTEUR,
  jugerLaCouverture,
  jugerLaPr,
  motifsDeLaCharte,
} from '../../../scripts/gates/jur-revue-apporteur-facing';
import { jugerLesDocuments } from '../../../scripts/gates/jur-lexique-social';
import {
  controler,
  porteeDuFichier,
  vueDeFixture,
} from '../../../scripts/gates/lexique-apporteurs';

const registre = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
  exigences: { id: string; texte: string }[];
};
const texte = (id: string) => registre.exigences.find((e) => e.id === id)!.texte;

function lancer(script: string, ...args: string[]) {
  const r = spawnSync('npx', ['tsx', `scripts/gates/${script}.ts`, ...args], {
    encoding: 'utf8',
    shell: true,
  });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const espace = (source: string, chemin = 'src/app/(espace)/tableau/page.tsx'): FichierVu => ({
  chemin,
  source,
});

// ── REQ-JUR-034 ──────────────────────────────────────────────────────────────────────────────────

describe('REQ-JUR-034 — aucun agrégat du réseau dans un DTO de l’espace', () => {
  it('REQ-JUR-034 : TÉMOIN À DEUX FACES — un DTO portant `moyenneReseau` rougit en nommant la clé ; `montantCents` passe', () => {
    const rouge = jugerLesDto([
      espace('export interface Tableau { montantCents: number; moyenneReseau: number }'),
    ]);
    expect(rouge.fautes.map((f) => f.famille)).toEqual(['agregat_reseau']);
    expect(rouge.fautes[0]!.message).toContain('moyenneReseau');
    const vert = jugerLesDto([espace('export interface Tableau { montantCents: number }')]);
    expect(vert.fautes).toEqual([]);
    expect(vert.cles).toBe(1);
  });

  it('REQ-JUR-034 : rang, médiane, percentile, classement, comparaison et total du réseau rougissent, en type comme en valeur', () => {
    for (const cle of [
      'rang',
      'rangDansLeReseau',
      'mediane',
      'percentile',
      'classement',
      'comparaisonReseau',
      'totalReseau',
      'nombre_reseau',
      'averageScore',
      'rank',
    ]) {
      const t = jugerLesDto([espace(`export type D = { ${cle}: number };`)]);
      expect(
        t.fautes.map((f) => f.famille),
        cle
      ).toEqual(['agregat_reseau']);
      const v = jugerLesDto([espace(`export const d = { ${cle}: 1 };`)]);
      expect(
        v.fautes.map((f) => f.famille),
        cle
      ).toEqual(['agregat_reseau']);
    }
  });

  it('REQ-JUR-034 : ses propres données et un mot voisin ne rougissent pas — la lettre du réseau, une marge haute', () => {
    const r = jugerLesDto([
      espace(
        'export const d = { mesDepots: 3, lettreDuReseau: "x", style: { marginTop: 4 }, arrangement: 1 };'
      ),
    ]);
    expect(r.fautes).toEqual([]);
  });

  it('REQ-JUR-034 : l’espace n’importe aucun module de la console — les statistiques y restent', () => {
    const r = jugerLesDto([
      espace("import { lister } from '../../../server/console/statistiques';\nexport const a = 1;"),
    ]);
    expect(r.fautes.map((f) => f.famille)).toEqual(['import_console']);
  });

  it('REQ-JUR-034 : hors de l’espace, la console trie et compare librement', () => {
    const r = jugerLesDto([
      { chemin: 'src/server/console/statistiques.ts', source: 'export const d = { rang: 1 };' },
    ]);
    expect(r.fautes).toEqual([]);
    expect(r.fichiers).toBe(0);
  });

  it('REQ-JUR-034 : les segments d’un nom se lisent en camelCase, snake_case et sans accents', () => {
    expect(segments('moyenneRéseau')).toEqual(['moyenne', 'reseau']);
    expect(segments('TOTAL_RESEAU')).toEqual(['total', 'reseau']);
    expect(segments('ProgressToNextTier')).toEqual(['progress', 'to', 'next', 'tier']);
  });

  it('REQ-JUR-034 : le binaire sur le dépôt sort en 0 et imprime les fichiers et clés confrontés', () => {
    const r = lancer('jur-aucun-agregat-reseau');
    expect(r.sortie).toMatch(/fichier\(s\) de l’espace lu\(s\)/);
    expect(r.code).toBe(0);
  });
});

// ── REQ-JUR-035 ──────────────────────────────────────────────────────────────────────────────────

describe('REQ-JUR-035 — aucun composant nommé ni typé comme une progression vers un seuil', () => {
  it('REQ-JUR-035 : TÉMOIN À DEUX FACES — `ProgressToNextTier` rougit en le nommant ; `CarteDeDepot` passe', () => {
    const rouge = jugerLesNoms([espace('export function ProgressToNextTier() { return null; }')]);
    expect(rouge.fautes.map((f) => f.famille)).toEqual(['nom_de_progression']);
    expect(rouge.fautes[0]!.message).toContain('ProgressToNextTier');
    const vert = jugerLesNoms([espace('export function CarteDeDepot() { return null; }')]);
    expect(vert.fautes).toEqual([]);
    expect(vert.noms).toBeGreaterThan(0);
  });

  it('REQ-JUR-035 : chaque nom que l’exigence énumère est couvert par la garde (lu au registre, jamais retapé)', () => {
    const cites = [...texte('REQ-JUR-035').matchAll(/`([^`]+)`/g)]
      .map((m) => m[1]!)
      .filter((n) => !n.includes(':'));
    expect(cites.length).toBeGreaterThanOrEqual(6);
    for (const nom of cites) {
      const r = jugerLesNoms([espace(`export const ${nom}Valeur = 1;`)]);
      expect(
        r.fautes.map((f) => f.famille),
        nom
      ).toEqual(['nom_de_progression']);
    }
    expect(NOMS_DE_PROGRESSION.length).toBeGreaterThanOrEqual(cites.length);
  });

  it('REQ-JUR-035 : un élément `<progress>` ou `<meter>`, ou `role="progressbar"`, rougit', () => {
    for (const jsx of [
      '<progress value={2} max={5} />',
      '<meter value={2} />',
      '<div role="progressbar" />',
    ]) {
      const r = jugerLesNoms([espace(`export function Bloc() { return ${jsx}; }`)]);
      expect(
        r.fautes.map((f) => f.famille),
        jsx
      ).toEqual(['element_de_progression']);
    }
  });

  it('REQ-JUR-035 : « reste à faire » et « prochain palier » en noms rougissent ; « progressif » et « restaurer » non', () => {
    expect(jugerLesNoms([espace('export const resteAFaire = 1;')]).fautes).toHaveLength(1);
    expect(jugerLesNoms([espace('export const prochainPalier = 1;')]).fautes).toHaveLength(1);
    expect(
      jugerLesNoms([espace('export const affichageProgressif = 1; export function restaurer() {}')])
        .fautes
    ).toEqual([]);
  });

  it('REQ-JUR-035 : le binaire sur le dépôt sort en 0 et imprime les noms confrontés', () => {
    const r = lancer('jur-aucune-progression');
    expect(r.sortie).toMatch(/nom\(s\) confronté\(s\)/);
    expect(r.code).toBe(0);
  });
});

// ── REQ-JUR-036 ──────────────────────────────────────────────────────────────────────────────────

const MOTIFS = motifsDeLaCharte(readFileSync('.claude/agents/juriste.md', 'utf8'));

const checklist = (valeur: (n: number) => string) =>
  [
    MARQUEUR_DEBUT,
    ...MOTIFS.map(
      (m) => `M${String(m.numero).padStart(2, '0')} · ${m.libelle} : ${valeur(m.numero)}`
    ),
    MARQUEUR_FIN,
  ].join('\n');
const COCHEE = checklist(() => 'absent');
const ECRAN = ['src/app/(espace)/tableau/page.tsx'];
const REVUE_JURISTE = {
  user: { login: 'will383842' },
  author_association: 'OWNER',
  state: 'COMMENTED',
  body: 'A07 · juriste\n\nVerdict: accepte',
};

const familles = (e: Parameters<typeof jugerLaPr>[0]) => jugerLaPr(e, MOTIFS).map((f) => f.famille);

describe('REQ-JUR-036 — une PR qui touche ce qu’un apporteur lit exige le juriste', () => {
  it('REQ-JUR-036 : les douze motifs sont lus dans la fiche du juriste, pas retapés', () => {
    expect(MOTIFS.map((m) => m.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(MOTIFS[0]!.libelle).toBe('Objectif chiffré');
  });

  it('REQ-JUR-036 : TÉMOIN À DEUX FACES — un écran sans label rougit ; label, checklist et revue du juriste, il passe', () => {
    expect(
      familles({ fichiers: ECRAN, labels: [], corps: COCHEE, revues: [REVUE_JURISTE] })
    ).toEqual(['label_absent']);
    expect(
      familles({
        fichiers: ECRAN,
        labels: ['apporteur-facing'],
        corps: COCHEE,
        revues: [REVUE_JURISTE],
      })
    ).toEqual([]);
  });

  it('REQ-JUR-036 : la checklist absente, un motif non coché, un motif coché « présent » rougissent chacun', () => {
    const base = { fichiers: ECRAN, labels: ['apporteur-facing'], revues: null };
    expect(familles({ ...base, corps: 'rien' })).toEqual(['checklist_absente']);
    expect(familles({ ...base, corps: checklist((n) => (n === 4 ? '' : 'absent')) })).toEqual([
      'motif_non_coche',
    ]);
    expect(
      familles({ ...base, corps: checklist((n) => (n === 2 ? 'présent' : 'absent')) })
    ).toEqual(['motif_present']);
  });

  it('REQ-JUR-036 : sous `--pr`, une revue qui n’est pas du juriste, ou qui refuse, ne compte pas', () => {
    const base = { fichiers: ECRAN, labels: ['apporteur-facing'], corps: COCHEE };
    expect(familles({ ...base, revues: [] })).toEqual(['revue_juriste_absente']);
    expect(
      familles({
        ...base,
        revues: [{ ...REVUE_JURISTE, body: 'A05 · securite\n\nVerdict: accepte' }],
      })
    ).toEqual(['revue_juriste_absente']);
    expect(
      familles({
        ...base,
        revues: [{ ...REVUE_JURISTE, body: 'A07 · juriste\n\nVerdict: refuse' }],
      })
    ).toEqual(['revue_juriste_absente']);
    expect(
      familles({ ...base, revues: [{ ...REVUE_JURISTE, author_association: 'NONE' }] })
    ).toEqual(['revue_juriste_absente']);
  });

  it('REQ-JUR-036 : une PR qui ne touche rien de ce qu’un apporteur lit n’exige ni label ni checklist', () => {
    expect(
      familles({ fichiers: ['scripts/gates/roles.ts'], labels: [], corps: '', revues: [] })
    ).toEqual([]);
  });

  it('REQ-JUR-036 : le périmètre est DÉRIVÉ de la portée « apporteur » de la gate lexicale', () => {
    for (const chemin of [
      'src/app/(espace)/tableau/page.tsx',
      'emails/apporteur/bienvenue.tsx',
      'micro-copy/espace.json',
      'src/content/micro-copy/espace/vocabulaire.ts',
      'src/content/ressources/kit.md',
    ]) {
      expect(
        PERIMETRE_APPORTEUR.some((r) => r.test(chemin)),
        chemin
      ).toBe(true);
      expect(porteeDuFichier(chemin), chemin).toBe('apporteur');
    }
  });

  it('REQ-JUR-036 : TÉMOIN À DEUX FACES — CODEOWNERS déclare le juriste sur tout le périmètre ; privé de son bloc, il rougit', () => {
    const codeowners = readFileSync('.github/CODEOWNERS', 'utf8');
    expect(jugerLaCouverture(codeowners)).toEqual([]);
    const sansJuriste = codeowners
      .split('\n')
      .filter((l) => !l.includes('A07'))
      .join('\n');
    expect(jugerLaCouverture(sansJuriste).map((f) => f.famille)).toContain('codeowners_incomplet');
  });

  it('REQ-JUR-036 : le binaire sans événement de PR juge CODEOWNERS et sort en 0', () => {
    const r = lancer('jur-revue-apporteur-facing');
    expect(r.sortie).toMatch(/CODEOWNERS/);
    expect(r.code).toBe(0);
  });
});

// ── REQ-JUR-037 ──────────────────────────────────────────────────────────────────────────────────

describe('REQ-JUR-037 — la gate lexicale couvre tout ce qu’un apporteur voit ou reçoit', () => {
  it('REQ-JUR-037 : ressources diffusées et composants de l’espace sont de portée « apporteur »', () => {
    for (const chemin of [
      'src/content/ressources/kit.md',
      'public/ressources/faq.html',
      'ressources/presentation.md',
      'src/components/espace/Carte.tsx',
    ]) {
      expect(porteeDuFichier(chemin), chemin).toBe('apporteur');
    }
  });

  it('REQ-JUR-037 : TÉMOIN À DEUX FACES — « objectif du mois » dans une ressource rougit ; « aucun objectif » passe', () => {
    const rouge = controler(
      vueDeFixture([{ chemin: 'src/content/ressources/kit.md', contenu: 'Votre objectif du mois' }])
    );
    expect(rouge.fautes.map((f) => f.famille)).toEqual(['objectif']);
    const vert = controler(
      vueDeFixture([{ chemin: 'src/content/ressources/kit.md', contenu: 'Aucun objectif.' }])
    );
    expect(vert.fautes).toEqual([]);
  });

  it('REQ-JUR-037 : TÉMOIN À DEUX FACES — un gabarit de document intitulé « bulletin de commission » rougit ; « relevé de commissions » passe', () => {
    const rouge = jugerLesDocuments([
      { chemin: 'src/server/pdf/releve.tsx', source: '<h1>Bulletin de commission</h1>' },
    ]);
    expect(rouge.fautes.map((f) => f.famille)).toEqual(['terme_social']);
    const vert = jugerLesDocuments([
      { chemin: 'src/server/pdf/releve.tsx', source: '<h1>Relevé de commissions</h1>' },
    ]);
    expect(vert.fautes).toEqual([]);
    expect(vert.fichiers).toBe(1);
  });

  it('REQ-JUR-037 : dans un document remis, même la négation d’un terme social rougit — le mot seul fait la pièce', () => {
    const r = jugerLesDocuments([
      { chemin: 'src/server/pdf/releve.tsx', source: '<p>Ce relevé n’est pas un bulletin.</p>' },
    ]);
    expect(r.fautes.map((f) => f.famille)).toEqual(['terme_social']);
  });

  it('REQ-JUR-037 : un gabarit qui reprend les rubriques d’un bulletin de paie rougit, sans aucun terme du lexique', () => {
    const r = jugerLesDocuments([
      {
        chemin: 'src/server/pdf/releve.tsx',
        source: '<dl><dt>Employeur</dt><dt>Matricule</dt><dt>Cotisations</dt></dl>',
      },
    ]);
    expect(r.fautes.map((f) => f.famille)).toEqual(['rubriques_de_paie']);
    expect(r.fautes[0]!.message).toContain('matricule');
  });

  it('REQ-JUR-037 : hors du périmètre apporteur et des documents remis, le vocabulaire social n’est pas jugé', () => {
    const r = jugerLesDocuments([
      { chemin: 'src/server/argent/calcul.ts', source: '// aucun bulletin ici' },
    ]);
    expect(r.fichiers).toBe(0);
  });

  it('REQ-JUR-037 : le binaire `jur:lexique-social` sur le dépôt sort en 0 et imprime les fichiers lus', () => {
    const r = lancer('jur-lexique-social');
    expect(r.sortie).toMatch(/fichier\(s\) lu\(s\)/);
    expect(r.code).toBe(0);
  });
});

describe('REQ-JUR-034 / REQ-JUR-035 / REQ-JUR-036 / REQ-JUR-037 — chaque garde sait rougir', () => {
  for (const g of [
    'jur-aucun-agregat-reseau',
    'jur-aucune-progression',
    'jur-revue-apporteur-facing',
    'jur-lexique-social',
  ]) {
    it(`REQ-JUR-034 / REQ-JUR-035 / REQ-JUR-036 / REQ-JUR-037 : ${g} --prove sort en 0, une famille par témoin`, () => {
      const r = lancer(g, '--prove');
      expect(r.sortie).toMatch(/preuve faite/);
      expect(r.code).toBe(0);
    });
  }
});
