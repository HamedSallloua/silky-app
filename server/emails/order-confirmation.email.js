import { renderEmailLayout, escapeHtml } from './layout.js';

function formatPriceTND(amount) {
  return (
    (Number(amount) || 0).toLocaleString('fr-FR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }) + ' TND'
  );
}

/**
 * Generate order confirmation & invoice email template.
 * @param {Object} order - Fully populated, persisted server-side order object.
 */
export function getOrderConfirmationEmail(order) {
  const orderNumber = order.orderNumber || `ORD-${order.id}`;
  const subject = `Confirmation de votre commande ${orderNumber} — Silky`;

  const customerName = (
    order.customer?.name ||
    [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') ||
    order.customerName ||
    'Client'
  ).trim();

  const customerEmail = (order.customer?.email || order.customerEmail || '').trim();
  const customerPhone = (order.customer?.phone || order.customerPhone || '').trim();
  const shippingAddress = (order.customer?.address || order.shippingAddress || '').trim();

  const createdAtDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const formattedDate = createdAtDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = Number(order.subtotal) || 0;
  const deliveryFee = Number(order.deliveryFee) || 0;
  const total = Number(order.total !== undefined ? order.total : order.totalAmount) || (subtotal + deliveryFee);

  // Build Plain Text version
  const textItemLines = items.map((item) => {
    const title = item.name || item.productTitle || 'Article';
    const variant = item.variantLabel || item.details ? ` (${item.variantLabel || item.details})` : '';
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.price !== undefined ? item.price : item.unitPrice) || 0;
    const lineTotal = unitPrice * qty;
    return `  - ${title}${variant} x${qty} : ${formatPriceTND(lineTotal)} (${formatPriceTND(unitPrice)} / unité)`;
  });

  const text = [
    `Bonjour ${customerName},`,
    '',
    `Nous vous remercions pour votre commande sur Silky !`,
    `Votre commande n° ${orderNumber} a été enregistrée avec succès le ${formattedDate}.`,
    '',
    '--- RÉCAPITULATIF DE LA COMMANDE ---',
    ...textItemLines,
    '',
    `Sous-total : ${formatPriceTND(subtotal)}`,
    `Frais de livraison : ${formatPriceTND(deliveryFee)}`,
    `TOTAL : ${formatPriceTND(total)}`,
    '',
    '--- ADRESSE DE LIVRAISON ---',
    `Nom : ${customerName}`,
    customerPhone ? `Téléphone : ${customerPhone}` : null,
    customerEmail ? `E-mail : ${customerEmail}` : null,
    `Adresse : ${shippingAddress}`,
    '',
    'Nous préparons votre colis avec le plus grand soin. Vous serez informé(e) lors de son expédition.',
    '',
    'Cordialement,',
    "L'équipe Silky",
  ].filter(Boolean).join('\n');

  // Build HTML table rows for items
  const itemRowsHtml = items.map((item) => {
    const title = escapeHtml(item.name || item.productTitle || 'Article');
    const variant = item.variantLabel || item.details
      ? `<div style="font-size:12px;color:#9a7a7a;margin-top:2px;">${escapeHtml(item.variantLabel || item.details)}</div>`
      : '';
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.price !== undefined ? item.price : item.unitPrice) || 0;
    const lineTotal = unitPrice * qty;

    return `
      <tr style="border-bottom:1px solid #f5eaea;">
        <td style="padding:12px 8px 12px 0;vertical-align:top;">
          <strong style="color:#1a0a0a;font-size:14px;">${title}</strong>
          ${variant}
        </td>
        <td style="padding:12px 8px;text-align:center;color:#5a4040;font-size:13px;vertical-align:top;">
          ${qty}
        </td>
        <td style="padding:12px 8px;text-align:right;color:#5a4040;font-size:13px;vertical-align:top;white-space:nowrap;">
          ${escapeHtml(formatPriceTND(unitPrice))}
        </td>
        <td style="padding:12px 0 12px 8px;text-align:right;color:#1a0a0a;font-weight:600;font-size:14px;vertical-align:top;white-space:nowrap;">
          ${escapeHtml(formatPriceTND(lineTotal))}
        </td>
      </tr>
    `;
  }).join('');

  const contentHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Merci pour votre commande !</h1>
    <p style="margin:0 0 16px;color:#3d2b2b;font-size:15px;line-height:1.65;">
      Bonjour <strong>${escapeHtml(customerName)}</strong>,
    </p>
    <p style="margin:0 0 24px;color:#5a4040;font-size:14px;line-height:1.65;">
      Votre commande a été enregistrée avec succès. Voici le récapitulatif détaillé et votre facture :
    </p>

    <!-- Order Metadata Box -->
    <div style="background-color:#fdf5f5;border:1px solid #f0dede;border-radius:8px;padding:16px 20px;margin:0 0 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;line-height:1.6;color:#3d2b2b;">
        <tr>
          <td style="padding-bottom:6px;width:50%;">
            <span style="color:#9a7a7a;font-weight:500;">Numéro de commande :</span><br />
            <strong style="color:#1a0a0a;font-size:14px;">${escapeHtml(orderNumber)}</strong>
          </td>
          <td style="padding-bottom:6px;width:50%;">
            <span style="color:#9a7a7a;font-weight:500;">Date de commande :</span><br />
            <strong style="color:#1a0a0a;font-size:14px;">${escapeHtml(formattedDate)}</strong>
          </td>
        </tr>
      </table>
    </div>

    <!-- Items Table -->
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1a0a0a;border-bottom:2px solid #8D191C;padding-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">
      Articles commandés
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid #f0dede;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#9a7a7a;">
          <th align="left" style="padding:8px 8px 8px 0;font-weight:600;">Article</th>
          <th align="center" style="padding:8px;font-weight:600;width:50px;">Qté</th>
          <th align="right" style="padding:8px;font-weight:600;width:90px;">Prix unit.</th>
          <th align="right" style="padding:8px 0 8px 8px;font-weight:600;width:100px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml}
      </tbody>
    </table>

    <!-- Totals Table -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
      <tr>
        <td style="width:50%;"></td>
        <td style="width:50%;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.8;">
            <tr>
              <td style="color:#9a7a7a;padding:4px 0;">Sous-total :</td>
              <td style="text-align:right;color:#3d2b2b;font-weight:500;padding:4px 0;">
                ${escapeHtml(formatPriceTND(subtotal))}
              </td>
            </tr>
            <tr>
              <td style="color:#9a7a7a;padding:4px 0;">Frais de livraison :</td>
              <td style="text-align:right;color:#3d2b2b;font-weight:500;padding:4px 0;">
                ${escapeHtml(formatPriceTND(deliveryFee))}
              </td>
            </tr>
            <tr style="border-top:2px solid #8D191C;">
              <td style="font-weight:700;color:#1a0a0a;font-size:16px;padding:10px 0 4px 0;">Total TTC :</td>
              <td style="text-align:right;font-weight:700;color:#8D191C;font-size:17px;padding:10px 0 4px 0;">
                ${escapeHtml(formatPriceTND(total))}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Shipping Address Box -->
    <div style="background-color:#fdf5f5;border:1px solid #f0dede;border-radius:8px;padding:18px 20px;margin:0 0 28px;">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:700;color:#8D191C;text-transform:uppercase;letter-spacing:0.5px;">
        Adresse de livraison
      </h3>
      <p style="margin:0;color:#3d2b2b;font-size:14px;line-height:1.65;">
        <strong>${escapeHtml(customerName)}</strong><br />
        ${customerPhone ? `Tél : ${escapeHtml(customerPhone)}<br />` : ''}
        ${customerEmail ? `E-mail : ${escapeHtml(customerEmail)}<br />` : ''}
        ${escapeHtml(shippingAddress).replace(/\n/g, '<br />')}
      </p>
    </div>

    <p style="margin:0 0 20px;color:#9a7a7a;font-size:13px;line-height:1.5;">
      Notre équipe prépare votre commande avec soin. Vous recevrez une notification lorsque votre colis sera pris en charge par le transporteur.
    </p>
    <p style="margin:0;color:#5a4040;font-size:14px;line-height:1.65;">
      À bientôt,<br />
      <strong>L'équipe Silky</strong>
    </p>
  `;

  const html = renderEmailLayout({
    title: subject,
    contentHtml,
    previewText: `Confirmation de votre commande ${orderNumber} d'un montant de ${formatPriceTND(total)}`,
  });

  return { subject, html, text };
}
