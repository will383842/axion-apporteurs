/**
 * `/console/apporteurs/[id]/mise-en-demeure` — le geste minimal de mise en demeure (UX-P1-57). La page
 * est gardée par le droit du geste, `action:mettre_en_demeure` (l'admin seul, sous step-up) : sans
 * relèvement récent, retour à la connexion avec cette page en suite ; rôle refusé, à l'écran d'accès
 * refusé. Elle lit seulement l'existence de l'apporteur ; un apporteur hors contrat est dit par le
 * refus de SEC-19, sans recopier sa règle. Le chargement est son repli.
 */
import { randomUUID } from 'node:crypto';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireRole } from '../../../../../../server/roles/require-role';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../../../../../server/auth/lien-magique-production';
import { mettreEnDemeureDepuisLaConsole } from '../../../../../../server/console/mise-en-demeure/actions';
import {
  MISE_EN_DEMEURE_CONSOLE,
  type RefusDeLaMiseEnDemeure,
} from '../../../../../../content/micro-copy/console/mise-en-demeure';
import {
  ChargementDeLaMiseEnDemeure,
  EcranMiseEnDemeure,
} from '../../../../../../components/console/mise-en-demeure';

// Lue à chaque requête : elle lit le cookie de session et les secrets de l'environnement,
// rien ne s'y pré-rend au build.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le refus d'un geste, lu dans l'adresse : seule une valeur FERMÉE de la liste est admise. */
function refusLu(valeur: string | undefined): RefusDeLaMiseEnDemeure | null {
  return valeur !== undefined && Object.hasOwn(MISE_EN_DEMEURE_CONSOLE.refus, valeur)
    ? (valeur as RefusDeLaMiseEnDemeure)
    : null;
}

async function Contenu({
  apporteurId,
  refus,
  enregistree,
}: {
  apporteurId: string;
  refus: RefusDeLaMiseEnDemeure | null;
  enregistree: boolean;
}) {
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const existe =
    UUID.test(apporteurId) &&
    (await d.prisma.apporteur.findUnique({ where: { id: apporteurId }, select: { id: true } })) !==
      null;
  const etat = !existe
    ? 'introuvable'
    : refus === 'statut_sans_contrat'
      ? 'hors_contrat'
      : 'nominal';
  return (
    <EcranMiseEnDemeure
      apporteurId={apporteurId}
      etat={etat}
      action={mettreEnDemeureDepuisLaConsole}
      refus={etat === 'nominal' ? refus : null}
      enregistree={enregistree}
      // Condition 6 de la sécurité : la clé d'idempotence est tirée par le SERVEUR, à chaque rendu.
      cleIdempotence={randomUUID()}
    />
  );
}

export default async function PageMiseEnDemeure({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refus?: string; envoi?: string }>;
}) {
  const { id } = await params;
  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict = await requireRole('ecran:mise_en_demeure', jeton, portsDeRoleConsole(d));
  if (!verdict.ok)
    redirect(
      verdict.motif === 'role_refuse'
        ? '/console/acces-refuse'
        : verdict.motif === 'releve_requis' && UUID.test(id)
          ? `/console/connexion?suite=${encodeURIComponent(`/console/apporteurs/${id}/mise-en-demeure`)}`
          : '/console/connexion'
    );
  const { refus, envoi } = await searchParams;
  return (
    <Suspense fallback={<ChargementDeLaMiseEnDemeure />}>
      <Contenu apporteurId={id} refus={refusLu(refus)} enregistree={envoi === 'enregistre'} />
    </Suspense>
  );
}
