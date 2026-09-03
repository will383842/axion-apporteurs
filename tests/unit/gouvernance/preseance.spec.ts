/**
 * La table de préséance, exercée comme un test — GOV-002.
 *
 * @req REQ-GOV-002
 * @req REQ-GOV-030
 *
 * POURQUOI CE FICHIER EXISTE. `docs/tasks.json` attache `preseance.spec.ts` aux DEUX exigences de
 * GOV-002, et REQ-GOV-030 ne demande pas un document : elle demande une GARDE (« une garde grep
 * rougit si l'expression apparaît dans docs/, prisma/ ou src/ sans la référence REQ-DM-034 sur la
 * même ligne ou la ligne suivante »). Le premier jet décrivait cette garde au présent sans la
 * livrer : c'est RM-02 mot pour mot — une garde jamais vue rougir ne garde rien.
 *
 * La garde est `scripts/gates/gov-preseance.ts`. Elle est exercée ici DEUX FOIS, comme les cinq
 * autres gardes de gouvernance dans `gardes.spec.ts` :
 *   1. sur l'état du dépôt   → doit sortir 0 ;
 *   2. en mode `--prove`     → doit sortir 0 APRÈS avoir vu rougir chacune de ses sept familles,
 *                              et APRÈS avoir vu ses contre-témoins rester verts.
 *
 * ROUGE, verbatim, sur un témoin réellement suivi par git (`docs/TEMOIN-ROUGE.md`, deux lignes,
 * l'expression sans son porteur), avant d'être retiré :
 *
 *   ❌ gov:preseance — 1 défaut(s) (REQ-GOV-002, REQ-GOV-030) :
 *      ── expression_sans_ancre (1)
 *         docs/TEMOIN-ROUGE.md:1 — l'expression arbitrée est écrite sans REQ-DM-034 sur la même
 *         ligne ni sur la suivante. L'exception unique est portée par cette exigence : cite-la,
 *         ou n'énonce pas la règle ici (REQ-GOV-030).
 *
 * VERT : `✅ gov:preseance — 7 clés arbitrées en §3, 16 fichier(s) suivis relus sous docs/,
 * prisma/ et src/ : l'expression arbitrée cite partout son porteur.`
 *
 * Tant que `docs/gates.json` ne porte pas l'entrée `gov:preseance` — le fichier est en `deny`
 * d'écriture, l'entrée revient au lot GOV-000 —, c'est ce test qui la fait tourner dans la CI,
 * par `pnpm test`.
 *
 * CHAQUE APPEL DE `tsx` COÛTE ~5 s : les sorties sont calculées une fois et relues ensuite. Un
 * test qui relance le même sous-processus quatre fois n'exerce rien de plus, il attend.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SCRIPT = 'scripts/gates/gov-preseance.ts';
const PRESEANCE = 'docs/PRESEANCE.md';

type Sortie = { code: number; sortie: string };
const cache = new Map<string, Sortie>();

function lancer(...args: string[]): Sortie {
  const cle = args.join(' ');
  const connu = cache.get(cle);
  if (connu) return connu;
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  const out: Sortie = { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
  cache.set(cle, out);
  return out;
}

describe('gov:preseance — REQ-GOV-002 et REQ-GOV-030', () => {
  it('est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer();
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('sait rougir : ses 7 familles ont chacune un témoin, et ses contre-témoins restent verts', () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('Les 7 familles rougissent');
    expect(sortie).toContain('contre-témoins restent verts');
  });

  it('énumère ses familles une par une — la preuve n’est pas un décompte', () => {
    // Le `--prove` de `gov:publication` a compté des fautes jusqu'au 2026-09-03 : trois familles
    // sur quatre étaient réputées prouvées sans l'avoir jamais été. La sortie doit nommer les
    // familles, pas en donner le total.
    const lignes = lancer('--prove')
      .sortie.split('\n')
      .filter((l) => l.trim().startsWith('•'));
    expect(lignes.length).toBe(7);
  });

  it('nomme la famille de REQ-GOV-030 parmi celles qu’elle a vues rougir', () => {
    expect(lancer('--prove').sortie).toContain('expression_sans_ancre');
  });
});

describe('REQ-GOV-002 — la table arbitre ce qu’elle annonce', () => {
  it('donne une sous-section à chacune des sept clés que REQ-GOV-002 énumère', () => {
    const titres = readFileSync(PRESEANCE, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('### '))
      .map((l) => l.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
    const cles = ['quota', 'collision', 'cycle de vie', 'bareme', 'naissance', 'peremption', 'zero arbitrage'];
    for (const cle of cles) {
      expect(titres.some((t) => t.includes(cle)), `clé « ${cle} » sans sous-section`).toBe(true);
    }
  });

  it('arbitre au moins sept couples de documents en section 2', () => {
    const deuxieme = readFileSync(PRESEANCE, 'utf8')
      .split(/^## /m)
      .find((s) => s.startsWith('2.')) ?? '';
    const lignes = deuxieme
      .split('\n')
      .filter((l) => l.trim().startsWith('|') && !/^\|[\s:|-]+\|$/.test(l.trim()));
    expect(lignes.length - 1).toBeGreaterThanOrEqual(7);
  });
});

describe('REQ-GOV-030 — l’expression arbitrée cite toujours son porteur', () => {
  it('trouve l’ancre REQ-DM-034 sur la ligne où PRESEANCE.md énonce la règle', () => {
    // La garde le vérifie sur tout le dépôt ; ce test le vérifie ici, sans sous-processus, pour
    // que l'échec pointe la ligne du document plutôt que la sortie d'un script.
    const lignes = readFileSync(PRESEANCE, 'utf8').split('\n');
    lignes.forEach((ligne, i) => {
      if (!/z[ée]ro\s+arbitrage/i.test(ligne)) return;
      const voisinage = ligne + '\n' + (lignes[i + 1] ?? '');
      expect(voisinage, `${PRESEANCE}:${i + 1} énonce la règle sans son porteur`).toContain('REQ-DM-034');
    });
  });
});
