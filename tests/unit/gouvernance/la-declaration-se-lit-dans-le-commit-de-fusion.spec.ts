// @req REQ-GOV-026
// @req REQ-GOV-021
/**
 * LA DÉCLARATION D'UNE LIVRAISON SE LIT DANS LE COMMIT DE FUSION, PAS DANS LE CORPS DE LA PR (GOV-104).
 *
 * LE DÉFAUT, relevé par la lentille `securite` sur la PR #182. `lot:cloture --tache` lisait ce que
 * la PR déclare livrer — son titre et son champ `Lot:` — dans le CORPS de la PR. Ce corps reste
 * modifiable après la fusion : ajouter une tâche au champ `Lot:` d'une PR déjà fusionnée suffisait
 * à la faire clore sur une attestation qui ne l'a jamais portée. Et l'atterrissage était jugé sur
 * `baseRefName`, que la PR choisit : une PR fusionnée dans une branche quelconque passait atterrie.
 *
 * CE QUE CE FICHIER TIENT. (1) La livraison est composée du seul MESSAGE DU COMMIT DE FUSION,
 * immuable : un corps de PR qui déclare une tâche que le commit ne déclare pas ne la fait pas
 * clore. (2) L'atterrissage est l'ascendance sur la branche PAR DÉFAUT du dépôt. (3) Le mode `--lot`
 * refuse lui aussi une branche hors du motif du schéma. (4) Le protocole, les instructions du
 * release manager et le workflow recopient `Lot:` dans le message d'écrasement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ErreurDeCloture,
  cloturerLeLot,
  cloturerUneTacheSeule,
  livraisonDepuisLaForge,
  livraisonSurLaForge,
  type Tache,
} from '../../../scripts/lot/cloture';
import { DEPOT_LOCAL } from '../../../scripts/lot/attestation';
import { LIVREE } from '../../../scripts/lot/avancement';

type Doc = { taches: Tache[] };
const lireDoc = (): Doc => JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Doc;
const SHA = 'd'.repeat(40);

/** Deux tâches de CE dépôt, à faire et hors lot, choisies au registre réel — pas nommées. */
function deuxTachesSeules(doc: Doc): [Tache, Tache] {
  const l = doc.taches.filter(
    (x) => x.statut === 'a_faire' && !x.lot && !x.owner && (x.repo ?? DEPOT_LOCAL) === DEPOT_LOCAL
  );
  if (l.length < 2)
    throw new Error('moins de deux tâches seules à faire : le témoin n’a plus d’objet');
  return [l[0]!, l[1]!];
}

function unProprietaire(doc: Doc): string {
  return doc.taches.find((x) => LIVREE.has(x.statut) && x.owner)!.owner!;
}

/** Ce que `gh pr view` rend d'une PR fusionnée — CORPS COMPRIS, pour prouver qu'il n'est pas lu. */
function vueDeLaForge(titre: string, corps: string) {
  return {
    state: 'MERGED',
    mergeCommit: { oid: SHA },
    mergedAt: '2026-09-20T10:00:00Z',
    headRefName: 't/une-branche',
    title: titre,
    body: corps,
  };
}

describe('REQ-GOV-026 — la déclaration se lit dans le commit de fusion, immuable', () => {
  it('REQ-GOV-026 — TÉMOIN : un `Lot:` ajouté au CORPS après la fusion ne fait pas clore la tâche', () => {
    const doc = lireDoc();
    const [portee, ajoutee] = deuxTachesSeules(doc);
    const livraison = livraisonDepuisLaForge({
      pr: 900,
      // Le corps, réécrit après la fusion, déclare une seconde tâche…
      vue: vueDeLaForge(`fix(${portee.id}): x`, `Lot: ${ajoutee.id}\n`),
      // …que le commit de fusion, lui, ne déclare pas.
      messageDuCommit: `fix(${portee.id}): x (#900)\n\nLot:\n`,
      faceALaBrancheParDefaut: 'ahead',
    });
    expect(() =>
      cloturerUneTacheSeule({
        tacheId: ajoutee.id,
        livraison,
        taches: doc.taches,
        owner: unProprietaire(doc),
      })
    ).toThrow(ErreurDeCloture);
    expect(ajoutee.statut).toBe('a_faire');
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : la tâche que le `Lot:` du COMMIT déclare est close', () => {
    const doc = lireDoc();
    const [portee, secondaire] = deuxTachesSeules(doc);
    const livraison = livraisonDepuisLaForge({
      pr: 900,
      vue: vueDeLaForge(`fix(${portee.id}): x`, ''),
      messageDuCommit: `fix(${portee.id}): x (#900)\n\nLot: ${secondaire.id}\n`,
      faceALaBrancheParDefaut: 'identical',
    });
    cloturerUneTacheSeule({
      tacheId: secondaire.id,
      livraison,
      taches: doc.taches,
      owner: unProprietaire(doc),
    });
    expect(secondaire.statut).toBe('fusionnee');
  });

  it('REQ-GOV-026 — un commit de fusion illisible ne déclare RIEN', () => {
    const doc = lireDoc();
    const [portee] = deuxTachesSeules(doc);
    const livraison = livraisonDepuisLaForge({
      pr: 900,
      vue: vueDeLaForge(`fix(${portee.id}): x`, ''),
      messageDuCommit: null,
      faceALaBrancheParDefaut: 'ahead',
    });
    expect(livraison.titre ?? null).toBeNull();
    expect(livraison.corps ?? null).toBeNull();
  });
});

describe('REQ-GOV-026 — la forge est interrogée sur la branche PAR DÉFAUT, jamais sur la base de la PR', () => {
  /**
   * UNE FORGE SIMULÉE QUI ENREGISTRE CE QU'ON LUI DEMANDE. La PR a été fusionnée dans une base
   * (`branche-de-la-pr`) qui n'est pas la branche par défaut (`main`). Le témoin juge l'APPEL : la
   * comparaison doit viser `main`. Remettre `baseRefName` dans l'appel le fait rougir — c'est la
   * face que la relecture `exactitude` de #188 a trouvée muette.
   */
  function forge(message: string, titre = 'fix(GOV-001): x') {
    const appels: string[][] = [];
    const lire = (args: string[]): string => {
      appels.push(args);
      if (args[0] === 'pr') {
        // La forge ne rend `title` que si l'appel le DEMANDE : une vue qui l'oublie le perd.
        const champs = (args[args.indexOf('--json') + 1] ?? '').split(',');
        return JSON.stringify({
          state: 'MERGED',
          mergeCommit: { oid: SHA },
          mergedAt: '2026-09-20T10:00:00Z',
          headRefName: 't/une-branche',
          baseRefName: 'branche-de-la-pr',
          ...(champs.includes('title') ? { title: titre } : {}),
        });
      }
      if (args[0] === 'repo') return 'main';
      if (args[1]?.includes('/commits/')) return message;
      if (args[1]?.includes('/compare/')) return 'ahead';
      throw new Error(`appel inattendu : ${args.join(' ')}`);
    };
    return { appels, lire };
  }

  it('REQ-GOV-026 — TÉMOIN : la comparaison vise la branche par défaut lue sur la forge, pas la base de la PR', () => {
    const { appels, lire } = forge('fix(GOV-001): x (#900)\n');
    livraisonSurLaForge('will383842/axion-apporteurs', 900, lire);
    const comparaisons = appels.filter((a) => a[1]?.includes('/compare/'));
    expect(comparaisons).toHaveLength(1);
    expect(comparaisons[0]![1]).toMatch(/\.\.\.main$/);
    expect(appels.flat().join(' ')).not.toContain('branche-de-la-pr');
  });

  it('REQ-GOV-026 — TÉMOIN : la branche par défaut est LUE sur la forge du dépôt de la tâche', () => {
    const { appels, lire } = forge('fix(GOV-001): x (#900)\n');
    livraisonSurLaForge('will383842/axion-ia', 900, lire);
    const repo = appels.find((a) => a[0] === 'repo');
    expect(repo).toBeDefined();
    expect(repo).toContain('will383842/axion-ia');
    expect(repo!.join(' ')).toContain('defaultBranchRef');
  });

  it('REQ-GOV-026 — TÉMOIN : la vue de la PR DEMANDE son titre à la forge', () => {
    const { appels, lire } = forge('fix(GOV-001): x (#900)\n');
    livraisonSurLaForge('will383842/axion-apporteurs', 900, lire);
    const vue = appels.find((a) => a[0] === 'pr')!;
    expect(vue[vue.indexOf('--json') + 1]!.split(',')).toContain('title');
  });

  it('REQ-GOV-026 — TÉMOIN : par la forge simulée, un commit titré pour une autre tâche que la PR ne déclare rien', () => {
    const { lire } = forge('fix(GOV-002): autre (#900)\n', 'fix(GOV-001): x');
    const l = livraisonSurLaForge('will383842/axion-apporteurs', 900, lire);
    expect(l.titre ?? null).toBeNull();
    expect(l.titreNonConforme).toBeTruthy();
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : par la forge simulée, la forme du pas 6 déclare le titre de la PR', () => {
    const { lire } = forge('fix(GOV-001): x (#900)\n', 'fix(GOV-001): x');
    const l = livraisonSurLaForge('will383842/axion-apporteurs', 900, lire);
    expect(l.titre).toBe('fix(GOV-001): x (#900)');
    expect(l.titreNonConforme ?? null).toBeNull();
  });
});

describe('REQ-GOV-026 — la première ligne du message est EXACTEMENT le titre de la PR suivi de ` (#<n>)`', () => {
  /**
   * LE DÉFAUT, relevé par la lentille `securite` sur la PR #188. Hors `--subject`, une PR à un seul
   * commit prend pour titre d'écrasement le SUJET DU COMMIT, que le développeur écrit : il peut y
   * nommer une autre tâche que celle du titre de la PR. La première ligne ne déclare donc que si
   * elle est, octet pour octet, ce que le pas 6 y pose : le titre lu sur la forge, puis ` (#<n>)`.
   */
  const doc = lireDoc();
  const [portee, autre] = deuxTachesSeules(doc);
  const livraisonAvec = (titre: unknown, message: string) =>
    livraisonDepuisLaForge({
      pr: 900,
      vue: { ...vueDeLaForge('', ''), title: titre as string },
      messageDuCommit: message,
      faceALaBrancheParDefaut: 'ahead',
    });
  const familles = (tacheId: string, livraison: ReturnType<typeof livraisonAvec>) => {
    const d = lireDoc();
    try {
      cloturerUneTacheSeule({ tacheId, livraison, taches: d.taches, owner: unProprietaire(d) });
    } catch (e) {
      if (e instanceof ErreurDeCloture) return e.refus.map((r) => r.famille);
      throw e;
    }
    return [];
  };

  it('REQ-GOV-026 — TÉMOIN : une première ligne qui nomme une autre tâche que le titre de la PR ne déclare rien, refus nommé', () => {
    const l = livraisonAvec(
      `fix(${portee.id}): x`,
      `fix(${autre.id}): x (#900)\n\nLot: ${autre.id}\n`
    );
    expect(l.titre ?? null).toBeNull();
    expect(l.corps ?? null).toBeNull();
    expect(familles(autre.id, l)).toContain('titre_d_ecrasement_non_conforme');
    expect(familles(autre.id, l)).toContain('tache_etrangere_a_la_pr');
  });

  it('REQ-GOV-026 — TÉMOIN : le titre sans ` (#<n>)`, ou suivi d’un autre numéro, ne déclare rien', () => {
    for (const m of [
      `fix(${portee.id}): x\n`,
      `fix(${portee.id}): x (#901)\n`,
      `fix(${portee.id}): x (#900) \n`,
      `fix(${portee.id}): x (#900)suite\n`,
    ]) {
      const l = livraisonAvec(`fix(${portee.id}): x`, m);
      expect(l.titre ?? null, m).toBeNull();
      expect(familles(portee.id, l), m).toContain('titre_d_ecrasement_non_conforme');
    }
  });

  it('REQ-GOV-026 — TÉMOIN : un titre de PR absent de la vue ferme la déclaration (échec fermé)', () => {
    for (const titre of [undefined, null, '']) {
      const l = livraisonAvec(titre, `fix(${portee.id}): x (#900)\n`);
      expect(l.titre ?? null, String(titre)).toBeNull();
      expect(familles(portee.id, l), String(titre)).toContain('titre_d_ecrasement_non_conforme');
    }
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : la forme que le pas 6 produit déclare, et la tâche est close', () => {
    const l = livraisonAvec(
      `fix(${portee.id}): x`,
      `fix(${portee.id}): x (#900)\n\nLot: ${autre.id}\n`
    );
    expect(l.titre).toBe(`fix(${portee.id}): x (#900)`);
    expect(l.corps).toContain(autre.id);
    expect(familles(portee.id, l)).toEqual([]);
    expect(familles(autre.id, l)).toEqual([]);
  });
});

describe('REQ-GOV-026 — `Lot:` ne se lit que s’il est la SEULE ligne du corps du message', () => {
  const doc = lireDoc();
  const [portee, secondaire] = deuxTachesSeules(doc);
  const livraisonAvec = (message: string) =>
    livraisonDepuisLaForge({
      pr: 900,
      vue: vueDeLaForge(`fix(${portee.id}): x`, ''),
      messageDuCommit: message,
      faceALaBrancheParDefaut: 'ahead',
    });

  it('REQ-GOV-026 — TÉMOIN : un `Lot:` écrit dans un commit, que la forge recopie dans le message, ne déclare rien', () => {
    // Sans `--body`, la forge compose le message d'écrasement avec les messages des commits : un
    // développeur qui écrit « Lot: X » dans un commit déclarerait X (lentille `securite`, #188).
    const l = livraisonAvec(
      `fix(${portee.id}): x (#900)\n\n* fix: un commit\n\nLot: ${secondaire.id}\n\n* fix: un autre\n`
    );
    expect(l.corps ?? '').not.toContain(secondaire.id);
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : le corps réduit à la seule ligne `Lot:` recopiée par le pas 6 déclare', () => {
    const l = livraisonAvec(`fix(${portee.id}): x (#900)\n\nLot: ${secondaire.id}\n`);
    expect(l.corps).toContain(secondaire.id);
  });
});

describe('REQ-GOV-026 — l’atterrissage se juge sur la branche PAR DÉFAUT', () => {
  const doc = lireDoc();
  const [portee] = deuxTachesSeules(doc);
  const atterri = (face: string | null) =>
    livraisonDepuisLaForge({
      pr: 900,
      vue: vueDeLaForge(`fix(${portee.id}): x`, ''),
      messageDuCommit: `fix(${portee.id}): x (#900)\n`,
      faceALaBrancheParDefaut: face,
    }).atterri;

  it('REQ-GOV-026 — TÉMOIN : un commit absent de la branche par défaut n’a pas atterri', () => {
    expect(atterri('behind')).toBe(false);
    expect(atterri('diverged')).toBe(false);
    expect(atterri(null)).toBe(false);
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : un ancêtre de la branche par défaut, ou sa tête, a atterri', () => {
    expect(atterri('ahead')).toBe(true);
    expect(atterri('identical')).toBe(true);
  });
});

describe('REQ-GOV-021 — le mode `--lot` refuse lui aussi une branche hors motif', () => {
  it('REQ-GOV-021 — TÉMOIN branche_hors_motif en mode `--lot`, et rien n’est écrit', () => {
    const doc = lireDoc();
    const [t] = deuxTachesSeules(doc);
    t.owner = unProprietaire(doc);
    const avant = JSON.stringify(doc);
    let familles: string[] = [];
    try {
      cloturerLeLot({
        lotId: 'L-TEMOIN',
        membres: [t.id],
        taches: doc.taches,
        rendu: {
          lotId: 'L-TEMOIN',
          resultats: [
            {
              dev: { taskId: t.id, branch: 'feature/sans-prefixe', pr: 900 },
              fusion: { pr: 900, sha: SHA, fusionneeAt: '2026-09-20T10:00:00Z', atterri: true },
            },
          ],
        },
      });
    } catch (e) {
      if (e instanceof ErreurDeCloture) familles = e.refus.map((r) => r.famille);
      else throw e;
    }
    expect(familles).toEqual(['branche_hors_motif']);
    expect(JSON.stringify(doc)).toBe(avant);
  });
});

describe('REQ-GOV-021 — la commande de fusion recopie `Lot:` dans le message d’écrasement', () => {
  const pas = (texte: string, titre: string) => {
    const debut = texte.indexOf(titre);
    return texte.slice(debut, texte.indexOf('\n### ', debut + titre.length));
  };
  const protocole = readFileSync('docs/PROTOCOLE-FUSION.md', 'utf8');

  it('REQ-GOV-021 — le pas 6 du protocole passe la ligne `Lot:` à `--body`', () => {
    const p6 = pas(protocole, '### Pas 6');
    expect(p6).toContain('--body');
    expect(p6).toContain('^Lot:');
  });

  it('REQ-GOV-021 — le pas 8 dit que la PR doit déclarer la tâche qu’elle clôt', () => {
    expect(pas(protocole, '### Pas 8')).toContain('tache_etrangere_a_la_pr');
  });

  it('REQ-GOV-021 — les instructions du release manager et le workflow disent la même commande', () => {
    for (const f of ['.claude/agents/release-manager.md', 'scripts/lot/lot.workflow.js']) {
      const lignes = readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => l.includes('gh pr merge') && l.includes('--squash'));
      expect(lignes.length, f).toBeGreaterThan(0);
      for (const l of lignes) {
        expect(l, f).toContain('--body');
        expect(l, f).toContain('--subject');
      }
    }
  });

  it('REQ-GOV-021 — la charte cite la liste des racines au lieu de la recopier', () => {
    const charte = readFileSync('docs/CHARTE-AGENTS.md', 'utf8');
    expect(charte).not.toContain('ses trois racines');
    expect(charte).toContain('RACINES_DE_LA_GARDE_DES_REVUES');
  });
});
