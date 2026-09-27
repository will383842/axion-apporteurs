/**
 * La garde « aucune donnée personnelle dans une alerte Telegram » — INT-T14, G-SEC-NOTIF (REQ-INT-024).
 *
 * USAGE : npx tsx src/server/integrations/telegram/garde-sans-pii.ts                (gabarits du dépôt)
 *         npx tsx src/server/integrations/telegram/garde-sans-pii.ts --bac-d-essai  (témoin rouge)
 *
 * CE QU'ELLE FAIT. Elle construit CHAQUE gabarit de `GABARITS_ALERTE` à partir d'un objet témoin qui
 * porte, à côté des trois champs permis, un nom, un courriel, un téléphone, un lien de console, une
 * raison sociale et un montant. Tout champ dont la valeur se retrouve dans le message est NOMMÉ ; un
 * message qui porte une adresse de courriel, une URL ou un numéro de téléphone, d'où qu'ils viennent,
 * est refusé aussi. Elle sort en non-zéro à la première faute, et imprime au vert le nombre de
 * gabarits RÉELLEMENT confrontés, dérivé de la table — jamais une longueur tapée.
 *
 * CE QU'ELLE NE FAIT PAS. Elle confronte les gabarits à UN objet témoin : un gabarit qui ne ferait
 * fuir un champ que sous une condition que le témoin ne remplit pas lui échapperait. Les gabarits sont
 * donc écrits sans branche sur les champs non permis, et c'est la relecture qui le vérifie.
 */
import { GABARITS_ALERTE, type ObjetAlerte } from './alertes';

/** Le témoin : les trois champs permis, et tout ce qu'un appelant pourrait passer par confort. */
export const OBJET_TEMOIN = {
  categorie: 'temoin_garde',
  id: 'obj_temoin_1',
  compte: 'cpt_temoin_1',
  nom: 'Jeanne Témoin',
  courriel: 'jeanne.temoin@example.org',
  telephone: '+33 6 12 34 56 78',
  lienConsole: 'https://console.partners.example/admin/apporteurs/obj_temoin_1',
  raisonSociale: 'Témoin Conseil SARL',
  montantHtCents: 987_654,
} as const;

/** Les champs qu'aucun message ne doit porter : clés de l'objet témoin hors des trois permis. */
const PERMIS: readonly string[] = ['categorie', 'id', 'compte'];
const INTERDITS = Object.keys(OBJET_TEMOIN).filter((k) => !PERMIS.includes(k));

/** Les formes qui trahissent une coordonnée, quelle que soit sa provenance. */
const FORMES: readonly { champ: string; motif: RegExp }[] = [
  { champ: 'forme_courriel', motif: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i },
  { champ: 'forme_url', motif: /\bhttps?:\/\/|\bwww\./i },
  { champ: 'forme_telephone', motif: /(?:\+|\b0)\d(?:[\s.-]?\d){7,}/ },
];

/**
 * Le gabarit du BAC D'ESSAI : il fait ce qu'aucun gabarit du dépôt ne doit faire. La garde DOIT le
 * refuser et nommer nom, courriel, téléphone et lien de console.
 */
export const GABARIT_BAC_D_ESSAI = (o: ObjetAlerte): string => {
  const riche = o as ObjetAlerte & Record<string, unknown>;
  return `[${o.categorie}] ${String(riche.nom)} <${String(riche.courriel)}> ${String(riche.telephone)} ${String(riche.lienConsole)}`;
};

export type FauteDeGarde = { gabarit: string; champ: string };

export function confronter(gabarits: Readonly<Record<string, (o: ObjetAlerte) => string>>): {
  code: number;
  confrontes: number;
  fautes: FauteDeGarde[];
} {
  const fautes: FauteDeGarde[] = [];
  let confrontes = 0;
  for (const [nom, gabarit] of Object.entries(gabarits)) {
    const message = gabarit(OBJET_TEMOIN);
    confrontes++;
    const champs = new Set<string>();
    for (const champ of INTERDITS) {
      const valeur = String(OBJET_TEMOIN[champ as keyof typeof OBJET_TEMOIN]);
      if (message.includes(valeur)) champs.add(champ);
    }
    if (champs.size === 0) {
      for (const { champ, motif } of FORMES) if (motif.test(message)) champs.add(champ);
    }
    for (const champ of champs) fautes.push({ gabarit: nom, champ });
  }
  return { code: fautes.length === 0 && confrontes > 0 ? 0 : 1, confrontes, fautes };
}

if (process.argv[1] !== undefined && /garde-sans-pii[.](ts|js)$/.test(process.argv[1])) {
  const bac = process.argv.includes('--bac-d-essai');
  const { code, confrontes, fautes } = confronter(
    bac ? { bac_d_essai: GABARIT_BAC_D_ESSAI } : GABARITS_ALERTE
  );
  const sortir = (flux: NodeJS.WriteStream, ligne: string): boolean => flux.write(`${ligne}\n`);
  if (code !== 0) {
    sortir(
      process.stderr,
      `❌ G-SEC-NOTIF — ${fautes.length} champ(s) franchissent le canal d'alerte :`
    );
    for (const f of fautes) sortir(process.stderr, `   gabarit ${f.gabarit} : champ ${f.champ}`);
    if (confrontes === 0)
      sortir(process.stderr, '   aucun gabarit confronté : un vert sur rien n’est pas un vert.');
    process.exit(code);
  }
  const s = confrontes > 1 ? 's' : '';
  sortir(
    process.stdout,
    `✅ G-SEC-NOTIF — ${confrontes} gabarit${s} de message confronté${s} à un objet portant nom, ` +
      `courriel, téléphone, lien de console, raison sociale et montant : aucun champ ne franchit.`
  );
  process.exit(0);
}
