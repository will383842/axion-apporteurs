// @req REQ-GOV-031
/**
 * GOV-064 — deux chemins suivis DISTINCTS finissaient sous la MÊME clé, et la garde d'argent
 * jugeait l'un à la place de l'autre.
 *
 * LE DÉFAUT. La source unique du périmètre (`scripts/lot/fichiers-suivis.ts`) décodait la sortie
 * de `git ls-files -s -z` en UTF-8 PERMISSIF : toute suite d'octets qui n'est pas de l'UTF-8
 * valide devient U+FFFD. Deux noms d'octets différents — l'un portant un octet invalide, l'autre
 * portant U+FFFD écrit en toutes lettres — rendaient la même chaîne. La garde d'entité indexe
 * ensuite les blobs PAR CHEMIN (`blobsDe`) : la seconde entrée écrasait la première, et les deux
 * fichiers étaient jugés sur le contenu d'UN seul. Un IBAN posé dans l'un, un leurre propre dans
 * l'autre : exit 0, dépôt PUBLIC.
 *
 * LA MESURE. (1) La source ne rend un chemin que si le réencoder redonne EXACTEMENT ses octets —
 * c'est cette égalité, vérifiée entrée par entrée, qui prouve l'injectivité, et non une confiance
 * dans le décodeur. Deux entrées dont les noms se confondraient sont REFUSÉES en les nommant
 * octet par octet. (2) Chaque consommatrice qui indexe par chemin refuse une clé déjà prise au
 * lieu de l'écraser : `blobsDe` et `filtresDepuisSortie` (garde d'entité), la table des textes de
 * `controler` (garde de schéma).
 *
 * Chaque famille de refus a son témoin ROUGE et son contre-témoin VERT (RM-02). Aucun nom, aucun
 * compte n'est tapé : les octets sont construits, le compte du dépôt est lu dans l'index (RM-01).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CheminsConfondus,
  PerimetreIllisible,
  cheminNomme,
  entreesDepuisSortie,
} from '../../../scripts/lot/fichiers-suivis';
import { IBAN_TEMOIN, blobsDe, filtresDepuisSortie } from '../../../scripts/gates/gov-entite';
import { VUE_CONFORME, controler } from '../../../scripts/gates/schema-enums';

const RACINE = process.cwd();
const GARDE = resolve(RACINE, 'scripts/gates/gov-entite.ts');
const TSX = resolve(RACINE, 'node_modules/tsx/dist/cli.mjs');

/** U+FFFD, écrit en UTF-8 VALIDE : c'est la chaîne que rend le décodeur permissif pour un octet invalide. */
const REMPLACEMENT = Buffer.from('\uFFFD', 'utf8');
/** Un octet qui n'ouvre aucune suite UTF-8 valide. */
const OCTET_INVALIDE = Buffer.from([0xff]);

/** Deux noms d'octets DISTINCTS qu'un décodage permissif confond. */
const nom = (milieu: Buffer): Buffer =>
  Buffer.concat([Buffer.from('leurre-', 'ascii'), milieu, Buffer.from('.txt', 'ascii')]);
const NOM_VALIDE = nom(REMPLACEMENT);
const NOM_INVALIDE = nom(OCTET_INVALIDE);

const EMPREINTE_A = 'a'.repeat(40);
const EMPREINTE_B = 'b'.repeat(40);

/** Une sortie de `git ls-files -s -z`, fabriquée octet par octet. */
function sortieDIndex(entrees: { chemin: Buffer; empreinte: string }[]): Buffer {
  return Buffer.concat(
    entrees.flatMap((e) => [
      Buffer.from(`100644 ${e.empreinte} 0\t`, 'ascii'),
      e.chemin,
      Buffer.from([0]),
    ])
  );
}

describe('la source unique rend des chemins distincts pour des entrées distinctes', () => {
  it('REQ-GOV-031 — deux entrées dont les noms se confondraient au décodage sont REFUSÉES, nommées toutes deux', () => {
    const sortie = sortieDIndex([
      { chemin: NOM_VALIDE, empreinte: EMPREINTE_A },
      { chemin: NOM_INVALIDE, empreinte: EMPREINTE_B },
    ]);
    // Le défaut existe bien à la racine : le décodage permissif les confond.
    expect(NOM_VALIDE.toString('utf8')).toBe(NOM_INVALIDE.toString('utf8'));
    expect(NOM_VALIDE.equals(NOM_INVALIDE)).toBe(false);

    let leve: unknown;
    try {
      entreesDepuisSortie(sortie);
    } catch (e) {
      leve = e;
    }
    expect(leve).toBeInstanceOf(CheminsConfondus);
    const message = (leve as Error).message;
    expect(cheminNomme(NOM_VALIDE)).not.toBe(cheminNomme(NOM_INVALIDE));
    expect(message).toContain(cheminNomme(NOM_VALIDE));
    expect(message).toContain(cheminNomme(NOM_INVALIDE));
  });

  it('REQ-GOV-031 — une entrée seule qui n’est pas de l’UTF-8 est REFUSÉE : son nom rendu ne serait pas le sien', () => {
    let leve: unknown;
    try {
      entreesDepuisSortie(sortieDIndex([{ chemin: NOM_INVALIDE, empreinte: EMPREINTE_A }]));
    } catch (e) {
      leve = e;
    }
    expect(leve).toBeInstanceOf(PerimetreIllisible);
    expect((leve as Error).message).toContain(cheminNomme(NOM_INVALIDE));
  });

  it('REQ-GOV-031 — contre-témoin : des noms d’octets distincts, même voisins (U+FFFD littéral, NFC contre NFD, BOM en tête), restent distincts et chacun se réencode en ses octets', () => {
    const noms = [
      NOM_VALIDE,
      Buffer.from('docs/t\u00e9moin.md', 'utf8'),
      Buffer.from('docs/te\u0301moin.md', 'utf8'),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('rib.txt', 'ascii')]),
      Buffer.from('rib.txt', 'ascii'),
    ];
    const entrees = entreesDepuisSortie(
      sortieDIndex(noms.map((chemin, i) => ({ chemin, empreinte: String(i).repeat(40) })))
    );
    expect(entrees.length).toBe(noms.length);
    expect(new Set(entrees.map((e) => e.chemin)).size).toBe(noms.length);
    entrees.forEach((e, i) => expect(Buffer.from(e.chemin, 'utf8').equals(noms[i]!)).toBe(true));
  });
});

describe('une consommatrice qui indexe par chemin refuse une collision au lieu d’écraser', () => {
  /** Deux entrées RÉELLES de l'index du dépôt : leurs blobs existent, `git cat-file` les rend. */
  const [premiere, seconde] = execFileSync('git', ['ls-files', '-s', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 2 ** 20,
  })
    .split('\0')
    .filter(Boolean)
    .map((ligne) => {
      const [entete, chemin] = ligne.split('\t') as [string, string];
      const [mode, empreinte, etage] = entete.split(' ') as [string, string, string];
      return { mode, empreinte, etage, chemin };
    });

  it('REQ-GOV-031 — `blobsDe` refuse deux entrées sous le même chemin, en le nommant', () => {
    expect(() => blobsDe([premiere!, { ...seconde!, chemin: premiere!.chemin }])).toThrow(
      premiere!.chemin
    );
  });

  it('REQ-GOV-031 — contre-témoin : `blobsDe` lit deux chemins distincts, chacun sous le sien', () => {
    const blobs = blobsDe([premiere!, seconde!]);
    expect([...blobs.keys()]).toEqual([premiere!.chemin, seconde!.chemin]);
  });

  it('REQ-GOV-031 — `filtresDepuisSortie` refuse un chemin demandé deux fois, en le nommant', () => {
    const chemin = premiere!.chemin;
    const sortie = `${chemin}\0filter\0lfs\0${chemin}\0filter\0unspecified\0`;
    expect(() => filtresDepuisSortie([chemin, chemin], sortie)).toThrow(chemin);
  });

  it('REQ-GOV-031 — contre-témoin : `filtresDepuisSortie` rend le filtre de chacun de deux chemins distincts', () => {
    const [a, b] = [premiere!.chemin, seconde!.chemin];
    const sortie = `${a}\0filter\0lfs\0${b}\0filter\0unspecified\0`;
    expect([...filtresDepuisSortie([a, b], sortie)]).toEqual([[a, 'lfs']]);
  });

  /** Un fichier de code dont la fin de ligne étrangère se cache derrière un homonyme propre. */
  const CHEMIN = 'src/domain/homonyme.ts';
  const CR_SEUL = String.fromCharCode(13);

  it('REQ-GOV-031 — la garde de schéma refuse deux TEXTES distincts sous le même chemin, en le nommant', () => {
    const vue = {
      ...VUE_CONFORME,
      code: [
        { chemin: CHEMIN, contenu: `const a = 1;${CR_SEUL}const b = 2;\n` },
        { chemin: CHEMIN, contenu: 'const a = 1;\n' },
      ],
    };
    expect(() => controler(vue)).toThrow(CHEMIN);
  });

  it('REQ-GOV-031 — contre-témoin : le même texte lu deux fois sous le même chemin (le schéma, aussi dans le code) n’est pas une collision', () => {
    const vue = {
      ...VUE_CONFORME,
      code: [{ chemin: 'prisma/schema.prisma', contenu: VUE_CONFORME.schema }],
    };
    expect(controler(vue)).toEqual([]);
  });
});

describe('témoin à deux faces : la garde d’entité, lancée pour de bon', () => {
  const bacs: string[] = [];
  afterAll(() => bacs.forEach((b) => rmSync(b, { recursive: true, force: true })));

  function lancerLaGarde(cwd: string): { code: number; sortie: string } {
    const r = spawnSync(process.execPath, [TSX, GARDE], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 2 ** 20,
    });
    return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
  }

  /**
   * Un bac d'essai : l'arbre de HEAD (objets EMPRUNTÉS au dépôt, rien de copié à la main), plus
   * deux entrées qui se confondent. L'IBAN est dans le fichier au nom VALIDE, qui précède l'autre
   * dans l'ordre des octets de l'index : avant le correctif, le leurre propre l'écrasait.
   */
  function bacAvecDeuxEntreesConfondues(): string {
    const bac = mkdtempSync(join(tmpdir(), 'deux-chemins-'));
    bacs.push(bac);
    const git = (args: string[], input?: Buffer | string): string =>
      execFileSync('git', args, { cwd: bac, input, encoding: 'utf8', maxBuffer: 64 * 2 ** 20 });
    const communs = resolve(
      RACINE,
      execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()
    );
    const arbre = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
    git(['init', '-q']);
    git(['config', 'core.autocrlf', 'false']);
    writeFileSync(
      join(bac, '.git', 'objects', 'info', 'alternates'),
      `${resolve(communs, 'objects').split('\\').join('/')}\n`
    );
    git(['read-tree', arbre]);
    git(['checkout-index', '-a', '-f']);

    writeFileSync(join(bac, NOM_VALIDE.toString('utf8')), `IBAN : ${IBAN_TEMOIN}\n`);
    git(['add', '--', NOM_VALIDE.toString('utf8')]);
    const leurre = git(['hash-object', '-w', '--stdin'], 'rien ici\n').trim();
    git(
      ['update-index', '-z', '--index-info'],
      Buffer.concat([Buffer.from(`100644 ${leurre}\t`, 'ascii'), NOM_INVALIDE, Buffer.from([0])])
    );
    return bac;
  }

  it('REQ-GOV-031 — face rouge : deux entrées distinctes qui se confondent font sortir la garde en non nul, et elle NOMME les deux', () => {
    const r = lancerLaGarde(bacAvecDeuxEntreesConfondues());
    expect(r.code, r.sortie).not.toBe(0);
    expect(r.sortie).toContain('[chemins_confondus]');
    expect(r.sortie).toContain(cheminNomme(NOM_VALIDE));
    expect(r.sortie).toContain(cheminNomme(NOM_INVALIDE));
  }, 180_000);

  it('REQ-GOV-031 — face verte : l’arbre du dépôt fait sortir la garde en zéro, avec le compte des entrées réellement lues', () => {
    const lues = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 64 * 2 ** 20 })
      .toString('latin1')
      .split('\0')
      .filter(Boolean).length;
    const r = lancerLaGarde(RACINE);
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toContain(`${lues} fichier(s) suivi(s) lu(s) en entier`);
  }, 180_000);
});
