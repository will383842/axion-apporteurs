/**
 * Les inscriptions des tâches de fond — GOV-137 (REQ-QA-027) : la COMPOSITION, partagée par la route
 * qui reçoit les événements (`src/app/api/webhooks/axionia/route.ts`, juste après la réponse) et par
 * le lanceur des passages planifiés (`src/server/taches/lanceur.ts`, chaque minute).
 *
 * Arbitrage de la coordination (GOV-137, option (a)) : le lanceur est lancé par une tâche planifiée
 * de la plateforme ; la route et lui jouent le MÊME passage, composé ici une seule fois (RM-01).
 *
 * DÉPLACÉ DE LA ROUTE, AVEC SES GARDES (RM-07). Le traitant de la candidature et le registre des
 * traitants vivaient dans la route (INT-T26, INT-T43). Leur seul appelant était `POST` ; ils sont
 * déplacés tels quels : les secrets sont relus À CHAQUE traitement, par le même juge que le
 * démarrage, et un refus lève (l'événement passe `en_erreur` sous le NOM de l'erreur, jamais un
 * secret).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, TypeEvenementRecu } from '@prisma/client';
import { sourceAleatoireSysteme } from '../../domain/apporteur/identifiants';
import { lireEnvironnement, lireTrousseaux } from '../../lib/env';
import { horlogeSysteme } from '../../lib/horloge';
import {
  clientCoordonnees,
  PREFIXE_ATTENTE_COORDONNEES,
  traiterCandidatureRecue,
} from '../integrations/axionia/candidature-recue';
import {
  aiguiller,
  depotDuTravail,
  franchissements,
  lireLesAttentes,
  passerLeTravail,
  reprendreLesAttentes,
  TACHE_DE_RECEPTION,
  type Franchissement,
  reprendreLesTraitants,
  type CompteursDuPassage,
  type DepotDuTravail,
  type EvenementATraiter,
  type Traitants,
} from '../queue/workers/evenement-recu';
import { clesPii } from '../securite/pii';
import {
  FORMES_D_ATTENTE,
  creerAlerteur,
  DECISION_TRANSFERT_TELEGRAM,
  exigerLeTransfertConsigne,
  type DecisionDuTransfert,
  notifieurTelegram,
  type Alerteur,
} from '../integrations/telegram/alertes';
import { verifierChaine, type LigneJournal } from '../../domain/evenement/journal';
import { lireJournalParLots } from '../evenement/journal';
import type { Inscriptions, Passage } from './lanceur';
import { clientRelecture, type CanalAxionia } from '../integrations/axionia/relecture';
import {
  clientRejeu,
  portsDeBase as portsDeReconciliation,
  reconcilier,
} from '../integrations/axionia/reconciliation';
import {
  passageDesSommes,
  portsDesSommesEnBase,
} from '../integrations/axionia/reconciliation-sommes';
import { passageQuotidien } from '../jobs/reconciliation';
import { minimiserCandidatures } from './minimiser-candidatures';
import { purgerLesContacts } from './purger-contacts';
import { purgerLesEntreprisesConnues } from './purger-entreprises-connues';
import { purgerLesSirenRefuses } from './purger-siren-refuses';
import { purgerLesAppareils } from './purger-appareils';
import { purgerLesNotificationsDeLEspace } from './purger-notifications-espace';
import { alerterLesNonRendus, passageDEnvoiDesNotifications } from './envoyer-notifications-espace';
import { purgerLesValeursDesDroits } from './purger-valeurs-droits-contact';
import { anonymiserLesTracesDesDroits } from './anonymiser-traces-droits-contact';
import {
  anonymiserLesAnomalies,
  purgerLesContestations,
  purgerLesDementis,
} from './purger-contestations-anomalies';
import { purgerLeJournalDesAccesConsole } from './purger-journal-acces-console';
import { purgerLesSessions } from './purger-sessions-espace';
import { effacerLesComptesDesactives } from './purger-utilisateurs-console';
import { purgerLesTracesDeLaListe } from './purger-traces-liste-noire';
import { completerLesCodesNaf, portsDeBase } from './completer-code-naf';
import {
  ouvrirLesAnomaliesDAutoParrainage,
  precedentDuBattement,
} from './ouvrir-anomalies-auto-parrainage';
import { creerDisjoncteur } from '../integrations/recherche-entreprises/disjoncteur';
import { PARAMETRES } from '../integrations/recherche-entreprises/parametres';
import { clientDuTiers } from '../integrations/recherche-entreprises/tiers';
import { limiteurDuRegistre } from '../integrations/recherche-entreprises/limiteur';
import { traitantsDeLAnteriorite } from '../entreprise-connue/projection';
import { rapprocherLesAnteriorites } from '../jobs/anteriorite-retroactive';

/**
 * Les traitants branchés, par type d'événement reçu. Un seul aujourd'hui : la candidature reçue
 * (INT-T26). Les autres attendent `traitant:<type>`, jamais `traite` (INT-T43) ; brancher un
 * traitant ici suffit pour qu'au passage suivant, ses événements en attente lui soient redonnés.
 */
export function traitantsDeReception(prisma: PrismaClient): Traitants {
  return {
    [TypeEvenementRecu.candidature_recue]: (recu) => traiterCandidature(prisma, recu),
    // DM-10-P : la projection de l'antériorité (client.*, devis, factures, avoirs, annulations).
    ...traitantsDeLAnteriorite(prisma),
  };
}

/**
 * Le passage des événements reçus : reprises en tête (coordonnées, puis traitants branchés), puis
 * le travail. `depot` est fourni par l'appelant : la route garde le battement du dépôt, le lanceur
 * l'écrit lui-même et passe un dépôt qui ne bat pas.
 */
export function passageDesEvenementsRecus(
  prisma: PrismaClient,
  depot: DepotDuTravail = depotDuTravail(prisma),
  alertes: AlertesDAttente | null = null
): () => Promise<CompteursDuPassage> {
  return async () => {
    const maintenant = () => new Date(horlogeSysteme.maintenant());
    const traitants = traitantsDeReception(prisma);
    const reprendreCoordonnees = reprendreLesAttentes(
      prisma,
      PREFIXE_ATTENTE_COORDONNEES,
      maintenant
    );
    const reprendreTraitants = reprendreLesTraitants(prisma, traitants);
    const compteurs = await passerLeTravail({
      depot,
      dispatch: aiguiller(traitants),
      reprendre: async () => (await reprendreCoordonnees()) + (await reprendreTraitants()),
      maintenant,
    });
    if (alertes !== null) await alerterLesFranchissements(alertes, maintenant());
    return compteurs;
  };
}

// ── INT-T49 / INT-T54 : l'alerte des attentes au-delà de leur seuil, en fin de passage ─────────────

/** Ce dont l'alerte des attentes a besoin : les attentes, le dernier succès, le canal (ou rien). */
export interface AlertesDAttente {
  lireLesAttentes(): ReturnType<ReturnType<typeof lireLesAttentes>>;
  /** `dernierSuccesAt` du battement de la tâche : le début de la fenêtre, ou `null` au premier passage. */
  dernierSucces(): Promise<Date | null>;
  /** `null` : aucun canal configuré. */
  alerteur: Pick<Alerteur, 'alerter'> | null;
}

/** L'objet d'une alerte `attente_depassee` : la forme, le type, le nombre, l'âge. Rien d'autre. */
export function objetDAlerte(f: Franchissement) {
  return {
    categorie: 'attente_depassee' as const,
    id: randomUUID(),
    attente: {
      forme: f.forme,
      type: f.type,
      nombre: f.nombre,
      plusAncienneJours: f.plusAncienneJours,
    },
  };
}

/**
 * Une alerte par franchissement. Une alerte DUE sans canal fait ÉCHOUER le passage en le nommant
 * (`canal_alerte_absent`), et un envoi en échec aussi : le battement n'avance pas, la fenêtre est
 * rejouée au passage suivant — une alerte perdue en silence serait pire qu'un doublon. Sans attente
 * au-delà du seuil, rien n'est exigé.
 */
export async function alerterLesFranchissements(
  a: AlertesDAttente,
  maintenant: Date
): Promise<void> {
  const attentes = await a.lireLesAttentes();
  if (attentes.length === 0) return;
  const dus = franchissements(attentes, { maintenant, depuis: await a.dernierSucces() });
  if (dus.length === 0) return;
  if (a.alerteur === null) throw new Error('canal_alerte_absent');
  for (const f of dus) await a.alerteur.alerter(objetDAlerte(f));
}

/** Le canal d'alerte du serveur, lu dans l'environnement ; `null` s'il n'est pas configuré. */
export function canalDAlerte(
  env: Readonly<Record<string, string | undefined>>,
  decision: DecisionDuTransfert | null = DECISION_TRANSFERT_TELEGRAM
): Alerteur | null {
  const jeton = env.TELEGRAM_BOT_TOKEN;
  const salon = env.TELEGRAM_CHAT_ID;
  if (jeton === undefined || jeton === '' || salon === undefined || salon === '') return null;
  // SEC-64 (sécurité, 5982916235) : le canal réel se construirait ; sans décision consignée sur le
  // transfert, il est refusé, nommé, et le lanceur ne démarre pas.
  exigerLeTransfertConsigne(env, decision);
  return creerAlerteur({
    notifieur: notifieurTelegram(jeton, salon),
    horloge: horlogeSysteme,
    // Une alerte par (forme, type) au plus dans un passage : le plafond ne retient jamais une
    // alerte due de ce passage.
    plafondParHeure: FORMES_D_ATTENTE.length * Object.values(TypeEvenementRecu).length,
  });
}

/** Les inscriptions du lanceur : une clé du registre, un passage. Le battement est celui du lanceur. */
export function inscriptions(
  prisma: PrismaClient,
  env: Readonly<Record<string, string | undefined>> = process.env
): Inscriptions {
  const depot = depotDuTravail(prisma);
  return {
    evenements_recus: passageDesEvenementsRecus(
      prisma,
      { ...depot, battre: async () => undefined },
      {
        lireLesAttentes: lireLesAttentes(prisma),
        dernierSucces: async () =>
          (
            await prisma.battement.findUnique({
              where: { tache: TACHE_DE_RECEPTION },
              select: { dernierSuccesAt: true },
            })
          )?.dernierSuccesAt ?? null,
        alerteur: canalDAlerte(env),
      }
    ),
    // INT-T56 : la charge des candidatures non traitées au-delà du délai de la SSOT est minimisée.
    minimiser_candidatures: async () => ({
      minimisees: await minimiserCandidatures(prisma, new Date(horlogeSysteme.maintenant())),
    }),
    journal_verifier: passageDuJournal(() => lireJournalParLots(prisma)),
    // DM-48 (REQ-DM-031) : la purge du contact à échéance, à l'heure du système.
    contacts_purger: () => purgerLesContacts(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-53 (REQ-DM-043) : le SIREN des dépôts refusés, douze mois après le refus.
    siren_refuses_purger: () =>
      purgerLesSirenRefuses(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-66 (REQ-DM-029) : les projections de l'antériorité, effacées quand elles ne fondent plus de refus.
    entreprises_connues_purger: () =>
      purgerLesEntreprisesConnues(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-61 (REQ-UX-016) : les notifications de l'espace, douze mois après leur inscription.
    notifications_espace_purger: () =>
      purgerLesNotificationsDeLEspace(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-55 (REQ-UX-016) : le courriel des notifications de la machine, après le commit de la
    // transition ; la fenêtre de redéclaration court de son envoi effectif.
    notifications_espace_envoyer: async () => {
      const bilan = await passageDEnvoiDesNotifications(prisma, env)();
      // Arbitrage de la sécurité : un non-rendu lève aussi une alerte fermée (motif et nombre).
      await alerterLesNonRendus(bilan, canalDAlerte(env));
      return bilan;
    },
    // DM-25 (REQ-JUR-007) : l'antériorité établie après coup, jugée au dépôt sur des faits antérieurs.
    anteriorites_rapprocher: () =>
      rapprocherLesAnteriorites(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-59 (REQ-JUR-065) : la valeur d'une rectification, effacée à son échéance même sans traitement.
    droits_contact_purger: () =>
      purgerLesValeursDesDroits(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-60 (REQ-JUR-065) : la trace d'une demande de droit, anonymisée cinq ans après sa clôture.
    droits_contact_anonymiser: () =>
      anonymiserLesTracesDesDroits(prisma, new Date(horlogeSysteme.maintenant())),
    // SEC-18 (REQ-SEC-031) : l'ouverture DIFFÉRÉE des anomalies d'auto-parrainage, depuis le curseur
    // que son propre battement porte.
    auto_parrainage_ouvrir: () =>
      ouvrirLesAnomaliesDAutoParrainage(prisma, {
        maintenant: () => new Date(horlogeSysteme.maintenant()),
        precedent: precedentDuBattement(prisma),
      }),
    // DM-62 (REQ-DM-033, REQ-DM-043) : les anomalies, les contestations et le démenti d'un contact,
    // chacun à son échéance, à l'heure du système. Le passage des anomalies ne rend qu'un NOMBRE de
    // mesures ouvertes : les anomalies en cause ne sont nommées qu'en console.
    anomalies_anonymiser: () =>
      anonymiserLesAnomalies(prisma, new Date(horlogeSysteme.maintenant())),
    contestations_purger: () =>
      purgerLesContestations(prisma, new Date(horlogeSysteme.maintenant())),
    dementis_purger: () => purgerLesDementis(prisma, new Date(horlogeSysteme.maintenant())),
    // SEC-55 (REQ-SEC-003) : l'empreinte d'un appareil, effacée une durée de session après sa vue.
    appareils_purger: () => purgerLesAppareils(prisma, new Date(horlogeSysteme.maintenant())),
    // SEC-58 : le journal des accès à la console, purgé à son échéance (la purge vide les identifiants).
    journal_acces_console_purger: () =>
      purgerLeJournalDesAccesConsole(prisma, new Date(horlogeSysteme.maintenant())),
    // SEC-65 (REQ-SEC-003, REQ-JUR-068) : les sessions finies, six mois après leur fin ; le nom et
    // l'adresse d'un accès désactivé de la console, cinq ans après la désactivation.
    sessions_purger: () => purgerLesSessions(prisma, new Date(horlogeSysteme.maintenant())),
    utilisateurs_console_effacer: () =>
      effacerLesComptesDesactives(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-65 : la trace de la liste de la Société, effacée cinq ans après le retrait.
    traces_liste_noire_purger: () =>
      purgerLesTracesDeLaListe(prisma, new Date(horlogeSysteme.maintenant())),
    // DM-28 (REQ-DM-046) : la reprise des codes NAF nuls. Un disjoncteur par passage : le tiers en
    // panne interrompt la reprise, le passage suivant la relance.
    naf_completer: () =>
      completerLesCodesNaf({
        ...portsDeBase(prisma),
        tiers: clientDuTiers({
          fetch,
          urlDeBase: PARAMETRES.urlDeBase.valeur,
          delaiMs: PARAMETRES.delaiAttenteMs.valeur,
        }),
        disjoncteur: creerDisjoncteur(),
        // Le quota du tiers est partagé avec l'autocomplétion : la reprise passe par le même débit.
        debit: (ms) => limiteurDuRegistre.global(ms),
        maintenantMs: () => horlogeSysteme.maintenant(),
      }),
    // INT-T08-P (REQ-INT-013) : la réconciliation quotidienne avec axion-ia.
    reconciliation_axionia: passageDeReconciliation(prisma, env, canalDAlerte(env)),
  };
}

/**
 * INT-T08-P — le passage `reconciliation_axionia` : dû une fois par jour civil UTC (son battement le
 * dit), il relit la file d'axion-ia et demande le rejeu des trous. Les secrets sont relus À CHAQUE
 * passage, par le même juge que le démarrage ; un refus lève, et le battement passe en échec. Un
 * signal part en alerte `reconciliation` (genre, motif fermé, nombre) ; sans canal d'alerte, il est
 * perdu, et le battement reste la trace.
 *
 * Le retour porte les `event_id` manquants (`eventIdsManquants`) : le battement les conserve, dans
 * Partners, tout le jour — chaque minute différée reporte les compteurs qu'il porte
 * (`passageQuotidien`). Le type `Passage` du lanceur ne déclare que des compteurs numériques ; la
 * colonne `battements.compteurs` est du JSON, et la liste y est écrite telle quelle.
 */
export function passageDeReconciliation(
  prisma: PrismaClient,
  env: Readonly<Record<string, string | undefined>>,
  alerteur: Alerteur | null
): Passage {
  const passage = passageQuotidien({
    ...battementDeLaReconciliation(prisma),
    maintenant: () => new Date(horlogeSysteme.maintenant()),
    reconcilier: async () => {
      const lu = lireEnvironnement(env);
      if (!lu.ok) throw new Error('environnement_refuse');
      const rotation = lireTrousseaux(env, horlogeSysteme.maintenant());
      if (!rotation.ok) throw new Error('environnement_refuse');
      const canal: CanalAxionia = {
        urlAxionia: env['AXIONIA_BASE_URL'],
        secretRelecture: lu.env.AXIONIA_RELECTURE_SECRET,
        trousseauEmission: rotation.trousseaux.AXIONIA_WEBHOOK_SECRET,
        appeler: fetch,
        maintenantMs: () => horlogeSysteme.maintenant(),
      };
      // Un signal ne porte qu'un genre, un motif fermé ou un NOMBRE : jamais un identifiant.
      const signaler = async (
        s: { genre: string; motif: string } | { genre: string; nombre: number }
      ) => {
        await alerteur?.alerter({
          categorie: 'reconciliation',
          id: randomUUID(),
          reconciliation: {
            genre: s.genre,
            ...('motif' in s ? { motif: s.motif } : { nombre: s.nombre }),
          },
        });
      };
      const sequences = await reconcilier({
        ...portsDeReconciliation(prisma),
        lire: clientRelecture(canal),
        rejouer: clientRejeu(canal),
        signaler,
      });
      // INT-T73-P (REQ-INT-013) : la réconciliation des SOMMES, dans le même passage quotidien. Son
      // échec est signalé et compté, sans faire échouer la réconciliation des séquences, déjà faite :
      // un passage rejoué à la minute suivante redemanderait des rejeux pour rien. Les SIREN en écart
      // restent au battement, dans Partners ; vers l'extérieur, seul leur nombre part.
      try {
        const r = await passageDesSommes(
          portsDesSommesEnBase(prisma, {
            maintenant: () => new Date(horlogeSysteme.maintenant()),
            lire: clientRelecture(canal),
            signaler,
          })
        );
        return {
          ...sequences,
          sommesPages: r.pages,
          sommesRelus: r.relus,
          ecartsDeSommes: r.nombreDEcarts,
          sirensEnEcart: [...new Set(r.ecartsParSiren.map((e) => e.siren))],
        };
      } catch {
        return { ...sequences, sommesEchec: 1 };
      }
    },
  });
  return passage as unknown as Passage;
}

/** Le battement de `reconciliation_axionia`, lu en base : son dernier succès et les compteurs qu'il porte. */
export function battementDeLaReconciliation(prisma: PrismaClient) {
  const lire = () =>
    prisma.battement.findUnique({
      where: { tache: 'reconciliation_axionia' },
      select: { dernierSuccesAt: true, compteurs: true },
    });
  return {
    dernierSucces: async (): Promise<Date | null> => (await lire())?.dernierSuccesAt ?? null,
    derniersCompteurs: async (): Promise<unknown> => (await lire())?.compteurs ?? null,
  };
}

/**
 * DM-45 (REQ-DM-024) — le passage `journal_verifier` : le journal, lu par lots, est VÉRIFIÉ par ses
 * liens de hash (`verifierChaine`). Une chaîne rompue fait ÉCHOUER le passage, et son battement le
 * dit ; l'erreur nomme la faute et l'id du maillon, jamais une charge.
 */
export function passageDuJournal(lire: () => Promise<LigneJournal[]>) {
  return async (): Promise<{ maillons: number }> => {
    const v = verifierChaine(await lire());
    if (!v.ok) throw new Error(`chaine_rompue : ${v.faute}, maillon ${v.id ?? 'aucun'}`);
    return { maillons: v.maillons };
  };
}

/** Le traitant de la candidature reçue (déplacé de la route, inchangé). */
async function traiterCandidature(prisma: PrismaClient, recu: EvenementATraiter): Promise<void> {
  const lu = lireEnvironnement(process.env);
  if (!lu.ok) throw new Error('environnement_refuse');
  const rotation = lireTrousseaux(process.env, horlogeSysteme.maintenant());
  if (!rotation.ok) throw new Error('environnement_refuse');
  await traiterCandidatureRecue(prisma, recu, {
    tirer: clientCoordonnees({
      urlAxionia: process.env['AXIONIA_BASE_URL'],
      secretRelecture: lu.env.AXIONIA_RELECTURE_SECRET,
      trousseauEmission: rotation.trousseaux.AXIONIA_WEBHOOK_SECRET,
      appeler: fetch,
      maintenantMs: () => horlogeSysteme.maintenant(),
    }),
    cles: clesPii(process.env),
    maintenant: () => new Date(horlogeSysteme.maintenant()),
    aleatoire: sourceAleatoireSysteme,
  });
}
