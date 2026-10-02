// @req REQ-EXT-015
/**
 * EXT-T08 — la fiche persistée porte les coordonnées du siège en micro-degrés, calculées CÔTÉ
 * SERVEUR dans la projection (REQ-EXT-015) ; la suggestion vue du navigateur n'en porte aucune.
 *
 * CE QU'IL PROUVE, sur CHAQUE fixture enregistrée d'INT-T09 :
 *   — `siege.latitude_microdeg` et `siege.longitude_microdeg` égalent la conversion des chaînes WGS84
 *     du tiers (contre-calcul indépendant), et sont nuls ensemble quand le tiers n'en rend pas ;
 *   — la suggestion ne porte aucune coordonnée ;
 *   — ÉCHEC FERMÉ : un siège dont la diffusion n'est pas pleine (unité légale ou établissement) ne
 *     livre pas sa position — c'est souvent le domicile d'un entrepreneur individuel.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  empreinteurDeDirigeants,
  projeter,
  versFiche,
} from '../../../src/server/integrations/recherche-entreprises/projection';
import {
  schemaFicheEntreprise,
  schemaReponseDuTiers,
  type ResultatDuTiers,
} from '../../../src/server/integrations/recherche-entreprises/schemas';
import { DOSSIER_DES_FIXTURES } from '../../../src/server/integrations/recherche-entreprises/fixtures';

const empreindre = empreinteurDeDirigeants('cle-de-test-des-coordonnees-0123456789');

/** Le contre-calcul : indépendant de l'implémentation, juste sur les valeurs des fixtures. */
const attendu = (texte: string | null | undefined): number | null =>
  texte === null || texte === undefined ? null : Math.round(Number(texte) * 1_000_000);

const fixtures = readdirSync(DOSSIER_DES_FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    nom: f,
    reponse: (
      JSON.parse(readFileSync(join(DOSSIER_DES_FIXTURES, f), 'utf8')) as { reponse: unknown }
    ).reponse,
  }));

describe('REQ-EXT-015 — la projection porte les coordonnées du siège, en micro-degrés', () => {
  it('REQ-EXT-015 : les fixtures enregistrées sont lues, et portent des coordonnées', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)(
    'REQ-EXT-015 : $nom — chaque fiche égale la conversion du siège ; aucune suggestion n’en porte',
    ({ reponse }) => {
      const lue = schemaReponseDuTiers.safeParse(reponse);
      if (!lue.success) return; // une fixture d'erreur du tiers n'a pas de résultats
      const projection = projeter(lue.data, empreindre);
      lue.data.results.forEach((r, i) => {
        const fiche = projection.fiches[i]!;
        const pleine = r.statut_diffusion === 'O' && r.siege.statut_diffusion_etablissement === 'O';
        const lat = attendu(r.siege.latitude);
        const lon = attendu(r.siege.longitude);
        const paire = pleine && lat !== null && lon !== null;
        expect(fiche.siege.latitude_microdeg).toBe(paire ? lat : null);
        expect(fiche.siege.longitude_microdeg).toBe(paire ? lon : null);
        expect(schemaFicheEntreprise.safeParse(fiche).success).toBe(true);
      });
      for (const s of projection.suggestions) {
        expect(Object.keys(s).some((k) => /latitude|longitude|micro/i.test(k))).toBe(false);
      }
    }
  );
});

describe('REQ-EXT-015 — ÉCHEC FERMÉ : une diffusion qui n’est pas pleine ne livre pas sa position', () => {
  const resultat = (statut: string, statutSiege: string): ResultatDuTiers => ({
    siren: '123456789',
    nom_complet: 'ENTREPRISE FICTIVE',
    nature_juridique: '1000',
    activite_principale: '62.01Z',
    tranche_effectif_salarie: '00',
    etat_administratif: 'A',
    categorie_entreprise: 'PME',
    statut_diffusion: statut,
    siege: {
      siret: '12345678900011',
      code_postal: '00000',
      libelle_commune: 'VILLE FICTIVE',
      departement: '00',
      region: '00',
      statut_diffusion_etablissement: statutSiege,
      latitude: '48.8763540066087',
      longitude: '2.34353640229216',
    },
    dirigeants: [],
  });

  it('REQ-EXT-015 : TÉMOIN — diffusion pleine : la paire ; partielle (unité ou siège) : rien', () => {
    expect(versFiche(resultat('O', 'O'), empreindre).siege).toMatchObject({
      latitude_microdeg: 48876354,
      longitude_microdeg: 2343536,
    });
    for (const [u, s] of [
      ['P', 'O'],
      ['O', 'P'],
      ['N', 'N'],
      ['', 'O'],
    ] as const) {
      expect(versFiche(resultat(u, s), empreindre).siege).toMatchObject({
        latitude_microdeg: null,
        longitude_microdeg: null,
      });
    }
  });

  it('REQ-EXT-015 : une coordonnée hors forme n’est pas devinée — la fiche reste valide, sans position', () => {
    const r = resultat('O', 'O');
    const fiche = versFiche({ ...r, siege: { ...r.siege, latitude: '4.8e1' } }, empreindre);
    expect(fiche.siege).toMatchObject({ latitude_microdeg: null, longitude_microdeg: null });
    expect(schemaFicheEntreprise.safeParse(fiche).success).toBe(true);
  });

  it('REQ-EXT-015 : le schéma de la fiche refuse un entier hors bornes ou une moitié de paire', () => {
    const fiche = versFiche(resultat('O', 'O'), empreindre);
    const avec = (siege: object) =>
      schemaFicheEntreprise.safeParse({ ...fiche, siege: { ...fiche.siege, ...siege } }).success;
    expect(avec({ latitude_microdeg: 90_000_001 })).toBe(false);
    expect(avec({ longitude_microdeg: 1.5 })).toBe(false);
    expect(avec({ latitude_microdeg: null })).toBe(false);
  });
});
