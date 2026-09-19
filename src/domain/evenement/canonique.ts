/**
 * La forme canonique d'un enregistrement du journal — DM-01 (REQ-DM-024, partners/ADR-0014 décision 1).
 *
 * UN HASH NE VAUT QUE SI L'OCTET-À-OCTET SE REPRODUIT DES ANNÉES PLUS TARD. `JSON.stringify` ne le
 * garantit pas : l'ordre des clés suit l'ordre d'insertion, qui dépend du code qui a construit
 * l'objet — et une charge relue depuis une colonne `jsonb` revient dans l'ordre de Postgres, pas
 * dans celui de l'écrivain. Deux versions du même service produiraient deux hashes pour le même
 * événement, et la chaîne deviendrait invérifiable sans que rien ne le dise.
 *
 * PORTAGE, PAS IMPORT : la source est `axionia/src/server/qualiopi/emargement/canonical.ts`, dans un
 * autre dépôt. Sous-ensemble de RFC 8785 (JSON Canonicalization Scheme) : clés triées par point de
 * code UTF-16, aucun espace, chaînes échappées par `JSON.stringify`.
 *
 * TOUT CE QUI N'EST PAS CANONICALISABLE DE FAÇON CERTAINE LÈVE, au lieu d'être coercé en silence.
 * Un `undefined` avalé, un flottant arrondi ou une `Date` sérialisée implicitement produiraient un
 * hash plausible mais faux — le pire résultat pour une preuve. Seuls les entiers sûrs sont admis
 * (`-0` devient `0`) : la représentation textuelle d'un flottant n'est pas stable. Le chemin de la
 * valeur fautive est dans le message.
 *
 * Domaine pur : aucune I/O, aucune horloge.
 */

/** Levée quand une valeur ne peut pas être canonicalisée de façon déterministe. */
export class ErreurCanonicalisation extends Error {
  constructor(chemin: string, raison: string) {
    super(`Valeur non canonicalisable en « ${chemin || '(racine)'} » : ${raison}`);
    this.name = 'ErreurCanonicalisation';
  }
}

function serialiser(valeur: unknown, chemin: string): string {
  if (valeur === null) return 'null';

  switch (typeof valeur) {
    case 'string':
      return JSON.stringify(valeur);
    case 'boolean':
      return valeur ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(valeur)) {
        throw new ErreurCanonicalisation(
          chemin,
          "seuls les entiers sûrs sont admis (un flottant n'a pas de représentation textuelle stable)"
        );
      }
      // `Object.is(-0, 0)` est faux, mais les deux doivent produire le même hash.
      return String(valeur === 0 ? 0 : valeur);
    case 'undefined':
      throw new ErreurCanonicalisation(
        chemin,
        '`undefined` est ambigu — écrire `null` explicitement'
      );
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new ErreurCanonicalisation(chemin, `type « ${typeof valeur} » non sérialisable`);
  }

  if (Array.isArray(valeur)) {
    return `[${valeur.map((v, i) => serialiser(v, `${chemin}[${i}]`)).join(',')}]`;
  }

  // Objet SIMPLE uniquement. `Map`, `Set`, `Date`, `RegExp`, `Buffer`… n'ont pas de clés propres
  // énumérables (ou en ont d'indexées) : `Object.keys` les réduirait tous à `{}`, donc à la MÊME
  // empreinte. Une `Date` exige la conversion explicite `toISOString()` chez l'appelant, pour que
  // le format horodaté soit visible dans le code qui construit l'enregistrement.
  const proto: unknown = Object.getPrototypeOf(valeur);
  if (proto !== Object.prototype && proto !== null) {
    throw new ErreurCanonicalisation(
      chemin,
      `${Object.prototype.toString.call(valeur)} — seuls les objets simples et les tableaux sont ` +
        'canonicalisables (une Date se convertit par toISOString())'
    );
  }

  const objet = valeur as Record<string, unknown>;
  const paires = Object.keys(objet)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${serialiser(objet[k], chemin ? `${chemin}.${k}` : k)}`);
  return `{${paires.join(',')}}`;
}

/**
 * Sérialise une valeur en JSON canonique : clés triées, aucun espace.
 *
 * @throws {ErreurCanonicalisation} si une valeur n'est pas canonicalisable.
 */
export function canonique(valeur: unknown): string {
  return serialiser(valeur, '');
}
