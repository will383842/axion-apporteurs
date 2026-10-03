// @req REQ-SEC-061
// @req REQ-SEC-024
/**
 * SEC-40 (REQ-SEC-061) — les jetons de confirmation, sur une base SIMULÉE : ce qui se juge sans
 * base, et ce qui doit se décider AVANT toute lecture de la base.
 *
 * CE QU'IL PROUVE.
 *   — Le tirage : 32 octets d'aléa (256 bits) par jeton, en base64url, le « Oui » jamais égal au
 *     « Non » ; l'empreinte est un HMAC-SHA-256 séparé par domaine, sous un secret : la confirmation
 *     et la page des droits ne partagent jamais une empreinte, un autre secret en donne une autre.
 *   — Les en-têtes de la page : `Referrer-Policy: no-referrer` et `X-Robots-Tag: noindex`, posés
 *     dans CE fichier de test en littéraux (le témoin ne relit pas la liste qu'il juge).
 *   — Un jeton hors forme ne touche PAS la base, et rend la réponse « sans suite » : la MÊME, octet
 *     pour octet, qu'un jeton bien formé que la base ne connaît pas.
 *   — Le débit : le compteur est consulté avec l'empreinte de l'adresse, jamais l'adresse ; un
 *     refus (ou une adresse illisible) répond sans lire la base.
 *   — Aucun jeton dans un journal : ni la console ni la sortie d'erreur ne le reçoivent, sur aucun
 *     chemin, et le module n'appelle aucun journal.
 *
 * Secrets et jetons tirés à l'exécution ; aucune valeur réelle.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ENTETES_DE_LA_PAGE_DE_CONFIRMATION,
  REPONSE_SANS_SUITE,
  REPONSE_A_REESSAYER,
  consommerLeJeton,
  empreinteDuJetonDeConfirmation,
  empreinteDuJetonDesDroits,
  ouvrirLaPageDesDroits,
  ouvrirLeLien,
  tirerLesJetonsDeLaDemande,
  tirerUnJeton,
  type PortsDesJetons,
} from '../../../src/server/confirmation/jetons';
import { clesPii, encryptPii } from '../../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../../src/server/auth/lien-magique-depot';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const SECRET = randomBytes(32).toString('hex');
const EMPREINTE_IP = randomBytes(8).toString('hex');
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-40-u-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

/** Une base qui LÈVE au premier contact, et qui compte les contacts. */
function baseInterdite() {
  let contacts = 0;
  const leve = () => {
    contacts += 1;
    throw new Error('la base a été touchée');
  };
  const tx = { $queryRaw: leve, $executeRaw: leve, $queryRawUnsafe: leve, $executeRawUnsafe: leve };
  const prisma = { $transaction: leve, ...tx };
  return {
    prisma: prisma as never,
    tx: tx as never,
    contacts: () => contacts,
  };
}

/** Une base qui ne connaît AUCUN jeton : toute lecture rend zéro ligne. */
function baseVide() {
  const vide = () => Promise.resolve([]);
  const tx = { $queryRaw: vide, $executeRaw: () => Promise.resolve(0) };
  const prisma = { $transaction: (f: (t: unknown) => unknown) => Promise.resolve(f(tx)) };
  return {
    prisma: prisma as never,
    tx: tx as never,
  };
}

/** Une base qui rend les lignes données à toute lecture, et qui ENREGISTRE chaque requête. */
function baseQuiRepond(lignes: unknown[]) {
  const appels: { sql: string; valeurs: unknown[] }[] = [];
  const enregistrer =
    (rendu: unknown) =>
    (morceaux: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push({ sql: morceaux.join('?').replace(/\s+/g, ' '), valeurs });
      return Promise.resolve(rendu);
    };
  const tx = { $queryRaw: enregistrer(lignes), $executeRaw: enregistrer(1) };
  const prisma = { $transaction: (f: (t: unknown) => unknown) => Promise.resolve(f(tx)) };
  return { prisma: prisma as never, tx: tx as never, appels };
}

function ports(verdict: { autorise: boolean; panne: boolean }): PortsDesJetons & {
  sujets: string[];
} {
  const sujets: string[] = [];
  return {
    secret: SECRET,
    cles: CLES,
    sujets,
    compterAdresse(sujet) {
      sujets.push(sujet);
      return Promise.resolve(verdict);
    },
  };
}
const ADMIS = { autorise: true, panne: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SEC-40 — le tirage et l’empreinte', () => {
  it('REQ-SEC-061 : TÉMOIN — un jeton porte 256 bits d’aléa, en base64url de 43 caractères, et ne se répète pas', () => {
    const tires = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const j = tirerUnJeton();
      expect(j).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(j, 'base64url')).toHaveLength(32);
      tires.add(j);
    }
    expect(tires.size).toBe(2000);
  });

  it('REQ-SEC-061 : TÉMOIN — deux jetons par demande, le « Oui » jamais égal au « Non », chacun avec SON empreinte', () => {
    for (let i = 0; i < 200; i++) {
      const { oui, non } = tirerLesJetonsDeLaDemande(SECRET);
      expect(oui.jeton).not.toBe(non.jeton);
      expect(oui.empreinte).not.toBe(non.empreinte);
      expect(oui.empreinte).toBe(empreinteDuJetonDeConfirmation(oui.jeton, SECRET));
      expect(non.empreinte).toBe(empreinteDuJetonDeConfirmation(non.jeton, SECRET));
    }
  });

  it('REQ-SEC-061 : TÉMOIN — l’empreinte est un HMAC-SHA-256 séparé par domaine : jamais le jeton, jamais la même pour les droits', () => {
    const j = tirerUnJeton();
    const attendue = createHmac('sha256', SECRET)
      .update(`partners.confirmation.v1\u001f${j}`)
      .digest('hex');
    expect(empreinteDuJetonDeConfirmation(j, SECRET)).toBe(attendue);
    expect(empreinteDuJetonDeConfirmation(j, SECRET)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteDuJetonDesDroits(j, SECRET)).toBe(
      createHmac('sha256', SECRET).update(`partners.droits.v1\u001f${j}`).digest('hex')
    );
    expect(empreinteDuJetonDesDroits(j, SECRET)).not.toBe(
      empreinteDuJetonDeConfirmation(j, SECRET)
    );
    // Un accès en écriture à la base ne fabrique pas un lien : sans le secret, une autre empreinte.
    expect(empreinteDuJetonDeConfirmation(j, `${SECRET}x`)).not.toBe(attendue);
  });
});

describe('SEC-40 — la page', () => {
  it('REQ-SEC-061 : TÉMOIN — la page porte `Referrer-Policy: no-referrer` et `X-Robots-Tag: noindex`', () => {
    expect(ENTETES_DE_LA_PAGE_DE_CONFIRMATION['Referrer-Policy']).toBe('no-referrer');
    expect(ENTETES_DE_LA_PAGE_DE_CONFIRMATION['X-Robots-Tag']).toBe('noindex');
  });

  it('REQ-SEC-061 : TÉMOIN — un jeton hors forme ne touche pas la base et rend « sans suite », à l’ouverture comme à la réponse', async () => {
    for (const forge of [
      '',
      'abc',
      `${tirerUnJeton()}=`,
      `!${tirerUnJeton()}`,
      tirerUnJeton().slice(1),
      '../../etc',
      'é'.repeat(43),
    ]) {
      const b = baseInterdite();
      const requete = { jeton: forge, empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 };
      expect(await ouvrirLeLien(b.prisma, requete, ports(ADMIS))).toBe(REPONSE_SANS_SUITE);
      expect(await consommerLeJeton(b.tx, requete, ports(ADMIS))).toBe(REPONSE_SANS_SUITE);
      expect(await ouvrirLaPageDesDroits(b.prisma, requete, ports(ADMIS))).toBe(REPONSE_SANS_SUITE);
      expect(b.contacts()).toBe(0);
    }
  });

  it('REQ-SEC-061 : TÉMOIN — jeton forgé hors forme et jeton bien formé inconnu : la MÊME réponse, octet pour octet', async () => {
    const requete = (jeton: string) => ({ jeton, empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 });
    const forge = await ouvrirLeLien(baseInterdite().prisma, requete('forge'), ports(ADMIS));
    const inconnu = await ouvrirLeLien(baseVide().prisma, requete(tirerUnJeton()), ports(ADMIS));
    const inconnuPost = await consommerLeJeton(
      baseVide().tx,
      requete(tirerUnJeton()),
      ports(ADMIS)
    );
    const droits = await ouvrirLaPageDesDroits(
      baseVide().prisma,
      requete(tirerUnJeton()),
      ports(ADMIS)
    );
    expect(JSON.stringify(forge)).toBe(JSON.stringify(inconnu));
    expect(JSON.stringify(inconnuPost)).toBe(JSON.stringify(inconnu));
    expect(JSON.stringify(droits)).toBe(JSON.stringify(inconnu));
    expect(Object.isFrozen(REPONSE_SANS_SUITE)).toBe(true);
    // La réponse ne porte que son état : aucun identifiant, aucune raison.
    expect(Object.keys(REPONSE_SANS_SUITE)).toEqual(['etat']);
  });
});

describe('SEC-40 — un jeton bien formé, sur une base simulée qui répond', () => {
  const ID = '0b5a7e1c-0000-4000-8000-000000000001';
  const bloc = (champ: string, clair: string) =>
    encryptPii({ modele: MODELE_APPORTEUR, champ, id: ID }, clair, CLES);
  const requete = (jeton: string) => ({ jeton, empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 });

  it('REQ-SEC-061 : TÉMOIN — l’ouverture lit en LECTURE SEULE, sous ses conditions, et ne révèle que l’entreprise, l’apporteur et le sens', async () => {
    const jeton = tirerUnJeton();
    for (const [oui, sens] of [
      [true, 'oui'],
      [false, 'non'],
    ] as const) {
      const b = baseQuiRepond([
        {
          oui,
          entreprise: 'Entreprise Témoin SAS',
          apporteur_id: ID,
          nom: bloc('nomChiffre', 'Témoin'),
          prenom: bloc('prenomChiffre', 'Camille'),
        },
      ]);
      expect(await ouvrirLeLien(b.prisma, requete(jeton), ports(ADMIS))).toEqual({
        etat: 'a_repondre',
        sens,
        entreprise: 'Entreprise Témoin SAS',
        apporteur: { prenom: 'Camille', nom: 'Témoin' },
      });
      expect(b.appels).toHaveLength(2);
      expect(b.appels[0]!.sql).toBe('SET TRANSACTION READ ONLY');
      const lecture = b.appels[1]!;
      for (const condition of [
        'e.revoquee_at IS NULL',
        "d.etat = 'envoyee'",
        'd.repondu_at IS NULL',
        "a.statut = 'provisoire'",
      ]) {
        expect(lecture.sql).toContain(condition);
      }
      // La base ne reçoit que l'EMPREINTE : jamais le jeton.
      expect(lecture.valeurs).toContain(empreinteDuJetonDeConfirmation(jeton, SECRET));
      expect(JSON.stringify(b.appels)).not.toContain(jeton);
    }
  });

  it('REQ-SEC-061 : TÉMOIN — un apporteur sans nom chiffré : la page le dit vide, elle n’invente rien', async () => {
    const b = baseQuiRepond([
      { oui: true, entreprise: null, apporteur_id: ID, nom: null, prenom: null },
    ]);
    expect(await ouvrirLeLien(b.prisma, requete(tirerUnJeton()), ports(ADMIS))).toEqual({
      etat: 'a_repondre',
      sens: 'oui',
      entreprise: null,
      apporteur: { prenom: null, nom: null },
    });
  });

  it('REQ-SEC-061 : TÉMOIN — la réponse est UNE écriture conditionnelle, puis l’empreinte du clic sur SON émission', async () => {
    const jeton = tirerUnJeton();
    for (const [oui, sens] of [
      [true, 'oui'],
      [false, 'non'],
    ] as const) {
      const b = baseQuiRepond([{ demande_id: 'd-1', emission_id: 'e-1', oui }]);
      expect(await consommerLeJeton(b.tx, requete(jeton), ports(ADMIS))).toEqual({
        etat: 'retenue',
        demandeId: 'd-1',
        sens,
      });
      expect(b.appels).toHaveLength(2);
      const [ecriture, clic] = b.appels;
      expect(ecriture!.sql).toMatch(
        /^ UPDATE demandes_confirmation d SET repondu_at = clock_timestamp\(\)/
      );
      for (const condition of [
        'e.revoquee_at IS NULL',
        "d.etat = 'envoyee'",
        'd.repondu_at IS NULL',
        "a.statut = 'provisoire'",
      ]) {
        expect(ecriture!.sql).toContain(condition);
      }
      expect(clic!.sql).toContain('UPDATE emissions_demande_confirmation SET clic_ip_hash = ?');
      expect(clic!.sql).toContain('clic_ip_hash IS NULL');
      expect(clic!.valeurs).toEqual([EMPREINTE_IP, 'e-1']);
      expect(JSON.stringify(b.appels)).not.toContain(jeton);
    }
  });

  it('REQ-SEC-061 : TÉMOIN — la page des droits lit en LECTURE SEULE l’empreinte du domaine des droits, contact non purgé', async () => {
    const jeton = tirerUnJeton();
    const b = baseQuiRepond([{ id: 'a-1' }]);
    expect(await ouvrirLaPageDesDroits(b.prisma, requete(jeton), ports(ADMIS))).toEqual({
      etat: 'a_exercer',
      attributionId: 'a-1',
    });
    expect(b.appels).toHaveLength(2);
    expect(b.appels[0]!.sql).toBe('SET TRANSACTION READ ONLY');
    expect(b.appels[1]!.sql).toContain('jeton_droits_hash = ?');
    expect(b.appels[1]!.sql).toContain('contact_purge_at IS NULL');
    expect(b.appels[1]!.valeurs).toEqual([empreinteDuJetonDesDroits(jeton, SECRET)]);
  });
});

describe('SEC-40 — le débit, par empreinte d’adresse', () => {
  it('REQ-SEC-061 : TÉMOIN — le compteur reçoit l’EMPREINTE de l’adresse, avant toute lecture de la base', async () => {
    const p = ports(ADMIS);
    const requete = { jeton: tirerUnJeton(), empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 };
    await ouvrirLeLien(baseVide().prisma, requete, p);
    await consommerLeJeton(baseVide().tx, requete, p);
    await ouvrirLaPageDesDroits(baseVide().prisma, requete, p);
    expect(p.sujets).toEqual([EMPREINTE_IP, EMPREINTE_IP, EMPREINTE_IP]);
  });

  it('REQ-SEC-061 : TÉMOIN — un débit refusé, ou un compteur en panne, répond « à réessayer » sans lire la base', async () => {
    for (const verdict of [
      { autorise: false, panne: false },
      { autorise: false, panne: true },
      // Un compteur déclaré `laisser-passer` rend `autorise: true` PENDANT la panne : la page ne
      // s'ouvre pas pour autant (note de la lentille sécurité sur #567).
      { autorise: true, panne: true },
    ]) {
      const b = baseInterdite();
      const requete = { jeton: tirerUnJeton(), empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 };
      expect(await ouvrirLeLien(b.prisma, requete, ports(verdict))).toBe(REPONSE_A_REESSAYER);
      expect(await consommerLeJeton(b.tx, requete, ports(verdict))).toBe(REPONSE_A_REESSAYER);
      expect(await ouvrirLaPageDesDroits(b.prisma, requete, ports(verdict))).toBe(
        REPONSE_A_REESSAYER
      );
      expect(b.contacts()).toBe(0);
    }
  });

  it('REQ-SEC-024 : TÉMOIN — une adresse illisible (empreinte absente) n’ouvre pas un seau commun : refusée, compteur non appelé', async () => {
    const b = baseInterdite();
    const p = ports(ADMIS);
    const requete = { jeton: tirerUnJeton(), empreinteAdresse: null, maintenantMs: 0 };
    expect(await ouvrirLeLien(b.prisma, requete, p)).toBe(REPONSE_A_REESSAYER);
    expect(await consommerLeJeton(b.tx, requete, p)).toBe(REPONSE_A_REESSAYER);
    expect(p.sujets).toEqual([]);
    expect(b.contacts()).toBe(0);
  });

  it('REQ-SEC-061 : TÉMOIN — le refus de débit ne dépend pas du jeton : un jeton forgé reçoit le même refus', async () => {
    const refuse = { autorise: false, panne: false };
    const a = await ouvrirLeLien(
      baseInterdite().prisma,
      { jeton: 'forge', empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 },
      ports(refuse)
    );
    const b = await ouvrirLeLien(
      baseInterdite().prisma,
      { jeton: tirerUnJeton(), empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 },
      ports(refuse)
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('SEC-40 — aucun jeton dans un journal', () => {
  it('REQ-SEC-061 : TÉMOIN — ni la console ni la sortie d’erreur ne reçoivent le jeton, sur aucun chemin', async () => {
    const sorties: string[] = [];
    const capter = (...args: unknown[]) => {
      sorties.push(args.map(String).join(' '));
      return true;
    };
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation(capter);
    }
    vi.spyOn(process.stderr, 'write').mockImplementation(capter as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(capter as never);
    const jeton = tirerUnJeton();
    const requete = { jeton, empreinteAdresse: EMPREINTE_IP, maintenantMs: 0 };
    await ouvrirLeLien(baseVide().prisma, requete, ports(ADMIS));
    await consommerLeJeton(baseVide().tx, requete, ports(ADMIS));
    await ouvrirLaPageDesDroits(baseVide().prisma, requete, ports(ADMIS));
    await ouvrirLeLien(baseVide().prisma, requete, ports({ autorise: false, panne: true }));
    vi.restoreAllMocks();
    expect(sorties.filter((s) => s.includes(jeton))).toEqual([]);
  });

  it('REQ-SEC-061 : TÉMOIN — le module n’appelle aucun journal : ni `console`, ni `process.stderr`, ni un journaliseur', () => {
    const source = readFileSync('src/server/confirmation/jetons.ts', 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bconsole\s*\./);
    expect(code).not.toMatch(/process\s*\.\s*std(err|out)/);
    expect(code).not.toMatch(/\b(logger|journaliser|signaler)\b/);
  });
});
