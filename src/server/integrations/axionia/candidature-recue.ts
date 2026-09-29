/**
 * Le traitement d'une candidature reçue d'axionia — INT-T26 (REQ-INT-032, REQ-DM-035, REQ-QA-035 ;
 * partners/ADR-0022, partners/ADR-0023).
 *
 * UN SEUL CRÉATEUR. Ce module est le seul chemin par lequel un `Apporteur` naît d'une candidature :
 * au statut `candidat`, avec le snapshot FIGÉ de DM-06, dans la MÊME transaction que le passage de
 * l'événement reçu à `traite` — un apporteur sans son événement traité, ou l'inverse, n'existe pas.
 *
 * LES COORDONNÉES NE VOYAGENT PAS DANS LA CHARGE. Elles sont TIRÉES à l'instant par la route
 * d'axionia (partners/ADR-0023), écrites par `colonnesPii` en blocs chiffrés et empreintes, et ne
 * vivent que le temps du traitement : jamais en base en clair, jamais au journal, jamais dans un
 * message d'erreur, jamais dans `evenements_recus`.
 *
 * ROUTE INDISPONIBLE = ATTENTE, JAMAIS UN APPORTEUR SANS ADRESSE. Réseau, statut autre que 200,
 * signature de réponse fausse, corps hors contrat, adresse absente, canal non configuré : l'événement
 * passe `en_attente_dependance` (`coordonnees:<candidatureId>`) et le travail de fond le reprend.
 *
 * RATTACHER PLUTÔT QUE DOUBLER. Une personne déjà connue — par l'empreinte de son courriel, puis par
 * celle de son téléphone, ou par la même candidature — ne crée aucune ligne : la candidature est
 * rattachée à l'apporteur existant.
 */
import { createHmac, randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import type { Prisma, PrismaClient } from '@prisma/client';
import contratPublie from '../../../../packages/contracts/contracts.v2.json';
import {
  API_COORDONNEES_CANDIDATURE,
  refDependanceCoordonnees,
} from '../../../../packages/contracts/api';
import {
  genererCodeParrainage,
  type SourceAleatoire,
} from '../../../domain/apporteur/identifiants';
import { snapshotDeCandidature } from '../../../domain/apporteur/snapshot-candidature';
import { MODELE_APPORTEUR } from '../../auth/lien-magique-depot';
import { AttenteDeDependance } from '../../queue/workers/evenement-recu';
import { colonnesPii, empreinteRecherche, type ClesPii } from '../../securite/pii';
import { ENTETE_HORODATAGE, ENTETE_SIGNATURE, verifierSignatureAxionia } from './reception';

/** Les en-têtes de la REQUÊTE signée, tels que le contrat les publie (confrontés par le test). */
export const ENTETE_HORODATAGE_REQUETE = 'x-partners-timestamp';
export const ENTETE_SIGNATURE_REQUETE = 'x-partners-signature';

/** Le préfixe des attentes que ce module pose, DÉRIVÉ de la fonction du contrat. */
export const PREFIXE_ATTENTE_COORDONNEES = refDependanceCoordonnees('x').slice(0, -1);

/** Délai d'attente d'un appel à la route : au-delà, la candidature attend et sera reprise. */
const DELAI_MS = 10_000;

export type Coordonnees = {
  readonly nom: string | null;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
};

/** Les coordonnées d'une candidature, ou `null` : la route n'a pas pu les donner. */
export type TirerCoordonnees = (candidatureId: string) => Promise<Coordonnees | null>;

/** La réponse validée contre le `$defs` PUBLIÉ du contrat, jamais contre un schéma retapé ici. */
const reponseConforme = new Ajv({ strict: false }).compile<Coordonnees>(
  (contratPublie as { $defs: Record<string, object> }).$defs[
    `${API_COORDONNEES_CANDIDATURE.prefixeDefs}_reponse`
  ]!
);

/** Le client de la route des coordonnées d'axionia. Aucun appel si le canal n'est pas configuré. */
export function clientCoordonnees(c: {
  readonly urlAxionia: string | undefined;
  readonly secretRelecture: string;
  readonly secretEmission: string;
  readonly appeler: typeof fetch;
  readonly maintenantMs: () => number;
}): TirerCoordonnees {
  return async (candidatureId) => {
    if (c.urlAxionia === undefined) return null;
    const chemin = API_COORDONNEES_CANDIDATURE.chemin.replace(
      '{candidatureId}',
      encodeURIComponent(candidatureId)
    );
    const horodatage = String(Math.floor(c.maintenantMs() / 1000));
    const signature = createHmac('sha256', c.secretRelecture)
      .update(`${horodatage}.${chemin}`)
      .digest('hex');
    let reponse: Response;
    try {
      reponse = await c.appeler(new URL(chemin, c.urlAxionia), {
        method: 'GET',
        headers: {
          [ENTETE_HORODATAGE_REQUETE]: horodatage,
          [ENTETE_SIGNATURE_REQUETE]: signature,
        },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(DELAI_MS),
      });
    } catch {
      return null;
    }
    if (reponse.status !== 200) return null;
    const octets = new Uint8Array(await reponse.arrayBuffer());
    const verdict = verifierSignatureAxionia(
      octets,
      reponse.headers.get(ENTETE_HORODATAGE),
      reponse.headers.get(ENTETE_SIGNATURE),
      c.secretEmission,
      c.maintenantMs()
    );
    if (!verdict.ok) return null;
    let corps: unknown;
    try {
      corps = JSON.parse(new TextDecoder().decode(octets));
    } catch {
      return null;
    }
    return reponseConforme(corps) ? corps : null;
  };
}

export type DependancesCandidature = {
  readonly tirer: TirerCoordonnees;
  readonly cles: ClesPii;
  readonly maintenant: () => Date;
  readonly aleatoire: SourceAleatoire;
};

export type ResultatCandidature = 'cree' | 'rattache';

/** Le client transactionnel dont ce traitement a besoin, et rien d'autre. */
export type ClientCandidature = Pick<PrismaClient, '$transaction'>;

export async function traiterCandidatureRecue(
  prisma: ClientCandidature,
  recu: { readonly id: string; readonly charge: unknown },
  d: DependancesCandidature
): Promise<ResultatCandidature> {
  const { snapshot } = snapshotDeCandidature(recu.charge);
  const coordonnees = await d.tirer(snapshot.candidatureId);
  if (coordonnees === null || coordonnees.email === null) {
    throw new AttenteDeDependance(refDependanceCoordonnees(snapshot.candidatureId));
  }
  const emailHash = empreinteRecherche('courriel', coordonnees.email, d.cles);
  const phoneHash =
    coordonnees.telephone === null
      ? null
      : empreinteRecherche('telephone', coordonnees.telephone, d.cles);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existant =
      (await tx.apporteur.findFirst({
        where: { OR: [{ emailHash }, { candidatureId: snapshot.candidatureId }] },
        select: { id: true },
      })) ??
      (phoneHash === null
        ? null
        : await tx.apporteur.findFirst({ where: { phoneHash }, select: { id: true } }));

    let resultat: ResultatCandidature = 'rattache';
    if (existant === null) {
      await tx.apporteur.create({
        data: {
          statut: 'candidat',
          codeParrainage: genererCodeParrainage(d.aleatoire),
          isTest: false,
          candidatureId: snapshot.candidatureId,
          reponsesJson: snapshot.reponsesJson as Prisma.InputJsonValue,
          scoreInitial: snapshot.scoreInitial,
          scorePartsJson: snapshot.scorePartsJson,
          scoreBaremeVersion: snapshot.scoreBaremeVersion,
          sourceCanal: snapshot.sourceCanal,
          parrainCodeCapture: snapshot.parrainCodeCapture,
          creeAt: d.maintenant(),
          // Les blocs et empreintes naissent de colonnesPii, ÉTALÉ (garde securite:schema-pii) ;
          // `id` vient de lui aussi. Prisma 5 accepte un Uint8Array là où il type Buffer.
          ...(colonnesPii(
            { modele: MODELE_APPORTEUR, id: randomUUID() },
            {
              nom: coordonnees.nom,
              prenom: coordonnees.prenom,
              email: coordonnees.email,
              telephone: coordonnees.telephone,
            },
            d.cles
          ) as unknown as Pick<
            Prisma.ApporteurUncheckedCreateInput,
            | 'id'
            | 'nomChiffre'
            | 'prenomChiffre'
            | 'emailChiffre'
            | 'emailHash'
            | 'telephoneChiffre'
            | 'phoneHash'
          >),
        },
      });
      resultat = 'cree';
    }
    await tx.evenementRecu.update({
      where: { id: recu.id },
      data: { statut: 'traite', processedAt: d.maintenant(), dependanceRef: null },
    });
    return resultat;
  });
}
