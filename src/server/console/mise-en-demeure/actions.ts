'use server';
/**
 * UX-P1-57 — l'action de l'écran « Mettre en demeure ». Elle pose SA question à `requireRole`
 * (`action:mettre_en_demeure`, l'admin seul, sous step-up : conditions de la sécurité, #703) AVANT
 * tout travail, puis REJUGE le droit en base dans la transaction ; le geste lui-même est celui de
 * SEC-19 (`mettreEnDemeure`), avec son fait au journal et sa notification dans la même transaction.
 *
 * L'article est pris dans la liste FERMÉE et revalidé ici. Les faits sont jugés À LA SAISIE (juriste) :
 * vides, ou au-delà de `FAITS_ANOMALIE_CARACTERES_MAX` en points de code, ils reviennent à l'écran avec
 * un refus nommé, sans rien écrire. Les faits ne sortent jamais vers l'adresse : un refus ne porte que
 * son code. Rien ici ne lit ni ne compte les mises en demeure (art. 11.2).
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireRole, type VerdictDeRole } from '../../roles/require-role';
import { roleAutorise } from '../../roles/matrice';
import {
  COOKIE_DE_SESSION_CONSOLE,
  dependancesDuProcessus,
  portsDeRoleConsole,
} from '../../auth/lien-magique-production';
import { clesPii } from '../../securite/pii';
import { faitsPourLeCourriel } from '../../attribution/notifications';
import { ErreurResiliation, mettreEnDemeure } from '../../apporteur/resiliation';
import {
  ARTICLES_MISE_EN_DEMEURE,
  type ArticleMiseEnDemeure,
} from '../../../domain/apporteur/resiliation';
import { MISE_EN_DEMEURE_CONSOLE } from '../../../content/micro-copy/console/mise-en-demeure';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texte(formData: FormData, cle: string): string {
  const v = formData.get(cle);
  return typeof v === 'string' ? v : '';
}

/** Les faits À LA SAISIE : vides, ou trop longs une fois nettoyés, ils sont refusés, nommés. */
function refusDesFaits(faits: string): 'faits_vides' | 'faits_trop_longs' | null {
  if (faits.trim() === '') return 'faits_vides';
  return faitsPourLeCourriel(faits) === null ? 'faits_trop_longs' : null;
}

/** Le droit retiré entre le juge et la transaction : retour à l'accueil, rien n'est écrit. */
class DroitAbsent extends Error {
  constructor() {
    super('droit_absent');
    this.name = 'DroitAbsent';
  }
}

/**
 * Condition de la sécurité : `mettreEnDemeure` ne rejuge pas le rôle. L'acteur est RELU dans la
 * transaction du geste (rôle, désactivation, validation d'un administrateur), et le droit rejugé par
 * la matrice, avant toute écriture.
 */
async function rejugerLeDroit(tx: Prisma.TransactionClient, acteurId: string): Promise<void> {
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteurId },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    !roleAutorise('action:mettre_en_demeure', lu.role) ||
    (lu.role === 'admin' && lu.valideAt === null)
  )
    throw new DroitAbsent();
}

export async function mettreEnDemeureDepuisLaConsole(formData: FormData): Promise<void> {
  const apporteurId = texte(formData, 'apporteurId');
  if (!UUID.test(apporteurId)) redirect('/console');
  const ecran = `/console/apporteurs/${apporteurId}/mise-en-demeure`;

  const d = dependancesDuProcessus({ apres: after, env: process.env });
  const jeton = (await cookies()).get(COOKIE_DE_SESSION_CONSOLE.nom)?.value;
  const verdict: VerdictDeRole = await requireRole(
    'action:mettre_en_demeure',
    jeton,
    portsDeRoleConsole(d)
  );
  if (!verdict.ok) {
    if (verdict.motif === 'releve_requis')
      redirect(`/console/connexion?suite=${encodeURIComponent(ecran)}`);
    redirect('/console');
  }

  const article = texte(formData, 'article');
  if (!(ARTICLES_MISE_EN_DEMEURE as readonly string[]).includes(article))
    redirect(`${ecran}?refus=article_hors_liste`);
  const faits = texte(formData, 'faits');
  const refus = refusDesFaits(faits);
  if (refus !== null) redirect(`${ecran}?refus=${refus}`);

  const acteurId = verdict.utilisateur.id;
  try {
    await d.prisma.$transaction(async (tx) => {
      await rejugerLeDroit(tx, acteurId);
      return mettreEnDemeure(
        tx,
        {
          apporteurId,
          article: article as ArticleMiseEnDemeure,
          faits,
          acteur: { par: 'utilisateur_console', id: acteurId },
          maintenant: new Date(d.horloge.maintenant()),
        },
        clesPii(d.env)
      );
    });
  } catch (e) {
    if (e instanceof DroitAbsent) redirect('/console');
    // Un refus de SEC-19 que l'écran sait dire revient, nommé ; tout autre échec n'est pas avalé.
    if (e instanceof ErreurResiliation && Object.hasOwn(MISE_EN_DEMEURE_CONSOLE.refus, e.code))
      redirect(`${ecran}?refus=${e.code}`);
    throw e;
  }
  redirect(`${ecran}?envoi=enregistre`);
}
