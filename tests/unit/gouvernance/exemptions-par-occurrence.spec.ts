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
