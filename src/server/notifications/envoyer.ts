/**
 * L'envoi d'une notification à l'apporteur — UX-P1-10 (REQ-UX-016, REQ-JUR-039, REQ-UX-038).
 *
 * UNE NOTIFICATION, TROIS GESTES, DANS CET ORDRE :
 *   1. le RENDU : la clé est une clé de la table (`table-ssot.ts`), les paramètres sont EXACTEMENT
 *      ceux que ses textes nomment (`src/content/micro-copy/courriels/notifications.ts`), chacun une
 *      ligne visible et bornée — un saut de ligne dans un sujet est une injection d'en-tête. Tout
 *      écart lève `NotificationRefusee` AVANT toute écriture : c'est une faute du code émetteur ;
 *   2. l'ESPACE : une ligne de `notifications_espace`, écrite PAR LA COUCHE CLOISONNÉE de l'apporteur
 *      destinataire — l'attribution citée y est une référence vérifiée, jamais celle d'un autre ;
 *   3. le COURRIEL, par l'émetteur existant (`demanderEnvoi`, INT-T10), qui consigne sa ligne et sa
 *      date d'envoi — LA date qui fait courir un délai. Une clé DÉSACTIVABLE que l'apporteur a
 *      désactivée n'en demande pas, et le dit (`desactive_par_preference`). Une clé OBLIGATOIRE part
 *      quelle que soit la préférence : la table l'interdit de désactivation, et l'écriture d'une
 *      préférence le refuse en amont.
 *
 * `lueAt` n'est lu ici par rien, et aucun délai ne s'y appuie (garde `notifications-lue-at-inerte`).
 */
import type { StatutCourriel } from '@prisma/client';
import { FAITS_ANOMALIE_CARACTERES_MAX, SEUILS } from '../../domain/seuils/ssot';
import {
  CORPS_DE_LA_LIBERATION,
  MOTIFS_DES_DECISIONS,
  TEXTES_DES_NOTIFICATIONS,
  PARAGRAPHES_DE_LA_RESILIATION,
  PARAGRAPHE_COMMUN_DE_LA_RESILIATION,
  type CauseDeLiberation,
} from '../../content/micro-copy/courriels/notifications';
import type { MotifResiliation } from '../../domain/apporteur/statut';
import type { AccesApporteur } from '../acces/for-apporteur';
import type { DemandeDEnvoi } from '../integrations/zeptomail/emetteur';
import { habillerLeCourriel } from '../email/chassis';
import {
  GABARITS,
  schemaGabarit,
  schemaPreferenceNotification,
  estGabaritDeLApporteur,
  type GabaritDeLApporteur,
  type LigneDeNotification,
} from './table-ssot';

export const MOTIFS_DE_REFUS = [
  'cle_inconnue',
  'parametre_manquant',
  'parametre_en_trop',
  'parametre_invalide',
  'cause_manquante',
  'cause_en_trop',
] as const;
export type MotifDeRefus = (typeof MOTIFS_DE_REFUS)[number];

export class NotificationRefusee extends Error {
  constructor(
    readonly motif: MotifDeRefus,
    readonly detail: string
  ) {
    super(`notification_refusee : ${motif} (${detail})`);
    this.name = 'NotificationRefusee';
  }
}

export type TexteRendu = { titre: string; appel: string; corps: string | null };

const PARAMETRE = /\{([a-zA-Z]+)\}/g;
/**
 * Une valeur : une ligne, visible, bornée — ni caractère de contrôle (catégorie Unicode Cc, dont le
 * saut de ligne), ni caractère de FORMAT (catégorie Cf : U+202E et les isolats retournent un sujet,
 * U+200B le cachent).
 */
const VALEUR = /^[^\p{Cc}\p{Cf}]+$/u;

/** La longueur d'une valeur, en points de code. */
const LONGUEUR_DE_VALEUR_MAX = 300;

/**
 * DM-55 (arbitrage de la sécurité) : `{motif}` d'une décision porte les faits retenus, bornés par
 * `FAITS_ANOMALIE_CARACTERES_MAX` ; sa borne est celle des faits plus le plus long gabarit de motif,
 * dérivée de leurs sources. Toute autre valeur garde la borne commune.
 */
export const LONGUEUR_DU_MOTIF_MAX =
  FAITS_ANOMALIE_CARACTERES_MAX.valeur +
  Math.max(...Object.values(MOTIFS_DES_DECISIONS).map((t) => [...t].length));

/**
 * SEC-19 : les `{faits}` d'une mise en demeure suivent les règles de `{faits}` de DM-55 (A02, #703) —
 * et, SEC-15, ceux d'une suspension —
 * la même borne, `FAITS_ANOMALIE_CARACTERES_MAX`. Toute autre clé garde la borne commune.
 */
const borneDe = (cle: GabaritDeLApporteur, parametre: string): number =>
  parametre === 'motif'
    ? LONGUEUR_DU_MOTIF_MAX
    : (cle === 'mise_en_demeure' || cle === 'suspension_declarations') && parametre === 'faits'
      ? FAITS_ANOMALIE_CARACTERES_MAX.valeur
      : LONGUEUR_DE_VALEUR_MAX;

function cleDeLaTable(cle: string): GabaritDeLApporteur {
  const lue = schemaGabarit.safeParse(cle);
  // SEC-29 : la clé du courriel de la console n'est pas une notification de l'apporteur.
  if (!lue.success || !estGabaritDeLApporteur(lue.data))
    throw new NotificationRefusee('cle_inconnue', cle);
  return lue.data;
}

/** Un nombre de 1 à 69, en toutes lettres : les délais du contrat. Au-delà, refusé : à étendre. */
function enToutesLettres(n: number): string {
  const unites = [
    '',
    'un',
    'deux',
    'trois',
    'quatre',
    'cinq',
    'six',
    'sept',
    'huit',
    'neuf',
    'dix',
    'onze',
    'douze',
    'treize',
    'quatorze',
    'quinze',
    'seize',
  ];
  const dizaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  if (!Number.isInteger(n) || n < 1 || n > 69)
    throw new RangeError(`hors des délais écrits : ${n}`);
  if (n <= 16) return unites[n]!;
  if (n < 20) return `dix-${unites[n - 10]!}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return dizaines[d]!;
  return u === 1 ? `${dizaines[d]!} et un` : `${dizaines[d]!}-${unites[u]!}`;
}

/**
 * Les paramètres qu'un délai du contrat remplit : posés ICI depuis la SSOT (RM-10), jamais fournis
 * par l'émetteur, qui ne pourrait que les retaper.
 */
export const PARAMETRES_DE_LA_SSOT: Readonly<Record<string, string>> = {
  delaiReponse: `${SEUILS.REPONSE_CONTESTATION_JOURS.valeur} ${SEUILS.REPONSE_CONTESTATION_JOURS.unite}`,
  // SEC-19 (juriste, #703) : le délai de la mise en demeure, rendu EN TOUTES LETTRES.
  delaiMiseEnDemeure: `${enToutesLettres(SEUILS.MISE_EN_DEMEURE_JOURS.valeur)} ${SEUILS.MISE_EN_DEMEURE_JOURS.unite}`,
};

/**
 * Ce qui choisit un corps : la cause de la fin d'une attribution, ou le motif d'une résiliation.
 */
export type CauseDuCorps = CauseDeLiberation | MotifResiliation;

/**
 * Le corps d'une clé. Celui d'`attribution_liberee` dépend de la CAUSE de la fin (A07, 2026-10-02) ;
 * celui de `resiliation`, du MOTIF de la résiliation (SEC-19, juriste) : le paragraphe du motif,
 * puis le paragraphe commun. L'émettrice le donne, faute de quoi la notification est refusée.
 * Aucune autre clé n'en reçoit.
 */
function corpsDe(cle: GabaritDeLApporteur, cause: string | undefined): string | null {
  if (cle === 'resiliation') {
    if (cause === undefined || !Object.hasOwn(PARAGRAPHES_DE_LA_RESILIATION, cause))
      throw new NotificationRefusee('cause_manquante', String(cause));
    return `${PARAGRAPHES_DE_LA_RESILIATION[cause as MotifResiliation]} ${PARAGRAPHE_COMMUN_DE_LA_RESILIATION}`;
  }
  if (cle !== 'attribution_liberee') {
    if (cause !== undefined) throw new NotificationRefusee('cause_en_trop', cause);
    return TEXTES_DES_NOTIFICATIONS[cle].corps;
  }
  if (cause === undefined || !Object.hasOwn(CORPS_DE_LA_LIBERATION, cause))
    throw new NotificationRefusee('cause_manquante', String(cause));
  return CORPS_DE_LA_LIBERATION[cause as CauseDeLiberation];
}

/** Les paramètres que l'ÉMETTEUR fournit pour une clé, triés : ceux des textes, hors SSOT. */
export function parametresDe(cle: GabaritDeLApporteur, cause?: CauseDuCorps): string[] {
  const t = TEXTES_DES_NOTIFICATIONS[cle];
  const noms = [t.titre, t.appel, corpsDe(cle, cause) ?? ''].flatMap((x) =>
    [...x.matchAll(PARAMETRE)].map((m) => m[1]!)
  );
  return [...new Set(noms)].filter((p) => !Object.hasOwn(PARAMETRES_DE_LA_SSOT, p)).sort();
}

export function rendreLaNotification(
  cle: string,
  parametres: Readonly<Record<string, string>>,
  cause?: CauseDuCorps
): TexteRendu {
  const c = cleDeLaTable(cle);
  const corps = corpsDe(c, cause);
  const attendus = parametresDe(c, cause);
  const fournis = Object.keys(parametres);
  const manquant = attendus.find((p) => !Object.hasOwn(parametres, p));
  if (manquant !== undefined) throw new NotificationRefusee('parametre_manquant', manquant);
  const enTrop = fournis.find((p) => !attendus.includes(p));
  if (enTrop !== undefined) throw new NotificationRefusee('parametre_en_trop', enTrop);
  for (const p of attendus) {
    const v: unknown = parametres[p];
    if (typeof v !== 'string' || !VALEUR.test(v) || [...v].length > borneDe(c, p))
      throw new NotificationRefusee('parametre_invalide', p);
  }
  const valeurs: Readonly<Record<string, string>> = { ...parametres, ...PARAMETRES_DE_LA_SSOT };
  const remplir = (x: string) => x.replace(PARAMETRE, (_, nom: string) => valeurs[nom]!);
  const t = TEXTES_DES_NOTIFICATIONS[c];
  return {
    titre: remplir(t.titre),
    appel: remplir(t.appel),
    corps: corps === null ? null : remplir(corps),
  };
}

export type IssueDuCourriel = StatutCourriel | 'desactive_par_preference';

export type AccesDeLaNotification = {
  readonly apporteurId: string;
  readonly notificationEspace: Pick<AccesApporteur['notificationEspace'], 'creer'>;
  readonly preferenceNotification: Pick<
    AccesApporteur['preferenceNotification'],
    'lister' | 'creer' | 'modifier'
  >;
};

export interface DependancesDeLaNotification {
  /** La couche cloisonnée de l'apporteur DESTINATAIRE. */
  acces: AccesDeLaNotification;
  /** L'émetteur de courriels (`demanderEnvoi` lié à ses dépendances). */
  envoyerCourriel: (demande: DemandeDEnvoi) => Promise<StatutCourriel>;
  /** L'adresse publique de l'espace, sur laquelle se pose la route de l'appel à l'action. */
  urlDeLEspace: URL;
}

export interface DemandeDeNotification {
  cle: string;
  /** L'adresse de l'apporteur, déchiffrée par l'émetteur appelant ; jamais écrite ici. */
  a: string;
  parametres: Readonly<Record<string, string>>;
  attributionId: string | null;
  /** La cause de la fin, pour `attribution_liberee` (A07) ; le motif, pour `resiliation` (SEC-19). */
  cause?: CauseDuCorps;
}

/**
 * UX-P1-64 : un courriel composé — le sujet, le corps en texte (la version de repli, toujours jointe),
 * et son HTML habillé du châssis commun quand il en a un.
 */
export type CourrielCompose = { sujet: string; corps: string; html?: string };

/**
 * La composition d'un courriel de notification, UNE fois pour tous ses émetteurs (`notifier()` et
 * le passage d'envoi de DM-55) : le titre en sujet ; le corps, puis l'appel à l'action suivi du lien
 * de sa route quand elle existe.
 */
export function composerLeCourriel(
  cle: string,
  texte: TexteRendu,
  urlDeLEspace: URL
): CourrielCompose {
  const route = GABARITS[cleDeLaTable(cle)].route;
  const lien = route === null ? null : new URL(route, urlDeLEspace).href;
  const corps = [texte.corps, lien === null ? texte.appel : `${texte.appel} : ${lien}`]
    .filter((x): x is string => x !== null)
    .join('\n\n');
  // UX-P1-64 : le même courriel, habillé du châssis commun, famille C (l'apporteur, sous contrat).
  const { html } = habillerLeCourriel({
    famille: 'C',
    preEnTete: texte.corps ?? texte.appel,
    titre: texte.titre,
    paragraphes: texte.corps === null ? [] : texte.corps.split('\n\n'),
    ...(lien === null ? {} : { appel: { libelle: texte.appel, href: lien } }),
  });
  return { sujet: texte.titre, corps, html };
}

export async function notifier(
  demande: DemandeDeNotification,
  d: DependancesDeLaNotification
): Promise<{ notificationId: string | null; courriel: IssueDuCourriel | null }> {
  const texte = rendreLaNotification(demande.cle, demande.parametres, demande.cause);
  const cle = cleDeLaTable(demande.cle);
  const ligne: LigneDeNotification = GABARITS[cle];

  let notificationId: string | null = null;
  if (ligne.canaux.includes('espace')) {
    const creee = await d.acces.notificationEspace.creer({
      cle,
      attributionId: demande.attributionId,
    });
    notificationId = creee.id;
  }

  if (!ligne.canaux.includes('email')) return { notificationId, courriel: null };
  if (ligne.desactivable) {
    const [preference] = await d.acces.preferenceNotification.lister({
      where: { cle },
      take: 1,
    });
    if (preference?.active === false)
      return { notificationId, courriel: 'desactive_par_preference' };
  }
  const { sujet, corps, html } = composerLeCourriel(cle, texte, d.urlDeLEspace);
  const courriel = await d.envoyerCourriel({
    gabarit: cle,
    a: demande.a,
    sujet,
    corps,
    ...(html === undefined ? {} : { html }),
    apporteurId: d.acces.apporteurId,
  });
  return { notificationId, courriel };
}

/** La violation de la contrainte `preferences_notification_apporteur_cle_unique`. */
function violeLUnicite(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

/**
 * L'écriture d'une préférence : un UPSERT sur (apporteur, clé), PAR la couche cloisonnée — l'apporteur
 * est celui de la couche, jamais une valeur lue de la saisie. Une clé obligatoire à `active = false`
 * est refusée par Zod AVANT tout appel. Deux écritures concurrentes : la seconde création viole la
 * contrainte unique, et devient une modification de la ligne que la première a écrite.
 */
export async function ecrirePreference(
  acces: Pick<AccesDeLaNotification, 'preferenceNotification'>,
  saisie: unknown,
  maintenant: Date
): Promise<'creee' | 'modifiee'> {
  const p = schemaPreferenceNotification.parse(saisie);
  const vue = acces.preferenceNotification;
  const modifier = async (): Promise<'modifiee' | null> => {
    const [existante] = await vue.lister({ where: { cle: p.cle }, take: 1 });
    if (existante === undefined) return null;
    await vue.modifier(existante.id, { active: p.active, modifieeAt: maintenant });
    return 'modifiee';
  };
  if ((await modifier()) !== null) return 'modifiee';
  try {
    await vue.creer({ cle: p.cle, active: p.active, modifieeAt: maintenant });
    return 'creee';
  } catch (e) {
    if (!violeLUnicite(e)) throw e;
    const issue = await modifier();
    if (issue === null) throw e;
    return issue;
  }
}
