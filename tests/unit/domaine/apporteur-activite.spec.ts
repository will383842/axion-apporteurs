// @req REQ-CPL-027
/**
 * `apporteur-activite.spec.ts` — DM-06 : `actif` et `dormant` sont DÉRIVÉS par une fonction pure,
 * jamais stockés, et restent des indicateurs de console.
 *
 *   — `actif` : au moins un dépôt CONFIRMÉ (glossaire §2), jamais « un dépôt » ni « inscrit ».
 *   — `dormant` : statut `signe` et plus de `dormanceJours` jours sans dépôt. `dormanceJours` est
 *     un PARAMÈTRE — la source unique des seuils n'existe pas encore, et aucun littéral ne la
 *     remplace (RM-10) : faire varier le paramètre fait varier le verdict, ce qui prouve qu'il est lu.
 *   — AUCUN MESSAGE n'est envoyé à un apporteur en raison de son inactivité : le module n'importe
 *     rien qui envoie, et aucun module du dépôt n'importe à la fois la dérivation et l'envoi.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { activite, type DepotPourActivite } from '../../../src/domain/apporteur/activite';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';

const MAINTENANT = Date.UTC(2026, 8, 25, 12, 0);
const ilYA = (jours: number) => MAINTENANT - jours * MS_PAR_JOUR;

const depot = (deposeAt: number, confirmeAt: number | null): DepotPourActivite => ({
  deposeAt,
  confirmeAt,
});

describe('REQ-CPL-027 — `actif` : au moins un dépôt confirmé', () => {
  it('REQ-CPL-027 : aucun dépôt → ni actif', () => {
    expect(activite({ statut: 'signe', signeAt: ilYA(10) }, [], MAINTENANT, 60).actif).toBe(false);
  });

  it('REQ-CPL-027 : des dépôts NON confirmés seulement → pas actif', () => {
    const depots = [depot(ilYA(3), null), depot(ilYA(2), null)];
    expect(activite({ statut: 'signe', signeAt: ilYA(10) }, depots, MAINTENANT, 60).actif).toBe(
      false
    );
  });

  it('REQ-CPL-027 : un dépôt confirmé → actif', () => {
    const depots = [depot(ilYA(3), null), depot(ilYA(5), ilYA(4))];
    expect(activite({ statut: 'signe', signeAt: ilYA(10) }, depots, MAINTENANT, 60).actif).toBe(
      true
    );
  });

  it('REQ-CPL-027 : la dérivation rend exactement deux indicateurs, rien d’autre', () => {
    expect(
      Object.keys(activite({ statut: 'signe', signeAt: ilYA(1) }, [], MAINTENANT, 60)).sort()
    ).toEqual(['actif', 'dormant']);
  });
});

describe('REQ-CPL-027 — `dormant` : `signe` et plus de `dormanceJours` jours sans dépôt', () => {
  const signe = { statut: 'signe' as const, signeAt: ilYA(400) };

  it('REQ-CPL-027 : dernier dépôt il y a 61 jours, dormance 60 → dormant ; 59 jours → non', () => {
    expect(activite(signe, [depot(ilYA(61), null)], MAINTENANT, 60).dormant).toBe(true);
    expect(activite(signe, [depot(ilYA(59), null)], MAINTENANT, 60).dormant).toBe(false);
  });

  it('REQ-CPL-027 : exactement `dormanceJours` jours → PAS dormant (« plus de »)', () => {
    expect(activite(signe, [depot(ilYA(60), null)], MAINTENANT, 60).dormant).toBe(false);
  });

  it('REQ-CPL-027 : le PARAMÈTRE décide — mêmes faits, 30 jours → dormant, 90 jours → non', () => {
    const depots = [depot(ilYA(45), ilYA(44))];
    expect(activite(signe, depots, MAINTENANT, 30).dormant).toBe(true);
    expect(activite(signe, depots, MAINTENANT, 90).dormant).toBe(false);
  });

  it('REQ-CPL-027 : jamais de dépôt — la durée court depuis la signature', () => {
    expect(activite({ statut: 'signe', signeAt: ilYA(61) }, [], MAINTENANT, 60).dormant).toBe(true);
    expect(activite({ statut: 'signe', signeAt: ilYA(10) }, [], MAINTENANT, 60).dormant).toBe(
      false
    );
  });

  it('REQ-CPL-027 : c’est le DERNIER dépôt qui compte, quel que soit l’ordre reçu', () => {
    const depots = [depot(ilYA(10), null), depot(ilYA(200), ilYA(199))];
    expect(activite(signe, depots, MAINTENANT, 60).dormant).toBe(false);
  });

  it('REQ-CPL-027 : un apporteur qui n’est pas `signe` n’est jamais dormant', () => {
    for (const statut of ['suspendu', 'resilie', 'kyc_en_cours', 'candidat'] as const) {
      expect(activite({ statut, signeAt: ilYA(400) }, [], MAINTENANT, 60).dormant, statut).toBe(
        false
      );
    }
  });

  it('REQ-CPL-027 : une dormance non entière ou négative est refusée — pas de verdict approché', () => {
    expect(() => activite(signe, [], MAINTENANT, -1)).toThrow(/dormanceJours/);
    expect(() => activite(signe, [], MAINTENANT, 1.5)).toThrow(/dormanceJours/);
  });

  it('REQ-CPL-027 : `signe` sans date de signature est refusé, jamais supposé', () => {
    expect(() => activite({ statut: 'signe', signeAt: null }, [], MAINTENANT, 60)).toThrow(
      /signeAt/
    );
  });
});

describe('REQ-CPL-027 — aucun littéral de dormance, aucun envoi déclenché par l’inactivité', () => {
  const source = readFileSync('src/domain/apporteur/activite.ts', 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('REQ-CPL-027 : le module n’écrit aucune durée de dormance en dur (RM-10)', () => {
    expect(code).not.toMatch(/\b\d{2,}\b/);
    expect(code).not.toMatch(/DORMANCE_JOURS\s*=/);
  });

  it('REQ-CPL-027 : le module n’importe que le domaine — rien qui envoie, rien qui lit l’horloge', () => {
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) expect(i, i).toMatch(/^(\.\/statut|\.\.\/temps\/)/);
    expect(code).not.toMatch(/new Date|Date\.now/);
  });

  it('REQ-CPL-027 : aucun fichier suivi sous src/ n’importe à la fois la dérivation et un envoi', () => {
    const suivis = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx)$/.test(f));
    const fautifs = suivis.filter((f) => {
      const t = readFileSync(f, 'utf8');
      return (
        /apporteur\/activite['"]/.test(t) && /lib\/notify|notify['"]|zeptomail|sendMail/i.test(t)
      );
    });
    expect(fautifs).toEqual([]);
  });
});
