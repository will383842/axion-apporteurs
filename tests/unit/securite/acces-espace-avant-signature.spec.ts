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
 *   4. LE DISQUE : chaque page, route et action de `src/app/(espace)/` appelle `exigerSessionPour`
 *      (ou `actionEspace`) avec LE segment que son chemin dérive, comme premier acte — hors des
 *      segments publics et de la page publique de la politique. PIÈGE : un fichier non protégé, un
 *      fichier au mauvais segment, un segment inconnu et un appel qui n'est pas le premier acte
 *      rougissent, chacun nommé.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
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
  };
}

describe('REQ-SEC-032 — un seul verdict à trois niveaux, défaut fermé', () => {
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

  it('REQ-UX-006 : un segment INCONNU est refusé à tout niveau — aucun niveau n’est implicite', () => {
    for (const n of ['plein', 'limite', 'ferme'] as const) {
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

/** La directive `'use server'`, n'importe où dans le fichier. */
const DIRECTIVE = /(['"])use server\1/g;

/** Le fichier S'OUVRE-t-il sur la directive (commentaires de tête compris) ? C'est un module d'actions. */
function directiveEnTete(contenu: string): boolean {
  const corps = contenu.replace(/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/, '');
  return /^(['"])use server\1/.test(corps);
}

/** Un fichier que la règle juge : une page, une route, ou un module d'actions serveur. */
function estJuge(nom: string, contenu: string): boolean {
  return /^(page|route)\.[cm]?[jt]sx?$/.test(nom) || directiveEnTete(contenu);
}

/**
 * La faute d'un fichier de l'espace, ou `null`. Le segment attendu se DÉRIVE du chemin : son premier
 * dossier (les groupes `(…)` sont transparents), ou `accueil` à la racine.
 */
export function fauteDuFichier(cheminRelatif: string, contenu: string): string | null {
  const parties = cheminRelatif.split(/[\\/]/).filter((p) => !/^\(.*\)$/.test(p));
  const nom = parties.at(-1) ?? '';
  // Une directive HORS de la tête est une action EN LIGNE : la page qui la porte se protège, mais
  // l'action s'appelle sans elle. Refusée partout sous l'espace, segment public compris.
  const directives = [...contenu.matchAll(DIRECTIVE)].length;
  if (directives > (directiveEnTete(contenu) ? 1 : 0)) return `action_en_ligne ${cheminRelatif}`;
  if (!estJuge(nom, contenu)) return null;
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
  // Une ACTION serveur passe par l'enveloppeur ; une page ou une route, par exigerSessionPour.
  const estUneAction = directiveEnTete(contenu);
  const attendu = estUneAction ? 'actionEspace' : 'exigerSessionPour';
  // Une PAGE n'expose que son export par défaut : elle est jugée d'un bloc. Un module d'actions
  // expose UNE ACTION PAR EXPORT, et une route UN HANDLER PAR MÉTHODE : chacun est jugé seul, sinon
  // un second export nu passerait derrière le premier qui se protège.
  if (!estUneAction && !/^route\./.test(nom))
    return fauteDUnBloc(cheminRelatif, contenu, segment, attendu);
  // Un export indirect (`export { … }`, `export * from`) cache ce qu'il expose : il est refusé.
  if (/^\s*export\s*(?:\{|\*)/m.test(contenu)) return `export_indirect ${cheminRelatif}`;
  const exports = [
    ...contenu.matchAll(
      /^\s*export\s+(?:default\s+)?(?:(?:async\s+)?function\s*\*?\s*(\w*)|(?:const|let|var)\s+(\w+))/gm
    ),
  ];
  if (exports.length === 0) return `non_protege ${cheminRelatif} (aucun export jugé)`;
  for (const [i, m] of exports.entries()) {
    const fin = exports[i + 1]?.index ?? contenu.length;
    const nomExport = m[1] || m[2] || 'default';
    const faute = fauteDUnBloc(
      `${cheminRelatif}#${nomExport}`,
      contenu.slice(m.index, fin),
      segment,
      attendu
    );
    if (faute !== null) return faute;
  }
  return null;
}

/** La faute d'un bloc — une page entière, ou UN export d'action ou de route —, ou `null`. */
function fauteDUnBloc(
  quoi: string,
  bloc: string,
  segment: string,
  attendu: 'actionEspace' | 'exigerSessionPour'
): string | null {
  const appel = new RegExp(`\\b${attendu}\\(\\s*['"]([^'"]*)['"]`).exec(bloc);
  if (appel === null) return `non_protege ${quoi} (${attendu} attendu)`;
  if (appel[1] !== segment) {
    return `mauvais_segment ${quoi} (« ${appel[1]} » au lieu de « ${segment} »)`;
  }
  // Premier acte : avant l'appel, aucune attente — sauf la lecture du cookie ou des en-têtes.
  const avant = bloc.slice(0, appel.index);
  const attentes = [...avant.matchAll(/\bawait\s+([\w.]+)/g)].map((m) => m[1]);
  if (attentes.some((a) => a !== 'cookies' && a !== 'headers')) {
    return `pas_premier_acte ${quoi}`;
  }
  return null;
}

describe('REQ-SEC-032 — sur le disque, chaque page, route et action de l’espace se protège pour SON segment', () => {
  it('REQ-SEC-032 : le dépôt réel — aucune faute, et le plancher dit ce qui a été jugé', () => {
    const juges = fichiers(RACINE_ESPACE)
      .map((f) => ({ f: relative(RACINE_ESPACE, f), contenu: readFileSync(f, 'utf8') }))
      .filter(({ f, contenu }) => estJuge(f.split(/[\\/]/).at(-1) ?? '', contenu));
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
      "export default async function P() { const v = await exigerSessionPour('conformite', j, p); }",
      /^mauvais_segment deposer\/page\.tsx/,
    ],
    [
      'un segment INCONNU',
      'clients/page.tsx',
      "export default async function P() { await exigerSessionPour('clients', j, p); }",
      /^segment_inconnu clients\/page\.tsx/,
    ],
    [
      'un appel qui n’est pas le PREMIER acte',
      'mes-entreprises/page.tsx',
      "export default async function P() { const l = await lire(); await exigerSessionPour('mes-entreprises', j, p); }",
      /^pas_premier_acte mes-entreprises\/page\.tsx/,
    ],
    [
      'une action qui appelle exigerSessionPour au lieu de l’enveloppeur',
      'deposer/actions.ts',
      "'use server';\nexport async function deposer() { const v = await exigerSessionPour('deposer', j, p); }",
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
      "export async function GET() { const v = await exigerSessionPour('conformite', j, p); }\nexport async function POST() { await ecrire(); }",
      /^non_protege conformite\/route\.ts#POST \(exigerSessionPour attendu\)$/,
    ],
    [
      'une page qui porte une action EN LIGNE',
      'conformite/page.tsx',
      "export default async function P() { const v = await exigerSessionPour('conformite', j, p); async function envoyer() { 'use server'; await ecrire(); } }",
      /^action_en_ligne conformite\/page\.tsx$/,
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
      "export default async function P() { const j = (await cookies()).get('x'); const v = await exigerSessionPour('conformite', j, p); }",
    ],
    [
      'une action enveloppée',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { return actionEspace('mon-contrat', j, p, async () => 1); }",
    ],
    [
      'un module d’actions dont CHAQUE export est enveloppé',
      'mon-contrat/actions.ts',
      "'use server';\nexport async function signer() { return actionEspace('mon-contrat', j, p, async () => 1); }\nexport const annuler = async () => actionEspace('mon-contrat', j, p, async () => 2);",
    ],
    [
      'une route dont chaque handler se protège',
      'conformite/route.ts',
      "export async function GET() { const v = await exigerSessionPour('conformite', j, p); }\nexport async function POST() { const v = await exigerSessionPour('conformite', j, p); }",
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
