// @req REQ-GOV-003
/**
 * GOV-025 — la garde des identifiants nus, éprouvée AUX POSITIONS LIMITES.
 *
 * POURQUOI CE FICHIER EXISTE. `gov:identifiants` était verte, et elle était aveugle. Sa lookahead
 * négative incluait le point : une étiquette de relecteur collée à un point FINAL n'était pas vue,
 * alors que la même suivie d'une espace l'était. Et ses propres témoins `--prove` évitaient tous
 * cette position — l'auto-preuve n'exerçait donc jamais le seul endroit où la garde ne voyait
 * rien. Une garde peut être verte SUR LE TEXTE QU'ELLE CONDAMNE, et c'est ce qui s'est produit :
 * le défaut a été trouvé en mutation, puis reproduit involontairement en rédigeant l'entrée de
 * journal de la PR 30, où des deux occurrences écrites pour l'illustrer une seule a été relevée.
 *
 * CE QUE CE FICHIER TIENT, ET QUE `gardes.spec.ts` NE TENAIT PAS. `gardes.spec.ts` exerce la garde
 * par FAMILLE de faute — ce qui est refusé. Ici on l'exerce par POSITION — où elle regarde. C'est
 * une dimension distincte, et c'est celle où elle était fausse.
 *
 * LE CONTRÔLE DÉCISIF EST LE REJEU CONTRE LA VERSION CASSÉE (RM-02, RM-11). Un témoin qu'on n'a
 * pas vu attraper l'ancien défaut ne prouve pas qu'il l'attraperait : la lookahead d'avant est
 * conservée dans le module sous le nom `MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE`, et chaque témoin
 * annoncé « manqué par l'ancienne » est rejoué contre elle et doit être MANQUÉ. Un témoin qui
 * passerait ce rejeu serait un témoin qui n'exerce pas le défaut — exactement le témoin qui verdit
 * sur le texte qu'il condamne.
 *
 * ET UNE GARDE QUI ROUGIT TROP EST AUSSI CASSÉE QU'UNE GARDE QUI NE ROUGIT PAS : la réponse
 * humaine à une garde qui rougit trop est de la désarmer. D'où les contre-témoins, eux aussi
 * placés à la position limite, et la §0 du registre des décisions LUE (RM-01) plutôt que recopiée.
 *
 * ⚠️ Aucune étiquette nue n'est TAPÉE dans ce fichier : les témoins sont IMPORTÉS de la garde
 * (source unique, RM-01). C'est aussi ce qui permet au dernier cas ci-dessous d'exiger que ce
 * fichier-ci reste vert une fois commité — un fichier que git ne suit pas n'est lu par aucune
 * garde, et le jour où il entre dans l'index, la CI découvre ce qu'il contient.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  MOTIF_NU,
  MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE,
  POSITIONS_LIMITES,
  TEMOINS_LIMITES,
  CONTRE_TEMOINS_LIMITES,
  lignesDeLaSectionZero,
  fautesDeLigne,
} from '../../../scripts/gates/gov-identifiants';

const CE_FICHIER = 'tests/unit/gouvernance/identifiants-nus-positions-limites.spec.ts';

/**
 * Les huit positions que l'acceptation de GOV-025 exige, écrites ici et non dérivées de la garde :
 * une liste dérivée de ce qu'elle contient déjà ne pourrait jamais constater qu'il en manque une.
 * C'est l'unique endroit du fichier où recopier est le bon geste.
 */
const POSITIONS_EXIGEES = [
  'fin_de_phrase',
  'fin_de_ligne',
  'avant_virgule',
  'avant_point_virgule',
  'avant_parenthese_fermante',
  'avant_guillemet_fermant',
  'cellule_de_tableau',
  'titre_en_gras',
] as const;

describe('REQ-GOV-003 — les positions limites de la garde des identifiants nus', () => {
  it('REQ-GOV-003 : chacune des positions exigées par GOV-025 a un témoin', () => {
    const couvertes = new Set(TEMOINS_LIMITES.map((t) => t.position));
    const manquantes = POSITIONS_EXIGEES.filter((p) => !couvertes.has(p));
    expect(manquantes).toEqual([]);
    // Et aucune position déclarée ne reste sans témoin : une position sans témoin est une zone
    // dont on ne sait rien, pas une zone saine.
    expect(POSITIONS_LIMITES.filter((p) => !couvertes.has(p))).toEqual([]);
  });

  it.each(TEMOINS_LIMITES)(
    'REQ-GOV-003 : le témoin placé en position $position fait rougir la garde',
    (temoin) => {
      expect(fautesDeLigne(temoin.texte, 'témoin', 0, MOTIF_NU)).toHaveLength(1);
    }
  );

  it.each(TEMOINS_LIMITES.filter((t) => t.manqueParLAncienne))(
    'REQ-GOV-003 : rejoué contre la lookahead CASSÉE, le témoin de $position n’est PAS vu',
    (temoin) => {
      // Le contrôle décisif. Si ce cas devenait vert dans l'autre sens — l'ancienne voyant le
      // témoin —, le témoin n'exercerait plus la cécité et le reste du fichier ne prouverait rien.
      expect(
        fautesDeLigne(temoin.texte, 'témoin', 0, MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE)
      ).toHaveLength(0);
    }
  );

  it.each(TEMOINS_LIMITES.filter((t) => !t.manqueParLAncienne))(
    'REQ-GOV-003 : le témoin de $position était déjà vu avant GOV-025, et l’étiquette le dit',
    (temoin) => {
      // L'étiquette `manqueParLAncienne` est vérifiée DANS LES DEUX SENS. Une étiquette qu'on ne
      // vérifie que d'un côté finit par décrire l'intention de son auteur, pas le code.
      expect(
        fautesDeLigne(temoin.texte, 'témoin', 0, MOTIF_NU_AVEUGLE_EN_FIN_DE_PHRASE).length
      ).toBeGreaterThan(0);
    }
  );

  it('REQ-GOV-003 : la cécité corrigée porte sur plusieurs positions, pas sur une seule', () => {
    const aveugles = TEMOINS_LIMITES.filter((t) => t.manqueParLAncienne).map((t) => t.position);
    // Le point final n'est pas qu'une fin de phrase : il ferme aussi une cellule de tableau, un
    // titre en gras, une parenthèse, une citation. Un seul témoin aurait laissé croire l'inverse.
    expect(aveugles.length).toBeGreaterThanOrEqual(4);
    expect(aveugles).toContain('fin_de_phrase');
  });

  it.each(CONTRE_TEMOINS_LIMITES)(
    'REQ-GOV-003 : un usage légitime à la position limite reste vert — %s',
    (ligne) => {
      expect(fautesDeLigne(ligne, 'contre-témoin', 0, MOTIF_NU)).toEqual([]);
    }
  );

  it('REQ-GOV-003 : la §0 du registre des décisions reste verte, ligne à ligne', () => {
    const lignes = lignesDeLaSectionZero();
    // Un contre-témoin qu'on saute en silence n'a jamais rien prouvé : la §0 doit exister.
    expect(lignes.length).toBeGreaterThan(0);
    const rouges = lignes.filter((l) => fautesDeLigne(l, 'registre', 0, MOTIF_NU).length > 0);
    expect(rouges).toEqual([]);
  });

  it('REQ-GOV-003 : ce fichier de test ne fait rougir la garde sur aucune de ses lignes', () => {
    // `gov:identifiants` ne lit que les fichiers SUIVIS par git : tant qu'il n'est pas commité, ce
    // fichier n'est lu par personne, et son entrée dans l'index est exactement le moment où la CI
    // découvre ce qu'il contient. Six identifiants nus sont déjà entrés ainsi, en une fois.
    const fautes = readFileSync(CE_FICHIER, 'utf8')
      .split('\n')
      .flatMap((ligne, i) => fautesDeLigne(ligne, CE_FICHIER, i, MOTIF_NU));
    expect(fautes.map((f) => f.message)).toEqual([]);
  });

  it('REQ-GOV-003 : `--prove` sort 0 et dit combien de témoins l’ancienne lookahead manquait', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/gates/gov-identifiants.ts', '--prove'], {
      encoding: 'utf8',
      shell: true,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(r.status).toBe(0);
    // La preuve doit ÉNUMÉRER les positions : un total de témoins ne dit pas lesquelles sont
    // exercées, et c'est un total qui a laissé passer la cécité de fin de phrase.
    for (const p of POSITIONS_EXIGEES) expect(sortie).toContain(p);
    expect(sortie).toContain('lookahead MANQUAIT');
  });
});
