/**
 * cloture.ts — écrit dans `docs/tasks.json` le résultat d'un lot. C'est le SEUL écrivain de statut.
 *
 * USAGE   : pnpm lot:cloture -- --lot <lotId> [--owner <Axx>] [--commit]
 * ENTRÉES : docs/lots/<lotId>/lot.json (le PÉRIMÈTRE du lot) · docs/lots/<lotId>/resultat.json (le
 *           rendu du workflow, écrit tel quel par la session à la fin de l'étape 4 du SKILL)
 * SORTIE  : docs/tasks.json mis à jour (statut, pr, branch, owner, lot, attempts, motif)
 *
 * POURQUOI CE SCRIPT EXISTE
 *   L'éligibilité du composeur et tout PLAN-STATE se calculent sur `t.statut` lu dans `docs/tasks.json`.
 *   Le SKILL ne mettait à jour que des LABELS d'issue, et le workflow n'écrivait rien : au deuxième
 *   `/lot`, les tâches fusionnées étaient encore `a_faire`, le composeur recomposait le même lot, et
 *   PLAN-STATE affichait « 0/25 terminées » à vie. Les labels d'issue restent une VUE ; la source des
 *   statuts est ce fichier, et cet écrivain-ci.
 *
 * INVARIANTS
 *   - LE RENDU NE DÉCIDE PAS DE SON PROPRE PÉRIMÈTRE (GOV-041). Une tâche que le lot ne déclare pas ne
 *     reçoit RIEN — pas même `t.lot`. Le 2026-09-09, un dixième `resultat.json` déposé pour une tâche
 *     d'un AUTRE lot, jamais dans la PR, a fait écrire dix `fusionnee` sans un mot, puis `gov:check`
 *     15/15 et `vitest` 614/614 : la clôture posait `t.lot = lotId` INCONDITIONNELLEMENT et ne lisait
 *     nulle part la liste des tâches du lot.
 *   - UNE ABSENCE N'EST PAS UNE AUTORISATION (GOV-041). Un `lotId` absent du rendu est refusé comme
 *     un `lotId` faux ; un périmètre introuvable est refusé, jamais lu comme un périmètre vide.
 *   - une tâche n'est `fusionnee` que si sa PR a ATTERRI (`fusion.atterri === true`) : une PR fusionnée
 *     dont l'atterrissage n'est pas vérifié n'est pas une tâche livrée.
 *   - une tâche non livrée repart `a_faire` avec `attempts++`, et bascule `bloquee` à la deuxième.
 *   - `fusionnee` exige `owner` et `branch` (schéma) : le script REFUSE d'écrire un état invalide.
 *   - une tâche dont le `repo` n'est pas celui-ci ne reçoit JAMAIS de `pr` : le numéro d'une PR
 *     d'ailleurs, écrit nu, est rendu `PR#998` par les vues et ne résout pas. Elle reçoit une
 *     `attestation` — { pr, sha entier, fusionneeAt } — et le script REFUSE de clore sans le SHA
 *     du commit de fusion (GOV-038). Fermer en silence sur un SHA manquant écrirait une livraison
 *     que plus personne ne pourrait retrouver.
 *   - le script ne DÉCIDE rien : il transcrit le rendu du workflow. Aucune interprétation.
 *
 * ⛔ DEUX MODES, ET L'IMPORT N'EN EST PAS UN. Tout ce qui lit des fichiers, des arguments, ou écrit,
 * vit dans `principal()`, appelé sous `LANCE_EN_SCRIPT` : importer ce module n'a AUCUN effet. La
 * règle, elle, est exportée — `controlerLePerimetre()`, `perimetreDuLot()`, `cloturerLeLot()` — et
 * c'est elle que la spécification APPELLE. Ce n'est pas du confort : tant que le module lisait
 * `process.argv` à l'import, `import` levait `Argument --lot manquant.` à la collecte, aucun test ne
 * pouvait atteindre sa règle, et le seul témoin possible aurait été la lecture du TEXTE de ce
 * fichier — une garde réduite à une orthographe ne garde rien (patron de `scripts/plan-state/build.ts`
 * et de `scripts/lot/composer.ts`).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  DEPOT_LOCAL,
  controlerAttestation,
  depotDeLaTache,
  referencePr,
  type Attestation,
} from './attestation';
import { outilHorsDepot } from './chemins-de-tache';

export interface Tache {
  id: string;
  titre: string;
  statut: string;
  owner?: string | null;
  lot?: string | null;
  branch?: string | null;
  pr?: number | null;
  attempts?: number;
  motif?: string | null;
  issue?: number | null;
  repo?: string;
  attestation?: Attestation | null;
}

export interface Resultat {
  dev?: {
    taskId?: string;
    branch?: string;
    pr?: number | null;
    stop?: { motif?: string; ref?: string } | null;
  } | null;
  fusion?: {
    pr?: number | null;
    sha?: string | null;
    fusionneeAt?: string | null;
    atterri?: boolean;
    motif?: string;
  } | null;
  refuse?: boolean;
  motif?: string;
}

/** Le rendu du workflow, tel que la session l'écrit dans `docs/lots/<lotId>/resultat.json`. */
export interface Rendu {
  lotId?: string;
  resultats?: (Resultat | null)[];
  stops?: { tache?: string; motif?: string; ref?: string }[];
}

/** Un refus de clôture : une FAMILLE nommée, et le message que l'opérateur lira. */
export interface RefusDeCloture {
  famille: string;
  message: string;
}

/**
 * Les identifiants que le RENDU nomme, tous chemins d'entrée confondus.
 * ⚠️ `stops` EN FAIT PARTIE. Un contrôle rangé sous la condition qui l'a fait naître garde la moitié
 * des cas : le défaut a été vu sur `resultats`, mais `stops[].tache` est le second endroit où un
 * rendu nomme une tâche, et rien n'obligeait ces deux listes à parler du même lot.
 */
function tachesNommeesParLeRendu(rendu: Rendu): string[] {
  const vus: string[] = [];
  for (const r of rendu.resultats ?? []) {
    const id = r?.dev?.taskId;
    if (id && !vus.includes(id)) vus.push(id);
  }
  for (const s of rendu.stops ?? []) {
    const id = s.tache;
    if (id && !vus.includes(id)) vus.push(id);
  }
  return vus;
}

/**
 * LE PÉRIMÈTRE D'UN LOT, ET SES DEUX SOURCES — la préséance est écrite, pas subie.
 *
 * 1. `docs/lots/<lotId>/lot.json` FAIT FOI : c'est le composeur qui l'écrit, et il dit ce que le lot
 *    portait au moment où il a été taillé.
 * 2. À DÉFAUT, le champ `lot` de `docs/tasks.json`. Ce n'est pas un repli de confort : `docs/lots/`
 *    est en `.gitignore`, donc `lot.json` n'existe que dans l'arbre où le composeur a tourné, et il
 *    n'est régénérable par rien. La session qui clôt n'est pas toujours celle qui a composé.
 *    `docs/tasks.json` est SUIVI, et n'est écrit que par l'outillage — le rendu ne le contrôle pas.
 * 3. Aucune des deux : `null`. **Une absence de périmètre n'est pas un périmètre vide**, et surtout
 *    pas une autorisation : c'est `lot_introuvable`, et la clôture n'écrit rien.
 */
export function perimetreDuLot(
  lotId: string,
  membresDeclares: readonly string[] | null,
  taches: readonly Pick<Tache, 'id' | 'lot'>[]
): string[] | null {
  if (membresDeclares && membresDeclares.length > 0) return [...membresDeclares];
  const duRegistre = taches.filter((t) => t.lot === lotId).map((t) => t.id);
  return duRegistre.length > 0 ? duRegistre : null;
}

/**
 * LES DEUX REFUS DE GOV-041, ET ILS SONT POSÉS AVANT TOUTE ÉCRITURE.
 * Le contrôle ne vit dans aucune des deux branches d'écriture de `cloturerLeLot()` — ni celle qui
 * pose `fusionnee`, ni celle qui recompte la tentative — mais EN AMONT des deux : c'est la seule
 * position d'où il les garde toutes les deux.
 */
export function controlerLePerimetre(
  lotId: string,
  rendu: Rendu,
  membres: readonly string[] | null
): RefusDeCloture[] {
  if (!membres) {
    return [
      {
        famille: 'lot_introuvable',
        message:
          `Le périmètre du lot ${lotId} est introuvable : ni docs/lots/${lotId}/lot.json, ni aucune ` +
          `tâche de docs/tasks.json portant \`lot: "${lotId}"\`. La clôture n'écrit de statut que sur ` +
          'des entrées dont l’appartenance au lot a été VÉRIFIÉE ; une absence de périmètre n’est pas ' +
          'un périmètre vide, et encore moins une autorisation. Range les tâches du lot par ' +
          `${outilHorsDepot('reclasser.mjs')} --lot avant de clôturer.`,
      },
    ];
  }
  if (!rendu.lotId) {
    return [
      {
        famille: 'lot_du_rendu_absent',
        message:
          `Le rendu ne porte AUCUN \`lotId\` : refus de clôturer ${lotId} sur une absence. Un \`lotId\` ` +
          'faux était refusé depuis toujours pendant qu’une absence passait — lire une absence comme ' +
          `une autorisation est la faute même que ce refus ferme. Écris \`"lotId": "${lotId}"\` dans ` +
          `docs/lots/${lotId}/resultat.json.`,
      },
    ];
  }
  if (rendu.lotId !== lotId) {
    return [
      {
        famille: 'lot_du_rendu_etranger',
        message: `Le rendu porte le lot ${rendu.lotId}, pas ${lotId}. Refus de clôturer un autre lot.`,
      },
    ];
  }
  const etrangeres = tachesNommeesParLeRendu(rendu).filter((id) => !membres.includes(id));
  return etrangeres.map((id) => ({
    famille: 'tache_etrangere_au_lot',
    message:
      `${id} : le rendu nomme une tâche ÉTRANGÈRE au lot ${lotId}. Le lot déclare ` +
      `${membres.join(', ')} — et pas elle. Un résultat surnuméraire écrirait un statut sur une ` +
      'entrée que personne n’a composée, relue ni fusionnée : le 2026-09-09, c’est ainsi que dix ' +
      '`fusionnee` ont été écrits sans un mot. Retire-la du rendu, ou range-la dans le lot.',
  }));
}

/** L'erreur que la clôture lève : elle porte les familles, pour qu'un test les nomme. */
export class ErreurDeCloture extends Error {
  readonly refus: readonly RefusDeCloture[];
  constructor(refus: readonly RefusDeCloture[]) {
    super(
      'Clôture REFUSÉE — le rendu n’a pas été vérifié :\n' +
        refus.map((r) => `  [${r.famille}] ${r.message}`).join('\n')
    );
    this.name = 'ErreurDeCloture';
    this.refus = refus;
  }
}

/**
 * Applique le rendu aux tâches. MUTE `taches`, et ne mute RIEN si un refus est levé : le contrôle de
 * périmètre s'exécute d'abord, entièrement, avant la première écriture.
 */
export function cloturerLeLot(options: {
  lotId: string;
  rendu: Rendu;
  membres: readonly string[] | null;
  taches: Tache[];
  ownerParDefaut?: string;
}): { journal: string[] } {
  const { lotId, rendu, membres, taches, ownerParDefaut = '' } = options;

  const refus = controlerLePerimetre(lotId, rendu, membres);
  if (refus.length > 0) throw new ErreurDeCloture(refus);

  const index = new Map(taches.map((t) => [t.id, t]));
  const motifDuStop = new Map(
    (rendu.stops ?? []).map((s) => [s.tache ?? '', `${s.motif ?? 'stop'} — ${s.ref ?? ''}`.trim()])
  );
  const journal: string[] = [];

  for (const r of rendu.resultats ?? []) {
    if (!r) continue;
    const id = r.dev?.taskId;
    if (!id) {
      journal.push(
        '⚠️ un résultat sans `dev.taskId` : ignoré (le workflow a-t-il bien remboîté la fusion ?)'
      );
      continue;
    }
    const t = index.get(id);
    if (!t) {
      journal.push(`⚠️ ${id} : inconnu de docs/tasks.json — ignoré`);
      continue;
    }

    t.lot = lotId;
    if (r.dev?.branch) t.branch = r.dev.branch;
    // Le numéro de PR n'est écrit NU que si la tâche vit dans CE dépôt. Ailleurs, il ira dans son
    // attestation, plus bas, avec le SHA qui le rend retrouvable (GOV-038).
    const depotDeCetteTache = t.repo ?? DEPOT_LOCAL;
    if (depotDeCetteTache === DEPOT_LOCAL && r.dev?.pr != null) t.pr = r.dev.pr;
    if (!t.owner && ownerParDefaut) t.owner = ownerParDefaut;

    const atterri = r.fusion?.atterri === true;
    if (!r.refuse && atterri) {
      if (!t.owner || !t.branch) {
        throw new Error(
          `${id} passerait \`fusionnee\` sans owner ni branch — état refusé par le schéma. ` +
            'Passe `--owner <Axx>` (celui de la revendication) et vérifie que le développeur a rendu sa branche.'
        );
      }

      // ── l'attestation inter-dépôt (GOV-038) ──────────────────────────────────
      // Une livraison hors de ce dépôt ne laisse ICI aucune trace : ni PR qui résout, ni commit dans
      // cet historique. Le SHA du commit de fusion est la seule valeur qu'aucun autre dépôt ne
      // réattribue ; sans lui, le backlog affirmerait une livraison introuvable. Le script REFUSE
      // plutôt que d'écrire un `pr` nu — c'est la même doctrine que le refus ci-dessus sur `owner`.
      if (depotDeCetteTache !== DEPOT_LOCAL) {
        const numero = r.fusion?.pr ?? r.dev?.pr ?? null;
        const sha = r.fusion?.sha ?? null;
        const quand = r.fusion?.fusionneeAt ?? null;
        if (numero == null || sha == null || quand == null) {
          throw new Error(
            `${id} vit dans ${depotDeLaTache(t as { repo: string }) ?? `repo « ${depotDeCetteTache} »`} et ` +
              `passerait \`fusionnee\` sans attestation complète : ` +
              `pr=${numero ?? 'absent'}, sha=${sha ?? 'absent'}, fusionneeAt=${quand ?? 'absent'}. ` +
              'Le release manager rend les trois : `gh pr view <n> --json number,mergeCommit,mergedAt` ' +
              'dans le dépôt concerné. Un numéro seul serait rendu `PR#<n>` par les vues et ne résout pas ici.'
          );
        }
        t.pr = null;
        t.attestation = { pr: numero, sha, fusionneeAt: quand };
      }

      t.statut = 'fusionnee';
      t.motif = null;

      // Le script ne s'écrit jamais un état que `pnpm gov:tasks` refuserait : il le vérifie avant de
      // le poser. Sans ce contrôle, la faute serait découverte en CI, sur un fichier déjà commité par
      // le seul écrivain autorisé — et personne d'autre n'a le droit de le corriger.
      const fautes = controlerAttestation(
        { id, repo: depotDeCetteTache, statut: t.statut, pr: t.pr, attestation: t.attestation },
        true
      );
      if (fautes.length > 0) {
        throw new Error(
          `${id} : l'attestation écrite serait refusée par \`pnpm gov:tasks\` —\n` +
            fautes.map((f) => `  [${f.famille}] ${f.message}`).join('\n')
        );
      }

      const ref = referencePr({
        id,
        repo: depotDeCetteTache,
        statut: t.statut,
        pr: t.pr,
        attestation: t.attestation,
      });
      journal.push(
        `${id} → fusionnee (${ref ?? 'aucune référence de PR'}, sha ${r.fusion?.sha ?? '?'})`
      );
      continue;
    }

    // Non livrée : on transcrit POURQUOI, et on recompte la tentative.
    const motif =
      motifDuStop.get(id) ||
      r.motif ||
      (r.dev?.stop ? `${r.dev.stop.motif} — ${r.dev.stop.ref ?? ''}`.trim() : '') ||
      (r.fusion && !atterri ? `fusion non atterrie : ${r.fusion.motif ?? 'motif absent'}` : '') ||
      'refusée en revue, motif absent du rendu';

    t.attempts = (t.attempts ?? 0) + 1;
    if (t.attempts >= 2) {
      t.statut = 'bloquee';
      t.motif = motif;
      journal.push(`${id} → bloquee (${t.attempts} tentatives) — ${motif}`);
    } else {
      t.statut = 'a_faire';
      t.owner = null;
      t.branch = null;
      t.motif = null;
      journal.push(`${id} → a_faire (tentative ${t.attempts}) — ${motif}`);
    }
  }

  return { journal };
}

function arg(nom: string, defaut?: string): string {
  const i = process.argv.indexOf(`--${nom}`);
  const suivant = i >= 0 ? process.argv[i + 1] : undefined;
  if (suivant && !suivant.startsWith('--')) return suivant;
  if (defaut !== undefined) return defaut;
  throw new Error(`Argument --${nom} manquant.`);
}

/** Les identifiants que `docs/lots/<lotId>/lot.json` déclare, ou `null` si le fichier n'est pas là. */
function membresDeclares(dossier: string): string[] | null {
  const chemin = join(dossier, 'lot.json');
  if (!existsSync(chemin)) return null;
  const lot = JSON.parse(readFileSync(chemin, 'utf8')) as { taches?: { id?: string }[] };
  const ids = (lot.taches ?? []).map((t) => t.id).filter((id): id is string => Boolean(id));
  return ids.length > 0 ? ids : null;
}

/**
 * ⚠️ LE MOTIF EST ANCRÉ SUR LE NOM DU FICHIER, DOSSIER COMPRIS ET FIN DE CHAÎNE. Un motif plus lâche
 * ferait s'exécuter une COPIE du module portant un autre nom : elle ne produirait rien et sortirait
 * 0 — un « rendu vide » réussi, le plus trompeur des verts.
 */
const LANCE_EN_SCRIPT = /[\\/]lot[\\/]cloture\.ts$/.test(process.argv[1] ?? '');

function principal(): void {
  const lotId = arg('lot');
  const ownerParDefaut = arg('owner', '');
  const doitCommiter = process.argv.includes('--commit');

  const dossier = join('docs/lots', lotId);
  const cheminResultat = join(dossier, 'resultat.json');
  if (!existsSync(cheminResultat)) {
    throw new Error(
      `${cheminResultat} absent. Écris-y le rendu JSON du workflow (\`{ lotId, resultats, stops, manques, arret }\`) ` +
        'avant de clôturer : le script transcrit ce rendu, il ne le devine pas.'
    );
  }

  const rendu = JSON.parse(readFileSync(cheminResultat, 'utf8')) as Rendu;
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    version: number;
    taches: Tache[];
  };

  const membres = perimetreDuLot(lotId, membresDeclares(dossier), doc.taches);
  const { journal } = cloturerLeLot({
    lotId,
    rendu,
    membres,
    taches: doc.taches,
    ownerParDefaut,
  });

  writeFileSync('docs/tasks.json', JSON.stringify(doc, null, 2) + '\n');
  console.log(`Clôture du lot ${lotId} :`);
  for (const l of journal) console.log(`  ${l}`);

  if (doitCommiter) {
    execFileSync('git', ['add', 'docs/tasks.json'], { stdio: 'inherit' });
    execFileSync('git', ['commit', '-m', `chore(lot): clôture ${lotId}`], { stdio: 'inherit' });
  }
}

if (LANCE_EN_SCRIPT) principal();
