/**
 * une-liste-vide-n-est-pas-une-reponse.spec.ts — GOV-082.
 *
 * @req REQ-GOV-012
 * @req REQ-GOV-005 → REQ-QA-014
 *
 * ⚠️ REQ-GOV-005 est ABSORBÉE par REQ-QA-014 (`docs/requirements.json`, `remplaceePar`) : le texte
 * en vigueur est celui de REQ-QA-014, et l'identifiant est conservé parce que le backlog le cite.
 *
 * LE DÉFAUT, MESURÉ TROIS FOIS LE 2026-09-16 SUR UN BAC VIERGE. `gov:trace` résout les titres de
 * test en lançant un PROCESSUS ENFANT qui énumère les cas d'une suite. Selon le lanceur par lequel
 * la garde est elle-même invoquée, cet enfant rend soit la liste, soit UNE LISTE VIDE AVEC LE CODE
 * ZÉRO — et le code lisait la seconde réponse comme la première : « résolu, aucun titre ne
 * correspond ». D'où 53 `test_promis_absent` FABRIQUÉES sur un dépôt où rien ne manque.
 *
 * POURQUOI C'EST PIRE QU'UN ÉCHEC OUVERT. La famille connue est « un prédicat ouvert échoue
 * ouvert » : faute de savoir, la garde laisse passer. Ici la garde échouait FERMÉ — faute de
 * savoir, elle ACCUSAIT, avec 53 lignes nominatives qui envoient le lecteur suivant corriger
 * 53 choses qui n'ont rien.
 *
 * CE QUE CE FICHIER ÉPROUVE, ET LES DEUX FACES SE JOUENT TOUTES LES DEUX. Un témoin qui ne joue
 * que la face qui marche ne mesure rien — c'est exactement pourquoi ce défaut a survécu jusqu'à la
 * répétition finale. L'énumérateur est donc INJECTÉ : une face rend la liste, l'autre rend le vide
 * avec le code zéro, une troisième échoue. Les trois états sont distincts et NOMMÉS.
 */

// @req REQ-GOV-012
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  controler,
  titresResolus,
  plancherDeTitres,
  universFixture,
  MOTIFS_NON_RESOLUS,
  type Enumerateur,
  type Univers,
} from '../../../scripts/gates/gov-trace';

/** Un fichier de test feint, avec ce que le DISQUE en porte statiquement. */
const CIBLE = 'tests/f/a.spec.ts';

/**
 * ⚠️ L'IDENTIFIANT FEINT EST ASSEMBLÉ, JAMAIS ÉCRIT EN TOUTES LETTRES. `gov:trace` lit les
 * ouvertures de titre dans le TEXTE de ce fichier-ci : une fixture qui écrirait l'identifiant en
 * clair ferait rougir `test_cite_req_inconnue` sur la spécification elle-même — mesuré au premier
 * jet, et c'est la garde qui avait raison.
 */
const REQ_FEINTE = ['REQ', 'AAA', '001'].join('-');

const TEXTE_DE_LA_CIBLE = [
  "describe('la famille', () => {",
  "  it('" + REQ_FEINTE + " : un titre', () => {});",
  "  it('un autre', () => {});",
  '});',
].join('\n');

/** L'énumérateur qui RÉPOND : il rend les cas que le fichier contient. */
const enumerateurQuiRepond: Enumerateur = (fichiers) => ({
  ok: true,
  entrees: fichiers.flatMap((f) => [
    { name: `la famille > ${REQ_FEINTE} : un titre`, file: `${process.cwd()}/${f}` },
    { name: 'la famille > un autre', file: `${process.cwd()}/${f}` },
  ]),
});

/** L'énumérateur du DÉFAUT : code zéro, liste VIDE. C'est la face qui n'avait jamais été jouée. */
const enumerateurVideEtContent: Enumerateur = () => ({ ok: true, entrees: [] });

/** L'énumérateur qui ÉCHOUE franchement : code non nul, ou sortie illisible. */
const enumerateurQuiEchoue: Enumerateur = () => ({ ok: false, entrees: [] });

/** Le plancher dérivé de la cible, tel que le disque le porte. */
const plancherDe = (chemin: string): number =>
  chemin === CIBLE ? plancherDeTitres(TEXTE_DE_LA_CIBLE) : 0;

describe('gov:trace — une liste vide rendue avec le code zéro n’est pas une réponse (GOV-082)', () => {
  it('REQ-GOV-012 — le plancher est DÉRIVÉ du texte du fichier, jamais tapé', () => {
    // Deux `it()` écrits, donc deux titres de test attendus au minimum. La valeur n'est pas
    // épinglée ici : elle est RECOMPTÉE depuis le même texte, par la même lecture.
    expect(plancherDeTitres(TEXTE_DE_LA_CIBLE)).toBeGreaterThan(0);
    expect(plancherDeTitres('const x = 1;\n')).toBe(0);
  });

  it('REQ-GOV-012 — un énumérateur qui RÉPOND donne les titres, et rien n’est refusé', () => {
    const r = titresResolus([CIBLE], plancherDe, enumerateurQuiRepond);
    expect(r.titres.get(CIBLE)).toEqual([
      `la famille > ${REQ_FEINTE} : un titre`,
      'la famille > un autre',
    ]);
    expect(r.echecs).toEqual([]);
    expect(r.incoherents).toEqual([]);
    // (4) le compte imprimé est celui des titres RÉELLEMENT énumérés.
    expect(r.enumeres).toBe(2);
  });

  it('REQ-GOV-012 — une liste VIDE rendue avec le code zéro est un REFUS, pas une réponse', () => {
    const r = titresResolus([CIBLE], plancherDe, enumerateurVideEtContent);
    expect(
      r.titres.has(CIBLE),
      'la cible a été rangée comme RÉSOLUE avec zéro titre : c’est le défaut de GOV-082'
    ).toBe(false);
    expect(r.incoherents.map((i) => i.chemin)).toEqual([CIBLE]);
    expect(r.incoherents[0]!.plancher).toBe(plancherDeTitres(TEXTE_DE_LA_CIBLE));
    expect(r.enumeres).toBe(0);
  });

  it('REQ-GOV-012 — un énumérateur qui ÉCHOUE est un refus DISTINCT de la liste vide', () => {
    const r = titresResolus([CIBLE], plancherDe, enumerateurQuiEchoue);
    expect(r.echecs).toEqual([CIBLE]);
    expect(r.incoherents).toEqual([]);
    // Les deux motifs sont nommés, et ils ne se confondent pas.
    expect([...MOTIFS_NON_RESOLUS].sort()).toEqual(['echec', 'vide_incoherent']);
  });

  it('REQ-GOV-012 — un fichier VRAIMENT vide de titres n’est pas incohérent : plancher zéro', () => {
    const r = titresResolus(['tests/f/vide.spec.ts'], () => 0, enumerateurVideEtContent);
    expect(r.incoherents).toEqual([]);
    expect(r.titres.get('tests/f/vide.spec.ts')).toEqual([]);
  });

  it('REQ-GOV-012 — le refus NOMME la troisième cause et n’accuse AUCUN test', () => {
    const u: Univers = JSON.parse(JSON.stringify(universFixture())) as Univers;
    const f = u.fichiers[0]!;
    f.titresResolus = null;
    f.motifNonResolus = 'vide_incoherent';
    const fautes = controler(u);
    const familles = fautes.map((x) => x.famille);
    expect(familles).toContain('titres_non_resolus');
    expect(
      familles.filter((x) => x === 'test_promis_absent'),
      'la garde a ACCUSÉ un test alors qu’elle n’a rien lu'
    ).toEqual([]);
    const message = fautes.find((x) => x.famille === 'titres_non_resolus')!.message;
    expect(message).toContain('liste VIDE');
  });

  it('REQ-GOV-012 — un échec d’énumération donne un message DIFFÉRENT de la liste vide', () => {
    const u: Univers = JSON.parse(JSON.stringify(universFixture())) as Univers;
    const f = u.fichiers[0]!;
    f.titresResolus = null;
    f.motifNonResolus = 'echec';
    const message = controler(u).find((x) => x.famille === 'titres_non_resolus')!.message;
    expect(message).not.toContain('liste VIDE');
  });

  it('REQ-GOV-012 — `gov:trace --sources` imprime le compte des titres ÉNUMÉRÉS', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/gates/gov-trace.ts', '--sources'], {
      encoding: 'utf8',
      shell: true,
      timeout: 600_000,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(sortie, `gov:trace --sources n’a rien imprimé :\n${sortie.slice(0, 800)}`).toMatch(
      /titres? énuméré/i
    );
  });
});
