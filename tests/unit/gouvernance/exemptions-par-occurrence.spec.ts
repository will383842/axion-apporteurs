// @req REQ-GOV-021
// @req REQ-GOV-003
/**
 * UNE EXEMPTION PORTE SUR UNE OCCURRENCE, JAMAIS SUR UN SITE (GOV-074).
 *
 * LE DÉFAUT. Une déclaration posée pour un fichier valait pour TOUT le fichier : une attribution
 * NEUVE ajoutée dans le même en-tête passait sans être jugée. Les exemptions « paths gabarit » des
 * tâches non livrées n'étaient tenues par aucun cliquet. Et un identifiant écrit en minuscules, ou
 * avec un trait d'union non ASCII, n'était pas vu du tout.
 *
 * CE QUE CE FICHIER TIENT, À DEUX FACES (RM-02). Une attribution fausse ajoutée dans un en-tête
 * déjà exempté, puis un identifiant en minuscules, font sortir la garde en code non nul en NOMMANT
 * l'occurrence (fichier:ligne) ; le dépôt la fait sortir en zéro, avec le compte des occurrences
 * et des exemptions réellement confrontées. Une exemption sans second producteur est FIGÉE,
 * occurrence par occurrence : une occurrence neuve rougit, une entrée qui ne sert plus aussi.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import { LIVREE } from '../../../scripts/lot/avancement';
import {
  analyser,
  chargerSources,
  CITATIONS_DECLAREES,
  type Sources,
  type Tache,
} from '../../../scripts/gates/gov-attributions';

const SOURCES = chargerSources(fichiersSuivis());

/** Les sources du dépôt, un en-tête prolongé d'une ligne (la 20e, dernière lue). */
function avecLigne(fichier: string, ligne: string): Sources {
  const entetes = SOURCES.entetes.map((e) =>
    e.fichier === fichier ? { ...e, lignes: [...e.lignes.slice(0, 19), ligne] } : e
  );
  expect(
    entetes.some((e) => e.fichier === fichier),
    `${fichier} n’est pas un en-tête lu`
  ).toBe(true);
  return { ...SOURCES, entetes };
}
/**
 * Le verdict, lu comme le binaire le rend : code 1 dès une faute (la décision de sortie est vue
 * par le témoin d’effet de refus-de-rendre-et-de-publier.spec.ts), et les fautes NOMMÉES.
 */
const verdict = (s: Sources) => {
  const { fautes } = analyser(s);
  return {
    code: fautes.length > 0 ? 1 : 0,
    lignes: fautes.map((f) => `[${f.famille}] ${f.message}`),
  };
};

describe('REQ-GOV-021 — une déclaration absout UNE occurrence, pas le site', () => {
  it('REQ-GOV-021 — TÉMOIN : une attribution NEUVE dans un en-tête déjà exempté rougit, occurrence nommée', () => {
    // `scripts/lot/corps-de-pr.ts` porte des déclarations « contexte » pour GOV-035 (lignes 4 et 6).
    // Une TROISIÈME mention, à la ligne 20, n'a été vue par personne.
    const r = verdict(avecLigne('scripts/lot/corps-de-pr.ts', ' * voir aussi GOV-035.'));
    expect(r.code).toBe(1);
    const l = r.lignes.join('\n');
    expect(l).toContain('mention_hors_paths');
    expect(l).toContain('scripts/lot/corps-de-pr.ts:20');
  });

  it('REQ-GOV-021 — CONTRE-TÉMOIN : le dépôt tel quel sort en zéro', () => {
    expect(verdict(SOURCES).code).toBe(0);
  });
});

describe('REQ-GOV-003 — la reconnaissance couvre la casse et les traits d’union non usuels', () => {
  it('REQ-GOV-003 — TÉMOIN : un identifiant en MINUSCULES est vu, jugé, et son occurrence nommée', () => {
    const r = verdict(avecLigne('scripts/gates/gh-sur.js', ' * voir gov-037 pour la suite.'));
    expect(r.code).toBe(1);
    const l = r.lignes.join('\n');
    expect(l).toContain('scripts/gates/gh-sur.js:20');
    expect(l).toContain('gov-037');
  });

  it('REQ-GOV-003 — TÉMOIN : un trait d’union INSÉCABLE ne cache plus l’identifiant', () => {
    const r = verdict(avecLigne('scripts/gates/gh-sur.js', ' * voir GOV‑037 pour la suite.'));
    expect(r.code).toBe(1);
    expect(r.lignes.join('\n')).toContain('scripts/gates/gh-sur.js:20');
  });

  it('REQ-GOV-003 — CONTRE-TÉMOIN : la minuscule d’une tâche qui POSSÈDE le fichier reste verte', () => {
    expect(
      verdict(avecLigne('scripts/gates/gov-attributions.ts', ' * rappel : gov-037.')).code
    ).toBe(0);
  });
});

describe('REQ-GOV-021 — une exemption sans second producteur est FIGÉE, occurrence par occurrence', () => {
  /** Une tâche NON LIVRÉE dont un path est un gabarit — son exemption n'a pas de second producteur. */
  const gabaritNonLivree = SOURCES.taches.find(
    (t: Tache) =>
      t.statut !== undefined &&
      !LIVREE.has(t.statut) &&
      (t.paths ?? []).some((p) => p.slice(p.lastIndexOf('/') + 1) === t.id) &&
      !(t.paths ?? []).includes('scripts/gates/gh-sur.js')
  )!;

  it('REQ-GOV-021 — TÉMOIN : une occurrence NEUVE d’une tâche à gabarit non livrée rougit', () => {
    expect(
      gabaritNonLivree,
      'aucune tâche non livrée à gabarit : le témoin ne peut être choisi'
    ).toBeDefined();
    const r = verdict(avecLigne('scripts/gates/gh-sur.js', ` * voir ${gabaritNonLivree.id}.`));
    expect(r.code).toBe(1);
    const l = r.lignes.join('\n');
    expect(l).toContain('exemption_non_figee');
    expect(l).toContain('scripts/gates/gh-sur.js:20');
  });

  it('REQ-GOV-021 — TÉMOIN : une entrée figée qui ne sert plus rougit en `dette_perimee`', () => {
    const r = verdict({
      ...SOURCES,
      exemptionsFigees: [
        ...SOURCES.exemptionsFigees,
        {
          nature: 'mention_paths_non_resolus',
          tache: gabaritNonLivree.id,
          site: 'scripts/nulle-part.ts:1',
        },
      ],
    });
    expect(r.code).toBe(1);
    expect(r.lignes.join('\n')).toContain('dette_perimee');
  });
});

/**
 * LE DÉFAUT RESTANT : TROIS CLÉS POUR UN MÊME LIEU, ET DEUX D'ENTRE ELLES AU GRAIN DU SITE.
 *   — la dette des tâches livrées à gabarit (retirée depuis : ces gabarits sont réparés, et refusés)
 *     figeait un SITE et un NOMBRE : une mention déplacée d'une ligne à l'autre du même en-tête
 *     gardait le compte, donc restait absoute sans avoir été vue ;
 *   — une chaîne de `docs/gates.json` se rangeait sous le chemin de la gate (déclarations), sous
 *     la gate ET son script (dette figée), ou sous le script SEUL (exemptions figées) : repointer le
 *     script laissait la déclaration absoudre une mention jugée contre un AUTRE fichier, et deux
 *     gates au même script partageaient la même clé figée ;
 *   — la clé figée d'une chaîne de `docs/gates.json` ne portait pas la ligne.
 * LA MESURE : une seule clé d'occurrence (lieu jugé, ligne), et chaque entrée n'en absout qu'une.
 */
describe('REQ-GOV-021 — une seule clé par occurrence, pour chaque registre', () => {
  const exemptions = analyser(SOURCES).exemptions;
  /** Les jetons d'une ligne qui désignent une tâche : dérivés du backlog, jamais tapés. */
  const ids = new Set(SOURCES.taches.map((t) => t.id));
  const jetons = (l: string) => l.split(/[^A-Za-z0-9-]+/).filter((j) => ids.has(j));

  /**
   * Rejoué sur FIXTURES : la dette des tâches livrées à gabarit, qui figeait ces occurrences, n'existe
   * plus — le dépôt n'en porte aucune. Le même déplacement se joue sur le registre qui reste
   * (`exemptionsFigees`), à la même clé (fichier, ligne) ; et la tâche livrée à gabarit, déplacée
   * pareil, rougit à sa nouvelle ligne sans qu'aucun registre ne puisse l'absoudre.
   */
  it('REQ-GOV-021 — TÉMOIN : une mention FIGÉE, déplacée à une autre ligne du même en-tête, rougit à sa nouvelle ligne', () => {
    const FICHIER = 'scripts/gates/porte.ts';
    const proprio: Tache = { id: 'GOV-100', paths: [FICHIER], tests: {}, statut: 'fusionnee' };
    const courante: Tache = {
      ...proprio,
      id: 'GOV-102',
      paths: ['scripts/gates/ancre.ts'],
      statut: 'a_faire',
      phase: 0,
    };
    const future: Tache = {
      ...proprio,
      id: 'GOV-003',
      paths: ['docs/gouvernance/GOV-003'],
      statut: 'a_faire',
      phase: 1,
    };
    const livree: Tache = {
      ...proprio,
      id: 'GOV-004',
      paths: ['docs/gouvernance/GOV-004'],
      statut: 'fusionnee',
    };
    // La mention, à la ligne 3 puis déplacée à la 20e, dernière lue.
    const lignes = (n: number, id: string) =>
      Array.from({ length: 20 }, (_, i) => (i === n - 1 ? ` * voir ${id}.` : ' *'));
    const cas = (id: string, n: number): Sources => ({
      taches: [proprio, courante, future],
      gates: [],
      postes: [],
      journal: '',
      plancherJournal: 0,
      entetes: [{ fichier: FICHIER, lignes: lignes(n, id) }],
      citations: [],
      dettesGate: [],
      dettesLot: [],
      exemptionsFigees: [
        { nature: 'mention_paths_non_resolus', tache: future.id, site: `${FICHIER}:3` },
      ],
    });
    // Contre-témoin : à sa ligne figée, la mention est absoute.
    expect(verdict(cas(future.id, 3)).code).toBe(0);
    // Témoin : déplacée, elle rougit à sa nouvelle ligne, et l'entrée figée ne sert plus.
    const r = verdict(cas(future.id, 20));
    expect(r.code).toBe(1);
    const l = r.lignes.join('\n');
    expect(l).toContain(`${FICHIER}:20`);
    expect(l).toContain('exemption_non_figee');
    expect(l).toContain('dette_perimee');
    // Témoin : la tâche LIVRÉE à gabarit, au même endroit, rougit à sa ligne — et son gabarit aussi.
    const livr = verdict({
      ...cas(livree.id, 20),
      taches: [proprio, courante, future, livree],
      exemptionsFigees: [],
    });
    expect(livr.code).toBe(1);
    const ll = livr.lignes.join('\n');
    expect(ll).toContain(`[mention_hors_paths] ${FICHIER}:20`);
    expect(ll).toContain('[chemin_gabarit]');
  });

  /** Une gate dont une chaîne porte une déclaration `contexte`, et cette déclaration. */
  const gateDeclaree = () => {
    for (const g of SOURCES.gates) {
      const c = CITATIONS_DECLAREES.find(
        (x) =>
          x.nature === 'contexte' &&
          x.ou.startsWith('docs/gates.json') &&
          Object.values(g).some((v) => typeof v === 'string' && jetons(v).includes(x.id)) &&
          x.ou.includes(g.script.split('#')[0] as string)
      );
      if (c) return { g, c };
    }
    for (const g of SOURCES.gates) {
      const c = CITATIONS_DECLAREES.find(
        (x) => x.nature === 'contexte' && x.ou.startsWith(`docs/gates.json:${g.id}.`)
      );
      if (c) return { g, c };
    }
    return undefined;
  };

  it('REQ-GOV-021 — TÉMOIN : une déclaration « contexte » d’une chaîne de docs/gates.json ne suit pas son script repointé', () => {
    const trouve = gateDeclaree();
    expect(
      trouve,
      'aucune déclaration contexte sur docs/gates.json : rien à repointer'
    ).toBeDefined();
    const { g, c } = trouve!;
    const NEUF = 'scripts/gates/sonde-repointee.ts';
    // La tâche de la gate est retirée : seule la mention déclarée reste à juger contre le script neuf.
    const gates = SOURCES.gates.map((x) =>
      x === g ? { ...x, script: NEUF, tache: undefined } : x
    );
    const r = verdict({ ...SOURCES, gates });
    expect(r.code).toBe(1);
    const perimees = r.lignes.filter((x) => x.startsWith('[citation_perimee]'));
    expect(perimees.join('\n'), 'la déclaration a suivi le script repointé').toContain(c.id);
    expect(r.lignes.some((x) => x.startsWith('[mention_hors_paths]') && x.includes(c.id))).toBe(
      true
    );
  });

  it('REQ-GOV-021 — TÉMOIN : deux gates au MÊME script ne partagent pas une exemption figée', () => {
    // Une gate figée en `gate_paths_*` : son attribution passe à une gate NEUVE au même script.
    const e = exemptions.find((x) => /^gate_paths_/.test(x.nature));
    expect(e, 'aucune exemption figée de gate : rien à déplacer').toBeDefined();
    const g = SOURCES.gates.find(
      (x) =>
        x.tache === e!.tache && e!.site === `docs/gates.json:${x.id} (${x.script.split('#')[0]})`
    )!;
    const gates = [
      ...SOURCES.gates.map((x) => (x === g ? { ...x, tache: undefined } : x)),
      { id: 'sonde-meme-script', script: g.script, tache: g.tache },
    ];
    const r = verdict({ ...SOURCES, gates });
    expect(r.code).toBe(1);
    const l = r.lignes.join('\n');
    expect(l).toContain('exemption_non_figee');
    expect(l).toContain('sonde-meme-script');
  });

  it('REQ-GOV-021 — TÉMOIN : une mention figée d’une chaîne de docs/gates.json, repoussée à une autre LIGNE de la chaîne, rougit', () => {
    // Une exemption figée sur un champ de PREMIER niveau, chaîne simple d'une gate : le site imprimé
    // est « docs/gates.json:<gate>.<champ> (<script>) », relu ici sans passer par la garde.
    const cible = exemptions
      .filter((x) => /^mention_paths_/.test(x.nature))
      .flatMap((x) =>
        SOURCES.gates.flatMap((g) =>
          Object.keys(g)
            .filter(
              (champ) =>
                typeof g[champ] === 'string' &&
                x.site === `docs/gates.json:${g.id}.${champ} (${g.script.split('#')[0]})`
            )
            .map((champ) => ({ g, champ }))
        )
      )[0];
    expect(cible, 'aucune exemption figée sur une chaîne simple de docs/gates.json').toBeDefined();
    const { g, champ } = cible!;
    const gates = SOURCES.gates.map((x) =>
      x === g ? { ...x, [champ]: `ligne ajoutée\n${String(x[champ])}` } : x
    );
    const r = verdict({ ...SOURCES, gates });
    expect(r.code).toBe(1);
    expect(r.lignes.join('\n')).toContain('exemption_non_figee');
  });

  it('REQ-GOV-021 — CONTRE-TÉMOIN : les mêmes sources, rien de déplacé, sortent en zéro', () => {
    expect(verdict({ ...SOURCES, gates: [...SOURCES.gates] }).code).toBe(0);
  });
});

describe('REQ-GOV-021 — le binaire sur le dépôt : zéro, et les comptes réellement confrontés', () => {
  it('REQ-GOV-021 — VERT : exit 0, occurrences et exemptions comptées', () => {
    const v = analyser(SOURCES);
    const sortie = execFileSync('npx', ['tsx', 'scripts/gates/gov-attributions.ts'], {
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true,
    });
    expect(v.occurrences).toBeGreaterThan(0);
    expect(sortie).toContain(`${v.occurrences} occurrence(s) d’identifiant confrontée(s)`);
    expect(sortie).toContain(`${v.exemptions.length} exemption(s)`);
  }, 120_000);
});
