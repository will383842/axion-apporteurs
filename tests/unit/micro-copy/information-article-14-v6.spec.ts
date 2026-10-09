// @req REQ-JUR-060
// @req REQ-JUR-062
/**
 * JUR-T51 — le bloc d'information de l'article 14, version 6 : le CRM d'Axion-IA nommé, la finalité
 * commerciale, sa base, sa durée, et l'opposition à toute prospection, présentée à part.
 *
 * TEXTES D'A07, MOT POUR MOT (2026-10-04), PROPOSITION À VALIDER PAR WILLIAMS, NON EN VIGUEUR.
 * Le fichier porte le nom versé au registre (« v5 ») ; la version du bloc est la v6, tranchée par la
 * juriste : la v5 de main ne nommait pas l'outil de relation client.
 *
 * CE QU'IL PROUVE.
 *   1. la version change, et elle est celle que l'envoi garde avec le dépôt ;
 *   2. la finalité nomme la conservation dans l'outil de relation client, pour la relation d'affaires ;
 *   3. la base nomme l'intérêt légitime commercial, au titre de la fonction, et l'opposition ;
 *   4. les destinataires comptent la présentation des prestations et le suivi des clients ;
 *   5. la durée de prospection est comptée depuis le dernier contact, en paramètre lu à la source
 *      (décision de Williams du 2026-10-09), et la phrase du démenti la suit ;
 *   6. aucune clé ne dit « relance » à tort : la seule relance niée est celle de la confirmation ;
 *   7. l'opposition vaut pour TOUT message et tout appel d'Axion-IA, et son lien le dit.
 */
import { describe, it, expect } from 'vitest';
import {
  INFORMATION_ARTICLE_14,
  LIEN_OPPOSITION,
  VERSION_INFORMATION_ARTICLE_14,
} from '../../../src/content/micro-copy/courriels/information-article-14';

describe('REQ-JUR-060 — le bloc de l’article 14 en version 6 (le CRM d’Axion-IA nommé)', () => {
  it('REQ-JUR-060 : TÉMOIN — la version est la v6', () => {
    expect(VERSION_INFORMATION_ARTICLE_14).toBe('information-article-14/v6');
  });

  it('REQ-JUR-060 : TÉMOIN — la finalité nomme l’outil de relation client et la relation d’affaires', () => {
    expect(INFORMATION_ARTICLE_14.finalite).toBe(
      "Nous les utilisons pour donner suite à cette présentation et reprendre contact avec vous au sujet de {entreprise}, après vous avoir demandé de confirmer cet échange. Nous les conservons aussi dans notre outil de gestion de la relation client, pour vous présenter les prestations d'Axion-IA et gérer notre relation d'affaires avec {entreprise}. Une empreinte de votre adresse et de votre numéro nous sert aussi à éviter les doublons et à respecter votre opposition."
    );
  });

  it('REQ-JUR-062 : TÉMOIN — la base nomme l’intérêt légitime commercial, au titre de la fonction, et le droit de s’y opposer', () => {
    expect(INFORMATION_ARTICLE_14.baseLegale).toBe(
      "Ce traitement repose sur {baseLegale}, et, pour la présentation de nos prestations, sur l'intérêt légitime d'Axion-IA à développer ses relations d'affaires avec des professionnels, au titre de votre fonction. Vous pouvez vous y opposer à tout moment."
    );
  });

  it('REQ-JUR-060 : TÉMOIN — les destinataires comptent la présentation des prestations et le suivi des clients', () => {
    expect(INFORMATION_ARTICLE_14.destinataires).toBe(
      "Vos coordonnées ne sont accessibles qu'aux personnes d'Axion-IA chargées de ce suivi, de la présentation de ses prestations et du suivi de ses clients, ainsi qu'à {prestataireEnvoi}, notre prestataire d'envoi de courriels, et aux prestataires techniques qui hébergent nos outils. {prenomApporteur} {nomApporteur} est informé de la suite donnée à sa présentation. Vos données ne sont ni vendues ni cédées. {mentionTransfert}"
    );
  });

  it('REQ-JUR-062 : TÉMOIN — la durée de prospection est comptée depuis le dernier contact, en paramètre (décision de Williams du 2026-10-09), puis le démenti et sa durée en paramètre', () => {
    expect(INFORMATION_ARTICLE_14.duree).toBe(
      "Axion-IA conserve les coordonnées de votre entreprise, ainsi que vos nom et coordonnées professionnelles, pour vous présenter ses prestations, pendant {dureeApresDernierContact} après le dernier contact. Vous pouvez à tout moment vous opposer à nos messages et appels, ou demander l'effacement de vos données ; nous les mettons à jour ou les effaçons dès que nous apprenons qu'elles ne sont plus exactes, par exemple si vous changez de fonction. Si vous indiquez n'avoir eu aucun échange avec {prenomApporteur} {nomApporteur}, votre réponse et votre nom sont conservés {dureeDementi}, pour pouvoir l'établir en cas de contestation."
    );
    // Deux durées, toutes deux en paramètre, jamais en clair (`ssot:seuils`, RM-10) : la prospection,
    // comptée depuis le dernier contact (`CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS`), et
    // le démenti (`DEMENTI_CONTACT_VIDE_APRES_ANS`).
    expect(INFORMATION_ARTICLE_14.duree.match(/\{duree\w*\}/g)).toEqual([
      '{dureeApresDernierContact}',
      '{dureeDementi}',
    ]);
  });

  it('REQ-JUR-060 : TÉMOIN — aucune clé ne dit « relance » à tort : seule la relance de la confirmation est niée', () => {
    expect(INFORMATION_ARTICLE_14.relance).toBe(
      "Ce message ne sera suivi d'aucune relance au sujet de cette demande de confirmation."
    );
    for (const [cle, texte] of Object.entries(INFORMATION_ARTICLE_14))
      if (cle !== 'relance') expect(texte, cle).not.toMatch(/relance/i);
  });

  it('REQ-JUR-062 : TÉMOIN — l’opposition vaut pour tout message et tout appel d’Axion-IA, et son lien le dit', () => {
    expect(INFORMATION_ARTICLE_14.opposition).toBe(
      'Pour vous opposer dès maintenant, un clic suffit : Axion-IA ne vous écrira plus et ne vous appellera plus, ni au sujet de cette présentation, ni pour vous présenter ses prestations, ni pour aucune autre raison commerciale.'
    );
    expect(LIEN_OPPOSITION.libelle).toBe("Ne plus recevoir aucun message ni appel d'Axion-IA");
  });
});
