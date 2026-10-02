# partners/ADR-0029 — La protection des événements reçus admet la réécriture minimisante d'une candidature

| Champ | Valeur |
| --- | --- |
| **Statut** | `propose` |
| **Date** | 2026-10-02 |
| **Décideur** | `architecte` — cet ADR consigne la conception d'INT-T56, validée par A02 le 2026-10-02 sous les corrections C1 à C4 ; il n'est pas encore accepté |
| **Tâche** | INT-T56 |
| **Exigences servies** | REQ-DM-036, REQ-JUR-029, REQ-DM-037 |
| **Décisions du registre citées** | HYP-RGPD-RETENTION (délai de la minimisation de fond, plafond provisoire) |
| **Règle maison appliquée** | RM-01, RM-02, RM-10 |
| **Remplace / remplacé par** | amende la fonction `evenements_recus_refuser_modification` de la migration `20260927000000_evenements_recus_et_battements` |

## Contexte

`evenements_recus` conserve la réception telle qu'elle est arrivée (REQ-DM-036). Sa fonction de
protection refuse toute écriture hors des cinq colonnes du traitement, et `charge` en fait partie.
Or la charge d'une `candidature_recue` porte `reponsesJson`, une donnée personnelle, et la table est
conservée dix ans (écart B-02 de la vérification V2). `reponsesJson` ne peut pas être retiré à la
réception : `snapshotDeCandidature` (INT-T26) le lit plus tard depuis la charge (blocage d'INT-T44,
décision de la coordination du 2026-10-01).

REQ-DM-037 veut des migrations additives. Assouplir une protection ne s'écrit pas par ajout : ni un
second déclencheur (le premier refuserait toujours), ni un remplacement de déclencheur (`DROP
TRIGGER`, même famille `journal_desarme`). La garde `partners:migrations:additive` n'absout un
`CREATE OR REPLACE` de fonction de protection QUE par un ADR accepté : celui-ci.

## Décision

La fonction de protection admet EXACTEMENT deux réécritures de `charge`, et aucune autre :

1. **(i) le traitant** : une `candidature_recue` passe à `traite`, HORS du marqueur du fond, dans la
   transaction de la candidature (`candidature-recue.ts`, même `data` que le passage à `traite`) ;
2. **(ii) le fond** : une `candidature_recue` non `traite`, à statut INCHANGÉ, SOUS le marqueur
   `partners.minimisation_de_fond`, posé par `set_config('partners.minimisation_de_fond','oui', true)`
   dans la même transaction interactive. Il meurt avec elle et ne fuit pas dans le pool.

Dans les deux cas, `OLD.charge ? 'reponsesJson'` et `NEW.charge = OLD.charge - 'reponsesJson'`
**exactement** : rien n'est ajouté ni changé, et une seconde réécriture est refusée d'elle-même.
`payload_hash` et les dix autres colonnes restent refusés : il demeure la preuve de la charge reçue
entière. DELETE et TRUNCATE restent refusés.

**L'invariant est TENU par la base (C4 d'A02).** Le déclencheur ADMET la réécriture ; il ne l'IMPOSE pas. La contrainte `evenements_recus_candidature_traitee_minimisee`, `CHECK (NOT (event_type = 'candidature_recue' AND statut = 'traite' AND charge ? 'reponsesJson'))`, VALIDÉE à l'ajout (sans NOT VALID), refuse qu'une candidature traitée garde `reponsesJson` : un passage à `traite` qui oublierait la charge, par une régression future du code, est refusé. Elle refuse d'elle-même toute ligne héritée fautive ; aucune n'est réécrite.

Le délai du fond, `CANDIDATURE_NON_TRAITEE_MINIMISEE_APRES_JOURS = 30` (SSOT, plafond provisoire,
HYP-RGPD-RETENTION), n'est tenu QUE par le `WHERE` du code, jamais recopié dans le SQL.

Le marqueur a été préféré à un rôle PostgreSQL distinct (arbitrage A02) : au pire, il permet de
RETIRER `reponsesJson` d'une ligne non traitée, à l'égalité exacte près. Il n'ajoute ni ne change
jamais rien, et un second rôle coûterait une seconde connexion pour un gain nul.

## Conséquences

- La migration commence par un `DO $$ … RAISE` : si une `candidature_recue` déjà `traite` porte
  encore `reponsesJson`, elle échoue avec le nombre de lignes et le renvoi à INT-T56, sans rien
  minimiser en silence. Aucune ligne de ce type n'existe tant que `PARTNERS_SYNC_ENABLED` est éteint.
- Une candidature `en_erreur` minimisée par le fond ne peut plus être retraitée : `snapshotDeCandidature`
  lève faute de `reponsesJson`. C'est cohérent avec la règle, et c'est dit dans le code et dans le runbook.
- Le retour arrière est une migration suivante qui retire la contrainte (`DROP CONSTRAINT`) puis
  repose l'ancien corps, l'un et l'autre recopiés en commentaire dans la migration même.

## Alternatives écartées

- **Retirer `reponsesJson` à la réception** : impossible, puisque le traitant le lit plus tard.
- **Un rôle PostgreSQL distinct pour le fond** : plus fort en apparence, mais d'aucun gain réel ici,
  et une seconde connexion.
- **Recopier le délai de 30 jours dans le déclencheur** : une seconde copie de la SSOT (RM-01, RM-10).
- **Réécrire les lignes héritées** : le déclencheur amendé ne l'admet pas, et un `DISABLE TRIGGER`
  serait un désarmement de la protection.
- **`NOT VALID` puis `VALIDATE`** : un trou entre les deux, une seconde migration, pour zéro ligne.
- **Minimiser en silence les lignes déjà traitées** dans la migration : on ne réécrit pas sans bruit
  ce que la protection garde ; la migration refuse plutôt.

## Ce qui le vérifie

- `tests/integration/charge-candidature-minimisee.spec.ts`, sur un vrai Postgres (en CI) : les deux
  cas, la seconde réécriture refusée, une autre clé changée refusée, l'échec de transaction qui laisse
  la charge intacte, le passage à `traite` sans réécriture refusé par la contrainte, une ligne héritée
  fautive qui fait échouer l'ajout de la contrainte (transaction annulée), le fond par le vrai déclencheur, le fond sans marqueur refusé, un
  `en_erreur → traite` sous le marqueur refusé, et le marqueur qui ne fuit pas. Le rouge a été constaté
  sans la migration (run 36944587186).
- `tests/unit/integration/charge-candidature-minimisee.spec.ts` : la forme minimisée, pure.
- `partners:migrations:additive` : la faute `journal_desarme` est absoute par cet ADR, et imprimée.

## Reste à faire

- Confirmer le délai de 30 jours (point 9 de la séance de Williams).
- La case de mise en service : `PARTNERS_SYNC_ENABLED` faux jusqu'à la fusion d'INT-T56 (runbook).
