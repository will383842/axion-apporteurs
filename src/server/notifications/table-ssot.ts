/**
 * La table des notifications — la SOURCE UNIQUE des clés de `courriels_envoyes.gabarit` (INT-T10,
 * exception E2 de partners/ADR-0022 point 9). Table MINIMALE, reprise et étendue par UX-P1-10 (la
 * table SSOT des notifications de l'espace), qui y ajoutera les canaux, les délais et les libellés.
 *
 * POURQUOI UNE TABLE DE CODE ET PAS UN ENUM : un enum Postgres en serait une seconde copie, et
 * chaque nouveau gabarit deviendrait une PR `schema`. La FORME est tenue par la base
 * (`courriels_envoyes_gabarit_forme`), la VALEUR ici : un gabarit hors de cette table est refusé
 * AVANT toute écriture (`schemaGabarit`), et un test d'intégration confronte les gabarits écrits en
 * base à ces clés. Aucune règle métier ne branche sur cette colonne.
 */
import { z } from 'zod';

export const GABARITS = {
  /** Le lien de connexion de l'espace apporteur (SEC-03). */
  lien_magique: { req: 'REQ-SEC-001' },
} as const satisfies Readonly<Record<string, { req: `REQ-${string}` }>>;

export type Gabarit = keyof typeof GABARITS;

const CLES = Object.keys(GABARITS) as [Gabarit, ...Gabarit[]];

/** La validation à l'écriture : une clé hors de la table ne devient jamais une ligne. */
export const schemaGabarit = z.enum(CLES);
