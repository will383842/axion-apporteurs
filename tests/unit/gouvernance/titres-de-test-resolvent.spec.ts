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
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import {
  controler,
  DETTE_TEXTE_DECIDE,
  fusionsDecidees,
  marqueursDe,
  CHEMIN_ANNEXE,
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

/**
 * L'ouverture d'un `it()`, d'un `test()` ou d'un `describe()`, et rien d'autre. Les variantes
 * (`.each`, `.skipIf`, `.skip`, `.only`, `.todo`) se dérivent de la forme, elles ne se listent pas
 * une deuxième fois ailleurs.
 */
const OUVRE_UN_TITRE =
  /^(\s*)(?:it|test|describe)(?:\.each\(|\.skipIf\(|\.skip|\.only|\.todo)?[\s\S]{0,400}?(['"`])([\s\S]*?)\2/;
const IDENTIFIANT = /REQ-[A-Z]+-\d{3}/g;

/** Les titres d'un fichier de spécification, avec le corps du bloc qu'ils ouvrent. */
export function titresDe(fichier: string, source: string): Titre[] {
  const lignes = source.split(/\r?\n/);
  const titres: Titre[] = [];
  lignes.forEach((l, i) => {
    const m = OUVRE_UN_TITRE.exec(l);
    if (!m) return;
    const indentation = m[1]!.length;
    let fin = lignes.length;
    for (let j = i + 1; j < lignes.length; j++) {
      const s = lignes[j]!;
      if (!s.trim()) continue;
      const k = s.length - s.trimStart().length;
      if (k <= indentation && /^\s*\}\)/.test(s)) {
        fin = j;
        break;
      }
    }
    titres.push({
      fichier,
      ligne: i + 1,
      texte: m[3]!,
      corps: lignes.slice(i + 1, fin).join('\n'),
    });
  });
  return titres;
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

const SPECS = () => fichiersSuivis().filter((f) => f.endsWith('.spec.ts'));
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
    const aIdentifiant = titres.filter((t) => IDENTIFIANT.test(t.texte));
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

  it('REQ-QA-014 — PANNE FABRIQUÉE : une dette qui n’a plus d’objet ROUGIT, elle ne se tait pas', () => {
    const dette = DETTE_TEXTE_DECIDE[Math.floor(DETTE_TEXTE_DECIDE.length / 2)]!;
    const registre = copie(REGISTRE());
    const e = registre.exigences.find((x) => x.id === dette.survivante)!;
    e.texte = `${e.texte} ${dette.marqueurs.map((m) => '`' + m + '`').join(' ')}`;
    const fautes = controler(registre, SCHEMA(), TACHES(), ANNEXE()).filter(
      (f) => f.famille === 'dette_texte_decide_perimee'
    );
    expect(fautes.length).toBeGreaterThan(0);
    expect(fautes.map((f) => f.message).join('\n')).toContain(dette.survivante);
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

  it('REQ-QA-014 — le mode NORMAL du binaire sort en zéro sur le dépôt réel', () => {
    const r = lancer([]);
    expect(r.code, r.sortie).toBe(0);
  }, 120_000);

  it('REQ-QA-014 — `--prove` sort en zéro ET NOMME les familles neuves : chacune a son témoin dans la garde', () => {
    const r = lancer(['--prove']);
    expect(r.code, r.sortie).toBe(0);
    for (const famille of [
      'annexe_sans_fusion',
      'fusion_survivante_inconnue',
      'fusion_absorbee_non_marquee',
      'texte_decide_perdu',
      'dette_texte_decide_perimee',
    ]) {
      expect(r.sortie).toContain(famille);
    }
  }, 120_000);
});
