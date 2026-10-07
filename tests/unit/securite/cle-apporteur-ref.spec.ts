// @req REQ-SEC-028
/**
 * SEC-63 — la clé `APPORTEUR_REF_KEY` est DÉCLARÉE dans `src/lib/env.ts`, jugée au démarrage comme
 * toute clé de REQ-SEC-028, provisionnée avant d'être exigée, documentée, et lue par le juge — plus
 * jamais par `process.env` directement — dans le module qui dérive la référence opaque d'un porteur
 * (conditions de la sécurité, #561, 5981077380 ; pré-relecture, rattrapage 111).
 *
 * Les clés de ce test sont FACTICES, fabriquées à l'exécution : aucune valeur réelle n'y figure.
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  lireEnvironnement,
  NOMS_DES_SECRETS,
  NOMS_EN_ROTATION,
  type CleDesReferences,
} from '../../../src/lib/env';
import { cleDesReferences } from '../../../src/server/integrations/axionia/attributions-dto';

const NOM = 'APPORTEUR_REF_KEY';
const lire = (chemin: string) => readFileSync(chemin, 'utf8');

/** Un jeu de secrets valide et distinct, fabriqué à l'exécution, dérivé des noms du schéma. */
function environnement(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const n of NOMS_DES_SECRETS) env[n] = `temoin-${randomBytes(16).toString('hex')}`;
  env.PII_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  return env;
}
const refusDe = (env: Record<string, string | undefined>) => {
  const lu = lireEnvironnement(env);
  return lu.ok ? [] : lu.refus;
};

describe('REQ-SEC-028 — APPORTEUR_REF_KEY : une clé à elle, jugée au démarrage', () => {
  it('REQ-SEC-028 : TÉMOIN — la clé est un secret toujours exigé, hors de la rotation courante', () => {
    expect(NOMS_DES_SECRETS).toContain(NOM);
    expect(NOMS_EN_ROTATION as readonly string[]).not.toContain(NOM);
  });

  it('REQ-SEC-028 : TÉMOIN — le démarrage REFUSE une clé absente, ou vide', () => {
    const env = environnement();
    expect(refusDe({ ...env, [NOM]: undefined })).toEqual([{ variable: NOM, motif: 'absente' }]);
    expect(refusDe({ ...env, [NOM]: '' })).toEqual([{ variable: NOM, motif: 'absente' }]);
  });

  it('REQ-SEC-028 : TÉMOIN — le démarrage REFUSE une clé de moins de 32 octets', () => {
    expect(refusDe({ ...environnement(), [NOM]: 'x'.repeat(31) })).toEqual([
      { variable: NOM, motif: 'trop_courte' },
    ]);
  });

  it('REQ-SEC-028 : TÉMOIN — le démarrage REFUSE une clé identique à n’importe quelle autre clé', () => {
    const env = environnement();
    for (const autre of NOMS_DES_SECRETS.filter((n) => n !== NOM && n !== 'PII_ENCRYPTION_KEY')) {
      const refus = refusDe({ ...env, [NOM]: env[autre] });
      expect(refus.map((r) => r.motif)).toContain('egale_a');
      expect(refus.flatMap((r) => [r.variable, ...(r.avec ?? [])])).toEqual(
        expect.arrayContaining([NOM, autre])
      );
    }
  });

  it('REQ-SEC-028 : une clé valide et distincte passe, et le juge la rend sous son type dédié', () => {
    const env = environnement();
    expect(refusDe(env)).toEqual([]);
    const cle: CleDesReferences = cleDesReferences(env);
    expect(cle).toEqual({ [NOM]: env[NOM] });
  });

  it('REQ-SEC-028 : TÉMOIN — le module de la référence lit la clé par le JUGE, et nomme son refus sans aucune valeur', () => {
    const env = environnement();
    const secret = env[NOM]!;
    expect(() => cleDesReferences({ ...env, [NOM]: undefined })).toThrow(
      /^cle_reference : .*APPORTEUR_REF_KEY : absente/
    );
    let message = '';
    try {
      cleDesReferences({ ...env, [NOM]: env.PII_HASH_KEY });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/egale_a/);
    expect(message).not.toContain(secret);
    expect(message).not.toContain(env.PII_HASH_KEY!);
  });
});

describe('REQ-SEC-028 — APPORTEUR_REF_KEY : provisionnée, documentée, jamais lue à part', () => {
  it('REQ-SEC-028 : TÉMOIN statique — attributions-dto.ts ne lit plus process.env pour la clé, et n’importe pas le journal applicatif', () => {
    const source = lire('src/server/integrations/axionia/attributions-dto.ts');
    expect(source).not.toMatch(/process\.env\[\s*VARIABLE_CLE_REFERENCE\s*\]/);
    expect(source).not.toMatch(/process\.env\.APPORTEUR_REF_KEY/);
    expect(source).toContain('cleDesReferences(process.env)');
    expect(source).not.toMatch(/from '[^']*evenement\/journal'/);
    expect(source).not.toMatch(/from '[^']*lib\/journal'/);
  });

  it('REQ-SEC-028 : TÉMOIN — la clé est provisionnée par le workflow, dans l’exemple d’environnement et dans la documentation', () => {
    expect(lire('.github/workflows/coolify-provisionner.yml')).toContain(
      `${NOM}: \${{ secrets.${NOM} }}`
    );
    expect(lire('.env.example')).toMatch(new RegExp(`^${NOM}=$`, 'm'));
    expect(lire('docs/env.md')).toContain(`| \`${NOM}\` | requise |`);
    expect(lire('docs/adr/0013-secrets-et-donnees-personnelles-chiffrees.md')).toContain(
      'clé de pseudonymisation stable, hors rotation'
    );
    expect(lire('docs/runbooks/secret-desynchronise.md')).toContain(NOM);
    expect(lire('docs/runbooks/mise-en-service.md')).toContain(NOM);
  });
});
