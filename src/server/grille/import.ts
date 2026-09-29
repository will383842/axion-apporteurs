/**
 * L'import d'une grille de commission publiée par axionia — DM-03-P (REQ-DM-014, REQ-ARG-031,
 * REQ-INT-017).
 *
 * CE QUI EST STOCKÉ EST CE QUI A ÉTÉ PUBLIÉ. `contenuJson` est le contenu reçu, `hash` l'empreinte
 * qu'axionia a calculée — jamais une valeur recalculée ou complétée ici (RM-01). Mais rien n'entre
 * sans avoir été CONFRONTÉ : la forme fermée (`lirePublication`), puis chaque ligne et le contenu à
 * leurs empreintes (`verifierPublication`). Une seule faute, et rien n'est écrit.
 *
 * UNE VERSION IMPORTÉE N'EST JAMAIS RÉÉCRITE (acceptation 4). La base le garantit par ses
 * déclencheurs (`grilles_commission_immuable`, `grilles_commission_troncature`) ; la décision pure
 * `decisionDImport` le dit AVANT d'y buter. Ce module ne fait que l'entrée-sortie.
 *
 * CONCURRENCE. Deux imports simultanés se suivent : verrou consultatif de transaction, PUIS lecture.
 * Les contraintes `UNIQUE (version)` et `UNIQUE (hash)` sont le filet, pas le mécanisme.
 *
 * `publieeAt` vient de la publication ; `importeeAt` est l'instant fourni par l'appelant, jamais
 * l'horloge de ce module.
 */
import type { PrismaClient } from '@prisma/client';
import {
  decisionDImport,
  lirePublication,
  verifierPublication,
  type FauteGrille,
} from '../../domain/commission/grille';

/** La clé du verrou consultatif de l'import : une seule table, donc une seule clé. */
export const CLE_VERROU_IMPORT = 'grilles_commission';

export type ResultatImport = {
  readonly statut: 'importee' | 'deja_importee';
  readonly version: number;
  readonly hash: string;
  readonly lignesConfrontees: number;
};

/** Levée quand une publication est refusée : chaque faute nomme sa ligne. Rien n'a été écrit. */
export class ImportGrilleRefuse extends Error {
  constructor(readonly fautes: readonly Pick<FauteGrille, 'ligne' | 'message'>[]) {
    super(`import de grille refusé : ${fautes.map((f) => f.message).join(' ; ')}`);
    this.name = 'ImportGrilleRefuse';
  }
}

export async function importerGrille(
  prisma: Pick<PrismaClient, '$transaction'>,
  brut: unknown,
  importeeAt: Date
): Promise<ResultatImport> {
  const pub = lirePublication(brut);
  const { lignesConfrontees, fautes } = verifierPublication(pub);
  if (fautes.length > 0) throw new ImportGrilleRefuse(fautes);
  const resultat = (statut: ResultatImport['statut']): ResultatImport => ({
    statut,
    version: pub.version,
    hash: pub.hash,
    lignesConfrontees,
  });

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CLE_VERROU_IMPORT}))`;
    const existantes = await tx.grilleCommission.findMany({
      where: { OR: [{ version: pub.version }, { hash: pub.hash }] },
      select: { version: true, hash: true },
    });
    const decision = decisionDImport(pub, existantes);
    if (decision.statut === 'deja_importee') return resultat('deja_importee');
    if (decision.statut === 'contradictoire') {
      throw new ImportGrilleRefuse(decision.messages.map((message) => ({ ligne: null, message })));
    }
    await tx.grilleCommission.create({
      data: {
        version: pub.version,
        hash: pub.hash,
        contenuJson: pub.contenu,
        publieeAt: new Date(pub.publieeAt),
        importeeAt,
      },
    });
    return resultat('importee');
  });
}
