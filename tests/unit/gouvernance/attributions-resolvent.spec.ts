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
 *     `tests/`, chaque entrée du journal, chaque chaîne ET chaque nom de clé de `docs/gates.json`
 *     à toute profondeur ;
 *   — les exemptions « paths gabarit » ont un producteur INDÉPENDANT, recompté ici ;
 *   — toute tâche qui porte un lot est jugée ou exemptée, aucune n'est sautée ;
 *   — elle ne lit QUE des fichiers suivis, et refuse en se NOMMANT une source absente, tronquée,
 *     mal formée, à clé dupliquée, ou qui porte un octet NUL.
 *
 * Ce qu'elle ne voit pas est écrit une seule fois, dans l'en-tête de la garde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import {
  analyser,
  chargerSources,
  entreesDeJournal,
  prouver,
  SourceIllisible,
  CITATIONS_DECLAREES,
  DETTE_GATE_NON_RECIPROQUE,
} from '../../../scripts/gates/gov-attributions';

const lireReel = (chemin: string) => readFileSync(chemin, 'utf8');
const octets = (chemin: string) => readFileSync(chemin);
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sousScriptsOuTests = (f: string) => f.startsWith('scripts/') || f.startsWith('tests/');

/** Un identifiant de la FORME d'une tâche réelle, qui ne résout pas : dérivé, jamais tapé. */
function identifiantInconnu(taches: readonly { id: string }[]): string {
  const ids = new Set(taches.map((t) => t.id));
  let inconnu = (taches.find((t) => /[0-9]/.test(t.id)) as { id: string }).id.replace(/[0-9]+/, '9');
  while (ids.has(inconnu)) inconnu = inconnu.replace('9', '99');
  return inconnu;
}

/** La position juste après l'accolade ouvrante de la PREMIÈRE entrée du tableau `cle` d'un registre. */
function dansLaPremiereEntree(texte: string, cle: string): number {
  const m = new RegExp(`"${cle}"\\s*:\\s*\\[\\s*\\{`).exec(texte);
  expect(m, `le tableau « ${cle} » est introuvable : la sonde ne sait plus où écrire`).not.toBeNull();
  return m!.index + m![0].length;
}

/** Le refus que lève `chargerSources`, ou `null`. */
function refusDe(charger: () => unknown): Error | null {
  try {
    charger();
    return null;
  } catch (e) {
    return e as Error;
  }
}

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
    expect(s.gates.length, 'des gates ont été perdues au chargement').toBe(brut('docs/gates.json', 'gates'));
    expect(s.postes.length, 'des postes ont été perdus au chargement').toBe(brut('docs/agents.json', 'postes'));
    expect(s.taches.length, 'le registre des tâches est vide : l’égalité ne prouverait rien').toBeGreaterThan(0);
  });

  it('les en-têtes : TOUT fichier suivi de scripts/ et tests/, chacun sur ses vingt premières lignes', () => {
    const suivis = fichiersSuivis();
    const s = chargerSources(suivis);
    // L'acceptance dit « tout fichier suivi de scripts/ et tests/ » et « ses vingt premières lignes » :
    // ce sont ses termes, pas une recopie de la garde.
    const attendus = suivis.filter(sousScriptsOuTests);
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

  /**
   * Le PRODUCTEUR INDÉPENDANT des exemptions « paths gabarit » — les plus nombreuses. Le recompte ne
   * passe pas par `analyser` : il relit les registres et les fichiers, découpe les textes en jetons, et
   * range chaque attribution sous la nature que sa cause lui donne. Une exemption tue selon son ORIGINE
   * (prose de `docs/gates.json`, fichiers sous `tests/`) ou selon la FORME d'une gate le fait diverger.
   */
  it('les exemptions « paths gabarit » ont un PRODUCTEUR INDÉPENDANT : recomptées ici sur les registres relus, par nature, tâche et lieu', () => {
    const { exemptions } = analyser(chargerSources(fichiersSuivis()));
    type T = { id: string; paths?: string[]; tests?: Record<string, string[]> };
    const taches = (JSON.parse(lireReel('docs/tasks.json')) as { taches: T[] }).taches;
    const gates = (JSON.parse(lireReel('docs/gates.json')) as { gates: Record<string, unknown>[] }).gates;
    const parId = new Map(taches.map((t) => [t.id, t]));
    // Un path GABARIT se termine par l'identifiant de la tâche elle-même.
    const gabarits = (t: T) => (t.paths ?? []).filter((p) => posix.basename(p) === t.id);
    const reels = (t: T) => (t.paths ?? []).filter((p) => posix.basename(p) !== t.id);
    const declareToucher = (t: T, fichier: string) =>
      [...(t.paths ?? []), ...Object.values(t.tests ?? {}).flat().map((x) => x.split('#')[0] as string)].some(
        (x) => x === fichier || (x.endsWith('/') && fichier.startsWith(x))
      );
    const enContexte = (ou: string, id: string) =>
      CITATIONS_DECLAREES.some((c) => c.ou === ou && c.id === id && c.nature === 'contexte');
    const nature = (lieu: 'gate' | 'mention', t: T) =>
      `${lieu}_paths_${reels(t).length === 0 ? 'non_resolus' : 'en_partie_gabarit'}`;
    // Une mention est un JETON entier égal à l'identifiant d'une tâche.
    const mentions = (texte: string) => texte.split(/[^A-Za-z0-9-]+/).filter((j) => parId.has(j));

    const attendues: string[] = [];
    for (const g of gates) {
      const t = parId.get(g.tache as string);
      const script = (g.script as string).split('#')[0] as string;
      if (!t || gabarits(t).length === 0 || declareToucher(t, script)) continue;
      if (DETTE_GATE_NON_RECIPROQUE.some((d) => d.gate === g.id && d.tache === t.id && d.script === script)) continue;
      attendues.push(`${nature('gate', t)} ${t.id} @ docs/gates.json:${g.id}`);
    }
    for (const fichier of fichiersSuivis().filter(sousScriptsOuTests)) {
      for (const ligne of lireReel(fichier).split('\n').slice(0, 20)) {
        for (const id of mentions(ligne)) {
          const t = parId.get(id) as T;
          if (gabarits(t).length === 0 || declareToucher(t, fichier) || enContexte(fichier, id)) continue;
          attendues.push(`${nature('mention', t)} ${id} @ ${fichier}`);
        }
      }
    }
    for (const g of gates) {
      const script = (g.script as string).split('#')[0] as string;
      const pile: [unknown, string][] = [[g, `docs/gates.json:${g.id}`]];
      while (pile.length > 0) {
        const [v, ou] = pile.pop() as [unknown, string];
        if (Array.isArray(v)) v.forEach((x, i) => pile.push([x, `${ou}[${i}]`]));
        else if (v !== null && typeof v === 'object') {
          for (const [cle, x] of Object.entries(v)) pile.push([x, `${ou}.${cle}`], [cle, `${ou}.${cle}`]);
        } else if (typeof v === 'string') {
          for (const id of mentions(v)) {
            const t = parId.get(id) as T;
            if (id === g.tache || gabarits(t).length === 0 || declareToucher(t, script) || enContexte(ou, id)) continue;
            attendues.push(`${nature('mention', t)} ${id} @ docs/gates.json:${g.id}`);
          }
        }
      }
    }

    const PREFIXE = 'docs/gates.json:';
    const lieu = (site: string) =>
      site.startsWith(PREFIXE) ? PREFIXE + (site.slice(PREFIXE.length).split(/[ .[]/)[0] as string) : site.replace(/:\d+$/, '');
    const rendues = exemptions
      .filter((e) => /^(gate|mention)_paths_(non_resolus|en_partie_gabarit)$/.test(e.nature))
      .map((e) => `${e.nature} ${e.tache} @ ${lieu(e.site)}`);
    expect(attendues.length, 'le recompte ne trouve aucune attribution à paths gabarit : il ne prouverait rien').toBeGreaterThan(0);
    expect(rendues.sort(), 'les exemptions « paths gabarit » rendues ne sont pas celles que le recompte indépendant trouve').toEqual(
      attendues.sort()
    );
  });

  it('toute CHAÎNE et tout NOM DE CLÉ d’une entrée de docs/gates.json sont lus, à toute profondeur — chaque champ, sous chaque forme que le registre réel lui donne', () => {
    const s = chargerSources(fichiersSuivis());
    const inconnu = identifiantInconnu(s.taches);

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

    // Un identifiant écrit comme NOM de clé : sur l'entrée elle-même, puis dans un objet posé DANS un tableau.
    const premiere = s.gates[0] as (typeof s.gates)[number];
    for (const sonde of [{ ...premiere, [inconnu]: 'x' }, { ...premiere, sonde: [{ [inconnu]: 1 }] }]) {
      const { fautes } = analyser({ ...s, gates: [sonde] });
      expect(
        fautes.some((f) => f.famille === 'mention_non_resolue' && f.message.includes(inconnu)),
        `« ${inconnu} » écrit comme NOM de clé n’a fait rougir personne : ${JSON.stringify(sonde).slice(0, 200)}`
      ).toBe(true);
    }
  });

  it('une entrée de docs/gates.json imbriquée sur 20 000 niveaux est lue jusqu’au fond : l’identifiant qui y vit est vu, aucune erreur brute', () => {
    const suivis = fichiersSuivis();
    const inconnu = identifiantInconnu(chargerSources(suivis).taches);
    const gates = lireReel('docs/gates.json');
    const i = dansLaPremiereEntree(gates, 'gates');
    const profond = '{"n":'.repeat(20_000) + `"la lacune de ${inconnu}"` + '}'.repeat(20_000);
    const texte = gates.slice(0, i) + `"profond": ${profond},` + gates.slice(i);
    const lire = (c: string) => (c === 'docs/gates.json' ? Buffer.from(texte) : octets(c));
    const { fautes } = analyser(chargerSources(suivis, lire));
    expect(fautes.filter((f) => f.famille === 'mention_non_resolue' && f.message.includes(inconnu)).length).toBe(1);
  });
});

describe('REQ-GOV-021 — la garde ne lit QUE des sources suivies, et refuse en se NOMMANT', () => {
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

  it('une clé DUPLIQUÉE dans un registre lu est refusée en se nommant : JSON.parse garde la dernière, le lecteur du fichier ou du diff lit la première', () => {
    const suivis = fichiersSuivis();
    const inconnu = identifiantInconnu(chargerSources(suivis).taches);
    // « i » écrit par son échappement JSON : pour JSON.parse, c'est la même clé que « id ».
    const I_ECHAPPE = String.fromCharCode(92) + 'u0069';
    const racine = (texte: string, cle: string) => {
      const i = texte.indexOf('{') + 1;
      return texte.slice(0, i) + `"${cle}": [],` + texte.slice(i);
    };
    const entree = (texte: string, cle: string, ajout: string) => {
      const i = dansLaPremiereEntree(texte, cle);
      return texte.slice(0, i) + ajout + texte.slice(i);
    };
    const taches = lireReel('docs/tasks.json');
    const gates = lireReel('docs/gates.json');
    const postes = lireReel('docs/agents.json');
    const cas: [chemin: string, texte: string, cle: string][] = [
      ['docs/tasks.json', racine(taches, 'taches'), 'taches'],
      ['docs/tasks.json', entree(taches, 'taches', `"reqs": ["${inconnu}"],`), 'reqs'],
      ['docs/gates.json', racine(gates, 'gates'), 'gates'],
      ['docs/gates.json', entree(gates, 'gates', `"verifie": "la lacune de ${inconnu}",`), 'verifie'],
      ['docs/gates.json', entree(gates, 'gates', `"${I_ECHAPPE}d": "${inconnu}",`), 'id'],
      ['docs/agents.json', racine(postes, 'postes'), 'postes'],
      ['docs/agents.json', entree(postes, 'postes', `"code": "${inconnu}",`), 'code'],
    ];
    for (const [chemin, texte, cle] of cas) {
      expect(() => JSON.parse(texte), `${chemin} : la sonde « ${cle} » n'est plus du JSON`).not.toThrow();
      const refus = refusDe(() => chargerSources(suivis, (c) => (c === chemin ? Buffer.from(texte) : octets(c))));
      expect(refus, `${chemin} : la clé « ${cle} » écrite deux fois n’a pas fait refuser`).toBeInstanceOf(SourceIllisible);
      expect(refus!.message, `${chemin} : le refus ne nomme pas la source`).toContain(chemin);
      expect(refus!.message, `${chemin} : le refus ne nomme pas la clé dupliquée`).toContain(`« ${cle} »`);
    }
  });

  it('un README de journal sans plancher est refusé : la frontière ne se devine pas', () => {
    const lire = (c: string) => (c === 'docs/journal/README.md' ? Buffer.from('# Le journal\n') : octets(c));
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/plancher/);
  });

  it('un plancher écrit DEUX fois dans le README — l’une dans un commentaire invisible au rendu — est refusé : la garde ne choisit pas', () => {
    const reel = lireReel('docs/journal/README.md');
    const ligne = (/^.*\*\*> \d+\*\*.*$/m.exec(reel) as RegExpExecArray)[0];
    const texte = `<!-- ${ligne.replace(/\d+/, '999')} -->\n${reel}`;
    const refus = refusDe(() =>
      chargerSources(fichiersSuivis(), (c) => (c === 'docs/journal/README.md' ? Buffer.from(texte) : octets(c)))
    );
    expect(refus, 'un plancher écrit deux fois n’a pas fait refuser').toBeInstanceOf(SourceIllisible);
    expect(refus!.message).toMatch(/plancher/);
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

  it('une chaîne VIDE là où la garde lit un identifiant ou un script est refusée en se nommant', () => {
    const cas = [
      ['docs/tasks.json', 'taches', 'id'],
      ['docs/gates.json', 'gates', 'id'],
      ['docs/gates.json', 'gates', 'script'],
      ['docs/agents.json', 'postes', 'code'],
    ] as const;
    for (const [chemin, cle, champ] of cas) {
      const lire = (c: string) => {
        if (c !== chemin) return octets(c);
        const doc = JSON.parse(lireReel(c)) as Record<string, Record<string, unknown>[]>;
        doc[cle]![0]![champ] = '';
        return Buffer.from(JSON.stringify(doc));
      };
      const refus = refusDe(() => chargerSources(fichiersSuivis(), lire));
      expect(refus, `${chemin} — ${cle}[0].${champ} vide n’a pas fait refuser`).toBeInstanceOf(SourceIllisible);
      expect(refus!.message).toMatch(new RegExp(`${echapper(chemin)}.*${cle}\\[0\\]\\.${champ}`));
    }
  });

  it('un octet NUL fait refuser QUEL QUE SOIT le fichier : un fichier par extension suivie sous scripts/ et tests/, un fichier sans extension, et un NUL au-delà des premiers kilo-octets', () => {
    const suivis = fichiersSuivis();
    const parExtension = new Map<string, string>();
    for (const f of suivis.filter(sousScriptsOuTests)) {
      const ext = posix.extname(f);
      if (!parExtension.has(ext)) parExtension.set(ext, f);
    }
    // Un fichier sans extension : pris dans le dépôt s'il en porte, sinon ajouté à la liste des suivis.
    const SONDE = 'tests/sonde-sans-extension';
    const sansExtension = parExtension.get('') ?? SONDE;
    const perimetre = suivis.includes(sansExtension) ? suivis : [...suivis, sansExtension];
    const cibles = [...new Set([...parExtension.values(), sansExtension])];
    expect(cibles.length, 'moins de deux formes de fichier : le témoin ne distinguerait rien').toBeGreaterThan(2);

    const GOV_999_UTF16 = Buffer.from('// GOV-999\n', 'utf16le');
    const contenus = [GOV_999_UTF16, Buffer.concat([Buffer.from(`${'x'.repeat(64_000)}\n`), GOV_999_UTF16])];
    const acceptes: string[] = [];
    for (const cible of cibles) {
      for (const [n, contenu] of contenus.entries()) {
        const lire = (c: string) => (c === cible ? contenu : c === SONDE ? Buffer.from('rien\n') : octets(c));
        const refus = refusDe(() => chargerSources(perimetre, lire));
        const nomme = refus instanceof SourceIllisible && refus.message.includes(cible) && refus.message.includes('NUL');
        if (!nomme) acceptes.push(`${cible} (${n === 0 ? 'UTF-16' : 'NUL après 64 000 octets'}) : ${refus?.message ?? 'aucun refus'}`);
      }
    }
    expect(acceptes, 'un fichier suivi porteur d’un octet NUL n’a pas fait refuser en se nommant').toEqual([]);
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
