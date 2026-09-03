/**
 * contrat-hash.spec.ts — le contrat d'événements axionia → Axion Partners, et son empreinte.
 *
 * @req REQ-INT-003
 * @req REQ-INT-004
 * @req REQ-INT-029
 * @req REQ-QA-007
 * @req REQ-GOV-020
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
 *   3. REQ-INT-029 est vérifiée sur les fixtures ET sur un MUTANT. Les fixtures de v1 portent des
 *      payloads vides — le contenu des payloads est fermé par INT-T01b —, si bien qu'un détecteur
 *      cassé y serait vert. Le mutant est le contre-témoin sans lequel ce cas ne mesurerait rien.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';

import { SCHEMA_VERSION, CHAMPS_ENVELOPPE } from '../../../packages/contracts/enveloppe';
import {
  TYPES_EVENEMENT,
  TYPES_HORS_CONTRAT_V1,
  FRONTIERE_INTERDITE,
  champsInterdits,
  contratJsonSchema,
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
const REGISTRE = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as { exigences: Exigence[] };

function exigence(id: string): Exigence {
  const trouvee = REGISTRE.exigences.find((e) => e.id === id);
  if (!trouvee) throw new Error(`${id} est absente de docs/requirements.json`);
  return trouvee;
}

/** Les sept types, LUS dans le texte de REQ-INT-004 — jamais recopiés (RM-01). */
function typesSelonLExigence(): string[] {
  // Le texte énumère les types entre accents graves, puis, après le tiret cadratin, NOMME les
  // modèles réels d'axionia. Couper au tiret évite de ramasser ces noms de modèles.
  const avantLeTiret = exigence('REQ-INT-004').texte.split(' — ')[0]!;
  return [...avantLeTiret.matchAll(/`([a-z_]+\.[a-z_]+)`/g)].map((m) => m[1]!);
}

/** Les neuf champs de l'enveloppe, LUS dans le texte de REQ-INT-003 — jamais recopiés (RM-01). */
function champsSelonLExigence(): string[] {
  const bloc = /`\{([^}]+)\}`/.exec(exigence('REQ-INT-003').texte);
  if (!bloc) throw new Error("REQ-INT-003 ne porte plus d'accolade d'enveloppe : le contrat n'a plus de source.");
  return bloc[1]!
    .split(',')
    .map((c) => c.trim().replace(/\s*\(.*\)$/, ''))
    .filter((c) => c.length > 0);
}

// ── les artefacts publiés ────────────────────────────────────────────────────

const CHEMIN_JSON = join(RACINE_CONTRATS, NOM_JSON_SCHEMA);
const CHEMIN_EMPREINTE = join(RACINE_CONTRATS, NOM_EMPREINTE);
const lire = (chemin: string): string => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');

// ── les fixtures ─────────────────────────────────────────────────────────────

type Fixture = { Source: string; schemaVersion: number; evenements: Record<string, unknown>[] };
const FIXTURES = JSON.parse(
  readFileSync('tests/fixtures/axionia/enveloppes-provisoires.json', 'utf8'),
) as Fixture;

// ── ajv ──────────────────────────────────────────────────────────────────────

/**
 * `validateFormats: false` est un choix, pas un oubli : `ajv-formats` n'est pas installé et
 * `package.json` est partagé. Le schéma porte donc, pour chaque champ daté ou identifiant, un
 * `pattern` qui vaut contrôle — l'annotation `format` reste dans l'artefact publié, pour le
 * lecteur et pour l'autre dépôt.
 */
function valideur(): (donnee: unknown) => boolean {
  const Constructeur = ((Ajv2020 as unknown as { default?: unknown }).default ?? Ajv2020) as new (
    options: Record<string, unknown>,
  ) => { compile: (schema: unknown) => (donnee: unknown) => boolean };
  return new Constructeur({ strict: true, validateFormats: false, allErrors: true }).compile(contratJsonSchema());
}

/** Une enveloppe conforme, prise dans les fixtures — jamais tapée ici (RM-03). */
function enveloppeDeReference(): Record<string, unknown> {
  return structuredClone(FIXTURES.evenements[0]!);
}

describe("le contrat d'événements est fermé, dérivé, et son empreinte le tient", () => {
  it('REQ-INT-004 — la liste des types est FERMÉE sur les sept que le registre énumère', () => {
    const selonLExigence = typesSelonLExigence();
    expect(selonLExigence).toHaveLength(7);
    expect([...TYPES_EVENEMENT]).toEqual(selonLExigence);
  });

  it("REQ-INT-004 — les types nommés AILLEURS au registre sont hors du contrat v1, et chacun cite l'exigence qui le nomme", () => {
    const dansLeContrat = new Set<string>(TYPES_EVENEMENT);
    expect(TYPES_HORS_CONTRAT_V1.length).toBeGreaterThan(0);
    for (const candidat of TYPES_HORS_CONTRAT_V1) {
      expect(dansLeContrat.has(candidat.type)).toBe(false);
      // La dette est NOMMÉE : l'exigence qui porte le type existe, et son texte le cite. Le
      // registre écrit tantôt `type`, tantôt `type {champ, champ}` — la citation s'arrête donc au
      // premier accent grave OU à la première espace, jamais à une égalité de chaîne.
      const cite = new RegExp('`' + candidat.type.replace(/\./g, '\\.') + '(?:`| )');
      expect(exigence(candidat.req).texte).toMatch(cite);
    }
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

    const typeInconnu = { ...enveloppeDeReference(), event_type: 'facture.annulee' };
    expect(valide(typeInconnu)).toBe(false);

    const identifiantNonV4 = { ...enveloppeDeReference(), event_id: '00000000-0000-0000-0000-000000000000' };
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
    expect(lire(CHEMIN_EMPREINTE)).toBe(`${attendue}  ${NOM_JSON_SCHEMA}\n`);

    // La `fixtureRouge` du registre, jouée en mémoire : « renommer un champ dans
    // packages/contracts sans republier ». Sans ce cas, l'empreinte pourrait être celle d'une
    // constante figée et le test resterait vert.
    const renomme = publie.replace('"occurred_at"', '"occurredAt"');
    expect(renomme).not.toBe(publie);
    expect(empreinte(renomme)).not.toBe(attendue);
  });

  it('REQ-GOV-020 — la fixture DÉCLARE sa provenance et nomme la tâche qui la remplacera (RM-03)', () => {
    expect(FIXTURES.Source).toBeTruthy();
    expect(FIXTURES.Source).toContain('PROVISOIRE');
    expect(FIXTURES.Source).toContain('INT-T01b');
    expect(FIXTURES.schemaVersion).toBe(SCHEMA_VERSION);
    // Une fixture par type : un jeu incomplet laisserait un type sans aucun exemple valide.
    expect(FIXTURES.evenements.map((e) => e['event_type'])).toEqual([...TYPES_EVENEMENT]);
    const valide = valideur();
    for (const evenement of FIXTURES.evenements) expect(valide(evenement)).toBe(true);
  });

  it('REQ-INT-029 — aucun champ interdit ne franchit la frontière, et le détecteur sait rougir', () => {
    // Les trois familles de REQ-INT-029 sont déclarées, pas devinées.
    expect(FRONTIERE_INTERDITE.map((f) => f.famille)).toEqual([
      'montant_avant_signature',
      'identite_autre_apporteur',
      'coordonnees_du_contact',
    ]);

    // Sur les fixtures : rien ne traverse.
    for (const evenement of FIXTURES.evenements) {
      expect(champsInterdits(evenement)).toEqual([]);
    }

    // LE CONTRE-TÉMOIN. Les payloads de v1 sont vides : sans mutant, ce cas serait vert sur un
    // détecteur qui rend toujours la liste vide (RM-02).
    const mutants: { payload: Record<string, unknown>; famille: string }[] = [
      { payload: { montantHtCents: 1 }, famille: 'montant_avant_signature' },
      { payload: { autreApporteurId: 'x' }, famille: 'identite_autre_apporteur' },
      { payload: { contact: { email: 'x' } }, famille: 'coordonnees_du_contact' },
    ];
    for (const mutant of mutants) {
      const evenement = { ...enveloppeDeReference(), event_type: 'client.cree', payload: mutant.payload };
      const trouves = champsInterdits(evenement);
      expect(trouves.map((t) => t.famille), JSON.stringify(mutant.payload)).toContain(mutant.famille);
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
    const r = spawnSync('npx', ['tsx', 'scripts/contracts/export.ts', '--verifier'], {
      encoding: 'utf8',
      shell: true,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(sortie).toContain('✅');
    expect(r.status).toBe(0);
  });
});
