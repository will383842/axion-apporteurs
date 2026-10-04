// @req REQ-UX-047
// @req REQ-DM-027
// @req REQ-SEC-026
// @req REQ-UX-048
/**
 * CPL-T07 — l'écran du dossier de conformité, rendu EN PROCESSUS par son composant pur : les pièces
 * en service et leur état, les gestes que le rôle permet, le RIB sans geste (vérifié à quatre yeux
 * hors de cet écran), ce qui manque pour signer, les quatre états, et jamais l'IBAN. La règle (droit,
 * transitions, motifs) est jugée par `tests/integration/dossier-de-conformite.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ChargementDuDossier,
  DossierDeConformite,
  type DroitsDuDossier,
} from '../../../src/components/console/dossier-de-conformite';
import { CONFORMITE_CONSOLE as T } from '../../../src/content/micro-copy/console/conformite';
import { MOTIFS_REFUS_PIECE } from '../../../src/domain/kyc/pieces';
import { roleAutorise } from '../../../src/server/roles/matrice';
import {
  ROUTES_LIVREES_DE_LA_CONSOLE,
  entreesDuRole,
} from '../../../src/server/console/navigation';

const rien = async (): Promise<void> => undefined;
const ACTIONS = { verifier: rien, ouvrir: rien, valider: rien };
const APPORTEUR = '0190f0f0-0000-7000-8000-0000000000aa';
const date = (d: Date) => d.toISOString().slice(0, 10);

type Statut = 'manquante' | 'a_verifier' | 'valide' | 'perimee' | 'refusee';
type Type = 'siret' | 'tva' | 'rib' | 'identite' | 'vigilance' | 'rc_pro';
const piece = (
  type: Type,
  statut: Statut,
  extra: { expireAt?: Date | null; remplaceeAt?: Date | null } = {}
) => ({
  id: `0190f0f0-0000-7000-8000-${type.padEnd(12, '0').replace(/_/g, '0').slice(0, 12)}`,
  type,
  statut,
  expireAt: extra.expireAt ?? null,
  verifieeAt: null,
  remplaceeAt: extra.remplaceeAt ?? null,
});

const droitsDu = (role: 'admin' | 'qualifieur'): DroitsDuDossier => ({
  verifier: roleAutorise('action:verifier_piece', role),
  ouvrir: roleAutorise('action:ouvrir_kyc', role),
  valider: roleAutorise('action:valider_kyc', role),
});

function rendu(
  dossier: Parameters<typeof DossierDeConformite>[0]['dossier'],
  droits: DroitsDuDossier = droitsDu('admin'),
  refus: Parameters<typeof DossierDeConformite>[0]['refus'] = null
) {
  return renderToStaticMarkup(
    createElement(DossierDeConformite, {
      apporteurId: APPORTEUR,
      dossier,
      droits,
      actions: ACTIONS,
      refus,
      date,
    })
  );
}

const EN_COURS = {
  statut: 'kyc_en_cours' as const,
  identite: { siren: '552100554', regimeTva: 'franchise_293b' as const },
  pieces: [
    piece('siret', 'a_verifier'),
    piece('rib', 'a_verifier'),
    piece('rc_pro', 'valide', { expireAt: new Date('2027-06-30T00:00:00.000Z') }),
    // Écartée du service : elle ne s'affiche plus.
    piece('identite', 'refusee', { remplaceeAt: new Date('2027-01-01T00:00:00.000Z') }),
  ],
  manques: ['siret' as const, 'identite' as const],
};

describe('REQ-UX-047 — le dossier rendu, état nominal', () => {
  it('REQ-UX-047 : TÉMOIN — les pièces EN SERVICE seules, leur état et leur échéance ; la légende compte ce qui reste à vérifier', () => {
    const h = rendu(EN_COURS);
    expect(h).toContain(T.legende(3, 2));
    expect(h).toContain(T.types.siret);
    expect(h).toContain(`${T.statuts.valide} ${T.jusquau('2027-06-30')}`);
    expect(h).not.toContain(T.types.identite + '</td>');
    expect(h).toContain('552100554');
  });

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — une pièce à vérifier a ses deux gestes ; le RIB à vérifier n’en a AUCUN', () => {
    const h = rendu(EN_COURS);
    expect(h.match(/name="decision" value="valider"/g)).toHaveLength(1);
    expect(h).toContain(`value="${EN_COURS.pieces[0]!.id}"`);
    expect(h).not.toContain(`name="pieceId" value="${EN_COURS.pieces[1]!.id}"`);
    expect(h).toContain(T.ribAilleurs);
  });

  it('REQ-DM-027 : le refus offre EXACTEMENT les cinq motifs fermés, et aucun champ libre', () => {
    const h = rendu(EN_COURS);
    const options = [...h.matchAll(/<option value="([a-z_]+)">/g)].map((m) => m[1]);
    expect(options).toEqual([...MOTIFS_REFUS_PIECE]);
    expect(h).not.toMatch(/<textarea|type="text"/);
  });

  it('REQ-DM-027 : ce qui manque pour signer est nommé ; le bouton de validation n’apparaît que s’il ne manque rien', () => {
    expect(rendu(EN_COURS)).toContain(T.manques(`${T.types.siret}, ${T.types.identite}`));
    expect(rendu(EN_COURS)).not.toContain(T.actions.validerLeDossier);
    const complet = rendu({ ...EN_COURS, manques: [] });
    expect(complet).toContain(T.complet);
    expect(complet).toContain(T.actions.validerLeDossier);
  });

  it('REQ-UX-047 : TÉMOIN — le qualifieur vérifie les pièces, mais n’ouvre ni ne valide le dossier', () => {
    const q = rendu({ ...EN_COURS, manques: [] }, droitsDu('qualifieur'));
    expect(q).toContain(T.actions.valider);
    expect(q).not.toContain(T.actions.validerLeDossier);
    const retenu = { ...EN_COURS, statut: 'retenu' as const };
    expect(rendu(retenu, droitsDu('qualifieur'))).not.toContain(T.actions.ouvrir);
    expect(rendu(retenu, droitsDu('admin'))).toContain(T.actions.ouvrir);
  });
});

describe('REQ-UX-047 — les quatre états, et jamais l’IBAN', () => {
  it('REQ-UX-047 : vide, introuvable, refus d’un geste, chargement', () => {
    expect(rendu({ ...EN_COURS, pieces: [] })).toContain(T.vide.phrase);
    expect(rendu(null)).toContain(T.introuvable.titre);
    expect(rendu(EN_COURS, droitsDu('admin'), 'piece_pas_a_verifier')).toContain(
      `<p role="alert">${T.refus.piece_pas_a_verifier.replace(/’/g, '’')}</p>`
    );
    expect(renderToStaticMarkup(createElement(ChargementDuDossier))).toContain(T.chargement);
  });

  it('REQ-SEC-026 : TÉMOIN — le lecteur du dossier ne SÉLECTIONNE jamais l’IBAN, et l’écran ne le rend pas', () => {
    const lecteur = readFileSync('src/server/conformite/dossier.ts', 'utf8');
    expect(lecteur).not.toMatch(/iban(Chiffre|Hash)\s*:\s*true/);
    const h = rendu(EN_COURS);
    expect(h).not.toMatch(/FR\d{2}|iban(Chiffre|Hash)/i);
  });
});

describe('REQ-UX-048 — la route du dossier, livrée, hors du menu', () => {
  it('REQ-UX-048 : TÉMOIN — la carte la dit livrée, la navigation la compte parmi les routes livrées, et aucun onglet ne la porte', () => {
    const ligne = readFileSync('docs/CONSOLE-ROUTES.md', 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('| `/console/apporteurs/[id]/conformite`'));
    expect(ligne).toContain('| livrée |');
    expect(ROUTES_LIVREES_DE_LA_CONSOLE).toContain('/console/apporteurs/[id]/conformite');
    for (const role of ['admin', 'qualifieur'] as const)
      expect(entreesDuRole(role).map((e) => e.route)).not.toContain(
        '/console/apporteurs/[id]/conformite'
      );
  });
});
