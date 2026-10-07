/**
 * UX-P1-64 (exigence de Williams, #786 6039806330 ; arbitrage de la coordination, #819) — le CHÂSSIS de
 * tous les courriels de Partners, recopié du gabarit commun d'axion-ia
 * (`src/lib/email/templates/_layout.tsx`) : un bandeau terracotta, 600 px, le fond crème, le logo, la
 * carte blanche arrondie, le titre en serif, le bouton terracotta doublé de son adresse en texte, le
 * mode sombre, et le même pied légal. Un seul système visuel : si le gabarit évolue, il évolue des deux
 * côtés.
 *
 * PUR : il reçoit des textes déjà rendus, les ÉCHAPPE tous, et rend `{ html, texte }`. Aucun envoi,
 * aucune lecture de base.
 *
 * LES FAMILLES (référentiel d'axion-ia §2, arbitrage de la coordination) :
 *   — A, sécurité : le lien de connexion. Pied réduit, aucune soupape, aucune signature, aucune
 *     opposition. Le lien est SECRET : jamais recopié en clair ;
 *   — B, les tiers : le courriel à une entreprise ou à une personne déclarée. Soupape, signature
 *     courte, et le lien d'opposition, exigé ;
 *   — C, l'apporteur : les notifications de son espace. Soupape et signature courte, sans opposition
 *     commerciale, puisqu'il est sous contrat.
 *
 * LE LOGO est une image DISTANTE, admise aux six conditions de la coordination (#319 6041013643) : son
 * URL est statique, identique pour tous, sans paramètre ni identifiant ; aucun suivi (pas de pixel, de
 * redirection, ni de lien de suivi des clics : ni réseaux sociaux, ni paramètres UTM, ni bandeau
 * d'avis) ; le suivi d'ouverture et de clic du fournisseur est éteint au relais. Témoin :
 * `tests/unit/email/logo-distant.spec.ts`.
 *
 * Le pied légal lit le registre de l'entité (`src/config/entite.ts`), jamais une valeur retapée.
 */
import { CHASSIS_DES_COURRIELS as T } from '../../content/micro-copy/courriels/chassis';
import { LIEN_OPPOSITION } from '../../content/micro-copy/courriels/information-article-14';
import { echapperHtml } from '../../domain/confirmation/rendu-du-courriel';
import { entiteContractante, type Registre, registreDuDepot } from '../../config/entite';

/** Le logo d'axion-ia, servi par son site : une URL STATIQUE, la même pour tous (condition 1 et 2). */
export const LOGO_DES_COURRIELS = 'https://axion-ia.com/email/axion-ia-logo-pill.png';

export const FAMILLES_DE_COURRIEL = ['A', 'B', 'C'] as const;
export type FamilleDeCourriel = (typeof FAMILLES_DE_COURRIEL)[number];

/** Ce que chaque famille rend ; rien d'autre ne décide de ces questions. */
export const REGIME_DES_FAMILLES = {
  A: { soupape: false, signature: false, opposition: false, piedComplet: false },
  B: { soupape: true, signature: true, opposition: true, piedComplet: true },
  C: { soupape: true, signature: true, opposition: false, piedComplet: true },
} as const satisfies Record<
  FamilleDeCourriel,
  { soupape: boolean; signature: boolean; opposition: boolean; piedComplet: boolean }
>;

/** La palette du gabarit d'axion-ia, recopiée : une seule source pour tout le châssis. */
export const PALETTE_DES_COURRIELS = {
  texte: '#241d15',
  discret: '#6b6153',
  titre: '#1c150e',
  terracotta: '#c24a1b',
  terracottaProfond: '#8c3010',
  bordure: '#eee2d2',
  fond: '#f6f1e8',
  carte: '#ffffff',
  blanc: '#ffffff',
} as const;
const P = PALETTE_DES_COURRIELS;
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Le mode sombre et le petit écran, ceux du gabarit d'axion-ia. */
const STYLE = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .ax-body { background-color: #15110c !important; }
    .ax-card { background-color: #221b13 !important; border-color: #3a3025 !important; }
    .ax-muted { color: #b8ac99 !important; }
    .ax-card p, .ax-card td, .ax-card span, .ax-card strong { color: #f6efe3 !important; }
    .ax-card h1 { color: #fdf7ec !important; }
    .ax-card a { color: #f0a070 !important; }
    .ax-card a.ax-cta { color: #ffffff !important; }
  }
  @media only screen and (max-width: 600px) {
    .ax-card { padding: 24px 18px !important; border-radius: 14px !important; }
    .ax-title { font-size: 22px !important; }
  }
`;

export interface CourrielAHabiller {
  readonly famille: FamilleDeCourriel;
  /** Le pré-en-tête : il prolonge l'objet, il ne le répète pas. */
  readonly preEnTete: string;
  readonly titre: string;
  /** Les paragraphes du corps, en texte : échappés ici, un par un. */
  readonly paragraphes: readonly string[];
  /** L'appel, un seul. */
  readonly appel?: { readonly libelle: string; readonly href: string };
  /** L'adresse de l'appel est un SECRET (lien de connexion) : jamais recopiée en clair. */
  readonly appelSecret?: boolean;
  /** Famille B : l'adresse de la page d'opposition du destinataire. EXIGÉE en B. */
  readonly opposition?: string;
}

export interface CourrielHabille {
  readonly html: string;
  readonly texte: string;
}

const enLigne = (style: Record<string, string>): string =>
  Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(';');

/** Une adresse d'appel admise : https, ou mailto. Rien d'autre n'entre dans un href. */
function adresseSure(href: string): string {
  const u = new URL(href);
  if (u.protocol !== 'https:' && u.protocol !== 'mailto:')
    throw new Error(`courriel_refuse : adresse en ${u.protocol}`);
  return u.toString();
}

function piedLegal(
  famille: FamilleDeCourriel,
  registre: Registre
): { html: string; texte: string[] } {
  const e = entiteContractante(registre);
  const contact = T.adresseDeContact;
  const lignes = [
    `${e.denomination} · ${e.formeJuridique}`,
    e.siege,
    `SIREN ${e.siren} · TVA ${e.tvaIntracommunautaire}`,
  ];
  const fin =
    famille === 'A'
      ? [T.envoiAutomatique, `${T.pasALOrigine} ${contact}`]
      : [`${T.contact} ${contact}`];
  const texte = [...lignes, ...fin, `© ${e.denomination} — ${T.droits}`];
  const lien = `<a href="mailto:${echapperHtml(contact)}" style="${enLigne({ color: P.terracottaProfond, fontWeight: '600' })}">${echapperHtml(contact)}</a>`;
  const html = [
    ...lignes.map(echapperHtml),
    famille === 'A'
      ? `${echapperHtml(T.envoiAutomatique)}<br />${echapperHtml(T.pasALOrigine)} ${lien}`
      : `${echapperHtml(T.contact)} ${lien}`,
    `&copy; ${echapperHtml(e.denomination)} — ${echapperHtml(T.droits)}`,
  ].join('<br />');
  return { html, texte };
}

/** Habille un courriel dans le châssis commun ; rend le HTML et sa version en texte. */
export function habillerLeCourriel(
  c: CourrielAHabiller,
  registre: Registre = registreDuDepot()
): CourrielHabille {
  const regime = REGIME_DES_FAMILLES[c.famille];
  if (regime.opposition && c.opposition === undefined)
    throw new Error('courriel_refuse : la famille B exige son lien d’opposition');
  if (!regime.opposition && c.opposition !== undefined)
    throw new Error(`courriel_refuse : la famille ${c.famille} ne porte pas d’opposition`);
  if (c.famille === 'A' && c.appel !== undefined && c.appelSecret !== true)
    throw new Error('courriel_refuse : un lien de la famille A est secret');
  const appel = c.appel === undefined ? undefined : { ...c.appel, href: adresseSure(c.appel.href) };
  const opposition = c.opposition === undefined ? undefined : adresseSure(c.opposition);
  const pied = piedLegal(c.famille, registre);

  const paragraphe = enLigne({
    fontSize: '16px',
    lineHeight: '1.7',
    color: P.texte,
    margin: '14px 0',
  });
  const discret = enLigne({ fontSize: '14px', lineHeight: '1.6', color: P.discret });
  const corps = c.paragraphes
    .map((p) => `<p style="${paragraphe}">${echapperHtml(p)}</p>`)
    .join('');
  const bouton =
    appel === undefined
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:30px 0 8px 0"><a class="ax-cta" href="${echapperHtml(appel.href)}" style="${enLigne(
          {
            backgroundColor: P.terracotta,
            color: P.blanc,
            padding: '16px 34px',
            borderRadius: '999px',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '700',
            fontFamily: SANS,
            display: 'inline-block',
          }
        )}">${echapperHtml(appel.libelle)} &nbsp;&rarr;</a>${
          c.appelSecret === true
            ? ''
            : `<p class="ax-muted" style="${enLigne({ fontSize: '12px', lineHeight: '1.5', color: P.discret, margin: '12px 0 0 0', wordBreak: 'break-all' })}">${echapperHtml(T.repliDuBouton)}<br />${echapperHtml(appel.href)}</p>`
        }</td></tr></table>`;
  const soupape = regime.soupape
    ? `<p class="ax-muted" style="${discret};margin:22px 0 0 0;padding-top:16px;border-top:1px solid ${P.bordure}">${echapperHtml(T.soupape)}</p>`
    : '';
  const signature = regime.signature
    ? `<p style="${enLigne({ fontSize: '14px', lineHeight: '1.7', color: P.texte, margin: '24px 0 0 0', borderLeft: `3px solid ${P.terracotta}`, paddingLeft: '14px' })}"><span style="${enLigne({ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: P.titre })}">${echapperHtml(T.signatureNom)}</span><br /><span class="ax-muted" style="color:${P.discret}">${echapperHtml(T.signatureRole)}</span></p>`
    : '';
  const lienOpposition =
    opposition === undefined
      ? ''
      : `<br /><a href="${echapperHtml(opposition)}" style="color:${P.discret};text-decoration:underline">${echapperHtml(LIEN_OPPOSITION.libelle)}</a>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${echapperHtml(c.titre)}</title>
<style>${STYLE}</style>
</head>
<body class="ax-body" data-famille="${c.famille}" style="${enLigne({ backgroundColor: P.fond, fontFamily: SANS, color: P.texte, margin: '0', padding: '0 0 40px' })}">
<div style="display:none;max-height:0;overflow:hidden">${echapperHtml(c.preEnTete)}</div>
<div style="height:6px;line-height:6px;font-size:1px;background-color:${P.terracotta}">&nbsp;</div>
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">
<tr><td align="center" style="padding:26px 0 20px">
<img src="${LOGO_DES_COURRIELS}" width="210" height="115" alt="${echapperHtml(T.logoAlt)}" style="display:block;margin:0 auto;border:0" />
<p class="ax-muted" style="${enLigne({ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: P.discret, fontWeight: '700', margin: '12px 0 0 0' })}">${echapperHtml(T.accroche)}</p>
</td></tr>
<tr><td class="ax-card" style="${enLigne({ backgroundColor: P.carte, borderRadius: '20px', border: `1px solid ${P.bordure}`, padding: '32px 28px' })}">
<h1 class="ax-title" style="${enLigne({ fontFamily: SERIF, fontSize: '26px', fontWeight: '700', margin: '0 0 18px 0', color: P.titre, lineHeight: '1.2' })}">${echapperHtml(c.titre)}</h1>
${corps}${bouton}${soupape}${signature}
</td></tr>
<tr><td style="padding:26px 12px 0 12px"><p class="ax-muted" style="${enLigne({ fontSize: '12px', color: P.discret, lineHeight: '1.6', margin: '0', textAlign: 'center' })}">${pied.html}${lienOpposition}</p></td></tr>
</table>
</body>
</html>
`;

  const texte = [
    c.titre,
    '',
    ...c.paragraphes.flatMap((p) => [p, '']),
    ...(appel === undefined ? [] : [`${appel.libelle} : ${appel.href}`, '']),
    ...(regime.soupape ? [T.soupape, ''] : []),
    ...(regime.signature ? [T.signatureNom, T.signatureRole, ''] : []),
    '—',
    ...pied.texte,
    ...(opposition === undefined ? [] : [`${LIEN_OPPOSITION.libelle} : ${opposition}`]),
  ].join('\n');
  return { html, texte };
}
