/**
 * index.ts — l'index des ADR, DÉRIVÉ du système de fichiers (GOV-009, REQ-GOV-008).
 *
 * USAGE : pnpm adr:index                 écrit `docs/adr/INDEX.md` depuis le contenu du dossier
 *         pnpm adr:index --verifier      n'écrit rien ; sort 1 si le fichier sur disque diffère
 *         pnpm adr:index --racine <dir>  travaille sur un autre dossier (bancs d'essai des tests)
 *
 * POURQUOI CE FICHIER EXISTE. REQ-GOV-008 est née d'une dérive mesurée dans un dépôt voisin :
 * deux numéros attribués deux fois et un index figé pendant huit ADR. Un index tenu à la main est
 * faux le jour où quelqu'un oublie de l'ouvrir, et rien ne le signale. L'index est donc une VUE :
 * sa source est le contenu de `docs/adr/`, et personne ne l'édite (RM-01).
 *
 * CE QUI EST DÉRIVÉ, ET RIEN D'AUTRE. Le numéro vient du NOM du fichier ; le titre, le statut, la
 * date et la tâche viennent de l'en-tête de l'ADR lui-même ; les décomptes sont comptés à la
 * génération. Aucun total n'est écrit à la main.
 *
 * `0000-gabarit.md` n'est pas un ADR — c'est le moule — et il n'est pas indexé.
 *
 * La garde `gov:adr` (`scripts/gates/gov-adr.ts`) importe `rendreIndex` d'ici plutôt que de
 * réécrire le rendu : deux rendus qui se ressemblent finissent toujours par diverger, et c'est
 * alors l'index qui est déclaré faux au lieu du contrôle.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const RACINE_ADR = 'docs/adr';
export const NOM_INDEX = 'INDEX.md';
export const GABARIT = '0000-gabarit.md';

/** Un fichier d'ADR : quatre chiffres, un tiret, un intitulé en minuscules. */
export const NOM_ADR = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export type EntreeAdr = {
  numero: string;
  fichier: string;
  titre: string;
  statut: string;
  date: string;
  tache: string;
};

/** Le listage — la SOURCE de l'index. Trié par numéro, `0000-gabarit.md` exclu. */
export function fichiersAdr(racine: string = RACINE_ADR): string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine)
    .filter((f) => NOM_ADR.test(f) && f !== GABARIT)
    .sort();
}

/** Une cellule de l'en-tête d'un ADR (`| **Statut** | `propose` |`). */
function cellule(texte: string, cle: string): string {
  const motif = new RegExp(`^\\|\\s*\\*\\*${cle}\\*\\*\\s*\\|([^|]*)\\|`, 'm');
  const m = motif.exec(texte);
  return m ? m[1]!.replace(/[`*]/g, '').trim() : '';
}

/** Le titre d'un ADR : ce qui suit le tiret cadratin de son titre de niveau un. */
export function titreDe(texte: string): string {
  const m = /^#[ \t]+(.+)$/m.exec(texte);
  if (!m) return '';
  const [, entier] = m;
  const coupe = entier!.split(' — ');
  return (coupe.length > 1 ? coupe.slice(1).join(' — ') : entier!).trim();
}

/**
 * La comparaison se fait à FINS DE LIGNE NORMALISÉES. Le rendu écrit des `\n` ; un poste Windows
 * dont le `core.autocrlf` est armé rend des `\r\n` à la lecture — `docs/TASKS.md`, rendu par le même
 * genre de script, est déjà dans ce cas sur le poste où ce fichier a été écrit. Sans cette
 * normalisation, la garde serait verte en CI et rouge chez tout le monde : elle mesurerait la
 * configuration de git, pas la dérivation de l'index.
 */
export function normaliser(texte: string): string {
  return texte.replace(/\r\n/g, '\n');
}

/** Une barre verticale dans une cellule casse le tableau : elle s'échappe (CONVENTIONS §1). */
function echapper(valeur: string): string {
  return valeur.replace(/\|/g, '\\|');
}

/**
 * Une entrée d'index depuis un TEXTE. La garde `gov:adr` s'en sert pour éprouver ses témoins sans
 * écrire un seul fichier : un contrôle qui a besoin du disque pour se prouver ne se prouve pas.
 */
export function entreeDepuisTexte(fichier: string, texte: string): EntreeAdr {
  const numero = NOM_ADR.exec(fichier)?.[1] ?? '';
  return {
    numero,
    fichier,
    titre: titreDe(texte),
    statut: cellule(texte, 'Statut'),
    date: cellule(texte, 'Date'),
    tache: cellule(texte, 'Tâche'),
  };
}

export function lireAdr(fichier: string, racine: string = RACINE_ADR): EntreeAdr {
  return entreeDepuisTexte(fichier, readFileSync(join(racine, fichier), 'utf8'));
}

export function entrees(racine: string = RACINE_ADR): EntreeAdr[] {
  return fichiersAdr(racine).map((f) => lireAdr(f, racine));
}

/** Le rendu. Déterministe : deux appels sur le même dossier rendent le même octet. */
export function rendreIndex(liste: EntreeAdr[]): string {
  const compte = (s: string) => liste.filter((e) => e.statut === s).length;
  const l: string[] = [];

  l.push('# Index des ADR — Axion Partners');
  l.push('');
  l.push('> ⚠️ **Ce fichier est une VUE. La source est le contenu de `docs/adr/`.**');
  l.push('> Regénéré par `pnpm adr:index`, jamais édité à la main : un index tenu à la main est faux');
  l.push('> le jour où quelqu’un oublie de l’ouvrir, et rien ne le signale (RM-01, REQ-GOV-008).');
  l.push('> `pnpm adr:index --verifier` et la garde `gov:adr` rougissent si ce fichier diffère du listage.');
  l.push('>');
  l.push('> `0000-gabarit.md` est le moule, pas un ADR : il n’est pas indexé.');
  l.push('');
  l.push(
    `**${liste.length} ADR · ${compte('propose')} \`propose\`, ${compte('accepte')} \`accepte\`, ` +
      `${compte('remplace')} \`remplace\`.**`
  );
  l.push('');
  l.push('| ADR | Titre | Statut | Date | Tâche |');
  l.push('| --- | --- | --- | --- | --- |');
  for (const e of liste) {
    l.push(
      `| [\`partners/ADR-${e.numero}\`](${e.fichier}) | ${echapper(e.titre)} | \`${e.statut}\` | ` +
        `${echapper(e.date)} | ${echapper(e.tache)} |`
    );
  }
  l.push('');
  return l.join('\n');
}

// ── ligne de commande ────────────────────────────────────────────────────────
const LANCE_DIRECTEMENT = /[\\/]adr[\\/]index\.ts$/.test(process.argv[1] ?? '');

if (LANCE_DIRECTEMENT) {
  const iRacine = process.argv.indexOf('--racine');
  const racine = iRacine >= 0 ? (process.argv[iRacine + 1] ?? RACINE_ADR) : RACINE_ADR;
  const chemin = join(racine, NOM_INDEX);

  if (!existsSync(racine)) {
    console.error(`❌ adr:index — le dossier ${racine} est introuvable.`);
    process.exit(1);
  }

  const rendu = rendreIndex(entrees(racine));

  if (process.argv.includes('--verifier')) {
    if (!existsSync(chemin)) {
      console.error(`❌ adr:index — ${chemin} est absent. Lance \`pnpm adr:index\`.`);
      process.exit(1);
    }
    const surDisque = readFileSync(chemin, 'utf8');
    if (normaliser(surDisque) !== normaliser(rendu)) {
      console.error(
        `❌ adr:index — ${chemin} diffère du listage de ${racine}. ` +
          `L'index est une VUE : corrige le dossier ou regénère (\`pnpm adr:index\`), n'édite pas la vue.`
      );
      process.exit(1);
    }
    console.log(`✅ adr:index — ${chemin} est égal au listage de ${racine}.`);
    process.exit(0);
  }

  writeFileSync(chemin, rendu);
  console.log(`✅ adr:index — ${chemin} rendu depuis ${racine} (${entrees(racine).length} ADR).`);
  process.exit(0);
}
