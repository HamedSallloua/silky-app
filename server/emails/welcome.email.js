import { renderEmailLayout, escapeHtml } from './layout.js';
import { env } from '../config/env.js';

/**
 * Generate welcome email template.
 * @param {Object} params
 * @param {string} params.name - User's full name.
 */
export function getWelcomeEmail({ name }) {
  const recipientName = name ? name.trim() : '';
  const greeting = recipientName ? `Bonjour ${escapeHtml(recipientName)},` : 'Bonjour,';
  const appUrl = env.appUrl || 'https://silky.tn';

  const subject = 'Bienvenue sur Silky';

  const text = [
    greeting,
    '',
    'Bienvenue sur Silky.',
    'Votre compte a été créé avec succès.',
    '',
    'Vous pouvez dès maintenant parcourir notre collection et passer vos commandes en toute simplicité.',
    '',
    `Accéder à la boutique : ${appUrl}`,
    '',
    'À bientôt,',
    "L'équipe Silky",
  ].join('\n');

  const contentHtml = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Bienvenue chez Silky !</h1>
    <p style="margin:0 0 18px;color:#3d2b2b;font-size:15px;line-height:1.65;">
      ${greeting}
    </p>
    <p style="margin:0 0 18px;color:#3d2b2b;font-size:15px;line-height:1.65;">
      Bienvenue sur Silky. Votre compte a été créé avec succès.
    </p>
    <p style="margin:0 0 28px;color:#5a4040;font-size:14px;line-height:1.65;">
      Vous pouvez désormais suivre vos commandes en temps réel, gérer vos adresses de livraison et découvrir nos dernières collections exclusives.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
      <tr>
        <td style="background-color:#8D191C;border-radius:6px;">
          <a href="${escapeHtml(appUrl)}"
             style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            Découvrir nos offres
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#5a4040;font-size:14px;line-height:1.65;">
      À bientôt,<br />
      <strong>L'équipe Silky</strong>
    </p>
  `;

  const html = renderEmailLayout({
    title: subject,
    contentHtml,
    previewText: 'Bienvenue sur Silky — Votre compte a été créé avec succès.',
  });

  return { subject, html, text };
}
