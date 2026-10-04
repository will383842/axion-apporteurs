// @req REQ-JUR-009
// @req REQ-DM-031
/**
 * JUR-T41 — la confirmation de l'échange par e-mail (chantier W20) entre au registre de l'article 30
 * (bloc TRT-TIERS) et à l'AIPD. Témoin écrit par A05 pour A07, qui n'a pas d'outil d'exécution
 * (charte §6), sur le brief de la juriste.
 *
 * CE QU'IL PROUVE : le bloc TRT-TIERS nomme la finalité et son second geste, les données, le
 * destinataire, le renvoi des durées à la section 3, l'opposition et la source ; l'AIPD porte le
 * risque d'un courriel parti à une mauvaise adresse et ses mesures, et sa ligne « Opposition » n'est
 * plus à compléter. CONTRE-TÉMOIN : aucune rubrique sans source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** Le texte lu comme une phrase : une seule forme d'apostrophe, les blancs réduits. */
const normal = (t: string) => t.replace(/’/g, "'").replace(/\s+/g, ' ');

const REGISTRE = readFileSync('docs/rgpd/registre-article-30.md', 'utf8');
const AIPD = readFileSync('docs/rgpd/aipd.md', 'utf8');

/** Le bloc TRT-TIERS : de son titre au titre de section suivant. */
function blocTiers(): string {
  const debut = REGISTRE.indexOf('### TRT-TIERS');
  if (debut < 0) throw new Error('bloc TRT-TIERS absent du registre');
  const fin = REGISTRE.indexOf('\n### ', debut + 1);
  return REGISTRE.slice(debut, fin < 0 ? undefined : fin);
}

/** Les lignes d'un tableau Markdown : [rubrique, contenu, sources], en-tête et séparateur exclus. */
function lignes(bloc: string): string[][] {
  return bloc
    .split('\n')
    .filter((l) => l.startsWith('| ') && !/^\| ---/.test(l) && !l.startsWith('| Rubrique '))
    .map((l) =>
      l
        .slice(1, -1)
        .split(' | ')
        .map((c) => c.trim())
    );
}

/** Le contenu d'une rubrique du bloc TRT-TIERS. */
function rubrique(nom: string): string {
  const l = lignes(blocTiers()).find(([r]) => normal(r!) === nom);
  if (l === undefined) throw new Error(`rubrique « ${nom} » absente de TRT-TIERS`);
  return normal(l.slice(1).join(' | '));
}

describe('REQ-DM-031 — le bloc TRT-TIERS du registre nomme la confirmation par e-mail', () => {
  it('REQ-DM-031 : la finalité « confirmer l’échange par e-mail », avec le second geste du « Non »', () => {
    const f = rubrique('Finalité');
    expect(f).toContain("confirmer l'échange par e-mail");
    expect(f).toMatch(/« Non » confirmé par un second geste/);
  });

  it('REQ-DM-031 : les données — la réponse et son horodatage, l’empreinte tronquée et salée de l’adresse réseau du clic, les empreintes des jetons', () => {
    const c = rubrique('Catégories de données');
    for (const donnee of [
      'la réponse et son horodatage',
      "l'empreinte tronquée et salée de l'adresse réseau du clic",
      'les empreintes des jetons',
    ]) {
      expect(c, donnee).toContain(donnee);
    }
  });

  it('REQ-DM-031 : le destinataire — le relais de courriel de la section 4', () => {
    expect(rubrique('Destinataires')).toContain('le relais de courriel de la section 4');
  });

  it('REQ-DM-031 : les durées renvoient à la section 3, table par table', () => {
    const d = rubrique('Durée de conservation');
    expect(d).toContain('section 3');
    for (const table of [
      'demandes_confirmation',
      'emissions_demande_confirmation',
      'revisions_demande_confirmation',
    ]) {
      expect(d, table).toContain(`\`${table}\``);
    }
  });

  it('REQ-JUR-009 : l’opposition — une liste d’opposition, le régime « ne se prononce pas », sous HYP-W20-OPPOSITION', () => {
    const o = rubrique("Droits et modalités d'exercice");
    expect(o).toContain("liste d'opposition");
    expect(o).toContain('« ne se prononce pas »');
    expect(o).toContain('HYP-W20-OPPOSITION');
  });

  it('REQ-JUR-009 : la source des données — l’apporteur', () => {
    expect(rubrique('Origine des données')).toContain("l'apporteur");
  });

  it('REQ-DM-031 : CONTRE-TÉMOIN — aucune rubrique du bloc TRT-TIERS sans source', () => {
    const l = lignes(blocTiers());
    expect(l.length).toBeGreaterThan(5);
    for (const [r, , sources] of l) expect(sources ?? '', r).not.toBe('');
  });
});

describe('REQ-DM-031 — l’AIPD porte le risque et ses mesures', () => {
  it('REQ-DM-031 : la ligne « Risque — courriel de confirmation parti à une mauvaise adresse », avec ses mesures et ses sources', () => {
    const ligne = AIPD.split('\n').find((l) =>
      l.startsWith('| Risque — courriel de confirmation parti à une mauvaise adresse |')
    );
    expect(ligne).toBeDefined();
    const t = normal(ligne!);
    for (const mesure of [
      'un seul envoi',
      'aucune relance au contact',
      "liste de suppression et liste d'opposition",
      'second geste',
    ]) {
      expect(t, mesure).toContain(mesure);
    }
    const [, , sources] = lignes(ligne!)[0] ?? [];
    expect(sources ?? '').not.toBe('');
  });

  it('REQ-JUR-009 : la ligne « Opposition » de la mise en balance n’est plus « À compléter »', () => {
    const ligne = AIPD.split('\n').find((l) => l.startsWith('| Opposition |'));
    expect(ligne).toBeDefined();
    expect(ligne).not.toContain('À compléter');
    expect(normal(ligne!)).toContain("liste d'opposition");
  });
});
