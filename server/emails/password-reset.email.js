import { renderEmailLayout } from './layout.js';
import { env } from '../config/env.js';

/**
 * Generate password reset email template.
 */
export function getPasswordResetEmail({ rawToken }) {
  const resetUrl = `${env.appUrl}/password-reset/${rawToken}`;
  const expiresHours = env.passwordResetExpiresHours;

  const subject = "Reinitialisation de votre mot de passe Silky";

  const text = [
    "Bonjour,",
    "",
    "Vous avez demande a reinitialiser votre mot de passe Silky.",
    "Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :",
    "",
    resetUrl,
    "",
    `Ce lien est valable pendant ${expiresHours} heure(s).`,
    "Si vous n'avez pas fait cette demande, ignorez cet e-mail.",
    "",
    "L'equipe Silky",
  ].join("\n");

  const contentHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Réinitialisation de mot de passe</h1>
    <p style="margin:0 0 24px;color:#5a4040;font-size:14px;line-height:1.65;">
      Vous avez demandé à réinitialiser votre mot de passe.
      Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
      <tr>
        <td style="background-color:#8D191C;border-radius:6px;">
          <a href="${resetUrl}"
             style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            Réinitialiser mon mot de passe
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#9a7a7a;font-size:13px;">Ou copiez ce lien dans votre navigateur :</p>
    <p style="margin:0 0 32px;word-break:break-all;">
      <a href="${resetUrl}" style="color:#8D191C;font-size:13px;">${resetUrl}</a>
    </p>
    <p style="margin:0;color:#b0a0a0;font-size:12px;line-height:1.5;">
      Ce lien expire dans <strong>${expiresHours} heure(s)</strong>.
      Si vous n'avez pas fait cette demande, ignorez cet e-mail.
    </p>
  `;

  const html = renderEmailLayout({
    title: subject,
    contentHtml,
    previewText: "Réinitialisez votre mot de passe Silky.",
  });

  return { subject, html, text };
}
