// @req REQ-JUR-025
/**
 * JUR-T36 (REQ-JUR-025) — la politique de confidentialité PUBLIQUE ne montre ni les questions
 * internes du registre de l'article 30, ni un nom de personne, ni un mot que le lexique de l'espace
 * refuse.
 *
 * CE QUE CE FICHIER GARDE :
 *   1. TÉMOIN : un registre qui porte une question interne, le prénom de l'arbitre et le mot
 *      « attribution » produit une page qui n'en montre AUCUN — et la lecture nomme chaque filtre ;
 *   2. une rubrique encore à compléter reste annoncée, en cours de rédaction, sans sa question ;
 *   3. le registre RÉEL produit une page sans question, sans nom et sans mot interdit.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MARQUE_A_COMPLETER,
  extrairePolitique,
  type LecturePolitique,
} from '../../../src/domain/rgpd/politique';
import { famillesPourPortee } from '../../../src/domain/lexique/lexique-interdit';

const REGISTRE = readFileSync('docs/rgpd/registre-article-30.md', 'utf8');

/** Le registre réel, une rubrique de TRT-APPORTEURS remplacée. */
function avecRubrique(nom: string, contenu: string): string {
  const lignes = REGISTRE.split('\n');
  const i = lignes.findIndex((l) => l.startsWith(`| ${nom} |`));
  if (i < 0) throw new Error(`rubrique ${nom} introuvable`);
  const cellules = lignes[i]!.split('|');
  cellules[2] = ` ${contenu} `;
  lignes[i] = cellules.join('|');
  return lignes.join('\n');
}

const FIXTURE = avecRubrique(
  'Finalité',
  `Exécuter le contrat — déclaration des entreprises et attribution. ${MARQUE_A_COMPLETER} Question : Will valide-t-il cette finalité ?`
);

const lue = (registre: string): Extract<LecturePolitique, { ok: true }> => {
  const l = extrairePolitique(registre);
  if (!l.ok) throw new Error(`registre refusé : ${l.refus}`);
  return l;
};

/** Ce que la page reçoit, à plat : le seul texte que l'écran peut afficher. */
const lisible = (l: Extract<LecturePolitique, { ok: true }>): string => JSON.stringify(l.politique);

const FORMES = famillesPourPortee('apporteur').flatMap((f) => f.formes);
const motInterdit = (texte: string): string | undefined =>
  FORMES.find((f) => new RegExp(`(?<![\\p{L}])${f}(?![\\p{L}])`, 'iu').test(texte));

describe('REQ-JUR-025 — la politique publique ne porte aucune note interne', () => {
  it('REQ-JUR-025 : TÉMOIN — question interne, prénom de l’arbitre et mot interdit : la page n’en montre aucun, et chaque filtre est nommé', () => {
    const l = lue(FIXTURE);
    const page = lisible(l);
    expect(page).not.toMatch(/Question/);
    expect(page).not.toMatch(/\bWill\b/);
    expect(page).not.toMatch(/attribution/i);
    expect(l.filtres.filter((f) => f.ou === 'finalite')).toEqual([
      { ou: 'finalite', motif: 'question_interne' },
      { ou: 'finalite', motif: 'lexique_interdit', detail: 'attribution' },
    ]);
  });

  it('REQ-JUR-025 : la rubrique encore à compléter reste annoncée, sans sa question', () => {
    const finalite = lue(FIXTURE).politique.rubriques.find((r) => r.cle === 'finalite');
    expect(finalite?.contenu).toEqual([{ type: 'a_completer' }, { type: 'a_completer' }]);
  });

  it('REQ-JUR-025 : TÉMOIN — un nom de personne dans une note du registre sort de la page, nommé', () => {
    const l = lue(
      avecRubrique('Destinataires', 'La Société et son hébergeur, à confirmer par Will.')
    );
    expect(lisible(l)).not.toMatch(/\bWill\b/);
    expect(l.filtres).toContainEqual({ ou: 'destinataires', motif: 'nom_de_personne' });
  });

  it('REQ-JUR-025 : le registre RÉEL donne une page sans question, sans nom de personne et sans mot interdit', () => {
    const page = lisible(lue(REGISTRE));
    expect(page).not.toMatch(/Question/);
    expect(page).not.toMatch(/\bWill\b/);
    expect(motInterdit(page)).toBeUndefined();
  });

  it('REQ-JUR-025 : TÉMOIN (A07) — la finalité réelle s’affiche en entier, avec la réservation qui découle de la déclaration', () => {
    const finalite = lue(REGISTRE).politique.rubriques.find((r) => r.cle === 'finalite');
    expect(finalite?.contenu).toEqual([
      {
        type: 'texte',
        texte: expect.stringContaining(
          'déclaration des entreprises et réservation qui en découle, rémunération'
        ),
      },
    ]);
    expect(lue(REGISTRE).filtres.filter((f) => f.ou === 'finalite')).toEqual([]);
  });

  it('REQ-JUR-025 : TÉMOIN (A07) — une qualification « à confirmer » n’est pas affichée : la Banque et l’URSSAF n’en portent aucune', () => {
    const l = lue(REGISTRE);
    for (const nom of ['Banque', 'URSSAF']) {
      const d = l.politique.destinataires.find((x) => x.nom === nom);
      expect([nom, d?.qualification]).toEqual([nom, []]);
      expect(l.filtres).toContainEqual({ ou: `${nom} · Qualification`, motif: 'non_tranche' });
    }
    expect(lisible(l)).not.toMatch(/à confirmer/i);
  });

  it('REQ-JUR-025 : TÉMOIN (A07) — une qualification n’est montrée que tranchée : « à confirmer » ou « À compléter », elle n’est pas annoncée du tout', () => {
    const lignes = REGISTRE.split('\n');
    const tiers = (nom: string) => lignes.find((x) => x.startsWith(`| ${nom} |`))!.split('|');
    const enSuspens = ['Banque', 'URSSAF', 'Sentry'].filter((nom) => {
      const q = tiers(nom)[3]!;
      return /à confirmer/i.test(q) || q.includes(MARQUE_A_COMPLETER);
    });
    expect(enSuspens).toEqual(['Banque', 'URSSAF', 'Sentry']);
    const l = lue(REGISTRE);
    for (const nom of enSuspens)
      expect([nom, l.politique.destinataires.find((x) => x.nom === nom)?.qualification]).toEqual([
        nom,
        [],
      ]);
    const tranchee = l.politique.destinataires.filter((d) => d.qualification.length > 0);
    expect(tranchee.length).toBeGreaterThan(0);
    for (const d of tranchee) expect(d.qualification).not.toContainEqual({ type: 'a_completer' });
  });

  it('REQ-JUR-025 : TÉMOIN (A07) — la donnée confiée à l’URSSAF, mot pour mot', () => {
    const urssaf = lue(REGISTRE).politique.destinataires.find((x) => x.nom === 'URSSAF');
    expect(urssaf?.donnees).toEqual([
      {
        type: 'texte',
        texte:
          'L’attestation de vigilance remise par l’apporteur, pour en vérifier l’authenticité'.replace(
            /’/g,
            "'"
          ),
      },
    ]);
  });
});

/**
 * LES CONSTANTES DU MODULE SONT ÉVALUÉES À SON CHARGEMENT (les personnes, les formes refusées, le
 * motif du refus des conseillers) : chaque témoin ci-dessous importe le module À NEUF, pour que la
 * mesure de mutation juge ces lignes et non un module resté en cache.
 */
async function politiqueFraiche() {
  vi.resetModules();
  return import('../../../src/domain/rgpd/politique');
}

describe('REQ-JUR-025 — chaque retenue a son témoin, module chargé à neuf', () => {
  it('REQ-JUR-025 : TÉMOIN — un nom de personne sans autre mention est retenu, nommé, et la rubrique reste annoncée', async () => {
    const { extrairePolitique: extraire, PERSONNES_DU_REGISTRE } = await politiqueFraiche();
    expect(PERSONNES_DU_REGISTRE).toEqual(['Will', 'Williams']);
    for (const nom of PERSONNES_DU_REGISTRE) {
      const l = extraire(
        avecRubrique('Destinataires', `La Société et son hébergeur, avec ${nom}.`)
      );
      if (!l.ok) throw new Error(l.refus);
      expect(l.politique.rubriques.find((r) => r.cle === 'destinataires')?.contenu).toEqual([
        { type: 'a_completer' },
      ]);
      expect(l.filtres).toContainEqual({ ou: 'destinataires', motif: 'nom_de_personne' });
    }
  });

  it('REQ-JUR-025 : TÉMOIN — chaque forme que le lexique refuse retient le texte qui l’emploie, nommée', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    for (const forme of ['attribution', 'SIREN', 'prorata']) {
      const l = extraire(avecRubrique('Destinataires', `La Société et son hébergeur (${forme}).`));
      if (!l.ok) throw new Error(l.refus);
      expect(l.filtres).toContainEqual({
        ou: 'destinataires',
        motif: 'lexique_interdit',
        detail: forme,
      });
    }
  });

  it('REQ-JUR-025 : TÉMOIN — une mention « à confirmer » dans une rubrique est omise, nommée', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    const l = extraire(avecRubrique('Destinataires', 'La Société et son hébergeur, à confirmer.'));
    if (!l.ok) throw new Error(l.refus);
    expect(l.politique.rubriques.find((r) => r.cle === 'destinataires')?.contenu).toEqual([]);
    expect(l.filtres).toContainEqual({ ou: 'destinataires', motif: 'non_tranche' });
  });

  it('REQ-JUR-025 : TÉMOIN — les conseillers sont refusés même dans un texte que le lexique retiendrait', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    const l = extraire(
      avecRubrique('Finalité', 'Attribution et contrôle des conseillers salariés.')
    );
    expect(l).toEqual({
      ok: false,
      refus: 'l’extrait mentionne les conseillers : leur information passe par un autre canal',
    });
  });

  it('REQ-JUR-025 : chaque retenue du registre réel nomme où elle a lieu, tiers et colonne compris', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    const l = extraire(REGISTRE);
    if (!l.ok) throw new Error(l.refus);
    expect(l.filtres[0]).toEqual({ ou: 'baseLegale', motif: 'question_interne' });
    expect(l.filtres).toContainEqual({
      ou: 'Sentry · Localisation et transfert',
      motif: 'question_interne',
    });
    expect(l.filtres.every((f) => typeof f === 'object')).toBe(true);
  });

  it('REQ-JUR-025 : TÉMOIN — la casse ne cache pas un mot refusé, et un mot qui CONTIENT un nom n’est pas un nom', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    const majuscules = extraire(
      avecRubrique('Destinataires', 'La Société et son hébergeur (ATTRIBUTION).')
    );
    if (!majuscules.ok) throw new Error(majuscules.refus);
    expect(majuscules.filtres).toContainEqual({
      ou: 'destinataires',
      motif: 'lexique_interdit',
      detail: 'attribution',
    });
    const voisin = extraire(
      avecRubrique('Destinataires', 'La Société et son hébergeur, rue Willemin.')
    );
    if (!voisin.ok) throw new Error(voisin.refus);
    expect(voisin.filtres.filter((x) => x.ou === 'destinataires')).toEqual([]);
  });

  it('REQ-JUR-025 : TÉMOIN — un tiers dont le NOM parle des conseillers est refusé', async () => {
    const { extrairePolitique: extraire } = await politiqueFraiche();
    expect(extraire(REGISTRE.replace('| Banque |', '| Banque des conseillers |'))).toEqual({
      ok: false,
      refus: 'l’extrait mentionne les conseillers : leur information passe par un autre canal',
    });
  });
});

describe('REQ-JUR-025 — la notice d’A07 sur le contact déclaré, dérivée du registre', () => {
  it('REQ-JUR-025 : TÉMOIN — les destinataires de TRT-APPORTEURS nomment le contact déclaré, mot pour mot, sans ses coordonnées ; « personne déclarée » est réservé à l’art. 2.6', () => {
    const destinataires = lue(REGISTRE).politique.rubriques.find((r) => r.cle === 'destinataires');
    expect(destinataires?.contenu).toEqual([
      {
        type: 'texte',
        texte: expect.stringContaining(
          "le contact de l'entreprise que l'apporteur déclare, qui reçoit ses prénom et nom dans la demande de confirmation ou lors d'une prise de contact de la Société, jamais ses coordonnées"
        ),
      },
    ]);
    expect(lisible(lue(REGISTRE))).not.toMatch(/personne que vous déclarez/);
  });
});

describe('REQ-JUR-025 — le contrôle des déclarations, dit dans la politique (texte d’A07)', () => {
  it('REQ-JUR-025 : TÉMOIN — la finalité nomme le contrôle, sa finalité, ses critères généraux et l’intervention humaine, mot pour mot, sans retenue', () => {
    const l = lue(REGISTRE);
    const finalite = l.politique.rubriques.find((r) => r.cle === 'finalite');
    expect(finalite?.contenu).toHaveLength(1);
    const texte = finalite?.contenu[0]?.type === 'texte' ? finalite.contenu[0].texte : '';
    for (const element of [
      'contrôler la sincérité des déclarations d’entreprises',
      'selon des critères généraux tenant à chaque déclaration',
      'aucun de ces critères ne tient au nombre des déclarations, à leur rythme, à l’heure ou au lieu, ni à la zone, au secteur ou à la méthode de l’apporteur',
      'toute suite donnée est décidée par une personne de la Société, jamais par le seul traitement automatique',
    ])
      expect(texte).toContain(element.replace(/’/g, "'"));
    expect(l.filtres.filter((f) => f.ou === 'finalite')).toEqual([]);
  });
});
