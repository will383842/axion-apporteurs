/**
 * LA RÈGLE DE FORME D'UN IBAN — une seule dans le dépôt, importée par la garde de publication
 * (`scripts/gates/gov-entite.ts`) et par le journal applicatif (`src/lib/logger.ts`).
 *
 * Déplacée TELLE QUELLE depuis `gov-entite.ts` par la PR 88 (QA-T08) : le journal en avait écrit
 * une seconde, sans code pays ni clé de contrôle, et elle lisait comme un IBAN une part des
 * identifiants hexadécimaux (`event_id` et `trace_id` Sentry, `requestId`) — le défaut même que le
 * texte ci-dessous documente. Le code produit n'importe pas l'outillage de `scripts/`, et la garde
 * importe déjà `src/` : la règle vit donc ici. Rien de son comportement n'a changé ;
 * `gov-entite.ts` la réexporte pour ses témoins.
 *
 * AUCUNE I/O : `Intl` seul, au chargement du module.
 */

/**
 * Le code PAYS qui ouvre un IBAN et qui occupe les 5ᵉ et 6ᵉ caractères d'un BIC.
 * Déclaré AVANT les deux formes qui s'en servent : un `const` référencé plus haut que sa
 * déclaration lève à l'exécution, et la garde ne serait pas « fausse », elle serait MORTE.
 *
 * 🔑 RM-01 APPLIQUÉ À UNE CONSTANTE : la liste se DÉRIVE. La source est la table des RÉGIONS de
 * l'ICU du runtime (CLDR) — la donnée qui sert à afficher un nom de pays, versionnée avec Node,
 * jamais recopiée ici.
 *
 * ⚠️ CE QUE LA DÉRIVATION REND, EXACTEMENT : les codes de région CLDR à deux lettres. C'est un
 * SUR-ENSEMBLE des codes ISO 3166-1 attribués — y entrent aussi des macro-régions (`EU`, `UN`),
 * des codes réservés ou retirés (`AC`, `TA`, `SU`, `YU`), des pseudo-régions (`XA`, `XB`, `ZZ`) et
 * un code attribué par l'utilisateur (`XK`, le Kosovo, qui émet des IBAN). Les codes en trop ne
 * sont pas un danger : ce n'est pas la forme qui décide, c'est `cleIbanValide`. Le code pays garde
 * son rôle — il empêche `[A-Za-z]{2}` d'ouvrir la forme à n'importe quel identifiant.
 *
 * ⚠️ ET ELLE REFUSE PLUTÔT QUE DE RÉTRÉCIR. Une source infirme — ICU réduit, `Intl.DisplayNames`
 * absent — rendrait une liste courte ou vide, donc une forme d'IBAN qui ne reconnaît plus rien, donc
 * un `✅` sur un dépôt qui fuit. « Je n'ai rien trouvé » et « je n'ai rien regardé » sont deux
 * phrases différentes, et une seule autorise à publier. `codesDeRegion` LÈVE sous le plancher, au
 * chargement du module, avant tout verdict.
 *
 * LES TÉMOINS vivent dans `tests/unit/gouvernance/entite-registre.spec.ts`, sous REQ-GOV-031.
 * Le mot « garde », ci-dessous, désigne `scripts/gates/gov-entite.ts`, d'où cette règle vient.
 */

/** Sous ce nombre de régions, la source n'est pas « pauvre » : elle est illisible. */
export const PLANCHER_DE_REGIONS = 200;

/** La source des codes pays n'a pas pu être établie. Ce n'est pas une liste courte : c'est rien. */
export class SourcePaysIllisible extends Error {
  constructor(motif: string) {
    super(motif);
    this.name = 'SourcePaysIllisible';
  }
}

/** Le nom d'une région ; une paire de lettres que la source ne connaît pas se rend elle-même. */
export type LecteurDeRegion = (code: string) => string | undefined;

function lecteurDeRegionDuRuntime(): LecteurDeRegion {
  if (typeof Intl.DisplayNames !== 'function') {
    throw new SourcePaysIllisible(
      '`Intl.DisplayNames` est absent de ce runtime : la table des régions est INTROUVABLE. ' +
        'La garde refuse de dériver une liste vide, qui ferait reconnaître ZÉRO IBAN.'
    );
  }
  const noms = new Intl.DisplayNames(['fr'], { type: 'region' });
  // Un seul chemin pour « pas une région » : `of()` rend le code lui-même.
  return (code) => noms.of(code);
}

/**
 * Les codes de région à deux lettres, DÉRIVÉS de la source et jamais tapés. Le lecteur est
 * injectable pour que le REFUS soit éprouvable : une source qui ne connaît rien doit LEVER.
 */
export function codesDeRegion(lire: LecteurDeRegion = lecteurDeRegionDuRuntime()): string[] {
  const A = 'A'.charCodeAt(0);
  const codes: string[] = [];
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      // Une région connue porte un NOM ; une paire de lettres non attribuée se rend elle-même.
      if (lire(code) !== code) codes.push(code);
    }
  }
  if (codes.length < PLANCHER_DE_REGIONS) {
    throw new SourcePaysIllisible(
      `la source ne connaît que ${codes.length} région(s), sous le plancher de ` +
        `${PLANCHER_DE_REGIONS}. Une liste de codes pays amputée n'est pas une garde plus étroite : ` +
        "c'est une forme d'IBAN qui ne reconnaît plus rien, donc un vert sur un dépôt PUBLIC."
    );
  }
  return codes;
}

/** Les codes réellement dérivés — leur nombre est imprimé : la garde DIT ce qu'elle a lu. */
export const CODES_PAYS = codesDeRegion();

export const PAYS_ISO = `(?:${CODES_PAYS.join('|')})`;

/**
 * Un IBAN : un code PAYS, deux chiffres de contrôle, puis 11 à 30 caractères alphanumériques.
 *
 * ⚠️ LA CASSE, COMME LES ESPACES. La forme n'acceptait que les MAJUSCULES : `fr7630006000…`
 * passait partout, `docs/` compris, et `PARTNERS_IBAN_DEBITEUR=<iban minuscule>` dans
 * `.env.example` aussi. La question de la casse avait été posée et tranchée pour le BIC, jamais
 * reportée ici — c'est le défaut typique d'une correction qui s'arrête au cas qui l'a motivée.
 * Un IBAN se copie tel qu'il est affiché, et un relevé n'impose pas la casse.
 *
 * ⚠️ ET LE CODE PAYS EST CE QUI REND LA CASSE TENABLE. Sans lui, accepter les minuscules a fait
 * reconnaître n'importe quel identifiant hexadécimal de 24 caractères —
 * `FC294892B7AA455D2398C4B6`, dans une fixture suivie depuis la PR #28 — et la garde a rougi sur
 * un dépôt PROPRE. Un faux positif dans une garde de publication coûte aussi cher qu'un faux
 * négatif : c'est lui qui la fait désarmer.
 *
 * La valeur est remontée en MAJUSCULES avant d'être signalée, pour qu'un même compte écrit de
 * deux façons ne compte pas deux fois.
 */
export const FORME_IBAN = new RegExp(
  `\\b(${PAYS_ISO}\\d{2}(?:[ ]?[A-Za-z0-9]{4}){2,7}(?:[ ]?[A-Za-z0-9]{1,4})?)\\b`,
  'gi'
);

/**
 * LA CLÉ DE CONTRÔLE — ce qui distingue un IBAN d'une chaîne qui lui ressemble.
 *
 * Le code pays a fermé `FC29…`, mais pas `DE72D8B01D…` ni `AE77F99D…` : `DE` et `AE` SONT des
 * codes pays, et ces deux-là sont des identifiants hexadécimaux d'une fixture suivie. Empiler des
 * heuristiques de forme ne ferme jamais cette classe — il y aura toujours un identifiant dont les
 * deux premières lettres font un pays.
 *
 * La norme, elle, tranche : un IBAN porte deux chiffres de contrôle, et le nombre obtenu en
 * déplaçant ses quatre premiers caractères à la fin puis en remplaçant chaque lettre par son rang
 * (A = 10 … Z = 35) vaut 1 modulo 97. Aucune des chaînes qui nous gênaient ne le vérifie ; le
 * témoin de la garde et les IBAN réels le vérifient tous.
 *
 * CE QUE ÇA COÛTE, ET QUI EST ASSUMÉ : un IBAN dont la clé est fausse n'est plus vu. Une faute de
 * frappe n'autorise aucun prélèvement, et un IBAN copié depuis un relevé est toujours valide.
 *
 * ⚠️ MAIS LE RÉSIDU RÉEL N'EST PAS LA FAUTE DE FRAPPE, C'EST L'IBAN PARTIELLEMENT MASQUÉ.
 * `FR76 3000 6000 01•• •••• •••0 189` a une clé fausse, donc il passe — et il divulgue pourtant
 * encore la banque, le guichet et l'essentiel du numéro de compte. Une personne qui masque quatre
 * caractères avant de coller un RIB dans un ticket **croira s'être protégée**, et cette garde ne
 * la contredira pas. C'est une limite ASSUMÉE, pas un oubli : la couvrir demanderait de renoncer
 * à la clé, donc de rougir sur un dépôt propre — ce qui fait désarmer la garde. Elle est EXPLIQUÉE
 * ici, pour celui qui voudra « renforcer » la forme dans six mois ; elle est DITE dans
 * `LIMITE_DE_LA_FORME`, imprimée dans chaque vert, pour celui qui décidera de ne pas re-vérifier.
 */
export function cleIbanValide(valeur: string): boolean {
  const s = valeur.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 15 || s.length > 34) return false;
  const reorganise = s.slice(4) + s.slice(0, 4);
  let reste = 0;
  for (const c of reorganise) {
    const chiffres = /[0-9]/.test(c) ? c : (c.charCodeAt(0) - 55).toString();
    for (const d of chiffres) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste === 1;
}
