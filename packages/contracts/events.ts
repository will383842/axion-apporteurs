/**
 * events.ts — la SOURCE UNIQUE du contrat d'événements axionia → Axion Partners.
 *
 * REQ-INT-003 (l'enveloppe), REQ-INT-004 (la nomenclature), REQ-INT-029 (ce qui ne traverse pas),
 * REQ-INT-032 (les charges manquantes), REQ-QA-007 (la transcription tenue par une empreinte).
 *
 * LA LISTE EST FERMÉE, ET ELLE FAIT TREIZE, en `schema_version` 4. REQ-INT-004 énumère les types
 * et les nomme sur les modèles RÉELS d'axionia — vérification rejouée dans
 * `docs/AFFIRMATIONS-AXIONIA.md`, repères `AFF-01` et `AFF-02` : les deux modèles anglais sur
 * lesquels quatre documents avaient bâti ce contrat n'existent plus, l'un n'a jamais eu de modèle et
 * l'autre est une valeur d'enum. Aucun type de ce contrat ne les référence.
 *
 * SEPT EN VERSION 1, ONZE EN VERSION 2. Les quatre derniers types étaient recensés hors contrat,
 * chacun avec l'exigence qui le nommait (partners/ADR-0008) ; ils y sont entrés en même temps que
 * REQ-INT-004 les a énumérés, et que la frontière a reçu l'exemption nommée que la charge de la
 * candidature exigeait (`EXEMPTIONS_NOMMEES`). Ajouter un type est un changement en lockstep : le
 * consommateur d'une version refuse tout type qu'il ne connaît pas (partners/ADR-0008, reste à
 * faire §5).
 *
 * DOUZE EN VERSION 3 (INT-T46-P, `HYP-ANTERIORITE-DEVIS`, décision de Williams du 2026-10-01) : `devis.emis`, le
 * devis ENVOYÉ, entre à la fin. C'est de lui que se lit l'antériorité « devis » (DM-10-P) ; il est
 * d'avant-signature, il ne porte donc AUCUN montant (REQ-INT-029).
 *
 * TREIZE EN VERSION 4 (INT-T76-P, lot OPCO ; forme d'A02, #656) : `financement.etape`, une étape d'un
 * dossier de financement OPCO, entre à la fin. Son seul effet chez Partners est la prévision des
 * commissions.
 */

import { SCHEMA_VERSION, schemaEnveloppe, type FragmentSchema } from './enveloppe';
import { CHARGES, DEF_OPCO, NOM_DEF_OPCO } from './payloads';
import { defsApi } from './api';

export { SCHEMA_VERSION };

/**
 * Les TREIZE types, dans l'ordre de REQ-INT-004 — les quatre entrés en version 2, puis celui de la
 * version 3 et celui de la version 4 à la fin, parce que
 * l'enum Postgres de la réception les reçoit par ajout, qui place une valeur en dernier, et que sa
 * correspondance avec cette liste est testée DANS L'ORDRE (partners/ADR-0022, point 10). C'est la
 * seule liste littérale de noms d'événements du dépôt : la garde `gov:termes-interdits` refuse tout
 * nom d'événement littéral hors `packages/contracts`.
 */
export const TYPES_EVENEMENT = [
  'client.cree',
  'client.mis_a_jour',
  'devis.signe',
  'facture.emise',
  'avoir.emis',
  'paiement.recu',
  'paiement.rembourse',
  'candidature.recue',
  'financement.mis_a_jour',
  'facture.annulee',
  'client.fusionne',
  'devis.emis',
  'financement.etape',
] as const;

export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

/**
 * Les types de la phase d'AVANT-signature — ceux dont REQ-INT-029 exclut tout montant. Un devis
 * ÉMIS n'est pas signé : le montant qu'il propose est négocié, il ne traverse pas.
 */
export const TYPES_AVANT_SIGNATURE: readonly TypeEvenement[] = ['client.cree', 'client.mis_a_jour', 'devis.emis'];

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
    // en échouant FERMÉ. Il n'a pas été resserré quand la charge de la candidature est entrée au
    // contrat avec son `parrainCodeCapture` (REQ-INT-032) : c'est une EXEMPTION NOMMÉE qui laisse
    // passer ce champ-là, sur ce type-là, sous cette forme-là (`EXEMPTIONS_NOMMEES` ci-dessous).
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
    // NON ANCRÉ, et c'est délibéré. `/^…$/` n'attrapait une adresse que si elle était TOUTE la
    // valeur — or « rencontré jean@exemple.fr sur place » traverse la frontière exactement pareil.
    // Trouvé par la lentille sécurité sur la PR 28, sur le cas même que le commentaire ci-dessus
    // invoquait. Une garde de confidentialité échoue FERMÉ : elle préfère un faux positif, qu'un
    // humain lève en une ligne, à une coordonnée qui passe en silence.
    motifValeur: /[^\s@,;:<>()"']+@[^\s@,;:<>()"']+\.[a-z]{2,}/i,
  },
];

export type ChampInterdit = { famille: string; chemin: string };

export type ExemptionNommee = {
  readonly famille: string;
  readonly type: TypeEvenement;
  /** Le chemin COMPLET du nœud exempté — pas un nom de feuille, qui vaudrait à toute profondeur. */
  readonly chemin: string;
  /** L'exigence qui impose ce champ, et donc l'exemption. */
  readonly exigence: string;
  /** La forme que la valeur DOIT avoir ; `null` est toujours admis — l'absence ne révèle rien. */
  readonly formeAttendue: RegExp;
};

/**
 * L'ARBITRAGE LAISSÉ OUVERT PAR partners/ADR-0008 (reste à faire §4), tranché et borné.
 *
 * CE N'EST PAS LE MOTIF QU'ON RESSERRE, C'EST L'EXEMPTION QU'ON NOMME. Resserrer
 * `/apporteur|parrain|filleul/i` rouvrirait la frontière pour tous les champs à venir dont personne
 * n'a encore eu l'idée. REQ-INT-029 vise « l'identité des AUTRES apporteurs » : qu'un apporteur
 * apprenne qui sont ses pairs. Un code de parrainage saisi par un CANDIDAT est la seule référence
 * qui le rattache à son parrain, et REQ-INT-032 demande de la transporter ; Partners connaît déjà
 * tous ses apporteurs, ce code ne lui apprend l'identité de personne. Ce n'est pas une identité,
 * c'est une référence opaque — et l'exemption s'arrête là : `parrainNom`, un code niché plus bas
 * dans la charge, ou ce même champ sur un autre type restent refusés.
 *
 * L'exemption est donc NOMINATIVE (un chemin), TYPÉE (un seul type) et VÉRIFIÉE (la valeur a la
 * forme d'un code, jamais celle d'un nom ou d'une adresse). Même forme que le producteur d'axionia,
 * qui la vérifie avant d'émettre : les deux côtés refusent la même valeur.
 */
export const EXEMPTIONS_NOMMEES: readonly ExemptionNommee[] = [
  {
    famille: 'identite_autre_apporteur',
    type: 'candidature.recue',
    chemin: 'payload.parrainCodeCapture',
    exigence: 'REQ-INT-032',
    // Capitales, chiffres et tirets : ni espace (un nom), ni arobase (une adresse).
    formeAttendue: /^[A-Z0-9][A-Z0-9-]{2,31}$/,
  },
];

/** Vrai si le nœud est couvert par une exemption nommée de la famille, sur ce type. */
function estExempte(famille: string, type: TypeEvenement | undefined, noeud: { chemin: string; valeur: unknown }): boolean {
  return EXEMPTIONS_NOMMEES.some(
    (x) =>
      x.famille === famille &&
      x.type === type &&
      x.chemin === noeud.chemin &&
      (noeud.valeur === null || (typeof noeud.valeur === 'string' && x.formeAttendue.test(noeud.valeur)))
  );
}

/**
 * Les feuilles d'une valeur JSON, avec leur chemin pointé.
 *
 * ⚠️ CHAQUE ÉLÉMENT DE TABLEAU EST UN NŒUD, primitifs compris — et c'est le correctif d'un défaut
 * réel, trouvé par la lentille sécurité sur la PR 28 et JOUÉ contre cette fonction :
 *
 *     payload.contacts = ["jean.dupont@exemple.fr"]   →  passait
 *     subject_ref      = ["jean@exemple.fr"]          →  passait
 *
 * La récursion descendait bien dans les tableaux, mais seul `Object.entries` POUSSAIT des nœuds :
 * un primitif dans un tableau n'était jamais inspecté. La frontière échouait donc OUVERT sur la
 * forme la plus banale de fuite — une liste de contacts.
 *
 * L'élément hérite de la CLÉ de son tableau (`contacts[0]` porte la clé `contacts`) : sans quoi
 * `motifCle` ne s'appliquerait plus dès qu'une valeur entre dans une liste.
 */
function feuilles(valeur: unknown, chemin: string, acc: { chemin: string; cle: string; valeur: unknown }[], cleHeritee = ''): void {
  if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => {
      const sous = `${chemin}[${i}]`;
      acc.push({ chemin: sous, cle: cleHeritee, valeur: v });
      feuilles(v, sous, acc, cleHeritee);
    });
    return;
  }
  if (valeur !== null && typeof valeur === 'object') {
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      const sous = chemin === '' ? cle : `${chemin}.${cle}`;
      acc.push({ chemin: sous, cle, valeur: v });
      feuilles(v, sous, acc, cle);
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
    feuilles(evenement[racine], racine, noeuds, racine);
  }

  const trouves: ChampInterdit[] = [];
  for (const famille of FRONTIERE_INTERDITE) {
    if (famille.types.length > 0 && (type === undefined || !famille.types.includes(type))) continue;
    for (const noeud of noeuds) {
      const parLaCle = famille.motifCle.test(noeud.cle);
      const parLaValeur =
        famille.motifValeur !== null && typeof noeud.valeur === 'string' && famille.motifValeur.test(noeud.valeur);
      if (!parLaCle && !parLaValeur) continue;
      if (estExempte(famille.famille, type, noeud)) continue;
      trouves.push({ famille: famille.famille, chemin: noeud.chemin });
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
 * Le payload de CHAQUE type est FERMÉ (`payloads.ts`) : un champ de plus est une charge hors
 * schéma, refusée comme l'enveloppe l'est. Les champs sont ceux que le producteur réel construit,
 * confrontés à sa fixture clé pour clé ; toute évolution change l'empreinte, et se publie donc des
 * deux côtés dans la même fenêtre.
 */
function defsPayloads(): Record<string, FragmentSchema> {
  const defs: Record<string, FragmentSchema> = {};
  for (const type of TYPES_EVENEMENT) {
    defs[nomDefPayload(type)] = {
      ...CHARGES[type],
      $comment:
        `FERMÉ en schema_version ${SCHEMA_VERSION} — la charge de \`${type}\`, champ pour champ ` +
        'celle du producteur réel (REQ-INT-005, REQ-INT-006, REQ-INT-032, REQ-QA-007).',
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
    // Les schémas des API voisinent avec ceux des charges : une seule empreinte tient le tout.
    // Version 4 : la seule définition des OPCO, que la fiche du client et `financement.etape` référencent.
    $defs: { ...defsPayloads(), [NOM_DEF_OPCO]: DEF_OPCO, ...defsApi() },
  };
}
