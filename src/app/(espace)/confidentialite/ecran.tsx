/**
 * Les écrans de la politique de confidentialité (JUR-T34, REQ-JUR-025). Composants serveur, sans
 * script client : la politique, son accord, et son état d'erreur.
 *
 * AUCUN CONTENU DE LA POLITIQUE N'EST ÉCRIT ICI. Chaque rubrique arrive du registre de l'article 30,
 * extraite par `src/domain/rgpd/politique.ts` ; les titres et les phrases de l'écran viennent de la
 * micro-copie (`CONFIDENTIALITE`, et l'état vide de `/confidentialite`). Un manque déclaré au
 * registre s'affiche « À compléter », avec la question posée : rien n'est inventé.
 *
 * Le formulaire d'accord n'apparaît que pour une session d'espace dont la politique reste à
 * accepter ; il porte la version affichée, et l'action n'écrit que cette version.
 */
import type { Politique, Segment } from '../../../domain/rgpd/politique';
import type { EtatVide } from '../../../content/micro-copy/types';
import { ETATS_VIDES_ESPACE } from '../../../content/micro-copy/espace/etats-vides';
import { CONFIDENTIALITE } from '../../../content/micro-copy/espace/vocabulaire';
import type { EtatDAcceptation } from '../../../server/rgpd/acceptation';
// Mobile d'abord, par une feuille de la même origine : un style en ligne serait refusé par la CSP.
import styles from './confidentialite.module.css';

type Action = (formData: FormData) => void | Promise<void>;

/** La route de la carte des écrans (docs/ESPACE-ROUTES.md) dont l'état vide est lu ici. */
const ROUTE = '/confidentialite';

function etatVide(): EtatVide {
  const ecran = ETATS_VIDES_ESPACE[ROUTE];
  if (ecran === undefined) throw new Error(`micro-copie absente pour la route ${ROUTE}`);
  return ecran;
}

function Contenu({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'texte' ? (
          <p key={i}>{s.texte}</p>
        ) : (
          <p key={i}>
            <strong>{CONFIDENTIALITE.aCompleter}</strong>
            {' — '}
            {CONFIDENTIALITE.question} {s.question}
          </p>
        )
      )}
    </>
  );
}

function Destinataires({ politique }: { politique: Politique }) {
  const t = CONFIDENTIALITE.tiers;
  if (politique.destinataires.length === 0) {
    const vide = etatVide();
    return (
      <section>
        <h2>{vide.titre}</h2>
        <p>{vide.phrase}</p>
      </section>
    );
  }
  return (
    <section>
      <h2>{t.titre}</h2>
      {politique.destinataires.map((d) => (
        <article key={d.nom}>
          <h3>{d.nom}</h3>
          <h4>{t.qualite}</h4>
          <Contenu segments={d.qualification} />
          <h4>{t.donnees}</h4>
          <Contenu segments={d.donnees} />
          <h4>{t.localisation}</h4>
          <Contenu segments={d.localisation} />
        </article>
      ))}
    </section>
  );
}

function Accord({
  etat,
  version,
  action,
}: {
  etat: EtatDAcceptation;
  version: string;
  action: Action;
}) {
  if (etat === 'sans_session') return null;
  if (etat === 'acceptee') {
    return (
      <p role="status" aria-live="polite">
        {CONFIDENTIALITE.acceptee}
      </p>
    );
  }
  return (
    <form action={action}>
      <p>{CONFIDENTIALITE.accord.phrase}</p>
      <input type="hidden" name="version" value={version} />
      <button type="submit" className={styles.bouton}>
        {CONFIDENTIALITE.accord.action}
      </button>
    </form>
  );
}

export function EcranConfidentialite({
  politique,
  etat,
  action,
}: {
  politique: Politique;
  etat: EtatDAcceptation;
  action: Action;
}) {
  return (
    <main className={styles.page}>
      <h1>{CONFIDENTIALITE.titre}</h1>
      <p>{CONFIDENTIALITE.phrase}</p>
      {politique.rubriques.map((r) => (
        <section key={r.cle}>
          <h2>{CONFIDENTIALITE.rubriques[r.cle]}</h2>
          <Contenu segments={r.contenu} />
        </section>
      ))}
      <Destinataires politique={politique} />
      <Accord etat={etat} version={politique.version} action={action} />
    </main>
  );
}

/** L'état d'erreur : le registre ne se lit pas. Le motif part au journal, jamais à l'écran. */
export function EcranErreurConfidentialite() {
  const t = CONFIDENTIALITE.erreur;
  return (
    <main className={styles.page}>
      <h1>{t.titre}</h1>
      <p role="alert">{t.phrase}</p>
      <a href={ROUTE}>{t.action}</a>
    </main>
  );
}
