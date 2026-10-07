// @req REQ-GOV-011
// @req REQ-GOV-013
/**
 * UNE LENTILLE POUR UNE PR SANS RISQUE — GOV-124 (REQ-GOV-011, REQ-GOV-013).
 *
 * Décision de Williams du 2026-09-29, qui amende W16 (`partners/ADR-0024`, deux lentilles partout) :
 * une PR que `risqueDeLaPr` classe ordinaire, et dont chaque fichier et chaque tâche passent la
 * liste d'AUTORISATION (documents, tests, outillage interne du registre et des vues ; zones
 * gouvernance et qualité), n'exige qu'UNE lentille, `exactitude`. Tout le reste, et tout ce que la
 * règle ne sait pas lire, en exige deux.
 *
 * Le classement est DÉRIVÉ (fichiers, labels, tâches) et jamais déclaré par l'auteur : aucun label ni
 * aucune ligne du corps ne fait passer une PR à une lentille.
 */
import { describe, it, expect } from 'vitest';
import * as LECTEUR from '../../../scripts/lot/revues';

type Tache = LECTEUR.TacheDeLaPr;

const DOC: Tache = { id: 'GOV-124', zone: 'gouvernance', sensible: [], schema: false };
const QUALITE: Tache = { id: 'QA-T11', zone: 'qualite', sensible: [], schema: false };

function lentilles(p: {
  titre?: string;
  taches?: Tache[];
  fichiers: string[];
  labels?: string[];
  liste?: LECTEUR.ListeDesFichiers | null;
  tachesBase?: Tache[] | null;
}): { risque: LECTEUR.Risque; exigees: string[] } {
  const taches = p.taches ?? [DOC];
  const risque = LECTEUR.risqueDeLaPr({
    titre: p.titre ?? 'docs(GOV-124): une page de documentation',
    pr: null,
    taches,
    tachesBase: p.tachesBase === undefined ? taches : p.tachesBase,
    fichiers: p.fichiers,
    labels: p.labels ?? [],
    liste: p.liste === undefined ? { source: 'complete' } : p.liste,
  });
  return { risque, exigees: [...LECTEUR.lentillesExigees(risque).toutes] };
}

describe('REQ-GOV-011 — une PR sans risque n’exige qu’une lentille, dérivée et jamais déclarée (GOV-124)', () => {
  it('REQ-GOV-011 — TÉMOIN : une PR de documentation seule exige UNE lentille, exactitude', () => {
    const { risque, exigees } = lentilles({ fichiers: ['docs/guide.md', 'docs/journal/x.md'] });
    expect(risque.niveau, risque.raisons.join(' ; ')).toBe('ordinaire');
    expect(risque.uneLentille).toBe(true);
    expect(exigees).toEqual(['exactitude']);
    expect(LECTEUR.direLeRisque(risque)).toContain('1 lentille exigée : exactitude');
  });

  it('REQ-GOV-011 — des tests et l’outillage interne du registre et des vues, en zone qualité, restent à une lentille', () => {
    const { exigees } = lentilles({
      titre: 'test(QA-T11): un témoin de plus',
      taches: [QUALITE],
      fichiers: ['tests/a11y/x.spec.ts', 'scripts/vues/fusion.ts', 'scripts/plan-state/build.ts'],
    });
    expect(exigees).toEqual(['exactitude']);
  });

  it('REQ-GOV-011 — TÉMOIN : la même PR qui ajoute un fichier sous src/ en exige DEUX', () => {
    const { risque, exigees } = lentilles({ fichiers: ['docs/guide.md', 'src/lib/horloge.ts'] });
    expect(risque.uneLentille).not.toBe(true);
    expect(exigees).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 — TÉMOIN : la même PR qui ajoute un fichier sous scripts/gates/ en exige DEUX', () => {
    const { exigees } = lentilles({ fichiers: ['docs/guide.md', 'scripts/gates/gov-etat.ts'] });
    expect(exigees).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 — le processus reste à deux : racine, dossier caché, config/, déploiement, schéma', () => {
    for (const f of [
      'package.json',
      '.github/workflows/ci.yml',
      'config/entite.json',
      'scripts/image/publier.sh',
      'prisma/schema.prisma',
    ]) {
      expect(lentilles({ fichiers: ['docs/guide.md', f] }).exigees, f).toContain('securite');
    }
  });

  it('REQ-GOV-011 — TÉMOIN : scripts/lot/ entier vaut deux lentilles — garde des revues, clôture, écrivains du registre', () => {
    for (const f of [
      'scripts/lot/revues.ts',
      'scripts/lot/corps-de-pr.ts',
      'scripts/lot/cloture.ts',
      'scripts/lot/attestation.ts',
      'scripts/lot/chemins-de-tache.ts',
    ]) {
      expect(LECTEUR.fichierAUneLentille(f), f).toBe(false);
      expect(lentilles({ fichiers: [f] }).exigees, f).toEqual(['exactitude', 'securite']);
    }
  });

  it('REQ-GOV-011 — TÉMOIN : une liste de fichiers incomplète en exige DEUX', () => {
    const { exigees } = lentilles({
      fichiers: ['docs/guide.md'],
      liste: { source: 'forge', lues: 1, annoncees: 2 },
    });
    expect(exigees).toEqual(['exactitude', 'securite']);
    expect(lentilles({ fichiers: ['docs/guide.md'], liste: null }).exigees).toEqual([
      'exactitude',
      'securite',
    ]);
  });

  it('REQ-GOV-011 — une tâche non résolue, un registre de base illisible ou un diff vide en exigent DEUX', () => {
    expect(lentilles({ titre: 'docs: sans tâche', fichiers: ['docs/guide.md'] }).exigees).toEqual([
      'exactitude',
      'securite',
    ]);
    expect(lentilles({ fichiers: ['docs/guide.md'], tachesBase: null }).exigees).toEqual([
      'exactitude',
      'securite',
    ]);
    expect(lentilles({ fichiers: [] }).exigees).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 — la zone de la tâche compte : juridique, argent, sécurité, zone absente ou inconnue en exigent DEUX', () => {
    for (const zone of [
      'juridique',
      'argent',
      'securite',
      'domaine',
      'integration',
      null,
      'inventee',
    ]) {
      const t: Tache = { id: 'GOV-124', zone, sensible: [], schema: false };
      expect(
        lentilles({ taches: [t], fichiers: ['docs/guide.md'] }).exigees,
        String(zone)
      ).toContain('securite');
    }
  });

  it('REQ-GOV-011 — une tâche sensible, ou la base qui la dit sensible, en exige DEUX', () => {
    const sensible: Tache = { ...DOC, sensible: ['rgpd'] };
    expect(lentilles({ taches: [sensible], fichiers: ['docs/guide.md'] }).exigees).toContain(
      'securite'
    );
    expect(
      lentilles({ taches: [DOC], tachesBase: [sensible], fichiers: ['docs/guide.md'] }).exigees
    ).toContain('securite');
  });

  it('REQ-GOV-013 — l’auteur ne déclare rien : aucun label ne fait passer une PR élevée à une lentille', () => {
    for (const label of ['une-lentille', 'role:gardien-spec', 'documentation']) {
      const { exigees } = lentilles({ fichiers: ['src/lib/horloge.ts'], labels: [label] });
      expect(exigees, label).toEqual(['exactitude', 'securite']);
    }
  });

  it('REQ-GOV-013 — le schéma exige toujours l’architecte, jamais une lentille seule', () => {
    const { exigees } = lentilles({ fichiers: ['docs/guide.md'], labels: ['schema'] });
    expect(exigees).toContain('schema');
    expect(exigees).toContain('securite');
  });

  it('REQ-GOV-011 — la liste d’autorisation est FERMÉE et écrite', () => {
    expect([...LECTEUR.RACINES_A_UNE_LENTILLE]).toEqual([
      'docs/',
      'tests/a11y/',
      'scripts/vues/',
      'scripts/plan-state/',
    ]);
    // La relecture proportionnée (#319, 5988252245, point 2, amendée par 6032068586) y fait entrer
    // `espace` et `console`, pour leurs seuls fichiers sans données : la liste reste FERMÉE.
    expect([...LECTEUR.ZONES_A_UNE_LENTILLE]).toEqual([
      'gouvernance',
      'qualite',
      'espace',
      'console',
    ]);
    expect([...LECTEUR.RACINES_SANS_DONNEES]).toEqual(['src/content/micro-copy/']);
  });

  it('REQ-GOV-011 — TÉMOIN : une PR qui ne change que `sensible` dans docs/tasks.json en exige DEUX', () => {
    // Relevé de la lentille `exactitude` (PR #246) : retirer `argent` du `sensible` d'une tâche,
    // relu par une seule lentille, ferait passer à une lentille toutes les PR suivantes de la tâche.
    const avant: Tache = { ...DOC, sensible: ['argent'] };
    const apres: Tache = { ...DOC, sensible: [] };
    const { exigees } = lentilles({
      taches: [apres],
      tachesBase: [avant],
      fichiers: ['docs/tasks.json'],
    });
    expect(exigees).toEqual(['exactitude', 'securite']);
    // Même avec une base qui ne disait rien de sensible : le registre lui-même vaut deux lentilles.
    expect(lentilles({ fichiers: ['docs/tasks.json'] }).exigees).toEqual([
      'exactitude',
      'securite',
    ]);
  });

  it('REQ-GOV-011 — les registres du calcul et les textes du processus valent deux lentilles, même sous docs/', () => {
    for (const f of LECTEUR.EXCLUS_D_UNE_LENTILLE) {
      const chemin = f.endsWith('/') ? `${f}0026-x.md` : f;
      expect(LECTEUR.fichierAUneLentille(chemin), chemin).toBe(false);
      expect(lentilles({ fichiers: ['docs/guide.md', chemin] }).exigees, chemin).toContain(
        'securite'
      );
    }
    expect(LECTEUR.fichierAUneLentille('docs/journal/2026-09-pr-1.md')).toBe(true);
  });

  it('REQ-GOV-011 — TÉMOIN : une PR qui ne touche que docs/rgpd/registre-article-30.md, lu à l’exécution par src/, en exige DEUX', () => {
    for (const f of [
      'docs/rgpd/registre-article-30.md',
      'docs/contrat/CONTRAT-APPORTEUR-V1.md',
      'docs/tiers/zeptomail.md',
      'docs/GLOSSAIRE.md',
      'docs/PRESEANCE.md',
      'docs/env.md',
    ]) {
      expect(lentilles({ fichiers: [f] }).exigees, f).toEqual(['exactitude', 'securite']);
    }
  });

  it('REQ-GOV-011 — TÉMOIN : le témoin d’une garde vaut la garde — tests de gouvernance, de sécurité et d’intégration à DEUX lentilles (GOV-126)', () => {
    for (const f of [
      'tests/unit/gouvernance/une-lentille-pour-une-pr-sans-risque.spec.ts',
      'tests/unit/securite/x.spec.ts',
      'tests/integration/idor.spec.ts',
    ]) {
      expect(LECTEUR.fichierAUneLentille(f), f).toBe(false);
      expect(lentilles({ fichiers: [f] }).exigees, f).toEqual(['exactitude', 'securite']);
    }
    // Contre-témoin : un test hors de ces trois dossiers reste à une lentille.
    expect(LECTEUR.fichierAUneLentille('tests/a11y/x.spec.ts')).toBe(true);
  });

  it('REQ-GOV-011 — TÉMOIN : dans tests/, seul a11y reste à une lentille ; le domaine, le contrat, le juridique, les fixtures et les témoins de qualité en exigent DEUX (GOV-126)', () => {
    for (const f of [
      'tests/unit/domaine/prorata.spec.ts',
      'tests/unit/contrat/x.spec.ts',
      'tests/unit/juridique/x.spec.ts',
      'tests/unit/integration/x.spec.ts',
      'tests/unit/espace/x.spec.ts',
      'tests/unit/ci/x.spec.ts',
      'tests/gov/x.spec.ts',
      'tests/fixtures/grille.json',
      'tests/setup.ts',
      'tests/unit/qualite/pipeline-image.spec.ts',
      'tests/unit/qualite/journal-redige.spec.ts',
    ]) {
      expect(LECTEUR.fichierAUneLentille(f), f).toBe(false);
      expect(lentilles({ fichiers: [f] }).exigees, f).toEqual(['exactitude', 'securite']);
    }
    expect(LECTEUR.fichierAUneLentille('tests/a11y/x.spec.ts')).toBe(true);
  });
});
