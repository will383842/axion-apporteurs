// @req REQ-GOV-008
// @req REQ-GOV-025
// @req REQ-GOV-026
/**
 * attestation-inter-depot.spec.ts — une livraison qui a eu lieu AILLEURS doit être attestable, et
 * sa PR ne doit JAMAIS se lire comme une PR d'ici. (GOV-038)
 *
 * CE QUI A COÛTÉ CETTE TÂCHE, mesuré le 2026-09-05. `INT-T01b` porte `repo: "axionia"`. Elle a été
 * livrée par la PR 998 de `will383842/axion-ia`, fusionnée par le commit `41d71a7`, en production
 * depuis 12:13Z. C'est la PREMIÈRE des quatorze tâches `repo` ≠ `partners` jamais livrée, et le
 * backlog n'avait aucun champ pour l'écrire. Les deux écritures disponibles étaient fausses :
 *
 *   — `pr: 998` : `scripts/plan-state/build.ts` rendait `PR#${t.pr}` sans qualifier le dépôt. La
 *     vue publique aurait porté « INT-T01b (A01) PR#998 », et
 *     `gh api repos/will383842/axion-apporteurs/pulls/998` rend **404**. RM-12 nomme cette
 *     famille — un identifiant qui ne RÉSOUT pas — et `gov:identifiants` ne la voit pas : elle
 *     juge la FORME d'un identifiant, jamais sa résolution ;
 *   — `motif: "…"` : `null` sur les 206 tâches, réservé par le schéma au motif d'un BLOCAGE, et
 *     collé au titre par la vue. Une prose n'est pas une référence.
 *
 * CE QUE CE FICHIER EXERCE :
 *
 *   1. LES SEPT FAMILLES de `controlerAttestation`, chacune sur son propre défaut. Une garde qu'on
 *      n'a pas vue rougir n'est pas une garde (RM-02).
 *   2. LES CONTRE-TÉMOINS. Une tâche `partners` livrée normalement, une tâche `axionia` encore
 *      `a_faire`, et — le plus important — une tâche `axionia` livrée AVEC son attestation : c'est
 *      la forme même que GOV-038 introduit, et une garde qui la refuserait bloquerait
 *      `pnpm lot:cloture`, seul écrivain du statut.
 *   3. LE RENDU. `referencePr()` qualifie par dépôt hors d'ici, et ne le fait pas ici.
 *   4. LE RENDU, CHEZ SES APPELANTS. Un point de rendu qui recompose la référence à la main
 *      échapperait aux trois premiers points : le test relit donc la SOURCE de tout script qui lit
 *      `docs/tasks.json` et refuse qu'une même ligne interpole l'identifiant d'une tâche ET son
 *      numéro de PR. C'est la signature exacte des trois points de rendu qui existaient
 *      (`build.ts:201`, `reprise.ts:138`, `cloture.ts:97`) et d'aucun des quatre autres endroits du
 *      dépôt qui interpolent un `.pr` — ceux-là citent la PR d'une ENTRÉE DE JOURNAL, qui est bien
 *      une PR de ce dépôt-ci (`gov-etat.ts:351`, `gov-etat.ts:376`, `build.ts:412`, `build.ts:455`).
 *      La liste des fichiers examinés est CALCULÉE, jamais tenue à la main : un nouveau point de
 *      rendu qui lit le backlog entre dans le périmètre sans que personne y pense.
 *
 * AUCUN APPEL À LA FORGE. Le SHA n'est pas résolu ici, et il ne doit pas l'être : cinq
 * spécifications qui lancent `gh` ont rendu la suite non déterministe le 2026-09-05 (`pnpm test`
 * a rendu 1, puis 0, puis 0 sur le même arbre). Une valeur dérivée d'une source non reproductible
 * n'est pas dérivée, elle est échantillonnée. La vérification en ligne vit dans un mode séparé,
 * `pnpm gov:attestation --en-ligne`, que ni `pnpm test` ni `pnpm gov:check` n'appellent.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  DEPOTS,
  DEPOT_LOCAL,
  FAMILLES_ATTESTATION,
  controlerAttestation,
  referencePr,
  type Attestation,
  type TacheAttestable,
} from '../../../scripts/lot/attestation';

/**
 * Le SHA de la fixture est LU dans git — jamais quarante hexadécimaux tapés à la main, qui seraient
 * la fixture inventée que RM-03 interdit et ne prouveraient pas qu'un vrai SHA passe.
 */
const SHA_REEL = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const attestation = (): Attestation => ({ pr: 998, sha: SHA_REEL, fusionneeAt: '2026-09-05T11:04:48Z' });

/**
 * Aucun défaut sur ce que les cas font varier (RM-11) : `repo`, `statut`, `pr` et `attestation`
 * sont explicites à chaque appel. « absent » et « présent » sont deux fixtures, pas une valeur par
 * défaut — c'est précisément la dimension que ce fichier mesure.
 */
function tache(champs: TacheAttestable): TacheAttestable {
  return champs;
}

const familles = (t: TacheAttestable, livree: boolean): string[] =>
  controlerAttestation(t, livree).map((f) => f.famille);

describe('GOV-038 — les sept familles de l’attestation inter-dépôt (REQ-GOV-026)', () => {
  it('attestation_absente : une tâche `axionia` livrée sans rien qui prouve sa livraison', () => {
    const f = controlerAttestation(
      tache({ id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: null }),
      true
    );
    expect(f.map((x) => x.famille)).toEqual(['attestation_absente']);
    // Le message NOMME le dépôt réel : « corrige-le » sans dire où chercher ne sert à personne.
    expect(f[0]!.message).toContain('will383842/axion-ia');
  });

  it('pr_nu_hors_depot : le numéro écrit dans `pr`, celui que les vues rendraient `PR#998`', () => {
    const f = controlerAttestation(
      tache({ id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: 998, attestation: attestation() }),
      true
    );
    expect(f.map((x) => x.famille)).toEqual(['pr_nu_hors_depot']);
    // Il dit POURQUOI c'est faux, en citant le dépôt où le numéro serait cherché — et ne résout pas.
    expect(f[0]!.message).toContain(String(DEPOTS[DEPOT_LOCAL]));
  });

  it('attestation_hors_sujet : une tâche de CE dépôt n’a rien à attester, sa PR y résout', () => {
    expect(
      familles(tache({ id: 'GOV-024', repo: 'partners', statut: 'fusionnee', pr: 31, attestation: attestation() }), true)
    ).toEqual(['attestation_hors_sujet']);
  });

  it('attestation_hors_sujet : `repo: "externe"` ne désigne aucun dépôt de code', () => {
    expect(
      familles(tache({ id: 'JUR-T01b', repo: 'externe', statut: 'a_faire', pr: null, attestation: attestation() }), false)
    ).toContain('attestation_hors_sujet');
  });

  it('attestation_sans_livraison : attestée mais non déclarée — le composeur la referait', () => {
    expect(
      familles(tache({ id: 'INT-T02', repo: 'axionia', statut: 'a_faire', pr: null, attestation: attestation() }), false)
    ).toEqual(['attestation_sans_livraison']);
  });

  it('attestation_sha_non_conforme : le NUMÉRO DE PR mis à la place du SHA', () => {
    const f = controlerAttestation(
      tache({
        id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: null,
        attestation: { ...attestation(), sha: '998' },
      }),
      true
    );
    expect(f.map((x) => x.famille)).toEqual(['attestation_sha_non_conforme']);
  });

  it('attestation_sha_non_conforme : un SHA ABRÉGÉ n’atteste pas — sa non-ambiguïté se périme', () => {
    expect(
      familles(
        tache({
          id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: null,
          attestation: { ...attestation(), sha: SHA_REEL.slice(0, 7) },
        }),
        true
      )
    ).toEqual(['attestation_sha_non_conforme']);
  });

  it('attestation_date_non_conforme : une date locale n’est pas un instant UTC', () => {
    expect(
      familles(
        tache({
          id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: null,
          attestation: { ...attestation(), fusionneeAt: '05/09/2026 13:04' },
        }),
        true
      )
    ).toEqual(['attestation_date_non_conforme']);
  });

  it('livraison_repo_externe : une réponse de tiers ne se « livre » pas, rien ne peut l’attester', () => {
    expect(
      familles(tache({ id: 'JUR-T01b', repo: 'externe', statut: 'fusionnee', pr: null, attestation: null }), true)
    ).toEqual(['livraison_repo_externe']);
  });

  it('les sept familles annoncées sont exactement celles que les cas ci-dessus font rougir', () => {
    // Le compte n'est pas écrit à la main : il est DÉRIVÉ des cas joués, et confronté à la liste
    // que `gov:tasks` exige de couvrir. Une famille ajoutée sans témoin fait rougir ici aussi.
    const vues = new Set<string>();
    const cas: [TacheAttestable, boolean][] = [
      [{ id: 'a', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: null }, true],
      [{ id: 'b', repo: 'axionia', statut: 'fusionnee', pr: 998, attestation: attestation() }, true],
      [{ id: 'c', repo: 'partners', statut: 'fusionnee', pr: 31, attestation: attestation() }, true],
      [{ id: 'd', repo: 'axionia', statut: 'a_faire', pr: null, attestation: attestation() }, false],
      [{ id: 'e', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: { ...attestation(), sha: '998' } }, true],
      [{ id: 'f', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: { ...attestation(), fusionneeAt: 'hier' } }, true],
      [{ id: 'g', repo: 'externe', statut: 'fusionnee', pr: null, attestation: null }, true],
    ];
    for (const [t, livree] of cas) for (const x of familles(t, livree)) vues.add(x);
    expect([...vues].sort()).toEqual([...FAMILLES_ATTESTATION].sort());
  });
});

describe('GOV-038 — les contre-témoins : ce que la garde doit LAISSER PASSER (RM-02)', () => {
  it('une tâche `partners` livrée normalement : `pr` nu, aucune attestation', () => {
    expect(
      familles(tache({ id: 'GOV-024', repo: 'partners', statut: 'fusionnee', pr: 31, attestation: null }), true)
    ).toEqual([]);
  });

  it('une tâche `partners` livrée SANS numéro de PR (le cas de GOV-000) reste verte', () => {
    expect(
      familles(tache({ id: 'GOV-000', repo: 'partners', statut: 'fusionnee', pr: null, attestation: null }), true)
    ).toEqual([]);
  });

  it('une tâche `axionia` encore `a_faire` : rien à attester tant que rien n’est livré', () => {
    expect(
      familles(tache({ id: 'INT-T02', repo: 'axionia', statut: 'a_faire', pr: null, attestation: null }), false)
    ).toEqual([]);
  });

  it('une tâche `axionia` LIVRÉE avec son attestation et sans `pr` nu — la forme que GOV-038 pose', () => {
    expect(
      familles(tache({ id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: attestation() }), true)
    ).toEqual([]);
  });
});

describe('GOV-038 — le rendu est qualifié par dépôt (REQ-GOV-008)', () => {
  it('une PR de CE dépôt se cite sans qualifier : elle y résout', () => {
    expect(referencePr(tache({ id: 'GOV-024', repo: 'partners', statut: 'en_cours', pr: 31, attestation: null }))).toBe(
      'PR#31'
    );
  });

  it('une PR d’AILLEURS se lit `will383842/axion-ia#998 (…)`, jamais `PR#998`', () => {
    const rendu = referencePr(
      tache({ id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: attestation() })
    );
    expect(rendu).toContain('will383842/axion-ia#998');
    expect(rendu).not.toMatch(/(^|[^-\w])PR ?#998/);
    // Le SHA court accompagne la référence : le numéro dit OÙ chercher, le SHA dit QUOI.
    expect(rendu).toContain(SHA_REEL.slice(0, 7));
  });

  it('une tâche sans PR ni attestation ne rend rien — jamais une référence inventée', () => {
    expect(referencePr(tache({ id: 'DM-07', repo: 'partners', statut: 'a_faire', pr: null, attestation: null }))).toBeNull();
    expect(referencePr(tache({ id: 'INT-T02', repo: 'axionia', statut: 'a_faire', pr: null, attestation: null }))).toBeNull();
  });

  it('le cas dégradé est DIT, pas maquillé : un `pr` nu hors dépôt ne se rend pas `PR#998`', () => {
    const rendu = referencePr(
      tache({ id: 'INT-T01b', repo: 'axionia', statut: 'fusionnee', pr: 998, attestation: null })
    );
    expect(rendu).not.toMatch(/^PR#998$/);
    expect(rendu).toContain('NON QUALIFIÉ');
  });
});

describe('GOV-038 — aucun appelant ne recompose une référence de PR à la main', () => {
  /**
   * Le périmètre est CALCULÉ : tout script qui lit `docs/tasks.json`. Une liste tenue à la main
   * aurait oublié le prochain point de rendu, qui est exactement le cas qu'on veut attraper.
   */
  const scripts = execFileSync('git', ['ls-files', 'scripts'], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.ts') || s.endsWith('.js'))
    .filter((s) => readFileSync(s, 'utf8').includes('docs/tasks.json'));

  const INTERPOLE_PR = /\$\{[^}]*\.pr\b[^}]*\}/;
  const INTERPOLE_ID = /\$\{[^}]*\bid\b[^}]*\}/;
  /** `PR#${…}` ou `PR #${…}` : la forme NUE, celle qui ne dit pas de quel dépôt on parle. */
  const FORME_NUE = /PR ?#\$\{/;
  /** Le dépôt nommé sur la même ligne, ou la composition déléguée au module qui sait le faire. */
  const QUALIFIE = /\$\{\s*depot\b|referencePr\s*\(/;

  /**
   * La règle, énoncée positivement : une ligne qui cite l'identifiant d'une TÂCHE et interpole SON
   * numéro de PR compose une référence de PR de tâche ; elle doit alors nommer le dépôt, et ne
   * jamais écrire la forme nue `PR#…`.
   *
   * ⚠️ LA PREMIÈRE RÉDACTION S'ARRÊTAIT À « id + .pr », ET ELLE A CONDAMNÉ CE QUI PROTÈGE : elle
   * faisait rougir les quatre lignes de `scripts/gates/gov-attestation.ts` qui écrivent
   * `${depot}#${a.pr}`, c'est-à-dire exactement la forme qualifiée que cette tâche installe. Une
   * garde lexicale trop large force à retirer la bonne écriture pour obtenir le vert.
   */
  const composeUneReferenceNue = (ligne: string): boolean =>
    INTERPOLE_PR.test(ligne) && INTERPOLE_ID.test(ligne) && (FORME_NUE.test(ligne) || !QUALIFIE.test(ligne));

  it('le périmètre n’est pas vide — sans quoi ce test serait vert en ne mesurant rien', () => {
    // Témoin positif. « 0 faute » et « 0 fichier scanné » sont indiscernables dans un journal.
    expect(scripts.length).toBeGreaterThan(5);
    expect(scripts).toContain('scripts/plan-state/build.ts');
    expect(scripts).toContain('scripts/reprise.ts');
    expect(scripts).toContain('scripts/lot/cloture.ts');
    // Et le contre-témoin du périmètre : un fichier qui compose la référence QUALIFIÉE est bien
    // dans le champ du balayage, donc son silence ci-dessous est un verdict, pas un oubli.
    expect(scripts).toContain('scripts/gates/gov-attestation.ts');
  });

  it('le critère sait dire oui et non — sur deux lignes fabriquées pour ça', () => {
    expect(composeUneReferenceNue('`${t.id} PR#${t.pr}`')).toBe(true);
    expect(composeUneReferenceNue('`${t.id} ${t.owner} PR #${t.pr}`')).toBe(true);
    // Qualifiée : le dépôt est nommé sur la ligne. C'est ce que la première rédaction refusait.
    expect(composeUneReferenceNue('`${t.id} — ${depot}#${a.pr} fusionnée`')).toBe(false);
    // Déléguée au seul module qui sait composer.
    expect(composeUneReferenceNue('const ref = referencePr(t); // ${t.id} ${t.pr}')).toBe(false);
    // Et la PR d'une ENTRÉE DE JOURNAL, qui est bien une PR d'ici, n'est pas concernée.
    expect(composeUneReferenceNue('`### PR #${e.pr} — ${e.date} — ${e.titre}`')).toBe(false);
  });

  it('aucune ligne ne compose une référence de PR de tâche sans nommer son dépôt', () => {
    const fautes: string[] = [];
    for (const f of scripts) {
      readFileSync(f, 'utf8').split('\n').forEach((ligne, i) => {
        if (composeUneReferenceNue(ligne)) fautes.push(`${f}:${i + 1} — ${ligne.trim()}`);
      });
    }
    expect(fautes, 'ces lignes composent une référence de PR de tâche à la main : appelle referencePr()').toEqual([]);
  });

  it('les trois points de rendu d’une PR de tâche passent par `referencePr`', () => {
    for (const f of ['scripts/plan-state/build.ts', 'scripts/reprise.ts', 'scripts/lot/cloture.ts']) {
      expect(readFileSync(f, 'utf8'), `${f} doit importer referencePr`).toContain('referencePr');
    }
  });

  it('la correspondance dépôt → coordonnée de forge n’est écrite qu’une fois', () => {
    // RM-01. `DEPOTS` porte la correspondance ; `attestation.ts` est le SEUL fichier de `scripts/`
    // à écrire la coordonnée en clair. Mesuré : la gate en ligne `gov-attestation.ts` interroge
    // pourtant `repos/<slug>/commits/<sha>` — elle le fait en DÉRIVANT le slug par
    // `depotDeLaTache()`, et n'apparaît donc pas ici. C'est le résultat qu'on veut : le jour où le
    // dépôt axionia est renommé, une seule ligne change.
    const slug = DEPOTS.axionia!;
    const porteurs = execFileSync('git', ['ls-files', 'scripts'], { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.endsWith('.ts') || s.endsWith('.js'))
      .filter((s) => readFileSync(s, 'utf8').includes(slug));
    expect(porteurs).toEqual(['scripts/lot/attestation.ts']);
  });

  it('le fichier de la gate en ligne existe et n’est appelé ni par `pnpm test` ni par `gov:check`', () => {
    // Une vérification qui interroge la forge ne doit JAMAIS entrer dans la suite : elle rendrait
    // le verdict dépendant du réseau, d'un jeton et d'un quota (mesuré le 2026-09-05).
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['gov:check'] ?? '').not.toContain('attestation');
    expect(readFileSync(join('scripts', 'gates', 'gov-attestation.ts'), 'utf8')).toContain('--en-ligne');
  });
});
