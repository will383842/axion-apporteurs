/**
 * gov-lecons.ts — la garde du journal des leçons (GOV-018, REQ-GOV-023, RM-02).
 *
 * USAGE : pnpm gov:lecons --now <AAAA-MM-JJ>              (nightly ; échoue si la consolidation a vieilli)
 *         pnpm gov:lecons --now <date> --fichier <chemin> (juge un autre journal — bancs d'essai des tests)
 *         pnpm gov:lecons --prove                         (un témoin par famille, des contre-témoins verts)
 *
 * CE QU'ELLE TIENT, ET POURQUOI CE N'EST PAS UN CONTRÔLE D'ÂGE. REQ-GOV-023 demande deux choses :
 * que `docs/LECONS.md` porte une date de dernière consolidation, et qu'un rouge tombe quand cette
 * date a plus de sept jours ALORS QUE des entrées « appris » non consolidées existent. La seconde
 * moitié de la phrase est la garde ; la première, toute seule, ferait rougir un journal parfait
 * simplement parce que la semaine a passé sans que personne n'ait rien appris. Un rouge qui tombe
 * sans dette est un rouge qu'on apprend à ignorer, et une garde qu'on ignore est désarmée (RM-02).
 * D'où deux contre-témoins qui comptent autant que le témoin : péremption SANS entrée en attente →
 * vert ; sept jours PILE avec des entrées en attente → vert, parce que « plus de 7 jours » est une
 * borne et qu'une borne se prouve des deux côtés.
 *
 * ⚠️ OÙ SONT LES « APPRIS ». REQ-GOV-023 les situe dans les entrées de journal (fait / reste /
 * appris). Ce n'est PAS `docs/PLAN-STATE.md`, contrairement à ce que la lettre de l'exigence
 * suggère : ce fichier est DÉRIVÉ (`scripts/plan-state/build.ts` en est le seul écrivain, et il ne
 * rend aucun journal), donc personne ne peut y écrire un « appris » à la main. Le champ existe
 * pourtant depuis le début côté outillage — `scripts/lot/lot.workflow.js:43` le déclare et sa ligne
 * 50 l'EXIGE de chaque rendu de développeur — mais RIEN ne le persistait :
 * `scripts/lot/cloture.ts:34` ne retient du rendu que la tâche, la branche, la PR, l'arrêt et la
 * fusion. Les leçons du lot `L-1-01` n'ont survécu que parce qu'un humain les a recopiées dans
 * `docs/lots/REPRISE-NOTES.md` — un fichier que git ne suit même pas.
 *
 * DEUX SOURCES, ET C'EST DÉLIBÉRÉ.
 *   1. `docs/journal/*.md` — le journal de session par PR livré par **GOV-008** (même lot). Chaque
 *      entrée `## PR #<n> — …` porte un bloc `**Appris.**`. Un « appris » est CONSOLIDÉ quand
 *      `docs/LECONS.md` cite le numéro de sa PR ; sinon il attend. C'est la source que l'exigence
 *      décrit, et elle est lue dès qu'elle existe.
 *   2. La section « À consolider » de `docs/LECONS.md`, entre `<!-- a-consolider:debut -->` et
 *      `<!-- a-consolider:fin -->` — la boîte aux lettres qu'un agent remplit quand son « appris »
 *      ne tient pas dans une entrée de PR (une leçon d'outillage, un piège de poste).
 *
 * LA PREMIÈRE SOURCE EST OPTIONNELLE, ET SON ABSENCE EST DITE. Si `docs/journal/` n'existe pas —
 * GOV-008 n'a pas encore atterri — la garde ne rougit pas pour autant : elle IMPRIME le nombre
 * d'entrées lues. Un zéro se voit ; un silence, non. Coupler dur à un fichier qu'une autre tâche
 * est en train d'écrire aurait produit un rouge qui ne parle de rien.
 *
 * LES DOUZE FAMILLES
 *   `fichier_absent`                  le journal n'existe pas ; il ne peut rien porter
 *   `journal_vide`                    aucune leçon : un journal sans leçon est une fiction
 *   `date_absente`                    aucune date lisible par une machine
 *   `date_non_iso`                    la date n'est pas `AAAA-MM-JJ`, ou n'existe pas au calendrier
 *   `date_future`                     consolidée après aujourd'hui : une vérification pas encore faite
 *   `consolidation_perimee`           > 7 jours ET des « appris » en attente — l'exigence, mot pour mot
 *   `section_a_consolider_absente`    la source des « appris » n'est pas délimitée
 *   `entree_a_consolider_sans_origine` un « appris » qui ne dit pas d'où il vient ne se rejoue pas
 *   `lecon_sans_source`               une leçon sans SHA, sans chemin:ligne et sans verbatim
 *   `lecon_sans_regle_maison`         une leçon qui ne dit pas la RM qu'elle a produite, ni qu'elle n'en a produit aucune
 *   `rm_inexistante`                  une leçon renvoie à une RM que `docs/REGLES-MAISON.md` ne porte pas
 *   `numero_non_consecutif`           les `LEC-nn` sautent, se répètent, ou ne partent pas de 01
 *
 * ELLE NE LIT JAMAIS L'HORLOGE. `--now` est FOURNI, comme pour `lot:composer` : une garde qui lit
 * l'heure ne se rejoue pas, et un rouge qu'on ne peut pas reproduire n'est pas un constat.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHEMIN_LECONS = 'docs/LECONS.md';
const CHEMIN_REGLES = 'docs/REGLES-MAISON.md';
const DOSSIER_JOURNAL = 'docs/journal';

/** Le délai de REQ-GOV-023, en jours. « plus de 7 jours » : 7 pile est encore frais. */
const JOURS_AVANT_PEREMPTION = 7;

const DEBUT = '<!-- a-consolider:debut -->';
const FIN = '<!-- a-consolider:fin -->';

/** Un « appris » du journal de session : la PR qui le porte, et son premier mot. */
export type ApprisJournal = { pr: number; extrait: string };

type Corpus = {
  /** Le texte de `docs/LECONS.md`, ou `null` s'il est absent. */
  texte: string | null;
  /** Les RM que `docs/REGLES-MAISON.md` porte réellement — dérivées, jamais listées ici (RM-01). */
  rmConnues: string[];
  /** L'horodatage de référence, fourni par l'appelant. */
  now: string;
  /** Les « appris » lus dans `docs/journal/` (GOV-008). Vide si le journal n'existe pas encore. */
  journal: ApprisJournal[];
};

type Faute = { famille: string; message: string };

export const FAMILLES = [
  'fichier_absent',
  'journal_vide',
  'date_absente',
  'date_non_iso',
  'date_future',
  'consolidation_perimee',
  'section_a_consolider_absente',
  'entree_a_consolider_sans_origine',
  'lecon_sans_source',
  'lecon_sans_regle_maison',
  'rm_inexistante',
  'numero_non_consecutif',
];

// ── lecture du document ──────────────────────────────────────────────────────

/** Une date `AAAA-MM-JJ` qui existe au calendrier. `2026-02-30` n'en est pas une. */
function estDateReelle(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

function jours(depuis: string, jusqua: string): number {
  return Math.round((Date.parse(jusqua) - Date.parse(depuis)) / 86_400_000);
}

/** Les entrées « appris » en attente : les puces de la section délimitée, et elles seules. */
export function aConsolider(texte: string): string[] {
  const i = texte.indexOf(DEBUT);
  const f = texte.indexOf(FIN);
  if (i < 0 || f < 0 || f < i) return [];
  return texte
    .slice(i + DEBUT.length, f)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*] /.test(l));
}

/**
 * Les « appris » du journal de session (`docs/journal/*.md`, GOV-008). Une entrée est
 * `## PR #<n> — <date> — <titre>` et porte un bloc `**Appris.**`. Une entrée SANS bloc « appris »
 * n'est pas une dette : c'est une PR dont on n'a rien appris, ce qui arrive et se dit.
 */
export function apprisDuJournal(dossier = DOSSIER_JOURNAL): ApprisJournal[] {
  if (!existsSync(dossier)) return [];
  const out: ApprisJournal[] = [];
  for (const f of readdirSync(dossier).filter((n) => n.endsWith('.md') && n !== 'README.md').sort()) {
    const texte = readFileSync(join(dossier, f), 'utf8');
    for (const entree of texte.split(/^## (?=PR #\d+)/m).slice(1)) {
      const pr = Number(/^PR #(\d+)/.exec(entree)![1]);
      const bloc = /^\*\*Appris\.\*\*([\s\S]*?)(?=\n\n|\n## |$)/m.exec(entree)?.[1] ?? '';
      const extrait = bloc.replace(/\s+/g, ' ').trim();
      if (extrait.length > 0) out.push({ pr, extrait });
    }
  }
  return out;
}

/** Un bloc de leçon : `### LEC-nn — titre`, jusqu'au titre suivant de même niveau ou plus haut. */
function lecons(texte: string): { id: string; numero: number; corps: string }[] {
  return texte
    .split(/^### (?=LEC-\d{2} — )/m)
    .slice(1)
    .map((bloc) => {
      const corps = bloc.split(/^## /m)[0]!;
      const id = /^(LEC-(\d{2}))/.exec(corps)!;
      return { id: id[1]!, numero: Number(id[2]), corps };
    });
}

/**
 * Ce qui compte comme une PREUVE. Un SHA, un `chemin:ligne`, ou un message d'erreur verbatim entre
 * guillemets français. Une phrase qui « se souvient » n'en est pas une : c'est la différence entre
 * une leçon et un conseil.
 */
function porteUnePreuve(ligne: string): boolean {
  return /`[0-9a-f]{7,40}`/.test(ligne) || /`[^`]+:\d+`/.test(ligne) || /«[^»]{10,}»/.test(ligne);
}

/**
 * Ce qui compte comme une ORIGINE pour un « appris » en attente : l'identifiant de la tâche, le
 * numéro de la PR, ou l'identifiant du lot. Sans origine, personne ne sait à qui demander le
 * détail, et l'entrée finit consolidée en devinette.
 */
function porteUneOrigine(ligne: string): boolean {
  return /\b[A-Z]{2,4}-[A-Z0-9]{1,4}[0-9a-zA-Z-]*\b/.test(ligne) || /#\d+/.test(ligne) || /\bL-\d+-\d+\b/.test(ligne);
}

// ── les contrôles ────────────────────────────────────────────────────────────

export function controler(c: Corpus): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  if (c.texte === null) {
    ajouter(
      'fichier_absent',
      `${CHEMIN_LECONS} est absent. REQ-GOV-023 en fait le journal des leçons du projet, et ` +
        `docs/CHARTE-AGENTS.md §7 le réserve au documentaliste. Sans lui, les « appris » rendus par ` +
        `les agents ne survivent à aucune session.`
    );
    return fautes;
  }
  const texte = c.texte;

  // ---- la date de consolidation ---------------------------------------------
  const brut = /<!--\s*consolidation:([^>]*?)-->/.exec(texte);
  let date: string | null = null;
  if (!brut) {
    ajouter(
      'date_absente',
      `${CHEMIN_LECONS} ne porte aucune date de consolidation lisible par une machine. La forme ` +
        `attendue est \`<!-- consolidation: AAAA-MM-JJ -->\` : une date écrite en prose ne se relit ` +
        `pas en nightly, et une gate qui doit deviner ne garde rien.`
    );
  } else {
    const valeur = brut[1]!.trim();
    if (!estDateReelle(valeur)) {
      ajouter(
        'date_non_iso',
        `La date de consolidation vaut « ${valeur} » : attendu \`AAAA-MM-JJ\`, et une date qui ` +
          `existe au calendrier. Une date qu'on ne sait pas soustraire ne mesure aucune fraîcheur.`
      );
    } else {
      date = valeur;
      if (jours(date, c.now) < 0) {
        ajouter(
          'date_future',
          `La consolidation est datée du ${date}, postérieure à ${c.now}. Une vérification qui n'a ` +
            `pas encore eu lieu ne se date pas : la date fait partie de l'affirmation.`
        );
      }
    }
  }

  // ---- la source des « appris » ---------------------------------------------
  const nDebut = texte.split(DEBUT).length - 1;
  const nFin = texte.split(FIN).length - 1;
  if (nDebut !== 1 || nFin !== 1 || texte.indexOf(FIN) < texte.indexOf(DEBUT)) {
    ajouter(
      'section_a_consolider_absente',
      `La section des « appris » en attente n'est pas délimitée exactement une fois par ` +
        `\`${DEBUT}\` puis \`${FIN}\` (trouvé ${nDebut} / ${nFin}). C'est la source que cette garde ` +
        `lit : sans elle, la péremption n'a rien à mesurer et passerait au vert en silence.`
    );
  }
  const bulletins = aConsolider(texte);
  // Un « appris » du journal est CONSOLIDÉ quand ce fichier cite le numéro de sa PR. On ne demande
  // pas une leçon par PR : plusieurs « appris » se fondent souvent en une seule leçon, et exiger la
  // bijection ferait rougir un travail de synthèse bien fait.
  const prCitees = new Set([...texte.matchAll(/#(\d+)/g)].map((m) => Number(m[1])));
  const journalEnAttente = c.journal.filter((a) => !prCitees.has(a.pr));
  const attente = [
    ...bulletins,
    ...journalEnAttente.map((a) => `PR #${a.pr} (journal de session) — ${a.extrait.slice(0, 90)}`),
  ];

  for (const e of bulletins) {
    if (!porteUneOrigine(e)) {
      ajouter(
        'entree_a_consolider_sans_origine',
        `L'entrée « ${e.slice(0, 80)} » ne cite ni tâche, ni PR, ni lot. Un « appris » sans origine ` +
          `ne se rejoue pas : personne ne sait à qui en demander le détail, et il finit consolidé de mémoire.`
      );
    }
  }

  if (date !== null && attente.length > 0) {
    const age = jours(date, c.now);
    if (age > JOURS_AVANT_PEREMPTION) {
      ajouter(
        'consolidation_perimee',
        `Dernière consolidation le ${date}, soit ${age} jours avant ${c.now}, alors que ` +
          `${attente.length} entrée(s) « appris » attendent — ${bulletins.length} dans la section ` +
          `« À consolider » de ${CHEMIN_LECONS}, ${journalEnAttente.length} dans le journal de ` +
          `session (une PR dont ce fichier ne cite pas le numéro). REQ-GOV-023 : au-delà ` +
          `de ${JOURS_AVANT_PEREMPTION} jours avec des entrées non consolidées, c'est rouge. À consolider : ` +
          attente.map((e) => `\n      • ${e.slice(0, 100)}`).join('')
      );
    }
  }

  // ---- les leçons -----------------------------------------------------------
  const liste = lecons(texte);
  if (liste.length === 0) {
    ajouter(
      'journal_vide',
      `${CHEMIN_LECONS} ne porte aucune leçon \`### LEC-nn — …\`. Un journal des leçons sans leçon ` +
        `est une fiction, exactement comme un runbook jamais joué.`
    );
  }

  liste.forEach((l, i) => {
    if (l.numero !== i + 1) {
      ajouter(
        'numero_non_consecutif',
        `Les identifiants de leçon sautent ou se répètent : attendu LEC-${String(i + 1).padStart(2, '0')}, ` +
          `trouvé ${l.id}. Une leçon ne se supprime pas — elle se corrige, et son numéro reste ce qu'on cite.`
      );
    }

    const preuve = /^- \*\*Où c'est prouvé\.\*\*(.+)$/m.exec(l.corps)?.[1] ?? '';
    if (!preuve.trim() || !porteUnePreuve(preuve)) {
      ajouter(
        'lecon_sans_source',
        `${l.id} — la rubrique « Où c'est prouvé » est absente ou ne cite rien de vérifiable. ` +
          `Il faut un SHA entre accents graves, un \`chemin:ligne\`, ou un message verbatim entre ` +
          `guillemets français. Une leçon sans son incident est un conseil.`
      );
    }

    const rm = /^- \*\*Règle maison\.\*\*(.+)$/m.exec(l.corps)?.[1] ?? '';
    const citees = [...rm.matchAll(/RM-\d{2}/g)].map((m) => m[0]);
    if (!rm.trim() || (citees.length === 0 && !/aucune/i.test(rm))) {
      ajouter(
        'lecon_sans_regle_maison',
        `${l.id} — la rubrique « Règle maison » est absente ou ne tranche pas. Elle cite la ou les ` +
          `\`RM-nn\` que la leçon a produites, ou dit explicitement qu'elle n'en a produit aucune : ` +
          `une leçon dont on ignore si elle a fait règle se réapprend.`
      );
    }
    for (const cite of citees) {
      if (!c.rmConnues.includes(cite)) {
        ajouter(
          'rm_inexistante',
          `${l.id} renvoie à ${cite}, que ${CHEMIN_REGLES} ne porte pas (il porte ` +
            `${c.rmConnues.join(', ') || 'aucune règle'}). Une règle citée sans exister se recode de mémoire.`
        );
      }
    }
  });

  return fautes;
}

// ── lecture du dépôt ─────────────────────────────────────────────────────────

/** Les RM sont DÉRIVÉES du document, jamais listées ici : deux listes divergent toujours (RM-01). */
export function rmConnues(chemin = CHEMIN_REGLES): string[] {
  if (!existsSync(chemin)) return [];
  return [...readFileSync(chemin, 'utf8').matchAll(/^## (RM-\d{2}) — /gm)].map((m) => m[1]!);
}

function argument(nom: string): string | null {
  const i = process.argv.indexOf(`--${nom}`);
  const suivant = i >= 0 ? process.argv[i + 1] : undefined;
  return suivant && !suivant.startsWith('--') ? suivant : null;
}

// ── mode --prove ─────────────────────────────────────────────────────────────

type Options = {
  date?: string;
  lecons?: string[];
  attente?: string[];
  sections?: boolean;
  journal?: ApprisJournal[];
  /** Les PR que le journal témoin déclare consolidées, citées dans le corps du document. */
  citations?: number[];
};

/** Un journal témoin, valide par construction. Chaque défaut ci-dessous en part. */
function journalTemoin(o: Options = {}): string {
  const lignes = [
    '# Leçons — témoin',
    '',
    `<!-- consolidation: ${o.date ?? '2026-09-03'} -->`,
    '',
    '## Leçons consolidées',
    '',
  ];
  if (o.citations) lignes.push(`> Consolide : ${o.citations.map((n) => `#${n}`).join(', ')}.`, '');
  const corps = o.lecons ?? ['LEC-01', 'LEC-02'];
  for (const id of corps) {
    lignes.push(
      `### ${id} — Un témoin`,
      '',
      "- **Ce qui s'est passé.** Une phrase.",
      "- **Ce qu'on en tire.** Une phrase.",
      "- **Où c'est prouvé.** `ff3ef54` — `docs/lots/REPRISE-NOTES.md:30`.",
      '- **Règle maison.** RM-01.',
      ''
    );
  }
  lignes.push('## À consolider', '');
  if (o.sections !== false) lignes.push(DEBUT);
  lignes.push(...(o.attente ?? ['_(rien à consolider)_']));
  if (o.sections !== false) lignes.push(FIN);
  lignes.push('');
  return lignes.join('\n');
}

const RM_TEMOIN = ['RM-01', 'RM-02'];

function corpusValide(o: Options = {}): Corpus {
  return { texte: journalTemoin(o), rmConnues: RM_TEMOIN, now: '2026-09-03', journal: o.journal ?? [] };
}

/** Un « appris » de journal, tel que GOV-008 l'écrit. */
const APPRIS = (pr: number): ApprisJournal => ({ pr, extrait: 'Un fait appris sur cette PR.' });

if (process.argv.includes('--prove')) {
  const base = controler(corpusValide());
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un journal DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const remplacer = (quoi: string, par: string, o: Options = {}): Corpus => ({
    ...corpusValide(o),
    texte: journalTemoin(o).replace(quoi, par),
  });

  const TEMOINS: { famille: string; defaut: () => Corpus }[] = [
    { famille: 'fichier_absent', defaut: () => ({ ...corpusValide(), texte: null }) },
    {
      famille: 'journal_vide',
      defaut: () => ({ ...corpusValide(), texte: journalTemoin().replace(/### LEC-\d{2} — [\s\S]*?(?=## À consolider)/g, '') }),
    },
    { famille: 'date_absente', defaut: () => remplacer('<!-- consolidation: 2026-09-03 -->', 'Consolidé le 3 septembre.') },
    { famille: 'date_non_iso', defaut: () => corpusValide({ date: '03/09/2026' }) },
    { famille: 'date_future', defaut: () => corpusValide({ date: '2026-10-01' }) },
    {
      famille: 'consolidation_perimee',
      defaut: () => ({ ...corpusValide({ attente: ['- GOV-018 — un appris qui attend.'] }), now: '2026-09-11' }),
    },
    {
      // La MÊME famille par l'AUTRE source : un « appris » du journal de session que le fichier ne
      // cite pas. Sans ce second témoin, le branchement sur `docs/journal/` serait décoratif.
      famille: 'consolidation_perimee',
      defaut: () => ({ ...corpusValide({ journal: [APPRIS(26)] }), now: '2026-09-11' }),
    },
    { famille: 'section_a_consolider_absente', defaut: () => corpusValide({ sections: false }) },
    { famille: 'entree_a_consolider_sans_origine', defaut: () => corpusValide({ attente: ['- on a appris quelque chose.'] }) },
    {
      famille: 'lecon_sans_source',
      defaut: () => remplacer("- **Où c'est prouvé.** `ff3ef54` — `docs/lots/REPRISE-NOTES.md:30`.", "- **Où c'est prouvé.** de mémoire."),
    },
    { famille: 'lecon_sans_regle_maison', defaut: () => remplacer('- **Règle maison.** RM-01.', '- **Règle maison.**') },
    { famille: 'rm_inexistante', defaut: () => remplacer('- **Règle maison.** RM-01.', '- **Règle maison.** RM-42.') },
    { famille: 'numero_non_consecutif', defaut: () => corpusValide({ lecons: ['LEC-01', 'LEC-03'] }) },
  ];

  /**
   * Les contre-témoins sont la moitié de la preuve. Sans le premier, cette garde mesurerait l'ÂGE
   * du fichier et non la dette de consolidation, et rougirait chaque lundi sur un journal parfait.
   */
  const CONTRE_TEMOINS: { quoi: string; corpus: () => Corpus }[] = [
    {
      quoi: 'une consolidation très ancienne SANS aucun « appris » en attente',
      corpus: () => ({ ...corpusValide(), now: '2026-12-31' }),
    },
    {
      quoi: 'sept jours PILE avec des « appris » en attente (la borne)',
      corpus: () => ({ ...corpusValide({ attente: ['- GOV-018 — un appris qui attend.'] }), now: '2026-09-10' }),
    },
    {
      quoi: 'une leçon qui n’a produit AUCUNE règle maison et le dit',
      corpus: () => ({ ...corpusValide(), texte: journalTemoin().replace(/- \*\*Règle maison\.\*\* RM-01\./g, '- **Règle maison.** aucune à ce jour — elle attend un second cas.') }),
    },
    {
      quoi: 'une preuve qui est un message verbatim, sans SHA ni chemin',
      corpus: () => ({
        ...corpusValide(),
        texte: journalTemoin().replace(
          /- \*\*Où c'est prouvé\.\*\*.*/g,
          "- **Où c'est prouvé.** « error TS2688: Cannot find type definition file for 'node'. »"
        ),
      }),
    },
    {
      quoi: 'un « appris » qui cite une PR au lieu d’une tâche',
      corpus: () => corpusValide({ attente: ['- #27 — la lentille sécurité a refusé une allow-list élargie.'] }),
    },
    {
      quoi: 'un « appris » qui cite un lot',
      corpus: () => corpusValide({ attente: ['- lot L-1-01 — trois lentilles ont trouvé le même fichier partagé.'] }),
    },
    {
      quoi: 'un « appris » du journal DÉJÀ consolidé (sa PR est citée), même très en retard',
      corpus: () => ({ ...corpusValide({ journal: [APPRIS(26)], citations: [26] }), now: '2026-12-31' }),
    },
    {
      quoi: 'DEUX « appris » du journal fondus dans UNE seule leçon (aucune bijection exigée)',
      corpus: () => ({ ...corpusValide({ journal: [APPRIS(26), APPRIS(27)], citations: [26, 27] }), now: '2026-12-31' }),
    },
    {
      quoi: "l'absence totale de journal (GOV-008 pas encore atterri) ne rougit pas",
      corpus: () => ({ ...corpusValide({ journal: [] }), now: '2026-12-31' }),
    },
  ];

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut());
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      process.exit(1);
    }
    prouvees.add(t.famille);
  }
  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.corpus());
    if (f.length > 0) {
      console.error(`❌ Faux positif : ${c.quoi} a rougi. La garde est trop large.\n   [${f[0]!.famille}] ${f[0]!.message}`);
      process.exit(1);
    }
  }

  console.log(
    `✅ gov:lecons — les ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
      `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

const now = argument('now');
if (!now || !estDateReelle(now)) {
  console.error(
    `❌ gov:lecons — \`--now <AAAA-MM-JJ>\` est OBLIGATOIRE${now ? ` (reçu « ${now} »)` : ''}.\n` +
      `   Cette garde ne lit pas l'horloge : c'est la convention de tout l'outillage d'ici ` +
      `(\`lot:composer --now\`). Un rouge qui dépend de l'heure à laquelle on l'a lancé ne se rejoue pas,\n` +
      `   et un rouge qu'on ne peut pas rejouer n'est pas un constat.\n` +
      `   En nightly : \`pnpm gov:lecons --now $(date -u +%F)\`.`
  );
  process.exit(2);
}

const chemin = argument('fichier') ?? CHEMIN_LECONS;
const dossierJournal = argument('journal') ?? DOSSIER_JOURNAL;
const journal = apprisDuJournal(dossierJournal);
const corpus: Corpus = {
  texte: existsSync(chemin) ? readFileSync(chemin, 'utf8') : null,
  rmConnues: rmConnues(argument('regles') ?? CHEMIN_REGLES),
  now,
  journal,
};
const fautes = controler(corpus);

// La source des « appris » se DIT, verte ou rouge. Un zéro se voit ; un silence, non — et c'est
// ainsi qu'une garde branchée sur une source disparue continue de passer au vert pour rien.
const etatJournal = existsSync(dossierJournal)
  ? `${journal.length} « appris » lus dans ${dossierJournal}/`
  : `${dossierJournal}/ absent — la source de REQ-GOV-023 n'est pas encore posée (GOV-008)`;

if (fautes.length === 0) {
  const texte = corpus.texte ?? '';
  const citees = new Set([...texte.matchAll(/#(\d+)/g)].map((m) => Number(m[1])));
  const attente = [
    ...aConsolider(texte),
    ...journal.filter((a) => !citees.has(a.pr)).map((a) => `PR #${a.pr} — ${a.extrait.slice(0, 90)}`),
  ];
  const date = /<!--\s*consolidation:\s*(\d{4}-\d{2}-\d{2})\s*-->/.exec(texte)?.[1] ?? '?';
  const nb = (texte.match(/^### LEC-\d{2} — /gm) ?? []).length;
  console.log(
    `✅ gov:lecons — ${chemin} : ${nb} leçon(s) sourcée(s), consolidées le ${date} ` +
      `(${jours(date, now)} j avant ${now}), ${attente.length} « appris » en attente.`
  );
  console.log(`   ${etatJournal}.`);
  if (attente.length > 0) {
    console.log(
      `   ⏳ à consolider avant le ${new Date(Date.parse(date) + JOURS_AVANT_PEREMPTION * 86_400_000)
        .toISOString()
        .slice(0, 10)} :`
    );
    attente.slice(0, 10).forEach((e) => console.log(`      ${e}`));
  }
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:lecons — ${fautes.length} faute(s) dans ${chemin} (REQ-GOV-023) — ${etatJournal} :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
