/**
 * gov-publication.ts — la garde qui protège un dépôt PUBLIC (REQ-GOV-031, décision W13).
 *
 * USAGE   : pnpm gov:publication            (échoue avec un code ≠ 0 si un fichier viole la règle)
 *           pnpm gov:publication --prove    (injecte le cas d'échec et VÉRIFIE que la garde rougit)
 *
 * POURQUOI : `axion-apporteurs` est public. Trois catégories ne doivent jamais y être poussées :
 *   (a) la doctrine anti-requalification — un document qui explique qu'on connaît le risque et
 *       qu'on a conçu le produit pour l'éviter est une pièce à charge, pas une documentation ;
 *   (b) les seuils de détection d'abus — publiés, ils indiquent comment rester en dessous ;
 *   (c) les montants de la grille et l'économie du réseau.
 *
 * CE QUE LA GARDE NE FAIT PAS : elle ne remplace pas `.gitignore`. Le `.gitignore` empêche d'ajouter
 * les fichiers connus ; cette garde attrape le contenu qui se glisse dans un fichier autorisé —
 * un seuil recopié dans un test, une phrase de doctrine dans un commentaire.
 *
 * INVARIANT : elle inspecte les fichiers SUIVIS PAR GIT, pas le disque. Un brouillon non suivi ne
 * la fait pas rougir (leçon du 2026-09-03 : un `tsc` global sur des fichiers non suivis bloque
 * les commits de tout le monde).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/** (a) La doctrine. Ces mots n'ont rien à faire dans un dépôt public, sauf dans le gabarit de contrat. */
const DOCTRINE = [
  'requalification',
  'requalifié',
  'agent commercial',
  'lien de subordination',
  'salariat déguisé',
  'indice de subordination',
  'travail dissimulé',
];

/** Le gabarit de contrat est remis à chaque apporteur : il peut citer L.134-1 sans dommage. */
const EXEMPTS = [/^docs\/contrat\//, /^docs\/CONTRAT-/, /^\.gitignore$/, /^scripts\/gates\/gov-publication\.ts$/];

/** (b) et (c) : un nombre nu à côté d'un mot de seuil ou de montant. */
const CHIFFRES = [
  // Cible les seuils de DÉTECTION D'ABUS, pas les constantes de gouvernance : un plafond de
  // questions ouvertes ou une taille de lot n'ont rien de sensible. D'où les préfixes explicites.
  { motif: /\b(RAFALE|NOCTURNE|SQUAT|ANOMALIE|DETECTION|FRAUDE|VERIF_PRIORITAIRE|QUOTA_DEPOT)\w*\s*[:=]\s*\d+/gi, quoi: 'seuil de détection' },
  { motif: /\b(flatEur|montantCents|tauxBps|commission)\w*\s*[:=]\s*\d{2,}/g, quoi: 'montant de grille' },
  { motif: /\bDETECTEUR\w*\s*[:=]/g, quoi: 'table de détecteurs' },
];

function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function analyser(fichiers: string[]): string[] {
  const fautes: string[] = [];
  for (const f of fichiers) {
    if (EXEMPTS.some((r) => r.test(f))) continue;
    if (!existsSync(f)) continue;
    if (!/\.(ts|tsx|js|jsx|md|json|yml|yaml|sql)$/.test(f)) continue;

    const texte = readFileSync(f, 'utf8');
    const lignes = texte.split('\n');

    lignes.forEach((ligne, i) => {
      for (const mot of DOCTRINE) {
        if (ligne.toLowerCase().includes(mot.toLowerCase())) {
          fautes.push(
            `${f}:${i + 1} — doctrine (« ${mot} »). Un test dit CE QU'IL VÉRIFIE, jamais POURQUOI. ` +
              `Reformule sans nommer le risque, ou sors le fichier du dépôt.`
          );
        }
      }
      for (const { motif, quoi } of CHIFFRES) {
        motif.lastIndex = 0;
        if (motif.test(ligne)) {
          fautes.push(
            `${f}:${i + 1} — ${quoi} en clair. Ces valeurs vivent en configuration ou en base, ` +
              `jamais dans un fichier versionné d'un dépôt public.`
          );
        }
      }
    });
  }
  return fautes;
}

// ── mode --prove : on VÉRIFIE que la garde sait rougir ────────────────────────
if (process.argv.includes('--prove')) {
  const temoin = ['const SEUIL_RAFALE: number = 3;', '// évite la requalification en agent commercial'];
  const fautes = analyser([]).concat(
    temoin.flatMap((l, i) => {
      const f: string[] = [];
      for (const mot of DOCTRINE) if (l.toLowerCase().includes(mot.toLowerCase())) f.push(`témoin:${i + 1} — doctrine`);
      for (const { motif } of CHIFFRES) { motif.lastIndex = 0; if (motif.test(l)) f.push(`témoin:${i + 1} — seuil`); }
      return f;
    })
  );
  if (fautes.length >= 2) {
    console.log(`✅ La garde rougit sur le témoin (${fautes.length} détections) — preuve faite.`);
    process.exit(0);
  }
  console.error(`❌ La garde N'A PAS rougi sur le témoin. Une garde qui ne rougit pas n'existe pas.`);
  process.exit(1);
}

// ── mode normal ───────────────────────────────────────────────────────────────
const fautes = analyser(fichiersSuivis());
if (fautes.length === 0) {
  console.log('✅ gov:publication — aucun contenu non publiable dans les fichiers suivis.');
  process.exit(0);
}
console.error(`❌ gov:publication — ${fautes.length} violation(s) de la règle de publication (REQ-GOV-031) :\n`);
fautes.forEach((f) => console.error('   ' + f));
console.error(`\nCe dépôt est PUBLIC. Rien de ce qui est poussé ne peut être repris.`);
process.exit(1);
