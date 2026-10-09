/**
 * jur-lexique-social.ts — aucun terme ni aucune rubrique du DROIT SOCIAL dans ce qu'un apporteur
 * peut lire (JUR-T26, REQ-JUR-037 étendue le 2026-09-03). Registre : `jur:lexique-social`.
 *
 * USAGE : pnpm jur:lexique-social          juge le dépôt ; sort 1 sur faute, en la nommant
 *         pnpm jur:lexique-social:prove    un témoin par famille, des contre-témoins verts
 *
 * POURQUOI UNE GARDE DE PLUS QUE LA GATE LEXICALE. `gov:lexique` refuse déjà le vocabulaire social
 * dans la portée apporteur, mais elle laisse passer la NÉGATION (« aucun objectif » est la phrase
 * qui protège). Pour un document remis, c'est l'inverse : un relevé qui écrit « ceci n'est pas un
 * bulletin » EST la pièce qu'un faisceau d'indices retiendrait — le mot seul fait le document. Et un
 * gabarit peut reprendre la FORME d'un bulletin de paie (employeur, matricule, cotisations) sans un
 * seul mot du lexique. Cette garde tient les deux, là où la gate lexicale ne regarde pas :
 *   — le PÉRIMÈTRE : la portée « apporteur » de la gate lexicale (DÉRIVÉE, jamais recopiée), plus
 *     les gabarits des documents remis, `src/server/pdf/` (autofacture, relevé, récapitulatif) ;
 *   — `terme_social` : une forme de la famille `droit_social` de la SSOT
 *     (`src/domain/lexique/lexique-interdit.ts`), ABSOLUE — ni négation ni citation n'exemptent ;
 *   — `rubriques_de_paie` : au moins `SEUIL_DE_RUBRIQUES` rubriques distinctes d'un bulletin de paie
 *     dans un même fichier ;
 * chacune vue rougir sur son témoin par `--prove`. Le nom à écrire est celui de la SSOT :
 * « relevé de commissions », « autofacture », « récapitulatif annuel des commissions versées ».
 *
 * LIMITES DÉCLARÉES. Elle lit le TEXTE des fichiers suivis : un PDF binaire, une image, un texte
 * assemblé à l'exécution lui échappent. Une seule rubrique isolée ne la fait pas rougir — c'est la
 * répétition de la forme qui fait le bulletin, et un mot isolé est l'affaire de la gate lexicale.
 */

import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { restreindreALaPr } from './fichiers-de-la-pr';
import { LEXIQUE_INTERDIT, TERMES_CANONIQUES } from '../../src/domain/lexique/lexique-interdit';
import { motifDeLaForme } from './lexique-apporteurs';
import { PERIMETRE_APPORTEUR } from './jur-revue-apporteur-facing';

export const ID_REGISTRE = 'jur:lexique-social';

export const FAMILLES = ['terme_social', 'rubriques_de_paie'] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}
export interface FichierVu {
  readonly chemin: string;
  readonly source: string;
}

/** Les gabarits des documents remis à l'apporteur (autofacture, relevé, récapitulatif annuel). */
export const DOCUMENTS_REMIS: readonly RegExp[] = [/^src\/server\/pdf\/.+\.(tsx?|html|md)$/];

const estDansLePerimetre = (chemin: string): boolean =>
  [...PERIMETRE_APPORTEUR, ...DOCUMENTS_REMIS].some((r) => r.test(chemin));

/** Les formes de la famille `droit_social`, importées de la SSOT — jamais retapées (RM-01). */
const FORMES_SOCIALES: readonly string[] =
  LEXIQUE_INTERDIT.find((f) => f.nom === 'droit_social')?.formes ?? [];

/** Les rubriques d'un bulletin de paie : ce qui en fait la FORME, sans être au lexique. */
const RUBRIQUES_DE_PAIE: readonly string[] = [
  'employeur',
  'salarié',
  'matricule',
  'cotisations',
  'salaire de base',
  'net imposable',
  'heures supplémentaires',
  'période de paie',
  'convention collective',
  'emploi occupé',
  'taux horaire',
  'coefficient',
];
/** Deux rubriques peuvent se croiser par hasard ; trois font une mise en page. */
const SEUIL_DE_RUBRIQUES = 3;

export interface Jugement {
  fautes: Faute[];
  fichiers: number;
}

/** Le jugement : pur, les fichiers sont injectés. */
export function jugerLesDocuments(fichiers: readonly FichierVu[]): Jugement {
  const j: Jugement = { fautes: [], fichiers: 0 };
  for (const f of fichiers) {
    if (!estDansLePerimetre(f.chemin)) continue;
    j.fichiers += 1;
    f.source.split('\n').forEach((ligne, i) => {
      for (const forme of FORMES_SOCIALES) {
        for (const m of ligne.matchAll(motifDeLaForme(forme))) {
          j.fautes.push({
            famille: 'terme_social',
            message:
              `${f.chemin}:${i + 1} — « ${m[1] ?? forme} » : un terme du droit social, ABSOLU dans ` +
              `ce qu'un apporteur lit (ni la négation ni la citation ne l'exemptent). Les noms à ` +
              `écrire : ${Object.values(TERMES_CANONIQUES).join(', ')} (REQ-JUR-037).`,
          });
        }
      }
    });
    const vues = RUBRIQUES_DE_PAIE.filter((r) => motifDeLaForme(r).test(f.source));
    if (vues.length >= SEUIL_DE_RUBRIQUES) {
      j.fautes.push({
        famille: 'rubriques_de_paie',
        message:
          `${f.chemin} — ${vues.length} rubriques d'un bulletin de paie (${vues.join(', ')}) : le ` +
          `document emprunte la mise en page d'un document social (REQ-JUR-037).`,
      });
    }
  }
  return j;
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────────

const DOCUMENT = (source: string): FichierVu => ({ chemin: 'src/server/pdf/releve.tsx', source });

const TEMOINS: { famille: Famille; quoi: string; fichiers: FichierVu[] }[] = [
  {
    famille: 'terme_social',
    quoi: 'la fixtureRouge du registre : un gabarit intitulé « bulletin de commission »',
    fichiers: [DOCUMENT('<h1>Bulletin de commission</h1>')],
  },
  {
    famille: 'terme_social',
    quoi: 'un terme social NIÉ dans un document remis',
    fichiers: [DOCUMENT('<p>Ce relevé n’est pas une fiche de paie.</p>')],
  },
  {
    famille: 'rubriques_de_paie',
    quoi: 'un gabarit à la mise en page d’un bulletin, sans un mot du lexique',
    fichiers: [DOCUMENT('<dt>Employeur</dt><dt>Matricule</dt><dt>Cotisations</dt>')],
  },
];
const CONTRE_TEMOINS: { quoi: string; fichiers: FichierVu[] }[] = [
  {
    quoi: 'le relevé de commissions, sous ses noms canoniques',
    fichiers: [DOCUMENT(`<h1>${TERMES_CANONIQUES.documentMensuel}</h1><p>Montant HT</p>`)],
  },
  {
    quoi: 'un calcul du serveur, hors de ce qu’un apporteur lit',
    fichiers: [{ chemin: 'src/server/argent/calcul.ts', source: '// salaire, prime, brut' }],
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = FORMES_SOCIALES.length > 0;
  if (!ok) lignes.push('❌ la famille `droit_social` est absente de la SSOT : rien ne se mesure');
  for (const t of TEMOINS) {
    const rougit = jugerLesDocuments(t.fichiers).fautes.some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = jugerLesDocuments(c.fichiers).fautes;
    ok &&= fautes.length === 0;
    lignes.push(`${fautes.length === 0 ? '🟢' : '❌ ROUGIT'} contre-témoin : ${c.quoi}`);
  }
  const orphelines = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
  ok &&= orphelines.length === 0;
  for (const f of orphelines) lignes.push(`❌ famille sans témoin : ${f}`);
  lignes.unshift(
    ok
      ? `✅ ${ID_REGISTRE} — ${FAMILLES.length} familles rougissent sur leurs témoins, ` +
          `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
      : `❌ ${ID_REGISTRE} --prove — la preuve échoue :`
  );
  return { code: ok ? 0 : 1, lignes };
}

function juger(): { code: 0 | 1; lignes: string[] } {
  // GOV-160 : sur une PR, seuls les fichiers de la PR sont jugés.
  const chemins = restreindreALaPr(fichiersSuivisOuRefus(ID_REGISTRE).filter(estDansLePerimetre));
  const j = jugerLesDocuments(
    chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }))
  );
  const documents = chemins.filter((c) => DOCUMENTS_REMIS.some((r) => r.test(c))).length;
  const compte =
    `${j.fichiers} fichier(s) lu(s), dont ${documents} gabarit(s) de document remis sous src/server/pdf/, ` +
    `${FORMES_SOCIALES.length} formes du droit social et ${RUBRIQUES_DE_PAIE.length} rubriques de paie appliquées`;
  if (j.fautes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${ID_REGISTRE} — ${j.fautes.length} faute(s) ; ${compte} :`,
        ...j.fautes.map((f) => `   [${f.famille}] ${f.message}`),
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ ${ID_REGISTRE} — ${compte} : aucun terme ni aucune rubrique d'un document social.`,
      `   Que la garde MESURE se prouve par « pnpm ${ID_REGISTRE}:prove », pas par ce zéro.`,
    ],
  };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]jur-lexique-social(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
