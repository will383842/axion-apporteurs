// @req REQ-GOV-014
// @req REQ-GOV-026
// @req REQ-GOV-021
/**
 * CLORE UNE TÂCHE LIVRÉE SEULE, HORS DE TOUT LOT (GOV-057).
 *
 * LE DÉFAUT. Le pas 8 de `docs/PROTOCOLE-FUSION.md` ne prescrivait qu'une commande :
 * `lot:cloture --lot <id>`. Or des tâches sont livrées SANS lot — six, dont les cinq dernières de
 * la phase −1 — et `cloture.ts` n'avait aucun chemin pour elles : il ÉCRIT `t.lot = lotId`, il
 * TIRE son périmètre de ce même champ, et aucun écrivain ne posait `branch` alors que le schéma
 * refuse `fusionnee` sans elle. Clore une tâche seule, c'était donc soit inventer un lot, soit
 * écrire `docs/tasks.json` à la main — la seule écriture que ce dépôt interdit.
 *
 * CE QUE CE FICHIER TIENT. (1) Le chemin outillé, `cloturerUneTacheSeule`, clôt une tâche `en_cours`
 * livrée seule : elle ressort `fusionnee` avec ses trois preuves — `pr`, `branch`, attestation au
 * SHA entier — SANS lot inventé, et la vraie garde du registre sort en ZÉRO. (2) La même tâche
 * close À LA MAIN, sans `branch`, fait sortir la même garde en code NON NUL, et la sortie NOMME la
 * famille. (3) Chaque refus du chemin outillé a son témoin, et un refus n'écrit RIEN. (4) Le pas 8
 * du protocole nomme ce chemin, et le script le déclare dans son usage.
 *
 * LA MESURE PART DU VRAI BACKLOG. Les témoins de registre n'éprouvent pas un document fabriqué :
 * ils prennent `docs/tasks.json`, le schéma, le registre des décisions et la charte tels qu'ils sont,
 * et n'en changent QU'UNE tâche. Un vert sur un document jouet ne dirait rien du vrai.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  ErreurDeCloture,
  cloturerUneTacheSeule,
  type Livraison,
  type Tache,
} from '../../../scripts/lot/cloture';
import { CHEMIN_GEL, controler, vuesDeLaPasse } from '../../../scripts/gates/gov-tasks';
import { chargerRegistre, CHEMIN_REGISTRE } from '../../../scripts/lot/registre-decisions';
import { CHEMIN_CHARTE, cheminsSchema } from '../../../scripts/lot/revues';
import { DEPOT_LOCAL } from '../../../scripts/lot/attestation';
import { LIVREE } from '../../../scripts/lot/avancement';
import { instantDuRegistre } from './instant-du-registre';

const CHEMIN_TACHES = 'docs/tasks.json';
const CHEMIN_SCHEMA = 'scripts/lot/tasks.schema.json';
const CHEMIN_PROTOCOLE = 'docs/PROTOCOLE-FUSION.md';
const CHEMIN_CLOTURE = 'scripts/lot/cloture.ts';
const GARDE = resolve('scripts/gates/gov-tasks.ts');
const TSX = resolve('node_modules/tsx/dist/cli.mjs');

type Doc = { version: number; taches: Tache[] };
const lireDoc = (): Doc => JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as Doc;
const schema = JSON.parse(readFileSync(CHEMIN_SCHEMA, 'utf8')) as object;
const registre = chargerRegistre(CHEMIN_REGISTRE);
const chemins = cheminsSchema(readFileSync(CHEMIN_CHARTE, 'utf8'));

/**
 * LA TÂCHE ÉPROUVÉE EST CHOISIE, PAS NOMMÉE : la première de CE dépôt encore à faire et rangée
 * dans AUCUN lot, et que PERSONNE n'a revendiquée. Un identifiant tapé cesserait d'être éligible
 * le jour où la tâche est livrée, et le témoin rougirait pour une raison qui n'est pas la sienne
 * (RM-01). « Sans propriétaire » n'est pas un confort : la fusion de #181 a livré la tâche jusque-là
 * première éligible, la suivante était déjà revendiquée, et le témoin qui promet « jamais
 * revendiquée » la prenait.
 * « Dont chaque dépendance est livrée » non plus : le 2026-09-29, la revendication de QA-T05 a fait
 * de QA-T11, qui en dépend, la première éligible ; la clôturer rougissait en `dep_non_livree`, à
 * raison, et le témoin échouait pour une raison qui n'était pas la sienne. Une tâche livrée seule
 * l'est sur une base où ses dépendances le sont déjà.
 */
function tacheSeule(doc: Doc): Tache {
  const livree = (id: string) => LIVREE.has(doc.taches.find((y) => y.id === id)?.statut ?? '');
  const t = doc.taches.find(
    (x) =>
      x.statut === 'a_faire' &&
      !x.lot &&
      !x.owner &&
      (x.repo ?? DEPOT_LOCAL) === DEPOT_LOCAL &&
      ((x as { deps?: string[] }).deps ?? []).every(livree) &&
      // Une tâche attribuée doit porter son acceptance et ses tests (schéma) : sans eux, la clôture
      // rougirait sur le schéma, pour une raison qui n'est pas celle du témoin.
      Boolean((x as { acceptance?: string }).acceptance) &&
      Object.keys((x as { tests?: Record<string, unknown> }).tests ?? {}).length > 0
  );
  if (!t) throw new Error('aucune tâche de ce dépôt à faire hors lot : le témoin n’a plus d’objet');
  return t;
}

/** Une tâche rangée dans un lot, prise elle aussi au backlog réel. */
function tacheDUnLot(doc: Doc): Tache {
  const t = doc.taches.find((x) => typeof x.lot === 'string' && x.lot.length > 0);
  if (!t) throw new Error('aucune tâche rangée dans un lot : le témoin n’a plus d’objet');
  return t;
}

/** Un propriétaire VALIDE, lu sur une tâche déjà livrée — pas tapé. */
function unProprietaire(doc: Doc): string {
  const o = doc.taches.find((x) => LIVREE.has(x.statut) && x.owner)?.owner;
  if (!o) throw new Error('aucune tâche livrée ne porte de propriétaire');
  return o;
}

/** Un numéro de PR qu'aucune tâche ne porte : le suivant du plus grand. */
function prLibre(doc: Doc): number {
  return Math.max(0, ...doc.taches.map((x) => x.pr ?? 0)) + 1;
}

const SHA = 'c'.repeat(40);
const QUAND = '2026-09-20T10:00:00Z';
/** L'instant de la passe, dérivé du registre : voir `instant-du-registre.ts`. */
const MAINTENANT = instantDuRegistre(QUAND);

/** La tâche, revendiquée comme le fait l'outil de revendication : `en_cours`, owner, branche. */
function revendiquee(doc: Doc): Tache {
  const t = tacheSeule(doc);
  t.statut = 'en_cours';
  t.owner = unProprietaire(doc);
  t.branch = `t/${t.id.toLowerCase()}`;
  return t;
}

function livraisonDe(t: Tache, doc: Doc, surcharge: Partial<Livraison> = {}): Livraison {
  return {
    pr: prLibre(doc),
    sha: SHA,
    fusionneeAt: QUAND,
    branch: t.branch ?? `t/${t.id.toLowerCase()}`,
    atterri: true,
    // Ce que la PR DÉCLARE livrer : son titre nomme la tâche, son champ `Lot:` est vide.
    titre: `fix(${t.id}): une livraison`,
    corps: 'Lot:\n',
    ...surcharge,
  };
}

/** Une AUTRE tâche du registre que `t`, pour composer une PR qui ne la déclare pas. */
function uneAutreTache(doc: Doc, t: Tache): Tache {
  return doc.taches.find((x) => x.id !== t.id && !x.lot && x.statut === 'a_faire')!;
}

const fautesDuRegistre = (doc: Doc) =>
  controler(doc, schema, registre, chemins, vuesDeLaPasse(MAINTENANT));

/**
 * LA VRAIE GARDE, LANCÉE EN SCRIPT, sur une copie du dépôt réduite à ce qu'elle lit. Le code de
 * sortie est ce que la CI juge : une fonction qui rend `[]` ne prouve pas que le binaire sort 0.
 */
function lancerLaGarde(doc: Doc): { code: number | null; sortie: string } {
  const bac = mkdtempSync(join(tmpdir(), 'gov-057-'));
  // GOV-150 : la garde lit aussi la liste du gel de la phase 1 (`CHEMIN_GEL`), en échec fermé.
  for (const f of [CHEMIN_SCHEMA, CHEMIN_REGISTRE, CHEMIN_CHARTE, CHEMIN_GEL]) {
    mkdirSync(join(bac, dirname(f)), { recursive: true });
    copyFileSync(f, join(bac, f));
  }
  mkdirSync(join(bac, dirname(CHEMIN_TACHES)), { recursive: true });
  writeFileSync(join(bac, CHEMIN_TACHES), JSON.stringify(doc, null, 2) + '\n');
  const r = spawnSync(process.execPath, [TSX, GARDE], { cwd: bac, encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout}\n${r.stderr}` };
}

describe('REQ-GOV-014 — le chemin outillé clôt une tâche livrée seule, sans inventer de lot', () => {
  it('REQ-GOV-026 — TÉMOIN FACE 1 : `en_cours` livrée seule → `fusionnee`, trois preuves, garde à ZÉRO', () => {
    const doc = lireDoc();
    const t = revendiquee(doc);
    const livraison = livraisonDe(t, doc);

    cloturerUneTacheSeule({ tacheId: t.id, livraison, taches: doc.taches });

    expect(t.statut).toBe('fusionnee');
    expect(t.pr).toBe(livraison.pr);
    expect(t.branch).toBe(livraison.branch);
    expect(t.attestation).toEqual({ pr: livraison.pr, sha: SHA, fusionneeAt: QUAND });
    // Aucun lot inventé : la tâche n'en avait pas, elle n'en a toujours pas.
    expect(t.lot ?? null).toBeNull();

    expect(fautesDuRegistre(doc)).toEqual([]);
    const garde = lancerLaGarde(doc);
    expect(garde.sortie).not.toContain('incohérence');
    expect(garde.code).toBe(0);
  }, 60_000);

  it('REQ-GOV-026 — TÉMOIN FACE 2 : la même close À LA MAIN, sans `branch`, fait sortir la garde NON NULLE, et la nomme', () => {
    const doc = lireDoc();
    const t = revendiquee(doc);
    const pr = prLibre(doc);
    // Ce que ferait une main : le statut, la PR, l'attestation — et la branche oubliée.
    t.statut = 'fusionnee';
    t.pr = pr;
    t.attestation = { pr, sha: SHA, fusionneeAt: QUAND };
    t.branch = null;

    const fautes = fautesDuRegistre(doc);
    const index = doc.taches.indexOf(t);
    expect(fautes.map((f) => f.famille)).toContain('schema');
    expect(fautes.some((f) => f.message.includes(`/taches/${index}/branch`))).toBe(true);

    const garde = lancerLaGarde(doc);
    expect(garde.code).not.toBe(0);
    expect(garde.sortie).toContain('── schema');
  }, 60_000);

  it('REQ-GOV-014 — une tâche `a_faire` jamais revendiquée reçoit sa `branch` de la livraison, et son propriétaire', () => {
    const doc = lireDoc();
    const t = tacheSeule(doc);
    expect(t.branch ?? null).toBeNull();
    const owner = unProprietaire(doc);
    const livraison = livraisonDe(t, doc);

    cloturerUneTacheSeule({ tacheId: t.id, livraison, taches: doc.taches, owner });

    expect(t.branch).toBe(livraison.branch);
    expect(t.owner).toBe(owner);
    expect(t.statut).toBe('fusionnee');
    expect(fautesDuRegistre(doc)).toEqual([]);
  });
});

describe('REQ-GOV-021 — chaque refus du chemin outillé est nommé, et un refus n’écrit RIEN', () => {
  /** Lance la clôture, rend les familles levées, et vérifie que le backlog n'a pas bougé. */
  function refus(
    prepare: (doc: Doc) => { tacheId: string; livraison: Livraison; owner?: string }
  ): string[] {
    const doc = lireDoc();
    const entree = prepare(doc);
    const avant = JSON.stringify(doc);
    try {
      cloturerUneTacheSeule({ ...entree, taches: doc.taches });
    } catch (e) {
      expect(JSON.stringify(doc)).toBe(avant);
      if (e instanceof ErreurDeCloture) return e.refus.map((r) => r.famille);
      throw e;
    }
    throw new Error('la clôture n’a rien refusé');
  }

  it('REQ-GOV-021 — TÉMOIN tache_inconnue : un identifiant absent du registre', () => {
    expect(
      refus((doc) => {
        const t = revendiquee(doc);
        return { tacheId: `${t.id}-INEXISTANTE`, livraison: livraisonDe(t, doc) };
      })
    ).toEqual(['tache_inconnue']);
  });

  it('REQ-GOV-021 — TÉMOIN tache_d_un_lot : une tâche rangée dans un lot se clôt par son lot, pas seule', () => {
    expect(
      refus((doc) => {
        const t = tacheDUnLot(doc);
        return { tacheId: t.id, livraison: livraisonDe(t, doc), owner: unProprietaire(doc) };
      })
    ).toContain('tache_d_un_lot');
  });

  it('REQ-GOV-021 — TÉMOIN tache_deja_livree : une tâche déjà livrée n’est pas re-close', () => {
    expect(
      refus((doc) => {
        const t = doc.taches.find((x) => LIVREE.has(x.statut) && !x.lot)!;
        return { tacheId: t.id, livraison: livraisonDe(t, doc) };
      })
    ).toContain('tache_deja_livree');
  });

  it('REQ-GOV-021 — TÉMOIN livraison_non_atterrie : une PR fusionnée dont l’atterrissage n’est pas vérifié', () => {
    expect(
      refus((doc) => {
        const t = revendiquee(doc);
        return { tacheId: t.id, livraison: livraisonDe(t, doc, { atterri: false }) };
      })
    ).toEqual(['livraison_non_atterrie']);
  });

  it('REQ-GOV-021 — TÉMOIN branche_absente : la livraison ne dit pas quelle branche a été fusionnée', () => {
    expect(
      refus((doc) => {
        const t = revendiquee(doc);
        return { tacheId: t.id, livraison: livraisonDe(t, doc, { branch: null }) };
      })
    ).toEqual(['branche_absente']);
  });

  it('REQ-GOV-021 — TÉMOIN tache_etrangere_a_la_pr : une PR qui ne déclare pas la tâche ne la clôt pas', () => {
    // Relevé par la lentille `securite` sur #182 : `--tache GOV-064 --pr 180` passait `fusionnee`
    // avec l'attestation d'une PR qui ne l'avait jamais portée, et `gov:tasks` restait à zéro.
    expect(
      refus((doc) => {
        const t = revendiquee(doc);
        const autre = uneAutreTache(doc, t);
        return {
          tacheId: t.id,
          livraison: livraisonDe(t, doc, { titre: `fix(${autre.id}): autre chose` }),
        };
      })
    ).toEqual(['tache_etrangere_a_la_pr']);
  });

  it('REQ-GOV-021 — TÉMOIN tache_etrangere_a_la_pr : une PR dont on ne sait pas lire la déclaration ne clôt rien', () => {
    // Une absence n'est pas une autorisation : sans titre ni corps, rien ne dit ce que la PR porte.
    expect(
      refus((doc) => {
        const t = revendiquee(doc);
        return { tacheId: t.id, livraison: livraisonDe(t, doc, { titre: null, corps: null }) };
      })
    ).toEqual(['tache_etrangere_a_la_pr']);
  });

  it('REQ-GOV-021 — CONTRE-TÉMOIN : une tâche nommée par le champ `Lot:` d’une PR titrée pour une autre est close', () => {
    const doc = lireDoc();
    const t = revendiquee(doc);
    const autre = uneAutreTache(doc, t);
    cloturerUneTacheSeule({
      tacheId: t.id,
      livraison: livraisonDe(t, doc, {
        titre: `fix(${autre.id}): une PR de lot`,
        corps: `Lot: ${t.id}\n`,
      }),
      taches: doc.taches,
    });
    expect(t.statut).toBe('fusionnee');
  });

  it('REQ-GOV-021 — TÉMOIN branche_hors_motif : une branche que le schéma refuserait n’est pas écrite', () => {
    // Écrite, elle rendrait le registre rouge, et `tache_deja_livree` interdirait ensuite de
    // re-clore pour la corriger : le refus doit tomber AVANT, sur le motif lu dans le schéma.
    expect(
      refus((doc) => {
        const t = revendiquee(doc);
        return {
          tacheId: t.id,
          livraison: livraisonDe(t, doc, { branch: 'feature/sans-prefixe-reconnu' }),
        };
      })
    ).toEqual(['branche_hors_motif']);
  });

  it('REQ-GOV-021 — TÉMOIN attestation_incomplete : sans le SHA entier, rien ne retrouverait le commit', () => {
    expect(
      refus((doc) => {
        const t = revendiquee(doc);
        return { tacheId: t.id, livraison: livraisonDe(t, doc, { sha: null }) };
      })
    ).toEqual(['attestation_incomplete']);
  });

  it('REQ-GOV-021 — TÉMOIN proprietaire_absent : une tâche sans propriétaire, et aucun fourni', () => {
    expect(
      refus((doc) => {
        const t = tacheSeule(doc);
        return { tacheId: t.id, livraison: livraisonDe(t, doc) };
      })
    ).toEqual(['proprietaire_absent']);
  });
});

describe('REQ-GOV-014 — le protocole et l’usage nomment le chemin outillé', () => {
  const pas8 = (() => {
    const texte = readFileSync(CHEMIN_PROTOCOLE, 'utf8');
    const debut = texte.indexOf('### Pas 8');
    const fin = texte.indexOf('\n## ', debut);
    return texte.slice(debut, fin);
  })();
  const entete = readFileSync(CHEMIN_CLOTURE, 'utf8').split('*/')[0]!;

  it('REQ-GOV-014 — le pas 8 décrit le cas « tâche seule » avec la commande `--tache`', () => {
    expect(pas8).toContain('pnpm lot:cloture -- --tache');
    expect(pas8.toLowerCase()).toContain('tâche seule');
  });

  it('REQ-GOV-014 — l’usage du script déclare le même mode que le protocole prescrit', () => {
    expect(entete).toContain('--tache <id>');
  });
});
