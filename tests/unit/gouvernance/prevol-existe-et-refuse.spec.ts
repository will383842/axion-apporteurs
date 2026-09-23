// @req REQ-GOV-013
/**
 * `pnpm prevol` — LA COMMANDE EXISTE, ET ELLE REFUSE.
 *
 * POURQUOI CE FICHIER EXISTE. `docs/tasks.json` (GOV-047) le déclare pour REQ-GOV-013, et
 * l'acceptation de la tâche demande une garde qui confronte les porteurs à l'existence du script
 * DANS LES DEUX SENS : un fichier qui nomme une commande absente rougit, et le retrait du script
 * rougit AVANT que le prochain agent ne le découvre à ses frais. Six fichiers suivis prescrivaient
 * `pnpm prevol` alors que le script n'existait pas — dont `scripts/lot/lot.workflow.js`, qui
 * l'INJECTE dans le prompt de chaque développeur de lot. Ils étaient SIX quand la dette a été
 * trouvée ; `partners/ADR-0018` (PR 102) en a ajouté un SEPTIÈME en atterrissant —
 * `scripts/reprise.ts`, mesuré : zéro occurrence à la base `87e235a`, une sur `954fe5a`.
 *
 * 🔑 CE QUE LA MESURE A RENDU, ET QUI N'EST PAS CE QUE L'ACCEPTATION ANNONÇAIT. Elle s'est corrigée
 * deux fois sur ce compte (« quatre documents », puis « cinq porteurs », puis « neuf fichiers ») ;
 * `git grep -l prevol` rend **quatorze** fichiers sur `origin/main` et **vingt** sur cette branche.
 * Les deux que l'acceptation ne voit toujours pas sont `docs/journal/2026-09.md` et sa vue rendue
 * `docs/PLAN-STATE.md`, qui portent la chaîne parce que l'entrée de la PR 81 y écrit que la commande
 * n'existe pas. Les trois que l'acceptation écarte à juste titre sont le backlog et ses deux vues :
 * *une tâche qui se compte elle-même fausse son propre balayage.* Les SEPT prescripteurs, eux, sont
 * confirmés au fichier près — et ce fichier les fige, pour qu'un huitième ne s'ajoute pas en silence.
 *
 * CE QUE CE FICHIER PROUVE. Le balayage est jugé sur des entrées INJECTÉES (RM-11) : périmètre,
 * lecteur et scripts déclarés sont des paramètres, donc les deux sens sont éprouvables sans toucher
 * au dépôt. Les QUATRE sorties non nulles du script, déclarées à zéro témoin au registre des refus
 * (REQ-GOV-032) quand il est né, sont exercées ici sur le BINAIRE, dans des dépôts jetables : c'est
 * le banc que ce registre réclamait en toutes lettres.
 *
 * CE QU'IL NE PROUVE PAS, ET C'EST DÉLIBÉRÉ. Il ne joue jamais la porte A réelle : un pré-vol
 * complet dure ≈ 25 min, dont ≈ 14 min de `pnpm test`, et une suite qui s'appelle elle-même ne
 * terminerait pas. Les dépôts jetables portent donc un `ci.yml` à une étape, et c'est la STRUCTURE
 * du refus qui est mesurée, pas la porte A.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  BACKLOG_ET_SES_VUES,
  CI,
  NOM_DU_SCRIPT,
  RACINES_DU_RECIT,
  SUBSTITUTION_TOLEREE,
  balayer,
  causeProbable,
  commandesOrdonnees,
  etapesDeLaPorteA,
  etapesQuiLancentLaSuite,
  fichiersDeBanc,
  raconteSeulement,
  scriptsQuiLancentLaSuite,
} from '../../../scripts/prevol';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';

const SCRIPT = resolve('scripts/prevol.ts');
const TSX = resolve('node_modules/tsx/dist/cli.mjs');
const MOI = 'scripts/prevol.ts';

const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const suivis = fichiersSuivis();
const lire = (chemin: string): string => readFileSync(chemin, 'utf8');
const surLeDepot = (scriptsDeclares = Object.keys(paquet.scripts)) =>
  balayer(suivis, lire, scriptsDeclares, MOI);

/**
 * LES SEPT PRESCRIPTEURS, TELS QUE `git grep -l prevol` PUIS LE BALAYAGE LES RENDENT. Cette liste
 * n'est pas recopiée de l'acceptation : elle a été mesurée, et l'acceptation s'est trompée trois
 * fois sur le compte voisin. Elle est ici pour qu'un huitième porteur ne s'ajoute pas sans qu'on
 * le voie — et qu'on se demande alors s'il prescrit vraiment.
 */
const PRESCRIPTEURS_MESURES = [
  '.claude/agents/dev-partners.md',
  'docs/CHARTE-AGENTS.md',
  'docs/CONVENTIONS.md',
  'docs/PROMPTS/developpeur.md',
  'docs/agents.json',
  'scripts/lot/lot.workflow.js',
  'scripts/reprise.ts',
];

// ── les dépôts jetables ───────────────────────────────────────────────────────

const jetables: string[] = [];
afterAll(() => {
  for (const d of jetables) rmSync(d, { recursive: true, force: true });
});

/** Les quatre rendus locaux du pré-vol, rendus inoffensifs : le sujet ici est le REFUS, pas la vue. */
const SCRIPTS_JETABLES: Record<string, string> = {
  prevol: 'tsx scripts/prevol.ts',
  'gov:trace:render': 'node -e 0',
  'gov:tasks:render': 'node -e 0',
  'adr:index': 'node -e 0',
  'plan-state:build': 'node -e 0',
  test: 'vitest run',
};

/**
 * Un dépôt jetable, SUIVI PAR GIT (`git add`, sans commit : le balayage lit l'index). Sans dépôt, le
 * périmètre serait INCONNU et le pré-vol refuserait avant d'arriver au refus qu'on veut mesurer.
 */
function jetable(fichiers: Record<string, string>): string {
  const dossier = realpathSync(mkdtempSync(join(tmpdir(), 'prevol-')));
  const tous = { 'package.json': JSON.stringify({ scripts: SCRIPTS_JETABLES }), ...fichiers };
  for (const [relatif, contenu] of Object.entries(tous)) {
    mkdirSync(dirname(join(dossier, relatif)), { recursive: true });
    writeFileSync(join(dossier, relatif), contenu);
  }
  execFileSync('git', ['init', '-q'], { cwd: dossier, stdio: 'ignore' });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '-A'], {
    cwd: dossier,
    stdio: 'ignore',
  });
  jetables.push(dossier);
  return dossier;
}

/** Un `ci.yml` à une seule étape jouable : la porte A réelle n'est jamais rejouée ici. */
function ciAUneEtape(nom: string, commande: string): string {
  return [
    'name: Gate A',
    'jobs:',
    '  gate-a:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    `      - name: ${nom}`,
    `        run: ${commande}`,
    '',
  ].join('\n');
}

function lancer(dossier: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, SCRIPT, ...args], {
    cwd: dossier,
    encoding: 'utf8',
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

// ── la commande EXISTE ────────────────────────────────────────────────────────

describe('REQ-GOV-013 — la commande que sept fichiers prescrivent EXISTE', () => {
  it('REQ-GOV-013 — `package.json` déclare le script, et le fichier qu’il lance est sur le disque', () => {
    const corps = paquet.scripts[NOM_DU_SCRIPT];
    expect(corps, `\`package.json\` ne déclare aucun script \`${NOM_DU_SCRIPT}\``).toBeDefined();
    // Le chemin n'est pas tapé ici : il est LU dans le corps du script. Déclarer une entrée qui
    // lance un fichier absent est le même défaut, d'un cran plus loin.
    const cible = /([\w./-]+\.ts)/.exec(corps!)?.[1];
    expect(cible, `le script \`${NOM_DU_SCRIPT}\` ne nomme aucun fichier TypeScript`).toBeDefined();
    expect(existsSync(cible!), `\`${cible}\` est prescrit et absent du disque`).toBe(true);
  });

  it('REQ-GOV-013 — les sept prescripteurs sont MESURÉS sur le dépôt, et aucun ne nomme l’introuvable', () => {
    const b = surLeDepot();
    expect(b.prescripteurs.map((p) => p.chemin)).toEqual(PRESCRIPTEURS_MESURES);
    expect(b.introuvables).toEqual([]);
    expect(b.fautes).toEqual([]);
  });

  it('REQ-GOV-013 — le résumé porte LES DEUX COMPTES, et le second est strictement plus petit', () => {
    const b = surLeDepot();
    // Les deux comptes ne sont pas le même nombre écrit deux fois : c'est tout l'intérêt de
    // l'exclusion. S'ils étaient égaux, le balayage n'aurait rien exclu.
    expect(b.brut.length).toBeGreaterThan(b.retenus.length);
    expect(b.resume).toContain(`${b.brut.length} fichier(s) suivi(s) portent la chaîne`);
    expect(b.resume).toContain(`${b.retenus.length} retenu(s) (compte APRÈS EXCLUSION)`);
    expect(b.resume).toContain('compte BRUT');
  });

  it('REQ-GOV-013 — le balayage s’EXCLUT lui-même : le backlog et ses vues sont écartés et NOMMÉS', () => {
    const b = surLeDepot();
    for (const { nom, motif } of BACKLOG_ET_SES_VUES) {
      // Chacun porte BIEN la chaîne — sans quoi l'exclusion serait décorative — et n'est PAS retenu.
      expect(b.brut, `${nom} ne porte plus la chaîne : l'exclusion ne sert plus`).toContain(nom);
      expect(b.retenus).not.toContain(nom);
      expect(b.resume).toContain(nom);
      expect(b.resume).toContain(motif);
    }
  });

  it('REQ-GOV-013 — nommer n’est pas prescrire : le script, ses tests et le récit sont comptés à part', () => {
    expect(raconteSeulement(MOI, MOI)).toBe(true);
    expect(raconteSeulement('tests/unit/gouvernance/prevol-existe-et-refuse.spec.ts', MOI)).toBe(
      true
    );
    expect(raconteSeulement('docs/journal/2026-09.md', MOI)).toBe(true);
    expect(raconteSeulement('docs/PLAN-STATE.md', MOI)).toBe(true);
    expect(raconteSeulement('docs/CONVENTIONS.md', MOI)).toBe(false);
    // Le récit reste CONFRONTÉ à `package.json` : il sort du compte des prescripteurs, pas du
    // périmètre. C'est ce qui distingue « ne prescrit pas » de « n'est pas regardé ».
    const b = surLeDepot();
    expect(b.recits.length).toBeGreaterThan(0);
    expect(b.porteurs.length).toBe(b.prescripteurs.length + b.recits.length);
    for (const { nom, motif } of RACINES_DU_RECIT)
      expect(`${nom} ${motif}`.length).toBeGreaterThan(0);
  });

  it('REQ-GOV-013 — porter n’est pas nommer : `package.json` déclare la chaîne sans la prescrire', () => {
    const b = surLeDepot();
    expect(b.retenus).toContain('package.json');
    expect(b.porteurs.map((p) => p.chemin)).not.toContain('package.json');
    expect(commandesOrdonnees(readFileSync('package.json', 'utf8'))).toEqual([]);
    expect(commandesOrdonnees(`avant de pousser : \`pnpm ${NOM_DU_SCRIPT}\``)).toEqual([
      NOM_DU_SCRIPT,
    ]);
    expect(commandesOrdonnees(`\`pnpm ${NOM_DU_SCRIPT} --liste\` l'imprime`)).toEqual([
      NOM_DU_SCRIPT,
    ]);
  });
});

describe('REQ-GOV-013 — la confrontation joue DANS LES DEUX SENS', () => {
  it('le dépôt réel est VERT : sans ce contre-témoin, aucun rouge ci-dessous ne prouverait rien', () => {
    expect(surLeDepot().fautes).toEqual([]);
  });

  it('REQ-GOV-013 — un fichier qui prescrit une commande ABSENTE de `package.json` rougit, et il est NOMMÉ', () => {
    const b = balayer(
      ['docs/FICHE-INVENTEE.md'],
      () => `4. \`pnpm ${NOM_DU_SCRIPT}\` — les hooks locaux ne font pas foi.`,
      ['lint', 'test'],
      MOI
    );
    expect(b.introuvables).toEqual([{ chemin: 'docs/FICHE-INVENTEE.md', commande: NOM_DU_SCRIPT }]);
    expect(b.fautes.join('\n')).toContain('docs/FICHE-INVENTEE.md');
    expect(b.fautes.join('\n')).toContain('lance une commande introuvable');
  });

  it('REQ-GOV-013 — le RETRAIT du script rougit chez TOUS ceux qui le nomment, d’un seul coup', () => {
    // C'est le sens que l'acceptation exige et qui n'existait nulle part : le jour où quelqu'un
    // retire l'entrée de `package.json`, la garde le dit ICI, pas le prochain agent à ses frais.
    const b = surLeDepot([]);
    expect(b.introuvables.length).toBe(b.porteurs.length);
    expect(b.introuvables.length).toBeGreaterThanOrEqual(PRESCRIPTEURS_MESURES.length);
    expect(b.fautes.length).toBeGreaterThan(0);
    for (const chemin of PRESCRIPTEURS_MESURES) {
      expect(b.introuvables.map((i) => i.chemin)).toContain(chemin);
    }
  });

  it('REQ-GOV-013 — un balayage qui ne trouve AUCUN prescripteur REFUSE au lieu de rendre vert', () => {
    // « Je n'ai rien trouvé » et « je n'ai rien regardé » sont deux phrases différentes, et une
    // seule des deux autorise à pousser. Un périmètre qui n'a plus aucun prescripteur est la
    // deuxième : la chaîne n'aurait pas disparu des fiches de rôle toute seule.
    const b = balayer(
      ['package.json'],
      () => `{"scripts":{"${NOM_DU_SCRIPT}":"tsx x.ts"}}`,
      [NOM_DU_SCRIPT],
      MOI
    );
    expect(b.prescripteurs).toEqual([]);
    expect(b.fautes.join('\n')).toContain('AUCUN prescripteur');
  });

  it('REQ-GOV-013 — une exclusion PÉRIMÉE rougit : ce qui n’exclut rien est un trou muet', () => {
    const cible = BACKLOG_ET_SES_VUES[0]!.nom;
    const b = balayer(
      [cible, 'docs/CONSIGNE.md'],
      (f) => (f === cible ? '{ "taches": [] }' : `\`pnpm ${NOM_DU_SCRIPT}\``),
      [NOM_DU_SCRIPT],
      MOI
    );
    expect(b.exclusionsPerimees).toEqual([cible]);
    expect(b.fautes.join('\n')).toContain('PÉRIMÉE');
  });

  it('un fichier hors du périmètre n’est PAS une exclusion périmée — c’est un dépôt qui ne l’a jamais eu', () => {
    const b = balayer(
      ['docs/CONSIGNE.md'],
      () => `\`pnpm ${NOM_DU_SCRIPT}\``,
      [NOM_DU_SCRIPT],
      MOI
    );
    expect(b.exclusionsPerimees).toEqual([]);
    expect(b.fautes).toEqual([]);
  });
});

// ── il REFUSE — les quatre sorties non nulles, sur le binaire ─────────────────

describe('REQ-GOV-013 — il REFUSE : quatre sorties non nulles, chacune sur son témoin', () => {
  it('REQ-GOV-013 — `ci.yml` ABSENT : sortie 1, et le refus nomme le fichier manquant', () => {
    const { code, sortie } = lancer(jetable({}));
    expect(code).toBe(1);
    expect(sortie).toContain(CI);
    expect(sortie).toContain('est absent');
    expect(sortie).not.toContain('PRÉ-VOL VERT');
  });

  it('REQ-GOV-013 — `ci.yml` SANS bloc `steps:` : sortie 1, et le refus dit qu’il n’a pas de source', () => {
    const { code, sortie } = lancer(jetable({ [CI]: 'name: Gate A\njobs:\n  gate-a: {}\n' }));
    expect(code).toBe(1);
    expect(sortie).toContain('aucun bloc `steps:`');
    expect(sortie).not.toContain('PRÉ-VOL VERT');
  });

  it('REQ-GOV-013 — une substitution de shell INCONNUE : sortie 1 plutôt qu’une exécution à l’aveugle', () => {
    const dossier = jetable({
      [CI]: ciAUneEtape('Etape hostile', 'node -e 0 --quand "$(rm -rf /)"'),
    });
    const { code, sortie } = lancer(dossier);
    expect(code).toBe(1);
    expect(sortie).toContain('substitution de shell');
    expect(sortie).toContain(SUBSTITUTION_TOLEREE);
    // Exécuter la commande qu'on n'a pas comprise est la manière connue de rendre un vert sans
    // mesure : le refus doit tomber AVANT que la moindre étape ne soit lancée.
    expect(sortie).not.toContain('Vue : traçabilité');
  });

  it('REQ-GOV-013 — une étape ROUGE : sortie 1, verdict rouge, et l’étape est nommée', () => {
    const dossier = jetable({
      'docs/CONSIGNE.md': `avant de pousser : \`pnpm ${NOM_DU_SCRIPT}\``,
      [CI]: ciAUneEtape('Une etape qui echoue', 'node -e "process.exit(3)"'),
    });
    const { code, sortie } = lancer(dossier);
    expect(code).toBe(1);
    expect(sortie).toContain('PRÉ-VOL ROUGE');
    expect(sortie).toContain('Une etape qui echoue');
  });

  it('un arbre SAIN sort en 0 : sans ce contre-témoin, les quatre refus ne prouvent rien', () => {
    const dossier = jetable({
      'docs/CONSIGNE.md': `avant de pousser : \`pnpm ${NOM_DU_SCRIPT}\``,
      [CI]: ciAUneEtape('Une etape verte', 'node -e 0'),
    });
    const { code, sortie } = lancer(dossier);
    expect(code).toBe(0);
    expect(sortie).toContain('PRÉ-VOL VERT');
    // Et le balayage a bien tourné dans cet arbre : un vert obtenu en ne balayant rien ne vaut rien.
    expect(sortie).toContain('PRESCRIPTEUR(S)');
    expect(sortie).toContain('docs/CONSIGNE.md');
  });

  it('`--liste` n’EXÉCUTE aucune étape : le mode qui dit sans faire', () => {
    const dossier = jetable({
      'docs/CONSIGNE.md': `avant de pousser : \`pnpm ${NOM_DU_SCRIPT}\``,
      [CI]: ciAUneEtape(
        'Une etape qui laisse une trace',
        "node -e \"require('fs').writeFileSync('trace.txt','x')\""
      ),
    });
    const { code, sortie } = lancer(dossier, '--liste');
    expect(code).toBe(0);
    expect(sortie).toContain('Une etape qui laisse une trace');
    expect(
      existsSync(join(dossier, 'trace.txt')),
      '`--liste` a exécuté une étape : ce mode ne doit rien faire'
    ).toBe(false);
  });
});

// ── il DIT ce qu'il a dérivé ──────────────────────────────────────────────────

describe('REQ-GOV-013 — il DIT ce qu’il joue, ce qu’il écarte, et pourquoi', () => {
  const { jouees, ecartees } = etapesDeLaPorteA(readFileSync(CI, 'utf8'));

  it('REQ-GOV-013 — la liste est LUE dans `ci.yml` : chaque étape jouée y a son `run:`', () => {
    const texte = readFileSync(CI, 'utf8');
    expect(jouees.length).toBeGreaterThan(0);
    // La dérivation se prouve par le renversement : une étape retirée de `ci.yml` disparaît de la
    // liste. Une liste tenue dans le script serait insensible à ce retrait — et c'est exactement
    // le vert qui mentirait le jour où une garde entre en CI.
    const sansLint = texte.replace('      - name: Lint\n        run: pnpm lint\n', '');
    expect(sansLint).not.toBe(texte);
    expect(etapesDeLaPorteA(sansLint).jouees.length).toBe(jouees.length - 1);
  });

  it('REQ-GOV-013 — chaque étape ÉCARTÉE porte son motif : une étape tue redevient une étape oubliée', () => {
    expect(ecartees.length).toBeGreaterThan(0);
    for (const e of ecartees) {
      expect(e.nom.length).toBeGreaterThan(0);
      expect(e.motif.length).toBeGreaterThan(0);
    }
  });

  it('la seule substitution tolérée est REMPLACÉE, et aucune commande jouée n’en garde une', () => {
    for (const e of jouees) expect(e.commande).not.toContain('$(');
    const avecInstant = jouees.filter((e) =>
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(e.commande)
    );
    expect(avecInstant.length).toBeGreaterThan(0);
  });

  it('`--liste` sur le dépôt réel sort en 0 et rend le balayage avec ses deux comptes', () => {
    const r = spawnSync(process.execPath, [TSX, SCRIPT, '--liste'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    const b = surLeDepot();
    expect(sortie).toContain(`${b.brut.length} fichier(s) suivi(s) portent la chaîne`);
    expect(sortie).toContain(`${b.retenus.length} retenu(s) (compte APRÈS EXCLUSION)`);
    expect(sortie).toContain(`${b.prescripteurs.length} PRESCRIPTEUR(S)`);
    for (const { nom } of BACKLOG_ET_SES_VUES) expect(sortie).toContain(nom);
  });

  it('la garde des termes interdits est JOUÉE, elle n’est pas écartée', () => {
    // 🔴 MESURÉ LE 2026-09-22, ET C'EST LA RAISON POUR LAQUELLE LA SOURCE EST `ci.yml`. Le nom
    // `gov:check` désignait deux choses : la garde des termes interdits au registre `docs/gates.json`,
    // et une CHAÎNE de 17 gardes dans `package.json` qui ne la contient PAS. La garde imprime
    // pourtant `gov:check` dans son rouge : un développeur lance la chaîne, obtient 17 verts, et
    // conclut à un aléa. Un pré-vol dérivé de la chaîne aurait rendu VERT là où la CI rougit.
    // ⚠️ `partners/ADR-0018` a RETIRÉ le nom des deux côtés : la chaîne s'appelle `gov:partiel`,
    // la garde `gov:termes-interdits`. Lire une clé absente rendrait `undefined`, puis `''`, puis
    // `[]` — et DEUX des trois attentes ci-dessous passeraient en n'assérant plus rien. On REFUSE
    // donc l'absence, au lieu de la lire à vide.
    const NOM_DE_LA_CHAINE = 'gov:partiel';
    const chaine = paquet.scripts[NOM_DE_LA_CHAINE];
    expect(
      chaine,
      `package.json ne porte plus de chaîne « ${NOM_DE_LA_CHAINE} » : sans elle ce contrôle se tairait`
    ).toBeDefined();
    const dansLaChaine = [...chaine!.matchAll(/pnpm ([\w:.-]+)/g)].map((m) => m[1]!);
    expect(
      dansLaChaine.length,
      'non-vacuité : une chaîne vide rendrait tout le reste vrai'
    ).toBeGreaterThan(0);
    expect(dansLaChaine).not.toContain('gov:termes-interdits');
    const jouee = jouees.map((e) => e.commande);
    expect(jouee).toContain('pnpm gov:termes-interdits');
    // Et le trou n'est pas d'une étape : la chaîne est un sous-ensemble strict, très strict.
    expect(jouees.length).toBeGreaterThan(dansLaChaine.length * 2);
  });
});

// ── un rouge de banc absent ne se lit pas comme un rouge de test ──────────────

describe('REQ-GOV-013 — un rouge qui nomme la mauvaise cause coûte plus cher qu’un rouge absent', () => {
  const { jouees } = etapesDeLaPorteA(readFileSync(CI, 'utf8'));
  const scriptsDeLaSuite = scriptsQuiLancentLaSuite(paquet.scripts);
  const etapesDeLaSuite = etapesQuiLancentLaSuite(jouees, scriptsDeLaSuite);
  const banc = fichiersDeBanc(suivis, lire);

  it('REQ-GOV-013 — les fichiers de banc sont DÉRIVÉS du disque, jamais listés', () => {
    expect(banc.length).toBeGreaterThan(0);
    expect(banc.every((f) => f.startsWith('tests/'))).toBe(true);
    // Le renversement : le harnais cesse d'instancier le conteneur, la liste se vide. Une liste
    // écrite à la main resterait pleine et nommerait des fichiers qui n'exigent plus rien.
    expect(fichiersDeBanc(suivis, () => 'rien qui instancie un conteneur')).toEqual([]);
  });

  it('les étapes qui lancent la suite sont DÉRIVÉES du corps des scripts, pas du nom de l’étape', () => {
    expect(scriptsDeLaSuite.length).toBeGreaterThan(0);
    expect(etapesDeLaSuite.length).toBeGreaterThan(0);
    // Un script renommé emporte l'étape avec lui : c'est le corps qui décide, pas l'étiquette.
    expect(scriptsQuiLancentLaSuite({ 'ma:suite': 'vitest run' })).toEqual(['ma:suite']);
    expect(scriptsQuiLancentLaSuite({ lint: 'eslint .' })).toEqual([]);
    expect(etapesQuiLancentLaSuite([{ nom: 'X', commande: 'pnpm req:check' }], ['test'])).toEqual(
      []
    );
  });

  it('REQ-GOV-013 — sans démon Docker, le rouge de la suite est nommé ABSENCE DE BANC', () => {
    const nom = etapesDeLaSuite[0]!.nom;
    const dit = causeProbable(nom, etapesDeLaSuite, false, banc);
    expect(dit).not.toBeNull();
    expect(dit!).toContain('ABSENCE DE BANC');
    expect(dit!).toContain('Docker');
    // Il NOMME les fichiers concernés : sans eux, l'avertissement se lirait « quelque part ».
    for (const f of banc) expect(dit!).toContain(f);
  });

  it('l’annotation ne se déclenche QUE quand elle dit quelque chose de vrai', () => {
    const nom = etapesDeLaSuite[0]!.nom;
    // Une annotation systématique redevient un bruit qu'on apprend à ignorer, et c'est ainsi qu'un
    // vrai rouge finit par se cacher derrière elle.
    expect(causeProbable(nom, etapesDeLaSuite, true, banc)).toBeNull();
    expect(causeProbable('Lint', etapesDeLaSuite, false, banc)).toBeNull();
    expect(causeProbable(nom, etapesDeLaSuite, false, [])).toBeNull();
  });

  it('REQ-GOV-013 — il REFUSE quand même : nommer la cause n’est pas l’excuser', () => {
    // Un maillon qu'on n'a pas pu jouer reste non mesuré. Le pré-vol dit POURQUOI, il ne rend pas
    // vert pour autant — sinon l'absence de banc deviendrait une permission de pousser.
    const source = readFileSync(SCRIPT, 'utf8');
    const verdict = source.slice(source.indexOf('PRÉ-VOL ROUGE'));
    expect(verdict).toContain('causeProbable');
    expect(verdict).toContain('process.exit(1)');
  });
});
