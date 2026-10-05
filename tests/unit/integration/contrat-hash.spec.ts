/**
 * contrat-hash.spec.ts — le contrat d'événements axionia → Axion Partners, et son empreinte.
 *
 * @req REQ-INT-003
 * @req REQ-INT-004
 * @req REQ-INT-029
 * @req REQ-QA-007
 * @req REQ-GOV-020 → REQ-QA-007
 *
 * C'est le test que `docs/tasks.json` déclare pour INT-T01a sur ses cinq exigences, et le script
 * que `docs/gates.json` inscrit sous la garde `partners:contrat:hash`.
 *
 * POURQUOI IL EST SOUS `tests/unit/` ET PAS SOUS `tests/contract/`. Le registre des gardes écrit
 * aujourd'hui `tests/contract/contrat-hash.spec.ts`. Or `vitest.config.ts` n'inclut que `src/**`,
 * `tests/unit/**`, `tests/schemas/**` et `tests/gov/**` : un fichier posé sous `tests/contract/`
 * ne serait JAMAIS exécuté, et une suite qui ne tourne pas ne garde rien. Le nom de fichier — le
 * seul identifiant que `docs/tasks.json` donne — est conservé ; la correction du chemin au
 * registre est demandée dans le RENDU (`docs/gates.json` est un fichier partagé).
 *
 * CE QU'IL TIENT, ET QUI N'EXISTAIT NULLE PART.
 *
 *   1. La liste des types et les champs de l'enveloppe ne sont pas RETAPÉS ici : ils sont LUS dans
 *      `docs/requirements.json`, le registre qui fait foi (RM-01, `docs/PRESEANCE.md` §2 ligne 1).
 *      Le jour où quelqu'un ajoute un type au contrat sans l'ajouter à REQ-INT-004, ce test rougit ;
 *      le jour où le `gardien-spec` ouvre REQ-INT-004, il rougit aussi, et c'est le contrat qu'on
 *      corrige. Une liste recopiée n'aurait rien tenu du tout.
 *   2. Le JSON Schema publié est DÉRIVÉ du descripteur TypeScript ; l'empreinte est dérivée du
 *      JSON Schema. Les deux sont recalculées ici et confrontées aux fichiers commités : c'est le
 *      mécanisme par lequel une transcription divergente entre les deux dépôts devient visible
 *      (REQ-QA-007 ; `fixtureRouge` du registre : « renommer un champ dans packages/contracts sans
 *      republier »).
 *   3. REQ-INT-029 est vérifiée sur les fixtures ET sur un MUTANT : un détecteur cassé serait vert
 *      sur des fixtures sans champ interdit. Le mutant est le contre-témoin sans lequel ce cas ne
 *      mesurerait rien.
 *   4. Les payloads sont FERMÉS, et leurs `$defs` sont confrontés, clé pour clé et dans les deux
 *      sens, aux charges que le producteur réel d'axionia a générées (RM-03) : aucun champ inventé,
 *      aucun champ oublié. La copie du producteur est `tests/fixtures/axionia/fixtures-producteur.v1.json`.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';

import { SCHEMA_VERSION, CHAMPS_ENVELOPPE } from '../../../packages/contracts/enveloppe';
import {
  TYPES_EVENEMENT,
  FRONTIERE_INTERDITE,
  champsInterdits,
  contratJsonSchema,
  nomDefPayload,
} from '../../../packages/contracts/events';
import {
  RACINE_CONTRATS,
  NOM_JSON_SCHEMA,
  NOM_EMPREINTE,
  canoniser,
  empreinte,
  artefacts,
} from '../../../scripts/contracts/export';

// ── le registre, qui fait foi ────────────────────────────────────────────────

type Exigence = { id: string; texte: string; statut: string };
const REGISTRE = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
  exigences: Exigence[];
};

function exigence(id: string): Exigence {
  const trouvee = REGISTRE.exigences.find((e) => e.id === id);
  if (!trouvee) throw new Error(`${id} est absente de docs/requirements.json`);
  return trouvee;
}

/** Les types, LUS dans le texte de REQ-INT-004 — jamais recopiés (RM-01). */
function typesSelonLExigence(): string[] {
  // Le texte énumère les types entre accents graves, puis, après le tiret cadratin, NOMME les
  // modèles réels d'axionia. Couper au tiret évite de ramasser ces noms de modèles.
  const avantLeTiret = exigence('REQ-INT-004').texte.split(' — ')[0]!;
  return [...avantLeTiret.matchAll(/`([a-z_]+\.[a-z_]+)`/g)].map((m) => m[1]!);
}

/** Les neuf champs de l'enveloppe, LUS dans le texte de REQ-INT-003 — jamais recopiés (RM-01). */
function champsSelonLExigence(): string[] {
  const bloc = /`\{([^}]+)\}`/.exec(exigence('REQ-INT-003').texte);
  if (!bloc)
    throw new Error(
      "REQ-INT-003 ne porte plus d'accolade d'enveloppe : le contrat n'a plus de source."
    );
  return bloc[1]!
    .split(',')
    .map((c) => c.trim().replace(/\s*\(.*\)$/, ''))
    .filter((c) => c.length > 0);
}

// ── les artefacts publiés ────────────────────────────────────────────────────

const CHEMIN_JSON = join(RACINE_CONTRATS, NOM_JSON_SCHEMA);
const CHEMIN_EMPREINTE = join(RACINE_CONTRATS, NOM_EMPREINTE);
const lire = (chemin: string): string => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');

// ── les fixtures du producteur réel ──────────────────────────────────────────

/**
 * La copie À L'IDENTIQUE — même JSON, mise en forme par Prettier — de la fixture que le
 * producteur réel d'axionia génère (`scripts/partners/fixtures.ts`, fichier
 * `src/server/partners/contrat/fixtures.v1.json`). Elle
 * porte deux listes : les enveloppes des sept types émis en `schema_version` 1, et les charges des
 * quatre types que le producteur savait déjà construire sans pouvoir les émettre.
 */
type Charge = { event_type: string; payload: Record<string, unknown> } & Record<string, unknown>;
type FixtureProducteur = {
  Source: string;
  schemaVersion: number;
  evenements: Charge[];
  horsContratV1: Charge[];
};
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as FixtureProducteur;

/**
 * LE SEUL RENOMMAGE de la version 2, nommé ici et nulle part ailleurs : le HT encaissé d'un paiement
 * reçu sortait, en version 1, sous un nom que `docs/GLOSSAIRE.md` §3 interdit, avec son terme
 * canonique (`packages/contracts/payloads.ts`, en-tête). Le producteur le renomme en publiant la
 * version 2 ; d'ici là, la copie v1 est lue à travers cette table — une clé renommée, sa valeur
 * intacte. Un test assère que chaque renommage porte sur un champ que la copie produit vraiment.
 */
const RENOMMAGES_V2: readonly { type: string; avant: string; apres: string }[] = [
  { type: 'paiement.recu', avant: 'amountHtCents', apres: 'montantHtCents' },
];

/**
 * L'EXEMPTION NOMMÉE DE LA VERSION 3 (rattrapage 80, INT-T46-P) — deux noms, et rien d'autre : le
 * TYPE `devis.emis` et le CHAMP `devisId` de `facture.emise`, entrés au contrat en v3 avant que le
 * producteur d'axion-ia (INT-T46-A) ne les émette. Ils sont exemptés de la confrontation RM-03 à la
 * fixture du producteur, et de nulle autre : le contrat PUBLIÉ les exige (témoin ci-dessous). Aucun
 * motif, aucune liste ouverte. Un TÉMOIN rougit dès que la fixture du producteur porte l'un d'eux :
 * l'exemption tombe alors, et la confrontation reprend sur la charge produite.
 */
const SANS_FIXTURE_V3 = {
  type: 'devis.emis',
  champ: { type: 'facture.emise', nom: 'devisId' },
  /**
   * INT-T48-P, amendement de la v3 : le prix de référence de chaque LIGNE du devis signé, entré au
   * contrat avant que le producteur d'axion-ia ne l'émette. Même règle que `devisId` : exempté de
   * la confrontation à la fixture, exigé par le contrat publié, levé dès que la fixture le porte.
   */
  ligne: { type: 'devis.signe', liste: 'lignes', nom: 'prixReferenceHtCents' },
} as const;

/** Les types confrontés à la fixture : tous, sauf le type exempté. */
const TYPES_CONFRONTES = TYPES_EVENEMENT.filter((t) => t !== SANS_FIXTURE_V3.type);

/**
 * Le contrat contre lequel la charge PRODUITE se juge : le contrat publié, privé du seul champ
 * exempté (retiré des propriétés et de `required` du `$defs` de son type). Rien n'est ajouté à la
 * charge produite : elle est vérifiée, jamais complétée (RM-03).
 */
function contratConfronte(): Schema {
  const contrat = structuredClone(contratJsonSchema());
  const def = (contrat['$defs'] as Record<string, Schema>)[
    nomDefPayload(SANS_FIXTURE_V3.champ.type)
  ]!;
  delete (def['properties'] as Record<string, unknown>)[SANS_FIXTURE_V3.champ.nom];
  def['required'] = (def['required'] as string[]).filter((c) => c !== SANS_FIXTURE_V3.champ.nom);
  const { type, liste, nom } = SANS_FIXTURE_V3.ligne;
  const ligne = (
    (contrat['$defs'] as Record<string, Schema>)[nomDefPayload(type)]!['properties'] as Record<
      string,
      Schema
    >
  )[liste]!['items'] as Schema;
  delete (ligne['properties'] as Record<string, unknown>)[nom];
  ligne['required'] = (ligne['required'] as string[]).filter((c) => c !== nom);
  return contrat;
}

function enV2(charge: Charge): Charge {
  const payload: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(charge.payload)) {
    const r = RENOMMAGES_V2.find((x) => x.type === charge.event_type && x.avant === cle);
    payload[r ? r.apres : cle] = valeur;
  }
  return { ...charge, payload };
}

/** Toutes les charges produites, des types que le producteur émet, lues en version 2. */
const CHARGES_PRODUITES: Charge[] = [...PRODUCTEUR.evenements, ...PRODUCTEUR.horsContratV1].map(
  enV2
);

/**
 * L'enveloppe d'une charge produite, telle qu'elle part en `schema_version` courante. Les champs
 * posés ici sont ceux que le producteur pose À L'ÉMISSION, jamais à la génération de la fixture :
 * `schema_version` (la copie est antérieure au passage à la version courante) et `emitted_at`
 * (posé par le relais au premier envoi) ; les charges des quatre types qui n'étaient pas émis
 * n'ont, en plus, ni `event_id`, ni `producer`, ni `sequence`. Rien du payload n'est touché : il
 * est vérifié, pas complété (RM-03). Un test ci-dessous assère que, sur une enveloppe produite,
 * seuls `schema_version` et `emitted_at` changent.
 */
function aLEmission(charge: Charge): Record<string, unknown> {
  return {
    event_id: '00000000-0000-4000-8000-000000000000',
    sequence: 1,
    producer: 'axionia',
    ...structuredClone(charge),
    schema_version: SCHEMA_VERSION,
    emitted_at: charge['occurred_at'],
  };
}

// ── ajv ──────────────────────────────────────────────────────────────────────

/**
 * `validateFormats: false` est un choix, pas un oubli : `ajv-formats` n'est pas installé et
 * `package.json` est partagé. Le schéma porte donc, pour chaque champ daté ou identifiant, un
 * `pattern` qui vaut contrôle — l'annotation `format` reste dans l'artefact publié, pour le
 * lecteur et pour l'autre dépôt.
 */
function valideur(): (donnee: unknown) => boolean {
  const Constructeur = ((Ajv2020 as unknown as { default?: unknown }).default ?? Ajv2020) as new (
    options: Record<string, unknown>
  ) => { compile: (schema: unknown) => (donnee: unknown) => boolean };
  return new Constructeur({ strict: true, validateFormats: false, allErrors: true }).compile(
    contratConfronte()
  );
}

/** Une enveloppe conforme, prise dans la fixture du producteur — jamais tapée ici (RM-03). */
function enveloppeDeReference(): Record<string, unknown> {
  return aLEmission(CHARGES_PRODUITES[0]!);
}

type Valideur = ((donnee: unknown) => boolean) & { errors?: unknown[] | null };

/** Le valideur d'UN `$defs` du contrat publié. */
function valideurDe(nomDef: string): Valideur {
  const Constructeur = ((Ajv2020 as unknown as { default?: unknown }).default ?? Ajv2020) as new (
    options: Record<string, unknown>
  ) => { compile: (schema: unknown) => Valideur };
  // Les `$defs` du contrat, et rien d'autre de sa racine : l'enveloppe ne s'applique pas à une charge.
  const contrat = contratConfronte();
  return new Constructeur({ strict: true, validateFormats: false, allErrors: true }).compile({
    $schema: contrat['$schema'],
    $defs: contrat['$defs'],
    $ref: `#/$defs/${nomDef}`,
  });
}

type Schema = Record<string, unknown>;

/** Les clés que le schéma DÉCLARE, avec leur chemin, dans chaque objet FERMÉ qu'il contient. */
function clesDeclarees(schema: Schema, chemin: string, acc: Set<string>): void {
  if (schema['additionalProperties'] === false && schema['properties']) {
    for (const [cle, sous] of Object.entries(schema['properties'] as Record<string, Schema>)) {
      acc.add(`${chemin}.${cle}`);
      clesDeclarees(sous, `${chemin}.${cle}`, acc);
    }
  }
  if (schema['items']) clesDeclarees(schema['items'] as Schema, `${chemin}[]`, acc);
}

/** Les clés PRODUITES, aux mêmes chemins — en ne descendant que là où le schéma est fermé. */
function clesProduites(valeur: unknown, schema: Schema, chemin: string, acc: Set<string>): void {
  if (Array.isArray(valeur) && schema['items']) {
    for (const v of valeur) clesProduites(v, schema['items'] as Schema, `${chemin}[]`, acc);
    return;
  }
  if (valeur !== null && typeof valeur === 'object' && schema['additionalProperties'] === false) {
    const proprietes = (schema['properties'] ?? {}) as Record<string, Schema>;
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      acc.add(`${chemin}.${cle}`);
      if (proprietes[cle]) clesProduites(v, proprietes[cle]!, `${chemin}.${cle}`, acc);
    }
  }
}

describe("le contrat d'événements est fermé, dérivé, et son empreinte le tient", () => {
  it('REQ-INT-004 — la liste des types est FERMÉE sur les onze que le registre énumère, dans son ordre', () => {
    // Le TITRE est celui que promet INT-T01a (`tests{}` de `docs/tasks.json`) : il dit encore
    // « onze », la liste en compte douze depuis la v3. Le renommer est un geste du gardien.
    const selonLExigence = typesSelonLExigence();
    expect(selonLExigence).toHaveLength(12);
    expect([...TYPES_EVENEMENT]).toEqual(selonLExigence);
  });

  it('REQ-INT-004 — la version du contrat est celle que le registre écrit, pas une constante devinée', () => {
    const version = /`schema_version` (\d+)/.exec(exigence('REQ-INT-004').texte);
    expect(version, "REQ-INT-004 n'écrit plus la version du contrat").not.toBeNull();
    expect(SCHEMA_VERSION).toBe(Number(version![1]));
    expect(NOM_JSON_SCHEMA).toBe(`contracts.v${SCHEMA_VERSION}.json`);
  });

  it("REQ-INT-003 — l'enveloppe porte les neuf champs du registre, dans la casse du registre", () => {
    const selonLExigence = champsSelonLExigence();
    expect(selonLExigence).toHaveLength(9);
    expect(CHAMPS_ENVELOPPE.map((c) => c.nom)).toEqual(selonLExigence);
    // La casse est celle du registre, et l'écart avec CONVENTIONS §1 est assumé par
    // `partners/ADR-0008` : aucun champ d'enveloppe n'est en camelCase.
    for (const champ of CHAMPS_ENVELOPPE) expect(champ.nom).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("REQ-INT-003 — un événement hors schéma est REFUSÉ : c'est ce refus qui vaut le 422", () => {
    const valide = valideur();
    expect(valide(enveloppeDeReference())).toBe(true);

    const sansChamp = enveloppeDeReference();
    delete sansChamp['sequence'];
    expect(valide(sansChamp)).toBe(false);

    const champDeTrop = { ...enveloppeDeReference(), champ_inconnu: 'x' };
    expect(valide(champDeTrop)).toBe(false);

    const typeInconnu = { ...enveloppeDeReference(), event_type: 'type.inconnu' };
    expect(valide(typeInconnu)).toBe(false);

    const identifiantNonV4 = {
      ...enveloppeDeReference(),
      event_id: '00000000-0000-0000-0000-000000000000',
    };
    expect(valide(identifiantNonV4)).toBe(false);

    const versionAutre = { ...enveloppeDeReference(), schema_version: SCHEMA_VERSION + 1 };
    expect(valide(versionAutre)).toBe(false);
  });

  it('REQ-QA-007 — le JSON Schema publié est DÉRIVÉ : régénéré, il est identique au fichier commité', () => {
    const rendus = artefacts();
    const rendu = rendus.find((a) => a.chemin === CHEMIN_JSON);
    expect(rendu, `${CHEMIN_JSON} n'est pas produit par scripts/contracts/export.ts`).toBeDefined();
    expect(lire(CHEMIN_JSON)).toBe(rendu!.contenu);
    expect(rendu!.contenu).toBe(canoniser(contratJsonSchema()));
  });

  it("REQ-QA-007 — contracts.sha256 est l'empreinte du schéma publié, et un champ renommé la change", () => {
    const publie = lire(CHEMIN_JSON);
    const attendue = empreinte(publie);
    expect(lire(CHEMIN_EMPREINTE).split('\n')[0]).toBe(`${attendue}  ${NOM_JSON_SCHEMA}`);

    // La `fixtureRouge` du registre, jouée en mémoire : « renommer un champ dans
    // packages/contracts sans republier ». Sans ce cas, l'empreinte pourrait être celle d'une
    // constante figée et le test resterait vert.
    const renomme = publie.replace('"occurred_at"', '"occurredAt"');
    expect(renomme).not.toBe(publie);
    expect(empreinte(renomme)).not.toBe(attendue);
  });

  it('REQ-GOV-020 → REQ-QA-007 — la fixture est celle du PRODUCTEUR RÉEL, et elle couvre les onze types (RM-03)', () => {
    expect(PRODUCTEUR.Source).toMatch(
      /^GÉNÉRÉE — ne pas éditer à la main\. Producteur : axionia, scripts\/partners\/fixtures\.ts/
    );
    // Un jeu incomplet laisserait un type sans aucun exemple produit : son `$defs` serait deviné.
    const produits = new Set(CHARGES_PRODUITES.map((c) => c.event_type));
    expect([...TYPES_EVENEMENT].filter((t) => !produits.has(t))).toEqual([SANS_FIXTURE_V3.type]);
    expect(
      [...produits].filter((t) => !(TYPES_EVENEMENT as readonly string[]).includes(t))
    ).toEqual([]);
  });

  it('REQ-QA-007 — chaque renommage de la version 2 porte sur un champ que le producteur produit, et rien d’autre ne change', () => {
    for (const r of RENOMMAGES_V2) {
      const avant = [...PRODUCTEUR.evenements, ...PRODUCTEUR.horsContratV1].filter(
        (c) => c.event_type === r.type
      );
      expect(avant.length, r.type).toBeGreaterThan(0);
      for (const charge of avant) {
        expect(Object.keys(charge.payload), r.type).toContain(r.avant);
        const apres = enV2(charge).payload;
        expect(Object.keys(apres)).not.toContain(r.avant);
        expect(apres[r.apres]).toBe(charge.payload[r.avant]);
        expect(Object.keys(apres)).toHaveLength(Object.keys(charge.payload).length);
      }
    }
  });

  it("REQ-QA-007 — l'enveloppe à l'émission ne pose que `schema_version` et `emitted_at` : la charge produite n'est pas touchée", () => {
    for (const charge of PRODUCTEUR.evenements.map(enV2)) {
      const emise = aLEmission(charge);
      const changes = Object.keys(emise).filter(
        (k) => JSON.stringify(emise[k]) !== JSON.stringify(charge[k])
      );
      expect(changes.sort()).toEqual(['emitted_at', 'schema_version']);
      expect(valideur()(emise), charge.event_type).toBe(true);
    }
  });

  it('REQ-QA-007 — les `$defs` de payload confrontés sont FERMÉS et égaux, clé pour clé, à ce que le producteur réel produit', () => {
    const defs = contratConfronte()['$defs'] as Record<string, Schema>;
    for (const type of TYPES_CONFRONTES) {
      const schema = defs[nomDefPayload(type)]!;
      expect(schema['additionalProperties'], type).toBe(false);
      expect([...((schema['required'] as string[] | undefined) ?? [])].sort(), type).toEqual(
        Object.keys((schema['properties'] as object | undefined) ?? {}).sort()
      );

      const declarees = new Set<string>();
      clesDeclarees(schema, 'payload', declarees);
      const produites = new Set<string>();
      const valide = valideurDe(nomDefPayload(type));
      for (const charge of CHARGES_PRODUITES.filter((c) => c.event_type === type)) {
        expect(valide(charge.payload), `${type} : ${JSON.stringify(valide.errors)}`).toBe(true);
        clesProduites(charge.payload, schema, 'payload', produites);
      }
      // Dans les DEUX sens : un champ déclaré que le producteur ne produit pas est deviné ; un
      // champ produit que le schéma ne déclare pas serait refusé en 422.
      expect([...declarees].sort(), type).toEqual([...produites].sort());
    }
  });

  it('REQ-QA-007 — TÉMOIN À DEUX FACES : un champ non déclaré est refusé et NOMMÉ, la charge produite passe', () => {
    for (const type of TYPES_CONFRONTES) {
      const charge = CHARGES_PRODUITES.find((c) => c.event_type === type)!;
      const valide = valideurDe(nomDefPayload(type));
      expect(valide(charge.payload), type).toBe(true);

      const avecIntrus = { ...structuredClone(charge.payload), champIntrus: 1 };
      expect(valide(avecIntrus), type).toBe(false);
      expect(JSON.stringify(valide.errors), type).toContain('"additionalProperty":"champIntrus"');

      // Et à travers l'enveloppe entière : l'`allOf` du contrat branche chaque type sur SON payload.
      expect(valideur()(aLEmission(charge)), type).toBe(true);
      expect(valideur()({ ...aLEmission(charge), payload: avecIntrus }), type).toBe(false);
    }
  });

  it('REQ-QA-007 — l’exemption de la v3 ne masque rien : le contrat PUBLIÉ ferme `devis.emis` et EXIGE `devisId` sur `facture.emise`', () => {
    const defs = contratJsonSchema()['$defs'] as Record<string, Schema>;
    const devisEmis = defs[nomDefPayload(SANS_FIXTURE_V3.type)]!;
    expect(devisEmis['additionalProperties']).toBe(false);
    expect(devisEmis['required']).toEqual(Object.keys(devisEmis['properties'] as object));
    const facture = defs[nomDefPayload(SANS_FIXTURE_V3.champ.type)]!;
    expect(facture['required']).toContain(SANS_FIXTURE_V3.champ.nom);
    expect(Object.keys(facture['properties'] as object)).toContain(SANS_FIXTURE_V3.champ.nom);
    // Et la confrontation n'en retire QUE ce champ-là.
    const confronte = (contratConfronte()['$defs'] as Record<string, Schema>)[
      nomDefPayload(SANS_FIXTURE_V3.champ.type)
    ]!;
    expect(
      Object.keys(facture['properties'] as object).filter(
        (c) => !Object.keys(confronte['properties'] as object).includes(c)
      )
    ).toEqual([SANS_FIXTURE_V3.champ.nom]);
  });

  it('REQ-QA-007 — TÉMOIN DE LEVÉE : dès que la fixture du producteur porte `devis.emis` ou `devisId`, l’exemption de la v3 doit tomber', () => {
    const toutes = [...PRODUCTEUR.evenements, ...PRODUCTEUR.horsContratV1];
    expect(
      toutes.filter((c) => c.event_type === SANS_FIXTURE_V3.type),
      'la fixture porte `devis.emis` : retirer le type de SANS_FIXTURE_V3'
    ).toEqual([]);
    expect(
      toutes.filter(
        (c) =>
          c.event_type === SANS_FIXTURE_V3.champ.type &&
          Object.hasOwn(c.payload, SANS_FIXTURE_V3.champ.nom)
      ),
      'la fixture porte `devisId` : retirer le champ de SANS_FIXTURE_V3'
    ).toEqual([]);
  });

  /** La ligne du devis signé, au contrat donné. */
  const ligneDuDevisSigne = (contrat: Schema): Schema => {
    const { type, liste } = SANS_FIXTURE_V3.ligne;
    return (
      (contrat['$defs'] as Record<string, Schema>)[nomDefPayload(type)]!['properties'] as Record<
        string,
        Schema
      >
    )[liste]!['items'] as Schema;
  };

  it('REQ-INT-003 — l’exemption de la ligne ne masque rien : le contrat PUBLIÉ EXIGE `prixReferenceHtCents` sur chaque ligne du devis signé, et la confrontation ne retire que lui', () => {
    const { nom } = SANS_FIXTURE_V3.ligne;
    const publiee = ligneDuDevisSigne(contratJsonSchema());
    expect(publiee['additionalProperties']).toBe(false);
    expect(publiee['required']).toContain(nom);
    expect(Object.keys(publiee['properties'] as object)).toContain(nom);
    const confrontee = ligneDuDevisSigne(contratConfronte());
    expect(
      Object.keys(publiee['properties'] as object).filter(
        (c) => !Object.keys(confrontee['properties'] as object).includes(c)
      )
    ).toEqual([nom]);
  });

  it('REQ-QA-007 — TÉMOIN DE LEVÉE : dès qu’une ligne de devis signé de la fixture porte `prixReferenceHtCents`, l’exemption de la ligne doit tomber', () => {
    const { type, liste, nom } = SANS_FIXTURE_V3.ligne;
    const lignes = [...PRODUCTEUR.evenements, ...PRODUCTEUR.horsContratV1]
      .filter((c) => c.event_type === type)
      .flatMap((c) => (c.payload[liste] as Record<string, unknown>[] | undefined) ?? []);
    expect(lignes.length, `la fixture porte au moins une ligne de ${type}`).toBeGreaterThan(0);
    expect(
      lignes.filter((l) => Object.hasOwn(l, nom)),
      'la fixture porte `prixReferenceHtCents` : retirer la ligne de SANS_FIXTURE_V3'
    ).toEqual([]);
  });

  it('REQ-QA-007 — le contrat compte les API que le registre compte, et la route des coordonnées est sous son empreinte', async () => {
    const { API_COORDONNEES_CANDIDATURE, nomsDefsApi } =
      await import('../../../packages/contracts/api');
    const texte = exigence('REQ-QA-007').texte;
    const compte = /les (\d+) API/.exec(texte);
    expect(compte, "REQ-QA-007 ne compte plus d'API").not.toBeNull();
    expect(Number(compte![1])).toBe(3);
    expect(texte).toContain(API_COORDONNEES_CANDIDATURE.chemin);

    // Sous la MÊME empreinte que le reste du contrat : ses `$defs` sont dans le JSON Schema publié.
    const publie = JSON.parse(lire(CHEMIN_JSON)) as { $defs: Record<string, unknown> };
    expect(nomsDefsApi().length).toBeGreaterThan(0);
    for (const nom of nomsDefsApi()) expect(Object.keys(publie.$defs)).toContain(nom);
  });

  it('REQ-INT-029 — aucun champ interdit ne franchit la frontière, et le détecteur sait rougir', () => {
    // Les trois familles de REQ-INT-029 sont déclarées, pas devinées.
    expect(FRONTIERE_INTERDITE.map((f) => f.famille)).toEqual([
      'montant_avant_signature',
      'identite_autre_apporteur',
      'coordonnees_du_contact',
    ]);

    // Sur les charges du producteur réel : rien ne traverse.
    for (const charge of CHARGES_PRODUITES) {
      expect(champsInterdits(aLEmission(charge)), charge.event_type).toEqual([]);
    }

    // LE CONTRE-TÉMOIN : sans mutant, ce cas serait vert sur un détecteur qui rend toujours la
    // liste vide (RM-02).
    const mutants: { payload: Record<string, unknown>; famille: string }[] = [
      { payload: { montantHtCents: 1 }, famille: 'montant_avant_signature' },
      { payload: { autreApporteurId: 'x' }, famille: 'identite_autre_apporteur' },
      { payload: { contact: { email: 'x' } }, famille: 'coordonnees_du_contact' },
    ];
    for (const mutant of mutants) {
      const evenement = {
        ...enveloppeDeReference(),
        event_type: 'client.cree',
        payload: mutant.payload,
      };
      const trouves = champsInterdits(evenement);
      expect(
        trouves.map((t) => t.famille),
        JSON.stringify(mutant.payload)
      ).toContain(mutant.famille);
    }

    // `subject_ref` est la seule valeur du contrat dont la forme n'est pas arrêtée : une chaîne
    // libre y passe la frontière sans clé pour la trahir. Le détecteur regarde donc aussi la
    // VALEUR de la racine.
    const parLaValeur = champsInterdits({
      ...enveloppeDeReference(),
      subject_ref: 'contact@exemple.invalid',
    });
    expect(parLaValeur.map((t) => t.chemin)).toContain('subject_ref');
  });
});

describe('la garde de dérivation du contrat tourne dans la suite', () => {
  // `package.json` est partagé : l'alias `pnpm contracts:export` n'y est pas encore (le diff est
  // dans le RENDU d'INT-T01a). Sans ce cas, la garde existerait sans jamais s'exécuter — et une
  // garde qui ne tourne pas ne garde rien.
  it("REQ-QA-007 — `contracts:export --verifier` est vert sur l'état du dépôt", () => {
    // Joué à la RACINE DU DÉPÔT : dans le bac à sable de Stryker, chaque `.ts` copié reçoit un
    // `// @ts-nocheck` qui change l'empreinte de `signature-relecture.ts` sans rien dire du contrat.
    const racine = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).stdout.trim();
    const r = spawnSync('npx', ['tsx', 'scripts/contracts/export.ts', '--verifier'], {
      encoding: 'utf8',
      shell: true,
      cwd: racine,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(sortie).toContain('✅');
    expect(r.status).toBe(0);
  });
});
