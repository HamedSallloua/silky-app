import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useProducts } from '../../context/ProductsContext';

const LOW_STOCK_THRESHOLD = 5;

export default function AdminInventory({ refreshKey = 0 }) {
  const { refreshProducts } = useProducts();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadInventory = useCallback((isInitial = false) => {
    if (isInitial) setLoading(true);
    setError('');
    api
      .getAdminInventory()
      .then(setInventory)
      .catch((err) => setError(err.message))
      .finally(() => {
        if (isInitial) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadInventory(!inventory.length);
  }, [loadInventory, refreshKey]);

  const handleEditChange = (variantId, value) => {
    const parsed = parseInt(value, 10);
    setEditing((prev) => ({
      ...prev,
      [variantId]: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
    }));
  };

  const handleSave = async (variantId) => {
    const stockQuantity = editing[variantId];
    if (stockQuantity === undefined) return;

    setSaving(variantId);
    setMessage('');
    setError('');

    try {
      const updated = await api.updateAdminInventory(variantId, stockQuantity);
      setInventory((items) =>
        items.map((item) => (item.variantId === variantId ? updated : item)),
      );
      setEditing((prev) => {
        const next = { ...prev };
        delete next[variantId];
        return next;
      });
      setMessage('Stock mis à jour avec succès.');
      await refreshProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  // Live filter — matches name, color, or size
  const trimmed = searchQuery.trim().toLowerCase();
  const filtered = trimmed
    ? inventory.filter(
        (item) =>
          item.productTitle?.toLowerCase().includes(trimmed) ||
          item.colorName?.toLowerCase().includes(trimmed) ||
          item.size?.toLowerCase().includes(trimmed),
      )
    : inventory;

  const lowStockCount = inventory.filter((item) => item.stockQuantity <= LOW_STOCK_THRESHOLD).length;

  if (loading) return <p className="admin-loading">Chargement de l&apos;inventaire...</p>;

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <h2>Inventaire</h2>
          <p>
            {filtered.length} variante{filtered.length !== 1 ? 's' : ''}
            {trimmed && inventory.length !== filtered.length && (
              <span style={{ color: '#999' }}> sur {inventory.length}</span>
            )}
            {lowStockCount > 0 && (
              <span className="admin-inventory-alert">
                {' '}
                — {lowStockCount} en stock faible (≤ {LOW_STOCK_THRESHOLD})
              </span>
            )}
          </p>
        </div>
        <button type="button" className="admin-secondary-btn" onClick={loadInventory}>
          Actualiser
        </button>
      </div>

      {/* Live search bar */}
      <div className="admin-inventory-search-wrap">
        <div className="admin-inventory-search-inner">
          <input
            id="inventory-search"
            type="text"
            className="admin-inventory-search"
            placeholder="Rechercher par produit, couleur ou taille…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            aria-label="Rechercher dans l'inventaire"
          />
          {searchQuery && (
            <button
              type="button"
              className="admin-inventory-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Effacer la recherche"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {message && <p className="admin-message">{message}</p>}
      {error && <p className="admin-error">{error}</p>}

      {inventory.length === 0 ? (
        <p className="admin-empty">Aucune variante en stock.</p>
      ) : filtered.length === 0 ? (
        <div className="admin-inventory-no-results">
          <span>🔍</span>
          <p>Aucun résultat pour «&nbsp;<strong>{searchQuery}</strong>&nbsp;»</p>
          <button type="button" className="admin-secondary-btn" onClick={() => setSearchQuery('')}>
            Réinitialiser
          </button>
        </div>
      ) : (
        <div className="admin-inventory-table-wrap">
          <table className="stock-table admin-inventory-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Couleur</th>
                <th>Taille</th>
                <th>SKU</th>
                <th>Stock</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLowStock = item.stockQuantity <= LOW_STOCK_THRESHOLD;
                const isEditing = editing[item.variantId] !== undefined;
                const displayQty = isEditing ? editing[item.variantId] : item.stockQuantity;

                return (
                  <tr
                    key={item.variantId}
                    className={isLowStock ? 'admin-inventory-row--low' : ''}
                  >
                    <td data-label="Produit">
                      <span
                        className="admin-inventory-cell-highlight"
                        dangerouslySetInnerHTML={{
                          __html: trimmed
                            ? item.productTitle?.replace(
                                new RegExp(`(${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                '<mark>$1</mark>',
                              )
                            : item.productTitle,
                        }}
                      />
                      {item.productIsHidden && (
                        <span className="admin-badge-tag hidden">Masqué</span>
                      )}
                    </td>
                    <td data-label="Couleur">
                      <span
                        dangerouslySetInnerHTML={{
                          __html: trimmed
                            ? (item.colorName || '—').replace(
                                new RegExp(`(${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                '<mark>$1</mark>',
                              )
                            : (item.colorName || '—'),
                        }}
                      />
                    </td>
                    <td data-label="Taille">
                      <span
                        dangerouslySetInnerHTML={{
                          __html: trimmed
                            ? (item.size || '—').replace(
                                new RegExp(`(${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                '<mark>$1</mark>',
                              )
                            : (item.size || '—'),
                        }}
                      />
                    </td>
                    <td data-label="SKU" className="admin-inventory-sku">{item.sku || '—'}</td>
                    <td data-label="Stock">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={displayQty}
                        onChange={(e) => handleEditChange(item.variantId, e.target.value)}
                        aria-label={`Stock ${item.productTitle} ${item.colorName} ${item.size}`}
                      />
                    </td>
                    <td data-label="Statut">
                      {isLowStock ? (
                        <span className="admin-badge admin-badge--warning">Stock faible</span>
                      ) : (
                        <span className="admin-badge admin-badge--ok">OK</span>
                      )}
                    </td>
                    <td data-label="Action">
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={saving === item.variantId || !isEditing}
                        onClick={() => handleSave(item.variantId)}
                      >
                        {saving === item.variantId ? '...' : 'Enregistrer'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

