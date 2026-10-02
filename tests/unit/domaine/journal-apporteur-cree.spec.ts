// @req REQ-DM-024
/**
 * DM-45, en mémoire — la charge FERMÉE de `apporteur_cree` (sans donnée personnelle, acteur
 * obligatoire) et le passage `journal_verifier`, qui vérifie la chaîne par ses liens de hash et
 * échoue en nommant la faute et le maillon, jamais une charge. La même chose en base réelle :
 * `tests/integration/journal-premier-ecrivain.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CHARGES_PAR_TYPE, FORMES } from '../../../src/domain/evenement/charges';
import {
  GENESE,
  calculerSelfHash,
  type Enregistrement,
  type LigneJournal,
} from '../../../src/domain/evenement/journal';
import { TACHES } from '../../../src/server/taches/registre';
import { passageDuJournal } from '../../../src/server/taches/inscriptions';

const CHARGE = () => ({
  apporteurId: randomUUID(),
  candidatureId: randomUUID(),
  statut: 'candidat',
  acteur: { par: 'systeme' },
});

/** Une chaîne bien formée : la genèse, puis `n` créations d'apporteur. */
function chaine(n: number): LigneJournal[] {
  const lignes: LigneJournal[] = [{ ...GENESE, id: '1' } as LigneJournal];
  for (let i = 0; i < n; i += 1) {
    const charge = CHARGE();
    const e: Enregistrement = {
      type: 'apporteur_cree',
      agregat: 'apporteur',
      agregatId: charge.apporteurId,
      survenuAt: new Date(Date.UTC(2026, 9, 2, 10, i)).toISOString(),
      charge,
    };
    const prevHash = lignes[lignes.length - 1]!.selfHash;
    lignes.push({ ...e, id: String(i + 2), prevHash, selfHash: calculerSelfHash(prevHash, e) });
  }
  return lignes;
}

describe('REQ-DM-024 — la charge de `apporteur_cree` est fermée', () => {
  const schema = CHARGES_PAR_TYPE.apporteur_cree;

  it('REQ-DM-024 : les identifiants, le statut de naissance et l’acteur — rien d’autre', () => {
    expect(schema.safeParse(CHARGE()).success).toBe(true);
  });

  it.each([
    ['un nom', { nom: 'Camille Durand' }],
    ['un courriel', { email: 'camille@example.test' }],
    ['un champ inconnu', { note: 'x' }],
  ])(
    'REQ-DM-024 : %s est REFUSÉ (aucune donnée personnelle dans un journal append-only)',
    (_q, en_plus) => {
      expect(schema.safeParse({ ...CHARGE(), ...en_plus }).success).toBe(false);
    }
  );

  it('REQ-DM-024 : l’acteur est OBLIGATOIRE, et sous sa forme unique', () => {
    const { acteur: _retire, ...sans } = CHARGE();
    expect(schema.safeParse(sans).success).toBe(false);
    expect(schema.safeParse({ ...CHARGE(), acteur: { par: 'quelqu-un' } }).success).toBe(false);
    expect(schema.safeParse({ ...CHARGE(), acteur: { par: 'systeme', id: 'x' } }).success).toBe(
      false
    );
    expect(FORMES.acteur().safeParse({ par: 'systeme' }).success).toBe(true);
  });

  it('REQ-DM-024 : un statut autre que celui de naissance, ou un identifiant mal formé, est refusé', () => {
    expect(schema.safeParse({ ...CHARGE(), statut: 'signe' }).success).toBe(false);
    expect(schema.safeParse({ ...CHARGE(), apporteurId: 'pas-un-uuid' }).success).toBe(false);
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
    lignes[2] = { ...lignes[2]!, charge: { ...(lignes[2]!.charge as object), statut: 'signe' } };
    const e = await passageDuJournal(async () => lignes)().then(
      () => null,
      (x: Error) => x
    );
    expect(e?.message).toMatch(/^chaine_rompue : [a-z_]+, maillon 3$/);
  });

  it('REQ-DM-024 : l’erreur ne porte jamais la charge', async () => {
    const lignes = chaine(2);
    const secret = lignes[1]!.charge as { apporteurId: string };
    lignes[1] = { ...lignes[1]!, charge: { ...secret, statut: 'signe' } };
    const e = await passageDuJournal(async () => lignes)().catch((x: Error) => x);
    expect(String((e as Error).message)).not.toContain(secret.apporteurId);
  });

  it('REQ-DM-024 : la vérification suit les LIENS DE HASH, pas l’ordre de lecture', async () => {
    const lignes = chaine(3);
    const melangee = [lignes[2]!, lignes[0]!, lignes[3]!, lignes[1]!];
    expect(await passageDuJournal(async () => melangee)()).toEqual({ maillons: 4 });
  });
});
