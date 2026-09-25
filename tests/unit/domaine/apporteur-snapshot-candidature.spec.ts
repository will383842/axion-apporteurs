// @req REQ-DM-035
/**
 * `apporteur-snapshot-candidature.spec.ts` — DM-06 : l'apporteur porte le snapshot de sa
 * candidature, lu sur la fixture du producteur réel (`tests/fixtures/axionia/candidature-recue.json`).
 *
 * `sourceCanal` est une CHAÎNE TRANSPORTÉE FIGÉE (HYP-DM06-SOURCE-CANAL) : stockée telle que reçue,
 * jamais réinterprétée ni normalisée, 512 caractères au plus. Au-delà, elle n'est PAS tronquée :
 * elle est stockée nulle et l'écart est rendu à journaliser avec sa LONGUEUR, jamais sa valeur.
 *
 * TÉMOIN À DEUX FACES : 512 caractères passent intacts ; 513 donnent `null` et un écart qui ne
 * contient pas un seul caractère de la valeur.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireSchemaPrisma } from '../../../scripts/lot/lecteur-prisma';
import {
  SOURCE_CANAL_LONGUEUR_MAX,
  snapshotDeCandidature,
} from '../../../src/domain/apporteur/snapshot-candidature';

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/axionia/candidature-recue.json', 'utf8')
) as { Source: string; evenement: { event_type: string; payload: Record<string, unknown> } };
const PAYLOAD = FIXTURE.evenement.payload;

const avecSource = (sourceCanal: unknown) => ({ ...PAYLOAD, sourceCanal });

describe('REQ-DM-035 — le snapshot de candidature, tel que le producteur l’émet', () => {
  it('REQ-DM-035 : la fixture vient du producteur réel et porte l’événement `candidature.recue`', () => {
    expect(FIXTURE.Source).toMatch(/^Source: INT-T01b\b/);
    expect(FIXTURE.evenement.event_type).toBe('candidature.recue');
  });

  it('REQ-DM-035 : les sept champs du snapshot sont repris de la charge, valeur pour valeur', () => {
    const { snapshot, ecarts } = snapshotDeCandidature(PAYLOAD);
    expect(snapshot).toEqual({
      candidatureId: PAYLOAD.candidatureId,
      reponsesJson: PAYLOAD.reponsesJson,
      scoreInitial: PAYLOAD.scoreInitial,
      scorePartsJson: PAYLOAD.scorePartsJson,
      scoreBaremeVersion: PAYLOAD.scoreBaremeVersion,
      sourceCanal: PAYLOAD.sourceCanal,
      parrainCodeCapture: PAYLOAD.parrainCodeCapture,
    });
    expect(ecarts).toEqual([]);
  });

  it('REQ-DM-035 : une charge incomplète est REFUSÉE — aucun champ n’est complété', () => {
    const incomplete = { ...PAYLOAD };
    delete incomplete.scoreBaremeVersion;
    expect(() => snapshotDeCandidature(incomplete)).toThrow(/scoreBaremeVersion/);
  });
});

describe('REQ-DM-035 — `sourceCanal` : transportée figée, bornée, jamais tronquée', () => {
  it('REQ-DM-035 : stockée TELLE QUE REÇUE — ni casse, ni barre finale, ni requête retirées', () => {
    for (const brute of [
      '/Devenir-Commercial-IA/Candidature/',
      '/candidature?utm_source=x&y=1',
      ' /espace ',
    ]) {
      expect(snapshotDeCandidature(avecSource(brute)).snapshot.sourceCanal).toBe(brute);
    }
  });

  it('REQ-DM-035 : face VERTE — 512 caractères passent intacts, sans écart', () => {
    const limite = '/' + 'a'.repeat(SOURCE_CANAL_LONGUEUR_MAX - 1);
    const r = snapshotDeCandidature(avecSource(limite));
    expect(r.snapshot.sourceCanal).toBe(limite);
    expect(r.ecarts).toEqual([]);
  });

  it('REQ-DM-035 : face ROUGE — 513 caractères : `null`, jamais tronquée, écart par LONGUEUR seule', () => {
    const hostile = '/' + 'Z'.repeat(SOURCE_CANAL_LONGUEUR_MAX);
    const r = snapshotDeCandidature(avecSource(hostile));
    expect(r.snapshot.sourceCanal).toBeNull();
    expect(r.ecarts).toEqual([{ code: 'source_canal_hors_borne', longueur: 513 }]);
    // L'écart se journalise : il ne doit pas transporter un seul caractère de la valeur.
    expect(JSON.stringify(r.ecarts)).not.toContain('Z');
  });

  it('REQ-DM-035 : la borne se compte en caractères, comme la colonne — pas en unités UTF-16', () => {
    // 512 caractères hors plan de base : 1 024 unités UTF-16, et `varchar(512)` les accepte.
    const astral = '\u{1F600}'.repeat(SOURCE_CANAL_LONGUEUR_MAX);
    expect(snapshotDeCandidature(avecSource(astral)).snapshot.sourceCanal).toBe(astral);
    const r = snapshotDeCandidature(avecSource(astral + '/'));
    expect(r.snapshot.sourceCanal).toBeNull();
    expect(r.ecarts).toEqual([{ code: 'source_canal_hors_borne', longueur: 513 }]);
  });

  it('REQ-DM-035 : absente (`null`) → nulle, sans écart', () => {
    const r = snapshotDeCandidature(avecSource(null));
    expect(r.snapshot.sourceCanal).toBeNull();
    expect(r.ecarts).toEqual([]);
  });

  it('REQ-DM-035 : un type qui n’est pas une chaîne est refusé — jamais converti', () => {
    expect(() => snapshotDeCandidature(avecSource(42))).toThrow(/sourceCanal/);
  });

  it('REQ-DM-035 : la borne du domaine ÉGALE la longueur de la colonne en base (RM-01)', () => {
    const schema = lireSchemaPrisma(readFileSync('prisma/schema.prisma', 'utf8'));
    const champ = schema.modeles
      .find((m) => m.nom === 'Apporteur')
      ?.champs.find((c) => c.nom === 'sourceCanal');
    expect(champ).toMatchObject({ type: 'String', optionnel: true });
    expect(champ!.attributs).toContain(`@db.VarChar(${SOURCE_CANAL_LONGUEUR_MAX})`);
    expect(SOURCE_CANAL_LONGUEUR_MAX).toBe(512);
  });

  it('REQ-DM-035 : aucun enum de canal dans DM-06 — la dérivation appartient à une autre tâche', () => {
    const schema = lireSchemaPrisma(readFileSync('prisma/schema.prisma', 'utf8'));
    expect(schema.enums.map((e) => e.nom)).not.toContain('CanalCandidature');
  });
});
