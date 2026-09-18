/**
 * gov-requirements.ts — la garde du registre d'exigences (GOV-001, REQ-GOV-001 / REQ-GOV-026).
 *
 * USAGE : pnpm gov:requirements                 (échoue si le registre est invalide ou incohérent)
 *         pnpm gov:requirements --prove         (un défaut PAR FAMILLE, chacun vu rougir)
 *         pnpm gov:requirements --render        (écrit `docs/REQUIREMENTS.md`, la VUE du registre)
 *         pnpm gov:requirements --verifie-rendu (n'écrit rien ; sort 1 si la vue a dérivé)
 *         …--out <chemin>                       travaille sur une autre vue (bancs d'essai)
 *
 * `docs/requirements.json` est la SOURCE ; `docs/REQUIREMENTS.md` en est une vue générée.
 *
 * ⚠️ ELLE NE L'A PAS TOUJOURS ÉTÉ. Jusqu'à GOV-024, `docs/REQUIREMENTS.md` n'avait AUCUN
 * générateur : son bandeau affirmait « la cohérence des deux est tenue par `pnpm gov:requirements` »
 * alors qu'aucun contrôle ne comparait la vue à sa source, et le point 5 de `docs/PRESEANCE.md` §5
 * le constatait sans que personne ne puisse le refermer. Le fichier avait effectivement dérivé :
 * il annonçait **353** exigences quand le registre en portait **354**, `REQ-GOV-032` manquant.
 * Le bandeau est désormais ÉMIS PAR CE FICHIER — il ne peut plus mentir sans que `--verifie-rendu`
 * rougisse (`docs/PRESEANCE.md` §4.1 : bandeau émis par le générateur, jamais collé).
 *
 * Ce que la garde tient, et que rien d'autre ne tenait :
 *
 *   — le schéma (`scripts/lot/requirements.schema.json`), `remplaceePar` compris ;
 *   — l'unicité des identifiants, et une SOURCE non vide pour chacun : une exigence sans origine
 *     ne peut être ni datée ni contestée ;
 *   — la résolution des absorptions, et l'absence de CHAÎNE (A absorbée par B, B absorbée par C) :
 *     un lecteur qui suit `remplaceePar` doit atterrir en un saut sur un texte en vigueur ;
 *   — la couverture des **21 modules** et des **12 étapes** de l'audit de bout en bout : un module
 *     sans exigence, c'est un pan du produit que personne n'a spécifié — ou une dérivation ratée ;
 *   — le PORTEUR : toute exigence `active` est citée par au moins une tâche. Sans cela elle ne sera
 *     jamais codée, et personne ne s'en apercevra — c'était le cas de six d'entre elles, dont
 *     `REQ-DM-041`, qui fondait une garde restée sans propriétaire ;
 *   — la réciproque : aucune tâche ne cite une exigence qui n'existe pas ;
 *   — la `phase` : elle est DÉRIVÉE de la plus précoce des tâches porteuses, jamais saisie ;
 *   — l'ÉGALITÉ de la vue et de sa source, à l'octet près (`--verifie-rendu`, REQ-GOV-032).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const CHEMIN_REGISTRE = 'docs/requirements.json';
const CHEMIN_SCHEMA = 'scripts/lot/requirements.schema.json';
const CHEMIN_TACHES = 'docs/tasks.json';
const CHEMIN_VUE_PAR_DEFAUT = 'docs/REQUIREMENTS.md';

/** `--out <chemin>` : rendre ou vérifier une AUTRE vue que celle du dépôt (bancs d'essai des tests). */
const iOut = process.argv.indexOf('--out');
const CHEMIN_VUE =
  iOut >= 0 ? (process.argv[iOut + 1] ?? CHEMIN_VUE_PAR_DEFAUT) : CHEMIN_VUE_PAR_DEFAUT;

/** Les 21 modules et les 12 étapes de l'audit du 2026-09-03. Le compte est l'invariant. */
const NB_MODULES = 21;
const NB_ETAPES = 12;

/**
 * LES LIBELLÉS DES MODULES ET DES ÉTAPES N'ONT PAS D'AUTRE SOURCE QUE CE FICHIER — et c'est un
 * manque, pas un choix. `docs/requirements.json` ne porte que des NUMÉROS (`module`, `etape`) ;
 * les noms ne vivaient jusqu'ici que dans la vue elle-même, c'est-à-dire dans le fichier généré,
 * c'est-à-dire nulle part. Les mettre ici en fait une source unique et versionnée (RM-01) au lieu
 * d'une donnée que la régénération aurait effacée. Les COMPTES, eux, restent dérivés.
 * Toute correction d'un libellé se fait ICI, puis `pnpm gov:requirements --render`.
 */
const MODULES: readonly string[] = [
  'Recrutement & candidature',
  'Scoring & priorisation',
  'Entretien / webinaire',
  'KYC & conformité',
  'Contrat & signature électronique',
  'Onboarding automatique',
  'Enablement',
  'Espace apporteur',
  'Dépôt de contact',
  "Vérification d'entreprise",
  'Pipeline & statuts',
  'Qualification structurée',
  'Moteur de commissions',
  'Parrainage',
  'Relevés, approbation, paiement',
  'Autofacturation & fiscal',
  'Console de pilotage',
  "Suivi d'activité par apporteur",
  'Animation & ré-engagement',
  'Support & messagerie',
  'Suspension, résiliation, offboarding',
];

const ETAPES: readonly string[] = [
  'Sourcing',
  'Candidature',
  'Entretien / webinaire',
  'KYC',
  'Contrat',
  'Onboarding',
  'Activité',
  'Qualification',
  'Vente',
  'Commission',
  'Relevé & paiement',
  'Fin de collaboration',
];

type Exigence = {
  id: string;
  domaine: string;
  texte: string;
  source: string;
  statut: 'active' | 'absorbee' | 'retiree';
  remplaceePar: string | null;
  module: number | null;
  etape: number | null;
  phase: number | null;
  taches: string[];
};
type Tache = { id: string; phase: number; reqs: string[] };
type Faute = { famille: string; message: string };

// ── RM-01 APPLIQUÉ AUX EXIGENCES : LE TEXTE SURVIVANT CONTIENT LE TEXTE DÉCIDÉ ───────────────────
/**
 * `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` porte les ARBITRAGES rendus : « garder REQ-X, absorber
 * REQ-A, REQ-B → « le texte décidé » ». `docs/requirements.json` porte le texte APPLIQUÉ. Rien ne
 * confrontait les deux, et la divergence n'était donc visible de personne.
 *
 * LE DÉFAUT QUI A FAIT NAÎTRE CETTE FAMILLE, et il porte sur l'exigence que GOV-039 couvre :
 * l'arbitrage rendu pour REQ-QA-014 dit « … ≥ 1 test vert dont le titre `it()` contient son
 * identifiant … les corps de PR listent `Couvre: REQ-…` … » ; le texte appliqué disait l'INVERSE,
 * « via l'annotation `@req` », et la clause sur les titres n'avait plus de porteur vivant. Une
 * exigence absorbée emporte avec elle ce que sa remplaçante ne reprend pas, et RIEN ne le signalait.
 *
 * ⚠️ CE QUI EST CONFRONTÉ N'EST PAS LE TEXTE ENTIER, ET C'EST UNE DÉCISION. Un texte décidé est
 * réécrit en le reformulant ; ce qui ne se reformule pas, ce sont ses MARQUEURS — les spans de code
 * que l'arbitrage a lui-même mis à part : un nom de fichier, un identifiant, une valeur d'enum, une
 * commande. Ils se DÉRIVENT du texte décidé (`marqueursDe`) ; aucune liste de clauses n'est tapée.
 */
export const CHEMIN_ANNEXE = 'docs/REQUIREMENTS-ANNEXE-FUSIONS.md';

/** Une fusion telle que l'annexe l'écrit : la survivante, ce qu'elle absorbe, le texte décidé. */
export type Fusion = { survivante: string; absorbees: string[]; decide: string };

/**
 * La puce d'arbitrage, et elle seule. La flèche est le séparateur que l'annexe emploie ; le texte
 * décidé vit entre ses guillemets français.
 */
const PUCE_FUSION =
  /^- garder \*\*(REQ-[A-Z]+-\d{3})\*\*, absorber ([^→]+?)\s*→\s*«\s*([\s\S]*?)\s*»\s*$/;

/** Les fusions décidées, lues dans l'annexe. */
export function fusionsDecidees(annexe: string): Fusion[] {
  const f: Fusion[] = [];
  for (const ligne of annexe.split(/\r?\n/)) {
    const m = PUCE_FUSION.exec(ligne);
    if (!m) continue;
    f.push({
      survivante: m[1]!,
      absorbees: m[2]!
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^REQ-[A-Z]+-\d{3}$/.test(s)),
      decide: m[3]!,
    });
  }
  return f;
}

/** Les MARQUEURS d'un texte : ses spans de code, normalisés sur les blancs. Dérivés, jamais listés. */
export function marqueursDe(texte: string): string[] {
  return [...texte.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.replace(/\s+/g, ' ').trim());
}

/** Un caractère qui prolonge un identifiant : lettre, chiffre ou soulignement. */
const PROLONGE_UN_IDENTIFIANT = /[\p{L}\p{N}_]/u;

/**
 * Le texte appliqué REPREND-il ce marqueur ? Comme JETON délimité, jamais comme sous-chaîne : un
 * marqueur qui ne se lit qu'À L'INTÉRIEUR d'un identifiant plus long n'est pas repris.
 *
 * 🔴 Refus A09 · securite, F2 (PR 55, revue 5247018537). La présence se jugeait par `includes` :
 * `siren` n'était « repris » par REQ-DM-021 que dans `siren_manquant`, `signe` par REQ-ARG-016 que
 * dans `mandat_non_signe`. Deux clauses décidées d'ARGENT, perdues, passaient en exit 0 — et
 * renommer l'identifiant hôte, sans toucher à la clause, faisait rougir la garde. La borne ne
 * s'applique qu'aux extrémités du marqueur qui sont elles-mêmes des caractères d'identifiant :
 * `<ts>.<hex64>` ou `Couvre: REQ-…` se jugent comme avant.
 */
export function repris(texte: string, marqueur: string): boolean {
  const bordeAGauche = PROLONGE_UN_IDENTIFIANT.test(marqueur[0] ?? '');
  const bordeADroite = PROLONGE_UN_IDENTIFIANT.test(marqueur.at(-1) ?? '');
  for (let i = texte.indexOf(marqueur); i >= 0; i = texte.indexOf(marqueur, i + 1)) {
    const avant = texte[i - 1] ?? '';
    const apres = texte[i + marqueur.length] ?? '';
    if (bordeAGauche && PROLONGE_UN_IDENTIFIANT.test(avant)) continue;
    if (bordeADroite && PROLONGE_UN_IDENTIFIANT.test(apres)) continue;
    return true;
  }
  return false;
}

/**
 * LES CLAUSES DÉCIDÉES QUE LE TEXTE APPLIQUÉ NE REPREND PAS, MESURÉES LE 2026-09-17 ET DÉCLARÉES.
 *
 * Ce registre est un CLIQUET, pas une absolution : une perte qui n'y figure pas fait REFUSER la
 * garde (`texte_decide_perdu`), et une perte qui y figure alors que la clause est REVENUE la fait
 * refuser tout autant (`dette_texte_decide_perimee`). Sa divergence, dans les deux sens, est le
 * signal.
 *
 * ⛔ AUCUNE DE CES LIGNES N'EST RÉPARABLE PAR GOV-039, et le motif est écrit à côté de chacune :
 * réécrire le texte en vigueur d'une exigence d'ARGENT ou de SÉCURITÉ est une décision de Will, pas
 * d'un agent. Deux d'entre elles portent un ré-arbitrage POSTÉRIEUR à l'annexe (REQ-DM-022, M-10 du
 * 2026-09-03 ; REQ-DM-015, A-2 du même jour) : là, c'est l'ANNEXE qui est périmée, et le geste juste
 * est de dater l'arbitrage suivant dans l'annexe — un ADR, pas un champ réécrit.
 */
export const DETTE_TEXTE_DECIDE: readonly {
  survivante: string;
  marqueurs: readonly string[];
  motif: string;
}[] = [
  {
    survivante: 'REQ-DM-014',
    marqueurs: ['axionia/src/content/pricing.ts', 'commissions.v<N>.json'],
    motif: 'argent : la source et le transport de la grille de commission',
  },
  {
    survivante: 'REQ-SEC-010',
    marqueurs: ['<timestamp_unix>.<corps exact>'],
    motif: 'securite : la chaine exacte signee en HMAC',
  },
  {
    survivante: 'REQ-SEC-034',
    marqueurs: ['<ts>.<hex64>', 'submission.completed'],
    motif: 'securite : la forme de la signature DocuSeal et son evenement',
  },
  {
    survivante: 'REQ-SEC-008',
    marqueurs: ['scopedPrisma(apporteurId)'],
    motif: 'securite : le point de passage unique du cloisonnement',
  },
  {
    survivante: 'REQ-DM-010',
    marqueurs: ['captcha'],
    motif: 'securite : la seule issue admise au-dela du seuil',
  },
  {
    survivante: 'REQ-DM-016',
    marqueurs: ['devis.signe', 'prevue', 'facture.emise'],
    motif: 'argent : les declencheurs de creation de ligne',
  },
  {
    survivante: 'REQ-DM-021',
    marqueurs: ['non_resolue', 'siren'],
    motif:
      'argent : le motif de blocage d une ligne non resolue ; et siren, que le texte ne portait que dans siren_manquant (mesure le 2026-09-18, F2 de la PR 55)',
  },
  {
    survivante: 'REQ-DM-022',
    marqueurs: ['dateRef = devis.acceptedAt'],
    motif:
      'argent, et re-arbitrage POSTERIEUR : contrat art. 4.4, M-10 du 2026-09-03 — c est l annexe qui est perimee',
  },
  {
    survivante: 'REQ-DM-015',
    marqueurs: ['scale'],
    motif: 'argent, et re-arbitrage POSTERIEUR : A-2 du 2026-09-03 sur le forfait',
  },
  {
    survivante: 'REQ-ARG-016',
    marqueurs: ['piecesBloquantPaiement', 'MotifBlocage', 'signe'],
    motif:
      'argent : la fonction pure des controles bloquants et son enum ; et signe, que le texte ne portait que dans mandat_non_signe (mesure le 2026-09-18, F2 de la PR 55)',
  },
  {
    survivante: 'REQ-ARG-024',
    marqueurs: ['payee', 'DAS2_SEUIL_CENTS'],
    motif: 'argent : l assiette DAS2 et son seuil SSOT',
  },
  {
    survivante: 'REQ-DM-031',
    marqueurs: ['retention.ts'],
    motif: 'donnees personnelles : la SSOT de la duree de conservation',
  },
  {
    survivante: 'REQ-UX-033',
    marqueurs: ['size-limit'],
    motif: 'la gate qui rend le budget bloquant',
  },
  {
    survivante: 'REQ-GOV-014',
    marqueurs: ['pnpm deploy:verify', 'concurrency'],
    motif: 'protocole de fusion : la verification d atterrissage et l interdit de concurrency',
  },
  {
    survivante: 'REQ-ARG-003',
    marqueurs: ['en_attente_dependance', 'held'],
    motif: 'argent : la permutation des evenements et la conservation d un schemaVersion inconnu',
  },
];

type Validateur = {
  validate: (s: object, d: unknown) => boolean;
  errors?: { instancePath?: string; message?: string }[];
};
const CtorAjv = Ajv2020 as unknown as { new (o: object): Validateur };

export function controler(doc: unknown, schema: object, taches: Tache[], annexe: string): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  const ajv = new CtorAjv({ allErrors: true, strict: false });
  if (!ajv.validate(schema, doc)) {
    for (const e of ajv.errors ?? [])
      ajouter('schema', `${e.instancePath || '(racine)'} ${e.message ?? 'invalide'}`);
  }

  const exigences = ((doc as { exigences?: Exigence[] }).exigences ?? []) as Exigence[];
  const parId = new Map<string, Exigence>();

  for (const e of exigences) {
    if (parId.has(e.id)) ajouter('id_double', `${e.id} apparaît plus d'une fois.`);
    parId.set(e.id, e);
    if (!e.source || e.source.trim().length < 5) {
      ajouter(
        'source_vide',
        `${e.id} n'a pas de source : elle ne peut être ni datée ni contestée.`
      );
    }
  }

  // absorptions : la survivante existe, et elle n'est pas elle-même absorbée
  for (const e of exigences) {
    if (e.statut !== 'absorbee') continue;
    const cible = e.remplaceePar ? parId.get(e.remplaceePar) : undefined;
    if (!cible) {
      ajouter(
        'remplacante_inconnue',
        `${e.id} renvoie à ${e.remplaceePar ?? '(rien)'}, qui n'est pas au registre.`
      );
      continue;
    }
    if (cible.statut !== 'active') {
      ajouter(
        'absorption_en_chaine',
        `${e.id} renvoie à ${cible.id}, qui est « ${cible.statut} » : suivre le renvoi n'atterrit pas ` +
          `sur un texte en vigueur. Fais pointer ${e.id} directement sur la survivante.`
      );
    }
  }

  // couverture des modules et des étapes
  const modules = new Set(exigences.map((e) => e.module).filter((m): m is number => m !== null));
  const etapes = new Set(exigences.map((e) => e.etape).filter((s): s is number => s !== null));
  for (let m = 1; m <= NB_MODULES; m++) {
    if (!modules.has(m)) {
      ajouter('module_sans_exigence', `Le module ${m} de l'audit ne porte aucune exigence.`);
    }
  }
  for (let s = 1; s <= NB_ETAPES; s++) {
    if (!etapes.has(s))
      ajouter('etape_sans_exigence', `L'étape ${s} du parcours ne porte aucune exigence.`);
  }

  // porteurs — dans les deux sens
  const porteurs = new Map<string, Tache[]>();
  for (const t of taches) {
    for (const r of t.reqs) porteurs.set(r, [...(porteurs.get(r) ?? []), t]);
  }
  for (const r of porteurs.keys()) {
    if (!parId.has(r)) {
      ajouter(
        'exigence_citee_non_definie',
        `${porteurs
          .get(r)!
          .map((t) => t.id)
          .join(', ')} cite ${r}, qui n'est pas au registre.`
      );
    }
  }
  for (const e of exigences) {
    const p = porteurs.get(e.id) ?? [];
    if (e.statut === 'active' && p.length === 0) {
      ajouter(
        'exigence_sans_porteur',
        `${e.id} est active et aucune tâche ne la cite : elle ne sera jamais codée.`
      );
    }
    const attendue = p.length > 0 ? Math.min(...p.map((t) => t.phase)) : null;
    if (e.phase !== attendue) {
      ajouter(
        'phase_non_derivee',
        `${e.id} porte phase ${e.phase} ; la plus précoce de ses tâches est ${attendue}. ` +
          `La phase se DÉRIVE, elle ne se saisit pas.`
      );
    }
    if (
      e.taches.join('|') !==
      p
        .map((t) => t.id)
        .sort()
        .join('|')
    ) {
      ajouter(
        'taches_non_derivees',
        `${e.id} liste des tâches qui ne sont pas celles qui la citent.`
      );
    }
  }

  // ── les fusions : le texte SURVIVANT contient le texte DÉCIDÉ ──────────────────────────────────
  const fusions = fusionsDecidees(annexe);
  if (fusions.length === 0) {
    // Une lecture vide n'est pas une absence de faute : sans ce plancher, une annexe déplacée,
    // vidée ou dont la puce aurait changé de forme rendrait la famille MUETTE, et verte.
    ajouter(
      'annexe_sans_fusion',
      `${CHEMIN_ANNEXE} ne rend AUCUNE fusion : la confrontation des textes décidés porterait sur ` +
        `rien. Une garde qui ne lit rien ne prouve rien.`
    );
  }
  const declarees = new Set<string>();
  for (const f of fusions) {
    const survivante = parId.get(f.survivante);
    if (!survivante || survivante.statut !== 'active') {
      ajouter(
        'fusion_survivante_inconnue',
        `L'arbitrage garde ${f.survivante}, que le registre ` +
          `${survivante ? `déclare « ${survivante.statut} »` : 'ne porte pas'} : le texte décidé n'a ` +
          `plus de porteur en vigueur.`
      );
      continue;
    }
    for (const a of f.absorbees) {
      const abs = parId.get(a);
      if (!abs || abs.statut !== 'absorbee' || abs.remplaceePar !== f.survivante) {
        ajouter(
          'fusion_absorbee_non_marquee',
          `L'arbitrage fait absorber ${a} par ${f.survivante} ; le registre en dit ` +
            `${abs ? `« ${abs.statut} », remplacée par ${abs.remplaceePar ?? '(rien)'}` : "qu'elle n'existe pas"}.`
        );
      }
    }
    const applique = survivante.texte.replace(/\s+/g, ' ');
    const dette = DETTE_TEXTE_DECIDE.find((d) => d.survivante === f.survivante);
    for (const m of marqueursDe(f.decide)) {
      const present = repris(applique, m);
      const declaree = dette?.marqueurs.includes(m) ?? false;
      if (declaree) declarees.add(`${f.survivante}|${m}`);
      if (!present && !declaree) {
        ajouter(
          'texte_decide_perdu',
          `${f.survivante} : l'arbitrage décidé porte « ${m} », que le texte appliqué ne reprend ` +
            `pas. Le texte SURVIVANT doit contenir le texte DÉCIDÉ (${CHEMIN_ANNEXE}) — ou la perte ` +
            `est déclarée, datée et motivée dans DETTE_TEXTE_DECIDE.`
        );
      }
      if (present && declaree) {
        ajouter(
          'dette_texte_decide_perimee',
          `${f.survivante} : « ${m} » est REVENU dans le texte appliqué, mais la dette est encore ` +
            `déclarée. Retire-la de DETTE_TEXTE_DECIDE : une dette sans objet fait croire à un manque.`
        );
      }
    }
  }
  for (const d of DETTE_TEXTE_DECIDE) {
    for (const m of d.marqueurs) {
      if (!declarees.has(`${d.survivante}|${m}`)) {
        ajouter(
          'dette_texte_decide_perimee',
          `La dette « ${d.survivante} / ${m} » ne correspond à aucune clause décidée de ` +
            `${CHEMIN_ANNEXE} : elle exempte d'un manque qui n'existe pas.`
        );
      }
    }
  }

  return fautes;
}

export const FAMILLES = [
  'schema',
  'id_double',
  'source_vide',
  'remplacante_inconnue',
  'absorption_en_chaine',
  'module_sans_exigence',
  'etape_sans_exigence',
  'exigence_citee_non_definie',
  'exigence_sans_porteur',
  'phase_non_derivee',
  'taches_non_derivees',
  'annexe_sans_fusion',
  'fusion_survivante_inconnue',
  'fusion_absorbee_non_marquee',
  'texte_decide_perdu',
  'dette_texte_decide_perimee',
];

/**
 * Ce module est désormais IMPORTÉ par sa spécification (`titres-de-test-resolvent.spec.ts`), qui
 * EXÉCUTE `controler()` au lieu de lire le texte de ce fichier. L'importer ne doit donc rien lire,
 * rien écrire et surtout rien SORTIR : sans cette garde, le premier `process.exit(0)` du mode normal
 * tuait le worker `vitest` avant le premier test. Même idiome que `scripts/lot/composer.ts:250`.
 */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]gov-requirements\.ts$/.test(process.argv[1] ?? '');

/** Les sources, lues au LANCEMENT et jamais à l'import. */
function sources(): {
  schema: object;
  taches: Tache[];
  doc: { exigences: Exigence[] };
  annexe: string;
} {
  for (const f of [CHEMIN_REGISTRE, CHEMIN_SCHEMA, CHEMIN_TACHES, CHEMIN_ANNEXE]) {
    if (!existsSync(f)) {
      console.error(`❌ gov:requirements — ${f} est introuvable.`);
      process.exit(1);
    }
  }
  return {
    schema: JSON.parse(readFileSync(CHEMIN_SCHEMA, 'utf8')) as object,
    taches: (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] }).taches,
    doc: JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { exigences: Exigence[] },
    annexe: readFileSync(CHEMIN_ANNEXE, 'utf8'),
  };
}

// ── la vue ───────────────────────────────────────────────────────────────────
/**
 * Le rendu de `docs/REQUIREMENTS.md`. Fonction PURE et DÉTERMINISTE : deux appels sur le même
 * registre rendent le même octet — aucune horloge, aucun `Object.keys`, aucune lecture de disque.
 * Sans cela, `--verifie-rendu` mesurerait la machine au lieu de mesurer la dérive.
 *
 * L'ORDRE EST CELUI DU REGISTRE, jamais un tri : les exigences sortent dans l'ordre du fichier
 * source, et les sections de domaine dans l'ordre de leur première apparition. Un tri appliqué
 * ici ferait diverger la vue d'un simple ajout en fin de registre, et le rouge ne dirait plus rien.
 */
export function rendreVue(exigences: Exigence[]): string {
  const l: string[] = [];
  const n = (s: string): number => exigences.filter((e) => e.statut === s).length;
  const avecTaches = exigences.filter((e) => e.taches.length > 0).length;

  l.push('# Registre des exigences — Axion Apporteurs');
  l.push('');
  l.push('> ⚠️ **Ce fichier est une VUE. La source est `docs/requirements.json`.**');
  l.push(
    '> Regénéré par `pnpm gov:requirements --render`, jamais édité à la main : une correction'
  );
  l.push('> tapée ici disparaît à la régénération suivante.');
  l.push(
    '> `pnpm gov:requirements --verifie-rendu` rougit si ce fichier a dérivé de sa source, et'
  );
  l.push(
    '> NOMME l’écart en nombre d’exigences (REQ-GOV-032). Jusqu’au 2026-09-05, aucune garde ne'
  );
  l.push('> comparait les deux : la vue annonçait 353 exigences pour 354 au registre.');
  l.push('>');
  l.push(
    "> **Aucun total n'est écrit à la main.** Trois comptages différents ont circulé dans les documents"
  );
  l.push('> sources, tous faux. Ceux qui suivent sont comptés à la génération.');
  l.push('>');
  l.push("> **Dépôt public** — les renvois à la note d'analyse interne apparaissent sous la forme");
  l.push('> « note interne (hors dépôt) », et les seuils comme les montants du réseau vivent en');
  l.push('> configuration (`REQ-GOV-031`, garde `pnpm gov:publication`).');
  l.push('');
  l.push('## Ce que porte le registre');
  l.push('');
  l.push('| | Nombre |');
  l.push('| --- | ---: |');
  l.push(`| Exigences | **${exigences.length}** |`);
  l.push(`| — dont actives | ${n('active')} |`);
  l.push(`| — dont absorbées par une autre (l'identifiant résout encore) | ${n('absorbee')} |`);
  l.push(`| — dont retirées | ${n('retiree')} |`);
  l.push(`| Exigences couvertes par au moins une tâche | ${avecTaches} |`);
  l.push(`| Exigences sans porteur | ${exigences.length - avecTaches} |`);
  l.push('');

  const compter = (cle: 'module' | 'etape', valeur: number): number =>
    exigences.filter((e) => e[cle] === valeur).length;

  l.push(`## Couverture des ${NB_MODULES} modules de l'audit de bout en bout`);
  l.push('');
  l.push('| # | Module | Exigences |');
  l.push('| ---: | --- | ---: |');
  MODULES.forEach((nom, i) => l.push(`| ${i + 1} | ${nom} | ${compter('module', i + 1)} |`));
  l.push('');

  l.push(`## Couverture des ${NB_ETAPES} étapes du parcours`);
  l.push('');
  l.push('| # | Étape | Exigences |');
  l.push('| ---: | --- | ---: |');
  ETAPES.forEach((nom, i) => l.push(`| ${i + 1} | ${nom} | ${compter('etape', i + 1)} |`));
  l.push('');

  l.push('## Exigences');
  l.push('');
  l.push(
    `Chaque entrée porte son **module** (1-${NB_MODULES}), son **étape** (1-${NB_ETAPES}), la **phase** où elle est`
  );
  l.push('livrée — la plus précoce de ses tâches porteuses — et **les tâches qui la prouvent**.');
  l.push("Une exigence sans tâche n'est portée par personne : `gov:requirements` la nomme.");
  l.push('');

  const domaines: string[] = [];
  for (const e of exigences) if (!domaines.includes(e.domaine)) domaines.push(e.domaine);

  for (const domaine of domaines) {
    l.push(`### ${domaine}`);
    l.push('');
    for (const e of exigences.filter((x) => x.domaine === domaine)) {
      const absorbee = e.statut === 'absorbee' ? ` → **absorbée par ${e.remplaceePar}**` : '';
      l.push(`- **${e.id}**${absorbee} — ${e.texte}`);

      const reperes: string[] = [];
      if (e.module !== null) reperes.push(`module ${e.module}`);
      if (e.etape !== null) reperes.push(`étape ${e.etape}`);
      reperes.push(`phase ${e.phase === null ? '—' : e.phase}`);
      reperes.push(
        `tâches : ${e.taches.length > 0 ? e.taches.map((t) => `\`${t}\``).join(', ') : '**aucune**'}`
      );
      l.push(`  <br>_${reperes.join(' · ')}_ · _source : ${e.source}_`);
    }
    l.push('');
  }

  // La dernière section laisse une ligne vide de trop : on la retire, et le fichier se termine
  // par exactement un saut de ligne.
  while (l[l.length - 1] === '') l.pop();
  return l.join('\n') + '\n';
}

/** Fins de ligne normalisées avant comparaison : sans cela la garde mesurerait `core.autocrlf`. */
function normaliserFins(t: string): string {
  return t.replace(/\r\n/g, '\n');
}

/** Le nombre d'exigences qu'un texte de vue ANNONCE — l'unité du domaine (REQ-GOV-032). */
export function exigencesAnnoncees(vue: string): number {
  return (vue.match(/^- \*\*REQ-[A-Z]+-\d+\*\*/gm) ?? []).length;
}

if (
  LANCE_EN_SCRIPT &&
  (process.argv.includes('--render') || process.argv.includes('--verifie-rendu'))
) {
  const { doc, schema, taches, annexe } = sources();
  const fautes = controler(doc, schema, taches, annexe);
  if (fautes.length > 0) {
    console.error(
      `❌ Refus de rendre une vue d'un registre fautif (${fautes.length}). Lance \`pnpm gov:requirements\`.`
    );
    process.exit(1);
  }

  const rendu = rendreVue(doc.exigences);

  if (process.argv.includes('--verifie-rendu')) {
    if (!existsSync(CHEMIN_VUE)) {
      console.error(
        `❌ gov:requirements — vue_absente : ${CHEMIN_VUE} n'existe pas, alors que ${CHEMIN_REGISTRE} ` +
          `porte ${doc.exigences.length} exigence(s). Lance \`pnpm gov:requirements --render\` et commite.`
      );
      process.exit(1);
    }
    const surDisque = normaliserFins(readFileSync(CHEMIN_VUE, 'utf8'));
    if (surDisque !== normaliserFins(rendu)) {
      const vues = exigencesAnnoncees(surDisque);
      const reelles = exigencesAnnoncees(rendu);
      const ecart =
        vues === reelles
          ? `Le compte d'exigences est le même (${reelles}) : la dérive porte sur autre chose — ` +
            `un texte, une source, une phase, une tâche porteuse.`
          : `La vue annonce ${vues} exigence(s), le registre en porte ${reelles} — ` +
            `${Math.abs(reelles - vues)} d'écart.`;
      console.error(
        `❌ gov:requirements — vue_perimee : ${CHEMIN_VUE} n'est plus ce que ${CHEMIN_REGISTRE} produit.\n` +
          `   ${ecart}\n` +
          `   La vue ne se corrige pas à la main : lance \`pnpm gov:requirements --render\` et commite.`
      );
      process.exit(1);
    }
    console.log(
      `✅ gov:requirements — ${CHEMIN_VUE} est égal à ce que ${CHEMIN_REGISTRE} produit : ` +
        `${doc.exigences.length} exigences.`
    );
    process.exit(0);
  }

  writeFileSync(CHEMIN_VUE, rendu);
  console.log(
    `✅ ${CHEMIN_VUE} rendu depuis ${CHEMIN_REGISTRE} — ${doc.exigences.length} exigences, ` +
      `${MODULES.length} modules, ${ETAPES.length} étapes.`
  );
  process.exit(0);
}

// ── mode --prove ─────────────────────────────────────────────────────────────
if (LANCE_EN_SCRIPT && process.argv.includes('--prove')) {
  const { doc, schema, taches, annexe } = sources();
  const base = controler(doc, schema, taches, annexe);
  if (base.length > 0) {
    console.error(
      `❌ La preuve part d'un registre DÉJÀ fautif (${base.length}) — corrige d'abord :`
    );
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const copie = (): { exigences: Exigence[] } =>
    JSON.parse(JSON.stringify(doc)) as { exigences: Exigence[] };
  const active = (d: { exigences: Exigence[] }): Exigence =>
    d.exigences.find((e) => e.statut === 'active')!;
  const absorbee = (d: { exigences: Exigence[] }): Exigence =>
    d.exigences.find((e) => e.statut === 'absorbee')!;

  /**
   * Une fusion du MILIEU de l'annexe, jamais la dernière : un témoin construit contre le dernier
   * élément d'une liste ne distingue pas « toutes » de « la dernière ».
   */
  const fusionDuMilieu = (): Fusion => {
    const f = fusionsDecidees(annexe);
    return f[Math.floor(f.length / 2)]!;
  };

  const TEMOINS: {
    famille: string;
    defaut: () => [{ exigences: Exigence[] }, Tache[], string];
  }[] = [
    {
      famille: 'schema',
      defaut: () => {
        const d = copie();
        (active(d) as unknown as { module: number }).module = 99;
        return [d, taches, annexe];
      },
    },
    {
      famille: 'id_double',
      defaut: () => {
        const d = copie();
        d.exigences.push(JSON.parse(JSON.stringify(active(d))) as Exigence);
        return [d, taches, annexe];
      },
    },
    {
      famille: 'source_vide',
      defaut: () => {
        const d = copie();
        active(d).source = '';
        return [d, taches, annexe];
      },
    },
    {
      famille: 'remplacante_inconnue',
      defaut: () => {
        const d = copie();
        absorbee(d).remplaceePar = 'REQ-ZZZ-999';
        return [d, taches, annexe];
      },
    },
    {
      famille: 'absorption_en_chaine',
      defaut: () => {
        const d = copie();
        const a = absorbee(d);
        const b = d.exigences.find((e) => e.statut === 'absorbee' && e.id !== a.id)!;
        a.remplaceePar = b.id;
        return [d, taches, annexe];
      },
    },
    {
      famille: 'module_sans_exigence',
      defaut: () => {
        const d = copie();
        for (const e of d.exigences) if (e.module === 6) e.module = null;
        return [d, taches, annexe];
      },
    },
    {
      famille: 'etape_sans_exigence',
      defaut: () => {
        const d = copie();
        for (const e of d.exigences) if (e.etape === 3) e.etape = null;
        return [d, taches, annexe];
      },
    },
    {
      famille: 'exigence_citee_non_definie',
      defaut: () => {
        const t = JSON.parse(JSON.stringify(taches)) as Tache[];
        t[0]!.reqs = [...t[0]!.reqs, 'REQ-ZZZ-998'];
        return [copie(), t, annexe];
      },
    },
    {
      famille: 'exigence_sans_porteur',
      defaut: () => {
        const d = copie();
        const e = active(d);
        const t = (JSON.parse(JSON.stringify(taches)) as Tache[]).map((x) => ({
          ...x,
          reqs: x.reqs.filter((r) => r !== e.id),
        }));
        e.taches = [];
        e.phase = null;
        return [d, t, annexe];
      },
    },
    {
      famille: 'phase_non_derivee',
      defaut: () => {
        const d = copie();
        active(d).phase = 3;
        return [d, taches, annexe];
      },
    },
    {
      famille: 'taches_non_derivees',
      defaut: () => {
        const d = copie();
        active(d).taches = ['GOV-000'];
        return [d, taches, annexe];
      },
    },
    {
      // Une annexe qu'on ne sait plus lire ne prouve RIEN : elle doit refuser, pas se taire.
      famille: 'annexe_sans_fusion',
      defaut: () => [copie(), taches, '# une annexe sans aucune puce d arbitrage\n'],
    },
    {
      famille: 'fusion_survivante_inconnue',
      defaut: () => {
        const d = copie();
        d.exigences.find((e) => e.id === fusionDuMilieu().survivante)!.statut = 'retiree';
        return [d, taches, annexe];
      },
    },
    {
      famille: 'fusion_absorbee_non_marquee',
      defaut: () => {
        const d = copie();
        d.exigences.find((e) => e.id === fusionDuMilieu().absorbees[0])!.remplaceePar = null;
        return [d, taches, annexe];
      },
    },
    {
      famille: 'texte_decide_perdu',
      defaut: () => {
        const d = copie();
        const f = fusionDuMilieu();
        const e = d.exigences.find((x) => x.id === f.survivante)!;
        for (const m of marqueursDe(f.decide)) e.texte = e.texte.split(m).join('(clause retirée)');
        return [d, taches, annexe];
      },
    },
    {
      famille: 'dette_texte_decide_perimee',
      defaut: () => {
        const d = copie();
        const dette = DETTE_TEXTE_DECIDE[Math.floor(DETTE_TEXTE_DECIDE.length / 2)]!;
        const e = d.exigences.find((x) => x.id === dette.survivante)!;
        e.texte = `${e.texte} ${dette.marqueurs.map((m) => '`' + m + '`').join(' ')}`;
        return [d, taches, annexe];
      },
    },
  ];

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const [d, tk, ax] = t.defaut();
    const f = controler(d, schema, tk, ax);
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

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
if (LANCE_EN_SCRIPT) {
  const { doc, schema, taches, annexe } = sources();
  const fautes = controler(doc, schema, taches, annexe);
  if (fautes.length === 0) {
    const e = doc.exigences;
    const n = (s: string) => e.filter((x) => x.statut === s).length;
    const mods = new Set(e.map((x) => x.module).filter((m) => m !== null)).size;
    const etps = new Set(e.map((x) => x.etape).filter((s) => s !== null)).size;
    const fusions = fusionsDecidees(annexe);
    console.log(
      `✅ gov:requirements — ${e.length} exigences (${n('active')} actives, ${n('absorbee')} absorbées, ${n('retiree')} retirée).`
    );
    console.log(
      `   ${mods}/${NB_MODULES} modules et ${etps}/${NB_ETAPES} étapes couverts · ${e.filter((x) => x.taches.length > 0).length} exigences portées par une tâche.`
    );
    console.log(
      `   ${fusions.length} fusions décidées confrontées · ` +
        `${fusions.reduce((t, f) => t + f.absorbees.length, 0)} absorbées nommées · ` +
        `${fusions.reduce((t, f) => t + marqueursDe(f.decide).length, 0)} marqueurs de texte décidé, ` +
        `dont ${DETTE_TEXTE_DECIDE.reduce((t, d) => t + d.marqueurs.length, 0)} déclarés en dette.`
    );
    process.exit(0);
  }

  const parFamille = new Map<string, Faute[]>();
  for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
  console.error(
    `❌ gov:requirements — ${fautes.length} incohérence(s) dans ${CHEMIN_REGISTRE} :\n`
  );
  for (const [famille, liste] of parFamille) {
    console.error(`   ── ${famille} (${liste.length})`);
    liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
    if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
  }
  process.exit(1);
}
