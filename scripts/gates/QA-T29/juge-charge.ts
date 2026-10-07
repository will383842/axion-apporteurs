/**
 * REQ-QA-005 — le juge du test de charge léger : cinquante dépôts simultanés sur un même SIREN.
 *
 * Il est PUR : il lit des mesures prises par le banc en base réelle
 * (`tests/integration/charge-depots-meme-siren.spec.ts`) et rend la liste de ce qui est faux, vide si
 * tout est juste. Il ne démarre rien et n'importe pas le client Prisma.
 *
 * CE QU'IL EXIGE, dans l'ordre de ce que le dépôt doit à REQ-QA-005 et à la course de vingt dépôts de `concurrence.spec.ts` :
 *   — UN SEUL occupant (l'index partiel sur les états occupants a tenu sous la course) ;
 *   — la file derrière lui est PLEINE (`PLACES_DE_LA_FILE`), ses rangs sont 1, 2… sans doublon ni trou, et
 *     `deposee_at` croît strictement dans l'ordre des rangs (le verrou consultatif par SIREN sérialise) ;
 *   — tous les autres dépôts sont REFUSÉS, et chaque refus est TRACÉ (`file_complete`) ;
 *   — UNE demande de confirmation, celle de l'occupant ;
 *   — AUCUN dépôt en échec (verrou perdu, blocage mutuel, délai) : une course qui lève une erreur n'a
 *     pas prouvé l'exclusion, elle l'a évitée ;
 *   — la durée sous un plafond : « léger » est une mesure, pas une épithète.
 *
 * LE NOMBRE DE PLACES N'EST PAS RECOPIÉ : le banc le passe, tiré de `PLACES_DE_LA_FILE` (RM-01). Le juge
 * n'importe rien de `src/` : un import ferait entrer ce module dans la couverture du domaine.
 */
/** Le nombre de dépôts simultanés de la tâche. */
export const DEPOTS_SIMULTANES = 50;

/**
 * Le plafond de durée de la course, en millisecondes. Large à dessein : le banc tourne sur un poste
 * partagé de CI ; il écarte un verrou qui s'enlise, pas une variation de machine.
 */
export const DUREE_MAX_MS = 30_000;

/** Les états occupants lus par le banc sur la base, hors file d'attente. */
const STATUTS_DE_LA_FILE = 'en_attente';

export type LigneMesuree = {
  statut: string;
  rangAttente: number | null;
  deposeeAt: Date;
};

export type MesureDeCharge = {
  /** Le nombre de dépôts lancés. */
  depots: number;
  /** Les places de la file derrière l'occupant (`PLACES_DE_LA_FILE`), passées par le banc. */
  places: number;
  /** Le compte des issues rendues, par nom d'issue. */
  issues: Record<string, number>;
  /** Les dépôts qui ont levé une erreur ou rendu « réessayer ». */
  echecs: number;
  /** Les lignes d'attribution du SIREN, dans l'ordre de `deposee_at`. */
  lignes: LigneMesuree[];
  /** Les refus `file_complete` tracés pour ce SIREN. */
  refusFileComplete: number;
  /** Les demandes de confirmation des attributions de ce SIREN. */
  demandesDeConfirmation: number;
  dureeMs: number;
};

export function jugerLaCharge(m: MesureDeCharge): string[] {
  const fautes: string[] = [];
  const enFile = m.lignes.filter((l) => l.statut === STATUTS_DE_LA_FILE);
  const occupants = m.lignes.filter((l) => l.statut !== STATUTS_DE_LA_FILE);
  const refuses = m.depots - 1 - m.places;

  if (m.echecs > 0) fautes.push(`échec : ${m.echecs} dépôt(s) en erreur ou à réessayer`);
  if (occupants.length !== 1) {
    fautes.push(
      `occupant : ${occupants.length} lignes occupantes sur le SIREN, une seule attendue`
    );
  }
  if (enFile.length !== m.places) {
    fautes.push(`file : ${enFile.length} en attente, ${m.places} attendues`);
  }
  const rangs = enFile.map((l) => l.rangAttente);
  const attendus = enFile.map((_, i) => i + 1);
  if (JSON.stringify([...rangs].sort((a, b) => (a ?? 0) - (b ?? 0))) !== JSON.stringify(attendus)) {
    fautes.push(`rang : ${JSON.stringify(rangs)} au lieu de ${JSON.stringify(attendus)}`);
  }
  const instants = m.lignes.map((l) => l.deposeeAt.getTime());
  if (instants.some((t, i) => i > 0 && !(instants[i - 1]! < t))) {
    fautes.push('deposee_at : ne croît pas strictement dans l’ordre des rangs');
  }

  const attendues: Record<string, number> = {
    enregistree: 1,
    en_attente: m.places,
    file_complete: refuses,
  };
  const noms = new Set([...Object.keys(attendues), ...Object.keys(m.issues)]);
  for (const nom of [...noms].sort()) {
    const lu = m.issues[nom] ?? 0;
    const voulu = attendues[nom] ?? 0;
    if (lu !== voulu) fautes.push(`issue : ${nom} = ${lu}, ${voulu} attendue(s)`);
  }
  if (m.refusFileComplete !== refuses) {
    fautes.push(`refus : ${m.refusFileComplete} tracés, ${refuses} attendus`);
  }
  if (m.demandesDeConfirmation !== 1) {
    fautes.push(
      `demande : ${m.demandesDeConfirmation} demandes de confirmation, une seule attendue`
    );
  }
  if (m.dureeMs > DUREE_MAX_MS) {
    fautes.push(`durée : ${m.dureeMs} ms au-delà du plafond de ${DUREE_MAX_MS} ms`);
  }
  return fautes;
}
