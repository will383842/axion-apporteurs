// @req REQ-CPL-001
// @req REQ-CPL-002
// @req REQ-CPL-003
// @req REQ-CPL-004
// @req REQ-CPL-017
// @req REQ-CPL-018
// @req REQ-GOV-031
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
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync, deflateSync, gzipSync } from 'node:zlib';

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
  FAMILLES_CORPS_PUBLIE,
  IBANS_TEMOINS_ETRANGERS,
  IBAN_TEMOIN,
  PORTEE_DES_NUMEROS_PUBLICS,
  identifiantsApparriables,
  identifiantsDuRegistre,
  SIREN_TEMOIN_TIERS,
  TVA_TEMOIN_TIERS,
  caracteresNeutralises,
  ibanAvecSeparateur,
  coordonneesDe,
  controlerRegistreExemptions,
  empreinteDe,
  exemptionsDuDepot,
  exemptionsServies,
  jugerCorpsPublie,
  numeroDePrDeLEvenement,
  assemblerLecture,
  paginerEditions,
  EDITIONS_PAR_PAGE,
  PAGES_MAX,
  REQUETE_EDITIONS,
  lireUneFois,
  lireCorpsPublie,
  type ExecuteurGh,
  type NoeudEdition,
  type PageDEditions,
  type Exemption,
  type LectureDuCorps,
  UNIVERS_CONFORME,
  controler,
  ligneSource,
  normaliser,
  lireUnivers,
  filtresDepuisSortie,
  blobsDe,
  codesDeRegion,
  SourcePaysIllisible,
  estExemptDe,
  cleIbanValide,
  EXEMPTS,
  type Univers,
} from '../../../scripts/gates/gov-entite';
import type { EntreeSuivie } from '../../../scripts/lot/fichiers-suivis';

const SCRIPT = 'scripts/gates/gov-entite.ts';

/**
 * L'ENVIRONNEMENT QUE CE BANC D'ESSAI DONNE À SES SOUS-PROCESSUS — et pourquoi il est CONSTRUIT
 * plutôt qu'hérité.
 *
 * 🔴 CE QU'UN HÉRITAGE A COÛTÉ, mesuré le 2026-09-05 : `lancer()` transmettait `process.env` tel
 * quel. `GITHUB_EVENT_PATH` n'existe pas sur un poste de développement et existe TOUJOURS dans un
 * job Actions — le même cas rendait donc 2 en local (aucun numéro de PR à lire) et 0 en CI (le
 * numéro lu, la forge interrogée pour de bon). Vert ici, rouge là-bas, pour un fichier identique.
 *
 * 🔑 **Un test qui dépend d'une variable d'environnement que le développeur n'a pas et que la CI a
 * mesure deux choses différentes selon l'endroit.** Un banc d'essai n'hérite pas d'un
 * environnement : il le construit, et il NOMME ce qu'il en retire.
 *
 * CE QUI EST RETIRÉ, ET POURQUOI CHACUNE :
 *   — `GITHUB_EVENT_PATH` : `numeroDePrDeLEvenement()` la lit, et elle décide à elle seule si le
 *     mode en ligne juge une PR ou refuse de juger. C'est celle qui a rendu Gate A rouge.
 *   — `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST`, `GH_REPO`, `GH_ENTERPRISE_TOKEN` : elles décident ce
 *     que `gh` atteint. Aucun cas de ce fichier ne doit pouvoir toucher la forge — un cas qui
 *     interroge GitHub verdit ou rougit au gré de ce que la forge répond le jour où il tourne.
 *     Les retirer rend l'impossibilité STRUCTURELLE plutôt que réputée.
 *
 * ⚠️ La neutralisation est CIBLÉE. Vider l'environnement retirerait `PATH`, `npx` deviendrait
 * introuvable, et l'échec ressemblerait à un rouge de garde là où ce serait un rouge d'outillage.
 */
const VARIABLES_NEUTRALISEES = [
  'GITHUB_EVENT_PATH',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_HOST',
  'GH_REPO',
  'GH_ENTERPRISE_TOKEN',
] as const;

function envDuBancDEssai(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const variable of VARIABLES_NEUTRALISEES) delete env[variable];
  return env;
}

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    shell: true,
    env: envDuBancDEssai(),
  });
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

  it('REQ-CPL-001 — contrat, mandat et pain.001 LISENT la même valeur — le test le prouve en la renversant', () => {
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
    const renversees = [
      fixtureContrat(renverse),
      fixtureMandat(renverse),
      fixturePain001(renverse),
    ];
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
  it('REQ-CPL-002 — la branche « OU » est celle qui est actée, et elle est LUE dans la ligne HYP-W2', () => {
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
        expect(
          CHAMPS.map((c) => c.cle),
          `${p.id} exige un champ inconnu du registre`
        ).toContain(cle);
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

/**
 * CE QUE LA GARDE REGARDE : ses exemptions, et son refus de juger ce qu'elle ne lit pas en entier.
 *
 * `--prove` injecte son univers et ne passe jamais par la lecture des blobs : ce qui décide de ce
 * que la garde regarde a donc ses propres témoins. Ceux-ci portent sur le contrôle ; la lecture des
 * blobs est éprouvée plus bas, sur le dépôt réel et sur des dépôts jetables (REQ-GOV-031).
 */
describe('REQ-GOV-031 — ce que la garde REGARDE est gardé, pas seulement ce qu’elle en dit', () => {
  it('REQ-GOV-031 — les refus de LECTURE n’ont AUCUNE exemption : chaque chemin qu’EXEMPTS vise, illisible ou non publié, est refusé', () => {
    // Le chemin que vise chaque motif est DÉRIVÉ de son texte, et le contrôle positif exige que le
    // motif le reconnaisse : un motif qui cesserait d'être un chemin littéral rougit ici.
    expect(EXEMPTS.length, 'aucune exemption : le témoin ne croiserait rien').toBeGreaterThan(0);
    const utf16 = Buffer.from('Relevé du trimestre\n', 'utf16le').toString('utf8');
    for (const e of EXEMPTS) {
      const chemin = e.motif.source.replace(/^\^/, '').replace(/\$$/, '').replace(/\\(.)/g, '$1');
      expect(e.motif.test(chemin), `chemin dérivé de ${e.motif} non reconnu par son motif`).toBe(
        true
      );
      const cas: [string, Univers['fichiers'][number]][] = [
        ['contenu_illisible', { chemin, contenu: utf16 }],
        [
          'contenu_publie_non_lu',
          { chemin, contenu: pointeurLfs('https://git-lfs.github.com/spec/v1', '\n') },
        ],
        ['contenu_publie_non_lu', { chemin, contenu: 'Relevé du trimestre\n', filtre: 'lfs' }],
      ];
      for (const [famille, fichier] of cas) {
        const u = structuredClone(UNIVERS_CONFORME) as Univers;
        u.fichiers.push(fichier);
        expect(familles(u), `${chemin} (${e.exemptDe}) échappe à ${famille}`).toContain(famille);
      }
    }
  });

  it('REQ-GOV-031 — un POINTEUR Git LFS est refusé sous ses trois en-têtes et deux fins de ligne ; une documentation qui en CITE la ligne est lue', () => {
    // Les trois en-têtes que Git LFS accepte, écrits ici (RM-11).
    for (const entete of [
      'https://git-lfs.github.com/spec/v1',
      'https://hawser.github.com/spec/v1',
      'http://git-media.io/v/2',
    ]) {
      for (const fin of ['\n', '\r\n']) {
        expect(
          familles(universAvecFichier('exports/rib.pdf', pointeurLfs(entete, fin))),
          JSON.stringify([entete, fin])
        ).toEqual(['contenu_publie_non_lu']);
      }
    }
    const doc = `# Git LFS\n\nUn pointeur commence par :\n\n${pointeurLfs('https://git-lfs.github.com/spec/v1', '\n')}`;
    expect(familles(universAvecFichier('docs/lfs.md', doc))).toEqual([]);
  });

  it('REQ-GOV-031 — la réponse de `git check-attr` est lue pour CHAQUE chemin : un filtre posé est rendu, `unspecified` et `unset` non, une réponse amputée LÈVE', () => {
    const chemins = ['a.pdf', 'b.txt', 'c.md', 'd.bin', 'e.txt'];
    const sortie = [
      ...['a.pdf', 'filter', 'lfs'],
      ...['b.txt', 'filter', 'unspecified'],
      ...['c.md', 'filter', 'unset'],
      ...['d.bin', 'filter', 'set'],
      ...['e.txt', 'filter', 'git-crypt'],
      '',
    ].join('\0');
    expect([...filtresDepuisSortie(chemins, sortie)]).toEqual([
      ['a.pdf', 'lfs'],
      ['d.bin', 'set'],
      ['e.txt', 'git-crypt'],
    ]);
    expect(() => filtresDepuisSortie([...chemins, 'f.txt'], sortie)).toThrow(/amputée/);
  });

  it('REQ-GOV-031 — AUCUN fichier n’est exempt de la recherche de SECRET, et c’est le veto de 2026-09-05', () => {
    // `docs/DECISIONS.md` est le fichier où l'arbitrage de la banque sera écrit. Il était exempt
    // du balayage ENTIER — donc de la recherche d'IBAN — parce qu'il a le droit de nommer le
    // SIREN qu'il arrête. Les deux ne se déduisent pas l'un de l'autre.
    expect(estExemptDe('docs/DECISIONS.md', 'recopie')).toBe(true);
    expect(estExemptDe('docs/DECISIONS.md', 'coordonnee')).toBe(false);
    expect(estExemptDe('docs/adr/0009-valeurs-du-monde-reel.md', 'coordonnee')).toBe(false);
  });

  it('REQ-GOV-031 — le type interdit d’élargir une exemption sans que la revue le voie', () => {
    // Deux valeurs, et deux seulement. Une exemption plus large exigerait d'élargir le type.
    for (const e of EXEMPTS) expect(['recopie', 'coordonnee']).toContain(e.exemptDe);
    // Et chacune porte sa raison : une exemption sans motif est une exemption qu'on ne relit pas.
    for (const e of EXEMPTS) expect(e.raison.length).toBeGreaterThan(30);
  });

  it('REQ-GOV-031 — `coordonnee` implique `recopie`, jamais l’inverse', () => {
    expect(estExemptDe('config/entite.json', 'recopie')).toBe(true);
    // ⚠️ Le registre n'est PLUS exempt de `coordonnee` depuis le second tour de la lentille
    // `securite` : il l'etait, et un IBAN ecrit dans un de ses 17 champs non secrets restait
    // invisible. Il reste exempt de `recopie` — il porte SES valeurs publiques, il est la source.
    expect(estExemptDe('config/entite.json', 'coordonnee')).toBe(false);
  });
});

/**
 * LES FORMES, ÉPROUVÉES SUR CE QUI LES A FAIT TOMBER — second tour de la lentille `securite`.
 *
 * Chaque cas ci-dessous est une sonde qu'un relecteur a jouée et que la garde a LAISSÉE PASSER.
 * Ils ne sont pas ici pour décorer : ils sont la seule chose qui empêche le prochain correctif
 * de rouvrir la porte qu'il vient de fermer.
 */
/** Un univers CONFORME auquel on ajoute UN fichier : le reste de la fixture ne varie pas,
 * donc une faute qui apparaît vient du fichier ajouté et de rien d'autre (RM-11). */
function universAvecFichier(chemin: string, contenu: string): Univers {
  const u = structuredClone(UNIVERS_CONFORME) as Univers;
  u.fichiers.push({ chemin, contenu });
  return u;
}

describe('REQ-GOV-031 — les formes de coordonnées, éprouvées sur les cas qui les ont fait tomber', () => {
  const IBAN_REEL = 'FR1420041010050500013M02606'; // clé de contrôle VALIDE

  it("REQ-GOV-031 — la clé de contrôle sépare un IBAN d'une chaîne qui lui ressemble", () => {
    expect(cleIbanValide(IBAN_REEL)).toBe(true);
    expect(cleIbanValide('DE89370400440532013000')).toBe(true);
    // Les trois qui faisaient rougir la garde sur un dépôt PROPRE : des identifiants dont les
    // deux premières lettres font un code pays (DE = Allemagne, AE = Émirats).
    expect(cleIbanValide('DE72D8B01D23490C87626583083FF94B')).toBe(false);
    expect(cleIbanValide('AE77F99D0366D48A')).toBe(false);
    expect(cleIbanValide('FC294892B7AA455D2398C4B6')).toBe(false);
  });

  it('REQ-GOV-031 — un IBAN en MINUSCULES est un IBAN', () => {
    // Signalé au premier tour, non traité au second : la casse avait été tranchée pour le BIC et
    // jamais reportée à l'IBAN. Un relevé n'impose pas la casse.
    const fautes = controler(
      universAvecFichier('docs/note.md', `Le compte est ${IBAN_REEL.toLowerCase()}.`)
    );
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');
    // La valeur est remontée en MAJUSCULES : un même compte écrit de deux façons est un compte.
    expect(fautes.some((f) => f.message.includes(IBAN_REEL))).toBe(true);
  });

  it("REQ-GOV-031 — un IBAN dans un champ NON secret du registre n'est plus invisible", () => {
    // Le registre était exempt du balayage entier : `banqueReceptrice.espaceDeTest` — le champ où
    // l'on colle un RIB, trois lignes sous `banqueDebitrice.iban` — ne voyait rien.
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({
      chemin: 'config/entite.json',
      contenu: `{ "espaceDeTest": "${IBAN_REEL}" }`,
    });
    expect(controler(u).map((f) => f.famille)).toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : le registre garde le droit de porter ses valeurs PUBLIQUES et ses exemples', () => {
    // Sans ce contre-témoin, la correction précédente reviendrait à interdire au registre d'être
    // la source — et on l'exempterait de nouveau en bloc, ce qui rouvrirait le veto.
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({
      chemin: 'config/entite.json',
      contenu: '{ "siren": "108018631", "exemple": "FR7612345678901234567890123" }',
    });
    expect(controler(u).map((f) => f.famille)).not.toContain('coordonnee_en_clair');
  });

  it("REQ-GOV-031 — un IBAN à clé VALIDE dans le registre rougit, même s'il RESSEMBLE à un exemple", () => {
    // 🔴 Troisième occurrence de la même indulgence. `coordonneeLegitimeAuRegistre` rendait `true`
    // sur `estExemplePlausible`, pour le seul `config/entite.json` — le fichier qu'on ouvre avec
    // un RIB en main. Un IBAN à clé mod-97 VALIDE et à compte zéro-padé y restait invisible, alors
    // que le MÊME rougissait dans `docs/DECISIONS.md`. Et la clause ne protégeait rien : les deux
    // exemples que le registre documente ont une clé FAUSSE, donc `cleIbanValide` les écarte déjà.
    const zeroPade = 'FR0030004000030000000000019'; // clé valide, compte zéro-padé
    expect(
      cleIbanValide(zeroPade),
      'le témoin doit avoir une clé VALIDE, sinon il ne prouve rien'
    ).toBe(true);
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({ chemin: 'config/entite.json', contenu: `{ "espaceDeTest": "${zeroPade}" }` });
    expect(controler(u).map((f) => f.famille)).toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — un BIC dans du JSON, du XML ou du CSV : les formats des fichiers BANCAIRES', () => {
    // 🔴 RÉGRESSION que j'ai introduite en fermant le faux positif `DOCUSEAL` : mon séparateur
    // commençait par `[ 	]*[=:]`, or en JSON le guillemet FERMANT de la clé s'intercale. La forme
    // rougissait avant, plus après — et elle échouait précisément sur les formats que ce lot venait
    // d'ajouter au balayage parce que ce sont ceux des fichiers bancaires.
    for (const [nom, texte] of [
      ['JSON', '{"bic": "BNPAFRPPXXX"}'],
      ['JSON serré', '{"bic":"BNPAFRPPXXX"}'],
      ['XML pain.001', '<BICFI>BNPAFRPPXXX</BICFI>'],
      // ⚠️ PAS de cas CSV ici, et c'est une DÉCISION mesurée par la lentille `securite` :
      // `bic,BNPAFRPPXXX` sur une seule ligne est une forme DÉGÉNÉRÉE. Un CSV réel nomme ses
      // colonnes en en-tête et porte ses valeurs sur une autre ligne, donc le mot-clé n'y est
      // jamais adjacent à sa valeur — et un relevé réel porte de toute façon l'IBAN à côté du
      // BIC, donc le fichier rougit par l'IBAN. Garder la virgule comme délimiteur ne l'aurait
      // pas attrapé et faisait rougir « Le BIC, DOCUSEAL et le reste. », du français ordinaire.
    ] as const) {
      expect(
        controler(universAvecFichier('docs/rib.json', texte)).map((f) => f.famille),
        nom
      ).toContain('coordonnee_en_clair');
    }
  });

  it('REQ-GOV-031 — un BIC se donne après un DÉLIMITEUR, jamais au milieu de la prose', () => {
    const rouges = [
      'export const PARTNERS_BIC_DEBITEUR = "BNPAFRPPXXX";',
      'BIC :\nBNPAFRPPXXX',
      'bic=BNPAFRPPXXX',
    ];
    for (const texte of rouges) {
      expect(
        controler(universAvecFichier('docs/rib.md', texte)).map((f) => f.famille),
        texte
      ).toContain('coordonnee_en_clair');
    }
  });

  it("REQ-GOV-031 — CONTRE-TÉMOIN : « DOCUSEAL » n'est pas un BIC, et le code pays ne suffisait pas à le dire", () => {
    // `DOCU` + `SE` + `AL` : `SE` EST la Suède. Le discriminant « code pays », posé pour fermer ce
    // faux positif précis, ne le fermait pas — il a fallu regarder ce qu'il y a ENTRE l'étiquette
    // et la valeur. Un discriminant qu'on n'éprouve pas contre son cas ne discrimine rien.
    for (const texte of [
      'Le BIC arrive avec DOCUSEAL plus tard.',
      'Le BIC porte ATTRIBUTION dans son libelle.',
    ]) {
      expect(
        controler(universAvecFichier('docs/note.md', texte)).map((f) => f.famille),
        texte
      ).not.toContain('coordonnee_en_clair');
    }
  });
});

/**
 * ── `normaliserEspaces()` — LA SUBSTITUTION QUI N'AVAIT AUCUN TÉMOIN ─────────────────────────
 *
 * 🔴 CE QUE LA LENTILLE `securite` A MESURÉ LE 2026-09-05, en mutant la fonction en `return t;` :
 *
 *         sur le MUTANT                        sur le fichier SAIN
 *   >>VERT | IBAN a espaces INSECABLES            ROUGE
 *   >>VERT | IBAN a TIRETS                        ROUGE
 *   ROUGE  | IBAN a espaces ASCII (temoin +)      ROUGE
 *   mutant : gov:entite → 0   |   gov:entite:prove → 0
 *   grep -E '00A0|insecable|202F|normaliserEspaces' dans ce fichier → AUCUN témoin
 *
 * La normalisation MARCHAIT. Rien ne la tenait. Un refactor l'aurait retirée sans qu'une seule
 * étape de Gate A change de couleur — et la garde aurait continué à s'annoncer complète.
 *
 * POURQUOI CE N'EST PAS COSMÉTIQUE. L'IBAN à espaces INSÉCABLES est la forme d'un copier-coller de
 * RIB : un relevé bancaire, un traitement de texte, un client de messagerie en produisent tous.
 * C'est donc le geste PAR DÉFAUT de la personne qui posera la vraie valeur d'AXION en phase 2 —
 * exactement le cas que cette garde existe pour attraper, dans un dépôt PUBLIC où l'écriture est
 * irréversible. La famille avait été signalée au premier tour, fermée au second, et gardée par
 * rien entre les deux.
 *
 * CE QUI EST DÉRIVÉ (RM-01). La liste des caractères n'est PAS retapée ici :
 * `caracteresNeutralises()` l'ÉNUMÈRE depuis `SEPARATEURS_NEUTRALISES`, la classe que
 * `normaliserEspaces` utilise vraiment. Un caractère ajouté à la classe gagne son témoin sans
 * qu'une ligne de ce fichier bouge ; un caractère retiré perd le sien. Deux copies divergent
 * toujours, et celle qui garde n'est jamais celle qu'on a corrigée.
 *
 * ⚠️ ET C'EST POURQUOI LA SONDE A SON PROPRE TÉMOIN POSITIF. Une liste VIDE et une liste juste
 * sont indiscernables pour un test qui se contente de boucler : zéro cas exécuté se lit
 * exactement comme zéro cas en échec. Le premier `it` ci-dessous assertie donc ce que la liste
 * CONTIENT (l'espace insécable, l'espace fine insécable, le tiret insécable, le tiret ASCII) et ce
 * qu'elle NE contient PAS (l'espace ASCII, le tiret cadratin, une lettre) — sans quoi la classe
 * serait devenue un attrape-tout, ce qui est l'autre façon de ne rien garder. Les points de code
 * sont écrits en toutes lettres : un caractère invisible dans un test est un test qu'on ne relit
 * pas.
 */
describe('REQ-GOV-031 — `normaliserEspaces` : chaque forme qu’elle neutralise a son témoin', () => {
  const FORMES = caracteresNeutralises();
  const nom = (c: string) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
  const CAR = (point: number) => String.fromCodePoint(point);

  it('REQ-GOV-031 — TÉMOIN POSITIF de la sonde : la liste des formes MESURE quelque chose', () => {
    // Sans cet `it`, une classe vide ferait passer TOUS les cas ci-dessous sans en exécuter un.
    expect(
      FORMES.length,
      'aucune forme neutralisée : la boucle qui suit serait vide'
    ).toBeGreaterThan(0);

    // Ce qu'elle DOIT contenir. L'espace insécable est la forme du copier-coller de RIB : c'est
    // la seule de la liste dont l'absence est, à elle seule, le défaut mesuré par la revue.
    expect(FORMES, 'U+00A0 — espace insécable, la forme d’un RIB collé').toContain(CAR(0x00a0));
    expect(FORMES, 'U+202F — espace fine insécable, celle des milliers en français').toContain(
      CAR(0x202f)
    );
    expect(FORMES, 'U+2011 — tiret insécable').toContain(CAR(0x2011));
    expect(
      FORMES,
      'U+002D — tiret ASCII, le séparateur d’IBAN le plus courant après l’espace'
    ).toContain(CAR(0x002d));

    // CONTRE-TÉMOIN DE LA SONDE. Sans lui, `/[\s\S]/` passerait ce test : une classe attrape-tout
    // « neutraliserait » tout le texte en espaces et la garde ne verrait plus rien du tout.
    expect(FORMES, 'l’espace ASCII n’a rien à normaliser vers elle-même').not.toContain(
      CAR(0x0020)
    );
    expect(
      FORMES,
      'U+2014 — le tiret cadratin est de la PONCTUATION, pas un séparateur'
    ).not.toContain(CAR(0x2014));
    expect(FORMES, 'une lettre n’est pas un séparateur').not.toContain('A');
  });

  it('REQ-GOV-031 — TÉMOIN DE RÉFÉRENCE : l’IBAN à espaces ASCII rougit — le cas déjà couvert', () => {
    // Le « témoin + » de la mesure du relecteur : le seul des trois qui rougissait DÉJÀ sur le
    // mutant. Il est ici pour que les cas suivants se lisent par différence avec lui.
    const fautes = controler(
      universAvecFichier(
        'docs/rib-colle.md',
        `Virement depuis ${ibanAvecSeparateur(IBAN_TEMOIN, CAR(0x0020))}.`
      )
    );
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');
  });

  it.each(FORMES.map((c) => ({ forme: c, code: nom(c) })))(
    'REQ-GOV-031 — un IBAN collé avec $code rougit',
    ({ forme }: { forme: string }) => {
      const colle = ibanAvecSeparateur(IBAN_TEMOIN, forme);
      // Le témoin doit VRAIMENT porter le séparateur, sinon il testerait la forme ASCII déguisée.
      expect(colle, `${nom(forme)} n’a pas été inséré`).toContain(forme);
      expect(colle).not.toBe(IBAN_TEMOIN);
      const fautes = controler(
        universAvecFichier('docs/rib-colle.md', `Virement depuis ${colle}.`)
      );
      expect(
        fautes.map((f) => f.famille),
        `${nom(forme)} — l’IBAN passe`
      ).toContain('coordonnee_en_clair');
      // La valeur est remontée SANS ses séparateurs : un même compte collé de deux façons est un
      // seul compte, et c'est ce qui permet de le reconnaître d'une révision à l'autre.
      expect(
        fautes.some((f) => f.message.includes(IBAN_TEMOIN)),
        `${nom(forme)} — valeur non normalisée`
      ).toBe(true);
    }
  );

  it('REQ-GOV-031 — CONTRE-TÉMOIN : une prose typographiée légitime reste VERTE, forme par forme', () => {
    // Une garde lexicale trop large interdit la phrase qui protège. Chaque caractère neutralisé
    // est ici DANS de la prose ordinaire — celle d'un document de travail français — et aucun ne
    // doit faire rougir quoi que ce soit. Le contre-témoin est construit sur la MÊME liste
    // dérivée : élargir la classe sans y penser ferait tomber ce cas-ci en même temps.
    for (const forme of FORMES) {
      const prose =
        `Le mandat est signé${forme}; le délai est de 30${forme}jours ouvrés, ` +
        `pour un montant de 1${forme}500${forme}€ HT. Dossier AXP${forme}2026${forme}001. ` +
        `Aucune coordonnée bancaire n’est écrite ici, et c’est la règle.`;
      expect(
        controler(universAvecFichier('docs/note-de-travail.md', prose)).map((f) => f.famille),
        `${nom(forme)} — la prose légitime rougit`
      ).not.toContain('coordonnee_en_clair');
    }
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : une date, une version, un SIREN ne deviennent pas un IBAN', () => {
    // Le tiret ASCII est dans la classe : tout ce qui s'écrit avec des tirets traverse désormais
    // `normaliserEspaces`. Si la normalisation fabriquait des faux positifs, c'est ici qu'ils
    // apparaîtraient — et une garde de publication qui rougit à tort se fait désarmer.
    const e = UNIVERS_CONFORME.registre.entite;
    for (const texte of [
      'Fusionnée le 2026-09-03, revue le 2026-09-05.',
      'Version 1.2.3-rc.4 — voir CHANGELOG.',
      `L’entité porte le SIREN ${e.siren} et la TVA ${e.tvaIntracommunautaire}.`,
      'Branche `fix/gov-036-espaces-corps`, worktree `../wt-espaces`.',
    ]) {
      expect(
        controler(universAvecFichier('docs/note-de-travail.md', texte)).map((f) => f.famille),
        texte
      ).not.toContain('coordonnee_en_clair');
    }
  });

  it('REQ-GOV-031 — `gov:entite:prove` porte lui aussi ces témoins, et le DIT', () => {
    // Sans cette assertion, les témoins ci-dessus ne tiendraient que `pnpm test` : `gov:entite:prove`
    // est l'étape de Gate A, et c'est elle que le relecteur a vue rendre 0 sur le mutant.
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`${FORMES.length} forme(s) d'espace ou de tiret`);
  });
});

/**
 * ── LE CORPS PUBLIÉ DE LA PR — L'ARTEFACT QUE LE GABARIT EXISTE POUR PRODUIRE ────────────────
 *
 * 🔴 CE QUI ÉTAIT MESURÉ. `docs/pr/31.tpl.md` est suivi, donc balayé, et l'IBAN y est masqué.
 * Mais rien ne lisait le corps PUBLIÉ :
 *
 *   pr:corps dans package.json ....... oui (l. 79)
 *   pr:corps dans .github/workflows/.. AUCUNE occurrence
 *   corps-de-pr dans docs/gates.json.. AUCUNE entrée
 *
 * Et le défaut ne vivait pas dans le corps courant : GitHub sert l'HISTORIQUE d'édition d'un corps
 * de PR (`userContentEdits`, GraphQL, lisible par quiconque). Sur la PR #31, le corps a été rendu
 * plusieurs fois ; certaines éditions portent la forme masquée, d'autres un IBAN à clé mod-97
 * VRAIE. Masquer le corps courant n'a pas dépublié les précédents. Aucun total n'est écrit ici :
 * il change à chaque tour de revue, et la garde l'imprime à chaque exécution.
 *
 * ATTÉNUATION : cette valeur-là était la SONDE d'un relecteur, pas la coordonnée d'AXION ; il n'y
 * a rien à révoquer. Ce qui bloquait, c'est l'absence de la garde qui empêchera le prochain, en
 * phase 2, quand la valeur sera réelle.
 *
 * CE QUI EST GARDÉ, ET LA FORMULATION EST ÉTROITE À DESSEIN : « le corps publié ne contient aucune
 * coordonnée ». PAS « le corps publié est égal au rendu local » — le rendu de `pr:corps` n'est pas
 * déterministe (`caseRevues()` lit la forge en direct), donc une égalité octet à octet rougirait
 * sur un corps parfaitement propre, et une garde qui rougit à tort se fait désarmer.
 *
 * ⚠️ LES CAS CI-DESSOUS SONT HORS LIGNE, ET C'EST VOULU (RM-11). Un test qui interroge GitHub
 * verdirait ou rougirait au gré de ce que la forge répond le jour où il tourne. La lecture réelle
 * (`lireCorpsPublie`) est INJECTÉE, et son sens de défaillance a désormais ses propres témoins.
 * Ce qui est jugé ici, c'est `jugerCorpsPublie`, qui est pur. Le mode en ligne, lui, a été joué à
 * la main sur quatre PR réelles : #31 → 1 (les éditions déclarées au registre, nommées et datées),
 * #28 / #29 / #30 → 0.
 */
describe('REQ-GOV-031 — le corps PUBLIÉ de la PR passe par le MÊME `coordonneesDe`', () => {
  /** La forme MASQUÉE que rend le gabarit : construite, jamais recopiée. */
  const MASQUE = 'FR76' + 'X'.repeat(23);
  const HORODATAGE = '2026-01-02T03:04:05Z';
  const PR = 4242;
  const propre = (texte: string, revision = false): LectureDuCorps => ({
    lu: true,
    pr: PR,
    corps: [{ origine: 'témoin', horodatage: revision ? HORODATAGE : null, texte, revision }],
    revisionsLues: revision ? 1 : 0,
    revisionsAnnoncees: revision ? 1 : 0,
    // La forge a rendu la main d'elle-même : ce n'est PAS une lecture interrompue.
    lectureInachevee: false,
  });
  /** Une exemption BIEN formée, construite depuis la valeur : jamais l'empreinte tapée à la main. */
  const exemptionPour = (valeur: string, sur = HORODATAGE, pr = PR): Exemption => ({
    pr,
    revision: sur,
    empreinte: empreinteDe(valeur),
    declaree: '2026-01-02',
    par: 'banc d’essai',
    motif:
      'témoin du banc d’essai : la valeur est construite à chaque exécution, elle n’a jamais été ' +
      'publiée, et il n’y a donc rien à révoquer.',
    definitive: true,
  });

  it('REQ-GOV-031 — un IBAN dans le corps COURANT rougit', () => {
    const v = jugerCorpsPublie(propre(`IBAN débiteur : ${IBAN_TEMOIN}`));
    expect(v.code).toBe(1);
    expect(v.fautes.map((f) => f.famille)).toContain('coordonnee_dans_le_corps_courant');
  });

  it('REQ-GOV-031 — un IBAN collé avec des espaces INSÉCABLES dans le corps rougit AUSSI', () => {
    // La jonction des deux défauts : le corps publié traverse la MÊME normalisation que les
    // fichiers suivis. Deux détecteurs en feraient deux qui divergeraient (RM-01/RM-07).
    const v = jugerCorpsPublie(
      propre(`IBAN débiteur : ${ibanAvecSeparateur(IBAN_TEMOIN, String.fromCodePoint(0x00a0))}`)
    );
    expect(v.code).toBe(1);
    expect(v.fautes.some((f) => f.message.includes(IBAN_TEMOIN))).toBe(true);
  });

  it('REQ-GOV-031 — LE DÉFAUT MESURÉ : corps courant PROPRE, révision qui porte la valeur', () => {
    const lecture: LectureDuCorps = {
      lu: true,
      pr: PR,
      corps: [
        {
          origine: 'corps courant',
          horodatage: null,
          texte: `IBAN débiteur : ${MASQUE}`,
          revision: false,
        },
        {
          origine: 'révision',
          horodatage: HORODATAGE,
          texte: `-IBAN débiteur : ${IBAN_TEMOIN}\n+IBAN débiteur : ${MASQUE}`,
          revision: true,
        },
      ],
      revisionsLues: 1,
      revisionsAnnoncees: 1,
      lectureInachevee: false,
    };
    const v = jugerCorpsPublie(lecture);
    expect(v.code).toBe(1);
    expect(v.fautes.map((f) => f.famille)).toContain('coordonnee_dans_une_revision');
    expect(v.fautes.map((f) => f.famille)).not.toContain('coordonnee_dans_le_corps_courant');
    // Le message doit dire que ce rouge-là ne se corrige PAS en éditant : la valeur est divulguée.
    expect(v.fautes[0]!.message).toContain('DIVULGUÉE');

    // ET LA SEULE SORTIE, PUISQUE L'HISTORIQUE EST IMMUABLE : DÉCLARER. Le même verdict, avec la
    // révision inscrite au registre des exemptions, redevient vert — c'est ce qui permet de
    // câbler cette garde en étape BLOQUANTE sans la rendre insatisfiable. Sans cette moitié-ci,
    // le cas ci-dessus prouverait seulement qu'on sait fabriquer une gate qu'on devra sauter.
    expect(jugerCorpsPublie(lecture, [exemptionPour(IBAN_TEMOIN)]).code).toBe(0);
  });

  it('REQ-GOV-031 — un échec de lecture rend INDÉTERMINÉ (2), jamais un succès', () => {
    // Le sens de défaillance, et c'est le cœur de cette garde-ci. `gh` absent, non authentifié,
    // hors ligne, réponse illisible : 2. Une garde qui rendrait 0 ferait croire à un contrôle qui
    // n'a pas eu lieu — c'est la gate Lighthouse d'axionia, verte des mois durant sur le runner.
    const v = jugerCorpsPublie({ lu: false, motif: 'gh: Bad credentials (témoin)' });
    expect(v.code).toBe(2);
    expect(v.code).not.toBe(0);
    expect(v.fautes.map((f) => f.famille)).toEqual(['lecture_impossible']);
    // Et 2 n'est PAS 1 : « je n'ai pas pu lire » se répare en donnant un jeton, « il y a une
    // coordonnée » se répare en changeant la coordonnée. Deux remèdes, deux couleurs.
    expect(v.code).not.toBe(1);
  });

  it('REQ-GOV-031 — une révision ANNONCÉE et non lue n’est pas réputée propre', () => {
    // Pagination, ou `diff` nul. Le défaut mesuré vivait dans des révisions : en réputer une
    // propre parce qu'on ne l'a pas lue reviendrait à écrire le bug qu'on corrige.
    const v = jugerCorpsPublie({
      lu: true,
      pr: PR,
      corps: [
        { origine: 'corps courant', horodatage: null, texte: 'rien à signaler', revision: false },
      ],
      revisionsLues: 2,
      revisionsAnnoncees: 11,
      // FAUX à dessein : ce témoin juge l'ÉCART, et lui seul (RM-11).
      lectureInachevee: false,
    });
    expect(v.code).toBe(2);
    expect(v.fautes.map((f) => f.famille)).toContain('revisions_non_lues');
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : la forme MASQUÉE du gabarit reste VERTE', () => {
    // Sans lui, la garde rougirait sur le corps qu'elle est censée bénir, et on la retirerait.
    expect(cleIbanValide(MASQUE), 'la forme masquée doit avoir une clé FAUSSE').toBe(false);
    expect(jugerCorpsPublie(propre(`IBAN débiteur : ${MASQUE}`)).code).toBe(0);
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : un corps de PR a le droit de NOMMER le SIREN', () => {
    // Le corps est jugé comme de la PROSE (`dansDuCode = false`). Un IBAN et un BIC y sont
    // refusés ; un SIREN, un SIRET, une TVA sont publics — citer n'est pas se servir.
    const e = UNIVERS_CONFORME.registre.entite;
    expect(jugerCorpsPublie(propre(`Entité : ${e.denomination}, SIREN ${e.siren}.`)).code).toBe(0);
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : une révision qui ne porte que de la prose typographiée', () => {
    const prose =
      `Le mandat est signé${String.fromCodePoint(0x00a0)}; délai de 30${String.fromCodePoint(0x202f)}jours ` +
      `— dossier AXP${String.fromCodePoint(0x2011)}2026${String.fromCodePoint(0x2011)}001.`;
    expect(jugerCorpsPublie(propre(prose, true)).code).toBe(0);
  });

  it(`REQ-GOV-031 — la garde du corps publié sait rougir : ses ${FAMILLES_CORPS_PUBLIE.length} familles ont un témoin`, () => {
    const { code, sortie } = lancer('--corps-publie', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(
      `Les ${FAMILLES_CORPS_PUBLIE.length} familles du corps publié rougissent`
    );
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces.length).toBe(FAMILLES_CORPS_PUBLIE.length);
  });

  it('REQ-GOV-031 — sans numéro de PR, le mode en ligne rend 2 : rien n’a été lu', () => {
    const { code, sortie } = lancer('--corps-publie');
    expect(code).toBe(2);
    expect(sortie).toContain('INDÉTERMINÉ');
  });

  /**
   * ── LE BANC D'ESSAI DOIT MESURER LA MÊME CHOSE ICI ET EN CI ────────────────────────────────
   *
   * 🔴 CE QUI A ÉTÉ MESURÉ le 2026-09-05, sur `650ea10` : le cas ci-dessus était VERT sur ma
   * machine et ROUGE en CI (run 33971108053, `AssertionError: expected +0 to be 2`). La cause
   * n'est pas dans la garde, elle est dans ce fichier : `lancer()` transmettait `process.env` au
   * sous-processus. En local `GITHUB_EVENT_PATH` n'existe pas — la garde ne trouve aucun numéro
   * et rend 2. En CI la variable existe TOUJOURS, `numeroDePrDeLEvenement()` y lit `31`, la garde
   * interroge réellement la forge et rend 0.
   *
   * 🔑 LA LEÇON, ET ELLE EST DE MÉTHODE : **un test qui dépend d'une variable d'environnement que
   * le développeur n'a pas et que la CI a mesure deux choses différentes selon l'endroit.** Le
   * « 480/480, exit 0 » que j'ai publié était vrai sur ma machine SEULEMENT. Un banc d'essai ne
   * peut pas hériter d'un environnement : il le CONSTRUIT.
   *
   * ⚠️ POURQUOI CE N'EST PAS DE LA TUYAUTERIE. La seule étape bloquante que cette PR introduit
   * faisait échouer la CI pour une raison SANS RAPPORT avec une coordonnée. C'est le mécanisme
   * exact par lequel une gate se fait désarmer : quelqu'un finit par la retirer « parce qu'elle
   * est capricieuse ».
   *
   * CE QUE CE CAS TIENT, ET QUI MANQUAIT : il POSE la variable que la CI pose, et exige le MÊME
   * verdict. Il rougit le jour où quelqu'un retire la neutralisation de `lancer()`.
   */
  it('REQ-GOV-031 — `GITHUB_EVENT_PATH` POSÉ ne change pas le verdict : le banc d’essai construit son environnement', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'evt-ci-'));
    const chemin = join(dossier, 'event.json');
    const avant = process.env.GITHUB_EVENT_PATH;
    try {
      writeFileSync(chemin, JSON.stringify({ pull_request: { number: PR } }));
      process.env.GITHUB_EVENT_PATH = chemin;

      // TÉMOIN POSITIF de la variable elle-même. Sans lui, ce cas passerait tout aussi bien sur
      // un fichier d'événement illisible : on mesurerait « rien à lire », pas la neutralisation.
      // Dix zéros veulent dire « absent » ou « je ne regarde pas », et rien ne les sépare.
      expect(numeroDePrDeLEvenement(), 'l’événement posé doit être LU').toBe(String(PR));

      const { code, sortie } = lancer('--corps-publie');
      expect(code).toBe(2);
      // ET LE MESSAGE, PAS SEULEMENT LE CODE. Sans la neutralisation, un poste hors ligne
      // rendrait 2 lui aussi — mais sur `lecture_impossible`, un tout autre diagnostic. Exiger
      // la phrase du refus « aucun numéro » est ce qui distingue les deux.
      expect(sortie).toContain('attend un NUMÉRO de PR');
    } finally {
      if (avant === undefined) delete process.env.GITHUB_EVENT_PATH;
      else process.env.GITHUB_EVENT_PATH = avant;
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-031 — la neutralisation est celle de TOUTES les invocations, pas de celle-ci seulement', () => {
    // Une règle tirée d'UN cas ne vaut que si elle est vérifiée contre les N. Le balayage de ce
    // fichier a rendu : six invocations de sous-processus, toutes par `lancer()`, aucune autre
    // voie ; les appels EN PROCESSUS de `src/config/entite.ts` passent déjà un environnement
    // explicite (`{}` ou une table construite), et les accesseurs qui n'ont pas de paramètre
    // `env` n'en lisent aucun. Le point unique est donc `lancer()` — et c'est LUI qu'on garde.
    expect(VARIABLES_NEUTRALISEES).toContain('GITHUB_EVENT_PATH');
    const avant = process.env.GITHUB_EVENT_PATH;
    try {
      process.env.GITHUB_EVENT_PATH = join(tmpdir(), 'inexistant-mais-pose.json');
      for (const v of VARIABLES_NEUTRALISEES) {
        expect(
          Object.keys(envDuBancDEssai()),
          `${v} traverse encore vers le sous-processus`
        ).not.toContain(v);
      }
      // CONTRE-TÉMOIN : la neutralisation est CIBLÉE, elle ne vide pas l'environnement. Un
      // sous-processus sans `PATH` ne trouverait plus `npx`, et l'échec ressemblerait à un rouge
      // de garde alors que ce serait un rouge d'outillage.
      expect(Object.keys(envDuBancDEssai()).length).toBeGreaterThan(0);
    } finally {
      if (avant === undefined) delete process.env.GITHUB_EVENT_PATH;
      else process.env.GITHUB_EVENT_PATH = avant;
    }
  });
});

/**
 * ── TOUS LES TÉMOINS D'IBAN ÉTAIENT FRANÇAIS — LA CAUSE COMMUNE DE QUATRE MUTANTS SURVIVANTS ──
 *
 * 🔴 CE QUE LA LENTILLE `mutation` A MESURÉ SUR CE FICHIER le 2026-09-05 :
 *
 *   mutation appliquée              | mesure                                    | témoin qui rougit
 *   --------------------------------|-------------------------------------------|------------------
 *   `normaliserEspaces` → `return t`| IBAN à espaces insécables : 1 faute → 0   | AUCUN
 *   `PAYS_ISO` réduit à `(?:FR)`    | IBAN allemand et espagnol : 1 → 0         | AUCUN
 *   `FORME_TVA_FR` neutralisée      | TVA tierce dans du code : 1 → 0           | AUCUN
 *   `FORME_SIREN` neutralisée       | SIREN tiers dans du code : 1 → 0          | AUCUN
 *
 * Dans les quatre cas : la gate rend 0, `--prove` rend 0, et le banc d'essai reste entièrement
 * vert. Quatre symptômes, UNE cause :
 *
 *     « Tous les témoins d'IBAN de ce dépôt étaient français. »
 *
 * 🔑 ET C'EST LA SOLIDITÉ DE `cleIbanValide` QUI MASQUAIT LE TROU. Elle résiste aux deux sens de
 * mutation — la lentille le dit — si bien que la moitié « IBAN » de la garde paraissait prouvée.
 * Ce qui n'était exercé par rien, c'est tout ce qui l'ENTOURE : la normalisation des espaces, les
 * quarante autres codes pays, et les deux familles de coordonnées qui n'avaient aucun témoin du
 * tout. Une fixture mono-cas ne prouve jamais la généralité de ce qu'elle traverse — et ici, dans
 * un dépôt PUBLIC, l'erreur est irréversible.
 *
 * POURQUOI CE CAS EST RÉEL, ET PAS UNE COMPLÉTUDE DE PRINCIPE. REQ-CPL-004 exige une résidence
 * fiscale dans le périmètre, PAS un compte français. L'IBAN qu'un apporteur collera pourra donc
 * être allemand, espagnol ou belge : c'est exactement la classe que la garde ne voyait pas.
 *
 * ⚠️ CE QUE CES TÉMOINS NE FONT PAS. Ils ne DÉRIVENT PAS `PAYS_ISO` et ne prétendent pas la
 * couvrir : ils rougissent quand la liste RÉTRÉCIT, et la dérivation a ses propres témoins
 * (REQ-GOV-031, plus bas). Les valeurs viennent de la garde (RM-01) : aucun IBAN littéral, aucune
 * TVA, aucun SIREN n'est retapé dans ce fichier.
 */
describe('REQ-GOV-031 — les coordonnées NON françaises, et les deux familles sans témoin', () => {
  it.each(Object.entries(IBANS_TEMOINS_ETRANGERS).map(([pays, iban]) => ({ pays, iban })))(
    'REQ-GOV-031 — un IBAN $pays en clair rougit — `PAYS_ISO` n’est pas décoratif',
    ({ pays, iban }: { pays: string; iban: string }) => {
      // Le témoin ne prouve quelque chose que si sa clé est VRAIE : un IBAN à clé fausse est
      // écarté en amont par `cleIbanValide`, et le cas mesurerait alors la clé, pas le pays.
      expect(cleIbanValide(iban), `${pays} — la clé du témoin doit être valide`).toBe(true);
      expect(iban.startsWith('FR'), `${pays} — le témoin doit être NON français`).toBe(false);
      expect(
        controler(
          universAvecFichier('docs/rib-porteur.md', `Le compte du porteur est ${iban}.`)
        ).map((f) => f.famille),
        `${pays} — l’IBAN passe`
      ).toContain('coordonnee_en_clair');
    }
  );

  it('REQ-GOV-031 — un IBAN étranger collé depuis un RIB rougit aussi : les deux défauts se croisent', () => {
    // La jonction : réduire `PAYS_ISO` OU retirer `normaliserEspaces` tue ce cas. Il est le seul
    // qui tombe sur les deux mutations à la fois, et c'est le cas RÉEL — un porteur allemand qui
    // colle son RIB depuis son relevé.
    const iban = IBANS_TEMOINS_ETRANGERS.DE!;
    const colle = ibanAvecSeparateur(iban, String.fromCodePoint(0x00a0));
    expect(colle).not.toBe(iban);
    const fautes = controler(universAvecFichier('docs/rib-porteur.md', `Compte : ${colle}`));
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');
    expect(fautes.some((f) => f.message.includes(iban))).toBe(true);
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : un code pays qui n’en est pas un ne fabrique pas d’IBAN', () => {
    // Sans lui, `PAYS_ISO` pourrait être remplacée par `[A-Z]{2}` — un attrape-tout qui ferait
    // rougir la garde sur des identifiants ordinaires, donc qui la ferait désarmer. Les trois
    // chaînes ci-dessous sont celles qui l'avaient DÉJÀ fait rougir sur un dépôt propre.
    for (const texte of [
      'Empreinte FC294892B7AA455D2398C4B6 du contrat.',
      'Jeton DE72D8B01D23490C87626583083FF94B en base.',
      'Identifiant AE77F99D0366D48A du lot.',
    ]) {
      expect(
        controler(universAvecFichier('docs/note-de-travail.md', texte)).map((f) => f.famille),
        texte
      ).not.toContain('coordonnee_en_clair');
    }
  });

  it('REQ-GOV-031 — NOTRE TVA dans du CODE rougit : elle se LIT, elle ne se porte pas', () => {
    // ⚠️ CE TEST A CHANGÉ DE PORTEUR LE 2026-09-22, ET C'EST LE CORRECTIF LUI-MÊME.
    // Il exerçait `TVA_TEMOIN_TIERS`, c'est-à-dire la TVA d'un TIERS — et il tenait donc vert
    // très exactement le défaut mesuré sur `t/int-t09` : 448 refus sur 452 portaient sur des
    // entreprises tierces rendues par une API publique. Le motif écrit de ce refus est RM-01,
    // source unique de l'identité de LA SOCIÉTÉ ; le porteur du témoin doit donc être NOUS.
    const notreTva = UNIVERS_CONFORME.registre.entite.tvaIntracommunautaire;
    const fautes = controler(
      universAvecFichier('src/facturation/fournisseur.ts', `export const TVA = '${notreTva}';`)
    );
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');
    expect(fautes.some((f) => f.message.includes(notreTva))).toBe(true);
  });

  it('REQ-GOV-031 — NOTRE SIREN dans du CODE rougit, et le mot-clé est ce qui le REPÈRE', () => {
    const notreSiren = UNIVERS_CONFORME.registre.entite.siren;
    const fautes = controler(
      universAvecFichier(
        'src/apporteur/structure.ts',
        `export const s = { siren: '${notreSiren}' };`
      )
    );
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');

    // Le mot-clé est EXIGÉ pour la famille `coordonnee_en_clair`, et ce n'est pas une faiblesse :
    // neuf chiffres nus sont trop souvent autre chose — un horodatage, un identifiant, un montant
    // en centimes. Une forme nue produirait le bruit qui fait désarmer une garde.
    // ⚠️ MAIS LE NUMÉRO NU N'EST PAS IMPUNI POUR AUTANT, et l'écrire ici évite de relire cette
    // limite comme une porte : c'est `valeur_recopiee` qui l'attrape, sans mot-clé, parce qu'elle
    // compare au registre. Les deux familles se recouvrent sur NOS numéros ; sur ceux des tiers,
    // il n'y a rien à recouvrir.
    const fautesNues = controler(
      universAvecFichier('src/lot/compteur.ts', `export const n = ${notreSiren};`)
    ).map((f) => f.famille);
    expect(fautesNues).not.toContain('coordonnee_en_clair');
    expect(fautesNues).toContain('valeur_recopiee');
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : la PROSE garde le droit de CITER une TVA et un SIREN', () => {
    // La frontière que la garde tient depuis le premier jour, et qui est ce qui la rend tenable :
    // un IBAN est un SECRET, refusé PARTOUT ; un SIREN, un SIRET et une TVA sont PUBLICS, lisibles
    // au répertoire des entreprises, et refusés seulement dans du CODE. Exiger d'une spécification
    // qu'elle ne nomme jamais un SIREN rendrait le dossier illisible sans rien protéger.
    const notreSiren = UNIVERS_CONFORME.registre.entite.siren;
    const notreTva = UNIVERS_CONFORME.registre.entite.tvaIntracommunautaire;
    const prose = `L’entité porte la TVA ${notreTva} et le SIREN ${notreSiren}.`;
    expect(
      controler(universAvecFichier('docs/spec/tiers.md', prose)).map((f) => f.famille)
    ).not.toContain('coordonnee_en_clair');

    // ⚠️ ET LE MÊME TEXTE, DANS DU CODE, ROUGIT. Sans cette moitié-ci, le contre-témoin
    // ci-dessus passerait aussi bien sur une garde qui ne regarde plus rien du tout.
    expect(
      controler(universAvecFichier('src/spec/tiers.ts', prose)).map((f) => f.famille)
    ).toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : un IBAN étranger n’est PAS refusé pour sa seule forme', () => {
    // La clé mod-97 reste le discriminant, y compris hors de France. Un identifiant qui commence
    // par un vrai code pays et dont la clé est fausse ne doit pas rougir : c'est ce qui a fait
    // rougir la garde sur un arbre propre, et c'est ce qui la ferait retirer.
    const faux = 'DE00370400440532013000';
    expect(cleIbanValide(faux), 'le contre-témoin doit avoir une clé FAUSSE').toBe(false);
    expect(
      controler(universAvecFichier('docs/note-de-travail.md', `Référence ${faux}.`)).map(
        (f) => f.famille
      )
    ).not.toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — `gov:entite:prove` porte ces témoins-là AUSSI, et les nomme', () => {
    // Un témoin qui ne tient que `pnpm test` ne garde pas la CI : l'étape de Gate A, c'est
    // `gov:entite:prove`, et c'est elle que la lentille a vue rendre 0 sur les quatre mutants.
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(
      `${Object.keys(IBANS_TEMOINS_ETRANGERS).length} IBAN NON français rougissent aussi`
    );
    for (const pays of Object.keys(IBANS_TEMOINS_ETRANGERS)) expect(sortie).toContain(pays);
  });
});

/**
 * ── « LES NÔTRES » CONTRE « LES TIERS » — LA DISTINCTION QUE LE MÉCANISME NE SAVAIT PAS DIRE ───
 *
 * 🔴 CE QUI A ÉTÉ MESURÉ SUR `t/int-t09` LE 2026-09-22. La garde rendait **452 défauts**, dont
 * **448 portaient sur des entreprises TIERCES** — DANONE, la SNCF, EDF, des communes — rendues
 * par l'API publique `recherche-entreprises` et enregistrées comme fixtures (RM-03 : une fixture
 * vient du producteur réel). **4 seulement étaient justes** : le SIREN et le SIRET d'AXION IA,
 * en dur dans un fichier suivi d'un dépôt PUBLIC.
 *
 * Le symptôme vaut mieux qu'un argument : **la garde demandait de déplacer le SIREN de DANONE
 * dans `config/entite.json`**. Un registre d'entité sommé de porter l'identité d'un tiers est la
 * preuve que le prédicat ne dit pas ce que la règle dit.
 *
 * 🔑 LE DÉFAUT EST DANS LE PRÉDICAT, PAS DANS LE PÉRIMÈTRE DE FICHIERS. `FORME_SIREN` refusait un
 * numéro **parce qu'il suit le mot `siren`/`siret`**, sans regarder DE QUI il s'agit — alors que
 * le seul motif écrit pour chercher les numéros PUBLICS dans un fichier de code est **RM-01,
 * source unique de l'identité de la Société** (exclusion (1) de `coordonneesDe`). Le motif parlait
 * des nôtres ; le code attrapait tout le monde.
 *
 * ⚠️ LES TROIS VOIES QUI NE MÈNENT NULLE PART, MESURÉES AVANT D'ÊTRE ÉCARTÉES.
 *   1. Fabriquer des numéros synthétiques dans les fixtures : la forme ne regarde PAS la clé de
 *      contrôle — un faux est refusé comme un vrai. On aurait détruit la valeur probante des
 *      fixtures (RM-03) SANS rendre la garde verte.
 *   2. Une exemption : `estExemptDe` n'admet que `recopie` et `coordonnee`, et `coordonnee`
 *      IMPLIQUE `recopie` — l'exemption qui aurait tu les tiers aurait tu AUSSI les deux vrais
 *      défauts. Le mécanisme ne savait pas dire « les tiers oui, les nôtres non ».
 *   3. Reclasser le fichier — faire qu'une fixture ne soit plus « du code » au sens de `estCode`.
 *      C'est la réponse qui vient en premier et c'est la pire : `valeur_recopiee` est gardée par
 *      le MÊME `estCode`, donc NOS identifiants seraient redevenus légitimes dans une fixture. Le
 *      remède aurait rouvert exactement la porte que la garde existe pour tenir.
 *
 * LA FORME RETENUE : le régime se lit sur la VALEUR, pas sur le nom du fichier. Un numéro public
 * n'est refusé que s'il est **le nôtre**, et « les nôtres » se DÉRIVE de `config/entite.json`
 * (RM-01) — la même liste, au même octet, que celle dont se sert `valeur_recopiee`. Un IBAN, lui,
 * reste un SECRET refusé PARTOUT : rien ici n'y touche.
 *
 * LES DEUX FACES COMPTENT AUTANT L'UNE QUE L'AUTRE. Sans la face rouge, on aurait ouvert une porte
 * au lieu d'affiner une règle ; sans la face verte, on n'aurait rien corrigé.
 */
describe('REQ-GOV-031 — un numéro PUBLIC se juge à SON PORTEUR, jamais à son seul mot-clé', () => {
  // Aucune valeur du monde réel ici (RM-11) : « les nôtres » se lisent dans le registre INJECTÉ,
  // « les tiers » sont les témoins synthétiques que la garde exporte déjà.
  const NOTRE_SIREN = UNIVERS_CONFORME.registre.entite.siren;
  const NOTRE_SIRET = UNIVERS_CONFORME.registre.entite.siret;
  const NOTRE_TVA = UNIVERS_CONFORME.registre.entite.tvaIntracommunautaire;

  const FIXTURE = 'tests/fixtures/recherche-entreprises/01-raison-sociale-exacte.json';

  it('REQ-GOV-031 — FACE ROUGE : NOTRE SIREN dans une FIXTURE rougit — `valeur_recopiee` reste actif jusque-là', () => {
    // La contrainte absolue du correctif : nos propres identifiants n'ont rien à faire en dur,
    // MÊME dans une fixture. Un dépôt PUBLIC ne fait aucune différence entre un fichier de test
    // et un autre — c'est le seul des 24 fichiers mesurés où la garde avait raison.
    const fautes = controler(
      universAvecFichier(FIXTURE, `{ "siren": "${NOTRE_SIREN}", "siret": "${NOTRE_SIRET}" }`)
    );
    expect(fautes.map((f) => f.famille)).toContain('valeur_recopiee');
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');
    expect(fautes.some((f) => f.message.includes(NOTRE_SIREN))).toBe(true);
  });

  it('REQ-GOV-031 — FACE VERTE : le SIREN d’un TIERS, DANS LA MÊME FIXTURE, reste vert', () => {
    // Le même fichier, le même mot-clé, la même forme : seule change l'identité du porteur. C'est
    // la seconde face, et elle est ce qui distingue « affiner une règle » d'« ouvrir une porte » —
    // sans elle, on ne saurait pas si la garde discrimine ou si elle s'est tue.
    const fautes = controler(
      universAvecFichier(
        FIXTURE,
        `{ "siren": "${SIREN_TEMOIN_TIERS}", "tva": "${TVA_TEMOIN_TIERS}" }`
      )
    );
    expect(fautes.map((f) => f.famille)).not.toContain('coordonnee_en_clair');
    expect(fautes.map((f) => f.famille)).not.toContain('valeur_recopiee');
  });

  it('REQ-GOV-031 — FACE VERTE : le SIREN et la TVA d’un TIERS dans un fichier de CODE restent verts', () => {
    // Un mandataire d'API publique ENREGISTRE ce que le tiers lui rend : c'est la donnée lue, pas
    // une identité recopiée. RM-01 n'a rien à en dire — il n'existe pas de « source unique » de
    // l'identité de DANONE dans ce dépôt, et lui en réclamer une était le symptôme du défaut.
    expect(
      controler(
        universAvecFichier(
          'src/server/integrations/recherche-entreprises/cas-enregistres.ts',
          `export const cas = { siren: '${SIREN_TEMOIN_TIERS}', tva: '${TVA_TEMOIN_TIERS}' };`
        )
      ).map((f) => f.famille)
    ).not.toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — FACE ROUGE : NOTRE TVA dans la MÊME fixture rougit aussi', () => {
    // Les trois identifiants publics du registre suivent le même régime : ce n'est pas le SIREN
    // qui est gardé, c'est « ce que le registre arrête ». Sans ce cas, on pourrait neutraliser
    // `FORME_TVA_FR` sans qu'aucune face ne change de couleur — le mutant que la lentille
    // `mutation` avait déjà vu survivre une fois.
    expect(
      controler(universAvecFichier(FIXTURE, `{ "tva": "${NOTRE_TVA}" }`)).map((f) => f.famille)
    ).toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — NOTRE SIRET porte NOTRE SIREN : la reconnaissance est par CONTENANCE, pas par égalité', () => {
    // `20407031100017` CONTIENT `204070311`. Une comparaison par égalité stricte laisserait passer
    // l'établissement alors que c'est la MÊME entité — et c'est la forme sous laquelle un registre
    // d'entreprises rend nos propres coordonnées. `valeur_recopiee` compare déjà par `includes` :
    // les deux familles doivent lire la même liste DE LA MÊME FAÇON, sans quoi l'une absoudrait ce
    // que l'autre refuse.
    const fautes = controler(universAvecFichier(FIXTURE, `{ "siret": "${NOTRE_SIRET}" }`));
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — « les nôtres » se DÉRIVE du registre : renverser le registre DÉPLACE le rouge', () => {
    // RM-01 prouvé par MUTATION plutôt qu'affirmé : si la liste était recopiée dans la garde, le
    // rouge resterait accroché à l'ancien numéro. Ici le registre change, et le verdict suit.
    const contenu = `{ "siren": "${SIREN_TEMOIN_TIERS}" }`;

    expect(controler(universAvecFichier(FIXTURE, contenu)).map((f) => f.famille)).not.toContain(
      'coordonnee_en_clair'
    );

    const renverse = structuredClone(UNIVERS_CONFORME) as Univers;
    renverse.registre.entite.siren = SIREN_TEMOIN_TIERS;
    renverse.fichiers.push({ chemin: FIXTURE, contenu });
    expect(controler(renverse).map((f) => f.famille)).toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — le régime du SECRET est INTACT : un IBAN rougit dans une fixture de TIERS', () => {
    // Non-régression du sens qu'on oublie. La distinction posée ici ne vaut QUE pour les numéros
    // publics : un IBAN est refusé partout, quel qu'en soit le porteur, parce qu'un IBAN divulgué
    // ne se reprend pas.
    expect(
      controler(universAvecFichier(FIXTURE, `{ "iban": "${IBAN_TEMOIN}" }`)).map((f) => f.famille)
    ).toContain('coordonnee_en_clair');
  });

  it('REQ-GOV-031 — `coordonneesDe` REFUSE de juger du code sans savoir qui est « nous »', () => {
    // Une liste absente rendrait un vert silencieux sur NOS numéros : le sens dangereux de
    // l'erreur, dans une garde de publication. Elle LÈVE, comme `ibanAvecSeparateur` lève sur une
    // entrée qu'elle ne sait pas juger — une réparation silencieuse ferait passer le défaut pour
    // un succès. Le type l'interdit déjà à la compilation ; ce témoin tient le cas où quelqu'un
    // passe outre.
    const sansType = coordonneesDe as unknown as (
      c: string,
      d: boolean,
      ch?: string,
      n?: readonly string[]
    ) => string[];
    expect(() => sansType(`{ "siren": "${NOTRE_SIREN}" }`, true, FIXTURE)).toThrow(
      /identifiants de l’entité/i
    );
  });

  it('REQ-GOV-031 — la PORTÉE des numéros publics est DÉCLARÉE à UN seul endroit, et imprimée dans le vert', () => {
    // « Aucune coordonnée » sans sa portée se lit comme une absence prouvée. Le vert dit de QUI
    // les numéros publics sont cherchés, et COMBIEN d'identifiants APPARIABLES le registre en
    // donne.
    //
    // 🔴 CE TEST A ÉTÉ REFAIT LE 2026-09-22, PARCE QU'IL NE GARDAIT RIEN. Il se contentait de
    // `toMatch(/\d+ identifiant/)` : une CONSTANTE y survivait. La lentille `securite` l'a
    // démontré par mutation — `…length` remplacé par un `0` littéral laissait la spec VERTE et
    // `--prove` en zéro, pendant que la garde imprimait « 0 identifiant(s) confronté(s) » en en
    // confrontant quatre. Un compteur qu'aucun témoin n'ancre n'est pas une mesure, c'est une
    // décoration — et celui-ci était censé rendre visible une CÉCITÉ.
    //
    // L'ancrage est donc à DEUX SENS, parce que le mutant survivait dans les deux :
    //   — il ne peut pas être NUL pendant que quatre numéros sont cherchés (ce test-ci) ;
    //   — il ne peut pas être NON NUL pendant que zéro l'est (les deux tests suivants).
    const { code, sortie } = lancer();
    expect(code).toBe(0);
    expect(sortie).toContain(PORTEE_DES_NUMEROS_PUBLICS);

    // La mesure de référence est calculée ICI, par le banc d'essai, et non lue dans la sortie :
    // un mutant posé sur la ligne d'impression fait alors diverger les deux.
    const attendu = identifiantsApparriables(registreDuDepot()).length;
    expect(
      attendu,
      'le dépôt réel doit avoir au moins un identifiant public appariable'
    ).toBeGreaterThan(0);
    expect(sortie).toContain(`${attendu} identifiant(s) du registre confronté(s)`);
  });

  it('REQ-GOV-031 — le compte ne compte QUE l’appariable : le domaine servi est un identifiant, pas un numéro', () => {
    // L'ancrage indépendant de la dérivation : la réponse est connue PAR CONSTRUCTION, pas
    // recalculée par le même chemin que le code. `domaines.servi` est bien `identifiant: true` —
    // sa recopie est une faute, et `valeur_recopiee` continue de la juger — mais AUCUNE forme
    // publique ne peut l'apparier. Le compter parmi les numéros cherchés, c'est annoncer une
    // surveillance qui n'existe pas.
    const registre = structuredClone(UNIVERS_CONFORME.registre) as Registre;
    registre.entite.siret = SENTINELLE;
    registre.entite.tvaIntracommunautaire = SENTINELLE;

    // Trois identifiants non sentinelle restent au registre : le SIREN, le domaine servi… et
    // c'est tout ce qui compte ici. UN SEUL est appariable.
    expect(identifiantsDuRegistre(registre).length).toBeGreaterThan(1);
    expect(identifiantsApparriables(registre).map((x) => x.champ.cle)).toEqual(['entite.siren']);
  });

  it('REQ-GOV-031 — ZÉRO référence publique n’est pas un dépôt propre : la garde REFUSE au lieu de verdir', () => {
    // 🔴 LA RÉGRESSION QUE LA LENTILLE `exactitude` A MESURÉE, ET QUI A FAIT REFUSER #107.
    // En unifiant la SOURCE des deux familles — le bon geste — j'avais aussi unifié leur MODE DE
    // PANNE : registre sans référence ⇒ plus rien n'est cherché, EN SILENCE. Avant le correctif,
    // l'arme publique ne dépendait pas du registre, donc elle attrapait encore nos numéros dans
    // cet état-là.
    //
    // L'état en question est LÉGITIME et il arrivera : une décision rouverte remet ses champs à
    // la sentinelle (`valeur_sans_decision` l'exige dans l'autre sens). C'est très exactement le
    // moment où l'arme publique n'a plus de cible — donc le moment où il ne faut pas dire « rien
    // trouvé ». Ne pas avoir de référence n'est pas avoir vérifié : c'est le même principe que
    // `source_illisible`, déjà tenu par ce fichier.
    const registre = structuredClone(UNIVERS_CONFORME.registre) as Registre;
    registre.entite.siren = SENTINELLE;
    registre.entite.siret = SENTINELLE;
    registre.entite.tvaIntracommunautaire = SENTINELLE;
    expect(identifiantsApparriables(registre)).toEqual([]);
    // Le domaine servi, lui, est toujours là : le refus ne doit donc PAS se lire « le registre
    // est vide », il se lit « aucun identifiant APPARIABLE ».
    expect(identifiantsDuRegistre(registre).length).toBeGreaterThan(0);

    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.registre = registre;
    u.fichiers.push({
      chemin: 'src/facturation/entete.ts',
      contenu: `export const SIREN = '${UNIVERS_CONFORME.registre.entite.siren}';\n`,
    });
    const fautes = controler(u);
    expect(fautes.map((f) => f.famille)).toContain('aucune_reference_publique');
    expect(
      fautes.some((f) => f.famille === 'aucune_reference_publique' && /appariable/i.test(f.message))
    ).toBe(true);
  });

  it('REQ-GOV-031 — le refus est une FAMILLE, pas une levée : il passe par le canal de refus et il est déclaré', () => {
    // Le choix de forme, et il n'est pas cosmétique. `coordonneesDe` LÈVE quand on lui demande de
    // juger du code sans la liste : c'est une erreur de PROGRAMMATION, un appelant a oublié un
    // argument. Ici, c'est un fait sur l'UNIVERS JUGÉ — donc un verdict, donc une famille. Une
    // levée sortirait du canal de refus, ne s'imprimerait pas avec les autres, n'aurait pas de
    // témoin dans `--prove`, et créerait exactement le défaut que GOV-067 existe pour fermer :
    // « un sous-module lève une erreur SANS famille de refus ».
    expect(FAMILLES).toContain('aucune_reference_publique');
  });
});

/**
 * ── LES EXEMPTIONS DE RÉVISION — RENDRE L'EXCEPTION EXPLICITE PLUTÔT QUE L'ABSENCE DE GARDE ───
 *
 * 🔴 J'AI D'ABORD PROPOSÉ LA MAUVAISE RÉPONSE, ET ELLE AVAIT L'AIR PRUDENTE. L'historique
 * d'édition d'un corps de PR est IMMUABLE : la PR #31 porte pour toujours les éditions DÉCLARÉES
 * au registre, avec un IBAN à clé mod-97 vraie ; câbler le mode en ligne en étape bloquante
 * rendait donc cette PR — et
 * toute sa pile — infusionnable. J'en ai conclu qu'il ne fallait câbler que la preuve hors ligne,
 * et lancer le mode en ligne « à la main avant fusion ».
 *
 * 🔑 ÉCRITE NOIR SUR BLANC, CETTE CONCLUSION SE RECONNAÎT : **une garde qui ne tourne que quand
 * quelqu'un y pense ne tourne pas.** Le dépôt voisin en donne la version longue — toutes ses gates
 * de budget portent `continue-on-error: true`, aucune PR qui alourdit le bundle n'a jamais rougi,
 * et pendant des mois les revues ont écrit « le risque est couvert par la gate ». Une gate qui ne
 * bloque pas produit une fausse sécurité, qui est pire que pas de gate du tout.
 *
 * LA TROISIÈME VOIE : la garde reste BLOQUANTE, et ce qui ne peut pas être corrigé est DÉCLARÉ.
 * Une dette qu'on ne peut pas rembourser se déclare ; elle ne se contourne pas.
 *
 * CE QUE CES CAS TIENNENT, ET C'EST TOUT L'ENJEU — un registre d'exceptions est le mécanisme le
 * plus facile à transformer en passoire. Trois propriétés, chacune avec son témoin :
 *   1. une exemption couvre UNE révision d'UNE PR portant UNE coordonnée : les TROIS clés doivent
 *      concorder, sans quoi elle absoudrait d'avance tout ce qui reste à écrire ;
 *   2. une révision NON déclarée rougit MÊME sur une PR qui a par ailleurs des révisions
 *      exemptées — c'est ce qui empêche une ligne de contaminer sa voisine ;
 *   3. une exemption qui n'absout PLUS rien ROUGIT, elle n'absout pas. C'est le cas qui compte le
 *      plus : une ligne dont l'empreinte ne correspond plus au contenu de la révision est une
 *      autorisation ouverte sur un texte que personne n'a examiné.
 *
 * ⚠️ ET LE CORPS COURANT N'EST JAMAIS EXEMPTABLE. Il s'édite, donc il n'y a rien à excuser : une
 * exemption qui le couvrirait ne serait pas une dette déclarée, ce serait une permission de
 * publier. La distinction entre « irréparable » et « pas encore réparé » est toute la légitimité
 * de ce registre.
 */
describe('REQ-GOV-031 — les exemptions de révision, et ce qui les empêche d’être une passoire', () => {
  const HORO = '2026-03-04T05:06:07Z';
  const PR = 777;
  const lecture = (
    revisions: { horodatage: string; texte: string }[],
    corpsCourant = 'rien à signaler'
  ): LectureDuCorps => ({
    lu: true,
    pr: PR,
    corps: [
      { origine: 'corps courant', horodatage: null, texte: corpsCourant, revision: false },
      ...revisions.map((r) => ({
        origine: `révision du ${r.horodatage}`,
        horodatage: r.horodatage,
        texte: r.texte,
        revision: true,
      })),
    ],
    revisionsLues: revisions.length,
    revisionsAnnoncees: revisions.length,
    lectureInachevee: false,
  });
  /** Une exemption bien formée, CONSTRUITE depuis la valeur : jamais une empreinte tapée. */
  const pour = (valeur: string, sur = HORO, pr = PR): Exemption => ({
    pr,
    revision: sur,
    empreinte: empreinteDe(valeur),
    declaree: '2026-03-04',
    par: 'banc d’essai',
    motif:
      'témoin du banc d’essai : la valeur est construite à chaque exécution, elle n’a jamais été ' +
      'publiée nulle part, et il n’y a donc rien à révoquer.',
    definitive: true,
  });

  it('REQ-GOV-031 — TÉMOIN POSITIF de la sonde : `empreinteDe` MESURE, et elle discrimine', () => {
    // Sans ce cas, une `empreinteDe` qui rendrait une constante ferait passer tous les autres :
    // toutes les exemptions s'appliqueraient à toutes les coordonnées.
    const a = empreinteDe(IBAN_TEMOIN);
    const b = empreinteDe(IBANS_TEMOINS_ETRANGERS.DE!);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    // Un SHA-256 COMPLET, et pas tronqué : seize caractères se collisionnent en 2^32 essais, ce
    // qui laisserait absoudre une AUTRE coordonnée que celle qu'on a examinée.
    expect(a.length).toBe(64);
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : une révision DÉCLARÉE sur les TROIS clés est verte', () => {
    // Sans ce cas, la garde serait insatisfiable sur toute PR déjà polluée — et une gate
    // insatisfiable, on apprend à la sauter.
    const v = jugerCorpsPublie(lecture([{ horodatage: HORO, texte: `IBAN : ${IBAN_TEMOIN}` }]), [
      pour(IBAN_TEMOIN),
    ]);
    expect(v.code).toBe(0);
    expect(v.fautes).toEqual([]);
  });

  it('REQ-GOV-031 — les TROIS clés sont exigées : changer l’une d’elles n’absout plus', () => {
    const l = lecture([{ horodatage: HORO, texte: `IBAN : ${IBAN_TEMOIN}` }]);
    // mauvaise PR
    expect(jugerCorpsPublie(l, [pour(IBAN_TEMOIN, HORO, PR + 1)]).code).toBe(1);
    // mauvais horodatage
    expect(jugerCorpsPublie(l, [pour(IBAN_TEMOIN, '2026-03-04T05:06:08Z')]).code).toBe(1);
    // mauvaise empreinte — une AUTRE coordonnée
    expect(jugerCorpsPublie(l, [pour(IBANS_TEMOINS_ETRANGERS.DE!)]).code).toBe(1);
  });

  it('REQ-GOV-031 — une empreinte TRONQUÉE n’ABSOUT rien : la comparaison porte sur les 64 caractères', () => {
    // 🔴 CE QUE LA LENTILLE `mutation` A MESURÉ le 2026-09-05 : ce qui était gardé, c'est la
    // forme STOCKÉE (`/^[0-9a-f]{64}$/`, par `controlerRegistreExemptions`) ; la forme COMPARÉE
    // ne l'était pas. Une comparaison par PRÉFIXE — `empreinte.startsWith(e.empreinte)` — laisse
    // la ligne ABSOUDRE la coordonnée tout en la déclarant malformée : le verdict reste 1, et les
    // deux situations deviennent indiscernables. Une affirmation deux fois écrite dans la PR, et
    // zéro fois gardée.
    const tronquee: Exemption = {
      ...pour(IBAN_TEMOIN),
      empreinte: empreinteDe(IBAN_TEMOIN).slice(0, 16),
    };
    const v = jugerCorpsPublie(lecture([{ horodatage: HORO, texte: `IBAN : ${IBAN_TEMOIN}` }]), [
      tronquee,
    ]);
    expect(v.fautes.map((f) => f.famille)).toContain('exemption_malformee');
    // LA MOITIÉ QUI MANQUAIT : la coordonnée est TOUJOURS signalée. Seize caractères hexadécimaux
    // se collisionnent en 2^32 essais — une ligne tronquée absoudrait une AUTRE coordonnée que
    // celle qu'on a examinée, et c'est l'argument que la PR avance deux fois.
    expect(v.fautes.map((f) => f.famille)).toContain('coordonnee_dans_une_revision');
    expect(
      exemptionsServies(lecture([{ horodatage: HORO, texte: `IBAN : ${IBAN_TEMOIN}` }]), [tronquee])
    ).toEqual([]);
  });

  it('REQ-GOV-031 — `exemptionsServies` apparie sur les TROIS clés, pas sur la seule PR', () => {
    // 🔴 MUTANT DU 2026-09-05 : réduire la sélection à `exemptions.find(x => x.pr === lecture.pr)`.
    // Aucun cas ne rougissait. C'est le registre en passoire par la porte d'à côté : ce qui est
    // apparié au moment de JUGER l'était déjà, ce qui est apparié au moment de DIRE sur quoi le
    // vert repose ne l'était pas — et c'est cette seconde liste qu'un humain relit.
    const l = lecture([{ horodatage: HORO, texte: `IBAN : ${IBAN_TEMOIN}` }]);
    const bonne = pour(IBAN_TEMOIN, HORO, PR);
    // TROIS leurres, un par clé, chacun ne différant de la bonne QUE par la sienne — et tous
    // placés AVANT elle, puisque c'est la première ligne appariée qui est rendue.
    //
    // 🔴 LE TROISIÈME MANQUAIT, et son absence a laissé survivre un mutant le 2026-09-05 : les
    // deux leurres d'origine étaient, mot pour mot, « de la MÊME PR ». Retirer la clé `pr` de
    // l'appariement ne faisait donc rougir aucun cas — deux clés sur trois étaient mesurées, la
    // troisième n'était que dans le TITRE. C'est la faute du tour précédent, un cran plus bas :
    // un témoin qui ne fait pas varier ce que son titre annonce.
    const autreEmpreinte = pour(IBANS_TEMOINS_ETRANGERS.DE!, HORO, PR);
    const autreHorodatage = pour(IBAN_TEMOIN, '2026-03-04T05:06:08Z', PR);
    const autrePr = pour(IBAN_TEMOIN, HORO, PR + 1);
    expect(autrePr.pr, 'le leurre doit venir d’une AUTRE PR').not.toBe(l.lu && l.pr);
    expect(autrePr.revision, 'et ne différer QUE par là').toBe(bonne.revision);
    expect(autrePr.empreinte).toBe(bonne.empreinte);
    expect(exemptionsServies(l, [autrePr, autreEmpreinte, autreHorodatage, bonne])).toEqual([
      bonne,
    ]);

    // TÉMOIN POSITIF de la fonction elle-même : sur la bonne ligne SEULE, elle rend cette ligne.
    // Sans lui, une `exemptionsServies` qui rendrait toujours `[]` passerait le cas ci-dessus.
    expect(exemptionsServies(l, [bonne])).toEqual([bonne]);
    // Et le corps COURANT ne sert JAMAIS d'exemption : il s'édite, il n'y a rien à excuser.
    expect(exemptionsServies(lecture([], `IBAN : ${IBAN_TEMOIN}`), [bonne])).toEqual([]);
  });

  it('REQ-GOV-031 — une révision NON déclarée rougit MÊME sur une PR qui a des exemptions', () => {
    // Le témoin qui empêche une ligne du registre de contaminer sa voisine. Sans lui, exempter
    // une révision reviendrait à exempter la PR — donc tout ce qui reste à y écrire.
    const v = jugerCorpsPublie(
      lecture([
        { horodatage: HORO, texte: `IBAN : ${IBAN_TEMOIN}` },
        { horodatage: '2026-03-04T09:09:09Z', texte: `IBAN : ${IBANS_TEMOINS_ETRANGERS.ES}` },
      ]),
      [pour(IBAN_TEMOIN)]
    );
    expect(v.code).toBe(1);
    expect(v.fautes.map((f) => f.famille)).toContain('coordonnee_dans_une_revision');
    // Et c'est bien la NON déclarée qui est nommée, pas l'autre.
    expect(v.fautes.some((f) => f.message.includes('2026-03-04T09:09:09Z'))).toBe(true);
    expect(v.fautes.some((f) => f.message.includes(IBANS_TEMOINS_ETRANGERS.ES!))).toBe(true);
  });

  it('REQ-GOV-031 — une exemption qui n’absout PLUS rien ROUGIT, elle n’absout pas', () => {
    // LE CAS QUI COMPTE LE PLUS. Une ligne dont l'empreinte ne correspond plus à ce que la
    // révision contient est une autorisation ouverte sur un texte que personne n'a examiné.
    const v = jugerCorpsPublie(
      lecture([{ horodatage: HORO, texte: 'plus aucune coordonnée dans cette révision' }]),
      [pour(IBAN_TEMOIN)]
    );
    expect(v.code).toBe(1);
    expect(v.fautes.map((f) => f.famille)).toContain('exemption_sans_objet');
    // ⚠️ Le message ne doit JAMAIS republier la valeur : l'empreinte est tronquée à l'affichage,
    // et la valeur n'y figure pas — le registre existe pour ne pas l'écrire.
    expect(v.fautes.some((f) => f.message.includes(IBAN_TEMOIN))).toBe(false);
  });

  it('REQ-GOV-031 — le corps COURANT n’est JAMAIS exemptable : il s’édite', () => {
    // Une exemption qui couvrirait le corps courant ne serait pas une dette déclarée, ce serait
    // une permission de publier. La distinction « irréparable » / « pas encore réparé » est
    // toute la légitimité de ce registre.
    const v = jugerCorpsPublie(lecture([], `IBAN : ${IBAN_TEMOIN}`), [pour(IBAN_TEMOIN)]);
    expect(v.code).toBe(1);
    expect(v.fautes.map((f) => f.famille)).toContain('coordonnee_dans_le_corps_courant');
  });

  it('REQ-GOV-031 — une exemption MAL FORMÉE rougit : elle a l’air d’une décision prise', () => {
    const base = lecture([{ horodatage: HORO, texte: `IBAN : ${IBAN_TEMOIN}` }]);
    const cassees: [string, Exemption][] = [
      ['motif vide', { ...pour(IBAN_TEMOIN), motif: '' }],
      [
        'empreinte TRONQUÉE',
        { ...pour(IBAN_TEMOIN), empreinte: empreinteDe(IBAN_TEMOIN).slice(0, 16) },
      ],
      [
        'horodatage qui n’est pas celui d’une révision',
        { ...pour(IBAN_TEMOIN), revision: '2026-03-04' },
      ],
      ['aucun propriétaire', { ...pour(IBAN_TEMOIN), par: '   ' }],
      ['aucune date de déclaration', { ...pour(IBAN_TEMOIN), declaree: 'hier' }],
    ];
    for (const [quoi, e] of cassees) {
      const v = jugerCorpsPublie(base, [e]);
      expect(
        v.fautes.map((f) => f.famille),
        quoi
      ).toContain('exemption_malformee');
      expect(v.code, quoi).toBe(1);
    }
    // Et un DOUBLON : deux lignes pour une exception, on ne saura pas laquelle retirer.
    expect(
      controlerRegistreExemptions([pour(IBAN_TEMOIN), pour(IBAN_TEMOIN)]).map((f) => f.famille)
    ).toContain('exemption_malformee');
  });

  it('REQ-GOV-031 — une exemption d’une AUTRE PR ne traverse pas, et ne rougit pas ici', () => {
    // Sans cette borne, le registre entier rougirait à chaque PR — ce qui reviendrait à
    // interdire d'en tenir un, donc à revenir à l'absence de garde par un autre chemin.
    const v = jugerCorpsPublie(lecture([{ horodatage: HORO, texte: 'rien' }]), [
      pour(IBAN_TEMOIN, HORO, PR + 99),
    ]);
    expect(v.code).toBe(0);
  });

  it('REQ-GOV-031 — une LECTURE MANQUÉE ne juge AUCUNE exemption : 2, et rien d’autre', () => {
    // Sans cette règle, une panne de réseau transformerait toutes les exemptions en dettes
    // imaginaires : le verdict passerait de « je n'ai pas pu lire » à « ton registre est faux »,
    // deux diagnostics opposés que rien ne permettrait plus de distinguer.
    const v = jugerCorpsPublie({ lu: false, motif: 'réseau injoignable (témoin)' }, [
      pour(IBAN_TEMOIN),
    ]);
    expect(v.code).toBe(2);
    expect(v.fautes.map((f) => f.famille)).toEqual(['lecture_impossible']);
  });

  it('REQ-GOV-031 — une lecture PARTIELLE ne déclare aucune exemption sans objet', () => {
    // Même raison, appliquée au détail : une exemption peut viser une révision non paginée.
    const v = jugerCorpsPublie(
      {
        lu: true,
        pr: PR,
        corps: [{ origine: 'corps courant', horodatage: null, texte: 'rien', revision: false }],
        revisionsLues: 1,
        revisionsAnnoncees: 9,
        lectureInachevee: false,
      },
      [pour(IBAN_TEMOIN)]
    );
    expect(v.code).toBe(2);
    expect(v.fautes.map((f) => f.famille)).not.toContain('exemption_sans_objet');
  });

  it('REQ-GOV-031 — le registre RÉEL du dépôt est bien formé, et il n’est pas vide', () => {
    // TÉMOIN POSITIF sur le réel : un registre VIDE passerait la première assertion sans rien
    // prouver — zéro ligne contrôlée se lit exactement comme zéro ligne fautive.
    const reelles = exemptionsDuDepot();
    expect(
      reelles.length,
      'le registre est vide : le contrôle ci-dessous ne mesure rien'
    ).toBeGreaterThan(0);
    expect(controlerRegistreExemptions(reelles)).toEqual([]);
    for (const e of reelles) {
      // L'historique d'édition est immuable : aucune de ces lignes ne se referme. Le déclarer
      // évite qu'on les relise un jour comme des reports qu'on aurait oublié de solder.
      expect(e.definitive, `PR #${e.pr} / ${e.revision} doit être déclarée DÉFINITIVE`).toBe(true);
    }
    // ⚠️ Et le registre ne porte JAMAIS la valeur : c'est la faute même qu'il documente.
    const brut = readFileSync('config/exemptions-corps-publie.json', 'utf8');
    expect(coordonneesDe(brut, false)).toEqual([]);
  });

  it('REQ-GOV-031 — le numéro de PR se LIT dans l’événement GitHub, il ne se recopie pas', () => {
    // Sans cette lecture, l'étape de CI devrait recopier `github.event.pull_request.number` dans
    // une commande — une valeur de plus à tenir à deux endroits (RM-01), et un oubli qui rendrait
    // la garde muette au lieu de rouge.
    const dossier = mkdtempSync(join(tmpdir(), 'evt-'));
    const chemin = join(dossier, 'event.json');
    const avant = process.env.GITHUB_EVENT_PATH;
    try {
      writeFileSync(chemin, JSON.stringify({ pull_request: { number: 31 } }));
      process.env.GITHUB_EVENT_PATH = chemin;
      expect(numeroDePrDeLEvenement()).toBe('31');

      // CONTRE-TÉMOIN : un événement SANS PR ne fabrique pas de numéro. Rendre une valeur ici
      // ferait juger une PR au hasard, et un vert sur la mauvaise PR est pire qu'un refus.
      writeFileSync(chemin, JSON.stringify({ ref: 'refs/heads/main' }));
      expect(numeroDePrDeLEvenement()).toBeUndefined();

      writeFileSync(chemin, 'ceci n’est pas du JSON');
      expect(numeroDePrDeLEvenement()).toBeUndefined();

      process.env.GITHUB_EVENT_PATH = join(dossier, 'absent.json');
      expect(numeroDePrDeLEvenement()).toBeUndefined();
    } finally {
      if (avant === undefined) delete process.env.GITHUB_EVENT_PATH;
      else process.env.GITHUB_EVENT_PATH = avant;
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

/**
 * ── `userContentEdits(first: 100)` — UNE GATE INSATISFIABLE EN GERME ──────────────────────────
 *
 * 🔴 CE QUE LA LENTILLE `securite` A MESURÉ le 2026-09-05, et elle apporte le contre-exemple
 * d'une thèse que j'avais écrite dans ce dépôt : « il n'existe aucun état durable légitime où la
 * CI d'un dépôt public ne peut pas lire le corps de ses propres PR ». C'est faux, et voici l'état
 * en question. La requête demandait les CENT PREMIÈRES éditions, alors que `totalCount` les compte
 * TOUTES. Au-delà de cent, `revisionsAnnoncees > revisionsLues` déclenche `revisions_non_lues`,
 * donc le code 2, donc l'échec de Gate A — **et il n'y a aucun remède** :
 *
 *   — aucune exemption ne couvre cette famille : l'appariement exige une coordonnée DANS une
 *     révision, et `revisions_non_lues` ne nomme aucune coordonnée ;
 *   — on ne dé-édite pas un corps de PR : l'historique d'édition est immuable ;
 *   — le réessai ×3 ne protège de rien : la réponse est STABLE et incomplète, pas intermittente.
 *     Trois lectures identiques d'une réponse tronquée donnent trois fois la même troncature.
 *
 * ET CENT EST À PORTÉE, ce n'est pas une hypothèse de tableau : la PR #31 porte déjà plus d'une
 * douzaine de révisions en une seule journée, parce que le corps est REGÉNÉRÉ à chaque tour de
 * revue. Le mécanisme qui produit les révisions est le mécanisme même de la revue.
 *
 * 🔑 CE QUE LA PAGINATION CHANGE, ET C'EST LE POINT : elle ne transforme pas un rouge en vert,
 * elle transforme un verdict SANS REMÈDE en verdict AVEC REMÈDE. Une coordonnée en page 2 rendait
 * 2 (« je n'ai pas tout lu », rien à faire) ; elle rend maintenant 1, elle est NOMMÉE, datée, et
 * elle peut être changée ou déclarée. C'est exactement la différence entre une gate qu'on répare
 * et une gate qu'on apprend à sauter.
 *
 * LA BORNE DURE RESTE NÉCESSAIRE, ET ON DIT LAQUELLE. `PAGES_MAX` pages de `EDITIONS_PAR_PAGE`.
 * Une boucle non bornée contre une API distante ne rend jamais la main quand la forge renvoie un
 * curseur qui n'avance pas — et une CI qui tourne sans fin est indiscernable d'une CI en panne,
 * sauf qu'elle coûte un créneau de fusion. La borne est haute (deux mille révisions, deux ordres
 * de grandeur au-dessus de ce qu'une PR atteint), et surtout elle est REMÉDIABLE : le message la
 * nomme, nomme son fichier, et dit qu'on la relève. Une borne muette serait le défaut qu'on vient
 * de fermer, réintroduit un cran plus bas.
 */
describe('REQ-GOV-031 — la pagination des révisions : lire CENT n’est pas lire TOUT', () => {
  const PR = 4242;

  /** Un horodatage DISTINCT par édition : deux entrées au même instant ne se distinguent plus. */
  const horodatage = (n: number): string =>
    `2026-01-02T03:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}Z`;

  /**
   * UNE FORGE DE PAPIER — elle sert ses révisions par pages, comme GitHub, et elle COMPTE ses
   * appels. Sans ce compteur, « la pagination a marché » et « la première page contenait déjà
   * tout » se lisent exactement pareil : un témoin positif de la sonde, pas seulement du résultat.
   *
   * 🔴 CE QU'ELLE NE SAVAIT PAS FAIRE, et qui a laissé passer un mutant sérieux le 2026-09-05 :
   * elle servait un `totalCount` CONSTANT. Relire ce compte à CHAQUE page au lieu de le prendre
   * une fois donnait alors exactement le même résultat — 536/536 vert, les deux `--prove` à 0 —
   * alors que la mutation supprime la SEULE chose qui transforme une lecture partielle en code 2.
   *
   * 🔑 Une fixture qui ne fait pas varier une dimension ne prouve rien de cette dimension (RM-11).
   * Ce que la forge annonce est donc désormais un PARAMÈTRE, sans valeur par défaut — « annonce
   * stable » et « annonce décroissante » sont deux fixtures, pas une omission — et ce qu'elle
   * SERT est distinct de ce qu'elle ANNONCE, parce que c'est précisément l'écart qui se juge.
   */
  type ForgeDePapier = {
    textes: string[];
    /** Ce que la forge PRÉTEND avoir, vu depuis la page qui commence à `debut`. */
    annonce: (debut: number, total: number) => number;
    /** Ce qu'elle SERT réellement : au-delà, elle dit « plus rien », même si elle annonce plus. */
    servies: number;
  };
  /** Le compte de la CONNEXION, celui que GitHub sert : le même à chaque page. */
  const ANNONCE_STABLE = (_debut: number, total: number): number => total;
  /** Un compte qui RÉTRÉCIT à mesure qu'on avance — la forme qui discrimine « lu une fois ». */
  const ANNONCE_DECROISSANTE = (debut: number, total: number): number => total - debut;

  function forgeDePapier(o: ForgeDePapier) {
    const appels: (string | null)[] = [];
    const lirePage = (apres: string | null): PageDEditions => {
      appels.push(apres);
      const debut = apres === null ? 0 : Number(apres);
      const tranche = o.textes.slice(debut, Math.min(debut + EDITIONS_PAR_PAGE, o.servies));
      const suivant = debut + tranche.length;
      const reste = suivant < o.servies;
      return {
        totalCount: o.annonce(debut, o.textes.length),
        noeuds: tranche.map((texte, i) => ({ editedAt: horodatage(debut + i), diff: texte })),
        encore: reste,
        curseur: reste ? String(suivant) : null,
      };
    };
    return { lirePage, appels };
  }

  /** Le rang de la révision fautive — au-delà de la PREMIÈRE page, c'est tout l'objet du cas. */
  const RANG_FAUTIF = EDITIONS_PAR_PAGE + 20;
  const TOTAL = EDITIONS_PAR_PAGE + 50;
  const textes = Array.from({ length: TOTAL }, (_, i) =>
    i === RANG_FAUTIF
      ? `-IBAN débiteur : ${IBAN_TEMOIN}\n+IBAN débiteur : masqué`
      : `révision ${i} — rien à signaler`
  );

  it('REQ-GOV-031 — une coordonnée en PAGE 2 : lue, elle rend 1 et se NOMME ; non lue, elle rend 2 sans remède', () => {
    // DEUX forges, une par colonne : un compteur d'appels partage entre les deux mesurerait la
    // somme des deux lectures, et non ce que la pagination a demande.
    const troncature = forgeDePapier({ textes, annonce: ANNONCE_STABLE, servies: TOTAL });
    const { lirePage, appels } = forgeDePapier({ textes, annonce: ANNONCE_STABLE, servies: TOTAL });

    // ── LA COLONNE « AVANT » : UNE SEULE PAGE, ce que la requête demandait. ──────────────────
    const uneSeulePage = troncature.lirePage(null);
    const tronquee = assemblerLecture(String(PR), 'corps courant propre', {
      annoncees: uneSeulePage.totalCount,
      noeuds: uneSeulePage.noeuds,
      // La forge n'a pas été interrompue : c'est l'appelant qui n'a demandé qu'une page.
      // L'écart annoncé/lu est donc la seule cause en jeu, et c'est celle qu'on mesure.
      inacheve: false,
    });
    const avant = jugerCorpsPublie(tronquee);
    expect(avant.code).toBe(2);
    expect(avant.fautes.map((f) => f.famille)).toEqual(['revisions_non_lues']);
    // ET C'EST UN 2 SANS REMÈDE : la coordonnée n'est même pas nommée, donc rien à changer ni à
    // déclarer. Aucune exemption ne peut s'apparier à une famille qui ne porte aucune empreinte.
    expect(avant.fautes.some((f) => f.message.includes(IBAN_TEMOIN))).toBe(false);

    // ── LA COLONNE « APRÈS » : TOUTES les pages. ────────────────────────────────────────────
    const complet = paginerEditions(lirePage);
    expect(complet.annoncees).toBe(TOTAL);
    expect(complet.noeuds.length).toBe(TOTAL);
    expect(complet.inacheve).toBe(false);
    // TÉMOIN POSITIF DE LA SONDE : il a FALLU plusieurs appels, et le second a porté un curseur.
    // Sans cette assertion, une forge qui rendrait tout en une page verdirait ce cas sans que
    // rien de ce qu'on prétend mesurer n'ait été exercé.
    expect(appels).toEqual([null, String(EDITIONS_PAR_PAGE)]);

    const apres = jugerCorpsPublie(assemblerLecture(String(PR), 'corps courant propre', complet));
    expect(apres.code).toBe(1);
    expect(apres.fautes.map((f) => f.famille)).toEqual(['coordonnee_dans_une_revision']);
    // NOMMÉE ET DATÉE : c'est ce qui rend le verdict remédiable — on change la valeur, ou on la
    // déclare avec ces trois clés-là.
    expect(apres.fautes[0]!.message).toContain(IBAN_TEMOIN);
    expect(apres.fautes[0]!.message).toContain(horodatage(RANG_FAUTIF));
    expect(apres.fautes[0]!.message).toContain(empreinteDe(IBAN_TEMOIN));
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : une PR d’une seule page ne déclenche pas d’appel de plus', () => {
    // Sans lui, `paginerEditions` pourrait redemander éternellement une page vide : la garde
    // deviendrait lente et bavarde sur le cas ordinaire, donc on la retirerait.
    const { lirePage, appels } = forgeDePapier({
      textes: ['une seule révision, propre'],
      annonce: ANNONCE_STABLE,
      servies: 1,
    });
    const r = paginerEditions(lirePage);
    expect(appels).toEqual([null]);
    expect(r.pages).toBe(1);
    expect(r.inacheve).toBe(false);
    expect(jugerCorpsPublie(assemblerLecture(String(PR), 'rien à signaler', r)).code).toBe(0);
  });

  it('REQ-GOV-031 — le compte annoncé est celui de la PREMIÈRE page : il se prend UNE fois', () => {
    // 🔴 LE MUTANT SÉRIEUX DU 2026-09-05 : relire `totalCount` à CHAQUE page. 536/536 vert, les
    // deux `--prove` à 0 — parce que les trois forges de papier du dépôt servaient toutes un
    // compte CONSTANT, incapables par construction de distinguer « lu une fois » de « relu ».
    //
    // 🔑 `totalCount` est celui de la CONNEXION, pas de la page. Le relire fait dépendre l'écart
    // annoncé/lu de la DERNIÈRE réponse — c'est-à-dire de la partie qu'on a justement fini de
    // lire, donc l'écart s'annule tout seul. C'est le contrôle qui se supprime lui-même.
    const { lirePage } = forgeDePapier({
      textes,
      annonce: ANNONCE_DECROISSANTE,
      servies: TOTAL,
    });
    const r = paginerEditions(lirePage);
    expect(r.annoncees).toBe(TOTAL);
    // ET LA MOITIÉ QUI DISCRIMINE : la dernière page en annonçait un AUTRE. Sans cette assertion,
    // le cas passerait sur une forge dont toutes les pages annoncent la même chose.
    expect(ANNONCE_DECROISSANTE(EDITIONS_PAR_PAGE, TOTAL)).not.toBe(TOTAL);
    expect(r.annoncees).not.toBe(ANNONCE_DECROISSANTE(EDITIONS_PAR_PAGE, TOTAL));
  });

  it('REQ-GOV-031 — une forge qui SERT moins qu’elle n’ANNONCE rend 2, et l’IBAN non lu reste ignoré', () => {
    // LE CAS RÉEL DERRIÈRE LE MUTANT, joué au niveau du VERDICT. La forge annonce 250 éditions,
    // n'en sert que 150, et son compte rétrécit à mesure qu'on avance. La coordonnée vit dans la
    // part JAMAIS SERVIE : la garde ne peut pas la voir, et c'est exactement pourquoi elle doit
    // refuser de conclure. `inacheve` est FAUX ici — la forge a dit « plus rien », elle n'a pas
    // été interrompue —, donc l'écart annoncé/lu est la SEULE chose qui reste. C'est lui que le
    // mutant supprimait.
    const ANNONCEES = 250;
    const SERVIES = 150;
    const RANG_FAUTIF_NON_SERVI = 200;
    const beaucoup = Array.from({ length: ANNONCEES }, (_, i) =>
      i === RANG_FAUTIF_NON_SERVI ? `IBAN : ${IBAN_TEMOIN}` : `révision ${i}`
    );
    const { lirePage } = forgeDePapier({
      textes: beaucoup,
      annonce: ANNONCE_DECROISSANTE,
      servies: SERVIES,
    });
    const r = paginerEditions(lirePage);
    expect(r.noeuds).toHaveLength(SERVIES);
    expect(r.inacheve, 'la forge a dit « plus rien » : la lecture n’a PAS été interrompue').toBe(
      false
    );
    expect(r.annoncees).toBe(ANNONCEES);

    const v = jugerCorpsPublie(assemblerLecture(String(PR), 'propre', r));
    expect(v.code).toBe(2);
    expect(v.fautes.map((f) => f.famille)).toEqual(['revisions_non_lues']);
    // TÉMOIN POSITIF de ce que le cas met en jeu : la coordonnée n'a JAMAIS été servie, donc
    // aucune faute ne la nomme. Un vert ici voudrait dire « rien à signaler » sur un texte que
    // personne n'a lu — et c'est le défaut que toute cette garde existe pour empêcher.
    expect(v.fautes.some((f) => f.message.includes(IBAN_TEMOIN))).toBe(false);
    expect(beaucoup[RANG_FAUTIF_NON_SERVI]).toContain(IBAN_TEMOIN);
  });

  it('REQ-GOV-031 — `inacheve` est CONSOMMÉ par le verdict, pas seulement retourné', () => {
    // 🔴 CE QUE LA LENTILLE A NOMMÉ, et qui vaut plus que le mutant : `inacheve` était calculé,
    // retourné, asserté par TROIS témoins — et jamais lu par `jugerCorpsPublie`. Une valeur
    // calculée, assertée et jamais consommée est un contrôle qui existe pour le lecteur et pas
    // pour la machine. L'écart annoncé/lu portait donc SEUL toute la propriété.
    //
    // 🔑 ET LES DEUX NE SONT PAS REDONDANTS, c'est ce qui décide. L'écart annoncé/lu dépend d'un
    // nombre que la FORGE contrôle ; `inacheve` est notre PROPRE observation, tirée de notre
    // propre flot — la borne atteinte, ou un curseur qui n'avance pas. Faire reposer une
    // propriété de sécurité sur la seule honnêteté du serveur distant, quand on dispose de sa
    // propre mesure, est un choix qu'on ne peut pas défendre.
    const complete = assemblerLecture(String(PR), 'propre', {
      annoncees: 2,
      noeuds: [
        { editedAt: horodatage(1), diff: 'propre' },
        { editedAt: horodatage(2), diff: 'propre' },
      ],
      inacheve: false,
    });
    // CONTRE-TÉMOIN D'ABORD : sans écart et sans interruption, c'est VERT. Sinon ce qui suit
    // passerait sur une garde qui rougit toujours, et une garde toujours rouge finit désarmée.
    expect(jugerCorpsPublie(complete).code).toBe(0);

    // LA MÊME LECTURE, au même compte — seul `inacheve` change. Aucun écart annoncé/lu ne peut
    // donc l'expliquer : c'est bien lui qui est jugé (RM-11).
    const interrompue = assemblerLecture(String(PR), 'propre', {
      annoncees: 2,
      noeuds: [
        { editedAt: horodatage(1), diff: 'propre' },
        { editedAt: horodatage(2), diff: 'propre' },
      ],
      inacheve: true,
    });
    expect(interrompue.lu && interrompue.revisionsAnnoncees).toBe(2);
    expect(interrompue.lu && interrompue.revisionsLues).toBe(2);
    const v = jugerCorpsPublie(interrompue);
    expect(v.code).toBe(2);
    expect(v.fautes.map((f) => f.famille)).toEqual(['revisions_non_lues']);
    expect(v.fautes[0]!.message).toContain('PAGES_MAX');
  });

  it('REQ-GOV-031 — LA BORNE DURE : elle s’arrête, et son message NOMME le remède', () => {
    // Une forge qui annonce toujours une suite — un dépôt pathologique, ou un champ renommé.
    let rang = 0;
    const sansFin = (): PageDEditions => {
      rang += EDITIONS_PAR_PAGE;
      return {
        totalCount: Number.MAX_SAFE_INTEGER,
        noeuds: Array.from({ length: EDITIONS_PAR_PAGE }, (_, i) => ({
          editedAt: horodatage(rang + i),
          diff: 'propre',
        })),
        encore: true,
        curseur: String(rang),
      };
    };
    const r = paginerEditions(sansFin);
    expect(r.pages).toBe(PAGES_MAX);
    expect(r.inacheve).toBe(true);
    expect(r.noeuds.length).toBe(PAGES_MAX * EDITIONS_PAR_PAGE);

    // ET LE VERDICT NOMME CE QU'IL FAUT FAIRE. Une borne muette serait le défaut qu'on vient de
    // fermer, réintroduit un cran plus bas : un 2 dont personne ne sait quoi faire se désarme.
    const v = jugerCorpsPublie(assemblerLecture(String(PR), 'propre', r));
    expect(v.code).toBe(2);
    expect([...new Set(v.fautes.map((f) => f.famille))]).toEqual(['revisions_non_lues']);
    // DEUX CAUSES, ET C'EST VOULU. Notre propre flot dit qu'il s'est arrêté, ET le compte annoncé
    // dépasse le compte lu. Elles ne sont PAS redondantes : la seconde dépend d'un nombre que la
    // forge contrôle, la première n'en dépend pas. Le verdict les rend toutes les deux — sans
    // quoi retirer l'une passerait inaperçu tant que l'autre subsiste, ce qui est exactement le
    // mutant qui a survécu au tour précédent.
    expect(v.fautes).toHaveLength(2);
    const arret = v.fautes.find(
      (f) => f.message.includes('ARR') && f.message.includes('avant la fin')
    );
    const ecart = v.fautes.find((f) => f.message.includes('La forge annonce'));
    expect(arret, 'la cause tirée de notre propre flot').toBeDefined();
    expect(ecart, 'la cause tirée du compte servi par la forge').toBeDefined();
    for (const f of v.fautes) {
      expect(f.message).toContain('PAGES_MAX');
      expect(f.message).toContain('scripts/gates/gov-entite.ts');
      expect(f.message).toContain(String(PAGES_MAX * EDITIONS_PAR_PAGE));
    }
  });

  it('REQ-GOV-031 — un curseur qui N’AVANCE PAS rend la main : une CI sans fin n’est pas un verdict', () => {
    // LE CAS QU'AUCUNE BORNE EN NOMBRE DE RÉVISIONS N'ATTRAPERAIT : la forge annonce une suite et
    // sert le MÊME curseur. Sans cette garde, on relit la même page indéfiniment. Ce cas ne peut
    // pas « rougir » au sens habituel — une boucle infinie ne rend aucune couleur, elle prend le
    // créneau et on finit par tuer le job. Le témoin est donc qu'il TERMINE, et qu'il le DIT.
    const fige = (): PageDEditions => ({
      totalCount: 400,
      noeuds: [{ editedAt: horodatage(1), diff: 'propre' }],
      encore: true,
      curseur: 'CURSEUR-QUI-NE-BOUGE-PAS',
    });
    const r = paginerEditions(fige);
    expect(r.pages).toBe(2);
    expect(r.inacheve).toBe(true);
    expect(r.noeuds.length).toBe(2);
    expect(jugerCorpsPublie(assemblerLecture(String(PR), 'propre', r)).code).toBe(2);
  });

  it('REQ-GOV-031 — la REQUÊTE elle-même demande la page suivante, et ses tailles sont DÉRIVÉES', () => {
    // La lecture réelle passe par le réseau : aucun cas hors ligne ne peut l'exercer. Ce qui est
    // gardé ici, c'est que la requête envoyée PORTE la pagination — c'est le témoin qui rougit si
    // quelqu'un revient à `userContentEdits(first: 100)` sans curseur.
    expect(REQUETE_EDITIONS).toContain('pageInfo');
    expect(REQUETE_EDITIONS).toContain('hasNextPage');
    expect(REQUETE_EDITIONS).toContain('endCursor');
    expect(REQUETE_EDITIONS).toContain('after:$a');
    // La taille de page n'est pas retapée dans la requête (RM-01) : elle vient de la constante,
    // sans quoi les deux divergeraient et la boucle compterait autre chose que ce qu'elle demande.
    expect(REQUETE_EDITIONS).toContain(`first:${EDITIONS_PAR_PAGE}`);
  });

  it('REQ-GOV-031 — `gov:entite:corps:prove` porte ces témoins-là AUSSI, et les chiffre', () => {
    // Un témoin qui ne tient que `pnpm test` ne garde pas la CI : l'étape de Gate A, c'est
    // `gov:entite:corps:prove`.
    const { code, sortie } = lancer('--corps-publie', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`${EDITIONS_PAR_PAGE} par page`);
    expect(sortie).toContain(`${PAGES_MAX} page(s) au plus`);
  });
});

/**
 * ── LE SENS DE DÉFAILLANCE DE LA LECTURE — CE QUE LA GARDE CHOISIT, ET QUE RIEN NE DÉFENDAIT ──
 *
 * 🔴 CE QUE LA LENTILLE `mutation` A MESURÉ le 2026-09-05, et c'est le mutant qui interdisait la
 * fusion à lui seul. Mutation : en cas d'échec, `lireCorpsPublie` rend `{ lu: true, corps: [] }`
 * au lieu de `{ lu: false, motif }`. Résultat — **93/93 vert, `--corps-publie --prove` exit 0**,
 * et le mode en ligne imprime sur une PR ILLISIBLE :
 *
 *     ✅ gov:entite --corps-publie 999999 — le corps PUBLIÉ et son historique d'édition
 *        ne portent aucune coordonnée bancaire NON DÉCLARÉE                        exit 0
 *
 * Sur la base intacte, la même commande rend 2 et `[lecture_impossible]`. **La garde discrimine ;
 * rien ne défendait qu'elle discrimine.**
 *
 * 🔑 LA FORME EXACTE DU TROU, ET ELLE SE GÉNÉRALISE : `jugerCorpsPublie` est pur et couvert par
 * une trentaine de cas ; `lireCorpsPublie` est le SEUL endroit où le sens de défaillance est
 * CHOISI, et il n'était exercé par aucun cas — le seul cas du mode en ligne sortait en 2 AVANT de
 * l'appeler. Un module bien couvert peut abriter la fonction qui décide de tout, non couverte :
 * la couverture du pur ne dit rien de l'impur qui l'alimente.
 *
 * CE QUI LE FERME : `lireUneFois` et `lireCorpsPublie` prennent leur `gh` en PARAMÈTRE. La preuve
 * tient alors hors ligne, comme celle de `jugerCorpsPublie` et de `paginerEditions` — sans quoi
 * elle dépendrait de ce que la forge répond le jour où elle tourne.
 */
describe('REQ-GOV-031 — la LECTURE, et le sens dans lequel elle échoue', () => {
  const PR = '4242';
  const DEPOT = 'exemple/depot-de-papier';

  /**
   * UN `gh` DE PAPIER. Il répond aux trois appels de la lecture réelle et peut TOMBER sur celui
   * qu'on désigne. AUCUN champ n'a de valeur par défaut (RM-11) : « présent » et « absent » sont
   * deux fixtures, pas une omission — un défaut ici transformerait l'absence en présence, et le
   * cas passerait sur un code qui ne lit jamais le champ.
   */
  type GhDePapier = {
    corps: unknown;
    depot: unknown;
    editions: NoeudEdition[];
    total: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | undefined;
    tombeSur: 'pr' | 'repo' | 'graphql' | null;
  };
  function ghDePapier(o: GhDePapier): ExecuteurGh {
    return (args: string[]): string => {
      const quoi = args[0] === 'pr' ? 'pr' : args[0] === 'repo' ? 'repo' : 'graphql';
      if (o.tombeSur === quoi) throw new Error(`gh ${quoi} : panne de papier`);
      if (quoi === 'pr') return JSON.stringify({ body: o.corps });
      if (quoi === 'repo') return JSON.stringify({ nameWithOwner: o.depot });
      return JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              userContentEdits: { totalCount: o.total, pageInfo: o.pageInfo, nodes: o.editions },
            },
          },
        },
      });
    };
  }
  const SAIN: GhDePapier = {
    corps: 'un corps de PR parfaitement propre',
    depot: DEPOT,
    editions: [{ editedAt: '2026-01-02T03:04:05Z', diff: 'une révision propre' }],
    total: 1,
    pageInfo: { hasNextPage: false, endCursor: null },
    tombeSur: null,
  };

  it('REQ-GOV-031 — CONTRE-TÉMOIN : un `gh` qui répond correctement rend `lu: true` et COMPTE', () => {
    // LE TÉMOIN POSITIF, ET IL VIENT D'ABORD. Sans lui, les cas ci-dessous passeraient tous sur
    // un `lireUneFois` qui rendrait TOUJOURS `{ lu: false }` — c'est-à-dire sur une lecture qui
    // ne lit jamais rien. Dix « je n'ai pas pu » ne prouvent pas qu'on sache lire une fois.
    const lecture = lireUneFois(PR, ghDePapier(SAIN));
    expect(lecture.lu).toBe(true);
    if (!lecture.lu) throw new Error('inatteignable');
    expect(lecture.pr).toBe(Number(PR));
    expect(lecture.revisionsLues).toBe(1);
    expect(lecture.revisionsAnnoncees).toBe(1);
    expect(lecture.corps.filter((c) => !c.revision)).toHaveLength(1);
    expect(jugerCorpsPublie(lecture).code).toBe(0);
  });

  it.each([
    ['`gh pr view` tombe', { ...SAIN, tombeSur: 'pr' as const }, 'gh pr view'],
    ['`gh repo view` tombe', { ...SAIN, tombeSur: 'repo' as const }, 'gh repo view'],
    ['la requête GraphQL tombe', { ...SAIN, tombeSur: 'graphql' as const }, 'userContentEdits'],
    ['le corps n’est pas textuel', { ...SAIN, corps: undefined }, 'body'],
    ['le corps est un NOMBRE', { ...SAIN, corps: 12 }, 'body'],
    ['le dépôt n’est pas textuel', { ...SAIN, depot: undefined }, 'illisible'],
    ['le dépôt n’a pas de barre', { ...SAIN, depot: 'sans-barre' }, 'illisible'],
    [
      '`userContentEdits` manque',
      { ...SAIN, total: undefined as unknown as number },
      'userContentEdits',
    ],
  ])(
    'REQ-GOV-031 — %s : la lecture rend `lu: false`, JAMAIS un corps vide qui passerait pour propre',
    (_quoi: string, o: GhDePapier, motif: string) => {
      const lecture = lireUneFois(PR, ghDePapier(o));
      // LE MUTANT QUE CE CAS TUE : `{ lu: true, corps: [] }`. Il rendrait la garde VERTE sur une
      // PR qu'elle n'a pas pu lire — exactement le défaut qu'elle existe pour empêcher, promu
      // d'un cran, là où plus personne ne le regarde.
      expect(lecture.lu).toBe(false);
      if (lecture.lu) throw new Error('inatteignable');
      expect(lecture.motif).toContain(motif);
      // ET LE VERDICT QUI EN DÉCOULE EST 2, JAMAIS 0. C'est la moitié qui compte pour la CI.
      expect(jugerCorpsPublie(lecture).code).toBe(2);
      expect(jugerCorpsPublie(lecture).fautes.map((f) => f.famille)).toEqual([
        'lecture_impossible',
      ]);
    }
  );

  it('REQ-GOV-031 — `pageInfo` ABSENT n’est pas « il n’y a plus rien » : c’est un champ non lu', () => {
    // Le jour où la forge renomme un champ de `pageInfo`, une lecture qui conclurait « pas de
    // page suivante » réputerait propres toutes les révisions qu'elle n'a pas demandées.
    const lecture = lireUneFois(PR, ghDePapier({ ...SAIN, pageInfo: undefined, total: 300 }));
    expect(lecture.lu).toBe(true);
    if (!lecture.lu) throw new Error('inatteignable');
    expect(lecture.revisionsAnnoncees).toBeGreaterThan(lecture.revisionsLues);
    expect(jugerCorpsPublie(lecture).code).toBe(2);
  });

  it('REQ-GOV-031 — le réessai transforme une INTERMITTENCE en latence, jamais en couleur', () => {
    // Sans réessai, un incident réseau d'une seconde rendrait rouge une PR qui n'a rien fait, et
    // une garde capricieuse se fait retirer. Le témoin POSITIF du réessai : deux échecs, puis
    // une réponse — la lecture aboutit, et l'on compte les tentatives.
    let tentatives = 0;
    const capricieux: ExecuteurGh = (args) => {
      if (args[0] === 'pr') {
        tentatives += 1;
        if (tentatives < 3) throw new Error('réseau injoignable (témoin)');
      }
      return ghDePapier(SAIN)(args);
    };
    const lecture = lireCorpsPublie(PR, 3, capricieux);
    expect(lecture.lu).toBe(true);
    expect(tentatives).toBe(3);
  });

  it('REQ-GOV-031 — une panne STABLE reste `lu: false` après tous les essais, et le DIT', () => {
    // La distinction que le réessai ne doit PAS effacer : une réponse stable et incomplète n'est
    // pas une intermittence. Trois lectures d'une panne donnent trois fois la même panne.
    let appels = 0;
    const enPanne: ExecuteurGh = (args) => {
      appels += 1;
      return ghDePapier({ ...SAIN, tombeSur: 'pr' })(args);
    };
    const lecture = lireCorpsPublie(PR, 3, enPanne);
    expect(lecture.lu).toBe(false);
    if (lecture.lu) throw new Error('inatteignable');
    expect(lecture.motif).toContain('3 tentative(s)');
    expect(appels).toBe(3);
    expect(jugerCorpsPublie(lecture).code).toBe(2);
  });

  it('REQ-GOV-031 — `gov:entite:corps:prove` porte le sens de défaillance AUSSI, et le DIT', () => {
    // Un témoin qui ne tient que `pnpm test` ne garde pas la CI : le mutant est mort ici, il doit
    // mourir AUSSI dans l'étape de Gate A. C'est le fait d'instrument du tour six — un mutant peut
    // mourir dans `pnpm test` et survivre dans `--prove`.
    const { code, sortie } = lancer('--corps-publie', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('La LECTURE elle-même est éprouvée');
  });
});

/**
 * ── `ibanAvecSeparateur` — UNE SUBSTITUTION QUE RIEN N'EXERÇAIT, DANS LA FAMILLE QU'ON FERME ──
 *
 * 🔴 CE QUE LA LENTILLE `exactitude` A MESURÉ le 2026-09-05 : la fonction portait
 * `iban.replace(/s/g, '')` — **la lettre `s`**, pas les blancs ; l'antislash manquait. Sa
 * docstring, juste au-dessus, annonçait « la forme exacte d'un RIB collé depuis un relevé ».
 *
 *     'FR14 2004 1010 0505 0001 3M02 606'.replace(/s/g, '')  ->  inchangé, les espaces restent
 *     'es9121000418450200051332'.replace(/s/g, '')           ->  'e9121…', une lettre mangée
 *
 * 🔑 ET LA QUESTION VENAIT AVANT « comment normaliser » : **aucun appelant ne lui passe une entrée
 * espacée.** La substitution n'avait aucun témoin parce qu'elle n'avait aucun usage — un bout de
 * code écrit pour un cas qui n'arrive pas, et qui aurait tronqué un IBAN espagnol ou suisse écrit
 * en minuscules le jour où il serait arrivé. La réponse n'est donc pas de réparer la regex, c'est
 * de retirer la réparation : **une fonction qui « complète » une fixture VÉRIFIE, elle ne fabrique
 * pas** (RM-03). Elle refuse ce qu'elle ne sait pas grouper.
 */
describe('REQ-GOV-031 — `ibanAvecSeparateur` vérifie son entrée au lieu de la réparer', () => {
  it('REQ-GOV-031 — une entrée DÉJÀ espacée est REFUSÉE, et le refus NOMME la forme attendue', () => {
    const espace = ibanAvecSeparateur(IBAN_TEMOIN, ' ');
    // TÉMOIN POSITIF de la fixture elle-même : elle produit bien une forme espacée. Sans lui, le
    // refus ci-dessous porterait peut-être sur une chaîne qui n'a jamais eu d'espace.
    expect(espace).toContain(' ');
    expect(espace).not.toBe(IBAN_TEMOIN);
    expect(() => ibanAvecSeparateur(espace, ' ')).toThrow(/COMPACT/);
  });

  it('REQ-GOV-031 — un `s` minuscule SURVIT : c’était la lettre que `/s/g` mangeait', () => {
    const es = IBANS_TEMOINS_ETRANGERS.ES!;
    // TÉMOIN POSITIF : le cas est RÉEL, pas une complétude de principe — un IBAN espagnol écrit
    // en minuscules porte un `s`, et REQ-CPL-004 exige une résidence fiscale, pas un compte
    // français. C'est exactement l'IBAN qu'un apporteur collera.
    expect(es.toLowerCase()).toContain('s');
    const groupe = ibanAvecSeparateur(es.toLowerCase(), ' ');
    expect(groupe.split(' ').join('')).toBe(es.toLowerCase());
    expect(groupe.split(' ')[0]).toHaveLength(4);
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : la forme compacte se groupe toujours par quatre', () => {
    // Sans lui, la vérification pourrait tout refuser : une fonction qui refuse toujours passe
    // les deux cas ci-dessus et ne sert plus aucune fixture.
    for (const [pays, iban] of Object.entries(IBANS_TEMOINS_ETRANGERS)) {
      const groupe = ibanAvecSeparateur(iban, ' ');
      expect(groupe.split(' ').join(''), pays).toBe(iban);
      expect(groupe.split(' ')[0], pays).toHaveLength(4);
    }
  });
});

/**
 * ── L'ÉTAPE DE CI QUE CETTE TÂCHE LIVRE DOIT RESTER BLOQUANTE ─────────────────────────────────
 *
 * 🔴 QUATRIÈME MUTANT DU 2026-09-05 : ajouter `continue-on-error: true` à l'étape
 * `gov:entite:corps` de `ci.yml`. **130/130 vert.** Une ligne désarme tout ce que cette tâche
 * défend, et rien ne la voit. Le dépôt voisin en donne la version longue : toutes ses gates de
 * budget portent ce drapeau, aucune PR qui alourdit le bundle n'a jamais rougi, et pendant des
 * mois les revues ont écrit « le risque est couvert par la gate ».
 *
 * ⚠️ PÉRIMÈTRE : CE TÉMOIN EST ÉTROIT, ET C'EST DÉLIBÉRÉ. La dette `G-SEC-CI-BLOQUANTE` est
 * déclarée au registre des gardes avec le nom de la spec qui la soldera —
 * `tests/unit/ci/aucune-gate-en-continue-on-error.spec.ts`, qui n'existe pas — et elle appartient
 * à **QA-T01, phase 0**. Ce cas-ci ne juge QUE le job `gate-a`, celui qui porte l'étape livrée par
 * `CPL-T01`. Il ne balaie ni les autres workflows ni les autres jobs : absorber le périmètre d'une
 * tâche voisine au passage est un défaut que ce dépôt a déjà nommé. Ce qui est corrigé ici, c'est
 * seulement l'ORDRE — cette PR introduit la première étape bloquante du dépôt, et sa protection
 * était planifiée pour la phase d'après.
 */
describe('REQ-GOV-031 — aucune étape de `gate-a` ne se désarme par `continue-on-error`', () => {
  const CI = readFileSync('.github/workflows/ci.yml', 'utf8');

  /**
   * Les étapes du job `gate-a` qui portent `continue-on-error`. Elle LÈVE si le job est
   * introuvable : un témoin qui ne trouve plus ce qu'il juge rendrait `[]` — c'est-à-dire vert —
   * et un vert produit par une absence de lecture est le défaut que toute cette tâche combat.
   */
  function etapesEnContinueOnError(yaml: string): string[] {
    const lignes = yaml.split('\n');
    const debut = lignes.findIndex((l) => /^ {2}gate-a:\s*$/.test(l));
    if (debut < 0) {
      throw new Error(
        'le job `gate-a` est introuvable dans `.github/workflows/ci.yml` : ce témoin ne mesure ' +
          'plus rien. Renomme-le ici en même temps que là-bas.'
      );
    }
    let fin = lignes.length;
    for (let i = debut + 1; i < lignes.length; i += 1) {
      if (/^ {2}\S/.test(lignes[i]!)) {
        fin = i;
        break;
      }
    }
    const fautives: string[] = [];
    let nom = '(étape sans nom)';
    for (const l of lignes.slice(debut, fin)) {
      const m = /^\s*-?\s*name:\s*(.+?)\s*$/.exec(l);
      if (m !== null) nom = m[1]!;
      if (/^\s*continue-on-error\s*:/.test(l)) fautives.push(nom);
    }
    return fautives;
  }

  it('REQ-GOV-031 — le fichier RÉEL est sain : aucune étape de `gate-a` n’est désarmée', () => {
    expect(etapesEnContinueOnError(CI)).toEqual([]);
  });

  it('REQ-GOV-031 — et le témoin SAIT rougir : une seule ligne suffirait à tout désarmer', () => {
    // Sans cette moitié, le cas ci-dessus serait vrai d'un témoin qui ne regarde rien.
    const ETAPE = '        run: pnpm gov:entite:corps\n';
    expect(CI, 'l’étape que cette tâche livre a changé de forme dans `ci.yml`').toContain(ETAPE);
    const desarme = CI.replace(ETAPE, ETAPE + '        continue-on-error: true\n');
    expect(desarme).not.toBe(CI);
    expect(etapesEnContinueOnError(desarme)).toEqual([
      'Le corps PUBLIE de la PR ne porte aucune coordonnee',
    ]);
  });

  it('REQ-GOV-031 — TÉMOIN POSITIF : le job lu est bien celui qui porte l’étape de cette tâche', () => {
    // Deux zéros indiscernables, encore : « aucune étape désarmée » et « je lis le mauvais bloc »
    // rendent la même liste vide. On vérifie donc que le bloc extrait contient l'étape jugée.
    const lignes = CI.split('\n');
    const debut = lignes.findIndex((l) => /^ {2}gate-a:\s*$/.test(l));
    let fin = lignes.length;
    for (let i = debut + 1; i < lignes.length; i += 1) {
      if (/^ {2}\S/.test(lignes[i]!)) {
        fin = i;
        break;
      }
    }
    const bloc = lignes.slice(debut, fin).join('\n');
    expect(bloc).toContain('pnpm gov:entite:corps');
    expect(bloc).toContain('pnpm gov:entite:corps:prove');
  });
});

/**
 * ── UN COMPTEUR TAPÉ À LA MAIN SUR UNE RESSOURCE VIVANTE ──────────────────────────────────────
 *
 * 🔴 CE QUE LA LENTILLE `exactitude` A MESURÉ le 2026-09-05 : la garde et son banc d'essai
 * annonçaient un total d'éditions pour la PR #31 qui était FAUX le jour même de son écriture — la
 * garde en imprimait déjà un de plus, et elle en imprimera un de plus encore au prochain rendu du
 * corps. Dans les deux fichiers qui existent précisément pour empêcher qu'un compteur tapé survive
 * à ce qu'il décrit (RM-01).
 *
 * CE QUI A UN SENS, ET QUI EST STABLE : le nombre d'éditions PORTANT une coordonnée. Il ne se tape
 * pas non plus — il se compte dans `config/exemptions-corps-publie.json`, qui en est la source
 * unique. Le total, lui, n'a aucune source : il change à chaque tour de revue.
 *
 * ⚠️ CE QUE CETTE GARDE N'INTERDIT PAS, et c'est ce qui la rend tenable : elle vise la TOURNURE
 * — un nombre au pluriel qui qualifie « révisions » — jamais le mot. « Une révision », « les
 * révisions non lues », « aucune révision lue » restent écrivables : ce sont les phrases qui
 * PORTENT la règle, et une garde qui forcerait à les retirer serait retirée elle-même. Une ligne
 * qui doit CITER un compteur périmé — les témoins ci-dessous en citent trois — porte le marqueur
 * `TEMOIN-COMPTEUR`, qui est explicite, greppable, et qu'aucune ligne de prose n'écrit par accident.
 */
describe('REQ-GOV-031 — aucun total de révisions ne se tape à la main', () => {
  // 🔴 LE REGISTRE MANQUAIT À CETTE LISTE, et il annonçait un compte de révisions antérieures
  // qui était faux — la mesure en donne une de plus, et aucune d'elles ne portait le jeton que
  // la phrase leur prêtait. Un compteur tapé dans le fichier qui existe pour qu'on ne tape rien.
  // (Le compte lui-même n'est pas repris ici : ce serait le retaper une troisième fois.)
  const FICHIERS = [
    'scripts/gates/gov-entite.ts',
    'tests/unit/gouvernance/entite-registre.spec.ts',
    'config/exemptions-corps-publie.json',
  ];
  // La tournure visée, et rien de plus : un nombre AU PLURIEL qui qualifie « révisions ». Viser le
  // mot seul interdirait « une révision », qui est le vocabulaire même du registre — une garde
  // lexicale trop large finit par interdire la phrase qui protège, donc par être retirée.
  const COMPTEUR_TAPE =
    /\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|\d+)\s+r[ée]visions\b/i;

  /** Le marqueur qui autorise une ligne à CITER un compteur : explicite, et jamais accidentel. */
  const CITATION = ['TEMOIN', 'COMPTEUR'].join('-');

  it.each(FICHIERS)('REQ-GOV-031 — %s ne porte aucun total de révisions tapé', (chemin: string) => {
    const lignes = readFileSync(chemin, 'utf8').split('\n');
    const fautives = lignes
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => COMPTEUR_TAPE.test(l) && !l.includes(CITATION))
      .map(({ n, l }) => `${chemin}:${n} — ${l.trim()}`);
    expect(fautives).toEqual([]);
  });

  it('REQ-GOV-031 — TÉMOIN POSITIF : la garde LIT les deux fichiers, elle ne mesure pas le vide', () => {
    // Deux zéros indiscernables : « aucun compteur tapé » et « je n'ai rien lu » rendent la même
    // liste vide. On vérifie donc que chaque fichier est non vide et parle bien de révisions.
    for (const chemin of FICHIERS) {
      const contenu = readFileSync(chemin, 'utf8');
      expect(contenu.length, chemin).toBeGreaterThan(1000);
      expect(contenu, chemin).toContain('révision');
    }
  });

  it('REQ-GOV-031 — et le témoin SAIT rougir, sans interdire la négation ni le singulier', () => {
    // La forme qui a été mesurée périmée, et celle qui la remplacerait demain.
    expect(COMPTEUR_TAPE.test('Onze révisions. Quatre portent la forme masquée ;')).toBe(true); // TEMOIN-COMPTEUR
    expect(COMPTEUR_TAPE.test('la PR #31 porte donc, pour toujours, trois révisions')).toBe(true); // TEMOIN-COMPTEUR
    expect(COMPTEUR_TAPE.test('12 révisions servies')).toBe(true); // TEMOIN-COMPTEUR
    // CONTRE-TÉMOINS : le vocabulaire du registre reste écrivable. Une garde qui interdirait ces
    // phrases-là forcerait à les retirer, et ce sont elles qui portent la règle.
    expect(COMPTEUR_TAPE.test('une exemption couvre UNE révision d’UNE PR')).toBe(false);
    expect(COMPTEUR_TAPE.test('les révisions non lues ne sont pas réputées propres')).toBe(false);
    expect(COMPTEUR_TAPE.test('aucune révision lue ne porte cette coordonnée')).toBe(false);
    // ET LA FORME DÉRIVÉE PASSE : un compteur calculé n'est pas un compteur tapé.
    expect(COMPTEUR_TAPE.test('soit ${PAGES_MAX * EDITIONS_PAR_PAGE} révision(s).')).toBe(false);
  });

  it('REQ-GOV-031 — le nombre qui a un sens se COMPTE au registre, il ne se tape pas', () => {
    // Les révisions de la PR #31 qui portent une coordonnée sont exactement les lignes déclarées.
    // C'est la seule source, et elle est machine-lisible : personne n'a à l'écrire en prose.
    const declarees = exemptionsDuDepot().filter((e) => e.pr === 31);
    expect(declarees.length).toBeGreaterThan(0);
    expect(new Set(declarees.map((e) => e.revision)).size).toBe(declarees.length);
  });
});

/**
 * ── REQ-GOV-031 — CE QUE `gov:entite` REGARDE SE DÉRIVE DE LA SOURCE ─────────────────────────────
 *
 * Deux populations décident de ce que la garde voit : les codes pays qui ouvrent la forme d'IBAN,
 * et les fichiers qu'elle lit. Les témoins ci-dessous interrogent la SOURCE DANS LE TEST — l'ICU du runtime, git, des octets
 * écrits par leur vrai producteur — et portent sur ce que la garde CONSOMME.
 */
describe('REQ-GOV-031 — ce que `gov:entite` REGARDE se DÉRIVE, il ne se tape pas', () => {
  /** Les régions que l'ICU du runtime connaît, interrogée ICI — sans passer par `codesDeRegion`. */
  function regionsDeLIcu(): { noms: Intl.DisplayNames; regions: string[]; paires: string[] } {
    const noms = new Intl.DisplayNames(['fr'], { type: 'region' });
    const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const paires = [...lettres].flatMap((a) => [...lettres].map((b) => a + b));
    return { noms, paires, regions: paires.filter((code) => noms.of(code) !== code) };
  }

  /** Les codes dont un IBAN et un BIC synthétiques SONT VUS par la forme que la garde consomme. */
  function codesVusParLesFormes(codes: readonly string[]): { iban: string[]; bic: string[] } {
    const vus = { iban: [] as string[], bic: [] as string[] };
    for (const code of codes) {
      const iban = ibanSynthetique(code, '00112233445566');
      const bic = `ABCD${code}2A`;
      const trouvees = coordonneesDe(`Virement ${iban}.\nBIC: ${bic}\n`, false, 'docs/note.md');
      if (trouvees.includes(iban)) vus.iban.push(code);
      if (trouvees.includes(bic)) vus.bic.push(code);
    }
    return vus;
  }

  it('REQ-GOV-031 — les formes IBAN et BIC reconnaissent EXACTEMENT les régions de l’ICU, sur les 676 paires', () => {
    // L'oracle est le RUNTIME interrogé ici, et la mesure est ce que la garde VOIT : chaque région
    // fabrique un IBAN et un BIC reconnus, aucune autre paire.
    const { paires, regions } = regionsDeLIcu();
    // ⚠️ CONTRÔLE POSITIF : deux listes vides sont égales.
    expect(regions.length, 'ICU sans régions : la comparaison ne prouverait rien').toBeGreaterThan(
      200
    );
    const vus = codesVusParLesFormes(paires);
    expect(vus.iban, 'la forme IBAN ne reconnaît pas exactement les régions de l’ICU').toEqual(
      regions
    );
    expect(vus.bic, 'la forme BIC ne reconnaît pas exactement les régions de l’ICU').toEqual(
      regions
    );
  });

  const ANCRAGE_NON_REGRESSION = [
    // Les 47 codes de la liste TAPÉE d'avant GOV-036 : la dérivation ne doit jamais couvrir MOINS
    // que ce qu'elle remplace, et une ICU appauvrie amaigrirait l'oracle du témoin précédent AU
    // MÊME PAS que la garde — seul un ancrage extérieur à l'ICU le voit.
    'AD',
    'AE',
    'AT',
    'BE',
    'BG',
    'CH',
    'CY',
    'CZ',
    'DE',
    'DK',
    'EE',
    'ES',
    'FI',
    'FR',
    'GB',
    'GI',
    'GR',
    'HR',
    'HU',
    'IE',
    'IS',
    'IT',
    'LI',
    'LT',
    'LU',
    'LV',
    'MC',
    'MT',
    'NL',
    'NO',
    'PL',
    'PT',
    'RO',
    'SE',
    'SI',
    'SK',
    'SM',
    'VA',
    'US',
    'CA',
    'JP',
    'CN',
    'MA',
    'TN',
    'DZ',
    'SN',
    'CI',
    // Les cinq que GOV-036 ferme, plus XK : le Kosovo émet des IBAN et son code est attribué par
    // l'utilisateur dans CLDR, donc il peut disparaître d'une version d'ICU à l'autre.
    'TR',
    'IL',
    'RS',
    'AL',
    'LB',
    'XK',
  ];

  it('REQ-GOV-031 — ANCRAGE : les formes voient toujours les pays de la liste qu’elles remplacent', () => {
    const vus = codesVusParLesFormes(ANCRAGE_NON_REGRESSION);
    expect(
      ANCRAGE_NON_REGRESSION.filter((c) => !vus.iban.includes(c)),
      'pays émetteur(s) que la forme IBAN ne voit plus — le plancher compte les codes, il ne dit ' +
        'rien de LESQUELS'
    ).toEqual([]);
  });

  it('REQ-GOV-031 — la dérivation LÈVE juste sous son plancher, et pas au plancher', () => {
    // Les deux bornes sont ÉCRITES ici, jamais lues de la garde (RM-11).
    const { noms, regions } = regionsDeLIcu();
    const lecteurQuiConnait = (n: number) => {
      const connues = new Set(regions.slice(0, n));
      return (code: string) => (connues.has(code) ? noms.of(code) : code);
    };
    expect(() => codesDeRegion(lecteurQuiConnait(199))).toThrow(SourcePaysIllisible);
    expect(codesDeRegion(lecteurQuiConnait(200))).toHaveLength(200);
  });

  it('REQ-GOV-031 — sur le dépôt réel, la garde lit EXACTEMENT les fichiers que git suit, et chacun EN ENTIER, dans le blob publié', () => {
    // L'oracle est git, APPELÉ ICI — pas la source que la garde partage (`fichiers-suivis.ts`) —
    // et la comparaison porte sur les NOMS et sur les CONTENUS, jamais sur un compte imprimé. Le
    // contenu attendu est le BLOB de l'index, demandé par son empreinte : pas l'arbre de travail, que git
    // réécrit à l'extraction.
    const suivis = suivisParGit(process.cwd());
    expect(
      suivis.length,
      'git ne rend aucun fichier : la comparaison ne prouverait rien'
    ).toBeGreaterThan(0);
    const { fichiers } = lireUnivers();
    expect(
      fichiers.map((f) => f.chemin),
      'la garde ne lit pas les fichiers que git suit'
    ).toEqual(suivis);
    const blobs = blobsParGit(process.cwd(), suivis);
    expect(
      fichiers.filter((f) => f.contenu !== blobs.get(f.chemin)).map((f) => f.chemin),
      'contenu lu par la garde différent du blob publié'
    ).toEqual([]);
  });

  it('REQ-GOV-031 — VETO blob : un attribut qui RÉÉCRIT l’arbre à l’extraction (`ident`, `working-tree-encoding`) ne soustrait rien, la coordonnée du blob est NOMMÉE', () => {
    // Dépôt COMMITÉ, puis fichiers ré-extraits sous un `.gitattributes` suivi : l'arbre de travail
    // ne porte plus la valeur, le blob — ce que la forge sert — la porte. IBAN calculé, fictif.
    const iban = ibanSynthetique('FR', '0000000000TEMOIN0000000');
    const groupes = iban.match(/.{1,4}/g)!;
    const reecrits: Record<string, Buffer> = {
      // `ident` remplace à l'extraction ce qui suit `$Id:` par l'empreinte du blob.
      'notes/ident.txt': Buffer.from(`Virement vers $Id: ${iban} $.\n`),
      // UTF-7 rend l'espace insécable en `+AKA-` : des octets ASCII, sans NUL ni U+FFFD.
      'notes/utf7.txt': Buffer.from(`Virement vers ${groupes.join(' ')}.\n`),
    };
    // Contre-témoin : les mêmes octets, sans attribut.
    const temoins: Record<string, Buffer> = {
      'notes/sans-attribut.txt': reecrits['notes/utf7.txt']!,
    };
    const depot = depotJetable({ ...reecrits, ...temoins });
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'core.autocrlf=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
        {
          cwd: depot,
          stdio: 'pipe',
        }
      );
    try {
      git('commit', '-q', '-m', 'blobs');
      writeFileSync(
        join(depot, '.gitattributes'),
        'notes/ident.txt ident\nnotes/utf7.txt working-tree-encoding=UTF-7\n'
      );
      git('add', '.gitattributes');
      git('commit', '-q', '-m', 'attributs');
      for (const chemin of Object.keys(reecrits)) rmSync(join(depot, chemin));
      git('checkout', '--', ...Object.keys(reecrits));
      // CONTRÔLE POSITIF : l'extraction a bien retiré la valeur de l'arbre, et le blob la porte.
      const blobs = blobsParGit(depot, Object.keys(reecrits));
      for (const chemin of Object.keys(reecrits)) {
        expect(
          coordonneesDe(readFileSync(join(depot, chemin), 'utf8'), false, chemin),
          `${chemin} : arbre non réécrit`
        ).toEqual([]);
        expect(
          coordonneesDe(blobs.get(chemin)!, false, chemin),
          `${chemin} : blob sans la valeur`
        ).toHaveLength(1);
      }
      const { code, sortie } = lancerDans(depot);
      expect(code, sortie).toBe(1);
      const lignes = sortie.split('\n');
      const nommes = [...Object.keys(reecrits), ...Object.keys(temoins)].filter((c) =>
        lignes.some((l) => l.includes('[coordonnee_en_clair]') && l.includes(c))
      );
      expect(nommes, sortie).toEqual([...Object.keys(reecrits), ...Object.keys(temoins)]);
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  });

  // Un chemin que git lirait comme une RÉVISION si on lui demandait l'objet par son nom : `:0:<x>` est
  // l'étage 0 de `<x>`, et `cat-file --batch` retire le retour chariot final d'une ligne. Mesuré sous
  // Linux sur la passe t8 : porteur sous l'un de ces noms, voisin propre `<x>`, EXIT=0 « lu(s) en entier ».
  const NOMS_QUE_GIT_INTERPRETE = ['0:notes/rib.txt', 'notes/rib.txt\r'] as const;

  it('REQ-GOV-031 — VETO nom : chaque chemin est jugé sur le blob que l’index lui associe, même quand git lirait son nom comme une révision (`0:<x>`, `<x>` suivi d’un retour chariot)', () => {
    // Sans extraction : Git pour Windows refuse ces noms sur le disque. L'objet est écrit, puis l'entrée
    // `<x>\r` est posée dans l'INDEX et relue par `ls-files -s`. `0:<x>` est refusé même dans l'index
    // sous Windows : son entrée est écrite telle que `ls-files -s` la rend sous Linux, sur le même objet.
    const iban = ibanSynthetique('FR', '0000000000TEMOIN0000000');
    const depot = mkdtempSync(join(tmpdir(), 'g36-nom-'));
    const git = (args: string[], input?: string) =>
      execFileSync('git', ['-c', 'core.protectNTFS=false', ...args], {
        cwd: depot,
        input,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    try {
      git(['init', '-q']);
      const propre = git(['hash-object', '-w', '--stdin'], 'Rien a signaler.\n').trim();
      const porteur = git(['hash-object', '-w', '--stdin'], `Virement vers ${iban}.\n`).trim();
      git(['update-index', '--add', '--cacheinfo', `100644,${propre},notes/rib.txt`]);
      git([
        'update-index',
        '--add',
        '--cacheinfo',
        `100644,${porteur},${NOMS_QUE_GIT_INTERPRETE[1]}`,
      ]);
      const index = git(['ls-files', '-s', '-z'])
        .split('\0')
        .filter(Boolean)
        .map((l): EntreeSuivie => {
          const [mode, empreinte, etage] = l.slice(0, l.indexOf('\t')).split(' ');
          return {
            mode: mode!,
            empreinte: empreinte!,
            etage: etage!,
            chemin: l.slice(l.indexOf('\t') + 1),
          };
        });
      expect(
        index.map((e) => e.chemin),
        'l’index ne porte pas les deux entrées'
      ).toEqual(['notes/rib.txt', NOMS_QUE_GIT_INTERPRETE[1]]);
      const entrees = [
        ...index,
        { mode: '100644', empreinte: porteur, etage: '0', chemin: NOMS_QUE_GIT_INTERPRETE[0] },
      ];

      // CONTRÔLE POSITIF : demandé par NOM, git sert le leurre propre pour les trois entrées.
      const parNom = git(
        ['cat-file', '--batch-check'],
        entrees.map((e) => `:${e.chemin}\n`).join('')
      );
      expect(
        parNom
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split(' ')[0]),
        parNom
      ).toEqual([propre, propre, propre]);

      const blobs = blobsDe(entrees, depot);
      const porteurs = entrees
        .filter(
          (e) => coordonneesDe(blobs.get(e.chemin)!.toString('utf8'), false, e.chemin).length > 0
        )
        .map((e) => e.chemin);
      expect([...porteurs].sort(), 'la garde a lu le blob d’un AUTRE chemin').toEqual(
        [...NOMS_QUE_GIT_INTERPRETE].sort()
      );

      // Une entrée en conflit (étage ≠ 0) fait tomber la lecture, NOMMÉE : jamais un blob choisi au hasard.
      expect(() => blobsDe([{ ...entrees[0]!, etage: '2' }], depot)).toThrow(
        /notes\/rib\.txt \(étage 2\)/
      );
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'REQ-GOV-031 — VETO nom, par le vrai chemin de la gate dans un clone (Linux, comme la CI ; Git pour Windows refuse ces noms) : le porteur nommé `0:<x>` ou `<x>` suivi d’un retour chariot, voisin d’un `<x>` propre, est NOMMÉ',
    () => {
      const iban = ibanSynthetique('FR', '0000000000TEMOIN0000000');
      const depot = depotJetable({
        'notes/rib.txt': Buffer.from('Rien a signaler.\n'),
        ...Object.fromEntries(
          NOMS_QUE_GIT_INTERPRETE.map((c) => [c, Buffer.from(`Virement vers ${iban}.\n`)])
        ),
      });
      const clone = `${depot}-clone`;
      try {
        execFileSync(
          'git',
          ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'noms'],
          { cwd: depot, stdio: 'pipe' }
        );
        execFileSync('git', ['clone', '-q', depot, clone], { stdio: 'pipe' });
        const { code, sortie } = lancerDans(clone);
        expect(code, sortie).toBe(1);
        const nommes = sortie
          .split('\n')
          .flatMap(
            (l) => /\[coordonnee_en_clair\] ([^]+?) — coordonnée en clair «/.exec(l)?.[1] ?? []
          );
        expect([...nommes].sort(), sortie).toEqual([...NOMS_QUE_GIT_INTERPRETE].sort());
      } finally {
        rmSync(depot, { recursive: true, force: true });
        rmSync(clone, { recursive: true, force: true });
      }
    },
    180_000
  );

  it('REQ-GOV-031 — VETO de securite : un fichier suivi que la garde ne sait pas lire en entier fait ROUGIR, NOMMÉ', () => {
    // Dépôt git jetable, lancé par le vrai chemin de la gate. Chaque IBAN est CALCULÉ et
    // manifestement fictif : banque 00000, compte TEMOIN (RM-01, RM-11).
    const iban = ibanSynthetique('FR', '0000000000TEMOIN0000000');
    const texte = `Virement vers ${iban}.\n`;
    // « En entier » éprouvé AU-DELÀ du plus gros fichier suivi, et d'au moins 8 Mio : un seuil de
    // lecture tapé sous cette taille rougit ici, pas sur le dépôt réel qui n'y arrive pas.
    const plusGros = Math.max(...suivisParGit(process.cwd()).map((f) => statSync(f).size));
    const long = 'Ligne de relevé sans coordonnée.\n'.repeat(
      Math.ceil(Math.max(8 * 2 ** 20, 16 * plusGros) / 33)
    );
    // Aucune coordonnée n'y est LISIBLE : seul le refus peut les faire rougir.
    const illisibles: Record<string, Buffer> = {
      // La seule partie illisible est à la FIN d'un texte de plusieurs Mio.
      'notes/long-puis-utf16.txt': Buffer.concat([
        Buffer.from(long),
        Buffer.from(texte, 'utf16le'),
      ]),
      // … et la même chose sans aucun octet NUL : une séquence UTF-8 invalide en dernière ligne.
      'notes/long-puis-latin1.txt': Buffer.concat([
        Buffer.from(long),
        Buffer.from('Relevé du trimestre\n', 'latin1'),
      ]),
      // Ce qu'écrit Windows PowerShell 5.1 sur une redirection `>` : marque d'ordre, puis UTF-16LE.
      'notes/rib-utf16.txt': Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(texte, 'utf16le'),
      ]),
      'exports/rib-comprime.pdf': Buffer.concat([
        Buffer.from('%PDF-1.4\n1 0 obj << /Filter /FlateDecode >> stream\n', 'latin1'),
        deflateSync(Buffer.from(`BT (${iban}) Tj ET`)),
        Buffer.from('\nendstream\n', 'latin1'),
      ]),
      'exports/apporteurs.xlsx': Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        deflateRawSync(Buffer.from(`<sst><si><t>${iban}</t></si></sst>`)),
      ]),
      'config/sauvegarde.env.gz': gzipSync(Buffer.from(`PARTNERS_IBAN_DEBITEUR=${iban}\n`)),
      'notes/releve-latin1.txt': Buffer.from('Relevé du trimestre\n', 'latin1'),
    };
    // Du texte lisible qui porte la coordonnée : une extension quelconque, un script shell, et un
    // texte dont la coordonnée est au-delà du 6 000ᵉ octet, derrière des caractères de deux octets.
    const avecCoordonnee: Record<string, Buffer> = {
      'config/app.cfg': Buffer.from(`[banque]\niban = ${iban}\n`),
      'scripts/deploiement.sh': Buffer.from(`export PARTNERS_IBAN_DEBITEUR=${iban}\n`),
      'docs/gros.md': Buffer.from(`${'é'.repeat(3_000)}\n${texte}`),
      // La coordonnée en DERNIÈRE ligne d'un texte de plusieurs Mio.
      'docs/export.csv': Buffer.from(`${long}${texte}`),
    };
    const propres: Record<string, Buffer> = {
      'docs/propre.md': Buffer.from(`\uFEFFRelevé — ç à ü, 中文. ${'é'.repeat(5_000)}\n`),
    };
    const tous = { ...illisibles, ...avecCoordonnee, ...propres };
    const depot = depotJetable(tous);
    try {
      const { code, sortie } = lancerDans(depot);
      expect(
        code,
        `la garde sort ${code} sur des fichiers suivis qu'elle ne sait pas lire en entier :\n${sortie}`
      ).toBe(1);
      const lignes = sortie.split('\n');
      const nommes = (famille: string) =>
        Object.keys(tous).filter((chemin) =>
          lignes.some((l) => l.includes(`[${famille}]`) && l.includes(chemin))
        );
      expect(nommes('contenu_illisible'), sortie).toEqual(Object.keys(illisibles));
      expect(nommes('coordonnee_en_clair'), sortie).toEqual(Object.keys(avecCoordonnee));
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-031 — VETO LFS : un fichier suivi dont le blob est un pointeur Git LFS, ou que l’attribut `filter` confie à un filtre, est REFUSÉ, NOMMÉ, par le vrai chemin de la gate', () => {
    // Le blob d'un fichier LFS n'est que le POINTEUR, alors que la forge sert le vrai contenu. Et un
    // attribut `filter` suffit au refus, quel que soit le contenu indexé.
    const pointeur = pointeurLfs('https://git-lfs.github.com/spec/v1', '\n');
    const nonPublies: Record<string, Buffer> = {
      'exports/rib.pdf': Buffer.from(pointeur),
      'notes/extrait.txt': Buffer.from('Relevé du trimestre, extrait par LFS.\n'),
      'notes/chiffre.txt': Buffer.from('Relevé du trimestre, déchiffré sur le poste.\n'),
      'docs/orphelin.bin': Buffer.from(pointeur),
    };
    // `-filter` RETIRE l'attribut : le fichier est publié tel qu'il est lu.
    const lus: Record<string, Buffer> = {
      '.gitattributes': Buffer.from(
        'exports/*.pdf filter=lfs diff=lfs merge=lfs -text\nnotes/extrait.txt filter=lfs diff=lfs merge=lfs -text\n' +
          'notes/chiffre.txt filter=git-crypt diff=git-crypt\n*.md filter=lfs\ndocs/*.md -filter\n'
      ),
      'docs/lfs.md': Buffer.from(`# Git LFS\n\nUn pointeur commence par :\n\n${pointeur}`),
    };
    const tous = { ...nonPublies, ...lus };
    const depot = depotJetable(tous);
    try {
      const { code, sortie } = lancerDans(depot);
      expect(code, sortie).toBe(1);
      const lignes = sortie.split('\n');
      const nommes = Object.keys(tous).filter((c) =>
        lignes.some((l) => l.includes('[contenu_publie_non_lu]') && l.includes(c))
      );
      expect(nommes, sortie).toEqual(Object.keys(nonPublies));
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-031 — sans table des régions, la GATE refuse : zéro code de région n’est pas une forme plus étroite', () => {
    // Le refus est éprouvé sur la gate lancée, pas sur la fonction : un `try/catch` glissé autour de
    // la dérivation rendrait « 0 codes de région » et un vert.
    const dossier = mkdtempSync(join(tmpdir(), 'g36-icu-'));
    try {
      const pannes: Record<string, string> = {
        'Intl.DisplayNames absent': 'delete Intl.DisplayNames;\n',
        'une table qui ne connaît aucune région':
          'Intl.DisplayNames = class { of(code) { return code; } };\n',
      };
      for (const [i, [panne, source]] of Object.entries(pannes).entries()) {
        const prechargement = join(dossier, `panne-${i}.mjs`);
        writeFileSync(prechargement, source);
        const options =
          `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(prechargement).href}`.trim();
        const { code, sortie } = lancerDans(process.cwd(), { NODE_OPTIONS: options });
        expect(code, `${panne} :\n${sortie.slice(0, 2_000)}`).toBe(1);
        expect(sortie, panne).toContain('SourcePaysIllisible');
        expect(sortie, panne).not.toContain('✅');
      }
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  /** La limite que le vert doit imprimer, ÉCRITE ici et jamais importée de la garde (RM-11). */
  const LIMITE_ECRITE =
    "Limite déclarée : ce que la forme ne reconnaît pas passe sans être vu. Elle reconnaît un IBAN écrit d'un seul " +
    'tenant — code de région, deux chiffres, groupes de quatre caractères séparés au plus par une espace (ASCII ou ' +
    'typographique) ou un tiret (ASCII ou insécable), 15 à 34 caractères, clé mod-97 valide, rien de collé devant ni ' +
    'derrière — et un BIC en majuscules dont le mot-clé touche un délimiteur ou une balise. Passent donc, entre autres : ' +
    'une valeur masquée ou à clé fausse ; encodée (base64, hexadécimal, entité HTML, pourcentage, quoted-printable, ' +
    "échappement JSON, flux de PDF ou contenu compressé qui forment de l'UTF-8 valide) ; coupée ou espacée autrement " +
    "(saut de ligne, tabulation, deux espaces, point, caractère invisible, groupes d'une autre longueur) ; écrite en " +
    "pleine chasse ou en homoglyphes ; portée par le NOM d'un fichier. Côté numéros PUBLICS, deux " +
    'angles morts de plus, nommés le 2026-09-22 et identiques avant comme après ce lot : la forme ' +
    'de TVA est sensible à la CASSE, donc une TVA hors capitales lui échappe — seule ' +
    '`valeur_recopiee` la rattrape ; et un groupe de chiffres PLUS LONG que la fenêtre attendue ' +
    "n'ouvre aucune frontière de mot, donc n'est pas apparié. Cette liste n'est pas close.";

  it('REQ-GOV-031 — une population GÉNÉRÉE : chaque fichier porteur est NOMMÉ, puis la même population propre sort VERTE, comptée comme git, limite écrite', () => {
    // Toutes les extensions d'une et deux lettres ; au-delà, un ÉCHANTILLON — une branche qui écarte
    // un nom absent d'ici ET du dépôt réel n'est pas vue, et c'est déclaré ; des noms sans extension,
    // cachés, non ASCII, à espace, profonds. Une coordonnée fictive dans CHAQUE fichier : vider,
    // écarter ou sauter une famille de fichiers, à la lecture comme au contrôle, retire un nom.
    const lettres = 'abcdefghijklmnopqrstuvwxyz';
    const extensions = [
      ...lettres,
      ...[...lettres].flatMap((a) => [...lettres].map((b) => a + b)),
      ...['cfg', 'xyz', 'toml', 'jsonc', 'sha256', 'markdown'],
    ];
    const chemins = [
      ...extensions.map((e) => `p/f.${e}`),
      ...[
        'p/sans-extension',
        'p/.cache',
        'p/double.env.example',
        'p/relevé des comptes.md',
        'données/été/報告.txt',
        'a/b/c/d/e/f/g/profond.x',
      ],
    ];
    const iban = ibanSynthetique('FR', '30004TEMOIN58201739465');
    const depot = depotJetable(
      Object.fromEntries(chemins.map((c) => [c, Buffer.from(`Virement vers ${iban}.\n`)]))
    );
    try {
      const suivis = suivisParGit(depot);
      expect(suivis.length).toBe(chemins.length + SOURCES_DE_LA_GARDE.length);
      const porteurs = lancerDans(depot);
      expect(porteurs.code, porteurs.sortie.slice(0, 2_000)).toBe(1);
      const nommes = porteurs.sortie
        .split('\n')
        .flatMap((l) => /\[coordonnee_en_clair\] (.+?) — coordonnée en clair «/.exec(l)?.[1] ?? []);
      expect([...nommes].sort(), 'fichier(s) porteur(s) non nommé(s) par la gate').toEqual(
        [...chemins].sort()
      );

      for (const c of chemins) writeFileSync(join(depot, c), `${c}\n`);
      // La garde juge ce que l'index PUBLIE : la population propre doit y être indexée.
      execFileSync('git', ['add', '-A'], { cwd: depot, stdio: 'ignore' });
      const { code, sortie } = lancerDans(depot);
      expect(code, sortie).toBe(0);
      const lu = /(\d+) fichier\(s\) suivi\(s\) lu\(s\) en entier/.exec(sortie);
      expect(lu, `la garde ne dit pas ce qu'elle a lu :\n${sortie}`).not.toBeNull();
      expect(Number(lu![1]), sortie).toBe(suivis.length);
      // À l'ÉGALITÉ, la ligne entière : une limite allongée ou rognée par un bout rougit aussi.
      const limite = sortie.split('\n').filter((l) => l.includes('Limite déclarée'));
      expect(
        limite.map((l) => l.trim()),
        sortie
      ).toEqual([`⚠️ ${LIMITE_ECRITE}`]);
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  });
});

/** Les fichiers que git suit dans `depot`, demandés à git lui-même. */
function suivisParGit(depot: string): string[] {
  return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], {
    cwd: depot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

/**
 * Le blob que l'INDEX de `depot` porte pour chaque chemin, décodé en UTF-8 : ce que la forge publie,
 * pas l'arbre de travail. Par un AUTRE appel que la garde : l'empreinte lue ici dans `git ls-files -s`,
 * puis l'objet demandé par cette empreinte — la garde prend la sienne dans `fichiers-suivis.ts`.
 */
function blobsParGit(depot: string, chemins: string[]): Map<string, string> {
  const empreintes = new Map(
    execFileSync('git', ['ls-files', '-s', '-z'], {
      cwd: depot,
      encoding: 'utf8',
      maxBuffer: 256 * 2 ** 20,
    })
      .split('\0')
      .filter(Boolean)
      .map((e) => [e.slice(e.indexOf('\t') + 1), e.split(' ')[1]!] as const)
  );
  const sortie = execFileSync('git', ['cat-file', '--batch'], {
    cwd: depot,
    input: chemins.map((c) => `${empreintes.get(c)}\n`).join(''),
    maxBuffer: 2 ** 30,
  });
  const blobs = new Map<string, string>();
  let i = 0;
  for (const chemin of chemins) {
    const fin = sortie.indexOf(0x0a, i);
    const [oid, type, taille] = sortie.subarray(i, fin).toString('utf8').split(' ');
    if (type !== 'blob' || oid !== empreintes.get(chemin)) {
      throw new Error(`git cat-file ${chemin} → ${sortie.subarray(i, fin).toString('utf8')}`);
    }
    blobs.set(chemin, sortie.subarray(fin + 1, fin + 1 + Number(taille)).toString('utf8'));
    i = fin + 1 + Number(taille) + 1;
  }
  return blobs;
}

/** Un dépôt git jetable : les trois sources de la garde et les fichiers donnés, tous SUIVIS. */
function depotJetable(fichiers: Record<string, Buffer>): string {
  const depot = mkdtempSync(join(tmpdir(), 'g36-'));
  const ecrire = (chemin: string, contenu: Buffer) => {
    mkdirSync(join(depot, dirname(chemin)), { recursive: true });
    writeFileSync(join(depot, chemin), contenu);
  };
  for (const [chemin, contenu] of Object.entries(fichiers)) ecrire(chemin, contenu);
  for (const source of SOURCES_DE_LA_GARDE) ecrire(source, readFileSync(source));
  for (const args of [
    ['init', '-q'],
    ['add', '-A'],
  ])
    execFileSync('git', args, { cwd: depot, stdio: 'ignore' });
  return depot;
}

/** Les sources que la garde lit en plus des fichiers suivis, copiées dans chaque dépôt jetable. */
const SOURCES_DE_LA_GARDE = [
  'config/entite.json',
  'docs/DECISIONS.md',
  'docs/REQUIREMENTS.md',
] as const;

/** La gate, lancée par `tsx` depuis la racine d'un dépôt, avec des variables en plus. */
function lancerDans(
  depot: string,
  // Pas `NodeJS.ProcessEnv` : `next` y déclare `NODE_ENV` obligatoire (next/types/global.d.ts), et ces
  // variables s'AJOUTENT à l'environnement du banc, qui porte déjà le sien.
  variables: Readonly<Record<string, string>> = {}
): { code: number | null; sortie: string } {
  const r = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), resolve(SCRIPT)],
    {
      cwd: depot,
      encoding: 'utf8',
      env: { ...envDuBancDEssai(), ...variables },
      maxBuffer: 64 * 2 ** 20,
    }
  );
  return { code: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Un pointeur Git LFS, tel que l'arbre de travail le porte quand LFS n'a pas extrait le fichier. */
function pointeurLfs(entete: string, fin: string): string {
  return [`version ${entete}`, `oid sha256:${'0'.repeat(64)}`, 'size 1024', ''].join(fin);
}

/** Un IBAN de forme valide dont la clé mod-97 est CALCULÉE — jamais recopiée (RM-01). */
function ibanSynthetique(pays: string, corps: string): string {
  for (let cle = 0; cle < 100; cle++) {
    const candidat = `${pays}${String(cle).padStart(2, '0')}${corps}`;
    if (cleIbanValide(candidat)) return candidat;
  }
  throw new Error(`aucune clé mod-97 valide pour ${pays}…${corps} : le témoin ne mesurerait rien`);
}
