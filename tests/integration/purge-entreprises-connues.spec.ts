// @req REQ-DM-029
// @req REQ-DM-028
/**
 * La purge des projections de l'antériorité, sur la vraie base, sous le rôle du serveur
 * (`partners_app`), comme en production : chaque échéance jugée une milliseconde avant et pile, et
 * une ligne qui fonde encore un refus n'est pas effacée. Les durées sont celles du registre de
 * l'article 30 : la règle de l'antériorité elle-même.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { ajouterMoisParis } from '../../src/domain/attribution/machine';
import { anterioriteDe } from '../../src/server/entreprise-connue/projection';
import { purgerLesEntreprisesConnues } from '../../src/server/taches/purger-entreprises-connues';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const MAINTENANT = new Date('2027-06-15T12:00:00.000Z');
const LIMITE_DEVIS = new Date(
  ajouterMoisParis(MAINTENANT.getTime(), -SEUILS.ANTERIORITE_DEVIS_MOIS.valeur)
);
const LIMITE_CLIENT = new Date(
  ajouterMoisParis(MAINTENANT.getTime(), -SEUILS.ANTERIORITE_CLIENT_MOIS.valeur)
);
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);

let sirens = 400000000;
const unSiren = () => String((sirens += 1));

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unDevis(
  devisRef: string,
  siren: string,
  emisAt: Date,
  o: { signeAt?: Date; montant?: number; facture?: number } = {}
) {
  await base.prisma.devisConnu.create({
    data: {
      devisRef,
      siren,
      emisAt,
      signeAt: o.signeAt ?? null,
      montantTotalHtCents: o.montant ?? 0,
      factureHtCents: o.facture ?? 0,
    },
  });
}

async function uneLigne(siren: string, origine: 'client' | 'devis', depuis: Date, dernier: Date) {
  await base.prisma.entrepriseConnue.create({
    data: { siren, origine, connueDepuisAt: depuis, dernierContactAt: dernier },
  });
}

describe('REQ-DM-029 — la purge, sous partners_app, à la milliseconde', () => {
  it('REQ-DM-029 : TÉMOIN — un devis non signé émis une milliseconde avant la limite est effacé ; pile, il est gardé', async () => {
    const avant = unSiren();
    const pile = unSiren();
    await unDevis(`d-${avant}`, avant, ms(LIMITE_DEVIS, -1));
    await unDevis(`d-${pile}`, pile, LIMITE_DEVIS);
    await uneLigne(avant, 'devis', ms(LIMITE_DEVIS, -1), ms(LIMITE_DEVIS, -1));
    await purgerLesEntreprisesConnues(app, MAINTENANT);
    expect(await base.prisma.devisConnu.count({ where: { siren: avant } })).toBe(0);
    expect(await base.prisma.devisConnu.count({ where: { siren: pile } })).toBe(1);
    // La ligne devis de l'entreprise suit son dernier devis.
    expect(await base.prisma.entrepriseConnue.count({ where: { siren: avant } })).toBe(0);
    // Ce qui reste fonde encore un refus ; ce qui est parti n'en fondait plus.
    expect((await anterioriteDe(app, pile, MAINTENANT)).connue).toBe(true);
    expect((await anterioriteDe(app, avant, MAINTENANT)).connue).toBe(false);
  });

  it('REQ-DM-029 : TÉMOIN — un devis signé et pas entièrement facturé fonde encore un refus : il n’est pas effacé', async () => {
    const siren = unSiren();
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    await unDevis(`d-${siren}`, siren, vieux, { signeAt: vieux, montant: 1000, facture: 999 });
    await purgerLesEntreprisesConnues(app, MAINTENANT);
    expect(await base.prisma.devisConnu.count({ where: { siren } })).toBe(1);
    expect((await anterioriteDe(app, siren, MAINTENANT)).connue).toBe(true);
  });

  it('REQ-DM-029 : TÉMOIN — une cliente dont la dernière prestation est une milliseconde avant la limite est effacée ; pile, gardée', async () => {
    const avant = unSiren();
    const pile = unSiren();
    await uneLigne(avant, 'client', ms(LIMITE_CLIENT, -10), ms(LIMITE_CLIENT, -1));
    await uneLigne(pile, 'client', ms(LIMITE_CLIENT, -10), LIMITE_CLIENT);
    await purgerLesEntreprisesConnues(app, MAINTENANT);
    expect(await base.prisma.entrepriseConnue.count({ where: { siren: avant } })).toBe(0);
    expect(await base.prisma.entrepriseConnue.count({ where: { siren: pile } })).toBe(1);
  });

  it('REQ-DM-028 : la liste de la Société n’est pas une projection : la purge n’y touche pas, quelle que soit l’ancienneté', async () => {
    const siren = unSiren();
    const auteur = await base.prisma.utilisateurConsole.create({
      data: { role: 'admin', creeAt: MAINTENANT, desactiveAt: MAINTENANT },
    });
    await base.prisma.sirenListeNoire.create({
      data: {
        siren,
        motif: 'financeur_paritaire',
        ajouteParId: auteur.id,
        ajouteAt: new Date('2015-01-01T00:00:00.000Z'),
      },
    });
    await purgerLesEntreprisesConnues(app, MAINTENANT);
    expect(await base.prisma.sirenListeNoire.count({ where: { siren } })).toBe(1);
    expect(await anterioriteDe(app, siren, MAINTENANT)).toMatchObject({
      connue: true,
      origine: 'financeur',
    });
  });

  it('REQ-DM-029 : rejouée, la purge n’efface rien de plus', async () => {
    const premiere = await purgerLesEntreprisesConnues(app, MAINTENANT);
    expect(premiere).toEqual({ devis: 0, clients: 0, devisOrigine: 0 });
  });
});
