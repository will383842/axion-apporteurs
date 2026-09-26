/**
 * jur-grille-chiffree.ts — `jur:grille-chiffree` (JUR-T01, REQ-JUR-003).
 *
 * USAGE : npx tsx scripts/gates/jur-grille-chiffree.ts           (juge le gabarit du dépôt)
 *         npx tsx scripts/gates/jur-grille-chiffree.ts --prove   (témoins rouges et verts, INJECTÉS)
 *
 * CE QU'ELLE TIENT. Refus de publier un gabarit dont l'annexe 1 porte « forfait », « barème » ou
 * « pourcentage » SANS valeur numérique dans la même cellule (`docs/gates.json`). La règle n'est pas
 * écrite ici : elle vit dans `src/domain/contrat/grille-chiffree.ts`, que le refus de publication
 * (`exigerGabaritPubliable`) applique aussi au texte RENDU — c'est là qu'elle protège vraiment.
 *
 * CE QU'ELLE NE FAIT PAS. Sur le gabarit SOURCE, les montants sont des variables : cette garde y est
 * un fil tendu contre un mot retapé à la main dans une cellule, pas la preuve qu'un contrat signé est
 * chiffré. Et elle ne lit que les cellules de tableau de l'annexe 1.
 *
 * ÉCHEC FERMÉ. Gabarit absent ou sans annexe 1 : rouge, jamais « rien à signaler ».
 */
import { existsSync, readFileSync } from 'node:fs';
import { fautesGrilleChiffree } from '../../src/domain/contrat/grille-chiffree';

export const GABARIT = 'docs/contrat/CONTRAT-APPORTEUR-V1.md';

const annexe = (cellule: string): string =>
  `## Annexe 1 — Témoin\n\n| Palier | Commission |\n| --- | --- |\n| Essentielle | ${cellule} |\n\n## Annexe 2\n`;

/** Témoins : chacun DOIT rougir de sa famille. */
export const TEMOINS: { quoi: string; texte: string; famille: string }[] = [
  {
    quoi: "annexe témoin portant 'forfait' seul (fixtureRouge)",
    texte: annexe('forfait'),
    famille: 'mot_sans_valeur',
  },
  {
    quoi: 'un barème nommé sans chiffre',
    texte: annexe('barème non publié'),
    famille: 'mot_sans_valeur',
  },
  {
    quoi: 'un pourcentage sans taux',
    texte: annexe('pourcentage du HT'),
    famille: 'mot_sans_valeur',
  },
  { quoi: 'un gabarit sans annexe 1', texte: '# Contrat\n', famille: 'annexe_absente' },
];

/** Contre-témoins : chacun DOIT rester vert — sinon la garde forcerait à retirer un chiffre. */
export const CONTRE_TEMOINS: { quoi: string; texte: string }[] = [
  { quoi: 'un forfait chiffré', texte: annexe('forfait 12') },
  { quoi: 'un pourcentage chiffré', texte: annexe('pourcentage 7,5') },
  { quoi: 'une variable encore à rendre', texte: annexe('{{COM_PALIER}}') },
  { quoi: 'une prestation non commissionnée', texte: annexe('**Aucune**') },
];

const APPELE_DIRECTEMENT = /jur-grille-chiffree\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    for (const t of TEMOINS) {
      const familles = fautesGrilleChiffree(t.texte).map((f) => f.famille);
      if (!familles.includes(t.famille as never)) {
        console.error(`❌ Le témoin « ${t.quoi} » n'a PAS fait rougir « ${t.famille} ».`);
        process.exit(1);
      }
    }
    for (const c of CONTRE_TEMOINS) {
      const fautes = fautesGrilleChiffree(c.texte);
      if (fautes.length > 0) {
        console.error(`❌ Faux positif sur « ${c.quoi} » : ${fautes[0]!.message}`);
        process.exit(1);
      }
    }
    console.log(
      `✅ jur:grille-chiffree — ${TEMOINS.length} témoins rougissent, ${CONTRE_TEMOINS.length} ` +
        `contre-témoins restent verts — preuve faite.`
    );
    process.exit(0);
  }

  if (!existsSync(GABARIT)) {
    console.error(
      `❌ jur:grille-chiffree — ${GABARIT} est introuvable : rien à juger n'est pas un vert.`
    );
    process.exit(1);
  }
  const fautes = fautesGrilleChiffree(readFileSync(GABARIT, 'utf8'));
  if (fautes.length > 0) {
    console.error(`❌ jur:grille-chiffree — ${fautes.length} faute(s) dans ${GABARIT} :`);
    for (const f of fautes) console.error(`   [${f.famille}] ${f.message}`);
    process.exit(1);
  }
  console.log(
    `✅ jur:grille-chiffree — ${GABARIT} : aucune cellule de l'annexe 1 ne nomme un forfait, un ` +
      `barème ou un pourcentage sans valeur numérique. Sur le gabarit source, les montants sont des ` +
      `variables : la règle protège au rendu (exigerGabaritPubliable).`
  );
  process.exit(0);
}
