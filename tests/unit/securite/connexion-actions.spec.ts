// @req REQ-SEC-001
/**
 * `connexion-actions.spec.ts` — les deux actions serveur de la connexion (SEC-03), avec Next
 * simulé à ses frontières (`after`, `headers`, `redirect`) et le noyau remplacé par un espion.
 *
 * CE QU'IL PROUVE.
 *   1. Le travail différé de la demande part dans `after()` et ne s'exécute PAS avant la réponse :
 *      au moment où l'action redirige, le travail n'a pas tourné ; il ne tourne que quand `after`
 *      le lance. Une action qui l'exécuterait tout de suite fait rougir ce témoin.
 *   2. Après la consommation, la redirection mène à une URL SANS le jeton : `/connexion?issue=`.
 *
 * L'environnement de test est DÉRIVÉ de `NOMS_DES_SECRETS`, jamais recopié.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const apres: Array<() => Promise<void>> = [];
const redirections: string[] = [];

vi.mock('next/server', () => ({ after: (travail: () => Promise<void>) => apres.push(travail) }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirections.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const travailFait = { valeur: false };
vi.mock('../../../src/server/auth/lien-magique', async (original) => ({
  ...(await original<typeof import('../../../src/server/auth/lien-magique')>()),
  demanderLien: async (_requete: unknown, ports: { planifier(t: () => Promise<void>): void }) => {
    ports.planifier(async () => {
      travailFait.valeur = true;
    });
    return 'envoye';
  },
  consommerLien: async () => ({ etat: 'ouverte', jetonSession: 'x' }),
}));

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');

beforeEach(() => {
  apres.length = 0;
  redirections.length = 0;
  travailFait.valeur = false;
  for (const n of NOMS_DES_SECRETS) {
    vi.stubEnv(n, `temoin-sec03-actions-${n.toLowerCase()}-`.padEnd(48, '0'));
  }
  vi.stubEnv('PII_ENCRYPTION_KEY', CLE_HEX);
  vi.stubEnv('NOTIFY_SINK', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('REQ-SEC-001 — les actions serveur de la connexion', () => {
  it('REQ-SEC-001 : le travail différé ne s’exécute pas avant la réponse, il part dans after()', async () => {
    const { demanderUnLienDeConnexion } =
      await import('../../../src/app/(espace)/connexion/actions');
    const formulaire = new FormData();
    formulaire.set('courriel', 'marie@example.org');
    await expect(demanderUnLienDeConnexion(formulaire)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirections).toEqual(['/connexion?etat=envoye']);
    // Au moment de la réponse : planifié, pas exécuté.
    expect(apres).toHaveLength(1);
    expect(travailFait.valeur).toBe(false);
    await apres[0]?.();
    expect(travailFait.valeur).toBe(true);
  });

  it('REQ-SEC-001 : après la consommation, l’URL de destination ne porte plus le jeton', async () => {
    const { consommerUnLienDeConnexion } =
      await import('../../../src/app/(espace)/connexion/actions');
    const jeton = 'J'.repeat(43);
    await expect(consommerUnLienDeConnexion(jeton)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirections).toEqual(['/connexion?issue=ouverte']);
    expect(redirections.join()).not.toContain(jeton);
  });
});
