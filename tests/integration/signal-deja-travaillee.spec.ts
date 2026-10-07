// @req REQ-EXT-007
/**
 * EXT-T06 (REQ-EXT-007, amendée au rattrapage 82) — le dépôt d'une entreprise libre que le réseau a
 * DÉJÀ TRAVAILLÉE n'est pas une anomalie, et ne produit aucun effet sur le dépôt ni sur l'apporteur :
 * ni vérification, ni suspension, ni statut. Aucun compte, aucune proportion et aucune fenêtre de temps
 * ne sont calculés sur les dépôts « déjà travaillée » d'un apporteur.
 *
 * « Déjà travaillée » s'entend d'une attribution PASSÉE et TERMINÉE dans Partners sur ce SIREN, quel
 * qu'en soit le porteur (définition retenue par la coordination).
 *
 * EN PROCESSUS, sans base : le juge de la sincérité est le SEUL module qui ouvre une anomalie
 * de sincérité sur un dépôt. Ce témoin prouve qu'il ne voit pas le passé de l'entreprise : sa vue d'un
 * dépôt n'a aucun champ qui le porte, aucun de ses signaux ne le nomme, et un dépôt sur une entreprise
 * déjà travaillée rend EXACTEMENT les mêmes signaux et le même score qu'un dépôt sur une entreprise
 * neuve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  lireReglageDeSincerite,
  scoreDeSincerite,
  signauxDeSincerite,
  SIGNAUX_DE_SINCERITE,
  type DeclarationJugee,
  type ReglageDeSincerite,
} from '../../src/server/anomalie/sincerite';

/** Un réglage de témoin : chaque signal pèse (les vraies valeurs vivent hors du dépôt). */
function reglage(): ReglageDeSincerite {
  const r = lireReglageDeSincerite(
    [
      'seuil=50',
      'texte_min=20',
      'tranche_minutes=60',
      'suite_min=3',
      'recul_heures=72',
      'poids.contact_dirigeant=30',
      'poids.contact_generique=30',
      'poids.texte_court_ou_identique=30',
      'poids.multi_identites=30',
      'poids.siren_ordonnes=30',
    ].join(';')
  );
  if (r === null) throw new Error('réglage de témoin illisible');
  return r;
}

const SIREN = '552100554';
const MOI = '0190f0f0-0000-7000-8000-00000000a001';
const AUTRE = '0190f0f0-0000-7000-8000-00000000a002';
const DEBUT = new Date('2026-10-01T09:00:00.000Z').getTime();

function depot(
  o: Partial<DeclarationJugee> & { attributionId: string; minute: number }
): DeclarationJugee {
  const { minute, ...reste } = o;
  return {
    apporteurId: MOI,
    siren: SIREN,
    raisonSociale: 'Garage de la Démo',
    deposeeAt: new Date(DEBUT + minute * 60_000),
    nomContact: 'Durand',
    prenomContact: 'Claire',
    empreinteNomContact: 'e'.repeat(64),
    empreintesDirigeants: [],
    contexte: 'Rencontrée au salon des artisans, elle cherche une formation à la sécurité.',
    ipHash: 'a'.repeat(64),
    agentHash: 'b'.repeat(64),
    ...reste,
  };
}

/** L'attribution PASSÉE et terminée d'un autre porteur sur le même SIREN : le passé du réseau. */
const PASSEE = depot({
  attributionId: '0190f0f0-0000-7000-8000-00000000b009',
  minute: -60 * 24 * 300,
  apporteurId: AUTRE,
  nomContact: 'Martin',
  prenomContact: 'Paul',
  empreinteNomContact: 'f'.repeat(64),
  contexte: 'Un autre contact, un autre jour, par un autre apporteur du réseau.',
  ipHash: 'c'.repeat(64),
  agentHash: 'd'.repeat(64),
});

describe('REQ-EXT-007 — un dépôt « déjà travaillée » n’est pas une anomalie, et rien ne se compte', () => {
  it('REQ-EXT-007 : TÉMOIN — la vue d’un dépôt n’a AUCUN champ qui porte le passé de l’entreprise', () => {
    const cles = Object.keys(depot({ attributionId: 'x', minute: 0 })).sort();
    expect(cles).toEqual(
      [
        'agentHash',
        'apporteurId',
        'attributionId',
        'contexte',
        'deposeeAt',
        'empreinteNomContact',
        'empreintesDirigeants',
        'ipHash',
        'nomContact',
        'prenomContact',
        'raisonSociale',
        'siren',
      ].sort()
    );
    for (const c of cles) expect(c).not.toMatch(/travaill|passe|historique|ancien|deja/i);
  });

  it('REQ-EXT-007 : TÉMOIN — aucun signal de la liste fermée ne nomme le passé de l’entreprise', () => {
    for (const s of SIGNAUX_DE_SINCERITE)
      expect(s).not.toMatch(/travaill|passe|histor|ancien|deja|ramass/i);
  });

  it('REQ-EXT-007 : TÉMOIN — un dépôt sur une entreprise déjà travaillée rend les MÊMES signaux et le MÊME score qu’un dépôt sur une entreprise neuve', () => {
    const r = reglage();
    const d = depot({ attributionId: '0190f0f0-0000-7000-8000-00000000b001', minute: 0 });
    const neuve = signauxDeSincerite(d, [d], r);
    const dejaTravaillee = signauxDeSincerite(d, [PASSEE, d], r);
    expect(dejaTravaillee).toEqual(neuve);
    expect(scoreDeSincerite(dejaTravaillee, r)).toBe(scoreDeSincerite(neuve, r));
    expect(scoreDeSincerite(neuve, r)).toBeLessThan(r.seuil);
  });

  it('REQ-EXT-007 : TÉMOIN — plusieurs dépôts du même apporteur sur des entreprises déjà travaillées n’ouvrent rien de plus : aucune proportion ne se compte', () => {
    const r = reglage();
    const SIRENS = ['732829320', '552081317', '542065479'];
    const miens = SIRENS.map((siren, i) =>
      depot({
        attributionId: `0190f0f0-0000-7000-8000-00000000c00${i}`,
        minute: i * 240,
        siren,
        contexte: `Rencontre numéro ${i + 1} : une entreprise qui cherche à former ses équipes au numérique.`,
        empreinteNomContact: String(i).repeat(64),
      })
    );
    const passees = SIRENS.map((siren, i) => ({
      ...PASSEE,
      attributionId: `0190f0f0-0000-7000-8000-00000000d00${i}`,
      siren,
    }));
    for (const d of miens) {
      const seuls = signauxDeSincerite(d, miens, r);
      const avecLePasse = signauxDeSincerite(d, [...passees, ...miens], r);
      expect(avecLePasse).toEqual(seuls);
    }
  });

  it('REQ-EXT-007 : TÉMOIN statique — le juge de la sincérité ne lit pas les attributions terminées ni un état « déjà travaillée »', () => {
    const source = readFileSync('src/server/anomalie/sincerite.ts', 'utf8');
    expect(source).not.toMatch(/libre_deja_travaillee|deja_travaill|dejaTravaill/i);
    // La relecture du passage ne porte que sur les dépôts de la fenêtre récente, jamais sur un état terminé.
    expect(source).not.toMatch(
      /statut:\s*\{\s*in:\s*\[[^\]]*'(expiree|annulee|liberee|invalidee)'/
    );
  });
});
