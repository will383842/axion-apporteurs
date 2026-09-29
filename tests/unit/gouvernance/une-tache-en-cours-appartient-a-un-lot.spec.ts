// @req REQ-GOV-021
/**
 * UNE TÂCHE `en_cours` PORTE UN LOT, OU LA PREUVE QU'ELLE EST EN VOL (GOV-049, avenant A01 du
 * 2026-09-29).
 *
 * @no-red-first: la regle existe deja au schema (clause jumelle : en_cours exige owner et branch) ; ce fichier lui donne le temoin rouge qu'elle n'avait pas, sur une tache hors de tout lot.
 *
 * LA PRÉMISSE D'ORIGINE EST TOMBÉE. Une tâche `en_cours` sans lot n'est plus « invisible » :
 * `cloturerUneTacheSeule` la clôt seule (témoin `clore-une-tache-livree-seule.spec.ts`), et
 * `un-etat-cible-porte-son-operation.spec.ts` tient qu'une tâche prise avec sa branche et sans
 * `pr` est EN VOL. Exiger un lot contredirait ce second témoin.
 *
 * CE QUI MANQUAIT : la preuve de vol elle-même n'avait aucun témoin ROUGE. La clause jumelle du
 * schéma exige `owner` et `branch` dès `en_cours`, et rien ne la voyait refuser. Ce fichier la
 * confronte sur une tâche HORS DE TOUT LOT, prise au registre réel par un critère (RM-01) :
 *   (a) ROUGE — sans `branch`, puis sans `owner`, la famille `schema` refuse et NOMME la tâche ;
 *   (b) VERT — avec les deux, aucune faute : la tâche est en vol, sans lot, et c'est légitime.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { controler, vuesDeLaPasse } from '../../../scripts/gates/gov-tasks';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';
import { CHEMIN_CHARTE, cheminsSchema } from '../../../scripts/lot/revues';
import { DEPOT_LOCAL } from '../../../scripts/lot/attestation';
import { LIVREE } from '../../../scripts/lot/avancement';
import { type Tache } from '../../../scripts/lot/cloture';
import { instantDuRegistre } from './instant-du-registre';

type Doc = { version: number; taches: Tache[] };
const lireDoc = (): Doc => JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Doc;
const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;
const registre = chargerRegistre(CHEMIN_REGISTRE);
const chemins = cheminsSchema(readFileSync(CHEMIN_CHARTE, 'utf8'));
const MAINTENANT = instantDuRegistre('2026-09-29T00:00:00Z');
const fautes = (doc: Doc) => controler(doc, schema, registre, chemins, vuesDeLaPasse(MAINTENANT));

/** La première tâche de CE dépôt, à faire, rangée dans AUCUN lot : choisie, jamais nommée. */
function enVolHorsLot(): { doc: Doc; index: number; tache: Tache } {
  const doc = lireDoc();
  const index = doc.taches.findIndex(
    (x) => x.statut === 'a_faire' && !x.lot && (x.repo ?? DEPOT_LOCAL) === DEPOT_LOCAL
  );
  if (index < 0)
    throw new Error('aucune tâche de ce dépôt à faire hors lot : le témoin n’a plus d’objet');
  const owner = doc.taches.find((x) => LIVREE.has(x.statut) && x.owner)?.owner;
  if (!owner) throw new Error('aucune tâche livrée ne porte de propriétaire');
  const tache = doc.taches[index]!;
  tache.statut = 'en_cours';
  tache.lot = null;
  tache.owner = owner;
  tache.branch = `t/${tache.id.toLowerCase()}`;
  return { doc, index, tache };
}

/** Les fautes `schema` qui désignent la tâche d'indice `index` — son pointeur `/taches/<n>`. */
const surLaTache = (doc: Doc, index: number) =>
  fautes(doc).filter(
    (f) =>
      f.famille === 'schema' &&
      (f.message.startsWith(`/taches/${index} `) || f.message.startsWith(`/taches/${index}/`))
  );

describe('REQ-GOV-021 — une tâche en_cours hors de tout lot porte la preuve de son vol (GOV-049)', () => {
  it('REQ-GOV-021 — TÉMOIN : sans `branch`, la validation refuse et nomme la tâche', () => {
    const { doc, index, tache } = enVolHorsLot();
    delete (tache as { branch?: string | null }).branch;
    const siennes = surLaTache(doc, index);
    expect(siennes.length).toBeGreaterThan(0);
    expect(siennes.map((f) => f.message).join('\n')).toContain('branch');
  });

  it('REQ-GOV-021 — TÉMOIN : sans `owner`, la validation refuse et nomme la tâche', () => {
    const { doc, index, tache } = enVolHorsLot();
    delete (tache as { owner?: string | null }).owner;
    const siennes = surLaTache(doc, index);
    expect(siennes.length).toBeGreaterThan(0);
    expect(siennes.map((f) => f.message).join('\n')).toContain('owner');
  });

  it('REQ-GOV-021 — CONTRE-TÉMOIN : avec `owner` et `branch`, sans lot ni `pr`, la tâche est en vol et rien ne rougit', () => {
    const { doc, index } = enVolHorsLot();
    expect(surLaTache(doc, index)).toEqual([]);
  });
});
