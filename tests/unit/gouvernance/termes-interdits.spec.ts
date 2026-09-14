// @req REQ-DM-003
// @req REQ-INT-004
/**
 * `termes-interdits.spec.ts` — le contrôle de la garde `gov:check` (GOV-030).
 *
 * CE QU'IL EXERCE :
 *   1. les DÉRIVATIONS (RM-01) : types, modèles refusés, synonymes et racines se LISENT dans leurs
 *      sources, et les fixtures de la preuve sont assérées ÉGALES aux sources réelles ;
 *   2. l'UNICITÉ de la famille `liste_litterale_d_etats` (REQ-DM-003, `partners/ADR-0011`) ;
 *   3. le PÉRIMÈTRE : la vue porte tous les fichiers suivis, le périmètre en est une partition, et
 *      les comptes imprimés en viennent ;
 *   4. les DÉCISIONS de `--prove` et de la garde, fonctions pures : chaque entrée non vide rend 1,
 *      supprimer n'importe quel témoin découvre SA clé, et la ligne de commande sort de ces
 *      décisions — sur le dépôt réel comme sur un dépôt jetable fautif.
 * Les cas que `TEMOINS` et `CONTRE_TEMOINS` portent ne sont pas restatés : `decisionDeLaPreuve` les
 * juge, et elle est exercée ici.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  controler,
  typesEvenementDeLaReq,
  modelesRefusesDAxionia,
  synonymesDuGlossaire,
  racinesDuGlossaire,
  populationDuRegistre,
  cleDeCouverture,
  ecartsDePopulation,
  eprouver,
  decisionDeLaPreuve,
  decisionDeLaGarde,
  perimetreDeLaVue,
  FAMILLES,
  REFUS_DE_CONCLURE,
  TEMOINS,
  CONTRE_TEMOINS,
  VUE_CONFORME,
  vueDuDepot,
  type Temoin,
  type Vue,
} from '../../../scripts/gates/gov-check';
import {
  controler as controlerVocabulaire,
  VUE_CONFORME as VUE_VOCABULAIRE,
  RACINES_CODE,
  EXTENSIONS_CODE,
} from '../../../scripts/gates/schema-enums';
import { TYPES_EVENEMENT } from '../../../packages/contracts/events';

const SCRIPT = 'scripts/gates/gov-check.ts';
const PORTEE = { racines: RACINES_CODE, extensions: EXTENSIONS_CODE };

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par une vue. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

/** La vue conforme, plus un seul fichier : le témoin ne bouge que pour UNE raison. */
function avecFichier(chemin: string, contenu: string): Vue {
  return { ...VUE_CONFORME, fichiers: [...VUE_CONFORME.fichiers, { chemin, contenu }] };
}

const temoin = (id: string): Temoin => TEMOINS.find((t) => t.id === id)!;

describe('REQ-INT-004 — la nomenclature des événements est LUE, jamais recopiée', () => {
  it('REQ-INT-004 : les sept types se lisent dans le texte de l’exigence', () => {
    const derives = typesEvenementDeLaReq(VUE_CONFORME.reqInt004);
    expect(derives).toHaveLength(7);
    expect(derives).toContain('paiement.rembourse');

    // Renversement : un type retiré d'une COPIE du texte disparaît de la dérivation.
    const ampute = VUE_CONFORME.reqInt004.replace(', `paiement.rembourse`', '');
    expect(typesEvenementDeLaReq(ampute)).toHaveLength(6);
    expect(typesEvenementDeLaReq(ampute)).not.toContain('paiement.rembourse');
  });

  it('REQ-INT-004 : `Invoice` et `Refund` sont dérivés de la clause de l’exigence', () => {
    const refuses = modelesRefusesDAxionia(VUE_CONFORME.reqInt004, VUE_CONFORME.glossaire);
    expect(refuses).toEqual(expect.arrayContaining(['Invoice', 'Refund']));

    const autre = VUE_CONFORME.reqInt004.replace('`Refund`', '`Booking`');
    expect(modelesRefusesDAxionia(autre, VUE_CONFORME.glossaire)).toContain('Booking');
  });

  it('REQ-INT-004 : un nom en anglais et un nom valide ne rougissent pas la même famille', () => {
    const anglais = familles(avecFichier('docs/adr/0011-temoin.md', 'devis.signed'));
    expect(anglais).toContain('evenement_hors_nomenclature');
    expect(anglais).not.toContain('evenement_litteral_hors_contrat');
  });
});

describe('REQ-DM-003 — la famille des listes d’états a UNE SEULE implémentation (RM-06)', () => {
  // `partners/ADR-0011` : les deux contrôles jugent les MÊMES entrées par les deux gardes.
  const ENTREES = [
    { chemin: 'prisma/migrations/0001_index/migration.sql', contenu: "WHERE statut IN ('provisoire','active')" },
    { chemin: 'src/server/x.ts', contenu: "if (s === 'provisoire' || s === 'active') return;" },
  ];

  it('REQ-DM-003 : gov:check ne porte PLUS la famille des listes d’états — ni dans FAMILLES, ni au verdict', () => {
    expect(FAMILLES.map((f) => f.nom)).not.toContain('liste_litterale_d_etats');
    for (const e of ENTREES) {
      expect(familles(avecFichier(e.chemin, e.contenu)), e.chemin).not.toContain(
        'liste_litterale_d_etats'
      );
    }
  });

  it('REQ-DM-003 : sur la même entrée, la seule implémentation rougit — la clause IN comme la forme booléenne', () => {
    for (const e of ENTREES) {
      expect(
        controlerVocabulaire({ ...VUE_VOCABULAIRE, code: [e] }).map((f) => f.famille),
        e.chemin
      ).toEqual(['liste_litterale_d_etats']);
    }
  });
});

describe('GOV-030 — synonymes interdits du glossaire', () => {
  it('REQ-INT-004 : les synonymes se LISENT dans le glossaire — amputé, il n’en garde plus', () => {
    const sansQualificateur: Vue = {
      ...VUE_CONFORME,
      glossaire: VUE_CONFORME.glossaire.replace('`qualificateur`', '`un_autre_terme`'),
      fichiers: [
        ...VUE_CONFORME.fichiers,
        { chemin: 'src/roles.ts', contenu: "const r = 'qualificateur';" },
      ],
    };
    expect(familles(sansQualificateur)).not.toContain('synonyme_interdit_du_glossaire');
  });

  it('REQ-INT-004 : un synonyme déclaré SOUS CONDITION n’est pas exercé, et la garde le DIT', () => {
    const conditionnels = synonymesDuGlossaire(VUE_CONFORME.glossaire).filter((s) => !s.exerce);
    expect(conditionnels.map((s) => s.terme)).toContain('actif');
    expect(decisionDeLaGarde(VUE_CONFORME, PORTEE).lignes.join('\n')).toMatch(
      /NON exercé[^\n]*actif/
    );
  });
});

describe('GOV-030 — les sources, et les fixtures ÉGALES aux sources réelles', () => {
  it('REQ-INT-004 : les fixtures de la preuve rendent ce que les sources réelles rendent', () => {
    const reel = vueDuDepot();
    expect(racinesDuGlossaire(VUE_CONFORME.glossaire)).toEqual(racinesDuGlossaire(reel.glossaire));
    expect(modelesRefusesDAxionia(VUE_CONFORME.reqInt004, VUE_CONFORME.glossaire).sort()).toEqual(
      modelesRefusesDAxionia(reel.reqInt004, reel.glossaire).sort()
    );
    expect(typesEvenementDeLaReq(VUE_CONFORME.reqInt004).sort()).toEqual(
      typesEvenementDeLaReq(reel.reqInt004).sort()
    );
    expect([...VUE_CONFORME.typesDuContrat].sort()).toEqual([...TYPES_EVENEMENT].sort());
    // Les deux termes que `docs/gates.json` nomme, et que la garde doit donc savoir lire.
    expect(synonymesDuGlossaire(reel.glossaire).filter((s) => s.exerce).map((s) => s.terme)).toEqual(
      expect.arrayContaining(['qualificateur', 'payment.received'])
    );
  });

  it('REQ-INT-004 : le contrat du dépôt et l’exigence disent la même chose', () => {
    expect([...TYPES_EVENEMENT].sort()).toEqual(
      typesEvenementDeLaReq(vueDuDepot().reqInt004).sort()
    );
  });

  it('REQ-DM-003 : le périmètre est LU dans l’en-tête du glossaire — quatre racines', () => {
    expect(racinesDuGlossaire(vueDuDepot().glossaire)).toEqual([
      'prisma/',
      'src/',
      'messages/',
      'docs/adr/',
    ]);

    const ampute = vueDuDepot().glossaire.replace(', `docs/adr/**`', '');
    expect(racinesDuGlossaire(ampute)).not.toContain('docs/adr/');
  });
});

describe('GOV-030 — le périmètre a UNE définition, et tout ce qui s’imprime en dérive', () => {
  it('REQ-INT-004 : la vue du dépôt porte TOUS les fichiers suivis', () => {
    const suivis = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
    expect(vueDuDepot().fichiers.length).toBe(suivis.length);
  });

  it('REQ-INT-004 : le périmètre est une partition des suivis, extension comprise', () => {
    const vue = vueDuDepot();
    const p = perimetreDeLaVue(vue);
    expect(p.lus.length + p.horsPerimetre.length).toBe(vue.fichiers.length);
    // Un fichier suivi du paquet de contrats dont l'extension n'accorde aucune grammaire : LU.
    expect(p.lus.map((f) => f.chemin)).toContain('packages/contracts/contracts.sha256');
  });

  it('REQ-INT-004 : les comptes imprimés sont ceux de la partition, racines vides nommées', () => {
    const vue = vueDuDepot();
    const p = perimetreDeLaVue(vue);
    const sortie = decisionDeLaGarde(vue, PORTEE).lignes.join('\n');
    expect(sortie).toContain(
      `Périmètre : ${p.lus.length} fichier(s) lu(s) sur ${vue.fichiers.length} suivi(s) — ` +
        p.parRacine.map((r) => `${r.racine} ${r.lus.length}`).join(', ')
    );
    expect(sortie).toContain(`Hors périmètre : ${p.horsPerimetre.length} fichier(s) suivi(s)`);

    // La vue conforme ne lit qu'un fichier sous `src/` : les quatre autres racines sont VIDES.
    expect(decisionDeLaGarde(VUE_CONFORME, PORTEE).lignes.join('\n')).toContain(
      'Racine(s) VIDE(S) : prisma/, messages/, docs/adr/, packages/contracts/'
    );
  });

  it('REQ-DM-003 : la portée de la famille des états est celle qu’on lui DONNE, jamais retapée', () => {
    const sortie = decisionDeLaGarde(VUE_CONFORME, {
      racines: ['messages', 'docs'],
      extensions: ['md'],
    }).lignes.join('\n');
    expect(sortie).toContain(
      'qui lit messages/, docs/ en .md. Racine(s) de cette garde hors de cette portée : ' +
        'prisma/, src/, packages/contracts/ —'
    );
  });
});

describe('GOV-030 — la preuve : population jusqu’au témoin, décision PURE', () => {
  const registre = (): string => readFileSync('docs/gates.json', 'utf8');
  const DECLARES = {
    familles: FAMILLES.map((f) => f.nom),
    refus: REFUS_DE_CONCLURE,
    temoins: TEMOINS.map((t) => t.id),
  };
  const entrees = () => ({
    temoins: TEMOINS,
    contreTemoins: CONTRE_TEMOINS,
    registre: registre(),
    familles: DECLARES.familles,
    refus: DECLARES.refus,
  });

  it('sur le registre réel la décision est 0, et `--prove` sort de CETTE décision', () => {
    const decision = decisionDeLaPreuve(entrees());
    expect(decision.code, decision.lignes.join('\n')).toBe(0);
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(decision.lignes[0]);
  });

  it('RÉCIPROQUE, sur TOUS les témoins : en retirer un découvre SA clé et rend 1', () => {
    const population = populationDuRegistre(registre());
    expect(population.temoins).toHaveLength(TEMOINS.length);
    for (const t of TEMOINS) {
      const reste = TEMOINS.filter((x) => x !== t);
      const { manque } = ecartsDePopulation(
        population,
        { ...DECLARES, temoins: reste.map((x) => x.id) },
        reste
      );
      expect(manque, `retirer « ${t.id} » doit découvrir sa clé`).toContain(t.id);
      expect(decisionDeLaPreuve({ ...entrees(), temoins: reste }).code, t.id).toBe(1);
    }
  });

  it('une famille retirée du CODE seul rend 1 en la NOMMANT', () => {
    const [retiree, ...reste] = DECLARES.familles;
    const decision = decisionDeLaPreuve({ ...entrees(), familles: reste });
    expect(decision.code).toBe(1);
    expect(decision.lignes.join('\n')).toContain(`au registre seulement : ${retiree}`);
  });

  it('un refus retiré du REGISTRE seul rend ses témoins ORPHELINS', () => {
    const population = populationDuRegistre(registre());
    const [retire, ...reste] = population.refus;
    const ecarts = ecartsDePopulation({ ...population, refus: reste }, DECLARES, TEMOINS);
    expect(ecarts.orphelins.join('\n')).toContain(cleDeCouverture('source_illisible', retire));
    expect(ecarts.divergences.join('\n')).toContain(`dans le code seulement : ${retire}`);
  });

  it('un registre muet, en double ou illisible est un REFUS, jamais une population vide', () => {
    const muet = JSON.stringify({ gates: [{ id: 'gov:check', verifie: 'termes interdits' }] });
    expect(() => populationDuRegistre(muet)).toThrow(/ne nomme aucun/);
    const double = JSON.stringify({
      gates: [
        { id: 'gov:check', verifie: 'x' },
        { id: 'gov:check', verifie: 'y' },
      ],
    });
    expect(() => populationDuRegistre(double)).toThrow(/2 entrée/);

    const illisible = decisionDeLaPreuve({ ...entrees(), registre: new Error('ENOENT') });
    expect(illisible.code).toBe(1);
    expect(illisible.lignes.join('\n')).toContain('ILLISIBLE');
  });

  it('un témoin qui ne MORD pas ne couvre rien : vue muette, autre famille, AUTRE REFUS', () => {
    const muet: Temoin = { id: 'muet', famille: 'synonyme_interdit_du_glossaire', quoi: 'muet', vue: () => VUE_CONFORME };
    const autreFamille: Temoin = {
      id: 'autre_famille',
      famille: 'synonyme_interdit_du_glossaire',
      quoi: 'rougit pour une autre famille',
      vue: temoin('modele_dans_le_code').vue,
    };
    // Même famille, refus différent : ce contrat perd des noms mais n'est pas VIDE.
    const autreRefus: Temoin = {
      id: 'autre_refus',
      famille: 'source_illisible',
      refus: 'contrat_sans_evenement',
      quoi: 'rougit pour un autre refus',
      vue: temoin('contrat_et_exigence_divergents').vue,
    };
    for (const t of [muet, autreFamille, autreRefus]) {
      const rapport = eprouver([t]);
      expect(rapport.couvertes.size, t.quoi).toBe(0);
      expect(rapport.sansMorsure, t.quoi).toEqual([t]);
    }
    const decision = decisionDeLaPreuve({ ...entrees(), temoins: [...TEMOINS, autreRefus] });
    expect(decision.code).toBe(1);
    expect(decision.lignes.join('\n')).toContain('(autre_refus) n\'a PAS fait rougir');
  });

  it('un contre-témoin qui rougit rend 1 : faux positif nommé', () => {
    const decision = decisionDeLaPreuve({
      ...entrees(),
      contreTemoins: [...CONTRE_TEMOINS, { quoi: 'appât', vue: temoin('modele_dans_le_code').vue }],
    });
    expect(decision.code).toBe(1);
    expect(decision.lignes.join('\n')).toContain('Faux positif : « appât »');
  });

  it('zéro témoin ne couvre RIEN — la population du registre reste entière', () => {
    const population = populationDuRegistre(registre());
    const { manque } = ecartsDePopulation(population, DECLARES, []);
    expect(manque).toHaveLength(
      population.familles.length + population.refus.length + population.temoins.length
    );
  });
});

describe('GOV-030 — la garde : décision PURE, et sortie vue en 1 sur un arbre fautif', () => {
  it('REQ-INT-004 : une vue fautive rend 1, la vue du dépôt rend 0', () => {
    expect(decisionDeLaGarde(temoin('modele_dans_le_code').vue(), PORTEE).code).toBe(1);
    const reel = decisionDeLaGarde(vueDuDepot(), PORTEE);
    expect(reel.code, reel.lignes.join('\n')).toBe(0);
    const { code, sortie } = lancer();
    expect(code).toBe(0);
    expect(sortie).toContain(reel.lignes[0]);
  });

  it('REQ-INT-004 : dépôt jetable — 0 sans faute, 1 avec, invoquée avec ou sans extension', () => {
    const depot = mkdtempSync(join(tmpdir(), 'temoin-termes-'));
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const garde = (script: string) => {
      const r = spawnSync(process.execPath, [tsx, script], { cwd: depot, encoding: 'utf8' });
      return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    };
    try {
      execFileSync('git', ['init', '-q'], { cwd: depot });
      for (const f of ['docs/GLOSSAIRE.md', 'docs/requirements.json']) {
        mkdirSync(join(depot, dirname(f)), { recursive: true });
        writeFileSync(join(depot, f), readFileSync(f, 'utf8'));
      }
      mkdirSync(join(depot, 'src'), { recursive: true });
      writeFileSync(join(depot, 'src/rien.ts'), 'export const rien = true;\n');
      execFileSync('git', ['add', '-A'], { cwd: depot });

      // Contrôle positif : sans lui, un harnais cassé rendrait un 1 lu comme « la garde a vu ».
      const propre = garde(resolve(SCRIPT));
      expect(propre.code, propre.sortie).toBe(0);

      mkdirSync(join(depot, 'docs/adr'), { recursive: true });
      writeFileSync(join(depot, 'docs/adr/0099-appat.md'), 'le producteur emet payment.received\n');
      execFileSync('git', ['add', '-A'], { cwd: depot });

      for (const script of [resolve(SCRIPT), resolve(SCRIPT).replace(/\.ts$/, '')]) {
        const fautif = garde(script);
        expect(fautif.code, `${script}\n${fautif.sortie}`).toBe(1);
        expect(fautif.sortie).toContain('[evenement_hors_nomenclature] docs/adr/0099-appat.md:1');
      }
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  }, 180_000);
});
