/**
 * `decisions.ts` — la concordance du gabarit de contrat avec le registre `docs/DECISIONS.md`
 * (JUR-T01, REQ-JUR-003).
 *
 * TROIS CHOSES, ET RIEN D'AUTRE.
 *   1. `QUESTIONS_POUR_WILL` — ce que le gabarit attend et qu'AUCUNE décision ne porte. Toute ligne
 *      `avenant` du registre qui n'est pas tranchée y figure (elle touche le contrat signé : chaque
 *      changement postérieur impose une re-signature de tout le réseau) ; une question dont la
 *      décision est devenue tranchée est PÉRIMÉE et rougit, pour qu'on retire la question et qu'on
 *      reporte la valeur. Tant que cette liste n'est pas vide, `exigerGabaritPubliable` refuse.
 *   2. `CONCORDANCES` — des ANCRAGES : un fragment de la ligne du registre, un article du gabarit,
 *      un fragment de cet article (et, s'il y a lieu, des fragments qui ne doivent y figurer nulle
 *      part). Toute référence d'article écrite dans le registre doit avoir la sienne.
 *   3. `DIVERGENCES_DECLAREES` — les écarts CONSTATÉS entre le registre et le gabarit, chacun
 *      rattaché à sa question. Un écart non déclaré rougit ; un écart déclaré qui disparaît rougit
 *      aussi : une déclaration périmée cacherait le prochain écart au même endroit.
 *
 * LIMITE. Un ancrage est LEXICAL : il prouve la présence de deux fragments, pas l'identité de deux
 * sens. C'est un fil de déclenchement ; la preuve reste la relecture de Will (JUR-T01b).
 *
 * PUR : le registre et le gabarit arrivent en texte.
 */
import { lireRegistre } from '../registre/registre-decisions';
import { clausesPosees, normaliser, paliersDeLAnnexe1, unitesDuGabarit } from './gabarit';

// ── le registre, lu ──────────────────────────────────────────────────────────────────────────

export type LigneDeDecision = {
  readonly id: string;
  /** La ligne entière, normalisée (sans emphase, blancs réduits). */
  readonly texte: string;
  /** La date ISO de l'arbitrage de Will, ou `null`. */
  readonly tranchee: string | null;
  /** Vrai si sa réversibilité est `avenant` : elle touche le contrat signé. */
  readonly avenant: boolean;
};

/**
 * Les lignes des sections 1 (« sans valeur par défaut ») et 2 (« hypothèses ») du registre, LUES
 * par le lecteur unique (GOV-027) — ce module n'en découpe aucune (A09 · simplicite, PR #92). Il
 * n'ajoute que ce que les ancrages consomment : le texte normalisé, et la catégorie `avenant` lue
 * dans la colonne « Réversibilité » que le lecteur rend.
 */
export function lignesDuRegistre(md: string): LigneDeDecision[] {
  return [...lireRegistre(md).parId.values()].map((d) => ({
    id: d.id,
    texte: normaliser(d.brute),
    tranchee: d.trancheeLe,
    avenant: d.reversibilite === 'avenant',
  }));
}

export type ReferenceDArticle = { readonly article: string; readonly alinea: number | null };

/** Les références d'article qu'une ligne du registre écrit : `art. 3.4`, `art. 3.5 al. 4`… */
export function referencesDArticle(texte: string): ReferenceDArticle[] {
  return [...texte.matchAll(/\bart\.\s*(\d+(?:\.\d+)?(?: bis)?)(?:\s+al\.\s*(\d+))?/g)].map(
    (m) => ({ article: m[1]!, alinea: m[2] === undefined ? null : Number(m[2]) })
  );
}

/** Le périmètre de W6 tel que la ligne l'écrit : nombre de paliers, familles, non commissionnées. */
export function perimetreW6(
  texte: string
): { paliers: number; familles: string[]; nonCommissionnees: string[] } | null {
  const paliers = /(\d+) paliers/.exec(texte);
  const familles = /commissionnées : ([^—]+?) —/.exec(texte);
  const non = /NON commissionnées[^:]*: ([^.]+)\./.exec(texte);
  if (paliers === null || familles === null || non === null) return null;
  const liste = (s: string) => s.split(',').map((x) => x.trim());
  return {
    paliers: Number(paliers[1]),
    familles: liste(familles[1]!),
    nonCommissionnees: liste(non[1]!),
  };
}

/** La structure que W11 annonce : articles, identifiants de clause, paliers de l'annexe 1. */
export function structureW11(
  texte: string
): { articles: number; identifiants: number; paliers: number } | null {
  const m = /(\d+) articles, (\d+) identifiants/.exec(texte);
  const p = /annexe 1 à (\d+) paliers/.exec(texte);
  if (m === null || p === null) return null;
  return { articles: Number(m[1]), identifiants: Number(m[2]), paliers: Number(p[1]) };
}

// ── les questions, les ancrages, les écarts déclarés ────────────────────────────────────────

export type Question = {
  readonly id: string;
  /** La ligne du registre qui la porte, ou `null` si aucune ligne n'existe encore. */
  readonly decision: string | null;
  readonly objet: string;
  /** Les variables du gabarit qui l'attendent. */
  readonly variables: readonly string[];
};

/**
 * Ce que le gabarit attend et que rien ne tranche. Rédigées comme des questions FERMÉES : la valeur
 * par défaut est celle que le gabarit porte déjà, jamais une valeur nouvelle.
 */
export const QUESTIONS_POUR_WILL: readonly Question[] = [
  {
    id: 'JUR-T01-Q01',
    decision: 'HYP-C1',
    objet:
      'Naissance de l’attribution : provisoire jusqu’à confirmation par l’entreprise (art. 3.2). ' +
      'Ligne avenant non tranchée : dater l’arbitrage avant le premier DocuSeal.',
    variables: [],
  },
  {
    id: 'JUR-T01-Q02',
    decision: 'HYP-E1-9',
    objet: 'Départ des douze mois à la confirmation (art. 3.4 al. 1). Ligne avenant non tranchée.',
    variables: ['FENETRE_MOIS'],
  },
  {
    id: 'JUR-T01-Q03',
    decision: 'HYP-E1-12',
    objet:
      'Déclaration hors connexion horodatée à la réception (art. 3.5). Ligne avenant non ' +
      'tranchée ; le registre cite « al. 4 », le texte est au 3e alinéa.',
    variables: [],
  },
  {
    id: 'JUR-T01-Q04',
    decision: 'HYP-D9',
    objet:
      'Mandat d’autofacturation (art. 5.2, annexe 2) — relecture de JUR-T01c. Ligne avenant non tranchée.',
    variables: [],
  },
  {
    id: 'JUR-T01-Q05',
    decision: 'HYP-D14',
    objet:
      'Bonus de parrainage : l’art. 4.6 ne prévoit aucun forfait. Soit le bonus est écrit au 4.6, ' +
      'soit la ligne HYP-D14 est retirée. Défaut : le texte actuel, sans bonus.',
    variables: [],
  },
  {
    id: 'JUR-T01-Q06',
    decision: 'HYP-E1-19',
    objet:
      'Parrainage : taux et fenêtre (art. 4.6). Le registre étend le taux aux lignes de reprise ; ' +
      'l’art. 4.6 ne le dit pas expressément. Ligne avenant non tranchée.',
    variables: ['PARRAINAGE_TAUX', 'PARRAINAGE_MOIS'],
  },
  {
    id: 'JUR-T01-Q07',
    decision: 'HYP-E1-22',
    objet:
      'Ligne acquise bloquée pour le KYC, conservée sans limite (art. 5.4). Ligne avenant non tranchée.',
    variables: [],
  },
  {
    id: 'JUR-T01-Q08',
    decision: 'HYP-RESIDENCE',
    objet:
      'Résidence fiscale française : aucune stipulation ne la porte. Soit l’art. 6.1 l’écrit, ' +
      'soit la ligne redevient un paramètre et REQ-CPL-004 s’assouplit.',
    variables: [],
  },
  {
    id: 'JUR-T01-Q09',
    decision: 'HYP-C12',
    objet:
      'Antériorité : le registre compte un formulaire ou un rendez-vous de moins de 90 jours ; ' +
      'l’art. 3.3 ne connaît que le client facturé (24 mois) et le devis (6 mois).',
    variables: [],
  },
  {
    id: 'JUR-T01-Q10',
    decision: null,
    objet: 'Capital social de la Société : absent de W1 et de config/entite.json.',
    variables: ['CAPITAL'],
  },
  {
    id: 'JUR-T01-Q11',
    decision: null,
    objet:
      'Représentant légal de la Société (nom du Président) : absent de W1 et de config/entite.json.',
    variables: ['REPRESENTANT'],
  },
  {
    id: 'JUR-T01-Q12',
    decision: null,
    objet:
      'Les trente commissions de la grille du premier contrat (annexe 1) : W6 fixe le périmètre, ' +
      'aucune ligne ne fixe les montants. Ils vivent hors dépôt (W13).',
    variables: [],
  },
  {
    id: 'JUR-T01-Q13',
    decision: null,
    objet:
      'Registre à corriger (gardien du spec) : W11 annonce 23 identifiants CL-* ; REQ-JUR-003 et ' +
      'le gabarit en portent 22. Même chose pour les alinéas cités par W9 et HYP-E1-12.',
    variables: [],
  },
  {
    id: 'JUR-T01-Q14',
    decision: null,
    objet:
      'Annexe 1 : son chapeau cite des noms internes (W6, W12, GrilleContrat, pricing.ts) et A1.6 ' +
      'affirme qu’aucun palier ne porte la mention CPF — à vérifier sur la grille rendue.',
    variables: [],
  },
];

export type Concordance = {
  readonly decision: string;
  readonly article: string;
  /** L'alinéa visé (1 = premier), ou `null` pour l'article entier. */
  readonly alinea: number | null;
  /** Fragments de la ligne du registre qui fondent l'ancrage. */
  readonly registre: readonly string[];
  /** Fragments que l'article (ou l'alinéa) du gabarit doit porter. */
  readonly gabarit: readonly string[];
  /** Fragments qui ne doivent figurer NULLE PART dans le gabarit. */
  readonly absents: readonly string[];
};

export const CONCORDANCES: readonly Concordance[] = [
  {
    decision: 'W9',
    article: '3.4',
    alinea: null,
    registre: ['prolongée de 3 mois, une seule fois'],
    gabarit: ['prolongée de trois mois, une seule fois'],
    absents: [],
  },
  {
    decision: 'W9',
    article: '3.4',
    alinea: 4,
    registre: ['art. 3.4 al. 4 conservé'],
    gabarit: ['prolongée de trois mois, une seule fois'],
    absents: [],
  },
  {
    decision: 'W12',
    article: '4.1',
    alinea: null,
    registre: ['peut descendre sous la grille publiée', 'motif obligatoire'],
    gabarit: [
      'à la hausse comme à la baisse',
      "l'écart et son motif sont portés à la connaissance de l'Apporteur avant la signature",
    ],
    absents: [],
  },
  {
    decision: 'HYP-C1',
    article: '3.2',
    alinea: null,
    registre: ["Provisoire jusqu'à confirmation par l'entreprise"],
    gabarit: ["L'attribution est d'abord provisoire", "lorsque l'entreprise confirme"],
    absents: [],
  },
  {
    decision: 'HYP-E1-9',
    article: '3.4',
    alinea: null,
    registre: ['confirmeeAt + 12 mois'],
    gabarit: ['{{FENETRE_MOIS}} mois à compter de sa confirmation'],
    absents: [],
  },
  {
    decision: 'HYP-E1-12',
    article: '3.5',
    alinea: null,
    registre: ['Horodaté à la réception par le serveur'],
    gabarit: ['horodatée à sa réception par le serveur'],
    absents: [],
  },
  {
    decision: 'HYP-E1-12',
    article: '3.5',
    alinea: 4,
    registre: ['art. 3.5 al. 4 du gabarit'],
    gabarit: ['horodatée à sa réception par le serveur'],
    absents: [],
  },
  {
    decision: 'HYP-D11',
    article: '12.2',
    alinea: null,
    registre: ['Aucune déchéance', 'sont payées au dernier relevé sans le seuil'],
    gabarit: [
      'Les commissions déjà acquises sont payées au dernier relevé, sans application du seuil',
    ],
    absents: ['déchéance', 'déchu', 'dechue'],
  },
  {
    decision: 'HYP-D11',
    article: '12.3',
    alinea: null,
    registre: ['suivent la règle ordinaire du contrat art. 12.3'],
    gabarit: [
      "Les commandes signées avant la fin du contrat continuent d'ouvrir droit à commission",
    ],
    absents: [],
  },
  {
    decision: 'HYP-D9',
    article: '5.2',
    alinea: null,
    registre: ['mandat dans le contrat'],
    gabarit: ["donne mandat à la Société d'établir en son nom et pour son compte les factures"],
    absents: [],
  },
  {
    decision: 'HYP-D14',
    article: '4.6',
    alinea: null,
    registre: ['dû à la première ligne acquise du filleul'],
    gabarit: ['{{BONUS_FILLEUL}}'],
    absents: [],
  },
  {
    decision: 'HYP-E1-19',
    article: '4.6',
    alinea: null,
    registre: ['profondeur 1', 'contratFilleulSigneAt + 12 mois'],
    gabarit: ['un seul niveau', '{{PARRAINAGE_MOIS}} mois de la signature de son contrat'],
    absents: [],
  },
  {
    decision: 'HYP-E1-22',
    article: '5.4',
    alinea: null,
    registre: ["demeurent acquises à l'Apporteur"],
    gabarit: ["demeurent acquises à l'Apporteur"],
    absents: [],
  },
  {
    decision: 'HYP-RESIDENCE',
    article: '6.1',
    alinea: null,
    registre: ["L'Apporteur exerce depuis un établissement immatriculé en France"],
    gabarit: ['exerce depuis un établissement immatriculé en France'],
    absents: [],
  },
  {
    decision: 'HYP-C12',
    article: '3.3',
    alinea: null,
    registre: ['devis < 6 mois', 'formulaire/Calendly < 90 j'],
    gabarit: ['devis de moins de six mois', 'formulaire'],
    absents: [],
  },
  {
    decision: 'HYP-JUR-PROF-REGLEMENTEES',
    article: '23',
    alinea: null,
    registre: ['art. 23 du gabarit'],
    gabarit: ['ni à un statut ou à une réglementation professionnelle'],
    absents: [],
  },
  // ── W15 (2026-09-25) : l'art. 4.6 amendé (al. 6) et complété (al. 8, correction du rattachement)
  {
    decision: 'W15',
    article: '4.6',
    alinea: 3,
    registre: ['un seul niveau rémunéré, inchangé', 'contrat art. 4.6 al. 3'],
    gabarit: ['un seul niveau'],
    absents: [],
  },
  {
    decision: 'W15',
    article: '4.6',
    alinea: 6,
    registre: ["l'art. 4.6 al. 6 est amendé"],
    gabarit: [
      'la liste de ses filleuls directs',
      '« en signature » ou « signé »',
      'sort de la liste',
    ],
    absents: ['autre que le montant du parrainage qui lui revient'],
  },
  {
    decision: 'W15',
    article: '4.6',
    alinea: null,
    registre: ["clause de correction du rattachement ajoutée à l'art. 4.6"],
    gabarit: ['Correction du rattachement', "ne vaut que pour l'avenir"],
    absents: [],
  },
  {
    decision: 'HYP-W15-ART-4-6',
    article: '4.6',
    alinea: 6,
    registre: [
      "l'al. 6 autorise au parrain la liste de ses filleuls directs",
      'une relation résiliée fait sortir le filleul de la liste',
      'ni le motif, ni aucune mesure intermédiaire',
    ],
    gabarit: [
      "réduite pour chacun au prénom, à l'initiale du nom et à l'état de son contrat",
      'postérieures à sa dernière résiliation',
      'sort de la liste',
      'Ni le motif de la fin de la relation',
      "ni aucune mesure prise à l'égard du filleul",
      'aucun montant par filleul',
    ],
    absents: [],
  },
  {
    decision: 'HYP-W15-PARRAIN-A-DATE',
    article: '4.6',
    alinea: null,
    registre: [
      "Clause de correction du rattachement ajoutée à l'art. 4.6",
      'erreur de rattachement',
      'fraude ou auto-parrainage',
      'départ ou résiliation du parrain',
      "Aucun accord écrit du parrain d'origine",
    ],
    gabarit: [
      'une erreur dans le rattachement initial',
      'une fraude ou un auto-parrainage',
      'le départ du parrain ou la résiliation de son contrat',
      "restent acquises au parrain d'origine",
      "L'accord du parrain d'origine n'est pas requis",
    ],
    absents: [],
  },
  {
    decision: 'HYP-W15-EQUIPE',
    article: '4.6',
    alinea: 6,
    registre: ["il suggère un encadrement que l'art. 4.6 al. 6 exclut"],
    gabarit: ["n'emporte aucune fonction d'encadrement"],
    absents: [],
  },
];

/**
 * Les références « art. N » du registre qui ne visent PAS le contrat, chacune prouvée par un
 * fragment de sa ligne. Déclarées une à une, jamais par motif : une déclaration dont le fragment a
 * quitté la ligne est périmée et rougit, pour qu'elle ne couvre pas une vraie référence au contrat.
 */
export type ReferenceHorsContrat = {
  readonly decision: string;
  readonly article: string;
  /** Le fragment de la ligne qui dit quel texte l'article vise. */
  readonly registre: string;
  readonly vise: string;
};

export const REFERENCES_HORS_CONTRAT: readonly ReferenceHorsContrat[] = [
  {
    decision: 'HYP-W15-NOTES',
    article: '15',
    registre: "la fonction d'export art. 15 du module RGPD",
    vise: 'art. 15 du RGPD (droit d’accès), pas l’art. 15 du contrat',
  },
];

export type Divergence = {
  /** `<décision>:<article>[:al<n>]` pour un ancrage, `W11:<grandeur>` pour la structure. */
  readonly cle: string;
  readonly constat: string;
  readonly question: string;
};

export const DIVERGENCES_DECLAREES: readonly Divergence[] = [
  {
    cle: 'W9:3.4:al4',
    constat: 'le registre cite l’al. 4 de l’art. 3.4 ; la prolongation est au 3e alinéa',
    question: 'JUR-T01-Q13',
  },
  {
    cle: 'HYP-E1-12:3.5:al4',
    constat: 'le registre cite l’al. 4 de l’art. 3.5, qui n’en compte que trois',
    question: 'JUR-T01-Q03',
  },
  {
    cle: 'HYP-D14:4.6',
    constat: 'le forfait de parrainage du registre n’a aucune base à l’art. 4.6',
    question: 'JUR-T01-Q05',
  },
  {
    cle: 'HYP-RESIDENCE:6.1',
    constat: 'l’art. 6.1 ne porte pas la résidence que le registre exige au KYC',
    question: 'JUR-T01-Q08',
  },
  {
    cle: 'HYP-C12:3.3',
    constat: 'l’art. 3.3 ne connaît pas l’antériorité par formulaire ou rendez-vous',
    question: 'JUR-T01-Q09',
  },
  {
    cle: 'W11:identifiants',
    constat: 'W11 annonce 23 identifiants ; le gabarit et REQ-JUR-003 en portent 22',
    question: 'JUR-T01-Q13',
  },
];

// ── le contrôle ──────────────────────────────────────────────────────────────────────────────

export type FauteDeConcordance = { readonly famille: string; readonly message: string };
export type Ecart = { readonly cle: string; readonly message: string };

function cleDe(c: Concordance): string {
  return `${c.decision}:${c.article}${c.alinea === null ? '' : `:al${c.alinea}`}`;
}

export function controlerConcordances(entree: {
  registre: readonly LigneDeDecision[];
  gabarit: string;
  concordances: readonly Concordance[];
  divergences: readonly Divergence[];
  questions: readonly Question[];
  horsContrat?: readonly ReferenceHorsContrat[];
}): { fautes: FauteDeConcordance[]; ecarts: Ecart[] } {
  const horsContrat = entree.horsContrat ?? REFERENCES_HORS_CONTRAT;
  const fautes: FauteDeConcordance[] = [];
  const ecarts: Ecart[] = [];
  const parId = new Map(entree.registre.map((l) => [l.id, l]));
  const unites = unitesDuGabarit(entree.gabarit);
  const toutLeGabarit = normaliser(entree.gabarit).toLowerCase();

  // 1. Les ancrages.
  for (const c of entree.concordances) {
    const ligne = parId.get(c.decision);
    if (ligne === undefined) {
      fautes.push({
        famille: 'decision_absente',
        message: `${cleDe(c)} — la décision ${c.decision} n'est plus au registre.`,
      });
      continue;
    }
    for (const f of c.registre) {
      if (!ligne.texte.includes(normaliser(f))) {
        fautes.push({
          famille: 'registre_sans_fragment',
          message:
            `${cleDe(c)} — la ligne ${c.decision} ne porte plus « ${f} » : le registre a changé, ` +
            `l'ancrage doit être relu avec lui.`,
        });
      }
    }
    const unite = unites.get(c.article);
    if (unite === undefined) {
      fautes.push({
        famille: 'article_absent',
        message: `${cleDe(c)} — l'article ${c.article} n'existe pas dans le gabarit.`,
      });
      continue;
    }
    const zone = normaliser(
      c.alinea === null ? unite.alineas.join(' ') : (unite.alineas[c.alinea - 1] ?? '')
    );
    const manquants = c.gabarit.filter((f) => !zone.includes(normaliser(f)));
    const presents = c.absents.filter((f) => toutLeGabarit.includes(f.toLowerCase()));
    if (manquants.length > 0 || presents.length > 0) {
      ecarts.push({
        cle: cleDe(c),
        message:
          `${cleDe(c)} — ` +
          [
            ...manquants.map(
              (f) =>
                `« ${f} » absent de l'art. ${c.article}${c.alinea === null ? '' : ` al. ${c.alinea}`}`
            ),
            ...presents.map((f) => `« ${f} » présent dans le gabarit`),
          ].join(' ; '),
      });
    }
  }

  // 2. La structure annoncée par W11.
  const w11 = parId.get('W11');
  const structure = w11 === undefined ? null : structureW11(w11.texte);
  if (structure === null) {
    fautes.push({
      famille: 'structure_illisible',
      message:
        'W11 — la ligne est absente ou ne dit plus « N articles, N identifiants … N paliers ».',
    });
  } else {
    const reel = {
      articles: [...unites.keys()].filter((k) => /^\d+$/.test(k)).length,
      identifiants: clausesPosees(entree.gabarit).length,
      paliers: paliersDeLAnnexe1(entree.gabarit).length,
    };
    for (const g of ['articles', 'identifiants', 'paliers'] as const) {
      if (structure[g] !== reel[g]) {
        ecarts.push({
          cle: `W11:${g}`,
          message: `W11:${g} — le registre annonce ${structure[g]}, le gabarit en porte ${reel[g]}`,
        });
      }
    }
  }

  // 3. Écarts constatés contre écarts déclarés, dans les deux sens.
  for (const e of ecarts) {
    if (!entree.divergences.some((d) => d.cle === e.cle)) {
      fautes.push({
        famille: 'divergence_non_declaree',
        message:
          `${e.message}. Le gabarit et le registre divergent : corrige l'un ou l'autre, ou déclare ` +
          `l'écart dans DIVERGENCES_DECLAREES avec la question qui le tranchera.`,
      });
    }
  }
  for (const d of entree.divergences) {
    if (!ecarts.some((e) => e.cle === d.cle)) {
      fautes.push({
        famille: 'divergence_perimee',
        message:
          `${d.cle} — l'écart déclaré (« ${d.constat} ») n'est plus constaté. Retire la ` +
          `déclaration : périmée, elle masquerait le prochain écart au même endroit.`,
      });
    }
    if (!entree.questions.some((q) => q.id === d.question)) {
      fautes.push({
        famille: 'question_absente',
        message: `${d.cle} — l'écart renvoie à la question ${d.question}, qui n'est plus déclarée.`,
      });
    }
  }

  // 4. Toute référence d'article du registre a son ancrage — sauf celles, déclarées, qui visent un
  //    autre texte ; une déclaration dont le fragment a quitté sa ligne est périmée.
  for (const h of horsContrat) {
    const ligne = parId.get(h.decision);
    if (ligne === undefined || !ligne.texte.includes(normaliser(h.registre))) {
      fautes.push({
        famille: 'hors_contrat_perimee',
        message:
          `${h.decision} — la référence hors contrat « art. ${h.article} » (${h.vise}) ne se lit plus ` +
          `dans « ${h.registre} » : retire la déclaration ou relis-la avec le registre.`,
      });
    }
  }
  for (const ligne of entree.registre) {
    for (const ref of referencesDArticle(ligne.texte)) {
      const etrangere = horsContrat.some(
        (h) =>
          h.decision === ligne.id &&
          h.article === ref.article &&
          ligne.texte.includes(normaliser(h.registre))
      );
      if (etrangere) continue;
      const couverte = entree.concordances.some(
        (c) =>
          c.decision === ligne.id &&
          c.article === ref.article &&
          (ref.alinea === null || c.alinea === ref.alinea)
      );
      if (!couverte) {
        fautes.push({
          famille: 'reference_sans_concordance',
          message:
            `${ligne.id} cite l'art. ${ref.article}${ref.alinea === null ? '' : ` al. ${ref.alinea}`} ` +
            `du contrat, et aucun ancrage ne le vérifie : ajoute-le à CONCORDANCES.`,
        });
      }
    }
  }

  // 5. Les lignes avenant ouvertes sont des questions ; les questions tranchées sont périmées.
  for (const ligne of entree.registre) {
    if (
      ligne.avenant &&
      ligne.tranchee === null &&
      !entree.questions.some((q) => q.decision === ligne.id)
    ) {
      fautes.push({
        famille: 'avenant_sans_question',
        message:
          `${ligne.id} est marquée avenant et n'est pas tranchée : elle touche le contrat signé. ` +
          `Déclare-la dans QUESTIONS_POUR_WILL — le gabarit ne peut pas être publié tant qu'elle est ouverte.`,
      });
    }
  }
  for (const q of entree.questions) {
    if (q.decision === null) continue;
    const ligne = parId.get(q.decision);
    if (ligne === undefined || ligne.tranchee !== null) {
      fautes.push({
        famille: 'question_perimee',
        message:
          `${q.id} — ${q.decision} est ${ligne === undefined ? 'absente du registre' : `tranchée le ${ligne.tranchee}`}. ` +
          `Reporte l'arbitrage dans le gabarit et retire la question.`,
      });
    }
  }

  return { fautes, ecarts };
}
