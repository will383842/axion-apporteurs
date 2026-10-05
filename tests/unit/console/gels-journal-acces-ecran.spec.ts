// @req REQ-SEC-023
// @req REQ-UX-047
/**
 * L'écran des gels du journal des accès, rendu EN PROCESSUS par son composant pur, et son droit RELU
 * en base sur un faux client. La règle du gel (poser, lever, quatre yeux, événement) est jugée par
 * `tests/unit/securite/gels-journal-acces.spec.ts` et par le témoin d'intégration du module.
 *
 * CE QUE CE FICHIER GARDE.
 *   (1) REQ-SEC-023 — le droit de l'écran : un administrateur VALIDÉ, actif, voit poser ET lever ;
 *       tout autre rôle, un administrateur en attente ou désactivé, ne voit ni l'écran ni le geste.
 *       Le droit est relu EN BASE, et un refus ne lit aucun gel.
 *   (2) REQ-SEC-023 — le rendu : le formulaire de pose et le bouton de levée n'existent que si le
 *       droit les ouvre ; un gel levé n'a plus de bouton.
 *   (3) REQ-UX-047 — chaque refus du module a sa phrase, et celui où personne d'autre ne peut lever
 *       le dit : « aucun autre administrateur ». Aucun texte en dur dans le composant.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConsoleRole, PrismaClient } from '@prisma/client';
import { ROLES_CONSOLE, roleAutorise } from '../../../src/server/roles/matrice';
import {
  droitsDuLecteurSurLesGels,
  droitsSurLesGels,
  type MotifDuGel,
} from '../../../src/server/console/gels-journal-acces';
import { GELS_JOURNAL_ACCES as T } from '../../../src/content/micro-copy/console/gels-journal-acces';
import {
  EcranDesGels,
  type GelAffiche,
} from '../../../src/app/(console)/console/journal-des-acces/gels/ecran';
import { lireLaSaisieDuGel } from '../../../src/app/(console)/console/journal-des-acces/gels/saisie';

const DEPUIS = new Date('2026-01-01T00:00:00.000Z');
const POSE = new Date('2028-05-01T09:00:00.000Z');
const LECTEUR = '0190f0f0-0000-7000-8000-00000000000a';
const ECRAN = 'src/app/(console)/console/journal-des-acces/gels/ecran.tsx';

type Lu = { role: ConsoleRole; desactiveAt: Date | null; valideAt: Date | null };
const valide = (role: ConsoleRole): Lu => ({ role, desactiveAt: null, valideAt: DEPUIS });

const rien = async (): Promise<void> => undefined;
const ACTIONS = { poser: rien, lever: rien };

const gel = (extra: Partial<GelAffiche> = {}): GelAffiche => ({
  id: '0190f0f0-0000-7000-8000-00000000000e',
  motif: 'litige',
  reference: 'LIT-0042',
  portee: 'utilisateur',
  depuis: DEPUIS,
  jusquA: null,
  poseAt: POSE,
  leveAt: null,
  ...extra,
});

const date = (d: Date) => d.toISOString().slice(0, 10);

function rendu(
  o: {
    gels?: GelAffiche[];
    droits?: { poser: boolean; lever: boolean };
    refus?: MotifDuGel | null;
  } = {}
) {
  return renderToStaticMarkup(
    createElement(EcranDesGels, {
      gels: o.gels ?? [gel()],
      droits: o.droits ?? { poser: true, lever: true },
      actions: ACTIONS,
      refus: o.refus ?? null,
      date,
    })
  );
}

describe('REQ-SEC-023 — (1) le droit de l’écran des gels', () => {
  it('REQ-SEC-023 — un administrateur validé et actif voit poser ET lever', () => {
    expect(droitsSurLesGels(valide('admin'))).toEqual({ poser: true, lever: true });
  });

  it('REQ-SEC-023 — TÉMOIN : l’administrateur en attente, désactivé, ou inconnu ne voit rien', () => {
    expect(droitsSurLesGels({ role: 'admin', desactiveAt: null, valideAt: null })).toBeNull();
    expect(droitsSurLesGels({ role: 'admin', desactiveAt: POSE, valideAt: DEPUIS })).toBeNull();
    expect(droitsSurLesGels(null)).toBeNull();
  });

  it('REQ-SEC-023 — TÉMOIN : chaque rôle que la matrice n’ouvre pas aux gels ne voit rien, validé ou non', () => {
    const autres = ROLES_CONSOLE.filter(
      (r) =>
        !roleAutorise('action:poser_gel_journal_acces', r) &&
        !roleAutorise('action:lever_gel_journal_acces', r)
    );
    // La liste n'est pas vide : sinon ce témoin ne jugerait rien.
    expect(autres).toEqual(['qualifieur', 'comptable', 'lecteur']);
    for (const r of autres) expect(droitsSurLesGels(valide(r)), r).toBeNull();
  });

  it('REQ-SEC-023 — le droit est RELU en base, sur le lecteur seul ; un refus ne lit aucun gel', async () => {
    const appels: { modele: string; args: unknown }[] = [];
    const client = (lu: Lu | null) =>
      ({
        utilisateurConsole: {
          findUnique: async (a: unknown) => {
            appels.push({ modele: 'utilisateurConsole', args: a });
            return lu;
          },
        },
        journalAccesConsoleGel: {
          findMany: async (a: unknown) => {
            appels.push({ modele: 'journalAccesConsoleGel', args: a });
            return [];
          },
        },
      }) as unknown as PrismaClient;

    expect(await droitsDuLecteurSurLesGels(client(valide('admin')), LECTEUR)).toEqual({
      poser: true,
      lever: true,
    });
    expect(appels).toEqual([
      {
        modele: 'utilisateurConsole',
        args: {
          where: { id: LECTEUR },
          select: { role: true, desactiveAt: true, valideAt: true },
        },
      },
    ]);
    appels.length = 0;
    expect(
      await droitsDuLecteurSurLesGels(
        client({ role: 'admin', desactiveAt: null, valideAt: null }),
        LECTEUR
      )
    ).toBeNull();
    expect(appels.map((a) => a.modele)).toEqual(['utilisateurConsole']);
  });
});

describe('REQ-SEC-023 — (2) le rendu : le geste n’existe que si le droit l’ouvre', () => {
  it('REQ-SEC-023 — l’administrateur validé voit le formulaire de pose et le bouton de levée', () => {
    const html = rendu();
    expect(html).toContain(T.poser.titre);
    expect(html).toContain(`>${T.poser.envoyer}</button>`);
    expect(html).toContain(`>${T.actions.lever}</button>`);
    expect(html).toContain('name="gelId" value="0190f0f0-0000-7000-8000-00000000000e"');
  });

  it('REQ-SEC-023 — TÉMOIN : sans le droit, ni formulaire de pose ni bouton de levée', () => {
    const html = rendu({ droits: { poser: false, lever: false } });
    expect(html).not.toContain(T.poser.titre);
    expect(html).not.toContain('<form');
    expect(html).not.toContain(T.actions.lever);
  });

  it('REQ-SEC-023 — un gel levé n’a plus de bouton : il dit quand il l’a été', () => {
    const html = rendu({ gels: [gel({ leveAt: new Date('2028-05-20T09:00:00.000Z') })] });
    expect(html).not.toContain(`>${T.actions.lever}</button>`);
    expect(html).toContain(T.etats.leve('2028-05-20'));
  });

  it('REQ-SEC-023 — la liste ne montre ni l’auteur ni la personne visée : la portée, son type seul', () => {
    const html = rendu();
    expect(html).toContain(T.portees.utilisateur);
    expect(html).toContain('LIT-0042');
    expect(html).not.toMatch(/poseParId|utilisateurViseId|cibleId/);
  });
});

describe('REQ-UX-047 — (3) les refus, les états et la source unique des textes', () => {
  it('REQ-UX-047 — chaque refus du module a sa phrase, rendue telle quelle', () => {
    const motifs: MotifDuGel[] = [
      'droit_absent',
      'introuvable',
      'deja_leve',
      'leveur_interdit',
      'aucun_autre_administrateur',
    ];
    expect(Object.keys(T.refus).sort()).toEqual([...motifs].sort());
    for (const m of motifs) expect(rendu({ refus: m })).toContain(T.refus[m]);
  });

  it('REQ-UX-047 — quand personne d’autre ne peut lever, l’écran le dit : « aucun autre administrateur »', () => {
    expect(T.refus.aucun_autre_administrateur).toMatch(/aucun autre administrateur/);
    const html = rendu({ refus: 'aucun_autre_administrateur' });
    expect(html).toContain('role="alert"');
    expect(html).toContain(T.refus.aucun_autre_administrateur);
  });

  it('REQ-UX-047 — l’état vide dit le geste suivant, et reste muet sur la pose sans le droit', () => {
    expect(rendu({ gels: [] })).toContain(T.vide.titre);
    expect(rendu({ gels: [] })).toContain(T.vide.phrase);
  });

  it('REQ-UX-047 — aucun texte en dur dans le composant : tout vient de la micro-copie', () => {
    const source = readFileSync(ECRAN, 'utf8');
    expect(source).toMatch(/content\/micro-copy\/console\/gels-journal-acces/);
    // Après une balise ouvrante, rien que des expressions : aucun mot écrit à la main.
    const texteEnDur = /<[a-z][^<>]*>\s*[A-Za-zÀ-ÿ][^<>{}]*</g;
    expect(source.match(texteEnDur) ?? []).toEqual([]);
    // TÉMOIN : le même contrôle voit un libellé tapé dans un bouton.
    expect('<button type="submit">Lever</button>'.match(texteEnDur)).toHaveLength(1);
  });
});

describe('REQ-SEC-023 — (4) la saisie de la pose, fermée avant tout travail', () => {
  const formulaire = (o: Record<string, string>) => {
    const f = new FormData();
    const base = {
      motif: 'litige',
      reference: 'LIT-0042',
      portee: 'utilisateur',
      identifiant: '0190F0F0-0000-7000-8000-00000000000C',
      depuis: '2026-01-01',
      jusquA: '',
    };
    for (const [k, v] of Object.entries({ ...base, ...o })) f.set(k, v);
    return f;
  };

  it('REQ-SEC-023 — une saisie juste est lue : jours de Paris, fin de jour incluse, identifiant en minuscules', () => {
    expect(lireLaSaisieDuGel(formulaire({ jusquA: '2026-07-31' }))).toEqual({
      motif: 'litige',
      reference: 'LIT-0042',
      portee: 'utilisateur',
      identifiant: '0190f0f0-0000-7000-8000-00000000000c',
      // Minuit à Paris en hiver : 23 h UTC la veille.
      depuis: new Date('2025-12-31T23:00:00.000Z'),
      // La dernière milliseconde du 31 juillet à Paris, en été.
      jusquA: new Date('2026-07-31T21:59:59.999Z'),
    });
    expect(lireLaSaisieDuGel(formulaire({}))?.jusquA).toBeNull();
  });

  it('REQ-SEC-023 — TÉMOINS : chaque forme fautive rend null, sans rien écrire', () => {
    for (const faute of <Record<string, string>[]>[
      { motif: 'autre' },
      { portee: 'tous' },
      { identifiant: '42' },
      { reference: '' },
      { depuis: '' },
      { depuis: '2026-02-30' },
      { jusquA: '2025-12-31' },
      { jusquA: 'demain' },
    ])
      expect(lireLaSaisieDuGel(formulaire(faute)), JSON.stringify(faute)).toBeNull();
  });
});
