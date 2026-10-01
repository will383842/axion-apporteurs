// @req REQ-UX-047
/**
 * UX-P1-45 — les écrans de l'espace que l'audit indépendant du plan de la Phase 1 (écarts A-10,
 * A2-24) a trouvés sans maquette ont désormais la leur, leur ligne de route et leur ligne de
 * validation. REQ-UX-047 : la maquette d'un écran est validée AVANT sa première ligne de code — un
 * écran sans maquette ne peut pas l'être.
 *
 * CE QUE CE FICHIER GARDE, pour chaque écran de la tâche :
 *   1. la route a sa ligne dans `docs/ESPACE-ROUTES.md`, qui nomme la maquette ;
 *   2. la maquette existe et porte un état vide, un état de chargement et un état d'erreur ;
 *   3. `docs/maquettes/VALIDATION.md` a sa ligne pour la maquette ;
 *   4. l'ouverture limitée (avant la signature) est un état de `conformite.html` ET de
 *      `mon-contrat.html`, et chacune renvoie à l'autre ;
 *   5. aucun lien `fichier.html#etat` de ces maquettes ne pointe vers un état absent.
 * Chaque règle est une fonction pure, jugée sur le dépôt ET sur un dépôt cassé d'un geste (RM-02).
 * La règle générale des états d'un écran (toutes les maquettes) est celle de GOV-113 ; ce fichier ne
 * garde que le périmètre de UX-P1-45.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const MAQUETTES = 'docs/maquettes/';

/** Le périmètre de UX-P1-45 : son acceptance, écran par écran. */
const ECRANS = [
  { route: '/connexion', maquette: 'connexion.html' },
  { route: '/mon-contrat', maquette: 'mon-contrat.html' },
  { route: '/mes-entreprises/<id>', maquette: 'mes-entreprises-fiche.html' },
  { route: '/profil/personnes', maquette: 'personnes.html' },
  { route: '/d/<jeton>', maquette: 'depot-lien-prive.html' },
  { route: '/notifications', maquette: 'notifications.html' },
] as const;

/** Ce qui compte comme état vide d'un écran de l'espace : `etat-vide`, ou le formulaire encore vierge. */
const VIDE = ['etat-vide', 'etat-adresse'];

type Depot = {
  routes: string;
  validation: string;
  maquettes: Readonly<Record<string, string | undefined>>;
};

const etats = (html: string): string[] =>
  [...html.matchAll(/<section\s+class="ecran"\s+id="([^"]+)"/g)].map((m) => m[1]!);

function fautes(d: Depot): string[] {
  const f: string[] = [];
  for (const { route, maquette } of ECRANS) {
    const ligne = d.routes.split('\n').find((l) => l.startsWith(`| \`${route}\` |`));
    if (!ligne) f.push(`${route} : aucune ligne dans ESPACE-ROUTES.md`);
    else if (!ligne.includes(maquette)) f.push(`${route} : la ligne ne nomme pas ${maquette}`);
    const html = d.maquettes[maquette];
    if (html === undefined) {
      f.push(`${maquette} : maquette absente`);
      continue;
    }
    const e = etats(html);
    if (!e.some((x) => VIDE.includes(x))) f.push(`${maquette} : aucun état vide`);
    if (!e.includes('etat-chargement')) f.push(`${maquette} : aucun état de chargement`);
    if (!e.includes('etat-erreur')) f.push(`${maquette} : aucun état d’erreur`);
    if (!d.validation.split('\n').some((l) => l.startsWith('|') && l.includes(`\`${maquette}\``)))
      f.push(`${maquette} : aucune ligne dans VALIDATION.md`);
  }
  const conformite = d.maquettes['conformite.html'] ?? '';
  const contrat = d.maquettes['mon-contrat.html'] ?? '';
  if (!etats(conformite).includes('etat-ouverture-limitee'))
    f.push('conformite.html : aucun état d’ouverture limitée');
  if (!etats(contrat).includes('etat-limitee')) f.push('mon-contrat.html : aucun état limité');
  if (!conformite.includes('href="mon-contrat.html#etat-limitee"'))
    f.push('conformite.html : l’ouverture limitée ne renvoie pas à Mon contrat');
  if (!contrat.includes('href="conformite.html#etat-ouverture-limitee"'))
    f.push('mon-contrat.html : l’état limité ne renvoie pas à la conformité');
  for (const [nom, html] of Object.entries(d.maquettes)) {
    if (html === undefined) continue;
    for (const m of html.matchAll(/href="([a-z-]+\.html)?#(etat-[^"]+)"/g)) {
      const cible = m[1] ?? nom;
      const autre = d.maquettes[cible] ?? lire(MAQUETTES + cible);
      if (autre !== undefined && !etats(autre).includes(m[2]!))
        f.push(`${nom} : lien mort vers ${cible}#${m[2]}`);
    }
  }
  return f;
}

function lire(chemin: string): string | undefined {
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : undefined;
}

function depotReel(): Depot {
  const noms = [...ECRANS.map((e) => e.maquette), 'conformite.html'];
  return {
    routes: readFileSync('docs/ESPACE-ROUTES.md', 'utf8'),
    validation: readFileSync(`${MAQUETTES}VALIDATION.md`, 'utf8'),
    maquettes: Object.fromEntries(noms.map((n) => [n, lire(MAQUETTES + n)])),
  };
}

describe('REQ-UX-047 — les écrans de l’espace trouvés sans maquette ont la leur (UX-P1-45)', () => {
  const d = depotReel();

  it('REQ-UX-047 — chaque écran a sa route, sa maquette à trois états, sa ligne de validation', () => {
    expect(fautes(d)).toEqual([]);
  });

  it('REQ-UX-047 — TÉMOINS : une route, une maquette, un état, une ligne ou un lien qui manque rougit', () => {
    expect(fautes({ ...d, routes: d.routes.replace(/^\| `\/notifications` \|.*$/m, '') })).toEqual([
      '/notifications : aucune ligne dans ESPACE-ROUTES.md',
    ]);
    expect(fautes({ ...d, maquettes: { ...d.maquettes, 'personnes.html': undefined } })).toEqual([
      'personnes.html : maquette absente',
    ]);
    const sansChargement = d.maquettes['notifications.html']!.replace(
      /id="etat-chargement"/,
      'id="etat-autre"'
    );
    expect(
      fautes({ ...d, maquettes: { ...d.maquettes, 'notifications.html': sansChargement } })
    ).toContain('notifications.html : aucun état de chargement');
    expect(
      fautes({ ...d, validation: d.validation.replace(/^\|.*`connexion\.html`.*$/m, '') })
    ).toEqual(['connexion.html : aucune ligne dans VALIDATION.md']);
    const sansRenvoi = d.maquettes['conformite.html']!.replaceAll(
      'href="mon-contrat.html#etat-limitee"',
      'href="mon-contrat.html#etat-signature"'
    );
    expect(fautes({ ...d, maquettes: { ...d.maquettes, 'conformite.html': sansRenvoi } })).toEqual([
      'conformite.html : l’ouverture limitée ne renvoie pas à Mon contrat',
    ]);
    const lienMort = `${d.maquettes['personnes.html']!}<a href="notifications.html#etat-fantome">x</a>`;
    expect(fautes({ ...d, maquettes: { ...d.maquettes, 'personnes.html': lienMort } })).toEqual([
      'personnes.html : lien mort vers notifications.html#etat-fantome',
    ]);
  });
});
