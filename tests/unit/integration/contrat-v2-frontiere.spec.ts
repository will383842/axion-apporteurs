// @req REQ-INT-032
// @req REQ-INT-029 → REQ-INT-032
/**
 * contrat-v2-frontiere.spec.ts — la charge de la candidature entre au contrat, et la frontière de
 * REQ-INT-029 n'en sort pas affaiblie.
 *
 * DEUX CHOSES, ET LEUR CONTRADICTION ÉCRITE. REQ-INT-032 décrit la charge de la candidature avec un
 * champ `parrainCodeCapture` ; la famille `identite_autre_apporteur` de la frontière refuse toute clé
 * qui contient « parrain », et elle a raison de le faire (partners/ADR-0008, reste à faire §4). Ce
 * spec tient l'arbitrage : une EXEMPTION NOMMÉE — un type, un chemin, une forme de valeur, et
 * l'exigence qui la porte —, jamais un motif resserré. Chaque borne a son contre-témoin.
 *
 * Et le contrat reste SANS donnée personnelle (partners/ADR-0023) : aucun `$defs` de payload ne
 * déclare un champ que la famille `coordonnees_du_contact` reconnaîtrait, et la garde qui la tient
 * n'est ni exemptée ni resserrée.
 *
 * Les charges viennent de la fixture du producteur réel d'axionia, copiée octet pour octet
 * (RM-03) ; les champs attendus sont LUS dans le texte de REQ-INT-032, jamais recopiés (RM-01).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { SCHEMA_VERSION } from '../../../packages/contracts/enveloppe';
import {
  EXEMPTIONS_NOMMEES,
  FRONTIERE_INTERDITE,
  TYPES_EVENEMENT,
  champsInterdits,
  contratJsonSchema,
  nomDefPayload,
  type TypeEvenement,
} from '../../../packages/contracts/events';

// ── le registre ──────────────────────────────────────────────────────────────

type Exigence = { id: string; texte: string };
const REGISTRE = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
  exigences: Exigence[];
};
const texteDe = (id: string): string => {
  const e = REGISTRE.exigences.find((x) => x.id === id);
  if (!e) throw new Error(`${id} est absente de docs/requirements.json`);
  return e.texte;
};

/** `type {a, b[], c}` → les champs que REQ-INT-032 nomme, par type. */
function champsSelonREQ032(): Map<string, string[]> {
  const parType = new Map<string, string[]>();
  for (const m of texteDe('REQ-INT-032').matchAll(/`([a-z_]+\.[a-z_]+) \{([^}]+)\}`/g)) {
    parType.set(
      m[1]!,
      m[2]!.split(',').map((c) => c.trim().replace(/\[\]$/, ''))
    );
  }
  return parType;
}

// ── la fixture du producteur ─────────────────────────────────────────────────

type Charge = { event_type: string; payload: Record<string, unknown> } & Record<string, unknown>;
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: Charge[]; horsContratV1: Charge[] };
const CHARGES: Charge[] = [...PRODUCTEUR.evenements, ...PRODUCTEUR.horsContratV1];

/** Le type, pris dans le contrat — le seul endroit du dépôt où un nom d'événement s'écrit. */
const typeQuiCommencePar = (prefixe: string): TypeEvenement =>
  TYPES_EVENEMENT.find((t) => t.startsWith(prefixe))!;

const CANDIDATURE = typeQuiCommencePar('candidature.');
const ANNULATION = TYPES_EVENEMENT.filter((t) => t.startsWith('facture.')).find(
  (t) => t !== typeQuiCommencePar('facture.')
)!;

const chargeDe = (type: string): Charge => structuredClone(CHARGES.find((c) => c.event_type === type)!);

/** L'enveloppe d'une charge, pour la frontière — qui ne regarde que `payload` et `subject_ref`. */
function enveloppe(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    event_id: '00000000-0000-4000-8000-000000000000',
    event_type: type,
    schema_version: SCHEMA_VERSION,
    occurred_at: '2026-01-01T00:00:00.000Z',
    emitted_at: '2026-01-01T00:00:00.000Z',
    producer: 'axionia',
    subject_ref: chargeDe(type)['subject_ref'],
    sequence: 1,
    payload,
  };
}

const familles = (evt: Record<string, unknown>): string[] =>
  champsInterdits(evt).map((c) => `${c.famille}@${c.chemin}`);

/** Un code de parrainage de la forme exemptée : capitales, chiffres, tirets. */
const CODE = 'AXP-7Q2K';

describe('REQ-INT-032 — la charge de la candidature traverse, la frontière reste fermée', () => {
  it("REQ-INT-032 — l'exemption est UNE, nommée, typée, et elle cite l'exigence qui la porte", () => {
    expect(EXEMPTIONS_NOMMEES).toHaveLength(1);
    const [e] = EXEMPTIONS_NOMMEES;
    expect(e!.famille).toBe('identite_autre_apporteur');
    expect(e!.type).toBe(CANDIDATURE);
    expect(e!.chemin).toBe('payload.parrainCodeCapture');
    expect(e!.exigence).toBe('REQ-INT-032');
    // L'exigence citée nomme bien ce champ sur ce type.
    expect(champsSelonREQ032().get(CANDIDATURE)).toContain('parrainCodeCapture');
    // Et la famille exemptée existe : une exemption d'une famille disparue ne protégerait rien.
    expect(FRONTIERE_INTERDITE.map((f) => f.famille)).toContain(e!.famille);
  });

  it('REQ-INT-032 — la candidature du producteur réel franchit la frontière, champ nul compris', () => {
    const charge = chargeDe(CANDIDATURE);
    expect(charge.payload['parrainCodeCapture']).toBeNull();
    expect(familles(enveloppe(CANDIDATURE, charge.payload))).toEqual([]);
  });

  it('REQ-INT-032 — un code de parrainage de la forme attendue traverse', () => {
    const payload = { ...chargeDe(CANDIDATURE).payload, parrainCodeCapture: CODE };
    expect(familles(enveloppe(CANDIDATURE, payload))).toEqual([]);
  });

  it("REQ-INT-029 → REQ-INT-032 — hors de sa forme, la valeur n'est PAS exemptée : un nom ou une adresse rougit", () => {
    const nom = { ...chargeDe(CANDIDATURE).payload, parrainCodeCapture: 'Jean Dupont' };
    expect(familles(enveloppe(CANDIDATURE, nom))).toEqual([
      'identite_autre_apporteur@payload.parrainCodeCapture',
    ]);

    const adresse = { ...chargeDe(CANDIDATURE).payload, parrainCodeCapture: 'jean@exemple.fr' };
    expect(familles(enveloppe(CANDIDATURE, adresse)).sort()).toEqual([
      'coordonnees_du_contact@payload.parrainCodeCapture',
      'identite_autre_apporteur@payload.parrainCodeCapture',
    ]);
  });

  it("REQ-INT-029 → REQ-INT-032 — l'exemption ne vaut que sur SON type et SON chemin", () => {
    // Sur un autre type : refusé.
    const ailleurs = { ...chargeDe(ANNULATION).payload, parrainCodeCapture: CODE };
    expect(familles(enveloppe(ANNULATION, ailleurs))).toEqual([
      'identite_autre_apporteur@payload.parrainCodeCapture',
    ]);

    // Plus profond dans la même charge : refusé — l'exemption est un chemin, pas un nom de feuille.
    const charge = chargeDe(CANDIDATURE).payload;
    const niche = {
      ...charge,
      reponsesJson: { ...(charge['reponsesJson'] as object), parrainCodeCapture: CODE },
    };
    expect(familles(enveloppe(CANDIDATURE, niche))).toEqual([
      'identite_autre_apporteur@payload.reponsesJson.parrainCodeCapture',
    ]);

    // Un autre champ « parrain » sur le bon type : refusé — le motif n'a pas été resserré.
    const voisin = { ...charge, parrainNom: 'X' };
    expect(familles(enveloppe(CANDIDATURE, voisin))).toContain('identite_autre_apporteur@payload.parrainNom');
  });

  it("REQ-INT-029 → REQ-INT-032 — la garde des coordonnées n'est pas affaiblie sur la candidature", () => {
    const charge = chargeDe(CANDIDATURE).payload;
    expect(familles(enveloppe(CANDIDATURE, { ...charge, email: 'x' }))).toContain(
      'coordonnees_du_contact@payload.email'
    );
    expect(familles(enveloppe(CANDIDATURE, { ...charge, sourceCanal: 'a@b.fr' }))).toContain(
      'coordonnees_du_contact@payload.sourceCanal'
    );
  });

  it('REQ-INT-029 → REQ-INT-032 — le contrat reste SANS donnée personnelle : aucun `$defs` de payload ne déclare une coordonnée', () => {
    const coordonnees = FRONTIERE_INTERDITE.find((f) => f.famille === 'coordonnees_du_contact')!;
    const defs = contratJsonSchema()['$defs'] as Record<string, Record<string, unknown>>;
    const declarees: string[] = [];
    const descendre = (schema: Record<string, unknown>, chemin: string): void => {
      for (const [cle, sous] of Object.entries((schema['properties'] ?? {}) as Record<string, Record<string, unknown>>)) {
        declarees.push(`${chemin}.${cle}`);
        descendre(sous, `${chemin}.${cle}`);
      }
      if (schema['items']) descendre(schema['items'] as Record<string, unknown>, `${chemin}[]`);
    };
    for (const type of TYPES_EVENEMENT) descendre(defs[nomDefPayload(type)]!, type);
    expect(declarees.length).toBeGreaterThan(TYPES_EVENEMENT.length);
    expect(declarees.filter((c) => coordonnees.motifCle.test(c.split('.').pop()!))).toEqual([]);
  });

  it('REQ-INT-032 — chaque champ que REQ-INT-032 nomme est déclaré par le `$defs` de son type', () => {
    const attendus = champsSelonREQ032();
    // Les quatre charges que l'exigence décrit — une liste vide ferait passer ce cas sans rien voir.
    expect(attendus.size).toBe(4);
    const defs = contratJsonSchema()['$defs'] as Record<string, { properties?: Record<string, unknown> }>;
    for (const [type, champs] of attendus) {
      expect(TYPES_EVENEMENT as readonly string[], type).toContain(type);
      const declares = Object.keys(defs[nomDefPayload(type as TypeEvenement)]!.properties ?? {});
      expect(champs.filter((c) => !declares.includes(c)), type).toEqual([]);
    }
  });
});
