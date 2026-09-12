// @req REQ-GOV-003
/**
 * GOV-028 — « citer n'est pas se servir » a été écrit pour la PROSE ; dans un fichier de code,
 * la quote ne cite pas, elle DÉLIMITE.
 *
 * POURQUOI CE FICHIER EXISTE. `gov:identifiants` neutralisait toute chaîne encadrée par l'une des
 * trois familles de guillemets — français, droits, simples — avant de chercher une étiquette nue,
 * et cela dans TOUS les fichiers suivis. L'exemption a été écrite pour les documents qui
 * EXPLIQUENT la règle et doivent pouvoir en écrire le contre-exemple. Elle s'appliquait par
 * accident partout ailleurs : dans un `.ts`, un `.json` ou un `.yml`, les guillemets qui entourent
 * une valeur ne citent rien.
 *
 * LE TÉMOIN QUI A OUVERT LA TÂCHE, ET QUI EST REJOUÉ ICI. Une même instruction, une même étiquette
 * de relecteur, un même fichier : la version dont la chaîne tient sous le plafond historique
 * rendait ZÉRO faute, la version rallongée en rendait UNE. Le verdict de la garde dépendait donc
 * de la LONGUEUR du voisinage et non de son contenu — ce qui n'est pas rejouable, et ce qui
 * s'obtient à volonté en rallongeant une phrase.
 *
 * CE QUE CE FICHIER TIENT, ET QUE LES DEUX AUTRES NE TENAIENT PAS. `gardes.spec.ts` exerce la
 * garde par FAMILLE de faute — ce qui est refusé. `identifiants-nus-positions-limites.spec.ts`
 * l'exerce par POSITION dans la ligne — où elle regarde. Ici on l'exerce par CONTEXTE — dans quel
 * genre de fichier elle regarde — et par DÉLIMITEUR. C'est une troisième dimension, et c'est celle
 * où elle était fausse.
 *
 * LE CONTRÔLE DÉCISIF RESTE LE REJEU CONTRE LA VERSION D'AVANT (RM-02, LEC-19). La neutralisation
 * d'avant GOV-028 est conservée dans la garde sous le nom `fautesDeLigneAveugleALaSyntaxe`, que
 * rien n'appelle pour juger : chaque témoin annoncé « caché par l'ancienne » lui est resoumis et
 * doit être MANQUÉ, et sa version rallongée doit être VUE. L'étiquette est vérifiée dans les deux
 * sens — une étiquette qu'on ne vérifie que d'un côté finit par décrire l'intention de son auteur.
 *
 * ET UNE GARDE QUI ROUGIT TROP EST AUSSI CASSÉE QU'UNE GARDE QUI NE ROUGIT PAS. Élargir la garde
 * révèle deux usages parfaitement légitimes ; ils deviennent des exemptions NOMMÉES, chacune
 * éprouvée contre le cas qui l'a motivée ET contre un presque-pareil qui doit rester rouge — une
 * exemption qu'on n'éprouve pas contre les deux n'exempte pas, elle aveugle.
 *
 * ⚠️ Aucune étiquette nue n'est TAPÉE ici : témoins, contre-témoins et contre-exemples sont
 * IMPORTÉS de la garde, seul fichier exempt (RM-01). Le dernier cas du fichier l'exige.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  MOTIF_NU,
  FICHIERS,
  PLAFOND_HISTORIQUE,
  CITATIONS_PROSE,
  CITATIONS_AVEUGLES_A_LA_SYNTAXE,
  FAMILLES_DELIMITEURS,
  TEMOINS_DELIMITEURS,
  TEMOINS_APOSTROPHE,
  CONTRE_TEMOINS_SYNTAXE,
  EXEMPTIONS_NOMMEES,
  contexteDeFichier,
  temoinCourt,
  temoinLong,
  contenuCite,
  fautesDeLigne,
  fautesDeLigneSansExemption,
  fautesDeLigneAveugleALaSyntaxe,
} from '../../../scripts/gates/gov-identifiants';

const CE_FICHIER = 'tests/unit/gouvernance/citation-json-vs-prose.spec.ts';

/**
 * Les trois familles de délimiteurs qu'un fichier de code emploie, écrites ici et non dérivées de
 * la garde : une liste dérivée de ce qu'elle contient déjà ne pourrait jamais constater qu'il en
 * manque une. C'est l'unique endroit du fichier où recopier est le bon geste.
 */
const FAMILLES_EXIGEES = ['guillemets_droits', 'quote_simple', 'accent_grave'] as const;

/** Un fichier de prose, pour rejouer la MÊME ligne dans l'autre contexte. */
const EN_PROSE = 'docs/exemple.md';

describe('REQ-GOV-003 — dans un fichier de code, la quote est de la SYNTAXE', () => {
  it('REQ-GOV-003 : chaque famille de délimiteur a un témoin, et chaque extension scannée aussi', () => {
    const couvertes = new Set(TEMOINS_DELIMITEURS.map((t) => t.famille));
    expect(FAMILLES_EXIGEES.filter((f) => !couvertes.has(f))).toEqual([]);
    expect(FAMILLES_DELIMITEURS.filter((f) => !couvertes.has(f))).toEqual([]);

    // Les extensions sont LUES dans le filtre de la garde (RM-01) : le jour où elle en scanne une
    // de plus, ce cas exige qu'un témoin l'exerce plutôt que de la laisser sans verdict connu.
    const extensions = FICHIERS.source.match(/\(([^)]+)\)/)![1]!.split('|');
    const deCode = extensions.filter((e) => contexteDeFichier(`x.${e}`) === 'code');
    const exercees = new Set(TEMOINS_DELIMITEURS.map((t) => t.fichier.split('.').pop()));
    expect(deCode.filter((e) => !exercees.has(e))).toEqual([]);
  });

  it('REQ-GOV-003 : le contexte partitionne les extensions — aucune n’est ni l’un ni l’autre', () => {
    const extensions = FICHIERS.source.match(/\(([^)]+)\)/)![1]!.split('|');
    const contextes = extensions.map((e) => contexteDeFichier(`x.${e}`));
    expect(contextes.every((c) => c === 'code' || c === 'prose')).toBe(true);
    // Et le seul genre de PROSE que la garde scanne est bien reconnu comme tel.
    expect(contexteDeFichier(EN_PROSE)).toBe('prose');
    expect(contextes.filter((c) => c === 'prose')).toHaveLength(1);
  });

  // ── (1) le témoin de la tâche, rejoué par famille et par extension ────────────────────────
  it.each(TEMOINS_DELIMITEURS)(
    'REQ-GOV-003 : famille $famille dans $fichier — la version COURTE fait rougir la garde',
    (t) => {
      expect(fautesDeLigne(temoinCourt(t), t.fichier, 0, MOTIF_NU)).toHaveLength(1);
    }
  );

  it.each(TEMOINS_DELIMITEURS)(
    'REQ-GOV-003 : famille $famille dans $fichier — la version RALLONGÉE fait rougir la garde',
    (t) => {
      expect(fautesDeLigne(temoinLong(t), t.fichier, 0, MOTIF_NU)).toHaveLength(1);
    }
  );

  // ── (4) le plafond : supprimé, donc le verdict ne dépend plus de la longueur ───────────────
  it.each(TEMOINS_DELIMITEURS)(
    'REQ-GOV-003 : famille $famille dans $fichier — le verdict ne dépend PAS de la longueur',
    (t) => {
      // C'est l'énoncé exact du défaut : même instruction, même étiquette, seul le voisinage
      // change de taille. Deux verdicts différents ici, et la garde n'est pas rejouable.
      const court = fautesDeLigne(temoinCourt(t), t.fichier, 0, MOTIF_NU).length;
      const long = fautesDeLigne(temoinLong(t), t.fichier, 0, MOTIF_NU).length;
      expect(court).toBe(long);
    }
  );

  it.each(TEMOINS_DELIMITEURS)(
    'REQ-GOV-003 : les deux versions de $famille dans $fichier encadrent le plafond historique',
    (t) => {
      // Sans ce cas, deux témoins tous deux courts — ou tous deux longs — donneraient le même
      // verdict pour une raison qui n'a rien à voir avec la règle : la démonstration serait muette.
      expect(contenuCite(temoinCourt(t)).length).toBeLessThanOrEqual(PLAFOND_HISTORIQUE);
      expect(contenuCite(temoinLong(t)).length).toBeGreaterThan(PLAFOND_HISTORIQUE);
    }
  );

  it('REQ-GOV-003 : aucun motif de citation ACTIF ne porte de quantificateur borné', () => {
    // Un plafond en nombre de caractères est un proxy grossier ; il fait dépendre le verdict de la
    // longueur d'une phrase. Le discriminant juste est le délimiteur fermant, pas une distance.
    for (const r of CITATIONS_PROSE) expect(r.source).not.toMatch(/\{\d+,\d*\}/);
  });

  it.each(TEMOINS_APOSTROPHE)(
    'REQ-GOV-003 : ce que le plafond couvrait vraiment — une fausse paire d’apostrophes — rougit : %s',
    (texte) => {
      // Le plafond ne protégeait pas d'une citation trop longue : il bornait les dégâts d'une
      // fausse paire d'apostrophes françaises. Le retirer sans ce discriminant aurait AGGRAVÉ le
      // défaut. Ces deux cas sont la seule raison pour laquelle la contrainte de frontière de mot
      // existe — et sans eux, mesuré, la retirer laissait `--prove` verte de bout en bout.
      expect(fautesDeLigne(texte, EN_PROSE, 0, MOTIF_NU).length).toBeGreaterThan(0);
    }
  );

  it.each(TEMOINS_APOSTROPHE)(
    'REQ-GOV-003 : … et la neutralisation d’avant les MANQUAIT — c’est le défaut exercé : %s',
    (texte) => {
      expect(fautesDeLigneAveugleALaSyntaxe(texte, EN_PROSE, 0, MOTIF_NU)).toHaveLength(0);
    }
  );

  it('REQ-GOV-003 : le spécimen conservé, lui, porte bien le plafond de l’ancienne règle', () => {
    // Contrôle à double sens (RM-02) : si le spécimen ne portait plus le plafond, tous les rejeus
    // « ce que l'ancienne cachait » ci-dessous prouveraient quelque chose d'autre.
    const borne = new RegExp(`\\{0,${PLAFOND_HISTORIQUE}\\}`);
    for (const r of CITATIONS_AVEUGLES_A_LA_SYNTAXE) expect(r.source).toMatch(borne);
  });

  // ── (2) le rejeu contre la neutralisation d'AVANT, dans les deux sens ──────────────────────
  it.each(TEMOINS_DELIMITEURS.filter((t) => t.cacheParLAncienne))(
    'REQ-GOV-003 : la neutralisation d’avant CACHAIT la version courte de $famille dans $fichier',
    (t) => {
      expect(fautesDeLigneAveugleALaSyntaxe(temoinCourt(t), t.fichier, 0, MOTIF_NU)).toHaveLength(0);
    }
  );

  it.each(TEMOINS_DELIMITEURS.filter((t) => t.cacheParLAncienne))(
    'REQ-GOV-003 : … et VOYAIT la rallongée de $famille dans $fichier — la longueur décidait',
    (t) => {
      // Les deux cas ensemble, et eux seuls, constituent la démonstration : la même étiquette,
      // la même instruction, le même fichier, deux verdicts opposés pour un voisinage plus long.
      expect(
        fautesDeLigneAveugleALaSyntaxe(temoinLong(t), t.fichier, 0, MOTIF_NU).length
      ).toBeGreaterThan(0);
    }
  );

  it.each(TEMOINS_DELIMITEURS.filter((t) => !t.cacheParLAncienne))(
    'REQ-GOV-003 : $famille dans $fichier était déjà vue avant GOV-028, et l’étiquette le dit',
    (t) => {
      expect(
        fautesDeLigneAveugleALaSyntaxe(temoinCourt(t), t.fichier, 0, MOTIF_NU).length
      ).toBeGreaterThan(0);
    }
  );

  it('REQ-GOV-003 : le contournement portait sur plusieurs familles, pas sur une seule', () => {
    const cachees = new Set(
      TEMOINS_DELIMITEURS.filter((t) => t.cacheParLAncienne).map((t) => t.famille)
    );
    expect(cachees.size).toBeGreaterThanOrEqual(2);
  });

  // ── (1 bis) la même ligne EN PROSE : là, citer reste citer ─────────────────────────────────
  it.each(TEMOINS_DELIMITEURS.filter((t) => t.citeEnProse))(
    'REQ-GOV-003 : la même ligne ($famille) reste VERTE en prose — les trois familles y citent',
    (t) => {
      // Sans ce cas, la correction serait un simple durcissement : la règle « citer n'est pas se
      // servir » disparaîtrait avec le défaut, et les documents qui l'expliquent rougiraient.
      expect(fautesDeLigne(temoinCourt(t), EN_PROSE, 0, MOTIF_NU)).toEqual([]);
    }
  );

  it.each(TEMOINS_DELIMITEURS.filter((t) => !t.citeEnProse))(
    'REQ-GOV-003 : en prose, $famille ne cite pas non plus, et l’étiquette le dit',
    (t) => {
      expect(fautesDeLigne(temoinCourt(t), EN_PROSE, 0, MOTIF_NU).length).toBeGreaterThan(0);
    }
  );

  // ── (3) les contre-témoins de syntaxe ──────────────────────────────────────────────────────
  it.each(CONTRE_TEMOINS_SYNTAXE)(
    'REQ-GOV-003 : un usage légitime en contexte code reste vert — $pourquoi',
    (c) => {
      expect(fautesDeLigne(c.ligne, c.fichier, 0, MOTIF_NU)).toEqual([]);
    }
  );

  // ── (3 bis) les exemptions nommées, éprouvées des deux côtés ───────────────────────────────
  it.each(EXEMPTIONS_NOMMEES)('REQ-GOV-003 : $nom porte un POURQUOI non vide', (e) => {
    expect(e.pourquoi.trim().length).toBeGreaterThan(40);
  });

  it.each(EXEMPTIONS_NOMMEES)(
    'REQ-GOV-003 : $nom — la ligne RÉELLE existe toujours dans $fichier',
    (e) => {
      // La ligne est LUE dans son fichier (RM-01), jamais recopiée : un numéro de ligne bouge, un
      // repérage non, et une exemption dont la ligne a disparu est une exemption qui aveugle.
      const lignes = readFileSync(e.fichier, 'utf8').split('\n');
      expect(lignes.filter((l) => e.reperage.test(l)).length).toBeGreaterThan(0);
    }
  );

  it.each(EXEMPTIONS_NOMMEES)(
    'REQ-GOV-003 : $nom — TOUTES les lignes qu’elle couvre restent VERTES',
    (e) => {
      const lignes = readFileSync(e.fichier, 'utf8')
        .split('\n')
        .filter((l) => e.reperage.test(l));
      const rouges = lignes.filter((l) => fautesDeLigne(l, e.fichier, 0, MOTIF_NU).length > 0);
      expect(rouges).toEqual([]);
    }
  );

  it.each(EXEMPTIONS_NOMMEES)(
    'REQ-GOV-003 : $nom — SANS elle, au moins une de ces lignes ROUGIT : elle exempte donc',
    (e) => {
      // Une exemption qui n'exempte rien est du bruit qu'on ne saura pas retirer plus tard. Le
      // repérage peut couvrir plusieurs lignes de la même forme ; il suffit qu'une seule d'entre
      // elles porte réellement l'étiquette, mais il en FAUT une.
      const lignes = readFileSync(e.fichier, 'utf8')
        .split('\n')
        .filter((l) => e.reperage.test(l));
      const exercee = lignes.some(
        (l) => fautesDeLigneSansExemption(e.nom, l, e.fichier, 0, MOTIF_NU).length > 0
      );
      expect(exercee).toBe(true);
    }
  );

  it.each(EXEMPTIONS_NOMMEES)(
    'REQ-GOV-003 : $nom — le presque-pareil reste ROUGE : elle ne rend pas la garde aveugle',
    (e) => {
      // Le discriminant est éprouvé contre le cas qui l'a motivé ET contre celui qui doit passer.
      expect(
        fautesDeLigne(e.contreExemple, e.fichierDuContreExemple, 0, MOTIF_NU).length
      ).toBeGreaterThan(0);
    }
  );

  // ── le dépôt, et ce fichier-ci ─────────────────────────────────────────────────────────────
  it('REQ-GOV-003 : ce fichier de test ne fait rougir la garde sur aucune de ses lignes', () => {
    // `gov:identifiants` ne lit que les fichiers SUIVIS par git (RM-14) : tant qu'il n'est pas à
    // l'index, ce fichier n'est lu par personne. Et il est lui-même un fichier de CODE : la règle
    // qu'il pose s'applique d'abord à lui.
    const fautes = readFileSync(CE_FICHIER, 'utf8')
      .split('\n')
      .flatMap((ligne, i) => fautesDeLigne(ligne, CE_FICHIER, i, MOTIF_NU));
    expect(fautes.map((f) => f.message)).toEqual([]);
  });

  it('REQ-GOV-003 : `--prove` sort 0 et porte la ligne de preuve AJOUTÉE par GOV-028', () => {
    // La preuve s'enrichit par AJOUT (LEC-20) : la première ligne est assertée mot pour mot
    // ailleurs, et recopiée dans deux registres. On ne gonfle aucun compteur existant.
    const r = spawnSync('npx', ['tsx', 'scripts/gates/gov-identifiants.ts', '--prove'], {
      encoding: 'utf8',
      shell: true,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(r.status).toBe(0);
    expect(sortie).toContain('3 témoins rougissent, 10 contre-témoins restent verts');
    expect(sortie).toContain('témoins de délimiteur rougissent');
    for (const f of FAMILLES_EXIGEES) expect(sortie).toContain(f);
    for (const e of EXEMPTIONS_NOMMEES) expect(sortie).toContain(e.nom);
  });

  it('REQ-GOV-003 : `--compter` rejoue les trois comptes globaux sur le pipeline COMPLET', () => {
    // Le mode existe pour que les trois comptes ne soient jamais recopiés dans un document
    // (RM-01) : ils se relisent dans leur source. Il porte aussi l'invariant qui les relie —
    // l'écart entre le compte sans exemptions et le compte livré DOIT valoir le nombre
    // d'exemptions nommées. Sinon, ou bien une exemption ne sert plus à rien, ou bien une faute
    // réelle se cache derrière l'une d'elles, et les deux se lisent pareil : un dépôt vert.
    const r = spawnSync('npx', ['tsx', 'scripts/gates/gov-identifiants.ts', '--compter'], {
      encoding: 'utf8',
      shell: true,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(r.status).toBe(0);
    for (const etiquette of ['A = ', 'B = ', 'C = ']) expect(sortie).toContain(etiquette);
    // Le compte livré est celui que la CI voit : il vaut zéro, et il est imprimé, pas supposé.
    expect(sortie).toContain('C = 0 ');
  });

  it('REQ-GOV-003 : la garde reste VERTE sur le dépôt une fois la règle élargie', () => {
    // Un faux positif dans une garde de publication coûte aussi cher qu'un faux négatif : c'est
    // lui qui la fait désarmer. Élargir la règle sans ce cas serait un pari.
    const r = spawnSync('npx', ['tsx', 'scripts/gates/gov-identifiants.ts'], {
      encoding: 'utf8',
      shell: true,
    });
    expect((r.stdout ?? '') + (r.stderr ?? '')).toContain('✅');
    expect(r.status).toBe(0);
  });
});
