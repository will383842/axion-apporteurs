// @req REQ-CPL-009
// @req REQ-JUR-009
// @req REQ-JUR-025
// @req REQ-SEC-030
/**
 * `registre-rgpd.spec.ts` — le registre de l'article 30 et l'analyse d'impact (JUR-T04).
 *
 * CE QU'IL TIENT.
 *   1. Le registre (`docs/rgpd/registre-article-30.md`) décrit EXACTEMENT trois traitements
 *      (REQ-SEC-030), et chacun porte ses rubriques : finalité, base légale, personnes, catégories,
 *      origine, durée, destinataires, transferts, information, droits, sécurité (REQ-JUR-025).
 *   2. AUCUN FAIT SANS SOURCE. Chaque rubrique cite au moins une source qui EXISTE — exigence
 *      active de `docs/requirements.json`, ligne de `docs/DECISIONS.md`, article du gabarit de
 *      contrat, table du schéma, fichier du dépôt, constante de la SSOT des seuils — ou se déclare
 *      « À compléter — source manquante » avec sa question. Une source citée qui n'existe pas rougit.
 *   3. RM-01 : les données stockées se DÉRIVENT de `prisma/schema.prisma`, jamais d'une liste tapée
 *      ici. Chaque table du schéma est rattachée à un traitement ou déclarée sans donnée personnelle,
 *      dans les deux sens ; une table déclarée sans donnée personnelle ne porte aucune colonne
 *      personnelle au sens des conventions du schéma (bloc chiffré `Bytes`, empreinte de courriel, de
 *      téléphone ou d'adresse réseau, lien vers un apporteur ou un utilisateur de la console).
 *   4. Les fiches tiers du dépôt ont chacune leur ligne au registre des destinataires ; le push web
 *      et Telegram y sont des sous-traitants hors Union européenne dont la charge ne porte ni
 *      coordonnée ni montant (REQ-SEC-033), mais un identifiant pseudonymisé : le registre le dit,
 *      et dit que le transfert doit être encadré (relevé de la lentille `securite`, PR #233).
 *   5. L'analyse d'impact (`docs/rgpd/aipd.md`) couvre les quatre objets de REQ-CPL-009, ne se dit
 *      signée qu'avec une date et un signataire, et porte la mise en balance de l'intérêt légitime.
 *   6. L'entité responsable n'est pas recopiée : le registre renvoie à `config/entite.json` (W1).
 *
 * RM-02 : chaque garde de couverture a son témoin rouge et son contre-témoin vert.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const lire = (chemin: string): string => readFileSync(chemin, 'utf8');

const CHEMIN_REGISTRE = 'docs/rgpd/registre-article-30.md';
const CHEMIN_AIPD = 'docs/rgpd/aipd.md';
const REGISTRE = existsSync(CHEMIN_REGISTRE) ? lire(CHEMIN_REGISTRE) : '';
const AIPD = existsSync(CHEMIN_AIPD) ? lire(CHEMIN_AIPD) : '';
const SCHEMA = lire('prisma/schema.prisma');
const DECISIONS = lire('docs/DECISIONS.md');
const CONTRAT = lire('docs/contrat/CONTRAT-APPORTEUR-V1.md');

type Exigence = { id: string; statut: string };
const EXIGENCES: Exigence[] = (() => {
  const brut = JSON.parse(lire('docs/requirements.json')) as unknown;
  if (Array.isArray(brut)) return brut as Exigence[];
  const liste = Object.values(brut as Record<string, unknown>).find(Array.isArray);
  return (liste ?? []) as Exigence[];
})();

const MARQUEUR = 'à compléter — source manquante';

/** Les rubriques que chaque traitement porte (article 30.1 du RGPD, et REQ-JUR-025). */
const RUBRIQUES = [
  'Finalité',
  'Base légale',
  'Personnes concernées',
  'Catégories de données',
  'Origine des données',
  'Durée de conservation',
  'Destinataires',
  'Transferts hors Union européenne',
  'Information des personnes',
  'Droits et modalités d’exercice',
  'Mesures de sécurité',
] as const;

// ── lecture du Markdown ──────────────────────────────────────────────────────

/** Le texte d'une section `## …` dont le titre commence par `prefixe`, jusqu'au `## ` suivant. */
function section(texte: string, prefixe: string): string {
  const lignes = texte.split('\n');
  const debut = lignes.findIndex((l) => l.startsWith(`## ${prefixe}`));
  if (debut < 0) return '';
  const fin = lignes.findIndex((l, i) => i > debut && l.startsWith('## '));
  return lignes.slice(debut, fin < 0 ? undefined : fin).join('\n');
}

/**
 * Les lignes des tableaux Markdown du texte, cellules rognées. Une ligne suivie d'un séparateur est
 * un EN-TÊTE et n'est pas rendue, le séparateur non plus : un texte qui porte plusieurs tableaux
 * rend leurs seules lignes de données.
 */
function lignesDeTableau(texte: string): string[][] {
  const cellules = (l: string): string[] =>
    l
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const estSeparateur = (l: string | undefined): boolean =>
    l !== undefined && l.trim().startsWith('|') && cellules(l).every((c) => /^:?-{3,}:?$/.test(c));
  const lignes = texte.split('\n');
  return lignes
    .filter(
      (l, i) => l.trim().startsWith('|') && !estSeparateur(l) && !estSeparateur(lignes[i + 1])
    )
    .map(cellules);
}

type Traitement = { id: string; rubriques: Map<string, { contenu: string; sources: string }> };

function traitements(registre: string): Traitement[] {
  const corps = section(registre, '2.');
  const blocs = corps.split(/^### /m).slice(1);
  return blocs.map((bloc) => {
    const id = /^(TRT-[A-Z-]+)/.exec(bloc)?.[1] ?? '';
    const rubriques = new Map<string, { contenu: string; sources: string }>();
    for (const [rubrique, contenu, sources] of lignesDeTableau(bloc)) {
      if (rubrique !== undefined)
        rubriques.set(rubrique, { contenu: contenu ?? '', sources: sources ?? '' });
    }
    return { id, rubriques };
  });
}

// ── résolution des sources ───────────────────────────────────────────────────

const TABLES_DU_SCHEMA_REEL = tablesDuSchema(SCHEMA).map((t) => t.table);

/** Chaque référence que la cellule nomme, et la faute si elle ne se résout pas. */
function sourcesDe(cellule: string): { resolues: string[]; fautes: string[] } {
  const resolues: string[] = [];
  const fautes: string[] = [];
  const noter = (ok: boolean, ref: string) => (ok ? resolues : fautes).push(ref);

  for (const [ref] of cellule.matchAll(/REQ-[A-Z]+-\d{3}/g)) {
    noter(
      EXIGENCES.some((e) => e.id === ref && e.statut === 'active'),
      ref
    );
  }
  for (const [ref] of cellule.matchAll(
    /(?<![\w-])(?:W\d{1,2}|HYP-[A-Z0-9-]*[A-Z0-9]|DEC-[A-Z]+-\d+)(?![\w-])/g
  )) {
    const echappe = ref.replace(/[-]/g, '\\-');
    noter(new RegExp(`^\\|\\s*\\**${echappe}\\**[\\s|]`, 'm').test(DECISIONS), ref);
  }
  for (const m of cellule.matchAll(/contrat art\. (\d+)(?:\.(\d+))?/g)) {
    const [ref, article, alinea] = m;
    const existe =
      alinea === undefined
        ? new RegExp(`^### Article ${article} `, 'm').test(CONTRAT)
        : new RegExp(`\\*\\*${article}\\.${alinea}(?:\\*\\*| )`).test(CONTRAT);
    noter(existe, ref);
  }
  for (const [ref, table] of cellule.matchAll(/table `([a-z_]+)`/g)) {
    noter(TABLES_DU_SCHEMA_REEL.includes(table ?? ''), ref);
  }
  for (const [ref] of cellule.matchAll(
    /(?:docs|config|src|prisma)\/[\w./()-]+\.(?:md|json|ts|tsx|prisma)/g
  )) {
    noter(existsSync(ref), ref);
  }
  for (const [, constante] of cellule.matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)) {
    const ref = constante ?? '';
    noter(ref in SEUILS || DECISIONS.includes(ref), ref);
  }
  return { resolues, fautes };
}

/** Une cellule qui déclare un manque pose sa question. */
function manqueSansQuestion(cellule: string): boolean {
  const bas = cellule.toLowerCase();
  const i = bas.indexOf(MARQUEUR);
  if (i < 0) return false;
  const suite = cellule.slice(i);
  return !/Question\s*:/.test(suite) || !suite.includes('?');
}

// ── le schéma, dérivé ────────────────────────────────────────────────────────

type Colonne = { nom: string; type: string };
type TableDuSchema = { modele: string; table: string; colonnes: Colonne[] };

function tablesDuSchema(schema: string): TableDuSchema[] {
  const tables: TableDuSchema[] = [];
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, modele, corps] = m;
    const table = /@@map\("([^"]+)"\)/.exec(corps ?? '')?.[1] ?? modele ?? '';
    const colonnes: Colonne[] = [];
    for (const ligne of (corps ?? '').split('\n')) {
      const c = /^\s+(\w+)\s+(\w+)/.exec(ligne);
      if (c !== null && !ligne.trim().startsWith('//'))
        colonnes.push({ nom: c[1] ?? '', type: c[2] ?? '' });
    }
    tables.push({ modele: modele ?? '', table, colonnes });
  }
  return tables;
}

/**
 * Une colonne personnelle, au sens des CONVENTIONS du schéma (REQ-SEC-024) : un bloc chiffré
 * (`Bytes`, écrit par `colonnesPii`), une empreinte de courriel, de téléphone ou d'adresse réseau, ou
 * un lien vers une personne (apporteur, utilisateur de la console).
 */
function estPersonnelle(c: Colonne): boolean {
  return (
    c.type === 'Bytes' ||
    /^(email|phone|ip)Hash$/.test(c.nom) ||
    c.type === 'Apporteur' ||
    c.type === 'UtilisateurConsole' ||
    c.nom === 'apporteurId' ||
    c.nom === 'utilisateurConsoleId'
  );
}

const SANS_DONNEE = 'aucune donnée personnelle';

type LigneDeDonnees = { table: string; traitements: string; duree: string; sources: string };

function donneesDuRegistre(registre: string): LigneDeDonnees[] {
  return lignesDeTableau(section(registre, '3.')).map(([table, traitements, duree, sources]) => ({
    table: (table ?? '').replace(/`/g, ''),
    traitements: traitements ?? '',
    duree: duree ?? '',
    sources: sources ?? '',
  }));
}

/** La garde de couverture : ce que le schéma stocke, le registre le déclare. */
function fautesDeCouverture(schema: string, registre: string): string[] {
  const fautes: string[] = [];
  const ids = traitements(registre).map((t) => t.id);
  const declarees = donneesDuRegistre(registre);
  const tables = tablesDuSchema(schema);
  for (const t of tables) {
    const ligne = declarees.find((d) => d.table === t.table);
    if (ligne === undefined) {
      fautes.push(`table_non_declaree: ${t.table}`);
      continue;
    }
    const cites = [...ligne.traitements.matchAll(/TRT-[A-Z-]+/g)].map(([x]) => x);
    const sans = ligne.traitements.toLowerCase().includes(SANS_DONNEE);
    if (cites.length === 0 && !sans) fautes.push(`table_sans_traitement: ${t.table}`);
    for (const x of cites)
      if (!ids.includes(x)) fautes.push(`traitement_inconnu: ${t.table} → ${x}`);
    if (sans) {
      for (const c of t.colonnes.filter(estPersonnelle)) {
        fautes.push(`colonne_personnelle_sans_traitement: ${t.table}.${c.nom}`);
      }
    }
  }
  for (const d of declarees) {
    if (!tables.some((t) => t.table === d.table))
      fautes.push(`table_absente_du_schema: ${d.table}`);
  }
  return fautes;
}

// ── 1. trois traitements, chacun complet ─────────────────────────────────────

describe('registre de l’article 30', () => {
  it('REQ-SEC-030 — le registre décrit exactement trois traitements, aux identifiants distincts', () => {
    const ids = traitements(REGISTRE).map((t) => t.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^TRT-[A-Z]+(?:-[A-Z]+)*$/);
  });

  it('REQ-JUR-025 — chaque traitement porte toutes ses rubriques, dont finalité, base légale et durée', () => {
    const liste = traitements(REGISTRE);
    expect(liste).toHaveLength(3);
    for (const t of liste) {
      for (const r of RUBRIQUES) {
        expect(t.rubriques.has(r), `${t.id} : rubrique « ${r} » absente`).toBe(true);
        expect(t.rubriques.get(r)?.contenu, `${t.id} : rubrique « ${r} » vide`).not.toBe('');
      }
    }
  });

  it('REQ-JUR-025 — chaque rubrique cite une source qui existe, ou déclare son manque avec la question posée', () => {
    const fautes: string[] = [];
    for (const t of traitements(REGISTRE)) {
      for (const [rubrique, { contenu, sources }] of t.rubriques) {
        const { resolues, fautes: pendantes } = sourcesDe(`${contenu} ${sources}`);
        for (const p of pendantes) fautes.push(`${t.id} › ${rubrique} : source introuvable ${p}`);
        const manque = `${contenu} ${sources}`.toLowerCase().includes(MARQUEUR);
        if (resolues.length === 0 && !manque) fautes.push(`${t.id} › ${rubrique} : aucune source`);
        if (manqueSansQuestion(contenu) || manqueSansQuestion(sources)) {
          fautes.push(`${t.id} › ${rubrique} : manque déclaré sans question`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it('REQ-JUR-025 — témoin : une source inventée ou un manque sans question fait rougir la résolution', () => {
    expect(sourcesDe('REQ-JUR-999').fautes).toEqual(['REQ-JUR-999']);
    expect(sourcesDe('HYP-INVENTEE').fautes).toEqual(['HYP-INVENTEE']);
    expect(sourcesDe('contrat art. 7.9').fautes).toEqual(['contrat art. 7.9']);
    expect(sourcesDe('table `prospects`').fautes).toEqual(['table `prospects`']);
    expect(manqueSansQuestion('À compléter — source manquante.')).toBe(true);
    // Contre-témoin : des sources réelles se résolvent, un manque avec question passe.
    expect(sourcesDe('REQ-SEC-030, HYP-RGPD-RETENTION, contrat art. 7.2, W1').fautes).toEqual([]);
    expect(manqueSansQuestion('À compléter — source manquante. Question : laquelle ?')).toBe(false);
  });
});

// ── 2. les données stockées, dérivées du schéma ──────────────────────────────

describe('données stockées, dérivées de prisma/schema.prisma (RM-01)', () => {
  it('REQ-SEC-030 — chaque table du schéma est rattachée à un traitement ou déclarée sans donnée personnelle, et réciproquement', () => {
    expect(tablesDuSchema(SCHEMA).length).toBeGreaterThan(0);
    expect(fautesDeCouverture(SCHEMA, REGISTRE)).toEqual([]);
  });

  it('REQ-SEC-030 — chaque table rattachée porte sa durée de conservation, sourcée ou déclarée manquante avec sa question', () => {
    const fautes: string[] = [];
    expect(donneesDuRegistre(REGISTRE).length).toBeGreaterThan(0);
    for (const d of donneesDuRegistre(REGISTRE)) {
      if (d.duree === '') fautes.push(`${d.table} : durée vide`);
      const { resolues, fautes: pendantes } = sourcesDe(`${d.duree} ${d.sources}`);
      for (const p of pendantes) fautes.push(`${d.table} : source introuvable ${p}`);
      const manque = d.duree.toLowerCase().includes(MARQUEUR);
      if (resolues.length === 0 && !manque) fautes.push(`${d.table} : durée sans source`);
      if (manqueSansQuestion(d.duree)) fautes.push(`${d.table} : manque sans question`);
    }
    expect(fautes).toEqual([]);
  });

  it('REQ-SEC-030 — une durée reprise de HYP-A02-RETENTION est celle que la décision écrit pour cette table (citée, jamais réécrite)', () => {
    const ligne = DECISIONS.split('\n').find((l) => l.startsWith('| HYP-A02-RETENTION |')) ?? '';
    const decision = ligne.replace(/\*\*/g, '');
    expect(decision).not.toBe('');
    const reprises = donneesDuRegistre(REGISTRE).filter(
      (d) => d.sources.includes('HYP-A02-RETENTION') && !d.duree.toLowerCase().includes(MARQUEUR)
    );
    expect(reprises.length).toBeGreaterThan(0);
    for (const d of reprises) {
      expect(decision, `${d.table} : « ${d.duree} »`).toContain(`\`${d.table}\` ${d.duree}`);
    }
    // Témoin : une durée réécrite ne se retrouve pas dans la décision.
    expect(decision).not.toContain('`liens_magiques` 31 jours après expiration');
  });

  it('REQ-SEC-030 — témoin rouge : un modèle personnel ajouté au schéma sans traitement déclaré fait rougir', () => {
    const ajout = [
      'model Prospect {',
      '  id         String @id @default(uuid()) @db.Uuid',
      '  nomChiffre Bytes  @map("nom_chiffre")',
      '',
      '  @@map("prospects")',
      '}',
    ].join('\n');
    expect(fautesDeCouverture(`${SCHEMA}\n${ajout}\n`, REGISTRE)).toEqual([
      'table_non_declaree: prospects',
    ]);
  });

  it('REQ-SEC-030 — témoin rouge : une colonne personnelle glissée dans une table déclarée sans donnée personnelle fait rougir', () => {
    const sans = donneesDuRegistre(REGISTRE).find((d) =>
      d.traitements.toLowerCase().includes(SANS_DONNEE)
    );
    expect(sans, 'au moins une table déclarée sans donnée personnelle').toBeDefined();
    const table = sans?.table ?? '';
    const modifie = SCHEMA.replace(
      `@@map("${table}")`,
      `emailChiffre Bytes? @map("email_chiffre")\n  @@map("${table}")`
    );
    expect(modifie).not.toBe(SCHEMA);
    expect(fautesDeCouverture(modifie, REGISTRE)).toEqual([
      `colonne_personnelle_sans_traitement: ${table}.emailChiffre`,
    ]);
  });

  it('REQ-SEC-030 — témoin rouge : une table déclarée au registre mais absente du schéma est nommée ; contre-témoin vert : le schéma réel passe', () => {
    const retire = SCHEMA.replace(/^model (\w+) \{[\s\S]*?^\}/m, '');
    const retiree = tablesDuSchema(SCHEMA)[0]?.table ?? '';
    expect(retiree).not.toBe('');
    expect(fautesDeCouverture(retire, REGISTRE)).toEqual([`table_absente_du_schema: ${retiree}`]);
    // Contre-témoin vert : le schéma réel, sans retouche, ne produit aucune faute.
    expect(fautesDeCouverture(SCHEMA, REGISTRE)).toEqual([]);
  });
});

// ── 3. l'information du tiers, les destinataires ─────────────────────────────

describe('tiers rencontré et destinataires', () => {
  it('REQ-JUR-009 — le traitement des coordonnées du tiers porte l’information de l’article 14, au premier contact, par Axion-IA', () => {
    const tiers = traitements(REGISTRE).find((t) => t.id === 'TRT-TIERS');
    expect(tiers, 'traitement TRT-TIERS').toBeDefined();
    const info = tiers?.rubriques.get('Information des personnes');
    expect(info?.contenu).toMatch(/article 14/);
    expect(info?.contenu).toMatch(/premier contact/);
    expect(`${info?.contenu} ${info?.sources}`).toContain('REQ-JUR-009');
    expect(tiers?.rubriques.get('Origine des données')?.sources).toMatch(/contrat art\. 7\.1/);
    expect(tiers?.rubriques.get('Durée de conservation')?.sources).toContain('HYP-RGPD-RETENTION');
    expect(tiers?.rubriques.get('Droits et modalités d’exercice')?.sources).toContain(
      'REQ-SEC-030'
    );
  });

  it('REQ-JUR-025 — chaque fiche tiers du dépôt a sa ligne au registre des destinataires (dérivé de docs/tiers)', () => {
    const fiches = readdirSync('docs/tiers')
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => `docs/tiers/${f}`);
    const lignes = lignesDeTableau(section(REGISTRE, '4.'));
    const citees = lignes.map((l) => (l[1] ?? '').replace(/`/g, ''));
    expect(fiches.length).toBeGreaterThan(0);
    expect(fiches.filter((f) => !citees.includes(f))).toEqual([]);
    for (const l of lignes) {
      const { fautes } = sourcesDe(l.join(' '));
      expect(fautes, `ligne ${l[0] ?? ''}`).toEqual([]);
    }
  });

  it('REQ-JUR-025 — le push web et Telegram sont des sous-traitants hors Union européenne, charge sans coordonnée ni montant, identifiant pseudonymisé et transfert à encadrer', () => {
    const lignes = lignesDeTableau(section(REGISTRE, '4.'));
    for (const fiche of ['docs/tiers/push-web.md', 'docs/tiers/telegram.md']) {
      const l = lignes.find((x) => (x[1] ?? '').replace(/`/g, '') === fiche);
      expect(l, fiche).toBeDefined();
      const texte = (l ?? []).join(' ');
      expect(texte).toMatch(/sous-traitant/);
      expect(texte).toMatch(/hors Union européenne/);
      expect(texte).toMatch(/pseudonymisée/);
      expect(texte).toMatch(/encadr/);
      expect(texte).not.toMatch(/aucune donnée personnelle/);
      expect(texte).toContain('REQ-SEC-033');
    }
  });

  it('REQ-JUR-025 — l’entité responsable n’est pas recopiée : le registre renvoie à config/entite.json et à W1', () => {
    const entite = (JSON.parse(lire('config/entite.json')) as { entite: Record<string, string> })
      .entite;
    const responsable = section(REGISTRE, '1.');
    expect(responsable).toContain('config/entite.json');
    expect(responsable).toMatch(/\bW1\b/);
    for (const cle of ['siren', 'siret', 'tvaIntracommunautaire', 'siege'] as const) {
      const v = entite[cle] ?? '';
      expect(v).not.toBe('');
      expect(REGISTRE.includes(v), `valeur recopiée : ${cle}`).toBe(false);
      expect(AIPD.includes(v), `valeur recopiée dans l’AIPD : ${cle}`).toBe(false);
    }
  });
});

// ── 4. l'analyse d'impact ────────────────────────────────────────────────────

describe('analyse d’impact (AIPD)', () => {
  it('REQ-CPL-009 — l’AIPD couvre le profilage d’anomalie, le score, les données de tiers et les données financières', () => {
    for (const objet of [
      'Profilage d’anomalie',
      'Score',
      'Données de tiers',
      'Données financières',
    ]) {
      expect(AIPD, objet).toMatch(new RegExp(`^### ${objet}`, 'm'));
    }
  });

  it('REQ-CPL-009 — l’AIPD ne se dit signée qu’avec une date et un signataire, et, non signée, ÉCRIT qu’elle conditionne le premier dépôt réel (la garde qui le bloque est JUR-T35)', () => {
    const signature = section(AIPD, 'Signature');
    const etat = /^État : (.+)$/m.exec(signature)?.[1] ?? '';
    expect(etat).not.toBe('');
    const signee = /^signée le (\d{4}-\d{2}-\d{2}) par (\S.*)$/.exec(etat);
    if (signee === null) {
      expect(etat).toBe('non signée');
      expect(signature).toMatch(/premier dépôt réel/);
    }
  });

  it('REQ-CPL-009 — chaque mesure et chaque risque de l’AIPD cite une source qui existe, ou déclare son manque avec la question', () => {
    const fautes: string[] = [];
    for (const l of lignesDeTableau(AIPD)) {
      const texte = l.join(' ');
      const { resolues, fautes: pendantes } = sourcesDe(texte);
      for (const p of pendantes) fautes.push(`${l[0] ?? ''} : source introuvable ${p}`);
      const manque = texte.toLowerCase().includes(MARQUEUR);
      if (resolues.length === 0 && !manque) fautes.push(`${l[0] ?? ''} : aucune source`);
      if (l.some(manqueSansQuestion)) fautes.push(`${l[0] ?? ''} : manque sans question`);
    }
    expect(lignesDeTableau(AIPD).length).toBeGreaterThan(0);
    expect(fautes).toEqual([]);
  });

  it('REQ-JUR-009 — la mise en balance de l’intérêt légitime du traitement des tiers existe et ne conclut pas sans décision', () => {
    const lia = section(AIPD, 'Mise en balance');
    expect(lia).toContain('TRT-TIERS');
    expect(lia).toMatch(/^Conclusion : /m);
    const conclusion = /^Conclusion : (.+)$/m.exec(lia)?.[1] ?? '';
    // Une conclusion ne vaut que tranchée par une ligne du registre des décisions.
    if (!conclusion.toLowerCase().includes(MARQUEUR)) {
      expect(sourcesDe(conclusion).resolues.some((r) => /^(W\d|HYP-)/.test(r))).toBe(true);
    } else {
      expect(manqueSansQuestion(conclusion)).toBe(false);
    }
  });
});
