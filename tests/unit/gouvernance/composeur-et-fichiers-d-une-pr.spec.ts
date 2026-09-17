/**
 * GOV-056 — le composeur compare des `paths` quand les taches promettent des `tests{}`,
 * et rien ne juge les fichiers d'une PR.
 *
 * @req REQ-GOV-021
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI CHAQUE BLOC EXISTE.
 *
 *   (1) LA COLLISION DE LOT SE MESURE SUR LES DEUX CHAMPS. `docs/tasks.json` porte deux listes de
 *       fichiers par tache : `paths` (la SOURCE) et `tests{}` (les SPECIFICATIONS). Le composeur ne
 *       lisait que la premiere. Deux taches dont les `paths` sont disjoints mais dont les `tests{}`
 *       nomment la MEME specification entraient donc dans le meme lot, et leurs deux arbres de
 *       travail se marchaient dessus sur un fichier que le composeur avait declare disjoint.
 *
 *   (2) LES FICHIERS D'UNE PR SE CONFRONTENT AUX `paths` DE SES TACHES. Mesure du 2026-09-13 : dix
 *       fichiers de code modifies par la PR 31 ne figuraient dans les `paths` d'AUCUNE tache. La
 *       garde vit la ou la PR est DEJA lue (`scripts/gates/gov-pr.ts`), famille
 *       `fichier_hors_paths_des_taches` : une seconde lecture de la forge serait une seconde source.
 *
 *   (3) `docs/gates.json` EST UN REGISTRE APPEND-ONLY, EXCLU DU TEST DE COLLISION — et l'exclusion
 *       N'EST PAS UNE LISTE EXTENSIBLE : tout second fichier exige un ADR, et c'est ce bloc qui le
 *       tient. Temoin a deux faces : une liste fabriquee a deux entrees sans ADR est REFUSEE en
 *       nommant la seconde ; la liste REELLE du depot passe.
 *
 *   (4a) LA DIVERGENCE `paths` / `tests{}` EST LA CONVENTION, et elle se MESURE. Le bloc la
 *       re-mesure au jour de son execution et l'IMPRIME : aucun nombre n'est tape ici.
 *
 *   (4b) UNE SPECIFICATION SUIVIE QUE NULLE TACHE NE REVENDIQUE EST UNE GARDE QUE PERSONNE NE PORTE.
 *       Temoin a deux faces : une specification neuve non revendiquee est NOMMEE ; l'etat du depot
 *       sort a zero, avec le compte des specifications reellement confrontees.
 *
 * ⚠️ CE FICHIER NE ROUVRE PAS GOV-037. La garde des attributions (`gov:attributions`) reste la
 * source du jugement tache <-> `paths`. Ce qui s'ajoute ici est le jugement du LOT et celui de la PR.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// ⚠️ CET IMPORT EST LUI-MEME UN TEMOIN. Jusqu'au 2026-09-17, importer `scripts/lot/composer.ts`
// ECRIVAIT `docs/tasks.json` et `docs/lots/<id>/lot.json` — donc aucun test ne pouvait le faire, et
// le cablage du composeur n'etait garde que par une chaine lue dans son source. Le module s'importe
// desormais sans effet de bord (`LANCE_EN_SCRIPT`), et `composerLeLot()` est APPELEE plus bas.
import { composerLeLot, type Tache as TacheDuComposeur } from '../../../scripts/lot/composer';
import { lireRegistre } from '../../../scripts/lot/registre-decisions';
import {
  REGISTRES_APPEND_ONLY,
  cheminDePromesse,
  cheminsDeLaTache,
  cheminsSoumisALaCollision,
  collisionEntre,
  divergencePathsTests,
  exclusionsSansAdr,
  promessesSansDossier,
  retenirSansCollision,
  specificationsOrphelines,
  type TacheDeLot,
} from '../../../scripts/lot/chemins-de-tache';

const backlog = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheDeLot[] };

/** Les specifications SUIVIES par git — pas celles du disque (RM-14 : un fichier neuf est invisible). */
function specificationsSuivies(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64e6 })
    .split('\n')
    .filter((f) => f.endsWith('.spec.ts'));
}

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/**
 * ⚠️ `tests` EST SANS DEFAUT, ET C'EST RM-11. Cet assistant portait `tests = {}` — un defaut sur la
 * variable MEME du livrable (1), celle dont l'oubli est le defaut que ce fichier garde. L'effet
 * etait nul (`{}` et `undefined` donnent le meme ensemble de chemins), mais la forme est exactement
 * celle que RM-11 interdit : un champ que le sujet du test peut oublier de poser sans qu'on le voie.
 * Chaque appel dit desormais ce qu'il promet, fut-ce `{}`.
 */
const tache = (id: string, paths: string[], tests: Record<string, string[]>): TacheDeLot => ({
  id,
  paths,
  tests,
});

/** Toutes les promesses de `tests{}` du registre — DERIVEES, pour n'en taper ni le total ni la part. */
function promessesDuRegistre(): { toutes: string[]; avecTitre: string[] } {
  const toutes = backlog.taches.flatMap((t) => Object.values(t.tests ?? {}).flat());
  return { toutes, avecTitre: toutes.filter((p) => p.includes('#')) };
}

// ── (1) la collision se mesure sur les DEUX champs ───────────────────────────

describe('REQ-GOV-021 — la collision de lot lit `paths` ET `tests{}`', () => {
  it('REQ-GOV-021 — deux taches qui ne partagent qu’une SPECIFICATION sont en collision, et elle est NOMMEE', () => {
    const a = tache('T-A', ['scripts/lot/a.ts'], { 'REQ-X-001': ['tests/unit/partage.spec.ts'] });
    const b = tache('T-B', ['scripts/lot/b.ts'], { 'REQ-X-002': ['tests/unit/partage.spec.ts'] });
    expect(collisionEntre(a, b)).toEqual(['tests/unit/partage.spec.ts']);
  });

  it('REQ-GOV-021 — le titre de la promesse ne fait pas partie du chemin : `fichier.spec.ts#titre` est le meme fichier', () => {
    // Une part des promesses du registre porte un titre apres un `#` ; sans normalisation, deux
    // taches qui promettent le MEME fichier sous deux titres passeraient pour disjointes. Le compte
    // est DERIVE et imprime — il etait tape « 53 des 383 », et un nombre tape dans un test vieillit
    // a chaque tache livree sans que rien ne rougisse.
    const { toutes, avecTitre } = promessesDuRegistre();
    console.log(
      `${avecTitre.length} promesse(s) sur ${toutes.length} portent un titre apres un #.`
    );
    expect(
      avecTitre.length,
      'aucune promesse ne porte de titre : la normalisation ne garderait plus rien'
    ).toBeGreaterThan(0);
    expect(cheminDePromesse('tests/unit/x.spec.ts#REQ-GOV-021 — un titre')).toBe(
      'tests/unit/x.spec.ts'
    );
    const a = tache('T-A', ['scripts/a.ts'], { 'REQ-X-001': ['tests/unit/x.spec.ts#un titre'] });
    const b = tache('T-B', ['scripts/b.ts'], {
      'REQ-X-002': ['tests/unit/x.spec.ts#un AUTRE titre'],
    });
    expect(collisionEntre(a, b)).toEqual(['tests/unit/x.spec.ts']);
  });

  it('REQ-GOV-021 — CONTRE-TEMOIN : deux taches reellement disjointes n’entrent pas en collision', () => {
    const a = tache('T-A', ['scripts/lot/a.ts'], { 'REQ-X-001': ['tests/unit/a.spec.ts'] });
    const b = tache('T-B', ['scripts/lot/b.ts'], { 'REQ-X-002': ['tests/unit/b.spec.ts'] });
    expect(collisionEntre(a, b)).toEqual([]);
  });

  it('REQ-GOV-021 — le composeur lit la MEME fonction : aucune seconde lecture des champs (RM-01)', () => {
    // ⚠️ CES DEUX ASSERTIONS DOCUMENTENT, ELLES NE GARDENT RIEN, et c'est mesure : on a remis la
    // disjonction sur `paths` seul et retire `cheminsSoumisALaCollision` de la liste d'import —
    // l'import `from './chemins-de-tache'` SURVIT (les deux autres noms importes sont encore
    // consommes plus bas), et les deux assertions restent VERTES. Une variante a UNE LETTRE pres
    // (`(c)` au lieu de `(p)`) passe aussi. Une garde qui connait une orthographe ne connait pas un
    // comportement. Ce qui GARDE le livrable (1), c'est le bloc « COMPORTEMENT » ci-dessous, qui
    // EXECUTE la composition ; ces deux lignes disent seulement ou elle est censee vivre.
    const composeur = readFileSync('scripts/lot/composer.ts', 'utf8');
    expect(composeur).toContain("from './chemins-de-tache'");
    // La detection ne doit plus lire `t.paths` seul pour peupler l'ensemble des chemins pris.
    expect(composeur).not.toMatch(/t\.paths\.some\(\(p\) => pris\.has\(p\)\)/);
  });
});

// ── (1) COMPORTEMENT : la composition du lot EXECUTEE, pas relue ─────────────

/**
 * Le livrable (1) n'etait garde que par deux assertions sur le TEXTE de `composer.ts`, parce que la
 * boucle qui compose reellement le lot vivait au niveau module d'un script qui ECRIT `docs/tasks.json`
 * et `docs/lots/<id>/lot.json` au seul fait d'etre importe : aucun test ne pouvait l'executer.
 * *Le code n'etait pas testable, alors on a teste sa syntaxe.*
 *
 * `retenirSansCollision()` est cette boucle, PURE et exportee : elle prend des taches, elle rend le
 * lot retenu et les ecarts NOMMES. Les effets de bord — lecture du registre, ecriture de `tasks.json`
 * et du `lot.json` — restent dans le script, qui l'APPELLE. C'est elle que les temoins ci-dessous
 * executent, et c'est elle que `collisionEntre()` sert : la regle d'intersection n'est plus ecrite
 * deux fois (RM-01).
 */
describe('REQ-GOV-021 — COMPORTEMENT : la composition du lot separe deux taches qui partagent une specification', () => {
  it('REQ-GOV-021 — deux taches qui ne partagent qu’une entree de `tests{}` sont SEPAREES, et l’ecart nomme le FICHIER et la TACHE', () => {
    const a = tache('T-A', ['scripts/lot/a.ts'], { 'REQ-X-001': ['tests/unit/partage.spec.ts'] });
    const b = tache('T-B', ['scripts/lot/b.ts'], { 'REQ-X-002': ['tests/unit/partage.spec.ts'] });
    const { retenues, ecartees } = retenirSansCollision([a, b], 8);
    // Leurs `paths` sont disjoints : une composition qui ne lit que `paths` les met dans le MEME lot.
    expect(retenues.map((t) => t.id)).toEqual(['T-A']);
    expect(ecartees.map((e) => e.id)).toEqual(['T-B']);
    // Une raison qui ne nomme ni le fichier ni la tache oblige a relire le backlog pour savoir
    // ce qui a ete ecarte, et pourquoi.
    expect(ecartees[0]!.raison).toContain('tests/unit/partage.spec.ts');
    expect(ecartees[0]!.raison).toContain('T-A');
  });

  it('REQ-GOV-021 — le titre apres le `#` ne sauve pas la collision : le MEME fichier sous deux titres separe quand meme', () => {
    const a = tache('T-A', ['scripts/lot/a.ts'], {
      'REQ-X-001': ['tests/unit/partage.spec.ts#REQ-X-001 — un titre'],
    });
    const b = tache('T-B', ['scripts/lot/b.ts'], {
      'REQ-X-002': ['tests/unit/partage.spec.ts#REQ-X-002 — un AUTRE titre'],
    });
    const { retenues, ecartees } = retenirSansCollision([a, b], 8);
    expect(retenues.map((t) => t.id)).toEqual(['T-A']);
    expect(ecartees[0]!.raison).toContain('tests/unit/partage.spec.ts');
  });

  it('REQ-GOV-021 — CONTRE-TEMOIN : deux taches reellement disjointes entrent dans le MEME lot, sans ecart', () => {
    const a = tache('T-A', ['scripts/lot/a.ts'], { 'REQ-X-001': ['tests/unit/a.spec.ts'] });
    const b = tache('T-B', ['scripts/lot/b.ts'], { 'REQ-X-002': ['tests/unit/b.spec.ts'] });
    const { retenues, ecartees } = retenirSansCollision([a, b], 8);
    expect(retenues.map((t) => t.id)).toEqual(['T-A', 'T-B']);
    expect(ecartees).toEqual([]);
  });

  it('REQ-GOV-021 — CONTRE-TEMOIN : le registre append-only ne separe rien, un second fichier partage si', () => {
    const registre = REGISTRES_APPEND_ONLY[0]!.chemin; // jamais retape : une seule declaration
    const a = tache('T-A', ['scripts/gates/a.ts', registre], {});
    const b = tache('T-B', ['scripts/gates/b.ts', registre], {});
    expect(retenirSansCollision([a, b], 8).retenues.map((t) => t.id)).toEqual(['T-A', 'T-B']);
    const c = tache('T-C', ['scripts/gates/a.ts', registre], {});
    const apres = retenirSansCollision([a, c], 8);
    expect(apres.retenues.map((t) => t.id)).toEqual(['T-A']);
    expect(apres.ecartees[0]!.raison).toContain('scripts/gates/a.ts');
  });

  it('REQ-GOV-021 — la collision se juge contre la DERNIERE retenue, et l’ecart la nomme', () => {
    const a = tache('T-A', ['scripts/lot/a.ts'], {});
    const b = tache('T-B', ['scripts/lot/b.ts'], { 'REQ-X-002': ['tests/unit/b.spec.ts'] });
    // T-C entre en collision avec la SECONDE retenue. Ce temoin-la tue `retenues.slice(0, 1)` —
    // « ne comparer qu'a la premiere ». Il ne tue PAS `retenues.slice(-1)` : il faut le SUIVANT.
    const c = tache('T-C', ['scripts/lot/c.ts'], { 'REQ-X-003': ['tests/unit/b.spec.ts'] });
    const { retenues, ecartees } = retenirSansCollision([a, b, c], 8);
    expect(retenues.map((t) => t.id)).toEqual(['T-A', 'T-B']);
    expect(ecartees[0]!.raison).toContain('tests/unit/b.spec.ts');
    expect(ecartees[0]!.raison).toContain('T-B');
  });

  it('REQ-GOV-021 — la collision se juge contre TOUTES les retenues, PAS seulement la derniere', () => {
    // 🔑 LE SENS QUI MANQUAIT. Le temoin ci-dessus fait entrer T-C en collision avec T-B, QUI EST
    // LA DERNIERE RETENUE : `for (const deja of retenues)` remplace par `retenues.slice(-1)` le
    // laissait VERT — 26/26 — alors que la panne rouvre une collision sur `paths`, c'est-a-dire le
    // cas que le composeur gardait DEJA avant GOV-056. Une garde qui n'a qu'un sens sur deux.
    // Ici T-C se dispute un fichier avec T-A, la PREMIERE retenue, et T-B n'a rien a voir.
    const a = tache('T-A', ['scripts/lot/x.ts'], {});
    const b = tache('T-B', ['scripts/lot/y.ts'], {});
    const c = tache('T-C', ['scripts/lot/x.ts'], {});
    const { retenues, ecartees } = retenirSansCollision([a, b, c], 8);
    expect(retenues.map((t) => t.id)).toEqual(['T-A', 'T-B']);
    expect(ecartees.map((e) => e.id)).toEqual(['T-C']);
    expect(ecartees[0]!.raison).toContain('scripts/lot/x.ts');
    expect(ecartees[0]!.raison).toContain('T-A');
  });

  it('REQ-GOV-021 — `max` borne le lot, et la coupure n’est PAS une collision : rien n’est ecarte par erreur', () => {
    const a = tache('T-A', ['scripts/lot/a.ts'], {});
    const b = tache('T-B', ['scripts/lot/b.ts'], {});
    const { retenues, ecartees } = retenirSansCollision([a, b], 1);
    expect(retenues.map((t) => t.id)).toEqual(['T-A']);
    expect(ecartees).toEqual([]);
  });

  it('REQ-GOV-021 — le composeur APPELLE cette fonction : la boucle ne vit plus au niveau module (RM-01)', () => {
    // ⚠️ ASSERTION LEXICALE ASSUMEE, ET MESUREE INSUFFISANTE. Elle a ete VUE survivre a la panne
    // qu'elle pretend interdire : la boucle remise au niveau module, `paths` seul, import retire,
    // le nom `retenirSansCollision(` subsistait a UNE ligne — un COMMENTAIRE qui affirmait le
    // contraire du code — et le depot entier restait vert. *Une garde tenue par une chaine finit
    // par etre tenue par la prose qui la dement.* Ce qui garde le cablage, c'est le bloc
    // « CABLAGE » ci-dessous, qui APPELLE `composerLeLot()`.
    const composeur = readFileSync('scripts/lot/composer.ts', 'utf8');
    expect(composeur).toContain('retenirSansCollision(');
  });
});

// ── (1) CABLAGE : le composeur EXERCE, pas relu ──────────────────────────────

/**
 * 🔴 CE QUE CE BLOC FERME, ET QU'AUCUN AUTRE NE FERMAIT. La regle de disjonction etait sortie dans
 * `retenirSansCollision()`, mais le CABLAGE entre `composer.ts` et elle n'etait garde que par une
 * chaine lue dans le source. Une panne d'UNE LIGNE au point d'appel —
 * `retenirSansCollision(eligibles.map((t) => ({ ...t, tests: undefined })), max)` — laissait
 * 26/26 verts et `tsc` muet, tout en remettant le defaut que GOV-056 ferme : mesure sur le registre
 * livre, 24 paires de taches aux `paths` disjoints mais aux `tests{}` recouvrants retombaient dans
 * le meme lot, sans un ecart.
 *
 * Le remede n'est pas une meilleure expression reguliere : c'est que `composer.ts` s'IMPORTE sans
 * effet de bord (`LANCE_EN_SCRIPT`, le patron de `scripts/plan-state/build.ts`) et expose l'entree
 * reelle, `composerLeLot()`. Ces temoins l'APPELLENT. Ils ne lisent aucun texte.
 */
describe('REQ-GOV-021 — CABLAGE : `composerLeLot()` est la vraie entree, et elle lit les DEUX champs', () => {
  /** Une tache de backlog complete — le composeur lit plus de champs que le lecteur de chemins. */
  const tacheDeBacklog = (
    id: string,
    paths: string[],
    tests: Record<string, string[]>
  ): TacheDuComposeur => ({
    id,
    titre: id,
    phase: 0,
    repo: 'partners',
    zone: 'gouvernance',
    paths,
    schema: false,
    sensible: [],
    deps: [],
    reqs: ['REQ-GOV-021'],
    hyp: [],
    externe: null,
    estimateDays: 1,
    tests,
    statut: 'a_faire',
  });

  // Le lecteur UNIQUE du registre, sur un registre VIDE : aucune de ces taches ne cite d'hypothese,
  // donc rien ne lui est demande — mais on ne fabrique pas un faux lecteur pour autant (RM-01).
  const registre = lireRegistre('');
  const options = { phase: 0, repo: 'partners', max: 8, registre };

  it('REQ-GOV-021 — deux taches aux `paths` DISJOINTS et aux `tests{}` RECOUVRANTS sont SEPAREES par le composeur', () => {
    const a = tacheDeBacklog('T-A', ['scripts/lot/a.ts'], {
      'REQ-GOV-021': ['tests/unit/partagee.spec.ts'],
    });
    const b = tacheDeBacklog('T-B', ['scripts/lot/b.ts'], {
      'REQ-GOV-021': ['tests/unit/partagee.spec.ts#un titre'],
    });
    const { retenues, ecartees } = composerLeLot([a, b], options);
    expect(retenues.map((t) => t.id)).toEqual(['T-A']);
    expect(ecartees.map((e) => e.id)).toEqual(['T-B']);
    expect(ecartees[0]!.raison).toContain('tests/unit/partagee.spec.ts');
    expect(ecartees[0]!.raison).toContain('T-A');
  });

  it('REQ-GOV-021 — CONTRE-TEMOIN : deux taches reellement disjointes entrent dans le MEME lot', () => {
    const a = tacheDeBacklog('T-A', ['scripts/lot/a.ts'], {
      'REQ-GOV-021': ['tests/unit/a.spec.ts'],
    });
    const b = tacheDeBacklog('T-B', ['scripts/lot/b.ts'], {
      'REQ-GOV-021': ['tests/unit/b.spec.ts'],
    });
    const { retenues, ecartees } = composerLeLot([a, b], options);
    expect(retenues.map((t) => t.id)).toEqual(['T-A', 'T-B']);
    expect(ecartees).toEqual([]);
  });

  it('REQ-GOV-021 — LE SCRIPT ENTIER, lance sur un depot jetable, ecrit un `lot.json` qui SEPARE les deux taches', () => {
    // 🔑 LE TEMOIN QUI FERME LE DERNIER CRAN. `composerLeLot()` est exercee par les deux temoins
    // ci-dessus, mais le PILOTE — ce qui lit `docs/tasks.json` et appelle la composition — ne
    // l'etait par rien : la meme panne d'une ligne, ecrite au point d'appel du PILOTE plutot qu'a
    // celui de la composition, survivait. Une garde qui s'arrete au premier appelant laisse le
    // second ouvert. Ici, c'est `composer.ts` LUI-MEME qui tourne, dans un depot jetable — jamais
    // dans l'arbre de travail, ou il ecrirait `docs/tasks.json` au milieu de la passe.
    const bac = mkdtempSync(join(tmpdir(), 'lot-'));
    try {
      mkdirSync(join(bac, 'docs'), { recursive: true });
      const t = (id: string, paths: string[], spec: string): TacheDuComposeur => ({
        id,
        titre: id,
        phase: 0,
        repo: 'partners',
        zone: 'gouvernance',
        paths,
        schema: false,
        sensible: [],
        deps: [],
        reqs: ['REQ-GOV-021'],
        hyp: [],
        externe: null,
        estimateDays: 1,
        tests: { 'REQ-GOV-021': [spec] },
        statut: 'a_faire',
      });
      writeFileSync(
        join(bac, 'docs', 'tasks.json'),
        JSON.stringify(
          {
            version: 1,
            taches: [
              // `paths` DISJOINTS, `tests{}` RECOUVRANTS : le cas exact que GOV-056 ferme.
              t('T-A', ['scripts/lot/a.ts'], 'tests/unit/partagee.spec.ts'),
              t('T-B', ['scripts/lot/b.ts'], 'tests/unit/partagee.spec.ts#un titre'),
            ],
          },
          null,
          2
        )
      );
      writeFileSync(join(bac, 'docs', 'DECISIONS.md'), '# Registre\n');
      execFileSync('git', ['init', '-q'], { cwd: bac });
      const r = spawnSync(
        'npx',
        [
          'tsx',
          resolve('scripts/lot/composer.ts'),
          '--phase',
          '0',
          '--repo',
          'partners',
          '--max',
          '5',
          '--now',
          '2026-09-17T09:00:00Z',
        ],
        { cwd: bac, encoding: 'utf8', shell: true }
      );
      const sortie = (r.stdout ?? '') + (r.stderr ?? '');
      expect(r.status, sortie).toBe(0);
      const dossiers = readdirSync(join(bac, 'docs', 'lots'));
      expect(dossiers.length, sortie).toBe(1);
      const lot = JSON.parse(
        readFileSync(join(bac, 'docs', 'lots', dossiers[0]!, 'lot.json'), 'utf8')
      ) as { taches: { id: string }[]; ecartees: { id: string; raison: string }[] };
      expect(
        lot.taches.map((x) => x.id),
        sortie
      ).toEqual(['T-A']);
      expect(
        lot.ecartees.map((e) => e.id),
        sortie
      ).toEqual(['T-B']);
      expect(lot.ecartees[0]!.raison).toContain('tests/unit/partagee.spec.ts');
      expect(lot.ecartees[0]!.raison).toContain('T-A');
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  }, 120_000);

  it('REQ-GOV-021 — importer `composer.ts` n’ECRIT rien et ne taille aucun arbre : c’est ce qui le rend testable', () => {
    // ⚠️ SANS CETTE PROPRIETE, LES DEUX TEMOINS CI-DESSUS N'EXISTERAIENT PAS : c'est l'ecriture a
    // l'import qui avait rendu la composition inatteignable, et le temoin du cablage s'etait replie
    // sur la lecture du source. Le module est deja importe en tete de ce fichier ; si l'import
    // ecrivait, `docs/tasks.json` aurait change d'empreinte entre-temps.
    // LA PREUVE PAR L'EFFET : `docs/tasks.json` est intact apres l'import, et `docs/lots/` n'a pas
    // ete cree. Le module ecrivait les DEUX ; s'il les ecrivait encore, cette passe les aurait
    // deja touches — et les deux temoins ci-dessus n'auraient meme pas pu etre ecrits.
    expect(JSON.parse(readFileSync('docs/tasks.json', 'utf8')).taches.length).toBe(
      backlog.taches.length
    );
    expect(existsSync('docs/lots'), '`docs/lots/` a ete cree par le seul import du module').toBe(
      false
    );
    // Le motif est ANCRE sur le nom du fichier, DOSSIER compris et fin de chaine : plus lache, une
    // COPIE du module sous un autre nom s'executerait, ne produirait rien et sortirait 0 — un
    // « rendu vide » reussi, le plus trompeur des verts.
    const source = readFileSync('scripts/lot/composer.ts', 'utf8');
    const ligne = source.split('\n').find((l) => l.includes('LANCE_EN_SCRIPT ='));
    expect(ligne, '`composer.ts` ne porte plus de garde `LANCE_EN_SCRIPT`').toBeDefined();
    expect(ligne!).toContain('composer');
    expect(ligne!).toContain('lot');
    expect(ligne!).toContain('$/');
  });
});

// ── (3) `docs/gates.json` exclu, et l'exclusion n'est pas extensible ─────────

describe('REQ-GOV-021 — `docs/gates.json` est un registre append-only, exclu du test de collision', () => {
  it('REQ-GOV-021 — deux taches qui ne partagent QUE `docs/gates.json` ne sont PAS en collision', () => {
    const a = tache('T-A', ['scripts/gates/a.ts', 'docs/gates.json'], {});
    const b = tache('T-B', ['scripts/gates/b.ts', 'docs/gates.json'], {});
    expect(collisionEntre(a, b)).toEqual([]);
  });

  it('REQ-GOV-021 — deux taches qui partagent un SECOND fichier sont separees, et c’est CE fichier qui est nomme', () => {
    const a = tache('T-A', ['scripts/gates/gov-entite.ts', 'docs/gates.json'], {});
    const b = tache('T-B', ['scripts/gates/gov-entite.ts', 'docs/gates.json'], {});
    expect(collisionEntre(a, b)).toEqual(['scripts/gates/gov-entite.ts']);
  });

  it('REQ-GOV-021 — l’exclusion est ecrite a UN SEUL endroit, avec son motif a cote', () => {
    const source = readFileSync('scripts/lot/chemins-de-tache.ts', 'utf8');
    expect(REGISTRES_APPEND_ONLY.map((e) => e.chemin)).toEqual(['docs/gates.json']);
    expect(REGISTRES_APPEND_ONLY[0]!.motif.length).toBeGreaterThan(80);
    // Nulle part ailleurs dans le code de lot et de gardes : une seconde ecriture serait une
    // seconde source, et c'est par la que les listes d'exclusion s'allongent.
    const ailleurs = ['scripts/lot/composer.ts', 'scripts/gates/gov-pr.ts'].filter((f) =>
      /'docs\/gates\.json'|"docs\/gates\.json"/.test(readFileSync(f, 'utf8'))
    );
    expect(ailleurs, `docs/gates.json est reecrit dans ${ailleurs.join(', ')}`).toEqual([]);
    expect(source).toContain('append-only');
  });

  it('REQ-GOV-021 — TEMOIN : un SECOND fichier exclu sans ADR est REFUSE, et il est NOMME', () => {
    const fabriquee = [
      { chemin: 'docs/gates.json', motif: 'le registre fondateur', adr: null },
      { chemin: 'docs/tasks.json', motif: 'parce que ca arrange', adr: null },
    ];
    expect(exclusionsSansAdr(fabriquee, [])).toEqual(['docs/tasks.json']);
  });

  it('REQ-GOV-021 — TEMOIN : un second fichier dont l’ADR n’existe pas sur le disque est REFUSE', () => {
    const fabriquee = [
      { chemin: 'docs/gates.json', motif: 'le registre fondateur', adr: null },
      {
        chemin: 'docs/requirements.json',
        motif: 'append-only aussi',
        adr: '9999-jamais-ecrite.md',
      },
    ];
    expect(exclusionsSansAdr(fabriquee, readdirSync('docs/adr'))).toEqual([
      'docs/requirements.json',
    ]);
  });

  it('REQ-GOV-021 — CONTRE-TEMOIN : l’exclusion REELLE du depot passe, et un second fichier ADOSSE a un ADR REEL passe aussi', () => {
    const adrs = readdirSync('docs/adr');
    expect(exclusionsSansAdr(REGISTRES_APPEND_ONLY, adrs)).toEqual([]);
    const adrReel = adrs.find((f) => /^\d{4}-.+\.md$/.test(f));
    expect(
      adrReel,
      'docs/adr/ ne porte aucune ADR : le contre-temoin ne prouverait rien'
    ).toBeDefined();
    expect(
      exclusionsSansAdr(
        [
          ...REGISTRES_APPEND_ONLY,
          { chemin: 'docs/requirements.json', motif: 'append-only', adr: adrReel! },
        ],
        adrs
      )
    ).toEqual([]);
  });
});

// ── (2) les fichiers d'une PR contre les `paths` de ses taches ───────────────

describe('REQ-GOV-021 — `gov:pr` confronte les fichiers d’une PR aux `paths` de ses taches', () => {
  it('REQ-GOV-021 — la famille `fichier_hors_paths_des_taches` a son temoin, et les contre-temoins restent verts', () => {
    const { code, sortie } = lancer('scripts/gates/gov-pr.ts', '--prove');
    expect(code, sortie).toBe(0);
    expect(sortie).toContain('fichier_hors_paths_des_taches');
  });

  it('REQ-GOV-021 — la garde est VERTE sur l’etat du depot', () => {
    const { code, sortie } = lancer('scripts/gates/gov-pr.ts');
    expect(code, sortie).toBe(0);
  });

  it('REQ-GOV-021 — le perimetre confronte est le CODE, et son motif est ecrit a cote', () => {
    const garde = readFileSync('scripts/gates/gov-pr.ts', 'utf8');
    expect(garde).toContain('PERIMETRE_DU_CODE');
    // Un sous-produit de gouvernance — journal, vue regeneree, ligne de registre — est produit par
    // TOUTE PR et ne peut etre declare par aucune tache : l'y soumettre rendrait la garde
    // insatisfiable, et une gate insatisfiable se fait retirer dans la semaine.
    expect(garde).toContain('insatisfiable');
  });
});

// ── (4a) la divergence est la CONVENTION, et elle se mesure ─────────────────

describe('REQ-GOV-021 — la divergence `paths` / `tests{}` est DECLAREE, pas normalisee', () => {
  it('REQ-GOV-021 — la convention est ecrite la ou le composeur la lit', () => {
    const source = readFileSync('scripts/lot/chemins-de-tache.ts', 'utf8');
    expect(source).toContain('CONVENTION');
    expect(source).toMatch(/`paths`[^\n]*SOURCE/);
    expect(source).toMatch(/`tests\{\}`[^\n]*SPECIFICATION/);
  });

  it('REQ-GOV-021 — la mesure du jour est DERIVEE et imprimee, jamais recopiee', () => {
    const d = divergencePathsTests(backlog.taches);
    // Aucun nombre n'est attendu ici : ce qui est garde, c'est que la mesure se FAIT et se DIT.
    console.log(
      `divergence paths/tests{} sur ${backlog.taches.length} taches : ` +
        `${d.pathsHorsTests.length} declarent dans \`paths\` une specification que leur \`tests{}\` ne ` +
        `revendique pas ; ${d.testsHorsPaths.length} revendiquent dans \`tests{}\` une specification ` +
        `absente de leurs \`paths\`.`
    );
    expect(Array.isArray(d.pathsHorsTests)).toBe(true);
    expect(Array.isArray(d.testsHorsPaths)).toBe(true);
    // La divergence EXISTE : si elle tombait a zero, c'est que quelqu'un aurait normalise les deux
    // champs — decision qui appartient a un ADR, pas a un correctif de composeur.
    expect(d.pathsHorsTests.length + d.testsHorsPaths.length).toBeGreaterThan(0);
  });

  it('REQ-GOV-021 — une specification promise par `tests{}` mais absente des `paths` reste un chemin de la tache', () => {
    const t = tache('T-A', ['scripts/a.ts'], { 'REQ-X-001': ['tests/unit/a.spec.ts'] });
    expect(cheminsDeLaTache(t).sort()).toEqual(['scripts/a.ts', 'tests/unit/a.spec.ts']);
    expect(cheminsSoumisALaCollision(t).sort()).toEqual(['scripts/a.ts', 'tests/unit/a.spec.ts']);
  });
});

// ── (4b) une specification que nulle tache ne revendique ────────────────────

describe('REQ-GOV-021 — une specification suivie que nulle tache ne revendique est NOMMEE', () => {
  it('REQ-GOV-021 — TEMOIN : une specification neuve, suivie, revendiquee par personne est NOMMEE', () => {
    const suivies = [
      ...specificationsSuivies(),
      'tests/unit/gouvernance/jamais-revendiquee.spec.ts',
    ];
    expect(specificationsOrphelines(suivies, backlog.taches)).toEqual([
      'tests/unit/gouvernance/jamais-revendiquee.spec.ts',
    ]);
  });

  it('REQ-GOV-021 — CONTRE-TEMOIN : l’etat du depot ne porte AUCUNE specification orpheline', () => {
    const suivies = specificationsSuivies();
    const orphelines = specificationsOrphelines(suivies, backlog.taches);
    console.log(
      `${suivies.length} specification(s) suivie(s) confrontee(s) aux \`paths\` et aux \`tests{}\` ` +
        `de ${backlog.taches.length} taches : ${orphelines.length} orpheline(s).`
    );
    expect(
      suivies.length,
      'aucune specification confrontee : le vert ne prouverait rien'
    ).toBeGreaterThan(0);
    expect(
      orphelines,
      `specification(s) que nulle tache ne porte : ${orphelines.join(', ')}`
    ).toEqual([]);
  });

  it('REQ-GOV-021 — un nom NU dans `tests{}` ne revendique rien : il ne resout aucun fichier du depot', () => {
    // Des promesses du registre nomment un fichier sans son dossier : le compte est DERIVE et
    // imprime, jamais tape. (Il etait ecrit « 20 (`preseance.spec.ts`) » au present dans ce
    // fichier-ci, alors que le registre livre par cette PR en porte 13 et que `preseance.spec.ts`
    // est l'une des specifications qu'elle rattache.) Les resoudre par leur nom de base ferait
    // passer pour tenue une promesse qui ne pointe rien — la mesure des orphelines tomberait de
    // cinq a une sans qu'un seul fichier ait change de porteur.
    const nues = promessesSansDossier(backlog.taches);
    console.log(
      `${nues.length} promesse(s) sans dossier, sur ${new Set(nues.map((n) => n.tache)).size} tache(s) ` +
        `et ${new Set(nues.map((n) => n.nom)).size} fichier(s) distinct(s) : ` +
        `${[...new Set(nues.map((n) => n.nom))].sort().join(', ') || 'aucune'}.`
    );
    // ⚠️ SANS CETTE LIGNE, VIDER `promessesSansDossier()` RENDRAIT LE TEMOIN VERT : il imprimerait
    // « 0 / 0 / 0 » et bouclerait sur rien. *Un compteur derive qu'aucun temoin ne garde vaut le
    // compteur tape.* La derivation n'exempte pas de mesurer ce qu'elle rend.
    expect(
      nues.length,
      'aucune promesse nue derivee : le compteur ne mesure plus rien, ou le registre a change'
    ).toBeGreaterThan(0);
    // ⚠️ L'ASSERTION PRECEDENTE ETAIT TAUTOLOGIQUE : un nom nu n'a pas de `/`, `git ls-files` ne
    // rend que des chemins — elle ne pouvait pas rougir. Ce qui se garde ici est la LIMITE ECRITE :
    // certains noms nus RESSEMBLENT a un fichier suivi — ils en portent le nom de base, et c'est ce
    // qui rend la resolution par ressemblance tentante — et pourtant ils ne le revendiquent PAS.
    const suivies = specificationsSuivies();
    const avecHomonyme = nues.filter((n) => suivies.some((f) => f.endsWith('/' + n.nom)));
    console.log(
      `${avecHomonyme.length} des ${nues.length} promesses nues portent le nom de base d'un fichier ` +
        `SUIVI : ${[...new Set(avecHomonyme.map((n) => n.nom))].sort().join(', ') || 'aucune'}.`
    );
    expect(
      avecHomonyme.length,
      'aucun nom nu ne ressemble a un fichier suivi : la resolution par ressemblance ne tenterait ' +
        'personne, et cette limite ne garderait plus rien'
    ).toBeGreaterThan(0);
    for (const n of avecHomonyme) {
      // La promesse NUE, SEULE — les `paths` de la tache porteuse sont retires a dessein : plusieurs
      // d'entre elles declarent par ailleurs le chemin complet, et le vert viendrait de la, pas de
      // la regle qu'on garde. Ce qui est mesure ici, c'est que le nom nu A LUI SEUL ne revendique
      // rien, meme quand un fichier suivi en porte exactement le nom de base.
      const seuleLaPromesseNue = tache(n.tache, [], { 'REQ-GOV-021': [n.nom] });
      for (const reel of suivies.filter((f) => f.endsWith('/' + n.nom))) {
        expect(
          specificationsOrphelines([reel], [seuleLaPromesseNue]),
          `${n.nom} revendiquerait ${reel} par la seule ressemblance de son nom de base`
        ).toEqual([reel]);
      }
    }
    const t = tache('T-A', ['scripts/a.ts'], { 'REQ-X-001': ['a.spec.ts'] });
    expect(specificationsOrphelines(['tests/unit/a.spec.ts'], [t])).toEqual([
      'tests/unit/a.spec.ts',
    ]);
  });
});
