// @req REQ-JUR-025
/**
 * SEC-53 — chaque page, route et action de l'espace exige une session valide ET l'acceptation de la
 * version PUBLIABLE courante de la politique de confidentialité, en échec FERMÉ avec un motif nommé.
 *
 * CE QU'IL PROUVE, en processus (la base réelle : `tests/integration/garde-espace.spec.ts`) :
 *   1. LIEN DIRECT : une session valide qui n'a jamais accepté atteint une page par son adresse —
 *      refusée `acceptation_requise`, et l'action ne s'exécute pas ;
 *   2. ANCIENNE VERSION ACCEPTÉE : refusée `acceptation_requise` ;
 *   3. BASE INJOIGNABLE : la session ou l'acceptation ne se lisent pas — refus nommé, jamais un
 *      passage ;
 *   4. POLITIQUE NON PUBLIABLE ou registre illisible : refus nommé ;
 *   5. LE PORT D'ACCEPTATION ABSENT vaut refus : un câblage oublié ne rouvre pas l'espace ;
 *   6. LES EXEMPTIONS sont NOMMÉES, et ce sont exactement `confidentialite` et `connexion` ;
 *   7. LE DISQUE : chaque page, route et action SUIVIE par git sous `src/app/(espace)/`, hors des
 *      segments exemptés par nom, appelle `pageEspace` ou `actionEspace` pour SON segment.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  EXEMPTIONS_NOMMEES,
  MOTIFS_DE_LA_GARDE,
  estExempte,
  exigerAcceptation,
  type PortsDeLaGarde,
} from '../../../src/server/auth/garde-espace';
import {
  actionEspace,
  pageEspace,
  type LigneDeSession,
  type PortsDeSession,
} from '../../../src/server/auth/session';
import { empreinteDeSession } from '../../../src/server/auth/lien-magique';
import type { AcceptationLue } from '../../../src/server/rgpd/acceptation';
import type { Politique } from '../../../src/domain/rgpd/politique';

const KID = 'a1b2c3d4';
const SECRET = 'secret-de-test-des-sessions-0000000000000';
const JETON = 'jeton-de-session-de-test';
const T0 = new Date('2026-10-03T08:00:00.000Z');

const V1 = 'v1'.padEnd(32, '0');
const V2 = 'v2'.padEnd(32, '0');

function politique(version: string, publiable = true): Politique {
  return {
    rubriques: [
      {
        cle: 'finalite',
        contenu: [
          publiable ? { type: 'texte', texte: 'Gérer le réseau.' } : { type: 'a_completer' },
        ],
      },
    ],
    destinataires: [],
    version,
  };
}

function ligne(statut = 'signe'): LigneDeSession {
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

/** Les ports de la garde : la politique courante et ce que la base porte de l'acceptation. */
function garde(
  lue: AcceptationLue | null | 'panne',
  courante: Politique | 'illisible' = politique(V2)
): PortsDeLaGarde & { lus: string[] } {
  const lus: string[] = [];
  return {
    lus,
    lirePolitique: () =>
      courante === 'illisible'
        ? { ok: false, refus: 'registre introuvable' }
        : { ok: true, politique: courante, filtres: [] },
    depot: {
      lire: async (id) => {
        lus.push(id);
        if (lue === 'panne') throw new Error('base injoignable');
        return lue;
      },
      ecrire: async () => {
        throw new Error('la garde n’écrit jamais');
      },
    },
  };
}

const ACCEPTEE_V2: AcceptationLue = { accepteeAt: T0, version: V2 };

function ports(acceptation?: PortsDeLaGarde, sessionEnPanne = false): PortsDeSession {
  const empreinte = empreinteDeSession(JETON, SECRET);
  return {
    maintenant: () => T0,
    configuration: { secret: SECRET, kid: KID },
    depot: {
      lire: async (h) => {
        if (sessionEnPanne) throw new Error('base injoignable');
        return h === empreinte ? ligne() : null;
      },
      marquerVue: async () => undefined,
      lister: async () => [],
      revoquer: async () => 0,
      incrementerVersion: async () => undefined,
    },
    ...(acceptation === undefined ? {} : { acceptation }),
  };
}

describe('REQ-JUR-025 — la garde de l’espace : session valide ET version publiable courante acceptée', () => {
  it('REQ-JUR-025 : une session qui a accepté la version courante passe, page et action', async () => {
    expect(await pageEspace('accueil', JETON, ports(garde(ACCEPTEE_V2)))).toMatchObject({
      ok: true,
      session: { apporteurId: 'apporteur-1' },
    });
    expect(
      await actionEspace('deposer', JETON, ports(garde(ACCEPTEE_V2)), async () => 'enregistre')
    ).toEqual({ ok: true, valeur: 'enregistre' });
  });

  it('REQ-JUR-025 : TÉMOIN DU LIEN DIRECT — jamais acceptée, la page est refusée et l’action n’écrit rien', async () => {
    for (const lue of [
      { accepteeAt: null, version: null },
      { accepteeAt: null, version: V2 },
    ]) {
      expect(await pageEspace('accueil', JETON, ports(garde(lue)))).toEqual({
        ok: false,
        motif: 'acceptation_requise',
      });
    }
    const ecrites: unknown[] = [];
    const issue = await actionEspace(
      'deposer',
      JETON,
      ports(garde({ accepteeAt: null, version: null })),
      async () => ecrites.push('depot')
    );
    expect(issue).toEqual({ ok: false, motif: 'acceptation_requise' });
    expect(ecrites).toEqual([]);
  });

  it('REQ-JUR-025 : TÉMOIN DE L’ANCIENNE VERSION — acceptée en v1, la courante est v2 : refusée', async () => {
    const g = garde({ accepteeAt: T0, version: V1 });
    expect(await pageEspace('mes-commissions', JETON, ports(g))).toEqual({
      ok: false,
      motif: 'acceptation_requise',
    });
    // La garde lit l'acceptation de l'apporteur de LA SESSION, jamais un identifiant fourni.
    expect(g.lus).toEqual(['apporteur-1']);
  });

  it('REQ-JUR-025 : TÉMOIN DE LA BASE INJOIGNABLE — ni la session ni l’acceptation ne se lisent : refus nommé, jamais un passage', async () => {
    expect(await pageEspace('accueil', JETON, ports(garde(ACCEPTEE_V2), true))).toEqual({
      ok: false,
      motif: 'session_illisible',
    });
    expect(await pageEspace('accueil', JETON, ports(garde('panne')))).toEqual({
      ok: false,
      motif: 'acceptation_illisible',
    });
    const ecrites: unknown[] = [];
    expect(
      await actionEspace('deposer', JETON, ports(garde('panne')), async () => ecrites.push(1))
    ).toEqual({ ok: false, motif: 'acceptation_illisible' });
    expect(ecrites).toEqual([]);
  });

  it('REQ-JUR-025 : une politique non publiable (JUR-T57) ou un registre illisible ferment l’espace, chacun nommé', async () => {
    const nonPubliable = garde({ accepteeAt: T0, version: V2 }, politique(V2, false));
    expect(await pageEspace('accueil', JETON, ports(nonPubliable))).toEqual({
      ok: false,
      motif: 'politique_non_publiable',
    });
    expect(await pageEspace('accueil', JETON, ports(garde(ACCEPTEE_V2, 'illisible')))).toEqual({
      ok: false,
      motif: 'politique_illisible',
    });
  });

  it('REQ-JUR-025 : le port d’acceptation ABSENT vaut refus — un câblage oublié ne rouvre pas l’espace', async () => {
    expect(await pageEspace('accueil', JETON, ports())).toEqual({
      ok: false,
      motif: 'acceptation_illisible',
    });
    expect(await exigerAcceptation('apporteur-1', 'accueil', undefined)).toEqual({
      ok: false,
      motif: 'acceptation_illisible',
    });
  });

  it('REQ-JUR-025 : la session se juge AVANT l’acceptation — sans session, l’acceptation n’est pas lue', async () => {
    const g = garde(ACCEPTEE_V2);
    expect(await pageEspace('accueil', undefined, ports(g))).toEqual({
      ok: false,
      motif: 'absente',
    });
    expect(await pageEspace('accueil', 'un-autre-jeton', ports(g))).toEqual({
      ok: false,
      motif: 'inconnue',
    });
    expect(g.lus).toEqual([]);
  });

  it('REQ-JUR-025 : l’ouverture limitée tient toujours — hors de sa liste, refusée avant l’acceptation', async () => {
    const g = garde(ACCEPTEE_V2);
    const p = ports(g);
    p.depot.lire = async () => ligne('kyc_en_cours');
    expect(await pageEspace('accueil', JETON, p)).toEqual({
      ok: false,
      motif: 'hors_ouverture_limitee',
    });
    expect(g.lus).toEqual([]);
  });

  it('REQ-JUR-025 : les exemptions sont NOMMÉES — confidentialite et connexion, et elles seules', async () => {
    expect(Object.keys(EXEMPTIONS_NOMMEES)).toEqual(['confidentialite', 'connexion']);
    for (const raison of Object.values(EXEMPTIONS_NOMMEES))
      expect(raison.length).toBeGreaterThan(20);
    expect(estExempte('confidentialite')).toBe(true);
    expect(estExempte('connexion')).toBe(true);
    for (const s of ['accueil', 'deposer', 'conformite', 'Confidentialite', '', 'd', 'confirmer']) {
      expect(estExempte(s), s).toBe(false);
    }
    // L'action d'acceptation n'exige pas une acceptation qu'elle seule peut écrire : sans port, elle
    // passe ; la session, elle, reste exigée.
    expect(await actionEspace('confidentialite', JETON, ports(), async () => 'traitee')).toEqual({
      ok: true,
      valeur: 'traitee',
    });
    expect(
      await actionEspace('confidentialite', undefined, ports(), async () => 'traitee')
    ).toEqual({ ok: false, motif: 'absente' });
  });

  it('REQ-JUR-025 : les motifs de la garde forment une liste fermée', () => {
    expect([...MOTIFS_DE_LA_GARDE]).toEqual([
      'session_illisible',
      'acceptation_requise',
      'acceptation_illisible',
      'politique_non_publiable',
      'politique_illisible',
    ]);
  });
});

// ── Le disque ──────────────────────────────────────────────────────────────────────────────────

const RACINE_ESPACE = 'src/app/(espace)/';
const JUGES = /^(page\.tsx?|route\.ts|actions\.ts)$/;

/**
 * La faute d'un fichier SUIVI sous l'espace, ou `null`. Le segment se dérive du chemin (les groupes
 * `(…)` sont transparents ; la racine s'appelle `accueil`). Hors exemption nommée, une page appelle
 * `pageEspace`, une action ou une route `actionEspace` ou `pageEspace`, pour SON segment.
 */
export function fauteDeGarde(chemin: string, contenu: string): string | null {
  const parties = chemin
    .slice(RACINE_ESPACE.length)
    .split('/')
    .filter((p) => !/^\(.*\)$/.test(p));
  const nom = parties.at(-1) ?? '';
  if (!JUGES.test(nom)) return null;
  const segment = parties.length === 1 ? 'accueil' : (parties[0] ?? '');
  if (estExempte(segment)) return null;
  const appel = new RegExp(`\\b(pageEspace|actionEspace)\\(\\s*['"\`]${segment}['"\`]`);
  return appel.test(contenu) ? null : `sans_garde ${chemin} (« ${segment} »)`;
}

function suivis(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', RACINE_ESPACE], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

describe('REQ-JUR-025 — sur le disque, chaque fichier suivi de l’espace appelle la garde', () => {
  it('REQ-JUR-025 : le dépôt réel — aucune faute, et le plancher dit ce qui a été jugé', () => {
    const fichiers = suivis();
    // Le témoin lit ce que git suit : un dépôt vide ne prouverait rien.
    expect(fichiers.length).toBeGreaterThan(0);
    const fautes = fichiers
      .map((f) => fauteDeGarde(f, readFileSync(f, 'utf8')))
      .filter((f) => f !== null);
    expect(fautes).toEqual([]);
  });

  it.each([
    [
      'une page sans garde',
      'src/app/(espace)/mes-commissions/page.tsx',
      'export default async function P() { return lire(); }',
      'sans_garde src/app/(espace)/mes-commissions/page.tsx (« mes-commissions »)',
    ],
    [
      'une page qui ne fait que la session, sans acceptation',
      'src/app/(espace)/conformite/page.tsx',
      "export default async function P() { await exigerSessionPour('conformite', j, p); }",
      'sans_garde src/app/(espace)/conformite/page.tsx (« conformite »)',
    ],
    [
      'une action gardée pour un AUTRE segment',
      'src/app/(espace)/deposer/actions.ts',
      "'use server';\nexport async function d() { return actionEspace('profil', j, p, f); }",
      'sans_garde src/app/(espace)/deposer/actions.ts (« deposer »)',
    ],
    [
      'la page d’accueil, à la racine du groupe',
      'src/app/(espace)/page.tsx',
      'export default function P() { return null; }',
      'sans_garde src/app/(espace)/page.tsx (« accueil »)',
    ],
    [
      'une route d’un segment public qui n’est pas exempté par nom',
      'src/app/(espace)/d/[jeton]/route.ts',
      'export async function GET() { return lire(); }',
      'sans_garde src/app/(espace)/d/[jeton]/route.ts (« d »)',
    ],
  ])('REQ-JUR-025 : PIÈGE — %s rougit, nommé', (_quoi, chemin, contenu, faute) => {
    expect(fauteDeGarde(chemin, contenu)).toBe(faute);
  });

  it('REQ-JUR-025 : CONTRE-PIÈGE — une page et une action gardées passent ; une exemption nommée passe ; un fichier non jugé est ignoré', () => {
    expect(
      fauteDeGarde(
        'src/app/(espace)/mes-commissions/page.tsx',
        "export default async function P() { const v = await pageEspace('mes-commissions', j, p); }"
      )
    ).toBeNull();
    expect(
      fauteDeGarde(
        'src/app/(espace)/deposer/actions.ts',
        "'use server';\nexport async function d() { return actionEspace('deposer', j, p, f); }"
      )
    ).toBeNull();
    expect(fauteDeGarde('src/app/(espace)/connexion/page.tsx', 'export default P;')).toBeNull();
    expect(
      fauteDeGarde('src/app/(espace)/confidentialite/page.tsx', 'export default P;')
    ).toBeNull();
    expect(fauteDeGarde('src/app/(espace)/accueil/ecran.tsx', 'export const E = 1;')).toBeNull();
  });
});
