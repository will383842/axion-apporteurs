/**
 * La charte des agents et le gabarit de PR, exercés comme des tests (GOV-007).
 *
 * @req REQ-GOV-010
 * @req REQ-GOV-011
 * @req REQ-GOV-012
 * @req REQ-GOV-013
 *
 * POURQUOI CE FICHIER EXISTE. `docs/tasks.json` mappe les quatre exigences de GOV-007 sur ce
 * chemin. Sans lui, la clôture de phase du gardien du spec — « chaque REQ a un test annoté,
 * existant et vert » — échouait sur les quatre, et REQ-GOV-012 était enfreinte par la livraison
 * qui l'institue : la garde qu'elle exige n'avait jamais été vue rougir.
 *
 * ⚠️ `vitest.config.ts` a dû être élargi à `tests/gov/**` : son `include` ne portait que
 * `tests/unit/**`, et un test qui ne tourne pas ne garde rien.
 *
 * DEUX SORTES D'ASSERTIONS ICI, et elles ne se remplacent pas :
 *   1. ce que la garde `gov:pr` prouve d'elle-même (`--prove`) : chaque famille de règle rougit
 *      sur son témoin, et les contre-témoins restent verts ;
 *   2. ce que le TEXTE des documents doit porter, lu directement — parce qu'une garde qui lirait
 *      sa propre exigence dans le même fichier ne prouverait rien.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const GARDE = 'scripts/gates/gov-pr.ts';
const gabarit = readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8');
const codeowners = readFileSync('.github/CODEOWNERS', 'utf8');
const charte = readFileSync('docs/CHARTE-AGENTS.md', 'utf8');
const conventions = readFileSync('docs/CONVENTIONS.md', 'utf8');

function section(texte: string, debut: string, fin: string): string {
  const d = texte.indexOf(debut);
  const f = fin === '' ? -1 : texte.indexOf(fin, d + debut.length);
  return d < 0 ? '' : texte.slice(d, f < 0 ? undefined : f);
}

function occurrences(texte: string, aiguille: string): number {
  return texte.split(aiguille).length - 1;
}

function bloc(texte: string, nom: string): string {
  const ouvre = `<!-- ${nom}:debut -->`;
  const ferme = `<!-- ${nom}:fin -->`;
  const d = texte.indexOf(ouvre);
  const f = texte.indexOf(ferme);
  expect(d, `marqueur ${nom}:debut absent`).toBeGreaterThanOrEqual(0);
  expect(f, `marqueur ${nom}:fin absent`).toBeGreaterThan(d);
  return texte.slice(d + ouvre.length, f);
}

describe('gov:pr — la garde livrée avec GOV-007', () => {
  it('est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer(GARDE);
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-012 : sait rougir — chaque famille a son témoin, les contre-témoins restent verts', () => {
    // C'est CE test qui tient RM-02 pour cette tâche : une garde qui n'a jamais été vue rougir
    // n'existe pas. Le mode --prove échoue lui-même si une famille n'a pas de témoin, ou si un
    // contre-témoin rougit — il refuse aussi de partir d'un dépôt déjà fautif.
    //
    // Aucun nombre n'est épinglé ici. Un total recopié dans un test redevient faux dès qu'une
    // famille est ajoutée, et c'est arrivé : la scission de `dod_incomplete` a fait rougir ce
    // test sur « 15 » alors que rien n'était cassé. On vérifie l'ACCORD entre la phrase de
    // verdict et la liste imprimée — ce que le nombre était censé garder.
    const { code, sortie } = lancer(GARDE, '--prove');
    expect(code).toBe(0);
    const familles = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(familles.length).toBeGreaterThan(0);
    expect(sortie).toContain(`Les ${familles.length} familles rougissent`);
    expect(sortie).toMatch(/\d+ contre-témoins restent verts/);

    // La huitième case du gabarit atteste la fusion : elle ne peut pas être cochée à
    // l'événement `pull_request`. Les deux familles doivent donc rester distinctes.
    expect(familles.join(' ')).toContain('dod_incomplete');
    expect(familles.join(' ')).toContain('dod_non_cochee');
  });

  it('REQ-GOV-011 : la famille qui refuse un auteur devenu son propre relecteur est prouvée', () => {
    const { sortie } = lancer(GARDE, '--prove');
    expect(sortie).toContain('relecteur_est_auteur');
  });
});

describe('REQ-GOV-010 — droits exclusifs, chemins réservés, label du rôle', () => {
  it('REQ-GOV-010 : la charte donne un code `A` + deux chiffres à chaque fiche de .claude/agents/, et à elle seule', () => {
    const fiches = readdirSync('.claude/agents').filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
    const lignes = section(charte, '## 2.', '## 3.')
      .split('\n')
      .map((l) => /^\|\s*(A\d{2})\s*\|\s*`([a-z0-9-]+)`\s*\|/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null);
    expect(lignes.map((m) => m[2]).sort()).toEqual([...fiches].sort());
    const codes = lignes.map((m) => m[1]!);
    expect(new Set(codes).size, 'deux postes ne peuvent pas porter le même code').toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^A[0-9]{2}$/); // scripts/lot/tasks.schema.json
  });

  it('REQ-GOV-010 : chaque chemin réservé de docs/CONVENTIONS.md §8 est repris au §7 de la charte', () => {
    // La charte est une VUE (RM-01) : elle ne doit ni oublier un chemin de sa source, ni en
    // inventer un sans dire d'où il vient. Le §7 a été livré tronqué au premier tour — c'est
    // exactement ce que ce test attrape.
    const source = section(conventions, '## 8. Fichiers réservés', '');
    const cheminsSource = [...source.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1]!)
      .filter((c) => c.includes('/') || c.endsWith('.md') || c.endsWith('.json'))
      .filter((c) => !c.startsWith('pnpm ') && !c.startsWith('gardien-spec') && !c.startsWith('architecte'));
    const cible = section(charte, '## 7.', '## 8.');
    expect(cheminsSource.length).toBeGreaterThan(5);
    for (const chemin of cheminsSource) {
      expect(cible, `le §7 de la charte ne reprend pas ${chemin}`).toContain(chemin);
    }
  });

  it('REQ-GOV-010 : le tableau §7 donne un label de rôle ou l’interdit explicitement, jamais rien', () => {
    const lignes = section(charte, '## 7.', '## 8.')
      .split('\n')
      .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l) && !/Chemin réservé/.test(l));
    expect(lignes.length).toBeGreaterThanOrEqual(8);
    for (const l of lignes) {
      const label = l.split('|').slice(1, -1)[2]!.replace(/`/g, '').trim();
      expect(label, `ligne sans label ni interdiction : ${l.slice(0, 60)}`).toMatch(/^(role:[a-z-]+|schema|—)$/);
    }
  });

  it('REQ-GOV-010 : .github/CODEOWNERS nomme prisma/ et packages/contracts/, et aucun code de poste', () => {
    // Un CODEOWNERS qui écrit @A02 est INOPÉRANT : GitHub marque « Unknown owner » et ignore la
    // règle entière, sans le dire. C'est la ligne exigée par l'acceptation de GOV-007.
    const regles = codeowners
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .map((l) => l.split(/\s+/));
    for (const [chemin, ...proprietaires] of regles) {
      expect(proprietaires.length, `${chemin} n'a aucun propriétaire`).toBeGreaterThan(0);
      for (const p of proprietaires) expect(p).not.toMatch(/^@A\d{2}$/);
    }
    const chemins = regles.map((r) => r[0]!.replace(/^\//, ''));
    expect(chemins).toContain('prisma/');
    expect(chemins).toContain('packages/contracts/');
  });
});

describe('REQ-GOV-011 — relecteur ≠ auteur, lentilles, section Attaque', () => {
  it('REQ-GOV-011 : le gabarit porte Auteur, Relecteur, Couvre et la section Attaque ancrée', () => {
    expect(gabarit).toMatch(/^Auteur:\s*A__$/m);
    expect(gabarit).toMatch(/^Relecteur:\s*A__ exactitude/m);
    expect(gabarit).toMatch(/^Couvre:/m);
    expect(bloc(gabarit, 'attaque').trim().length).toBeGreaterThan(0);
  });

  it('REQ-GOV-011 : la charte dérive de la fiche architecte la lentille que le label `schema` déplace', () => {
    // La fiche est la SOURCE : elle écrit que l'architecte REMPLACE une lentille. Une charte qui
    // en AJOUTERAIT une changerait le nombre d'avis exigés sans que personne ne l'ait décidé.
    const fiche = readFileSync('.claude/agents/architecte.md', 'utf8');
    const attendu = /\b(première|deuxième|troisième|quatrième|cinquième)\s+lentille/i.exec(fiche);
    expect(attendu, 'la fiche architecte ne dit plus quelle lentille il tient').not.toBeNull();
    for (const m of charte.matchAll(/\b(première|deuxième|troisième|quatrième|cinquième)\s+lentille/gi)) {
      expect(m[1]!.toLowerCase()).toBe(attendu![1]!.toLowerCase());
    }
    expect(charte).toContain('remplace la troisième lentille');
  });

  it('REQ-GOV-011 : la charte prévoit une suppléance pour le poste privé de Bash, qui ne peut pas produire un ROUGE', () => {
    // A07 tient la charte relationnelle et n'a pas `Bash` : sans suppléance, le seul poste qui
    // porte cette règle ne peut ouvrir aucune PR qui la durcit, puisque le gabarit exige un ROUGE.
    const suppleances = section(charte, '**Les suppléances.**', '> **Ce que la suppléance');
    expect(suppleances).toContain('A07');
    expect(suppleances).toContain('A10');
    expect(gabarit).toContain('Rouge constaté par:');
  });
});

describe('REQ-GOV-012 — ROUGE avant VERT', () => {
  it('REQ-GOV-012 : le gabarit porte le bloc ROUGE/VERT et sa ligne « Rouge constaté par: »', () => {
    const b = bloc(gabarit, 'rouge-vert');
    expect(b).toMatch(/^ROUGE\s*:/m);
    expect(b).toMatch(/^VERT\s*:/m);
    expect(b).toMatch(/^Rouge constaté par:\s*A__$/m);
    expect(b).toContain('verbatim');
  });

  it('REQ-GOV-012 : le gabarit avertit que le corps d’une PR est public et qu’aucune garde ne le lit', () => {
    // `gov:publication` n'inspecte que les fichiers SUIVIS PAR GIT. Un message d'échec collé
    // verbatim dans une PR est publié sans qu'aucune garde puisse le voir.
    expect(gabarit).toContain('PUBLIC');
    expect(gabarit).toContain('«valeur en configuration»');
  });
});

describe('REQ-GOV-013 — la définition de « terminé »', () => {
  it('REQ-GOV-013 : huit cases entre les marqueurs dod, et aucune case ailleurs dans le gabarit', () => {
    const dedans = occurrences(bloc(gabarit, 'dod'), '- [ ]');
    const partout = occurrences(gabarit, '- [ ]') + occurrences(gabarit, '- [x]');
    expect(dedans).toBe(8);
    expect(partout, 'une case hors du bloc dod fausse le compte : la règle maison est un CHAMP').toBe(8);
  });

  it('REQ-GOV-013 : chaque marqueur apparaît exactement une fois — un commentaire HTML ne s’imbrique pas', () => {
    // Le premier jet écrivait les délimiteurs À L'INTÉRIEUR du commentaire d'en-tête : celui-ci se
    // refermait au premier, le reste s'affichait en clair dans chaque PR, et chaque marqueur
    // existait en double. Une garde ancrée sur la première occurrence lisait alors un bloc vide.
    for (const m of ['dod:debut', 'dod:fin', 'rouge-vert:debut', 'rouge-vert:fin', 'attaque:debut', 'attaque:fin', 'regle-maison:debut', 'regle-maison:fin']) {
      expect(occurrences(gabarit, `<!-- ${m} -->`), `marqueur ${m}`).toBe(1);
    }
  });

  it('REQ-GOV-013 : la règle maison est un champ, pas une neuvième case', () => {
    expect(bloc(gabarit, 'regle-maison')).toMatch(/Règle maison appliquée:/);
    expect(bloc(gabarit, 'regle-maison')).not.toContain('- [ ]');
  });
});
