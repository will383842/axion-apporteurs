/**
 * `/console/vos-donnees` — « Vos données dans la console » (JUR-T61, REQ-JUR-068). PUBLIQUE : lue
 * AVANT toute connexion, dans un groupe propre (ni `(console)`, qui exige une session, ni
 * `(connexion-console)`, qui ne porte que la connexion).
 *
 * La page LIT le registre de l'article 30 à chaque affichage : une valeur changée au registre change
 * la page sans toucher la page. Elle n'écrit aucune durée ni aucun prestataire. Elle n'est liée depuis
 * la connexion qu'à sa publication, sans aucun passage en cours de rédaction.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extrairePolitiqueConsole } from '../../../../domain/rgpd/politique-console';
import { CHEMIN_DU_REGISTRE } from '../../../../server/rgpd/acceptation';
import { EcranErreurVosDonneesConsole, EcranVosDonneesConsole } from './ecran';

// Lue à chaque requête : le registre fait foi au moment de l'affichage.
export const dynamic = 'force-dynamic';

export default function PageVosDonneesConsole() {
  let registre: string;
  try {
    registre = readFileSync(join(process.cwd(), CHEMIN_DU_REGISTRE), 'utf8');
  } catch {
    return <EcranErreurVosDonneesConsole />;
  }
  const lue = extrairePolitiqueConsole(registre);
  if (!lue.ok) return <EcranErreurVosDonneesConsole />;
  return <EcranVosDonneesConsole politique={lue.politique} />;
}
