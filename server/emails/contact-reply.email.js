import { renderEmailLayout, escapeHtml } from './layout.js';

/**
 * Generate contact reply email template.
 * @param {Object} params
 * @param {string} params.recipientName - Name of the customer who sent the contact message.
 * @param {string} params.subject - Email subject.
 * @param {string} params.message - Reply message body from admin.
 */
export function getContactReplyEmail({ recipientName, subject, message }) {
  const cleanSubject = (subject || 'Réponse à votre message — Silky').trim();
  const cleanName = recipientName ? recipientName.trim() : '';
  const greeting = cleanName ? `Bonjour ${escapeHtml(cleanName)},` : 'Bonjour,';
  const textGreeting = cleanName ? `Bonjour ${cleanName},` : 'Bonjour,';

  const text = [
    textGreeting,
    '',
    'Merci de nous avoir contactés.',
    '',
    message.trim(),
    '',
    'Pour toute question supplémentaire, vous pouvez répondre directement à cet e-mail ou nous contacter via notre site.',
    '',
    'Cordialement,',
    "L'équipe Silky",
  ].join('\n');

  // Convert line breaks in message to HTML safely
  const formattedMessage = escapeHtml(message.trim()).replace(/\n/g, '<br />');

  const contentHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Réponse à votre message</h1>
    <p style="margin:0 0 16px;color:#3d2b2b;font-size:15px;line-height:1.65;">
      ${greeting}
    </p>
    <p style="margin:0 0 20px;color:#5a4040;font-size:14px;line-height:1.65;">
      Merci d'avoir contacté le service client Silky. Voici notre réponse à votre demande :
    </p>
    <div style="background-color:#ffffff;border:1px solid #f0dede;border-left:4px solid #8D191C;border-radius:4px;padding:18px 20px;margin:0 0 24px;color:#3d2b2b;font-size:14px;line-height:1.7;">
      ${formattedMessage}
    </div>
    <p style="margin:0 0 20px;color:#9a7a7a;font-size:13px;line-height:1.5;">
      Si vous avez d'autres questions ou besoin d'assistance complémentaire, nous restons à votre entière disposition.
    </p>
    <p style="margin:0;color:#5a4040;font-size:14px;line-height:1.65;">
      Cordialement,<br />
      <strong>L'équipe Silky</strong>
    </p>
  `;

  const html = renderEmailLayout({
    title: cleanSubject,
    contentHtml,
    previewText: `Réponse de l'équipe Silky : ${message.trim().slice(0, 100)}`,
  });

  return { subject: cleanSubject, html, text };
}
