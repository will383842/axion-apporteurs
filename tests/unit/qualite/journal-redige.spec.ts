// @req REQ-QA-024
/**
 * Le journal applicatif caviarde toute donnée protégée sur la LIGNE FINALE — QA-T08 (REQ-QA-024).
 *
 * TÉMOIN À DEUX FACES. Un bac (`journal-redige.bac.ts`) est lancé en SOUS-PROCESSUS et écrit un
 * objet piégé : une clé par segment protégé des deux lexiques, une clé à trois niveaux, une dans un
 * tableau, une en casse et une en accents différents, une `Error` dont le message porte un courriel,
 * et un message libre qui porte téléphone, courriel, IBAN et lien de dépôt. Le détecteur confronte
 * la SORTIE RÉELLE du processus à chaque valeur passée et NOMME chaque champ qui a franchi.
 *   — face nue (`pino()` sans option) : le détecteur nomme des champs, il doit en nommer ;
 *   — face du dépôt (`creerJournal()`) : aucun champ nommé, aucune valeur dans la sortie.
 * Le vert imprime le compte des champs confrontés, DÉRIVÉ des deux lexiques, plancher > 0.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { LEXIQUE_CHAMPS_PERSONNELS } from '../../../src/domain/donnees-personnelles/champs';
import { SEGMENTS_SECRETS } from '../../../src/lib/logger';

const RACINE = join(__dirname, '..', '..', '..');
const BAC = join(__dirname, 'journal-redige.bac.ts');

// ── l'objet piégé, dérivé des deux lexiques ─────────────────────────────────────────────────────

/** Les segments protégés : ceux de DM-01, puis les secrets du journal — jamais recopiés ici. */
const SEGMENTS = [
  ...new Set([...LEXIQUE_CHAMPS_PERSONNELS.map((e) => e.segment), ...SEGMENTS_SECRETS]),
];

type Piege = { nom: string; valeur: string };

const MESSAGE_LIBRE =
  'rappeler 06 12 34 56 78 ou jean@x.fr, IBAN FR76 3000 6000 0112 3456 7890 189, lien /d/abc123';

function construirePiege() {
  const pieges: Piege[] = [];
  const objet: Record<string, unknown> = {};
  SEGMENTS.forEach((s, i) => {
    const valeur = `piege-${String(i).padStart(2, '0')}-zq`;
    objet[s] = valeur;
    pieges.push({ nom: `champ « ${s} »`, valeur });
  });
  objet.niveau1 = { niveau2: { courriel: 'piege-profond-zq' } };
  pieges.push({ nom: 'niveau1.niveau2.courriel (trois niveaux)', valeur: 'piege-profond-zq' });
  objet.lignes = [{ ok: 1 }, { email: 'piege-tableau-zq' }];
  pieges.push({ nom: 'lignes[1].email (tableau)', valeur: 'piege-tableau-zq' });
  objet.Courriel = 'piege-casse-zq';
  pieges.push({ nom: 'Courriel (casse)', valeur: 'piege-casse-zq' });
  objet['Téléphone'] = 'piege-accent-zq';
  pieges.push({ nom: 'Téléphone (accents)', valeur: 'piege-accent-zq' });
  objet.apporteurId = 'piege-apporteur-zq';
  pieges.push({ nom: 'apporteurId (identifiant brut)', valeur: 'piege-apporteur-zq' });
  const messageErreur = 'echec pour marie.piege@exemple.fr';
  pieges.push({ nom: 'err.message / err.stack (courriel)', valeur: 'marie.piege@exemple.fr' });
  pieges.push({ nom: 'msg : téléphone', valeur: '06 12 34 56 78' });
  pieges.push({ nom: 'msg : courriel', valeur: 'jean@x.fr' });
  pieges.push({ nom: 'msg : IBAN', valeur: 'FR76 3000 6000 0112 3456 7890 189' });
  pieges.push({ nom: 'msg : jeton de lien de dépôt', valeur: '/d/abc123' });
  return { pieges, charge: { msg: MESSAGE_LIBRE, objet, messageErreur, segments: SEGMENTS } };
}

/** LE DÉTECTEUR : le nom de chaque champ piégé dont la valeur se lit dans la sortie. */
function franchis(sortie: string, pieges: Piege[]): string[] {
  return pieges.filter((p) => sortie.includes(p.valeur)).map((p) => p.nom);
}

function lancerBac(face: 'nu' | 'chemins' | 'depot') {
  const { pieges, charge } = construirePiege();
  const r = spawnSync(process.execPath, ['--import', 'tsx', BAC, face], {
    cwd: RACINE,
    input: JSON.stringify(charge),
    encoding: 'utf8',
  });
  expect(r.status, `le bac « ${face} » a échoué : ${r.stderr}`).toBe(0);
  expect(r.stdout.length, `le bac « ${face} » n'a rien écrit`).toBeGreaterThan(0);
  return { sortie: r.stdout, pieges, trouves: franchis(r.stdout, pieges) };
}

describe('REQ-QA-024 — témoin à deux faces : la sortie réelle d’un processus, confrontée aux valeurs', () => {
  it('REQ-QA-024 : face nue — pino sans option laisse passer chaque champ, et le détecteur les NOMME', () => {
    const { pieges, trouves } = lancerBac('nu');
    expect(trouves).toEqual(pieges.map((p) => p.nom));
  });

  it('REQ-QA-024 : face des chemins — la rédaction par chemins de pino laisse passer le profond et le tableau', () => {
    const { trouves } = lancerBac('chemins');
    expect(trouves).toEqual(
      expect.arrayContaining([
        'niveau1.niveau2.courriel (trois niveaux)',
        'lignes[1].email (tableau)',
      ])
    );
  });

  it('REQ-QA-024 : face du dépôt — aucun champ ne franchit, et le compte confronté est imprimé', () => {
    const { sortie, pieges, trouves } = lancerBac('depot');
    expect(trouves, `champs franchis dans la sortie du journal du dépôt :\n${sortie}`).toEqual([]);
    expect(SEGMENTS.length).toBeGreaterThan(0);
    console.log(
      `${SEGMENTS.length} champs confrontés (${LEXIQUE_CHAMPS_PERSONNELS.length} du lexique de personne, ` +
        `${SEGMENTS_SECRETS.length} secrets) — ${pieges.length} valeurs piégées, aucune dans la sortie`
    );
  });
});
