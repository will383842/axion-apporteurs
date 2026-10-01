// @req REQ-JUR-009
// @req REQ-JUR-060
/**
 * JUR-T09 — l'information de l'article 14 du RGPD, due au contact qu'un apporteur déclare : un seul
 * texte, porté par l'e-mail de confirmation (W20), et une mention de script de qualification qui y
 * renvoie sans le recopier. Témoin écrit par A06 sur les textes d'A07 (charte §6 : relecteur ≠ auteur).
 *
 * CE QUE CE FICHIER GARDE — chaque règle est une fonction pure, jugée sur les textes du dépôt ET sur un
 * texte cassé d'un geste (RM-02) :
 *   1. chaque rubrique que REQ-JUR-060 énumère (lue dans le texte de l'exigence, jamais retapée) a sa
 *      clé non vide ; le lien d'opposition a la sienne ;
 *   2. l'ordre de rendu porte exactement les clés du bloc, sans manque ni doublon ;
 *   3. aucune date du contact (REQ-JUR-040) : ni `{dateContact}`, ni « date du contact », ni date écrite ;
 *   4. l'apporteur est nommé par `{prenomApporteur} {nomApporteur}`, jamais par une coordonnée ;
 *   5. aucun nombre en clair (RM-10) dans aucune valeur, base légale comprise (`{baseLegale}`) ;
 *   6. aucune URL, aucun lien, aucune balise dans les textes ;
 *   7. le script porte la version de l'e-mail et n'en recopie aucune rubrique.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  INFORMATION_ARTICLE_14,
  ORDRE_INFORMATION_ARTICLE_14,
  LIEN_OPPOSITION,
  VERSION_INFORMATION_ARTICLE_14,
} from '../../../src/content/micro-copy/courriels/information-article-14';
import {
  MENTION_ARTICLE_14_SCRIPT,
  VERSION_MENTION_SCRIPT,
} from '../../../src/content/micro-copy/console/script-de-qualification';

type Textes = Readonly<Record<string, string>>;

function texteDe(id: string): string {
  const brut = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as unknown;
  const liste = (
    Array.isArray(brut) ? brut : Object.values(brut as object).find(Array.isArray)
  ) as {
    id: string;
    texte: string;
  }[];
  return liste.find((x) => x.id === id)!.texte;
}

/**
 * Les rubriques de l'art. 14 que REQ-JUR-060 énumère, LUES dans sa parenthèse « l'information de
 * l'art. 14 (…) ». La table ci-dessous ne fait que les traduire en clés : une rubrique que l'exigence
 * ajouterait sans traduction ici rougit, nommée — jamais ignorée.
 */
const CLE_DE_LA_RUBRIQUE: Readonly<Record<string, string>> = {
  'identité du responsable': 'responsable',
  finalité: 'finalite',
  'base légale': 'baseLegale',
  destinataires: 'destinataires',
  durée: 'duree',
  droits: 'droits',
  'source des données': 'source',
};
function rubriquesDeLExigence(texte: string): string[] {
  const m = /information de l'art\. 14 \(([^)]*)\)/.exec(texte);
  if (!m) throw new Error('REQ-JUR-060 ne porte plus la liste des rubriques de l’art. 14');
  return m[1]!.split(',').map((r) => r.split(':')[0]!.trim());
}

function fautesDesRubriques(
  info: Textes,
  lienOpposition: { libelle: string },
  texte: string
): string[] {
  const f: string[] = [];
  for (const r of rubriquesDeLExigence(texte)) {
    const cle = CLE_DE_LA_RUBRIQUE[r];
    if (!cle) f.push(`rubrique sans clé : « ${r} »`);
    else if (!(info[cle] ?? '').trim()) f.push(`rubrique vide : « ${r} » (${cle})`);
  }
  if (!/lien d'opposition/.test(texte)) f.push('REQ-JUR-060 ne nomme plus le lien d’opposition');
  if (!(info.opposition ?? '').trim() || !lienOpposition.libelle.trim())
    f.push('opposition absente');
  return f;
}

function fautesDeLOrdre(info: Textes, ordre: readonly string[]): string[] {
  const f: string[] = [];
  for (const c of Object.keys(info)) if (!ordre.includes(c)) f.push(`clé hors de l’ordre : ${c}`);
  for (const c of ordre) if (!(c in info)) f.push(`ordre sans clé : ${c}`);
  if (new Set(ordre).size !== ordre.length) f.push('doublon dans l’ordre');
  return f;
}

const MOIS =
  /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/i;
function fautesDeDate(textes: Textes): string[] {
  return Object.entries(textes).flatMap(([cle, t]) =>
    /\{dateContact\}|date du contact|\b\d{1,2}\/\d{1,2}\b/i.test(t) || MOIS.test(t)
      ? [`${cle} : une date du contact`]
      : []
  );
}

const COORDONNEE =
  /\{[A-Za-z]*(?:email|mail|courriel|telephone|tel|adresse|portable)[A-Za-z]*Apporteur\}/i;
function fautesDIdentite(source: string, ouverture: string, tous: Textes): string[] {
  const f: string[] = [];
  if (!source.includes('{prenomApporteur} {nomApporteur}'))
    f.push('source : l’apporteur n’est pas nommé par prénom et nom');
  if (!ouverture.includes('{prenomApporteur} {nomApporteur}'))
    f.push('script : l’apporteur n’est pas nommé par prénom et nom');
  for (const [cle, t] of Object.entries(tous))
    if (COORDONNEE.test(t)) f.push(`${cle} : une coordonnée de l’apporteur`);
  return f;
}

/**
 * Aucun chiffre dans aucune VALEUR du gabarit, sans exception : depuis la v4, la base légale est le
 * paramètre `{baseLegale}`. La règle porte sur les valeurs, PAS sur le texte rendu — `{baseLegale}`
 * y sera rempli avec « 6, paragraphe 1, point f », lu au registre des décisions ; ne pas la
 * retourner un jour contre le rendu.
 */
function fautesDeNombre(textes: Textes): string[] {
  return Object.entries(textes).flatMap(([cle, t]) =>
    /\d/.test(t) ? [`${cle} : un nombre en clair`] : []
  );
}

function fautesDeLien(textes: Textes): string[] {
  return Object.entries(textes).flatMap(([cle, t]) =>
    /https?:|www\.|<[a-z!/]/i.test(t) ? [`${cle} : un lien ou une balise`] : []
  );
}

function fautesDuScript(script: Textes, info: Textes, vScript: string, vInfo: string): string[] {
  const f: string[] = [];
  if (vScript !== vInfo) f.push(`version du script ${vScript} ≠ version de l’e-mail ${vInfo}`);
  for (const [cs, ts] of Object.entries(script))
    for (const [ci, ti] of Object.entries(info))
      if (ti.trim().length > 20 && ts.includes(ti))
        f.push(`script.${cs} recopie la rubrique ${ci}`);
  if (!script.apresCourriel?.trim() || !script.sansCourriel?.trim())
    f.push('le script n’a pas ses deux cas');
  return f;
}

const INFO: Textes = INFORMATION_ARTICLE_14;
const SCRIPT: Textes = MENTION_ARTICLE_14_SCRIPT;
const TOUS: Textes = {
  ...INFO,
  lienOpposition: LIEN_OPPOSITION.libelle,
  ...Object.fromEntries(Object.entries(SCRIPT).map(([k, v]) => [`script.${k}`, v])),
};
const REQ_JUR_060 = texteDe('REQ-JUR-060');

describe('REQ-JUR-060 — l’information de l’art. 14 portée par l’e-mail au contact', () => {
  it('REQ-JUR-060 — chaque rubrique de l’exigence a sa clé non vide, et l’opposition la sienne', () => {
    expect(rubriquesDeLExigence(REQ_JUR_060).length).toBeGreaterThanOrEqual(7);
    expect(fautesDesRubriques(INFO, LIEN_OPPOSITION, REQ_JUR_060)).toEqual([]);
  });
  it('REQ-JUR-060 — l’ordre de rendu porte exactement les clés du bloc', () => {
    expect(fautesDeLOrdre(INFO, ORDRE_INFORMATION_ARTICLE_14)).toEqual([]);
  });
  it('REQ-JUR-060 — aucune date du contact, aucun nombre en clair, aucun lien, l’apporteur par son nom', () => {
    expect(fautesDeDate(TOUS)).toEqual([]);
    expect(fautesDeNombre(TOUS)).toEqual([]);
    expect(fautesDeLien(TOUS)).toEqual([]);
    expect(fautesDIdentite(INFO.source!, SCRIPT.ouverture!, TOUS)).toEqual([]);
  });
  it('REQ-JUR-060 — TÉMOINS : chaque règle rougit sur un texte cassé d’un geste', () => {
    expect(fautesDesRubriques({ ...INFO, finalite: ' ' }, LIEN_OPPOSITION, REQ_JUR_060)).toEqual([
      'rubrique vide : « finalité » (finalite)',
    ]);
    expect(
      fautesDesRubriques(
        INFO,
        LIEN_OPPOSITION,
        REQ_JUR_060.replace('base légale', 'base légale, transferts')
      )
    ).toEqual(['rubrique sans clé : « transferts »']);
    expect(
      fautesDeLOrdre(INFO, [...ORDRE_INFORMATION_ARTICLE_14.filter((c) => c !== 'droits'), 'titre'])
    ).toEqual(['clé hors de l’ordre : droits', 'doublon dans l’ordre']);
    expect(fautesDeDate({ source: `${INFO.source} Vous vous êtes vus le 12 mars.` })).toEqual([
      'source : une date du contact',
    ]);
    expect(fautesDeDate({ source: '{dateContact}' })).toEqual(['source : une date du contact']);
    expect(fautesDeNombre({ duree: 'Elles sont supprimées 6 mois après.' })).toEqual([
      'duree : un nombre en clair',
    ]);
    expect(fautesDeNombre({ baseLegale: 'l’article 6, paragraphe 1, point f' })).toEqual([
      'baseLegale : un nombre en clair',
    ]);
    expect(fautesDeLien({ droits: 'Écrivez à https://exemple.invalid' })).toEqual([
      'droits : un lien ou une balise',
    ]);
    expect(
      fautesDIdentite('{emailApporteur} nous a présenté', SCRIPT.ouverture!, {
        source: '{emailApporteur}',
      })
    ).toEqual([
      'source : l’apporteur n’est pas nommé par prénom et nom',
      'source : une coordonnée de l’apporteur',
    ]);
  });
});

describe('REQ-JUR-009 — la mention de l’art. 14 au script de qualification', () => {
  it('REQ-JUR-009 — même version que l’e-mail, deux cas, aucune rubrique recopiée', () => {
    expect(
      fautesDuScript(SCRIPT, INFO, VERSION_MENTION_SCRIPT, VERSION_INFORMATION_ARTICLE_14)
    ).toEqual([]);
  });
  it('REQ-JUR-009 — TÉMOINS : une autre version, une rubrique recopiée, un cas manquant rougissent', () => {
    expect(
      fautesDuScript(SCRIPT, INFO, 'information-article-14/v0', VERSION_INFORMATION_ARTICLE_14)
    ).toEqual([
      `version du script information-article-14/v0 ≠ version de l’e-mail ${VERSION_INFORMATION_ARTICLE_14}`,
    ]);
    expect(
      fautesDuScript(
        { ...SCRIPT, apresCourriel: `${SCRIPT.apresCourriel} ${INFO.droits}` },
        INFO,
        VERSION_MENTION_SCRIPT,
        VERSION_INFORMATION_ARTICLE_14
      )
    ).toEqual(['script.apresCourriel recopie la rubrique droits']);
    expect(
      fautesDuScript(
        { ...SCRIPT, sansCourriel: '' },
        INFO,
        VERSION_MENTION_SCRIPT,
        VERSION_INFORMATION_ARTICLE_14
      )
    ).toEqual(['le script n’a pas ses deux cas']);
  });
});
