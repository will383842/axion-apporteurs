/**
 * gov-publication.ts — la garde qui protège un dépôt PUBLIC (REQ-GOV-031, décision W13).
 *
 * USAGE   : pnpm gov:publication            (échoue avec un code ≠ 0 si un fichier viole la règle)
 *           pnpm gov:publication --prove    (injecte un témoin PAR FAMILLE et vérifie que chacune rougit)
 *
 * POURQUOI : `axion-apporteurs` est public. Trois catégories ne doivent jamais y être poussées :
 *   (a) les notes d'analyse du risque relationnel — un document qui explique qu'on connaît le risque
 *       et qu'on a conçu le produit pour l'éviter est une pièce à charge, pas une documentation ;
 *   (b) les seuils de détection d'abus — publiés, ils indiquent comment rester en dessous ;
 *   (c) les montants de la grille et l'économie du réseau.
 *
 * CE QUE LA GARDE NE FAIT PAS : elle ne remplace pas `.gitignore`. Le `.gitignore` empêche d'ajouter
 * les fichiers connus ; cette garde attrape le contenu qui se glisse dans un fichier autorisé —
 * un seuil recopié dans un test, une phrase d'analyse dans un commentaire.
 *
 * INVARIANT : elle inspecte les fichiers SUIVIS PAR GIT, pas le disque. Un brouillon non suivi ne
 * la fait pas rougir (leçon du 2026-09-03 : un `tsc` global sur des fichiers non suivis bloque
 * les commits de tout le monde).
 *
 * INVARIANT DE LA PREUVE : `--prove` n'accepte pas un DÉCOMPTE de fautes. Il exige qu'au moins un
 * témoin fasse rougir CHAQUE famille de règle. Le décompte a menti une fois : le témoin
 * `SEUIL_RAFALE: number = 3` ne déclenchait rien (pas de frontière de mot après `_`), et deux
 * détections de doctrine sur la même ligne suffisaient à faire passer la preuve. Trois familles
 * sur quatre étaient réputées prouvées sans l'avoir jamais été. Ajouter une règle sans témoin
 * fait désormais échouer `--prove`.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { restreindreALaPr } from './fichiers-de-la-pr';

/** (a) L'analyse du risque. Ces mots n'ont rien à faire ici, sauf dans le gabarit de contrat. */
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
const EXEMPTS = [
  /^docs\/contrat\//,
  /^docs\/CONTRAT-/,
  /^\.gitignore$/,
  /^scripts\/gates\/gov-publication\.ts$/,
];

/** Vocabulaire de la prose, assemblé dans les deux sens de lecture. */
const DETECTION =
  '(?:anomalie|détect|signal|score|sincérité|fraude|squat|rafale|nocturne|suspicion|ramassage|abus)';
const NOMBRE = '(?:\\d{1,3}\\s*%|au-delà de\\s+\\d|plus de\\s+\\d|≥\\s*\\d|>\\s*\\d)';
// Deux vocabulaires, parce que les deux unités ne se valent pas.
// L'EURO est sans ambiguïté : partout où il touche l'argent du réseau, il n'a rien à faire ici.
const ARGENT =
  '(?:commission|parrainage|filleul|bonus|palier|forfait|rémunération|barème|grille|plafond|taux|seuil|versement|relevé|solde|report)';
// Le POURCENTAGE, lui, sert aussi à mesurer la QUALITÉ (« seuil de mutation ≥ 80 % », « 100 % des
// cellules testées »). Écrit avec le vocabulaire large, il rougissait sur Stryker et sur la
// couverture des machines à états — deux endroits où il n'avait rien à dire. D'où une liste étroite,
// qui ne retient que les mots par lesquels on désigne une RÉMUNÉRATION.
const TAUX_REMUNERATION =
  '(?:commission|parrainage|filleul|bonus|palier|forfait|rémunération|barème|grille|taux)';
// Le pourcentage s'arrête à 99 : « 100 % » n'est jamais un taux de rémunération, c'est un taux de
// COUVERTURE (« 100 % des cellules testées »). Écrite en `\d{1,3}`, la règle rougissait sur
// `docs/gates.json`, où elle n'avait rien à dire.
// Le montant commence par un chiffre NON NUL. « 0 € » n'est pas une valeur du réseau : c'est
// précisément ce que plusieurs exigences INTERDISENT d'afficher (« jamais « 0 € », jamais un taux
// deviné »). Écrite avec `\d`, la règle rougissait sur l'interdiction elle-même.
const EUROS = '(?:[1-9][\\d\\s\\u202f\\u00a0]{0,8}(?:€|EUR\\b))';
const POURCENT = '(?:\\b\\d{1,2}\\s*%)';

/**
 * Montants FIXÉS PAR LA LOI. Ils sont publics par nature — les taire n'protège rien et rend le
 * dépôt illisible. Ils sont neutralisés AVANT l'analyse, pour toutes les familles à la fois.
 */
const MONTANTS_LEGAUX: { valeur: RegExp; source: string }[] = [
  { valeur: /\b2[\s  ]?400\s*€/g, source: 'seuil DAS2, art. 240 CGI' },
  { valeur: /\b5[\s  ]?000\s*€/g, source: 'seuil de vigilance, art. D.8222-5 C. trav.' },
  { valeur: /\b40\s*€/g, source: 'indemnité de recouvrement, art. L.441-10 C. com.' },
];

function neutraliserMontantsLegaux(ligne: string): string {
  return MONTANTS_LEGAUX.reduce((s, m) => s.replace(m.valeur, '«montant fixé par la loi»'), ligne);
}

/** (b) et (c) : un nombre nu à côté d'un mot de seuil ou de montant. */
const CHIFFRES: { motif: RegExp; quoi: string }[] = [
  // Cible les seuils de DÉTECTION D'ABUS, pas les constantes de gouvernance : un plafond de
  // questions ouvertes ou une taille de lot n'ont rien de sensible. D'où les préfixes explicites.
  {
    motif:
      /\b(RAFALE|NOCTURNE|SQUAT|ANOMALIE|DETECTION|FRAUDE|VERIF_PRIORITAIRE|QUOTA_DEPOT)\w*\s*[:=]\s*\d+/gi,
    quoi: 'seuil de détection',
  },
  {
    motif: /\b(flatEur|montantCents|tauxBps|commission)\w*\s*[:=]\s*\d{2,}/g,
    quoi: 'montant de grille',
  },
  { motif: /\bDETECTEUR\w*\s*[:=]/g, quoi: 'table de détecteurs' },
  // Un seuil écrit en PROSE échappe aux formes de code ci-dessus. `docs/tasks.json` en portait un
  // — « signal d'anomalie au-delà de 70 % de dépôts sur des entreprises déjà travaillées » — que
  // les trois règles précédentes n'ont pas vu : une valeur se lit aussi bien dans une phrase.
  //
  // La règle est BIDIRECTIONNELLE. Écrite dans le seul sens « mot de détection puis nombre », elle
  // a laissé passer la même valeur réécrite dans l'autre sens dans `docs/DECISIONS.md`
  // (« au-delà de 70 % … , signal d'anomalie »). Une garde qui ne tient que dans un sens de lecture
  // ne garde pas une valeur, elle garde une tournure de phrase.
  {
    motif: new RegExp(
      `(?:${DETECTION}[^.;\\n]{0,160}?${NOMBRE}|${NOMBRE}[^.;\\n]{0,160}?${DETECTION})`,
      'gi'
    ),
    quoi: 'seuil de détection en toutes lettres',
  },
  // (c) Économie du réseau écrite en prose. Les seuils FIXÉS PAR LA LOI sont publics par nature et
  // neutralisés en amont ; tout le reste est une valeur que le dépôt public n'a pas à porter.
  {
    motif: new RegExp(
      `(?:${ARGENT}[^.;\\n]{0,120}?${EUROS}|${EUROS}[^.;\\n]{0,120}?${ARGENT})`,
      'gi'
    ),
    quoi: 'montant du réseau en toutes lettres',
  },
  {
    motif: new RegExp(
      `(?:${TAUX_REMUNERATION}[^.;\\n]{0,120}?${POURCENT}|${POURCENT}[^.;\\n]{0,120}?${TAUX_REMUNERATION})`,
      'gi'
    ),
    quoi: 'taux de rémunération en toutes lettres',
  },
];

/**
 * (d) SEC-48 — une donnée du POSTE de travail : l'identité système (`uid=…(nom)`, `gid=…`, la sortie
 * de `id`) et le dossier personnel, qui nomme l'utilisateur. Mesuré le 2026-10-02 : une expansion du
 * shell (`` `id` `` dans une chaîne entre guillemets doubles) a versé l'identité du poste dans un
 * commentaire de `prisma/schema.prisma` (PR #480). Le dossier personnel se lit sous ses trois
 * écritures, sans égard à la casse : `C:\Users\…` (doublé dans une chaîne compris), `C:/Users/…` et
 * `/c/Users/…` de Git Bash. UNE SEULE forme est permise, et nommée (lentille sécurité) : le marqueur
 * littéral `<nom>`. Tout autre segment après `Users` rougit, nom réel ou inventé : le
 * dépôt dit un chemin par son rôle (`%USERPROFILE%`, `~`, relatif au dépôt), jamais par une personne.
 * Un segment qui COMMENCE par une ponctuation n'est pas un nom : `C:\Users\, C:/Users/` énumère les
 * écritures (la fiche même de SEC-48 dans `docs/tasks.json`), il ne désigne aucun poste.
 */
const SEGMENT = '[^\\\\/\\s`\'",;:.)\\]}>][^\\\\/\\s`\'"]*';
const POSTE: RegExp[] = [
  /\buid=\d+\(/,
  /\bgid=\d+\b/,
  new RegExp(`\\b[A-Za-z]:(?:\\\\{1,2}|/)Users(?:\\\\{1,2}|/)(?!<nom>)${SEGMENT}`, 'i'),
  new RegExp(`(?:^|[^\\w.])/(?:mnt/)?[a-z]/Users/(?!<nom>)${SEGMENT}`, 'i'),
  // Le même dossier ENCODÉ, tel que l'outil de session nomme ses projets (`C--Users-<nom>-Documents`).
  /\b[A-Za-z]--Users-(?!<nom>)[^-\s`'"/\\]+/i,
];
const DONNEE_DU_POSTE = 'donnee_du_poste';

/** Toutes les familles que la garde prétend couvrir. `--prove` les exige toutes. */
const FAMILLES = ['doctrine', ...CHIFFRES.map((c) => c.quoi), DONNEE_DU_POSTE];

type Faute = { famille: string; message: string };

function fautesDeLigne(ligne: string, fichier: string, i: number): Faute[] {
  const out: Faute[] = [];
  for (const mot of DOCTRINE) {
    if (ligne.toLowerCase().includes(mot.toLowerCase())) {
      out.push({
        famille: 'doctrine',
        message:
          `${fichier}:${i + 1} — doctrine (« ${mot} »). Un test dit CE QU'IL VÉRIFIE, jamais POURQUOI. ` +
          `Reformule sans nommer le risque, ou sors le fichier du dépôt.`,
      });
    }
  }
  if (POSTE.some((m) => m.test(ligne))) {
    out.push({
      famille: DONNEE_DU_POSTE,
      message:
        `${fichier}:${i + 1} — ${DONNEE_DU_POSTE} : l'identité système ou le dossier personnel du poste. ` +
        `Un chemin se dit relatif au dépôt ou se lit dans l'environnement ; une sortie de commande ne se verse jamais.`,
    });
  }
  const sansLegaux = neutraliserMontantsLegaux(ligne);
  for (const { motif, quoi } of CHIFFRES) {
    motif.lastIndex = 0;
    if (motif.test(sansLegaux)) {
      out.push({
        famille: quoi,
        message:
          `${fichier}:${i + 1} — ${quoi} en clair. Ces valeurs vivent en configuration ou en base, ` +
          `jamais dans un fichier versionné d'un dépôt public.`,
      });
    }
  }
  return out;
}

/**
 * 🔴 Le périmètre vient désormais d’UNE source unique qui REFUSE au lieu de rendre `[]`.
 * Cette fonction portait un `try/catch { return [] }` — recopié à l’identique dans CINQ gardes —
 * et rendait la garde d’argent VERTE sur ZÉRO fichier dans un dépôt sans `.git`, dépôt PUBLIC.
 * La mesure est dans `scripts/lot/fichiers-suivis.ts`.
 */
function fichiersSuivis(): string[] {
  return fichiersSuivisOuRefus('gov:publication');
}

function analyser(fichiers: string[]): Faute[] {
  const fautes: Faute[] = [];
  for (const f of fichiers) {
    if (EXEMPTS.some((r) => r.test(f))) continue;
    if (!existsSync(f)) continue;
    if (!/\.(ts|tsx|js|jsx|md|json|yml|yaml|sql)$/.test(f)) continue;

    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((ligne, i) => fautes.push(...fautesDeLigne(ligne, f, i)));
  }
  return fautes;
}

// ── mode --prove : chaque famille doit rougir sur son témoin ──────────────────
if (process.argv.includes('--prove')) {
  const TEMOINS: { ligne: string; famille: string }[] = [
    { ligne: `// évite la requalification en agent commercial`, famille: 'doctrine' },
    { ligne: `const RAFALE_MAX = 3;`, famille: 'seuil de détection' },
    { ligne: `const flatEur = 250;`, famille: 'montant de grille' },
    { ligne: `const DETECTEURS = {`, famille: 'table de détecteurs' },
    {
      ligne: `"acceptance": "signal d'anomalie au-delà de 70 % de dépôts déjà travaillés"`,
      famille: 'seuil de détection en toutes lettres',
    },
    // Le même seuil écrit dans l'AUTRE sens. Sans ce témoin, la règle directionnelle passait
    // pour verte alors qu'elle laissait la valeur sortir : c'est arrivé, sur `docs/DECISIONS.md`.
    {
      ligne: `au-delà de 70 % de dépôts sur des entreprises déjà travaillées, signal d'anomalie`,
      famille: 'seuil de détection en toutes lettres',
    },
    {
      ligne: `bonus de parrainage : 100 € à la première ligne acquise du filleul`,
      famille: 'montant du réseau en toutes lettres',
    },
    {
      ligne: `Taux de parrainage **10 %** versionné, appliqué aux lignes commission`,
      famille: 'taux de rémunération en toutes lettres',
    },
    // SEC-48 : la ligne même que l'expansion du shell avait versée (#480), puis le dossier personnel
    // sous chacune de ses formes.
    {
      ligne: `/// La clé primaire uid=1001(poste) gid=1001 groups=1001`,
      famille: DONNEE_DU_POSTE,
    },
    { ligne: `groups gid=1000`, famille: DONNEE_DU_POSTE },
    { ligne: `cd C:\\Users\\poste\\Documents\\Projets`, famille: DONNEE_DU_POSTE },
    { ligne: `'C:\\\\Users\\\\poste\\\\Documents'`, famille: DONNEE_DU_POSTE },
    { ligne: `voir C:/Users/poste/Documents/Projets/outils/`, famille: DONNEE_DU_POSTE },
    // Un nom inventé, ou un fichier à la racine de Users, n'est pas la forme permise : il rougit aussi.
    { ligne: `'C:/Users/x.ts',`, famille: DONNEE_DU_POSTE },
    { ligne: `C:\\USERS\\Poste`, famille: DONNEE_DU_POSTE },
    { ligne: `~/.claude/projects/C--Users-poste-Documents-Projets/`, famille: DONNEE_DU_POSTE },
    { ligne: `git -C /c/Users/poste/Documents/Projets worktree add`, famille: DONNEE_DU_POSTE },
  ];

  // Contre-témoins : ce que la garde ne doit PAS faire rougir. Une garde qui rougit sur tout
  // ne dit rien de plus qu'une garde qui ne rougit jamais.
  const CONTRE_TEMOINS: string[] = [
    `le seuil de 5 000 € ne sert qu'au rappel J-15 et à la DAS2`,
    `seuil DAS2 = paramètre (2 400 €, à confirmer avec l'expert-comptable)`,
    `l'indemnité de 40 € est due de plein droit`,
    `const PLAFOND_QUESTIONS = 10;`,
    `"verifie": "100 % des cellules (etat x evenement) testees pour Attribution et LigneCommission"`,
    `Stryker sur src/domain : seuil aligne sur la mesure puis >= 80 % bloquant sur les fichiers touches`,
    `le libelle apporteur de la commission n'affiche jamais « 0 € », jamais un taux devine`,
    // SEC-48 : un uuid n'est pas un uid ; un chemin dit par sa variable ou par son rôle ne nomme personne.
    // La seule forme permise, le marqueur littéral, sous les trois écritures.
    `cd C:\\Users\\<nom>\\Documents\\Projets`,
    `'C:/Users/<nom>/x.ts',`,
    `git -C /c/Users/<nom>/Documents/Projets worktree add`,
    'new URL(`${racine}/api/v1/deploy?uuid=${uuid}&force=false`)',
    `%USERPROFILE%\\Documents\\Projets\\axion-apporteurs`,
    `cd <dossier des projets>\\axion-apporteurs`,
    // L'énumération des écritures, sans nom : la fiche de SEC-48 elle-même.
    `les trois écritures C:\\\\Users\\\\, C:/Users/ et /c/Users/, insensibles à la casse`,
  ];

  const rouges = new Set<string>();
  for (const [i, t] of TEMOINS.entries()) {
    const f = fautesDeLigne(t.ligne, 'témoin', i);
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin « ${t.ligne} » n'a PAS fait rougir la famille « ${t.famille} ». ` +
          `Le témoin est faux, ou la règle ne couvre pas ce qu'elle prétend couvrir.`
      );
      process.exit(1);
    }
    f.forEach((x) => rouges.add(x.famille));
  }

  for (const [i, ligne] of CONTRE_TEMOINS.entries()) {
    const f = fautesDeLigne(ligne, 'contre-témoin', i);
    if (f.length > 0) {
      console.error(
        `❌ Faux positif : « ${ligne} » a fait rougir « ${f[0]!.famille} ». ` +
          `Cette ligne est légitime dans un dépôt public — la règle est trop large.`
      );
      process.exit(1);
    }
  }

  const sansTemoin = FAMILLES.filter((f) => !rouges.has(f));
  if (sansTemoin.length > 0) {
    console.error(
      `❌ ${sansTemoin.length} famille(s) de règle sans témoin qui rougit : ${sansTemoin.join(', ')}.\n` +
        `   Une règle jamais vue rougir ne garde rien. Ajoute-lui un témoin dans TEMOINS.`
    );
    process.exit(1);
  }

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ───────────────────────────────────────────────────────────────
/**
 * GOV-160 (#319, 6077512137) : sur une PR, la garde ne juge que les fichiers AJOUTÉS ou MODIFIÉS
 * par la PR — un défaut déjà sur main ne bloque pas une PR sans rapport. Sur main (push) ou en
 * local, elle balaie tout le dépôt suivi. Un diff illisible retombe sur le balayage complet.
 */
function fichiersAJuger(): string[] {
  return restreindreALaPr(fichiersSuivis());
}
const fautes = analyser(fichiersAJuger());
if (fautes.length === 0) {
  console.log('✅ gov:publication — aucun contenu non publiable dans les fichiers suivis.');
  process.exit(0);
}
console.error(
  `❌ gov:publication — ${fautes.length} violation(s) de la règle de publication (REQ-GOV-031) :\n`
);
fautes.forEach((f) => console.error('   ' + f.message));
console.error(`\nCe dépôt est PUBLIC. Rien de ce qui est poussé ne peut être repris.`);
process.exit(1);
