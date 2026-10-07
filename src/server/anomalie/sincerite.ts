/**
 * SEC-14 (REQ-SEC-017, REQ-DM-033, REQ-SEC-036, REQ-JUR-031, REQ-JUR-040, REQ-SEC-020) — les
 * détecteurs de sincérité : CINQ signaux de CONTENU, un score, l'ouverture d'une anomalie.
 *
 * LE CRITÈRE DE TRI. Un signal qui décrit CE QUI EST DÉCLARÉ reste ; un signal qui décrit OÙ, QUAND
 * ou À QUEL RYTHME l'apporteur travaille sort du score (REQ-SEC-017, REQ-JUR-031). Les trois sortis
 * ne subsistent que comme critères de priorisation d'une revue humaine en console : ils n'ont pas de
 * poids lisible dans le réglage, n'entrent dans aucune alerte et dans aucun DTO.
 *
 * LE RÉGLAGE VIT HORS DU DÉPÔT (REQ-GOV-031). Les poids, le seuil et les paramètres des signaux sont
 * lus dans le secret conditionnel `PARTNERS_SINCERITE_REGLAGE` (`src/lib/env.ts`) : le dépôt est
 * public, et publiés ils indiqueraient comment rester en dessous. Ce module ne porte que la NATURE
 * des signaux. Absent, aucun dépôt n'est jugé : le défaut est fermé.
 *
 * LE FRANCHISSEMENT OUVRE UNE ANOMALIE ET RIEN D'AUTRE (REQ-SEC-017, REQ-DM-033). Aucun gel, aucune
 * révocation, aucun statut d'apporteur : seule une anomalie CONFIRMÉE par un humain a un effet, et
 * cet effet est écrit ailleurs (REQ-SEC-038).
 *
 * UN TRAITEMENT DISTINCT ET DIFFÉRÉ (texte de la juriste, rattrapage 85). L'ouverture n'a jamais lieu
 * dans la transaction du dépôt : un passage planifié relit les dépôts récents, et chaque ouverture
 * est sa propre transaction, qui n'écrit aucun événement de l'agrégat apporteur.
 *
 * LES CHAMPS INATTEIGNABLES (REQ-SEC-020, REQ-JUR-040, rattrapage 52). Le calcul ne lit ni la
 * position, ni le département, ni la région, ni la commune du siège, ni la zone ou le secteur de
 * l'apporteur, ni la date du contact, ni l'heure de l'appareil : la sélection les tait, et
 * `tests/unit/securite/signaux-de-sincerite.spec.ts` lit cette source et rougit sur un témoin qui
 * en lirait un.
 */
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { caracteresUtiles } from '../../domain/anomalie/regles';
import { ajouterEvenement } from '../evenement/journal';
import { normaliserNomDeDirigeant } from '../integrations/recherche-entreprises/projection';
import {
  decryptPii,
  empreinteRecherche,
  normaliserSegmentDeNom,
  type ClesPii,
} from '../securite/pii';

/** Les cinq signaux de CONTENU (REQ-SEC-017) : la liste FERMÉE de ce qui compose le score. */
export const SIGNAUX_DE_SINCERITE = [
  /** L'empreinte du nom du contact est celle d'un dirigeant rendu par l'API publique. */
  'contact_dirigeant',
  /** Le contact ne nomme personne : il n'est fait que de mots d'un service ou d'une fonction. */
  'contact_generique',
  /** Le contexte est trop court, ou identique à celui d'un autre dépôt du même apporteur. */
  'texte_court_ou_identique',
  /** La même empreinte réseau ET de navigateur, dans la même tranche, pour deux apporteurs. */
  'multi_identites',
  /** Une suite de dépôts aux SIREN croissants, ou aux raisons sociales dans l'ordre alphabétique. */
  'siren_ordonnes',
] as const;
export type SignalDeSincerite = (typeof SIGNAUX_DE_SINCERITE)[number];

/**
 * Les critères de priorisation d'une revue HUMAINE (REQ-SEC-017) : sortis du score, ils n'y ont
 * aucun poids — le réglage les refuse comme toute clé inconnue.
 */
export const CRITERES_DE_REVUE_HUMAINE = ['rafale', 'nocturne', 'hors_zone'] as const;

/** Les champs que le calcul n'atteint jamais (REQ-SEC-020, REQ-JUR-040, rattrapage 52). */
export const CHAMPS_INATTEIGNABLES = [
  'latitudeMicrodeg',
  'longitudeMicrodeg',
  'departement',
  'region',
  'communeSiege',
  'zone',
  'secteur',
  'dateContact',
  'clientCapturedAt',
] as const;

/** Le réglage lu hors du dépôt. Un signal sans poids pèse zéro : il ne compte pas. */
export type ReglageDeSincerite = {
  readonly seuil: number;
  readonly poids: Readonly<Record<SignalDeSincerite, number>>;
  /** Le minimum de caractères utiles d'un contexte. */
  readonly texteMin: number;
  /** La largeur de la tranche du signal multi-identités (REQ-SEC-036). */
  readonly trancheMinutes: number;
  /** La longueur d'une suite ordonnée qui fait signal. */
  readonly suiteMin: number;
  /** Jusqu'où, en arrière, un passage relit les dépôts. */
  readonly reculHeures: number;
};

/** L'échelle du score, tenue par la base (`anomalies_score_sincerite`). */
const ECHELLE = 100;

const BORNES = {
  seuil: [1, ECHELLE],
  texte_min: [1, 10_000],
  tranche_minutes: [1, 1_440],
  suite_min: [2, 1_000],
  recul_heures: [1, 8_784],
} as const;
type CleRequise = keyof typeof BORNES;
const CLES_REQUISES = Object.keys(BORNES) as CleRequise[];
const PREFIXE_DU_POIDS = 'poids.';

export class ReglageDeSinceriteInvalide extends Error {
  /** Le refus nomme la clé et un motif fermé ; jamais la valeur reçue. */
  constructor(
    cle: string,
    motif: 'forme' | 'inconnue' | 'en_double' | 'absente' | 'hors_bornes' | 'determinant_seul'
  ) {
    super(`reglage_de_sincerite_invalide : ${cle} ${motif}`);
    this.name = 'ReglageDeSinceriteInvalide';
  }
}

const FORME_D_UNE_PAIRE = /^([a-z_.]+)=(\d{1,5})$/;

/**
 * Lit le réglage : des paires `clé=entier` séparées par `;`. Les cinq clés de `BORNES` sont
 * requises ; `poids.<signal>` est facultatif, pour un signal de la liste fermée seulement. Le
 * signal multi-identités n'est jamais déterminant seul (REQ-SEC-036) : son poids reste sous le
 * seuil. `undefined` rend `null` — aucun réglage, rien n'est jugé.
 */
export function lireReglageDeSincerite(texte: string | undefined): ReglageDeSincerite | null {
  if (texte === undefined) return null;
  const lues = new Map<string, number>();
  for (const paire of texte.split(';')) {
    const m = FORME_D_UNE_PAIRE.exec(paire);
    if (m === null) throw new ReglageDeSinceriteInvalide('(forme)', 'forme');
    const [, cle, valeur] = m as unknown as [string, string, string];
    const connue =
      (CLES_REQUISES as string[]).includes(cle) ||
      (cle.startsWith(PREFIXE_DU_POIDS) &&
        (SIGNAUX_DE_SINCERITE as readonly string[]).includes(cle.slice(PREFIXE_DU_POIDS.length)));
    if (!connue) throw new ReglageDeSinceriteInvalide(cle, 'inconnue');
    if (lues.has(cle)) throw new ReglageDeSinceriteInvalide(cle, 'en_double');
    lues.set(cle, Number(valeur));
  }
  const requise = (cle: CleRequise): number => {
    const v = lues.get(cle);
    if (v === undefined) throw new ReglageDeSinceriteInvalide(cle, 'absente');
    const [min, max] = BORNES[cle];
    if (v < min || v > max) throw new ReglageDeSinceriteInvalide(cle, 'hors_bornes');
    return v;
  };
  const seuil = requise('seuil');
  const texteMin = requise('texte_min');
  const trancheMinutes = requise('tranche_minutes');
  const suiteMin = requise('suite_min');
  const reculHeures = requise('recul_heures');
  const poids = Object.fromEntries(
    SIGNAUX_DE_SINCERITE.map((s) => {
      const cle = `${PREFIXE_DU_POIDS}${s}`;
      const v = lues.get(cle) ?? 0;
      if (v > ECHELLE) throw new ReglageDeSinceriteInvalide(cle, 'hors_bornes');
      return [s, v];
    })
  ) as Record<SignalDeSincerite, number>;
  if (poids.multi_identites >= seuil) {
    throw new ReglageDeSinceriteInvalide(`${PREFIXE_DU_POIDS}multi_identites`, 'determinant_seul');
  }
  return { seuil, poids, texteMin, trancheMinutes, suiteMin, reculHeures };
}

/**
 * Ce que le calcul voit d'un dépôt, et RIEN d'autre : ce qui est déclaré, l'empreinte réseau et de
 * navigateur, l'instant du dépôt pour ordonner et grouper. Le contact est en clair dans la mémoire
 * du passage seulement ; il n'en sort jamais.
 */
export type DeclarationJugee = {
  readonly attributionId: string;
  readonly apporteurId: string;
  readonly siren: string;
  readonly raisonSociale: string | null;
  readonly deposeeAt: Date;
  readonly nomContact: string | null;
  readonly prenomContact: string | null;
  /** L'empreinte `nom_personne` du contact, au format de celle des dirigeants (INT-T09). */
  readonly empreinteNomContact: string | null;
  readonly empreintesDirigeants: readonly string[];
  readonly contexte: string | null;
  readonly ipHash: string | null;
  readonly agentHash: string | null;
};

/**
 * Les mots qui désignent un service, une fonction ou une adresse générique, jamais une personne —
 * comparés au segment de nom NORMALISÉ (majuscules, sans accents). Le signal porte sur le NOM du
 * contact ; la raison « adresse générique » de la vérification suggérée porte sur son adresse, et
 * n'entre pas dans ce score : les deux ne se cumulent pas.
 */
const MOTS_GENERIQUES: ReadonlySet<string> = new Set([
  'ACCUEIL',
  'ADMINISTRATION',
  'COMMERCIAL',
  'COMPTABILITE',
  'CONTACT',
  'DIRECTION',
  'ENTREPRISE',
  'INFO',
  'INFOS',
  'RECEPTION',
  'RESPONSABLE',
  'SECRETARIAT',
  'SERVICE',
  'SOCIETE',
  'STANDARD',
]);

function contactGenerique(d: DeclarationJugee): boolean {
  if (d.nomContact === null) return false;
  const mots = normaliserSegmentDeNom(`${d.nomContact} ${d.prenomContact ?? ''}`)
    .split(' ')
    .filter((m) => m !== '');
  return mots.length > 0 && mots.every((m) => MOTS_GENERIQUES.has(m));
}

/** Le contexte à la casse et aux blancs près : la forme qui juge deux textes identiques. */
const texteCompare = (texte: string) =>
  texte.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

function texteCourtOuIdentique(
  d: DeclarationJugee,
  memeApporteur: readonly DeclarationJugee[],
  reglage: ReglageDeSincerite
): boolean {
  if (d.contexte === null) return false;
  if (caracteresUtiles(d.contexte) < reglage.texteMin) return true;
  const forme = texteCompare(d.contexte);
  return memeApporteur.some(
    (v) =>
      v.attributionId !== d.attributionId &&
      v.contexte !== null &&
      texteCompare(v.contexte) === forme
  );
}

/** La tranche d'un instant, en nombre entier de tranches depuis l'origine — jamais une heure du jour. */
const trancheDe = (instant: Date, reglage: ReglageDeSincerite) =>
  Math.floor(instant.getTime() / (reglage.trancheMinutes * 60_000));

function multiIdentites(
  d: DeclarationJugee,
  voisines: readonly DeclarationJugee[],
  reglage: ReglageDeSincerite
): boolean {
  if (d.ipHash === null || d.agentHash === null) return false;
  const tranche = trancheDe(d.deposeeAt, reglage);
  return voisines.some(
    (v) =>
      v.apporteurId !== d.apporteurId &&
      v.ipHash === d.ipHash &&
      v.agentHash === d.agentHash &&
      trancheDe(v.deposeeAt, reglage) === tranche
  );
}

/**
 * Les membres d'une suite strictement croissante d'au moins `suiteMin` dépôts CONSÉCUTIFS, selon la
 * clé donnée ; une clé absente rompt la suite.
 */
function membresDeSuites(
  ordonnees: readonly DeclarationJugee[],
  cle: (d: DeclarationJugee) => string | null,
  suiteMin: number
): Set<string> {
  const membres = new Set<string>();
  let suite: DeclarationJugee[] = [];
  const clore = () => {
    if (suite.length >= suiteMin) for (const m of suite) membres.add(m.attributionId);
  };
  for (const d of ordonnees) {
    const k = cle(d);
    const precedente = suite.at(-1);
    const kPrecedente = precedente === undefined ? null : cle(precedente);
    if (k !== null && kPrecedente !== null && kPrecedente < k) {
      suite.push(d);
    } else {
      clore();
      suite = k === null ? [] : [d];
    }
  }
  clore();
  return membres;
}

function sirenOrdonnes(
  d: DeclarationJugee,
  memeApporteur: readonly DeclarationJugee[],
  reglage: ReglageDeSincerite
): boolean {
  const ordonnees = [...memeApporteur].sort(
    (a, b) =>
      a.deposeeAt.getTime() - b.deposeeAt.getTime() ||
      a.attributionId.localeCompare(b.attributionId)
  );
  const parSiren = membresDeSuites(ordonnees, (v) => v.siren, reglage.suiteMin);
  const parNom = membresDeSuites(
    ordonnees,
    (v) => (v.raisonSociale === null ? null : normaliserSegmentDeNom(v.raisonSociale) || null),
    reglage.suiteMin
  );
  return parSiren.has(d.attributionId) || parNom.has(d.attributionId);
}

/**
 * Les signaux PRÉSENTS sur un dépôt, dans l'ordre de la liste fermée. `voisines` est l'ensemble des
 * dépôts relus par le passage (le dépôt jugé compris) : les signaux qui comparent un dépôt aux
 * autres ne lisent qu'elles.
 */
export function signauxDeSincerite(
  d: DeclarationJugee,
  voisines: readonly DeclarationJugee[],
  reglage: ReglageDeSincerite
): SignalDeSincerite[] {
  const memeApporteur = voisines.filter((v) => v.apporteurId === d.apporteurId);
  const presents: Record<SignalDeSincerite, boolean> = {
    contact_dirigeant:
      d.empreinteNomContact !== null && d.empreintesDirigeants.includes(d.empreinteNomContact),
    contact_generique: contactGenerique(d),
    texte_court_ou_identique: texteCourtOuIdentique(d, memeApporteur, reglage),
    multi_identites: multiIdentites(d, voisines, reglage),
    siren_ordonnes: sirenOrdonnes(d, memeApporteur, reglage),
  };
  return SIGNAUX_DE_SINCERITE.filter((s) => presents[s]);
}

/** Le score : la somme des poids des signaux présents, bornée à l'échelle de la base. */
export function scoreDeSincerite(
  signaux: readonly SignalDeSincerite[],
  reglage: ReglageDeSincerite
): number {
  return Math.min(
    ECHELLE,
    signaux.reduce((somme, s) => somme + reglage.poids[s], 0)
  );
}

// ── le passage : relire, juger, ouvrir ──────────────────────────────────────────────────────────

/** Le modèle des blocs chiffrés d'une attribution, tel que `colonnesPii` les a liés. */
const MODELE = 'attribution';

function dechiffrer(
  id: string,
  champ: string,
  bloc: Uint8Array | null,
  cles: ClesPii
): string | null {
  return bloc === null ? null : decryptPii({ modele: MODELE, champ, id }, bloc, cles);
}

/** Les empreintes des dirigeants, lues dans `dirigeants_json` ; une forme inattendue n'en rend aucune. */
function empreintesDesDirigeants(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((d: unknown) =>
    typeof d === 'object' &&
    d !== null &&
    typeof (d as { empreinte?: unknown }).empreinte === 'string'
      ? [(d as { empreinte: string }).empreinte]
      : []
  );
}

function empreinteDuContact(
  nom: string | null,
  prenom: string | null,
  cles: ClesPii
): string | null {
  if (nom === null) return null;
  try {
    return empreinteRecherche('nom_personne', normaliserNomDeDirigeant(nom, prenom), cles);
  } catch {
    // Un nom vide après normalisation n'a pas d'empreinte : il ne peut égaler aucun dirigeant.
    return null;
  }
}

/**
 * Le passage planifié : relit les dépôts d'apporteurs des `reculHeures` dernières heures, juge
 * chacun, et ouvre une anomalie `sincerite` pour chaque score au seuil ou au-dessus — une seule par
 * attribution, quel que soit son statut. Chaque ouverture est SA transaction : l'anomalie et son
 * événement d'ouverture, sur l'agrégat `anomalie`, rien d'autre.
 */
export async function ouvrirLesAnomaliesDeSincerite(
  prisma: PrismaClient,
  p: { maintenant: Date; reglage: ReglageDeSincerite | null; cles: ClesPii }
): Promise<{ jugees: number; ouvertes: number }> {
  const { maintenant, reglage, cles } = p;
  if (reglage === null) return { jugees: 0, ouvertes: 0 };
  const depuis = new Date(maintenant.getTime() - reglage.reculHeures * 3_600_000);
  const lignes = await prisma.attribution.findMany({
    where: { apporteurId: { not: null }, deposeeAt: { gte: depuis, lte: maintenant } },
    select: {
      id: true,
      apporteurId: true,
      siren: true,
      raisonSociale: true,
      deposeeAt: true,
      ipHash: true,
      agentHash: true,
      dirigeantsJson: true,
      nomContactChiffre: true,
      prenomContactChiffre: true,
      contexteChiffre: true,
    },
    orderBy: [{ deposeeAt: 'asc' }, { id: 'asc' }],
  });
  const declarations: DeclarationJugee[] = lignes.map((l) => {
    const nomContact = dechiffrer(l.id, 'nomContactChiffre', l.nomContactChiffre, cles);
    const prenomContact = dechiffrer(l.id, 'prenomContactChiffre', l.prenomContactChiffre, cles);
    return {
      attributionId: l.id,
      apporteurId: l.apporteurId as string,
      siren: l.siren,
      raisonSociale: l.raisonSociale,
      deposeeAt: l.deposeeAt,
      nomContact,
      prenomContact,
      empreinteNomContact: empreinteDuContact(nomContact, prenomContact, cles),
      empreintesDirigeants: empreintesDesDirigeants(l.dirigeantsJson),
      contexte: dechiffrer(l.id, 'contexteChiffre', l.contexteChiffre, cles),
      ipHash: l.ipHash,
      agentHash: l.agentHash,
    };
  });

  const aOuvrir = declarations.flatMap((d) => {
    const score = scoreDeSincerite(signauxDeSincerite(d, declarations, reglage), reglage);
    return score >= reglage.seuil ? [{ d, score }] : [];
  });

  let ouvertes = 0;
  for (const { d, score } of aOuvrir) {
    const ouverte = await prisma.$transaction(async (tx) => {
      const deja = await tx.anomalie.findFirst({
        where: { type: 'sincerite', attributionId: d.attributionId },
        select: { id: true },
      });
      if (deja !== null) return false;
      const id = randomUUID();
      await tx.anomalie.create({
        data: {
          id,
          type: 'sincerite',
          score,
          apporteurId: d.apporteurId,
          attributionId: d.attributionId,
          statut: 'ouverte',
          ouverteAt: maintenant,
        },
      });
      await ajouterEvenement(tx, {
        type: 'anomalie_statut_modifie',
        agregat: 'anomalie',
        agregatId: id,
        survenuAt: maintenant,
        charge: { de: null, vers: 'ouverte', acteur: { par: 'systeme' } },
      });
      return true;
    });
    if (ouverte) ouvertes += 1;
  }
  return { jugees: declarations.length, ouvertes };
}
