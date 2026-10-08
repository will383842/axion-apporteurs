export const meta = {
  name: 'lot-axion-partners',
  description:
    'Exécute un lot de tâches : développement en worktrees, revue à deux lentilles (plus l architecte sur une tâche schema), fusion par paquets adaptatifs, critique de complétude',
  phases: [
    { title: 'Dev', detail: 'un développeur par tâche, en worktree isolé, test rouge d abord' },
    { title: 'Revue', detail: '2 lentilles, plus schema, 2 tours maximum' },
    {
      title: 'Fusion',
      detail: 'par paquets adaptatifs, une fusion à la fois, atterrissage vérifié',
    },
    { title: 'Clôture', detail: 'critique de complétude' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ENTRÉE : args = { lot: <contenu de docs/lots/L<phase>-<seq>/lot.json>, now: "<ISO>" }
//   `now` est FOURNI par l'appelant : un script de workflow ne peut pas appeler Date.now() (rejeu).
// SORTIE : { lotId, resultats: [...], stops: [...], manques: [...] }
//
// INVARIANTS
//   - la fusion se fait par PAQUETS ADAPTATIFS (GOV-158, décision de Williams du 2026-10-08, #319) :
//     les PR acceptées sont rangées en paquets sans fichier commun par `scripts/lot/paquets-de-fusion.ts`,
//     testées ensemble une fois, puis fusionnées UNE à la fois, chacune `--match-head-commit`, son
//     atterrissage vérifié avant la suivante (RM-09) : jamais deux producteurs sur `main`.
//   - DEUX lentilles partout, `exactitude` et `securite`, plus `schema` (A02) sur une tâche `schema`
//     (`W16`, `partners/ADR-0024`, `docs/CHARTE-AGENTS.md` §6). Plus de `simplicite` : RM-01 est
//     jugée par `exactitude`. Plus d'agent de mutation : Stryker la MESURE en porte A
//     (`pnpm mutation:pr`), que le release manager exige verte avant de fusionner.
//   - une PR passe la revue quand AUCUNE lentille ne refuse. Le refus de `securite` (et celui de
//     `schema`) est un VETO sur toute PR : le lead n'est jamais convoqué pour le lever.
//   - au second tour, seules les lentilles qui ont refusé relisent en entier, plus `securite`
//     toujours ; une lentille qui avait accepté RECONFIRME sur le seul delta du correctif — son
//     accord serait sinon périmé sur la tête neuve, et `gov:pr` refuserait la fusion (§6, GOV-145).
//   - un `stop` d'un agent arrête l'ensemble du lot : on ne devine jamais une décision de Will.
//   - CHAQUE appel `agent()` porte un `agentType` correspondant à un fichier de `.claude/agents/` :
//     sans lui, les `tools` restreints des fiches (le relecteur privé de Write/Edit, le release
//     manager privé d'écriture) n'ont AUCUN effet — le sous-agent est générique et peut tout.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const lot = args.lot;
const now = args.now;

// `args.lot` est le CONTENU de lot.json, jamais son chemin : un script de workflow n'a pas accès au
// système de fichiers. Sans cette garde, on meurt en `lot.taches is undefined` sans savoir pourquoi.
if (!lot || !Array.isArray(lot.taches)) {
  throw new Error('args.lot doit être le CONTENU de lot.json, pas son chemin');
}

const DEV = {
  type: 'object',
  properties: {
    taskId: { type: 'string' },
    branch: { type: 'string' },
    pr: { type: ['integer', 'null'] },
    statut: { type: 'string', enum: ['livree', 'stop'] },
    rouge: { type: 'string', description: 'message verbatim du test qui a échoué AVANT le code' },
    vert: { type: 'boolean' },
    reqCouvertes: { type: 'array', items: { type: 'string' } },
    appris: { type: 'array', items: { type: 'string' } },
    // Liste FERMÉE : la table des motifs d'arrêt du SKILL §6 doit pouvoir retrouver chaque valeur.
    // Une chaîne libre laisse un développeur inventer un motif qu'aucune table ne sait traiter.
    stop: {
      type: ['object', 'null'],
      properties: {
        motif: {
          enum: [
            'decision_sans_hypothese',
            'req_non_testable',
            'dependance_externe_sans_repli',
            'constat_critique',
            'gate_phase_x2',
            'readyz_503_prod',
            'ecart_reconciliation',
          ],
        },
        ref: { type: 'string' },
      },
      required: ['motif', 'ref'],
    },
  },
  required: ['taskId', 'branch', 'pr', 'statut', 'rouge', 'vert', 'reqCouvertes', 'appris', 'stop'],
};

const AVIS = {
  type: 'object',
  properties: {
    refuse: { type: 'boolean' },
    motifs: { type: 'array', items: { type: 'string' } },
  },
  required: ['refuse', 'motifs'],
};

const LEAD = {
  type: 'object',
  properties: {
    accepte: { type: 'boolean' },
    motif: { type: 'string' },
  },
  required: ['accepte', 'motif'],
};

// `fusionneeAt` : l'instant de la fusion, en UTC. Il est REQUIS — nullable quand rien n'a fusionné —
// parce que `pnpm lot:cloture` en a besoin pour attester une livraison faite dans un AUTRE dépôt
// (GOV-038) : là-bas, ni la PR ni le commit ne sont retrouvables depuis ce dépôt-ci, et une
// attestation sans date ne dit pas QUAND le monde a changé. Optionnel, il aurait été omis par le
// premier release manager pressé, et la clôture aurait échoué au moment le plus coûteux.
const FUSION = {
  type: 'object',
  properties: {
    pr: { type: ['integer', 'null'] },
    sha: { type: ['string', 'null'] },
    fusionneeAt: { type: ['string', 'null'] },
    atterri: { type: 'boolean' },
    motif: { type: 'string' },
  },
  required: ['pr', 'sha', 'fusionneeAt', 'atterri', 'motif'],
};

const A40 = {
  type: 'object',
  properties: {
    manques: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quoi: { type: 'string' },
          ou: { type: 'string' },
          tacheProposee: { type: 'string' },
        },
        required: ['quoi', 'ou', 'tacheProposee'],
      },
    },
  },
  required: ['manques'],
};

const LENTILLES = [
  {
    cle: 'exactitude',
    consigne:
      'Le code fait-il EXACTEMENT ce que disent les REQ citées, ni plus ni moins ? Vérifie chaque REQ une par une contre le diff. Un écart de périmètre est un refus. Une valeur retapée alors qu’elle existe déjà ailleurs est un refus (RM-01). Le test annoncé rouge porte-t-il bien sur la REQ ?',
  },
  {
    cle: 'securite',
    consigne:
      "Cloisonnement (aucun accès hors `forApporteur()`), défaut = refus, 404 byte-identique, PII chiffrée, journal sans PII, idempotence, aucune fuite dans un message d'erreur. Ton refus est un VETO, sur toute PR.",
  },
];

// Un refus de ces lentilles-là ne se lève pas par le lead : c'est un VETO (`docs/CHARTE-AGENTS.md` §6).
const VETOS = ['securite', 'schema'];

// Quatrième lentille, ajoutée UNIQUEMENT sur les tâches `schema` (prisma/** ou packages/contracts/**) :
// l'approbation de l'architecte (A02) y est bloquante (plan §2.1, GOV-007). Sans elle, une migration
// Prisma recevait exactement la même revue qu'un changement de micro-copy.
const LENTILLE_SCHEMA = {
  cle: 'schema',
  agentType: 'architecte',
  consigne:
    "Tu es l'architecte (A02). Forme des données, migrations additives, index partiels dérivés, contrat d'événements et hash. Ton refus est BLOQUANT.",
};

const roleDev = (t) => (t.repo === 'axionia' ? 'dev-axionia' : 'dev-partners');

// LE CONTEXTE D'UN AGENT — les seuls champs qui servent, et le texte des seules REQ citées.
// L'objet brut de la tâche portait `deps`, `owner`, `lot`, `issue`… que personne ne lit, et
// le prompt envoyait vers des vues générées absentes d'un arbre neuf (elles sont hors git, GOV-123)
// et vers un dossier qui n'existe pas. `hyp` reste : il déclenche le `stop` du développeur.
// `acceptance` va à tous ceux qui reçoivent ce contexte (dev, lentilles, lead) : les critères de
// sécurité d'une tâche sensible n'y vivent souvent que là. Le release manager ne le reçoit pas.
const CHAMPS_UTILES = [
  'id',
  'titre',
  'repo',
  'zone',
  'paths',
  'reqs',
  'hyp',
  'tests',
  'sensible',
  'schema',
  'acceptance',
];
const ficheDe = (t) =>
  Object.fromEntries(CHAMPS_UTILES.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));
const FILTRER_UNE_REQ =
  "node -e \"const r=require('./docs/requirements.json').exigences.find(x=>x.id==='<id>');console.log(r&&r.texte)\"";
const exigencesDe = (t) =>
  (t.reqs ?? [])
    .map((r) => {
      const texte = lot.exigences?.[r];
      return texte
        ? `- ${r} : ${texte}`
        : `- ${r} : texte absent du lot — lis-le filtré : ${FILTRER_UNE_REQ}`;
    })
    .join('\n');

const contexte = (t) => `Tâche à traiter (champs utiles) :
${JSON.stringify(ficheDe(t))}

Exigences citées :
${exigencesDe(t)}

Règles : docs/REGLES-MAISON.md, citées par numéro, et les documents de ta fiche de rôle. Ne lis JAMAIS en entier
docs/tasks.json, docs/requirements.json ni docs/gates.json : filtre-les par identifiant (\`node -e\` ou \`jq\`).
Horodatage de référence pour ce lot : ${now}.`;

let arret = null;
const stops = [];

phase('Dev');
log(`Lot ${lot.id} — ${lot.taches.length} tâche(s) : ${lot.taches.map((t) => t.id).join(', ')}`);

const resultats = await pipeline(
  lot.taches,

  // ── étape 1 : développement ────────────────────────────────────────────────────────────────────
  (t) => {
    if (arret) return null;
    const role = roleDev(t);
    return agent(
      `${contexte(t)}

Tu es un développeur (${role}). Cycle imposé :
1. Crée TOI-MÊME ton worktree et ta branche — le workflow n'en crée aucun :
   \`git worktree add ../axion-partners-wt/${t.id.toLowerCase()} -b t/${t.id.toLowerCase()} origin/main\`
   (pour axionia, suis docs/runbooks/fusion-axionia.md pour le worktree, et n'ouvre PAS de PR hors créneau).
   Retire-le toi-même après la fusion : ne détruis que ce que tu as posé.
2. Écris le ou les tests d'abord, avec l'annotation \`// @req <REQ>\`. Lance-les : ils DOIVENT échouer. Copie le message d'échec verbatim dans \`rouge\` — sans lui, la PR sera refusée.
3. Écris le code minimal qui les fait passer. Ne dépasse pas le périmètre de la tâche.
4. \`pnpm prevol\` (les hooks locaux ne font pas foi en worktree), commits conventionnels, push, \`gh pr create\` avec : les REQ couvertes, le bloc ROUGE/VERT${t.sensible?.length ? ', et la section « Attaque » (obligatoire : tâche sensible)' : ''}.
5. Si tu rencontres une décision sans hypothèse dans docs/DECISIONS.md, ou une REQ non testable : n'invente rien, rends \`statut: "stop"\` avec le motif.`,
      // Pas d'`isolation: 'worktree'` : le développeur crée lui-même le worktree conventionnel
      // (`../axion-partners-wt/<id>`), qui survit à la PR. Deux créateurs = deux worktrees pour
      // une tâche, et un `git worktree prune` qui balaie un arbre qu'il n'a pas posé.
      { label: `dev:${t.id}`, phase: 'Dev', schema: DEV, agentType: role }
    );
  },

  // ── étape 2 : revue à deux lentilles (plus schema), deux tours ──────────────────────────────────
  async (dev, t) => {
    if (!dev || arret) return null;
    if (dev.statut === 'stop') {
      stops.push({ tache: t.id, ...(dev.stop || {}) });
      arret = arret || 'stop développeur';
      return { dev, refuse: true };
    }

    // La troisième lentille n'est convoquée que sur une tâche `schema` — son refus est un second VETO.
    const lentilles = t.schema ? [...LENTILLES, LENTILLE_SCHEMA] : LENTILLES;
    const outil = (l) => ({ phase: 'Revue', schema: AVIS, agentType: l.agentType ?? 'relecteur' });

    // Tour 1 : toutes relisent en entier. Tour 2 : voir l'en-tête (refus + securite en entier, les
    // autres reconfirment sur le delta).
    let aRelire = lentilles;
    let aReconfirmer = [];
    for (let tour = 1; tour <= 2; tour++) {
      const lancees = [...aRelire, ...aReconfirmer];
      const avis = await parallel([
        ...aRelire.map(
          (l) => () =>
            agent(
              `${contexte(t)}

Tu relis la PR #${dev.pr} sous la lentille « ${l.cle} ». ${l.consigne}
Tu ne modifies RIEN : tu lis le diff (\`gh pr diff ${dev.pr}\`), tu vérifies, tu rends un avis, puis tu le postes avec \`gh pr review ${dev.pr}\`.
Le développeur affirme avoir vu ce test rougir avant d'écrire le code : « ${dev.rouge} ». Vérifie que c'est plausible et que le test porte bien sur la REQ.`,
              { label: `revue:${t.id}:${l.cle}:${tour}`, ...outil(l) }
            )
        ),
        ...aReconfirmer.map(
          (l) => () =>
            agent(
              `${contexte(t)}

Tu avais ACCEPTÉ la PR #${dev.pr} sous la lentille « ${l.cle} » ; un correctif a été poussé depuis. Ne relis QUE ce qu'il a changé : le diff entre le commit de ton accord (\`gh pr view ${dev.pr} --json reviews\`) et la tête (\`gh pr view ${dev.pr} --json headRefOid\`). ${l.consigne}
Rends ton avis sur ce delta et poste-le sur la tête avec \`gh pr review ${dev.pr}\` : sans lui, ton accord est périmé et la fusion refusée. Rouge annoncé par le correctif : « ${dev.rouge} ».`,
              { label: `reaccord:${t.id}:${l.cle}`, ...outil(l) }
            )
        ),
      ]);
      const rendus = avis.map((a, i) => ({
        lentille: lancees[i].cle,
        ...(a || { refuse: true, motifs: ['relecteur absent'] }),
      }));
      const refusees = rendus.filter((r) => r.refuse);
      if (refusees.length === 0) return { dev, refuse: false };

      const motifs = refusees.flatMap((r) => r.motifs.map((m) => `${r.lentille} : ${m}`));
      if (tour === 2) {
        const vetos = refusees.filter((r) => VETOS.includes(r.lentille));
        if (vetos.length > 0) {
          return {
            dev,
            refuse: true,
            motif: `veto ${vetos.map((r) => r.lentille).join(', ')} : ${motifs.join(' · ')}`,
          };
        }
        const lead = await agent(
          `${contexte(t)}

Deux tours de revue ont échoué sur la PR #${dev.pr}. Motifs : ${motifs.join(' · ')}.
Tu es le lead de la zone « ${t.zone} ». Tranche : soit tu acceptes en justifiant, soit tu renvoies la tâche en \`bloquee\` avec le motif exact.`,
          { label: `lead:${t.id}`, phase: 'Revue', schema: LEAD, agentType: 'lead' }
        );
        return { dev, refuse: !lead?.accepte, motif: lead?.motif ?? 'lead absent' };
      }

      // Le rendu du correctif est LU : son `rouge` va aux relecteurs du tour 2, son `stop` arrête le lot.
      const correctif = await agent(
        `${contexte(t)}

Ta PR #${dev.pr} est refusée. Motifs : ${motifs.join(' · ')}.
Corrige, pousse sur la même branche. Ne réponds pas aux motifs par un commentaire : corrige le code ou le test.`,
        { label: `dev:${t.id}:tour${tour + 1}`, phase: 'Revue', schema: DEV, agentType: roleDev(t) }
      );
      if (correctif) dev = { ...dev, ...correctif, pr: correctif.pr ?? dev.pr };
      if (dev.statut === 'stop') {
        stops.push({ tache: t.id, ...(dev.stop || {}) });
        arret = arret || 'stop développeur';
        return { dev, refuse: true };
      }
      aRelire = lentilles.filter(
        (l) => l.cle === 'securite' || refusees.some((r) => r.lentille === l.cle)
      );
      aReconfirmer = lentilles.filter((l) => !aRelire.includes(l));
    }
    return { dev, refuse: true, motif: 'deux tours épuisés' };
  }
);

// ── fusion, par paquets adaptatifs ─────────────────────────────────────────────────────────────────
// La composition, la taille et le découpage sont dérivés par `scripts/lot/paquets-de-fusion.ts` : le
// workflow ne les recopie pas (RM-01). Un SEUL release manager reçoit toutes les PR acceptées, parce
// que la taille d'un paquet dépend de l'issue du précédent. Chaque FUSION rendue est REMBOÎTÉE dans
// l'objet de revue de sa PR ; une PR qu'il ne rend pas n'a pas atterri.
const FUSIONS = {
  type: 'object',
  properties: { fusions: { type: 'array', items: FUSION } },
  required: ['fusions'],
};
const pretes = resultats.filter((r) => r && !r.refuse && r.dev?.pr != null);
if (pretes.length && !arret) {
  phase('Fusion');
  const liste = pretes.map((r) => `#${r.dev.pr} (${r.dev.taskId})`).join(', ');
  const rendu = await agent(
    // Le release manager n'a besoin que de l'identité des tâches : ni l'acceptation, ni les REQ.
    `Lot ${lot.id}. Horodatage de référence pour ce lot : ${now}. PR acceptées : ${liste}.

Tu es le release manager. Fusionne ces PR par PAQUETS ADAPTATIFS (GOV-158) ; aucune garde ne tombe.
1. Compose : \`npx tsx scripts/lot/paquets-de-fusion.ts composer --taille <t> --prs <n,n,…> --ordre-a02 <migration,migration,…>\` — la taille part de 4 ; l'ordre des migrations est celui que l'architecte (A02) a fixé dans sa revue \`schema\`, jamais deviné : sans lui, une PR qui porte une migration refuse la composition. Il rend des paquets sans fichier commun, migrations dans cet ordre. Ne compose JAMAIS un paquet à la main.
2. Teste le paquet ENSEMBLE, une fois, sur la pointe de \`main\` : worktree jetable détaché sur \`origin/main\`, \`git fetch origin pull/<n>/head\` puis \`git merge --no-edit FETCH_HEAD\` pour chaque PR, \`pnpm install --offline --frozen-lockfile\`, \`pnpm prevol\` ; retire ce worktree ensuite.
3. Rouge : \`npx tsx scripts/lot/paquets-de-fusion.ts moities --prs <paquet>\`, puis recommence 2 sur chaque moitié jusqu'à isoler la fautive. Les saines fusionnent ; la fautive seule rend \`atterri: false\` avec son motif. Avant de fusionner une saine : \`npx tsx scripts/lot/paquets-de-fusion.ts attente --prs <saines restantes> --ecartees <écartées> --ordre-a02 <…>\` — une PR qu'il nomme ATTEND (sa migration suit celle d'une écartée) : elle n'est pas fusionnée et rend \`atterri: false\`, motif « en attente de la migration de #<n> ».
4. Vert : fusionne ses PR UNE SEULE à la fois, dans l'ordre du paquet. Pour chacune : \`gh pr view <n> --json mergeStateStatus,statusCheckRollup\` ; si BEHIND → \`gh pr update-branch <n>\` ; \`gh pr checks <n> --watch --interval 60 > /dev/null 2>&1; echo "checks=$?"\` (gate-a verte exigée) ; \`pnpm gov:pr --pr <n>\` (avis par tête, veto de \`securite\`) ; puis relis l'état ET fusionne dans le MÊME appel : \`gh pr merge <n> --squash --match-head-commit <sha-de-tête> --subject "$(gh pr view <n> --json title -q .title) (#<n>)" --body "$(gh pr view <n> --json body -q .body | grep -m1 '^Lot:')" --delete-branch\` — \`--body\` recopie la ligne \`Lot:\` dans le message d'écrasement, le seul texte que \`lot:cloture\` lit (GOV-104). Une garde rouge sur la tête : la PR est fautive, pas fusionnée.
5. Après CHAQUE fusion, vérifie l'atterrissage : \`pnpm deploy:verify <sha>\` (en-tête \`x-partners-build-sha\`). Tant que ce n'est pas vérifié, la PR suivante n'est pas fusionnée (RM-09).
6. Taille du paquet suivant : \`npx tsx scripts/lot/paquets-de-fusion.ts taille --apres <t> --premier-coup oui|non\` — elle monte tant que les paquets passent du premier coup, revient au départ après un échec.
7. Rends \`fusions\`, une entrée par PR, avec \`sha\` (le SHA **ENTIER** du commit de fusion, 40 hexadécimaux) et \`fusionneeAt\` (l'instant de fusion en UTC, \`AAAA-MM-JJTHH:MM:SSZ\`) — \`gh pr view <n> --json mergeCommit,mergedAt\`. Si la tâche vit dans un AUTRE dépôt, ces deux valeurs sont la SEULE trace de sa livraison que ce dépôt-ci pourra porter (GOV-038), et \`pnpm lot:cloture\` refusera de clore sans elles. Un SHA abrégé ne convient pas.
Tu ne fusionnes jamais une PR dont tu es l'auteur.`,
    { label: `fusion:${lot.id}`, phase: 'Fusion', schema: FUSIONS, agentType: 'release-manager' }
  );
  const parPr = new Map((rendu?.fusions ?? []).map((f) => [f.pr, f]));
  for (const r of pretes) {
    r.fusion = parPr.get(r.dev.pr) ?? {
      pr: r.dev.pr,
      sha: null,
      fusionneeAt: null,
      atterri: false,
      motif: 'non rendue par le release manager',
    };
  }
}

phase('Clôture');
const livrees = resultats.filter((r) => r && !r.refuse && r.fusion?.atterri);
log(
  `${livrees.length}/${lot.taches.length} tâche(s) livrée(s)${stops.length ? ` · ${stops.length} arrêt(s)` : ''}`
);

const critique = await agent(
  `Lot ${lot.id} terminé. Tâches : ${JSON.stringify(
    lot.taches.map((t) => ({ id: t.id, titre: t.titre, reqs: t.reqs })),
    null,
    1
  )}
Résultats : ${JSON.stringify(
    resultats.map((r) =>
      r
        ? {
            tache: r.dev?.taskId,
            refuse: r.refuse,
            pr: r.dev?.pr,
            atterri: r.fusion?.atterri ?? false,
            reqCouvertes: r.dev?.reqCouvertes,
          }
        : null
    ),
    null,
    1
  )}
Écartées par le composeur : ${JSON.stringify(lot.ecartees)}
Exigences citées par le lot : ${JSON.stringify(lot.exigences ?? {})}

Tu es le critique de complétude. Question unique : QU'EST-CE QUI MANQUE ? Une REQ citée mais non couverte par un test ? Une étape du cycle de vie sans tâche ? Une dépendance externe sans repli ? Une décision découverte en route et non enregistrée ? Le lien REQ → tâches est le champ \`taches\` de docs/requirements.json : lis-le FILTRÉ par identifiant (${FILTRER_UNE_REQ.replace('r&&r.texte', 'r&&r.taches')}), jamais le registre entier. Chaque manque devient une tâche proposée.`,
  { label: 'completude', phase: 'Clôture', schema: A40, agentType: 'critique-completude' }
);

return { lotId: lot.id, resultats, stops, manques: critique?.manques ?? [], arret };
