// @req REQ-DM-009
// @req REQ-DM-010
// @req REQ-JUR-032
/**
 * SEC-56 — le palier quitte le code livré (décision de Williams du 2026-10-03 : aucune limite des
 * dépôts d'un apporteur selon son taux de confirmation). Aucun palier, score, taux ni seuil de dépôts
 * n'existe par apporteur ; la priorité d'appel est un ordre de travail interne fondé sur la capacité de
 * la Société et sur une surcharge manuelle motivée.
 *
 * PREMIÈRE DES DEUX PR (forme ferme d'A02) : le code cesse de lire et d'écrire les deux colonnes
 * `seuil_verification_prioritaire*`, sans migration. Ces témoins lisent donc le DÉPÔT SUIVI par git, et
 * non une base : ils ne démarrent aucun conteneur. Ce qu'ils ne peuvent pas juger tient à la seconde PR
 * (la migration `DROP`) : « aucune COLONNE ne porte un seuil par apporteur » ne sera vrai qu'à elle, et
 * son témoin s'écrira alors dans `migrations-additives.spec.ts`, sous l'exemption nommée.
 *
 * Ce qu'ils ne gardent pas : un code futur qui poserait `verificationPrioritaire` par un autre chemin
 * qu'une écriture littérale `true` dans un fichier lu ici.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(__dirname, '..', '..');

/** Les fichiers de code suivis par git sous `src/`, jamais le disque. */
const FICHIERS_DE_CODE = execFileSync('git', ['ls-files', 'src'], { cwd: RACINE, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f));

const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

describe('REQ-DM-010 — aucun palier ni seuil de dépôts par apporteur dans le code livré', () => {
  it('REQ-DM-010 : TÉMOIN — aucun fichier de src/ ne lit ni n’écrit les deux colonnes du seuil par apporteur, hors leur classement TUE', () => {
    const lecteurs = FICHIERS_DE_CODE.filter((f) => /seuilVerificationPrioritaire/.test(lire(f)));
    // Leur seule mention est le classement TUE de la fiche de l'apporteur (SEC-47) : elles ne sortent jamais.
    expect(lecteurs).toStrictEqual(['src/server/acces/for-apporteur.ts']);
  });

  it('REQ-DM-010 : TÉMOIN — palierConfiance n’existe plus que dans le refus nommé de seuilPrioritaire()', () => {
    const porteurs = FICHIERS_DE_CODE.filter((f) => /palierConfiance/.test(lire(f)));
    expect(porteurs).toStrictEqual(['src/domain/attribution/seuil-prioritaire.ts']);
  });

  it('REQ-JUR-032 : TÉMOIN — le schéma ne dit plus que le seuil « dérive du palier »', () => {
    const schema = lire('prisma/schema.prisma');
    expect(schema).not.toMatch(/DÉRIVÉ du palier|palierConfiance|seuilPrioritaire\(\)/);
  });
});

describe('REQ-DM-010 — la mise en vérification ne vient jamais d’un seuil de dépôts', () => {
  it('REQ-DM-010 : TÉMOIN — aucun code livré ne pose verificationPrioritaire à true : cent dépôts d’un même apporteur n’en posent aucune', () => {
    const poseurs = FICHIERS_DE_CODE.filter((f) =>
      /verificationPrioritaire\s*[:=]\s*true/.test(lire(f))
    );
    expect(poseurs).toStrictEqual([]);
  });

  it('REQ-DM-010 : TÉMOIN — le dépôt ne passe à la décision que verificationPrioritaire: false, une constante, jamais un compte', () => {
    const deposer = lire('src/server/depot/deposer.ts');
    const affectations = deposer.match(/verificationPrioritaire:\s*[^,\n]+/g) ?? [];
    // Une construction des faits (false) et une écriture de la ligne (la valeur des faits) : aucune ne compte.
    expect(affectations).toStrictEqual([
      'verificationPrioritaire: false',
      'verificationPrioritaire: faits.verificationPrioritaire',
    ]);
  });

  it('REQ-DM-010 : TÉMOIN — une suspension ne met aucune attribution en vérification : le code de résiliation et de suspension ne pose pas verificationPrioritaire', () => {
    const suspendeurs = FICHIERS_DE_CODE.filter(
      (f) => /suspen|resili/i.test(f) && /verificationPrioritaire/.test(lire(f))
    );
    expect(suspendeurs).toStrictEqual([]);
  });
});
