import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { generateOrdersPdf } from '../../utils/orderPdf';
import AdminManualOrderModal from './AdminManualOrderModal';
import AdminExchangeModal from './AdminExchangeModal';

const formatPrice = (amount) =>
  (Number(amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';

export default function AdminOrders({ refreshKey = 0, onOrderCreated }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [exchangeModalOrder, setExchangeModalOrder] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadOrders = () => {
    setLoading(true);
    setError('');
    api
      .getOrders()
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
  }, [refreshKey]);

  const filteredOrders = orders.filter((order) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();

    const orderNumMatch = order.orderNumber?.toLowerCase().includes(q);
    const orderIdMatch = order.id?.toLowerCase().includes(q);
    const firstName = (order.customer?.firstName || order.customer?.name || '').toLowerCase();
    const lastName = (order.customer?.lastName || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();
    const nameMatch = firstName.includes(q) || lastName.includes(q) || fullName.includes(q);
    const phoneMatch = order.customer?.phone?.toLowerCase().includes(q);
    const emailMatch = order.customer?.email?.toLowerCase().includes(q);

    return orderNumMatch || orderIdMatch || nameMatch || phoneMatch || emailMatch;
  });

  const activeFilteredOrders = filteredOrders.filter((o) => o.status !== 'cancelled');
  const isAllSelected =
    activeFilteredOrders.length > 0 &&
    activeFilteredOrders.every((o) => selectedIds.includes(o.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(activeFilteredOrders.map((o) => o.id));
    }
  };

  const toggleSelectOrder = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectedOrdersToDownload = orders.filter(
    (o) => selectedIds.includes(o.id) && o.status !== 'cancelled',
  );

  const handleDownloadSelected = async () => {
    if (selectedOrdersToDownload.length === 0) return;
    setDownloading(true);
    setError('');

    try {
      const ok = generateOrdersPdf(selectedOrdersToDownload);
      if (ok) {
        const unconfirmedIds = selectedOrdersToDownload
          .filter((o) => o.status === 'pending' || o.status === 'processing')
          .map((o) => o.id);

        if (unconfirmedIds.length > 0) {
          await api.updateOrdersStatus(unconfirmedIds, 'completed');
        }

        setSelectedIds([]);
        loadOrders();
        onOrderCreated?.();
      }
    } catch (err) {
      setError(err.message || 'Erreur lors de la génération du PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    setError('');
    try {
      await api.cancelOrder(orderId);
      setSelectedIds((prev) => prev.filter((id) => id !== orderId));
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || "Erreur lors de l'annulation de la commande");
    }
  };

  const handleManualOrderSuccess = () => {
    loadOrders();
    onOrderCreated?.();
  };

  const renderStatusBadge = (status) => {
    if (status === 'completed' || status === 'confirmed') {
      return <span className="admin-status-badge confirmed">Confirmée</span>;
    }
    if (status === 'exchanged') {
      return <span className="admin-status-badge exchanged">Echangée</span>;
    }
    if (status === 'cancelled') {
      return <span className="admin-status-badge cancelled">Annulée</span>;
    }
    return <span className="admin-status-badge unconfirmed">Non Confirmée</span>;
  };

  if (loading) return <p className="admin-loading">Chargement des commandes...</p>;

  return (
    <section className="admin-panel">
      <div className="admin-panel-header admin-orders-header">
        <div className="admin-panel-title-area">
          <h2>Commandes</h2>
          {activeFilteredOrders.length > 0 && (
            <label className="admin-toolbar-select">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                aria-label="Tout sélectionner"
              />
              <span>Tout sélectionner</span>
            </label>
          )}
        </div>
        <div className="admin-panel-actions">
          <button
            type="button"
            className="admin-download-btn"
            disabled={selectedOrdersToDownload.length === 0 || downloading}
            onClick={handleDownloadSelected}
          >
            {downloading
              ? 'Génération...'
              : `Télécharger${selectedOrdersToDownload.length > 0 ? ` (${selectedOrdersToDownload.length})` : ''}`}
          </button>
          <button type="button" className="admin-primary-btn" onClick={() => setManualOrderOpen(true)}>
            + Commande manuelle
          </button>
          <button type="button" className="admin-secondary-btn" onClick={loadOrders}>
            Actualiser
          </button>
        </div>
      </div>

      <div className="admin-orders-search-wrapper">
        <input
          type="text"
          className="admin-orders-search-input"
          placeholder="Rechercher par N° commande, nom client, téléphone, email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="admin-search-clear-btn"
            onClick={() => setSearchQuery('')}
            title="Effacer la recherche"
            aria-label="Effacer la recherche"
          >
            ×
          </button>
        )}
      </div>

      <AdminManualOrderModal
        open={manualOrderOpen}
        onClose={() => setManualOrderOpen(false)}
        onSuccess={handleManualOrderSuccess}
      />

      <AdminExchangeModal
        open={Boolean(exchangeModalOrder)}
        order={exchangeModalOrder}
        onClose={() => setExchangeModalOrder(null)}
        onSuccess={() => {
          loadOrders();
          onOrderCreated?.();
        }}
      />

      {error && <p className="admin-error" style={{ marginBottom: '16px' }}>{error}</p>}

      {orders.length === 0 ? (
        <p className="admin-empty">Aucune commande pour le moment.</p>
      ) : filteredOrders.length === 0 ? (
        <p className="admin-empty">Aucune commande ne correspond à votre recherche &quot;{searchQuery}&quot;.</p>
      ) : (
        <div className="admin-orders-list">
          {filteredOrders.map((order) => {
            const isCancelled = order.status === 'cancelled';
            const isUnconfirmed = order.status === 'pending' || order.status === 'processing';
            const canExchange = order.status === 'completed' || order.status === 'confirmed' || order.status === 'exchanged';
            const isSelected = selectedIds.includes(order.id);

            return (
              <article key={order.id} className={`admin-order-card ${isCancelled ? 'is-cancelled' : ''}`}>
                <div className="admin-order-summary">
                  <div className="admin-order-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isCancelled}
                      onChange={() => toggleSelectOrder(order.id)}
                      aria-label={`Sélectionner commande ${order.orderNumber}`}
                    />
                  </div>
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <span>{new Date(order.createdAt).toLocaleString('fr-FR')}</span>
                  </div>
                  <div>
                    <strong>{formatPrice(order.total)}</strong>
                    <span>
                      {order.customer?.firstName || order.customer?.name || ''} {order.customer?.lastName || ''}
                    </span>
                  </div>
                  <div className="admin-order-actions">
                    {renderStatusBadge(order.status)}
                    <button type="button" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                      {expanded === order.id ? 'Masquer' : 'Détails'}
                    </button>
                    {canExchange && (
                      <button
                        type="button"
                        className="admin-btn-exchange"
                        onClick={() => setExchangeModalOrder(order)}
                      >
                        Échange
                      </button>
                    )}
                    {!isCancelled && (
                      <button
                        type="button"
                        className="admin-btn-cancel"
                        onClick={() => handleCancelOrder(order.id)}
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </div>

                {expanded === order.id && (
                  <div className="admin-order-details">
                    <p>
                      <strong>Client:</strong> {order.customer?.firstName || order.customer?.name || ''} {order.customer?.lastName || ''}
                    </p>
                    <p>
                      <strong>Email:</strong> {order.customer?.email || 'Non renseigné'}
                    </p>
                    <p>
                      <strong>Téléphone:</strong> {order.customer?.phone}
                    </p>
                    <p>
                      <strong>Adresse:</strong> {order.customer?.address}
                    </p>
                    {order.orderSource && (
                      <p>
                        <strong>Source:</strong> {order.orderSource}
                      </p>
                    )}
                    <ul>
                      {order.items?.map((item, i) => (
                        <li key={i}>
                          <strong>{item.name || item.productTitle}</strong>
                          {item.details || item.variantLabel ? ` (${item.details || item.variantLabel})` : ''} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                        </li>
                      ))}
                    </ul>
                    <p>
                      <strong>Total:</strong> {formatPrice(order.total)} (livraison: {formatPrice(order.deliveryFee)})
                    </p>

                    {order.exchanges && order.exchanges.length > 0 && (
                      <div className="admin-order-exchanges-history">
                        <h4 className="admin-exchanges-title">Historique des Échanges ({order.exchanges.length})</h4>
                        {order.exchanges.map((ex, idx) => (
                          <div key={ex.id || idx} className="admin-exchange-card">
                            <div className="admin-exchange-header">
                              <strong>Échange #{ex.exchangeSequence || idx + 1} — {ex.exchangeNumber}</strong>
                              <span>{new Date(ex.createdAt).toLocaleString('fr-FR')}</span>
                            </div>
                            <p><strong>Client:</strong> {ex.customer?.name || `${ex.customer?.firstName || ''} ${ex.customer?.lastName || ''}`.trim()}</p>
                            <p><strong>Email:</strong> {ex.customer?.email || 'Non renseigné'}</p>
                            <p><strong>Téléphone:</strong> {ex.customer?.phone}</p>
                            <p><strong>Adresse:</strong> {ex.customer?.address}</p>
                            <ul className="admin-exchange-items">
                              {ex.items?.map((item, itemIdx) => (
                                <li key={itemIdx}>
                                  <strong>{item.name || item.productTitle}</strong>
                                  {item.details || item.variantLabel ? ` (${item.details || item.variantLabel})` : ''} × {item.quantity} — {formatPrice((item.price || item.unitPrice || 0) * item.quantity)}
                                </li>
                              ))}
                            </ul>
                            <p><strong>Total Échange:</strong> {formatPrice(ex.total)} (livraison: {formatPrice(ex.deliveryFee)})</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
