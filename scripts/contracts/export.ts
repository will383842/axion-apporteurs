/**
 * export.ts — les artefacts publiés du contrat d'événements, DÉRIVÉS du descripteur (RM-01).
 *
 * USAGE : npx tsx scripts/contracts/export.ts              écrit les trois artefacts
 *         npx tsx scripts/contracts/export.ts --verifier   n'écrit rien ; sort 1 si un artefact
 *                                                          commité diffère de ce que le
 *                                                          descripteur produit
 *
 * L'alias `pnpm contracts:export` est celui que l'acceptation d'INT-T01a nomme ; `package.json`
 * est un fichier PARTAGÉ, la ligne à y ajouter est demandée dans le RENDU de la tâche.
 *
 * TROIS ARTEFACTS, UNE SOURCE.
 *
 *   — `contracts.v<N>.json` — le JSON Schema, canonisé (clés triées, deux espaces d'indentation,
 *     saut de ligne final). La canonisation n'est pas cosmétique : une empreinte n'a de sens que
 *     sur une sérialisation déterministe, et l'ordre d'insertion d'un objet JavaScript ne l'est
 *     pas d'une version de code à l'autre.
 *   — `contracts.sha256` — l'empreinte du fichier précédent, au format `sha256sum` (empreinte,
 *     deux espaces, nom du fichier) pour qu'un `sha256sum -c contracts.sha256` la vérifie sans
 *     outil de ce dépôt, y compris depuis axionia.
 *   — `events.zod.ts` — le schéma Zod que REQ-INT-003 nomme, GÉNÉRÉ. Il n'est importé nulle part
 *     ici : `zod` n'est pas une dépendance de ce dépôt et `package.json` est partagé. Le générer
 *     quand même est ce qui garantit qu'il ne sera jamais TRANSCRIT à la main le jour où la
 *     dépendance arrivera — c'est exactement le défaut que REQ-QA-007 veut rendre impossible.
 *
 * POURQUOI L'EMPREINTE PORTE SUR LE JSON SCHEMA, ET PAS SUR LE ZOD. Un objet Zod n'a pas de
 * sérialisation canonique : deux versions de la bibliothèque rendent deux structures internes
 * différentes pour le même schéma, et l'empreinte changerait sans que le contrat ait bougé. Le
 * JSON Schema, lui, est du texte. C'est donc lui qui traverse la frontière et lui qu'on hache.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHAMPS_ENVELOPPE, SCHEMA_VERSION } from '../../packages/contracts/enveloppe';
import { TYPES_EVENEMENT, contratJsonSchema } from '../../packages/contracts/events';

export const RACINE_CONTRATS = 'packages/contracts';
export const NOM_JSON_SCHEMA = `contracts.v${SCHEMA_VERSION}.json`;
export const NOM_EMPREINTE = 'contracts.sha256';
export const NOM_ZOD = 'events.zod.ts';

/** Tri récursif des clés : la seule sérialisation qu'on puisse hacher deux fois avec le même résultat. */
function trier(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(trier);
  if (valeur !== null && typeof valeur === 'object') {
    const entrees = Object.entries(valeur as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entrees.map(([c, v]) => [c, trier(v)]));
  }
  return valeur;
}

/** Le texte publié d'une valeur JSON. Saut de ligne final : un fichier texte se termine par `\n`. */
export function canoniser(valeur: unknown): string {
  return `${JSON.stringify(trier(valeur), null, 2)}\n`;
}

/** L'empreinte d'un texte, en hexadécimal minuscule. */
export function empreinte(texte: string): string {
  return createHash('sha256').update(texte, 'utf8').digest('hex');
}

/**
 * La projection Zod du MÊME descripteur. Chaque champ rend l'expression que
 * `packages/contracts/enveloppe.ts` porte à côté de sa projection JSON Schema : les deux vivent
 * dans le même enregistrement, on ne les transcrit pas l'une depuis l'autre.
 */
export function sourceZod(): string {
  const champs = CHAMPS_ENVELOPPE.map((c) => `  ${c.nom}: ${c.zod},`).join('\n');
  const types = TYPES_EVENEMENT.map((t) => `  '${t}',`).join('\n');
  return [
    '/**',
    ' * events.zod.ts — FICHIER GÉNÉRÉ par `scripts/contracts/export.ts`. NE PAS ÉDITER.',
    ' *',
    ' * Source unique : `packages/contracts/enveloppe.ts` et `packages/contracts/events.ts`.',
    ' * Toute correction se fait là-bas, puis `pnpm contracts:export` ; `--verifier` rougit sinon.',
    ' *',
    " * `zod` n'est pas encore une dépendance de ce dépôt : ce fichier n'est importé nulle part et",
    " * n'est pas typé par `tsc`. Il l'est le jour où la dépendance est ajoutée, sans une ligne à",
    ' * retaper (REQ-INT-003, REQ-QA-007, RM-01).',
    ' */',
    '',
    "import { z } from 'zod';",
    '',
    `export const SCHEMA_VERSION = ${SCHEMA_VERSION};`,
    '',
    'export const TYPES_EVENEMENT = [',
    types,
    '] as const;',
    '',
    'export const enveloppeEvenement = z',
    '  .object({',
    champs.replace(/^ {2}/gm, '    '),
    '  })',
    '  .strict();',
    '',
    'export type EnveloppeEvenement = z.infer<typeof enveloppeEvenement>;',
    '',
  ].join('\n');
}

export type Artefact = { chemin: string; contenu: string };

/** Les trois artefacts, en mémoire. C'est cette fonction que le test de contrat confronte au disque. */
export function artefacts(): Artefact[] {
  const jsonSchema = canoniser(contratJsonSchema());
  return [
    { chemin: join(RACINE_CONTRATS, NOM_JSON_SCHEMA), contenu: jsonSchema },
    { chemin: join(RACINE_CONTRATS, NOM_EMPREINTE), contenu: `${empreinte(jsonSchema)}  ${NOM_JSON_SCHEMA}\n` },
    { chemin: join(RACINE_CONTRATS, NOM_ZOD), contenu: sourceZod() },
  ];
}

// ── ligne de commande ────────────────────────────────────────────────────────

/** Les fins de ligne du disque ne portent pas de sens ici : `.gitattributes` impose `eol=lf`. */
const normaliser = (texte: string): string => texte.replace(/\r\n/g, '\n');

function principal(): void {
  const verifier = process.argv.includes('--verifier');
  if (!existsSync(RACINE_CONTRATS)) mkdirSync(RACINE_CONTRATS, { recursive: true });

  const ecarts: string[] = [];
  for (const artefact of artefacts()) {
    if (!verifier) {
      writeFileSync(artefact.chemin, artefact.contenu, 'utf8');
      continue;
    }
    if (!existsSync(artefact.chemin)) {
      ecarts.push(`${artefact.chemin} est absent : lance \`pnpm contracts:export\`.`);
      continue;
    }
    if (normaliser(readFileSync(artefact.chemin, 'utf8')) !== artefact.contenu) {
      ecarts.push(
        `${artefact.chemin} diffère de ce que le descripteur produit. L'artefact est une VUE : ` +
          'corrige `packages/contracts/`, puis regénère — ne l\'édite pas.',
      );
    }
  }

  if (!verifier) {
    console.log(`✅ contracts:export — ${artefacts().length} artefacts écrits sous ${RACINE_CONTRATS}/`);
    return;
  }
  if (ecarts.length > 0) {
    console.error(`❌ contracts:export — ${ecarts.length} artefact(s) hors dérivation (RM-01, REQ-QA-007) :`);
    for (const e of ecarts) console.error(`   • ${e}`);
    process.exit(1);
  }
  console.log('✅ contracts:export --verifier — les artefacts publiés sont ceux que le descripteur produit.');
}

if (process.argv[1] !== undefined && /contracts[\\/]export\.ts$/.test(process.argv[1])) {
  principal();
}
