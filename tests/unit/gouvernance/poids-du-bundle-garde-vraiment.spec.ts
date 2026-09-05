// @req REQ-GOV-028
/**
 * `perf:budgets` — la garde des budgets de performance, exercée sur ce qu'elle doit ATTRAPER.
 *
 * POURQUOI CE NOM. Le fichier ne s'appelle pas « la garde existe » ni « la garde rend 0 » : il
 * s'appelle « le poids du bundle est gardé VRAIMENT ». Deux pannes, mesurées toutes les deux sur
 * le dépôt voisin, expliquent le titre — et ce sont elles que les `describe` ci-dessous visent :
 *
 *   1. LA GARDE QUI SE TAIT QUAND SON PÉRIMÈTRE EST VIDE. `axionia/scripts/check-zod.ts` sort 0
 *      avec un avertissement dès que son répertoire n'existe pas. Elle n'a jamais rien gardé, et
 *      personne ne l'a su. Partners n'a AUCUNE route aujourd'hui : la garde va donc balayer zéro
 *      route et sortir 0. Ce vert n'est acceptable qu'à deux conditions, toutes deux exigées ici :
 *      elle DIT combien de routes elle a balayées, et on prouve MAINTENANT qu'elle rougirait sur
 *      une route sans budget.
 *   2. LE GATE QUI N'ASSERTAIT RIEN PARCE QU'IL MOURAIT AVANT. Le gate Lighthouse mobile du dépôt
 *      voisin est resté rouge en permanence ; ce rouge n'était pas une régression, c'était une
 *      garde morte — la commande échouait avant d'asserter quoi que ce soit, et le budget mobile
 *      n'était gardé par rien. D'où les familles `lhci_non_bloquant` et `lhci_hors_mobile` : une
 *      assertion en `warn` et un profil de laboratoire qui n'est pas celui de l'exigence
 *      produisent exactement le même effet qu'une absence d'assertion.
 *
 * CE QUE CE FICHIER N'EXERCE PAS, ET C'EST DÉLIBÉRÉ. Il ne mesure aucun octet. Il n'y a rien à
 * mesurer : ni route, ni composant, ni application. La mesure est le travail de `QA-T20`
 * (phase 0). Ce qui est exercé ici, c'est la DÉRIVATION des seuils depuis le registre
 * d'exigences (RM-01), le JUGEMENT sur des vues injectées (RM-11), et le fait qu'un périmètre
 * vide produise un verdict DIT plutôt qu'un silence.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  controler,
  seuilsDepuisRegistre,
  routesDeLEspace,
  rendreLighthouserc,
  FAMILLES,
  RACINE_ESPACE,
  vueConforme,
  type Vue,
} from '../../../scripts/gates/perf-budgets';

const SCRIPT = 'scripts/gates/perf-budgets.ts';
const BUDGETS = 'perf/budgets.json';
const LIGHTHOUSERC = 'lighthouserc.json';
const REGISTRE = 'docs/requirements.json';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Le texte de REQ-GOV-028 tel qu'il est écrit dans le registre — jamais retapé ici. */
function texteDeLExigence(): string {
  const registre = JSON.parse(readFileSync(REGISTRE, 'utf8')) as {
    exigences: { id: string; texte: string }[];
  };
  const req = registre.exigences.find((e) => e.id === 'REQ-GOV-028');
  if (!req) throw new Error('REQ-GOV-028 a disparu du registre');
  return req.texte;
}

/** Les familles rougies par une vue — l'unité de mesure de tout ce fichier. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

/** Une vue conforme, plus une route AJOUTÉE sur le disque feint. */
function avecRoute(chemin: string): Vue {
  const v = vueConforme();
  return { ...v, fichiers: [...v.fichiers, chemin] };
}

/** La même, mais dont le fichier de budgets porte l'entrée demandée. */
function avecEntree(vue: Vue, entree: Record<string, unknown>): Vue {
  const b = JSON.parse(vue.budgets) as { sizeLimit: unknown[] };
  b.sizeLimit.push(entree);
  return { ...vue, budgets: JSON.stringify(b, null, 2) };
}

describe('REQ-GOV-028 — les seuils sont DÉRIVÉS du registre, ils ne sont pas tapés (RM-01)', () => {
  it('les quatre valeurs et le profil de laboratoire se lisent dans le texte de REQ-GOV-028', () => {
    expect(seuilsDepuisRegistre(texteDeLExigence())).toEqual({
      plafondKoGz: 75,
      lcpMs: 1800,
      cls: 0,
      inpMs: 100,
      profil: 'mobile',
    });
  });

  it('renverser le texte renverse l’attente : c’est une lecture, pas un littéral', () => {
    // Sans cette assertion, un `return 75` passerait le test précédent. C'est le contre-témoin
    // de la dérivation elle-même : on change la SOURCE et l'attente doit suivre.
    const renverse = texteDeLExigence()
      .replace('≤ 75 KB gz', '≤ 40 KB gz')
      .replace('lab mobile', 'lab desktop')
      .replace('LCP ≤ 1 800 ms', 'LCP ≤ 1 200 ms');
    const s = seuilsDepuisRegistre(renverse);
    expect(s.plafondKoGz).toBe(40);
    expect(s.profil).toBe('desktop');
    expect(s.lcpMs).toBe(1200);
  });

  it('un texte muet ne rend PAS un seuil par défaut : il lève', () => {
    // Un seuil par défaut serait le pire des deux mondes — la garde continuerait de juger, avec
    // une valeur que personne n'a décidée (RM-11 : aucun défaut sur ce que le test fait varier).
    expect(() => seuilsDepuisRegistre('Les budgets sont posés dans le dépôt.')).toThrow();
  });
});

describe('REQ-GOV-028 — une route sans budget ROUGIT, une route budgétée reste VERTE', () => {
  const route = `${RACINE_ESPACE}/mes-commissions/page.tsx`;

  it('route_sans_budget — la route est sur le disque, aucune entrée ne la nomme', () => {
    expect(familles(avecRoute(route))).toEqual(['route_sans_budget']);
  });

  it('la MÊME route, avec son entrée au plafond dérivé, est verte', () => {
    const vue = avecEntree(avecRoute(route), {
      name: '/mes-commissions',
      path: '.next/static/chunks/app/(espace)/mes-commissions/**/*.js',
      limit: '75 KB',
      gzip: true,
    });
    expect(controler(vue)).toEqual([]);
  });

  it('budget_orphelin — une entrée qui nomme une route absente du disque', () => {
    // Sans cette famille, on satisferait la garde en pré-remplissant le fichier de budgets :
    // le compte de routes budgétées monterait sans qu'aucune route existe.
    const vue = avecEntree(vueConforme(), {
      name: '/route-qui-nexiste-pas',
      path: '.next/static/chunks/app/x/**/*.js',
      limit: '75 KB',
      gzip: true,
    });
    expect(familles(vue)).toEqual(['budget_orphelin']);
  });

  it('entree_incomplete — une entrée sans `path` ne mesure rien, même avec un `limit` juste', () => {
    const vue = avecEntree(avecRoute(route), { name: '/mes-commissions', limit: '75 KB' });
    expect(familles(vue)).toEqual(['entree_incomplete']);
  });
});

describe('REQ-GOV-028 — « aucun cliquet n’est posé sous la mesure courante »', () => {
  const route = `${RACINE_ESPACE}/deposer/page.tsx`;
  const entree = (limit: string): Vue =>
    avecEntree(avecRoute(route), {
      name: '/deposer',
      path: '.next/static/chunks/app/(espace)/deposer/**/*.js',
      limit,
      gzip: true,
    });

  it('cliquet_sous_le_plafond — un budget ALIGNÉ sur ce qui existe est refusé', () => {
    // C'est la manœuvre que l'exigence nomme : on mesure 61 KB, on écrit 61 KB, la gate passe,
    // et le budget n'est plus un budget — c'est le reflet de l'état courant. Le plafond n'est
    // pas un champ libre : il est dérivé, et toute autre valeur rougit.
    expect(familles(entree('61 KB'))).toEqual(['cliquet_sous_le_plafond']);
  });

  it('plafond_relache — un budget au-dessus du plafond dérivé est refusé dans l’autre sens', () => {
    expect(familles(entree('92 KB'))).toEqual(['plafond_relache']);
  });

  it('la seule valeur acceptée est celle que le registre dicte', () => {
    expect(controler(entree('75 KB'))).toEqual([]);
  });
});

describe('REQ-GOV-028 — ce qui n’est pas une route ne réclame aucun budget (contre-témoins)', () => {
  it('un `layout.tsx`, un composant, un dossier privé `_` ne sont pas des routes', () => {
    const v = vueConforme();
    const vue: Vue = {
      ...v,
      fichiers: [
        ...v.fichiers,
        `${RACINE_ESPACE}/layout.tsx`,
        `${RACINE_ESPACE}/_composants/carte.tsx`,
        `${RACINE_ESPACE}/_composants/apercu/page.tsx`,
        `${RACINE_ESPACE}/mes-entreprises/composants/ligne.tsx`,
      ],
    };
    expect(controler(vue)).toEqual([]);
  });

  it('une route de la CONSOLE n’est pas une route de l’espace apporteur', () => {
    // Le périmètre de REQ-GOV-028 est « l'espace apporteur ». Élargir une garde au-delà de son
    // exigence la rend insatisfiable ailleurs, et une gate insatisfiable se fait sauter.
    const v = vueConforme();
    expect(
      controler({ ...v, fichiers: [...v.fichiers, 'src/app/(console)/clients/page.tsx'] })
    ).toEqual([]);
  });

  it('la route dérivée est le chemin Next : groupes retirés, segment dynamique gardé', () => {
    expect(
      routesDeLEspace([
        `${RACINE_ESPACE}/page.tsx`,
        `${RACINE_ESPACE}/d/[jeton]/page.tsx`,
        `${RACINE_ESPACE}/(plus)/documents/page.tsx`,
        `${RACINE_ESPACE}/_brouillon/page.tsx`,
        'src/app/(console)/page.tsx',
      ]).map((r) => r.route)
    ).toEqual(['/', '/d/[jeton]', '/documents']);
  });
});

describe('REQ-GOV-028 — le laboratoire LHCI : bloquant, mobile, et aux seuils du registre', () => {
  function avecLhci(muter: (c: Record<string, any>) => void): Vue {
    const v = vueConforme();
    const conf = JSON.parse(v.lighthouserc) as Record<string, any>;
    muter(conf);
    return { ...v, lighthouserc: JSON.stringify(conf, null, 2) + '\n' };
  }

  it('lhci_non_bloquant — une assertion en `warn` ne bloque RIEN : c’est une garde morte', () => {
    expect(
      familles(
        avecLhci((c) => {
          c.ci.assert.assertions['largest-contentful-paint'][0] = 'warn';
        })
      )
    ).toContain('lhci_non_bloquant');
  });

  it('lhci_hors_mobile — un profil de laboratoire `desktop` ne mesure pas ce que l’exigence vise', () => {
    expect(
      familles(
        avecLhci((c) => {
          c.ci.collect.settings.formFactor = 'desktop';
        })
      )
    ).toContain('lhci_hors_mobile');
  });

  it('seuil_divergent — une valeur d’assertion qui s’écarte du registre', () => {
    expect(
      familles(
        avecLhci((c) => {
          c.ci.assert.assertions['largest-contentful-paint'][1].maxNumericValue = 2500;
        })
      )
    ).toContain('seuil_divergent');
  });

  it('seuil_absent — une métrique de l’exigence qui n’a plus d’assertion du tout', () => {
    expect(
      familles(
        avecLhci((c) => {
          delete c.ci.assert.assertions['interaction-to-next-paint'];
        })
      )
    ).toContain('seuil_absent');
  });

  it('lighthouserc_perime — le fichier rendu ne correspond plus à la source des budgets', () => {
    // `lighthouserc.json` est DÉRIVÉ de `perf/budgets.json` : une main qui l'édite directement
    // crée une seconde source, et c'est toujours celle qui n'a pas été corrigée qui est lue.
    expect(
      familles(
        avecLhci((c) => {
          c.ci.collect.settings.screenEmulation = { mobile: true, disabled: false, width: 999 };
        })
      )
    ).toContain('lighthouserc_perime');
  });

  it('le rendu est déterministe, et c’est bien lui qui est sur le disque feint', () => {
    const v = vueConforme();
    const seuils = seuilsDepuisRegistre(v.registre);
    expect(rendreLighthouserc(seuils)).toBe(rendreLighthouserc(seuils));
    expect(rendreLighthouserc(seuils)).toBe(v.lighthouserc);
  });
});

describe('REQ-GOV-028 — « bloquants » : une étape muselée ne garde rien (LEC-13)', () => {
  it('etape_ci_muselee — une étape qui appelle la garde en `continue-on-error`', () => {
    const v = vueConforme();
    const ci = `${v.ci}\n      - name: Budgets de performance\n        run: pnpm perf:budgets\n        continue-on-error: true\n`;
    expect(familles({ ...v, ci })).toEqual(['etape_ci_muselee']);
  });

  it('la même étape SANS le musellement est verte — sinon la garde interdirait son propre câblage', () => {
    const v = vueConforme();
    const ci = `${v.ci}\n      - name: Budgets de performance\n        run: pnpm perf:budgets\n`;
    expect(controler({ ...v, ci })).toEqual([]);
  });
});

describe('REQ-GOV-028 — ne pas avoir pu lire n’est JAMAIS un vert', () => {
  it('source_illisible — le fichier de budgets a disparu ou n’est plus du JSON', () => {
    expect(familles({ ...vueConforme(), budgets: 'ceci n’est pas du JSON' })).toEqual([
      'source_illisible',
    ]);
  });

  it('source_illisible — REQ-GOV-028 a disparu du registre : la garde ne sait plus ce qu’elle attend', () => {
    expect(familles({ ...vueConforme(), registre: 'une exigence qui ne dit plus rien' })).toEqual([
      'source_illisible',
    ]);
  });
});

describe('REQ-GOV-028 — sur l’état RÉEL du dépôt : zéro route, et elle le DIT', () => {
  it('la garde est verte, et annonce le nombre de routes balayées', () => {
    const { code, sortie } = lancer();
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
    // Le compte est ce qui distingue « aucune route sans budget » de « je n'ai rien regardé ».
    expect(sortie).toMatch(/\d+ route\(s\) de l’espace balayée\(s\)/);
    expect(sortie).toContain('0 route(s) de l’espace balayée(s)');
    expect(sortie).toContain('ce vert ne juge AUCUNE route');
  });

  it(`sait rougir : ses ${FAMILLES.length} familles ont chacune un témoin`, () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`Les ${FAMILLES.length} familles rougissent`);
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces.length).toBe(FAMILLES.length);
  });

  it('`--verifier` confirme que les deux fichiers du dépôt sont bien le RENDU de REQ-GOV-028', () => {
    expect(lancer('--verifier').code).toBe(0);
    const seuils = seuilsDepuisRegistre(texteDeLExigence());
    expect(readFileSync(LIGHTHOUSERC, 'utf8')).toBe(rendreLighthouserc(seuils));
    // Et le plafond n'est écrit à la main dans AUCUNE entrée : chacune porte celui du registre.
    const budgets = JSON.parse(readFileSync(BUDGETS, 'utf8')) as {
      sizeLimit: { limit?: string }[];
    };
    for (const e of budgets.sizeLimit) expect(e.limit).toBe(`${seuils.plafondKoGz} KB`);
  });

  it('elle DIT si son étape de CI existe — les deux situations sont dites, aucune n’est tue', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const { sortie } = lancer();
    if (/pnpm\s+perf:budgets/.test(ci))
      expect(sortie).toContain(`appelée par .github/workflows/ci.yml`);
    else expect(sortie).toContain('n’est appelée par AUCUNE étape');
  });
});

describe('REQ-GOV-028 — ce que la phase 0 devra reprendre est ÉCRIT, et nommé', () => {
  const source = (): string => readFileSync(SCRIPT, 'utf8');

  it('le fichier de la garde nomme `QA-T20` et la gate qu’elle prépare', () => {
    expect(source()).toContain('QA-T20');
    expect(source()).toContain('perf:bundle');
  });

  it('il dit que l’INP de laboratoire ne se mesure pas sans interaction — le piège du voisin', () => {
    // Mesuré sur le dépôt voisin : `auditRan = 0` sur dix-huit passes. Une assertion posée sur un
    // audit qui ne tourne pas est vacante, et une assertion vacante est verte pour rien.
    expect(source()).toContain('interaction-to-next-paint');
  });
});
