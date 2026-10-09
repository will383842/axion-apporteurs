// @req REQ-DM-014
// @req REQ-INT-017
/**
 * INT-T47-P, en mémoire — la grille en schema 2, lue par le domaine (contrat arrêté par A02 le
 * 2026-10-02, `packages/contracts/grille.ts`). Placé sous `tests/unit/domaine/` : la couverture du
 * domaine et la mutation le comptent. La même chose en base réelle :
 * `tests/integration/grille-schema-2.spec.ts`.
 *
 * LA PUBLICATION EN SCHEMA 2 est DÉRIVÉE de la fixture du producteur (v1, pseudonymisée par lui) :
 * deux champs neutres par palier, empreintes recalculées par la règle de l'export. Rien n'est tapé.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORRESPONDANCE_DES_TYPES,
  ChampsDuSchema2Absents,
  PublicationIllisible,
  champsDuSchema2,
  commissionPubliee,
  empreinteGrille,
  lirePublication,
  typeDeLigne,
  verifierPublication,
} from '../../../src/domain/commission/grille';
import { SCHEMAS_LISIBLES, SCHEMA_GRILLE } from '../../../packages/contracts/grille';

const FIXTURE = join(
  __dirname,
  '..',
  '..',
  'fixtures',
  'axionia',
  'commissions.v1.pseudonymise.json'
);
type Brute = {
  version: number;
  hash: string;
  empreintesLignes: { paliers: Record<string, string> };
  contenu: Record<string, unknown> & { schema: unknown; paliers: Record<string, unknown>[] };
};
const v1 = (): Brute =>
  structuredClone(
    (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { publication: Brute }).publication
  );

function enSchema2(): Brute {
  const p = v1();
  p.contenu.schema = 2;
  p.contenu.paliers = p.contenu.paliers.map((l, i) => ({
    ...l,
    cpfEligible: i % 2 === 0,
    prixReferenceHtCents: i === 0 ? null : i,
  }));
  p.empreintesLignes.paliers = Object.fromEntries(
    p.contenu.paliers.map((l) => [String(l['tierId']), empreinteGrille(l)])
  );
  p.hash = empreinteGrille(p.contenu);
  return p;
}

describe('REQ-INT-017 — le domaine lit le schema 1 et le schema 2, et rien d’autre', () => {
  it('REQ-INT-017 : le producteur publie 2, Partners lit 1 et 2', () => {
    expect(SCHEMA_GRILLE).toBe(2);
    expect([...SCHEMAS_LISIBLES]).toEqual([1, 2]);
  });

  it('REQ-INT-017 : une publication en schema 2 se lit, et ses empreintes se confrontent sans faute', () => {
    const pub = lirePublication(enSchema2());
    expect(pub.contenu.schema).toBe(2);
    const v = verifierPublication(pub);
    expect(v.fautes).toEqual([]);
    expect(v.lignesConfrontees).toBeGreaterThan(0);
  });

  it('REQ-DM-014 : une publication en schema 1 se lit toujours', () => {
    expect(lirePublication(v1()).contenu.schema).toBe(1);
  });

  it.each([3, 0, '2', null])(
    'REQ-INT-017 : TÉMOIN — un schema %j est refusé, nommé, avant tout parse',
    (schema) => {
      const p = enSchema2();
      p.contenu.schema = schema;
      expect(() => lirePublication(p)).toThrow(PublicationIllisible);
      expect(() => lirePublication(p)).toThrow(`contenu.schema : schema ${String(schema)} inconnu`);
    }
  );

  it('REQ-INT-017 : TÉMOIN — un palier de schema 2 sans cpfEligible, avec un cpfEligible nul ou un prix à virgule est refusé, nommé', () => {
    const sans = enSchema2();
    delete sans.contenu.paliers[0]!['cpfEligible'];
    expect(() => lirePublication(sans)).toThrow(/contenu\.paliers\.0\.cpfEligible/);
    const nul = enSchema2();
    nul.contenu.paliers[0]!['cpfEligible'] = null;
    expect(() => lirePublication(nul)).toThrow(/contenu\.paliers\.0\.cpfEligible/);
    const virgule = enSchema2();
    virgule.contenu.paliers[1]!['prixReferenceHtCents'] = 10.5;
    expect(() => lirePublication(virgule)).toThrow(/contenu\.paliers\.1\.prixReferenceHtCents/);
    const negatif = enSchema2();
    negatif.contenu.paliers[1]!['prixReferenceHtCents'] = -1;
    expect(() => lirePublication(negatif)).toThrow(/contenu\.paliers\.1\.prixReferenceHtCents/);
  });

  it('REQ-INT-017 : TÉMOIN — un champ de schema 2 dans une publication de schema 1 est refusé : les objets sont fermés', () => {
    const p = v1();
    p.contenu.paliers[0]!['cpfEligible'] = true;
    expect(() => lirePublication(p)).toThrow(/contenu\.paliers\.0/);
  });
});

describe('REQ-DM-014 — la correspondance des types de commission, en UN endroit', () => {
  it('REQ-DM-014 : flat → forfait, percent → pourcentage, scale → aucune', () => {
    expect(CORRESPONDANCE_DES_TYPES).toEqual({
      flat: 'forfait',
      percent: 'pourcentage',
      scale: 'aucune',
    });
    expect(['flat', 'percent', 'scale'].map(typeDeLigne)).toEqual([
      'forfait',
      'pourcentage',
      'aucune',
    ]);
  });

  it('REQ-DM-014 : TÉMOIN À DEUX FACES — un genre hors des trois LÈVE en le nommant', () => {
    expect(() => typeDeLigne('palier')).toThrow(
      'genre de commission inconnu : « palier » — ni flat, ni percent, ni scale'
    );
    expect(() => typeDeLigne('')).toThrow(/genre de commission inconnu/);
  });

  it('REQ-DM-014 : la commission publiée est DÉRIVÉE de la ligne — forfait et son montant, pourcentage et son taux, barème non publié sans aucun montant', () => {
    const pub = lirePublication(v1());
    const parGenre = (k: string) => pub.contenu.commissions.find((c) => c.kind === k)!;
    const forfait = parGenre('flat');
    const pourcentage = parGenre('percent');
    expect(commissionPubliee(forfait)).toEqual({
      type: 'forfait',
      montantCents: forfait.montantCents,
    });
    expect(commissionPubliee(pourcentage)).toEqual({
      type: 'pourcentage',
      tauxBps: pourcentage.tauxBps,
    });
    expect(
      commissionPubliee({ ...forfait, kind: 'scale', montantCents: null, tauxBps: null })
    ).toEqual({ type: 'aucune' });
  });
});

describe('REQ-INT-017 — ce que l’annexe lit, et son refus en schema 1', () => {
  it('REQ-INT-017 : en schema 2, chaque palier rend son éligibilité et son prix, tels que publiés', () => {
    const brute = enSchema2();
    const champs = champsDuSchema2(lirePublication(brute));
    expect(champs).toEqual(
      brute.contenu.paliers.map((p) => ({
        tierId: p['tierId'],
        cpfEligible: p['cpfEligible'],
        prixReferenceHtCents: p['prixReferenceHtCents'],
      }))
    );
  });

  it('REQ-INT-017 : TÉMOIN — en schema 1, l’annexe REFUSE, jamais false ni un prix nul par défaut', () => {
    const pub = lirePublication(v1());
    expect(() => champsDuSchema2(pub)).toThrow(ChampsDuSchema2Absents);
    expect(() => champsDuSchema2(pub)).toThrow(
      `publication en schema 1, champs du schema 2 absents (v${pub.version})`
    );
  });
});
