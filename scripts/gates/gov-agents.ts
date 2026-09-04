/**
 * gov-agents.ts — la garde des quinze fiches de rôle (GOV-023, REQ-GOV-010).
 *
 * USAGE : pnpm gov:agents          (échoue si une fiche, la charte ou le workflow divergent)
 *         pnpm gov:agents --prove  (injecte un défaut PAR FAMILLE et vérifie que chacun rougit)
 *
 * POURQUOI DEUX FICHIERS PLUTÔT QU'UN. `scripts/agents/generer.ts --verifier` sait dire qu'une fiche
 * a été éditée à la main ; il ne sait rien du reste. Or `docs/gates.json` déclare la gate `gov:agents`
 * sur CE chemin-ci, `pnpm gov:check` l'appelle par ce nom, et RM-02 exige d'une gate un mode `--prove`
 * qui fait rougir chaque famille sur son témoin. Le partage est donc : le générateur tient le RENDU
 * (et le vérifie), la garde tient tout ce qu'un rendu ne peut pas voir —
 *
 *   — la SOURCE elle-même : codes `A\d{2}` uniques, rôles uniques, aucun champ vide ;
 *   — les DOCUMENTS cités existent sur le disque. Une fiche qui envoie lire `docs/spec/` — dossier
 *     que ce dépôt n'a pas — envoie l'agent chercher un texte qui n'existe pas, et il invente ;
 *   — les cinq SECTIONS exigées par le registre des gardes sont présentes dans chaque fiche ;
 *   — l'ACCORD avec `docs/CHARTE-AGENTS.md`, dans les deux sens : tout code A<nn> du tableau §2 a son
 *     entrée dans la source et réciproquement, et son libellé, ses outils déclarés et son droit
 *     d'écriture y sont les mêmes ; tout chemin réservé du §7 portant un label `role:<fiche>` est
 *     déclaré par le poste correspondant. La charte reste tenue à la main — c'est un fichier partagé,
 *     GOV-023 ne l'écrit pas — mais elle ne peut plus diverger EN SILENCE ;
 *   — le WORKFLOW de lot : chaque `agentType` résout vers une fiche. Sans cela, le sous-agent est
 *     générique et les `tools` restreints des fiches (le relecteur privé de Write, le release manager
 *     privé d'écriture) n'ont AUCUN effet — c'est écrit dans l'en-tête de `lot.workflow.js`.
 *
 * La garde IMPORTE `rendreFiche` du générateur au lieu de le réécrire : deux rendus jumeaux finissent
 * par diverger, et c'est alors la fiche qu'on déclare fausse au lieu du contrôle (RM-01).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHEMIN_SOURCE,
  CHEMIN_FICHES,
  CODE_POSTE,
  SECTIONS,
  lireSource,
  proseDe,
  rendreFiche,
  normaliser,
  type Poste,
} from '../agents/generer';

const CHEMIN_CHARTE = 'docs/CHARTE-AGENTS.md';
const CHEMIN_WORKFLOW = 'scripts/lot/lot.workflow.js';

type Fiche = { role: string; texte: string };
type Corpus = {
  postes: Poste[];
  fiches: Fiche[];
  charte: string;
  workflow: string;
  existe: (chemin: string) => boolean;
};
type Faute = { famille: string; message: string };

const FAMILLES = [
  'source_code_invalide',
  'source_code_double',
  'source_role_double',
  'source_champ_manquant',
  'document_absent',
  'fiche_manquante',
  'fiche_orpheline',
  'fiche_non_derivee',
  'section_manquante',
  'charte_poste_absent',
  'charte_poste_divergent',
  'charte_chemin_reserve_divergent',
  'agent_type_sans_fiche',
  'agent_type_non_resoluble',
];

// ── lecture de la charte ─────────────────────────────────────────────────────

/** Une section de la charte, de son titre au titre suivant. */
function section(texte: string, debut: string, fin: string): string {
  const d = texte.indexOf(debut);
  if (d < 0) return '';
  const f = texte.indexOf(fin, d + debut.length);
  return texte.slice(d, f < 0 ? undefined : f);
}

/** Le gras et les accents graves sont de la mise en forme, pas de la valeur. */
function nu(cellule: string): string {
  return cellule.replace(/`/g, '').replace(/\*\*/g, '').trim();
}

/**
 * Une cellule de CHEMIN se nettoie autrement : on retire les accents graves et la parenthese
 * d'annotation — « `docs/PLAN-STATE.md` (**derive**) » — mais JAMAIS les deux etoiles, qui sont
 * le glob `docs/adr/**` et non du gras. `gov:pr` les retire, lui, et lit donc « docs/adr/ » ;
 * sa comparaison `touche()` tolere la barre finale, la notre compare des chaines. Mesure du
 * 2026-09-03 : sans cette distinction, la garde exigeait d'ecrire « docs/adr/ » dans la source,
 * c'est-a-dire de recopier un artefact de lecture au lieu du chemin reel.
 */
function nuChemin(cellule: string): string {
  return cellule.replace(/`/g, '').replace(/\(.*?\)/g, '').trim();
}

function cellules(ligne: string): string[] {
  return ligne.split('|').slice(1, -1).map((c) => c.trim());
}

type LignePoste = { code: string; role: string; libelle: string; tools: string; ecrit: string };

/** Le tableau des quinze postes du §2, LU dans la charte : la règle et sa vue sont le même texte. */
function postesDeLaCharte(charte: string): LignePoste[] {
  const out: LignePoste[] = [];
  for (const ligne of section(charte, '## 2.', '## 3.').split('\n')) {
    const c = cellules(ligne);
    if (c.length < 5 || !CODE_POSTE.test(nu(c[0]!))) continue;
    out.push({ code: nu(c[0]!), role: nu(c[1]!), libelle: nu(c[2]!), tools: nu(c[3]!), ecrit: nu(c[4]!) });
  }
  return out;
}

/**
 * Le tableau des chemins réservés du §7. Une ligne dont le label n'est pas `role:<fiche>` — `—` pour
 * `.claude/**`, `schema` pour le schéma — n'appartient à aucun poste : elle est écartée ici, et
 * `gov:pr` la traite dans sa propre famille.
 */
function cheminsReservesDeLaCharte(charte: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const ligne of section(charte, '## 7.', '## 8.').split('\n')) {
    if (!ligne.startsWith('|')) continue;
    const c = cellules(ligne);
    if (c.length < 4) continue;
    const label = nu(c[2]!);
    if (!/^role:[a-z0-9-]+$/.test(label)) continue;
    const role = label.slice('role:'.length);
    const chemins = c[0]!.split(',').map(nuChemin).filter(Boolean);
    out.set(role, [...(out.get(role) ?? []), ...chemins]);
  }
  return out;
}

/**
 * Les `agentType` du workflow de lot. Trois d'entre eux sont DYNAMIQUES (`agentType: role`,
 * `agentType: roleDev(t)`, `agentType: l.agentType ?? 'relecteur'`) : on résout l'identifiant en
 * remontant à sa déclaration `const <nom> =`, jusqu'à trouver des littéraux. Un `agentType` dont on
 * ne tire aucun littéral n'est pas vérifiable — c'est une famille de faute, pas un silence.
 */
export function agentTypes(workflow: string): { expr: string; roles: string[] }[] {
  // Un littéral COMPARÉ (`t.repo === 'axionia'`) est un test, pas un rôle : `roleDev` choisit entre
  // ses deux branches, il ne lance pas un agent « axionia ». Sans ce retrait, la garde rougissait sur
  // le workflow réel en nommant un rôle que personne n'appelle.
  const litteraux = (texte: string): string[] =>
    [...texte.replace(/[=!]==?\s*'[^']*'/g, '').matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]!);
  const declaration = (nom: string): string | null => {
    const m = new RegExp(`^\\s*(?:const|let)\\s+${nom}\\s*=\\s*(.+)$`, 'm').exec(workflow);
    return m ? m[1]! : null;
  };
  const resoudre = (expr: string, profondeur = 0): string[] => {
    const trouves = litteraux(expr);
    if (trouves.length > 0 || profondeur >= 3) return trouves;
    const noms = [...expr.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]!);
    const out: string[] = [];
    for (const n of noms) {
      const d = declaration(n);
      if (d) out.push(...resoudre(d, profondeur + 1));
    }
    return out;
  };
  return [...workflow.matchAll(/agentType:\s*([^,}\n]+)/g)].map((m) => {
    const expr = m[1]!.trim();
    return { expr, roles: [...new Set(resoudre(expr))] };
  });
}

// ── les contrôles ────────────────────────────────────────────────────────────

function controler(c: Corpus): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  // ---- la source ------------------------------------------------------------
  const vus = new Set<string>();
  const roles = new Set<string>();
  for (const p of c.postes) {
    if (!CODE_POSTE.test(p.code)) {
      ajouter(
        'source_code_invalide',
        `${CHEMIN_SOURCE} — « ${p.code} » (${p.role}) n'est pas un code de poste. Le schéma est ` +
          `\`^A[0-9]{2}$\` : c'est le zéro de tête qui distingue un code d'une étiquette de relecteur, ` +
          `que \`gov:identifiants\` refuse (RM-12).`
      );
    }
    if (vus.has(p.code)) ajouter('source_code_double', `${CHEMIN_SOURCE} — le code ${p.code} est donné deux fois.`);
    vus.add(p.code);
    if (roles.has(p.role)) {
      ajouter('source_role_double', `${CHEMIN_SOURCE} — le rôle « ${p.role} » est donné deux fois : deux postes pour une seule fiche.`);
    }
    roles.add(p.role);

    const manquants: string[] = [];
    if (!p.libelle?.trim()) manquants.push('libelle');
    if (!p.description?.trim()) manquants.push('description');
    if (!p.mission?.trim()) manquants.push('mission');
    for (const champ of ['entrees', 'sorties', 'interdits', 'documents', 'tools'] as const) {
      if (!Array.isArray(p[champ]) || p[champ].length === 0) manquants.push(champ);
    }
    if (!p.ecrit?.trim()) manquants.push('ecrit');
    if (manquants.length > 0) {
      ajouter(
        'source_champ_manquant',
        `${CHEMIN_SOURCE} — le poste ${p.code} (${p.role}) n'a pas de ${manquants.join(', ')}. Une fiche ` +
          `sans interdits ni documents n'oriente rien : c'est le cas d'échec déclaré au registre des gardes.`
      );
    }

    for (const d of p.documents ?? []) {
      if (!c.existe(d.chemin)) {
        ajouter(
          'document_absent',
          `${CHEMIN_SOURCE} — le poste ${p.code} envoie lire « ${d.chemin} », qui n'existe pas. Un agent ` +
            `envoyé vers un texte absent n'échoue pas : il invente.`
        );
      }
    }
  }

  // ---- les fiches sont une vue de la source ---------------------------------
  const surDisque = new Map(c.fiches.map((f) => [f.role, f.texte]));
  for (const p of c.postes) {
    const texte = surDisque.get(p.role);
    if (texte === undefined) {
      ajouter('fiche_manquante', `${join(CHEMIN_FICHES, `${p.role}.md`)} est absente alors que ${CHEMIN_SOURCE} déclare ${p.code}.`);
      continue;
    }
    if (normaliser(texte) !== normaliser(rendreFiche(p, proseDe(texte)))) {
      ajouter(
        'fiche_non_derivee',
        `${join(CHEMIN_FICHES, `${p.role}.md`)} diffère du rendu de ${CHEMIN_SOURCE} : le frontmatter ou le ` +
          `bloc généré a été édité à la main. Regénère (\`pnpm gov:agents:rendre\`), ne corrige pas la vue.`
      );
    }
    for (const s of SECTIONS) {
      if (!texte.includes(`### ${s}`)) {
        ajouter(
          'section_manquante',
          `${join(CHEMIN_FICHES, `${p.role}.md`)} n'a pas de section « ${s} ». Les cinq sections sont exigées ` +
            `par le registre des gardes (\`docs/gates.json\`, gate \`gov:agents\`).`
        );
      }
    }
  }
  for (const f of c.fiches) {
    if (!c.postes.some((p) => p.role === f.role)) {
      ajouter(
        'fiche_orpheline',
        `${join(CHEMIN_FICHES, `${f.role}.md`)} n'a aucune entrée dans ${CHEMIN_SOURCE} : ce rôle ne résout ` +
          `ni comme \`agentType\`, ni comme label \`role:${f.role}\`, et \`gov:pr\` rougira sur son absence au §2.`
      );
    }
  }

  // ---- l'accord avec la charte, dans les deux sens --------------------------
  const lignes = postesDeLaCharte(c.charte);
  for (const l of lignes) {
    const p = c.postes.find((x) => x.code === l.code);
    if (!p) {
      ajouter(
        'charte_poste_absent',
        `${CHEMIN_CHARTE} §2 — le code ${l.code} (${l.role}) n'a aucune entrée dans ${CHEMIN_SOURCE}. La charte ` +
          `et la source décrivaient les mêmes postes chacune de son côté : c'est ce que GOV-023 supprime.`
      );
      continue;
    }
    const ecarts: string[] = [];
    if (p.role !== l.role) ecarts.push(`fiche « ${l.role} » ≠ « ${p.role} »`);
    if (p.libelle !== l.libelle) ecarts.push(`libellé « ${l.libelle} » ≠ « ${p.libelle} »`);
    if (p.tools.join(', ') !== l.tools) ecarts.push(`outils « ${l.tools} » ≠ « ${p.tools.join(', ')} »`);
    if (p.ecrit !== l.ecrit) ecarts.push(`droit d'écriture « ${l.ecrit} » ≠ « ${p.ecrit} »`);
    if (ecarts.length > 0) {
      ajouter(
        'charte_poste_divergent',
        `${CHEMIN_CHARTE} §2 — la ligne ${l.code} contredit ${CHEMIN_SOURCE} : ${ecarts.join(' ; ')}. Un poste ` +
          `dont les outils déclarés diffèrent de sa fiche a des droits que personne n'a décidés.`
      );
    }
  }
  for (const p of c.postes) {
    if (!lignes.some((l) => l.code === p.code)) {
      ajouter(
        'charte_poste_absent',
        `${CHEMIN_CHARTE} §2 — le poste ${p.code} (${p.role}) de ${CHEMIN_SOURCE} n'a aucune ligne au tableau : ` +
          `un poste sans code ne peut être ni auteur, ni relecteur, ni propriétaire d'un chemin réservé.`
      );
    }
  }

  const reserves = cheminsReservesDeLaCharte(c.charte);
  for (const [role, chemins] of reserves) {
    const p = c.postes.find((x) => x.role === role);
    if (!p) {
      ajouter(
        'charte_chemin_reserve_divergent',
        `${CHEMIN_CHARTE} §7 — le label « role:${role} » réserve ${chemins.join(', ')} à un poste que ` +
          `${CHEMIN_SOURCE} ne connaît pas : ce chemin n'a donc aucun propriétaire.`
      );
      continue;
    }
    const attendus = [...p.cheminsReserves].sort().join(', ');
    const lus = [...chemins].sort().join(', ');
    if (attendus !== lus) {
      ajouter(
        'charte_chemin_reserve_divergent',
        `${CHEMIN_CHARTE} §7 — « role:${role} » réserve [${lus}] alors que ${CHEMIN_SOURCE} déclare ` +
          `[${attendus}]. Le §7 est LU par \`gov:pr\` ligne par ligne : le modifier change ce que la garde exige.`
      );
    }
  }
  for (const p of c.postes) {
    const lus = reserves.get(p.role) ?? [];
    if (p.cheminsReserves.length > 0 && lus.length === 0) {
      ajouter(
        'charte_chemin_reserve_divergent',
        `${CHEMIN_SOURCE} — le poste ${p.code} déclare réserver [${p.cheminsReserves.join(', ')}], mais aucune ` +
          `ligne du §7 de la charte ne porte le label « role:${p.role} » : rien ne le fait respecter.`
      );
    }
  }

  // ---- le workflow de lot ---------------------------------------------------
  for (const a of agentTypes(c.workflow)) {
    if (a.roles.length === 0) {
      ajouter(
        'agent_type_non_resoluble',
        `${CHEMIN_WORKFLOW} — « agentType: ${a.expr} » ne se résout vers aucun nom de fiche. Un appel dont ` +
          `personne ne peut dire quel rôle il lance n'est pas vérifiable : le sous-agent serait générique, ` +
          `et les \`tools\` restreints des fiches n'auraient aucun effet.`
      );
      continue;
    }
    for (const r of a.roles) {
      if (!c.postes.some((p) => p.role === r)) {
        ajouter(
          'agent_type_sans_fiche',
          `${CHEMIN_WORKFLOW} — « agentType: ${a.expr} » désigne « ${r} », qui n'a pas de fiche. L'autopilote ` +
            `meurt au premier agent, ou pire : il tourne avec un relecteur qui peut écrire.`
        );
      }
    }
  }

  return fautes;
}

// ── mode --prove ─────────────────────────────────────────────────────────────

const EXISTANTS = new Set(['docs/REGLES-MAISON.md', 'docs/CONVENTIONS.md', 'docs/tiers']);

function posteTemoin(code: string, role: string, sur: Partial<Poste> = {}): Poste {
  return {
    code,
    role,
    libelle: `Poste ${role}`,
    description: `Un poste témoin nommé ${role}, écrit pour éprouver la garde.`,
    mission: 'Éprouver la dérivation des fiches depuis leur source unique, et rien d’autre.',
    entrees: ['une tâche'],
    sorties: ['un rendu'],
    interdits: ['Inventer une décision.'],
    documents: [{ chemin: 'docs/REGLES-MAISON.md', pourquoi: 'les douze règles' }],
    tools: ['Read', 'Grep'],
    ecrit: 'non',
    cheminsReserves: [],
    ...sur,
  };
}

function ligneCharte(p: Poste): string {
  return `| ${p.code} | \`${p.role}\` | ${p.libelle} | ${p.tools.join(', ')} | ${p.ecrit} |`;
}

function charteTemoin(postes: Poste[], lignes7: string[] = []): string {
  return [
    '## 2. Les codes de poste',
    '',
    '| Code | Fiche | Poste | Outils déclarés (`tools:`) | Écrit ? |',
    '| --- | --- | --- | --- | --- |',
    ...postes.map(ligneCharte),
    '',
    '## 3. Les postes, un par un',
    '',
    'Une phrase.',
    '',
    '## 7. Fichiers réservés et label exigé',
    '',
    '| Chemin réservé | Poste | Label exigé | Où la règle est écrite |',
    '| --- | --- | --- | --- |',
    ...lignes7,
    '',
    '## 8. Le gabarit de PR',
    '',
  ].join('\n');
}

const WORKFLOW_TEMOIN = [
  "const roleDev = (t) => (t.repo === 'axionia' ? 'alpha' : 'beta')",
  'const role = roleDev(t)',
  "agent(prompt, { label: 'dev', agentType: role })",
  "agent(prompt, { label: 'revue', agentType: 'alpha' })",
].join('\n');

function corpusValide(): Corpus {
  const postes = [
    posteTemoin('A01', 'alpha', { cheminsReserves: ['docs/CONVENTIONS.md'] }),
    posteTemoin('A02', 'beta'),
  ];
  return {
    postes,
    fiches: postes.map((p) => ({ role: p.role, texte: rendreFiche(p, 'Une prose tenue à la main.') })),
    charte: charteTemoin(postes, ['| `docs/CONVENTIONS.md` | A01 | `role:alpha` | témoin |']),
    workflow: WORKFLOW_TEMOIN,
    existe: (chemin) => EXISTANTS.has(chemin),
  };
}

/** Reconstruit les fiches et la charte APRÈS un changement de la source : sans cela, un témoin de */
/** famille ferait rougir toutes les autres, et on ne saurait pas laquelle on a prouvée.           */
function recoudre(postes: Poste[], lignes7: string[] = ['| `docs/CONVENTIONS.md` | A01 | `role:alpha` | témoin |']): Corpus {
  return {
    ...corpusValide(),
    postes,
    fiches: postes.map((p) => ({ role: p.role, texte: rendreFiche(p, 'Une prose tenue à la main.') })),
    charte: charteTemoin(postes, lignes7),
  };
}

if (process.argv.includes('--prove')) {
  const base = controler(corpusValide());
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un corpus DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const TEMOINS: { famille: string; defaut: () => Corpus }[] = [
    {
      famille: 'source_code_invalide',
      defaut: () => recoudre([posteTemoin('A1', 'alpha', { cheminsReserves: ['docs/CONVENTIONS.md'] }), posteTemoin('A02', 'beta')]),
    },
    {
      famille: 'source_code_double',
      defaut: () => recoudre([posteTemoin('A01', 'alpha', { cheminsReserves: ['docs/CONVENTIONS.md'] }), posteTemoin('A01', 'beta')]),
    },
    {
      famille: 'source_role_double',
      defaut: () => recoudre([posteTemoin('A01', 'alpha', { cheminsReserves: ['docs/CONVENTIONS.md'] }), posteTemoin('A02', 'alpha')]),
    },
    {
      famille: 'source_champ_manquant',
      defaut: () =>
        recoudre([posteTemoin('A01', 'alpha', { cheminsReserves: ['docs/CONVENTIONS.md'], interdits: [] }), posteTemoin('A02', 'beta')]),
    },
    {
      famille: 'document_absent',
      defaut: () =>
        recoudre([
          posteTemoin('A01', 'alpha', {
            cheminsReserves: ['docs/CONVENTIONS.md'],
            documents: [{ chemin: 'docs/spec/plan-directeur.md', pourquoi: 'un dossier que ce dépôt n’a pas' }],
          }),
          posteTemoin('A02', 'beta'),
        ]),
    },
    {
      famille: 'fiche_manquante',
      defaut: () => ({ ...corpusValide(), fiches: corpusValide().fiches.filter((f) => f.role !== 'beta') }),
    },
    {
      famille: 'fiche_orpheline',
      defaut: () => ({
        ...corpusValide(),
        fiches: [...corpusValide().fiches, { role: 'gamma', texte: '# Une fiche que personne ne déclare' }],
      }),
    },
    {
      famille: 'fiche_non_derivee',
      defaut: () => {
        const c = corpusValide();
        return {
          ...c,
          fiches: c.fiches.map((f) =>
            f.role === 'alpha' ? { ...f, texte: f.texte.replace('tools: Read, Grep', 'tools: Read, Write, Edit, Bash') } : f
          ),
        };
      },
    },
    {
      famille: 'section_manquante',
      defaut: () => {
        // Le cas d'échec déclaré au registre des gardes : « retirer la section interdits d'une fiche ».
        const c = corpusValide();
        return {
          ...c,
          fiches: c.fiches.map((f) => (f.role === 'alpha' ? { ...f, texte: f.texte.replace('### Interdits', '### Ce qui est interdit') } : f)),
        };
      },
    },
    {
      famille: 'charte_poste_absent',
      defaut: () => ({ ...corpusValide(), charte: charteTemoin([corpusValide().postes[0]!], ['| `docs/CONVENTIONS.md` | A01 | `role:alpha` | témoin |']) }),
    },
    {
      famille: 'charte_poste_divergent',
      defaut: () => {
        const c = corpusValide();
        return { ...c, charte: c.charte.replace('| A02 | `beta` | Poste beta | Read, Grep | non |', '| A02 | `beta` | Poste beta | Read, Write, Edit, Bash | oui |') };
      },
    },
    {
      famille: 'charte_chemin_reserve_divergent',
      defaut: () => ({ ...corpusValide(), charte: charteTemoin(corpusValide().postes, ['| `docs/CONVENTIONS.md`, `CHANGELOG.md` | A01 | `role:alpha` | témoin |']) }),
    },
    {
      famille: 'agent_type_sans_fiche',
      defaut: () => ({ ...corpusValide(), workflow: `${WORKFLOW_TEMOIN}\nagent(p, { label: 'x', agentType: 'orchestrateur' })` }),
    },
    {
      famille: 'agent_type_non_resoluble',
      defaut: () => ({ ...corpusValide(), workflow: `${WORKFLOW_TEMOIN}\nagent(p, { label: 'x', agentType: choisi })` }),
    },
  ];

  /**
   * Les contre-témoins comptent autant que les témoins. Une garde d'accord charte ↔ source qui
   * rougirait sur le gras d'une cellule ou sur la parenthèse « (**dérivé**) » du §7 forcerait à
   * réécrire la charte — un fichier PARTAGÉ que cette tâche n'a pas le droit de toucher — au motif
   * qu'elle ne sait pas lire du markdown.
   */
  const CONTRE_TEMOINS: { quoi: string; corpus: () => Corpus }[] = [
    {
      quoi: 'une cellule « Écrit ? » en gras markdown',
      corpus: () => {
        const c = corpusValide();
        return { ...c, charte: c.charte.replace('| Read, Grep | non |', '| Read, Grep | **non** |') };
      },
    },
    {
      quoi: 'un chemin du §7 suivi d’une parenthèse en gras',
      corpus: () => ({ ...corpusValide(), charte: charteTemoin(corpusValide().postes, ['| `docs/CONVENTIONS.md` (**dérivé**) | A01 | `role:alpha` | témoin |']) }),
    },
    {
      quoi: 'deux chemins réservés sur une même ligne, séparés par une virgule',
      corpus: () => {
        const postes = [posteTemoin('A01', 'alpha', { cheminsReserves: ['docs/CONVENTIONS.md', 'docs/tiers'] }), posteTemoin('A02', 'beta')];
        return recoudre(postes, ['| `docs/CONVENTIONS.md`, `docs/tiers` | A01 | `role:alpha` | témoin |']);
      },
    },
    {
      quoi: 'un `agentType` dynamique résolu en deux sauts (`role` → `roleDev`)',
      corpus: () => corpusValide(),
    },
    {
      quoi: 'un `agentType` avec repli (`l.agentType ?? "beta"`)',
      corpus: () => ({ ...corpusValide(), workflow: `${WORKFLOW_TEMOIN}\nagent(p, { label: 'x', agentType: l.agentType ?? 'beta' })` }),
    },
    {
      quoi: 'un document qui pointe vers un DOSSIER existant',
      corpus: () => {
        const postes = [
          posteTemoin('A01', 'alpha', { cheminsReserves: ['docs/CONVENTIONS.md'], documents: [{ chemin: 'docs/tiers', pourquoi: 'les fiches de tiers' }] }),
          posteTemoin('A02', 'beta'),
        ];
        return recoudre(postes);
      },
    },
    {
      quoi: 'une ligne du §7 sans label de rôle (`—` et `schema`)',
      corpus: () =>
        recoudre(corpusValide().postes, [
          '| `docs/CONVENTIONS.md` | A01 | `role:alpha` | témoin |',
          '| `.claude/settings.json`, `.claude/agents/**` | aucun agent en session | — | témoin |',
          '| `prisma/**`, `packages/contracts/**` | A02 | `schema` | témoin |',
        ]),
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
      f.slice(0, 3).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
    prouvees.add(t.famille);
  }
  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  for (const ct of CONTRE_TEMOINS) {
    const f = controler(ct.corpus());
    if (f.length > 0) {
      console.error(`❌ Faux positif : ${ct.quoi} a rougi. La garde est trop large.\n   [${f[0]!.famille}] ${f[0]!.message}`);
      process.exit(1);
    }
  }

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
      `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

function lireCorpus(): Corpus {
  for (const f of [CHEMIN_SOURCE, CHEMIN_CHARTE, CHEMIN_WORKFLOW]) {
    if (!existsSync(f)) {
      console.error(`❌ gov:agents — ${f} est introuvable : la garde ne peut pas se prononcer.`);
      process.exit(1);
    }
  }
  const fiches = existsSync(CHEMIN_FICHES)
    ? readdirSync(CHEMIN_FICHES)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => ({ role: f.slice(0, -3), texte: readFileSync(join(CHEMIN_FICHES, f), 'utf8') }))
    : [];
  return {
    postes: lireSource(),
    fiches,
    charte: readFileSync(CHEMIN_CHARTE, 'utf8'),
    workflow: readFileSync(CHEMIN_WORKFLOW, 'utf8'),
    existe: (chemin) => existsSync(chemin),
  };
}

const corpus = lireCorpus();
const fautes = controler(corpus);

if (fautes.length === 0) {
  const documents = corpus.postes.reduce((n, p) => n + p.documents.length, 0);
  console.log(
    `✅ gov:agents — ${corpus.postes.length} postes dans ${CHEMIN_SOURCE}, autant de fiches rendues dans ` +
      `${CHEMIN_FICHES}/, cinq sections chacune, ${documents} documents cités qui existent, tableau §2 et ` +
      `chemins réservés §7 de la charte accordés à la source, tout \`agentType\` du workflow résolu.`
  );
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
console.error(`❌ gov:agents — ${fautes.length} faute(s) sur les fiches de rôle (REQ-GOV-010) :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
