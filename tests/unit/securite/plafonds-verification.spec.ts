// @req REQ-SEC-021
/**
 * SEC-72 (REQ-SEC-021) — les plafonds de « Vérifier une entreprise », en CONFIGURATION PRIVÉE.
 *
 * Les conditions de la sécurité (#319, 6036696268) et de la juriste (#319, 6036671294 ; texte du refus,
 * #474, 6036797355), relayées par l'arbitrage de la coordination (#319, 6036979782) :
 *   — le secret porte cinq clés FERMÉES et bornées, cohérentes ; tout refus nomme la clé et un motif
 *     fermé, jamais la valeur, et fait refuser la vérification ;
 *   — la garde n'admet la sentinelle hors dépôt que pour les trois compteurs `verif:`, avec
 *     `surPanne: refuser` (témoin à deux faces) et le secret déclaré dans `src/lib/env.ts` ;
 *   — le secret n'est jamais journalisé ;
 *   — le dépôt ne passe jamais par la vérification ; le refus est neutre, le même pour les trois
 *     fenêtres, n'écrit rien et n'ouvre aucune réserve.
 *
 * Toutes les valeurs ci-dessous sont FACTICES : aucune vraie valeur n'est au dépôt.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import {
  CLES_DES_PLAFONDS,
  COMPTEURS,
  MOTIFS_DE_PLAFONDS_REFUSES,
  VARIABLE_DES_PLAFONDS,
  limiter,
  lirePlafondsHorsDepot,
  sujetDepuisEmpreinte,
} from '../../../src/server/securite/rate-limit';
import { analyser, universDuDepot } from '../../../scripts/gates/rate-famille';
import { NOMS_DES_SECRETS_CONDITIONNELS } from '../../../src/lib/env';
import {
  verifierUneEntreprise,
  type DemandeDeVerification,
  type PortsDeVerification,
} from '../../../src/server/verification/verifier';
import { VERIFICATION_INDISPONIBLE } from '../../../src/content/micro-copy/espace/verification';

const FACTICES =
  'identite_jour=7;identite_court=2;ip_jour=9;fenetre_jour_minutes=600;fenetre_court_minutes=5';
const SUJET = sujetDepuisEmpreinte('a'.repeat(64));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('REQ-SEC-021 — le secret des plafonds : cinq clés fermées, bornées, cohérentes', () => {
  it('REQ-SEC-021 : TÉMOIN — une forme valide se lit, clé par clé', () => {
    const l = lirePlafondsHorsDepot(FACTICES);
    expect(l.ok).toBe(true);
    if (l.ok) expect(Object.keys(l.plafonds).sort()).toEqual([...CLES_DES_PLAFONDS].sort());
  });

  it.each([
    ['absent', undefined, '(forme)', 'absent'],
    ['vide', '', '(forme)', 'absent'],
    ['forme', 'identite_jour=7;;ip_jour=9', '(forme)', 'forme'],
    ['inconnue', `${FACTICES};depot_jour=3`, '(forme)', 'inconnue'],
    ['en double', `${FACTICES};ip_jour=11`, 'ip_jour', 'en_double'],
    [
      'absente',
      'identite_jour=7;identite_court=2;ip_jour=9;fenetre_jour_minutes=600',
      'fenetre_court_minutes',
      'absente',
    ],
    [
      'limite nulle',
      FACTICES.replace('identite_court=2', 'identite_court=0'),
      'identite_court',
      'hors_bornes',
    ],
    [
      'fenêtre trop longue',
      FACTICES.replace('fenetre_jour_minutes=600', 'fenetre_jour_minutes=99999'),
      'fenetre_jour_minutes',
      'hors_bornes',
    ],
    [
      'rafale au-dessus du plafond',
      FACTICES.replace('identite_court=2', 'identite_court=8'),
      'identite_court',
      'incoherente',
    ],
    [
      'fenêtre courte plus longue',
      FACTICES.replace('fenetre_court_minutes=5', 'fenetre_court_minutes=601'),
      'fenetre_court_minutes',
      'incoherente',
    ],
    [
      'adresse sous l’apporteur',
      FACTICES.replace('ip_jour=9', 'ip_jour=6'),
      'ip_jour',
      'incoherente',
    ],
  ])(
    'REQ-SEC-021 : TÉMOIN — %s : refusé, la clé et un motif FERMÉ, jamais la valeur',
    (_l, texte, cle, motif) => {
      const l = lirePlafondsHorsDepot(texte);
      expect(l).toEqual({ ok: false, cle, motif });
      expect(MOTIFS_DE_PLAFONDS_REFUSES).toContain(motif);
      expect(JSON.stringify(l)).not.toMatch(/\d/);
    }
  );

  it('REQ-SEC-021 : TÉMOIN — un secret refusé fait REFUSER chaque compteur, et le signal ne porte que la clé et le motif', async () => {
    const lignes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((l) => (lignes.push(String(l)), true));
    const SECRET_REFUSE = FACTICES.replace('ip_jour=9', 'ip_jour=6');
    vi.stubEnv(VARIABLE_DES_PLAFONDS, SECRET_REFUSE);
    for (const nom of ['verif:identite-jour', 'verif:identite-court', 'verif:ip-jour'] as const) {
      const v = await limiter(nom, SUJET, 0);
      expect(v).toMatchObject({ autorise: false, panne: true, motif: 'limite_non_configuree' });
    }
    const signaux = lignes.filter((l) => l.includes('plafonds_verification_refuses'));
    expect(signaux.length).toBeGreaterThan(0);
    for (const l of signaux) {
      expect(JSON.parse(l)).toEqual({
        signal: 'plafonds_verification_refuses',
        cle: 'ip_jour',
        motif: 'incoherente',
      });
      expect(l).not.toContain(SECRET_REFUSE);
      expect(l).not.toMatch(/\d/);
    }
  });
});

describe('REQ-SEC-021 — la garde : la troisième voie, fermée', () => {
  it('REQ-SEC-021 : le dépôt est vert, et ses trois compteurs `verif:` passent par la configuration privée', async () => {
    const r = await analyser(universDuDepot());
    expect(r.fautes).toEqual([]);
    expect(
      Object.entries(r.voies)
        .filter(([, v]) => v === 'configuration')
        .map(([n]) => n)
    ).toEqual(['verif:identite-jour', 'verif:identite-court', 'verif:ip-jour']);
  });

  it('REQ-SEC-021 : TÉMOIN À DEUX FACES — `surPanne: laisser-passer` sur un compteur de la configuration rougit ; `refuser` reste vert', async () => {
    const base = universDuDepot();
    const ouvert = await analyser({
      ...base,
      registre: {
        ...base.registre,
        'verif:ip-jour': { ...COMPTEURS['verif:ip-jour'], surPanne: 'laisser-passer' },
      },
    });
    expect(
      ouvert.fautes.filter(
        (f) => f.famille === 'configuration_mal_declaree' && f.message.includes('verif:ip-jour')
      )
    ).toHaveLength(1);
    const ferme = await analyser(base);
    expect(ferme.fautes.filter((f) => f.famille === 'configuration_mal_declaree')).toEqual([]);
  });

  it('REQ-SEC-021 : TÉMOIN — la sentinelle sur un autre compteur rougit `sentinelle_hors_liste`', async () => {
    const base = universDuDepot();
    const r = await analyser({
      ...base,
      registre: {
        ...base.registre,
        'magic:courriel': { ...COMPTEURS['magic:courriel'], limite: 'hors-depot' },
      },
    });
    expect(
      r.fautes.filter(
        (f) => f.famille === 'sentinelle_hors_liste' && f.message.includes('magic:courriel')
      ).length
    ).toBeGreaterThan(0);
  });

  it('REQ-SEC-021 : TÉMOIN — un secret qui n’est pas déclaré dans `src/lib/env.ts` rougit', async () => {
    expect(NOMS_DES_SECRETS_CONDITIONNELS).toContain(VARIABLE_DES_PLAFONDS);
    const r = await analyser({ ...universDuDepot(), secretsConditionnels: [] });
    expect(r.fautes.filter((f) => f.famille === 'configuration_mal_declaree')).toHaveLength(3);
  });
});

/** Les fichiers de code sous un dossier, récursivement. */
function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const c = `${dossier}/${n}`;
    if (statSync(c).isDirectory()) return sources(c);
    return /\.(ts|tsx|mts|cts|js|mjs)$/.test(n) ? [c] : [];
  });
}

describe('REQ-SEC-021 — le secret n’est jamais journalisé', () => {
  it('REQ-SEC-021 : TÉMOIN statique — seuls `src/lib/env.ts` et `rate-limit.ts` nomment le secret, et la ligne de refus ne lit ni l’environnement ni le texte reçu', () => {
    const nommants = sources('src').filter((c) =>
      /PARTNERS_VERIFICATION_PLAFONDS|VARIABLE_DES_PLAFONDS/.test(readFileSync(c, 'utf8'))
    );
    expect(nommants.sort()).toEqual(['src/lib/env.ts', 'src/server/securite/rate-limit.ts']);
    const rl = readFileSync('src/server/securite/rate-limit.ts', 'utf8');
    const lectures = rl.match(/process\.env\[VARIABLE_DES_PLAFONDS\][^\n]*/g) ?? [];
    expect(lectures).toEqual(['process.env[VARIABLE_DES_PLAFONDS]);']);
    expect(rl).toMatch(/lirePlafondsHorsDepot\(process\.env\[VARIABLE_DES_PLAFONDS\]\)/);
    const ecritures = rl.match(/process\.stderr\.write\([\s\S]*?\);/g) ?? [];
    for (const e of ecritures) expect(e).not.toMatch(/process\.env|texte|plafonds\b/);
  });
});

describe('REQ-SEC-021 — les conditions de la juriste', () => {
  it('REQ-SEC-021 : TÉMOIN statique (condition 1) — le dépôt ne passe JAMAIS par la vérification', () => {
    for (const c of [
      ...sources('src/server/depot'),
      ...sources('src/server/attribution'),
      ...sources('src/server/anomalie'),
    ]) {
      expect(readFileSync(c, 'utf8'), c).not.toMatch(/from ['"][^'"]*verification\//);
    }
  });

  it('REQ-SEC-021 : TÉMOIN (conditions 2 et 4) — un refus n’écrit rien, ne lit aucun fait, et le service ne connaît ni réserve, ni anomalie, ni apporteur à modifier', async () => {
    const ecrits: string[] = [];
    const ports: PortsDeVerification = {
      compter: async () => ({ autorise: false }),
      anteriorite: async () => (ecrits.push('lu'), false),
      surLaListe: async () => (ecrits.push('lu'), false),
      entreprise: async () => (ecrits.push('lu'), 'active'),
      occupation: async () => (ecrits.push('lu'), { occupee: false, enFile: 0 }),
      derniereFin: async () => (ecrits.push('lu'), null),
      maintenant: () => new Date(0),
      journaliser: async () => void ecrits.push('journal'),
    };
    expect(await verifierUneEntreprise(ports, DEMANDE)).toEqual({ ok: false, refus: 'limite' });
    expect(ecrits).toEqual([]);
    for (const c of sources('src/server/verification')) {
      expect(readFileSync(c, 'utf8'), c).not.toMatch(/reserve|anomalie|apporteur\.update/i);
    }
  });

  it('REQ-SEC-021 : TÉMOIN (condition 3) — le refus est le MÊME pour les trois fenêtres', async () => {
    const rendus = new Set<string>();
    for (const refuse of ['identite', 'ip'] as const) {
      const ports = {
        compter: async (quoi: string) => ({ autorise: quoi !== refuse }),
      } as unknown as PortsDeVerification;
      rendus.add(JSON.stringify(await verifierUneEntreprise(ports, DEMANDE)));
    }
    expect([...rendus]).toEqual(['{"ok":false,"refus":"limite"}']);
    // Le port de production ne rend qu'un booléen : ni motif, ni fenêtre, ni reste.
    vi.stubEnv(VARIABLE_DES_PLAFONDS, '');
    const { compterAuRegistre } = await import('../../../src/server/verification/ports-prisma');
    for (const quoi of ['identite', 'ip'] as const) {
      expect(Object.keys(await compterAuRegistre(quoi, SUJET))).toEqual(['autorise']);
    }
  });

  it('REQ-SEC-021 : TÉMOIN (condition 3) — le texte du refus est NEUTRE : ni chiffre, ni « trop », ni « limite », ni « seuil » ; l’action mène à /deposer', () => {
    const texte = `${VERIFICATION_INDISPONIBLE.titre} ${VERIFICATION_INDISPONIBLE.phrase} ${VERIFICATION_INDISPONIBLE.action.libelle}`;
    expect(texte).not.toMatch(/\d|trop|limite|seuil|plafond|minute|heure|jour/i);
    expect(VERIFICATION_INDISPONIBLE.action.route).toBe('/deposer');
    expect(VERIFICATION_INDISPONIBLE.titre).toBe('Vérification indisponible pour le moment');
  });
});

const DEMANDE: DemandeDeVerification = {
  porteur: { apporteurId: '0190a5c0-0000-7000-8000-00000000000a' },
  siren: '552100554',
  sujetIdentite: SUJET,
  sujetIp: sujetDepuisEmpreinte('b'.repeat(64)),
  ipHash: 'c'.repeat(16),
};
