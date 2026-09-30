// @req REQ-GOV-026
/**
 * LE PASSIF DE LA DÉCLARATION EST FERMÉ — GOV-127 (REQ-GOV-026).
 *
 * Une livraison dont la PR portait, À L'INSTANT DE LA FUSION, un titre qui déclare la tâche, mais dont
 * le squash a pris une autre première ligne, est refusée par la clôture (`tache_etrangere_a_la_pr`,
 * `titre_d_ecrasement_non_conforme`). Une seule livraison de ce genre, antérieure à la convention de
 * déclaration côté axion-ia, est levée sur arbitrage écrit : elle vit dans une liste FERMÉE et datée.
 * Rien d'autre n'est levé.
 *
 * TÉMOIN À PLUSIEURS FACES : l'entrée passe ; la même livraison avec un autre sha, une autre PR ou un
 * titre à la fusion qui ne déclare pas la tâche reste refusée ; une livraison hors liste reste refusée.
 */
import { describe, it, expect } from 'vitest';
import {
  PASSIF_DE_LA_DECLARATION,
  livraisonDepuisLaForge,
  passifDeLaDeclaration,
  type Livraison,
} from '../../../scripts/lot/cloture';

const ENTREE = PASSIF_DE_LA_DECLARATION.find((e) => e.tache === 'INT-T02')!;
const TITRE_A_LA_FUSION = `feat(${ENTREE.tache}): file de sortie, écrite dans la transaction (#${ENTREE.pr})`;

function livraison(p: Partial<Livraison> = {}): Livraison {
  return {
    pr: ENTREE.pr,
    sha: ENTREE.sha,
    titre: null,
    titreNonConforme: {
      lu: `feat(partners): file de sortie (${ENTREE.tache}) (#${ENTREE.pr})`,
      attendu: TITRE_A_LA_FUSION,
    },
    ...p,
  };
}

describe('REQ-GOV-026 — le passif de la déclaration est une liste fermée, et rien d’autre ne lève les refus (GOV-127)', () => {
  it('REQ-GOV-026 — la liste est FERMÉE : trois entrées, datées, avec leur arbitrage écrit', () => {
    expect(PASSIF_DE_LA_DECLARATION.map((e) => `${e.tache}#${e.pr}`)).toEqual([
      'INT-T02#1180',
      'INT-T04#1228',
      'INT-T05#1228',
    ]);
    for (const e of PASSIF_DE_LA_DECLARATION) {
      expect(e.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(e.arbitrage).toMatch(/arbitrage -d7 sur délégation de Williams/);
      expect(e.arbitrage).toMatch(/aucune règle assouplie/);
    }
    expect(ENTREE.par ?? 'titre').toBe('titre');
    expect(ENTREE.tache).toBe('INT-T02');
    expect(ENTREE.pr).toBe(1180);
    expect(ENTREE.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(ENTREE.date).toBe('2026-09-29');
    expect(ENTREE.arbitrage).toMatch(/arbitrage -d7 sur délégation de Williams/);
    expect(ENTREE.arbitrage).toMatch(/aucune règle assouplie/);
  });

  it('REQ-GOV-026 — TÉMOIN : la livraison au passif, nommée à la fusion, est levée', () => {
    expect(passifDeLaDeclaration(ENTREE.tache, livraison())).toBe(ENTREE);
  });

  it('REQ-GOV-026 — TÉMOIN : un autre sha, une autre PR ou une autre tâche restent refusés', () => {
    expect(passifDeLaDeclaration(ENTREE.tache, livraison({ sha: '0'.repeat(40) }))).toBeNull();
    expect(
      passifDeLaDeclaration(ENTREE.tache, livraison({ sha: ENTREE.sha.slice(0, 7) }))
    ).toBeNull();
    expect(passifDeLaDeclaration(ENTREE.tache, livraison({ pr: ENTREE.pr + 1 }))).toBeNull();
    expect(passifDeLaDeclaration('INT-T03', livraison())).toBeNull();
  });

  it('REQ-GOV-026 — TÉMOIN : un titre à la fusion qui ne déclare pas la tâche reste refusé', () => {
    const autre = livraison({
      titreNonConforme: {
        lu: `feat(partners): file de sortie (#${ENTREE.pr})`,
        attendu: `feat(partners): file de sortie (#${ENTREE.pr})`,
      },
    });
    expect(passifDeLaDeclaration(ENTREE.tache, autre)).toBeNull();
    expect(
      passifDeLaDeclaration(ENTREE.tache, livraison({ titreNonConforme: null, titre: null }))
    ).toBeNull();
  });

  it('REQ-GOV-026 — TÉMOIN : une livraison hors liste, au squash non conforme, reste refusée', () => {
    const horsListe = { ...ENTREE, tache: 'INT-T03', pr: 1225 };
    expect(
      passifDeLaDeclaration(
        'INT-T03',
        livraison({
          pr: 1225,
          titreNonConforme: {
            lu: 'feat(partners): x (#1225)',
            attendu: 'feat(INT-T03): x (#1225)',
          },
        })
      )
    ).toBeNull();
    // Contre-témoin : la même livraison passerait SI elle était dans la liste — c'est la liste qui décide.
    expect(
      passifDeLaDeclaration(
        'INT-T03',
        livraison({
          pr: 1225,
          titreNonConforme: {
            lu: 'feat(partners): x (#1225)',
            attendu: 'feat(INT-T03): x (#1225)',
          },
        }),
        [horsListe]
      )
    ).toBe(horsListe);
  });
});

// ── GOV-128 : une entrée déclarée par la ligne `Lot:` du squash immuable ─────────────────────
const PAR_LOT = PASSIF_DE_LA_DECLARATION.filter((e) => e.par === 'lot');
const LOT_1228 = PAR_LOT[0]!;
const TITRE_1228 = 'feat(INT-T04, INT-T05): faits devis, facturation et paiements (#1228)';

function livraisonDeLot(p: Partial<Livraison> = {}): Livraison {
  return {
    pr: LOT_1228.pr,
    sha: LOT_1228.sha,
    titre: TITRE_1228,
    corps: '',
    titreNonConforme: null,
    lotDuSquash: 'Lot: INT-T04, INT-T05',
    ...p,
  };
}

describe('REQ-GOV-026 — une entrée du passif peut être déclarée par la ligne Lot: du squash, et par elle seule (GOV-128)', () => {
  it('REQ-GOV-026 — les deux entrées de #1228 sont déclarées par Lot:, au même sha complet', () => {
    expect(PAR_LOT.map((e) => e.tache)).toEqual(['INT-T04', 'INT-T05']);
    expect(new Set(PAR_LOT.map((e) => `${e.depot}#${e.pr}@${e.sha}`)).size).toBe(1);
    expect(LOT_1228.depot).toBe('axionia');
    expect(LOT_1228.sha).toBe('3fb76aa6f93a58aba79bae876169089bb0a505ed');
    expect(LOT_1228.date).toBe('2026-09-30');
    expect(LOT_1228.arbitrage).toMatch(/7eb1bf3/);
  });

  it('REQ-GOV-026 — TÉMOIN : INT-T04 et INT-T05, nommées par la ligne Lot: du squash, sont levées', () => {
    for (const e of PAR_LOT) expect(passifDeLaDeclaration(e.tache, livraisonDeLot())).toBe(e);
  });

  it('REQ-GOV-026 — TÉMOIN : un autre sha, une autre PR, une tâche absente de Lot: restent refusés', () => {
    expect(passifDeLaDeclaration('INT-T04', livraisonDeLot({ sha: '0'.repeat(40) }))).toBeNull();
    expect(passifDeLaDeclaration('INT-T04', livraisonDeLot({ pr: 1229 }))).toBeNull();
    expect(
      passifDeLaDeclaration('INT-T04', livraisonDeLot({ lotDuSquash: 'Lot: INT-T05' }))
    ).toBeNull();
    expect(passifDeLaDeclaration('INT-T03', livraisonDeLot())).toBeNull();
  });

  it('REQ-GOV-026 — TÉMOIN : un squash sans ligne Lot:, illisible ou à première ligne non conforme reste refusé', () => {
    expect(passifDeLaDeclaration('INT-T04', livraisonDeLot({ lotDuSquash: null }))).toBeNull();
    expect(passifDeLaDeclaration('INT-T04', livraisonDeLot({ lotDuSquash: undefined }))).toBeNull();
    expect(
      passifDeLaDeclaration('INT-T04', livraisonDeLot({ lotDuSquash: 'Lot: INT-T04 INT-T05' }))
    ).toBeNull();
    expect(
      passifDeLaDeclaration(
        'INT-T04',
        livraisonDeLot({
          titre: null,
          titreNonConforme: { lu: 'wip (#1228)', attendu: TITRE_1228 },
        })
      )
    ).toBeNull();
  });

  it('REQ-GOV-026 — TÉMOIN : une entrée par titre ne se lève jamais par la ligne Lot:', () => {
    const parTitre = { ...LOT_1228, par: undefined };
    expect(passifDeLaDeclaration('INT-T04', livraisonDeLot(), [parTitre])).toBeNull();
  });
});

describe('REQ-GOV-026 — la ligne Lot: du squash est lue dans le message immuable, jamais dans le corps de la PR (GOV-128)', () => {
  const vue = {
    state: 'MERGED',
    mergeCommit: { oid: '3fb76aa6f93a58aba79bae876169089bb0a505ed' },
    mergedAt: '2026-09-30T00:10:00Z',
    headRefName: 'partners/int-t04-t05',
    title: 'feat(INT-T04, INT-T05): faits devis, facturation et paiements',
    body: 'Lot: INT-T04, INT-T05, INT-T03\n',
  };
  const lire = (messageDuCommit: string | null): Livraison =>
    livraisonDepuisLaForge({
      pr: 1228,
      vue,
      messageDuCommit,
      faceALaBrancheParDefaut: 'ahead',
      renommages: [],
    });

  it('REQ-GOV-026 — TÉMOIN : un corps de squash enrichi garde sa ligne Lot:, mais ne déclare toujours rien par lui-même', () => {
    const l = lire(
      `${vue.title} (#1228)\n\nLot: INT-T04, INT-T05\n\nAcceptée par A09.\n\nCo-Authored-By: x <x@y>\n`
    );
    expect(l.lotDuSquash).toBe('Lot: INT-T04, INT-T05');
    expect(l.corps).toBe('');
  });

  it('REQ-GOV-026 — TÉMOIN : une première ligne non conforme, ou une ligne Lot: qui ne suit pas le titre, ne donne rien', () => {
    expect(lire('wip (#1228)\n\nLot: INT-T04, INT-T05\n').lotDuSquash).toBeNull();
    expect(
      lire(`${vue.title} (#1228)\n\nAcceptée.\nLot: INT-T04, INT-T05\n`).lotDuSquash
    ).toBeNull();
    expect(lire(null).lotDuSquash).toBeNull();
  });
});
