/**
 * Le journal applicatif — QA-T08 (REQ-QA-024). ÉTAT ROUGE : pino nu, aucun caviardage.
 */
import pino from 'pino';

export const SEGMENTS_SECRETS: readonly string[] = [
  'jeton',
  'token',
  'secret',
  'password',
  'motdepasse',
  'authorization',
  'cookie',
  'signature',
];

export type Donnees = Record<string, unknown>;

export interface Journal {
  error(msg: string, donnees?: Donnees): void;
}

export function creerJournal(): Journal {
  const p = pino();
  return {
    error: (msg, donnees) => (donnees === undefined ? p.error(msg) : p.error(donnees, msg)),
  };
}
