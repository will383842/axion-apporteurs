// @req REQ-SEC-024
/**
 * chiffrement-avec-aad.spec.ts — SEC-08 : les données personnelles chiffrées, liées à leur ligne et
 * à leur champ ; les empreintes de recherche ; l'adresse réseau réduite à une empreinte tronquée.
 *
 * CE QUI EST JUGÉ ICI (phase A de SEC-08) : `src/server/securite/pii.ts`, dont les clés entrent en
 * PARAMÈTRE — aucune lecture d'environnement, donc des vecteurs déterministes. Le format et les
 * entrées des empreintes sont un CONTRAT (un octet changé rend illisibles toutes les données déjà
 * écrites) : ils sont tenus par des vecteurs figés, calculés hors de `pii.ts` selon le texte du
 * format, et non recalculés ici par le code qu'ils jugent.
 *
 * Toutes les clés sont des clés de TEST manifestes (octets 0 à 31, chaînes « cle-de-test-… ») ;
 * courriels en `example.org`, téléphones dans la tranche de fiction `06 39 98`, adresses réseau de
 * documentation (`192.0.2.0/24`, `2001:db8::/32`). Aucune coordonnée bancaire à clé valide n'est
 * écrite : les valeurs d'IBAN sont assemblées à l'exécution et leur clé est fausse.
 */

import { describe, it, expect } from 'vitest';
import {
  BlocIllisiblePii,
  CleInconnuePii,
  CleInvalidePii,
  EchecAuthentificationPii,
  EntreeRefuseePii,
  ErreurPii,
  chiffrerPii,
  dechiffrerPii,
  empreinteAdresseReseau,
  empreinteRecherche,
  type CleChiffrementPii,
  type LignePii,
} from '../../../src/server/securite/pii';

// ── clés et vecteurs de TEST ─────────────────────────────────────────────────────────────────────

const CLE: CleChiffrementPii = {
  octets: Uint8Array.from({ length: 32 }, (_, i) => i),
  kid: '5ec08a01',
};
const CLE_EMPREINTE = 'cle-de-test-sec08-empreintes-de-recherche';
const SEL_ADRESSE = 'sel-de-test-sec08-adresses-reseau-000000';

const LIGNE_A: LignePii = { modele: 'Apporteur', champ: 'courrielChiffre', id: 'apporteur_0001' };
const LIGNE_B: LignePii = { modele: 'Apporteur', champ: 'courrielChiffre', id: 'apporteur_0002' };
const CLAIR = 'alice@example.org';

/**
 * Vecteur figé : AES-256-GCM sous CLE, IV = octets 0xA0 à 0xAB, donnée authentifiée =
 * UTF-8 de JSON.stringify(["partners.pii", 1, "Apporteur", "courrielChiffre", "apporteur_0001"]),
 * rangé 0x01 ‖ kid ‖ IV ‖ étiquette ‖ chiffré. Calculé par `createCipheriv` hors de `pii.ts`.
 */
const BLOC_FIGE =
  '015ec08a01a0a1a2a3a4a5a6a7a8a9aaab1d6859e5c5f4cfd32aef66f2756aac1d8774154e208b67c70308f7bf6254afac17';
/** HMAC-SHA256(CLE_EMPREINTE, "partners.empreinte.v1" ␟ "courriel" ␟ "alice@example.org"). */
const EMPREINTE_COURRIEL = 'b1ccb113b18a94f777ce6a290b24f3c97a9ff8e7fd1ad5efc0a034438d47dcdc';
/** HMAC-SHA256(CLE_EMPREINTE, "partners.empreinte.v1" ␟ "telephone" ␟ "+33639981234"). */
const EMPREINTE_TELEPHONE = 'eaf5fa0345ca3d41a6cc12d6f78cf81693bf28ee220d90fb080e913dba237fa4';
/** HMAC-SHA256(SEL_ADRESSE, "partners.ip.v1" ␟ "192.0.2.10"), 16 premiers caractères. */
const EMPREINTE_IP4 = '8ff7bce348243167';
/** HMAC-SHA256(SEL_ADRESSE, "partners.ip.v1" ␟ "2001:db8:1:2::/64"), 16 premiers caractères. */
const EMPREINTE_IP6 = 'b312201254866226';

const depuisHex = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = (octets: Uint8Array): string => Buffer.from(octets).toString('hex');

/** Retourne un bit de l'octet `position` d'une COPIE du bloc. */
const altere = (bloc: Uint8Array, position: number): Uint8Array => {
  const copie = Uint8Array.from(bloc);
  copie[position] = (copie[position] ?? 0) ^ 0x01;
  return copie;
};

/** L'erreur levée par `f`, ou `null` si `f` a rendu une valeur. */
const erreurDe = (f: () => unknown): unknown => {
  try {
    f();
    return null;
  } catch (e) {
    return e;
  }
};

// Positions du format : version (1) ‖ kid (4) ‖ IV (12) ‖ étiquette (16) ‖ chiffré.
const DEBUT_IV = 5;
const DEBUT_ETIQUETTE = 17;
const DEBUT_CHIFFRE = 33;

describe('REQ-SEC-024 — chiffrement AES-256-GCM, bloc lié à sa ligne et à son champ', () => {
  it('REQ-SEC-024 : un bloc chiffré se déchiffre à sa place et rend le clair (face verte)', () => {
    for (const clair of [CLAIR, 'Éloïse Œuvré-Ñúñez', '']) {
      const bloc = chiffrerPii(LIGNE_A, clair, CLE);
      expect(dechiffrerPii(LIGNE_A, bloc, CLE)).toBe(clair);
    }
  });

  it('REQ-SEC-024 : le bloc de la ligne A présenté pour la ligne B échoue et nomme l’échec d’authentification', () => {
    const blocA = chiffrerPii(LIGNE_A, CLAIR, CLE);
    expect(
      () => dechiffrerPii(LIGNE_B, blocA, CLE),
      "le bloc de la ligne A s'est déchiffré sous la ligne B"
    ).toThrow(EchecAuthentificationPii);
    const e = erreurDe(() => dechiffrerPii(LIGNE_B, blocA, CLE));
    expect(e).toBeInstanceOf(EchecAuthentificationPii);
    expect(e).toMatchObject({ motif: 'echec_authentification', ...LIGNE_B });
    const message = String((e as Error).message);
    for (const nomme of [LIGNE_B.modele, LIGNE_B.champ, LIGNE_B.id]) {
      expect(message).toContain(nomme);
    }
    expect(message).not.toContain(CLAIR);
  });

  it('REQ-SEC-024 : le bloc du courriel présenté pour le téléphone de la MÊME ligne échoue', () => {
    const blocCourriel = chiffrerPii(LIGNE_A, CLAIR, CLE);
    const telephoneA: LignePii = { ...LIGNE_A, champ: 'telephoneChiffre' };
    expect(
      () => dechiffrerPii(telephoneA, blocCourriel, CLE),
      "le bloc du courriel s'est déchiffré comme téléphone de la même ligne"
    ).toThrow(EchecAuthentificationPii);
  });

  it('REQ-SEC-024 : le bloc d’un modèle présenté pour un autre modèle au même identifiant échoue', () => {
    const bloc = chiffrerPii(LIGNE_A, CLAIR, CLE);
    const contact: LignePii = { ...LIGNE_A, modele: 'Contact' };
    expect(
      () => dechiffrerPii(contact, bloc, CLE),
      "le bloc d'un apporteur s'est déchiffré comme contact"
    ).toThrow(EchecAuthentificationPii);
  });

  it('REQ-SEC-024 : un octet retourné dans le chiffré, dans l’étiquette ou dans l’IV échoue à l’authentification', () => {
    const bloc = chiffrerPii(LIGNE_A, CLAIR, CLE);
    for (const [ou, position] of [
      ['le chiffré', DEBUT_CHIFFRE + 3],
      ['l’étiquette', DEBUT_ETIQUETTE + 7],
      ['l’IV', DEBUT_IV + 2],
    ] as const) {
      expect(
        () => dechiffrerPii(LIGNE_A, altere(bloc, position), CLE),
        `un bloc altéré dans ${ou} s'est déchiffré`
      ).toThrow(EchecAuthentificationPii);
    }
  });

  it('REQ-SEC-024 : une autre clé portant le même kid échoue à l’authentification', () => {
    const bloc = chiffrerPii(LIGNE_A, CLAIR, CLE);
    const autre: CleChiffrementPii = {
      octets: Uint8Array.from(CLE.octets).reverse(),
      kid: CLE.kid,
    };
    expect(() => dechiffrerPii(LIGNE_A, bloc, autre)).toThrow(EchecAuthentificationPii);
  });

  it('REQ-SEC-024 : deux chiffrements du même clair diffèrent, IV compris (IV tiré à chaque chiffrement)', () => {
    const un = chiffrerPii(LIGNE_A, CLAIR, CLE);
    const deux = chiffrerPii(LIGNE_A, CLAIR, CLE);
    expect(hex(un), 'deux chiffrements du même clair sont identiques').not.toBe(hex(deux));
    expect(hex(un.slice(DEBUT_IV, DEBUT_ETIQUETTE)), 'IV réutilisé').not.toBe(
      hex(deux.slice(DEBUT_IV, DEBUT_ETIQUETTE))
    );
  });

  it('REQ-SEC-024 : le bloc porte la version 1, le kid de la clé, un IV de 12 octets, une étiquette de 16 et le chiffré', () => {
    const bloc = chiffrerPii(LIGNE_A, CLAIR, CLE);
    expect(bloc[0]).toBe(0x01);
    expect(hex(bloc.slice(1, DEBUT_IV))).toBe(CLE.kid);
    expect(bloc.length).toBe(DEBUT_CHIFFRE + Buffer.byteLength(CLAIR, 'utf8'));
    expect(hex(bloc)).not.toContain(Buffer.from(CLAIR, 'utf8').toString('hex'));
  });

  it('REQ-SEC-024 : un bloc figé selon le format écrit se déchiffre, et seulement sous sa ligne (vecteur déterministe)', () => {
    const bloc = depuisHex(BLOC_FIGE);
    expect(dechiffrerPii(LIGNE_A, bloc, CLE)).toBe(CLAIR);
    expect(() => dechiffrerPii(LIGNE_B, bloc, CLE)).toThrow(EchecAuthentificationPii);
  });

  it('REQ-SEC-024 : un kid étranger rend CleInconnuePii ; une version 2 et un bloc de 32 octets rendent BlocIllisiblePii', () => {
    const bloc = chiffrerPii(LIGNE_A, CLAIR, CLE);
    expect(erreurDe(() => dechiffrerPii(LIGNE_A, altere(bloc, 2), CLE))).toBeInstanceOf(
      CleInconnuePii
    );
    const autreKid: CleChiffrementPii = { octets: CLE.octets, kid: '0badc0de' };
    expect(erreurDe(() => dechiffrerPii(LIGNE_A, bloc, autreKid))).toBeInstanceOf(CleInconnuePii);

    const version2 = Uint8Array.from(bloc);
    version2[0] = 0x02;
    expect(erreurDe(() => dechiffrerPii(LIGNE_A, version2, CLE))).toBeInstanceOf(BlocIllisiblePii);
    const court = depuisHex(BLOC_FIGE).slice(0, DEBUT_CHIFFRE - 1);
    expect(erreurDe(() => dechiffrerPii(LIGNE_A, court, CLE))).toBeInstanceOf(BlocIllisiblePii);
    // 33 octets exactement = un clair vide : lisible, pas « illisible ».
    const vide = chiffrerPii(LIGNE_A, '', CLE);
    expect(vide.length).toBe(DEBUT_CHIFFRE);
    expect(dechiffrerPii(LIGNE_A, vide, CLE)).toBe('');
  });

  it('REQ-SEC-024 : une clé qui n’est pas de 32 octets, un kid qui n’est pas de 8 hexadécimaux ou une ligne incomplète sont refusés', () => {
    const courte: CleChiffrementPii = { octets: CLE.octets.slice(0, 16), kid: CLE.kid };
    expect(erreurDe(() => chiffrerPii(LIGNE_A, CLAIR, courte))).toBeInstanceOf(CleInvalidePii);
    expect(erreurDe(() => dechiffrerPii(LIGNE_A, depuisHex(BLOC_FIGE), courte))).toBeInstanceOf(
      CleInvalidePii
    );
    for (const kid of ['5ec08a0', '5ec08a01ff', 'zzzzzzzz', '5EC08A01']) {
      expect(
        erreurDe(() => chiffrerPii(LIGNE_A, CLAIR, { ...CLE, kid })),
        kid
      ).toBeInstanceOf(CleInvalidePii);
    }
    for (const incomplete of [
      { ...LIGNE_A, id: '' },
      { ...LIGNE_A, champ: '' },
      { ...LIGNE_A, modele: '' },
    ]) {
      const e = erreurDe(() => chiffrerPii(incomplete, CLAIR, CLE));
      expect(e).toBeInstanceOf(EntreeRefuseePii);
      expect(e).toMatchObject({ motif: 'ligne_incomplete' });
      expect(erreurDe(() => dechiffrerPii(incomplete, depuisHex(BLOC_FIGE), CLE))).toBeInstanceOf(
        EntreeRefuseePii
      );
    }
  });

  it('REQ-SEC-024 : chaque échec est une ErreurPii à motif fermé, et aucun message ne porte le clair', () => {
    const bloc = chiffrerPii(LIGNE_A, CLAIR, CLE);
    const version2 = Uint8Array.from(bloc);
    version2[0] = 0x02;
    const erreurs = [
      erreurDe(() => dechiffrerPii(LIGNE_B, bloc, CLE)),
      erreurDe(() => dechiffrerPii(LIGNE_A, altere(bloc, 2), CLE)),
      erreurDe(() => dechiffrerPii(LIGNE_A, version2, CLE)),
      erreurDe(() => chiffrerPii(LIGNE_A, CLAIR, { ...CLE, kid: 'x' })),
    ];
    expect(erreurs.map((e) => (e instanceof ErreurPii ? e.motif : e))).toEqual([
      'echec_authentification',
      'cle_inconnue',
      'bloc_illisible',
      'cle_invalide',
    ]);
    for (const e of erreurs) {
      expect(e).toBeInstanceOf(ErreurPii);
      expect(String((e as Error).message)).not.toContain(CLAIR);
      expect(String((e as Error).message)).not.toContain('alice');
    }
  });
});

describe('REQ-SEC-024 — empreintes de recherche HMAC (emailHash, phoneHash, ibanHash, siretHash)', () => {
  it('REQ-SEC-024 : l’empreinte d’un courriel suit le vecteur figé, après normalisation (bords, casse, NFC)', () => {
    expect(empreinteRecherche('courriel', CLAIR, CLE_EMPREINTE)).toBe(EMPREINTE_COURRIEL);
    expect(empreinteRecherche('courriel', '  Alice@Example.ORG\n', CLE_EMPREINTE)).toBe(
      EMPREINTE_COURRIEL
    );
    const compose = 'élise@example.org';
    const precompose = 'élise@example.org';
    expect(empreinteRecherche('courriel', compose, CLE_EMPREINTE)).toBe(
      empreinteRecherche('courriel', precompose, CLE_EMPREINTE)
    );
  });

  it('REQ-SEC-024 : un même numéro de téléphone écrit de quatre façons donne une seule empreinte, celle du vecteur figé', () => {
    for (const ecrit of [
      '06 39 98 12 34',
      '06.39.98.12.34',
      '+33 6 39 98 12 34',
      '0033639981234',
    ]) {
      expect(empreinteRecherche('telephone', ecrit, CLE_EMPREINTE), ecrit).toBe(
        EMPREINTE_TELEPHONE
      );
    }
  });

  it('REQ-SEC-024 : l’empreinte est une clé HMAC — deux clés différentes donnent deux empreintes différentes', () => {
    const une = empreinteRecherche('courriel', CLAIR, CLE_EMPREINTE);
    const autre = empreinteRecherche('courriel', CLAIR, `${CLE_EMPREINTE}-bis`);
    expect(une).toMatch(/^[0-9a-f]{64}$/);
    expect(une, 'l’empreinte ne dépend pas de la clé').not.toBe(autre);
    expect(() => empreinteRecherche('courriel', CLAIR, '')).toThrow(CleInvalidePii);
  });

  it('REQ-SEC-024 : une même chaîne donne deux empreintes selon qu’elle est un courriel ou un téléphone', () => {
    const chaine = '+33639981234';
    expect(empreinteRecherche('courriel', chaine, CLE_EMPREINTE)).not.toBe(
      empreinteRecherche('telephone', chaine, CLE_EMPREINTE)
    );
    const quatorze = ['1234', '5678', '9012', '34'].join('');
    const ibanDeForme = `FR00${quatorze}`;
    expect(empreinteRecherche('iban', ibanDeForme, CLE_EMPREINTE)).not.toBe(
      empreinteRecherche('siret', quatorze, CLE_EMPREINTE)
    );
  });

  it('REQ-SEC-024 : IBAN sans espaces et en majuscules, SIRET à 14 chiffres exactement', () => {
    const groupes = ['FR00', '1234', '5678', '9012', '3456', '7890', '123'];
    const compact = groupes.join('');
    expect(empreinteRecherche('iban', groupes.join(' ').toLowerCase(), CLE_EMPREINTE)).toBe(
      empreinteRecherche('iban', compact, CLE_EMPREINTE)
    );
    const siret = ['111', '222', '333', '00044'].join('');
    expect(
      empreinteRecherche('siret', `${siret.slice(0, 9)} ${siret.slice(9)}`, CLE_EMPREINTE)
    ).toBe(empreinteRecherche('siret', siret, CLE_EMPREINTE));
  });

  it('REQ-SEC-024 : une valeur hors forme est refusée par un motif nommé, sans que le message la porte', () => {
    const siret = ['111', '222', '333', '00044'].join('');
    const refus: [Parameters<typeof empreinteRecherche>[0], string, string][] = [
      ['telephone', '12345', 'telephone_invalide'],
      ['telephone', '06 39 98 12 3', 'telephone_invalide'],
      ['telephone', '06 39 98 12 34 5', 'telephone_invalide'],
      ['telephone', '06 39 98 AB 34', 'telephone_invalide'],
      ['telephone', '+0 639 981 234', 'telephone_invalide'],
      // Le 0 du préfixe national gardé après l'indicatif français : jamais une seconde empreinte.
      ['telephone', '+33 (0)6 39 98 12 34', 'telephone_invalide'],
      ['telephone', '0033 06 39 98 12 34', 'telephone_invalide'],
      ['telephone', `+${'1'.repeat(16)}`, 'telephone_invalide'],
      ['siret', siret.slice(1), 'siret_invalide'],
      ['siret', `${siret}5`, 'siret_invalide'],
      ['siret', `${siret.slice(1)}A`, 'siret_invalide'],
      ['iban', '1234 5678', 'iban_invalide'],
      ['iban', 'FR00-1234', 'iban_invalide'],
      ['iban', 'FR00', 'iban_invalide'],
      ['courriel', '   ', 'courriel_invalide'],
    ];
    for (const [type, valeur, motif] of refus) {
      const e = erreurDe(() => empreinteRecherche(type, valeur, CLE_EMPREINTE));
      expect(e, `${type} « ${valeur} » accepté`).toBeInstanceOf(EntreeRefuseePii);
      expect(e).toMatchObject({ motif });
      if (valeur.trim() !== '') expect(String((e as Error).message)).not.toContain(valeur);
    }
    // Contre-témoin : la forme internationale complète est admise.
    expect(empreinteRecherche('telephone', `+${'1'.repeat(15)}`, CLE_EMPREINTE)).toMatch(
      /^[0-9a-f]{64}$/
    );
  });
});

describe('REQ-SEC-024 — adresse réseau : seule une empreinte salée tronquée', () => {
  it('REQ-SEC-024 : une adresse IPv4 donne l’empreinte du vecteur figé, 16 caractères hexadécimaux', () => {
    const e = empreinteAdresseReseau('192.0.2.10', SEL_ADRESSE);
    expect(e).toBe(EMPREINTE_IP4);
    expect(e).toMatch(/^[0-9a-f]{16}$/);
  });

  it('REQ-SEC-024 : deux adresses IPv6 du même /64 donnent une seule empreinte ; un autre /64, une autre', () => {
    const memes = [
      '2001:db8:1:2:aaaa::1',
      '2001:0DB8:0001:0002:ffff:ffff:ffff:ffff',
      '2001:db8:1:2::',
      '2001:db8:1:2::1%eth0',
    ];
    for (const adresse of memes) {
      expect(empreinteAdresseReseau(adresse, SEL_ADRESSE), adresse).toBe(EMPREINTE_IP6);
    }
    expect(empreinteAdresseReseau('2001:db8:1:3::1', SEL_ADRESSE)).not.toBe(EMPREINTE_IP6);
    expect(empreinteAdresseReseau('::', SEL_ADRESSE)).toBe(
      empreinteAdresseReseau('::1', SEL_ADRESSE)
    );
    expect(empreinteAdresseReseau('1:2:3:4:5:6:7:8', SEL_ADRESSE)).toBe(
      empreinteAdresseReseau('1:2:3:4::', SEL_ADRESSE)
    );
  });

  it('REQ-SEC-024 : une adresse IPv4 encapsulée dans IPv6 est jugée comme l’IPv4 qu’elle porte', () => {
    for (const encapsulee of [
      '::ffff:192.0.2.10',
      '::FFFF:c000:020a',
      '0:0:0:0:0:ffff:c000:20a',
      '::ffff:192.0.2.10%eth0',
    ]) {
      expect(empreinteAdresseReseau(encapsulee, SEL_ADRESSE), encapsulee).toBe(EMPREINTE_IP4);
    }
    // `::1.2.3.4` n'est PAS encapsulée (forme compatible abandonnée) : elle reste une IPv6 de ::/64.
    expect(empreinteAdresseReseau('::192.0.2.10', SEL_ADRESSE)).toBe(
      empreinteAdresseReseau('::', SEL_ADRESSE)
    );
  });

  it('REQ-SEC-024 : l’empreinte dépend du sel, et un sel vide est refusé', () => {
    expect(empreinteAdresseReseau('192.0.2.10', `${SEL_ADRESSE}-bis`)).not.toBe(EMPREINTE_IP4);
    expect(() => empreinteAdresseReseau('192.0.2.10', '')).toThrow(CleInvalidePii);
  });

  it('REQ-SEC-024 : une chaîne qui n’est pas une adresse est refusée, jamais hachée', () => {
    for (const faux of [
      '',
      'pas-une-adresse',
      '192.0.2.300',
      '192.0.2.01',
      ' 192.0.2.10',
      '192.0.2.0/24',
    ]) {
      const e = erreurDe(() => empreinteAdresseReseau(faux, SEL_ADRESSE));
      expect(e, `« ${faux} » haché`).toBeInstanceOf(EntreeRefuseePii);
      expect(e).toMatchObject({ motif: 'adresse_reseau_invalide' });
    }
  });
});
