/**
 * gov-identifiants.ts — la garde des identifiants nus (GOV-003, REQ-GOV-003).
 *
 * USAGE : pnpm gov:identifiants           (échoue si un identifiant nu est cité)
 *         pnpm gov:identifiants --prove   (un témoin par famille, chacun vu rougir)
 *
 * LE PROBLÈME QU'ELLE TIENT. Les huit relecteurs ont désigné les décisions par des étiquettes
 * locales — « conforme à D3 », « arbitrage C12 », « selon A12 ». Ces étiquettes ne veulent rien
 * dire hors du document qui les a écrites : deux relecteurs ont utilisé `D3` pour deux décisions
 * différentes, et `HYP-W6` cohabitait avec `HYP-W6-BIS`. Un identifiant nu ne résout pas, ne se
 * date pas, et ne dit pas qui a tranché.
 *
 * LA RÈGLE. Un identifiant de décision se cite sous sa forme QUALIFIÉE — celle qui figure au
 * registre `docs/DECISIONS.md` : `HYP-*`, `DEC-*`, `W<n>`, `EXT-*`. Une étiquette nue de la forme
 * lettre + un ou deux chiffres (`A12`, `B9`, `C12`, `D3`, `R5`) est refusée.
 *
 * CE QU'ELLE NE FAIT PAS. Elle n'invente pas de correspondance. Un identifiant nu se corrige en
 * le remplaçant par son identifiant canonique, que la §0 du registre résout — pas en l'exemptant.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/** Un identifiant nu : une lettre de relecteur suivie d'un ou deux chiffres. */
const NU = /(?<![A-Za-z0-9_./:-])([ABCDR]\d{1,2})(?![A-Za-z0-9_.-])/g;

/**
 * DEUX ESPACES DE NOMS SE RESSEMBLENT, ET L'EXIGENCE LES CONFONDAIT.
 * `A01`…`A15` (et `A40`, la taille de la flotte) sont les codes de POSTE des agents — un espace
 * de noms déclaré, que `tasks.schema.json` impose sous la forme `^A[0-9]{2}$`. `D3`, `C12`, `D11`
 * sont des étiquettes de relecteur, qui ne résolvent nulle part. La regex de REQ-GOV-003
 * (`[ABCDR]\d{1,2}`) attrapait les deux : appliquée telle quelle, elle exigeait de renommer
 * les quinze postes.
 * La ligne se trace sur le ZÉRO DE TÊTE : `A` suivi de DEUX chiffres est un poste ; tout le reste
 * — y compris `A5` ou `A2`, qui désignaient des postes sans respecter le schéma — est nu.
 */
function estCodeDePoste(jeton: string): boolean {
  return /^A\d{2}$/.test(jeton);
}

/**
 * Ce qui ressemble à un identifiant nu sans en être un. Chaque exemption est une locution
 * ENTIÈRE, pas la seule étiquette : exempter « R2 » partout rendrait la garde aveugle à
 * « conforme à R2 », qui est exactement ce qu'elle cherche.
 */
/**
 * CITER N'EST PAS SE SERVIR. Les documents qui EXPLIQUENT la règle doivent pouvoir écrire son
 * contre-exemple : `gardien-spec.md`, `REGLES-MAISON.md` et `gates.json` citent tous
 * « conforme à D3 » comme illustration de ce qui est refusé. La garde rougissait sur cinq
 * occurrences qui étaient sa propre documentation.
 * Un identifiant entre guillemets — français « … », doubles " … " ou simples ' … ' — est une
 * CITATION. Hors guillemets, c'est une référence, et elle doit résoudre.
 */
const CITATIONS = [/«[^»]{0,120}»/g, /"[^"]{0,120}"/g, /'[^']{0,120}'/g];

const LOCUTIONS_LEGITIMES = [
  /\bR2\b(?=\s*(?:de\s+Cloudflare|Cloudflare|,\s*préfixe|\s*bucket))/gi, // le stockage objet
  /\bCloudflare\s+R2\b/gi,
  /\bpréfixe\s+`?partners\/`?\b/gi,
  /\bB2B\b/gi,
  /\bD8222\b/g, // art. D.8222-5 — trois chiffres, hors motif, mais on le neutralise par sûreté
];

const FICHIERS = /\.(ts|tsx|js|jsx|md|json|yml|yaml)$/;
/** Le registre a le droit de NOMMER les identifiants d'origine : c'est son travail de les résoudre. */
const EXEMPTS = [
  /^docs\/DECISIONS\.md$/,
  /^scripts\/gates\/gov-identifiants\.ts$/,
  /^docs\/REQUIREMENTS(-ANNEXE-FUSIONS)?\.md$/,
  /^docs\/requirements\.json$/,
  /^docs\/TASKS\.md$/,
  /^docs\/tasks\.json$/,
  /^pnpm-lock\.yaml$/,
];

type Faute = { famille: string; message: string };

function neutraliser(ligne: string): string {
  const sansCitations = CITATIONS.reduce((s, r) => s.replace(r, (m) => '·'.repeat(m.length)), ligne);
  return LOCUTIONS_LEGITIMES.reduce((s, r) => s.replace(r, (m) => '·'.repeat(m.length)), sansCitations);
}

function fautesDeLigne(ligne: string, fichier: string, i: number): Faute[] {
  const out: Faute[] = [];
  const propre = neutraliser(ligne);
  NU.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NU.exec(propre)) !== null) {
    if (estCodeDePoste(m[1]!)) continue;
    out.push({
      famille: 'identifiant_nu',
      message:
        `${fichier}:${i + 1} — identifiant nu « ${m[1]} ». Cite la forme qualifiée du registre ` +
        `(\`HYP-*\`, \`DEC-*\`, \`W<n>\`) : une étiquette de relecteur ne résout pas, ne se date pas, ` +
        `et n'a pas de propriétaire. La §0 de docs/DECISIONS.md donne la correspondance.`,
    });
  }
  return out;
}

function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function analyser(fichiers: string[]): Faute[] {
  const fautes: Faute[] = [];
  for (const f of fichiers) {
    if (EXEMPTS.some((r) => r.test(f))) continue;
    if (!FICHIERS.test(f) || !existsSync(f)) continue;
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((ligne, i) => fautes.push(...fautesDeLigne(ligne, f, i)));
  }
  return fautes;
}

if (process.argv.includes('--prove')) {
  const TEMOINS = [
    `// conforme à D3, arbitrage validé`,
    `la decision D11 supprime la valeur`, // hors guillemets : une reference qui ne resout pas
    `> selon A5, le suppléant est A2`, // postes mal ecrits : le schema exige deux chiffres
  ];
  const CONTRE_TEMOINS = [
    `jamais « conforme à D3 » — citer le contre-exemple est permis`,
    `fixtureRouge : citer 'conforme a D3' dans un commentaire`,
    `le poste A02 est troisième relecteur bloquant`,
    `une flotte de A40 agents`,
    `sauvegardes R2 de Cloudflare, préfixe \`partners/\``,
    `l'offre s'adresse au B2B`,
    `art. D.8222-5 du code du travail`,
    `la décision HYP-W6-BIS s'applique`,
    `W13 a tranché la publication`,
    `DEC-INT-001 : instance dédiée`,
  ];

  for (const [i, t] of TEMOINS.entries()) {
    if (fautesDeLigne(t, 'témoin', i).length === 0) {
      console.error(`❌ Le témoin « ${t} » n'a PAS fait rougir la garde.`);
      process.exit(1);
    }
  }
  for (const [i, c] of CONTRE_TEMOINS.entries()) {
    const f = fautesDeLigne(c, 'contre-témoin', i);
    if (f.length > 0) {
      console.error(`❌ Faux positif : « ${c} » a rougi. La garde est trop large.\n   ${f[0]!.message}`);
      process.exit(1);
    }
  }
  console.log(`✅ ${TEMOINS.length} témoins rougissent, ${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`);
  process.exit(0);
}

const fautes = analyser(fichiersSuivis());
if (fautes.length === 0) {
  console.log('✅ gov:identifiants — aucun identifiant nu dans les fichiers suivis.');
  process.exit(0);
}
console.error(`❌ gov:identifiants — ${fautes.length} identifiant(s) nu(s) (REQ-GOV-003) :\n`);
fautes.slice(0, 25).forEach((f) => console.error('   ' + f.message));
if (fautes.length > 25) console.error(`   … et ${fautes.length - 25} autre(s).`);
process.exit(1);
