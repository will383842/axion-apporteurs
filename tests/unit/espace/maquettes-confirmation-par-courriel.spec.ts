// @req REQ-UX-001
// @req REQ-UX-019
// @req REQ-UX-022
/**
 * UX-P1-40 — les maquettes de la confirmation par e-mail (W20).
 *
 * CE QUE CE FICHIER GARDE, BLOC PAR BLOC.
 *
 *   (1) REQ-UX-001 (amendée par W20) — `deposer.html` : chaque état du formulaire porte les quatre
 *       coordonnées du contact (nom, fonction, e-mail, téléphone), sans le mot « obligatoire » ; le
 *       contexte seul est « (facultatif) » ; un message informatif, sans fenêtre modale, précède le
 *       bouton « Déposer et prévenir » ; le décompte des interactions est écrit sur la maquette,
 *       geste par geste, en huit au plus.
 *   (2) REQ-UX-019 — chaque écran W20 a ses états : la carte du dépôt (délai, annulation, correction,
 *       envoi, rebond, erreur), la page du contact (question, second geste, merci, déjà répondu, lien
 *       inconnu, erreur) de 320 à 414 px, et « Mes entreprises », dont l'état de référence porte
 *       chaque badge de REQ-UX-062 — libellés LUS dans le texte de l'exigence, jamais retapés ici
 *       (RM-01) — et la phrase d'aide sous les deux seuls badges qui la reçoivent.
 *   (3) REQ-UX-022 (amendée par W20) — `file-qualification.html` ouvre sur « À appeler aujourd'hui » :
 *       lignes triées par priorité, chacune avec sa raison en clair, un état vide, et aucune raison
 *       affichée que HYP-W20-VERIFICATION réserve au tri.
 *
 * Chaque règle est une fonction pure, appliquée au dépôt ET à un témoin cassé d'un geste (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const MAQUETTES = 'docs/maquettes';
const lire = (f: string) => readFileSync(`${MAQUETTES}/${f}`, 'utf8');

/** Les états d'une maquette : identifiant et corps, dans l'ordre du fichier. */
function etats(html: string): { id: string; corps: string }[] {
  return html
    .split(/<section\s+class="ecran"/)
    .slice(1)
    .map((m) => ({ id: /id="([^"]+)"/.exec(m)?.[1] ?? '?', corps: m.split(/<\/section\s*>/)[0]! }));
}
const corpsDe = (html: string, id: string) => etats(html).find((e) => e.id === id)?.corps ?? '';
const texte = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
/** La note de relecture d'un état. */
const noteDe = (html: string, id: string) =>
  new RegExp(`<section class="note" data-pour="${id}">([\\s\\S]*?)</section\\s*>`).exec(
    html
  )?.[1] ?? '';

// ── (1) le formulaire de dépôt ─────────────────────────────────────────────────

const ETATS_DU_FORMULAIRE = [
  'etat-pre-rempli',
  'etat-vide',
  'etat-repli',
  'etat-erreurs',
  'etat-hors-ligne',
];

function fautesDuFormulaire(html: string): string[] {
  const fautes: string[] = [];
  for (const id of ETATS_DU_FORMULAIRE) {
    const c = corpsDe(html, id);
    if (!c) {
      fautes.push(`${id} : état absent`);
      continue;
    }
    for (const etiquette of ['Nom et prénom', 'Sa fonction', 'Son e-mail', 'Son téléphone'])
      if (!new RegExp(`<span class="etiquette">${etiquette}</span`).test(c))
        fautes.push(`${id} : « ${etiquette} » absente ou marquée autrement qu’exigée`);
    if (!/type="email"[\s\S]*?inputmode="email"/.test(c))
      fautes.push(`${id} : e-mail sans clavier adapté`);
    if (/obligatoire/i.test(texte(c))) fautes.push(`${id} : le mot « obligatoire »`);
    if ((texte(c).match(/\(facultatif\)/g) ?? []).length !== 2)
      fautes.push(`${id} : « (facultatif) » ailleurs que sur le contexte et la case de relation`);
    if (/<dialog\b|role="dialog"|aria-modal/.test(c)) fautes.push(`${id} : une fenêtre modale`);
    const message = c.search(/class="encart info"\s+role="note"/);
    const bouton = c.search(/<a\s+class="bouton"[^>]*aria-describedby="message--/);
    if (message < 0 || bouton < 0 || message > bouton)
      fautes.push(`${id} : pas de message informatif juste au-dessus du bouton`);
    if (id !== 'etat-hors-ligne' && !/Déposer et prévenir/.test(texte(c)))
      fautes.push(`${id} : bouton qui ne s’appelle pas « Déposer et prévenir »`);
  }
  return fautes;
}

/** Le décompte écrit dans la note du formulaire : la liste numérotée, geste par geste. */
function decompte(html: string): string[] {
  const ol = /<ol>([\s\S]*?)<\/ol\s*>/.exec(noteDe(html, 'etat-pre-rempli'))?.[1] ?? '';
  return [...ol.matchAll(/<li>([\s\S]*?)<\/li\s*>/g)].map((m) => texte(m[1]!));
}

describe('REQ-UX-001 — le formulaire de dépôt révisé (W20)', () => {
  it('REQ-UX-001 — quatre coordonnées exigées, contexte facultatif, message au-dessus du bouton, aucune fenêtre modale', () => {
    expect(fautesDuFormulaire(lire('deposer.html'))).toEqual([]);
  });

  it('REQ-UX-001 — le décompte est écrit sur la maquette, de l’accueil à la confirmation, en huit au plus', () => {
    const gestes = decompte(lire('deposer.html'));
    expect(gestes.length).toBeGreaterThan(0);
    expect(gestes.length).toBeLessThanOrEqual(8);
    expect(gestes.at(-1)).toMatch(/Déposer et prévenir/);
    for (const champ of ['Nom et prénom', 'Fonction', 'E-mail', 'Téléphone'])
      expect(gestes).toContain(`${champ}.`);
  });

  it('REQ-UX-001 — TÉMOINS : « obligatoire », un e-mail retiré, une modale, un neuvième geste rougissent', () => {
    const html = lire('deposer.html');
    const casse = html
      .replace(
        '<span class="etiquette">Son e-mail</span',
        '<span class="etiquette">Son e-mail (obligatoire)</span'
      )
      .replace(
        'class="encart info" role="note" id="message--vide"',
        'class="encart info" role="dialog" id="message--vide"'
      );
    const fautes = fautesDuFormulaire(casse);
    expect(fautes).toContain(
      'etat-pre-rempli : « Son e-mail » absente ou marquée autrement qu’exigée'
    );
    expect(fautes).toContain('etat-pre-rempli : le mot « obligatoire »');
    expect(fautes.some((f) => f.startsWith('etat-vide') && f.includes('modale'))).toBe(true);
    const neuf = html.replace(
      '<li>Fonction.</li>',
      '<li>Fonction.</li>\n            <li>Un geste de trop.</li>'
    );
    expect(decompte(neuf).length).toBe(9);
  });
});

// ── (2) les états, et les badges lus dans REQ-UX-062 ───────────────────────────

/** Le texte d'une exigence du registre. */
function exigence(id: string): string {
  const r = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as unknown;
  const liste = (Array.isArray(r) ? r : Object.values(r as object).find(Array.isArray)) as {
    id: string;
    texte: string;
  }[];
  return liste.find((x) => x.id === id)!.texte;
}
/** Les libellés de badge de REQ-UX-062 : le texte entre chevrons qui suit chaque pastille. */
function libellesDuBadge(): string[] {
  return [...exigence('REQ-UX-062').matchAll(/[🟢🟡🔴⚪]\s*« ([^»]+) »/gu)].map((m) =>
    m[1]!.replace(/<date>/, '').trim()
  );
}
const PHRASE_D_AIDE = () =>
  /Une seule phrase d'aide : « ([^»]+) »/.exec(exigence('REQ-UX-062'))![1]!;

function fautesDesBadges(html: string): string[] {
  const c = corpsDe(html, 'etat-confirmation');
  if (!c) return ['état de référence « etat-confirmation » absent'];
  const lu = texte(c);
  const fautes = libellesDuBadge()
    .filter((l) => !lu.includes(l.replace(/’/g, "'")) && !lu.includes(l.replace(/'/g, '’')))
    .map((l) => `badge absent : « ${l} »`);
  const aide = PHRASE_D_AIDE();
  // Les deux graphies de l'apostrophe, comptées UNE fois chacune : une phrase sans apostrophe n'a
  // qu'une graphie, et la compter deux fois doublerait le total.
  const graphies = new Set([aide, aide.replace(/'/g, '’')]);
  const n = [...graphies].reduce((t, g) => t + lu.split(g).length - 1, 0);
  if (n !== 2) fautes.push(`phrase d’aide présente ${n} fois, attendue sous deux badges`);
  return fautes;
}

const ETATS_ATTENDUS: Record<string, string[]> = {
  'deposer.html': [
    'etat-issue-enregistree',
    'etat-annuler',
    'etat-annule',
    'etat-corriger',
    'etat-envoye',
    'etat-confirme',
    'etat-rebond',
    'etat-corriger-adresse',
    'etat-delai-passe',
  ],
  'confirmation-contact.html': [
    'etat-question',
    'etat-merci',
    'etat-merci-non',
    'etat-deja-repondu',
    'etat-lien-inconnu',
    'etat-chargement',
    'etat-erreur',
    'etat-opposition',
  ],
  'mes-entreprises.html': [
    'etat-nominal',
    'etat-confirmation',
    'etat-vide',
    'etat-chargement',
    'etat-erreur',
    'etat-hors-ligne',
  ],
};
const etatsManquants = (fichier: string, html: string) =>
  ETATS_ATTENDUS[fichier]!.filter((id) => !etats(html).some((e) => e.id === id)).map(
    (id) => `${fichier}#${id}`
  );

describe('REQ-UX-019 — les états des écrans W20, et les badges de REQ-UX-062', () => {
  it('REQ-UX-019 — la carte du dépôt, la page du contact et « Mes entreprises » ont chacun leurs états', () => {
    for (const f of Object.keys(ETATS_ATTENDUS)) expect(etatsManquants(f, lire(f))).toEqual([]);
  });

  // Contrat v2 (#474, 6032680253 ; DM-72) : « Non » s'enregistre d'un seul geste, sans seconde question.
  it('REQ-UX-019 — la page du contact : de 320 à 414 px, deux thèmes, « Non » d’un seul geste, aucun oracle', () => {
    const html = lire('confirmation-contact.html');
    expect(html).toMatch(/data-largeur="320"/);
    expect(html).toMatch(/data-largeur="414"/);
    expect(html).toMatch(/:root\[data-theme='sombre'\]/);
    expect(html).toMatch(/id="theme"/);
    expect(corpsDe(html, 'etat-question')).toContain('href="#etat-merci-non"');
    expect(html).not.toMatch(/id="etat-non"/);
    expect(html).not.toMatch(/Je confirme n’avoir eu aucun échange/);
  });

  it('REQ-UX-019 — chaque badge de REQ-UX-062 est écrit, et la phrase d’aide est sous deux badges seulement', () => {
    expect(libellesDuBadge().length).toBeGreaterThanOrEqual(6);
    expect(fautesDesBadges(lire('mes-entreprises.html'))).toEqual([]);
  });

  it('REQ-UX-019 — /confirmer/<jeton> est sur la carte de l’espace', () => {
    expect(readFileSync('docs/ESPACE-ROUTES.md', 'utf8')).toMatch(/\| `\/confirmer\/<jeton>` \|/);
  });

  it('REQ-UX-019 — TÉMOINS : un badge retiré, une phrase d’aide de trop, un état manquant rougissent', () => {
    const html = lire('mes-entreprises.html');
    const aide = PHRASE_D_AIDE().replace(/'/g, '’');
    const sansBadge = html.replace(/Non confirmée par le contact/g, 'Refusée');
    expect(fautesDesBadges(sansBadge)).toContain('badge absent : « Non confirmée par le contact »');
    const confirmation = corpsDe(html, 'etat-confirmation');
    const deTrop = html.replace(
      confirmation,
      confirmation.replace(/(Non confirmée par le contact\s*<\/p>)/, `$1<p>${aide}</p>`)
    );
    expect(fautesDesBadges(deTrop)).toContain(
      'phrase d’aide présente 3 fois, attendue sous deux badges'
    );
    expect(
      etatsManquants(
        'confirmation-contact.html',
        lire('confirmation-contact.html').replace('id="etat-merci-non"', 'id="etat-x"')
      )
    ).toEqual(['confirmation-contact.html#etat-merci-non']);
  });
});

// ── (2 bis) la page du contact, lien inconnu : aucun oracle, aucun nom ─────────

/**
 * Les noms qu'une page de réponse peut porter : ceux que l'état « question » met en gras (apporteur,
 * entreprise) et celui qu'il salue (le contact). LUS dans la maquette, jamais retapés ici.
 */
function nomsDeLaQuestion(html: string): string[] {
  const c = corpsDe(html, 'etat-question');
  const gras = [...c.matchAll(/<b>([^<]+)<\/b\s*>/g)].map((m) => texte(m[1]!));
  const salue = /Bonjour ([^.<]+)\./.exec(texte(c))?.[1];
  return [...new Set([...gras, ...(salue ? [salue.trim()] : [])])].filter((n) => n.length > 2);
}

/** Les noms qu'un état de lien inconnu, expiré ou révoqué laisse lire — titre compris. */
function fuitesDuLienInconnu(html: string): string[] {
  const c = texte(corpsDe(html, 'etat-lien-inconnu'));
  return nomsDeLaQuestion(html).filter((n) => c.includes(n));
}

describe('REQ-UX-019 — un lien inconnu ou expiré ne dit rien de qui ni de quoi (aucun oracle)', () => {
  it('REQ-UX-019 — l’état « lien inconnu » ne porte aucun nom d’entreprise, d’apporteur ni de contact', () => {
    const html = lire('confirmation-contact.html');
    expect(nomsDeLaQuestion(html).length).toBeGreaterThanOrEqual(3);
    expect(fuitesDuLienInconnu(html)).toEqual([]);
  });

  it('REQ-UX-019 — TÉMOIN : un nom glissé dans l’état « lien inconnu » rougit, nommé', () => {
    const html = lire('confirmation-contact.html');
    const [nom] = nomsDeLaQuestion(html);
    const casse = html.replace(/(id="etat-lien-inconnu"[\s\S]*?<h3>)/, `$1${nom} — `);
    expect(fuitesDuLienInconnu(casse)).toEqual([nom]);
  });
});

// ── (3) « À appeler aujourd'hui » ──────────────────────────────────────────────

function fautesDeLaListe(html: string): string[] {
  const fautes: string[] = [];
  const tous = etats(html);
  if (tous[0]?.id !== 'etat-a-appeler')
    fautes.push('« À appeler aujourd’hui » n’est pas la vue par défaut');
  const c = corpsDe(html, 'etat-a-appeler');
  const lignes = [...c.matchAll(/<tr>([\s\S]*?)<\/tr\s*>/g)]
    .map((m) =>
      [...m[1]!.matchAll(/<td[^>]*data-col="([^"]+)"[^>]*>([\s\S]*?)<\/td\s*>/g)].reduce<
        Record<string, string>
      >((o, x) => ({ ...o, [x[1]!]: texte(x[2]!) }), {})
    )
    .filter((l) => l.Priorité);
  if (lignes.length === 0) fautes.push('aucune ligne à appeler');
  const prios = lignes.map((l) => Number(l.Priorité));
  if (prios.join() !== [...prios].sort((a, b) => a - b).join())
    fautes.push('lignes non triées par priorité');
  for (const l of lignes) {
    if (!l.Raison) fautes.push(`${l.Entreprise} : raison absente`);
    if (/premier dépôt|rafale/i.test(l.Raison ?? ''))
      fautes.push(`${l.Entreprise} : raison réservée au tri affichée`);
    if (!/^Reste \d+ h$/.test(l.Délai ?? '')) fautes.push(`${l.Entreprise} : délai illisible`);
  }
  if (!/Personne à appeler aujourd’hui/.test(texte(corpsDe(html, 'etat-a-appeler-vide'))))
    fautes.push('état vide absent');
  return fautes;
}

describe('REQ-UX-022 — « À appeler aujourd’hui » dans la file de qualification', () => {
  it('REQ-UX-022 — vue par défaut, triée par priorité, une raison en clair par ligne, un état vide', () => {
    expect(fautesDeLaListe(lire('file-qualification.html'))).toEqual([]);
  });

  it('REQ-UX-022 — TÉMOINS : un tri inversé, une raison réservée au tri affichée rougissent', () => {
    const html = lire('file-qualification.html');
    expect(
      fautesDeLaListe(html.replace('Appel de contrôle', 'Premier dépôt de l’apporteur'))
    ).toContain('Menuiserie Imaginaire : raison réservée au tri affichée');
    const inverse = html.replace(
      '<td data-col="Priorité">1</td>',
      '<td data-col="Priorité">9</td>'
    );
    expect(fautesDeLaListe(inverse)).toContain('lignes non triées par priorité');
  });
});
