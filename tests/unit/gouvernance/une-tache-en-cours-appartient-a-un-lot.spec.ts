// @req REQ-GOV-021
/**
 * UNE TÂCHE `en_cours` APPARTIENT À UN LOT — OU PORTE L'ATTESTATION D'UNE LIVRAISON SEULE.
 *
 * LE DÉFAUT. La liste des tâches d'une clôture se DÉRIVE du champ `lot`. Une tâche `en_cours` à
 * `lot: null` n'était vue par aucune clôture, et aucune garde ne la nommait : elle restait
 * `en_cours` pour toujours, registre vert.
 *
 * CE QUE CE FICHIER TIENT, SUR TROIS FACES.
 * (a) ROUGE — une tâche composée dans un lot, passée `en_cours`, dont le `lot` est vide (null ou
 *     chaîne vide), fait rougir la famille `schema` et la NOMME par son pointeur `/taches/<n>`.
 *     Et elle reste rouge quand on RENOMME sa branche à la forme dérogatoire `t/…` sans toucher au
 *     reste : l'exemption ne se lit JAMAIS sur une forme de chaîne que l'auteur choisit.
 * (b) VERT — les tâches livrées seules (`fusionnee`, `lot: null`), y compris celle qui porte une
 *     branche `lot/…`, restent vertes sur l'état réel du registre : la règle vise `en_cours` SEUL.
 * (c) VERT — les tâches `a_faire`, qui n'ont légitimement pas de lot, restent vertes.
 *
 * Tout est pris au registre réel par un CRITÈRE (RM-01) ; l'instant de la passe en est dérivé.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { controler, vuesDeLaPasse, type Tache } from '../../../scripts/gates/gov-tasks';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';
import { CHEMIN_CHARTE, cheminsSchema } from '../../../scripts/lot/revues';

type TacheBrute = Tache & {
  lot?: string | null;
  pr?: number | null;
  branch?: string | null;
  attestation?: { fusionneeAt?: string } | null;
  owner?: string | null;
  repo?: string;
};
type Doc = { taches: TacheBrute[] };

const lireDoc = (): Doc => JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Doc;
const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;
const registre = chargerRegistre(CHEMIN_REGISTRE);
const chemins = cheminsSchema(readFileSync(CHEMIN_CHARTE, 'utf8'));
/** L'INSTANT DE LA PASSE, DÉRIVÉ DU REGISTRE : un jour après la plus récente fusion attestée. */
const MAINTENANT =
  Math.max(0, ...lireDoc().taches.map((t) => Date.parse(t.attestation?.fusionneeAt ?? '') || 0)) +
  86_400_000;
const fautes = (doc: Doc) => controler(doc, schema, registre, chemins, vuesDeLaPasse(MAINTENANT));
/** Les fautes `schema` qui désignent la tâche d'indice `index` — son pointeur `/taches/<n>`. */
const surLaTache = (f: ReturnType<typeof fautes>, index: number) =>
  f.filter(
    (f) =>
      f.famille === 'schema' &&
      (f.message.startsWith(`/taches/${index} `) || f.message.startsWith(`/taches/${index}/`))
  );

/**
 * UNE TÂCHE COMPOSÉE DANS UN LOT, REMISE EN VOL : prise au registre réel (livrée, dans ce dépôt,
 * portant un lot et une branche `lot/…`), repassée `en_cours` sans PR ni attestation — l'état
 * d'une tâche revendiquée par son lot et pas encore livrée. Seul `lot` varie ensuite.
 */
function enVolDansSonLot(): { doc: Doc; index: number; tache: TacheBrute } {
  const doc = lireDoc();
  const index = doc.taches.findIndex(
    (t) =>
      t.statut === 'fusionnee' &&
      t.repo === 'partners' &&
      typeof t.lot === 'string' &&
      t.lot.length > 0 &&
      typeof t.branch === 'string' &&
      t.branch.startsWith('lot/') &&
      typeof t.owner === 'string' &&
      // Aucune tâche n'en dépend : la remettre en vol ne rougit pas `dep_non_livree` ailleurs.
      !doc.taches.some((o) => o.deps.includes(t.id))
  );
  if (index < 0) throw new Error('aucune tâche livrée en lot ne porte une branche `lot/…`');
  const tache = doc.taches[index]!;
  tache.statut = 'en_cours';
  delete tache.pr;
  delete tache.attestation;
  return { doc, index, tache };
}

describe('REQ-GOV-021 — (a) une tâche `en_cours` sans lot est ROUGE, et nommée', () => {
  it('REQ-GOV-021 — CONTRE-TÉMOIN : la tâche en vol AVEC son lot est verte', () => {
    const { doc } = enVolDansSonLot();
    expect(fautes(doc)).toEqual([]);
  });

  it('REQ-GOV-021 — TÉMOIN ROUGE : la même tâche à `lot: null` rougit `schema` et est nommée', () => {
    const { doc, index, tache } = enVolDansSonLot();
    tache.lot = null;
    const f = fautes(doc);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.famille === 'schema')).toBe(true);
    expect(surLaTache(f, index).length).toBe(f.length);
  });

  it('REQ-GOV-021 — TÉMOIN ROUGE : un `lot` chaîne vide ne vaut pas un lot', () => {
    const { doc, index, tache } = enVolDansSonLot();
    tache.lot = '';
    expect(surLaTache(fautes(doc), index).length).toBeGreaterThan(0);
  });

  it('REQ-GOV-021 — TÉMOIN ROUGE : renommer la branche à la forme `t/…` NE L’EXEMPTE PAS', () => {
    const { doc, index, tache } = enVolDansSonLot();
    tache.lot = null;
    tache.branch = `t/${tache.id.toLowerCase()}`;
    // La branche seule est admise par le motif : ce qui rougit est l'absence de lot ET de preuve.
    const f = surLaTache(fautes(doc), index);
    expect(f.length).toBeGreaterThan(0);
    expect(f.some((x) => x.message.startsWith(`/taches/${index}/branch`))).toBe(false);
    // Et la sortie DIT ce qui exempterait : une preuve (`pr` ou `attestation`), jamais un nom.
    expect(f.some((x) => x.message.includes(`required property 'pr'`))).toBe(true);
    expect(f.some((x) => x.message.includes(`required property 'attestation'`))).toBe(true);
  });

  it('REQ-GOV-021 — CONTRE-TÉMOIN : sans lot mais avec sa PR (livraison seule attestée), vert', () => {
    const { doc, tache } = enVolDansSonLot();
    const pr = lireDoc().taches.find((t) => t.id === tache.id)!.pr;
    expect(typeof pr).toBe('number');
    tache.lot = null;
    tache.pr = pr;
    expect(fautes(doc)).toEqual([]);
  });
});

describe('REQ-GOV-021 — (b) et (c) le registre réel reste vert', () => {
  it('REQ-GOV-021 — (b) les tâches livrées seules, dont une sur branche `lot/…`, restent vertes', () => {
    const doc = lireDoc();
    const seules = doc.taches
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.statut === 'fusionnee' && (t.lot ?? null) === null);
    expect(seules.length).toBeGreaterThan(0);
    expect(seules.some(({ t }) => t.branch?.startsWith('lot/'))).toBe(true);
    expect(seules.some(({ t }) => t.branch?.startsWith('t/'))).toBe(true);
    const f = fautes(doc);
    for (const { i } of seules) expect(surLaTache(f, i)).toEqual([]);
    expect(f).toEqual([]);
  });

  it('REQ-GOV-021 — (c) les tâches `a_faire`, sans lot, restent vertes', () => {
    const doc = lireDoc();
    const aFaire = doc.taches
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.statut === 'a_faire' && (t.lot ?? null) === null);
    expect(aFaire.length).toBeGreaterThan(0);
    const f = fautes(doc);
    for (const { i } of aFaire) expect(surLaTache(f, i)).toEqual([]);
  });

  it('REQ-GOV-021 — CAS LAISSÉ OUVERT, DIT : un `lot` porté par une tâche `a_faire` passe le schéma', () => {
    const doc = lireDoc();
    const index = doc.taches.findIndex((t) => t.statut === 'a_faire');
    const lot = doc.taches.find((t) => typeof t.lot === 'string' && t.lot.length > 0)!.lot;
    doc.taches[index]!.lot = lot;
    // Le symétrique n'est PAS fermé par cette règle : s'il l'est un jour, ce témoin le dira.
    expect(surLaTache(fautes(doc), index)).toEqual([]);
  });
});
