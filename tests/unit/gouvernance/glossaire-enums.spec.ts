// @req REQ-DM-003
// @req REQ-GOV-016
// @req REQ-JUR-027
//
// REQ-JUR-027 est ABSORBÉE par REQ-DM-038 (annexe de dédoublonnage, GOV-001) : le texte en
// vigueur est celui de REQ-DM-038 — « toute colonne dont le nom contient statut, type, motif,
// resultat, etat, origine, kind ou palier est un enum Prisma ». L'identifiant est conservé parce
// que `docs/tasks.json` le cite ; c'est le même contrôle, exercé ici par la famille
// `colonne_vocabulaire_en_chaine`.
/**
 * `glossaire-enums.spec.ts` — le contrôle que `docs/GLOSSAIRE.md` n'avait pas.
 *
 * POURQUOI CE FICHIER EXISTE. Le glossaire est écrit depuis GOV-006 et personne ne le lisait :
 * `docs/PRESEANCE.md` §2 lui donne la primauté sur un terme et ses synonymes interdits, mais
 * aucune garde n'allait le chercher. Le fichier l'avouait lui-même — « tant que GOV-006 n'a pas
 * livré `glossaire-enums.spec.ts`, cette liste est une consigne, pas un contrôle ». Un paragraphe
 * de ce même fichier a d'ailleurs annoncé pendant des semaines l'inverse de ce que
 * `packages/contracts` produit, sans que rien ne rougisse.
 *
 * CE QU'IL EXERCE, ET DANS QUEL SENS. Trois choses, qui ne se confondent pas :
 *   1. une DÉRIVATION (RM-01) : les sept états occupants ne sont tapés nulle part deux fois. Ils se
 *      lisent dans le texte de REQ-DM-003, et tout le reste — la colonne « Occupant ? » du
 *      glossaire, la constante `ETATS_OCCUPANTS` — doit s'y ramener. Les tests de renversement
 *      ci-dessous prouvent que c'est une LECTURE : sur un texte modifié, l'attendu se déplace ;
 *   2. un CONTRÔLE de schéma (REQ-GOV-016, REQ-JUR-027 → REQ-DM-038) : une colonne de vocabulaire
 *      en `String`, une valeur d'enum absente du glossaire, un repli muet ;
 *   3. l'ACCEPTATION de la tâche, mot à mot : 13 états d'attribution, `EvenementRecu`, « Déposer »
 *      retenu contre « Déclarer », rôle `qualifieur`, `ETATS_OCCUPANTS` à 7 états.
 *
 * CE QU'IL NE FAIT PAS. Il ne lance aucun client Prisma et ne valide pas le schéma au sens de
 * `prisma validate` : le dépôt ne porte pas encore la dépendance. La garde lit le fichier comme un
 * texte, ce qui suffit à ce qu'elle juge — un nom de colonne, un type, une valeur d'enum.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  controler,
  etatsOccupantsDeLaReq,
  etatsDuGlossaire,
  enumsDuGlossaire,
  enumsDuSchema,
  texteDeLaReq,
  FAMILLES,
  VUE_CONFORME,
  vueDuDepot,
  type Vue,
} from '../../../scripts/gates/schema-enums';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';

const SCRIPT = 'scripts/gates/schema-enums.ts';
const GLOSSAIRE = 'docs/GLOSSAIRE.md';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par une vue — l'unité de mesure de tout ce fichier. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

const glossaire = () => readFileSync(GLOSSAIRE, 'utf8');

describe('REQ-DM-003 — les sept états occupants sont DÉRIVÉS, jamais recopiés', () => {
  it('REQ-DM-003 : la liste se lit dans le texte de l’exigence, elle n’est pas tapée', () => {
    const derives = etatsOccupantsDeLaReq(texteDeLaReq('REQ-DM-003'));
    expect(derives).toHaveLength(7);

    // La preuve que c'est une lecture et non un littéral : on retire un état d'une COPIE du texte,
    // et la dérivation doit le perdre. Sans cette assertion, un tableau écrit en dur passerait.
    const ampute = texteDeLaReq('REQ-DM-003').replace(', figee_resiliation}', '}');
    expect(etatsOccupantsDeLaReq(ampute)).toHaveLength(6);
    expect(etatsOccupantsDeLaReq(ampute)).not.toContain('figee_resiliation');
  });

  it('REQ-DM-003 : `ETATS_OCCUPANTS` est égale à la dérivation, à l’ordre près', () => {
    // RM-06 : la constante est le SEUL littéral du dépôt ; ce test est ce qui la tient égale à sa
    // source. Le jour où l'exigence bouge, c'est ici que ça rougit — pas en production.
    expect([...ETATS_OCCUPANTS].sort()).toEqual(
      etatsOccupantsDeLaReq(texteDeLaReq('REQ-DM-003')).sort()
    );
    expect(ETATS_OCCUPANTS).toHaveLength(7);
  });

  it('REQ-DM-003 : la colonne « Occupant ? » du glossaire rend exactement ces sept états', () => {
    const occupants = etatsDuGlossaire(glossaire())
      .filter((e) => e.occupant)
      .map((e) => e.valeur);
    expect(occupants.sort()).toEqual([...ETATS_OCCUPANTS].sort());
  });

  it('REQ-DM-003 : un glossaire qui déclare un occupant de plus fait rougir `glossaire_divergent`', () => {
    const truque = glossaire().replace('(REQ-UX-023) | non', '(REQ-UX-023) | **oui**');
    expect(familles({ ...vueDuDepot(), glossaire: truque })).toContain('glossaire_divergent');
  });
});

describe('REQ-GOV-016 — le glossaire porte ce que l’acceptation de GOV-006 exige', () => {
  it('REQ-GOV-016 : treize états d’attribution, pas douze ni quatorze', () => {
    expect(etatsDuGlossaire(glossaire())).toHaveLength(13);
  });

  it('REQ-GOV-016 : `EvenementRecu` est le nom unique de la table de réception', () => {
    const t = glossaire();
    expect(t).toContain('`EvenementRecu`');
    expect(t).toContain('`WebhookRecu`'); // nommé comme synonyme INTERDIT, pas comme option
  });

  it('REQ-GOV-016 : « Déposer » est retenu, « Déclarer » est interdit', () => {
    const t = glossaire();
    expect(t).toMatch(/\*\*«\s*Déposer\s*»\*\* est le terme retenu/);
    expect(t).toMatch(/\*\*«\s*Déclarer\s*»\*\* est \*\*interdit\*\*/);
  });

  it('REQ-GOV-016 : le rôle est `qualifieur`, et `qualificateur` est nommé interdit', () => {
    const roles = enumsDuGlossaire(glossaire()).get('ConsoleRole');
    expect(roles).toContain('qualifieur');
    expect(roles).not.toContain('qualificateur');
    expect(glossaire()).toContain('`qualificateur`');
  });

  it('REQ-GOV-016 : toute valeur d’enum du schéma figure au glossaire', () => {
    const auGlossaire = glossaire();
    for (const [nom, valeurs] of enumsDuSchema(readFileSync('prisma/schema.prisma', 'utf8'))) {
      for (const v of valeurs) {
        expect(auGlossaire, nom + '.' + v + ' manque au glossaire').toContain('`' + v + '`');
      }
    }
  });
});

describe('REQ-JUR-027 → REQ-DM-038 — un vocabulaire est un enum, jamais une chaîne', () => {
  it('REQ-JUR-027 : `statut String` dans le schéma fait rougir `colonne_vocabulaire_en_chaine`', () => {
    const schema =
      VUE_CONFORME.schema + '\nmodel Essai {\n  id     String @id\n  statut String\n}\n';
    expect(familles({ ...VUE_CONFORME, schema })).toEqual(['colonne_vocabulaire_en_chaine']);
  });

  it('REQ-JUR-027 : le même champ en enum ne rougit pas — sinon la garde interdirait la solution', () => {
    const schema =
      VUE_CONFORME.schema + '\nmodel Essai {\n  id     String @id\n  statut EtatAttribution\n}\n';
    expect(familles({ ...VUE_CONFORME, schema })).toEqual([]);
  });

  it('REQ-JUR-027 : un repli qui retombe sur la valeur brute déguise la faute, et rougit', () => {
    const code = [
      { chemin: 'src/ui/libelles.ts', contenu: 'const l = LIBELLES[statut] ?? statut;' },
    ];
    expect(familles({ ...VUE_CONFORME, code })).toEqual(['repli_muet']);
  });
});

describe('REQ-GOV-016 — chaque famille rougit sur son témoin', () => {
  it('la vue conforme est verte : sans ce contre-témoin, tout le reste ne prouve rien', () => {
    expect(controler(VUE_CONFORME)).toEqual([]);
  });

  it('valeur_hors_glossaire — une valeur d’enum que le glossaire ne connaît pas', () => {
    const schema = VUE_CONFORME.schema + '\nenum Divers {\n  valeur_inventee\n}\n';
    expect(familles({ ...VUE_CONFORME, schema })).toContain('valeur_hors_glossaire');
  });

  it('enum_divergent_du_glossaire — le schéma perd une valeur que le glossaire énumère', () => {
    const schema = VUE_CONFORME.schema.replace('  convertie\n', '');
    expect(familles({ ...VUE_CONFORME, schema })).toContain('enum_divergent_du_glossaire');
  });

  it('etats_occupants_divergents — la constante ne suit plus l’exigence', () => {
    const etatsSource = VUE_CONFORME.etatsSource.replace("'convertie',", "'convertie', 'perdue',");
    expect(familles({ ...VUE_CONFORME, etatsSource })).toContain('etats_occupants_divergents');
  });

  it('liste_litterale_d_etats — une liste d’états recopiée hors de sa source unique (RM-06)', () => {
    const code = [
      {
        chemin: 'src/server/attribution/requete.ts',
        contenu: "WHERE statut IN ('provisoire','active','signee')",
      },
    ];
    expect(familles({ ...VUE_CONFORME, code })).toEqual(['liste_litterale_d_etats']);
  });

  it('liste_litterale_d_etats — la SOURCE unique, elle, a le droit de la porter', () => {
    // Le contre-témoin qui empêche la garde d'interdire la solution qu'elle exige.
    const code = [
      {
        chemin: 'src/domain/attribution/etats.ts',
        contenu: "['provisoire','active','signee']",
      },
    ];
    expect(familles({ ...VUE_CONFORME, code })).toEqual([]);
  });

  it('source_illisible — l’exigence ne donne plus la liste : c’est un ROUGE, pas un vert', () => {
    // Ne pas avoir pu lire n'est jamais une conformité : sans la source, la garde ne sait plus
    // ce qu'elle compare, et un tableau vide passerait toutes les égalités.
    expect(
      familles({ ...VUE_CONFORME, reqDm003: 'Au plus une attribution occupante par SIREN.' })
    ).toEqual(['source_illisible']);
  });

  it('les familles déclarées ont chacune un témoin dans la preuve de la garde', () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('Les ' + FAMILLES.length + ' familles rougissent');
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces.length).toBe(FAMILLES.length);
  });
});

describe('REQ-GOV-016 — la garde tourne sur le dépôt, et elle y est verte', () => {
  it('`pnpm partners:schema:enums` sort en 0 sur l’état du dépôt', () => {
    const { code, sortie } = lancer();
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('elle MESURE quelque chose : le schéma du dépôt lui donne des enums à juger', () => {
    // Un zéro admet deux explications — « rien à redire » ou « je ne lis rien ». Le témoin
    // positif : la vue du dépôt porte des valeurs d'enum réelles, et les treize états en font
    // partie. Sans lui, une garde qui ne trouverait aucun fichier serait verte aussi.
    const enums = enumsDuSchema(vueDuDepot().schema);
    expect(enums.get('EtatAttribution')).toHaveLength(13);
    expect([...enums.keys()].length).toBeGreaterThan(1);
  });
});
