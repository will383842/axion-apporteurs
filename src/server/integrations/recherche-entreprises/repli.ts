/**
 * Le repli du dépôt quand l'autocomplétion n'est pas là — INT-T09 (REQ-INT-020, REQ-UX-020).
 *
 * UN PARCOURS D'APPORTEUR QUI DÉPEND DE LA DISPONIBILITÉ D'UN TIERS S'ARRÊTE QUAND LE TIERS
 * S'ARRÊTE. Ce module est donc sur le chemin NOMINAL, pas dans un runbook, et il ne touche ni au
 * réseau ni au cache : il contrôle ce que l'apporteur a saisi, et rend la marque que la fiche
 * portera.
 *
 *   — SAISIE MANUELLE DU NUMÉRO (REQ-INT-020) : un SIREN (9 chiffres) ou un SIRET (14), espaces
 *     tolérés, contrôlé par la clé de Luhn ; la fiche est marquée `entreprise_a_verifier`.
 *   — « JE NE TROUVE PAS MON ENTREPRISE » (REQ-UX-020) : raison sociale, ville, code postal, SIREN
 *     facultatif — et contrôlé s'il est donné ; la fiche est marquée `a_rapprocher`.
 *
 * UN NUMÉRO FAUX EST REFUSÉ, JAMAIS « COMPLÉTÉ » (RM-03). La clé de Luhn est appliquée sans
 * exception : les SIRET de La Poste, qui y dérogent, se saisissent par leur SIREN, qui la respecte
 * (question ouverte au rendu).
 *
 * ⚠️ Les deux marques ne sont pas encore au glossaire (RM-04) : leurs mots sont ceux des exigences
 * (REQ-INT-020, REQ-UX-020), et leur déclaration dans `docs/GLOSSAIRE.md` revient au gardien de la
 * spécification.
 */
import { z } from 'zod';

export const MARQUE_ENTREPRISE_A_VERIFIER = 'entreprise_a_verifier' as const;
export const MARQUE_A_RAPPROCHER = 'a_rapprocher' as const;

export type RefusDeSaisie = {
  readonly ok: false;
  readonly motif: 'format_invalide' | 'cle_invalide';
};

/** La clé de Luhn sur une suite de chiffres. */
export function cleDeLuhnValide(chiffres: string): boolean {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let c = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) {
      c *= 2;
      if (c > 9) c -= 9;
    }
    somme += c;
  }
  return somme % 10 === 0;
}

const sansEspaces = (v: string): string => v.replace(/[\s.]/g, '');

/** Lit un SIREN ou un SIRET saisi ; un refus nommé si la forme ou la clé est fausse. */
function lireNumero(saisi: string): { siren: string; siret: string | null } | RefusDeSaisie {
  const n = sansEspaces(saisi);
  if (!/^(\d{9}|\d{14})$/.test(n)) return { ok: false, motif: 'format_invalide' };
  if (!cleDeLuhnValide(n)) return { ok: false, motif: 'cle_invalide' };
  if (n.length === 14 && !cleDeLuhnValide(n.slice(0, 9)))
    return { ok: false, motif: 'cle_invalide' };
  return n.length === 9 ? { siren: n, siret: null } : { siren: n.slice(0, 9), siret: n };
}

const schemaSaisieManuelle = z.object({ numero: z.string().max(40) }).strict();

export type SaisieManuelle =
  | {
      readonly ok: true;
      readonly saisie: {
        readonly siren: string;
        readonly siret: string | null;
        readonly marque: typeof MARQUE_ENTREPRISE_A_VERIFIER;
      };
    }
  | RefusDeSaisie;

export function controlerSaisieManuelle(entree: unknown): SaisieManuelle {
  const lu = schemaSaisieManuelle.safeParse(entree);
  if (!lu.success) return { ok: false, motif: 'format_invalide' };
  const numero = lireNumero(lu.data.numero);
  if ('ok' in numero) return numero;
  return { ok: true, saisie: { ...numero, marque: MARQUE_ENTREPRISE_A_VERIFIER } };
}

const schemaIntrouvable = z
  .object({
    raisonSociale: z.string().trim().min(1).max(200),
    ville: z.string().trim().min(1).max(100),
    codePostal: z
      .string()
      .trim()
      .regex(/^\d{5}$/),
    siren: z.string().max(20).optional(),
  })
  .strict();

export type DeclarationIntrouvable =
  | {
      readonly ok: true;
      readonly declaration: {
        readonly raisonSociale: string;
        readonly ville: string;
        readonly codePostal: string;
        readonly siren: string | null;
        readonly marque: typeof MARQUE_A_RAPPROCHER;
      };
    }
  | RefusDeSaisie;

export function declarerEntrepriseIntrouvable(entree: unknown): DeclarationIntrouvable {
  const lu = schemaIntrouvable.safeParse(entree);
  if (!lu.success) return { ok: false, motif: 'format_invalide' };
  const { raisonSociale, ville, codePostal, siren } = lu.data;
  let sirenControle: string | null = null;
  if (siren !== undefined && sansEspaces(siren) !== '') {
    const numero = lireNumero(siren);
    if ('ok' in numero) return numero;
    if (numero.siret !== null) return { ok: false, motif: 'format_invalide' };
    sirenControle = numero.siren;
  }
  return {
    ok: true,
    declaration: {
      raisonSociale,
      ville,
      codePostal,
      siren: sirenControle,
      marque: MARQUE_A_RAPPROCHER,
    },
  };
}
