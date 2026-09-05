/**
 * gov-pr.ts — la garde du gabarit de PR et de la charte des agents (GOV-007,
 * REQ-GOV-010 / REQ-GOV-011 / REQ-GOV-012 / REQ-GOV-013).
 *
 * USAGE : pnpm gov:pr                 structure du gabarit, de CODEOWNERS et de la charte ;
 *                                     plus la PR elle-même si GitHub Actions en fournit une
 *         pnpm gov:pr --pr <numero>   tout ce qui précède, REVUES COMPRISES (`GET /pulls/n/reviews`) —
 *                                     c'est la commande que A04 lance AVANT de fusionner
 *         pnpm gov:pr --apres-fusion <n>  la 8ᵉ case en plus : l'atterrissage attesté (après fusion)
 *         pnpm gov:pr --prove         un témoin par famille de règle, des contre-témoins verts
 *
 * CE QU'ELLE TIENT, ET POURQUOI CHAQUE FAMILLE EXISTE.
 *
 *   — les MARQUEURS du gabarit, une occurrence chacun. Un commentaire HTML ne s'imbrique pas :
 *     un en-tête qui écrit les délimiteurs à l'intérieur de lui-même se referme au premier, et
 *     chaque marqueur se retrouve en double. La garde ancre alors sur la mauvaise occurrence et
 *     refuse une PR correctement remplie — ou en accepte une qui ne l'est pas ;
 *   — les HUIT cases entre `dod:debut` et `dod:fin`, et AUCUNE case ailleurs : la règle maison
 *     est un champ, pas une case, sans quoi le compte de REQ-GOV-013 en trouve neuf ;
 *   — `.github/CODEOWNERS` ne nomme AUCUN code de poste : GitHub ne résout pas `@A02`, marque
 *     « Unknown owner » et ignore la règle entière. Un fichier plein de codes de poste est
 *     inopérant, et c'est invisible à l'œil ;
 *   — la charte porte une ligne PAR FICHE de `.claude/agents/`, ni plus ni moins (RM-01) ;
 *   — l'ordinal de la lentille de l'architecte est DÉRIVÉ de sa fiche : si la fiche dit qu'il
 *     REMPLACE la troisième lentille et que la charte en ajoute une quatrième, la vue contredit
 *     sa source, et le compte des avis exigés change sans que personne ne l'ait décidé ;
 *   — sur la PR : le titre, les champs remplis, l'auteur qui n'est pas son propre relecteur, les
 *     huit cases cochées, le bloc ROUGE/VERT dès qu'une garde est introduite, la section Attaque
 *     sur une tâche `sensible`, le label de chaque chemin réservé (§7 de la charte, LU ICI) ;
 *   — avec les revues : trois lentilles distinctes, l'avis de mutation, et l'approbation de A02
 *     sur une PR `schema`.
 *
 * CE QU'ELLE NE PEUT PAS TENIR EN CI, ET QUI EST DIT PLUTÔT QUE CACHÉ. L'événement
 * `pull_request` ne porte AUCUNE revue : elles n'existent pas encore quand la CI tourne. Une
 * gate qui les exigerait serait rouge sur toute PR non relue — donc désarmée en pratique. Les
 * familles de revue ne sont donc évaluées que sous `--pr <numero>`, et la sortie DIT toujours
 * lesquelles ont été évaluées. C'est une dépendance à un geste humain (A04 avant la fusion),
 * pas une garde : `docs/CHARTE-AGENTS.md` §8 l'écrit noir sur blanc.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { LIVREE as LIVREE_DERIVEE, verifierExhaustivite } from '../lot/avancement';
import {
  ETAT_APPROUVE,
  ETAT_COMMENTE,
  cheminsSchema,
  lentillesExigees,
  lireRevues,
  tachesSchemaDeLaPr,
  touche,
  toucheSchema,
  tachesDeLaPr,
  type RevueBrute,
} from '../lot/revues';

const CHEMIN_GABARIT = '.github/PULL_REQUEST_TEMPLATE.md';
const CHEMIN_CODEOWNERS = '.github/CODEOWNERS';
const CHEMIN_CHARTE = 'docs/CHARTE-AGENTS.md';
const CHEMIN_FICHES = '.claude/agents';
const CHEMIN_FICHE_ARCHITECTE = '.claude/agents/architecte.md';
const CHEMIN_TACHES = 'docs/tasks.json';

/** Les marqueurs d'ancrage du gabarit. Chacun EXACTEMENT une fois. */
const MARQUEURS = [
  'dod:debut', 'dod:fin',
  'rouge-vert:debut', 'rouge-vert:fin',
  'attaque:debut', 'attaque:fin',
  'regle-maison:debut', 'regle-maison:fin',
];

/** Les champs que le corps d'une PR doit porter, remplis. */
const CHAMPS = ['Auteur:', 'Relecteur:', 'Couvre:', 'Rouge constaté par:', 'Règle maison appliquée:'];

const NB_CASES = 8;
/** Les avis qui ne comptent pour rien, et POURQUOI — dits en sortie, jamais comptés en fautes. */
const AVIS_ECARTES: string[] = [];
/** Le saut de ligne, nomme : les fixtures decoupent des corps de PR. */
const SAUT = String.fromCharCode(10);
const TYPES_DE_TITRE = ['feat', 'fix', 'test', 'docs', 'chore', 'refactor', 'ci', 'perf'];
const ORDINAUX = ['première', 'deuxième', 'troisième', 'quatrième', 'cinquième'];
// Les chemins qui exigent la lentille de schéma ne sont plus RECOPIÉS ici : ils se dérivent du §7
// de la charte, par le lecteur unique — la même source que celle qui fait exiger le label (RM-01).
/** Les zones que REQ-GOV-011 place sous revue adversariale documentée. */
const ZONES_SENSIBLES = ['commissions/', 'attributions/', 'auth/', 'espace/'];
/** Ce dont l'introduction impose le bloc ROUGE/VERT (REQ-GOV-012) : un test, une garde, un workflow. */
const INTRODUIT_UNE_GARDE = (f: string) =>
  /\.spec\.ts$/.test(f) || f.startsWith('scripts/gates/') || f.startsWith('.github/workflows/');

type Pr = {
  /**
   * Le numéro de la PR, quand on le connaît. Il n'est PAS décoratif : c'est lui qui permet de
   * dériver l'ENSEMBLE des tâches de la PR au lieu de la seule tâche que le titre nomme — la
   * divergence d'entrée mesurée le 2026-09-05 (voir `tachesDeLaPr` dans `scripts/lot/revues.ts`).
   */
  numero?: number | null;
  titre: string;
  corps: string;
  labels: string[];
  fichiers: string[];
  /** La réponse de `GET /repos/{owner}/{repo}/pulls/{n}/reviews`, telle que GitHub la sert. */
  revues: RevueBrute[] | null;
  /** Le sha de tête, sous `--pr <n>` seulement : le diff approuvé doit être le diff fusionné. */
  tete?: string | null;
  /**
   * Vrai seulement sous `--apres-fusion <n>`, la commande qu'A04 lance APRES l'atterrissage.
   * C'est le seul moment ou la huitieme case peut etre vraie : elle atteste la fusion.
   */
  apresFusion?: boolean;
};
type Tache = { id: string; sensible: string[]; schema: boolean; pr: number | null };
type Depot = { gabarit: string; codeowners: string; charte: string; fiches: string[]; architecte: string; taches: Tache[] };
/**
 * LA PHASE COURANTE — la plus petite phase qui porte encore une tâche non livrée.
 *
 * Dérivée de `docs/tasks.json`, pas lue dans `docs/PLAN-STATE.md` : PLAN-STATE est lui-même une
 * VUE de ce fichier, et une garde qui lit une vue rougit le jour où quelqu'un oublie de la
 * régénérer — pour une raison qui n'est pas la faute qu'elle cherche (RM-01).
 */
// L'ensemble « livrée » ne s'écrit plus ici : il se DÉRIVE du barème unique de
// `scripts/lot/avancement.ts`, dont l'exhaustivité est confrontée à l'enum `statut` du schéma.
// Il était recopié dans CINQ fichiers — relevé par la lentille `schema` sur la PR 28, dans la
// PR même qui écrivait la règle l'interdisant (RM-04, `docs/GLOSSAIRE.md` §4 : « deux copies du
// même vocabulaire divergent toujours »). Un dixième statut faisait rougir `gov:inventaire` et
// laissait les cinq copies se taire en se trompant.
const LIVREES = LIVREE_DERIVEE;

// Une garde qui lit un statut ne tourne pas sur un barème incomplet sans le dire.
{
  const ecarts = verifierExhaustivite();
  if (ecarts.length > 0) {
    console.error("❌ scripts/lot/avancement.ts a dérivé de scripts/lot/tasks.schema.json :");
    ecarts.forEach((e) => console.error("   " + e));
    process.exit(1);
  }
}
function phaseCourante(): number {
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: { phase: number; statut: string }[];
  };
  const restantes = doc.taches.filter((t) => !LIVREES.has(t.statut)).map((t) => t.phase);
  return restantes.length === 0 ? Math.max(...doc.taches.map((t) => t.phase)) : Math.min(...restantes);
}

type Faute = { famille: string; message: string };

const FAMILLES = [
  // structure — toujours évaluées
  'marqueur_hors_norme',
  'dod_hors_bloc',
  'champ_gabarit_absent',
  'codeowners_non_resolvable',
  'charte_poste_manquant',
  'charte_lentille_non_derivee',
  // la PR — évaluées dès qu'une PR est fournie
  'titre_non_conforme',
  'relecteur_est_auteur',
  'dod_incomplete',
  'rouge_vert_absent',
  'attaque_absente',
  'fichier_reserve_sans_label',
  'schema_sans_label',
  // la PR — évaluées seulement avec les revues (`--pr <numero>`)
  'lentilles_manquantes',
  'lentille_en_refus',
  'lentille_perimee',
  'dod_atterrissage_non_atteste',
  'phase_gelee',
  'schema_sans_approbation',
  'dod_non_cochee',
];

// ── lecture du gabarit et de la charte ───────────────────────────────────────

function occurrences(texte: string, aiguille: string): number {
  return texte.split(aiguille).length - 1;
}

function bloc(texte: string, nom: string): string | null {
  const ouvre = `<!-- ${nom}:debut -->`;
  const ferme = `<!-- ${nom}:fin -->`;
  const d = texte.indexOf(ouvre);
  const f = texte.indexOf(ferme);
  if (d < 0 || f < 0 || f < d) return null;
  return texte.slice(d + ouvre.length, f);
}

function section(texte: string, debut: string, fin: string): string {
  const d = texte.indexOf(debut);
  if (d < 0) return '';
  const f = texte.indexOf(fin, d + debut.length);
  return texte.slice(d, f < 0 ? undefined : f);
}

/** Une ligne du tableau des postes : `| A01 | \`gardien-spec\` | … |`. */
function postesDeLaCharte(charte: string): { code: string; fiche: string }[] {
  const out: { code: string; fiche: string }[] = [];
  for (const ligne of section(charte, '## 2.', '## 3.').split('\n')) {
    const m = /^\|\s*(A\d{2})\s*\|\s*`([a-z0-9-]+)`\s*\|/.exec(ligne);
    if (m) out.push({ code: m[1]!, fiche: m[2]! });
  }
  return out;
}

/**
 * Le tableau des chemins réservés du §7, LU dans la charte : la règle et sa vue sont le même
 * texte. Une ligne dont la colonne « label » vaut `—` est une ligne qu'AUCUN label n'ouvre
 * (`.claude/**` : aucun agent en session n'a le droit de l'écrire) ; elle ne se contrôle pas ici.
 * Les chemins du schéma portent le label `schema` : ils ont leur propre famille, avec
 * l'approbation qui va avec, et sont donc écartés de cette boucle.
 */
function cheminsReserves(charte: string): { chemins: string[]; label: string }[] {
  const out: { chemins: string[]; label: string }[] = [];
  for (const ligne of section(charte, '## 7.', '## 8.').split('\n')) {
    if (!ligne.startsWith('|')) continue;
    const cellules = ligne.split('|').slice(1, -1).map((c) => c.trim());
    if (cellules.length < 4) continue;
    const label = cellules[2]!.replace(/`/g, '').trim();
    if (!/^(role:[a-z-]+|schema)$/.test(label)) continue;
    if (label === 'schema') continue;
    const chemins = cellules[0]!
      .split(',')
      .map((c) => c.replace(/`/g, '').replace(/\(.*\)/g, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);
    if (chemins.length > 0) out.push({ chemins, label });
  }
  return out;
}

function ordinalDeLaLentille(texte: string): string | null {
  const m = new RegExp(`\\b(${ORDINAUX.join('|')})\\s+lentille`, 'i').exec(texte);
  return m ? m[1]!.toLowerCase() : null;
}

// `touche()` et la lecture de l'en-tête d'une revue vivent dans le lecteur unique
// (`scripts/lot/revues.ts`), importé aussi par `scripts/lot/corps-de-pr.ts`. Les réécrire ici
// ferait revenir la seconde lecture que cette PR retire.

// ── le contrôle ──────────────────────────────────────────────────────────────

function controler(depot: Depot, pr: Pr | null): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });
  // La §7 de la charte est la source ; ces chemins n'existent plus en dur dans ce fichier (RM-01).
  const CHEMINS_SCHEMA = cheminsSchema(depot.charte);
  AVIS_ECARTES.length = 0;

  // ---- structure du gabarit -------------------------------------------------
  for (const marqueur of MARQUEURS) {
    const n = occurrences(depot.gabarit, `<!-- ${marqueur} -->`);
    if (n !== 1) {
      ajouter(
        'marqueur_hors_norme',
        `${CHEMIN_GABARIT} — le marqueur « ${marqueur} » apparaît ${n} fois, il en faut exactement une. ` +
          `Les commentaires HTML ne s'imbriquent pas : ne jamais écrire un délimiteur à l'intérieur ` +
          `de l'en-tête, le nommer sans ses délimiteurs.`
      );
    }
  }

  const blocDod = bloc(depot.gabarit, 'dod');
  const casesDedans = blocDod === null ? 0 : occurrences(blocDod, '- [ ]');
  const casesTotal = occurrences(depot.gabarit, '- [ ]') + occurrences(depot.gabarit, '- [x]');
  if (blocDod === null || casesDedans !== NB_CASES) {
    ajouter(
      'dod_hors_bloc',
      `${CHEMIN_GABARIT} — ${casesDedans} case(s) entre les marqueurs dod, il en faut ${NB_CASES} (REQ-GOV-013).`
    );
  } else if (casesTotal !== NB_CASES) {
    ajouter(
      'dod_hors_bloc',
      `${CHEMIN_GABARIT} — ${casesTotal} case(s) à cocher dans le fichier pour ${casesDedans} entre les ` +
        `marqueurs dod : une case hors du bloc fausse le compte. La règle maison est un CHAMP, pas une case.`
    );
  }

  for (const champ of CHAMPS) {
    if (!depot.gabarit.includes(champ)) {
      ajouter('champ_gabarit_absent', `${CHEMIN_GABARIT} — le champ « ${champ} » a disparu du gabarit.`);
    }
  }

  // ---- CODEOWNERS -----------------------------------------------------------
  const reglesCo: { chemin: string; proprietaires: string[] }[] = [];
  for (const ligne of depot.codeowners.split('\n')) {
    const nue = ligne.trim();
    if (nue.length === 0 || nue.startsWith('#')) continue;
    const [chemin, ...proprietaires] = nue.split(/\s+/);
    if (!chemin) continue;
    reglesCo.push({ chemin, proprietaires });
  }
  for (const r of reglesCo) {
    for (const p of r.proprietaires) {
      if (/^@A\d{2}$/.test(p)) {
        ajouter(
          'codeowners_non_resolvable',
          `${CHEMIN_CODEOWNERS} — « ${p} » sur ${r.chemin} : GitHub ne résout pas un code de poste, ` +
            `marque « Unknown owner » et IGNORE la règle entière. Nomme un compte, et mets le code de ` +
            `poste en commentaire au-dessus du chemin.`
        );
      }
    }
    if (r.proprietaires.length === 0) {
      ajouter('codeowners_non_resolvable', `${CHEMIN_CODEOWNERS} — ${r.chemin} n'a aucun propriétaire.`);
    }
  }
  for (const exige of CHEMINS_SCHEMA) {
    if (!reglesCo.some((r) => r.chemin.replace(/^\//, '') === exige)) {
      ajouter(
        'codeowners_non_resolvable',
        `${CHEMIN_CODEOWNERS} — aucune règle pour ${exige} : l'acceptation de GOV-007 l'exige.`
      );
    }
  }

  // ---- la charte est dérivée des fiches (RM-01) ------------------------------
  const postes = postesDeLaCharte(depot.charte);
  const codes = new Set<string>();
  for (const p of postes) {
    if (codes.has(p.code)) ajouter('charte_poste_manquant', `${CHEMIN_CHARTE} — le code ${p.code} est donné deux fois.`);
    codes.add(p.code);
    if (!depot.fiches.includes(p.fiche)) {
      ajouter('charte_poste_manquant', `${CHEMIN_CHARTE} — la ligne « ${p.fiche} » ne correspond à aucune fiche de ${CHEMIN_FICHES}/.`);
    }
  }
  for (const fiche of depot.fiches) {
    if (!postes.some((p) => p.fiche === fiche)) {
      ajouter(
        'charte_poste_manquant',
        `${CHEMIN_CHARTE} — la fiche ${fiche} n'a aucune ligne au tableau des postes : un poste sans code ` +
          `ne peut être ni auteur, ni relecteur, ni propriétaire d'un chemin réservé.`
      );
    }
  }

  const attendu = ordinalDeLaLentille(depot.architecte);
  if (attendu === null) {
    ajouter('charte_lentille_non_derivee', `${CHEMIN_FICHE_ARCHITECTE} ne dit plus quelle lentille l'architecte tient : la charte ne peut plus en dériver.`);
  } else {
    const motif = new RegExp(`\\b(${ORDINAUX.join('|')})\\s+lentille`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = motif.exec(depot.charte)) !== null) {
      if (m[1]!.toLowerCase() !== attendu) {
        ajouter(
          'charte_lentille_non_derivee',
          `${CHEMIN_CHARTE} — « ${m[1]} lentille » alors que ${CHEMIN_FICHE_ARCHITECTE} écrit « ${attendu} lentille ». ` +
            `L'architecte REMPLACE une lentille, il n'en ajoute pas une : la vue contredit sa source, et le ` +
            `nombre d'avis exigés change sans que personne ne l'ait décidé.`
        );
      }
    }
  }

  if (pr === null) return fautes;

  // ---- la PR ----------------------------------------------------------------
  const titre = /^([a-z]+)\(([A-Z][A-Z0-9]*-[A-Za-z0-9-]+)\):\s+\S/.exec(pr.titre);
  const tache = titre ? depot.taches.find((t) => t.id === titre[2]) : undefined;
  if (!titre || !TYPES_DE_TITRE.includes(titre[1]!)) {
    ajouter(
      'titre_non_conforme',
      `Titre « ${pr.titre} » — attendu \`<type>(<ID-TÂCHE>): <titre>\` avec type parmi ` +
        `${TYPES_DE_TITRE.join(', ')} (docs/CONVENTIONS.md §5).`
    );
  } else if (!tache) {
    ajouter('titre_non_conforme', `Titre « ${pr.titre} » — ${titre[2]} n'est pas une tâche de ${CHEMIN_TACHES}.`);
  }

  const auteur = /^Auteur:\s*(A\d{2})\s*$/m.exec(pr.corps);
  const ligneRelecteur = /^Relecteur:\s*(.+)$/m.exec(pr.corps);
  const couvre = /^Couvre:\s*(REQ-[A-Z]+-\d+.*)$/m.exec(pr.corps);
  if (!auteur) ajouter('champ_gabarit_absent', 'Corps de la PR — `Auteur:` absent ou non rempli (attendu : un code `A` suivi de deux chiffres).');
  if (!ligneRelecteur) ajouter('champ_gabarit_absent', 'Corps de la PR — `Relecteur:` absent.');
  if (!couvre) ajouter('champ_gabarit_absent', 'Corps de la PR — `Couvre:` ne cite aucune exigence.');

  const lentillesDeclarees: string[] = ligneRelecteur
    ? (ligneRelecteur[1]!.match(/exactitude|securite|simplicite|schema|mutation/g) ?? [])
    : [];
  if (auteur && ligneRelecteur && new RegExp(`\\b${auteur[1]}\\b`).test(ligneRelecteur[1]!)) {
    ajouter(
      'relecteur_est_auteur',
      `Corps de la PR — l'auteur ${auteur[1]} figure dans \`Relecteur:\` (REQ-GOV-011). Un agent ne relit ` +
        `jamais son propre code.`
    );
  }

  const blocDodPr = bloc(pr.corps, 'dod');
  const cochees = blocDodPr === null ? 0 : occurrences(blocDodPr, '- [x]');
  const vides = blocDodPr === null ? 0 : occurrences(blocDodPr, '- [ ]');
  if (blocDodPr === null || cochees + vides !== NB_CASES) {
    ajouter(
      'dod_incomplete',
      `Corps de la PR — ${cochees + vides} case(s) entre les marqueurs dod ; REQ-GOV-013 en exige ` +
        `${NB_CASES}. Le gabarit a été amputé ou les marqueurs sont absents.`
    );
  } else if (pr.revues !== null) {
    // Jugé seulement sous `--pr <numero>` / `--apres-fusion <n>` : les revues n'existent pas à
    // l'événement `pull_request`, et `gate-a` est le check requis de `main`.
    //
    // LA HUITIÈME CASE EST À PART, et c'est un défaut de conception qu'on corrige ici. Elle
    // atteste « Fusionnée par A04 et atterrissage vérifié » : elle ne peut pas être vraie AVANT
    // la fusion. Or `--pr <n>` est précisément la commande d'avant-fusion. L'exiger là ne
    // laissait que deux issues, toutes deux mauvaises : refuser toute PR, ou cocher une
    // attestation fausse. Mesuré : la PR 26 a été fusionnée avec la huitième case vide et
    // ZÉRO revue — la garde n'a jamais été verte, et on a appris à passer outre.
    //
    // Les sept premières se jugent avant la fusion ; la huitième sous `--apres-fusion <n>`.
    // On lit les cases DANS L'ORDRE : un compte de sept ne dit pas LESQUELLES sont cochées.
    const cases = (blocDodPr.match(/^- \[[ x]\]/gm) ?? []);
    const avantFusion = cases.slice(0, NB_CASES - 1);
    const videsAvant = avantFusion.filter((c) => c === '- [ ]').length;
    if (videsAvant > 0) {
      ajouter(
        'dod_non_cochee',
        `Corps de la PR — ${videsAvant} case(s) vide(s) parmi les ${NB_CASES - 1} premières entre les ` +
          `marqueurs dod ; REQ-GOV-013 les exige avant la fusion. A04 refuse la PR. ` +
          `(La ${NB_CASES}ᵉ atteste la fusion : elle se contrôle par \`--apres-fusion\`.)`
      );
    }
    if (pr.apresFusion === true && cases[NB_CASES - 1] !== '- [x]') {
      ajouter(
        'dod_atterrissage_non_atteste',
        `Corps de la PR — la ${NB_CASES}ᵉ case « fusionnée par A04 et atterrissage vérifié » n'est ` +
          `pas cochée alors que la PR est fusionnée. Tant qu'elle est vide, personne n'a attesté ` +
          `avoir lu le sha de build : un run vert n'est pas un atterrissage (RM-09).`
      );
    }
  }

  const blocRouge = bloc(pr.corps, 'rouge-vert');
  if (pr.fichiers.some(INTRODUIT_UNE_GARDE)) {
    const rouge = blocRouge === null ? null : /^ROUGE\s*:\s*(.+)$/m.exec(blocRouge);
    const constate = blocRouge === null ? null : /^Rouge constaté par:\s*(A\d{2})\s*$/m.exec(blocRouge);
    if (!rouge || rouge[1]!.trim().length < 20 || rouge[1]!.trim().startsWith('(')) {
      ajouter(
        'rouge_vert_absent',
        `Corps de la PR — cette PR introduit une garde (${pr.fichiers.filter(INTRODUIT_UNE_GARDE).join(', ')}) ` +
          `et le bloc ROUGE/VERT est vide ou laissé au gabarit. REQ-GOV-012 et RM-02 : une garde ne vaut ` +
          `que si on l'a vue rougir, et le message se colle verbatim.`
      );
    }
    if (!constate) {
      ajouter(
        'rouge_vert_absent',
        `Corps de la PR — \`Rouge constaté par:\` n'est pas rempli. Si l'auteur n'a pas d'outil ` +
          `d'exécution (A07 n'a pas Bash), c'est A10 qui produit le rouge (docs/CHARTE-AGENTS.md §6).`
      );
    }
  }

  const zoneSensible = pr.fichiers.some((f) => ZONES_SENSIBLES.some((z) => f.startsWith(z)));
  // L'ENSEMBLE des taches de la PR, pas la seule que le titre nomme. Mesure du 2026-09-05 sur la
  // PR 31 : GOV-024 (titre) porte sensible: [], mais GOV-006 porte ["attribution"] et CPL-T01
  // ["argent","attribution"] — la section Attaque n'etait donc exigee par PERSONNE sur une PR
  // qui porte deux taches sensibles. Meme divergence d'entree que tachesSchema, un champ plus
  // loin : le lecteur etait unique, son entree ne l'etait pas.
  const tachesSensibles = tachesDeLaPr(depot.taches, pr.numero ?? null, titre ? titre[2]! : null);
  const attaqueExigee = zoneSensible || tachesSensibles.some((t) => t.sensible.length > 0);
  if (attaqueExigee) {
    const blocAttaque = (bloc(pr.corps, 'attaque') ?? '').trim();
    if (blocAttaque.length === 0 || /sans objet/i.test(blocAttaque)) {
      ajouter(
        'attaque_absente',
        `Corps de la PR — section « Attaque » exigée (${
          zoneSensible
            ? 'zone sensible touchée'
            : `tâche(s) sensible(s) : ${tachesSensibles
                .filter((t) => t.sensible.length > 0)
                .map((t) => `${t.id} (${t.sensible.join(', ')})`)
                .join(' · ')}`
        }) ` +
          `et laissée vide. REQ-GOV-011 : scénario joué, résultat, qui l'a joué.`
      );
    }
  }

  for (const reserve of cheminsReserves(depot.charte)) {
    const touches = reserve.chemins.filter((c) => touche(c, pr.fichiers));
    if (touches.length > 0 && !pr.labels.includes(reserve.label)) {
      ajouter(
        'fichier_reserve_sans_label',
        `La PR modifie ${touches.join(', ')} sans le label \`${reserve.label}\` (REQ-GOV-010, ` +
          `docs/CHARTE-AGENTS.md §7). Labels portés : ${pr.labels.join(', ') || '(aucun)'}.`
      );
    }
  }

  // TROIS SIGNAUX, LE PLUS STRICT GAGNE — et c'est le lecteur unique qui les pèse, pour que la
  // garde et le composeur du corps de PR ne puissent plus diverger. Le label seul est le plus
  // faible des trois : il se pose à la main, donc il s'oublie à la main.
  const fichiersDeSchema = CHEMINS_SCHEMA.some((c) => touche(c, pr.fichiers));
  const schemaExige = toucheSchema({
    fichiers: pr.fichiers,
    labels: pr.labels,
    // L'ENSEMBLE des tâches de la PR, pas la seule que le titre nomme. Voir `tachesDeLaPr` :
    // les deux appelants du lecteur unique composaient chacun le sien, et ils divergeaient.
    tachesSchema: tachesSchemaDeLaPr(depot.taches, pr.numero ?? null, titre ? titre[2]! : null),
    charte: depot.charte,
  });
  if (fichiersDeSchema && !pr.labels.includes('schema')) {
    ajouter(
      'schema_sans_label',
      `La PR touche ${CHEMINS_SCHEMA.filter((c) => touche(c, pr.fichiers)).join(', ')} sans le label ` +
        `\`schema\` : sans lui, l'approbation bloquante de A02 n'est demandée par personne ` +
        `(docs/CONVENTIONS.md §5).`
    );
  }

  // REQ-GOV-027 — le périmètre est gelé par phase. Contrôlé AVANT le retour anticipé sur les
  // revues : un label de phase existe dès l'ouverture de la PR, et c'est justement à ce
  // moment-là qu'il faut refuser du travail de la phase suivante, pas après l'avoir relu.
  const labelPhase = pr.labels.map((l) => /^phase:(-?\d+)$/.exec(l)).find((m) => m !== null);
  if (labelPhase) {
    const declaree = Number(labelPhase[1]);
    const courante = phaseCourante();
    if (declaree > courante) {
      ajouter(
        'phase_gelee',
        `La PR porte \`phase:${declaree}\` alors que la phase courante est ${courante}, qui n'est ` +
          `pas close : docs/tasks.json y porte encore des tâches non livrées. REQ-GOV-027 — le ` +
          `périmètre est gelé par phase, et une phase se ferme avant que la suivante ne s'ouvre. ` +
          `Sans ce gel, la phase 1 démarre pendant que la 0 traîne, et les deux restent ouvertes ` +
          `jusqu'à la fin.`
      );
    }
  }

  if (pr.revues === null) return fautes;

  // ---- les revues (seulement sous `--pr <numero>`) ---------------------------
  /**
   * LA LECTURE DES REVUES N'EST PLUS ÉCRITE ICI. Elle est dans `scripts/lot/revues.ts`, importée
   * aussi par `scripts/lot/corps-de-pr.ts` — qui COCHE la case de DoD « Relecteur ≠ auteur » du
   * corps publié. Les deux lectures divergeaient sur quatre points, tous dans le sens permissif :
   * aucune authentification de l'auteur de la revue, un numéro de poste confronté à rien, un
   * discriminant `schema` tiré du seul label, et une clé de « dernier verdict » différente.
   * Le module documente chacun ; ce fichier ne fait plus que lui poser la question.
   */
  const lecture = lireRevues({
    revues: pr.revues,
    schema: schemaExige,
    tete: pr.tete ?? null,
    auteurPoste: auteur ? auteur[1]! : null,
  });
  const lues = lecture.verdicts.filter((v) => v.verdict === 'accepte');
  const exigees = [...lentillesExigees(schemaExige).trois];
  const manquantes = lecture.manquantes.filter((l) => l !== 'mutation');
  for (const v of lecture.refusees) {
    ajouter(
      'lentille_en_refus',
      `Revues — ${v.code} · ${v.lentille} rend « Verdict: refuse », et c'est son DERNIER mot. ` +
        `A04 ne fusionne pas sur un refus${v.lentille === 'securite' ? ' — et un refus de la lentille securite vaut veto (REQ-GOV-011)' : ''}.`
    );
  }
  // LES AVIS ÉCARTÉS SONT DITS, PAS COMPTÉS COMME FAUTES — et cette retenue est délibérée. Le
  // dépôt est PUBLIC : n'importe qui peut poser un commentaire. En faire une faute rendrait la
  // gate rouge pour un geste qui n'appartient pas au projet, sans aucun moyen de l'effacer — une
  // gate insatisfiable est une gate qu'on apprend à sauter. La propriété qui protège n'est pas
  // « un avis étranger rougit », c'est « un avis étranger ne COMPTE pour rien », et elle est
  // tenue par le lecteur. La sortie les nomme pour qu'A04 les voie (`--pr <n>`).
  for (const e of lecture.ecartees) {
    AVIS_ECARTES.push(
      `${e.motif} — compte « ${e.revue.compte || '?'} », association « ${e.revue.association || '?'} », ` +
        `état « ${e.revue.etat || '?'} »`
    );
  }
  if (manquantes.length > 0) {
    ajouter(
      'lentilles_manquantes',
      `Revues — lentille(s) manquante(s) : ${manquantes.join(', ')}. Chaque revue s'ouvre par ` +
        `« A<nn> · <lentille> » (docs/CHARTE-AGENTS.md §3). Vues : ${lues.map((x) => `${x.code} ${x.lentille}`).join(' / ') || '(aucune)'}.`
    );
  }
  for (const v of lecture.perimees) {
    ajouter(
      'lentille_perimee',
      `Revues — ${v.code} · ${v.lentille} a accepté sur ${v.commit.slice(0, 7)}, qui n'est pas la tête ` +
        `${(pr.tete ?? '').slice(0, 7)} : le diff approuvé n'est pas le diff qui sera fusionné (pas 5 du ` +
        `protocole de fusion). On retourne au pas 2.`
    );
  }
  if (lecture.manquantes.includes('mutation')) {
    ajouter(
      'lentilles_manquantes',
      `Revues — aucun avis « mutation » : A10 n'a pas dit que les gardes introduites avaient été vues ` +
        `rougir sur une mutation réelle (RM-02).`
    );
  }
  for (const v of lecture.auteurSeRelit) {
    ajouter(
      'relecteur_est_auteur',
      `Revues — l'auteur ${v.code} rend lui-même la lentille ${v.lentille} sur sa propre PR (REQ-GOV-011).`
    );
  }
  if (lentillesDeclarees.length > 0 && manquantes.length === 0) {
    // la ligne `Relecteur:` et les revues doivent parler des mêmes lentilles
    for (const l of exigees) {
      if (!lentillesDeclarees.includes(l)) {
        ajouter('lentilles_manquantes', `Corps de la PR — \`Relecteur:\` ne déclare pas la lentille ${l}, que les revues portent.`);
      }
    }
  }
  if (schemaExige) {
    const suppleants = auteur && auteur[1] === 'A02' ? ['A12', 'A14'] : ['A02'];
    if (!lues.some((x) => x.lentille === 'schema' && suppleants.includes(x.code))) {
      ajouter(
        'schema_sans_approbation',
        `Revues — PR \`schema\` sans approbation de ${suppleants.join(' ou ')} : l'architecte remplace la ` +
          `troisième lentille et son refus est bloquant (docs/CONVENTIONS.md §5, fiche architecte).`
      );
    }
  }

  return fautes;
}

// ── lecture du dépôt ─────────────────────────────────────────────────────────

function lireDepot(): Depot {
  for (const f of [CHEMIN_GABARIT, CHEMIN_CODEOWNERS, CHEMIN_CHARTE, CHEMIN_FICHE_ARCHITECTE, CHEMIN_TACHES]) {
    if (!existsSync(f)) {
      console.error(`❌ gov:pr — ${f} est introuvable.`);
      process.exit(1);
    }
  }
  const taches = (
    JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as {
      taches: { id: string; sensible?: string[]; schema?: boolean; pr?: number | null }[];
    }
  // ⚠️ `pr` FAIT PARTIE DE LA PROJECTION, et son absence a rendu DEUX correctifs inertes.
  // `tachesDeLaPr()` apparie sur `t.pr === <numero>` OU sur l identifiant du titre. Tant que la
  // projection laissait `pr` de cote, la moitie `numero` ne pouvait JAMAIS apparier : la
  // derivation unique se reduisait silencieusement a la seule tache du titre — exactement le
  // defaut qu elle etait censee fermer. Trouve le 2026-09-05 parce qu un temoin neuf refusait de
  // rougir : c est le temoin qui a revele que le correctif ne faisait rien, pas la relecture.
  ).taches.map((t) => ({
    id: t.id,
    sensible: t.sensible ?? [],
    schema: t.schema === true,
    pr: t.pr ?? null,
  }));
  return {
    gabarit: readFileSync(CHEMIN_GABARIT, 'utf8'),
    codeowners: readFileSync(CHEMIN_CODEOWNERS, 'utf8'),
    charte: readFileSync(CHEMIN_CHARTE, 'utf8'),
    architecte: readFileSync(CHEMIN_FICHE_ARCHITECTE, 'utf8'),
    fiches: readdirSync(CHEMIN_FICHES).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)),
    taches,
  };
}

/**
 * La PR, lue chez GitHub. La forme des champs vient des commandes, pas d'une invention.
 *
 * ⚠️ LES REVUES SE LISENT SUR L'INTERFACE REST, PAS SUR `gh pr view --json reviews`. Deux raisons,
 * toutes deux mesurées : la vue de l'outil ne sert PAS `commit_id` — sans lui le pas 5 du
 * protocole (« le diff approuvé est le diff fusionné ») n'est pas vérifiable — et
 * `scripts/lot/corps-de-pr.ts` lit déjà `GET /pulls/{n}/reviews`. Deux lectures de deux
 * endpoints différents, c'est exactement la divergence que cette PR retire : une seule source,
 * un seul lecteur.
 */
function prParGh(numero: string): Pr {
  const meta = JSON.parse(
    execFileSync('gh', ['pr', 'view', numero, '--json', 'title,body,labels,files,headRefOid'], {
      encoding: 'utf8',
      maxBuffer: 32e6,
    })
  ) as {
    title: string; body: string; headRefOid: string;
    labels: { name: string }[];
    files: { path: string }[];
  };
  const revues = JSON.parse(
    execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${numero}/reviews`, '--paginate'], {
      encoding: 'utf8',
      maxBuffer: 32e6,
    })
  ) as RevueBrute[];
  return {
    numero: Number(numero),
    titre: meta.title,
    corps: meta.body ?? '',
    labels: (meta.labels ?? []).map((l) => l.name),
    fichiers: (meta.files ?? []).map((f) => f.path),
    revues,
    tete: meta.headRefOid ?? null,
  };
}

/** L'événement GitHub Actions : titre, corps, labels. Les revues n'y sont PAS. */
function prParEvenement(): Pr | null {
  const chemin = process.env['GITHUB_EVENT_PATH'];
  if (!chemin || !existsSync(chemin)) return null;
  const ev = JSON.parse(readFileSync(chemin, 'utf8')) as {
    pull_request?: { number?: number; title: string; body: string | null; labels: { name: string }[]; base: { sha: string }; head: { sha: string } };
  };
  if (!ev.pull_request) return null;
  let fichiers: string[] = [];
  try {
    fichiers = execFileSync('git', ['diff', '--name-only', `${ev.pull_request.base.sha}...${ev.pull_request.head.sha}`], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    console.error(
      `❌ gov:pr — impossible de lister les fichiers de la PR (\`git diff\`). Le job doit poser ` +
        `\`fetch-depth: 0\` sur actions/checkout, sinon la moitié des familles ne contrôle rien.`
    );
    process.exit(1);
  }
  return {
    numero: ev.pull_request.number ?? null,
    titre: ev.pull_request.title,
    corps: ev.pull_request.body ?? '',
    labels: ev.pull_request.labels.map((l) => l.name),
    fichiers,
    revues: null,
  };
}

// ── mode --prove ─────────────────────────────────────────────────────────────

/**
 * La fixture de PR est CONSTRUITE À PARTIR DU GABARIT LIVRÉ (RM-03) : si le gabarit change, la
 * fixture change avec lui. `remplacer` VÉRIFIE que la cible existe au lieu de la fabriquer
 * (RM-11) — un remplissage qui « complète » silencieusement rendrait la preuve fausse le jour où
 * un champ disparaîtrait du gabarit.
 * Source : `.github/PULL_REQUEST_TEMPLATE.md`, livré par GOV-007.
 */
function remplacer(texte: string, cible: string, valeur: string): string {
  if (!texte.includes(cible)) {
    console.error(`❌ gov:pr --prove — le gabarit ne contient plus « ${cible} » : la fixture ne peut pas en être dérivée.`);
    process.exit(1);
  }
  return texte.split(cible).join(valeur);
}

function remplacerBloc(corps: string, nom: string, contenu: string): string {
  const ouvre = `<!-- ${nom}:debut -->`;
  const ferme = `<!-- ${nom}:fin -->`;
  const d = corps.indexOf(ouvre);
  const f = corps.indexOf(ferme);
  if (d < 0 || f < 0) {
    console.error(`❌ gov:pr --prove — bloc « ${nom} » introuvable dans la fixture.`);
    process.exit(1);
  }
  return corps.slice(0, d + ouvre.length) + `\n${contenu}\n` + corps.slice(f);
}

function corpsRempli(gabarit: string): string {
  let c = gabarit;
  c = remplacer(c, 'Auteur: A__', 'Auteur: A05');
  c = remplacer(
    c,
    'Relecteur: A__ exactitude · A__ securite · A__ simplicite · A__ mutation',
    'Relecteur: A09 exactitude · A09 securite · A09 simplicite · A10 mutation'
  );
  c = remplacer(c, 'Couvre: REQ-___', 'Couvre: REQ-GOV-010, REQ-GOV-011, REQ-GOV-012, REQ-GOV-013');
  c = remplacer(c, '- [ ]', '- [x]');
  c = remplacerBloc(
    c,
    'rouge-vert',
    "ROUGE : FAIL tests/gov/charte-pr.spec.ts > REQ-GOV-013 — Error: ENOENT, open '.github/PULL_REQUEST_TEMPLATE.md'\n" +
      'VERT : 8 cases comptées entre les marqueurs dod, 0 hors du bloc\n' +
      'Rouge constaté par: A05'
  );
  return c;
}

if (process.argv.includes('--prove')) {
  const depot = lireDepot();

  const base = controler(depot, null);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un dépôt DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 8).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const CORPS = corpsRempli(depot.gabarit);

  /**
   * LA FORME D'UNE REVUE DE FIXTURE EST CELLE DU PRODUCTEUR (RM-03). Elle portait auparavant
   * trois champs inventés — `{ auteur, etat, corps }` — qu'aucune interface ne sert, et c'est
   * précisément parce que la fixture était plus PAUVRE que la réponse réelle que trois des quatre
   * champs qui authentifient une revue n'ont jamais été mis à l'épreuve. Source de la forme :
   * `GET /repos/{owner}/{repo}/pulls/{n}/reviews`, capturée dans
   * `tests/fixtures/github/revues-pr-31.json` le 2026-09-05.
   */
  const TETE_TEMOIN = '41bc8140b9ea436be809676538dd65cb2263a5bc';
  const revue = (corps: string, retouche: Partial<RevueBrute> = {}): RevueBrute => ({
    user: { login: 'will383842' },
    author_association: 'OWNER',
    state: ETAT_APPROUVE,
    commit_id: TETE_TEMOIN,
    body: corps,
    ...retouche,
  });
  /** Le premier mot d'un corps de revue — ce qui la désigne dans un témoin. */
  const ouvrePar = (r: RevueBrute, entete: string): boolean => (r.body ?? '').startsWith(entete);

  const PR_TEMOIN: Pr = {
    // ⚠️ LE TITRE NOMME UNE TÂCHE QUI N'EST PAS `schema`, ET C'EST DÉLIBÉRÉ. Depuis que le
    // discriminant lit AUSSI le champ `schema` de la tâche portée par la PR, une fixture
    // intitulée `feat(GOV-007)` réclamerait la lentille bloquante de l'architecte — GOV-007
    // déclare `prisma/schema.prisma` dans ses `paths`. La PR témoin « ordinaire » doit être
    // ordinaire jusque dans sa tâche : c'est `PR_SCHEMA` qui porte GOV-007, et elle a le label,
    // le fichier et l'avis d'A02. Une fixture qui se contredit prouve la garde par accident.
    titre: 'feat(GOV-011): matrice de traçabilité dérivée',
    corps: CORPS,
    labels: [],
    fichiers: ['docs/CHARTE-AGENTS.md', '.github/PULL_REQUEST_TEMPLATE.md', 'scripts/gates/gov-pr.ts', 'tests/gov/charte-pr.spec.ts'],
    revues: [
      revue('A09 · exactitude\nVerdict: accepte\nles quatre REQ sont couvertes'),
      revue('A09 · securite\nVerdict: accepte\nrien à signaler'),
      revue('A09 · simplicite\nVerdict: accepte\nle §7 est lu, pas recopié'),
      revue('A10 · mutation\nVerdict: accepte\nmarqueur dupliqué : la garde rougit'),
    ],
    tete: TETE_TEMOIN,
  };
  const copiePr = (p: Pr): Pr => JSON.parse(JSON.stringify(p)) as Pr;
  /** Vide la DERNIÈRE case cochée du corps — la huitième, celle qui atteste l'atterrissage. */
  const videLaDerniereCase = (corps: string): string => {
    const l = corps.split(SAUT);
    for (let i = l.length - 1; i >= 0; i--) {
      const ligne = l[i];
      if (ligne !== undefined && ligne.startsWith('- [x]')) {
        l[i] = ligne.replace('- [x]', '- [ ]');
        break;
      }
    }
    return l.join(SAUT);
  };
  const copieDepot = (): Depot => ({ ...depot, fiches: [...depot.fiches] });

  const PR_SCHEMA: Pr = {
    ...copiePr(PR_TEMOIN),
    titre: 'feat(GOV-007): forme des contrats',
    labels: ['schema'],
    fichiers: ['prisma/schema.prisma'],
    revues: [
      revue('A09 · exactitude\nVerdict: accepte\nok'),
      revue('A09 · securite\nVerdict: accepte\nok'),
      revue('A02 · schema\nVerdict: accepte\nmigration additive, aucune perte'),
      revue('A10 · mutation\nVerdict: accepte\nvue rougir'),
    ],
  };
  PR_SCHEMA.corps = remplacer(
    PR_SCHEMA.corps,
    'Relecteur: A09 exactitude · A09 securite · A09 simplicite · A10 mutation',
    'Relecteur: A09 exactitude · A09 securite · A02 schema · A10 mutation'
  );

  const PR_SENSIBLE: Pr = { ...copiePr(PR_TEMOIN), fichiers: ['auth/session.ts', 'tests/gov/charte-pr.spec.ts'] };
  PR_SENSIBLE.corps = remplacerBloc(
    PR_SENSIBLE.corps,
    'attaque',
    "scénario : session de l'apporteur A appelée avec l'identifiant de B\nrésultat : 404 identique au 404 d'un identifiant inexistant\njoué par : A13"
  );

  const PR_RESERVE: Pr = {
    ...copiePr(PR_TEMOIN),
    titre: 'chore(GOV-011): compose le lot',
    labels: ['role:gardien-spec'],
    fichiers: ['docs/tasks.json'],
  };

  type Temoin = { famille: string; defaut: () => [Depot, Pr | null] };
  const TEMOINS: Temoin[] = [
    // ---- structure
    {
      famille: 'marqueur_hors_norme',
      // Le défaut EXACT du premier jet : l'en-tête écrivait les délimiteurs à l'intérieur de
      // lui-même, ce qui plaçait une seconde occurrence de chaque marqueur avant les vraies.
      defaut: () => [{ ...copieDepot(), gabarit: depot.gabarit + '\n<!-- dod:fin -->\n' }, null],
    },
    {
      famille: 'dod_hors_bloc',
      defaut: () => [{ ...copieDepot(), gabarit: depot.gabarit + '\n- [ ] Règle maison appliquée\n' }, null],
    },
    {
      famille: 'champ_gabarit_absent',
      // `split/join` et non `replace` : le gabarit cite « Couvre: » DEUX fois (le champ et la
      // première case), et n'en retirer qu'une laissait la famille verte — le témoin ne prouvait rien.
      defaut: () => [{ ...copieDepot(), gabarit: depot.gabarit.split('Couvre:').join('Concerne:') }, null],
    },
    {
      famille: 'codeowners_non_resolvable',
      defaut: () => [{ ...copieDepot(), codeowners: depot.codeowners.replace(/@will383842/g, '@A02') }, null],
    },
    {
      famille: 'charte_poste_manquant',
      defaut: () => [{ ...copieDepot(), charte: depot.charte.replace(/^\| A07 \|.*$/m, '') }, null],
    },
    {
      famille: 'charte_lentille_non_derivee',
      defaut: () => [{ ...copieDepot(), charte: depot.charte.replace(/troisième lentille/g, 'quatrième lentille') }, null],
    },
    // ---- la PR, sans les revues
    {
      famille: 'titre_non_conforme',
      defaut: () => [copieDepot(), { ...copiePr(PR_TEMOIN), titre: 'charte des agents' }],
    },
    {
      famille: 'relecteur_est_auteur',
      // la fixture rouge de docs/gates.json : « PR témoin où l'auteur s'auto-approuve »
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.corps = p.corps.replace('Auteur: A05', 'Auteur: A09');
        return [copieDepot(), p];
      },
    },
    {
      famille: 'dod_incomplete',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        // une case RETIREE du bloc : le gabarit n'en porte plus huit du tout
        const sansUne = p.corps.split('\n');
        sansUne.splice(
          sansUne.findIndex((l) => l.startsWith('- [')),
          1
        );
        p.corps = sansUne.join('\n');
        return [copieDepot(), p];
      },
    },
    {
      famille: 'rouge_vert_absent',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.corps = remplacerBloc(p.corps, 'rouge-vert', 'ROUGE : (colle ici le message)\nVERT : ok');
        return [copieDepot(), p];
      },
    },
    {
      famille: 'attaque_absente',
      defaut: () => [copieDepot(), { ...copiePr(PR_TEMOIN), fichiers: ['auth/session.ts'] }],
    },
    {
      // LA MEME FAMILLE PAR L'AUTRE BRANCHE, et c'est celle qui manquait. Le temoin ci-dessus
      // passe par `zoneSensible` : il resterait ROUGE meme si la condition sur les TACHES
      // disparaissait, donc il ne garde pas le durcissement du 2026-09-05. Ici aucun fichier
      // n'est en zone sensible et la tache du TITRE (GOV-011) ne porte AUCUN `sensible` :
      // seules des taches PORTEES par la PR en portent. Mesure sur la PR 31 : GOV-024 (titre)
      // `sensible: []`, GOV-006 `["attribution"]`, CPL-T01 `["argent","attribution"]` — la
      // section Attaque n'etait donc exigee par PERSONNE sur une PR qui porte deux taches
      // sensibles.
      famille: 'attaque_absente',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.numero = 31;
        p.corps = remplacerBloc(p.corps, 'attaque', '');
        return [copieDepot(), p];
      },
    },
    {
      famille: 'fichier_reserve_sans_label',
      defaut: () => [copieDepot(), { ...copiePr(PR_RESERVE), labels: [] }],
    },
    {
      famille: 'schema_sans_label',
      defaut: () => [copieDepot(), { ...copiePr(PR_SCHEMA), labels: [] }],
    },
    // ---- la PR, revues comprises
    {
      famille: 'dod_non_cochee',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.corps = p.corps.replace('- [x]', '- [ ]');
        return [copieDepot(), p];
      },
    },
    {
      famille: 'lentilles_manquantes',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.slice(0, 2);
        return [copieDepot(), p];
      },
    },
    {
      // Une revue qui REFUSE n'est pas une lentille manquante : la distinguer est ce qui permet
      // à A04 de dire pourquoi il ne fusionne pas.
      famille: 'phase_gelee',
      defaut: () => [copieDepot(), { ...copiePr(PR_TEMOIN), labels: ['phase:3'] }],
    },
    {
      famille: 'lentille_en_refus',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.map((r) =>
          ouvrePar(r, 'A09 · securite') ? { ...r, body: 'A09 · securite\nVerdict: refuse\nIDOR non couvert' } : r
        );
        return [copieDepot(), p];
      },
    },
    {
      // La huitième case, jugée APRÈS la fusion — le seul moment où elle peut être vraie.
      famille: 'dod_atterrissage_non_atteste',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.apresFusion = true;
        p.corps = videLaDerniereCase(p.corps);
        return [copieDepot(), p];
      },
    },
    {
      // ── LES QUATRE FAIBLESSES FERMÉES PAR LE LECTEUR UNIQUE ──────────────────────────────
      // Chacune était PERMISSIVE : elle laissait compter un avis qui ne devait pas compter.
      // (1) l'auteur d'une revue n'était pas authentifié : dépôt PUBLIC, avis forgé.
      famille: 'lentilles_manquantes',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.map((r) => ({ ...r, author_association: 'NONE', user: { login: 'un-tiers' } }));
        return [copieDepot(), p];
      },
    },
    {
      // (1c) un avis RETIRÉ (`DISMISSED`) n'est pas un avis.
      famille: 'lentilles_manquantes',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.map((r) => ({ ...r, state: 'DISMISSED' }));
        return [copieDepot(), p];
      },
    },
    {
      // (2) le numéro de poste n'était confronté à rien : `A99` tenait une lentille.
      famille: 'lentilles_manquantes',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.map((r) => ({ ...r, body: (r.body ?? '').replace(/^A\d\d/, 'A99') }));
        return [copieDepot(), p];
      },
    },
    {
      // (4) la clé du dernier verdict : un refus d'A02 sur `schema` que l'accord d'un AUTRE
      // poste sur la même lentille effaçait.
      famille: 'lentille_en_refus',
      defaut: () => {
        const p = copiePr(PR_SCHEMA);
        p.revues = [
          ...p.revues!.map((r) =>
            ouvrePar(r, 'A02 · schema') ? { ...r, body: 'A02 · schema\nVerdict: refuse\nla migration perd une colonne' } : r
          ),
          revue('A12 · schema\nVerdict: accepte\nvu de mon côté'),
        ];
        return [copieDepot(), p];
      },
    },
    {
      // Le pas 5 du protocole : un accord rendu sur une AUTRE tête que celle qui sera fusionnée.
      // `gov:pr` en était STRUCTURELLEMENT aveugle — il ne lisait aucun `commit_id`.
      famille: 'lentille_perimee',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.map((r) => ({ ...r, commit_id: '0000000000000000000000000000000000000000' }));
        return [copieDepot(), p];
      },
    },
    {
      // Le discriminant `schema` lu sur les FICHIERS : une PR qui touche prisma sans le label
      // publiait « les lentilles ont accepté » alors que la revue bloquante n'a jamais eu lieu.
      famille: 'schema_sans_approbation',
      defaut: () => {
        const p = copiePr(PR_TEMOIN);
        p.fichiers = ['prisma/schema.prisma', 'tests/gov/charte-pr.spec.ts'];
        return [copieDepot(), p];
      },
    },
    {
      famille: 'schema_sans_approbation',
      defaut: () => {
        const p = copiePr(PR_SCHEMA);
        p.revues = p.revues!.map((r) => (ouvrePar(r, 'A02') ? { ...r, body: 'A09 · schema\nVerdict: accepte\nok' } : r));
        return [copieDepot(), p];
      },
    },
  ];

  const CONTRE_TEMOINS: { quoi: string; cas: () => [Depot, Pr | null] }[] = [
    { quoi: "le dépôt tel qu'il est, sans PR", cas: () => [depot, null] },
    { quoi: 'une PR conforme, revues comprises', cas: () => [depot, PR_TEMOIN] },
    { quoi: 'une PR `schema` avec son label et l’approbation de A02', cas: () => [depot, PR_SCHEMA] },
    { quoi: 'une PR sur une zone sensible avec sa section Attaque remplie', cas: () => [depot, PR_SENSIBLE] },
    { quoi: 'une PR sur un chemin réservé avec le label du rôle', cas: () => [depot, PR_RESERVE] },
    {
      // LE contre-témoin de la scission : la huitième case atteste la fusion et l'atterrissage,
      // elle ne peut pas être cochée à l'événement `pull_request`. En CI (revues absentes) cette
      // PR doit rester VERTE ; sous `--pr <numero>` le témoin de `dod_non_cochee` la fait rougir.
      quoi: "une PR dont la seule case vide est la huitième, jugée en CI (revues absentes)",
      cas: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = null;
        p.corps = videLaDerniereCase(p.corps);
        return [depot, p];
      },
    },
    {
      // LE contre-témoin qui manquait, et sans lequel la correction ne vaut rien : la même PR,
      // huitième case vide, jugée AVEC ses revues — c'est-à-dire sous `--pr <n>`, la commande
      // d'avant-fusion. Elle doit rester VERTE : la case atteste une fusion qui n'a pas eu lieu.
      quoi: "une PR dont la seule case vide est la huitième, jugée AVANT la fusion (--pr)",
      cas: () => {
        const p = copiePr(PR_TEMOIN);
        p.corps = videLaDerniereCase(p.corps);
        return [depot, p];
      },
    },
    {
      // Une PR de la phase COURANTE porte son label et doit passer. Sans ce contre-témoin, une
      // garde qui refuserait tout label `phase:` serait « prouvée » par son seul témoin.
      quoi: 'une PR étiquetée de la phase courante',
      cas: () => [depot, { ...copiePr(PR_TEMOIN), labels: [`phase:${phaseCourante()}`] }],
    },
    {
      // LE CONTRE-TEMOIN DE LA REGLE DU DERNIER MOT : une lentille qui REFUSE, puis relit et
      // ACCEPTE. La PR doit passer. Sans lui, la regle du dernier verdict serait une intention
      // ecrite en commentaire ; avec lui, un refus fige a nouveau la PR des que la regle saute.
      quoi: "une lentille qui a refuse, puis relu et accepte : son DERNIER mot compte",
      cas: () => {
        const p = copiePr(PR_TEMOIN);
        const securite = p.revues!.find((r) => ouvrePar(r, 'A09 · securite'))!;
        p.revues = [
          ...p.revues!.filter((r) => r !== securite),
          { ...securite, body: 'A09 · securite\nVerdict: refuse\nIDOR non couvert' },
          { ...securite, body: 'A09 · securite\nVerdict: accepte\nleve : la garde est posee' },
        ];
        return [depot, p];
      },
    },
    {
      // CONTRE-TÉMOIN DU FILTRE D'IDENTITÉ : `MEMBER` et `COLLABORATOR` jugent aussi. Calé sur
      // le seul `OWNER`, le filtre refuserait EN SILENCE le premier second contributeur.
      quoi: 'une PR relue par un membre et par un collaborateur, et non par le seul propriétaire',
      cas: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.map((r, i) => ({
          ...r,
          author_association: i % 2 === 0 ? 'MEMBER' : 'COLLABORATOR',
          user: { login: i % 2 === 0 ? 'un-membre' : 'un-collaborateur' },
        }));
        return [depot, p];
      },
    },
    {
      // CONTRE-TÉMOIN DU DISCRIMINANT `schema` : sans fichier de schéma, sans label et sans
      // tâche `schema`, c'est `simplicite` qui est exigée — et la PR témoin la porte.
      quoi: 'une PR sans fichier de schéma, sans label de schéma et sans tâche de schéma',
      cas: () => [depot, copiePr(PR_TEMOIN)],
    },
    {
      // Les quatre lentilles rendues en `COMMENTED` : c'est le seul état que ce dépôt à un
      // compte sait produire, et il doit compter autant qu'un `APPROVED`.
      quoi: 'une PR dont les quatre revues sont des commentaires portant `Verdict: accepte`',
      cas: () => {
        const p = copiePr(PR_TEMOIN);
        p.revues = p.revues!.map((r) => ({ ...r, state: ETAT_COMMENTE }));
        return [depot, p];
      },
    },
  ];

  for (const c of CONTRE_TEMOINS) {
    const [d, p] = c.cas();
    const f = controler(d, p);
    if (f.length > 0) {
      console.error(`❌ Faux positif : « ${c.quoi} » a rougi. La garde est trop large.`);
      f.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const [d, p] = t.defaut();
    const f = controler(d, p);
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
  // LE SENS INVERSE, ET IL MANQUAIT. Une famille qu'un témoin fait rougir sans qu'elle soit
  // DÉCLARÉE passait sous le compte : la sortie annonçait « les N familles » en lisant
  // `FAMILLES`, pas ce qui avait réellement été prouvé. `lentille_perimee` est arrivée par là.
  const nonDeclarees = [...prouvees].filter((f) => !FAMILLES.includes(f));
  if (nonDeclarees.length > 0) {
    console.error(
      `❌ Famille(s) prouvée(s) mais NON déclarée(s) dans FAMILLES : ${nonDeclarees.join(', ')}. ` +
        `Le compte annoncé ne serait pas celui des familles réellement contrôlées.`
    );
    process.exit(1);
  }

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

const depot = lireDepot();
const iPr = process.argv.indexOf('--pr');
const iApres = process.argv.indexOf('--apres-fusion');
let pr: Pr | null = null;
let portee = 'structure du gabarit, de CODEOWNERS et de la charte';

if (iPr >= 0 || iApres >= 0) {
  const i = iPr >= 0 ? iPr : iApres;
  const numero = process.argv[i + 1];
  if (!numero || !/^\d+$/.test(numero)) {
    console.error('❌ gov:pr — `--pr` et `--apres-fusion` attendent un numéro de PR.');
    process.exit(1);
  }
  try {
    pr = prParGh(numero);
  } catch (e) {
    console.error(`❌ gov:pr — \`gh pr view ${numero}\` a échoué : ${(e as Error).message}`);
    console.error('   Les familles de revue ne peuvent pas être contrôlées ; la garde refuse plutôt que de passer.');
    process.exit(1);
  }
  if (iApres >= 0 && pr) pr.apresFusion = true;
  portee += `, puis la PR #${numero}, REVUES COMPRISES` + (iApres >= 0 ? ", APRÈS FUSION (la 8ᵉ case est exigée)" : '');
} else {
  pr = prParEvenement();
  if (pr) portee += ', puis la PR de l’événement GitHub — SANS les revues, qui n’existent pas encore';
}

const fautes = controler(depot, pr);
if (AVIS_ECARTES.length > 0) {
  console.log(`ℹ️  gov:pr — ${AVIS_ECARTES.length} avis ÉCARTÉ(S), qui ne comptent pour aucune lentille :`);
  AVIS_ECARTES.forEach((e) => console.log(`      ${e}`));
}
if (fautes.length === 0) {
  console.log(`✅ gov:pr — ${portee}.`);
  if (pr === null) {
    console.log('   Aucune PR en contexte : seules les 6 familles de structure ont été évaluées.');
  } else if (pr.revues === null) {
    console.log(
      '   Les 2 familles de REVUE (lentilles, approbation schema) n’ont PAS été évaluées : ' +
        'lance `pnpm gov:pr --pr <numero>` avant de fusionner (docs/CHARTE-AGENTS.md §8).'
    );
  }
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:pr — ${fautes.length} défaut(s) :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
