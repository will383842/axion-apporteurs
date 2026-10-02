// @req REQ-DM-024
/**
 * DM-45, en mémoire — la charge FERMÉE de `apporteur_statut_modifie` à la NAISSANCE d'un apporteur
 * (`de` nul, `transition: 'creer'`, sans donnée personnelle, acteur obligatoire) et le passage
 * `journal_verifier`, qui vérifie la chaîne par ses liens de hash et échoue en nommant la faute et le
 * maillon, jamais une charge. La même chose en base réelle :
 * `tests/integration/journal-premier-ecrivain.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { controler, type Vue } from '../../../scripts/gates/journal-sans-pii';
import { randomUUID } from 'node:crypto';
import {
  CHARGES_PAR_TYPE,
  TRANSITIONS_DU_JOURNAL_APPORTEUR,
  FORMES,
  HASH_HEX_64,
} from '../../../src/domain/evenement/charges';
import { EVENEMENTS_APPORTEUR } from '../../../src/domain/apporteur/statut';
import { TRANSITIONS_APPORTEUR } from '../../../src/domain/apporteur/matrice';
import {
  ALGORITHME,
  GENESE,
  calculerSelfHash,
  type Enregistrement,
  type LigneJournal,
} from '../../../src/domain/evenement/journal';
import { TACHES } from '../../../src/server/taches/registre';
import { inscriptions, passageDuJournal } from '../../../src/server/taches/inscriptions';
import { ajouterEvenement, lireJournalParLots } from '../../../src/server/evenement/journal';

const NAISSANCE = () => ({
  de: null,
  vers: 'candidat',
  transition: 'creer',
  acteur: { par: 'systeme' },
});

/** Une chaîne bien formée : la genèse, puis `n` naissances d'apporteur. */
function chaine(n: number): LigneJournal[] {
  const genese: LigneJournal = { ...GENESE, id: '1' };
  const lignes: LigneJournal[] = [genese];
  for (let i = 0; i < n; i += 1) {
    const e: Enregistrement = {
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: randomUUID(),
      survenuAt: new Date(Date.UTC(2026, 9, 2, 10, i)).toISOString(),
      charge: NAISSANCE(),
    };
    const prevHash = lignes[lignes.length - 1]!.selfHash;
    lignes.push({ ...e, id: String(i + 2), prevHash, selfHash: calculerSelfHash(prevHash, e) });
  }
  return lignes;
}

describe('REQ-DM-024 — la charge de `apporteur_statut_modifie` est fermée', () => {
  const schema = CHARGES_PAR_TYPE.apporteur_statut_modifie;

  it('REQ-DM-024 : la naissance — `de` nul, `vers: candidat`, `transition: creer`, l’acteur système', () => {
    expect(schema.safeParse(NAISSANCE()).success).toBe(true);
  });

  it('REQ-DM-024 : une transition de la matrice passe aussi, avec son `de`', () => {
    expect(
      schema.safeParse({
        de: 'candidat',
        vers: 'retenu',
        transition: 'retenir',
        acteur: { par: 'systeme' },
      }).success
    ).toBe(true);
  });

  it('REQ-DM-024 : les codes sont DÉRIVÉS — la naissance, puis une flèche par transition de la matrice ; `creer` n’est pas une flèche', () => {
    expect([...TRANSITIONS_DU_JOURNAL_APPORTEUR]).toEqual(['creer', ...EVENEMENTS_APPORTEUR]);
    const fleches = new Set(Object.values(TRANSITIONS_APPORTEUR).flatMap((t) => Object.keys(t)));
    expect(fleches.has('creer')).toBe(false);
  });

  it.each([
    ['un nom', { nom: 'Camille Durand' }],
    ['un courriel', { email: 'camille@example.test' }],
    ['la candidature (portée par apporteurs.candidature_id)', { candidatureId: randomUUID() }],
  ])(
    'REQ-DM-024 : %s est REFUSÉ (aucune donnée en trop dans un journal append-only)',
    (_q, en_plus) => {
      expect(schema.safeParse({ ...NAISSANCE(), ...en_plus }).success).toBe(false);
    }
  );

  it('REQ-DM-024 : `de` nul si et seulement si l’événement est la naissance', () => {
    expect(schema.safeParse({ ...NAISSANCE(), de: 'candidat' }).success).toBe(false);
    expect(
      schema.safeParse({
        de: null,
        vers: 'retenu',
        transition: 'retenir',
        acteur: { par: 'systeme' },
      }).success
    ).toBe(false);
  });

  it('REQ-DM-024 : l’acteur est OBLIGATOIRE, et sous sa forme unique', () => {
    const sans = Object.fromEntries(
      Object.entries(NAISSANCE()).filter(([cle]) => cle !== 'acteur')
    );
    expect(schema.safeParse(sans).success).toBe(false);
    expect(schema.safeParse({ ...NAISSANCE(), acteur: { par: 'quelqu-un' } }).success).toBe(false);
    expect(FORMES.acteur().safeParse({ par: 'systeme' }).success).toBe(true);
  });

  it('REQ-DM-024 : HYP-A02-ACTEUR-JOURNAL — `id` présent si et seulement si l’acteur n’est pas le système', () => {
    const acteur = FORMES.acteur();
    const id = randomUUID();
    expect(acteur.safeParse({ par: 'apporteur', id }).success).toBe(true);
    expect(acteur.safeParse({ par: 'utilisateur_console', id }).success).toBe(true);
    expect(acteur.safeParse({ par: 'apporteur' }).success).toBe(false);
    expect(acteur.safeParse({ par: 'utilisateur_console' }).success).toBe(false);
    expect(acteur.safeParse({ par: 'systeme', id }).success).toBe(false);
    expect(acteur.safeParse({ par: 'apporteur', id: 'pas-un-uuid' }).success).toBe(false);
  });

  it('REQ-DM-024 : un statut hors de la liste stockée est refusé', () => {
    expect(schema.safeParse({ ...NAISSANCE(), vers: 'actif' }).success).toBe(false);
  });
});

describe('REQ-DM-024 — le passage `journal_verifier`', () => {
  it('REQ-DM-024 : la tâche est au registre des tâches de fond, sous son exigence', () => {
    expect(TACHES.journal_verifier).toEqual({ req: 'REQ-DM-024' });
  });

  it('REQ-DM-024 : une chaîne intègre — le passage réussit et compte ses maillons', async () => {
    expect(await passageDuJournal(async () => chaine(3))()).toEqual({ maillons: 4 });
  });

  it('REQ-DM-024 : TÉMOIN — une charge FALSIFIÉE fait échouer le passage, qui nomme la faute et le maillon', async () => {
    const lignes = chaine(3);
    lignes[2] = { ...lignes[2]!, charge: { ...(lignes[2]!.charge as object), vers: 'signe' } };
    const e = await passageDuJournal(async () => lignes)().then(
      () => null,
      (x: Error) => x
    );
    expect(e?.message).toMatch(/^chaine_rompue : [a-z_]+, maillon 3$/);
  });

  it('REQ-DM-024 : l’erreur ne porte jamais la charge ni l’agrégat', async () => {
    const lignes = chaine(2);
    const agregat = lignes[1]!.agregatId!;
    lignes[1] = { ...lignes[1]!, charge: { ...(lignes[1]!.charge as object), vers: 'signe' } };
    const e = await passageDuJournal(async () => lignes)().catch((x: Error) => x);
    expect(String((e as Error).message)).not.toContain(agregat);
    expect(String((e as Error).message)).not.toContain('signe');
  });

  it('REQ-DM-024 : la vérification suit les LIENS DE HASH, pas l’ordre de lecture', async () => {
    const lignes = chaine(3);
    const melangee = [lignes[2]!, lignes[0]!, lignes[3]!, lignes[1]!];
    expect(await passageDuJournal(async () => melangee)()).toEqual({ maillons: 4 });
  });
});

// ── le raffinement desserré dans la garde journal:sans-pii ──────────────────────────────────────
// DM-45 laisse la garde traverser un `refine` / `superRefine` (il restreint, il ne transforme pas) :
// ces témoins prouvent que ce chemin ne laisse passer NI une chaîne libre, NI un objet ouvert, NI une
// transformation cachée sous un raffinement — et que la forme unique de l'acteur, elle, passe.

const sousLaGarde = (charges: Vue['charges']): string[] =>
  controler({ typesDuSchema: Object.keys(charges), code: [], charges }).fautes.map(
    (f) => `${f.famille} ${f.ou}`
  );

describe('REQ-DM-024 — un raffinement ne blanchit rien sous la garde du journal', () => {
  it('REQ-DM-024 : TÉMOIN — une chaîne libre sous un raffinement rougit, au chemin de son champ', () => {
    expect(
      sousLaGarde({ bac: z.object({ motif: z.string().refine(() => true) }).strict() })
    ).toEqual(['feuille_hors_liste bac.motif']);
  });

  it('REQ-DM-024 : TÉMOIN — un objet ouvert sous un superRefine rougit, avec son champ de personne', () => {
    expect(sousLaGarde({ bac: z.object({ nom: z.string() }).superRefine(() => {}) })).toEqual([
      'charge_ouverte bac',
      'champ_nominatif bac.nom',
      'feuille_hors_liste bac.nom',
    ]);
  });

  it('REQ-DM-024 : TÉMOIN — une transformation sous un raffinement rougit, au chemin de son champ', () => {
    expect(
      sousLaGarde({
        bac: z
          .object({
            quand: FORMES.horodatage()
              .transform((s) => s)
              .refine(() => true),
          })
          .strict(),
      })
    ).toEqual(['feuille_hors_liste bac.quand']);
  });

  it('REQ-DM-024 : contre-témoin — la forme de l’acteur, raffinée, passe la garde', () => {
    expect(sousLaGarde({ bac: z.object({ acteur: FORMES.acteur() }).strict() })).toEqual([]);
  });
});

// ── L'écrivain et le lecteur du journal, sur un client simulé (la mutation ne joue que tests/unit) ──

/** Une ligne de la base telle que Prisma la rend : id en bigint, date en Date. */
const enBase = (l: LigneJournal) => ({
  ...l,
  id: BigInt(l.id),
  survenuAt: new Date(l.survenuAt),
});

/** Un client dont `evenement.findMany` sert des lots et ENREGISTRE ses arguments. */
function clientDeLecture(lignes: LigneJournal[]) {
  const appels: unknown[] = [];
  const base = lignes.map(enBase);
  const client = {
    evenement: {
      findMany: async (a: { where: { id?: { gt: bigint } }; take: number }) => {
        appels.push(a);
        const apres = a.where.id?.gt ?? -1n;
        return base.filter((l) => l.id > apres).slice(0, a.take);
      },
    },
  };
  return { client: client as never, appels };
}

describe('REQ-DM-024 — le journal se lit PAR LOTS ordonnés, dans la forme que la vérification lit', () => {
  it('REQ-DM-024 : cinq lignes en lots de deux — trois lectures, la suivante après le dernier id lu, et les lignes rendues telles quelles', async () => {
    const lignes = chaine(4);
    const { client, appels } = clientDeLecture(lignes);
    expect(await lireJournalParLots(client, 2)).toEqual(lignes);
    expect(appels).toEqual([
      { where: {}, orderBy: { id: 'asc' }, take: 2 },
      { where: { id: { gt: 2n } }, orderBy: { id: 'asc' }, take: 2 },
      { where: { id: { gt: 4n } }, orderBy: { id: 'asc' }, take: 2 },
    ]);
  });

  it('REQ-DM-024 : un nombre de lignes MULTIPLE du lot — une dernière lecture vide arrête la boucle', async () => {
    const { client, appels } = clientDeLecture(chaine(3));
    expect(await lireJournalParLots(client, 2)).toHaveLength(4);
    expect(appels).toHaveLength(3);
  });

  it('REQ-DM-024 : par défaut, un lot de mille lignes', async () => {
    const { client, appels } = clientDeLecture(chaine(1));
    await lireJournalParLots(client);
    expect(appels).toEqual([{ where: {}, orderBy: { id: 'asc' }, take: 1000 }]);
  });

  it('REQ-DM-024 : la tâche `journal_verifier` du lanceur lit le journal de la base et compte ses maillons', async () => {
    const { client } = clientDeLecture(chaine(2));
    expect(await inscriptions(client).journal_verifier!()).toEqual({ maillons: 3 });
  });
});

/** Une transaction simulée pour l'écrivain : verrou, tête, création — chaque appel enregistré. */
function transaction(tete: { selfHash: string } | null) {
  const appels: { quoi: string; args: unknown }[] = [];
  const tx = {
    $executeRaw: async (...args: unknown[]) => {
      appels.push({ quoi: 'verrou', args: args.slice(1) });
      return 0;
    },
    evenement: {
      findFirst: async (args: unknown) => {
        appels.push({ quoi: 'tete', args });
        return tete;
      },
      create: async (args: unknown) => {
        appels.push({ quoi: 'creer', args });
        return { id: 7n };
      },
    },
  };
  return { tx: tx as never, appels };
}

const UUID_MAJUSCULE = '0F8FAD5B-D9CB-469F-A165-70867728950E';

describe('REQ-DM-024 — l’écrivain unique du journal', () => {
  it('REQ-DM-024 : il prend le verrou, lit la tête, et chaîne le maillon sur elle — identifiant d’agrégat canonique, en minuscules', async () => {
    const prev = GENESE.selfHash;
    const { tx, appels } = transaction({ selfHash: prev });
    const survenuAt = new Date('2026-10-02T10:00:00.000Z');
    const r = await ajouterEvenement(tx, {
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: UUID_MAJUSCULE,
      survenuAt,
      charge: NAISSANCE(),
    });
    const enregistrement: Enregistrement = {
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: UUID_MAJUSCULE.toLowerCase(),
      survenuAt: survenuAt.toISOString(),
      charge: NAISSANCE(),
    };
    const selfHash = calculerSelfHash(prev, enregistrement);
    expect(r).toEqual({ id: '7', selfHash });
    expect(appels.map((a) => a.quoi)).toEqual(['verrou', 'tete', 'creer']);
    expect(appels[1]!.args).toEqual({ orderBy: { id: 'desc' }, select: { selfHash: true } });
    expect(appels[2]!.args).toEqual({
      data: { ...enregistrement, survenuAt, prevHash: prev, selfHash },
      select: { id: true },
    });
  });

  it('REQ-DM-024 : sans agrégat ni identifiant, ils s’écrivent nuls', async () => {
    const { tx, appels } = transaction({ selfHash: GENESE.selfHash });
    await ajouterEvenement(tx, {
      type: 'apporteur_statut_modifie',
      survenuAt: new Date('2026-10-02T10:00:00.000Z'),
      charge: NAISSANCE(),
    });
    expect(appels[2]!.args).toMatchObject({ data: { agregat: null, agregatId: null } });
  });

  it('REQ-DM-024 : un client HORS transaction est refusé, avant tout appel', async () => {
    const { tx, appels } = transaction({ selfHash: GENESE.selfHash });
    const nu = Object.assign(tx as object, { $transaction: async () => undefined });
    await expect(
      ajouterEvenement(nu as never, {
        type: 'apporteur_statut_modifie',
        survenuAt: new Date(),
        charge: NAISSANCE(),
      })
    ).rejects.toThrow(
      'ajouterEvenement exige une transaction ouverte : reçu un client hors transaction'
    );
    expect(appels).toEqual([]);
  });

  it('REQ-DM-024 : une charge refusée nomme le chemin et le code de chaque écart, jamais une valeur — et rien n’est écrit', async () => {
    const { tx, appels } = transaction({ selfHash: GENESE.selfHash });
    const ecrire = (type: 'apporteur_statut_modifie' | 'journal_ouvert', charge: unknown) =>
      ajouterEvenement(tx, { type, survenuAt: new Date(), charge });
    await expect(
      ecrire('apporteur_statut_modifie', { ...NAISSANCE(), de: 'candidat' })
    ).rejects.toThrow('charge refusée pour le type apporteur_statut_modifie : de custom');
    await expect(ecrire('journal_ouvert', 'pas un objet')).rejects.toThrow(
      'charge refusée pour le type journal_ouvert : (racine) invalid_type'
    );
    expect(appels).toEqual([]);
  });

  it('REQ-DM-024 : un identifiant d’agrégat non canonique est refusé, avant tout appel', async () => {
    const { tx, appels } = transaction({ selfHash: GENESE.selfHash });
    await expect(
      ajouterEvenement(tx, {
        type: 'apporteur_statut_modifie',
        agregatId: 'pas-un-uuid',
        survenuAt: new Date(),
        charge: NAISSANCE(),
      })
    ).rejects.toThrow('agregatId refusé : un UUID sous sa forme canonique à tirets est attendu');
    expect(appels).toEqual([]);
  });

  it('REQ-DM-024 : un journal sans genèse est une faute nommée, rien n’est créé', async () => {
    const { tx, appels } = transaction(null);
    await expect(
      ajouterEvenement(tx, {
        type: 'apporteur_statut_modifie',
        survenuAt: new Date(),
        charge: NAISSANCE(),
      })
    ).rejects.toThrow(/journal sans genèse/);
    expect(appels.map((a) => a.quoi)).toEqual(['verrou', 'tete']);
  });
});

describe('REQ-DM-024 — les formes et les raffinements nomment leur écart', () => {
  it('REQ-DM-024 : l’acteur incohérent est refusé sur `id`, motif `acteur_id_incoherent`', () => {
    const r = FORMES.acteur().safeParse({ par: 'systeme', id: randomUUID() });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.path, i.message])).toEqual([
      [['id'], 'acteur_id_incoherent'],
    ]);
  });

  it('REQ-DM-024 : une naissance incohérente est refusée sur `de`, motif `naissance_incoherente`', () => {
    const r = CHARGES_PAR_TYPE.apporteur_statut_modifie.safeParse({
      ...NAISSANCE(),
      de: 'candidat',
    });
    expect(r.error?.issues.map((i) => [i.path, i.message])).toEqual([
      [['de'], 'naissance_incoherente'],
    ]);
  });

  it('REQ-DM-024 : chaque forme admet sa valeur et refuse sa voisine', () => {
    expect(FORMES.identifiant().safeParse(randomUUID()).success).toBe(true);
    expect(FORMES.identifiant().safeParse('x').success).toBe(false);
    expect(FORMES.empreinte().safeParse('a'.repeat(64)).success).toBe(true);
    expect(FORMES.empreinte().safeParse('A'.repeat(64)).success).toBe(false);
    expect(FORMES.empreinte().safeParse('a'.repeat(63)).success).toBe(false);
    expect(FORMES.empreinte().safeParse(`${'a'.repeat(64)}0`).success).toBe(false);
    expect(FORMES.montantCents().safeParse(12).success).toBe(true);
    expect(FORMES.montantCents().safeParse(1.5).success).toBe(false);
    expect(FORMES.horodatage().safeParse('2026-10-02T10:00:00.000Z').success).toBe(true);
    expect(FORMES.horodatage().safeParse('demain').success).toBe(false);
    expect(HASH_HEX_64.test(`x${'a'.repeat(64)}`)).toBe(false);
  });

  it('REQ-DM-024 : la genèse porte son algorithme, et rien d’autre', () => {
    const genese = CHARGES_PAR_TYPE.journal_ouvert;
    expect(genese.safeParse({ algorithme: ALGORITHME }).success).toBe(true);
    expect(genese.safeParse({ algorithme: ALGORITHME, autre: 1 }).success).toBe(false);
    expect(genese.safeParse({ algorithme: 'md5' }).success).toBe(false);
  });
});
