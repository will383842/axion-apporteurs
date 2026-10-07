// @req REQ-JUR-031
/**
 * JUR-T56 (REQ-JUR-031) — l'art. 3.2 renvoie à l'art. 3.7 dans les propres termes de l'art. 3.7.
 *
 * L'art. 3.2 disait que l'art. 3.7 ne s'applique qu'au cas où l'entreprise « indique ne pas connaître
 * l'Apporteur », alors que l'art. 3.7 al. 2 vise l'entreprise qui « indique expressément n'avoir eu
 * aucun échange avec l'Apporteur » : on peut connaître quelqu'un sans avoir eu d'échange avec lui.
 *
 * Le contrat v2 d'axion-ia ne renvoie plus à l'art. 3.7 par une phrase ; l'art. 3.2 al. 4
 * reprend les termes mêmes de l'art. 3.7 al. 2, dans la condition de la confirmation : l'attribution
 * devient définitive dès que l'entreprise répond, « sans indiquer n'avoir eu aucun échange avec
 * l'Apporteur ».
 *
 * Le témoin juge le gabarit RENDU (`rendre`, aucune variable fournie : la prose seule est en cause),
 * blancs normalisés, la phrase courant sur plusieurs lignes du Markdown. Il est écrit par A05, pas par
 * l'autrice du texte (A07).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { rendre } from '../../../src/domain/contrat/gabarit';

const RENDU = rendre(readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8'), {}, []);

/** Le texte d'un article, de son intitulé en gras à celui de l'article suivant, blancs normalisés. */
function article(debut: string, suivant: string): string {
  const i = RENDU.indexOf(debut);
  const j = RENDU.indexOf(suivant, i + debut.length);
  if (i < 0 || j < 0) throw new Error(`article introuvable : ${debut}`);
  return RENDU.slice(i, j).replace(/\s+/g, ' ');
}

const ART_3_2 = article('**3.2 — ', '**3.3 — ');
const ART_3_7 = article('**3.7 — ', '**3.8 — ');

/** La condition de la confirmation du v2, mot pour mot : les termes de l'art. 3.7 al. 2. */
const CONDITION_V2 =
  "L'attribution devient définitive dès que l'entreprise répond à la Société, prend rendez-vous avec " +
  "elle ou échange avec elle, sans indiquer n'avoir eu aucun échange avec l'Apporteur.";

describe('REQ-JUR-031 — l’art. 3.2 renvoie à l’art. 3.7 dans ses termes', () => {
  it('REQ-JUR-031 : TÉMOIN — l’art. 3.2 rendu ne porte plus « ne pas connaître l’Apporteur »', () => {
    expect(ART_3_2).not.toContain("ne pas connaître l'Apporteur");
  });

  it('REQ-JUR-031 : TÉMOIN — l’art. 3.2 rendu reprend les termes de l’art. 3.7 dans la condition de la confirmation, mot pour mot', () => {
    // Le rendu garde l'emphase du Markdown : la phrase se compare sans elle.
    expect(ART_3_2.replaceAll('**', '')).toContain(CONDITION_V2);
  });

  it('REQ-JUR-031 : l’art. 3.7 al. 2, sur lequel la phrase s’aligne, porte toujours ses termes', () => {
    expect(ART_3_7).toContain("indique expressément n'avoir eu aucun échange avec l'Apporteur");
  });
});
