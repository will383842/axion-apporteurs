// @req REQ-SEC-009
// @req REQ-QA-010 → REQ-SEC-009
// @req REQ-ARG-029
// @req REQ-UX-006
/**
 * `idor.spec.ts` — la gate `idor:check` (SEC-05) : le cloisonnement entre apporteurs, en base RÉELLE.
 *
 * DEUX MOITIÉS.
 *
 *   I. LA GARDE STATIQUE DES SURFACES. La liste des routes et des actions serveur de l'espace est
 *      DÉRIVÉE du disque (`src/app/(espace)/**`, `src/server/espace/**`) et confrontée, dans les deux
 *      sens, à `IDOR_CASES` : une surface neuve sans cas est un TROU, et la garde sort en code non
 *      nul en la nommant ; un cas sans surface est périmé, et elle sort aussi en non nul. Un fichier
 *      que la dérivation ne sait pas lire (directive `'use server'` hors tête de fichier, liste
 *      d'exports entre accolades, ré-export) n'est pas deviné : il sort en non nul, nommé.
 *      TÉMOIN À DEUX FACES : une route et une action plantées sans leur cas dans une copie de
 *      l'espace font sortir la garde en 1 et la nomment ; le dépôt réel la fait sortir en 0 avec le
 *      compte des routes et des actions confrontées.
 *
 *  II. L'ATTAQUE. Deux apporteurs réels, A et B, chacun avec une ligne dans CHAQUE modèle cloisonné,
 *      écrite par la couche elle-même. Avec la vue de A, la batterie tente, sur la ligne de B : la
 *      lecture par id, la liste (nue, ciblée par id, ciblée par `apporteurId`), le compte ciblé, la
 *      modification (verdict ET ligne relue en base), la création au nom de B. Elle exige aussi que
 *      la ligne de A reste lisible, listée et modifiable — une vue muette passerait l'attaque sans
 *      rien prouver.
 *      TÉMOIN À DEUX FACES : la MÊME batterie, jouée sur une vue qui oublie le `where` de
 *      l'apporteur (la `fixtureRouge` déclarée de la gate), relève chaque brèche ; jouée sur
 *      `forApporteur`, elle n'en relève aucune.
 *      INDISTINCTION : la réponse à l'id d'un autre apporteur et celle à un id inexistant sont
 *      comparées OCTET À OCTET — statut, en-têtes, corps —, en JSON et en PDF ; et les deux passent
 *      par la MÊME requête SQL (texte identique, une requête chacune) : le temps observable ne
 *      distingue pas un chemin de l'autre. Témoin : sur la vue sans `where`, les deux réponses
 *      diffèrent.
 *
 * ÉTAT DES SURFACES AU JOUR DE LA GATE. L'espace ne porte encore que la connexion : deux pages et
 * deux actions, dont aucune ne reçoit d'identifiant de ressource d'apporteur (le segment de
 * `/connexion/:jeton` est un jeton de connexion à usage unique, pas une ressource). Chacune est
 * déclarée `sans_ressource` avec son motif. Toute route ou action neuve de l'espace entre dans
 * `IDOR_CASES` dans la PR qui la crée, ou la gate rougit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { demarrerBase, RACINE, type Base } from './harnais';
import {
  MODELES_CLOISONNES,
  forApporteur,
  introuvable,
  repondre,
  type AccesApporteur,
  MODELES_EN_AJOUT_SEUL,
  REFUS,
  SECRETS,
  type ClientCloisonnable,
  type ModeleCloisonne,
} from '../../src/server/acces/for-apporteur';

// ══ I. LA GARDE STATIQUE DES SURFACES ═══════════════════════════════════════════════════════════

/** Les deux arbres de l'espace, ceux que la règle semgrep maison protège aussi. */
const ARBRES = ['src/app/(espace)', 'src/server/espace'] as const;

type Cas =
  | { surface: string; cloisonnement: 'sans_ressource'; motif: string }
  | {
      surface: string;
      cloisonnement: 'ressource';
      /** Appelle la surface avec la session de `a` sur l'identifiant `id` ; rend sa réponse. */
      appeler: (a: AccesApporteur, id: string) => Promise<Response>;
    };

/**
 * LA LISTE DÉCLARÉE. Une surface par entrée, sous le nom que la dérivation lui donne :
 * `page /chemin`, `<METHODE> /chemin` pour un gestionnaire de route, `action <nom>`.
 */
const IDOR_CASES: readonly Cas[] = [
  {
    surface: 'page /connexion',
    cloisonnement: 'sans_ressource',
    motif: 'formulaire public de demande de lien : ni session, ni identifiant',
  },
  {
    surface: 'page /connexion/:jeton',
    cloisonnement: 'sans_ressource',
    motif:
      'le segment est un jeton de connexion à usage unique, jamais un identifiant de ressource',
  },
  {
    surface: 'action demanderUnLienDeConnexion',
    cloisonnement: 'sans_ressource',
    motif: 'reçoit une adresse saisie ; réponse identique que le compte existe ou non',
  },
  {
    surface: 'action consommerUnLienDeConnexion',
    cloisonnement: 'sans_ressource',
    motif: 'reçoit un jeton de connexion ; n’ouvre que la session du lien qui le porte',
  },
  {
    surface: 'action verifierUnCodeDeConnexion',
    cloisonnement: 'sans_ressource',
    motif:
      'reçoit une adresse saisie et un code ; réponse identique que le compte existe ou non ; n’ouvre que la session du lien actif de cette adresse',
  },
  {
    surface: 'action changerDAdresse',
    cloisonnement: 'sans_ressource',
    motif: 'ne reçoit rien ; n’efface que le cookie d’attente du code de cet appareil',
  },
  {
    surface: 'page /confidentialite',
    cloisonnement: 'sans_ressource',
    motif:
      'politique tirée du registre, la même pour tous ; l’état d’accord lu est celui de la session',
  },
  {
    surface: 'page /notifications',
    cloisonnement: 'sans_ressource',
    motif:
      'ne reçoit aucun identifiant ; ne lit que les notifications de l’apporteur de la session, et écarte celle dont l’attribution n’est pas la sienne',
  },
  {
    surface: 'action accepterLaPolitiqueDeConfidentialite',
    cloisonnement: 'sans_ressource',
    motif: 'ne reçoit que la version affichée ; n’écrit que l’accord de l’apporteur de la session',
  },
];

function fichiersSous(racine: string, arbre: string): string[] {
  const dossier = join(racine, arbre);
  if (!existsSync(dossier)) return [];
  const sortie: string[] = [];
  const parcourir = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else sortie.push(relative(racine, chemin).split(sep).join('/'));
    }
  };
  parcourir(dossier);
  return sortie.sort();
}

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const FICHIER_DE_ROUTE = /^(page|route)\.(ts|tsx|js|jsx|mjs)$/;

/** Le chemin d'URL d'un fichier sous `src/app/(espace)`, ou `null` s'il n'en ouvre aucun. */
function cheminDUrl(fichier: string): string | null {
  const segments = fichier.split('/').slice(2, -1);
  if (segments.some((s) => s.startsWith('_'))) return null;
  const visibles = segments
    .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'))
    .map((s) => s.replace(/^\[\[?\.\.\.(.+?)\]?\]$/, '*$1').replace(/^\[(.+)\]$/, ':$1'));
  return `/${visibles.join('/')}`;
}

/** Le texte sans ses commentaires de tête ni ses blancs de tête. */
function tete(texte: string): string {
  let reste = texte;
  for (;;) {
    const avant = reste;
    reste = reste
      .replace(/^\s+/, '')
      .replace(/^\/\/[^\n]*/, '')
      .replace(/^\/\*[\s\S]*?\*\//, '');
    if (reste === avant) return reste;
  }
}

const DIRECTIVE_SERVEUR = /(['"])use server\1/;
const EXPORT_NOMME =
  /export\s+(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/g;
const EXPORT_ILLISIBLE = /export\s*(?:\{|\*|default\b)/;

interface Derivation {
  routes: string[];
  actions: string[];
  /** Les fichiers que la dérivation refuse de deviner, avec leur raison. */
  illisibles: string[];
}

/** Dérive du disque les surfaces de l'espace. Rien n'est tapé : tout se lit sous `racine`. */
function deriverSurfaces(racine: string): Derivation {
  const d: Derivation = { routes: [], actions: [], illisibles: [] };
  for (const arbre of ARBRES) {
    for (const fichier of fichiersSous(racine, arbre).filter((f) => SOURCE.test(f))) {
      const texte = readFileSync(join(racine, fichier), 'utf8');
      const nom = fichier.slice(fichier.lastIndexOf('/') + 1);
      if (arbre === 'src/app/(espace)' && FICHIER_DE_ROUTE.test(nom)) {
        const url = cheminDUrl(fichier);
        if (url !== null && nom.startsWith('page.')) d.routes.push(`page ${url}`);
        if (url !== null && nom.startsWith('route.')) {
          const methodes = [...texte.matchAll(EXPORT_NOMME)].map((m) => m[1]!);
          if (methodes.length === 0 || EXPORT_ILLISIBLE.test(texte))
            d.illisibles.push(`${fichier} (exports du gestionnaire illisibles)`);
          for (const m of methodes) d.routes.push(`${m} ${url}`);
        }
      }
      if (!DIRECTIVE_SERVEUR.test(texte)) continue;
      if (!DIRECTIVE_SERVEUR.test(tete(texte).slice(0, 14))) {
        d.illisibles.push(`${fichier} (directive « use server » hors tête de fichier)`);
        continue;
      }
      if (EXPORT_ILLISIBLE.test(texte)) {
        d.illisibles.push(`${fichier} (exports entre accolades, étoile ou défaut)`);
        continue;
      }
      for (const m of texte.matchAll(EXPORT_NOMME)) d.actions.push(`action ${m[1]!}`);
    }
  }
  return d;
}

/** La confrontation, dans les deux sens. Rend un code de sortie et une sortie lisible. */
function confronter(d: Derivation, cas: readonly Cas[]): { code: 0 | 1; sortie: string } {
  const declarees = new Set(cas.map((c) => c.surface));
  const derivees = new Set([...d.routes, ...d.actions]);
  const fautes = [
    ...[...derivees]
      .filter((s) => !declarees.has(s))
      .map((s) => `surface sans cas de cloisonnement : ${s}`),
    ...[...declarees]
      .filter((s) => !derivees.has(s))
      .map((s) => `cas déclaré sans surface sur le disque : ${s}`),
    ...d.illisibles.map((f) => `fichier que la dérivation ne sait pas lire : ${f}`),
    ...cas
      .filter((c) => c.cloisonnement === 'sans_ressource' && c.motif.trim() === '')
      .map((c) => `cas sans ressource sans motif : ${c.surface}`),
  ];
  if (fautes.length > 0) return { code: 1, sortie: `idor:check — ✗\n${fautes.join('\n')}` };
  return {
    code: 0,
    sortie: `idor:check — ✓ ${d.routes.length} routes et ${d.actions.length} actions confrontées`,
  };
}

describe('REQ-QA-010 → REQ-SEC-009 — garde statique : une surface neuve de l’espace sans cas est un trou', () => {
  let bac: string;

  beforeAll(() => {
    bac = mkdtempSync(join(tmpdir(), 'idor-temoin-'));
    cpSync(join(RACINE, 'src/app/(espace)'), join(bac, 'src/app/(espace)'), { recursive: true });
  });

  afterAll(() => {
    if (bac) rmSync(bac, { recursive: true, force: true });
  });

  it('REQ-QA-010 → REQ-SEC-009 : TÉMOIN À DEUX FACES — le dépôt réel sort en 0 avec le compte des routes et des actions confrontées', () => {
    const { code, sortie } = confronter(deriverSurfaces(RACINE), IDOR_CASES);
    console.log(sortie);
    expect(sortie).toBe('idor:check — ✓ 4 routes et 5 actions confrontées');
    expect(code).toBe(0);
  });

  it('REQ-QA-010 → REQ-SEC-009 : TÉMOIN À DEUX FACES — une route paramétrée plantée sans son cas fait sortir en 1 et la nomme', () => {
    const dossier = join(bac, 'src/app/(espace)/(onglets)/mes-entreprises/[id]');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, 'page.tsx'), 'export default function P() { return null; }\n');
    const { code, sortie } = confronter(deriverSurfaces(bac), IDOR_CASES);
    rmSync(join(bac, 'src/app/(espace)/(onglets)'), { recursive: true });
    expect(code).toBe(1);
    expect(sortie).toContain('surface sans cas de cloisonnement : page /mes-entreprises/:id');
  });

  it('REQ-QA-010 → REQ-SEC-009 : une action neuve dans un fichier « use server » et un gestionnaire de route neuf, sans cas, sont nommés', () => {
    const dossier = join(bac, 'src/server/espace/documents');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(
      join(dossier, 'actions.ts'),
      "// en-tête\n'use server';\nexport async function telechargerDocument(id: string) { return id; }\n"
    );
    const route = join(bac, 'src/app/(espace)/documents/[id]/pdf');
    mkdirSync(route, { recursive: true });
    writeFileSync(join(route, 'route.ts'), 'export async function GET() { return null; }\n');
    const { code, sortie } = confronter(deriverSurfaces(bac), IDOR_CASES);
    rmSync(join(bac, 'src/server'), { recursive: true });
    rmSync(join(bac, 'src/app/(espace)/documents'), { recursive: true });
    expect(code).toBe(1);
    expect(sortie).toContain('surface sans cas de cloisonnement : action telechargerDocument');
    expect(sortie).toContain('surface sans cas de cloisonnement : GET /documents/:id/pdf');
  });

  it('REQ-QA-010 → REQ-SEC-009 : un fichier que la dérivation ne sait pas lire n’est pas deviné — il fait sortir en 1, nommé', () => {
    const dossier = join(bac, 'src/server/espace');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(
      join(dossier, 'interne.ts'),
      "export async function f() {\n  'use server';\n  return 1;\n}\n"
    );
    writeFileSync(
      join(dossier, 'accolades.ts'),
      "'use server';\nasync function g() { return 1; }\nexport { g };\n"
    );
    const { code, sortie } = confronter(deriverSurfaces(bac), IDOR_CASES);
    rmSync(join(bac, 'src/server'), { recursive: true });
    expect(code).toBe(1);
    expect(sortie).toContain(
      'src/server/espace/interne.ts (directive « use server » hors tête de fichier)'
    );
    expect(sortie).toContain(
      'src/server/espace/accolades.ts (exports entre accolades, étoile ou défaut)'
    );
  });

  it('REQ-QA-010 → REQ-SEC-009 : un cas déclaré dont la surface a disparu du disque est périmé — sortie en 1', () => {
    const { code, sortie } = confronter(deriverSurfaces(bac), [
      ...IDOR_CASES,
      { surface: 'page /disparue', cloisonnement: 'sans_ressource', motif: 'témoin' },
    ]);
    expect(code).toBe(1);
    expect(sortie).toContain('cas déclaré sans surface sur le disque : page /disparue');
  });

  it('REQ-QA-010 → REQ-SEC-009 : la dérivation ignore les dossiers privés, les groupes et les emplacements parallèles comme le routeur', () => {
    expect(cheminDUrl('src/app/(espace)/(onglets)/@modal/plus/page.tsx')).toBe('/plus');
    expect(cheminDUrl('src/app/(espace)/_interne/page.tsx')).toBeNull();
    expect(cheminDUrl('src/app/(espace)/aide/[...reste]/page.tsx')).toBe('/aide/*reste');
  });
});

// ══ II. L'ATTAQUE, EN BASE RÉELLE ═══════════════════════════════════════════════════════════════

let base: Base;
let journalise: PrismaClient<Prisma.PrismaClientOptions, 'query'>;
const requetes: string[] = [];

const t0 = Date.now();
const MINUTE = 60 * 1000;
const hex = (octets: number) => randomBytes(octets).toString('hex');

let sequence = 0;
/** Un code de parrainage neuf, dans la forme du CHECK (`AX` + 6 Crockford). */
function code(): string {
  sequence += 1;
  return `AX5${String(sequence).padStart(5, '0')}`;
}

async function apporteur(): Promise<string> {
  const id = randomUUID();
  await base.prisma.apporteur.create({
    data: {
      id,
      statut: 'signe',
      codeParrainage: code(),
      isTest: false,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 60,
      scorePartsJson: { carnet: 60 },
      scoreBaremeVersion: 'bareme-essai',
      creeAt: new Date(t0),
    },
  });
  return id;
}

/**
 * Une ligne neuve de chaque modèle, SANS apporteur : c'est la couche qui l'écrit. `ids` porte les
 * lignes déjà semées de la MÊME session, pour les références vérifiées.
 */
function donneesNeuves(
  modele: ModeleCloisonne,
  ids: Partial<Record<ModeleCloisonne, string>>
): Record<string, unknown> {
  const lienMagiqueId = ids.lienMagique ?? '';
  const creeAt = new Date(t0);
  switch (modele) {
    // DM-07 : semée HORS de la couche (voir `SEMES_HORS_COUCHE`) — la grille est une clé refusée à
    // l'espace, et une attribution d'apporteur sans grille est refusée par la base. Un état qui
    // n'occupe pas le SIREN : les deux apporteurs partagent le même.
    case 'attribution':
      return {
        statut: 'perdue',
        siren: '123456789',
        canal: 'espace',
        grilleCommissionId: grilleId,
        dateContact: creeAt,
        verificationPrioritaire: false,
        entrepriseAVerifier: false,
        lienInteretDeclare: false,
      };
    // CPL-T06 : semée HORS de la couche (voir `SEMES_HORS_COUCHE`) — l'auteur de la console est une
    // clé refusée à l'espace, et la base l'exige.
    case 'decisionCandidature':
      return {
        resultat: 'vivier',
        justificationChiffre: randomBytes(32),
        auteurId: consoleId,
        decideeAt: creeAt,
      };
    case 'depotRefuse':
      return { siren: '123456789', motif: 'file_complete', canal: 'espace', refuseAt: creeAt };
    case 'personneDeclaree':
      return {
        nomChiffre: randomBytes(32),
        prenomChiffre: randomBytes(32),
        qualite: 'associe',
        declareeAt: creeAt,
      };
    case 'changementCourriel':
      return {
        emailChiffre: randomBytes(32),
        emailHash: hex(32),
        tokenHash: hex(32),
        kid: hex(4),
        demandeAt: creeAt,
      };
    case 'courrielEnvoye':
      return {
        gabarit: 'essai_cloisonnement',
        emailHash: hex(32),
        statut: 'retenu_adresse_supprimee',
        demandeAt: creeAt,
      };
    case 'identiteFacturation':
      return { siren: '123456789', regimeTva: 'assujetti', debutAt: creeAt };
    // DM-11 : une pièce déjà REMPLACÉE, hors des deux index partiels — la batterie en sème plusieurs.
    case 'pieceKyc':
      return { type: 'siret', statut: 'refusee', remplaceeAt: creeAt };
    case 'jetonDepot':
      return { tokenHash: hex(32), creeAt };
    case 'lienMagique':
      return { tokenHash: hex(32), kid: hex(4), creeAt, expireAt: new Date(t0 + 15 * MINUTE) };
    case 'sessionEspace':
      return {
        lienMagiqueId,
        tokenHash: hex(32),
        kid: hex(4),
        creeAt,
        expireAt: new Date(t0 + 60 * MINUTE),
      };
    // UX-P1-10 : une clé de la FORME admise par la base ; sa valeur se juge en amont, par Zod.
    case 'notificationEspace':
      return { cle: 'essai_cloisonnement', creeAt };
    case 'preferenceNotification':
      return { cle: 'essai_cloisonnement', active: true, modifieeAt: creeAt };
    // DM-12 : écrites par le serveur ; ici, par la couche, au nom de la session.
    case 'alerteLiberation':
      return { siren: '123456789', creeAt };
    // Une contestation vise une attribution DE LA SESSION, semée avant elle (référence vérifiée).
    case 'contestation':
      return {
        objet: 'annulation_attribution',
        attributionId: ids.attribution,
        texteChiffre: randomBytes(32),
        recueAt: creeAt,
      };
    case 'verification':
      return { siren: '123456789', resultat: 'libre', ipHash: hex(8), verifieeAt: creeAt };
  }
}

/** Une modification légale et répétable de la ligne, qui CHANGE une colonne à chaque tour `n`. */
function modification(modele: ModeleCloisonne, n: number): Record<string, unknown> {
  const instant = new Date(t0 + n * MINUTE);
  switch (modele) {
    case 'attribution':
      return { versionQualification: n };
    // Les tables en ajout seul : une modification que la BASE refuse, quel que soit l'auteur.
    case 'decisionCandidature':
      return { resultat: 'retenu' };
    case 'depotRefuse':
      return { motif: 'insincerite' };
    case 'personneDeclaree':
      return { qualite: 'prepose' };
    case 'changementCourriel':
      return { demandeAt: instant };
    case 'courrielEnvoye':
      return { erreur: `code_essai_${n}` };
    case 'identiteFacturation':
      return { finAt: new Date(t0 + (n + 1) * 24 * 60 * MINUTE) };
    case 'pieceKyc':
      // SEC-49 : le fichier d'une pièce est figé par la base ; la date de vérification reste libre.
      return { verifieeAt: instant };
    case 'jetonDepot':
      return { dernierUsageAt: instant };
    case 'lienMagique':
      return { tentativesCode: n };
    case 'sessionEspace':
      return { derniereVueAt: instant };
    case 'notificationEspace':
      return { lueAt: instant };
    case 'preferenceNotification':
      return { modifieeAt: instant };
    // DM-12 : des tables que la BASE garde ; une modification qu'elle refuse, quel que soit l'auteur.
    case 'alerteLiberation':
      return { siren: '987654321' };
    case 'contestation':
      return { texteChiffre: randomBytes(32) };
    case 'verification':
      return { resultat: 'fermee' };
  }
}

/**
 * Les modèles dont la BASE refuse la modification : l'ajout seul du gabarit, et la contestation,
 * gardée par sa fonction dédiée (DM-12). Leur refus en base est un verdict, pas une panne.
 */
const REFUS_EN_BASE: readonly string[] = [...MODELES_EN_AJOUT_SEUL, 'contestation'];
const MESSAGES_DE_REFUS_EN_BASE = /refuser_modification_sauf|contestations_refuser_substitution/;

/** La ligne relue en base, hors de toute couche : ce que la batterie compare avant et après. */
type Delegue = { findUnique(a: { where: { id: string } }): Promise<unknown> };
const relire = (modele: ModeleCloisonne, id: string) =>
  (base.prisma[modele] as unknown as Delegue).findUnique({ where: { id } });

type Vue = AccesApporteur[ModeleCloisonne];

/** Une donnée d'essai passée à la couche sans son type : c'est la couche qu'on juge, pas le compilateur. */
const brut = (o: object): never => o as never;

/**
 * Les modèles semés HORS de la couche : l'attribution d'un apporteur porte une version de grille
 * (REQ-DM-014), clé que l'espace n'écrit jamais — le dépôt passe par son propre chemin serveur, sous
 * verrou. La batterie l'attaque par la couche comme les autres ; seule sa naissance est directe.
 * CPL-T06 : la décision sur une candidature, de même — son auteur est un utilisateur de la console.
 */
const SEMES_HORS_COUCHE: readonly ModeleCloisonne[] = ['attribution', 'decisionCandidature'];
let grilleId: string;
let consoleId: string;

/** Ce qui est semé : pour chaque modèle, la ligne de A et la ligne de B. */
const lignes = Object.fromEntries([]) as Record<ModeleCloisonne, { a: string; b: string }>;
let A: string;
let B: string;

/**
 * LA BATTERIE. Joue chaque méthode de la vue de A contre la ligne de B ; rend la liste des brèches.
 * Lève si la vue est MUETTE sur la ligne de A : une vue qui ne rend rien passerait sans rien prouver.
 */
async function attaquer(vue: Vue, modele: ModeleCloisonne, n: number): Promise<string[]> {
  const { a: idA, b: idB } = lignes[modele];
  const breches: string[] = [];
  const liste = async (o?: object) =>
    ((await vue.lister(o as never)) as { id: string }[]).map((l) => l.id);

  if ((await vue.trouver(idA)) === null) throw new Error(`${modele} : vue muette en lecture`);
  if (!(await liste()).includes(idA)) throw new Error(`${modele} : vue muette en liste`);

  if ((await vue.trouver(idB)) !== null) breches.push('lecture');
  if ((await liste()).includes(idB)) breches.push('liste');
  if ((await liste({ where: { id: idB } })).length > 0) breches.push('liste_ciblee_par_id');
  // SEC-47 : un filtre sur `apporteurId` (colonne tue) n'est plus gardé en conjonction, il est
  // REFUSÉ avant tout appel. La brèche, c'est qu'il passe ; le compte se cible par une colonne rendue.
  const refuse = (p: Promise<unknown>) =>
    p.then(
      () => false,
      (e: unknown) => (e as Error).message === REFUS.forme
    );
  if (!(await refuse(vue.lister(brut({ where: { apporteurId: B } })))))
    breches.push('liste_ciblee_par_apporteur');
  if (!(await refuse(vue.compter(brut({ apporteurId: B }))))) breches.push('compte_par_apporteur');
  if ((await vue.compter(brut({ id: idB }))) > 0) breches.push('compte');

  // DM-07 : une table en AJOUT SEUL refuse la modification EN BASE (`refuser_modification_sauf`) ;
  // ce refus est lu comme un verdict, pas comme une panne de la batterie.
  const enAjoutSeul = REFUS_EN_BASE.includes(modele);
  const modifier = (id: string) =>
    vue.modifier(id, modification(modele, n) as never).then(
      (v) => v,
      (e: unknown) => {
        if (enAjoutSeul && MESSAGES_DE_REFUS_EN_BASE.test((e as Error).message))
          return 'refusee_par_la_base' as const;
        throw e;
      }
    );
  const avant = JSON.stringify(await relire(modele, idB));
  const verdict = await modifier(idB);
  if (verdict === 'modifiee') breches.push('modification_acceptee');
  if (JSON.stringify(await relire(modele, idB)) !== avant) breches.push('modification_ecrite');
  const surA = await modifier(idA);
  if (enAjoutSeul ? surA !== 'refusee_par_la_base' : surA !== 'modifiee')
    throw new Error(`${modele} : vue muette en modification (${surA})`);

  const compteB = await base.prisma[modele as 'jetonDepot'].count({ where: { apporteurId: B } });
  try {
    await vue.creer(
      brut({
        ...donneesNeuves(modele, {
          lienMagique: lignes.lienMagique.b,
          attribution: lignes.attribution.b,
        }),
        apporteurId: B,
      })
    );
  } catch {
    /* un refus est l'issue attendue ; seule la ligne écrite est une brèche */
  }
  const apres = await base.prisma[modele as 'jetonDepot'].count({ where: { apporteurId: B } });
  if (apres !== compteB) breches.push('creation_au_nom_d_un_autre');
  return breches;
}

/**
 * LA FIXTURE ROUGE DE LA GATE : « retirer un where d'une route de l'espace ». La même interface que
 * la couche, sur le même client, sans la conjonction de l'apporteur.
 */
function vueSansWhere(modele: ModeleCloisonne): Vue {
  type D = {
    findFirst(a: object): Promise<unknown>;
    findMany(a: object): Promise<unknown[]>;
    count(a: object): Promise<number>;
    create(a: object): Promise<unknown>;
    updateMany(a: object): Promise<{ count: number }>;
  };
  const d = base.prisma[modele] as unknown as D;
  return {
    trouver: (id: string) => d.findFirst({ where: { id } }),
    lister: (o?: { where?: object }) => d.findMany({ where: o?.where ?? {} }),
    compter: (where?: object) => d.count({ where: where ?? {} }),
    creer: (data: object) => d.create({ data }),
    modifier: async (id: string, data: object) =>
      (await d.updateMany({ where: { id }, data })).count === 1 ? 'modifiee' : 'introuvable',
  } as unknown as Vue;
}

const accesDe = (client: PrismaClient | typeof journalise, apporteurId: string) =>
  forApporteur(client as unknown as ClientCloisonnable, apporteurId);

beforeAll(async () => {
  base = await demarrerBase();
  journalise = new PrismaClient<Prisma.PrismaClientOptions, 'query'>({
    datasourceUrl: base.url,
    log: [{ emit: 'event', level: 'query' }],
  });
  journalise.$on('query', (e) => requetes.push(e.query));
  A = await apporteur();
  B = await apporteur();
  consoleId = (
    await base.prisma.utilisateurConsole.create({
      // Désactivé : un compte actif exige une adresse chiffrée (CHECK), sans rapport avec l'essai.
      data: { role: 'qualifieur', creeAt: new Date(t0), desactiveAt: new Date(t0) },
      select: { id: true },
    })
  ).id;
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: new Date(t0),
        importeeAt: new Date(t0),
      },
    })
  ).id;
  const semer = async (qui: string) => {
    const acces = accesDe(base.prisma, qui);
    const ids = Object.fromEntries([]) as Record<ModeleCloisonne, string>;
    ids.lienMagique = (
      (await acces.lienMagique.creer(donneesNeuves('lienMagique', {}) as never)) as { id: string }
    ).id;
    for (const m of MODELES_CLOISONNES.filter((x) => x !== 'lienMagique')) {
      if (SEMES_HORS_COUCHE.includes(m)) {
        const directe = (await (
          base.prisma[m] as unknown as { create(a: object): Promise<{ id: string }> }
        ).create({ data: { ...donneesNeuves(m, ids), apporteurId: qui } })) as {
          id: string;
        };
        ids[m] = directe.id;
        continue;
      }
      const ligne = (await acces[m].creer(donneesNeuves(m, ids) as never)) as {
        id: string;
      };
      ids[m] = ligne.id;
    }
    return ids;
  };
  const deA = await semer(A);
  const deB = await semer(B);
  for (const m of MODELES_CLOISONNES) lignes[m] = { a: deA[m], b: deB[m] };
}, 180_000);

afterAll(async () => {
  await journalise?.$disconnect();
  await base?.arreter();
});

describe('REQ-SEC-009 — A ne lit, ne liste, ne compte, ne modifie ni ne crée rien de B', () => {
  it('REQ-SEC-009 : la couche a écrit chaque ligne semée au nom de son apporteur, et à lui seul', async () => {
    for (const m of MODELES_CLOISONNES.filter((x) => !SEMES_HORS_COUCHE.includes(x))) {
      const a = (await relire(m, lignes[m].a)) as { apporteurId: string };
      const b = (await relire(m, lignes[m].b)) as { apporteurId: string };
      expect([m, a.apporteurId, b.apporteurId]).toEqual([m, A, B]);
    }
  });

  it('REQ-SEC-009 : TÉMOIN À DEUX FACES — la vue sans `where` d’apporteur (fixture rouge) : la batterie relève chaque brèche, sur chaque modèle', async () => {
    for (const m of MODELES_CLOISONNES) {
      const breches = await attaquer(vueSansWhere(m), m, 2);
      // Une table en ajout seul refuse la modification EN BASE, même sans `where` : la défense en
      // profondeur tient, et ces deux brèches-là n'y apparaissent pas.
      const modification = REFUS_EN_BASE.includes(m)
        ? []
        : ['modification_acceptee', 'modification_ecrite'];
      expect([m, breches]).toEqual([
        m,
        expect.arrayContaining([
          'lecture',
          'liste',
          'liste_ciblee_par_id',
          'liste_ciblee_par_apporteur',
          'compte_par_apporteur',
          'compte',
          ...modification,
        ]),
      ]);
    }
  });

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-009 : TÉMOIN À DEUX FACES — %s par forApporteur : aucune brèche, et la ligne de A reste lisible, listée, modifiable',
    async (m) => {
      expect(await attaquer(accesDe(base.prisma, A)[m], m, 3)).toEqual([]);
    }
  );

  it('REQ-SEC-009 : la création au nom d’un autre est refusée par la couche AVANT la base — B n’a gagné aucune ligne', async () => {
    const vue = accesDe(base.prisma, A).jetonDepot;
    const avant = await base.prisma.jetonDepot.count({ where: { apporteurId: B } });
    await expect(
      vue.creer(brut({ tokenHash: hex(32), creeAt: new Date(t0), apporteurId: B }))
    ).rejects.toThrow();
    expect(await base.prisma.jetonDepot.count({ where: { apporteurId: B } })).toBe(avant);
  });

  it('REQ-SEC-009 : une session ne se rattache pas au lien d’un autre apporteur — refus, aucune ligne écrite', async () => {
    const vue = accesDe(base.prisma, A).sessionEspace;
    const avant = await base.prisma.sessionEspace.count();
    await expect(
      vue.creer(donneesNeuves('sessionEspace', { lienMagique: lignes.lienMagique.b }) as never)
    ).rejects.toThrow();
    expect(await base.prisma.sessionEspace.count()).toBe(avant);
  });

  it('REQ-SEC-009 : DM-07 — le RETRAIT d’une personne déclarée : B ne retire pas celle de A ; A la retire UNE fois, la base refuse le second', async () => {
    const vueA = accesDe(base.prisma, A).personneDeclaree;
    const vueB = accesDe(base.prisma, B).personneDeclaree;
    const { id } = (await vueA.creer(donneesNeuves('personneDeclaree', {}) as never)) as {
      id: string;
    };
    const avant = JSON.stringify(await relire('personneDeclaree', id));
    expect(await vueB.modifier(id, brut({ retireeAt: new Date(t0 + MINUTE) }))).toBe('introuvable');
    expect(JSON.stringify(await relire('personneDeclaree', id))).toBe(avant);
    expect(await vueA.modifier(id, brut({ retireeAt: new Date(t0 + MINUTE) }))).toBe('modifiee');
    await expect(vueA.modifier(id, brut({ retireeAt: new Date(t0 + 2 * MINUTE) }))).rejects.toThrow(
      /refuser_modification_sauf/
    );
    await expect(vueA.modifier(id, brut({ qualite: 'sous_traitant' }))).rejects.toThrow(
      /refuser_modification_sauf/
    );
  });

  it('REQ-UX-006 : moi() rend l’apporteur de la session — jamais l’autre', async () => {
    expect((await accesDe(base.prisma, A).moi())?.id).toBe(A);
    expect((await accesDe(base.prisma, B).moi())?.id).toBe(B);
  });
});

describe('REQ-ARG-029 — l’id d’un autre apporteur rend un 404 octet à octet identique à un id inexistant', () => {
  async function octets(r: Response) {
    return {
      statut: r.status,
      entetes: [...r.headers.entries()].sort(),
      corps: Buffer.from(await r.arrayBuffer()).toString('hex'),
    };
  }
  const enJson = (l: unknown) => Response.json(l);
  const enPdf = () =>
    new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
      headers: { 'content-type': 'application/pdf' },
    });

  it.each(MODELES_CLOISONNES)(
    'REQ-ARG-029 : %s — étranger et inexistant : même statut, mêmes en-têtes, même corps, en JSON comme en PDF ; la ligne de A rend 200',
    async (m) => {
      const vue = accesDe(base.prisma, A)[m];
      for (const rendre of [enJson, enPdf]) {
        const etranger = await octets(repondre(await vue.trouver(lignes[m].b), rendre));
        const inexistant = await octets(repondre(await vue.trouver(randomUUID()), rendre));
        expect(etranger).toEqual(inexistant);
        expect(etranger).toEqual(await octets(introuvable()));
        expect(etranger.statut).toBe(404);
      }
      expect(repondre(await vue.trouver(lignes[m].a), enJson).status).toBe(200);
    }
  );

  it('REQ-ARG-029 : TÉMOIN À DEUX FACES — sur la vue sans `where`, les deux réponses DIFFÈRENT (l’étranger rend 200)', async () => {
    const vue = vueSansWhere('identiteFacturation');
    const etranger = await octets(
      repondre(await vue.trouver(lignes.identiteFacturation.b), enJson)
    );
    const inexistant = await octets(repondre(await vue.trouver(randomUUID()), enJson));
    expect(etranger).not.toEqual(inexistant);
    expect(etranger.statut).toBe(200);
  });

  /**
   * LES REQUÊTES D'UN APPEL, LUES APRÈS QUE LEURS ÉVÉNEMENTS SONT ARRIVÉS. Prisma émet `query` de
   * façon ASYNCHRONE : sur une machine plus lente, l'événement d'un appel arrivait après la remise
   * à zéro du suivant, et la CI lisait 0 puis 2 requêtes là où il y en a une. On attend qu'au moins
   * un événement soit arrivé, puis que le compte reste stable, avant de le lire.
   */
  async function requetesDe(appel: () => Promise<unknown>): Promise<string[]> {
    requetes.length = 0;
    await appel();
    const limite = Date.now() + 5000;
    while (requetes.length === 0 && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 10));
    }
    let avant = -1;
    while (avant !== requetes.length) {
      avant = requetes.length;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [...requetes];
  }

  it.each(MODELES_CLOISONNES)(
    'REQ-UX-006 : %s — étranger et inexistant passent par UNE requête au texte SQL identique (aucun chemin plus court à chronométrer)',
    async (m) => {
      const vue = accesDe(journalise, A)[m];
      const pourEtranger = await requetesDe(() => vue.trouver(lignes[m].b));
      const pourInexistant = await requetesDe(() => vue.trouver(randomUUID()));
      expect(pourEtranger).toHaveLength(1);
      expect(pourEtranger).toEqual(pourInexistant);
      expect(pourEtranger[0]).toContain('"apporteur_id"');
    }
  );
});

/**
 * LE VRAI SÉRIALISEUR DE PRISMA, INTERCEPTÉ AU MOTEUR (lentille `securite`, #200). Le faux client
 * de ce fichier ne voit pas ce que Prisma envoie : son sérialiseur parcourt les arguments par
 * `for…in`, et une clé héritée PART vers la base. On construit un vrai client, on remplace la seule
 * méthode du moteur qui parle à la base, et on lit ce qu'elle aurait reçu. Aucune base n'est ouverte.
 */
describe('REQ-SEC-008 — le vrai sérialiseur de Prisma ne reçoit que ce que la couche a jugé', () => {
  const A = randomUUID();
  const B = randomUUID();
  async function refusDe(promesse: Promise<unknown>): Promise<string> {
    try {
      await promesse;
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('aucun refus');
  }

  function clientIntercepte(): { client: PrismaClient; envois: string[] } {
    const client = new PrismaClient({
      datasourceUrl: 'postgresql://temoin:temoin@127.0.0.1:1/temoin',
    });
    const envois: string[] = [];
    const moteur = (
      client as unknown as { _engine: { request: (...a: unknown[]) => Promise<unknown> } }
    )._engine;
    moteur.request = (...args: unknown[]) => {
      envois.push(JSON.stringify(args[0]));
      return Promise.reject(new Error('moteur intercepté par le témoin'));
    };
    return { client, envois };
  }

  it('REQ-SEC-008 : TÉMOIN DU BANC — sans la couche, le vrai sérialiseur ENVOIE une clé héritée', async () => {
    const { client, envois } = clientIntercepte();
    await client.jetonDepot
      .updateMany({ where: { id: randomUUID() }, data: Object.create({ apporteurId: B }) as never })
      .catch(() => undefined);
    expect(envois.join('\n')).toContain(B);
  });

  it.each(['creer', 'modifier'] as const)(
    'REQ-SEC-008 : par la couche, %s d’une clé héritée n’envoie RIEN au moteur',
    async (methode) => {
      const { client, envois } = clientIntercepte();
      const vue = forApporteur(client as unknown as ClientCloisonnable, A).jetonDepot;
      const data = Object.create({ apporteurId: B }) as never;
      const appel = methode === 'creer' ? vue.creer(data) : vue.modifier(randomUUID(), data);
      expect(await refusDe(appel)).toBe(REFUS.forme);
      expect(envois).toEqual([]);
    }
  );

  // UNE PROPRIÉTÉ PROPRE `__proto__`, telle que `JSON.parse` la produit d'un corps de requête
  // (lentille `securite`, second refus sur #200). Une copie construite par AFFECTATION voyait son
  // prototype remplacé : le contrôle ne voyait rien, et le sérialiseur envoyait les clés héritées.
  it.each([
    ['modifier', 'jetonDepot', `{"kid":"x","__proto__":{"apporteurId":"${B}"}}`],
    ['creer', 'jetonDepot', `{"kid":"x","__proto__":{"apporteurId":"${B}"}}`],
    ['modifier', 'sessionEspace', `{"__proto__":{"lienMagiqueId":"${B}"}}`],
  ] as const)(
    'REQ-SEC-008 : par la couche, %s d’un corps JSON portant `__proto__` (%s) est refusé, et RIEN n’est envoyé',
    async (methode, modele, corps) => {
      const { client, envois } = clientIntercepte();
      const vue = forApporteur(client as unknown as ClientCloisonnable, A)[modele];
      const data: unknown = JSON.parse(corps);
      const appel =
        methode === 'creer' ? vue.creer(data as never) : vue.modifier(randomUUID(), data as never);
      expect(await refusDe(appel)).toBe(REFUS.forme);
      expect(envois).toEqual([]);
    }
  );

  it.each(['constructor', 'toString', 'hasOwnProperty'])(
    'REQ-SEC-008 : une clé `%s`, membre du prototype des objets, est refusée comme `__proto__`',
    async (cle) => {
      const { client, envois } = clientIntercepte();
      const data: unknown = JSON.parse(`{"kid":"x","${cle}":{"apporteurId":"${B}"}}`);
      const vue = forApporteur(client as unknown as ClientCloisonnable, A).jetonDepot;
      expect(await refusDe(vue.modifier(randomUUID(), data as never))).toBe(REFUS.forme);
      expect(envois).toEqual([]);
    }
  );

  it.each(['creer', 'modifier'] as const)(
    'REQ-SEC-008 : par la couche, %s d’un ACCESSEUR (une valeur au contrôle, une autre à l’écriture) est refusé, et RIEN n’est envoyé',
    async (methode) => {
      const { client, envois } = clientIntercepte();
      let lectures = 0;
      const data = {
        get lienMagiqueId() {
          lectures += 1;
          return lectures === 1 ? randomUUID() : B;
        },
      };
      const vue = forApporteur(client as unknown as ClientCloisonnable, A).sessionEspace;
      const appel =
        methode === 'creer' ? vue.creer(data as never) : vue.modifier(randomUUID(), data as never);
      expect(await refusDe(appel)).toBe(REFUS.forme);
      expect(envois).toEqual([]);
    }
  );

  it('REQ-SEC-008 : CONTRE-TÉMOIN — par la couche, un objet simple part avec l’apporteur de la session', async () => {
    const { client, envois } = clientIntercepte();
    const simple: Record<string, unknown> = { kid: '0123abcd' };
    await forApporteur(client as unknown as ClientCloisonnable, A)
      .jetonDepot.modifier(randomUUID(), simple as never)
      .catch(() => undefined);
    const envoye = envois.join('\n');
    expect(envoye).toContain('0123abcd');
    expect(envoye).toContain(A);
    expect(envoye).not.toContain(B);
  });

  // ── GOV-111 : les options de lecture, les filtres de relation, la sélection explicite ──────────

  it('REQ-SEC-008 : TÉMOIN DU BANC — sans la couche, une relation HÉRITÉE dans le filtre part au moteur', async () => {
    const { client, envois } = clientIntercepte();
    await client.jetonDepot
      .findMany({ where: Object.create({ apporteur: { is: { id: B } } }) as never })
      .catch(() => undefined);
    expect(envois.join('\n')).toContain(B);
  });

  it.each([
    [
      'une relation héritée dans le filtre',
      { where: Object.create({ apporteur: { is: { id: B } } }) },
    ],
    ['une relation nommée dans un OR', { where: { OR: [{ apporteur: { is: { id: B } } }] } }],
    ['un include', { include: { apporteur: true } }],
    ['un select qui demande un secret', { select: { tokenHash: true } }],
  ])(
    'REQ-SEC-008 : par la couche, lister avec %s est refusé, et RIEN n’est envoyé',
    async (_quoi, options) => {
      const { client, envois } = clientIntercepte();
      const vue = forApporteur(client as unknown as ClientCloisonnable, A).jetonDepot;
      expect(await refusDe(vue.lister(options as never))).toBe(REFUS.forme);
      expect(envois).toEqual([]);
    }
  );

  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : par la couche, ce qui part au moteur pour %s ne nomme aucun secret',
    async (modele) => {
      const { client, envois } = clientIntercepte();
      const vue = forApporteur(client as unknown as ClientCloisonnable, A)[modele];
      await vue.lister().catch(() => undefined);
      await vue.trouver(randomUUID()).catch(() => undefined);
      expect(envois.length).toBe(2);
      for (const secret of SECRETS) expect(envois.join('\n')).not.toContain(`"${secret}"`);
    }
  );
});

describe('REQ-SEC-008 — GOV-111 : en base réelle, une ligne rendue par la couche ne porte aucun secret', () => {
  it.each(MODELES_CLOISONNES)(
    'REQ-SEC-008 : %s — trouver et lister rendent la ligne sans secret',
    async (modele) => {
      const vue = accesDe(base.prisma, A)[modele];
      const lue = (await vue.trouver(lignes[modele].a)) as Record<string, unknown> | null;
      expect(lue).not.toBeNull();
      const listees = (await vue.lister()) as Record<string, unknown>[];
      expect(listees.length).toBeGreaterThan(0);
      for (const ligne of [lue!, ...listees])
        for (const secret of SECRETS) expect(Object.hasOwn(ligne, secret)).toBe(false);
    }
  );
});
