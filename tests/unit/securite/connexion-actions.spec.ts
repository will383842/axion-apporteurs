// @req REQ-SEC-001
/**
 * `connexion-actions.spec.ts` — les deux actions serveur de la connexion et la page d'arrivée
 * (SEC-03), avec Next simulé à ses frontières (`after`, `headers`, `redirect`) et le noyau remplacé
 * par un espion qui ENREGISTRE ce que l'action lui passe.
 *
 * CE QU'IL PROUVE.
 *   1. Le travail différé de la demande part dans `after()` et ne s'exécute PAS avant la réponse.
 *   2. Le champ piège est ÉVALUÉ : rempli, la requête le porte ; vide, non.
 *   3. La consommation reçoit l'empreinte réseau de la requête, jamais `null` ni l'adresse.
 *   4. Après la consommation, la redirection mène à une URL SANS le jeton : `/connexion?issue=`.
 *   5. Ni le jeton ni le courriel n'atteignent les journaux (sorties standard et d'erreur).
 *   6. La page d'arrivée ne consomme RIEN à l'affichage : seul l'envoi du formulaire consomme.
 *
 * L'environnement de test est DÉRIVÉ de `NOMS_DES_SECRETS`, jamais recopié.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, empreinteAdresseReseau } from '../../../src/server/securite/pii';

const espions = vi.hoisted(() => ({
  apres: [] as Array<() => Promise<void>>,
  redirections: [] as string[],
  travailFait: false,
  requetes: [] as Array<{ saisie: string; piege: boolean }>,
  consommations: [] as Array<{ jeton: string; ipHash: string | null }>,
}));

vi.mock('next/server', () => ({
  after: (travail: () => Promise<void>) => espions.apres.push(travail),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    espions.redirections.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('../../../src/server/auth/lien-magique', async (original) => ({
  ...(await original<typeof import('../../../src/server/auth/lien-magique')>()),
  demanderLien: async (
    requete: { saisie: string; piege: boolean },
    ports: { planifier(t: () => Promise<void>): void }
  ) => {
    espions.requetes.push({ saisie: requete.saisie, piege: requete.piege });
    ports.planifier(async () => {
      espions.travailFait = true;
    });
    return 'envoye';
  },
  consommerLien: async (entree: { jeton: string; ipHash: string | null }) => {
    espions.consommations.push(entree);
    return { etat: 'ouverte', jetonSession: 'x' };
  },
}));

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const valeur = (n: string) => `temoin-sec03-actions-${n.toLowerCase()}-`.padEnd(48, '0');
const JETON = 'J'.repeat(43);
let sorties: string[] = [];

beforeEach(() => {
  espions.apres.length = 0;
  espions.redirections.length = 0;
  espions.requetes.length = 0;
  espions.consommations.length = 0;
  espions.travailFait = false;
  for (const n of NOMS_DES_SECRETS) vi.stubEnv(n, valeur(n));
  vi.stubEnv('PII_ENCRYPTION_KEY', CLE_HEX);
  vi.stubEnv('NOTIFY_SINK', 'true');
  sorties = [];
  for (const flux of [process.stdout, process.stderr]) {
    vi.spyOn(flux, 'write').mockImplementation((x: string | Uint8Array) => {
      sorties.push(String(x));
      return true;
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const actions = () => import('../../../src/app/(espace)/connexion/actions');

function formulaire(courriel: string, site: string | null): FormData {
  const f = new FormData();
  f.set('courriel', courriel);
  if (site !== null) f.set('site', site);
  return f;
}

describe('REQ-SEC-001 — la demande de lien, action serveur', () => {
  it('REQ-SEC-001 : le travail différé ne s’exécute pas avant la réponse, il part dans after()', async () => {
    const { demanderUnLienDeConnexion } = await actions();
    await expect(demanderUnLienDeConnexion(formulaire('marie@example.org', null))).rejects.toThrow(
      'NEXT_REDIRECT'
    );
    expect(espions.redirections).toEqual(['/connexion?etat=envoye']);
    expect(espions.apres).toHaveLength(1);
    expect(espions.travailFait).toBe(false);
    await espions.apres[0]?.();
    expect(espions.travailFait).toBe(true);
  });

  it('REQ-SEC-001 : le champ piège est évalué — rempli, la requête le porte ; vide ou absent, non', async () => {
    const { demanderUnLienDeConnexion } = await actions();
    for (const site of ['https://robot.example', '', null]) {
      await expect(
        demanderUnLienDeConnexion(formulaire('marie@example.org', site))
      ).rejects.toThrow('NEXT_REDIRECT');
    }
    expect(espions.requetes.map((r) => r.piege)).toEqual([true, false, false]);
    expect(espions.requetes.every((r) => r.saisie === 'marie@example.org')).toBe(true);
  });
});

describe('REQ-SEC-001 — la consommation, action serveur', () => {
  it('REQ-SEC-001 : la consommation reçoit l’empreinte réseau de la requête, et l’URL ne porte plus le jeton', async () => {
    const { consommerUnLienDeConnexion } = await actions();
    await expect(consommerUnLienDeConnexion(JETON)).rejects.toThrow('NEXT_REDIRECT');
    const env = Object.fromEntries(NOMS_DES_SECRETS.map((n) => [n, valeur(n)]));
    expect(espions.consommations).toEqual([
      {
        jeton: JETON,
        ipHash: empreinteAdresseReseau(
          '203.0.113.7',
          clesPii({ ...env, PII_ENCRYPTION_KEY: CLE_HEX })
        ),
      },
    ]);
    expect(espions.redirections).toEqual(['/connexion?issue=ouverte']);
    expect(espions.redirections.join()).not.toContain(JETON);
  });

  it('REQ-SEC-001 : ni le jeton ni le courriel n’atteignent les journaux', async () => {
    const { consommerUnLienDeConnexion, demanderUnLienDeConnexion } = await actions();
    await expect(consommerUnLienDeConnexion(JETON)).rejects.toThrow('NEXT_REDIRECT');
    await expect(demanderUnLienDeConnexion(formulaire('marie@example.org', null))).rejects.toThrow(
      'NEXT_REDIRECT'
    );
    for (const t of espions.apres) await t();
    const tout = sorties.join('');
    expect(tout).not.toContain(JETON);
    expect(tout).not.toContain('marie');
  });
});

describe('REQ-SEC-001 — la page d’arrivée ne consomme rien à l’affichage', () => {
  it('REQ-SEC-001 : afficher la page ne consomme pas ; seul l’envoi du formulaire consomme, une fois', async () => {
    const { default: PageArrivee } =
      await import('../../../src/app/(espace)/connexion/[jeton]/page');
    const element = await PageArrivee({ params: Promise.resolve({ jeton: JETON }) });
    const h = renderToStaticMarkup(element);
    expect(h).toContain('<form');
    expect(h).not.toContain(JETON);
    expect(espions.consommations).toHaveLength(0);
    // L'envoi du formulaire : l'action liée au jeton.
    const action = (element.props as { action: () => Promise<void> }).action;
    await expect(action()).rejects.toThrow('NEXT_REDIRECT');
    expect(espions.consommations.map((c) => c.jeton)).toEqual([JETON]);
  });
});
