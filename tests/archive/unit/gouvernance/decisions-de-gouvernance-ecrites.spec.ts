// @req REQ-GOV-008
// @req REQ-GOV-011
// @req REQ-GOV-013
/**
 * decisions-de-gouvernance-ecrites.spec.ts — GOV-058 : une décision de gouvernance de Will s'écrit
 * dans un ADR, et les documents qui prescrivent la relecture ne la contredisent pas.
 *
 * LE DÉFAUT. La règle d'arrêt du 2026-09-15 (« un refus ne bloque que sur un écart démontré et
 * ouvert ») a jugé des dizaines de relectures, et elle ne vivait que dans des corps de PR, des avis
 * et une ligne de journal. Pendant ce temps, la charte et le protocole de fusion écrivaient qu'un
 * refus bloque, sans condition : le dépôt contredisait la règle appliquée.
 *
 * CE QUE CE FICHIER TIENT, À DEUX FACES :
 *
 *   1. L'ADR qui porte la règle d'arrêt existe dans l'UNIQUE dossier des ADR, sous un titre qualifié
 *      par son dépôt, et il n'est pas remplacé. Son identifiant qualifié se DÉRIVE de son nom de
 *      fichier ; il n'est tapé nulle part ici.
 *   2. LA CONFRONTATION. Chaque phrase des documents tenus d'accord qui affirme qu'un refus bloque
 *      (un mot de la famille « refus » ET un mot de la famille « bloquer » ou « veto », dans la même
 *      phrase) est une AFFIRMATION CONFRONTÉE. Elle est accordée si elle cite l'ADR en vigueur ;
 *      sinon elle est une faute, et la faute NOMME les deux endroits : la phrase, et la ligne de l'ADR
 *      qui dit le contraire. Les documents tenus d'accord se DÉRIVENT du registre des tâches : ce
 *      sont les documents Markdown que cette tâche déclare dans ses `paths`, hors dossier des ADR.
 *      Témoin : une copie de travail où la charte affirme qu'un refus bloque → faute nommée.
 *      Contre-témoin : le dépôt tel qu'il est → zéro faute, et un compte d'affirmations confrontées
 *      NON NUL — une garde qui n'a rien confronté ne rend pas un vert.
 *   3. LES DÉCISIONS DATÉES. La table des décisions de l'ADR porte, pour chaque décision, une date
 *      (ou « non retrouvé »), une source, une portée et une réversibilité. Une cellule vide est une
 *      faute : une décision sans source est une décision inventée.
 *
 * CE QUE CE FICHIER NE VOIT PAS. Une affirmation écrite sans le mot « refus » (« une lentille qui
 * dit non arrête la fusion ») échappe au motif lexical ; la garde le sait, et c'est une limite, pas
 * un vert. Le découpage en phrases coupe sur un point suivi d'une majuscule : une phrase qui
 * enjambe une abréviation est lue en deux, ce qui ne peut qu'ajouter des affirmations confrontées,
 * jamais en retirer une.
 */
import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOSSIER_ADR = 'docs/adr';
const REGISTRE_DES_TACHES = 'docs/tasks.json';
const CETTE_TACHE = 'GOV-058';

/** Le libellé qui ouvre, dans la rubrique « Décision » de l'ADR, l'énoncé de la règle d'arrêt. */
const ETIQUETTE_REGLE = "**Règle d'arrêt.**";

/** Le libellé de la table des décisions datées. */
const ENTETE_TABLE_DECISIONS = '| Date | Décision | Décideur | Source | Portée | Réversibilité |';

const MOT_REFUS = /\brefus(?:e|es|ent|er|é|ée)?\b/i;
const MOT_BLOQUE = /\bbloqu\w*|\bveto\b/i;

type AdrDeLaRegle = {
  fichier: string;
  identifiant: string;
  statut: string;
  ligneDeLaRegle: number;
};

type Affirmation = { fichier: string; ligne: number; phrase: string; accordee: boolean };

type Verdict = {
  adr: AdrDeLaRegle | null;
  documents: string[];
  affirmations: Affirmation[];
  fautes: string[];
};

function lire(racine: string, chemin: string): string {
  return readFileSync(join(racine, chemin), 'utf8').replace(/\r\n/g, '\n');
}

/** L'ADR non remplacé dont la rubrique « Décision » énonce la règle d'arrêt, ou null. */
function adrDeLaRegle(racine: string): AdrDeLaRegle | null {
  const candidats: AdrDeLaRegle[] = [];
  for (const nom of readdirSync(join(racine, DOSSIER_ADR)).sort()) {
    const numero = /^(\d{4})-.+\.md$/.exec(nom)?.[1];
    if (!numero || numero === '0000') continue;
    const fichier = `${DOSSIER_ADR}/${nom}`;
    const lignes = lire(racine, fichier).split('\n');
    const statut = /^\|\s*\*\*Statut\*\*\s*\|\s*`([^`]+)`/.exec(
      lignes.find((l) => l.includes('**Statut**')) ?? ''
    )?.[1];
    const iRegle = lignes.findIndex((l) => l.startsWith(ETIQUETTE_REGLE));
    if (iRegle < 0 || !statut || statut === 'remplace') continue;
    candidats.push({
      fichier,
      identifiant: `partners/ADR-${numero}`,
      statut,
      ligneDeLaRegle: iRegle + 1,
    });
  }
  return candidats.length === 1 ? (candidats[0] ?? null) : null;
}

/** Les documents Markdown que cette tâche déclare dans ses `paths`, hors dossier des ADR. */
function documentsTenusDAccord(racine: string): string[] {
  const registre = JSON.parse(lire(racine, REGISTRE_DES_TACHES)) as {
    taches: { id: string; paths: string[] }[];
  };
  const tache = registre.taches.find((t) => t.id === CETTE_TACHE);
  return (tache?.paths ?? []).filter((p) => p.endsWith('.md') && !p.startsWith(`${DOSSIER_ADR}/`));
}

/** Les phrases d'un texte Markdown, avec la ligne où chacune commence ; blocs de code exclus. */
function phrases(texte: string): { ligne: number; phrase: string }[] {
  const sortie: { ligne: number; phrase: string }[] = [];
  const lignes = texte.split('\n');
  let dansCode = false;
  let courant: { ligne: number; morceaux: string[] } | null = null;
  const clore = () => {
    if (!courant) return;
    const paragraphe = courant.morceaux.join(' ');
    // Une coupure après un point, un point d'exclamation ou d'interrogation suivi d'un début de
    // phrase. L'offset de chaque phrase se rapporte à la ligne où elle commence.
    let debut = 0;
    const coupe = /[.!?]\s+(?=[A-ZÀ-ÖØ-Þ«*`⚠➡])/g;
    const bornes: number[] = [];
    for (let m = coupe.exec(paragraphe); m; m = coupe.exec(paragraphe)) bornes.push(m.index + 1);
    bornes.push(paragraphe.length);
    const longueurs = courant.morceaux.map((l) => l.length + 1);
    for (const fin of bornes) {
      const phrase = paragraphe.slice(debut, fin).trim();
      if (phrase) {
        let reste = debut;
        let i = 0;
        while (i < longueurs.length - 1 && reste >= (longueurs[i] ?? 0))
          reste -= longueurs[i++] ?? 0;
        sortie.push({ ligne: courant.ligne + i, phrase });
      }
      debut = fin;
    }
    courant = null;
  };
  lignes.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) {
      clore();
      dansCode = !dansCode;
      return;
    }
    if (dansCode) return;
    // Une ligne de tableau est une unité à elle seule ; une ligne vide ou un titre clôt le paragraphe.
    if (l.trim() === '' || /^#{1,6}\s/.test(l) || /^\s*\|/.test(l)) {
      clore();
      if (/^\s*\|/.test(l)) sortie.push({ ligne: i + 1, phrase: l.trim() });
      return;
    }
    if (!courant) courant = { ligne: i + 1, morceaux: [] };
    courant.morceaux.push(l.trim());
  });
  clore();
  return sortie;
}

/** La garde : confronte les documents tenus d'accord à l'ADR de la règle d'arrêt. */
function confronter(racine: string): Verdict {
  const adr = adrDeLaRegle(racine);
  const documents = documentsTenusDAccord(racine);
  const affirmations: Affirmation[] = [];
  const fautes: string[] = [];
  if (!adr) {
    fautes.push(
      `aucun ADR non remplacé de ${DOSSIER_ADR}/ n'énonce la règle d'arrêt ` +
        `(ligne ouverte par « ${ETIQUETTE_REGLE} ») — ou plusieurs l'énoncent`
    );
  }
  if (documents.length === 0) fautes.push(`${CETTE_TACHE} ne déclare aucun document à accorder`);
  for (const fichier of documents) {
    for (const { ligne, phrase } of phrases(lire(racine, fichier))) {
      if (!MOT_REFUS.test(phrase) || !MOT_BLOQUE.test(phrase)) continue;
      const accordee = adr !== null && phrase.includes(adr.identifiant);
      affirmations.push({ fichier, ligne, phrase, accordee });
      if (!accordee && adr) {
        fautes.push(
          `${fichier}:${ligne} affirme qu'un refus bloque sans citer ${adr.identifiant}, ` +
            `alors que ${adr.fichier}:${adr.ligneDeLaRegle} dit qu'un refus ne bloque que sur un ` +
            `écart démontré et ouvert — « ${phrase.slice(0, 140)} »`
        );
      }
    }
  }
  return { adr, documents, affirmations, fautes };
}

/** Une copie de travail jetable des seuls fichiers que la garde lit. */
function copieDeTravail(): string {
  const racine = mkdtempSync(join(tmpdir(), 'gov-decisions-'));
  cpSync(DOSSIER_ADR, join(racine, DOSSIER_ADR), { recursive: true });
  cpSync(REGISTRE_DES_TACHES, join(racine, REGISTRE_DES_TACHES));
  for (const d of documentsTenusDAccord('.')) cpSync(d, join(racine, d));
  return racine;
}

describe('REQ-GOV-008 — une décision de gouvernance de Will a un lieu nommé : un ADR', () => {
  it("REQ-GOV-008 · un seul ADR non remplacé du dossier unique énonce la règle d'arrêt, sous un titre qualifié", () => {
    const adr = adrDeLaRegle('.');
    expect(adr, `aucun ADR de ${DOSSIER_ADR}/ n'énonce « ${ETIQUETTE_REGLE} »`).not.toBeNull();
    const titre = lire('.', adr!.fichier).split('\n')[0];
    expect((titre ?? '').startsWith(`# ${adr!.identifiant} — `)).toBe(true);
    expect(lire('.', `${DOSSIER_ADR}/INDEX.md`)).toContain(`\`${adr!.identifiant}\``);
  });

  it("REQ-GOV-008 · l'ADR nomme l'écrivain d'une décision de gouvernance et le poste qui l'accepte", () => {
    const texte = lire('.', adrDeLaRegle('.')!.fichier);
    const decision = texte.slice(texte.indexOf('## Décision'), texte.indexOf('## Conséquences'));
    expect(decision).toMatch(/\*\*A02\*\* `architecte`/);
    expect(decision).toMatch(/\*\*A03\*\* `documentaliste`/);
  });
});

describe("REQ-GOV-011 — la charte et le protocole ne contredisent pas la règle d'arrêt", () => {
  it("REQ-GOV-011 · témoin : une copie où la charte affirme qu'un refus bloque fait fauter la garde, et la faute nomme les deux endroits", () => {
    const racine = copieDeTravail();
    try {
      const charte = documentsTenusDAccord(racine).find((d) => d.includes('CHARTE'))!;
      expect(charte, 'la charte doit être un document tenu d’accord').toBeTruthy();
      const plantee =
        'Tout refus rendu par une lentille bloque la fusion, quel que soit son motif.';
      const apres = `${lire(racine, charte)}\n${plantee}\n`;
      writeFileSync(join(racine, charte), apres);
      const lignePlantee = apres.split('\n').indexOf(plantee) + 1;
      const { fautes, adr } = confronter(racine);
      expect(fautes).toHaveLength(1);
      expect(fautes[0]).toContain(`${charte}:${lignePlantee}`);
      expect(fautes[0]).toContain(`${adr!.fichier}:${adr!.ligneDeLaRegle}`);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it("REQ-GOV-011 · témoin : sans ADR en vigueur de la règle d'arrêt, la garde faute au lieu de ne rien confronter", () => {
    const racine = copieDeTravail();
    try {
      const adr = adrDeLaRegle(racine)!;
      const texte = lire(racine, adr.fichier).replace(
        /(\|\s*\*\*Statut\*\*\s*\|\s*)`[^`]+`/,
        '$1`remplace`'
      );
      writeFileSync(join(racine, adr.fichier), texte);
      const verdict = confronter(racine);
      expect(verdict.adr).toBeNull();
      expect(verdict.fautes.join('\n')).toContain("n'énonce la règle d'arrêt");
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-011 · contre-témoin : le dépôt accordé rend zéro faute, avec le compte des affirmations confrontées', () => {
    const { fautes, affirmations, documents } = confronter('.');
    console.log(
      `decisions-de-gouvernance : ${affirmations.length} affirmation(s) confrontée(s) dans ` +
        `${documents.join(', ')} — ${fautes.length} faute(s)`
    );
    expect(fautes.join('\n')).toBe('');
    expect(affirmations.length).toBeGreaterThan(0);
    for (const d of documents) expect(affirmations.some((a) => a.fichier === d)).toBe(true);
  });
});

describe('REQ-GOV-013 — les décisions des 15 et 16 septembre sont écrites, datées, sourcées', () => {
  it('REQ-GOV-013 · chaque ligne de la table des décisions porte une date ou « non retrouvé », une source, une portée et une réversibilité', () => {
    const lignes = lire('.', adrDeLaRegle('.')!.fichier).split('\n');
    const i = lignes.indexOf(ENTETE_TABLE_DECISIONS);
    expect(i, `table « ${ENTETE_TABLE_DECISIONS} » absente`).toBeGreaterThan(0);
    const rangees: string[][] = [];
    for (let k = i + 2; k < lignes.length && (lignes[k] ?? '').startsWith('|'); k++) {
      rangees.push(
        (lignes[k] ?? '')
          .slice(1, -1)
          .split(/(?<!\\)\|/)
          .map((c) => c.trim())
      );
    }
    expect(rangees.length).toBeGreaterThan(0);
    for (const r of rangees) {
      expect(r, `ligne à six cellules attendue : ${r.join(' | ')}`).toHaveLength(6);
      expect(r.every((c) => c.length > 0)).toBe(true);
      expect(r[0]).toMatch(/2026-09-1[56]|non retrouvé/);
    }
    const nonRetrouvees = rangees.filter((r) => (r[0] ?? '').includes('non retrouvé'));
    for (const r of nonRetrouvees) expect(r[3]).not.toBe('—');
  });

  it("REQ-GOV-013 · la règle d'arrêt est datée du 2026-09-15 et porte sa réversibilité", () => {
    const texte = lire('.', adrDeLaRegle('.')!.fichier);
    const regle = texte.split('\n').find((l) => l.startsWith(ETIQUETTE_REGLE))!;
    expect(regle).toContain('2026-09-15');
    expect(texte).toMatch(/\*\*Réversibilité\.\*\*/);
  });
});
