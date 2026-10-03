/**
 * artefact-empreinte.ts — GOV-142 : l'empreinte SHA-256 d'un artefact passé d'un job à l'autre.
 *
 *   pnpm ci:artefact:publier   (le PRODUCTEUR) : lit `ARTEFACT`, écrit `empreinte=<hex>` dans
 *                              `GITHUB_OUTPUT`, que le job expose en `outputs` — jamais `GITHUB_ENV`.
 *   pnpm ci:artefact:verifier  (le CONSOMMATEUR, avant tout usage) : lit `ARTEFACT` et
 *                              `EMPREINTE_ATTENDUE` (relue par `needs.<producteur>.outputs`). Une
 *                              empreinte absente, vide, mal formée ou différente fait ÉCHOUER l'étape.
 *
 * Les deux modes sont DEUX scripts du paquet : la commande de l'étape reste fermée (REQ-GOV-018).
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const FORME = /^[0-9a-f]{64}$/;

/** PURE. L'empreinte d'un contenu. */
export function empreinte(contenu: Buffer): string {
  return createHash('sha256').update(contenu).digest('hex');
}

/** PURE. Le verdict du consommateur : `null` si conforme, sinon la raison du refus. */
export function jugerLEmpreinte(attendue: string | undefined, calculee: string): string | null {
  if (attendue === undefined || !FORME.test(attendue)) {
    return `empreinte attendue absente ou mal formée (« ${attendue ?? ''} »)`;
  }
  return attendue === calculee
    ? null
    : `empreinte différente : attendue ${attendue}, lue ${calculee}`;
}

function lireLArtefact(): Buffer | null {
  const chemin = process.env.ARTEFACT;
  if (chemin === undefined || chemin === '' || !existsSync(chemin)) {
    console.error(`::error::artefact introuvable (ARTEFACT=« ${chemin ?? ''} »)`);
    return null;
  }
  return readFileSync(chemin);
}

function publier(): number {
  const contenu = lireLArtefact();
  const sortie = process.env.GITHUB_OUTPUT;
  if (contenu === null) return 1;
  if (sortie === undefined || sortie === '') {
    console.error('::error::GITHUB_OUTPUT absent : l’empreinte ne peut pas sortir du job');
    return 1;
  }
  const e = empreinte(contenu);
  appendFileSync(sortie, `empreinte=${e}\n`);
  console.log(`✅ empreinte de ${process.env.ARTEFACT} : ${e}`);
  return 0;
}

function verifier(): number {
  const contenu = lireLArtefact();
  if (contenu === null) return 1;
  const refus = jugerLEmpreinte(process.env.EMPREINTE_ATTENDUE, empreinte(contenu));
  if (refus !== null) {
    console.error(`::error::${process.env.ARTEFACT} : ${refus}`);
    return 1;
  }
  console.log(`✅ ${process.env.ARTEFACT} : empreinte conforme`);
  return 0;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/ci/artefact-empreinte.ts')) {
  const mode = process.argv[2];
  process.exit(mode === '--publier' ? publier() : mode === '--verifier' ? verifier() : 1);
}
