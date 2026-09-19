// @req REQ-QA-006
/**
 * QA-T02 — le harnais d'intégration, jugé par ce qu'il FAIT, pas par ce qu'il dit.
 *
 * R1 — L'environnement du sous-processus `prisma` se CONSTRUIT : une source qui porte des
 * variables piégées (une URL de base du poste, une URL d'ombre, un réglage `PRISMA_*`) n'en laisse
 * traverser aucune ; l'URL de base reçue est celle du conteneur.
 */
import { describe, it, expect } from 'vitest';
import { environnementDuSousProcessus } from './harnais';

const URL_CONTENEUR = 'postgresql://test:test@localhost:55432/test';

/** Les pièges sont posés AU MILIEU de la source : un filtre qui ne lit que le début les laisse. */
const SOURCE_PIEGEE: Record<string, string> = {
  PATH: '/usr/bin',
  SystemRoot: 'C:\\Windows',
  PRISMA_PIEGE: '1',
  SHADOW_DATABASE_URL: 'postgresql://ombre@localhost:1/ombre',
  DATABASE_URL: 'postgresql://piege@localhost:1/piege',
  NODE_OPTIONS: '--require ./piege.js',
  TEMP: '/tmp',
};
const PIEGES = ['PRISMA_PIEGE', 'SHADOW_DATABASE_URL', 'NODE_OPTIONS'];

describe('REQ-QA-006 — le sous-processus prisma ne reçoit que ce que le harnais construit', () => {
  it('REQ-QA-006 — aucune variable piégée de la source ne traverse, et la base est celle du conteneur', () => {
    const env = environnementDuSousProcessus(SOURCE_PIEGEE, URL_CONTENEUR);
    const traversees = PIEGES.filter((nom) => env[nom] !== undefined);
    expect(traversees, `variables de l'hôte qui traversent : ${traversees.join(', ')}`).toEqual([]);
    expect(env.DATABASE_URL).toBe(URL_CONTENEUR);
  });
});
