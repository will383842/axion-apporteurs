/**
 * lire-yaml.ts — LA lecture d'un workflow par un vrai analyseur YAML, celui qu'embarque Prettier
 * (déjà épinglé). Aucun effet à l'import.
 *
 * Elle vivait DANS `aucune-gate-en-continue-on-error.spec.ts` ; la spécification de `req:check`
 * (`tests/unit/qualite/req-check.spec.ts`) en avait besoin à son tour pour juger la place d'une étape.
 * Un fichier de spécification ne s'importe pas (ses `describe` s'enregistreraient deux fois) : la
 * lecture est sortie ici plutôt que recopiée une troisième fois. `gardes-transposees.spec.ts` en
 * porte encore une copie — dette écrite, pas refermée ici.
 *
 * Les ancres, alias, étiquettes et clés de fusion sont REFUSÉS (levée) : `<<: *desarme` ferait
 * porter à une étape une clé écrite ailleurs.
 */
import { parsers as analyseursYaml } from 'prettier/plugins/yaml';

/** Un nœud de l'arbre que rend l'analyseur YAML embarqué par Prettier (déjà épinglé). */
interface NoeudYaml {
  readonly type: string;
  readonly value?: string;
  readonly anchor?: unknown;
  readonly tag?: unknown;
  readonly children?: readonly (NoeudYaml | null)[];
}

export function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Un workflow lu comme la forge le lit : un OBJET. YAML n'ordonne pas les clés, et une clé écrite
 * dans un mapping entre accolades est une clé comme une autre. Les ancres, alias, étiquettes et clés
 * de fusion sont REFUSÉS (levée) : `<<: *desarme` ferait porter à une étape une clé écrite ailleurs.
 */
export async function lireYaml(texte: string): Promise<unknown> {
  const options = { originalText: texte };
  return valeurYaml((await analyseursYaml.yaml.parse(texte, options as never)) as NoeudYaml);
}

function valeurYaml(n: NoeudYaml | null | undefined): unknown {
  if (n === null || n === undefined) return null;
  if ((n.anchor ?? null) !== null || (n.tag ?? null) !== null) {
    throw new Error(`YAML : ancre ou étiquette refusée (${n.type})`);
  }
  const enfants = n.children ?? [];
  switch (n.type) {
    case 'root':
      if (enfants.length !== 1) throw new Error('YAML : un fichier porte un seul document');
      return valeurYaml(enfants[0]);
    case 'document':
      return valeurYaml(enfants[1]);
    case 'documentBody':
    case 'mappingValue':
    case 'sequenceItem':
    case 'flowSequenceItem':
      return valeurYaml(enfants[0]);
    case 'sequence':
    case 'flowSequence':
      return enfants.map(valeurYaml);
    case 'mapping':
    case 'flowMapping': {
      const objet: Record<string, unknown> = {};
      for (const item of enfants) {
        const [cle, valeur] = item?.children ?? [];
        const nom = valeurYaml(cle?.children?.[0]);
        if (typeof nom !== 'string' || nom === '<<' || Object.hasOwn(objet, nom)) {
          throw new Error(`YAML : clé refusée (${String(nom)})`);
        }
        objet[nom] = valeurYaml(valeur);
      }
      return objet;
    }
    case 'plain':
    case 'quoteDouble':
    case 'quoteSingle':
    case 'blockLiteral':
    case 'blockFolded':
      return n.value ?? '';
    default:
      throw new Error(`YAML : nœud « ${n.type} » refusé`);
  }
}
