// @req REQ-SEC-014
// @req REQ-SEC-022
// @req REQ-SEC-032
// @req REQ-JUR-008
// @req REQ-CPL-008
// @req REQ-UX-039
/**
 * SEC-12 — la transaction de dépôt en base RÉELLE.
 *
 * CE QU'IL PROUVE :
 *   1. VINGT DÉPÔTS SIMULTANÉS sur un même SIREN, par vingt apporteurs : un occupant `provisoire`,
 *      deux `en_attente` (rangs 1 et 2), dix-sept refus `file_complete` tracés ; les `deposee_at`
 *      croissent strictement dans l'ordre des rangs (verrou consultatif par SIREN) ;
 *   2. LE MÊME REFUS QUEL QUE SOIT L'OCCUPANT : derrière une prise en charge par un conseiller, la
 *      file se forme comme derrière un apporteur ; la réserve de l'art. 3.5 al. 4 n'est pas une
 *      occupation ;
 *   3. L'ART. 3.3 : une entreprise cliente ou destinataire d'un devis est refusée, le motif stocké
 *      les distingue, l'issue rendue est la même ;
 *   4. LA RELECTURE DU STATUT : un apporteur résilié ne dépose pas, rien n'est écrit ; suspendu, son
 *      dépôt est `gele`, rien n'est écrit ;
 *   5. LA SAISIE SERVEUR : les quatre coordonnées du contact sont exigées, nommées par champ ; une
 *      adresse webmail passe ; la case d'information des tiers non cochée est refusée, nommée ; sa
 *      version est enregistrée ;
 *   7. LE REFUS EST NOTIFIÉ (`refus_declaration`) : une fois, au bon apporteur, après la transaction ;
 *      la même catégorie pour les deux antériorités ; ni `gele` ni un dépôt enregistré ne notifient ;
 *   6. UNE DEMANDE DE CONFIRMATION par dépôt enregistré, dans la même transaction ; aucune pour un
 *      refus, aucune pour un dépôt annulé ;
 *   8. LE LIEN D'INTÉRÊT DÉCLARÉ est conservé sur la déclaration, sans aucun effet sur son issue ;
 *   9. LE DÉPÔT ET LA PROJECTION SE SÉRIALISENT sur un SIREN : un dépôt ATTEND une projection
 *      `client_cree` en cours, et lit l'antériorité APRÈS elle (rattrapage 107).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { clesPii } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import {
  DepotInterdit,
  ErreurSaisieDepot,
  deposer,
  deposerDans,
  type DemandeDeDepot,
  type PortsDuDepot,
} from '../../src/server/depot/deposer';
import { issueRendue } from '../../src/content/micro-copy/espace/issues-depot';
import { notifier } from '../../src/server/notifications/envoyer';
import { forApporteur } from '../../src/server/acces/for-apporteur';
import type { DemandeDeNotification } from '../../src/server/notifications/envoyer';
import { CASE_INFORMATION_TIERS } from '../../src/content/micro-copy/espace/information-tiers';
import { verrouillerLesSirens } from '../../src/server/entreprise-connue/projection';
import { poserUnGelEnBase } from './gel-en-base';

let base: Base;
let codes = 0;
let sirens = 500_000_000;

const T0 = new Date('2026-10-03T12:00:00.000Z');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-12-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});
const PORTS: PortsDuDepot = {
  cles: CLES,
  secretConfirmation: randomBytes(32).toString('hex'),
  maintenant: () => T0,
  oppositionDemarchage: async () => false,
  adresseDe: async () => 'apporteur.temoin@example.org',
  notifier: async () => undefined,
  debit: async () => ({ autorise: true, repriseAt: null }),
  captcha: async () => 'non_requis',
};

/** Le dépôt, sous un débit qui laisse passer : un « réessayer » ici serait un défaut du banc. */
async function deposerOuEchouer(
  ...args: Parameters<typeof deposer>
): Promise<Exclude<Awaited<ReturnType<typeof deposer>>, { reessayer: true }>> {
  const r = await deposer(...args);
  if ('reessayer' in r) throw new Error('débit refusé : le banc ne doit jamais l’atteindre');
  return r;
}
const hex = (n: number) => randomBytes(n).toString('hex');
const unSiren = () => String((sirens += 1));

beforeAll(async () => {
  base = await demarrerBase();
  await base.prisma.grilleCommission.create({
    data: {
      version: 1,
      hash: hex(32),
      contenuJson: { essai: true },
      publieeAt: T0,
      importeeAt: T0,
    },
  });
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

type Statut = 'signe' | 'suspendu' | 'resilie';

async function apporteur(statut: Statut): Promise<string> {
  codes += 1;
  // SEC-15 : `suspendu` ne s'écrit plus seul ; l'apporteur naît `signe`, puis reçoit un VRAI gel.
  const a = await base.prisma.apporteur.create({
    data: {
      statut: statut === 'suspendu' ? 'signe' : statut,
      resiliationMotif: statut === 'resilie' ? 'ordinaire_axion' : null,
      codeParrainage: `AX${String(codes).padStart(6, '0')}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: T0,
    },
  });
  if (statut === 'suspendu') await poserUnGelEnBase(base.prisma, a.id, T0);
  return a.id;
}

/** Une demande COMPLÈTE : chaque champ écrit (RM-11) ; chaque test en change un. */
function demande(apporteurId: string, siren: string): DemandeDeDepot {
  return {
    apporteurId,
    canal: 'espace',
    jetonDepotId: null,
    saisie: {
      siren,
      siret: null,
      dateContact: '2026-10-01',
      contact: {
        nom: 'Témoin',
        prenom: 'Camille',
        fonction: 'Gérante',
        email: 'camille.temoin@gmail.com',
        telephone: '06 12 34 56 78',
      },
      contexte: null,
      informationTiersCochee: true,
      lienInteretDeclare: false,
    },
    fiche: { raisonSociale: 'Entreprise Témoin SAS', etatAdministratif: 'actif' },
    adresseReseau: '203.0.113.7',
    session: `session-${apporteurId}`,
    reponseCaptcha: null,
    agentUtilisateur: 'Mozilla/5.0 (témoin)',
    clientCapturedAt: null,
  };
}

async function refus(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('aucun refus');
}

const lignes = (siren: string) =>
  base.prisma.attribution.findMany({ where: { siren }, orderBy: { deposeeAt: 'asc' } });
const demandes = (siren: string) =>
  base.prisma.demandeConfirmation.count({ where: { attribution: { siren } } });

describe('REQ-SEC-014 — vingt dépôts simultanés sur un même SIREN', () => {
  it('REQ-SEC-014 : un provisoire, deux en_attente, dix-sept file_complete ; deposee_at strictement croissant', async () => {
    const siren = unSiren();
    const ids = await Promise.all(Array.from({ length: 20 }, () => apporteur('signe')));
    const issues = await Promise.all(
      ids.map((id) => deposerOuEchouer(base.prisma, demande(id, siren), PORTS))
    );
    const compte = (i: string) => issues.filter((x) => x.issue === i).length;
    expect([compte('enregistree'), compte('en_attente'), compte('file_complete')]).toEqual([
      1, 2, 17,
    ]);

    const l = await lignes(siren);
    expect(l.map((x) => [x.statut, x.rangAttente])).toEqual([
      ['provisoire', null],
      ['en_attente', 1],
      ['en_attente', 2],
    ]);
    const t = l.map((x) => x.deposeeAt.getTime());
    expect(t[0]! < t[1]! && t[1]! < t[2]!).toBe(true);
    expect(await base.prisma.depotRefuse.count({ where: { siren, motif: 'file_complete' } })).toBe(
      17
    );
    expect(await demandes(siren)).toBe(1);
  }, 60_000);
});

describe('REQ-SEC-022 — le même refus quel que soit l’occupant ; la réserve n’occupe pas', () => {
  it('REQ-SEC-022 : derrière une prise en charge par un conseiller, la file se forme comme derrière un apporteur', async () => {
    const parApporteur = unSiren();
    const parConseiller = unSiren();
    const occupant = await apporteur('signe');
    await deposerOuEchouer(base.prisma, demande(occupant, parApporteur), PORTS);
    const declarant = await apporteur('signe');
    const derriereApporteur = await deposerOuEchouer(
      base.prisma,
      demande(declarant, parApporteur),
      PORTS
    );

    // Le rôle `conseiller_salarie` n'existe pas encore : son déclencheur est neutralisé le temps
    // d'une transaction ANNULÉE (patron d'`index-partiel.spec.ts`).
    const annulee = new Error('annulee');
    let derriereConseiller: unknown = null;
    await base.prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE attributions DISABLE TRIGGER attributions_porteur_conseiller'
        );
        const u = await tx.utilisateurConsole.create({
          data: { role: 'admin', creeAt: T0, desactiveAt: T0 },
          select: { id: true },
        });
        await tx.$executeRawUnsafe(
          `INSERT INTO attributions (id, utilisateur_console_id, statut, siren, canal, date_contact,
             verification_prioritaire, entreprise_a_verifier, lien_interet_declare)
           VALUES ($1::uuid, $2::uuid, 'provisoire', $3, 'console', '2026-10-01', false, false, false)`,
          randomUUID(),
          u.id,
          parConseiller
        );
        derriereConseiller = await deposerDans(tx, demande(declarant, parConseiller), PORTS);
        throw annulee;
      })
      .catch((e: unknown) => {
        if (e !== annulee) throw e;
      });
    expect(derriereApporteur.issue).toBe('en_attente');
    expect(JSON.stringify((derriereConseiller as { issue: string }).issue)).toBe(
      JSON.stringify(derriereApporteur.issue)
    );
  });

  it('REQ-SEC-022 : une attribution LIBÉRÉE d’un autre apporteur (réserve de l’art. 3.5 al. 4) n’empêche pas le dépôt', async () => {
    const siren = unSiren();
    const autre = await apporteur('signe');
    const premier = await deposerOuEchouer(base.prisma, demande(autre, siren), PORTS);
    await base.prisma.$executeRawUnsafe(
      `UPDATE attributions SET statut = 'annulee' WHERE id = $1::uuid`,
      premier.attributionId
    );
    const r = await deposerOuEchouer(base.prisma, demande(await apporteur('signe'), siren), PORTS);
    expect(r.issue).toBe('enregistree');
  });
});

describe('REQ-SEC-022 — l’art. 3.3 : refus tracé, motif distinct, issue rendue identique', () => {
  it('REQ-SEC-022 : cliente → anteriorite_client ; devis émis → anteriorite_devis ; même rendu ; rien d’enregistré', async () => {
    const cliente = unSiren();
    const devis = unSiren();
    await base.prisma.entrepriseConnue.create({
      data: { siren: cliente, origine: 'client', connueDepuisAt: T0, dernierContactAt: T0 },
    });
    await base.prisma.devisConnu.create({
      data: { devisRef: `D-${hex(4)}`, siren: devis, emisAt: T0, montantTotalHtCents: 100_000 },
    });
    const a = await apporteur('signe');
    const rc = await deposerOuEchouer(base.prisma, demande(a, cliente), PORTS);
    const rd = await deposerOuEchouer(base.prisma, demande(a, devis), PORTS);
    expect([rc, rd]).toEqual([
      { issue: 'anteriorite_client', attributionId: null },
      { issue: 'anteriorite_devis', attributionId: null },
    ]);
    expect(JSON.stringify(issueRendue(rc.issue))).toBe(JSON.stringify(issueRendue(rd.issue)));
    expect(
      await base.prisma.attribution.count({ where: { siren: { in: [cliente, devis] } } })
    ).toBe(0);
    const motifs = await base.prisma.depotRefuse.findMany({
      where: { apporteurId: a, siren: { in: [cliente, devis] } },
      select: { motif: true, canal: true, refuseAt: true },
      orderBy: { motif: 'asc' },
    });
    expect(motifs).toEqual([
      { motif: 'anteriorite_client', canal: 'espace', refuseAt: T0 },
      { motif: 'anteriorite_devis', canal: 'espace', refuseAt: T0 },
    ]);
  });

  it('REQ-SEC-022 : un établissement cessé, une entreprise en opposition : refusés, tracés', async () => {
    const a = await apporteur('signe');
    const cesse = unSiren();
    const r1 = await deposerOuEchouer(
      base.prisma,
      { ...demande(a, cesse), fiche: { raisonSociale: 'Fermée SARL', etatAdministratif: 'cesse' } },
      PORTS
    );
    const oppose = unSiren();
    const r2 = await deposerOuEchouer(base.prisma, demande(a, oppose), {
      ...PORTS,
      oppositionDemarchage: async (_tx, s) => s === oppose,
    });
    expect([r1.issue, r2.issue]).toEqual(['etablissement_cesse', 'opposition_demarchage']);
    expect(await base.prisma.depotRefuse.count({ where: { apporteurId: a } })).toBe(2);
  });
});

describe('REQ-SEC-032 — le statut se relit dans la transaction', () => {
  it('REQ-SEC-032 : face ROUGE — un apporteur résilié ne dépose pas : refus nommé, rien n’est écrit', async () => {
    const siren = unSiren();
    const a = await apporteur('resilie');
    expect(await refus(deposerOuEchouer(base.prisma, demande(a, siren), PORTS))).toBeInstanceOf(
      DepotInterdit
    );
    expect(await base.prisma.attribution.count({ where: { siren } })).toBe(0);
    expect(await base.prisma.depotRefuse.count({ where: { apporteurId: a } })).toBe(0);
  });

  it('REQ-SEC-032 : un apporteur suspendu : `gele`, rien n’est écrit, aucune trace de refus', async () => {
    const siren = unSiren();
    const a = await apporteur('suspendu');
    expect(await deposerOuEchouer(base.prisma, demande(a, siren), PORTS)).toEqual({
      issue: 'gele',
      attributionId: null,
    });
    expect(await base.prisma.attribution.count({ where: { siren } })).toBe(0);
    expect(await base.prisma.depotRefuse.count({ where: { apporteurId: a } })).toBe(0);
  });
});

describe('REQ-JUR-008 — la saisie se juge au serveur', () => {
  it.each(['nom', 'prenom', 'fonction', 'email', 'telephone'] as const)(
    'REQ-JUR-008 : face ROUGE — %s absent : refus nommé par champ, rien n’est écrit',
    async (champ) => {
      const siren = unSiren();
      const d = demande(await apporteur('signe'), siren);
      const e = await refus(
        deposer(
          base.prisma,
          { ...d, saisie: { ...d.saisie, contact: { ...d.saisie.contact, [champ]: '  ' } } },
          PORTS
        )
      );
      expect(e).toBeInstanceOf(ErreurSaisieDepot);
      expect((e as ErreurSaisieDepot).champs).toEqual([champ]);
      expect(await base.prisma.attribution.count({ where: { siren } })).toBe(0);
    }
  );

  it('REQ-JUR-008 : face ROUGE — un courriel ou un téléphone mal formés sont refusés, nommés', async () => {
    const d = demande(await apporteur('signe'), unSiren());
    const e = await refus(
      deposer(
        base.prisma,
        {
          ...d,
          saisie: {
            ...d.saisie,
            contact: { ...d.saisie.contact, email: 'pas-une-adresse', telephone: '12' },
          },
        },
        PORTS
      )
    );
    expect((e as ErreurSaisieDepot).champs).toEqual(['email', 'telephone']);
  });

  it('REQ-JUR-008 : face ROUGE — la case d’information des tiers non cochée : refus nommé', async () => {
    const d = demande(await apporteur('signe'), unSiren());
    const e = await refus(
      deposerOuEchouer(
        base.prisma,
        { ...d, saisie: { ...d.saisie, informationTiersCochee: false } },
        PORTS
      )
    );
    expect((e as ErreurSaisieDepot).champs).toEqual(['informationTiers']);
  });

  it('REQ-CPL-008 : un dépôt enregistré : contact chiffré, empreintes posées, version de l’information des tiers, une demande', async () => {
    const siren = unSiren();
    const a = await apporteur('signe');
    const r = await deposerOuEchouer(base.prisma, demande(a, siren), PORTS);
    expect(r.issue).toBe('enregistree');
    const l = await base.prisma.attribution.findUniqueOrThrow({ where: { id: r.attributionId! } });
    expect(l.apporteurId).toBe(a);
    expect(l.canal).toBe('espace');
    // La version est l'empreinte du texte de la case, recalculée ici hors du code.
    expect(l.informationTiersVersion).toBe(
      createHash('sha256').update(CASE_INFORMATION_TIERS).digest('hex').slice(0, 32)
    );
    expect(l.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(l.phoneHash).toMatch(/^[0-9a-f]{64}$/);
    expect(l.nomContactChiffre).not.toBeNull();
    expect(Buffer.from(l.emailChiffre!).toString('utf8')).not.toContain('camille');
    expect(l.grilleCommissionId).not.toBeNull();
    expect(await demandes(siren)).toBe(1);
    const evenements = await base.prisma.evenement.count({
      where: {
        agregat: 'attribution',
        agregatId: r.attributionId!,
        type: 'attribution_etat_modifie',
      },
    });
    expect(evenements).toBe(1);
  });
});

describe('REQ-SEC-022 — le refus est notifié (`refus_declaration`)', () => {
  function portsQuiNotifient() {
    const envois: { apporteurId: string; demande: DemandeDeNotification }[] = [];
    const courriels: { gabarit: string; apporteurId: string; a: string; sujet: string }[] = [];
    const ports: PortsDuDepot = {
      ...PORTS,
      adresseDe: async (id) => `adresse-de-${id.slice(0, 8)}@example.org`,
      notifier: async (apporteurId, demande) => {
        envois.push({ apporteurId, demande });
        return notifier(demande, {
          acces: forApporteur(base.prisma, apporteurId),
          urlDeLEspace: new URL('https://partners.exemple.invalid'),
          envoyerCourriel: async (d) => {
            courriels.push({
              gabarit: d.gabarit,
              apporteurId: d.apporteurId ?? '',
              a: d.a,
              sujet: d.sujet,
            });
            return 'retenu_dmarc_non_verifie';
          },
        });
      },
    };
    return { ports, envois, courriels };
  }

  it('REQ-SEC-022 : TÉMOIN — un refus de catégorie : la clé part UNE fois, au bon apporteur, dans l’espace et par courriel', async () => {
    const siren = unSiren();
    await base.prisma.entrepriseConnue.create({
      data: { siren, origine: 'client', connueDepuisAt: T0, dernierContactAt: T0 },
    });
    const a = await apporteur('signe');
    const autre = await apporteur('signe');
    const { ports, courriels } = portsQuiNotifient();
    await deposerOuEchouer(base.prisma, demande(a, siren), ports);
    const notifications = await base.prisma.notificationEspace.findMany({
      where: { cle: 'refus_declaration', apporteurId: { in: [a, autre] } },
      select: { apporteurId: true, attributionId: true },
    });
    expect(notifications).toEqual([{ apporteurId: a, attributionId: null }]);
    expect(courriels).toEqual([
      {
        gabarit: 'refus_declaration',
        apporteurId: a,
        a: `adresse-de-${a.slice(0, 8)}@example.org`,
        sujet:
          'Entreprise Témoin SAS : dépôt non enregistré — entreprise déjà connue de la Société',
      },
    ]);
  });

  it('REQ-SEC-022 : les deux antériorités envoient les MÊMES paramètres ; aucun ne dit le critère', async () => {
    const cliente = unSiren();
    const devis = unSiren();
    await base.prisma.entrepriseConnue.create({
      data: { siren: cliente, origine: 'client', connueDepuisAt: T0, dernierContactAt: T0 },
    });
    await base.prisma.devisConnu.create({
      data: { devisRef: `D-${hex(4)}`, siren: devis, emisAt: T0, montantTotalHtCents: 100_000 },
    });
    const a = await apporteur('signe');
    const { ports, envois } = portsQuiNotifient();
    await deposerOuEchouer(base.prisma, demande(a, cliente), ports);
    await deposerOuEchouer(base.prisma, demande(a, devis), ports);
    expect(envois).toHaveLength(2);
    expect(JSON.stringify(envois[0]?.demande)).toBe(JSON.stringify(envois[1]?.demande));
    expect(JSON.stringify(envois[0]?.demande.parametres)).not.toMatch(/client|devis|factur|sign/i);
  });

  it('REQ-SEC-022 : un dépôt enregistré, en file ou `gele` ne notifie aucun refus', async () => {
    const siren = unSiren();
    const { ports, envois } = portsQuiNotifient();
    await deposerOuEchouer(base.prisma, demande(await apporteur('signe'), siren), ports);
    await deposerOuEchouer(base.prisma, demande(await apporteur('signe'), siren), ports);
    await deposerOuEchouer(base.prisma, demande(await apporteur('suspendu'), unSiren()), ports);
    expect(envois).toEqual([]);
  });
});

describe('REQ-DM-010 — un captcha résolu ne refuse aucun dépôt', () => {
  it('REQ-DM-010 : défi résolu → le dépôt est enregistré, comme sans défi', async () => {
    const siren = unSiren();
    const r = await deposerOuEchouer(
      base.prisma,
      { ...demande(await apporteur('signe'), siren), reponseCaptcha: 'reponse-du-defi' },
      { ...PORTS, captcha: async (_ip, reponse) => (reponse === null ? 'a_presenter' : 'resolu') }
    );
    expect(r.issue).toBe('enregistree');
    expect(await base.prisma.attribution.count({ where: { siren } })).toBe(1);
  });
});

describe('REQ-UX-039 — le lien d’intérêt déclaré ne change jamais l’issue', () => {
  it('REQ-UX-039 : case cochée ou non, la déclaration est enregistrée, même réponse hors son identifiant ; le lien est conservé', async () => {
    const coche = unSiren();
    const decoche = unSiren();
    const a = await apporteur('signe');
    const avecLien = demande(a, coche);
    const rc = await deposerOuEchouer(
      base.prisma,
      { ...avecLien, saisie: { ...avecLien.saisie, lienInteretDeclare: true } },
      PORTS
    );
    const rd = await deposerOuEchouer(base.prisma, demande(a, decoche), PORTS);
    expect(rc.issue).toBe('enregistree');
    expect(JSON.stringify({ ...rc, attributionId: null })).toBe(
      JSON.stringify({ ...rd, attributionId: null })
    );
    expect((await lignes(coche)).map((l) => [l.statut, l.lienInteretDeclare])).toEqual([
      ['provisoire', true],
    ]);
    expect((await lignes(decoche)).map((l) => [l.statut, l.lienInteretDeclare])).toEqual([
      ['provisoire', false],
    ]);
    expect(
      await base.prisma.depotRefuse.count({ where: { siren: { in: [coche, decoche] } } })
    ).toBe(0);
  });
});

describe('REQ-SEC-022 — le dépôt et la projection se sérialisent sur un SIREN (rattrapage 107)', () => {
  it('REQ-SEC-022 : TÉMOIN — un dépôt ATTEND une projection `client_cree` en cours, et la lit APRÈS elle', async () => {
    const siren = unSiren();
    const a = await apporteur('signe');

    // Une « projection » tient le verrou du SIREN et y écrit le client, sans encore valider.
    let relacher!: () => void;
    const tenu = new Promise<void>((r) => (relacher = r));
    let signaler!: () => void;
    const pris = new Promise<void>((r) => (signaler = r));
    const projection = base.prisma.$transaction(
      async (tx) => {
        await verrouillerLesSirens(tx, [siren]);
        await tx.entrepriseConnue.create({
          data: { siren, origine: 'client', connueDepuisAt: T0, dernierContactAt: T0 },
        });
        signaler();
        await tenu;
      },
      { timeout: 30_000 }
    );
    await pris;

    let fini = false;
    const depot = deposerOuEchouer(base.prisma, demande(a, siren), PORTS).then((r) => {
      fini = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(fini).toBe(false);

    relacher();
    await projection;
    // Lue APRÈS la projection : la cliente est refusée ; lue avant, elle aurait occupé le SIREN.
    expect(await depot).toEqual({ issue: 'anteriorite_client', attributionId: null });
    expect(await base.prisma.attribution.count({ where: { siren } })).toBe(0);
  });
});
