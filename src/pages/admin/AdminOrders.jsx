import { Fragment, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { generateDocumentsPdf, buildDocumentsToDownload } from '../../utils/orderPdf';
import AdminManualOrderModal from './AdminManualOrderModal';
import AdminExchangeModal from './AdminExchangeModal';
import AdminOrderCard from '../../components/admin/AdminOrderCard';

const formatPrice = (amount) =>
  (Number(amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';

function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [];
  pages.push(1);
  if (currentPage > 3) {
    pages.push('...');
  }
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) {
    pages.push('...');
  }
  pages.push(totalPages);
  return pages;
}

export default function AdminOrders({ refreshKey = 0, onOrderCreated, highlightOrderId = null }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState([]);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [exchangeModalOrder, setExchangeModalOrder] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [selectedExchangeIds, setSelectedExchangeIds] = useState([]);
  const [selectedRefundIds, setSelectedRefundIds] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortDirection, setSortDirection] = useState('desc'); // 'desc' (newest -> oldest), 'asc' (oldest -> newest)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeHighlightId, setActiveHighlightId] = useState(null);

  const toggleExpand = (orderId) => {
    setExpandedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  };

  const loadOrders = (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError('');
    api
      .getOrders()
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => {
        if (isInitial) setLoading(false);
      });
  };

  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadOrders(!orders.length);
  }, [refreshKey]);

  // Shared 60-second interval — increments tick so every AdminOrderCard
  // re-renders its elapsed-time string without creating one timer per row.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Filtering pipeline: search query + status dropdown
  const filteredOrders = orders.filter((order) => {
    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const orderNumMatch = order.orderNumber?.toLowerCase().includes(q);
      const orderIdMatch = order.id?.toLowerCase().includes(q);
      const firstName = (order.customer?.firstName || order.customer?.name || '').toLowerCase();
      const lastName = (order.customer?.lastName || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const nameMatch = firstName.includes(q) || lastName.includes(q) || fullName.includes(q);
      const phoneMatch = order.customer?.phone?.toLowerCase().includes(q);
      const emailMatch = order.customer?.email?.toLowerCase().includes(q);

      if (!(orderNumMatch || orderIdMatch || nameMatch || phoneMatch || emailMatch)) {
        return false;
      }
    }

    // 2. Status Filter
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'unconfirmed') {
        if (order.status !== 'pending' && order.status !== 'processing') return false;
      } else if (statusFilter === 'confirmed') {
        if (order.status !== 'completed' && order.status !== 'confirmed') return false;
      } else if (statusFilter === 'delivered') {
        if (order.status !== 'delivered') return false;
      } else if (statusFilter === 'exchanged') {
        if (order.status !== 'exchanged') return false;
      } else if (statusFilter === 'refunded') {
        if (order.status !== 'refunded') return false;
      } else if (statusFilter === 'cancelled') {
        if (order.status !== 'cancelled') return false;
      }
    }

    return true;
  });

  // Sorting pipeline (default: newest -> oldest)
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
  });

  const toggleDateSort = () => {
    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  // Pagination calculations
  const totalOrders = sortedOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalOrders);
  const paginatedOrders = sortedOrders.slice(startIndex, endIndex);

  // Handle notification highlight scroll & auto-navigate page
  useEffect(() => {
    if (highlightOrderId && orders.length > 0) {
      const orderIdx = sortedOrders.findIndex((o) => o.id === highlightOrderId);
      if (orderIdx !== -1) {
        const targetPage = Math.floor(orderIdx / pageSize) + 1;
        setCurrentPage(targetPage);
      }
      setSearchQuery('');
      setStatusFilter('all');
      setActiveHighlightId(highlightOrderId);
      const timer = setTimeout(() => {
        const el = document.getElementById(`order-${highlightOrderId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      const clearTimer = setTimeout(() => {
        setActiveHighlightId(null);
      }, 3500);

      return () => {
        clearTimeout(timer);
        clearTimeout(clearTimer);
      };
    }
  }, [highlightOrderId, orders]);

  // Page-scoped select-all state
  const pageOrderIds = paginatedOrders.map((o) => o.id);
  const isAllPageSelected =
    pageOrderIds.length > 0 && pageOrderIds.every((id) => selectedOrderIds.includes(id));
  const isSomePageSelected =
    pageOrderIds.some((id) => selectedOrderIds.includes(id)) && !isAllPageSelected;

  const toggleSelectPage = () => {
    if (isAllPageSelected) {
      // Unselect only orders on the current visible page, preserving other pages
      setSelectedOrderIds((prev) => prev.filter((id) => !pageOrderIds.includes(id)));
    } else {
      // Add visible orders on this page to global selection
      setSelectedOrderIds((prev) => Array.from(new Set([...prev, ...pageOrderIds])));
    }
  };

  const toggleSelectOrder = (id) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectExchange = (id) => {
    setSelectedExchangeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectRefund = (id) => {
    setSelectedRefundIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // Global selections evaluation (across ALL orders / pages)
  const selectedOrders = orders.filter((o) => selectedOrderIds.includes(o.id));

  const selectedExchanges = [];
  orders.forEach((order) => {
    if (Array.isArray(order.exchanges)) {
      order.exchanges.forEach((ex) => {
        if (selectedExchangeIds.includes(ex.id)) {
          selectedExchanges.push({
            ...ex,
            orderNumber: ex.orderNumber || order.orderNumber,
          });
        }
      });
    }
  });

  const selectedRefunds = [];
  orders.forEach((order) => {
    if (Array.isArray(order.refunds)) {
      order.refunds.forEach((ref) => {
        if (selectedRefundIds.includes(ref.id)) {
          selectedRefunds.push({
            ...ref,
            orderNumber: ref.orderNumber || order.orderNumber,
          });
        }
      });
    }
  });

  const totalSelectedCount =
    selectedOrders.length +
    selectedExchanges.length +
    selectedRefunds.length;

  const hasSelectedOrders = selectedOrders.length > 0;
  const hasSelectedExchangesOrRefunds =
    selectedExchangeIds.length > 0 || selectedRefundIds.length > 0;

  // Confirmer is enabled ONLY when every globally selected order is unconfirmed (pending or processing)
  // If at least one selected order is not pending/processing, or if exchanges/refunds are selected, it is disabled.
  const canConfirm =
    hasSelectedOrders &&
    !hasSelectedExchangesOrRefunds &&
    selectedOrders.every(
      (o) => o.status === 'pending' || o.status === 'processing',
    );

  const handlePrintOrder = (order) => {
    const docs = buildDocumentsToDownload([order], [order.id], [], []);
    generateDocumentsPdf(docs);
  };

  const handlePrintSelected = () => {
    if (totalSelectedCount === 0) return;
    const documentsToPrint = buildDocumentsToDownload(
      orders,
      selectedOrderIds,
      selectedExchangeIds,
      selectedRefundIds,
    );
    if (documentsToPrint.length === 0) return;
    generateDocumentsPdf(documentsToPrint);
  };

  const handleDownloadSelected = async () => {
    if (totalSelectedCount === 0) return;
    setDownloading(true);
    setError('');

    try {
      // 1. Explicit order confirmation operation FIRST for unconfirmed normal orders
      const unconfirmedIds = selectedOrders
        .filter((o) => o.status === 'pending' || o.status === 'processing')
        .map((o) => o.id);

      if (unconfirmedIds.length > 0) {
        await api.confirmOrders(unconfirmedIds);
      }

      // 2. Build deterministic ordered document list
      const documentsToDownload = buildDocumentsToDownload(
        orders,
        selectedOrderIds,
        selectedExchangeIds,
        selectedRefundIds,
      );

      // 3. Generate and download PDF (side-effect free)
      generateDocumentsPdf(documentsToDownload);

      setSelectedOrderIds([]);
      setSelectedExchangeIds([]);
      setSelectedRefundIds([]);
      if (unconfirmedIds.length > 0) {
        loadOrders();
        onOrderCreated?.();
      }
    } catch (err) {
      setError(err.message || 'Erreur lors de la confirmation ou du téléchargement');
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirmSingleOrder = async (order) => {
    setError('');
    try {
      // 1. Explicit order confirmation operation for this single order
      await api.confirmOrders([order.id]);

      // 2. Build deterministic ordered document list
      const documentsToDownload = buildDocumentsToDownload(
        [order],
        [order.id],
        [],
        [],
      );

      // 3. Generate and download PDF (side-effect free)
      if (documentsToDownload.length > 0) {
        generateDocumentsPdf(documentsToDownload);
      }

      setSelectedOrderIds((prev) => prev.filter((id) => id !== order.id));
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || 'Erreur lors de la confirmation de la commande');
    }
  };

  const handleCancelOrder = async (orderId) => {
    setError('');
    try {
      await api.cancelOrder(orderId);
      setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
      const orderToCancel = orders.find((o) => o.id === orderId);
      if (orderToCancel?.exchanges) {
        const exIds = orderToCancel.exchanges.map((e) => e.id);
        setSelectedExchangeIds((prev) => prev.filter((id) => !exIds.includes(id)));
      }
      if (orderToCancel?.refunds) {
        const refIds = orderToCancel.refunds.map((r) => r.id);
        setSelectedRefundIds((prev) => prev.filter((id) => !refIds.includes(id)));
      }
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || "Erreur lors de l'annulation de la commande");
    }
  };

  const handleRefundOrder = async (orderId, paymentResponsibility = 'customer_paid') => {
    setError('');
    try {
      await api.refundOrder(orderId, { paymentResponsibility });
      setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
      const orderToRefund = orders.find((o) => o.id === orderId);
      if (orderToRefund?.exchanges) {
        const exIds = orderToRefund.exchanges.map((e) => e.id);
        setSelectedExchangeIds((prev) => prev.filter((id) => !exIds.includes(id)));
      }
      if (orderToRefund?.refunds) {
        const refIds = orderToRefund.refunds.map((r) => r.id);
        setSelectedRefundIds((prev) => prev.filter((id) => !refIds.includes(id)));
      }
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || "Erreur lors du remboursement de la commande");
    }
  };

  const handleDeliverOrder = async (orderId) => {
    setError('');
    try {
      await api.deliverOrder(orderId);
      setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
      loadOrders();
      onOrderCreated?.();
    } catch (err) {
      setError(err.message || 'Erreur lors de la livraison de la commande');
    }
  };

  const handleManualOrderSuccess = () => {
    loadOrders();
    onOrderCreated?.();
  };

  if (loading) return <p className="admin-loading">Chargement des commandes...</p>;

  return (
    <section className="admin-panel admin-orders-panel">
      {/* Top Header Bar */}
      <div className="admin-panel-header admin-orders-header">
        <div className="admin-panel-title-area">
          <h2>Commandes</h2>
          {filteredOrders.length > 0 && (
            <span className="admin-draft-count-badge">
              {filteredOrders.length} commande{filteredOrders.length > 1 ? 's' : ''}
            </span>
          )}
          {paginatedOrders.length > 0 && (
            <label className="admin-toolbar-select">
              <input
                type="checkbox"
                checked={isAllPageSelected}
                ref={(input) => {
                  if (input) {
                    input.indeterminate = isSomePageSelected;
                  }
                }}
                onChange={toggleSelectPage}
                aria-label="Tout sélectionner sur la page"
              />
              <span>Tout sélectionner</span>
            </label>
          )}
        </div>
        <div className="admin-panel-actions">
          <button
            type="button"
            className="admin-print-toolbar-btn"
            disabled={totalSelectedCount === 0}
            onClick={handlePrintSelected}
            title={`Imprimer${totalSelectedCount > 0 ? ` (${totalSelectedCount})` : ''}`}
            aria-label={`Imprimer ${totalSelectedCount} commande(s) sélectionnée(s)`}
          >
            <img alt="" className="admin-btn-icon" src="/pictures/printer.png" />
          </button>
          <button
            type="button"
            className="admin-download-btn"
            disabled={!canConfirm || downloading}
            onClick={handleDownloadSelected}
          >
            <img src="/pictures/confirm.png" alt="" className="admin-btn-icon" style={{ filter: 'none' }} />
            <span>
              {downloading
                ? 'Confirmation...'
                : `Confirmer${totalSelectedCount > 0 ? ` (${totalSelectedCount})` : ''}`}
            </span>
          </button>
          <button type="button" className="admin-primary-btn" onClick={() => setManualOrderOpen(true)}>
            <img src="/pictures/addorder.png" alt="" className="admin-btn-icon" />
            <span>Créer une commande</span>
          </button>
          <button type="button" className="admin-secondary-btn" onClick={() => loadOrders()}>
            Actualiser
          </button>
        </div>
      </div>

      {/* Search Bar + Status Filter */}
      <div className="admin-orders-controls-bar">
        <div className="admin-orders-search-wrapper">
          <input
            type="text"
            className="admin-orders-search-input"
            placeholder="Rechercher par N° commande, nom client, téléphone, email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="admin-search-clear-btn"
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
            >
              ×
            </button>
          )}
        </div>

        <div className="admin-orders-filter-wrapper">
          <select
            className="admin-orders-status-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filtrer par statut"
          >
            <option value="all">Tous les statuts</option>
            <option value="unconfirmed">Non Confirmée</option>
            <option value="confirmed">Confirmée</option>
            <option value="delivered">Livrée</option>
            <option value="exchanged">Échangée</option>
            <option value="refunded">Remboursée</option>
            <option value="cancelled">Annulée</option>
          </select>
        </div>
      </div>

      <AdminManualOrderModal
        open={manualOrderOpen}
        onClose={() => setManualOrderOpen(false)}
        onSuccess={handleManualOrderSuccess}
      />

      <AdminExchangeModal
        open={Boolean(exchangeModalOrder)}
        order={exchangeModalOrder?.order || exchangeModalOrder}
        paymentResponsibility={exchangeModalOrder?.paymentResponsibility || 'customer_paid'}
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
        <p className="admin-empty">
          {searchQuery
            ? `Aucune commande ne correspond à votre recherche "${searchQuery}".`
            : 'Aucune commande ne correspond au filtre sélectionné.'}
        </p>
      ) : (
        <>
          {/* Main Orders Table */}
          <div className="admin-orders-table-wrap">
            <table className="admin-orders-table">
              <thead>
                <tr className="admin-table-header-row">
                  <th className="admin-table-th col-select">
                    <input
                      type="checkbox"
                      checked={isAllPageSelected}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = isSomePageSelected;
                        }
                      }}
                      onChange={toggleSelectPage}
                      aria-label="Sélectionner toutes les commandes de la page"
                    />
                  </th>
                  <th
                    className="admin-table-th col-date sortable"
                    onClick={toggleDateSort}
                    title="Inverser le tri par date"
                  >
                    <div className="admin-th-content">
                      <img src="/pictures/timeanddate.png" alt="" className="admin-th-icon" />
                      <span>Date et Heure</span>
                      <span className="admin-sort-indicator">{sortDirection === 'desc' ? '▼' : '▲'}</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-id">
                    <div className="admin-th-content">
                      <img src="/pictures/orderid.png" alt="" className="admin-th-icon" />
                      <span>ID</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-client">
                    <div className="admin-th-content">
                      <img src="/pictures/clientname.png" alt="" className="admin-th-icon" />
                      <span>Nom Client</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-phone">
                    <div className="admin-th-content">
                      <img src="/pictures/phonenumber.png" alt="" className="admin-th-icon" />
                      <span>Téléphone</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-status">
                    <div className="admin-th-content">
                      <img src="/pictures/statusflag.png" alt="" className="admin-th-icon" />
                      <span>Statut</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-price">
                    <div className="admin-th-content">
                      <img src="/pictures/money.png" alt="" className="admin-th-icon" />
                      <span>Prix</span>
                    </div>
                  </th>
                  <th className="admin-table-th col-actions">
                    <div className="admin-th-content admin-th-actions">
                      <img src="/pictures/actions.png" alt="" className="admin-th-icon" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => (
                  <AdminOrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.includes(order.id)}
                    isExpanded={expandedOrderIds.includes(order.id)}
                    activeHighlightId={activeHighlightId}
                    selectedExchangeIds={selectedExchangeIds}
                    selectedRefundIds={selectedRefundIds}
                    toggleSelectOrder={toggleSelectOrder}
                    toggleExpand={toggleExpand}
                    handlePrintOrder={handlePrintOrder}
                    handleConfirmSingleOrder={handleConfirmSingleOrder}
                    handleDeliverOrder={handleDeliverOrder}
                    setExchangeModalOrder={setExchangeModalOrder}
                    handleRefundOrder={handleRefundOrder}
                    handleCancelOrder={handleCancelOrder}
                    toggleSelectExchange={toggleSelectExchange}
                    toggleSelectRefund={toggleSelectRefund}
                    tick={tick}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="admin-orders-pagination-bar">
            <div className="admin-pagination-summary">
              Showing {totalOrders === 0 ? 0 : startIndex + 1}–{endIndex} of {totalOrders} orders
            </div>

            <div className="admin-pagination-right">
              <div className="admin-pagination-page-size">
                <select
                  id="admin-page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="admin-page-size-select"
                  aria-label="Sélectionner le nombre de commandes par page"
                >
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={500}>500 per page</option>
                </select>
              </div>

              <div className="admin-pagination-nav">
                <button
                  type="button"
                  className="admin-pagination-btn"
                  disabled={activePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="Page précédente"
                >
                  Previous
                </button>

                {getPageNumbers(activePage, totalPages).map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="admin-pagination-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`admin-pagination-btn ${p === activePage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(p)}
                      aria-label={`Page ${p}`}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  className="admin-pagination-btn"
                  disabled={activePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Page suivante"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
