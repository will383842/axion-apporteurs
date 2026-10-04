// @req REQ-JUR-063
/**
 * DM-56 — l'admission au KYC refuse par motif NOMMÉ, et le contrôle croisé ne refuse jamais.
 *
 * CE QU'IL FIGE :
 *   — quatre motifs, codes du domaine NON persistés (précision (c) d'A02 : aucune migration pour
 *     eux) : `siren_inactif`, `lien_avec_la_societe`, `statut_hors_liste`, `profession_exclue` ;
 *     chacun a son témoin, et plusieurs motifs se rendent ensemble, dans cet ordre ;
 *   — contre l'oracle (lentille sécurité, 2026-10-02) : `lien_avec_la_societe` ne naît QUE de la
 *     déclaration de la personne ; le contrôle croisé (REQ-CPL-030) BLOQUE pour revue humaine sans
 *     jamais refuser, et la réponse au candidat est IDENTIQUE qu'il y ait correspondance ou non ; la
 *     comparaison porte sur des empreintes, et une empreinte hors forme envoie en revue (échec
 *     fermé) ; le journal ne porte ni nom, ni adresse, ni empreinte ;
 *   — le signal « attestation spécifique requise » de REQ-JUR-022 reste inchangé : les professions
 *     réglementées admissibles ne sont pas exclues d'office ;
 *   — le module est du domaine pur : il ne persiste rien, ne lit aucune clé, ne calcule aucune
 *     empreinte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import {
  CODES_NAF_EXCLUS,
  MOTIFS_REFUS_ADMISSION,
  correspondAUnConseillerActif,
  estProfessionExclue,
  jugerAdmission,
  type CandidatureAdmission,
} from '../../../src/domain/kyc/admission';

/** Deux empreintes de courriel bien formées (64 hexadécimaux minuscules), jamais un clair. */
const EMPREINTE_CONSEILLER = 'a'.repeat(64);
const EMPREINTE_AUTRE = '0123456789abcdef'.repeat(4);
const CONSEILLERS_ACTIFS: ReadonlySet<string> = new Set([EMPREINTE_CONSEILLER]);

/** Une candidature admissible ; chaque témoin n'en change qu'un trait. */
function candidature(changement: Partial<CandidatureAdmission> = {}): CandidatureAdmission {
  return {
    sirenActif: true,
    lienDeclareAvecLaSociete: false,
    statutJuridique: 'sas',
    codeNaf: '62.01Z',
    empreinteCourriel: EMPREINTE_AUTRE,
    ...changement,
  };
}

describe('REQ-JUR-063 — les motifs nommés, non persistés', () => {
  it('REQ-JUR-063 : TEST HYP — exactement quatre motifs, dans cet ordre', () => {
    expect([...MOTIFS_REFUS_ADMISSION]).toEqual([
      'siren_inactif',
      'lien_avec_la_societe',
      'statut_hors_liste',
      'profession_exclue',
    ]);
  });

  it('REQ-JUR-063 : TÉMOIN — aucun motif n’est une valeur d’enum en base : ils ne sont pas persistés', () => {
    const valeurs = Prisma.dmmf.datamodel.enums.flatMap((e) => e.values.map((v) => v.name));
    for (const m of MOTIFS_REFUS_ADMISSION) expect(valeurs).not.toContain(m);
  });

  it('REQ-JUR-063 : TÉMOIN — une candidature admissible est reçue, sans motif ni revue', () => {
    const j = jugerAdmission(candidature(), CONSEILLERS_ACTIFS);
    expect(j.reponse).toEqual({ issue: 'recue' });
    expect(j.revueHumaine).toBe(false);
  });
});

describe('REQ-JUR-063 — chaque motif a son témoin', () => {
  it('REQ-JUR-063 : TÉMOIN `siren_inactif` — sans SIREN actif, l’admission refuse', () => {
    expect(jugerAdmission(candidature({ sirenActif: false }), CONSEILLERS_ACTIFS).reponse).toEqual({
      issue: 'refusee',
      motifs: ['siren_inactif'],
    });
  });

  it('REQ-JUR-063 : TÉMOIN `siren_inactif` — un état du SIREN inconnu vaut inactif (échec fermé)', () => {
    for (const inconnu of [undefined, null, 'true', 1]) {
      expect(
        jugerAdmission(candidature({ sirenActif: inconnu as never }), CONSEILLERS_ACTIFS).reponse
      ).toEqual({ issue: 'refusee', motifs: ['siren_inactif'] });
    }
  });

  it('REQ-JUR-063 : TÉMOIN `lien_avec_la_societe` — salariée, dirigeante ou associée d’Axion-IA SUR SA DÉCLARATION, la personne est refusée', () => {
    expect(
      jugerAdmission(candidature({ lienDeclareAvecLaSociete: true }), new Set()).reponse
    ).toEqual({ issue: 'refusee', motifs: ['lien_avec_la_societe'] });
  });

  it('REQ-JUR-063 : TÉMOIN `lien_avec_la_societe` — le motif ne naît QUE de la déclaration : une correspondance au contrôle croisé ne le produit jamais', () => {
    const j = jugerAdmission(
      candidature({ empreinteCourriel: EMPREINTE_CONSEILLER, lienDeclareAvecLaSociete: false }),
      CONSEILLERS_ACTIFS
    );
    expect(j.reponse).toEqual({ issue: 'recue' });
    expect(j.revueHumaine).toBe(true);
    for (const pasUneDeclaration of [undefined, null, 'oui', 1]) {
      expect(
        jugerAdmission(
          candidature({ lienDeclareAvecLaSociete: pasUneDeclaration as never }),
          CONSEILLERS_ACTIFS
        ).reponse
      ).toEqual({ issue: 'recue' });
    }
  });

  it('REQ-JUR-063 : TÉMOIN `statut_hors_liste` — un statut hors de la liste de REQ-DM-065 est refusé', () => {
    for (const hors of [
      'portage_salarial',
      'entrepreneur_salarie',
      'SAS',
      '',
      null,
      undefined,
      7,
    ]) {
      expect(
        jugerAdmission(candidature({ statutJuridique: hors }), CONSEILLERS_ACTIFS).reponse
      ).toEqual({ issue: 'refusee', motifs: ['statut_hors_liste'] });
    }
  });

  it('REQ-JUR-063 : TÉMOIN `statut_hors_liste` — chacun des huit statuts de la liste est admis', () => {
    for (const s of [
      'micro_entrepreneur',
      'entrepreneur_individuel',
      'sarl',
      'eurl',
      'sas',
      'sasu',
      'sa',
      'snc',
    ]) {
      expect(
        jugerAdmission(candidature({ statutJuridique: s }), CONSEILLERS_ACTIFS).reponse
      ).toEqual({ issue: 'recue' });
    }
  });

  it('REQ-JUR-063 : TÉMOIN `profession_exclue` — chaque code de la liste figée est exclu d’office', () => {
    expect(CODES_NAF_EXCLUS.length).toBeGreaterThan(0);
    for (const code of CODES_NAF_EXCLUS) {
      expect(estProfessionExclue(code)).toBe(true);
      expect(jugerAdmission(candidature({ codeNaf: code }), CONSEILLERS_ACTIFS).reponse).toEqual({
        issue: 'refusee',
        motifs: ['profession_exclue'],
      });
    }
  });

  it('REQ-JUR-063 : TÉMOIN `profession_exclue` — la liste FIGÉE de la juriste (#563, commentaire 5981998246) : douze codes, dans cet ordre', () => {
    expect([...CODES_NAF_EXCLUS]).toEqual([
      '69.10Z',
      '86.10Z',
      '86.21Z',
      '86.22A',
      '86.22B',
      '86.22C',
      '86.23Z',
      '86.90A',
      '86.90B',
      '86.90D',
      '86.90E',
      '47.73Z',
    ]);
  });

  it('REQ-JUR-063 : TÉMOIN `profession_exclue` — un code voisin qui mêle professions réglementées et activités libres n’exclut PAS d’office : il relève de la revue humaine (REQ-JUR-022)', () => {
    for (const code of ['86.90C', '86.90F', '75.00Z']) {
      expect(estProfessionExclue(code), code).toBe(false);
      expect(jugerAdmission(candidature({ codeNaf: code }), CONSEILLERS_ACTIFS).reponse).toEqual({
        issue: 'recue',
      });
    }
  });

  it('REQ-JUR-063 : TÉMOIN `profession_exclue` — la liste est en nomenclature NAF rév. 2, sans doublon', () => {
    for (const code of CODES_NAF_EXCLUS) expect(code).toMatch(/^\d{2}\.\d{2}[A-Z]$/);
    expect(new Set(CODES_NAF_EXCLUS).size).toBe(CODES_NAF_EXCLUS.length);
  });

  it('REQ-JUR-063 : TÉMOIN `profession_exclue` — un code hors liste, hors forme ou absent n’exclut pas', () => {
    for (const code of ['62.01Z', '70.22Z', null, '', '6910Z', '69.10z']) {
      expect(estProfessionExclue(code)).toBe(false);
    }
  });

  it('REQ-JUR-063 : TÉMOIN — le signal de REQ-JUR-022 reste inchangé : les professions réglementées admissibles ne sont PAS exclues d’office', () => {
    for (const code of ['69.20Z', '66.19B', '66.22Z']) {
      expect(CODES_NAF_EXCLUS).not.toContain(code);
      expect(jugerAdmission(candidature({ codeNaf: code }), CONSEILLERS_ACTIFS).reponse).toEqual({
        issue: 'recue',
      });
    }
  });

  it('REQ-JUR-063 : TÉMOIN — plusieurs motifs se rendent ENSEMBLE, dans l’ordre des motifs', () => {
    const tout = jugerAdmission(
      candidature({
        sirenActif: false,
        lienDeclareAvecLaSociete: true,
        statutJuridique: 'portage_salarial',
        codeNaf: CODES_NAF_EXCLUS[0]!,
      }),
      CONSEILLERS_ACTIFS
    );
    expect(tout.reponse).toEqual({ issue: 'refusee', motifs: [...MOTIFS_REFUS_ADMISSION] });
  });
});

describe('REQ-JUR-063 — le contrôle croisé (REQ-CPL-030) bloque, il ne refuse pas', () => {
  it('REQ-JUR-063 : TÉMOIN — deux candidatures, correspondante et non correspondante, reçoivent la MÊME réponse', () => {
    const correspondante = jugerAdmission(
      candidature({ empreinteCourriel: EMPREINTE_CONSEILLER }),
      CONSEILLERS_ACTIFS
    );
    const autre = jugerAdmission(
      candidature({ empreinteCourriel: EMPREINTE_AUTRE }),
      CONSEILLERS_ACTIFS
    );
    expect(correspondante.reponse).toEqual(autre.reponse);
    expect(JSON.stringify(correspondante.reponse)).toBe(JSON.stringify(autre.reponse));
    expect(correspondante.revueHumaine).toBe(true);
    expect(autre.revueHumaine).toBe(false);
  });

  it('REQ-JUR-063 : TÉMOIN — même refusée pour un motif nommé, la réponse ne dit rien de la correspondance', () => {
    for (const changement of [
      { sirenActif: false },
      { lienDeclareAvecLaSociete: true },
      { statutJuridique: 'portage_salarial' },
    ]) {
      const a = jugerAdmission(
        candidature({ ...changement, empreinteCourriel: EMPREINTE_CONSEILLER }),
        CONSEILLERS_ACTIFS
      );
      const b = jugerAdmission(
        candidature({ ...changement, empreinteCourriel: EMPREINTE_AUTRE }),
        CONSEILLERS_ACTIFS
      );
      expect(a.reponse).toEqual(b.reponse);
    }
  });

  it('REQ-JUR-063 : TÉMOIN — la comparaison porte sur des empreintes, à l’égalité exacte', () => {
    expect(correspondAUnConseillerActif(EMPREINTE_CONSEILLER, CONSEILLERS_ACTIFS)).toBe(true);
    expect(correspondAUnConseillerActif(EMPREINTE_AUTRE, CONSEILLERS_ACTIFS)).toBe(false);
    expect(correspondAUnConseillerActif(EMPREINTE_CONSEILLER, new Set())).toBe(false);
    // Une entrée hors forme de l'ensemble ne fait jamais correspondre une empreinte bien formée.
    expect(correspondAUnConseillerActif(EMPREINTE_AUTRE, new Set(['', 'x', 'A'.repeat(64)]))).toBe(
      false
    );
  });

  it('REQ-JUR-063 : TÉMOIN — une empreinte hors forme envoie en revue humaine (échec fermé), sans changer la réponse', () => {
    for (const hors of [
      '',
      'personne@exemple.fr',
      'A'.repeat(64),
      'a'.repeat(63),
      'a'.repeat(65),
      'g'.repeat(64),
    ]) {
      expect(correspondAUnConseillerActif(hors, CONSEILLERS_ACTIFS)).toBe(true);
      const j = jugerAdmission(candidature({ empreinteCourriel: hors }), CONSEILLERS_ACTIFS);
      expect(j.revueHumaine).toBe(true);
      expect(j.reponse).toEqual({ issue: 'recue' });
    }
    expect(correspondAUnConseillerActif(undefined as never, CONSEILLERS_ACTIFS)).toBe(true);
  });

  it('REQ-JUR-063 : TÉMOIN — le journal ne porte que l’issue, les motifs et la revue : ni nom, ni adresse, ni empreinte', () => {
    const j = jugerAdmission(
      candidature({ empreinteCourriel: EMPREINTE_CONSEILLER, sirenActif: false }),
      CONSEILLERS_ACTIFS
    );
    expect(Object.keys(j.journal).sort()).toEqual(['issue', 'motifs', 'revueHumaine']);
    expect(j.journal).toEqual({ issue: 'refusee', motifs: ['siren_inactif'], revueHumaine: true });
    expect(JSON.stringify(j.journal)).not.toContain(EMPREINTE_CONSEILLER);
    const recue = jugerAdmission(candidature(), CONSEILLERS_ACTIFS);
    expect(recue.journal).toEqual({ issue: 'recue', motifs: [], revueHumaine: false });
  });
});

describe('REQ-JUR-063 — un module du domaine pur', () => {
  it('REQ-JUR-063 : TÉMOIN — l’admission ne persiste rien, ne lit aucune clé, ne calcule aucune empreinte', () => {
    const source = readFileSync('src/domain/kyc/admission.ts', 'utf8');
    for (const interdit of [
      '@prisma/client',
      'node:',
      '/server/',
      'PII_HASH_KEY',
      'process.env',
      'createHmac',
    ]) {
      expect(source, interdit).not.toMatch(
        new RegExp(
          `(import|from|require)[^\\n]*${interdit.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`
        )
      );
    }
    // Un usage réel, `process.env` en tête d'expression. Stryker, qui mute ce module en porte A,
    // instrumente le fichier sur disque et y injecte `g.process.env` dans son préambule : ce
    // membre-là, précédé d'un point, n'est pas un usage du module.
    expect(source).not.toMatch(/(?<![.\w$])process\.env/);
  });
});
