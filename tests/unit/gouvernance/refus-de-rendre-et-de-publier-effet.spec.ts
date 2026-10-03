// @req REQ-GOV-032
/**
 * LES TÉMOINS D'EFFET : une gate neutralisée ne peut pas rester verte.
 *
 * Chaque gate déclarée est LANCÉE sur un dépôt jetable sain puis fauté : 0 sans faute, non nul et
 * nommée avec elle ; le mode `--render` ne rend pas une vue depuis une source fautive ; chaque
 * entrée déclarée d'un témoin est nécessaire.
 * Scindé de `refus-de-rendre-et-de-publier.spec.ts` par QA-T72 (le plafond de durée de la porte
 * A) : les `it()` sont ceux d'origine, déplacés sans changement ; le banc partagé vit dans
 * `refus-de-rendre-et-de-publier-outils.ts`.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GATES_A_TEMOIN_D_EFFET,
  depotCompletJetable,
  depotJetableAvec,
  famillesDeclarees,
  lancerLaGate,
  nettoyerLesDepotsJetables,
} from './refus-de-rendre-et-de-publier-outils';

afterAll(nettoyerLesDepotsJetables);

describe('REQ-GOV-032 — TÉMOINS D’EFFET : une gate neutralisée ne peut pas rester verte', () => {
  for (const { nom, script, fichiers, fautes, vue, depot } of GATES_A_TEMOIN_D_EFFET) {
    for (const { famille, appliquer } of fautes) {
      it(`REQ-GOV-032 — \`${nom}\` SORT en échec sur une faute RÉELLE de famille \`${famille}\`, et 0 sans elle`, () => {
        // CONTRÔLE POSITIF D'ABORD. Sans lui, une gate qui refuserait TOUT rendrait ce témoin vert
        // pour la mauvaise raison — un fichier d'entrée manquant, un chemin qui ne résout plus.
        const sain =
          depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        const avant = lancerLaGate(script, sain);
        expect(
          avant.code,
          `${nom} refuse un dépôt SAIN (code ${avant.code}) — le témoin ne mesurerait rien :\n${avant.sortie.slice(0, 600)}`
        ).toBe(0);

        const casse =
          depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        appliquer(casse);
        const apres = lancerLaGate(script, casse);
        expect(
          apres.code,
          `${nom} n’est PAS sortie en échec sur une faute \`${famille}\` — elle a imprimé :\n${apres.sortie.slice(0, 600)}`
        ).not.toBe(0);
        // Et pour LA bonne raison : un refus d'une AUTRE famille ne prouverait rien de celle-ci.
        // 🔑 LA FAMILLE DOIT EXISTER DANS LA GATE. Sans ça, `toContain` porte sur un nom
        // inventé : `'id'` faisait deux caractères et « inval**id**e » le satisfaisait.
        expect(
          famillesDeclarees(script)?.noms ?? [],
          `${nom} : la famille ${famille} du témoin n’existe pas dans les FAMILLES de la gate`
        ).toContain(famille);
        expect(
          apres.sortie,
          `${nom} refuse, mais pas pour la famille \`${famille}\` injectée`
        ).toContain(famille);
      }, 180_000);
    }
  }
});

/**
 * 🔴 LE MODE `--render` EST CELUI QUE CE FICHIER EXISTE POUR GARDER, ET MON TÉMOIN NE L'APPELAIT
 * PAS.
 *
 * Motif de `schema` au 21e tour, et c'est la **deuxième fois de la journée que je RETIRE de la
 * couverture en croyant l'étendre** :
 *
 * ```
 * mutant `controler(…).filter(() => false)` sur gov-tasks.ts:344 (bloc --render)
 *   7a9bd27 (le temoin de TEXTE que j'ai supprime)  ->  ROUGE
 *   30ef53e (mes deux temoins d'EFFET)              ->  VERT
 * effet reel : `gov:tasks --render` REECRIT docs/TASKS.md depuis un backlog a
 *              `dep_inconnue` reel, exit 0, banniere ✅, 140137 -> 140139 octets
 * ```
 *
 * `gov-tasks.ts` porte **deux** `const fautes = controler(…)` : le mode normal (l. 489) et le bloc
 * `--render` (l. 343), celui qui garde `writeFileSync(CHEMIN_VUE)`. Mon témoin lançait la gate
 * **sans argument** : il n'exerçait que le premier. Or REQ-GOV-032 s'intitule « un refus de
 * **RENDRE** ».
 *
 * 🔑 **ET VOICI CE QUI ME L'A CACHÉ.** Mon tableau de mutants annonçait « ASI … MORT » **sans
 * nommer lequel des deux sites** portait la mutation. J'avais muté le site du verdict, jamais
 * celui du rendu, et le tableau ne pouvait pas le dire.
 * > **Un compte de mutants qui nomme le FICHIER et pas le SITE laisse passer exactement la
 * > régression qu'il prétend exclure.** C'est la même faute que « les DEUX frères à la même
 * > structure » au 17e tour : le nom d'une mesure n'est pas son périmètre.
 *
 * ## Ce que le témoin du mode `--render` asserte, et qui est le VRAI dommage
 *
 * Sortir en échec ne suffit pas : ce qui blesse, c'est **la vue réécrite depuis une source
 * fautive**. Le témoin compare donc le fichier de vue **avant et après**, et exige qu'il n'ait
 * pas bougé. Une gate qui refuserait en sortant 1 *après* avoir écrit resterait un défaut, et
 * aucune assertion sur le code de sortie ne le verrait.
 */
describe('REQ-GOV-032 — TÉMOIN D’EFFET du mode `--render` : une vue n’est PAS rendue depuis une source fautive', () => {
  for (const { nom, script, fichiers, fautes, vue, depot } of GATES_A_TEMOIN_D_EFFET) {
    for (const { famille, appliquer } of fautes) {
      it(`REQ-GOV-032 — \`${nom} --render\` REFUSE et n’écrit PAS \`${vue}\` sur une faute \`${famille}\``, () => {
        // 🔑 CONTRÔLE POSITIF, ET IL DOIT PROUVER QUE LE RENDU **ÉCRIT**. Trouvé par moi avant
        // le tour : ma première version n'exigeait qu'un `exit 0`. J'assertais donc qu'une vue ne
        // bouge PAS sur une source fautive **sans avoir jamais prouvé qu'elle bouge sur une source
        // saine** — une gate qui n'écrirait plus rien du tout aurait passé les deux assertions.
        // On vide la vue, on rend, elle doit être RÉÉCRITE.
        const sain =
          depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        const cheminSain = join(sain, vue);
        const TEMOIN_DE_VIDE = 'VIDÉE PAR LE TÉMOIN — le rendu doit la réécrire\n';
        writeFileSync(cheminSain, TEMOIN_DE_VIDE, 'utf8');
        const avant = lancerLaGate(script, sain, ['--render']);
        expect(
          avant.code,
          `${nom} --render refuse une source SAINE (code ${avant.code}) :\n${avant.sortie.slice(0, 600)}`
        ).toBe(0);
        expect(
          readFileSync(cheminSain, 'utf8'),
          `${nom} --render sort en 0 mais n’ÉCRIT PAS ${vue} — le témoin de non-écriture ne prouverait rien`
        ).not.toBe(TEMOIN_DE_VIDE);

        const casse =
          depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        appliquer(casse);
        const cheminVue = join(casse, vue);
        const vueAvant = readFileSync(cheminVue, 'utf8');
        const apres = lancerLaGate(script, casse, ['--render']);

        expect(
          apres.code,
          `${nom} --render n’est PAS sortie en échec sur une faute \`${famille}\` :\n${apres.sortie.slice(0, 600)}`
        ).not.toBe(0);
        expect(
          apres.sortie,
          `${nom} --render refuse, mais pas pour avoir REFUSÉ DE RENDRE`
        ).toContain('Refus de rendre');
        // 🔑 LE DOMMAGE RÉEL. Un refus qui sort en 1 APRÈS avoir écrit reste un défaut, et aucune
        // assertion sur le code de sortie ne le verrait.
        expect(
          readFileSync(cheminVue, 'utf8'),
          `${nom} --render a RÉÉCRIT ${vue} depuis une source \`${famille}\` fautive`
        ).toBe(vueAvant);
      }, 180_000);
    }
  }
});

/**
 * 🔴 CHAQUE ENTRÉE DÉCLARÉE DOIT ÊTRE NÉCESSAIRE.
 *
 * Motif de `schema` au 22e tour : `docs/DECISIONS.md` figurait dans les entrées de
 * `gov:requirements`, qui ne la lit **jamais** — mesuré, dépôt jetable avec les quatre autres
 * fichiers seulement : « ✅ gov:requirements — 355 exigences », exit 0.
 *
 * > **Mon contrôle positif ne rougissait que sur une entrée MANQUANTE, jamais sur une entrée
 * > SUPERFLUE.** Une liste d'entrées qui contient du mort déclare une couverture qui n'existe pas,
 * > et rien ne le dit.
 *
 * Ce témoin retire les entrées **une par une** et exige qu'au moins un des deux modes tombe.
 * ⚠️ Il porte sur l'UNION des modes : une entrée que seul `--render` lit paraîtrait superflue au
 * mode normal, et la retirer serait une régression silencieuse.
 */
describe('REQ-GOV-032 — les entrées déclarées des témoins d’effet sont toutes NÉCESSAIRES', () => {
  for (const { nom, script, fichiers, vue, depot } of GATES_A_TEMOIN_D_EFFET) {
    if (depot === 'complet') continue; // ses entrées sont le dépôt : rien à minimiser
    for (const absente of fichiers) {
      it(`REQ-GOV-032 — \`${nom}\` a besoin de \`${absente}\``, () => {
        const ampute = depotJetableAvec([...fichiers.filter((f) => f !== absente), vue]);
        const normal = lancerLaGate(script, ampute);
        const rendu = lancerLaGate(script, ampute, ['--render']);
        expect(
          normal.code !== 0 || rendu.code !== 0,
          `${nom} : \`${absente}\` est déclarée en entrée et ne sert à RIEN — les DEUX modes ` +
            `sortent en 0 sans elle (normal ${normal.code}, --render ${rendu.code})`
        ).toBe(true);
      }, 180_000);
    }
  }
});
