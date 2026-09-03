/**
 * gov-adr.ts — la garde du dossier des ADR (GOV-009, REQ-GOV-008).
 *
 * USAGE : pnpm gov:adr                    (échoue si le dossier, l'index ou une référence est fautif)
 *         pnpm gov:adr --prove            (injecte un défaut PAR FAMILLE et vérifie que chacun rougit)
 *         pnpm gov:adr --strict-registre  (lève l'exemption des fichiers réservés — voir plus bas)
 *
 * CE QU'ELLE TIENT, et que rien d'autre ne tenait. REQ-GOV-008 est née d'une dérive mesurée : deux
 * numéros attribués deux fois, un index figé pendant huit ADR, et des références croisées entre
 * trois dépôts qui numérotent chacun de leur côté — `ADR-0003` nu ne désigne rien.
 *
 *   — UN SEUL dossier d'ADR : un second dossier (« archive », `docs/adrs/`) et la numérotation
 *     repart de zéro sans que personne ne le voie ;
 *   — des noms de fichiers en `nnnn-intitule.md`, des numéros UNIQUES et CONSÉCUTIFS depuis 0001,
 *     `0000-gabarit.md` excepté : c'est le moule, pas une décision ;
 *   — le TITRE de l'ADR porte le numéro du fichier, qualifié par son dépôt ;
 *   — le STATUT est le vocabulaire fermé de trois valeurs, en français (CONVENTIONS §1) ;
 *   — les six rubriques du gabarit sont présentes : une rubrique vide se voit, une rubrique absente
 *     ne se voit pas ;
 *   — un ADR `accepte` porte une ASSERTION (fichier + titre `it()`) ou la mention `hors-code`
 *     motivée (REQ-GOV-009) : une décision que rien ne peut voir mourir est une intention ;
 *   — `docs/adr/INDEX.md` est ÉGAL au listage du dossier — « index ≠ ls → rouge », mot pour mot le
 *     texte de REQ-GOV-008. Le rendu attendu est celui de `scripts/adr/index.ts`, IMPORTÉ et non
 *     recopié : deux rendus jumeaux finissent par diverger, et c'est alors l'index qu'on déclare
 *     faux au lieu du contrôle (RM-01) ;
 *   — toute référence `ADR-nnnn` est QUALIFIÉE par son dépôt (`partners/`, `axionia/`, `ops/`), et
 *     une référence `partners/ADR-nnnn` DÉSIGNE un ADR qui existe : c'est le cas d'échec déclaré au
 *     registre des gardes, « référencer ADR-9999 dans une PR ».
 *
 * CITER N'EST PAS SE SERVIR. Un identifiant entre guillemets — français « … » ou doubles " … " —
 * est une CITATION, pas une référence : les documents qui expliquent la règle doivent pouvoir
 * écrire son contre-exemple, et `docs/gates.json` doit pouvoir déclarer sa fixture rouge. Les
 * guillemets SIMPLES ne neutralisent rien ici : l'apostrophe française est partout, et neutraliser
 * ce qu'elle encadre rendrait la garde aveugle sur une phrase entière.
 *
 * L'EXEMPTION DES FICHIERS RÉSERVÉS, et pourquoi elle est visible. Trois références nues survivent
 * aujourd'hui dans des fichiers dont CONVENTIONS §8 réserve l'écriture à un autre rôle
 * (`docs/DECISIONS.md` au `gardien-spec`, `docs/tasks.json` et ses vues à l'orchestrateur). GOV-009
 * n'a pas le droit de les corriger, et une garde qui rougit sur ce que personne n'a le droit de
 * réparer finit désarmée. Elle les EXEMPTE donc du refus — mais les NOMME à chaque exécution, et
 * `--strict-registre` lève l'exemption pour qui veut les mesurer. Une dette dite n'est pas une
 * dette cachée.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { NOM_ADR, GABARIT, NOM_INDEX, RACINE_ADR, rendreIndex, entreeDepuisTexte, normaliser } from '../adr/index';

type Adr = { fichier: string; texte: string };
type Reference = { fichier: string; ligne: number; contenu: string };
type Corpus = {
  dossiersAdr: string[];
  fichiersDuDossier: string[];
  adrs: Adr[];
  index: string | null;
  references: Reference[];
};
type Faute = { famille: string; message: string };

const DEPOTS = ['partners', 'axionia', 'ops'];
const RUBRIQUES = ['Contexte', 'Décision', 'Conséquences', 'Alternatives écartées', 'Ce qui le vérifie', 'Reste à faire'];
const STATUTS = ['propose', 'accepte', 'remplace'];

/** Un renvoi d'ADR, qualifié ou non. Le dépôt est capturé quand il est écrit. */
const RENVOI = /(?<![A-Za-z0-9_\-/])(?:([a-z][a-z0-9-]*)\/)?ADR-(\d{4})(?![0-9])/g;

/** Les racines fouillées pour les références. `node_modules` n'en est pas. */
const RACINES = ['docs', 'scripts', 'tests', '.claude', '.github', 'README.md'];
const EXTENSIONS = /\.(ts|tsx|js|jsx|md|json|yml|yaml)$/;

/** Fichiers réservés à un autre écrivain (CONVENTIONS §8), et la garde elle-même. */
const RESERVES = [
  /^docs\/DECISIONS\.md$/,
  /^docs\/tasks\.json$/,
  /^docs\/TASKS\.md$/,
  /^docs\/requirements\.json$/,
  /^docs\/REQUIREMENTS(-ANNEXE-FUSIONS)?\.md$/,
  /^docs\/gates\.json$/,
  /^docs\/PLAN-STATE\.md$/,
  /^docs\/lots\//,
];
const SOI_MEME = /^scripts\/gates\/gov-adr\.ts$/;

const CITATIONS = [/«[^»]{0,200}»/g, /"[^"]{0,200}"/g];

function neutraliser(ligne: string): string {
  return CITATIONS.reduce((s, r) => s.replace(r, (m) => '·'.repeat(m.length)), ligne);
}

// ── les contrôles ────────────────────────────────────────────────────────────

function controler(c: Corpus): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  if (c.dossiersAdr.length > 1) {
    ajouter(
      'dossier_double',
      `Plus d'un dossier d'ADR : ${c.dossiersAdr.join(', ')}. Un second dossier fait repartir la ` +
        `numérotation de zéro sans que personne ne le voie — c'est la dérive qui a motivé REQ-GOV-008.`
    );
  }

  for (const f of c.fichiersDuDossier) {
    if (f === NOM_INDEX || NOM_ADR.test(f)) continue;
    ajouter('nom_non_conforme', `${f} ne suit pas la forme \`nnnn-intitule.md\` du gabarit.`);
  }

  const parNumero = new Map<string, string[]>();
  for (const a of c.adrs) {
    const numero = NOM_ADR.exec(a.fichier)?.[1] ?? '';
    parNumero.set(numero, [...(parNumero.get(numero) ?? []), a.fichier]);
  }
  for (const [numero, fichiers] of parNumero) {
    if (fichiers.length > 1) {
      ajouter('numero_double', `Le numéro ${numero} est attribué à ${fichiers.join(' et ')}.`);
    }
  }
  const numeros = [...parNumero.keys()].map((n) => Number(n)).sort((x, y) => x - y);
  numeros.forEach((n, i) => {
    if (n !== i + 1) {
      ajouter(
        'numero_non_consecutif',
        `La suite des numéros porte un trou ou un départ hors 0001 : attendu ${String(i + 1).padStart(4, '0')}, ` +
          `trouvé ${String(n).padStart(4, '0')}. Un ADR ne se supprime pas : on en écrit un qui le remplace.`
      );
    }
  });

  for (const a of c.adrs) {
    const numero = NOM_ADR.exec(a.fichier)?.[1] ?? '';
    const e = entreeDepuisTexte(a.fichier, a.texte);
    const titre = /^#[ \t]+(.+)$/m.exec(a.texte)?.[1] ?? '';
    if (!titre.startsWith(`partners/ADR-${numero} `) && !titre.startsWith(`partners/ADR-${numero} —`)) {
      ajouter(
        'titre_non_qualifie',
        `${a.fichier} — le titre devrait commencer par « partners/ADR-${numero} — » ; il commence par ` +
          `« ${titre.slice(0, 40)} ». Trois dépôts numérotent leurs ADR chacun de leur côté.`
      );
    }
    if (!STATUTS.includes(e.statut)) {
      ajouter(
        'statut_hors_vocabulaire',
        `${a.fichier} porte le statut « ${e.statut || '(vide)'} » ; le vocabulaire fermé est ` +
          `${STATUTS.join(', ')} (CONVENTIONS §1, glossaire).`
      );
    }
    for (const r of RUBRIQUES) {
      if (!new RegExp(`^##[ \\t]+${r}[ \\t]*$`, 'm').test(a.texte)) {
        ajouter('rubrique_manquante', `${a.fichier} — rubrique « ${r} » absente. Une rubrique vide se voit ; une rubrique absente ne se voit pas.`);
      }
    }
    if (e.statut === 'accepte') {
      const bloc = a.texte.split(/^##[ \t]+Ce qui le vérifie[ \t]*$/m)[1] ?? '';
      const porteUneAssertion = /\.spec\.ts/.test(bloc) && /it\(/.test(bloc);
      const porteHorsCode = /hors-code/.test(bloc) && bloc.replace(/\s+/g, ' ').length > 40;
      if (!porteUneAssertion && !porteHorsCode) {
        ajouter(
          'assertion_manquante',
          `${a.fichier} est « accepte » sans assertion (fichier + titre \`it()\`) ni \`hors-code\` motivé ` +
            `(REQ-GOV-009). Tant que rien ne peut voir la décision mourir, elle reste « propose ».`
        );
      }
    }
  }

  if (c.index === null) {
    ajouter('index_absent', `${join(RACINE_ADR, NOM_INDEX)} est absent : l'index est exigé par REQ-GOV-008. Lance \`pnpm adr:index\`.`);
  } else {
    const attendu = rendreIndex(c.adrs.map((a) => entreeDepuisTexte(a.fichier, a.texte)));
    if (normaliser(c.index) !== normaliser(attendu)) {
      ajouter(
        'index_non_derive',
        `${join(RACINE_ADR, NOM_INDEX)} diffère du listage du dossier (« index ≠ ls », REQ-GOV-008). ` +
          `L'index est une VUE : regénère-le par \`pnpm adr:index\`, ne l'édite pas.`
      );
    }
  }

  const existants = new Set(c.adrs.map((a) => NOM_ADR.exec(a.fichier)?.[1] ?? ''));
  for (const r of c.references) {
    RENVOI.lastIndex = 0;
    let m: RegExpExecArray | null;
    const propre = neutraliser(r.contenu);
    while ((m = RENVOI.exec(propre)) !== null) {
      const [, depot, numero] = m;
      if (!depot || !DEPOTS.includes(depot)) {
        ajouter(
          'reference_non_qualifiee',
          `${r.fichier}:${r.ligne} — « ${m[0]} » n'est pas qualifiée par son dépôt. Écris ` +
            `${DEPOTS.map((d) => `\`${d}/ADR-${numero}\``).join(', ')} : trois dépôts numérotent chacun de leur côté.`
        );
        continue;
      }
      if (depot === 'partners' && !existants.has(numero!)) {
        ajouter(
          'reference_sans_cible',
          `${r.fichier}:${r.ligne} — « ${m[0]} » ne désigne aucun ADR de ce dépôt. ` +
            `Une référence qui ne résout pas est une référence qui ne se vérifie pas.`
        );
      }
    }
  }

  return fautes;
}

const FAMILLES = [
  'dossier_double', 'nom_non_conforme', 'numero_double', 'numero_non_consecutif',
  'titre_non_qualifie', 'statut_hors_vocabulaire', 'rubrique_manquante', 'assertion_manquante',
  'index_absent', 'index_non_derive', 'reference_non_qualifiee', 'reference_sans_cible',
];

// ── lecture du dépôt ─────────────────────────────────────────────────────────

function parcourir(racine: string, acc: string[] = []): string[] {
  if (!existsSync(racine)) return acc;
  if (statSync(racine).isFile()) {
    acc.push(racine);
    return acc;
  }
  for (const e of readdirSync(racine)) {
    if (e === 'node_modules' || e === '.git') continue;
    parcourir(join(racine, e), acc);
  }
  return acc;
}

function chemin(f: string): string {
  return relative(process.cwd(), f).split(sep).join('/');
}

function dossiersDAdr(): string[] {
  const trouves: string[] = [];
  for (const f of parcourir('docs')) {
    const c = chemin(f);
    const m = /^(.*\/)?(adr|adrs|ADR|decisions-architecture)\/[^/]+$/.exec(c);
    if (m && NOM_ADR.test(c.split('/').pop() ?? '')) {
      const dossier = c.slice(0, c.lastIndexOf('/'));
      if (!trouves.includes(dossier)) trouves.push(dossier);
    }
  }
  return trouves;
}

function lireCorpus(strict: boolean): { corpus: Corpus; reservees: Reference[] } {
  const fichiersDuDossier = existsSync(RACINE_ADR) ? readdirSync(RACINE_ADR).sort() : [];
  const adrs: Adr[] = fichiersDuDossier
    .filter((f) => NOM_ADR.test(f) && f !== GABARIT)
    .map((f) => ({ fichier: f, texte: readFileSync(join(RACINE_ADR, f), 'utf8') }));

  const cheminIndex = join(RACINE_ADR, NOM_INDEX);
  const index = existsSync(cheminIndex) ? readFileSync(cheminIndex, 'utf8') : null;

  const references: Reference[] = [];
  const reservees: Reference[] = [];
  for (const racine of RACINES) {
    for (const f of parcourir(racine)) {
      const c = chemin(f);
      if (!EXTENSIONS.test(c) || SOI_MEME.test(c)) continue;
      const reserve = RESERVES.some((r) => r.test(c));
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((contenu, i) => {
          if (!/ADR-\d{4}/.test(contenu)) return;
          const ref = { fichier: c, ligne: i + 1, contenu };
          if (reserve && !strict) reservees.push(ref);
          else references.push(ref);
        });
    }
  }

  return {
    corpus: { dossiersAdr: dossiersDAdr(), fichiersDuDossier, adrs, index, references },
    reservees,
  };
}

// ── mode --prove ─────────────────────────────────────────────────────────────

function adrTemoin(numero: string, statut = 'propose', options: { rubriques?: string[]; titre?: string } = {}): Adr {
  const rubriques = options.rubriques ?? RUBRIQUES;
  const l = [
    options.titre ?? `# partners/ADR-${numero} — Un témoin`,
    '',
    '| Champ | Valeur |',
    '| --- | --- |',
    `| **Statut** | \`${statut}\` |`,
    '| **Date** | 2026-09-03 |',
    '| **Tâche** | GOV-009 |',
    '',
  ];
  for (const r of rubriques) {
    l.push(`## ${r}`, '');
    if (r === 'Ce qui le vérifie') {
      l.push('- **hors-code** — le moule d’un document ne se vérifie pas par une assertion de test.', '');
    } else {
      l.push('Une phrase.', '');
    }
  }
  return { fichier: `${numero}-temoin.md`, texte: l.join('\n') };
}

function corpusValide(): Corpus {
  const adrs = [adrTemoin('0001'), adrTemoin('0002')];
  return {
    dossiersAdr: [RACINE_ADR],
    fichiersDuDossier: [...adrs.map((a) => a.fichier), NOM_INDEX, GABARIT],
    adrs,
    index: rendreIndex(adrs.map((a) => entreeDepuisTexte(a.fichier, a.texte))),
    references: [{ fichier: 'docs/temoin.md', ligne: 1, contenu: 'voir partners/ADR-0001 et axionia/ADR-0014' }],
  };
}

function reindexe(c: Corpus): Corpus {
  return { ...c, index: rendreIndex(c.adrs.map((a) => entreeDepuisTexte(a.fichier, a.texte))) };
}

if (process.argv.includes('--prove')) {
  const base = controler(corpusValide());
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un corpus DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const TEMOINS: { famille: string; defaut: () => Corpus }[] = [
    { famille: 'dossier_double', defaut: () => ({ ...corpusValide(), dossiersAdr: [RACINE_ADR, 'docs/adrs'] }) },
    { famille: 'nom_non_conforme', defaut: () => ({ ...corpusValide(), fichiersDuDossier: [...corpusValide().fichiersDuDossier, 'ADR-Sept.md'] }) },
    {
      famille: 'numero_double',
      defaut: () => {
        const c = corpusValide();
        const jumeau = { ...adrTemoin('0002'), fichier: '0002-jumeau.md' };
        return reindexe({ ...c, adrs: [...c.adrs, jumeau] });
      },
    },
    {
      famille: 'numero_non_consecutif',
      defaut: () => {
        const c = corpusValide();
        return reindexe({ ...c, adrs: [c.adrs[0]!, adrTemoin('0004')] });
      },
    },
    {
      famille: 'titre_non_qualifie',
      defaut: () => {
        const c = corpusValide();
        return reindexe({ ...c, adrs: [adrTemoin('0001', 'propose', { titre: '# ADR-0001 — Un témoin' }), c.adrs[1]!] });
      },
    },
    {
      famille: 'statut_hors_vocabulaire',
      defaut: () => {
        const c = corpusValide();
        return reindexe({ ...c, adrs: [adrTemoin('0001', 'Accepted'), c.adrs[1]!] });
      },
    },
    {
      famille: 'rubrique_manquante',
      defaut: () => {
        const c = corpusValide();
        const ampute = adrTemoin('0001', 'propose', { rubriques: RUBRIQUES.filter((r) => r !== 'Ce qui le vérifie') });
        return reindexe({ ...c, adrs: [ampute, c.adrs[1]!] });
      },
    },
    {
      famille: 'assertion_manquante',
      defaut: () => {
        const c = corpusValide();
        const accepte = adrTemoin('0001', 'accepte');
        accepte.texte = accepte.texte.replace(/- \*\*hors-code\*\*[^\n]*/, 'Rien.');
        return reindexe({ ...c, adrs: [accepte, c.adrs[1]!] });
      },
    },
    { famille: 'index_absent', defaut: () => ({ ...corpusValide(), index: null }) },
    { famille: 'index_non_derive', defaut: () => ({ ...corpusValide(), index: corpusValide().index!.replace(/\n\|.*ADR-0002.*\n/, '\n') }) },
    {
      famille: 'reference_non_qualifiee',
      defaut: () => ({ ...corpusValide(), references: [{ fichier: 'docs/temoin.md', ligne: 3, contenu: 'conforme à ADR-0001, voir plus haut' }] }),
    },
    {
      famille: 'reference_sans_cible',
      defaut: () => ({ ...corpusValide(), references: [{ fichier: 'docs/temoin.md', ligne: 4, contenu: 'référence partners/ADR-9999 dans cette PR' }] }),
    },
  ];

  /**
   * Les contre-témoins comptent autant que les témoins. Une garde de références qui rougit sur une
   * citation force à retirer des documents l'exemple même de ce qu'ils interdisent — et sur le
   * registre des gardes, elle rougirait sur sa propre fixture rouge.
   */
  const CONTRE_TEMOINS: { quoi: string; contenu: string }[] = [
    { quoi: 'une référence qualifiée qui résout', contenu: 'voir partners/ADR-0001 pour la pile' },
    { quoi: 'une citation entre guillemets français', contenu: 'jamais « conforme à ADR-0007 » sans dépôt' },
    { quoi: 'une fixture rouge déclarée entre guillemets doubles', contenu: '"fixtureRouge": "referencer ADR-9999 dans une PR"' },
    { quoi: 'un ADR d’un autre dépôt, qualifié', contenu: 'transposé de axionia/ADR-0026 et de ops/ADR-0050' },
    { quoi: 'la forme sans tiret des registres voisins', contenu: 'AGENTS.md ADR 0026 · audit §10' },
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

  for (const c of CONTRE_TEMOINS) {
    const f = controler({ ...corpusValide(), references: [{ fichier: 'contre-témoin', ligne: 1, contenu: c.contenu }] });
    if (f.length > 0) {
      console.error(`❌ Faux positif : ${c.quoi} a rougi. La garde est trop large.\n   ${f[0]!.message}`);
      process.exit(1);
    }
  }

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
      `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

const strict = process.argv.includes('--strict-registre');
const { corpus, reservees } = lireCorpus(strict);
const fautes = controler(corpus);

if (fautes.length === 0) {
  console.log(
    `✅ gov:adr — ${corpus.adrs.length} ADR dans ${RACINE_ADR}, numéros consécutifs, ` +
      `index égal au listage, références qualifiées et résolues.`
  );
  // La dette est CALCULÉE, pas comptée sur la présence d'un motif : sur les renvois des fichiers
  // réservés, beaucoup sont des citations parfaitement correctes. On ne nomme que ceux qui
  // rougiraient — sans quoi le rappel devient un bruit qu'on apprend à ne plus lire.
  const dettes = controler({ ...corpus, references: reservees }).filter((f) => f.famille.startsWith('reference_'));
  if (dettes.length > 0) {
    console.log(
      `   ⚠️ ${dettes.length} renvoi(s) d'ADR à qualifier dans des fichiers RÉSERVÉS à un autre ` +
        `écrivain (CONVENTIONS §8) — non refusés ici, GOV-009 n'a pas le droit de les corriger :`
    );
    dettes.slice(0, 10).forEach((f) => console.log(`      ${f.message}`));
    console.log(`   \`pnpm gov:adr --strict-registre\` les compte comme des fautes.`);
  }
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:adr — ${fautes.length} faute(s) dans le dossier des ADR (REQ-GOV-008) :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
