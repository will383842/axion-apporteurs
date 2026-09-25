/**
 * L'enregistreur des fixtures du tiers de recherche d'entreprises — INT-T09 (REQ-QA-028, RM-03).
 *
 * USAGE : npx tsx src/server/integrations/recherche-entreprises/enregistrer-fixtures.ts
 *
 * Il rejoue chaque cas de `cas-enregistres.ts` contre l'API RÉELLE, avec l'URL que la production
 * enverrait (`urlDeRecherche`), et écrit une fixture par cas dans `tests/fixtures/recherche-entreprises/`.
 * C'est un geste MANUEL et daté : il appelle le réseau, aucun test ne le lance.
 *
 * LA PROJECTION, et elle seule, est appliquée à la capture — et elle est écrite dans `Source:` de
 * chaque fixture, parce que le dépôt est PUBLIC et qu'aucune donnée de personne réelle n'y entre :
 *   — les résultats d'entrepreneurs individuels (`nature_juridique` 1000) sont retirés : leur
 *     dénomination EST un nom de personne ;
 *   — pour chaque dirigeant personne physique, `nom` et `prenoms` sont remplacés par un pseudonyme,
 *     `annee_de_naissance` et `date_de_naissance` par une valeur de même forme, tous tirés d'un HMAC
 *     sous une clé ALÉATOIRE qui n'est conservée nulle part : le pseudonyme ne se renverse pas, et
 *     une même personne présente dans deux fixtures d'un même enregistrement garde le même.
 * Rien d'autre n'est modifié : la forme de chaque objet est celle que le tiers a rendue.
 *
 * LE DÉBIT. Un appel toutes les 300 ms au plus, soit moins de 5 par seconde (REQ-INT-020). Ce script
 * n'est pas l'application : il ne passe pas par le registre des compteurs, qui vit dans le cache de
 * production ; il s'espace lui-même. Un refus du tiers arrête l'enregistrement, sans écrire.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { horlogeSysteme } from '../../../lib/horloge';
import { CAS_ENREGISTRES } from './cas-enregistres';
import { DOSSIER_DES_FIXTURES } from './fixtures';
import { PARAMETRES, urlDeRecherche } from './parametres';
import { schemaReponseDuTiers } from './schemas';

const ESPACEMENT_MS = 300;
const CONFRONTE_A =
  'docs/tiers/recherche-entreprises.md#2-source-officielle — non confrontée : la rubrique 2 de la ' +
  'fiche ne porte pas encore d’exemple officiel (à la date de l’enregistrement)';

type Objet = Record<string, unknown>;

function pseudonymiseur(): (dirigeant: Objet) => Objet {
  const cle = randomBytes(32);
  const h = (etiquette: string, v: unknown) =>
    createHmac('sha256', cle)
      .update(`${etiquette}\u001f${String(v)}`)
      .digest('hex');
  return (d) => {
    if (d.type_dirigeant !== 'personne physique') return d;
    const personne = h('personne', `${String(d.nom)}\u001f${String(d.prenoms)}`);
    const annee = 1940 + (parseInt(personne.slice(16, 20), 16) % 60);
    const mois = String(1 + (parseInt(personne.slice(20, 22), 16) % 12)).padStart(2, '0');
    const remplacer = (champ: string, valeur: string): Objet =>
      typeof d[champ] === 'string' ? { [champ]: valeur } : {};
    return {
      ...d,
      ...remplacer('nom', `NOM ${personne.slice(0, 8).toUpperCase()}`),
      ...remplacer('prenoms', `PRENOM ${personne.slice(8, 16).toUpperCase()}`),
      ...remplacer('annee_de_naissance', String(annee)),
      ...remplacer('date_de_naissance', `${annee}-${mois}`),
    };
  };
}

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Le cas à rejouer, ou `null` pour tous. REJOUER UN SEUL CAS N'EST PAS UN CONFORT : sans ce
 * filtre, corriger la saisie d'un cas réécrit les vingt et un autres fichiers, et le
 * pseudonymiseur tire une clé NEUVE à chaque exécution — tous les pseudonymes de dirigeants
 * changeraient, pour une correction qui n'en concerne qu'un. Le rang, lui, reste celui de la
 * LISTE : le nom de fichier ne dépend pas de ce qu'on rejoue.
 *
 * ⚠️ Contrepartie, et elle est dite : la promesse « une même personne présente dans deux fixtures
 * d'un même enregistrement garde le même pseudonyme » ne vaut que par EXÉCUTION. Un cas rejoué
 * seul ne partage plus sa clé avec les autres.
 */
function casDemande(): string | null {
  const i = process.argv.indexOf('--cas');
  if (i < 0) return null;
  const nom = process.argv[i + 1];
  if (nom === undefined || nom.startsWith('--')) {
    throw new Error('`--cas` attend le nom d’un cas de `cas-enregistres.ts`');
  }
  if (!CAS_ENREGISTRES.some((c) => c.cas === nom)) {
    throw new Error(`aucun cas ne s’appelle « ${nom} » dans \`cas-enregistres.ts\``);
  }
  return nom;
}

async function enregistrer(): Promise<void> {
  const pseudonymiser = pseudonymiseur();
  const seul = casDemande();
  mkdirSync(DOSSIER_DES_FIXTURES, { recursive: true });
  let rang = 0;
  for (const { cas, q } of CAS_ENREGISTRES) {
    rang += 1;
    if (seul !== null && cas !== seul) continue;
    const url = urlDeRecherche(q, PARAMETRES.urlDeBase.valeur);
    // L'URL est ÉCRITE décodée : lisible, et sans les séquences d'échappement d'un accent, qu'une
    // garde de rédaction lirait comme des identifiants. Les tests la comparent décodée aussi.
    const urlLisible = decodeURIComponent(url.href);
    const enregistreLe = new Date(horlogeSysteme.maintenant()).toISOString();
    const reponse = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': PARAMETRES.agentUtilisateur.valeur },
      signal: AbortSignal.timeout(10_000),
    });
    if (reponse.status !== 200) {
      throw new Error(`enregistrement arrêté : le cas « ${cas} » a rendu ${reponse.status}`);
    }
    const brut = (await reponse.json()) as Objet & { results: Objet[] };
    const projete = {
      ...brut,
      results: brut.results
        .filter((r) => r.nature_juridique !== '1000')
        .map((r) => ({
          ...r,
          dirigeants: Array.isArray(r.dirigeants)
            ? (r.dirigeants as Objet[]).map(pseudonymiser)
            : r.dirigeants,
        })),
    };
    // Vérifie, ne fabrique pas : une capture que le schéma refuse est une dérive à lire, pas à écrire.
    const lu = schemaReponseDuTiers.safeParse(projete);
    if (!lu.success) {
      throw new Error(
        `le cas « ${cas} » ne passe pas le schéma : ${JSON.stringify(lu.error.issues[0])}`
      );
    }
    const fixture = {
      Source:
        `GET ${urlLisible}, enregistré le ${enregistreLe} par ` +
        'src/server/integrations/recherche-entreprises/enregistrer-fixtures.ts. PROJECTION appliquée ' +
        'à la capture, et elle seule : résultats d’entrepreneurs individuels (nature_juridique 1000) ' +
        'retirés — leur dénomination est un nom de personne ; pour chaque dirigeant personne ' +
        'physique, nom et prenoms remplacés par un pseudonyme, annee_de_naissance et ' +
        'date_de_naissance par une valeur de même forme, tirés d’un HMAC sous une clé aléatoire non ' +
        'conservée (dépôt public : aucune donnée de personne réelle).',
      'Confronte-a': CONFRONTE_A,
      enregistreLe,
      cas,
      requete: { q },
      url: urlLisible,
      statut: 200,
      reponse: projete,
    };
    const fichier = join(DOSSIER_DES_FIXTURES, `${String(rang).padStart(2, '0')}-${cas}.json`);
    writeFileSync(fichier, `${JSON.stringify(fixture, null, 2)}\n`);
    process.stdout.write(`${fichier} — ${projete.results.length} résultat(s)\n`);
    await pause(ESPACEMENT_MS);
  }
}

enregistrer().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
