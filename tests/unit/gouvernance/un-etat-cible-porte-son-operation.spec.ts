/**
 * un-etat-cible-porte-son-operation.spec.ts — GOV-086.
 *
 * @req REQ-GOV-021
 * @req REQ-GOV-026
 *
 * LA FORME GÉNÉRALE, ET ELLE DÉBORDE LE CAS QUI L'A OUVERTE. Partout où un registre porte à la
 * fois UN ÉTAT VOULU et LA LISTE DES ÉCRITURES QUI LE PRODUISENT, les deux peuvent diverger, et la
 * divergence est MUETTE : chacun des deux est bien formé, chacun se lit sans erreur, et seul leur
 * rapprochement montre le trou. C'est la même famille que la vue dérivée qu'on compare à son
 * générateur au lieu de la comparer à sa source.
 *
 * DANS `docs/tasks.json`, LES DEUX SONT LÀ. L'état voulu est le `statut` ; les écritures qui le
 * produisent sont les coordonnées que `pnpm lot:cloture` pose dans le même geste — `pr` pour une
 * livraison de ce dépôt, `attestation` pour une livraison d'ailleurs, `branch` pour le travail en
 * vol. Une tâche déclarée livrée dont AUCUNE de ces écritures n'existe affirme une livraison que
 * rien ne permet de retrouver ; une tâche qui porte l'une d'elles et reste « à faire » a subi une
 * écriture qui n'a produit aucun état.
 *
 * LES DEUX SENS, ET C'EST LE SECOND QU'ON OUBLIE. Le premier — un état cible sans son opération —
 * se voit tôt ou tard, parce qu'il manque quelque chose à l'endroit où on regarde. Le second — une
 * opération sans effet sur l'état — ne manque nulle part : il y a une valeur de trop, et une valeur
 * de trop ne se cherche pas.
 *
 * ⚠️ CE QUE CE FICHIER NE FAIT PAS : il ne corrige pas le cas qui a ouvert la tâche (l'estimation
 * de `UX-P0-01` dans le contenu du lot préparatoire). L'applicateur de ce lot dérive déjà
 * l'opération de l'état cible, la mesure est juste, et rouvrir un contenu gelé pour un écart déjà
 * rattrapé serait exactement le travers que le gel existe pour empêcher.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  controler,
  couplesEtatOperation,
  ECRITURES_D_ETAT,
  AVANT_TOUTE_ECRITURE,
  type Tache,
} from '../../../scripts/gates/gov-tasks';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';

const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;
const registre = chargerRegistre(CHEMIN_REGISTRE);

/**
 * Une tâche minimale et BIEN FORMÉE : tout ce qui n'est pas l'objet du témoin est conforme.
 *
 * ⚠️ `acceptance` et `tests` sont posés d'office parce que le schéma les EXIGE dès qu'une tâche est
 * attribuée : sans eux, chaque témoin rougirait aussi en `schema`, et un témoin qui fait rougir
 * deux familles ne prouve pas laquelle il visait (RM-11).
 */
function tache(sur: Partial<Tache> = {}): Tache {
  const t: Tache = {
    id: 'GOV-999',
    titre: 'une tache de fixture',
    phase: -1,
    repo: 'partners',
    zone: 'gouvernance',
    deps: [],
    hyp: [],
    reqs: ['REQ-GOV-026'],
    paths: ['scripts/gates/gov-tasks.ts'],
    schema: false,
    sensible: [],
    estimateDays: 0.25,
    externe: null,
    statut: 'a_faire',
    acceptance: 'une acceptation de fixture, verifiable.',
    tests: { 'REQ-GOV-026': ['tests/unit/gouvernance/un-etat-cible-porte-son-operation.spec.ts'] },
    ...sur,
  };
  return t;
}

const familles = (taches: Tache[]): string[] =>
  controler({ version: 1, taches }, schema, registre).map((f) => f.famille);

describe('gov:tasks — un état cible porte l’opération qui y mène (GOV-086)', () => {
  it('REQ-GOV-026 — un état LIVRÉ sans aucune des écritures qui le produisent est un refus NOMMÉ', () => {
    // `deployee` et non `fusionnee` : le schéma exige déjà `owner` et `branch` sur `fusionnee`,
    // et le témoin rougirait en `schema` par-dessus. Au-delà de la fusion, il n'exige plus rien —
    // c'est très exactement le trou que cette famille ferme.
    const fautes = controler(
      { version: 1, taches: [tache({ statut: 'deployee', owner: 'A01' })] },
      schema,
      registre
    );
    const f = fautes.find((x) => x.famille === 'etat_cible_sans_operation');
    expect(
      f,
      `aucun refus nommé ; familles vues : ${fautes.map((x) => x.famille).join(', ')}`
    ).toBeDefined();
    // Le refus NOMME la tâche ET les champs qu'on attendait.
    expect(f!.message).toContain('GOV-999');
    for (const champ of ECRITURES_D_ETAT) expect(f!.message).toContain(champ);
  });

  it('REQ-GOV-026 — le SECOND SENS : une opération sans effet sur l’état cible est refusée aussi', () => {
    const fautes = controler(
      { version: 1, taches: [tache({ statut: 'a_faire', branch: 't/gov-999' })] },
      schema,
      registre
    );
    const f = fautes.find((x) => x.famille === 'operation_sans_effet');
    expect(
      f,
      `aucun refus nommé ; familles vues : ${fautes.map((x) => x.famille).join(', ')}`
    ).toBeDefined();
    expect(f!.message).toContain('GOV-999');
    expect(f!.message).toContain('branch');
  });

  it('REQ-GOV-026 — le SECOND SENS sur `pr` SEUL : la fixture ne porte aucune autre écriture', () => {
    // Motif `mutation` (K4) : une fixture qui porte AUSSI une branche masque l'écriture qu'on
    // retirerait de la liste. Ici `pr` est la seule, et elle doit suffire à rougir.
    expect(familles([tache({ statut: 'a_faire', pr: 7 })])).toEqual(['operation_sans_effet']);
  });

  it('REQ-GOV-026 — UNE faute, UNE famille : hors dépôt, c’est l’attestation qui juge, pas le couple', () => {
    // 🔴 Motif `simplicite` sur 9ffb450 : pour une tâche d'un AUTRE dépôt, la même faute rougissait
    // deux fois sous deux noms et deux remèdes — `attestation_absente` ET
    // `etat_cible_sans_operation` pour une livraison sans trace, `attestation_sans_livraison` ET
    // `operation_sans_effet` pour une attestation sans livraison. Le côté nouveau est CE dépôt.
    const attestation = {
      pr: 998,
      sha: '41d71a79392bc6aa1a3f60e7853fa5715e076b79',
      fusionneeAt: '2026-09-05T11:04:48Z',
    };
    expect(familles([tache({ repo: 'axionia', statut: 'deployee', owner: 'A01' })])).toEqual([
      'attestation_absente',
    ]);
    expect(familles([tache({ repo: 'axionia', statut: 'a_faire', attestation })])).toEqual([
      'attestation_sans_livraison',
    ]);
    // Et ICI, c'est le couple qui juge, seul — la famille nouvelle garde son terrain.
    expect(familles([tache({ statut: 'deployee', owner: 'A01' })])).toEqual([
      'etat_cible_sans_operation',
    ]);
  });

  it('REQ-GOV-021 — l’état COMPLET reste vert : une livraison locale avec son `pr` et sa branche', () => {
    expect(
      familles([tache({ statut: 'fusionnee', owner: 'A01', pr: 112, branch: 't/gov-999' })])
    ).toEqual([]);
  });

  it('REQ-GOV-021 — une tâche PRISE avec sa branche et sans `pr` reste verte : elle est en vol', () => {
    expect(familles([tache({ statut: 'en_cours', owner: 'A01', branch: 't/gov-999' })])).toEqual(
      []
    );
  });

  it('REQ-GOV-026 — une livraison HORS dépôt est produite par son attestation, pas par un `pr`', () => {
    expect(
      familles([
        tache({
          repo: 'axionia',
          statut: 'fusionnee',
          owner: 'A01',
          branch: 'lot/x',
          attestation: {
            pr: 998,
            sha: '41d71a79392bc6aa1a3f60e7853fa5715e076b79',
            fusionneeAt: '2026-09-05T11:04:48Z',
          },
        }),
      ])
    ).toEqual([]);
  });

  it('REQ-GOV-021 — les couples confrontés sont COMPTÉS, et le compte se recompte', () => {
    const taches = [
      tache({ id: 'GOV-901', statut: 'fusionnee', owner: 'A01', pr: 1, branch: 'b' }),
      tache({ id: 'GOV-902' }),
    ];
    const couples = couplesEtatOperation(taches);
    expect(couples).toHaveLength(taches.length);
    // Une tâche d'un autre dépôt n'est PAS un couple : son attestation la juge (une seule famille).
    expect(
      couplesEtatOperation([...taches, tache({ id: 'GOV-903', repo: 'axionia' })])
    ).toHaveLength(taches.length);
    expect(couples.find((c) => c.id === 'GOV-901')!.operations).toContain('pr');
    expect(couples.find((c) => c.id === 'GOV-902')!.operations).toEqual([]);
  });

  it('REQ-GOV-026 — les statuts « avant toute écriture » sont tous déclarés par le schéma', () => {
    const s = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
      $defs: { tache: { properties: { statut: { enum: string[] } } } };
    };
    const enumere = s.$defs.tache.properties.statut.enum;
    for (const statut of AVANT_TOUTE_ECRITURE) {
      expect(enumere, `« ${statut} » n’est plus un statut du schéma`).toContain(statut);
    }
  });

  it('REQ-GOV-021 — sur le backlog RÉEL, aucun couple ne diverge', () => {
    const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] };
    const fautes = controler(doc, schema, registre).filter(
      (f) => f.famille === 'etat_cible_sans_operation' || f.famille === 'operation_sans_effet'
    );
    expect(fautes.map((f) => f.message)).toEqual([]);
    // Le compte des couples confrontés est celui des tâches de CE dépôt : aucune n'est sautée en
    // silence, et celles d'ailleurs sont jugées par leur attestation.
    expect(couplesEtatOperation(doc.taches)).toHaveLength(
      doc.taches.filter((t) => t.repo === 'partners').length
    );
  });
});
