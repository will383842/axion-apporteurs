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
} from '../../../src/domain/evenement/charges';
import { EVENEMENTS_APPORTEUR } from '../../../src/domain/apporteur/statut';
import { TRANSITIONS_APPORTEUR } from '../../../src/domain/apporteur/matrice';
import {
  GENESE,
  calculerSelfHash,
  type Enregistrement,
  type LigneJournal,
} from '../../../src/domain/evenement/journal';
import { TACHES } from '../../../src/server/taches/registre';
import { passageDuJournal } from '../../../src/server/taches/inscriptions';

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
