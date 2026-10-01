// @req REQ-GOV-021
// @req REQ-GOV-003
/**
 * LES ATTRIBUTIONS SE CONFRONTENT À LEURS SOURCES (GOV-037).
 *
 * Les témoins et les contre-témoins vivent dans la garde (`TEMOINS`, `CONTRE_TEMOINS`), jugés par
 * `prouver()` : le premier test l'appelle pour que `vitest` voie la même preuve que Gate A, sans
 * seconde copie des cas. Le reste exige le dépôt RÉEL, que `--prove` ne lit pas :
 *
 *   — la garde lit ses sources EN ENTIER : chaque registre, chaque fichier suivi de `scripts/` et
 *     `tests/`, chaque entrée du journal, chaque chaîne ET chaque nom de clé de `docs/gates.json`
 *     à toute profondeur ;
 *   — les exemptions « paths gabarit » ont un producteur INDÉPENDANT, recompté ici ;
 *   — toute tâche qui porte un lot est jugée ou exemptée, aucune n'est sautée ;
 *   — elle ne lit QUE des fichiers suivis, et refuse en se NOMMANT une source absente, tronquée,
 *     mal formée, à clé dupliquée, ou qui porte un octet NUL.
 *
 * Ce qu'elle ne voit pas est écrit une seule fois, dans l'en-tête de la garde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fichiersSuivis } from '../../../scripts/lot/fichiers-suivis';
import { LIVREE } from '../../../scripts/lot/avancement';
import { referencePr, DEPOT_LOCAL } from '../../../scripts/lot/attestation';
import {
  analyser,
  ANCRE_JOURNAL,
  entreesDuDossier,
  caractereAdmis,
  chargerSources,
  entreesDeJournal,
  HORS_ASCII_ADMIS,
  prouver,
  rendre,
  SourceIllisible,
  CITATIONS_DECLAREES,
  DETTE_GATE_NON_RECIPROQUE,
  type Sources,
  type Tache,
} from '../../../scripts/gates/gov-attributions';

const lireReel = (chemin: string) => readFileSync(chemin, 'utf8');
const octets = (chemin: string) => readFileSync(chemin);
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sousScriptsOuTests = (f: string) => f.startsWith('scripts/') || f.startsWith('tests/');

/**
 * Le site EXACT d'une exemption de lot (GOV-074) : `lot « L »` sans PR, `lot « L », <référence>` sinon.
 * La référence vient de son unique auteur (`referencePr`) : la mise en forme d'une PR n'est pas ce
 * qui est jugé ici.
 */
function siteDuLot(t: Tache): string {
  const ref = referencePr({
    id: t.id,
    repo: t.repo ?? DEPOT_LOCAL,
    statut: t.statut ?? 'a_faire',
    pr: t.pr ?? null,
    attestation: t.attestation ?? null,
  });
  return ref === null ? `lot « ${t.lot} »` : `lot « ${t.lot} », ${ref}`;
}

/** Un identifiant de la FORME d'une tâche réelle, qui ne résout pas : dérivé, jamais tapé. */
function identifiantInconnu(taches: readonly { id: string }[]): string {
  const ids = new Set(taches.map((t) => t.id));
  let inconnu = (taches.find((t) => /[0-9]/.test(t.id)) as { id: string }).id.replace(
    /[0-9]+/,
    '9'
  );
  while (ids.has(inconnu)) inconnu = inconnu.replace('9', '99');
  return inconnu;
}

/** La position juste après l'accolade ouvrante de la PREMIÈRE entrée du tableau `cle` d'un registre. */
function dansLaPremiereEntree(texte: string, cle: string): number {
  const m = new RegExp(`"${cle}"\\s*:\\s*\\[\\s*\\{`).exec(texte);
  expect(
    m,
    `le tableau « ${cle} » est introuvable : la sonde ne sait plus où écrire`
  ).not.toBeNull();
  return m!.index + m![0].length;
}

/** Le refus que lève `chargerSources`, ou `null`. */
function refusDe(charger: () => unknown): Error | null {
  try {
    charger();
    return null;
  } catch (e) {
    return e as Error;
  }
}

describe('REQ-GOV-021 et REQ-GOV-003 — chaque famille rougit sur son témoin, chaque exemption a son contre-témoin', () => {
  it('`--prove` rend 0 : juges éprouvés, aucune famille sans témoin, aucune nature d’exemption qu’aucun contre-témoin ne rende', () => {
    const p = prouver();
    expect(p.code, p.lignes.join('\n')).toBe(0);
  });
});

describe('REQ-GOV-021 — sur le dépôt réel, la garde lit ses sources EN ENTIER et ne trouve aucune attribution rompue', () => {
  const brut = (chemin: string, cle: string): number =>
    ((JSON.parse(lireReel(chemin)) as Record<string, unknown[]>)[cle] ?? []).length;

  it('chaque registre est lu en entier — ÉGALITÉ avec le fichier relu ici, pas un plancher', () => {
    const s = chargerSources(fichiersSuivis());
    expect(s.taches.length, 'des tâches ont été perdues au chargement').toBe(
      brut('docs/tasks.json', 'taches')
    );
    expect(s.gates.length, 'des gates ont été perdues au chargement').toBe(
      brut('docs/gates.json', 'gates')
    );
    expect(s.postes.length, 'des postes ont été perdus au chargement').toBe(
      brut('docs/agents.json', 'postes')
    );
    expect(
      s.taches.length,
      'le registre des tâches est vide : l’égalité ne prouverait rien'
    ).toBeGreaterThan(0);
  });

  it('les en-têtes : TOUT fichier suivi de scripts/ et tests/, chacun sur ses vingt premières lignes', () => {
    const suivis = fichiersSuivis();
    const s = chargerSources(suivis);
    // L'acceptance dit « tout fichier suivi de scripts/ et tests/ » et « ses vingt premières lignes » :
    // ce sont ses termes, pas une recopie de la garde.
    const attendus = suivis.filter(sousScriptsOuTests);
    expect(
      attendus.length,
      'aucun fichier suivi sous scripts/ ni tests/ : l’égalité ne prouverait rien'
    ).toBeGreaterThan(0);
    expect(s.entetes.map((e) => e.fichier)).toEqual(attendus);
    for (const e of s.entetes) {
      expect(e.lignes, `${e.fichier} n'est pas lu sur ses vingt premières lignes`).toEqual(
        lireReel(e.fichier).split('\n').slice(0, 20)
      );
    }
  });

  it('le journal : chaque entrée de chaque fichier SUIVI, et le plancher lu dans le README', () => {
    const suivis = fichiersSuivis();
    const s = chargerSources(suivis);
    const titres = suivis
      .filter(
        (f) => f.startsWith('docs/journal/') && f.endsWith('.md') && f !== 'docs/journal/README.md'
      )
      .flatMap((f) =>
        (lireReel(f).match(/^## PR #\d+/gm) ?? []).map((t) => t.slice(t.lastIndexOf('#') + 1))
      );
    expect(
      titres.length,
      'aucune entrée de journal : l’égalité ne prouverait rien'
    ).toBeGreaterThan(0);
    expect([...entreesDeJournal(s.journal).keys()].sort()).toEqual([...new Set(titres)].sort());
    const plancher = /\*\*> (\d+)\*\*/.exec(lireReel('docs/journal/README.md'));
    expect(plancher, 'le README du journal ne porte plus son plancher').not.toBeNull();
    expect(s.plancherJournal).toBe(Number(plancher![1]));
  });

  it('REQ-GOV-021 — le dépôt tel qu’il est ne porte aucune attribution rompue', () => {
    const { fautes } = analyser(chargerSources(fichiersSuivis()));
    expect(fautes.map((f) => `[${f.famille}] ${f.message}`)).toEqual([]);
  });

  it('toute tâche qui porte un lot est attestée par le TITRE de l’entrée de sa PR, jeton exact, ou EXEMPTÉE sous son lot — aucune n’est sautée', () => {
    const s = chargerSources(fichiersSuivis());
    const { exemptions } = analyser(s);
    const entrees = entreesDeJournal(s.journal);
    const avecLot = s.taches.filter((t) => t.lot);
    expect(
      avecLot.length,
      'aucune tâche ne porte de lot : rien ne serait confronté'
    ).toBeGreaterThan(0);
    // Le TITRE seul (première ligne de l'entrée), découpé en jetons : ni le corps, ni une sous-chaîne.
    const titreNomme = (pr: number, lot: string) =>
      ((entrees.get(String(pr)) ?? '').split('\n')[0] as string)
        .split(/[^A-Za-z0-9-]+/)
        .includes(lot);
    // GOV-074 — le site d'une exemption de lot se compare par IDENTITÉ, jamais par inclusion.
    const sautees = avecLot
      .filter((t) => !(t.pr != null && titreNomme(t.pr, t.lot as string)))
      .filter((t) => !exemptions.some((e) => e.tache === t.id && e.site === siteDuLot(t)));
    expect(
      sautees.map((t) => `${t.id} (lot ${t.lot}, pr ${t.pr})`),
      'une attribution de lot écrite n’est ni attestée, ni exemptée : elle est tue'
    ).toEqual([]);
  });

  /**
   * LE SECOND PRODUCTEUR DES EXEMPTIONS DE LOT (GOV-074). Seules les exemptions « paths gabarit »
   * avaient un recompte indépendant ; celles de lot — PR absente, autre dépôt, sous le plancher, dette
   * de titre — n'étaient vues que par une INCLUSION du lot dans le site. Elles sont recomptées ici,
   * depuis `docs/tasks.json`, les titres du journal et le plancher relus, et comparées par nature,
   * tâche et site EXACT.
   */
  it('REQ-GOV-021 — les exemptions de LOT ont un PRODUCTEUR INDÉPENDANT : recomptées par nature, tâche et site exact', () => {
    const s = chargerSources(fichiersSuivis());
    const { exemptions } = analyser(s);
    const suivis = fichiersSuivis();
    // Les titres d'entrée, relus ligne à ligne dans chaque fichier suivi du journal.
    const titres = new Map<string, string>();
    for (const f of suivis.filter(
      (x) => x.startsWith('docs/journal/') && x.endsWith('.md') && x !== 'docs/journal/README.md'
    )) {
      for (const l of lireReel(f).split('\n')) {
        const m = /^## PR #(\d+) — /.exec(l);
        if (m) titres.set(m[1] as string, l);
      }
    }
    const plancher = Number(/\*\*> (\d+)\*\*/.exec(lireReel('docs/journal/README.md'))![1]);
    const lots = new Set(s.taches.flatMap((t) => (t.lot ? [t.lot] : [])));
    const lotsDuTitre = (titre: string) => [
      ...new Set(titre.split(/[^A-Za-z0-9-]+/).filter((j) => lots.has(j))),
    ];
    const attendues: string[] = [];
    for (const t of s.taches) {
      if (!t.lot) continue;
      const site = siteDuLot(t);
      if (t.pr == null) {
        attendues.push(`lot_sans_pr ${t.id} @ ${site}`);
        continue;
      }
      if ((t.repo ?? DEPOT_LOCAL) !== DEPOT_LOCAL) {
        attendues.push(`autre_depot ${t.id} @ ${site}`);
        continue;
      }
      const titre = titres.get(String(t.pr));
      if (titre === undefined) {
        if (t.pr <= plancher) attendues.push(`lot_sous_plancher ${t.id} @ ${site}`);
        continue; // au-dessus du plancher : une FAUTE, que le dépôt vert n'a pas
      }
      const nommes = lotsDuTitre(titre);
      if (nommes.length === 1 && nommes[0] === t.lot) continue; // attesté
      attendues.push(`dette_lot_journal ${t.id} @ ${site}`);
    }
    const rendues = exemptions
      .filter((e) =>
        /^(lot_sans_pr|autre_depot|lot_sous_plancher|dette_lot_journal)$/.test(e.nature)
      )
      .map((e) => `${e.nature} ${e.tache} @ ${e.site}`);
    expect(
      attendues.length,
      'aucune exemption de lot recomptée : rien ne serait prouvé'
    ).toBeGreaterThan(0);
    expect(
      rendues.sort(),
      'les exemptions de lot rendues ne sont pas celles que le recompte indépendant trouve'
    ).toEqual(attendues.sort());
  });

  /** Une tâche du dépôt réel dont l'entrée de journal existe et dont le TITRE nomme le lot, et un lot de sa forme qu'aucune tâche ne porte. */
  function tacheAttestee(s: ReturnType<typeof chargerSources>) {
    const entrees = entreesDeJournal(s.journal);
    const t = s.taches.find(
      (x) =>
        x.lot &&
        x.pr != null &&
        ((entrees.get(String(x.pr)) ?? '').split('\n')[0] as string)
          .split(/[^A-Za-z0-9-]+/)
          .includes(x.lot)
    );
    expect(
      t,
      'aucune tâche dont le titre de l’entrée de journal nomme le lot : le témoin ne saurait quoi fausser'
    ).toBeDefined();
    const lots = new Set(s.taches.map((x) => x.lot));
    let faux = (t!.lot as string).replace(/[0-9]+$/, '99');
    while (lots.has(faux)) faux += '9';
    const titre = (entrees.get(String(t!.pr)) as string).split('\n')[0] as string;
    return { t: t!, faux, titre };
  }

  it('F-LOT — un lot FAUX cité seulement dans le CORPS de l’entrée de sa PR n’est pas attesté : faute nommée', () => {
    const s = chargerSources(fichiersSuivis());
    const { t, faux, titre } = tacheAttestee(s);
    const journal = s.journal.replace(
      titre,
      `${titre}\n\nLe corps cite aussi \`${faux}\`, un autre lot.`
    );
    const taches = s.taches.map((x) => (x === t ? { ...x, lot: faux } : x));
    const { fautes } = analyser({ ...s, journal, taches });
    expect(
      fautes.filter(
        (f) =>
          f.famille === 'lot_non_atteste' && f.message.includes(t.id) && f.message.includes(faux)
      ).length,
      `${t.id} porte le lot « ${faux} », que seul le corps de l’entrée cite, et rien n’a rougi`
    ).toBe(1);
  });

  it('F-LOT — un titre qui nomme PLUSIEURS lots n’atteste aucun d’eux : un lot faux pris dans ce titre est une faute nommée', () => {
    const s = chargerSources(fichiersSuivis());
    const { t, faux, titre } = tacheAttestee(s);
    const journal = s.journal.replace(titre, `${titre} et ${faux}`);
    const taches = s.taches.map((x) => (x === t ? { ...x, lot: faux } : x));
    const { fautes } = analyser({ ...s, journal, taches });
    expect(
      fautes.filter(
        (f) =>
          f.famille === 'lot_non_atteste' && f.message.includes(t.id) && f.message.includes(faux)
      ).length,
      `${t.id} porte le lot « ${faux} », l’un des lots d’un titre multi-lots, et rien n’a rougi`
    ).toBe(1);
  });

  it('F2/F3 — une panne de journal que le RENDU affiche autrement que la garde ne la lit, rejouée sur le dépôt réel, fait REFUSER en nommant le fichier et la ligne', () => {
    const suivis = fichiersSuivis();
    const s = chargerSources(suivis);
    const { t, faux, titre } = tacheAttestee(s);
    const fichier = suivis.find(
      (f) =>
        f.startsWith('docs/journal/') &&
        f !== 'docs/journal/README.md' &&
        lireReel(f).split('\n').includes(titre)
    ) as string;
    expect(fichier, `aucun fichier de journal suivi ne porte « ${titre} »`).toBeDefined();
    // Toutes les tâches de la PR passent au lot faux : les pannes des revues sur 1c5dc5f et 8fb190e.
    const doc = JSON.parse(lireReel('docs/tasks.json')) as { taches: typeof s.taches };
    for (const x of doc.taches) if (x.pr === t.pr && x.lot === t.lot) x.lot = faux;
    const tachesFaussees = Buffer.from(JSON.stringify(doc, null, 2));
    const neuve = Math.max(...[...entreesDeJournal(s.journal).keys()].map(Number)) + 1;
    const ancre = `${ANCRE_JOURNAL}${t.pr}`;
    const suite = titre.slice(ancre.length);
    const faussee = `${ancre} — 2026-09-04 — lot ${faux} (rectificatif)`;
    const [NBSP, ZWSP, RC, SELECTEUR] = [0xa0, 0x200b, 0x0d, 0xfe0f].map((cp) =>
      String.fromCodePoint(cp)
    );
    const corps = ['', '**Fait.** Les tâches sont rattachées à leur lot.', ''];
    const details = ['', '<details>', faussee, '</details>'];
    const echappee = `${ancre.replace('PR #', 'PR \\#')}${suite}`;
    // Le VRAI titre, tel que le rendu l'afficherait hors de tout conteneur : un titre de niveau 1 privé
    // du croisillon de son numéro. Il s'affiche, et ni gov:etat ni la garde ne le lisent.
    const enClair = `# ${titre.slice(3).replace('PR #', 'PR ')}`;
    // `pose` remplace la ligne du titre réel ; `refusee` est l'indice, DANS `pose`, de la ligne que le refus
    // doit nommer — connu par construction, jamais recalculé par un prédicat retapé de la garde.
    type Cas = { quoi: string; taches: boolean; pose: string[]; refusee: number };
    const cas: Cas[] = [
      {
        quoi: 'e8v3 : titre ajouté à DEUX espaces, titre réel encadré par `<!--` et `-->` entre accents graves',
        taches: true,
        pose: [
          faussee.replace(' ', '  '),
          ...corps,
          "Le source d'un commentaire HTML s'ouvre par `<!--`.",
          '',
          titre,
          '',
          'Et il se ferme par `-->`.',
        ],
        refusee: 0,
      },
      {
        quoi: 'le jumeau de e8v3 : le titre ajouté à DEUX espaces, seul',
        taches: true,
        pose: [faussee.replace(' ', '  '), ...corps, titre],
        refusee: 0,
      },
      {
        quoi: 'exactitude : le titre réel en `<h2>`, un faux titre replié sous `<details>`',
        taches: true,
        pose: [`<h2>${titre.slice(3)}</h2>`, ...details],
        refusee: 0,
      },
      {
        quoi: 'securite : « ## PR \\# », un faux titre replié sous `<details>`',
        taches: true,
        pose: [echappee, ...details],
        refusee: 0,
      },
      {
        quoi: 'securite : « ## PR \\# », un faux titre dans un bloc de code clôturé',
        taches: true,
        pose: [echappee, '', '```text', faussee, '```'],
        refusee: 0,
      },
      {
        quoi: 'securite : « ## **PR** # », un faux titre replié',
        taches: true,
        pose: [`${ancre.replace('PR', '**PR**')}${suite}`, ...details],
        refusee: 0,
      },
      {
        quoi: 'securite : une espace de largeur nulle dans « PR », un faux titre replié',
        taches: true,
        pose: [`${ancre.replace('PR', `P${ZWSP}R`)}${suite}`, ...details],
        refusee: 0,
      },
      {
        quoi: 'securite : « PR&#32;# », un faux titre replié',
        taches: true,
        pose: [`${ancre.replace('PR #', 'PR&#32;#')}${suite}`, ...details],
        refusee: 0,
      },
      {
        quoi: 'securite : le titre réel dans une citation, un faux titre replié',
        taches: true,
        pose: [`> ${titre}`, ...details],
        refusee: 0,
      },
      {
        quoi: 'securite : le titre réel dans un élément de liste, un faux titre replié',
        taches: true,
        pose: [`- ${titre}`, ...details],
        refusee: 0,
      },
      {
        quoi: 'securite (c) : un faux titre non daté replié, puis `<span></span>`, un retour chariot NU et le titre réel',
        taches: true,
        pose: [
          '<details>',
          `${ancre} lot ${faux} (rectificatif)`,
          '</details>',
          '',
          `<span></span>${RC}${titre}`,
        ],
        refusee: 0,
      },
      {
        quoi: 'un retour chariot NU seul, entre du texte et le titre réel, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, `Texte.${RC}${titre}`],
        refusee: 4,
      },
      {
        quoi: 'mutation : le titre réel en citation, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, `> ${titre}`],
        refusee: 4,
      },
      {
        quoi: 'mutation : le titre réel en citation soulignée, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, `> ${titre.slice(3)}`, '> ---'],
        refusee: 4,
      },
      {
        quoi: 'mutation : le titre réel en `<h2>`, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, `<h2>${titre.slice(3)}</h2>`],
        refusee: 4,
      },
      {
        quoi: 'une espace INSÉCABLE entre « PR » et « # », un faux titre replié',
        taches: true,
        pose: [`${ancre.replace('R #', `R${NBSP}#`)}${suite}`, ...details],
        refusee: 0,
      },
      {
        quoi: 'un sélecteur emoji invisible dans « PR », un faux titre replié',
        taches: true,
        pose: [`${ancre.replace('PR', `P${SELECTEUR}R`)}${suite}`, ...details],
        refusee: 0,
      },
      {
        quoi: 'le titre réel dans un élément de liste ORDONNÉE, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, `1. ${titre}`],
        refusee: 4,
      },
      {
        quoi: 'le titre réel dans une note de bas de page, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, 'Voir la note[^1].', '', `[^1]: ${titre}`],
        refusee: 4,
      },
      {
        quoi: 'un faux titre dans un bloc `~~~`, le titre réel échappé',
        taches: true,
        pose: ['~~~', faussee, '~~~', '', echappee],
        refusee: 0,
      },
      {
        quoi: 'le titre réel suivi d’une séquence fermante, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, `${titre} ##`],
        refusee: 4,
      },
      {
        quoi: 'un lien vide qui cache le lot faux dans le titre réel',
        taches: true,
        pose: [titre.replace(t.lot as string, `[](${faux})`)],
        refusee: 0,
      },
      {
        quoi: 'une emphase collée au lot faux : le titre s’affiche avec un autre lot',
        taches: true,
        pose: [titre.replace(t.lot as string, `${faux}**3**`)],
        refusee: 0,
      },
      {
        quoi: 'un span de code collé au lot faux : le titre s’affiche avec un autre lot',
        taches: true,
        pose: [titre.replace(t.lot as string, `${faux}\`3\``)],
        refusee: 0,
      },
      {
        quoi: 'simplicite : le titre réel rétrogradé en ligne « PR #<n> — date — » sous un titre qui nomme le lot faux',
        taches: true,
        pose: [`${ancre} — lot ${faux}`, titre.slice(3)],
        refusee: 0,
      },
      {
        quoi: 'une ligne « PR #<n> — date — » sous un titre de section, que gov:etat prend pour une entrée',
        taches: true,
        pose: [titre, '', '## Rectificatif', '', faussee.slice(3)],
        refusee: 4,
      },
      {
        quoi: 'le titre réel précédé d’une espace, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, ` ${titre}`],
        refusee: 4,
      },
      {
        quoi: 'le titre réel en minuscules, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, titre.replace('PR', 'pr')],
        refusee: 4,
      },
      {
        quoi: 'le titre réel collé (« PR#<n> »), sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, titre.replace('PR #', 'PR#')],
        refusee: 4,
      },
      {
        quoi: 'le texte du titre réel souligné, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, suite.slice(3), '---'],
        refusee: 5,
      },
      {
        // 🔑 F4, la panne de securite (5219104563) : l'en-tête YAML est un CONTENEUR que la liste
        // d'autorisation admettait et que GitHub ne rend pas — il devient un tableau clé/valeur, et ni
        // le faux titre qu'il replie, ni un commentaire `#`, ni une ligne vide n'en sortent. Le titre
        // VISIBLE, lui, est le vrai texte privé du croisillon de son numéro : affiché, lu par personne.
        quoi: 'securite F4 : un en-tête YAML replie le faux titre, le vrai s’affiche sans le croisillon de son numéro',
        taches: true,
        pose: ['---', 'titre: journal du lot', faussee, '', '---', '', enClair],
        refusee: 0,
      },
      {
        quoi: 'securite F4 : le même en-tête, avec un COMMENTAIRE YAML que le rendu n’affiche nulle part',
        taches: true,
        pose: [
          '---',
          'titre: journal du lot',
          '# le lot, rectifie',
          faussee,
          '',
          '---',
          '',
          enClair,
        ],
        refusee: 0,
      },
      {
        quoi: 'securite F4 : un en-tête TOML `+++`, qui se referme sans ligne vide',
        taches: true,
        pose: ['+++', 'titre = "journal du lot"', faussee, '+++', '', enClair],
        refusee: 0,
      },
      {
        quoi: 'securite (dette 4) : le vrai titre privé du croisillon de son numéro, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, enClair],
        refusee: 4,
      },
      {
        quoi: 'un filet `- - -` espacé, sous un faux titre exact',
        taches: true,
        pose: [faussee, ...corps, suite.slice(3), '- - -'],
        refusee: 5,
      },
      {
        quoi: 'passe précédente : un titre caché dans un commentaire HTML fermé',
        taches: false,
        pose: [titre, '', '<!--', titre.replace(/#\d+/, `#${neuve}`), '-->'],
        refusee: 2,
      },
      {
        quoi: 'passe précédente : un titre caché dans un commentaire HTML jamais fermé',
        taches: false,
        pose: [titre, '', '<!--', titre.replace(/#\d+/, `#${neuve}`)],
        refusee: 2,
      },
    ];
    const reel = lireReel(fichier).split('\n');
    const i = reel.indexOf(titre);
    // Le second fichier est FICTIF et le reste : un mois réel (`2026-10`, fixé ici jusqu'au
    // 2026-10-01) devenait, au premier vrai fichier de ce mois, un préfixe qui remplaçait aussi le
    // journal réel, et le refus nommait ce dernier au lieu du témoin. Un nom exact et lointain.
    const SECOND_JOURNAL = 'docs/journal/2099-12.md';
    const juger = (quoi: string, lignes: string[], n: number, taches: boolean, autres = suivis) => {
      const lire = (f: string) =>
        f === fichier
          ? Buffer.from(lignes.join('\n'))
          : f === 'docs/tasks.json' && taches
            ? tachesFaussees
            : f === SECOND_JOURNAL
              ? Buffer.from(`# Journal — décembre 2099\n\n- ${titre}\n`)
              : octets(f);
      const refus = refusDe(() => chargerSources(autres, lire));
      const attendu = autres === suivis ? `${fichier}:${n}` : `${SECOND_JOURNAL}:3`;
      if (refus instanceof SourceIllisible && refus.message.includes(attendu)) return null;
      const verdict = refus ? refus.message : analyser(chargerSources(autres, lire)).fautes;
      return `${quoi} (${attendu}) : ${JSON.stringify(verdict).slice(0, 220)}`;
    };
    const acceptes = cas.flatMap((c) => {
      const lignes = [...reel.slice(0, i), ...c.pose, ...reel.slice(i + 1)];
      return juger(c.quoi, lignes, i + c.refusee + 1, c.taches) ?? [];
    });
    // Un SECOND fichier suivi du journal, porteur de la panne « titre en liste ».
    const second = juger('un second fichier de journal', reel, 0, false, [
      ...suivis,
      SECOND_JOURNAL,
    ]);
    // Une panne dans une entrée SOUS le plancher : le refus ne dépend pas du plancher.
    const sous = [...entreesDeJournal(s.journal).entries()].find(
      ([pr]) => Number(pr) <= s.plancherJournal
    );
    expect(sous, 'aucune entrée sous le plancher : le témoin ne porterait sur rien').toBeDefined();
    const titreSous = sous![1].split('\n')[0] as string;
    const k = reel.indexOf(titreSous);
    const sousPlancher =
      k < 0
        ? `l’entrée ${sous![0]} n’est pas dans ${fichier}`
        : juger(
            'une citation dans une entrée sous le plancher',
            [...reel.slice(0, k), `> ${titreSous}`, ...reel.slice(k + 1)],
            k + 1,
            false
          );
    expect(
      [...acceptes, second ?? [], sousPlancher ?? []].flat(),
      'une forme de journal que le rendu lit autrement n’a pas fait refuser en nommant sa ligne'
    ).toEqual([]);

    // Contre-témoin : un `<!--` ENTRE accents graves s'affiche tel quel — le journal est LU, ses entrées inchangées.
    const lu = [
      ...reel.slice(0, i),
      "Il s'ouvre par `<!--` et se ferme par `-->`.",
      '',
      ...reel.slice(i),
    ];
    const charge = chargerSources(suivis, (f) =>
      f === fichier ? Buffer.from(lu.join('\n')) : octets(f)
    );
    expect([...entreesDeJournal(charge.journal).keys()]).toEqual([
      ...entreesDeJournal(s.journal).keys(),
    ]);
  });

  it('F2/F3 — gov:etat, plan-state et gov:lecons IMPORTENT la grammaire de la garde (GOV-073), et leur lecture rend les MÊMES titres', () => {
    // Ce témoin extrayait chaque expression locale et exigeait son égalité avec celles d'ici : une égalité
    // PARTIELLE, que GOV-073 remplace. Il n'y a plus d'expression locale à extraire — les trois lecteurs
    // importent `entreesDuDossier` — et c'est ce que ce témoin exige désormais, puis il REJOUE la lecture.
    const parGarde = [...entreesDeJournal(chargerSources(fichiersSuivis()).journal).values()]
      .map((e) => e.split(String.fromCharCode(10))[0] as string)
      .sort();
    expect(
      parGarde.length,
      'aucune entrée de journal : l’égalité ne prouverait rien'
    ).toBeGreaterThan(0);
    for (const lecteur of [
      'scripts/gates/gov-etat.ts',
      'scripts/plan-state/build.ts',
      'scripts/gates/gov-lecons.ts',
    ]) {
      const code = lireReel(lecteur);
      expect(code, `${lecteur} n’importe plus la grammaire unique`).toMatch(
        /\bentreesDuDossier\b[^;]*from '[./]+(?:gates\/)?gov-attributions'/
      );
      expect(code, `${lecteur} garde une coupe locale du journal`).not.toMatch(
        /split\(\/\^## (?:\/m\)\.slice|\(\?=PR)/
      );
    }
    const parLaGrammaire = entreesDuDossier()
      .map((e) => `${ANCRE_JOURNAL}${e.pr} — ${e.date} — ${e.titre}`)
      .sort();
    expect(
      parLaGrammaire,
      'la grammaire unique et la garde ne lisent pas les mêmes titres d’entrée'
    ).toEqual(parGarde.map((t) => t.trimEnd()));
  });

  it('la LISTE D’AUTORISATION du journal n’est pas élargie en silence : la règle de caractère admet EXACTEMENT l’ASCII imprimable et ces caractères-là', () => {
    const FIGEE = 'àâäæçéèêëîïôöùûüÿœÀÂÄÆÇÉÈÊËÎÏÔÖÙÛÜŸŒᵉ«»—−→↔§·⚠';
    expect(
      HORS_ASCII_ADMIS,
      'la liste d’autorisation a changé : l’élargir se décide ici, dans le même diff'
    ).toBe(FIGEE);
    const attendus = new Set([
      ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, n) => 0x20 + n),
      ...[...FIGEE].map((c) => c.codePointAt(0) as number),
    ]);
    const ecarts: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (caractereAdmis(String.fromCodePoint(cp)) !== attendus.has(cp))
        ecarts.push(`U+${cp.toString(16)}`);
    }
    expect(ecarts.slice(0, 20), 'la règle admet autre chose que la liste figée').toEqual([]);
  });

  it('une dette de lot FIGÉE ne vaut que pour le titre mesuré : un titre multi-lots réécrit pour ne nommer qu’un AUTRE lot fait rougir chaque tâche figée', () => {
    const s = chargerSources(fichiersSuivis());
    const entrees = entreesDeJournal(s.journal);
    const lots = new Set(s.taches.flatMap((x) => (x.lot ? [x.lot] : [])));
    const titreDe = (pr: number) => (entrees.get(String(pr)) ?? '').split('\n')[0] as string;
    const lotsDe = (titre: string) => [
      ...new Set(titre.split(/[^A-Za-z0-9-]+/).filter((j) => lots.has(j))),
    ];
    const d = s.dettesLot.find((x) => lotsDe(titreDe(x.pr)).length > 1);
    expect(
      d,
      'aucune dette de lot sur un titre multi-lots : le témoin ne saurait quoi réécrire'
    ).toBeDefined();
    const titre = titreDe(d!.pr);
    const autre = lotsDe(titre).find((l) => l !== d!.lot) as string;
    const journal = s.journal.replace(
      titre,
      `${(/^\S+\s+\S+\s+#\d+ — \S+/.exec(titre) as RegExpExecArray)[0]} — lot ${autre}`
    );
    const { fautes } = analyser({ ...s, journal });
    const figees = s.dettesLot
      .filter((x) => x.pr === d!.pr && x.lot === d!.lot)
      .map((x) => x.tache);
    const muettes = figees.filter(
      (id) =>
        !fautes.some(
          (f) =>
            f.famille === 'lot_non_atteste' && f.message.includes(`${id} porte lot « ${d!.lot} »`)
        )
    );
    expect(
      muettes,
      `le titre de la PR ${d!.pr} ne nomme plus que « ${autre} », et ces tâches figées sous « ${d!.lot} » restent absoutes`
    ).toEqual([]);
  });

  it('une attribution à une tâche LIVRÉE qui garde un path gabarit n’est JAMAIS exemptée comme « pas encore connu »', () => {
    const s = chargerSources(fichiersSuivis());
    const statut = new Map(s.taches.map((t) => [t.id, t.statut ?? '']));
    const menteuses = analyser(s).exemptions.filter(
      (e) => /_paths_/.test(e.nature) && LIVREE.has(statut.get(e.tache) as string)
    );
    expect(
      menteuses.map((e) => `${e.nature} ${e.tache} @ ${e.site}`),
      'des tâches TERMINÉES sont exemptées sous un sens qui dit « pas encore connu »'
    ).toEqual([]);
  });

  /**
   * Rejoué sur FIXTURES : le dépôt ne porte plus aucune tâche livrée à path gabarit, et la dette qui
   * en figeait les occurrences n'existe plus. Chaque attribution que ce témoin faisait rougir rougit
   * encore — et le gabarit lui-même est refusé, pour la tâche pure comme pour la mixte.
   */
  it('REQ-GOV-021 — un site NEUF — en-tête d’un fichier neuf, gate neuve, occurrence de plus sur un site déjà nommé, gate ou chaîne repointée vers un AUTRE script — nommant une tâche LIVRÉE à path gabarit est une faute nommée', () => {
    const NEUF = 'scripts/gates/sonde-neuve.ts';
    const EXISTANT = 'scripts/gates/porte.ts';
    const base: Tache = { id: 'GOV-100', paths: [EXISTANT], tests: {}, statut: 'fusionnee' };
    const pure: Tache = { ...base, id: 'GOV-003', paths: ['docs/gouvernance/GOV-003'] };
    const mixte: Tache = {
      ...base,
      id: 'GOV-007',
      paths: ['docs/gouvernance/GOV-007', 'prisma/schema.prisma'],
    };
    const voisine: Tache = { ...base, id: 'GOV-101', paths: ['scripts/gates/autre.ts'] };
    const gA = {
      id: 'gov:identifiants',
      script: 'scripts/gates/gov-identifiants.ts',
      tache: pure.id,
    };
    const gP = {
      id: 'g',
      script: 'scripts/gates/autre.ts',
      tache: voisine.id,
      verifie: `étendue par ${pure.id}`,
    };
    const s: Sources = {
      taches: [base, pure, mixte, voisine],
      gates: [
        { ...gA, script: NEUF },
        { ...gP, script: NEUF },
        { id: 'sonde-neuve-pure', script: NEUF, tache: pure.id },
        { id: 'sonde-neuve-mixte', script: NEUF, tache: mixte.id },
      ],
      postes: [],
      journal: '',
      plancherJournal: 0,
      // Une occurrence DE PLUS au bout de la ligne qui nommait déjà la tâche livrée : rien n'est retiré.
      entetes: [
        { fichier: EXISTANT, lignes: [`// étendue par ${pure.id} ${pure.id}`] },
        { fichier: NEUF, lignes: [`// portée par ${pure.id}`, `// étendue par ${mixte.id}`] },
      ],
      citations: [],
      dettesGate: [],
      dettesLot: [],
      exemptionsFigees: [],
    };
    const { fautes } = analyser(s);
    const vue = (famille: string, ...noms: string[]) =>
      fautes.some((f) => f.famille === famille && noms.every((n) => f.message.includes(n)));
    const aveugles = [
      ['mention_hors_paths', `${NEUF}:1`, pure.id],
      ['mention_hors_paths', `${NEUF}:2`, mixte.id],
      ['gate_non_reciproque', 'sonde-neuve-pure', pure.id],
      ['gate_non_reciproque', 'sonde-neuve-mixte', mixte.id],
      ['mention_hors_paths', `${EXISTANT}:1`, pure.id],
      ['gate_non_reciproque', `« ${gA.id} »`, pure.id, NEUF],
      ['mention_hors_paths', `docs/gates.json:${gP.id}.`, pure.id, `et ${NEUF} n'est ni`],
      ['chemin_gabarit', pure.id, 'docs/gouvernance/GOV-003'],
      ['chemin_gabarit', mixte.id, 'docs/gouvernance/GOV-007'],
    ].filter(([famille, ...noms]) => !vue(famille as string, ...noms));
    expect(
      aveugles,
      'ces attributions NEUVES à une tâche livrée à path gabarit n’ont fait rougir personne'
    ).toEqual([]);
    expect(
      fautes.filter(
        (f) => f.famille === 'mention_hors_paths' && f.message.includes(`${EXISTANT}:1`)
      ),
      'les DEUX occurrences de la ligne ne sont pas jugées chacune'
    ).toHaveLength(2);
    expect(rendre(analyser(s)).code).toBe(1);
  });

  /**
   * Le PRODUCTEUR INDÉPENDANT des exemptions « paths gabarit » — les plus nombreuses. Le recompte ne
   * passe pas par `analyser` : il relit les registres et les fichiers, découpe les textes en jetons, et
   * range chaque attribution sous la nature que sa cause lui donne. Une exemption tue selon son ORIGINE
   * (prose de `docs/gates.json`, fichiers sous `tests/`) ou selon la FORME d'une gate le fait diverger.
   *
   * GOV-074 — LE RECOMPTE SE FAIT À L'OCCURRENCE. Il comparait un en-tête au grain du FICHIER (ligne
   * retirée) et ne voyait ni la minuscule ni le trait d'union non ASCII : deux exemptions pouvaient
   * permuter de ligne, ou une mention écrite `gov-0xx` s'exempter, sans qu'il diverge. Il compare
   * désormais la ligne, lit la mention casse et tirets repliés, et range une déclaration par sa
   * propre composition du lieu (script jugé, gate si le script est partagé, champ, ligne).
   */
  it('REQ-GOV-021 — les exemptions « paths gabarit » ont un PRODUCTEUR INDÉPENDANT : recomptées ici sur les registres relus, par nature, tâche et OCCURRENCE', () => {
    const { exemptions } = analyser(chargerSources(fichiersSuivis()));
    type T = { id: string; paths?: string[]; tests?: Record<string, string[]>; statut?: string };
    const taches = (JSON.parse(lireReel('docs/tasks.json')) as { taches: T[] }).taches;
    const gates = (JSON.parse(lireReel('docs/gates.json')) as { gates: Record<string, unknown>[] })
      .gates;
    const parId = new Map(taches.map((t) => [t.id, t]));
    // Un path GABARIT se termine par l'identifiant de la tâche elle-même.
    const gabarits = (t: T) => (t.paths ?? []).filter((p) => posix.basename(p) === t.id);
    const reels = (t: T) => (t.paths ?? []).filter((p) => posix.basename(p) !== t.id);
    const declareToucher = (t: T, fichier: string) =>
      [
        ...(t.paths ?? []),
        ...Object.values(t.tests ?? {})
          .flat()
          .map((x) => x.split('#')[0] as string),
      ].some((x) => x === fichier || (x.endsWith('/') && fichier.startsWith(x)));
    // Une déclaration « contexte » absout UNE occurrence : lieu, ligne et identifiant, par égalité.
    const enContexte = (ou: string, ligne: number, id: string) =>
      CITATIONS_DECLAREES.some(
        (c) => c.ou === ou && c.ligne === ligne && c.id === id && c.nature === 'contexte'
      );
    // Le lieu d'une chaîne de docs/gates.json, recomposé ici : le script jugé, la gate si ce script
    // est porté par plusieurs gates, puis le chemin du champ.
    const scriptDe = (g: Record<string, unknown>) => (g.script as string).split('#')[0] as string;
    const lieuDansGates = (g: Record<string, unknown>, champ: string) => {
      const partage = gates.filter((x) => scriptDe(x) === scriptDe(g)).length > 1;
      return `docs/gates.json(${scriptDe(g)})${partage ? `@${g.id as string}` : ''}${champ}`;
    };
    // Une tâche LIVRÉE (ou sans statut) ne relève plus de « pas encore connu » : aucune exemption ne
    // l'absout, et son gabarit est refusé. Le recompte la range sous un nom qu'aucune nature ne porte :
    // la voir ici fait diverger les deux listes.
    const nature = (lieu: 'gate' | 'mention', t: T) =>
      t.statut === undefined || LIVREE.has(t.statut)
        ? `jamais_exemptee_${lieu}`
        : `${lieu}_paths_${reels(t).length === 0 ? 'non_resolus' : 'en_partie_gabarit'}`;
    // Une mention est un JETON entier qui désigne une tâche, casse et traits d'union repliés : le
    // trait d'union, l'insécable, le tiret numérique, le demi-cadratin et le signe moins.
    const TIRET_NON_ASCII = /[‐‑‒–−]/g;
    const replier = (j: string) => j.replace(TIRET_NON_ASCII, '-').toUpperCase();
    const parCle = new Map(taches.map((t) => [replier(t.id), t.id]));
    const mentions = (texte: string) =>
      texte
        .split(/[^A-Za-z0-9\-‐‑‒–−]+/)
        .flatMap((j) => (parCle.has(replier(j)) ? [parCle.get(replier(j)) as string] : []));

    // Le LIEU d'une attribution lue dans docs/gates.json porte le fichier contre lequel elle est jugée : le script.
    const attendues: string[] = [];
    for (const g of gates) {
      const t = parId.get(g.tache as string);
      const script = (g.script as string).split('#')[0] as string;
      if (!t || gabarits(t).length === 0 || declareToucher(t, script)) continue;
      if (
        DETTE_GATE_NON_RECIPROQUE.some(
          (d) => d.gate === g.id && d.tache === t.id && d.script === script
        )
      )
        continue;
      attendues.push(`${nature('gate', t)} ${t.id} @ docs/gates.json:${g.id} (${script})`);
    }
    for (const fichier of fichiersSuivis().filter(sousScriptsOuTests)) {
      lireReel(fichier)
        .split('\n')
        .slice(0, 20)
        .forEach((ligne, i) => {
          for (const id of mentions(ligne)) {
            const t = parId.get(id) as T;
            if (
              gabarits(t).length === 0 ||
              declareToucher(t, fichier) ||
              enContexte(fichier, i + 1, id)
            )
              continue;
            attendues.push(`${nature('mention', t)} ${id} @ ${fichier}:${i + 1}`);
          }
        });
    }
    for (const g of gates) {
      const script = (g.script as string).split('#')[0] as string;
      const pile: [unknown, string][] = [[g, `docs/gates.json:${g.id}`]];
      while (pile.length > 0) {
        const [v, ou] = pile.pop() as [unknown, string];
        if (Array.isArray(v)) v.forEach((x, i) => pile.push([x, `${ou}[${i}]`]));
        else if (v !== null && typeof v === 'object') {
          for (const [cle, x] of Object.entries(v))
            pile.push([x, `${ou}.${cle}`], [cle, `${ou}.${cle} (nom de clé)`]);
        } else if (typeof v === 'string') {
          const lieu = lieuDansGates(g, ou.slice(`docs/gates.json:${g.id as string}`.length));
          v.split('\n').forEach((l, i) => {
            for (const id of mentions(l)) {
              const t = parId.get(id) as T;
              if (
                id === g.tache ||
                gabarits(t).length === 0 ||
                declareToucher(t, script) ||
                enContexte(lieu, i + 1, id)
              )
                continue;
              attendues.push(`${nature('mention', t)} ${id} @ ${ou} (${script})`);
            }
          });
        }
      }
    }

    // Chaque site est comparé ENTIER : un en-tête à sa ligne, une chaîne de docs/gates.json par son
    // lieu, son champ et son script.
    const rendues = exemptions
      .filter((e) => /^(gate|mention)_paths_(non_resolus|en_partie_gabarit)$/.test(e.nature))
      .map((e) => `${e.nature} ${e.tache} @ ${e.site}`);
    expect(
      attendues.length,
      'le recompte ne trouve aucune attribution à paths gabarit : il ne prouverait rien'
    ).toBeGreaterThan(0);
    expect(
      rendues.sort(),
      'les exemptions « paths gabarit » rendues ne sont pas celles que le recompte indépendant trouve'
    ).toEqual(attendues.sort());
  });

  it('toute CHAÎNE et tout NOM DE CLÉ d’une entrée de docs/gates.json sont lus, à toute profondeur — chaque champ, sous chaque forme que le registre réel lui donne', () => {
    const s = chargerSources(fichiersSuivis());
    const inconnu = identifiantInconnu(s.taches);

    // Les couples (champ, forme) tels que le registre RÉEL les porte : un champ ajouté demain y entre seul.
    const formes = new Map<string, { gate: (typeof s.gates)[number]; champ: string }>();
    for (const gate of s.gates) {
      for (const [champ, valeur] of Object.entries(gate)) {
        const forme = Array.isArray(valeur) ? 'tableau' : valeur === null ? 'nul' : typeof valeur;
        if (!formes.has(`${champ}|${forme}`)) formes.set(`${champ}|${forme}`, { gate, champ });
      }
    }
    const injecter = (valeur: unknown): unknown =>
      typeof valeur === 'string'
        ? `${valeur} ${inconnu}`
        : Array.isArray(valeur)
          ? [...valeur, inconnu]
          : valeur !== null && typeof valeur === 'object'
            ? { ...valeur, sonde: inconnu }
            : undefined;
    const portees = [...formes].filter(
      ([, { gate, champ }]) => injecter(gate[champ]) !== undefined
    );
    expect(
      portees.length,
      'aucun champ de docs/gates.json ne porte de chaîne : rien ne serait éprouvé'
    ).toBeGreaterThan(0);

    const aveugles: string[] = [];
    for (const [cle, { gate, champ }] of portees) {
      const sonde = { ...gate, [champ]: injecter(gate[champ]) };
      const { fautes } = analyser({ ...s, gates: [sonde] });
      const vue = fautes.some(
        (f) =>
          f.message.includes(inconnu) &&
          (f.famille === 'mention_non_resolue'
            ? f.message.includes(`docs/gates.json:${sonde.id}.${champ}`)
            : champ === 'tache' && f.famille === 'gate_tache_inconnue')
      );
      if (!vue) aveugles.push(cle);
    }
    expect(aveugles, `« ${inconnu} » posé dans ces champs n’a fait rougir personne`).toEqual([]);

    // Un identifiant écrit comme NOM de clé : sur l'entrée elle-même, puis dans un objet posé DANS un tableau.
    const premiere = s.gates[0] as (typeof s.gates)[number];
    for (const sonde of [
      { ...premiere, [inconnu]: 'x' },
      { ...premiere, sonde: [{ [inconnu]: 1 }] },
    ]) {
      const { fautes } = analyser({ ...s, gates: [sonde] });
      expect(
        fautes.some((f) => f.famille === 'mention_non_resolue' && f.message.includes(inconnu)),
        `« ${inconnu} » écrit comme NOM de clé n’a fait rougir personne : ${JSON.stringify(sonde).slice(0, 200)}`
      ).toBe(true);
    }
  });

  it('une entrée de docs/gates.json imbriquée sur 20 000 niveaux est lue jusqu’au fond : l’identifiant qui y vit est vu, aucune erreur brute', () => {
    const suivis = fichiersSuivis();
    const inconnu = identifiantInconnu(chargerSources(suivis).taches);
    const gates = lireReel('docs/gates.json');
    const i = dansLaPremiereEntree(gates, 'gates');
    const profond = '{"n":'.repeat(20_000) + `"la lacune de ${inconnu}"` + '}'.repeat(20_000);
    const texte = gates.slice(0, i) + `"profond": ${profond},` + gates.slice(i);
    const lire = (c: string) => (c === 'docs/gates.json' ? Buffer.from(texte) : octets(c));
    const { fautes } = analyser(chargerSources(suivis, lire));
    expect(
      fautes.filter((f) => f.famille === 'mention_non_resolue' && f.message.includes(inconnu))
        .length
    ).toBe(1);
  });
});

describe('REQ-GOV-021 — la garde ne lit QUE des sources suivies, et refuse en se NOMMANT', () => {
  it('un journal présent sur le disque mais absent des fichiers SUIVIS ne compte pas : refus nommé', () => {
    // La liste des fichiers suivis est amputée du journal alors que le disque le porte toujours :
    // une lecture du disque le retrouverait.
    const sansJournal = fichiersSuivis().filter(
      (f) => !f.startsWith('docs/journal/') || f === 'docs/journal/README.md'
    );
    expect(() => chargerSources(sansJournal)).toThrow(SourceIllisible);
    // Le refus de la LISTE, pas celui de la lecture : une liste relue sur le disque dont chaque fichier
    // passerait par le contrôle « suivi » refuserait aussi, mais sur « n'est pas un fichier SUIVI ».
    expect(() => chargerSources(sansJournal)).toThrow(/aucun fichier de journal SUIVI/);
  });

  it('un registre absent des fichiers suivis est refusé en le nommant', () => {
    const sansTaches = fichiersSuivis().filter((f) => f !== 'docs/tasks.json');
    expect(() => chargerSources(sansTaches)).toThrow(SourceIllisible);
    expect(() => chargerSources(sansTaches)).toThrow(/docs\/tasks\.json/);
  });

  it('un registre TRONQUÉ est refusé en le nommant, pas sur une trace de pile', () => {
    const lire = (c: string) =>
      c === 'docs/tasks.json' ? Buffer.from(lireReel(c).slice(0, 3940)) : octets(c);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(SourceIllisible);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/tasks\.json/);
  });

  it('un registre dont la clé est RENOMMÉE n’est pas un registre vide : refus nommé', () => {
    const lire = (c: string) =>
      c === 'docs/agents.json' ? Buffer.from(JSON.stringify({ poste: [] })) : octets(c);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/docs\/agents\.json.*postes/);
  });

  it('une clé DUPLIQUÉE dans un registre lu est refusée en se nommant : JSON.parse garde la dernière, le lecteur du fichier ou du diff lit la première', () => {
    const suivis = fichiersSuivis();
    const inconnu = identifiantInconnu(chargerSources(suivis).taches);
    // « i » écrit par son échappement JSON : pour JSON.parse, c'est la même clé que « id ».
    const I_ECHAPPE = String.fromCharCode(92) + 'u0069';
    const racine = (texte: string, cle: string) => {
      const i = texte.indexOf('{') + 1;
      return texte.slice(0, i) + `"${cle}": [],` + texte.slice(i);
    };
    const entree = (texte: string, cle: string, ajout: string) => {
      const i = dansLaPremiereEntree(texte, cle);
      return texte.slice(0, i) + ajout + texte.slice(i);
    };
    const taches = lireReel('docs/tasks.json');
    const gates = lireReel('docs/gates.json');
    const postes = lireReel('docs/agents.json');
    const cas: [chemin: string, texte: string, cle: string][] = [
      ['docs/tasks.json', racine(taches, 'taches'), 'taches'],
      ['docs/tasks.json', entree(taches, 'taches', `"reqs": ["${inconnu}"],`), 'reqs'],
      ['docs/gates.json', racine(gates, 'gates'), 'gates'],
      [
        'docs/gates.json',
        entree(gates, 'gates', `"verifie": "la lacune de ${inconnu}",`),
        'verifie',
      ],
      ['docs/gates.json', entree(gates, 'gates', `"${I_ECHAPPE}d": "${inconnu}",`), 'id'],
      ['docs/agents.json', racine(postes, 'postes'), 'postes'],
      ['docs/agents.json', entree(postes, 'postes', `"code": "${inconnu}",`), 'code'],
    ];
    for (const [chemin, texte, cle] of cas) {
      expect(
        () => JSON.parse(texte),
        `${chemin} : la sonde « ${cle} » n'est plus du JSON`
      ).not.toThrow();
      const refus = refusDe(() =>
        chargerSources(suivis, (c) => (c === chemin ? Buffer.from(texte) : octets(c)))
      );
      expect(
        refus,
        `${chemin} : la clé « ${cle} » écrite deux fois n’a pas fait refuser`
      ).toBeInstanceOf(SourceIllisible);
      expect(refus!.message, `${chemin} : le refus ne nomme pas la source`).toContain(chemin);
      expect(refus!.message, `${chemin} : le refus ne nomme pas la clé dupliquée`).toContain(
        `« ${cle} »`
      );
    }
  });

  it('le README est lu sous la liste d’autorisation, mais ses ENTRÉES ne comptent pas : un mode d’emploi n’atteste aucun lot', () => {
    const reel = lireReel('docs/journal/README.md');
    const NL = String.fromCodePoint(10);
    // Un titre d'entrée EXACT, VISIBLE, écrit dans le mode d'emploi : la liste d'autorisation l'admet
    // (rien ne le replie), et c'est bien là le danger — il attesterait un lot sans qu'aucune PR l'ait
    // écrit. `gov:etat`, lui, le lirait : l'écart est fail-closed, il n'exempte rien.
    const texte = `${reel}${NL}## PR #9901 — 2026-09-16 — lot L-9-97${NL}`;
    const s = chargerSources(fichiersSuivis(), (c) =>
      c === 'docs/journal/README.md' ? Buffer.from(texte, 'utf8') : octets(c)
    );
    expect([...entreesDeJournal(s.journal).keys()]).not.toContain('9901');
  });

  it('un README de journal sans plancher est refusé : la frontière ne se devine pas', () => {
    const lire = (c: string) =>
      c === 'docs/journal/README.md' ? Buffer.from('# Le journal\n') : octets(c);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(/plancher/);
  });

  it('un plancher écrit DEUX fois dans le README — l’une dans un commentaire invisible au rendu — est refusé : la garde ne choisit pas', () => {
    const reel = lireReel('docs/journal/README.md');
    const ligne = (/^.*\*\*> \d+\*\*.*$/m.exec(reel) as RegExpExecArray)[0];
    const texte = `<!-- ${ligne.replace(/\d+/, '999')} -->\n${reel}`;
    const refus = refusDe(() =>
      chargerSources(fichiersSuivis(), (c) =>
        c === 'docs/journal/README.md' ? Buffer.from(texte) : octets(c)
      )
    );
    expect(refus, 'un plancher écrit deux fois n’a pas fait refuser').toBeInstanceOf(
      SourceIllisible
    );
    expect(refus!.message).toMatch(/plancher/);
  });

  it('le plancher écrit UNE SEULE FOIS, dans un conteneur que le rendu n’affiche pas, est refusé : l’interrupteur du journal se lit dans le dépôt PUBLIÉ', () => {
    const reel = lireReel('docs/journal/README.md');
    const ligne = (/^.*\*\*> \d+\*\*.*$/m.exec(reel) as RegExpExecArray)[0];
    // Le plancher RÉEL quitte le README : chaque cas l'y remet une seule fois, caché, et à un autre nombre.
    const cache = ligne.replace(/\d+/, '999');
    const nu = reel.replace(ligne, '');
    const NL = String.fromCodePoint(10);
    // AUCUN conteneur n'est énuméré par la garde. DEUX règles, dérivées : la ligne qui OUVRE est nommée
    // par la liste d'autorisation, et la LIGNE DU PLANCHER ne porte QUE le plancher. Les cinq montages
    // de la passe précédente sont ici, ET ceux qu'une seule LIGNE VIDE suffisait à faire passer (revue
    // 5220172093), ET la définition de lien dont le titre est à la ligne suivante (revue 5220256065),
    // ET les quatre formes de la revue 5220321404 — dont la cellule de tableau que GitHub JETTE.
    const STRUCTURE = /change la structure rendue/;
    const SEUL = /porte autre chose que le plancher/;
    // Les formes que la passe précédente LISAIT viennent d'abord : la première panne vue est celle
    // que cette passe ferme, pas un refus renommé.
    const cas: [string, string, RegExp][] = [
      [
        'une TROISIÈME CELLULE dans un tableau à deux colonnes : GitHub ne la replie pas, il la JETTE',
        `| cle | valeur |${NL}| --- | --- |${NL}| plancher | voir ci-dessous | ${cache} |${NL}${NL}${nu}`,
        SEUL,
      ],
      [
        'un TITRE DE LIEN, que le rendu met en infobulle',
        `[Le plancher](https://example.invalid "${cache}")${NL}${NL}${nu}`,
        SEUL,
      ],
      [
        'le TEXTE ALTERNATIF d’une image : l’image s’affiche, le nombre non',
        `![${cache}](plancher.png)${NL}${NL}${nu}`,
        SEUL,
      ],
      [
        'le bloc HTML, une LIGNE VIDE après la balise : le bloc se ferme au rendu, la section reste cachée',
        `<div hidden>${NL}${NL}${cache}${NL}${NL}</div>${NL}${NL}${nu}`,
        STRUCTURE,
      ],
      [
        'une section `<details><summary>`, que GitHub REPLIE',
        `<details><summary>Reglages</summary>${NL}${NL}${cache}${NL}${NL}</details>${NL}${NL}${nu}`,
        STRUCTURE,
      ],
      [
        'une section `<details>` SANS `<summary>`, isolée par des lignes vides',
        `<details>${NL}${NL}${cache}${NL}${NL}</details>${NL}${NL}${nu}`,
        STRUCTURE,
      ],
      [
        'le bloc HTML, une ligne vide, et le plancher à la FIN d’un paragraphe',
        `<div hidden>${NL}${NL}Note interne.${NL}${cache}${NL}${NL}</div>${NL}${NL}${nu}`,
        STRUCTURE,
      ],
      [
        'la définition de lien-référence dont le TITRE est à la ligne suivante : la ligne du plancher n’est plus qu’une continuation indentée',
        `[plancher]: #${NL}  "${cache}."${NL}${NL}${nu}`,
        STRUCTURE,
      ],
      ['un commentaire HTML d’une seule ligne', `<!-- ${cache} -->${NL}${nu}`, SEUL],
      [
        'un commentaire HTML ouvert à la ligne d’avant',
        `Texte <!--${NL}${cache}${NL}-->${NL}${nu}`,
        STRUCTURE,
      ],
      [
        'un en-tête (front matter) replié en tableau clé/valeur',
        `---${NL}titre: le journal${NL}${cache}${NL}---${NL}${nu}`,
        /de seuls signes de bloc/,
      ],
      [
        'un bloc HTML brut, ouvert à la ligne d’avant',
        `<div hidden>${NL}${cache}${NL}</div>${NL}${NL}${nu}`,
        STRUCTURE,
      ],
      [
        'une balise sur la ligne du plancher, dans un paragraphe qui ne s’ouvre pas par « < »',
        `Un paragraphe.${NL}${cache} <span hidden>x</span>${NL}${NL}${nu}`,
        SEUL,
      ],
      [
        'une définition de lien-référence, que le rendu n’affiche nulle part',
        `[plancher]: # "${cache}"${NL}${NL}${nu}`,
        SEUL,
      ],
      [
        'un bloc de code INDENTÉ : le rendu l’affiche en code, la garde le refuse — un faux rouge NOMMÉ',
        `Un exemple :${NL}${NL}    ${cache}${NL}${NL}${nu}`,
        SEUL,
      ],
      [
        'le plancher écrit au fil d’une phrase : il a sa ligne, ou il n’est pas lu',
        `Le plancher du jour : ${cache}, et rien de plus.${NL}${NL}${nu}`,
        SEUL,
      ],
    ];
    for (const [quoi, texte, nomme] of cas) {
      const refus = refusDe(() =>
        chargerSources(fichiersSuivis(), (c) =>
          c === 'docs/journal/README.md' ? Buffer.from(texte) : octets(c)
        )
      );
      expect(refus, `le plancher écrit dans ${quoi} n’a pas fait refuser`).toBeInstanceOf(
        SourceIllisible
      );
      expect(refus!.message, `le refus ne nomme pas ${quoi}`).toMatch(nomme);
      expect(refus!.message, `le refus ne nomme pas le fichier`).toContain(
        'docs/journal/README.md'
      );
    }
    // Contre-témoin : le plancher du dépôt RÉEL, écrit en texte rendu, est lu.
    expect(() => chargerSources(fichiersSuivis())).not.toThrow();
  });

  it('une entrée de registre MAL FORMÉE est refusée en nommant l’entrée et le champ, jamais sur une trace de pile', () => {
    const lire = (c: string) =>
      c === 'docs/tasks.json' ? Buffer.from(JSON.stringify({ taches: [{}] })) : octets(c);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(SourceIllisible);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(
      /docs\/tasks\.json.*taches\[0\]\.id/
    );
  });

  it('une gate SANS script est refusée en se nommant : son attribution n’aurait aucun fichier à confronter', () => {
    const lire = (c: string) => {
      if (c !== 'docs/gates.json') return octets(c);
      const doc = JSON.parse(lireReel(c)) as { gates: Record<string, unknown>[] };
      delete doc.gates[0]!.script;
      return Buffer.from(JSON.stringify(doc));
    };
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(SourceIllisible);
    expect(() => chargerSources(fichiersSuivis(), lire)).toThrow(
      /docs\/gates\.json.*gates\[0\]\.script/
    );
  });

  it('une chaîne VIDE là où la garde lit un identifiant ou un script est refusée en se nommant', () => {
    const cas = [
      ['docs/tasks.json', 'taches', 'id'],
      ['docs/gates.json', 'gates', 'id'],
      ['docs/gates.json', 'gates', 'script'],
      ['docs/agents.json', 'postes', 'code'],
    ] as const;
    for (const [chemin, cle, champ] of cas) {
      const lire = (c: string) => {
        if (c !== chemin) return octets(c);
        const doc = JSON.parse(lireReel(c)) as Record<string, Record<string, unknown>[]>;
        doc[cle]![0]![champ] = '';
        return Buffer.from(JSON.stringify(doc));
      };
      const refus = refusDe(() => chargerSources(fichiersSuivis(), lire));
      expect(refus, `${chemin} — ${cle}[0].${champ} vide n’a pas fait refuser`).toBeInstanceOf(
        SourceIllisible
      );
      expect(refus!.message).toMatch(new RegExp(`${echapper(chemin)}.*${cle}\\[0\\]\\.${champ}`));
    }
  });

  it('un octet NUL fait refuser QUEL QUE SOIT le fichier : un fichier par extension suivie sous scripts/ et tests/, un fichier sans extension, et un NUL au-delà des premiers kilo-octets', () => {
    const suivis = fichiersSuivis();
    const parExtension = new Map<string, string>();
    for (const f of suivis.filter(sousScriptsOuTests)) {
      const ext = posix.extname(f);
      if (!parExtension.has(ext)) parExtension.set(ext, f);
    }
    // Un fichier sans extension : pris dans le dépôt s'il en porte, sinon ajouté à la liste des suivis.
    const SONDE = 'tests/sonde-sans-extension';
    const sansExtension = parExtension.get('') ?? SONDE;
    const perimetre = suivis.includes(sansExtension) ? suivis : [...suivis, sansExtension];
    const cibles = [...new Set([...parExtension.values(), sansExtension])];
    expect(
      cibles.length,
      'moins de deux formes de fichier : le témoin ne distinguerait rien'
    ).toBeGreaterThan(2);

    const GOV_999_UTF16 = Buffer.from('// GOV-999\n', 'utf16le');
    const contenus = [
      GOV_999_UTF16,
      Buffer.concat([Buffer.from(`${'x'.repeat(64_000)}\n`), GOV_999_UTF16]),
    ];
    const acceptes: string[] = [];
    for (const cible of cibles) {
      for (const [n, contenu] of contenus.entries()) {
        const lire = (c: string) =>
          c === cible ? contenu : c === SONDE ? Buffer.from('rien\n') : octets(c);
        const refus = refusDe(() => chargerSources(perimetre, lire));
        const nomme =
          refus instanceof SourceIllisible &&
          refus.message.includes(cible) &&
          refus.message.includes('NUL');
        if (!nomme)
          acceptes.push(
            `${cible} (${n === 0 ? 'UTF-16' : 'NUL après 64 000 octets'}) : ${refus?.message ?? 'aucun refus'}`
          );
      }
    }
    expect(
      acceptes,
      'un fichier suivi porteur d’un octet NUL n’a pas fait refuser en se nommant'
    ).toEqual([]);
  });

  it('un chemin suivi qui est un RÉPERTOIRE (sous-module) est refusé en se nommant, pas sur une erreur brute', () => {
    const suivis = [...fichiersSuivis(), 'tests/unit'];
    expect(() => chargerSources(suivis)).toThrow(SourceIllisible);
    expect(() => chargerSources(suivis)).toThrow(/tests\/unit/);
  });
});

describe('REQ-GOV-021 — la garde est CÂBLÉE', () => {
  it('`gov:attributions` et sa preuve existent, sont dans la chaîne `gov:partiel` et dans la CI', () => {
    const pkg = JSON.parse(lireReel('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['gov:attributions']).toBe('tsx scripts/gates/gov-attributions.ts');
    expect(pkg.scripts['gov:attributions:prove']).toBe(
      'tsx scripts/gates/gov-attributions.ts --prove'
    );
    expect(pkg.scripts['gov:partiel']).toContain('pnpm gov:attributions');
    const ci = lireReel('.github/workflows/ci.yml');
    expect(ci, 'la garde n’est pas câblée en Gate A').toContain('pnpm gov:attributions');
    expect(
      ci,
      'la PREUVE n’est pas câblée : une garde dont on ne vérifie pas qu’elle sait rougir cesse un jour de garder'
    ).toContain('pnpm gov:attributions:prove');
  });
});
