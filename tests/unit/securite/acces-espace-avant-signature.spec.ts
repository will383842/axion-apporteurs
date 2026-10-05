// @req REQ-SEC-032
// @req REQ-UX-006
/**
 * SEC-43 — l'espace s'ouvre aux statuts `kyc_en_cours` et `pret_a_signer`, LIMITÉ à « Ma conformité »
 * (`/conformite`) et « Mon contrat » (`/mon-contrat`). décision de Williams du 2026-10-01 ; forme
 * À PLAT, décision A02 du 2026-10-02.
 *
 * CE QU'IL PROUVE :
 *   1. UN SEUL VERDICT : `niveauDAcces` rend `plein` (signe, suspendu), `limite` (kyc_en_cours,
 *      pret_a_signer) ou `ferme` — tout autre statut, inconnu, vide ou d'une autre casse ;
 *   2. LES SEGMENTS SONT UNE UNION FERMÉE : en ouverture limitée, `conformite` et `mon-contrat`
 *      répondent (et l'action d'acceptation de la politique) ; toute autre route est refusée ; un
 *      segment inconnu est refusé à TOUT niveau — aucun niveau n'est implicite ;
 *   3. LE REFUS CÔTÉ SERVEUR : `exigerSessionPour` refuse avec le motif nommé
 *      `hors_ouverture_limitee` et écrit au journal le statut et le segment, rien d'autre ;
 *      TÉMOIN D'ACTION : l'action de dépôt d'un `kyc_en_cours` est refusée avant toute écriture ;
 *   4. LE DISQUE : chaque page, route et action de `src/app/(espace)/` appelle `pageEspace`
 *      (ou `actionEspace`) avec LE segment que son chemin dérive, comme premier acte — hors des
 *      segments publics et de la page publique de la politique. PIÈGE : un fichier non protégé, un
 *      fichier au mauvais segment, un segment inconnu et un appel qui n'est pas le premier acte
 *      rougissent, chacun nommé.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import {
  SEGMENTS_LECTURE,
  SEGMENTS_LIMITES,
  SEGMENTS_PLEINS,
  SEGMENTS_PUBLICS,
  SEGMENT_DE_L_ACCEPTATION,
  niveauDAcces,
  peutOuvrirLEspace,
  routeOuverte,
} from '../../../src/domain/apporteur/acces-espace';
import { STATUTS_APPORTEUR } from '../../../src/domain/apporteur/statut';
import {
  MOTIFS_DE_REFUS,
  actionEspace,
  exigerSessionPour,
  jugerSession,
  type LigneDeSession,
  type PortsDeSession,
  type RefusDOuvertureLimitee,
} from '../../../src/server/auth/session';
import { empreinteDeSession } from '../../../src/server/auth/lien-magique';

const KID = 'a1b2c3d4';
const SECRET = 'secret-de-test-des-sessions-0000000000000';
const JETON = 'jeton-de-session-de-test';
const T0 = new Date('2026-10-02T08:00:00.000Z');

function ligne(statut: string): LigneDeSession {
  return {
    id: 'session-1',
    apporteurId: 'apporteur-1',
    kid: KID,
    expireAt: new Date(T0.getTime() + 3_600_000),
    revoqueAt: null,
    sessionVersion: 0,
    apporteur: { statut, sessionVersion: 0 },
    lienMagique: { consommeAt: T0 },
  };
}

function ports(statut: string, journal?: RefusDOuvertureLimitee[]): PortsDeSession {
  const empreinte = empreinteDeSession(JETON, SECRET);
  return {
    maintenant: () => T0,
    configuration: { secret: SECRET, kid: KID },
    depot: {
      lire: async (h) => (h === empreinte ? ligne(statut) : null),
      marquerVue: async () => undefined,
      lister: async () => [],
      revoquer: async () => 0,
      incrementerVersion: async () => undefined,
    },
    ...(journal === undefined ? {} : { journal: (l) => journal.push(l) }),
    // SEC-53 : la garde d'acceptation suit la session. Ce témoin juge l'ouverture limitée : la
    // politique courante y est acceptée, pour que seul le niveau d'accès décide.
    acceptation: {
      lirePolitique: () => ({
        ok: true,
        politique: { rubriques: [], destinataires: [], version: 'v' },
        filtres: [],
      }),
      depot: {
        lire: async () => ({ accepteeAt: T0, version: 'v' }),
        ecrire: async () => undefined,
      },
    },
  };
}

describe('REQ-SEC-032 — un seul verdict à quatre niveaux, défaut fermé', () => {
  it('REQ-SEC-032 : plein pour signe et suspendu, limité pour kyc_en_cours et pret_a_signer, fermé pour tout autre statut du domaine', () => {
    const par = (n: string) => STATUTS_APPORTEUR.filter((s) => niveauDAcces(s) === n);
    expect(par('plein')).toEqual(['signe', 'suspendu']);
    expect(par('limite')).toEqual(['kyc_en_cours', 'pret_a_signer']);
    expect(par('ferme')).toEqual(['candidat', 'retenu', 'vivier', 'refuse', 'resilie']);
  });

  it('REQ-SEC-032 : un statut absent, inconnu, vide ou d’une autre casse est fermé', () => {
    for (const s of [null, 'inconnu', '', 'KYC_EN_COURS', ' signe']) {
      expect(niveauDAcces(s)).toBe('ferme');
      expect(peutOuvrirLEspace(s)).toBe(false);
    }
  });

  it('REQ-SEC-032 : l’ouverture limitée OUVRE l’espace — le lien de connexion et la session ne la refusent plus', () => {
    expect(peutOuvrirLEspace('kyc_en_cours')).toBe(true);
    expect(peutOuvrirLEspace('pret_a_signer')).toBe(true);
  });

  it('REQ-SEC-032 : SEC-19 — la LECTURE est le niveau du seul résilié dont les droits courent ; aucun autre statut n’y entre', () => {
    const lecture = STATUTS_APPORTEUR.filter((s) => niveauDAcces(s, true) === 'lecture');
    expect(lecture).toEqual(['resilie']);
    expect(peutOuvrirLEspace('resilie', true)).toBe(true);
    expect(peutOuvrirLEspace('resilie', false)).toBe(false);
  });
});

describe('REQ-UX-006 — les segments sont une union fermée', () => {
  it('REQ-UX-006 : en ouverture limitée, conformite, mon-contrat et l’acceptation de la politique répondent, et elles seules', () => {
    expect([...SEGMENTS_LIMITES]).toEqual(['conformite', 'mon-contrat']);
    for (const s of SEGMENTS_LIMITES) expect(routeOuverte('limite', s)).toBe(true);
    expect(routeOuverte('limite', SEGMENT_DE_L_ACCEPTATION)).toBe(true);
    for (const s of SEGMENTS_PLEINS) expect(routeOuverte('limite', s), s).toBe(false);
  });

  it('REQ-UX-006 : en ouverture pleine, chaque segment déclaré répond ; fermé, aucun', () => {
    for (const s of [...SEGMENTS_LIMITES, ...SEGMENTS_PLEINS, SEGMENT_DE_L_ACCEPTATION]) {
      expect(routeOuverte('plein', s), s).toBe(true);
      expect(routeOuverte('ferme', s), s).toBe(false);
    }
  });

  it('REQ-UX-006 : SEC-19 — en lecture, la liste blanche SEGMENTS_LECTURE et l’acceptation répondent, et elles seules ; la liste est prise DANS les segments protégés', () => {
    const lus: readonly string[] = SEGMENTS_LECTURE;
    for (const s of [...SEGMENTS_LIMITES, ...SEGMENTS_PLEINS]) {
      expect(routeOuverte('lecture', s), s).toBe(lus.includes(s));
    }
    expect(routeOuverte('lecture', SEGMENT_DE_L_ACCEPTATION)).toBe(true);
    const proteges: readonly string[] = [...SEGMENTS_LIMITES, ...SEGMENTS_PLEINS];
    for (const s of SEGMENTS_LECTURE) expect(proteges, s).toContain(s);
  });

  it('REQ-UX-006 : un segment INCONNU est refusé à tout niveau — aucun niveau n’est implicite', () => {
    for (const n of ['plein', 'limite', 'lecture', 'ferme'] as const) {
      expect(routeOuverte(n, 'une-route-qui-n-existe-pas-encore')).toBe(false);
      expect(routeOuverte(n, '')).toBe(false);
    }
  });

  it('REQ-UX-006 : les quatre listes sont disjointes', () => {
    const tous = [
      ...SEGMENTS_LIMITES,
      ...SEGMENTS_PLEINS,
      SEGMENT_DE_L_ACCEPTATION,
      ...SEGMENTS_PUBLICS,
    ];
    expect(new Set(tous).size).toBe(tous.length);
  });
});

describe('REQ-SEC-032 — le refus est appliqué côté serveur, avec un motif nommé', () => {
  it('REQ-SEC-032 : la session acceptée porte son niveau', () => {
    expect(jugerSession(ligne('kyc_en_cours'), T0, KID)).toMatchObject({
      ok: true,
      session: { niveau: 'limite' },
    });
    expect(jugerSession(ligne('signe'), T0, KID)).toMatchObject({
      ok: true,
      session: { niveau: 'plein' },
    });
  });

  it('REQ-SEC-032 : `hors_ouverture_limitee` est un motif de la liste fermée', () => {
    expect(MOTIFS_DE_REFUS).toContain('hors_ouverture_limitee');
  });

  it('REQ-SEC-032 : un kyc_en_cours atteint conformite et mon-contrat, et il est refusé sur chaque segment plein ; le journal ne porte que le statut et le segment', async () => {
    for (const s of SEGMENTS_LIMITES) {
      expect(await exigerSessionPour(s, JETON, ports('kyc_en_cours'))).toMatchObject({ ok: true });
    }
    const journal: RefusDOuvertureLimitee[] = [];
    for (const s of SEGMENTS_PLEINS) {
      expect(await exigerSessionPour(s, JETON, ports('pret_a_signer', journal)), s).toEqual({
        ok: false,
        motif: 'hors_ouverture_limitee',
      });
    }
    expect(journal).toEqual(
      SEGMENTS_PLEINS.map((segment) => ({
        signal: 'acces_espace_refuse',
        motif: 'hors_ouverture_limitee',
        statut: 'pret_a_signer',
        segment,
      }))
    );
  });

  it('REQ-SEC-032 : un signe garde l’accès plein ; un candidat ou un refuse est refusé partout', async () => {
    for (const s of [...SEGMENTS_LIMITES, ...SEGMENTS_PLEINS]) {
      expect(await exigerSessionPour(s, JETON, ports('signe')), s).toMatchObject({ ok: true });
      for (const statut of ['candidat', 'refuse']) {
        expect(await exigerSessionPour(s, JETON, ports(statut)), `${statut} ${s}`).toEqual({
          ok: false,
          motif: 'statut_ferme',
        });
      }
    }
  });

  it('REQ-SEC-032 : TÉMOIN D’ACTION — un kyc_en_cours qui appelle directement l’action de dépôt est refusé, et rien n’est écrit', async () => {
    const ecrites: unknown[] = [];
    const deposer = (statut: string) =>
      actionEspace('deposer', JETON, ports(statut), async (session) => {
        ecrites.push({ apporteurId: session.apporteurId, siren: '552100554' });
        return 'enregistre';
      });
    expect(await deposer('kyc_en_cours')).toEqual({ ok: false, motif: 'hors_ouverture_limitee' });
    expect(ecrites).toEqual([]);
    // Contre-témoin : le même appel d'un apporteur signé écrit.
    expect(await deposer('signe')).toEqual({ ok: true, valeur: 'enregistre' });
    expect(ecrites).toHaveLength(1);
  });
});

// ── Le disque ──────────────────────────────────────────────────────────────────────────────────

const RACINE_ESPACE = 'src/app/(espace)';

/** Les fichiers d'un dossier, récursivement. */
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((e) => {
    const chemin = join(dossier, e);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

/**
 * LE JUGE PARLE À L'ARBRE DE SYNTAXE, PAS AU TEXTE. Un découpage par expressions régulières se laissait
 * tromper par une aide non exportée qui suit un export nu, ou par une forme d'export qu'il ne savait
 * pas reconnaître. `ts.createSourceFile` suffit : ni programme, ni vérification de types.
 */
const source = (chemin: string, contenu: string): ts.SourceFile =>
  ts.createSourceFile(chemin, contenu, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** La chaîne d'un énoncé-directive (`'use server';`), ou `null`. */
function directiveDe(s: ts.Statement): string | null {
  return ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) ? s.expression.text : null;
}

/** Le prologue d'une liste d'énoncés : les directives de tête. */
function prologue(enonces: readonly ts.Statement[]): string[] {
  const vues: string[] = [];
  for (const s of enonces) {
    const d = directiveDe(s);
    if (d === null) break;
    vues.push(d);
  }
  return vues;
}

/** Le fichier S'OUVRE-t-il sur `'use server'` ? C'est alors un module d'actions. */
const directiveEnTete = (f: ts.SourceFile): boolean =>
  prologue(f.statements).includes('use server');

/** Une fonction, n'importe où dans le fichier, porte-t-elle `'use server'` en tête de son corps ? */
function actionEnLigne(f: ts.SourceFile): boolean {
  let vue = false;
  const visiter = (n: ts.Node): void => {
    if (ts.isFunctionLike(n) && 'body' in n && n.body && ts.isBlock(n.body)) {
      if (prologue(n.body.statements).includes('use server')) vue = true;
    }
    ts.forEachChild(n, visiter);
  };
  visiter(f);
  return vue;
}

/** Un fichier que la règle juge : une page, une route, ou un module d'actions serveur. */
function estJuge(nom: string, f: ts.SourceFile): boolean {
  return /^(page|route)\.[cm]?[jt]sx?$/.test(nom) || directiveEnTete(f);
}

type Fonction = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
const estFonction = (n: ts.Node | undefined): n is Fonction =>
  n !== undefined &&
  (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n));
const exporte = (s: ts.Statement): boolean =>
  ts.canHaveModifiers(s) &&
  (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/**
 * Les exports d'un fichier, chacun avec la FONCTION qui le porte, ou `null` quand sa forme n'est pas
 * reconnue. Un export indirect est rendu à part : il cache ce qu'il expose.
 */
function exportsDe(
  f: ts.SourceFile
): { nom: string; fonction: Fonction | null; valeur: boolean }[] | 'indirect' {
  const vus: { nom: string; fonction: Fonction | null; valeur: boolean }[] = [];
  for (const s of f.statements) {
    if (ts.isExportDeclaration(s)) {
      if (s.isTypeOnly) continue;
      return 'indirect';
    }
    if (ts.isExportAssignment(s)) {
      const e = s.expression;
      vus.push({ nom: 'default', fonction: estFonction(e) ? e : null, valeur: false });
      continue;
    }
    if (!exporte(s)) continue;
    if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) continue;
    if (ts.isFunctionDeclaration(s)) {
      const parDefaut = (ts.getModifiers(s) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword
      );
      vus.push({
        nom: parDefaut ? 'default' : (s.name?.text ?? 'default'),
        fonction: s,
        valeur: false,
      });
      continue;
    }
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const nom = ts.isIdentifier(d.name) ? d.name.text : d.name.getText(f);
        const init = d.initializer;
        vus.push({ nom, fonction: estFonction(init) ? init : null, valeur: !estFonction(init) });
      }
      continue;
    }
    vus.push({ nom: s.getText(f).slice(0, 40), fonction: null, valeur: false });
  }
  return vus;
}

/** Le premier énoncé d'un corps : ses énoncés, ou l'expression d'une flèche sans bloc. */
const enoncesDe = (fn: Fonction): readonly ts.Node[] =>
  fn.body === undefined ? [] : ts.isBlock(fn.body) ? fn.body.statements : [fn.body];

/** L'appel que porte un énoncé, sous `return`, `await`, `const x =` ou des parenthèses ; ou `null`. */
function appelDe(n: ts.Node): ts.CallExpression | null {
  let e: ts.Node | undefined = n;
  if (ts.isReturnStatement(n)) e = n.expression;
  else if (ts.isExpressionStatement(n)) e = n.expression;
  else if (ts.isVariableStatement(n)) {
    const ds = n.declarationList.declarations;
    e = ds.length === 1 ? ds[0]?.initializer : undefined;
  }
  while (e !== undefined && (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e))) {
    e = e.expression;
  }
  return e !== undefined && ts.isCallExpression(e) ? e : null;
}

/**
 * Un énoncé admis AVANT la garde (décisions de la lentille sécurité, 2026-10-02) : une déclaration
 * qui ne fait que (a) LIRE le cookie de session par `cookies()` et en extraire la valeur, ou
 * (b) appeler une fabrique de câblage de la liste fermée, à arguments littéraux, `process.env` ou
 * importés. Toute attente autre que `await cookies()`, tout autre appel (même non attendu), et toute
 * lecture d'un paramètre de la fonction (`params`, `searchParams`, le `FormData`, la requête) est une
 * faute. `headers()` n'est pas admis : la session est un cookie httpOnly.
 */
function admisAvantLaGarde(n: ts.Node, fn: Fonction): boolean {
  if (!ts.isVariableStatement(n)) return false;
  // Les noms liés par les paramètres, déstructurés compris (`{ params }`, `{ searchParams }`).
  const noms = (b: ts.BindingName): string[] =>
    ts.isIdentifier(b)
      ? [b.text]
      : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : noms(e.name)));
  const parametres = new Set(fn.parameters.flatMap((p) => noms(p.name)));
  const importes = nomsImportes(fn.getSourceFile());
  let admis = true;
  const visiter = (x: ts.Node): void => {
    if (ts.isAwaitExpression(x) && !estCookies(x.expression)) admis = false;
    if (ts.isIdentifier(x) && parametres.has(x.text)) admis = false;
    // Une construction (`new X()`) et un gabarit étiqueté (`` sql`…` ``) exécutent du code : ce sont des
    // appels, jamais admis avant la garde.
    if (ts.isNewExpression(x) || ts.isTaggedTemplateExpression(x)) admis = false;
    // Tout APPEL, attendu ou non, est une faute — sauf `cookies()`, le `.get(…)` de son résultat,
    // et une fabrique de câblage de la liste fermée, à arguments admis.
    if (ts.isCallExpression(x)) {
      const c = x.expression;
      const lectureDuCookie =
        ts.isPropertyAccessExpression(c) &&
        c.name.text === 'get' &&
        estCookies(sansEnveloppe(c.expression));
      const fabrique = ts.isIdentifier(c) && FABRIQUES_DE_CABLAGE.includes(c.text);
      if (!estCookies(x) && !lectureDuCookie && !fabrique) admis = false;
      if ((lectureDuCookie || fabrique) && !x.arguments.every((a) => argumentAdmis(a, importes))) {
        admis = false;
      }
    }
    ts.forEachChild(x, visiter);
  };
  visiter(n);
  return admis;
}

/**
 * Les fabriques de câblage admises avant la garde, liste FERMÉE (décision de la lentille sécurité,
 * 2026-10-02) : elles assemblent des ports, elles ne lisent ni la requête, ni la base, ni le réseau.
 */
const FABRIQUES_DE_CABLAGE: readonly string[] = ['portsDuProcessus', 'dependancesDuProcessus'];

/** `cookies()`, sans argument. */
const estCookies = (e: ts.Node): boolean =>
  ts.isCallExpression(e) &&
  ts.isIdentifier(e.expression) &&
  e.expression.text === 'cookies' &&
  e.arguments.length === 0;

/** L'expression sous ses parenthèses et ses `await`. */
function sansEnveloppe(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAwaitExpression(x)) x = x.expression;
  return x;
}

/** Les noms qu'un fichier importe. */
function nomsImportes(f: ts.SourceFile): Set<string> {
  const vus = new Set<string>();
  for (const s of f.statements) {
    if (!ts.isImportDeclaration(s) || s.importClause === undefined) continue;
    const c = s.importClause;
    if (c.name) vus.add(c.name.text);
    const b = c.namedBindings;
    if (b && ts.isNamespaceImport(b)) vus.add(b.name.text);
    if (b && ts.isNamedImports(b)) for (const e of b.elements) vus.add(e.name.text);
  }
  return vus;
}

/**
 * Un argument admis d'une fabrique ou de la lecture du cookie : un littéral, `process.env…`, un nom
 * importé (ou une propriété d'un nom importé), un objet de tels arguments, ou une fabrique admise.
 */
function argumentAdmis(e: ts.Expression, importes: Set<string>): boolean {
  if (
    ts.isStringLiteral(e) ||
    ts.isNumericLiteral(e) ||
    ts.isNoSubstitutionTemplateLiteral(e) ||
    e.kind === ts.SyntaxKind.TrueKeyword ||
    e.kind === ts.SyntaxKind.FalseKeyword ||
    e.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isIdentifier(e)) return importes.has(e.text);
  if (ts.isPropertyAccessExpression(e)) {
    let racine: ts.Expression = e;
    while (ts.isPropertyAccessExpression(racine)) racine = racine.expression;
    return ts.isIdentifier(racine) && (racine.text === 'process' || importes.has(racine.text));
  }
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.every((p) =>
      ts.isPropertyAssignment(p)
        ? argumentAdmis(p.initializer, importes)
        : ts.isShorthandPropertyAssignment(p) && importes.has(p.name.text)
    );
  }
  if (ts.isCallExpression(e)) {
    return (
      ts.isIdentifier(e.expression) &&
      FABRIQUES_DE_CABLAGE.includes(e.expression.text) &&
      e.arguments.every((a) => argumentAdmis(a, importes))
    );
  }
  return false;
}

/** La faute d'UNE fonction exportée, ou `null` : son premier acte est la garde, pour SON segment. */
function fauteDeLaFonction(
  quoi: string,
  fn: Fonction,
  segment: string,
  attendu: 'actionEspace' | 'pageEspace'
): string | null {
  for (const n of enoncesDe(fn)) {
    const appel = appelDe(n);
    if (appel !== null && ts.isIdentifier(appel.expression) && appel.expression.text === attendu) {
      const premier = appel.arguments[0];
      const litteral =
        premier !== undefined &&
        (ts.isStringLiteral(premier) || ts.isNoSubstitutionTemplateLiteral(premier))
          ? premier.text
          : null;
      if (litteral !== segment) {
        return `mauvais_segment ${quoi} (« ${litteral ?? 'non littéral'} » au lieu de « ${segment} »)`;
      }
      return null;
    }
    if (!admisAvantLaGarde(n, fn)) {
      // Une garde plus loin dans le corps n'est pas un premier acte ; aucune garde, pas de protection.
      const plusLoin = enoncesDe(fn).some((m) => {
        const a = appelDe(m);
        return a !== null && ts.isIdentifier(a.expression) && a.expression.text === attendu;
      });
      return plusLoin ? `pas_premier_acte ${quoi}` : `non_protege ${quoi} (${attendu} attendu)`;
    }
  }
  return `non_protege ${quoi} (${attendu} attendu)`;
}

/**
 * La faute d'un fichier de l'espace, ou `null`. Le segment attendu se DÉRIVE du chemin : son premier
 * dossier (les groupes `(…)` sont transparents), ou `accueil` à la racine.
 */
export function fauteDuFichier(cheminRelatif: string, contenu: string): string | null {
  const parties = cheminRelatif.split(/[\\/]/).filter((p) => !/^\(.*\)$/.test(p));
  const nom = parties.at(-1) ?? '';
  const f = source(nom, contenu);
  // Une directive en tête d'un CORPS de fonction est une action EN LIGNE : la page qui la porte se
  // protège, mais l'action s'appelle sans elle. Refusée partout sous l'espace, segment public compris.
  if (actionEnLigne(f)) return `action_en_ligne ${cheminRelatif}`;
  if (!estJuge(nom, f)) return null;
  const segment = parties.length === 1 ? 'accueil' : (parties[0] ?? '');
  const publics: readonly string[] = SEGMENTS_PUBLICS;
  if (publics.includes(segment)) return null;
  // La PAGE de la politique est publique ; son action d'acceptation, elle, est protégée.
  if (segment === SEGMENT_DE_L_ACCEPTATION && /^page\./.test(nom)) return null;
  const proteges: readonly string[] = [
    ...SEGMENTS_LIMITES,
    ...SEGMENTS_PLEINS,
    SEGMENT_DE_L_ACCEPTATION,
  ];
  if (!proteges.includes(segment)) return `segment_inconnu ${cheminRelatif} (« ${segment} »)`;
  // Une ACTION serveur passe par l'enveloppeur ; une page ou une route, par pageEspace (SEC-53 : session ET acceptation).
  const estUneAction = directiveEnTete(f);
  const attendu = estUneAction ? 'actionEspace' : 'pageEspace';
  const exports = exportsDe(f);
  if (exports === 'indirect') return `export_indirect ${cheminRelatif}`;
  if (exports.length === 0) return `non_protege ${cheminRelatif} (aucun export jugé)`;
  // CHAQUE export est jugé seul : une action par export, un handler par méthode, et l'export par
  // défaut d'une page. Seule une PAGE garde ses constantes de configuration (`metadata`, `dynamic`).
  const estUnePage = /^page\./.test(nom);
  for (const e of exports) {
    const quoi = `${cheminRelatif}#${e.nom}`;
    if (e.fonction === null) {
      if (estUnePage && e.valeur) continue;
      return `export_non_reconnu ${quoi}`;
    }
    const faute = fauteDeLaFonction(quoi, e.fonction, segment, attendu);
    if (faute !== null) return faute;
  }
  return null;
}

describe('REQ-SEC-032 — sur le disque, chaque page, route et action de l’espace se protège pour SON segment', () => {
  it('REQ-SEC-032 : le dépôt réel — aucune faute, et le plancher dit ce qui a été jugé', () => {
    const juges = fichiers(RACINE_ESPACE)
      .map((f) => ({ f: relative(RACINE_ESPACE, f), contenu: readFileSync(f, 'utf8') }))
      .filter(({ f, contenu }) => {
        const nom = f.split(/[\\/]/).at(-1) ?? '';
        return estJuge(nom, source(nom, contenu));
      });
    expect(juges.length).toBeGreaterThan(0);
    // Les fautes se cherchent dans TOUS les fichiers : une action en ligne peut vivre hors d'un
    // fichier jugé.
    const fautes = fichiers(RACINE_ESPACE)
      .map((f) => fauteDuFichier(relative(RACINE_ESPACE, f), readFileSync(f, 'utf8')))
      .filter(Boolean);
    expect(fautes).toEqual([]);
  });

  it.each([
    [
      'un fichier NON protégé',
      'deposer/actions.ts',
      "'use server';\nexport async function deposer() { await ecrire(); }",
      /^non_protege deposer\/actions\.ts/,
    ],
    [
      'un fichier au MAUVAIS segment',
      'deposer/page.tsx',
      "export default async function P() { const v = await pageEspace('conformite', j, p); }",
      /^mauvais_segment deposer\/page\.tsx/,
    ],
    [
      'un segment INCONNU',
      'clients/page.tsx',
      "export default async function P() { await pageEspace('clients', j, p); }",
      /^segment_inconnu clients\/page\.tsx/,
    ],
    [
      'un appel qui n’est pas le PREMIER acte',
      'mes-entreprises/page.tsx',
      "export default async function P() { const l = await lire(); await pageEspace('mes-entreprises', j, p); }",
      /^pas_premier_acte mes-entreprises\/page\.tsx/,
    ],
    [
      'une action qui appelle pageEspace au lieu de l’enveloppeur',
      'deposer/actions.ts',
      "'use server';\nexport async function deposer() { const v = await pageEspace('deposer', j, p); }",
      /^non_protege deposer\/actions\.ts#deposer \(actionEspace attendu\)$/,
    ],
    [
      'une route d’API à la racine non protégée',
      'route.ts',
      'export async function GET() { return new Response(); }',
      /^non_protege route\.ts/,
    ],
    [
      'un module d’actions à DEUX exports dont le second est nu',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { return actionEspace('mon-contrat', j, p, async () => 1); }\nexport async function telecharger() { return lire(); }",
      /^non_protege mon-contrat\/actions\.ts#telecharger \(actionEspace attendu\)$/,
    ],
    [
      'un second export en `const = async` nu',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { return actionEspace('mon-contrat', j, p, async () => 1); }\nexport const annuler = async () => ecrire();",
      /^non_protege mon-contrat\/actions\.ts#annuler \(actionEspace attendu\)$/,
    ],
    [
      'une route dont le GET se protège et le POST est nu',
      'conformite/route.ts',
      "export async function GET() { const v = await pageEspace('conformite', j, p); }\nexport async function POST() { await ecrire(); }",
      /^non_protege conformite\/route\.ts#POST \(pageEspace attendu\)$/,
    ],
    [
      'une page qui porte une action EN LIGNE',
      'conformite/page.tsx',
      "export default async function P() { const v = await pageEspace('conformite', j, p); async function envoyer() { 'use server'; await ecrire(); } }",
      /^action_en_ligne conformite\/page\.tsx$/,
    ],
    [
      'une aide NON exportée, protégée, placée APRÈS un export nu',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function telecharger() { return lire(); }\nasync function aide() { return actionEspace('mon-contrat', j, p, async () => 1); }",
      /^non_protege mon-contrat\/actions\.ts#telecharger \(actionEspace attendu\)$/,
    ],
    [
      'un export par défaut en flèche, nu',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { return actionEspace('mon-contrat', j, p, async () => 1); }\nexport default async () => ecrire();",
      /^non_protege mon-contrat\/actions\.ts#default \(actionEspace attendu\)$/,
    ],
    [
      'un export par défaut d’une forme non reconnue',
      'mon-contrat/actions.ts',
      "'use server';\nimport action from './ailleurs';\nexport default action;",
      /^export_non_reconnu mon-contrat\/actions\.ts#default$/,
    ],
    [
      'une route dont le handler est une valeur, pas une fonction',
      'conformite/route.ts',
      'export const GET = g.GET;',
      /^export_non_reconnu conformite\/route\.ts#GET$/,
    ],
    [
      'une garde imbriquée dans une fonction interne, pas au premier niveau du corps',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { async function aide() { return actionEspace('mon-contrat', j, p, async () => 1); } return lire(); }",
      /^non_protege mon-contrat\/actions\.ts#signer \(actionEspace attendu\)$/,
    ],
    [
      '`await headers()` AVANT la garde',
      'conformite/page.tsx',
      "export default async function P() { const h = await headers(); const v = await pageEspace('conformite', j, p); }",
      /^pas_premier_acte conformite\/page\.tsx#default$/,
    ],
    [
      '`await params` AVANT la garde',
      'conformite/page.tsx',
      "export default async function P({ params }: { params: Promise<{ id: string }> }) { const q = await params; const v = await pageEspace('conformite', j, p); }",
      /^pas_premier_acte conformite\/page\.tsx#default$/,
    ],
    [
      'le FormData lu AVANT l’enveloppeur',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer(formulaire: FormData) { const x = formulaire.get('a'); return actionEspace('mon-contrat', j, p, async () => 1); }",
      /^pas_premier_acte mon-contrat\/actions\.ts#signer$/,
    ],
    [
      'un `ecrire()` NON attendu avant la garde',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { const x = ecrire(); return actionEspace('mon-contrat', j, p, async () => 1); }",
      /^pas_premier_acte mon-contrat\/actions\.ts#signer$/,
    ],
    [
      'un `lireLaPolitique()` avant la garde',
      'conformite/page.tsx',
      "export default async function P() { const t = lireLaPolitique(); const v = await pageEspace('conformite', j, p); }",
      /^pas_premier_acte conformite\/page\.tsx#default$/,
    ],
    [
      'une fabrique HORS de la liste fermée avant la garde',
      'mon-contrat/actions.ts',
      "'use server';\nimport { construirePorts } from './ports';\nexport async function signer() { const ports = construirePorts(); return actionEspace('mon-contrat', j, ports, async () => 1); }",
      /^pas_premier_acte mon-contrat\/actions\.ts#signer$/,
    ],
    [
      'une fabrique de la liste, mais nourrie d’un paramètre',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer(formulaire: FormData) { const ports = portsDuProcessus(formulaire); return actionEspace('mon-contrat', j, ports, async () => 1); }",
      /^pas_premier_acte mon-contrat\/actions\.ts#signer$/,
    ],
    [
      'un `new X()` avant la garde',
      'mon-contrat/actions.ts',
      "'use server';\nimport { Client } from './client';\nexport async function signer() { const c = new Client(); return actionEspace('mon-contrat', j, p, async () => 1); }",
      /^pas_premier_acte mon-contrat\/actions\.ts#signer$/,
    ],
    [
      'un gabarit ÉTIQUETÉ avant la garde',
      'conformite/page.tsx',
      "import { sql } from './base';\nexport default async function P() { const q = sql`SELECT 1`; const v = await pageEspace('conformite', j, p); }",
      /^pas_premier_acte conformite\/page\.tsx#default$/,
    ],
    [
      'un export INDIRECT dans un module d’actions',
      'mon-contrat/actions.ts',
      "'use server';\nimport { telecharger } from './ailleurs';\nexport { telecharger };",
      /^export_indirect mon-contrat\/actions\.ts$/,
    ],
  ])('REQ-SEC-032 : PIÈGE — %s rougit, nommé', (_quoi, chemin, contenu, attendu) => {
    expect(fauteDuFichier(chemin, contenu)).toMatch(attendu);
  });

  it.each([
    [
      'une page protégée pour son segment, après la lecture du cookie',
      'conformite/page.tsx',
      "export default async function P() { const j = (await cookies()).get('x'); const v = await pageEspace('conformite', j, p); }",
    ],
    [
      'une action enveloppée',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { return actionEspace('mon-contrat', j, p, async () => 1); }",
    ],
    [
      'une action qui lit le cookie et câble ses ports par les fabriques de la liste, puis s’enveloppe',
      'mon-contrat/actions.ts',
      "'use server';\nimport { after } from 'next/server';\nimport { COOKIE } from './session';\nexport async function signer(formulaire: FormData) { const jeton = (await cookies()).get(COOKIE.nom)?.value; const ports = portsDuProcessus(dependancesDuProcessus({ apres: after, env: process.env })); return actionEspace('mon-contrat', jeton, ports.session, async () => formulaire.get('a')); }",
    ],
    [
      'un module d’actions dont CHAQUE export est enveloppé',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { return actionEspace('mon-contrat', j, p, async () => 1); }\nexport const annuler = async () => actionEspace('mon-contrat', j, p, async () => 2);",
    ],
    [
      'une route dont chaque handler se protège',
      'conformite/route.ts',
      "export async function GET() { const v = await pageEspace('conformite', j, p); }\nexport async function POST() { const v = await pageEspace('conformite', j, p); }",
    ],
    [
      'la page publique de la politique',
      'confidentialite/page.tsx',
      'export default async function P() {}',
    ],
    ['une route publique', 'connexion/page.tsx', 'export default async function P() {}'],
    ['un écran qui n’est ni page ni action', 'deposer/ecran.tsx', 'export function E() {}'],
  ])('REQ-SEC-032 : contre-témoin — %s passe', (_quoi, chemin, contenu) => {
    expect(fauteDuFichier(chemin, contenu)).toBeNull();
  });
});
