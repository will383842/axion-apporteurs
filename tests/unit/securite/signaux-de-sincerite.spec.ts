// @req REQ-SEC-017
// @req REQ-SEC-020
// @req REQ-SEC-036
// @req REQ-SEC-038
// @req REQ-JUR-031
// @req REQ-JUR-040
// @req REQ-DM-033
/**
 * SEC-14 — les détecteurs de sincérité, jugés PURS : la NATURE des signaux retenus, jamais leurs
 * valeurs. Les poids et le seuil vivent en configuration hors dépôt (REQ-GOV-031) : les réglages
 * de ce fichier sont des valeurs de témoin, choisies pour placer chaque cas d'un côté ou de l'autre
 * de la frontière, et ne disent rien des réglages réels.
 *
 * Ce que le fichier tient :
 *   — la liste FERMÉE des cinq signaux de CONTENU, et l'absence de tout signal de rythme, d'horaire
 *     ou de lieu (REQ-SEC-017, REQ-JUR-031) ;
 *   — un témoin positif et un négatif par signal ;
 *   — la lecture du réglage : clé inconnue, doublon, borne, signal multi-identités qui ouvrirait
 *     seul (REQ-SEC-036) — refusés en nommant la clé, jamais la valeur ;
 *   — les champs INATTEIGNABLES depuis le calcul (siège, zone, secteur, date du contact) : la garde
 *     lit la source du module et rougit sur un témoin qui en lit un (REQ-SEC-020, REQ-JUR-040) ;
 *   — le module n'écrit aucun gel ni aucune révocation (REQ-SEC-038, REQ-DM-033).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHAMPS_INATTEIGNABLES,
  CRITERES_DE_REVUE_HUMAINE,
  ReglageDeSinceriteInvalide,
  SIGNAUX_DE_SINCERITE,
  lireReglageDeSincerite,
  scoreDeSincerite,
  signauxDeSincerite,
  type DeclarationJugee,
  type ReglageDeSincerite,
} from '../../../src/server/anomalie/sincerite';

const RACINE = join(__dirname, '..', '..', '..');
const CHEMIN_DU_MODULE = 'src/server/anomalie/sincerite.ts';
const SOURCE = readFileSync(join(RACINE, CHEMIN_DU_MODULE), 'utf8');

/** Un réglage de témoin : chaque signal pèse, et le seuil sépare un signal seul de deux. */
const TEXTE_DU_REGLAGE = [
  'seuil=50',
  'texte_min=20',
  'tranche_minutes=60',
  'suite_min=3',
  'recul_heures=72',
  'poids.contact_dirigeant=30',
  'poids.contact_generique=30',
  'poids.texte_court_ou_identique=30',
  'poids.multi_identites=30',
  'poids.siren_ordonnes=30',
].join(';');

function reglage(): ReglageDeSincerite {
  const r = lireReglageDeSincerite(TEXTE_DU_REGLAGE);
  if (r === null) throw new Error('réglage de témoin illisible');
  return r;
}

const T0 = Date.parse('2026-10-01T09:00:00.000Z');
const MINUTE = 60_000;

/**
 * Une déclaration de témoin. AUCUN défaut sur ce que les témoins font varier (RM-11) : chaque
 * appel nomme l'apporteur, le SIREN, l'instant, le contact, le contexte et les empreintes.
 */
function declaration(d: {
  id: string;
  apporteurId: string;
  siren: string;
  raisonSociale: string | null;
  minute: number;
  nomContact: string | null;
  prenomContact: string | null;
  empreinteNomContact: string | null;
  empreintesDirigeants: readonly string[];
  contexte: string | null;
  ipHash: string | null;
  agentHash: string | null;
}): DeclarationJugee {
  return {
    attributionId: d.id,
    apporteurId: d.apporteurId,
    siren: d.siren,
    raisonSociale: d.raisonSociale,
    deposeeAt: new Date(T0 + d.minute * MINUTE),
    nomContact: d.nomContact,
    prenomContact: d.prenomContact,
    empreinteNomContact: d.empreinteNomContact,
    empreintesDirigeants: d.empreintesDirigeants,
    contexte: d.contexte,
    ipHash: d.ipHash,
    agentHash: d.agentHash,
  };
}

const CONTEXTE_LONG = 'Rencontre au salon régional, échange sur le renouvellement de leur parc.';
const AUTRE_CONTEXTE_LONG =
  'Appel entrant après une recommandation de leur expert-comptable habituel.';

/** Une déclaration neutre : aucun des cinq signaux n'y est présent. */
const neutre = (id: string, apporteurId: string, siren: string, minute: number) =>
  declaration({
    id,
    apporteurId,
    siren,
    raisonSociale: `Société ${id}`,
    minute,
    nomContact: 'Martin',
    prenomContact: 'Claire',
    empreinteNomContact: 'e'.repeat(64),
    empreintesDirigeants: ['d'.repeat(64)],
    contexte: `${CONTEXTE_LONG} (${id})`,
    ipHash: `ip-${apporteurId}`.padEnd(16, '0').slice(0, 16),
    agentHash: `ag-${apporteurId}`.padEnd(64, '0'),
  });

describe('REQ-SEC-017 — la liste FERMÉE des signaux : cinq signaux de CONTENU, rien sur le rythme, l’horaire ou le lieu', () => {
  it('REQ-SEC-017 : les cinq signaux sont exactement ceux qui décrivent CE QUI EST DÉCLARÉ', () => {
    expect([...SIGNAUX_DE_SINCERITE].sort()).toEqual(
      [
        'contact_dirigeant',
        'contact_generique',
        'multi_identites',
        'siren_ordonnes',
        'texte_court_ou_identique',
      ].sort()
    );
  });

  it('REQ-SEC-017 REQ-JUR-031 : TÉMOIN — aucun signal de rythme, d’horaire ou de lieu n’entre dans la composition du score', () => {
    const interdits =
      /rafale|nocturne|hors_?zone|rythme|horaire|heure|zone|secteur|delai|volume|nombre/i;
    expect(SIGNAUX_DE_SINCERITE.filter((s) => interdits.test(s))).toEqual([]);
    // Ils ne subsistent que comme critères de revue humaine, HORS du score : les deux listes sont
    // disjointes, et aucun critère de revue n'a de poids lisible dans le réglage.
    expect(
      CRITERES_DE_REVUE_HUMAINE.filter((c) =>
        (SIGNAUX_DE_SINCERITE as readonly string[]).includes(c)
      )
    ).toEqual([]);
    for (const c of CRITERES_DE_REVUE_HUMAINE) {
      expect(() => lireReglageDeSincerite(`${TEXTE_DU_REGLAGE};poids.${c}=1`)).toThrow(
        ReglageDeSinceriteInvalide
      );
    }
  });

  it('REQ-SEC-017 : TÉMOIN — la garde de nature rougit sur une liste où l’on aurait glissé « rafale »', () => {
    const interdits =
      /rafale|nocturne|hors_?zone|rythme|horaire|heure|zone|secteur|delai|volume|nombre/i;
    const glissee = [...SIGNAUX_DE_SINCERITE, 'rafale'];
    expect(glissee.filter((s) => interdits.test(s))).toEqual(['rafale']);
  });
});

describe('REQ-SEC-017 — un témoin positif et un négatif par signal', () => {
  it('REQ-SEC-017 : contact_dirigeant — l’empreinte du nom du contact est celle d’un dirigeant de l’API (positif)', () => {
    const d = { ...neutre('a1', 'p1', '100000001', 0), empreinteNomContact: 'd'.repeat(64) };
    expect(signauxDeSincerite(d, [d], reglage())).toEqual(['contact_dirigeant']);
  });

  it('REQ-SEC-017 : contact_dirigeant — une empreinte absente des dirigeants, ou un contact purgé, ne signale rien (négatif)', () => {
    const d = neutre('a1', 'p1', '100000001', 0);
    expect(signauxDeSincerite(d, [d], reglage())).toEqual([]);
    const purge = { ...d, empreinteNomContact: null, nomContact: null, prenomContact: null };
    expect(signauxDeSincerite(purge, [purge], reglage())).toEqual([]);
  });

  it('REQ-SEC-017 : contact_generique — un contact qui ne nomme personne (« Service Accueil ») signale (positif)', () => {
    const d = {
      ...neutre('a1', 'p1', '100000001', 0),
      nomContact: 'Accueil',
      prenomContact: 'Service',
    };
    expect(signauxDeSincerite(d, [d], reglage())).toEqual(['contact_generique']);
    const seul = { ...d, nomContact: 'STANDARD', prenomContact: '' };
    expect(signauxDeSincerite(seul, [seul], reglage())).toEqual(['contact_generique']);
  });

  it('REQ-SEC-017 : contact_generique — une personne nommée, même au nom proche d’un mot générique, ne signale rien (négatif)', () => {
    const d = {
      ...neutre('a1', 'p1', '100000001', 0),
      nomContact: 'Directeur',
      prenomContact: 'Paul',
    };
    expect(signauxDeSincerite(d, [d], reglage())).toEqual([]);
    const accueillant = { ...d, nomContact: 'Accueillant', prenomContact: 'Marie' };
    expect(signauxDeSincerite(accueillant, [accueillant], reglage())).toEqual([]);
  });

  it('REQ-SEC-017 : texte_court_ou_identique — un contexte sous le minimum de caractères utiles signale (positif)', () => {
    const d = { ...neutre('a1', 'p1', '100000001', 0), contexte: 'vu   hier' };
    expect(signauxDeSincerite(d, [d], reglage())).toEqual(['texte_court_ou_identique']);
  });

  it('REQ-SEC-017 : texte_court_ou_identique — le même contexte, à la casse et aux blancs près, sur deux déclarations du même apporteur signale (positif)', () => {
    const a = { ...neutre('a1', 'p1', '100000001', 0), contexte: CONTEXTE_LONG };
    const b = {
      ...neutre('a2', 'p1', '200000002', 5),
      contexte: `  ${CONTEXTE_LONG.toUpperCase()} `,
    };
    expect(signauxDeSincerite(a, [a, b], reglage())).toEqual(['texte_court_ou_identique']);
    expect(signauxDeSincerite(b, [a, b], reglage())).toEqual(['texte_court_ou_identique']);
  });

  it('REQ-SEC-017 : texte_court_ou_identique — deux contextes différents, ou le même chez deux apporteurs distincts, ne signalent rien (négatif)', () => {
    const a = { ...neutre('a1', 'p1', '100000001', 0), contexte: CONTEXTE_LONG };
    const b = { ...neutre('a2', 'p1', '200000002', 5), contexte: AUTRE_CONTEXTE_LONG };
    expect(signauxDeSincerite(a, [a, b], reglage())).toEqual([]);
    const c = { ...neutre('a3', 'p2', '300000003', 5), contexte: CONTEXTE_LONG };
    expect(signauxDeSincerite(a, [a, c], reglage())).toEqual([]);
    const purge = { ...a, contexte: null };
    expect(signauxDeSincerite(purge, [purge], reglage())).toEqual([]);
  });

  it('REQ-SEC-017 REQ-SEC-036 : multi_identites — la même empreinte réseau ET le même navigateur, dans la même tranche, pour deux apporteurs distincts signale (positif)', () => {
    const a = {
      ...neutre('a1', 'p1', '100000001', 0),
      ipHash: 'i'.repeat(16),
      agentHash: 'g'.repeat(64),
    };
    const b = {
      ...neutre('a2', 'p2', '700000007', 10),
      ipHash: 'i'.repeat(16),
      agentHash: 'g'.repeat(64),
    };
    expect(signauxDeSincerite(a, [a, b], reglage())).toEqual(['multi_identites']);
    expect(signauxDeSincerite(b, [a, b], reglage())).toEqual(['multi_identites']);
  });

  it('REQ-SEC-036 : multi_identites — le même apporteur, un navigateur différent, ou une autre tranche ne signalent rien (négatif)', () => {
    const a = {
      ...neutre('a1', 'p1', '100000001', 0),
      ipHash: 'i'.repeat(16),
      agentHash: 'g'.repeat(64),
    };
    const memeApporteur = {
      ...neutre('a2', 'p1', '700000007', 10),
      ipHash: 'i'.repeat(16),
      agentHash: 'g'.repeat(64),
    };
    expect(signauxDeSincerite(a, [a, memeApporteur], reglage())).toEqual([]);
    const autreNavigateur = {
      ...neutre('a3', 'p2', '800000008', 10),
      ipHash: 'i'.repeat(16),
      agentHash: 'h'.repeat(64),
    };
    expect(signauxDeSincerite(a, [a, autreNavigateur], reglage())).toEqual([]);
    const autreTranche = {
      ...neutre('a4', 'p2', '900000009', 60),
      ipHash: 'i'.repeat(16),
      agentHash: 'g'.repeat(64),
    };
    expect(signauxDeSincerite(a, [a, autreTranche], reglage())).toEqual([]);
    const sansEmpreinte = { ...a, ipHash: null };
    const autreSansEmpreinte = {
      ...neutre('a5', 'p2', '910000009', 1),
      ipHash: null,
      agentHash: 'g'.repeat(64),
    };
    expect(
      signauxDeSincerite(sansEmpreinte, [sansEmpreinte, autreSansEmpreinte], reglage())
    ).toEqual([]);
  });

  it('REQ-SEC-017 : siren_ordonnes — une suite de SIREN croissants, dans l’ordre des dépôts d’un apporteur, signale chacun de ses membres (positif)', () => {
    const suite = [
      { ...neutre('a1', 'p1', '311111111', 0), raisonSociale: 'Zeta' },
      { ...neutre('a2', 'p1', '322222222', 1), raisonSociale: 'Alpha' },
      { ...neutre('a3', 'p1', '333333333', 2), raisonSociale: 'Mu' },
    ];
    for (const d of suite)
      expect(signauxDeSincerite(d, suite, reglage())).toEqual(['siren_ordonnes']);
  });

  it('REQ-SEC-017 : siren_ordonnes — une suite de raisons sociales dans l’ordre alphabétique signale aussi (positif)', () => {
    const suite = [
      { ...neutre('a1', 'p1', '399999999', 0), raisonSociale: 'Abeille SARL' },
      { ...neutre('a2', 'p1', '311111111', 1), raisonSociale: 'Bâtiments du Nord' },
      { ...neutre('a3', 'p1', '355555555', 2), raisonSociale: 'Cèdre et Cie' },
    ];
    for (const d of suite)
      expect(signauxDeSincerite(d, suite, reglage())).toEqual(['siren_ordonnes']);
  });

  it('REQ-SEC-017 : siren_ordonnes — une suite trop courte, rompue, ou partagée entre deux apporteurs ne signale rien (négatif)', () => {
    const courte = [
      { ...neutre('a1', 'p1', '311111111', 0), raisonSociale: 'Zeta' },
      { ...neutre('a2', 'p1', '322222222', 1), raisonSociale: 'Alpha' },
    ];
    for (const d of courte) expect(signauxDeSincerite(d, courte, reglage())).toEqual([]);
    const rompue = [
      { ...neutre('a1', 'p1', '311111111', 0), raisonSociale: 'Zeta' },
      { ...neutre('a2', 'p1', '300000000', 1), raisonSociale: 'Alpha' },
      { ...neutre('a3', 'p1', '333333333', 2), raisonSociale: 'Mu' },
    ];
    for (const d of rompue) expect(signauxDeSincerite(d, rompue, reglage())).toEqual([]);
    const partagee = [
      { ...neutre('a1', 'p1', '311111111', 0), raisonSociale: 'Zeta' },
      { ...neutre('a2', 'p2', '322222222', 1), raisonSociale: 'Alpha' },
      { ...neutre('a3', 'p1', '333333333', 2), raisonSociale: 'Mu' },
    ];
    for (const d of partagee) expect(signauxDeSincerite(d, partagee, reglage())).toEqual([]);
  });
});

describe('REQ-SEC-017 — le score : la somme des poids des signaux présents, bornée à l’échelle de la base', () => {
  it('REQ-SEC-017 : le score additionne les poids lus dans le réglage, et un signal sans poids n’y compte pas', () => {
    const r = reglage();
    expect(scoreDeSincerite([], r)).toBe(0);
    expect(scoreDeSincerite(['contact_dirigeant'], r)).toBe(r.poids.contact_dirigeant);
    expect(scoreDeSincerite(['contact_dirigeant', 'siren_ordonnes'], r)).toBe(
      r.poids.contact_dirigeant + r.poids.siren_ordonnes
    );
    const sansPoids = lireReglageDeSincerite(
      'seuil=50;texte_min=20;tranche_minutes=60;suite_min=3;recul_heures=72;poids.contact_dirigeant=30'
    );
    expect(sansPoids?.poids.siren_ordonnes).toBe(0);
    expect(scoreDeSincerite(['siren_ordonnes'], sansPoids!)).toBe(0);
  });

  it('REQ-SEC-017 : TÉMOIN — le score ne dépasse jamais l’échelle tenue par la base (anomalies_score_sincerite)', () => {
    const r = lireReglageDeSincerite(
      'seuil=50;texte_min=20;tranche_minutes=60;suite_min=3;recul_heures=72;' +
        SIGNAUX_DE_SINCERITE.map((s) => `poids.${s}=${s === 'multi_identites' ? 49 : 100}`).join(
          ';'
        )
    )!;
    expect(scoreDeSincerite([...SIGNAUX_DE_SINCERITE], r)).toBe(100);
  });
});

describe('REQ-SEC-017 REQ-SEC-036 — le réglage hors dépôt : lu, jugé, refusé en nommant la clé, jamais la valeur', () => {
  it('REQ-SEC-017 : absent, il n’y a pas de réglage — rien n’est jugé (le défaut est fermé)', () => {
    expect(lireReglageDeSincerite(undefined)).toBeNull();
  });

  it.each([
    ['une clé inconnue', `${TEXTE_DU_REGLAGE};poids.inconnu=3`, 'poids.inconnu'],
    ['une clé en double', `${TEXTE_DU_REGLAGE};seuil=40`, 'seuil'],
    [
      'une clé requise absente',
      'seuil=50;texte_min=20;tranche_minutes=60;suite_min=3',
      'recul_heures',
    ],
    ['un seuil nul', TEXTE_DU_REGLAGE.replace('seuil=50', 'seuil=0'), 'seuil'],
    ['un seuil hors de l’échelle', TEXTE_DU_REGLAGE.replace('seuil=50', 'seuil=101'), 'seuil'],
    [
      'un poids hors de l’échelle',
      TEXTE_DU_REGLAGE.replace('contact_dirigeant=30', 'contact_dirigeant=101'),
      'poids.contact_dirigeant',
    ],
    [
      'une suite trop courte pour être une suite',
      TEXTE_DU_REGLAGE.replace('suite_min=3', 'suite_min=1'),
      'suite_min',
    ],
    ['une forme illisible', 'seuil:50', '(forme)'],
  ])('REQ-SEC-017 : TÉMOIN — %s est refusé, la clé nommée', (_cas, texte, cle) => {
    let refus: unknown;
    try {
      lireReglageDeSincerite(texte);
    } catch (e) {
      refus = e;
    }
    expect(refus).toBeInstanceOf(ReglageDeSinceriteInvalide);
    expect((refus as Error).message).toContain(cle);
  });

  it('REQ-SEC-036 : TÉMOIN — un réglage où le signal multi-identités ouvrirait SEUL une anomalie est refusé : il n’est jamais déterminant seul', () => {
    const texte = TEXTE_DU_REGLAGE.replace('multi_identites=30', 'multi_identites=50');
    expect(() => lireReglageDeSincerite(texte)).toThrow(/poids\.multi_identites/);
  });

  it('REQ-SEC-017 : TÉMOIN — le refus ne porte jamais la valeur reçue', () => {
    const texte = TEXTE_DU_REGLAGE.replace('seuil=50', 'seuil=987');
    expect(() => lireReglageDeSincerite(texte)).toThrow(ReglageDeSinceriteInvalide);
    try {
      lireReglageDeSincerite(texte);
    } catch (e) {
      expect((e as Error).message).not.toContain('987');
    }
  });
});

/**
 * La garde des champs inatteignables : elle lit la SOURCE du module, sans ses commentaires ni ses
 * chaînes, et cherche toute lecture d'un champ du siège, de la zone, du secteur ou de la date du
 * contact — propriété, clé de sélection, colonne SQL. Les déclarations de la liste elle-même sont
 * des chaînes : elles ne lisent rien.
 */
function sansCommentairesNiChaines(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

const enSerpent = (nom: string) => nom.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

function lecturesInterdites(source: string): string[] {
  const code = sansCommentairesNiChaines(source);
  return CHAMPS_INATTEIGNABLES.filter((champ) =>
    [champ, enSerpent(champ)].some((nom) => new RegExp(`\\b${nom}\\b`).test(code))
  );
}

describe('REQ-SEC-020 REQ-JUR-040 — les champs INATTEIGNABLES depuis le calcul du score', () => {
  it('REQ-SEC-020 : la liste couvre le siège (position, département, région, commune), la zone et le secteur', () => {
    expect([...CHAMPS_INATTEIGNABLES]).toEqual(
      expect.arrayContaining([
        'latitudeMicrodeg',
        'longitudeMicrodeg',
        'departement',
        'region',
        'communeSiege',
        'zone',
        'secteur',
      ])
    );
  });

  it('REQ-JUR-040 : la date du contact et l’heure de l’appareil en sont aussi', () => {
    expect([...CHAMPS_INATTEIGNABLES]).toEqual(
      expect.arrayContaining(['dateContact', 'clientCapturedAt'])
    );
  });

  it('REQ-SEC-020 REQ-JUR-040 : le module du score ne lit aucun champ inatteignable', () => {
    expect(lecturesInterdites(SOURCE)).toEqual([]);
  });

  it.each([
    ['une propriété lue', 'const d = ligne.departement;'],
    ['une clé de sélection Prisma', 'select: { latitudeMicrodeg: true },'],
    ['une colonne SQL brute', 'SELECT commune_siege FROM attributions'],
    ['la date du contact', 'if (a.dateContact) poids += 1;'],
  ])('REQ-SEC-020 REQ-JUR-040 : TÉMOIN — un calcul de score qui lit %s rougit', (_cas, ligne) => {
    expect(lecturesInterdites(`${SOURCE}\n${ligne}\n`).length).toBeGreaterThan(0);
  });
});

describe('REQ-SEC-017 REQ-SEC-038 REQ-DM-033 — le franchissement OUVRE une anomalie et ne pose AUCUN gel', () => {
  const ECRITURES_DE_GEL =
    /depotsGelesDepuis|depots_geles_depuis|gele_fraude|revoqueAt|revoque_at|jetonDepot|jetons_depot/;

  it('REQ-SEC-038 : le module n’écrit ni gel ni révocation de jeton : il n’en nomme aucun', () => {
    expect(sansCommentairesNiChaines(SOURCE)).not.toMatch(ECRITURES_DE_GEL);
    expect(SOURCE).not.toMatch(/'gele_fraude'|"gele_fraude"/);
  });

  it('REQ-SEC-038 : TÉMOIN — un chemin qui poserait le gel depuis le module rougit', () => {
    const glisse = `${SOURCE}\nawait tx.apporteur.update({ where: { id }, data: { depotsGelesDepuis: maintenant } });\n`;
    expect(sansCommentairesNiChaines(glisse)).toMatch(ECRITURES_DE_GEL);
  });

  it('REQ-JUR-031 : le module ne lit aucune heure du jour, ni aucun compte de dépôts', () => {
    const code = sansCommentairesNiChaines(SOURCE);
    expect(code).not.toMatch(/getHours|getUTCHours|getDay|getUTCDay|\._count\b|\.count\(/);
  });
});
