// @req REQ-UX-002
// @req REQ-UX-003
// @req REQ-UX-019
/**
 * `vocabulaire-et-micro-copy.spec.ts` — la micro-copie de l'espace a UNE source (UX-P0-01).
 *
 * CE QU'IL EXERCE, ET DANS QUEL SENS.
 *   1. REQ-UX-002 — l'enum `IssueDepot` est lu CONTRE le registre : la liste attendue se lit dans
 *      le texte de REQ-UX-002 (`docs/requirements.json`), jamais retapée ici. Chaque issue a un
 *      titre, un « pourquoi », un « quoi faire » et une mention d'horodatage ; chaque refus porte
 *      la phrase « aucune autre conséquence » et le lien de contestation écrite, sans révéler ni
 *      qui ni quand. Les refus sont exactement ceux que REQ-SEC-022 nomme.
 *   2. REQ-UX-019 — chaque écran de l'espace (carte `docs/ESPACE-ROUTES.md`) et de la console
 *      (section Console de `docs/maquettes/VALIDATION.md`) a un état vide déclaré ; celui de
 *      « Mes entreprises » mène au dépôt.
 *   3. REQ-UX-003 — les mots que l'exigence refuse sont lus au registre et doivent être couverts
 *      par la SSOT du lexique ; la micro-copie de l'espace est dans le périmètre de `gov:lexique`
 *      à la portée la plus stricte, et un mot refusé qu'on y glisse la fait rougir.
 *   4. Le TÉMOIN À DEUX FACES de la garde `ux-exhaustivite` : chaque panne injectée rougit en
 *      NOMMANT sa cible ; le dépôt réel sort en zéro avec ses comptes.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  ISSUES_DEPOT,
  ISSUES_DE_REFUS,
  HORODATAGE_DE_L_ISSUE,
  estUnRefus,
  type IssueDepot,
} from '../../../src/domain/depot/issue-depot';
import {
  TEXTES_DES_ISSUES,
  MENTION_DU_REFUS,
  CONTESTATION_ECRITE,
  issueRendue,
} from '../../../src/content/micro-copy/espace/issues-depot';
import { ETATS_VIDES_ESPACE } from '../../../src/content/micro-copy/espace/etats-vides';
import { ETATS_VIDES_CONSOLE } from '../../../src/content/micro-copy/console/etats-vides';
import {
  controler,
  vueDuDepot,
  issuesDuContrat,
  motifsDeRefus,
  ecransDeLEspace,
  ecransDeLaConsole,
  libellesEnDur,
  ECRAN_MES_ENTREPRISES,
  ROUTE_DU_DEPOT,
  type Vue,
} from '../../../scripts/gates/ux-exhaustivite';
import {
  controler as controlerLexique,
  porteeDuFichier,
  motifDeLaForme,
  vueDeFixture,
  vueDuDepot as vueLexiqueDuDepot,
} from '../../../scripts/gates/lexique-apporteurs';
import { toutesLesFormes } from '../../../src/domain/lexique/lexique-interdit';

const SCRIPT = 'scripts/gates/ux-exhaustivite.ts';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

type Registre = { exigences: { id: string; texte: string }[] };
function texteDe(id: string): string {
  const registre = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as Registre;
  const e = registre.exigences.find((x) => x.id === id);
  if (!e) throw new Error(`${id} est absente du registre : le test ne sait plus à quoi comparer.`);
  return e.texte;
}

/** Les familles rougies par une vue — l'unité de mesure des témoins. */
const familles = (vue: Vue): string[] => controler(vue).fautes.map((f) => f.famille);
const messages = (vue: Vue): string =>
  controler(vue)
    .fautes.map((f) => f.message)
    .join('\n');

/** Un paramètre `{…}` dans un texte : c'est ainsi qu'un nom ou une date entrent à l'écran. */
const PARAMETRE = /\{[^}]*\}/;

// ── 1. REQ-UX-002 : chaque issue d'un dépôt ─────────────────────────────────────

describe('REQ-UX-002 — chaque issue du dépôt dit quoi, pourquoi, quoi faire et l’horodatage', () => {
  it('REQ-UX-002 : l’enum IssueDepot est celui du registre, un pour un, lu et non retapé', () => {
    const attendues = issuesDuContrat(texteDe('REQ-UX-002'));
    // Une lecture qui ne rend rien n'est pas « rien à comparer » : c'est une source illisible.
    expect(attendues.length).toBeGreaterThanOrEqual(12);
    expect([...ISSUES_DEPOT].sort()).toEqual([...attendues].sort());
  });

  it('REQ-UX-002 : chaque issue a un titre, un pourquoi, un quoi faire et une mention d’horodatage', () => {
    for (const issue of ISSUES_DEPOT) {
      const r = issueRendue(issue);
      for (const champ of [r.pastille, r.titre, r.pourquoi, r.quoiFaire, r.horodatage]) {
        expect([issue, champ.trim().length > 0]).toEqual([issue, true]);
      }
      expect([issue, r.actionPrincipale.libelle.trim().length > 0]).toEqual([issue, true]);
    }
  });

  it('REQ-UX-002 : l’horodatage à son nom n’est annoncé que pour les issues qui l’emportent', () => {
    const aSonNom = ISSUES_DEPOT.filter((i) => HORODATAGE_DE_L_ISSUE[i] === 'a_votre_nom');
    expect([...aSonNom].sort()).toEqual(['en_attente', 'enregistree', 'prioritaire']);
    for (const i of ISSUES_DEPOT) {
      const dit = issueRendue(i).horodatage;
      expect([i, /^Enregistré à votre nom/.test(dit)]).toEqual([i, aSonNom.includes(i)]);
    }
    // REQ-UX-013 : la phrase exacte du brouillon, lue au registre.
    expect(texteDe('REQ-UX-013')).toContain(
      issueRendue('brouillon_hors_ligne').horodatage.replace(/\.$/, '')
    );
  });

  it('REQ-UX-002 : les refus sont exactement les issues que REQ-SEC-022 nomme', () => {
    const motifs = motifsDeRefus(texteDe('REQ-SEC-022'));
    expect(motifs.length).toBeGreaterThanOrEqual(7);
    const attendus = ISSUES_DEPOT.filter((i) => motifs.includes(i));
    expect([...ISSUES_DE_REFUS].sort()).toEqual([...attendus].sort());
    for (const i of ISSUES_DEPOT) expect([i, estUnRefus(i)]).toEqual([i, attendus.includes(i)]);
  });

  it('REQ-UX-002 : chaque refus porte « aucune autre conséquence », la contestation, et ni qui ni quand', () => {
    expect(MENTION_DU_REFUS).toContain('aucune autre conséquence');
    expect(MENTION_DU_REFUS).toContain("n'est pas un manquement");
    expect(CONTESTATION_ECRITE.libelle).toMatch(/Contester ce refus par écrit/);
    for (const i of ISSUES_DE_REFUS) {
      const r = issueRendue(i);
      expect([i, r.refus?.mention]).toEqual([i, MENTION_DU_REFUS]);
      expect([i, r.refus?.contestation]).toEqual([i, CONTESTATION_ECRITE]);
      const tout = [r.pastille, r.titre, r.pourquoi, r.quoiFaire, r.horodatage].join(' ');
      expect([i, PARAMETRE.test(tout)]).toEqual([i, false]);
    }
    for (const i of ISSUES_DEPOT.filter((x) => !estUnRefus(x))) {
      expect([i, issueRendue(i).refus]).toEqual([i, null]);
    }
  });

  it('REQ-UX-002 : les deux antériorités ont le libellé unique « déjà connue de la Société »', () => {
    expect(texteDe('REQ-UX-002')).toContain('« déjà connue de la Société »');
    expect(TEXTES_DES_ISSUES.anteriorite_client).toBe(TEXTES_DES_ISSUES.anteriorite_devis);
    expect(TEXTES_DES_ISSUES.anteriorite_client.titre).toContain('déjà connue de la Société');
  });

  it('REQ-UX-002 : aucun libellé ne porte de date, d’UUID ni d’adresse — seulement des paramètres', () => {
    const DATE =
      /\b\d{1,2}(er)?\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\b/i;
    const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
    const COURRIEL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
    for (const i of ISSUES_DEPOT) {
      const r = issueRendue(i);
      const tout = [r.pastille, r.titre, r.pourquoi, r.quoiFaire, r.horodatage].join(' ');
      for (const motif of [DATE, UUID, COURRIEL]) expect([i, motif.test(tout)]).toEqual([i, false]);
    }
  });

  it('REQ-UX-002 : une valeur ajoutée à l’enum sans son texte fait rougir la garde, qui la NOMME', () => {
    const base = vueDuDepot();
    const vue: Vue = { ...base, issuesDeLEnum: [...base.issuesDeLEnum, 'issue_temoin'] };
    expect(familles(vue)).toContain('issue_sans_texte');
    expect(messages(vue)).toContain('issue_temoin');
  });

  it('REQ-UX-002 : une valeur sans base contractuelle fait rougir la garde, qui la NOMME', () => {
    const base = vueDuDepot();
    const vue: Vue = {
      ...base,
      issuesDeLEnum: [...base.issuesDeLEnum, 'fermee'],
      textesDesIssues: { ...base.textesDesIssues, fermee: TEXTES_DES_ISSUES.gele },
      horodatages: { ...base.horodatages, fermee: 'rien_a_votre_nom' },
    };
    expect(familles(vue)).toEqual(['issue_sans_base_contractuelle']);
    expect(messages(vue)).toContain('fermee');
  });

  it('REQ-UX-002 : une issue ajoutée au contrat sans valeur ni texte fait rougir la garde', () => {
    const base = vueDuDepot();
    const vue: Vue = { ...base, issuesDuContrat: [...base.issuesDuContrat, 'insincerite'] };
    expect(familles(vue)).toContain('issue_du_contrat_sans_valeur');
    expect(messages(vue)).toContain('insincerite');
  });

  it('REQ-UX-002 : un refus qui révèle qui ou quand fait rougir la garde', () => {
    const base = vueDuDepot();
    const bavard = {
      ...TEXTES_DES_ISSUES.file_complete,
      pourquoi: 'Déposée par {autreApporteur} le {dateDepot}.',
    };
    const vue: Vue = {
      ...base,
      textesDesIssues: { ...base.textesDesIssues, file_complete: bavard },
    };
    expect(familles(vue)).toEqual(['refus_incomplet']);
    expect(messages(vue)).toContain('file_complete');
  });

  it('REQ-UX-002 : un refus déclaré à tort (ou oublié) fait rougir la garde', () => {
    const base = vueDuDepot();
    const vue: Vue = { ...base, refusDeclares: [...base.refusDeclares, 'gele'] };
    expect(familles(vue)).toContain('refus_mal_declare');
    expect(messages(vue)).toContain('gele');
  });
});

// ── 2. REQ-UX-019 : un état vide par écran ──────────────────────────────────────

describe('REQ-UX-019 — chaque écran de l’espace et de la console a un état vide déclaré', () => {
  const routes = ecransDeLEspace(readFileSync('docs/ESPACE-ROUTES.md', 'utf8'));
  const consoleLue = ecransDeLaConsole(readFileSync('docs/maquettes/VALIDATION.md', 'utf8'));

  it('REQ-UX-019 : la carte des routes et la section Console se lisent (aucun périmètre vide)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(13);
    expect(routes).toContain(ECRAN_MES_ENTREPRISES);
    expect(routes).toContain(ROUTE_DU_DEPOT);
    expect(consoleLue.length).toBeGreaterThanOrEqual(2);
  });

  it('REQ-UX-019 : chaque écran de l’espace a un titre, une phrase et une action principale', () => {
    expect(Object.keys(ETATS_VIDES_ESPACE).sort()).toEqual([...routes].sort());
    for (const r of routes) {
      const e = ETATS_VIDES_ESPACE[r]!;
      for (const champ of [e.titre, e.phrase, e.action.libelle]) {
        expect([r, champ.trim().length > 0]).toEqual([r, true]);
      }
    }
  });

  it('REQ-UX-019 : chaque écran de la console a un titre, une phrase et une action principale', () => {
    expect(Object.keys(ETATS_VIDES_CONSOLE).sort()).toEqual([...consoleLue].sort());
    for (const c of consoleLue) {
      const e = ETATS_VIDES_CONSOLE[c]!;
      for (const champ of [e.titre, e.phrase, e.action.libelle]) {
        expect([c, champ.trim().length > 0]).toEqual([c, true]);
      }
    }
  });

  it('REQ-UX-019 : l’état vide de « Mes entreprises » mène au premier dépôt', () => {
    expect(ETATS_VIDES_ESPACE[ECRAN_MES_ENTREPRISES]!.action.route).toBe(ROUTE_DU_DEPOT);
    const base = vueDuDepot();
    const detourne = {
      ...base.etatsVidesEspace[ECRAN_MES_ENTREPRISES]!,
      action: { libelle: 'Retour à l’accueil', route: '/' },
    };
    const vue: Vue = {
      ...base,
      etatsVidesEspace: { ...base.etatsVidesEspace, [ECRAN_MES_ENTREPRISES]: detourne },
    };
    expect(familles(vue)).toEqual(['premier_depot_non_guide']);
  });

  it('REQ-UX-019 : un écran sans état vide déclaré fait rougir la garde, qui le NOMME', () => {
    const base = vueDuDepot();
    const vue: Vue = { ...base, ecransEspace: [...base.ecransEspace, '/ecran-temoin'] };
    expect(familles(vue)).toEqual(['ecran_sans_etat_vide']);
    expect(messages(vue)).toContain('/ecran-temoin');
    const vue2: Vue = { ...base, ecransConsole: [...base.ecransConsole, 'console-temoin'] };
    expect(familles(vue2)).toEqual(['ecran_sans_etat_vide']);
    expect(messages(vue2)).toContain('console-temoin');
  });

  it('REQ-UX-019 : une action qui mène à une route inconnue de la carte fait rougir la garde', () => {
    const base = vueDuDepot();
    const perdu = {
      ...base.etatsVidesEspace['/aide']!,
      action: { libelle: 'Écrire à Axion-IA', route: '/route-inexistante' },
    };
    const vue: Vue = { ...base, etatsVidesEspace: { ...base.etatsVidesEspace, '/aide': perdu } };
    expect(familles(vue)).toEqual(['action_vers_route_inconnue']);
    expect(messages(vue)).toContain('/route-inexistante');
  });
});

// ── 3. aucun libellé en dur dans un composant ───────────────────────────────────

describe('REQ-UX-019 — un libellé vit dans la micro-copie, jamais en dur dans un composant', () => {
  const TEMOIN = 'src/app/(espace)/temoin/page.tsx';

  it('REQ-UX-019 : un texte en dur, un attribut texte et une chaîne JSX rougissent, nommés', () => {
    const contenu = [
      "import { ETATS_VIDES_ESPACE } from '@/content/micro-copy/espace/etats-vides';",
      'export default function Page() {',
      '  return (',
      '    <main aria-label="Mes entreprises">',
      '      <h1>Vos entreprises apparaîtront ici</h1>',
      "      <p>{'Rien à faire de votre côté'}</p>",
      '    </main>',
      '  );',
      '}',
    ].join('\n');
    const fautes = libellesEnDur(TEMOIN, contenu);
    expect(fautes.map((f) => f.ligne)).toEqual([4, 5, 6]);
    for (const f of fautes) expect(f.message).toContain(TEMOIN);

    const base = vueDuDepot();
    const vue: Vue = { ...base, composants: [{ chemin: TEMOIN, contenu }] };
    expect([...new Set(familles(vue))]).toEqual(['libelle_en_dur']);
    expect(messages(vue)).toContain(`${TEMOIN}:5`);
  });

  it('REQ-UX-019 : un composant qui lit la micro-copie et n’écrit que de la ponctuation reste vert', () => {
    const contenu = [
      "import { ETATS_VIDES_ESPACE } from '@/content/micro-copy/espace/etats-vides';",
      'export default function Page() {',
      "  const e = ETATS_VIDES_ESPACE['/mes-entreprises']!;",
      '  return (',
      '    <main aria-label={e.titre} className="pile">',
      '      <h1>{e.titre}</h1>',
      '      <p>',
      '        {e.phrase} · —',
      '      </p>',
      '    </main>',
      '  );',
      '}',
    ].join('\n');
    expect(libellesEnDur(TEMOIN, contenu)).toEqual([]);
  });
});

// ── 4. REQ-UX-003 : les mots refusés, importés de la SSOT du lexique ────────────

describe('REQ-UX-003 — aucun texte vu par un apporteur ne porte les mots refusés', () => {
  /** Les termes que REQ-UX-003 met entre guillemets — lus au registre, jamais retapés. */
  const termes = [...texteDe('REQ-UX-003').matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1]!);
  const couvert = (terme: string): boolean =>
    toutesLesFormes().some((forme) => motifDeLaForme(forme).test(terme));

  it('REQ-UX-003 : les mots de l’exigence sont tous couverts par la SSOT du lexique', () => {
    expect(termes.length).toBeGreaterThanOrEqual(6);
    for (const t of termes) expect([t, couvert(t)]).toEqual([t, true]);
  });

  it('REQ-UX-003 : la micro-copie de l’espace est jugée à la portée la plus stricte, la console non', () => {
    expect(porteeDuFichier('src/content/micro-copy/espace/issues-depot.ts')).toBe('apporteur');
    expect(porteeDuFichier('src/content/micro-copy/espace/etats-vides.ts')).toBe('apporteur');
    expect(porteeDuFichier('src/content/micro-copy/console/etats-vides.ts')).toBe('depot');
  });

  it('REQ-UX-003 : la micro-copie réelle de l’espace est lue par gov:lexique et n’y rougit pas', () => {
    const vue = vueLexiqueDuDepot();
    const lus = vue.fichiers
      .map((f) => f.chemin)
      .filter((c) => c.startsWith('src/content/micro-copy/'));
    expect(lus).toEqual(
      expect.arrayContaining([
        'src/content/micro-copy/espace/issues-depot.ts',
        'src/content/micro-copy/espace/etats-vides.ts',
        'src/content/micro-copy/espace/vocabulaire.ts',
        'src/content/micro-copy/console/etats-vides.ts',
      ])
    );
    const fautes = controlerLexique(vue).fautes.filter((f) =>
      f.message.startsWith('src/content/micro-copy/')
    );
    expect(fautes.map((f) => f.message)).toEqual([]);
  });

  it('REQ-UX-003 : chaque mot de l’exigence, glissé dans la micro-copie de l’espace, fait rougir', () => {
    for (const t of termes) {
      const vue = vueDeFixture([
        {
          chemin: 'src/content/micro-copy/espace/issues-depot.ts',
          contenu: `  titre: 'Votre ${t} est enregistrée',`,
        },
      ]);
      expect([t, controlerLexique(vue).fautes.length > 0]).toEqual([t, true]);
    }
  });

  it('REQ-UX-003 : les mots écartés par la relecture juridique (faute, équipes) rougissent aussi', () => {
    for (const phrase of [
      'Arrêtée faute de suite',
      'une entreprise qui pourrait former ses équipes',
    ]) {
      const vue = vueDeFixture([
        {
          chemin: 'src/content/micro-copy/espace/etats-vides.ts',
          contenu: `  phrase: '${phrase}',`,
        },
      ]);
      expect([phrase, controlerLexique(vue).fautes.length > 0]).toEqual([phrase, true]);
    }
  });
});

// ── 5. l'acceptation : la garde lancée comme la CI la lance ────────────────────

describe('la garde ux-exhaustivite, lancée comme la CI la lance (REQ-UX-002, REQ-UX-019)', () => {
  it('REQ-UX-002 REQ-UX-019 : sur le dépôt réel, elle sort en zéro avec les comptes confrontés', () => {
    const { code, sortie } = lancer();
    expect([code, sortie]).toEqual([0, expect.stringContaining('✅ ux:exhaustivite')]);
    expect(sortie).toMatch(new RegExp(`${ISSUES_DEPOT.length} issue\\(s\\)`));
    const ecrans = Object.keys(ETATS_VIDES_ESPACE).length + Object.keys(ETATS_VIDES_CONSOLE).length;
    expect(sortie).toMatch(new RegExp(`${ecrans} écran\\(s\\)`));
    expect(sortie).toMatch(/\d+ composant\(s\) \.tsx confronté\(s\)/);
  });

  it('REQ-UX-002 REQ-UX-019 : --prove fait rougir chaque famille sur son témoin', () => {
    const { code, sortie } = lancer('--prove');
    expect([code, sortie]).toEqual([0, expect.stringContaining('preuve faite')]);
  });

  it('REQ-UX-002 : le type IssueDepot est dérivé de la constante, jamais retapé', () => {
    const i: IssueDepot = ISSUES_DEPOT[0];
    expect(ISSUES_DEPOT).toContain(i);
  });
});
