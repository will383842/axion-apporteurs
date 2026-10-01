// @req REQ-UX-047
// @req REQ-UX-019
/**
 * GOV-113 — la garde UX des écrans : REQ-UX-047, maquette validée et cinq états pour toute tâche
 * d'écran, console comprise.
 *
 * CE QUE CE FICHIER GARDE, BLOC PAR BLOC.
 *
 *   (1) L'identifiant de tâche que lit `maquettes-validees` n'est plus le seul `UX-P…` : il est DÉRIVÉ
 *       du motif d'identifiant du schéma du registre (`scripts/lot/tasks.schema.json`, RM-01). Une
 *       ligne de `VALIDATION.md` qui ne nomme qu'une tâche d'une autre zone (EXT, SEC, CPL) verrouille cette tâche ;
 *       un identifiant que le registre ne connaît pas reste refusé et nommé.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { controler, lireValidation, type Vue } from '../../../scripts/gates/maquettes-validees';
import {
  FAMILLES_D_ETATS,
  FAMILLES_SANS_OBJET,
  etatsDe,
  etatsManquants,
} from '../../../scripts/lib/ux-ecrans';

const TABLEAU = (lignes: string[]) =>
  [
    '## Console',
    '',
    '| Écran | Fichier | Tâche | Validé le | Par |',
    '| --- | --- | --- | --- | --- |',
    ...lignes,
    '',
  ].join('\n');

const vue = (validation: string, taches: Vue['taches']): Vue => ({
  validation,
  maquettes: [
    'fiche-prospect.html',
    'connexion-console.html',
    'apporteur-fiche.html',
    'index.html',
  ],
  taches,
});

describe('REQ-UX-047 — maquettes-validees lit tout identifiant du registre, plus seulement UX-P…', () => {
  it('REQ-UX-047 — une ligne qui ne nomme qu’EXT-T02a est bien formée et verrouille EXT-T02a', () => {
    const lu = lireValidation(
      TABLEAU(['| Fiche prospect | `fiche-prospect.html` | EXT-T02a | — | — |'])
    );
    expect(lu.fautes).toEqual([]);
    expect(lu.lignes[0]!.taches).toEqual(['EXT-T02a']);
  });

  it('REQ-UX-047 — plusieurs identifiants de préfixes différents sont tous lus', () => {
    const lu = lireValidation(
      TABLEAU([
        '| Connexion | `connexion-console.html` | SEC-29 · UX-P1-16 | — | — |',
        '| Fiche apporteur | `apporteur-fiche.html` | UX-P1-12 · CPL-T07 | — | — |',
      ])
    );
    expect(lu.lignes.map((l) => l.taches)).toEqual([
      ['SEC-29', 'UX-P1-16'],
      ['UX-P1-12', 'CPL-T07'],
    ]);
  });

  it('REQ-UX-047 — TÉMOIN : EXT-T02a attribuée sans validation rougit et la nomme', () => {
    const fautes = controler(
      vue(TABLEAU(['| Fiche prospect | `fiche-prospect.html` | EXT-T02a | — | — |']), [
        { id: 'EXT-T02a', statut: 'en_cours', owner: 'A05' },
      ])
    );
    expect(fautes.map((f) => f.famille)).toContain('ecran_attribue_sans_validation');
    expect(fautes.find((f) => f.famille === 'ecran_attribue_sans_validation')!.message).toMatch(
      /EXT-T02a/
    );
  });

  it('REQ-UX-047 — TÉMOIN : un identifiant inconnu du registre est refusé et nommé', () => {
    const fautes = controler(
      vue(TABLEAU(['| Fiche prospect | `fiche-prospect.html` | EXT-T99 | — | — |']), [
        { id: 'EXT-T02a', statut: 'a_faire', owner: null },
      ])
    );
    expect(fautes.map((f) => f.message).join('\n')).toMatch(/EXT-T99 n'existe pas/);
  });

  it('REQ-UX-047 — le motif est celui du schéma du registre, jamais retapé', () => {
    const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
      items?: { properties?: { id?: { pattern?: string } } };
      properties?: Record<string, unknown>;
    };
    const texte = JSON.stringify(schema);
    const motif = /"pattern":"(\^\[A-Z\][^"]*\$)"/.exec(texte)?.[1];
    expect(motif).toBeDefined();
    expect(readFileSync('scripts/gates/maquettes-validees.ts', 'utf8')).not.toMatch(/UX-P\\d-/);
  });
});

describe('REQ-UX-047 — les états d’une maquette : étiquette « État : … », alias exacts, exception nommée', () => {
  const section = (id: string, etiquette: string | null = `État : ${id}`) =>
    `<section class="ecran" id="${id}"${etiquette ? ` aria-label="${etiquette}"` : ''}></section>`;
  const maquette = (...ids: string[]) => ids.map((id) => section(id)).join('');

  it('REQ-UX-047 REQ-UX-019 : un alias n’appartient qu’à UNE famille', () => {
    const tous: string[] = Object.values(FAMILLES_D_ETATS).flat();
    expect(tous.filter((a, i) => tous.indexOf(a) !== i)).toEqual([]);
  });

  it('REQ-UX-047 REQ-UX-019 : TÉMOIN : une section sans étiquette « État : … » ne compte pas comme état', () => {
    const complete = maquette('etat-nominal', 'etat-vide', 'etat-chargement', 'etat-erreur');
    expect(etatsManquants(complete, false)).toEqual([]);
    const chargementSansEtiquette = complete.replace(
      section('etat-chargement'),
      section('etat-chargement', null)
    );
    expect(etatsManquants(chargementSansEtiquette, false)).toEqual(['chargement']);
    expect(etatsDe(chargementSansEtiquette)).not.toContain('etat-chargement');
  });

  it('REQ-UX-047 REQ-UX-019 : TÉMOIN : la vue d’un rôle (etat-lecteur, etat-qualifieur) n’est pas un accès refusé', () => {
    const base = ['etat-nominal', 'etat-vide', 'etat-chargement', 'etat-erreur'];
    expect(etatsManquants(maquette(...base, 'etat-lecteur'), true)).toEqual(['refus']);
    expect(etatsManquants(maquette(...base, 'etat-qualifieur'), true)).toEqual(['refus']);
    expect(etatsManquants(maquette(...base, 'etat-refuse'), true)).toEqual([]);
  });

  it('REQ-UX-047 REQ-UX-019 : TÉMOIN : l’écran fermé à un rôle ne vaut pas état vide ; seule l’exception NOMMÉE d’acces-refuse.html en dispense', () => {
    const pageDeRefus = maquette('etat-ecran', 'etat-chargement', 'etat-erreur');
    expect(etatsManquants(pageDeRefus, true, 'autre.html')).toEqual(['vide']);
    expect(etatsManquants(pageDeRefus, true, 'acces-refuse.html')).toEqual([]);
    expect(Object.keys(FAMILLES_SANS_OBJET)).toEqual(['acces-refuse.html']);
    expect(FAMILLES_SANS_OBJET['acces-refuse.html']!.vide).toMatch(/\S/);
  });
});
