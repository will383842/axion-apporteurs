// @req REQ-GOV-034
/**
 * porte-de-mise-en-service.spec.ts — GOV-147.
 *
 * LA RÈGLE (rattrapage 108, refus de l'exactitude arbitré par la coordination) : toute tâche NON
 * FUSIONNÉE qui porte le marqueur « BLOQUANTE AVANT LA MISE EN SERVICE » (ou « … POUR LA MISE EN
 * SERVICE »), reconnu insensible à la casse, figure dans les dépendances de la porte de mise en
 * service, GOV-146 ; sinon la famille `bloquante_hors_porte` rougit, en nommant la tâche. GOV-146 et
 * GOV-147 sont hors de la règle. Une tâche fusionnée est déjà satisfaite.
 *
 * « FIGURE DANS LES DÉPENDANCES » se lit sur la FERMETURE des dépendances : la porte ne s'ouvre que
 * si toutes ses dépendances sont fusionnées, et `dep_non_livree` refuse qu'une tâche le soit avant
 * les siennes. Une tâche atteinte par une chaîne (la porte → X → elle) est donc déjà exigée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bloquantesHorsPorte,
  controler,
  FAMILLES,
  PORTE_DE_MISE_EN_SERVICE,
  type Tache,
} from '../../../scripts/gates/gov-tasks';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';

function tache(sur: Partial<Tache> & { id: string }): Tache {
  return {
    titre: 'une tâche de fixture',
    phase: 1,
    repo: 'partners',
    zone: 'gouvernance',
    deps: [],
    hyp: [],
    reqs: [],
    paths: ['scripts/fixture.ts'],
    schema: false,
    sensible: [],
    estimateDays: 0.25,
    externe: null,
    statut: 'a_faire',
    acceptance: 'Sans marqueur.',
    ...sur,
  };
}
const porte = (deps: string[]) => tache({ id: PORTE_DE_MISE_EN_SERVICE, deps });
const marquee = (id: string, sur: Partial<Tache> = {}) =>
  tache({ id, acceptance: 'BLOQUANTE AVANT LA MISE EN SERVICE (rattrapage de fixture).', ...sur });
const familles = (taches: Tache[]) => bloquantesHorsPorte(taches).map((f) => f.famille);

describe('REQ-GOV-034 — une tâche bloquante figure dans les dépendances de la porte de mise en service', () => {
  it('REQ-GOV-034 : TÉMOIN face rouge — une tâche marquée, non fusionnée, absente des dépendances de la porte rougit, nommée', () => {
    const fautes = bloquantesHorsPorte([porte([]), marquee('SEC-901')]);
    expect(fautes.map((f) => f.famille)).toEqual(['bloquante_hors_porte']);
    expect(fautes[0]!.message).toContain('SEC-901');
    expect(fautes[0]!.message).toContain(PORTE_DE_MISE_EN_SERVICE);
  });

  it('REQ-GOV-034 : TÉMOIN face verte — la même tâche, dans les dépendances de la porte, ne rougit pas', () => {
    expect(familles([porte(['SEC-901']), marquee('SEC-901')])).toEqual([]);
  });

  it('REQ-GOV-034 : le marqueur est reconnu insensible à la casse, sous ses deux formes, au titre comme à l’acceptance', () => {
    for (const acceptance of [
      'bloquante avant la mise en service',
      'Versée au rattrapage 84, tâche CORRECTIVE, BLOQUANTE pour la mise en service : décision.',
      'DETTE BLOQUANTE POUR LA MISE EN SERVICE, relevée',
    ])
      expect(familles([porte([]), marquee('SEC-901', { acceptance })]), acceptance).toEqual([
        'bloquante_hors_porte',
      ]);
    expect(
      familles([
        porte([]),
        tache({ id: 'SEC-902', titre: 'Un geste, BLOQUANTE AVANT LA MISE EN SERVICE' }),
      ])
    ).toEqual(['bloquante_hors_porte']);
  });

  it('REQ-GOV-034 : sans « BLOQUANTE » devant, ou sans « mise en service », ce n’est pas le marqueur', () => {
    for (const acceptance of [
      'À livrer AVANT LA MISE EN SERVICE.',
      'BLOQUANTE pour la porte A.',
      'Une tâche bloquante, avant la mise en production.',
    ])
      expect(familles([porte([]), marquee('SEC-901', { acceptance })]), acceptance).toEqual([]);
  });

  it('REQ-GOV-034 : TÉMOIN — une tâche FUSIONNÉE (ou au-delà) qui porte le marqueur est déjà satisfaite', () => {
    for (const statut of ['fusionnee', 'deployee', 'verifiee'])
      expect(familles([porte([]), marquee('SEC-901', { statut })]), statut).toEqual([]);
    for (const statut of ['a_faire', 'en_cours', 'en_revue', 'bloquee'])
      expect(familles([porte([]), marquee('SEC-901', { statut })]), statut).toEqual([
        'bloquante_hors_porte',
      ]);
  });

  it('REQ-GOV-034 : TÉMOIN — une tâche atteinte par une CHAÎNE de dépendances de la porte est déjà exigée', () => {
    const chaine = [
      porte(['UX-P1-901']),
      tache({ id: 'UX-P1-901', deps: ['SEC-901'] }),
      marquee('SEC-901'),
    ];
    expect(familles(chaine)).toEqual([]);
    // Coupée, la chaîne ne l'exige plus.
    const coupee = [porte(['UX-P1-901']), tache({ id: 'UX-P1-901' }), marquee('SEC-901')];
    expect(familles(coupee)).toEqual(['bloquante_hors_porte']);
  });

  it('REQ-GOV-034 : GOV-146 (la porte) et GOV-147 (cette règle) sont hors de la règle', () => {
    expect(
      familles([
        porte([]),
        marquee(PORTE_DE_MISE_EN_SERVICE.replace('146', '147')),
        { ...porte([]), acceptance: 'les tâches marquées « BLOQUANTE AVANT LA MISE EN SERVICE »' },
      ])
    ).toEqual([]);
  });

  it('REQ-GOV-034 : sans porte dans le backlog, chaque tâche marquée non fusionnée rougit : rien ne l’exige', () => {
    expect(familles([marquee('SEC-901'), marquee('SEC-902')])).toEqual([
      'bloquante_hors_porte',
      'bloquante_hors_porte',
    ]);
  });
});

describe('REQ-GOV-034 — la famille vit dans la garde `gov:tasks`', () => {
  const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;
  const registre = chargerRegistre(CHEMIN_REGISTRE);
  const reel = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] };

  it('REQ-GOV-034 : la famille est déclarée, et `--prove` la réclame donc', () => {
    expect(FAMILLES).toContain('bloquante_hors_porte');
  });

  it('REQ-GOV-034 : TÉMOIN — `controler` la rapporte, sur le backlog réel où une tâche hors de la porte reçoit le marqueur', () => {
    const doc = JSON.parse(JSON.stringify(reel)) as { taches: Tache[] };
    const parId = new Map(doc.taches.map((t) => [t.id, t]));
    const atteintes = new Set<string>();
    const pile = [...parId.get(PORTE_DE_MISE_EN_SERVICE)!.deps];
    while (pile.length > 0) {
      const d = pile.pop()!;
      if (atteintes.has(d)) continue;
      atteintes.add(d);
      pile.push(...(parId.get(d)?.deps ?? []));
    }
    const horsPorte = doc.taches.find(
      (t) => t.statut === 'a_faire' && !atteintes.has(t.id) && t.id !== PORTE_DE_MISE_EN_SERVICE
    );
    expect(horsPorte, 'une tâche « a_faire » hors de la porte').toBeDefined();
    horsPorte!.acceptance = `BLOQUANTE AVANT LA MISE EN SERVICE. ${horsPorte!.acceptance ?? ''}`;
    const fautes = controler(doc, schema, registre).filter(
      (f) => f.famille === 'bloquante_hors_porte'
    );
    expect(fautes).toHaveLength(1);
    expect(fautes[0]!.message).toContain(horsPorte!.id);
  });

  // @no-red-first: contre-témoin du backlog réel, vert sur main par construction, puisque la famille n'y existe pas encore
  it('REQ-GOV-034 : le backlog réel est conforme : aucune tâche bloquante n’échappe à la porte', () => {
    expect(
      controler(reel, schema, registre).filter((f) => f.famille === 'bloquante_hors_porte')
    ).toEqual([]);
  });
});
