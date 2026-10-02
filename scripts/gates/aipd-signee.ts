/**
 * aipd-signee.ts — AUCUN DÉPÔT RÉEL TANT QUE L'AIPD N'EST PAS SIGNÉE (JUR-T35, REQ-CPL-009).
 *
 * USAGE : tsx scripts/gates/aipd-signee.ts   (forge, job `deployer`, avant le déploiement)
 *         0 admise · 1 refusée, la condition et le geste nommés
 *
 * DEUX SOURCES, QUI DOIVENT CONCORDER (arbitrage de la coordination à la revendication, option 1).
 *   — le texte de `docs/rgpd/aipd.md`, section « Signature » : « État : signée le AAAA-MM-JJ par
 *     <signataire> ». Une demande de fusion PEUT l'écrire ;
 *   — la variable `AIPD_SIGNEE_LE` de l'environnement GitHub `production` (règle « main seulement »),
 *     que seul Williams pose, le jour où il signe. Une demande de fusion ne PEUT PAS la poser.
 * Le point d'application ne dépend donc pas d'un texte que l'auteur d'une demande de fusion peut
 * modifier seul : sans le geste de Williams, le texte « signée » ne suffit pas.
 *
 * ACTIVE À PARTIR DE LA MISE EN SERVICE (`MISE_EN_SERVICE`, `scripts/gates/runbooks-exerces.ts`) :
 * avant ce jour, les déploiements de préparation passent. Date absente : ACTIVE (échec fermé).
 *
 * CE QUI N'EST JAMAIS IMPRIMÉ : une date ou une valeur lue. Le message nomme la condition
 * (REQ-CPL-009) et le geste à faire, rien d'autre.
 */
import { readFileSync } from 'node:fs';
import { MISE_EN_SERVICE } from './runbooks-exerces';

export const CHEMIN_AIPD = 'docs/rgpd/aipd.md';
export const VARIABLE = 'AIPD_SIGNEE_LE';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const LIGNE_SIGNEE = /^État : signée le (\d{4}-\d{2}-\d{2}) par (\S.*\S|\S)\s*$/m;

export const FAMILLES = [
  'aipd_non_signee',
  'variable_absente',
  'variable_illisible',
  'dates_discordantes',
] as const;
export type Famille = (typeof FAMILLES)[number];

export type Verdict = { ok: true } | { ok: false; famille: Famille; message: string };

/** La signature lue sur la ligne « État » de l'AIPD, ou `null` si elle n'y est pas dans sa forme. */
export function signatureDe(texte: string): { date: string; signataire: string } | null {
  const m = LIGNE_SIGNEE.exec(texte.replace(/\r\n/g, '\n'));
  return m ? { date: m[1]!, signataire: m[2]! } : null;
}

const GESTE_SIGNATURE = `signer l'AIPD (ligne « État » de ${CHEMIN_AIPD}, forme « signée le AAAA-MM-JJ par <signataire> »)`;
const GESTE_VARIABLE = `poser ${VARIABLE} dans l'environnement GitHub production, à la date de la signature (geste de Williams)`;

export function juger(e: {
  texte: string;
  variable: string | undefined;
  jour: string;
  miseEnService: string | null;
}): Verdict {
  if (e.miseEnService !== null && JOUR.test(e.miseEnService) && e.jour < e.miseEnService) {
    return { ok: true };
  }
  const refus = (famille: Famille, quoi: string, geste: string): Verdict => ({
    ok: false,
    famille,
    message: `REQ-CPL-009 : aucun dépôt réel sans l'AIPD signée — ${quoi}. Geste : ${geste}.`,
  });
  const signature = signatureDe(e.texte);
  if (signature === null) {
    return refus('aipd_non_signee', `${CHEMIN_AIPD} n'est pas signée`, GESTE_SIGNATURE);
  }
  if (e.variable === undefined || e.variable === '') {
    return refus('variable_absente', `${VARIABLE} n'est pas posée`, GESTE_VARIABLE);
  }
  if (!JOUR.test(e.variable)) {
    return refus('variable_illisible', `${VARIABLE} n'a pas la forme AAAA-MM-JJ`, GESTE_VARIABLE);
  }
  if (e.variable !== signature.date) {
    return refus(
      'dates_discordantes',
      `${VARIABLE} et la date signée de ${CHEMIN_AIPD} diffèrent`,
      `vérifier la signature et ${VARIABLE} : les deux disent le même jour`
    );
  }
  return { ok: true };
}

const APPELE_DIRECTEMENT = /aipd-signee\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const v = juger({
    texte: readFileSync(CHEMIN_AIPD, 'utf8'),
    variable: process.env[VARIABLE],
    jour: new Date().toISOString().slice(0, 10),
    miseEnService: MISE_EN_SERVICE.valeur,
  });
  if (v.ok) {
    console.log('✅ aipd-signee : la mise en service des dépôts réels est admise (REQ-CPL-009).');
  } else {
    console.error(`::error title=aipd-signee::${v.message}`);
    console.error(`❌ aipd-signee [${v.famille}] : ${v.message}`);
    process.exitCode = 1;
  }
}
