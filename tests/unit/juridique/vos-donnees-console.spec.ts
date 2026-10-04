// @req REQ-JUR-068
/**
 * `vos-donnees-console.spec.ts` — la page « Vos données dans la console », TÉMOIN écrit par un autre
 * que l'auteur du code qu'il juge.
 *
 * CE QU'IL PROUVE.
 *   1. LA PAGE REND LE BLOC TRT-CONSOLE du registre de l'article 30 — finalité, base légale,
 *      catégories de données, durée de conservation, droits —, et non celui d'un autre traitement :
 *      chaque texte affiché se lit, à la lettre, dans la cellule de sa rubrique.
 *   2. LE JOURNAL DES ACCÈS EST DIT EN CLAIR : la page dit que les connexions et les consultations de
 *      coordonnées sont journalisées, sa finalité et sa durée, douze mois — LUE au registre : une
 *      durée changée au registre change la page, sans toucher la page.
 *   3. AUCUNE VALEUR RETAPÉE : le source de la route et sa micro-copie ne portent ni durée ni nom de
 *      prestataire (garde `valeursRetapees`), ni durée écrite en toutes lettres.
 *   4. CE QUI EST « À COMPLÉTER » s'affiche « en cours de rédaction », SANS la question interne ni la
 *      proposition qui la suit ; un registre dont chaque manque est tranché rend une page publiable,
 *      sans aucun passage en cours de rédaction.
 *   5. ACCESSIBLE SANS SESSION : la route vit hors du groupe qui exige une session, n'en lit aucune,
 *      et se rend sans requête ni base. Elle n'est liée depuis la connexion qu'une fois publiable.
 *   6. UN REGISTRE ILLISIBLE est refusé en nommant ce qui manque, et la page montre son erreur.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MARQUE_A_COMPLETER, valeursRetapees } from '../../../src/domain/rgpd/politique';
import {
  RUBRIQUES_CONSOLE,
  TRAITEMENT_CONSOLE,
  estPubliableConsole,
  extrairePolitiqueConsole,
  type PolitiqueConsole,
} from '../../../src/domain/rgpd/politique-console';
import {
  EcranErreurVosDonneesConsole,
  EcranVosDonneesConsole,
} from '../../../src/app/(donnees-console)/console/vos-donnees/ecran';
import PageVosDonneesConsole from '../../../src/app/(donnees-console)/console/vos-donnees/page';
import { VOS_DONNEES_CONSOLE } from '../../../src/content/micro-copy/console/vos-donnees';

const RACINE = process.cwd();
const REGISTRE = readFileSync(join(RACINE, 'docs/rgpd/registre-article-30.md'), 'utf8');
const DOSSIER_DE_LA_ROUTE = 'src/app/(donnees-console)/console/vos-donnees';
const GROUPE_DE_LA_ROUTE = 'src/app/(donnees-console)';
const MICRO_COPIE = 'src/content/micro-copy/console/vos-donnees.ts';
const ECRAN_DE_CONNEXION = 'src/app/(connexion-console)/console/connexion/ecran.tsx';
const ROUTE = '/console/vos-donnees';

/** Les rubriques que la page doit rendre au moins, nommées comme au registre. */
const RUBRIQUES_EXIGEES = [
  'Finalité',
  'Base légale',
  'Catégories de données',
  'Durée de conservation',
  "Droits et modalités d'exercice",
] as const;

/** Un registre dont chaque manque déclaré est tranché : la forme qu'il aura après les réponses. */
const REGISTRE_PUBLIABLE = REGISTRE.replace(
  /À compléter — source manquante\.[^|]*/g,
  'Tranché au registre. '
);

const normaliser = (s: string): string => s.replace(/’/g, "'");

/** Les lignes du tableau de TRT-CONSOLE : rubrique → contenu. */
function blocConsole(registre: string): Map<string, string> {
  const lignes = registre.split(/\r?\n/);
  const i = lignes.findIndex((l) => /^### TRT-CONSOLE\b/.test(l));
  if (i < 0) throw new Error('TRT-CONSOLE introuvable dans le registre');
  const suite = lignes.slice(i + 1);
  const j = suite.findIndex((l) => /^#{1,3} /.test(l));
  const bloc = j < 0 ? suite : suite.slice(0, j);
  return new Map(
    bloc
      .filter((l) => l.startsWith('|'))
      .map((l) => l.split('|').map((c) => c.trim()))
      .map((c): [string, string] => [normaliser(c[1] ?? ''), c[2] ?? ''])
  );
}

function politiqueDe(registre: string): PolitiqueConsole {
  const lue = extrairePolitiqueConsole(registre);
  if (!lue.ok) throw new Error(`registre refusé : ${lue.refus}`);
  return lue.politique;
}

function refusDe(registre: string): string {
  const lue = extrairePolitiqueConsole(registre);
  if (lue.ok) throw new Error('le registre aurait dû être refusé');
  return lue.refus;
}

const rendre = (politique: PolitiqueConsole): string =>
  renderToStaticMarkup(createElement(EcranVosDonneesConsole, { politique }));

/** Le texte visible d'un rendu : sans balises ni entités, les blancs réduits. */
const texteDe = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** La durée du journal des accès, telle que le registre la porte dans TRT-CONSOLE. */
function dureeDuJournal(registre: string): string {
  const duree = blocConsole(registre).get('Durée de conservation') ?? '';
  const m = /Journal des accès\s*:\s*([^;.]+)/.exec(duree);
  if (m === null) throw new Error('la durée du journal des accès est absente de TRT-CONSOLE');
  return m[1]!.trim();
}

function sourcesDeLaRoute(): { fichier: string; source: string }[] {
  const lire = (dossier: string): { fichier: string; source: string }[] =>
    readdirSync(join(RACINE, dossier), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? lire(join(dossier, e.name))
        : /\.(tsx?|jsx?)$/.test(e.name)
          ? [
              {
                fichier: join(dossier, e.name),
                source: readFileSync(join(RACINE, dossier, e.name), 'utf8'),
              },
            ]
          : []
    );
  return lire(GROUPE_DE_LA_ROUTE);
}

// ── 1. la page rend TRT-CONSOLE ──────────────────────────────────────────────────────────────────

describe('REQ-JUR-068 — la page rend le bloc TRT-CONSOLE du registre de l’article 30', () => {
  it('REQ-JUR-068 : le traitement lu est TRT-CONSOLE, et les rubriques affichées sont des rubriques de son bloc', () => {
    expect(TRAITEMENT_CONSOLE).toBe('TRT-CONSOLE');
    const bloc = blocConsole(REGISTRE);
    for (const nom of Object.values(RUBRIQUES_CONSOLE)) {
      expect(bloc.has(normaliser(nom)), `rubrique inconnue de TRT-CONSOLE : ${nom}`).toBe(true);
    }
  });

  it('REQ-JUR-068 : finalité, base légale, catégories de données, durée de conservation et droits sont rendus', () => {
    const rendues = politiqueDe(REGISTRE).rubriques.map((r) =>
      normaliser(RUBRIQUES_CONSOLE[r.cle])
    );
    expect(rendues).toEqual(expect.arrayContaining([...RUBRIQUES_EXIGEES]));
  });

  it('REQ-JUR-068 : chaque texte affiché se lit, à la lettre, dans la cellule de sa rubrique de TRT-CONSOLE', () => {
    const bloc = blocConsole(REGISTRE);
    for (const r of politiqueDe(REGISTRE).rubriques) {
      const cellule = bloc.get(normaliser(RUBRIQUES_CONSOLE[r.cle])) ?? '';
      for (const s of r.contenu) {
        if (s.type === 'texte') expect(cellule).toContain(s.texte);
      }
    }
  });

  it('REQ-JUR-068 : la finalité rendue est celle de la console, jamais celle d’un autre traitement', () => {
    const finalite = blocConsole(REGISTRE).get('Finalité') ?? '';
    expect(finalite).toMatch(/console/);
    const texte = texteDe(rendre(politiqueDe(REGISTRE)));
    expect(texte).toContain(finalite);
    // La finalité du traitement des apporteurs, première du registre, n'entre pas dans la page.
    const premiere = REGISTRE.split('\n').find((l) => l.startsWith('| Finalité |'))!;
    const autre = premiere.split('|')[2]!.trim();
    expect(autre).not.toBe(finalite);
    expect(texte).not.toContain(autre);
  });

  it('REQ-JUR-068 : l’écran porte le titre de la page, tiré de sa micro-copie', () => {
    expect(VOS_DONNEES_CONSOLE.titre).toBe('Vos données dans la console');
    expect(texteDe(rendre(politiqueDe(REGISTRE)))).toContain(VOS_DONNEES_CONSOLE.titre);
  });
});

// ── 2. le journal des accès, en clair ────────────────────────────────────────────────────────────

describe('REQ-JUR-068 — le journal des accès est dit en clair, avec sa finalité et sa durée', () => {
  it('REQ-JUR-068 : la page dit que les connexions et les consultations de coordonnées sont journalisées, et pourquoi', () => {
    const texte = texteDe(rendre(politiqueDe(REGISTRE)));
    expect(texte).toMatch(/journal/i);
    expect(texte).toMatch(/connexions/);
    expect(texte).toMatch(/consultations de coordonnées/);
    expect(texte).toMatch(/accès abusif/);
  });

  it('REQ-JUR-068 : la durée du journal des accès est de douze mois au registre, et la page la dit', () => {
    expect(dureeDuJournal(REGISTRE)).toBe('douze mois');
    expect(texteDe(rendre(politiqueDe(REGISTRE)))).toMatch(/Journal des accès\s*:\s*douze mois/);
  });

  it('REQ-JUR-068 : face 1 — une durée du journal changée au registre change la page, sans toucher la page', () => {
    const change = REGISTRE.replace(
      /Journal des accès\s*:\s*douze mois/,
      'Journal des accès : dix-huit mois'
    );
    expect(change).not.toBe(REGISTRE);
    const texte = texteDe(rendre(politiqueDe(change)));
    expect(texte).toContain('Journal des accès : dix-huit mois');
    expect(texte).not.toContain('douze mois');
  });
});

// ── 3. aucune valeur retapée ─────────────────────────────────────────────────────────────────────

describe('REQ-JUR-068 — la page lit le registre, elle ne l’écrit pas', () => {
  it('REQ-JUR-068 : face 2 — une page qui retape la durée du journal rougit `valeursRetapees`', () => {
    expect(valeursRetapees('<p>Journal des accès : 12 mois</p>', REGISTRE)).toEqual([
      expect.stringContaining('« 12 mois »'),
    ]);
  });

  it('REQ-JUR-068 : le source de la route ne retape aucune durée ni aucun prestataire', () => {
    const sources = sourcesDeLaRoute();
    expect(sources.map((s) => s.fichier)).toEqual(
      expect.arrayContaining([
        join(DOSSIER_DE_LA_ROUTE, 'page.tsx'),
        join(DOSSIER_DE_LA_ROUTE, 'ecran.tsx'),
      ])
    );
    for (const { fichier, source } of sources) {
      expect(valeursRetapees(source, REGISTRE), fichier).toEqual([]);
    }
  });

  it('REQ-JUR-068 : la micro-copie ne porte ni durée ni prestataire, en chiffres comme en lettres', () => {
    const source = readFileSync(join(RACINE, MICRO_COPIE), 'utf8');
    expect(valeursRetapees(source, REGISTRE)).toEqual([]);
    expect(source).not.toMatch(
      /\b(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|soixante|cent)(?:-\w+)?\s+(?:jours?|semaines?|mois|ans|années?|heures?)\b/i
    );
  });
});

// ── 4. ce qui est à compléter ────────────────────────────────────────────────────────────────────

describe('REQ-JUR-068 — ce que le registre ne tranche pas s’affiche « en cours de rédaction »', () => {
  it('REQ-JUR-068 : la base légale « À compléter » est rendue en cours de rédaction, sans sa question ni sa proposition', () => {
    // Le registre réel tranche la base légale (JUR-T62) : le manque est posé dans une copie, au bloc
    // de TRT-CONSOLE, avec une question et une proposition internes qui ne doivent jamais sortir.
    const lignes = REGISTRE.split('\n');
    const debut = lignes.findIndex((l) => /^### TRT-CONSOLE\b/.test(l));
    const i = lignes.findIndex((l, n) => n > debut && l.startsWith('| Base légale | '));
    expect(i).toBeGreaterThan(debut);
    const avecManque = lignes
      .map((l, n) =>
        n === i
          ? l.replace(
              /^(\| [^|]+\| )/u,
              `$1${MARQUE_A_COMPLETER} Question : laquelle ? Proposition : l'intérêt légitime. `
            )
          : l
      )
      .join('\n');
    const cellule = blocConsole(avecManque).get('Base légale') ?? '';
    expect(cellule.startsWith(MARQUE_A_COMPLETER)).toBe(true);
    const base = politiqueDe(avecManque).rubriques.find((r) => r.cle === 'baseLegale');
    expect(base?.contenu).toEqual([{ type: 'a_completer' }]);
    const texte = texteDe(rendre(politiqueDe(avecManque)));
    expect(texte).not.toMatch(/Question|Proposition/);
    expect(VOS_DONNEES_CONSOLE.aCompleter).toMatch(/en cours de rédaction/i);
    expect(texte).toContain(VOS_DONNEES_CONSOLE.aCompleter);
  });

  it('REQ-JUR-068 : la page ne montre jamais une note interne — ni « À compléter », ni question, ni proposition, ni l’arbitre nommé', () => {
    const texte = texteDe(rendre(politiqueDe(REGISTRE)));
    expect(texte).not.toContain('À compléter');
    expect(texte).not.toContain('source manquante');
    expect(texte).not.toMatch(/Question/);
    expect(texte).not.toMatch(/Proposition/i);
    expect(texte).not.toMatch(/(?<![\p{L}\p{N}])Will(?:iams)?(?![\p{L}\p{N}])/u);
  });

  // JUR-T62 : les textes finaux de la juriste (décisions de Williams du 2026-10-04) tranchent chaque manque.
  it('REQ-JUR-068 : TÉMOIN — le registre RÉEL est publiable : aucun passage en cours de rédaction, et les textes tranchés de la juriste', () => {
    const politique = politiqueDe(REGISTRE);
    expect(estPubliableConsole(politique)).toBe(true);
    const texte = texteDe(rendre(politique));
    expect(texte).not.toContain(VOS_DONNEES_CONSOLE.aCompleter);
    expect(texte).toContain(
      "L'intérêt légitime de la Société à sécuriser l'accès à ses outils et aux données personnelles qu'ils contiennent"
    );
    expect(texte).toContain(
      "ce journal ne sert ni à mesurer l'activité des utilisateurs de la console ni à les évaluer"
    );
    expect(texte).toContain(
      "Accès désactivé : le nom et l'adresse, cinq ans après la désactivation, preuve des actes accomplis dans la console, puis effacés ; l'identifiant reste."
    );
    // Juriste, #708 (garde du lexique, REQ-JUR-039) : « compte désactivé » retiendrait toute la durée.
    expect(texte).toMatch(/Journal des accès\s*:\s*douze mois/);
    expect(texte).toContain(
      "elles ne portent aucune donnée personnelle, ni d'un utilisateur de la console ni d'un apporteur : seulement leur catégorie, des codes tirés de listes fermées, des nombres, un horodatage et un identifiant technique."
    );
    expect(texte).not.toMatch(/déploiement, sauvegarde, restauration/);
    expect(texte).toContain(
      'Elles ne sont pas en service à ce jour ; le pays du service et l’encadrement du transfert seront précisés ici avant leur mise en service.'.replace(
        /’/g,
        "'"
      )
    );
  });

  it('REQ-JUR-068 : chaque manque tranché, la page est publiable et ne porte AUCUN passage en cours de rédaction', () => {
    const politique = politiqueDe(REGISTRE_PUBLIABLE);
    expect(estPubliableConsole(politique)).toBe(true);
    const texte = texteDe(rendre(politique));
    expect(texte).not.toContain(VOS_DONNEES_CONSOLE.aCompleter);
    expect(texte).not.toContain('À compléter');
    expect(texte).toMatch(/Journal des accès\s*:\s*douze mois/);
  });

  it('REQ-JUR-068 : un seul manque restant suffit à rendre la page non publiable', () => {
    // Le manque est posé dans le bloc de TRT-CONSOLE, et non dans la rubrique homonyme d'un autre traitement.
    const lignes = REGISTRE_PUBLIABLE.split('\n');
    const debut = lignes.findIndex((l) => /^### TRT-CONSOLE\b/.test(l));
    const i = lignes.findIndex(
      (l, n) => n > debut && normaliser(l).startsWith("| Droits et modalités d'exercice | ")
    );
    expect(i).toBeGreaterThan(debut);
    const unManque = lignes
      .map((l, n) =>
        n === i ? l.replace(/^(\| [^|]+\| )/u, `$1${MARQUE_A_COMPLETER} Question : laquelle ? `) : l
      )
      .join('\n');
    const droits = blocConsole(unManque).get("Droits et modalités d'exercice") ?? '';
    expect(droits).toContain(MARQUE_A_COMPLETER);
    expect(estPubliableConsole(politiqueDe(unManque))).toBe(false);
  });
});

// ── 5. accessible sans session ───────────────────────────────────────────────────────────────────

describe('REQ-JUR-068 — la page est publique : accessible sans session', () => {
  it('REQ-JUR-068 : la route vit dans son propre groupe, hors du groupe de la console qui exige une session', () => {
    expect(existsSync(join(RACINE, DOSSIER_DE_LA_ROUTE, 'page.tsx'))).toBe(true);
    expect(existsSync(join(RACINE, 'src/app/(console)/console/vos-donnees'))).toBe(false);
    expect(existsSync(join(RACINE, 'src/app/(connexion-console)/console/vos-donnees'))).toBe(false);
  });

  it('REQ-JUR-068 : aucun fichier du groupe ne lit une session, un cookie ou un en-tête de requête', () => {
    for (const { fichier, source } of sourcesDeLaRoute()) {
      expect(source, fichier).not.toMatch(/from ['"]next\/headers['"]/);
      expect(source, fichier).not.toMatch(/\bcookies\s*\(/);
      expect(source, fichier).not.toMatch(/server\/auth\//);
      expect(source, fichier).not.toMatch(/COOKIE_DE_SESSION/);
    }
  });

  it('REQ-JUR-068 : la page se rend sans requête, sans session et sans base, et rend TRT-CONSOLE', async () => {
    const element = (await PageVosDonneesConsole()) as ReactElement;
    const texte = texteDe(renderToStaticMarkup(element));
    expect(texte).toContain(VOS_DONNEES_CONSOLE.titre);
    expect(texte).toContain(blocConsole(REGISTRE).get('Finalité') ?? '∅');
    expect(texte).toMatch(/Journal des accès\s*:\s*douze mois/);
  });

  it('REQ-JUR-068 : la page n’est liée depuis la connexion de la console qu’une fois publiable', () => {
    const connexion = existsSync(join(RACINE, ECRAN_DE_CONNEXION))
      ? readFileSync(join(RACINE, ECRAN_DE_CONNEXION), 'utf8')
      : '';
    if (connexion.includes(ROUTE)) {
      expect(estPubliableConsole(politiqueDe(REGISTRE))).toBe(true);
    } else {
      expect(connexion).not.toContain(ROUTE);
    }
  });

  // JUR-T62 : la page est publiable, le lien est posé — une seule ligne, son titre de la micro-copie.
  it('REQ-JUR-068 : TÉMOIN — l’écran de connexion de la console porte le lien « Vos données dans la console »', () => {
    const connexion = readFileSync(join(RACINE, ECRAN_DE_CONNEXION), 'utf8');
    expect(connexion).toContain(`<a href="${ROUTE}">{VOS_DONNEES_CONSOLE.titre}</a>`);
    // Le seul lien : le chemin d'import de la micro-copie contient aussi « /console/vos-donnees ».
    expect(connexion.split(`href="${ROUTE}"`).length - 1).toBe(1);
  });
});

// ── 6. le registre illisible ─────────────────────────────────────────────────────────────────────

describe('REQ-JUR-068 — un registre illisible est refusé en le nommant', () => {
  it('REQ-JUR-068 : sans bloc TRT-CONSOLE, le refus nomme le traitement', () => {
    const sans = REGISTRE.replace(/^### TRT-CONSOLE\b.*$/m, '### TRT-AUTRE — retiré');
    expect(refusDe(sans)).toContain('TRT-CONSOLE');
  });

  it('REQ-JUR-068 : une rubrique exigée absente de TRT-CONSOLE est refusée en la nommant', () => {
    const lignes = REGISTRE.split('\n');
    const debut = lignes.findIndex((l) => /^### TRT-CONSOLE\b/.test(l));
    const i = lignes.findIndex((l, n) => n > debut && l.startsWith('| Durée de conservation |'));
    expect(i).toBeGreaterThan(debut);
    const sans = [...lignes.slice(0, i), ...lignes.slice(i + 1)].join('\n');
    expect(refusDe(sans)).toContain('Durée de conservation');
  });

  it('REQ-JUR-068 : l’erreur a son écran, qui ne montre aucune politique partielle', () => {
    const texte = texteDe(renderToStaticMarkup(createElement(EcranErreurVosDonneesConsole)));
    expect(texte.length).toBeGreaterThan(0);
    expect(texte).not.toMatch(/Journal des accès/);
    expect(texte).not.toContain('À compléter');
  });
});
