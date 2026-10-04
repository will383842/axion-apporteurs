/**
 * SEC-64 (REQ-INT-024, REQ-SEC-033) — LE verrou du transfert des alertes vers Telegram, service situé
 * hors de l'Union européenne (juriste, #708, 5981327565 et 5982244103 ; sécurité, #720, 5982916235).
 *
 * UN SEUL verrou, PUR et sans aucune dépendance : le lanceur du serveur ET les scripts de la forge
 * (`scripts/gates/deploy-verify.ts`, `scripts/sauvegarde/cycle.ts`) l'appellent AVANT de construire
 * leur canal. Un témoin statique vérifie que tout lecteur de `TELEGRAM_BOT_TOKEN` l'appelle.
 *
 * Il juge le JETON POSÉ, dans tout environnement où le canal réel se construirait : un jeton sans
 * décision consignée est refusé, nommé (`transfert_telegram_non_consigne`), et rien ne part.
 */

/** Ce que Williams tranche avant la mise en service des alertes (juriste, #708, 5981327565). */
export type DecisionDuTransfert = {
  /** Le pays du service Telegram retenu. */
  readonly pays: string;
  /** L'encadrement du transfert (décision d'adéquation, clauses types, ou autre fondement). */
  readonly encadrement: string;
  /** Le jour de la décision, AAAA-MM-JJ. */
  readonly decideLe: string;
  /** Où la décision est consignée (issue, commentaire, ou décision de Williams). */
  readonly source: string;
};

/**
 * LA décision de Williams sur le transfert. NULLE tant qu'elle n'est pas tranchée : elle se consigne
 * ICI et dans la cellule « Transferts hors Union européenne » de TRT-CONSOLE
 * (`docs/rgpd/registre-article-30.md`), et un témoin confronte les deux.
 */
export const DECISION_TRANSFERT_TELEGRAM: DecisionDuTransfert | null = null;

export class TransfertNonConsigne extends Error {
  readonly motif = 'transfert_telegram_non_consigne';
  constructor() {
    super(
      'transfert_telegram_non_consigne : TELEGRAM_BOT_TOKEN est posé avant que le pays et ' +
        "l'encadrement du transfert soient tranchés et consignés au registre (SEC-64)"
    );
    this.name = 'TransfertNonConsigne';
  }
}

/**
 * Le VERROU : un jeton du bot posé sans décision consignée est REFUSÉ, nommé — le canal réel ne se
 * construit pas, et rien ne part. Sans jeton, rien n'est refusé : aucun transfert n'a lieu.
 */
export function exigerLeTransfertConsigne(
  env: Readonly<Record<string, string | undefined>>,
  decision: DecisionDuTransfert | null = DECISION_TRANSFERT_TELEGRAM
): void {
  const jeton = env.TELEGRAM_BOT_TOKEN;
  if (decision !== null || jeton === undefined || jeton === '') return;
  throw new TransfertNonConsigne();
}
