// @req REQ-INT-022
/**
 * `emetteur.spec.ts` — l'émetteur de courriels de Partners (INT-T10), sans base ni relais réel.
 *
 * TÉMOIN À DEUX FACES (acceptance 4), compté en APPELS AU RELAIS, jamais au statut rendu seul :
 * drapeau DMARC faux → AUCUN appel, et la demande est RETENUE et VISIBLE (`retenu_dmarc_non_verifie`) ;
 * drapeau vrai et relais simulé → EXACTEMENT un appel, et la ligne `envoye` porte la date qui fait
 * courir un délai. Une adresse supprimée n'appelle jamais le relais (`retenu_adresse_supprimee`).
 *
 * L'expéditeur est une ADRESSE HUMAINE du domaine d'envoi (REQ-INT-022) : une adresse sans réponse,
 * ou d'un autre domaine, fait refuser la configuration. Aucun domaine réel n'est écrit ici : les
 * domaines de test sont sous `.test` (RFC 2606).
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, empreinteRecherche } from '../../../src/server/securite/pii';
import { GABARITS } from '../../../src/server/notifications/table-ssot';
import {
  ConfigurationRefusee,
  DemandeRefusee,
  configurationDeLEmetteur,
  demanderEnvoi,
  type DemandeDEnvoi,
  type DependancesDeLEmetteur,
  type DepotDesCourriels,
  type LigneCourriel,
  type Relais,
} from '../../../src/server/integrations/zeptomail/emetteur';

const DOMAINE = 'envoi.partners.test';
const INSTANT = new Date('2026-09-26T10:00:00.000Z');

function secrets(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  return env;
}

/** La configuration de l'émetteur : chaque variable que le test fait varier est EXPLICITE (RM-11). */
function environnement(expediteur: string | undefined, drapeau: string | undefined) {
  const env: Record<string, string> = secrets();
  if (expediteur !== undefined) env.PARTNERS_EMAIL_EXPEDITEUR = expediteur;
  if (drapeau !== undefined) env.PARTNERS_EMAIL_DMARC_VERIFIE = drapeau;
  return env;
}

function relaisSimule(): Relais & { appels: Parameters<Relais['envoyer']>[0][] } {
  const appels: Parameters<Relais['envoyer']>[0][] = [];
  return {
    appels,
    async envoyer(m) {
      appels.push(m);
      return { messageId: `msg-${appels.length}` };
    },
  };
}

function depotEnMemoire(
  supprimees: readonly string[]
): DepotDesCourriels & { lignes: LigneCourriel[] } {
  const lignes: LigneCourriel[] = [];
  return {
    lignes,
    async estSupprimee(emailHash) {
      return supprimees.includes(emailHash);
    },
    async consigner(l) {
      lignes.push(l);
    },
  };
}

const GABARIT = Object.keys(GABARITS)[0]!;

function banc(drapeau: string | undefined, supprimees: readonly string[] = []) {
  const env = environnement(`camille@${DOMAINE}`, drapeau);
  const cles = clesPii(env);
  const relais = relaisSimule();
  const depot = depotEnMemoire(supprimees.map((a) => empreinteRecherche('courriel', a, cles)));
  let n = 0;
  const d: DependancesDeLEmetteur = {
    configuration: configurationDeLEmetteur(env, DOMAINE),
    relais,
    depot,
    cles,
    maintenant: () => INSTANT,
    nouvelId: () => `00000000-0000-4000-8000-00000000000${++n}`,
  };
  return { env, cles, relais, depot, d };
}

const demande = (a: string): DemandeDEnvoi => ({
  gabarit: GABARIT,
  a,
  sujet: 'Votre lien de connexion',
  corps: 'Bonjour,\n\nVoici votre lien.',
  apporteurId: null,
});

describe('REQ-INT-022 — l’envoi automatique n’existe que si le drapeau DMARC vaut vrai', () => {
  it('REQ-INT-022 : face ROUGE — drapeau faux : AUCUN appel au relais, la demande est retenue et visible', async () => {
    const b = banc('false');
    const statut = await demanderEnvoi(demande('destinataire@exemple.test'), b.d);
    expect(b.relais.appels).toHaveLength(0);
    expect(statut).toBe('retenu_dmarc_non_verifie');
    expect(b.depot.lignes.map((l) => [l.statut, l.envoyeAt])).toEqual([
      ['retenu_dmarc_non_verifie', null],
    ]);
  });

  it('REQ-INT-022 : drapeau ABSENT : même refus — le défaut est fermé', async () => {
    const b = banc(undefined);
    await demanderEnvoi(demande('destinataire@exemple.test'), b.d);
    expect(b.relais.appels).toHaveLength(0);
    expect(b.depot.lignes[0]!.statut).toBe('retenu_dmarc_non_verifie');
  });

  it('REQ-INT-022 : face VERTE — drapeau vrai et relais simulé : EXACTEMENT un appel, et la ligne `envoye` porte sa date d’envoi', async () => {
    const b = banc('true');
    const statut = await demanderEnvoi(demande('Destinataire@Exemple.test'), b.d);
    expect(b.relais.appels).toHaveLength(1);
    expect(statut).toBe('envoye');
    const l = b.depot.lignes[0]!;
    expect(b.relais.appels[0]).toEqual({
      de: `camille@${DOMAINE}`,
      a: 'Destinataire@Exemple.test',
      sujet: 'Votre lien de connexion',
      corps: 'Bonjour,\n\nVoici votre lien.',
      reference: l.id,
    });
    expect(l).toEqual({
      id: l.id,
      gabarit: GABARIT,
      emailHash: empreinteRecherche('courriel', 'destinataire@exemple.test', b.cles),
      apporteurId: null,
      statut: 'envoye',
      demandeAt: INSTANT,
      envoyeAt: INSTANT,
      fournisseurMessageId: 'msg-1',
      erreur: null,
    });
  });

  it('REQ-INT-022 : aucune adresse ni aucun corps n’entrent dans la ligne consignée', async () => {
    const b = banc('true');
    await demanderEnvoi(demande('destinataire@exemple.test'), b.d);
    const texte = JSON.stringify(b.depot.lignes);
    expect(texte).not.toContain('destinataire');
    expect(texte).not.toContain('Voici votre lien');
  });
});

describe('REQ-INT-022 — une adresse supprimée est RETENUE et VISIBLE, jamais jetée en silence', () => {
  it('REQ-INT-022 : drapeau vrai, adresse supprimée : AUCUN appel, une ligne `retenu_adresse_supprimee`', async () => {
    const b = banc('true', ['perdue@exemple.test']);
    const statut = await demanderEnvoi(demande('PERDUE@exemple.test'), b.d);
    expect(b.relais.appels).toHaveLength(0);
    expect(statut).toBe('retenu_adresse_supprimee');
    expect(b.depot.lignes.map((l) => l.statut)).toEqual(['retenu_adresse_supprimee']);
  });

  it('REQ-INT-022 : la suppression prime sur le drapeau — drapeau faux, adresse supprimée : `retenu_adresse_supprimee`', async () => {
    const b = banc('false', ['perdue@exemple.test']);
    expect(await demanderEnvoi(demande('perdue@exemple.test'), b.d)).toBe(
      'retenu_adresse_supprimee'
    );
  });

  it('REQ-INT-022 : un relais qui lève laisse une ligne `echec`, un code fermé, et aucune date d’envoi', async () => {
    const b = banc('true');
    b.d.relais = {
      envoyer: async () => {
        throw new Error('réponse du relais qui citerait destinataire@exemple.test');
      },
    };
    expect(await demanderEnvoi(demande('destinataire@exemple.test'), b.d)).toBe('echec');
    expect(b.depot.lignes.map((l) => [l.statut, l.erreur, l.envoyeAt])).toEqual([
      ['echec', 'relais_en_echec', null],
    ]);
  });
});

describe('REQ-INT-022 — une demande hors forme est refusée AVANT tout appel et toute écriture', () => {
  const cas: ReadonlyArray<readonly [string, Partial<ReturnType<typeof demande>>, string]> = [
    [
      'un destinataire qui porte un saut de ligne (en-tête injecté)',
      { a: 'x@exemple.test\r\nBcc: autre@exemple.test' },
      'destinataire_invalide',
    ],
    ['deux destinataires', { a: 'x@exemple.test, y@exemple.test' }, 'destinataire_invalide'],
    [
      'un sujet qui porte un saut de ligne (en-tête injecté)',
      { sujet: 'Bonjour\r\nBcc: autre@exemple.test' },
      'sujet_invalide',
    ],
    ['un sujet vide', { sujet: '' }, 'sujet_invalide'],
    [
      'un gabarit hors de la table des notifications',
      { gabarit: 'gabarit_inconnu' },
      'gabarit_inconnu',
    ],
    ['un apporteur qui n’est pas un uuid', { apporteurId: 'apporteur-1' }, 'apporteur_invalide'],
  ];
  for (const [quoi, champ, motif] of cas) {
    it(`REQ-INT-022 : ${quoi} → refus \`${motif}\`, aucun appel, aucune ligne`, async () => {
      const b = banc('true');
      const promesse = demanderEnvoi({ ...demande('destinataire@exemple.test'), ...champ }, b.d);
      await expect(promesse).rejects.toBeInstanceOf(DemandeRefusee);
      await expect(promesse).rejects.toMatchObject({ motif });
      expect(b.relais.appels).toHaveLength(0);
      expect(b.depot.lignes).toHaveLength(0);
    });
  }
});

describe('REQ-INT-022 — l’expéditeur est une ADRESSE HUMAINE du domaine d’envoi', () => {
  it('REQ-INT-022 : une adresse humaine du domaine d’envoi est acceptée, le drapeau lu tel quel', () => {
    expect(configurationDeLEmetteur(environnement(`camille@${DOMAINE}`, 'true'), DOMAINE)).toEqual({
      expediteur: `camille@${DOMAINE}`,
      dmarcVerifie: true,
    });
    expect(
      configurationDeLEmetteur(environnement(`camille@${DOMAINE}`, 'false'), DOMAINE).dmarcVerifie
    ).toBe(false);
  });

  const refus: ReadonlyArray<readonly [string, string | undefined, string, string]> = [
    ['une adresse de non-réponse', `noreply@${DOMAINE}`, DOMAINE, 'expediteur_sans_reponse'],
    [
      'une adresse de non-réponse à tiret',
      `no-reply@${DOMAINE}`,
      DOMAINE,
      'expediteur_sans_reponse',
    ],
    [
      'une adresse « ne pas répondre »',
      `ne-pas-repondre@${DOMAINE}`,
      DOMAINE,
      'expediteur_sans_reponse',
    ],
    ['une adresse « do not reply »', `Do.Not.Reply@${DOMAINE}`, DOMAINE, 'expediteur_sans_reponse'],
    ['une adresse d’un autre domaine', 'camille@autre.test', DOMAINE, 'domaine_different'],
    [
      'un domaine d’envoi non renseigné au registre',
      `camille@${DOMAINE}`,
      'A-RENSEIGNER',
      'domaine_non_renseigne',
    ],
    ['un expéditeur absent', undefined, DOMAINE, 'expediteur_absent'],
    ['un expéditeur illisible', 'camille', DOMAINE, 'expediteur_illisible'],
  ];
  for (const [quoi, expediteur, domaine, motif] of refus) {
    it(`REQ-INT-022 : ${quoi} fait refuser la configuration (\`${motif}\`)`, () => {
      const lire = () => configurationDeLEmetteur(environnement(expediteur, 'true'), domaine);
      expect(lire).toThrow(ConfigurationRefusee);
      expect(lire).toThrow(motif);
    });
  }

  it('REQ-INT-022 : la table des notifications ne porte que des clés de la forme de la colonne `gabarit`', () => {
    const cles = Object.keys(GABARITS);
    expect(cles.length).toBeGreaterThan(0);
    for (const c of cles) expect(c).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
