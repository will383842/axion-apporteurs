/**
 * GOV-140 — écrire une sortie ENTIÈRE, puis sortir. `console.log(gros); process.exit(0)` tronque la
 * sortie quand stdout est un pipe (Linux, CI) : `process.exit` n'attend pas que le pipe soit vidé, et
 * tout ce qui dépasse le tampon du noyau (64 Ko) est perdu. Le rapport de `gov:inventaire --rapport`
 * dépasse 146 Ko : lu par un pipe, son JSON arrivait coupé et illisible.
 *
 * Module pur (aucun point d'entrée), hors de `scripts/gates/` pour `gov:conventions`.
 */
export function ecrireEtSortir(texte: string, code = 0): void {
  process.stdout.write(texte.endsWith('\n') ? texte : `${texte}\n`, () => process.exit(code));
}
