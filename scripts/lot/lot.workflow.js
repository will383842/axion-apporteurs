export const meta = {
  name: 'lot-axion-partners',
  description: 'Exécute un lot de tâches : développement en worktrees, revue à trois lentilles, mutation prouvée, fusion sérialisée, critique de complétude',
  phases: [
    { title: 'Dev', detail: 'un développeur par tâche, en worktree isolé, test rouge d abord' },
    { title: 'Revue', detail: '3 lentilles + vérificateur rouge, 2 tours maximum' },
    { title: 'Fusion', detail: 'une PR à la fois, atterrissage vérifié' },
    { title: 'Clôture', detail: 'critique de complétude' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ENTRÉE : args = { lot: <contenu de docs/lots/L<phase>-<seq>/lot.json>, now: "<ISO>" }
//   `now` est FOURNI par l'appelant : un script de workflow ne peut pas appeler Date.now() (rejeu).
// SORTIE : { lotId, resultats: [...], stops: [...], manques: [...] }
//
// INVARIANTS
//   - la fusion est SÉRIALISÉE (une PR à la fois) même si le développement est parallèle : c'est la
//     règle de la maison sur `main` (jamais deux producteurs, cf. famine du déploiement).
//   - sur une tâche `sensible`, un refus de la lentille sécurité est un VETO ; les deux autres
//     lentilles restent à la majorité.
//   - un `stop` d'un agent arrête l'ensemble du lot : on ne devine jamais une décision de Will.
//   - CHAQUE appel `agent()` porte un `agentType` correspondant à un fichier de `.claude/agents/` :
//     sans lui, les `tools` restreints des fiches (le relecteur privé de Write/Edit, le release
//     manager privé d'écriture) n'ont AUCUN effet — le sous-agent est générique et peut tout.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const lot = args.lot
const now = args.now

// `args.lot` est le CONTENU de lot.json, jamais son chemin : un script de workflow n'a pas accès au
// système de fichiers. Sans cette garde, on meurt en `lot.taches is undefined` sans savoir pourquoi.
if (!lot || !Array.isArray(lot.taches)) {
  throw new Error('args.lot doit être le CONTENU de lot.json, pas son chemin')
}

const DEV = { type: 'object', properties: {
  taskId: { type: 'string' }, branch: { type: 'string' }, pr: { type: ['integer', 'null'] },
  statut: { type: 'string', enum: ['livree', 'stop'] },
  rouge: { type: 'string', description: 'message verbatim du test qui a échoué AVANT le code' },
  vert: { type: 'boolean' },
  reqCouvertes: { type: 'array', items: { type: 'string' } },
  appris: { type: 'array', items: { type: 'string' } },
  // Liste FERMÉE : la table des motifs d'arrêt du SKILL §6 doit pouvoir retrouver chaque valeur.
  // Une chaîne libre laisse un développeur inventer un motif qu'aucune table ne sait traiter.
  stop: { type: ['object', 'null'], properties: {
    motif: { enum: ['decision_sans_hypothese', 'req_non_testable', 'dependance_externe_sans_repli', 'constat_critique', 'gate_phase_x2', 'readyz_503_prod', 'ecart_reconciliation'] },
    ref: { type: 'string' },
  }, required: ['motif', 'ref'] },
}, required: ['taskId', 'branch', 'pr', 'statut', 'rouge', 'vert', 'reqCouvertes', 'appris', 'stop'] }

const AVIS = { type: 'object', properties: {
  refuse: { type: 'boolean' }, motifs: { type: 'array', items: { type: 'string' } },
}, required: ['refuse', 'motifs'] }

const MUT = { type: 'object', properties: {
  prouve: { type: 'boolean' },
  mutations: { type: 'array', items: { type: 'object', properties: {
    fichier: { type: 'string' }, mutation: { type: 'string' }, testRouge: { type: ['string', 'null'] },
  }, required: ['fichier', 'mutation', 'testRouge'] } },
}, required: ['prouve', 'mutations'] }

const LEAD = { type: 'object', properties: {
  accepte: { type: 'boolean' }, motif: { type: 'string' },
}, required: ['accepte', 'motif'] }

const FUSION = { type: 'object', properties: {
  pr: { type: ['integer', 'null'] }, sha: { type: ['string', 'null'] },
  atterri: { type: 'boolean' }, motif: { type: 'string' },
}, required: ['pr', 'sha', 'atterri', 'motif'] }

const A40 = { type: 'object', properties: {
  manques: { type: 'array', items: { type: 'object', properties: {
    quoi: { type: 'string' }, ou: { type: 'string' }, tacheProposee: { type: 'string' },
  }, required: ['quoi', 'ou', 'tacheProposee'] } },
}, required: ['manques'] }

const LENTILLES = [
  { cle: 'exactitude', consigne: 'Le code fait-il EXACTEMENT ce que disent les REQ citées, ni plus ni moins ? Vérifie chaque REQ une par une contre le diff. Un écart de périmètre est un refus.' },
  { cle: 'securite', consigne: 'Cloisonnement (aucun accès hors `forApporteur()`), défaut = refus, 404 byte-identique, PII chiffrée, journal sans PII, idempotence, aucune fuite dans un message d\'erreur. Sur une tâche sensible, ton refus est un VETO.' },
  { cle: 'simplicite', consigne: 'Dérivation depuis une source unique (jamais une recopie), pas de duplication d\'une règle existante, altitude du code, nommage français conforme aux CONVENTIONS. Une valeur littérale qui existe déjà ailleurs est un refus.' },
]

// Quatrième lentille, ajoutée UNIQUEMENT sur les tâches `schema` (prisma/** ou packages/contracts/**) :
// l'approbation de l'architecte (A02) y est bloquante (plan §2.1, GOV-007). Sans elle, une migration
// Prisma recevait exactement la même revue qu'un changement de micro-copy.
const LENTILLE_SCHEMA = { cle: 'schema', agentType: 'architecte', consigne: "Tu es l'architecte (A02). Forme des données, migrations additives, index partiels dérivés, contrat d'événements et hash. Ton refus est BLOQUANT." }

const roleDev = (t) => (t.repo === 'axionia' ? 'dev-axionia' : 'dev-partners')

const contexte = (t) => `Tâche à traiter :
${JSON.stringify(t, null, 1)}

Documents à lire AVANT d'écrire quoi que ce soit, dans cet ordre : docs/PLAN-STATE.md, docs/REGLES-MAISON.md,
docs/CONVENTIONS.md, ta fiche de rôle, les REQ citées dans docs/REQUIREMENTS.md, puis les sections de docs/spec/
que la tâche référence. Horodatage de référence pour ce lot : ${now}.`

let arret = null
const stops = []

phase('Dev')
log(`Lot ${lot.id} — ${lot.taches.length} tâche(s) : ${lot.taches.map((t) => t.id).join(', ')}`)

// File de fusion : une PR à la fois, quel que soit le parallélisme du développement.
let file = Promise.resolve()
const auTour = (fn) => (file = file.then(fn, fn))

const resultats = await pipeline(
  lot.taches,

  // ── étape 1 : développement ────────────────────────────────────────────────────────────────────
  (t) => {
    if (arret) return null
    const role = roleDev(t)
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
    )
  },

  // ── étape 2 : revue à trois lentilles + mutation, deux tours ────────────────────────────────────
  async (dev, t) => {
    if (!dev || arret) return null
    if (dev.statut === 'stop') { stops.push({ tache: t.id, ...(dev.stop || {}) }); arret = arret || 'stop développeur'; return { dev, refuse: true } }

    // La quatrième lentille n'est convoquée que sur une tâche `schema` — son refus est un second VETO.
    const lentilles = t.schema ? [...LENTILLES, LENTILLE_SCHEMA] : LENTILLES

    for (let tour = 1; tour <= 2; tour++) {
      const avis = await parallel(lentilles.map((l) => () => agent(
        `${contexte(t)}

Tu relis la PR #${dev.pr} sous la lentille « ${l.cle} ». ${l.consigne}
Tu ne modifies RIEN : tu lis le diff (\`gh pr diff ${dev.pr}\`), tu vérifies, tu rends un avis, puis tu le postes avec \`gh pr review ${dev.pr}\`.
Le développeur affirme avoir vu ce test rougir avant d'écrire le code : « ${dev.rouge} ». Vérifie que c'est plausible et que le test porte bien sur la REQ.`,
        { label: `revue:${t.id}:${l.cle}:${tour}`, phase: 'Revue', schema: AVIS, agentType: l.agentType ?? 'relecteur' }
      )))
      const rendus = avis.map((a, i) => ({ lentille: lentilles[i].cle, ...(a || { refuse: true, motifs: ['relecteur absent'] }) }))
      const secu = rendus.find((r) => r.lentille === 'securite')
      const arch = rendus.find((r) => r.lentille === 'schema')
      const veto = ((t.sensible?.length ?? 0) > 0 && secu?.refuse) || (t.schema && arch?.refuse)
      const refus = rendus.filter((r) => r.refuse).length

      if (!veto && refus < 2) {
        const mut = await agent(
          `${contexte(t)}

Tu es le vérificateur « vu rougir » sur la PR #${dev.pr}. Pour chaque garde ajoutée : mute le code (inverse une condition, retire un \`where\`, supprime une contrainte) et PROUVE que le test correspondant échoue. Vérifie aussi que les fixtures viennent du producteur réel et qu'aucun helper de test ne porte de valeur par défaut sur ce que le test fait varier. Restaure le code après chaque mutation.`,
          { label: `mutation:${t.id}`, phase: 'Revue', schema: MUT, agentType: 'verificateur-rouge' }
        )
        if (mut?.prouve) return { dev, refuse: false }
        rendus.push({ lentille: 'mutation', refuse: true, motifs: ['gardes non prouvées'] })
      }

      const motifs = rendus.filter((r) => r.refuse).flatMap((r) => r.motifs)
      if (tour === 2) {
        const lead = await agent(
          `${contexte(t)}

Deux tours de revue ont échoué sur la PR #${dev.pr}. Motifs : ${motifs.join(' · ')}.
Tu es le lead de la zone « ${t.zone} ». Tranche : soit tu acceptes en justifiant, soit tu renvoies la tâche en \`bloquee\` avec le motif exact.`,
          { label: `lead:${t.id}`, phase: 'Revue', schema: LEAD, agentType: 'lead' }
        )
        return { dev, refuse: !(lead?.accepte), motif: lead?.motif ?? 'lead absent' }
      }

      await agent(
        `${contexte(t)}

Ta PR #${dev.pr} est refusée. Motifs : ${motifs.join(' · ')}.
Corrige, pousse sur la même branche. Ne réponds pas aux motifs par un commentaire : corrige le code ou le test.`,
        { label: `dev:${t.id}:tour${tour + 1}`, phase: 'Revue', schema: DEV, agentType: roleDev(t) }
      )
    }
    return { dev, refuse: true, motif: 'deux tours épuisés' }
  },

  // ── étape 3 : fusion, sérialisée ───────────────────────────────────────────────────────────────
  // La fusion rend un objet FUSION ; on le REMBOÎTE dans l'objet de revue au lieu de le substituer.
  // Sans ça, la clôture perdait `dev.taskId` et `dev.pr` pour toutes les tâches fusionnées, et
  // comptait « livrée » toute PR fusionnée — même avec `atterri: false`, l'objet FUSION n'ayant
  // aucun champ `refuse`.
  (revue, t) => {
    if (!revue || revue.refuse || arret) return revue
    return auTour(() => agent(
      `${contexte(t)}

Tu es le release manager. Fusionne la PR #${revue.dev.pr}, UNE SEULE à la fois :
1. \`gh pr view ${revue.dev.pr} --json mergeStateStatus,statusCheckRollup\` ; si BEHIND → \`gh pr update-branch\`.
2. \`gh pr checks ${revue.dev.pr} --watch\` : toutes vertes, sinon rends \`atterri: false\` avec le motif.
3. Relis l'état ET fusionne dans le MÊME appel (une PR verte peut passer BEHIND entre les deux) : \`gh pr merge ${revue.dev.pr} --squash --delete-branch\`.
4. Vérifie l'atterrissage : \`pnpm deploy:verify <sha>\` (en-tête \`x-partners-build-sha\`). Tant que ce n'est pas vérifié, la PR suivante n'est pas fusionnée.
Tu ne fusionnes jamais une PR dont tu es l'auteur.`,
      { label: `fusion:${t.id}`, phase: 'Fusion', schema: FUSION, agentType: 'release-manager' }
    )).then((fusion) => ({ ...revue, fusion }))
  }
)

phase('Clôture')
const livrees = resultats.filter((r) => r && !r.refuse && r.fusion?.atterri)
log(`${livrees.length}/${lot.taches.length} tâche(s) livrée(s)${stops.length ? ` · ${stops.length} arrêt(s)` : ''}`)

const critique = await agent(
  `Lot ${lot.id} terminé. Tâches : ${JSON.stringify(lot.taches.map((t) => ({ id: t.id, titre: t.titre, reqs: t.reqs })), null, 1)}
Résultats : ${JSON.stringify(resultats.map((r) => (r ? { tache: r.dev?.taskId, refuse: r.refuse, pr: r.dev?.pr, atterri: r.fusion?.atterri ?? false, reqCouvertes: r.dev?.reqCouvertes } : null)), null, 1)}
Écartées par le composeur : ${JSON.stringify(lot.ecartees, null, 1)}

Tu es le critique de complétude. Question unique : QU'EST-CE QUI MANQUE ? Une REQ citée mais non couverte par un test ? Une étape du cycle de vie sans tâche ? Une dépendance externe sans repli ? Une décision découverte en route et non enregistrée ? Lis docs/REQUIREMENTS.md et, **s'il existe**, docs/TRACEABILITY.md (généré par GOV-011 ; son absence n'est pas un manque avant cette tâche). Chaque manque devient une tâche proposée.`,
  { label: 'completude', phase: 'Clôture', schema: A40, agentType: 'critique-completude' }
)

return { lotId: lot.id, resultats, stops, manques: critique?.manques ?? [], arret }
