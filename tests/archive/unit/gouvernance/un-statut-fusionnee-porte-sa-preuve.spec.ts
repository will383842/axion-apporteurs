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
  resoudreAttestations,
  type CommitDeFusion,
  type ReponseForge,
  type SituationGit,
  type TacheAttestable,
  type VuesHorsLigne,
} from '../../../scripts/lot/attestation';
import { cloturerLeLot, type Tache as TacheDeCloture } from '../../../scripts/lot/cloture';
import { LIVREE } from '../../../scripts/lot/avancement';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const attestation = (pr: number, sha = SHA_A) => ({ pr, sha, fusionneeAt: '2026-09-20T10:00:00Z' });
/**
 * LES VUES HORS LIGNE, INJECTÉES (RM-11) : l'instant de la passe. Aucun témoin ne lit l'horloge :
 * le verdict ne dépend que d'elles.
 */
const MAINTENANT = Date.parse('2026-09-27T12:00:00Z');
const VUES: VuesHorsLigne = { maintenant: MAINTENANT };
const familles = (t: TacheAttestable, livree: boolean, vues: VuesHorsLigne = VUES) =>
  controlerAttestation(t, livree, vues).map((f) => f.famille);
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
      true,
      VUES
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

  /**
   * LE PASSIF NE PEUT QUE DÉCROÎTRE — un CLIQUET, pas une phrase (revue exactitude 5328962131).
   * Le test ci-dessus n'exige que « pas exactement UN commit » : une tâche AJOUTÉE au passif, avec
   * zéro commit ou plusieurs, y passait verte — l'exemption s'allongeait en silence. Le PLAFOND est
   * figé ICI, hors du module qu'il garde : l'élargir demande d'écrire dans ce fichier, sous revue.
   * Une entrée qui SORT du passif ne demande rien (sous-ensemble, pas égalité) ; retire-la aussi
   * du plafond quand tu y passes, il ne sert qu'à borner.
   * Mesuré le 2026-09-27 : les huit entrées de `PASSIF_SANS_ATTESTATION` à la tête de la PR 168.
   */
  const PLAFOND_DU_PASSIF: readonly string[] = [
    'GOV-000',
    'GOV-002',
    'GOV-004',
    'GOV-007',
    'GOV-009',
    'GOV-015',
    'GOV-017b',
    'QA-T00',
  ];
  const horsPlafond = (ids: readonly string[]) =>
    ids.filter((id) => !PLAFOND_DU_PASSIF.includes(id));

  it('REQ-GOV-026 — CLIQUET : le passif déclaré ne dépasse pas son plafond figé', () => {
    const ids = PASSIF_SANS_ATTESTATION.map((p) => p.id);
    expect(horsPlafond(ids), 'entrée(s) AJOUTÉE(S) au passif sans attestation').toEqual([]);
    expect(new Set(ids).size, 'une entrée du passif est écrite deux fois').toBe(ids.length);
  });

  it('REQ-GOV-026 — TÉMOIN : une entrée ajoutée au passif est NOMMÉE par le cliquet', () => {
    const ids = [...PASSIF_SANS_ATTESTATION.map((p) => p.id), 'SEC-03'];
    expect(horsPlafond(ids)).toEqual(['SEC-03']);
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

/**
 * CE QUE LA GARDE HORS LIGNE FERME SANS FORGE (veto sécurité 5328941794, PR 168).
 *
 * Le scénario qui motive GOV-042 (GOV-035) : une tâche passée `fusionnee` À LA MAIN, `owner` et
 * `branch` posés, SANS `pr`, avec une attestation inventée — PR 999, SHA à quarante zéros. Mesuré
 * sur e8369ab : `gov:tasks` la laissait passer, comme une `fusionneeAt` en 2030 et le SHA d'un
 * autre dépôt. Deux fautes se ferment sans interroger personne : l'horloge de la passe borne la
 * date, et le `pr` de la tâche est confronté à l'attestation. Le SHA à zéros, lui, se ferme EN
 * LIGNE (`resoudreAttestations`, plus bas) : un oracle `git cat-file` hors ligne rougissait les
 * attestations justes sur tout clone sans l'historique complet (PR 168, run 36298491294).
 */
describe('REQ-GOV-026 — hors ligne : ce qui se ferme sans forge est fermé', () => {
  const locale = (
    a: { pr: number; sha: string; fusionneeAt: string } | null,
    pr: number | null
  ): TacheAttestable => ({
    id: 'GOV-901',
    repo: 'partners',
    statut: 'fusionnee',
    pr,
    branch: 't/gov-901',
    attestation: a,
  });

  it('REQ-GOV-026 — TÉMOIN : une `fusionneeAt` POSTÉRIEURE à l’instant de la passe est refusée', () => {
    const a = { ...attestation(140), fusionneeAt: '2030-01-01T00:00:00Z' };
    expect(familles(locale(a, 140), true)).toEqual(['attestation_date_future']);
    // la même faute ailleurs : l'horloge ne dépend pas du dépôt
    expect(
      familles(
        { id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: a },
        true
      )
    ).toEqual(['attestation_date_future']);
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : la borne est l’instant INJECTÉ, pas l’horloge du relecteur', () => {
    const a = { ...attestation(140), fusionneeAt: '2026-09-27T11:59:59Z' };
    expect(familles(locale(a, 140), true)).toEqual([]);
    expect(
      familles(locale(a, 140), true, {
        maintenant: Date.parse('2026-09-27T11:59:58Z'),
      })
    ).toEqual(['attestation_date_future']);
  });

  it('REQ-GOV-026 — TÉMOIN : une tâche locale livrée qui porte une attestation SANS `pr` est refusée', () => {
    expect(familles(locale(attestation(140), null), true)).toEqual(['attestation_sans_pr']);
  });

  it('REQ-GOV-026 — LE SCÉNARIO GOV-035 : `fusionnee` à la main, sans `pr`, PR 999 et SHA à zéros', () => {
    // Hors ligne, l'absence de `pr` suffit à le refuser ; le SHA à zéros est rejeté EN LIGNE
    // (« le SHA à zéros d'une tâche LOCALE est rejeté », plus bas).
    const f = familles(
      locale({ pr: 999, sha: '0'.repeat(40), fusionneeAt: '2026-09-26T00:00:00Z' }, null),
      true
    );
    expect(f).toEqual(['attestation_sans_pr']);
  });
});

/**
 * CE QUE LE CONTRÔLE EN LIGNE RÉSOUT — TOUTES les attestations, locales comprises.
 *
 * Mesuré sur e8369ab : `gov-attestation.ts --en-ligne` filtrait `repo !== DEPOT_LOCAL` et rendait
 * « les 1 attestation(s) résolvent » sur un backlog de 78, dont SEC-03 portait un SHA à zéros.
 * La forge et git sont SIMULÉS (RM-11) : le verdict ne dépend que des vues injectées.
 */
describe('REQ-GOV-026 — en ligne : chaque attestation, locale ou non, RÉSOUT', () => {
  const SHA_C = 'c'.repeat(40);
  const QUAND = '2026-09-20T10:00:00Z';
  type Pr = { merged_at: string | null; merge_commit_sha: string | null };
  const vuesEnLigne = (o: {
    prs?: Record<string, Pr>;
    commitsDistants?: Record<string, string>;
    situation?: Record<string, SituationGit>;
    dates?: Record<string, string>;
    forgeMuette?: boolean;
  }) => {
    const appels: string[] = [];
    return {
      appels,
      vues: {
        brancheParDefaut: 'origin/main',
        forge: (chemin: string): ReponseForge => {
          appels.push(chemin);
          if (o.forgeMuette) return { ok: false, erreur: 'HTTP 503' };
          const pr = o.prs?.[chemin];
          if (pr) return { ok: true, corps: pr };
          const c = /\/commits\/([0-9a-f]{40})$/.exec(chemin);
          const date = c ? o.commitsDistants?.[c[1]!] : undefined;
          if (date) return { ok: true, corps: { commit: { committer: { date } } } };
          return { ok: false, erreur: 'HTTP 404' };
        },
        situer: (sha: string): SituationGit => o.situation?.[sha] ?? 'absent',
        dateDuCommit: (sha: string) => o.dates?.[sha] ?? null,
      },
    };
  };
  const LOCAL = 'repos/will383842/axion-apporteurs/pulls/140';
  const locale = (sha = SHA_A, fusionneeAt = QUAND): TacheAttestable => ({
    id: 'SEC-03',
    repo: 'partners',
    statut: 'fusionnee',
    pr: 140,
    branch: 't/sec-03',
    attestation: { pr: 140, sha, fusionneeAt },
  });
  const saine = {
    prs: { [LOCAL]: { merged_at: QUAND, merge_commit_sha: SHA_A } },
    situation: { [SHA_A]: 'ancetre' as const },
    dates: { [SHA_A]: QUAND },
  };

  it('REQ-GOV-026 — CONTRE-TÉMOIN : une attestation LOCALE saine est dans la population et résout', () => {
    const { vues, appels } = vuesEnLigne(saine);
    const r = resoudreAttestations([locale()], vues, estLivree);
    expect(r.population).toBe(1);
    expect(r.fautes).toEqual([]);
    expect(r.resolues).toHaveLength(1);
    expect(appels).toContain(LOCAL);
  });

  it('REQ-GOV-026 — TÉMOIN : le SHA à zéros d’une tâche LOCALE est rejeté (le cas du veto)', () => {
    const { vues } = vuesEnLigne(saine);
    const r = resoudreAttestations([locale('0'.repeat(40))], vues, estLivree);
    expect(r.fautes.join('\n')).toMatch(/SEC-03.*n'est pas un commit de ce dépôt/);
  });

  it('REQ-GOV-026 — TÉMOIN : un commit d’ici qui n’est PAS ancêtre de la branche par défaut est rejeté', () => {
    const { vues } = vuesEnLigne({ ...saine, situation: { [SHA_A]: 'hors_branche' } });
    expect(resoudreAttestations([locale()], vues, estLivree).fautes.join('\n')).toMatch(
      /SEC-03.*n'est pas ancêtre de origin\/main/
    );
  });

  it('REQ-GOV-026 — TÉMOIN : la PR fusionnée par un AUTRE commit que le SHA attesté est rejetée', () => {
    const { vues } = vuesEnLigne({
      ...saine,
      prs: { [LOCAL]: { merged_at: QUAND, merge_commit_sha: SHA_C } },
    });
    expect(resoudreAttestations([locale()], vues, estLivree).fautes.join('\n')).toMatch(
      /SEC-03.*a fusionné par c{40}/
    );
  });

  it('REQ-GOV-026 — TÉMOIN : une PR NON fusionnée est rejetée', () => {
    const { vues } = vuesEnLigne({
      ...saine,
      prs: { [LOCAL]: { merged_at: null, merge_commit_sha: SHA_A } },
    });
    expect(resoudreAttestations([locale()], vues, estLivree).fautes.join('\n')).toMatch(
      /SEC-03.*n'est PAS fusionnée/
    );
  });

  it('REQ-GOV-026 — TÉMOIN : une `fusionneeAt` qui n’est ni la fusion ni le commit est rejetée', () => {
    const { vues } = vuesEnLigne(saine);
    expect(
      resoudreAttestations([locale(SHA_A, '2026-09-19T10:00:00Z')], vues, estLivree).fautes.join(
        '\n'
      )
    ).toMatch(/SEC-03.*2026-09-19T10:00:00Z/);
    // la date du COMMIT est admise aussi
    const { vues: v2 } = vuesEnLigne({ ...saine, dates: { [SHA_A]: '2026-09-20T10:00:01Z' } });
    expect(
      resoudreAttestations([locale(SHA_A, '2026-09-20T10:00:01Z')], v2, estLivree).fautes
    ).toEqual([]);
  });

  it('REQ-GOV-026 — TÉMOIN : une forge ILLISIBLE échoue FERMÉ, elle ne rend jamais un vert', () => {
    const { vues } = vuesEnLigne({ ...saine, forgeMuette: true });
    const r = resoudreAttestations([locale()], vues, estLivree);
    expect(r.fautes.length).toBe(1);
    expect(r.resolues).toEqual([]);
  });

  it('REQ-GOV-026 — une attestation d’AILLEURS reste résolue par la forge de SON dépôt', () => {
    const distante: TacheAttestable = {
      id: 'INT-T01b',
      repo: 'axionia',
      statut: 'fusionnee',
      pr: null,
      attestation: { pr: 998, sha: SHA_B, fusionneeAt: QUAND },
    };
    const { vues } = vuesEnLigne({
      prs: {
        'repos/will383842/axion-ia/pulls/998': { merged_at: QUAND, merge_commit_sha: SHA_B },
      },
      commitsDistants: { [SHA_B]: QUAND },
    });
    const r = resoudreAttestations([distante], vues, estLivree);
    expect(r.fautes).toEqual([]);
    expect(r.population).toBe(1);
  });

  it('REQ-GOV-026 — ce que le contrôle SAUTE est NOMMÉ : le passif déclaré sans attestation', () => {
    const p = PASSIF_SANS_ATTESTATION[0]!;
    const { vues } = vuesEnLigne(saine);
    const r = resoudreAttestations(
      [
        locale(),
        {
          id: p.id,
          repo: 'partners',
          statut: 'fusionnee',
          pr: null,
          branch: 'b',
          attestation: null,
        },
      ],
      vues,
      estLivree
    );
    expect(r.population).toBe(1);
    expect(r.sautees.map((s) => s.id)).toEqual([p.id]);
  });
});
