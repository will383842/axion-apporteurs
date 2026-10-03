/**
 * exercice.ts — l'exercice de restauration de Partners (QA-T12, REQ-QA-023).
 *
 * USAGE : pnpm sauvegarde:exercice -- --vidage <fichier> [--verdict <sortie.json>]
 *             restaure le vidage chiffré sur un Postgres ÉPHÉMÈRE, juge, écrit le verdict ;
 *             code 0 si réussi, 1 sinon. Clé : PARTNERS_BACKUP_PASSPHRASE.
 *         La fraîcheur, le rechiffrement et l'exercice du dernier vidage Cloudflare R2 : `cycle.ts`.
 *
 * UNE SAUVEGARDE QU'ON NE RESTAURE PAS N'EST PAS UNE SAUVEGARDE. L'exercice, dans cet ordre :
 *   1. refuse un vidage sans chiffrement client, et déchiffre (AES-256-GCM, `chiffrement.ts`) : un
 *      octet altéré ou une mauvaise clé échouent ICI, avant toute restauration ;
 *   2. restaure sur un Postgres 16 éphémère — l'image épinglée des bancs du dépôt —, détruit à la
 *      fin quoi qu'il arrive, avec `pg_restore --exit-on-error` ;
 *   3. exige `prisma migrate status` propre ;
 *   4. exige au moins une ligne dans la table TÉMOIN, dérivée du schéma : la table d'attribution si
 *      le modèle existe, sinon `_prisma_migrations`, et la substitution est écrite dans le verdict
 *      (arbitrage -d7 sur délégation de Williams du 2026-09-29 : la table d'attribution n'existe
 *      pas encore, et la base sera vide au lancement).
 *
 * RIEN NE SORT DE LA BASE RESTAURÉE. Ni ligne, ni sortie brute de `pg_restore` ou de `prisma` :
 * une erreur de restauration peut citer une ligne de données. Le motif nomme l'ÉTAPE et le code de
 * sortie, jamais le texte. Le verdict ne porte que la date, l'empreinte du fichier, la table
 * témoin, son compte et le motif.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { IMAGE_BASE, prismaCli, RACINE } from '../../tests/integration/harnais';
import { dechiffrer, estChiffre } from './chiffrement';

/** La forme des rôles de Partners : la seule qu'une restauration recrée (décision A02, DM-45). */
export const FORME_DES_ROLES = /^partners_[a-z_]+$/;

/** Ce que le schéma d'un vidage dit des rôles et de la propriété. */
export type RolesDuVidage = {
  /** Les rôles à recréer en NOLOGIN avant la restauration, triés. */
  roles: string[];
  /** Les `ALTER … OWNER TO partners_*` à rejouer APRÈS la restauration, dans l'ordre du vidage. */
  proprietes: string[];
  /** Les rôles nommés par un GRANT hors de `FORME_DES_ROLES` : la restauration ÉCHOUE en les nommant. */
  horsForme: string[];
  /**
   * Les lignes qui donnent la propriété à un rôle `partners_*` SANS avoir la forme ancrée et entière
   * de `FORME_DE_PROPRIETE` (deux instructions collées, casse forgée, objet inattendu) : la
   * restauration ÉCHOUE, rien n'est rejoué (condition de la lentille sécurité, DM-45).
   */
  pieges: string[];
};

/**
 * La SEULE forme d'une propriété rejouée : une instruction entière, ancrée du début à la fin, sur une
 * table ou une séquence nommée par identifiants simples, vers un rôle de `FORME_DES_ROLES`.
 */
export const FORME_DE_PROPRIETE =
  /^ALTER (?:TABLE|SEQUENCE) (?:[a-z_][a-z0-9_]*\.)?"?[a-z_][a-z0-9_]*"? OWNER TO (partners_[a-z_]+);$/;

/**
 * Les rôles et la propriété que le vidage NOMME. Un rôle est un objet GLOBAL du serveur : `pg_dump`
 * ne l'emporte pas, et une restauration sur un serveur neuf s'arrête sur le premier GRANT qui le
 * nomme. `--no-owner` jette de son côté chaque `ALTER … OWNER TO`, et avec lui la propriété du
 * journal (`partners_journal`) : perdue EN SILENCE, l'exercice resterait vert. Tout est DÉRIVÉ du
 * vidage, jamais tapé ici.
 *   — ALTER … OWNER TO <rôle> : seul un rôle de la forme est recréé et sa propriété rejouée ; un autre
 *     propriétaire (celui qui a migré la base source) est celui que `--no-owner` remplace par le
 *     restaurateur, et c'est voulu : il n'est ni créé, ni rejoué, ni refusé.
 *   — GRANT … TO <rôle> : deux bénéficiaires sont EXEMPTÉS — `PUBLIC`, et le propriétaire source
 *     (un rôle hors forme qui n'apparaît que comme cible d'un OWNER TO, et à qui `pg_dump` donne
 *     parfois les droits du schéma public). Tout AUTRE rôle hors de `FORME_DES_ROLES` est une faute
 *     nommée (décision A02, DM-45).
 */
/**
 * QA-T66 — les rôles HORS `FORME_DES_ROLES` qui portent un `ALTER … OWNER TO` : celui qui a migré la
 * base source, triés. Il n'y en a qu'UN au plus ; un second serait un rôle inconnu dont les GRANT
 * seraient exemptés en silence (décision de la coordination du 2026-10-02). Une fonction à part, et
 * non une clé de plus de `RolesDuVidage` : la forme de ce retour est figée par son propre témoin.
 */
export function proprietairesSourceDuVidage(sqlDuSchema: string): string[] {
  const sources = new Set<string>();
  for (const m of sqlDuSchema.matchAll(
    /^ALTER\s.+\sOWNER\s+TO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s*;\s*$/gm
  )) {
    if (!FORME_DES_ROLES.test(m[1]!) && !/^partners_/i.test(m[1]!)) sources.add(m[1]!);
  }
  return [...sources].sort();
}

export function rolesDuVidage(sqlDuSchema: string): RolesDuVidage {
  const roles = new Set<string>();
  const horsForme = new Set<string>();
  const proprietes: string[] = [];
  const proprietairesSource = new Set(proprietairesSourceDuVidage(sqlDuSchema));
  for (const m of sqlDuSchema.matchAll(/^GRANT\s.+?\sTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s*;/gm)) {
    const role = m[1]!;
    if (role.toLowerCase() === 'public' || proprietairesSource.has(role)) continue;
    (FORME_DES_ROLES.test(role) ? roles : horsForme).add(role);
  }
  const pieges: string[] = [];
  // Toute ligne qui VISE un rôle de Partners comme propriétaire, quelle que soit sa casse : elle est
  // rejouée si et seulement si elle a la forme ancrée ; sinon, c'est un piège, et l'exercice échoue.
  // Un autre propriétaire (celui qui a migré la base source) est laissé à `--no-owner`, voulu.
  for (const ligne of sqlDuSchema.split('\n')) {
    if (!/OWNER\s+TO\s+"?partners_/i.test(ligne)) continue;
    const m = FORME_DE_PROPRIETE.exec(ligne);
    if (m === null) {
      pieges.push(ligne);
      continue;
    }
    roles.add(m[1]!);
    proprietes.push(ligne);
  }
  return {
    roles: [...roles].sort(),
    proprietes,
    horsForme: [...horsForme].sort(),
    pieges,
  };
}

/**
 * Le jugement des rôles, AVANT toute création de rôle et toute restauration : le motif de l'échec,
 * ou `null`. Il nomme des RÔLES, jamais une ligne du vidage (« rien ne sort de la base restaurée ») ;
 * une ligne piégée n'est que comptée.
 */
export function jugerLesRoles(
  lu: RolesDuVidage,
  proprietairesSource: readonly string[]
): string | null {
  if (proprietairesSource.length > 1)
    return `restauration : [proprietaires_multiples] plus d’un propriétaire source dans le vidage — ${proprietairesSource.join(', ')}`;
  if (lu.horsForme.length > 0)
    return `restauration : rôle hors de la forme partners_* — ${lu.horsForme.join(', ')}`;
  if (lu.pieges.length > 0)
    return `restauration : ${lu.pieges.length} propriété(s) hors de la forme ancrée, rien n'est rejoué`;
  return null;
}

/**
 * QA-T70 — LE plan de la propriété, UNIQUE, partagé par l'exercice et par la porte D : les rôles de la
 * forme à créer AVANT la restauration (`--no-owner`), puis les `ALTER … OWNER TO partners_*` à rejouer
 * APRÈS, dans l'ordre du vidage. Une faute (rôle hors de la forme, propriété piégée, propriétaires
 * source multiples) rend la faute nommée, et AUCUN plan : rien n'est rejoué.
 */
export function planDeLaPropriete(
  sqlDuSchema: string
): { faute: string } | { avant: string[]; apres: string[] } {
  const lu = rolesDuVidage(sqlDuSchema);
  const faute = jugerLesRoles(lu, proprietairesSourceDuVidage(sqlDuSchema));
  if (faute !== null) return { faute };
  return {
    avant: lu.roles.map(
      (role) =>
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`
    ),
    apres: lu.proprietes,
  };
}

/**
 * La sortie du plan pour la ligne de commande (`--plan-de-propriete avant|apres`, schéma du vidage
 * sur l'entrée standard) : une instruction par ligne, ou la faute, en échec fermé.
 */
export function sortieDuPlan(
  moment: 'avant' | 'apres',
  sqlDuSchema: string
): { code: 0 | 1; texte: string } {
  const plan = planDeLaPropriete(sqlDuSchema);
  if ('faute' in plan) return { code: 1, texte: `❌ ${plan.faute}\n` };
  const lignes = plan[moment];
  return { code: 0, texte: lignes.length === 0 ? '' : `${lignes.join('\n')}\n` };
}

export type Verdict = {
  date: string;
  verdict: 'reussi' | 'echec';
  empreinteVidage: string;
  temoin: { table: string; lignes: number; substitution: boolean };
  motif: string | null;
};

const JOUR_MS = 86_400_000;

/** La table témoin : celle du modèle d'attribution s'il existe (nom lu dans `@@map`), sinon les migrations. */
export function tableTemoin(schema: string): { table: string; substitution: boolean } {
  const bloc = /model\s+Attribution\s*\{([\s\S]*?)\n\}/.exec(schema);
  if (!bloc) return { table: '_prisma_migrations', substitution: true };
  const carte = /@@map\("([^"]+)"\)/.exec(bloc[1] ?? '');
  return { table: carte?.[1] ?? 'Attribution', substitution: false };
}

export function jugerFraicheur(
  v: Verdict | null,
  maintenant: Date,
  seuilJours: number
): { ok: true; ageJours: number } | { ok: false; motif: string } {
  if (v === null) return { ok: false, motif: 'aucun verdict d’exercice lisible' };
  const date = Date.parse(v.date);
  if (Number.isNaN(date)) return { ok: false, motif: 'verdict sans date lisible' };
  const ageJours = Math.floor((maintenant.getTime() - date) / JOUR_MS);
  if (v.verdict !== 'reussi')
    return { ok: false, motif: `dernier exercice en échec (${v.motif ?? 'motif absent'})` };
  if (ageJours > seuilJours) {
    return {
      ok: false,
      motif: `dernier exercice réussi il y a ${ageJours} jours, au-delà de ${seuilJours}`,
    };
  }
  return { ok: true, ageJours };
}

/**
 * `inspecter`, pour les témoins seulement : lit la base restaurée AVANT sa destruction, par des
 * requêtes dont rien ne sort du verdict (propriétaire et droits du journal, DM-45).
 */
export async function exercer(
  fichier: string,
  schema: string,
  phrase: string,
  inspecter?: (requete: (sql: string) => string) => void | Promise<void>
): Promise<Verdict> {
  const brut = readFileSync(fichier);
  const temoin = tableTemoin(schema);
  const base: Verdict = {
    date: new Date().toISOString(),
    verdict: 'echec',
    empreinteVidage: createHash('sha256').update(brut).digest('hex'),
    temoin: { ...temoin, lignes: 0 },
    motif: null,
  };
  const echec = (motif: string): Verdict => ({ ...base, motif });

  if (!estChiffre(brut)) return echec('vidage non chiffré côté client : refusé sans restauration');
  let vidage: Buffer;
  try {
    vidage = dechiffrer(brut, phrase);
  } catch (e) {
    return echec(`déchiffrement : ${(e as Error).message}`);
  }

  const pg = await new PostgreSqlContainer(IMAGE_BASE).start();
  /** Une instruction contre la base restaurée ; le texte de la sortie, jamais journalisé. */
  const psql = (requete: string) =>
    spawnSync(
      'docker',
      [
        'exec',
        pg.getId(),
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        pg.getUsername(),
        '-d',
        pg.getDatabase(),
        '-tAc',
        requete,
      ],
      { encoding: 'utf8' }
    );
  try {
    // TROIS TEMPS, comme une remise en service réelle (runbook ; décision A02, DM-45).
    // 1. Les rôles d'abord : lus dans le SCHÉMA du vidage, filtrés par `FORME_DES_ROLES`, créés
    //    NOLOGIN, sans mot de passe. Un rôle hors de la forme fait échouer, nommé.
    const schemaSql = spawnSync(
      'docker',
      ['exec', '-i', pg.getId(), 'pg_restore', '--schema-only', '-f', '-'],
      { input: vidage, maxBuffer: 64 * 1024 * 1024 }
    );
    if (schemaSql.status !== 0)
      return echec(`restauration : lecture du schéma du vidage sort en ${schemaSql.status}`);
    // Le plan UNIQUE (QA-T70), partagé avec la porte D. La faute nomme des rôles et compte les
    // lignes piégées, jamais leur texte : une ligne piégée peut porter n'importe quoi.
    const plan = planDeLaPropriete(schemaSql.stdout.toString('utf8'));
    if ('faute' in plan) return echec(plan.faute);
    for (const creation of plan.avant) {
      const cree = psql(creation);
      if (cree.status !== 0)
        return echec(`restauration : création d’un rôle de la forme sort en ${cree.status}`);
    }

    const restauration = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        pg.getId(),
        'pg_restore',
        '--exit-on-error',
        '--no-owner',
        '-U',
        pg.getUsername(),
        '-d',
        pg.getDatabase(),
      ],
      { input: vidage, maxBuffer: 64 * 1024 * 1024 }
    );
    if (restauration.status !== 0)
      return echec(`restauration : pg_restore sort en ${restauration.status}`);

    // 3. La propriété rejouée : `--no-owner` a jeté chaque `ALTER … OWNER TO`, et avec lui le
    //    propriétaire du journal. Seules les instructions vers un rôle de la forme sont rejouées.
    for (const propriete of plan.apres) {
      const rejouee = psql(propriete);
      if (rejouee.status !== 0)
        return echec(`restauration : propriété non rejouée, psql sort en ${rejouee.status}`);
    }
    await inspecter?.((requete) => {
      const r = psql(requete);
      if (r.status !== 0) throw new Error(`inspection : psql sort en ${r.status}`);
      return (r.stdout ?? '').trim();
    });

    try {
      prismaCli(pg.getConnectionUri(), [
        'migrate',
        'status',
        '--schema',
        join(RACINE, 'prisma/schema.prisma'),
      ]);
    } catch {
      return echec('migrations : prisma migrate status n’est pas propre');
    }

    const compte = spawnSync(
      'docker',
      [
        'exec',
        pg.getId(),
        'psql',
        '-U',
        pg.getUsername(),
        '-d',
        pg.getDatabase(),
        '-tAc',
        `SELECT count(*) FROM "${temoin.table}"`,
      ],
      { encoding: 'utf8' }
    );
    const lignes = Number((compte.stdout ?? '').trim());
    if (compte.status !== 0 || !Number.isInteger(lignes))
      return echec(`témoin : comptage de ${temoin.table} impossible`);
    if (lignes < 1)
      return { ...echec(`témoin : ${temoin.table} est vide`), temoin: { ...temoin, lignes } };
    return { ...base, verdict: 'reussi', temoin: { ...temoin, lignes } };
  } finally {
    await pg.stop();
  }
}

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function principal(): Promise<number> {
  // QA-T70 : la porte D lit le plan de la propriété, le schéma du vidage sur l'entrée standard.
  const moment = arg('--plan-de-propriete');
  if (moment !== undefined) {
    if (moment !== 'avant' && moment !== 'apres')
      throw new Error('usage : --plan-de-propriete avant|apres < schéma du vidage');
    const { code, texte } = sortieDuPlan(moment, readFileSync(0, 'utf8'));
    (code === 0 ? process.stdout : process.stderr).write(texte);
    return code;
  }
  const fichier = arg('--vidage');
  if (!fichier) throw new Error('usage : --vidage <fichier> [--verdict <sortie.json>]');
  const phrase = process.env.PARTNERS_BACKUP_PASSPHRASE ?? '';
  const v = await exercer(
    fichier,
    readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8'),
    phrase
  );
  const sortie = arg('--verdict');
  if (sortie) writeFileSync(sortie, `${JSON.stringify(v, null, 2)}\n`);
  const temoin = `${v.temoin.table}${v.temoin.substitution ? ' (témoin de substitution : table d’attribution absente du schéma)' : ''}`;
  if (v.verdict === 'reussi') {
    console.log(
      `✅ exercice réussi — ${v.temoin.lignes} ligne(s) dans ${temoin}, migrations propres, empreinte ${v.empreinteVidage}`
    );
    return 0;
  }
  console.error(`❌ exercice en échec — ${v.motif} (empreinte ${v.empreinteVidage})`);
  return 1;
}

const APPELE_DIRECTEMENT = /exercice\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  principal().then(
    (code) => {
      process.exitCode = code;
    },
    (e: Error) => {
      console.error(`❌ ${e.message}`);
      process.exitCode = 1;
    }
  );
}
