// @req REQ-SEC-024
/**
 * chiffrement-avec-aad.spec.ts — SEC-08 : les données personnelles chiffrées, liées à leur ligne et
 * à leur champ ; les empreintes de recherche ; l'adresse réseau réduite à une empreinte tronquée ;
 * la garde de schéma et des chemins d'écriture (`scripts/gates/schema-pii.ts`).
 *
 * LES CLÉS VIENNENT DE SEC-01 : `clesPii` reçoit un environnement et le fait juger par
 * `lireEnvironnement` — l'environnement de test est DÉRIVÉ de `NOMS_DES_SECRETS`, jamais recopié.
 * Toutes ses valeurs sont des valeurs de TEST manifestes (« temoin-sec08-… », octets 0 à 31).
 *
 * Le format et les entrées des empreintes sont un CONTRAT (partners/ADR-0013, décisions 9 à 13) :
 * ils sont tenus par des vecteurs figés, calculés HORS de `pii.ts` par `node:crypto` selon le texte
 * de l'ADR, et non recalculés ici par le code qu'ils jugent.
 *
 * Courriels en `example.org`, téléphones dans la tranche de fiction `06 39 98`, adresses réseau de
 * documentation (`192.0.2.0/24`). Aucun IBAN à clé valide n'est ÉCRIT dans ce fichier : le seul
 * qui serve est assemblé à l'exécution à partir d'un compte marqué `TEMOINSEC08`.
 */

import { describe, it, expect } from 'vitest';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { cleIbanValide } from '../../../src/lib/forme-iban';
import { empreinteAdresse } from '../../../src/server/integrations/axionia/api-entrante';
import {
  BlocIllisiblePii,
  CleInconnuePii,
  CleInvalidePii,
  EchecAuthentificationPii,
  EntreeRefuseePii,
  ErreurPii,
  clesPii,
  colonnesPii,
  decryptPii,
  empreinteAdresseReseau,
  empreinteRecherche,
  encryptPii,
  type LignePii,
} from '../../../src/server/securite/pii';
import {
  FAMILLES,
  controler,
  decider,
  prouver,
  vueDuDepot,
  type Vue,
} from '../../../scripts/gates/schema-pii';

// ── l'environnement de TEST, dérivé des noms de SEC-01 ───────────────────────────────────────────

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const valeurTemoin = (nom: string): string => `temoin-sec08-${nom.toLowerCase()}-`.padEnd(48, '0');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(NOMS_DES_SECRETS.map((n) => [n, valeurTemoin(n)])),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const CLES = clesPii(ENV);

const LIGNE_A: LignePii = { modele: 'Apporteur', champ: 'emailChiffre', id: 'apporteur_0001' };
const LIGNE_B: LignePii = { ...LIGNE_A, id: 'apporteur_0002' };
const CLAIR = 'alice@example.org';

/**
 * Vecteurs figés (node:crypto, hors de `pii.ts`) : clé = octets 0 à 31, kid = kidDe(clé hex),
 * IV = 0xA0…0xAB, AAD = UTF-8 de JSON.stringify(["partners.pii",1,"Apporteur","emailChiffre",
 * "apporteur_0001"]), bloc = 0x01 ‖ kid ‖ IV ‖ étiquette ‖ chiffré.
 */
const BLOC_FIGE =
  '0162a60887a0a1a2a3a4a5a6a7a8a9aaabfa7299da1633cf1ed4ff7009f31e2ac08774154e208b67c70308f7bf6254afac17';
/** HMAC-SHA256(PII_HASH_KEY témoin, "partners.empreinte.v1" ␟ "courriel" ␟ "alice@example.org"). */
const EMPREINTE_COURRIEL = '0b29ccb58963092bf793a545e256ec8a7730315056b68bc3799946e0dfdf7bd9';
/** HMAC-SHA256(PII_HASH_KEY témoin, "partners.empreinte.v1" ␟ "telephone" ␟ "+33639981234"). */
const EMPREINTE_TELEPHONE = '00fd0250399435bf34a20d2c425769502d1eb5e3a78f045d3d0bf8fc2fb6f4e0';
/** HMAC-SHA256(IP_HASH_SALT témoin, "partners.ip.v1" ␟ "192.0.2.10"), 16 premiers caractères. */
const EMPREINTE_IP4 = 'c996ef6120e34a94';

const depuisHex = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = (octets: Uint8Array): string => Buffer.from(octets).toString('hex');
const altere = (bloc: Uint8Array, position: number): Uint8Array => {
  const copie = Uint8Array.from(bloc);
  copie[position] = (copie[position] ?? 0) ^ 0x01;
  return copie;
};
const erreurDe = (f: () => unknown): unknown => {
  try {
    f();
    return null;
  } catch (e) {
    return e;
  }
};

/** Un IBAN à clé valide, ASSEMBLÉ à l'exécution : la clé est cherchée par la règle du dépôt. */
const ibanTemoin = (): string => {
  const compte = `TEMOINSEC08${'0'.repeat(12)}`;
  for (let c = 2; c <= 98; c++) {
    const candidat = `FR${String(c).padStart(2, '0')}${compte}`;
    if (cleIbanValide(candidat)) return candidat;
  }
  throw new Error('aucune clé de contrôle trouvée pour le compte témoin');
};

// Positions du format : version (1) ‖ kid (4) ‖ IV (12) ‖ étiquette (16) ‖ chiffré.
const DEBUT_IV = 5;
const DEBUT_ETIQUETTE = 17;
const DEBUT_CHIFFRE = 33;

describe('REQ-SEC-024 — les clés viennent de SEC-01, une par usage', () => {
  it('REQ-SEC-024 : la clé de chiffrement est PII_ENCRYPTION_KEY, son kid est kidDe(valeur), et les trois usages ont trois clés', () => {
    expect(hex(CLES.chiffrement.octets)).toBe(CLE_HEX);
    expect(CLES.chiffrement.kid).toBe(kidDe(CLE_HEX));
    expect(empreinteRecherche('courriel', CLAIR, CLES)).toBe(EMPREINTE_COURRIEL);
    expect(empreinteAdresseReseau('192.0.2.10', CLES)).toBe(EMPREINTE_IP4);
    // Changer le sel d'adresse ne change AUCUNE empreinte de recherche : pas de partage d'usage.
    const autres = clesPii({ ...ENV, IP_HASH_SALT: valeurTemoin('autre-sel') });
    expect(empreinteRecherche('courriel', CLAIR, autres)).toBe(EMPREINTE_COURRIEL);
    expect(empreinteAdresseReseau('192.0.2.10', autres)).not.toBe(EMPREINTE_IP4);
  });

  it('REQ-SEC-024 : un environnement que SEC-01 refuse ne donne aucune clé — absente, trop courte ou partagée', () => {
    const cas: [Record<string, string | undefined>, string][] = [
      [{ ...ENV, PII_HASH_KEY: undefined }, 'PII_HASH_KEY : absente'],
      [{ ...ENV, PII_ENCRYPTION_KEY: 'ab'.repeat(16) }, 'PII_ENCRYPTION_KEY'],
      [{ ...ENV, PII_HASH_KEY: ENV.IP_HASH_SALT }, 'egale_a'],
    ];
    for (const [env, attendu] of cas) {
      const e = erreurDe(() => clesPii(env));
      expect(e, attendu).toBeInstanceOf(CleInvalidePii);
      expect(String((e as Error).message)).toContain(attendu);
      for (const v of Object.values(env)) {
        if (v !== undefined && v.length >= 32)
          expect(String((e as Error).message)).not.toContain(v);
      }
    }
  });
});

describe('REQ-SEC-024 — chiffrement AES-256-GCM, bloc lié à sa ligne et à son champ', () => {
  it('REQ-SEC-024 : un bloc chiffré se déchiffre à sa place et rend le clair (face verte)', () => {
    for (const clair of [CLAIR, 'Éloïse Œuvré-Ñúñez', '']) {
      expect(decryptPii(LIGNE_A, encryptPii(LIGNE_A, clair, CLES), CLES)).toBe(clair);
    }
  });

  it('REQ-SEC-024 : le bloc de la ligne A présenté pour la ligne B échoue et nomme l’échec d’authentification', () => {
    const blocA = encryptPii(LIGNE_A, CLAIR, CLES);
    const e = erreurDe(() => decryptPii(LIGNE_B, blocA, CLES));
    expect(e, "le bloc de la ligne A s'est déchiffré sous la ligne B").toBeInstanceOf(
      EchecAuthentificationPii
    );
    expect(e).toMatchObject({ motif: 'echec_authentification', ...LIGNE_B });
    const message = String((e as Error).message);
    for (const nomme of [LIGNE_B.modele, LIGNE_B.champ, LIGNE_B.id])
      expect(message).toContain(nomme);
    expect(message).not.toContain(CLAIR);
  });

  it('REQ-SEC-024 : un bloc permuté vers un autre champ ou un autre modèle au même identifiant échoue', () => {
    const bloc = encryptPii(LIGNE_A, CLAIR, CLES);
    for (const ailleurs of [
      { ...LIGNE_A, champ: 'telephoneChiffre' },
      { ...LIGNE_A, modele: 'Contact' },
    ]) {
      expect(() => decryptPii(ailleurs, bloc, CLES)).toThrow(EchecAuthentificationPii);
    }
  });

  it('REQ-SEC-024 : un octet retourné dans le chiffré, dans l’étiquette ou dans l’IV échoue à l’authentification', () => {
    const bloc = encryptPii(LIGNE_A, CLAIR, CLES);
    for (const position of [DEBUT_CHIFFRE + 3, DEBUT_ETIQUETTE + 7, DEBUT_IV + 2]) {
      expect(() => decryptPii(LIGNE_A, altere(bloc, position), CLES)).toThrow(
        EchecAuthentificationPii
      );
    }
  });

  it('REQ-SEC-024 : deux chiffrements du même clair diffèrent, IV compris (IV tiré à chaque chiffrement)', () => {
    const un = encryptPii(LIGNE_A, CLAIR, CLES);
    const deux = encryptPii(LIGNE_A, CLAIR, CLES);
    expect(hex(un)).not.toBe(hex(deux));
    expect(hex(un.slice(DEBUT_IV, DEBUT_ETIQUETTE)), 'IV réutilisé').not.toBe(
      hex(deux.slice(DEBUT_IV, DEBUT_ETIQUETTE))
    );
  });

  it('REQ-SEC-024 : le bloc porte la version 1, le kid de la clé, un IV de 12 octets, une étiquette de 16, et jamais le clair', () => {
    const bloc = encryptPii(LIGNE_A, CLAIR, CLES);
    expect(bloc[0]).toBe(0x01);
    expect(hex(bloc.slice(1, DEBUT_IV))).toBe(CLES.chiffrement.kid);
    expect(bloc.length).toBe(DEBUT_CHIFFRE + Buffer.byteLength(CLAIR, 'utf8'));
    expect(hex(bloc)).not.toContain(Buffer.from(CLAIR, 'utf8').toString('hex'));
  });

  it('REQ-SEC-024 : le bloc figé selon l’ADR se déchiffre, et seulement sous sa ligne (vecteur déterministe)', () => {
    const bloc = depuisHex(BLOC_FIGE);
    expect(decryptPii(LIGNE_A, bloc, CLES)).toBe(CLAIR);
    expect(() => decryptPii(LIGNE_B, bloc, CLES)).toThrow(EchecAuthentificationPii);
  });

  it('REQ-SEC-024 : une autre clé rend CleInconnuePii ; une version 2 ou un bloc de 32 octets rendent BlocIllisiblePii ; une ligne incomplète est refusée', () => {
    const bloc = depuisHex(BLOC_FIGE);
    const autre = clesPii({ ...ENV, PII_ENCRYPTION_KEY: 'f'.repeat(64) });
    expect(erreurDe(() => decryptPii(LIGNE_A, bloc, autre))).toBeInstanceOf(CleInconnuePii);
    expect(erreurDe(() => decryptPii(LIGNE_A, altere(bloc, 2), CLES))).toBeInstanceOf(
      CleInconnuePii
    );
    const version2 = Uint8Array.from(bloc);
    version2[0] = 0x02;
    expect(erreurDe(() => decryptPii(LIGNE_A, version2, CLES))).toBeInstanceOf(BlocIllisiblePii);
    expect(
      erreurDe(() => decryptPii(LIGNE_A, bloc.slice(0, DEBUT_CHIFFRE - 1), CLES))
    ).toBeInstanceOf(BlocIllisiblePii);
    for (const incomplete of [
      { ...LIGNE_A, id: '' },
      { ...LIGNE_A, champ: '' },
      { ...LIGNE_A, modele: '' },
    ]) {
      expect(erreurDe(() => encryptPii(incomplete, CLAIR, CLES))).toMatchObject({
        motif: 'ligne_incomplete',
      });
    }
  });

  it('REQ-SEC-024 : chaque échec est une ErreurPii à motif fermé, et aucun message ne porte le clair', () => {
    const bloc = encryptPii(LIGNE_A, CLAIR, CLES);
    const version2 = Uint8Array.from(bloc);
    version2[0] = 0x02;
    const erreurs = [
      erreurDe(() => decryptPii(LIGNE_B, bloc, CLES)),
      erreurDe(() => decryptPii(LIGNE_A, altere(bloc, 2), CLES)),
      erreurDe(() => decryptPii(LIGNE_A, version2, CLES)),
    ];
    expect(erreurs.map((e) => (e instanceof ErreurPii ? e.motif : e))).toEqual([
      'echec_authentification',
      'cle_inconnue',
      'bloc_illisible',
    ]);
    for (const e of erreurs) expect(String((e as Error).message)).not.toContain('alice');
  });
});

describe('REQ-SEC-024 — le chemin d’écriture : colonnesPii ne rend que des blocs et des empreintes', () => {
  it('REQ-SEC-024 : colonnesPii rend l’identifiant lié, les blocs …Chiffre et les empreintes …Hash — aucun clair', () => {
    const iban = ibanTemoin();
    const clairs = { nom: 'Martin', email: CLAIR, telephone: '06 39 98 12 34', iban };
    const colonnes = colonnesPii({ modele: 'Apporteur', id: 'apporteur_0001' }, clairs, CLES);
    expect(Object.keys(colonnes).sort()).toEqual(
      [
        'id',
        'nomChiffre',
        'emailChiffre',
        'emailHash',
        'telephoneChiffre',
        'phoneHash',
        'ibanChiffre',
        'ibanHash',
      ].sort()
    );
    expect(colonnes.id).toBe('apporteur_0001');
    expect(colonnes.emailHash).toBe(EMPREINTE_COURRIEL);
    expect(colonnes.phoneHash).toBe(EMPREINTE_TELEPHONE);
    expect(colonnes.ibanHash).toBe(empreinteRecherche('iban', iban, CLES));
    const serialise = JSON.stringify(colonnes, (_, v: unknown) =>
      v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v
    );
    for (const clair of [...Object.values(clairs), '0639981234', '+33639981234']) {
      expect(serialise, `le clair « ${clair.slice(0, 3)}… » traverse`).not.toContain(clair);
    }
    const bloc = colonnes.emailChiffre;
    expect(bloc).toBeInstanceOf(Uint8Array);
    expect(
      decryptPii({ modele: 'Apporteur', champ: 'emailChiffre', id: 'apporteur_0001' }, bloc!, CLES)
    ).toBe(CLAIR);
  });

  it('REQ-SEC-024 : TÉMOIN À DEUX FACES — le bloc d’une ligne transposé vers une autre échoue en nommant l’échec ; à sa place il se déchiffre', () => {
    const a = colonnesPii({ modele: 'Apporteur', id: 'apporteur_0001' }, { email: CLAIR }, CLES);
    const b = colonnesPii(
      { modele: 'Apporteur', id: 'apporteur_0002' },
      { email: 'bob@example.org' },
      CLES
    );
    // Rouge : le bloc de A recopié dans la ligne B.
    const e = erreurDe(() => decryptPii(LIGNE_B, a.emailChiffre!, CLES));
    expect(e).toBeInstanceOf(EchecAuthentificationPii);
    expect(String((e as Error).message)).toContain('echec_authentification');
    // Vert : chaque bloc à sa place.
    expect(decryptPii(LIGNE_A, a.emailChiffre!, CLES)).toBe(CLAIR);
    expect(decryptPii(LIGNE_B, b.emailChiffre!, CLES)).toBe('bob@example.org');
  });

  it('REQ-SEC-024 : un champ à null efface le bloc ET l’empreinte ; un champ absent ne touche rien', () => {
    const colonnes = colonnesPii(
      { modele: 'Contact', id: 'contact_0001' },
      { email: null, nom: 'Martin' },
      CLES
    );
    expect(colonnes).toMatchObject({ emailChiffre: null, emailHash: null });
    expect(Object.keys(colonnes)).not.toContain('telephoneChiffre');
    expect(
      erreurDe(() => colonnesPii({ modele: 'Contact', id: '' }, { nom: 'x' }, CLES))
    ).toMatchObject({ motif: 'ligne_incomplete' });
  });
});

describe('REQ-SEC-024 — empreintes de recherche HMAC (emailHash, phoneHash, ibanHash, siretHash)', () => {
  it('REQ-SEC-024 : un courriel et un téléphone écrits de plusieurs façons donnent l’empreinte figée', () => {
    for (const ecrit of [CLAIR, '  Alice@Example.ORG\n']) {
      expect(empreinteRecherche('courriel', ecrit, CLES)).toBe(EMPREINTE_COURRIEL);
    }
    for (const ecrit of [
      '06 39 98 12 34',
      '06.39.98.12.34',
      '+33 6 39 98 12 34',
      '0033639981234',
    ]) {
      expect(empreinteRecherche('telephone', ecrit, CLES), ecrit).toBe(EMPREINTE_TELEPHONE);
    }
  });

  it('REQ-SEC-024 : une même chaîne donne deux empreintes selon son type ; l’empreinte a la forme HASH_HEX_64', () => {
    const quatorze = '11122233300044';
    expect(empreinteRecherche('siret', quatorze, CLES)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteRecherche('courriel', `${quatorze}@example.org`, CLES)).not.toBe(
      empreinteRecherche('siret', quatorze, CLES)
    );
    const iban = ibanTemoin();
    const espace = iban.replace(/(.{4})/g, '$1 ').toLowerCase();
    expect(empreinteRecherche('iban', espace, CLES)).toBe(empreinteRecherche('iban', iban, CLES));
  });

  it('REQ-SEC-024 : une valeur hors forme est refusée par un motif nommé, sans que le message la porte', () => {
    const refus: [Parameters<typeof empreinteRecherche>[0], string, string][] = [
      ['telephone', '12345', 'telephone_invalide'],
      ['telephone', '06 39 98 AB 34', 'telephone_invalide'],
      ['telephone', '+33 (0)6 39 98 12 34', 'telephone_invalide'],
      ['siret', '1112223330004', 'siret_invalide'],
      ['iban', 'FR00TEMOINSEC08000000000000', 'iban_invalide'],
      ['iban', '1234 5678', 'iban_invalide'],
      ['courriel', '   ', 'courriel_invalide'],
      ['courriel', 'sans-arobase.example.org', 'courriel_invalide'],
    ];
    for (const [type, valeur, motif] of refus) {
      const e = erreurDe(() => empreinteRecherche(type, valeur, CLES));
      expect(e, `${type} « ${valeur} » accepté`).toBeInstanceOf(EntreeRefuseePii);
      expect(e).toMatchObject({ motif });
      if (valeur.trim() !== '') expect(String((e as Error).message)).not.toContain(valeur);
    }
  });
});

describe('REQ-SEC-024 — adresse réseau : seule une empreinte salée tronquée', () => {
  it('REQ-SEC-024 : l’empreinte d’adresse est celle de la frontière (une seule primitive), 16 hexadécimaux sous IP_HASH_SALT', () => {
    const e = empreinteAdresseReseau('192.0.2.10', CLES);
    expect(e).toBe(EMPREINTE_IP4);
    expect(e).toBe(empreinteAdresse('192.0.2.10', ENV.IP_HASH_SALT!));
    expect(e).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ── la garde : schéma et chemins d'écriture ────────────────────────────────────────────────────

const SCHEMA_SAIN = [
  'model Contact {',
  '  id          String  @id @db.Uuid',
  '  siren       String  @db.Char(9)',
  '  nomChiffre  Bytes?  @map("nom_chiffre")',
  '  emailChiffre Bytes?',
  '  emailHash   String? @db.Char(64)',
  '  ipHash      String? @map("ip_hash") @db.Char(16)',
  '}',
].join('\n');
const ECRITURE_SAINE = [
  "import { colonnesPii, empreinteRecherche } from '../securite/pii';",
  'export const creer = (tx, id, c, cles) =>',
  "  tx.contact.create({ data: { siren: c.siren, ...colonnesPii({ modele: 'Contact', id }, c, cles) } });",
  'export const lire = (tx, email, cles) =>',
  "  tx.contact.findFirst({ where: { emailHash: empreinteRecherche('courriel', email, cles) }, select: { emailChiffre: true } });",
].join('\n');
const vue = (schema: string, contenu: string): Vue => ({
  schema,
  code: [{ chemin: 'src/server/bac/contact.ts', contenu }],
});

describe('REQ-SEC-024 — garde de schéma et des chemins d’écriture (securite:schema-pii)', () => {
  it('REQ-SEC-024 : une colonne d’adresse réseau en clair (createdIp String?) rougit et nomme la colonne', () => {
    const schema = SCHEMA_SAIN.replace('}', '  createdIp   String?\n}');
    const fautes = controler(vue(schema, ECRITURE_SAINE)).fautes;
    expect(fautes.map((f) => f.famille)).toEqual(['colonne_personnelle_en_clair']);
    expect(fautes[0]!.message).toContain('Contact.createdIp');
  });

  it('REQ-SEC-024 : TÉMOIN À DEUX FACES — un chemin d’écriture de bac qui écrit un champ protégé en clair est refusé et nomme le champ ; le schéma et le chemin sains sortent en zéro', () => {
    for (const [contenu, champ] of [
      ['tx.contact.create({ data: { id, emailChiffre: Buffer.from(email) } });', 'emailChiffre'],
      ['tx.contact.update({ where: { id }, data: { emailHash: email } });', 'emailHash'],
      ['tx.contact.create({ data: { id, email } });', 'email'],
    ] as const) {
      const verdict = decider(vue(SCHEMA_SAIN, contenu));
      expect(verdict.code, contenu).toBe(1);
      expect(verdict.lignes.join('\n')).toContain(champ);
    }
    const sain = decider(vue(SCHEMA_SAIN, ECRITURE_SAINE));
    expect(sain.code, sain.lignes.join('\n')).toBe(0);
  });

  it('REQ-SEC-024 : le dépôt sort en zéro, et le vert imprime le compte des champs et des chemins d’écriture confrontés', () => {
    const depot = vueDuDepot();
    const { fautes, champs, fichiers, sites } = controler(depot);
    expect(fautes, fautes.map((f) => f.message).join('\n')).toEqual([]);
    expect(champs).toBeGreaterThan(0);
    expect(fichiers).toBeGreaterThan(0);
    const verdict = decider(depot);
    expect(verdict.code).toBe(0);
    expect(verdict.lignes[0]).toContain(`${champs} champ(s)`);
    expect(verdict.lignes[0]).toContain(`${fichiers} fichier(s)`);
    expect(verdict.lignes[0]).toContain(`${sites} site(s) d’écriture`);
  });

  it('REQ-SEC-024 : chaque famille de la garde a son témoin vu rougir, et ses contre-témoins restent verts (--prove)', () => {
    const preuve = prouver();
    expect(preuve.code, preuve.lignes.join('\n')).toBe(0);
    expect(preuve.lignes[0]).toContain(`${FAMILLES.length} familles`);
  });
});
