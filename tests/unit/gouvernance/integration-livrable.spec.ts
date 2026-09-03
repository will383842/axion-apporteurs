/**
 * `pnpm lot:integrer` refuse de recopier un fichier PARTAGÉ. Toute sa valeur tient dans la
 * définition de « partagé » — et la première version de ce script la TAPAIT : quatorze chemins,
 * sous un commentaire qui affirmait « la liste n'est pas une opinion : elle se lit dans
 * docs/paths-proposes.json ». Le script ne lisait pas ce fichier.
 *
 * La lentille « simplicité » l'a mesuré sur la PR 27 : **91 chemins partagés** dans le backlog,
 * quatorze dans la liste. Manquaient `docs/contrat/CONTRAT-APPORTEUR-V1.md` (5 tâches),
 * `prisma/migrations/` (5), `src/domain/apporteur/resiliation.ts` (5), `emails/apporteur/` (5),
 * `src/domain/seuils/ssot.ts` (4), `src/domain/attribution/machine.ts` (4)… Le jour où une tâche
 * en livre un, le script l'aurait COPIÉ — exactement le défaut qu'il existe pour empêcher.
 *
 * Ce fichier est la garde qui rend cette divergence impossible : le jour où un chemin devient
 * partagé dans `docs/paths-proposes.json`, il l'est ici, sans que personne n'ait à y penser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cheminsPartages, estPartage } from '../../../scripts/lot/integrer';

const vue = JSON.parse(readFileSync('docs/paths-proposes.json', 'utf8')) as {
  paths: Record<string, string[]>;
};

describe('lot:integrer — « partagé » est DÉRIVÉ du backlog, jamais tapé (RM-01)', () => {
  it('tout chemin qu’au moins deux tâches déclarent est partagé', () => {
    const compte = new Map<string, number>();
    for (const chemins of Object.values(vue.paths)) {
      for (const c of new Set(chemins)) compte.set(c, (compte.get(c) ?? 0) + 1);
    }
    const attendus = [...compte.entries()].filter(([, n]) => n > 1).map(([c]) => c);

    const partages = cheminsPartages(vue);
    const manquants = attendus.filter((c) => !partages.includes(c));

    expect(manquants).toEqual([]);
    // Le compte n'est pas épinglé — il se dérive. Épingler « 91 » aurait fait rougir la garde au
    // premier chemin ajouté au backlog, pour une raison qui n'est pas un défaut.
    expect(partages.length).toBeGreaterThanOrEqual(attendus.length);
  });

  it('les fichiers réservés en propre sont partagés même si une seule tâche les déclare', () => {
    const partages = cheminsPartages(vue);
    for (const reserve of ['docs/tasks.json', 'docs/gates.json', 'docs/PLAN-STATE.md', '.claude/settings.json']) {
      expect(partages).toContain(reserve);
    }
  });

  it('un chemin de DOSSIER couvre ce qui vit dessous', () => {
    // `paths[]` mêle fichiers et dossiers (`emails/apporteur/`, `.claude/agents/`). Comparer par
    // égalité stricte laissait passer tout leur contenu — le refus n'aurait porté que sur le
    // dossier lui-même, que personne ne livre jamais.
    const partages = ['emails/apporteur/', '.claude/agents/', 'docs/tasks.json'];
    expect(estPartage('emails/apporteur/bienvenue.mjml', partages)).toBe(true);
    expect(estPartage('.claude/agents/dev-partners.md', partages)).toBe(true);
    expect(estPartage('docs/tasks.json', partages)).toBe(true);
    // et les contre-témoins, sans lesquels un `estPartage` qui rend toujours `true` passerait :
    expect(estPartage('emails/formateur/bienvenue.mjml', partages)).toBe(false);
    expect(estPartage('docs/tasks.json.bak', partages)).toBe(false);
    expect(estPartage('src/domain/argent/commission.ts', partages)).toBe(false);
  });

  it('les six chemins que la revue a nommés comme manquants sont désormais couverts', () => {
    // Les témoins de l'incident, cités mot pour mot. Un témoin reformulé cesse d'être le témoin
    // d'un incident : si l'un d'eux disparaît du backlog, ce test le dira, et ce sera une
    // information — pas un faux positif.
    const partages = cheminsPartages(vue);
    const nommes = [
      'docs/contrat/CONTRAT-APPORTEUR-V1.md',
      'prisma/migrations/',
      'src/domain/apporteur/resiliation.ts',
      'emails/apporteur/',
      'src/domain/seuils/ssot.ts',
      'src/domain/attribution/machine.ts',
    ];
    const absents = nommes.filter((c) => !partages.includes(c));
    expect(absents).toEqual([]);
  });
});
