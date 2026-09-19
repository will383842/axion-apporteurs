// @req REQ-DM-041
/**
 * La charge d'un événement est un schéma Zod FERMÉ par type, sans donnée personnelle — DM-01
 * (gate `journal:sans-pii`, partners/ADR-0015 décision 4).
 *
 * TÉMOIN À DEUX FACES. Face rouge : des charges de bac portant un champ interdit font sortir la garde
 * en code non nul, UNE faute nommée `type.champ` par cas. Face verte : les charges du dépôt la font
 * sortir en zéro, en comptant les types et les champs RÉELLEMENT confrontés — plancher `> 0`, sans
 * quoi un détecteur vidé imprimerait « 0 type » et passerait.
 *
 * Le lexique des noms de champ de personne (`src/domain/donnees-personnelles/champs.ts`) est le SEUL
 * du dépôt : ses témoins sont ici, parce que c'est la garde du journal qui l'exerce la première.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { z } from 'zod';
import {
  LEXIQUE_CHAMPS_PERSONNELS,
  segmentsDuNom,
  segmentsPersonnels,
} from '../../../src/domain/donnees-personnelles/champs';
import { CHARGES_PAR_TYPE, FORMES, HASH_HEX_64 } from '../../../src/domain/evenement/charges';
import {
  controler,
  decider,
  prouver,
  vueDuDepot,
  FAMILLES,
  type Vue,
} from '../../../scripts/gates/journal-sans-pii';

// ── le lexique ───────────────────────────────────────────────────────────────────────────────

describe('REQ-DM-041 — le lexique des noms de champ de personne lit des SEGMENTS, jamais des sous-chaînes', () => {
  it('REQ-DM-041 : un nom se découpe en camelCase, en snake_case et sur les sigles', () => {
    expect(segmentsDuNom('nomContact')).toEqual(['nom', 'contact']);
    expect(segmentsDuNom('telephone_mobile')).toEqual(['telephone', 'mobile']);
    expect(segmentsDuNom('IPAddress')).toEqual(['ip', 'address']);
    expect(segmentsDuNom('adresseIP')).toEqual(['adresse', 'ip']);
    expect(segmentsDuNom('e-mail')).toEqual(['e', 'mail']);
  });

  it('REQ-DM-041 : nom, téléphone (forme colonne) et IP sont reconnus, avec leur catégorie', () => {
    expect(segmentsPersonnels('nomContact')).toEqual([{ segment: 'nom', categorie: 'identite' }]);
    expect(segmentsPersonnels('telephone_mobile')).toEqual([
      { segment: 'telephone', categorie: 'contact' },
      { segment: 'mobile', categorie: 'contact' },
    ]);
    expect(segmentsPersonnels('ipHash')).toEqual([{ segment: 'ip', categorie: 'reseau' }]);
    expect(segmentsPersonnels('ibanChiffre')).toEqual([{ segment: 'iban', categorie: 'bancaire' }]);
    expect(segmentsPersonnels('villeFacturation')).toEqual([
      { segment: 'ville', categorie: 'postal' },
    ]);
  });

  it.each(['nombreDeDepots', 'nomenclature', 'hotel', 'montantHtCents', 'agregatId', 'ribambelle'])(
    'REQ-DM-041 : « %s » ne porte aucun segment de personne — une sous-chaîne ne suffit pas',
    (nom) => {
      expect(segmentsPersonnels(nom)).toEqual([]);
    }
  );

  it('REQ-DM-041 : chaque catégorie de REQ-DM-041 a au moins un segment, et aucun segment n’est en double', () => {
    const categories = new Set(LEXIQUE_CHAMPS_PERSONNELS.map((e) => e.categorie));
    expect([...categories].sort()).toEqual(['bancaire', 'contact', 'identite', 'postal', 'reseau']);
    const segments = LEXIQUE_CHAMPS_PERSONNELS.map((e) => e.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });
});

// ── la garde ─────────────────────────────────────────────────────────────────────────────────

const conforme = (charges: Vue['charges']): Vue => ({
  typesDuSchema: Object.keys(charges),
  code: [],
  charges,
});

const ou = (vue: Vue) => controler(vue).fautes.map((f) => `${f.famille} ${f.ou}`);

describe('REQ-DM-041 — la garde `journal:sans-pii` refuse toute feuille hors de la liste fermée', () => {
  it('REQ-DM-041 : les charges du dépôt sortent en zéro, types et champs comptés (plancher > 0)', () => {
    const verdict = controler(vueDuDepot());
    expect(verdict.fautes).toEqual([]);
    expect(verdict.types).toBeGreaterThan(0);
    expect(verdict.champs).toBeGreaterThan(0);
    expect(verdict.types).toBe(Object.keys(CHARGES_PAR_TYPE).length);
  });

  it('REQ-DM-041 : les clés de CHARGES_PAR_TYPE sont les valeurs de l’enum lu dans schema.prisma, dans les deux sens', () => {
    expect([...vueDuDepot().typesDuSchema].sort()).toEqual(Object.keys(CHARGES_PAR_TYPE).sort());
  });

  it('REQ-DM-041 : un champ email en chaîne libre rougit, nommé `type.champ`, deux fois (nom ET forme)', () => {
    expect(ou(conforme({ bac: z.object({ email: z.string().email() }).strict() }))).toEqual([
      'champ_nominatif bac.email',
      'feuille_hors_liste bac.email',
    ]);
  });

  it('REQ-DM-041 : un champ de personne rougit même sous une forme admise — le nom suffit', () => {
    expect(ou(conforme({ bac: z.object({ nomContact: z.enum(['a', 'b']) }).strict() }))).toEqual([
      'champ_nominatif bac.nomContact',
    ]);
  });

  it('REQ-DM-041 : une chaîne nue rougit — une chaîne libre peut porter un courriel', () => {
    expect(ou(conforme({ bac: z.object({ motif: z.string() }).strict() }))).toEqual([
      'feuille_hors_liste bac.motif',
    ]);
  });

  it.each([
    ['passthrough', z.object({ agregatId: FORMES.identifiant() }).passthrough()],
    ['strip (le défaut de Zod)', z.object({ agregatId: FORMES.identifiant() })],
    ['catchall', z.object({ agregatId: FORMES.identifiant() }).strict().catchall(z.string())],
    ['une charge qui n’est pas un objet', z.any()],
  ])('REQ-DM-041 : une charge ouverte (%s) rougit', (_quoi, schema) => {
    expect(ou(conforme({ bac: schema }))).toEqual(['charge_ouverte bac']);
  });

  it('REQ-DM-041 : un objet imbriqué non strict et un champ de personne imbriqué sont nommés par leur chemin', () => {
    const vue = conforme({
      bac: z
        .object({
          contexte: z.object({ agregatId: FORMES.identifiant() }),
          adresse: z.object({ villeCode: z.enum(['x']) }).strict(),
        })
        .strict(),
    });
    expect(ou(vue)).toEqual([
      'charge_ouverte bac.contexte',
      'champ_nominatif bac.adresse',
      'champ_nominatif bac.adresse.villeCode',
    ]);
  });

  it.each([
    ['un montant non suffixé Cents', { montantHt: z.number().int() }, 'bac.montantHt'],
    ['un nombre non entier', { montantHtCents: z.number() }, 'bac.montantHtCents'],
    ['un booléen', { relance: z.boolean() }, 'bac.relance'],
    ['un littéral numérique', { version: z.literal(1) }, 'bac.version'],
    ['un tableau', { ids: z.array(FORMES.identifiant()) }, 'bac.ids'],
    [
      'une empreinte sur une AUTRE expression',
      { ipHash: z.string().regex(/^[0-9a-f]{64}$/) },
      'bac.ipHash',
    ],
    ['une transformation', { codeAt: FORMES.horodatage().transform((s) => s) }, 'bac.codeAt'],
  ])('REQ-DM-041 : %s rougit en feuille_hors_liste', (_quoi, shape, chemin) => {
    expect(ou(conforme({ bac: z.object(shape).strict() }))).toContain(
      `feuille_hors_liste ${chemin}`
    );
  });

  it('REQ-DM-041 : une valeur d’enum sans charge, et une charge sans valeur d’enum, rougissent chacune', () => {
    const charges = { journal_ouvert: CHARGES_PAR_TYPE.journal_ouvert };
    expect(ou({ typesDuSchema: ['journal_ouvert', 'bac_orphelin'], charges, code: [] })).toEqual([
      'type_sans_charge bac_orphelin',
    ]);
    expect(
      ou({
        typesDuSchema: [],
        charges: { ...charges, bac: CHARGES_PAR_TYPE.journal_ouvert },
        code: [],
      })
    ).toContain('charge_sans_type bac');
  });

  it('REQ-DM-041 : un enum illisible dans le schéma est un périmètre vide, jamais un vert', () => {
    expect(ou({ typesDuSchema: [], charges: {}, code: [] })).toEqual([
      'perimetre_vide TypeEvenementJournal',
    ]);
  });

  it('REQ-DM-041 : un champ de personne à TROIS niveaux de profondeur est nommé par son chemin complet', () => {
    const vue = conforme({
      bac: z
        .object({
          a: z.object({ b: z.object({ courriel: z.enum(['x']) }).strict() }).strict(),
        })
        .strict(),
    });
    expect(ou(vue)).toEqual(['champ_nominatif bac.a.b.courriel']);
  });

  it('REQ-DM-041 : l’exemption d’empreinte exige le suffixe hash — `emailEmpreinte` en forme empreinte rougit', () => {
    expect(
      ou(conforme({ bac: z.object({ emailEmpreinte: FORMES.empreinte() }).strict() }))
    ).toEqual(['champ_nominatif bac.emailEmpreinte']);
  });

  it('REQ-DM-041 : contre-témoin — toutes les formes admises passent, empreintes de personne comprises', () => {
    enum Canal {
      Depot = 'depot',
    }
    const verdict = controler(
      conforme({
        bac: z
          .object({
            agregatId: FORMES.identifiant(),
            ipHash: FORMES.empreinte(),
            emailHash: FORMES.empreinte().nullable(),
            empreinte: z.string().regex(HASH_HEX_64),
            montantHtCents: FORMES.montantCents(),
            survenuAt: FORMES.horodatage().optional(),
            statut: z.enum(['a', 'b']),
            canal: z.nativeEnum(Canal),
            version: z.literal('v1'),
            nomenclature: z.enum(['x']),
            contexte: z.object({ releveId: FORMES.identifiant() }).strict(),
          })
          .strict(),
      })
    );
    expect(verdict.fautes).toEqual([]);
    expect(verdict.champs).toBe(12);
  });
});

// ── l'écrivain unique ────────────────────────────────────────────────────────────────────────

/** Le second écrivain de la lentille securite : il contourne `ajouterEvenement()` et son `parse`. */
const ECRIVAIN_BIS = [
  "import type { Prisma } from '@prisma/client';",
  'export async function ecrire(tx: Prisma.TransactionClient) {',
  '  await tx.evenement.create({',
  "    data: { type: 'journal_ouvert', charge: { algorithme: 'sha256-jcs-v1', courriel: 'a@b.fr' },",
  "      prevHash: 'x', selfHash: 'y', survenuAt: new Date() },",
  '  });',
  '}',
].join('\n');

const avecCode = (chemin: string, contenu: string): Vue => ({
  ...conforme({ journal_ouvert: CHARGES_PAR_TYPE.journal_ouvert }),
  code: [{ chemin, contenu }],
});

describe('REQ-DM-041 — la charge n’est fermée que si ajouterEvenement() est le SEUL écrivain', () => {
  it('REQ-DM-041 : le second écrivain de la revue (src/server/bac/ecrivain-bis.ts) rougit, nommé', () => {
    expect(ou(avecCode('src/server/bac/ecrivain-bis.ts', ECRIVAIN_BIS))).toEqual([
      'ecrivain_hors_journal src/server/bac/ecrivain-bis.ts:3',
    ]);
  });

  it.each([
    ['createMany sur deux lignes', 'await tx.evenement\n  .createMany({ data: [] });'],
    ['upsert', 'await prisma.evenement.upsert({ where: { id: 1n }, create: x, update: x });'],
    ['update', 'await tx.evenement.update({ where: { id: 1n }, data: {} });'],
    ['updateMany', 'await tx.evenement.updateMany({ data: {} });'],
    ['deleteMany', 'await tx.evenement.deleteMany({});'],
    [
      '$executeRawUnsafe',
      'await tx.$executeRawUnsafe(`INSERT INTO "evenements" (charge) VALUES ($1)`, c);',
    ],
    [
      '$executeRaw sur plusieurs lignes',
      'await tx.$executeRaw`\n  INSERT INTO evenements\n  VALUES (1)`;',
    ],
    ['$queryRaw', 'const r = await tx.$queryRaw`SELECT * FROM EVENEMENTS`;'],
    ['$queryRawUnsafe', "await tx.$queryRawUnsafe('delete from evenements');"],
  ])(
    'REQ-DM-041 : un écrivain hors de journal.ts (%s) rougit en ecrivain_hors_journal',
    (_quoi, contenu) => {
      expect(ou(avecCode('scripts/outil/bac.ts', contenu))).toEqual([
        expect.stringMatching(/^ecrivain_hors_journal scripts\/outil\/bac\.ts:\d+$/),
      ]);
    }
  );

  it.each([
    ['l’écrivain unique lui-même', 'src/server/evenement/journal.ts', ECRIVAIN_BIS],
    [
      'du SQL brut qui ne touche pas le journal',
      'src/server/x.ts',
      'await tx.$executeRaw`SELECT 1`;',
    ],
    ['un fichier de test (hors portée)', 'tests/integration/x.spec.ts', ECRIVAIN_BIS],
    [
      'un appelant qui IMPORTE l’écrivain par son chemin de module',
      'src/server/apporteur/creer.ts',
      "import { ajouterEvenement } from '../evenement/journal';\nexport { ajouterEvenement };",
    ],
    [
      'des noms composés distincts (`EvenementCreateInput`, `evenementRecu`, `TypeEvenementJournal`)',
      'src/server/x.ts',
      'type E = Prisma.EvenementCreateInput;\nawait tx.evenementRecu.create({ data });\ntype T = TypeEvenementJournal;',
    ],
    [
      'un fichier pur du domaine du journal, sans table, délégué, client ni requête',
      'src/domain/evenement/autre.ts',
      '// le journal est append-only\nexport const ALGORITHME_DU_JOURNAL = 1;',
    ],
  ])('REQ-DM-041 : contre-témoin — %s ne rougit pas', (_quoi, chemin, contenu) => {
    expect(ou(avecCode(chemin, contenu))).toEqual([]);
  });

  // Les deux formes ouvertes de la revue exactitude (5254778981) : elles sortaient en 0, et la
  // première a écrit une ligne portant un courriel en base réelle.
  it.each([
    [
      '(a) texte SQL dans une constante, puis $executeRawUnsafe(CONST)',
      "const SQL = 'INSERT INTO evenements (type) VALUES ($1)';\nawait tx.$executeRawUnsafe(SQL, 'journal_ouvert');",
      1,
    ],
    [
      '(a) Prisma.sql dans une variable, puis $executeRaw(variable)',
      'const q = Prisma.sql`INSERT INTO evenements (type) VALUES (1)`;\nawait tx.$executeRaw(q);',
      1,
    ],
    ['(b) alias du modèle', 'const journal = tx.evenement;\nawait journal.create({ data });', 1],
  ])('REQ-DM-041 : forme de la revue exactitude %s — rougit, nommée', (_q, contenu, ligne) => {
    expect(ou(avecCode('src/server/bac/forme.ts', contenu))).toEqual([
      `ecrivain_hors_journal src/server/bac/forme.ts:${ligne}`,
    ]);
  });

  it.each([
    [
      'un FROM de requête SQL n’est pas un chemin d’import',
      'await tx.$queryRawUnsafe(\'SELECT 1 FROM "evenements"\');',
    ],
    ['une constante exportée n’est pas un import', 'export const q = `delete from "evenements"`;'],
    [
      'le domaine du journal qui nomme le délégué',
      'export const d = (tx: { evenement: unknown }) => tx.evenement;',
    ],
  ])('REQ-DM-041 : %s — rougit', (_q, contenu) => {
    const chemin = contenu.includes('export const d')
      ? 'src/domain/evenement/bac.ts'
      : 'src/server/bac/requete.ts';
    expect(ou(avecCode(chemin, contenu))).toEqual([`ecrivain_hors_journal ${chemin}:1`]);
  });

  // Les dix variantes du SECOND veto securite (revue 5254766985), chacune précédée du même en-tête
  // que la sonde : la règle ne chasse plus une orthographe d'appel, elle refuse toute MENTION de la
  // table ou du délégué hors de la liste blanche.
  const ENTETE_SONDE = [
    "import { Prisma } from '@prisma/client';",
    "const data = { type: 'journal_ouvert' as const, survenuAt: new Date(), charge: { courriel: 'jean.dupont@exemple.fr' }, prevHash: '0'.repeat(64), selfHash: '1'.repeat(64) };",
  ].join('\n');
  const fonction = (corps: string) =>
    `export async function ecrire(tx: Prisma.TransactionClient): Promise<void> {\n${corps}\n}`;
  it.each([
    [
      'v01 gabarit brut',
      fonction(
        "  await tx.$executeRaw`INSERT INTO evenements (type, survenu_at, charge, prev_hash, self_hash) VALUES ('journal_ouvert', now(), '{}', ${data.prevHash}, ${data.selfHash})`;"
      ),
    ],
    ['v02 createMany', fonction('  await tx.evenement.createMany({ data: [data] });')],
    ['v03 alias du client', fonction('  const c = tx;\n  await c.evenement.create({ data });')],
    [
      'v04 délégué en variable',
      fonction('  const journal = tx.evenement;\n  await journal.create({ data });'),
    ],
    [
      'v05 déstructuration',
      fonction('  const { evenement: journal } = tx;\n  await journal.create({ data });'),
    ],
    ['v06 crochets', fonction("  await tx['evenement'].create({ data });")],
    ['v07 chaînage optionnel', fonction('  await tx.evenement?.create({ data });')],
    [
      'v08 Prisma.sql puis $executeRaw(requete)',
      "const requete = Prisma.sql`INSERT INTO evenements (type) VALUES ('journal_ouvert')`;\n" +
        fonction('  await tx.$executeRaw(requete);'),
    ],
    [
      'v09 nom de table dans une constante',
      "const TABLE = 'evenements';\n" +
        fonction(
          '  const sql = `INSERT INTO ${TABLE} (type) VALUES ($1)`;\n  await tx.$executeRawUnsafe(sql, 1);'
        ),
    ],
    [
      'v10 appel coupé par un commentaire',
      fonction(
        '  await tx.evenement\n    // commentaire\n    .upsert({ where: { selfHash: data.selfHash }, create: data, update: {} });'
      ),
    ],
  ])('REQ-DM-041 : variante du second veto (%s) — rougit en ecrivain_hors_journal', (_q, corps) => {
    const fautes = ou(avecCode('src/server/bac/ecrivain.ts', `${ENTETE_SONDE}\n${corps}`));
    expect(fautes.length).toBeGreaterThan(0);
    expect(
      fautes.every((f) => f.startsWith('ecrivain_hors_journal src/server/bac/ecrivain.ts:'))
    ).toBe(true);
  });

  // Les formes de la revue mutation (5254820185) : chacune sortait en 0 sous la règle d'orthographe.
  it.each([
    [
      'P1 SQL dans une variable',
      "const q = `INSERT INTO evenements (charge) VALUES ('{}')`;\nawait tx.$executeRawUnsafe(q);",
    ],
    [
      'P2 Prisma.sql déclaré plus haut, puis $executeRaw(sql)',
      'const sql = Prisma.sql`INSERT INTO evenements (charge) VALUES (${c})`;\nawait tx.$executeRaw(sql);',
    ],
    ['P3 alias du délégué', 'const journal = tx.evenement;\nawait journal.create({ data });'],
    [
      'P4 déstructuration puis createMany',
      'const { evenement: e } = tx;\nawait e.createMany({ data: [] });',
    ],
    [
      'P5 point-virgule dans la chaîne SQL',
      "await tx.$executeRawUnsafe('SELECT 1; INSERT INTO evenements (charge) VALUES ($1)', c);",
    ],
    [
      'P6 nom de table entre guillemets doubles',
      'await tx.$executeRawUnsafe(`INSERT INTO "evenements" (charge) VALUES ($1)`, c);',
    ],
    [
      'P7 schéma qualifié',
      'await tx.$executeRaw`INSERT INTO public.evenements (charge) VALUES (${c})`;',
    ],
    [
      'P8 $transaction de requêtes',
      'await prisma.$transaction([prisma.evenement.create({ data })]);',
    ],
    ['P9 chaînage optionnel du client et du délégué', 'await tx?.evenement?.create({ data });'],
    ['P10 crochets', "await tx['evenement'].create({ data });"],
  ])('REQ-DM-041 : forme de la revue mutation %s — rougit', (_q, contenu) => {
    expect(ou(avecCode('src/server/sonde.ts', contenu)).length).toBeGreaterThan(0);
  });

  it('REQ-DM-041 : plusieurs fichiers, l’écrivain second au MILIEU, en .js sous src/ et sous scripts/ — seuls les fautifs sont nommés', () => {
    const vue: Vue = {
      ...conforme({ journal_ouvert: CHARGES_PAR_TYPE.journal_ouvert }),
      code: [
        {
          chemin: 'src/server/evenement/journal.ts',
          contenu: 'await tx.evenement.create({ data });',
        },
        { chemin: 'src/server/a.ts', contenu: 'export const a = 1;' },
        {
          chemin: 'src/server/milieu.js',
          contenu: 'module.exports = (tx) => tx.evenement.create({});',
        },
        { chemin: 'src/domain/evenement/b.ts', contenu: '// le journal' },
        { chemin: 'scripts/outil/purge.js', contenu: "db.query('delete from evenements');" },
        { chemin: 'src/server/z.ts', contenu: 'export const z = 1;' },
      ],
    };
    expect(ou(vue)).toEqual([
      'ecrivain_hors_journal src/server/milieu.js:1',
      'ecrivain_hors_journal scripts/outil/purge.js:1',
    ]);
  });

  it('REQ-DM-041 : deux écritures dans un fichier, la PREMIÈRE légitime, la SECONDE fautive — seule la seconde est nommée', () => {
    const contenu = [
      "import { ajouterEvenement } from '../evenement/journal';",
      'await ajouterEvenement(tx, e);',
      'await tx.evenement.createMany({ data: [] });',
    ].join('\n');
    expect(ou(avecCode('src/server/deux.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/deux.ts:3',
    ]);
  });

  it('REQ-DM-041 : deux mentions fautives dans un fichier — CHACUNE est nommée, pas seulement la première', () => {
    const contenu = [
      'export const a = 1;',
      'await tx.evenement.create({ data });',
      'export const b = 2;',
      "await tx.$executeRawUnsafe('delete from evenements');",
    ].join('\n');
    expect(ou(avecCode('src/server/deux.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/deux.ts:2',
      'ecrivain_hors_journal src/server/deux.ts:4',
    ]);
  });

  // Troisième veto securite (revue 5254963257) : la requête naît dans le domaine blanchi, et le
  // consommateur ne porte que le chemin d'import, effacé avant le compte.
  it('REQ-DM-041 : la requête écrite dans le domaine du journal puis importée par un consommateur — rougit dans le domaine', () => {
    const vue: Vue = {
      ...conforme({ journal_ouvert: CHARGES_PAR_TYPE.journal_ouvert }),
      code: [
        {
          chemin: 'src/domain/evenement/requetes.ts',
          contenu:
            "export const INSERER_LIGNE =\n  'INSERT INTO evenements (type, charge) VALUES ($1, $2::jsonb)';",
        },
        {
          chemin: 'src/server/apporteur/creer.ts',
          contenu:
            "import { INSERER_LIGNE } from '../../domain/evenement/requetes';\nawait tx.$executeRawUnsafe(INSERER_LIGNE, 'journal_ouvert', c);",
        },
      ],
    };
    expect(ou(vue)).toEqual(['ecrivain_hors_journal src/domain/evenement/requetes.ts:2']);
  });

  it('REQ-DM-041 : la tête et l’insertion écrites dans le domaine, un maillon au hash valide calculé ailleurs — rougit dans le domaine', () => {
    const vue: Vue = {
      ...conforme({ journal_ouvert: CHARGES_PAR_TYPE.journal_ouvert }),
      code: [
        {
          chemin: 'src/domain/evenement/requetes.ts',
          contenu: [
            "export const TETE_DU_JOURNAL = 'SELECT self_hash FROM evenements ORDER BY id DESC LIMIT 1';",
            "export const INSERER_MAILLON = 'INSERT INTO evenements (type, charge, prev_hash, self_hash) VALUES ($1, $2, $3, $4)';",
          ].join('\n'),
        },
        {
          chemin: 'src/server/bac/second.ts',
          contenu: [
            "import { TETE_DU_JOURNAL, INSERER_MAILLON } from '../../domain/evenement/requetes';",
            "import { calculerSelfHash } from '../../domain/evenement/journal';",
            'const [tete] = await tx.$queryRawUnsafe(TETE_DU_JOURNAL);',
            'await tx.$executeRawUnsafe(INSERER_MAILLON, t, c, tete.self_hash, calculerSelfHash(tete.self_hash, e));',
          ].join('\n'),
        },
      ],
    };
    expect(ou(vue)).toEqual([
      'ecrivain_hors_journal src/domain/evenement/requetes.ts:1',
      'ecrivain_hors_journal src/domain/evenement/requetes.ts:2',
    ]);
  });

  it('REQ-DM-041 : un commentaire `// … from "../evenement/journal"` ouvert DANS un appel d’écriture ne l’efface pas', () => {
    const contenu = [
      'await tx.evenement.create({ // from "../evenement/journal"',
      '  data,',
      '});',
      'export default tx.evenement.create({ // from "../evenement/journal"',
      '  data });',
    ].join('\n');
    expect(ou(avecCode('src/server/bac/efface.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/bac/efface.ts:1',
      'ecrivain_hors_journal src/server/bac/efface.ts:4',
    ]);
  });

  it.each([
    ['la table nommée en capitales', "export const T = 'EVENEMENTS';"],
    ['un INSERT sans le nom de la table', "export const Q = 'insert ' + 'into ' + T;"],
    ['un UPDATE dans un gabarit', 'export const Q = `UPDATE ${t} SET charge = $1`;'],
    ['un DELETE entre guillemets doubles', 'export const Q = "delete from " + t;'],
  ])('REQ-DM-041 : le domaine du journal qui porte %s — rougit', (_q, contenu) => {
    expect(ou(avecCode('src/domain/evenement/bac.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/domain/evenement/bac.ts:1',
    ]);
  });

  it('REQ-DM-041 : contre-témoin — le domaine qui appelle `hash.update(…)` sans chaîne SQL ne rougit pas', () => {
    expect(
      ou(avecCode('src/domain/evenement/bac.ts', "export const h = hash.update(x, 'utf8');"))
    ).toEqual([]);
  });

  it('REQ-DM-041 : une écriture sur plusieurs lignes terminée par un commentaire `// from …` n’est pas effacée comme un import', () => {
    const contenu = [
      'export async function ecrire(tx: T) {',
      '  await tx',
      '    .evenement.create({ data }) // from ' + "'x'",
      '}',
    ].join('\n');
    expect(ou(avecCode('src/server/bac/commentaire.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/bac/commentaire.ts:3',
    ]);
  });

  // Revue exactitude, quatrième tour (5255150429) : une ligne qui RESSEMBLE à un import, dans un
  // gabarit SQL, était effacée par l'expression du chemin d'import — la table y est pourtant en clair.
  it('REQ-DM-041 : une ligne « import from "evenements" » DANS un gabarit SQL n’est pas un chemin d’import — rougit', () => {
    const contenu = [
      'await tx.$executeRawUnsafe(`CREATE VIEW v AS',
      '    import from "evenements"`);',
    ].join('\n');
    expect(ou(avecCode('src/server/vue.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/vue.ts:2',
    ]);
  });

  it('REQ-DM-041 : un nom IMPORTÉ (`import { evenement } from …`) reste une mention — seul le chemin est effacé', () => {
    expect(ou(avecCode('src/server/clause.ts', "import { evenement } from './x';"))).toEqual([
      'ecrivain_hors_journal src/server/clause.ts:1',
    ]);
  });

  it('REQ-DM-041 : contre-témoin — un import multiligne réel reste un chemin d’import', () => {
    const contenu = [
      'import {',
      '  ajouterEvenement,',
      '  type NouvelEvenement,',
      "} from '../evenement/journal';",
      "export * from '../evenement/journal';",
      "import * as j from '../evenement/journal';",
    ].join('\n');
    expect(ou(avecCode('src/server/appelant.ts', contenu))).toEqual([]);
  });

  // Revue schema, quatrième tour (5255123483) : Prisma 5.22 résout aussi `client.Evenement`
  // (majuscule) comme délégué — la propriété est capitalisée avant la recherche du modèle.
  it('REQ-DM-041 : le délégué pris en MAJUSCULE par un type maison (`{ Evenement: Prisma.EvenementDelegate }`) rougit', () => {
    const contenu = [
      "import type { Prisma } from '@prisma/client';",
      "import { calculerSelfHash } from '../../domain/evenement/journal';",
      'type Journal = { Evenement: Prisma.EvenementDelegate };',
      'export async function ecrire(db: Prisma.TransactionClient, e: E) {',
      '  const j = (db as unknown as Journal).Evenement;',
      "  const tete = await j.findFirst({ orderBy: { id: 'desc' } });",
      "  await j.create({ data: { ...e, charge: { courriel: 'a@b.fr' }, prevHash: tete!.selfHash, selfHash: calculerSelfHash(tete!.selfHash, e) } });",
      '}',
    ].join('\n');
    expect(ou(avecCode('src/server/relais/ecrivain.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/relais/ecrivain.ts:3',
      'ecrivain_hors_journal src/server/relais/ecrivain.ts:5',
    ]);
  });

  it('REQ-DM-041 : la forme de la revue securite (`j.Evenement.findFirstOrThrow` puis `j.Evenement.create`) rougit', () => {
    const contenu = [
      'export async function ecrire(j: Journal, e: E) {',
      "  const tete = await j.Evenement.findFirstOrThrow({ orderBy: { id: 'desc' } });",
      "  await j.Evenement.create({ data: { ...e, charge: { courriel: 'a@b.fr' }, prevHash: tete.selfHash } });",
      '}',
    ].join('\n');
    expect(ou(avecCode('src/server/relais/majuscule.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/relais/majuscule.ts:2',
      'ecrivain_hors_journal src/server/relais/majuscule.ts:3',
    ]);
  });

  it.each([
    ['\\u0065', "await tx['\\u0065venement'].create({ data });"],
    ['\\u{65}', "await tx['\\u{65}venement'].create({ data });"],
    ['\\x65', "await tx['\\x65venement'].create({ data });"],
    ['\\u0045 (majuscule)', "await tx['\\u0045venement'].create({ data });"],
  ])('REQ-DM-041 : le mot écrit avec une séquence d’échappement (%s) rougit', (_q, contenu) => {
    expect(ou(avecCode('src/server/echappe.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/echappe.ts:1',
    ]);
  });

  it('REQ-DM-041 : contre-témoin — une séquence `\\n` ou `\\u000a` n’est pas décodée et ne déplace aucune ligne', () => {
    expect(
      ou(avecCode('src/server/x.ts', "const s = 'a\\u000ab\\n';\nexport const t = 1;"))
    ).toEqual([]);
  });

  it.each([
    ['`Prisma.EvenementDelegate` dans un fichier ordinaire', 'type D = Prisma.EvenementDelegate;'],
    ['`Prisma.ModelName` dans un fichier ordinaire', 'const m: Prisma.ModelName = modele;'],
    ['le type `Evenement` importé du client', "import type { Evenement } from '@prisma/client';"],
    ['la table en CAPITALES au singulier', "const t = 'EVENEMENT';"],
  ])('REQ-DM-041 : %s — rougit', (_q, contenu) => {
    expect(ou(avecCode('src/server/ordinaire.ts', contenu))).toEqual([
      'ecrivain_hors_journal src/server/ordinaire.ts:1',
    ]);
  });

  it('REQ-DM-041 : une LECTURE du délégué hors de journal.ts rougit aussi — échec fermé', () => {
    expect(ou(avecCode('src/server/x.ts', 'await tx.evenement.findMany();'))).toEqual([
      'ecrivain_hors_journal src/server/x.ts:1',
    ]);
  });

  it('REQ-DM-041 : un fichier de packages/ qui mentionne la table rougit', () => {
    expect(ou(avecCode('packages/outil/bac.mjs', "db.query('delete from evenements')"))).toEqual([
      'ecrivain_hors_journal packages/outil/bac.mjs:1',
    ]);
  });

  it('REQ-DM-041 : un fichier du domaine du journal qui importe un client rougit — la liste blanche suppose un domaine pur', () => {
    expect(
      ou(
        avecCode(
          'src/domain/evenement/bac.ts',
          "import { PrismaClient } from '@prisma/client';\nexport const c = new PrismaClient();"
        )
      )
    ).toEqual([
      'ecrivain_hors_journal src/domain/evenement/bac.ts:1',
      'ecrivain_hors_journal src/domain/evenement/bac.ts:2',
    ]);
  });

  /** Le dépôt réel, avec UN fichier admis par contenu remplacé par sa version fautive. */
  const vueAvec = (chemin: string, modifier: (contenu: string) => string): Vue => {
    const vue = vueDuDepot();
    return {
      ...vue,
      code: vue.code.map((f) =>
        f.chemin === chemin ? { chemin, contenu: modifier(f.contenu) } : f
      ),
    };
  };
  const ligneDe = (contenu: string, fragment: string) =>
    contenu.split('\n').findIndex((l) => l.includes(fragment)) + 1;

  it('REQ-DM-041 : un fichier admis par contenu qui gagne une mention rougit sur CETTE ligne', () => {
    const chemin = 'scripts/gates/gov-check.ts';
    const vue = vueAvec(chemin, (c) => `${c}\nawait tx.evenement.create({ data });`);
    const contenu = vue.code.find((f) => f.chemin === chemin)!.contenu;
    expect(ou(vue)).toEqual([
      `ecrivain_hors_journal ${chemin}:${ligneDe(contenu, 'tx.evenement.create')}`,
    ]);
  });

  // Revue schema (5254978264) : une mention admise ÉCHANGÉE contre une écriture laissait le compte
  // égal. Le fichier est tenu par le texte de ses lignes admises, pas par leur nombre.
  it('REQ-DM-041 : dans un fichier admis du MILIEU, une mention échangée contre une écriture rougit', () => {
    const chemin = 'scripts/gates/gov-check.ts';
    const vue = vueAvec(chemin, (c) =>
      c
        .replace("'docs/adr/0008-contrat-evenements.md',", "'docs/adr/0008-contrat-événements.md',")
        .replace(/\n/, '\nconst j = tx.evenement;\n')
    );
    const contenu = vue.code.find((f) => f.chemin === chemin)!.contenu;
    expect(ou(vue)).toEqual([
      `ecrivain_hors_journal ${chemin}:${ligneDe(contenu, 'const j = tx.evenement;')}`,
    ]);
  });

  it('REQ-DM-041 : la forme exacte de la revue schema (gov-requirements.ts : mention accentuée, délégué, tête, maillon) rougit', () => {
    const chemin = 'scripts/gates/gov-requirements.ts';
    const vue = vueAvec(
      chemin,
      (c) =>
        c.replace('et son evenement', 'et son événement') +
        [
          '',
          'export async function second(tx: T, e: E) {',
          '  const j = tx.evenement;',
          "  const tete = await j.findFirst({ orderBy: { id: 'desc' } });",
          "  await j.create({ data: { ...e, charge: { courriel: 'a@b.fr' }, prevHash: tete.selfHash, selfHash: calculerSelfHash(tete.selfHash, e) } });",
          '}',
        ].join('\n')
    );
    const contenu = vue.code.find((f) => f.chemin === chemin)!.contenu;
    expect(ou(vue)).toEqual([
      `ecrivain_hors_journal ${chemin}:${ligneDe(contenu, 'const j = tx.evenement;')}`,
    ]);
  });

  it('REQ-DM-041 : une trace de client dans un fichier admis par contenu rougit, même sans mention', () => {
    const chemin = 'scripts/lot/paths-proposes.ts';
    const vue = vueAvec(chemin, (c) => `import { PrismaClient } from '@prisma/client';\n${c}`);
    expect(ou(vue)).toEqual([`ecrivain_hors_journal ${chemin}:1`]);
  });

  it('REQ-DM-041 : contre-témoin — une édition sans rapport qui DÉPLACE les lignes admises ne rougit pas', () => {
    const vue = vueAvec('scripts/gates/gov-check.ts', (c) => `// une ligne de plus en tête\n${c}`);
    expect(ou(vue)).toEqual([]);
  });

  it('REQ-DM-041 : sur le dépôt, la portée des écrivains est lue et n’est pas vide', () => {
    const vue = vueDuDepot();
    expect(vue.code.length).toBeGreaterThan(0);
    expect(vue.code.map((f) => f.chemin)).toContain('src/server/evenement/journal.ts');
    expect(controler(vue).fautes).toEqual([]);
  });

  it('REQ-DM-041 : une valeur d’enum héritée du prototype (constructor) n’a pas de charge — type_sans_charge', () => {
    expect(
      ou({
        typesDuSchema: ['journal_ouvert', 'constructor'],
        charges: { journal_ouvert: CHARGES_PAR_TYPE.journal_ouvert },
        code: [],
      })
    ).toEqual(['type_sans_charge constructor']);
  });
});

// ── la décision et le binaire ────────────────────────────────────────────────────────────────

describe('REQ-DM-041 — la garde sort en code non nul sur une faute, et en zéro en disant ce qu’elle a lu', () => {
  it('REQ-DM-041 : decider() rend 1 et nomme `type.champ` ; rend 0 et imprime le compte sur le dépôt', () => {
    const rouge = decider(conforme({ bac: z.object({ courriel: z.string() }).strict() }));
    expect(rouge.code).toBe(1);
    expect(rouge.lignes.join('\n')).toContain('bac.courriel');

    const vert = decider(vueDuDepot());
    expect(vert.code).toBe(0);
    expect(vert.lignes.join('\n')).toMatch(/[1-9]\d* type\(s\), [1-9]\d* champ\(s\) confrontés/);
  });

  it('REQ-DM-041 : --prove exige un témoin par famille, et chacun rougit la sienne', () => {
    const preuve = prouver();
    expect(preuve.code, preuve.lignes.join('\n')).toBe(0);
    for (const f of FAMILLES) expect(preuve.lignes.join('\n')).toContain(f.nom);
  });

  it('REQ-DM-041 : lancée en script — avec ou sans extension —, la garde juge le dépôt et sort en 0', () => {
    for (const script of ['scripts/gates/journal-sans-pii.ts', 'scripts/gates/journal-sans-pii']) {
      const sortie = execFileSync('npx', ['tsx', script], {
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      expect(sortie).toMatch(
        /journal:sans-pii — [1-9]\d* type\(s\), [1-9]\d* champ\(s\) confrontés/
      );
    }
  });

  it('REQ-DM-041 : lancée en script avec --prove, elle rejoue ses témoins et sort en 0', () => {
    const prove = spawnSync('npx', ['tsx', 'scripts/gates/journal-sans-pii.ts', '--prove'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(prove.status, prove.stderr).toBe(0);
    expect(prove.stdout).toContain('familles rougissent');
  });
});
