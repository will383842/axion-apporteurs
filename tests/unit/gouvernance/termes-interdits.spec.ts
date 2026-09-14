// @req REQ-DM-003
// @req REQ-INT-004
/**
 * `termes-interdits.spec.ts` — le contrôle de la garde `gov:check` (GOV-030).
 *
 * POURQUOI CE FICHIER EXISTE. `docs/gates.json` déclare depuis GOV-000 une garde de TERMES
 * INTERDITS dont le script `scripts/gates/gov-check.ts` n'existait pas, et aucun autre script ne
 * faisait ce travail. SIX DOCUMENTS du dépôt s'appuyaient dessus — `docs/GLOSSAIRE.md`,
 * `docs/CONVENTIONS.md`, `docs/REGLES-MAISON.md` (RM-01 et RM-06), `packages/contracts/events.ts`,
 * REQ-GOV-001 et la vue `docs/GATES.md`. Ce fichier est ce qui rend la garde opposable.
 *
 * CE QU'IL EXERCE, ET DANS QUEL SENS.
 *   1. une DÉRIVATION (RM-01) : ni les sept noms d'événements, ni les synonymes interdits ne sont
 *      tapés dans la garde. Ils se lisent dans REQ-INT-004, dans `docs/GLOSSAIRE.md` et dans
 *      `packages/contracts`. Les tests de renversement prouvent que c'est une LECTURE : sur une
 *      source modifiée, l'attendu se déplace ;
 *   2. la GRAMMAIRE qui décide où une citation est possible — lue sur le fichier, l'inconnu
 *      n'exemptant rien —, et les deux cas EXTÉRIEURS à `--prove` : la prose hors citation rougit,
 *      et un gabarit de chaîne n'exempte rien ;
 *   3. la POPULATION DE LA PREUVE, qui vient du registre et pas du module jugé, confrontée dans les
 *      DEUX sens, avec l'assertion RÉCIPROQUE : retirer un témoin DÉCOUVRE sa clé ;
 *   4. l'UNICITÉ de la famille `liste_litterale_d_etats` (REQ-DM-003, RM-06) : elle a UNE
 *      implémentation, chez GOV-006 (`partners/ADR-0011`), et cette garde-ci ne la double PAS.
 *
 * ⚠️ CE QUI N'EST PAS ICI, ET POURQUOI. Un cas que `--prove` porte déjà — témoin ou contre-témoin —
 * n'est pas restaté : le dernier bloc de population lance `--prove` et assère son code, donc une
 * mutation qui fait tomber le témoin fait tomber ce contrôle-là. La même entrée écrite deux fois
 * fait tomber DEUX contrôles pour une seule panne : c'est la définition de la redondance, pas celle
 * d'une seconde mesure. Onze restitutions sont parties au premier tour ; au second, celles que la
 * correction des évasions avait recopiées ici (guillemet droit en JSON, accent grave en SQL et en
 * Prisma, span de prose borné, qualification pointée, refus nommés) sont parties à leur tour, et
 * vivent dans `TEMOINS` et `CONTRE_TEMOINS`, où `--prove` les juge.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  controler,
  typesEvenementDeLaReq,
  modelesRefusesDAxionia,
  synonymesDuGlossaire,
  racinesDuGlossaire,
  grammaireDuFichier,
  populationDuRegistre,
  cleDeCouverture,
  ecartsDePopulation,
  eprouver,
  FAMILLES,
  REFUS_DE_CONCLURE,
  TEMOINS,
  VUE_CONFORME,
  vueDuDepot,
  type Vue,
} from '../../../scripts/gates/gov-check';
import {
  controler as controlerVocabulaire,
  VUE_CONFORME as VUE_VOCABULAIRE,
} from '../../../scripts/gates/schema-enums';
import { TYPES_EVENEMENT } from '../../../packages/contracts/events';

const SCRIPT = 'scripts/gates/gov-check.ts';
/** L'accent grave, posé par son code : l'écrire fermerait le littéral. */
const AG = String.fromCharCode(96);

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** La garde lancée UNE fois sur le dépôt réel : trois contrôles lisent la même sortie. */
let surLeDepot: { code: number; sortie: string } | undefined;
const garde = (): { code: number; sortie: string } => (surLeDepot ??= lancer());

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

  it('REQ-INT-004 : un nom en anglais et un nom valide ne rougissent pas la même famille', () => {
    // Un témoin qui bouge pour DEUX raisons ne discrimine rien : les deux familles sont exclusives.
    const anglais = familles(avecFichier('docs/adr/0011-temoin.md', 'devis.signed'));
    expect(anglais).toContain('evenement_hors_nomenclature');
    expect(anglais).not.toContain('evenement_litteral_hors_contrat');
  });
});

describe('REQ-DM-003 — la famille des listes d’états a UNE SEULE implémentation (RM-06)', () => {
  /**
   * ⚠️ CE BLOC A CHANGÉ DE SENS, et c'est un REVIREMENT consigné : `partners/ADR-0011`.
   *
   * `gov:check` portait `liste_litterale_d_etats` au seuil DEUX pendant que
   * `partners:schema:enums` (GOV-006) la portait au seuil TROIS — même nom de famille, même job
   * `gate-a`, et des verdicts OPPOSÉS sur la même entrée. Les deux restaient vertes parce que
   * `src/` ne porte que trois fichiers : la divergence était SILENCIEUSE. Les deux contrôles
   * ci-dessous jugent les MÊMES entrées par les deux gardes : une seule rend un verdict.
   */
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
    // Le discriminant est la COUVERTURE, pas l'opérateur : sans la seconde entrée, il suffirait
    // de réécrire la clause d'index en comparaisons pour verdir la garde. Un verdict qui bascule
    // sur l'opérateur est un oracle, pas une règle.
    for (const e of ENTREES) {
      expect(
        controlerVocabulaire({ ...VUE_VOCABULAIRE, code: [e] }).map((f) => f.famille),
        e.chemin
      ).toEqual(['liste_litterale_d_etats']);
    }
  });
});

describe('GOV-030 — l’exemption de citation se lit sur la GRAMMAIRE du fichier', () => {
  it('la grammaire est LUE sur le fichier, et l’inconnu n’exempte rien', () => {
    expect(grammaireDuFichier('src/a.ts')).toBe('code');
    expect(grammaireDuFichier('messages/fr.json')).toBe('valeurs');
    expect(grammaireDuFichier('docs/adr/0001.md')).toBe('prose');
    expect(grammaireDuFichier('prisma/migrations/0001/migration.sql')).toBe('commentaire_sql');
    expect(grammaireDuFichier('prisma/schema.prisma')).toBe('commentaire_slash');
    // Le sens qui échoue FERMÉ : une extension qu'on n'a pas prévue ne gagne pas une exemption
    // par omission — et le YAML non plus, faute de contre-témoin atteignable dans les racines.
    expect(grammaireDuFichier('messages/fr.inconnu')).toBe('valeurs');
    expect(grammaireDuFichier('messages/fr.yml')).toBe('valeurs');
  });

  it('PROSE : hors des accents graves, le même document rougit', () => {
    // Sans cette assertion, l'exemption de citation pourrait être une garde éteinte plutôt qu'une
    // exemption : un témoin qui ne rougit jamais ne prouve pas qu'il sait distinguer.
    const usage = 'le producteur emet payment.received puis invoice.issued';
    expect(familles(avecFichier('docs/adr/0008-contrat-evenements.md', usage))).toContain(
      'evenement_hors_nomenclature'
    );
  });

  it('CODE : les accents graves DÉLIMITENT un gabarit de chaîne et n’exemptent rien', () => {
    const gabarit = `const sujet = ${AG}payment.received${AG};`;
    expect(familles(avecFichier('src/server/emetteur.ts', gabarit))).toContain(
      'evenement_hors_nomenclature'
    );
  });
});

describe('GOV-030 — synonymes interdits du glossaire', () => {
  it('REQ-INT-004 : les synonymes se LISENT dans le glossaire — amputé, il n’en garde plus', () => {
    const sansQualificateur: Vue = {
      ...VUE_CONFORME,
      // On remplace le terme DANS LA SOURCE : si la garde le lisait ailleurs — ou le portait en
      // dur — le fichier témoin ci-dessous rougirait quand même.
      glossaire: VUE_CONFORME.glossaire.replace('`qualificateur`', '`un_autre_terme`'),
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
  it('REQ-DM-003 : les fixtures de la preuve lisent comme les SOURCES RÉELLES du dépôt', () => {
    // ⚠️ SANS CE TEST, LA PREUVE POURRAIT ÊTRE VERTE SUR UNE GRAMMAIRE QUI N'EXISTE PLUS.
    // `--prove` ne juge que des vues injectées (RM-11), donc ses fixtures REPRODUISENT les
    // tournures des sources. Le jour où le glossaire réécrit sa clause, la garde cesserait de
    // rien dériver et resterait verte des deux côtés : ici on confronte les deux lectures.
    const reel = vueDuDepot();
    expect(racinesDuGlossaire(reel.glossaire)).toEqual(racinesDuGlossaire(VUE_CONFORME.glossaire));
    expect(modelesRefusesDAxionia(reel.reqInt004, reel.glossaire)).toEqual(
      expect.arrayContaining(['Invoice', 'Refund', 'PaymentScheduleProfile'])
    );
    const reels = synonymesDuGlossaire(reel.glossaire);
    // Les deux termes que `docs/gates.json` nomme, et que la garde doit donc savoir lire.
    expect(reels.filter((s) => s.exerce).map((s) => s.terme)).toEqual(
      expect.arrayContaining(['qualificateur', 'payment.received'])
    );
  });

  it('REQ-INT-004 : le contrat du dépôt et l’exigence disent la même chose', () => {
    // Si les deux divergeaient, la garde condamnerait `packages/contracts` ou l'inverse.
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

    // Renversement : la clause réécrite déplace le périmètre. Sans cette assertion, une liste
    // tapée en dur passerait — et c'est précisément la faute que RM-01 nomme.
    const ampute = vueDuDepot().glossaire.replace(', `docs/adr/**`', '');
    expect(racinesDuGlossaire(ampute)).not.toContain('docs/adr/');
  });

  it('REQ-DM-003 : hors du périmètre, la garde ne juge pas — et elle le DIT', () => {
    // Un contre-témoin qui vaut aveu : `docs/REQUIREMENTS.md` porte aujourd'hui des termes que le
    // glossaire refuse (`WebhookRecu`, `eventId`), et la garde ne les voit pas parce que l'en-tête
    // du glossaire arrête son périmètre à quatre racines. Ce n'est pas « rien à signaler » : la
    // sortie imprime le nombre de fichiers laissés dehors.
    const dehors = avecFichier('docs/REQUIREMENTS.md', 'WebhookRecu {source, eventId, …}');
    expect(controler(dehors)).toEqual([]);
    expect(garde().sortie).toMatch(/Hors périmètre : \d+ fichier\(s\)/);
  });

  it('GOV-030 : elle DIT aussi la famille qu’elle ne tient plus, et où celle-ci est passée', () => {
    // Une famille déplacée en silence est une racine perdue en silence. La sortie nomme les trois
    // racines que GOV-006 ne balaie pas, plutôt que de laisser croire à une couverture.
    expect(garde().sortie).toMatch(/Hors famille[\s\S]*partners:schema:enums/);
  });
});

describe('GOV-030 — la preuve ne peut pas être sa propre POPULATION', () => {
  const registre = () => populationDuRegistre(readFileSync('docs/gates.json', 'utf8'));
  const DECLARES = { familles: FAMILLES.map((f) => f.nom), refus: REFUS_DE_CONCLURE };

  it('une famille retirée du CODE seul est NOMMÉE — le compte attendu ne suit plus le compte imprimé', () => {
    // ⚠️ LE DÉFAUT QUE CE TEST FERME. Le compte attendu et le compte imprimé venaient tous deux
    // de `FAMILLES` : retirer une entrée la sortait DU MÊME COUP de l'obligation d'avoir un
    // témoin. La soustraction restait vide par construction, et `--prove` sortait vert.
    const [retiree, ...reste] = DECLARES.familles;
    const { divergences } = ecartsDePopulation(registre(), { ...DECLARES, familles: reste }, TEMOINS);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toContain(`au registre seulement : ${retiree}`);
  });

  it('une entrée retirée du REGISTRE seul rend ses témoins ORPHELINS — la population ne rétrécit plus en silence', () => {
    // L'autre sens. Sans lui, le registre pouvait perdre un refus : la population attendue
    // rétrécissait, le témoin de ce refus restait vert, et personne ne l'exigeait plus.
    const population = registre();
    const [retire, ...reste] = population.refus;
    const ecarts = ecartsDePopulation({ ...population, refus: reste }, DECLARES, TEMOINS);
    expect(ecarts.orphelins.join('\n')).toContain(cleDeCouverture('source_illisible', retire));
    expect(ecarts.divergences.join('\n')).toContain(`dans le code seulement : ${retire}`);
  });

  it('un registre qui ne nomme RIEN est un REFUS, jamais une population vide', () => {
    const muet = JSON.stringify({
      gates: [{ id: 'gov:check', verifie: 'termes interdits, sans plus de detail' }],
    });
    expect(() => populationDuRegistre(muet)).toThrow(/ne nomme aucun/);

    // Et un identifiant en double n'est pas « la première entrée » : c'est un refus.
    const double = JSON.stringify({
      gates: [
        { id: 'gov:check', verifie: 'x' },
        { id: 'gov:check', verifie: 'y' },
      ],
    });
    expect(() => populationDuRegistre(double)).toThrow(/2 entrée/);
  });

  it('RÉCIPROQUE : retirer un témoin DÉCOUVRE sa clé — un témoin ne couvre que la sienne', () => {
    // ⚠️ LE DÉFAUT QUE CE TEST FERME. L'ensemble couvert était nourri par TOUTES les fautes de
    // TOUS les témoins : le témoin `racines: []` produisait incidemment un `perimetre_vide`, qui
    // suffisait à déclarer cette famille « couverte » alors que SON témoin avait été supprimé.
    const population = registre();
    const cles = TEMOINS.map((t) => cleDeCouverture(t.famille, t.refus));
    const uniques = TEMOINS.filter((_, i) => cles.filter((c) => c === cles[i]).length === 1);
    expect(uniques.length).toBeGreaterThan(0);
    for (const t of uniques) {
      const { manque } = ecartsDePopulation(population, DECLARES, TEMOINS.filter((x) => x !== t));
      expect(manque, `retirer « ${t.quoi} » doit découvrir sa clé`).toContain(
        cleDeCouverture(t.famille, t.refus)
      );
    }
  });

  it('un témoin qui ne MORD pas ne couvre rien — pas même par la faute d’une autre famille', () => {
    // ⚠️ LA RÉCIPROQUE CI-DESSUS NE SUFFIT PAS, et c'est mesuré : elle RETIRE le témoin, donc sa clé
    // disparaît quoi que fasse `eprouver`. Rendre la morsure toujours vraie la laissait verte. Ici
    // le témoin reste, et c'est sa morsure qu'on juge — sur une vue muette, puis sur une vue qui
    // rougit pour une AUTRE famille que la sienne.
    const muet = { famille: 'synonyme_interdit_du_glossaire', quoi: 'muet', vue: () => VUE_CONFORME };
    const incident = {
      famille: 'synonyme_interdit_du_glossaire',
      quoi: 'rougit pour une autre famille',
      vue: () => avecFichier('src/server/facture.ts', 'const f: Invoice = lire();'),
    };
    for (const t of [muet, incident]) {
      const rapport = eprouver([t]);
      expect(rapport.couvertes.size, t.quoi).toBe(0);
      expect(rapport.sansMorsure, t.quoi).toEqual([t]);
    }
  });

  it('zéro témoin ne couvre RIEN — la population du registre reste entière, jamais vide', () => {
    const population = registre();
    const { manque } = ecartsDePopulation(population, DECLARES, []);
    expect(manque).toHaveLength(population.familles.length + population.refus.length);
  });

  it('chaque entrée de la population du registre rougit sur son témoin dans `--prove`', () => {
    const { code, sortie } = lancer('--prove');
    expect(sortie).toBeTruthy();
    expect(code).toBe(0);
    // ⚠️ LE COMPTE EST CONFRONTÉ AU REGISTRE, jamais à `FAMILLES.length` : deux côtés qui bougent
    // ensemble ne mesurent rien.
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces).toHaveLength(registre().familles.length);
  });
});

describe('GOV-030 — la garde tourne sur le dépôt, et elle y est verte', () => {
  it('`gov-check.ts` sort en 0 sur l’état du dépôt', () => {
    const { code, sortie } = garde();
    expect(sortie).toBeTruthy();
    expect(code).toBe(0);
  });

  it('elle MESURE quelque chose : le périmètre est imprimé avec son compte, et il n’est pas nul', () => {
    const { sortie } = garde();
    const m = /(\d+) fichier\(s\) balay/.exec(sortie);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    // `src/` est vide en phase −1 : la garde doit le DIRE, sans quoi « 0 fichier » se lirait
    // comme « aucun défaut ».
    expect(sortie).toMatch(/src\//);
  });
});
