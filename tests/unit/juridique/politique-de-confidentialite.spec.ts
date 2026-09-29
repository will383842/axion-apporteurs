// @req REQ-JUR-025
/**
 * `politique-de-confidentialite.spec.ts` — la politique de confidentialité de l'espace (JUR-T34),
 * DÉRIVÉE du registre de l'article 30 et acceptée à la première connexion.
 *
 * CE QU'IL PROUVE.
 *   1. TÉMOIN À DEUX FACES. Une durée changée dans le registre change la page rendue (et sa
 *      version) sans toucher la page ; une page qui retape une durée ou un prestataire fait rougir
 *      `valeursRetapees` en nommant la valeur — et le source réel de la route ne retape rien.
 *   2. Une rubrique « À compléter » du registre s'affiche telle quelle, avec sa question.
 *   3. La page ne dit rien des conseillers ; un registre qui les ferait entrer dans l'extrait est
 *      refusé en le nommant.
 *   4. La version est stable, bornée à la colonne du schéma, et suit le contenu.
 *   5. L'accord : sans session, pas de formulaire ; non acceptée, formulaire ; acceptée à la version
 *      courante, plus de formulaire ; version changée, à accepter de nouveau ; une version affichée
 *      périmée n'écrit rien. La première connexion mène à la politique tant qu'elle reste à accepter.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  LONGUEUR_DE_VERSION,
  MARQUE_A_COMPLETER,
  extrairePolitique,
  valeursRetapees,
  type Politique,
} from '../../../src/domain/rgpd/politique';
import {
  ROUTE_CONFIDENTIALITE,
  ROUTE_ISSUE_OUVERTE,
  accepterLaPolitique,
  destinationDeLOuverture,
  etatDAcceptation,
  lireLaPolitique,
  type AcceptationLue,
  type DepotDAcceptation,
  type EtatDAcceptation,
  type PortsDAcceptation,
} from '../../../src/server/rgpd/acceptation';
import type { LigneDeSession } from '../../../src/server/auth/session';
import {
  EcranConfidentialite,
  EcranErreurConfidentialite,
} from '../../../src/app/(espace)/confidentialite/ecran';
import { CONFIDENTIALITE } from '../../../src/content/micro-copy/espace/vocabulaire';
import { ETATS_VIDES_ESPACE } from '../../../src/content/micro-copy/espace/etats-vides';

const RACINE = process.cwd();
const REGISTRE = readFileSync(join(RACINE, 'docs/rgpd/registre-article-30.md'), 'utf8');
const DOSSIER_DE_LA_ROUTE = 'src/app/(espace)/confidentialite';

function politiqueDe(registre: string): Politique {
  const lue = extrairePolitique(registre);
  if (!lue.ok) throw new Error(`registre refusé : ${lue.refus}`);
  return lue.politique;
}

function refusDe(registre: string): string {
  const lue = extrairePolitique(registre);
  if (lue.ok) throw new Error('le registre aurait dû être refusé');
  return lue.refus;
}

const rendre = (politique: Politique, etat: EtatDAcceptation = 'sans_session'): string =>
  renderToStaticMarkup(createElement(EcranConfidentialite, { politique, etat, action: () => {} }));

/** Le contenu d'une rubrique de TRT-APPORTEURS (première occurrence : TRT-APPORTEURS est en tête). */
function rubrique(registre: string, nom: string): string {
  const ligne = registre.split('\n').find((l) => l.startsWith(`| ${nom} |`));
  if (ligne === undefined) throw new Error(`rubrique ${nom} introuvable dans le registre`);
  return ligne.split('|')[2]!.trim();
}

// ── la dérivation ────────────────────────────────────────────────────────────────────────────────

describe('REQ-JUR-025 — la politique se dérive du registre de l’article 30', () => {
  it('REQ-JUR-025 — les six rubriques de TRT-APPORTEURS sont extraites, et la durée nommée par la source des seuils est résolue', () => {
    const p = politiqueDe(REGISTRE);
    expect(p.rubriques.map((r) => r.cle)).toEqual([
      'finalite',
      'baseLegale',
      'duree',
      'destinataires',
      'transferts',
      'droits',
    ]);
    const duree = p.rubriques.find((r) => r.cle === 'duree')!;
    const seuil = SEUILS.CONSERVATION_PIECES_ANS;
    expect(JSON.stringify(duree.contenu)).toContain(`${seuil.valeur} ans`);
    expect(JSON.stringify(p)).not.toContain('CONSERVATION_PIECES_ANS');
  });

  it('REQ-JUR-025 — les destinataires sont les tiers de la section 4 qui citent TRT-APPORTEURS, et eux seuls', () => {
    const noms = politiqueDe(REGISTRE).destinataires.map((d) => d.nom);
    expect(noms).toContain('Service de push web');
    expect(noms).toContain('Relais de courriel');
    expect(noms).toContain('Sentry');
    // « TRT-APPORTEURS dans une version ultérieure » n'est pas une citation ; « aucun des trois » non plus.
    expect(noms).not.toContain('Telegram');
    expect(noms).not.toContain('GitHub');
    expect(noms).not.toContain("API de recherche d'entreprises");
  });

  it('REQ-JUR-025 — un registre tronqué après la section 4 se lit encore', () => {
    const tronque = REGISTRE.slice(0, REGISTRE.indexOf('## 5.'));
    expect(politiqueDe(tronque).destinataires).toEqual(politiqueDe(REGISTRE).destinataires);
  });

  it('REQ-JUR-025 — lue depuis le disque, la politique est celle du registre ; un registre absent est un refus nommé', () => {
    expect(lireLaPolitique()).toEqual(extrairePolitique(REGISTRE));
    expect(lireLaPolitique(join(RACINE, 'dossier-inexistant'))).toEqual({
      ok: false,
      refus: 'registre introuvable : docs/rgpd/registre-article-30.md',
    });
  });

  it('REQ-JUR-025 — un registre illisible est refusé en nommant ce qui manque', () => {
    expect(refusDe(REGISTRE.replace('| Base légale |', '| Fondement |'))).toBe(
      'rubrique absente de TRT-APPORTEURS : Base légale'
    );
    expect(refusDe(REGISTRE.replace('### TRT-APPORTEURS', '### TRT-AUTRE'))).toBe(
      'section absente du registre : TRT-APPORTEURS'
    );
    expect(refusDe(REGISTRE.replace('## 4.', '## Quatre.'))).toBe(
      'section absente du registre : section 4'
    );
    expect(refusDe(REGISTRE.replace('| Tiers | Fiche |', '| Nom | Fiche |'))).toBe(
      'colonne absente de la section 4 : Tiers'
    );
    const finalite = rubrique(REGISTRE, 'Finalité');
    expect(refusDe(REGISTRE.replace(finalite, `${finalite} pendant \`DUREE_INVENTEE\``))).toBe(
      'référence non résolue : DUREE_INVENTEE'
    );
  });
});

// ── le témoin à deux faces ───────────────────────────────────────────────────────────────────────

describe('REQ-JUR-025 — témoin à deux faces : la page lit le registre, elle ne l’écrit pas', () => {
  it('REQ-JUR-025 — face 1 : une durée changée dans le registre change la page rendue, sans toucher la page', () => {
    const avant = 'purgée dès validation';
    const apres = 'purgée quatre-vingt-dix jours après validation';
    expect(rubrique(REGISTRE, 'Durée de conservation')).toContain(avant);
    const change = REGISTRE.replace(avant, apres);
    const pageAvant = rendre(politiqueDe(REGISTRE));
    const pageApres = rendre(politiqueDe(change));
    expect(pageAvant).toContain(avant);
    expect(pageAvant).not.toContain(apres);
    expect(pageApres).toContain(apres);
    expect(pageApres).not.toContain(avant);
    expect(politiqueDe(change).version).not.toBe(politiqueDe(REGISTRE).version);
  });

  it('REQ-JUR-025 — face 2 : une page qui retape une durée ou un prestataire rougit en nommant la valeur', () => {
    const pageFautive = `
      export default function Page() {
        return <p>Vos pièces sont conservées 7 ans et vos courriels partent par Mailchimp.</p>;
      }`;
    expect(valeursRetapees(pageFautive, REGISTRE)).toEqual([
      'durée retapée dans la page : « 7 ans » (absente du registre)',
      'prestataire retapé dans la page : « Mailchimp » (absente du registre)',
    ]);
    const pageQuiRecopie =
      '<p>Les liens sont gardés 12 mois ; les alertes passent par Telegram.</p>';
    expect(valeursRetapees(pageQuiRecopie, REGISTRE, [])).toEqual([
      'durée retapée dans la page : « 12 mois » (recopiée du registre)',
      'prestataire retapé dans la page : « Telegram » (recopiée du registre)',
    ]);
  });

  it('REQ-JUR-025 — face 2 : sans section 4 lisible, le catalogue des services courants rougit encore', () => {
    expect(valeursRetapees('Telegram, Stripe', '')).toEqual([
      'prestataire retapé dans la page : « Stripe » (absente du registre)',
    ]);
    expect(
      valeursRetapees('Telegram', REGISTRE.replace('| Tiers | Fiche |', '| Nom | Fiche |'))
    ).toEqual([]);
  });

  it('REQ-JUR-025 — le source réel de la route ne retape aucune durée ni aucun prestataire', () => {
    const fichiers = readdirSync(join(RACINE, DOSSIER_DE_LA_ROUTE));
    expect(fichiers).toContain('page.tsx');
    expect(fichiers).toContain('layout.tsx');
    for (const f of fichiers) {
      const source = readFileSync(join(RACINE, DOSSIER_DE_LA_ROUTE, f), 'utf8');
      expect(valeursRetapees(source, REGISTRE), f).toEqual([]);
    }
  });
});

// ── « À compléter », les conseillers, la version ─────────────────────────────────────────────────

describe('REQ-JUR-025 — ce que le registre ne tranche pas s’affiche comme tel', () => {
  it('REQ-JUR-025 — la base légale « À compléter » est rendue « À compléter », avec sa question, sans valeur inventée', () => {
    const p = politiqueDe(REGISTRE);
    const base = p.rubriques.find((r) => r.cle === 'baseLegale')!;
    expect(base.contenu).toHaveLength(1);
    expect(base.contenu[0]!.type).toBe('a_completer');
    const cellule = rubrique(REGISTRE, 'Base légale');
    const question = cellule.replace(MARQUE_A_COMPLETER, '').replace(/^\s*Question\s*:\s*/, '');
    expect(base.contenu[0]).toEqual({ type: 'a_completer', question });
    const html = rendre(p);
    expect(html).toContain(CONFIDENTIALITE.aCompleter);
    expect(html).toContain(CONFIDENTIALITE.question);
    // Une durée « à compléter » garde son texte ET son manque, dans l'ordre du registre.
    const duree = p.rubriques.find((r) => r.cle === 'duree')!;
    expect(duree.contenu.map((s) => s.type)).toEqual(['texte', 'a_completer']);
  });

  it('REQ-JUR-025 — la page ne dit rien des conseillers ; un extrait qui les nommerait est refusé', () => {
    expect(rendre(politiqueDe(REGISTRE), 'a_accepter')).not.toMatch(/conseill/i);
    const finalite = rubrique(REGISTRE, 'Finalité');
    expect(
      refusDe(REGISTRE.replace(finalite, `${finalite} ; contrôle des conseillers salariés`))
    ).toBe('l’extrait mentionne les conseillers : leur information passe par un autre canal');
  });

  it('REQ-JUR-025 — la version est stable, hexadécimale et bornée à la colonne du schéma', () => {
    const v = politiqueDe(REGISTRE).version;
    expect(politiqueDe(REGISTRE).version).toBe(v);
    expect(v).toMatch(new RegExp(`^[0-9a-f]{${LONGUEUR_DE_VERSION}}$`));
    expect(LONGUEUR_DE_VERSION).toBeLessThanOrEqual(32);
  });

  it('REQ-JUR-025 — sans destinataire nommé, l’état vide de la route s’affiche ; l’erreur a son écran', () => {
    const vide = ETATS_VIDES_ESPACE['/confidentialite']!;
    const html = rendre({ ...politiqueDe(REGISTRE), destinataires: [] });
    expect(html).toContain(vide.titre);
    expect(html).toContain(vide.phrase);
    const erreur = renderToStaticMarkup(createElement(EcranErreurConfidentialite));
    expect(erreur).toContain(CONFIDENTIALITE.erreur.phrase);
  });
});

// ── l'accord ─────────────────────────────────────────────────────────────────────────────────────

/** Un dépôt EN MÉMOIRE qui relit son état à chaque appel. */
function depotEnMemoire(initial: Record<string, AcceptationLue> = {}) {
  const lignes = new Map(Object.entries(initial));
  const ecritures: Array<{ apporteurId: string; version: string }> = [];
  const depot: DepotDAcceptation = {
    lire: async (id) => lignes.get(id) ?? null,
    ecrire: async (id, accepteeAt, version) => {
      ecritures.push({ apporteurId: id, version });
      lignes.set(id, { accepteeAt, version });
    },
  };
  return { depot, ecritures };
}

const MAINTENANT = new Date('2026-09-29T08:00:00.000Z');

describe('REQ-JUR-025 — l’accord de l’apporteur', () => {
  const p = politiqueDe(REGISTRE);

  it('REQ-JUR-025 — sans session, la politique se lit sans formulaire', async () => {
    const { depot } = depotEnMemoire();
    const etat = await etatDAcceptation(null, p.version, depot);
    expect(etat).toBe('sans_session');
    expect(rendre(p, etat)).not.toContain('<form');
  });

  it('REQ-JUR-025 — non acceptée : formulaire ; acceptée à la version courante : plus de formulaire', async () => {
    const { depot, ecritures } = depotEnMemoire({ a1: { accepteeAt: null, version: null } });
    const avant = await etatDAcceptation('a1', p.version, depot);
    expect(avant).toBe('a_accepter');
    const formulaire = rendre(p, avant);
    expect(formulaire).toContain('<form');
    expect(formulaire).toContain(`value="${p.version}"`);
    expect(formulaire).toContain(CONFIDENTIALITE.accord.action);

    const issue = await accepterLaPolitique(
      {
        apporteurId: 'a1',
        versionVue: p.version,
        versionCourante: p.version,
        maintenant: MAINTENANT,
      },
      depot
    );
    expect(issue).toBe('acceptee');
    expect(ecritures).toEqual([{ apporteurId: 'a1', version: p.version }]);
    const apres = await etatDAcceptation('a1', p.version, depot);
    expect(apres).toBe('acceptee');
    const html = rendre(p, apres);
    expect(html).not.toContain('<form');
    expect(html).toContain(CONFIDENTIALITE.acceptee);
  });

  it('REQ-JUR-025 — une version changée au registre est à accepter de nouveau', async () => {
    const { depot } = depotEnMemoire({ a1: { accepteeAt: MAINTENANT, version: p.version } });
    const nouvelle = politiqueDe(
      REGISTRE.replace('purgée dès validation', 'purgée à la validation')
    );
    expect(await etatDAcceptation('a1', p.version, depot)).toBe('acceptee');
    expect(await etatDAcceptation('a1', nouvelle.version, depot)).toBe('a_accepter');
    // Un apporteur introuvable n'a rien accepté.
    expect(await etatDAcceptation('inconnu', p.version, depot)).toBe('a_accepter');
  });

  it('REQ-JUR-025 — une version affichée périmée, ou absente, n’écrit rien', async () => {
    const { depot, ecritures } = depotEnMemoire();
    for (const versionVue of ['0'.repeat(LONGUEUR_DE_VERSION), null]) {
      const issue = await accepterLaPolitique(
        { apporteurId: 'a1', versionVue, versionCourante: p.version, maintenant: MAINTENANT },
        depot
      );
      expect(issue).toBe('version_perimee');
    }
    expect(ecritures).toEqual([]);
  });
});

// ── la première connexion ────────────────────────────────────────────────────────────────────────

function portsAvecSession(depot: DepotDAcceptation): PortsDAcceptation {
  const ligne: LigneDeSession = {
    id: 's1',
    apporteurId: 'a1',
    kid: 'kid-temoin',
    expireAt: new Date(MAINTENANT.getTime() + 60_000),
    revoqueAt: null,
    sessionVersion: 1,
    apporteur: { statut: 'signe', sessionVersion: 1 },
    lienMagique: { consommeAt: MAINTENANT },
  };
  return {
    session: {
      maintenant: () => MAINTENANT,
      configuration: { secret: 'secret-temoin', kid: 'kid-temoin' },
      depot: {
        lire: async () => ligne,
        marquerVue: async () => undefined,
        lister: async () => [],
        revoquer: async () => 0,
        incrementerVersion: async () => undefined,
      },
    },
    depot,
  };
}

describe('REQ-JUR-025 — la première connexion mène à la politique', () => {
  const p = politiqueDe(REGISTRE);
  const lecture = () => extrairePolitique(REGISTRE);

  it('REQ-JUR-025 — non acceptée : la connexion mène à /confidentialite ; acceptée : à l’issue habituelle', async () => {
    const motifs: string[] = [];
    const neuf = depotEnMemoire({ a1: { accepteeAt: null, version: null } }).depot;
    expect(
      await destinationDeLOuverture(
        'jeton',
        lecture,
        () => portsAvecSession(neuf),
        (m) => motifs.push(m)
      )
    ).toBe(ROUTE_CONFIDENTIALITE);
    const deja = depotEnMemoire({ a1: { accepteeAt: MAINTENANT, version: p.version } }).depot;
    expect(
      await destinationDeLOuverture(
        'jeton',
        lecture,
        () => portsAvecSession(deja),
        (m) => motifs.push(m)
      )
    ).toBe(ROUTE_ISSUE_OUVERTE);
    expect(motifs).toEqual([]);
  });

  it('REQ-JUR-025 — un registre ou une base illisibles ne bloquent pas la connexion, et le motif est signalé', async () => {
    const motifs: string[] = [];
    const neuf = depotEnMemoire().depot;
    expect(
      await destinationDeLOuverture(
        'jeton',
        () => ({ ok: false, refus: 'illisible' }),
        () => portsAvecSession(neuf),
        (m) => motifs.push(m)
      )
    ).toBe(ROUTE_ISSUE_OUVERTE);
    expect(
      await destinationDeLOuverture(
        'jeton',
        lecture,
        () => {
          throw new Error('base injoignable');
        },
        (m) => motifs.push(m)
      )
    ).toBe(ROUTE_ISSUE_OUVERTE);
    expect(motifs).toEqual([
      'confidentialite_registre_illisible',
      'confidentialite_etat_illisible',
    ]);
  });
});
