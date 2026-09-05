// @req REQ-CPL-001
// @req REQ-CPL-002
// @req REQ-CPL-003
// @req REQ-CPL-004
// @req REQ-CPL-017
// @req REQ-CPL-018
/**
 * Le registre d'entité `config/entite.json`, son lecteur unique et la garde `gov:entite`.
 * (CPL-T01, `partners/ADR-0009`, REQ-GOV-031)
 *
 * CE QUE CE FICHIER TIENT. `CPL-T01` a été portée au statut `attente_externe`, comme si ÉCRIRE le
 * code dépendait de valeurs que seul Will connaît. C'est faux : seule la MISE EN SERVICE en dépend.
 * L'arbitrage `partners/ADR-0009` transforme donc ces valeurs en une configuration à sentinelle, et
 * ce fichier exerce les trois propriétés qui rendent la sentinelle sûre :
 *
 *   1. UN SEUL ENDROIT. Le SIREN du contrat, celui du mandat d'autofacturation et celui du fichier
 *      pain.001 sont le même octet parce qu'ils viennent tous du même lecteur (REQ-CPL-001, RM-01).
 *      Le test le prouve en RENVERSANT le registre : les trois fixtures changent ensemble, ou l'une
 *      d'elles retape la valeur.
 *   2. DEUX SENS. La garde refuse la mise en service tant qu'un champ vaut la sentinelle, et elle
 *      refuse TOUT AUTANT qu'une coordonnée bancaire réelle soit commitée. Le dépôt est PUBLIC
 *      (REQ-GOV-031, décision W13) : un IBAN poussé y reste lisible pour toujours, forks et caches
 *      compris. Une garde qui ne tiendrait qu'un des deux sens laisserait le vrai IBAN entrer à la
 *      première session pressée.
 *   3. DEUX NOTIONS DE « COMPLET », ET ELLES NE SE CONFONDENT PAS. Complet POUR LE DÉPÔT = les
 *      valeurs arrêtées sont portées, les secrets valent la sentinelle → la garde est verte, la CI
 *      passe, les phases 0 à 3 se codent. Complet POUR LA MISE EN SERVICE = plus aucune sentinelle
 *      une fois l'environnement résolu → le refus se lève. Les confondre rendrait la garde rouge à
 *      vie, et une garde toujours rouge finit désarmée (LEC-13, RM-02).
 *
 * CE QUI EST DÉRIVÉ ICI (RM-01). Aucune valeur du monde réel n'est tapée dans ce fichier : le
 * SIREN, la TVA, le domaine et le modèle des têtes de réseau sont LUS, soit dans le registre, soit
 * dans la ligne de `docs/DECISIONS.md` qui les arbitre. C'est aussi ce qui règle une divergence
 * relevée en écrivant cette tâche : `partners/ADR-0009` décrit `W1`, `W3` et `W4` comme non
 * tranchées, alors que `docs/DECISIONS.md` les porte tranchées le 2026-09-03. Plutôt que de
 * choisir, le registre DÉRIVE son régime de la ligne de décision — le jour où l'une d'elles est
 * rouverte, c'est la sentinelle qui redevient obligatoire, sans qu'une ligne de code bouge.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  SENTINELLE,
  CHAMPS,
  POINTS_DE_SORTIE,
  RegistreEntiteIncomplet,
  banqueDebitrice,
  banqueReceptrice,
  domaines,
  entiteContractante,
  estSentinelle,
  exigerEntiteRenseignee,
  manquantsPour,
  perimetre,
  registreDuDepot,
  valeur,
  type Registre,
} from '../../../src/config/entite';

import {
  FAMILLES,
  IBAN_TEMOIN,
  UNIVERS_CONFORME,
  controler,
  ligneSource,
  normaliser,
  type Univers,
} from '../../../scripts/gates/gov-entite';

const SCRIPT = 'scripts/gates/gov-entite.ts';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par un univers — l'unité de mesure de la moitié « garde » de ce fichier. */
function familles(u: Univers): string[] {
  return [...new Set(controler(u).map((f) => f.famille))].sort();
}

const registre = registreDuDepot();
const DECISIONS = readFileSync('docs/DECISIONS.md', 'utf8');
const EXIGENCES = readFileSync('docs/REQUIREMENTS.md', 'utf8');

// ── REQ-CPL-001 — l'entité est nommée, et les trois fixtures portent le même octet ────────────
describe('REQ-CPL-001 — une seule source pour le SIREN et l’IBAN débiteur', () => {
  it('l’entité contractante et payeuse est NOMMÉE dans le registre', () => {
    const e = entiteContractante(registre);
    for (const [cle, v] of Object.entries(e)) {
      expect(estSentinelle(v), `entite.${cle} vaut encore la sentinelle`).toBe(false);
      expect(v.length, `entite.${cle} est vide`).toBeGreaterThan(0);
    }
  });

  it('contrat, mandat et pain.001 LISENT la même valeur — le test le prouve en la renversant', () => {
    // Les trois points de sortie n'existent pas encore en code. Ce que l'on peut exercer
    // aujourd'hui, et qui est exactement ce que REQ-CPL-001 demande, c'est que les trois fixtures
    // se construisent PAR LECTURE. Le renversement est ce qui distingue une lecture d'une copie :
    // trois `return '…'` littéraux passeraient la première assertion et échoueraient la seconde.
    const fixtureContrat = (r: Registre) => ({
      siren: entiteContractante(r).siren,
      iban: banqueDebitrice(r, {}).iban,
    });
    const fixtureMandat = (r: Registre) => ({
      siren: entiteContractante(r).siren,
      iban: banqueDebitrice(r, {}).iban,
    });
    const fixturePain001 = (r: Registre) => ({
      siren: entiteContractante(r).siren,
      iban: banqueDebitrice(r, {}).iban,
    });

    const trois = [fixtureContrat(registre), fixtureMandat(registre), fixturePain001(registre)];
    expect(new Set(trois.map((f) => f.siren)).size).toBe(1);
    expect(new Set(trois.map((f) => f.iban)).size).toBe(1);

    const renverse = structuredClone(registre);
    renverse.entite.siren = '000000000';
    const renversees = [fixtureContrat(renverse), fixtureMandat(renverse), fixturePain001(renverse)];
    expect(renversees.map((f) => f.siren)).toEqual(['000000000', '000000000', '000000000']);
    expect(renversees[0]!.siren).not.toBe(trois[0]!.siren);
  });

  it('l’IBAN débiteur vaut la sentinelle DANS LE DÉPÔT, et se résout par l’environnement', () => {
    // Les deux sens en une assertion. Le dépôt est public : la sentinelle est la seule valeur que
    // ce champ y prend. La valeur réelle arrive par l'environnement, au moment de la mise en
    // service — le patron `stub.invalid` d'axionia (ADR 0026), appliqué à l'argent.
    expect(valeur(registre, 'banqueDebitrice.iban')).toBe(SENTINELLE);
    expect(banqueDebitrice(registre, {}).iban).toBe(SENTINELLE);

    const champ = CHAMPS.find((c) => c.cle === 'banqueDebitrice.iban');
    expect(champ?.secret, 'l’IBAN débiteur doit être déclaré secret').toBe(true);
    expect(champ?.env, 'un champ secret doit nommer sa variable d’environnement').toBeTruthy();
    const resolu = banqueDebitrice(registre, { [champ!.env!]: 'IBAN-INJECTE-PAR-L-ENVIRONNEMENT' });
    expect(resolu.iban).toBe('IBAN-INJECTE-PAR-L-ENVIRONNEMENT');
  });

  it('un IBAN d’apparence réelle COMMITÉ fait rougir la garde (REQ-GOV-031)', () => {
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    // L'IBAN témoin vient de la garde : aucun IBAN littéral n'entre dans ce fichier, sans quoi
    // la garde rougirait sur son propre test — et on l'aurait désarmée la semaine suivante.
    u.registre.banqueDebitrice.iban = IBAN_TEMOIN;
    expect(familles(u)).toContain('secret_commite');
  });
});

// ── REQ-CPL-002 — la banque réceptrice, ou la saisie manuelle actée ───────────────────────────
describe('REQ-CPL-002 — la banque réceptrice est connue OU la saisie manuelle est actée', () => {
  it('la branche « OU » est celle qui est actée, et elle est LUE dans la ligne HYP-W2', () => {
    const b = banqueReceptrice(registre);
    expect(estSentinelle(b.versionPain001)).toBe(false);
    expect(estSentinelle(b.modeDeRemise)).toBe(false);
    const ligne = normaliser(ligneSource(DECISIONS, 'HYP-W2'));
    expect(ligne).toContain(normaliser(b.versionPain001));
    expect(ligne).toContain(normaliser(b.modeDeRemise));
  });

  it('ce que la banque n’a pas encore dit reste à la sentinelle, sans bloquer le développement', () => {
    const b = banqueReceptrice(registre);
    for (const v of [b.bic, b.jeuDeCaracteres, b.espaceDeTest, b.formatReleveCsv]) {
      expect(estSentinelle(v)).toBe(true);
    }
    // Et pourtant la garde est verte : c'est tout l'objet de `partners/ADR-0009`.
    expect(controler(UNIVERS_CONFORME)).toEqual([]);
  });
});

// ── REQ-CPL-003 · 004 · 017 · 018 — les décisions arrêtées, dérivées de leur source ───────────
describe('les décisions arrêtées sont PORTÉES par le registre, et dérivées de leur source', () => {
  it('REQ-CPL-003 — le modèle des têtes de réseau vient de la ligne W4', () => {
    const m = perimetre(registre).modeleTetesDeReseau;
    expect(estSentinelle(m)).toBe(false);
    expect(normaliser(ligneSource(DECISIONS, 'W4'))).toContain(normaliser(m));
  });

  it('REQ-CPL-004 — la résidence fiscale exigée vient de la ligne de son exigence', () => {
    const r = perimetre(registre).residenceFiscaleExigee;
    expect(estSentinelle(r)).toBe(false);
    expect(normaliser(ligneSource(EXIGENCES, 'REQ-CPL-004'))).toContain(normaliser(r));
  });

  it('REQ-CPL-017 — le domaine servi vient de la ligne W3, et le domaine d’envoi attend', () => {
    const d = domaines(registre);
    expect(estSentinelle(d.servi)).toBe(false);
    expect(normaliser(ligneSource(DECISIONS, 'W3'))).toContain(normaliser(d.servi));
    // W3 décide le PRINCIPE d'un sous-domaine d'envoi dédié, pas son nom : celui-ci attend.
    expect(estSentinelle(d.envoi)).toBe(true);
  });

  it('REQ-CPL-018 — le mono-tenant vient de la ligne de son exigence', () => {
    const t = perimetre(registre).tenance;
    expect(estSentinelle(t)).toBe(false);
    expect(normaliser(ligneSource(EXIGENCES, 'REQ-CPL-018'))).toContain(normaliser(t));
  });

  it('une décision ROUVERTE rend la sentinelle obligatoire — le régime est dérivé, pas tapé', () => {
    // Le contre-sens du contrôle précédent, et la raison pour laquelle rien n'est figé ici :
    // on retire la marque de clôture de la ligne de décision, et la valeur portée devient une faute.
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.decisions = u.decisions.split('✅').join('⏳');
    expect(familles(u)).toContain('valeur_sans_decision');
  });
});

// ── Le refus, et les quatre points de sortie qu'il tiendra ────────────────────────────────────
describe('la fonction qui REFUSE — celle que les quatre points de sortie appelleront', () => {
  it('les quatre points de sortie de `partners/ADR-0009` sont déclarés, avec les champs exigés', () => {
    expect(POINTS_DE_SORTIE.map((p) => p.id).sort()).toEqual([
      'contrat-docuseal',
      'export-das2',
      'mandat-autofacturation',
      'sepa-pain001',
    ]);
    for (const p of POINTS_DE_SORTIE) {
      expect(p.cles.length, `${p.id} n’exige aucun champ`).toBeGreaterThan(0);
      for (const cle of p.cles) {
        expect(CHAMPS.map((c) => c.cle), `${p.id} exige un champ inconnu du registre`).toContain(cle);
      }
    }
  });

  it('refuse SI ET SEULEMENT SI un champ manque — la règle est dérivée, pas énumérée', () => {
    // ⚠️ CE CONTRÔLE A ÉTÉ ÉCRIT DEUX FOIS, ET LA PREMIÈRE VERSION ÉTAIT FAUSSE. Elle affirmait
    // que les QUATRE points de sortie refusent aujourd'hui, sur la foi de `partners/ADR-0009`,
    // qui décrit `W1` (l'entité) et `W3` (le domaine) comme non tranchées. `docs/DECISIONS.md`
    // les porte tranchées le 2026-09-03 : `contrat-docuseal` et `export-das2` n'ont donc plus
    // rien qui manque, et ils ACCEPTENT. Une liste écrite à la main aurait figé l'état d'un jour ;
    // celle-ci se dérive de `manquantsPour`, donc du registre, donc de la décision.
    for (const p of POINTS_DE_SORTIE) {
      const manquants = manquantsPour(p.id, registre, {});
      let erreur: unknown = null;
      try {
        exigerEntiteRenseignee(p.id, registre, {});
      } catch (e) {
        erreur = e;
      }
      if (manquants.length === 0) {
        expect(erreur, `${p.id} a refusé alors que rien ne manque`).toBeNull();
        continue;
      }
      expect(
        erreur,
        `${p.id} n’a pas refusé alors que ${manquants.length} champ(s) manquent`
      ).toBeInstanceOf(RegistreEntiteIncomplet);
      const message = (erreur as Error).message;
      expect(message).toContain(p.id);
      expect(message).toContain(SENTINELLE);
      expect(message).toContain('config/entite.json');
      for (const cle of manquants) {
        const champ = CHAMPS.find((c) => c.cle === cle);
        // Le message NOMME ce qui manque et OÙ le poser — un refus qui ne dit pas quoi faire
        // devient un avertissement qu'on apprend à contourner.
        expect(message).toContain(champ!.secret ? champ!.env! : cle);
      }
    }
  });

  it('aujourd’hui, ce sont les deux points de sortie qui touchent l’ARGENT qui refusent', () => {
    // Le témoin positif du refus : sans lui, les assertions ci-dessus seraient vraies d'un
    // registre entièrement rempli, et l'on n'aurait jamais vu la fonction refuser quoi que ce soit.
    const refusants = POINTS_DE_SORTIE.filter((p) => manquantsPour(p.id, registre, {}).length > 0);
    expect(refusants.map((p) => p.id).sort()).toEqual(['mandat-autofacturation', 'sepa-pain001']);
    for (const p of refusants) {
      expect(manquantsPour(p.id, registre, {})).toContain('banqueDebitrice.iban');
    }
  });

  it('ACCEPTE dès que l’environnement résout les secrets — sans ce contre-témoin, un refus à vie', () => {
    // Le registre du dépôt, plus les seuls secrets, injectés comme ils le seront en production.
    // C'est l'état « mise en service ». Si ce contrôle ne pouvait pas devenir vert, le refus
    // rougirait à vie et on apprendrait à le contourner (LEC-13).
    const env: Record<string, string> = {};
    for (const c of CHAMPS) if (c.secret && c.env) env[c.env] = 'VALEUR-DE-PRODUCTION';
    for (const p of POINTS_DE_SORTIE.filter((x) => x.id !== 'sepa-pain001')) {
      expect(() => exigerEntiteRenseignee(p.id, registre, env), p.id).not.toThrow();
    }
    // `sepa-pain001` exige en plus le BIC de la banque réceptrice, encore à la sentinelle : il
    // refuse toujours, et c'est exact — on ne remet pas un fichier de virement à une banque
    // qu'on n'a pas nommée.
    expect(() => exigerEntiteRenseignee('sepa-pain001', registre, env)).toThrow(
      RegistreEntiteIncomplet
    );
  });

  it('un point de sortie qui n’appelle PAS le refus est détectable, avant même d’exister', () => {
    // La forme choisie : le point de sortie se reconnaît à son CHEMIN, déclaré dans
    // `POINTS_DE_SORTIE`. Le jour où `src/…/mandat-autofacturation.ts` atterrit, la garde exige
    // qu'il appelle `exigerEntiteRenseignee`. Aucun fichier ne matche aujourd'hui : la famille est
    // donc verte sur le dépôt, et prouvée sur un univers de fixture — jamais réputée prouvée.
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({
      chemin: 'src/sortie/mandat-autofacturation.ts',
      contenu: 'export function emettreMandat() { return "sans garde"; }\n',
    });
    expect(familles(u)).toContain('point_de_sortie_sans_refus');

    // Contre-témoin : le même fichier, qui appelle le refus, redevient vert.
    u.fichiers[u.fichiers.length - 1]!.contenu =
      "import { exigerEntiteRenseignee } from '../config/entite';\n" +
      "export function emettreMandat() { exigerEntiteRenseignee('mandat-autofacturation'); }\n";
    expect(familles(u)).not.toContain('point_de_sortie_sans_refus');
  });
});

// ── La garde elle-même ────────────────────────────────────────────────────────────────────────
describe('gov:entite — la garde, sur le dépôt réel et sur ses témoins', () => {
  it('est VERTE sur le dépôt : elle n’empêche ni le build, ni les tests, ni le développement', () => {
    const { code, sortie } = lancer();
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it(`sait rougir : ses ${FAMILLES.length} familles ont chacune un témoin`, () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`Les ${FAMILLES.length} familles rougissent`);
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces.length).toBe(FAMILLES.length);
  });

  it('l’univers conforme est VERT — sans ce contre-témoin, le reste ne prouve rien', () => {
    expect(controler(UNIVERS_CONFORME)).toEqual([]);
  });

  it('une valeur identifiante RECOPIÉE dans un fichier de code fait rougir', () => {
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({
      chemin: 'src/facturation/entete.ts',
      contenu: 'export const SIREN = "' + u.registre.entite.siren + '";\n',
    });
    expect(familles(u)).toContain('valeur_recopiee');
  });

  it('la sentinelle est cherchable, et c’est un mot français en majuscules', () => {
    // `partners/ADR-0009` : la sentinelle est un mot français en majuscules plutôt qu'une chaîne
    // d'apparence technique, précisément pour qu'on ne puisse pas la prendre pour une valeur.
    expect(SENTINELLE).toBe('A-RENSEIGNER');
    expect(SENTINELLE).toBe(SENTINELLE.toUpperCase());
  });
});
