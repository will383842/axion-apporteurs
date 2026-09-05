/**
 * paths-proposes.ts — le SEUL écrivain de `docs/paths-proposes.json` (GOV-017b).
 *
 * USAGE : tsx scripts/lot/paths-proposes.ts            (écrit `docs/paths-proposes.json`)
 *         tsx scripts/lot/paths-proposes.ts --check    (échoue si le fichier rendu diverge)
 *         tsx scripts/lot/paths-proposes.ts --out <chemin>
 *
 * POURQUOI UN SCRIPT. Le bloc `resume` porte trois TOTAUX — paires de tâches qui s'intersectent,
 * chemins partagés, tâches isolées. Un total tapé à la main n'est pas un total : il est faux au
 * premier chemin ajouté, et rien ne le dit. Le fichier rendu est donc une VUE ; la source est
 * d'un côté la liste manuelle ci-dessous, de l'autre `docs/tasks.json` et `docs/gates.json`.
 *
 * CE QUI EST DÉRIVÉ, ET DE QUOI. Le premier tour avait INVENTÉ les noms de fichiers de garde
 * (`ssot-seuils.ts` pour `seuils-ssot.ts`, `schema-centimes.ts` pour `schema-cents.ts`,
 * `roles-ast.ts` pour `roles.ts`…). Un nom inventé ne peut produire aucune collision réelle :
 * c'est l'objet même de la tâche qui disparaît. Cinq familles sont donc DÉRIVÉES, jamais saisies :
 *
 *   [gardes]    `docs/gates.json` dit, pour chacune de ses entrées, quel `script` la porte et
 *               quelle `tache` l'écrit. Le suffixe `#<job>` d'un chemin de workflow est retiré :
 *               une tâche écrit `.github/workflows/ci.yml`, pas un job.
 *   [registre]  « `preuveRouge` = l'URL du run CI rouge archivé, remplie par la PR qui pose la
 *               gate » (`docs/gates.json`, en-tête). Toute tâche propriétaire d'au moins une
 *               entrée écrit donc `docs/gates.json`.
 *   [tests]     le champ `tests{}` de `docs/tasks.json` nomme les fichiers de test que la tâche
 *               écrit ; la partie avant le `#` est un chemin. Cinq tâches de gouvernance écrivent
 *               PROUVABLEMENT le même `tests/unit/gouvernance/gardes.spec.ts` : elles étaient
 *               disjointes au premier tour.
 *   [schema]    `schema: true` ⇒ la tâche touche `prisma/**` ou `packages/contracts/**`
 *               (`scripts/lot/tasks.schema.json`) ⇒ elle porte `prisma/schema.prisma`.
 *   [depot]     une tâche `repo: "axionia"` n'écrit aucun fichier du dépôt partners : tous ses
 *               chemins sont préfixés `axionia/` (REQ-GOV-025). Vérifié, pas supposé.
 *
 * CE QUI N'EST PAS DÉRIVABLE, ET QUI EST DONC SIGNALÉ AU LIEU D'ÊTRE INVENTÉ :
 *   — 22 valeurs de `tests{}` ne portent AUCUN répertoire (« regles-maison.spec.ts ») ; leur
 *     répertoire n'est écrit nulle part. Elles sont listées dans `resume.testsSansRepertoire`.
 *     Inventer `tests/gov/…` aurait fabriqué un chemin qui ne croisera jamais le vrai.
 *   — trois gardes que l'acceptance de JUR-T30 nomme n'ont aucune entrée au registre. Leur nom de
 *     fichier est dérivé de la convention observée sur les quatre gardes `jur:*` de JUR-T26
 *     (identifiant, deux-points remplacé par un tiret, sous `scripts/gates/`) et le manque est
 *     reporté dans `resume.gardesSansEntreeAuRegistre`.
 *
 * FICHIERS DÉRIVÉS, QU'AUCUNE TÂCHE N'ÉCRIT À LA MAIN. `docs/PLAN-STATE.md` est produit par
 * `pnpm plan-state:build`, commité par le poste A01 seul, et `Write/Edit` y est refusé par la
 * matrice d'autonomie ; `docs/TASKS.md` est produit par `pnpm gov:tasks --render`. Les déclarer
 * fabriquait des collisions inexistantes sur cinq tâches. Seule GOV-008, qui écrit le
 * GÉNÉRATEUR, les porte — sous la forme du générateur.
 *
 * LIMITE CONNUE DU CONTRÔLE DE DISJONCTION. Le composeur compare des chaînes exactes
 * (`scripts/lot/composer.ts`, `pris.has(p)`). Un chemin de répertoire (`emails/apporteur/`) ne
 * croise donc JAMAIS un chemin de fichier situé dessous. Deux tâches ne se voient que si elles
 * écrivent la MÊME chaîne.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHEMIN_TACHES = 'docs/tasks.json';
const CHEMIN_GATES = 'docs/gates.json';
const SORTIE_PAR_DEFAUT = 'docs/paths-proposes.json';

type Tache = { id: string; repo: string; schema: boolean; tests?: Record<string, string[]> };
type Gate = { script: string; tache: string };

/**
 * Les chemins que seule la lecture des acceptances donne : ils ne se dérivent d'aucun champ.
 * Tout ce qui EST dérivable est ajouté plus bas — ne le recopie pas ici.
 */
const MANUELS: Record<string, string[]> = {
  'GOV-000': ['package.json', 'README.md', '.github/workflows/ci.yml', '.claude/settings.json', '.claude/agents/', '.claude/skills/lot/SKILL.md', 'scripts/lot/composer.ts', 'scripts/lot/cloture.ts', 'scripts/lot/lot.workflow.js', 'scripts/lot/tasks.schema.json', 'scripts/plan-state/build.ts', 'scripts/gates/gov-check.ts', 'scripts/gates/hook-env.js', 'docs/tasks.json'],
  'GOV-007': ['docs/CHARTE-AGENTS.md', '.github/PULL_REQUEST_TEMPLATE.md', '.github/CODEOWNERS'],
  'GOV-001': ['docs/REQUIREMENTS.md', 'docs/requirements.json', 'docs/REQUIREMENTS-ANNEXE-FUSIONS.md'],
  'GOV-018': ['docs/REGLES-MAISON.md', 'docs/LECONS.md', '.github/PULL_REQUEST_TEMPLATE.md',
              'scripts/gates/gov-lecons.ts', 'tests/unit/gouvernance/regles-maison.spec.ts'],
  'GOV-008': ['docs/PLAN-STATE.md', 'scripts/plan-state/build.ts', '.claude/skills/lot/SKILL.md'],
  'GOV-002': ['docs/PRESEANCE.md', 'docs/contrat/CONTRAT-APPORTEUR-V1.md'],
  'GOV-003': ['scripts/gates/gov-identifiants.ts', 'docs/gates.json'],
  'GOV-004': ['docs/AFFIRMATIONS-AXIONIA.md', 'scripts/gates/gov-sonde.ts'],
  'GOV-005': ['docs/DECISIONS.md', 'scripts/gates/gov-hypotheses.ts'],
  'GOV-006': ['docs/GLOSSAIRE.md', 'scripts/gates/schema-enums.ts'],
  'GOV-009': ['docs/adr/'],
  'GOV-010': ['scripts/gates/gov-adr.ts'],
  'GOV-011': ['docs/TRACABILITE.md', 'scripts/gates/gov-trace.ts',
              'tests/unit/gouvernance/tracabilite.spec.ts'],
  'GOV-012': ['docs/runbooks/fusion-partners.md', '.github/workflows/ci.yml', 'docs/gates.json'],
  'GOV-013': ['docs/gates.json'],
  'GOV-014': ['docs/CONVENTIONS.md', 'eslint.config.mjs', '.prettierrc', 'package.json'],
  'GOV-015': ['docs/tiers/recherche-entreprises.md', 'docs/tiers/docuseal.md', 'docs/tiers/zeptomail.md', 'docs/tiers/telegram.md', 'docs/tiers/sepa-pain001.md', 'docs/tiers/urssaf.md', 'docs/tiers/tiime.md'],
  'INT-T01a': ['packages/contracts/events.ts', 'packages/contracts/enveloppe.ts', 'scripts/contracts/export.ts', 'package.json', 'tests/fixtures/axionia/'],
  'INT-T01b': ['axionia/scripts/partners/fixtures.ts', 'axionia/src/server/partners-sync/contracts/'],
  'GOV-017a': ['docs/tasks.json', 'scripts/lot/tasks.schema.json', 'scripts/gates/gov-tasks.ts'],
  'GOV-017b': ['docs/tasks.json', 'scripts/lot/tasks.schema.json', 'scripts/gates/gov-tasks.ts', 'docs/paths-proposes.json', 'scripts/lot/paths-proposes.ts'],
  'GOV-019': ['scripts/gates/bundle-par-route.ts'],
  'GOV-020': ['docs/INVENTAIRE-CHANTIERS.md', 'scripts/gates/gov-inventaire.ts',
              'tests/unit/gouvernance/inventaire-prouve.spec.ts'],
  'GOV-023': ['docs/agents.json', '.claude/agents/', 'package.json'],
  'QA-T00': ['scripts/gates/prove.sh', 'docs/gates.json', '.github/workflows/nightly.yml'],
  'JUR-T02': ['src/domain/seuils/ssot.ts', 'docs/gates.json'],
  'CPL-T01': ['docs/decisions/CPL-T01'],
  'QA-T01': ['vitest.config.ts', 'tests/setup.ts', '.github/workflows/ci.yml'],
  'SEC-01': ['src/lib/env.ts', '.env.example'],
  'SEC-02': ['src/middleware.ts', 'next.config.ts'],
  'SEC-10': ['src/server/securite/rate-limit.ts'],
  'QA-T08': ['src/lib/logger.ts', 'src/lib/notify.ts', 'sentry.server.config.ts'],
  'DM-01': ['prisma/schema.prisma', 'prisma/migrations/', 'src/domain/evenement/journal.ts'],
  'DM-02': ['scripts/gates/schema-enums.ts', 'docs/gates.json'],
  'QA-T02': ['tests/integration/harnais.ts', 'vitest.config.ts'],
  'QA-T04': ['src/lib/env.ts', 'src/app/api/livez/route.ts', 'src/app/api/readyz/route.ts', 'Dockerfile', 'docker-entrypoint.sh'],
  'QA-T03': ['scripts/gates/req-check.ts', 'docs/requirements.json', '.github/workflows/ci.yml'],
  'QA-T07': ['.semgrep.yml', '.github/workflows/ci.yml', 'docs/gates.json'],
  'QA-T30': ['stryker.config.json', '.github/workflows/nightly.yml'],
  'CPL-T22': ['.github/workflows/ci.yml', 'docs/gates.json'],
  'SEC-08': ['src/server/securite/pii.ts', 'scripts/gates/schema-pii.ts', 'docs/gates.json'],
  'QA-T05': ['.github/workflows/deploy.yml', 'Dockerfile'],
  'QA-T11': ['.github/workflows/ci.yml', 'docs/gates.json'],
  'QA-T06': ['.github/workflows/preview.yml', 'prisma/seed.ts'],
  'QA-T12': ['.github/workflows/backup.yml', 'docs/runbooks/sauvegarde.md'],
  'QA-T13': ['.github/workflows/rollback.yml', 'docs/runbooks/rollback.md', 'docs/runbooks/socle.md'],
  'DM-03-A': ['axionia/src/content/pricing.ts', 'axionia/src/server/partners-sync/grille/export.ts'],
  'DM-03-P': ['src/server/grille/import.ts', 'src/domain/commission/grille.ts', 'prisma/schema.prisma'],
  'DM-04': ['src/domain/commission/calcul.ts'],
  'INT-T02': ['axionia/src/server/partners-sync/outbox.ts', 'axionia/prisma/schema.prisma'],
  'INT-T03': ['axionia/src/server/partners-sync/producteurs/client.ts', 'axionia/prisma/schema.prisma'],
  'INT-T04': ['axionia/src/server/partners-sync/producteurs/devis.ts'],
  'INT-T05': ['axionia/src/server/partners-sync/producteurs/facturation.ts', 'axionia/prisma/schema.prisma'],
  'INT-T22': ['axionia/src/server/partners-sync/producteurs/candidature.ts'],
  'SEC-06': ['src/app/api/webhooks/axionia/route.ts', 'src/server/integrations/axionia/reception.ts', 'src/server/queue/workers/evenement-recu.ts', 'prisma/schema.prisma'],
  'SEC-07': ['src/server/integrations/axionia/api-entrante.ts', 'src/app/api/integrations/axionia/'],
  'SEC-03': ['src/server/auth/lien-magique.ts', 'src/app/(espace)/connexion/', 'prisma/schema.prisma'],
  'SEC-04': ['src/server/auth/session.ts', 'prisma/schema.prisma'],
  'SEC-05': ['src/server/acces/for-apporteur.ts', 'docs/gates.json'],
  'SEC-17': ['src/server/roles/matrice.ts', 'src/server/roles/require-role.ts', 'prisma/schema.prisma'],
  'INT-T09': ['src/server/integrations/recherche-entreprises/', 'docs/tiers/recherche-entreprises.md', 'tests/fixtures/recherche-entreprises/'],
  'INT-T10': ['src/server/integrations/zeptomail/', 'docs/tiers/zeptomail.md', 'src/app/api/webhooks/zeptomail/route.ts'],
  'INT-T11': ['src/server/mcp/'],
  'INT-T14': ['src/server/integrations/telegram/', 'docs/tiers/telegram.md'],
  'DM-06': ['prisma/schema.prisma', 'src/domain/apporteur/statut.ts', 'src/domain/apporteur/matrice.ts'],
  'JUR-T01': ['docs/contrat/CONTRAT-APPORTEUR-V1.md', 'docs/contrat/ANNEXE-2-MANDAT.md', 'docs/DECISIONS.md', 'scripts/gates/lexique-apporteurs.ts'],
  'JUR-T03': ['axionia/src/content/commercial-offer.ts'],
  'JUR-T04': ['docs/rgpd/registre-article-30.md', 'docs/rgpd/aipd.md', 'src/app/(espace)/confidentialite/page.tsx'],
  'UX-P0-01': ['messages/fr.json', 'src/content/micro-copy/'],
  'UX-P0-02': ['docs/maquettes/', 'docs/ESPACE-ROUTES.md'],
  'UX-P0-03': ['tests/a11y/', 'playwright.config.ts'],
  'QA-T20': ['lighthouserc.json', '.github/workflows/ci.yml'],
  'JUR-T29': ['axionia/src/content/commercial-offer.ts'],
  'CPL-T13': ['src/domain/temps/', 'src/domain/attribution/seuil-prioritaire.ts'],
  'JUR-T01b': ['docs/contrat/CONTRAT-APPORTEUR-V1.md'],
  'JUR-T01c': ['docs/contrat/ANNEXE-2-MANDAT.md'],
  'DM-07': ['prisma/schema.prisma', 'prisma/migrations/', 'src/domain/attribution/etats.ts'],
  'DM-08': ['src/domain/attribution/machine.ts', 'src/domain/attribution/etats.ts'],
  'DM-24': ['src/server/crons/confirmation-tacite.ts', 'src/domain/attribution/machine.ts'],
  'DM-25': ['src/server/crons/anteriorite-retroactive.ts', 'src/domain/entreprise-connue/anteriorite.ts'],
  'INT-T07-P': ['src/app/api/integrations/axionia/', 'src/server/integrations/axionia/attributions-dto.ts'],
  'INT-T07-A': ['axionia/src/server/partners-sync/client-attributions.ts'],
  'INT-T08-A': ['axionia/src/app/api/partners/relecture/route.ts'],
  'INT-T08-P': ['src/server/crons/reconciliation.ts'],
  'SEC-11': ['src/server/auth/jeton-depot.ts', 'prisma/schema.prisma'],
  'SEC-12': ['src/server/depot/controles.ts', 'src/domain/attribution/depot.ts'],
  'DM-09': ['prisma/schema.prisma', 'src/domain/qualification/'],
  'DM-10-P': ['prisma/schema.prisma', 'src/domain/entreprise-connue/anteriorite.ts', 'src/domain/seuils/ssot.ts'],
  'DM-11': ['prisma/schema.prisma', 'src/domain/kyc/pieces.ts'],
  'DM-12': ['prisma/schema.prisma', 'src/domain/anomalie/'],
  'DM-13': ['src/server/crons/attribution.ts', 'src/domain/attribution/machine.ts'],
  'SEC-14': ['src/domain/anomalie/', 'src/server/anomalie/evaluation.ts'],
  'SEC-15': ['prisma/schema.prisma', 'src/domain/apporteur/suspension.ts'],
  'SEC-28': ['src/server/crons/levee-gel.ts', 'src/domain/apporteur/suspension.ts', 'tests/security/cliquet-gel.spec.ts'],
  'SEC-16': ['src/server/verification/dto.ts', 'src/domain/verification/etats.ts'],
  'SEC-18': ['src/server/parrainage/anti-auto.ts', 'prisma/schema.prisma'],
  'SEC-19': ['src/domain/apporteur/resiliation.ts', 'src/server/auth/session.ts', 'prisma/schema.prisma'],
  'INT-T12': ['src/server/integrations/docuseal/', 'docs/tiers/docuseal.md', 'src/app/api/webhooks/docuseal/route.ts', 'prisma/schema.prisma'],
  'INT-T13': ['src/server/mcp/'],
  'INT-T21-A': ['axionia/src/app/api/partners/relecture/route.ts'],
  'INT-T21-P': ['scripts/backfill/axionia.ts'],
  'SEC-21': ['src/server/parrainage/code.ts', 'prisma/schema.prisma'],
  'JUR-T09': ['emails/prospect/information-article-14.tsx', 'src/content/script-qualification.ts'],
  'JUR-T13': ['emails/apporteur/', 'src/content/micro-copy/', 'src/app/(espace)/', 'scripts/gates/lexique-apporteurs.ts'],
  'CPL-T06': ['prisma/schema.prisma', 'src/domain/candidature/decision.ts'],
  'UX-P1-04': ['src/app/(espace)/connexion/'],
  'UX-P1-01': ['src/app/(espace)/entreprise/page.tsx', 'src/app/(espace)/page.tsx', 'docs/ESPACE-ROUTES.md'],
  'UX-P1-02': ['src/app/(espace)/deposer/page.tsx', 'src/components/depot/formulaire.tsx'],
  'UX-P1-03': ['src/app/(espace)/d/[jeton]/page.tsx', 'src/components/depot/formulaire.tsx'],
  'UX-P1-05': ['src/app/(espace)/mes-entreprises/page.tsx'],
  'UX-P1-06': ['src/app/(console)/qualification/[id]/page.tsx'],
  'UX-P1-07': ['src/app/(console)/qualification/page.tsx', 'src/app/(console)/qualification/[id]/page.tsx'],
  'UX-P1-08': ['src/app/(espace)/page.tsx', 'src/app/(espace)/layout.tsx'],
  'QA-T20b': ['.github/workflows/ci.yml'],
  'UX-P1-09': ['src/app/(espace)/conformite/page.tsx', 'src/app/(espace)/profil/page.tsx'],
  'UX-P1-15': ['src/app/(espace)/profil/page.tsx', 'src/components/depot/formulaire.tsx', 'prisma/schema.prisma'],
  'UX-P1-10': ['src/server/notifications/table-ssot.ts', 'emails/apporteur/'],
  'UX-P1-11': ['src/server/queue/workers/onboarding.ts', 'emails/apporteur/'],
  'UX-P1-12': ['src/app/(console)/apporteurs/page.tsx', 'src/app/(console)/apporteurs/[id]/page.tsx', 'prisma/schema.prisma'],
  'UX-P1-13': ['src/app/(console)/attributions/page.tsx', 'src/app/(console)/contrats/page.tsx'],
  'DM-23': ['prisma/schema.prisma', 'src/domain/commission/grille.ts'],
  'UX-P1-14': ['src/app/(console)/grille/page.tsx', 'src/domain/commission/grille.ts'],
  'INT-T24': ['src/server/integrations/docuseal/', 'src/app/(console)/contrats/page.tsx'],
  'GOV-021': ['.github/PULL_REQUEST_TEMPLATE.md', '.claude/agents/'],
  'QA-T16': ['tests/e2e/', 'playwright.config.ts'],
  'QA-T19': ['src/server/observabilite/metriques.ts', 'src/server/integrations/telegram/', '.github/workflows/nightly.yml'],
  'JUR-T16': ['src/domain/versement/controles.ts', 'docs/gates.json'],
  'T-ARG-010': ['prisma/schema.prisma', 'src/domain/commission/ligne.ts'],
  'T-ARG-034': ['prisma/migrations/', 'prisma/schema.prisma'],
  'DM-15': ['src/domain/commission/resolution.ts', 'src/domain/commission/ligne.ts'],
  'DM-16': ['prisma/schema.prisma', 'src/domain/parrainage/'],
  'DM-18': ['src/domain/apporteur/resiliation.ts'],
  'T-ARG-015': ['src/server/argent/releve-mensuel.ts', 'src/domain/versement/controles.ts'],
  'T-ARG-016': ['src/server/argent/autofacture.ts', 'src/server/pdf/autofacture.tsx'],
  'SEC-22': ['src/server/securite/iban.ts', 'src/server/securite/pii.ts'],
  'T-ARG-017': ['src/app/(console)/lots/page.tsx', 'src/server/argent/lot.ts'],
  'T-ARG-018': ['src/server/argent/pain001.ts', 'docs/tiers/sepa-pain001.md', 'schemas/pain.001.001.03.xsd'],
  'T-ARG-019': ['src/server/argent/rapprochement.ts', 'src/app/(console)/lots/page.tsx'],
  'DM-19': ['prisma/migrations/', 'src/server/argent/cumuls.ts'],
  'T-ARG-032': ['prisma/schema.prisma', 'src/domain/kyc/pieces.ts', 'docs/tiers/urssaf.md'],
  'UX-P2-03': ['src/app/(console)/lots/page.tsx', 'src/server/argent/lot.ts'],
  'T-ARG-022': ['tests/argent/rejeu-golden.spec.ts', 'tests/argent/scenarios/'],
  'QA-T21': ['tests/argent/proprietes.spec.ts'],
  'T-ARG-036': ['tests/argent/scenarios/', 'docs/gates.json'],
  'T-ARG-037': ['src/domain/commission/calcul.ts'],
  'UX-P2-07': ['src/app/(console)/grille/page.tsx'],
  'INT-T17': ['src/app/api/integrations/axionia/', 'src/server/integrations/axionia/releve-signe.ts'],
  'UX-P2-01': ['src/app/(espace)/mes-commissions/page.tsx'],
  'UX-P2-02': ['src/app/(espace)/page.tsx'],
  'UX-P2-04': ['src/app/(espace)/documents/page.tsx', 'src/app/(espace)/filleuls/page.tsx', 'src/app/(espace)/plus/page.tsx'],
  'UX-P2-05': ['src/app/(console)/parametres/page.tsx'],
  'UX-P2-06': ['tests/security/idor.spec.ts', 'tests/security/cloisonnement-documents.spec.ts'],
  'CPL-T12': ['src/domain/contestation/', 'src/domain/seuils/ssot.ts'],
  'CPL-T14-A': ['axionia/src/server/partners-sync/producteurs/client.ts'],
  'CPL-T14-P': ['src/server/integrations/axionia/fusion-client.ts', 'src/domain/commission/resolution.ts'],
  'INT-T23': ['src/server/integrations/docuseal/'],
  'T-ARG-035': ['src/app/(console)/commissions/page.tsx'],
  'T-ARG-038': ['src/server/argent/mandat.ts', 'src/server/argent/releve-mensuel.ts'],
  'T-ARG-039': ['src/server/argent/releve-mensuel.ts', 'src/domain/seuils/ssot.ts'],
  'QA-T25': ['docs/runbooks/argent.md'],
  'QA-T29': ['tests/charge/depots-concurrents.spec.ts'],
  'CPL-T11': ['src/lib/env.ts', 'prisma/schema.prisma'],
  'CPL-T23': ['docs/runbooks/pilote.md'],
  'T-ARG-030': ['src/server/argent/export-comptable.ts', 'docs/tiers/tiime.md'],
  'T-ARG-033': ['src/server/argent/mandat.ts', 'src/domain/apporteur/resiliation.ts', 'prisma/schema.prisma'],
  'DM-20': ['src/server/rgpd/', 'src/server/crons/purge.ts', 'src/domain/seuils/retention.ts'],
  'DM-21': ['prisma/schema.prisma', 'prisma/migrations/'],
  'CPL-T15': ['prisma/schema.prisma', 'src/server/pilotage/indicateurs.ts'],
  'UX-P3-01': ['src/app/manifest.ts', 'public/sw.js', 'src/server/notifications/push.ts'],
  'UX-P3-02': ['src/app/(espace)/activite/page.tsx', 'src/app/(espace)/ressources/page.tsx'],
  'UX-P3-03': ['src/app/(espace)/aide/page.tsx'],
  'UX-P3-04': ['src/app/(console)/pilotage/page.tsx', 'src/server/pilotage/indicateurs.ts'],
  'UX-P3-05': ['src/app/(console)/conformite/page.tsx', 'src/app/(console)/anomalies/page.tsx'],
  'UX-P3-06': ['src/domain/apporteur/activite.ts'],
  'JUR-T22': ['axionia/src/app/(site)/retraite/page.tsx'],
  'SEC-26': ['src/server/notifications/table-ssot.ts', 'public/sw.js'],
  'QA-T27': ['docs/runbooks/resilience.md', '.github/workflows/nightly.yml'],
  'QA-T28': ['docs/runbooks/audit-securite.md', '.github/workflows/nightly.yml'],
  'GOV-022': ['docs/TRACEABILITE.md', 'scripts/plan-state/traceabilite.ts'],
  'EXT-T08': ['prisma/schema.prisma', 'src/domain/geo/lambert93.ts', 'src/server/depot/controles.ts'],
  'EXT-T01': ['src/app/(espace)/mes-entreprises/[id]/page.tsx', 'prisma/schema.prisma'],
  'EXT-T02a': ['src/app/(console)/attributions/[id]/page.tsx', 'src/app/(console)/qualification/[id]/page.tsx'],
  'EXT-T03': ['prisma/schema.prisma', 'src/domain/candidature/origine.ts'],
  'EXT-T04': ['src/app/(console)/candidatures/page.tsx', 'src/server/stockage/piece-jointe.ts'],
  'EXT-T06': ['src/domain/verification/etats.ts', 'src/server/anomalie/evaluation.ts'],
  'EXT-T02b': ['src/app/(espace)/mes-commissions/page.tsx', 'src/app/(espace)/mes-entreprises/[id]/page.tsx'],
  'EXT-T07': ['src/domain/attribution/machine.ts', 'src/server/crons/attribution.ts'],
  'EXT-T09': ['src/app/(console)/pilotage/carte/page.tsx', 'src/components/carte/departements.tsx', 'scripts/build/carte-svg.ts'],
  'EXT-T10': ['src/app/(espace)/mes-entreprises/page.tsx', 'src/components/carte/departements.tsx'],
  'EXT-T05': ['src/app/(console)/candidatures/page.tsx', 'src/server/candidature/import-csv.ts'],
  'EXT-T11': ['src/app/(console)/candidatures/page.tsx', 'src/server/candidature/extraction-cv.ts'],
  'JUR-T26': ['.github/CODEOWNERS', 'docs/gates.json'],
  'JUR-T24': ['src/domain/apporteur/suspension.ts', 'src/content/micro-copy/', 'src/domain/apporteur/resiliation.ts', 'src/domain/apporteur/activite.ts', 'emails/apporteur/'],
  'JUR-T30': ['scripts/gates/jur-aucune-instruction.ts', 'docs/gates.json', 'scripts/gates/lexique-apporteurs.ts', 'scripts/gates/jur-date-contact-inerte.ts', 'scripts/gates/jur-supports-de-presentation.ts'],
  'JUR-T25': ['src/server/notifications/lettre-reseau.ts', 'emails/apporteur/', 'src/domain/apporteur/activite.ts'],
  'JUR-T27': ['docs/contrat/CONTRAT-APPORTEUR-V1.md'],
  'JUR-T28': ['docs/contrat/CONTRAT-APPORTEUR-V1.md', 'src/domain/apporteur/resiliation.ts'],
};

/**
 * JUR-T30 n'est propriétaire d'aucune entrée du registre, et son acceptance en exige trois :
 * sa PR ajoute donc les trois entrées manquantes à `docs/gates.json`.
 */
const REGISTRE_EN_PLUS = ['JUR-T30'];

/** Le seul porteur légitime du dérivé de plan et de son générateur. */
const PORTEUR_DU_PLAN = 'GOV-008';
const DERIVES_INTERDITS = ['docs/PLAN-STATE.md', 'docs/TASKS.md'];

function sansJob(script: string): string {
  const i = script.indexOf('#');
  return i === -1 ? script : script.slice(0, i);
}

/** `tests{}` s'ecrit `fichier#nom-du-it` ; seule la partie fichier est un chemin. */
function sansIt(valeur: string): string {
  const i = valeur.indexOf('#');
  return i === -1 ? valeur : valeur.slice(0, i);
}

function prefixe(repo: string, chemin: string): string {
  if (repo !== 'axionia') return chemin;
  return chemin.startsWith('axionia/') ? chemin : `axionia/${chemin}`;
}

function construire() {
  const taches = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] }).taches;
  const gates = (JSON.parse(readFileSync(CHEMIN_GATES, 'utf8')) as { gates: Gate[] }).gates;

  const parTache = new Map<string, Tache>(taches.map((t) => [t.id, t]));

  // [gardes] + [registre]
  const gardesDe = new Map<string, string[]>();
  for (const g of gates) {
    const t = parTache.get(g.tache);
    if (!t) throw new Error(`${CHEMIN_GATES} : la gate ${g.script} est attribuée à ${g.tache}, qui n'est pas une tâche.`);
    const liste = gardesDe.get(g.tache) ?? [];
    liste.push(prefixe(t.repo, sansJob(g.script)));
    gardesDe.set(g.tache, liste);
  }

  // Table de résolution des noms de test SANS répertoire : un même fichier est parfois cité en
  // entier ailleurs (dans `gates.json`, ou par une autre tâche). On résout, on n'invente pas.
  const parBase = new Map<string, string>();
  const noter = (chemin: string) => {
    if (!chemin.includes('/')) return;
    const b = chemin.slice(chemin.lastIndexOf('/') + 1);
    if (!parBase.has(b)) parBase.set(b, chemin);
  };
  for (const g of gates) noter(sansJob(g.script));
  for (const t of taches) for (const l of Object.values(t.tests ?? {})) for (const v of l) noter(sansIt(v));

  const paths: Record<string, string[]> = {};
  const testsSansRepertoire: string[] = [];
  const registreHorsDepot: string[] = [];
  const schemaContredit: string[] = [];

  for (const t of taches) {
    const vus = new Set<string>();
    const ajouter = (p: string) => {
      const c = prefixe(t.repo, p);
      if (!vus.has(c)) vus.add(c);
    };

    for (const p of MANUELS[t.id] ?? []) ajouter(p);
    for (const p of gardesDe.get(t.id) ?? []) ajouter(p);

    // Le registre est un fichier du dépôt partners, à un chemin fixe : il ne se préfixe pas. Une
    // tâche `repo: axionia` possède pourtant des entrées (cinq d'entre elles) — sa PR ne peut pas
    // les remplir, puisqu'elle atterrit dans l'autre dépôt. On ne déclare rien, on le SIGNALE :
    // inventer `axionia/docs/gates.json` aurait nommé un fichier qui n'existera jamais, et écrire
    // `docs/gates.json` aurait enjambé la frontière que REQ-GOV-025 pose.
    if ((gardesDe.get(t.id) ?? []).length || REGISTRE_EN_PLUS.includes(t.id)) {
      if (t.repo === 'axionia') registreHorsDepot.push(t.id);
      else if (!vus.has('docs/gates.json')) vus.add('docs/gates.json');
    }

    for (const liste of Object.values(t.tests ?? {})) {
      for (const v of liste) {
        const fichier = sansIt(v);
        if (fichier.includes('/')) { ajouter(fichier); continue; }
        const resolu = parBase.get(fichier);
        if (resolu) { ajouter(resolu); continue; }
        const ligne = `${t.id} — ${fichier}`;
        if (!testsSansRepertoire.includes(ligne)) testsSansRepertoire.push(ligne);
      }
    }

    if (t.schema) ajouter('prisma/schema.prisma');

    const liste = [...vus];

    // La réciproque du drapeau. `scripts/lot/tasks.schema.json` : `schema` vaut true « si la tâche
    // touche prisma/** ou packages/contracts/** ». Une tâche qui déclare le schéma sans porter le
    // drapeau perd le label, la relecture bloquante de l'architecte et la règle CODEOWNERS. Le
    // drapeau appartient à `docs/tasks.json` (GOV-017a) : on le SIGNALE, on ne le corrige pas ici.
    const TOUCHE_LE_SCHEMA = /(?:^|\/)(?:prisma|packages\/contracts)\//;
    if (!t.schema && liste.some((p) => TOUCHE_LE_SCHEMA.test(p))) {
      schemaContredit.push(t.id);
    }

    // [depot] — vérifié, pas supposé.
    if (t.repo === 'axionia') {
      const intrus = liste.filter((p) => !p.startsWith('axionia/'));
      if (intrus.length) throw new Error(`${t.id} porte repo axionia et le chemin partners ${intrus.join(', ')}.`);
    }
    for (const d of DERIVES_INTERDITS) {
      if (liste.includes(d) && t.id !== PORTEUR_DU_PLAN) {
        throw new Error(`${t.id} déclare ${d}, qui est une vue générée : déclare son générateur.`);
      }
    }
    if (!liste.length) throw new Error(`${t.id} n'a aucun chemin : le contrôle de disjonction ne peut rien en faire.`);

    paths[t.id] = liste;
  }

  // ── les trois totaux ────────────────────────────────────────────────────────
  const ids = Object.keys(paths);
  const ensembles = new Map<string, Set<string>>(ids.map((id) => [id, new Set(paths[id] ?? [])]));
  const occurrences = new Map<string, number>();
  for (const id of ids) for (const p of ensembles.get(id) ?? []) occurrences.set(p, (occurrences.get(p) ?? 0) + 1);

  let pairesEnIntersection = 0;
  const croise = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const idA = ids[i] as string;
      const idB = ids[j] as string;
      const a = ensembles.get(idA) ?? new Set<string>();
      const b = ensembles.get(idB) ?? new Set<string>();
      let commun = false;
      for (const p of a) if (b.has(p)) { commun = true; break; }
      if (!commun) continue;
      pairesEnIntersection++;
      croise.add(idA);
      croise.add(idB);
    }
  }
  const isolees = ids.filter((id) => !croise.has(id));

  const resume = {
    _methode:
      "une PAIRE est comptée quand l'intersection des deux `paths[]` n'est pas vide, par égalité de " +
      'chaîne. ⚠️ Elle ne lit PAS le champ `paths` des tâches : deux tâches peuvent y figurer comme ' +
      "« sans intersection » alors que leurs `paths` déclarés se recouvrent — c'est le cas de " +
      'GOV-025 et GOV-028, qui partagent `scripts/gates/gov-identifiants.ts`. Le composeur, lui, ' +
      "compare bien `t.paths` : cette vue ne dit donc pas ce qu'il fera. Ces trois " +
      "totaux sont écrits par `scripts/lot/paths-proposes.ts` et par rien d'autre ; " +
      '`tsx scripts/lot/paths-proposes.ts --check` échoue si le fichier rendu en diverge.',
    tachesCouvertes: ids.length,
    pairesEnIntersection,
    cheminsDeclares: ids.reduce((n, id) => n + (paths[id] ?? []).length, 0),
    cheminsDistincts: occurrences.size,
    cheminsPartages: [...occurrences.values()].filter((n) => n >= 2).length,
    tachesSansAucuneIntersection: isolees.length,
    listeDesTachesIsolees: isolees,
    cheminsLesPlusPartages: [...occurrences.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([chemin, taches]) => ({ chemin, taches })),
    _consequence:
      "ce que ces totaux imposent au composeur, et qui n'est pas un choix de ce fichier mais une " +
      "lecture des deux registres : `docs/gates.json` est écrit par toute tâche qui pose une garde " +
      "(son en-tête le dit : « `preuveRouge` = l'URL du run CI rouge archivé, remplie par la PR qui " +
      'pose la gate »), et `prisma/schema.prisma` par toute tâche `schema: true`. Deux tâches de ces ' +
      "familles ne peuvent donc plus entrer dans le MÊME lot — c'est exactement le conflit d'édition " +
      'que le contrôle de disjonction existe pour empêcher, et il était invisible au premier tour.',
    testsSansRepertoire,
    registreHorsDepot,
    schemaContredit,
    gardesSansEntreeAuRegistre: [
      'JUR-T30 — jur:aucune-instruction',
      'JUR-T30 — jur:date-contact-inerte',
      'JUR-T30 — jur:supports-de-presentation',
    ],
  };

  return { version: 1, resume, paths };
}

const args = process.argv.slice(2);
const iOut = args.indexOf('--out');
const sortie = iOut === -1 ? SORTIE_PAR_DEFAUT : (args[iOut + 1] ?? SORTIE_PAR_DEFAUT);
const rendu = JSON.stringify(construire(), null, 2) + '\n';

if (args.includes('--check')) {
  const actuel = readFileSync(sortie, 'utf8');
  if (actuel !== rendu) {
    console.error(`${sortie} diverge de ce que la source produit. Relance sans --check.`);
    process.exit(1);
  }
  console.log(`${sortie} : à jour.`);
} else {
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, rendu);
  console.log(`${sortie} écrit.`);
}
