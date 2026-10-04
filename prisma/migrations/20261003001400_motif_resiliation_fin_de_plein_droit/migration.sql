-- DM-64 (REQ-DM-011, contrat art. 12.5) : la fin de plein droit du contrat — décès de l'apporteur
-- personne physique, cessation de son activité ou radiation de son immatriculation — a sa valeur dans
-- le motif de résiliation. Additive : une valeur EN FIN d'enum, les trois existantes inchangées.
-- La valeur n'est utilisée nulle part dans ce fichier : un ADD VALUE ne sert qu'après sa transaction.
-- Retour arrière : un ADD VALUE ne se retire pas ; la valeur reste, et n'est plus émise.

ALTER TYPE "motif_resiliation" ADD VALUE 'fin_de_plein_droit';
