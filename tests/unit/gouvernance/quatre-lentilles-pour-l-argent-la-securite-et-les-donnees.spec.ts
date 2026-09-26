// @req REQ-GOV-011
/**
 * GOV-097 — quatre lentilles pour l'argent, la sécurité et les données ; deux pour le reste.
 *
 * LA DÉCISION (Will, propriétaire, 2026-09-25, en réponse à « pourquoi c'est si long »). Mesure
 * qui l'a ouverte : sept fusions le 22/09, puis deux, une, une ; 156 des 207 tâches restantes en
 * risque ÉLEVÉ, donc relues par quatre lentilles, et chaque refus fait relire les quatre.
 *
 *   (1) Quatre lentilles SEULEMENT pour l'argent, la sécurité et les données ; deux
 *       (`exactitude`, `securite`) pour tout le reste.
 *   (2) Une inexactitude de PROSE n'est plus un motif de refus : c'est une dette nommée dans la
 *       revue (règle de la charte §6, sans code — ce fichier ne garde que (1)).
 *
 * CE QUE CE FICHIER GARDE. `risqueDeLaPr()` (`scripts/lot/revues.ts`) rend ÉLEVÉ si et
 * seulement si l'un des signaux suivants est présent :
 *   — une tâche de la PR (tête OU base) porte un `sensible` non vide ou ABSENT, `schema: true`,
 *     une `zone` d'argent ou de sécurité, une `zone` ABSENTE ou inconnue du schéma du registre ;
 *   — le label `schema`, un chemin de schéma, un fichier dans une zone sensible du code ;
 *   — un fichier de la garde des revues, de la CI, d'un dossier caché ou de configuration à la
 *     racine (ils peuvent désarmer les gardes : c'est la sécurité du processus) ;
 *   — un diff vide, une liste incomplète, aucune tâche résolue, un registre de base illisible.
 * Ce qui CESSE d'élever : une zone hors {gouvernance, qualite} autre que l'argent et la sécurité,
 * et un fichier de code produit hors des zones sensibles.
 *
 * TOUS LES TÉMOINS PASSENT PAR LE COMPORTEMENT (`risqueDeLaPr`, `lentillesExigees`) sur le
 * registre RÉEL augmenté d'UNE tâche synthétique — jamais par la lecture d'un symbole source.
 * L'API se prend par ESPACE DE NOMS : un export absent y vaut `undefined`, et le témoin qui en
 * dépend rougit sur son propre appel au lieu de faire tomber le fichier entier.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import * as LECTEUR from '../../../scripts/lot/revues';
import { cheminsDeLaTache } from '../../../scripts/lot/chemins-de-tache';
import { LIVREE } from '../../../scripts/lot/avancement';
import { zonesSensiblesTouchees } from '../../../scripts/gates/gov-pr';

type TacheBrute = {
  id: string;
  zone?: string | null;
  sensible?: string[] | null;
  schema?: boolean;
  pr?: number | null;
  paths?: string[];
  tests?: Record<string, string[]> | null;
  repo?: string;
  statut?: string;
};

function registre(): TacheBrute[] {
  return (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheBrute[] }).taches;
}

/** Les zones que le schéma du registre déclare — lues, jamais tapées (RM-01). */
function zonesDuSchema(): string[] {
  const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
    $defs: { tache: { properties: { zone: { enum: string[] } } } };
  };
  return schema.$defs.tache.properties.zone.enum;
}

const ID = 'ZZ-097';
/** Un fichier de code produit hors de toute zone sensible : il ne doit plus rien élever. */
const CODE_NEUTRE = 'src/app/tableau/page.tsx';
const DOC_NEUTRE = 'docs/journal/2026-09.md';

/** La PR synthétique : UNE tâche ajoutée au registre réel, lue sur la tête ET sur la base. */
function risque(
  tache: Omit<TacheBrute, 'id'>,
  fichiers: string[] = [DOC_NEUTRE, CODE_NEUTRE, 'tests/unit/x.spec.ts'],
  labels: string[] = []
) {
  const T = [...registre(), { id: ID, ...tache }];
  return LECTEUR.risqueDeLaPr({
    titre: `feat(${ID}): x`,
    pr: null,
    taches: T,
    tachesBase: T,
    fichiers,
    labels,
    liste: { source: 'complete' },
  });
}

const ESPACE_VIDE = { zone: 'espace', sensible: [], schema: false };

describe('REQ-GOV-011 — GOV-097 : deux lentilles pour ce qui ne touche ni l’argent, ni la sécurité, ni les données', () => {
  it('REQ-GOV-011 · une tâche `zone: espace, sensible: []` qui touche du code produit (src/) est ORDINAIRE — deux lentilles', () => {
    const r = risque(ESPACE_VIDE);
    expect(r.niveau, r.raisons.join(' ; ')).toBe('ordinaire');
    expect(r.schema).toBe(false);
    expect([...LECTEUR.lentillesExigees(r).toutes]).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 · chaque zone du schéma hors argent et sécurité, `sensible: []`, code produit neutre : ORDINAIRE', () => {
    const eleves = LECTEUR.ZONES_A_RISQUE_ELEVE;
    expect(eleves, 'ZONES_A_RISQUE_ELEVE n’est pas exporté par le lecteur').toBeDefined();
    const ordinaires = zonesDuSchema().filter((z) => !eleves.includes(z));
    // Plancher : la décision déclasse au moins espace, juridique, integration et domaine.
    for (const z of ['espace', 'juridique', 'integration', 'domaine']) {
      expect(ordinaires, z).toContain(z);
    }
    for (const zone of ordinaires) {
      const r = risque({ zone, sensible: [], schema: false });
      expect(r.niveau, `zone ${zone} : ${r.raisons.join(' ; ')}`).toBe('ordinaire');
    }
  });
});

describe('REQ-GOV-011 — GOV-097 : ce qui reste ÉLEVÉ, par la tâche (deux lentilles depuis GOV-101)', () => {
  it('REQ-GOV-011 · la même tâche avec `sensible: [argent]` est ÉLEVÉE, et la raison nomme l’argent', () => {
    const r = risque({ ...ESPACE_VIDE, sensible: ['argent'] });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('argent');
    // GOV-101 : l'élevé ne compte plus de lentille — deux partout (décision de Will du 2026-09-26).
    expect([...LECTEUR.lentillesExigees(r).toutes]).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 · chaque étiquette `sensible` du schéma, seule, rend la PR ÉLEVÉE', () => {
    const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
      $defs: { tache: { properties: { sensible: { items: { enum: string[] } } } } };
    };
    const etiquettes = schema.$defs.tache.properties.sensible.items.enum;
    expect(etiquettes.length).toBeGreaterThan(0);
    for (const s of etiquettes) {
      expect(risque({ ...ESPACE_VIDE, sensible: [s] }).niveau, s).toBe('eleve');
    }
  });

  it('REQ-GOV-011 · `zone: securite, sensible: []` est ÉLEVÉE — la zone compte seule', () => {
    const r = risque({ zone: 'securite', sensible: [], schema: false });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('securite');
  });

  it('REQ-GOV-011 · `zone: argent, sensible: []` est ÉLEVÉE — la zone compte seule', () => {
    const r = risque({ zone: 'argent', sensible: [], schema: false });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('argent');
  });

  it('REQ-GOV-011 · un champ `sensible` ABSENT ou `null` rend la PR ÉLEVÉE — un champ absent ne prouve rien', () => {
    const absent = risque({ zone: 'espace', schema: false });
    expect(absent.niveau).toBe('eleve');
    expect(absent.raisons.join(' ; ')).toContain('sensible');
    expect(risque({ zone: 'espace', sensible: null, schema: false }).niveau).toBe('eleve');
  });

  it('REQ-GOV-011 · une `zone` ABSENTE, ou inconnue du schéma du registre, rend la PR ÉLEVÉE', () => {
    const absente = risque({ sensible: [], schema: false });
    expect(absente.niveau).toBe('eleve');
    expect(absente.raisons.join(' ; ')).toContain('zone');
    const inconnue = risque({ zone: 'zz-inconnue', sensible: [], schema: false });
    expect(inconnue.niveau).toBe('eleve');
    expect(inconnue.raisons.join(' ; ')).toContain('zz-inconnue');
  });

  it('REQ-GOV-011 · `schema: true` rend la PR ÉLEVÉE et exige la lentille schema', () => {
    const r = risque({ ...ESPACE_VIDE, schema: true });
    expect(r.niveau).toBe('eleve');
    expect(r.schema).toBe(true);
    expect([...LECTEUR.lentillesExigees(r).toutes]).toContain('schema');
  });

  it('REQ-GOV-011 · une tâche déclassée sur la TÊTE mais sensible sur la BASE reste ÉLEVÉE', () => {
    const base = [...registre(), { id: ID, zone: 'espace', sensible: ['rgpd'], schema: false }];
    const tete = [...registre(), { id: ID, ...ESPACE_VIDE }];
    const r = LECTEUR.risqueDeLaPr({
      titre: `feat(${ID}): x`,
      pr: null,
      taches: tete,
      tachesBase: base,
      fichiers: [DOC_NEUTRE, CODE_NEUTRE],
      labels: [],
      liste: { source: 'complete' },
    });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('base');
  });
});

describe('REQ-GOV-011 — GOV-097 : ce qui reste à QUATRE lentilles, par les fichiers', () => {
  /** Glisse un fichier AU MILIEU d'un diff ordinaire : seul ce fichier varie (RM-11). */
  const auMilieu = (f: string) => risque(ESPACE_VIDE, [DOC_NEUTRE, f, CODE_NEUTRE]);

  it('REQ-GOV-011 · un fichier de CI (`.github/workflows/*`) au milieu du diff rend la PR ÉLEVÉE', () => {
    for (const f of ['.github/workflows/ci.yml', '.github/PULL_REQUEST_TEMPLATE.md']) {
      const r = auMilieu(f);
      expect(r.niveau, f).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(f);
    }
  });

  it('REQ-GOV-011 · un fichier de configuration à la RACINE (`eslint.config.mjs`) rend la PR ÉLEVÉE', () => {
    for (const f of ['eslint.config.mjs', 'package.json', 'pnpm-lock.yaml', 'CLAUDE.md']) {
      const r = auMilieu(f);
      expect(r.niveau, f).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(f);
    }
  });

  it('REQ-GOV-011 · un dossier caché de la racine (`.claude/`) ou `config/` rend la PR ÉLEVÉE', () => {
    for (const f of ['.claude/settings.json', 'config/exemptions-corps-publie.json']) {
      expect(auMilieu(f).niveau, f).toBe('eleve');
    }
  });

  it('REQ-GOV-011 · un fichier de la garde des revues (`scripts/lot/revues.ts`) rend la PR ÉLEVÉE', () => {
    for (const f of LECTEUR.cheminsDeLaGardeDesRevues()) {
      const r = auMilieu(f);
      expect(r.niveau, f).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(f);
    }
    expect(LECTEUR.cheminsDeLaGardeDesRevues()).toContain('scripts/lot/revues.ts');
  });

  it('REQ-GOV-011 · le schéma du registre des tâches, que le risque LIT, appartient à la garde des revues', () => {
    expect(LECTEUR.cheminsDeLaGardeDesRevues()).toContain('scripts/lot/tasks.schema.json');
    expect(auMilieu('scripts/lot/tasks.schema.json').niveau).toBe('eleve');
  });

  it('REQ-GOV-011 · un fichier de code dans une zone sensible (argent, attribution, auth, espace, sécurité, données) rend la PR ÉLEVÉE', () => {
    for (const f of [
      'src/domain/commission/calcul.ts',
      'src/domain/attribution/etats.ts',
      'src/server/auth/session.ts',
      'src/app/(espace)/connexion/page.tsx',
      'src/server/securite/pii.ts',
      'src/domain/donnees-personnelles/champs.ts',
      'src/server/acces/for-apporteur.ts',
      'src/argent/T-ARG-010/x.ts',
      'src/app/api/integrations/axionia/attributions/route.ts',
      'src/proxy.ts',
      'src/lib/env.ts',
      // La forme que REQ-GOV-011 écrit (`commissions/**`), à la racine : elle reste sensible.
      'auth/session.ts',
    ]) {
      const r = auMilieu(f);
      expect(r.niveau, f).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(f);
    }
  });

  it('REQ-GOV-011 · un chemin de schéma (`prisma/`) rend la PR ÉLEVÉE et exige la lentille schema', () => {
    const r = auMilieu('prisma/schema.prisma');
    expect(r.niveau).toBe('eleve');
    expect(r.schema).toBe(true);
  });

  it('REQ-GOV-011 · le label `schema`, un diff vide, une liste incomplète, aucune tâche, une base illisible : ÉLEVÉE', () => {
    expect(risque(ESPACE_VIDE, [DOC_NEUTRE], ['schema']).niveau).toBe('eleve');
    expect(risque(ESPACE_VIDE, []).niveau).toBe('eleve');
    const T = [...registre(), { id: ID, ...ESPACE_VIDE }];
    const base: LECTEUR.EntreeDuRisque = {
      titre: `feat(${ID}): x`,
      pr: null,
      taches: T,
      tachesBase: T,
      fichiers: [DOC_NEUTRE, CODE_NEUTRE],
      labels: [],
      liste: { source: 'complete' },
    };
    expect(LECTEUR.risqueDeLaPr(base).niveau, 'contre-témoin').toBe('ordinaire');
    expect(
      LECTEUR.risqueDeLaPr({ ...base, liste: { source: 'forge', lues: 2, annoncees: 3 } }).niveau
    ).toBe('eleve');
    expect(LECTEUR.risqueDeLaPr({ ...base, titre: 'feat(ZZ-INCONNUE): x' }).niveau).toBe('eleve');
    expect(LECTEUR.risqueDeLaPr({ ...base, tachesBase: null }).niveau).toBe('eleve');
  });
});

/**
 * LA SENSIBILITÉ SUIT LE FICHIER, PAS SEULEMENT LA TÂCHE DE LA PR (refus `securite` du 2026-09-25,
 * motif 1, revue 5316365953). Les cas sont ceux de la sonde de la lentille, sur le registre RÉEL :
 * `api-entrante.ts` appartient à SEC-07 (`securite`, `sensible: [auth]`), et une PR titrée
 * `feat(INT-T11)` (`integration`, `sensible: []`) qui le modifiait ressortait ORDINAIRE.
 */
describe('REQ-GOV-011 — GOV-097 : un fichier déclaré par une tâche sensible élève la PR, quelle que soit la tâche du titre', () => {
  const reel = (
    fichiers: string[],
    tete: TacheBrute[] = registre(),
    base: TacheBrute[] | null = registre()
  ) =>
    LECTEUR.risqueDeLaPr({
      titre: 'feat(INT-T11): x',
      pr: null,
      taches: tete,
      tachesBase: base,
      fichiers,
      labels: [],
      liste: { source: 'complete' },
    });

  it('REQ-GOV-011 · le code de sécurité DÉJÀ au dépôt (SEC-07, DM-01) sous `feat(INT-T11)` est ÉLEVÉ, et la raison nomme le fichier et sa tâche', () => {
    const cas: [string[], string][] = [
      [['src/server/integrations/axionia/api-entrante.ts', 'docs/tasks.json'], 'SEC-07'],
      [['src/app/api/integrations/axionia/[...inconnu]/route.ts'], 'SEC-07'],
      [['src/domain/evenement/journal.ts', 'src/server/evenement/journal.ts'], 'DM-01'],
    ];
    for (const [fichiers, proprietaire] of cas) {
      const r = reel(fichiers);
      const raisons = r.raisons.join(' ; ');
      expect(r.niveau, `${fichiers.join(', ')} — ${raisons}`).toBe('eleve');
      expect(raisons).toContain(fichiers[0]);
      expect(raisons).toContain(proprietaire);
    }
  });

  it('REQ-GOV-011 · la BASE fait foi : la tête qui RETIRE le chemin de SEC-07 ne rend pas le fichier ordinaire', () => {
    const f = 'src/server/integrations/axionia/api-entrante.ts';
    const tete = registre().map((t) =>
      t.id === 'SEC-07' ? { ...t, paths: (t.paths ?? []).filter((p) => p !== f) } : t
    );
    const r = reel([f], tete);
    expect(r.niveau, r.raisons.join(' ; ')).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('SEC-07');
  });

  it('REQ-GOV-011 · la TÊTE compte aussi : un chemin AJOUTÉ à une tâche sensible sur la tête élève (union, sens fermé)', () => {
    const f = 'src/lib/neutre/nouveau.ts';
    expect(reel([f]).niveau, 'contre-témoin : personne ne déclare ce fichier').toBe('ordinaire');
    const tete = registre().map((t) =>
      t.id === 'SEC-07' ? { ...t, paths: [...(t.paths ?? []), f] } : t
    );
    const r = reel([f], tete);
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('SEC-07');
  });

  it('REQ-GOV-011 · un RÉPERTOIRE déclaré SANS barre finale couvre ses fichiers — la même règle que `touche()`', () => {
    // Refus `exactitude` et `simplicite` sur 82ba226 : la correspondance était retapée et ne
    // reconnaissait un répertoire qu'à sa barre finale ; ~90 tâches déclarent `src/app/X` sans elle.
    const dossier = 'src/lib/zz-sans-barre';
    const f = `${dossier}/page.tsx`;
    expect(reel([f]).niveau, 'contre-témoin : personne ne déclare ce répertoire').toBe('ordinaire');
    const tete = registre().map((t) =>
      t.id === 'SEC-07' ? { ...t, paths: [...(t.paths ?? []), dossier] } : t
    );
    const r = reel([f], tete);
    expect(r.niveau, r.raisons.join(' ; ')).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('SEC-07');
    // Un préfixe de NOM n'est pas un répertoire : `src/lib/zz-sans-barre-autre.ts` n'est pas couvert.
    expect(reel([`${dossier}-autre.ts`], tete).niveau).toBe('ordinaire');
  });

  it('REQ-GOV-011 · contre-témoin : un fichier que seule une tâche NEUTRE déclare reste ORDINAIRE', () => {
    // `docs/gates.json` (déclaré par SEC-07 et DM-01) et `docs/journal/…` (sous le `docs/journal/`
    // de GOV-008, `auth`) ne sont pas du code produit : la règle ne lit que `src/`.
    for (const f of ['src/server/mcp/serrure.ts', CODE_NEUTRE, DOC_NEUTRE, 'docs/gates.json']) {
      const r = reel([f]);
      expect(r.niveau, `${f} — ${r.raisons.join(' ; ')}`).toBe('ordinaire');
    }
  });

  it('REQ-GOV-011 · contre-témoin : un script de `scripts/` qu’une tâche de GOUVERNANCE `sensible` déclare, hors de la garde des revues, reste ORDINAIRE — la règle ne lit que le code produit', () => {
    // Dérivé du registre, jamais tapé : décision de l'orchestrateur du 2026-09-25 (ADR 0021). Les
    // scripts de contrôle ont leurs propres signaux ; celui-ci, hors garde, est la DETTE nommée.
    const garde = LECTEUR.cheminsDeLaGardeDesRevues();
    const candidats = registre()
      .filter((t) => t.zone === 'gouvernance' && (t.sensible ?? []).length > 0)
      .flatMap((t) => (t.paths ?? []).map((f) => ({ id: t.id, f })))
      .filter(
        ({ f }) =>
          f.startsWith('scripts/') &&
          !f.endsWith('/') &&
          !garde.includes(f) &&
          !LECTEUR.fichierEnZoneSensible(f)
      );
    expect(
      candidats.length,
      'plus aucun script de gouvernance sensible hors garde'
    ).toBeGreaterThan(0);
    const { id, f } = candidats[0]!;
    const r = reel([f]);
    expect(r.niveau, `${f} (déclaré par ${id}) — ${r.raisons.join(' ; ')}`).toBe('ordinaire');
  });

  it('REQ-GOV-011 · `prisma/` et `packages/contracts/`, hors `src/`, restent ÉLEVÉS par le signal de schéma', () => {
    for (const f of [
      'packages/contracts/events.ts',
      'prisma/migrations/20260919000000_socle_journal/migration.sql',
      'prisma/seed.ts',
    ]) {
      const r = reel([f]);
      expect(r.niveau, f).toBe('eleve');
      expect(r.schema, f).toBe(true);
    }
  });

  it('REQ-GOV-011 · les fichiers FUTURS de session, de chiffrement, de cloisonnement et le middleware sont ÉLEVÉS par leur nom', () => {
    for (const f of [
      'src/lib/session.ts',
      'src/server/sessions/x.ts',
      'src/lib/crypto.ts',
      'src/lib/chiffrement/aead.ts',
      'src/server/cloisonnement/forApporteur.ts',
      'src/middleware.ts',
      'src/middleware',
    ]) {
      const r = reel([f]);
      expect(r.niveau, f).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(f);
    }
  });
});

/**
 * LES DÉCORATIONS DE SEGMENT DE NEXT.JS NE CACHENT PAS UNE ZONE (refus `securite` du 2026-09-25,
 * motif 2). `[auth]` était élevé ; `[...auth]`, `[[...auth]]`, `@auth` et les interceptions ne
 * l'étaient pas — ni pour le risque, ni pour la section « Attaque ».
 */
describe('REQ-GOV-011 — GOV-097 : un segment décoré se lit nu, pour le risque ET pour l’Attaque', () => {
  const DECORES = [
    'src/app/[...auth]/x.ts',
    'src/app/[[...auth]]/x.ts',
    'src/app/@auth/x.ts',
    'src/app/(.)auth/x.ts',
    'src/app/(..)auth/x.ts',
    'src/app/(...)auth/x.ts',
    'src/app/(..)(..)auth/x.ts',
    'src/app/(groupe)/[AUTH]/x.ts',
  ];

  it('REQ-GOV-011 · chaque décoration de `auth` rend la PR ÉLEVÉE', () => {
    for (const f of DECORES) {
      const r = risque(ESPACE_VIDE, [DOC_NEUTRE, f, CODE_NEUTRE]);
      expect(r.niveau, f).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(f);
    }
  });

  it('REQ-GOV-011 · la section « Attaque » lit la même zone `auth` sous chaque décoration', () => {
    for (const f of DECORES) {
      const zones = LECTEUR.segmentsNommesTouches([f], LECTEUR.ZONES_SENSIBLES, {
        fichierCompris: false,
      }).map((z) => z.zone);
      expect(zones, f).toEqual(['auth']);
    }
  });

  it('REQ-GOV-011 · un nom de fichier décoré est lu nu aussi (`[...auth].ts`)', () => {
    expect(risque(ESPACE_VIDE, ['src/app/[...auth].ts']).niveau).toBe('eleve');
  });

  it('REQ-GOV-011 · la CASSE ne cache pas une zone : `Auth/`, `Proxy.ts` — pour le risque ET pour l’Attaque', () => {
    for (const f of [
      'src/components/Auth/bouton.tsx',
      'src/lib/Proxy.ts',
      'src/app/[...AUTH]/x.ts',
    ]) {
      expect(risque(ESPACE_VIDE, [f]).niveau, f).toBe('eleve');
    }
    expect(zonesSensiblesTouchees(['src/components/Auth/bouton.tsx']).map((z) => z.zone)).toEqual([
      'auth',
    ]);
    expect(zonesSensiblesTouchees(['src/app/@Auth/x.ts']).map((z) => z.zone)).toEqual(['auth']);
  });

  it('REQ-GOV-011 · un NOM DE FICHIER élève le risque, mais l’Attaque ne lit que les RÉPERTOIRES (`src/lib/auth.ts`)', () => {
    // Le comportement voulu, dans les deux sens : le risque lit le nom du fichier
    // (`fichierCompris: true`), la section « Attaque » ne le lit pas (`fichierCompris: false`).
    expect(risque(ESPACE_VIDE, ['src/lib/auth.ts']).niveau).toBe('eleve');
    expect(zonesSensiblesTouchees(['src/lib/auth.ts'])).toEqual([]);
    expect(zonesSensiblesTouchees(['src/lib/[...auth].ts'])).toEqual([]);
    expect(zonesSensiblesTouchees(['src/lib/auth/x.ts'])).toEqual([
      { zone: 'auth', sous: 'src/lib/auth' },
    ]);
  });

  it('REQ-GOV-011 · contre-témoin : une décoration autour d’un nom NEUTRE reste ORDINAIRE', () => {
    for (const f of [
      'src/app/[id]/page.tsx',
      'src/app/[...slug]/page.tsx',
      'src/app/@modal/(.)photo/page.tsx',
      'src/app/(marketing)/authentique/page.tsx',
    ]) {
      const r = risque(ESPACE_VIDE, [f]);
      expect(r.niveau, `${f} — ${r.raisons.join(' ; ')}`).toBe('ordinaire');
    }
  });
});

describe('REQ-GOV-011 — GOV-097 : le gain, calculé par le code sur le registre réel', () => {
  it('REQ-GOV-011 · des tâches restantes passent d’ÉLEVÉ à ORDINAIRE, et aucune tâche sensible n’y passe', () => {
    const T = registre();
    const vivantes = T.filter((t) => t.repo === 'partners' && !LIVREE.has(t.statut ?? ''));
    const niveau = (t: TacheBrute) =>
      LECTEUR.risqueDeLaPr({
        titre: `feat(${t.id}): x`,
        pr: null,
        taches: T,
        tachesBase: T,
        fichiers: cheminsDeLaTache({ ...t, paths: t.paths ?? [] }),
        labels: [],
        liste: { source: 'complete' },
      }).niveau;
    const ordinaires = vivantes.filter((t) => niveau(t) === 'ordinaire');
    console.log(
      `GOV-097 — tâches partners restantes : ${ordinaires.length} ordinaire(s), ` +
        `${vivantes.length - ordinaires.length} élevée(s), sur ${vivantes.length}`
    );
    // Aucune tâche d'argent, de sécurité ou de données ne passe à deux lentilles.
    for (const t of ordinaires) {
      expect(t.sensible, t.id).toEqual([]);
      expect(t.schema, t.id).not.toBe(true);
      expect(LECTEUR.ZONES_A_RISQUE_ELEVE, t.id).not.toContain(t.zone);
    }
    // Et la décision a un effet : au moins une tâche hors gouvernance et qualité est ordinaire.
    expect(ordinaires.some((t) => !['gouvernance', 'qualite'].includes(t.zone ?? ''))).toBe(true);
  });
});
