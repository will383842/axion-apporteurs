/**
 * Le LECTEUR UNIQUE du registre `config/entite.json`. (CPL-T01, `partners/ADR-0009`)
 *
 * POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST SEUL. REQ-CPL-001 demande que « contrat, mandat
 * d'autofacturation et fichier pain.001 portent le même SIREN et le même IBAN débiteur ». La seule
 * manière de le garantir n'est pas de comparer trois valeurs après coup : c'est de faire en sorte
 * qu'il n'y en ait qu'une. Ce fichier est ce point unique. Tout ce qui a besoin de la dénomination,
 * du SIREN, de la TVA, du siège, du domaine ou des coordonnées bancaires débitrices passe par lui
 * (RM-01). `pnpm gov:entite` fait rougir toute recopie de ces valeurs ailleurs.
 *
 * LES TROIS RÉGIMES D'UN CHAMP, ET LE FAIT QU'AUCUN N'EST TAPÉ ICI.
 *   — SECRET   : les coordonnées bancaires débitrices. Le dépôt est PUBLIC (REQ-GOV-031, W13) ; la
 *                sentinelle est la SEULE valeur qu'elles y prennent, et la valeur réelle arrive par
 *                la variable d'environnement nommée dans `CHAMPS`. C'est le patron `stub.invalid`
 *                d'axionia (ADR 0026), appliqué à l'argent : le build n'attend pas la production,
 *                il s'exécute contre une valeur qui se déclare fausse.
 *   — ARRÊTÉ   : le champ dont la décision porte sa marque de clôture dans `docs/DECISIONS.md`, ou
 *                dont l'exigence est écrite dans `docs/REQUIREMENTS.md`. Le registre porte la
 *                valeur, et la garde vérifie qu'elle se retrouve MOT POUR MOT dans la ligne source.
 *   — EN ATTENTE : tout le reste. Sentinelle, et la garde refuse la mise en service — sans jamais
 *                empêcher le build, les tests ni le développement.
 * Le régime n'est pas une colonne de ce fichier : il se DÉRIVE de la ligne source, à chaque
 * exécution. Rouvrir une décision remet ses champs à la sentinelle sans qu'une ligne bouge ici.
 *
 * CE QUE CE MODULE NE FAIT PAS. Il ne lit pas la forge, il n'écrit rien, il n'a pas d'horloge. Il
 * ne connaît pas non plus les quatre points de sortie autrement que par leur DÉCLARATION
 * (`POINTS_DE_SORTIE`) : le code qui émettra un contrat ou un virement n'existe pas encore, et
 * c'est `scripts/gates/gov-entite.ts` qui rend détectable celui qui atterrirait sans appeler
 * `exigerEntiteRenseignee`.
 */

import { readFileSync } from 'node:fs';

/**
 * La sentinelle. Un mot français en majuscules, et c'est délibéré : `partners/ADR-0009` assume le
 * risque qu'un développeur prenne la sentinelle pour une valeur valide, et le réduit en choisissant
 * une chaîne qu'aucun formulaire, aucun contrat et aucune banque n'accepterait.
 */
export const SENTINELLE = 'A-RENSEIGNER';

export const CHEMIN_REGISTRE = 'config/entite.json';

export type Registre = {
  version: number;
  entite: {
    denomination: string;
    formeJuridique: string;
    siren: string;
    siret: string;
    tvaIntracommunautaire: string;
    siege: string;
  };
  domaines: { servi: string; envoi: string };
  perimetre: { modeleTetesDeReseau: string; residenceFiscaleExigee: string; tenance: string };
  banqueDebitrice: { iban: string; bic: string };
  banqueReceptrice: {
    versionPain001: string;
    modeDeRemise: string;
    bic: string;
    jeuDeCaracteres: string;
    espaceDeTest: string;
    formatReleveCsv: string;
  };
};

/** D'où une valeur arrêtée tient son autorité — et où la garde ira la relire. */
export type Ancre = {
  /** `decisions` → `docs/DECISIONS.md` ; `exigences` → `docs/REQUIREMENTS.md`. */
  source: 'decisions' | 'exigences';
  /** L'identifiant de la ligne : `W1`, `W3`, `W4`, `HYP-W2`, `REQ-CPL-004`… */
  id: string;
};

export type Champ = {
  /** Le chemin pointé dans le registre : `entite.siren`, `banqueDebitrice.iban`… */
  cle: string;
  libelle: string;
  reqs: string[];
  /** La ligne qui fait autorité, ou `null` pour un champ qui n'attend que Will. */
  ancre: Ancre | null;
  /**
   * Un champ SECRET ne prend jamais d'autre valeur que la sentinelle DANS LE DÉPÔT. C'est la
   * moitié de la garde que l'on oublie : elle ne protège pas seulement contre l'oubli, elle
   * protège contre l'empressement.
   */
  secret: boolean;
  /** La variable d'environnement qui porte la valeur réelle en production. */
  env: string | null;
  /**
   * Un champ IDENTIFIANT désigne l'entité auprès d'un tiers (SIREN, SIRET, TVA, IBAN, BIC,
   * domaine servi). Ce sont ceux dont une recopie ailleurs dans le dépôt est une faute : les
   * autres (une forme juridique, un modèle de réseau) sont des mots de la langue.
   */
  identifiant: boolean;
};

/**
 * LE SCHÉMA DU REGISTRE — la seule liste de champs du projet. `config/entite.json` porte des
 * valeurs ; c'est ici que l'on dit ce qu'elles sont, d'où elles viennent et ce qu'on en attend.
 */
export const CHAMPS: Champ[] = [
  // W1 — l'entité qui signe et qui paie.
  { cle: 'entite.denomination', libelle: 'dénomination sociale', reqs: ['REQ-CPL-001'], ancre: { source: 'decisions', id: 'W1' }, secret: false, env: null, identifiant: false },
  { cle: 'entite.formeJuridique', libelle: 'forme juridique', reqs: ['REQ-CPL-001'], ancre: { source: 'decisions', id: 'W1' }, secret: false, env: null, identifiant: false },
  { cle: 'entite.siren', libelle: 'SIREN', reqs: ['REQ-CPL-001'], ancre: { source: 'decisions', id: 'W1' }, secret: false, env: null, identifiant: true },
  { cle: 'entite.siret', libelle: 'SIRET du siège', reqs: ['REQ-CPL-001'], ancre: { source: 'decisions', id: 'W1' }, secret: false, env: null, identifiant: true },
  { cle: 'entite.tvaIntracommunautaire', libelle: 'TVA intracommunautaire', reqs: ['REQ-CPL-001'], ancre: { source: 'decisions', id: 'W1' }, secret: false, env: null, identifiant: true },
  { cle: 'entite.siege', libelle: 'siège social', reqs: ['REQ-CPL-001'], ancre: { source: 'decisions', id: 'W1' }, secret: false, env: null, identifiant: false },

  // W3 — les domaines.
  { cle: 'domaines.servi', libelle: 'domaine servi', reqs: ['REQ-CPL-017'], ancre: { source: 'decisions', id: 'W3' }, secret: false, env: null, identifiant: true },
  { cle: 'domaines.envoi', libelle: 'sous-domaine d’envoi des courriels', reqs: ['REQ-CPL-017'], ancre: null, secret: false, env: null, identifiant: false },

  // W4, REQ-CPL-004, REQ-CPL-018 — le périmètre.
  { cle: 'perimetre.modeleTetesDeReseau', libelle: 'modèle des têtes de réseau', reqs: ['REQ-CPL-003'], ancre: { source: 'decisions', id: 'W4' }, secret: false, env: null, identifiant: false },
  { cle: 'perimetre.residenceFiscaleExigee', libelle: 'résidence fiscale exigée de l’apporteur', reqs: ['REQ-CPL-004'], ancre: { source: 'exigences', id: 'REQ-CPL-004' }, secret: false, env: null, identifiant: false },
  { cle: 'perimetre.tenance', libelle: 'modèle de tenance', reqs: ['REQ-CPL-018'], ancre: { source: 'exigences', id: 'REQ-CPL-018' }, secret: false, env: null, identifiant: false },

  // HYP-W2 — les coordonnées bancaires débitrices. SECRÈTES : jamais dans le dépôt.
  { cle: 'banqueDebitrice.iban', libelle: 'IBAN débiteur', reqs: ['REQ-CPL-001'], ancre: null, secret: true, env: 'PARTNERS_IBAN_DEBITEUR', identifiant: true },
  { cle: 'banqueDebitrice.bic', libelle: 'BIC débiteur', reqs: ['REQ-CPL-001'], ancre: null, secret: true, env: 'PARTNERS_BIC_DEBITEUR', identifiant: true },

  // REQ-CPL-002 — la banque réceptrice du pain.001.
  { cle: 'banqueReceptrice.versionPain001', libelle: 'version du schéma pain.001', reqs: ['REQ-CPL-002'], ancre: { source: 'decisions', id: 'HYP-W2' }, secret: false, env: null, identifiant: false },
  { cle: 'banqueReceptrice.modeDeRemise', libelle: 'mode de remise à la banque', reqs: ['REQ-CPL-002'], ancre: { source: 'decisions', id: 'HYP-W2' }, secret: false, env: null, identifiant: false },
  { cle: 'banqueReceptrice.bic', libelle: 'BIC de la banque réceptrice', reqs: ['REQ-CPL-002'], ancre: null, secret: false, env: null, identifiant: false },
  { cle: 'banqueReceptrice.jeuDeCaracteres', libelle: 'jeu de caractères accepté', reqs: ['REQ-CPL-002'], ancre: null, secret: false, env: null, identifiant: false },
  { cle: 'banqueReceptrice.espaceDeTest', libelle: 'espace de test de la banque', reqs: ['REQ-CPL-002'], ancre: null, secret: false, env: null, identifiant: false },
  { cle: 'banqueReceptrice.formatReleveCsv', libelle: 'format CSV du relevé', reqs: ['REQ-CPL-002'], ancre: null, secret: false, env: null, identifiant: false },
];

/**
 * LES QUATRE POINTS DE SORTIE de `partners/ADR-0009` — les endroits où une valeur QUITTE le dépôt.
 * Aucun n'existe encore en code : ce tableau est leur déclaration ANTICIPÉE, et il sert deux fois.
 *   — `exigerEntiteRenseignee(id)` y lit les champs que ce point exige, et refuse s'il en manque un ;
 *   — `pnpm gov:entite` y lit `motifChemin` pour reconnaître, le jour où le fichier atterrit, un
 *     point de sortie qui n'appellerait PAS le refus.
 * La reconnaissance par le CHEMIN a été choisie parce que c'est la seule qui fonctionne AVANT que
 * le code existe. Une vérification à l'exécution seule ne rougirait qu'en production, c'est-à-dire
 * le jour où l'argent part ; une vérification par appelants ne peut rien dire d'un appelant qui
 * n'est pas encore écrit. Un fichier dont le nom annonce ce qu'il fait est, lui, détectable dès sa
 * première ligne. Le prix de cette forme est assumé : elle se contourne en nommant le fichier
 * autrement, et c'est pourquoi elle vient EN PLUS du refus à l'exécution, jamais à sa place.
 */
export type PointDeSortie = {
  id: string;
  libelle: string;
  /** Source d'expression régulière, appliquée au chemin d'un fichier suivi par git. */
  motifChemin: string;
  /** Les clés de `CHAMPS` sans lesquelles ce point de sortie n'a pas le droit de s'exécuter. */
  cles: string[];
};

export const POINTS_DE_SORTIE: PointDeSortie[] = [
  {
    id: 'contrat-docuseal',
    libelle: 'émission d’un contrat d’apporteur pour signature',
    motifChemin: String.raw`^src/.*(?:docuseal|contrat)[^/]*\.tsx?$`,
    cles: [
      'entite.denomination',
      'entite.formeJuridique',
      'entite.siren',
      'entite.siret',
      'entite.tvaIntracommunautaire',
      'entite.siege',
      'domaines.servi',
    ],
  },
  {
    id: 'mandat-autofacturation',
    libelle: 'génération du mandat d’autofacturation',
    motifChemin: String.raw`^src/.*(?:mandat|autofacturation)[^/]*\.tsx?$`,
    cles: [
      'entite.denomination',
      'entite.siren',
      'entite.siret',
      'entite.tvaIntracommunautaire',
      'entite.siege',
      'banqueDebitrice.iban',
      'banqueDebitrice.bic',
    ],
  },
  {
    id: 'sepa-pain001',
    libelle: 'écriture d’un fichier de virement SEPA pain.001',
    motifChemin: String.raw`^src/.*(?:pain001|pain\.001|sepa|virement)[^/]*\.tsx?$`,
    cles: [
      'entite.denomination',
      'entite.siren',
      'banqueDebitrice.iban',
      'banqueDebitrice.bic',
      'banqueReceptrice.versionPain001',
      'banqueReceptrice.modeDeRemise',
      'banqueReceptrice.bic',
    ],
  },
  {
    id: 'export-das2',
    libelle: 'export annuel DAS2',
    motifChemin: String.raw`^src/.*das2[^/]*\.tsx?$`,
    cles: ['entite.denomination', 'entite.siren', 'entite.siret', 'entite.siege'],
  },
];

/** L'erreur du refus. Nommée, pour qu'un appelant puisse la distinguer d'une panne. */
export class RegistreEntiteIncomplet extends Error {
  constructor(
    message: string,
    readonly pointDeSortie: string,
    readonly cles: string[]
  ) {
    super(message);
    this.name = 'RegistreEntiteIncomplet';
  }
}

export function estSentinelle(valeurLue: unknown): boolean {
  return valeurLue === SENTINELLE;
}

/** Lecture d'une clé pointée, sans supposer que le registre a la forme attendue. */
export function valeur(registre: Registre, cle: string): string | undefined {
  let courant: unknown = registre;
  for (const morceau of cle.split('.')) {
    if (typeof courant !== 'object' || courant === null) return undefined;
    courant = (courant as Record<string, unknown>)[morceau];
  }
  return typeof courant === 'string' ? courant : undefined;
}

/**
 * La valeur telle qu'elle vaut À L'EXÉCUTION : l'environnement l'emporte sur le fichier pour les
 * champs secrets, et pour eux seuls. Un champ non secret ne se surcharge pas par variable — sans
 * quoi le registre cesserait d'être la source unique et deux déploiements pourraient signer deux
 * contrats au nom de deux entités.
 */
export function valeurResolue(
  registre: Registre,
  cle: string,
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const champ = CHAMPS.find((c) => c.cle === cle);
  if (champ?.secret === true && champ.env !== null) {
    const injectee = env[champ.env];
    if (typeof injectee === 'string' && injectee.trim() !== '') return injectee;
  }
  return valeur(registre, cle);
}

let cache: Registre | null = null;

/** Le registre du dépôt. Lu une fois, puis mémorisé : ce fichier ne change pas sous les pieds. */
export function registreDuDepot(chemin: string = CHEMIN_REGISTRE): Registre {
  if (chemin === CHEMIN_REGISTRE && cache !== null) return cache;
  const brut = JSON.parse(readFileSync(chemin, 'utf8')) as Registre;
  if (chemin === CHEMIN_REGISTRE) cache = brut;
  return brut;
}

// ── Les accesseurs typés. Rien d'autre ne lit le registre. ────────────────────────────────────

function lire(registre: Registre, cle: string, env?: Record<string, string | undefined>): string {
  return valeurResolue(registre, cle, env ?? {}) ?? SENTINELLE;
}

export function entiteContractante(registre: Registre = registreDuDepot()) {
  return {
    denomination: lire(registre, 'entite.denomination'),
    formeJuridique: lire(registre, 'entite.formeJuridique'),
    siren: lire(registre, 'entite.siren'),
    siret: lire(registre, 'entite.siret'),
    tvaIntracommunautaire: lire(registre, 'entite.tvaIntracommunautaire'),
    siege: lire(registre, 'entite.siege'),
  };
}

export function domaines(registre: Registre = registreDuDepot()) {
  return { servi: lire(registre, 'domaines.servi'), envoi: lire(registre, 'domaines.envoi') };
}

export function perimetre(registre: Registre = registreDuDepot()) {
  return {
    modeleTetesDeReseau: lire(registre, 'perimetre.modeleTetesDeReseau'),
    residenceFiscaleExigee: lire(registre, 'perimetre.residenceFiscaleExigee'),
    tenance: lire(registre, 'perimetre.tenance'),
  };
}

export function banqueDebitrice(
  registre: Registre = registreDuDepot(),
  env: Record<string, string | undefined> = process.env
) {
  return {
    iban: lire(registre, 'banqueDebitrice.iban', env),
    bic: lire(registre, 'banqueDebitrice.bic', env),
  };
}

export function banqueReceptrice(registre: Registre = registreDuDepot()) {
  return {
    versionPain001: lire(registre, 'banqueReceptrice.versionPain001'),
    modeDeRemise: lire(registre, 'banqueReceptrice.modeDeRemise'),
    bic: lire(registre, 'banqueReceptrice.bic'),
    jeuDeCaracteres: lire(registre, 'banqueReceptrice.jeuDeCaracteres'),
    espaceDeTest: lire(registre, 'banqueReceptrice.espaceDeTest'),
    formatReleveCsv: lire(registre, 'banqueReceptrice.formatReleveCsv'),
  };
}

/** Les clés d'un point de sortie qui ne sont pas renseignées, une fois l'environnement résolu. */
export function manquantsPour(
  pointDeSortie: string,
  registre: Registre = registreDuDepot(),
  env: Record<string, string | undefined> = process.env
): string[] {
  const point = POINTS_DE_SORTIE.find((p) => p.id === pointDeSortie);
  if (point === undefined) return [];
  return point.cles.filter((cle) => {
    const v = valeurResolue(registre, cle, env);
    return v === undefined || v.trim() === '' || estSentinelle(v);
  });
}

/**
 * LE REFUS. C'est la fonction que les quatre points de sortie appellent, et la seule chose qui
 * empêche un contrat, un mandat, un virement ou une déclaration de partir avec `A-RENSEIGNER`
 * imprimé dessus.
 *
 * Ce qu'elle n'est PAS : un contrôle de build. `pnpm typecheck`, `pnpm test` et le développement
 * des phases 0 à 3 ne l'appellent jamais et ne la voient jamais. C'est le point 4 de l'acceptation
 * de CPL-T01, et c'est ce qui distingue cette conception d'un blocage de plan.
 */
export function exigerEntiteRenseignee(
  pointDeSortie: string,
  registre: Registre = registreDuDepot(),
  env: Record<string, string | undefined> = process.env
): void {
  const point = POINTS_DE_SORTIE.find((p) => p.id === pointDeSortie);
  if (point === undefined) {
    throw new RegistreEntiteIncomplet(
      `Point de sortie inconnu « ${pointDeSortie} ». Les points de sortie sont déclarés dans ` +
        `\`src/config/entite.ts\` (POINTS_DE_SORTIE) : ${POINTS_DE_SORTIE.map((p) => p.id).join(', ')}. ` +
        `Un point de sortie qui n'y figure pas n'est gardé par rien, et \`config/entite.json\` ne ` +
        `sait pas ce qu'il exige.`,
      pointDeSortie,
      []
    );
  }
  const manquants = manquantsPour(pointDeSortie, registre, env);
  if (manquants.length === 0) return;

  const detail = manquants
    .map((cle) => {
      const champ = CHAMPS.find((c) => c.cle === cle);
      const ou =
        champ?.secret === true && champ.env !== null
          ? `variable d'environnement \`${champ.env}\` (JAMAIS dans le dépôt : il est public)`
          : `\`config/entite.json\` → \`${cle}\``;
      return `   • ${champ?.libelle ?? cle} — à poser dans ${ou}`;
    })
    .join('\n');

  throw new RegistreEntiteIncomplet(
    `Mise en service refusée pour « ${pointDeSortie} » (${point.libelle}) : ` +
      `${manquants.length} valeur(s) valent encore ${SENTINELLE}.\n${detail}\n` +
      `Ce n'est pas une panne : c'est \`partners/ADR-0009\`. Le code est écrit et prouvé contre la ` +
      `sentinelle ; ce qui manque est une saisie dans \`config/entite.json\`, le jour du premier ` +
      `contrat réel.`,
    pointDeSortie,
    manquants
  );
}
