// @req REQ-JUR-068
/**
 * JUR-T63 — la preuve de l'information individuelle des utilisateurs de la console (juriste, #708,
 * 5981356847 ; condition d'A02, 5982307722) : la trace du courriel d'invitation porte la version de la
 * page « Vos données dans la console » rendue à l'envoi.
 *
 * FORME D'A02 (`schema: false`) : la version se DÉRIVE de `courriels_envoyes.envoye_at`, contre une
 * liste DATÉE, en ajout seul, des versions publiées (`VERSIONS_PUBLIEES_CONSOLE`). Ce fichier garde :
 * la version en vigueur à un instant, borne de publication incluse ; la liste en ajout seul, sa
 * première entrée figée ; la dernière version publiée égale à celle que le registre du dépôt rend ;
 * la version gardée, celle de la page PUBLIÉE à l'instant, jamais celle du dépôt au moment du test ;
 * et le refus nommé d'une invitation à un instant sans version publiée (échec fermé).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  VERSIONS_PUBLIEES_CONSOLE,
  extrairePolitiqueConsole,
  versionEnVigueurConsole,
} from '../../../src/domain/rgpd/politique-console';
import { courrielDInvitation } from '../../../src/server/console/utilisateurs/courriels';

const PREMIERE = VERSIONS_PUBLIEES_CONSOLE[0]!;
const ms = (iso: string) => new Date(iso);

describe('REQ-JUR-068 — la version de la page « Vos données dans la console » en vigueur à un envoi', () => {
  it('REQ-JUR-068 : TÉMOIN — la version en vigueur est la dernière publiée à l’instant, borne de publication INCLUSE', () => {
    const liste = [
      { version: 'a'.repeat(32), publieeLe: '2026-10-04T17:59:34.000Z', source: 'témoin' },
      { version: 'b'.repeat(32), publieeLe: '2026-11-01T09:00:00.000Z', source: 'témoin' },
    ];
    expect(versionEnVigueurConsole(ms('2026-10-04T17:59:33.999Z'), liste)).toBeNull();
    expect(versionEnVigueurConsole(ms('2026-10-04T17:59:34.000Z'), liste)).toBe('a'.repeat(32));
    expect(versionEnVigueurConsole(ms('2026-11-01T08:59:59.999Z'), liste)).toBe('a'.repeat(32));
    expect(versionEnVigueurConsole(ms('2026-11-01T09:00:00.000Z'), liste)).toBe('b'.repeat(32));
    expect(versionEnVigueurConsole(ms('2030-01-01T00:00:00.000Z'), liste)).toBe('b'.repeat(32));
  });

  it('REQ-JUR-068 : TÉMOIN — la version gardée est celle de la page PUBLIÉE à l’envoi, pas celle du dépôt au moment du test', () => {
    // Un envoi d'avant une nouvelle publication garde l'ancienne version, même quand le dépôt a changé.
    const ancienne = [PREMIERE];
    const apres = [
      ...ancienne,
      { version: 'c'.repeat(32), publieeLe: '2027-01-01T00:00:00.000Z', source: 'témoin' },
    ];
    const envoi = ms('2026-12-31T23:59:59.999Z');
    expect(versionEnVigueurConsole(envoi, ancienne)).toBe(PREMIERE.version);
    expect(versionEnVigueurConsole(envoi, apres)).toBe(PREMIERE.version);
  });

  it('REQ-JUR-068 : TÉMOIN — la liste est en AJOUT SEUL : sa première entrée est figée, ses dates croissent strictement, ses versions sont distinctes', () => {
    expect(PREMIERE).toEqual({
      version: 'aaf43d0ae628eb1c9e696e8613704e44',
      publieeLe: '2026-10-04T17:59:34.000Z',
      source: 'fusion de JUR-T62 (#709), 3f020314',
    });
    const dates = VERSIONS_PUBLIEES_CONSOLE.map((v) => Date.parse(v.publieeLe));
    for (const d of dates) expect(Number.isNaN(d)).toBe(false);
    for (let i = 1; i < dates.length; i += 1) expect(dates[i]!).toBeGreaterThan(dates[i - 1]!);
    const versions = VERSIONS_PUBLIEES_CONSOLE.map((v) => v.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const v of versions) expect(v).toMatch(/^[0-9a-f]{32}$/);
  });

  it('REQ-JUR-068 : TÉMOIN — la dernière version publiée est celle que le registre du dépôt rend : un changement de la page exige une nouvelle entrée datée', () => {
    const lu = extrairePolitiqueConsole(readFileSync('docs/rgpd/registre-article-30.md', 'utf8'));
    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    expect(VERSIONS_PUBLIEES_CONSOLE.at(-1)!.version).toBe(lu.politique.version);
  });
});

describe('REQ-JUR-068 — une invitation sans version publiée de la page est refusée', () => {
  const invitation = (inviteeAt: Date) =>
    courrielDInvitation({
      a: 'invite@exemple.invalid',
      role: 'lecteur',
      adresseConnexion: 'https://partners.exemple.invalid/console/connexion',
      inviteeAt,
    });

  it('REQ-JUR-068 : TÉMOIN — avant la première publication, l’invitation est refusée, nommée : rien n’est construit', () => {
    expect(() => invitation(ms('2026-10-04T17:59:33.999Z'))).toThrow(
      /^invitation_sans_version_de_la_page/
    );
  });

  it('REQ-JUR-068 : TÉMOIN — à la publication et après, l’invitation se construit, et sa version se dérive de l’instant', () => {
    for (const iso of ['2026-10-04T17:59:34.000Z', '2026-10-05T10:00:00.000Z']) {
      const c = invitation(ms(iso));
      expect(c.gabarit).toBe('invitation_console');
      expect(c.corps).toContain('/console/vos-donnees');
      expect(versionEnVigueurConsole(ms(iso))).toBe(PREMIERE.version);
    }
  });
});
