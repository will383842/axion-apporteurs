// @req REQ-SEC-024
/**
 * `pii-formes.spec.ts` — les FORMES de `src/server/securite/pii.ts`, jugées en processus.
 *
 * POURQUOI UN FICHIER À PART. Le juge du chiffrement (`chiffrement-avec-aad.spec.ts`) importe aussi la
 * garde `securite:schema-pii`, qui lit le dépôt git : dans le bac à sable de la mutation, ce n'est pas
 * un dépôt, et aucun de ses témoins ne compte. Celui-ci n'importe que le module et `src/lib/` : il est
 * jugé par la mutation.
 *
 * CE QU'IL PROUVE, valeur exacte par valeur exacte :
 *   1. le FORMAT d'un bloc (version ‖ kid ‖ IV ‖ étiquette ‖ chiffré) et son AAD, contre un bloc
 *      ASSEMBLÉ ICI avec `node:crypto` — pas seulement un aller-retour, qui passerait avec deux erreurs
 *      symétriques ;
 *   2. chaque normalisation d'empreinte, ses bords et ses refus, motif ET message ;
 *   3. le chemin d'écriture : un champ absent n'écrit rien, une ligne incomplète est refusée.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { cleIbanValide } from '../../../src/lib/forme-iban';
import {
  BlocIllisiblePii,
  CleInconnuePii,
  CleInvalidePii,
  EntreeRefuseePii,
  clesPii,
  colonnesPii,
  decryptPii,
  empreinteRecherche,
  empreinteSousCle,
  encryptPii,
  normaliserSegmentDeNom,
  type LignePii,
  type TypeEmpreinte,
} from '../../../src/server/securite/pii';

// ── l'environnement de TEST, dérivé des noms de src/lib/env.ts ───────────────────────────────────────

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const valeurTemoin = (nom: string): string => `temoin-formes-${nom.toLowerCase()}-`.padEnd(48, '0');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(NOMS_DES_SECRETS.map((n) => [n, valeurTemoin(n)])),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const CLES = clesPii(ENV);
const LIGNE: LignePii = { modele: 'Apporteur', champ: 'nomChiffre', id: 'id-temoin-1' };

/** L'erreur levée par `f`, ou un échec si rien n'est levé. */
function levee(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error('aucune levée');
}

/** Le refus d'une empreinte : son motif et son message, exacts. */
function refus(type: TypeEmpreinte, valeur: string): { motif: string; message: string } {
  const e = levee(() => empreinteRecherche(type, valeur, CLES));
  expect(e).toBeInstanceOf(EntreeRefuseePii);
  const r = e as EntreeRefuseePii;
  return { motif: r.motif, message: r.message };
}

/** L'empreinte attendue d'une valeur DÉJÀ normalisée, recalculée ici depuis le format écrit. */
const attendue = (type: TypeEmpreinte, normalise: string): string =>
  createHmac('sha256', CLES.empreintes)
    .update(['partners.empreinte.v1', type, normalise].join('\u001f'), 'utf8')
    .digest('hex');

/** Un IBAN à clé valide, ASSEMBLÉ à l'exécution : la clé est cherchée par la règle du dépôt. */
const ibanTemoin = (): string => {
  const compte = `TEMOINFORMES${'0'.repeat(11)}`;
  for (let c = 2; c <= 98; c++) {
    const candidat = `FR${String(c).padStart(2, '0')}${compte}`;
    if (cleIbanValide(candidat)) return candidat;
  }
  throw new Error('aucune clé de contrôle trouvée pour le compte témoin');
};

// ── 1. le format du bloc ─────────────────────────────────────────────────────────────────────────

/** Un bloc assemblé À LA MAIN, au format version 1, sous l'AAD écrite par le format. */
function blocALaMain(ligne: LignePii, clair: string): Uint8Array {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(CLE_HEX, 'hex'), iv, { authTagLength: 16 });
  c.setAAD(
    Buffer.from(JSON.stringify(['partners.pii', 1, ligne.modele, ligne.champ, ligne.id]), 'utf8')
  );
  const chiffre = Buffer.concat([c.update(clair, 'utf8'), c.final()]);
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([1]),
      Buffer.from(kidDe(CLE_HEX), 'hex'),
      iv,
      c.getAuthTag(),
      chiffre,
    ])
  );
}

describe('REQ-SEC-024 — le format du bloc, confronté à un bloc assemblé à la main', () => {
  it('REQ-SEC-024 : un bloc assemblé à la main se déchiffre — algorithme, clé hexadécimale, positions et AAD', () => {
    expect(decryptPii(LIGNE, blocALaMain(LIGNE, 'Élodie Ü'), CLES)).toBe('Élodie Ü');
  });

  it('REQ-SEC-024 : le bloc produit porte la version, le kid, puis IV, étiquette et chiffré aux bonnes longueurs', () => {
    const bloc = Buffer.from(encryptPii(LIGNE, 'Zoé', CLES));
    expect(bloc[0]).toBe(1);
    expect(bloc.subarray(1, 5).toString('hex')).toBe(kidDe(CLE_HEX));
    expect(bloc.length).toBe(1 + 4 + 12 + 16 + Buffer.byteLength('Zoé', 'utf8'));
    expect(CLES.chiffrement.kid).toBe(kidDe(CLE_HEX));
    expect(Buffer.from(CLES.chiffrement.octets).toString('hex')).toBe(CLE_HEX);
  });

  it('REQ-SEC-024 : un bloc produit se déchiffre à la main sous l’AAD du format', () => {
    const bloc = Buffer.from(encryptPii(LIGNE, 'Noël à Évry', CLES));
    const d = createDecipheriv('aes-256-gcm', Buffer.from(CLE_HEX, 'hex'), bloc.subarray(5, 17), {
      authTagLength: 16,
    });
    d.setAAD(
      Buffer.from(JSON.stringify(['partners.pii', 1, LIGNE.modele, LIGNE.champ, LIGNE.id]), 'utf8')
    );
    d.setAuthTag(bloc.subarray(17, 33));
    expect(Buffer.concat([d.update(bloc.subarray(33)), d.final()]).toString('utf8')).toBe(
      'Noël à Évry'
    );
  });

  it('REQ-SEC-024 : un bloc trop court ou d’une autre version est illisible, et le message nomme la ligne', () => {
    const e = levee(() => decryptPii(LIGNE, Uint8Array.from([1, 2, 3]), CLES));
    expect(e).toBeInstanceOf(BlocIllisiblePii);
    expect((e as BlocIllisiblePii).message).toBe(
      'bloc_illisible : Apporteur.nomChiffre (id id-temoin-1) ne porte pas un bloc au format version 1'
    );
  });

  it('REQ-SEC-024 : un bloc d’une autre clé est refusé, nommé, avec la ligne', () => {
    const bloc = Buffer.from(encryptPii(LIGNE, 'x', CLES));
    bloc[1] = bloc[1]! ^ 0xff;
    const e = levee(() => decryptPii(LIGNE, Uint8Array.from(bloc), CLES));
    expect(e).toBeInstanceOf(CleInconnuePii);
    expect((e as CleInconnuePii).message).toBe(
      'cle_inconnue : Apporteur.nomChiffre (id id-temoin-1) a été chiffré sous une autre clé'
    );
  });

  it('REQ-SEC-024 : le déchiffrement refuse une ligne incomplète, avec son message', () => {
    const bloc = encryptPii(LIGNE, 'x', CLES);
    const e = levee(() => decryptPii({ ...LIGNE, modele: '' }, bloc, CLES));
    expect(e).toBeInstanceOf(EntreeRefuseePii);
    expect((e as EntreeRefuseePii).message).toBe(
      'ligne_incomplete : le modèle, le champ et l’identifiant de la ligne sont tous exigés'
    );
  });

  it('REQ-SEC-024 : un environnement refusé lève cle_invalide, ses refus joints par « ; »', () => {
    const e = levee(() => clesPii({ NODE_ENV: 'test' }));
    expect(e).toBeInstanceOf(CleInvalidePii);
    const r = e as CleInvalidePii;
    expect(r.motif).toBe('cle_invalide');
    expect(r.message).toMatch(/^cle_invalide : environnement refusé par src\/lib\/env\.ts — /);
    expect(r.message).toContain(' ; ');
  });
});

// ── 2. les normalisations d'empreinte ────────────────────────────────────────────────────────────

describe('REQ-SEC-024 — chaque empreinte normalise ce qu’elle doit, et refuse le reste', () => {
  it('REQ-SEC-024 : courriel — bords, casse ; une seule arobase entre deux parties non vides', () => {
    expect(empreinteRecherche('courriel', '  Ab.Cd@Exemple.Invalid ', CLES)).toBe(
      attendue('courriel', 'ab.cd@exemple.invalid')
    );
    for (const faux of ['ab@cd@ef', 'abcd', '@cd', 'ab@', 'a b@cd', 'ab@c d']) {
      expect(refus('courriel', faux)).toEqual({
        motif: 'courriel_invalide',
        message: "courriel_invalide : le courriel hors forme : aucune empreinte n'est calculée",
      });
    }
  });

  it('REQ-SEC-024 : téléphone — national français, séparateurs, international par + et 00', () => {
    const fr = attendue('telephone', '+33639981234');
    expect(empreinteRecherche('telephone', '06 39 98 12 34', CLES)).toBe(fr);
    expect(empreinteRecherche('telephone', '06.39.98-12-34', CLES)).toBe(fr);
    expect(empreinteRecherche('telephone', '(06)39981234', CLES)).toBe(fr);
    expect(empreinteRecherche('telephone', '+33 6 39 98 12 34', CLES)).toBe(fr);
    expect(empreinteRecherche('telephone', '0033639981234', CLES)).toBe(fr);
    expect(empreinteRecherche('telephone', '+12', CLES)).toBe(attendue('telephone', '+12'));
  });

  it('REQ-SEC-024 : téléphone — refusés : indicatif en 0, trop long, trop court, lettres, 0 gardé après +33, national de onze chiffres', () => {
    for (const faux of [
      '+0639981234',
      '+1234567890123456',
      '+1',
      '+33a39981234',
      '+33 (0)6 39 98 12 34',
      '063998123456',
      'abc',
      '/0639981234',
    ]) {
      expect(refus('telephone', faux)).toEqual({
        motif: 'telephone_invalide',
        message: "telephone_invalide : le téléphone hors forme : aucune empreinte n'est calculée",
      });
    }
  });

  it('REQ-SEC-024 : IBAN — espaces et casse ; tout caractère hors [A-Z0-9], en tête ou en queue, est refusé', () => {
    const iban = ibanTemoin();
    expect(empreinteRecherche('iban', iban.toLowerCase().replace(/(.{4})/g, '$1 '), CLES)).toBe(
      attendue('iban', iban)
    );
    for (const faux of [`*${iban}`, `${iban}*`, 'FR00TEMOIN']) {
      expect(refus('iban', faux)).toEqual({
        motif: 'iban_invalide',
        message: "iban_invalide : l’IBAN hors forme : aucune empreinte n'est calculée",
      });
    }
  });

  it('REQ-SEC-024 : SIRET — quatorze chiffres exactement, espaces retirés', () => {
    expect(empreinteRecherche('siret', '000 000 001 00012', CLES)).toBe(
      attendue('siret', '00000000100012')
    );
    for (const faux of ['000000001000123', 'x00000000100012', '0000000010001', '0000000010001x']) {
      expect(refus('siret', faux)).toEqual({
        motif: 'siret_invalide',
        message: "siret_invalide : le SIRET hors forme : aucune empreinte n'est calculée",
      });
    }
  });

  it('REQ-SEC-024 : un segment de nom — diacritiques retirés, majuscules, ponctuation réduite à UNE espace', () => {
    expect(normaliserSegmentDeNom('Émile')).toBe('EMILE');
    expect(normaliserSegmentDeNom(' Jean--Émile ')).toBe('JEAN EMILE');
    expect(normaliserSegmentDeNom('o’Brien')).toBe('O BRIEN');
  });

  it('REQ-SEC-024 : nom de personne — segments normalisés un à un, séparation gardée ; tout vide refusé', () => {
    expect(empreinteRecherche('nom_personne', 'jean\u001fPaul-Martin', CLES)).toBe(
      attendue('nom_personne', 'JEAN\u001fPAUL MARTIN')
    );
    expect(empreinteRecherche('nom_personne', '\u001fMartin', CLES)).toBe(
      attendue('nom_personne', '\u001fMARTIN')
    );
    for (const faux of ['', '  ', '\u001f', ' -\u001f. ']) {
      expect(refus('nom_personne', faux)).toEqual({
        motif: 'nom_personne_invalide',
        message: "nom_personne_invalide : le nom hors forme : aucune empreinte n'est calculée",
      });
    }
  });

  it('REQ-SEC-024 : en-tête de navigateur — bords retirés, blancs réduits à une espace ; vide refusé', () => {
    expect(empreinteRecherche('agent', '  Navigateur   Temoin\t1.0 ', CLES)).toBe(
      attendue('agent', 'Navigateur Temoin 1.0')
    );
    expect(empreinteSousCle('agent', 'a  b', CLES.empreintes)).toBe(attendue('agent', 'a b'));
    for (const faux of ['', ' \t ']) {
      expect(refus('agent', faux)).toEqual({
        motif: 'agent_invalide',
        message:
          "agent_invalide : l’en-tête de navigateur hors forme : aucune empreinte n'est calculée",
      });
    }
  });

  it('REQ-SEC-024 : la même chaîne donne une empreinte différente selon son type', () => {
    expect(empreinteRecherche('agent', 'AB', CLES)).not.toBe(
      empreinteRecherche('nom_personne', 'AB', CLES)
    );
  });
});

// ── 3. le chemin d'écriture ──────────────────────────────────────────────────────────────────────

describe('REQ-SEC-024 — colonnesPii n’écrit que ce qui est fourni, et refuse une ligne incomplète', () => {
  it('REQ-SEC-024 : un champ ABSENT n’écrit rien ; null efface le bloc et l’empreinte', () => {
    const c = colonnesPii(
      { modele: 'Apporteur', id: 'id-temoin-2' },
      { email: undefined, telephone: null, nom: 'Martin' },
      CLES
    );
    expect(Object.keys(c).sort()).toEqual(['id', 'nomChiffre', 'phoneHash', 'telephoneChiffre']);
    expect(c.telephoneChiffre).toBeNull();
    expect(c.phoneHash).toBeNull();
    expect(
      decryptPii(
        { modele: 'Apporteur', champ: 'nomChiffre', id: 'id-temoin-2' },
        c.nomChiffre!,
        CLES
      )
    ).toBe('Martin');
  });

  it('REQ-SEC-024 : une ligne sans identifiant est refusée avant toute écriture', () => {
    const e = levee(() => colonnesPii({ modele: 'Apporteur', id: '' }, { nom: 'Martin' }, CLES));
    expect(e).toBeInstanceOf(EntreeRefuseePii);
    expect((e as EntreeRefuseePii).motif).toBe('ligne_incomplete');
  });
});
