// @req REQ-UX-047
// @req REQ-UX-018
/**
 * UX-P1-46 — l'éditeur de grille (UX-P1-14) et la saisie manuelle d'une candidature (EXT-T04) sont des
 * écrans de console qui n'avaient aucune maquette. REQ-UX-047 : la maquette d'un écran est validée
 * AVANT sa première ligne de code — un écran sans maquette ne peut pas l'être.
 *
 * CE QUE CE FICHIER GARDE, pour chacun des deux écrans :
 *   1. la maquette existe, et dessine les cinq familles d'états de la console (vide, chargement,
 *      erreur, accès refusé — lues par la garde des maquettes, jamais retapées) ;
 *   2. `docs/maquettes/VALIDATION.md` a sa ligne, qui nomme la tâche de l'écran ;
 *   3. `docs/CONSOLE-ROUTES.md` a sa route, qui nomme la maquette.
 * Chaque règle est une fonction pure, jugée sur le dépôt ET sur un dépôt cassé d'un geste (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { etatsManquants } from '../../../scripts/lib/ux-ecrans';

const MAQUETTES = 'docs/maquettes/';

/** Le périmètre de UX-P1-46 : son acceptance, écran par écran. */
const ECRANS = [
  { route: '/console/grille', maquette: 'grille-console.html', tache: 'UX-P1-14' },
  { route: '/console/candidatures', maquette: 'saisie-manuelle-console.html', tache: 'EXT-T04' },
] as const;

type Depot = {
  routes: string;
  validation: string;
  maquettes: Readonly<Record<string, string | undefined>>;
};

function fautes(d: Depot): string[] {
  const f: string[] = [];
  for (const { route, maquette, tache } of ECRANS) {
    const html = d.maquettes[maquette];
    if (html === undefined) f.push(`${maquette} : maquette absente`);
    else
      for (const m of etatsManquants(html, true, maquette))
        f.push(`${maquette} : aucun état « ${m} »`);
    const ligne = d.validation
      .split('\n')
      .find((l) => l.startsWith('|') && l.includes(`\`${maquette}\``));
    if (!ligne) f.push(`${maquette} : aucune ligne dans VALIDATION.md`);
    else if (!ligne.includes(tache)) f.push(`${maquette} : la ligne ne nomme pas ${tache}`);
    const r = d.routes.split('\n').find((l) => l.includes(`\`${route}\``) && l.startsWith('|'));
    if (!r) f.push(`${route} : aucune route dans CONSOLE-ROUTES.md`);
    else if (!r.includes(maquette)) f.push(`${route} : la route ne nomme pas ${maquette}`);
  }
  return f;
}

const lire = (chemin: string) => (existsSync(chemin) ? readFileSync(chemin, 'utf8') : undefined);

function depotReel(): Depot {
  return {
    routes: readFileSync('docs/CONSOLE-ROUTES.md', 'utf8'),
    validation: readFileSync(`${MAQUETTES}VALIDATION.md`, 'utf8'),
    maquettes: Object.fromEntries(ECRANS.map((e) => [e.maquette, lire(MAQUETTES + e.maquette)])),
  };
}

describe('REQ-UX-047 — la grille et la saisie manuelle ont leur maquette (UX-P1-46)', () => {
  const d = depotReel();

  it('REQ-UX-047 REQ-UX-018 — chaque écran a sa maquette à cinq états, sa ligne de validation et sa route', () => {
    expect(fautes(d)).toEqual([]);
  });

  it('REQ-UX-047 — TÉMOINS : une maquette absente, un état retiré, une ligne ou une route manquante rougissent', () => {
    expect(
      fautes({ ...d, maquettes: { ...d.maquettes, 'grille-console.html': undefined } })
    ).toEqual(['grille-console.html : maquette absente']);
    const sansRefus = d.maquettes['saisie-manuelle-console.html']!.replace(
      /id="etat-refuse"/,
      'id="etat-autre"'
    );
    expect(
      fautes({ ...d, maquettes: { ...d.maquettes, 'saisie-manuelle-console.html': sansRefus } })
    ).toEqual(['saisie-manuelle-console.html : aucun état « refus »']);
    expect(
      fautes({
        ...d,
        validation: d.validation.replace(/^\|.*`grille-console\.html`.*$/m, ''),
      })
    ).toEqual(['grille-console.html : aucune ligne dans VALIDATION.md']);
    expect(
      fautes({ ...d, routes: d.routes.replace(/^\|.*`\/console\/candidatures`.*$/gm, '') })
    ).toEqual(['/console/candidatures : aucune route dans CONSOLE-ROUTES.md']);
  });
});
