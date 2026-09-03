/**
 * Les affirmations sur le code d'axionia, exercées comme des tests — GOV-004, REQ-GOV-004.
 *
 * POURQUOI CE FICHIER EXISTE. REQ-GOV-004 ne demande pas seulement un tableau : elle demande
 * qu'« un test vérifie la présence de ces cinq entrées » au registre des décisions, et que la
 * colonne « vérifié le » ne soit jamais vide sur une source qui cite du code. Un document peut
 * perdre une ligne sans que personne ne le remarque ; c'est exactement ce qui s'est produit en
 * amont de cette tâche, où cinq affirmations fausses ont circulé des semaines comme des faits.
 *
 * CE QUE CE FICHIER AJOUTE À LA GARDE. `pnpm gov:sonde` tient déjà les onze familles de règle et
 * sait rougir sur chacune (`--prove`). Ce test-ci fait trois choses de plus :
 *   1. il rend la garde exécutable depuis `pnpm test`, comme `gardes.spec.ts` le fait pour les
 *      cinq gardes déjà armées ;
 *   2. il exerce NOMMÉMENT les cinq entrées de REQ-GOV-004 — le test que l'exigence réclame par
 *      son texte, et qui doit rougir en nommant l'entrée disparue, pas « une faute de plus » ;
 *   3. il fait ROUGIR la garde pour de vrai, sur un dépôt fictif où l'on retire une entrée du
 *      registre puis où l'on vide une colonne « vérifié le ». Une garde qu'on n'a jamais vue
 *      rougir dans la suite de tests n'est pas prouvée par la suite de tests.
 *
 * Le dépôt fictif est un dossier créé ICI, et détruit ICI. Rien n'est effacé qui n'ait été posé
 * par ce fichier — un nettoyage de test qui balaie un dossier qu'il n'a pas créé efface le
 * travail du voisin.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = 'scripts/gates/gov-sonde.ts';
const AFFIRMATIONS = 'docs/AFFIRMATIONS-AXIONIA.md';
const DECISIONS = 'docs/DECISIONS.md';
const REGISTRE = 'docs/requirements.json';
const TACHES = 'docs/tasks.json';

/** L'acceptation de GOV-004 : « ≥ 25 affirmations avec "vérifié le" ». */
const MINIMUM_AFFIRMATIONS = 25;
/** Les onze familles de règle de `gov:sonde`. Le nombre est l'invariant que `--prove` annonce. */
const FAMILLES = 11;
/** `AAAA-MM-JJ @ <SHA court>` : la date seule ne dit pas CONTRE QUOI la ligne a été rejouée. */
const DATE_ET_SHA = /^\d{4}-\d{2}-\d{2}\s*@\s*[0-9a-f]{7,40}$/;

function lancer(args: string[], cwd?: string): { code: number; sortie: string } {
  const chemin = cwd === undefined ? SCRIPT : `"${resolve(SCRIPT)}"`;
  const r = spawnSync('npx', ['tsx', chemin, ...args], { encoding: 'utf8', shell: true, cwd });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/**
 * Découpe une ligne de tableau en respectant les barres ÉCHAPPÉES. Les accents graves ne
 * protègent PAS le séparateur de colonnes : `\|` est du texte, `|` est une nouvelle colonne.
 */
function decouper(ligne: string): string[] {
  const brut = ligne.trim();
  const out: string[] = [];
  let courant = '';
  for (let i = 0; i < brut.length; i++) {
    if (brut[i] === '\\' && brut[i + 1] === '|') {
      courant += '\\|';
      i++;
      continue;
    }
    if (brut[i] === '|') {
      out.push(courant);
      courant = '';
      continue;
    }
    courant += brut[i];
  }
  out.push(courant);
  while (out.length > 0 && (out[0] as string).trim() === '') out.shift();
  while (out.length > 0 && (out[out.length - 1] as string).trim() === '') out.pop();
  return out.map((c) => c.trim());
}

const texteAffirmations = readFileSync(AFFIRMATIONS, 'utf8');
const texteDecisions = readFileSync(DECISIONS, 'utf8');

const TITRE_TABLEAU = '## 2. Tableau des affirmations';

/**
 * Les lignes du tableau §2, lues telles que la garde les lit : DANS SA SECTION, jamais par un
 * simple filtre sur `| AFF-`. Le §3 liste les affirmations non vérifiables, avec quatre colonnes
 * et sans date : les ramasser ici ferait rougir les contrôles de forme sur des lignes qui ne
 * prétendent rien prouver — le test accuserait le document au lieu de le garder.
 */
function lignesDuTableau(texte: string): { brute: string; cellules: string[] }[] {
  const toutes = texte.split('\n');
  const debut = toutes.findIndex((l) => l.trim() === TITRE_TABLEAU);
  if (debut < 0) return [];
  const out: { brute: string; cellules: string[] }[] = [];
  for (let i = debut + 1; i < toutes.length; i++) {
    const l = toutes[i] as string;
    if (l.startsWith('## ')) break;
    if (!/^\s*\|\s*AFF-\d+\s*\|/.test(l)) continue;
    out.push({ brute: l, cellules: decouper(l) });
  }
  return out;
}

const lignesTableau = lignesDuTableau(texteAffirmations);

// ── 1. La garde, exécutable depuis `pnpm test` ────────────────────────────────

describe('gov:sonde', () => {
  it('est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer([]);
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it(`sait rougir : ses ${FAMILLES} familles ont chacune un témoin`, () => {
    const { code, sortie } = lancer(['--prove']);
    expect(code).toBe(0);
    expect(sortie).toContain(`Les ${FAMILLES} familles rougissent`);
  });

  it('énumère ses familles une par une, jamais un total de fautes', () => {
    // Une preuve qui COMPTE des fautes ne prouve aucune famille : deux détections dans une même
    // famille peuvent tenir lieu de preuve pour une famille qui n'a jamais rougi. La sortie doit
    // donc nommer les onze familles, une par ligne.
    const { sortie } = lancer(['--prove']);
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces.length).toBe(FAMILLES);
  });
});

// ── 2. Les cinq entrées que REQ-GOV-004 exige AU REGISTRE ─────────────────────

/**
 * Les cinq libellés sont ceux du texte de l'exigence, dans son ordre. Le motif est ce qui doit se
 * lire sur la ligne du registre ; la mention `FAUSSE` doit être sur la MÊME ligne — une mention
 * posée deux paragraphes plus loin ne dit pas de quelle affirmation elle parle.
 */
const CINQ_INVALIDEES: { libelle: string; motif: RegExp; repere: string }[] = [
  { libelle: 'Invoice', motif: /`Invoice`/, repere: 'AFF-01' },
  { libelle: 'Refund', motif: /`Refund`/, repere: 'AFF-02' },
  { libelle: 'payerSiret', motif: /payerSiret/, repere: 'AFF-05' },
  { libelle: 'montant HT encaissé', motif: /amountCents/, repere: 'AFF-04' },
  { libelle: 'C3 codé', motif: /cha[îi]ne de r[ée]solution/i, repere: 'AFF-06' },
];

describe('REQ-GOV-004 — les cinq affirmations invalidées figurent au registre', () => {
  const lignesRegistre = texteDecisions.split('\n');

  it.each(CINQ_INVALIDEES)('« $libelle » y est, avec la mention FAUSSE', ({ motif }) => {
    const ligne = lignesRegistre.find((l) => motif.test(l) && l.includes('FAUSSE'));
    expect(ligne).toBeDefined();
  });

  it.each(CINQ_INVALIDEES)('« $libelle » renvoie à son repère $repere du tableau §2', ({ motif, repere }) => {
    // Le registre DÉRIVE du tableau : il ne recopie pas la preuve, il pointe la ligne qui la
    // porte. Sans ce renvoi, une réalité constatée vieillit au registre sans date ni SHA.
    const ligne = lignesRegistre.find((l) => motif.test(l) && l.includes('FAUSSE'));
    expect(ligne).toContain(repere);
    expect(lignesTableau.some((t) => (t.cellules[0] ?? '') === repere)).toBe(true);
  });

  it('les cinq sont bien cinq — ni quatre par fusion, ni six par ajout silencieux', () => {
    const trouvees = CINQ_INVALIDEES.filter(({ motif }) =>
      lignesRegistre.some((l) => motif.test(l) && l.includes('FAUSSE'))
    );
    expect(trouvees).toHaveLength(5);
  });
});

// ── 3. La colonne « vérifié le » : chemin, ligne, date, SHA ───────────────────

describe('REQ-GOV-004 — la colonne « vérifié le »', () => {
  it(`le tableau §2 porte au moins ${MINIMUM_AFFIRMATIONS} affirmations`, () => {
    expect(lignesTableau.length).toBeGreaterThanOrEqual(MINIMUM_AFFIRMATIONS);
  });

  it('aucune ligne ne porte une colonne « vérifié le » vide', () => {
    const vides = lignesTableau.filter((l) => (l.cellules[4] ?? '').trim() === '');
    expect(vides.map((l) => l.cellules[0])).toEqual([]);
  });

  it('chaque ligne porte une DATE et un SHA, pas seulement une date', () => {
    const malFormees = lignesTableau
      .filter((l) => !DATE_ET_SHA.test((l.cellules[4] ?? '').replace(/[`*]/g, '').trim()))
      .map((l) => `${l.cellules[0]} → « ${l.cellules[4]} »`);
    expect(malFormees).toEqual([]);
  });

  it('chaque ligne a exactement cinq colonnes : une barre nue en fabriquerait une sixième', () => {
    const malDecoupees = lignesTableau.filter((l) => l.cellules.length !== 5).map((l) => l.cellules[0]);
    expect(malDecoupees).toEqual([]);
  });

  it('chaque ligne cite un chemin dans sa colonne de preuve', () => {
    const sansChemin = lignesTableau
      .filter((l) => !/[A-Za-z0-9_.[\]@-]+\/[A-Za-z0-9_.[\]@*-]+/.test(l.cellules[3] ?? ''))
      .map((l) => l.cellules[0]);
    expect(sansChemin).toEqual([]);
  });
});

// ── 4. Les huit points de l'acceptation de GOV-004 ────────────────────────────

/**
 * L'acceptation nomme huit affirmations fausses à marquer. Deux d'entre elles — le patron Calendly
 * et le score enregistré sans son barème — manquaient au premier jet : une acceptation dont deux
 * points n'ont aucun verdict n'a pas été tenue, elle a été contournée.
 */
const HUIT_POINTS: { point: string; motif: RegExp }[] = [
  { point: 'Invoice', motif: /`Invoice`/ },
  { point: 'Refund', motif: /`Refund`/ },
  { point: 'payerSiret', motif: /payerSiret/ },
  { point: 'HT encaissé', motif: /amountCents/ },
  { point: 'chaîne de résolution du client', motif: /encaissement[^|]{0,200}SIREN/ },
  { point: 'patron Calendly', motif: /Calendly/ },
  { point: 'index EmargementToken', motif: /emargement_token|EmargementToken/ },
  { point: 'score sans version de barème', motif: /SCORE_POIDS/ },
];

describe("acceptation de GOV-004 — les huit points ont chacun leur ligne", () => {
  const tableau = lignesTableau.map((l) => l.brute).join('\n');

  it.each(HUIT_POINTS)('« $point » a une ligne au tableau §2', ({ motif }) => {
    expect(motif.test(tableau)).toBe(true);
  });
});

// ── 5. Le rouge, vu pour de vrai ──────────────────────────────────────────────

/**
 * Un dépôt fictif : les quatre fichiers que la garde lit, copiés, puis abîmés d'une seule
 * modification à la fois. Il est créé ici et détruit ici.
 */
const bacs: string[] = [];

function bacDeSable(modifier: (fichiers: { affirmations: string; decisions: string }) => {
  affirmations?: string;
  decisions?: string;
}): string {
  const racine = mkdtempSync(join(tmpdir(), 'gov-sonde-spec-'));
  bacs.push(racine);
  mkdirSync(join(racine, 'docs'), { recursive: true });
  copyFileSync(REGISTRE, join(racine, REGISTRE));
  copyFileSync(TACHES, join(racine, TACHES));
  const patch = modifier({ affirmations: texteAffirmations, decisions: texteDecisions });
  writeFileSync(join(racine, AFFIRMATIONS), patch.affirmations ?? texteAffirmations, 'utf8');
  writeFileSync(join(racine, DECISIONS), patch.decisions ?? texteDecisions, 'utf8');
  return racine;
}

afterAll(() => {
  // Ne détruire QUE ce que ce fichier a posé.
  for (const b of bacs) rmSync(b, { recursive: true, force: true });
});

describe('la garde rougit — vu, pas supposé', () => {
  it('elle est verte sur le dépôt fictif intact : le bac de sable ne triche pas', () => {
    const { code, sortie } = lancer([], bacDeSable(() => ({})));
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('ROUGE si une des cinq entrées disparaît du registre', () => {
    const racine = bacDeSable(({ decisions }) => ({
      decisions: decisions
        .split('\n')
        .filter((l) => !(/`Refund`/.test(l) && l.includes('FAUSSE')))
        .join('\n'),
    }));
    const { code, sortie } = lancer([], racine);
    expect(code).not.toBe(0);
    expect(sortie).toContain('invalidee_absente_du_registre');
    expect(sortie).toContain('Refund');
  });

  it('ROUGE si une colonne « vérifié le » est vidée', () => {
    const racine = bacDeSable(({ affirmations }) => ({
      affirmations: affirmations
        .split('\n')
        .map((l) => (l.trimStart().startsWith('| AFF-01 ') ? l.replace('2026-09-03 @ ad53f14a', '') : l))
        .join('\n'),
    }));
    const { code, sortie } = lancer([], racine);
    expect(code).not.toBe(0);
    expect(sortie).toContain('date_ou_sha_manquant');
  });

  it('ROUGE si la date perd son SHA — une date seule ne dit pas contre quoi la ligne a été rejouée', () => {
    const racine = bacDeSable(({ affirmations }) => ({
      affirmations: affirmations
        .split('\n')
        .map((l) => (l.trimStart().startsWith('| AFF-02 ') ? l.replace('2026-09-03 @ ad53f14a', '2026-09-03') : l))
        .join('\n'),
    }));
    const { code, sortie } = lancer([], racine);
    expect(code).not.toBe(0);
    expect(sortie).toContain('date_ou_sha_manquant');
  });

  it("VERTE si l'on n'abîme rien : les mutations ci-dessus sont bien la cause du rouge", () => {
    // Contre-témoin de l'ensemble : sans lui, un rouge permanent pour une autre raison ferait
    // passer les trois cas précédents pour des preuves.
    const { code } = lancer([], bacDeSable(() => ({})));
    expect(code).toBe(0);
  });
});
