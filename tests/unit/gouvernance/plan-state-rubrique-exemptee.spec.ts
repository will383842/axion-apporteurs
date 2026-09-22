// @req REQ-GOV-032
/**
 * GOV-090 — une rubrique exemptée l'était EN BLOC, et sa prose échappait au vérificateur.
 *
 * LE DÉFAUT. `plan-state:verifier` compare la vue octet par octet SAUF les rubriques que le
 * générateur nourrit hors du dépôt, via `forge` : il les imprime sous `NON COMPARÉ`. L'exemption
 * portait sur la RUBRIQUE ENTIÈRE dès qu'UNE seule de ses lignes touchait la forge. Mesure du
 * 2026-09-22 : cinq rubriques sur quatorze. Tout le reste de leur contenu était libre — et ce
 * reste n'est pas anodin : la doctrine de « Revendications » (« Deux sources, aucune
 * troisième… ») tient en une ligne de 450 caractères qui ne lit RIEN de la forge, et que
 * personne ne comparait. On pouvait la réécrire à la main et `--verifier` restait VERT.
 *
 * REQ-GOV-032 exige pourtant que le mode de vérification sorte 1 « quand le fichier commité
 * diffère **d'un seul octet** de ce que sa source produirait ». L'exemption en bloc était une
 * non-conformité mesurée à une exigence active, et elle l'était avant cette tâche.
 *
 * LE REMÈDE N'EST PAS NEUF — c'est le mécanisme que le générateur applique DÉJÀ au bloc de
 * reprise, et dont il écrit lui-même la règle : « ce qu'elle lit de la forge lui est attribué, et
 * ce qu'elle ne lit pas la laisse COMPARÉE. Aucune ligne n'est classée à la main. » Il descend
 * d'un étage : de la rubrique à la ligne.
 *
 * ⚠️ LA CONVERSION EST PROGRESSIVE, ET LE COMPLÉMENT EST NOMMÉ. Une rubrique dont une ligne n'a
 * pas de provenance enregistrée reste entièrement exemptée : comparer à l'aveugle une ligne qui
 * affiche la forge sans l'avoir déclarée ferait rougir le dépôt à chaque PR ouverte, et un faux
 * rouge quotidien se fait désarmer en un jour. Le vert IMPRIME les deux populations. Le dernier
 * témoin de ce fichier garde cette promesse-là : le complément est DIT, jamais sous-entendu.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PLAN = 'scripts/plan-state/build.ts';

function lancerPlan(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), resolve(PLAN), ...args],
    { encoding: 'utf8', maxBuffer: 64 * 2 ** 20 }
  );
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Rend la vue dans un bac à sable. `docs/PLAN-STATE.md` du dépôt n'est JAMAIS écrit. */
function rendreDansUnBac(nom: string): string {
  const chemin = join(mkdtempSync(join(tmpdir(), 'plan-state-')), nom);
  const { code, sortie } = lancerPlan('--out', chemin);
  expect(code, `le rendu de la vue a échoué : ${sortie}`).toBe(0);
  return chemin;
}

describe('REQ-GOV-032 — dans une rubrique exemptée, ce qui ne lit pas la forge est comparé', () => {
  it('REQ-GOV-032 — une ligne de rubrique exemptée qui ne lit pas la forge est COMPARÉE', () => {
    const vue = rendreDansUnBac('PLAN-STATE-doctrine-reecrite.md');
    const avant = readFileSync(vue, 'utf8');

    // LA MUTATION EST UNE PROSE DE DOCTRINE, dans une rubrique que le vert déclare NON COMPARÉE.
    // Elle ne touche aucun chiffre, aucun identifiant, aucune valeur de la forge : exactement ce
    // qu'une main écrirait, et exactement ce qui passait avant cette tâche.
    // LA CIBLE EST LA DOCTRINE DE « Revendications », émise SANS CONDITION : c'est la seule
    // forme de ligne qu'on puisse comparer dans une rubrique exemptée. Une prose émise dans une
    // branche que la forge décide dépend de la forge par sa PRÉSENCE, même sans en porter une
    // seule valeur — c'est le témoin « exemption portante » qui l'a établi, contre une première
    // version de cette garde qui comparait aussi les lignes conditionnelles.
    const cible = 'Deux sources, aucune troisième';
    expect(
      avant.includes(cible),
      "la prose visée n'est plus dans la vue : ce témoin ne mesure plus rien"
    ).toBe(true);
    writeFileSync(vue, avant.replace(cible, 'Une source, et on verra bien'));

    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une doctrine réécrite à la main est restée verte : ${sortie}`).toBe(1);
    expect(sortie).toContain('vue_perimee');
    // LE MESSAGE NOMME L'ÉCART EN UNITÉS DU DOMAINE (REQ-GOV-032) : la rubrique et la ligne, pas
    // « les deux fichiers diffèrent ».
    expect(sortie).toContain('Revendications');
    expect(sortie).toContain('une ligne qui ne lit RIEN de la forge a disparu');
  });

  it('REQ-GOV-032 · CONTRE-TÉMOIN — la vue fraîchement rendue reste VERTE', () => {
    // Sans lui, le témoin précédent serait tenu par une garde qui rougit sur tout : une règle
    // désarmée le jour de sa livraison (RM-02). C'est ce contre-témoin qui prouve que les lignes
    // réellement nourries par la forge restent libres.
    const vue = rendreDansUnBac('PLAN-STATE-frais.md');
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une vue rendue à l'instant est jugée périmée : ${sortie}`).toBe(0);
    expect(sortie).toContain('✅');
  });

  it('REQ-GOV-032 — le vert COMPTE les lignes gagnées, et NOMME les rubriques non converties', () => {
    const vue = rendreDansUnBac('PLAN-STATE-compte.md');
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code).toBe(0);

    // PLANCHER. Un compteur dérivé qui rendrait zéro se lirait comme « rien à comparer », et la
    // garde entière serait inerte en restant verte. On exige un gain STRICTEMENT positif.
    const m = /(\d+) ligne\(s\) COMPARÉE\(S\) À L'INTÉRIEUR des rubriques exemptées/.exec(sortie);
    expect(m, `le vert ne rend plus son compte de lignes gagnées : ${sortie}`).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);

    // LE COMPLÉMENT EST DIT, PAS SUPPOSÉ (même règle que le périmètre de `gov:trace`, GOV-043).
    // Tant qu'il reste des rubriques non converties, le vert doit les NOMMER — sinon il laisse
    // croire à une couverture complète. Le jour où il n'en reste aucune, la ligne disparaît : les
    // deux états sont acceptés, l'ambiguïté silencieuse ne l'est pas.
    const exemptees = /NON COMPARÉ — rubriques : (.*)/.exec(sortie);
    expect(exemptees, `le vert n'énumère plus ses exemptions : ${sortie}`).not.toBeNull();
    if (sortie.includes('NON CONVERTI')) {
      const nonConverties = /NON CONVERTI — .*: (.*)/.exec(sortie);
      expect(nonConverties).not.toBeNull();
      expect(nonConverties![1]!.trim().length).toBeGreaterThan(0);
    }
  });
});
