// Configuration du transport email pour Payload (auth + 2FA + invitations).
//
// Réutilise les vars SMTP_* déjà présentes dans .env (Infomaniak en prod,
// Mailpit en dev local). Si la config SMTP est incomplète, on log un
// warning et on installe un transport "log-only" qui imprime les mails
// sur stdout — ça évite de casser le boot du CMS si le déploiement
// n'a pas encore les secrets.

import { nodemailerAdapter } from '@payloadcms/email-nodemailer';
import nodemailer from 'nodemailer';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.length > 0 ? v : null;
}

export function buildEmailAdapter() {
  const SMTP_HOST = getEnv('SMTP_HOST');
  const SMTP_USER = getEnv('SMTP_USER');
  const SMTP_PASS = getEnv('SMTP_PASS');
  const SMTP_FROM = getEnv('SMTP_FROM');
  const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const SMTP_SECURE = (process.env.SMTP_SECURE ?? 'false') === 'true';
  const FROM_NAME = getEnv('SMTP_FROM_NAME') ?? 'Carnet';

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].filter(
      (k) => !process.env[k],
    );
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'payload_email_degraded',
        message: 'Transport SMTP non configuré, mails imprimés sur stdout.',
        missing,
      }),
    );
    return nodemailerAdapter({
      defaultFromAddress: 'noreply@localhost',
      defaultFromName: FROM_NAME,
      transport: nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      }),
    });
  }

  return nodemailerAdapter({
    defaultFromAddress: SMTP_FROM,
    defaultFromName: FROM_NAME,
    transportOptions: {
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    },
  });
}
