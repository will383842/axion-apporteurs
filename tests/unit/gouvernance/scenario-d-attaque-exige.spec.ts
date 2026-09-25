/**
 * scenario-d-attaque-exige.spec.ts — GOV-078.
 *
 * @req REQ-GOV-011
 * @req REQ-GOV-021
 *
 * MESURE QUI OUVRE LA TÂCHE, le 2026-09-16 SUR LA PR 46. La section « Attaque » n'était exigée que
 * par deux déclencheurs, et les DEUX manquaient le cas le plus courant de la phase 0.
 *
 * (1) LE DÉCLENCHEUR PAR ZONE ÉTAIT MORT. Il comparait le DÉBUT du chemin d'un fichier à quatre
 * préfixes de répertoire — `commissions/`, `attributions/`, `auth/`, `espace/` — qui ne
 * correspondent à AUCUN chemin du dépôt : zéro fichier suivi commence par l'un d'eux, et zéro
 * fichier suivi les contient même au milieu de son chemin. Il n'avait donc jamais rien déclenché,
 * et il n'aurait rien déclenché quand les répertoires réels seraient apparus, parce que ceux-ci
 * vivront sous `src/`.
 *
 * (2) LE DÉCLENCHEUR PAR TÂCHE résout les tâches d'une PR par le numéro qu'elles PORTENT ou par
 * l'identifiant du titre. Une PR qui RÉÉCRIT LA PROSE d'une tâche sensible — son texte
 * d'acceptation, son titre, ses champs dans le registre — ne « porte » donc pas cette tâche : la
 * tâche pointe une autre PR, et le titre nomme autre chose. Le scénario d'attaque n'était exigé par
 * PERSONNE. C'est exactement ce qui s'est passé sur la PR 46 avec une tâche marquée argent : le
 * contenu était propre, aucune garde ne l'exigeait — un vert qui ne mesurait rien.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  controler,
  direLesZones,
  projeter,
  zonesSensiblesTouchees,
  tachesReecritesEtSensibles,
  empreinteDeLEntree,
  type Depot,
  type Pr,
  type Tache,
} from '../../../scripts/gates/gov-pr';
import { cheminsTouches, entreesDuDiff, OPTIONS_DU_DIFF } from '../../../scripts/lot/revues';

const CHEMIN_TACHES = 'docs/tasks.json';

/** Une tâche projetée, telle que `gov:pr` la lit. */
function tache(sur: Partial<Tache> = {}): Tache {
  const base: Tache = {
    id: 'T-ARG-999',
    sensible: ['argent'],
    zone: 'argent',
    schema: false,
    pr: null,
    paths: ['docs/tasks.json'],
    tests: null,
    empreinte: 'aaa',
    // GOV-096 : la projection porte le statut ; une tâche ouverte, pour que le champ `Lot:` ne
    // soit pas l'objet de ce fichier.
    statut: 'a_faire',
  };
  return { ...base, ...sur };
}

/** Le dépôt réel : gabarit, CODEOWNERS et charte ne sont pas l'objet de ce fichier. */
function depot(taches: Tache[]): Depot {
  return {
    gabarit: readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8'),
    codeowners: readFileSync('.github/CODEOWNERS', 'utf8'),
    charte: readFileSync('docs/CHARTE-AGENTS.md', 'utf8'),
    architecte: readFileSync('.claude/agents/architecte.md', 'utf8'),
    fiches: [],
    taches,
  };
}

/** Une PR dont SEULE la section « Attaque » est en jeu : tout le reste est hors sujet ici. */
function pr(sur: Partial<Pr>): Pr {
  const base: Pr = {
    numero: 999,
    titre: 'docs(GOV-078): la prose d’une tache',
    corps: '',
    labels: [],
    fichiers: [CHEMIN_TACHES],
    revues: null,
    tachesBase: null,
  };
  return { ...base, ...sur };
}

/** Un corps dont la section « Attaque » est déclarée SANS OBJET — le contournement à refuser. */
const SANS_OBJET = ['<!-- attaque:debut -->', 'sans objet', '<!-- attaque:fin -->'].join('\n');

/** Les messages de la famille `attaque_absente`, l'unité de mesure de ce fichier. */
const attaque = (d: Depot, p: Pr): string[] =>
  controler(d, p)
    .filter((f) => f.famille === 'attaque_absente')
    .map((f) => f.message);

describe('gov:pr — le scénario d’attaque est exigé là où il manquait (GOV-078)', () => {
  it('REQ-GOV-011 — le déclencheur par zone compare des chemins RÉELS, et non des préfixes tapés', () => {
    // Le préfixe tapé ne répondait à rien : aucun fichier du dépôt ne commence par `auth/`.
    expect(zonesSensiblesTouchees(['src/lib/auth/session.ts'])).toEqual([
      { zone: 'auth', sous: 'src/lib/auth' },
    ]);
    expect(zonesSensiblesTouchees(['src/domain/commissions/calcul.ts'])).toEqual([
      { zone: 'commissions', sous: 'src/domain/commissions' },
    ]);
    // Un GROUPE DE ROUTES porte des parenthèses, et elles n'en changent pas le nom.
    expect(zonesSensiblesTouchees(['src/app/(espace)/page.tsx'])).toEqual([
      { zone: 'espace', sous: 'src/app/(espace)' },
    ]);
    // Une zone est un RÉPERTOIRE : un fichier qui porte le mot dans son nom n'en est pas une.
    expect(zonesSensiblesTouchees(['docs/commissions-et-prorata.md'])).toEqual([]);
    expect(zonesSensiblesTouchees(['docs/tasks.json'])).toEqual([]);
  });

  it('REQ-GOV-011 — sur le dépôt RÉEL, aucun fichier suivi ne commence par les préfixes tapés', () => {
    // La mesure du 2026-09-16, rejouée : c'est ELLE qui prouve que l'ancien déclencheur était mort.
    const suivis = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const parPrefixe = suivis.filter((f) =>
      ['commissions/', 'attributions/', 'auth/', 'espace/'].some((z) => f.startsWith(z))
    );
    expect(parPrefixe).toEqual([]);
  });

  it('REQ-GOV-011 — un fichier sous le chemin RÉEL d’une zone sensible déclenche l’exigence', () => {
    const messages = attaque(
      depot([tache({ sensible: [] })]),
      pr({ fichiers: ['src/lib/auth/session.ts'] })
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('src/lib/auth/ (auth)');
  });

  it('REQ-GOV-021 — une PR qui RÉÉCRIT l’entrée d’une tâche sensible exige le scénario', () => {
    const avant = tache({ empreinte: 'avant' });
    const apres = tache({ empreinte: 'apres' });
    const messages = attaque(depot([apres]), pr({ tachesBase: [avant] }));
    expect(messages).toHaveLength(1);
    // LA SORTIE NOMME LA TÂCHE ET LE MOTIF.
    expect(messages[0]).toContain('T-ARG-999');
    expect(messages[0]).toContain('RÉÉCRITE');
    expect(messages[0]).toContain('argent');
  });

  it('REQ-GOV-021 — la même PR avec sa section remplie sort en zéro', () => {
    const avant = tache({ empreinte: 'avant' });
    const apres = tache({ empreinte: 'apres' });
    const corps = [
      '<!-- attaque:debut -->',
      'Scénario joué : un apporteur tente de se réattribuer un filleul. Résultat : refusé. Joué par A09.',
      '<!-- attaque:fin -->',
    ].join('\n');
    expect(attaque(depot([apres]), pr({ tachesBase: [avant], corps }))).toEqual([]);
  });

  it('REQ-GOV-021 — une tâche NON sensible réécrite n’exige rien : la garde reste proportionnée', () => {
    const avant = tache({ sensible: [], empreinte: 'avant' });
    const apres = tache({ sensible: [], empreinte: 'apres' });
    expect(attaque(depot([apres]), pr({ tachesBase: [avant] }))).toEqual([]);
  });

  it('REQ-GOV-021 — une tâche sensible INCHANGÉE n’exige rien non plus', () => {
    const t = tache({ empreinte: 'pareil' });
    expect(attaque(depot([t]), pr({ tachesBase: [{ ...t }] }))).toEqual([]);
  });

  it('REQ-GOV-021 — RETIRER le marquage sensible est une réécriture, et elle est vue', () => {
    // Le sens qu'on oublie : la tâche n'est plus sensible SUR LA TÊTE. Lire la seule tête laisserait
    // une PR se désarmer elle-même.
    const avant = tache({ sensible: ['argent'], empreinte: 'avant' });
    const apres = tache({ sensible: [], empreinte: 'apres' });
    expect(tachesReecritesEtSensibles([apres], [avant]).map((t) => t.id)).toEqual(['T-ARG-999']);
  });

  it('REQ-GOV-021 — SUPPRIMER l’entrée d’une tâche sensible est une réécriture, et elle exige le scénario', () => {
    // 🔴 Motif `securite` sur 9ffb450, rejoué tel quel : base = [GOV-1, ARG-9 `argent`], tête =
    // [GOV-1], registre dans le diff, corps « sans objet » → `attaque_absente` = 0. Retirer le
    // marquage était vu ; supprimer l'entrée ENTIÈRE — la forme la plus forte du retrait — passait.
    const gouv = tache({ id: 'GOV-1', sensible: [], zone: 'gouvernance', empreinte: 'g' });
    const arg = tache({ id: 'ARG-9', empreinte: 'a' });
    const messages = attaque(depot([gouv]), pr({ tachesBase: [gouv, arg], corps: SANS_OBJET }));
    expect(
      messages,
      'une entrée sensible supprimée du registre n’exige aucun scénario'
    ).toHaveLength(1);
    expect(messages[0]).toContain('ARG-9');
    expect(messages[0]).toContain('SUPPRIMÉE');
    expect(messages[0]).toContain('argent');
    // CONTRE-TÉMOIN : supprimer une tâche NON sensible n'exige rien.
    const neutre = tache({ id: 'GOV-2', sensible: [], zone: 'gouvernance', empreinte: 'n' });
    expect(attaque(depot([gouv]), pr({ tachesBase: [gouv, neutre], corps: SANS_OBJET }))).toEqual(
      []
    );
  });

  it('REQ-GOV-021 — par la projection RÉELLE : seule la prose change, le scénario est exigé', () => {
    // Motif `mutation` (G10) sur 9ffb450 : l'empreinte de `projeter` rendue CONSTANTE laissait
    // spec et `--prove` verts — les témoins posaient leurs empreintes à la main. Ici elles sont
    // CALCULÉES par la projection que lit la garde, sur deux entrées qui ne diffèrent que par la prose.
    const brute = {
      id: 'T-ARG-999',
      titre: 'une tâche d’argent',
      sensible: ['argent'],
      zone: 'argent',
      paths: ['docs/tasks.json'],
      acceptance: 'une prose',
      statut: 'a_faire',
    };
    const base = projeter([brute]);
    const tete = projeter([{ ...brute, acceptance: 'une AUTRE prose' }]);
    const messages = attaque(depot(tete), pr({ tachesBase: base, corps: SANS_OBJET }));
    expect(messages, 'la prose d’une tâche argent a changé et rien n’a été exigé').toHaveLength(1);
    expect(messages[0]).toContain('T-ARG-999');
    // CONTRE-TÉMOIN : la même entrée, inchangée, n'exige rien.
    expect(attaque(depot(projeter([brute])), pr({ tachesBase: base, corps: SANS_OBJET }))).toEqual(
      []
    );
  });

  it('REQ-GOV-011 — le déclencheur par zone DIT ce qu’il a confronté, même quand rien ne répond', () => {
    // Motif `exactitude` sur 9ffb450 : les zones confrontées ne sortaient QUE dans le message
    // d'échec. Un déclencheur mort l'était resté des semaines parce que son vert était muet.
    const rien = direLesZones(['docs/tasks.json', 'scripts/gates/gov-pr.ts']);
    expect(rien).toContain('2 fichier(s)');
    expect(rien).toContain('aucune zone touchée');
    for (const z of ['commissions', 'attributions', 'auth', 'espace']) expect(rien).toContain(z);
    // Un fichier sous le chemin réel d'une zone CHANGE la ligne : elle vient du même déclencheur.
    expect(direLesZones(['src/lib/auth/session.ts'])).toContain('src/lib/auth/ (auth)');
  });

  it('REQ-GOV-011 — DE BOUT EN BOUT : la garde lancée sur une PR imprime la ligne du déclencheur', () => {
    // Le branchement, pas la fonction : la garde est LANCÉE sur un événement `pull_request`
    // (HEAD~1 → HEAD), et sa sortie doit porter la ligne, quel que soit son verdict.
    const base = execFileSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim();
    const tete = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    // Le compte attendu passe par l'extraction UNIQUE que la garde emploie — un renommage y compte
    // pour sa source ET sa destination ; `--name-only` le compterait une fois (mesuré sur une fusion).
    const n = cheminsTouches(
      entreesDuDiff(
        execFileSync('git', [...OPTIONS_DU_DIFF, `${base}...${tete}`], {
          encoding: 'utf8',
          maxBuffer: 64e6,
        })
      )
    ).length;
    const dossier = mkdtempSync(join(tmpdir(), 'gov-078-evenement-'));
    try {
      const evenement = join(dossier, 'evenement.json');
      writeFileSync(
        evenement,
        JSON.stringify({
          pull_request: {
            number: 999,
            title: 'docs(GOV-078): un evenement de temoin',
            body: '',
            labels: [],
            base: { sha: base },
            head: { sha: tete },
          },
        }),
        'utf8'
      );
      const r = spawnSync('npx', ['tsx', 'scripts/gates/gov-pr.ts'], {
        encoding: 'utf8',
        shell: true,
        timeout: 300_000,
        env: { ...process.env, GITHUB_EVENT_PATH: evenement },
      });
      const sortie = (r.stdout ?? '') + (r.stderr ?? '');
      const ligne = sortie.split(/\r?\n/).find((l) => l.includes('déclencheur par zone'));
      expect(
        ligne,
        `aucune ligne du déclencheur par zone :\n${sortie.slice(0, 1500)}`
      ).toBeDefined();
      expect(ligne).toContain(`${n} fichier(s)`);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-021 — une tâche VERSÉE n’est pas une tâche réécrite', () => {
    expect(tachesReecritesEtSensibles([tache()], [])).toEqual([]);
  });

  it('REQ-GOV-021 — une empreinte ABSENTE n’est jamais lue comme « inchangée »', () => {
    const avant = tache({ empreinte: null });
    const apres = tache({ empreinte: null });
    expect(tachesReecritesEtSensibles([apres], [avant]).map((t) => t.id)).toEqual(['T-ARG-999']);
  });

  it('REQ-GOV-021 — le registre dans le diff avec une BASE illisible exige le scénario', () => {
    const messages = attaque(
      depot([tache({ sensible: [] })]),
      pr({ fichiers: [CHEMIN_TACHES], tachesBase: null })
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('illisible');
  });

  it('REQ-GOV-011 — l’empreinte porte la PROSE, que la projection ne portait pas', () => {
    const a = { id: 'X', titre: 'un titre', acceptance: 'une prose' };
    const b = { id: 'X', titre: 'un titre', acceptance: 'une AUTRE prose' };
    expect(empreinteDeLEntree(a)).not.toBe(empreinteDeLEntree(b));
    // L'ordre des clés ne fait PAS une réécriture : sinon la garde accuserait un formatage.
    expect(empreinteDeLEntree({ b: 1, a: 2 })).toBe(empreinteDeLEntree({ a: 2, b: 1 }));
  });
});
