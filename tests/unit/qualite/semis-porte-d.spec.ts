// @req REQ-QA-021
/**
 * Le semeur de la porte D (`scripts/lib/semis-porte-d.ts`) sème une table dont les CHECK exigent DEUX
 * groupes de colonnes nullables remplis ENSEMBLE — mesuré sur les tables versées par #556 : toute PR
 * à migration rougissait sur « tables que le semeur n'a pas su semer : contestations, verifications ».
 *
 * Les schémas sont INJECTÉS, sous la forme que rend le catalogue (`pg_get_constraintdef`) : le semeur
 * ne connaît aucun nom de table, et ces témoins non plus ne lui en apprennent aucun.
 */
import { describe, it, expect } from 'vitest';
import {
  semis,
  type ColonneVue,
  type ContrainteVue,
  type SchemaVu,
} from '../../../scripts/lib/semis-porte-d';

const col = (
  table: string,
  colonne: string,
  type: string,
  nonNul: boolean,
  valeurs: string[] | null = null
): ColonneVue => ({ table, colonne, type, nonNul, defaut: false, valeurs });
const check = (table: string, definition: string, colonnes: string[]): ContrainteVue => ({
  table,
  genre: 'c',
  definition,
  colonnes,
  cible: null,
  colonnesCibles: null,
});
const cle = (table: string, colonne: string, cible: string): ContrainteVue => ({
  table,
  genre: 'f',
  definition: `FOREIGN KEY (${colonne}) REFERENCES ${cible}(id)`,
  colonnes: [colonne],
  cible,
  colonnesCibles: ['id'],
});

/** Les colonnes d'un `INSERT … SELECT …` candidat, et leur valeur, lues au niveau zéro des parenthèses. */
function ligneDe(insert: string): Map<string, string> {
  const m = /^INSERT INTO "[^"]+" \((.*?)\) SELECT (.*) WHERE NOT EXISTS/.exec(insert);
  if (m === null) throw new Error(`candidat illisible : ${insert}`);
  const noms = m[1]!.split(', ').map((n) => n.replace(/^"|"$/g, ''));
  const valeurs: string[] = [];
  let profondeur = 0;
  let courant = '';
  for (const c of m[2]!) {
    if (c === '(') profondeur++;
    if (c === ')') profondeur--;
    if (c === ',' && profondeur === 0) {
      valeurs.push(courant.trim());
      courant = '';
    } else courant += c;
  }
  valeurs.push(courant.trim());
  return new Map(noms.map((n, i) => [n, valeurs[i]!]));
}
const candidatsDe = (schema: SchemaVu, table: string): Map<string, string>[] =>
  semis(schema)
    .sql.split('\n')
    .filter((l) => l.startsWith(`INSERT INTO "${table}" `))
    .map(ligneDe);

const REFERENCES: SchemaVu = {
  colonnes: [
    col('apporteurs', 'id', 'uuid', true),
    col('utilisateurs_console', 'id', 'uuid', true),
    col('attributions', 'id', 'uuid', true),
    col('depots_refuses', 'id', 'uuid', true),
  ],
  contraintes: [],
};

/** La forme de `verifications` : un porteur et un seul, et l'empreinte réseau ou sa purge. */
const VERIFICATIONS: SchemaVu = {
  colonnes: [
    ...REFERENCES.colonnes,
    col('verifications', 'id', 'uuid', true),
    col('verifications', 'apporteur_id', 'uuid', false),
    col('verifications', 'utilisateur_console_id', 'uuid', false),
    col('verifications', 'siren', 'character(9)', true),
    col('verifications', 'resultat', 'resultat_verification', true, ['libre', 'suivie']),
    col('verifications', 'ip_hash', 'character(64)', false),
    col('verifications', 'empreinte_reseau_purgee_at', 'timestamp(3) with time zone', false),
    col('verifications', 'porteur_purge_at', 'timestamp(3) with time zone', false),
  ],
  contraintes: [
    cle('verifications', 'apporteur_id', 'apporteurs'),
    cle('verifications', 'utilisateur_console_id', 'utilisateurs_console'),
    check('verifications', "CHECK (((siren)::text ~ '^[0-9]{9}$'::text))", ['siren']),
    check('verifications', "CHECK (((ip_hash)::text ~ '^[0-9a-f]{64}$'::text))", ['ip_hash']),
    check(
      'verifications',
      'CHECK ((num_nonnulls(apporteur_id, utilisateur_console_id) = CASE WHEN (porteur_purge_at IS NULL) THEN 1 ELSE 0 END))',
      ['apporteur_id', 'utilisateur_console_id', 'porteur_purge_at']
    ),
    check(
      'verifications',
      'CHECK (((ip_hash IS NULL) = (empreinte_reseau_purgee_at IS NOT NULL)))',
      ['ip_hash', 'empreinte_reseau_purgee_at']
    ),
  ],
};

/** La forme de `contestations` : la cible suit l'objet, et le texte ou sa purge. */
const CONTESTATIONS: SchemaVu = {
  colonnes: [
    ...REFERENCES.colonnes,
    col('contestations', 'id', 'uuid', true),
    col('contestations', 'apporteur_id', 'uuid', true),
    col('contestations', 'objet', 'objet_contestation', true, [
      'refus_depot',
      'annulation_attribution',
      'demande_rattachement',
    ]),
    col('contestations', 'depot_refuse_id', 'uuid', false),
    col('contestations', 'attribution_id', 'uuid', false),
    col('contestations', 'texte_chiffre', 'bytea', false),
    col('contestations', 'reponse_chiffre', 'bytea', false),
    col('contestations', 'repondue_at', 'timestamp(3) with time zone', false),
    col('contestations', 'purgee_at', 'timestamp(3) with time zone', false),
  ],
  contraintes: [
    cle('contestations', 'apporteur_id', 'apporteurs'),
    cle('contestations', 'depot_refuse_id', 'depots_refuses'),
    cle('contestations', 'attribution_id', 'attributions'),
    check(
      'contestations',
      "CHECK ((CASE WHEN (objet = 'refus_depot'::objet_contestation) THEN ((depot_refuse_id IS NOT NULL) AND (attribution_id IS NULL)) ELSE ((attribution_id IS NOT NULL) AND (depot_refuse_id IS NULL)) END))",
      ['objet', 'depot_refuse_id', 'attribution_id']
    ),
    check(
      'contestations',
      'CHECK ((((purgee_at IS NULL) = (texte_chiffre IS NOT NULL)) AND ((purgee_at IS NULL) OR (reponse_chiffre IS NULL))))',
      ['purgee_at', 'texte_chiffre', 'reponse_chiffre']
    ),
    check('contestations', 'CHECK (((reponse_chiffre IS NULL) = (repondue_at IS NULL)))', [
      'reponse_chiffre',
      'repondue_at',
    ]),
  ],
};

const rempli = (l: Map<string, string>, c: string) => l.get(c) !== undefined && l.get(c) !== 'NULL';

describe('REQ-QA-021 — le semeur remplit DEUX groupes de nullables ensemble', () => {
  it('REQ-QA-021 : TÉMOIN — une ligne de verifications : un porteur (l’apporteur) ET l’empreinte réseau, rien d’autre', () => {
    const conformes = candidatsDe(VERIFICATIONS, 'verifications').filter(
      (l) =>
        rempli(l, 'apporteur_id') &&
        rempli(l, 'ip_hash') &&
        !rempli(l, 'utilisateur_console_id') &&
        !rempli(l, 'empreinte_reseau_purgee_at') &&
        !rempli(l, 'porteur_purge_at')
    );
    expect(conformes.length).toBeGreaterThan(0);
  });

  it('REQ-QA-021 : TÉMOIN — une ligne de contestations : le texte ET la cible que l’objet désigne, rien d’autre', () => {
    const conformes = candidatsDe(CONTESTATIONS, 'contestations').filter(
      (l) =>
        rempli(l, 'texte_chiffre') &&
        !rempli(l, 'purgee_at') &&
        !rempli(l, 'reponse_chiffre') &&
        ((l.get('objet')!.includes("'refus_depot'") &&
          rempli(l, 'depot_refuse_id') &&
          !rempli(l, 'attribution_id')) ||
          (!l.get('objet')!.includes("'refus_depot'") &&
            rempli(l, 'attribution_id') &&
            !rempli(l, 'depot_refuse_id')))
    );
    expect(conformes.length).toBeGreaterThan(0);
  });

  it('REQ-QA-021 : la passe des paires vient APRÈS les candidats d’avant — une table déjà semée garde son candidat', () => {
    // Le candidat d'avant qui remplit UNE seule nullable avec ses liées précède tout candidat à deux
    // groupes : le premier que la base accepte reste celui d'avant.
    const lignes = candidatsDe(VERIFICATIONS, 'verifications');
    const premiereSeule = lignes.findIndex(
      (l) =>
        rempli(l, 'ip_hash') && !rempli(l, 'apporteur_id') && !rempli(l, 'utilisateur_console_id')
    );
    const premierePaire = lignes.findIndex(
      (l) => rempli(l, 'ip_hash') && rempli(l, 'apporteur_id')
    );
    expect(premiereSeule).toBeGreaterThanOrEqual(0);
    expect(premierePaire).toBeGreaterThan(premiereSeule);
  });

  it('REQ-QA-021 : la borne tient — au plus 400 candidats par table, même avec des paires', () => {
    expect(candidatsDe(CONTESTATIONS, 'contestations').length).toBeLessThanOrEqual(400);
    expect(candidatsDe(VERIFICATIONS, 'verifications').length).toBeLessThanOrEqual(400);
  });
});

/**
 * SEC-15 (main 8879e786) : `apporteurs` référence `anomalies` et `decisions_de_contrat` par des clés
 * NULLABLES (le gel), alors que ces tables référencent `apporteurs` par une clé OBLIGATOIRE. L'ordre
 * des clés étrangères formait un CYCLE, que le semeur rompait par l'ordre alphabétique : `anomalies`
 * passait avant `apporteurs`, sa sous-requête de clé rendait NULL, et la table n'était pas semée (CI de
 * #815, REQ-QA-021). Une clé nullable peut rester NULL : elle n'impose aucun ordre.
 */
const CYCLE_DU_GEL: SchemaVu = {
  colonnes: [
    col('anomalies', 'id', 'uuid', true),
    col('anomalies', 'apporteur_id', 'uuid', true),
    col('apporteurs', 'id', 'uuid', true),
    col('apporteurs', 'gel_anomalie_id', 'uuid', false),
  ],
  contraintes: [
    cle('anomalies', 'apporteur_id', 'apporteurs'),
    cle('apporteurs', 'gel_anomalie_id', 'anomalies'),
  ],
};

describe('REQ-QA-021 — une clé étrangère NULLABLE n’impose aucun ordre de semis', () => {
  it('REQ-QA-021 : TÉMOIN — dans le cycle du gel, la table de la clé OBLIGATOIRE est semée après sa cible', () => {
    const { tables } = semis(CYCLE_DU_GEL);
    expect(tables.indexOf('apporteurs')).toBeLessThan(tables.indexOf('anomalies'));
  });

  it('REQ-QA-021 : la clé nullable du cycle reste NULL dans le premier candidat', () => {
    const [premier] = candidatsDe(CYCLE_DU_GEL, 'apporteurs');
    expect(premier!.get('gel_anomalie_id')).toBe('NULL');
  });
});
