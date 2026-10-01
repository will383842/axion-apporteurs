/**
 * La mention de l'article 14 du RGPD dans le script de qualification (JUR-T09, REQ-JUR-009) — lue à
 * voix haute par la personne d'Axion-IA qui appelle le contact déclaré. Lu par Axion-IA seul :
 * `gov:lexique` le juge à la portée du dépôt (REQ-GOV-017).
 *
 * UN SEUL TEXTE D'INFORMATION. Le texte complet est celui de l'e-mail
 * (`../courriels/information-article-14.ts`) : le script en dit l'essentiel à l'oral et y renvoie,
 * il n'en recopie aucune rubrique (RM-01). Il porte la même version, que l'appel journalise.
 *
 * DEUX CAS, selon que l'e-mail est parvenu ou non à la personne :
 *   `apresCourriel` — la demande de confirmation a été reçue (envoi sans rebond) ;
 *   `sansCourriel`  — aucune demande n'a été reçue (rebond non corrigé, ou dépôt sans e-mail
 *                     automatique, HYP-W20-SALARIES) : l'information complète est alors envoyée par
 *                     e-mail au plus tard lors de cet appel (REQ-JUR-009), et l'appelant le dit.
 *
 * Les paramètres sont ceux de l'e-mail (`{responsable}`, `{prenomApporteur}`, `{nomApporteur}`,
 * `{entreprise}`). Le script ne cite pas la date du contact (REQ-JUR-040).
 */
import { VERSION_INFORMATION_ARTICLE_14 } from '../courriels/information-article-14';

export const VERSION_MENTION_SCRIPT = VERSION_INFORMATION_ARTICLE_14;

export const MENTION_ARTICLE_14_SCRIPT = {
  ouverture:
    "Bonjour, je vous appelle de la part d'Axion-IA : {prenomApporteur} {nomApporteur}, apporteur d'affaires indépendant, nous a présenté {entreprise} et nous a transmis vos coordonnées professionnelles.",
  apresCourriel:
    "{responsable} les utilise pour vérifier votre échange avec lui et y donner suite, sur la base de son intérêt légitime. Le courriel que vous avez reçu de notre part détaille la durée de conservation et vos droits, dont celui de vous opposer à tout moment.",
  sansCourriel:
    "{responsable} les utilise pour vérifier votre échange avec lui et y donner suite, sur la base de son intérêt légitime. Je vous adresse aujourd'hui par courriel le détail de la durée de conservation et de vos droits, dont celui de vous opposer à tout moment.",
  question: 'Souhaitez-vous que nous poursuivions cet échange ?',
  /** Ce que l'appelant dit si la personne s'oppose : il n'insiste pas, et l'opposition est enregistrée. */
  siOpposition:
    "C'est noté : Axion-IA ne vous écrira plus et ne vous appellera plus au titre de cette présentation. Je vous souhaite une bonne journée.",
} as const;
