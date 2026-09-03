/**
 * gov-preseance.ts — la garde de la table de préséance (GOV-002, REQ-GOV-002 / REQ-GOV-030).
 *
 * USAGE : pnpm gov:preseance           (échoue si la table ou l'expression arbitrée est en défaut)
 *         pnpm gov:preseance --prove   (injecte un défaut PAR FAMILLE et vérifie que chacun rougit,
 *                                       puis rejoue des contre-témoins qui doivent rester verts)
 *
 * CE QU'ELLE TIENT, et que rien d'autre ne tenait :
 *
 *   — REQ-GOV-030, l'élément central : l'expression arbitrée en §3.7 de `docs/PRESEANCE.md` ne peut
 *     apparaître sous `docs/`, `prisma/` ou `src/` sans que `REQ-DM-034` figure sur la même ligne ou
 *     sur la suivante. Une règle citée sans son porteur se recode de mémoire, et de travers ;
 *   — REQ-GOV-002 : les sept clés connues ont chacune leur sous-section en §3, et chaque sous-section
 *     nomme au moins une exigence — « désignant la version qui prévaut ET la REQ qui la porte » ;
 *   — l'acceptation de GOV-002 : la §2 arbitre sept couples de documents au moins ;
 *   — tout identifiant `REQ-…` cité ici existe au registre : un arbitrage qui renvoie à une exigence
 *     absente n'arbitre rien ;
 *   — RM-02 appliqué au document lui-même : une garde que `docs/gates.json` déclare SANS `preuveRouge`
 *     ne peut pas être invoquée ici comme si elle rougissait. Le premier jet invoquait `gov:check`
 *     comme preuve d'un contrôle de vocabulaire que ce script — absent du dépôt — ne fait pas. La
 *     citation se cherche ENTRE ACCENTS GRAVES : le registre porte des identifiants qui sont des mots
 *     français ordinaires (`inertie`, `mutation`, `frontiere`, `sante`), et les chercher en prose fait
 *     rougir la garde sur une phrase qui ne cite aucune gate — un contre-témoin le tient ;
 *   — la forme des tableaux : une barre verticale non échappée dans une cellule casse la colonne, et
 *     les accents graves ne la protègent pas. Un tableau cassé rend l'arbitrage illisible.
 *
 * DEUX EXEMPTIONS, POUR LA PREMIÈRE FAMILLE SEULEMENT. `docs/requirements.json` et sa vue
 * `docs/REQUIREMENTS.md` sont l'endroit où la règle est DÉFINIE : REQ-GOV-002 y énumère les sept clés,
 * REQ-DM-034 y énonce l'exception. L'ancre y est portée par la structure du document — la clé `id` de
 * l'entrée — et non par le voisinage de ligne d'un JSON indenté. C'est la même exemption, pour la même
 * raison, que `gov-identifiants.ts` accorde au registre.
 *
 * INVARIANT : comme `gov-publication.ts` et `gov-identifiants.ts`, elle inspecte les fichiers SUIVIS
 * PAR GIT, pas le disque. Un brouillon non suivi ne la fait pas rougir.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const CHEMIN_PRESEANCE = 'docs/PRESEANCE.md';
const CHEMIN_REGISTRE = 'docs/requirements.json';
const CHEMIN_GARDES = 'docs/gates.json';

/** Les trois racines nommées par REQ-GOV-030. */
const RACINES = ['docs/', 'prisma/', 'src/'];

/** L'expression arbitrée, et l'exigence qui la porte. */
const EXPRESSION = /z[ée]ro\s+arbitrage/i;
const ANCRE = /REQ-DM-034/;

/** Le registre définit la règle : il a le droit de la nommer. Voir l'en-tête. */
const EXEMPTS_EXPRESSION = [/^docs\/requirements\.json$/, /^docs\/REQUIREMENTS\.md$/];

/** Les sept clés que REQ-GOV-002 énumère nommément. */
const CLES = [
  'quota',
  'collision',
  'cycle de vie',
  'bareme',
  "naissance de l'attribution",
  'peremption',
  'zero arbitrage',
];

/** L'acceptation de GOV-002 : sept couples au moins arbitrés en §2. */
const MIN_COUPLES = 7;

/** Une garde sans preuve rouge se cite en le DISANT. Le marqueur est cette locution. */
const MARQUEUR_SANS_PREUVE = /sans preuve rouge/i;

type Faute = { famille: string; message: string };
type Fichier = { chemin: string; contenu: string };
type Source = {
  preseance: string;
  exigences: Set<string>;
  /** id de garde → `preuveRouge` (null quand la garde n'a jamais été vue rougir). */
  gardes: Map<string, string | null>;
  scannes: Fichier[];
};

const FAMILLES = [
  'expression_sans_ancre',
  'couple_absent',
  'couple_sans_exigence',
  'table_trop_courte',
  'exigence_inconnue',
  'garde_non_prouvee_invoquee',
  'colonnes_incoherentes',
];

/** Accents et apostrophes typographiques ramenés à une forme unique, pour comparer des titres. */
function aplatir(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toLowerCase();
}

/** Le nombre de cellules d'une ligne de tableau, barres échappées non comptées. */
function cellules(ligne: string): number {
  const l = ligne.trim().replace(/^\|/, '').replace(/\|$/, '');
  return l.split(/(?<!\\)\|/).length;
}

function estSeparateur(ligne: string): boolean {
  return /^\|[\s:|-]+\|$/.test(ligne.trim());
}

/** Découpe le document en sections de premier niveau : `## n. …` → contenu. */
function sections(md: string): Map<string, string> {
  const out = new Map<string, string>();
  let titre = '(préambule)';
  let bloc: string[] = [];
  for (const ligne of md.split('\n')) {
    if (ligne.startsWith('## ')) {
      out.set(titre, bloc.join('\n'));
      titre = ligne.slice(3).trim();
      bloc = [];
    } else {
      bloc.push(ligne);
    }
  }
  out.set(titre, bloc.join('\n'));
  return out;
}

function controler(s: Source): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  // ── 1. REQ-GOV-030 : l'expression ne se cite jamais sans son porteur ────────
  for (const f of s.scannes) {
    if (EXEMPTS_EXPRESSION.some((r) => r.test(f.chemin))) continue;
    const lignes = f.contenu.split('\n');
    lignes.forEach((ligne, i) => {
      if (!EXPRESSION.test(ligne)) return;
      if (ANCRE.test(ligne) || ANCRE.test(lignes[i + 1] ?? '')) return;
      ajouter(
        'expression_sans_ancre',
        `${f.chemin}:${i + 1} — l'expression arbitrée est écrite sans REQ-DM-034 sur la même ligne ` +
          `ni sur la suivante. L'exception unique est portée par cette exigence : cite-la, ou n'énonce ` +
          `pas la règle ici (REQ-GOV-030).`
      );
    });
  }

  // ── 2 et 3. REQ-GOV-002 : les sept clés, et l'exigence qui porte chacune ────
  const titresTroisiemeNiveau = s.preseance
    .split('\n')
    .map((l, i) => ({ ligne: l, no: i + 1 }))
    .filter((x) => x.ligne.startsWith('### '));

  for (const cle of CLES) {
    const trouve = titresTroisiemeNiveau.some((t) => aplatir(t.ligne).includes(aplatir(cle)));
    if (!trouve) {
      ajouter(
        'couple_absent',
        `Aucune sous-section de la §3 ne traite la clé « ${cle} », que REQ-GOV-002 énumère nommément.`
      );
    }
  }

  // chaque bloc `### …` de la §3 nomme au moins une exigence
  const troisieme = [...sections(s.preseance).entries()].find(([t]) => t.startsWith('3.'));
  if (!troisieme) {
    ajouter('couple_sans_exigence', `La §3 est introuvable dans ${CHEMIN_PRESEANCE}.`);
  } else {
    const blocs = troisieme[1].split(/^### /m).slice(1);
    for (const bloc of blocs) {
      const titre = bloc.split('\n')[0]!.trim();
      if (!/REQ-[A-Z]+-\d{3}/.test(bloc)) {
        ajouter(
          'couple_sans_exigence',
          `La sous-section « ${titre} » ne nomme aucune exigence : REQ-GOV-002 exige la version qui ` +
            `prévaut ET la REQ qui la porte.`
        );
      }
    }
  }

  // ── 4. acceptation de GOV-002 : sept couples au moins en §2 ─────────────────
  const deuxieme = [...sections(s.preseance).entries()].find(([t]) => t.startsWith('2.'));
  const lignesTable = (deuxieme?.[1] ?? '')
    .split('\n')
    .filter((l) => l.trim().startsWith('|') && !estSeparateur(l));
  const couples = Math.max(0, lignesTable.length - 1); // moins l'en-tête
  if (couples < MIN_COUPLES) {
    ajouter(
      'table_trop_courte',
      `La §2 arbitre ${couples} couple(s) de documents ; l'acceptation de GOV-002 en demande ` +
        `${MIN_COUPLES} au moins.`
    );
  }

  // ── 5. tout identifiant d'exigence cité ici existe au registre ──────────────
  for (const m of s.preseance.matchAll(/REQ-[A-Z]+-\d{3}/g)) {
    if (!s.exigences.has(m[0])) {
      ajouter(
        'exigence_inconnue',
        `${m[0]} est cité dans ${CHEMIN_PRESEANCE} et n'est pas au registre ${CHEMIN_REGISTRE}. ` +
          `Un arbitrage qui renvoie à une exigence absente n'arbitre rien.`
      );
    }
  }

  // ── 6. RM-02 : une garde sans preuve rouge ne s'invoque pas comme une preuve ─
  //
  // ON NE REGARDE QUE LES ACCENTS GRAVES. Une garde se cite comme un identifiant, entre accents
  // graves — c'est la forme de tout ce document. Le registre porte par ailleurs des identifiants
  // qui sont des mots français ordinaires (`inertie`, `mutation`, `frontiere`, `sante`) : les
  // chercher en prose ferait rougir la garde sur une phrase qui ne cite aucune gate.
  const lignesPreseance = s.preseance.split('\n');
  const codeSpans = (ligne: string) => [...ligne.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
  for (const [id, preuve] of s.gardes) {
    if (preuve) continue;
    const motif = new RegExp(
      `(?<![A-Za-z0-9:_-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9:_-])`
    );
    lignesPreseance.forEach((ligne, i) => {
      if (!codeSpans(ligne).some((span) => motif.test(span))) return;
      const suivante = lignesPreseance[i + 1] ?? '';
      if (MARQUEUR_SANS_PREUVE.test(ligne) || MARQUEUR_SANS_PREUVE.test(suivante)) return;
      ajouter(
        'garde_non_prouvee_invoquee',
        `${CHEMIN_PRESEANCE}:${i + 1} — « ${id} » est citée comme si elle gardait quelque chose, alors ` +
          `que ${CHEMIN_GARDES} lui donne preuveRouge: null. Dis-le sur place (« sans preuve rouge »), ` +
          `ou appuie l'arbitrage sur autre chose qu'une garde jamais vue rougir (RM-02).`
      );
    });
  }

  // ── 7. la forme des tableaux : une barre non échappée casse la colonne ──────
  {
    const lignes = s.preseance.split('\n');
    let dansUnBloc = false;
    let attendu: number | null = null;
    for (let i = 0; i < lignes.length; i++) {
      const ligne = lignes[i]!;
      if (ligne.trim().startsWith('```')) {
        dansUnBloc = !dansUnBloc;
        attendu = null;
        continue;
      }
      if (dansUnBloc) continue;
      if (!ligne.trim().startsWith('|')) {
        attendu = null;
        continue;
      }
      if (estSeparateur(ligne)) continue;
      if (attendu === null) {
        attendu = cellules(ligne);
        continue;
      }
      const n = cellules(ligne);
      if (n !== attendu) {
        ajouter(
          'colonnes_incoherentes',
          `${CHEMIN_PRESEANCE}:${i + 1} — ${n} colonne(s) là où l'en-tête en porte ${attendu}. ` +
            `Une barre verticale dans une cellule s'échappe (\\|), même entre accents graves : ` +
            `les accents graves ne protègent pas le séparateur de colonnes.`
        );
      }
    }
  }

  return fautes;
}

// ── lecture du dépôt ─────────────────────────────────────────────────────────

function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function lireSource(): Source {
  for (const f of [CHEMIN_PRESEANCE, CHEMIN_REGISTRE, CHEMIN_GARDES]) {
    if (!existsSync(f)) {
      console.error(`❌ gov:preseance — ${f} est introuvable.`);
      process.exit(1);
    }
  }
  const registre = JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { exigences: { id: string }[] };
  const registreGardes = JSON.parse(readFileSync(CHEMIN_GARDES, 'utf8')) as {
    gates: { id: string; preuveRouge: string | null }[];
  };

  const scannes: Fichier[] = [];
  for (const chemin of fichiersSuivis()) {
    if (!RACINES.some((r) => chemin.startsWith(r))) continue;
    if (!/\.(ts|tsx|js|jsx|md|json|yml|yaml|sql|prisma)$/.test(chemin)) continue;
    if (!existsSync(chemin)) continue;
    scannes.push({ chemin, contenu: readFileSync(chemin, 'utf8') });
  }

  return {
    preseance: readFileSync(CHEMIN_PRESEANCE, 'utf8'),
    exigences: new Set(registre.exigences.map((e) => e.id)),
    gardes: new Map(registreGardes.gates.map((g) => [g.id, g.preuveRouge])),
    scannes,
  };
}

// ── mode --prove ─────────────────────────────────────────────────────────────

if (process.argv.includes('--prove')) {
  const base = lireSource();
  const dejaFautif = controler(base);
  if (dejaFautif.length > 0) {
    console.error(`❌ La preuve part d'un dépôt DÉJÀ fautif (${dejaFautif.length}) — corrige d'abord :`);
    dejaFautif.slice(0, 8).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const copie = (): Source => ({
    preseance: base.preseance,
    exigences: new Set(base.exigences),
    gardes: new Map(base.gardes),
    scannes: base.scannes.map((f) => ({ ...f })),
  });

  /** L'identifiant d'une garde du registre qui n'a jamais été vue rougir. */
  const gardeSansPreuve = [...base.gardes.entries()].find(([, p]) => p === null)?.[0] ?? 'gov:check';

  const TEMOINS: { famille: string; defaut: () => Source }[] = [
    {
      famille: 'expression_sans_ancre',
      defaut: () => {
        const s = copie();
        s.scannes.push({
          chemin: 'docs/TEMOIN.md',
          contenu: 'Le principe de zéro arbitrage vaut pour toute résolution.\nligne suivante muette.\n',
        });
        return s;
      },
    },
    {
      famille: 'couple_absent',
      defaut: () => {
        const s = copie();
        s.preseance = s.preseance.replace(/^### 3\.6 .*$/m, '### 3.6 `autre chose`');
        return s;
      },
    },
    {
      famille: 'couple_sans_exigence',
      defaut: () => {
        const s = copie();
        s.preseance = s.preseance.replace(/REQ-([A-Z]+)-(\d{3})/g, 'exigence $1 $2');
        return s;
      },
    },
    {
      famille: 'table_trop_courte',
      defaut: () => {
        const s = copie();
        const lignes = s.preseance.split('\n');
        let vus = 0;
        s.preseance = lignes
          .filter((l) => {
            if (/^\|\s*\d+\s*\|/.test(l)) {
              vus++;
              return vus <= 3;
            }
            return true;
          })
          .join('\n');
        return s;
      },
    },
    {
      famille: 'exigence_inconnue',
      defaut: () => {
        const s = copie();
        s.preseance = s.preseance.replace('REQ-DM-034', 'REQ-ZZZ-999');
        return s;
      },
    },
    {
      famille: 'garde_non_prouvee_invoquee',
      defaut: () => {
        const s = copie();
        s.preseance += `\n\nLa garde \`${gardeSansPreuve}\` rougit sur toute violation.\n`;
        return s;
      },
    },
    {
      famille: 'colonnes_incoherentes',
      defaut: () => {
        const s = copie();
        s.preseance = s.preseance.replace(
          /^\| 12 \| /m,
          '| 12 | une cellule qui porte une barre | non échappée | '
        );
        return s;
      },
    },
  ];

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut());
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      process.exit(1);
    }
    prouvees.add(t.famille);
  }

  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  // Contre-témoins : ce que la garde ne doit PAS faire rougir. Une garde qui rougit sur tout ne
  // dit rien de plus qu'une garde qui ne rougit jamais.
  const gardePreuve = [...base.gardes.entries()].find(([, p]) => p !== null)?.[0] ?? 'gov:publication';
  /** Un identifiant de garde sans preuve qui est aussi un mot français ordinaire. */
  const motFrancais =
    [...base.gardes.entries()].find(([id, p]) => p === null && /^[a-z]{5,}$/.test(id))?.[0] ??
    'inertie';
  const CONTRE_TEMOINS: { quoi: string; source: () => Source }[] = [
    {
      quoi: "l'expression suivie de son porteur SUR LA MÊME LIGNE",
      source: () => {
        const s = copie();
        s.scannes.push({
          chemin: 'docs/CT-A.md',
          contenu: 'La règle « zéro arbitrage » est portée par REQ-DM-034.\n',
        });
        return s;
      },
    },
    {
      quoi: "l'expression suivie de son porteur SUR LA LIGNE SUIVANTE",
      source: () => {
        const s = copie();
        s.scannes.push({
          chemin: 'docs/CT-B.md',
          contenu: 'Aucun encaissement ne s\'arbitre au jugé — zéro arbitrage,\nà l\'exception de REQ-DM-034.\n',
        });
        return s;
      },
    },
    {
      // Le registre est l'endroit où la règle est DÉFINIE : REQ-GOV-002 y énumère les sept clés
      // sans nommer REQ-DM-034, et REQ-DM-034 y porte l'ancre dans sa clé `id`, à plusieurs
      // lignes de son texte. Sans cette exemption, la garde rougirait sur sa propre source.
      quoi: "l'expression dans le registre, que l'en-tête exempte nommément",
      source: () => {
        const s = copie();
        s.scannes.push({
          chemin: 'docs/requirements.json',
          contenu: '      "texte": "les sept couples : quota, collision, zéro arbitrage",\n',
        });
        return s;
      },
    },
    {
      quoi: 'une garde du registre qui PORTE une preuve rouge, citée sans marqueur',
      source: () => {
        const s = copie();
        s.preseance += `\n\nLa garde \`${gardePreuve}\` rougit sur toute violation.\n`;
        return s;
      },
    },
    {
      quoi: 'une garde SANS preuve rouge, citée en le disant',
      source: () => {
        const s = copie();
        s.preseance += `\n\nLa garde \`${gardeSansPreuve}\` est déclarée sans preuve rouge à ce jour.\n`;
        return s;
      },
    },
    {
      // Le registre des gardes porte des identifiants qui sont des mots français ordinaires
      // (`inertie`, `mutation`, `frontiere`, `sante`). Une garde qui les cherche en prose rougit
      // sur des phrases qui ne citent aucune gate — et une garde qui rougit sur tout ne dit rien.
      quoi: "un identifiant de garde qui est aussi un mot français, employé en prose",
      source: () => {
        const s = copie();
        s.preseance += `\n\nLe registre ne tranche rien par ${motFrancais} : il tranche par écrit.\n`;
        return s;
      },
    },
    {
      quoi: 'une cellule de tableau dont la barre verticale est échappée',
      source: () => {
        const s = copie();
        s.preseance = s.preseance.replace(/^\| 12 \| /m, '| 12 | `a \\| b` ');
        return s;
      },
    },
    {
      quoi: 'un gabarit de bandeau qui écrit REQ-<DOMAINE>-nnn au lieu d’un identifiant réel',
      source: () => {
        const s = copie();
        s.preseance += '\n\n> Section remplacée par REQ-<DOMAINE>-nnn.\n';
        return s;
      },
    },
  ];

  for (const ct of CONTRE_TEMOINS) {
    const f = controler(ct.source());
    if (f.length > 0) {
      console.error(
        `❌ Faux positif : ${ct.quoi} a fait rougir « ${f[0]!.famille} ».\n   ${f[0]!.message}`
      );
      process.exit(1);
    }
  }

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

const source = lireSource();
const fautes = controler(source);
if (fautes.length === 0) {
  const cles = CLES.length;
  console.log(
    `✅ gov:preseance — ${cles} clés arbitrées en §3, ${source.scannes.length} fichier(s) suivis ` +
      `relus sous docs/, prisma/ et src/ : l'expression arbitrée cite partout son porteur.`
  );
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:preseance — ${fautes.length} défaut(s) (REQ-GOV-002, REQ-GOV-030) :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
