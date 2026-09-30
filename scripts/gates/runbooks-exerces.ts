/**
 * runbooks-exerces.ts — un runbook s'exerce en preview, pas sur le papier (QA-T13, REQ-QA-034).
 *
 * USAGE : pnpm runbooks:exerces          juge les runbooks exigés du dépôt
 *         pnpm runbooks:exerces:prove    un témoin par famille, un contre-témoin vert
 *
 * Chaque runbook exigé porte, sous un titre « Exécuté le », UNE ligne :
 *
 *   Exécuté le : AAAA-MM-JJ · environnement : preview · SHA : <7 à 40 hex> · corps : <12 hex> · résultat : <texte>
 *
 * `corps` est l'EMPREINTE du runbook sans ce bloc, prise au moment de l'exercice (`empreinteDuCorps`).
 * Un corps modifié depuis ne correspond plus : le runbook doit être ré-exercé. L'acceptation parle de
 * « date qui précède la dernière modification » ; comparer une date à l'historique git ne tient pas,
 * parce que NOTER l'exercice modifie lui-même le fichier. L'empreinte dit la même chose, sans
 * historique, et plus strictement : une virgule changée suffit.
 *
 * OÙ ELLE TOURNE (découpe arbitrée par -d7 sur délégation de Williams du 2026-09-30) : en nightly
 * tant qu'aucun runbook du socle n'a été exercé en preview — une garde rouge en porte A jusqu'au
 * premier exercice bloquerait toutes les PR —, en porte A dès le premier exercice réel. Les trois
 * runbooks du socle sont exercés AVANT la clôture de la phase 0.
 *
 * AMENDEMENT (7)-(8) DE QA-T13 (2026-09-30). Williams a décidé qu'il n'y aurait pas de serveur
 * d'aperçus : les runbooks s'exercent alors sur la PRODUCTION, strictement avant la première donnée
 * réelle (plan de repli, conditions de la lentille `securite`). La liste des environnements est FERMÉE
 * (`ENVIRONNEMENTS_ADMIS`), et la garde ne croit pas une étiquette : `production-avant-donnees` n'est
 * admis que si `MISE_EN_SERVICE` est posée et que l'exercice lui est STRICTEMENT antérieur. Date
 * absente ou illisible : refus (échec fermé).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export const RUNBOOKS_EXIGES = [
  { chemin: 'docs/runbooks/retour-arriere.md', titre: 'retour arrière' },
  { chemin: 'docs/runbooks/migration-echouee.md', titre: 'migration échouée' },
  { chemin: 'docs/runbooks/secret-desynchronise.md', titre: 'secret désynchronisé' },
] as const;

export const FAMILLES = [
  'runbook_absent',
  'bloc_absent',
  'bloc_vide',
  'bloc_illisible',
  'environnement_hors_liste',
  'mise_en_service_non_posee',
  'exerce_apres_mise_en_service',
  'corps_modifie_depuis_l_exercice',
] as const;
export type Faute = { famille: (typeof FAMILLES)[number]; message: string };

/** Les environnements où un exercice compte, et eux seuls (amendement (8) de QA-T13). */
export const ENVIRONNEMENTS_ADMIS = ['preview', 'production-avant-donnees'] as const;

/**
 * Le jour de la mise en service de Partners : la première donnée réelle. `null` tant que Williams ne
 * l'a pas fixée, et alors aucun exercice `production-avant-donnees` n'est admis.
 *
 * Elle ne sert jamais de sursis (lentille `securite`, 2026-09-30) :
 *   — le jour de la PREMIÈRE donnée réelle, si ce jour précède la date posée, elle est ramenée à ce
 *     jour : c'est un pas de la mise en service. La date ne fait que reculer vers le réel ;
 *   — un report à une date plus TARDIVE est une décision datée de Williams : `source` et `verifieLe`
 *     sont mis à jour, et une ligne est ajoutée à `docs/DECISIONS.md`.
 */
export const MISE_EN_SERVICE: {
  readonly valeur: string | null;
  readonly source: string;
  readonly verifieLe: string;
} = {
  // Date PRÉVUE et provisoire : à ramener au jour de la première donnée réelle (mise-en-service.md, temps 5).
  valeur: '2026-12-31',
  source: 'décision de Williams du 2026-09-30 (16h17) : date prévue de mise en service, provisoire',
  verifieLe: '2026-09-30',
};

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

const TITRE_DU_BLOC = /^## Exécuté le\s*$/m;
const LIGNE = /^Exécuté le : (.*)$/m;
const FORME =
  /^Exécuté le : (\d{4}-\d{2}-\d{2}) · environnement : (\S+) · SHA : ([0-9a-f]{7,40}) · corps : ([0-9a-f]{12}) · résultat : (.+\S)\s*$/m;

/** Le runbook sans son bloc d'exécution, fins de ligne normalisées. */
function corps(texte: string): string {
  const t = texte.replace(/\r\n/g, '\n');
  const i = t.search(TITRE_DU_BLOC);
  return (i < 0 ? t : t.slice(0, i)).trimEnd();
}

export function empreinteDuCorps(texte: string): string {
  return createHash('sha256').update(corps(texte), 'utf8').digest('hex').slice(0, 12);
}

export function blocDExecution(b: {
  date: string;
  environnement: string;
  sha: string;
  corps: string;
  resultat: string;
}): string {
  return `Exécuté le : ${b.date} · environnement : ${b.environnement} · SHA : ${b.sha} · corps : ${b.corps} · résultat : ${b.resultat}`;
}

export function juger(
  runbooks: readonly { chemin: string; texte: string | null }[],
  miseEnService: string | null = MISE_EN_SERVICE.valeur
): Faute[] {
  const fautes: Faute[] = [];
  for (const { chemin, texte } of runbooks) {
    if (texte === null) {
      fautes.push({ famille: 'runbook_absent', message: `${chemin} n'existe pas` });
      continue;
    }
    const t = texte.replace(/\r\n/g, '\n');
    const i = t.search(TITRE_DU_BLOC);
    const ligne = i < 0 ? null : LIGNE.exec(t.slice(i));
    if (!ligne) {
      fautes.push({ famille: 'bloc_absent', message: `${chemin} : aucun bloc « Exécuté le »` });
      continue;
    }
    if (/Exécuté le : —/.test(ligne[0])) {
      fautes.push({
        famille: 'bloc_vide',
        message: `${chemin} : bloc « Exécuté le » vide — jamais exercé`,
      });
      continue;
    }
    const m = FORME.exec(ligne[0]);
    if (!m) {
      fautes.push({
        famille: 'bloc_illisible',
        message: `${chemin} : le bloc n'a pas la forme attendue (date AAAA-MM-JJ, SHA, corps)`,
      });
      continue;
    }
    if (!(ENVIRONNEMENTS_ADMIS as readonly string[]).includes(m[2]!)) {
      fautes.push({
        famille: 'environnement_hors_liste',
        message: `${chemin} : exercé en « ${m[2]} », hors de la liste fermée (${ENVIRONNEMENTS_ADMIS.join(' | ')})`,
      });
      continue;
    }
    if (m[2] === 'production-avant-donnees') {
      if (miseEnService === null || !JOUR.test(miseEnService)) {
        fautes.push({
          famille: 'mise_en_service_non_posee',
          message: `${chemin} : exercé en production-avant-donnees, mais la date de mise en service n'est pas posée (MISE_EN_SERVICE) — rien ne prouve que l'exercice précède la première donnée réelle`,
        });
        continue;
      }
      if (m[1]! >= miseEnService) {
        fautes.push({
          famille: 'exerce_apres_mise_en_service',
          message: `${chemin} : exercé le ${m[1]}, pas avant la mise en service du ${miseEnService} — à ré-exercer`,
        });
        continue;
      }
    }
    if (m[4] !== empreinteDuCorps(t)) {
      fautes.push({
        famille: 'corps_modifie_depuis_l_exercice',
        message: `${chemin} : le corps a changé depuis l'exercice du ${m[1]} — à ré-exercer`,
      });
    }
  }
  return fautes;
}

function prouver(): number {
  const C = '# Runbook — témoin\n\n## Geste\n\n1. Faire.\n';
  const exerce = (c: string, env = 'preview') =>
    `${c}\n## Exécuté le\n\n${blocDExecution({ date: '2026-09-30', environnement: env, sha: 'abcdef1', corps: empreinteDuCorps(c), resultat: 'vert' })}\n`;
  const cas: [string, string | null, Faute['famille'] | null][] = [
    ['contre-témoin : exercé en preview, corps inchangé', exerce(C), null],
    ['runbook absent', null, 'runbook_absent'],
    ['sans bloc', C, 'bloc_absent'],
    [
      'bloc vidé',
      `${C}\n## Exécuté le\n\nExécuté le : — · environnement : — · SHA : — · résultat : —\n`,
      'bloc_vide',
    ],
    ['date illisible', exerce(C).replace('2026-09-30', '30/09/2026'), 'bloc_illisible'],
    [
      'exercé en production (hors liste fermée)',
      exerce(C, 'production'),
      'environnement_hors_liste',
    ],
    [
      'production-avant-donnees, date de mise en service absente',
      exerce(C, 'production-avant-donnees'),
      'mise_en_service_non_posee',
    ],
    [
      'production-avant-donnees, exercé le jour de la mise en service',
      exerce(C, 'production-avant-donnees'),
      'exerce_apres_mise_en_service',
    ],
    [
      'corps modifié sans nouvel exercice',
      exerce(C).replace('1. Faire.', '1. Faire autrement.'),
      'corps_modifie_depuis_l_exercice',
    ],
  ];
  // RM-11 : la date de mise en service est posée par chaque cas, jamais lue de la constante.
  const dateDuCas = (quoi: string): string | null =>
    quoi.includes('absente')
      ? null
      : quoi.includes('jour de la mise')
        ? '2026-09-30'
        : '2026-12-31';
  let echecs = 0;
  for (const [quoi, texte, attendue] of cas) {
    const f = juger([{ chemin: 'docs/runbooks/temoin.md', texte }], dateDuCas(quoi)).map(
      (x) => x.famille
    );
    const bon = attendue === null ? f.length === 0 : f.length === 1 && f[0] === attendue;
    console.log(`${bon ? '✅' : '❌'} ${quoi} → ${f.length ? f.join(', ') : 'vert'}`);
    if (!bon) echecs++;
  }
  if (echecs > 0) {
    console.error(`❌ runbooks:exerces --prove — ${echecs} témoin(s) en défaut`);
    return 1;
  }
  console.log(
    `✅ runbooks:exerces --prove — ${FAMILLES.length} familles vues rougir, 1 contre-témoin vert, ${cas.length} runbook(s) confronté(s).`
  );
  return 0;
}

function controler(): number {
  const lus = RUNBOOKS_EXIGES.map((r) => ({
    chemin: r.chemin,
    texte: existsSync(r.chemin) ? readFileSync(r.chemin, 'utf8') : null,
  }));
  const fautes = juger(lus);
  if (fautes.length > 0) {
    console.error(
      `❌ runbooks:exerces — ${fautes.length} runbook(s) non exercé(s) sur ${lus.length} :`
    );
    for (const f of fautes) console.error(`   [${f.famille}] ${f.message}`);
    return 1;
  }
  console.log(
    `✅ runbooks:exerces — ${lus.length} runbook(s) confronté(s), tous exercés (${ENVIRONNEMENTS_ADMIS.join(' | ')}), corps inchangés.`
  );
  return 0;
}

const APPELE_DIRECTEMENT = /runbooks-exerces\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  process.exitCode = process.argv.includes('--prove') ? prouver() : controler();
}
