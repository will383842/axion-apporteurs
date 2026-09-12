// @req REQ-DM-003
// @req REQ-INT-004
/**
 * `termes-interdits.spec.ts` — le contrôle de la garde `gov:check` (GOV-030).
 *
 * POURQUOI CE FICHIER EXISTE. `docs/gates.json` déclare depuis GOV-000 une garde de TERMES
 * INTERDITS dont le script `scripts/gates/gov-check.ts` n'existait pas, et aucun autre script ne
 * faisait ce travail. Six affirmations du dépôt s'appuyaient dessus — `docs/GLOSSAIRE.md`,
 * `docs/CONVENTIONS.md`, `docs/REGLES-MAISON.md` (RM-06), `packages/contracts/events.ts`,
 * REQ-GOV-001 et la vue `docs/GATES.md`. Ce fichier est ce qui rend la garde opposable.
 *
 * CE QU'IL EXERCE, ET DANS QUEL SENS.
 *   1. une DÉRIVATION (RM-01) : ni les sept noms d'événements, ni les sept états occupants, ni les
 *      synonymes interdits ne sont tapés dans la garde. Ils se lisent dans REQ-INT-004, dans
 *      REQ-DM-003, dans `docs/GLOSSAIRE.md` et dans `packages/contracts`. Les tests de
 *      renversement ci-dessous prouvent que c'est une LECTURE : sur une source modifiée,
 *      l'attendu se déplace ;
 *   2. le REFUS de conclure sans périmètre : « 0 fichier balayé » n'est pas « aucun défaut » ;
 *   3. le CONTRE-TÉMOIN qui protège la documentation de la règle : un document qui EXPLIQUE
 *      l'interdit doit pouvoir écrire son contre-exemple entre accents graves. Sans lui, la garde
 *      interdirait `docs/GLOSSAIRE.md`, `docs/REGLES-MAISON.md` et sa propre entrée de registre —
 *      défaut déjà rencontré et corrigé sur `gov:identifiants`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  controler,
  typesEvenementDeLaReq,
  modelesRefusesDAxionia,
  synonymesDuGlossaire,
  FAMILLES,
  VUE_CONFORME,
  vueDuDepot,
  type Vue,
} from '../../../scripts/gates/gov-check';
import { TYPES_EVENEMENT } from '../../../packages/contracts/events';

const SCRIPT = 'scripts/gates/gov-check.ts';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par une vue — l'unité de mesure de tout ce fichier. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

/** La vue conforme, plus un seul fichier : le témoin ne bouge que pour UNE raison. */
function avecFichier(chemin: string, contenu: string): Vue {
  return { ...VUE_CONFORME, fichiers: [...VUE_CONFORME.fichiers, { chemin, contenu }] };
}

describe('REQ-INT-004 — la nomenclature des événements est LUE, jamais recopiée', () => {
  it('REQ-INT-004 : les sept types se lisent dans le texte de l’exigence', () => {
    const derives = typesEvenementDeLaReq(VUE_CONFORME.reqInt004);
    expect(derives).toHaveLength(7);
    expect(derives).toContain('paiement.rembourse');

    // La preuve que c'est une lecture et non un littéral : on retire un type d'une COPIE du
    // texte, et la dérivation doit le perdre. Sans cette assertion, un tableau écrit en dur
    // passerait le test précédent sans rien lire.
    const ampute = VUE_CONFORME.reqInt004.replace(', `paiement.rembourse`', '');
    expect(typesEvenementDeLaReq(ampute)).toHaveLength(6);
    expect(typesEvenementDeLaReq(ampute)).not.toContain('paiement.rembourse');
  });

  it('REQ-INT-004 : `Invoice` et `Refund` sont dérivés de la clause de l’exigence', () => {
    const refuses = modelesRefusesDAxionia(VUE_CONFORME.reqInt004, VUE_CONFORME.glossaire);
    expect(refuses).toEqual(expect.arrayContaining(['Invoice', 'Refund']));

    // Renversement : la clause réécrite sur un autre modèle déplace l'attendu.
    const autre = VUE_CONFORME.reqInt004.replace('`Refund`', '`Booking`');
    expect(modelesRefusesDAxionia(autre, VUE_CONFORME.glossaire)).toContain('Booking');
  });

  it('REQ-INT-004 : `payment.received` dans un fichier de docs fait rougir la garde', () => {
    // C'est la `fixtureRouge` que `docs/gates.json` déclare pour cette entrée, mot pour mot.
    const vue = avecFichier('docs/note.md', 'le producteur emet payment.received a la signature');
    expect(familles(vue)).toContain('evenement_hors_nomenclature');
  });

  it('REQ-INT-004 : un nom VALIDE écrit littéralement hors du paquet de contrats rougit', () => {
    const rouge = avecFichier('src/server/journal.ts', "if (type === 'paiement.recu') return;");
    expect(familles(rouge)).toContain('evenement_litteral_hors_contrat');

    // Contre-témoin : la SOURCE a le droit de porter la liste, sinon la garde interdirait
    // l'endroit même où le contrat se définit.
    const vert = avecFichier('packages/contracts/events.ts', "export const T = ['paiement.recu'];");
    expect(familles(vert)).not.toContain('evenement_litteral_hors_contrat');
  });

  it('REQ-INT-004 : un nom en anglais et un nom valide ne rougissent pas la même famille', () => {
    // Un témoin qui bouge pour DEUX raisons ne discrimine rien : les deux familles sont exclusives.
    const anglais = familles(avecFichier('docs/note.md', 'devis.signed'));
    expect(anglais).toContain('evenement_hors_nomenclature');
    expect(anglais).not.toContain('evenement_litteral_hors_contrat');
  });
});

describe('REQ-DM-003 — aucune liste littérale d’états hors de son exigence (RM-06)', () => {
  it('REQ-DM-003 : l’index à deux états que le registre nomme fait rougir la garde', () => {
    const vue = avecFichier(
      'docs/migration.md',
      "CREATE INDEX sur attributions WHERE statut IN ('provisoire','active')"
    );
    expect(familles(vue)).toContain('liste_litterale_d_etats');
  });

  it('REQ-DM-003 : la liste se lit dans l’exigence — un état retiré du texte n’est plus gardé', () => {
    const sansFigee: Vue = {
      ...VUE_CONFORME,
      reqDm003: VUE_CONFORME.reqDm003.replace(', figee_resiliation}', '}'),
      fichiers: [
        ...VUE_CONFORME.fichiers,
        { chemin: 'docs/note.md', contenu: "statut IN ('figee_resiliation','perdue')" },
      ],
    };
    expect(familles(sansFigee)).not.toContain('liste_litterale_d_etats');
  });

  it('REQ-DM-003 : la source unique, elle, a le droit de porter la liste', () => {
    const etats = "['provisoire', 'active', 'rdv_pris']";
    const vue = avecFichier(
      'src/domain/attribution/etats.ts',
      `export const ETATS_OCCUPANTS = ${etats};`
    );
    expect(familles(vue)).not.toContain('liste_litterale_d_etats');
  });
});

describe('GOV-030 — la garde ne peut pas interdire sa propre documentation', () => {
  it('CONTRE-TÉMOIN : un document qui EXPLIQUE la règle cite son contre-exemple entre accents graves', () => {
    // Les formes réelles, prises dans les documents qui portent la règle aujourd'hui.
    const documentation = [
      "Synonymes interdits : `('provisoire','active')` (index à 2 états), `ETATS_ACTIFS`.",
      'des noms comme `payment.received`, `invoice.issued`, `devis.signed` sont refusés',
      'les modèles `Invoice` et `Refund` ont disparu du schéma voisin',
      'le rôle est `qualifieur` ; `qualificateur` est un synonyme interdit',
      'la liste fermée est `client.cree`, `devis.signe`, `paiement.recu`',
    ].join('\n');
    expect(controler(avecFichier('docs/REGLES-MAISON.md', documentation))).toEqual([]);
  });

  it('CONTRE-TÉMOIN : hors des accents graves, le même document rougit', () => {
    // Sans cette assertion, l'exemption ci-dessus pourrait être une garde éteinte plutôt qu'une
    // exemption : un témoin qui ne rougit jamais ne prouve pas qu'il sait distinguer.
    const usage = 'le producteur emet payment.received puis invoice.issued';
    expect(familles(avecFichier('docs/REGLES-MAISON.md', usage))).toContain(
      'evenement_hors_nomenclature'
    );
  });

  it('CONTRE-TÉMOIN : dans du CODE, les accents graves DÉLIMITENT et n’exemptent rien', () => {
    const gabarit = 'const sujet = `payment.received`;';
    expect(familles(avecFichier('src/server/emetteur.ts', gabarit))).toContain(
      'evenement_hors_nomenclature'
    );
  });
});

describe('GOV-030 — synonymes interdits du glossaire', () => {
  it('REQ-INT-004 : `qualificateur` rougit, `qualifieur` reste vert', () => {
    const rouge = avecFichier('src/server/roles.ts', "const role = 'qualificateur';");
    expect(familles(rouge)).toContain('synonyme_interdit_du_glossaire');

    const vert = avecFichier('src/server/roles.ts', "const role = 'qualifieur';");
    expect(familles(vert)).not.toContain('synonyme_interdit_du_glossaire');
  });

  it('REQ-INT-004 : les synonymes se LISENT dans le glossaire — amputé, il n’en garde plus', () => {
    const sansQualificateur: Vue = {
      ...VUE_CONFORME,
      glossaire: VUE_CONFORME.glossaire.replace('`qualificateur`, ', ''),
      fichiers: [
        ...VUE_CONFORME.fichiers,
        { chemin: 'src/roles.ts', contenu: "const r = 'qualificateur';" },
      ],
    };
    expect(familles(sansQualificateur)).not.toContain('synonyme_interdit_du_glossaire');
  });

  it('REQ-INT-004 : un synonyme déclaré SOUS CONDITION n’est pas exercé, et la garde le DIT', () => {
    // « `actif` en colonne » : l'interdiction porte sur un contexte que la garde ne sait pas
    // trancher. Elle ne l'exerce donc pas — et elle ne fait pas non plus semblant de le garder.
    const conditionnels = synonymesDuGlossaire(VUE_CONFORME.glossaire).filter((s) => !s.exerce);
    expect(conditionnels.map((s) => s.terme)).toContain('actif');
    expect(familles(avecFichier('src/a.ts', 'const actif = true;'))).not.toContain(
      'synonyme_interdit_du_glossaire'
    );
  });
});

describe('GOV-030 — la garde refuse de conclure sans périmètre ni source', () => {
  it('REQ-DM-003 : un périmètre VIDE est un ROUGE, jamais « aucun défaut »', () => {
    expect(familles({ ...VUE_CONFORME, fichiers: [] })).toContain('perimetre_vide');
  });

  it('REQ-INT-004 : une exigence qui ne donne plus ses types est un ROUGE, pas un vert', () => {
    const muette: Vue = {
      ...VUE_CONFORME,
      reqInt004: "Les types d'événements sont nommés ailleurs.",
    };
    expect(familles(muette)).toContain('source_illisible');
  });

  it('REQ-INT-004 : un contrat vide est un ROUGE — la garde ne sait plus ce qu’elle compare', () => {
    expect(familles({ ...VUE_CONFORME, typesDuContrat: [] })).toContain('source_illisible');
  });

  it('REQ-INT-004 : le contrat du dépôt et l’exigence disent la même chose', () => {
    // Si les deux divergeaient, la garde condamnerait `packages/contracts` ou l'inverse.
    expect([...TYPES_EVENEMENT].sort()).toEqual(
      typesEvenementDeLaReq(vueDuDepot().reqInt004).sort()
    );
  });
});

describe('GOV-030 — la vue conforme est verte, et chaque famille a son témoin', () => {
  it('la vue conforme est verte : sans ce contre-témoin, tout le reste ne prouve rien', () => {
    expect(controler(VUE_CONFORME)).toEqual([]);
  });

  it('chaque famille déclarée rougit sur son témoin dans `--prove`', () => {
    const { code, sortie } = lancer('--prove');
    expect(sortie).toBeTruthy();
    expect(code).toBe(0);
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces).toHaveLength(FAMILLES.length);
  });
});

describe('GOV-030 — la garde tourne sur le dépôt, et elle y est verte', () => {
  it('`gov-check.ts` sort en 0 sur l’état du dépôt', () => {
    const { code, sortie } = lancer();
    expect(sortie).toBeTruthy();
    expect(code).toBe(0);
  });

  it('elle MESURE quelque chose : le périmètre est imprimé avec son compte, et il n’est pas nul', () => {
    const { sortie } = lancer();
    const m = /(\d+) fichier\(s\) balay/.exec(sortie);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    // `src/` est vide en phase −1 : la garde doit le DIRE, sans quoi « 0 fichier » se lirait
    // comme « aucun défaut ».
    expect(sortie).toMatch(/src\//);
  });
});
