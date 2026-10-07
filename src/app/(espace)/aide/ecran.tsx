/**
 * « Écrire à Axion-IA » (UX-P1-62, REQ-DM-043, REQ-UX-047), sur la maquette `docs/maquettes/aide.html`.
 *
 * AUCUN TEXTE N'EST ÉCRIT ICI : les mots viennent de la micro-copie (`ECRIRE_A_AXION_IA`, textes de la
 * juriste), la borne de la SSOT (`ECRIT_CARACTERES_MAX`, RM-10). Aucun délai chiffré n'est promis.
 */
import { ECRIRE_A_AXION_IA as T } from '../../../content/micro-copy/espace/aide';
import { ECRIT_CARACTERES_MAX } from '../../../domain/seuils/ssot';
import { FormulaireDeLEcrit, type TextesDuFormulaire } from './formulaire';
// Mobile d'abord, par une feuille de la même origine : un style en ligne serait refusé par la CSP.
import styles from './aide.module.css';

/** `{max}`, en clair et groupé à la française (« 5 000 »), depuis la SSOT. */
const MAX = ECRIT_CARACTERES_MAX.valeur;
const MAX_EN_CLAIR = new Intl.NumberFormat('fr-FR').format(MAX).replace(/ /g, ' ');
const avecMax = (texte: string) => texte.replace('{max}', MAX_EN_CLAIR);

const TEXTES: TextesDuFormulaire = {
  consigne: T.consigne,
  champ: T.champ,
  borne: avecMax(T.borne),
  bouton: T.bouton,
  enCours: T.enCours,
  confirmation: T.confirmation,
  messageVide: T.erreurs.messageVide,
  tropLong: avecMax(T.erreurs.tropLong),
  envoiEnEchec: T.erreurs.envoiEnEchec,
  retour: T.retour,
};

export function EcranAide({ cle }: { cle: string }) {
  return (
    <main className={styles.page}>
      <p>
        <a href={T.retour.route}>{T.retour.libelle}</a>
      </p>
      <h1>{T.titre}</h1>
      <FormulaireDeLEcrit cle={cle} max={MAX} t={TEXTES} />
    </main>
  );
}

/** Le chargement : annoncé aux lecteurs d'écran, hauteur réservée par la feuille. */
export function EcranChargementAide() {
  return (
    <main className={styles.page}>
      <h1>{T.titre}</h1>
      <p role="status" aria-live="polite">
        {T.chargement}
      </p>
      <div className={styles.squelette} />
    </main>
  );
}

/**
 * L'erreur : rien n'est parti (le texte de la juriste le dit), et le geste pour revenir au
 * formulaire. Aucun détail de l'erreur : il pourrait porter le texte saisi.
 */
export function EcranErreurAide({ reessayer }: { reessayer: () => void }) {
  return (
    <main className={styles.page}>
      <h1>{T.titre}</h1>
      <section role="alert" className={styles.carte}>
        <p>{T.erreurs.envoiEnEchec}</p>
        <button type="button" className={styles.bouton} onClick={reessayer}>
          {T.reessayer}
        </button>
      </section>
    </main>
  );
}
