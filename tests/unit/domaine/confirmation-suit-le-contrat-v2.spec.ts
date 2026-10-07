// @req REQ-DM-004
// @req REQ-DM-042
/**
 * DM-72 — la confirmation suit le contrat v2 (art. 3.2, 3.4 al. 2, 3.7 al. 2 et 4.4 ; fiche de la
 * juriste, #474, 6033016552 ; décision de Williams du 2026-10-07, « le v2 fait foi partout »).
 *
 * Ce que le régime W20 codait à l'inverse du v2, et qui n'a plus cours :
 *   — un « Non » qui exigerait une SECONDE action : le démenti est la déclaration de l'entreprise,
 *     lors d'un échange, quel qu'en soit le moyen (art. 3.7 al. 2) ;
 *   — le régime de VÉRIFICATION d'une demande signalée, et le badge qui l'annonçait ;
 *   — la libération après N tentatives et la carence graduée, retirées de la SSOT (portées par
 *     JUR-T66, dont DM-72 dépend) ;
 *   — une demande de confirmation adressée à l'entreprise lors d'une commande (art. 4.4).
 * Le formulaire de réponse en ligne RESTE, comme un moyen de l'échange (art. 3.4 al. 2).
 *
 * L'état `clic_non_retenu` de la demande reste dans l'enum de la base, INERTE (arbitrage de la
 * coordination, conditions d'A02) : aucun code de `src/` ne l'écrit, SQL brut compris, hors
 * `src/domain/confirmation/demande.ts`, qui le liste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_DE_CONFIRMATION } from '../../../src/content/micro-copy/public/confirmation-contact';
import {
  BADGES_DU_DEPOT,
  CARTE_DU_DEPOT,
  FORMULAIRE_DU_CONTACT,
} from '../../../src/content/micro-copy/espace/confirmation-du-depot';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const RACINE = join(__dirname, '..', '..', '..');

/** Les sources de `src/`, en chemins relatifs à la racine, séparateur `/`. */
function sources(dossier = 'src'): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(join(RACINE, dossier))) {
    const chemin = `${dossier}/${nom}`;
    if (statSync(join(RACINE, chemin)).isDirectory()) sortie.push(...sources(chemin));
    else if (/\.(ts|tsx|sql)$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

/** La seule source qui nomme l'état inerte : la liste fermée de l'enum, dans le domaine. */
const LISTE_DES_ETATS = 'src/domain/confirmation/demande.ts';

/** Les fichiers qui nomment `clic_non_retenu` : code TypeScript et SQL brut, hors la liste. */
export function ecrivainsDeLEtatInerte(fichiers: { chemin: string; texte: string }[]): string[] {
  return fichiers
    .filter((f) => f.chemin !== LISTE_DES_ETATS && /clic_non_retenu/.test(f.texte))
    .map((f) => f.chemin);
}

const valeurs = (o: Record<string, string>) => Object.values(o).join('\n');

describe('REQ-DM-004 — DM-72 : l’état clic_non_retenu reste inerte', () => {
  it('REQ-DM-004 : TÉMOIN — aucun code de src/ ne nomme clic_non_retenu, SQL brut compris, hors la liste de l’enum', () => {
    const fichiers = sources().map((chemin) => ({ chemin, texte: lire(chemin) }));
    expect(fichiers.some((f) => f.chemin === LISTE_DES_ETATS)).toBe(true);
    expect(ecrivainsDeLEtatInerte(fichiers)).toEqual([]);
  });

  it('REQ-DM-004 : TÉMOIN À DEUX FACES — une écriture par Prisma ou par SQL brut rougit ; la liste de l’enum, non', () => {
    expect(
      ecrivainsDeLEtatInerte([
        { chemin: 'src/server/x.ts', texte: "data: { etat: 'clic_non_retenu' }" },
        {
          chemin: 'src/server/y.ts',
          texte: "tx.$executeRaw`UPDATE demandes_confirmation SET etat = 'clic_non_retenu'`",
        },
        { chemin: LISTE_DES_ETATS, texte: "'clic_non_retenu'," },
      ])
    ).toEqual(['src/server/x.ts', 'src/server/y.ts']);
  });
});

describe('REQ-DM-004 — DM-72 : le démenti n’exige aucune seconde action (art. 3.7 al. 2)', () => {
  it('REQ-DM-004 : TÉMOIN — la page de réponse n’a qu’un « Oui » et un « Non », sans seconde question', () => {
    expect(Object.keys(PAGE_DE_CONFIRMATION)).not.toContain('secondeQuestion');
    expect(Object.keys(PAGE_DE_CONFIRMATION)).not.toContain('confirmerLeNon');
    expect(valeurs(PAGE_DE_CONFIRMATION)).not.toMatch(/Je confirme|aucun échange avec/);
    expect([PAGE_DE_CONFIRMATION.oui, PAGE_DE_CONFIRMATION.non]).toEqual([
      'Oui, nous avons échangé',
      'Non',
    ]);
  });
});

describe('REQ-DM-004 — DM-72 : aucun régime de vérification d’une demande signalée', () => {
  it('REQ-DM-004 : TÉMOIN — l’espace n’annonce plus d’appel de vérification', () => {
    expect(Object.keys(BADGES_DU_DEPOT)).not.toContain('enAttenteSignalee');
    const textes = [BADGES_DU_DEPOT, CARTE_DU_DEPOT, FORMULAIRE_DU_CONTACT].map(valeurs).join('\n');
    expect(textes).not.toMatch(/va appeler votre contact/);
  });
});

describe('REQ-DM-042 — DM-72 : ni libération après tentatives, ni carence graduée (art. 3.2)', () => {
  it('REQ-DM-042 : TÉMOIN — la SSOT ne porte ni le nombre de tentatives ni la seconde carence', () => {
    expect(Object.keys(SEUILS)).not.toContain('LIBERATION_SIGNALEE_INJOIGNABLE_MAX');
    expect(Object.keys(SEUILS)).not.toContain('CARENCE_REDEPOT_APRES_SECONDE_LIBERATION_JOURS');
  });

  it('REQ-DM-042 : TÉMOIN — aucun code de src/ ne lit ces deux constantes', () => {
    const fautifs = sources().filter((f) =>
      /LIBERATION_SIGNALEE_INJOIGNABLE_MAX|CARENCE_REDEPOT_APRES_SECONDE_LIBERATION_JOURS/.test(
        lire(f)
      )
    );
    expect(fautifs).toEqual([]);
  });

  it('REQ-DM-042 : la prise de contact de la Société a son délai, 30 jours de l’enregistrement', () => {
    expect(
      (SEUILS as Record<string, { valeur: number }>).PRISE_DE_CONTACT_SOCIETE_JOURS?.valeur
    ).toBe(30);
  });
});

describe('REQ-DM-004 — DM-72 : aucune demande de confirmation à la commande (art. 4.4)', () => {
  it('REQ-DM-004 : TÉMOIN — seule la déclaration crée une demande de confirmation', () => {
    const createurs = sources().filter(
      (f) => f !== 'src/server/confirmation/demandes.ts' && /\bcreerLaDemande\b/.test(lire(f))
    );
    expect(createurs).toEqual(['src/server/depot/deposer.ts']);
  });
});
