// @req REQ-SEC-001
// @req REQ-SEC-002
/**
 * `connexion-ecran.spec.tsx` — les écrans `/connexion` et `/connexion/<jeton>` (SEC-03), rendus en
 * HTML statique, sans navigateur.
 *
 * CE QU'IL PROUVE.
 *   1. Le formulaire est accessible au sens minimal : un champ de courriel ÉTIQUETÉ (étiquette liée
 *      par `for`/`id`), typé, à complétion `email`, requis ; un bouton de soumission ; la réponse
 *      dans une région `role="status"` annoncée poliment.
 *   2. LA RÉPONSE NE DÉPEND QUE DE L'ÉTAT RENDU PAR LE NOYAU : la page lit `?etat=`, n'accepte qu'un
 *      état de la liste fermée, et rend octet pour octet l'écran de cet état. Le noyau rend le même
 *      état que le compte existe ou non (`lien-magique-indistinction.spec.ts`) : la page ne peut
 *      donc pas les distinguer. Un état inconnu rend le formulaire nu.
 *   3. Chaque texte vient de la micro-copie (source unique) ; le champ piège est hors de la vue et
 *      hors de la tabulation.
 *   4. L'arrivée du lien ne consomme RIEN à l'affichage : elle rend un formulaire de confirmation
 *      (un lecteur de courriel qui précharge le lien ne l'use pas).
 *
 * Ce spec ne mesure ni le contraste ni les cibles tactiles : c'est le harnais de UX-P0-03.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ETATS_VIDES_ESPACE } from '../../../src/content/micro-copy/espace/etats-vides';
import { CONNEXION } from '../../../src/content/micro-copy/espace/vocabulaire';
import { ETATS_DE_CONSOMMATION, ETATS_DE_DEMANDE } from '../../../src/server/auth/lien-magique';
import { EcranArrivee, EcranConnexion } from '../../../src/app/(espace)/connexion/ecran';
import PageConnexion from '../../../src/app/(espace)/connexion/page';

const rien = async (): Promise<void> => undefined;
const html = (etat: (typeof ETATS_DE_DEMANDE)[number] | null) =>
  renderToStaticMarkup(<EcranConnexion etat={etat} action={rien} />);

describe('REQ-SEC-001 — le formulaire de connexion', () => {
  it('REQ-SEC-001 : un champ de courriel étiqueté, typé, requis, et un bouton de soumission', () => {
    const h = html(null);
    const libre = ETATS_VIDES_ESPACE['/connexion'];
    expect(libre).toBeDefined();
    const champ = /<input[^>]*type="email"[^>]*>/.exec(h)?.[0] ?? '';
    const id = /id="([^"]+)"/.exec(champ)?.[1];
    expect(id).toBeDefined();
    expect(h).toContain(`<label for="${id}">${CONNEXION.champCourriel}</label>`);
    for (const attribut of ['name="courriel"', 'autocomplete="email"', 'required=""']) {
      expect(champ).toContain(attribut);
    }
    expect(h).toContain(`<button type="submit">${libre?.action.libelle}</button>`);
    expect(h).toContain(`<h1>${libre?.titre}</h1>`);
    expect(h).not.toContain('role="status"');
  });

  it('REQ-SEC-001 : le champ piège est caché et hors tabulation', () => {
    const h = html(null);
    const piege = /<div hidden="">.*?<\/div>/s.exec(h)?.[0] ?? '';
    const champ = /<input[^>]*name="site"[^>]*>/.exec(piege)?.[0] ?? '';
    for (const attribut of ['tabindex="-1"', 'autocomplete="off"']) {
      expect(champ).toContain(attribut);
    }
  });

  it('REQ-SEC-002 : chaque état a SON message, dans une région annoncée, et rien d’autre ne change', () => {
    const nu = html(null);
    for (const etat of ETATS_DE_DEMANDE) {
      const h = html(etat);
      const message = CONNEXION.reponses[etat];
      expect(h).toContain(`<p role="status" aria-live="polite">${message}</p>`);
      // Hors du message, l'écran est celui du formulaire nu, octet pour octet.
      expect(h.replace(`<p role="status" aria-live="polite">${message}</p>`, '')).toBe(nu);
    }
  });
});

describe('REQ-SEC-001 — la page lit l’état et n’accepte que la liste fermée', () => {
  const page = async (etat: string | string[] | undefined) =>
    renderToStaticMarkup(await PageConnexion({ searchParams: Promise.resolve({ etat }) }));

  it('REQ-SEC-001 : `?etat=envoye` rend l’écran de l’état envoyé, octet pour octet', async () => {
    const h = await page('envoye');
    expect(h).toContain(CONNEXION.reponses.envoye);
    // Le formulaire de la page porte une action serveur : on compare le reste de l'écran.
    const sansAction = (x: string) => x.replace(/<form[^>]*>/, '<form>');
    expect(sansAction(h)).toBe(sansAction(html('envoye')));
  });

  it('REQ-SEC-001 : un état inconnu, répété ou absent rend le formulaire nu', async () => {
    const sansAction = (x: string) => x.replace(/<form[^>]*>/, '<form>');
    for (const etat of ['existe', ['envoye', 'suspendu'], undefined]) {
      expect(sansAction(await page(etat))).toBe(sansAction(html(null)));
    }
  });
});

describe('REQ-SEC-001 — l’arrivée du lien : une confirmation, jamais une consommation à l’affichage', () => {
  const arrivee = (etat: (typeof ETATS_DE_CONSOMMATION)[number] | null) =>
    renderToStaticMarkup(<EcranArrivee etat={etat} action={rien} />);

  it('REQ-SEC-001 : un formulaire et un bouton de confirmation, aucun message avant l’envoi', () => {
    const h = arrivee(null);
    expect(h).toContain(`<button type="submit">${CONNEXION.arrivee.action}</button>`);
    expect(h).toContain(`<h1>${CONNEXION.arrivee.titre}</h1>`);
    expect(h).not.toContain('role="status"');
  });

  it('REQ-SEC-001 : chaque issue de la consommation a son message ; un lien invalide propose un nouveau lien', () => {
    for (const etat of ETATS_DE_CONSOMMATION) {
      expect(arrivee(etat)).toContain(
        `<p role="status" aria-live="polite">${CONNEXION.arrivee.reponses[etat]}</p>`
      );
    }
    expect(arrivee('lien_invalide')).toContain(
      `<a href="/connexion">${CONNEXION.arrivee.nouveauLien}</a>`
    );
  });
});
