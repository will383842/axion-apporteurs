// @req REQ-GOV-021
// @req REQ-GOV-024
/**
 * UNE RAISON DE DETTE NE DEVIENT PAS FAUSSE EN SILENCE.
 *
 * Les raisons de `DETTE_GATE_NON_RECIPROQUE` n'étaient jugées que sur leur LONGUEUR : une raison qui
 * affirme ce que dit `docs/gates.json`, en nommant une tâche, restait verte le jour où le registre
 * changeait sous elle. Toute raison qui cite un identifiant de tâche est désormais confrontée à
 * l'entrée de sa gate : l'identifiant doit y figurer, sinon `raison_perimee` rougit.
 *
 * Deux faces : le témoin (une raison qui nomme une tâche absente de l'entrée → échec rendu, entrée et
 * identifiant nommés) et le dépôt réel (vert, avec le compte des raisons RÉELLEMENT confrontées,
 * recompté ici par un second producteur).
 */
import { describe, it, expect } from 'vitest';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import {
  analyser,
  chargerSources,
  rendre,
  DETTE_GATE_NON_RECIPROQUE,
  type DetteGate,
  type Gate,
  type Sources,
  type Tache,
} from '../../../scripts/gates/gov-attributions';

const TACHE = (id: string): Tache => ({
  id,
  paths: [`scripts/gates/${id.toLowerCase()}.ts`],
  tests: {},
  owner: null,
  lot: null,
  pr: null,
  statut: 'a_faire',
});
const PORTEUSE = TACHE('GOV-500');
const SUCCESSEUR = TACHE('GOV-501');
const GATE: Gate = {
  id: 'gov:differee',
  script: 'scripts/gates/gov-differee.ts',
  tache: PORTEUSE.id,
  verifie: 'DIFFÉRÉE ; la ré-attribuer à sa tâche successeur viderait le témoin',
};
const dette = (raison: string): DetteGate => ({
  gate: GATE.id,
  tache: PORTEUSE.id,
  script: GATE.script,
  raison,
});
const cas = (d: DetteGate): Sources => ({
  taches: [PORTEUSE, SUCCESSEUR],
  gates: [GATE],
  postes: [],
  journal: '',
  plancherJournal: 0,
  entetes: [],
  citations: [],
  dettesGate: [d],
  dettesLot: [],
  exemptionsFigees: [],
});

describe('REQ-GOV-024 — le témoin : une raison qui nomme une tâche absente de l’entrée de sa gate rougit', () => {
  it('REQ-GOV-024 — raison_perimee NOMME l’entrée et l’identifiant, et le verdict rendu sort en échec', () => {
    const v = analyser(
      cas(
        dette(
          `le registre écrit noir sur blanc que la ré-attribuer à ${SUCCESSEUR.id} viderait le témoin`
        )
      )
    );
    const siennes = v.fautes.filter((f) => f.famille === 'raison_perimee');
    expect(siennes, JSON.stringify(v.fautes, null, 2)).toHaveLength(1);
    expect(siennes[0]!.message).toContain(GATE.id);
    expect(siennes[0]!.message).toContain(SUCCESSEUR.id);
    const r = rendre(v);
    expect(r.code).not.toBe(0);
    expect(r.lignes.join('\n')).toContain('[raison_perimee]');
  });

  it('REQ-GOV-021 — une raison qui nomme la tâche que l’entrée porte reste verte, et elle est comptée comme confrontée', () => {
    const v = analyser(
      cas(dette(`${PORTEUSE.id} ne peut pas déclarer un script qui n’existe pas encore`))
    );
    expect(v.fautes.filter((f) => f.famille === 'raison_perimee')).toEqual([]);
    expect(v.raisonsConfrontees).toBe(1);
  });

  it('REQ-GOV-021 — une raison qui ne nomme aucune tâche n’est pas comptée comme confrontée', () => {
    const v = analyser(cas(dette('la ré-attribuer à sa tâche successeur viderait le témoin')));
    expect(v.fautes.filter((f) => f.famille === 'raison_perimee')).toEqual([]);
    expect(v.raisonsConfrontees).toBe(0);
  });
});

describe('REQ-GOV-021 — sur le dépôt réel, chaque raison qui nomme une tâche est vraie à l’endroit qu’elle désigne', () => {
  const s = chargerSources(fichiersSuivis());
  const ids = new Set(s.taches.map((t) => t.id));
  /** Second producteur : les jetons qui sont EXACTEMENT un identifiant de tâche. */
  const nommes = (texte: string): string[] =>
    texte.split(/[^A-Za-z0-9-]+/).filter((j) => j !== '' && ids.has(j));

  it('REQ-GOV-021 — aucune raison_perimee, et le compte des raisons confrontées est recompté ici, imprimé par le verdict rendu', () => {
    const v = analyser(s);
    expect(v.fautes.filter((f) => f.famille === 'raison_perimee')).toEqual([]);
    const attendu = DETTE_GATE_NON_RECIPROQUE.filter((d) => nommes(d.raison).length > 0).length;
    expect(attendu).toBeGreaterThan(0);
    expect(v.raisonsConfrontees).toBe(attendu);
    const r = rendre(v);
    expect(r.code, r.lignes.join('\n')).toBe(0);
    expect(r.lignes.join('\n')).toContain(`${attendu} raison(s) de DETTE_GATE_NON_RECIPROQUE`);
  });

  it('REQ-GOV-024 — chaque identifiant cité par une raison figure dans l’entrée de docs/gates.json de sa gate', () => {
    for (const d of DETTE_GATE_NON_RECIPROQUE) {
      const entree = s.gates.find((g) => g.id === d.gate);
      expect(entree, `gate « ${d.gate} » introuvable`).toBeDefined();
      const porte = new Set(nommes(JSON.stringify(entree)));
      for (const id of nommes(d.raison)) {
        expect(
          porte.has(id),
          `« ${d.gate} » : la raison nomme ${id}, que l’entrée ne porte pas`
        ).toBe(true);
      }
    }
  });
});
