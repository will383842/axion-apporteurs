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
  decisionDImport,
  empreinteGrille,
  lirePublication,
  PublicationIllisible,
  verifierPublication,
  type PublicationGrille,
  type VersionImportee,
} from '../../../src/domain/commission/grille';
import {
  CLE_VERROU_IMPORT,
  ImportGrilleRefuse,
  importerGrille,
} from '../../../src/server/grille/import';

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

describe('REQ-ARG-031 → REQ-DM-014, REQ-INT-017 — la publication du producteur est confrontée ligne à ligne', () => {
  it('REQ-ARG-031 → REQ-DM-014, REQ-INT-017 : la publication du producteur : aucune faute, sur un périmètre NON vide', () => {
    const pub = lue();
    const verdict = verifierPublication(pub);
    expect(verdict.fautes).toEqual([]);
    expect(verdict.lignesConfrontees).toBe(
      pub.contenu.commissions.length + pub.contenu.paliers.length
    );
    expect(pub.contenu.commissions.length).toBeGreaterThan(0);
    expect(pub.contenu.paliers.length).toBeGreaterThan(0);
  });

  it('REQ-ARG-031 → REQ-DM-014, REQ-INT-017 — TÉMOIN : un centime changé sans toucher les empreintes : la ligne de barème est NOMMÉE', () => {
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
    expect(fautes[1]!.message).toMatch(
      /^v1 : empreinte annoncée [0-9a-f]{64} ≠ recalculée [0-9a-f]{64}$/
    );
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
    // Typage seul (INT-T47-P) : la fixture du producteur est en schema 1, et le dire restreint
    // l'union des contenus pour que les paliers se reconstruisent sous leur forme exacte.
    if (pub.contenu.schema !== 1) throw new Error('la fixture du producteur est en schema 1');
    const [premiere] = pub.contenu.commissions;
    const annoncees = { ...pub.empreintesLignes.commissions };
    delete annoncees[premiere!.commissionId];
    annoncees['commission-fantome'] = premiere ? empreinteGrille(premiere) : '';
    const trafiquee: PublicationGrille = {
      ...pub,
      empreintesLignes: { ...pub.empreintesLignes, commissions: annoncees },
      contenu: { ...pub.contenu, paliers: [...pub.contenu.paliers, pub.contenu.paliers[0]!] },
    };
    const fautes = verifierPublication(trafiquee).fautes;
    const familles = fautes.map((f) => `${f.famille} ${f.ligne}`);
    const messages = fautes.map((f) => f.message).join('\n');
    expect(messages).toContain(
      `commission:${premiere!.commissionId} n'a aucune empreinte annoncée`
    );
    expect(messages).toContain(
      'commission:commission-fantome a une empreinte annoncée mais aucune ligne'
    );
    expect(messages).toContain(`palier:${pub.contenu.paliers[0]!.tierId} figure deux fois`);
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

describe('REQ-ARG-031 → REQ-DM-014 — la forme est fermée : rien n’est complété, tout défaut est nommé', () => {
  /** Une publication brute dont on force un champ hors contrat : le type ne l’admettrait pas. */
  type Brute = PublicationGrille & Record<string, unknown>;
  const refusee = (muter: (p: Brute) => void): string => {
    const brut = publiee() as Brute;
    muter(brut);
    try {
      lirePublication(brut);
    } catch (e) {
      expect(e).toBeInstanceOf(PublicationIllisible);
      expect((e as Error).name).toBe('PublicationIllisible');
      expect((e as Error).message).toMatch(/^publication de grille illisible : /);
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
  it('un forfait qui porte AUSSI un taux est refusé : une ligne ne cumule jamais deux barèmes', () => {
    expect(refusee((p) => (forfait(p).tauxBps = pourcentage(p).tauxBps))).toMatch(
      /contenu\.commissions\.\d+\.tauxBps : commission « [^»]+ » \(flat\) : tauxBps interdit/
    );
  });
  it('un palier « taux » qui porte un barème indéfini est refusé', () => {
    expect(
      refusee((p) => {
        const palier = p.contenu.paliers.find((x) => x.statut === 'taux')!;
        (palier as Record<string, unknown>).baremeIndefini = { depuis: null, motif: 'non_declare' };
      })
    ).toMatch(/baremeIndefini : un palier « taux » ne porte aucun barème indéfini/);
  });
  it('une publication qui n’est pas un objet est refusée, et le défaut est situé à la racine', () => {
    expect(() => lirePublication(null)).toThrow(/\(racine\) :/);
  });
  it('un taux au-delà de 100 % est refusé', () => {
    expect(refusee((p) => (pourcentage(p).tauxBps = BPS_MAX + 1))).toMatch(/tauxBps/);
  });
  it('une empreinte qui n’est pas un SHA-256 hexadécimal est refusée', () => {
    expect(refusee((p) => (p.hash = 'abc'))).toMatch(/^.*hash/);
  });
});

describe('REQ-ARG-031 → REQ-DM-014 — une version importée ne se réécrit jamais', () => {
  const pub = { version: 3, hash: 'a'.repeat(64) };

  it('REQ-ARG-031 → REQ-DM-014 : rien en base → à écrire ; même version, même empreinte → déjà importée', () => {
    expect(decisionDImport(pub, [])).toEqual({ statut: 'a_ecrire' });
    expect(decisionDImport(pub, [{ version: 2, hash: 'b'.repeat(64) }])).toEqual({
      statut: 'a_ecrire',
    });
    expect(decisionDImport(pub, [{ ...pub }])).toEqual({ statut: 'deja_importee' });
  });

  it('REQ-ARG-031 → REQ-DM-014 — TÉMOIN : un numéro ou une empreinte déjà pris ailleurs se contredisent, nommément', () => {
    expect(decisionDImport(pub, [{ version: 3, hash: 'c'.repeat(64) }])).toEqual({
      statut: 'contradictoire',
      messages: [
        `v3 est déjà importée sous l'empreinte ${'c'.repeat(64)} : une version importée n'est jamais réécrite`,
      ],
    });
    expect(decisionDImport(pub, [{ version: 1, hash: pub.hash }])).toEqual({
      statut: 'contradictoire',
      messages: [`l'empreinte ${pub.hash} est déjà importée comme v1, pas v3`],
    });
  });
});

describe('REQ-ARG-031 → REQ-DM-014 — l’import : confronter, verrouiller, décider, écrire', () => {
  /** Un client simulé qui ENREGISTRE ce qu'on lui fait, et rend les versions qu'on lui donne. */
  function client(existantes: VersionImportee[]) {
    const journal: { verrou: unknown[]; lecture: unknown; ecrit: unknown[] } = {
      verrou: [],
      lecture: null,
      ecrit: [],
    };
    const tx = {
      $executeRaw: (morceaux: TemplateStringsArray, ...valeurs: unknown[]) => {
        journal.verrou.push(morceaux.join('?'), ...valeurs);
        return Promise.resolve(1);
      },
      grilleCommission: {
        findMany: (args: unknown) => {
          journal.lecture = args;
          return Promise.resolve(existantes);
        },
        create: (args: { data: unknown }) => {
          journal.ecrit.push(args.data);
          return Promise.resolve(args.data);
        },
      },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    return { prisma: prisma as unknown as Parameters<typeof importerGrille>[0], journal };
  }
  const A = new Date('2026-09-29T08:00:00.000Z');

  it('REQ-ARG-031 → REQ-DM-014 : la publication du producteur est écrite TELLE QUELLE, sous verrou', async () => {
    const brut = publiee();
    const pub = lirePublication(brut);
    const { prisma, journal } = client([]);
    expect(await importerGrille(prisma, brut, A)).toEqual({
      statut: 'importee',
      version: pub.version,
      hash: pub.hash,
      lignesConfrontees: pub.contenu.commissions.length + pub.contenu.paliers.length,
    });
    expect(journal.verrou).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext(?))',
      CLE_VERROU_IMPORT,
    ]);
    expect(CLE_VERROU_IMPORT).toBe('grilles_commission');
    expect(journal.lecture).toEqual({
      where: { OR: [{ version: pub.version }, { hash: pub.hash }] },
      select: { version: true, hash: true },
    });
    expect(journal.ecrit).toEqual([
      {
        version: pub.version,
        hash: pub.hash,
        contenuJson: pub.contenu,
        publieeAt: new Date(pub.publieeAt),
        importeeAt: A,
      },
    ]);
  });

  it('REQ-ARG-031 → REQ-DM-014 — TÉMOIN : déjà importée → rien d’écrit ; contradictoire → refus nommé, rien d’écrit', async () => {
    const brut = publiee();
    const pub = lirePublication(brut);
    const deja = client([{ version: pub.version, hash: pub.hash }]);
    expect(await importerGrille(deja.prisma, brut, A)).toMatchObject({ statut: 'deja_importee' });
    expect(deja.journal.ecrit).toEqual([]);

    const autre = client([{ version: pub.version, hash: 'd'.repeat(64) }]);
    const refus = await importerGrille(autre.prisma, brut, A).catch((e: unknown) => e);
    expect(refus).toBeInstanceOf(ImportGrilleRefuse);
    expect((refus as Error).name).toBe('ImportGrilleRefuse');
    expect((refus as Error).message).toBe(
      `import de grille refusé : v${pub.version} est déjà importée sous l'empreinte ${'d'.repeat(64)} : une version importée n'est jamais réécrite`
    );
    expect((refus as ImportGrilleRefuse).fautes).toEqual([
      { ligne: null, message: expect.stringContaining(`v${pub.version} est déjà importée`) },
    ]);
    expect(autre.journal.ecrit).toEqual([]);
  });

  it('REQ-ARG-031 → REQ-DM-014 — TÉMOIN : une ligne altérée est refusée AVANT toute transaction', async () => {
    const brut = publiee() as PublicationGrille;
    const forfait = brut.contenu.commissions.find((c) => c.montantCents !== null)!;
    forfait.montantCents! += 1;
    const { prisma, journal } = client([]);
    const refus = await importerGrille(prisma, brut, A).catch((e: unknown) => e);
    expect((refus as ImportGrilleRefuse).fautes.map((f) => f.ligne)).toEqual([
      `commission:${forfait.commissionId}`,
      null,
    ]);
    expect(journal).toEqual({ verrou: [], lecture: null, ecrit: [] });
  });
});
