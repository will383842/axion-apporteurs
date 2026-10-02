// @req REQ-DM-014
// @req REQ-INT-017
/**
 * INT-T47-P, en base RÉELLE — Partners lit la grille publiée en `schema: 2`, sans rien retaper
 * (décision de Williams du 2026-10-01, HYP-GRILLE-SCHEMA-2).
 *
 * CE QU'IL PROUVE :
 *   1. une publication en schema 2 — chaque palier portant `cpfEligible` et `prixReferenceHtCents` —
 *      s'importe, ses empreintes recontrôlées, et la base rend ces champs tels que publiés ;
 *   2. une publication en schema 1 s'importe toujours : une version importée est immuable, et les
 *      versions déjà en base restent lisibles ;
 *   3. un schema INCONNU est refusé, nommé, et rien n'est écrit — échec fermé ;
 *   4. la correspondance des types de commission d'axion-ia vers ceux de Partners est écrite en UN
 *      endroit : flat → forfait, percent → pourcentage, scale → aucune.
 *
 * LA PUBLICATION EN SCHEMA 2 est DÉRIVÉE de la fixture du producteur (v1, pseudonymisée par lui) :
 * les trois champs ajoutés portent des valeurs NEUTRES (`false`, `null`), et les empreintes sont
 * recalculées par la même règle que l'export d'axion-ia. Aucune valeur de grille n'est tapée ici.
 * Le producteur publiera sa propre fixture en schema 2 (INT-T47-A), en lockstep.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerBase, type Base } from './harnais';
import {
  CORRESPONDANCE_DES_TYPES,
  PublicationIllisible,
  empreinteGrille,
  lirePublication,
  typeDeLigne,
} from '../../src/domain/commission/grille';
import { importerGrille } from '../../src/server/grille/import';

let base: Base;
beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);
afterAll(async () => {
  await base?.arreter();
});

const FIXTURE = join(__dirname, '..', 'fixtures', 'axionia', 'commissions.v1.pseudonymise.json');
type Brute = {
  version: number;
  hash: string;
  empreintesLignes: { paliers: Record<string, string> };
  contenu: Record<string, unknown> & { schema: number; paliers: Record<string, unknown>[] };
};
const v1 = (): Brute =>
  structuredClone(
    (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { publication: Brute }).publication
  );

/** La même publication en schema 2 : trois champs neutres par palier, empreintes recalculées. */
function enSchema2(version: number): Brute {
  const p = v1();
  p.version = version;
  p.contenu.schema = 2;
  p.contenu.paliers = p.contenu.paliers.map((l) => ({
    ...l,
    cpfEligible: false,
    prixReferenceHtCents: null,
  }));
  p.empreintesLignes.paliers = Object.fromEntries(
    p.contenu.paliers.map((l) => [String(l['tierId']), empreinteGrille(l)])
  );
  p.hash = empreinteGrille(p.contenu);
  return p;
}

const IMPORTEE_AT = new Date('2026-10-02T09:00:00.000Z');

describe('REQ-INT-017 — la grille en schema 2 s’importe, et le schema 1 reste lisible', () => {
  it('REQ-INT-017 : une publication en schema 2 s’importe, empreintes recontrôlées, et la base rend les champs du palier tels que publiés', async () => {
    const pub = enSchema2(900);
    const r = await importerGrille(base.prisma, pub, IMPORTEE_AT);
    expect(r).toMatchObject({ statut: 'importee', version: 900, hash: pub.hash });
    const lue = await base.prisma.grilleCommission.findUniqueOrThrow({ where: { version: 900 } });
    const contenu = lue.contenuJson as { schema: number; paliers: Record<string, unknown>[] };
    expect(contenu.schema).toBe(2);
    expect(contenu.paliers.length).toBeGreaterThan(0);
    for (const p of contenu.paliers) {
      expect(p).toMatchObject({ cpfEligible: false, prixReferenceHtCents: null });
    }
    expect(empreinteGrille(lue.contenuJson)).toBe(pub.hash);
  });

  it('REQ-DM-014 : une publication en schema 1 s’importe toujours — les versions déjà en base restent lisibles', async () => {
    const r = await importerGrille(base.prisma, v1(), IMPORTEE_AT);
    expect(r.statut).toBe('importee');
  });

  it('REQ-INT-017 : TÉMOIN — un schema INCONNU est refusé, nommé, et rien n’est écrit', async () => {
    const pub = enSchema2(901);
    pub.contenu.schema = 3;
    pub.hash = empreinteGrille(pub.contenu);
    const avant = await base.prisma.grilleCommission.count();
    await expect(importerGrille(base.prisma, pub, IMPORTEE_AT)).rejects.toThrow(
      /contenu\.schema : schema 3 inconnu/
    );
    expect(() => lirePublication(pub)).toThrow(PublicationIllisible);
    expect(await base.prisma.grilleCommission.count()).toBe(avant);
  });

  it('REQ-INT-017 : TÉMOIN — un palier de schema 2 sans ses champs, ou avec un prix non entier, est refusé, nommé', () => {
    const sans = enSchema2(902);
    delete sans.contenu.paliers[0]!['cpfEligible'];
    expect(() => lirePublication(sans)).toThrow(/contenu\.paliers\.0\.cpfEligible/);
    const virgule = enSchema2(903);
    virgule.contenu.paliers[0]!['prixReferenceHtCents'] = 10.5;
    expect(() => lirePublication(virgule)).toThrow(/contenu\.paliers\.0\.prixReferenceHtCents/);
  });
});

describe('REQ-DM-014 — la correspondance des types de commission est écrite en UN endroit', () => {
  it('REQ-DM-014 : flat → forfait, percent → pourcentage, scale → aucune — un barème non publié n’est jamais un montant', () => {
    expect(CORRESPONDANCE_DES_TYPES).toEqual({
      flat: 'forfait',
      percent: 'pourcentage',
      scale: 'aucune',
    });
    expect(typeDeLigne('flat')).toBe('forfait');
    expect(typeDeLigne('percent')).toBe('pourcentage');
    expect(typeDeLigne('scale')).toBe('aucune');
  });
});
