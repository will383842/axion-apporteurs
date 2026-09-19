/**
 * Bac du témoin à deux faces de QA-T08 (REQ-QA-024) : un PROCESSUS qui construit un journal et y
 * écrit l'objet piégé reçu sur stdin. Sa SORTIE RÉELLE est ce que la spec confronte aux valeurs.
 *
 * Le bac ne connaît aucune valeur : la spec les possède et les envoie en JSON. Une `Error` ne
 * traverse pas JSON — la spec envoie son message, le bac la reconstruit.
 *
 *   node --import tsx journal-redige.bac.ts <face>     face = nu | chemins | depot
 *
 *   nu      : `pino()` sans aucune option — la face qui DOIT fuir ;
 *   chemins : `pino({ redact })` sur chaque segment protégé, à la racine et un niveau plus bas —
 *             la rédaction par CHEMINS que le brief écarte (T1) ;
 *   depot   : le journal du dépôt, `creerJournal()`.
 */
import pino from 'pino';
import { creerJournal } from '../../../src/lib/logger';

type Charge = {
  msg: string;
  objet: Record<string, unknown>;
  messageErreur: string;
  segments: string[];
};

let brut = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c: string) => (brut += c));
process.stdin.on('end', () => {
  const charge: Charge = JSON.parse(brut);
  const donnees = { ...charge.objet, err: new Error(charge.messageErreur) };
  const face = process.argv[2];
  if (face === 'nu') {
    pino().error(donnees, charge.msg);
  } else if (face === 'chemins') {
    const chemins = charge.segments.flatMap((s) => [s, `*.${s}`]);
    pino({ redact: chemins }).error(donnees, charge.msg);
  } else if (face === 'depot') {
    creerJournal().error(charge.msg, donnees);
  } else {
    process.stderr.write(`face inconnue : ${String(face)}\n`);
    process.exit(2);
  }
});
