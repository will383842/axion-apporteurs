// @req REQ-GOV-021
/**
 * UN CHEMIN CONSTRUIT SUR L'IDENTIFIANT DE SA PROPRE TÂCHE EST REFUSÉ LÀ OÙ IL NE DIT PLUS RIEN.
 *
 * Le gabarit `<dossier>/<id>` dit « pas encore connu ». Sur une tâche LIVRÉE, c'est faux : elle
 * sait ce qu'elle a touché. Sur une tâche de la phase COURANTE, c'est un masque : le composeur y
 * prouverait une disjonction de chemins qui n'existe pas. Seule une tâche de phase FUTURE garde
 * le droit de ne pas savoir — comptée et imprimée, pas refusée.
 *
 * TÉMOIN À DEUX FACES : une tâche dont un chemin vaut son propre identifiant fait sortir la garde
 * en code non nul et la NOMME ; le registre réparé la fait sortir en zéro, avec le compte des
 * tâches et des chemins réellement confrontés.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import { LIVREE } from '../../../scripts/lot/avancement';
import * as garde from '../../../scripts/gates/gov-attributions';
import { phaseCouranteDe } from '../../../scripts/gates/gov-conventions';
import {
  analyser,
  chargerSources,
  rendre,
  type Sources,
  type Tache,
} from '../../../scripts/gates/gov-attributions';

const REEL = chargerSources(fichiersSuivis());

/** Les sources du dépôt, VIDÉES de tout ce qu'un témoin ne déclare pas. */
const VIDE: Sources = {
  ...REEL,
  taches: [],
  gates: [],
  entetes: [],
  citations: [],
  dettesGate: [],
  dettesLot: [],
  exemptionsFigees: [],
  // GOV-084 : sans tâche, chaque script suivi de `scripts/gates/` serait un script sans porteur.
  // GOV-118 : la dimension est NON LUE (`undefined`), pas lue et vide — une liste vide est un refus.
  scriptsDeGarde: undefined,
};

/** Une tâche de la phase 0, NON LIVRÉE, aux chemins réels : elle fixe la phase courante. */
const ANCRE: Tache = {
  id: 'GOV-900',
  paths: ['scripts/gates/ancre.ts'],
  tests: {},
  owner: null,
  lot: null,
  pr: null,
  statut: 'a_faire',
  phase: 0,
};
const gabarit = (id: string, champs: Partial<Tache>): Tache => ({
  ...ANCRE,
  id,
  paths: [`docs/gouvernance/${id}`],
  ...champs,
});
const juger = (taches: Tache[]) => {
  const v = analyser({ ...VIDE, taches });
  return { v, rendu: rendre(v), siennes: v.fautes.filter((f) => f.famille === 'chemin_gabarit') };
};

describe('REQ-GOV-021 — TÉMOINS : le gabarit est refusé là où « pas encore connu » est faux', () => {
  it('REQ-GOV-021 — une tâche LIVRÉE dont un chemin vaut son propre identifiant fait sortir la garde en code non nul, et la NOMME', () => {
    const { rendu, siennes } = juger([
      ANCRE,
      gabarit('GOV-901', {
        statut: 'fusionnee',
        paths: ['docs/gouvernance/GOV-901', 'scripts/x.ts'],
      }),
    ]);
    expect(siennes).toHaveLength(1);
    expect(siennes[0]!.message).toContain('GOV-901');
    expect(siennes[0]!.message).toContain('docs/gouvernance/GOV-901');
    expect(siennes[0]!.message).toContain('fusionnee');
    expect(rendu.code).toBe(1);
    expect(rendu.lignes.join('\n')).toContain('[chemin_gabarit]');
  });

  it('REQ-GOV-021 — une tâche NON LIVRÉE de la phase COURANTE qui garde un gabarit est refusée : le composeur y prouverait une disjonction fausse', () => {
    const { rendu, siennes } = juger([ANCRE, gabarit('GOV-902', { statut: 'a_faire', phase: 0 })]);
    expect(siennes).toHaveLength(1);
    expect(siennes[0]!.message).toContain('GOV-902');
    expect(siennes[0]!.message).toContain('phase courante');
    expect(rendu.code).toBe(1);
  });

  it('REQ-GOV-021 — une tâche sans phase, ou sans statut, ne se dit pas « future » : ÉCHEC FERMÉ, refusée', () => {
    const { siennes } = juger([
      ANCRE,
      gabarit('GOV-903', { phase: undefined }),
      gabarit('GOV-904', { statut: undefined, phase: 3 }),
    ]);
    expect(siennes.map((f) => /GOV-90[34]/.exec(f.message)?.[0]).sort()).toEqual([
      'GOV-903',
      'GOV-904',
    ]);
  });

  // GOV-118 — un gabarit se reconnaissait à sa seule FORME : un vrai fichier nommé comme la tâche
  // aurait été refusé comme un gabarit, ou exempté comme « pas encore connu ». La forme ne suffit
  // plus : un chemin qui EXISTE dans les fichiers suivis, comme fichier ou comme dossier, est réel.
  it('REQ-GOV-021 — TÉMOIN (GOV-118) : un chemin à la forme d’un gabarit qui EXISTE comme fichier suivi est un chemin réel', () => {
    const t = gabarit('GOV-906', { statut: 'fusionnee' });
    const reel = analyser({
      ...VIDE,
      fichiersSuivis: ['docs/gouvernance/GOV-906'],
      taches: [ANCRE, t],
    });
    expect(reel.fautes.filter((f) => f.famille === 'chemin_gabarit')).toEqual([]);
    const absent = analyser({ ...VIDE, fichiersSuivis: [], taches: [ANCRE, t] });
    expect(absent.fautes.filter((f) => f.famille === 'chemin_gabarit')).toHaveLength(1);
  });

  it('REQ-GOV-021 — TÉMOIN (GOV-118) : un DOSSIER suivi au nom de la tâche est aussi un chemin réel', () => {
    const t = gabarit('GOV-907', { statut: 'fusionnee' });
    const v = analyser({
      ...VIDE,
      fichiersSuivis: ['docs/gouvernance/GOV-907/note.md'],
      taches: [ANCRE, t],
    });
    expect(v.fautes.filter((f) => f.famille === 'chemin_gabarit')).toEqual([]);
  });

  it('REQ-GOV-021 — une tâche livrée qui garde DEUX gabarits est nommée pour chacun', () => {
    const { siennes } = juger([
      ANCRE,
      gabarit('GOV-905', {
        statut: 'fusionnee',
        paths: ['docs/gouvernance/GOV-905', 'axionia/GOV-905'],
      }),
    ]);
    expect(siennes).toHaveLength(2);
    expect(siennes.map((f) => f.message).join('\n')).toContain('axionia/GOV-905');
  });
});

describe('REQ-GOV-021 — CONTRE-TÉMOINS : ce qui n’est pas refusé, et pourquoi', () => {
  it('REQ-GOV-021 — un gabarit de phase FUTURE est admis, COMPTÉ et IMPRIMÉ avec sa phase', () => {
    const { v, rendu, siennes } = juger([ANCRE, gabarit('GOV-906', { phase: 2 })]);
    expect(siennes).toEqual([]);
    expect(rendu.code).toBe(0);
    expect(v.gabarits?.admis).toEqual([
      { tache: 'GOV-906', chemin: 'docs/gouvernance/GOV-906', phase: 2 },
    ]);
    const texte = rendu.lignes.join('\n');
    expect(texte).toContain('GOV-906');
    expect(texte).toContain('docs/gouvernance/GOV-906');
    expect(texte).toContain('phase 2');
  });

  it('REQ-GOV-021 — un chemin qui porte l’identifiant ailleurs qu’en DERNIER segment, ou l’identifiant d’une AUTRE tâche, n’est pas un gabarit', () => {
    const { siennes } = juger([
      ANCRE,
      gabarit('GOV-907', {
        statut: 'fusionnee',
        paths: ['docs/GOV-907/note.md', 'docs/x/GOV-900'],
      }),
    ]);
    expect(siennes).toEqual([]);
  });
});

describe('REQ-GOV-021 — la phase courante de la garde est CELLE de gov:conventions', () => {
  const vue = (taches: readonly Tache[]) =>
    taches.map((t) => ({
      id: t.id,
      repo: t.repo ?? 'partners',
      paths: t.paths ?? [],
      phase: t.phase,
      statut: t.statut,
    }));
  it('REQ-GOV-021 — les deux écritures rendent la même phase, sur des cas faits pour les séparer et sur le registre réel', () => {
    const cas: Tache[][] = [
      [],
      [ANCRE],
      [{ ...ANCRE, statut: 'fusionnee' }],
      [
        { ...ANCRE, statut: 'fusionnee' },
        { ...ANCRE, id: 'GOV-910', phase: 2 },
      ],
      [
        { ...ANCRE, phase: undefined },
        { ...ANCRE, id: 'GOV-911', phase: 3 },
      ],
      [
        { ...ANCRE, statut: undefined },
        { ...ANCRE, id: 'GOV-912', phase: -1, statut: 'fusionnee' },
      ],
      [
        { ...ANCRE, phase: 2, statut: 'fusionnee' },
        { ...ANCRE, id: 'GOV-913', phase: -1, statut: 'fusionnee' },
      ],
      REEL.taches,
    ];
    for (const taches of cas) {
      expect(garde.phaseCouranteDesTaches(taches), JSON.stringify(taches.slice(0, 3))).toBe(
        phaseCouranteDe(vue(taches))
      );
    }
    expect(garde.phaseCouranteDesTaches(REEL.taches)).toBeDefined();
  });
});

describe('REQ-GOV-021 — le registre du dépôt, réparé', () => {
  type Brute = { id: string; paths?: string[]; statut?: string; phase?: number };
  const brutes = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Brute[] })
    .taches;

  it('REQ-GOV-021 — le registre réparé sort en ZÉRO, avec le compte des tâches et des chemins réellement confrontés', () => {
    const v = analyser(REEL);
    expect(v.fautes.filter((f) => f.famille === 'chemin_gabarit').map((f) => f.message)).toEqual(
      []
    );
    const chemins = brutes.reduce((n, t) => n + (t.paths ?? []).length, 0);
    expect(v.gabarits?.taches).toBe(brutes.length);
    expect(v.gabarits?.chemins).toBe(chemins);
    expect(brutes.length, 'le registre est vide : le compte ne prouverait rien').toBeGreaterThan(0);
    const rendu = rendre(v);
    expect(rendu.code).toBe(0);
    expect(rendu.lignes.join('\n')).toContain(
      `${brutes.length} tâche(s) et ${chemins} chemin(s) confrontés`
    );
  });

  it('REQ-GOV-021 — aucune tâche LIVRÉE ne garde un gabarit, quelle que soit sa phase — relu sans passer par la garde', () => {
    const fautives = brutes.filter(
      (t) =>
        t.statut !== undefined &&
        LIVREE.has(t.statut) &&
        (t.paths ?? []).some((p) => posix.basename(p) === t.id)
    );
    expect(fautives.map((t) => t.id)).toEqual([]);
  });

  it('REQ-GOV-021 — aucune tâche de la phase courante ne garde un gabarit — relu sans passer par la garde', () => {
    const restantes = brutes.filter((t) => !LIVREE.has(t.statut ?? '')).map((t) => t.phase!);
    const courante = Math.min(...restantes);
    const fautives = brutes.filter(
      (t) => t.phase! <= courante && (t.paths ?? []).some((p) => posix.basename(p) === t.id)
    );
    expect(fautives.map((t) => t.id)).toEqual([]);
  });

  it('REQ-GOV-021 — la liste figée des gabarits livrés est réduite à ce qui reste : RIEN, et elle n’existe plus', () => {
    expect('DETTE_GABARIT_LIVREE' in garde).toBe(false);
    expect(Object.keys(VIDE)).not.toContain('dettesGabarit');
  });

  it('REQ-GOV-021 — une tâche livrée porte le fichier qu’elle a modifié sans le déclarer', () => {
    const t = brutes.find((x) => x.id === 'GOV-036');
    expect(t?.paths).toContain('scripts/lot/fichiers-suivis.ts');
  });
});
