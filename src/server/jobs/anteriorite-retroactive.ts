/**
 * L'antériorité établie APRÈS l'enregistrement (DM-25, REQ-JUR-007) — le job quotidien.
 *
 * Chaque attribution OCCUPANTE d'une entreprise connue de la Société (origine client ou devis, la
 * liste n'étant pas un critère) est jugée AU DÉPÔT, sur les faits d'axionia DATÉS AVANT lui : une
 * facture, un avoir, une annulation, une émission ou une signature postérieures sont ignorés — un
 * avoir postérieur ne rend pas « non facturé » un devis qui l'était au dépôt. La règle est celle du
 * domaine (`doitEtreAnnulee`), sur la règle de l'antériorité ; ce job ne fait que dater les faits.
 *
 * Un critère rempli au dépôt annule l'attribution par `anteriorite_etablie`, avec son critère, par
 * l'écrivain des transitions (DM-67), dans sa propre transaction. Une attribution annulée n'occupe
 * plus : un second passage ne la relit pas. L'état changé entre-temps (`transition_refusee`) est
 * compté et passé ; toute autre levée fait échouer le passage.
 *
 * Les dates sont celles des charges (`emiseLe`, `emisLe`, `signeLe`) ; l'annulation d'une facture,
 * qui n'en porte pas, se date par le fait (`survenuAt`). La lecture datée est tenue ICI : la
 * projection, qui recalcule l'état présent, n'est pas touchée.
 */
import { TypeEvenementRecu, type PrismaClient } from '@prisma/client';
import { ETATS_OCCUPANTS } from '../../domain/attribution/etats';
import {
  estPrestationFacturee,
  factureHtDuDevis,
  type DevisConnu,
} from '../../domain/entreprise-connue/anteriorite';
import {
  fondementAuDepot,
  type FaitsIdentifiesDeLEntreprise,
} from '../../domain/entreprise-connue/anteriorite-retroactive';
import { refDuFaitFondateur, transitionnerUneAttribution } from '../attribution/transitionner';
import { occupe } from '../../domain/attribution/etats';

type Charge = Record<string, unknown>;
export type FaitRecu = { eventType: TypeEvenementRecu; charge: unknown; survenuAt: Date };

/** Les attributions occupantes sont relues par lots bornés, en avançant sur l'identifiant. */
export const LOT_DU_RAPPROCHEMENT = 200;

const FORME_SIREN = /^[0-9]{9}$/;
const enCharge = (v: unknown): Charge =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Charge) : {};
const texte = (c: Charge, champ: string): string | null => {
  const v = c[champ];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
};
const entier = (c: Charge, champ: string): number => {
  const v = c[champ];
  return typeof v === 'number' && Number.isInteger(v) ? v : 0;
};
const date = (c: Charge, champ: string): Date | null => {
  const v = texte(c, champ);
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Les faits d'une entreprise, tels qu'ils étaient AU DÉPÔT : seuls ceux datés avant lui comptent. */
export function faitsDatesAuDepot(
  recus: readonly FaitRecu[],
  deposeeAt: Date
): FaitsIdentifiesDeLEntreprise {
  const t = deposeeAt.getTime();
  const avantLeDepot = (d: Date | null): d is Date => d !== null && d.getTime() < t;
  const lus = [...recus]
    .sort((a, b) => a.survenuAt.getTime() - b.survenuAt.getTime())
    .map((r) => ({ type: r.eventType, c: enCharge(r.charge), survenuAt: r.survenuAt }));
  const deType = (type: TypeEvenementRecu) => lus.filter((l) => l.type === type);

  const annulees = new Set(
    deType(TypeEvenementRecu.facture_annulee)
      .filter((l) => l.survenuAt.getTime() < t)
      .map((l) => texte(l.c, 'factureId'))
      .filter((x): x is string => x !== null)
  );
  const avoirsDe = (factureId: string | null) =>
    factureId === null
      ? []
      : deType(TypeEvenementRecu.avoir_emis)
          .filter((l) => texte(l.c, 'avoirDeFactureId') === factureId)
          .filter((l) => avantLeDepot(date(l.c, 'emisLe')))
          .map((l) => ({ montantHtCents: entier(l.c, 'montantHtCents') }));
  const factures = deType(TypeEvenementRecu.facture_emise)
    .map((l) => ({ c: l.c, emiseLe: date(l.c, 'emiseLe'), id: texte(l.c, 'factureId') }))
    .filter((f): f is { c: Charge; emiseLe: Date; id: string | null } => avantLeDepot(f.emiseLe))
    .map((f) => ({
      ...f,
      montantHtCents: entier(f.c, 'montantHtCents'),
      annulee: f.id !== null && annulees.has(f.id),
    }));

  const facturees = factures.filter((f) => estPrestationFacturee(f, avoirsDe(f.id)));
  const facturesAt = facturees.map((f) => f.emiseLe);

  const parDevis = new Map<
    string,
    { emisAt: Date | null; signeAt: Date | null; montant: number }
  >();
  for (const l of [
    ...deType(TypeEvenementRecu.devis_emis),
    ...deType(TypeEvenementRecu.devis_signe),
  ]) {
    const id = texte(l.c, 'devisId');
    if (id === null) continue;
    const d = parDevis.get(id) ?? { emisAt: null, signeAt: null, montant: 0 };
    if (l.type === TypeEvenementRecu.devis_emis) d.emisAt = date(l.c, 'emisLe');
    else {
      d.signeAt = date(l.c, 'signeLe');
      d.montant = entier(l.c, 'montantTotalHtCents');
    }
    parDevis.set(id, d);
  }
  const devis: DevisConnu[] = [];
  const devisIdentifies: { id: string; devis: DevisConnu }[] = [];
  for (const [id, d] of parDevis) {
    // Un devis signé sans émission reçue : son émission est au plus tard sa signature.
    const emisAt =
      d.emisAt !== null && d.signeAt !== null && d.signeAt.getTime() < d.emisAt.getTime()
        ? d.signeAt
        : (d.emisAt ?? d.signeAt);
    if (emisAt === null) continue;
    const siennes = factures.filter((f) => texte(f.c, 'devisId') === id);
    const connu: DevisConnu = {
      emisAt,
      signeAt: d.signeAt,
      montantTotalHtCents: d.montant,
      factureHtCents: factureHtDuDevis(
        siennes,
        siennes.flatMap((f) => avoirsDe(f.id))
      ),
    };
    devis.push(connu);
    devisIdentifies.push({ id, devis: connu });
  }
  return {
    facturesAt,
    devis,
    // DM-67, condition (c) : les mêmes faits, avec leur identifiant d'axion-ia, pour le fait fondateur.
    factures: facturees.map((f) => ({ id: f.id, at: f.emiseLe })),
    devisIdentifies,
  };
}

/** Les faits d'axionia d'un SIREN : par lui, par ses clients, et par les factures et devis trouvés. */
async function lireLesFaitsDuSiren(prisma: PrismaClient, siren: string): Promise<FaitRecu[]> {
  const lire = (types: TypeEvenementRecu[], champ: string, valeur: string) =>
    prisma.evenementRecu.findMany({
      where: { eventType: { in: types }, charge: { path: [champ], equals: valeur } },
      select: { eventType: true, charge: true, survenuAt: true },
    });
  const clientsLus = await lire(
    [TypeEvenementRecu.client_cree, TypeEvenementRecu.client_mis_a_jour],
    'siren',
    siren
  );
  const clients = new Set(
    clientsLus.map((l) => texte(enCharge(l.charge), 'clientId')).filter((x): x is string => !!x)
  );
  const factures = [...(await lire([TypeEvenementRecu.facture_emise], 'siren', siren))];
  const devis = [...(await lire([TypeEvenementRecu.devis_emis], 'siren', siren))];
  for (const id of clients) {
    for (const f of await lire([TypeEvenementRecu.facture_emise], 'clientId', id)) {
      const s = texte(enCharge(f.charge), 'siren');
      if (s === null || !FORME_SIREN.test(s)) factures.push(f);
    }
    devis.push(
      ...(await lire([TypeEvenementRecu.devis_emis, TypeEvenementRecu.devis_signe], 'clientId', id))
    );
  }
  const idsDevis = new Set(
    devis.map((d) => texte(enCharge(d.charge), 'devisId')).filter((x): x is string => !!x)
  );
  for (const id of idsDevis)
    devis.push(...(await lire([TypeEvenementRecu.devis_signe], 'devisId', id)));
  const idsFactures = new Set(
    factures.map((f) => texte(enCharge(f.charge), 'factureId')).filter((x): x is string => !!x)
  );
  const suites: FaitRecu[] = [];
  for (const id of idsFactures) {
    suites.push(...(await lire([TypeEvenementRecu.facture_annulee], 'factureId', id)));
    suites.push(...(await lire([TypeEvenementRecu.avoir_emis], 'avoirDeFactureId', id)));
  }
  // Un même fait lu par deux chemins (un devis par son SIREN et par son client) ne compte qu'une
  // fois : la base rend deux objets distincts, ils se reconnaissent à leur type, leur date et leur charge.
  const vus = new Map<string, FaitRecu>();
  for (const f of [...factures, ...devis, ...suites]) {
    vus.set(`${f.eventType}|${f.survenuAt.getTime()}|${JSON.stringify(f.charge)}`, f);
  }
  return [...vus.values()];
}

const estUnRefusDeTransition = (e: unknown): boolean =>
  e instanceof Error &&
  e.name === 'ErreurTransitionAttribution' &&
  (e as Error & { code?: unknown }).code === 'transition_refusee';

/** Le passage : rend le nombre d'attributions examinées et annulées. */
export async function rapprocherLesAnteriorites(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ examinees: number; annulees: number }> {
  // La PREMIÈRE date connue de chaque SIREN, origines client et devis.
  const connuDepuis = new Map<string, number>();
  for (const c of await prisma.entrepriseConnue.findMany({
    where: { origine: { in: ['client', 'devis'] } },
    select: { siren: true, connueDepuisAt: true },
  })) {
    const t = c.connueDepuisAt.getTime();
    connuDepuis.set(c.siren, Math.min(t, connuDepuis.get(c.siren) ?? t));
  }
  const sirens = [...connuDepuis.keys()];
  let examinees = 0;
  let annulees = 0;
  if (sirens.length === 0) return { examinees, annulees };

  const faitsDe = new Map<string, FaitRecu[]>();
  let apres: string | null = null;
  for (;;) {
    const lot: { id: string; siren: string; statut: string; deposeeAt: Date }[] =
      await prisma.attribution.findMany({
        where: {
          siren: { in: sirens },
          statut: { in: [...ETATS_OCCUPANTS] },
          ...(apres === null ? {} : { id: { gt: apres } }),
        },
        select: { id: true, siren: true, statut: true, deposeeAt: true },
        orderBy: { id: 'asc' },
        take: LOT_DU_RAPPROCHEMENT,
      });
    if (lot.length === 0) break;
    apres = lot.at(-1)!.id;
    for (const a of lot) {
      // Connue seulement APRÈS le dépôt : rien ne peut fonder l'annulation.
      if (connuDepuis.get(a.siren)! >= a.deposeeAt.getTime()) continue;
      examinees += 1;
      if (!faitsDe.has(a.siren)) faitsDe.set(a.siren, await lireLesFaitsDuSiren(prisma, a.siren));
      if (!occupe(a.statut)) continue;
      const fondement = fondementAuDepot(
        faitsDatesAuDepot(faitsDe.get(a.siren)!, a.deposeeAt),
        a.deposeeAt
      );
      if (fondement === null) continue;
      try {
        await prisma.$transaction((tx) =>
          transitionnerUneAttribution(tx, {
            attributionId: a.id,
            transition: 'anteriorite_etablie',
            critere: fondement.critere,
            // La RÉFÉRENCE du fait fondateur (condition (c) de la sécurité, voie (a) d'A02).
            fait: {
              nature: fondement.fait.nature,
              ref: refDuFaitFondateur(fondement.fait.nature, fondement.fait.id),
              le: fondement.fait.le.toISOString(),
            },
            acteur: { par: 'systeme' },
            maintenant,
          })
        );
        annulees += 1;
      } catch (e) {
        if (!estUnRefusDeTransition(e)) throw e;
      }
    }
  }
  return { examinees, annulees };
}
