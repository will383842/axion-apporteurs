// @req REQ-GOV-021
/**
 * `reqs`, `hyp` ET `zone` D'UNE TÂCHE : CE QUE LE DÉPÔT PREND QUAND L'OUTIL NE L'A PAS PRIS
 * (GOV-117, point 7).
 *
 * @no-red-first: temoin de non-regression — les gardes du depot refusent deja ces trois ecritures sur main ; GOV-117 ouvre ces champs a l'outil hors depot, et ce fichier tient ce que l'outil doit respecter, la CI ne voyant pas le dossier hors depot.
 *
 * POURQUOI CE TÉMOIN VIT ICI. Depuis GOV-117, les verbes hors dépôt `hors-depot/reecrire-champ.mjs`
 * et `hors-depot/poser-champ.mjs` écrivent `reqs`, `hyp` et `zone` d'une tâche existante, et
 * portent leurs propres refus (REQ inexistante, HYP hors registre, valeur hors schéma), vus rouges
 * dans `hors-depot/batterie.mjs`. Mais la CI ne voit pas ce dossier : une écriture qui passerait
 * l'outil SANS ses garde-fous — un outil régressé, une édition à la main — doit être prise par le
 * dépôt. Ce fichier confronte les gardes du dépôt au registre RÉEL, muté en mémoire sur UNE tâche
 * choisie par un critère (RM-01), jamais nommée :
 *   (a) `zone` hors de l'enum du schéma → `gov:tasks`, famille `schema`, nomme la tâche ;
 *   (b) `hyp` citant une décision absente de `docs/DECISIONS.md` → `gov:tasks`, `hyp_hors_registre` ;
 *   (c) `reqs` citant un identifiant hors du motif du schéma → `gov:tasks`, famille `schema` ;
 *   (d) `reqs` citant une REQ BIEN FORMÉE mais absente du registre. ⚠️ `gov:tasks` ne lit pas
 *       `docs/requirements.json` : ce cas-là est la famille `exigence_citee_non_definie` de
 *       `gov:requirements`, qui tient la réciproque. Le témoin l'y confronte, plutôt que de
 *       prétendre que `gov:tasks` le voit ;
 *   (e) VERT — la même tâche, non mutée, ne porte aucune de ces fautes : chaque rouge vient de SA
 *       mutation, pas d'un registre déjà fautif.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  controler as controlerTaches,
  vuesDeLaPasse,
  type Tache,
} from '../../../scripts/gates/gov-tasks';
import {
  controler as controlerExigences,
  CHEMIN_ANNEXE,
} from '../../../scripts/gates/gov-requirements';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';
import { CHEMIN_CHARTE, cheminsSchema } from '../../../scripts/lot/revues';
import { DEPOT_LOCAL } from '../../../scripts/lot/attestation';
import { instantDuRegistre } from './instant-du-registre';

type Doc = { version: number; taches: Tache[] };
const lireDoc = (): Doc => JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Doc;
const schemaTaches = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
  $defs: { tache: { properties: { zone: { enum: string[] } } } };
};
const schemaExigences = JSON.parse(
  readFileSync('scripts/lot/requirements.schema.json', 'utf8')
) as object;
const exigences = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
  exigences: { id: string }[];
};
const annexe = readFileSync(CHEMIN_ANNEXE, 'utf8');
const registre = chargerRegistre(CHEMIN_REGISTRE);
const chemins = cheminsSchema(readFileSync(CHEMIN_CHARTE, 'utf8'));
const MAINTENANT = instantDuRegistre('2026-09-29T00:00:00Z');

const fautesTaches = (doc: Doc) =>
  controlerTaches(doc, schemaTaches, registre, chemins, vuesDeLaPasse(MAINTENANT));
const fautesExigences = (doc: Doc) =>
  controlerExigences(exigences, schemaExigences, doc.taches, annexe);

/** La première tâche de CE dépôt, à faire, portant au moins une REQ : choisie, jamais nommée. */
function uneTache(): { doc: Doc; index: number; tache: Tache } {
  const doc = lireDoc();
  const index = doc.taches.findIndex(
    (x) => x.statut === 'a_faire' && (x.repo ?? DEPOT_LOCAL) === DEPOT_LOCAL && x.reqs.length > 0
  );
  if (index < 0)
    throw new Error('aucune tâche de ce dépôt à faire avec une REQ : le témoin n’a plus d’objet');
  return { doc, index, tache: doc.taches[index]! };
}

/** Un identifiant au motif du schéma, qu'aucune exigence du registre ne porte : dérivé, pas tapé. */
function uneReqInexistante(): string {
  const connues = new Set(exigences.exigences.map((e) => e.id));
  for (let n = 999; n > 0; n--) {
    const id = `REQ-GOV-${String(n).padStart(3, '0')}`;
    if (!connues.has(id)) return id;
  }
  throw new Error('les 999 identifiants REQ-GOV sont pris');
}

/** Les fautes de la famille `schema` qui désignent la tâche d'indice `index`. */
const schemaSurLaTache = (doc: Doc, index: number) =>
  fautesTaches(doc).filter(
    (f) => f.famille === 'schema' && f.message.startsWith(`/taches/${index}/`)
  );

describe('REQ-GOV-021 — reqs, hyp et zone d’une tâche : le dépôt refuse ce que l’outil doit refuser (GOV-117)', () => {
  it('REQ-GOV-021 — VERT : la tâche non mutée ne porte aucune faute de schéma, de registre ni d’exigence citée', () => {
    const { doc, index, tache } = uneTache();
    expect(schemaSurLaTache(doc, index)).toEqual([]);
    expect(
      fautesTaches(doc).filter(
        (f) => f.famille === 'hyp_hors_registre' && f.message.includes(tache.id)
      )
    ).toEqual([]);
    expect(
      fautesExigences(doc).filter(
        (f) => f.famille === 'exigence_citee_non_definie' && f.message.includes(tache.id)
      )
    ).toEqual([]);
  });

  it('REQ-GOV-021 — TÉMOIN : une `zone` hors de l’enum du schéma rougit gov:tasks et nomme le champ', () => {
    const { doc, index, tache } = uneTache();
    const zones = schemaTaches.$defs.tache.properties.zone.enum;
    const horsEnum = 'nulle-part';
    expect(zones).not.toContain(horsEnum);
    tache.zone = horsEnum;
    const siennes = schemaSurLaTache(doc, index);
    expect(siennes.map((f) => f.message).join('\n')).toContain(`/taches/${index}/zone`);
  });

  it('REQ-GOV-021 — TÉMOIN : une `hyp` absente de docs/DECISIONS.md rougit gov:tasks (hyp_hors_registre)', () => {
    const { doc, tache } = uneTache();
    const absente = 'HYP-GOV117-JAMAIS-ECRITE';
    expect(registre.estDeclaree(absente)).toBe(false);
    tache.hyp = [...tache.hyp, absente];
    const siennes = fautesTaches(doc).filter(
      (f) => f.famille === 'hyp_hors_registre' && f.message.includes(absente)
    );
    expect(siennes.map((f) => f.message).join('\n')).toContain(tache.id);
  });

  it('REQ-GOV-021 — TÉMOIN : une REQ hors du motif du schéma rougit gov:tasks et nomme le champ', () => {
    const { doc, index, tache } = uneTache();
    tache.reqs = [...tache.reqs, 'PAS-UNE-REQ'];
    const siennes = schemaSurLaTache(doc, index);
    expect(siennes.map((f) => f.message).join('\n')).toContain(`/taches/${index}/reqs/`);
  });

  it('REQ-GOV-021 — TÉMOIN : une REQ bien formée mais inexistante rougit gov:requirements (exigence_citee_non_definie)', () => {
    const { doc, index, tache } = uneTache();
    const inexistante = uneReqInexistante();
    tache.reqs = [...tache.reqs, inexistante];
    // La FORME est juste : gov:tasks n'a rien à en dire, c'est la réciproque qui la prend.
    expect(schemaSurLaTache(doc, index)).toEqual([]);
    const siennes = fautesExigences(doc).filter(
      (f) => f.famille === 'exigence_citee_non_definie' && f.message.includes(inexistante)
    );
    expect(siennes.map((f) => f.message).join('\n')).toContain(tache.id);
  });
});
