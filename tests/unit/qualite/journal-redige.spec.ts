// @req REQ-QA-024
/**
 * Le journal applicatif caviarde toute donnée protégée sur la LIGNE FINALE — QA-T08 (REQ-QA-024).
 *
 * TÉMOIN À DEUX FACES. Un bac (`journal-redige.bac.ts`) est lancé en SOUS-PROCESSUS et écrit un
 * objet piégé : une clé par segment protégé des deux lexiques, une clé à trois niveaux, une dans un
 * tableau, une en casse et une en accents différents, une `Error` dont le message porte un courriel,
 * et un message libre qui porte téléphone, courriel, IBAN et lien de dépôt. Le détecteur confronte
 * la SORTIE RÉELLE du processus à chaque valeur passée et NOMME chaque champ qui a franchi.
 *   — face nue (`pino()` sans option) : le détecteur nomme des champs, il doit en nommer ;
 *   — face du dépôt (`creerJournal()`) : aucun champ nommé, aucune valeur dans la sortie.
 * Le vert imprime le compte des champs confrontés, DÉRIVÉ des deux lexiques, plancher > 0.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createTransport } from '@sentry/node';
import { LEXIQUE_CHAMPS_PERSONNELS } from '../../../src/domain/donnees-personnelles/champs';
import {
  CAVIARDE,
  SEGMENTS_SECRETS,
  cleProtegee,
  creerJournal,
  fluxCaviardant,
} from '../../../src/lib/logger';
import { creerNotifieur, productionDeclaree, type Notification } from '../../../src/lib/notify';
import {
  composer,
  onRequestError,
  register,
  traiterErreurDeRequete,
} from '../../../src/instrumentation';
import type { FabriqueDeTransport } from '../../../src/lib/sentry';

const RACINE = join(__dirname, '..', '..', '..');
const BAC = join(__dirname, 'journal-redige.bac.ts');

// ── l'objet piégé, dérivé des deux lexiques ─────────────────────────────────────────────────────

/** Les segments protégés : ceux de DM-01, puis les secrets du journal — jamais recopiés ici. */
const SEGMENTS = [
  ...new Set([...LEXIQUE_CHAMPS_PERSONNELS.map((e) => e.segment), ...SEGMENTS_SECRETS]),
];

type Piege = { nom: string; valeur: string };

const MESSAGE_LIBRE =
  'rappeler 06 12 34 56 78 ou jean@x.fr, IBAN FR76 3000 6000 0112 3456 7890 189, lien /d/abc123';

function construirePiege() {
  const pieges: Piege[] = [];
  const objet: Record<string, unknown> = {};
  SEGMENTS.forEach((s, i) => {
    const valeur = `piege-${String(i).padStart(2, '0')}-zq`;
    objet[s] = valeur;
    pieges.push({ nom: `champ « ${s} »`, valeur });
  });
  objet.niveau1 = { niveau2: { courriel: 'piege-profond-zq' } };
  pieges.push({ nom: 'niveau1.niveau2.courriel (trois niveaux)', valeur: 'piege-profond-zq' });
  objet.lignes = [{ ok: 1 }, { email: 'piege-tableau-zq' }];
  pieges.push({ nom: 'lignes[1].email (tableau)', valeur: 'piege-tableau-zq' });
  objet.Courriel = 'piege-casse-zq';
  pieges.push({ nom: 'Courriel (casse)', valeur: 'piege-casse-zq' });
  objet['Téléphone'] = 'piege-accent-zq';
  pieges.push({ nom: 'Téléphone (accents)', valeur: 'piege-accent-zq' });
  objet.apporteurId = 'piege-apporteur-zq';
  pieges.push({ nom: 'apporteurId (identifiant brut)', valeur: 'piege-apporteur-zq' });
  const messageErreur = 'echec pour marie.piege@exemple.fr';
  pieges.push({ nom: 'err.message / err.stack (courriel)', valeur: 'marie.piege@exemple.fr' });
  pieges.push({ nom: 'msg : téléphone', valeur: '06 12 34 56 78' });
  pieges.push({ nom: 'msg : courriel', valeur: 'jean@x.fr' });
  pieges.push({ nom: 'msg : IBAN', valeur: 'FR76 3000 6000 0112 3456 7890 189' });
  pieges.push({ nom: 'msg : jeton de lien de dépôt', valeur: '/d/abc123' });
  return { pieges, charge: { msg: MESSAGE_LIBRE, objet, messageErreur, segments: SEGMENTS } };
}

/** LE DÉTECTEUR : le nom de chaque champ piégé dont la valeur se lit dans la sortie. */
function franchis(sortie: string, pieges: Piege[]): string[] {
  return pieges.filter((p) => sortie.includes(p.valeur)).map((p) => p.nom);
}

function lancerBac(face: 'nu' | 'chemins' | 'depot') {
  const { pieges, charge } = construirePiege();
  const r = spawnSync(process.execPath, ['--import', 'tsx', BAC, face], {
    cwd: RACINE,
    input: JSON.stringify(charge),
    encoding: 'utf8',
  });
  expect(r.status, `le bac « ${face} » a échoué : ${r.stderr}`).toBe(0);
  expect(r.stdout.length, `le bac « ${face} » n'a rien écrit`).toBeGreaterThan(0);
  return { sortie: r.stdout, pieges, trouves: franchis(r.stdout, pieges) };
}

describe('REQ-QA-024 — témoin à deux faces : la sortie réelle d’un processus, confrontée aux valeurs', () => {
  it('REQ-QA-024 : face nue — pino sans option laisse passer chaque champ, et le détecteur les NOMME', () => {
    const { pieges, trouves } = lancerBac('nu');
    expect(trouves).toEqual(pieges.map((p) => p.nom));
  });

  it('REQ-QA-024 : face des chemins — la rédaction par chemins de pino laisse passer le profond et le tableau', () => {
    const { trouves } = lancerBac('chemins');
    expect(trouves).toEqual(
      expect.arrayContaining([
        'niveau1.niveau2.courriel (trois niveaux)',
        'lignes[1].email (tableau)',
      ])
    );
  });

  it('REQ-QA-024 : face du dépôt — aucun champ ne franchit, et le compte confronté est imprimé', () => {
    const { sortie, pieges, trouves } = lancerBac('depot');
    expect(trouves, `champs franchis dans la sortie du journal du dépôt :\n${sortie}`).toEqual([]);
    // Le vert n'est pas une ligne vidée : chaque champ est là, sa valeur remplacée.
    const ligne = JSON.parse(sortie);
    for (const s of SEGMENTS) expect(ligne[s], `champ « ${s} »`).toBe(CAVIARDE);
    expect(ligne.niveau1.niveau2.courriel).toBe(CAVIARDE);
    expect(ligne.lignes).toEqual([{ ok: 1 }, { email: CAVIARDE }]);
    expect(ligne.msg).toBe('rappeler [telephone] ou [courriel], IBAN [iban], lien /d/[jeton]');
    expect(SEGMENTS.length).toBeGreaterThan(0);
    console.log(
      `${SEGMENTS.length} champs confrontés (${LEXIQUE_CHAMPS_PERSONNELS.length} du lexique de personne, ` +
        `${SEGMENTS_SECRETS.length} secrets) — ${pieges.length} valeurs piégées, aucune dans la sortie`
    );
  });
});

// ── en processus : chaque attaque, une ligne capturée ───────────────────────────────────────────

/** Une sortie capturée, et ses lignes relues. */
function sortieCapturee() {
  const ecrit: string[] = [];
  const texte = () => ecrit.join('');
  const lignes = () =>
    texte()
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => JSON.parse(l));
  return { sortie: { write: (t: string) => ecrit.push(t) }, texte, lignes };
}

/** Un journal du dépôt dont la sortie est capturée. */
function journalCapture() {
  const capture = sortieCapturee();
  return { ...capture, journal: creerJournal({ sortie: capture.sortie }) };
}

describe('REQ-QA-024 — les noms de champ : le VRAI lexique de DM-01, segments exacts', () => {
  it('REQ-QA-024 : l’élément du MILIEU de chaque lexique est caviardé, pas seulement le premier ou le dernier', () => {
    const milieuPersonne =
      LEXIQUE_CHAMPS_PERSONNELS[Math.floor(LEXIQUE_CHAMPS_PERSONNELS.length / 2)]?.segment;
    const milieuSecret = SEGMENTS_SECRETS[Math.floor(SEGMENTS_SECRETS.length / 2)];
    expect(milieuPersonne).toBeDefined();
    expect(milieuSecret).toBeDefined();
    const { journal, texte, lignes } = journalCapture();
    journal.info('m', {
      [`${milieuPersonne}Contact`]: 'fuite-milieu-personne',
      [`${milieuSecret}_session`]: 'fuite-milieu-secret',
    });
    expect(texte()).not.toContain('fuite-milieu');
    expect(lignes()[0]).toMatchObject({
      [`${milieuPersonne}Contact`]: CAVIARDE,
      [`${milieuSecret}_session`]: CAVIARDE,
    });
  });

  it('REQ-QA-024 : casse, accents, snake, kebab et formes collées sont reconnus', () => {
    for (const cle of [
      'COURRIEL',
      'Prénom',
      'numero_telephone',
      'Adresse-Postale',
      'mot_de_passe',
      'x-auth-token',
      'IPAddress',
      'apporteurId',
      'apporteur_id',
    ]) {
      expect(cleProtegee(cle), cle).toBe(true);
    }
  });

  it('REQ-QA-024 : un segment n’est pas une sous-chaîne — nomenclature, hotel, hostname passent', () => {
    for (const cle of ['nomenclature', 'hotel', 'hostname', 'apporteurIdHash', 'montantCentimes']) {
      expect(cleProtegee(cle), cle).toBe(false);
    }
  });

  it('REQ-QA-024 : une clé qui PORTE une valeur protégée est elle-même caviardée', () => {
    const { journal, texte } = journalCapture();
    journal.info('m', { parDestinataire: { 'jean@x.fr': 3 } });
    expect(texte()).not.toContain('jean@x.fr');
    expect(texte()).toContain('[courriel]');
  });
});

describe('REQ-QA-024 — les valeurs : message libre, erreur, lien de dépôt, profondeur, tableau', () => {
  it('REQ-QA-024 : message libre — téléphone, courriel, IBAN et jeton de lien de dépôt retirés', () => {
    const { journal, texte, lignes } = journalCapture();
    journal.warn(MESSAGE_LIBRE);
    for (const v of [
      '06 12 34 56 78',
      'jean@x.fr',
      'FR76 3000 6000 0112 3456 7890 189',
      'abc123',
    ]) {
      expect(texte(), v).not.toContain(v);
    }
    expect(lignes()[0].msg).toBe(
      'rappeler [telephone] ou [courriel], IBAN [iban], lien /d/[jeton]'
    );
  });

  it('REQ-QA-024 : les écritures du téléphone et de l’IBAN — indicatif, séparateurs, sans espaces, minuscules', () => {
    const { journal, texte } = journalCapture();
    const valeurs = [
      '+33 6 12 34 56 78',
      '+33612345678',
      '0033.6.12.34.56.78',
      '06-12-34-56-78',
      '0612345678',
      'FR7630006000011234567890189',
      'fr76 3000 6000 0112 3456 7890 189',
    ];
    journal.info(`contacts : ${valeurs.join(' ; ')}`);
    for (const v of valeurs) expect(texte(), v).not.toContain(v);
  });

  it('REQ-QA-024 : le message ET la pile d’une Error sont caviardés', () => {
    const { journal, texte, lignes } = journalCapture();
    journal.error('echec', { err: new Error('refus pour marie@exemple.fr sur /d/tok-42') });
    expect(texte()).not.toContain('marie@exemple.fr');
    expect(texte()).not.toContain('tok-42');
    const { err } = lignes()[0];
    expect(err.message).toBe('refus pour [courriel] sur /d/[jeton]');
    expect(err.stack).toContain('refus pour [courriel] sur /d/[jeton]');
  });

  it('REQ-QA-024 : une profondeur inattendue et des tableaux imbriqués sont parcourus', () => {
    const { journal, texte } = journalCapture();
    journal.info('m', {
      a: { b: { c: { d: { e: { f: { telephone: 'fuite-six' } } } } } },
      t: [[{ x: [{ iban: 'fuite-tableau' }] }], 'appel au 0612345678'],
    });
    expect(texte()).not.toContain('fuite-six');
    expect(texte()).not.toContain('fuite-tableau');
    expect(texte()).not.toContain('0612345678');
  });
});

describe('REQ-QA-024 — le contexte : journal enfant, empreinte d’apporteur', () => {
  it('REQ-QA-024 : requestId, apporteurIdHash, eventId et jobName sont portés par chaque ligne de l’enfant', () => {
    const { journal, lignes } = journalCapture();
    const contexte = {
      requestId: '0b8c7e2a-5f1d-4c3e-9a7b-2d6e8f0a1b3c',
      apporteurIdHash: 'ab12cd34ef56ab78cd90ef12ab34cd56',
      eventId: 'e5f6a7b8c9d0e1f2',
      jobName: 'relance-quotidienne',
    };
    journal.enfant(contexte).info('commission_calculee');
    expect(lignes()[0]).toMatchObject({ ...contexte, msg: 'commission_calculee' });
  });

  it('REQ-QA-024 : un apporteurIdHash qui n’est pas une empreinte est refusé, sans être répété', () => {
    const { journal } = journalCapture();
    let message = '';
    try {
      journal.enfant({ apporteurIdHash: 'apporteur-1234' });
    } catch (e) {
      message = String(e);
    }
    expect(message).toMatch(/apporteurIdHash doit être une empreinte/);
    expect(message).not.toContain('apporteur-1234');
  });

  it('REQ-QA-024 : les liaisons d’un journal enfant passent par le même caviardage', () => {
    const { journal, texte } = journalCapture();
    journal
      .enfant({ requestId: 'jean@x.fr', jobName: 'appel 06 12 34 56 78' })
      .enfant({ eventId: '/d/abc123' })
      .info('m');
    for (const v of ['jean@x.fr', '06 12 34 56 78', 'abc123']) expect(texte(), v).not.toContain(v);
  });
});

describe('REQ-QA-024 — le flux échoue FERMÉ', () => {
  it('REQ-QA-024 : une ligne tronquée est remplacée, jamais écrite telle quelle', () => {
    const { sortie, texte } = sortieCapturee();
    fluxCaviardant(sortie).write('{"a":"jean@x.fr"');
    expect(texte()).not.toContain('jean@x.fr');
    expect(JSON.parse(texte())).toEqual({
      level: 50,
      msg: 'ligne de journal illisible retirée',
      octets: Buffer.byteLength('{"a":"jean@x.fr"'),
    });
  });
});

// ── Sentry ──────────────────────────────────────────────────────────────────────────────────────

const DSN_FICTIF = 'https://cle@exemple.invalid/1';

/** Un transport Sentry qui capture les enveloppes au lieu de les envoyer. */
function transportCapturant() {
  const enveloppes: string[] = [];
  let construits = 0;
  const fabrique: FabriqueDeTransport = (o) => {
    construits += 1;
    return createTransport(o, async (requete) => {
      enveloppes.push(String(requete.body));
      return { statusCode: 200 };
    });
  };
  return { fabrique, enveloppes, construits: () => construits };
}

describe('REQ-QA-024 — Sentry reçoit les erreurs par la même fonction de caviardage', () => {
  it('REQ-QA-024 : onRequestError — ni la valeur, ni le jeton, ni le cookie, ni l’adresse réseau', async () => {
    const capture = transportCapturant();
    const journal = sortieCapturee();
    const composition = await composer(
      { SENTRY_DSN: DSN_FICTIF, PARTNERS_ENV: 'test' },
      { transport: capture.fabrique, sortie: journal.sortie }
    );
    expect(composition.sentinelle.actif).toBe(true);
    await traiterErreurDeRequete(composition)(
      new Error('jean@x.fr'),
      {
        path: '/d/abc123?nom=Dupont',
        method: 'GET',
        headers: { cookie: 's=1', 'x-forwarded-for': '1.2.3.4', authorization: 'Bearer zz9' },
      },
      { routerKind: 'App Router', routePath: '/d/[jeton]', routeType: 'render' }
    );
    expect(capture.enveloppes).toHaveLength(1);
    const enveloppe = capture.enveloppes[0] ?? '';
    for (const v of ['jean@x.fr', 'abc123', 'Dupont', 's=1', '1.2.3.4', 'Bearer', 'ip_address']) {
      expect(enveloppe, v).not.toContain(v);
    }
    // L'événement est bien parti, caviardé : ce n'est pas un silence.
    expect(enveloppe).toContain('"value":"[courriel]"');
    expect(enveloppe).toContain('"chemin":"/d/[jeton]"');
    expect(enveloppe).toContain('"methode":"GET"');
    // La ligne de journal de la même erreur, caviardée elle aussi.
    for (const v of ['jean@x.fr', 'abc123', 'Dupont', 's=1']) {
      expect(journal.texte(), v).not.toContain(v);
    }
    expect(journal.lignes().map((l) => l.msg)).toContain('erreur_de_requete');
  });

  it('REQ-QA-024 : DSN absent — aucun transport construit, rien ne part, une ligne le dit', async () => {
    const capture = transportCapturant();
    const journal = sortieCapturee();
    const { sentinelle } = await composer(
      { NODE_ENV: 'test', PARTNERS_ENV: 'local' },
      { transport: capture.fabrique, sortie: journal.sortie }
    );
    await sentinelle.capturerErreur(new Error('x'));
    expect(sentinelle.actif).toBe(false);
    expect(capture.construits()).toBe(0);
    expect(capture.enveloppes).toEqual([]);
    expect(journal.lignes()).toEqual([
      expect.objectContaining({ level: 30, msg: 'sentry_inactif' }),
    ]);
  });

  it('REQ-QA-024 : DSN absent en production — la ligne est de niveau error', async () => {
    const journal = sortieCapturee();
    await composer(
      { NODE_ENV: 'production', PARTNERS_ENV: 'production' },
      { sortie: journal.sortie }
    );
    expect(journal.lignes()).toEqual([
      expect.objectContaining({ level: 50, msg: 'sentry_inactif_en_production' }),
    ]);
  });

  it('REQ-QA-024 : hors runtime Node, register ne compose rien et onRequestError ne fait rien', async () => {
    expect(process.env.NEXT_RUNTIME).toBeUndefined();
    await register();
    await expect(
      onRequestError(
        new Error('x'),
        { path: '/', method: 'GET', headers: {} },
        { routerKind: 'App Router', routePath: '/', routeType: 'render' }
      )
    ).resolves.toBeUndefined();
  });
});

// ── le notifieur, confronté au hook d'environnement ─────────────────────────────────────────────

const HOOK_ENV = join(RACINE, 'scripts', 'gates', 'hook-env.js');

type LigneEnv = { NODE_ENV?: string; PARTNERS_ENV?: string; NOTIFY_SINK?: string };

const MATRICE: LigneEnv[] = [
  { NODE_ENV: 'development', PARTNERS_ENV: 'local' },
  { NODE_ENV: 'development', PARTNERS_ENV: 'local', NOTIFY_SINK: 'false' },
  { NODE_ENV: 'development', PARTNERS_ENV: 'local', NOTIFY_SINK: 'true' },
  { NODE_ENV: 'production', PARTNERS_ENV: 'preview' },
  { NODE_ENV: 'production', PARTNERS_ENV: 'preview', NOTIFY_SINK: 'true' },
  { NODE_ENV: 'development', PARTNERS_ENV: 'production' },
  { NODE_ENV: 'production', PARTNERS_ENV: 'production' },
  { NODE_ENV: 'production', PARTNERS_ENV: 'production', NOTIFY_SINK: 'true' },
];

/** Le verdict RÉEL du hook. L'environnement passe par `env` du sous-processus, jamais en tête de commande. */
function hookRefuse(ligne: LigneEnv): boolean {
  const env: Record<string, string> = {};
  for (const cle of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT']) {
    const v = process.env[cle];
    if (v !== undefined) env[cle] = v;
  }
  for (const [cle, v] of Object.entries(ligne)) if (v !== undefined) env[cle] = v;
  const r = spawnSync(process.execPath, [HOOK_ENV], {
    input: JSON.stringify({ tool_input: { command: 'echo' } }),
    env,
    encoding: 'utf8',
  });
  expect([0, 2], `hook-env a rendu ${r.status} : ${r.stderr}`).toContain(r.status);
  return r.status === 2;
}

function notifieurRefuse(ligne: LigneEnv): boolean {
  try {
    creerNotifieur({ env: ligne, journal: journalCapture().journal, transports: [] });
    return false;
  } catch (e) {
    expect(e).toMatchObject({ motif: 'notify_sink_requis' });
    return true;
  }
}

describe('REQ-QA-024 — le notifieur refuse de partir hors production sans NOTIFY_SINK=true', () => {
  it('REQ-QA-024 : le notifieur refuse EXACTEMENT là où hook-env.js refuse, sur toute la matrice', () => {
    const divergences = MATRICE.filter((l) => hookRefuse(l) !== notifieurRefuse(l)).map((l) =>
      JSON.stringify(l)
    );
    expect(divergences, 'environnements où le notifieur et le hook divergent').toEqual([]);
    const refus = MATRICE.filter(notifieurRefuse).length;
    expect(refus).toBeGreaterThan(0);
    expect(refus).toBeLessThan(MATRICE.length);
    console.log(
      `${MATRICE.length} environnements confrontés au hook, ${refus} refusés par les deux`
    );
  });

  it('REQ-QA-024 : une préversion (NODE_ENV=production, PARTNERS_ENV=preview) est hors production', () => {
    expect(productionDeclaree({ NODE_ENV: 'production', PARTNERS_ENV: 'preview' })).toBe(false);
    expect(productionDeclaree({ NODE_ENV: 'production', PARTNERS_ENV: 'production' })).toBe(true);
  });

  it('REQ-QA-024 : NOTIFY_SINK=true — le message va au puits, caviardé, jamais aux transports', async () => {
    const envoyes: Notification[] = [];
    const { journal, texte, lignes } = journalCapture();
    const notifieur = creerNotifieur({
      env: { NODE_ENV: 'development', PARTNERS_ENV: 'local', NOTIFY_SINK: 'true' },
      journal,
      transports: [{ nom: 'essai', envoyer: async (n) => void envoyes.push(n) }],
    });
    await notifieur.notifier({ sujet: 'Relance jean@x.fr', corps: 'Jean Dupont, 06 12 34 56 78' });
    expect(envoyes).toEqual([]);
    expect(texte()).not.toContain('jean@x.fr');
    expect(texte()).not.toContain('Dupont');
    expect(lignes()[0]).toMatchObject({ msg: 'notification_retenue', sujet: 'Relance [courriel]' });
  });

  it('REQ-QA-024 : en production, les transports reçoivent le message', async () => {
    const envoyes: Notification[] = [];
    const notifieur = creerNotifieur({
      env: { NODE_ENV: 'production', PARTNERS_ENV: 'production' },
      journal: journalCapture().journal,
      transports: [{ nom: 'essai', envoyer: async (n) => void envoyes.push(n) }],
    });
    await notifieur.notifier({ sujet: 's', corps: 'c' });
    expect(envoyes).toEqual([{ sujet: 's', corps: 'c' }]);
  });

  it('REQ-QA-024 : en production AVEC NOTIFY_SINK=true — accepté, mais une ligne error le dit', () => {
    const { journal, lignes } = journalCapture();
    creerNotifieur({
      env: { NODE_ENV: 'production', PARTNERS_ENV: 'production', NOTIFY_SINK: 'true' },
      journal,
      transports: [],
    });
    expect(lignes()[0]).toMatchObject({ level: 50, msg: 'notifications_retenues_en_production' });
  });
});
