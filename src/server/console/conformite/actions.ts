'use server';
/**
 * CPL-T07 — les actions de l'écran « Dossier de conformité ». Chacune pose SA question à
 * `requireRole` (son droit de la matrice) AVANT tout travail ; le geste lui-même est dans
 * `dossier.ts`, avec son événement dans la même transaction.
 *
 * Un refus de rôle renvoie à l'accueil de la console ; un relèvement manquant (la validation du
 * dossier, sous step-up), à la connexion avec l'écran en suite. Un geste refusé par la règle revient
 * à l'écran, son motif en paramètre FERMÉ ; aucune donnée de personne ne part au navigateur.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole, type VerdictDeRole } from '../../roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../auth/lien-magique-production';
import { MOTIFS_REFUS_PIECE, type MotifRefusPiece } from '../../../domain/kyc/pieces';
import {
  ErreurDossierDeConformite,
  ouvrirLeKyc,
  validerLeKyc,
  verifierUnePiece,
} from '../../conformite/dossier';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texte(formData: FormData, cle: string): string {
  const v = formData.get(cle);
  return typeof v === 'string' ? v : '';
}

/** L'écran de l'apporteur ; un identifiant hors forme ramène à l'accueil, sans écho. */
function ecranDe(formData: FormData): { apporteurId: string; ecran: string } {
  const apporteurId = texte(formData, 'apporteurId');
  if (!UUID.test(apporteurId)) redirect('/console');
  return { apporteurId, ecran: `/console/apporteurs/${apporteurId}/conformite` };
}

/** Le verdict, lu en tête ; un refus ne revient jamais (redirection). */
function acteurOuRedirection(verdict: VerdictDeRole, ecran: string) {
  if (verdict.ok) return verdict.utilisateur;
  if (verdict.motif === 'releve_requis')
    redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
  redirect('/console');
}

const jetonDeSession = async () => (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
const processus = () => dependancesDuProcessus({ apres: after, env: process.env });

async function geste(ecran: string, travail: () => Promise<void>): Promise<never> {
  try {
    await travail();
  } catch (e) {
    if (e instanceof ErreurDossierDeConformite) redirect(`${ecran}?refus=${e.motif}`);
    throw e;
  }
  redirect(ecran);
}

export async function verifierLaPiece(formData: FormData): Promise<void> {
  const { ecran } = ecranDe(formData);
  const d = processus();
  const acteur = acteurOuRedirection(
    await requireRole('action:verifier_piece', await jetonDeSession(), portsDeRoleConsole(d)),
    ecran
  );
  const decision = texte(formData, 'decision');
  const motif = texte(formData, 'motif');
  const verdict =
    decision === 'valider'
      ? ({ decision: 'valider' } as const)
      : decision === 'refuser' && (MOTIFS_REFUS_PIECE as readonly string[]).includes(motif)
        ? ({ decision: 'refuser', motif: motif as MotifRefusPiece } as const)
        : null;
  const pieceId = texte(formData, 'pieceId');
  if (verdict === null || !UUID.test(pieceId)) redirect(`${ecran}?refus=introuvable`);
  await geste(ecran, () =>
    verifierUnePiece(d.prisma, {
      acteur,
      pieceId,
      verdict,
      maintenant: new Date(d.horloge.maintenant()),
    })
  );
}

export async function ouvrirLeDossier(formData: FormData): Promise<void> {
  const { apporteurId, ecran } = ecranDe(formData);
  const d = processus();
  const acteur = acteurOuRedirection(
    await requireRole('action:ouvrir_kyc', await jetonDeSession(), portsDeRoleConsole(d)),
    ecran
  );
  await geste(ecran, () =>
    ouvrirLeKyc(d.prisma, { acteur, apporteurId, maintenant: new Date(d.horloge.maintenant()) })
  );
}

export async function validerLeDossier(formData: FormData): Promise<void> {
  const { apporteurId, ecran } = ecranDe(formData);
  const d = processus();
  const acteur = acteurOuRedirection(
    await requireRole('action:valider_kyc', await jetonDeSession(), portsDeRoleConsole(d)),
    ecran
  );
  await geste(ecran, () =>
    validerLeKyc(d.prisma, { acteur, apporteurId, maintenant: new Date(d.horloge.maintenant()) })
  );
}
