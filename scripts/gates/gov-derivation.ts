/**
 * gov-derivation.ts — `gov:derivation` (GOV-014, réarmée par DM-03-P ; REQ-DM-014, RM-01).
 *
 * USAGE : npx tsx scripts/gates/gov-derivation.ts           (juge le dépôt)
 *         npx tsx scripts/gates/gov-derivation.ts --prove   (témoins rouges et verts, INJECTÉS)
 *
 * CE QU'ELLE TIENT, POUR LA GRILLE — le seul domaine que `docs/gates.json` lui laisse (les seuils
 * sont à `GATE-JUR-SEUILS-SSOT`, les enums à `partners:schema:enums`) :
 *   — `ecrivain_hors_import` : la table `grilles_commission` n'a QU'UN écrivain,
 *     `src/server/grille/import.ts`, qui confronte chaque ligne à l'empreinte qu'axionia a publiée.
 *     Un second écrivain serait une seconde source : il pourrait écrire une grille que personne n'a
 *     publiée. Tout fichier suivi sous `src/`, `prisma/seed/` ou `scripts/` qui écrit la table par le
 *     client ou en SQL est nommé, ligne comprise ;
 *   — `fixture_non_derivee` : la fixture de la grille est celle qu'a émise le PRODUCTEUR (en-tête
 *     `Source` qui nomme `grille-check.ts --fixture-pseudonymisee`), et chacune de ses lignes rend
 *     l'empreinte publiée. Un centime retapé dans la fixture est nommé par sa ligne ;
 *   — `fixture_absente` : pas de fixture, pas de vert. Rien à juger n'est pas « rien à signaler ».
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne voit ni un montant de grille écrit en toutes lettres
 * (`gov:publication` le refuse), ni la vraie grille de production, qui ne vit qu'en base. Elle lit
 * l'index (`git ls-files`) : un fichier jamais ajouté lui échappe (RM-14).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { lirePublication, verifierPublication } from '../../src/domain/commission/grille';

export const FIXTURE = 'tests/fixtures/axionia/commissions.v1.pseudonymise.json';
/** Le SEUL écrivain de la table, et cette garde, qui nomme les motifs qu'elle cherche. */
export const ECRIVAINS_ADMIS = ['src/server/grille/import.ts', 'scripts/gates/gov-derivation.ts'];
const PERIMETRE = /^(src|prisma\/seed|scripts)\/.*\.(ts|tsx|mts|cts|js|mjs|cjs|sql)$/;
const ECRITURE = [
  /\bgrilleCommission\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/,
  /\b(insert\s+into|update|delete\s+from|truncate)\s+"?grilles_commission\b/i,
];
const PRODUCTEUR = /grille-check\.ts --fixture-pseudonymisee/;

export type Faute = {
  famille: 'ecrivain_hors_import' | 'fixture_non_derivee' | 'fixture_absente';
  message: string;
};

export function fautesDeDerivation(
  fichiers: readonly { chemin: string; texte: string }[],
  fixture: string | null
): Faute[] {
  const fautes: Faute[] = [];
  for (const { chemin, texte } of fichiers) {
    if (!PERIMETRE.test(chemin) || ECRIVAINS_ADMIS.includes(chemin)) continue;
    texte.split('\n').forEach((ligne, i) => {
      if (ECRITURE.some((m) => m.test(ligne))) {
        fautes.push({
          famille: 'ecrivain_hors_import',
          message: `${chemin}:${i + 1} écrit grilles_commission hors de ${ECRIVAINS_ADMIS[0]}`,
        });
      }
    });
  }
  if (fixture === null) {
    fautes.push({ famille: 'fixture_absente', message: `${FIXTURE} est introuvable` });
    return fautes;
  }
  try {
    const { Source, publication } = JSON.parse(fixture) as {
      Source?: unknown;
      publication?: unknown;
    };
    if (typeof Source !== 'string' || !PRODUCTEUR.test(Source)) {
      fautes.push({
        famille: 'fixture_non_derivee',
        message: `${FIXTURE} : l'en-tête Source ne nomme pas le producteur (${PRODUCTEUR.source})`,
      });
    }
    for (const f of verifierPublication(lirePublication(publication)).fautes) {
      fautes.push({ famille: 'fixture_non_derivee', message: `${FIXTURE} : ${f.message}` });
    }
  } catch (e) {
    fautes.push({
      famille: 'fixture_non_derivee',
      message: `${FIXTURE} illisible : ${(e as Error).message}`,
    });
  }
  return fautes;
}

function lireDepot(): { fichiers: { chemin: string; texte: string }[]; fixture: string | null } {
  const chemins = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((c) => PERIMETRE.test(c) && existsSync(c));
  return {
    fichiers: chemins.map((chemin) => ({ chemin, texte: readFileSync(chemin, 'utf8') })),
    fixture: existsSync(FIXTURE) ? readFileSync(FIXTURE, 'utf8') : null,
  };
}

/** Témoins : chacun ALTÈRE le dépôt réel d'un seul défaut, et DOIT rougir de sa famille. */
export function temoins(): {
  quoi: string;
  famille: Faute['famille'];
  depot: ReturnType<typeof lireDepot>;
}[] {
  const reel = lireDepot();
  const fixture = reel.fixture ?? '{}';
  const centime = (): string => {
    const f = JSON.parse(fixture) as {
      publication: { contenu: { commissions: { montantCents: number | null }[] } };
    };
    const forfait = f.publication.contenu.commissions.find((c) => c.montantCents !== null);
    if (forfait) forfait.montantCents = (forfait.montantCents ?? 0) + 1;
    return JSON.stringify(f);
  };
  return [
    {
      quoi: 'un second écrivain de la table, par le client',
      famille: 'ecrivain_hors_import',
      depot: {
        ...reel,
        fichiers: [
          ...reel.fichiers,
          {
            chemin: 'src/server/temoin.ts',
            texte: 'await prisma.grilleCommission.create({ data })',
          },
        ],
      },
    },
    {
      quoi: 'un second écrivain de la table, en SQL',
      famille: 'ecrivain_hors_import',
      depot: {
        ...reel,
        fichiers: [
          ...reel.fichiers,
          {
            chemin: 'prisma/seed/99-temoin.ts',
            texte: 'INSERT INTO "grilles_commission" VALUES (…)',
          },
        ],
      },
    },
    {
      quoi: 'un centime retapé dans la fixture',
      famille: 'fixture_non_derivee',
      depot: { ...reel, fixture: centime() },
    },
    {
      quoi: 'une fixture sans son producteur',
      famille: 'fixture_non_derivee',
      depot: {
        ...reel,
        fixture: JSON.stringify({ ...JSON.parse(fixture), Source: 'tapée à la main' }),
      },
    },
    { quoi: 'une fixture absente', famille: 'fixture_absente', depot: { ...reel, fixture: null } },
  ];
}

const APPELE_DIRECTEMENT = /gov-derivation\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    for (const t of temoins()) {
      const familles = fautesDeDerivation(t.depot.fichiers, t.depot.fixture).map((f) => f.famille);
      if (!familles.includes(t.famille)) {
        console.error(`❌ Le témoin « ${t.quoi} » n'a PAS fait rougir « ${t.famille} ».`);
        process.exit(1);
      }
    }
    // Contre-témoin : le dépôt réel, où l'import écrit la table et la fixture vient du producteur.
    const reel = lireDepot();
    const faux = fautesDeDerivation(reel.fichiers, reel.fixture);
    if (faux.length > 0) {
      console.error(`❌ Faux positif sur le dépôt réel : ${faux[0]!.message}`);
      process.exit(1);
    }
    console.log(
      `✅ gov:derivation — ${temoins().length} témoins rougissent, le dépôt réel reste vert — preuve faite.`
    );
    process.exit(0);
  }

  const { fichiers, fixture } = lireDepot();
  const fautes = fautesDeDerivation(fichiers, fixture);
  if (fautes.length > 0) {
    console.error(`❌ gov:derivation — ${fautes.length} faute(s) :`);
    for (const f of fautes) console.error(`   [${f.famille}] ${f.message}`);
    process.exit(1);
  }
  const lignes = verifierPublication(
    lirePublication((JSON.parse(fixture!) as { publication: unknown }).publication)
  );
  console.log(
    `✅ gov:derivation — ${fichiers.length} fichiers lus : grilles_commission n'a qu'un écrivain ` +
      `(${ECRIVAINS_ADMIS[0]}) ; la fixture du producteur rend ses ${lignes.lignesConfrontees} ` +
      `empreintes de ligne.`
  );
  process.exit(0);
}
