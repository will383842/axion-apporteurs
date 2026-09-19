/**
 * maquettes-validees.ts — une tâche d'écran ne s'attribue pas avant que Will ait validé sa maquette
 * (UX-P0-02 ; REQ-UX-008, REQ-UX-017, REQ-UX-034). Registre : `docs/gates.json`, entrée
 * `maquettes-validees`.
 *
 * USAGE : pnpm gov:maquettes-validees          (juge le dépôt ; sort 1 sur faute, en la nommant)
 *         pnpm gov:maquettes-validees:prove    (un témoin par famille et ses contre-témoins, sur
 *                                               des vues INJECTÉES — la preuve ne lit pas le dépôt)
 *
 * POURQUOI CETTE GARDE EXISTE. `docs/maquettes/VALIDATION.md` le disait depuis la phase −1 : « une
 * tâche d'écran n'est pas attribuable tant que la maquette de son écran n'a pas une ligne validée ».
 * Seul le composeur de lots l'appliquait, au moment de composer. Une tâche d'écran attribuée À LA
 * MAIN — `reclasser --revendiquer`, une issue ouverte directement — ne rougissait nulle part, et la
 * maquette, qui est le verrou de la phase 1, n'était un verrou que pour qui passait par la porte
 * du composeur.
 *
 * CE QU'ELLE JUGE.
 *   — Le TABLEAU : colonnes lues par leur EN-TÊTE (Fichier, Tâche, Validé le, Par), jamais par leur
 *     position. Une ligne sans fichier `…html` entre accents graves, sans tâche `UX-P…`, ou au
 *     nombre de cellules faux est une faute nommée : une ligne illisible ne peut ni valider ni
 *     écarter, elle se tait — et c'est ce silence qu'on refuse.
 *   — La VALIDATION : une date ISO réelle ET « Will », ou rien du tout (`—`). Une moitié écrite est
 *     une faute, une date impossible aussi, et tout autre valideur que Will : c'est lui seul qui
 *     valide (VALIDATION.md, « Comment on valide »).
 *   — Le DISQUE : chaque ligne nomme une maquette qui existe, chaque maquette (hors `index.html`,
 *     la charte) a sa ligne. Une maquette sans ligne ne peut jamais être validée.
 *   — Le REGISTRE : chaque tâche nommée existe dans `docs/tasks.json`, et aucune tâche d'une ligne
 *     non validée n'est ATTRIBUÉE — un propriétaire posé, ou un statut au-delà de `a_faire`.
 *
 * CE QU'ELLE NE FAIT PAS, ET LE DIT.
 *   — Elle ne juge pas le CONTENU des maquettes : c'est `tests/unit/espace/maquettes-validees.spec.ts`
 *     (forme de l'accueil, contraste des deux thèmes, autonomie) et le harnais `tests/a11y/` de
 *     UX-P0-03.
 *   — Elle ne sait pas si Will a VRAIMENT validé : elle vérifie que la ligne dit qu'il l'a fait, sous
 *     une forme exacte. La preuve de la validation est l'historique git de la ligne.
 *   — Elle n'exige pas une ligne pour TOUTE tâche `UX-P1/2/3` : une tâche qui n'est pas un écran
 *     (e-mails, page de lien consommé…) n'a pas de maquette. La règle suit la ligne, comme le
 *     composeur ; la sortie IMPRIME le nombre de tâches `UX-P1/2/3` qu'aucune ligne ne nomme.
 *   — Elle accepte toute date PLAUSIBLE, une date future comprise : elle ne refuse que les dates
 *     qui n'existent pas au calendrier. Qu'une validation soit datée du bon jour, c'est l'historique
 *     git de la ligne qui le dit, pas la garde.
 *
 * LE COMPOSEUR LIT PAR ELLE. `scripts/lot/composer.ts` tire les tâches d'écran à écarter de
 * `tachesAEcarterParLeComposeur()`, exportée ici : les deux lectures ne peuvent plus diverger. Il
 * lisait avant l'avant-dernière cellule de chaque ligne, par position — la colonne « Par », sous un
 * commentaire qui disait « Validé le » —, et une colonne ajoutée à droite faisait passer une tâche
 * non validée pour validée.
 */

import { readFileSync, readdirSync } from 'node:fs';

export const VALIDEUR = 'Will';
export const DOSSIER_DES_MAQUETTES = 'docs/maquettes';
export const FICHIER_DE_VALIDATION = `${DOSSIER_DES_MAQUETTES}/VALIDATION.md`;
/** La page de la charte et du sommaire : ce n'est pas un écran, elle n'a pas de ligne. */
export const PAGES_HORS_ECRAN = ['index.html'] as const;

/** Les statuts d'une tâche que personne n'a encore prise. Au-delà, elle est attribuée. */
const STATUTS_NON_ATTRIBUES = new Set(['a_faire', 'proposee', 'bloquee', 'attente_externe']);

export const FAMILLES = [
  'tableau_illisible',
  'ligne_mal_formee',
  'validation_partielle',
  'date_invalide',
  'valideur_non_autorise',
  'maquette_absente',
  'maquette_sans_ligne',
  'tache_inconnue',
  'ecran_attribue_sans_validation',
] as const;
export type Famille = (typeof FAMILLES)[number];
export type Faute = { famille: Famille; message: string };

export type LigneDeValidation = {
  /** Numéro de ligne dans le fichier, à partir de 1. */
  numero: number;
  /** Le dernier titre `##` au-dessus du tableau (« Espace apporteur », « Console »). */
  section: string;
  ecran: string;
  fichier: string | null;
  taches: string[];
  valideLe: string;
  par: string;
};

export type Vue = {
  validation: string;
  /** Les fichiers `.html` de `docs/maquettes/`, noms seuls. */
  maquettes: readonly string[];
  taches: readonly { id: string; statut: string; owner: string | null }[];
};

const VIDE = /^(—|-+|)$/;
const estVide = (c: string) => VIDE.test(c.trim());
const IDENTIFIANT = /\bUX-P\d-[A-Za-z0-9]+\b/g;
const COLONNES = {
  fichier: /^fichier$/i,
  tache: /^t[âa]che/i,
  valideLe: /^valid[ée] le$/i,
  par: /^par$/i,
};

const cellules = (ligne: string) =>
  ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Une date `AAAA-MM-JJ` qui existe au calendrier. */
function dateReelle(texte: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

/**
 * Le lecteur du tableau. Il rend les lignes qu'il a su lire ET les fautes de forme : une ligne
 * qu'il ne sait pas lire n'est jamais sautée en silence.
 */
export function lireValidation(texte: string): {
  lignes: LigneDeValidation[];
  fautes: Faute[];
  /** Tout fichier `…html` nommé dans une ligne de tableau, même mal formée : il a une ligne, fautive. */
  mentionnes: Set<string>;
  /** Les tâches `UX-P…` nommées par une ligne MAL FORMÉE : ni validées ni lisibles, donc écartées. */
  tachesDesLignesFautives: Set<string>;
  tableaux: number;
} {
  const lignes: LigneDeValidation[] = [];
  const mentionnes = new Set<string>();
  const tachesDesLignesFautives = new Set<string>();
  const fautes: Faute[] = [];
  const brut = texte.split('\n');
  let section = '';
  let entete: string[] | null = null;
  let tableaux = 0;
  for (let i = 0; i < brut.length; i++) {
    const l = brut[i]!;
    if (/^##\s/.test(l)) section = l.replace(/^##\s+/, '').trim();
    if (!l.trim().startsWith('|')) {
      entete = null;
      continue;
    }
    const c = cellules(l);
    if (entete === null) {
      const lu = c;
      const indices = Object.values(COLONNES).map((re) => lu.findIndex((x) => re.test(x)));
      if (indices.every((x) => x >= 0)) {
        entete = lu;
        tableaux += 1;
      } else entete = ['__pas_un_tableau_de_validation__'];
      continue;
    }
    if (entete[0] === '__pas_un_tableau_de_validation__') continue;
    if (c.every((x) => /^:?-+:?$/.test(x))) continue; // la ligne de séparation
    const numero = i + 1;
    for (const m of l.matchAll(/`([^`]+\.html)`/g)) mentionnes.add(m[1]!);
    const fautive = () => {
      for (const id of l.match(IDENTIFIANT) ?? []) tachesDesLignesFautives.add(id);
    };
    if (c.length !== entete.length) {
      fautive();
      fautes.push({
        famille: 'ligne_mal_formee',
        message: `VALIDATION.md:${numero} — ${c.length} cellule(s) pour ${entete.length} colonne(s). Une ligne dont les colonnes glissent se lit de travers : la date passe dans « Par », et la ligne semble validée ou non au hasard.`,
      });
      continue;
    }
    const col = (re: RegExp) => c[entete!.findIndex((x) => re.test(x))]!;
    const fichier = /^`([^`]+\.html)`$/.exec(col(COLONNES.fichier))?.[1] ?? null;
    const taches = col(COLONNES.tache).match(IDENTIFIANT) ?? [];
    if (!fichier || taches.length === 0) {
      fautive();
      fautes.push({
        famille: 'ligne_mal_formee',
        message: `VALIDATION.md:${numero} — ${!fichier ? 'aucun fichier `…html` entre accents graves' : 'aucune tâche `UX-P…`'}. Une ligne sans fichier ou sans tâche ne verrouille rien : elle ne peut ni valider un écran ni en écarter un.`,
      });
      continue;
    }
    lignes.push({
      numero,
      section,
      ecran: c[entete.findIndex((x) => /^[ée]cran$/i.test(x))] ?? c[0]!,
      fichier,
      taches,
      valideLe: col(COLONNES.valideLe),
      par: col(COLONNES.par),
    });
  }
  if (tableaux === 0)
    fautes.push({
      famille: 'tableau_illisible',
      message: `VALIDATION.md — aucun tableau aux colonnes « Fichier », « Tâche », « Validé le » et « Par ». Sans tableau, AUCUNE tâche d'écran n'est écartée : la garde n'aurait rien à garder et sortirait en zéro.`,
    });
  return { lignes, fautes, mentionnes, tachesDesLignesFautives, tableaux };
}

/** Une ligne est validée si, et seulement si, elle porte une date réelle ET le nom du valideur. */
export function estValidee(l: LigneDeValidation): boolean {
  return dateReelle(l.valideLe) && l.par === VALIDEUR;
}

/** Les tâches que le composeur doit écarter : celles des lignes non validées. */
export function tachesNonValidees(lignes: readonly LigneDeValidation[]): Set<string> {
  const s = new Set<string>();
  for (const l of lignes) if (!estValidee(l)) for (const t of l.taches) s.add(t);
  return s;
}

/**
 * LA lecture du composeur de lots (`scripts/lot/composer.ts`, `maquettesNonValideesDepuis`) : il
 * n'en a pas d'autre, et les deux lectures ne peuvent donc plus diverger. Elle ÉCHOUE FERMÉ, là où
 * la garde, elle, NOMME : une ligne mal formée écarte ses tâches (elle ne valide rien), et un
 * fichier sans tableau lisible arrête le composeur — le laisser composer, ce serait n'écarter
 * AUCUNE tâche d'écran.
 */
export function tachesAEcarterParLeComposeur(texte: string): Set<string> {
  const { lignes, tachesDesLignesFautives, tableaux } = lireValidation(texte);
  if (tableaux === 0)
    throw new Error(
      `${FICHIER_DE_VALIDATION} : aucun tableau aux colonnes « Fichier », « Tâche », « Validé le » et « Par ». ` +
        `Le composeur s'arrête : sans tableau, il n'écarterait aucune tâche d'écran.`
    );
  const s = tachesNonValidees(lignes);
  for (const id of tachesDesLignesFautives) s.add(id);
  return s;
}

export function controler(vue: Vue): Faute[] {
  const { lignes, fautes, mentionnes, tableaux } = lireValidation(vue.validation);
  const ids = new Map(vue.taches.map((t) => [t.id, t]));
  for (const l of lignes) {
    const ou = `VALIDATION.md:${l.numero} (${l.fichier})`;
    const dateEcrite = !estVide(l.valideLe);
    const parEcrit = !estVide(l.par);
    if (dateEcrite !== parEcrit)
      fautes.push({
        famille: 'validation_partielle',
        message: `${ou} — « Validé le » = « ${l.valideLe} », « Par » = « ${l.par} ». Une validation s'écrit en entier (la date ET « ${VALIDEUR} ») ou pas du tout : à moitié écrite, elle ne valide rien, et elle a l'air de valider.`,
      });
    if (dateEcrite && !dateReelle(l.valideLe))
      fautes.push({
        famille: 'date_invalide',
        message: `${ou} — « ${l.valideLe} » n'est pas une date AAAA-MM-JJ qui existe. La date de validation est ce qu'une modification ultérieure de la maquette doit pouvoir dépasser.`,
      });
    if (parEcrit && l.par !== VALIDEUR)
      fautes.push({
        famille: 'valideur_non_autorise',
        message: `${ou} — validée par « ${l.par} ». Seul ${VALIDEUR} valide une maquette : un écran conçu par un agent et validé par un agent est un écran conçu pour un agent.`,
      });
    if (!vue.maquettes.includes(l.fichier!))
      fautes.push({
        famille: 'maquette_absente',
        message: `${ou} — le fichier n'existe pas dans ${DOSSIER_DES_MAQUETTES}/. Une ligne validée sur une maquette absente ouvrirait un écran que personne n'a vu.`,
      });
    for (const id of l.taches) {
      const t = ids.get(id);
      if (!t) {
        fautes.push({
          famille: 'tache_inconnue',
          message: `${ou} — ${id} n'existe pas dans docs/tasks.json. Une ligne qui verrouille une tâche inconnue ne verrouille rien, et la vraie tâche de l'écran passe.`,
        });
        continue;
      }
      if (!estValidee(l) && (t.owner !== null || !STATUTS_NON_ATTRIBUES.has(t.statut)))
        fautes.push({
          famille: 'ecran_attribue_sans_validation',
          message: `${id} est attribuée (statut « ${t.statut} », propriétaire « ${t.owner ?? '—'} ») alors que sa maquette ${l.fichier} n'est pas validée par ${VALIDEUR} (${ou}). Une tâche d'écran ne s'attribue qu'après la validation : c'est le verrou de la phase 1.`,
        });
    }
  }
  // Sans tableau, « sans ligne » ne dit rien de plus que `tableau_illisible` : on ne le répète pas.
  if (tableaux === 0) return fautes;
  for (const m of vue.maquettes) {
    if ((PAGES_HORS_ECRAN as readonly string[]).includes(m) || mentionnes.has(m)) continue;
    fautes.push({
      famille: 'maquette_sans_ligne',
      message: `${DOSSIER_DES_MAQUETTES}/${m} n'a aucune ligne dans VALIDATION.md : elle ne pourra jamais être validée, et l'écran qu'elle dessine ne sera jamais verrouillé.`,
    });
  }
  return fautes;
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

export function vueDuDepot(): Vue {
  const registre = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: { id: string; statut: string; owner: string | null }[];
  };
  return {
    validation: readFileSync(FICHIER_DE_VALIDATION, 'utf8'),
    // Le DISQUE, et non `git ls-files` : une maquette neuve, pas encore suivie, doit déjà réclamer
    // sa ligne (une garde qui lit l'index est aveugle aux fichiers neufs).
    maquettes: readdirSync(DOSSIER_DES_MAQUETTES).filter((f) => f.endsWith('.html')),
    taches: registre.taches.map((t) => ({ id: t.id, statut: t.statut, owner: t.owner ?? null })),
  };
}

// ── la preuve ────────────────────────────────────────────────────────────────

const TABLEAU = (milieu: string) => `## Espace apporteur

| Écran | Fichier | Tâche | Validé le | Par |
| --- | --- | --- | --- | --- |
| Accueil | \`a.html\` | UX-P1-08 | 2026-09-19 | Will |
${milieu}
| Lot | \`c.html\` | UX-P2-03 | — | — |
`;
const MILIEU_OK = '| Entreprise | `b.html` | UX-P1-01 | — | — |';
const VUE_TEMOIN = (validation: string, s: Partial<Vue> = {}): Vue => ({
  validation,
  maquettes: ['a.html', 'b.html', 'c.html', 'index.html'],
  taches: ['UX-P1-08', 'UX-P1-01', 'UX-P2-03'].map((id) => ({
    id,
    statut: 'a_faire',
    owner: null,
  })),
  ...s,
});

export const TEMOINS: { famille: Famille; nom: string; vue: Vue }[] = [
  { famille: 'tableau_illisible', nom: 'aucun tableau', vue: VUE_TEMOIN('# rien\n') },
  {
    famille: 'ligne_mal_formee',
    nom: 'une cellule manque, au milieu',
    vue: VUE_TEMOIN(TABLEAU('| Entreprise | `b.html` | UX-P1-01 | — |')),
  },
  {
    famille: 'validation_partielle',
    nom: 'date sans valideur, au milieu',
    vue: VUE_TEMOIN(TABLEAU('| Entreprise | `b.html` | UX-P1-01 | 2026-09-19 | — |')),
  },
  {
    famille: 'date_invalide',
    nom: '30 février',
    vue: VUE_TEMOIN(TABLEAU('| Entreprise | `b.html` | UX-P1-01 | 2026-02-30 | Will |')),
  },
  {
    famille: 'valideur_non_autorise',
    nom: 'validée par un agent',
    vue: VUE_TEMOIN(TABLEAU('| Entreprise | `b.html` | UX-P1-01 | 2026-09-19 | A06 |')),
  },
  {
    famille: 'maquette_absente',
    nom: 'b.html retiré du disque',
    vue: VUE_TEMOIN(TABLEAU(MILIEU_OK), { maquettes: ['a.html', 'c.html'] }),
  },
  {
    famille: 'maquette_sans_ligne',
    nom: 'd.html sans ligne',
    vue: VUE_TEMOIN(TABLEAU(MILIEU_OK), { maquettes: ['a.html', 'b.html', 'c.html', 'd.html'] }),
  },
  {
    famille: 'tache_inconnue',
    nom: 'UX-P9-99',
    vue: VUE_TEMOIN(TABLEAU('| Entreprise | `b.html` | UX-P9-99 | — | — |')),
  },
  {
    famille: 'ecran_attribue_sans_validation',
    nom: 'la tâche de la ligne du MILIEU prise sans validation',
    vue: VUE_TEMOIN(TABLEAU(MILIEU_OK), {
      taches: [
        { id: 'UX-P1-08', statut: 'a_faire', owner: null },
        { id: 'UX-P1-01', statut: 'en_cours', owner: 'A05' },
        { id: 'UX-P2-03', statut: 'a_faire', owner: null },
      ],
    }),
  },
];

export const CONTRE_TEMOINS: { nom: string; vue: Vue }[] = [
  {
    nom: 'un tableau conforme, une ligne validée et deux non',
    vue: VUE_TEMOIN(TABLEAU(MILIEU_OK)),
  },
  {
    nom: 'une tâche attribuée sur une ligne VALIDÉE',
    vue: VUE_TEMOIN(TABLEAU(MILIEU_OK), {
      taches: [
        { id: 'UX-P1-08', statut: 'en_cours', owner: 'A05' },
        { id: 'UX-P1-01', statut: 'a_faire', owner: null },
        { id: 'UX-P2-03', statut: 'a_faire', owner: null },
      ],
    }),
  },
  { nom: 'index.html sans ligne (la charte)', vue: VUE_TEMOIN(TABLEAU(MILIEU_OK)) },
];

function prouver(): number {
  let echecs = 0;
  for (const t of TEMOINS) {
    const vues = [...new Set(controler(t.vue).map((f) => f.famille))];
    const ok = vues.length === 1 && vues[0] === t.famille;
    if (!ok) echecs += 1;
    console.log(
      `${ok ? '🔴 rougit ' : '❌ MANQUÉ '} ${t.famille} — ${t.nom}${ok ? '' : ` (vu : ${vues.join(', ') || 'rien'})`}`
    );
  }
  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.vue);
    if (f.length) echecs += 1;
    console.log(
      `${f.length ? '❌ ROUGIT ' : '🟢 vert    '} contre-témoin — ${c.nom}${f.length ? ` (${f.map((x) => x.famille).join(', ')})` : ''}`
    );
  }
  const couvertes = new Set(TEMOINS.map((t) => t.famille));
  for (const f of FAMILLES)
    if (!couvertes.has(f)) {
      echecs += 1;
      console.log(`❌ famille sans témoin : ${f}`);
    }
  console.log(
    echecs
      ? `❌ gov:maquettes-validees --prove — ${echecs} écart(s)`
      : `✅ gov:maquettes-validees --prove — ${FAMILLES.length} familles, un témoin chacune, ${CONTRE_TEMOINS.length} contre-témoins verts`
  );
  return echecs ? 1 : 0;
}

function juger(): number {
  const vue = vueDuDepot();
  const { lignes } = lireValidation(vue.validation);
  const fautes = controler(vue);
  const validees = lignes.filter(estValidee);
  const ecartees = [...tachesNonValidees(lignes)].sort();
  const nommees = new Set(lignes.flatMap((l) => l.taches));
  const sansLigne = vue.taches.filter((t) => /^UX-P[123]-/.test(t.id) && !nommees.has(t.id)).length;
  for (const f of fautes) console.error(`❌ [${f.famille}] ${f.message}`);
  const bilan =
    `${lignes.length} ligne(s) lue(s), ${validees.length} validée(s) par ${VALIDEUR}, ` +
    `${vue.maquettes.length} maquette(s) sur le disque ; tâches d'écran écartées tant que non validées : ` +
    `${ecartees.join(', ') || 'aucune'} ; ${sansLigne} tâche(s) UX-P1/2/3 ne sont nommées par aucune ligne (pas un écran, ou écran sans maquette : la garde ne les juge pas).`;
  console.log(
    fautes.length
      ? `❌ gov:maquettes-validees — ${fautes.length} faute(s). ${bilan}`
      : `✅ gov:maquettes-validees — ${bilan}`
  );
  return fautes.length ? 1 : 0;
}

const LANCE_EN_SCRIPT = (process.argv[1] ?? '')
  .replace(/\\/g, '/')
  .endsWith('scripts/gates/maquettes-validees.ts');
if (LANCE_EN_SCRIPT) process.exit(process.argv.includes('--prove') ? prouver() : juger());
