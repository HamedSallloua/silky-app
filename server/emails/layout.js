/**
 * Base HTML email layout for Silky emails.
 * Wraps content in consistent Silky header, card container, typography, and footer.
 *
 * Visual reference: Signup / Welcome email template.
 * – Outer background : #ffffff (white)
 * – Card             : #ffffff, border-radius 12px, soft shadow
 * – Header           : #F3EBEC (pale rose), centered Silky logo via CID inline attachment
 * – Body padding     : 40px 40px
 * – Footer           : plain, light grey text, no tagline
 * – Primary button   : #8D191C (burgundy), border-radius 6px, white text
 *
 * The logo is referenced as cid:silky-logo.
 * The actual file attachment is added once in email.service.js → sendEmail(),
 * so all branded emails automatically include the inline image.
 */
export function renderEmailLayout({ title, contentHtml, previewText = '' }) {
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(title || 'Silky')}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Georgia,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${previewText ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(141,25,28,0.08);border-collapse:separate;">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color:#F3EBEC;padding:28px 24px;text-align:center;">
              <img src="cid:silky-logo" alt="Silky" width="120" style="display:block;margin:0 auto;width:120px;max-width:120px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding:40px 40px 32px;color:#2d2d2d;font-size:15px;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#ffffff;padding:20px 40px;text-align:center;border-top:1px solid #f0e8e8;">
              <p style="margin:0;color:#b0a0a0;font-size:12px;line-height:1.4;">© ${currentYear} Silky · Tous droits réservés.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}