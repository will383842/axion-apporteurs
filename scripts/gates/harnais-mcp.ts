/**
 * harnais-mcp.ts — LE HARNAIS DE CONFORMITÉ de l'adaptateur MCP `partners` : les neuf contrôles du
 * § 09 du socle `axion-ops`, plus le rang 2 optionnel (§ 13.3) et le sceau des profils (INT-T11,
 * REQ-INT-026).
 *
 * USAGE : pnpm harnais-mcp               les contrôles, contre l'adaptateur du dépôt
 *         pnpm mcp:manifeste             confronte `src/server/mcp/manifeste.json` au code
 *         pnpm mcp:manifeste:ecrire      réécrit ce fichier depuis le code
 *
 * CHAQUE CONTRÔLE DIT CE QU'IL A CONFRONTÉ : un compte, un plancher sous lequel le compte est
 * lui-même une anomalie, et une phrase. Un harnais qui rend « 9/9 » sans dire quoi ne prouve rien.
 * Les contrôles et leurs textes suivent `core/adapter-kit/conformite.ts` du socle ; deux écarts,
 * nommés :
 *   — LE PÉRIMÈTRE VIDE. En phase 0 le registre ne porte aucun outil. Les contrôles qui mesurent
 *     des outils (1, 3, 4, 5, 7, § 13.3) ont alors un plancher nul, À UNE CONDITION : le registre
 *     déclare ce vide (`PERIMETRE_VIDE`), avec un motif et une tâche du backlog, non livrée, qui
 *     porte REQ-INT-027. Vide et non déclaré, ou déclaré et non vide : rouge. Le contrôle 6 exige
 *     alors que le seul refus du manifeste soit celui du socle, `tools : vide`, écrit dans le fichier.
 *   — LA SONDE DU CONTRÔLE 8 est jouée ici, contre la porte injectée, en cinq appels : sans secret
 *     configuré (503), sans en-tête (401), secret faux (401), bon secret (200), et un limiteur qui
 *     refuse devant un secret faux (429, le limiteur consulté une fois) — ce dernier appel est ce
 *     qui distingue un limiteur AVANT la serrure d'un limiteur APRÈS elle.
 *
 * Les RÈGLES par outil (contrôles 1, 5, 7, § 13.3, et les refus propres du manifeste) vivent dans
 * `analyserOutils`, qui range chaque refus sous le contrôle qui le juge (`parControle`) : le harnais
 * les lit, il ne les retape pas.
 *
 * Les témoins vivent dans `tests/integration/adaptateur-mcp.spec.ts` : la porte privée de son
 * secret, avec un secret faux, le limiteur après la serrure ou consulté deux fois (contrôle 8) ; un
 * outil injecté par règle (1, 5, 7, § 13.3) ; chacune des cinq conditions du périmètre vide ; un
 * motif d'accès au secret injecté (2) ; un fichier de moins (9). L'adaptateur du dépôt rend 0.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import type { VerdictDeLimite } from '../../src/server/securite/rate-limit';
import {
  DATA_CLASSES,
  EFFECTS,
  ID_ADAPTATEUR,
  NOMS_RESERVES_AU_CONTEXTE,
  PROFILS_DU_SOCLE,
  SCEAU_PROFILS,
  nomComplet,
  type OutilQuelconque,
} from '../../src/server/mcp/socle';
import { canoniser, octetsCanoniques, versValeurJson } from '../../src/server/mcp/json-canonique';
import {
  analyserOutils,
  confronterManifesteVersionne,
  documentDuManifeste,
  texteDuManifeste,
  type AnalyseManifeste,
  type CleDeControle,
} from '../../src/server/mcp/manifeste';
import {
  ENTETE_DU_SECRET,
  VARIABLE_DU_SECRET,
  traiterAppelMcp,
  type OptionsDeLaPorte,
} from '../../src/server/mcp/porte';
import {
  OUTILS,
  PERIMETRE_VIDE,
  SYMBOLES_AUTORISES,
  type DeclarationDePerimetreVide,
} from '../../src/server/mcp/registre';

export const ID_REGISTRE = 'harnais-mcp';
export const RACINE_ADAPTATEUR = 'src/server/mcp';
const CHEMIN_DU_MANIFESTE = 'src/server/mcp/manifeste.json';

/** Plancher-témoin du contrôle 9 : le nombre de fichiers d'adaptateur au jour de la livraison. */
export const PLANCHER_FICHIERS = 5;

/** La tâche qui reprend un périmètre vide doit porter l'exigence des outils. */
const EXIGENCE_DES_OUTILS = 'REQ-INT-027';
const MOTIF_MINIMAL = 20;

/** Contrôle 2 — les motifs du socle (`MOTIFS_ACCES_SECRET`), appliqués au source BRUT. */
export const MOTIFS_ACCES_SECRET: readonly { readonly nom: string; readonly motif: RegExp }[] = [
  { nom: 'process.env', motif: /\bprocess\s*\.\s*env\b/ },
  { nom: 'process[…]', motif: /\bprocess\s*\[/ },
  { nom: 'import de dotenv', motif: /["']dotenv(?:\/[\w-]+)?["']/ },
  { nom: "lecture d'un fichier .env", motif: /["'][^"']*\.env(?:\.[\w-]+)?["']/ },
];

export interface FichierAdaptateur {
  readonly chemin: string;
  readonly source: string;
}

export interface TacheLue {
  readonly id: string;
  readonly statut: string;
  readonly reqs: readonly string[];
}

export interface AdaptateurSoumis {
  readonly outils: readonly OutilQuelconque[];
  readonly perimetreVide: DeclarationDePerimetreVide | null;
  readonly symbolesAutorises: typeof SYMBOLES_AUTORISES;
  readonly fichiers: readonly FichierAdaptateur[];
  readonly manifesteVersionne: unknown;
  readonly taches: readonly TacheLue[];
  readonly porte: (requete: Request, o: OptionsDeLaPorte) => Promise<Response>;
}

export interface ResultatControle {
  /** Numéro du § 09, ou `0` pour un contrôle supplémentaire. */
  readonly numero: number;
  readonly cle: string;
  readonly libelle: string;
  readonly mesures: number;
  readonly plancher: number;
  readonly anomalies: readonly string[];
  readonly detail: string;
}

export interface RapportHarnais {
  readonly controles: readonly ResultatControle[];
  readonly anomalies: readonly string[];
  readonly code: 0 | 1;
}

// ── L'adaptateur du dépôt, lu sur le DISQUE ─────────────────────────────────────────────────────

function fichiersSous(racine: string, dossier: string): FichierAdaptateur[] {
  const lus: FichierAdaptateur[] = [];
  for (const nom of readdirSync(join(racine, dossier)).sort()) {
    const chemin = `${dossier}/${nom}`;
    if (statSync(join(racine, chemin)).isDirectory()) {
      if (nom !== '__tests__' && nom !== 'fixtures') lus.push(...fichiersSous(racine, chemin));
      continue;
    }
    if (!/\.tsx?$/.test(nom) || /\.(?:test|spec)\.tsx?$/.test(nom)) continue;
    lus.push({ chemin, source: readFileSync(join(racine, chemin), 'utf8') });
  }
  return lus;
}

function tachesDuRegistre(racine: string): TacheLue[] {
  const brut = JSON.parse(readFileSync(join(racine, 'docs/tasks.json'), 'utf8')) as {
    taches: { id: string; statut: string; reqs?: string[] }[];
  };
  return brut.taches.map((t) => ({ id: t.id, statut: t.statut, reqs: t.reqs ?? [] }));
}

export function adaptateurDuDepot(racine = process.cwd()): AdaptateurSoumis {
  return {
    outils: OUTILS,
    perimetreVide: PERIMETRE_VIDE,
    symbolesAutorises: SYMBOLES_AUTORISES,
    fichiers: fichiersSous(racine, RACINE_ADAPTATEUR),
    manifesteVersionne: JSON.parse(readFileSync(join(racine, CHEMIN_DU_MANIFESTE), 'utf8')),
    taches: tachesDuRegistre(racine),
    porte: traiterAppelMcp,
  };
}

// ── Le périmètre vide, déclaré ou non ───────────────────────────────────────────────────────────

function jugerPerimetreVide(a: AdaptateurSoumis): {
  vide: boolean;
  anomalies: string[];
  dit: string;
} {
  const d = a.perimetreVide;
  if (a.outils.length > 0) {
    return d === null
      ? { vide: false, anomalies: [], dit: '' }
      : {
          vide: false,
          anomalies: [
            `perimetre_vide_perime : ${String(a.outils.length)} outil(s) inscrit(s) et ` +
              '`PERIMETRE_VIDE` toujours déclaré — retirer la déclaration.',
          ],
          dit: '',
        };
  }
  if (d === null) {
    return {
      vide: true,
      anomalies: [
        'perimetre_vide_non_declare : 0 outil, et `PERIMETRE_VIDE` ne dit ni pourquoi ni qui le reprend.',
      ],
      dit: '0 outil, vide NON déclaré',
    };
  }
  const anomalies: string[] = [];
  if (d.motif.trim().length < MOTIF_MINIMAL) {
    anomalies.push(
      `perimetre_vide_sans_motif : un motif d'au moins ${String(MOTIF_MINIMAL)} caractères.`
    );
  }
  const tache = a.taches.find((t) => t.id === d.tache);
  if (tache === undefined)
    anomalies.push(`perimetre_vide_sans_repreneur : ${d.tache} absente du backlog.`);
  else if (tache.statut === 'fusionnee') {
    anomalies.push(
      `perimetre_vide_sans_repreneur : ${d.tache} est livrée et le registre reste vide.`
    );
  } else if (!tache.reqs.includes(EXIGENCE_DES_OUTILS)) {
    anomalies.push(
      `perimetre_vide_sans_repreneur : ${d.tache} ne porte pas ${EXIGENCE_DES_OUTILS}.`
    );
  }
  return { vide: true, anomalies, dit: `0 outil — périmètre vide déclaré, repris par ${d.tache}` };
}

// ── La sonde du contrôle 8 ──────────────────────────────────────────────────────────────────────

const ADMIS: VerdictDeLimite = {
  autorise: true,
  restant: 1,
  repriseAt: null,
  panne: false,
  motif: 'admis',
};
const REFUSE: VerdictDeLimite = {
  autorise: false,
  restant: 0,
  repriseAt: null,
  panne: false,
  motif: 'limite_atteinte',
};

async function sonder(a: AdaptateurSoumis): Promise<{ lignes: string[]; anomalies: string[] }> {
  const secret = randomBytes(32).toString('hex');
  const faux = randomBytes(32).toString('hex');
  const corps = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const requete = (presente: string | null): Request =>
    new Request('https://partners.test/api/mcp', {
      method: 'POST',
      headers: presente === null ? {} : { [ENTETE_DU_SECRET]: presente },
      body: corps,
    });
  let appelsDuLimiteur = 0;
  const limiteur = (verdict: VerdictDeLimite) => async (): Promise<VerdictDeLimite> => {
    appelsDuLimiteur += 1;
    return verdict;
  };
  // Un environnement COMPLET : la porte juge son secret avec tous les autres (REQ-SEC-028).
  const env: Record<string, string | undefined> = Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, randomBytes(32).toString('hex')])
  );
  env[VARIABLE_DU_SECRET] = secret;
  const sansSecret = { ...env, [VARIABLE_DU_SECRET]: undefined };
  const sondes: {
    quoi: string;
    attendu: number;
    jouer: () => Promise<Response>;
    limiteurUneFois?: boolean;
  }[] = [
    {
      quoi: 'sans secret configuré',
      attendu: 503,
      jouer: () =>
        a.porte(requete(secret), {
          environnement: sansSecret,
          limiteur: limiteur(ADMIS),
          maintenantMs: 0,
        }),
    },
    {
      quoi: 'sans en-tête',
      attendu: 401,
      jouer: () =>
        a.porte(requete(null), { environnement: env, limiteur: limiteur(ADMIS), maintenantMs: 0 }),
    },
    {
      quoi: 'secret faux',
      attendu: 401,
      jouer: () =>
        a.porte(requete(faux), { environnement: env, limiteur: limiteur(ADMIS), maintenantMs: 0 }),
    },
    {
      quoi: 'bon secret',
      attendu: 200,
      jouer: () =>
        a.porte(requete(secret), {
          environnement: env,
          limiteur: limiteur(ADMIS),
          maintenantMs: 0,
        }),
    },
    {
      quoi: 'limiteur qui refuse, secret faux (limiteur AVANT la serrure)',
      attendu: 429,
      limiteurUneFois: true,
      jouer: () =>
        a.porte(requete(faux), { environnement: env, limiteur: limiteur(REFUSE), maintenantMs: 0 }),
    },
  ];
  const lignes: string[] = [];
  const anomalies: string[] = [];
  for (const s of sondes) {
    appelsDuLimiteur = 0;
    let statut: number;
    try {
      statut = (await s.jouer()).status;
    } catch (erreur) {
      statut = -1;
      anomalies.push(`${s.quoi} : la porte a levé (${(erreur as Error).name}).`);
    }
    lignes.push(`${s.quoi} → ${String(statut)}`);
    if (statut !== s.attendu)
      anomalies.push(`${s.quoi} : ${String(statut)}, attendu ${String(s.attendu)}.`);
    if (s.limiteurUneFois === true && appelsDuLimiteur !== 1) {
      anomalies.push(`${s.quoi} : limiteur consulté ${String(appelsDuLimiteur)} fois, attendu 1.`);
    }
  }
  return { lignes, anomalies };
}

// ── Le harnais ──────────────────────────────────────────────────────────────────────────────────

/** Le chemin dépôt, sans extension, d'un import relatif ; `null` pour une bibliothèque. */
function cibleDeLImport(fichier: string, specificateur: string): string | null {
  if (!specificateur.startsWith('.')) return null;
  return relative(process.cwd(), resolve(dirname(fichier), specificateur)).replace(/\\/g, '/');
}

/**
 * Les refus d'UNE règle, tels qu'`analyserOutils` les range : la règle vit dans `manifeste.ts`, une
 * fois, et le contrôle la lit au lieu de la retaper.
 */
function regle(analyse: AnalyseManifeste, cle: CleDeControle): string[] {
  return [...analyse.parControle[cle]];
}

const MOTIF_IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;

export async function executerHarnais(a: AdaptateurSoumis): Promise<RapportHarnais> {
  const controles: ResultatControle[] = [];
  const perimetre = jugerPerimetreVide(a);
  const plancherOutils = perimetre.vide ? 0 : 1;
  const dit = (texte: string): string => (perimetre.vide ? `${perimetre.dit}. ${texte}` : texte);
  const premiere = analyserOutils(a.outils);

  {
    const anomalies = [...perimetre.anomalies, ...regle(premiere, 'effect-dataclass')];
    controles.push({
      numero: 1,
      cle: 'effect-dataclass',
      libelle: '`effect` et `dataClass` déclarés, sans valeur par défaut permissive',
      mesures: a.outils.length,
      plancher: plancherOutils,
      anomalies,
      detail: dit(
        `${String(a.outils.length)} outil(s) confronté(s) à ${String(EFFECTS.length)} effect(s) et ${String(DATA_CLASSES.length)} dataClass.`
      ),
    });
  }
  {
    const anomalies: string[] = [];
    for (const f of a.fichiers) {
      for (const { nom, motif } of MOTIFS_ACCES_SECRET) {
        if (motif.test(f.source))
          anomalies.push(
            `${f.chemin} : motif « ${nom} » — un adaptateur ne lit jamais l'environnement directement.`
          );
      }
    }
    controles.push({
      numero: 2,
      cle: 'acces-secret',
      libelle: 'Aucun accès direct à `process.env` ni à un secret',
      mesures: a.fichiers.length,
      plancher: PLANCHER_FICHIERS,
      anomalies,
      detail: `${String(a.fichiers.length)} fichier(s) lu(s) EN BRUT, ${String(MOTIFS_ACCES_SECRET.length)} motif(s) : ${MOTIFS_ACCES_SECRET.map((m) => m.nom).join(', ')}.`,
    });
  }
  {
    const anomalies: string[] = [];
    const autorises = new Map(a.symbolesAutorises.map((s) => [s.module, new Set(s.symboles)]));
    let confrontes = 0;
    for (const f of a.fichiers) {
      for (const m of f.source.matchAll(MOTIF_IMPORT)) {
        if (m[1] !== undefined) continue; // un type n'existe pas à l'exécution
        const cible = cibleDeLImport(f.chemin, m[3] ?? '');
        if (cible === null || cible.startsWith(`${RACINE_ADAPTATEUR}/`)) continue;
        for (const brut of (m[2] ?? '').split(',')) {
          const symbole = brut.trim().split(/\s+as\s+/)[0] ?? '';
          if (symbole === '' || symbole.startsWith('type ')) continue;
          confrontes += 1;
          if (!autorises.get(cible)?.has(symbole))
            anomalies.push(`${f.chemin} → ${symbole} depuis ${cible}, hors de la liste NOMMÉE.`);
        }
      }
    }
    controles.push({
      numero: 3,
      cle: 'couche-service',
      libelle: 'Aucun import de la couche service hors de la liste nommée',
      mesures: confrontes,
      plancher: plancherOutils,
      anomalies,
      detail: dit(
        `${String(confrontes)} import(s) de la couche service confronté(s) à ${String(a.symbolesAutorises.length)} module(s) autorisé(s).`
      ),
    });
  }
  {
    const anomalies: string[] = [];
    let executes = 0;
    for (const outil of a.outils) {
      let charge: unknown;
      try {
        charge = JSON.parse(readFileSync(join(RACINE_ADAPTATEUR, outil.fixtureMax), 'utf8'));
      } catch {
        anomalies.push(`« ${outil.name} » : jeu maximal ${outil.fixtureMax} illisible.`);
        continue;
      }
      executes += 1;
      const octets = octetsCanoniques(versValeurJson(charge, outil.fixtureMax));
      if (octets > outil.maxBytes)
        anomalies.push(
          `« ${outil.name} » : ${String(octets)} octets pour un maxBytes de ${String(outil.maxBytes)}.`
        );
    }
    controles.push({
      numero: 4,
      cle: 'maxbytes-fixtures',
      libelle: 'Aucune sortie ne dépasse son `maxBytes` sur son `fixtureMax`',
      mesures: executes,
      plancher: a.outils.length,
      anomalies,
      detail: dit(
        `${String(executes)} jeu(x) maximal(aux) exécuté(s) pour ${String(a.outils.length)} outil(s).`
      ),
    });
  }
  {
    const anomalies = regle(premiere, 'prefixes-derives');
    const noms = a.outils.map((o) => nomComplet(o.name));
    controles.push({
      numero: 5,
      cle: 'prefixes-derives',
      libelle: "Les préfixes sont dérivés de l'id",
      mesures: a.outils.length,
      plancher: plancherOutils,
      anomalies,
      detail: dit(
        `${String(noms.length)} nom(s) complet(s) dérivé(s) du préfixe « ${ID_ADAPTATEUR} ».`
      ),
    });
  }
  {
    const anomalies: string[] = [];
    const seconde = analyserOutils(a.outils);
    if (texteDuManifeste(premiere.brouillon) !== texteDuManifeste(seconde.brouillon)) {
      anomalies.push('deux productions du même manifeste donnent deux textes différents.');
    }
    const attendus = perimetre.vide
      ? ["tools : vide — un adaptateur sans outil n'expose rien."]
      : [];
    const propres = regle(premiere, 'manifeste-sha-stable');
    if (canoniser(propres) !== canoniser(attendus)) {
      anomalies.push(`refus du manifeste inattendus : ${propres.join(' · ') || '(aucun)'}.`);
    }
    anomalies.push(...confronterManifesteVersionne(a.manifesteVersionne, a.outils));
    const doc = documentDuManifeste(premiere);
    controles.push({
      numero: 6,
      cle: 'manifeste-sha-stable',
      libelle:
        'Le manifeste est produit, son SHA est stable, et le fichier versionné est celui du code',
      mesures: 2,
      plancher: 2,
      anomalies,
      detail:
        `2 productions comparées, et confrontées à ${CHEMIN_DU_MANIFESTE} · ${doc.manifestSha} · ` +
        `état « ${doc.etat} »${doc.refus.length > 0 ? `, refus nommé : ${doc.refus.join(' · ')}` : ''}.`,
    });
  }
  {
    const anomalies = regle(premiere, 'autorisation-hors-input');
    controles.push({
      numero: 7,
      cle: 'autorisation-hors-input',
      libelle: "Aucun champ d'autorisation ne provient du schéma d'entrée",
      mesures: a.outils.length,
      plancher: plancherOutils,
      anomalies,
      detail: dit(
        `${String(a.outils.length)} schéma(s) d'entrée confronté(s), fermeture comprise, à ${String(NOMS_RESERVES_AU_CONTEXTE.length)} nom(s) réservé(s) : ${NOMS_RESERVES_AU_CONTEXTE.join(', ')}.`
      ),
    });
  }
  {
    const sonde = await sonder(a);
    controles.push({
      numero: 8,
      cle: 'route-serrure',
      libelle: 'La porte : 503 sans secret, 401 secret faux, et le limiteur avant la serrure',
      mesures: sonde.lignes.length,
      plancher: 5,
      anomalies: sonde.anomalies,
      detail: sonde.lignes.join(' ; ') + '.',
    });
  }
  {
    const anomalies: string[] = [];
    const chemins = a.fichiers.map((f) => f.chemin);
    if (new Set(chemins).size !== chemins.length) anomalies.push('un fichier compté deux fois.');
    controles.push({
      numero: 9,
      cle: 'compte-fichiers',
      libelle: "La garde annonce combien de fichiers d'adaptateur elle a lus",
      mesures: a.fichiers.length,
      plancher: PLANCHER_FICHIERS,
      anomalies,
      detail: `${String(a.fichiers.length)} fichier(s) lu(s) sous ${RACINE_ADAPTATEUR} : ${chemins.map((c) => c.slice(RACINE_ADAPTATEUR.length + 1)).join(', ')}.`,
    });
  }
  {
    const anomalies = regle(premiere, 'tier2-optionnel');
    const champs = a.outils.reduce((n, o) => n + o.compaction.tier2.length, 0);
    controles.push({
      numero: 0,
      cle: 'tier2-optionnel',
      libelle: '§ 13.3 — tout champ de rang 2 est optionnel au schéma de sortie',
      mesures: a.outils.length,
      plancher: plancherOutils,
      anomalies,
      detail: dit(`${String(champs)} champ(s) de rang 2 confronté(s) aux champs requis.`),
    });
  }
  {
    const canonique = canoniser({
      version: SCEAU_PROFILS.version,
      profils: PROFILS_DU_SOCLE.map((p) => ({ nom: p.nom, depuis: p.depuis })),
    });
    const empreinte = createHash('sha256').update(canonique, 'utf8').digest('hex');
    controles.push({
      numero: 0,
      cle: 'sceau-profils',
      libelle: 'Le sceau des profils, recalculé avec l’algorithme du socle',
      mesures: PROFILS_DU_SOCLE.length,
      plancher: 1,
      anomalies:
        empreinte === SCEAU_PROFILS.empreinte
          ? []
          : [`sceau recalculé ${empreinte}, porté ${SCEAU_PROFILS.empreinte}.`],
      detail: `${String(PROFILS_DU_SOCLE.length)} profil(s) · ${empreinte}.`,
    });
  }

  const anomalies = controles.flatMap((c) => {
    const nom = `contrôle ${c.numero === 0 ? c.cle : String(c.numero)} (${c.cle})`;
    const sous =
      c.mesures < c.plancher
        ? [`${nom} : ${String(c.mesures)} mesuré(s) sous le plancher ${String(c.plancher)}.`]
        : [];
    return [...sous, ...c.anomalies.map((x) => `${nom} : ${x}`)];
  });
  return { controles, anomalies, code: anomalies.length === 0 ? 0 : 1 };
}

export function formaterRapport(r: RapportHarnais): string[] {
  const lignes = [`${r.code === 0 ? '✅' : '❌'} ${ID_REGISTRE} — adaptateur « ${ID_ADAPTATEUR} »`];
  for (const c of r.controles) {
    const vert = c.anomalies.length === 0 && c.mesures >= c.plancher;
    const etiquette = c.numero === 0 ? c.cle : `n°${String(c.numero)}`;
    lignes.push(
      `   ${vert ? 'vert ' : 'ROUGE'} ${etiquette} ${c.libelle} — ${String(c.mesures)} mesuré(s) / plancher ${String(c.plancher)} · ${c.detail}`
    );
  }
  for (const x of r.anomalies) lignes.push(`   · ${x}`);
  return lignes;
}

// ── La commande ─────────────────────────────────────────────────────────────────────────────────

async function principal(): Promise<number> {
  if (process.argv.includes('--ecrire-manifeste')) {
    const doc = documentDuManifeste(analyserOutils(OUTILS));
    writeFileSync(CHEMIN_DU_MANIFESTE, await format(JSON.stringify(doc), { parser: 'json' }));
    console.log(
      `✅ mcp:manifeste:ecrire — ${CHEMIN_DU_MANIFESTE} écrit, ${doc.manifestSha}, état « ${doc.etat} »`
    );
    return 0;
  }
  if (process.argv.includes('--manifeste')) {
    const refus = confronterManifesteVersionne(
      JSON.parse(readFileSync(CHEMIN_DU_MANIFESTE, 'utf8'))
    );
    if (refus.length > 0) {
      console.error(
        [`❌ mcp:manifeste — ${String(refus.length)} refus`, ...refus.map((x) => `   ${x}`)].join(
          '\n'
        )
      );
      return 1;
    }
    console.log(`✅ mcp:manifeste — ${CHEMIN_DU_MANIFESTE} est ce que le code produit`);
    return 0;
  }
  const rapport = await executerHarnais(adaptateurDuDepot());
  (rapport.code === 0 ? console.log : console.error)(formaterRapport(rapport).join('\n'));
  return rapport.code;
}

// GARDÉE : ce module est IMPORTÉ par son test, et l'import ne doit ni juger ni sortir.
const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

if (APPELE_DIRECTEMENT) {
  void principal().then((code) => process.exit(code));
}
