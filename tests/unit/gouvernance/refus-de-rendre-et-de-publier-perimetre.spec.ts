// @req REQ-GOV-032
/**
 * UNE GARDE QUI NE PEUT PAS ÉTABLIR SON PÉRIMÈTRE REFUSE.
 *
 * Chaque garde déclarée qui balaie les fichiers suivis est lancée dans un dossier où `git ls-files`
 * ne répond pas : elle refuse, nommée, et ne range pas `perimetre_illisible` parmi ses fautes.
 * Scindé de `refus-de-rendre-et-de-publier.spec.ts` par QA-T72 (le plafond de durée de la porte
 * A) : les `it()` sont ceux d'origine, déplacés sans changement ; le banc partagé vit dans
 * `refus-de-rendre-et-de-publier-outils.ts`.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GARDES_QUI_BALAIENT,
  depotCompletJetable,
  famillesDeclarees,
  lancerLaGate,
  nettoyerLesDepotsJetables,
} from './refus-de-rendre-et-de-publier-outils';

afterAll(nettoyerLesDepotsJetables);

describe('REQ-CPL-018 — une garde qui ne peut pas établir son PÉRIMÈTRE refuse', () => {
  for (const script of GARDES_QUI_BALAIENT) {
    it(`REQ-CPL-018 — \`${script}\` REFUSE quand \`git ls-files\` ne répond pas`, () => {
      // Un dossier SANS `.git` : `faireDeCeDossierUnDepot` n'est PAS appelé ici, c'est le sujet.
      // 🔑 AUCUNE RECOPIE : le montage est celui de `depotCompletJetable`, paramétré. Motif de
      // `schema` au 24e tour — j’avais recopié son corps à la main **dans le commit même qui
      // ferme un patron recopié cinq fois**, en y perdant au passage le `rmSync` du `.tar` et
      // en y laissant un `git archive` dont le résultat était jeté.
      const sansGit = depotCompletJetable({ avecGit: false });

      const aveugle = lancerLaGate(script, sansGit);
      expect(
        aveugle.code,
        `${script} rend un verdict sur un périmètre INCONNU — elle a imprimé :\n${aveugle.sortie.slice(0, 500)}`
      ).not.toBe(0);
      expect(aveugle.sortie, `${script} refuse, mais pas pour \`perimetre_illisible\``).toContain(
        'perimetre_illisible'
      );

      // CONTRE-TÉMOIN : sur le dépôt RÉEL elle reste verte. Sans lui, un faux rouge passerait
      // pour une correction.
      const reel = lancerLaGate(script, resolve('.'));
      expect(
        reel.code,
        `${script} refuse le dépôt RÉEL — j’aurais remplacé un faux vert par un faux rouge :\n${reel.sortie.slice(0, 500)}`
      ).toBe(0);
    }, 180_000);
  }
});

/**
 * 🔑 `perimetre_illisible` N'EST PAS UNE FAMILLE DE FAUTE — c'est un REFUS DE PRÉCONDITION.
 *
 * Motif de `schema` au 24e tour : quatre gardes IMPRIMENT ce mot sans le DÉCLARER dans leurs
 * `FAMILLES`, et leur `--prove` affirme « les N familles rougissent chacune sur son témoin » alors
 * que la gate peut en émettre N+1. Elle avait raison de le relever ; **la correction que j'ai
 * essayée d'abord était fausse** — ajouter le mot à `FAMILLES` fait rougir `--prove` :
 *
 * ```
 * ❌ 1 famille(s) sans témoin qui rougit : perimetre_illisible.
 * ```
 *
 * Et `--prove` a raison à son tour : une famille de faute est **produite par `controler()`** et
 * rendue dans une liste ; celle-ci **sort du processus avant toute analyse**. Les deux ne se
 * prouvent pas de la même manière, et les mélanger rendait la preuve impossible.
 *
 * > **Une précondition et une faute ne se déclarent pas ensemble : l'une dit que le contrôle NE
 * > PEUT PAS avoir lieu, l'autre dit ce qu'il a trouvé.** Le `--prove` d'une gate prouve les
 * > secondes ; la première se prouve en LANÇANT la gate hors de ses préconditions.
 *
 * Ce témoin garde donc la DISTINCTION elle-même : si quelqu'un range un jour `perimetre_illisible`
 * parmi les familles de faute, il rougit et force l'arbitrage — au lieu de casser `--prove`
 * silencieusement, comme je viens de le faire.
 */
describe('REQ-CPL-018 — `perimetre_illisible` est une PRÉCONDITION, pas une famille de faute', () => {
  for (const script of GARDES_QUI_BALAIENT) {
    it(`REQ-CPL-018 — \`${script}\` ne range pas \`perimetre_illisible\` parmi ses familles de faute`, () => {
      // 🔑 AUCUN `catch` ICI. Ma version précédente avalait l'échec d'extraction et rendait VERT —
      // sur le cas même qu'elle interdit (`schema`, 25e tour : `5 passed | 42 skipped`).
      // *Sous une assertion NÉGATIVE, « je n'ai pas su lire » devient « rien à signaler ».*
      // Si l'extracteur ne sait pas lire cette gate, il LÈVE et le test tombe : c'est le bon sens
      // de l'échec, et ça force à étendre l'extracteur plutôt qu'à le laisser perdre en silence.
      const declaration = famillesDeclarees(script);
      // `null` = aucune famille déclarée, établi par l’extracteur (il LÈVE si le mot `FAMILLES`
      // apparaît sans déclaration reconnue). Rien à confondre.

      // ⚠️ UNE LISTE CALCULÉE NE SE LIT PAS DANS LA SOURCE. `gov-publication.ts:118` fait
      // `['doctrine', ...CHIFFRES.map(…)]` : l’extracteur en voit UNE sur sept. Asserter
      // `not.toContain` sur un septième serait un vert obtenu sur presque rien.
      // On assert alors ce qui reste VRAI et vérifiable : le jeton n’apparaît nulle part dans
      // le fichier — donc il ne peut pas non plus sortir du calcul. C’est plus faible, et c’est
      // DIT. *Une garde qui ne peut pas tout prouver dit ce qu’elle prouve.*
      // 🔑 `null` (aucune liste de familles) et « liste calculée » sont le MÊME cas pour une
      // assertion NÉGATIVE : dans les deux, l'absence dans la liste ne prouve rien. Rendre la
      // main ici — ce que faisait `if (declaration === null) return;` — c'était le défaut du
      // 25e tour DÉPLACÉ, pas fermé : le test affichait `✓` sous le nom de la garde sans rien
      // asserter (`schema`, 26e tour : mutation additive `famille: 'perimetre_illisible'` dans
      // `gov-identifiants.ts` → `5 passed`, identique au banc sain). On retombe donc sur le
      // balayage de la SOURCE ENTIÈRE : plus faible, et DIT.
      if (declaration === null || declaration.calculee) {
        expect(
          readFileSync(script, 'utf8'),
          `${script} : aucune liste de familles lisible (null ou calculée), et le jeton ` +
            `perimetre_illisible apparaît quand même dans la source`
        ).not.toContain('perimetre_illisible');
        return;
      }

      // CONTRÔLE POSITIF : une liste d’un seul nom satisferait le `not.toContain` sans rien lire.
      expect(
        declaration.noms.length,
        `${script} : ${declaration.noms.length} famille(s) extraite(s) — trop peu pour que l’absence prouve quoi que ce soit`
      ).toBeGreaterThanOrEqual(2);

      expect(
        declaration.noms,
        `${script} déclare perimetre_illisible comme famille de FAUTE. C’est un refus de PRÉCONDITION : ` +
          'il sort avant toute analyse, donc `--prove` ne pourra jamais lui trouver de témoin.'
      ).not.toContain('perimetre_illisible');
    });
  }
});
