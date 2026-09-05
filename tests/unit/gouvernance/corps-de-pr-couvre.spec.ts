// @req REQ-GOV-032
// @req REQ-GOV-011
/**
 * corps-de-pr-couvre.spec.ts — le champ `Couvre:` du corps de PR se DÉRIVE (REQ-GOV-032).
 *
 * 🔴 LE DÉFAUT, MESURÉ LE 2026-09-05 SUR LA PR 31. Après que les compteurs du corps de PR ont été
 * rendus dérivés, `Couvre:` restait le SEUL champ tapé à la main — et il mentait :
 *
 *     exigences réellement portées par les 9 tâches de la PR (union des `reqs`) : 17
 *     le champ `Couvre:` de `docs/pr/31.tpl.md:5` en listait :                     19
 *     en trop : REQ-GOV-026, REQ-GOV-031
 *
 * `REQ-GOV-031` est le cas qui pique : `scripts/gates/gov-entite.ts` désigne nommément `GOV-036`
 * comme le travail NON FAIT pour cette exigence. Le corps publié annonçait donc couvrir une
 * exigence dont le dépôt écrit ailleurs qu'elle reste à faire.
 *
 * CE QUE CE FICHIER EXERCE, et dans quel ordre :
 *
 *   — LE TÉMOIN : un gabarit dont le `Couvre:` tapé diverge de l'union dérivée fait ÉCHOUER le
 *     rendu, comme un marqueur non résolu. Et il échoue SUR CE CAS-LÀ : la divergence exercée est
 *     la vraie, `REQ-GOV-026` et `REQ-GOV-031` ajoutées à la liste dérivée ;
 *   — LE CONTRE-TÉMOIN : le rendu passe quand les deux concordent, et il passe avec le marqueur.
 *     Sans lui, une garde qui refuserait TOUT passerait le témoin (RM-02) ;
 *   — LA DÉRIVATION elle-même : union, dédoublonnée, triée, tirée de la MÊME source que
 *     `{{LISTE_SUR_LA_PR}}` — sans quoi deux champs du même corps divergeraient (RM-01).
 *
 * ⚠️ LA DIVERGENCE EXERCÉE EST CONSTRUITE À PARTIR DU RÉEL (RM-03) : on ne retape pas les dix-sept
 * exigences, on prend l'union dérivée des tâches réelles de la PR 31 et on lui ADJOINT les deux
 * qui étaient en trop. Le témoin reste donc vrai le jour où le backlog bouge.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { couvre, rendre, verifierCouvre } from '../../../scripts/lot/corps-de-pr';
import { tachesDeLaPr } from '../../../scripts/lot/revues';

type TacheBrute = { id: string; pr?: number | null; reqs?: string[] };

const TACHES = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheBrute[] }).taches;
const PR = 31;
const SUR_LA_PR = tachesDeLaPr(TACHES, PR, null);
const DERIVEES = couvre(SUR_LA_PR);

/** Les deux exigences que la ligne tapée annonçait sans qu'aucune tâche de la PR ne les porte. */
/**
 * DEUX EXIGENCES QUI EXISTENT AU REGISTRE ET QU'AUCUNE TÂCHE DE LA PR NE PORTE — dérivées,
 * jamais tapées.
 *
 * ⚠️ Cette liste valait `['REQ-GOV-026', 'REQ-GOV-031']` en dur. Le 2026-09-05, la lentille
 * `exactitude` a montré que `CPL-T01` LIVRAIT la garde de `REQ-GOV-031` sans la déclarer ; la
 * corriger a rendu l'exigence légitime, et ce témoin a rougi — **une liste tapée dans le
 * fichier même qui existe pour supprimer les listes tapées.** Le témoin mesurait un état du
 * backlog, pas une propriété du rendu.
 */
const EN_TROP = (() => {
  const ids = (JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as { exigences: { id: string }[] })
    .exigences.map((e) => e.id)
    .filter((id) => !DERIVEES.includes(id))
    .sort();
  if (ids.length < 2) throw new Error('registre trop pauvre : le témoin ne peut pas discriminer');
  return [ids[0]!, ids[1]!];
})();

function gabaritAvec(ligneCouvre: string): string {
  return ['## Identité', '', 'Auteur: A01', ligneCouvre, '', '## Ce que fait cette PR', ''].join('\n');
}

describe('REQ-GOV-032 — le champ `Couvre:` est DÉRIVÉ des tâches de la PR', () => {
  it('REQ-GOV-032 · la dérivation est l’union des `reqs`, dédoublonnée et triée', () => {
    expect(SUR_LA_PR.length, 'aucune tâche ne porte `pr: 31` : le témoin ne mesure plus rien').toBeGreaterThan(0);
    const brut = SUR_LA_PR.flatMap((t) => t.reqs ?? []);
    expect(brut.length).toBeGreaterThan(0);
    expect(DERIVEES).toEqual([...new Set(brut)].sort());
    // Dédoublonnée pour de vrai : les neuf tâches partagent des exigences.
    expect(DERIVEES.length).toBeLessThanOrEqual(brut.length);
    // Et c'est la MÊME source que `LISTE_SUR_LA_PR` : `docs/tasks.json`, filtré par `pr`.
    expect(SUR_LA_PR.every((t) => t.pr === PR)).toBe(true);
  });

  it('REQ-GOV-032 · TÉMOIN : la ligne tapée de la PR 31 fait ÉCHOUER le rendu, et nomme les deux en trop', () => {
    const tapee = `Couvre: ${[...DERIVEES, ...EN_TROP].join(', ')}`;
    let message = '';
    try {
      rendre(gabaritAvec(tapee), { COUVRE: DERIVEES.join(', ') });
      throw new Error('le rendu a RÉUSSI sur une ligne `Couvre:` divergente');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('Couvre:');
    expect(message).toContain('EN TROP');
    for (const r of EN_TROP) expect(message, `le message tait ${r}`).toContain(r);
    expect(message).toContain(String(DERIVEES.length));
  });

  it('REQ-GOV-032 · TÉMOIN : une exigence MANQUANTE fait échouer le rendu aussi', () => {
    // Le sens inverse compte autant : un corps qui TAIT une exigence portée annonce faux lui aussi.
    const ampute = DERIVEES.slice(1);
    expect(() => verifierCouvre(`Couvre: ${ampute.join(', ')}`, DERIVEES)).toThrow(/MANQUANTE/);
    expect(() => verifierCouvre(`Couvre: ${ampute.join(', ')}`, DERIVEES)).toThrow(DERIVEES[0]!);
  });

  it('REQ-GOV-032 · CONTRE-TÉMOIN : le rendu PASSE quand la ligne tapée concorde', () => {
    // Sans ce cas, une garde qui refuserait toujours passerait les deux témoins ci-dessus.
    const rendu = rendre(gabaritAvec(`Couvre: ${DERIVEES.join(', ')}`), { COUVRE: DERIVEES.join(', ') });
    expect(rendu).toContain(`Couvre: ${DERIVEES.join(', ')}`);
  });

  it('REQ-GOV-032 · CONTRE-TÉMOIN : par le marqueur, la concordance est vraie par construction', () => {
    const rendu = rendre(gabaritAvec('Couvre: {{COUVRE}}'), { COUVRE: DERIVEES.join(', ') });
    expect(rendu).toContain(`Couvre: ${DERIVEES.join(', ')}`);
    expect(rendu).not.toContain('{{COUVRE}}');
  });

  it('REQ-GOV-032 · CONTRE-TÉMOIN : les accents graves de la forme du gabarit ne comptent pas pour une divergence', () => {
    // `docs/pr/*.tpl.md` cite parfois les identifiants entre accents graves. Une garde qui
    // rougirait là-dessus ferait retirer les accents, pas les fautes.
    expect(() => verifierCouvre(`Couvre: ${DERIVEES.map((r) => '`' + r + '`').join(', ')}`, DERIVEES)).not.toThrow();
  });

  it('REQ-GOV-032 · CONTRE-TÉMOIN : un gabarit SANS ligne `Couvre:` n’est jugé que s’il en a une', () => {
    // `rendre()` est appelé par d'autres témoins sur des gabarits minuscules : le contrôle ne
    // s'arme que lorsque la valeur `COUVRE` est fournie ET qu'une ligne existe.
    expect(rendre('a {{X}} b', { X: 'vu' })).toBe('a vu b');
    expect(() => rendre('rien à couvrir ici', { COUVRE: DERIVEES.join(', ') })).toThrow(/aucune ligne/);
  });

  it('REQ-GOV-032 · `docs/pr/31.tpl.md` ne TAPE plus ses exigences : il porte le marqueur', () => {
    const ligne = /^Couvre:.*$/m.exec(readFileSync('docs/pr/31.tpl.md', 'utf8'))?.[0] ?? '';
    expect(ligne, 'le gabarit de la PR 31 a perdu sa ligne `Couvre:`').not.toBe('');
    expect(ligne).toContain('{{COUVRE}}');
    for (const r of EN_TROP) expect(ligne, `${r} est encore annoncée à la main`).not.toContain(r);
  });
});
