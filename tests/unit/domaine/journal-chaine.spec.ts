// @req REQ-DM-024
/**
 * Le chaînage du journal, en domaine pur — DM-01 (partners/ADR-0014, décisions 1 à 3).
 *
 * Ce fichier couvre à 100 % `src/domain/evenement/canonique.ts` et `src/domain/evenement/journal.ts`
 * SANS base : la preuve en base réelle (déclencheurs, verrou, effacement de tiers) est dans
 * `tests/integration/journal.spec.ts`. Les deux se complètent : ici, ce que `verifierChaine()` VOIT ;
 * là-bas, que la base refuse ce qu'on voudrait lui faire voir.
 *
 * RÈGLE DES TÉMOINS. Une altération frappe une ligne du MILIEU : un témoin construit sur la dernière
 * ligne ne distingue pas « tous les maillons » de « le dernier ».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonique, ErreurCanonicalisation } from '../../../src/domain/evenement/canonique';
import {
  ZERO,
  GENESE,
  ALGORITHME,
  calculerSelfHash,
  verifierChaine,
  type LigneJournal,
  type Enregistrement,
} from '../../../src/domain/evenement/journal';

// ── canonique ──────────────────────────────────────────────────────────────────────────────

describe('REQ-DM-024 — la forme canonique de l’enregistrement haché (sous-ensemble RFC 8785)', () => {
  it('REQ-DM-024 : deux ordres de clés rendent la même chaîne, sans espace, imbrication comprise', () => {
    const a = canonique({ b: 1, a: { d: [true, false, null], c: 'x' } });
    const b = canonique({ a: { c: 'x', d: [true, false, null] }, b: 1 });
    expect(a).toBe('{"a":{"c":"x","d":[true,false,null]},"b":1}');
    expect(b).toBe(a);
  });

  it('REQ-DM-024 : -0 se canonicalise en 0, un entier négatif reste signé', () => {
    expect(canonique({ n: -0, m: -12 })).toBe('{"m":-12,"n":0}');
  });

  it('REQ-DM-024 : un objet sans prototype est un objet simple', () => {
    const o: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    o['z'] = 'fin';
    expect(canonique(o)).toBe('{"z":"fin"}');
  });

  it.each([
    ['un flottant', { a: { montant: 1.5 } }, 'a.montant'],
    ['un entier non sûr', { a: 2 ** 53 }, 'a'],
    ['undefined', { a: [1, undefined] }, 'a[1]'],
    ['une Date', { survenuAt: new Date(0) }, 'survenuAt'],
    ['une Map', { a: new Map() }, 'a'],
    ['un bigint', { a: 1n }, 'a'],
    ['une fonction', { a: () => 1 }, 'a'],
    ['un symbole', { a: Symbol('s') }, 'a'],
  ])('REQ-DM-024 : %s lève en nommant le chemin de la valeur fautive', (_quoi, valeur, chemin) => {
    expect(() => canonique(valeur)).toThrow(ErreurCanonicalisation);
    expect(() => canonique(valeur)).toThrow(`« ${chemin} »`);
  });

  it('REQ-DM-024 : une valeur fautive à la racine est nommée « (racine) »', () => {
    expect(() => canonique(undefined)).toThrow('« (racine) »');
  });
});

// ── la genèse (décision 2) ────────────────────────────────────────────────────────────────────────

/** Le littéral de `self_hash` que la migration insère pour la genèse, lu sur le disque. */
function selfHashDeLaMigration(): string {
  const dossiers = readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const sql = readFileSync(`prisma/migrations/${dossiers[0]}/migration.sql`, 'utf8');
  const m = /'0{64}',\s*'([0-9a-f]{64})'\)/.exec(sql);
  if (!m) throw new Error('la migration ne porte plus la ligne de genèse');
  return m[1]!;
}

describe('REQ-DM-024 — la genèse ancre la chaîne et y inscrit son algorithme', () => {
  it('REQ-DM-024 : le self_hash que la migration insère est celui que le domaine calcule', () => {
    expect(selfHashDeLaMigration()).toBe(GENESE.selfHash);
  });

  it('REQ-DM-024 : la genèse est le seul maillon dont prevHash vaut 64 zéros, et elle nomme son algorithme', () => {
    expect(ZERO).toBe('0'.repeat(64));
    expect(GENESE.prevHash).toBe(ZERO);
    expect(GENESE.type).toBe('journal_ouvert');
    expect(GENESE.charge).toEqual({ algorithme: ALGORITHME });
    expect(GENESE.survenuAt).toBe('2026-09-19T00:00:00.000Z');
  });

  it('REQ-DM-024 : selfHash = SHA-256(prevHash + canonique(enregistrement)), hexadécimal minuscule', () => {
    const e: Enregistrement = {
      type: 'journal_ouvert',
      agregat: 'apporteur',
      agregatId: '4c3f1a52-7a0e-4d7e-9a0b-2f9c1d8e6b10',
      survenuAt: '2026-09-20T08:00:00.000Z',
      charge: { algorithme: ALGORITHME },
    };
    const attendu = createHash('sha256')
      .update(GENESE.selfHash + canonique({ ...e }), 'utf8')
      .digest('hex');
    expect(calculerSelfHash(GENESE.selfHash, e)).toBe(attendu);
    expect(attendu).toMatch(/^[0-9a-f]{64}$/);
  });

  // Les deux littéraux ci-dessous sont calculés HORS du code du dépôt : Python `hashlib.sha256` sur
  // `json.dumps(e, sort_keys=True, separators=(',', ':'))`, puis `sha256sum` sur la chaîne écrite à
  // la main. Le test précédent réutilise `canonique()` : il ne verrait pas une forme canonique qui
  // dérive des deux côtés à la fois. Celui-ci la confronte à un vecteur FIGÉ.
  it('REQ-DM-024 : vecteurs de référence figés, calculés hors du code — genèse et maillon aux champs d’agrégat remplis', () => {
    expect(GENESE.selfHash).toBe(
      '44c2b394d7fd4e8cab20e92d7011c1db8a13c8e4e1dc972363c2e6bf190ac197'
    );
    const e: Enregistrement = {
      type: 'journal_ouvert',
      agregat: 'apporteur',
      agregatId: '4c3f1a52-7a0e-4d7e-9a0b-2f9c1d8e6b10',
      survenuAt: '2026-09-20T08:00:00.000Z',
      charge: { algorithme: ALGORITHME },
    };
    expect(calculerSelfHash(GENESE.selfHash, e)).toBe(
      '81216949d5e882994d43bfceb3bbfdc9158a046d93abfa62ac7ed14422e38396'
    );
  });
});

// ── verifierChaine en domaine pur ───────────────────────────────────────────────────────────

/** Une chaîne de `n` maillons après la genèse, ids croissants, hachée par le domaine. */
function chaine(n: number): LigneJournal[] {
  const lignes: LigneJournal[] = [{ id: '1', ...GENESE }];
  for (let i = 0; i < n; i++) {
    const e: Enregistrement = {
      type: 'journal_ouvert',
      agregat: 'attribution',
      agregatId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      survenuAt: `2026-09-2${i % 10}T10:00:00.000Z`,
      charge: { algorithme: ALGORITHME },
    };
    const prevHash = lignes[lignes.length - 1]!.selfHash;
    lignes.push({ id: String(i + 2), ...e, prevHash, selfHash: calculerSelfHash(prevHash, e) });
  }
  return lignes;
}

describe('REQ-DM-024 — verifierChaine() suit les liens de hash et nomme la ligne fautive', () => {
  it('REQ-DM-024 : une chaîne intègre sort sans faute, compte ses maillons et rend sa tête', () => {
    const lignes = chaine(4);
    expect(verifierChaine(lignes)).toEqual({ ok: true, maillons: 5, tete: lignes[4]!.selfHash });
  });

  it('REQ-DM-024 : l’ordre des ids ne compte pas — la chaîne se suit par ses hashes', () => {
    const lignes = chaine(4);
    expect(verifierChaine([...lignes].reverse())).toEqual({
      ok: true,
      maillons: 5,
      tete: lignes[4]!.selfHash,
    });
  });

  it('REQ-DM-024 : la genèse seule est une chaîne d’un maillon', () => {
    expect(verifierChaine([{ id: '1', ...GENESE }])).toEqual({
      ok: true,
      maillons: 1,
      tete: GENESE.selfHash,
    });
  });

  it('REQ-DM-024 : une table vide est une faute — il n’y a rien à vérifier, pas « rien de faux »', () => {
    expect(verifierChaine([])).toEqual({ ok: false, faute: 'chaine_vide', id: null });
  });

  it('REQ-DM-024 : sans genèse, la faute est nommée', () => {
    expect(verifierChaine(chaine(3).slice(1))).toMatchObject({
      ok: false,
      faute: 'genese_absente',
    });
  });

  it('REQ-DM-024 : une seconde genèse est nommée par son id', () => {
    const lignes = chaine(2);
    lignes.push({ id: '9', ...GENESE, selfHash: GENESE.selfHash });
    expect(verifierChaine(lignes)).toEqual({ ok: false, faute: 'genese_multiple', id: '9' });
  });

  // Chaque colonne qui porte un sens est hachée, pas la seule charge.
  it.each([
    ['agregatId', { agregatId: '11111111-1111-4111-8111-111111111111' }],
    ['type', { type: 'journal_rouvert' }],
    ['agregat', { agregat: 'releve' }],
    ['survenuAt', { survenuAt: '2027-01-01T00:00:00.000Z' }],
    ['charge', { charge: { algorithme: 'md5' } }],
  ])(
    'REQ-DM-024 : %s réécrit sur une ligne du MILIEU → hash_altere nomme CETTE ligne',
    (_colonne, alteration) => {
      const lignes = chaine(4);
      const milieu = lignes[2]!;
      lignes[2] = { ...milieu, ...alteration };
      expect(verifierChaine(lignes)).toEqual({ ok: false, faute: 'hash_altere', id: milieu.id });
    }
  );

  it('REQ-DM-024 : la TÊTE de chaîne (dernière ligne) réécrite → hash_altere la nomme', () => {
    const lignes = chaine(4);
    const tete = lignes[4]!;
    lignes[4] = { ...tete, charge: { algorithme: 'md5' } };
    expect(verifierChaine(lignes)).toEqual({ ok: false, faute: 'hash_altere', id: tete.id });
  });

  it('REQ-DM-024 : une charge qui n’est plus canonicalisable est une altération, pas un plantage', () => {
    const lignes = chaine(3);
    lignes[1] = { ...lignes[1]!, charge: { algorithme: 1.5 } };
    expect(verifierChaine(lignes)).toEqual({ ok: false, faute: 'hash_altere', id: '2' });
  });

  it('REQ-DM-024 : une ligne du milieu supprimée → maillon_orphelin nomme la ligne SUIVANTE', () => {
    const lignes = chaine(4);
    const suivante = lignes[3]!;
    lignes.splice(2, 1);
    expect(verifierChaine(lignes)).toEqual({
      ok: false,
      faute: 'maillon_orphelin',
      id: suivante.id,
    });
  });

  it('REQ-DM-024 : deux maillons sur le même prédécesseur → bifurcation nommée', () => {
    const lignes = chaine(3);
    const e: Enregistrement = {
      type: 'journal_ouvert',
      agregat: null,
      agregatId: null,
      survenuAt: '2026-10-01T00:00:00.000Z',
      charge: { algorithme: ALGORITHME },
    };
    const prevHash = lignes[1]!.selfHash;
    lignes.push({ id: '42', ...e, prevHash, selfHash: calculerSelfHash(prevHash, e) });
    expect(verifierChaine(lignes)).toEqual({ ok: false, faute: 'bifurcation', id: '42' });
  });
});

/** Recalcule `prevHash` et `selfHash` de `depuis` jusqu'à la fin : ce que fait un faussaire. */
function recalculer(lignes: LigneJournal[], depuis: number): LigneJournal[] {
  const sortie = [...lignes];
  for (let i = depuis; i < sortie.length; i++) {
    const prevHash = i === 0 ? ZERO : sortie[i - 1]!.selfHash;
    sortie[i] = { ...sortie[i]!, prevHash, selfHash: calculerSelfHash(prevHash, sortie[i]!) };
  }
  return sortie;
}

describe('REQ-DM-024 — la genèse est épinglée, et la limite du recalcul est DITE', () => {
  it.each([
    ['survenuAt', { survenuAt: '2026-01-01T00:00:00.000Z' }],
    ['charge', { charge: { algorithme: 'sha1' } }],
    ['agregat', { agregat: 'contrat', agregatId: '22222222-2222-4222-8222-222222222222' }],
    ['type', { type: 'journal_rouvert' }],
  ])(
    'REQ-DM-024 : une genèse forgée (%s) et une chaîne recalculée sur elle → genese_alteree',
    (_colonne, alteration) => {
      const lignes = chaine(3);
      lignes[0] = { ...lignes[0]!, ...alteration };
      expect(verifierChaine(recalculer(lignes, 0))).toEqual({
        ok: false,
        faute: 'genese_alteree',
        id: '1',
      });
    }
  );

  it('REQ-DM-024 : une genèse dont le contenu change mais qui garde le selfHash de GENESE → genese_alteree', () => {
    const lignes = chaine(3);
    lignes[0] = { ...lignes[0]!, survenuAt: '2026-01-01T00:00:00.000Z' };
    expect(verifierChaine(lignes)).toEqual({ ok: false, faute: 'genese_alteree', id: '1' });
  });

  // ⚠️ LIMITE DÉCLARÉE (partners/ADR-0014), et ce test la TIENT : le jour où un ancrage externe de
  // la tête existera, il devra rougir et être réécrit. Un acteur qui a les droits du propriétaire,
  // désarme le déclencheur, réécrit une ligne du MILIEU et recalcule TOUTE la queue n'est PAS
  // détecté par la chaîne seule : l'algorithme est public et sans secret.
  it('REQ-DM-024 : LIMITE — une ligne du milieu réécrite PUIS la queue recalculée passe inaperçue sans ancrage externe', () => {
    const lignes = chaine(4);
    lignes[2] = { ...lignes[2]!, agregatId: '33333333-3333-4333-8333-333333333333' };
    const forgee = recalculer(lignes, 2);
    expect(verifierChaine(forgee)).toMatchObject({ ok: true, maillons: 5 });
    expect((verifierChaine(forgee) as { tete: string }).tete).not.toBe(chaine(4)[4]!.selfHash);
  });
});
