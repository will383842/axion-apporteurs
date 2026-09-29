// @req REQ-ARG-031 → REQ-DM-014
// @req REQ-INT-017
/**
 * La grille publiée par axionia, confrontée par Partners avant tout import — DM-03-P.
 *
 * LA FIXTURE est émise par le PRODUCTEUR RÉEL (axion-ia, `scripts/gates/grille-check.ts
 * --fixture-pseudonymisee`) : structure, identifiants, statuts et empreintes réels, montants et taux
 * remplacés par leur rang. Aucune valeur de la grille n'entre dans ce dépôt public (PRESEANCE §3.4),
 * et aucune n'est tapée ici (RM-03) : les témoins ALTÈRENT la fixture, ils ne l'inventent pas.
 *
 * TÉMOIN À DEUX FACES (acceptation 5) : un centime changé sans toucher aux empreintes annoncées sort
 * en faute et NOMME la ligne ; la publication du producteur sort sans faute, avec le compte des lignes
 * de barème réellement confrontées.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BPS_MAX,
  empreinteGrille,
  lirePublication,
  PublicationIllisible,
  verifierPublication,
  type PublicationGrille,
} from '../../../src/domain/commission/grille';

const FIXTURE = join(
  __dirname,
  '..',
  '..',
  'fixtures',
  'axionia',
  'commissions.v1.pseudonymise.json'
);

/** Le fichier tel que le producteur l'a émis, sans son en-tête `Source`. */
function publiee(): Record<string, unknown> {
  const { Source, publication } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
    Source: string;
    publication: Record<string, unknown>;
  };
  expect(Source).toMatch(/grille-check\.ts --fixture-pseudonymisee/);
  return structuredClone(publication);
}

const lue = (): PublicationGrille => lirePublication(publiee());

describe('REQ-ARG-031, REQ-INT-017 — la publication du producteur est confrontée ligne à ligne', () => {
  it('REQ-ARG-031, REQ-INT-017 : la publication du producteur : aucune faute, sur un périmètre NON vide', () => {
    const pub = lue();
    const verdict = verifierPublication(pub);
    expect(verdict.fautes).toEqual([]);
    expect(verdict.lignesConfrontees).toBe(
      pub.contenu.commissions.length + pub.contenu.paliers.length
    );
    expect(pub.contenu.commissions.length).toBeGreaterThan(0);
    expect(pub.contenu.paliers.length).toBeGreaterThan(0);
  });

  it('REQ-ARG-031, REQ-INT-017 — TÉMOIN : un centime changé sans toucher les empreintes : la ligne de barème est NOMMÉE', () => {
    const pub = lue();
    const cible = pub.contenu.commissions.find((c) => c.montantCents !== null);
    expect(cible, 'la fixture doit porter un forfait').toBeDefined();
    cible!.montantCents! += 1;
    const { fautes } = verifierPublication(pub);
    expect(fautes.map((f) => [f.famille, f.ligne])).toEqual([
      ['ligne_divergente', `commission:${cible!.commissionId}`],
      ['empreinte_du_contenu', null],
    ]);
    expect(fautes[0]!.message).toMatch(/empreinte annoncée [0-9a-f]{64} ≠ recalculée [0-9a-f]{64}/);
  });

  it('TÉMOIN — un palier qui change de barème : le palier est nommé', () => {
    const pub = lue();
    const cible = pub.contenu.paliers.find((p) => p.statut === 'taux' && p.commissionId !== null);
    const autre = pub.contenu.commissions.find((c) => c.commissionId !== cible!.commissionId);
    cible!.commissionId = autre!.commissionId;
    expect(verifierPublication(pub).fautes.map((f) => f.ligne)).toEqual([
      `palier:${cible!.tierId}`,
      null,
    ]);
  });

  it('TÉMOIN — une ligne sans empreinte, une empreinte sans ligne, une ligne en double', () => {
    const pub = lue();
    const [premiere] = pub.contenu.commissions;
    const annoncees = { ...pub.empreintesLignes.commissions };
    delete annoncees[premiere!.commissionId];
    annoncees['commission-fantome'] = premiere ? empreinteGrille(premiere) : '';
    const trafiquee: PublicationGrille = {
      ...pub,
      empreintesLignes: { ...pub.empreintesLignes, commissions: annoncees },
      contenu: { ...pub.contenu, paliers: [...pub.contenu.paliers, pub.contenu.paliers[0]!] },
    };
    const familles = verifierPublication(trafiquee).fautes.map((f) => `${f.famille} ${f.ligne}`);
    expect(familles).toContain(`ligne_sans_empreinte commission:${premiere!.commissionId}`);
    expect(familles).toContain('empreinte_sans_ligne commission:commission-fantome');
    expect(familles).toContain(`ligne_en_double palier:${pub.contenu.paliers[0]!.tierId}`);
  });

  it("l'empreinte ne dépend pas de l'ordre des clés : une relecture jsonb ne change rien", () => {
    const pub = lue();
    const renverse = JSON.parse(
      JSON.stringify(pub, (_k, v: unknown) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse())
          : v
      )
    ) as PublicationGrille;
    expect(empreinteGrille(renverse.contenu)).toBe(pub.hash);
    expect(verifierPublication(lirePublication(renverse)).fautes).toEqual([]);
  });
});

describe('REQ-ARG-031 — la forme est fermée : rien n’est complété, tout défaut est nommé', () => {
  /** Une publication brute dont on force un champ hors contrat : le type ne l’admettrait pas. */
  type Brute = PublicationGrille & Record<string, unknown>;
  const refusee = (muter: (p: Brute) => void): string => {
    const brut = publiee() as Brute;
    muter(brut);
    try {
      lirePublication(brut);
    } catch (e) {
      expect(e).toBeInstanceOf(PublicationIllisible);
      return (e as Error).message;
    }
    throw new Error('la publication altérée a été acceptée');
  };
  const forfait = (p: Brute) => p.contenu.commissions.find((c) => c.kind === 'flat')!;
  const pourcentage = (p: Brute) => p.contenu.commissions.find((c) => c.kind === 'percent')!;

  it('un champ inconnu est refusé', () => {
    expect(
      refusee((p) => ((p.contenu.commissions[0] as Record<string, unknown>).bonus = 1))
    ).toMatch(/contenu\.commissions\.0/);
  });
  it('un montant à virgule est refusé, jamais arrondi', () => {
    expect(refusee((p) => (forfait(p).montantCents = 2.5))).toMatch(/montantCents/);
  });
  it('un forfait sans montant est refusé', () => {
    expect(refusee((p) => (forfait(p).montantCents = null))).toMatch(/montantCents requis/);
  });
  it('un taux au-delà de 100 % est refusé', () => {
    expect(refusee((p) => (pourcentage(p).tauxBps = BPS_MAX + 1))).toMatch(/tauxBps/);
  });
  it('une empreinte qui n’est pas un SHA-256 hexadécimal est refusée', () => {
    expect(refusee((p) => (p.hash = 'abc'))).toMatch(/^.*hash/);
  });
});
