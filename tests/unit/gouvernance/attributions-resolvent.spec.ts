// @req REQ-GOV-021
// @req REQ-GOV-003
/**
 * LES ATTRIBUTIONS SE CONFRONTENT À LEURS SOURCES (GOV-037).
 *
 * CE QUE CE FICHIER PROUVE, ET IL NE RETAPE AUCUN CAS. Les témoins et les contre-témoins vivent dans
 * la garde (`TEMOINS`, `CONTRE_TEMOINS`) et sont jugés par les fonctions que `--prove` appelle : une
 * seconde copie des mêmes cas divergerait au premier ajout. Ce fichier tient ce que `--prove` ne peut
 * pas tenir, parce qu'il faut le dépôt réel pour le mesurer :
 *
 *   — la garde lit ses sources EN ENTIER : chaque registre, chaque fichier suivi de `scripts/` et
 *     `tests/`, chaque entrée du journal — en ÉGALITÉ avec un compte fait ici, jamais un plancher `> 0` ;
 *   — elle ne lit QUE des fichiers suivis, et refuse en se NOMMANT une source absente, tronquée ou renommée ;
 *   — elle est verte sur le dépôt réel, et câblée en Gate A.
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

describe('REQ-GOV-021 et REQ-GOV-003 — chaque famille rougit sur son témoin, chaque exemption a son contre-témoin', () => {
  it('`--prove` rend 0 : aucune famille sans témoin, aucune nature d’exemption qu’aucun contre-témoin ne rende', () => {
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
});

describe('REQ-GOV-021 — la garde ne lit QUE des sources suivies, et refuse en se NOMMANT', () => {
  // 🔴 Motif de `securite` : le journal était lu sur le DISQUE. Journaux suivis vidés et un fichier
  // non suivi posé à côté, la garde rendait 0 avec sa bannière. Ici la liste des fichiers suivis est
  // amputée du journal alors que le disque le porte toujours : une lecture du disque le retrouverait.
  it('un journal présent sur le disque mais absent des fichiers SUIVIS ne compte pas : refus nommé', () => {
    const sansJournal = fichiersSuivis().filter((f) => !f.startsWith('docs/journal/') || f === 'docs/journal/README.md');
    expect(() => chargerSources(sansJournal)).toThrow(SourceIllisible);
    // ⚠️ LE REFUS DE LA LISTE, PAS CELUI DE LA LECTURE. Mesuré par mutation : une liste relue sur le
    // disque, dont chaque fichier passerait encore par le contrôle « suivi », refuse aussi — mais sur
    // « n'est pas un fichier SUIVI ». Exiger ce message-ci rend chacune des deux couches visible seule.
    expect(() => chargerSources(sansJournal)).toThrow(/aucun fichier de journal SUIVI/);
  });

  it('un registre absent des fichiers suivis est refusé en le nommant', () => {
    const sansTaches = fichiersSuivis().filter((f) => f !== 'docs/tasks.json');
    expect(() => chargerSources(sansTaches)).toThrow(SourceIllisible);
    expect(() => chargerSources(sansTaches)).toThrow(/docs\/tasks\.json/);
  });

  it('un registre TRONQUÉ est refusé en le nommant, pas sur une trace de pile', () => {
    const lire = (c: string) => (c === 'docs/tasks.json' ? lireReel(c).slice(0, 3940) : lireReel(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(SourceIllisible);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/tasks\.json/);
  });

  it('un registre dont la clé est RENOMMÉE n’est pas un registre vide : refus nommé', () => {
    const lire = (c: string) => (c === 'docs/agents.json' ? JSON.stringify({ poste: [] }) : lireReel(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/agents\.json.*postes/);
  });

  it('un README de journal sans plancher est refusé : la frontière ne se devine pas', () => {
    const lire = (c: string) => (c === 'docs/journal/README.md' ? '# Le journal\n' : lireReel(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/plancher/);
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
