/**
 * `pnpm env:doc` — écrit `docs/env.md`, rendu du schéma de `src/lib/env.ts` (QA-T04, REQ-QA-030).
 *
 * Il n'écrit que la vue ; il ne juge rien. La garde qui rougit sur une vue périmée est
 * `tests/unit/qualite/env-fail-fast.spec.ts`, dans `pnpm test` : un générateur qui se vérifierait
 * lui-même réparerait ce qu'il contrôle et serait toujours vert.
 */
import { writeFileSync } from 'node:fs';
import { CHEMIN_DOC_ENV, documenterEnvironnement } from '../../src/lib/env';

writeFileSync(CHEMIN_DOC_ENV, documenterEnvironnement(), 'utf8');
console.log(`${CHEMIN_DOC_ENV} écrit depuis le schéma de src/lib/env.ts.`);
