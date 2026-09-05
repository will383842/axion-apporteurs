/**
 * lexique-apporteurs.ts — la garde du lexique interdit (GOV-013 ; REQ-GOV-017, durcie par
 * REQ-JUR-037). Registre : `GATE-JUR-TEXTES-APPORTEURS`, alias `GATE-UX-JARGON` et `gov:lexique`.
 *
 * USAGE : pnpm gov:lexique           (juge le dépôt réel ; sort 1 sur faute, en la nommant)
 *         pnpm gov:lexique:prove     (un témoin par famille, les positions limites, les contrôles
 *                                     positifs et les contre-témoins verts — sur une FIXTURE)
 *
 * CE QU'ELLE TIENT. REQ-GOV-017 : « le lexique interdit est absent de `prisma/**`, `messages/**`,
 * `src/**\/*.tsx`, des templates email et des ADR de Partners, hors liste d'exceptions justifiées
 * ligne à ligne ». REQ-JUR-037 la durcit sur tout ce qu'un apporteur voit ou reçoit. La liste
 * elle-même n'est PAS ici : elle est IMPORTÉE de `src/domain/lexique/lexique-interdit.ts`, comme
 * `docs/gates.json` l'exige — « jamais recopiée dans la gate ni dans GATES.md » (RM-01). Cette
 * gate n'apporte que la LECTURE du dépôt et la distinction des tournures.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI FAIT TOUT LE TRAVAIL : LA TOURNURE, PAS LE MOT.
 *
 * Ce dépôt existe pour que les trois pouvoirs que la charte relationnelle interdit de réunir ne
 * se rencontrent jamais dans une phrase, et la phrase qui l'en tient s'écrit AVEC les mots
 * interdits, sous forme de négation. Celle-ci est réelle, elle est dans l'ADR « valeurs du monde
 * réel » — écrit dans un lot voisin, pas encore dans ce dépôt :
 *
 *     « Elle est neutre au regard de la […], et c'est ce qui permet de la retenir :
 *       elle n'institue aucun mandat, aucun objectif, aucun quota, aucun compte rendu
 *       d'activité. »
 *
 * Une garde qui rougirait là-dessus obligerait à RETIRER la phrase qui protège : elle produirait
 * exactement le risque qu'elle prétend écarter. Une garde qui pousse à supprimer sa propre raison
 * d'être est une garde ratée. Quatre tournures sont donc exemptées, et une seule est refusée :
 *
 *   REFUSÉ — l'usage PRESCRIPTIF ou ÉVALUATIF : « objectif du mois », « votre quota »,
 *            « classement des apporteurs », « nos commerciaux », « vous devez déposer ».
 *
 *   EXEMPTÉ — (1) DÉNÉGATION : un marqueur de négation ou de prohibition déclaré par la SSOT
 *                 (`aucun`, `ni`, `sans`, `ne`, `n'`, `pas`, `jamais`, `interdit`, `banni`…) situé
 *                 en amont du terme, dans le MÊME segment de phrase et à moins de
 *                 `FENETRE_DENEGATION` caractères. « aucun objectif », « ni quota ni classement »,
 *                 « ne fixe aucun objectif », « ce n'est pas un objectif ».
 *             (2) CITATION, dans les fichiers de PROSE seulement (`.md`) : le terme entre « … »,
 *                 " … " ou accents graves CITE le mot au lieu de s'en servir. L'exemption ne vaut
 *                 pas pour le code ni la micro-copy : là, une chaîne entre guillemets est
 *                 précisément ce que l'apporteur lira — la `fixtureRouge` du registre est un
 *                 « libellé factice `objectif du mois` dans micro-copy ».
 *             (3) PORTEUR : la SSOT, cette gate et son test ont le droit d'écrire les termes.
 *             (4) EXCEPTION DÉCLARÉE, chemin par chemin et forme par forme, justifiée et datée
 *                 dans `EXCEPTIONS_DECLAREES` — « ligne à ligne », dit l'exigence.
 *
 * Les segments de phrase se coupent sur `. ; : ! ? — |` : la barre verticale parce qu'une cellule
 * de tableau Markdown n'est pas la voisine de la suivante, et qu'un « aucun » dans la colonne de
 * gauche n'exempte rien dans celle de droite.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX PIÈGES, MESURÉS SUR CE DÉPÔT, QUE CE FICHIER ÉVITE EXPRÈS.
 *
 *   — LES POSITIONS LIMITES. `gov:identifiants` est aveugle en fin de phrase : sa lookahead
 *     `(?![A-Za-z0-9_.-])` inclut le point, de sorte qu'une étiquette collée à un point final
 *     n'est pas vue, et ses propres témoins évitent tous cette position. La garde reste verte sur
 *     le texte qu'elle condamne. Ici, les bornes de mot ne contiennent QUE des caractères de mot
 *     (lettres accentuées comprises) : ni point, ni virgule, ni parenthèse, ni astérisque, ni
 *     barre. Et `--prove` exerce huit positions — début de ligne, fin de phrase collée au point,
 *     avant une virgule, avant une parenthèse fermante, en gras, en cellule de tableau, en tête
 *     de liste, en titre.
 *   — UN PÉRIMÈTRE VIDE QUI REND « ✅ ». La plupart des dossiers de REQ-GOV-017 n'existent pas
 *     encore (phase −1). La gate imprime donc ce qu'elle a balayé, motif par motif, et REFUSE
 *     qu'un motif marqué `attendu` soit vide : `docs/adr/**` et `prisma/**` ont des cibles
 *     aujourd'hui ; s'ils n'en ont plus, ce n'est pas un succès, c'est une garde débranchée.
 *
 * CE QU'ELLE NE LIT PAS. Les fichiers que git ne suit pas. `git ls-files` est la seule source :
 * un fichier non suivi n'est lu par AUCUNE garde de ce dépôt, et le message final le dit — le jour
 * où `docs/REPRISE-SESSION.md` est entré dans le dépôt, six identifiants nus qui y dormaient
 * depuis des sessions ont rougi d'un coup, sans qu'aucun ait été écrit ce jour-là.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne touche pas au dépôt et ne le lit pas : la vue est
 * INJECTÉE. Une preuve qui lirait les fichiers réels verdirait ou rougirait au gré de ce que le
 * dépôt contient le jour où elle tourne, et ne dirait plus rien de la garde.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import {
  LEXIQUE_INTERDIT,
  MARQUEURS_DE_DENEGATION,
  FENETRE_DENEGATION,
  PORTEURS_DU_LEXIQUE,
  EXCEPTIONS_DECLAREES,
  TERMES_CANONIQUES,
  famillesPourPortee,
  toutesLesFormes,
  type ExceptionLexicale,
  type FamilleInterdite,
  type PorteeLexicale,
} from '../../src/domain/lexique/lexique-interdit';

// ── le périmètre (REQ-GOV-017 pour `depot`, REQ-JUR-037 pour `apporteur`) ─────

export type Motif = {
  readonly nom: string;
  readonly reg: RegExp;
  readonly portee: PorteeLexicale;
  /** `true` si ce motif DOIT avoir des cibles aujourd'hui : zéro fichier y est une faute. */
  readonly attendu: boolean;
  readonly req: string;
};

export const MOTIFS: readonly Motif[] = [
  { nom: 'prisma/**', reg: /^prisma\/.+\.(prisma|sql|ts)$/, portee: 'depot', attendu: true, req: 'REQ-GOV-017' },
  // La micro-copy est lue par l'apporteur : elle relève de la portée la plus stricte.
  { nom: 'messages/**', reg: /^messages\/.+\.json$/, portee: 'apporteur', attendu: false, req: 'REQ-GOV-017' },
  { nom: 'src/**/*.tsx', reg: /^src\/.+\.tsx$/, portee: 'depot', attendu: false, req: 'REQ-GOV-017' },
  {
    nom: 'src/app/(espace)/**',
    reg: /^src\/app\/\(espace\)\/.+\.(tsx|ts)$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-JUR-037',
  },
  {
    nom: 'gabarits e-mail',
    reg: /^(src\/)?emails\/.+\.(tsx|ts|html|mjml|md|json)$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-GOV-017',
  },
  { nom: 'micro-copy/**', reg: /^micro-copy\/.+$/, portee: 'apporteur', attendu: false, req: 'REQ-JUR-037' },
  { nom: 'docs/adr/**', reg: /^docs\/adr\/.+\.md$/, portee: 'depot', attendu: true, req: 'REQ-GOV-017' },
];

/**
 * La portée d'un fichier : la plus STRICTE de celles des motifs qui le prennent, ou `null` s'il
 * est hors périmètre. `apporteur` l'emporte sur `depot`, parce qu'elle contient ses familles.
 */
export function porteeDuFichier(chemin: string): PorteeLexicale | null {
  const pris = MOTIFS.filter((m) => m.reg.test(chemin));
  if (pris.length === 0) return null;
  return pris.some((m) => m.portee === 'apporteur') ? 'apporteur' : 'depot';
}

// ── la mécanique des tournures ───────────────────────────────────────────────

/**
 * Les caractères qui font un MOT, accents et ligatures compris — et rien d'autre. Ni le point, ni
 * la virgule, ni la parenthèse, ni l'astérisque du gras, ni la barre d'un tableau : c'est ce qui
 * rend la garde sensible à toutes les positions, y compris celles où sa cousine est aveugle.
 */
const CAR_MOT = 'A-Za-zÀ-ÖØ-öø-ÿŒœ0-9_';

/** Ce qui coupe un segment de phrase — la barre verticale sépare deux cellules de tableau. */
const SEPARATEURS_DE_SEGMENT = /[.;:!?|—]/;

/** Le motif d'une forme : bornée par des caractères de mot, insensible à la casse et à l'apostrophe. */
export function motifDeLaForme(forme: string): RegExp {
  const echappee = forme
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/'/g, "['’]")
    .replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![${CAR_MOT}])(${echappee})(?![${CAR_MOT}])`, 'giu');
}

/** Les marqueurs de dénégation, compilés une fois. `n'` n'a pas de borne à droite : il s'élide. */
const MARQUEURS = new RegExp(
  '(?<![' +
    CAR_MOT +
    '])(?:' +
    MARQUEURS_DE_DENEGATION.map((m) =>
      m.endsWith("'") ? m.slice(0, -1) + "['’]" : m + '(?![' + CAR_MOT + '])'
    ).join('|') +
    ')',
  'iu'
);

/** Vrai si le terme qui suit ce préfixe est nié : marqueur dans le même segment, à portée de vue. */
export function estDenegation(prefixe: string): boolean {
  const segments = prefixe.split(SEPARATEURS_DE_SEGMENT);
  const segment = segments[segments.length - 1] ?? '';
  return MARQUEURS.test(segment.slice(-FENETRE_DENEGATION));
}

/** Les intervalles cités d'une ligne de PROSE : « … », " … " et accents graves. */
export function zonesCitees(ligne: string): [number, number][] {
  const zones: [number, number][] = [];
  for (const reg of [/«[^»]*»/g, /"[^"]*"/g, /`[^`]*`/g]) {
    for (const m of ligne.matchAll(reg)) zones.push([m.index, m.index + m[0].length]);
  }
  return zones;
}

// ── la vue et le contrôle ────────────────────────────────────────────────────

export type FichierVu = { chemin: string; contenu: string };
export type CompteMotif = { motif: string; nombre: number; attendu: boolean };
export type Vue = {
  fichiers: FichierVu[];
  comptes: CompteMotif[];
  exceptions: readonly ExceptionLexicale[];
};

export type Faute = { famille: string; message: string };
export type GenreExemption = 'denegation' | 'citation' | 'porteur' | 'exception';
export type Exemption = { genre: GenreExemption; chemin: string; ligne: number; forme: string };
export type Rapport = { fautes: Faute[]; exemptions: Exemption[]; occurrences: number };

/** Les familles que `--prove` doit couvrir : celles du lexique, plus les deux structurelles. */
export const FAMILLES_STRUCTURELLES = [
  {
    nom: 'perimetre_vide',
    explication:
      "un motif qui devait avoir des cibles n'en a plus : la garde ne balaie rien et rend « ✅ ».",
  },
  {
    nom: 'exception_sans_justification',
    explication:
      "une exception posée sans justification, sans référence, sans date, ou sur une forme inconnue.",
  },
] as const;

export const FAMILLES: { nom: string; explication: string }[] = [
  ...LEXIQUE_INTERDIT.map((f) => ({ nom: f.nom, explication: `${f.portee} — ${f.pourquoi}.` })),
  ...FAMILLES_STRUCTURELLES.map((f) => ({ nom: f.nom, explication: f.explication })),
];

const FORMES_CONNUES = new Set(toutesLesFormes());

function messageDeFaute(
  chemin: string,
  n: number,
  ligne: string,
  index: number,
  vu: string,
  famille: FamilleInterdite
): string {
  const debut = Math.max(0, index - 36);
  const extrait = ligne.slice(debut, index + vu.length + 36).trim();
  const remplacement = famille.aDireALaPlace
    ? ` Le terme à écrire est « ${famille.aDireALaPlace} ».`
    : '';
  const canoniques =
    famille.nom === 'droit_social'
      ? ` Les trois noms canoniques sont : ${Object.values(TERMES_CANONIQUES).join(', ')}.`
      : '';
  return (
    `${chemin}:${n} — usage prescriptif de « ${vu} » [${famille.nom}, ${famille.reqs.join(' ')}]. ` +
    `Tournure vue : « ${extrait} ». Pourquoi c'est refusé : ${famille.pourquoi}.${remplacement}${canoniques} ` +
    `Si l'usage est dénégatif, écris-le comme tel (« aucun objectif », « ni quota ni classement ») : ` +
    `la garde laisse passer la négation, c'est elle qui protège. Sinon, déclare une exception ` +
    `justifiée ligne à ligne dans EXCEPTIONS_DECLAREES (REQ-GOV-017).`
  );
}

/** Le contrôle d'un fichier — le seul endroit où une tournure est jugée. */
export function analyserFichier(f: FichierVu, exceptions: readonly ExceptionLexicale[]): Rapport {
  const porteur = (PORTEURS_DU_LEXIQUE as readonly string[]).includes(f.chemin);
  const portee = porteeDuFichier(f.chemin);
  if (!porteur && portee === null) return { fautes: [], exemptions: [], occurrences: 0 };

  // Un porteur est jugé sur TOUTES les familles : c'est ce qui permet de vérifier que son
  // exemption sert vraiment, au lieu de le voir vert parce qu'il est hors périmètre.
  const familles = famillesPourPortee(portee ?? 'apporteur');
  const prose = /\.md$/.test(f.chemin);

  const fautes: Faute[] = [];
  const exemptions: Exemption[] = [];
  let occurrences = 0;

  f.contenu.split('\n').forEach((ligne, i) => {
    const citees = prose ? zonesCitees(ligne) : [];
    for (const famille of familles) {
      for (const forme of famille.formes) {
        const reg = motifDeLaForme(forme);
        let m: RegExpExecArray | null;
        while ((m = reg.exec(ligne)) !== null) {
          occurrences += 1;
          const index = m.index;
          const genre: GenreExemption | null = porteur
            ? 'porteur'
            : exceptions.some((e) => e.chemin === f.chemin && e.forme === forme)
              ? 'exception'
              : citees.some(([a, b]) => index >= a && index < b)
                ? 'citation'
                : estDenegation(ligne.slice(0, index))
                  ? 'denegation'
                  : null;
          if (genre !== null) {
            exemptions.push({ genre, chemin: f.chemin, ligne: i + 1, forme });
            continue;
          }
          fautes.push({
            famille: famille.nom,
            message: messageDeFaute(f.chemin, i + 1, ligne, index, m[1] ?? forme, famille),
          });
        }
      }
    }
  });

  return { fautes, exemptions, occurrences };
}

export function controler(vue: Vue): Rapport {
  const fautes: Faute[] = [];
  const exemptions: Exemption[] = [];
  let occurrences = 0;

  // Les exceptions se jugent AVANT le texte : une exception molle ouvre un trou permanent.
  for (const e of vue.exceptions) {
    const manques: string[] = [];
    if (e.justification.trim().length < 20) manques.push('une justification en une phrase');
    if (e.reference.trim() === '') manques.push('une référence qualifiée (RM-12)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.poseeLe)) manques.push('une date AAAA-MM-JJ');
    if (!FORMES_CONNUES.has(e.forme)) manques.push(`une forme connue de la SSOT (« ${e.forme} » ne l'est pas)`);
    if (manques.length > 0) {
      fautes.push({
        famille: 'exception_sans_justification',
        message:
          `EXCEPTIONS_DECLAREES — l'exception sur « ${e.forme} » dans ${e.chemin} n'a pas ` +
          `${manques.join(', ni ')}. REQ-GOV-017 exige des exceptions « justifiées ligne à ligne » : ` +
          `sans justification, ce n'est pas une exception, c'est un trou que personne ne rouvrira.`,
      });
    }
  }

  for (const c of vue.comptes) {
    if (c.attendu && c.nombre === 0) {
      fautes.push({
        famille: 'perimetre_vide',
        message:
          `${c.motif} — aucun fichier balayé, alors que ce motif doit en avoir. Une garde qui ne ` +
          `lit rien rend « ✅ » sans rien garder. Vérifie que les fichiers sont SUIVIS par git ` +
          `(« git ls-files » est la seule source) ou corrige le motif dans MOTIFS.`,
      });
    }
  }

  for (const f of vue.fichiers) {
    const r = analyserFichier(f, vue.exceptions);
    fautes.push(...r.fautes);
    exemptions.push(...r.exemptions);
    occurrences += r.occurrences;
  }

  return { fautes, exemptions, occurrences };
}

// ── la vue du dépôt (fichiers SUIVIS par git, et rien d'autre) ────────────────

export function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function vueDuDepot(): Vue {
  const suivis = fichiersSuivis();
  const retenus = suivis.filter(
    (c) => (porteeDuFichier(c) !== null || (PORTEURS_DU_LEXIQUE as readonly string[]).includes(c)) && existsSync(c)
  );
  return {
    fichiers: retenus.map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf8') })),
    comptes: MOTIFS.map((m) => ({
      motif: m.nom,
      nombre: suivis.filter((c) => m.reg.test(c)).length,
      attendu: m.attendu,
    })),
    exceptions: EXCEPTIONS_DECLAREES,
  };
}

// ── la fixture de la preuve (RM-11 : elle ne lit rien du dépôt) ───────────────

/** Des comptes conformes : chaque motif attendu a une cible. La preuve ne juge que le texte. */
const COMPTES_CONFORMES: CompteMotif[] = MOTIFS.map((m) => ({
  motif: m.nom,
  nombre: m.attendu ? 1 : 0,
  attendu: m.attendu,
}));

/**
 * Une vue de FIXTURE : des comptes conformes, et le texte qu'on veut juger. Exportée parce que
 * `tests/unit/gouvernance/lexique.spec.ts` en a besoin, et qu'un test qui reconstruirait la vue
 * à sa façon jugerait autre chose que la gate (RM-01).
 */
export function vueDeFixture(fichiers: FichierVu[], exceptions: readonly ExceptionLexicale[] = []): Vue {
  return { fichiers, comptes: COMPTES_CONFORMES, exceptions };
}

const vue = vueDeFixture;

export const ADR = (contenu: string): FichierVu => ({ chemin: 'docs/adr/9999-temoin.md', contenu });
export const ESPACE = (contenu: string): FichierVu => ({ chemin: 'src/app/(espace)/tableau.tsx', contenu });
export const MICRO = (contenu: string): FichierVu => ({ chemin: 'micro-copy/espace.json', contenu });
export const COURRIEL = (contenu: string): FichierVu => ({ chemin: 'emails/apporteur/message.tsx', contenu });

/**
 * La phrase de l'ADR « valeurs du monde réel », VERBATIM. C'est le contre-témoin le plus
 * important du fichier : si elle rougit, la garde force à retirer la phrase qui protège — celle
 * qui dit que les trois pouvoirs ne sont pas réunis.
 *
 * ⚠️ L'ADR EST DÉSIGNÉ PAR SON TITRE, ET PAS PAR SON NUMÉRO. Il est écrit dans un lot voisin et
 * n'est pas encore dans ce dépôt : `gov:adr`, famille `reference_sans_cible`, refuse — à juste
 * titre — une référence qualifiée qui ne résout pas, et sept d'entre elles ont fait rougir cette
 * garde-là avant d'être retirées d'ici. Quand l'ADR aura atterri sur `main`, ces mentions
 * pourront redevenir des références qualifiées ; jusque-là, une référence morte serait pire
 * qu'un titre.
 *
 * ⚠️ UN MOT Y EST NEUTRALISÉ, ET C'EST VOULU. Le premier membre de phrase de l'ADR NOMME le
 * risque juridique ; REQ-GOV-031 (dépôt PUBLIC, décision W13) refuse ce mot dans tout fichier
 * suivi hors `docs/contrat/**`, et `gov:publication` le fait rougir. Il est donc remplacé par
 * « […] ». Ce membre de phrase ne porte AUCUN terme du lexique : son retrait ne change rien à ce
 * que cette garde-ci juge — les quatre « aucun » sont intacts, et ce sont eux qui sont éprouvés.
 */
export const PHRASE_VALEURS_DU_MONDE_REEL =
  "Elle est neutre au regard de la […], et c'est ce qui permet de la retenir : elle " +
  "n'institue aucun mandat, aucun objectif, aucun quota, aucun compte rendu d'activité.";

/** Un extrait FIDÈLE de la SSOT : elle écrit les termes en clair, c'est son travail. */
const EXTRAIT_SSOT = [
  "    formes: ['commercial', 'commerciale', 'commerciaux', 'commerciales'],",
  "    formes: ['objectif', 'objectifs'],",
  "    formes: ['quota', 'quotas'],",
  "    formes: ['classement', 'classements'],",
].join('\n');

/** Un témoin par famille du lexique, chacun dans un fichier de sa portée. */
const TEMOINS: { famille: string; quoi: string; vue: () => Vue }[] = [
  {
    famille: 'commercial',
    quoi: 'un ADR qui parle des commerciaux du réseau',
    vue: () => vue([ADR('Le tableau de bord des commerciaux affiche le chiffre du mois.')]),
  },
  {
    famille: 'objectif',
    quoi: 'la fixtureRouge du registre : un libellé « objectif du mois » en micro-copy',
    vue: () => vue([MICRO('{ "entete": "objectif du mois" }')]),
  },
  {
    famille: 'quota',
    quoi: 'un quota trimestriel annoncé dans un ADR',
    vue: () => vue([ADR('Chaque apporteur reçoit un quota trimestriel.')]),
  },
  {
    famille: 'classement',
    quoi: 'un classement des apporteurs',
    vue: () => vue([ADR('Le classement des apporteurs est publié chaque lundi.')]),
  },
  {
    famille: 'palmares',
    quoi: 'un rang et un niveau restitués dans l’espace',
    vue: () => vue([ESPACE('<p>Vous êtes au rang 3 du niveau argent</p>')]),
  },
  {
    famille: 'mesure_de_performance',
    quoi: 'un taux de transformation restitué à celui qu’on mesure',
    vue: () => vue([MICRO('{ "resume": "Votre taux de transformation ce trimestre" }')]),
  },
  {
    famille: 'injonction',
    quoi: 'un e-mail qui donne une consigne de méthode',
    vue: () => vue([COURRIEL('<p>Vous devez déposer une affaire avant le 30.</p>')]),
  },
  {
    famille: 'subordination',
    quoi: 'un manager et un avertissement',
    vue: () => vue([COURRIEL('<p>Votre manager vous a adressé un avertissement.</p>')]),
  },
  {
    famille: 'droit_social',
    quoi: 'un document mensuel intitulé comme un document de paie',
    vue: () => vue([COURRIEL('<h1>Votre bulletin de commission du mois de mars</h1>')]),
  },
  {
    famille: 'perimetre_vide',
    quoi: 'un motif attendu qui ne balaie plus rien',
    vue: () => ({
      fichiers: [],
      comptes: MOTIFS.map((m) => ({ motif: m.nom, nombre: 0, attendu: m.attendu })),
      exceptions: [],
    }),
  },
  {
    famille: 'exception_sans_justification',
    quoi: 'une exception posée sans phrase, sans référence et sans date',
    vue: () =>
      vue([], [{ chemin: 'docs/adr/9999-temoin.md', forme: 'objectif', justification: 'ok', reference: '', poseeLe: 'hier' }]),
  },
];

/**
 * LES POSITIONS LIMITES — la leçon de `gov:identifiants`, qui reste verte sur le texte qu'elle
 * condamne parce que ses témoins n'éprouvent que le milieu d'une phrase. Chacune de ces huit
 * lignes DOIT rougir.
 */
export const TEMOINS_POSITIONS: { position: string; ligne: string }[] = [
  { position: 'début de ligne', ligne: 'objectif du mois : cinq dossiers' },
  { position: 'fin de phrase, collé au point', ligne: 'Le tableau affiche votre objectif.' },
  { position: 'avant une virgule', ligne: 'Le tableau affiche votre objectif, puis le solde' },
  { position: 'avant une parenthèse fermante', ligne: 'Le tableau affiche le solde (et votre objectif)' },
  { position: 'en gras', ligne: 'Le tableau affiche **objectif du mois** en tête' },
  { position: 'cellule de tableau Markdown', ligne: '| Colonne | objectif du mois | 12 |' },
  { position: 'tête de liste', ligne: '- objectif du mois' },
  { position: 'titre', ligne: '## Objectif du mois' },
];

/**
 * LES CONTRÔLES POSITIFS — un vert ne vaut que si l'on sait que la sonde MESURE. Chacune de ces
 * vues est la MUTATION d'un contre-témoin vert, et doit rougir : sans eux, « aucune faute »
 * pourrait vouloir dire « je n'ai rien regardé ».
 */
const CONTROLES_POSITIFS: { quoi: string; vue: () => Vue }[] = [
  {
    quoi:
      "la phrase de l'ADR « valeurs du monde réel » privée de ses négations — le même texte, " +
      "sans ce qui protège",
    vue: () =>
      vue([
        ADR(
          'Elle est neutre au regard de la […] : elle institue un mandat, un objectif ' +
            'du mois, un quota trimestriel.'
        ),
      ]),
  },
  {
    quoi: "le texte de la SSOT déplacé hors de ses porteurs — c'est bien l'exemption qui le sauvait",
    vue: () => vue([{ chemin: 'docs/adr/9998-copie.md', contenu: EXTRAIT_SSOT }]),
  },
  {
    quoi: "un fichier hors périmètre ramené dans le périmètre — c'est bien la portée qui le sauvait",
    vue: () => vue([ADR('Le classement des apporteurs sera publié.')]),
  },
  {
    quoi: 'une citation devenue un libellé : les guillemets ne sauvent pas la micro-copy',
    vue: () => vue([MICRO('{ "entete": "« objectif du mois »" }')]),
  },
];

/**
 * LES CONTRE-TÉMOINS — ils comptent autant que les témoins. `minimumExemptions` interdit le vert
 * muet : un contre-témoin qui ne produit AUCUNE occurrence ne prouve rien, il ne fait que ne rien
 * contenir.
 */
const CONTRE_TEMOINS: {
  quoi: string;
  vue: () => Vue;
  genre: GenreExemption | null;
  minimumExemptions: number;
}[] = [
  {
    quoi: "l'ADR « valeurs du monde réel », VERBATIM — « aucun objectif, aucun quota »",
    vue: () => vue([ADR(PHRASE_VALEURS_DU_MONDE_REEL)]),
    genre: 'denegation',
    minimumExemptions: 2,
  },
  {
    quoi: 'une négation « ni … ni … »',
    vue: () => vue([ADR("Le contrat ne connaît ni quota ni classement ni objectif.")]),
    genre: 'denegation',
    minimumExemptions: 3,
  },
  {
    quoi: 'une dénégation verbale : « ne fixe aucun objectif »',
    vue: () => vue([ADR('La Société ne fixe aucun objectif et ne mesure aucun quota.')]),
    genre: 'denegation',
    minimumExemptions: 2,
  },
  {
    quoi: "une définition par la négative : « ce n'est pas un objectif »",
    vue: () => vue([ADR("Le seuil de versement n'est pas un objectif.")]),
    genre: 'denegation',
    minimumExemptions: 1,
  },
  {
    quoi: 'une CITATION entre guillemets, dans de la prose',
    vue: () => vue([ADR('Le mot « classement » figure au registre du vocabulaire fermé.')]),
    genre: 'citation',
    minimumExemptions: 1,
  },
  {
    quoi: 'une citation entre accents graves, dans de la prose',
    vue: () => vue([ADR('La famille `objectif` couvre deux formes fléchies.')]),
    genre: 'citation',
    minimumExemptions: 1,
  },
  {
    quoi: 'le texte de la SSOT elle-même, à son chemin réel',
    vue: () => vue([{ chemin: PORTEURS_DU_LEXIQUE[0], contenu: EXTRAIT_SSOT }]),
    genre: 'porteur',
    minimumExemptions: 4,
  },
  {
    quoi: "l'espace qui dénie tout palmarès : « aucun classement, aucun rang, aucun niveau »",
    vue: () => vue([ESPACE("<p>L'espace n'affiche aucun classement, aucun rang, aucun niveau.</p>")]),
    genre: 'denegation',
    minimumExemptions: 3,
  },
  {
    quoi: 'le relevé de commissions qui se démarque du vocabulaire de la paie',
    vue: () =>
      vue([
        COURRIEL(
          "Le relevé de commissions n'est pas un bulletin de paie : il ne porte ni brut, ni net à payer."
        ),
      ]),
    genre: 'denegation',
    minimumExemptions: 3,
  },
  {
    quoi: 'une exception déclarée, justifiée, référencée et datée',
    vue: () =>
      vue(
        [ADR('Le classement des apporteurs, hérité du document source, est cité tel quel.')],
        [
          {
            chemin: 'docs/adr/9999-temoin.md',
            forme: 'classement',
            justification: "citation littérale du document d'origine, conservée pour la traçabilité",
            reference: 'REQ-GOV-017',
            poseeLe: '2026-09-05',
          },
        ]
      ),
    genre: 'exception',
    minimumExemptions: 1,
  },
];

/**
 * Les contre-témoins qui doivent rester verts SANS produire d'exemption : ils prouvent que la
 * garde ne mord pas sur des mots qui CONTIENNENT une forme, ni hors de son périmètre.
 */
const CONTRE_TEMOINS_MUETS: { quoi: string; vue: () => Vue }[] = [
  {
    quoi: "des mots qui contiennent une forme sans en être une (topologie, brutale, primeur)",
    vue: () => vue([ESPACE('<p>La topologie du réseau, une rupture brutale, un primeur imprimé.</p>')]),
  },
  {
    quoi: 'un fichier hors périmètre : le registre des exigences ÉCRIT les mots interdits',
    vue: () =>
      vue([{ chemin: 'docs/REQUIREMENTS.md', contenu: 'objectif du mois, quota de vente, classement' }]),
  },
  {
    quoi: "un ADR interne qui emploie « niveau » — mot courant, refusé seulement côté apporteur",
    vue: () => vue([ADR('Le stub est décidé au niveau du singleton, pas au niveau de la page.')]),
  },
];

// ── exécution ────────────────────────────────────────────────────────────────

/**
 * Le fichier est IMPORTÉ par `tests/unit/gouvernance/lexique.spec.ts` autant qu'il est lancé en
 * ligne de commande. Sans cette garde, l'import exécuterait le contrôle et son `process.exit(0)` :
 * « process.exit unexpectedly called with "0" », et pas un seul test collecté. Même parade que
 * `schema-enums.ts` et `gov-depot.ts`.
 */
const APPELE_DIRECTEMENT = /lexique-apporteurs\.ts$/.test(process.argv[1] ?? '');

function echouer(message: string): never {
  console.error(message);
  process.exit(1);
}

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    const sansTemoin = FAMILLES.map((f) => f.nom).filter((n) => !TEMOINS.some((t) => t.famille === n));
    if (sansTemoin.length > 0) {
      echouer(
        `❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}. Une famille sans témoin n'est pas prouvée.`
      );
    }

    for (const t of TEMOINS) {
      const rougies = controler(t.vue()).fautes.map((f) => f.famille);
      if (!rougies.includes(t.famille)) {
        echouer(
          `❌ Le témoin de « ${t.famille} » (${t.quoi}) n'a PAS fait rougir sa famille ` +
            `(rougies : ${rougies.join(', ') || 'aucune'}).`
        );
      }
    }

    for (const p of TEMOINS_POSITIONS) {
      const r = controler(vue([ADR(p.ligne)]));
      if (r.fautes.length === 0) {
        echouer(
          `❌ Position « ${p.position} » NON couverte : « ${p.ligne} » n'a rien fait rougir. ` +
            `C'est exactement le défaut de gov:identifiants — une garde verte sur le texte qu'elle condamne.`
        );
      }
    }

    for (const c of CONTROLES_POSITIFS) {
      if (controler(c.vue()).fautes.length === 0) {
        echouer(
          `❌ Contrôle positif muet : « ${c.quoi} » aurait dû rougir. Un contre-témoin vert ne ` +
            `prouve rien tant qu'on n'a pas montré que la sonde MESURE.`
        );
      }
    }

    for (const c of CONTRE_TEMOINS) {
      const r = controler(c.vue());
      if (r.fautes.length > 0) {
        echouer(
          `❌ Faux positif sur « ${c.quoi} » : la garde est trop large, et elle forcerait à retirer ` +
            `le texte qui protège.\n   ${r.fautes[0]!.message}`
        );
      }
      const duGenre = r.exemptions.filter((e) => c.genre === null || e.genre === c.genre);
      if (duGenre.length < c.minimumExemptions) {
        echouer(
          `❌ Vert MUET sur « ${c.quoi} » : ${duGenre.length} exemption(s) « ${c.genre} » pour ` +
            `${c.minimumExemptions} attendue(s). Le vert ne vient donc pas de la tournure, mais de ce ` +
            `que la garde n'a rien vu — indiscernable d'une sonde débranchée.`
        );
      }
    }

    for (const c of CONTRE_TEMOINS_MUETS) {
      const r = controler(c.vue());
      if (r.fautes.length > 0) {
        echouer(`❌ Faux positif sur « ${c.quoi} ».\n   ${r.fautes[0]!.message}`);
      }
    }

    console.log(
      `✅ gov:lexique — ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
        `${TEMOINS_POSITIONS.length} positions limites rougissent, ` +
        `${CONTROLES_POSITIFS.length} contrôles positifs rougissent, ` +
        `${CONTRE_TEMOINS.length + CONTRE_TEMOINS_MUETS.length} contre-témoins restent verts ` +
        `(dont la phrase de l'ADR « valeurs du monde réel », verbatim) — preuve faite.`
    );
    for (const f of FAMILLES) console.log(`   • ${f.nom} — ${f.explication}`);
    process.exit(0);
  }

  const vueReelle = vueDuDepot();
  const rapport = controler(vueReelle);
  const detail = vueReelle.comptes
    .map((c) => `${c.motif} : ${c.nombre}${c.attendu ? ' (attendu)' : ''}`)
    .join(' · ');

  if (rapport.fautes.length === 0) {
    const parGenre = (g: GenreExemption): number => rapport.exemptions.filter((e) => e.genre === g).length;
    console.log(
      `✅ gov:lexique — ${vueReelle.fichiers.length} fichier(s) balayé(s) sur ${MOTIFS.length} motifs ` +
        `[${detail}] ; ${LEXIQUE_INTERDIT.length} familles et ${FORMES_CONNUES.size} formes appliquées ; ` +
        `${rapport.occurrences} occurrence(s) vue(s), dont ${rapport.exemptions.length} exemptée(s) ` +
        `(dénégation : ${parGenre('denegation')}, citation : ${parGenre('citation')}, ` +
        `porteur : ${parGenre('porteur')}, exception : ${parGenre('exception')}) ; aucun usage prescriptif.`
    );
    console.log(
      `   Seuls les fichiers SUIVIS par git sont lus : un fichier non suivi n'est lu par aucune garde.`
    );
    // Zéro occurrence admet DEUX lectures — « le périmètre n'en porte aucune » et « je ne mesure
    // rien ». Le décompte des motifs ci-dessus règle la première ; `--prove` règle la seconde, et
    // c'est pour cela qu'elle est une étape de CI à part entière, jamais un simple commentaire.
    if (rapport.occurrences === 0) {
      console.log(
        `   Aucune occurrence dans ce périmètre : que la garde MESURE se prouve par ` +
          `« pnpm gov:lexique:prove », pas par ce zéro.`
      );
    }
    process.exit(0);
  }

  console.error(
    `❌ gov:lexique — ${rapport.fautes.length} usage(s) du lexique interdit (REQ-GOV-017, REQ-JUR-037) ` +
      `sur ${vueReelle.fichiers.length} fichier(s) balayé(s) [${detail}] :\n`
  );
  rapport.fautes.slice(0, 25).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
  if (rapport.fautes.length > 25) console.error(`   … et ${rapport.fautes.length - 25} autre(s).`);
  process.exit(1);
}
