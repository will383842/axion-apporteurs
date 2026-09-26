/**
 * Les fixtures enregistrées du tiers de recherche d'entreprises — INT-T09 (REQ-QA-028, RM-03).
 *
 * UNE FIXTURE EST UNE RÉPONSE RÉELLE, DATÉE, QUI NOMME SON PRODUCTEUR. Elle est écrite par
 * `enregistrer-fixtures.ts` depuis l'API réelle, jamais tapée à la main, et porte les deux en-têtes
 * que prescrit la rubrique 9 de `docs/tiers/recherche-entreprises.md` : `Source:` (qui l'a produite,
 * quand, et la projection appliquée) et `Confronte-a` (ce à quoi elle a été confrontée).
 *
 * Ce module ne fait que LIRE, et refuse ce qui n'a pas la forme d'une fixture : une fixture dont un
 * en-tête manque n'est pas une fixture incomplète, c'est une donnée sans provenance.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const DOSSIER_DES_FIXTURES = 'tests/fixtures/recherche-entreprises';

export const schemaFixture = z
  .object({
    Source: z.string().min(1),
    'Confronte-a': z.string().min(1),
    enregistreLe: z.string().datetime(),
    cas: z.string().min(1),
    requete: z.object({ q: z.string().min(1) }).strict(),
    url: z.string().startsWith('https://'),
    statut: z.literal(200),
    reponse: z.unknown(),
  })
  .strict();

export type FixtureEnregistree = z.infer<typeof schemaFixture> & { readonly fichier: string };

export function lireFixtures(dossier: string = DOSSIER_DES_FIXTURES): FixtureEnregistree[] {
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const chemin = join(dossier, f);
      const lu = schemaFixture.safeParse(JSON.parse(readFileSync(chemin, 'utf8')));
      if (!lu.success) {
        throw new Error(
          `fixture_illisible : ${chemin} — ${lu.error.issues[0]?.path.join('.') ?? '?'}`
        );
      }
      return { ...lu.data, fichier: chemin };
    });
}
