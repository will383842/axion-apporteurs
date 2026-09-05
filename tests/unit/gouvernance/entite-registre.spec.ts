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
  estBalaye,
  estExemptDe,
  cleIbanValide,
  EXEMPTS,
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

/**
 * LES DEUX LISTES QUI DÉCIDENT DE CE QUI EST REGARDÉ — le seul endroit non gardé de la garde.
 *
 * 🔴 Trouvé par la lentille `mutation` le 2026-09-05, et c'est le défaut le plus instructif du
 * lot : `--prove` INJECTE son univers et ne passe jamais par la lecture du disque. Les deux
 * listes qui filtrent les fichiers — `EXTENSIONS_BALAYEES` et `EXEMPTS` — n'étaient donc
 * exercées par AUCUN témoin. Mesuré : remplacer les extensions par un motif qui ne reconnaît
 * rien, ou les exemptions par un attrape-tout, laissait `gov:entite` ET son `--prove` VERTS tous
 * les deux. La moitié « publication » de la garde se désarmait sans qu'une étape de Gate A
 * rougisse — la seule trace était un compteur de fichiers balayés dans un message de succès que
 * personne n'assertait.
 *
 * Une garde dont on peut couper la vue sans qu'aucun test ne tombe est une garde décorative.
 * Ces témoins-ci portent sur le FILTRE lui-même, pas sur ce qu'il laisse passer.
 */
describe('REQ-CPL-018 — ce que la garde REGARDE est gardé, pas seulement ce qu’elle en dit', () => {
  it('REQ-CPL-018 — un secret ne choisit pas son extension : les familles à risque sont balayées', () => {
    for (const chemin of [
      'prisma/schema.prisma', // introduit par ce lot même, et ignoré jusqu'au 2026-09-05
      '.env.example', // `.gitignore` le dé-exclut exprès pour qu'il soit suivi
      'docs/DECISIONS.md',
      'scripts/lot/composer.ts',
      'config/entite.json',
      '.github/CODEOWNERS',
      'docs/releve.csv',
      'docs/virement.xml',
      'notes.txt',
    ]) {
      expect(estBalaye(chemin), `${chemin} doit être balayé`).toBe(true);
    }
  });

  it('REQ-CPL-018 — un fichier binaire ou d’image n’est pas balayé : le filtre reste un filtre', () => {
    // Le contre-témoin. Sans lui, « tout est balayé » passerait ce fichier, et la liste
    // d'extensions pourrait être remplacée par `/.*/ ` sans que rien ne tombe.
    for (const chemin of ['docs/schema.png', 'assets/logo.svg', 'polices/inter.woff2']) {
      expect(estBalaye(chemin), `${chemin} ne doit PAS être balayé`).toBe(false);
    }
  });

  it('REQ-CPL-018 — AUCUN fichier n’est exempt de la recherche de SECRET, et c’est le veto de 2026-09-05', () => {
    // `docs/DECISIONS.md` est le fichier où l'arbitrage de la banque sera écrit. Il était exempt
    // du balayage ENTIER — donc de la recherche d'IBAN — parce qu'il a le droit de nommer le
    // SIREN qu'il arrête. Les deux ne se déduisent pas l'un de l'autre.
    expect(estExemptDe('docs/DECISIONS.md', 'recopie')).toBe(true);
    expect(estExemptDe('docs/DECISIONS.md', 'coordonnee')).toBe(false);
    expect(estExemptDe('docs/adr/0009-valeurs-du-monde-reel.md', 'coordonnee')).toBe(false);
  });

  it('REQ-CPL-018 — le type interdit d’élargir une exemption sans que la revue le voie', () => {
    // Deux valeurs, et deux seulement. Une exemption plus large exigerait d'élargir le type.
    for (const e of EXEMPTS) expect(['recopie', 'coordonnee']).toContain(e.exemptDe);
    // Et chacune porte sa raison : une exemption sans motif est une exemption qu'on ne relit pas.
    for (const e of EXEMPTS) expect(e.raison.length).toBeGreaterThan(30);
  });

  it('REQ-CPL-018 — `coordonnee` implique `recopie`, jamais l’inverse', () => {
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

describe("REQ-CPL-018 — les formes de coordonnées, éprouvées sur les cas qui les ont fait tomber", () => {
  const IBAN_REEL = 'FR1420041010050500013M02606'; // clé de contrôle VALIDE

  it("REQ-CPL-018 — la clé de contrôle sépare un IBAN d'une chaîne qui lui ressemble", () => {
    expect(cleIbanValide(IBAN_REEL)).toBe(true);
    expect(cleIbanValide('DE89370400440532013000')).toBe(true);
    // Les trois qui faisaient rougir la garde sur un dépôt PROPRE : des identifiants dont les
    // deux premières lettres font un code pays (DE = Allemagne, AE = Émirats).
    expect(cleIbanValide('DE72D8B01D23490C87626583083FF94B')).toBe(false);
    expect(cleIbanValide('AE77F99D0366D48A')).toBe(false);
    expect(cleIbanValide('FC294892B7AA455D2398C4B6')).toBe(false);
  });

  it('REQ-CPL-018 — un IBAN en MINUSCULES est un IBAN', () => {
    // Signalé au premier tour, non traité au second : la casse avait été tranchée pour le BIC et
    // jamais reportée à l'IBAN. Un relevé n'impose pas la casse.
    const fautes = controler(
      universAvecFichier('docs/note.md', `Le compte est ${IBAN_REEL.toLowerCase()}.`)
    );
    expect(fautes.map((f) => f.famille)).toContain('coordonnee_en_clair');
    // La valeur est remontée en MAJUSCULES : un même compte écrit de deux façons est un compte.
    expect(fautes.some((f) => f.message.includes(IBAN_REEL))).toBe(true);
  });

  it("REQ-CPL-018 — un IBAN dans un champ NON secret du registre n'est plus invisible", () => {
    // Le registre était exempt du balayage entier : `banqueReceptrice.espaceDeTest` — le champ où
    // l'on colle un RIB, trois lignes sous `banqueDebitrice.iban` — ne voyait rien.
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({ chemin: 'config/entite.json', contenu: `{ "espaceDeTest": "${IBAN_REEL}" }` });
    expect(controler(u).map((f) => f.famille)).toContain('coordonnee_en_clair');
  });

  it("REQ-CPL-018 — CONTRE-TÉMOIN : le registre garde le droit de porter ses valeurs PUBLIQUES et ses exemples", () => {
    // Sans ce contre-témoin, la correction précédente reviendrait à interdire au registre d'être
    // la source — et on l'exempterait de nouveau en bloc, ce qui rouvrirait le veto.
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({
      chemin: 'config/entite.json',
      contenu: '{ "siren": "108018631", "exemple": "FR7612345678901234567890123" }',
    });
    expect(controler(u).map((f) => f.famille)).not.toContain('coordonnee_en_clair');
  });

  it("REQ-CPL-018 — un IBAN à clé VALIDE dans le registre rougit, même s'il RESSEMBLE à un exemple", () => {
    // 🔴 Troisième occurrence de la même indulgence. `coordonneeLegitimeAuRegistre` rendait `true`
    // sur `estExemplePlausible`, pour le seul `config/entite.json` — le fichier qu'on ouvre avec
    // un RIB en main. Un IBAN à clé mod-97 VALIDE et à compte zéro-padé y restait invisible, alors
    // que le MÊME rougissait dans `docs/DECISIONS.md`. Et la clause ne protégeait rien : les deux
    // exemples que le registre documente ont une clé FAUSSE, donc `cleIbanValide` les écarte déjà.
    const zeroPade = 'FR0030004000030000000000019'; // clé valide, compte zéro-padé
    expect(cleIbanValide(zeroPade), 'le témoin doit avoir une clé VALIDE, sinon il ne prouve rien').toBe(true);
    const u = structuredClone(UNIVERS_CONFORME) as Univers;
    u.fichiers.push({ chemin: 'config/entite.json', contenu: `{ "espaceDeTest": "${zeroPade}" }` });
    expect(controler(u).map((f) => f.famille)).toContain('coordonnee_en_clair');
  });

  it('REQ-CPL-018 — un BIC dans du JSON, du XML ou du CSV : les formats des fichiers BANCAIRES', () => {
    // 🔴 RÉGRESSION que j'ai introduite en fermant le faux positif `DOCUSEAL` : mon séparateur
    // commençait par `[ 	]*[=:]`, or en JSON le guillemet FERMANT de la clé s'intercale. La forme
    // rougissait avant, plus après — et elle échouait précisément sur les formats que ce lot venait
    // d'ajouter au balayage parce que ce sont ceux des fichiers bancaires.
    for (const [nom, texte] of [
      ['JSON', '{"bic": "BNPAFRPPXXX"}'],
      ['JSON serré', '{"bic":"BNPAFRPPXXX"}'],
      ['XML pain.001', '<BICFI>BNPAFRPPXXX</BICFI>'],
      ['CSV', 'bic,BNPAFRPPXXX'],
    ] as const) {
      expect(
        controler(universAvecFichier('docs/rib.json', texte)).map((f) => f.famille),
        nom
      ).toContain('coordonnee_en_clair');
    }
  });

  it('REQ-CPL-018 — un BIC se donne après un DÉLIMITEUR, jamais au milieu de la prose', () => {
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

  it("REQ-CPL-018 — CONTRE-TÉMOIN : « DOCUSEAL » n'est pas un BIC, et le code pays ne suffisait pas à le dire", () => {
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
