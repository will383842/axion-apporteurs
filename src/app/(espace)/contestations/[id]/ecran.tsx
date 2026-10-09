/**
 * « Ma contestation » (UX-P1-51, REQ-DM-043, REQ-UX-047), sur la maquette `docs/maquettes/contestation.html`,
 * validée par Williams le 2026-10-07 (#319, 6032238671). Composants sans état.
 *
 * AUCUN TEXTE N'EST ÉCRIT ICI : les mots viennent de la micro-copie (`CONTESTATION`), l'écrit de
 * l'apporteur et la réponse d'Axion-IA arrivent du lecteur unique (`relire.ts`), déjà déchiffrés, en
 * nœuds de texte (React les échappe). Une contestation purgée rend le texte fermé de la juriste, choisi
 * par le serveur ; l'écran ne recompose rien. Le délai de réponse vient de la SSOT.
 */
import { CONTESTATION as T } from '../../../../content/micro-copy/espace/vocabulaire';
import { SEUILS } from '../../../../domain/seuils/ssot';
import type { ContestationRelue } from '../../../../server/contestation/relire';
// Mobile d'abord, par une feuille de la même origine : un style en ligne serait refusé par la CSP.
import styles from './contestation.module.css';

const ROUTE_RETOUR = '/mes-entreprises';

/** Remplit les paramètres `{nom}` d'un texte de la micro-copie ; un paramètre absent reste visible. */
function remplir(texte: string, valeurs: Readonly<Record<string, string>>): string {
  return texte.replace(/\{([^}]*)\}/g, (entier, nom: string) => valeurs[nom] ?? entier);
}

function Retour() {
  return (
    <p>
      <a href={ROUTE_RETOUR}>{T.retour}</a>
    </p>
  );
}

/** L'objet contesté, et l'entreprise quand elle est connue. */
function Objet({ c }: { c: { objet: keyof typeof T.objets; entreprise: string | null } }) {
  return (
    <p className={styles.doux}>
      {c.entreprise === null ? T.objets[c.objet] : `${T.objets[c.objet]} · ${c.entreprise}`}
    </p>
  );
}

export function EcranContestation({
  contestationId,
  c,
  date,
}: {
  contestationId: string;
  c: ContestationRelue;
  /** Une date en clair, au jour civil de Paris. */
  date: (d: Date) => string;
}) {
  if (c.etat === 'indisponible') {
    const i = T.indisponible;
    return (
      <main className={styles.page}>
        <Retour />
        <h1>{T.titre}</h1>
        <section className={styles.carte}>
          <h2>{i.titre}</h2>
          <p>{i.phrase}</p>
          <a className={styles.bouton} href={i.action.route}>
            {i.action.libelle}
          </a>
        </section>
      </main>
    );
  }
  if (c.etat === 'illisible') {
    const e = T.erreur;
    return (
      <main className={styles.page}>
        <Retour />
        <h1>{T.titre}</h1>
        <section role="alert" className={styles.carte}>
          <h2>{e.titre}</h2>
          <p>{e.phrase}</p>
          <a
            className={styles.bouton}
            href={`/contestations/${encodeURIComponent(contestationId)}`}
          >
            {e.action}
          </a>
        </section>
      </main>
    );
  }
  if (c.etat === 'purgee') {
    return (
      <main className={styles.page}>
        <Retour />
        <h1>{T.titre}</h1>
        <section className={styles.carte}>
          <Objet c={c} />
          <p className={styles.fort}>
            {remplir(T.contestationRecue, { date: date(c.recueAt) })} ·{' '}
            {c.repondue ? T.statut.repondue : T.statut.enAttente}
          </p>
          <p>{T.purgee}</p>
        </section>
      </main>
    );
  }
  const ecrit = (
    <section className={styles.carte}>
      <Objet c={c} />
      <p className={styles.fort}>{remplir(T.votreEcrit, { date: date(c.recueAt) })}</p>
      <p className={styles.texte}>{c.texte}</p>
    </section>
  );
  if (c.etat === 'en_attente') {
    const delai = SEUILS.REPONSE_CONTESTATION_JOURS;
    return (
      <main className={styles.page}>
        <Retour />
        <h1>{T.titre}</h1>
        {ecrit}
        <section className={styles.encart}>
          <h2>{T.attente.titre}</h2>
          <p>
            {remplir(T.attente.phrase, {
              delaiReponse: `${delai.valeur} ${delai.unite}`,
              dateLimite: date(c.echeance),
            })}
          </p>
        </section>
        <a className={styles.bouton} href={T.attente.action.route}>
          {T.attente.action.libelle}
        </a>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <Retour />
      <h1>{T.titre}</h1>
      {ecrit}
      <section className={styles.carte}>
        <p className={styles.fort}>{remplir(T.reponse, { date: date(c.repondueAt) })}</p>
        <p className={styles.texte}>{c.reponse}</p>
      </section>
    </main>
  );
}

/** Le chargement : annoncé aux lecteurs d'écran, hauteur réservée par la feuille. */
export function EcranChargementContestation() {
  return (
    <main className={styles.page}>
      <h1>{T.titre}</h1>
      <p role="status" aria-live="polite">
        {T.chargement}
      </p>
      <div className={styles.squelette} />
      <div className={styles.squelette} />
    </main>
  );
}

/** L'erreur : ce qui est sûr, et un geste pour réessayer ; aucun détail de l'erreur. */
export function EcranErreurContestation({ reessayer }: { reessayer: () => void }) {
  const e = T.erreur;
  return (
    <main className={styles.page}>
      <h1>{T.titre}</h1>
      <section role="alert" className={styles.carte}>
        <h2>{e.titre}</h2>
        <p>{e.phrase}</p>
        <button type="button" className={styles.bouton} onClick={reessayer}>
          {e.action}
        </button>
      </section>
    </main>
  );
}
