// @req REQ-GOV-012
// @req REQ-GOV-024
/**
 * LE CLIQUET DES REFUS GARDE UNE IDENTITÉ, PAS SEULEMENT UN COMPTE (GOV-045).
 *
 * LE DÉFAUT, TEL QUE LA MUTATION L'A DÉLIMITÉ. Un échange de sorties ENTRE fichiers rougissait
 * déjà : le cliquet exige, fichier par fichier, que le delta ajouté égale le `total` déclaré. Ce
 * qui restait vert était l'échange DANS un fichier déclaré — retirer un refus, en poser un autre
 * ailleurs dans le même fichier : le compte ne bouge pas. Les sorties y étaient interchangeables.
 *
 * CE QUE CE FICHIER TIENT. Chaque sortie d'un fichier déclaré porte un NOM figé dans
 * `REFUS_NOMMES` (`scripts/gates/registre-des-refus.ts`). Par MUTATION, sortie par sortie : on
 * retire UNE sortie précise et l'on exige que la confrontation nomme CELLE-LÀ, et elle seule
 * (RM-02) — pas seulement qu'un test tombe. Les fichiers laissés hors registre sont NOMMÉS et
 * COMPTÉS à chaque passage, jamais tus. Aucun chiffre n'est tapé ici : tout se remesure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  REFUS_NOMMES,
  compterSorties,
  confronterNoms,
  enumererFichiers,
  sortiesNommees,
} from '../../../scripts/gates/registre-des-refus';
import { declarationsDeLaBase } from './declarations-de-sorties';

/** Le fichier qui porte le registre `declares` du cliquet — la liste des fichiers en vient. */
const CLIQUET = 'tests/unit/gouvernance/refus-de-rendre-et-de-publier.spec.ts';
const DECLARES = declarationsDeLaBase(readFileSync(CLIQUET, 'utf8'));

/** Neutralise UNE sortie à sa position : le motif ne la voit plus, l'arbre reste valide. */
function retirer(texte: string, position: number): string {
  return `${texte.slice(0, position)}process.exiT${texte.slice(position + 'process.exit'.length)}`;
}

describe('REQ-GOV-012 — chaque sortie déclarée porte un NOM, et le disque le confirme', () => {
  it('REQ-GOV-012 — les fichiers nommés sont EXACTEMENT ceux que le cliquet déclare', () => {
    expect(
      DECLARES.size,
      `aucune déclaration lue dans ${CLIQUET} : illisible n’est pas vide`
    ).toBeGreaterThan(0);
    expect(Object.keys(REFUS_NOMMES).sort()).toEqual([...DECLARES.keys()].sort());
  });

  it('REQ-GOV-012 — sur le disque, chaque fichier déclaré porte ses noms, ni plus ni moins', () => {
    const fautes: string[] = [];
    for (const [f, noms] of Object.entries(REFUS_NOMMES)) {
      const { manquantes, nonDeclarees } = confronterNoms(f, readFileSync(f, 'utf8'), noms);
      for (const n of manquantes) fautes.push(`${f} : refus déclaré introuvable — « ${n} »`);
      for (const n of nonDeclarees) fautes.push(`${f} : sortie non nommée — « ${n} »`);
    }
    expect(fautes, fautes.join('\n')).toEqual([]);
  });

  it('REQ-GOV-012 — aucune identité déclarée n’est FAIBLE (rang) ni répétée', () => {
    for (const [f, noms] of Object.entries(REFUS_NOMMES)) {
      expect(new Set(noms).size, `${f} : un nom répété`).toBe(noms.length);
      const faibles = noms.filter((n) => / #\d+$/.test(n));
      expect(
        faibles,
        `${f} : identité à rang — retirer la première renommerait la suivante`
      ).toEqual([]);
    }
  });
});

describe('REQ-GOV-024 — RM-02 par MUTATION : retirer UNE sortie fait rougir CELLE-LÀ', () => {
  it('REQ-GOV-024 — TÉMOIN, sortie par sortie : la confrontation nomme la sortie retirée, et elle seule', () => {
    let mutants = 0;
    for (const [f, noms] of Object.entries(REFUS_NOMMES)) {
      const texte = readFileSync(f, 'utf8');
      for (const s of sortiesNommees(f, texte)) {
        const r = confronterNoms(f, retirer(texte, s.position), noms);
        expect(
          r.manquantes,
          `${f}:${s.ligne} retirée — la confrontation doit nommer « ${s.nom} »`
        ).toEqual([s.nom]);
        expect(
          r.nonDeclarees,
          `${f}:${s.ligne} retirée — une autre sortie a changé de nom`
        ).toEqual([]);
        mutants++;
      }
    }
    const attendus = Object.values(REFUS_NOMMES).reduce((a, n) => a + n.length, 0);
    expect(mutants, 'mutants posés ≠ sorties déclarées').toBe(attendus);
    console.info(`[cliquet-nomme] ${mutants} mutant(s) posé(s), ${mutants} tué(s) par leur NOM`);
  });

  it('REQ-GOV-024 — TÉMOIN : l’échange DANS un fichier garde le compte et rougit quand même', () => {
    const [f, noms] = Object.entries(REFUS_NOMMES).find(([, n]) => n.length > 0)!;
    const texte = readFileSync(f, 'utf8');
    const premiere = sortiesNommees(f, texte)[0]!;
    const sortie = ['process', 'exit(1)'].join('.');
    const echange = `${retirer(texte, premiere.position)}\nfunction ajoutee(): void {\n  ${sortie};\n}\n`;
    // Le compte, lui, ne voit RIEN : c'est le défaut que ce fichier ferme.
    expect(compterSorties(echange)).toBe(compterSorties(texte));
    const r = confronterNoms(f, echange, noms);
    expect(r.manquantes).toEqual([premiere.nom]);
    expect(r.nonDeclarees).toEqual(['ajoutee › ∅ › (1)']);
  });

  it('REQ-GOV-024 — CONTRE-TÉMOIN : le fichier intact ne rend aucune faute', () => {
    const [f, noms] = Object.entries(REFUS_NOMMES)[0]!;
    expect(confronterNoms(f, readFileSync(f, 'utf8'), noms)).toEqual({
      manquantes: [],
      nonDeclarees: [],
    });
  });
});

describe('REQ-GOV-012 — ce que le registre laisse dehors est NOMMÉ et COMPTÉ', () => {
  it('REQ-GOV-012 — les fichiers porteurs de sorties hors registre sont listés, avec leur compte', () => {
    const porteurs = enumererFichiers('scripts')
      .map((f) => [f, compterSorties(readFileSync(f, 'utf8'))] as const)
      .filter(([, n]) => n > 0);
    const dehors = porteurs.filter(([f]) => !(f in REFUS_NOMMES));
    const dedans = porteurs.filter(([f]) => f in REFUS_NOMMES);
    // Tout fichier déclaré porte au moins une sortie — sinon il n'a rien à nommer.
    expect(dedans.length, 'un fichier déclaré ne porte aucune sortie').toBe(
      Object.keys(REFUS_NOMMES).length
    );
    expect(dehors.length + dedans.length).toBe(porteurs.length);
    console.info(
      `[cliquet-nomme] ${dedans.length} fichier(s) nommé(s) sur ${porteurs.length} porteurs de sorties ; ` +
        `HORS REGISTRE (${dehors.length}, gardés par le seul total) :\n` +
        dehors.map(([f, n]) => `  - ${f} (${n})`).join('\n')
    );
  });
});
