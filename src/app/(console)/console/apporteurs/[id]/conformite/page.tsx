/**
 * `/console/apporteurs/[id]/conformite` — le dossier de conformité d'un apporteur (CPL-T07). Ouvert à
 * l'admin et au qualifieur (`ecran:conformite_apporteur`) ; les gestes demandent chacun leur droit,
 * dans leur action de serveur. La page lit le dossier, sans IBAN, et le rend par le composant pur ;
 * le chargement est son repli. Sans session admise, retour à la connexion ; rôle refusé, à l'écran
 * d'accès refusé.
 */
import { Suspense } from 'react';
import type { ConsoleRole } from '@prisma/client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole } from '../../../../../../server/roles/require-role';
import { roleAutorise } from '../../../../../../server/roles/matrice';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../../server/auth/lien-magique-production';
import { lireLeDossier, type MotifDuDossier } from '../../../../../../server/conformite/dossier';
import {
  ouvrirLeDossier,
  validerLeDossier,
  verifierLaPiece,
} from '../../../../../../server/console/conformite/actions';
import {
  ChargementDuDossier,
  DossierDeConformite,
} from '../../../../../../components/console/dossier-de-conformite';
import { CONFORMITE_CONSOLE } from '../../../../../../content/micro-copy/console/conformite';
import { versParis } from '../../../../../../domain/temps/paris';

// Lue à chaque requête : elle lit le cookie de session et les secrets de l'environnement,
// rien ne s'y pré-rend au build.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deux = (n: number) => String(n).padStart(2, '0');
const dateDeParis = (d: Date) => {
  const p = versParis(d.getTime());
  return `${deux(p.jour)}/${deux(p.mois)}/${p.annee}`;
};

/** Le refus d'un geste, lu dans l'adresse : seule une valeur FERMÉE de la liste est admise. */
function refusLu(valeur: string | undefined): MotifDuDossier | null {
  return valeur !== undefined && Object.hasOwn(CONFORMITE_CONSOLE.refus, valeur)
    ? (valeur as MotifDuDossier)
    : null;
}

/** Le dossier, lu et rendu ; le rôle arrive jugé par la page. */
async function Dossier({
  apporteurId,
  refus,
  role,
}: {
  apporteurId: string;
  refus: MotifDuDossier | null;
  role: ConsoleRole;
}) {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const dossier = UUID.test(apporteurId)
    ? await lireLeDossier(d.prisma, {
        apporteurId,
        maintenant: new Date(d.horloge.maintenant()),
      })
    : null;
  return (
    <DossierDeConformite
      apporteurId={apporteurId}
      dossier={dossier}
      droits={{
        verifier: roleAutorise('action:verifier_piece', role),
        ouvrir: roleAutorise('action:ouvrir_kyc', role),
        valider: roleAutorise('action:valider_kyc', role),
      }}
      actions={{ verifier: verifierLaPiece, ouvrir: ouvrirLeDossier, valider: validerLeDossier }}
      refus={refus}
      date={dateDeParis}
    />
  );
}

export default async function PageDossierDeConformite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refus?: string }>;
}) {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:conformite_apporteur', jeton, portsDeRoleConsole(d));
  if (!verdict.ok)
    redirect(verdict.motif === 'role_refuse' ? '/console/acces-refuse' : '/console/connexion');
  const { id } = await params;
  const { refus } = await searchParams;
  return (
    <Suspense fallback={<ChargementDuDossier />}>
      <Dossier apporteurId={id} refus={refusLu(refus)} role={verdict.utilisateur.role} />
    </Suspense>
  );
}
