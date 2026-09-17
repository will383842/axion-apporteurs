/**
 * GOV-041 — la cloture ecrit un statut sur une entree qu'elle n'a pas verifiee.
 *
 * @req REQ-GOV-021
 * @req REQ-GOV-026
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI CHAQUE BLOC EXISTE.
 *
 *   (1) UNE TACHE ETRANGERE AU LOT PASSAIT. Mesure du 2026-09-09 : un dixieme `resultat.json`
 *       depose pour une tache d'un AUTRE lot, jamais dans la PR, a fait ecrire DIX `fusionnee` sans
 *       un mot, puis `gov:check` 15/15 et `vitest` 614/614. Le script posait `t.lot` SANS CONDITION, et ne
 *       lisait NULLE PART la liste des taches que le lot porte. Le refus s'appelle
 *       `tache_etrangere_au_lot`, et il est pose AVANT toute ecriture — donc sur les DEUX branches
 *       (celle qui ecrit `fusionnee` et celle qui recompte la tentative), pas sur celle ou le defaut
 *       a ete vu. *Un controle range sous la condition qui l'a fait naitre garde la moitie des cas.*
 *
 *   (2) UN `lotId` ABSENT ETAIT PERMIS LA OU UN `lotId` FAUX ETAIT REFUSE. Le controle s'ecrivait
 *       `if (rendu.lotId && rendu.lotId !== lotId)` : une ABSENCE lue comme une AUTORISATION. Le
 *       refus s'appelle `lot_du_rendu_absent`, et le refus du `lotId` FAUX reste intact — son
 *       contre-temoin de non-regression est ci-dessous.
 *
 *   (3) LE PILOTE EST EXERCE, PAS RELU. Les deux refus vivent dans une fonction PURE et exportee,
 *       mais le cablage entre `principal()` et elle ne serait garde par rien si aucun temoin ne
 *       lancait le SCRIPT. Le bloc « LE SCRIPT ENTIER » le lance dans un depot jetable — jamais
 *       dans l'arbre de travail, ou il ecrirait `docs/tasks.json` au milieu de la passe.
 *
 * ⚠️ CE FICHIER JUGE UN ARTEFACT QUE LE DEPOT NE VOIT PAS. `docs/lots/` est en `.gitignore` :
 * `lot.json` et `resultat.json` n'existent dans aucun historique, sur aucune branche. Toutes les
 * fixtures d'ici sont donc PRODUITES (RM-03), jamais recopiees d'un etat suivi — et c'est aussi la
 * raison pour laquelle le perimetre d'un lot a une SECONDE source, tracee celle-la : le champ `lot`
 * de `docs/tasks.json`.
 *
 * ⛔ HORS PERIMETRE, ET CE N'EST PAS UN OUBLI : le troisieme trou de la liste du 2026-09-09 — « un
 * sha inexistant passe » pour une tache LOCALE — est porte par GOV-042. Rien ici ne le recouvre.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * ⚠️ CET IMPORT DIFFERE EST LUI-MEME UN TEMOIN, ET C'EST LUI QUI A RENDU LE PREMIER ROUGE.
 * Jusqu'a cette tache, `scripts/lot/cloture.ts` LISAIT SES ARGUMENTS ET SES FICHIERS AU SEUL FAIT
 * D'ETRE IMPORTE : un `import` statique levait `Argument --lot manquant.` a la collecte et emportait
 * le fichier entier. Aucun test ne pouvait donc appeler sa regle, et le seul temoin possible aurait
 * ete la lecture du TEXTE du source — une garde qui ne garde rien. Le module s'importe desormais
 * sans effet (`LANCE_EN_SCRIPT`, le patron de `scripts/plan-state/build.ts` et de
 * `scripts/lot/composer.ts`), et la forme differee est CONSERVEE pour que le temoin
 * « importer n'a aucun effet » ci-dessous puisse observer l'import lui-meme.
 */
type ModuleDeCloture = typeof import('../../../scripts/lot/cloture');
const charger = (): Promise<ModuleDeCloture> => import('../../../scripts/lot/cloture');

type TacheDeFixture = {
  id: string;
  titre: string;
  statut: string;
  owner?: string | null;
  lot?: string | null;
  branch?: string | null;
  pr?: number | null;
  attempts?: number;
  motif?: string | null;
  repo?: string;
};

const tache = (id: string, extra: Partial<TacheDeFixture> = {}): TacheDeFixture => ({
  id,
  titre: id,
  statut: 'a_faire',
  owner: null,
  lot: null,
  branch: null,
  pr: null,
  attempts: 0,
  motif: null,
  repo: 'partners',
  ...extra,
});

/** Un resultat de dev FUSIONNE — la branche qui ecrit `fusionnee`. */
const livree = (id: string, pr: number) => ({
  dev: { taskId: id, branch: `t/${id.toLowerCase()}`, pr, stop: null },
  fusion: {
    pr,
    sha: `${id.toLowerCase().replace(/-/g, '')}0123456789abcdef01234567`,
    fusionneeAt: '2026-09-17T10:00:00Z',
    atterri: true,
  },
});

/** Un resultat REFUSE — l'AUTRE branche d'ecriture, celle qui recompte la tentative. */
const refusee = (id: string) => ({
  dev: { taskId: id, branch: `t/${id.toLowerCase()}`, pr: null, stop: null },
  fusion: null,
  refuse: true,
  motif: 'refusee en revue',
});

/**
 * Les cinq membres du lot temoin. ⚠️ L'INTRUS EST GLISSE AU MILIEU, JAMAIS EN QUEUE : un temoin
 * construit contre le DERNIER element d'une liste ne distingue pas « tous » de « le dernier », et
 * le defaut d'origine — un dixieme resultat AJOUTE — se serait laisse garder par un controle qui ne
 * regarde que la fin.
 */
const MEMBRES = ['GOV-039', 'GOV-041', 'GOV-043', 'GOV-044', 'GOV-056'];
const INTRUS = 'GOV-035';

// ── (1) une tache etrangere au lot est un REFUS NOMME ────────────────────────

describe('REQ-GOV-026 — la cloture n’ecrit que sur les entrees que le lot declare', () => {
  it('REQ-GOV-026 — un resultat pour une tache HORS du lot est refuse, et la tache est NOMMEE', async () => {
    const { controlerLePerimetre } = await charger();
    const rendu = {
      lotId: 'L0-01',
      resultats: [
        livree('GOV-039', 101),
        livree('GOV-041', 102),
        // 🔴 L'INTRUS, AU MILIEU. C'est la forme exacte du 2026-09-09.
        livree(INTRUS, 999),
        livree('GOV-043', 103),
        livree('GOV-044', 104),
        livree('GOV-056', 105),
      ],
    };
    const refus = controlerLePerimetre('L0-01', rendu, MEMBRES);
    expect(refus.map((r) => r.famille)).toEqual(['tache_etrangere_au_lot']);
    expect(refus[0]!.message).toContain(INTRUS);
    expect(refus[0]!.message).toContain('L0-01');
  });

  it('REQ-GOV-026 — CONTRE-TEMOIN : les cinq resultats legitimes ne produisent AUCUN refus', async () => {
    const { controlerLePerimetre } = await charger();
    const rendu = { lotId: 'L0-01', resultats: MEMBRES.map((id, i) => livree(id, 100 + i)) };
    expect(controlerLePerimetre('L0-01', rendu, MEMBRES)).toEqual([]);
  });

  it('REQ-GOV-026 — l’intrus est refuse AUSSI quand son resultat est un REFUS : l’autre branche d’ecriture', async () => {
    // ⚠️ LE CRAN QU'ON OUBLIE. `t.lot = lotId`, `t.attempts++` et `t.statut = 'bloquee'` sont ecrits
    // sur la branche NON FUSIONNEE, celle ou le defaut n'a jamais ete vu. Un refus pose dans la
    // branche `fusionnee` aurait laisse un intrus se faire recompter et bloquer en silence.
    const { controlerLePerimetre } = await charger();
    const rendu = { lotId: 'L0-01', resultats: [livree('GOV-039', 101), refusee(INTRUS)] };
    const refus = controlerLePerimetre('L0-01', rendu, MEMBRES);
    expect(refus.map((r) => r.famille)).toEqual(['tache_etrangere_au_lot']);
    expect(refus[0]!.message).toContain(INTRUS);
  });

  it('REQ-GOV-026 — un intrus nomme par `stops` SEUL est refuse : `stops` est un second chemin d’entree', async () => {
    const { controlerLePerimetre } = await charger();
    const rendu = {
      lotId: 'L0-01',
      resultats: [livree('GOV-039', 101)],
      stops: [{ tache: INTRUS, motif: 'hypothese absente', ref: 'D-00' }],
    };
    const refus = controlerLePerimetre('L0-01', rendu, MEMBRES);
    expect(refus.map((r) => r.famille)).toEqual(['tache_etrangere_au_lot']);
    expect(refus[0]!.message).toContain(INTRUS);
  });

  it('REQ-GOV-026 — RIEN n’est ecrit quand un intrus est present : ni sur lui, ni sur les membres legitimes', async () => {
    // 🔑 LE TEMOIN D'EFFET. Le message d'un refus est une chaine ; ce qui compte est qu'AUCUN statut
    // ne bouge. Le 2026-09-09, les neuf membres legitimes ont ete ecrits EN MEME TEMPS que l'intrus :
    // un refus qui n'arrete pas l'ecriture aurait laisse le lot a moitie clos.
    const { cloturerLeLot } = await charger();
    const taches = [...MEMBRES, INTRUS].map((id) => tache(id));
    const avant = JSON.stringify(taches);
    const rendu = {
      lotId: 'L0-01',
      resultats: [livree('GOV-039', 101), livree(INTRUS, 999), livree('GOV-041', 102)],
    };
    expect(() =>
      cloturerLeLot({ lotId: 'L0-01', rendu, membres: MEMBRES, taches, ownerParDefaut: 'A05' })
    ).toThrow(/tache_etrangere_au_lot/);
    expect(JSON.stringify(taches), 'la cloture a ecrit malgre son refus').toBe(avant);
  });

  it('REQ-GOV-026 — RIEN n’est ecrit quand AUCUN resultat n’est fusionne : la branche `attempts++` est gardee aussi', async () => {
    // 🔑 LE CRAN QUE LES TEMOINS PRECEDENTS NE FERMENT PAS. Tant que le rendu contient au moins un
    // resultat FUSIONNE, un refus range dans la seule branche `fusionnee` se declenche quand meme et
    // parait garder. Ici, AUCUN resultat n'est fusionne : un refus mal place ne se leverait jamais,
    // et l'intrus se ferait recompter `attempts++` puis `bloquee` en silence. *Une garde se contourne
    // d'autant de crans qu'on l'a deplacee ; la question est : chaque appelant est-il exerce ?*
    const { cloturerLeLot } = await charger();
    const taches = [...MEMBRES, INTRUS].map((id) => tache(id));
    const avant = JSON.stringify(taches);
    const rendu = { lotId: 'L0-01', resultats: [refusee('GOV-039'), refusee(INTRUS)] };
    expect(() =>
      cloturerLeLot({ lotId: 'L0-01', rendu, membres: MEMBRES, taches, ownerParDefaut: 'A05' })
    ).toThrow(/tache_etrangere_au_lot/);
    expect(JSON.stringify(taches), 'la cloture a recompte une tentative malgre son refus').toBe(
      avant
    );
  });

  it('REQ-GOV-026 — CONTRE-TEMOIN : sans intrus, `cloturerLeLot` ecrit bien les cinq `fusionnee`', async () => {
    const { cloturerLeLot } = await charger();
    const taches = MEMBRES.map((id) => tache(id));
    const rendu = { lotId: 'L0-01', resultats: MEMBRES.map((id, i) => livree(id, 100 + i)) };
    const { journal } = cloturerLeLot({
      lotId: 'L0-01',
      rendu,
      membres: MEMBRES,
      taches,
      ownerParDefaut: 'A05',
    });
    expect(taches.map((t) => t.statut)).toEqual(MEMBRES.map(() => 'fusionnee'));
    expect(taches.every((t) => t.lot === 'L0-01')).toBe(true);
    expect(
      journal.length,
      'un lot clos sans une ligne de journal est un lot clos sans un mot'
    ).toBe(MEMBRES.length);
  });
});

// ── (1bis) d'ou vient le perimetre, et ce qui se passe quand il n'existe pas ──

describe('REQ-GOV-026 — le perimetre du lot se LIT, il ne se deduit jamais du rendu', () => {
  it('REQ-GOV-026 — `lot.json` FAIT FOI contre le champ `lot` du registre', async () => {
    // `docs/lots/` est hors suivi git, `docs/tasks.json` est suivi : les deux sources existent, et
    // leur preseance est ECRITE plutot que subie. Une tache que le REGISTRE range dans le lot mais
    // que le LOT ne declare pas reste une etrangere.
    const { perimetreDuLot } = await charger();
    const taches = [
      tache('GOV-039', { lot: 'L0-01' }),
      tache(INTRUS, { lot: 'L0-01' }),
      tache('GOV-041', { lot: null }),
    ];
    expect(perimetreDuLot('L0-01', MEMBRES, taches)).toEqual(MEMBRES);
  });

  it('REQ-GOV-026 — `lot.json` ABSENT : le perimetre se lit dans `docs/tasks.json`, et l’intrus est refuse quand meme', async () => {
    const { perimetreDuLot, controlerLePerimetre } = await charger();
    const taches = MEMBRES.map((id) => tache(id, { lot: 'L0-01' })).concat([
      tache(INTRUS, { lot: 'L-1-04' }),
    ]);
    const perimetre = perimetreDuLot('L0-01', null, taches);
    expect(perimetre).toEqual(MEMBRES);
    expect(perimetre!.length, 'un perimetre vide ne garderait rien').toBeGreaterThan(0);
    const rendu = { lotId: 'L0-01', resultats: [livree('GOV-039', 101), livree(INTRUS, 999)] };
    expect(controlerLePerimetre('L0-01', rendu, perimetre).map((r) => r.famille)).toEqual([
      'tache_etrangere_au_lot',
    ]);
  });

  it('REQ-GOV-026 — AUCUNE des deux sources : refus `lot_introuvable`, et rien n’est ecrit', async () => {
    // Une absence de perimetre n'est pas un perimetre vide, et encore moins une autorisation :
    // c'est la meme faute que (2), une strate plus haut.
    const { perimetreDuLot, cloturerLeLot } = await charger();
    const taches = MEMBRES.map((id) => tache(id));
    expect(perimetreDuLot('L0-01', null, taches)).toBeNull();
    const avant = JSON.stringify(taches);
    const rendu = { lotId: 'L0-01', resultats: [livree('GOV-039', 101)] };
    expect(() =>
      cloturerLeLot({ lotId: 'L0-01', rendu, membres: null, taches, ownerParDefaut: 'A05' })
    ).toThrow(/lot_introuvable/);
    expect(JSON.stringify(taches)).toBe(avant);
  });
});

// ── (2) un `lotId` absent n'est pas une autorisation ─────────────────────────

describe('REQ-GOV-021 — un `lotId` absent du rendu est refuse, comme un `lotId` faux', () => {
  it('REQ-GOV-021 — rendu SANS `lotId` : refus `lot_du_rendu_absent`', async () => {
    const { controlerLePerimetre } = await charger();
    const rendu = { resultats: MEMBRES.map((id, i) => livree(id, 100 + i)) };
    const refus = controlerLePerimetre('L0-01', rendu, MEMBRES);
    expect(refus.map((r) => r.famille)).toEqual(['lot_du_rendu_absent']);
    expect(refus[0]!.message).toContain('L0-01');
  });

  it('REQ-GOV-021 — rendu avec un `lotId` VIDE : meme refus — la chaine vide est une absence', async () => {
    const { controlerLePerimetre } = await charger();
    const rendu = { lotId: '', resultats: [livree('GOV-039', 101)] };
    expect(controlerLePerimetre('L0-01', rendu, MEMBRES).map((r) => r.famille)).toEqual([
      'lot_du_rendu_absent',
    ]);
  });

  it('REQ-GOV-021 — NON-REGRESSION : un `lotId` FAUX reste refuse, sous son propre nom', async () => {
    const { controlerLePerimetre } = await charger();
    const rendu = { lotId: 'L-1-04', resultats: [livree('GOV-039', 101)] };
    const refus = controlerLePerimetre('L0-01', rendu, MEMBRES);
    expect(refus.map((r) => r.famille)).toEqual(['lot_du_rendu_etranger']);
    expect(refus[0]!.message).toContain('L-1-04');
    expect(refus[0]!.message).toContain('L0-01');
  });

  it('REQ-GOV-021 — CONTRE-TEMOIN : le BON `lotId` ne produit aucun refus', async () => {
    const { controlerLePerimetre } = await charger();
    const rendu = { lotId: 'L0-01', resultats: [livree('GOV-039', 101)] };
    expect(controlerLePerimetre('L0-01', rendu, MEMBRES)).toEqual([]);
  });

  it('REQ-GOV-021 — RIEN n’est ecrit quand le `lotId` manque', async () => {
    const { cloturerLeLot } = await charger();
    const taches = MEMBRES.map((id) => tache(id));
    const avant = JSON.stringify(taches);
    const rendu = { resultats: MEMBRES.map((id, i) => livree(id, 100 + i)) };
    expect(() =>
      cloturerLeLot({ lotId: 'L0-01', rendu, membres: MEMBRES, taches, ownerParDefaut: 'A05' })
    ).toThrow(/lot_du_rendu_absent/);
    expect(JSON.stringify(taches)).toBe(avant);
  });
});

// ── (3) LE SCRIPT ENTIER : le pilote est exerce, jamais relu ─────────────────

/**
 * 🔑 CE QUE CE BLOC FERME, ET QU'AUCUN AUTRE NE FERMAIT. Les deux refus vivent dans une fonction
 * pure ; le CABLAGE entre `principal()` — ce qui lit `docs/lots/<id>/lot.json`, `resultat.json` et
 * `docs/tasks.json` — et cette fonction ne serait garde par rien. *Une garde se contourne d'autant
 * de crans qu'on l'a deplacee.* Ici, c'est `cloture.ts` LUI-MEME qui tourne, dans un depot jetable.
 */
describe('REQ-GOV-026 — LE SCRIPT ENTIER, lance sur un depot jetable', () => {
  function bacDeLot(options: {
    rendu: unknown;
    membres: string[] | null;
    taches?: TacheDeFixture[];
  }): {
    bac: string;
    lancer: () => { code: number; sortie: string };
    taches: () => TacheDeFixture[];
  } {
    const bac = mkdtempSync(join(tmpdir(), 'clot-'));
    mkdirSync(join(bac, 'docs', 'lots', 'L0-01'), { recursive: true });
    const taches = options.taches ?? [...MEMBRES, INTRUS].map((id) => tache(id));
    writeFileSync(
      join(bac, 'docs', 'tasks.json'),
      JSON.stringify({ version: 1, taches }, null, 2) + '\n'
    );
    if (options.membres) {
      writeFileSync(
        join(bac, 'docs', 'lots', 'L0-01', 'lot.json'),
        JSON.stringify(
          {
            id: 'L0-01',
            phase: 0,
            repo: 'partners',
            taches: options.membres.map((id) => ({ id })),
            ecartees: [],
          },
          null,
          2
        ) + '\n'
      );
    }
    writeFileSync(
      join(bac, 'docs', 'lots', 'L0-01', 'resultat.json'),
      JSON.stringify(options.rendu, null, 2) + '\n'
    );
    return {
      bac,
      lancer: () => {
        const r = spawnSync(
          'npx',
          ['tsx', resolve('scripts/lot/cloture.ts'), '--lot', 'L0-01', '--owner', 'A05'],
          { cwd: bac, encoding: 'utf8', shell: true }
        );
        return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
      },
      taches: () =>
        (
          JSON.parse(readFileSync(join(bac, 'docs', 'tasks.json'), 'utf8')) as {
            taches: TacheDeFixture[];
          }
        ).taches,
    };
  }

  it('REQ-GOV-026 — un resultat ETRANGER glisse au milieu : le script sort NON NUL et n’ecrit aucun statut', () => {
    const t = bacDeLot({
      membres: MEMBRES,
      rendu: {
        lotId: 'L0-01',
        resultats: [
          livree('GOV-039', 101),
          livree('GOV-041', 102),
          livree(INTRUS, 999),
          livree('GOV-043', 103),
          livree('GOV-044', 104),
          livree('GOV-056', 105),
        ],
      },
    });
    try {
      const { code, sortie } = t.lancer();
      expect(code, sortie).not.toBe(0);
      expect(sortie).toContain('tache_etrangere_au_lot');
      expect(sortie).toContain(INTRUS);
      expect(
        t.taches().filter((x) => x.statut !== 'a_faire'),
        'des statuts ont ete ecrits malgre le refus'
      ).toEqual([]);
    } finally {
      rmSync(t.bac, { recursive: true, force: true });
    }
  }, 120_000);

  it('REQ-GOV-026 — un rendu SANS `lotId` : le script sort NON NUL et n’ecrit aucun statut', () => {
    const t = bacDeLot({
      membres: MEMBRES,
      rendu: { resultats: MEMBRES.map((id, i) => livree(id, 100 + i)) },
    });
    try {
      const { code, sortie } = t.lancer();
      expect(code, sortie).not.toBe(0);
      expect(sortie).toContain('lot_du_rendu_absent');
      expect(t.taches().filter((x) => x.statut !== 'a_faire')).toEqual([]);
    } finally {
      rmSync(t.bac, { recursive: true, force: true });
    }
  }, 120_000);

  it('REQ-GOV-026 — CONTRE-TEMOIN VERT : la cloture de `L0-01` telle qu’elle aura lieu sort EXIT 0 et ecrit cinq `fusionnee`', () => {
    // ⚠️ CE CONTRE-TEMOIN VAUT PLUS QUE TOUS LES AUTRES : ce fichier modifie le SEUL ecrivain de
    // `statut` de `docs/tasks.json`, et la cloture de mon PROPRE lot s'executera avec cette version.
    // Un refus trop large rendrait `L0-01` INFERMABLE.
    const t = bacDeLot({
      membres: MEMBRES,
      taches: MEMBRES.map((id) => tache(id)),
      rendu: { lotId: 'L0-01', resultats: MEMBRES.map((id, i) => livree(id, 100 + i)) },
    });
    try {
      const { code, sortie } = t.lancer();
      expect(code, sortie).toBe(0);
      const apres = t.taches();
      expect(apres.map((x) => x.statut)).toEqual(MEMBRES.map(() => 'fusionnee'));
      expect(apres.every((x) => x.lot === 'L0-01')).toBe(true);
    } finally {
      rmSync(t.bac, { recursive: true, force: true });
    }
  }, 120_000);

  it('REQ-GOV-026 — `lot.json` absent : le script retombe sur le champ `lot` du registre, et refuse l’intrus', () => {
    const t = bacDeLot({
      membres: null,
      taches: MEMBRES.map((id) => tache(id, { lot: 'L0-01' })).concat([tache(INTRUS)]),
      rendu: { lotId: 'L0-01', resultats: [livree('GOV-039', 101), livree(INTRUS, 999)] },
    });
    try {
      const { code, sortie } = t.lancer();
      expect(code, sortie).not.toBe(0);
      expect(sortie).toContain('tache_etrangere_au_lot');
      expect(t.taches().filter((x) => x.statut !== 'a_faire')).toEqual([]);
    } finally {
      rmSync(t.bac, { recursive: true, force: true });
    }
  }, 120_000);
});

// ── (3bis) importer le module n'a AUCUN effet — c'est ce qui rend tout le reste possible ──

describe('REQ-GOV-021 — importer `cloture.ts` ne lit rien, n’ecrit rien et ne leve pas', () => {
  it('REQ-GOV-021 — l’import seul ne leve pas et ne touche pas `docs/tasks.json`', async () => {
    // SANS CETTE PROPRIETE, AUCUN TEMOIN DE CE FICHIER N'EXISTERAIT : jusqu'au 2026-09-17, l'import
    // levait `Argument --lot manquant.` — le module lisait `process.argv`, `docs/lots/<id>/` et
    // `docs/tasks.json` au seul fait d'etre charge. C'est CE rouge-la qui ouvre le bloc ROUGE de la PR.
    const avant = readFileSync('docs/tasks.json', 'utf8');
    const mod = await charger();
    expect(typeof mod.cloturerLeLot).toBe('function');
    expect(readFileSync('docs/tasks.json', 'utf8'), 'l’import a ecrit docs/tasks.json').toBe(avant);
    expect(existsSync('docs/lots'), '`docs/lots/` a ete cree par le seul import du module').toBe(
      false
    );
  });

  it('REQ-GOV-021 — le motif de `LANCE_EN_SCRIPT` est ANCRE : dossier, nom, et fin de chaine', () => {
    // Un motif plus lache ferait s'executer une COPIE du module portant un autre nom : elle ne
    // produirait rien et sortirait 0 — un « rendu vide » reussi, le plus trompeur des verts.
    const source = readFileSync('scripts/lot/cloture.ts', 'utf8');
    const ligne = source.split('\n').find((l) => l.includes('LANCE_EN_SCRIPT ='));
    expect(ligne, '`cloture.ts` ne porte plus de garde `LANCE_EN_SCRIPT`').toBeDefined();
    expect(ligne!).toContain('cloture');
    expect(ligne!).toContain('lot');
    expect(ligne!).toContain('$/');
  });
});
