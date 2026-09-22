/**
 * migrations-additive.ts — les migrations sont ADDITIVES (DM-02 ; REQ-DM-037).
 * Registre : `partners:migrations:additive`.
 *
 * USAGE : pnpm partners:migrations:additive           (échoue sur toute migration destructive)
 *         pnpm partners:migrations:additive --prove   (un témoin par famille, cible dans la migration
 *                                                      du MILIEU ; contre-témoins verts)
 *
 * CE QU'ELLE TIENT. REQ-DM-037 : « Les migrations sont additives (aucune suppression de colonne ni
 * changement d'enum destructif sans ADR). » Une migration fusionnée se rejoue sur une base qui porte
 * des données : ce qu'elle retire ne revient pas, et la version N−1 du code qui tourne encore
 * pendant le déploiement lit une colonne qui n'existe plus.
 *
 * ELLE LIT TOUTES LES MIGRATIONS SUIVIES, pas celles de la PR : une migration qu'on réécrit après
 * coup est aussi destructive qu'une migration neuve. Le SQL se lit par le lecteur unique
 * (`scripts/lot/lecteur-prisma.ts`) : les mots d'un littéral ne comptent pas — le
 * `RAISE EXCEPTION '… DELETE …'` d'un déclencheur n'est pas un `DELETE`. Le corps d'un `DO` ou
 * d'une fonction, lui, EST du SQL : il se relit, et une instruction destructive n'y échappe pas.
 *
 * LES FAMILLES. `suppression_de_colonne` ; `suppression_de_table` (`DROP TABLE`, `DROP SCHEMA`) ;
 * `renommage` (colonne, table) ; `enum_destructif` (`DROP TYPE`, `ALTER TYPE … RENAME VALUE`,
 * `ALTER TYPE … RENAME TO`) ; `type_de_colonne_change` (`ALTER COLUMN … TYPE`) ;
 * `non_null_sans_defaut` (`SET NOT NULL`, ou `ADD COLUMN … NOT NULL` sans `DEFAULT` sur une table qui
 * n'est pas créée par la même migration) ; `index_brut_supprime` (`DROP INDEX` — `migrate diff`
 * propose le `DROP` des index écrits en SQL brut qu'il ne modélise pas) ; `journal_desarme`
 * (`DROP TRIGGER` sur une table protégée, `DISABLE TRIGGER` ou `ENABLE REPLICA TRIGGER` sur elle,
 * `DROP` ou `CREATE OR REPLACE` d'une fonction de protection, `session_replication_role`) ;
 * `sql_dynamique` (`EXECUTE` dans un corps : ce qu'il exécute ne se lit pas) ; `migration_illisible` ;
 * `perimetre_vide` (aucune migration).
 *
 * LA PROTECTION EST DÉRIVÉE DU SQL, PAS RECOPIÉE (RM-01). Une table est protégée si une migration
 * suivie y pose un déclencheur sur `UPDATE`, `DELETE` ou `TRUNCATE` ; sa fonction l'est avec elle.
 * La garde ne nomme aucune table : le journal append-only de la première migration est protégé
 * parce que ses déclencheurs le disent, et toute table protégée demain l'est sans retouche ici.
 *
 * LA SEULE ABSOLUTION. Première ligne `-- ADR: partners/ADR-NNNN` ET `docs/adr/NNNN-*.md` au statut
 * `accepte`. Les fautes absoutes sont IMPRIMÉES avec leur ADR, jamais tues. Une ADR citée qui
 * n'existe pas, ou qui n'est pas acceptée, n'absout rien. `migration_illisible` ne s'absout pas :
 * ce qu'on n'a pas lu, on ne peut pas le pardonner.
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne juge pas les données (`DELETE`, `UPDATE`, `TRUNCATE` : REQ-DM-037
 * parle du schéma), ni un SQL assemblé hors d'un `EXECUTE`. Le dump N−1 et le `migrate diff` vide
 * relèvent de la Gate D de la zone qualité, qui importe cette garde au lieu d'en écrire une seconde.
 *
 * ⚠️ ET SURTOUT, CINQ FORMES DE `DROP` QU'ELLE NE VOIT PAS, mesurées le 2026-09-22 : `ALTER TABLE …
 * DROP CONSTRAINT`, `DROP VIEW`, `DROP MATERIALIZED VIEW`, `DROP SEQUENCE`, `DROP DATABASE` sortent
 * en 0. Ce n'est écrit ici que parce que le registre annonçait « DROP, RENAME et NOT NULL sans
 * défaut interdits hors ADR » — plus large que ce que ces lignes tiennent : un relecteur qui lit le
 * registre avant le code croyait protégé ce qui ne l'est pas. Le texte du registre est désormais
 * resserré forme par forme ; ÉLARGIR la garde à ces cinq-là appartient à `QA-T11`, qui la porte.
 * Les deux vont ensemble : le jour où elles rougissent, le registre change dans le même commit.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne lit rien du dépôt : chaque témoin est une vue
 * injectée de TROIS migrations, la faute posée dans celle du MILIEU.
 */

import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import {
  ErreurLecturePrisma,
  lireMigrationSql,
  type InstructionSql,
  type JetonSql,
} from '../lot/lecteur-prisma';
import { entrees } from '../adr/index';

export type Migration = { chemin: string; contenu: string };
export type AdrConnue = { numero: string; statut: string };
export type Vue = { migrations: Migration[]; adrs: AdrConnue[] };
export type Faute = { famille: string; chemin: string; ligne: number; message: string };
export type Verdict = {
  fautes: Faute[];
  absoutes: (Faute & { adr: string })[];
  migrations: number;
  instructions: number;
  /** Les déclencheurs de protection lus dans les migrations — le périmètre de `journal_desarme`. */
  protections: number;
};

/** Ce que les migrations ont armé : les tables protégées et les fonctions de leurs déclencheurs. */
export type Protection = { tables: Set<string>; fonctions: Set<string>; declencheurs: number };

export const FAMILLES: { nom: string; explication: string }[] = [
  { nom: 'perimetre_vide', explication: 'aucune migration lue : un zéro n’est pas un vert.' },
  {
    nom: 'migration_illisible',
    explication:
      'un littéral, un corps ou un commentaire non terminé : la migration ne se lit pas.',
  },
  { nom: 'suppression_de_colonne', explication: '`ALTER TABLE … DROP [COLUMN]`.' },
  { nom: 'suppression_de_table', explication: '`DROP TABLE`, `DROP SCHEMA`.' },
  { nom: 'renommage', explication: '`ALTER TABLE … RENAME` d’une colonne ou d’une table.' },
  {
    nom: 'enum_destructif',
    explication: '`DROP TYPE`, `ALTER TYPE … RENAME VALUE`, `ALTER TYPE … RENAME TO`.',
  },
  { nom: 'type_de_colonne_change', explication: '`ALTER COLUMN … [SET DATA] TYPE`.' },
  {
    nom: 'non_null_sans_defaut',
    explication:
      '`SET NOT NULL`, ou `ADD COLUMN … NOT NULL` sans `DEFAULT` sur une table existante.',
  },
  {
    nom: 'index_brut_supprime',
    explication: '`DROP INDEX` — un index SQL brut que Prisma ignore.',
  },
  {
    nom: 'journal_desarme',
    explication:
      'une protection posée par une migration (déclencheur sur UPDATE, DELETE ou TRUNCATE, sa ' +
      'fonction) désarmée — déclencheur retiré ou éteint, fonction remplacée, réplication.',
  },
  {
    nom: 'sql_dynamique',
    explication: '`EXECUTE` dans un corps : ce qu’il exécute ne se lit pas.',
  },
];
const NOMS_FAMILLES = FAMILLES.map((f) => f.nom);

// ── lecture des jetons ───────────────────────────────────────────────────────

const estMot = (j: JetonSql | undefined, ...mots: string[]): boolean =>
  j !== undefined && j.type === 'mot' && mots.includes(j.valeur.toUpperCase());
const estSymbole = (j: JetonSql | undefined, s: string): boolean =>
  j !== undefined && j.type === 'symbole' && j.valeur === s;
const estNom = (j: JetonSql | undefined): boolean =>
  j !== undefined && (j.type === 'mot' || j.type === 'identifiant');
const nomSql = (j: JetonSql | undefined): string =>
  j === undefined ? '?' : j.type === 'mot' ? j.valeur.toLowerCase() : j.valeur;

/** Un nom éventuellement qualifié (`public.releves`) : rend sa DERNIÈRE partie et la position suivante. */
function nomQualifie(t: JetonSql[], k: number): { nom: string; suivant: number } {
  let nom = nomSql(t[k]);
  let i = k + 1;
  while (estSymbole(t[i], '.') && estNom(t[i + 1])) {
    nom = nomSql(t[i + 1]);
    i += 2;
  }
  return { nom, suivant: i };
}

/** Saute `IF EXISTS` / `IF NOT EXISTS`. */
function sauterSi(t: JetonSql[], k: number): number {
  if (!estMot(t[k], 'IF')) return k;
  return estMot(t[k + 1], 'NOT') ? k + 3 : k + 2;
}

/** Les actions d'un `ALTER TABLE`, coupées sur les virgules de premier niveau. */
function actions(t: JetonSql[], debut: number): JetonSql[][] {
  const sortie: JetonSql[][] = [[]];
  let profondeur = 0;
  for (let i = debut; i < t.length; i++) {
    const j = t[i]!;
    if (estSymbole(j, '(')) profondeur++;
    else if (estSymbole(j, ')')) profondeur--;
    else if (profondeur === 0 && estSymbole(j, ',')) {
      sortie.push([]);
      continue;
    }
    sortie[sortie.length - 1]!.push(j);
  }
  return sortie.filter((a) => a.length > 0);
}

type Constat = { famille: string; ligne: number; objet: string; quoi: string };

/** Les tables créées par une migration : un `ADD COLUMN … NOT NULL` y est légitime. */
function tablesCreees(instructions: InstructionSql[]): Set<string> {
  const sortie = new Set<string>();
  for (const instr of instructions) {
    const t = instr.jetons;
    if (estMot(t[0], 'CREATE') && estMot(t[1], 'TABLE')) {
      sortie.add(nomQualifie(t, sauterSi(t, 2)).nom);
    }
  }
  return sortie;
}

/**
 * Les protections qu'une migration pose : `CREATE [OR REPLACE] [CONSTRAINT] TRIGGER <nom> <moment>
 * <événements> ON <table> … EXECUTE FUNCTION|PROCEDURE <fonction>` dont les événements comptent
 * `UPDATE`, `DELETE` ou `TRUNCATE`. Le moment n'est pas filtré : un déclencheur `AFTER` qui lève
 * refuse aussi, et le retirer se juge pareil (échec fermé ; une ADR acceptée absout).
 */
function ajouterProtections(instructions: InstructionSql[], p: Protection): void {
  for (const instr of instructions) {
    const t = instr.jetons;
    if (!estMot(t[0], 'CREATE')) continue;
    let k = 1;
    if (estMot(t[k], 'OR') && estMot(t[k + 1], 'REPLACE')) k += 2;
    if (estMot(t[k], 'CONSTRAINT')) k++;
    if (!estMot(t[k], 'TRIGGER')) continue;
    const on = t.findIndex((j, n) => n > k + 1 && estMot(j, 'ON'));
    const execute = t.findIndex((j, n) => n > on && estMot(j, 'EXECUTE'));
    if (on < 0 || execute < 0 || !estMot(t[execute + 1], 'FUNCTION', 'PROCEDURE')) continue;
    if (!t.slice(k + 2, on).some((j) => estMot(j, 'UPDATE', 'DELETE', 'TRUNCATE'))) continue;
    p.tables.add(nomQualifie(t, on + 1).nom);
    p.fonctions.add(nomQualifie(t, execute + 2).nom);
    p.declencheurs++;
  }
}

/** Les protections de TOUTES les migrations lisibles : ce qu'une migration arme, une autre le désarme. */
export function protectionsDe(migrations: Migration[]): Protection {
  const p: Protection = { tables: new Set(), fonctions: new Set(), declencheurs: 0 };
  for (const m of migrations) {
    try {
      ajouterProtections(lireMigrationSql(m.contenu), p);
    } catch (e) {
      // Illisible : `controler` la rend en `migration_illisible`, qui ne s'absout pas.
      if (!(e instanceof ErreurLecturePrisma)) throw e;
    }
  }
  return p;
}

/** Les actions d'un `ALTER TABLE <table>` à la position `k` (qui pointe sur `ALTER`). */
function constatsAlterTable(
  t: JetonSql[],
  k: number,
  creees: Set<string>,
  protection: Protection
): Constat[] {
  const sortie: Constat[] = [];
  let i = sauterSi(t, k + 2);
  if (estMot(t[i], 'ONLY')) i++;
  const { nom: table, suivant } = nomQualifie(t, i);
  i = suivant;
  if (estSymbole(t[i], '*')) i++;
  for (const a of actions(t, i)) {
    const ligne = a[0]!.ligne;
    const [a0, a1] = a;
    if (estMot(a0, 'DROP')) {
      if (estMot(a1, 'CONSTRAINT')) continue;
      const c = estMot(a1, 'COLUMN') ? sauterSi(a, 2) : 1;
      sortie.push({
        famille: 'suppression_de_colonne',
        ligne,
        objet: `${table}.${nomSql(a[c])}`,
        quoi: 'DROP COLUMN',
      });
    } else if (estMot(a0, 'RENAME')) {
      if (estMot(a1, 'TO')) {
        sortie.push({
          famille: 'renommage',
          ligne,
          objet: table,
          quoi: `RENAME TO ${nomSql(a[2])}`,
        });
      } else if (!estMot(a1, 'CONSTRAINT')) {
        const c = estMot(a1, 'COLUMN') ? 2 : 1;
        sortie.push({
          famille: 'renommage',
          ligne,
          objet: `${table}.${nomSql(a[c])}`,
          quoi: `RENAME COLUMN … TO ${nomSql(a[c + 2])}`,
        });
      }
    } else if (estMot(a0, 'ALTER')) {
      const c = estMot(a1, 'COLUMN') ? 2 : 1;
      const colonne = `${table}.${nomSql(a[c])}`;
      const suite = a.slice(c + 1);
      if (estMot(suite[0], 'TYPE') || (estMot(suite[0], 'SET') && estMot(suite[1], 'DATA'))) {
        sortie.push({
          famille: 'type_de_colonne_change',
          ligne,
          objet: colonne,
          quoi: 'ALTER COLUMN … TYPE',
        });
      } else if (estMot(suite[0], 'SET') && estMot(suite[1], 'NOT') && estMot(suite[2], 'NULL')) {
        sortie.push({
          famille: 'non_null_sans_defaut',
          ligne,
          objet: colonne,
          quoi: 'SET NOT NULL',
        });
      }
    } else if (estMot(a0, 'ADD')) {
      if (estMot(a1, 'CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'EXCLUDE')) continue;
      const c = estMot(a1, 'COLUMN') ? sauterSi(a, 2) : 1;
      const nonNull = a.some((j, n) => estMot(j, 'NOT') && estMot(a[n + 1], 'NULL'));
      const defaut = a.some((j) => estMot(j, 'DEFAULT', 'GENERATED'));
      if (nonNull && !defaut && !creees.has(table)) {
        sortie.push({
          famille: 'non_null_sans_defaut',
          ligne,
          objet: `${table}.${nomSql(a[c])}`,
          quoi: 'ADD COLUMN … NOT NULL sans DEFAULT',
        });
      }
    } else if (protection.tables.has(table) && estMot(a0, 'DISABLE') && estMot(a1, 'TRIGGER')) {
      sortie.push({ famille: 'journal_desarme', ligne, objet: table, quoi: 'DISABLE TRIGGER' });
    } else if (
      protection.tables.has(table) &&
      estMot(a0, 'ENABLE') &&
      estMot(a1, 'REPLICA') &&
      estMot(a[2], 'TRIGGER')
    ) {
      sortie.push({
        famille: 'journal_desarme',
        ligne,
        objet: table,
        quoi: 'ENABLE REPLICA TRIGGER',
      });
    }
  }
  return sortie;
}

/**
 * Les constats d'UNE instruction. Chaque position où commence un `DROP`, un `ALTER`, un `CREATE`
 * ou un `SET` est examinée — pas la seule tête : dans un corps plpgsql, `BEGIN ALTER TABLE …` est
 * une instruction qui ne commence pas par son verbe.
 */
function constatsDe(
  instr: InstructionSql,
  creees: Set<string>,
  dansUnCorps: boolean,
  protection: Protection
): Constat[] {
  const t = instr.jetons;
  const sortie: Constat[] = [];
  for (let k = 0; k < t.length; k++) {
    const j = t[k]!;
    const ligne = j.ligne;
    if (estMot(j, 'DROP')) {
      const genre = t[k + 1];
      if (estMot(genre, 'TABLE', 'SCHEMA')) {
        let i = sauterSi(t, k + 2);
        for (;;) {
          const { nom, suivant } = nomQualifie(t, i);
          sortie.push({
            famille: 'suppression_de_table',
            ligne,
            objet: nom,
            quoi: `DROP ${genre!.valeur.toUpperCase()}`,
          });
          if (!estSymbole(t[suivant], ',')) break;
          i = suivant + 1;
        }
      } else if (estMot(genre, 'TYPE')) {
        sortie.push({
          famille: 'enum_destructif',
          ligne,
          objet: nomQualifie(t, sauterSi(t, k + 2)).nom,
          quoi: 'DROP TYPE',
        });
      } else if (estMot(genre, 'INDEX')) {
        let i = k + 2;
        if (estMot(t[i], 'CONCURRENTLY')) i++;
        sortie.push({
          famille: 'index_brut_supprime',
          ligne,
          objet: nomQualifie(t, sauterSi(t, i)).nom,
          quoi: 'DROP INDEX',
        });
      } else if (estMot(genre, 'TRIGGER')) {
        const { nom, suivant } = nomQualifie(t, sauterSi(t, k + 2));
        const table = estMot(t[suivant], 'ON') ? nomQualifie(t, suivant + 1).nom : '';
        if (protection.tables.has(table)) {
          sortie.push({
            famille: 'journal_desarme',
            ligne,
            objet: `${table}.${nom}`,
            quoi: 'DROP TRIGGER',
          });
        }
      } else if (estMot(genre, 'FUNCTION', 'PROCEDURE')) {
        const { nom } = nomQualifie(t, sauterSi(t, k + 2));
        if (protection.fonctions.has(nom)) {
          sortie.push({ famille: 'journal_desarme', ligne, objet: nom, quoi: 'DROP FUNCTION' });
        }
      }
    } else if (estMot(j, 'ALTER') && estMot(t[k + 1], 'TABLE')) {
      sortie.push(...constatsAlterTable(t, k, creees, protection));
    } else if (estMot(j, 'ALTER') && estMot(t[k + 1], 'TYPE')) {
      const { nom, suivant } = nomQualifie(t, k + 2);
      if (estMot(t[suivant], 'RENAME')) {
        const quoi = estMot(t[suivant + 1], 'VALUE')
          ? 'ALTER TYPE … RENAME VALUE'
          : 'ALTER TYPE … RENAME TO';
        sortie.push({ famille: 'enum_destructif', ligne, objet: nom, quoi });
      }
    } else if (estMot(j, 'CREATE') && estMot(t[k + 1], 'OR') && estMot(t[k + 2], 'REPLACE')) {
      const genre = t[k + 3];
      if (estMot(genre, 'FUNCTION', 'PROCEDURE')) {
        const { nom } = nomQualifie(t, k + 4);
        if (protection.fonctions.has(nom)) {
          sortie.push({
            famille: 'journal_desarme',
            ligne,
            objet: nom,
            quoi: 'CREATE OR REPLACE FUNCTION',
          });
        }
      } else if (estMot(genre, 'TRIGGER') || estMot(t[k + 4], 'TRIGGER')) {
        // Remplacer un déclencheur d'une table protégée, c'est pouvoir lui donner une fonction qui
        // laisse passer : une protection neuve se pose par `CREATE TRIGGER`, qui ne remplace rien.
        const on = t.findIndex((x, n) => n > k + 4 && estMot(x, 'ON'));
        const table = on < 0 ? '' : nomQualifie(t, on + 1).nom;
        if (protection.tables.has(table)) {
          sortie.push({
            famille: 'journal_desarme',
            ligne,
            objet: table,
            quoi: 'CREATE OR REPLACE TRIGGER',
          });
        }
      }
    } else if (
      estMot(j, 'SET') &&
      [t[k + 1], t[k + 2]].some((x) => nomSql(x) === 'session_replication_role')
    ) {
      sortie.push({
        famille: 'journal_desarme',
        ligne,
        objet: 'session_replication_role',
        quoi: 'SET session_replication_role',
      });
    } else if (dansUnCorps && estMot(j, 'EXECUTE') && !estMot(t[k + 1], 'FUNCTION', 'PROCEDURE')) {
      sortie.push({
        famille: 'sql_dynamique',
        ligne,
        objet: 'EXECUTE',
        quoi: 'EXECUTE dans un corps',
      });
    }
  }
  return sortie;
}

/**
 * Les constats d'une migration, corps compris : un `DO` et une fonction portent du SQL que la base
 * exécute. Leurs littéraux et leurs corps sont relus comme du SQL — et dans ce SQL relu, les
 * littéraux restent des littéraux.
 */
function constatsDuSql(
  texte: string,
  ligneDeDepart: number,
  dansUnCorps: boolean,
  protection: Protection
): Constat[] {
  const instructions = lireMigrationSql(texte, ligneDeDepart);
  const creees = tablesCreees(instructions);
  const sortie: Constat[] = [];
  for (const instr of instructions) {
    sortie.push(...constatsDe(instr, creees, dansUnCorps, protection));
    const t = instr.jetons;
    const executable =
      estMot(t[0], 'DO') ||
      (estMot(t[0], 'CREATE') && t.slice(1, 4).some((j) => estMot(j, 'FUNCTION', 'PROCEDURE')));
    if (!executable) continue;
    for (const j of t) {
      if (j.type === 'corps') sortie.push(...constatsDuSql(j.valeur, j.ligne, true, protection));
      if (j.type !== 'litteral') continue;
      // Un littéral d'une fonction n'est du SQL que s'il se lit comme tel (corps à l'ancienne,
      // `AS '…'`) ; `SET search_path = 'l''x'` ne l'est pas, et ne rend pas la migration illisible.
      try {
        sortie.push(...constatsDuSql(j.valeur, j.ligne, true, protection));
      } catch (e) {
        if (!(e instanceof ErreurLecturePrisma)) throw e;
      }
    }
  }
  return sortie;
}

// ── le contrôle ──────────────────────────────────────────────────────────────

const EN_TETE_ADR = /^--\s*ADR:\s*partners\/ADR-(\d{4})\s*$/;

export function controler(vue: Vue): Verdict {
  const fautes: Faute[] = [];
  const absoutes: (Faute & { adr: string })[] = [];
  let instructions = 0;
  const protection = protectionsDe(vue.migrations);
  if (vue.migrations.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      chemin: 'prisma/migrations/',
      ligne: 0,
      message:
        "prisma/migrations/ — aucune migration suivie : la garde n'a rien lu, et un zéro ne dit pas " +
        "si c'est parce qu'il n'y a rien à redire ou parce qu'elle n'a rien regardé.",
    });
  }
  for (const m of vue.migrations) {
    const premiere = (m.contenu.replace(/^﻿/, '').split('\n')[0] ?? '').trim();
    const numero = EN_TETE_ADR.exec(premiere)?.[1];
    const adr = numero === undefined ? undefined : vue.adrs.find((a) => a.numero === numero);
    let constats: Constat[];
    try {
      instructions += lireMigrationSql(m.contenu).length;
      constats = constatsDuSql(m.contenu, 1, false, protection);
    } catch (e) {
      if (!(e instanceof ErreurLecturePrisma)) throw e;
      fautes.push({
        famille: 'migration_illisible',
        chemin: m.chemin,
        ligne: e.ligne,
        message: `${m.chemin}:${e.ligne} — ${e.message} : la migration ne se lit pas, et ce qu'on n'a pas lu ne s'absout pas.`,
      });
      continue;
    }
    for (const c of constats) {
      const faute: Faute = {
        famille: c.famille,
        chemin: m.chemin,
        ligne: c.ligne,
        message:
          `${m.chemin}:${c.ligne} — ${c.quoi} sur ${c.objet} : REQ-DM-037 veut des migrations ` +
          'additives. Écris l’ajout, laisse l’ancien en place, et retire-le dans une migration ' +
          'ultérieure portée par une ADR acceptée (première ligne `-- ADR: partners/ADR-NNNN`).',
      };
      if (adr?.statut === 'accepte') {
        absoutes.push({ ...faute, adr: `partners/ADR-${numero}` });
        continue;
      }
      if (numero !== undefined) {
        faute.message +=
          adr === undefined
            ? ` L’ADR citée, partners/ADR-${numero}, n’existe pas : elle n’absout rien.`
            : ` L’ADR citée, partners/ADR-${numero}, est au statut « ${adr.statut} » : seule une ADR acceptée absout.`;
      }
      fautes.push(faute);
    }
  }
  return {
    fautes,
    absoutes,
    migrations: vue.migrations.length,
    instructions,
    protections: protection.declencheurs,
  };
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

/** Toutes les migrations SUIVIES, lues par la source unique du périmètre, et les ADR du dépôt. */
export function vueDuDepot(): Vue {
  const suivis = fichiersSuivisOuRefus('partners:migrations:additive');
  return {
    migrations: suivis
      .filter((c) => c.startsWith('prisma/migrations/') && c.endsWith('.sql'))
      .sort()
      .map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf8') })),
    adrs: entrees().map((e) => ({ numero: e.numero, statut: e.statut })),
  };
}

// ── la preuve (RM-11) ────────────────────────────────────────────────────────

const SOCLE = [
  // Un journal de bac : sa protection se DÉRIVE de ses déclencheurs, son nom ne compte pas.
  'CREATE TABLE "journal_bac" ("id" BIGSERIAL PRIMARY KEY, "charge" JSONB NOT NULL);',
  'CREATE FUNCTION journal_bac_refuser() RETURNS trigger LANGUAGE plpgsql AS $$',
  'BEGIN',
  "  RAISE EXCEPTION 'journal_bac_append_only : % refusé — DROP COLUMN, DELETE et TRUNCATE interdits', TG_OP;",
  'END;',
  '$$;',
  'CREATE TRIGGER journal_bac_append_only BEFORE UPDATE OR DELETE ON "journal_bac"',
  '  FOR EACH ROW EXECUTE FUNCTION journal_bac_refuser();',
  'COMMENT ON TABLE "journal_bac" IS \'ne jamais DROP TABLE ni ALTER TABLE x DROP COLUMN y\';',
].join('\n');

/** Trois migrations, la faute dans celle du MILIEU, entre deux instructions saines. */
function vueAvec(milieu: string, adrs: AdrConnue[] = []): Vue {
  return {
    migrations: [
      { chemin: 'prisma/migrations/1_socle/migration.sql', contenu: SOCLE },
      {
        chemin: 'prisma/migrations/2_milieu/migration.sql',
        contenu: `CREATE TABLE "x" ("id" INT);\n${milieu}\nCREATE TABLE "z" ("id" INT);\n`,
      },
      {
        chemin: 'prisma/migrations/3_fin/migration.sql',
        contenu: 'CREATE TABLE "w" ("id" INT);\n',
      },
    ],
    adrs,
  };
}

const TEMOINS: { famille: string; nomme: string; vue: () => Vue }[] = [
  {
    famille: 'perimetre_vide',
    nomme: 'aucune migration',
    vue: () => ({ migrations: [], adrs: [] }),
  },
  {
    famille: 'migration_illisible',
    nomme: '2_milieu',
    vue: () => vueAvec("SELECT 'jamais fermé;"),
  },
  {
    famille: 'suppression_de_colonne',
    nomme: '2_milieu/migration.sql:2 — DROP COLUMN sur x.y',
    vue: () => vueAvec('ALTER TABLE "x" DROP COLUMN "y";'),
  },
  {
    famille: 'suppression_de_colonne',
    nomme: 'x.y',
    vue: () => vueAvec('ALTER TABLE x ADD COLUMN z INT, DROP y;'),
  },
  {
    famille: 'suppression_de_table',
    nomme: 'DROP TABLE sur y',
    vue: () => vueAvec('DROP TABLE IF EXISTS "y";'),
  },
  {
    famille: 'suppression_de_table',
    nomme: 'DROP SCHEMA sur public',
    vue: () => vueAvec('DROP SCHEMA public CASCADE;'),
  },
  {
    famille: 'renommage',
    nomme: 'x.a',
    vue: () => vueAvec('ALTER TABLE "x" RENAME COLUMN "a" TO "b";'),
  },
  {
    famille: 'renommage',
    nomme: 'RENAME TO y',
    vue: () => vueAvec('ALTER TABLE "x" RENAME TO "y";'),
  },
  {
    famille: 'enum_destructif',
    nomme: 'DROP TYPE sur etat',
    vue: () => vueAvec('DROP TYPE "etat";'),
  },
  {
    famille: 'enum_destructif',
    nomme: 'RENAME VALUE',
    vue: () => vueAvec("ALTER TYPE \"etat\" RENAME VALUE 'a' TO 'b';"),
  },
  {
    famille: 'enum_destructif',
    nomme: 'RENAME TO',
    vue: () => vueAvec('ALTER TYPE "etat" RENAME TO "etat_old";'),
  },
  {
    famille: 'type_de_colonne_change',
    nomme: 'x.id',
    vue: () => vueAvec('ALTER TABLE "x" ALTER COLUMN "id" SET DATA TYPE BIGINT;'),
  },
  {
    famille: 'non_null_sans_defaut',
    nomme: 'SET NOT NULL',
    vue: () => vueAvec('ALTER TABLE "x" ALTER COLUMN "id" SET NOT NULL;'),
  },
  {
    famille: 'non_null_sans_defaut',
    nomme: 'w.n',
    vue: () => vueAvec('ALTER TABLE "w" ADD COLUMN "n" INT NOT NULL;'),
  },
  {
    famille: 'index_brut_supprime',
    nomme: 'DROP INDEX sur un_occupant',
    vue: () => vueAvec('DROP INDEX "un_occupant";'),
  },
  {
    famille: 'journal_desarme',
    nomme: 'DROP TRIGGER',
    vue: () => vueAvec('DROP TRIGGER journal_bac_append_only ON journal_bac;'),
  },
  {
    famille: 'journal_desarme',
    nomme: 'DISABLE TRIGGER',
    vue: () => vueAvec('ALTER TABLE journal_bac DISABLE TRIGGER ALL;'),
  },
  {
    famille: 'journal_desarme',
    nomme: 'ENABLE REPLICA TRIGGER',
    vue: () => vueAvec('ALTER TABLE "journal_bac" ENABLE REPLICA TRIGGER journal_bac_append_only;'),
  },
  {
    famille: 'journal_desarme',
    nomme: 'DROP FUNCTION',
    vue: () => vueAvec('DROP FUNCTION journal_bac_refuser() CASCADE;'),
  },
  {
    famille: 'journal_desarme',
    nomme: 'CREATE OR REPLACE FUNCTION',
    vue: () =>
      vueAvec(
        'CREATE OR REPLACE FUNCTION journal_bac_refuser() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;'
      ),
  },
  {
    famille: 'journal_desarme',
    nomme: 'CREATE OR REPLACE TRIGGER sur journal_bac',
    vue: () =>
      vueAvec(
        'CREATE OR REPLACE TRIGGER journal_bac_append_only BEFORE UPDATE ON "journal_bac" FOR EACH ROW EXECUTE FUNCTION laisser_passer();'
      ),
  },
  {
    famille: 'journal_desarme',
    nomme: 'session_replication_role',
    vue: () => vueAvec('SET session_replication_role = replica;'),
  },
  // Une suppression cachée dans un bloc `DO` : le corps s'exécute, il se relit.
  {
    famille: 'suppression_de_colonne',
    nomme: 'x.y',
    vue: () => vueAvec('DO $$ BEGIN ALTER TABLE x DROP COLUMN y; END $$;'),
  },
  {
    famille: 'sql_dynamique',
    nomme: 'EXECUTE',
    vue: () => vueAvec("DO $$ BEGIN EXECUTE 'ALTER TABLE x ' || 'DROP COLUMN y'; END $$;"),
  },
];

/**
 * Le numéro de l'ADR des témoins : FICTIF, donc interpolé — écrit en clair, `gov:adr` y lirait un
 * renvoi vers un ADR qui n'existe pas (`reference_sans_cible`).
 */
const ADR_TEMOIN = '0042';

/** Le témoin d'ADR doit porter l'en-tête en PREMIÈRE ligne du fichier : il se construit à part. */
function vueAdr(statut: string | undefined): Vue {
  const v = vueAvec('');
  v.migrations[1] = {
    chemin: 'prisma/migrations/2_milieu/migration.sql',
    contenu: `-- ADR: partners/ADR-${ADR_TEMOIN}\nCREATE TABLE "x" ("id" INT);\nALTER TABLE "x" DROP COLUMN "y";\n`,
  };
  v.adrs = statut === undefined ? [] : [{ numero: ADR_TEMOIN, statut }];
  return v;
}

const CONTRE_TEMOINS: { quoi: string; vue: () => Vue }[] = [
  {
    quoi: 'le socle : fonction de refus, déclencheur, littéraux qui NOMMENT des suppressions',
    vue: () => vueAvec(''),
  },
  {
    quoi: 'un ajout de colonne nullable',
    vue: () => vueAvec('ALTER TABLE "w" ADD COLUMN "n" INT;'),
  },
  {
    quoi: 'un ajout NOT NULL avec DEFAULT',
    vue: () => vueAvec('ALTER TABLE "w" ADD COLUMN "n" INT NOT NULL DEFAULT 0;'),
  },
  {
    quoi: 'un ajout NOT NULL sur la table créée par la MÊME migration',
    vue: () => vueAvec('ALTER TABLE "x" ADD COLUMN "n" INT NOT NULL;'),
  },
  { quoi: 'une valeur d’enum ajoutée', vue: () => vueAvec('ALTER TYPE "etat" ADD VALUE \'c\';') },
  {
    quoi: 'une contrainte retirée (ce n’est pas une colonne)',
    vue: () => vueAvec('ALTER TABLE "x" DROP CONSTRAINT "x_chk";'),
  },
  {
    quoi: 'un défaut retiré',
    vue: () => vueAvec('ALTER TABLE "x" ALTER COLUMN "id" DROP DEFAULT;'),
  },
  {
    quoi: 'un déclencheur d’une AUTRE table retiré',
    vue: () => vueAvec('DROP TRIGGER t_maj ON "x";'),
  },
  {
    quoi: 'un déclencheur sur INSERT seul retiré (il ne protège rien)',
    vue: () =>
      vueAvec(
        'CREATE TRIGGER t_ins BEFORE INSERT ON "w" FOR EACH ROW EXECUTE FUNCTION f();\nDROP TRIGGER t_ins ON "w";'
      ),
  },
  { quoi: 'un index créé', vue: () => vueAvec('CREATE UNIQUE INDEX "u" ON "x" ("id");') },
];

// ── exécution ────────────────────────────────────────────────────────────────

/** Ancrée dossier + nom + fin, extension FACULTATIVE : invoquée sans `.ts`, elle juge quand même. */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]migrations-additive(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  if (process.argv.includes('--prove')) {
    const echecs: string[] = NOMS_FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f)).map(
      (f) => `famille sans témoin : ${f}`
    );
    for (const t of TEMOINS) {
      const v = controler(t.vue());
      const nommees = v.fautes.filter(
        (f) => f.famille === t.famille && f.message.includes(t.nomme)
      );
      if (nommees.length === 0) {
        echecs.push(
          `le témoin « ${t.famille} » (${t.nomme}) n'a pas rougi en le nommant — rendu : ` +
            (v.fautes.map((f) => f.message).join(' | ') || 'aucune faute')
        );
      }
    }
    const absoute = controler(vueAdr('accepte'));
    if (
      absoute.fautes.length > 0 ||
      !absoute.absoutes.some((a) => a.adr === `partners/ADR-${ADR_TEMOIN}`)
    ) {
      echecs.push('une ADR acceptée n’absout pas la faute, ou l’absolution n’est pas rendue');
    }
    for (const [statut, dit] of [
      [undefined, 'n’existe pas'],
      ['propose', '« propose »'],
    ] as const) {
      const v = controler(vueAdr(statut));
      if (v.absoutes.length > 0 || !v.fautes.some((f) => f.message.includes(dit))) {
        echecs.push(`une ADR ${statut ?? 'absente'} a absous une suppression, ou sans le dire`);
      }
    }
    for (const c of CONTRE_TEMOINS) {
      const v = controler(c.vue());
      if (v.fautes.length > 0)
        echecs.push(`faux positif sur « ${c.quoi} » : ${v.fautes[0]!.message}`);
    }
    if (echecs.length > 0) {
      console.error(`❌ partners:migrations:additive --prove — ${echecs.length} échec(s) :`);
      for (const e of echecs) console.error(`   ${e}`);
      process.exit(1);
    }
    console.log(
      `✅ partners:migrations:additive — Les ${FAMILLES.length} familles rougissent sur ${TEMOINS.length} témoins ` +
        `(cible dans la migration du milieu), ${CONTRE_TEMOINS.length} contre-témoins restent verts, ` +
        'une ADR acceptée absout en le disant, une ADR absente ou proposée n’absout rien :'
    );
    for (const f of FAMILLES) console.log(`   • ${f.nom} — ${f.explication}`);
    process.exit(0);
  }

  const verdict = controler(vueDuDepot());
  console.log(
    `partners:migrations:additive — périmètre : ${verdict.migrations} migration(s) suivie(s) sous ` +
      `prisma/migrations/, ${verdict.instructions} instruction(s) confrontées, ` +
      `${verdict.protections} déclencheur(s) de protection dérivé(s) du SQL.`
  );
  for (const a of verdict.absoutes)
    console.log(`   ⚠ absoute par ${a.adr} : [${a.famille}] ${a.message}`);
  if (verdict.fautes.length > 0) {
    console.error(`❌ partners:migrations:additive — ${verdict.fautes.length} faute(s) :`);
    for (const f of verdict.fautes) console.error(`   [${f.famille}] ${f.message}`);
    process.exit(1);
  }
  console.log(
    `✅ partners:migrations:additive — ${verdict.migrations} migration(s), ${verdict.instructions} ` +
      `instruction(s) : toutes additives, ${verdict.absoutes.length} faute(s) absoute(s) par ADR.`
  );
  process.exit(0);
}
