// @req REQ-JUR-025
/**
 * `politique-de-confidentialite.spec.ts` — la politique de confidentialité de l'espace (JUR-T34),
 * DÉRIVÉE du registre de l'article 30 et acceptée à la première connexion.
 *
 * CE QU'IL PROUVE.
 *   1. TÉMOIN À DEUX FACES. Une durée changée dans le registre change la page rendue (et sa
 *      version) sans toucher la page ; une page qui retape une durée ou un prestataire fait rougir
 *      `valeursRetapees` en nommant la valeur — et le source réel de la route ne retape rien.
 *   2. Une rubrique « À compléter » du registre s'affiche en cours de rédaction, SANS sa question :
 *      la question est une note interne, posée à l'arbitre (JUR-T36).
 *   3. La page ne dit rien des conseillers ; un registre qui les ferait entrer dans l'extrait est
 *      refusé en le nommant.
 *   4. La version est stable, bornée à la colonne du schéma, et suit le contenu.
 *   5. L'accord : sans session, pas de formulaire ; non acceptée, formulaire ; acceptée à la version
 *      courante, plus de formulaire ; version changée, à accepter de nouveau ; une version affichée
 *      périmée n'écrit rien. La première connexion mène à la politique tant qu'elle reste à accepter.
 *   6. Pièce à pièce, sur un registre témoin : chaque cas du lecteur (bornes des sections, lignes
 *      de tableau, séparation, question), chaque constante de module (réévaluée dans son test),
 *      le catalogue des services courants élément par élément, l'adaptateur Prisma et le câblage.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  LONGUEUR_DE_VERSION,
  MARQUE_A_COMPLETER,
  estPubliable,
  extrairePolitique,
  segmentsEnCours,
  valeursRetapees,
  type Politique,
} from '../../../src/domain/rgpd/politique';
import {
  ROUTE_CONFIDENTIALITE,
  ROUTE_INDISPONIBLE,
  ROUTE_ISSUE_OUVERTE,
  accepterLaPolitique,
  depotDAcceptation,
  destinationDeLOuverture,
  etatDAcceptation,
  lireLaPolitique,
  portsDuProcessus,
  type AcceptationLue,
  type DepotDAcceptation,
  type EtatDAcceptation,
  type PortsDAcceptation,
} from '../../../src/server/rgpd/acceptation';
import type { LigneDeSession } from '../../../src/server/auth/session';
import { configurationDuLien } from '../../../src/server/auth/lien-magique-production';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import {
  EcranConfidentialite,
  EcranErreurConfidentialite,
} from '../../../src/app/(espace)/confidentialite/ecran';
import { CONFIDENTIALITE } from '../../../src/content/micro-copy/espace/vocabulaire';
import { ETATS_VIDES_ESPACE } from '../../../src/content/micro-copy/espace/etats-vides';

const RACINE = process.cwd();
const REGISTRE = readFileSync(join(RACINE, 'docs/rgpd/registre-article-30.md'), 'utf8');
const DOSSIER_DE_LA_ROUTE = 'src/app/(espace)/confidentialite';
/**
 * JUR-T57 : le registre réel porte encore des rubriques à compléter ; la politique qu'il rend n'est
 * pas PUBLIABLE. Les témoins de l'accord jouent sur ce registre, chaque manque tranché.
 */
const REGISTRE_PUBLIABLE = REGISTRE.replace(
  /À compléter — source manquante.[^|]*/g,
  'Tranché au registre. '
);

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
  it('REQ-JUR-025 — la base légale « À compléter » est rendue en cours de rédaction, SANS sa question, sans valeur inventée', () => {
    const p = politiqueDe(REGISTRE);
    const base = p.rubriques.find((r) => r.cle === 'baseLegale')!;
    expect(base.contenu).toHaveLength(1);
    expect(base.contenu[0]!.type).toBe('a_completer');
    const cellule = rubrique(REGISTRE, 'Base légale');
    const question = cellule.replace(MARQUE_A_COMPLETER, '').replace(/^\s*Question\s*:\s*/, '');
    expect(question.length).toBeGreaterThan(0);
    // JUR-T36 : la question est une note interne, posée à l'arbitre ; elle ne sort pas du domaine.
    expect(base.contenu[0]).toEqual({ type: 'a_completer' });
    const html = rendre(p);
    expect(html).toContain(CONFIDENTIALITE.aCompleter);
    expect(html).not.toContain(question);
    expect(html).not.toMatch(/Question/);
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
  const p = politiqueDe(REGISTRE_PUBLIABLE);

  it('REQ-JUR-025 — sans session, la politique se lit sans formulaire', async () => {
    const { depot } = depotEnMemoire();
    const etat = await etatDAcceptation(null, p, depot);
    expect(etat).toBe('sans_session');
    expect(rendre(p, etat)).not.toContain('<form');
  });

  it('REQ-JUR-025 — non acceptée : formulaire ; acceptée à la version courante : plus de formulaire', async () => {
    const { depot, ecritures } = depotEnMemoire({ a1: { accepteeAt: null, version: null } });
    const avant = await etatDAcceptation('a1', p, depot);
    expect(avant).toBe('a_accepter');
    const formulaire = rendre(p, avant);
    expect(formulaire).toContain('<form');
    expect(formulaire).toContain(`value="${p.version}"`);
    expect(formulaire).toContain(CONFIDENTIALITE.accord.action);

    const issue = await accepterLaPolitique(
      {
        apporteurId: 'a1',
        versionVue: p.version,
        courante: p,
        maintenant: MAINTENANT,
      },
      depot
    );
    expect(issue).toBe('acceptee');
    expect(ecritures).toEqual([{ apporteurId: 'a1', version: p.version }]);
    const apres = await etatDAcceptation('a1', p, depot);
    expect(apres).toBe('acceptee');
    const html = rendre(p, apres);
    expect(html).not.toContain('<form');
    expect(html).toContain(CONFIDENTIALITE.acceptee);
  });

  it('REQ-JUR-025 — une version changée au registre est à accepter de nouveau', async () => {
    const { depot } = depotEnMemoire({ a1: { accepteeAt: MAINTENANT, version: p.version } });
    const nouvelle = politiqueDe(
      REGISTRE_PUBLIABLE.replace('purgée dès validation', 'purgée à la validation')
    );
    expect(await etatDAcceptation('a1', p, depot)).toBe('acceptee');
    expect(await etatDAcceptation('a1', nouvelle, depot)).toBe('a_accepter');
    // Un apporteur introuvable n'a rien accepté.
    expect(await etatDAcceptation('inconnu', p, depot)).toBe('a_accepter');
  });

  it('REQ-JUR-025 — une version affichée périmée, ou absente, n’écrit rien', async () => {
    const { depot, ecritures } = depotEnMemoire();
    for (const versionVue of ['0'.repeat(LONGUEUR_DE_VERSION), null]) {
      const issue = await accepterLaPolitique(
        { apporteurId: 'a1', versionVue, courante: p, maintenant: MAINTENANT },
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
  const p = politiqueDe(REGISTRE_PUBLIABLE);
  const lecture = () => extrairePolitique(REGISTRE_PUBLIABLE);

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

  it('REQ-JUR-025 — TÉMOIN (JUR-T57, sécurité) : registre illisible → la politique en erreur ; base injoignable → l’indisponibilité ; jamais l’espace, et le motif est signalé', async () => {
    const motifs: string[] = [];
    const neuf = depotEnMemoire().depot;
    expect(
      await destinationDeLOuverture(
        'jeton',
        () => ({ ok: false, refus: 'illisible' }),
        () => portsAvecSession(neuf),
        (m) => motifs.push(m)
      )
    ).toBe(ROUTE_CONFIDENTIALITE);
    expect(
      await destinationDeLOuverture(
        'jeton',
        lecture,
        () => {
          throw new Error('base injoignable');
        },
        (m) => motifs.push(m)
      )
    ).toBe(ROUTE_INDISPONIBLE);
    expect(motifs).toEqual([
      'confidentialite_registre_illisible',
      'confidentialite_etat_illisible',
    ]);
  });
});

// ── le lecteur, pièce à pièce, sur un registre témoin ────────────────────────────────────────────

/**
 * Les modules RÉÉVALUÉS dans le test qui les appelle : leurs constantes de module (ordre, marque,
 * unités, catalogue, routes) sont alors jugées par ce test, et non figées à l'import du fichier.
 */
async function politiqueFraiche() {
  vi.resetModules();
  return import('../../../src/domain/rgpd/politique');
}
async function acceptationFraiche() {
  vi.resetModules();
  return import('../../../src/server/rgpd/acceptation');
}

const ANS = SEUILS.CONSERVATION_PIECES_ANS.valeur;

/**
 * Un registre témoin qui porte chaque cas du lecteur : en-tête du traitement en première ligne,
 * rubriques dans le désordre de l'affichage, apostrophe typographique, dièse dans une cellule,
 * « Question » collée, doublée ou citée au milieu d'un texte ; en section 4, une prose qui cite la
 * section et contient des barres, un sous-titre, une ligne de tableau indentée, une autre suivie de
 * blancs, un tiers qui cite deux traitements, une cellule faite d'un tiret, un tiers sans nom, des
 * cellules qui commencent ou finissent par un tiret, et une dernière ligne sans saut de ligne final.
 */
const REGISTRE_TEMOIN = [
  '### TRT-APPORTEURS — le traitement témoin',
  '',
  '| Rubrique | Contenu |',
  '| --- | --- |',
  '| Droits et modalités d’exercice | À compléter — source manquante. Question :  à qui écrire ? |',
  '| Finalité | Tenir le contrat |',
  '| Base légale | À compléter — source manquante. Question: laquelle ? |',
  '| Durée de conservation | Pièces : `CONSERVATION_PIECES_ANS`. |',
  '| Destinataires | La Société (voir la note # 2) |',
  '| Transferts hors Union européenne | Aucun. À compléter — source manquante. Qui tranche ? Question : Will. |',
  '',
  'Les tiers sont au ## 4. du registre.',
  '## 4. Destinataires tiers',
  '### Sous-traitants',
  'Colonnes : nom | qualification | traitements.',
  '| Tiers | Qualification | Traitements | Données confiées | Localisation et transfert |',
  '| --- | --- | --- | --- | --- |',
  '| Alpha | sous-traitant | TRT-APPORTEURS | Adresses | France |  ',
  '  | Beta | sous-traitant | TRT-TIERS, TRT-APPORTEURS | Journaux | Union européenne |',
  '|  | sous-traitant | TRT-TIERS | Aucune | France |',
  '| -Delta | -a | -b | -c | -d |',
  '| Epsilon- | a- | b- | c- | d- |',
  '| Gamma | - | TRT-APPORTEURS | Aucune | France |',
].join('\n');

const texte = (t: string) => ({ type: 'texte', texte: t });
const manque = () => ({ type: 'a_completer' });

describe('REQ-JUR-025 — le lecteur du registre, pièce à pièce', () => {
  it('REQ-JUR-025 — le registre témoin rend exactement ses six rubriques, dans l’ordre d’affichage, et ses trois destinataires', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    const lue = extraire(REGISTRE_TEMOIN);
    if (!lue.ok) throw new Error(`registre témoin refusé : ${lue.refus}`);
    expect(lue.politique.rubriques).toEqual([
      { cle: 'finalite', contenu: [texte('Tenir le contrat')] },
      { cle: 'baseLegale', contenu: [manque()] },
      { cle: 'duree', contenu: [texte(`Pièces : ${ANS} ans.`)] },
      { cle: 'destinataires', contenu: [texte('La Société (voir la note # 2)')] },
      { cle: 'transferts', contenu: [texte('Aucun.'), manque()] },
      { cle: 'droits', contenu: [manque()] },
    ]);
    expect(lue.politique.destinataires).toEqual([
      {
        nom: 'Alpha',
        qualification: [texte('sous-traitant')],
        donnees: [texte('Adresses')],
        localisation: [texte('France')],
      },
      {
        nom: 'Beta',
        qualification: [texte('sous-traitant')],
        donnees: [texte('Journaux')],
        localisation: [texte('Union européenne')],
      },
      {
        nom: 'Gamma',
        qualification: [texte('-')],
        donnees: [texte('Aucune')],
        localisation: [texte('France')],
      },
    ]);
  });

  it('REQ-JUR-025 — le traitement lu et la marque du manque sont ceux du registre, à la lettre', async () => {
    const m = await politiqueFraiche();
    expect(m.TRAITEMENT).toBe('TRT-APPORTEURS');
    expect(m.MARQUE_A_COMPLETER).toBe('À compléter — source manquante.');
  });

  it('REQ-JUR-025 — chaque unité de la source des seuils est rendue en toutes lettres', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    const noms = [
      'PRISE_DE_CONTACT_JOURS_OUVRES',
      'CONFIRMATION_TACITE_JOURS',
      'ANTERIORITE_CLIENT_MOIS',
      'CONSERVATION_PIECES_ANS',
      'SEUIL_VIGILANCE',
    ] as const;
    expect(noms.map((n) => SEUILS[n].unite)).toEqual([
      'jours_ouvres',
      'jours',
      'mois',
      'ans',
      'centimes',
    ]);
    const cite = noms.map((n) => `\`${n}\``).join(' · ');
    const lue = extraire(REGISTRE_TEMOIN.replace('Tenir le contrat', cite));
    if (!lue.ok) throw new Error(lue.refus);
    const [a, b, c, d, e] = noms.map((n) => SEUILS[n].valeur);
    expect(lue.politique.rubriques[0]).toEqual({
      cle: 'finalite',
      contenu: [texte(`${a} jours ouvrés · ${b} jours · ${c} mois · ${d} ans · ${e} centimes`)],
    });
  });

  it('REQ-JUR-025 — un refus nomme son motif, sans préfixe ; une erreur d’un autre type garde le sien', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    expect(extraire(REGISTRE_TEMOIN.replace('### TRT-APPORTEURS', '### TRT-AUTRE'))).toEqual({
      ok: false,
      refus: 'section absente du registre : TRT-APPORTEURS',
    });
    const lue = extraire(undefined as unknown as string);
    expect(lue.ok).toBe(false);
    expect(lue.ok ? '' : lue.refus).toMatch(/^TypeError: /);
  });

  it('REQ-JUR-025 — une section vide, suivie d’un titre, ne lit pas le traitement voisin', () => {
    const voisin = REGISTRE_TEMOIN.replace(
      '### TRT-APPORTEURS — le traitement témoin',
      '### TRT-APPORTEURS\n### TRT-TIERS'
    );
    expect(refusDe(voisin)).toBe('rubrique absente de TRT-APPORTEURS : Finalité');
  });

  it('REQ-JUR-025 — une colonne que seul le corps du tableau nomme n’est pas une colonne', () => {
    const sansEntete = REGISTRE_TEMOIN.replace(
      '| Tiers | Qualification |',
      '| Nom | Qualification |'
    ).replace('| Gamma | - |', '| Gamma | Tiers |');
    expect(refusDe(sansEntete)).toBe('colonne absente de la section 4 : Tiers');
  });
});

describe('REQ-JUR-025 — le témoin de la page, pièce à pièce', () => {
  it('REQ-JUR-025 — le catalogue des services courants est exactement celui-ci, et chacun rougit par défaut', async () => {
    const m = await politiqueFraiche();
    const catalogue = [
      'Amazon Web Services',
      'AWS',
      'Google',
      'Microsoft',
      'Azure',
      'OVH',
      'OVHcloud',
      'Scaleway',
      'Hetzner',
      'Cloudflare',
      'Vercel',
      'Brevo',
      'Sendinblue',
      'Mailchimp',
      'SendGrid',
      'Mailgun',
      'Twilio',
      'Stripe',
      'Firebase',
      'OneSignal',
      'DocuSign',
      'Yousign',
      'Qonto',
      'Pennylane',
    ];
    expect(m.SERVICES_COURANTS).toEqual(catalogue);
    expect(m.valeursRetapees(catalogue.join(' ; '), '')).toEqual(
      catalogue.map((n) => `prestataire retapé dans la page : « ${n} » (absente du registre)`)
    );
  });

  it('REQ-JUR-025 — seuls les tiers du corps du tableau comptent : ni l’en-tête, ni la séparation, ni un nom vide', async () => {
    const { valeursRetapees: retapees } = await politiqueFraiche();
    for (const page of ['Tiers', '---', ' . ']) {
      expect(retapees(page, REGISTRE_TEMOIN, []), page).toEqual([]);
    }
    expect(retapees('Beta, Gamma, -Delta et Epsilon-', REGISTRE_TEMOIN, [])).toEqual(
      ['Beta', '-Delta', 'Epsilon-', 'Gamma'].map(
        (n) => `prestataire retapé dans la page : « ${n} » (recopiée du registre)`
      )
    );
  });

  it('REQ-JUR-025 — un nom collé à une lettre ou à un chiffre n’est pas un nom de prestataire', async () => {
    const { valeursRetapees: retapees } = await politiqueFraiche();
    expect(retapees('MonStripe, 7Stripe, Stripé', '', ['Stripe'])).toEqual([]);
    expect(retapees('via Stripe.', '', ['Stripe'])).toEqual([
      'prestataire retapé dans la page : « Stripe » (absente du registre)',
    ]);
    // Un nom qui porte un caractère d'expression régulière se cherche à la lettre.
    expect(retapees('via Relais (courriel).', '', ['Relais (courriel)'])).toEqual([
      'prestataire retapé dans la page : « Relais (courriel) » (absente du registre)',
    ]);
  });

  it('REQ-JUR-025 — sans section 4 lisible ni catalogue, la page ne se voit reprocher aucun nom', async () => {
    const { valeursRetapees: retapees } = await politiqueFraiche();
    // Le texte cité est le remplaçant qu'un mutant donnerait à la liste vide : il ne doit rien nommer.
    expect(retapees('Stryker was here', '', [])).toEqual([]);
  });
});

// ── l'acceptation : constantes, dépôt Prisma, câblage du processus ──────────────────────────────

function prismaTemoin(ligne: unknown) {
  const appels: Array<[string, unknown]> = [];
  const prisma = {
    apporteur: {
      findUnique: async (a: unknown) => {
        appels.push(['apporteur.findUnique', a]);
        return ligne;
      },
      update: async (a: unknown) => {
        appels.push(['apporteur.update', a]);
        return {};
      },
    },
    sessionEspace: {
      findUnique: async (a: unknown) => {
        appels.push(['sessionEspace.findUnique', a]);
        return null;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, appels };
}

describe('REQ-JUR-025 — l’acceptation, ses routes et son câblage', () => {
  it('REQ-JUR-025 — les routes et le chemin du registre sont ceux-ci, à la lettre', async () => {
    const m = await acceptationFraiche();
    expect(m.CHEMIN_DU_REGISTRE).toBe('docs/rgpd/registre-article-30.md');
    expect(m.ROUTE_CONFIDENTIALITE).toBe('/confidentialite');
    expect(m.ROUTE_ISSUE_OUVERTE).toBe('/connexion?issue=ouverte');
    expect(m.ROUTE_INDISPONIBLE).toBe('/connexion?etat=indisponible');
  });

  it('REQ-JUR-025 — une version courante sans date d’acceptation reste à accepter', async () => {
    const { depot } = depotEnMemoire({ a1: { accepteeAt: null, version: 'v-courante' } });
    const courante = { ...politiqueDe(REGISTRE_PUBLIABLE), version: 'v-courante' };
    expect(await etatDAcceptation('a1', courante, depot)).toBe('a_accepter');
  });

  it('REQ-JUR-025 — le dépôt Prisma lit les deux colonnes de l’apporteur, et rend null sans apporteur', async () => {
    const { prisma, appels } = prismaTemoin({
      confidentialiteAccepteeAt: MAINTENANT,
      confidentialiteVersion: 'v1',
    });
    expect(await depotDAcceptation(prisma).lire('a1')).toEqual({
      accepteeAt: MAINTENANT,
      version: 'v1',
    });
    expect(appels).toEqual([
      [
        'apporteur.findUnique',
        {
          where: { id: 'a1' },
          select: { confidentialiteAccepteeAt: true, confidentialiteVersion: true },
        },
      ],
    ]);
    expect(await depotDAcceptation(prismaTemoin(null).prisma).lire('a2')).toBeNull();
  });

  it('REQ-JUR-025 — le dépôt Prisma écrit la date et la version sur l’apporteur', async () => {
    const { prisma, appels } = prismaTemoin(null);
    await depotDAcceptation(prisma).ecrire('a1', MAINTENANT, 'v2');
    expect(appels).toEqual([
      [
        'apporteur.update',
        {
          where: { id: 'a1' },
          data: { confidentialiteAccepteeAt: MAINTENANT, confidentialiteVersion: 'v2' },
        },
      ],
    ]);
  });

  it('REQ-JUR-025 — les ports du processus : l’horloge, la configuration de session et les deux dépôts sur la base', async () => {
    const env: Record<string, string> = {
      NODE_ENV: 'test',
      ...Object.fromEntries(
        NOMS_DES_SECRETS.map((n) => [n, `temoin-jur-t34-${n.toLowerCase()}-`.padEnd(48, '0')])
      ),
      PII_ENCRYPTION_KEY: Array.from({ length: 32 }, (_, i) =>
        i.toString(16).padStart(2, '0')
      ).join(''),
    };
    const { prisma, appels } = prismaTemoin(null);
    const ports = portsDuProcessus({ env, prisma, horloge: horlogeFigee(MAINTENANT.getTime()) });
    expect(ports.session.maintenant()).toEqual(MAINTENANT);
    expect(ports.session.configuration).toEqual(configurationDuLien(env).session);
    expect(await ports.session.depot.lire('empreinte')).toBeNull();
    expect(await ports.depot.lire('a1')).toBeNull();
    expect(appels.map(([nom]) => nom)).toEqual([
      'sessionEspace.findUnique',
      'apporteur.findUnique',
    ]);
  });
});

// ── JUR-T57 : la politique n'est présentée à l'acceptation que PUBLIABLE ─────────────────────────

describe('REQ-JUR-025 — la politique n’est présentée à l’acceptation que si elle ne porte aucun segment à compléter', () => {
  const publiable = politiqueDe(REGISTRE_PUBLIABLE);
  /** Le registre publiable, UNE rubrique rouverte : un seul segment en cours de rédaction. */
  const unManque = politiqueDe(
    REGISTRE_PUBLIABLE.replace(
      /^(\| Base légale \|)[^|]*\|/m,
      `$1 ${MARQUE_A_COMPLETER} Question : laquelle ? |`
    )
  );

  it('REQ-JUR-025 : TÉMOIN — un seul segment à compléter fait REFUSER l’acceptation, nommée, sans rien écrire ni montrer de formulaire', async () => {
    expect(segmentsEnCours(unManque)).toBe(1);
    expect(estPubliable(unManque)).toBe(false);
    const { depot, ecritures } = depotEnMemoire({ a1: { accepteeAt: null, version: null } });
    const etat = await etatDAcceptation('a1', unManque, depot);
    expect(etat).toBe('non_publiable');
    const html = rendre(unManque, etat);
    expect(html).not.toContain('<form');
    expect(html).toContain(CONFIDENTIALITE.nonPubliable);
    // L'action REJUGE au moment d'écrire, même avec la bonne version affichée.
    const issue = await accepterLaPolitique(
      {
        apporteurId: 'a1',
        versionVue: unManque.version,
        courante: unManque,
        maintenant: MAINTENANT,
      },
      depot
    );
    expect(issue).toBe('non_publiable');
    expect(ecritures).toEqual([]);
  });

  it('REQ-JUR-025 : TÉMOIN — zéro segment à compléter laisse passer l’acceptation', async () => {
    expect(segmentsEnCours(publiable)).toBe(0);
    expect(estPubliable(publiable)).toBe(true);
    const { depot, ecritures } = depotEnMemoire({ a1: { accepteeAt: null, version: null } });
    expect(await etatDAcceptation('a1', publiable, depot)).toBe('a_accepter');
    expect(
      await accepterLaPolitique(
        {
          apporteurId: 'a1',
          versionVue: publiable.version,
          courante: publiable,
          maintenant: MAINTENANT,
        },
        depot
      )
    ).toBe('acceptee');
    expect(ecritures).toEqual([{ apporteurId: 'a1', version: publiable.version }]);
  });

  it('REQ-JUR-025 : TÉMOIN — une qualification non tranchée, OMISE, ne bloque pas', () => {
    const banque = publiable.destinataires.find((d) => d.nom === 'Banque');
    expect(banque?.qualification).toEqual([]);
    expect(estPubliable(publiable)).toBe(true);
  });

  it('REQ-JUR-025 : le registre RÉEL n’est pas publiable aujourd’hui : la connexion mène à la politique, jamais à l’issue habituelle', async () => {
    const reelle = politiqueDe(REGISTRE);
    expect(estPubliable(reelle)).toBe(false);
    const motifs: string[] = [];
    const deja = depotEnMemoire({ a1: { accepteeAt: MAINTENANT, version: reelle.version } }).depot;
    expect(
      await destinationDeLOuverture(
        'jeton',
        () => extrairePolitique(REGISTRE),
        () => portsAvecSession(deja),
        (m) => motifs.push(m)
      )
    ).toBe(ROUTE_CONFIDENTIALITE);
    expect(motifs).toEqual([]);
  });
});
