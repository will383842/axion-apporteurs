/**
 * fiches-tiers.controles.ts — les douze contrôles des fiches tiers (GOV-015, REQ-CPL-002, REQ-GOV-022).
 *
 * POURQUOI CE FICHIER N'EST PAS LE `.spec.ts`. Les contrôles sont des fonctions PURES : elles prennent
 * le texte des fiches et rendent des fautes. Séparées du test, elles peuvent être exercées deux fois —
 * sur l'état réel du dépôt, et sur des états FABRIQUÉS, un par famille de règle, dont on vérifie qu'ils
 * rougissent (RM-02). Un contrôle qu'on n'a jamais vu rougir ne garde rien, et une garde seulement
 * DÉCRITE dans un README n'a jamais rien retenu.
 *
 * USAGE hors Vitest :
 *   npx tsx tests/unit/gouvernance/fiches-tiers.controles.ts            → contrôle le dépôt
 *   npx tsx tests/unit/gouvernance/fiches-tiers.controles.ts --prove    → témoins et contre-témoins
 *
 * CE QUI EST DÉRIVÉ, ET NON RECOPIÉ (RM-01). Le test ne contient ni la liste des tiers, ni les neuf
 * titres du gabarit, ni la liste fermée des responsables, ni les quatre éléments de source, ni les
 * formules d'attente : tout cela est LU dans `docs/tiers/README.md`, entre des marqueurs. La liste des
 * fiches attendues par les exigences est lue dans `docs/requirements.json`. Deux copies divergent
 * toujours, et c'est celle qui est lue qui a tort.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type Faute = { famille: string; message: string };

export type Entree = {
  /** Le texte de `docs/tiers/README.md`. */
  readme: string;
  /** Le texte de chaque fiche, indexé par son nom de fichier (`banque.md`). */
  fiches: Record<string, string>;
  /** Le texte brut de `docs/requirements.json`. */
  exigences: string;
};

export const FAMILLES = [
  'readme_illisible',
  'fiche_manquante',
  'fiche_hors_tableau',
  'chemin_cite_sans_fiche',
  'gabarit_incomplet',
  'rubrique2_structure',
  'attente_sans_responsable',
  'coordonnee_publiee',
  'disjonction_cpl_002',
  'entete_fixture_manquant',
  'identifiant_hors_tableau',
  'rubrique2_incomplete_non_declaree',
] as const;

// ── lecture des blocs dérivés du README ──────────────────────────────────────

function bloc(readme: string, nom: string): string[] {
  const re = new RegExp(`<!--\\s*${nom}:debut\\s*-->([\\s\\S]*?)<!--\\s*${nom}:fin\\s*-->`);
  const m = re.exec(readme);
  if (m === null) return [];
  return m[1]!
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('```'));
}

type Ligne = { fiche: string; identifiants: Set<string> };

function tableau(readme: string): Ligne[] {
  const out: Ligne[] = [];
  for (const l of bloc(readme, 'tableau-tiers')) {
    if (!l.startsWith('|')) continue;
    const cellules = l.split('|').slice(1, -1).map((c) => c.trim());
    if (cellules.length === 0) continue;
    if (cellules.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const nom = /`([a-z0-9-]+\.md)`/.exec(cellules[0] ?? '');
    if (nom === null) continue;
    out.push({ fiche: nom[1]!, identifiants: identifiants(cellules.slice(1).join(' ')) });
  }
  return out;
}

// ── extraction ───────────────────────────────────────────────────────────────

const RE_REQ = /REQ-[A-Z]{2,4}-\d{3}/g;
/**
 * Les décisions du registre. Le `(?<![A-Za-z0-9-])` de tête n'est pas décoratif : sans lui, `EXT-021`
 * était « trouvé » à l'intérieur de `REQ-EXT-021`, et deux décisions fantômes entraient dans la vue.
 */
const RE_DECISION =
  /(?<![A-Za-z0-9-])(?:HYP-[A-Z]\d*(?:-\d+)?|DEC-[A-Z]+-\d{3}|EXT-\d+[a-z]?|W\d{1,2})(?![A-Za-z0-9])/g;

function identifiants(texte: string): Set<string> {
  const out = new Set<string>();
  for (const re of [RE_REQ, RE_DECISION]) {
    re.lastIndex = 0;
    for (const m of texte.matchAll(re)) out.add(m[0]);
  }
  return out;
}

/** Le corps d'une fiche : tout sauf le chapeau en citation, qui cite la tâche et non le tiers. */
function corps(fiche: string): string {
  return fiche
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('>'))
    .join('\n');
}

function rubrique(fiche: string, titre: string): string | null {
  const lignes = fiche.split('\n');
  const debut = lignes.findIndex((l) => l.trim() === titre);
  if (debut === -1) return null;
  const reste = lignes.slice(debut + 1);
  const fin = reste.findIndex((l) => l.startsWith('## '));
  return (fin === -1 ? reste : reste.slice(0, fin)).join('\n');
}

/** Les titres de niveau 2 d'une fiche, dans l'ordre où ils apparaissent. */
function titres(fiche: string): string[] {
  return fiche
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('## '));
}

/** Une suite est-elle une SOUS-SUITE d'une autre ? Une fiche a le droit de porter des sections en plus. */
function sousSuite(attendus: string[], presents: string[]): boolean {
  let i = 0;
  for (const p of presents) if (i < attendus.length && p === attendus[i]) i++;
  return i === attendus.length;
}

// ── ce qu'un dépôt public ne publie pas ──────────────────────────────────────

const COORDONNEES: { motif: RegExp; quoi: string }[] = [
  { motif: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, quoi: 'adresse électronique' },
  { motif: /\b[A-Z]{2}\d{2} ?[A-Z0-9]{4}(?: ?[A-Z0-9]{4}){2,}/g, quoi: 'identifiant bancaire' },
  { motif: /\b(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}\b/g, quoi: 'numéro de téléphone' },
  { motif: /\b(?:sk|pk|ghp|gho|xox[baprs])[_-][A-Za-z0-9]{10,}\b/g, quoi: 'jeton' },
];

// ── le contrôle ──────────────────────────────────────────────────────────────

export function controler(e: Entree): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string): void => {
    fautes.push({ famille, message });
  };

  const gabarit = bloc(e.readme, 'gabarit');
  const elementsSource = bloc(e.readme, 'elements-source');
  const formules = bloc(e.readme, 'formules-attente').map((f) => f.toLowerCase());
  const responsablesBruts = bloc(e.readme, 'liste-fermee');
  const declareesIncompletes = new Set(bloc(e.readme, 'rubrique2-incomplete'));
  const lignes = tableau(e.readme);

  for (const [nom, valeurs] of [
    ['gabarit', gabarit],
    ['elements-source', elementsSource],
    ['formules-attente', formules],
    ['liste-fermee', responsablesBruts],
    ['tableau-tiers', lignes],
  ] as [string, unknown[]][]) {
    if (valeurs.length === 0) {
      ajouter(
        'readme_illisible',
        `docs/tiers/README.md — le bloc « ${nom} » est absent ou vide. Le test DÉRIVE ses listes de ce ` +
          `bloc (RM-01) : sans lui, il ne vérifie plus rien et se tait.`
      );
    }
  }
  // Le bloc « rubrique2-incomplete » a le droit d'être vide : ce sera le jour où toutes les rubriques 2
  // seront remplies. C'est la seule liste dont le vide est une bonne nouvelle.

  const responsables = responsablesBruts.map((r) =>
    r.startsWith('/') && r.endsWith('/') ? new RegExp(r.slice(1, -1)) : r
  );
  const nomme = (ligne: string): boolean =>
    responsables.some((r) => (typeof r === 'string' ? ligne.includes(r) : r.test(ligne)));

  // 1. Le tableau et les fichiers se répondent, dans les deux sens.
  const nomsDuTableau = new Set(lignes.map((l) => l.fiche));
  for (const l of lignes) {
    if (e.fiches[l.fiche] === undefined) {
      ajouter(
        'fiche_manquante',
        `docs/tiers/README.md — le tableau « Les tiers » cite \`${l.fiche}\`, qui n'existe pas. ` +
          `Une ligne de tableau n'est pas une fiche.`
      );
    }
  }
  for (const nom of Object.keys(e.fiches)) {
    if (!nomsDuTableau.has(nom)) {
      ajouter(
        'fiche_hors_tableau',
        `docs/tiers/${nom} — cette fiche n'a pas de ligne dans le tableau « Les tiers » du README. ` +
          `Un tiers qu'aucun index ne nomme est un tiers que personne ne relira.`
      );
    }
  }

  // 2. Les chemins que les EXIGENCES nomment existent.
  for (const m of e.exigences.matchAll(/docs\/tiers\/([a-z0-9-]+\.md)/g)) {
    const nom = m[1]!;
    if (e.fiches[nom] === undefined) {
      ajouter(
        'chemin_cite_sans_fiche',
        `docs/requirements.json cite \`docs/tiers/${nom}\`, qui n'existe pas. Une exigence qui nomme ` +
          `un chemin le rend obligatoire.`
      );
    }
  }

  for (const [nom, texte] of Object.entries(e.fiches)) {
    const ligne = lignes.find((l) => l.fiche === nom);

    // 3. Le gabarit : les neuf titres, à l'identique et dans l'ordre. Des sections en plus sont permises.
    if (gabarit.length > 0 && !sousSuite(gabarit, titres(texte))) {
      const manquants = gabarit.filter((t) => !titres(texte).includes(t));
      ajouter(
        'gabarit_incomplet',
        `docs/tiers/${nom} — les neuf rubriques du gabarit n'y sont pas toutes, à l'identique et dans ` +
          `l'ordre. Manque ou hors d'ordre : ${manquants.length > 0 ? manquants.join(' · ') : '(ordre interverti)'}.`
      );
    }

    // 4. La rubrique 2 porte ses quatre lignes nommées — présentes même vides.
    const r2 = rubrique(texte, '## 2. Source officielle');
    if (r2 === null) {
      ajouter('rubrique2_structure', `docs/tiers/${nom} — la rubrique « ## 2. Source officielle » est absente.`);
    } else {
      for (const element of elementsSource) {
        const presente = r2
          .split('\n')
          .some((l) => l.startsWith('|') && (l.split('|')[1] ?? '').trim() === element);
        if (!presente) {
          ajouter(
            'rubrique2_structure',
            `docs/tiers/${nom} — la rubrique 2 ne porte pas la ligne « ${element} ». ` +
              `REQ-GOV-022 exige les quatre éléments NOMMÉS, même vides : un élément qu'on n'écrit pas ` +
              `est un élément que personne ne réclamera.`
          );
        }
      }
    }

    // 5. Toute formule d'attente nomme, sur SA ligne, un responsable de la liste fermée.
    texte.split('\n').forEach((l, i) => {
      if (l.trimStart().startsWith('#')) return; // un titre de rubrique n'est pas une ligne d'attente
      const bas = l.toLowerCase();
      const formule = formules.find((f) => bas.includes(f));
      if (formule === undefined) return;
      if (!nomme(l)) {
        ajouter(
          'attente_sans_responsable',
          `docs/tiers/${nom}:${i + 1} — « ${formule} » sans responsable. Une ligne « ${formule} » sans ` +
            `nom n'est pas une ligne : c'est un trou. Nomme sur la même ligne un responsable de la ` +
            `liste fermée du README.`
        );
      }
    });

    // 6. Aucune coordonnée dans un dépôt PUBLIC (W13) : la rubrique 6 nomme un rôle.
    for (const { motif, quoi } of COORDONNEES) {
      motif.lastIndex = 0;
      const trouve = motif.exec(texte);
      if (trouve !== null) {
        ajouter(
          'coordonnee_publiee',
          `docs/tiers/${nom} — ${quoi} en clair (« ${trouve[0]} »). Le dépôt est public (W13) : ` +
            `la rubrique 6 nomme un rôle et une procédure, jamais une coordonnée.`
        );
      }
    }

    // 7. La rubrique 9 prescrit DEUX en-têtes, et non un seul.
    const r9 = rubrique(texte, '## 9. Référence à citer dans une fixture');
    const attendu = `Confronte-a: docs/tiers/${nom}#2-source-officielle`;
    if (r9 === null || !r9.includes('Source:') || !r9.includes(attendu)) {
      ajouter(
        'entete_fixture_manquant',
        `docs/tiers/${nom} — la rubrique 9 doit prescrire les DEUX en-têtes : \`Source:\` (le producteur ` +
          `réel, que lit la garde \`fixtures:source\`) et \`${attendu}\` (la confrontation qu'exige ` +
          `REQ-GOV-022). Un seul en-tête ne peut pas nommer les deux.`
      );
    }

    // 8. Toute exigence ou décision citée par la fiche figure dans sa ligne du tableau.
    if (ligne !== undefined) {
      for (const id of identifiants(corps(texte))) {
        if (!ligne.identifiants.has(id)) {
          ajouter(
            'identifiant_hors_tableau',
            `docs/tiers/README.md — \`${nom}\` cite ${id} dans son corps, absent de sa ligne du tableau ` +
              `« Les tiers ». Une vue qui ne contient pas ce que sa source contient diverge dès la ` +
              `première relecture.`
          );
        }
      }
    }
  }

  // 9. REQ-CPL-002 : la banque est connue, OU le repli est acté. Les deux branches sont vérifiées.
  const banque = e.fiches['banque.md'];
  if (banque !== undefined) {
    const attentesRestantes = banque
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .some((l) => formules.some((f) => l.toLowerCase().includes(f)));
    const brancheConnue = !attentesRestantes;
    const brancheRepli =
      banque.includes('HYP-W2') && banque.includes('EndToEndId') && banque.includes('saisie manuelle');
    if (!brancheConnue && !brancheRepli) {
      ajouter(
        'disjonction_cpl_002',
        `docs/tiers/banque.md — REQ-CPL-002 n'est satisfaite par aucune de ses deux branches : ni les ` +
          `éléments de l'établissement ne sont tous renseignés, ni le repli n'est acté (citation de ` +
          `\`HYP-W2\`, saisie manuelle, EndToEndId). Une disjonction dont aucun terme n'est vrai est fausse.`
      );
    }
  }

  // 10. L'état PARTIEL est déclaré, et il est dérivé — pas décoratif.
  const derivees = new Set<string>();
  for (const [nom, texte] of Object.entries(e.fiches)) {
    const r2 = rubrique(texte, '## 2. Source officielle');
    if (r2 === null) {
      derivees.add(nom);
      continue;
    }
    for (const element of elementsSource) {
      const l = r2.split('\n').find((x) => x.startsWith('|') && (x.split('|')[1] ?? '').trim() === element);
      const valeur = (l ?? '').split('|')[2]?.trim() ?? '';
      if (valeur === '' || valeur === '—' || formules.some((f) => valeur.toLowerCase().includes(f))) {
        derivees.add(nom);
      }
    }
  }
  for (const nom of derivees) {
    if (!declareesIncompletes.has(nom)) {
      ajouter(
        'rubrique2_incomplete_non_declaree',
        `docs/tiers/README.md — la rubrique 2 de \`${nom}\` est incomplète, et le README ne le déclare ` +
          `pas. Le « reste à faire » d'une tâche partielle se lit dans l'index, sinon il disparaît.`
      );
    }
  }
  for (const nom of declareesIncompletes) {
    if (!derivees.has(nom)) {
      ajouter(
        'rubrique2_incomplete_non_declaree',
        `docs/tiers/README.md — \`${nom}\` est déclarée incomplète alors que sa rubrique 2 est remplie. ` +
          `Retire-la de la liste : une liste de restes qu'on ne raccourcit jamais ne mesure plus rien.`
      );
    }
  }

  return fautes;
}

// ── chargement ───────────────────────────────────────────────────────────────

export function charger(racineTiers: string, cheminExigences: string): Entree {
  const fiches: Record<string, string> = {};
  for (const f of readdirSync(racineTiers)) {
    if (!f.endsWith('.md') || f === 'README.md') continue;
    fiches[f] = readFileSync(join(racineTiers, f), 'utf8');
  }
  return {
    readme: readFileSync(join(racineTiers, 'README.md'), 'utf8'),
    fiches,
    exigences: existsSync(cheminExigences) ? readFileSync(cheminExigences, 'utf8') : '{}',
  };
}

// ── témoins : une famille, un défaut injecté, un rouge ────────────────────────

function copie(e: Entree): Entree {
  return { readme: e.readme, fiches: { ...e.fiches }, exigences: e.exigences };
}

/** Écrit une ligne DANS une fiche, juste après le titre de sa rubrique 4. */
function injecter(e: Entree, fiche: string, ligne: string): Entree {
  const d = copie(e);
  d.fiches[fiche] = (d.fiches[fiche] ?? '').replace(
    '## 4. Quotas et limites\n',
    `## 4. Quotas et limites\n\n${ligne}\n`
  );
  return d;
}

export const TEMOINS: { famille: string; defaut: (e: Entree) => Entree }[] = [
  {
    famille: 'readme_illisible',
    defaut: (e) => {
      const d = copie(e);
      d.readme = d.readme.replace('<!-- gabarit:debut -->', '<!-- gabarit-desarme -->');
      return d;
    },
  },
  {
    famille: 'fiche_manquante',
    defaut: (e) => {
      const d = copie(e);
      delete d.fiches['telegram.md'];
      return d;
    },
  },
  {
    famille: 'fiche_hors_tableau',
    defaut: (e) => {
      const d = copie(e);
      d.fiches['tiers-non-indexe.md'] = '# Un tiers que le README ne nomme pas\n';
      return d;
    },
  },
  {
    famille: 'chemin_cite_sans_fiche',
    defaut: (e) => {
      const d = copie(e);
      d.exigences = d.exigences.replace(/docs\/tiers\/tiime\.md/g, 'docs/tiers/tiime-v2.md');
      return d;
    },
  },
  {
    famille: 'gabarit_incomplet',
    defaut: (e) => {
      const d = copie(e);
      d.fiches['coolify.md'] = (d.fiches['coolify.md'] ?? '').replace(
        '## 5. Mode dégradé — s\'il tombe',
        '## Ce qui se passe en panne'
      );
      return d;
    },
  },
  {
    famille: 'rubrique2_structure',
    defaut: (e) => {
      const d = copie(e);
      d.fiches['github.md'] = (d.fiches['github.md'] ?? '')
        .split('\n')
        .filter((l) => !l.startsWith('| Exemple officiel |'))
        .join('\n');
      return d;
    },
  },
  {
    famille: 'attente_sans_responsable',
    defaut: (e) => injecter(e, 'urssaf.md', '| Format du résultat | **à confirmer** |'),
  },
  {
    famille: 'coordonnee_publiee',
    defaut: (e) => injecter(e, 'zeptomail.md', 'Support du tiers : support@zeptomail.example.'),
  },
  {
    famille: 'disjonction_cpl_002',
    defaut: (e) => {
      const d = copie(e);
      d.fiches['banque.md'] = (d.fiches['banque.md'] ?? '').replace(/HYP-W2/g, 'la ligne du registre');
      return d;
    },
  },
  {
    famille: 'entete_fixture_manquant',
    defaut: (e) => {
      const d = copie(e);
      d.fiches['docuseal.md'] = (d.fiches['docuseal.md'] ?? '').replace(
        'Confronte-a: docs/tiers/docuseal.md#2-source-officielle',
        ''
      );
      return d;
    },
  },
  {
    famille: 'identifiant_hors_tableau',
    defaut: (e) => injecter(e, 'telegram.md', 'Le fichier de remise est validé contre REQ-QA-029.'),
  },
  {
    famille: 'rubrique2_incomplete_non_declaree',
    defaut: (e) => {
      const d = copie(e);
      d.readme = d.readme.replace(/^telegram\.md$/m, '');
      return d;
    },
  },
];

/**
 * Contre-témoins : ce que le contrôle ne doit PAS faire rougir. Une garde qui rougit sur tout ne dit
 * rien de plus qu'une garde qui ne rougit jamais — et celle-ci a failli interdire trois écritures
 * légitimes : une section ajoutée à une fiche, un nom de domaine, un article du code du travail.
 */
export const CONTRE_TEMOINS: { nom: string; legitime: (e: Entree) => Entree }[] = [
  {
    nom: 'une fiche porte une section EN PLUS des neuf rubriques',
    legitime: (e) => {
      const d = copie(e);
      d.fiches['coolify.md'] = `${d.fiches['coolify.md'] ?? ''}\n## Annexe — historique des offres examinées\n\nRien à ce jour.\n`;
      return d;
    },
  },
  {
    nom: 'une attente nommément confiée à Will',
    legitime: (e) => injecter(e, 'urssaf.md', '| Localisation du service | **à confirmer** par Will |'),
  },
  {
    nom: 'une attente confiée à l’expert-comptable, à défaut Will',
    legitime: (e) =>
      injecter(e, 'tiime.md', '| Voie d’import | **à confirmer** par l’expert-comptable, à défaut Will |'),
  },
  {
    nom: 'une lecture répartie par un code de poste',
    legitime: (e) =>
      injecter(e, 'github.md', '| Débit de l’interface | **à relever** par le lecteur désigné par `A01` |'),
  },
  {
    nom: 'un nom de domaine n’est pas une adresse électronique',
    legitime: (e) =>
      injecter(e, 'zeptomail.md', 'L’inclusion SPF vise le domaine `eu.zeptomail.net` du service.'),
  },
  {
    nom: 'un article du code du travail n’est pas un identifiant bancaire',
    legitime: (e) => injecter(e, 'urssaf.md', 'Le seuil est celui de l’article D.8222-5 du code du travail.'),
  },
  {
    nom: 'un horodatage n’est pas un numéro de téléphone',
    legitime: (e) => injecter(e, 'telegram.md', 'La tolérance de signature est de 300 secondes, mesurée le 2026-09-03.'),
  },
];

export type Preuve = { ok: boolean; rouges: { famille: string; message: string }[]; erreurs: string[] };

export function prouver(base: Entree): Preuve {
  const erreurs: string[] = [];
  const rouges: { famille: string; message: string }[] = [];

  const depart = controler(base);
  if (depart.length > 0) {
    erreurs.push(
      `La preuve part d'un dossier DÉJÀ fautif (${depart.length}) — corrige d'abord : ` +
        depart.slice(0, 3).map((f) => `[${f.famille}] ${f.message}`).join(' | ')
    );
    return { ok: false, rouges, erreurs };
  }

  for (const t of TEMOINS) {
    const f = controler(t.defaut(base));
    const sienne = f.find((x) => x.famille === t.famille);
    if (sienne === undefined) {
      erreurs.push(
        `Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille (${f.length} faute(s) d'autres ` +
          `familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      continue;
    }
    rouges.push({ famille: t.famille, message: sienne.message });
  }

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.legitime(base));
    if (f.length > 0) {
      erreurs.push(`Faux positif : « ${c.nom} » a fait rougir « ${f[0]!.famille} » — ${f[0]!.message}`);
    }
  }

  const sansTemoin = FAMILLES.filter((fam) => !rouges.some((r) => r.famille === fam));
  if (sansTemoin.length > 0) {
    erreurs.push(`Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
  }

  return { ok: erreurs.length === 0, rouges, erreurs };
}

// ── exécution directe (hors Vitest) ──────────────────────────────────────────

const executeDirectement =
  process.argv[1] !== undefined && /fiches-tiers\.controles\.(ts|js)$/.test(process.argv[1]);

if (executeDirectement) {
  const iRacine = process.argv.indexOf('--tiers');
  const iExigences = process.argv.indexOf('--exigences');
  const racine = iRacine === -1 ? 'docs/tiers' : (process.argv[iRacine + 1] ?? 'docs/tiers');
  const exigences =
    iExigences === -1 ? 'docs/requirements.json' : (process.argv[iExigences + 1] ?? 'docs/requirements.json');
  const base = charger(racine, exigences);

  if (process.argv.includes('--prove')) {
    const p = prouver(base);
    for (const r of p.rouges) console.log(`ROUGE [${r.famille}] ${r.message}`);
    for (const err of p.erreurs) console.error(`❌ ${err}`);
    if (!p.ok) process.exit(1);
    console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
    console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
    console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
    process.exit(0);
  }

  const fautes = controler(base);
  if (fautes.length === 0) {
    console.log(
      `✅ fiches-tiers — ${Object.keys(base.fiches).length} fiches, ${FAMILLES.length} contrôles verts.`
    );
    process.exit(0);
  }
  console.error(`❌ fiches-tiers — ${fautes.length} faute(s) :\n`);
  fautes.forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
  process.exit(1);
}
