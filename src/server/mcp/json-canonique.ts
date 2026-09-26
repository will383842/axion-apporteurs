/**
 * JSON canonique et empreinte — port à l'identique de `axion-ops/core/adapter-kit/json.ts`
 * (INT-T11, REQ-INT-026), par l'intermédiaire du port d'axionia (`src/server/mcp/json-canonique.ts`).
 *
 * L'empreinte d'un manifeste que le socle épingle est calculée sur CE texte. Une différence d'un
 * octet (ordre des clés, `undefined` avalé, nombre non fini rendu `null`) et l'empreinte diverge
 * sans que personne ne sache pourquoi. D'où un sérialiseur qui trie les clés et qui LÈVE sur ce que
 * `JSON.stringify` ferait disparaître en silence.
 */
import { createHash } from 'node:crypto';

export type ValeurJson =
  null | boolean | number | string | readonly ValeurJson[] | { readonly [cle: string]: ValeurJson };

export type ObjetJson = { readonly [cle: string]: ValeurJson };

export function canoniser(valeur: ValeurJson): string {
  if (valeur === null) return 'null';
  switch (typeof valeur) {
    case 'boolean':
      return valeur ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(valeur)) {
        throw new Error(
          `JSON canonique : nombre non fini (${String(valeur)}). ` +
            "`JSON.stringify` l'écrirait `null` sans un mot."
        );
      }
      return JSON.stringify(valeur);
    case 'string':
      return JSON.stringify(valeur);
    default:
      break;
  }
  if (Array.isArray(valeur)) {
    return `[${(valeur as readonly ValeurJson[]).map(canoniser).join(',')}]`;
  }
  const objet = valeur as ObjetJson;
  const morceaux: string[] = [];
  for (const cle of Object.keys(objet).sort()) {
    const sousValeur = objet[cle];
    if (sousValeur === undefined) {
      throw new Error(
        `JSON canonique : la clé « ${cle} » porte \`undefined\`. ` +
          '`JSON.stringify` la ferait DISPARAÎTRE du texte, donc de l’empreinte.'
      );
    }
    morceaux.push(`${JSON.stringify(cle)}:${canoniser(sousValeur)}`);
  }
  return `{${morceaux.join(',')}}`;
}

export function octetsCanoniques(valeur: ValeurJson): number {
  return Buffer.byteLength(canoniser(valeur), 'utf8');
}

export function empreinteCanonique(valeur: ValeurJson): string {
  return `sha256:${createHash('sha256').update(canoniser(valeur), 'utf8').digest('hex')}`;
}

/**
 * Ramène une valeur quelconque à du JSON pur, en REFUSANT ce qui rendrait deux lectures
 * différentes : un prototype étranger ou un `toJSON()` que la sérialisation honore et que la
 * validation de forme ne voit pas.
 */
export function versValeurJson(valeur: unknown, ou = 'valeur'): ValeurJson {
  if (valeur !== null && typeof valeur === 'object') {
    const prototype: unknown = Object.getPrototypeOf(valeur);
    if (prototype !== null && prototype !== Object.prototype && !Array.isArray(valeur)) {
      throw new Error(`${ou} : l'objet ne descend pas d'Object.prototype.`);
    }
    if (typeof (valeur as { toJSON?: unknown }).toJSON === 'function') {
      throw new Error(
        `${ou} : l'objet porte un toJSON() — l'empreinte ne couvrirait pas ce qui est lu.`
      );
    }
  }
  let texte: string | undefined;
  try {
    texte = JSON.stringify(valeur);
  } catch (erreur) {
    throw new Error(`${ou} : non sérialisable en JSON (cycle, BigInt, ou autre).`, {
      cause: erreur,
    });
  }
  if (texte === undefined) {
    throw new Error(`${ou} : ne produit aucun JSON (\`undefined\`, fonction ou symbole).`);
  }
  return JSON.parse(texte) as ValeurJson;
}
