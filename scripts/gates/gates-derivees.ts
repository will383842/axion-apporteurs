/**
 * gates-derivees.ts — `docs/GATES.md` est une VUE de `docs/gates.json` (QA-T00, REQ-QA-013, RM-01).
 *
 * USAGE : pnpm gov:gates-derivees            (échoue si la vue et le registre divergent)
 *         pnpm gov:gates-derivees --render   (régénère docs/GATES.md depuis le registre)
 *         pnpm gov:gates-derivees --prove    (un témoin par famille, chacun vu rougir)
 *
 * POURQUOI ELLE EXISTE. Deux copies divergent toujours, et celle qui est lue n'est jamais celle
 * qu'on a corrigée : le plan directeur a porté trois totaux différents pour le même backlog
 * (RM-01). `GATES.md` a exactement cette forme — un tableau par phase, des totaux en tête — et
 * personne ne recompte cent lignes à la main. La vue est donc RENDUE depuis le registre, et cette
 * garde refuse toute divergence dans les deux sens : une ligne sans entrée, une entrée sans ligne,
 * une phase, une tâche, un script, un alias ou un total qui ne sont pas ceux de la source.
 *
 * CE QU'ELLE VÉRIFIE. Elle relit `docs/GATES.md` comme un lecteur : toute ligne de tableau dont la
 * première cellule est un identifiant entre accents graves est une ligne de gate, et la phase qui
 * la juge est celle du titre le plus proche au-dessus (« ### Phase -1 — … »). Sur cette base :
 *   — appariement dans les deux sens, par `id` ;
 *   — `phase`, `tache`, `script` identiques à l'entrée ;
 *   — `alias` : le registre fait foi, un alias ne crée JAMAIS une seconde ligne ;
 *   — la présence d'une `preuveRouge` décide de la SECTION : armée (§2) ou à prouver (§3) ;
 *   — les comptes : celui écrit entre parenthèses dans chaque titre, et le tableau des totaux.
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne juge pas la prose : les paragraphes de `GATES.md` sont écrits
 * dans le `--render` ci-dessous, donc une phrase corrigée à la main dans le fichier disparaît au
 * rendu suivant sans que rien ne rougisse — le texte se corrige ICI. Elle ne dit rien de
 * l'armement (script écrit, fixture, preuve) : c'est `gates:prouvees`.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const CHEMIN_REGISTRE = 'docs/gates.json';
const CHEMIN_VUE = 'docs/GATES.md';

type Gate = {
  id: string;
  phase: number;
  script: string;
  tache: string;
  verifie?: string;
  fixtureRouge?: string;
  preuveRouge?: string | null;
  alias?: string[];
};

type Faute = { famille: string; message: string };

const FAMILLES = [
  'entete_incomplete',
  'ligne_hors_phase',
  'id_double_dans_la_vue',
  'ligne_sans_entree',
  'entree_sans_ligne',
  'phase_divergente',
  'tache_divergente',
  'script_divergent',
  'preuve_divergente',
  'alias_divergent',
  'alias_est_une_ligne',
  'compte_de_section_faux',
  'total_faux',
];

const LIBELLE_PHASE: Record<string, string> = {
  '-1': 'Socle de gouvernance',
  '0': 'Fondations, sécurité, charte',
  '1': 'Parcours, attribution, intégrations',
  '2': 'Argent et versements',
  '3': 'Clôture et obligations annuelles',
};
const libelle = (p: number): string => LIBELLE_PHASE[String(p)] ?? `Phase ${p}`;
const armee = (g: Gate): boolean => typeof g.preuveRouge === 'string' && g.preuveRouge.trim() !== '';

// ── rendu ────────────────────────────────────────────────────────────────────

/** Dans une cellule, une barre verticale s'échappe — les accents graves ne protègent pas le séparateur. */
const cellule = (v: string): string => v.replace(/\|/g, '\\|');
const enCode = (v: string): string => `\`${cellule(v)}\``;
const aliasCellule = (g: Gate): string =>
  (g.alias ?? []).length === 0 ? '—' : (g.alias ?? []).map(enCode).join(', ');

function rendre(gates: Gate[]): string {
  const phases = [...new Set(gates.map((g) => g.phase))].sort((a, b) => a - b);
  const l: string[] = [];

  l.push('# Gates — Axion Partners');
  l.push('');
  l.push('> ⚠️ **Ce fichier est une VUE. La source est `docs/gates.json`.**');
  l.push('> Livré par **QA-T00** (REQ-QA-013, règle maison RM-02), régénéré par');
  l.push('> `pnpm gov:gates-derivees --render` — tableaux ET totaux comptés à la génération, jamais tapés.');
  l.push('> Une correction écrite ici à la main disparaît au rendu suivant : elle se fait dans le registre');
  l.push('> pour les données, dans `scripts/gates/gates-derivees.ts` pour la prose.');
  l.push('>');
  l.push('> `gov:gates-derivees` apparie les deux sens : une ligne sans entrée de même `id` → rouge, une');
  l.push('> entrée sans ligne → rouge. La colonne « Alias » cite les autres noms sous lesquels la même gate');
  l.push('> est appelée ; un alias ne crée **jamais** une seconde ligne.');
  l.push('>');
  l.push('> La garde qui compte l\'armement : `pnpm gates:prouvees --phase <n>`');
  l.push('> (`scripts/gates/gates-prouvees.ts`). Elle refuse toute gate de phase au plus n qui n\'a pas un');
  l.push('> `id`, un `script` présent sur le disque **et lancé par un workflow**, une `fixtureRouge`, une');
  l.push('> `phase` entière et une `preuveRouge` qui référence un run.');
  l.push('');

  // §1 — les totaux
  l.push('## 1. Le compte par phase');
  l.push('');
  l.push('| Phase | Ce qu\'elle est | Gates | Prouvées | Restent à prouver |');
  l.push('| ----- | -------------- | ----: | -------: | ----------------: |');
  for (const p of phases) {
    const liste = gates.filter((g) => g.phase === p);
    const n = liste.filter(armee).length;
    l.push(`| ${p} | ${cellule(libelle(p))} | ${liste.length} | ${n} | ${liste.length - n} |`);
  }
  const prouvees = gates.filter(armee).length;
  l.push(`| **Total** | | **${gates.length}** | **${prouvees}** | **${gates.length - prouvees}** |`);
  l.push('');
  l.push("La phase d'une gate est celle **à la sortie de laquelle** elle doit exister, être bloquante et");
  l.push('avoir rougi. Une gate sans phase entière n\'entre dans le périmètre d\'aucune sortie :');
  l.push('`gates:prouvees` la refuse quel que soit `--phase`.');
  l.push('');

  // §2 — les gates armées
  l.push('## 2. Les gates armées');
  l.push('');
  l.push("Ce sont les seules dont on a la trace d'un échec provoqué. La colonne « Preuve rouge » est le");
  l.push('champ `preuveRouge` du registre, recopié verbatim par le rendu.');
  l.push('');
  for (const p of phases) {
    const liste = gates.filter((g) => g.phase === p && armee(g));
    if (liste.length === 0) continue;
    l.push(`### Phase ${p} — armées (${liste.length})`);
    l.push('');
    l.push('| Gate | Tâche | Script | Alias | Preuve rouge |');
    l.push('| ---- | ----- | ------ | ----- | ------------ |');
    for (const g of liste) {
      l.push(
        `| ${enCode(g.id)} | ${cellule(g.tache)} | ${enCode(g.script)} | ${aliasCellule(g)} | ` +
          `${cellule(String(g.preuveRouge))} |`
      );
    }
    l.push('');
  }

  // §3 — ce qui reste à prouver
  const reste = gates.filter((g) => !armee(g));
  l.push('## 3. Ce qui reste à prouver');
  l.push('');
  l.push(`Aucune de ces **${reste.length}** entrées ne porte de \`preuveRouge\` : personne ne les a vues rougir.`);
  l.push("Le périmètre d'un appel est celui de SA phase : `pnpm gates:prouvees --phase -1` ne juge que les");
  l.push('gates de phase -1, `--phase 0` y ajoute celles de phase 0, et ainsi de suite. Le compte des manques');
  l.push("n'est pas recopié ici : il se lit dans la sortie de la commande, famille par famille, et il change à");
  l.push('chaque script écrit — un nombre recopié serait faux le lendemain. Ce qui, en revanche, ne bouge pas :');
  l.push('les quatre familles du script — `script_manquant`, `script_introuvable`, `ancre_introuvable`,');
  l.push("`script_non_cable` — s'excluent l'une l'autre, et `preuve_rouge_absente` exclut");
  l.push('`preuve_rouge_non_referencee`. Sur le seul ARMEMENT, une gate ne peut donc être nommée que dans');
  l.push('trois familles : une du script, `fixture_rouge_vide`, et une de la preuve. Les familles');
  l.push("d'identité — `id_manquant`, `id_double` — s'y AJOUTENT : elles sont jugées sur tout le registre,");
  l.push('dans une passe séparée, et se cumulent avec les précédentes. Une même gate peut donc être nommée');
  l.push('dans quatre familles au plus. Ce paragraphe décrit le code ; aucune garde ne l’apparie — la');
  l.push('sortie de la commande, elle, fait foi.');
  l.push('');
  for (const p of phases) {
    const liste = gates.filter((g) => g.phase === p && !armee(g));
    if (liste.length === 0) continue;
    l.push(`### Phase ${p} — ${cellule(libelle(p).toLowerCase())} (${liste.length})`);
    l.push('');
    l.push('| Gate | Tâche | Script | Alias |');
    l.push('| ---- | ----- | ------ | ----- |');
    for (const g of liste) {
      l.push(`| ${enCode(g.id)} | ${cellule(g.tache)} | ${enCode(g.script)} | ${aliasCellule(g)} |`);
    }
    l.push('');
  }

  // §4 — comment on arme
  l.push('## 4. Comment on arme une gate');
  l.push('');
  l.push('Trois gestes, dans cet ordre, et le dernier ne se saute pas :');
  l.push('');
  l.push('1. **Écrire le script** au chemin exact que porte le registre, **et le câbler dans un workflow**.');
  l.push('   Un chemin qui ne résout pas est un manque (`script_introuvable`) ; un script que rien ne lance');
  l.push('   en est un autre (`script_non_cable`) ; `fichier#job` exige en plus que le job existe.');
  l.push('2. **Injecter la `fixtureRouge`** du registre et faire tourner la gate. Si elle reste verte, elle ne');
  l.push('   mesure pas sa cible : on corrige la gate, pas la fixture.');
  l.push('3. **Archiver le rouge** — message verbatim dans le bloc ROUGE/VERT de la PR (REQ-GOV-013), puis la');
  l.push('   référence dans le champ `preuveRouge` de `docs/gates.json` : l\'URL du run, ou');
  l.push('   `pnpm <garde>:prove — <ce qui a été vu rougir>`. Un « TODO » y est refusé. Enfin,');
  l.push('   `pnpm gov:gates-derivees --render` pour que cette vue suive.');
  l.push('');
  l.push('Une garde livrée avec un mode `--prove` cite ce mode comme preuve : c\'est le patron des gates du');
  l.push('§2, où chaque famille de contrôle a son témoin vu rougir et ses contre-témoins vus rester verts.');
  l.push('');

  // §5 — les limites
  l.push('## 5. Ce que cette vue ne dit pas');
  l.push('');
  l.push('- **Si une gate est verte aujourd\'hui.** Elle dit qu\'une gate est armée, pas qu\'elle passe : c\'est');
  l.push('  la CI qui le dit.');
  l.push('- **Si le check est bloquant.** `gates:prouvees` voit qu\'un workflow lance le script ; elle ne voit');
  l.push('  ni les checks requis de la branche, ni un `continue-on-error` qui neutraliserait le job. C\'est');
  l.push('  `G-SEC-CI-BLOQUANTE` (QA-T01) qui refuse le second, et `tout-check-est-cable` (GOV-012) qui tient');
  l.push('  le premier.');
  l.push('- **Si la `fixtureRouge` rougit ENCORE.** Le registre décrit « une fixtureRouge qui rougit encore,');
  l.push('  rejouée en nightly par `prove.sh` ». Cette vue et `gates:prouvees` vérifient qu\'une fixture est');
  l.push('  **nommée**, jamais qu\'elle rougit toujours : une gate dont la cible a dérivé reste ici « armée ».');
  l.push('  Le rejeu — injecter la fixture, attendre un rouge, en nightly — n\'est PAS livré par QA-T00. Il est');
  l.push('  nommé dans l\'en-tête de `.github/workflows/nightly.yml`, avec les huit autres contrôles que le');
  l.push('  registre attribue à `gate-nightly` et qui n\'existent pas encore : c\'est là qu\'il a une adresse,');
  l.push('  au lieu de disparaître entre le titre de la tâche et le livrable.');
  l.push('- **La prose de ce fichier.** Les tableaux sont appariés au registre ; les paragraphes, non. Ils');
  l.push('  vivent dans `scripts/gates/gates-derivees.ts` et se corrigent là.');
  l.push('');

  return l.join('\n');
}

// ── lecture de la vue ────────────────────────────────────────────────────────

type Ligne = { id: string; tache: string; script: string; alias: string[]; preuve: string | null; phase: number | null; section: string };

/** Découpe une ligne de tableau markdown en cellules, en respectant les barres échappées `\|`. */
function cellules(ligne: string): string[] {
  const t = ligne.trim();
  if (!t.startsWith('|')) return [];
  const out: string[] = [];
  let courant = '';
  for (let i = 1; i < t.length; i++) {
    const c = t[i]!;
    if (c === '\\' && t[i + 1] === '|') {
      courant += '|';
      i++;
      continue;
    }
    if (c === '|') {
      out.push(courant.trim());
      courant = '';
      continue;
    }
    courant += c;
  }
  if (courant.trim() !== '') out.push(courant.trim());
  return out;
}

const estSeparateur = (ligne: string): boolean => /^\|[\s:|-]+\|\s*$/.test(ligne.trim());
const sansCode = (v: string): string => v.replace(/`/g, '').trim();
const listeAlias = (v: string): string[] =>
  v.trim() === '—' || v.trim() === '' ? [] : v.split(',').map(sansCode).filter((x) => x !== '');

type Totaux = { cle: string; gates: number; prouvees: number; reste: number };

function lireVue(vue: string): { lignes: Ligne[]; totaux: Totaux[]; comptes: Map<string, number>; fautes: Faute[] } {
  const fautes: Faute[] = [];
  const lignes: Ligne[] = [];
  const totaux: Totaux[] = [];
  const comptes = new Map<string, number>();
  const brutes = vue.split('\n');

  let phase: number | null = null;
  let section = '(avant tout titre)';
  let entetes: string[] = [];

  for (const [i, brute] of brutes.entries()) {
    if (brute.startsWith('#')) {
      section = brute.replace(/^#+\s*/, '').trim();
      const m = /phase\s+(-?\d+)/i.exec(section);
      phase = m === null ? null : Number(m[1]);
      const c = /\((\d+)\)\s*$/.exec(section);
      if (c !== null) comptes.set(section, Number(c[1]));
      entetes = [];
      continue;
    }
    const cel = cellules(brute);
    if (cel.length === 0) continue;
    if (estSeparateur(brute)) continue;
    if (estSeparateur(brutes[i + 1] ?? '')) {
      entetes = cel;
      continue;
    }

    // Le tableau des totaux : première cellule = une phase ou « Total », jamais un id entre accents graves.
    if (entetes[0] === 'Phase' && entetes.includes('Gates')) {
      const cle = sansCode(cel[0] ?? '').replace(/\*/g, '').trim();
      const n = (j: number): number => Number(sansCode(cel[j] ?? '').replace(/\*/g, '').trim());
      totaux.push({
        cle,
        gates: n(entetes.indexOf('Gates')),
        prouvees: n(entetes.indexOf('Prouvées')),
        reste: n(entetes.indexOf('Restent à prouver')),
      });
      continue;
    }

    if (!/^`[^`]+`$/.test(cel[0] ?? '')) continue; // ni une ligne de gate, ni un total : on passe

    const manquantes = ['Gate', 'Tâche', 'Script', 'Alias'].filter((c) => !entetes.includes(c));
    if (manquantes.length > 0) {
      fautes.push({
        famille: 'entete_incomplete',
        message:
          `« ${section} » : un tableau de gates sans colonne ${manquantes.join(', ')}. ` +
          `Les colonnes sont lues par leur nom — sans elles, la ligne n'est comparable à rien.`,
      });
      continue;
    }
    const at = (nom: string): string => cel[entetes.indexOf(nom)] ?? '';
    const iPreuve = entetes.findIndex((e) => e.startsWith('Preuve'));
    lignes.push({
      id: sansCode(at('Gate')),
      tache: at('Tâche'),
      script: sansCode(at('Script')),
      alias: listeAlias(at('Alias')),
      preuve: iPreuve === -1 ? null : (cel[iPreuve] ?? '').trim(),
      phase,
      section,
    });
    comptes.set(`§${section}`, (comptes.get(`§${section}`) ?? 0) + 1);
  }

  return { lignes, totaux, comptes, fautes };
}

// ── le contrôle ──────────────────────────────────────────────────────────────

function controler(gates: Gate[], vue: string): Faute[] {
  const lu = lireVue(vue);
  const fautes: Faute[] = [...lu.fautes];
  const ajouter = (famille: string, message: string): void => void fautes.push({ famille, message });

  const parId = new Map<string, Gate>();
  for (const g of gates) parId.set(g.id, g);
  const vues = new Map<string, Ligne>();

  for (const ligne of lu.lignes) {
    if (vues.has(ligne.id)) {
      ajouter('id_double_dans_la_vue', `« ${ligne.id} » a deux lignes dans la vue ; le registre n'en porte qu'une.`);
      continue;
    }
    vues.set(ligne.id, ligne);

    const g = parId.get(ligne.id);
    if (g === undefined) {
      ajouter(
        'ligne_sans_entree',
        `« ${ligne.id} » est listée dans « ${ligne.section} » et n'a aucune entrée dans ${CHEMIN_REGISTRE}.`
      );
      continue;
    }
    if (ligne.phase === null) {
      ajouter(
        'ligne_hors_phase',
        `« ${ligne.id} » est sous « ${ligne.section} », dont le titre ne nomme aucune phase : ` +
          `la ligne échappe alors à toute comparaison de phase.`
      );
    } else if (ligne.phase !== g.phase) {
      ajouter('phase_divergente', `« ${ligne.id} » est rangée en phase ${ligne.phase} ; le registre dit ${g.phase}.`);
    }
    if (ligne.tache !== g.tache) {
      ajouter('tache_divergente', `« ${ligne.id} » est attribuée à ${ligne.tache} ; le registre dit ${g.tache}.`);
    }
    if (ligne.script !== g.script) {
      ajouter('script_divergent', `« ${ligne.id} » cite ${ligne.script} ; le registre dit ${g.script}.`);
    }
    const attendus = [...(g.alias ?? [])].sort().join(', ');
    if (ligne.alias.slice().sort().join(', ') !== attendus) {
      ajouter(
        'alias_divergent',
        `« ${ligne.id} » : la vue porte [${ligne.alias.join(', ')}], le registre [${g.alias?.join(', ') ?? ''}].`
      );
    }
    if (armee(g) && ligne.preuve === null) {
      ajouter(
        'preuve_divergente',
        `« ${ligne.id} » porte une preuveRouge au registre mais figure dans une section sans colonne « Preuve ».`
      );
    } else if (!armee(g) && ligne.preuve !== null) {
      ajouter(
        'preuve_divergente',
        `« ${ligne.id} » est listée parmi les gates armées alors que sa preuveRouge est vide.`
      );
    } else if (ligne.preuve !== null && ligne.preuve !== String(g.preuveRouge).replace(/\|/g, '|')) {
      ajouter('preuve_divergente', `« ${ligne.id} » : la preuve affichée n'est pas celle du registre.`);
    }
  }

  for (const g of gates) {
    if (!vues.has(g.id)) {
      ajouter(
        'entree_sans_ligne',
        `« ${g.id} » est au registre (phase ${g.phase}, ${g.tache}) et n'a aucune ligne dans ${CHEMIN_VUE}.`
      );
    }
  }

  for (const g of gates) {
    for (const a of g.alias ?? []) {
      if (vues.has(a)) {
        ajouter(
          'alias_est_une_ligne',
          `« ${a} » est un alias de « ${g.id} » et porte pourtant sa propre ligne : un alias ne crée jamais une seconde entrée.`
        );
      }
    }
  }

  // les comptes écrits entre parenthèses dans les titres
  for (const [titre, annonce] of lu.comptes) {
    if (titre.startsWith('§')) continue;
    const reel = lu.comptes.get(`§${titre}`) ?? 0;
    if (reel !== annonce) {
      ajouter(
        'compte_de_section_faux',
        `« ${titre} » annonce ${annonce} gate(s) et en liste ${reel}.`
      );
    }
  }

  // le tableau des totaux
  const attendu = new Map<string, Totaux>();
  for (const p of [...new Set(gates.map((g) => g.phase))]) {
    const liste = gates.filter((g) => g.phase === p);
    const n = liste.filter(armee).length;
    attendu.set(String(p), { cle: String(p), gates: liste.length, prouvees: n, reste: liste.length - n });
  }
  const tousArmes = gates.filter(armee).length;
  attendu.set('Total', { cle: 'Total', gates: gates.length, prouvees: tousArmes, reste: gates.length - tousArmes });
  for (const t of lu.totaux) {
    const a = attendu.get(t.cle);
    if (a === undefined) {
      ajouter('total_faux', `Le tableau des totaux porte une ligne « ${t.cle} » que le registre ne connaît pas.`);
      continue;
    }
    if (t.gates !== a.gates || t.prouvees !== a.prouvees || t.reste !== a.reste) {
      ajouter(
        'total_faux',
        `Ligne « ${t.cle} » : la vue dit ${t.gates}/${t.prouvees}/${t.reste}, le registre ${a.gates}/${a.prouvees}/${a.reste}.`
      );
    }
  }
  for (const cle of attendu.keys()) {
    if (!lu.totaux.some((t) => t.cle === cle)) {
      ajouter('total_faux', `Le tableau des totaux ne porte aucune ligne « ${cle} ».`);
    }
  }

  return fautes;
}

// ── mode --prove ─────────────────────────────────────────────────────────────
if (process.argv.includes('--prove')) {
  /**
   * Fixture de preuve. La vue de base est RENDUE depuis la fixture : une vue tapée à la main
   * prouverait le rendu autant que le contrôle, et divergerait au premier changement de format.
   */
  const REGISTRE_SAIN: Gate[] = [
    {
      id: 'exemple:armee',
      phase: -1,
      script: 'scripts/gates/exemple-armee.ts',
      tache: 'QA-T00',
      fixtureRouge: 'retirer le champ que la garde exige',
      preuveRouge: 'pnpm exemple:armee:prove — deux familles vues rougir',
      alias: ['exemple:autre-nom'],
    },
    {
      id: 'exemple:a-prouver',
      phase: -1,
      script: 'scripts/gates/exemple-a-prouver.ts',
      tache: 'GOV-000',
      fixtureRouge: 'fausser le total attendu',
      preuveRouge: null,
    },
    {
      id: 'exemple:phase-zero',
      phase: 0,
      script: 'tests/unit/exemple/phase-zero.spec.ts',
      tache: 'QA-T01',
      fixtureRouge: 'mettre le job en échec',
      preuveRouge: null,
    },
  ];

  const copie = (): Gate[] => JSON.parse(JSON.stringify(REGISTRE_SAIN)) as Gate[];
  const VUE_SAINE = rendre(REGISTRE_SAIN);

  const base = controler(copie(), VUE_SAINE);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'une fixture DÉJÀ fautive (${base.length}) — corrige-la d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  /** Remplace une occurrence et vérifie qu'elle existait : un `replace` muet fabriquerait un faux témoin. */
  const remplacer = (texte: string, avant: string, apres: string): string => {
    if (!texte.includes(avant)) {
      console.error(`❌ La preuve ne trouve pas « ${avant} » dans la vue rendue : le témoin ne mute rien.`);
      process.exit(1);
    }
    return texte.replace(avant, apres);
  };

  const TEMOINS: { famille: string; quoi: string; defaut: () => [Gate[], string] }[] = [
    {
      famille: 'entete_incomplete',
      quoi: 'un tableau de gates dont la colonne « Alias » a été retirée',
      defaut: () => [copie(), remplacer(VUE_SAINE, '| Gate | Tâche | Script | Alias |', '| Gate | Tâche | Script |')],
    },
    {
      famille: 'ligne_hors_phase',
      quoi: 'un titre de section qui ne nomme plus sa phase',
      defaut: () => [copie(), remplacer(VUE_SAINE, '### Phase 0 —', '### Fondations —')],
    },
    {
      famille: 'id_double_dans_la_vue',
      quoi: 'la même gate listée deux fois',
      defaut: () => {
        const ligne = VUE_SAINE.split('\n').find((l) => l.startsWith('| `exemple:a-prouver`'))!;
        return [copie(), remplacer(VUE_SAINE, ligne, `${ligne}\n${ligne}`)];
      },
    },
    {
      famille: 'ligne_sans_entree',
      quoi: 'une ligne ajoutée à la vue sans entrée au registre',
      defaut: () => {
        const ligne = VUE_SAINE.split('\n').find((l) => l.startsWith('| `exemple:a-prouver`'))!;
        return [copie(), remplacer(VUE_SAINE, ligne, `${ligne}\n| \`exemple:inventee\` | GOV-000 | \`scripts/gates/inventee.ts\` | — |`)];
      },
    },
    {
      famille: 'entree_sans_ligne',
      quoi: 'une ligne retirée de la vue alors que le registre la porte',
      defaut: () => {
        const ligne = VUE_SAINE.split('\n').find((l) => l.startsWith('| `exemple:a-prouver`'))!;
        return [copie(), remplacer(VUE_SAINE, `${ligne}\n`, '')];
      },
    },
    {
      famille: 'phase_divergente',
      quoi: 'une gate rangée sous la mauvaise phase',
      defaut: () => { const r = copie(); r[1]!.phase = 1; return [r, VUE_SAINE]; },
    },
    {
      famille: 'tache_divergente',
      quoi: 'une tâche qui n’est pas celle du registre',
      defaut: () => [copie(), remplacer(VUE_SAINE, '| GOV-000 | `scripts/gates/exemple-a-prouver.ts`', '| GOV-999 | `scripts/gates/exemple-a-prouver.ts`')],
    },
    {
      famille: 'script_divergent',
      quoi: 'un chemin de script retouché dans la vue',
      defaut: () => [copie(), remplacer(VUE_SAINE, '`scripts/gates/exemple-a-prouver.ts`', '`scripts/gates/autre-chemin.ts`')],
    },
    {
      famille: 'preuve_divergente',
      quoi: 'une preuve rouge affichée qui n’est pas celle du registre',
      defaut: () => [copie(), remplacer(VUE_SAINE, 'pnpm exemple:armee:prove — deux familles vues rougir', 'run rouge de la semaine derniere')],
    },
    {
      famille: 'alias_divergent',
      quoi: 'un alias cité dans la vue et absent du registre',
      defaut: () => [copie(), remplacer(VUE_SAINE, '| `exemple:autre-nom` |', '| `exemple:autre-nom`, `exemple:nom-invente` |')],
    },
    {
      famille: 'alias_divergent',
      quoi: 'un alias porté par le registre et absent de la vue',
      defaut: () => [copie(), remplacer(VUE_SAINE, '| `exemple:autre-nom` |', '| — |')],
    },
    {
      famille: 'alias_est_une_ligne',
      quoi: 'un alias promu en ligne à part entière',
      defaut: () => {
        const ligne = VUE_SAINE.split('\n').find((l) => l.startsWith('| `exemple:a-prouver`'))!;
        const r = copie();
        r.push({ id: 'exemple:autre-nom', phase: -1, script: 'scripts/gates/exemple-armee.ts', tache: 'QA-T00', preuveRouge: null });
        return [r, remplacer(VUE_SAINE, ligne, `${ligne}\n| \`exemple:autre-nom\` | QA-T00 | \`scripts/gates/exemple-armee.ts\` | — |`)];
      },
    },
    {
      famille: 'compte_de_section_faux',
      quoi: 'un compte de section qui ne compte plus ses lignes',
      defaut: () => [copie(), remplacer(VUE_SAINE, '— armées (1)', '— armées (2)')],
    },
    {
      famille: 'total_faux',
      quoi: 'un total tapé à la main qui a cessé de suivre le registre',
      defaut: () => [copie(), remplacer(VUE_SAINE, '| **Total** | | **3** |', '| **Total** | | **4** |')],
    },
  ];

  const CONTRE_TEMOINS: { quoi: string; cas: () => [Gate[], string] }[] = [
    { quoi: 'la vue rendue depuis la fixture', cas: () => [copie(), VUE_SAINE] },
    {
      quoi: 'un paragraphe de prose réécrit : la vue n’est appariée que sur ses tableaux',
      cas: () => [copie(), `${VUE_SAINE}\n\nUne phrase ajoutée à la main, qui ne dit rien de faux.\n`],
    },
    {
      quoi: 'les alias listés dans un autre ordre : c’est un ensemble, pas une suite',
      cas: () => {
        const r = copie();
        r[0]!.alias = ['exemple:autre-nom', 'exemple:un-troisieme'];
        return [r, remplacer(VUE_SAINE, '| `exemple:autre-nom` |', '| `exemple:un-troisieme`, `exemple:autre-nom` |')];
      },
    },
    {
      quoi: 'un titre de niveau supérieur qui parle de phase sans en nommer une',
      cas: () => [copie(), remplacer(VUE_SAINE, '## 1. Le compte par phase', '## 1. Le compte par phase (toutes phases)')],
    },
  ];

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const [g, v] = t.defaut();
    const f = controler(g, v);
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin « ${t.quoi} » n'a PAS fait rougir la famille « ${t.famille} » ` +
          `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      f.slice(0, 3).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
    prouvees.add(t.famille);
  }

  for (const c of CONTRE_TEMOINS) {
    const [g, v] = c.cas();
    const f = controler(g, v);
    if (f.length > 0) {
      console.error(`❌ Faux positif : « ${c.quoi} » a rougi. La garde est trop large.`);
      f.slice(0, 3).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
  }

  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
      `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
  );
  TEMOINS.forEach((t) => console.log(`   • ${t.famille} — ${t.quoi}`));
  process.exit(0);
}

// ── chargement ───────────────────────────────────────────────────────────────
if (!existsSync(CHEMIN_REGISTRE)) {
  console.error(`❌ gov:gates-derivees — ${CHEMIN_REGISTRE} est introuvable : le registre des gates est la source.`);
  process.exit(1);
}
const doc = JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { gates?: unknown };
if (!Array.isArray(doc.gates)) {
  console.error(`❌ gov:gates-derivees — ${CHEMIN_REGISTRE} ne porte pas de tableau « gates ».`);
  process.exit(1);
}
const gatesDuRegistre = doc.gates as Gate[];

// ── mode --render ────────────────────────────────────────────────────────────
if (process.argv.includes('--render')) {
  const rendu = rendre(gatesDuRegistre);
  const fautes = controler(gatesDuRegistre, rendu);
  if (fautes.length > 0) {
    console.error(`❌ Le rendu ne passe pas son propre contrôle (${fautes.length}) — la garde et le rendu ont divergé :`);
    fautes.slice(0, 8).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }
  writeFileSync(CHEMIN_VUE, `${rendu}\n`);
  const armees = gatesDuRegistre.filter(armee).length;
  console.log(
    `✅ ${CHEMIN_VUE} rendu depuis ${CHEMIN_REGISTRE} — ${gatesDuRegistre.length} gates, ${armees} armée(s), ` +
      `${gatesDuRegistre.length - armees} à prouver.`
  );
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
if (!existsSync(CHEMIN_VUE)) {
  console.error(`❌ gov:gates-derivees — ${CHEMIN_VUE} est introuvable. Lance \`pnpm gov:gates-derivees --render\`.`);
  process.exit(1);
}
const fautesReelles = controler(gatesDuRegistre, readFileSync(CHEMIN_VUE, 'utf8'));
if (fautesReelles.length === 0) {
  const armees = gatesDuRegistre.filter(armee).length;
  console.log(
    `✅ gov:gates-derivees — ${CHEMIN_VUE} est bien la vue de ${CHEMIN_REGISTRE} : ` +
      `${gatesDuRegistre.length} gates appariées dans les deux sens, ${armees} armée(s).`
  );
  process.exit(0);
}
const parFamille = new Map<string, Faute[]>();
for (const f of fautesReelles) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:gates-derivees — ${fautesReelles.length} divergence(s) entre ${CHEMIN_VUE} et ${CHEMIN_REGISTRE} :\n`);
for (const famille of FAMILLES) {
  const liste = parFamille.get(famille);
  if (liste === undefined) continue;
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
console.error(`\n   La vue se régénère : \`pnpm gov:gates-derivees --render\`. La source ne se corrige jamais depuis la vue.`);
process.exit(1);
