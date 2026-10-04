/**
 * La réconciliation avec axion-ia — INT-T08-P (REQ-INT-012, REQ-INT-013). Elle porte le job
 * quotidien de REQ-INT-013 pour la nomination INTERNE des `event_id` manquants (rattrapage 81) ; la
 * comparaison des encaissements par SIREN reste à INT-T73-P.
 *
 * UN PASSAGE. Partners relit la file de sortie d'axion-ia (`relecture.ts`) depuis la plus haute
 * séquence qu'il a REÇUE, moins `RECOUVREMENT_SEQUENCES`, page après page, au plus
 * `PAGES_MAX_PAR_PASSAGE` pages. Toute ligne relue
 * dont l'`event_id` n'a jamais été inscrit dans `evenements_recus` est un TROU : il est signalé, et
 * son rejeu est demandé à axion-ia (`POST /api/partners/reconciliation`, INT-T08-A de l'autre dépôt),
 * qui réarme la ligne de sa file : le MÊME corps repart, sous l'identifiant d'ORIGINE, par le relais
 * signé, et la réception de Partners le déduplique. Rien n'est reconstruit ici, rien n'est inscrit
 * en dehors de la porte des webhooks.
 *
 * LES SIGNAUX. Une relecture qui échoue (`relecture_echouee`) ou un rejeu refusé (`rejeu_echoue`)
 * font ÉCHOUER le passage : son battement le dit, et le passage suivant reprend du même curseur. Un
 * trou rattrapé (`trou_rattrape`) et une relecture arrêtée par sa borne (`relecture_bornee`) sont
 * signalés sans échec. Un signal ne porte qu'un genre, un motif fermé et un nombre : ni identifiant
 * d'événement, ni charge. Les identifiants partent à axion-ia, dans la demande de rejeu, et nulle
 * part ailleurs.
 *
 * LES COMPTEURS sont rendus même quand tout va bien : c'est le battement de la tâche qui les porte.
 */
import type { PrismaClient } from '@prisma/client';
import type { CanalAxionia, LirePage, MotifDeRelecture } from './relecture';
import { appelSigne } from './relecture';

/** Le chemin de la route de rejeu d'axion-ia. */
export const CHEMIN_REJEU = '/api/partners/reconciliation';

/**
 * La borne d'une demande de rejeu : cent identifiants, celle du serveur (`REJEU_MAX_PAR_APPEL` de la
 * route d'axion-ia), qui refuse au-delà.
 */
export const REJEU_MAX_PAR_APPEL = 100;

/**
 * La borne d'un passage : dix pages, soit mille lignes à la borne d'une page. Au-delà, le passage
 * s'arrête, le signale, et le suivant reprend : un passage n'est jamais une boucle sans fin.
 */
export const PAGES_MAX_PAR_PASSAGE = 10;

/**
 * Le RECOUVREMENT : la relecture repart de la plus haute séquence reçue MOINS cinq cents. Sans lui,
 * un événement perdu au milieu (le 7 jamais arrivé, le 8 reçu) ne serait jamais relu : le curseur
 * l'aurait déjà dépassé. Cinq cents séquences, soit cinq pages : la moitié de la borne d'un
 * passage, l'autre moitié restant aux événements nouveaux.
 */
export const RECOUVREMENT_SEQUENCES = 500n;

export type Signal =
  | { readonly genre: 'relecture_echouee'; readonly motif: MotifDeRelecture }
  | { readonly genre: 'rejeu_echoue'; readonly motif: string }
  | { readonly genre: 'trou_rattrape'; readonly nombre: number }
  | { readonly genre: 'relecture_bornee'; readonly nombre: number };

export type Rejeu =
  | { readonly ok: true; readonly rearmes: number; readonly introuvables: number }
  | { readonly ok: false; readonly motif: string };

/** Demande le rejeu d'au plus `REJEU_MAX_PAR_APPEL` identifiants. */
export type Rejouer = (eventIds: readonly string[]) => Promise<Rejeu>;

/**
 * La réponse dit-elle EXACTEMENT ce qui a été demandé ? `rearmes ∪ introuvables` égale l'ensemble
 * dédoublonné des identifiants demandés, et `rearmes ∩ introuvables` est vide (lentille sécurité,
 * forme finale) : chaque identifiant demandé est rendu une fois, dans une seule des deux listes, et
 * rien d'autre. La réponse ne porte que des identifiants, sans séquence : c'est cette égalité qui la
 * lie à SA demande, et une réponse authentique d'une autre demande est refusée.
 */
function rendExactement(
  demandes: ReadonlySet<string>,
  rearmes: readonly unknown[],
  introuvables: readonly unknown[]
): boolean {
  const rendus = [...rearmes, ...introuvables];
  if (rendus.length !== demandes.size) return false;
  const vus = new Set<string>();
  for (const id of rendus) {
    if (typeof id !== 'string' || !demandes.has(id) || vus.has(id)) return false;
    vus.add(id);
  }
  return true;
}

/** Le client de la route de rejeu : signée sur `<chemin>\n<corps>`, comme le serveur l'exige. */
export function clientRejeu(c: CanalAxionia): Rejouer {
  return async (eventIds) => {
    const corps = JSON.stringify({ eventIds });
    const r = await appelSigne(c, {
      methode: 'POST',
      cible: CHEMIN_REJEU,
      signee: `${CHEMIN_REJEU}\n${corps}`,
      corps,
    });
    if (!r.ok) return r;
    let brut: unknown;
    try {
      brut = JSON.parse(r.texte);
    } catch {
      return { ok: false, motif: 'reponse_illisible' };
    }
    const { rearmes, introuvables } = (brut ?? {}) as Record<string, unknown>;
    if (!Array.isArray(rearmes) || !Array.isArray(introuvables)) {
      return { ok: false, motif: 'reponse_illisible' };
    }
    if (!rendExactement(new Set(eventIds), rearmes, introuvables)) {
      return { ok: false, motif: 'reponse_hors_demande' };
    }
    return { ok: true, rearmes: rearmes.length, introuvables: introuvables.length };
  };
}

export type PortsDeReconciliation = {
  /** La plus haute séquence REÇUE d'axion-ia, ou zéro. Le recouvrement est retranché par `reconcilier`. */
  curseur(): Promise<bigint>;
  /** Parmi ces identifiants, ceux déjà inscrits dans `evenements_recus`. */
  dejaRecus(eventIds: readonly string[]): Promise<ReadonlySet<string>>;
};

/** Les ports, en base : la source `axionia` seule, jamais une autre. */
export function portsDeBase(prisma: PrismaClient): PortsDeReconciliation {
  return {
    async curseur() {
      const r = await prisma.evenementRecu.aggregate({
        where: { source: 'axionia' },
        _max: { sequence: true },
      });
      return r._max.sequence ?? 0n;
    },
    async dejaRecus(eventIds) {
      if (eventIds.length === 0) return new Set();
      const lignes = await prisma.evenementRecu.findMany({
        where: { source: 'axionia', eventId: { in: [...eventIds] } },
        select: { eventId: true },
      });
      return new Set(lignes.map((l) => l.eventId));
    },
  };
}

export type CompteursDeReconciliation = {
  pages: number;
  relus: number;
  manquants: number;
  rearmes: number;
  introuvables: number;
  /**
   * Les `event_id` manquants, NOMMÉS DANS Partners seulement (rattrapage 81) : le retour du passage,
   * que le battement de la tâche conserve. Ils ne partent qu'à axion-ia, dans la demande de rejeu ;
   * jamais dans un signal, une alerte ou un journal de la plateforme.
   */
  eventIdsManquants: string[];
};

export type DependancesDeReconciliation = PortsDeReconciliation & {
  readonly lire: LirePage;
  readonly rejouer: Rejouer;
  readonly signaler: (s: Signal) => Promise<void>;
};

/** Un passage de réconciliation. Lève quand la relecture ou le rejeu échoue. */
export async function reconcilier(
  d: DependancesDeReconciliation
): Promise<CompteursDeReconciliation> {
  const c: CompteursDeReconciliation = {
    pages: 0,
    relus: 0,
    manquants: 0,
    rearmes: 0,
    introuvables: 0,
    eventIdsManquants: [],
  };
  const manquants = new Set<string>();
  const recue = await d.curseur();
  let apres = recue > RECOUVREMENT_SEQUENCES ? recue - RECOUVREMENT_SEQUENCES : 0n;
  let suite = true;
  while (suite && c.pages < PAGES_MAX_PAR_PASSAGE) {
    const page = await d.lire(apres);
    if (!page.ok) {
      await d.signaler({ genre: 'relecture_echouee', motif: page.motif });
      throw new Error(`relecture_echouee : ${page.motif}`);
    }
    c.pages += 1;
    c.relus += page.lignes.length;
    const recus = await d.dejaRecus(page.lignes.map((l) => l.eventId));
    for (const l of page.lignes) if (!recus.has(l.eventId)) manquants.add(l.eventId);
    apres = page.derniereSequence;
    suite = page.suite;
  }
  if (suite) await d.signaler({ genre: 'relecture_bornee', nombre: c.pages });

  c.manquants = manquants.size;
  c.eventIdsManquants = [...manquants];
  if (manquants.size === 0) return c;
  await d.signaler({ genre: 'trou_rattrape', nombre: manquants.size });
  const ids = [...manquants];
  for (let i = 0; i < ids.length; i += REJEU_MAX_PAR_APPEL) {
    const r = await d.rejouer(ids.slice(i, i + REJEU_MAX_PAR_APPEL));
    if (!r.ok) {
      await d.signaler({ genre: 'rejeu_echoue', motif: r.motif });
      throw new Error(`rejeu_echoue : ${r.motif}`);
    }
    c.rearmes += r.rearmes;
    c.introuvables += r.introuvables;
  }
  return c;
}
