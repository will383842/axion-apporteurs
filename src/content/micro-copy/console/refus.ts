/**
 * Les messages des refus de la console, par CODE de refus du serveur (SEC-51, REQ-SEC-042). Un refus
 * nommé côté serveur s'affiche ici par un message GÉNÉRIQUE : ni l'apporteur, ni la cause, ni la date
 * de fin. Un rôle qui doit voir la date pour son métier la lit sur la fiche, selon la matrice des
 * droits, jamais dans le détail d'un refus. Lu par Axion-IA seul : `gov:lexique` le juge à la portée
 * du dépôt.
 */
export const REFUS_DE_LA_CONSOLE = {
  entreprise_reservee: 'Entreprise indisponible pour une prise de contact commerciale',
} as const satisfies Readonly<Record<string, string>>;

export type CodeDeRefusDeLaConsole = keyof typeof REFUS_DE_LA_CONSOLE;
