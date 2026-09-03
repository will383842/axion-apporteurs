/**
 * adr-assertion-existe.spec.ts — une assertion CITÉE par un ADR accepté doit EXISTER.
 *
 * @req REQ-GOV-009
 *
 * C'est le test que GOV-010 déclare pour REQ-GOV-009. Il ne double pas `adr-index-derive.spec.ts`
 * (GOV-009), qui tient le dossier et l'index : il tient le seul point que la garde livrée par
 * GOV-009 laissait ouvert.
 *
 * LE DÉFAUT QU'IL FERME. `gov:adr` vérifiait déjà qu'un ADR « accepte » PORTE le texte d'une
 * assertion (un `.spec.ts` et un `it(` dans la rubrique « Ce qui le vérifie ») ou la mention
 * `hors-code`. Elle ne vérifiait rien de plus : un ADR pouvait citer
 * `tests/qui/nexiste-pas.spec.ts` · `it('un titre inventé')` et rester vert. Une décision réputée
 * gardée par un test qui n'existe pas est exactement ce que REQ-GOV-009 refuse — « une assertion
 * qui verrait la décision mourir » — avec, en prime, la fausse sécurité d'une garde verte.
 *
 * POURQUOI LE PREMIER CAS NE PASSE PAS PAR LA GARDE. Il relit les ADR lui-même, avec ses propres
 * lignes d'extraction, au lieu d'appeler `gov:adr`. Un test qui juge une garde en lui demandant si
 * elle est contente ne juge rien : il faut une seconde paire d'yeux sur la MÊME donnée réelle. Les
 * cas suivants, eux, exercent la garde dans son mode de preuve.
 *
 * LE ROUGE (verbatim, 2026-09-03, AVANT la garde et AVANT la correction de partners/ADR-0007) : le
 * titre cité par cet ADR était un GABARIT DE CHAÎNE (`sait rougir : ses ${familles} familles…`),
 * calculé à l'exécution par un `describe.each`. La correction est allée dans l'ADR, pas dans la
 * garde : c'est déjà la doctrine écrite par partners/ADR-0003 et partners/ADR-0005 — citer un titre
 * calculé fige un nombre qui change dès qu'une famille est ajoutée à la garde, et c'est un littéral
 * recopié (RM-01).
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NOM_ADR, GABARIT, RACINE_ADR } from '../../../scripts/adr/index';

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les espaces d'une citation ne portent pas de sens : un titre coupé par la mise en page reste le même. */
const aplatir = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Tous les fichiers de test du dépôt, `node_modules` exclu. */
function fichiersDeTest(racine: string, acc: string[] = []): string[] {
  if (!existsSync(racine)) return acc;
  if (statSync(racine).isFile()) {
    if (/\.(spec|test)\.tsx?$/.test(racine)) acc.push(racine.split('\\').join('/'));
    return acc;
  }
  for (const e of readdirSync(racine)) {
    if (e === 'node_modules' || e === '.git') continue;
    fichiersDeTest(join(racine, e), acc);
  }
  return acc;
}

const TESTS_DU_DEPOT = [...fichiersDeTest('tests'), ...fichiersDeTest('src')];

/** Les titres LITTÉRAUX des `it()` / `test()` d'un fichier — un gabarit de chaîne n'en est pas un. */
function titresLitteraux(chemin: string): string[] {
  const source = readFileSync(chemin, 'utf8');
  const titres: string[] = [];
  for (const m of source.matchAll(/\b(?:it|test)(?:\.\w+)*\s*\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    titres.push(aplatir(m[2]!.replace(/\\(['"\\])/g, '$1')));
  }
  return titres;
}

/** La rubrique « Ce qui le vérifie », coupée au titre suivant : « Reste à faire » n'en fait pas partie. */
function rubriqueVerification(texte: string): string {
  const apres = texte.split(/^##[ \t]+Ce qui le vérifie[ \t]*$/m)[1] ?? '';
  return apres.split(/^##[ \t]+/m)[0] ?? '';
}

function adrsAcceptes(): { fichier: string; texte: string }[] {
  return readdirSync(RACINE_ADR)
    .filter((f) => NOM_ADR.test(f) && f !== GABARIT)
    .map((f) => ({ fichier: f, texte: readFileSync(join(RACINE_ADR, f), 'utf8') }))
    .filter((a) => /^\|\s*\*\*Statut\*\*\s*\|\s*`?accepte`?\s*\|/m.test(a.texte));
}

describe('une assertion citée par un ADR « accepte » existe vraiment', () => {
  it('REQ-GOV-009 — le dépôt a au moins un ADR « accepte » à juger', () => {
    // Sans ce cas, le suivant serait vert sur un dossier vide — une garde qui ne juge rien est
    // verte pour de mauvaises raisons (RM-02).
    expect(adrsAcceptes().length).toBeGreaterThan(0);
    expect(TESTS_DU_DEPOT.length).toBeGreaterThan(0);
  });

  it("REQ-GOV-009 — chaque ADR « accepte » cite un fichier de test qui existe et un titre it() qu'on y retrouve LITTÉRALEMENT", () => {
    for (const adr of adrsAcceptes()) {
      const numero = NOM_ADR.exec(adr.fichier)![1]!;
      const bloc = aplatir(rubriqueVerification(adr.texte));

      const cites = [...bloc.matchAll(/[\w./-]+\.(?:spec|test)\.tsx?/g)].map((m) => m[0]!);
      const titres = [...bloc.matchAll(/\b(?:it|test)\(\s*(['"])([\s\S]*?)\1\s*\)/g)].map((m) => aplatir(m[2]!));

      // Un ADR peut être `hors-code` : REQ-GOV-009 lui laisse cette porte, et c'est la garde qui
      // juge le motif. Ici, on ne juge que ceux qui ont choisi l'assertion.
      if (/hors-code/.test(bloc) && cites.length === 0 && titres.length === 0) continue;

      expect(
        titres.length,
        `partners/ADR-${numero} « accepte » ne cite aucune assertion (REQ-GOV-009).`,
      ).toBeGreaterThan(0);

      const resolus = cites.map((c) => {
        const cible = TESTS_DU_DEPOT.filter((f) => f === c || f.endsWith('/' + c));
        expect(cible.length, `partners/ADR-${numero} cite ${c} — aucun fichier de test de ce nom.`).toBe(1);
        return cible[0]!;
      });

      for (const titre of titres) {
        // Un titre peut être cité par son chemin complet (`describe > it`) : c'est le dernier
        // segment qui nomme l'assertion.
        const nu = titre.split(' > ').pop()!;
        const trouve = resolus.some((f) => {
          const titresDuFichier = titresLitteraux(f);
          return titresDuFichier.includes(titre) || titresDuFichier.includes(nu);
        });
        expect(
          trouve,
          `partners/ADR-${numero} « accepte » cite it(${titre}) — aucun des fichiers cités ne ` +
            `contient ce titre littéral.`,
        ).toBe(true);
      }
    }
  });
});

describe('gov:adr — la garde tient désormais l’EXISTENCE de l’assertion', () => {
  it('REQ-GOV-009 — est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer('scripts/gates/gov-adr.ts');
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-009 — sait rougir : ses 16 familles ont chacune un témoin, 11 contre-témoins restent verts', () => {
    const { code, sortie } = lancer('scripts/gates/gov-adr.ts', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('Les 16 familles rougissent');
    expect(sortie).toContain('11 contre-témoins restent verts');
  });

  it('REQ-GOV-009 — la preuve NOMME les quatre familles de GOV-010, elle ne les compte pas', () => {
    // Un total ne dit pas lesquelles : `gov:publication` a tenu trois familles pour prouvées sans
    // témoin jusqu'au 2026-09-03. On exige les noms.
    const { sortie } = lancer('scripts/gates/gov-adr.ts', '--prove');
    for (const famille of [
      'assertion_fichier_absent',
      'assertion_titre_absent',
      'assertion_titre_calcule',
      'hors_code_sans_motif',
    ]) {
      expect(sortie).toContain(`• ${famille}`);
    }
  });
});
