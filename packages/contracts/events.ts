/**
 * events.ts — la SOURCE UNIQUE du contrat d'événements axionia → Axion Partners.
 *
 * REQ-INT-003 (l'enveloppe), REQ-INT-004 (la nomenclature), REQ-INT-029 (ce qui ne traverse pas),
 * REQ-QA-007 (la transcription tenue par une empreinte).
 *
 * LA LISTE EST FERMÉE, ET ELLE FAIT SEPT. REQ-INT-004 énumère sept types et les nomme sur les
 * modèles RÉELS d'axionia (`Client`, `Devis`, `FactureFormation`, `Payment`) — vérification
 * rejouée dans `docs/AFFIRMATIONS-AXIONIA.md`, repères `AFF-01` et `AFF-02` : les deux modèles
 * anglais sur lesquels quatre documents avaient bâti ce contrat n'existent plus, l'un n'a jamais
 * eu de modèle et l'autre est une valeur d'enum. Aucun type de ce contrat ne les référence.
 *
 * L'ACCEPTATION D'INT-T01a EN ANNONCE ONZE. Elle n'est pas fantaisiste : sept sont ici, et quatre
 * autres noms d'événements circulent AILLEURS dans `docs/requirements.json` — ils sont recensés
 * ci-dessous sous `TYPES_HORS_CONTRAT_V1`, avec l'exigence qui les nomme. Le contrat v1 ne les
 * porte pas : REQ-INT-004 écrit « Les types d'événements SONT : … », c'est une liste fermée, et
 * l'exigence prime sur l'acceptation d'une tâche. L'arbitrage, sa clé de préséance et l'alignement
 * qui reste à faire sont consignés par `partners/ADR-0008`.
 */

import { SCHEMA_VERSION, schemaEnveloppe, type FragmentSchema } from './enveloppe';

export { SCHEMA_VERSION };

/**
 * Les SEPT types, dans l'ordre de REQ-INT-004. C'est la seule liste littérale de noms d'événements
 * du dépôt : la garde `gov:check` refuse tout nom d'événement littéral hors `packages/contracts`.
 */
export const TYPES_EVENEMENT = [
  'client.cree',
  'client.mis_a_jour',
  'devis.signe',
  'facture.emise',
  'avoir.emis',
  'paiement.recu',
  'paiement.rembourse',
] as const;

export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

/** Les types de la phase d'AVANT-signature — ceux dont REQ-INT-029 exclut tout montant. */
export const TYPES_AVANT_SIGNATURE: readonly TypeEvenement[] = ['client.cree', 'client.mis_a_jour'];

/**
 * Les quatre noms d'événements que le registre nomme HORS de REQ-INT-004. Ils ne sont pas dans le
 * contrat v1 ; ils sont écrits ici pour que la dette soit NOMMÉE et que le décompte de onze de
 * l'acceptation soit reconstructible sans avoir à deviner. Le test de contrat vérifie que chacun
 * est absent de `TYPES_EVENEMENT` et que l'exigence citée le nomme réellement.
 */
export const TYPES_HORS_CONTRAT_V1: readonly { type: string; req: string; pourquoi: string }[] = [
  {
    type: 'candidature.recue',
    req: 'REQ-INT-032',
    pourquoi: "sans lui, aucun apporteur n'existe jamais dans Partners.",
  },
  {
    type: 'facture.annulee',
    req: 'REQ-ARG-010',
    pourquoi: "recalcule l'attendu sans créer de reprise.",
  },
  {
    type: 'financement.mis_a_jour',
    req: 'REQ-INT-032',
    pourquoi: "porte l'échéance financeur et la ventilation des payeurs.",
  },
  {
    type: 'client.fusionne',
    req: 'REQ-CPL-014',
    pourquoi: 'déclenche la re-résolution des commissions après fusion.',
  },
];

// ── REQ-INT-029 : ce qui ne franchit JAMAIS la frontière ─────────────────────

export type FamilleInterdite = {
  readonly famille: string;
  /** Le texte de REQ-INT-029 dont la famille est la transcription. */
  readonly exigence: string;
  /** Les types sur lesquels la famille s'applique. Vide = tous. */
  readonly types: readonly TypeEvenement[];
  /** Le motif appliqué au NOM de la feuille (dernier segment du chemin). */
  readonly motifCle: RegExp;
  /** Le motif appliqué à la VALEUR, quand elle est une chaîne. `null` = on ne regarde pas. */
  readonly motifValeur: RegExp | null;
};

/**
 * Les trois familles sont la transcription littérale des trois interdits de REQ-INT-029. Elles ne
 * sont pas trois idées d'auteur : chacune porte le fragment de l'exigence qu'elle applique.
 */
export const FRONTIERE_INTERDITE: readonly FamilleInterdite[] = [
  {
    famille: 'montant_avant_signature',
    exigence: 'les montants négociés avant `devis.signe`',
    // Après la signature, les montants traversent — REQ-INT-005 et REQ-INT-006 les EXIGENT. La
    // frontière ne porte donc que sur les types d'avant-signature ; l'écrire pour tous les types
    // aurait fait rougir le contrat sur ce que deux autres exigences imposent.
    types: TYPES_AVANT_SIGNATURE,
    motifCle: /cents$|^montant|^prix|^tarif|^remise|^rabais|negoci/i,
    motifValeur: null,
  },
  {
    famille: 'identite_autre_apporteur',
    exigence: "l'identité des autres apporteurs",
    types: [],
    // Le motif est LARGE À DESSEIN : sur une frontière de confidentialité, un détecteur se règle
    // en échouant FERMÉ. Conséquence connue et assumée : le payload de `candidature.recue`, que
    // REQ-INT-032 décrit avec un champ `parrainCodeCapture`, ferait rougir cette famille. Ce type
    // n'est pas dans le contrat v1 ; l'arbitrage — un code de parrainage n'est pas une identité,
    // ou bien il l'est — revient à INT-T01b, qui devra soit resserrer le motif, soit déclarer
    // l'exemption avec l'exigence qui la porte. Deviner ici aurait ouvert la frontière en silence.
    motifCle: /apporteur|parrain|filleul/i,
    motifValeur: null,
  },
  {
    famille: 'coordonnees_du_contact',
    exigence: 'les coordonnées chiffrées du contact rencontré',
    types: [],
    // La même liste que REQ-DM-041 refuse au journal : ni nom, ni e-mail, ni téléphone, ni IBAN,
    // ni adresse. Un champ « chiffré » n'est pas une exception : chiffré, il traverse quand même.
    motifCle: /mail|telephone|^tel$|nom$|prenom|adresse|iban|^bic$|chiffre/i,
    motifValeur: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
];

export type ChampInterdit = { famille: string; chemin: string };

/** Les feuilles d'une valeur JSON, avec leur chemin pointé. */
function feuilles(valeur: unknown, chemin: string, acc: { chemin: string; cle: string; valeur: unknown }[]): void {
  if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => feuilles(v, `${chemin}[${i}]`, acc));
    return;
  }
  if (valeur !== null && typeof valeur === 'object') {
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      const sous = chemin === '' ? cle : `${chemin}.${cle}`;
      acc.push({ chemin: sous, cle, valeur: v });
      feuilles(v, sous, acc);
    }
    return;
  }
}

/**
 * REQ-INT-029 — les champs qui n'auraient jamais dû franchir la frontière, dans un événement.
 * Inspecte le `payload` ET le `subject_ref` : les deux traversent, et une coordonnée glissée dans
 * la référence de sujet traverse tout autant.
 */
export function champsInterdits(evenement: Record<string, unknown>): ChampInterdit[] {
  const type = evenement['event_type'] as TypeEvenement | undefined;
  const noeuds: { chemin: string; cle: string; valeur: unknown }[] = [];
  for (const racine of ['payload', 'subject_ref']) {
    // La RACINE est elle-même un nœud : `subject_ref` est une valeur libre en v1, et une chaîne
    // libre peut porter une adresse de courriel. Ne descendre que dans les objets aurait laissé
    // passer le seul champ du contrat dont la forme n'est pas arrêtée.
    noeuds.push({ chemin: racine, cle: racine, valeur: evenement[racine] });
    feuilles(evenement[racine], racine, noeuds);
  }

  const trouves: ChampInterdit[] = [];
  for (const famille of FRONTIERE_INTERDITE) {
    if (famille.types.length > 0 && (type === undefined || !famille.types.includes(type))) continue;
    for (const noeud of noeuds) {
      const parLaCle = famille.motifCle.test(noeud.cle);
      const parLaValeur =
        famille.motifValeur !== null && typeof noeud.valeur === 'string' && famille.motifValeur.test(noeud.valeur);
      if (parLaCle || parLaValeur) trouves.push({ famille: famille.famille, chemin: noeud.chemin });
    }
  }
  return trouves;
}

// ── le JSON Schema publié ────────────────────────────────────────────────────

/** `client.cree` → `payload_client_cree` : un `$defs` ne prend ni point ni tiret. */
export function nomDefPayload(type: TypeEvenement): string {
  return `payload_${type.replace(/\./g, '_')}`;
}

/**
 * Le payload de CHAQUE type est un objet OUVERT en v1, et le dit. Aucun champ n'est inventé :
 * REQ-INT-005, REQ-INT-006 et REQ-INT-032 les énumèrent, et c'est INT-T01b qui les ferme depuis le
 * producteur réel. La couture existe déjà — INT-T01b remplit un `$defs`, il ne restructure rien —
 * et toute fermeture change l'empreinte, donc rougit des deux côtés tant que l'autre dépôt n'a pas
 * republié.
 */
function defsPayloads(): Record<string, FragmentSchema> {
  const defs: Record<string, FragmentSchema> = {};
  for (const type of TYPES_EVENEMENT) {
    defs[nomDefPayload(type)] = {
      type: 'object',
      $comment:
        `OUVERT en schema_version ${SCHEMA_VERSION} — le contenu du payload de \`${type}\` est fermé par ` +
        'INT-T01b, depuis le producteur réel (REQ-INT-005, REQ-INT-006, REQ-INT-032, REQ-QA-007). ' +
        "Aucun champ n'est deviné ici.",
    };
  }
  return defs;
}

/** L'artefact publié, en mémoire. `scripts/contracts/export.ts` en est la seule plume sur disque. */
export function contratJsonSchema(): FragmentSchema {
  const enveloppe = schemaEnveloppe(TYPES_EVENEMENT);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://axion-ia.com/contrats/partners/evenements/v${SCHEMA_VERSION}`,
    title: "Contrat d'événements axionia → Axion Partners",
    $comment:
      `schema_version ${SCHEMA_VERSION}. La version lisible par une machine est le \`const\` du champ ` +
      '`schema_version` ; le nom du fichier la répète pour un lecteur, il ne la définit pas.',
    ...enveloppe,
    allOf: TYPES_EVENEMENT.map((type) => ({
      if: { properties: { event_type: { const: type } }, required: ['event_type'] },
      then: { properties: { payload: { $ref: `#/$defs/${nomDefPayload(type)}` } } },
    })),
    $defs: defsPayloads(),
  };
}
