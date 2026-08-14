import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let _transporter = null;

/**
 * Build (and cache) a nodemailer transporter.
 * - When SMTP credentials are set: uses real SMTP.
 * - Without credentials: falls back to Ethereal (fake SMTP) and logs a preview URL.
 */
async function getTransporter() {
  if (_transporter) return _transporter;

  if (env.smtpUser && env.smtpPass) {
    _transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log("[email] No SMTP credentials found — using Ethereal test account.");
    console.log(`[email] Ethereal inbox: https://ethereal.email/login`);
    console.log(`[email] User: ${testAccount.user}  Pass: ${testAccount.pass}`);
  }

  return _transporter;
}

/**
 * Send a password-reset email.
 * @param {string} to       - Recipient email address.
 * @param {string} rawToken - The raw (unhashed) reset token.
 */
export async function sendPasswordResetEmail(to, rawToken) {
  const resetUrl = `${env.appUrl}/password-reset/${rawToken}`;
  const expiresHours = env.passwordResetExpiresHours;

  const transport = await getTransporter();

  const info = await transport.sendMail({
    from: env.emailFrom,
    to,
    subject: "Reinitialisation de votre mot de passe Silky",
    text: [
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
    ].join("\n"),
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reinitialisation du mot de passe</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#1a1a1a;padding:32px;text-align:center;">
            <span style="color:#ffffff;font-size:26px;font-weight:700;letter-spacing:4px;">SILKY</span>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">Reinitialisation de mot de passe</h1>
            <p style="margin:0 0 24px;color:#555;line-height:1.6;">
              Vous avez demande a reinitialiser votre mot de passe.
              Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
              <tr>
                <td style="background:#1a1a1a;border-radius:4px;">
                  <a href="${resetUrl}"
                     style="display:inline-block;padding:14px 32px;color:#ffffff;
                            text-decoration:none;font-size:15px;font-weight:600;">
                    Reinitialiser mon mot de passe
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;color:#888;font-size:13px;">Ou copiez ce lien dans votre navigateur :</p>
            <p style="margin:0 0 32px;word-break:break-all;">
              <a href="${resetUrl}" style="color:#1a1a1a;font-size:13px;">${resetUrl}</a>
            </p>
            <p style="margin:0;color:#aaa;font-size:12px;line-height:1.5;">
              Ce lien expire dans <strong>${expiresHours} heure(s)</strong>.
              Si vous n'avez pas fait cette demande, ignorez cet e-mail.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:20px 48px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;color:#bbb;font-size:11px;">&copy; ${new Date().getFullYear()} Silky. Tous droits reserves.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log(`[email] Preview URL: ${preview}`);
  } else {
    console.log(`[email] Password-reset email sent to ${to} (messageId: ${info.messageId})`);
  }
}
