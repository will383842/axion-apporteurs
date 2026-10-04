/**
 * SEC-30 — les courriels de l'administration des utilisateurs : `invitation_console`, `admin_cree` et
 * `admin_reactive`. Textes de la juriste (rattrapages 96 et 98), dans `console/utilisateurs.ts`.
 *
 * CE MODULE CONSTRUIT, IL N'ENVOIE PAS. L'envoi part APRÈS la réponse, par la voie d'envoi du
 * processus (`d.envoi`), confiée à `planifier` par l'action. Les destinataires d'`admin_cree` sont
 * lus DANS la transaction du geste (forme d'A02) : les administrateurs actifs à cet instant, auteur
 * compris, une émission par administrateur.
 *
 * Ce qui n'y entre jamais : un lien de connexion ou un jeton (l'invitation ne porte que l'adresse de
 * `/console/connexion`), l'identité de l'administrateur qui invite (dans l'invitation), une donnée
 * d'apporteur.
 */
import type { ConsoleRole, Prisma } from '@prisma/client';
import { UTILISATEURS_CONSOLE } from '../../../content/micro-copy/console/utilisateurs';
import { DUREES_AUTH } from '../../auth/durees';
import { identiteDeLUtilisateurConsole } from '../../auth/lien-magique-depot';
import type { ClesPii } from '../../securite/pii';
import { dateEtHeureCompletesDeParis } from './dates';

const C = UTILISATEURS_CONSOLE.courriels;

export interface CourrielDeLAdministration {
  readonly a: string;
  readonly sujet: string;
  readonly corps: string;
  readonly gabarit: 'invitation_console' | 'admin_cree' | 'admin_reactive';
}

/** JUR-T62 : la route publique de la page « Vos données dans la console » (`docs/CONSOLE-ROUTES.md`). */
const ROUTE_VOS_DONNEES_CONSOLE = '/console/vos-donnees';

/** L'invitation : le rôle, l'adresse de connexion (sans jeton), l'échéance, la page des données. */
export function courrielDInvitation(d: {
  a: string;
  role: ConsoleRole;
  adresseConnexion: string;
  inviteeAt: Date;
}): CourrielDeLAdministration {
  const echeance = new Date(d.inviteeAt.getTime() + DUREES_AUTH.invitationConsoleMs.valeur);
  return {
    a: d.a,
    sujet: C.invitation.sujet,
    corps: C.invitation.corps({
      libelleRole: d.role,
      adresseConnexion: d.adresseConnexion,
      dateExpiration: dateEtHeureCompletesDeParis(echeance),
      // JUR-T62 : la page publique « Vos données dans la console », sur la même origine que la connexion.
      adressePolitique: new URL(ROUTE_VOS_DONNEES_CONSOLE, d.adresseConnexion).toString(),
    }),
    gabarit: 'invitation_console',
  };
}

/** « Prénom Nom (adresse) » quand le nom existe, l'adresse seule sinon (arbitrage de la juriste). */
export function identite(nom: string | null, adresse: string): string {
  return nom ? `${nom} (${adresse})` : adresse;
}

/** Le déchiffrement vit hors de la console (SEC-58) : dans le module d'authentification. */
const clairs = identiteDeLUtilisateurConsole;

/**
 * Les courriels `admin_cree`, construits DANS la transaction du geste : un par administrateur actif,
 * auteur compris. La phrase des quatre yeux n'entre que si un autre administrateur que l'auteur
 * existe pour valider.
 */
export async function courrielsDeCreationDAdministrateur(
  tx: Prisma.TransactionClient,
  d: { creeId: string; auteurId: string; maintenant: Date; cles: ClesPii }
): Promise<CourrielDeLAdministration[]> {
  const choisir = { id: true, nomChiffre: true, emailChiffre: true } as const;
  const [cree, auteur, admins] = await Promise.all([
    tx.utilisateurConsole.findUniqueOrThrow({ where: { id: d.creeId }, select: choisir }),
    tx.utilisateurConsole.findUniqueOrThrow({ where: { id: d.auteurId }, select: choisir }),
    tx.utilisateurConsole.findMany({
      where: { role: 'admin', desactiveAt: null },
      select: { ...choisir, valideAt: true },
    }),
  ]);
  const c = clairs(cree, d.cles);
  const a = clairs(auteur, d.cles);
  const secondAdministrateur = admins.some(
    (x) => x.id !== d.auteurId && x.id !== d.creeId && x.valideAt !== null
  );
  const corps = C.adminCree.corps({
    identiteCree: identite(c.nom, c.adresse ?? ''),
    identiteAuteur: identite(a.nom, a.adresse ?? ''),
    dateHeure: dateEtHeureCompletesDeParis(d.maintenant),
    secondAdministrateur,
  });
  return admins.flatMap((x) => {
    const adresse = clairs(x, d.cles).adresse;
    return adresse === null
      ? []
      : [{ a: adresse, sujet: C.adminCree.sujet, corps, gabarit: 'admin_cree' as const }];
  });
}

/**
 * Les courriels `admin_reactive` (rattrapage 98), construits DANS la transaction de la réactivation :
 * un par administrateur actif à cet instant, auteur compris. Le compte réactivé repart en attente.
 */
export async function courrielsDeReactivationDAdministrateur(
  tx: Prisma.TransactionClient,
  d: { reactiveId: string; auteurId: string; maintenant: Date; cles: ClesPii }
): Promise<CourrielDeLAdministration[]> {
  const choisir = { id: true, nomChiffre: true, emailChiffre: true } as const;
  const [reactive, auteur, admins] = await Promise.all([
    tx.utilisateurConsole.findUniqueOrThrow({ where: { id: d.reactiveId }, select: choisir }),
    tx.utilisateurConsole.findUniqueOrThrow({ where: { id: d.auteurId }, select: choisir }),
    tx.utilisateurConsole.findMany({
      where: { role: 'admin', desactiveAt: null },
      select: choisir,
    }),
  ]);
  const r = clairs(reactive, d.cles);
  const a = clairs(auteur, d.cles);
  const corps = C.adminReactive.corps({
    identiteReactive: identite(r.nom, r.adresse ?? ''),
    identiteAuteur: identite(a.nom, a.adresse ?? ''),
    dateHeure: dateEtHeureCompletesDeParis(d.maintenant),
  });
  return admins.flatMap((x) => {
    const adresse = clairs(x, d.cles).adresse;
    return adresse === null
      ? []
      : [{ a: adresse, sujet: C.adminReactive.sujet, corps, gabarit: 'admin_reactive' as const }];
  });
}
