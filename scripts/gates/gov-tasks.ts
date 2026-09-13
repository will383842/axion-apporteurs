/**
 * gov-tasks.ts — la garde du backlog (GOV-017a, REQ-GOV-026).
 *
 * USAGE : pnpm gov:tasks                 (échoue si `docs/tasks.json` est invalide ou incohérent)
 *         pnpm gov:tasks --prove         (injecte un défaut PAR FAMILLE et vérifie que chacun rougit)
 *         pnpm gov:tasks --render        (écrit `docs/TASKS.md`, la VUE du backlog)
 *         pnpm gov:tasks --verifie-rendu (n'écrit rien ; sort 1 si la vue commitée a dérivé)
 *         …--out <chemin>                travaille sur une autre vue (bancs d'essai des tests)
 *
 * `docs/tasks.json` est la SOURCE du backlog ; `TASKS.md` en est une vue. Tout ce que le composeur
 * de lot suppose sans le vérifier se vérifie ici, une fois pour toutes :
 *
 *   — le schéma (`scripts/lot/tasks.schema.json`), y compris ses invariants conditionnels ;
 *   — l'unicité des identifiants ;
 *   — la résolution des dépendances, et leur ACYCLICITÉ ;
 *   — l'ordre des phases : une tâche ne dépend jamais d'une tâche postérieure ;
 *   — l'interdiction des identifiants SCINDÉS en dépendance (`INT-T01`, `GOV-017`, `EXT-T02` ont
 *     été découpés le 2026-09-03 ; les citer, c'est dépendre de quelque chose qui n'existe plus) ;
 *   — l'interdiction des identifiants de DÉCISION en dépendance (GOV-003) : une décision se cite
 *     dans `hyp`, jamais dans `deps` — sinon le composeur attend qu'une tâche inexistante fusionne ;
 *   — l'adossement de chaque `hyp` au registre `docs/DECISIONS.md` : une tâche qui repose sur une
 *     décision que personne n'a écrite n'est pas éligible, et le motif `decision_sans_hypothese`
 *     n'aurait rien à nommer.
 *
 * POURQUOI UNE GARDE ET PAS UN TEST : ces invariants portent sur un fichier de DONNÉES que plusieurs
 * sessions écrivent en parallèle (`pnpm lot:cloture`). Un test unitaire ne le relit pas ; la CI, si.
 *
 * LE REGISTRE DES DÉCISIONS N'EST PLUS LU ICI (GOV-027). Sa lecture vivait en double — une version
 * ici, une autre dans `scripts/lot/composer.ts` — et les deux ne disaient pas la même chose. Elle
 * est passée dans `scripts/lot/registre-decisions.ts`, importé des deux côtés (RM-01, RM-04).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { LIVREE as LIVREE_DERIVEE, verifierExhaustivite } from '../lot/avancement';
import { chargerRegistre, CHEMIN_REGISTRE, type Registre } from '../lot/registre-decisions';
import { FAMILLES_ATTESTATION, controlerAttestation, type Attestation } from '../lot/attestation';

const CHEMIN_TACHES = 'docs/tasks.json';
const CHEMIN_SCHEMA = 'scripts/lot/tasks.schema.json';
const CHEMIN_DECISIONS = CHEMIN_REGISTRE;
const CHEMIN_VUE_PAR_DEFAUT = 'docs/TASKS.md';

/**
 * `--out <chemin>` : rendre ou vérifier une AUTRE vue que celle du dépôt. C'est ce qui permet aux
 * témoins de `tests/unit/gouvernance/vues-derivees.spec.ts` de périmer une vue sans toucher à
 * `docs/TASKS.md` — un test qui périme la vraie vue emporte le travail non commité de la session.
 */
const iOut = process.argv.indexOf('--out');
const CHEMIN_VUE = iOut >= 0 ? (process.argv[iOut + 1] ?? CHEMIN_VUE_PAR_DEFAUT) : CHEMIN_VUE_PAR_DEFAUT;

/** Identifiants découpés le 2026-09-03. Les citer en dépendance est une erreur, pas un raccourci. */
const SCINDES: Record<string, string> = {
  'INT-T01': 'INT-T01a (enveloppe) puis INT-T01b (payloads) — citer INT-T01b suffit',
  'GOV-017': 'GOV-017a (conversion) puis GOV-017b (paths/zone/sensible)',
  'EXT-T02': 'EXT-T02a (phase 1) puis EXT-T02b (phase 2)',
};

type Tache = {
  id: string;
  titre: string;
  phase: number;
  repo: string;
  zone: string;
  deps: string[];
  hyp: string[];
  reqs: string[];
  paths: string[];
  schema: boolean;
  sensible: string[];
  estimateDays: number;
  externe: string | null;
  statut: string;
  acceptance?: string;
  tests?: Record<string, string[]>;
  owner?: string | null;
  branch?: string | null;
  pr?: number | null;
  attestation?: Attestation | null;
};

type Faute = { famille: string; message: string };

/** Les statuts qui valent « livrée ». Une dépendance doit y être avant que son dépendant y entre. */
// L'ensemble « livrée » ne s'écrit plus ici : il se DÉRIVE du barème unique de
// `scripts/lot/avancement.ts`, dont l'exhaustivité est confrontée à l'enum `statut` du schéma.
// Il était recopié dans CINQ fichiers — relevé par la lentille `schema` sur la PR 28, dans la
// PR même qui écrivait la règle l'interdisant (RM-04, `docs/GLOSSAIRE.md` §4 : « deux copies du
// même vocabulaire divergent toujours »). Un dixième statut faisait rougir `gov:inventaire` et
// laissait les cinq copies se taire en se trompant.
const LIVREE = LIVREE_DERIVEE;

// Une garde qui lit un statut ne tourne pas sur un barème incomplet sans le dire.
{
  const ecarts = verifierExhaustivite();
  if (ecarts.length > 0) {
    console.error("❌ scripts/lot/avancement.ts a dérivé de scripts/lot/tasks.schema.json :");
    ecarts.forEach((e) => console.error("   " + e));
    process.exit(1);
  }
}

// ── les contrôles ────────────────────────────────────────────────────────────
function controler(doc: unknown, schema: object, registre: Registre): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  const ajv = new (Ajv2020 as unknown as { new (o: object): { validate: (s: object, d: unknown) => boolean; errors?: { instancePath?: string; message?: string }[] } })({
    allErrors: true,
    strict: false,
  });
  if (!ajv.validate(schema, doc)) {
    for (const e of ajv.errors ?? []) {
      ajouter('schema', `${e.instancePath || '(racine)'} ${e.message ?? 'invalide'}`);
    }
  }

  const taches = ((doc as { taches?: Tache[] }).taches ?? []) as Tache[];

  // unicité
  const vus = new Set<string>();
  for (const t of taches) {
    if (vus.has(t.id)) ajouter('id_double', `${t.id} apparaît plus d'une fois.`);
    vus.add(t.id);
  }

  const parId = new Map(taches.map((t) => [t.id, t]));

  for (const t of taches) {
    for (const d of t.deps) {
      if (SCINDES[d]) {
        ajouter('dep_identifiant_scinde', `${t.id} dépend de ${d}, qui a été découpé : ${SCINDES[d]}.`);
        continue;
      }
      if (/^(HYP|DEC)-|^W\d{1,2}$/.test(d)) {
        ajouter(
          'dep_decision_nue',
          `${t.id} porte la décision ${d} dans deps. Une décision se cite dans hyp — dans deps, le ` +
            `composeur attend la fusion d'une tâche qui n'existe pas (GOV-003).`
        );
        continue;
      }
      const cible = parId.get(d);
      if (!cible) {
        ajouter('dep_inconnue', `${t.id} dépend de ${d}, qui n'est aucune tâche du fichier.`);
        continue;
      }
      if (cible.phase > t.phase) {
        ajouter(
          'dep_phase_ulterieure',
          `${t.id} (phase ${t.phase}) dépend de ${d} (phase ${cible.phase}) : la phase ${t.phase} ` +
            `ne pourrait jamais se terminer.`
        );
      }
      if (LIVREE.has(t.statut) && !LIVREE.has(cible.statut)) {
        ajouter(
          'dep_non_livree',
          `${t.id} est « ${t.statut} » mais dépend de ${d}, encore « ${cible.statut} ». Une tâche ` +
            `livrée avant sa dépendance a été livrée sur une base qui n'existe pas : l'éligibilité ` +
            `que le composeur calcule ensuite est fausse.`
        );
      }
    }

    for (const h of t.hyp) {
      if (!registre.estDeclaree(h)) {
        ajouter(
          'hyp_hors_registre',
          `${t.id} repose sur ${h}, qui n'a pas de ligne dans ${CHEMIN_DECISIONS}. ` +
            `Ajoute-lui une ligne (hypothèse, réversibilité, propriétaire) ou son alias canonique.`
        );
      }
    }

    if (t.paths.length === 0) {
      ajouter('paths_vide', `${t.id} ne déclare aucun chemin : le composeur ne peut pas l'isoler.`);
    }

    // Une tâche de DÉCISION coûte 0 j ; une tâche de code est plafonnée à 1,5 j (une PR).
    if (t.repo !== 'externe' && t.estimateDays > 1.5) {
      ajouter('estimation_hors_plafond', `${t.id} est estimée ${t.estimateDays} j : au-delà d'une PR (1,5 j).`);
    }
    if (t.externe !== null && t.statut !== 'attente_externe') {
      ajouter(
        'externe_sans_attente',
        `${t.id} attend ${t.externe} mais son statut est « ${t.statut} » : le filtre du composeur la laisserait passer.`
      );
    }

    // L'ATTESTATION INTER-DÉPÔT (GOV-038). Quatorze tâches de ce backlog vivent dans `axionia` ;
    // `INT-T01b` est la première à avoir été livrée, et rien ici ne savait le dire autrement qu'en
    // écrivant un `pr` qui ne résout pas. Les contrôles vivent dans `scripts/lot/attestation.ts`,
    // avec la forme du champ, le motif du SHA et la fonction de rendu : une garde qui juge une
    // valeur et une vue qui l'imprime doivent lire la MÊME définition (RM-01).
    for (const f of controlerAttestation(t, LIVREE.has(t.statut))) ajouter(f.famille, f.message);
  }

  // acyclicité — parcours en profondeur, pile explicite pour nommer le cycle
  const BLANC = 0, GRIS = 1, NOIR = 2;
  const couleur = new Map<string, number>(taches.map((t) => [t.id, BLANC]));
  const pile: string[] = [];
  const signales = new Set<string>();

  const visiter = (id: string): void => {
    couleur.set(id, GRIS);
    pile.push(id);
    for (const d of parId.get(id)?.deps ?? []) {
      if (!parId.has(d)) continue;
      const c = couleur.get(d);
      if (c === GRIS) {
        const cycle = pile.slice(pile.indexOf(d)).concat(d).join(' → ');
        if (!signales.has(cycle)) {
          signales.add(cycle);
          ajouter('dep_circulaire', `Cycle de dépendances : ${cycle}.`);
        }
      } else if (c === BLANC) {
        visiter(d);
      }
    }
    pile.pop();
    couleur.set(id, NOIR);
  };
  for (const t of taches) if (couleur.get(t.id) === BLANC) visiter(t.id);

  return fautes;
}

// Les familles d'attestation ne sont pas RETAPÉES ici : elles sont importées de leur module, qui
// est aussi celui qui les produit. Une liste de familles recopiée à côté du code qui les émet
// laisse `--prove` réclamer un témoin pour une famille morte, ou en oublier une vivante (RM-01).
const FAMILLES = [
  'schema', 'id_double', 'dep_inconnue', 'dep_circulaire', 'dep_phase_ulterieure',
  'dep_identifiant_scinde', 'dep_decision_nue', 'hyp_hors_registre', 'paths_vide',
  'estimation_hors_plafond', 'externe_sans_attente', 'dep_non_livree',
  ...FAMILLES_ATTESTATION,
];

// ── chargement ───────────────────────────────────────────────────────────────
for (const f of [CHEMIN_TACHES, CHEMIN_SCHEMA, CHEMIN_DECISIONS]) {
  if (!existsSync(f)) {
    console.error(`❌ gov:tasks — ${f} est introuvable.`);
    process.exit(1);
  }
}
const schema = JSON.parse(readFileSync(CHEMIN_SCHEMA, 'utf8')) as object;
const registre = chargerRegistre(CHEMIN_DECISIONS);
const doc = JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] };

// ── la vue : docs/TASKS.md est une VUE de docs/tasks.json ─────────────────────
// `TASKS.md` a longtemps ete la source, tenue a la main : trois comptages differents y
// circulaient, tous faux, et un correctif ecrit dans un constat ne rejoignait jamais le texte
// de la tache. La source est desormais `docs/tasks.json` ; ce rendu produit la vue, et rien
// d'autre ne doit ecrire dans `docs/TASKS.md`.
//
// LE RENDU EST UNE FONCTION PURE, et ce n'est pas un rangement. Tant qu'il ecrivait le fichier
// depuis un bloc en ligne, PERSONNE ne pouvait comparer la vue a ce que sa source produirait :
// la derive etait silencieuse. Elle est arrivee. La PR #30 a fait passer vingt taches a
// `fusionnee` dans `docs/tasks.json` sans regenerer `docs/TASKS.md`, qui a continue d'en
// annoncer CINQ — quinze taches d'ecart, sur le fichier qu'on ouvre justement pour savoir ou en
// est le chantier. Aucune gate ne l'a vu ; trois relecteurs l'ont vu, a la lecture.
//
// Deux appels sur le meme backlog rendent le meme octet : rien ici ne lit l'horloge, ni un
// `Object.keys`, ni le systeme de fichiers. Sans ce determinisme, `--verifie-rendu` mesurerait
// la machine au lieu de mesurer la derive.

const PHASES: Record<number, string> = {
  [-1]: 'Gouvernance (prealable bloquant)',
  0: 'Socle technique',
  1: 'Operationnel',
  2: 'Argent',
  3: 'Pilotage et conformite',
};

export function rendreVue(doc: { taches: Tache[] }): string {
  const l: string[] = [];
  const total = doc.taches.reduce((a, t) => a + t.estimateDays, 0);

  l.push('# Taches par phase — Axion Apporteurs');
  l.push('');
  l.push('> ⚠️ **Ce fichier est une VUE. La source est `docs/tasks.json`.**');
  l.push('> Regenere par `pnpm gov:tasks --render`, jamais edite a la main : une correction tapee ici');
  l.push('> disparait au rendu suivant. Trois comptages differents ont circule dans la version tenue');
  l.push('> a la main, tous faux — les nombres ci-dessous sont comptes a la generation.');
  l.push('> `pnpm gov:tasks --verifie-rendu` rougit si ce fichier a derive de sa source (REQ-GOV-032).');
  l.push('>');
  l.push('> Une tache = une PR, **≤ 1,5 jour**. Le plafond est porte par la garde `gov:tasks`.');
  l.push('');
  l.push(`**${doc.taches.length} taches · ${total.toFixed(2)} j estimes.**`);
  l.push('');
  l.push('| Phase | Taches | Jours | Terminees |');
  l.push('| --- | ---: | ---: | ---: |');
  for (const p of [-1, 0, 1, 2, 3]) {
    const liste = doc.taches.filter((t) => t.phase === p);
    const faites = liste.filter((t) => LIVREE.has(t.statut)).length;
    l.push(`| ${p} — ${PHASES[p]} | ${liste.length} | ${liste.reduce((a, t) => a + t.estimateDays, 0).toFixed(2)} | ${faites} |`);
  }
  l.push('');

  for (const p of [-1, 0, 1, 2, 3]) {
    const liste = doc.taches.filter((t) => t.phase === p);
    if (liste.length === 0) continue;
    l.push(`## Phase ${p} — ${PHASES[p]}`);
    l.push('');
    for (const t of liste) {
      const marques: string[] = [];
      if (t.repo !== 'partners') marques.push(`\`${t.repo}\``);
      if (t.schema) marques.push('`schema`');
      if (t.sensible.length > 0) marques.push(`sensible : ${t.sensible.join(', ')}`);
      const etat = LIVREE.has(t.statut) ? ` ✅ **${t.statut}**` : t.statut === 'a_faire' ? '' : ` — **${t.statut}**`;
      l.push(`### ${t.id} — ${t.titre}${etat}`);
      l.push('');
      l.push(
        `\`${t.estimateDays} j\` · zone \`${t.zone}\`` +
          (marques.length ? ` · ${marques.join(' · ')}` : '') +
          (t.deps.length ? ` · depend de ${t.deps.map((d) => `\`${d}\``).join(', ')}` : ' · aucune dependance') +
          (t.hyp.length ? ` · decisions ${t.hyp.map((h) => `\`${h}\``).join(', ')}` : '')
      );
      l.push('');
      l.push(`Couvre : ${t.reqs.map((r) => `\`${r}\``).join(', ')}`);
      l.push('');
      if (t.acceptance) {
        l.push(`**Acceptation.** ${t.acceptance}`);
        l.push('');
      }
      const tests = t.tests ? Object.values(t.tests).flat() : [];
      if (tests.length > 0) {
        l.push(`**Tests.** ${[...new Set(tests)].map((x) => `\`${x}\``).join(' · ')}`);
        l.push('');
      }
    }
  }

  return l.join('\n') + '\n';
}

/**
 * Le nombre de taches LIVREES qu'un texte de vue ANNONCE. C'est l'unite du domaine (REQ-GOV-032) :
 * « les deux fichiers different » n'apprend rien a qui lit un journal de CI, et c'est precisement
 * cet ecart-la — cinq annoncees pour vingt reelles — que personne n'a vu pendant une PR entiere.
 * La marque est lue sur la ligne de TITRE d'une tache, jamais n'importe ou dans le fichier : un
 * texte d'acceptation qui contiendrait la meme suite de caracteres fausserait le compte.
 */
export function livreesAnnoncees(vue: string): number {
  return (vue.match(/^### .+ ✅ \*\*[a-z_]+\*\*$/gm) ?? []).length;
}

/**
 * Fins de ligne NORMALISEES avant comparaison. `.gitattributes` impose `eol=lf`, mais un poste dont
 * `core.autocrlf` est arme malgre tout relirait des `\r\n` la ou le rendu ecrit des `\n` : la garde
 * serait verte en CI et rouge chez tout le monde — elle mesurerait la configuration de git.
 */
function normaliserFins(t: string): string {
  return t.replace(/\r\n/g, '\n');
}

if (process.argv.includes('--render') || process.argv.includes('--verifie-rendu')) {
  const fautes = controler(doc, schema, registre);
  if (fautes.length > 0) {
    console.error(`❌ Refus de rendre une vue d'un backlog fautif (${fautes.length}). Lance \`pnpm gov:tasks\`.`);
    process.exit(1);
  }

  const rendu = rendreVue(doc);
  const total = doc.taches.reduce((a, t) => a + t.estimateDays, 0);

  // ── mode --verifie-rendu : il COMPARE, il n'écrit rien ──────────────────────
  // Une garde qui répare ce qu'elle contrôle est toujours verte, et ne garde donc rien.
  //
  // ⚠️ LA VUE S'ÉCRIT SANS ACCENTS, LA CONSOLE AVEC. Ce n'est pas une inattention : le corps de
  // `docs/TASKS.md` est rendu sans accents depuis son premier jour, et les 1 445 lignes du fichier
  // le sont ; les messages de cette garde, eux, sont du français ordinaire (`docs/CONVENTIONS.md`
  // §1). Aligner l'un sur l'autre reécrirait la vue entière pour une raison de cosmétique.
  if (process.argv.includes('--verifie-rendu')) {
    if (!existsSync(CHEMIN_VUE)) {
      console.error(
        `❌ gov:tasks — vue_absente : ${CHEMIN_VUE} n'existe pas, alors que ${CHEMIN_TACHES} porte ` +
          `${doc.taches.length} tâche(s). Lance \`pnpm gov:tasks --render\` et commite le résultat.`
      );
      process.exit(1);
    }
    const surDisque = normaliserFins(readFileSync(CHEMIN_VUE, 'utf8'));
    if (surDisque !== normaliserFins(rendu)) {
      const vues = livreesAnnoncees(surDisque);
      const reelles = livreesAnnoncees(rendu);
      const ecart =
        vues === reelles
          ? `Le compte de tâches livrées est le même (${reelles}) : la dérive porte sur autre chose — ` +
            `un titre, une acceptation, une dépendance, un statut non livré.`
          : `La vue annonce ${vues} tâche(s) livrée(s), la source en porte ${reelles} — ` +
            `${Math.abs(reelles - vues)} d'écart.`;
      console.error(
        `❌ gov:tasks — vue_perimee : ${CHEMIN_VUE} n'est plus ce que ${CHEMIN_TACHES} produit.\n` +
          `   ${ecart}\n` +
          `   La vue ne se corrige pas à la main : lance \`pnpm gov:tasks --render\` et commite le résultat.`
      );
      process.exit(1);
    }
    console.log(
      `✅ gov:tasks — ${CHEMIN_VUE} est égal à ce que ${CHEMIN_TACHES} produit : ` +
        `${doc.taches.length} tâches, ${livreesAnnoncees(rendu)} livrée(s), ${total.toFixed(2)} j.`
    );
    process.exit(0);
  }

  writeFileSync(CHEMIN_VUE, rendu);
  console.log(
    `✅ ${CHEMIN_VUE} rendu depuis ${CHEMIN_TACHES} — ${doc.taches.length} tâches, ` +
      `${livreesAnnoncees(rendu)} livrée(s), ${total.toFixed(2)} j.`
  );
  process.exit(0);
}

// ── mode --prove : un défaut par famille, chacun vu rougir ────────────────────
if (process.argv.includes('--prove')) {
  const base = controler(doc, schema, registre);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un document DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const copie = (): { taches: Tache[] } => JSON.parse(JSON.stringify(doc)) as { taches: Tache[] };
  const premiere = (d: { taches: Tache[] }): Tache => d.taches[0]!;
  const derniere = (d: { taches: Tache[] }): Tache => d.taches[d.taches.length - 1]!;

  // ── de quoi éprouver l'attestation inter-dépôt (GOV-038) ────────────────────
  //
  // Les témoins partent d'une tâche DÉJÀ livrée dans ce dépôt et n'en changent qu'une chose : le
  // dépôt, ou l'attestation. Promouvoir une tâche `a_faire` aurait demandé de lui inventer un
  // `owner`, une `branch`, une `acceptance` et des `tests` — quatre mutations de plus, dont chacune
  // peut faire rougir une autre famille et brouiller ce que le témoin prouve (RM-11).
  const choisir = (d: { taches: Tache[] }, ou: (t: Tache) => boolean, quoi: string): Tache => {
    const t = d.taches.find(ou);
    if (!t) {
      console.error(`❌ gov:tasks --prove — aucune tâche ${quoi} : le témoin ne peut plus être choisi.`);
      process.exit(1);
    }
    return t;
  };
  const livreeIci = (d: { taches: Tache[] }): Tache =>
    choisir(d, (t) => LIVREE.has(t.statut) && t.repo === 'partners', 'livrée dans ce dépôt');
  const aFaireIci = (d: { taches: Tache[] }): Tache =>
    choisir(d, (t) => t.statut === 'a_faire' && t.repo === 'partners' && t.pr == null, '« a_faire » de ce dépôt sans pr');
  // Le témoin de `pr_nu_hors_depot` a besoin d'une tâche qui porte VRAIMENT un numéro : la première
  // tâche livrée du backlog (`GOV-000`) a `pr: null`, et le témoin est resté VERT au premier essai
  // — il déplaçait dans un autre dépôt une tâche qui n'avait aucun numéro à mal citer.
  const livreeIciAvecPr = (d: { taches: Tache[] }): Tache =>
    choisir(d, (t) => LIVREE.has(t.statut) && t.repo === 'partners' && t.pr != null, 'livrée ici AVEC un numéro de PR');

  // Le SHA du témoin est LU dans git, jamais écrit en dur : une constante de 40 hexadécimaux tapée
  // à la main est exactement la fixture inventée que RM-03 interdit, et elle ne prouverait pas
  // qu'un vrai SHA passe. La valeur change à chaque commit ; le verdict, non — la garde juge la
  // FORME, elle ne résout rien (aucun appel à la forge, cf. l'en-tête de `scripts/lot/attestation.ts`).
  const shaReel = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const attestationValide = (): Attestation => ({
    pr: 998,
    sha: shaReel,
    fusionneeAt: '2026-09-05T11:04:48Z',
  });
  /** Une tâche livrée AILLEURS, dans les règles : c'est la forme que GOV-038 introduit. */
  const livreeAilleurs = (d: { taches: Tache[] }): Tache => {
    const t = livreeIci(d);
    t.repo = 'axionia';
    t.pr = null;
    t.attestation = attestationValide();
    return t;
  };

  const TEMOINS: { famille: string; defaut: () => { taches: Tache[] } }[] = [
    { famille: 'schema', defaut: () => { const d = copie(); (premiere(d) as unknown as { phase: number }).phase = 42; return d; } },
    // Second témoin de `schema`, ciblé sur le motif de `branch` (partners/ADR-0007). Le témoin
    // `phase = 42` ci-dessus prouve que la famille rougit ; il ne prouve rien du champ `branch`,
    // dont le motif a été élargi. Une branche sans préfixe reconnu doit rester refusée.
    { famille: 'schema', defaut: () => { const d = copie(); premiere(d).branch = 'feature/ce-prefixe-nexiste-pas'; return d; } },
    { famille: 'id_double', defaut: () => { const d = copie(); d.taches.push(JSON.parse(JSON.stringify(premiere(d))) as Tache); return d; } },
    { famille: 'dep_inconnue', defaut: () => { const d = copie(); premiere(d).deps.push('NEXISTE-PAS-01'); return d; } },
    { famille: 'dep_circulaire', defaut: () => { const d = copie(); const [a, b] = [d.taches[0]!, d.taches[1]!]; a.deps = [b.id]; b.deps = [a.id]; return d; } },
    { famille: 'dep_phase_ulterieure', defaut: () => { const d = copie(); const tard = d.taches.find((t) => t.phase === 3)!; const tot = d.taches.find((t) => t.phase === -1)!; tot.deps = [tard.id]; return d; } },
    { famille: 'dep_identifiant_scinde', defaut: () => { const d = copie(); premiere(d).deps.push('INT-T01'); return d; } },
    { famille: 'dep_decision_nue', defaut: () => { const d = copie(); premiere(d).deps.push('W6'); return d; } },
    { famille: 'hyp_hors_registre', defaut: () => { const d = copie(); premiere(d).hyp.push('HYP-JAMAIS-ECRITE'); return d; } },
    { famille: 'paths_vide', defaut: () => { const d = copie(); premiere(d).paths = []; return d; } },
    { famille: 'estimation_hors_plafond', defaut: () => { const d = copie(); derniere(d).estimateDays = 3; return d; } },
    { famille: 'externe_sans_attente', defaut: () => { const d = copie(); const e = d.taches.find((t) => t.externe !== null)!; e.statut = 'a_faire'; return d; } },
    // Une tâche livrée dont la dépendance ne l'est pas : le témoin prend une tâche `fusionnee`
    // et remet sa dépendance à `a_faire`.
    { famille: 'dep_non_livree', defaut: () => {
      const d = copie();
      const livree = d.taches.find((t) => LIVREE.has(t.statut) && t.deps.length > 0)!;
      const dep = d.taches.find((t) => t.id === livree.deps[0])!;
      dep.statut = 'a_faire'; dep.owner = null; dep.branch = null;
      return d;
    } },

    // ── l'attestation inter-dépôt (GOV-038) ──────────────────────────────────
    // Le cas réel : INT-T01b livrée par la PR 998 du dépôt axionia, et le backlog muet.
    { famille: 'attestation_absente', defaut: () => {
      const d = copie(); const t = livreeIci(d); t.repo = 'axionia'; t.pr = null; return d;
    } },
    // Le cas DANGEREUX : le numéro écrit dans `pr`, que les vues rendent `PR#998` sans dépôt.
    { famille: 'pr_nu_hors_depot', defaut: () => {
      const d = copie(); const t = livreeIciAvecPr(d); t.repo = 'axionia'; t.attestation = attestationValide(); return d;
    } },
    { famille: 'attestation_hors_sujet', defaut: () => {
      const d = copie(); livreeIci(d).attestation = attestationValide(); return d;
    } },
    { famille: 'attestation_sans_livraison', defaut: () => {
      const d = copie(); const t = aFaireIci(d); t.repo = 'axionia'; t.attestation = attestationValide(); return d;
    } },
    // Le numéro de PR mis à la place du SHA : la confusion même que l'attestation doit rendre
    // impossible. `998` est réattribué dans chaque dépôt ; un SHA de 40 hex ne l'est nulle part.
    { famille: 'attestation_sha_non_conforme', defaut: () => {
      const d = copie(); livreeAilleurs(d).attestation = { ...attestationValide(), sha: '998' }; return d;
    } },
    { famille: 'attestation_date_non_conforme', defaut: () => {
      const d = copie(); livreeAilleurs(d).attestation = { ...attestationValide(), fusionneeAt: '05/09/2026 13:04' }; return d;
    } },
    { famille: 'livraison_repo_externe', defaut: () => {
      const d = copie(); const t = livreeIci(d); t.repo = 'externe'; t.pr = null; return d;
    } },
  ];

  /**
   * Ce que la garde doit LAISSER PASSER. Un témoin prouve qu'une garde sait rougir ; il ne prouve
   * jamais qu'elle ne rougit pas sur du légitime. Les deux formes de branche arrêtées par
   * `partners/ADR-0007` sont exactement le cas où une garde trop stricte bloquerait
   * `pnpm lot:cloture`, seul écrivain du statut — c'est ce qui est arrivé au lot L-1-01.
   */
  const CONTRE_TEMOINS: { nom: string; muter: () => { taches: Tache[] } }[] = [
    { nom: 'une branche de LOT — la forme normale (partners/ADR-0007)',
      muter: () => { const d = copie(); premiere(d).branch = 'lot/L-9-99-integration'; return d; } },
    { nom: 'une branche de TÂCHE — la forme dérogatoire (partners/ADR-0007)',
      muter: () => { const d = copie(); premiere(d).branch = 't/gov-012'; return d; } },

    // ── attestation : ce que GOV-038 doit LAISSER PASSER ─────────────────────
    // Sans ces trois-là, les sept familles ci-dessus prouveraient seulement qu'une garde sait
    // rougir — jamais qu'elle sait se taire. Le troisième est le plus important : c'est la forme
    // même que la tâche introduit, et une garde qui la refuserait bloquerait `pnpm lot:cloture`.
    { nom: 'une tâche `partners` livrée normalement, PR de ce dépôt et aucune attestation',
      muter: () => { const d = copie(); livreeIci(d).pr = 4242; return d; } },
    { nom: 'une tâche `axionia` encore `a_faire` : rien à attester tant que rien n’est livré',
      muter: () => { const d = copie(); aFaireIci(d).repo = 'axionia'; return d; } },
    { nom: 'une tâche `axionia` LIVRÉE avec son attestation et sans `pr` nu — la forme de GOV-038',
      muter: () => { const d = copie(); livreeAilleurs(d); return d; } },
  ];

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.muter(), schema, registre);
    if (f.length > 0) {
      console.error(
        `\u274c Le contre-t\u00e9moin \u00ab ${c.nom} \u00bb a fait rougir la garde alors qu'il est l\u00e9gitime :`
      );
      f.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut(), schema, registre);
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
  console.log(`   ${CONTRE_TEMOINS.length} contre-t\u00e9moin(s) restent verts.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
const fautes = controler(doc, schema, registre);
if (fautes.length === 0) {
  const j = doc.taches.reduce((s, t) => s + t.estimateDays, 0);
  const parPhase = [-1, 0, 1, 2, 3].map((p) => {
    const l = doc.taches.filter((t) => t.phase === p);
    return `${p} : ${l.length} / ${l.reduce((s, t) => s + t.estimateDays, 0).toFixed(2)} j`;
  });
  const bloquantes = [...registre.parId.values()].filter((d) => d.section === 1 && d.trancheeLe === null);
  console.log(
    `✅ gov:tasks — ${doc.taches.length} tâches, ${j.toFixed(2)} j, ${registre.declarees.size} décisions au registre ` +
      `(${bloquantes.length} bloquante(s) : ${bloquantes.map((d) => d.id).join(', ') || 'aucune'}).`
  );
  console.log(`   ${parPhase.join('  ·  ')}`);
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:tasks — ${fautes.length} incohérence(s) dans ${CHEMIN_TACHES} :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
