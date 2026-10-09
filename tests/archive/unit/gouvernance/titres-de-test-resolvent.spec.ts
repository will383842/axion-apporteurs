// @req REQ-QA-014
/**
 * REQ-QA-014 — L'IDENTIFIANT QU'UN TITRE S'ATTRIBUE SE CONFRONTE AU TEXTE DE L'EXIGENCE NOMMÉE
 * (GOV-039).
 *
 * `gov:trace` implémente la FORME de REQ-QA-014 — « un titre contient un identifiant » — et jamais
 * sa RÉSOLUTION : elle ne demande jamais si le texte ainsi nommé est un texte EN VIGUEUR. Pire, elle
 * PROPAGE la faute : une fausse attribution la fait rougir pour la mauvaise raison (`vue_divergente`),
 * et le geste que ce rouge prescrit — `gov:trace --render` — rend l'attribution OFFICIELLE.
 *
 * CE QUI EST MÉCANISABLE, ET CE QUI NE L'EST PAS. Confronter « ce `it()` teste un IBAN » au texte
 * « ADR mono-tenant en V1 » n'est mécanisable par aucune garde — `scripts/gates/gov-attributions.ts`
 * l'écrit déjà dans ses LIMITES CONNUES, et quatre mécanisations ont été mesurées ici avant d'être
 * abandonnées (recouvrement lexical au grain du titre : 328 rouges sur 622 ; au grain du titre plus
 * ses `describe` englobants : 285 sur 835 ; sur les seuls mots RARES du corpus : 525 ; « le corps du
 * test consomme-t-il l'identifiant » : 407 — mesures du 2026-09-17, aucune n'isolait le défaut).
 * Ce que ce fichier tient est donc la part qui RÉSOUT vraiment :
 *
 *   — `exigence_inexistante`  : le titre nomme un identifiant qui n'a AUCUN texte au registre ;
 *   — `texte_remplace`        : le titre nomme une exigence dont le dépôt déclare le texte REMPLACÉ
 *                               (`statut: "absorbee"`). Le titre s'adosse alors à un texte hors
 *                               vigueur — c'est exactement la seconde mauvaise attribution que la
 *                               tâche GOV-039 a elle-même portée (REQ-GOV-005, absorbée par
 *                               REQ-QA-014), et qu'aucune garde ne voyait ;
 *   — `texte_vide`            : l'exigence nommée existe et ne dit rien.
 *
 * Le reste — « ce titre parle-t-il du bon sujet ? » — est porté par une RELECTURE NOMMÉE, ce que
 * l'acceptance de GOV-039 exige explicitement à la place d'un vert.
 *
 * LA LIGNE QUI NE DOIT PAS BOUGER. `tests/unit/gouvernance/entite-registre.spec.ts` portait 87 titres
 * étiquetés REQ-CPL-018 qui parlent d'IBAN, de BIC, de SIREN et de corps de PR (l'acceptance en
 * annonce 88 : mesuré le 2026-09-17, le fichier portait 90 occurrences de l'identifiant, dont l'une
 * est l'annotation `// @req` de l'en-tête, une autre l'ARGUMENT `ligneSource(EXIGENCES,
 * 'REQ-CPL-018')` — qui n'est pas un titre — et la dernière le titre légitime). UN seul titre teste
 * REQ-CPL-018 pour de bon : celui qui confronte la valeur mono-tenant à la LIGNE SOURCE de son
 * exigence. Le témoin qui le protège ne compte pas les titres — il exige que tout titre nommant
 * REQ-CPL-018 dans ce fichier CONSOMME la ligne source de REQ-CPL-018 dans son corps.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  estUnFichierDeTest,
  fichiersDeTest,
  titresEcrits,
  titresEcritsPositionnes,
} from '../../../scripts/lot/titres-ecrits';
import {
  controler,
  DETTE_TEXTE_DECIDE,
  modeNormal,
  type DetteTexteDecide,
  fusionsDecidees,
  marqueursDe,
  CHEMIN_ANNEXE,
  FAMILLES,
} from '../../../scripts/gates/gov-requirements';

type Exigence = {
  id: string;
  texte: string;
  statut: 'active' | 'absorbee' | 'retiree';
  remplaceePar: string | null;
};
type Registre = { exigences: Exigence[] };

const lire = (chemin: string) => readFileSync(chemin, 'utf8');
const REGISTRE = () => JSON.parse(lire('docs/requirements.json')) as Registre;
const SCHEMA = () => JSON.parse(lire('scripts/lot/requirements.schema.json')) as object;
const TACHES = () =>
  (
    JSON.parse(lire('docs/tasks.json')) as {
      taches: { id: string; phase: number; reqs: string[] }[];
    }
  ).taches;
const ANNEXE = () => lire(CHEMIN_ANNEXE);
const copie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ── la RÉSOLUTION d'un titre : l'identifiant qu'il s'attribue, contre le TEXTE nommé ──────────────

/** Un titre lu dans un fichier de spécification : sa ligne, son texte, son corps. */
type Titre = { fichier: string; ligne: number; texte: string; corps: string };
type Refus = { famille: string; message: string };

const IDENTIFIANT = /REQ-[A-Z]+-\d{3}/g;
/** Le même motif SANS `g` : `.test()` sur un motif global garde `lastIndex` d'un appel à l'autre. */
const NOMME_UNE_EXIGENCE = new RegExp(IDENTIFIANT.source);

/**
 * Les titres d'un fichier de spécification, lus par LA lecture du dépôt — celle de `gov:trace`,
 * `scripts/lot/titres-ecrits.ts` — et jamais par une seconde. Ce fichier en avait écrit une, ligne à
 * ligne, qui ratait les titres écrits à la ligne suivante de leur ouverture et prenait l'argument
 * d'un `.skipIf(…)` pour un titre (refus A09 · simplicite et A09 · securite, PR 55). N'est ajouté ici
 * que ce que la lecture partagée ne rend pas : la LIGNE de l'ouverture et le CORPS du bloc ouvert.
 */
export function titresDe(fichier: string, source: string): Titre[] {
  const lignes = source.split(/\r?\n/);
  return titresEcritsPositionnes(source).map(({ texte, debut }) => {
    const i = source.slice(0, debut).split(/\r?\n/).length - 1;
    const indentation = lignes[i]!.length - lignes[i]!.trimStart().length;
    let fin = lignes.length;
    for (let j = i + 1; j < lignes.length; j++) {
      const l = lignes[j]!;
      if (!l.trim()) continue;
      if (l.length - l.trimStart().length <= indentation && /^\s*[})]/.test(l)) {
        fin = j;
        break;
      }
    }
    return { fichier, ligne: i + 1, texte, corps: lignes.slice(i + 1, fin).join('\n') };
  });
}

/**
 * Ce qu'un titre AFFIRME, confronté à ce que le registre DIT. On rend les refus NOMMÉS, jamais un
 * booléen : une garde qui ne nomme pas ce qu'elle refuse oblige à relire le code pour savoir ce qui
 * cloche.
 */
export function resoudre(titres: readonly Titre[], exigences: readonly Exigence[]): Refus[] {
  const parId = new Map(exigences.map((e) => [e.id, e]));
  const refus: Refus[] = [];
  for (const t of titres) {
    for (const id of new Set(t.texte.match(IDENTIFIANT) ?? [])) {
      const e = parId.get(id);
      if (!e) {
        refus.push({
          famille: 'exigence_inexistante',
          message: `${t.fichier}:${t.ligne} nomme ${id}, qui n'a aucun texte au registre.`,
        });
        continue;
      }
      if (e.statut === 'absorbee') {
        // Un identifiant absorbé garde le droit d'étiqueter un titre — 26 des 33 absorbées sont
        // encore citées légitimement — À LA CONDITION que le titre porte son RENVOI, comme
        // `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` l'exige du registre : « → voir REQ-XXX ». Le renvoi
        // se dérive de `remplaceePar` ; il ne se liste nulle part. Et il est exigé du TITRE, pas du
        // `describe` qui l'entoure : c'est le titre que `gov:trace` lit, et c'est le titre qu'un
        // lecteur voit passer dans une sortie de test.
        if (!(e.remplaceePar && t.texte.includes(e.remplaceePar))) {
          refus.push({
            famille: 'texte_remplace',
            message:
              `${t.fichier}:${t.ligne} nomme ${id}, dont le registre déclare le texte REMPLACÉ par ` +
              `${e.remplaceePar ?? '(rien)'} : ce titre s'adosse à un texte hors vigueur sans porter ` +
              `son renvoi. Écris « ${id} → ${e.remplaceePar ?? 'REQ-…'} » dans le titre.`,
          });
        }
        continue;
      }
      if (e.texte.trim().length === 0) {
        refus.push({
          famille: 'texte_vide',
          message: `${t.fichier}:${t.ligne} nomme ${id}, qui existe et ne dit rien.`,
        });
      }
    }
  }
  return refus;
}

/** Le périmètre de `gov:trace`, et aucun autre : `*.test.ts` et `.tsx` compris. */
const SPECS = () => fichiersDeTest();
const TOUS_LES_TITRES = (): Titre[] => SPECS().flatMap((f) => titresDe(f, lire(f)));

describe('REQ-QA-014 — la sonde MESURE quelque chose : sans plancher, une lecture vide passerait pour un dépôt sain', () => {
  it('REQ-QA-014 — les fichiers de spécification suivis, les titres lus et les titres à identifiant sont tous NON VIDES', () => {
    const specs = SPECS();
    expect(
      specs.length,
      'aucun fichier de spécification suivi : la sonde lit le vide'
    ).toBeGreaterThan(0);
    const titres = TOUS_LES_TITRES();
    expect(titres.length, 'aucun titre lu dans les spécifications suivies').toBeGreaterThan(0);
    // Le plancher n'est pas « plus que zéro » : c'est le compte de LA lecture des titres. Un titre
    // qu'elle lit et que la sonde ne confronte pas est exactement l'angle mort du refus de la PR 55.
    expect(
      titres.length,
      'la sonde confronte moins de titres que la lecture partagée n’en lit'
    ).toBe(SPECS().reduce((n, f) => n + titresEcrits(lire(f)).length, 0));
    const aIdentifiant = titres.filter((t) => NOMME_UNE_EXIGENCE.test(t.texte));
    expect(
      aIdentifiant.length,
      'aucun titre ne nomme une exigence : la confrontation porterait sur rien'
    ).toBeGreaterThan(0);
  });

  it('REQ-QA-014 — TÉMOIN POSITIF : la résolution DISCRIMINE, elle ne rend pas le vide sur tout', () => {
    const exigences = REGISTRE().exigences;
    const inconnu = { fichier: 'x.spec.ts', ligne: 1, texte: 'REQ-ZZZ-999 — inventé', corps: '' };
    expect(resoudre([inconnu], exigences).map((r) => r.famille)).toEqual(['exigence_inexistante']);
  });

  // A10 · mutation (revue 5247514005) : tous les titres des témoins ne portaient qu'UN identifiant.
  // « seul le premier identifiant est lu » et « le renvoi, c'est deux identifiants quelconques »
  // survivaient l'un et l'autre.
  const unTitre = (texte: string) => ({ fichier: 'x.spec.ts', ligne: 1, texte, corps: '' });

  it('REQ-QA-014 — un titre à DEUX identifiants : l’absorbée en SECONDE position, sans renvoi, rougit', () => {
    const r = resoudre([unTitre('REQ-GOV-021 — REQ-GOV-005 : en second')], REGISTRE().exigences);
    expect(r.map((x) => x.message).join('\n')).toContain('x.spec.ts:1 nomme REQ-GOV-005');
  });

  it('REQ-QA-014 — le renvoi est la SURVIVANTE, pas un second identifiant quelconque', () => {
    const exigences = REGISTRE().exigences;
    const faux = resoudre([unTitre('REQ-GOV-005 → REQ-GOV-021 : un autre renvoi')], exigences);
    expect(faux.map((x) => x.message).join('\n')).toContain('x.spec.ts:1 nomme REQ-GOV-005');
    // Contre-témoin : le renvoi vers la survivante que le registre nomme, et lui seul, passe.
    expect(resoudre([unTitre('REQ-GOV-005 → REQ-QA-014 : le renvoi')], exigences)).toEqual([]);
  });

  it('REQ-QA-014 — TÉMOIN de `texte_vide` : une exigence nommée dont le texte est vide rougit', () => {
    const exigences = copie(REGISTRE().exigences);
    exigences.find((x) => x.id === 'REQ-GOV-021')!.texte = '   ';
    expect(resoudre([unTitre('REQ-GOV-021 — vide')], exigences).map((x) => x.famille)).toEqual([
      'texte_vide',
    ]);
  });
});

describe('REQ-QA-014 — sur le dépôt RÉEL, aucun titre ne nomme une exigence dont le texte n’est pas en vigueur', () => {
  it('REQ-QA-014 — aucun titre ne nomme un identifiant absent du registre', () => {
    const r = resoudre(TOUS_LES_TITRES(), REGISTRE().exigences).filter(
      (x) => x.famille === 'exigence_inexistante'
    );
    expect(r.map((x) => x.message).join('\n')).toBe('');
  });

  it('REQ-QA-014 — aucun titre ne s’adosse à un texte que le registre déclare REMPLACÉ', () => {
    const r = resoudre(TOUS_LES_TITRES(), REGISTRE().exigences).filter(
      (x) => x.famille === 'texte_remplace'
    );
    expect(r.map((x) => x.message).join('\n')).toBe('');
  });

  it('REQ-QA-014 — PANNE FABRIQUÉE : une exigence remise en « absorbee » fait rougir les titres qui la nomment', () => {
    const registre = copie(REGISTRE());
    const titres = TOUS_LES_TITRES();
    // on frappe une exigence du MILIEU des exigences réellement nommées par des titres, jamais la dernière
    const nommees = [...new Set(titres.flatMap((t) => t.texte.match(IDENTIFIANT) ?? []))].sort();
    const cible = nommees[Math.floor(nommees.length / 2)]!;
    const e = registre.exigences.find((x) => x.id === cible)!;
    e.statut = 'absorbee';
    e.remplaceePar = registre.exigences.find((x) => x.statut === 'active' && x.id !== cible)!.id;
    const r = resoudre(titres, registre.exigences);
    expect(r.filter((x) => x.famille === 'texte_remplace').length).toBeGreaterThan(0);
    expect(r.map((x) => x.message).join('\n')).toContain(cible);
  });
});

describe('REQ-CPL-018 — la ligne qui teste LÉGITIMEMENT le mono-tenant, et le témoin qui la protège', () => {
  const FICHIER = 'tests/unit/gouvernance/entite-registre.spec.ts';

  it('REQ-QA-014 — tout titre qui nomme REQ-CPL-018 dans la garde d’entité CONSOMME la ligne source de REQ-CPL-018', () => {
    const titres = titresDe(FICHIER, lire(FICHIER)).filter((t) => t.texte.includes('REQ-CPL-018'));
    expect(
      titres.length,
      'plus aucun titre ne teste REQ-CPL-018 : la ligne légitime a disparu'
    ).toBeGreaterThan(0);
    const muets = titres.filter((t) => !t.corps.includes("'REQ-CPL-018'"));
    expect(
      muets.map((t) => `${t.fichier}:${t.ligne} ${t.texte}`).join('\n'),
      'ces titres s’étiquettent REQ-CPL-018 sans jamais lire ce que REQ-CPL-018 dit'
    ).toBe('');
  });

  it('REQ-QA-014 — et ce titre-là lit bien la LIGNE SOURCE de l’exigence, pas une valeur recopiée', () => {
    const titres = titresDe(FICHIER, lire(FICHIER)).filter((t) => t.texte.includes('REQ-CPL-018'));
    expect(
      titres.some((t) => /ligneSource\(\s*EXIGENCES\s*,\s*'REQ-CPL-018'\s*\)/.test(t.corps))
    ).toBe(true);
  });
});

// ── UNE SEULE LECTURE DES TITRES — celle de `gov:trace`, pas une seconde plus étroite ─────────────
//
// Refus d'A09 · simplicite sur la PR 55 (revue 5246990618, tête `7c26fe2`) : ce fichier lisait les
// titres par son PROPRE lecteur, ligne à ligne, qui prenait le premier guillemet après `.each(` ou
// `.skipIf(` pour un titre (« win32 » à `entite-registre.spec.ts:2532`) et ratait tout titre écrit à
// la ligne SUIVANTE. Quinze titres à identifiant, dans trois fichiers, n'étaient jamais confrontés.
// Vu : `REQ-GOV-003` → `REQ-GOV-005` (absorbée) dans le titre `it.each` de
// `identifiants-nus-positions-limites.spec.ts:75-76` laissait ce fichier 17/17 VERT.

describe('REQ-QA-014 — un titre écrit à la ligne SUIVANTE de son ouverture `it.each` est lu, et confronté', () => {
  const FICHIER = 'tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts';
  const SAIN = "'REQ-GOV-003 : le témoin placé en position $position fait rougir la garde'";

  it('REQ-QA-014 — PANNE FABRIQUÉE, le cas vu : une exigence ABSORBÉE sans renvoi dans ce titre ROUGIT', () => {
    const source = lire(FICHIER);
    expect(source, 'le titre frappé a disparu du fichier : le témoin ne frapperait rien').toContain(
      SAIN
    );
    const frappee = source.replace(SAIN, SAIN.replace('REQ-GOV-003', 'REQ-GOV-005'));
    const r = resoudre(titresDe(FICHIER, frappee), REGISTRE().exigences).filter(
      (x) => x.famille === 'texte_remplace'
    );
    expect(r.map((x) => x.message).join('\n')).toContain(`${FICHIER}:75 nomme REQ-GOV-005`);
  });

  it('REQ-QA-014 — CONTRE-TÉMOIN : le même titre, sain, est LU et ne rougit pas', () => {
    const titres = titresDe(FICHIER, lire(FICHIER));
    expect(titres.map((t) => `'${t.texte}'`)).toContain(SAIN);
    expect(resoudre(titres, REGISTRE().exigences)).toEqual([]);
  });

  it('REQ-QA-014 — l’argument d’un `it.skipIf` n’est PAS un titre : le vrai titre est lu à sa place', () => {
    const f = 'tests/unit/gouvernance/entite-registre.spec.ts';
    const textes = titresDe(f, lire(f)).map((t) => t.texte);
    expect(textes).not.toContain('win32');
    expect(textes.some((t) => t.startsWith('REQ-GOV-031 — VETO nom, par le vrai chemin'))).toBe(
      true
    );
  });

  it('REQ-QA-014 — PANNE FABRIQUÉE, forme `skipIf` (A09 · securite, F1) : une exigence absorbée sans renvoi derrière `it.skipIf` ROUGIT', () => {
    const f = 'tests/unit/gouvernance/glossaire-enums.spec.ts';
    // Les ouvertures sont COMPOSÉES : écrites d’un tenant, la lecture des titres les prendrait pour
    // des titres de CE fichier.
    const ouvre = 'it';
    const sain = ouvre + "('REQ-JUR-027 → REQ-DM-038 : le même champ en enum ne rougit pas";
    const source = lire(f);
    expect(source, 'le titre frappé a disparu du fichier : le témoin ne frapperait rien').toContain(
      sain
    );
    const frappee = source.replace(
      sain,
      ouvre +
        ".skipIf(process.platform === 'aix')('REQ-JUR-027 : le même champ en enum ne rougit pas"
    );
    const r = resoudre(titresDe(f, frappee), REGISTRE().exigences).filter(
      (x) => x.famille === 'texte_remplace'
    );
    expect(r.map((x) => x.message).join('\n')).toContain(`${f}:141 nomme REQ-JUR-027`);
  });

  // A09 · exactitude (revue 5247101531) : deux précisions de la même panne.
  it('REQ-QA-014 — une apostrophe ÉCHAPPÉE ne coupe pas le titre : l’identifiant qui la suit est confronté', () => {
    const ouvre = 'it';
    const source = ouvre + "('l\\'exigence REQ-GOV-005 citée sans son renvoi', () => {});\n";
    const r = resoudre(titresDe('x.spec.ts', source), REGISTRE().exigences);
    expect(r.map((x) => x.famille)).toEqual(['texte_remplace']);
  });

  it('REQ-QA-014 — le périmètre de la sonde est CELUI de gov:trace : `.test.ts` et `.tsx` compris', () => {
    for (const f of ['a.spec.ts', 'a.test.ts', 'a.spec.tsx', 'a.test.tsx']) {
      expect(estUnFichierDeTest(f), f).toBe(true);
    }
    expect(estUnFichierDeTest('a.ts')).toBe(false);
    expect(SPECS()).toEqual(fichiersDeTest());
  });

  // A10 · mutation (revue 5247514005) : le dépôt ne porte AUCUN `*.test.ts`, donc la ligne
  // ci-dessus compare une fonction à elle-même, et un périmètre restreint aux `*.spec.ts`
  // survivait. Le témoin fabrique le fichier, dans un vrai dépôt git jetable.
  it('REQ-QA-014 — un vrai `*.test.ts`, dans un dépôt jetable, est lu : une absorbée sans renvoi y rougit', () => {
    const bac = mkdtempSync(join(tmpdir(), 'g39-'));
    try {
      mkdirSync(join(bac, 'tests', 'unit'), { recursive: true });
      const ouvre = 'it';
      writeFileSync(
        join(bac, 'tests', 'unit', 'faute.test.ts'),
        `import { ${ouvre} } from 'vitest';\n` +
          ouvre +
          "('REQ-GOV-005 sans son renvoi', () => {});\n"
      );
      const git = (...a: string[]) => execFileSync('git', a, { cwd: bac, stdio: 'pipe' });
      git('init', '-q');
      git('add', '-A');
      git('-c', 'user.name=temoin', '-c', 'user.email=temoin@invalid', 'commit', '-qm', 'bac');
      const fichiers = fichiersDeTest(bac);
      const faute = fichiers.find((f) => f.endsWith('tests/unit/faute.test.ts'));
      expect(
        faute,
        `le *.test.ts du bac n’est pas dans le périmètre : ${fichiers.join(', ')}`
      ).toBeTruthy();
      const r = resoudre(titresDe(faute!, lire(faute!)), REGISTRE().exigences);
      expect(r.map((x) => x.message).join('\n')).toContain('faute.test.ts:2 nomme REQ-GOV-005');
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });
});

// ── LE TEXTE SURVIVANT CONTIENT LE TEXTE DÉCIDÉ — RM-01 appliqué aux exigences ────────────────────

describe('REQ-QA-014 — les fusions décidées se confrontent au registre, et la garde les LIT toutes', () => {
  it('REQ-QA-014 — l’annexe rend un nombre NON NUL de fusions, chacune avec sa survivante et ses absorbées', () => {
    const f = fusionsDecidees(ANNEXE());
    expect(f.length, 'aucune fusion lue : la garde des fusions mesurerait le vide').toBeGreaterThan(
      0
    );
    expect(f.every((x) => x.absorbees.length > 0)).toBe(true);
    expect(f.every((x) => x.decide.length > 40)).toBe(true);
    expect(f.reduce((n, x) => n + x.absorbees.length, 0)).toBeGreaterThan(f.length);
  });

  it('REQ-QA-014 — les MARQUEURS d’un texte décidé se DÉRIVENT de ses spans de code', () => {
    const f = fusionsDecidees(ANNEXE());
    const total = f.reduce((n, x) => n + marqueursDe(x.decide).length, 0);
    expect(total, 'aucun marqueur dérivé : la confrontation porterait sur rien').toBeGreaterThan(0);
    expect(marqueursDe('a `un` b `deux`')).toEqual(['un', 'deux']);
  });

  it('REQ-QA-014 — le dépôt RÉEL : aucune clause décidée perdue qui ne soit déclarée en dette', () => {
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), ANNEXE()).filter(
      (f) => f.famille === 'texte_decide_perdu'
    );
    expect(fautes.map((f) => f.message).join('\n')).toBe('');
  });

  it('REQ-QA-014 — et aucune dette PÉRIMÉE : une clause redevenue présente doit être RETIRÉE du registre des dettes', () => {
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), ANNEXE()).filter(
      (f) => f.famille === 'dette_texte_decide_perimee'
    );
    expect(fautes.map((f) => f.message).join('\n')).toBe('');
  });

  it('REQ-QA-014 — PANNE FABRIQUÉE, sur une fusion du MILIEU : une clause décidée retirée du texte survivant rougit et se NOMME', () => {
    const annexe = ANNEXE();
    const fusions = fusionsDecidees(annexe);
    // le MILIEU de la liste, jamais le dernier élément : sinon le témoin ne distingue pas « toutes » de « la dernière »
    const cible = fusions.filter((f) => marqueursDe(f.decide).length > 0)[
      Math.floor(fusions.filter((f) => marqueursDe(f.decide).length > 0).length / 2)
    ]!;
    const marqueur = marqueursDe(cible.decide).find(
      (m) =>
        !DETTE_TEXTE_DECIDE.some(
          (d) => d.survivante === cible.survivante && d.marqueurs.includes(m)
        )
    )!;
    const registre = copie(REGISTRE());
    const e = registre.exigences.find((x) => x.id === cible.survivante)!;
    e.texte = e.texte.split(marqueur).join('(clause retirée)');
    const fautes = controler(registre, SCHEMA(), TACHES(), annexe).filter(
      (f) => f.famille === 'texte_decide_perdu'
    );
    expect(fautes.length).toBeGreaterThan(0);
    expect(fautes.map((f) => f.message).join('\n')).toContain(cible.survivante);
    expect(fautes.map((f) => f.message).join('\n')).toContain(marqueur);
  });

  // A09 · securite, F2 (revue 5247018537) : la présence d'un marqueur se jugeait par SOUS-CHAÎNE.
  // `siren` n'était « repris » par REQ-DM-021 que dans `siren_manquant`, `signe` par REQ-ARG-016 que
  // dans `mandat_non_signe` : deux clauses décidées perdues passaient en exit 0.
  const MOT = /[\p{L}\p{N}_]/u;
  const marqueurCandidat = () => {
    const registre = REGISTRE();
    const candidats = fusionsDecidees(ANNEXE()).flatMap((f) => {
      const e = registre.exigences.find((x) => x.id === f.survivante);
      const dette = DETTE_TEXTE_DECIDE.find((d) => d.survivante === f.survivante)?.marqueurs ?? [];
      return marqueursDe(f.decide)
        .filter((m) => MOT.test(m[0]!) && MOT.test(m.at(-1)!) && !dette.includes(m))
        .filter((m) => (e?.texte ?? '').replace(/\s+/g, ' ').includes(m))
        .map((m) => ({ survivante: f.survivante, m }));
    });
    expect(
      candidats.length,
      'aucun marqueur-mot repris : le témoin ne frapperait rien'
    ).toBeGreaterThan(0);
    // le MILIEU, jamais le dernier
    return candidats[Math.floor(candidats.length / 2)]!;
  };

  it('REQ-QA-014 — PANNE FABRIQUÉE : un marqueur logé DANS un identifiant plus long n’est PAS repris, et rougit', () => {
    const { survivante, m } = marqueurCandidat();
    const registre = copie(REGISTRE());
    const e = registre.exigences.find((x) => x.id === survivante)!;
    e.texte = e.texte.split(m).join(`${m}_hote`);
    const fautes = controler(registre, SCHEMA(), TACHES(), ANNEXE()).filter(
      (f) => f.famille === 'texte_decide_perdu'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain(
      `${survivante} : l'arbitrage décidé porte « ${m} »`
    );
  });

  it('REQ-QA-014 — CONTRE-TÉMOIN : le même marqueur, délimité par une ponctuation, reste repris', () => {
    const { survivante, m } = marqueurCandidat();
    const registre = copie(REGISTRE());
    const e = registre.exigences.find((x) => x.id === survivante)!;
    e.texte = e.texte.split(m).join(`(${m})`);
    const fautes = controler(registre, SCHEMA(), TACHES(), ANNEXE()).filter(
      (f) => f.famille === 'texte_decide_perdu'
    );
    expect(fautes.map((f) => f.message).join('\n')).not.toContain(`« ${m} »`);
  });

  // 🔑 Le registre réel des dettes est VIDE depuis le 2026-09-19 (les 25 clauses résorbées, sur
  // décision de Will). Les témoins des deux branches ne tirent donc plus une dette du registre :
  // ils la FABRIQUENT, et la passent par le paramètre `dettes` — celui dont la valeur par défaut
  // est le registre réel. Une dette tirée d'un registre vide serait `undefined`, et le témoin
  // tomberait sur une TypeError : un rouge qui n'est pas celui qu'on mesure.
  const detteFabriquee = (): DetteTexteDecide & { m: string } => {
    const fusions = fusionsDecidees(ANNEXE()).filter((f) => marqueursDe(f.decide).length > 0);
    const f = fusions[Math.floor(fusions.length / 2)]!; // le MILIEU, jamais le dernier
    const m = marqueursDe(f.decide)[0]!;
    return { survivante: f.survivante, marqueurs: [m], motif: 'témoin', m };
  };

  it('REQ-QA-014 — le registre réel des dettes est RÉSORBÉ : zéro clause décidée déclarée perdue', () => {
    expect(DETTE_TEXTE_DECIDE).toEqual([]);
  });

  it('REQ-QA-014 — PANNE FABRIQUÉE : une dette qui n’a plus d’objet ROUGIT, elle ne se tait pas', () => {
    const dette = detteFabriquee();
    // la clause est PRÉSENTE dans le texte réel : la déclarer perdue est une dette sans objet
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), ANNEXE(), [dette]).filter(
      (f) => f.famille === 'dette_texte_decide_perimee'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain(
      `${dette.survivante} : « ${dette.m} » est REVENU`
    );
  });

  it('REQ-QA-014 — CONTRE-TÉMOIN : sans la dette fabriquée, le même registre ne rougit pas', () => {
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), ANNEXE(), []).filter(
      (f) => f.famille === 'dette_texte_decide_perimee'
    );
    expect(fautes).toEqual([]);
  });

  // A10 · mutation (revue 5247514005) : le témoin ci-dessus n'exerce que la branche « clause
  // REVENUE ». L'autre — la dette dont l'annexe ne porte plus la clause — survivait neutralisée.
  it('REQ-QA-014 — PANNE FABRIQUÉE : une dette dont l’annexe ne met PLUS la clause en code rougit', () => {
    const dette = detteFabriquee();
    const m = dette.m;
    const annexe = ANNEXE();
    expect(annexe, `l’annexe ne porte pas « ${m} » en code`).toContain('`' + m + '`');
    const frappee = annexe.split('`' + m + '`').join(m);
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), frappee, [dette]).filter(
      (f) => f.famille === 'dette_texte_decide_perimee'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain(
      `La dette « ${dette.survivante} / ${m} »`
    );
  });

  // A10 · mutation : les témoins frappaient la fusion du MILIEU, jamais la DERNIÈRE — une boucle
  // qui saute la dernière survivait (REQ-SEC-022 sans sa clause passait en exit 0).
  it('REQ-QA-014 — PANNE FABRIQUÉE, sur la DERNIÈRE fusion ET sur une du milieu : chaque clause retirée rougit', () => {
    const fusions = fusionsDecidees(ANNEXE());
    const horsDette = (f: (typeof fusions)[number]) =>
      marqueursDe(f.decide).filter(
        (m) =>
          !DETTE_TEXTE_DECIDE.some((d) => d.survivante === f.survivante && d.marqueurs.includes(m))
      );
    for (const cible of [fusions[Math.floor(fusions.length / 2)]!, fusions.at(-1)!]) {
      const m = horsDette(cible)[0];
      expect(m, `${cible.survivante} ne porte aucun marqueur hors dette`).toBeTruthy();
      const registre = copie(REGISTRE());
      const e = registre.exigences.find((x) => x.id === cible.survivante)!;
      e.texte = e.texte.split(m!).join('(clause retirée)');
      const fautes = controler(registre, SCHEMA(), TACHES(), ANNEXE()).filter(
        (f) => f.famille === 'texte_decide_perdu'
      );
      expect(fautes.map((f) => f.message).join('\n')).toContain(
        `${cible.survivante} : l'arbitrage décidé porte « ${m} »`
      );
    }
  });

  it('REQ-QA-014 — PANNE FABRIQUÉE : une absorbée que le registre ne MARQUE pas rougit, et le renvoi est jugé dans les DEUX sens', () => {
    const annexe = ANNEXE();
    const fusions = fusionsDecidees(annexe);
    const cible = fusions[Math.floor(fusions.length / 2)]!;
    const registre = copie(REGISTRE());
    const a = registre.exigences.find((x) => x.id === cible.absorbees[0])!;
    a.remplaceePar = registre.exigences.find(
      (x) => x.statut === 'active' && x.id !== cible.survivante
    )!.id;
    const fautes = controler(registre, SCHEMA(), TACHES(), annexe).filter(
      (f) => f.famille === 'fusion_absorbee_non_marquee'
    );
    expect(fautes.length).toBeGreaterThan(0);
    expect(fautes.map((f) => f.message).join('\n')).toContain(cible.absorbees[0]!);
  });

  it('REQ-QA-014 — PANNE FABRIQUÉE : une annexe ILLISIBLE refuse, elle ne rend pas « zéro fusion, tout va bien »', () => {
    const fautes = controler(
      REGISTRE(),
      SCHEMA(),
      TACHES(),
      '# rien\n\npas une puce d arbitrage\n'
    );
    expect(fautes.some((f) => f.famille === 'annexe_sans_fusion')).toBe(true);
  });

  // A09 · exactitude, motif 2 (revue 5247101531) : le plancher ne tombait qu'à ZÉRO fusion lue.
  // Une puce reformulée disparaissait de la confrontation sans un mot, et avec elle son texte décidé.
  const PUCE_QA_014 = '- garder **REQ-QA-014**, absorber';

  it('REQ-QA-014 — PANNE FABRIQUÉE : une puce de fusion que la garde ne sait plus lire est REFUSÉE, et nommée', () => {
    const annexe = ANNEXE();
    expect(annexe, 'la puce frappée a disparu de l’annexe').toContain(PUCE_QA_014);
    const frappee = annexe.replace(PUCE_QA_014, '- garder **REQ-QA-014** (traçabilité), absorber');
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), frappee).filter(
      (f) => f.famille === 'annexe_sans_fusion'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain('REQ-QA-014');
  });

  it('REQ-QA-014 — PANNE FABRIQUÉE : une puce de fusion RETIRÉE fait diverger le compte lu du compte que l’annexe déclare', () => {
    const annexe = ANNEXE();
    const lignes = annexe.split('\n');
    const i = lignes.findIndex((l) => l.startsWith(PUCE_QA_014));
    expect(i, 'la puce frappée a disparu de l’annexe').toBeGreaterThan(0);
    const frappee = [...lignes.slice(0, i), ...lignes.slice(i + 1)].join('\n');
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), frappee).filter(
      (f) => f.famille === 'annexe_sans_fusion'
    );
    expect(fautes.length).toBeGreaterThan(0);
  });

  it('REQ-QA-014 — CONTRE-TÉMOIN : l’annexe réelle se lit entière, son compte déclaré compris', () => {
    const fautes = controler(REGISTRE(), SCHEMA(), TACHES(), ANNEXE()).filter(
      (f) => f.famille === 'annexe_sans_fusion'
    );
    expect(fautes.map((f) => f.message).join('\n')).toBe('');
  });
});

describe('REQ-QA-014 — les APPELANTS de la garde sont exercés, pas seulement sa règle', () => {
  const lancer = (args: string[]) => {
    try {
      return {
        code: 0,
        sortie: execFileSync('npx', ['tsx', 'scripts/gates/gov-requirements.ts', ...args], {
          encoding: 'utf8',
          stdio: 'pipe',
          shell: process.platform === 'win32',
        }),
      };
    } catch (e) {
      const err = e as { status: number; stdout?: string; stderr?: string };
      return { code: err.status ?? 1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };

  // Le registre des dettes étant VIDE, aucune donnée du bac ne peut plus amener
  // `dette_texte_decide_perimee` au binaire. Son témoin d'APPELANT passe par `modeNormal()`, la
  // fonction que le binaire exécute telle quelle : un mode normal qui écarterait cette famille
  // rougit ici (refus A10 · mutation de la PR 55, transposé).
  it('REQ-QA-014 — le mode NORMAL sort en 1 et NOMME `dette_texte_decide_perimee` sur une dette fabriquée', () => {
    const fusions = fusionsDecidees(ANNEXE()).filter((f) => marqueursDe(f.decide).length > 0);
    const f = fusions[Math.floor(fusions.length / 2)]!;
    const src = {
      doc: REGISTRE() as unknown as Parameters<typeof modeNormal>[0]['doc'],
      schema: SCHEMA(),
      taches: TACHES() as unknown as Parameters<typeof modeNormal>[0]['taches'],
      annexe: ANNEXE(),
    };
    const sain = modeNormal(src);
    expect(sain.code, sain.lignes.join('\n')).toBe(0);
    const r = modeNormal(src, [
      { survivante: f.survivante, marqueurs: [marqueursDe(f.decide)[0]!], motif: 'témoin' },
    ]);
    expect(r.code).toBe(1);
    expect(r.lignes.join('\n')).toContain('── dette_texte_decide_perimee (1)');
  });

  it('REQ-QA-014 — le mode NORMAL du binaire sort en zéro sur le dépôt réel', () => {
    const r = lancer([]);
    expect(r.code, r.sortie).toBe(0);
  }, 120_000);

  it('REQ-QA-014 — `--prove` sort en zéro ET NOMME chacune de ses familles : chacune a son témoin dans la garde', () => {
    const r = lancer(['--prove']);
    expect(r.code, r.sortie).toBe(0);
    // Dérivées de `FAMILLES`, jamais retapées : la liste des cinq familles neuves l'était, et une
    // dix-septième n'aurait pas été nommée par ce test.
    for (const famille of FAMILLES) {
      expect(r.sortie).toContain(famille);
    }
  }, 120_000);
});
