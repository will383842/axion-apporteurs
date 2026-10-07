// @req REQ-SEC-060
// @req REQ-SEC-017
// @req REQ-SEC-036
// @req REQ-SEC-021
// @req REQ-JUR-031
/**
 * SEC-41 — les raisons « Vérification suggérée », jugées PURES (HYP-W20-VERIFICATION).
 *
 * Ce que le fichier tient :
 *   — l'enum FERMÉ des sept raisons, et l'absence de toute raison de rythme ou de nombre de dépôts
 *     (REQ-SEC-017, REQ-SEC-021, REQ-JUR-031) ;
 *   — un témoin positif et un négatif par raison ;
 *   — le TRI de la liste d'appels, seul effet d'une raison ; aucun prédicat « demande signalée »,
 *     aucun lecteur dans la confirmation, la libération ou l'attribution (arbitrage #319 6035632726,
 *     conditions (a) et (c) de la juriste, 6035645682) ;
 *   — aucune raison n'atteint l'espace, le score de sincérité, une anomalie, une notification ou une
 *     alerte ; aucune raison n'est posée dans le texte ou la charge de la notification de libération ;
 *   — la vérification ne lit jamais le compte, le rythme, l'heure, le lieu, la zone, le secteur ni la
 *     méthode de l'apporteur (note de la lentille sécurité, rattrapage 55).
 * Chaque garde a son témoin : la même mesure, sur une source où l'on a glissé la faute, rougit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  RAISONS_DE_VERIFICATION,
  raisonsDeVerification,
  trierLaListeDAppels,
  type FaitsDeVerification,
} from '../../../src/server/securite/verification-suggeree';
import { SIGNAUX_DE_SINCERITE } from '../../../src/server/anomalie/sincerite';
import {
  CORPS_DE_LA_LIBERATION,
  TEXTES_DES_NOTIFICATIONS,
} from '../../../src/content/micro-copy/courriels/notifications';

const RACINE = join(__dirname, '..', '..', '..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');
const SOURCE = lire('src/server/securite/verification-suggeree.ts');

const E1 = 'a'.repeat(64);
const E2 = 'b'.repeat(64);
const T1 = 'c'.repeat(64);
const T2 = 'd'.repeat(64);
const IP1 = '0123456789abcdef';
const IP2 = 'fedcba9876543210';

/**
 * Des faits NEUTRES : aucune raison n'y est présente. Chaque témoin change UN fait, nommé, et rien
 * d'autre (RM-11) : le neutre explicite chaque champ dont dépend une raison.
 */
const NEUTRES: FaitsDeVerification = {
  adresseDuContact: 'claire.martin@menuiserie-martin.fr',
  domaineDuSite: 'menuiserie-martin.fr',
  empreintesDuContact: { email: E1, telephone: T1 },
  empreintesDeLApporteur: { email: E2, telephone: T2 },
  contactSurUneAutreEntreprise: false,
  clicIpHash: IP1,
  ipHashesDeLApporteur: [IP2],
  etatDeLaDemande: 'envoyee',
};

describe('REQ-SEC-060 — l’enum FERMÉ des raisons', () => {
  it('REQ-SEC-060 : les sept raisons sont exactement celles de HYP-W20-VERIFICATION', () => {
    expect([...RAISONS_DE_VERIFICATION].sort()).toEqual(
      [
        'adresse_webmail',
        'adresse_generique',
        'domaine_different_du_site',
        'coordonnee_de_l_apporteur',
        'contact_sur_plusieurs_entreprises',
        'clic_depuis_l_ip_de_l_apporteur',
        'rebond',
      ].sort()
    );
  });

  const RYTHME =
    /rafale|rythme|nocturne|heure|horaire|premiers?_depots?|nombre|volume|compte|zone|secteur|methode/i;

  it('REQ-SEC-060 REQ-SEC-021 REQ-JUR-031 : aucune raison de rythme, de nombre de dépôts, de lieu ou de méthode', () => {
    expect(RAISONS_DE_VERIFICATION.filter((r) => RYTHME.test(r))).toEqual([]);
  });

  it('REQ-SEC-060 : TÉMOIN — une valeur « rafale » ajoutée à l’enum rougit', () => {
    expect([...RAISONS_DE_VERIFICATION, 'rafale'].filter((r) => RYTHME.test(r))).toEqual([
      'rafale',
    ]);
  });

  it('REQ-SEC-017 : pas de double comptage avec le score de sincérité : les deux listes sont disjointes', () => {
    const signaux: readonly string[] = SIGNAUX_DE_SINCERITE;
    expect(RAISONS_DE_VERIFICATION.filter((r) => signaux.includes(r))).toEqual([]);
  });
});

describe('REQ-SEC-060 — un témoin positif et un négatif par raison', () => {
  it('REQ-SEC-060 : les faits neutres ne portent aucune raison', () => {
    expect(raisonsDeVerification(NEUTRES)).toEqual([]);
  });

  it.each([
    'jean.dupont@gmail.com',
    'J.Dupont@Hotmail.FR',
    'contact.pro@orange.fr',
    'x@laposte.net',
  ])(
    'REQ-SEC-060 : adresse_webmail — %s est une adresse webmail : acceptée, et porte sa raison (positif)',
    (adresse) => {
      expect(
        raisonsDeVerification({ ...NEUTRES, adresseDuContact: adresse, domaineDuSite: null })
      ).toEqual(['adresse_webmail']);
    }
  );

  it('REQ-SEC-060 : adresse_webmail — un domaine qui CONTIENT un nom de webmail sans l’être ne signale pas (négatif)', () => {
    for (const adresse of ['a.b@gmail-menuiserie.fr', 'a.b@mon-orange.fr.example']) {
      expect(
        raisonsDeVerification({ ...NEUTRES, adresseDuContact: adresse, domaineDuSite: null })
      ).toEqual([]);
    }
  });

  it.each([
    'contact@menuiserie-martin.fr',
    'Accueil@menuiserie-martin.fr',
    'info@menuiserie-martin.fr',
  ])(
    'REQ-SEC-060 : adresse_generique — %s est générique : acceptée, et porte sa raison (positif)',
    (adresse) => {
      expect(raisonsDeVerification({ ...NEUTRES, adresseDuContact: adresse })).toEqual([
        'adresse_generique',
      ]);
    }
  );

  it('REQ-SEC-060 : adresse_generique — une partie locale qui nomme une personne ne signale pas (négatif)', () => {
    for (const adresse of ['contactine.roy@menuiserie-martin.fr', 'p.info@menuiserie-martin.fr']) {
      expect(raisonsDeVerification({ ...NEUTRES, adresseDuContact: adresse })).toEqual([]);
    }
  });

  it('REQ-SEC-060 : domaine_different_du_site — une adresse d’un autre domaine que le site connu signale (positif)', () => {
    expect(
      raisonsDeVerification({ ...NEUTRES, adresseDuContact: 'claire.martin@autre-societe.fr' })
    ).toEqual(['domaine_different_du_site']);
  });

  it('REQ-SEC-060 : domaine_different_du_site — un sous-domaine du site, la casse, ou un site inconnu ne signalent pas (négatif)', () => {
    expect(
      raisonsDeVerification({ ...NEUTRES, adresseDuContact: 'c.martin@Mail.Menuiserie-Martin.FR' })
    ).toEqual([]);
    expect(
      raisonsDeVerification({ ...NEUTRES, domaineDuSite: 'www.menuiserie-martin.fr' })
    ).toEqual([]);
    expect(
      raisonsDeVerification({
        ...NEUTRES,
        adresseDuContact: 'c@autre-societe.fr',
        domaineDuSite: null,
      })
    ).toEqual([]);
  });

  it('REQ-SEC-060 : domaine_different_du_site — une adresse webmail n’en porte pas une seconde raison de domaine', () => {
    expect(raisonsDeVerification({ ...NEUTRES, adresseDuContact: 'c.martin@gmail.com' })).toEqual([
      'adresse_webmail',
    ]);
  });

  it('REQ-SEC-060 REQ-SEC-024 : coordonnee_de_l_apporteur — l’empreinte de l’e-mail OU du téléphone du contact est celle de l’apporteur (positif)', () => {
    expect(
      raisonsDeVerification({ ...NEUTRES, empreintesDuContact: { email: E2, telephone: T1 } })
    ).toEqual(['coordonnee_de_l_apporteur']);
    expect(
      raisonsDeVerification({ ...NEUTRES, empreintesDuContact: { email: E1, telephone: T2 } })
    ).toEqual(['coordonnee_de_l_apporteur']);
  });

  it('REQ-SEC-024 : coordonnee_de_l_apporteur — des empreintes absentes ne s’égalent jamais (négatif)', () => {
    expect(
      raisonsDeVerification({
        ...NEUTRES,
        empreintesDuContact: { email: null, telephone: null },
        empreintesDeLApporteur: { email: null, telephone: null },
      })
    ).toEqual([]);
  });

  it('REQ-SEC-060 : contact_sur_plusieurs_entreprises — le même contact sur une autre entreprise signale (positif), sinon rien (négatif)', () => {
    expect(raisonsDeVerification({ ...NEUTRES, contactSurUneAutreEntreprise: true })).toEqual([
      'contact_sur_plusieurs_entreprises',
    ]);
    expect(raisonsDeVerification({ ...NEUTRES, contactSurUneAutreEntreprise: false })).toEqual([]);
  });

  it('REQ-SEC-060 REQ-SEC-036 : clic_depuis_l_ip_de_l_apporteur — l’empreinte d’IP du clic est celle d’une session de l’apporteur (positif)', () => {
    expect(raisonsDeVerification({ ...NEUTRES, clicIpHash: IP2 })).toEqual([
      'clic_depuis_l_ip_de_l_apporteur',
    ]);
  });

  it('REQ-SEC-036 : clic_depuis_l_ip_de_l_apporteur — aucun clic, ou une autre empreinte, ne signale rien (négatif)', () => {
    expect(raisonsDeVerification({ ...NEUTRES, clicIpHash: null })).toEqual([]);
    expect(
      raisonsDeVerification({ ...NEUTRES, clicIpHash: IP1, ipHashesDeLApporteur: [] })
    ).toEqual([]);
  });

  it('REQ-SEC-060 : rebond — la demande EN rebond signale (positif) ; la demande née d’une correction est jugée sur sa propre adresse (négatif)', () => {
    expect(raisonsDeVerification({ ...NEUTRES, etatDeLaDemande: 'rebond' })).toEqual(['rebond']);
    for (const etat of ['planifiee', 'envoyee', 'repondue_oui', 'clic_non_retenu', null] as const) {
      expect(raisonsDeVerification({ ...NEUTRES, etatDeLaDemande: etat })).toEqual([]);
    }
  });

  it('REQ-SEC-060 : le tri met en tête les dépôts qui portent une raison, sans en retirer ni en réordonner aucun dans son groupe', () => {
    const lignes = [
      { id: 'a', faits: NEUTRES },
      { id: 'b', faits: { ...NEUTRES, etatDeLaDemande: 'rebond' as const } },
      { id: 'c', faits: NEUTRES },
      { id: 'd', faits: { ...NEUTRES, contactSurUneAutreEntreprise: true } },
    ];
    const triees = trierLaListeDAppels(lignes, (l) => raisonsDeVerification(l.faits));
    expect(triees.map((l) => l.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(lignes.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(trierLaListeDAppels([], () => [])).toEqual([]);
  });
});

// ── les gardes de lecture : qui lit les raisons, et ce que la vérification lit ───────────────────

function sansCommentairesNiChaines(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function fichiers(dossier: string): string[] {
  const absolu = join(RACINE, dossier);
  return readdirSync(absolu).flatMap((n) => {
    const p = join(absolu, n);
    return statSync(p).isDirectory()
      ? fichiers(relative(RACINE, p))
      : /\.(ts|tsx)$/.test(n)
        ? [relative(RACINE, p)]
        : [];
  });
}

/** Une lecture des raisons : l'import du module, ou l'un de ses noms exportés. */
const LIT_LES_RAISONS =
  /verification-suggeree|RAISONS_DE_VERIFICATION|raisonsDeVerification|lireLaVerification|raisonsDeLaDemande/;

describe('REQ-SEC-060 — garde AST : aucune raison n’atteint l’espace, le score, une anomalie, une notification ou une alerte', () => {
  it('REQ-SEC-060 : aucun fichier de src/app/(espace)/ ne lit une raison', () => {
    const fautifs = fichiers('src/app/(espace)').filter((f) => LIT_LES_RAISONS.test(lire(f)));
    expect(fautifs).toEqual([]);
  });

  it('REQ-SEC-060 : TÉMOIN — une raison lue depuis src/app/(espace)/ rougit', () => {
    const glisse = `import { raisonsDeVerification } from '../../../server/securite/verification-suggeree';`;
    expect(LIT_LES_RAISONS.test(glisse)).toBe(true);
  });

  it('REQ-SEC-060 REQ-SEC-017 : le score de sincérité, les notifications et les alertes ne lisent aucune raison', () => {
    const lecteurs = [
      'src/server/anomalie/sincerite.ts',
      ...fichiers('src/server/notifications'),
      ...fichiers('src/server/integrations/telegram'),
    ].filter((f) => LIT_LES_RAISONS.test(lire(f)));
    expect(lecteurs).toEqual([]);
  });

  const EFFETS = /\banomalie\b|\.anomalie\.|ajouterEvenement|notification|alerte|envoyer|telegram/i;

  it('REQ-SEC-060 REQ-SEC-017 : la vérification n’ouvre aucune anomalie, n’écrit aucun événement, n’envoie ni notification ni alerte', () => {
    expect(sansCommentairesNiChaines(SOURCE)).not.toMatch(EFFETS);
  });

  it('REQ-SEC-060 : TÉMOIN — une vérification qui ouvrirait une anomalie rougit', () => {
    const glisse = `${SOURCE}\nawait tx.anomalie.create({ data });\n`;
    expect(sansCommentairesNiChaines(glisse)).toMatch(EFFETS);
  });
});

/** Les seuls lecteurs admis d'une raison : le module lui-même et la console (condition (c)). */
const LECTEURS_ADMIS =
  /^src\/server\/securite\/verification-suggeree\.ts$|^src\/server\/console\/|^src\/app\/\(console\)\/|^src\/components\/console\//;
const lecteursHorsConsole = (chemins: readonly string[], lireUn: (f: string) => string) =>
  chemins
    .map((f) => f.split('\\').join('/'))
    .filter((f) => !LECTEURS_ADMIS.test(f) && LIT_LES_RAISONS.test(lireUn(f)));

describe('REQ-SEC-060 — un TRI seulement : ni la confirmation, ni la libération, ni l’apporteur, ni l’entreprise (juriste, 6035645682)', () => {
  it('REQ-SEC-060 : condition (a) et (c) — hors du module et de la console, aucun fichier de src/ ne lit une raison', () => {
    expect(lecteursHorsConsole(fichiers('src'), lire)).toEqual([]);
  });

  it('REQ-SEC-060 : TÉMOIN — un module de la confirmation qui lirait une raison rougit', () => {
    const glisse = `import { lireLaVerification } from '../../server/securite/verification-suggeree';`;
    expect(lecteursHorsConsole(['src/domain/confirmation/promotion.ts'], () => glisse)).toEqual([
      'src/domain/confirmation/promotion.ts',
    ]);
    expect(lecteursHorsConsole(['src/server/console/liste-d-appels.ts'], () => glisse)).toEqual([]);
  });

  const PREDICAT = /demandeSignalee|\bsignalee\b/;

  it('REQ-SEC-060 : aucun prédicat « demande signalée » : le module n’en exporte ni n’en rend aucun', () => {
    expect(sansCommentairesNiChaines(SOURCE)).not.toMatch(PREDICAT);
  });

  it('REQ-SEC-060 : TÉMOIN — un prédicat réintroduit rougit', () => {
    const glisse = `${SOURCE}\nexport const demandeSignalee = (f: FaitsDeVerification) => true;\n`;
    expect(sansCommentairesNiChaines(glisse)).toMatch(PREDICAT);
  });
});

describe('REQ-SEC-060 — la notification de libération ne porte ni la raison ni la vérification', () => {
  // « adresse » seul n'est pas un mot de raison : la fin à défaut d'adresse valide le dit, mot pour mot
  // du contrat (art. 3.2 ; juriste, #319 6037204257). Les raisons d'adresse restent nommées par
  // « webmail », « générique » et « domaine ».
  const MOTS_DE_RAISON =
    /webmail|g[ée]n[ée]rique|domaine|rebond|v[ée]rification|signal|ip\b|raison|empreinte/i;
  /** Les paramètres d'un texte, entre accolades. */
  const parametres = (texte: string) => [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const textesDeLaLiberation = () => [
    TEXTES_DES_NOTIFICATIONS.attribution_liberee.titre,
    TEXTES_DES_NOTIFICATIONS.attribution_liberee.appel,
    ...Object.values(CORPS_DE_LA_LIBERATION),
  ];

  it('REQ-SEC-060 : le texte de la libération ne nomme aucune raison, ni la vérification', () => {
    expect(textesDeLaLiberation().filter((t) => MOTS_DE_RAISON.test(t))).toEqual([]);
  });

  it('REQ-SEC-060 : la charge de la libération n’a que l’entreprise et la date de redépôt pour paramètres', () => {
    const tous = textesDeLaLiberation().flatMap(parametres);
    expect([...new Set(tous)].sort()).toEqual(['dateRedepot', 'entreprise']);
  });

  it('REQ-SEC-060 : TÉMOIN — une raison posée dans le texte ou la charge de la libération rougit', () => {
    const glisse = 'Ce dépôt a pris fin : {raison}. Adresse webmail.';
    expect(MOTS_DE_RAISON.test(glisse)).toBe(true);
    expect(parametres(glisse)).toContain('raison');
  });
});

describe('REQ-SEC-060 REQ-JUR-031 — la vérification ne lit jamais le compte, le rythme, l’heure, le lieu, la zone, le secteur ni la méthode de l’apporteur', () => {
  const LECTURES_INTERDITES =
    /deposeeAt|deposee_at|dateContact|date_contact|clientCapturedAt|getHours|getUTCHours|getDay|\._count\b|\.count\(|groupBy|latitudeMicrodeg|longitudeMicrodeg|departement|\bregion\b|communeSiege|commune_siege|\bzone\b|\bsecteur\b|methode|statut:/;

  it('REQ-SEC-060 REQ-JUR-031 : le module n’en lit aucun', () => {
    expect(sansCommentairesNiChaines(SOURCE)).not.toMatch(LECTURES_INTERDITES);
  });

  it.each([
    ['le rythme (un compte de dépôts)', 'const n = await prisma.attribution.count({ where });'],
    ['l’heure du dépôt', 'if (a.deposeeAt.getHours() < 6) raisons.push(r);'],
    ['le lieu', 'select: { departement: true },'],
    ['le secteur', 'if (apporteur.secteur !== entreprise.secteur) raisons.push(r);'],
  ])('REQ-SEC-060 : TÉMOIN — une raison qui lit %s rougit', (_cas, ligne) => {
    expect(sansCommentairesNiChaines(`${SOURCE}\n${ligne}\n`)).toMatch(LECTURES_INTERDITES);
  });
});
