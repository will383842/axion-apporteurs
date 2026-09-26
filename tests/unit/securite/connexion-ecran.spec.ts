// @req REQ-SEC-001
// @req REQ-SEC-002
/**
 * `connexion-ecran.spec.ts` — les écrans `/connexion` et `/connexion/<jeton>` (SEC-03), rendus en
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
 * Ce spec ne mesure ni le contraste ni les cibles tactiles : c'est le rôle du harnais d'accessibilité.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ETATS_VIDES_ESPACE } from '../../../src/content/micro-copy/espace/etats-vides';
import { CONNEXION } from '../../../src/content/micro-copy/espace/vocabulaire';
import { ETATS_DE_CONSOMMATION, ETATS_DE_DEMANDE } from '../../../src/server/auth/lien-magique';
import * as ETATS_VIDES_DE_L_ESPACE from '../../../src/content/micro-copy/espace/etats-vides';
import * as VOCABULAIRE_DE_L_ESPACE from '../../../src/content/micro-copy/espace/vocabulaire';
import {
  EcranArrivee,
  EcranConnexion,
  EcranIssue,
} from '../../../src/app/(espace)/connexion/ecran';
import PageConnexion from '../../../src/app/(espace)/connexion/page';
import PageArrivee from '../../../src/app/(espace)/connexion/[jeton]/page';

const rien = async (): Promise<void> => undefined;
const html = (etat: (typeof ETATS_DE_DEMANDE)[number] | null) =>
  renderToStaticMarkup(createElement(EcranConnexion, { etat, action: rien }));

describe('REQ-SEC-001 — le formulaire de connexion', () => {
  it('REQ-SEC-001 : un champ de courriel étiqueté, typé, requis, et un bouton de soumission', () => {
    const h = html(null);
    const libre = ETATS_VIDES_ESPACE['/connexion'];
    expect(libre).toBeDefined();
    const champ = /<input[^>]*type="email"[^>]*>/.exec(h)?.[0] ?? '';
    const id = /id="([^"]+)"/.exec(champ)?.[1];
    expect(id).toBeDefined();
    expect(h).toContain(`<label for="${id}">${CONNEXION.champCourriel}</label>`);
    for (const attribut of ['name="courriel"', 'autoComplete="email"', 'required=""']) {
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
    for (const attribut of ['tabindex="-1"', 'autoComplete="off"']) {
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
  const arrivee = () => renderToStaticMarkup(createElement(EcranArrivee, { action: rien }));
  const issue = (etat: (typeof ETATS_DE_CONSOMMATION)[number]) =>
    renderToStaticMarkup(createElement(EcranIssue, { etat }));

  it('REQ-SEC-001 : un formulaire et un bouton de confirmation, aucun message avant l’envoi', () => {
    const h = arrivee();
    expect(h).toContain(`<button type="submit">${CONNEXION.arrivee.action}</button>`);
    expect(h).toContain(`<h1>${CONNEXION.arrivee.titre}</h1>`);
    expect(h).not.toContain('role="status"');
  });

  it('REQ-SEC-001 : la page d’arrivée rend la confirmation, quels que soient ses paramètres', async () => {
    const h = renderToStaticMarkup(
      await PageArrivee({ params: Promise.resolve({ jeton: 'A'.repeat(43) }) })
    );
    const sansAction = (x: string) => x.replace(/<form[^>]*>/, '<form>');
    expect(sansAction(h)).toBe(sansAction(arrivee()));
  });

  it('REQ-SEC-001 : un lien invalide rend l’état de la SOURCE UNIQUE de /connexion/<jeton>, mot pour mot', () => {
    const ssot = ETATS_VIDES_ESPACE['/connexion/<jeton>'];
    expect(ssot).toBeDefined();
    const h = issue('lien_invalide');
    expect(textesDe(h)).toEqual([ssot?.titre, ssot?.phrase, ssot?.action.libelle]);
    expect(h).toMatch(/<a href="\/connexion">/);
    expect(h).toContain('role="status"');
  });

  it('REQ-SEC-001 : un lien utilisé le dit, sous le titre de la confirmation', () => {
    expect(textesDe(issue('ouverte'))).toEqual([
      CONNEXION.arrivee.titre,
      CONNEXION.arrivee.ouverte,
    ]);
  });
});

describe('REQ-SEC-001 — la page /connexion rend l’issue d’une consommation, sans jeton dans l’URL', () => {
  const page = async (recherche: Record<string, string | string[] | undefined>) =>
    renderToStaticMarkup(await PageConnexion({ searchParams: Promise.resolve(recherche) }));

  it('REQ-SEC-001 : `?issue=` d’une issue connue rend son écran, et l’emporte sur `?etat=`', async () => {
    for (const etat of ETATS_DE_CONSOMMATION) {
      const attendu = renderToStaticMarkup(createElement(EcranIssue, { etat }));
      expect(await page({ issue: etat })).toBe(attendu);
      expect(await page({ issue: etat, etat: 'envoye' })).toBe(attendu);
    }
  });

  it('REQ-SEC-001 : une issue inconnue rend le formulaire nu', async () => {
    const sansAction = (x: string) => x.replace(/<form[^>]*>/, '<form>');
    expect(sansAction(await page({ issue: 'autre' }))).toBe(sansAction(html(null)));
  });
});

// ── la source unique : aucun texte hors micro-copie, aucune double graphie ──────────────────────────

/** Les textes visibles d'un rendu, entités décodées, dans l'ordre. */
function textesDe(h: string): string[] {
  return h
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
    .split(/<[^>]+>/)
    .map((t) =>
      t
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim()
    )
    .filter((t) => t !== '');
}

/** Toutes les chaînes d'un module de micro-copie, à toute profondeur. */
function chaines(x: unknown): string[] {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(chaines);
  if (x && typeof x === 'object') return Object.values(x).flatMap(chaines);
  return [];
}
const MICRO_COPIE = [...chaines(ETATS_VIDES_DE_L_ESPACE), ...chaines(VOCABULAIRE_DE_L_ESPACE)];

describe('REQ-SEC-001 — les écrans de connexion ne disent que la source unique', () => {
  it('REQ-SEC-001 : chaque texte affiché, dans chaque état, est une chaîne de la micro-copie', () => {
    const rendus = [
      html(null),
      ...ETATS_DE_DEMANDE.map((e) => html(e)),
      renderToStaticMarkup(createElement(EcranArrivee, { action: rien })),
      ...ETATS_DE_CONSOMMATION.map((etat) =>
        renderToStaticMarkup(createElement(EcranIssue, { etat }))
      ),
    ];
    const hors = rendus.flatMap(textesDe).filter((t) => !MICRO_COPIE.includes(t));
    // Plancher : les rendus portent des textes.
    expect(rendus.flatMap(textesDe).length).toBeGreaterThan(10);
    expect(hors).toEqual([]);
  });

  it('REQ-SEC-001 : aucun texte de l’espace n’existe en deux graphies (apostrophes, espaces)', () => {
    const forme = (t: string) => t.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
    const parForme = new Map<string, Set<string>>();
    for (const t of MICRO_COPIE) {
      const cle = forme(t);
      parForme.set(cle, (parForme.get(cle) ?? new Set()).add(t));
    }
    const doubles = [...parForme.values()].filter((g) => g.size > 1).map((g) => [...g]);
    expect(doubles).toEqual([]);
  });
});
