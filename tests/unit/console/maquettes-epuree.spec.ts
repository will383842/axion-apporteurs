// @req REQ-UX-048
/**
 * UX-P1-52 — la console ÉPURÉE, validée par Williams le 2026-10-03. Sa remarque sur la première
 * connexion, mot pour mot : « JE trouve que ca fait enormement texte avec manque de contraste un
 * peu... on se perd tellement il y a d'informaitons non ? ». Puis, sur la version épurée : « OK ».
 *
 * CE QUE CE FICHIER GARDE, sur les quinze maquettes de la console (section Console de
 * `VALIDATION.md`, lue, jamais retapée — RM-01) :
 *
 *   (1) L'ATELIER REPLIÉ PAR DÉFAUT : la liste des états et les notes ne s'affichent qu'à la demande,
 *       par un bouton « États et notes », pour que Williams voie d'abord l'écran.
 *   (2) LE CONTRASTE, dans la charte de la console : cartes, tableaux et états vides sur une carte
 *       blanche détachée (bordure et ombre), jamais un cadre pointillé ; le texte secondaire en
 *       `--texte-doux`, jamais un gris pâle.
 *   (3) UNE ACTION DOMINANTE : l'écran de connexion ne garde qu'un titre court, un champ, un bouton
 *       et une phrase d'aide.
 *   (4) LES TREIZE VALIDATIONS de Williams sont inscrites dans `VALIDATION.md`.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lireValidation } from '../../../scripts/gates/maquettes-validees';

const DOSSIER = 'docs/maquettes';
const lire = (f: string) => readFileSync(`${DOSSIER}/${f}`, 'utf8');
const LIGNES = lireValidation(lire('VALIDATION.md')).lignes.filter((l) =>
  /console/i.test(l.section)
);
const CONSOLE = LIGNES.map((l) => l.fichier!);
const charte = (html: string) =>
  (html.match(/\/\* charte:debut[\s\S]*?\/\* charte:fin \*\//) ?? [''])[0];

describe('REQ-UX-048 — (1) l’atelier replié par défaut', () => {
  it('REQ-UX-048 — chaque maquette de la console porte le bouton « États et notes », non pressé', () => {
    expect(CONSOLE).toHaveLength(15);
    for (const f of CONSOLE) {
      expect(lire(f), f).toMatch(
        /<button type="button" id="voir-atelier" aria-pressed="false">\s*États et notes\s*<\/button>/
      );
    }
  });

  it('REQ-UX-048 — la charte de la console cache les états et les notes tant que l’atelier n’est pas ouvert', () => {
    const c = charte(lire(CONSOLE[0]!));
    expect(c).toMatch(
      /body:not\(\.atelier-ouvert\) \.etats,\s*body:not\(\.atelier-ouvert\) \.notes \{\s*display: none;/
    );
    expect(c).toMatch(
      /body:not\(\.atelier-ouvert\) \.atelier \{\s*grid-template-columns: minmax\(0, 1fr\);/
    );
  });

  it('REQ-UX-048 — le bouton rouvre l’atelier : le script bascule la classe et réajuste l’écran', () => {
    for (const f of CONSOLE) {
      const html = lire(f);
      expect(html, f).toMatch(/classList\.toggle\('atelier-ouvert'\)/);
      expect(html, f).toMatch(/getElementById\('zoom-ajuster'\)/);
    }
  });
});

describe('REQ-UX-048 — (2) le contraste, dans la charte de la console', () => {
  const c = charte(lire(CONSOLE[0]!));
  const regle = (selecteur: string) => {
    const i = c.indexOf(`${selecteur} {`);
    return i < 0 ? '' : c.slice(i, c.indexOf('}', i));
  };

  it('REQ-UX-048 — cartes, tableaux et états vides : une carte blanche détachée, bordure et ombre', () => {
    for (const s of ['.app .defile .carte', '.app .defile table', '.app .defile .vide']) {
      expect(regle(s), s).toMatch(/background: var\(--surface\)/);
      expect(regle(s), s).toMatch(/box-shadow:/);
    }
    expect(regle('.app .defile .vide')).toMatch(/border: 1px solid/);
    expect(regle('.app .defile .vide')).not.toMatch(/dashed/);
  });

  it('REQ-UX-048 — le titre domine, et le texte secondaire reste en --texte-doux', () => {
    expect(regle('.app .c-titre')).toMatch(/font-weight: 800/);
    expect(regle('.app .doux')).toMatch(/color: var\(--texte-doux\)/);
  });
});

describe('REQ-UX-048 — (3) une action dominante : l’écran de connexion', () => {
  const html = lire('connexion-console.html');
  const etat = html.slice(
    html.indexOf('id="etat-adresse"'),
    html.indexOf('</section>', html.indexOf('id="etat-adresse"'))
  );

  it('REQ-UX-048 — un titre court, UN champ, UN bouton, une phrase d’aide au plus', () => {
    expect(etat).toMatch(/<h2>Se connecter<\/h2>/);
    expect(etat.match(/<input\b/g) ?? []).toHaveLength(1);
    expect(etat.match(/class="c-bouton"/g) ?? []).toHaveLength(1);
    expect(etat.match(/<p\b/g)?.filter(Boolean).length ?? 0).toBeLessThanOrEqual(2);
    expect(etat).toMatch(/<p class="aide">Vous recevrez un lien et un code par e‑mail\.<\/p>/);
  });
});

describe('REQ-UX-048 — (4) les treize validations de Williams', () => {
  // UX-P1-57 : une maquette neuve attend la validation de Williams ; sa ligne garde ses deux colonnes
  // vides, jamais une date sans signature. Les treize validées le 2026-10-03 le restent ; la mise en
  // demeure l'est le 2026-10-07 (#319, 6032238671).
  const validees = LIGNES.filter((l) => l.par !== '' || l.valideLe !== '');
  it('REQ-UX-048 — une maquette de la console en attente porte « Validé le » et « Par » vides, ensemble', () => {
    for (const l of LIGNES.filter((x) => !validees.includes(x)))
      expect([l.valideLe, l.par], l.fichier ?? '').toEqual(['', '']);
    expect(validees).toHaveLength(15);
  });

  it('REQ-UX-048 — chaque maquette de la console validée l’est par Will, aux séances du 2026-10-03 et du 2026-10-07', () => {
    for (const l of validees) {
      expect(l.par, l.fichier ?? '').toBe('Will');
      expect(['2026-10-03', '2026-10-07'], l.fichier ?? '').toContain(l.valideLe);
    }
    expect(validees.filter((l) => l.valideLe === '2026-10-03')).toHaveLength(13);
  });
});

describe('REQ-UX-048 — l’épuration ne touche aucune phrase à valeur juridique', () => {
  /**
   * Les phrases à valeur contractuelle ou juridique des maquettes de la console, MOT POUR MOT telles
   * qu'avant l'épuration (main 882bfb70) : l'article 3.7 du non-confirmé, les pénalités de retard du
   * lot, la mention de l'article 14. Elles sont tenues par leur EMPREINTE SHA-256, et non recopiées :
   * l'une porte un seuil, qui n'a pas à être écrit en clair dans un test (REQ-GOV-031). Chaque
   * paragraphe de la maquette est comparé aux blancs près, une coupure de ligne n'étant pas un mot.
   */
  const PHRASES_JURIDIQUES: readonly (readonly [string, string])[] = [
    ['file-qualification.html', '0409cc822094f70a85427ba70a845033ea77d43465d256bd93cc6136d9f59a3e'],
    ['lot-paiement.html', 'd597b51528d95f740c334a8694c2d785c1a53f71beb2e09ce8a51b14fc9ebbe9'],
    [
      'fiche-qualification.html',
      '0fb139f1875d9b2978366a63b9413a6f171e7900f8c6046d2dfbbbc1e4016bf9',
    ],
  ];
  const empreintesDesParagraphes = (f: string) =>
    new Set(
      [...lire(f).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/g)].map((m) =>
        createHash('sha256')
          .update(
            m[1]!
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim()
          )
          .digest('hex')
      )
    );

  it('REQ-UX-048 : TÉMOIN — chaque phrase à valeur juridique reste mot pour mot celle d’avant l’épuration', () => {
    for (const [f, empreinte] of PHRASES_JURIDIQUES) {
      expect(empreintesDesParagraphes(f).has(empreinte), f).toBe(true);
    }
  });
});
