// @req REQ-SEC-001
// @req REQ-SEC-002
// @req REQ-SEC-016
/**
 * `lien-magique-indistinction.spec.ts` — le lien magique de connexion, sur ports simulés (SEC-03).
 *
 * CE QU'IL PROUVE, ET PAR QUEL INSTRUMENT.
 *   1. L'INDISTINCTION se prouve par la TRACE des appels faits avant la réponse, jamais par une
 *      durée : une même saisie est soumise à deux univers, l'un où le compte existe, l'autre où il
 *      n'existe pas. Réponse et trace sont comparées octet à octet (JSON canonique), et la trace
 *      avant réponse ne doit toucher AUCUN port qui dépend du compte. Face 2 : une variante qui
 *      cherche le compte avant de répondre, et une réponse altérée d'une espace, font rougir le
 *      même instrument.
 *   2. LA CONSOMMATION est unique parce que conditionnelle et atomique : le témoin COMPTE les
 *      sessions ouvertes, séquentiellement puis sous dix consommations concurrentes. Face 2 : une
 *      variante qui lit puis écrit en ouvre plusieurs.
 *   3. L'ÉMISSION : empreinte HMAC seule en dépôt, URL bâtie sur l'adresse publique configurée,
 *      envoi à l'adresse STOCKÉE, un seul lien actif par apporteur.
 *
 * Les courriels sont en `example.org` ; secrets et jetons sont tirés à l'exécution.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMPTEURS } from '../../../src/server/securite/rate-limit';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  consommerLien,
  demanderLien,
  empreinteDeSession,
  empreinteDuJeton,
  type ConditionDeConsommation,
  type ConfigurationDuLien,
  type EtatDeDemande,
  type PortsDeConsommation,
  type PortsDeDemande,
} from '../../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../../src/server/auth/durees';

// ── l'univers simulé ─────────────────────────────────────────────────────────────────────────────

interface Compte {
  id: string;
  courriel: string;
  statut: string;
}

interface LigneLien {
  id: string;
  apporteurId: string;
  tokenHash: string;
  kid: string;
  creeAt: Date;
  expireAt: Date;
  consommeAt: Date | null;
  annuleAt: Date | null;
}

interface LigneSession {
  apporteurId: string;
  lienMagiqueId: string;
  tokenHash: string;
  kid: string;
  ipHash: string | null;
  creeAt: Date;
  expireAt: Date;
}

/**
 * Les limites de REQ-SEC-002 viennent du REGISTRE des compteurs (`COMPTEURS`), jamais d'un
 * littéral : le simulacre compte avec elles, et les boucles des témoins les lisent. Le registre est
 * lui-même confronté au TEXTE de l'exigence, lu dans `docs/requirements.json` : une limite changée
 * d'un côté seulement fait rougir le témoin du registre.
 */
type CompteurDuLien = 'magic:ip' | 'magic:courriel';
const LIMITE = (nom: CompteurDuLien): number => {
  const { limite } = COMPTEURS[nom];
  if (typeof limite !== 'number') throw new Error(`${nom} : limite hors dépôt`);
  return limite;
};
const FENETRE_MS = (nom: CompteurDuLien): number => {
  const { fenetreSecondes } = COMPTEURS[nom];
  if (typeof fenetreSecondes !== 'number') throw new Error(`${nom} : fenêtre hors dépôt`);
  return fenetreSecondes * 1000;
};
const TEXTE_REQ_SEC_002 = (
  JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
    exigences: Array<{ id: string; texte: string }>;
  }
).exigences.find((r) => r.id === 'REQ-SEC-002')?.texte;

const CLE_EMPREINTES = randomBytes(32).toString('hex');
const SEL_ADRESSES = randomBytes(32).toString('hex');
const URL_PUBLIQUE = 'https://partners.example.org';

/** Même règle que la normalisation du courriel de la couche des données personnelles. */
const empreinteCourrielSimulee = (saisie: string): string | null => {
  const normalise = saisie.trim().normalize('NFC').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normalise)) return null;
  return createHmac('sha256', CLE_EMPREINTES).update(`courriel\u001f${normalise}`).digest('hex');
};

/** Interprète la condition PORTÉE PAR LE CODE, champ par champ ; un opérateur inconnu lève. */
function correspond(ligne: LigneLien, condition: ConditionDeConsommation): boolean {
  return Object.entries(condition).every(([champ, attendu]) => {
    const valeur = ligne[champ as keyof LigneLien];
    if (attendu === null) return valeur === null;
    if (typeof attendu === 'string') return valeur === attendu;
    const date = valeur instanceof Date ? valeur.getTime() : NaN;
    const operateurs = Object.entries(attendu as Record<string, Date>);
    return operateurs.every(([op, borne]) => {
      if (op === 'gt') return date > borne.getTime();
      if (op === 'gte') return date >= borne.getTime();
      throw new Error(`opérateur non simulé : ${op}`);
    });
  });
}

interface Options {
  comptes?: Compte[];
  instant?: number;
  adresse?: string | null;
  limiteEnPanne?: boolean;
  limiteQuiLeve?: boolean;
  envoiQuiLeve?: boolean;
}

function univers(o: Options = {}) {
  const horloge = { t: o.instant ?? Date.UTC(2026, 8, 19, 8, 0, 0) };
  // Copie PROFONDE : un test qui change un statut ne doit pas le changer pour les suivants.
  const comptes = (o.comptes ?? []).map((c) => ({ ...c }));
  const trace: string[] = [];
  const differe: Array<() => Promise<void>> = [];
  const liens: LigneLien[] = [];
  const sessions: LigneSession[] = [];
  const envois: Array<{ a: string; url: string; expireAt: Date }> = [];
  const signalements: unknown[] = [];
  const journal: string[] = [];
  const compteurs = new Map<string, number[]>();
  let appelsDepot = 0;
  let suivant = 0;

  const noter = (nom: string, ...args: unknown[]) => trace.push(`${nom} ${canonique(args)}`);
  const secretLien = randomBytes(32).toString('hex');
  const configuration: ConfigurationDuLien = {
    secret: secretLien,
    kid: randomBytes(4).toString('hex'),
    urlPublique: URL_PUBLIQUE,
    session: { secret: randomBytes(32).toString('hex'), kid: randomBytes(4).toString('hex') },
  };

  /** Les deux compteurs de REQ-SEC-002, simulés ; la trace les nomme comme le registre. */
  const compter = async (nom: CompteurDuLien, sujet: string, maintenantMs: number) => {
    noter('limiter', nom, sujet, maintenantMs);
    if (o.limiteQuiLeve) throw new Error('cache injoignable');
    if (o.limiteEnPanne) return { autorise: false, panne: true };
    const cle = `${nom}${sujet}`;
    const vus = (compteurs.get(cle) ?? []).filter((t) => t > maintenantMs - FENETRE_MS(nom));
    const autorise = vus.length < LIMITE(nom);
    if (autorise) vus.push(maintenantMs);
    compteurs.set(cle, vus);
    return { autorise, panne: false };
  };

  const demande: PortsDeDemande = {
    maintenant: () => new Date(horloge.t),
    adresseDuClient: (entetes) => {
      noter('adresseDuClient', entetes.get('x-forwarded-for'));
      return o.adresse === undefined ? '203.0.113.7' : o.adresse;
    },
    empreinteAdresseReseau: (adresse) => {
      noter('empreinteAdresseReseau', adresse);
      return createHmac('sha256', SEL_ADRESSES).update(adresse).digest('hex').slice(0, 16);
    },
    empreinteCourriel: (saisie) => {
      noter('empreinteCourriel', saisie);
      return empreinteCourrielSimulee(saisie);
    },
    compterAdresse: (sujet, maintenantMs) => compter('magic:ip', sujet, maintenantMs),
    compterCourriel: (sujet, maintenantMs) => compter('magic:courriel', sujet, maintenantMs),
    planifier: (travail) => {
      noter('planifier');
      differe.push(travail);
    },
    emission: {
      trouverApporteur: async (emailHash) => {
        noter('trouverApporteur', emailHash);
        const c = comptes.find((x) => empreinteCourrielSimulee(x.courriel) === emailHash);
        return c ? { id: c.id, statut: c.statut } : null;
      },
      adresseStockee: async (apporteurId) => {
        noter('adresseStockee', apporteurId);
        const c = comptes.find((x) => x.id === apporteurId);
        if (!c) throw new Error('compte absent');
        return c.courriel;
      },
      annulerLiensActifs: async (apporteurId, maintenant) => {
        noter('annulerLiensActifs', apporteurId);
        for (const l of liens) {
          if (l.apporteurId === apporteurId && l.consommeAt === null && l.annuleAt === null) {
            l.annuleAt = maintenant;
          }
        }
      },
      insererLien: async (lien) => {
        noter('insererLien');
        liens.push({ ...lien, id: `lien-${++suivant}`, consommeAt: null, annuleAt: null });
      },
      envoyer: async (message) => {
        noter('envoyer');
        if (o.envoiQuiLeve) throw new Error('relais injoignable');
        envois.push(message);
      },
      signalerPotDeMiel: async (signal) => {
        noter('signalerPotDeMiel');
        signalements.push(signal);
      },
      signalerEchec: (evenement) => {
        journal.push(evenement);
      },
    },
    configuration,
  };

  /** Le simulacre ne sérialise rien : deux transactions s'entrelacent à chaque `await`. */
  const consommation: PortsDeConsommation = {
    maintenant: () => new Date(horloge.t),
    configuration,
    transaction: async (travail) => {
      appelsDepot += 1;
      return travail({
        consommer: async (condition, donnees) => {
          const touchees = liens.filter((l) => correspond(l, condition));
          for (const l of touchees) l.consommeAt = donnees.consommeAt;
          return touchees.length;
        },
        lireLien: async (tokenHash) => {
          await Promise.resolve();
          const l = liens.find((x) => x.tokenHash === tokenHash);
          return l ? { id: l.id, apporteurId: l.apporteurId, kid: l.kid } : null;
        },
        statutApporteur: async (apporteurId) => {
          await Promise.resolve();
          return comptes.find((x) => x.id === apporteurId)?.statut ?? null;
        },
        ouvrirSession: async (s) => {
          await Promise.resolve();
          sessions.push({ ...s });
        },
      });
    },
  };

  return {
    horloge,
    comptes,
    trace,
    differe,
    liens,
    sessions,
    envois,
    signalements,
    journal,
    demande,
    consommation,
    configuration,
    appelsAuDepot: () => appelsDepot,
    /** Exécute le travail différé, comme `after()` le ferait une fois la réponse partie. */
    async apresLaReponse() {
      while (differe.length > 0) await differe.shift()?.();
    },
  };
}

type Univers = ReturnType<typeof univers>;

/** JSON à clés triées : deux valeurs égales s'écrivent avec les mêmes octets. */
function canonique(x: unknown): string {
  return JSON.stringify(x, (_cle, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );
}

const entetes = (xff = '203.0.113.7') =>
  new Headers({ 'x-forwarded-for': xff, host: 'evil.example' });

type Demandeur = (
  requete: { saisie: string; piege: boolean; entetes: Headers },
  ports: PortsDeDemande
) => Promise<EtatDeDemande>;

/** Ce qu'un observateur extérieur voit d'une demande : la réponse et les appels faits avant elle. */
async function observer(demandeur: Demandeur, u: Univers, saisie: string, piege = false) {
  const etat = await demandeur({ saisie, piege, entetes: entetes() }, u.demande);
  return { etat, trace: [...u.trace] };
}

const PORTS_DU_COMPTE = [
  'trouverApporteur',
  'adresseStockee',
  'annulerLiensActifs',
  'insererLien',
  'envoyer',
];

/** Le témoin d'indistinction : premier écart entre deux observations, ou `null`. */
function premierEcart(a: { etat: string; trace: string[] }, b: { etat: string; trace: string[] }) {
  if (canonique(a.etat) !== canonique(b.etat)) return `réponse différente : ${a.etat} / ${b.etat}`;
  const n = Math.max(a.trace.length, b.trace.length);
  for (let i = 0; i < n; i += 1) {
    if (a.trace[i] !== b.trace[i]) {
      return `trace avant réponse différente au ${i + 1}ᵉ appel : ${a.trace[i]} / ${b.trace[i]}`;
    }
  }
  const lu = a.trace.find((ligne) => PORTS_DU_COMPTE.some((p) => ligne.startsWith(`${p} `)));
  return lu === undefined ? null : `le compte est lu avant la réponse : ${lu}`;
}

const MARIE: Readonly<Compte> = Object.freeze({
  id: 'apporteur-marie',
  courriel: 'marie@example.org',
  statut: 'signe',
});

/** Un univers où le compte existe, un où il n'existe pas ; même saisie, même instant. */
async function deuxUnivers(demandeur: Demandeur, saisie: string, o: Options = {}) {
  const connu = univers({ ...o, comptes: [MARIE] });
  const inconnu = univers({ ...o, comptes: [] });
  const a = await observer(demandeur, connu, saisie);
  const b = await observer(demandeur, inconnu, saisie);
  return { connu, inconnu, a, b };
}

/** Émet un lien pour Marie et rend le jeton lu dans l'URL envoyée. */
async function emettrePourMarie(u: Univers): Promise<string> {
  await demanderLien({ saisie: MARIE.courriel, piege: false, entetes: entetes() }, u.demande);
  await u.apresLaReponse();
  const url = u.envois.at(-1)?.url ?? '';
  return url.slice(`${URL_PUBLIQUE}/connexion/`.length);
}

// ── 1. l'indistinction ───────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-001 REQ-SEC-002 — la demande de lien ne dépend pas de l’existence du compte', () => {
  it('REQ-SEC-001 : même réponse, même trace avant réponse, et aucun port du compte avant elle', async () => {
    const { connu, inconnu, a, b } = await deuxUnivers(demanderLien, MARIE.courriel);
    expect(premierEcart(a, b)).toBeNull();
    expect(canonique(a)).toBe(canonique(b));
    expect(a.etat).toBe('envoye');
    // Plancher : la trace a bien observé quelque chose, jusqu'à la planification.
    expect(a.trace.at(-1)).toBe('planifier []');

    await connu.apresLaReponse();
    await inconnu.apresLaReponse();
    expect(connu.envois).toHaveLength(1);
    expect(inconnu.envois).toHaveLength(0);
  });

  it('REQ-SEC-001 : un compte au statut qui ne donne pas accès répond comme un compte absent', async () => {
    const ferme = univers({ comptes: [{ ...MARIE, statut: 'kyc_en_cours' }] });
    const absent = univers({ comptes: [] });
    const a = await observer(demanderLien, ferme, MARIE.courriel);
    const b = await observer(demanderLien, absent, MARIE.courriel);
    expect(premierEcart(a, b)).toBeNull();
    await ferme.apresLaReponse();
    expect(ferme.envois).toHaveLength(0);
    expect(ferme.liens).toHaveLength(0);
  });

  it('REQ-SEC-001 face 2 : une demande qui cherche le compte avant de répondre fait rougir le témoin', async () => {
    const fautive: Demandeur = async (requete, ports) => {
      const empreinte = ports.empreinteCourriel(requete.saisie) ?? '';
      const compte = await ports.emission.trouverApporteur(empreinte);
      if (compte) ports.planifier(async () => undefined);
      return 'envoye';
    };
    const { a, b } = await deuxUnivers(fautive, MARIE.courriel);
    expect(premierEcart(a, b)).toMatch(/^trace avant réponse différente au 3ᵉ appel/);

    // Même recherche faite des deux côtés : les traces sont égales, et c'est la lecture du compte
    // AVANT la réponse qui rougit.
    const egaleMaisFautive: Demandeur = async (requete, ports) => {
      await ports.emission.trouverApporteur(ports.empreinteCourriel(requete.saisie) ?? '');
      return 'envoye';
    };
    const deux = await deuxUnivers(egaleMaisFautive, MARIE.courriel);
    expect(premierEcart(deux.a, deux.b)).toMatch(/^le compte est lu avant la réponse/);
  });

  it('REQ-SEC-001 face 2 : une espace de plus dans la réponse du cas inconnu est une différence', async () => {
    const { a, b } = await deuxUnivers(demanderLien, MARIE.courriel);
    const altere = { ...b, etat: `${b.etat} ` };
    expect(premierEcart(a, altere)).toBe('réponse différente : envoye / envoye ');
    expect(canonique(a)).not.toBe(canonique(altere));
  });

  it('REQ-SEC-001 : une saisie hors forme répond `adresse_invalide`, compte ou non, après la limite réseau', async () => {
    const { a, b } = await deuxUnivers(demanderLien, 'marie-example.org');
    expect(premierEcart(a, b)).toBeNull();
    expect(a.etat).toBe('adresse_invalide');
    expect(a.trace.some((l) => l.startsWith('limiter ["magic:ip"'))).toBe(true);
    expect(a.trace.some((l) => l.startsWith('limiter ["magic:courriel"'))).toBe(false);
    expect(a.trace.some((l) => l.startsWith('planifier'))).toBe(false);
  });

  it('REQ-SEC-001 : le champ piège fait la même réponse et la même trace, et ne signale qu’après', async () => {
    const nominal = univers({ comptes: [MARIE] });
    const piege = univers({ comptes: [MARIE] });
    const a = await observer(demanderLien, nominal, MARIE.courriel);
    const b = await observer(demanderLien, piege, MARIE.courriel, true);
    expect(premierEcart(a, b)).toBeNull();
    await piege.apresLaReponse();
    expect(piege.liens).toHaveLength(0);
    expect(piege.envois).toHaveLength(0);
    expect(piege.signalements).toHaveLength(1);
    expect(canonique(piege.signalements)).not.toContain('marie');
  });
});

// ── 2. les limites ───────────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-002 REQ-SEC-016 — limites par adresse réseau et par courriel, refus sur panne', () => {
  it('REQ-SEC-002 : le registre porte les limites du texte de l’exigence, refus sur panne', () => {
    expect(TEXTE_REQ_SEC_002).toBeDefined();
    const lire = (motif: RegExp): { limite: number; fenetreSecondes: number } => {
      const m = motif.exec(TEXTE_REQ_SEC_002 ?? '');
      if (!m) throw new Error(`motif absent du texte de REQ-SEC-002 : ${motif}`);
      return { limite: Number(m[1]), fenetreSecondes: Number(m[2]) * 60 };
    };
    expect(COMPTEURS['magic:ip']).toMatchObject({
      ...lire(/(\d+) \/ (\d+) min par hash IP/),
      surPanne: 'refuser',
    });
    expect(COMPTEURS['magic:courriel']).toMatchObject({
      ...lire(/(\d+) \/ (\d+) min par email/),
      surPanne: 'refuser',
    });
  });

  it('REQ-SEC-002 : la demande au-delà de la limite réseau du registre est suspendue, compte ou non', async () => {
    for (const comptes of [[MARIE], []]) {
      const u = univers({ comptes });
      const etats: EtatDeDemande[] = [];
      for (let i = 0; i <= LIMITE('magic:ip'); i += 1) {
        etats.push(
          await demanderLien(
            { saisie: `personne${i}@example.org`, piege: false, entetes: entetes() },
            u.demande
          )
        );
      }
      expect(etats.slice(0, LIMITE('magic:ip')).every((e) => e === 'envoye')).toBe(true);
      expect(etats[LIMITE('magic:ip')]).toBe('suspendu');
      expect(u.differe).toHaveLength(LIMITE('magic:ip'));
    }
  });

  it('REQ-SEC-002 : la demande au-delà de la limite par courriel est suspendue, compte ou non, depuis autant d’adresses', async () => {
    const reponses: string[] = [];
    for (const comptes of [[MARIE], []]) {
      const u = univers({ comptes });
      const etats: EtatDeDemande[] = [];
      for (let i = 0; i <= LIMITE('magic:courriel'); i += 1) {
        u.demande.adresseDuClient = () => `198.51.100.${i + 1}`;
        etats.push(
          await demanderLien(
            { saisie: MARIE.courriel, piege: false, entetes: entetes() },
            u.demande
          )
        );
      }
      expect(etats.slice(0, LIMITE('magic:courriel')).every((e) => e === 'envoye')).toBe(true);
      expect(etats[LIMITE('magic:courriel')]).toBe('suspendu');
      reponses.push(canonique({ etats, trace: u.trace }));
    }
    expect(reponses[0]).toBe(reponses[1]);
  });

  it('REQ-SEC-016 : un compteur en panne refuse — `indisponible`, compte ou non, rien de planifié', async () => {
    const { a, b } = await deuxUnivers(demanderLien, MARIE.courriel, { limiteEnPanne: true });
    expect(premierEcart(a, b)).toBeNull();
    expect(a.etat).toBe('indisponible');
    expect(a.trace.some((l) => l.startsWith('planifier'))).toBe(false);
  });

  it('REQ-SEC-016 : un cache qui lève refuse aussi — `indisponible`, compte ou non', async () => {
    const { a, b } = await deuxUnivers(demanderLien, MARIE.courriel, { limiteQuiLeve: true });
    expect(premierEcart(a, b)).toBeNull();
    expect(a.etat).toBe('indisponible');
  });

  it('REQ-SEC-016 : une adresse réseau illisible est une panne, jamais un seau commun', async () => {
    const { a, b } = await deuxUnivers(demanderLien, MARIE.courriel, { adresse: null });
    expect(premierEcart(a, b)).toBeNull();
    expect(a.etat).toBe('indisponible');
    expect(a.trace.some((l) => l.startsWith('limiter'))).toBe(false);
  });
});

// ── 3. l'émission ────────────────────────────────────────────────────────────────────────────────

/**
 * Le VECTEUR FIGÉ de la décision 14 de partners/ADR-0013 : une clé de test publique (ce n'est pas
 * un secret, elle ne sert qu'ici), le jeton de 32 octets nuls, et l'empreinte attendue ÉCRITE EN
 * DUR. Un changement de domaine, de séparateur, d'algorithme ou d'encodage la fait rougir.
 */
const VECTEUR_LIEN = {
  cle: 'partners-vecteur-fige-du-lien-magique-v1-aucun-secret-reel',
  jeton: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  empreinte: '1a39916cb2e5c2440314c66bbe84b98eb54d2d07441b6035ba2c849020cddf36',
} as const;

describe('REQ-SEC-001 — le vecteur figé de l’empreinte de lien (partners/ADR-0013, décision 14)', () => {
  it('REQ-SEC-001 : HMAC-SHA-256, domaine partners.lien.v1 et U+001F, 64 hex minuscules', () => {
    expect(empreinteDuJeton(VECTEUR_LIEN.jeton, VECTEUR_LIEN.cle)).toBe(VECTEUR_LIEN.empreinte);
    // Face 2 : le même jeton sous le domaine de la session ne donne pas l'empreinte du lien.
    expect(empreinteDeSession(VECTEUR_LIEN.jeton, VECTEUR_LIEN.cle)).not.toBe(
      VECTEUR_LIEN.empreinte
    );
  });
});

describe('REQ-SEC-001 — l’émission du lien, après la réponse', () => {
  it('REQ-SEC-001 : seul le HMAC du jeton est stocké ; 15 minutes ; `kid` de la clé sur la ligne', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = await emettrePourMarie(u);
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(u.liens).toHaveLength(1);
    const ligne = u.liens[0] as LigneLien;
    expect(canonique(u.liens)).not.toContain(jeton);
    const attendue = createHmac('sha256', u.configuration.secret)
      .update(`partners.lien.v1\u001f${jeton}`, 'utf8')
      .digest('hex');
    expect(ligne.tokenHash).toBe(attendue);
    expect(empreinteDuJeton(jeton, u.configuration.secret)).toBe(attendue);
    expect(ligne.kid).toBe(u.configuration.kid);
    expect(ligne.expireAt.getTime() - ligne.creeAt.getTime()).toBe(15 * 60 * 1000);
    expect(DUREES_AUTH.lienMagiqueMs.source).toBe('REQ-SEC-001');
    // La table des liens ne porte pas d'adresse réseau : c'est la session qui la garde.
    expect(Object.keys(ligne).sort()).toEqual(
      [
        'annuleAt',
        'apporteurId',
        'consommeAt',
        'creeAt',
        'expireAt',
        'id',
        'kid',
        'tokenHash',
      ].sort()
    );
  });

  it('REQ-SEC-001 : l’URL part de l’adresse publique configurée, jamais de l’en-tête `Host`', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = await emettrePourMarie(u);
    expect(u.envois[0]?.url).toBe(`${URL_PUBLIQUE}/connexion/${jeton}`);
    expect(canonique(u.envois)).not.toContain('evil.example');
  });

  it('REQ-SEC-001 : le lien part à l’adresse STOCKÉE, même quand la saisie se replie sur elle', async () => {
    const u = univers({ comptes: [MARIE] });
    // U+212A (signe kelvin) : même empreinte que « k » une fois normalisé.
    const compte = { id: 'apporteur-kim', courriel: 'kim@example.org', statut: 'signe' };
    u.comptes.push(compte);
    const saisie = 'Kim@example.org';
    expect(empreinteCourrielSimulee(saisie)).toBe(empreinteCourrielSimulee(compte.courriel));
    await demanderLien({ saisie, piege: false, entetes: entetes() }, u.demande);
    await u.apresLaReponse();
    expect(u.envois.map((e) => e.a)).toEqual(['kim@example.org']);
  });

  it('REQ-SEC-001 : émettre un lien annule le précédent, qui ne s’ouvre plus', async () => {
    const u = univers({ comptes: [MARIE] });
    const ancien = await emettrePourMarie(u);
    const recent = await emettrePourMarie(u);
    expect(await consommerLien({ jeton: ancien, ipHash: null }, u.consommation)).toEqual({
      etat: 'lien_invalide',
    });
    expect((await consommerLien({ jeton: recent, ipHash: null }, u.consommation)).etat).toBe(
      'ouverte'
    );
    expect(u.sessions).toHaveLength(1);
  });

  it('REQ-SEC-001 : une panne après la réponse est journalisée sans donnée personnelle et ne remonte pas', async () => {
    const u = univers({ comptes: [MARIE], envoiQuiLeve: true });
    const etat = await demanderLien(
      { saisie: MARIE.courriel, piege: false, entetes: entetes() },
      u.demande
    );
    expect(etat).toBe('envoye');
    await expect(u.apresLaReponse()).resolves.toBeUndefined();
    expect(u.journal).toEqual(['travail_differe_echoue']);
  });
});

// ── 4. la consommation ───────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-001 — la consommation : unique, atomique, bornée à 15 minutes', () => {
  it('REQ-SEC-001 : un lien frais ouvre UNE session ; consommé deux fois, la seconde est refusée', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = await emettrePourMarie(u);
    const premiere = await consommerLien({ jeton, ipHash: 'a1b2c3d4e5f60718' }, u.consommation);
    expect(premiere.etat).toBe('ouverte');
    const seconde = await consommerLien({ jeton, ipHash: null }, u.consommation);
    expect(seconde).toEqual({ etat: 'lien_invalide' });
    expect(u.sessions).toHaveLength(1);
    expect(u.sessions[0]).toMatchObject({
      apporteurId: MARIE.id,
      lienMagiqueId: 'lien-1',
      ipHash: 'a1b2c3d4e5f60718',
      kid: u.configuration.session.kid,
    });
  });

  it('REQ-SEC-001 : la session ne garde que le HMAC de son jeton, sous le secret de SESSION, 30 jours', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = await emettrePourMarie(u);
    const r = await consommerLien({ jeton, ipHash: null }, u.consommation);
    if (r.etat !== 'ouverte') throw new Error(`attendu ouverte, reçu ${r.etat}`);
    expect(r.jetonSession).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const session = u.sessions[0] as LigneSession;
    expect(canonique(u.sessions)).not.toContain(r.jetonSession);
    const sous = (secret: string) =>
      createHmac('sha256', secret)
        .update(`partners.session.v1\u001f${r.jetonSession}`, 'utf8')
        .digest('hex');
    expect(session.tokenHash).toBe(sous(u.configuration.session.secret));
    expect(empreinteDeSession(r.jetonSession, u.configuration.session.secret)).toBe(
      session.tokenHash
    );
    // Face 2 : ni le secret des liens, ni le domaine des liens ne donnent cette empreinte.
    expect(session.tokenHash).not.toBe(sous(u.configuration.secret));
    expect(session.tokenHash).not.toBe(
      empreinteDuJeton(r.jetonSession, u.configuration.session.secret)
    );
    expect(session.expireAt.getTime() - session.creeAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(DUREES_AUTH.sessionMs.source).toBe('REQ-SEC-003');
  });

  it('REQ-SEC-001 : un lien stocké en SHA-256 SANS clé ne s’ouvre pas — seul le HMAC fait foi', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = randomBytes(32).toString('base64url');
    const creeAt = new Date(u.horloge.t);
    u.liens.push({
      id: 'lien-nu',
      apporteurId: MARIE.id,
      tokenHash: createHash('sha256').update(jeton, 'utf8').digest('hex'),
      kid: u.configuration.kid,
      creeAt,
      expireAt: new Date(creeAt.getTime() + 60_000),
      consommeAt: null,
      annuleAt: null,
    });
    expect(await consommerLien({ jeton, ipHash: null }, u.consommation)).toEqual({
      etat: 'lien_invalide',
    });
    expect(u.sessions).toHaveLength(0);
  });

  it('REQ-SEC-001 : dix consommations concurrentes n’ouvrent qu’UNE session', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = await emettrePourMarie(u);
    const r = await Promise.all(
      Array.from({ length: 10 }, () => consommerLien({ jeton, ipHash: null }, u.consommation))
    );
    expect(u.sessions).toHaveLength(1);
    expect(r.filter((x) => x.etat === 'lien_invalide')).toHaveLength(9);
  });

  it('REQ-SEC-001 face 2 : lire puis écrire ouvre plusieurs sessions sous concurrence', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = await emettrePourMarie(u);
    const tokenHash = empreinteDuJeton(jeton, u.configuration.secret);
    // La lecture rend un INSTANTANÉ ; l'écriture vient après l'aller-retour.
    const lirepuisEcrire = () =>
      u.consommation.transaction(async (tx) => {
        const instantane = { ...u.liens.find((l) => l.tokenHash === tokenHash) };
        const lien = await tx.lireLien(tokenHash);
        if (!lien || instantane.consommeAt !== null) return;
        await tx.consommer({ tokenHash }, { consommeAt: new Date(u.horloge.t) });
        await tx.ouvrirSession({
          apporteurId: lien.apporteurId,
          lienMagiqueId: lien.id,
          tokenHash: 'f'.repeat(64),
          kid: u.configuration.session.kid,
          ipHash: null,
          creeAt: new Date(u.horloge.t),
          expireAt: new Date(u.horloge.t + 1),
        });
      });
    await Promise.all(Array.from({ length: 10 }, lirepuisEcrire));
    expect(u.sessions.length).toBeGreaterThan(1);
  });

  it('REQ-SEC-001 : à `expireAt − 1 ms` le lien ouvre ; à `expireAt` il est refusé', async () => {
    const tot = univers({ comptes: [MARIE] });
    const jetonTot = await emettrePourMarie(tot);
    tot.horloge.t = (tot.liens[0] as LigneLien).expireAt.getTime() - 1;
    expect((await consommerLien({ jeton: jetonTot, ipHash: null }, tot.consommation)).etat).toBe(
      'ouverte'
    );

    const tard = univers({ comptes: [MARIE] });
    const jetonTard = await emettrePourMarie(tard);
    tard.horloge.t = (tard.liens[0] as LigneLien).expireAt.getTime();
    expect(await consommerLien({ jeton: jetonTard, ipHash: null }, tard.consommation)).toEqual({
      etat: 'lien_invalide',
    });
    expect(tard.sessions).toHaveLength(0);
  });

  it('REQ-SEC-001 : `kid` périmé, statut devenu `resilie`, jeton inconnu — un seul état, aucune session', async () => {
    const kid = univers({ comptes: [MARIE] });
    const jetonKid = await emettrePourMarie(kid);
    kid.consommation.configuration = { ...kid.configuration, kid: 'ffffffff' };
    const resilie = univers({ comptes: [MARIE] });
    const jetonResilie = await emettrePourMarie(resilie);
    (resilie.comptes[0] as Compte).statut = 'resilie';
    const inconnu = univers({ comptes: [MARIE] });
    await emettrePourMarie(inconnu);
    // Seul le `kid` distingue ce lien d'un lien valide : le statut est intact.
    expect(kid.comptes[0]?.statut).toBe('signe');

    const r = [
      await consommerLien({ jeton: jetonKid, ipHash: null }, kid.consommation),
      await consommerLien({ jeton: jetonResilie, ipHash: null }, resilie.consommation),
      await consommerLien(
        { jeton: randomBytes(32).toString('base64url'), ipHash: null },
        inconnu.consommation
      ),
    ];
    expect(r.map((x) => canonique(x))).toEqual(Array(3).fill('{"etat":"lien_invalide"}'));
    expect([kid, resilie, inconnu].map((x) => x.sessions.length)).toEqual([0, 0, 0]);
  });

  it('REQ-SEC-001 : un jeton hors format est refusé sans aucun appel au dépôt', async () => {
    const u = univers({ comptes: [MARIE] });
    const jeton = await emettrePourMarie(u);
    // Plancher : un jeton vide rendrait chaque variante « hors format » par construction.
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const hors of [
      '',
      `${jeton}A`,
      jeton.slice(1),
      `${jeton.slice(1)}=`,
      `${jeton.slice(1)}+`,
    ]) {
      expect(await consommerLien({ jeton: hors, ipHash: null }, u.consommation)).toEqual({
        etat: 'lien_invalide',
      });
    }
    expect(u.appelsAuDepot()).toBe(0);
  });
});
