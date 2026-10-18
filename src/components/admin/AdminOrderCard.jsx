import { Fragment } from 'react';

/**
 * AdminOrderCard — Reusable order row component.
 * Mechanically extracted from AdminOrders.jsx (lines 592–962).
 * No design changes. No business logic changes.
 * Used by AdminOrders.
 */

// Shared utilities — duplicated here so this component is self-contained
export const formatPrice = (amount) =>
  (Number(amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';

export function renderStatusBadge(status) {
  if (status === 'delivered') {
    return <span className="admin-status-badge delivered">Livrée</span>;
  }
  if (status === 'completed' || status === 'confirmed') {
    return <span className="admin-status-badge confirmed">Confirmée</span>;
  }
  if (status === 'exchanged') {
    return <span className="admin-status-badge exchanged">Echangée</span>;
  }
  if (status === 'refunded') {
    return <span className="admin-status-badge refunded">Remboursée</span>;
  }
  if (status === 'cancelled') {
    return <span className="admin-status-badge cancelled">Annulée</span>;
  }
  return <span className="admin-status-badge unconfirmed">Non Confirmée</span>;
}

function isValidTimestamp(ts) {
  if (!ts) return false;
  const time = new Date(ts).getTime();
  return !isNaN(time);
}

/**
 * Returns the timestamp to use as the counter's start time for a given order.
 * Priority:
 *   1. pending / processing → order.createdAt (unconfirmed)
 *   2. exchanged            → newest exchange's createdAt
 *   3. other statuses       → order.updatedAt (completed, delivered, cancelled, refunded)
 *
 * Fallback:
 *   If the selected timestamp is missing or invalid, falls back to a valid order.createdAt.
 *   If neither is valid, returns null.
 */
export function getElapsedBaseTimestamp(order) {
  if (!order) return null;

  let candidate = null;

  if (order.status === 'pending' || order.status === 'processing') {
    candidate = order.createdAt;
  } else if (order.status === 'exchanged') {
    // API/repository returns exchanges newest-first (orderBy desc createdAt).
    // We pick the newest valid exchange createdAt across single or multiple exchanges:
    if (Array.isArray(order.exchanges) && order.exchanges.length > 0) {
      for (const ex of order.exchanges) {
        if (isValidTimestamp(ex?.createdAt)) {
          if (!candidate || new Date(ex.createdAt).getTime() > new Date(candidate).getTime()) {
            candidate = ex.createdAt;
          }
        }
      }
    }
  } else {
    // completed, delivered, cancelled, refunded
    candidate = order.updatedAt;
  }

  if (isValidTimestamp(candidate)) {
    return candidate;
  }

  if (isValidTimestamp(order.createdAt)) {
    return order.createdAt;
  }

  return null;
}

/**
 * Formats a timestamp as a compact French elapsed-time string.
 * Returns '—' when the timestamp is missing, invalid, or far in the future.
 */
export function formatElapsed(timestamp) {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  const time = d.getTime();
  if (isNaN(time)) return '—';

  const diffMs = Date.now() - time;

  // Clock skew tolerance: if created up to 1 minute in the future, treat as just now
  if (diffMs < 0) {
    if (diffMs >= -60000) {
      return 'Depuis < 1 min';
    }
    return '—';
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days >= 1) {
    return hours > 0 ? `Depuis ${days} j ${hours} h` : `Depuis ${days} j`;
  }
  if (totalHours >= 1) {
    return minutes > 0 ? `Depuis ${totalHours} h ${String(minutes).padStart(2, '0')}` : `Depuis ${totalHours} h`;
  }
  if (totalMinutes >= 1) {
    return `Depuis ${totalMinutes} min`;
  }
  return 'Depuis < 1 min';
}

/**
 * Props:
 *  order                  — the order object
 *  isSelected             — whether this order's main checkbox is checked
 *  isExpanded             — whether the expanded details row is visible
 *  activeHighlightId      — order id currently highlighted (notification scroll)
 *  selectedExchangeIds    — array of exchange ids selected globally
 *  selectedRefundIds      — array of refund ids selected globally
 *  toggleSelectOrder(id)  — toggle order checkbox
 *  toggleExpand(id)       — toggle expanded row
 *  handlePrintOrder(order)
 *  handleConfirmSingleOrder(order)
 *  handleDeliverOrder(orderId)
 *  setExchangeModalOrder({ order, paymentResponsibility })
 *  handleRefundOrder(orderId, paymentResponsibility)
 *  handleCancelOrder(orderId)
 *  toggleSelectExchange(id)
 *  toggleSelectRefund(id)
 *
 * Optional prop:
 *  readOnly               — when true, hides action buttons (confirm/exchange/refund/cancel/print/checkbox)
 */
export default function AdminOrderCard({
  order,
  isSelected,
  isExpanded,
  activeHighlightId,
  selectedExchangeIds = [],
  selectedRefundIds = [],
  toggleSelectOrder,
  toggleExpand,
  handlePrintOrder,
  handleConfirmSingleOrder,
  handleDeliverOrder,
  setExchangeModalOrder,
  handleRefundOrder,
  handleCancelOrder,
  toggleSelectExchange,
  toggleSelectRefund,
  // tick is incremented by a shared interval in AdminOrders every 60 s;
  // receiving it as a prop causes this row to re-render so formatElapsed stays current.
  // eslint-disable-next-line no-unused-vars
  tick = 0,
  readOnly = false,
}) {
  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';
  const isRefunded = order.status === 'refunded';
  const isUnconfirmed = order.status === 'pending' || order.status === 'processing';
  const isTerminal = isDelivered || isCancelled || isRefunded;
  const canExchange = !isTerminal && (order.status === 'completed' || order.status === 'confirmed' || order.status === 'exchanged');
  const canDeliver = !isTerminal && (order.status === 'completed' || order.status === 'confirmed' || order.status === 'exchanged');

  const payableAmount =
    order.customerAmountToPay !== undefined
      ? order.customerAmountToPay
      : (order.finalCustomerPayableAmount !== undefined ? order.finalCustomerPayableAmount : order.total);

  return (
    <Fragment key={order.id}>
      <tr
        id={`order-${order.id}`}
        className={`admin-order-row ${isDelivered ? 'is-delivered' : ''} ${isCancelled ? 'is-cancelled' : ''} ${isRefunded ? 'is-refunded' : ''} ${activeHighlightId === order.id ? 'notification-highlight' : ''}`}
      >
        {/* Column 0: Checkbox */}
        <td className="admin-table-td col-select">
          {!readOnly && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelectOrder(order.id)}
              aria-label={`Sélectionner commande ${order.orderNumber}`}
            />
          )}
        </td>

        {/* Column 1: Date et Heure */}
        <td className="admin-table-td col-date">
          <span className="admin-table-cell-date">
            {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-FR') : '—'}
          </span>
          <span className="admin-elapsed-time">
            {formatElapsed(getElapsedBaseTimestamp(order))}
          </span>
        </td>

        {/* Column 2: ID de la commande */}
        <td className="admin-table-td col-id">
          <strong className="admin-table-cell-id">{order.orderNumber}</strong>
        </td>

        {/* Column 3: Nom Client */}
        <td className="admin-table-td col-client">
          <span className="admin-table-cell-client">
            {order.customer?.firstName || order.customer?.name || ''} {order.customer?.lastName || ''}
          </span>
        </td>

        {/* Column 4: Téléphone */}
        <td className="admin-table-td col-phone">
          <span className="admin-table-cell-phone">
            {order.customer?.phone || '—'}
          </span>
        </td>

        {/* Column 5: Status */}
        <td className="admin-table-td col-status">
          {renderStatusBadge(order.status)}
        </td>

        {/* Column 6: Prix (Montant à payer) */}
        <td className="admin-table-td col-price">
          <strong className="admin-table-cell-price">{formatPrice(payableAmount)}</strong>
        </td>

        {/* Column 7: Actions */}
        <td className="admin-table-td col-actions">
          <div className="admin-table-actions-cell">
            {!readOnly && (
              <button
                type="button"
                className="admin-icon-action-btn admin-btn-print"
                onClick={() => handlePrintOrder(order)}
                aria-label={`Imprimer commande ${order.orderNumber}`}
              >
                <img alt="" className="admin-btn-icon" src="/pictures/printer.png" />
                <span className="admin-tooltip">Imprimer</span>
              </button>
            )}
            <div className="admin-order-actions-cluster">
              <div className="admin-actions-row admin-actions-row-top">
                <button
                  type="button"
                  className="admin-icon-action-btn admin-btn-details"
                  onClick={() => toggleExpand(order.id)}
                  aria-label={isExpanded ? 'Masquer' : 'Détails'}
                >
                  <img alt="" className="admin-btn-icon" src="/pictures/history.png" />
                  <span className="admin-tooltip">Détails</span>
                </button>
                {!readOnly && isUnconfirmed && (
                  <button
                    type="button"
                    className="admin-icon-action-btn admin-btn-confirm"
                    onClick={() => handleConfirmSingleOrder(order)}
                    aria-label="Confirmer commande"
                  >
                    <img alt="" className="admin-btn-icon" src="/pictures/confirm.png" />
                    <span className="admin-tooltip">Confirmer</span>
                  </button>
                )}
                {!readOnly && canDeliver && (
                  <button
                    type="button"
                    className="admin-icon-action-btn admin-btn-deliver"
                    onClick={() => handleDeliverOrder(order.id)}
                    aria-label="Marquer comme livrée"
                  >
                    <img alt="" className="admin-btn-icon" src="/pictures/truckdilevery.png" />
                    <span className="admin-tooltip">Marquer comme livrée</span>
                  </button>
                )}
                {!readOnly && canExchange && (
                  <button
                    type="button"
                    className="admin-icon-action-btn admin-btn-exchange"
                    onClick={() => setExchangeModalOrder({ order, paymentResponsibility: 'customer_paid' })}
                    aria-label="Échange"
                  >
                    <img alt="" className="admin-btn-icon" src="/pictures/exchange.png" />
                    <span className="admin-tooltip">Échange</span>
                  </button>
                )}
                {!readOnly && !isTerminal && !isUnconfirmed && (
                  <button
                    type="button"
                    className="admin-icon-action-btn admin-btn-refund"
                    onClick={() => handleRefundOrder(order.id, 'customer_paid')}
                    aria-label="Remboursement"
                  >
                    <img alt="" className="admin-btn-icon" src="/pictures/refund.png" />
                    <span className="admin-tooltip">Remboursement</span>
                  </button>
                )}
                {!readOnly && !isTerminal && (
                  <button
                    type="button"
                    className="admin-icon-action-btn admin-btn-cancel"
                    onClick={() => handleCancelOrder(order.id)}
                    aria-label="Annuler"
                  >
                    <img alt="" className="admin-btn-icon" src="/pictures/cancel.png" />
                    <span className="admin-tooltip">Annuler</span>
                  </button>
                )}
              </div>
              {!readOnly && (canExchange || (!isTerminal && !isUnconfirmed)) && (
                <div className="admin-actions-row admin-actions-row-bottom">
                  {canExchange && (
                    <button
                      type="button"
                      className="admin-icon-action-btn admin-btn-exchange-paid"
                      onClick={() => setExchangeModalOrder({ order, paymentResponsibility: 'silky_paid' })}
                      aria-label="Échange payé"
                    >
                      <img alt="" className="admin-btn-icon" src="/pictures/exchangesilky.png" />
                      <span className="admin-tooltip">Échange payé</span>
                    </button>
                  )}
                  {!isTerminal && !isUnconfirmed && (
                    <button
                      type="button"
                      className="admin-icon-action-btn admin-btn-refund-free"
                      onClick={() => handleRefundOrder(order.id, 'silky_paid')}
                      aria-label="Remboursement gratuit"
                    >
                      <img alt="" className="admin-btn-icon" src="/pictures/refundsilky.png" />
                      <span className="admin-tooltip">Remboursement gratuit</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Expanded Row */}
      {isExpanded && (
        <tr className="admin-order-expanded-row">
          <td colSpan={8} className="admin-order-expanded-cell">
            <div className="admin-order-details">
              <div className="admin-expanded-header-info">
                <p>
                  <strong>Client:</strong> {order.customer?.firstName || order.customer?.name || ''} {order.customer?.lastName || ''}
                </p>
                <p>
                  <strong>Email:</strong> {order.customer?.email || 'Non renseigné'}
                </p>
                <p>
                  <strong>Téléphone:</strong> {order.customer?.phone || 'Non renseigné'}
                </p>
                <p>
                  <strong>Adresse:</strong> {order.customer?.address || 'Non renseignée'}
                </p>
              </div>

              <div className="admin-expanded-items-section">
                <strong>Articles commandés :</strong>
                <ul className="admin-order-items-list">
                  {order.items?.map((item, i) => (
                    <li key={i}>
                      <strong>{item.name || item.productTitle}</strong>
                      {item.details || item.variantLabel ? ` (${item.details || item.variantLabel})` : ''} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="admin-expanded-financials">
                <p>
                  <strong>Total:</strong> {formatPrice(order.total)} (livraison: {formatPrice(order.deliveryFee)})
                </p>
                <p>
                  <strong>Montant à payer:</strong> {formatPrice(payableAmount)}
                </p>
              </div>

              {/* Historical Exchanges */}
              {order.exchanges && order.exchanges.length > 0 && (
                <div className="admin-order-exchanges-history">
                  <h4 className="admin-exchanges-title">Historique des Échanges ({order.exchanges.length})</h4>
                  <div className="admin-history-subtable-wrap">
                    <table className="admin-history-subtable">
                      <thead>
                        <tr>
                          <th className="col-sub-select"></th>
                          <th className="col-sub-date">Date et Heure</th>
                          <th className="col-sub-id">ID Échange</th>
                          <th className="col-sub-client">Client</th>
                          <th className="col-sub-phone">Téléphone</th>
                          <th className="col-sub-status">Type</th>
                          <th className="col-sub-price">Montant à payer</th>
                          <th className="col-sub-details">Détails</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.exchanges.map((ex, idx) => {
                          const exPayable =
                            ex.customerAmountToPay !== undefined
                              ? ex.customerAmountToPay
                              : (ex.finalCustomerPayableAmount !== undefined ? ex.finalCustomerPayableAmount : ex.total);
                          const isExSelected = selectedExchangeIds.includes(ex.id);

                          return (
                            <tr key={ex.id || idx} className="admin-history-row">
                              <td className="col-sub-select">
                                {!readOnly && (
                                  <input
                                    type="checkbox"
                                    checked={isExSelected}
                                    onChange={() => toggleSelectExchange(ex.id)}
                                    aria-label={`Sélectionner échange ${ex.exchangeNumber}`}
                                  />
                                )}
                              </td>
                              <td className="col-sub-date">
                                {ex.createdAt ? new Date(ex.createdAt).toLocaleString('fr-FR') : '—'}
                              </td>
                              <td className="col-sub-id">
                                <strong>Échange #{ex.exchangeSequence || idx + 1} — {ex.exchangeNumber}</strong>
                              </td>
                              <td className="col-sub-client">
                                {ex.customer?.name || `${ex.customer?.firstName || ''} ${ex.customer?.lastName || ''}`.trim() || '—'}
                              </td>
                              <td className="col-sub-phone">
                                {ex.customer?.phone || '—'}
                              </td>
                              <td className="col-sub-status">
                                <span className={`admin-status-badge ${ex.paymentResponsibility === 'silky_paid' ? 'confirmed' : 'exchanged'}`}>
                                  {ex.paymentResponsibility === 'silky_paid' ? 'Silky payé' : 'Client payé'}
                                </span>
                              </td>
                              <td className="col-sub-price">
                                <strong>{formatPrice(exPayable)}</strong>
                              </td>
                              <td className="col-sub-details">
                                <div className="admin-history-item-desc">
                                  <span>Total Échange: {formatPrice(ex.total)} (livraison: {formatPrice(ex.deliveryFee)})</span>
                                  {Number(ex.productAmountAdded) > 0 && (
                                    <span className="admin-exchange-diff-added" style={{ display: 'block' }}>
                                      Montant ajouté aux produits : {formatPrice(ex.productAmountAdded)}
                                    </span>
                                  )}
                                  {Number(ex.productRefundObligation) > 0 && (
                                    <span className="admin-exchange-diff-refund" style={{ display: 'block' }}>
                                      Remboursement produit dû au client : {formatPrice(ex.productRefundObligation)}
                                    </span>
                                  )}
                                  <ul className="admin-exchange-items">
                                    {ex.items?.map((item, itemIdx) => (
                                      <li key={itemIdx}>
                                        {item.name || item.productTitle} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Historical Refunds */}
              {order.refunds && order.refunds.length > 0 && (
                <div className="admin-order-refunds-history">
                  <h4 className="admin-refunds-title">Historique des Remboursements ({order.refunds.length})</h4>
                  <div className="admin-history-subtable-wrap">
                    <table className="admin-history-subtable">
                      <thead>
                        <tr>
                          <th className="col-sub-select"></th>
                          <th className="col-sub-date">Date et Heure</th>
                          <th className="col-sub-id">ID Remboursement</th>
                          <th className="col-sub-client">Client</th>
                          <th className="col-sub-phone">Téléphone</th>
                          <th className="col-sub-status">Type</th>
                          <th className="col-sub-price">Montant à payer</th>
                          <th className="col-sub-details">Détails</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.refunds.map((ref, idx) => {
                          const isSilkyPaid = ref.paymentResponsibility === 'silky_paid' || Number(ref.deliveryFee) === 0;
                          const refPayable =
                            ref.customerAmountToPay !== undefined
                              ? ref.customerAmountToPay
                              : (ref.finalCustomerPayableAmount !== undefined ? ref.finalCustomerPayableAmount : 0);
                          const isRefSelected = selectedRefundIds.includes(ref.id);

                          return (
                            <tr key={ref.id || idx} className="admin-history-row">
                              <td className="col-sub-select">
                                {!readOnly && (
                                  <input
                                    type="checkbox"
                                    checked={isRefSelected}
                                    onChange={() => toggleSelectRefund(ref.id)}
                                    aria-label={`Sélectionner remboursement ${ref.refundNumber}`}
                                  />
                                )}
                              </td>
                              <td className="col-sub-date">
                                {ref.createdAt ? new Date(ref.createdAt).toLocaleString('fr-FR') : '—'}
                              </td>
                              <td className="col-sub-id">
                                <strong>Remboursement #{idx + 1} — {ref.refundNumber}</strong>
                              </td>
                              <td className="col-sub-client">
                                {ref.customer?.name || '—'}
                              </td>
                              <td className="col-sub-phone">
                                {ref.customer?.phone || '—'}
                              </td>
                              <td className="col-sub-status">
                                <span className={`admin-status-badge ${isSilkyPaid ? 'confirmed' : 'refunded'}`}>
                                  {isSilkyPaid ? 'Silky gratuit' : 'Client payé'}
                                </span>
                              </td>
                              <td className="col-sub-price">
                                <strong>{formatPrice(refPayable)}</strong>
                              </td>
                              <td className="col-sub-details">
                                <div className="admin-history-item-desc">
                                  <span>
                                    Montant remboursé: {formatPrice(ref.refundAmount)} (
                                    {isSilkyPaid
                                      ? 'Frais retour client: 0,000 TND — Silky absorbe 7,000 TND'
                                      : `Frais retour payés par client: ${formatPrice(ref.deliveryFee)}`}
                                    )
                                  </span>
                                  <ul className="admin-refund-items">
                                    {ref.items?.map((item, itemIdx) => (
                                      <li key={itemIdx}>
                                        {item.name || item.productTitle} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
