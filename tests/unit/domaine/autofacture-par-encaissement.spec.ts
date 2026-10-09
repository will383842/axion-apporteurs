// @req REQ-ARG-015
// @req REQ-ARG-018
/**
 * T-ARG-045 — contrat v2, art. 5.1 et 5.3 : une autofacture à chaque encaissement intégral, sans
 * relevé ni seuil ; les commissions acquises le même jour sont regroupées ; l'échéance tombe trente
 * jours (SSOT) après l'émission, en jours civils de Paris ; une reprise ne diminue jamais une
 * autofacture. Une ligne de commission n'appartient qu'à une seule autofacture : l'affectation est
 * conditionnelle (`WHERE autofactureId IS NULL`), si bien qu'un passage rejoué ou concurrent n'en
 * crée pas une seconde.
 */
import { describe, it, expect } from 'vitest';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  composerAutofactures,
  echeanceAutofacture,
  imputerAvoirs,
  jourDEtablissement,
  type LigneAcquise,
} from '../../../src/domain/commission/autofacture';
import {
  emettreAutofactures,
  type DepotAutofactures,
} from '../../../src/server/commission/emission-autofactures';
import type { DateCivile } from '../../../src/domain/temps/calendrier-civil';
import { horlogeFigee } from '../../../src/domain/temps/horloge';

/** Le passage a lieu bien après toutes les dates des témoins, sauf mention contraire. */
const HORLOGE = horlogeFigee(Date.UTC(2027, 11, 31, 12));

const D = (annee: number, mois: number, jour: number): DateCivile => ({ annee, mois, jour });
// Le 2027-03-10 est un mercredi ; le 2027-03-13, un samedi.
const MERCREDI = D(2027, 3, 10);
const SAMEDI = D(2027, 3, 13);

const commande = (id: string, commissionCents: number, le = MERCREDI): LigneAcquise => ({
  id,
  apporteurId: 'app-1',
  nature: 'commande',
  commandeRef: `CMD-${id}`,
  prixFactureCents: 120_000,
  prixPublicCents: 150_000,
  commissionCents,
  encaissementIntegralLe: le,
  constateLe: le,
  regulariseLe: null,
});

describe('REQ-ARG-015 — aucun montant minimum, aucun relevé', () => {
  it('REQ-ARG-015 : TÉMOIN — aucune constante `SEUIL_VERSEMENT` dans la SSOT', () => {
    expect(Object.keys(SEUILS)).not.toContain('SEUIL_VERSEMENT');
  });

  it('REQ-ARG-015 : TÉMOIN — une commission d’un centime est facturée', () => {
    const [af] = composerAutofactures([commande('a', 1)]);
    expect(af?.montantCents).toBe(1);
    expect(af?.ligneIds).toEqual(['a']);
  });

  it('REQ-ARG-015 : TÉMOIN — un avoir imputé ne diminue pas l’autofacture ; la somme virée, si', () => {
    const [af] = composerAutofactures([commande('a', 10_000)]);
    const v = imputerAvoirs(af!.montantCents, 3_000);
    expect(af?.montantCents).toBe(10_000);
    expect(v).toEqual({ avoirImputeCents: 3_000, sommeVireeCents: 7_000, reliquatCents: 0 });
  });

  it('REQ-ARG-015 : la somme virée n’est jamais négative ; le reliquat passe aux sommes suivantes', () => {
    expect(imputerAvoirs(2_000, 5_000)).toEqual({
      avoirImputeCents: 2_000,
      sommeVireeCents: 0,
      reliquatCents: 3_000,
    });
  });

  it('REQ-ARG-015 : un montant non entier de centimes est refusé', () => {
    expect(() => composerAutofactures([commande('a', 1.5)])).toThrow(RangeError);
    expect(() => imputerAvoirs(100, -1)).toThrow(RangeError);
  });
});

describe('REQ-ARG-018 — une autofacture par encaissement intégral', () => {
  it('REQ-ARG-018 : TÉMOIN — deux commissions acquises le même jour font UNE autofacture', () => {
    const [ca, cb] = [4_321, 6_789];
    const afs = composerAutofactures([commande('a', ca), commande('b', cb)]);
    expect(afs).toHaveLength(1);
    expect(afs[0]).toMatchObject({
      apporteurId: 'app-1',
      emiseLe: MERCREDI,
      montantCents: ca + cb,
    });
    expect(afs[0]?.ligneIds).toEqual(['a', 'b']);
  });

  it('REQ-ARG-018 : deux jours d’acquisition font deux autofactures, deux apporteurs aussi', () => {
    const autre = { ...commande('c', 500), apporteurId: 'app-2' };
    const afs = composerAutofactures([
      commande('a', 100),
      commande('b', 200, D(2027, 3, 11)),
      autre,
    ]);
    expect(afs).toHaveLength(3);
  });

  it('REQ-ARG-018 : TÉMOIN — encaissement intégral un samedi → autofacture le premier jour ouvré', () => {
    expect(jourDEtablissement(SAMEDI, SAMEDI)).toEqual(D(2027, 3, 15));
    const [af] = composerAutofactures([commande('a', 100, SAMEDI)]);
    expect(af?.emiseLe).toEqual(D(2027, 3, 15));
  });

  it('REQ-ARG-018 : constaté plus tard → établie le premier jour ouvré du constat', () => {
    expect(jourDEtablissement(MERCREDI, D(2027, 3, 12))).toEqual(D(2027, 3, 12));
  });

  it('REQ-ARG-018 : TÉMOIN — l’échéance tombe à émission + VERSEMENT_PLAFOND_JOURS jours civils', () => {
    const n = SEUILS.VERSEMENT_PLAFOND_JOURS.valeur;
    expect(n).toBe(30);
    expect(echeanceAutofacture(D(2027, 3, 10))).toEqual(D(2027, 4, 9));
    // Traverse le changement d'heure (28 mars 2027) et la fin d'année sans glisser d'un jour.
    expect(echeanceAutofacture(D(2027, 12, 15))).toEqual(D(2028, 1, 14));
    const [af] = composerAutofactures([commande('a', 100)]);
    expect(af?.echeanceLe).toEqual(D(2027, 4, 9));
  });

  it('REQ-ARG-018 : le décompte porte, par commande, prix facturé, prix public, commission, date', () => {
    const [af] = composerAutofactures([commande('a', 4_000)]);
    expect(af?.decompte).toEqual([
      {
        commandeRef: 'CMD-a',
        prixFactureCents: 120_000,
        prixPublicCents: 150_000,
        commissionCents: 4_000,
        encaissementIntegralLe: MERCREDI,
      },
    ]);
  });

  it('REQ-ARG-018 : le parrainage tient en UNE ligne « Parrainage (article 4.6) », sans filleul', () => {
    const p = (id: string, c: number): LigneAcquise => ({
      id,
      apporteurId: 'app-1',
      nature: 'parrainage',
      commissionCents: c,
      encaissementIntegralLe: MERCREDI,
      constateLe: MERCREDI,
      regulariseLe: null,
    });
    const [p1, p2] = [53, 71];
    const [af] = composerAutofactures([commande('a', 1_000), p('p1', p1), p('p2', p2)]);
    expect(af?.montantCents).toBe(1_000 + p1 + p2);
    const ligne = { libelle: 'Parrainage (article 4.6)', commissionCents: p1 + p2 };
    expect(af?.decompte).toContainEqual(ligne);
    expect(JSON.stringify(af?.decompte)).not.toMatch(/p1|p2|filleul/);
  });
});

/** Le dépôt en mémoire imite l'UPDATE conditionnel : seule une ligne encore libre est affectée. */
function depotEnMemoire(lignes: LigneAcquise[]) {
  const affectation = new Map<string, string>();
  const autofactures: { id: string; ligneIds: readonly string[]; montantCents: number }[] = [];
  let n = 0;
  const depot: DepotAutofactures = {
    async lignesLibres() {
      await Promise.resolve();
      return lignes.filter((l) => !affectation.has(l.id));
    },
    async transaction(fn) {
      const vue = { creees: [] as typeof autofactures, affectees: [] as string[] };
      const res = await fn({
        nouvelId: () => `af-${++n}`,
        async affecterSiLibre(ids, autofactureId) {
          await Promise.resolve();
          const libres = ids.filter((id) => !affectation.has(id));
          for (const id of libres) affectation.set(id, autofactureId);
          vue.affectees.push(...libres);
          return libres;
        },
        async creerAutofacture(af) {
          vue.creees.push(af);
        },
      });
      autofactures.push(...vue.creees);
      return res;
    },
  };
  return { depot, affectation, autofactures };
}

describe('REQ-ARG-018 — une ligne n’appartient qu’à une seule autofacture', () => {
  it('REQ-ARG-018 : TÉMOIN — passage rejoué → aucune seconde autofacture', async () => {
    const m = depotEnMemoire([commande('a', 100), commande('b', 200)]);
    await emettreAutofactures(m.depot, HORLOGE);
    await emettreAutofactures(m.depot, HORLOGE);
    expect(m.autofactures).toHaveLength(1);
    expect(m.autofactures[0]?.montantCents).toBe(300);
  });

  it('REQ-ARG-018 : TÉMOIN DE CONCURRENCE — deux passages simultanés n’affectent chaque ligne qu’une fois', async () => {
    const m = depotEnMemoire([commande('a', 100), commande('b', 200)]);
    const rendus = await Promise.all([
      emettreAutofactures(m.depot, HORLOGE),
      emettreAutofactures(m.depot, HORLOGE),
    ]);
    const lignesFacturees = m.autofactures.flatMap((a) => a.ligneIds);
    expect(lignesFacturees.sort()).toEqual(['a', 'b']);
    expect(m.autofactures.reduce((s, a) => s + a.montantCents, 0)).toBe(300);
    for (const a of m.autofactures) {
      for (const id of a.ligneIds) expect(m.affectation.get(id)).toBe(a.id);
    }
    expect(rendus.flat()).toEqual(m.autofactures);
  });

  it('REQ-ARG-018 : une ligne prise entre la lecture et l’affectation sort de l’autofacture recomposée', async () => {
    const m = depotEnMemoire([commande('a', 100), commande('b', 200)]);
    const lire = m.depot.lignesLibres;
    m.depot.lignesLibres = async () => {
      const lues = await lire();
      m.affectation.set('b', 'af-concurrente');
      return lues;
    };
    const [af] = await emettreAutofactures(m.depot, HORLOGE);
    expect(af?.ligneIds).toEqual(['a']);
    expect(af?.montantCents).toBe(100);
    expect(m.autofactures).toEqual([af]);
  });

  it('REQ-ARG-018 : une ligne régularisée plus tard a sa propre autofacture, même jour d’acquisition', async () => {
    const lignes = [commande('a', 100)];
    const m = depotEnMemoire(lignes);
    await emettreAutofactures(m.depot, HORLOGE);
    lignes.push({ ...commande('b', 200), regulariseLe: D(2027, 3, 17) });
    await emettreAutofactures(m.depot, HORLOGE);
    expect(m.autofactures.map((a) => a.ligneIds)).toEqual([['a'], ['b']]);
  });

  it('REQ-ARG-018 : TÉMOIN — l’émission suit l’ordre des dates d’émission, pas l’ordre de lecture', async () => {
    // La ligne du 16/03 est lue (créée) AVANT celle du 15/03 : la séquence reste chronologique.
    const m = depotEnMemoire([
      commande('tard', 200, D(2027, 3, 16)),
      commande('tot', 100, D(2027, 3, 15)),
    ]);
    const rendues = await emettreAutofactures(m.depot, HORLOGE);
    expect(rendues.map((a) => a.emiseLe)).toEqual([D(2027, 3, 15), D(2027, 3, 16)]);
    expect(m.autofactures.map((a) => a.ligneIds)).toEqual([['tot'], ['tard']]);
  });
});

describe('REQ-ARG-018 (art. 5.4) — une ligne régularisée est datée de sa régularisation', () => {
  // Acquise et constatée le lundi 2027-03-01, bloquée, puis régularisée le lundi 2027-03-22.
  const LUNDI_1 = D(2027, 3, 1);
  const REGULARISEE = D(2027, 3, 22);
  const regularisee = (id: string, c: number): LigneAcquise => ({
    ...commande(id, c, LUNDI_1),
    regulariseLe: REGULARISEE,
  });

  it('REQ-ARG-018 : TÉMOIN — émise le jour de la régularisation, prestation au jour d’acquisition', () => {
    const [af] = composerAutofactures([regularisee('a', 100)]);
    expect(af?.emiseLe).toEqual(REGULARISEE);
    expect(af?.acquiseLe).toEqual(LUNDI_1);
    expect(af?.decompte).toMatchObject([{ encaissementIntegralLe: LUNDI_1 }]);
  });

  it('REQ-ARG-018 : TÉMOIN — l’échéance court de la régularisation, non du constat', () => {
    const [af] = composerAutofactures([regularisee('a', 100)]);
    expect(af?.echeanceLe).toEqual(echeanceAutofacture(REGULARISEE));
    expect(af?.echeanceLe).toEqual(D(2027, 4, 21));
  });

  it('REQ-ARG-018 : une ligne régularisée ne rejoint pas l’autofacture de son jour d’acquisition', () => {
    const afs = composerAutofactures([regularisee('b', 200), commande('a', 100, LUNDI_1)]);
    expect(afs.map((a) => [a.ligneIds, a.emiseLe])).toEqual([
      [['a'], LUNDI_1],
      [['b'], REGULARISEE],
    ]);
  });

  it('REQ-ARG-018 : une régularisation antérieure au jour d’établissement ne l’avance pas', () => {
    const [af] = composerAutofactures([{ ...commande('a', 100, SAMEDI), regulariseLe: SAMEDI }]);
    expect(af?.emiseLe).toEqual(D(2027, 3, 15));
  });

  it('REQ-ARG-018 : le passage n’émet pas avant le jour de la régularisation', async () => {
    const m = depotEnMemoire([regularisee('a', 100)]);
    const veille = horlogeFigee(Date.UTC(2027, 2, 21, 12));
    expect(await emettreAutofactures(m.depot, veille)).toEqual([]);
    const [af] = await emettreAutofactures(m.depot, horlogeFigee(Date.UTC(2027, 2, 22, 12)));
    expect(af?.emiseLe).toEqual(REGULARISEE);
  });
});

describe('REQ-ARG-018 — la séquence est chronologique', () => {
  it('REQ-ARG-018 : TÉMOIN — une ligne du 16/03 lue avant une ligne du 15/03 : le 15 sort d’abord', () => {
    const afs = composerAutofactures([
      commande('tard', 200, D(2027, 3, 16)),
      commande('tot', 100, D(2027, 3, 15)),
    ]);
    expect(afs.map((a) => a.emiseLe)).toEqual([D(2027, 3, 15), D(2027, 3, 16)]);
  });

  it('REQ-ARG-018 : même jour d’émission → l’ordre des jours d’acquisition, quel que soit l’ordre lu', () => {
    const afs = composerAutofactures([
      commande('dimanche', 200, D(2027, 3, 14)),
      commande('samedi', 100, SAMEDI),
    ]);
    expect(afs.map((a) => a.ligneIds)).toEqual([['samedi'], ['dimanche']]);
  });
});

describe('REQ-ARG-014 — une autofacture par jour d’ACQUISITION, jamais une fusion de jours', () => {
  it('REQ-ARG-014 : TÉMOIN — encaissements intégraux samedi et dimanche → DEUX autofactures, émises le lundi', () => {
    const DIMANCHE = D(2027, 3, 14);
    const afs = composerAutofactures([commande('a', 100, SAMEDI), commande('b', 200, DIMANCHE)]);
    expect(afs).toHaveLength(2);
    expect(afs.map((a) => a.emiseLe)).toEqual([D(2027, 3, 15), D(2027, 3, 15)]);
    expect(afs.map((a) => a.acquiseLe)).toEqual([SAMEDI, DIMANCHE]);
    expect(afs.map((a) => a.ligneIds)).toEqual([['a'], ['b']]);
  });

  it('REQ-ARG-014 : le rattrapage de trois jours manqués fait trois autofactures', () => {
    const afs = composerAutofactures([
      commande('a', 1, D(2027, 3, 8)),
      commande('b', 2, D(2027, 3, 9)),
      commande('c', 3, D(2027, 3, 10)),
    ]);
    expect(afs.map((a) => a.ligneIds)).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('REQ-ARG-014 — horloge injectée : aucune autofacture datée dans le futur', () => {
  it('REQ-ARG-014 : TÉMOIN — le vendredi, une ligne acquise le samedi suivant n’est pas émise', async () => {
    const vendredi = horlogeFigee(Date.UTC(2027, 2, 12, 10)); // 2027-03-12, 11 h à Paris
    const m = depotEnMemoire([commande('a', 100), commande('b', 200, SAMEDI)]);
    const rendues = await emettreAutofactures(m.depot, vendredi);
    expect(rendues.map((a) => a.ligneIds)).toEqual([['a']]);
    expect(m.affectation.has('b')).toBe(false);
  });

  it('REQ-ARG-014 : le jour d’établissement est lu à Paris — 23 h 30 UTC le 14 est déjà le 15', async () => {
    const m = depotEnMemoire([commande('a', 100, SAMEDI)]);
    expect(await emettreAutofactures(m.depot, horlogeFigee(Date.UTC(2027, 2, 14, 22, 30)))).toEqual(
      []
    );
    const [af] = await emettreAutofactures(m.depot, horlogeFigee(Date.UTC(2027, 2, 14, 23, 30)));
    expect(af?.emiseLe).toEqual(D(2027, 3, 15));
  });
});
