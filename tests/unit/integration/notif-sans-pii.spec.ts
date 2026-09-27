// @req REQ-INT-024
/**
 * `notif-sans-pii.spec.ts` — G-SEC-NOTIF (INT-T14) : les alertes de console par le bot Telegram dédié.
 *
 * CE QU'IL TIENT (acceptation de INT-T14).
 *   1. Dédoublonnage et PLAFOND HORAIRE PAR CATÉGORIE : une alerte répétée 400 fois dans l'heure fait
 *      désarmer le canal par celui qui le lit. Le test COMPTE les envois.
 *   2. AUCUN message ne contient de coordonnée de tiers ni de lien de console : ni nom, ni courriel,
 *      ni téléphone, ni URL d'administration — ni montant, ni raison sociale (`docs/gates.json`,
 *      G-SEC-NOTIF).
 *   3. Le message porte de quoi RETROUVER l'objet — identifiant technique, catégorie, compte — et
 *      rien de plus.
 *   4. TÉMOIN À DEUX FACES sur la garde : un gabarit de bac d'essai construit sur un objet portant
 *      nom, courriel, téléphone et lien de console la fait sortir en code non nul et NOMME chaque
 *      champ qui a franchi ; les gabarits du dépôt la font sortir en zéro, avec le compte des
 *      gabarits réellement confrontés.
 *   5. TÉMOIN À DEUX FACES sur le plafond : 200 alertes de la même catégorie dans l'heure donnent au
 *      plus le nombre déclaré d'envois.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import type { Notification, Notifieur } from '../../../src/lib/notify';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import {
  type CategorieAlerte,
  GABARITS_ALERTE,
  PlafondInvalide,
  creerAlerteur,
  messageDAlerte,
} from '../../../src/server/integrations/telegram/alertes';
import {
  GABARIT_BAC_D_ESSAI,
  OBJET_TEMOIN,
  confronter,
  executer,
} from '../../../src/server/integrations/telegram/garde-sans-pii';

const HEURE = 3_600_000;
const T0 = Date.UTC(2026, 8, 27, 8, 0, 0);

/**
 * Un identifiant du format du dépôt (`@default(uuid()) @db.Uuid`, prisma/schema.prisma), le i-ème.
 * Seul ce format entre dans un message : tout autre `id` est remplacé par un marqueur neutre, et
 * tous les identifiants hors format d'une catégorie se dédoublonnent donc ensemble.
 */
const uuid = (i: number): string => `a3f1c2d4-5b6e-4f70-8a9b-${i.toString(16).padStart(12, 'c')}`;
const UUID_A = 'b7e2d9a1-4c3f-4e8a-9d1b-2f6a8c0e4b7d';
const UUID_B = 'c1d8e4f2-7a9b-4b3c-8e5d-6a2f9c1b3e8a';

/** Un notifieur qui COMPTE : c'est le nombre d'envois que le test juge, pas un booléen. */
function notifieurCompteur(): Notifieur & { envois: Notification[] } {
  const envois: Notification[] = [];
  return { envois, notifier: async (n) => void envois.push(n) };
}

/** Une horloge qu'on avance : le plafond est horaire, le test fait passer l'heure. */
function horlogeMobile(debut: number): { maintenant(): number; avancer(ms: number): void } {
  let t = debut;
  return { maintenant: () => t, avancer: (ms) => void (t += ms) };
}

describe('REQ-INT-024 — dédoublonnage et plafond horaire par catégorie', () => {
  it('REQ-INT-024 — 200 alertes de la même catégorie dans l’heure : au plus le plafond déclaré d’envois', async () => {
    const notifieur = notifieurCompteur();
    const plafondParHeure = 5;
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure });
    for (let i = 0; i < 200; i++) {
      await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(i) });
    }
    expect(notifieur.envois).toHaveLength(plafondParHeure);
  });

  it('REQ-INT-024 — CONTRE-FACE : sous le plafond, chaque alerte distincte part', async () => {
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 50 });
    for (let i = 0; i < 20; i++) {
      await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(i) });
    }
    expect(notifieur.envois).toHaveLength(20);
  });

  it('REQ-INT-024 — le plafond est PAR CATÉGORIE : une autre catégorie passe encore', async () => {
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 3 });
    for (let i = 0; i < 10; i++)
      await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(i) });
    const issue = await alerteur.alerter({ categorie: 'restauration_echouee', id: UUID_B });
    expect(issue).toBe('envoyee');
    expect(notifieur.envois).toHaveLength(4);
  });

  it('REQ-INT-024 — le dernier envoi permis DIT que la suite est retenue, et l’heure suivante rouvre', async () => {
    const notifieur = notifieurCompteur();
    const horloge = horlogeMobile(T0);
    const alerteur = creerAlerteur({ notifieur, horloge, plafondParHeure: 2 });
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(1) })).toBe('envoyee');
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(2) })).toBe('envoyee');
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(3) })).toBe('plafonnee');
    expect(notifieur.envois[1]!.corps).toMatch(/plafond horaire atteint/);
    horloge.avancer(HEURE);
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(4) })).toBe('envoyee');
    expect(notifieur.envois).toHaveLength(3);
  });

  it('REQ-INT-024 — la même alerte répétée 400 fois dans l’heure part UNE fois', async () => {
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 50 });
    const issues = new Set<string>();
    for (let i = 0; i < 400; i++) {
      issues.add(await alerteur.alerter({ categorie: 'releve_bloque', id: UUID_A }));
    }
    expect(notifieur.envois).toHaveLength(1);
    expect(issues).toEqual(new Set(['envoyee', 'dedoublonnee']));
  });

  it('REQ-INT-024 — un plafond qui n’est pas un entier positif est refusé à la construction', () => {
    for (const plafondParHeure of [0, -1, 2.5, Number.NaN]) {
      expect(() =>
        creerAlerteur({
          notifieur: notifieurCompteur(),
          horloge: horlogeFigee(T0),
          plafondParHeure,
        })
      ).toThrow(/plafond_invalide/);
    }
  });
});

describe('REQ-INT-024 — aucun message ne porte de coordonnée de tiers ni de lien de console', () => {
  it('REQ-INT-024 — le message porte l’identifiant technique, la catégorie et le compte, et rien de plus', () => {
    const texte = messageDAlerte('alerte', OBJET_TEMOIN);
    expect(texte).toContain(OBJET_TEMOIN.categorie);
    expect(texte).toContain(OBJET_TEMOIN.id);
    expect(texte).toContain(OBJET_TEMOIN.compte!);
    for (const valeur of [
      OBJET_TEMOIN.nom,
      OBJET_TEMOIN.courriel,
      OBJET_TEMOIN.telephone,
      OBJET_TEMOIN.lienConsole,
      OBJET_TEMOIN.raisonSociale,
      String(OBJET_TEMOIN.montantHtCents),
    ]) {
      expect(texte).not.toContain(valeur);
    }
    expect(texte).not.toMatch(/https?:\/\//);
  });

  it('REQ-INT-024 — un identifiant qui n’est pas technique (un courriel passé en id) n’entre pas dans le message', () => {
    const texte = messageDAlerte('alerte', {
      categorie: 'releve_bloque',
      id: 'jeanne.temoin@example.org',
      compte: '+33 6 12 34 56 78',
    });
    expect(texte).not.toContain('jeanne.temoin@example.org');
    expect(texte).not.toContain('+33 6 12 34 56 78');
    expect(texte).toMatch(/identifiant non technique/);
  });

  it('REQ-INT-024 — FACE ROUGE : le gabarit de bac d’essai est refusé, et CHAQUE champ qui a franchi est nommé', () => {
    const r = confronter({ bac_d_essai: GABARIT_BAC_D_ESSAI });
    expect(r.code).not.toBe(0);
    expect(r.confrontes).toBe(1);
    expect(r.fautes.map((f) => f.champ).sort()).toEqual(
      ['courriel', 'lienConsole', 'nom', 'telephone'].sort()
    );
    expect(r.fautes.every((f) => f.gabarit === 'bac_d_essai')).toBe(true);
  });

  it('REQ-INT-024 — FACE VERTE : les gabarits du dépôt sortent en zéro, avec le compte des gabarits confrontés', () => {
    const r = confronter(GABARITS_ALERTE);
    expect(r.fautes).toEqual([]);
    expect(r.code).toBe(0);
    // Dérivé de la table des gabarits, jamais tapé : un gabarit ajouté est confronté d'office.
    expect(r.confrontes).toBe(Object.keys(GABARITS_ALERTE).length);
    expect(r.confrontes).toBeGreaterThan(0);
  });

  it('REQ-INT-024 — la garde, lancée comme un processus, sort en zéro sur le dépôt et en non-zéro sur le bac d’essai', () => {
    const lancer = (args: string[]) =>
      spawnSync('npx', ['tsx', 'src/server/integrations/telegram/garde-sans-pii.ts', ...args], {
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
    const depot = lancer([]);
    expect(depot.status, depot.stderr).toBe(0);
    expect(depot.stdout).toMatch(
      new RegExp(`${Object.keys(GABARITS_ALERTE).length} gabarits? de message confronté`)
    );
    const bac = lancer(['--bac-d-essai']);
    expect(bac.status).not.toBe(0);
    for (const champ of ['nom', 'courriel', 'telephone', 'lienConsole']) {
      expect(bac.stdout + bac.stderr).toContain(champ);
    }
  }, 60_000);
});

describe('REQ-INT-024 — les bords de l’alerteur, chacun vu', () => {
  it('REQ-INT-024 — un plafond de UN est permis, et son unique envoi annonce la retenue', async () => {
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 1 });
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(1) })).toBe('envoyee');
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(2) })).toBe('plafonnee');
    expect(notifieur.envois).toHaveLength(1);
    expect(notifieur.envois[0]!.corps).toMatch(/plafond horaire atteint/);
  });

  it('REQ-INT-024 — sous le plafond, le message ne parle PAS de plafond, et le sujet nomme la catégorie', async () => {
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 2 });
    await alerteur.alerter({ categorie: 'releve_bloque', id: uuid(1) });
    expect(notifieur.envois[0]!.corps).not.toMatch(/plafond/);
    expect(notifieur.envois[0]!.sujet).toBe('alerte console · releve_bloque');
  });

  it('REQ-INT-024 — la même alerte, une heure pile plus tard, repart', async () => {
    const notifieur = notifieurCompteur();
    const horloge = horlogeMobile(T0);
    const alerteur = creerAlerteur({ notifieur, horloge, plafondParHeure: 50 });
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: UUID_A })).toBe('envoyee');
    horloge.avancer(HEURE - 1);
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: UUID_A })).toBe('dedoublonnee');
    horloge.avancer(1);
    expect(await alerteur.alerter({ categorie: 'releve_bloque', id: UUID_A })).toBe('envoyee');
    expect(notifieur.envois).toHaveLength(2);
  });

  it('REQ-INT-024 — le refus de plafond porte un motif fermé et un nom', () => {
    try {
      creerAlerteur({
        notifieur: notifieurCompteur(),
        horloge: horlogeFigee(T0),
        plafondParHeure: 0,
      });
      expect.unreachable('un plafond nul doit être refusé');
    } catch (e) {
      expect(e).toBeInstanceOf(PlafondInvalide);
      expect((e as PlafondInvalide).motif).toBe('plafond_invalide');
      expect((e as PlafondInvalide).name).toBe('PlafondInvalide');
    }
  });

  it('REQ-INT-024 — un identifiant qui n’est pas une chaîne est retiré ; sans compte, le message n’en parle pas', () => {
    const texte = messageDAlerte('alerte', {
      categorie: 'releve_bloque',
      id: 42 as unknown as string,
    });
    expect(texte).toBe('[releve_bloque] objet [identifiant non technique retiré]');
  });
});

describe('REQ-INT-024 — la garde voit aussi une coordonnée qui ne vient d’aucun champ du témoin', () => {
  it.each([
    ['forme_courriel', () => 'écrire à contact@example.org'],
    ['forme_url', () => 'voir https://example.org/admin'],
    ['forme_telephone', () => 'appeler le 06 12 34 56 78'],
  ])(
    'REQ-INT-024 — un gabarit qui écrit une coordonnée en dur est refusé : %s',
    (champ, gabarit) => {
      const r = confronter({ en_dur: gabarit });
      expect(r.code).toBe(1);
      expect(r.fautes).toEqual([{ gabarit: 'en_dur', champ }]);
    }
  );

  it('REQ-INT-024 — une table VIDE n’est pas un vert : code non nul, zéro confronté', () => {
    expect(confronter({})).toEqual({ code: 1, confrontes: 0, fautes: [] });
  });

  it('REQ-INT-024 — la garde en ligne de commande, jouée en processus : les trois issues', () => {
    const lignes = (): { sortie: string[]; erreur: string[] } => ({ sortie: [], erreur: [] });
    const flux = (l: { sortie: string[]; erreur: string[] }) => ({
      sortie: (x: string) => void l.sortie.push(x),
      erreur: (x: string) => void l.erreur.push(x),
    });
    const depot = lignes();
    expect(executer([], GABARITS_ALERTE, flux(depot))).toBe(0);
    expect(depot.erreur).toEqual([]);
    expect(depot.sortie).toEqual([
      `✅ G-SEC-NOTIF — ${Object.keys(GABARITS_ALERTE).length} gabarits de message confrontés à un ` +
        'objet portant nom, courriel, téléphone, lien de console, raison sociale et montant : ' +
        'aucun champ ne franchit.',
    ]);

    const un = lignes();
    expect(executer([], { seul: GABARITS_ALERTE.alerte }, flux(un))).toBe(0);
    expect(un.sortie[0]).toMatch(/^✅ G-SEC-NOTIF — 1 gabarit de message confronté à un objet/);

    const bac = lignes();
    expect(executer(['--bac-d-essai'], GABARITS_ALERTE, flux(bac))).toBe(1);
    expect(bac.sortie).toEqual([]);
    expect(bac.erreur[0]).toBe("❌ G-SEC-NOTIF — 4 champ(s) franchissent le canal d'alerte :");
    expect(bac.erreur.slice(1).sort()).toEqual(
      ['courriel', 'lienConsole', 'nom', 'telephone']
        .map((c) => `   gabarit bac_d_essai : champ ${c}`)
        .sort()
    );

    const vide = lignes();
    expect(executer([], {}, flux(vide))).toBe(1);
    expect(vide.erreur).toEqual([
      '❌ G-SEC-NOTIF — aucun gabarit confronté : un vert sur rien n’est pas un vert.',
    ]);
  });
});

describe('REQ-INT-024 — ni montant, ni raison sociale (G-SEC-NOTIF, fixture rouge du registre)', () => {
  it('REQ-INT-024 — un gabarit qui porte le montant ou la raison sociale est refusé, champ nommé', () => {
    const r = confronter({
      avec_montant: (o) => {
        const riche = o as typeof o & Record<string, unknown>;
        return `[${o.categorie}] ${String(riche.raisonSociale)} ${String(riche.montantHtCents)}`;
      },
    });
    expect(r.code).toBe(1);
    expect(r.fautes.map((f) => f.champ).sort()).toEqual(['montantHtCents', 'raisonSociale']);
  });
});

describe('REQ-INT-024 — LISTE BLANCHE : seul un identifiant du format du dépôt entre dans le message', () => {
  // Le format est celui des agrégats de `prisma/schema.prisma` : `String @id @default(uuid()) @db.Uuid`.
  // Tout autre `id` ou `compte` est remplacé par un marqueur neutre, quelle que soit sa forme.
  it.each([
    ['0612345678', 'téléphone nu'],
    ['33612345678', 'téléphone international sans +'],
    ['jeanne.temoin@example.org', 'courriel'],
    ['jeanne', 'nom en un mot'],
    ['987654', 'nombre nu'],
  ])(
    'REQ-INT-024 — TÉMOIN : « %s » (%s) en id comme en compte n’entre pas dans le message',
    async (valeur) => {
      const notifieur = notifieurCompteur();
      const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 5 });
      await alerteur.alerter({ categorie: 'releve_bloque', id: valeur, compte: valeur });
      const envoi = notifieur.envois[0]!;
      expect(`${envoi.sujet}\n${envoi.corps}`).not.toContain(valeur);
      expect(envoi.corps).toBe(
        '[releve_bloque] objet [identifiant non technique retiré] · compte [identifiant non technique retiré]'
      );
    }
  );

  it('REQ-INT-024 — CONTRE-TÉMOIN : un vrai identifiant du format du dépôt entre, en id comme en compte', () => {
    const texte = messageDAlerte('alerte', {
      categorie: 'releve_bloque',
      id: UUID_A,
      compte: UUID_B,
    });
    expect(texte).toBe(`[releve_bloque] objet ${UUID_A} · compte ${UUID_B}`);
  });
});

describe('REQ-INT-024 — la catégorie brute ne contourne ni le plafond ni le dédoublonnage', () => {
  it('REQ-INT-024 — TÉMOIN : dix catégories hors format distinctes partagent UN plafond', async () => {
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 3 });
    for (let i = 0; i < 10; i++) {
      // Le `as` est VOULU et il est le sujet du témoin. Depuis que `categorie` est une union close
      // (`CategorieAlerte`), le compilateur refuse cette valeur : c'est le premier rempart, et il
      // tient. Le témoin franchit ce rempart exprès pour éprouver le SECOND — le contrôle
      // d'exécution —, celui qui protège la donnée quand la valeur arrive d'un `any`, d'une
      // frontière non typée ou d'un appelant en JavaScript. Sans ce `as`, on ne testerait plus que
      // le compilateur, et on croirait la donnée protégée à l'exécution sans l'avoir vérifié.
      await alerteur.alerter({
        categorie: `appeler le 06123456${10 + i}` as CategorieAlerte,
        id: uuid(i),
      });
    }
    expect(notifieur.envois).toHaveLength(3);
    for (const e of notifieur.envois) expect(`${e.sujet} ${e.corps}`).not.toMatch(/06123456/);
  });

  it('REQ-INT-024 — TÉMOIN : un NOM en catégorie ne sort ni dans le corps ni dans le sujet', async () => {
    // Le scénario exact que la revue `securite` de la PR 180 a nommé : un appelant qui écrirait
    // `categorie: nom.toLowerCase()`. L'ancienne expression de FORME acceptait `jean_dupont` — des
    // mots en minuscules liés par `_` —, et le nom sortait DANS LE SUJET comme dans le corps.
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 5 });
    await alerteur.alerter({ categorie: 'jean_dupont' as CategorieAlerte, id: UUID_A });
    expect(notifieur.envois).toHaveLength(1);
    for (const e of notifieur.envois) {
      expect(
        `${e.sujet} ${e.corps}`,
        'un nom ne doit sortir ni dans le sujet ni dans le corps'
      ).not.toMatch(/jean|dupont/i);
    }
  });

  it('REQ-INT-024 — TÉMOIN : dix identifiants hors format distincts ne font partir qu’UNE alerte', async () => {
    const notifieur = notifieurCompteur();
    const alerteur = creerAlerteur({ notifieur, horloge: horlogeFigee(T0), plafondParHeure: 50 });
    for (let i = 0; i < 10; i++) {
      await alerteur.alerter({ categorie: 'releve_bloque', id: `06123456${10 + i}` });
    }
    expect(notifieur.envois).toHaveLength(1);
  });
});

describe('REQ-INT-024 — le montant est vu même formaté en euros', () => {
  it.each([
    ['9 876,54 €', 'espace et virgule'],
    ['9 876,54 €', 'format français, espace fine insécable'],
    ['9876.54 EUR', 'point décimal'],
    ['9 877 €', 'arrondi à l’euro'],
    ['9 876 €', 'tronqué à l’euro'],
  ])(
    'REQ-INT-024 — TÉMOIN : un gabarit qui écrit « %s » (%s) est refusé, champ montantHtCents nommé',
    (ecrit) => {
      const r = confronter({ en_euros: (o) => `[${o.categorie}] ${ecrit}` });
      expect(r.code).toBe(1);
      expect(r.fautes).toEqual([{ gabarit: 'en_euros', champ: 'montantHtCents' }]);
    }
  );
});
