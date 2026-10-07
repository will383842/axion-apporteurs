'use client';
// use-client: l'état de l'envoi (« Envoi… », la confirmation, le texte gardé après un refus) vit dans le formulaire.
/**
 * Le formulaire de « Écrire à Axion-IA » (UX-P1-62), sur la maquette `docs/maquettes/aide.html`.
 * AUCUN TEXTE N'EST ÉCRIT ICI : les mots arrivent de la page, depuis la micro-copie. La clé
 * d'idempotence est tirée par le serveur au rendu et rapportée telle quelle : un second envoi du même
 * formulaire rend le même écrit. La confirmation ne s'affiche qu'avec la date rendue par l'action,
 * donc APRÈS l'écriture réussie. Sans script, le formulaire s'envoie quand même.
 */
import { useActionState } from 'react';
import { envoyerUnEcrit } from './actions';
import { ETAT_INITIAL } from './etat';
import styles from './aide.module.css';

export type TextesDuFormulaire = {
  consigne: string;
  champ: string;
  borne: string;
  bouton: string;
  enCours: string;
  /** La confirmation, à remplir de `{date}` et `{heure}` rendues par l’action. */
  confirmation: string;
  messageVide: string;
  tropLong: string;
  envoiEnEchec: string;
  retour: { libelle: string; route: string };
};

/** Remplit `{date}` et `{heure}` ; un paramètre absent reste visible. */
function remplir(texte: string, valeurs: Readonly<Record<string, string>>): string {
  return texte.replace(/\{([^}]*)\}/g, (entier, nom: string) => valeurs[nom] ?? entier);
}

/** Le bouton : « Envoi… » et désactivé tant que l'action n'a pas répondu. */
function Envoyer({ t, envoi }: { t: TextesDuFormulaire; envoi: boolean }) {
  return (
    <button type="submit" className={styles.bouton} disabled={envoi} aria-disabled={envoi}>
      {envoi ? t.enCours : t.bouton}
    </button>
  );
}

export function FormulaireDeLEcrit({
  cle,
  max,
  t,
}: {
  cle: string;
  max: number;
  t: TextesDuFormulaire;
}) {
  // Le troisième terme : l'envoi en cours, vrai jusqu'à la réponse de l'action.
  const [etat, envoyer, envoi] = useActionState(envoyerUnEcrit, ETAT_INITIAL);
  if (etat.etat === 'recu') {
    return (
      <section className={styles.carte} role="status">
        <p>{remplir(t.confirmation, { date: etat.date, heure: etat.heure })}</p>
        <a className={styles.bouton} href={t.retour.route}>
          {t.retour.libelle}
        </a>
      </section>
    );
  }
  const erreur =
    etat.etat === 'message_vide'
      ? t.messageVide
      : etat.etat === 'trop_long'
        ? t.tropLong
        : etat.etat === 'echec'
          ? t.envoiEnEchec
          : null;
  return (
    <>
      <p>{t.consigne}</p>
      <form className={styles.pile} action={envoyer}>
        <input type="hidden" name="cle" value={cle} />
        <label className={styles.champ}>
          <span className={styles.fort}>{t.champ}</span>
          <textarea
            name="message"
            rows={8}
            maxLength={max}
            defaultValue={etat.etat === 'saisie' ? '' : etat.texte}
            aria-invalid={erreur !== null}
            aria-describedby={erreur === null ? 'aide-borne' : 'aide-borne aide-erreur'}
          />
        </label>
        <p id="aide-borne" className={styles.doux}>
          {t.borne}
        </p>
        {erreur === null ? null : (
          <p id="aide-erreur" role="alert" className={styles.alerte}>
            {erreur}
          </p>
        )}
        <Envoyer t={t} envoi={envoi} />
      </form>
    </>
  );
}
