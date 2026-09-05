/**
 * gov-identifiants.ts — la garde des identifiants nus (GOV-003, GOV-025, REQ-GOV-003).
 *
 * USAGE : pnpm gov:identifiants           (échoue si un identifiant nu est cité)
 *         pnpm gov:identifiants --prove   (un témoin par famille ET par position, chacun vu rougir)
 *
 * LE PROBLÈME QU'ELLE TIENT. Les huit relecteurs ont désigné les décisions par des étiquettes
 * locales — « conforme à D3 », « arbitrage C12 », « selon A12 ». Ces étiquettes ne veulent rien
 * dire hors du document qui les a écrites : deux relecteurs ont utilisé `D3` pour deux décisions
 * différentes, et `HYP-W6` cohabitait avec `HYP-W6-BIS`. Un identifiant nu ne résout pas, ne se
 * date pas, et ne dit pas qui a tranché.
 *
 * LA RÈGLE. Un identifiant de décision se cite sous sa forme QUALIFIÉE — celle qui figure au
 * registre `docs/DECISIONS.md` : `HYP-*`, `DEC-*`, `W<n>`, `EXT-*`. Une étiquette nue de la forme
 * lettre + un ou deux chiffres (`A12`, `B9`, `C12`, `D3`, `R5`) est refusée.
 *
 * CE QU'ELLE NE FAIT PAS. Elle n'invente pas de correspondance. Un identifiant nu se corrige en
 * le remplaçant par son identifiant canonique, que la §0 du registre résout — pas en l'exemptant.
 *
 * C'EST UNE GARDE DE PUBLICATION, PAS UNE GARDE DE STYLE. Le dépôt est PUBLIC (décision `W13`,
 * REQ-GOV-031, REQ-GOV-003) : un identifiant qui ne résout nulle part y reste lisible pour
 * toujours — forks, caches et miroirs compris, y compris après un passage en privé.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Un identifiant nu : une lettre de relecteur suivie d'un ou deux chiffres.
 *
 * ── GOV-025 : LE POINT EST SORTI DE LA LOOKAHEAD, ET VOICI POURQUOI ─────────────────────────
 * La lookahead a porté `(?![A-Za-z0-9_.-])` jusqu'au 2026-09-05. Le point y figurait, si bien
 * qu'une étiquette COLLÉE À UN POINT FINAL n'était pas vue, alors que la même suivie d'une
 * espace l'était. Autrement dit la garde était aveugle à la position la plus fréquente d'un mot
 * dans de la prose : la fin de phrase. Pire, ses propres témoins `--prove` évitaient tous cette
 * position — l'auto-preuve n'exerçait jamais le seul endroit où la garde ne voyait rien, et
 * restait donc VERTE SUR LE TEXTE QU'ELLE CONDAMNE. Le défaut a été trouvé en mutation, puis
 * reproduit involontairement en rédigeant l'entrée de journal de la PR 30 : des deux occurrences
 * écrites pour l'illustrer, une seule a été relevée — celle qui n'était pas collée au point.
 *
 * DEUX FORMES ÉTAIENT POSSIBLES, ET LE CHOIX A ÉTÉ MESURÉ AVANT D'ÊTRE FAIT :
 *   (a) retirer le point tout court                       → `(?![A-Za-z0-9_-])`
 *   (b) ne garder que le point SUIVI D'UN CARACTÈRE DE MOT → `(?![A-Za-z0-9_-]|\.\w)`, qui aurait
 *       continué d'abriter une extension (`gov-pr.ts`), une version (`v1.2`), un numéro de
 *       sous-section.
 * Mesure du 2026-09-05, sur les fichiers suivis, hors fichiers exempts : la forme (a) fait
 * apparaître UNE seule occurrence de plus que la forme (b) — `docs/gates.json`, « 9 controles
 * plus C13.3 ». Or ce jeton n'est pas un numéro de sous-section : c'est une étiquette de
 * relecteur, que `docs/requirements.json` cite deux fois sous la forme « audit anti-abus C13 ».
 * La forme (b) n'aurait donc protégé AUCUN usage légitime : elle aurait seulement continué de
 * cacher le seul identifiant nu que le point dissimulait encore. La forme (a) est retenue.
 *
 * CE QUE (a) COÛTE, ET QUI EST ASSUMÉ. Un jeton de la classe suivi d'un point n'est plus abrité
 * par accident : « les sauvegardes partent sur R2. » rougit désormais, là où « Cloudflare R2. »
 * reste vert par la locution légitime ci-dessous. C'est le comportement voulu — `R2` seul est
 * ambigu (c'est aussi une étiquette de relecteur), et le lever tient en un mot : nommer Cloudflare.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */
/**
 * ⚠️ AFFINÉ APRÈS GOV-025, ET C'EST UNE CORRECTION DE SA PROPRE SURCORRECTION (GOV-029).
 * GOV-025 a retiré le `.` de la lookahead pour attraper l'étiquette collée à un point final —
 * « conforme à D11. » — et elle avait raison : c'était sa cécité. Mais retirer le point tout
 * entier fait aussi tomber les RENVOIS POINTÉS, qui ne sont pas des étiquettes nues : `C13.3`
 * est le numéro d'une section de l'audit anti-abus, il RÉSOUT, et il est cité comme tel.
 *
 * Mesuré sur cet arbre le 2026-09-05 : `docs/gates.json:696` porte « 9 controles plus C13.3 »
 * depuis `main`, et GOV-025 vit sur une branche de lot. Les deux sont verts SÉPARÉMENT et
 * rouges ENSEMBLE — le jour où le lot atterrit, l'étape « Identifiants qualifies » de Gate A
 * rougit sur `main`, sur une ligne que personne n'a touchée.
 *
 * La ligne se trace sur CE QUI SUIT LE POINT, et elle est exacte parce que les deux cas ne se
 * ressemblent qu'en surface :
 *   — un point suivi d'un CHIFFRE prolonge l'identifiant : `C13.3` est un renvoi, pas un jeton nu ;
 *   — un point suivi d'autre chose — espace, fin de ligne, guillemet — termine une phrase, et
 *     l'étiquette qui le précède est bien nue. C'est le cas que GOV-025 a ouvert, et il reste vu.
 *
 * Ce n'est donc PAS un retour à la forme d'avant GOV-025, qui ignorait les deux.
 */
export const MOTIF_NU = /(?<![A-Za-z0-9_./:-])([ABCDR]\d{1,2})(?![A-Za-z0-9_-]|\.\d)/g;

/**
 * SPÉCIMEN HISTORIQUE — la lookahead d'AVANT GOV-025, conservée pour une seule raison : rejouer
 * les témoins contre la version cassée. Un témoin qu'on n'a pas vu attraper l'ancien défaut ne
 * prouve pas qu'il l'attraperait (RM-02) ; c'est elle qui rend cette démonstration reproductible,
 * ici et dans `tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts`.
 * ⚠️ Elle n'est utilisée par AUCUN contrôle : `analyser()` ne connaît que `MOTIF_NU`.
 */
export const MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE =
  /(?<![A-Za-z0-9_./:-])([ABCDR]\d{1,2})(?![A-Za-z0-9_.-])/g;

/**
 * DEUX ESPACES DE NOMS SE RESSEMBLENT, ET L'EXIGENCE LES CONFONDAIT.
 * `A01`…`A15` (et `A40`, la taille de la flotte) sont les codes de POSTE des agents — un espace
 * de noms déclaré, que `tasks.schema.json` impose sous la forme `^A[0-9]{2}$`. `D3`, `C12`, `D11`
 * sont des étiquettes de relecteur, qui ne résolvent nulle part. La regex de REQ-GOV-003
 * (`[ABCDR]\d{1,2}`) attrapait les deux : appliquée telle quelle, elle exigeait de renommer
 * les quinze postes.
 * La ligne se trace sur le ZÉRO DE TÊTE : `A` suivi de DEUX chiffres est un poste ; tout le reste
 * — y compris `A5` ou `A2`, qui désignaient des postes sans respecter le schéma — est nu.
 */
function estCodeDePoste(jeton: string): boolean {
  return /^A\d{2}$/.test(jeton);
}

/**
 * Ce qui ressemble à un identifiant nu sans en être un. Chaque exemption est une locution
 * ENTIÈRE, pas la seule étiquette : exempter « R2 » partout rendrait la garde aveugle à
 * « conforme à R2 », qui est exactement ce qu'elle cherche.
 */
/**
 * CITER N'EST PAS SE SERVIR. Les documents qui EXPLIQUENT la règle doivent pouvoir écrire son
 * contre-exemple : `gardien-spec.md`, `REGLES-MAISON.md` et `gates.json` citent tous
 * « conforme à D3 » comme illustration de ce qui est refusé. La garde rougissait sur cinq
 * occurrences qui étaient sa propre documentation.
 * Un identifiant entre guillemets — français « … », doubles " … " ou simples ' … ' — est une
 * CITATION. Hors guillemets, c'est une référence, et elle doit résoudre.
 */
const CITATIONS = [/«[^»]{0,120}»/g, /"[^"]{0,120}"/g, /'[^']{0,120}'/g];

const LOCUTIONS_LEGITIMES = [
  /\bR2\b(?=\s*(?:de\s+Cloudflare|Cloudflare|,\s*préfixe|\s*bucket))/gi, // le stockage objet
  /\bCloudflare\s+R2\b/gi,
  /\bpréfixe\s+`?partners\/`?\b/gi,
  /\bB2B\b/gi,
  /\bD8222\b/g, // art. D.8222-5 — trois chiffres, hors motif, mais on le neutralise par sûreté
];

const FICHIERS = /\.(ts|tsx|js|jsx|md|json|yml|yaml)$/;
/** Le registre a le droit de NOMMER les identifiants d'origine : c'est son travail de les résoudre. */
const EXEMPTS = [
  /^docs\/DECISIONS\.md$/,
  /^scripts\/gates\/gov-identifiants\.ts$/,
  /^docs\/REQUIREMENTS(-ANNEXE-FUSIONS)?\.md$/,
  /^docs\/requirements\.json$/,
  /^docs\/TASKS\.md$/,
  /^docs\/tasks\.json$/,
  /^pnpm-lock\.yaml$/,
];

export type Faute = { famille: string; message: string };

function neutraliser(ligne: string): string {
  const sansCitations = CITATIONS.reduce((s, r) => s.replace(r, (m) => '·'.repeat(m.length)), ligne);
  return LOCUTIONS_LEGITIMES.reduce((s, r) => s.replace(r, (m) => '·'.repeat(m.length)), sansCitations);
}

/**
 * Les fautes d'une ligne, SOUS UN MOTIF DONNÉ.
 *
 * ⚠️ `motif` n'a AUCUNE valeur par défaut, et c'est délibéré (RM-11) : c'est exactement la
 * dimension que la preuve et le test font varier — lookahead corrigée contre lookahead cassée. Un
 * défaut ici rendrait « rejoué contre l'ancienne » indiscernable de « rejoué contre la nouvelle »,
 * c'est-à-dire rendrait la démonstration muette au moment précis où elle compte.
 */
export function fautesDeLigne(ligne: string, fichier: string, i: number, motif: RegExp): Faute[] {
  const out: Faute[] = [];
  const propre = neutraliser(ligne);
  motif.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(propre)) !== null) {
    if (estCodeDePoste(m[1]!)) continue;
    out.push({
      famille: 'identifiant_nu',
      message:
        `${fichier}:${i + 1} — identifiant nu « ${m[1]} ». Cite la forme qualifiée du registre ` +
        `(\`HYP-*\`, \`DEC-*\`, \`W<n>\`) : une étiquette de relecteur ne résout pas, ne se date pas, ` +
        `et n'a pas de propriétaire. La §0 de docs/DECISIONS.md donne la correspondance.`,
    });
  }
  return out;
}

function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function analyser(fichiers: string[]): Faute[] {
  const fautes: Faute[] = [];
  for (const f of fichiers) {
    if (EXEMPTS.some((r) => r.test(f))) continue;
    if (!FICHIERS.test(f) || !existsSync(f)) continue;
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((ligne, i) => fautes.push(...fautesDeLigne(ligne, f, i, MOTIF_NU)));
  }
  return fautes;
}

// ── GOV-025 : les positions limites ──────────────────────────────────────────────────────────
/**
 * Les positions d'un identifiant DANS UNE LIGNE. Ce n'est pas la même chose qu'une famille de
 * faute : la famille dit CE QUI est refusé, la position dit OÙ la garde regarde. Le défaut de
 * GOV-025 était une position, pas une famille — et c'est pour cela qu'un `--prove` organisé par
 * familles seules a pu rester vert sur le texte qu'il condamne.
 * Les huit premières sont celles qu'exige l'acceptation de GOV-025 ; les deux dernières combinent
 * le point final avec une fermeture, parce que c'est là que la prose française le met vraiment.
 */
export const POSITIONS_LIMITES = [
  'fin_de_phrase',
  'fin_de_ligne',
  'avant_virgule',
  'avant_point_virgule',
  'avant_parenthese_fermante',
  'avant_guillemet_fermant',
  'cellule_de_tableau',
  'titre_en_gras',
  'point_puis_parenthese_fermante',
  'point_puis_guillemet_fermant',
] as const;

export type PositionLimite = (typeof POSITIONS_LIMITES)[number];

/**
 * Un témoin de position. `manqueParLAncienne` n'est PAS un commentaire : la preuve s'en sert pour
 * rejouer le témoin contre `MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE` et vérifier que l'étiquette dit
 * vrai — un témoin annoncé « aveugle » que l'ancienne voyait déjà n'exerce pas le défaut, et un
 * témoin annoncé « vu » que l'ancienne manquait signale une cécité plus large que documentée.
 */
export type TemoinLimite = { position: PositionLimite; texte: string; manqueParLAncienne: boolean };

export const TEMOINS_LIMITES: TemoinLimite[] = [
  {
    position: 'fin_de_phrase',
    texte: `// le point final masquait tout : conforme à D3.`,
    manqueParLAncienne: true,
  },
  {
    position: 'fin_de_ligne',
    texte: `> la note du relecteur cite D11`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_virgule',
    texte: `la note cite D3, puis enchaîne sur le reste`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_point_virgule',
    texte: `la note cite D11; puis enchaîne sur le reste`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_parenthese_fermante',
    texte: `la note cite le dernier arbitrage (D3)`,
    manqueParLAncienne: false,
  },
  {
    position: 'avant_guillemet_fermant',
    texte: `fin de la note du relecteur : D3»`,
    manqueParLAncienne: false,
  },
  {
    position: 'cellule_de_tableau',
    texte: `| RM-12 | référence non résolue : D3. | rouge |`,
    manqueParLAncienne: true,
  },
  {
    position: 'titre_en_gras',
    texte: `**Arbitrage D3.** — le point colle au gras`,
    manqueParLAncienne: true,
  },
  {
    position: 'point_puis_parenthese_fermante',
    texte: `(le détail figure au registre, voir D3.)`,
    manqueParLAncienne: true,
  },
  {
    position: 'point_puis_guillemet_fermant',
    texte: `fin de note du relecteur : voir D3.»`,
    manqueParLAncienne: true,
  },
];

/**
 * Les usages LÉGITIMES aux mêmes positions limites. Sans eux, retirer le point de la lookahead
 * serait un pari : une garde qui rougit trop est aussi cassée qu'une garde qui ne rougit pas — et
 * la réponse humaine à une garde qui rougit trop est de la désarmer.
 * Chacun place son jeton exactement là où la garde vient de gagner en vue : collé au point.
 */
export const CONTRE_TEMOINS_LIMITES: string[] = [
  `jamais « conforme à D3. » — citer le contre-exemple reste permis`,
  `les sauvegardes vivent sur Cloudflare R2.`,
  `le stockage objet est R2 de Cloudflare.`,
  `le troisième relecteur bloquant est le poste A02.`,
  `la flotte compte A40 agents.`,
  `le réseau vise le B2B.`,
  `art. D.8222-5 du code du travail.`,
  `la décision HYP-W6-BIS a tranché, W13 la publication.`,
  `le pré-vol lance scripts/gates/gov-pr.ts puis scripts/gates/gov-adr.ts`,
  `la CI épingle pnpm 9.12.0 et node 22.`,
  `le format SEPA reste pain.001.001.09.`,
  // ── les renvois POINTÉS (GOV-029) ─────────────────────────────────────────
  // Ceux-ci ne sont pas décoratifs. Le premier est, mot pour mot, la ligne 696 de
  // `docs/gates.json` sur laquelle GOV-025 faisait rougir la CI : un contre-témoin recopié de la
  // ligne RÉELLE qui a cassé vaut mieux qu'un contre-témoin inventé qui lui ressemble.
  // Les deux suivants disent que la règle porte sur la FORME du renvoi, pas sur ce seul cas.
  `9 controles plus C13.3 ; manifeste a jour (pnpm mcp:manifeste)`,
  `le détail est en C13.3.2 de la note d'analyse`,
  `l'étape D3.1 précède l'étape D3.2`,
];

/**
 * La §0 du registre des décisions, LUE et non recopiée (RM-01). C'est le contre-témoin le plus
 * exigeant du lot : chacune de ses lignes cite des identifiants d'ORIGINE sous leur habit qualifié
 * (`DEC-ABUS-C12`, `DEC-BEB-A12`, `HYP-W6`) — les formes mêmes que la garde cherche. Si la garde
 * rougissait dessus, elle rougirait sur la table qui RÉSOUT les identifiants nus.
 * Un registre absent ou une §0 vide font ÉCHOUER la preuve : un contre-témoin qu'on saute en
 * silence est un contre-témoin qui n'a jamais rien prouvé.
 */
export function lignesDeLaSectionZero(registre = 'docs/DECISIONS.md'): string[] {
  if (!existsSync(registre)) return [];
  const lignes = readFileSync(registre, 'utf8').split('\n');
  const debut = lignes.findIndex((l) => /^##\s*0\./.test(l));
  if (debut < 0) return [];
  const suite = lignes.slice(debut + 1);
  const fin = suite.findIndex((l) => /^##\s/.test(l));
  return (fin < 0 ? suite : suite.slice(0, fin)).filter((l) => l.trim().startsWith('|'));
}

/** Le mode `--prove` : la garde vue rougir, par famille PUIS par position. */
export function prouver(): number {
  const TEMOINS = [
    `// conforme à D3, arbitrage validé`,
    `la decision D11 supprime la valeur`, // hors guillemets : une reference qui ne resout pas
    `> selon A5, le suppléant est A2`, // postes mal ecrits : le schema exige deux chiffres
  ];
  const CONTRE_TEMOINS = [
    `jamais « conforme à D3 » — citer le contre-exemple est permis`,
    `fixtureRouge : citer 'conforme a D3' dans un commentaire`,
    `le poste A02 est troisième relecteur bloquant`,
    `une flotte de A40 agents`,
    `sauvegardes R2 de Cloudflare, préfixe \`partners/\``,
    `l'offre s'adresse au B2B`,
    `art. D.8222-5 du code du travail`,
    `la décision HYP-W6-BIS s'applique`,
    `W13 a tranché la publication`,
    `DEC-INT-001 : instance dédiée`,
  ];

  for (const [i, t] of TEMOINS.entries()) {
    if (fautesDeLigne(t, 'témoin', i, MOTIF_NU).length === 0) {
      console.error(`❌ Le témoin « ${t} » n'a PAS fait rougir la garde.`);
      return 1;
    }
  }
  for (const [i, c] of CONTRE_TEMOINS.entries()) {
    const f = fautesDeLigne(c, 'contre-témoin', i, MOTIF_NU);
    if (f.length > 0) {
      console.error(`❌ Faux positif : « ${c} » a rougi. La garde est trop large.\n   ${f[0]!.message}`);
      return 1;
    }
  }
  console.log(
    `✅ ${TEMOINS.length} témoins rougissent, ${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
  );

  // ── GOV-025 : la preuve PAR POSITION, et le rejeu contre la version CASSÉE ──────────────────
  const sansTemoin = POSITIONS_LIMITES.filter((p) => !TEMOINS_LIMITES.some((t) => t.position === p));
  if (sansTemoin.length > 0) {
    console.error(`❌ Position(s) limite sans témoin : ${sansTemoin.join(', ')}.`);
    return 1;
  }
  for (const [i, t] of TEMOINS_LIMITES.entries()) {
    if (fautesDeLigne(t.texte, `témoin:${t.position}`, i, MOTIF_NU).length === 0) {
      console.error(`❌ Position « ${t.position} » : le témoin « ${t.texte} » n'a PAS fait rougir la garde.`);
      return 1;
    }
    const vuParLAncienne =
      fautesDeLigne(t.texte, `témoin:${t.position}`, i, MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE).length > 0;
    if (t.manqueParLAncienne && vuParLAncienne) {
      console.error(
        `❌ Position « ${t.position} » : témoin annoncé aveugle avant GOV-025, mais l'ancienne lookahead ` +
          `le voyait déjà. Il n'exerce donc pas le défaut — c'est exactement le témoin qui verdit sur le ` +
          `texte qu'il condamne.`
      );
      return 1;
    }
    if (!t.manqueParLAncienne && !vuParLAncienne) {
      console.error(
        `❌ Position « ${t.position} » : témoin annoncé vu par l'ancienne lookahead, or elle le MANQUAIT. ` +
          `La cécité corrigée par GOV-025 est plus large que documentée — corriger l'étiquette.`
      );
      return 1;
    }
  }
  const aveugles = TEMOINS_LIMITES.filter((t) => t.manqueParLAncienne);
  if (aveugles.length === 0) {
    console.error(
      `❌ Aucun témoin ne manquait à l'ancienne lookahead : la preuve n'exerce pas le défaut de GOV-025.`
    );
    return 1;
  }

  const sectionZero = lignesDeLaSectionZero();
  if (sectionZero.length === 0) {
    console.error(
      `❌ La §0 de docs/DECISIONS.md est introuvable ou vide : le contre-témoin le plus exigeant a été sauté.`
    );
    return 1;
  }
  const contres = [...CONTRE_TEMOINS_LIMITES, ...sectionZero];
  for (const [i, c] of contres.entries()) {
    const f = fautesDeLigne(c, 'contre-témoin:position', i, MOTIF_NU);
    if (f.length > 0) {
      console.error(`❌ Faux positif à une position limite : « ${c} » a rougi.\n   ${f[0]!.message}`);
      return 1;
    }
  }

  console.log(
    `✅ ${TEMOINS_LIMITES.length} témoins de position rougissent, dont ${aveugles.length} que l'ancienne ` +
      `lookahead MANQUAIT ; ${contres.length} contre-témoins de position restent verts (dont les ` +
      `${sectionZero.length} lignes de la §0 du registre) — preuve faite.`
  );
  console.log(`   ${POSITIONS_LIMITES.map((p) => '• ' + p).join('\n   ')}`);
  return 0;
}

function controler(): number {
  const fautes = analyser(fichiersSuivis());
  if (fautes.length === 0) {
    console.log('✅ gov:identifiants — aucun identifiant nu dans les fichiers suivis.');
    return 0;
  }
  console.error(`❌ gov:identifiants — ${fautes.length} identifiant(s) nu(s) (REQ-GOV-003) :\n`);
  fautes.slice(0, 25).forEach((f) => console.error('   ' + f.message));
  if (fautes.length > 25) console.error(`   … et ${fautes.length - 25} autre(s).`);
  return 1;
}

// ── ligne de commande ────────────────────────────────────────────────────────────────────────
// Gardée : ce module est IMPORTÉ par son test. Sans ce test d'entrée, l'import déclencherait le
// contrôle et son `process.exit`, et la suite mourrait au chargement (même patron que gov-depot.ts).
const APPELE_DIRECTEMENT = /gov-identifiants\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  process.exit(process.argv.includes('--prove') ? prouver() : controler());
}
