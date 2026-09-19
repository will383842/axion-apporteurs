// @req REQ-DM-041
/**
 * La charge d'un événement est un schéma Zod FERMÉ par type, sans donnée personnelle — DM-01
 * (gate `journal:sans-pii`, partners/ADR-0013 décision 4).
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
    expect(ou({ typesDuSchema: ['journal_ouvert', 'bac_orphelin'], charges })).toEqual([
      'type_sans_charge bac_orphelin',
    ]);
    expect(
      ou({ typesDuSchema: [], charges: { ...charges, bac: CHARGES_PAR_TYPE.journal_ouvert } })
    ).toContain('charge_sans_type bac');
  });

  it('REQ-DM-041 : un enum illisible dans le schéma est un périmètre vide, jamais un vert', () => {
    expect(ou({ typesDuSchema: [], charges: {} })).toEqual(['perimetre_vide TypeEvenementJournal']);
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
