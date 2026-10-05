// @req REQ-JUR-068
/**
 * JUR-T65 — les versions suivantes de la page « Vos données dans la console » sont datées du
 * déploiement vérifié de la page, et non de la fusion (juriste, #745, 5986650886 ; témoin,
 * 5986737725).
 *
 * La version portée par une invitation se DÉRIVE de son instant d'envoi contre
 * `VERSIONS_PUBLIEES_CONSOLE`. Si une entrée était datée de la FUSION, une invitation
 * envoyée avant que le déploiement ne serve la nouvelle page serait rattachée à une version que
 * personne ne pouvait encore lire. Ce fichier garde : la version rattachée entre la fusion et le
 * déploiement vérifié est la PRÉCÉDENTE ; toute entrée nouvelle porte son déploiement vérifié (le
 * sha servi, constaté par `deploy:verify`) et la date de celui-ci ; la première est la seule datée
 * de la fusion, et elle ne change pas ; la liste du dépôt est sans faute.
 */
import { describe, it, expect } from 'vitest';
import {
  VERSIONS_PUBLIEES_CONSOLE,
  VERSION_DATEE_DE_LA_FUSION,
  fautesDeDatation,
  versionEnVigueurConsole,
  type VersionPubliee,
} from '../../../src/domain/rgpd/politique-console';

const PREMIERE = VERSIONS_PUBLIEES_CONSOLE[0]!;
const ms = (iso: string) => new Date(iso);

const FUSION = '2026-11-01T09:00:00.000Z';
const DEPLOIEMENT = '2026-11-01T09:52:17.000Z';
const SHA = '0123abcd4567ef89';

/** Une version nouvelle, datée comme JUR-T65 l'exige : du déploiement vérifié, sha servi nommé. */
const nouvelle = (surcharge: Partial<VersionPubliee> = {}): VersionPubliee => ({
  version: 'b'.repeat(32),
  publieeLe: DEPLOIEMENT,
  source: `déploiement vérifié de ${SHA.slice(0, 7)} (témoin)`,
  deploiement: { shaServi: SHA, fusionneeLe: FUSION },
  ...surcharge,
});

describe('REQ-JUR-068 — une version nouvelle de la page « Vos données dans la console » est datée de son déploiement vérifié, non de la fusion', () => {
  it('REQ-JUR-068 : TÉMOIN DE LA JURISTE — une invitation envoyée entre la fusion et le déploiement vérifié est rattachée à la version alors servie, la précédente', () => {
    const liste = [PREMIERE, nouvelle()];
    expect(fautesDeDatation(liste)).toEqual([]);
    // La fusion est faite, la nouvelle page n'est pas encore servie : la précédente est en vigueur.
    expect(versionEnVigueurConsole(ms(FUSION), liste)).toBe(PREMIERE.version);
    expect(versionEnVigueurConsole(ms('2026-11-01T09:52:16.999Z'), liste)).toBe(PREMIERE.version);
    // Au déploiement vérifié, borne incluse, la nouvelle version est en vigueur.
    expect(versionEnVigueurConsole(ms(DEPLOIEMENT), liste)).toBe('b'.repeat(32));
  });

  it('REQ-JUR-068 : TÉMOIN — une entrée nouvelle sans déploiement vérifié (datée de la fusion) est une faute nommée', () => {
    const { deploiement: _retire, ...sansDeploiement } = nouvelle();
    void _retire;
    expect(fautesDeDatation([PREMIERE, { ...sansDeploiement, publieeLe: FUSION }])).toEqual([
      { version: 'b'.repeat(32), faute: 'datee_de_la_fusion' },
    ]);
  });

  it('REQ-JUR-068 : TÉMOIN — une date de publication qui ne suit pas la fusion n’est pas celle du déploiement : faute nommée', () => {
    for (const publieeLe of [FUSION, '2026-11-01T08:59:59.999Z']) {
      expect(fautesDeDatation([PREMIERE, nouvelle({ publieeLe })])).toEqual([
        { version: 'b'.repeat(32), faute: 'deploiement_avant_la_fusion' },
      ]);
    }
  });

  it('REQ-JUR-068 : TÉMOIN — le sha servi est lisible et la source le nomme', () => {
    for (const shaServi of ['', 'abc123', 'ABCDEF1', `${'a'.repeat(40)}0`, 'zzzzzzz']) {
      expect(
        fautesDeDatation([PREMIERE, nouvelle({ deploiement: { shaServi, fusionneeLe: FUSION } })])
      ).toEqual([{ version: 'b'.repeat(32), faute: 'sha_servi_illisible' }]);
    }
    expect(
      fautesDeDatation([PREMIERE, nouvelle({ source: 'fusion de la tâche (témoin)' })])
    ).toEqual([{ version: 'b'.repeat(32), faute: 'source_sans_sha_servi' }]);
    // Un sha de 7 ou de 40 hexadécimaux minuscules est lisible.
    for (const shaServi of ['abcdef1', 'f'.repeat(40)]) {
      expect(
        fautesDeDatation([
          PREMIERE,
          nouvelle({
            source: `déploiement vérifié de ${shaServi.slice(0, 7)}`,
            deploiement: { shaServi, fusionneeLe: FUSION },
          }),
        ])
      ).toEqual([]);
    }
  });

  it('REQ-JUR-068 : TÉMOIN — une date illisible, de publication ou de fusion, est une faute nommée', () => {
    expect(fautesDeDatation([PREMIERE, nouvelle({ publieeLe: 'demain' })])).toEqual([
      { version: 'b'.repeat(32), faute: 'date_illisible' },
    ]);
    expect(
      fautesDeDatation([
        PREMIERE,
        nouvelle({ deploiement: { shaServi: SHA, fusionneeLe: 'hier' } }),
      ])
    ).toEqual([{ version: 'b'.repeat(32), faute: 'date_illisible' }]);
  });

  it('REQ-JUR-068 : TÉMOIN — seule la PREMIÈRE version, publiée à la première fusion, est datée de la fusion ; elle ne change pas', () => {
    expect(PREMIERE.version).toBe(VERSION_DATEE_DE_LA_FUSION);
    expect(PREMIERE.deploiement).toBeUndefined();
    expect(fautesDeDatation([PREMIERE])).toEqual([]);
    // La même entrée, ailleurs qu'en tête, n'est plus l'exception.
    expect(
      fautesDeDatation([nouvelle({ publieeLe: '2026-10-01T00:00:00.000Z' }), PREMIERE])
    ).toEqual([
      { version: 'b'.repeat(32), faute: 'deploiement_avant_la_fusion' },
      { version: PREMIERE.version, faute: 'datee_de_la_fusion' },
    ]);
    // Une autre version datée de la fusion, même en tête, n'est pas l'exception.
    const { deploiement: _retire, ...autre } = nouvelle();
    void _retire;
    expect(fautesDeDatation([autre])).toEqual([
      { version: 'b'.repeat(32), faute: 'datee_de_la_fusion' },
    ]);
  });

  it('REQ-JUR-068 : TÉMOIN — la liste du dépôt est sans faute de datation', () => {
    expect(fautesDeDatation()).toEqual([]);
    expect(fautesDeDatation(VERSIONS_PUBLIEES_CONSOLE)).toEqual([]);
  });
});
