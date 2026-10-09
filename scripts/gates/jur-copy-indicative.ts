/**
 * jur-copy-indicative.ts — `jur:copy-indicative-partners` (QA-T69 ; REQ-JUR-001, REQ-JUR-002) : la rémunération
 * d'un apporteur ne se promet pas.
 *
 * USAGE : npx tsx scripts/gates/jur-copy-indicative.ts           (juge le dépôt)
 *         npx tsx scripts/gates/jur-copy-indicative.ts --prove   (témoins INJECTÉS)
 *
 * TRANSPOSÉE de la garde d'axion-ia (`scripts/gates/jur-copy-indicative.ts`), motifs repris
 * tels quels, sur la copy de Partners : les fichiers SUIVIS de `src/content/**` et de
 * `docs/maquettes/**`. Familles :
 *   — `remuneration_ferme` : une formule qui présente une rémunération comme acquise (« vous
 *     touchez », une commission chiffrée, un montant ou un taux près d'une commission) SANS mention
 *     indicative (« à partir de », « selon profil », « à titre indicatif ») dans la ligne ou ses deux
 *     voisines. « Jusqu'à » n'en est PAS une ;
 *   — `revenu_illimite` et `projection_mensuelle` : un plafond absent, un rythme de ventes par mois ;
 *     l'indicatif ne les excuse pas ;
 *   — `promesse_sans_risque`, `kit_de_vente` (REQ-JUR-041), `jsonld_remuneration` ;
 *   — `exception_perimee` : une exception nommée qui ne trouve plus sa ligne ;
 *   — `perimetre_vide` : aucun fichier lu.
 * La famille d'axion-ia sur l'AI Act n'est pas reprise : elle juge la communication commerciale
 * d'Axion-IA, que Partners ne porte pas.
 *
 * LA LIGNE TELLE QU'ON LA LIT : balises retirées, entités HTML décodées ; un commentaire n'est pas
 * jugé. Limite déclarée, comme l'originale : une mention indicative à plus de deux lignes de la
 * formule ferme n'est pas vue.
 *
 * ÉCHEC FERMÉ. Le périmètre vient de la source unique des fichiers suivis : git muet, rouge.
 */
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { restreindreALaPr } from './fichiers-de-la-pr';

export type Fichier = { chemin: string; texte: string };
export type Faute = { famille: string; chemin: string; ligne: number; extrait: string };

const FIN = String.raw`(?![\wÀ-ÿ])`;
const DEBUT = String.raw`(?<![\wÀ-ÿ])`;
const REMUNERATION = String.raw`(?:commissions?|revenus?|rémunérations?|gagn[\wÀ-ÿ]*|pour\s+vous)${FIN}`;
const TAUX = String.raw`(?:\d+(?:[,.]\d+)?|\})[\s  ]?%`;
const MONTANT = String.raw`(?:(?:\d|\})[\d\s  .]*(?:€|euros?${FIN})|€[\s  ]?(?:\d|\$\{))`;
const OBJET = String.raw`(?:journées?|jours?|formations?|missions?|ventes?|vendues?|pour\s+vous|commissions?)${FIN}`;
const FERME = new RegExp(
  [
    String.raw`${DEBUT}(?:vous|tu)\s+(?:touchez|touches|gagnez|gagnes|percevez|perçois)${FIN}`,
    String.raw`${DEBUT}(?:gagnez|touchez)${FIN}`,
    String.raw`\bcommissions?\s+de\s+\d`,
    String.raw`\$?\{\s*(?:commission\s*\(|montant[A-Z]\w*\s*\})`,
    String.raw`${MONTANT}(?=[^.;!?]{0,60}?${DEBUT}${OBJET})`,
    String.raw`${TAUX}(?=[^.;!?]{0,60}?${DEBUT}${REMUNERATION})`,
    String.raw`${DEBUT}${REMUNERATION}[^.;!?]{0,60}?${TAUX}`,
    String.raw`\bpar\s+journée(?:\s+[\wÀ-ÿ'’-]+){0,6}?\s+(?:vendue|payée|signée)s?${FIN}`,
  ].join('|'),
  'i'
);
const INDICATIF =
  /à\s+partir\s+de|selon\s+(?:votre\s+|ton\s+|son\s+)?profil|à\s+titre\s+indicatif|\bindicati(?:f|ve|fs|ves)\b/i;
const ILLIMITE = new RegExp(
  [
    String.raw`\bsans\s+(?:aucune?\s+)?plafond`,
    String.raw`\b(?:sans\s+(?:aucune\s+)?|aucune\s+|pas\s+de\s+)limite(?!\s+d['’]\s?âge)`,
    String.raw`\bnon\s+plafonn|\bpas\s+de\s+plafond|\bdéplafonn`,
    String.raw`\billimit[ée]e?s?${FIN}`,
    String.raw`\bsans\s+maximum\b`,
  ].join('|'),
  'i'
);
const PROJECTION_MENSUELLE =
  /(?:\d+|\})\s+(?:[\wÀ-ÿ'’-]+\s+){0,2}?(?:formations?|journées?|ventes?|missions?)\b[^.;!?]{0,40}?(?:\bpar\s+mois\b|\bdans\s+le\s+mois\b|\/\s*mois\b)/i;
const SANS_RISQUE =
  /\bz[ée]ro\s+risque|\brisque\s+(?:z[ée]ro|nul)\b|\bsans\s+(?:aucun\s+)?risque|\baucun\s+risque\b/i;
const KIT = /\bkit\s+de\s+vente\b/i;
const JSONLD = /\b(?:incentiveCompensation|baseSalary|MonetaryAmount)\b|"JobPosting"/;
const COMMENTAIRE = /^\s*(?:\/\/|\*|\/\*|<!--)/;
const FENETRE = 2;

const ENTITES = {
  '&nbsp;': ' ',
  '&apos;': "'",
  '&#39;': "'",
  '&rsquo;': '’',
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
} as const;
type Entite = keyof typeof ENTITES;

/** Le motif des entités, DÉRIVÉ de la table : il ne reconnaît que les clés qu'elle décode. */
const MOTIF_DES_ENTITES = new RegExp((Object.keys(ENTITES) as Entite[]).join('|'), 'g');

/** La ligne telle qu'on la lit : balises retirées, entités décodées. */
export function telleQueLue(ligne: string): string {
  return ligne.replace(/<[^>]*>/g, ' ').replace(MOTIF_DES_ENTITES, (e) => ENTITES[e as Entite]);
}

/**
 * EXCEPTIONS NOMMÉES : des faux positifs DÉMONTRÉS, jamais un motif affaibli. Chacune nomme son
 * fichier, un extrait de SA ligne et son motif ; elle ne couvre que la PREMIÈRE ligne qui porte
 * l'extrait. Une exception qui ne trouve plus sa ligne est une faute (`exception_perimee`).
 */
export const EXCEPTIONS_REMUNERATION: ReadonlyArray<{
  readonly chemin: string;
  readonly ligne: string;
  readonly motif: string;
}> = [];

export function fautesDeRemuneration(
  fichiers: readonly Fichier[],
  exceptions: typeof EXCEPTIONS_REMUNERATION = EXCEPTIONS_REMUNERATION
): Faute[] {
  if (fichiers.length === 0)
    return [{ famille: 'perimetre_vide', chemin: '', ligne: 0, extrait: 'aucun fichier lu' }];
  const fautes: Faute[] = [];
  for (const { chemin, texte } of fichiers) {
    const brutes = texte.split('\n');
    const lues = brutes.map((l) => (COMMENTAIRE.test(l) ? null : telleQueLue(l)));
    const exemptees = new Set<number>();
    for (const e of exceptions.filter((x) => x.chemin === chemin)) {
      const i = brutes.findIndex((l) => l.includes(e.ligne));
      if (i < 0) fautes.push({ famille: 'exception_perimee', chemin, ligne: 0, extrait: e.ligne });
      else exemptees.add(i);
    }
    lues.forEach((contenu, i) => {
      if (contenu === null) return;
      const ajouter = (famille: string, m: RegExpExecArray | null) => {
        if (m) fautes.push({ famille, chemin, ligne: i + 1, extrait: m[0] });
      };
      if (!exemptees.has(i)) {
        const ferme = FERME.exec(contenu);
        const voisines = lues.slice(Math.max(0, i - FENETRE), i + FENETRE + 1);
        if (ferme && !voisines.some((v) => v !== null && INDICATIF.test(v)))
          ajouter('remuneration_ferme', ferme);
        ajouter('revenu_illimite', ILLIMITE.exec(contenu));
        ajouter('projection_mensuelle', PROJECTION_MENSUELLE.exec(contenu));
      }
      ajouter('promesse_sans_risque', SANS_RISQUE.exec(contenu));
      ajouter('kit_de_vente', KIT.exec(contenu));
      ajouter('jsonld_remuneration', JSONLD.exec(contenu));
    });
  }
  return fautes;
}

// ── témoins : chacun DOIT rougir de sa famille, et d'elle seule ──────────────────────────────

const MICRO = 'src/content/micro-copy/espace/etats-vides.ts';
/** Une valeur de pourcentage factice, assemblée pour ne jamais s'écrire en clair dans le dépôt. */
const VALEUR_FACTICE = [String(5 * 2), '%'].join(' ');

/** L'ancienne phrase de l'état vide de l'accueil (une promesse de gain dès la signature, contraire à l'art. 4.2). */
export const PHRASE_DE_L_ACCUEIL =
  "    phrase: 'Axion-IA l’appelle. Si elle signe, vous touchez une commission.',";

export const TEMOINS: { quoi: string; fichiers: Fichier[]; famille: string }[] = [
  {
    quoi: 'l’ancienne phrase de l’état vide de l’accueil',
    fichiers: [{ chemin: MICRO, texte: PHRASE_DE_L_ACCUEIL }],
    famille: 'remuneration_ferme',
  },
  {
    quoi: 'un taux de commission présenté comme ferme, dans une maquette',
    fichiers: [
      {
        chemin: 'docs/maquettes/x.html',
        texte: `<p>Une commission de ${String(5 * 2)}&nbsp;% sur chaque vente.</p>`,
      },
    ],
    famille: 'remuneration_ferme',
  },
  {
    quoi: 'un revenu sans plafond',
    fichiers: [{ chemin: MICRO, texte: "phrase: 'Des commissions sans plafond.'," }],
    famille: 'revenu_illimite',
  },
  {
    quoi: 'un rythme de ventes par mois',
    fichiers: [{ chemin: MICRO, texte: "phrase: 'Avec 5 formations vendues par mois.'," }],
    famille: 'projection_mensuelle',
  },
  {
    quoi: 'une promesse sans risque',
    fichiers: [{ chemin: MICRO, texte: "phrase: 'Une activité sans risque.'," }],
    famille: 'promesse_sans_risque',
  },
  {
    quoi: 'un kit de vente',
    fichiers: [{ chemin: MICRO, texte: "phrase: 'Téléchargez le kit de vente.'," }],
    famille: 'kit_de_vente',
  },
  {
    quoi: 'un balisage de rémunération',
    fichiers: [{ chemin: 'docs/maquettes/x.html', texte: '"@type": "JobPosting",' }],
    famille: 'jsonld_remuneration',
  },
  { quoi: 'aucun fichier lu', fichiers: [], famille: 'perimetre_vide' },
];

export const CONTRE_TEMOINS: { quoi: string; fichiers: Fichier[] }[] = [
  {
    quoi: 'la tournure d’A07 pour l’accueil',
    fichiers: [
      {
        chemin: MICRO,
        texte:
          "phrase: 'Si elle passe commande pendant la durée de votre droit à commission, une commission vous revient au fil des paiements.',",
      },
    ],
  },
  {
    quoi: 'un taux annoncé à titre indicatif',
    fichiers: [
      {
        chemin: MICRO,
        // Le taux est assemblé : écrit en clair près de « commission », gov:publication le refuse.
        texte: `phrase: 'À titre indicatif, une commission de ${VALEUR_FACTICE} sur la vente.',`,
      },
    ],
  },
  {
    quoi: 'la limite d’âge n’est pas un revenu illimité',
    fichiers: [{ chemin: MICRO, texte: "phrase: 'Aucune limite d’âge.'," }],
  },
  {
    quoi: 'un commentaire n’est pas jugé',
    fichiers: [{ chemin: MICRO, texte: '// vous touchez une commission : jamais écrit ainsi' }],
  },
];

function prouver(): string[] {
  const echecs: string[] = [];
  for (const t of TEMOINS) {
    const familles = [...new Set(fautesDeRemuneration(t.fichiers).map((f) => f.famille))];
    if (familles.length !== 1 || familles[0] !== t.famille)
      echecs.push(`le témoin « ${t.quoi} » rend [${familles.join(', ')}], attendu ${t.famille}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const f = fautesDeRemuneration(c.fichiers);
    if (f.length > 0)
      echecs.push(`faux positif sur « ${c.quoi} » : [${f[0]!.famille}] « ${f[0]!.extrait} »`);
  }
  return echecs;
}

function cheminsDuPerimetre(): string[] {
  return fichiersSuivisOuRefus('jur:copy-indicative-partners').filter(
    (c) =>
      (c.startsWith('src/content/') && /\.(ts|json|md)$/.test(c)) ||
      (c.startsWith('docs/maquettes/') && /\.(html|md)$/.test(c))
  );
}

/** GOV-160 : sur une PR, seuls les fichiers de la PR sont jugés. */
function lireLeDepot(chemins: string[]): Fichier[] {
  return chemins.map((chemin) => ({ chemin, texte: readFileSync(chemin, 'utf8') }));
}

const APPELE_DIRECTEMENT = /jur-copy-indicative\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const prouve = process.argv.includes('--prove');
  const perimetre = prouve ? [] : cheminsDuPerimetre();
  const dePr = restreindreALaPr(perimetre);
  if (!prouve && dePr.length === 0 && perimetre.length > 0) {
    console.log(
      '✅ jur:copy-indicative-partners — la PR ne modifie aucun fichier de src/content/ ni de docs/maquettes/ : rien de la PR à juger.'
    );
    process.exit(0);
  }
  const fichiers = prouve ? [] : lireLeDepot(dePr);
  const echecs = prouve
    ? prouver()
    : fautesDeRemuneration(fichiers).map(
        (f) => `[${f.famille}] ${f.chemin}:${f.ligne} — « ${f.extrait} »`
      );
  if (echecs.length > 0) {
    console.error(`❌ jur:copy-indicative-partners — ${echecs.length} faute(s) :`);
    for (const e of echecs) console.error(`   ${e}`);
    process.exitCode = 1;
  } else if (prouve) {
    console.log(
      `✅ jur:copy-indicative-partners — ${TEMOINS.length} témoins rougissent chacun sur sa seule famille, ${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
    );
  } else {
    console.log(
      `✅ jur:copy-indicative-partners — ${fichiers.length} fichiers de src/content/ et docs/maquettes/ lus : aucune rémunération présentée comme ferme.`
    );
  }
}
