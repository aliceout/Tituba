// Templates HTML + texte pour les mails transactionnels du système d'auth.
//
// Style sobre, monochrome (accent violet du Carnet), sans images ni
// tracking. Le HTML est lisible aussi en plain-text (table-less, pas
// de CSS critique). Tous les wordings en français.
//
// Le nom du site (wordmark) qui apparaît dans le sujet, le header HTML
// et la signature est lu depuis Site → identity.siteName via le helper
// `getSiteName()`. Fallback : « Carnet ».

import type { Payload } from 'payload';

import { AUTH_CONFIG } from './config';

/**
 * Lit le wordmark depuis le global Identity (siteName). Best-effort :
 * si la lecture échoue (DB down, global vide), on retombe sur « Carnet ».
 * À utiliser par les endpoints qui envoient un mail.
 */
export async function getSiteName(payload: Payload): Promise<string> {
  try {
    const identity = await payload.findGlobal({ slug: 'identity' });
    const name = (identity as { siteName?: string })?.siteName;
    return name?.trim() || 'Carnet';
  } catch {
    return 'Carnet';
  }
}

const ACCENT = '#5a3a7a';
const TEXT = '#1a1d28';
const MUTED = '#5e6373';
const BG = '#fdfcf8';
const RULE = '#d6d3c8';

function shell(title: string, siteName: string, bodyHtml: string): string {
  // `title` peut être vide : le template appelant a alors le contrôle
  // total sur le titre / la structure (newPostEmail le fait pour
  // afficher un kicker + h2 cliquable + byline avant le corps).
  const titleHtml = title
    ? `<h1 style="margin:0 0 24px;font-size:22px;color:${TEXT};font-weight:600;line-height:1.25;">${escapeHtml(title)}</h1>`
    : '';
  // Wordmark plus grand et en serif pour matcher le branding du
  // header du site (Source Serif 22px) ; les clients mail ne chargent
  // pas @fontsource donc fallback Georgia.
  const wordmark = `<p style="margin:0 0 24px;font-family:Georgia,'Source Serif 4',serif;font-size:22px;font-weight:600;color:${TEXT};letter-spacing:-0.3px;">${escapeHtml(siteName)}<span style="color:${ACCENT};">.</span></p>`;
  // Titre du document HTML — important pour les clients mail qui
  // l'affichent (subject preview, accessibilité). Fallback siteName
  // si pas de title fourni.
  const docTitle = title || siteName;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(docTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${RULE};padding:32px;text-align:left;">
        <tr><td>
          ${wordmark}
          ${titleHtml}
          ${bodyHtml}
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:12px;color:${MUTED};">Mail automatique. Ne pas y répondre.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:12px 24px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Invitation ─────────────────────────────────────────────────────

export function invitationEmail(opts: {
  inviteeEmail: string;
  inviterName?: string | null;
  acceptUrl: string;
  siteName?: string;
}): { subject: string; html: string; text: string } {
  const days = AUTH_CONFIG.invitationTtlDays;
  const siteName = opts.siteName?.trim() || 'Carnet';
  const inviter = opts.inviterName?.trim() || `L'équipe du ${siteName}`;
  const subject = `Invitation à rejoindre l'espace d'administration du ${siteName}`;

  const text = `Bonjour,

${inviter} vous invite à rejoindre l'espace d'administration du ${siteName}.

Pour activer votre compte (${opts.inviteeEmail}) et choisir votre mot de passe, cliquez sur le lien ci-dessous. Il est valable ${days} jours.

${opts.acceptUrl}

Si vous ne vous attendiez pas à recevoir ce mail, vous pouvez l'ignorer — le compte sera supprimé automatiquement à l'expiration du lien.

— ${siteName}
`;

  const html = shell(
    'Vous avez été invité·e à rejoindre l\'espace d\'administration',
    siteName,
    `<p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(inviter)} vous invite à rejoindre l'espace d'administration du <strong>${escapeHtml(siteName)}</strong>.</p>
<p style="margin:0 0 16px;line-height:1.5;">Pour activer votre compte (<strong>${escapeHtml(opts.inviteeEmail)}</strong>) et choisir votre mot de passe, cliquez sur le bouton ci-dessous.</p>
${button(opts.acceptUrl, 'Activer mon compte')}
<p style="margin:0 0 16px;font-size:14px;color:${MUTED};line-height:1.5;">Ce lien est valable <strong>${days} jours</strong>. Passé ce délai, le compte sera supprimé automatiquement.</p>
<p style="margin:24px 0 0;font-size:13px;color:${MUTED};line-height:1.5;">Si vous ne vous attendiez pas à ce mail, ignorez-le simplement. Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${escapeHtml(opts.acceptUrl)}</span></p>`,
  );

  return { subject, html, text };
}

// ─── OTP email (2FA) ────────────────────────────────────────────────

export function twoFactorCodeEmail(opts: {
  code: string;
  ip?: string;
  userAgent?: string;
  siteName?: string;
}): { subject: string; html: string; text: string } {
  const ttl = AUTH_CONFIG.otpTtlMinutes;
  const siteName = opts.siteName?.trim() || 'Carnet';
  const subject = `Code de vérification : ${opts.code}`;

  const ipLine = opts.ip ? `IP : ${opts.ip}\n` : '';
  const uaLine = opts.userAgent ? `Navigateur : ${opts.userAgent}\n` : '';

  const text = `Votre code de vérification :

  ${opts.code}

Valable ${ttl} minutes. À saisir dans la fenêtre de connexion.

${ipLine}${uaLine}
Si ce n'est pas vous qui essayez de vous connecter, changez votre mot de passe immédiatement.
`;

  const html = shell(
    'Votre code de vérification',
    siteName,
    `<p style="margin:0 0 16px;line-height:1.5;">Saisissez ce code pour finaliser votre connexion :</p>
<p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:${BG};border:1px solid ${RULE};padding:16px;color:${TEXT};font-family:'JetBrains Mono','Menlo',monospace;">${escapeHtml(opts.code)}</p>
<p style="margin:0 0 16px;font-size:14px;color:${MUTED};line-height:1.5;">Valable <strong>${ttl} minutes</strong>.</p>
${
  opts.ip || opts.userAgent
    ? `<p style="margin:16px 0 0;font-size:13px;color:${MUTED};line-height:1.5;">Tentative depuis :${opts.ip ? `<br>IP : ${escapeHtml(opts.ip)}` : ''}${opts.userAgent ? `<br>Navigateur : ${escapeHtml(opts.userAgent)}` : ''}</p>`
    : ''
}
<p style="margin:16px 0 0;font-size:13px;color:${MUTED};line-height:1.5;">Si ce n'est pas vous qui essayez de vous connecter, changez immédiatement votre mot de passe.</p>`,
  );

  return { subject, html, text };
}

// ─── Confirmation d'abonnement (double opt-in alertes mail) ─────────

export function subscribeConfirmEmail(opts: {
  email: string;
  confirmUrl: string;
  ttlDays: number;
  siteName?: string;
}): { subject: string; html: string; text: string } {
  const siteName = opts.siteName?.trim() || 'Carnet';
  const subject = `Confirmer votre abonnement au ${siteName}`;

  const text = `Bonjour,

Vous recevez ce mail parce qu'une demande d'inscription aux alertes
mail du ${siteName} a été faite avec cette adresse (${opts.email}).

Pour confirmer votre inscription, cliquez sur le lien ci-dessous. Il
est valable ${opts.ttlDays} jours.

${opts.confirmUrl}

Si ce n'est pas vous, ignorez ce mail — aucune adresse n'est ajoutée
sans confirmation.

— ${siteName}
`;

  const html = shell(
    'Confirmer votre abonnement',
    siteName,
    `<p style="margin:0 0 16px;line-height:1.5;">Vous recevez ce mail parce qu'une demande d'inscription aux alertes mail du <strong>${escapeHtml(siteName)}</strong> a été faite avec cette adresse (<strong>${escapeHtml(opts.email)}</strong>).</p>
<p style="margin:0 0 16px;line-height:1.5;">Pour confirmer votre inscription, cliquez sur le bouton ci-dessous.</p>
${button(opts.confirmUrl, 'Confirmer mon abonnement')}
<p style="margin:0 0 16px;font-size:14px;color:${MUTED};line-height:1.5;">Ce lien est valable <strong>${opts.ttlDays} jours</strong>.</p>
<p style="margin:24px 0 0;font-size:13px;color:${MUTED};line-height:1.5;">Si ce n'est pas vous, ignorez simplement ce mail — aucune adresse n'est ajoutée sans confirmation.<br>Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${escapeHtml(opts.confirmUrl)}</span></p>`,
  );

  return { subject, html, text };
}

// ─── Alerte nouveau billet (envoyée aux abonné·es) ──────────────────

export function newPostEmail(opts: {
  siteName?: string;
  postTitle: string;
  postLede?: string | null;
  postUrl: string;
  unsubUrl: string;
  /** Byline déjà formatée — ex. « par Marie Dupont et Aïcha Touré ». */
  byline?: string | null;
  /** Libellé humain du type — ex. « Note de lecture ». */
  typeLabel?: string | null;
  /** Noms des thèmes (déjà résolus côté caller). */
  themeNames?: string[];
}): { subject: string; html: string; text: string } {
  const siteName = opts.siteName?.trim() || 'Carnet';
  const lede = opts.postLede?.trim() || '';
  const byline = opts.byline?.trim() || '';
  const typeLabel = opts.typeLabel?.trim() || '';
  const themes = (opts.themeNames ?? []).filter((t) => t.trim()).map((t) => t.trim());
  const subject = `[${siteName}] ${opts.postTitle}`;

  // Métadonnées « Note de lecture · #féminisme · #droits humains »
  const metaPieces: string[] = [];
  if (typeLabel) metaPieces.push(typeLabel);
  for (const t of themes) metaPieces.push(`#${t}`);
  const metaLine = metaPieces.join(' · ');

  const text = `Un nouveau billet vient de paraître sur le ${siteName}.

${opts.postTitle}
${byline ? `\n${byline}\n` : ''}${metaLine ? `\n${metaLine}\n` : ''}${lede ? `\n${lede}\n` : ''}
Lire en ligne :
${opts.postUrl}

— ${siteName}

—
Pour vous désabonner de ces alertes en un clic :
${opts.unsubUrl}
`;

  // Pas de title dans shell : on a notre propre structure (kicker +
  // titre cliquable + byline + meta + lede + bouton).
  const html = shell(
    '',
    siteName,
    `<p style="margin:0 0 12px;font-size:12px;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;">Un nouveau billet vient de paraître</p>
<h2 style="margin:0 0 12px;font-size:24px;font-weight:600;line-height:1.2;color:${TEXT};">
  <a href="${escapeHtml(opts.postUrl)}" style="color:${TEXT};text-decoration:none;">${escapeHtml(opts.postTitle)}</a>
</h2>
${byline ? `<p style="margin:0 0 12px;font-style:italic;color:${MUTED};font-size:14px;line-height:1.5;">${escapeHtml(byline)}</p>` : ''}
${metaLine ? `<p style="margin:0 0 20px;font-size:12px;color:${MUTED};letter-spacing:0.04em;">${escapeHtml(metaLine)}</p>` : ''}
${lede ? `<p style="margin:0 0 24px;line-height:1.55;color:${TEXT};font-size:15px;">${escapeHtml(lede)}</p>` : ''}
${button(opts.postUrl, 'Lire en ligne')}
<p style="margin:32px 0 0;padding-top:20px;border-top:1px solid ${RULE};font-size:12px;color:${MUTED};line-height:1.5;">
  Vous recevez ce mail parce que vous êtes abonné·e aux alertes du
  ${escapeHtml(siteName)}.
  <a href="${escapeHtml(opts.unsubUrl)}" style="color:${MUTED};text-decoration:underline;">
    Se désabonner en un clic
  </a>.
</p>`,
  );

  return { subject, html, text };
}

// ─── Bienvenue (post-activation) ────────────────────────────────────

export function welcomeEmail(opts: {
  email: string;
  loginUrl: string;
  siteName?: string;
}): { subject: string; html: string; text: string } {
  const siteName = opts.siteName?.trim() || 'Carnet';
  const subject = `Bienvenue sur l'espace d'administration du ${siteName}`;

  const text = `Bonjour,

Votre compte ${opts.email} est maintenant actif.

Vous pouvez vous connecter à l'espace d'administration ici :
${opts.loginUrl}

— ${siteName}
`;

  const html = shell(
    'Bienvenue ! Votre compte est actif',
    siteName,
    `<p style="margin:0 0 16px;line-height:1.5;">Votre compte <strong>${escapeHtml(opts.email)}</strong> est maintenant actif.</p>
${button(opts.loginUrl, 'Aller à l\'espace d\'administration')}`,
  );

  return { subject, html, text };
}
