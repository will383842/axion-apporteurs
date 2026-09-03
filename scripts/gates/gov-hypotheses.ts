/**
 * gov-hypotheses.ts — la garde du registre des décisions (GOV-005, REQ-GOV-015).
 *
 * USAGE : pnpm gov:hypotheses                    (structure et portage du registre)
 *         pnpm gov:hypotheses --avant-docuseal   (AJOUTE le contrôle bloquant du premier envoi)
 *         pnpm gov:hypotheses --prove            (un témoin par famille, chacun vu rougir)
 *
 * DEUX NIVEAUX, ET POURQUOI.
 *   Le contrôle courant vérifie que le registre est bien formé et que rien d'irréversible n'avance
 *   sans porteur. Il tourne à chaque PR.
 *   Le contrôle `--avant-docuseal` exige en plus que **toute ligne `avenant` porte une date
 *   d'arbitrage**. Il ne tourne PAS à chaque PR, et c'est délibéré : huit lignes `avenant` attendent
 *   aujourd'hui une décision de Will, ce qui est l'état normal du projet. Les armer maintenant
 *   rendrait la CI rouge en permanence — et une CI toujours rouge ne garde plus rien. Ce contrôle est
 *   le verrou du **premier envoi DocuSeal** : une fois le contrat parti à un apporteur, chaque
 *   changement d'une clause `avenant` impose une campagne de re-signature à tout le réseau.
 *
 * CE QUE LA GARDE TIENT
 *   — la forme des trois tableaux (alias, décisions bloquantes, hypothèses par défaut) ;
 *   — la résolution des alias de la §0, et l'absence d'alias pointant vers un alias ;
 *   — la réciproque de `gov:tasks` : toute décision citée par une tâche est déclarée ici ;
 *   — le PORTAGE des décisions irréversibles : une décision `avenant` ou `migration` non tranchée
 *     doit être citée par au moins une tâche. Sinon rien dans le backlog n'est bloqué par elle,
 *     le motif d'arrêt `decision_sans_hypothese` n'a rien à nommer, et l'arbitrage ne sera jamais
 *     demandé. Une décision `paramètre` n'est PAS soumise à cette règle : son défaut suffit à
 *     avancer, c'est exactement ce que « paramètre » veut dire.
 */

import { readFileSync, existsSync } from 'node:fs';

const CHEMIN_DECISIONS = 'docs/DECISIONS.md';
const CHEMIN_TACHES = 'docs/tasks.json';

/** Nombre de colonnes attendu par section. Une ligne qui n'y répond pas n'est pas lisible. */
const COLONNES: Record<number, number> = { 0: 3, 1: 5, 2: 7 };
const REVERSIBILITES = ['paramètre', 'migration', 'avenant', '—'];
const VIDE = ['—', '-', ''];

type Ligne = {
  numero: number;
  section: number;
  id: string;
  cellules: string[];
  tranchee: boolean;
  reversibilite: string;
};
type Faute = { famille: string; message: string };

function nettoyer(s: string): string {
  return s.replace(/[*`]/g, '').trim();
}

/** Lit les lignes de tableau qui commencent par un identifiant de décision. */
function lire(texte: string): { lignes: Ligne[]; alias: Map<string, string> } {
  const lignes: Ligne[] = [];
  const alias = new Map<string, string>();
  let section = -1;

  texte.split('\n').forEach((l, i) => {
    const ms = /^##\s+(\d)\./.exec(l);
    if (ms) {
      section = Number(ms[1]);
      return;
    }
    if (!l.trimStart().startsWith('|')) return;
    // ligne de séparation « | --- | --- | »
    if (/^[|\s:-]+$/.test(l)) return;

    const cellules = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const premiere = nettoyer(cellules[0] ?? '');
    const mi = /^((?:HYP|DEC|W|EXT)-?[A-Z0-9][A-Za-z0-9-]*)/.exec(premiere);
    if (!mi || !mi[1] || premiere.startsWith('Id')) return;

    if (section === 0) {
      alias.set(mi[1], nettoyer(cellules[1] ?? ''));
    }
    const derniere = nettoyer(cellules[6] ?? '');
    lignes.push({
      numero: i + 1,
      section,
      id: mi[1],
      cellules,
      tranchee: (cellules[0] ?? '').includes('✅') || (cellules.length === 7 && !VIDE.includes(derniere)),
      reversibilite: cellules.length === 7 ? nettoyer(cellules[3] ?? '') : '—',
    });
  });

  return { lignes, alias };
}

function controler(texte: string, hypDuBacklog: Map<string, string[]>, avantDocuseal: boolean): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  const { lignes, alias } = lire(texte);
  const declarees = new Map<string, Ligne>();

  for (const l of lignes) {
    const attendu = COLONNES[l.section];
    if (attendu !== undefined && l.cellules.length !== attendu) {
      ajouter(
        'tableau_malforme',
        `${CHEMIN_DECISIONS}:${l.numero} — ${l.id} porte ${l.cellules.length} colonnes, la section ${l.section} en attend ${attendu}.`
      );
    }
    if (l.section === 0) continue;

    if (declarees.has(l.id)) {
      ajouter('identifiant_double', `${l.id} est déclarée deux fois (lignes ${declarees.get(l.id)!.numero} et ${l.numero}).`);
    }
    declarees.set(l.id, l);

    // La décision et son hypothèse/justification doivent être écrites.
    for (const [rang, quoi] of [[1, 'la décision'], [2, "l'hypothèse ou la justification"]] as const) {
      if (VIDE.includes(nettoyer(l.cellules[rang] ?? ''))) {
        ajouter('cellule_vide', `${l.id} n'écrit pas ${quoi} : la ligne ne décide rien.`);
      }
    }

    if (l.section === 2) {
      if (!REVERSIBILITES.includes(l.reversibilite)) {
        ajouter(
          'reversibilite_inconnue',
          `${l.id} porte une réversibilité « ${l.reversibilite} » : attendu ${REVERSIBILITES.join(', ')}.`
        );
      }
      if (l.reversibilite === 'avenant' && !(l.cellules[5] ?? '').includes('DocuSeal')) {
        ajouter(
          'avenant_sans_jalon',
          `${l.id} est « avenant » sans porter « premier DocuSeal » dans « À trancher avant » : ` +
            `son arbitrage ne serait réclamé par rien.`
        );
      }
    }
  }

  // ⚠️ L'ORDRE DE CES DEUX TESTS EST L'INVARIANT. Écrit dans l'autre sens — « pas déclarée »
  // d'abord — le second était INATTEIGNABLE : un alias n'apparaît jamais parmi les décisions
  // déclarées, donc un alias pointant vers un alias tombait toujours dans la première branche et
  // `alias_vers_alias` était du code mort. C'est le témoin qui l'a montré, pas la relecture.
  for (const [a, canonique] of alias) {
    if (alias.has(canonique)) {
      ajouter('alias_vers_alias', `L'alias ${a} renvoie à ${canonique}, qui est elle-même un alias : la résolution boucle.`);
    } else if (!declarees.has(canonique)) {
      ajouter('alias_sans_canonique', `L'alias ${a} renvoie à ${canonique || '(rien)'}, qui n'est déclarée nulle part.`);
    }
  }

  /** Une décision est portée si elle, ou l'un de ses alias, est citée par une tâche. */
  const aliasDe = new Map<string, string[]>();
  for (const [a, c] of alias) aliasDe.set(c, [...(aliasDe.get(c) ?? []), a]);
  const portee = (id: string): boolean =>
    hypDuBacklog.has(id) || (aliasDe.get(id) ?? []).some((a) => hypDuBacklog.has(a));

  for (const id of hypDuBacklog.keys()) {
    if (!declarees.has(id) && !alias.has(id)) {
      ajouter(
        'hyp_du_backlog_non_declaree',
        `${hypDuBacklog.get(id)!.join(', ')} repose sur ${id}, absente du registre — la ligne a-t-elle été supprimée ?`
      );
    }
  }

  for (const l of declarees.values()) {
    if (l.tranchee) continue;
    if (l.reversibilite !== 'avenant' && l.reversibilite !== 'migration') continue;
    if (!portee(l.id)) {
      ajouter(
        'decision_irreversible_sans_porteur',
        `${l.id} est « ${l.reversibilite} », non tranchée, et aucune tâche ne la cite : rien n'est bloqué ` +
          `par elle, et son arbitrage ne sera jamais réclamé.`
      );
    }
    if (avantDocuseal && l.reversibilite === 'avenant') {
      ajouter(
        'avenant_non_tranchee',
        `${l.id} est « avenant » et sans date d'arbitrage. Une fois le contrat envoyé, la changer ` +
          `impose une campagne de re-signature à tout le réseau.`
      );
    }
  }

  return fautes;
}

const FAMILLES = [
  'tableau_malforme', 'identifiant_double', 'cellule_vide', 'reversibilite_inconnue',
  'avenant_sans_jalon', 'alias_sans_canonique', 'alias_vers_alias',
  'hyp_du_backlog_non_declaree', 'decision_irreversible_sans_porteur', 'avenant_non_tranchee',
];

for (const f of [CHEMIN_DECISIONS, CHEMIN_TACHES]) {
  if (!existsSync(f)) {
    console.error(`❌ gov:hypotheses — ${f} est introuvable.`);
    process.exit(1);
  }
}
const texte = readFileSync(CHEMIN_DECISIONS, 'utf8');
const taches = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: { id: string; hyp: string[] }[] }).taches;
const hypDuBacklog = new Map<string, string[]>();
for (const t of taches) for (const h of t.hyp) hypDuBacklog.set(h, [...(hypDuBacklog.get(h) ?? []), t.id]);

const avantDocuseal = process.argv.includes('--avant-docuseal');

// ── mode --prove ─────────────────────────────────────────────────────────────
if (process.argv.includes('--prove')) {
  const base = controler(texte, hypDuBacklog, false);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un registre DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 6).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  /**
   * Les témoins portent sur une FIXTURE, pas sur le registre réel.
   * Première tentative : muter `docs/DECISIONS.md` par expression régulière. Aucun témoin n'a
   * déclenché — les substitutions ne s'appliquaient pas, et la preuve échouait sans dire pourquoi.
   * Une fixture minimale a la même forme, tient dans l'écran, et ne bouge pas quand le registre
   * change. Elle porte exactement un cas de chaque situation que la garde doit distinguer.
   */
  const FIXTURE = [
    '## 0. Identifiants d’origine → identifiant canonique',
    '',
    '| Identifiant cité | Canonique | Où |',
    '| --- | --- | --- |',
    '| `W2` | `HYP-BANQUE` | §2 |',
    '',
    '## 1. Sans valeur par défaut possible — bloquent le code',
    '',
    '| Id | Décision | Pourquoi aucune hypothèse | Phase bloquée | Propriétaire |',
    '| --- | --- | --- | --- | --- |',
    '| **W1** ✅ *tranchée 2026-09-03* | Entité qui signe | AXION IA SAS | — | −1 |',
    '',
    '## 2. Hypothèses par défaut — le code avance',
    '',
    '| Id | Décision | Hypothèse appliquée | Réversibilité | Phase | À trancher avant | Tranchée |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| HYP-BANQUE | Banque réceptrice | Générateur générique | paramètre | 2 | armement SEPA | — |',
    '| HYP-CLAUSE | Départ des 12 mois | fin = confirmée + 12 mois | avenant | 1 | **premier DocuSeal** | — |',
    '| HYP-MIGR | Multi-tenant | mono-tenant | migration | −1 | — | — |',
  ].join('\n');

  // Le backlog de la fixture : les deux décisions irréversibles sont portées, la `paramètre` non.
  const HYP_FIXTURE = new Map<string, string[]>([
    ['HYP-CLAUSE', ['T-01']],
    ['HYP-MIGR', ['T-02']],
  ]);

  const propre = controler(FIXTURE, HYP_FIXTURE, false);
  if (propre.length > 0) {
    console.error(`❌ La FIXTURE elle-même est fautive (${propre.length}) — un témoin bâti dessus ne prouverait rien :`);
    propre.forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const sans = (id: string, colonne: number, valeur: string): string =>
    FIXTURE.split('\n')
      .map((l) => {
        if (!l.startsWith('| ' + id + ' |')) return l;
        const c = l.replace(/^\|/, '').replace(/\|$/, '').split('|');
        c[colonne] = ` ${valeur} `;
        return '|' + c.join('|') + '|';
      })
      .join('\n');

  const TEMOINS: { famille: string; texte?: string; hyp?: Map<string, string[]>; flag?: boolean }[] = [
    {
      famille: 'tableau_malforme',
      texte: FIXTURE.replace('| HYP-BANQUE | Banque réceptrice | Générateur générique | paramètre | 2 | armement SEPA | — |',
        '| HYP-BANQUE | Banque réceptrice | Générateur générique | paramètre | 2 | armement SEPA |'),
    },
    {
      famille: 'identifiant_double',
      texte: FIXTURE.replace(/^(\| HYP-BANQUE \|.*)$/m, '$1\n$1'),
    },
    { famille: 'cellule_vide', texte: sans('HYP-BANQUE', 1, '—') },
    { famille: 'reversibilite_inconnue', texte: sans('HYP-BANQUE', 3, 'peut-être') },
    { famille: 'avenant_sans_jalon', texte: sans('HYP-CLAUSE', 5, '—') },
    { famille: 'alias_sans_canonique', texte: FIXTURE.replace('| `W2` | `HYP-BANQUE` |', '| `W2` | `HYP-INEXISTANTE` |') },
    {
      famille: 'alias_vers_alias',
      texte: FIXTURE.replace('| `W2` | `HYP-BANQUE` | §2 |', '| `W2` | `HYP-BANQUE` | §2 |\n| `W5` | `W2` | §0 |'),
    },
    { famille: 'hyp_du_backlog_non_declaree', hyp: new Map([...HYP_FIXTURE, ['HYP-ABSENTE', ['T-03']]]) },
    { famille: 'decision_irreversible_sans_porteur', hyp: new Map([...HYP_FIXTURE].filter(([k]) => k !== 'HYP-CLAUSE')) },
    { famille: 'avenant_non_tranchee', flag: true },
  ];

  // Toutes les mutations portent sur la fixture : les témoins sans `texte` la reprennent telle quelle.
  for (const t of TEMOINS) {
    t.texte = t.texte ?? FIXTURE;
    t.hyp = t.hyp ?? HYP_FIXTURE;
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.texte!, t.hyp!, t.flag ?? false);
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s) : ${[...new Set(f.map((x) => x.famille))].join(', ') || 'aucune'}).`
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
  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
const fautes = controler(texte, hypDuBacklog, avantDocuseal);
const { lignes } = lire(texte);
const hypotheses = lignes.filter((l) => l.section === 2);
const avenants = hypotheses.filter((l) => l.reversibilite === 'avenant');
const enAttente = avenants.filter((l) => !l.tranchee);

if (fautes.length === 0) {
  console.log(
    `✅ gov:hypotheses — ${lignes.filter((l) => l.section !== 0).length} décisions ` +
      `(${lignes.filter((l) => l.section === 1).length} bloquantes, ${hypotheses.length} avec hypothèse), ` +
      `${lignes.filter((l) => l.section === 0).length} alias résolus.`
  );
  if (!avantDocuseal && enAttente.length > 0) {
    console.log(
      `\n   ⚠️  ${enAttente.length} ligne(s) « avenant » attendent un arbitrage. Elles ne bloquent PAS la CI,\n` +
        `   elles bloquent le PREMIER ENVOI DOCUSEAL — après quoi les changer impose une\n` +
        `   campagne de re-signature à tout le réseau. Contrôle bloquant : \`pnpm gov:hypotheses --avant-docuseal\`.\n` +
        `   ${enAttente.map((l) => l.id).join(' · ')}`
    );
  }
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:hypotheses — ${fautes.length} incohérence(s) dans ${CHEMIN_DECISIONS} :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
