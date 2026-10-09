// @req REQ-GOV-026
/**
 * UNE BRANCHE RÉELLE DE LA FORGE EST ADMISE PAR LE MOTIF DE `branch` (GOV-103).
 *
 * LE DÉFAUT. Le motif fixé par partners/ADR-0007 admettait les majuscules après `lot/`, et pas après
 * `t/`. La PR #114 a été fusionnée depuis `t/lot-L0-02` : `reclasser.mjs`, qui lit ce motif dans le
 * schéma, rendait `branche_de_la_forge_refusee`, et les six tâches livrées par cette PR restaient
 * `a_faire` avec leur code sur `main`. La seule autre issue — écrire une branche fictive en
 * minuscules — est celle que partners/ADR-0007 écarte : le champ deviendrait décoratif.
 *
 * CE QUE CE FICHIER TIENT. (a) La branche réelle de #114 passe le schéma. Elle est LUE dans le
 * corps de l'amendement de l'ADR, pas tapée ici. (b) Le motif reste FERMÉ : une branche sans
 * préfixe reconnu reste refusée, sous la famille `schema`. (c) Le registre réel reste vert.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { controler, vuesDeLaPasse, type Tache } from '../../../scripts/gates/gov-tasks';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';
import { CHEMIN_CHARTE, cheminsSchema } from '../../../scripts/lot/revues';
import { LIVREE } from '../../../scripts/lot/avancement';
import { instantDuRegistre } from './instant-du-registre';

const CHEMIN_ADR = 'docs/adr/0007-la-branche-porte-le-lot-pas-la-tache.md';
type Doc = { taches: Tache[] };
const lireDoc = (): Doc => JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Doc;
const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;
const registre = chargerRegistre(CHEMIN_REGISTRE);
const chemins = cheminsSchema(readFileSync(CHEMIN_CHARTE, 'utf8'));
/** L'instant de la passe, dérivé du registre : voir `instant-du-registre.ts`. */
const MAINTENANT = instantDuRegistre();
const fautes = (doc: Doc) => controler(doc, schema, registre, chemins, vuesDeLaPasse(MAINTENANT));

/**
 * LA BRANCHE DE LA FORGE, LUE DANS L'AMENDEMENT : la ligne « Branche mesurée : `…` ». L'amendement
 * est la trace de la décision ; le témoin éprouve ce qu'il affirme, pas une copie (RM-01).
 */
function brancheDeLAmendement(): string {
  const m = /Branche mesurée : `([^`]+)`/.exec(readFileSync(CHEMIN_ADR, 'utf8'));
  if (!m) throw new Error(`${CHEMIN_ADR} ne porte pas la ligne « Branche mesurée : \`…\` »`);
  return m[1]!;
}

/** Une tâche déjà livrée, prise au registre réel, dont on ne change QUE la branche. */
function avecBranche(branche: string): { doc: Doc; index: number } {
  const doc = lireDoc();
  const index = doc.taches.findIndex((t) => LIVREE.has(t.statut) && t.branch);
  if (index < 0) throw new Error('aucune tâche livrée ne porte de branche');
  doc.taches[index]!.branch = branche;
  return { doc, index };
}

describe('REQ-GOV-026 — le motif de `branch` admet la branche réelle, et reste fermé', () => {
  it('REQ-GOV-026 — TÉMOIN VERT : une tâche livrée sur la branche réelle de #114 passe le schéma', () => {
    const branche = brancheDeLAmendement();
    expect(branche).toMatch(/[A-Z]/);
    const { doc } = avecBranche(branche);
    expect(fautes(doc)).toEqual([]);
  });

  it('REQ-GOV-026 — TÉMOIN ROUGE : une branche sans préfixe reconnu reste refusée, sous `schema`', () => {
    const { doc, index } = avecBranche('feature/Ce-Prefixe-Nexiste-Pas');
    const f = fautes(doc);
    expect(f.map((x) => x.famille)).toContain('schema');
    expect(f.some((x) => x.message.includes(`/taches/${index}/branch`))).toBe(true);
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : le registre réel reste vert', () => {
    expect(fautes(lireDoc())).toEqual([]);
  });
});
