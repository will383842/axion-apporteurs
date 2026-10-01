// @req REQ-QA-023
/**
 * QA-T57 — écarts C9 et C10 de la vérification de bout en bout : la sauvegarde ne se tait plus.
 *
 * CE QUE CE FICHIER GARDE (témoins à deux faces) :
 *   (2) une fois la sauvegarde ACTIVÉE (`PARTNERS_SAUVEGARDE_ACTIVEE=oui`), un secret manquant fait
 *       ÉCHOUER `rechiffrer`, `exercice` et `fraicheur`, même sous le planificateur, en le nommant —
 *       comme `clairs` le faisait déjà ; avant l'activation, ils sont SAUTÉS en vert (attente connue).
 *       Le script est lancé pour de vrai, sans aucun secret : il s'arrête avant tout réseau.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CYCLE = 'scripts/sauvegarde/cycle.ts';
const COMMANDES = ['rechiffrer', 'exercice', 'fraicheur', 'clairs'] as const;

/** Les secrets que lit le cycle : tous RETIRÉS de l'environnement du sous-processus. */
const SECRETS = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'PARTNERS_BACKUP_PASSPHRASE',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
];

function lancer(commande: string, activee: boolean): { code: number; sortie: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_EVENT_NAME: 'schedule' };
  for (const n of SECRETS) delete env[n];
  if (activee) env.PARTNERS_SAUVEGARDE_ACTIVEE = 'oui';
  else delete env.PARTNERS_SAUVEGARDE_ACTIVEE;
  const r = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), resolve(CYCLE), commande],
    { env, encoding: 'utf8' }
  );
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('REQ-QA-023 — sauvegarde ACTIVÉE : un secret manquant fait échouer le run (QA-T57, point 2)', () => {
  for (const c of COMMANDES) {
    it(`REQ-QA-023 — TÉMOIN : ${c}, activée, sans ses secrets, sous le planificateur, ÉCHOUE en les nommant`, () => {
      const r = lancer(c, true);
      expect(r.code, r.sortie).toBe(1);
      expect(r.sortie).toContain(`::error title=sauvegarde:${c}::`);
      expect(r.sortie).toContain('sauvegarde est ACTIVÉE');
      expect(r.sortie).toContain('R2_BUCKET');
    });

    it(`REQ-QA-023 — CONTRE-TÉMOIN : ${c}, non activée, sans ses secrets, est SAUTÉ en vert`, () => {
      const r = lancer(c, false);
      expect(r.code, r.sortie).toBe(0);
      expect(r.sortie).toContain(`::warning title=sauvegarde:${c}::`);
      expect(r.sortie).toContain('SAUTÉ');
    });
  }
});
