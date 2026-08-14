import { jsPDF } from 'jspdf';

const formatPrice = (amount) =>
  (Number(amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';

export function generateOrdersPdf(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return false;

  const doc = new jsPDF();
  const margin = 20;

  orders.forEach((order, index) => {
    if (index > 0) {
      doc.addPage();
    }

    let y = margin;

    doc.setFontSize(20);
    doc.setTextColor(141, 25, 28);
    doc.setFont(undefined, 'normal');
    doc.text('Silky', margin, y);
    y += 10;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Commande ${order.orderNumber || ''}`, margin, y);
    y += 6;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString('fr-FR') : '';
    doc.text(`Date: ${dateStr}`, margin, y);
    y += 12;

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('Client', margin, y);
    y += 6;

    doc.setFontSize(10);
    const customer = order.customer || {};
    const firstName = customer.firstName || customer.name || '';
    const lastName = customer.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Client';

    doc.text(fullName, margin, y);
    y += 5;
    if (customer.email) {
      doc.text(customer.email, margin, y);
      y += 5;
    }
    if (customer.phone) {
      doc.text(customer.phone, margin, y);
      y += 5;
    }
    const addressLines = doc.splitTextToSize(customer.address || '', 170);
    doc.text(addressLines, margin, y);
    y += addressLines.length * 5 + 8;

    doc.setFontSize(11);
    doc.text('Articles', margin, y);
    y += 7;

    doc.setFontSize(9);
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item) => {
      const detailsStr = item.details || item.variantLabel ? ` (${item.details || item.variantLabel})` : '';
      const itemPrice = Number(item.price || item.unitPrice || 0);
      const line = `${item.name || item.productTitle}${detailsStr} x${item.quantity} — ${formatPrice(itemPrice * item.quantity)}`;
      const lines = doc.splitTextToSize(line, 170);
      doc.text(lines, margin, y);
      y += lines.length * 4 + 2;
      if (y > 260) {
        doc.addPage();
        y = margin;
      }
    });

    y += 6;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, 190, y);
    y += 8;

    doc.setFontSize(10);
    doc.text(`Sous-total: ${formatPrice(order.subtotal)}`, margin, y);
    y += 5;
    doc.text(`Livraison: ${formatPrice(order.deliveryFee)}`, margin, y);
    y += 7;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total (TTC): ${formatPrice(order.total)}`, margin, y);
  });

  const filename =
    orders.length === 1 ? `${orders[0].orderNumber}.pdf` : `Commandes_Silky_${orders.length}_selectionnees.pdf`;

  doc.save(filename);
  return true;
}

export function generateOrderPdf(order) {
  return generateOrdersPdf([order]);
}

export function generateExchangePdf(exchange) {
  if (!exchange) return false;

  const doc = new jsPDF();
  const margin = 20;
  let y = margin;

  // Header - Brand
  doc.setFontSize(20);
  doc.setTextColor(141, 25, 28);
  doc.setFont(undefined, 'normal');
  doc.text('Silky', margin, y);
  y += 10;

  // Title: Exchange Number
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Échange ${exchange.exchangeNumber || ''}`, margin, y);
  y += 6;

  // Subtitle: Original Order Reference
  if (exchange.orderNumber) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Commande d'origine: ${exchange.orderNumber}`, margin, y);
    y += 5;
  }

  // Date
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const dateStr = exchange.createdAt ? new Date(exchange.createdAt).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');
  doc.text(`Date: ${dateStr}`, margin, y);
  y += 12;

  // Customer section
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text('Client', margin, y);
  doc.setFont(undefined, 'normal');
  y += 6;

  doc.setFontSize(10);
  const customer = exchange.customer || {};
  const firstName = customer.firstName || customer.name || '';
  const lastName = customer.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'Client';

  doc.text(fullName, margin, y);
  y += 5;
  if (customer.email) {
    doc.text(customer.email, margin, y);
    y += 5;
  }
  if (customer.phone) {
    doc.text(customer.phone, margin, y);
    y += 5;
  }
  const addressLines = doc.splitTextToSize(customer.address || customer.shippingAddress || '', 170);
  doc.text(addressLines, margin, y);
  y += addressLines.length * 5 + 8;

  // Exchange items section
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Articles de l\'échange', margin, y);
  doc.setFont(undefined, 'normal');
  y += 7;

  doc.setFontSize(9);
  const items = Array.isArray(exchange.items) ? exchange.items : [];
  items.forEach((item) => {
    const detailsStr = item.details || item.variantLabel ? ` (${item.details || item.variantLabel})` : '';
    const itemPrice = Number(item.price || item.unitPrice || 0);
    const line = `${item.name || item.productTitle}${detailsStr} x${item.quantity} — ${formatPrice(itemPrice * item.quantity)}`;
    const lines = doc.splitTextToSize(line, 170);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 1;

    // Clearly display "ECHANGE" under each product price
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(141, 25, 28);
    doc.text('ECHANGE', margin, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    y += 5;

    if (y > 260) {
      doc.addPage();
      y = margin;
    }
  });

  y += 6;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 190, y);
  y += 8;

  doc.setFontSize(10);
  doc.text(`Sous-total: ${formatPrice(exchange.subtotal)}`, margin, y);
  y += 5;
  doc.text(`Livraison: ${formatPrice(exchange.deliveryFee)}`, margin, y);
  y += 7;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(`Total (TTC): ${formatPrice(exchange.total)}`, margin, y);

  const filename = `${exchange.exchangeNumber || 'Echange'}.pdf`;
  doc.save(filename);
  return true;
}
