// @req REQ-JUR-003
// @req REQ-CPL-012
// @req REQ-JUR-007
// @req REQ-JUR-023
/**
 * `contract-template-complete.spec.ts` — GATE-JUR-CONTRAT-COMPLET (JUR-T01).
 *
 * CE QU'IL TIENT. Le gabarit public `docs/contrat/CONTRAT-APPORTEUR-V1.md` (et son annexe 2) est le
 * texte figé par Will (décision `W11`) : ce test ne juge pas la rédaction, il juge que le gabarit est
 * COMPLET et VÉRIFIABLE —
 *   1. les identifiants `CL-*` de REQ-JUR-003, lus dans l'exigence et jamais retapés, sont tous posés,
 *      et la table de correspondance leur est alignée un pour un ; `CL-SANCTION` est refusé ;
 *   2. toute `{{VARIABLE}}` a une source déclarée ; celles de l'entité RÉSOLVENT depuis
 *      `config/entite.json` (décision `W1`), et aucune valeur de l'entité n'est retapée ; celles qui
 *      n'ont pas de décision renvoient à une question déclarée — jamais une valeur inventée ;
 *   3. le gabarit CONCORDE avec `docs/DECISIONS.md` : chaque ancrage déclaré tient, chaque écart est
 *      déclaré (et un écart déclaré qui disparaît rougit à son tour), toute ligne `avenant` non
 *      tranchée est une question ouverte ;
 *   4. les six acceptations distinctes, la mention de l'art. 48 CPC dans le corps de la clause 14 ;
 *   5. REQ-CPL-012 (deux délais de contestation distincts), REQ-JUR-007 (aucune déchéance),
 *      REQ-JUR-023 (financement CPF effectif, colonne CPF) ;
 *   6. la liste noire du gabarit et `jur:grille-chiffree` ;
 *   7. le REFUS de publication tant que le gabarit est incomplet — la défense à l'exécution, qui
 *      vaut quand la garde lexicale se tait.
 *
 * LIMITE DÉCLARÉE. Une concordance est un ANCRAGE LEXICAL : elle prouve qu'un fragment du registre et
 * un fragment du gabarit sont présents à l'endroit dit, pas que leurs sens coïncident. Une réécriture
 * qui garde les mots et change le sens n'est vue que par la relecture de Will (JUR-T01b).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CLAUSES_RETIREES,
  clausesPosees,
  normaliser,
  notesDAcceptation,
  nonCommissionneesDeLAnnexe1,
  paliersDeLAnnexe1,
  rendre,
  tableDeCorrespondance,
  texteRemis,
  unitesDuGabarit,
  variablesDuTexte,
} from '../../../src/domain/contrat/gabarit';
import {
  FAMILLES_PAR_PALIER,
  VARIABLES,
  controlerVariables,
  sourceDe,
  suffixeDePalier,
  valeurDEntite,
} from '../../../src/domain/contrat/variables';
import {
  CONCORDANCES,
  DIVERGENCES_DECLAREES,
  QUESTIONS_POUR_WILL,
  controlerConcordances,
  lignesDuRegistre,
  perimetreW6,
  referencesDArticle,
  structureW11,
} from '../../../src/domain/contrat/decisions';
import { fautesGrilleChiffree } from '../../../src/domain/contrat/grille-chiffree';
import {
  GabaritNonPubliable,
  exigerGabaritPubliable,
  motifsDeRefus,
} from '../../../src/domain/contrat/publication';
import { LISTE_NOIRE_GABARIT } from '../../../src/domain/lexique/lexique-interdit';
import { analyserGabarit } from '../../../scripts/gates/lexique-apporteurs';
import { CHAMPS, SENTINELLE, valeur, type Registre } from '../../../src/config/entite';

const GABARIT = 'docs/contrat/CONTRAT-APPORTEUR-V1.md';
const ANNEXE_2 = 'docs/contrat/ANNEXE-2-MANDAT.md';

const lire = (chemin: string): string => readFileSync(chemin, 'utf8');
const gabarit = (): string => lire(GABARIT);
const annexe2 = (): string => lire(ANNEXE_2);
const registre = () => lignesDuRegistre(lire('docs/DECISIONS.md'));
const entite = (): Registre => JSON.parse(lire('config/entite.json')) as Registre;

type Exigence = { id: string; texte: string };
type Tache = { id: string; acceptance: string };
const exigence = (id: string): string =>
  (JSON.parse(lire('docs/requirements.json')) as { exigences: Exigence[] }).exigences.find(
    (e) => e.id === id
  )!.texte;
const taches = (): Tache[] => (JSON.parse(lire('docs/tasks.json')) as { taches: Tache[] }).taches;
const acceptation = (id: string): string => taches().find((t) => t.id === id)!.acceptance;

/** Les identifiants de REQ-JUR-003, LUS dans l'exigence (RM-01) : la liste qui précède le refus. */
function identifiantsExiges(): string[] {
  const texte = exigence('REQ-JUR-003');
  const liste = texte.slice(texte.indexOf('suivants'), texte.indexOf('un gabarit incomplet'));
  return [...new Set(liste.match(/CL-[A-Z]+(?:-[A-Z]+)*/g) ?? [])];
}

/** Les articles des six acceptations, LUS dans l'acceptation de la tâche — jamais retapés. */
function articlesDesAcceptations(): string[] {
  const m = /sous chacun des articles ([^—]+?) —/.exec(acceptation('JUR-T01'));
  if (m === null) return [];
  return m[1]!
    .replace(/\*\*/g, '')
    .split(/,|\bet\b/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

const valeursEntite = (): Map<string, string> => {
  const r = entite();
  return new Map(CHAMPS.map((c) => [c.cle, valeur(r, c.cle) ?? SENTINELLE]));
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('REQ-JUR-003 — les identifiants de clause', () => {
  it('REQ-JUR-003 — les identifiants se lisent dans l’exigence (le compte qu’elle annonce) et sont tous posés', () => {
    const exiges = identifiantsExiges();
    const annonce = Number(/(\d+) identifiants/.exec(exigence('REQ-JUR-003'))![1]);
    expect(exiges).toHaveLength(annonce);
    const poses = clausesPosees(gabarit()).map((c) => c.id);
    expect([...poses].sort()).toEqual([...exiges].sort());
  });

  it('REQ-JUR-003 — la table de correspondance est alignée un pour un sur les identifiants posés', () => {
    const table = tableDeCorrespondance(gabarit());
    const poses = clausesPosees(gabarit());
    expect(table.map((l) => l.id).sort()).toEqual(poses.map((c) => c.id).sort());
    // chaque identifiant n'apparaît qu'une fois dans la table
    expect(new Set(table.map((l) => l.id)).size).toBe(table.length);
  });

  it('REQ-JUR-003 — les clauses retirées sont lues dans l’exigence, et aucune n’est posée', () => {
    const retirees = [...exigence('REQ-JUR-003').matchAll(/`(CL-[A-Z-]+)` est retiré/g)].map(
      (m) => m[1]
    );
    expect(retirees.length).toBeGreaterThan(0);
    expect([...CLAUSES_RETIREES].sort()).toEqual([...retirees].sort());
    const texte = gabarit() + annexe2();
    for (const id of retirees) expect(texte).not.toContain(id!);
  });

  it('REQ-JUR-003 — retirer une clause CL-* du gabarit le rend non publiable (fixtureRouge du registre)', () => {
    const mute = gabarit().replace(' CL-SUSPENSION-VERIFICATION', '');
    expect(clausesPosees(mute).map((c) => c.id)).not.toContain('CL-SUSPENSION-VERIFICATION');
    const motifs = motifsDeRefus({
      gabarit: mute,
      annexe2: annexe2(),
      valeurs: {},
      questionsOuvertes: [],
    });
    expect(motifs.join('\n')).toContain('CL-SUSPENSION-VERIFICATION');
  });

  it('REQ-JUR-003 — un gabarit qui porterait une clause retirée est refusé', () => {
    const mute = gabarit().replace('<!-- CL-DROIT -->', '<!-- CL-DROIT CL-SANCTION -->');
    const motifs = motifsDeRefus({
      gabarit: mute,
      annexe2: annexe2(),
      valeurs: {},
      questionsOuvertes: [],
    });
    expect(motifs.join('\n')).toContain('CL-SANCTION');
  });

  it('REQ-JUR-003 — six acceptations distinctes, chacune signalée sous son article, dans le corps', () => {
    const attendus = articlesDesAcceptations();
    expect(acceptation('JUR-T01')).toContain('Six acceptations distinctes');
    expect(attendus).toHaveLength(6);
    expect(notesDAcceptation(texteRemis(gabarit()))).toEqual(attendus);
  });

  it('REQ-JUR-003 — une note d’acceptation retirée fait rougir le décompte', () => {
    const texte = gabarit();
    const i = texte.indexOf('> *Cet article fait l’objet');
    const j = i === -1 ? texte.indexOf("> *Cet article fait l'objet") : i;
    expect(j).toBeGreaterThan(-1);
    const mute = texte.slice(0, j) + texte.slice(texte.indexOf('\n', j) + 1);
    expect(notesDAcceptation(texteRemis(mute))).not.toEqual(articlesDesAcceptations());
  });

  it('REQ-CPL-012 — la clause 14 porte dans son CORPS la loi, la juridiction, l’art. 48 CPC et la qualité de l’Apporteur', () => {
    const art14 = unitesDuGabarit(gabarit()).get('14')!;
    const corps = normaliser(art14.alineas.join('\n'));
    expect(corps).toContain('soumis au droit français');
    expect(corps).toContain('COMPÉTENCE EXCLUSIVE DES TRIBUNAUX');
    expect(corps).toContain('article 48 du code de procédure civile');
    expect(corps).toContain('{{APPORTEUR_QUALITE}}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('REQ-JUR-003 — les variables du gabarit', () => {
  const paliers = () => paliersDeLAnnexe1(gabarit()).map((p) => p.identifiant);

  it('REQ-JUR-003 — toute variable du gabarit et de l’annexe 2 a une source déclarée, et aucune source n’est orpheline', () => {
    const fautes = controlerVariables({
      texte: gabarit() + '\n' + annexe2(),
      paliers: paliers(),
      questions: QUESTIONS_POUR_WILL,
    });
    expect(fautes).toEqual([]);
  });

  it('REQ-JUR-003 — une variable non déclarée rougit, et une déclaration orpheline aussi', () => {
    const avecInconnue = controlerVariables({
      texte: gabarit() + '\n{{VARIABLE_INVENTEE}}',
      paliers: paliers(),
      questions: QUESTIONS_POUR_WILL,
    });
    expect(avecInconnue.map((f) => f.famille)).toContain('variable_non_declaree');
    const sansCapital = controlerVariables({
      texte: gabarit().replace(/\{\{CAPITAL\}\}/g, 'mille'),
      paliers: paliers(),
      questions: QUESTIONS_POUR_WILL,
    });
    expect(sansCapital.map((f) => f.famille)).toContain('declaration_orpheline');
  });

  it('REQ-JUR-003 — une variable « question » sans question déclarée rougit', () => {
    const fautes = controlerVariables({
      texte: gabarit(),
      paliers: paliers(),
      questions: QUESTIONS_POUR_WILL.filter((q) => !q.variables.includes('REPRESENTANT')),
    });
    expect(fautes.map((f) => f.famille)).toContain('question_absente');
  });

  it('REQ-JUR-003 — les variables de l’entité résolvent depuis config/entite.json (W1), sans sentinelle', () => {
    const valeurs = valeursEntite();
    const lireCle = (cle: string) => valeurs.get(cle);
    const liees = Object.entries(VARIABLES).filter(([, s]) => s.genre === 'entite');
    expect(liees.length).toBeGreaterThan(0);
    for (const [nom, source] of liees) {
      const r = valeurDEntite(source, lireCle, SENTINELLE);
      expect(r, nom).toHaveProperty('valeur');
    }
  });

  it('REQ-JUR-003 — une clé d’entité à la sentinelle, absente ou d’une forme inconnue ne résout pas', () => {
    const src = VARIABLES['SOCIETE']!;
    expect(valeurDEntite(src, () => SENTINELLE, SENTINELLE)).toHaveProperty('manque');
    expect(valeurDEntite(src, () => undefined, SENTINELLE)).toHaveProperty('manque');
    expect(valeurDEntite(src, () => '  ', SENTINELLE)).toHaveProperty('manque');
    expect(valeurDEntite(VARIABLES['FORME']!, () => 'SARL-INCONNUE', SENTINELLE)).toHaveProperty(
      'manque'
    );
    expect(valeurDEntite(VARIABLES['FORME']!, () => 'SAS', SENTINELLE)).toEqual({
      valeur: 'société par actions simplifiée',
    });
    expect(valeurDEntite(VARIABLES['SIREN_AXION']!, () => '123456789', SENTINELLE)).toEqual({
      valeur: '123 456 789',
    });
    expect(valeurDEntite(VARIABLES['SIREN_AXION']!, () => '12345', SENTINELLE)).toHaveProperty(
      'manque'
    );
    expect(valeurDEntite(VARIABLES['APPORTEUR_QUALITE']!, () => 'x', SENTINELLE)).toHaveProperty(
      'manque'
    );
  });

  it('REQ-JUR-003 — toute clé d’entité liée existe au registre CPL-T01', () => {
    const cles = new Set(CHAMPS.map((c) => c.cle));
    for (const source of Object.values(VARIABLES)) {
      if (source.genre === 'entite') expect(cles.has(source.cle), source.cle).toBe(true);
    }
  });

  it('REQ-JUR-003 — aucune valeur de l’entité n’est écrite en dur dans le gabarit (RM-01, CPL-T01)', () => {
    const plat = (s: string) => s.replace(/[\s  ]/g, '').toLowerCase();
    const texte = plat(gabarit() + annexe2());
    for (const cle of [
      'entite.denomination',
      'entite.siren',
      'entite.siret',
      'entite.tvaIntracommunautaire',
    ]) {
      const v = valeursEntite().get(cle)!;
      expect(texte, cle).not.toContain(plat(v));
    }
    expect(texte).not.toContain(plat('Paul Verlaine'));
    expect(texte).not.toContain(plat('1 000 euros'));
  });

  it('REQ-JUR-003 — APPORTEUR_QUALITE vient du statut d’exercice recueilli au KYC (DM-11), jamais d’une saisie', () => {
    expect(VARIABLES['APPORTEUR_QUALITE']).toEqual({
      genre: 'kyc',
      champ: 'qualiteExercice',
      tache: 'DM-11',
    });
    expect(acceptation('DM-11')).toContain('qualiteExercice');
    const genres = new Set(Object.values(VARIABLES).map((s) => s.genre));
    expect(genres.has('saisie' as never)).toBe(false);
  });

  it('REQ-JUR-003 — chaque tâche citée par une source existe au plan, et chaque palier a ses quatre variables', () => {
    const ids = new Set(taches().map((t) => t.id));
    for (const source of [
      ...Object.values(VARIABLES),
      ...FAMILLES_PAR_PALIER.map((f) => f.source),
    ]) {
      if ('tache' in source) expect(ids.has(source.tache), source.tache).toBe(true);
    }
    const noms = new Set(variablesDuTexte(gabarit()));
    for (const p of paliers()) {
      for (const f of FAMILLES_PAR_PALIER) {
        expect(noms.has(f.prefixe + suffixeDePalier(p)), `${f.prefixe}${p}`).toBe(true);
      }
    }
    expect(sourceDe('COM_PALIER_INCONNU', paliers())).toBeNull();
    expect(sourceDe('COM_' + suffixeDePalier(paliers()[0]!), paliers())).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('REQ-JUR-003 — concordance du gabarit avec le registre des décisions', () => {
  const entree = (texte: string, md: string = lire('docs/DECISIONS.md')) => ({
    registre: lignesDuRegistre(md),
    gabarit: texte,
    concordances: CONCORDANCES,
    divergences: DIVERGENCES_DECLAREES,
    questions: QUESTIONS_POUR_WILL,
  });

  it('REQ-JUR-003 — le gabarit réel concorde : aucun écart hors des écarts déclarés, aucun écart déclaré périmé', () => {
    const r = controlerConcordances(entree(gabarit()));
    expect(r.fautes).toEqual([]);
    expect(r.ecarts.map((e) => e.cle).sort()).toEqual(
      DIVERGENCES_DECLAREES.map((d) => d.cle).sort()
    );
  });

  it('REQ-JUR-003 — toute ligne « avenant » non tranchée est une question ouverte, et réciproquement', () => {
    const lignes = registre();
    const ouvertes = lignes.filter((l) => l.avenant && l.tranchee === null).map((l) => l.id);
    expect(ouvertes.length).toBeGreaterThan(0);
    const questionnees = new Set(QUESTIONS_POUR_WILL.map((q) => q.decision));
    for (const id of ouvertes) expect(questionnees.has(id), id).toBe(true);
    // HYP-D11 est tranchée : elle n'est PAS une question
    expect(lignes.find((l) => l.id === 'HYP-D11')!.tranchee).toBe('2026-09-03');
    expect(questionnees.has('HYP-D11')).toBe(false);
  });

  it('REQ-JUR-003 — une question dont la décision est tranchée devient périmée et rougit', () => {
    const md = lire('docs/DECISIONS.md').replace(
      /(\| HYP-C1 \|[^\n]*\| )—( \|)$/m,
      '$1**2026-09-20**$2'
    );
    expect(md).not.toBe(lire('docs/DECISIONS.md'));
    const r = controlerConcordances(entree(gabarit(), md));
    expect(r.fautes.map((f) => f.famille)).toContain('question_perimee');
  });

  it('REQ-JUR-003 — une ligne avenant ouverte sans question rougit', () => {
    const r = controlerConcordances({
      ...entree(gabarit()),
      questions: QUESTIONS_POUR_WILL.filter((q) => q.decision !== 'HYP-E1-9'),
    });
    expect(r.fautes.map((f) => f.famille)).toContain('avenant_sans_question');
  });

  it('REQ-JUR-003 — une concordance rompue rougit (W9 : la prolongation retirée de l’art. 3.4)', () => {
    // L'écart DÉCLARÉ sur l'alinéa (W9:3.4:al4) ne masque pas le retrait du texte : l'ancrage de
    // contenu (W9:3.4) rougit seul.
    const mute = gabarit().replace(/prolongée de trois mois, une seule\s+fois/, 'prolongée');
    expect(mute).not.toBe(gabarit());
    const r = controlerConcordances(entree(mute));
    expect(r.fautes.map((f) => f.message).join('\n')).toContain('W9:3.4 —');
    expect(r.fautes.map((f) => f.famille)).toContain('divergence_non_declaree');
    const mute2 = gabarit().replace(/à la hausse comme à la\s+baisse/, 'à la hausse seulement');
    expect(mute2).not.toBe(gabarit());
    const r2 = controlerConcordances(entree(mute2));
    expect(r2.fautes.map((f) => f.famille)).toContain('divergence_non_declaree');
  });

  it('REQ-JUR-003 — une divergence déclarée qui se résorbe rougit (périmée)', () => {
    // HYP-RESIDENCE : le jour où l'art. 6.1 porte la stipulation, la divergence déclarée est périmée
    const mute = gabarit().replace(
      'sous un statut régulièrement déclaré',
      'sous un statut régulièrement déclaré, exerce depuis un établissement immatriculé en France'
    );
    const r = controlerConcordances(entree(mute));
    expect(r.fautes.map((f) => f.famille)).toContain('divergence_perimee');
  });

  it('REQ-JUR-003 — toute référence d’article du registre a sa concordance ; une nouvelle référence rougit', () => {
    const refs = registre().flatMap((l) =>
      referencesDArticle(l.texte).map((r) => ({ ...r, id: l.id }))
    );
    expect(refs.length).toBeGreaterThan(0);
    const md = lire('docs/DECISIONS.md').replace(
      '| HYP-C9 | Entreprises à 0 salarié | **Signal**, jamais un rejet',
      '| HYP-C9 | Entreprises à 0 salarié | **Signal**, jamais un rejet (art. 3.6)'
    );
    expect(md).not.toBe(lire('docs/DECISIONS.md'));
    const r = controlerConcordances(entree(gabarit(), md));
    expect(r.fautes.map((f) => f.famille)).toContain('reference_sans_concordance');
  });

  it('REQ-JUR-003 — une concordance qui cite une décision ou un article absents rougit', () => {
    const r = controlerConcordances({
      ...entree(gabarit()),
      concordances: [
        ...CONCORDANCES,
        {
          decision: 'HYP-FANTOME',
          article: '3.1',
          alinea: null,
          registre: [],
          gabarit: [],
          absents: [],
        },
        { decision: 'W9', article: '99.9', alinea: null, registre: [], gabarit: [], absents: [] },
        {
          decision: 'W9',
          article: '3.4',
          alinea: null,
          registre: ['fragment disparu'],
          gabarit: [],
          absents: [],
        },
      ],
    });
    const familles = r.fautes.map((f) => f.famille);
    expect(familles).toContain('decision_absente');
    expect(familles).toContain('article_absent');
    expect(familles).toContain('registre_sans_fragment');
  });

  it('REQ-JUR-003 — W6 : les paliers et les familles de l’annexe 1 sont ceux de la décision', () => {
    const w6 = perimetreW6(registre().find((l) => l.id === 'W6')!.texte)!;
    expect(w6.paliers).toBe(30);
    expect(w6.familles).toHaveLength(4);
    expect(w6.nonCommissionnees).toHaveLength(5);
    const paliers = paliersDeLAnnexe1(gabarit());
    expect(paliers).toHaveLength(w6.paliers);
    expect(new Set(paliers.map((p) => p.section)).size).toBe(w6.familles.length);
    const racine = (s: string) =>
      normaliser(s)
        .toLowerCase()
        .split(' ')
        .map((m) => m.replace(/s$/, ''))
        .join(' ');
    const annexe = nonCommissionneesDeLAnnexe1(gabarit()).map(racine);
    expect(annexe).toHaveLength(w6.nonCommissionnees.length);
    for (const n of w6.nonCommissionnees) {
      expect(
        annexe.some((a) => a.startsWith(racine(n))),
        n
      ).toBe(true);
    }
    expect(perimetreW6('rien de lisible')).toBeNull();
  });

  it('REQ-JUR-003 — W11 : articles et paliers du registre = ceux du gabarit ; l’écart sur les identifiants est déclaré', () => {
    const w11 = structureW11(registre().find((l) => l.id === 'W11')!.texte)!;
    const articles = [...unitesDuGabarit(gabarit()).keys()].filter((k) => /^\d+$/.test(k));
    expect(w11.articles).toBe(articles.length);
    expect(w11.paliers).toBe(paliersDeLAnnexe1(gabarit()).length);
    // Le registre dit 23 identifiants ; REQ-JUR-003 et le gabarit en portent 22 : écart DÉCLARÉ.
    expect(DIVERGENCES_DECLAREES.map((d) => d.cle)).toContain('W11:identifiants');
    expect(structureW11('rien')).toBeNull();
  });

  it('REQ-JUR-003 — W1 : les valeurs de config/entite.json sont celles de la ligne W1', () => {
    const w1 = registre().find((l) => l.id === 'W1')!;
    expect(w1.tranchee).toBe('2026-09-03');
    for (const cle of [
      'entite.denomination',
      'entite.siren',
      'entite.siret',
      'entite.tvaIntracommunautaire',
      'entite.siege',
    ]) {
      expect(w1.texte, cle).toContain(valeursEntite().get(cle)!);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('REQ-CPL-012 — contestation : deux délais distincts, une réponse motivée', () => {
  const u = () => unitesDuGabarit(gabarit());
  const a2 = () => unitesDuGabarit(annexe2());
  const txt = (m: Map<string, { alineas: string[] }>, k: string) =>
    normaliser(m.get(k)!.alineas.join('\n'));

  it('REQ-CPL-012 — la FORME de la facture se conteste à trente jours de l’envoi du courriel, sauf erreur matérielle (art. 5.2 et annexe 2.4)', () => {
    for (const t of [txt(u(), '5.2'), txt(a2(), '2.4')]) {
      expect(t).toContain(
        'trente jours à compter de l’envoi du courrier électronique'.replace('’', "'")
      );
      expect(t).toContain('sauf erreur matérielle ou preuve contraire');
      expect(t).toContain('porte sur la forme et les mentions de la facture');
    }
  });

  it('REQ-CPL-012 — le CALCUL se conteste dans les douze mois, sans abréger la prescription (art. 5.5)', () => {
    const t = txt(u(), '5.5');
    expect(t).toContain('dans les douze mois de la mise à disposition du relevé');
    expect(t).toContain("il n'abrège pas la prescription de l'action en paiement");
    expect(gabarit() + annexe2()).not.toContain('2254');
  });

  it('REQ-CPL-012 — la Société répond de façon motivée dans les quinze jours (art. 5.6)', () => {
    expect(txt(u(), '5.6')).toContain('répond de façon motivée dans les quinze jours');
  });
});

describe('REQ-JUR-007 — aucune déchéance', () => {
  it('REQ-JUR-007 — le gabarit ne connaît aucune déchéance ; les commissions acquises sont payées au dernier relevé sans seuil', () => {
    const texte = normaliser(gabarit() + annexe2()).toLowerCase();
    for (const mot of ['déchéance', 'déchu', 'dechue']) expect(texte).not.toContain(mot);
    const u = unitesDuGabarit(gabarit());
    expect(normaliser(u.get('12.2')!.alineas.join(' '))).toContain(
      "Les commissions déjà acquises sont payées au dernier relevé, sans application du seuil de l'article 5.1"
    );
    expect(normaliser(u.get('12.3')!.alineas.join(' '))).toContain(
      "Les commandes signées avant la fin du contrat continuent d'ouvrir droit à commission"
    );
  });

  it('REQ-JUR-007 — une déchéance réintroduite fait rougir la concordance HYP-D11', () => {
    const mute = gabarit().replace(
      '**12.4**',
      '**12.4** Les commissions en attente sont frappées de déchéance.\n\n**12.4 bis**'
    );
    const r = controlerConcordances({
      registre: registre(),
      gabarit: mute,
      concordances: CONCORDANCES,
      divergences: DIVERGENCES_DECLAREES,
      questions: QUESTIONS_POUR_WILL,
    });
    expect(r.fautes.map((f) => f.famille)).toContain('divergence_non_declaree');
  });
});

describe('REQ-JUR-023 — CPF', () => {
  it('REQ-JUR-023 — l’exclusion porte sur le financement EFFECTIF (art. 8.1 al. 2 et A1.6)', () => {
    const u = unitesDuGabarit(gabarit());
    const phrase =
      'effectivement financée, en tout ou partie, par le compte personnel de formation';
    expect(normaliser(u.get('8.1')!.alineas[1]!)).toContain(phrase);
    expect(normaliser(u.get('A1.6')!.alineas.join(' '))).toContain(phrase);
  });

  it('REQ-JUR-023 — chaque palier de l’annexe 1 porte une colonne CPF, dérivée de pricing.ts', () => {
    const paliers = paliersDeLAnnexe1(gabarit());
    for (const p of paliers) {
      expect(p.cpf, p.identifiant).toBe(`{{CPF_${suffixeDePalier(p.identifiant)}}}`);
    }
    const cpf = FAMILLES_PAR_PALIER.find((f) => f.prefixe === 'CPF_')!;
    expect(cpf.source).toMatchObject({ genre: 'pricing', champ: 'cpfEligible' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('REQ-JUR-003 — la liste noire du gabarit (P-4)', () => {
  /** Les termes de l'acceptation, LUS dans la tâche : « liste noire : `…`, `…`, « … » … ». */
  function termesDeLAcceptation(): string[] {
    const a = acceptation('JUR-T01');
    const bloc = a.slice(a.indexOf('liste noire'), a.indexOf("C'est le seul moyen"));
    return [...bloc.matchAll(/`([^`]+)`|« ([^»]+) »/g)]
      .map((m) => (m[1] ?? m[2])!.trim())
      .filter((t) => !/art\. 19/.test(t));
  }

  it('REQ-JUR-003 — la SSOT couvre chaque terme de l’acceptation', () => {
    const termes = termesDeLAcceptation();
    expect(termes.length).toBeGreaterThanOrEqual(7);
    for (const t of termes) expect(LISTE_NOIRE_GABARIT.formes, t).toContain(t);
  });

  it('REQ-JUR-003 — le gabarit réel et son annexe 2 sont verts, l’art. 19 compris', () => {
    for (const [chemin, contenu] of [
      [GABARIT, gabarit()],
      [ANNEXE_2, annexe2()],
    ] as const) {
      expect(analyserGabarit({ chemin, contenu }).fautes).toEqual([]);
    }
    expect(analyserGabarit({ chemin: GABARIT, contenu: gabarit() }).exemptions.length).toBe(2);
  });

  it('REQ-JUR-003 — chaque terme rougit, même nié, même en fin de phrase ; « renonciation » rougit hors des deux chaînes de l’art. 19', () => {
    for (const forme of LISTE_NOIRE_GABARIT.formes) {
      const r = analyserGabarit({
        chemin: GABARIT,
        contenu: `**11.3** Aucune ${forme}.`,
      });
      expect(r.fautes.length, forme).toBeGreaterThan(0);
    }
    const art19Augmente = gabarit().replace(
      'ne vaut pas renonciation à s’en prévaloir ultérieurement.'.replace('’', "'"),
      "ne vaut pas renonciation à s'en prévaloir ultérieurement. L'Apporteur renonce à toute indemnité."
    );
    expect(art19Augmente).not.toBe(gabarit());
    expect(analyserGabarit({ chemin: GABARIT, contenu: art19Augmente }).fautes.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// W15 (2026-09-25) : l'art. 4.6 porte DEUX clauses de plus. REQ-JUR-003 fige le compte des
// identifiants à 22 (P-5 : une matière nouvelle élargit un libellé existant) — les deux clauses
// sont donc annotées `CL-IDENTITE-PARRAINAGE`, dont la table de correspondance couvre al. 4 à 8.
describe('REQ-JUR-003 — art. 4.6 amendé par W15 (HYP-W15-ART-4-6, HYP-W15-PARRAIN-A-DATE)', () => {
  const alinea = (n: number): string =>
    normaliser(unitesDuGabarit(gabarit()).get('4.6')!.alineas[n - 1] ?? '');

  it('REQ-JUR-003 — al. 6 amendé : la liste des filleuls directs, réduite, et rien d’autre', () => {
    const al6 = alinea(6);
    for (const fragment of [
      "n'emporte aucune fonction d'encadrement",
      'la liste de ses filleuls directs',
      'au prénom',
      "à l'initiale du nom",
      "à l'état de son contrat",
      '« en signature » ou « signé »',
      'postérieures à sa dernière résiliation',
      'sort de la liste',
      'aucun montant par filleul',
      'aucune donnée relative à son activité',
      'aucune date qui lui soit propre',
      'les personnes que le filleul a lui-même présentées',
      "ni aucune mesure prise à l'égard du filleul",
      'suspension',
      'vérification',
      'texte identique pour tous les parrains',
      '{{PARRAINAGE_MOIS}}',
    ]) {
      expect(al6, fragment).toContain(fragment);
    }
    // l'ancienne rédaction ne laissait voir que le montant : elle ne subsiste nulle part
    expect(normaliser(gabarit())).not.toContain(
      'autre que le montant du parrainage qui lui revient'
    );
  });

  it('REQ-JUR-003 — nouvel alinéa : correction du rattachement, motifs limitatifs, effet futur', () => {
    const al8 = alinea(8);
    for (const fragment of [
      'Correction du rattachement',
      'rattacher un filleul à un autre parrain',
      "pour l'un des seuls motifs suivants",
      'une erreur dans le rattachement initial',
      'une fraude ou un auto-parrainage',
      'le départ du parrain ou la résiliation de son contrat',
      "ne vaut que pour l'avenir",
      "restent acquises au parrain d'origine",
      "L'accord du parrain d'origine n'est pas requis",
      "Le filleul, le parrain d'origine et le nouveau parrain en sont informés",
      'sans indication du motif',
      "Une reprise opérée après la date d'effet sur une commission acquise avant cette date est imputée au parrain d'origine",
    ]) {
      expect(al8, fragment).toContain(fragment);
    }
    // motifs LIMITATIFS : aucune formule qui rouvrirait la liste
    expect(al8).not.toMatch(/notamment|tout autre motif|par exemple|tel que/i);
    // l'al. 8 est le dernier : aucun alinéa ne le suit dans l'art. 4.6
    expect(unitesDuGabarit(gabarit()).get('4.6')!.alineas).toHaveLength(8);
  });

  it('REQ-JUR-003 — la table de correspondance rattache les deux clauses à CL-IDENTITE-PARRAINAGE', () => {
    const ligne = tableDeCorrespondance(gabarit()).find((l) => l.id === 'CL-IDENTITE-PARRAINAGE');
    expect(ligne?.articles).toBe('4.6 al. 4 à 8');
  });
});

describe('REQ-JUR-003 — jur:grille-chiffree', () => {
  const annexe = (cellule: string) =>
    `## Annexe 1 — Grille\n\n| Palier | Commission |\n| --- | --- |\n| Essentielle | ${cellule} |\n\n## Annexe 2\n`;

  it('REQ-JUR-003 — une cellule « forfait », « barème » ou « pourcentage » sans valeur numérique rougit (fixtureRouge)', () => {
    for (const c of ['forfait', 'Barème', 'bareme non publié', 'pourcentage du HT']) {
      expect(
        fautesGrilleChiffree(annexe(c)).map((f) => f.famille),
        c
      ).toContain('mot_sans_valeur');
    }
  });

  it('REQ-JUR-003 — la même cellule chiffrée est verte, et le gabarit source est vert', () => {
    for (const c of ['forfait 12', 'pourcentage 7,5', '{{COM_X}}', 'Aucune']) {
      expect(fautesGrilleChiffree(annexe(c)), c).toEqual([]);
    }
    expect(fautesGrilleChiffree(gabarit())).toEqual([]);
  });

  it('REQ-JUR-003 — un gabarit sans annexe 1 ne passe pas pour vert', () => {
    expect(fautesGrilleChiffree('# rien').map((f) => f.famille)).toEqual(['annexe_absente']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('REQ-JUR-003 — un gabarit incomplet ne peut pas être publié', () => {
  /** Toutes les variables du texte, chacune pourvue d'une valeur explicite (RM-11). */
  const toutesPourvues = (valeurCom: string): Record<string, string> =>
    Object.fromEntries(
      variablesDuTexte(gabarit() + annexe2()).map((v) => [
        v,
        v.startsWith('COM_') ? valeurCom : 'v1',
      ])
    );

  it('REQ-JUR-003 — aujourd’hui le gabarit est REFUSÉ : questions ouvertes et variables non résolues', () => {
    expect(QUESTIONS_POUR_WILL.length).toBeGreaterThan(0);
    const entree = {
      gabarit: gabarit(),
      annexe2: annexe2(),
      valeurs: {},
      questionsOuvertes: QUESTIONS_POUR_WILL,
    };
    const motifs = motifsDeRefus(entree);
    expect(motifs.some((m) => m.includes('question'))).toBe(true);
    expect(motifs.some((m) => m.includes('{{CAPITAL}}'))).toBe(true);
    expect(() => exigerGabaritPubliable(entree)).toThrow(GabaritNonPubliable);
  });

  it('REQ-JUR-003 — tout résolu, aucune question : publiable ; une cellule « forfait » nue le rend refusé', () => {
    const base = { gabarit: gabarit(), annexe2: annexe2(), questionsOuvertes: [] };
    expect(motifsDeRefus({ ...base, valeurs: toutesPourvues('forfait 12') })).toEqual([]);
    expect(() =>
      exigerGabaritPubliable({ ...base, valeurs: toutesPourvues('forfait 12') })
    ).not.toThrow();
    const refus = motifsDeRefus({ ...base, valeurs: toutesPourvues('forfait') });
    expect(refus.join('\n')).toContain('forfait');
  });

  it('REQ-JUR-003 — le texte remis s’arrête avant la table technique, et le rendu ne laisse aucune variable', () => {
    const remis = texteRemis(gabarit());
    expect(remis).not.toContain('Correspondance article');
    expect(remis).toContain('Annexe 1');
    const rendu = rendre(remis, toutesPourvues('forfait 12'));
    expect(variablesDuTexte(rendu)).toEqual([]);
    expect(rendre('{{A}} {{B}}', { A: 'x' })).toBe('x {{B}}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('REQ-JUR-003 — les lecteurs du gabarit et du registre, sur leurs cas limites', () => {
  const concordances = (
    registre: ReturnType<typeof lignesDuRegistre>,
    questions = QUESTIONS_POUR_WILL
  ) =>
    controlerConcordances({
      registre,
      gabarit: gabarit(),
      concordances: CONCORDANCES,
      divergences: DIVERGENCES_DECLAREES,
      questions,
    });

  it('REQ-JUR-003 — sans ligne W11, ou W11 illisible, la structure ne passe pas pour conforme', () => {
    const sansW11 = registre().filter((l) => l.id !== 'W11');
    expect(concordances(sansW11).fautes.map((f) => f.famille)).toContain('structure_illisible');
    const illisible = registre().map((l) => (l.id === 'W11' ? { ...l, texte: 'W11 figé' } : l));
    expect(concordances(illisible).fautes.map((f) => f.famille)).toContain('structure_illisible');
  });

  it('REQ-JUR-003 — un écart déclaré dont la question a disparu rougit', () => {
    const sansQ13 = QUESTIONS_POUR_WILL.filter((q) => q.id !== 'JUR-T01-Q13');
    const r = concordances(registre(), sansQ13);
    expect(r.fautes.map((f) => f.famille)).toContain('question_absente');
  });

  it('REQ-JUR-003 — une référence d’alinéa sans ancrage rougit, une question sur une décision absente est périmée', () => {
    const md = lire('docs/DECISIONS.md').replace(
      '| HYP-C9 | Entreprises à 0 salarié | **Signal**, jamais un rejet',
      '| HYP-C9 | Entreprises à 0 salarié | **Signal**, jamais un rejet (art. 3.6 al. 2)'
    );
    const r = concordances(lignesDuRegistre(md));
    expect(r.fautes.map((f) => f.message).join('\n')).toContain('art. 3.6 al. 2');
    const fantome = [
      ...QUESTIONS_POUR_WILL,
      { id: 'JUR-T01-Q99', decision: 'HYP-FANTOME', objet: 'témoin', variables: [] },
    ];
    const r2 = concordances(registre(), fantome);
    expect(r2.fautes.map((f) => f.message).join('\n')).toContain('absente du registre');
  });

  it('REQ-JUR-003 — le registre se lit ligne à ligne, une rangée vide ne produit rien', () => {
    const lignes = lignesDuRegistre(
      '## 1. Titre\n\n|\n| **W1** ✅ *tranchée 2026-09-03* | x | **avenant** |\n## 2. Hyp\n| HYP-X | y | — |'
    );
    expect(lignes.map((l) => [l.id, l.tranchee, l.avenant])).toEqual([
      ['W1', '2026-09-03', true],
      ['HYP-X', null, false],
    ]);
  });

  it('REQ-JUR-003 — « avenant » est une CATÉGORIE de cellule, pas un mot de la prose', () => {
    const lignes = lignesDuRegistre(
      '## 2. Hyp\n| HYP-P | un **avenant** envoyé ne change rien | paramètre | — |\n' +
        '| HYP-A | objet | **avenant** | — |'
    );
    expect(lignes.map((l) => [l.id, l.avenant])).toEqual([
      ['HYP-P', false],
      ['HYP-A', true],
    ]);
  });

  it('REQ-JUR-003 — une référence hors contrat déclarée se tait ; son fragment disparu, elle rougit', () => {
    expect(concordances(registre()).fautes).toEqual([]);
    const sansFragment = registre().map((l) =>
      l.id === 'HYP-W15-NOTES'
        ? { ...l, texte: l.texte.replace('du module RGPD', 'du contrat') }
        : l
    );
    const r = concordances(sansFragment);
    expect(r.fautes.map((f) => f.famille)).toContain('hors_contrat_perimee');
    expect(r.fautes.map((f) => f.message).join('\n')).toContain("HYP-W15-NOTES cite l'art. 15");
  });

  it('REQ-JUR-003 — un texte sans table, sans annexe, sans colonne CPF se lit sans rien inventer', () => {
    expect(tableDeCorrespondance('# rien')).toEqual([]);
    expect(texteRemis('# rien\ntexte')).toBe('# rien\ntexte');
    expect(paliersDeLAnnexe1('# rien')).toEqual([]);
    const sansCpf =
      '## Annexe 1 — G\n\n### A1.1 — F\n\n| Palier | Identifiant |\n| --- | --- |\n' +
      '| Sans identifiant | aucun |\n| Essentielle | `palier-x` |\n';
    expect(paliersDeLAnnexe1(sansCpf)).toEqual([
      { section: 'A1.1', identifiant: 'palier-x', cpf: null },
    ]);
  });

  it('REQ-JUR-003 — sans table de correspondance, ou avec une clause hors table, la publication est refusée', () => {
    const sansTable = texteRemis(gabarit());
    const motifs = motifsDeRefus({
      gabarit: sansTable,
      annexe2: annexe2(),
      valeurs: {},
      questionsOuvertes: [],
    });
    expect(motifs).toContain('table de correspondance des clauses absente');
    const horsTable = gabarit().replace('<!-- CL-DROIT -->', '<!-- CL-DROIT CL-INVENTEE -->');
    const motifs2 = motifsDeRefus({
      gabarit: horsTable,
      annexe2: annexe2(),
      valeurs: {},
      questionsOuvertes: [],
    });
    expect(motifs2).toContain('clause CL-INVENTEE absente de la table de correspondance');
  });
});
