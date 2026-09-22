/**
 * aucun-annee-de-naissance.ts — la garde dédiée de REQ-SEC-013 et REQ-INT-021 (INT-T09) :
 * AUCUNE ANNÉE DE NAISSANCE NE TRAVERSE, et la liste des dirigeants n'atteint jamais le navigateur.
 *
 * USAGE : npx tsx scripts/gates/aucun-annee-de-naissance.ts                  juge le dépôt
 *         npx tsx scripts/gates/aucun-annee-de-naissance.ts --reponse <f>    juge UNE réponse (bac)
 *         npx tsx scripts/gates/aucun-annee-de-naissance.ts --prove          témoins et contre-témoin
 *
 * CE QU'ELLE FAIT SUR LE DÉPÔT. Pour chaque fixture ENREGISTRÉE (`tests/fixtures/recherche-entreprises/`),
 * elle fait passer la réponse du tiers par le VRAI mandataire (`autocompleterEntreprise`, tiers
 * simulé par la fixture, compteurs et cache neutres) et par la VRAIE projection, puis lit deux
 * sorties :
 *   — le RENDU (ce que le navigateur reçoit) : aucune clé de dirigeant, de naissance, de prénom,
 *     de nationalité, de qualité ;
 *   — la FICHE (ce qui est persisté) : aucune clé de naissance, de prénom, de nationalité ;
 * et, dans les deux, AUCUNE VALEUR de personne du tiers — nom, prénoms, année, mois de naissance
 * d'un dirigeant personne physique, comparés en valeur exacte à chaque feuille.
 *
 * QUATRE FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `perimetre_vide`       moins de 20 fixtures lues (REQ-QA-028 : ≥ 20 cas)
 *   `cle_interdite`        une clé interdite dans une sortie — le chemin du champ est NOMMÉ
 *   `valeur_de_personne`   une valeur de personne du tiers dans une sortie — le champ est nommé
 *   `fixture_illisible`    une fixture qui ne se lit pas ou que le schéma refuse
 *
 * LIMITES DÉCLARÉES. C'est un FIL TENDU, pas une preuve : il lit des NOMS de clés et des valeurs
 * EXACTES. Une année transformée (un âge calculé, une date reformatée) ou un champ renommé sans
 * aucun des segments interdits lui échappe. Ce qui tient la production face à eux est la défense
 * À L'EXÉCUTION : le schéma du tiers ne LIT ni l'année ni le mois de naissance (ils n'existent plus
 * dans l'objet lu), et le rendu comme la fiche passent par des schémas STRICTS à liste blanche
 * (`src/server/integrations/recherche-entreprises/schemas.ts`), qui lèvent sur toute clé en plus.
 * Le mode `--reponse` ne juge que les clés : il n'a pas la réponse du tiers pour comparer les valeurs.
 */
import { readFileSync } from 'node:fs';
import {
  autocompleterEntreprise,
  type DependancesDuMandataire,
} from '../../src/server/integrations/recherche-entreprises/autocompletion';
import { creerDisjoncteur } from '../../src/server/integrations/recherche-entreprises/disjoncteur';
import {
  empreinteurDeDirigeants,
  projeter,
} from '../../src/server/integrations/recherche-entreprises/projection';
import { schemaReponseDuTiers } from '../../src/server/integrations/recherche-entreprises/schemas';
import {
  lireFixtures,
  type FixtureEnregistree,
} from '../../src/server/integrations/recherche-entreprises/fixtures';
import { sujetDepuisEmpreinte } from '../../src/server/securite/rate-limit';

export const FAMILLES = [
  'perimetre_vide',
  'cle_interdite',
  'valeur_de_personne',
  'fixture_illisible',
] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}

const MINIMUM_DE_FIXTURES = 20;
/** Ce que le navigateur ne voit jamais d'un dirigeant — ni la liste, ni rien de ce qu'elle porte. */
const INTERDIT_AU_RENDU = /dirigeant|naissance|prenom|nationalite|qualite/i;
/** Ce que la fiche persistée ne garde jamais. `dirigeants` y est admis : empreinte et qualité. */
const INTERDIT_A_LA_FICHE = /naissance|prenom|nationalite/i;

type Feuille = { chemin: string; valeur: string };

function parcourir(v: unknown, chemin: string, cles: string[], feuilles: Feuille[]): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => parcourir(x, `${chemin}[${i}]`, cles, feuilles));
  } else if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      cles.push(`${chemin}.${k}`);
      parcourir(x, `${chemin}.${k}`, cles, feuilles);
    }
  } else if (v !== null && v !== undefined) {
    feuilles.push({ chemin, valeur: String(v) });
  }
}

/** Juge une sortie : ses clés contre le motif interdit, ses feuilles contre les valeurs de personne. */
export function jugerUneSortie(
  origine: string,
  sortie: unknown,
  interdit: RegExp,
  valeursDePersonne: ReadonlySet<string>
): Faute[] {
  const cles: string[] = [];
  const feuilles: Feuille[] = [];
  parcourir(sortie, '', cles, feuilles);
  const fautes: Faute[] = [];
  for (const c of cles) {
    const nom = c.slice(c.lastIndexOf('.') + 1);
    if (interdit.test(nom)) {
      fautes.push({ famille: 'cle_interdite', message: `${origine} : champ \`${nom}\` (${c})` });
    }
  }
  for (const f of feuilles) {
    if (valeursDePersonne.has(f.valeur)) {
      fautes.push({
        famille: 'valeur_de_personne',
        message: `${origine} : une valeur de personne du tiers au champ ${f.chemin}`,
      });
    }
  }
  return fautes;
}

/** Les valeurs de personne d'une réponse BRUTE du tiers : nom, prénoms, année, mois de naissance. */
function valeursDePersonne(reponse: unknown): Set<string> {
  const valeurs = new Set<string>();
  const resultats =
    (reponse as { results?: { dirigeants?: Record<string, unknown>[] }[] }).results ?? [];
  for (const r of resultats) {
    for (const d of r.dirigeants ?? []) {
      if (d.type_dirigeant !== 'personne physique') continue;
      for (const champ of ['nom', 'prenoms', 'annee_de_naissance', 'date_de_naissance']) {
        const v = d[champ];
        if (typeof v === 'string' && v !== '') valeurs.add(v);
      }
    }
  }
  return valeurs;
}

const TOUT_ADMIS = {
  autorise: true,
  restant: 1,
  repriseAt: null,
  panne: false,
  motif: 'admis',
} as const;

/** Le vrai mandataire, avec la fixture pour tiers, et des compteurs et un cache NEUTRES. */
function dependancesDeGarde(reponse: unknown): DependancesDuMandataire {
  return {
    horloge: { maintenant: () => 0 },
    tiers: async () => {
      const lu = schemaReponseDuTiers.safeParse(reponse);
      return lu.success
        ? { ok: true, reponse: lu.data }
        : { ok: false, motif: 'reponse_illisible', retryAfterMs: null };
    },
    cache: { lire: async () => null, ecrire: async () => undefined },
    limiteur: {
      global: async () => TOUT_ADMIS,
      identite: async () => TOUT_ADMIS,
      adresse: async () => TOUT_ADMIS,
    },
    disjoncteur: creerDisjoncteur(),
    empreindre: empreinteurDeDirigeants('garde-aucune-annee-de-naissance'),
    journaliser: () => undefined,
  };
}

const APPELANT = {
  identite: sujetDepuisEmpreinte('0'.repeat(64)),
  adresse: sujetDepuisEmpreinte('1'.repeat(64)),
};

/** Juge une fixture : son rendu par le mandataire, et ses fiches par la projection. */
export async function jugerUneFixture(f: FixtureEnregistree): Promise<Faute[]> {
  const lu = schemaReponseDuTiers.safeParse(f.reponse);
  if (!lu.success)
    return [{ famille: 'fixture_illisible', message: `${f.fichier} : refusée par le schéma` }];
  const personnes = valeursDePersonne(f.reponse);
  const rendu = await autocompleterEntreprise(
    { q: f.requete.q },
    APPELANT,
    dependancesDeGarde(f.reponse)
  );
  const fiches = projeter(
    lu.data,
    empreinteurDeDirigeants('garde-aucune-annee-de-naissance')
  ).fiches;
  return [
    ...jugerUneSortie(`${f.fichier} (rendu)`, rendu, INTERDIT_AU_RENDU, personnes),
    ...jugerUneSortie(`${f.fichier} (fiche)`, fiches, INTERDIT_A_LA_FICHE, personnes),
  ];
}

export async function jugerLeDepot(
  fixtures: readonly FixtureEnregistree[]
): Promise<{ fautes: Faute[]; lues: number }> {
  const fautes: Faute[] = [];
  if (fixtures.length < MINIMUM_DE_FIXTURES) {
    fautes.push({
      famille: 'perimetre_vide',
      message: `${fixtures.length} fixture(s) lue(s), il en faut au moins ${MINIMUM_DE_FIXTURES}`,
    });
  }
  for (const f of fixtures) fautes.push(...(await jugerUneFixture(f)));
  return { fautes, lues: fixtures.length };
}

/** Une réponse de bac d'essai, lue comme un rendu : seules ses clés sont jugeables. */
export function jugerUneReponse(chemin: string): Faute[] {
  let sortie: unknown;
  try {
    sortie = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch {
    return [{ famille: 'fixture_illisible', message: `${chemin} : pas un JSON lisible` }];
  }
  return jugerUneSortie(chemin, sortie, INTERDIT_AU_RENDU, new Set());
}

function imprimer(fautes: readonly Faute[]): void {
  for (const f of fautes) process.stdout.write(`  [${f.famille}] ${f.message}\n`);
}

/** Les témoins DÉRIVENT du rendu réel d'une fixture enregistrée : aucune faute n'est tapée à la main. */
async function prouver(): Promise<boolean> {
  const fixtures = lireFixtures();
  const porteuse = fixtures.find((f) =>
    (f.reponse as { results: { dirigeants: { type_dirigeant: string }[] }[] }).results.some((r) =>
      r.dirigeants.some((d) => d.type_dirigeant === 'personne physique')
    )
  );
  if (porteuse === undefined) {
    process.stdout.write(
      '❌ --prove : aucune fixture enregistrée ne porte de dirigeant personne physique\n'
    );
    return false;
  }
  const brut = porteuse.reponse as { results: { dirigeants: Record<string, string>[] }[] };
  const dirigeants = brut.results.find((r) => r.dirigeants.length > 0)!.dirigeants;
  const personne = dirigeants.find((d) => d.type_dirigeant === 'personne physique')!;
  const rendu = async () =>
    (await autocompleterEntreprise(
      { q: porteuse.requete.q },
      APPELANT,
      dependancesDeGarde(porteuse.reponse)
    )) as unknown as { suggestions: Record<string, unknown>[] } & Record<string, unknown>;
  const personnes = valeursDePersonne(porteuse.reponse);

  const temoins: {
    nom: string;
    famille: Famille;
    champ: string;
    fautes: () => Promise<Faute[]>;
  }[] = [
    {
      nom: 'une réponse de bac portant la liste des dirigeants',
      famille: 'cle_interdite',
      champ: 'dirigeants',
      fautes: async () => {
        const r = await rendu();
        r.dirigeants = dirigeants;
        return jugerUneSortie('bac (dirigeants)', r, INTERDIT_AU_RENDU, personnes);
      },
    },
    {
      nom: 'une réponse de bac portant une année de naissance',
      famille: 'cle_interdite',
      champ: 'annee_de_naissance',
      fautes: async () => {
        const r = await rendu();
        r.suggestions[0]!.annee_de_naissance = personne.annee_de_naissance;
        return jugerUneSortie('bac (année)', r, INTERDIT_AU_RENDU, personnes);
      },
    },
    {
      nom: 'une année de naissance glissée sous un champ admis',
      famille: 'valeur_de_personne',
      champ: 'codePostal',
      fautes: async () => {
        const r = await rendu();
        r.suggestions[0]!.codePostal = personne.annee_de_naissance;
        return jugerUneSortie('bac (valeur)', r, INTERDIT_AU_RENDU, personnes);
      },
    },
    {
      nom: 'un jeu de moins de vingt fixtures',
      famille: 'perimetre_vide',
      champ: 'fixture',
      fautes: async () => (await jugerLeDepot(fixtures.slice(0, MINIMUM_DE_FIXTURES - 1))).fautes,
    },
  ];

  let ok = true;
  for (const t of temoins) {
    const fautes = (await t.fautes()).filter(
      (f) => f.famille === t.famille && f.message.includes(t.champ)
    );
    const rougit = fautes.length > 0;
    ok &&= rougit;
    process.stdout.write(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.nom}\n`);
    imprimer(fautes);
  }
  const contre = await jugerLeDepot(fixtures);
  const vert = contre.fautes.length === 0;
  ok &&= vert;
  process.stdout.write(
    `${vert ? '🟢' : '❌ ROUGIT'} contre-témoin : les ${contre.lues} fixtures enregistrées\n`
  );
  imprimer(contre.fautes);
  return ok;
}

async function principal(argv: readonly string[]): Promise<number> {
  if (argv.includes('--prove')) return (await prouver()) ? 0 : 1;
  const i = argv.indexOf('--reponse');
  if (i >= 0) {
    const chemin = argv[i + 1];
    if (chemin === undefined) {
      process.stderr.write('--reponse attend un chemin\n');
      return 2;
    }
    const fautes = jugerUneReponse(chemin);
    process.stdout.write(
      fautes.length === 0
        ? `✅ aucune-annee-de-naissance — ${chemin} : aucun champ interdit\n`
        : `❌ aucune-annee-de-naissance — ${fautes.length} faute(s) :\n`
    );
    imprimer(fautes);
    return fautes.length === 0 ? 0 : 1;
  }
  const { fautes, lues } = await jugerLeDepot(lireFixtures());
  process.stdout.write(
    fautes.length === 0
      ? `✅ aucune-annee-de-naissance — ${lues} fixture(s) enregistrée(s) jugée(s), rendu et fiche : aucun champ ni valeur de personne\n`
      : `❌ aucune-annee-de-naissance — ${fautes.length} faute(s) sur ${lues} fixture(s) :\n`
  );
  imprimer(fautes);
  return fautes.length === 0 ? 0 : 1;
}

principal(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
);
