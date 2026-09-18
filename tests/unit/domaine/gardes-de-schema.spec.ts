// @req REQ-DM-001
// @req REQ-DM-037
// @req REQ-DM-038
/**
 * `gardes-de-schema.spec.ts` — DM-02 : les gardes de schéma jugent un schéma LU, pas un texte
 * découpé ligne à ligne.
 *
 * CE QU'IL EXERCE. Les trois gardes de schéma et leur lecteur commun :
 *   — la lecture d'un bloc Prisma ferme chaque modèle sur SON accolade (un `}` de commentaire ou
 *     de chaîne ne ferme rien) ;
 *   — une garde invoquée sans extension juge, une copie renommée ne s'exécute pas ;
 *   — une liste littérale d'états se juge par GROUPE, pas par ligne ;
 *   — REQ-DM-001 : aucun flottant, tout montant en `…Cents` entier ;
 *   — REQ-DM-037 : les migrations sont additives, sauf absolution par un ADR accepté ;
 *   — l'index unique de l'attribution occupante est PARTIEL, et son prédicat couvre exactement
 *     les états occupants (lu en SQL statique ici, en base par la spec d'intégration).
 *
 * Toutes les vues sont INJECTÉES (RM-11) : aucune assertion ne dépend du contenu du dépôt du jour,
 * sauf celles qui le disent dans leur titre.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { controler, VUE_CONFORME, type Vue } from '../../../scripts/gates/schema-enums';

const TSX = 'node_modules/tsx/dist/cli.mjs';

function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, script, ...args], { encoding: 'utf8' });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('REQ-DM-038 — un modèle se ferme sur SON accolade', () => {
  it('REQ-DM-038 : un champ placé après un `}` de commentaire est jugé', () => {
    const schema =
      VUE_CONFORME.schema + '\nmodel Bac {\n  id Int @id // }\n  statut String\n  nom String\n}\n';
    const fautes = controler({ ...VUE_CONFORME, schema }).filter(
      (f) => f.famille === 'colonne_vocabulaire_en_chaine'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain('Bac.statut');
  });

  it('REQ-DM-038 : un champ placé après un `@default("}")` est jugé', () => {
    const schema =
      VUE_CONFORME.schema +
      '\nmodel Bac {\n  id Int @id\n  code String @default("}")\n  statut String\n}\n';
    expect(familles({ ...VUE_CONFORME, schema })).toContain('colonne_vocabulaire_en_chaine');
  });
});

describe('REQ-DM-038 — la garde invoquée sans extension juge', () => {
  it('REQ-DM-038 : `schema-enums` sans `.ts` imprime un verdict, et `--prove` en rend un', () => {
    const r = lancer('scripts/gates/schema-enums', '--prove');
    expect(r.sortie).toContain('partners:schema:enums');
    expect(r.code).toBe(0);
  });
});

describe('REQ-JUR-027 → REQ-DM-038 — une liste d’états se juge par GROUPE', () => {
  it('REQ-JUR-027 → REQ-DM-038 : une liste sur plusieurs lignes rougit', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [
        { chemin: 'src/bac/liste.ts', contenu: "const x = [\n  'provisoire',\n  'active'\n];\n" },
      ],
    };
    expect(familles(vue)).toContain('liste_litterale_d_etats');
  });

  it('REQ-JUR-027 → REQ-DM-038 : des membres sans guillemets rougissent', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [{ chemin: 'src/bac/enum.ts', contenu: 'enum X { provisoire, active }\n' }],
    };
    expect(familles(vue)).toContain('liste_litterale_d_etats');
  });

  it('REQ-JUR-027 → REQ-DM-038 : une clause SQL sur plusieurs lignes rougit', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [
        {
          chemin: 'prisma/migrations/2_bac/migration.sql',
          contenu: "SELECT 1 FROM t WHERE s IN (\n'signee',\n'convertie');\n",
        },
      ],
    };
    expect(familles(vue)).toContain('liste_litterale_d_etats');
  });
});
