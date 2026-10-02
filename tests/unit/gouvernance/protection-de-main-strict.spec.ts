// @req REQ-GOV-014
// @no-red-first: ce fichier fige une DÉCISION déjà en vigueur sur main (choix A de Williams du 2026-10-02, « OK POUR A » : la protection n'exige pas les branches à jour) ; ses copies cassées rougissent sur les deux familles qui restent exigées
/**
 * QA-T55 (REQ-GOV-014) — la garde de la forge juge l'état DÉCIDÉ de la protection de `main`.
 *
 * Choix A de Williams, 2026-10-02, verbatim « OK POUR A » : l'option « branches à jour avant
 * fusion » (`required_status_checks.strict`) est DÉCOCHÉE, et c'est vérifié sur la forge
 * (strict=false). La garde n'exige donc jamais `strict`. Ce n'est pas un trou : le déploiement
 * attend la porte A réussie du commit FUSIONNÉ lui-même (`deploy:attendre-porte-a`), de sorte
 * qu'une PR verte sur une base périmée ne déploie rien que la porte A n'ait jugé. Restent ROUGES, et
 * ce fichier le garde : `gate-a` absent des checks requis, et la règle de `main` absente.
 */
import { describe, it, expect } from 'vitest';
import {
  controler,
  VUE_CONFORME,
  type Protection,
  type Vue,
} from '../../../scripts/gates/gov-depot';

const protection = (): Protection => structuredClone(VUE_CONFORME.protection as Protection);
const avec = (p: Protection | 'non_protegee'): Vue => ({ ...VUE_CONFORME, protection: p });
const familles = (v: Vue) => controler(v).map((f) => f.famille);

describe('REQ-GOV-014 — la protection de main est jugée selon le choix A de Williams (2026-10-02)', () => {
  it('REQ-GOV-014 : strict à false, ou absent, n’est PAS une faute — la garde n’exige jamais les branches à jour', () => {
    const p = protection();
    p.required_status_checks = { ...p.required_status_checks, strict: false };
    expect(controler(avec(p))).toEqual([]);
    const sansStrict = { ...p.required_status_checks };
    delete sansStrict.strict;
    expect(controler(avec({ ...p, required_status_checks: sansStrict }))).toEqual([]);
  });

  it('REQ-GOV-014 : TÉMOINS — gate-a absent des checks requis, ou main sans règle, restent ROUGES', () => {
    const p = protection();
    p.required_status_checks = { strict: false, contexts: [] };
    expect(familles(avec(p))).toContain('check_requis_absent');
    expect(familles(avec('non_protegee'))).toContain('branche_non_protegee');
  });
});
