/**
 * gov-adr.ts — la garde du dossier des ADR (GOV-009, REQ-GOV-008 ; GOV-010, REQ-GOV-009).
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
 *   — et cette assertion EXISTE : le fichier cité est sur le disque, un `it()` (ou `test()`) y porte
 *     EXACTEMENT ce titre, et le motif du `hors-code` fait au moins quarante caractères (GOV-010,
 *     paragraphe « CE QUE GOV-010 AJOUTE » plus bas) ;
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
 * CE QUE GOV-010 AJOUTE (REQ-GOV-009), et le défaut qu'il ferme. Jusqu'ici, la famille
 * `assertion_manquante` jugeait la PRÉSENCE du texte : un `.spec.ts` et un `it(` dans la rubrique
 * suffisaient. Un ADR pouvait donc citer `tests/qui/nexiste-pas.spec.ts` · `it('un titre inventé')`
 * et rester vert — une décision réputée gardée par un test qui n'existe pas, plus la fausse
 * sécurité d'une garde verte. Quatre familles s'ajoutent, et elles ne jugent que les ADR
 * `accepte` :
 *
 *   — `assertion_fichier_absent`   le fichier cité ne se trouve nulle part sous `tests/` ni `src/`
 *                                  (ou un titre est cité sans fichier dans la même puce) ;
 *   — `assertion_titre_absent`     le fichier existe, mais aucun `it()` n'y porte ce titre ;
 *   — `assertion_titre_calcule`    le seul `it()` qui corresponde est un GABARIT DE CHAÎNE ;
 *   — `hors_code_sans_motif`       la mention `hors-code` sans le motif qui la rend recevable.
 *
 * POURQUOI UN TITRE CALCULÉ EST REFUSÉ PLUTÔT QUE RÉSOLU. Le titre d'un `it()` écrit dans un
 * `describe.each` (`` `sait rougir : ses ${familles} familles…` ``) n'existe qu'à l'exécution :
 * le résoudre demanderait de faire collecter la suite par Vitest — donc de lancer, depuis une
 * garde, la suite qui lance cette garde. Et le citer fige une valeur dont la source est ailleurs :
 * partners/ADR-0003 et partners/ADR-0005 avaient déjà tranché en ce sens, motif écrit — « le citer
 * figerait un nombre qui change dès qu'une famille est ajoutée à la garde ». Le présent commit en
 * est la démonstration : gov:adr passe de douze à seize familles. On cite donc un titre LITTÉRAL,
 * et la garde nomme le gabarit qu'elle a reconnu pour que la correction soit évidente (RM-01).
 *
 * OÙ SE CITE UNE ASSERTION QUI N'EXISTE PAS ENCORE. Dans « Reste à faire », jamais dans « Ce qui le
 * vérifie » : la rubrique est coupée au titre suivant, et ce qui est écrit sous « Reste à faire »
 * n'est pas jugé. Un ADR `accepte` dont toutes les assertions restent à poser n'est pas `accepte` —
 * c'est le mot du gabarit : « Tant que l'assertion n'est pas écrite et vue rougir, l'ADR reste
 * propose ». Un ADR `propose`, lui, cite librement ce qu'il attend : la garde ne le juge pas.
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
/**
 * Un fichier de test du dépôt, vu comme la garde en a besoin : ses titres LITTÉRAUX d'un côté, ses
 * gabarits de chaîne de l'autre. La séparation est la décision de GOV-010 : un gabarit ne peut pas
 * être cité, mais il doit être RECONNU pour que le message dise quoi corriger.
 */
type Spec = { chemin: string; titres: string[]; gabarits: string[] };
/** Une assertion citée par un ADR : le fichier de la même puce, et le titre du `it()`. */
type Citation = { fichier: string | null; titre: string };
type Corpus = {
  dossiersAdr: string[];
  fichiersDuDossier: string[];
  adrs: Adr[];
  index: string | null;
  references: Reference[];
  /** Injectés plutôt que lus dans `controler` : c'est ce qui rend `--prove` possible sans disque. */
  specs: Spec[];
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

/** Les racines où vit un fichier de test, et ce qui en est un (vitest.config.ts). */
const RACINES_TESTS = ['tests', 'src'];
const EXTENSION_TEST = /\.(spec|test)\.tsx?$/;

/**
 * Un titre de `it()` cité dans un ADR : `it('…')` ou `it("…")`. Le `\2\s*\)` final n'est pas un
 * ornement — sans lui, `it('… d'un autre apporteur …')` se coupe à la première apostrophe et la
 * garde rougit sur un titre parfaitement valide.
 */
const CITATION_IT = /\b(?:it|test)\(\s*(['"])([\s\S]*?)\1\s*\)/g;
/** Un chemin de fichier de test cité dans un ADR — avec ou sans son chemin, avec ou sans accents graves. */
const CITATION_FICHIER = /[\w./-]+\.(?:spec|test)\.tsx?/g;
/** Un `it()` du CODE : les trois formes de guillemets, `it.each` et `test.skip` compris. */
const IT_DU_CODE = /\b(?:it|test)(?:\.\w+)*\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/**
 * Le motif d'un `hors-code` fait au moins quarante caractères. Le seuil n'est pas une opinion : le
 * gabarit écrit « La mention seule ne suffit pas ; le motif fait partie de la mention », et quarante
 * caractères est la longueur en dessous de laquelle on n'écrit pas une raison mais un mot
 * (« parce que c'est documentaire », 28 caractères, a été le cas d'école).
 */
const MOTIF_MINIMAL = 40;

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

// ── l'assertion citée : la lire, la résoudre (GOV-010) ───────────────────────

/** Les espaces d'une citation ne portent pas de sens : un titre coupé par la mise en page est le même. */
const aplatir = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Deux titres qui ne diffèrent que par l'apostrophe ou la casse sont visuellement identiques. */
const plier = (s: string): string => s.replace(/[\u2018\u2019\u201b]/g, "'").replace(/\u00a0/g, ' ').toLowerCase();

/**
 * La rubrique « Ce qui le vérifie », COUPÉE au titre suivant. Le `split` d'origine emportait tout
 * le reste du fichier : une assertion écrite sous « Reste à faire » suffisait à satisfaire la
 * rubrique qui la précède, ce qui est exactement l'inverse de ce que ces deux rubriques disent.
 */
function rubriqueVerification(texte: string): string {
  const apres = texte.split(/^##[ \t]+Ce qui le vérifie[ \t]*$/m)[1] ?? '';
  return apres.split(/^##[ \t]+/m)[0] ?? '';
}

/**
 * Les puces de premier niveau d'un bloc markdown, chacune aplatie sur une ligne. On raisonne par
 * puce et non sur le bloc entier parce que c'est la puce qui APPARIE un fichier et un titre : sur
 * le bloc entier, un titre hériterait du fichier d'une autre assertion.
 */
function puces(bloc: string): string[] {
  const rendues: string[] = [];
  let courante: string[] | null = null;
  for (const ligne of bloc.split('\n')) {
    if (/^[-*][ \t]/.test(ligne)) {
      if (courante) rendues.push(courante.join(' '));
      courante = [ligne];
    } else if (courante && ligne.trim() === '') {
      rendues.push(courante.join(' '));
      courante = null;
    } else if (courante) {
      courante.push(ligne.trim());
    }
  }
  if (courante) rendues.push(courante.join(' '));
  return rendues.map(aplatir).filter((p) => p !== '');
}

/** Les assertions citées par une puce, dans l'ordre : chaque titre prend le dernier fichier cité avant lui. */
function citations(puce: string): Citation[] {
  const jetons: { fichier?: string; titre?: string; position: number }[] = [];
  for (const m of puce.matchAll(CITATION_FICHIER)) jetons.push({ fichier: m[0]!, position: m.index! });
  for (const m of puce.matchAll(CITATION_IT)) jetons.push({ titre: aplatir(m[2]!), position: m.index! });
  jetons.sort((a, b) => a.position - b.position);

  const trouvees: Citation[] = [];
  let fichier: string | null = null;
  for (const j of jetons) {
    if (j.fichier !== undefined) fichier = j.fichier;
    else trouvees.push({ fichier, titre: j.titre! });
  }
  return trouvees;
}

/** Le fichier de test que désigne un chemin cité — complet ou réduit à son seul nom de fichier. */
function resoudreSpec(specs: Spec[], cite: string): Spec[] {
  const c = cite.replace(/^\.\//, '');
  return specs.filter((s) => s.chemin === c || s.chemin.endsWith('/' + c));
}

/** Un gabarit de chaîne reconnaît un titre si ses parties fixes l'encadrent dans l'ordre. */
function gabaritReconnait(gabarit: string, titre: string): boolean {
  const parties = gabarit.split(/\$\{[^}]*\}/g).map((p) => aplatir(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parties.join('.+')}$`).test(titre);
}

// ── les contrôles ────────────────────────────────────────────────────────────

/**
 * REQ-GOV-009, sur un ADR `accepte` SEULEMENT : l'assertion citée doit exister. Un ADR `propose`
 * annonce librement ce qu'il attend — c'est même à cela que sert le statut.
 */
function controlerAssertions(a: Adr, c: Corpus, ajouter: (famille: string, message: string) => void): void {
  const bloc = rubriqueVerification(a.texte);
  const lesPuces = puces(bloc);
  const citees = lesPuces.flatMap(citations);

  if (citees.length === 0 && !/hors-code/.test(bloc)) {
    ajouter(
      'assertion_manquante',
      `${a.fichier} est « accepte » sans assertion (fichier + titre \`it()\`) ni \`hors-code\` motivé ` +
        `(REQ-GOV-009). Tant que rien ne peut voir la décision mourir, elle reste « propose ».`
    );
    return;
  }

  // Une puce qui invoque `hors-code` sans citer d'assertion FAIT le choix du hors-code : c'est
  // elle, et elle seule, qui doit porter le motif.
  for (const p of lesPuces) {
    if (!/hors-code/.test(p) || citations(p).length > 0) continue;
    const motif = aplatir(
      p
        .split(/hors-code/)
        .slice(1)
        .join(' ')
        .replace(/[`*_—–-]/g, ' ')
    );
    if (motif.length < MOTIF_MINIMAL) {
      ajouter(
        'hors_code_sans_motif',
        `${a.fichier} — la mention \`hors-code\` n'est suivie que de ${motif.length} caractère(s) de motif ` +
          `(${MOTIF_MINIMAL} attendus) : « ${motif || '(rien)'} ». Le gabarit le dit — « la mention seule ne ` +
          `suffit pas ; le motif fait partie de la mention » : écris POURQUOI aucune assertion ne peut porter ` +
          `cette décision.`
      );
    }
  }

  for (const cite of citees) {
    const ou = `${a.fichier} — \`it('${cite.titre}')\``;
    if (cite.fichier === null) {
      ajouter(
        'assertion_fichier_absent',
        `${ou} est cité sans fichier de test dans la même puce. Le gabarit demande « \`<chemin/du/` +
          `fichier.spec.ts>\` · \`it('<titre exact>')\` » : un titre seul ne se retrouve pas.`
      );
      continue;
    }
    const cibles = resoudreSpec(c.specs, cite.fichier);
    if (cibles.length === 0) {
      ajouter(
        'assertion_fichier_absent',
        `${ou} cite \`${cite.fichier}\`, qui n'existe sous aucune des racines de test ` +
          `(${RACINES_TESTS.join(', ')}). Une assertion qui n'existe pas ne verra jamais la décision mourir ` +
          `(REQ-GOV-009) ; si le test reste à écrire, la citation va sous « Reste à faire ».`
      );
      continue;
    }
    if (cibles.length > 1) {
      ajouter(
        'assertion_fichier_absent',
        `${ou} cite \`${cite.fichier}\`, qui désigne ${cibles.length} fichiers : ` +
          `${cibles.map((s) => s.chemin).join(', ')}. Écris le chemin complet.`
      );
      continue;
    }

    const spec = cibles[0]!;
    // Un titre peut être cité par son chemin d'exécution (`describe > it`) : c'est le dernier
    // segment qui nomme l'assertion, et c'est lui que le fichier porte.
    const nu = cite.titre.split(' > ').pop()!;
    if (spec.titres.includes(cite.titre) || spec.titres.includes(nu)) continue;

    const gabarit = spec.gabarits.find((g) => gabaritReconnait(g, cite.titre) || gabaritReconnait(g, nu));
    if (gabarit !== undefined) {
      ajouter(
        'assertion_titre_calcule',
        `${ou} — ${spec.chemin} ne porte ce titre que sous forme de GABARIT DE CHAÎNE : ` +
          `\`${gabarit}\`. Ce titre n'existe qu'à l'exécution, et le citer fige une valeur dont la source ` +
          `est ailleurs (RM-01) — partners/ADR-0003 et partners/ADR-0005 ont déjà tranché en ce sens. ` +
          `Cite un titre LITTÉRAL du même fichier.`
      );
      continue;
    }

    const voisin = spec.titres.find((t) => plier(t) === plier(nu));
    ajouter(
      'assertion_titre_absent',
      `${ou} — ${spec.chemin} ne contient aucun \`it()\` de ce titre` +
        (voisin !== undefined
          ? `. Le fichier porte « ${voisin} », qui n'en diffère que par une apostrophe ou une casse : ` +
            `recopie-le caractère pour caractère.`
          : ` (le fichier en porte ${spec.titres.length}). Le titre cité doit être EXACT : c'est lui qui ` +
            `permet de retrouver l'assertion quand la décision est remise en cause.`)
    );
  }
}

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
    if (e.statut === 'accepte') controlerAssertions(a, c, ajouter);
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
  // GOV-010, REQ-GOV-009 : l'assertion citée existe VRAIMENT.
  'assertion_fichier_absent', 'assertion_titre_absent', 'assertion_titre_calcule', 'hors_code_sans_motif',
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

/**
 * Les fichiers de test du dépôt et leurs titres. On lit la SOURCE, on n'exécute rien : un titre
 * calculé par un `describe.each` n'existe qu'à l'exécution, et faire collecter la suite par Vitest
 * depuis cette garde reviendrait à lancer, depuis la garde, la suite qui lance la garde.
 */
function lireSpecs(): Spec[] {
  const specs: Spec[] = [];
  for (const racine of RACINES_TESTS) {
    for (const f of parcourir(racine)) {
      const c = chemin(f);
      if (!EXTENSION_TEST.test(c)) continue;
      const source = readFileSync(f, 'utf8');
      const titres: string[] = [];
      const gabarits: string[] = [];
      for (const m of source.matchAll(IT_DU_CODE)) {
        const brut = m[2]!;
        if (m[1] === '`' && brut.includes('${')) gabarits.push(aplatir(brut));
        else titres.push(aplatir(brut.replace(/\\(['"`\\])/g, '$1')));
      }
      specs.push({ chemin: c, titres, gabarits });
    }
  }
  return specs;
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
    corpus: { dossiersAdr: dossiersDAdr(), fichiersDuDossier, adrs, index, references, specs: lireSpecs() },
    reservees,
  };
}

// ── mode --prove ─────────────────────────────────────────────────────────────

type OptionsTemoin = { rubriques?: string[]; titre?: string; verifie?: string; reste?: string };

function adrTemoin(numero: string, statut = 'propose', options: OptionsTemoin = {}): Adr {
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
      l.push(options.verifie ?? '- **hors-code** — le moule d’un document ne se vérifie pas par une assertion de test.', '');
    } else if (r === 'Reste à faire' && options.reste !== undefined) {
      l.push(options.reste, '');
    } else {
      l.push('Une phrase.', '');
    }
  }
  return { fichier: `${numero}-temoin.md`, texte: l.join('\n') };
}

/**
 * Le disque, tel que la preuve le feint. Un seul fichier de test, un titre littéral et un gabarit
 * de chaîne : c'est tout ce dont les quatre familles de GOV-010 ont besoin, et cela garde la preuve
 * indépendante de l'état réel de `tests/` — un témoin qui dépend du dépôt cesse de rougir le jour
 * où le dépôt change.
 */
const SPECS_TEMOIN: Spec[] = [
  {
    chemin: 'tests/unit/gouvernance/temoin.spec.ts',
    titres: ['un titre littéral qui existe'],
    gabarits: ['sait rougir : ses ${familles} familles ont chacune un témoin'],
  },
];

function corpusValide(): Corpus {
  const adrs = [adrTemoin('0001'), adrTemoin('0002')];
  return {
    dossiersAdr: [RACINE_ADR],
    fichiersDuDossier: [...adrs.map((a) => a.fichier), NOM_INDEX, GABARIT],
    adrs,
    index: rendreIndex(adrs.map((a) => entreeDepuisTexte(a.fichier, a.texte))),
    references: [{ fichier: 'docs/temoin.md', ligne: 1, contenu: 'voir partners/ADR-0001 et axionia/ADR-0014' }],
    specs: SPECS_TEMOIN,
  };
}

/** Un ADR d'un statut donné dont on écrit la seule rubrique qui nous intéresse ici. */
function adrQuiVerifie(statut: string, verifie: string, reste?: string): Adr {
  return adrTemoin('0001', statut, { verifie, reste });
}

/** Le corpus valide, son premier ADR remplacé par celui-ci, et l'index régénéré. */
function avecPremierAdr(adr: Adr): Corpus {
  const c = corpusValide();
  return reindexe({ ...c, adrs: [adr, c.adrs[1]!] });
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
    // ── GOV-010 : l'assertion citée existe vraiment (REQ-GOV-009) ──
    {
      famille: 'assertion_fichier_absent',
      defaut: () =>
        avecPremierAdr(
          adrQuiVerifie('accepte', "- **Assertion** — `tests/qui/nexiste-pas.spec.ts` · `it('un titre littéral qui existe')`.")
        ),
    },
    {
      famille: 'assertion_titre_absent',
      defaut: () =>
        avecPremierAdr(
          adrQuiVerifie('accepte', "- **Assertion** — `tests/unit/gouvernance/temoin.spec.ts` · `it('un titre inventé')`.")
        ),
    },
    {
      famille: 'assertion_titre_calcule',
      defaut: () =>
        avecPremierAdr(
          adrQuiVerifie(
            'accepte',
            "- **Assertion** — `tests/unit/gouvernance/temoin.spec.ts` · " +
              "`it('sait rougir : ses 12 familles ont chacune un témoin')`."
          )
        ),
    },
    {
      famille: 'hors_code_sans_motif',
      defaut: () => avecPremierAdr(adrQuiVerifie('accepte', '- **hors-code** — parce que.')),
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

  /**
   * Les contre-témoins de GOV-010 portent sur les ADR, pas sur les références : c'est un second
   * axe, et une garde d'assertions trop large ferait bien plus de dégâts qu'une garde muette. Elle
   * interdirait à un ADR `propose` d'annoncer le test qu'il attend — la seule information qui rende
   * la rubrique utile avant que le test existe.
   */
  const CONTRE_TEMOINS_ADR: { quoi: string; corpus: () => Corpus }[] = [
    {
      quoi: 'un ADR « propose » qui annonce une assertion pas encore écrite',
      corpus: () =>
        avecPremierAdr(
          adrQuiVerifie('propose', "- **Assertion à poser** — `tests/pas/encore.spec.ts` · `it('un titre à venir')`.")
        ),
    },
    {
      quoi: 'un ADR « accepte » dont l’assertion résout',
      corpus: () =>
        avecPremierAdr(
          adrQuiVerifie('accepte', "- **Assertion** — `tests/unit/gouvernance/temoin.spec.ts` · `it('un titre littéral qui existe')`.")
        ),
    },
    {
      quoi: 'un titre coupé sur deux lignes par la mise en page',
      corpus: () =>
        avecPremierAdr(
          adrQuiVerifie(
            'accepte',
            '- **Assertion** — `tests/unit/gouvernance/temoin.spec.ts` ·\n' +
              "  `it('un titre littéral\n  qui existe')`."
          )
        ),
    },
    {
      quoi: 'un fichier cité par son seul nom, sans son chemin',
      corpus: () =>
        avecPremierAdr(adrQuiVerifie('accepte', "- **Assertion** — `temoin.spec.ts` · `it('un titre littéral qui existe')`.")),
    },
    {
      quoi: 'un `hors-code` réellement motivé',
      corpus: () =>
        avecPremierAdr(
          adrQuiVerifie(
            'accepte',
            "- **hors-code** — aucune assertion ne peut porter un choix d'organisation humaine : il n'a pas de trace dans le code."
          )
        ),
    },
    {
      quoi: 'une assertion à venir, citée sous « Reste à faire »',
      corpus: () =>
        avecPremierAdr(
          adrQuiVerifie(
            'accepte',
            "- **Assertion** — `tests/unit/gouvernance/temoin.spec.ts` · `it('un titre littéral qui existe')`.",
            "- L'extension au schéma reste à écrire : `tests/pas/encore.spec.ts` · `it('un titre à venir')`, par DM-01."
          )
        ),
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

  for (const c of CONTRE_TEMOINS) {
    const f = controler({ ...corpusValide(), references: [{ fichier: 'contre-témoin', ligne: 1, contenu: c.contenu }] });
    if (f.length > 0) {
      console.error(`❌ Faux positif : ${c.quoi} a rougi. La garde est trop large.\n   ${f[0]!.message}`);
      process.exit(1);
    }
  }

  for (const c of CONTRE_TEMOINS_ADR) {
    const f = controler(c.corpus());
    if (f.length > 0) {
      console.error(`❌ Faux positif : ${c.quoi} a rougi. La garde est trop large.\n   ${f[0]!.message}`);
      process.exit(1);
    }
  }

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
      `${CONTRE_TEMOINS.length + CONTRE_TEMOINS_ADR.length} contre-témoins restent verts — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

const strict = process.argv.includes('--strict-registre');
const { corpus, reservees } = lireCorpus(strict);
const fautes = controler(corpus);

if (fautes.length === 0) {
  // Le décompte des assertions est CALCULÉ sur le même corpus que le contrôle : une ligne « tout va
  // bien » qui ne dit pas combien elle a vérifié est indiscernable d'une garde qui n'a rien trouvé
  // à vérifier.
  const acceptes = corpus.adrs.filter((a) => entreeDepuisTexte(a.fichier, a.texte).statut === 'accepte');
  const assertions = acceptes.flatMap((a) => puces(rubriqueVerification(a.texte)).flatMap(citations));
  console.log(
    `✅ gov:adr — ${corpus.adrs.length} ADR dans ${RACINE_ADR}, numéros consécutifs, ` +
      `index égal au listage, références qualifiées et résolues ; ${acceptes.length} ADR « accepte », ` +
      `${assertions.length} assertion(s) citée(s), toutes retrouvées parmi ${corpus.specs.length} fichiers de test.`
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
