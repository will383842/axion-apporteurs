// @req REQ-GOV-021
// @req REQ-GOV-003
/**
 * LES ATTRIBUTIONS SE CONFRONTENT À LEURS SOURCES (GOV-037).
 *
 * Les témoins et les contre-témoins vivent dans la garde (`TEMOINS`, `CONTRE_TEMOINS`), jugés par
 * `prouver()` : le premier test l'appelle pour que `vitest` voie la même preuve que Gate A, sans
 * seconde copie des cas. Le reste exige le dépôt RÉEL, que `--prove` ne lit pas :
 *
 *   — la garde lit ses sources EN ENTIER : chaque registre, chaque fichier suivi de `scripts/` et
 *     `tests/`, chaque entrée du journal, chaque chaîne de `docs/gates.json` à toute profondeur ;
 *   — toute tâche qui porte un lot est jugée ou exemptée, aucune n'est sautée ;
 *   — elle ne lit QUE des fichiers suivis, et refuse en se NOMMANT une source absente, tronquée,
 *     mal formée ou qui n'est pas du texte UTF-8.
 *
 * Ce qu'elle ne voit pas est écrit une seule fois, dans l'en-tête de la garde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import {
  analyser,
  chargerSources,
  entreesDeJournal,
  prouver,
  SourceIllisible,
} from '../../../scripts/gates/gov-attributions';

const lireReel = (chemin: string) => readFileSync(chemin, 'utf8');
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('REQ-GOV-021 et REQ-GOV-003 — chaque famille rougit sur son témoin, chaque exemption a son contre-témoin', () => {
  it('`--prove` rend 0 : juges éprouvés, aucune famille sans témoin, aucune nature d’exemption qu’aucun contre-témoin ne rende', () => {
    const p = prouver();
    expect(p.code, p.lignes.join('\n')).toBe(0);
  });
});

describe('REQ-GOV-021 — sur le dépôt réel, la garde lit ses sources EN ENTIER et ne trouve aucune attribution rompue', () => {
  const brut = (chemin: string, cle: string): number =>
    ((JSON.parse(lireReel(chemin)) as Record<string, unknown[]>)[cle] ?? []).length;

  it('chaque registre est lu en entier — ÉGALITÉ avec le fichier relu ici, pas un plancher', () => {
    const s = chargerSources(fichiersSuivis());
    expect(s.taches.length, 'des tâches ont été perdues au chargement').toBe(brut('docs/tasks.json', 'taches'));
    expect(s.exigences.length, 'des exigences ont été perdues au chargement').toBe(brut('docs/requirements.json', 'exigences'));
    expect(s.gates.length, 'des gates ont été perdues au chargement').toBe(brut('docs/gates.json', 'gates'));
    expect(s.postes.length, 'des postes ont été perdus au chargement').toBe(brut('docs/agents.json', 'postes'));
    expect(s.taches.length, 'le registre des tâches est vide : l’égalité ne prouverait rien').toBeGreaterThan(0);
  });

  it('les en-têtes : TOUT fichier suivi de scripts/ et tests/, chacun sur ses vingt premières lignes', () => {
    const suivis = fichiersSuivis();
    const s = chargerSources(suivis);
    // L'acceptance dit « tout fichier suivi de scripts/ et tests/ » et « ses vingt premières lignes » :
    // ce sont ses termes, pas une recopie de la garde.
    const attendus = suivis.filter((f) => f.startsWith('scripts/') || f.startsWith('tests/'));
    expect(attendus.length, 'aucun fichier suivi sous scripts/ ni tests/ : l’égalité ne prouverait rien').toBeGreaterThan(0);
    expect(s.entetes.map((e) => e.fichier)).toEqual(attendus);
    for (const e of s.entetes) {
      expect(e.lignes, `${e.fichier} n'est pas lu sur ses vingt premières lignes`).toEqual(
        lireReel(e.fichier).split('\n').slice(0, 20)
      );
    }
  });

  it('le journal : chaque entrée de chaque fichier SUIVI, et le plancher lu dans le README', () => {
    const suivis = fichiersSuivis();
    const s = chargerSources(suivis);
    const titres = suivis
      .filter((f) => f.startsWith('docs/journal/') && f.endsWith('.md') && f !== 'docs/journal/README.md')
      .flatMap((f) => (lireReel(f).match(/^## PR #\d+/gm) ?? []).map((t) => t.slice(t.lastIndexOf('#') + 1)));
    expect(titres.length, 'aucune entrée de journal : l’égalité ne prouverait rien').toBeGreaterThan(0);
    expect([...entreesDeJournal(s.journal).keys()].sort()).toEqual([...new Set(titres)].sort());
    const plancher = /\*\*> (\d+)\*\*/.exec(lireReel('docs/journal/README.md'));
    expect(plancher, 'le README du journal ne porte plus son plancher').not.toBeNull();
    expect(s.plancherJournal).toBe(Number(plancher![1]));
  });

  it('le dépôt tel qu’il est ne porte aucune attribution rompue', () => {
    const { fautes } = analyser(chargerSources(fichiersSuivis()));
    expect(fautes.map((f) => `[${f.famille}] ${f.message}`)).toEqual([]);
  });

  it('toute tâche qui porte un lot est attestée par l’entrée de sa PR, ou EXEMPTÉE sous son lot — aucune n’est sautée', () => {
    const s = chargerSources(fichiersSuivis());
    const { exemptions } = analyser(s);
    const entrees = entreesDeJournal(s.journal);
    const avecLot = s.taches.filter((t) => t.lot);
    expect(avecLot.length, 'aucune tâche ne porte de lot : rien ne serait confronté').toBeGreaterThan(0);
    const sautees = avecLot
      .filter((t) => !(t.pr != null && (entrees.get(String(t.pr)) ?? '').includes(t.lot as string)))
      .filter((t) => !exemptions.some((e) => e.tache === t.id && e.site.includes(`« ${t.lot} »`)));
    expect(
      sautees.map((t) => `${t.id} (lot ${t.lot}, pr ${t.pr})`),
      'une attribution de lot écrite n’est ni attestée, ni exemptée : elle est tue'
    ).toEqual([]);
  });

  it('toute CHAÎNE d’une entrée de docs/gates.json est lue, à toute profondeur — chaque champ, sous chaque forme que le registre réel lui donne', () => {
    const s = chargerSources(fichiersSuivis());
    const ids = new Set(s.taches.map((t) => t.id));
    // Un identifiant de la FORME d'une tâche réelle, qui ne résout pas : dérivé, jamais tapé.
    let inconnu = (s.taches.find((t) => /[0-9]/.test(t.id)) as { id: string }).id.replace(/[0-9]+/, '9');
    while (ids.has(inconnu)) inconnu = inconnu.replace('9', '99');

    // Les couples (champ, forme) tels que le registre RÉEL les porte : un champ ajouté demain y entre seul.
    const formes = new Map<string, { gate: (typeof s.gates)[number]; champ: string }>();
    for (const gate of s.gates) {
      for (const [champ, valeur] of Object.entries(gate)) {
        const forme = Array.isArray(valeur) ? 'tableau' : valeur === null ? 'nul' : typeof valeur;
        if (!formes.has(`${champ}|${forme}`)) formes.set(`${champ}|${forme}`, { gate, champ });
      }
    }
    const injecter = (valeur: unknown): unknown =>
      typeof valeur === 'string'
        ? `${valeur} ${inconnu}`
        : Array.isArray(valeur)
          ? [...valeur, inconnu]
          : valeur !== null && typeof valeur === 'object'
            ? { ...valeur, sonde: inconnu }
            : undefined;
    const portees = [...formes].filter(([, { gate, champ }]) => injecter(gate[champ]) !== undefined);
    expect(portees.length, 'aucun champ de docs/gates.json ne porte de chaîne : rien ne serait éprouvé').toBeGreaterThan(0);

    const aveugles: string[] = [];
    for (const [cle, { gate, champ }] of portees) {
      const sonde = { ...gate, [champ]: injecter(gate[champ]) };
      const { fautes } = analyser({ ...s, gates: [sonde] });
      const vue = fautes.some(
        (f) =>
          f.message.includes(inconnu) &&
          (f.famille === 'mention_non_resolue'
            ? f.message.includes(`docs/gates.json:${sonde.id}.${champ}`)
            : champ === 'tache' && f.famille === 'gate_tache_inconnue')
      );
      if (!vue) aveugles.push(cle);
    }
    expect(aveugles, `« ${inconnu} » posé dans ces champs n’a fait rougir personne`).toEqual([]);
  });
});

describe('REQ-GOV-021 — la garde ne lit QUE des sources suivies, et refuse en se NOMMANT', () => {
  const octets = (chemin: string) => readFileSync(chemin);

  it('un journal présent sur le disque mais absent des fichiers SUIVIS ne compte pas : refus nommé', () => {
    // La liste des fichiers suivis est amputée du journal alors que le disque le porte toujours :
    // une lecture du disque le retrouverait.
    const sansJournal = fichiersSuivis().filter((f) => !f.startsWith('docs/journal/') || f === 'docs/journal/README.md');
    expect(() => chargerSources(sansJournal)).toThrow(SourceIllisible);
    // Le refus de la LISTE, pas celui de la lecture : une liste relue sur le disque dont chaque fichier
    // passerait par le contrôle « suivi » refuserait aussi, mais sur « n'est pas un fichier SUIVI ».
    expect(() => chargerSources(sansJournal)).toThrow(/aucun fichier de journal SUIVI/);
  });

  it('un registre absent des fichiers suivis est refusé en le nommant', () => {
    const sansTaches = fichiersSuivis().filter((f) => f !== 'docs/tasks.json');
    expect(() => chargerSources(sansTaches)).toThrow(SourceIllisible);
    expect(() => chargerSources(sansTaches)).toThrow(/docs\/tasks\.json/);
  });

  it('un registre TRONQUÉ est refusé en le nommant, pas sur une trace de pile', () => {
    const lire = (c: string) => (c === 'docs/tasks.json' ? Buffer.from(lireReel(c).slice(0, 3940)) : octets(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(SourceIllisible);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/tasks\.json/);
  });

  it('un registre dont la clé est RENOMMÉE n’est pas un registre vide : refus nommé', () => {
    const lire = (c: string) => (c === 'docs/agents.json' ? Buffer.from(JSON.stringify({ poste: [] })) : octets(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/agents\.json.*postes/);
  });

  it('un README de journal sans plancher est refusé : la frontière ne se devine pas', () => {
    const lire = (c: string) => (c === 'docs/journal/README.md' ? Buffer.from('# Le journal\n') : octets(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/plancher/);
  });

  it('une entrée de registre MAL FORMÉE est refusée en nommant l’entrée et le champ, jamais sur une trace de pile', () => {
    const lire = (c: string) => (c === 'docs/tasks.json' ? Buffer.from(JSON.stringify({ taches: [{}] })) : octets(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(SourceIllisible);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/tasks\.json.*taches\[0\]\.id/);
  });

  it('une gate SANS script est refusée en se nommant : son attribution n’aurait aucun fichier à confronter', () => {
    const lire = (c: string) => {
      if (c !== 'docs/gates.json') return octets(c);
      const doc = JSON.parse(lireReel(c)) as { gates: Record<string, unknown>[] };
      delete doc.gates[0]!.script;
      return Buffer.from(JSON.stringify(doc));
    };
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(SourceIllisible);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/gates\.json.*gates\[0\]\.script/);
  });

  it('un fichier suivi en UTF-16 (avec ou sans BOM) est refusé en se nommant : lu en UTF-8, aucun identifiant n’y serait vu', () => {
    const suivis = fichiersSuivis();
    const cible = suivis.find((f) => f.startsWith('tests/')) as string;
    for (const contenu of ['\ufeff// GOV-999\n', '// GOV-999\n']) {
      const lire = (c: string) => (c === cible ? Buffer.from(contenu, 'utf16le') : octets(c));
      expect(() => chargerSources(suivis, lire)).toThrow(SourceIllisible);
      expect(() => chargerSources(suivis, lire)).toThrow(new RegExp(echapper(cible)));
    }
  });

  it('un chemin suivi qui est un RÉPERTOIRE (sous-module) est refusé en se nommant, pas sur une erreur brute', () => {
    const suivis = [...fichiersSuivis(), 'tests/unit'];
    expect(() => chargerSources(suivis)).toThrow(SourceIllisible);
    expect(() => chargerSources(suivis)).toThrow(/tests\/unit/);
  });
});

describe('REQ-GOV-021 — la garde est CÂBLÉE', () => {
  it('`gov:attributions` et sa preuve existent, sont dans la chaîne `gov:check` et dans la CI', () => {
    const pkg = JSON.parse(lireReel('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['gov:attributions']).toBe('tsx scripts/gates/gov-attributions.ts');
    expect(pkg.scripts['gov:attributions:prove']).toBe('tsx scripts/gates/gov-attributions.ts --prove');
    expect(pkg.scripts['gov:check']).toContain('pnpm gov:attributions');
    const ci = lireReel('.github/workflows/ci.yml');
    expect(ci, 'la garde n’est pas câblée en Gate A').toContain('pnpm gov:attributions');
    expect(ci, 'la PREUVE n’est pas câblée : une garde dont on ne vérifie pas qu’elle sait rougir cesse un jour de garder').toContain(
      'pnpm gov:attributions:prove'
    );
  });
});
