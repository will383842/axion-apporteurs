/**
 * registre-decisions.ts — LE lecteur de `docs/DECISIONS.md` (GOV-027, REQ-GOV-015, REQ-GOV-021).
 *
 * POURQUOI CE FICHIER EXISTE. Il y avait DEUX lecteurs du même registre, et ils ne lisaient pas la
 * même chose (RM-04, RM-01). `scripts/gates/gov-tasks.ts` reconnaissait une décision à la PREMIÈRE
 * CELLULE d'une ligne de tableau et acceptait les quatre familles d'identifiants du registre ;
 * `scripts/lot/composer.ts` la cherchait par `/\b(HYP|DEC)-[A-Z0-9-]+\b/` sur le TEXTE BRUT des
 * sections, ne connaissait donc que deux préfixes sur quatre, et n'appliquait aucun alias de la §0.
 * Mesuré le 2026-09-04, trois conséquences, toutes SILENCIEUSES — le composeur imprimait une
 * raison plausible, et personne ne la contestait :
 *
 *   (a) une tâche dont la décision est une DÉCISION DE WILL (`W6`, `W10`…) était écartée pour
 *       « décision sans hypothèse », alors que sa décision est déclarée au registre ;
 *   (b) trois identifiants cités dans une NOTE EN PROSE sous la §1 — une note qui explique
 *       précisément qu'ils ne bloquent PLUS — étaient comptés comme bloquants ;
 *   (c) la §1 était ratissée ENTIÈRE : une décision TRANCHÉE y bloquait encore, alors que le §4 du
 *       registre prescrit de la faire descendre en §2.
 *
 * Le remède n'est pas d'aligner la seconde expression régulière sur la première — deux copies
 * divergent toujours, et celle qui est lue n'est jamais celle qui a été corrigée. C'est un lecteur
 * UNIQUE, importé par la garde et par le composeur. `scripts/lot/` est déjà importé par
 * `scripts/gates/` (`avancement.ts`, le barème des statuts), c'est donc là qu'il vit.
 *
 * CE QUE CE LECTEUR TIENT POUR VRAI, ET POURQUOI :
 *
 *   1. UNE DÉCISION EST DÉCLARÉE PAR LA PREMIÈRE CELLULE D'UNE LIGNE DE TABLEAU. Une mention en
 *      prose ne porte ni hypothèse, ni réversibilité, ni propriétaire : ce n'est pas une décision,
 *      c'est un renvoi. La note sous la §1 en est la preuve vivante — elle cite trois identifiants
 *      pour dire qu'ils ne bloquent plus, et une lecture au fil du texte lui fait dire l'inverse.
 *   2. LA FRONTIÈRE §1/§2 SE LIT SUR LES LIGNES, PAS SUR LES BORNES DU TEXTE. La section courante
 *      est celle du dernier titre `## n.` rencontré ; ce sont les LIGNES DE TABLEAU qui portent des
 *      décisions, jamais les paragraphes entre elles.
 *   3. UNE DÉCISION TRANCHÉE NE BLOQUE PLUS RIEN. Le §4 du registre demande au gardien du spec de
 *      dater la ligne et de la faire descendre en §2 ; tant que le déplacement n'est pas fait, la
 *      DATE fait foi — sans quoi la garde punirait le projet pour un geste d'archivage en retard.
 *      Les deux endroits où la date s'écrit sont lus : la colonne `Tranchée` de la §2, et le
 *      marqueur `✅ *tranchée <date>*` que la §1 porte dans sa première cellule.
 *   4. LES ALIAS DE LA §0 SONT APPLIQUÉS. Le registre le dit lui-même : « ce tableau ne décide
 *      rien, il rend lisible par la machine ce qui ne l'était que par un lecteur attentif ».
 *
 * ⚠️ `docs/DECISIONS.md` est un fichier RÉSERVÉ au `gardien-spec` (`docs/CHARTE-AGENTS.md` §7).
 * Ce module le LIT ; rien ici ne l'écrit, ni ne le corrige, ni ne suppose une ligne absente.
 */

import { readFileSync } from 'node:fs';
import {
  lireRegistre,
  MOTIF_IDENTIFIANT,
  type Decision,
  type Motif,
  type Registre,
} from '../../src/domain/registre/registre-decisions';

// La lecture PURE vit sous `src/domain/registre/` (PR #92, A09 · simplicite) : le domaine ne peut
// pas importer `scripts/`, et elle y était recopiée. Elle est réexportée ici, inchangée.
export { lireRegistre, MOTIF_IDENTIFIANT, type Decision, type Motif, type Registre };

export const CHEMIN_REGISTRE = 'docs/DECISIONS.md';

/** Lit le registre sur le disque. Le chemin est un paramètre pour que les bancs d'essai l'écartent. */
export function chargerRegistre(chemin: string = CHEMIN_REGISTRE): Registre {
  return lireRegistre(readFileSync(chemin, 'utf8'));
}

// ── le lecteur HÉRITÉ ────────────────────────────────────────────────────────
/**
 * ⚠️ CECI N'EST PAS UN SECOND LECTEUR. C'est la FIXTURE du défaut : le code de lecture que
 * `scripts/lot/composer.ts` portait avant GOV-027, conservé mot pour mot. Rien ne le consulte pour
 * juger quoi que ce soit — il sert à deux choses, et à deux seulement :
 *
 *   — aux témoins des tests, qui opposent famille par famille sa lecture à celle du lecteur unique ;
 *   — au décompte que `pnpm lot:composer` IMPRIME, pour qu'on VOIE la différence au lieu de la
 *     supposer. Un correctif dont l'effet n'est pas mesuré est un correctif dont on discute.
 *
 * Le supprimer ferait disparaître la seule preuve que le remède change quelque chose (RM-02).
 */
export interface RegistreHerite {
  estDeclaree(id: string): boolean;
  estBloquante(id: string): boolean;
  estCodable(id: string): boolean;
  motif(id: string): Motif | null;
}

export function lireRegistreHerite(texte: string): RegistreHerite {
  const section = (n: number): string =>
    texte.split(new RegExp(`^## ${n}\\.`, 'm'))[1]?.split(new RegExp(`^## ${n + 1}\\.`, 'm'))[0] ??
    '';
  const ids = (t: string): Set<string> => new Set(t.match(/\b(HYP|DEC)-[A-Z0-9-]+\b/g) || []);

  const decisions = ids(section(2));
  const bloquantes = ids(section(1));

  const estBloquante = (id: string): boolean => bloquantes.has(id);
  const estCodable = (id: string): boolean => !bloquantes.has(id) && decisions.has(id);
  return {
    estDeclaree: (id) => decisions.has(id) || bloquantes.has(id),
    estBloquante,
    estCodable,
    motif: (id) =>
      estBloquante(id)
        ? 'decision_bloquante_non_tranchee'
        : estCodable(id)
          ? null
          : 'decision_sans_hypothese',
  };
}

// ── le décompte ──────────────────────────────────────────────────────────────
export type EcartDeLecture = {
  id: string;
  /** La raison que le composeur imprimait AVANT — c'est elle qu'on lisait sans la contester. */
  motifHerite: Motif;
  /** Les identifiants de décision qui portaient cette raison. */
  decisions: string[];
};

/**
 * Les tâches que le lecteur hérité écartait POUR UNE RAISON DE DÉCISION, et que le lecteur unique
 * laisse passer. Ni le statut, ni la phase, ni les dépendances n'entrent ici : cette fonction
 * mesure l'effet du LECTEUR, et rien d'autre. Le composeur applique ses autres filtres par-dessus.
 */
export function tachesRedevenuesEligibles(
  taches: { id: string; hyp: string[] }[],
  texte: string
): EcartDeLecture[] {
  const unique = lireRegistre(texte);
  const herite = lireRegistreHerite(texte);
  const ecarts: EcartDeLecture[] = [];

  for (const t of taches) {
    if (t.hyp.length === 0) continue;

    const bloquantesHeritees = t.hyp.filter((h) => herite.estBloquante(h));
    const sansHypotheseHeritees = t.hyp.filter(
      (h) => !herite.estBloquante(h) && !herite.estCodable(h)
    );
    if (bloquantesHeritees.length === 0 && sansHypotheseHeritees.length === 0) continue;

    // Toujours écartée par le lecteur unique ? Alors elle n'est pas « redevenue » éligible.
    if (t.hyp.some((h) => !unique.estCodable(h))) continue;

    ecarts.push({
      id: t.id,
      motifHerite:
        bloquantesHeritees.length > 0
          ? 'decision_bloquante_non_tranchee'
          : 'decision_sans_hypothese',
      decisions: [...bloquantesHeritees, ...sansHypotheseHeritees],
    });
  }

  return ecarts;
}
