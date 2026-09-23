// @req REQ-GOV-008
// @req REQ-GOV-012
// @req REQ-QA-013
/**
 * `un-nom-une-garde.spec.ts` — un nom ne désigne qu'une chose (GOV-063, `partners/ADR-0018`).
 *
 * LE DÉFAUT MESURÉ, ET IL S'EST REFERMÉ SUR SON LECTEUR : `gov:check` désignait DEUX choses — la
 * garde des termes interdits au registre `docs/gates.json`, et une CHAÎNE de dix-sept gardes dans
 * `package.json` qui ne la contenait pas. La garde imprimait `gov:check` dans son rouge. Un
 * développeur a lu ce rouge, lancé la chaîne, obtenu dix-sept VERTS, et conclu à un aléa de CI —
 * alors que la garde était armée, bloquante, et que le fichier fautif était dans son périmètre.
 *
 * CE QUE CE FICHIER TIENT, ET C'EST UNE FAMILLE, PAS LE CAS NOMMÉ :
 *   1. aucun identifiant du registre n'est, dans `package.json`, le nom d'AUTRE CHOSE ;
 *   2. le nom que la garde IMPRIME est une commande qui existe et qui lance CETTE garde-là —
 *      la seule propriété qui rende un rouge reproductible par celui qui le lit ;
 *   3. `gov:check` ne désigne plus rien qui s'exécute, d'aucun côté : un nom ambigu se RETIRE, il
 *      ne se réattribue pas (`partners/ADR-0018`) ;
 *   4. la reconnaissance de l'appel par `gov:conventions` ne tient plus au littéral d'un
 *      COMMENTAIRE de `ci.yml` — elle survit au retrait de tous les commentaires ;
 *   5. la chaîne survivante dit son compte : elle est un sous-ensemble STRICT de la porte A, et
 *      c'est pourquoi elle ne s'appelle plus « check ».
 *
 * Les comptes sont DÉRIVÉS de `ci.yml`, de `docs/gates.json` et de `package.json` (RM-01) : aucun
 * nombre n'est gravé ici. Un nombre gravé se périme le jour où quelqu'un ajoute une étape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ID_REGISTRE,
  VUE_CONFORME,
  TEMOINS,
  decisionDeLaGarde,
} from '../../../scripts/gates/gov-check';

type Entree = { id: string; script?: string; verifie?: string };

const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const registre = (JSON.parse(readFileSync('docs/gates.json', 'utf8')) as { gates: Entree[] }).gates;
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

/** Les scripts de `package.json` qui enchaînent PLUSIEURS `pnpm` — les chaînes, dérivées. */
function chainesDuPaquet(scripts: Record<string, string>): string[] {
  return Object.entries(scripts)
    .filter(([, v]) => (v.match(/pnpm [\w:.-]+/g) ?? []).length > 1)
    .map(([k]) => k);
}

/** Les `pnpm <script>` qu'une chaîne enchaîne, dans l'ordre. */
function etapesDeLaChaine(chaine: string): string[] {
  return [...chaine.matchAll(/pnpm ([\w:.-]+)/g)].map((m) => m[1]!);
}

/** Les `pnpm <script>` que le job `gate-a` de `ci.yml` joue — lus dans le BLOC du job. */
function etapesDeLaPorteA(texte: string): string[] {
  const lignes = texte.split('\n');
  const debut = lignes.findIndex((l) => /^ {2}gate-a:\s*$/.test(l));
  if (debut < 0) return [];
  let fin = lignes.length;
  for (let i = debut + 1; i < lignes.length; i += 1) {
    if (/^ {2}[\w-]+:\s*$/.test(lignes[i]!)) {
      fin = i;
      break;
    }
  }
  return lignes
    .slice(debut, fin)
    .map((l) => /^\s*(?:- )?run:\s*pnpm ([\w:.-]+)/.exec(l)?.[1])
    .filter((n): n is string => n !== undefined)
    .filter((n) => n !== 'install');
}

/** Le texte d'un YAML privé de TOUS ses commentaires — ce qu'un lecteur d'appels devrait voir. */
function sansCommentaires(yaml: string): string {
  return yaml
    .split('\n')
    .map((l) => l.replace(/(^|\s)#.*$/, '$1'))
    .join('\n');
}

describe('REQ-GOV-008 — un identifiant du registre ne désigne qu’une chose', () => {
  it('REQ-GOV-008 — aucun identifiant du registre n’est, dans package.json, le nom d’AUTRE CHOSE', () => {
    const juges = registre.filter((e) => typeof paquet.scripts[e.id] === 'string');
    const homonymes = juges.filter(
      (e) => !(paquet.scripts[e.id] ?? '').includes(e.script ?? '\u0000')
    );
    expect(
      homonymes.map((e) => `${e.id} → ${paquet.scripts[e.id]}`),
      'un identifiant du registre qui lance autre chose que sa garde : le rouge nomme alors une commande qui fait autre chose'
    ).toEqual([]);
    // Non vacuité : la population jugée n'est pas vide, et de loin.
    expect(juges.length).toBeGreaterThan(20);
  });

  it('REQ-GOV-008, REQ-GOV-012 — le nom imprimé par la garde est une commande qui existe et qui lance CETTE garde-là', () => {
    const entree = registre.filter((e) => e.id === ID_REGISTRE);
    expect(entree, `docs/gates.json ne porte pas d’entrée « ${ID_REGISTRE} »`).toHaveLength(1);
    const commande = paquet.scripts[ID_REGISTRE];
    expect(commande, `package.json ne porte pas de script « ${ID_REGISTRE} »`).toBeDefined();
    expect(commande).toContain(entree[0]!.script!);
    // Le VERT et le ROUGE portent tous deux ce nom, et ils en DÉRIVENT : changer `ID_REGISTRE`
    // change les deux. Un littéral recopié dans le verdict est exactement ce qui a coûté la session.
    const vert = decisionDeLaGarde(VUE_CONFORME);
    expect(vert.code).toBe(0);
    expect(vert.lignes[0]).toContain(ID_REGISTRE);
    const temoin = TEMOINS.find((t) => t.famille === 'synonyme_interdit_du_glossaire');
    expect(
      temoin,
      'aucun témoin de synonyme interdit : la moitié rouge de ce contrôle serait muette'
    ).toBeDefined();
    const rouge = decisionDeLaGarde(temoin!.vue());
    expect(rouge.code).toBe(1);
    expect(rouge.lignes[0]).toContain(ID_REGISTRE);
  });

  it('REQ-GOV-008 — `gov:check` ne désigne plus rien qui s’exécute : ni script, ni identifiant de registre', () => {
    expect(
      paquet.scripts['gov:check'],
      'un nom ambigu se RETIRE, il ne se réattribue pas (partners/ADR-0018)'
    ).toBeUndefined();
    expect(registre.map((e) => e.id)).not.toContain('gov:check');
    expect(sansCommentaires(ci)).not.toContain('pnpm gov:check');
  });

  it('REQ-QA-013 — la reconnaissance de l’appel survit au retrait de TOUS les commentaires de ci.yml', () => {
    // Avant `partners/ADR-0018`, `garde_ecrite_jamais_appelee` ne reconnaissait l'appel de cette
    // garde QUE parce qu'un commentaire de `ci.yml` citait son identifiant : retirer le commentaire
    // faisait rougir à tort, le garder tenait une garde bloquante par un littéral de prose.
    const nu = sansCommentaires(ci);
    // ⚠️ APPARTENANCE EXACTE, PAS INCLUSION DE TEXTE, et la mutation qui l'a imposé est celle-ci :
    // retirer la ligne d'appel BLOQUANTE en gardant `…:prove` laissait les deux attentes vertes,
    // parce que l'identifiant est un PRÉFIXE de celui de sa preuve. La porte A ne jouait plus la
    // garde sur le dépôt réel — seulement son auto-test sur fixtures — et rien ne rougissait.
    // C'est exactement la forme de défaut que cette PR dénonce ailleurs : un témoin qui SE TAIT.
    const jouees = etapesDeLaPorteA(nu);
    expect(jouees, 'la garde elle-même doit être jouée, pas seulement son auto-test').toContain(
      ID_REGISTRE
    );
    expect(jouees, 'et son auto-test aussi : une garde qui ne sait pas rougir ne garde rien').toContain(
      `${ID_REGISTRE}:prove`
    );
  });

  it('REQ-QA-013 — la chaîne survivante est un sous-ensemble STRICT de la porte A, et son nom ne dit plus « check »', () => {
    expect(
      chainesDuPaquet(paquet.scripts),
      'il ne reste qu’une chaîne de gardes dans package.json'
    ).toEqual(['gov:partiel']);
    const dansLaChaine = etapesDeLaChaine(paquet.scripts['gov:partiel']!);
    const dansLaPorteA = etapesDeLaPorteA(ci);
    expect(dansLaPorteA.length).toBeGreaterThan(50);
    expect(dansLaChaine.length).toBeGreaterThan(0);
    for (const e of dansLaChaine) expect(dansLaPorteA).toContain(e);
    expect(dansLaPorteA.length).toBeGreaterThan(dansLaChaine.length * 2);
    // Et la garde des termes interdits n'y est PAS : le témoin de GOV-047 disait déjà ce fait, il
    // est repris ici sous le nom neuf. L'y ajouter ne réparerait rien — la chaîne resterait un
    // quart de la porte, et un quart qui se croit tout est ce que `partners/ADR-0018` refuse.
    expect(dansLaChaine).not.toContain(ID_REGISTRE);
  });
});

describe('REQ-QA-013 — la dette de nommage qui RESTE est nommée, comptée, et ne grandit pas', () => {
  it('REQ-QA-013 — les gardes dont la commande porte un autre nom que leur identifiant sont exactement celles-ci', () => {
    // Le sens INVERSE de la première famille : un script de `package.json` qui lance la garde d'une
    // entrée sans en porter l'identifiant. Ces trois-là préexistent à `partners/ADR-0018` et n'ont
    // trompé personne — aucune des trois n'imprime un nom qu'on puisse taper à tort. Elles sont
    // FIGÉES ici : une quatrième rougit — la liste en porte TROIS, l'ordinal compte les écarts.
    const ecarts: string[] = [];
    for (const e of registre) {
      const script = e.script ?? '';
      if (!script.startsWith('scripts/')) continue;
      if (typeof paquet.scripts[e.id] === 'string') continue;
      for (const [nom, commande] of Object.entries(paquet.scripts)) {
        if (commande.includes(script) && !commande.includes('--')) ecarts.push(`${nom} → ${e.id}`);
      }
    }
    expect(ecarts.sort()).toEqual([
      'gov:lexique → GATE-JUR-TEXTES-APPORTEURS',
      'gov:maquettes-validees → maquettes-validees',
      'securite:rate-famille → G-SEC-RATE-FAMILLE',
    ]);
  });
});
