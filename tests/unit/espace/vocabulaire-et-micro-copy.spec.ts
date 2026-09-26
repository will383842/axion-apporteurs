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
import { readFileSync, readdirSync } from 'node:fs';
import { FORMULES } from '../../../src/content/micro-copy/espace/vocabulaire';
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
  textesDeLEspace,
  parametre,
  parametresDe,
  SOURCES_DU_DEPOT,
  PARAMETRES_PERMIS,
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

/** Ce qu'un libellé ne doit jamais écrire en clair — UNE définition pour tout le fichier. */
const DATE_LITTERALE =
  /\b\d{1,2}(er)?\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\b/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const COURRIEL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

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
      expect([i, parametresDe(tout)]).toEqual([i, []]);
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
    for (const i of ISSUES_DEPOT) {
      const r = issueRendue(i);
      const tout = [r.pastille, r.titre, r.pourquoi, r.quoiFaire, r.horodatage].join(' ');
      for (const motif of [DATE_LITTERALE, UUID, COURRIEL])
        expect([i, motif.test(tout)]).toEqual([i, false]);
    }
  });

  it('REQ-UX-002 : une valeur ajoutée à l’enum sans son texte fait rougir la garde, qui la NOMME', () => {
    // Le témoin ne diffère de la référence QUE par le texte absent : l'issue est au contrat et a
    // son horodatage — sans quoi il rougirait pour une autre raison et ne prouverait rien du texte.
    const base = vueDuDepot();
    const vue: Vue = {
      ...base,
      issuesDeLEnum: [...base.issuesDeLEnum, 'issue_temoin'],
      issuesDuContrat: [...base.issuesDuContrat, 'issue_temoin'],
      horodatages: { ...base.horodatages, issue_temoin: 'rien_a_votre_nom' },
    };
    expect(familles(vue)).toEqual(['issue_sans_texte']);
    expect(messages(vue)).toContain('IssueDepot.issue_temoin — il lui manque tout son texte');
  });

  it('REQ-UX-002 REQ-UX-019 : la garde lit le registre et la carte, jamais la micro-copie qu’elle contrôle', () => {
    // Des sources injectées qui diffèrent du dépôt d'UNE issue au contrat et d'UN écran à la carte :
    // une vue qui lirait sa population dans la micro-copie (ou dans l'enum) ne les verrait pas.
    const registre = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as Registre;
    for (const e of registre.exigences) {
      if (e.id === 'REQ-UX-002')
        e.texte = e.texte.replace('`gele`,', '`gele`, `issue_du_registre`,');
    }
    const carte = `${readFileSync('docs/ESPACE-ROUTES.md', 'utf8')}\n| \`/ecran-de-la-carte\` | témoin |\n`;
    const lire = (chemin: string): string =>
      chemin === 'docs/requirements.json'
        ? JSON.stringify(registre)
        : chemin === 'docs/ESPACE-ROUTES.md'
          ? carte
          : readFileSync(chemin, 'utf8');
    const vue = vueDuDepot({ ...SOURCES_DU_DEPOT, lire });
    expect([...new Set(familles(vue))].sort()).toEqual([
      'ecran_sans_etat_vide',
      'issue_du_contrat_sans_valeur',
    ]);
    expect(messages(vue)).toContain('issue_du_registre');
    expect(messages(vue)).toContain('/ecran-de-la-carte');
  });

  it('REQ-UX-002 : la garde lit les fichiers SUIVIS et les composants, jamais une liste vide en silence', () => {
    // Un fichier de micro-copie suivi neuf et un composant .tsx suivi, fabriqués : une vue qui ne
    // lirait pas les fichiers suivis (ou pas les composants) ne rougirait ni sur l'un ni sur l'autre.
    const neuf = 'src/content/micro-copy/espace/nouvel-ecran.ts';
    const composant = 'src/app/(espace)/sentinelle/page.tsx';
    const vue = vueDuDepot({
      lire: (chemin) =>
        chemin === composant
          ? 'export const P = ({ t }: { t: string }) => <p dangerouslySetInnerHTML={{ __html: t }} />;'
          : SOURCES_DU_DEPOT.lire(chemin),
      suivis: () => [...SOURCES_DU_DEPOT.suivis(), neuf, composant],
    });
    expect([...new Set(familles(vue))].sort()).toEqual(['html_brut', 'micro_copie_non_lue']);
    expect(messages(vue)).toContain(neuf);
    expect(messages(vue)).toContain(`${composant}:1`);
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

// ── 1 bis. REQ-UX-002 : ni qui ni quand, dans TOUS les textes de l'espace ───────

/**
 * Pose `valeur` au bout de `chemin` dans la micro-copie de l'espace que la vue porte — une COPIE :
 * la source n'est jamais touchée. C'est ainsi qu'on injecte un texte piégé là où un écran le lirait.
 */
function avecTexte(base: Vue, fichier: string, chemin: readonly string[], valeur: string): Vue {
  const poser = (o: unknown, reste: readonly string[]): Record<string, unknown> => {
    const copie: Record<string, unknown> = { ...(o ?? {}) };
    const [tete, ...suite] = reste;
    copie[tete!] = suite.length === 0 ? valeur : poser(copie[tete!], suite);
    return copie;
  };
  return { ...base, microCopieEspace: poser(base.microCopieEspace, [fichier, ...chemin]) };
}

describe('REQ-UX-002 — un texte de l’espace ne porte que les paramètres que son contexte permet', () => {
  it('REQ-UX-002 : la collision au dépôt (en_attente) qui nomme et date l’autre apporteur rougit', () => {
    const vue = avecTexte(
      vueDuDepot(),
      'espace/issues-depot.ts',
      ['TEXTES_DES_ISSUES', 'en_attente', 'pourquoi'],
      'Cette entreprise est déjà réservée par {nomAutreApporteur} depuis le {dateDepotAutre}.'
    );
    expect(familles(vue)).toContain('parametre_non_permis');
    expect(messages(vue)).toContain('en_attente');
    expect(messages(vue)).toContain('{nomAutreApporteur}');
    expect(messages(vue)).toContain('{dateDepotAutre}');
  });

  it('REQ-UX-002 : un libellé d’ACTION qui nomme l’autre apporteur rougit aussi', () => {
    const vue = avecTexte(
      vueDuDepot(),
      'espace/issues-depot.ts',
      ['TEXTES_DES_ISSUES', 'etablissement_cesse', 'actionSecondaire', 'libelle'],
      'Voir le dépôt de {autreApporteur}'
    );
    expect(familles(vue)).toContain('parametre_non_permis');
    expect(messages(vue)).toContain('etablissement_cesse › actionSecondaire › libelle');
    expect(messages(vue)).toContain('{autreApporteur}');
  });

  it('REQ-UX-002 : la saisie reflétée {recherche} n’est permise que sur l’écran de recherche', () => {
    const vue = avecTexte(
      vueDuDepot(),
      'espace/etats-vides.ts',
      ['ETATS_VIDES_ESPACE', '/aide', 'phrase'],
      'Vous avez cherché « {recherche} ».'
    );
    expect(familles(vue)).toEqual(['parametre_non_permis']);
    expect(messages(vue)).toContain('/aide');
  });

  /**
   * Un contexte ÉTRANGER par fichier, choisi ici et non dérivé de la liste blanche : un paramètre
   * permis ailleurs dans le même fichier doit y rougir. Élargir une entrée au fichier entier le
   * laisserait passer. Un fichier nouveau dans la liste blanche fait échouer ce test.
   */
  const CONTEXTE_ETRANGER: Readonly<Record<string, readonly string[]>> = {
    'espace/issues-depot.ts': ['TEXTES_DES_ISSUES', 'opposition_demarchage', 'quoiFaire'],
    'espace/etats-vides.ts': ['ETATS_VIDES_ESPACE', '/plus', 'phrase'],
    'espace/vocabulaire.ts': ['FORMULES', 'sansSuite'],
  };

  it('REQ-UX-002 : chaque paramètre permis rougit HORS de son contexte, dans le même fichier', () => {
    const entrees = Object.entries(PARAMETRES_PERMIS).flatMap(([cle, noms]) =>
      noms.map((nom) => [cle, nom] as const)
    );
    expect(entrees.length).toBeGreaterThanOrEqual(11);
    for (const [cle, nom] of entrees) {
      const fichier = cle.split(' › ')[0]!;
      const etranger = CONTEXTE_ETRANGER[fichier];
      expect([cle, etranger !== undefined]).toEqual([cle, true]);
      const vue = avecTexte(vueDuDepot(), fichier, etranger!, `Texte témoin {${nom}}.`);
      expect([cle, nom, familles(vue)]).toEqual([cle, nom, ['parametre_non_permis']]);
      expect([cle, nom, messages(vue).includes(`{${nom}}`)]).toEqual([cle, nom, true]);
    }
  });

  it('REQ-UX-002 : texte_calcule — un littéral qui écrit un texte dans une fonction rougit', () => {
    const base = vueDuDepot();
    const vocabulaire = 'src/content/micro-copy/espace/vocabulaire.ts';
    const vue: Vue = {
      ...base,
      sourcesMicroCopie: [
        ...base.sourcesMicroCopie.filter((f) => f.chemin !== vocabulaire),
        {
          chemin: vocabulaire,
          contenu: "function reservee(): string {\n  return 'Déjà réservée';\n}\n",
        },
      ],
    };
    expect(familles(vue)).toEqual(['texte_calcule']);
    expect(messages(vue)).toContain(
      `${vocabulaire}:2 — le littéral « Déjà réservée » dans la fonction reservee`
    );
  });

  it('REQ-UX-002 : texte_calcule — une concaténation dans une fonction hors liste blanche rougit', () => {
    const base = vueDuDepot();
    const vocabulaire = 'src/content/micro-copy/espace/vocabulaire.ts';
    const vue: Vue = {
      ...base,
      sourcesMicroCopie: [
        ...base.sourcesMicroCopie.filter((f) => f.chemin !== vocabulaire),
        {
          chemin: vocabulaire,
          contenu: 'const aide = (nom: string): string => FORMULES.dejaReservee + nom;\n',
        },
      ],
    };
    expect(familles(vue)).toEqual(['texte_calcule']);
    expect(messages(vue)).toContain(`${vocabulaire}:1 — une concaténation dans la fonction aide`);
  });

  it('REQ-UX-002 : contre-témoin — la date de fin, seule permise à la collision (REQ-SEC-022), reste verte', () => {
    const vue = avecTexte(
      vueDuDepot(),
      'espace/issues-depot.ts',
      ['TEXTES_DES_ISSUES', 'en_attente', 'pourquoi'],
      'Cette entreprise est déjà réservée pour un autre apporteur jusqu’au {dateFin}.'
    );
    expect(familles(vue)).toEqual([]);
    expect(familles(vueDuDepot())).toEqual([]);
  });

  it('REQ-UX-002 : un délai écrit en clair à la place de son paramètre rougit (RM-10)', () => {
    const vue = avecTexte(
      vueDuDepot(),
      'espace/etats-vides.ts',
      ['ETATS_VIDES_ESPACE', '/aide', 'phrase'],
      'Vous pouvez écrire à Axion-IA quand vous le souhaitez. Axion-IA vous répond sous 48 heures.'
    );
    expect(familles(vue)).toEqual(['valeur_en_clair']);
    expect(messages(vue)).toContain('/aide');
    expect(messages(vue)).toContain('« 48 »');
  });

  it('REQ-UX-002 : un fichier de micro-copie de l’espace que la garde ne lit pas rougit, nommé', () => {
    const base = vueDuDepot();
    const nouveau = 'src/content/micro-copy/espace/nouvel-ecran.ts';
    const vue: Vue = { ...base, fichiersDeMicroCopie: [...base.fichiersDeMicroCopie, nouveau] };
    expect(familles(vue)).toEqual(['micro_copie_non_lue']);
    expect(messages(vue)).toContain(nouveau);
  });

  it('REQ-UX-002 : un texte injecté en HTML brut dans un composant rougit — la saisie reste un nœud texte', () => {
    const chemin = 'src/app/(espace)/entreprise/page.tsx';
    const contenu = [
      "import { ETATS_VIDES_ESPACE } from '@/content/micro-copy/espace/etats-vides';",
      "const e = ETATS_VIDES_ESPACE['/entreprise?q=']!;",
      'export const P = () => <p dangerouslySetInnerHTML={{ __html: e.phrase }} />;',
    ].join('\n');
    const vue: Vue = { ...vueDuDepot(), composants: [{ chemin, contenu }] };
    expect(familles(vue)).toEqual(['html_brut']);
    expect(messages(vue)).toContain(`${chemin}:3`);
  });

  // Le veto 5321319865 : un texte de l'espace qui n'est pas une chaîne échappait à la garde.
  const COLLISION =
    'export const collision = (nom: string, depuis: string): string =>\n' +
    '  `Déjà réservée par ${nom} depuis le ${depuis}`;\n';

  it('REQ-UX-002 : une fonction exportée collision(nom, depuis) rougit, à l’exécution et dans le source', () => {
    const base = vueDuDepot();
    const vocabulaire = 'src/content/micro-copy/espace/vocabulaire.ts';
    const vue: Vue = {
      ...base,
      microCopieEspace: {
        ...base.microCopieEspace,
        'espace/vocabulaire.ts': {
          ...(base.microCopieEspace['espace/vocabulaire.ts'] as object),
          collision: (nom: string, depuis: string): string =>
            `Déjà réservée par ${nom} depuis le ${depuis}`,
        },
      },
      sourcesMicroCopie: [
        ...(base.sourcesMicroCopie ?? []).filter((f) => f.chemin !== vocabulaire),
        { chemin: vocabulaire, contenu: COLLISION },
      ],
    };
    expect([...new Set(familles(vue))].sort()).toEqual(['export_non_texte', 'texte_calcule']);
    expect(messages(vue)).toContain('espace/vocabulaire.ts › collision');
    expect(messages(vue)).toContain(`${vocabulaire}:2`);
  });

  it('REQ-UX-002 : une Map exportée rougit — la garde ne sait pas la lire comme un texte', () => {
    const base = vueDuDepot();
    const vue: Vue = {
      ...base,
      microCopieEspace: {
        ...base.microCopieEspace,
        'espace/vocabulaire.ts': {
          ...(base.microCopieEspace['espace/vocabulaire.ts'] as object),
          PAR_ISSUE: new Map([['en_attente', 'Déjà réservée par {nomAutreApporteur}']]),
        },
      },
    };
    expect(familles(vue)).toEqual(['export_non_texte']);
    expect(messages(vue)).toContain('espace/vocabulaire.ts › PAR_ISSUE');
  });

  it('REQ-UX-002 : un paramètre écrit dans une CLÉ d’objet rougit', () => {
    const base = vueDuDepot();
    const vue: Vue = {
      ...base,
      microCopieEspace: {
        ...base.microCopieEspace,
        'espace/vocabulaire.ts': {
          ...(base.microCopieEspace['espace/vocabulaire.ts'] as object),
          PAR_NOM: { 'Réservée par {nomAutreApporteur}': 'Voir' },
        },
      },
    };
    expect(familles(vue)).toEqual(['parametre_non_permis']);
    expect(messages(vue)).toContain('{nomAutreApporteur}');
  });

  it('REQ-UX-002 : un module de micro-copie HORS espace/, ni parcouru ni déclaré, rougit', () => {
    const base = vueDuDepot();
    const commun = 'src/content/micro-copy/commun/libelles.ts';
    const vue: Vue = { ...base, fichiersDeMicroCopie: [...base.fichiersDeMicroCopie, commun] };
    expect(familles(vue)).toEqual(['micro_copie_non_lue']);
    expect(messages(vue)).toContain(commun);
  });

  it('REQ-UX-002 : contre-témoin — les deux utilitaires de la liste blanche et les textes actuels restent verts', () => {
    const base = vueDuDepot();
    expect(familles(base)).toEqual([]);
    const lus = (base.sourcesMicroCopie ?? []).map((f) => f.chemin);
    expect(lus).toEqual(
      expect.arrayContaining([
        'src/content/micro-copy/espace/vocabulaire.ts',
        'src/content/micro-copy/espace/issues-depot.ts',
      ])
    );
  });

  it('REQ-UX-002 : HTML brut par une prop étalée ou par createElement rougit aussi', () => {
    const chemin = 'src/app/(espace)/entreprise/page.tsx';
    const contenu = [
      "import { createElement } from 'react';",
      'const brut = (t: string) => ({ dangerouslySetInnerHTML: { __html: t } });',
      'export const P = ({ t }: { t: string }) => <p {...brut(t)} />;',
      "export const Q = ({ t }: { t: string }) => createElement('p', { ['dangerouslySetInnerHTML']: { __html: t } });",
    ].join('\n');
    const vue: Vue = { ...vueDuDepot(), composants: [{ chemin, contenu }] };
    expect([...new Set(familles(vue))]).toEqual(['html_brut']);
    expect(messages(vue)).toContain(`${chemin}:2`);
    expect(messages(vue)).toContain(`${chemin}:4`);
  });
});

// ── 1 ter. REQ-UX-002 : le snapshot des libellés, sans date, sans nom, sans UUID ─

/** Les marques et les noms d'écran qui portent une capitale en milieu de phrase — rien d'autre. */
const CAPITALES_ADMISES = new Set(['Axion-IA', 'Société', 'OPCO', 'RIB', 'Mes']);
/**
 * Ce qu'un libellé du snapshot révèle et ne doit pas révéler : une date écrite, un UUID, une
 * adresse, ou un nom propre — une capitale en milieu de phrase, hors des marques admises. Les
 * paramètres `{…}` hors liste blanche sont jugés par la garde (famille `parametre_non_permis`).
 */
function fuites(lignes: readonly { chemin: string; texte: string }[]): string[] {
  const trouvees: string[] = [];
  for (const { chemin, texte: brut } of lignes) {
    // Un paramètre `{…}` n'est pas un nom : il est jugé par la liste blanche de la garde.
    const texte = brut.replace(parametre(), '{}');
    for (const [nom, motif] of [
      ['une date', DATE_LITTERALE],
      ['un UUID', UUID],
      ['une adresse', COURRIEL],
    ] as const) {
      if (motif.test(texte)) trouvees.push(`${chemin} — ${nom} : « ${texte} »`);
    }
    for (const m of texte.matchAll(/\p{Lu}[\p{L}\p{M}'’-]*/gu)) {
      const avant = texte.slice(0, m.index).trimEnd();
      const enTete = avant === '' || /[.!?:;«—]$/.test(avant);
      if (!enTete && !CAPITALES_ADMISES.has(m[0])) {
        trouvees.push(`${chemin} — un nom propre (« ${m[0]} ») : « ${texte} »`);
      }
    }
  }
  return trouvees;
}

describe('REQ-UX-002 — snapshot des libellés de l’espace, sans date, sans nom, sans UUID', () => {
  it('REQ-UX-002 : le snapshot de TOUS les libellés rendus (tout champ chaîne, toute profondeur)', () => {
    const lignes = textesDeLEspace(vueDuDepot());
    expect(lignes.length).toBeGreaterThanOrEqual(100);
    expect(lignes.map((l) => `${l.chemin} : ${l.texte}`).join('\n')).toMatchInlineSnapshot(`
      "espace/issues-depot.ts › MENTIONS_HORODATAGE › a_votre_nom : Enregistré à votre nom le {dateEnregistrement}.
      espace/issues-depot.ts › MENTIONS_HORODATAGE › rien_a_votre_nom : Rien n'est enregistré à votre nom.
      espace/issues-depot.ts › MENTIONS_HORODATAGE › a_la_reception : Enregistré sur votre téléphone — l'heure retenue est celle de la réception par Axion-IA.
      espace/issues-depot.ts › MENTION_DU_REFUS : Ce refus n'a aucune autre conséquence pour vous et n'est pas un manquement.
      espace/issues-depot.ts › CONTESTATION_ECRITE › libelle : Contester ce refus par écrit
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › pastille : Enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › titre : C'est enregistré à votre nom
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › pourquoi : Cette entreprise n'était réservée pour aucun autre apporteur.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › quoiFaire : Axion-IA appelle {contact} avant le {dateAppel}. Rien à faire de votre côté : chaque étape s'affiche dans Mes entreprises.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › actionPrincipale › libelle : Déposer une autre entreprise
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › actionPrincipale › route : /deposer
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › actionSecondaire › libelle : Voir Mes entreprises
      espace/issues-depot.ts › TEXTES_DES_ISSUES › enregistree › actionSecondaire › route : /mes-entreprises
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › pastille : Enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › titre : C'est enregistré à votre nom
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › pourquoi : Axion-IA souhaite échanger avec vous avant d'appeler l'entreprise. Cela ne dit rien de votre dépôt.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › quoiFaire : Axion-IA essaiera de vous joindre d'ici le {dateAppel}. Si vous n'êtes pas disponible, rien ne change : votre dépôt garde son heure d'enregistrement et continue normalement.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › actionPrincipale › libelle : Déposer une autre entreprise
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › actionPrincipale › route : /deposer
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › actionSecondaire › libelle : Voir Mes entreprises
      espace/issues-depot.ts › TEXTES_DES_ISSUES › prioritaire › actionSecondaire › route : /mes-entreprises
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › pastille : En attente
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › titre : Enregistré en attente
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › pourquoi : Cette entreprise est déjà réservée pour un autre apporteur. Votre dépôt attend, avec son heure d’envoi.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › quoiFaire : Si ce droit prend fin, votre dépôt prend la suite, à l'heure où vous l'avez envoyé. Rien à faire de votre côté : vous serez prévenu.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › actionPrincipale › libelle : Déposer une autre entreprise
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › actionPrincipale › route : /deposer
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › actionSecondaire › libelle : Voir Mes entreprises
      espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › actionSecondaire › route : /mes-entreprises
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › pastille : Pas enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › titre : Pas enregistré : l'attente est complète
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › pourquoi : Cette entreprise est déjà réservée pour un autre apporteur, et l'attente prévue par le contrat est complète (article 3.3 bis).
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › quoiFaire : Rien à faire. Vous pourrez la vérifier à nouveau plus tard.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › actionPrincipale › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › actionPrincipale › route : /
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › actionSecondaire › libelle : Déposer une autre entreprise
      espace/issues-depot.ts › TEXTES_DES_ISSUES › file_complete › actionSecondaire › route : /deposer
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › pastille : Pas enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › titre : Pas enregistré : entreprise déjà connue de la Société
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › pourquoi : Axion-IA était déjà en relation avec cette entreprise avant votre dépôt (contrat, article 3.3).
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › quoiFaire : Rien à faire.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › actionPrincipale › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › actionPrincipale › route : /
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › actionSecondaire › libelle : Déposer une autre entreprise
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_client › actionSecondaire › route : /deposer
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › pastille : Pas enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › titre : Pas enregistré : entreprise déjà connue de la Société
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › pourquoi : Axion-IA était déjà en relation avec cette entreprise avant votre dépôt (contrat, article 3.3).
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › quoiFaire : Rien à faire.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › actionPrincipale › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › actionPrincipale › route : /
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › actionSecondaire › libelle : Déposer une autre entreprise
      espace/issues-depot.ts › TEXTES_DES_ISSUES › anteriorite_devis › actionSecondaire › route : /deposer
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › pastille : Pas enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › titre : Pas enregistré : cet établissement est fermé
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › pourquoi : Le registre public des entreprises indique que cet établissement a cessé son activité (contrat, article 3.3 bis).
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › quoiFaire : Si l'entreprise a déménagé, sa nouvelle adresse est un autre établissement : vous pouvez le chercher.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › actionPrincipale › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › actionPrincipale › route : /
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › actionSecondaire › libelle : Chercher un autre établissement
      espace/issues-depot.ts › TEXTES_DES_ISSUES › etablissement_cesse › actionSecondaire › route : /entreprise?q=
      espace/issues-depot.ts › TEXTES_DES_ISSUES › entreprise_hors_perimetre › pastille : Pas enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › entreprise_hors_perimetre › titre : Pas enregistré : cette structure est hors du contrat
      espace/issues-depot.ts › TEXTES_DES_ISSUES › entreprise_hors_perimetre › pourquoi : Le contrat met à part les administrations, les organismes qui financent la formation et les organismes de formation qui travaillent avec Axion-IA (article 3.3 bis).
      espace/issues-depot.ts › TEXTES_DES_ISSUES › entreprise_hors_perimetre › quoiFaire : Rien à faire. La liste des structures mises à part peut être consultée.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › entreprise_hors_perimetre › actionPrincipale › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › entreprise_hors_perimetre › actionPrincipale › route : /
      espace/issues-depot.ts › TEXTES_DES_ISSUES › entreprise_hors_perimetre › actionSecondaire › libelle : Voir la liste des structures mises à part
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › pastille : Pas enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › titre : Pas enregistré : l'entreprise ne souhaite pas être sollicitée
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › pourquoi : Cette entreprise a demandé à ne pas recevoir de sollicitations (contrat, article 3.3 bis).
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › quoiFaire : Rien à faire.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › actionPrincipale › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › actionPrincipale › route : /
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › actionSecondaire › libelle : Déposer une autre entreprise
      espace/issues-depot.ts › TEXTES_DES_ISSUES › opposition_demarchage › actionSecondaire › route : /deposer
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › pastille : Pas enregistré
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › titre : Pas enregistré : vos nouveaux dépôts sont suspendus le temps d'un échange avec Axion-IA
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › pourquoi : Vos nouveaux dépôts sont suspendus depuis le {dateSuspension}. Le courrier électronique reçu ce jour-là en donne la raison et vous dit comment nous répondre.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › quoiFaire : Vous pouvez répondre à ce courrier, ou écrire à Axion-IA. Vos entreprises déjà déposées ne changent pas.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › actionPrincipale › libelle : Écrire à Axion-IA
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › actionPrincipale › route : /aide
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › actionSecondaire › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › gele › actionSecondaire › route : /
      espace/issues-depot.ts › TEXTES_DES_ISSUES › captcha › pastille : En attente
      espace/issues-depot.ts › TEXTES_DES_ISSUES › captcha › titre : Encore une petite vérification
      espace/issues-depot.ts › TEXTES_DES_ISSUES › captcha › pourquoi : Pour protéger le service des envois automatiques, nous vérifions que c'est bien vous.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › captcha › quoiFaire : Votre saisie est gardée : rien à retaper.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › captcha › actionPrincipale › libelle : Envoyer le dépôt
      espace/issues-depot.ts › TEXTES_DES_ISSUES › brouillon_hors_ligne › pastille : En attente
      espace/issues-depot.ts › TEXTES_DES_ISSUES › brouillon_hors_ligne › titre : Enregistré sur votre téléphone
      espace/issues-depot.ts › TEXTES_DES_ISSUES › brouillon_hors_ligne › pourquoi : Pas de réseau.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › brouillon_hors_ligne › quoiFaire : Il part tout seul dès le retour du réseau ; le téléphone de {contact} vous sera alors demandé. S'il n'est pas parti le {dateEffacement}, il s'efface de ce téléphone.
      espace/issues-depot.ts › TEXTES_DES_ISSUES › brouillon_hors_ligne › actionPrincipale › libelle : Retour à l'accueil
      espace/issues-depot.ts › TEXTES_DES_ISSUES › brouillon_hors_ligne › actionPrincipale › route : /
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › / › titre : Bienvenue dans votre espace
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › / › phrase : Quand vous rencontrez une entreprise qui pourrait former ses salariés, vous pouvez taper son nom ci-dessous. Vous vérifiez qu'elle est libre, vous dites qui vous avez rencontré, et Axion-IA l'appelle. Si elle signe, vous touchez une commission.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › / › action › libelle : Vérifier
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › / › action › route : /entreprise?q=
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-entreprises › titre : Vos entreprises apparaîtront ici
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-entreprises › phrase : Quand vous déposez une entreprise, chaque étape s'affiche ici : l'appel d'Axion-IA, le rendez-vous, la signature.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-entreprises › action › libelle : Déposer une entreprise
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-entreprises › action › route : /deposer
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-commissions › titre : Pas encore de commission
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-commissions › phrase : Elles apparaissent ici quand une entreprise que vous avez déposée signe, puis quand elle paie. Vous verrez alors ce que vous touchez, quand, et d'où vient chaque montant.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-commissions › action › libelle : Retour à l'accueil
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /mes-commissions › action › route : /
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /plus › titre : Le reste de votre espace
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /plus › phrase : Vos documents, votre conformité, votre profil, les ressources et l'aide se trouvent ici.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /plus › action › libelle : Retour à l'accueil
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /plus › action › route : /
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /entreprise?q= › titre : Aucune entreprise trouvée
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /entreprise?q= › phrase : Pour « {recherche} ». Vous pouvez essayer avec moins de mots, ou seulement le nom. Vous pouvez aussi donner son nom, sa ville et son code postal : Axion-IA la retrouvera.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /entreprise?q= › action › libelle : Je ne trouve pas l'entreprise
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /entreprise?q= › action › route : /deposer
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /deposer › titre : Déposer une entreprise
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /deposer › phrase : Dès que vous tapez son nom, les entreprises s'affichent sous le champ.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /deposer › action › libelle : Envoyer le dépôt
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /d/<jeton> › titre : Déposer une entreprise
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /d/<jeton> › phrase : Ce lien sert seulement à déposer une entreprise. Dès que vous tapez son nom, les entreprises s'affichent sous le champ.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /d/<jeton> › action › libelle : Envoyer le dépôt
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /documents › titre : Aucun document pour le moment
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /documents › phrase : Votre contrat, chaque relevé de commissions, chaque autofacture et le récapitulatif annuel des commissions versées apparaîtront ici.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /documents › action › libelle : Retour à l'accueil
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /documents › action › route : /
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /filleuls › titre : Pas encore de montant de parrainage
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /filleuls › phrase : Si vous le souhaitez, vous pouvez partager votre lien de parrainage. Le montant qui vous en revient s'affichera ici, mois par mois.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /filleuls › action › libelle : Partager mon lien de parrainage
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /conformite › titre : Aucune pièce déposée
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /conformite › phrase : Chaque pièce s’affiche ici avec son état, et ce qu’elle change pour vos versements. Vous pouvez les envoyer quand vous le souhaitez.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /conformite › action › libelle : Envoyer une pièce
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /profil › titre : Votre profil
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /profil › phrase : Votre adresse électronique, votre RIB et vos préférences de notification se règlent ici.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /profil › action › libelle : Modifier mon profil
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /activite › titre : Rien à afficher pour le moment
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /activite › phrase : Vos entreprises déposées et vos commissions s'afficheront ici, en chiffres simples.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /activite › action › libelle : Retour à l'accueil
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /activite › action › route : /
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /ressources › titre : Aucune ressource pour le moment
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /ressources › phrase : Des documents mis à votre disposition, à consulter librement, apparaîtront ici.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /ressources › action › libelle : Retour à l'accueil
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /ressources › action › route : /
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /aide › titre : Aucune conversation
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /aide › phrase : Vous pouvez écrire à Axion-IA quand vous le souhaitez. Axion-IA vous répond sous {delaiDeReponse}.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /aide › action › libelle : Écrire à Axion-IA
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /connexion › titre : Se connecter
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /connexion › phrase : Votre adresse électronique suffit : si elle est connue, un lien de connexion vous est envoyé.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /connexion › action › libelle : Recevoir un lien de connexion
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /connexion/<jeton> › titre : Ce lien a déjà servi
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /connexion/<jeton> › phrase : Un lien de connexion ne sert qu’une fois. Un nouveau lien peut vous être envoyé.
      espace/etats-vides.ts › ETATS_VIDES_ESPACE › /connexion/<jeton> › action › libelle : M'envoyer un nouveau lien
      espace/vocabulaire.ts › FORMULES › droitACommissionJusquau : Votre droit à commission sur cette entreprise court jusqu'au {dateFin}.
      espace/vocabulaire.ts › FORMULES › dejaReservee : déjà réservée pour un autre apporteur
      espace/vocabulaire.ts › FORMULES › finDuDroit : si ce droit prend fin
      espace/vocabulaire.ts › FORMULES › sansSuite : Sans suite
      espace/vocabulaire.ts › FORMULES › depotsSuspendus : vos nouveaux dépôts sont suspendus le temps d'un échange avec Axion-IA
      espace/vocabulaire.ts › FORMULES › courrierDeSuspension : Le courrier électronique du {dateCourrier} en donne la raison et vous dit comment nous répondre.
      espace/vocabulaire.ts › FORMULES › raisonDuCourrier : en donne la raison et vous dit comment nous répondre.
      espace/vocabulaire.ts › FORMULES › assuranceManquante : rien ne change pour vos versements
      espace/vocabulaire.ts › FORMULES › reprise : Reprise
      espace/vocabulaire.ts › FORMULES › reglementAttenduDeLEntreprise : Règlement attendu de l'entreprise
      espace/vocabulaire.ts › FORMULES › reglementAttenduDeLOpco : Règlement attendu de l'OPCO de l'entreprise
      espace/vocabulaire.ts › FORMULES › limiteDeVerification : La vérification est limitée à {limiteParJour} par jour, pour protéger les informations des entreprises. Le dépôt, lui, reste ouvert.
      espace/vocabulaire.ts › FORMULES › contratPret : Votre contrat est prêt. Une fois signé, vous pourrez, si vous le souhaitez, déposer des entreprises.
      espace/vocabulaire.ts › FORMULES › pieceManquanteAvantContrat : Il manque une pièce pour préparer votre contrat
      espace/vocabulaire.ts › FORMULES › releveParCourrierElectronique : Chaque relevé vous est envoyé par courrier électronique ; il indique les mentions à reporter sur votre facture.
      espace/vocabulaire.ts › FORMULES › numeroDEntreprise : numéro d'entreprise
      espace/vocabulaire.ts › FORMULES › rienAFaire : Rien à faire de votre côté
      espace/vocabulaire.ts › ACTIONS_COMMUNES › retourAccueil › libelle : Retour à l'accueil
      espace/vocabulaire.ts › ACTIONS_COMMUNES › retourAccueil › route : /
      espace/vocabulaire.ts › ACTIONS_COMMUNES › envoyerLeDepot › libelle : Envoyer le dépôt
      espace/vocabulaire.ts › ACTIONS_COMMUNES › deposerUneEntreprise › libelle : Déposer une entreprise
      espace/vocabulaire.ts › ACTIONS_COMMUNES › deposerUneEntreprise › route : /deposer
      espace/vocabulaire.ts › ACTIONS_COMMUNES › ecrireAAxionIA › libelle : Écrire à Axion-IA
      espace/vocabulaire.ts › ACTIONS_COMMUNES › ecrireAAxionIA › route : /aide
      espace/vocabulaire.ts › NAVIGATION_AVANT_SIGNATURE › 0 : Ma conformité
      espace/vocabulaire.ts › NAVIGATION_AVANT_SIGNATURE › 1 : Mon contrat
      espace/vocabulaire.ts › CONNEXION › champCourriel : Adresse électronique
      espace/vocabulaire.ts › CONNEXION › reponses › envoye : Si cette adresse est connue, un lien de connexion vient de lui être envoyé. Il ne sert qu’une fois et expire rapidement.
      espace/vocabulaire.ts › CONNEXION › reponses › suspendu : Trop de demandes de lien ont été faites récemment. Pour votre sécurité, réessayez un peu plus tard.
      espace/vocabulaire.ts › CONNEXION › reponses › indisponible : Votre demande n’a pas pu être traitée pour le moment. Réessayez un peu plus tard.
      espace/vocabulaire.ts › CONNEXION › reponses › adresse_invalide : Cette adresse électronique n’a pas la forme attendue. Vérifiez-la, puis réessayez.
      espace/vocabulaire.ts › CONNEXION › arrivee › titre : Ouvrir votre espace
      espace/vocabulaire.ts › CONNEXION › arrivee › phrase : Confirmez pour utiliser votre lien de connexion sur cet appareil.
      espace/vocabulaire.ts › CONNEXION › arrivee › action : Utiliser mon lien
      espace/vocabulaire.ts › CONNEXION › arrivee › reponses › ouverte : Votre lien de connexion a bien été utilisé.
      espace/vocabulaire.ts › CONNEXION › arrivee › reponses › lien_invalide : Ce lien n’est plus valable : il a déjà servi ou il a expiré. Un nouveau lien peut vous être envoyé.
      espace/vocabulaire.ts › CONNEXION › arrivee › nouveauLien : M’envoyer un nouveau lien
      espace/vocabulaire.ts › CONNEXION › courriel › sujet : Votre lien de connexion à votre espace
      espace/vocabulaire.ts › CONNEXION › courriel › corps : Voici votre lien de connexion. Il ne sert qu’une fois et expire rapidement. Si vous n’avez rien demandé, ignorez ce message."
    `);
  });

  it('REQ-UX-002 : aucun libellé du snapshot ne porte de date, de nom, d’UUID ni de paramètre hors liste', () => {
    expect(fuites(textesDeLEspace(vueDuDepot()))).toEqual([]);
    expect(familles(vueDuDepot())).toEqual([]);
  });

  it('REQ-UX-002 : témoin — un libellé piégé (nom, date, UUID) est vu par la lecture du snapshot', () => {
    const piege = {
      chemin: 'espace/issues-depot.ts › TEXTES_DES_ISSUES › en_attente › pourquoi',
      texte:
        'Déjà réservée par Jean Dupont depuis le 12 mars, dossier 3f2a9c1e-0b4d-4c8e-9a1f-2b3c4d5e6f70.',
    };
    const vues = fuites([piege]);
    expect(vues.some((v) => v.includes('une date'))).toBe(true);
    expect(vues.some((v) => v.includes('un UUID'))).toBe(true);
    expect(vues.some((v) => v.includes('« Jean »'))).toBe(true);
    expect(vues.some((v) => v.includes('« Dupont »'))).toBe(true);
  });
});

// ── 1 quater. une formule, un libellé d'action : écrits UNE fois (RM-01) ─────────

describe('REQ-UX-002 REQ-UX-019 — une formule ou un libellé d’action s’écrit une seule fois', () => {
  const DOSSIER = 'src/content/micro-copy/espace';
  const sources = readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ fichier: f, contenu: readFileSync(`${DOSSIER}/${f}`, 'utf8') }));
  /** Les libellés d'action, lus dans la micro-copie elle-même — jamais retapés ici. */
  const libellesDAction = [
    ...Object.values(TEXTES_DES_ISSUES).flatMap((t) => [t.actionPrincipale, t.actionSecondaire]),
    ...Object.values(ETATS_VIDES_ESPACE).map((e) => e.action),
    CONTESTATION_ECRITE,
  ].flatMap((a) => (a === null ? [] : [a.libelle]));

  it('REQ-UX-019 : chaque libellé d’action de l’espace est écrit dans UN seul littéral', () => {
    const libelles = [...new Set(libellesDAction)];
    expect(libelles.length).toBeGreaterThanOrEqual(10);
    for (const libelle of libelles) {
      const fois = sources
        .map(
          (s) =>
            s.contenu.split(`'${libelle}'`).length - 1 + s.contenu.split(`"${libelle}"`).length - 1
        )
        .reduce((a, b) => a + b, 0);
      expect([libelle, fois]).toEqual([libelle, 1]);
    }
  });

  it('REQ-UX-002 : une formule de FORMULES n’est retapée dans aucun autre fichier de l’espace', () => {
    // Au mot entier, sans égard à la capitale : « Reprise » n'est pas retapée dans « entreprise »,
    // mais « Déjà réservée » en tête de phrase est bien la formule « déjà réservée » retapée.
    const echapper = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const formules = Object.values(FORMULES).flatMap((f) =>
      f
        .split(parametre())
        .map((morceau) => morceau.trim())
        .filter((morceau) => /\p{L}{3}/u.test(morceau))
    );
    for (const s of sources.filter((x) => x.fichier !== 'vocabulaire.ts')) {
      for (const f of formules) {
        const retapee = new RegExp(`(?<!\\p{L})${echapper(f)}(?!\\p{L})`, 'iu').test(s.contenu);
        expect([s.fichier, f, retapee]).toEqual([s.fichier, f, false]);
      }
    }
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

  it('REQ-UX-003 : chaque forme ajoutée par UX-P0-01, écrite ici en littéral, est refusée', () => {
    // Écrites ICI, indépendamment de la liste de production : retirer une forme de
    // `lexique-interdit.ts` doit rougir. `motifDeLaForme` borne au mot entier — le singulier ne
    // couvre pas le pluriel, d'où les deux formes de chaque mot.
    const AJOUTEES = [
      'faute',
      'fautes',
      'équipe',
      'équipes',
      'attribution',
      'attributions',
      'SIREN',
      'prorata',
    ];
    const formes = toutesLesFormes() as readonly string[];
    for (const mot of AJOUTEES) {
      expect([mot, formes.includes(mot)]).toEqual([mot, true]);
      const vue = vueDeFixture([
        {
          chemin: 'src/content/micro-copy/espace/etats-vides.ts',
          contenu: `  phrase: 'Voici le mot ${mot} au milieu',`,
        },
      ]);
      expect([mot, controlerLexique(vue).fautes.length > 0]).toEqual([mot, true]);
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
