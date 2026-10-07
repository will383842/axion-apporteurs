// @req REQ-UX-063
/**
 * UX-P1-64 — le châssis commun des courriels (exigence de Williams, #786 6039806330 ; familles et
 * signature arbitrées par la coordination, #819) : ce que chaque famille rend, l'échappement, le pied
 * légal lu au registre de l'entité, et les refus nommés.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PALETTE_DES_COURRIELS,
  REGIME_DES_FAMILLES,
  habillerLeCourriel,
  type CourrielAHabiller,
} from '../../../src/server/email/chassis';
import { CHASSIS_DES_COURRIELS as T } from '../../../src/content/micro-copy/courriels/chassis';
import { entiteContractante } from '../../../src/config/entite';
import { LIEN_OPPOSITION } from '../../../src/content/micro-copy/courriels/information-article-14';

const base = {
  preEnTete: 'Votre dépôt avance',
  titre: 'Garage de la Démo : votre dépôt est prolongé',
  paragraphes: ['Votre dépôt est prolongé.'],
} as const;
const A: CourrielAHabiller = {
  ...base,
  famille: 'A',
  appel: { libelle: 'Me connecter', href: 'https://espace.partners.test/connexion/SECRET-123' },
  appelSecret: true,
};
const B: CourrielAHabiller = {
  ...base,
  famille: 'B',
  appel: { libelle: 'Répondre', href: 'https://espace.partners.test/reponse/X' },
  opposition: 'https://espace.partners.test/opposition/Y',
};
const C: CourrielAHabiller = {
  ...base,
  famille: 'C',
  appel: {
    libelle: 'Voir Mes entreprises',
    href: 'https://espace.partners.test/mes-entreprises',
  },
};
const texteDe = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('REQ-UX-063 — le châssis commun : ce que chaque famille rend', () => {
  it('REQ-UX-063 : TÉMOIN — le châssis d’axion-ia : 600 px, le fond crème, la carte blanche, le bouton terracotta, le titre en serif', () => {
    const { html } = habillerLeCourriel(C);
    expect(html).toContain('max-width:600px');
    expect(html).toContain(`background-color:${PALETTE_DES_COURRIELS.fond}`);
    expect(html).toContain(`background-color:${PALETTE_DES_COURRIELS.carte}`);
    expect(html).toContain(`background-color:${PALETTE_DES_COURRIELS.terracotta}`);
    expect(PALETTE_DES_COURRIELS.fond).toBe('#f6f1e8');
    expect(PALETTE_DES_COURRIELS.terracotta).toBe('#c24a1b');
    expect(html).toMatch(/font-family:Georgia/);
    expect(html).toContain('lang="fr"');
  });

  it('REQ-UX-063 : TÉMOIN — famille A : ni soupape, ni signature, ni opposition ; le lien secret jamais recopié en clair', () => {
    const { html, texte } = habillerLeCourriel(A);
    const t = texteDe(html);
    expect(t).not.toContain(T.soupape);
    expect(t).not.toContain(T.signatureRole);
    expect(t).not.toContain(LIEN_OPPOSITION.libelle);
    expect(t).not.toContain(T.repliDuBouton);
    expect(t).toContain(T.envoiAutomatique);
    // Dans le HTML, l'adresse n'existe que dans le href du bouton ; le texte de repli du courriel la porte.
    expect(html.split('SECRET-123')).toHaveLength(2);
    expect(texte).toContain('https://espace.partners.test/connexion/SECRET-123');
  });

  it('REQ-UX-063 : TÉMOIN — famille B : la soupape, la signature courte, le lien d’opposition ; famille C : sans opposition', () => {
    const b = texteDe(habillerLeCourriel(B).html);
    expect(b).toContain(T.soupape);
    expect(b).toContain(`${entiteContractante().representant} ${T.signatureRole}`);
    expect(b).toContain(LIEN_OPPOSITION.libelle);
    const c = texteDe(habillerLeCourriel(C).html);
    expect(c).toContain(T.soupape);
    expect(c).toContain(entiteContractante().representant);
    expect(c).not.toContain(LIEN_OPPOSITION.libelle);
    expect(c).toContain(T.repliDuBouton);
    expect(REGIME_DES_FAMILLES.C.opposition).toBe(false);
  });

  it('REQ-UX-063 : TÉMOIN — le pied légal est lu au registre de l’entité, jamais retapé', () => {
    const e = entiteContractante();
    const t = texteDe(habillerLeCourriel(C).html);
    for (const v of [e.denomination, e.siren, e.tvaIntracommunautaire]) expect(t).toContain(v);
    // Art. R.123-238 C. com. : le capital et le RCS, lus au registre (sous sentinelle d'ici le geste).
    expect(t).toContain(`au capital de ${e.capitalSocial}`);
    expect(t).toContain(`RCS ${e.rcsVille} ${e.siren}`);
    expect(t).toContain(e.adresseDeContact);
  });

  it('REQ-UX-063 : TÉMOIN — tout texte est échappé : aucune valeur ne devient une balise', () => {
    const { html } = habillerLeCourriel({
      ...C,
      titre: '<script>alert(1)</script>',
      paragraphes: ['<img src=x onerror=alert(1)>'],
    });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('REQ-UX-063 : TÉMOIN — les refus nommés : B sans opposition, A ou C avec, un lien de A non secret, une adresse hors https', () => {
    const bSans: CourrielAHabiller = { ...base, famille: 'B', appel: B.appel };
    expect(() => habillerLeCourriel(bSans)).toThrow(/exige son lien/);
    expect(() => habillerLeCourriel({ ...C, opposition: 'https://x.example/o' })).toThrow(
      /ne porte pas/
    );
    expect(() => habillerLeCourriel({ ...A, appelSecret: false })).toThrow(/secret/);
    expect(() =>
      habillerLeCourriel({ ...C, appel: { libelle: 'x', href: 'javascript:alert(1)' } })
    ).toThrow(/adresse/);
  });
});

describe('REQ-UX-063 — un seul système visuel', () => {
  it('REQ-UX-063 : TÉMOIN statique — hors du châssis, aucun module serveur ne construit un document de courriel ni ne porte sa palette', () => {
    const racines = ['src/server', 'src/domain', 'src/lib', 'src/content'];
    const fichiers = racines.flatMap((r) =>
      (readdirSync(r, { recursive: true }) as string[])
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => join(r, f).replace(/\\/g, '/'))
    );
    const fautes = fichiers.filter((f) => {
      if (f === 'src/server/email/chassis.ts') return false;
      const s = readFileSync(f, 'utf8');
      return (
        /<!DOCTYPE|<html\b/i.test(s) ||
        Object.values(PALETTE_DES_COURRIELS).some(
          (c) => c !== '#ffffff' && s.toLowerCase().includes(c)
        )
      );
    });
    expect(fautes).toEqual([]);
  });
});
