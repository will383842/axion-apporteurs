// @req REQ-GOV-026
/**
 * UN STATUT `fusionnee` PORTE SA PREUVE, DANS CE DÉPÔT AUSSI (GOV-042).
 *
 * LE DÉFAUT. L'attestation `{ pr, sha, fusionneeAt }` n'était exigée que des tâches livrées
 * AILLEURS : la condition de `scripts/lot/cloture.ts` gouvernait tout le bloc. Une tâche d'ici
 * passait `fusionnee` avec un `pr` nu, et rien ne conservait le commit qui l'avait fait atterrir —
 * une tâche passée `fusionnee` à la main restait verte.
 *
 * CE QUE CE FICHIER TIENT. (1) La MÊME attestation s'étend aux tâches locales, sans seconde forme
 * (RM-01), et la garde confronte les deux populations dans les DEUX sens. (2) Les tâches livrées
 * ailleurs restent vertes (contre-témoin). (3) Le RATTRAPAGE du passé lit le SHA dans l'historique
 * de la branche par défaut et ÉCHOUE BRUYAMMENT sur zéro commit ou plus d'un : il ne devine rien.
 * (4) Le passif que la recherche ne sait pas lever est DÉCLARÉ, confronté à l'historique réel, et
 * sa réciproque est gardée : tout le reste porte sa preuve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  PASSIF_SANS_ATTESTATION,
  commitsDAtterrissage,
  controlerAttestation,
  lireJournalDeFusion,
  rattraper,
  type CommitDeFusion,
  type TacheAttestable,
} from '../../../scripts/lot/attestation';
import { cloturerLeLot, type Tache as TacheDeCloture } from '../../../scripts/lot/cloture';
import { LIVREE } from '../../../scripts/lot/avancement';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const attestation = (pr: number, sha = SHA_A) => ({ pr, sha, fusionneeAt: '2026-09-20T10:00:00Z' });
const familles = (t: TacheAttestable, livree: boolean) =>
  controlerAttestation(t, livree).map((f) => f.famille);
const estLivree = (t: { statut: string }) => LIVREE.has(t.statut);

describe('REQ-GOV-026 — l’attestation s’étend aux tâches de CE dépôt, dans les deux sens', () => {
  it('REQ-GOV-026 — TÉMOIN : une tâche locale `fusionnee` sans attestation est REFUSÉE, et nommée', () => {
    const f = controlerAttestation(
      {
        id: 'GOV-901',
        repo: 'partners',
        statut: 'fusionnee',
        pr: 140,
        branch: 't/gov-901',
        attestation: null,
      },
      true
    );
    expect(f.map((x) => x.famille)).toEqual(['attestation_absente']);
    expect(f[0]!.message).toContain('GOV-901');
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : la même tâche AVEC son attestation, `pr` égal, est verte', () => {
    expect(
      familles(
        {
          id: 'GOV-901',
          repo: 'partners',
          statut: 'fusionnee',
          pr: 140,
          branch: 'b',
          attestation: attestation(140),
        },
        true
      )
    ).toEqual([]);
  });

  it('REQ-GOV-026 — TÉMOIN : l’attestation locale ne recopie pas un AUTRE numéro que `pr`', () => {
    expect(
      familles(
        {
          id: 'GOV-901',
          repo: 'partners',
          statut: 'fusionnee',
          pr: 140,
          branch: 'b',
          attestation: attestation(141),
        },
        true
      )
    ).toEqual(['attestation_pr_discordante']);
  });

  it('REQ-GOV-026 — L’AUTRE SENS : une attestation locale sans statut livré est refusée', () => {
    expect(
      familles(
        {
          id: 'GOV-901',
          repo: 'partners',
          statut: 'a_faire',
          pr: null,
          attestation: attestation(140),
        },
        false
      )
    ).toContain('attestation_sans_livraison');
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : une tâche livrée AILLEURS avec son attestation reste verte', () => {
    expect(
      familles(
        {
          id: 'INT-T01b',
          repo: 'axionia',
          statut: 'fusionnee',
          pr: null,
          attestation: attestation(998),
        },
        true
      )
    ).toEqual([]);
  });

  it('REQ-GOV-026 — le PASSIF déclaré sans attestation est vert ; s’il en reçoit une, il est périmé', () => {
    const p = PASSIF_SANS_ATTESTATION[0]!;
    const t = { id: p.id, repo: 'partners', statut: 'fusionnee', pr: 26, branch: 'b' };
    expect(familles({ ...t, attestation: null }, true)).toEqual([]);
    expect(familles({ ...t, attestation: attestation(26) }, true)).toContain(
      'attestation_passif_perime'
    );
  });
});

describe('REQ-GOV-026 — le rattrapage LIT le SHA dans l’historique, et échoue bruyamment', () => {
  const commit = (sha: string, message: string): CommitDeFusion => ({
    sha,
    fusionneeAt: '2026-09-20T08:00:00Z',
    message,
  });
  const locale = (id: string, pr: number | null): TacheAttestable => ({
    id,
    repo: 'partners',
    statut: 'fusionnee',
    pr,
    branch: 'b',
    attestation: null,
  });

  it('REQ-GOV-026 — UN commit d’atterrissage qui nomme la tâche : l’attestation en est lue', () => {
    const journal = [
      commit(SHA_B, 'feat(GOV-777): autre chose (#71)'),
      commit(SHA_A, 'chore(GOV-900): lot — GOV-901 et GOV-902 (#70)\n\nLot: GOV-901, GOV-902'),
    ];
    const r = rattraper([locale('GOV-901', 70)], journal, estLivree);
    expect(r.rattrapees).toEqual([
      { id: 'GOV-901', attestation: { pr: 70, sha: SHA_A, fusionneeAt: '2026-09-20T08:00:00Z' } },
    ]);
    expect(r.echecs).toEqual([]);
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : DEUX commits trouvés laissent l’attestation VIDE, et la tâche NOMMÉE', () => {
    const journal = [
      commit(SHA_A, 'feat(GOV-901): premier (#70)'),
      commit(SHA_B, 'fix(GOV-901): second (#70)'),
    ];
    const r = rattraper([locale('GOV-901', 70)], journal, estLivree);
    expect(r.rattrapees).toEqual([]);
    expect(r.echecs).toEqual([{ id: 'GOV-901', trouves: 2 }]);
  });

  it('REQ-GOV-026 — ZÉRO commit, ou un identifiant qui n’est qu’un PRÉFIXE, ne rattrape rien', () => {
    const journal = [commit(SHA_A, 'feat(GOV-9010): voisin (#70)')];
    expect(rattraper([locale('GOV-901', 70)], journal, estLivree).echecs).toEqual([
      { id: 'GOV-901', trouves: 0 },
    ]);
  });

  it('REQ-GOV-026 — le PASSIF est confirmé par l’historique RÉEL : aucune de ses tâches n’a UN commit', () => {
    const journal = lireJournalDeFusion('origin/main');
    expect(journal.length).toBeGreaterThan(0);
    const taches = (
      JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheAttestable[] }
    ).taches;
    for (const p of PASSIF_SANS_ATTESTATION) {
      const t = taches.find((x) => x.id === p.id);
      expect(t, `${p.id} est au passif mais n’est plus au registre`).toBeDefined();
      expect(
        commitsDAtterrissage(t!, journal).length,
        `${p.id} est rattrapable : retire-le du passif`
      ).not.toBe(1);
    }
  });

  it('REQ-GOV-026 — le binaire à blanc imprime le compte des tâches RÉELLEMENT rattrapables', () => {
    const journal = lireJournalDeFusion('origin/main');
    const taches = (
      JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheAttestable[] }
    ).taches;
    const attendu = rattraper(taches, journal, estLivree).rattrapees.length;
    const sortie = execFileSync(
      'npx',
      ['tsx', 'scripts/lot/cloture.ts', '--rattraper-attestations', '--a-blanc'],
      { encoding: 'utf8', stdio: 'pipe', shell: true }
    );
    expect(sortie).toContain(`${attendu} tâche(s) réellement rattrapée(s)`);
    for (const p of PASSIF_SANS_ATTESTATION) expect(sortie).toContain(p.id);
  }, 120_000);
});

describe('REQ-GOV-026 — `lot:cloture` écrit l’attestation des tâches locales, et refuse sans elle', () => {
  const tacheLocale = (): TacheDeCloture => ({
    id: 'GOV-901',
    titre: 'GOV-901',
    statut: 'a_faire',
    owner: 'A05',
    branch: null,
    pr: null,
    repo: 'partners',
  });
  const rendu = (fusion: object) => ({
    lotId: 'L0-99',
    resultats: [{ dev: { taskId: 'GOV-901', branch: 't/gov-901', pr: 70, stop: null }, fusion }],
  });

  it('REQ-GOV-026 — la clôture d’une tâche locale pose `pr` ET son attestation', () => {
    const taches = [tacheLocale()];
    cloturerLeLot({
      lotId: 'L0-99',
      rendu: rendu({ pr: 70, sha: SHA_A, fusionneeAt: '2026-09-20T08:00:00Z', atterri: true }),
      membres: ['GOV-901'],
      taches,
    });
    expect(taches[0]!.statut).toBe('fusionnee');
    expect(taches[0]!.pr).toBe(70);
    expect(taches[0]!.attestation).toEqual({
      pr: 70,
      sha: SHA_A,
      fusionneeAt: '2026-09-20T08:00:00Z',
    });
  });

  it('REQ-GOV-026 — TÉMOIN : sans le SHA, la clôture d’une tâche locale est REFUSÉE', () => {
    const taches = [tacheLocale()];
    expect(() =>
      cloturerLeLot({
        lotId: 'L0-99',
        rendu: rendu({ pr: 70, sha: null, fusionneeAt: '2026-09-20T08:00:00Z', atterri: true }),
        membres: ['GOV-901'],
        taches,
      })
    ).toThrow(/sans attestation complète/);
    expect(taches[0]!.statut).toBe('a_faire');
  });
});
