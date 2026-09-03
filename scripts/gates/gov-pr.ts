/**
 * gov-pr.ts — la garde du gabarit de PR et de la charte des agents (GOV-007,
 * REQ-GOV-010 / REQ-GOV-011 / REQ-GOV-012 / REQ-GOV-013).
 *
 * USAGE : pnpm gov:pr                 structure du gabarit, de CODEOWNERS et de la charte ;
 *                                     plus la PR elle-même si GitHub Actions en fournit une
 *         pnpm gov:pr --pr <numero>   tout ce qui précède, REVUES COMPRISES (`gh pr view`) —
 *                                     c'est la commande que A04 lance AVANT de fusionner
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
/** Le saut de ligne, nomme : les fixtures decoupent des corps de PR. */
const SAUT = String.fromCharCode(10);
const TYPES_DE_TITRE = ['feat', 'fix', 'test', 'docs', 'chore', 'refactor', 'ci', 'perf'];
const ORDINAUX = ['première', 'deuxième', 'troisième', 'quatrième', 'cinquième'];
const CHEMINS_SCHEMA = ['prisma/', 'packages/contracts/'];
/** Les zones que REQ-GOV-011 place sous revue adversariale documentée. */
const ZONES_SENSIBLES = ['commissions/', 'attributions/', 'auth/', 'espace/'];
/** Ce dont l'introduction impose le bloc ROUGE/VERT (REQ-GOV-012) : un test, une garde, un workflow. */
const INTRODUIT_UNE_GARDE = (f: string) =>
  /\.spec\.ts$/.test(f) || f.startsWith('scripts/gates/') || f.startsWith('.github/workflows/');

type Revue = { auteur: string; etat: string; corps: string };
type Pr = { titre: string; corps: string; labels: string[]; fichiers: string[]; revues: Revue[] | null };
type Tache = { id: string; sensible: string[] };
type Depot = { gabarit: string; codeowners: string; charte: string; fiches: string[]; architecte: string; taches: Tache[] };
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

function touche(chemin: string, fichiers: string[]): boolean {
  const c = chemin.replace(/\/$/, '');
  return fichiers.some((f) => f === chemin || f === c || f.startsWith(c.endsWith('/') ? c : c + '/'));
}

function lentilleDeLaRevue(r: Revue): { code: string; lentille: string } | null {
  const premiere = r.corps.split('\n')[0] ?? '';
  const m = /^\s*(A\d{2})\s*[·\-–]\s*([a-zA-Zéè]+)/.exec(premiere);
  return m ? { code: m[1]!, lentille: m[2]!.toLowerCase() } : null;
}

// ── le contrôle ──────────────────────────────────────────────────────────────

function controler(depot: Depot, pr: Pr | null): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

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
  } else if (pr.revues !== null && cochees !== NB_CASES) {
    // Cochées : jugé seulement sous `--pr <numero>`, la commande qu'A04 lance AVANT de fusionner.
    // La huitième case atteste la fusion et l'atterrissage : elle ne peut être vraie à l'événement
    // `pull_request`. L'exiger en CI rendrait `gate-a` — check requis de `main` — soit rouge sur
    // toute PR, soit vert sur une attestation fausse.
    ajouter(
      'dod_non_cochee',
      `Corps de la PR — ${cochees} case(s) cochée(s) sur ${NB_CASES} entre les marqueurs dod ; ` +
        `REQ-GOV-013 les exige toutes avant la fusion. A04 refuse la PR.`
    );
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
  const attaqueExigee = zoneSensible || (tache !== undefined && tache.sensible.length > 0);
  if (attaqueExigee) {
    const blocAttaque = (bloc(pr.corps, 'attaque') ?? '').trim();
    if (blocAttaque.length === 0 || /sans objet/i.test(blocAttaque)) {
      ajouter(
        'attaque_absente',
        `Corps de la PR — section « Attaque » exigée (${zoneSensible ? 'zone sensible touchée' : `tâche sensible : ${tache!.sensible.join(', ')}`}) ` +
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

  const toucheSchema = CHEMINS_SCHEMA.some((c) => touche(c, pr.fichiers));
  if (toucheSchema && !pr.labels.includes('schema')) {
    ajouter(
      'schema_sans_label',
      `La PR touche ${CHEMINS_SCHEMA.filter((c) => touche(c, pr.fichiers)).join(', ')} sans le label ` +
        `\`schema\` : sans lui, l'approbation bloquante de A02 n'est demandée par personne ` +
        `(docs/CONVENTIONS.md §5).`
    );
  }

  if (pr.revues === null) return fautes;

  // ---- les revues (seulement sous `--pr <numero>`) ---------------------------
  const approuvees = pr.revues.filter((r) => r.etat.toUpperCase() === 'APPROVED');
  const lues = approuvees.map(lentilleDeLaRevue).filter((x): x is { code: string; lentille: string } => x !== null);
  const exigees = toucheSchema ? ['exactitude', 'securite', 'schema'] : ['exactitude', 'securite', 'simplicite'];
  const manquantes = exigees.filter((l) => !lues.some((x) => x.lentille === l));
  if (manquantes.length > 0) {
    ajouter(
      'lentilles_manquantes',
      `Revues — lentille(s) manquante(s) : ${manquantes.join(', ')}. Chaque revue s'ouvre par ` +
        `« A<nn> · <lentille> » (docs/CHARTE-AGENTS.md §3). Vues : ${lues.map((x) => `${x.code} ${x.lentille}`).join(' / ') || '(aucune)'}.`
    );
  }
  if (!lues.some((x) => x.lentille === 'mutation')) {
    ajouter(
      'lentilles_manquantes',
      `Revues — aucun avis « mutation » : A10 n'a pas dit que les gardes introduites avaient été vues ` +
        `rougir sur une mutation réelle (RM-02).`
    );
  }
  if (auteur && lues.some((x) => x.code === auteur[1])) {
    ajouter(
      'relecteur_est_auteur',
      `Revues — l'auteur ${auteur[1]} a approuvé sa propre PR (REQ-GOV-011).`
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
  if (toucheSchema) {
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
  const taches = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: { id: string; sensible?: string[] }[] }).taches.map(
    (t) => ({ id: t.id, sensible: t.sensible ?? [] })
  );
  return {
    gabarit: readFileSync(CHEMIN_GABARIT, 'utf8'),
    codeowners: readFileSync(CHEMIN_CODEOWNERS, 'utf8'),
    charte: readFileSync(CHEMIN_CHARTE, 'utf8'),
    architecte: readFileSync(CHEMIN_FICHE_ARCHITECTE, 'utf8'),
    fiches: readdirSync(CHEMIN_FICHES).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)),
    taches,
  };
}

/** `gh pr view <n> --json …` — la forme des champs vient de la commande, pas d'une invention. */
function prParGh(numero: string): Pr {
  const brut = execFileSync(
    'gh',
    ['pr', 'view', numero, '--json', 'title,body,labels,files,reviews,author'],
    { encoding: 'utf8' }
  );
  const j = JSON.parse(brut) as {
    title: string; body: string;
    labels: { name: string }[];
    files: { path: string }[];
    reviews: { author: { login: string }; state: string; body: string }[];
  };
  return {
    titre: j.title,
    corps: j.body ?? '',
    labels: (j.labels ?? []).map((l) => l.name),
    fichiers: (j.files ?? []).map((f) => f.path),
    revues: (j.reviews ?? []).map((r) => ({ auteur: r.author?.login ?? '', etat: r.state, corps: r.body ?? '' })),
  };
}

/** L'événement GitHub Actions : titre, corps, labels. Les revues n'y sont PAS. */
function prParEvenement(): Pr | null {
  const chemin = process.env['GITHUB_EVENT_PATH'];
  if (!chemin || !existsSync(chemin)) return null;
  const ev = JSON.parse(readFileSync(chemin, 'utf8')) as {
    pull_request?: { title: string; body: string | null; labels: { name: string }[]; base: { sha: string }; head: { sha: string } };
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
  const PR_TEMOIN: Pr = {
    titre: 'feat(GOV-007): charte des agents, gabarit de PR et garde gov:pr',
    corps: CORPS,
    labels: [],
    fichiers: ['docs/CHARTE-AGENTS.md', '.github/PULL_REQUEST_TEMPLATE.md', 'scripts/gates/gov-pr.ts', 'tests/gov/charte-pr.spec.ts'],
    revues: [
      { auteur: 'w', etat: 'APPROVED', corps: 'A09 · exactitude\nles quatre REQ sont couvertes' },
      { auteur: 'w', etat: 'APPROVED', corps: 'A09 · securite\nrien à signaler' },
      { auteur: 'w', etat: 'APPROVED', corps: 'A09 · simplicite\nle §7 est lu, pas recopié' },
      { auteur: 'w', etat: 'APPROVED', corps: 'A10 · mutation\nmarqueur dupliqué : la garde rougit' },
    ],
  };
  const copiePr = (p: Pr): Pr => JSON.parse(JSON.stringify(p)) as Pr;
  const copieDepot = (): Depot => ({ ...depot, fiches: [...depot.fiches] });

  const PR_SCHEMA: Pr = {
    ...copiePr(PR_TEMOIN),
    titre: 'feat(GOV-007): forme des contrats',
    labels: ['schema'],
    fichiers: ['prisma/schema.prisma'],
    revues: [
      { auteur: 'w', etat: 'APPROVED', corps: 'A09 · exactitude\nok' },
      { auteur: 'w', etat: 'APPROVED', corps: 'A09 · securite\nok' },
      { auteur: 'w', etat: 'APPROVED', corps: 'A02 · schema\nmigration additive, aucune perte' },
      { auteur: 'w', etat: 'APPROVED', corps: 'A10 · mutation\nvue rougir' },
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
    titre: 'chore(GOV-007): compose le lot',
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
      famille: 'schema_sans_approbation',
      defaut: () => {
        const p = copiePr(PR_SCHEMA);
        p.revues = p.revues!.map((r) => (r.corps.startsWith('A02') ? { ...r, corps: 'A09 · schema\nok' } : r));
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
        const l = p.corps.split(SAUT);
        for (let i = l.length - 1; i >= 0; i--) {
          const ligne = l[i];
          if (ligne !== undefined && ligne.startsWith('- [x]')) {
            l[i] = ligne.replace('- [x]', '- [ ]');
            break;
          }
        }
        p.corps = l.join(SAUT);
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

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

const depot = lireDepot();
const iPr = process.argv.indexOf('--pr');
let pr: Pr | null = null;
let portee = 'structure du gabarit, de CODEOWNERS et de la charte';

if (iPr >= 0) {
  const numero = process.argv[iPr + 1];
  if (!numero || !/^\d+$/.test(numero)) {
    console.error('❌ gov:pr — `--pr` attend un numéro de PR.');
    process.exit(1);
  }
  try {
    pr = prParGh(numero);
  } catch (e) {
    console.error(`❌ gov:pr — \`gh pr view ${numero}\` a échoué : ${(e as Error).message}`);
    console.error('   Les familles de revue ne peuvent pas être contrôlées ; la garde refuse plutôt que de passer.');
    process.exit(1);
  }
  portee += `, puis la PR #${numero}, REVUES COMPRISES`;
} else {
  pr = prParEvenement();
  if (pr) portee += ', puis la PR de l’événement GitHub — SANS les revues, qui n’existent pas encore';
}

const fautes = controler(depot, pr);
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
