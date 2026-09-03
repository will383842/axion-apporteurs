/**
 * gov-sonde.ts — la garde des affirmations sur le code d'axionia (GOV-004, REQ-GOV-004).
 *
 * USAGE : pnpm gov:sonde                    (échoue si une affirmation n'est plus tenable)
 *         pnpm gov:sonde --prove            (un témoin par famille, chacun vu rougir ; contre-témoins verts)
 *         pnpm gov:sonde --exiger-axionia   (refuse de passer au vert si le dépôt voisin est hors de portée)
 *
 * LE PROBLÈME QU'ELLE TIENT. Le dossier de spécification a affirmé pendant des semaines que le modèle
 * `Invoice` existait chez axionia, qu'un champ `payerSiret` portait l'identifiant du payeur, qu'un
 * montant encaissé était hors taxe. Rien de tout cela n'était vrai, et rien ne pouvait le dire : une
 * affirmation recopiée d'un document à l'autre ne porte ni date, ni chemin, ni SHA. Le tableau
 * `docs/AFFIRMATIONS-AXIONIA.md` §2 les rejoue une par une ; cette garde vérifie que le tableau reste
 * ce qu'il prétend être, et — quand le dépôt voisin est à portée — que le code n'a pas bougé sous lui.
 *
 * CE QU'ELLE VÉRIFIE, PAR FAMILLE :
 *
 *   — la FORME du tableau : cinq colonnes, un en-tête stable, au moins 25 affirmations (l'acceptation
 *     de GOV-004), des repères uniques, un verdict pris dans un vocabulaire fermé ;
 *   — la PREUVE : chaque ligne porte un chemin ; elle porte en plus un `chemin:ligne` sauf quand le
 *     fait constaté est une ABSENCE, qui n'a par nature aucune ligne où se lire ;
 *   — la DATE ET LE SHA : la cinquième colonne se lit `AAAA-MM-JJ @ <SHA court>`. Sans le SHA, la
 *     date ne dit pas contre QUOI la ligne a été rejouée, et la preuve n'est pas rejouable ;
 *   — la BARRE VERTICALE : une barre nue entre accents graves casse la colonne suivante. Les accents
 *     graves ne protègent pas le séparateur de tableau — c'est la faute qui a cassé le premier jet ;
 *   — l'ACCEPTATION de GOV-004 : les huit affirmations qu'elle nomme ont chacune une ligne. Une
 *     acceptation dont deux points n'ont aucun verdict n'a pas été tenue, elle a été contournée ;
 *   — le REGISTRE : les cinq affirmations invalidées que REQ-GOV-004 nomme figurent dans
 *     `docs/DECISIONS.md` avec la mention FAUSSE. C'est la seconde moitié de l'exigence ;
 *   — les SOURCES : une source de `docs/requirements.json` ou `docs/tasks.json` qui LOCALISE une
 *     affirmation dans du code (`chemin.ext:ligne`) doit être couverte par une ligne du tableau, qui
 *     porte la date et le SHA. Une source qui se contente de DÉSIGNER un fichier (« patron
 *     `src/env.ts` ») n'affirme aucun fait : elle n'a rien à dater, et elle est seulement listée ;
 *   — les SONDES : les faits réductibles à une recherche exacte sont REJOUÉS contre l'arbre d'axionia.
 *     Un fait devenu faux, ou un verdict qui contredit la mesure, rougit.
 *
 * CE QU'ELLE NE PEUT PAS FAIRE, ET LE DIT. Le dépôt voisin n'est pas dans la CI : `axion-apporteurs`
 * et `axionia` sont deux dépôts. Quand l'arbre est hors de portée, les sondes ne sont PAS rejouées et
 * la garde l'écrit en toutes lettres — elle ne fait pas semblant. Tout le reste (forme, preuve, date,
 * SHA, acceptation, registre, sources) est vérifié partout, CI comprise. `--exiger-axionia` est le
 * mode local et de veille : il refuse le vert tant que l'arbre n'a pas été rejoué.
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const CHEMIN_AFFIRMATIONS = 'docs/AFFIRMATIONS-AXIONIA.md';
const CHEMIN_DECISIONS = 'docs/DECISIONS.md';
const CHEMIN_REGISTRE = 'docs/requirements.json';
const CHEMIN_TACHES = 'docs/tasks.json';

/** L'acceptation de GOV-004 : « ≥ 25 affirmations avec "vérifié le" ». Le compte est l'invariant. */
const MINIMUM_AFFIRMATIONS = 25;

const TITRE_TABLEAU = '## 2. Tableau des affirmations';
const ENTETE = ['Repère', 'Affirmation', 'Verdict', "Où je l'ai vérifiée", 'Vérifié le'];
const VERDICTS = ['vérifiée', 'FAUSSE', 'partielle', 'non vérifiable'];

/** `AAAA-MM-JJ @ <SHA court>` — la date SEULE ne dit pas contre quoi la ligne a été rejouée. */
const DATE_ET_SHA = /^\d{4}-\d{2}-\d{2}\s*@\s*[0-9a-f]{7,40}$/;
/** Un chemin de fichier suivi d'un numéro de ligne : une affirmation LOCALISÉE. */
const CHEMIN_LIGNE = /[A-Za-z0-9_.[\]@-]+(?:\/[A-Za-z0-9_.[\]@-]+)*\.(?:ts|tsx|prisma|sql|sh|json|md|yml):\d+/g;
/** Un chemin, avec ou sans ligne : le minimum pour que la preuve pointe quelque part. */
const CHEMIN_SEUL = /[A-Za-z0-9_.[\]@-]+\/[A-Za-z0-9_.[\]@*-]+/;
/** Un fait d'ABSENCE : il n'a aucune ligne où se lire, et exiger un numéro de ligne serait absurde. */
const ABSENCE = /(z[ée]ro occurrence|aucune occurrence|aucun[e]? |n'existe nulle part|ne renvoie rien)/i;

/** Les huit points de l'acceptation de GOV-004. Chacun doit avoir sa ligne au tableau. */
const ACCEPTATION: { point: string; motif: RegExp }[] = [
  { point: 'Invoice', motif: /`Invoice`/ },
  { point: 'Refund', motif: /`Refund`/ },
  { point: 'payerSiret', motif: /payerSiret/ },
  { point: 'HT encaissé', motif: /amountCents/ },
  { point: 'chaîne de résolution du client', motif: /encaissement[^|]{0,200}SIREN/ },
  { point: 'patron Calendly', motif: /Calendly/ },
  { point: 'index EmargementToken', motif: /emargement_token|EmargementToken/ },
  { point: 'score non enregistré avec son barème', motif: /SCORE_POIDS/ },
];

/** Les cinq affirmations invalidées que REQ-GOV-004 exige de retrouver AU REGISTRE, avec « FAUSSE ». */
const INVALIDEES: { libelle: string; motif: RegExp }[] = [
  { libelle: 'Invoice', motif: /`Invoice`/ },
  { libelle: 'Refund', motif: /`Refund`/ },
  { libelle: 'payerSiret', motif: /payerSiret/ },
  { libelle: 'montant HT encaissé', motif: /amountCents/ },
  { libelle: 'chaîne de résolution du client', motif: /cha[îi]ne de r[ée]solution/i },
];

// ── les sondes : les faits réductibles à une recherche exacte ────────────────

type Sonde = { repere: string; quoi: string; attendu: boolean; mesurer: (racine: string) => boolean };

function lire(racine: string, relatif: string): string | null {
  const p = join(racine, relatif);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function dansFichier(racine: string, relatif: string, motif: RegExp): boolean {
  const t = lire(racine, relatif);
  return t === null ? false : motif.test(t);
}

/** Balaie un sous-arbre : les index uniques PARTIELS d'axionia vivent en SQL brut, pas dans le schéma. */
function dansArbre(racine: string, relatif: string, motif: RegExp, extensions: string[]): boolean {
  const depart = join(racine, relatif);
  if (!existsSync(depart)) return false;
  const pile = [depart];
  while (pile.length > 0) {
    const courant = pile.pop() as string;
    let entrees: string[];
    try {
      entrees = readdirSync(courant);
    } catch {
      continue;
    }
    for (const e of entrees) {
      const p = join(courant, e);
      let estDossier = false;
      try {
        estDossier = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (estDossier) {
        pile.push(p);
        continue;
      }
      if (!extensions.some((x) => e.endsWith(x))) continue;
      if (motif.test(readFileSync(p, 'utf8'))) return true;
    }
  }
  return false;
}

const SCHEMA = 'prisma/schema.prisma';
const MIGRATIONS = 'prisma/migrations';
const PRICING = 'src/content/pricing.ts';
const SCORING = 'src/lib/commercial-application/scoring.ts';

const SONDES: Sonde[] = [
  { repere: 'AFF-01', quoi: 'un modèle Invoice au schéma', attendu: false, mesurer: (r) => dansFichier(r, SCHEMA, /^model Invoice\b/m) },
  { repere: 'AFF-02', quoi: 'un modèle Refund au schéma', attendu: false, mesurer: (r) => dansFichier(r, SCHEMA, /^model Refund\b/m) },
  { repere: 'AFF-03', quoi: 'PaymentScheduleProfile au schéma', attendu: false, mesurer: (r) => dansFichier(r, SCHEMA, /PaymentScheduleProfile/) },
  { repere: 'AFF-05', quoi: 'un champ payerSiret au schéma', attendu: false, mesurer: (r) => dansFichier(r, SCHEMA, /payerSiret/) },
  { repere: 'AFF-19', quoi: "l'outbox de synchronisation", attendu: true, mesurer: (r) => dansFichier(r, SCHEMA, /^model CrmSyncOutbox\b/m) },
  { repere: 'AFF-20', quoi: 'le journal de réception signé', attendu: true, mesurer: (r) => dansFichier(r, SCHEMA, /^model DocusealWebhookEvent\b/m) },
  { repere: 'AFF-21', quoi: 'le modèle de jeton haché', attendu: true, mesurer: (r) => dansFichier(r, SCHEMA, /^model EmargementToken\b/m) },
  { repere: 'AFF-22', quoi: "l'index unique partiel « un seul jeton vivant »", attendu: true, mesurer: (r) => dansArbre(r, MIGRATIONS, /emargement_token_enrollment_actif/, ['.sql']) },
  { repere: 'AFF-23', quoi: "l'index unique partiel sur les jetons de signature", attendu: true, mesurer: (r) => dansArbre(r, MIGRATIONS, /document_signature_token_actif/, ['.sql']) },
  { repere: 'AFF-24', quoi: 'la table des lignes de rémunération', attendu: true, mesurer: (r) => dansFichier(r, PRICING, /COMMERCIAL_COMMISSIONS/) },
  { repere: 'AFF-25', quoi: 'un champ commissionId sur les paliers', attendu: false, mesurer: (r) => dansFichier(r, PRICING, /commissionId/) },
  { repere: 'AFF-30', quoi: "l'entité historique en défaut de colonne", attendu: true, mesurer: (r) => dansArbre(r, MIGRATIONS, /Axion-IA O[ÜU]/, ['.sql']) },
  { repere: 'AFF-39', quoi: 'le relevé mensuel gelé', attendu: true, mesurer: (r) => dansFichier(r, SCHEMA, /^model TrainerStatement\b/m) },
  { repere: 'AFF-46', quoi: 'une version du barème enregistrée avec le score', attendu: false, mesurer: (r) => dansFichier(r, SCORING, /scoreBaremeVersion/) },
];

// ── lecture du tableau ───────────────────────────────────────────────────────

type LigneTableau = { numero: number; brute: string; cellules: string[] };
type Faute = { famille: string; message: string };

/** Découpe une ligne de tableau en respectant les barres ÉCHAPPÉES : `\|` n'est pas un séparateur. */
function decouper(ligne: string): string[] {
  const brut = ligne.trim();
  const out: string[] = [];
  let courant = '';
  for (let i = 0; i < brut.length; i++) {
    if (brut[i] === '\\' && brut[i + 1] === '|') {
      courant += '\\|';
      i++;
      continue;
    }
    if (brut[i] === '|') {
      out.push(courant);
      courant = '';
      continue;
    }
    courant += brut[i];
  }
  out.push(courant);
  while (out.length > 0 && (out[0] as string).trim() === '') out.shift();
  while (out.length > 0 && (out[out.length - 1] as string).trim() === '') out.pop();
  return out.map((c) => c.trim());
}

/** Une barre NUE entre accents graves : elle casse la colonne suivante sans prévenir. */
function barreNueEntreAccents(ligne: string): boolean {
  const spans = /`([^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = spans.exec(ligne)) !== null) {
    const dedans = m[1] as string;
    for (let i = 0; i < dedans.length; i++) {
      if (dedans[i] === '|' && dedans[i - 1] !== '\\') return true;
    }
  }
  return false;
}

function extraireTableau(texte: string): { entete: string[] | null; lignes: LigneTableau[] } {
  const toutes = texte.split('\n');
  const debut = toutes.findIndex((l) => l.trim() === TITRE_TABLEAU);
  if (debut < 0) return { entete: null, lignes: [] };
  const lignes: LigneTableau[] = [];
  let entete: string[] | null = null;
  for (let i = debut + 1; i < toutes.length; i++) {
    const l = toutes[i] as string;
    if (l.startsWith('## ')) break;
    if (!l.trimStart().startsWith('|')) continue;
    if (/^[|\s:-]+$/.test(l)) continue;
    const cellules = decouper(l);
    if (entete === null) {
      entete = cellules;
      continue;
    }
    lignes.push({ numero: i + 1, brute: l, cellules });
  }
  return { entete, lignes };
}

function jetonsChemin(texte: string): string[] {
  CHEMIN_LIGNE.lastIndex = 0;
  return texte.match(CHEMIN_LIGNE) ?? [];
}

function nettoyerVerdict(cellule: string): string {
  return cellule.replace(/\*\*/g, '').split('—')[0]?.trim() ?? '';
}

// ── le contrôle ──────────────────────────────────────────────────────────────

type Entrees = {
  affirmations: string;
  decisions: string;
  sources: { id: string; texte: string }[];
  racineAxionia: string | null;
};

function controler(e: Entrees): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  const { entete, lignes } = extraireTableau(e.affirmations);

  if (entete === null) {
    ajouter('tableau_illisible', `${CHEMIN_AFFIRMATIONS} — la section « ${TITRE_TABLEAU} » est introuvable.`);
    return fautes;
  }
  if (entete.join('|') !== ENTETE.join('|')) {
    ajouter(
      'tableau_illisible',
      `${CHEMIN_AFFIRMATIONS} — l'en-tête du tableau est « ${entete.join(' | ')} », attendu ` +
        `« ${ENTETE.join(' | ')} ». Les colonnes sont lues par leur RANG : les renommer casse la garde.`
    );
  }
  for (const l of lignes) {
    if (l.cellules.length !== ENTETE.length) {
      ajouter(
        'tableau_illisible',
        `${CHEMIN_AFFIRMATIONS}:${l.numero} — ${l.cellules.length} colonnes au lieu de ${ENTETE.length}. ` +
          `Une barre verticale non échappée dans une cellule en fabrique une de plus.`
      );
    }
  }

  if (lignes.length < MINIMUM_AFFIRMATIONS) {
    ajouter(
      'affirmations_insuffisantes',
      `${CHEMIN_AFFIRMATIONS} — ${lignes.length} affirmation(s) au tableau §2 ; l'acceptation de GOV-004 ` +
        `en exige au moins ${MINIMUM_AFFIRMATIONS}.`
    );
  }

  const vus = new Set<string>();
  for (const l of lignes) {
    const repere = (l.cellules[0] ?? '').replace(/[`*]/g, '').trim();
    const verdict = nettoyerVerdict(l.cellules[2] ?? '');
    const preuve = l.cellules[3] ?? '';
    const date = (l.cellules[4] ?? '').replace(/[`*]/g, '').trim();

    if (vus.has(repere)) {
      ajouter(
        'repere_double',
        `${CHEMIN_AFFIRMATIONS}:${l.numero} — le repère ${repere} apparaît plus d'une fois. Une tâche qui ` +
          `le cite ne saurait pas laquelle des deux lignes elle invoque.`
      );
    }
    vus.add(repere);

    if (!VERDICTS.includes(verdict)) {
      ajouter(
        'verdict_inconnu',
        `${CHEMIN_AFFIRMATIONS}:${l.numero} — ${repere} porte le verdict « ${verdict} », hors du vocabulaire ` +
          `fermé ${VERDICTS.map((v) => `« ${v} »`).join(', ')}.`
      );
    }

    if (!CHEMIN_SEUL.test(preuve)) {
      ajouter(
        'preuve_sans_ancre',
        `${CHEMIN_AFFIRMATIONS}:${l.numero} — ${repere} ne cite aucun chemin : la preuve n'est pas rejouable.`
      );
    } else if (jetonsChemin(preuve).length === 0 && !ABSENCE.test(preuve)) {
      ajouter(
        'preuve_sans_ancre',
        `${CHEMIN_AFFIRMATIONS}:${l.numero} — ${repere} cite un chemin sans numéro de ligne. Seul un fait ` +
          `d'ABSENCE en est dispensé : une absence n'a pas de ligne où se lire.`
      );
    }

    if (!DATE_ET_SHA.test(date)) {
      ajouter(
        'date_ou_sha_manquant',
        `${CHEMIN_AFFIRMATIONS}:${l.numero} — ${repere} porte « ${date} » en colonne « Vérifié le », attendu ` +
          `« AAAA-MM-JJ @ <SHA court> ». Sans le SHA, la date ne dit pas CONTRE QUOI la ligne a été rejouée.`
      );
    }

    if (barreNueEntreAccents(l.brute)) {
      ajouter(
        'barre_non_echappee',
        `${CHEMIN_AFFIRMATIONS}:${l.numero} — barre verticale nue entre accents graves. Les accents graves ` +
          `ne protègent PAS le séparateur de colonnes : écris \\| même dans du code cité.`
      );
    }
  }

  const tableau = lignes.map((l) => l.brute).join('\n');
  for (const a of ACCEPTATION) {
    if (!a.motif.test(tableau)) {
      ajouter(
        'acceptation_non_couverte',
        `${CHEMIN_AFFIRMATIONS} — l'acceptation de GOV-004 nomme « ${a.point} » ; aucune ligne du tableau §2 ` +
          `ne rend de verdict dessus. Une acceptation dont un point n'a pas de verdict n'est pas tenue.`
      );
    }
  }

  const lignesRegistre = e.decisions.split('\n');
  for (const inv of INVALIDEES) {
    const trouvee = lignesRegistre.some((l) => inv.motif.test(l) && l.includes('FAUSSE'));
    if (!trouvee) {
      ajouter(
        'invalidee_absente_du_registre',
        `${CHEMIN_DECISIONS} — l'affirmation invalidée « ${inv.libelle} » n'y figure pas avec la mention ` +
          `FAUSSE. REQ-GOV-004 l'exige : une décision prise sur une affirmation fausse ne se distingue ` +
          `plus, ensuite, d'une décision prise sur un fait.`
      );
    }
  }

  const ancresDuTableau = jetonsChemin(e.affirmations);
  for (const s of e.sources) {
    for (const jeton of jetonsChemin(s.texte)) {
      const couverte = ancresDuTableau.some((a) => a === jeton || a.endsWith('/' + jeton) || jeton.endsWith('/' + a));
      if (!couverte) {
        ajouter(
          'source_axionia_sans_repere',
          `${s.id} localise une affirmation dans du code (« ${jeton} ») sans qu'aucune ligne de ` +
            `${CHEMIN_AFFIRMATIONS} §2 ne la porte. Une source qui cite un chemin ET une ligne affirme un ` +
            `FAIT : il lui faut une date et un SHA, donc un repère AFF-nn.`
        );
      }
    }
  }

  if (e.racineAxionia !== null) {
    const parRepere = new Map<string, string>();
    for (const l of lignes) {
      parRepere.set((l.cellules[0] ?? '').replace(/[`*]/g, '').trim(), nettoyerVerdict(l.cellules[2] ?? ''));
    }
    for (const s of SONDES) {
      const mesure = s.mesurer(e.racineAxionia);
      if (mesure !== s.attendu) {
        ajouter(
          'sonde_dementie',
          `${s.repere} — le code d'axionia a bougé : « ${s.quoi} » est désormais ` +
            `${mesure ? 'PRÉSENT' : 'ABSENT'}, le tableau le donne pour ${s.attendu ? 'présent' : 'absent'}. ` +
            `Revérifie la ligne, redate-la, et redonne son SHA.`
        );
        continue;
      }
      const verdict = parRepere.get(s.repere);
      if (verdict === undefined) continue;
      const contredit = (verdict === 'vérifiée' && !s.attendu) || (verdict === 'FAUSSE' && s.attendu);
      if (contredit) {
        ajouter(
          'sonde_dementie',
          `${s.repere} — le verdict « ${verdict} » contredit la sonde : « ${s.quoi} » est ` +
            `${s.attendu ? 'PRÉSENT' : 'ABSENT'} dans l'arbre rejoué.`
        );
      }
    }
  }

  return fautes;
}

const FAMILLES = [
  'tableau_illisible',
  'affirmations_insuffisantes',
  'repere_double',
  'verdict_inconnu',
  'preuve_sans_ancre',
  'date_ou_sha_manquant',
  'barre_non_echappee',
  'acceptation_non_couverte',
  'invalidee_absente_du_registre',
  'source_axionia_sans_repere',
  'sonde_dementie',
];

// ── entrées ──────────────────────────────────────────────────────────────────

for (const f of [CHEMIN_AFFIRMATIONS, CHEMIN_DECISIONS, CHEMIN_REGISTRE, CHEMIN_TACHES]) {
  if (!existsSync(f)) {
    console.error(`❌ gov:sonde — ${f} est introuvable.`);
    process.exit(1);
  }
}

const affirmations = readFileSync(CHEMIN_AFFIRMATIONS, 'utf8');
const decisions = readFileSync(CHEMIN_DECISIONS, 'utf8');
const exigences = (JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { exigences: { id: string; source: string }[] }).exigences;
const taches = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: { id: string; acceptance: string | null }[] }).taches;

const sources: { id: string; texte: string }[] = [
  ...exigences.map((x) => ({ id: x.id, texte: x.source ?? '' })),
  ...taches.map((t) => ({ id: t.id, texte: t.acceptance ?? '' })),
];

const RACINE_PAR_DEFAUT = process.env.AXIONIA_REPO ?? join('..', 'Axion-IA', 'axionia');
const axioniaDispo = existsSync(join(RACINE_PAR_DEFAUT, SCHEMA));

// ── mode --prove ─────────────────────────────────────────────────────────────

/** Un arbre d'axionia SYNTHÉTIQUE : la preuve ne dépend pas de la présence du dépôt voisin. */
function arbreFactice(): string {
  const racine = mkdtempSync(join(tmpdir(), 'gov-sonde-'));
  const poser = (relatif: string, contenu: string): void => {
    const p = join(racine, relatif);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, contenu, 'utf8');
  };
  poser(
    SCHEMA,
    ['model CrmSyncOutbox {', '}', 'model DocusealWebhookEvent {', '}', 'model EmargementToken {', '}', 'model TrainerStatement {', '}', ''].join('\n')
  );
  poser(join(MIGRATIONS, '20260721120000_x', 'migration.sql'), 'CREATE UNIQUE INDEX "emargement_token_enrollment_actif"\n');
  poser(join(MIGRATIONS, '20260730090000_y', 'migration.sql'), 'CREATE UNIQUE INDEX "document_signature_token_actif"\n');
  poser(join(MIGRATIONS, '20260516142017_z', 'migration.sql'), "DEFAULT 'Axion-IA OÜ'\n");
  poser(PRICING, 'export const COMMERCIAL_COMMISSIONS = [];\n');
  poser(SCORING, 'export const SCORE_POIDS = {} as const;\n');
  return racine;
}

if (process.argv.includes('--prove')) {
  const factice = arbreFactice();
  try {
    const base: Entrees = { affirmations, decisions, sources, racineAxionia: factice };
    const dejaFautif = controler(base);
    if (dejaFautif.length > 0) {
      console.error(`❌ La preuve part d'un état DÉJÀ fautif (${dejaFautif.length}) — corrige d'abord :`);
      dejaFautif.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
      process.exit(1);
    }

    /** Remplace la première ligne du tableau §2 qui porte `repere` par `remplacement`. */
    const remplacerLigne = (texte: string, repere: string, remplacement: (l: string) => string): string =>
      texte
        .split('\n')
        .map((l) => (l.trimStart().startsWith(`| ${repere} `) ? remplacement(l) : l))
        .join('\n');

    const TEMOINS: { famille: string; defaut: () => Entrees }[] = [
      {
        famille: 'tableau_illisible',
        defaut: () => ({ ...base, affirmations: affirmations.replace('| Repère | Affirmation | Verdict |', '| Repere | Affirmation |') }),
      },
      {
        famille: 'affirmations_insuffisantes',
        defaut: () => {
          const l = affirmations.split('\n');
          const debut = l.findIndex((x) => x.trim() === TITRE_TABLEAU);
          let gardees = 0;
          return {
            ...base,
            affirmations: l
              .filter((x, i) => {
                if (i <= debut + 2 || !x.trimStart().startsWith('| AFF-')) return true;
                gardees++;
                return gardees <= 5;
              })
              .join('\n'),
          };
        },
      },
      {
        famille: 'repere_double',
        defaut: () => {
          const l = affirmations.split('\n');
          const i = l.findIndex((x) => x.trimStart().startsWith('| AFF-01 '));
          return { ...base, affirmations: [...l.slice(0, i + 1), l[i] as string, ...l.slice(i + 1)].join('\n') };
        },
      },
      {
        famille: 'verdict_inconnu',
        defaut: () => ({ ...base, affirmations: remplacerLigne(affirmations, 'AFF-01', (l) => l.replace('**FAUSSE**', '**douteuse**')) }),
      },
      {
        famille: 'preuve_sans_ancre',
        defaut: () => ({
          ...base,
          affirmations: remplacerLigne(affirmations, 'AFF-07', (l) => {
            const c = decouper(l);
            c[3] = 'je crois me souvenir que oui';
            return `| ${c.join(' | ')} |`;
          }),
        }),
      },
      {
        famille: 'date_ou_sha_manquant',
        defaut: () => ({
          ...base,
          affirmations: remplacerLigne(affirmations, 'AFF-01', (l) => l.replace('2026-09-03 @ ad53f14a', '2026-09-03')),
        }),
      },
      {
        famille: 'barre_non_echappee',
        defaut: () => ({
          ...base,
          affirmations: remplacerLigne(affirmations, 'AFF-07', (l) => l.replace('**vérifiée**', '**vérifiée** `a | b`')),
        }),
      },
      {
        famille: 'acceptation_non_couverte',
        defaut: () => ({
          ...base,
          affirmations: affirmations
            .split('\n')
            .filter((l) => !l.trimStart().startsWith('| AFF-46 '))
            .join('\n'),
        }),
      },
      {
        famille: 'invalidee_absente_du_registre',
        defaut: () => ({ ...base, decisions: decisions.split('\n').filter((l) => !/`Refund`/.test(l)).join('\n') }),
      },
      {
        famille: 'source_axionia_sans_repere',
        defaut: () => ({
          ...base,
          sources: [...sources, { id: 'REQ-TEMOIN-001', texte: 'affirmation lue dans src/server/inconnu.ts:42, jamais datée' }],
        }),
      },
      {
        famille: 'sonde_dementie',
        defaut: () => ({
          ...base,
          affirmations: remplacerLigne(affirmations, 'AFF-01', (l) => l.replace('**FAUSSE**', '**vérifiée**')),
        }),
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

    /** Ce qui RESSEMBLE à une faute sans en être une. Une garde qui rougit là-dessus est inutilisable. */
    const CONTRE_TEMOINS: { quoi: string; cas: () => Entrees; famille: string }[] = [
      {
        quoi: 'une barre ÉCHAPPÉE entre accents graves',
        famille: 'barre_non_echappee',
        cas: () => ({ ...base, affirmations: remplacerLigne(affirmations, 'AFF-07', (l) => l.replace('**vérifiée**', '**vérifiée** `a \\| b`')) }),
      },
      {
        quoi: 'une source qui DÉSIGNE un fichier sans en affirmer le contenu',
        famille: 'source_axionia_sans_repere',
        cas: () => ({ ...base, sources: [...sources, { id: 'REQ-TEMOIN-002', texte: 'nouvelle (patron `src/env.ts`, `next.config.ts`)' }] }),
      },
      {
        quoi: "une preuve d'ABSENCE, qui n'a aucune ligne où se lire",
        famille: 'preuve_sans_ancre',
        cas: () => ({
          ...base,
          affirmations: remplacerLigne(affirmations, 'AFF-07', (l) => {
            const c = decouper(l);
            c[3] = 'Zéro occurrence dans `axionia/src/**`';
            return `| ${c.join(' | ')} |`;
          }),
        }),
      },
      {
        quoi: 'un dépôt voisin hors de portée : les sondes ne sont pas rejouées, elles ne mentent pas',
        famille: 'sonde_dementie',
        cas: () => ({ ...base, racineAxionia: null }),
      },
      {
        quoi: 'un verdict « partielle » : la sonde le mesure, elle ne le contredit jamais',
        famille: 'sonde_dementie',
        cas: () => ({ ...base, affirmations: remplacerLigne(affirmations, 'AFF-30', (l) => l) }),
      },
    ];

    for (const ct of CONTRE_TEMOINS) {
      const f = controler(ct.cas()).filter((x) => x.famille === ct.famille);
      if (f.length > 0) {
        console.error(`❌ Contre-témoin ROUGE — ${ct.quoi} : la garde rougit sur ce qui est légitime.`);
        f.slice(0, 3).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
        process.exit(1);
      }
    }

    console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
    console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
    console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts :`);
    console.log(`   ${CONTRE_TEMOINS.map((c) => '· ' + c.quoi).join('\n   ')}`);
    process.exit(0);
  } finally {
    rmSync(factice, { recursive: true, force: true });
  }
}

// ── mode normal ──────────────────────────────────────────────────────────────

const exigerAxionia = process.argv.includes('--exiger-axionia');
if (exigerAxionia && !axioniaDispo) {
  console.error(
    `❌ gov:sonde --exiger-axionia — l'arbre d'axionia est hors de portée (${RACINE_PAR_DEFAUT}). ` +
      `Pose AXIONIA_REPO sur le chemin du dépôt voisin, ou lance la garde sans ce drapeau en sachant ` +
      `que les ${SONDES.length} sondes ne seront PAS rejouées.`
  );
  process.exit(1);
}

const fautes = controler({ affirmations, decisions, sources, racineAxionia: axioniaDispo ? RACINE_PAR_DEFAUT : null });

if (fautes.length === 0) {
  const { lignes } = extraireTableau(affirmations);
  console.log(`✅ gov:sonde — ${lignes.length} affirmations datées et rattachées à un SHA, ${INVALIDEES.length} invalidées au registre.`);
  if (axioniaDispo) {
    console.log(`   ${SONDES.length} sondes rejouées contre ${RACINE_PAR_DEFAUT} : aucun fait n'a bougé.`);
  } else {
    console.log(
      `   ⚠️  Les ${SONDES.length} sondes n'ont PAS été rejouées : le dépôt voisin est hors de portée ` +
        `(${RACINE_PAR_DEFAUT}). La forme, les dates, les SHA, l'acceptation et le registre le sont, eux.\n` +
        `   Pour rejouer le code : AXIONIA_REPO=<chemin> pnpm gov:sonde --exiger-axionia`
    );
  }
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:sonde — ${fautes.length} affirmation(s) ou source(s) en défaut :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
