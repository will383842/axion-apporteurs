// @req REQ-GOV-008
/**
 * GOV-090 — une citation qui nomme un outil LA OU IL N'EST PAS.
 *
 * LE DEFAUT, ET SON COUT MESURE. Onze citations de ce depot nommaient les verbes d'ecriture du
 * registre `outils/<verbe>.mjs`. Il n'y a aucun dossier de ce nom dans le depot : les verbes
 * vivent dans un dossier FRERE. Un lecteur place dans un arbre lie resout ce chemin depuis la
 * racine du depot, ne trouve rien, et conclut que l'outil N'EXISTE PAS. Cette conclusion fausse a
 * ete publiee. « Le fichier n'est pas la ou on le nomme » et « le fichier n'existe pas » sont deux
 * constats differents, et le second arrete un agent.
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI C'EST LA FAMILLE ET NON LA LIGNE. Le defaut a ete trouve
 * sur `gov-pr.ts:668`. Corriger cette ligne seule aurait laisse dix soeurs en place — c'est la
 * faute que ce depot a payee cinq fois. Le balayage part donc du DISQUE (`git ls-files`) et de
 * l'INVENTAIRE (`VERBES_HORS_DEPOT`), jamais d'une chaine cherchee a la main.
 *
 * LA REGLE N'EST PAS NEUVE, elle est APPLIQUEE A UNE POPULATION QU'ELLE COUVRAIT DEJA.
 * REQ-GOV-008 : « toute reference croisee est QUALIFIEE PAR DEPOT (`axionia/ADR-0014`,
 * `ops/ADR-0050`, `partners/ADR-0003`) ; reference non qualifiee -> rouge ». Elle a ete ecrite
 * pour la PROSE des ADR ; une citation d'outil est une reference croisee comme une autre.
 * `hors-depot/` entre au meme rang que les trois autres qualifiants.
 *
 * ⚠️ CE QUE CE TEMOIN NE PEUT PAS VOIR, ET IL FAUT LE LIRE ICI PLUTOT QUE DE LE DECOUVRIR.
 * Son perimetre s'arrete a `git ls-files`. L'outillage, lui, DEBORDE le depot : les douze verbes
 * vivent dehors, et treize de leurs lignes prescrivent une commande de ce depot. Aucun temoin
 * d'ici ne peut les lire. Ce n'est pas une lacune de ce fichier, c'est une propriete du montage,
 * et `partners/ADR-0019` la porte comme dette residuelle nommee. Ce temoin garde le sens
 * depot -> outils ; le sens outils -> depot n'est garde par RIEN, et le dire est tout ce que ce
 * depot peut faire.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  QUALIFIANT_HORS_DEPOT,
  VERBES_HORS_DEPOT,
  outilHorsDepot,
} from '../../../scripts/lot/chemins-de-tache';

/**
 * LA FORME FAUTIVE, CONSTRUITE ET JAMAIS ECRITE. Si ce fichier portait la chaine litterale, il se
 * denoncerait lui-meme au premier balayage — et l'exempter aurait ouvert la premiere exception
 * d'une liste qui ne se referme jamais. Le prefixe se compose.
 */
const PREFIXE_FAUTIF = 'out' + 'ils/';

/** Les fichiers de texte suivis par git. La population part du disque, jamais d'une liste tapee. */
function fichiersSuivis(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml)$/.test(f));
}

/** Toute citation d'un verbe de l'inventaire ecrite en chemin relatif au depot. */
function citationsFautives(): string[] {
  const out: string[] = [];
  for (const f of fichiersSuivis()) {
    let texte: string;
    try {
      texte = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (!texte.includes(PREFIXE_FAUTIF)) continue;
    texte.split('\n').forEach((ligne, i) => {
      for (const verbe of VERBES_HORS_DEPOT) {
        if (ligne.includes(PREFIXE_FAUTIF + verbe)) {
          out.push(`${f}:${i + 1} — « ${PREFIXE_FAUTIF}${verbe} »`);
        }
      }
    });
  }
  return out;
}

describe('REQ-GOV-008 — une citation de verbe hors depot est qualifiee, jamais relative au depot', () => {
  it('REQ-GOV-008 — aucun fichier suivi ne nomme un verbe en chemin relatif au depot', () => {
    // PLANCHER. Une population vide sortirait en zero et se lirait comme « aucune faute » : c'est
    // la quatrieme fois que ce depot rencontre cette forme. On compte ce qu'on a balaye.
    expect(fichiersSuivis().length).toBeGreaterThan(100);
    expect(VERBES_HORS_DEPOT.length).toBeGreaterThan(0);

    expect(citationsFautives()).toEqual([]);
  });

  it('REQ-GOV-008 — CONTRE-TEMOIN : la forme qualifiee est bien presente et reste verte', () => {
    // Sans lui, le temoin precedent serait vert sur un depot qui ne cite AUCUN verbe : une regle
    // qui ne garde rien passe pour tenue (RM-02). Le depot DOIT citer des verbes, et la forme
    // qu'il emploie doit etre celle que le rendu unique produit.
    const qualifiees = fichiersSuivis().filter((f) => {
      try {
        return readFileSync(f, 'utf8').includes(`${QUALIFIANT_HORS_DEPOT}/`);
      } catch {
        return false;
      }
    });
    expect(qualifiees.length).toBeGreaterThan(0);
  });

  it('REQ-GOV-008 — le rendu unique qualifie, et REFUSE un verbe hors inventaire', () => {
    // Le rendu est la seule ecriture (RM-01) : si un appelant pouvait composer la chaine lui-meme,
    // la douzieme citation repartirait en chemin relatif, comme les onze precedentes.
    expect(outilHorsDepot('ajouter-path.mjs')).toBe(
      `\`${QUALIFIANT_HORS_DEPOT}/ajouter-path.mjs\``
    );
    expect(outilHorsDepot('ajouter-path.mjs')).not.toContain(PREFIXE_FAUTIF);

    // ET IL REFUSE. Un message qui conseille un geste inexistant est un piege poli : on le suit,
    // il refuse, et le trou reste ouvert. Mesure du 2026-09-18 : `garde_hors_registre` conseillait
    // `reecrire-champ.mjs`, qui repond « aucune entree » sur le cas meme que le refus decrit.
    expect(() => outilHorsDepot('verbe-qui-n-existe-pas.mjs')).toThrow(/inventaire hors depot/);
  });

  it('REQ-GOV-008 — les messages rouges qui prescrivent un geste le rendent RESOLVABLE', () => {
    // Les quatre messages que le defaut touchait sont lus par un humain qui vient d'etre refuse.
    // C'est le seul endroit ou un chemin faux coute une session entiere, et c'est la que les onze
    // citations faisaient le plus de degats.
    const messages = [
      'scripts/gates/gov-pr.ts',
      'scripts/gates/gov-conventions.ts',
      'scripts/lot/cloture.ts',
      'scripts/lot/chemins-de-tache.ts',
    ];
    for (const f of messages) {
      const texte = readFileSync(f, 'utf8');
      for (const verbe of VERBES_HORS_DEPOT) {
        expect(texte.includes(PREFIXE_FAUTIF + verbe), `${f} cite ${verbe} en relatif`).toBe(false);
      }
    }
  });
});
