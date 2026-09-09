// @req REQ-GOV-027
/**
 * Le verrou de phase, et la façon dont il se referme définitivement.
 *
 * CE QUE CE FICHIER TIENT, ET POURQUOI IL A FALLU L'ÉCRIRE. REQ-GOV-027 gèle le périmètre par
 * phase : aucune PR étiquetée phase N+1 n'est fusionnée avant la clôture de la phase N. La garde
 * qui l'applique — `scripts/gates/gov-pr.ts`, famille `phase_gelee` — calcule la phase courante
 * comme la plus petite phase portant encore une tâche non livrée. Le gel est donc un mécanisme
 * SANS ÉCHAPPATOIRE : il ne demande pas si la phase courante *peut* se clore, il attend qu'elle
 * se close.
 *
 * Or une tâche peut être hors d'atteinte de l'outillage pour trois raisons, et le composeur
 * (`scripts/lot/composer.ts`) les écarte toutes les trois :
 *
 *   — `externe` non nul       → « attend will », écartée avec sa raison ;
 *   — `statut attente_externe`→ écartée avant même le filtre général ;
 *   — `repo: "externe"`       → le composeur ne balaie que `--repo partners|axionia`, elle n'est
 *                               jamais dans l'ensemble examiné.
 *
 * Une telle tâche n'est jamais composée, donc jamais livrée, donc sa phase ne se clôt jamais,
 * donc TOUTES les phases suivantes sont gelées à vie. Ce n'est pas une attente : c'est une
 * impasse, et elle est silencieuse — `gov:tasks` est vert, `gov:pr` est vert, et la seule trace
 * est un chiffre qui ne bouge plus dans `docs/PLAN-STATE.md`.
 *
 * C'est arrivé : `CPL-T01`, seule tâche `attente_externe` de la phase −1, gelait les 171 tâches
 * des phases 0 à 3. L'arbitrage est `partners/ADR-0009` — une valeur que seul Will connaît est
 * une CONFIGURATION à sentinelle, pas un état de tâche.
 *
 * CE QUI EST DÉRIVÉ ICI. L'ensemble « livrée » vient de `scripts/lot/avancement.ts`, seule source
 * du barème (RM-01) : si un statut y change de rang, ce fichier suit. Le calcul de la phase
 * courante, lui, est REPRIS de `gov-pr.ts` et non importé — ce module est un script qui contrôle
 * et sort au chargement, l'importer ferait tourner la garde entière dans la suite de tests. La
 * formule est donc écrite ici une seconde fois, en toutes lettres, plutôt que masquée.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LIVREE } from '../../../scripts/lot/avancement';

type Tache = {
  id: string;
  phase: number;
  repo: string;
  statut: string;
  externe: string | null;
  estimateDays: number;
};

const taches = (
  JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] }
).taches;

/** La phase courante, au sens de `scripts/gates/gov-pr.ts` : la plus petite encore ouverte. */
function phaseCourante(liste: Tache[]): number {
  const restantes = liste.filter((t) => !LIVREE.has(t.statut)).map((t) => t.phase);
  return restantes.length === 0 ? Math.max(...liste.map((t) => t.phase)) : Math.min(...restantes);
}

/**
 * Pourquoi le composeur ne pourra JAMAIS retenir cette tâche — ou `null` s'il le peut un jour.
 * Les trois motifs sont ceux de `scripts/lot/composer.ts`, dans son ordre à lui.
 */
function horsAtteinte(t: Tache): string | null {
  if (t.statut === 'attente_externe') return `statut « attente_externe »`;
  if (t.externe !== null) return `externe « ${t.externe} »`;
  if (t.repo === 'externe') return `repo « externe », qu'aucun balayage --repo ne visite`;
  return null;
}

/** Les tâches qu'une impasse en phase `p` gèle : tout ce qui vit strictement après elle. */
function geleesPar(p: number, liste: Tache[]): Tache[] {
  return liste.filter((t) => t.phase > p);
}

describe('REQ-GOV-027 — une phase gelée doit pouvoir se clore', () => {
  it('la phase courante ne porte aucune tâche hors d’atteinte du composeur', () => {
    const p = phaseCourante(taches);
    const impasses = taches
      .filter((t) => t.phase === p && !LIVREE.has(t.statut))
      .map((t) => ({ t, motif: horsAtteinte(t) }))
      .filter((x) => x.motif !== null);

    // Le message porte le COÛT, pas seulement le nom : c'est lui qui fait agir.
    const detail = impasses
      .map(({ t, motif }) => {
        const gelees = geleesPar(p, taches);
        const jours = gelees.reduce((a, x) => a + x.estimateDays, 0);
        return `${t.id} (${motif}) gèle ${gelees.length} tâche(s) et ${jours.toFixed(2)} j`;
      })
      .join(' · ');

    expect(detail).toBe('');
  });

  it('sait rougir : une tâche remise en attente d’un tiers dans la phase courante est nommée', () => {
    const p = phaseCourante(taches);
    const cible = taches.find((t) => t.phase === p && !LIVREE.has(t.statut));
    expect(cible, 'la phase courante doit porter au moins une tâche non livrée').toBeDefined();

    const mutees = taches.map((t) =>
      t.id === cible!.id ? { ...t, statut: 'attente_externe', externe: 'will' } : t
    );
    const impasses = mutees
      .filter((t) => t.phase === p && !LIVREE.has(t.statut))
      .filter((t) => horsAtteinte(t) !== null);

    expect(impasses.map((t) => t.id)).toContain(cible!.id);
    expect(horsAtteinte({ ...cible!, statut: 'attente_externe', externe: 'will' })).toContain(
      'attente_externe'
    );
  });

  it('les tâches qui gèleront une phase ultérieure sont nommées, jamais découvertes après coup', () => {
    const p = phaseCourante(taches);
    const differees = taches
      .filter((t) => t.phase > p && !LIVREE.has(t.statut) && horsAtteinte(t) !== null)
      .map((t) => t.id)
      .sort();

    // Deux tâches, et deux seulement, sont arbitrées comme différées : `partners/ADR-0009`
    // « Reste à faire ». Toute NOUVELLE tâche en attente d'un tiers fait rougir ce contrôle —
    // c'est le seul moment où l'on peut encore décider de son sort avant qu'elle ne gèle une
    // phase. La liste ne se choisit pas : elle s'additionne, et chaque ajout passe par un ADR.
    expect(differees).toEqual(['JUR-T01b', 'JUR-T01c']);
  });
});
