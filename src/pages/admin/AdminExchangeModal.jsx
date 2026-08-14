import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { generateExchangePdf } from '../../utils/orderPdf';
import { formatPrice } from '../../utils/formatPrice';

const TUNISIAN_GOVERNORATES = [
  'Ariana',
  'Béja',
  'Ben Arous',
  'Bizerte',
  'Gabès',
  'Gafsa',
  'Jendouba',
  'Kairouan',
  'Kasserine',
  'Kébili',
  'Kef',
  'Mahdia',
  'Manouba',
  'Médenine',
  'Monastir',
  'Nabeul',
  'Sfax',
  'Sidi Bouzid',
  'Siliana',
  'Sousse',
  'Tataouine',
  'Tozeur',
  'Tunis',
  'Zaghouan',
];

const EMPTY_LINE = { variantId: '', quantity: 1 };

function parseGovAndAddress(fullAddressStr = '') {
  if (!fullAddressStr) return { governorate: '', streetAddress: '' };
  const parts = fullAddressStr.split(' — ');
  if (parts.length >= 2 && TUNISIAN_GOVERNORATES.includes(parts[0].trim())) {
    return {
      governorate: parts[0].trim(),
      streetAddress: parts.slice(1).join(' — ').trim(),
    };
  }
  return { governorate: '', streetAddress: fullAddressStr };
}

function VariantSearchSelect({ inventory, value, onChange, required, index }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const selectedItem = inventory.find((item) => item.variantId === value);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    onChange(item.variantId);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setIsOpen(true);
  };

  const filteredInventory = inventory.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    const titleMatch = item.productTitle?.toLowerCase().includes(q);
    const colorMatch = item.colorName?.toLowerCase().includes(q);
    const sizeMatch = item.size?.toLowerCase().includes(q);
    const skuMatch = item.sku?.toLowerCase().includes(q);
    return titleMatch || colorMatch || sizeMatch || skuMatch;
  });

  return (
    <div className="admin-variant-select-wrapper" ref={wrapperRef}>
      <div
        className={`admin-variant-select-input-container ${isOpen ? 'is-open' : ''} ${selectedItem ? 'has-value' : ''}`}
        onClick={() => {
          if (!isOpen) setIsOpen(true);
        }}
      >
        {selectedItem && !isOpen ? (
          <div className="admin-variant-selected-display">
            {selectedItem.colorImageUrl ? (
              <img src={selectedItem.colorImageUrl} alt="" className="admin-variant-thumb" />
            ) : (
              <div className="admin-variant-thumb-placeholder" />
            )}
            <span className="admin-variant-text">
              <strong>{selectedItem.productTitle}</strong> — {selectedItem.colorName} — Taille{' '}
              <span className="admin-variant-size-tag">{selectedItem.size}</span> ({selectedItem.stockQuantity} dispo.)
            </span>
          </div>
        ) : (
          <input
            type="text"
            className="admin-variant-search-input"
            placeholder={
              selectedItem
                ? `${selectedItem.productTitle} — ${selectedItem.colorName} — Taille ${selectedItem.size}`
                : 'Rechercher par nom, couleur, taille...'
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            required={required && !value}
            aria-label={`Recherche variante article ${index + 1}`}
          />
        )}

        {(value || query) && (
          <button
            type="button"
            className="admin-variant-clear-btn"
            onClick={handleClear}
            title="Effacer la sélection"
            aria-label="Effacer la sélection"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <div className="admin-variant-dropdown">
          {filteredInventory.length === 0 ? (
            <div className="admin-variant-dropdown-empty">
              Aucune variante trouvée {query ? `pour "${query}"` : ''}
            </div>
          ) : (
            filteredInventory.map((item) => {
              const isSelected = item.variantId === value;
              return (
                <div
                  key={item.variantId}
                  className={`admin-variant-dropdown-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelect(item)}
                >
                  {item.colorImageUrl ? (
                    <img src={item.colorImageUrl} alt="" className="admin-variant-thumb" />
                  ) : (
                    <div className="admin-variant-thumb-placeholder" />
                  )}
                  <div className="admin-variant-item-info">
                    <span className="admin-variant-title">{item.productTitle}</span>
                    <span className="admin-variant-details">
                      Couleur: <strong>{item.colorName}</strong> | Taille: <strong>{item.size}</strong>
                    </span>
                  </div>
                  <span className={`admin-variant-stock ${item.stockQuantity <= 5 ? 'low' : ''}`}>
                    {item.stockQuantity} dispo.
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminExchangeModal({ open, order, onClose, onSuccess }) {
  const [inventory, setInventory] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    customerName: '',
    phoneNumber: '',
    customerEmail: '',
    governorate: '',
    shippingAddress: '',
    deliveryFee: '',
    items: [{ ...EMPTY_LINE }],
  });

  useEffect(() => {
    if (!open || !order) return;

    setError('');
    setSuccess('');
    setFieldErrors({});

    // Determine latest state (either latest exchange or original order)
    let latestState = order;
    if (order.exchanges && order.exchanges.length > 0) {
      latestState = order.exchanges[order.exchanges.length - 1];
    }

    const custName =
      latestState.customer?.name ||
      `${latestState.customer?.firstName || ''} ${latestState.customer?.lastName || ''}`.trim();
    const phone = latestState.customer?.phone || '';
    const email = latestState.customer?.email || '';
    const rawAddress = latestState.customer?.address || '';
    const { governorate, streetAddress } = parseGovAndAddress(rawAddress);
    const delFee =
      latestState.deliveryFee !== undefined && latestState.deliveryFee !== null
        ? String(latestState.deliveryFee)
        : '';

    const initialItems =
      Array.isArray(latestState.items) && latestState.items.length > 0
        ? latestState.items.map((it) => ({
            variantId: it.variantId || '',
            quantity: Number(it.quantity) || 1,
          }))
        : [{ ...EMPTY_LINE }];

    setForm({
      customerName: custName,
      phoneNumber: phone,
      customerEmail: email,
      governorate,
      shippingAddress: streetAddress,
      deliveryFee: delFee,
      items: initialItems,
    });

    setLoadingInventory(true);
    api
      .getAdminInventory()
      .then(setInventory)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingInventory(false));
  }, [open, order]);

  if (!open || !order) return null;

  const updateField = (field, value) => {
    let newValue = value;
    if (field === 'phoneNumber') {
      newValue = value.replace(/\D/g, '').slice(0, 8);
    } else if (field === 'deliveryFee') {
      newValue = value.replace(/\D/g, '').slice(0, 6);
    }
    setForm((prev) => ({ ...prev, [field]: newValue }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const updateItem = (index, field, value) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
    if (fieldErrors.items) {
      setFieldErrors((prev) => ({ ...prev, items: '' }));
    }
  };

  const addLine = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...EMPTY_LINE }] }));
  };

  const removeLine = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== index) : prev.items,
    }));
  };

  const validateForm = () => {
    const errors = {};

    const trimmedName = (form.customerName || '').trim();
    if (!trimmedName) {
      errors.customerName = 'Le nom du client est obligatoire.';
    } else if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmedName)) {
      errors.customerName = 'Le nom du client doit contenir uniquement des lettres.';
    } else if (trimmedName.length < 3) {
      errors.customerName = 'Le nom du client doit contenir au moins 3 lettres.';
    } else if (trimmedName.length > 35) {
      errors.customerName = 'Le nom du client ne doit pas dépasser 35 lettres.';
    }

    const trimmedPhone = (form.phoneNumber || '').trim();
    if (!trimmedPhone) {
      errors.phoneNumber = 'Le numéro de téléphone est obligatoire.';
    } else if (!/^\d{8}$/.test(trimmedPhone)) {
      errors.phoneNumber = 'Le numéro de téléphone doit contenir exactement 8 chiffres.';
    }

    const trimmedEmail = (form.customerEmail || '').trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.customerEmail = 'Veuillez entrer une adresse e-mail valide.';
    }

    if (!form.governorate) {
      errors.governorate = 'Veuillez sélectionner un gouvernorat.';
    }

    const trimmedAddress = (form.shippingAddress || '').trim();
    if (!trimmedAddress) {
      errors.shippingAddress = "L'adresse de livraison est obligatoire.";
    }

    const trimmedFee = (form.deliveryFee || '').toString().trim();
    if (trimmedFee && !/^\d{1,6}$/.test(trimmedFee)) {
      errors.deliveryFee = 'Les frais de livraison doivent contenir uniquement des chiffres (max 6 chiffres).';
    }

    const validItems = form.items.filter((line) => line.variantId);
    if (!validItems.length) {
      errors.items = 'Ajoutez au moins un article.';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    const items = form.items
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId,
        quantity: Math.max(1, parseInt(line.quantity, 10) || 1),
      }));

    const fullShippingAddress = `${form.governorate} — ${form.shippingAddress.trim()}`;

    const customerData = {
      customerName: form.customerName.trim(),
      phoneNumber: form.phoneNumber.trim(),
      shippingAddress: fullShippingAddress,
    };
    if (form.customerEmail.trim()) customerData.customerEmail = form.customerEmail.trim();

    const payload = {
      customer: customerData,
      items,
    };

    if (form.deliveryFee !== '') payload.deliveryFee = Number(form.deliveryFee);

    try {
      // 1. Get server preview & validate stock server-side
      const previewData = await api.previewExchange(order.id, payload);

      // 2. Generate and download PDF client-side
      const pdfSuccess = generateExchangePdf(previewData);

      // 3. Only after successful PDF generation/download, finalize exchange in DB
      if (!pdfSuccess) {
        throw new Error('Échec de la génération du PDF d\'échange.');
      }

      const updatedOrder = await api.createExchange(order.id, payload);

      const latestExchange =
        updatedOrder.exchanges && updatedOrder.exchanges.length > 0
          ? updatedOrder.exchanges[updatedOrder.exchanges.length - 1]
          : null;

      const exchangeNum = latestExchange?.exchangeNumber || 'enregistré';
      const exchangeTotal = latestExchange ? formatPrice(latestExchange.total) : '';

      setSuccess(`Échange ${exchangeNum} finalisé avec succès — Total: ${exchangeTotal}`);
      onSuccess?.(updatedOrder);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Erreur lors de la création de l\'échange');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exchange-order-title"
      >
        <div className="admin-modal-header">
          <h2 id="exchange-order-title">Créer un Échange — {order.orderNumber}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form className="admin-form admin-manual-order-form" onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="exch-customerName">Nom du client *</label>
              <input
                id="exch-customerName"
                value={form.customerName}
                onChange={(e) => updateField('customerName', e.target.value)}
                className={fieldErrors.customerName ? 'input-error' : ''}
              />
              {fieldErrors.customerName && (
                <span className="field-error-msg">{fieldErrors.customerName}</span>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="exch-phoneNumber">Téléphone (8 chiffres) *</label>
              <input
                id="exch-phoneNumber"
                type="tel"
                inputMode="numeric"
                maxLength={8}
                value={form.phoneNumber}
                onChange={(e) => updateField('phoneNumber', e.target.value)}
                className={fieldErrors.phoneNumber ? 'input-error' : ''}
              />
              {fieldErrors.phoneNumber && (
                <span className="field-error-msg">{fieldErrors.phoneNumber}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="exch-customerEmail">Email (optionnel)</label>
              <input
                id="exch-customerEmail"
                type="email"
                value={form.customerEmail}
                onChange={(e) => updateField('customerEmail', e.target.value)}
                className={fieldErrors.customerEmail ? 'input-error' : ''}
              />
              {fieldErrors.customerEmail && (
                <span className="field-error-msg">{fieldErrors.customerEmail}</span>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="exch-deliveryFee">Frais de livraison (optionnel, TND)</label>
              <input
                id="exch-deliveryFee"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Par défaut: frais du site"
                value={form.deliveryFee}
                onChange={(e) => updateField('deliveryFee', e.target.value)}
                className={fieldErrors.deliveryFee ? 'input-error' : ''}
              />
              {fieldErrors.deliveryFee && (
                <span className="field-error-msg">{fieldErrors.deliveryFee}</span>
              )}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="exch-shippingAddress">Adresse de livraison *</label>
            <select
              id="exch-governorate"
              className={`admin-governorate-select ${fieldErrors.governorate ? 'input-error' : ''}`}
              value={form.governorate}
              onChange={(e) => updateField('governorate', e.target.value)}
            >
              <option value="">Sélectionner un gouvernorat *</option>
              {TUNISIAN_GOVERNORATES.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
            </select>
            {fieldErrors.governorate && (
              <span className="field-error-msg">{fieldErrors.governorate}</span>
            )}
            <textarea
              id="exch-shippingAddress"
              value={form.shippingAddress}
              onChange={(e) => updateField('shippingAddress', e.target.value)}
              placeholder="Rue, quartier, code postal, etc."
              rows={2}
              className={fieldErrors.shippingAddress ? 'input-error' : ''}
            />
            {fieldErrors.shippingAddress && (
              <span className="field-error-msg">{fieldErrors.shippingAddress}</span>
            )}
          </div>

          <p className="form-section-title">Articles de l'Échange</p>

          {loadingInventory ? (
            <p className="admin-loading">Chargement des variantes...</p>
          ) : (
            <div className="admin-manual-order-lines">
              {form.items.map((line, index) => (
                <div key={index} className="admin-manual-order-line">
                  <VariantSearchSelect
                    inventory={inventory}
                    value={line.variantId}
                    onChange={(variantId) => updateItem(index, 'variantId', variantId)}
                    required={index === 0}
                    index={index}
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={line.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    aria-label={`Quantité article ${index + 1}`}
                  />
                  {form.items.length > 1 && (
                    <button
                      type="button"
                      className="admin-btn danger"
                      onClick={() => removeLine(index)}
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
              {fieldErrors.items && (
                <span className="field-error-msg" style={{ marginBottom: '8px' }}>
                  {fieldErrors.items}
                </span>
              )}
              <button type="button" className="admin-btn secondary" onClick={addLine}>
                + Ajouter un article
              </button>
            </div>
          )}

          {error && <p className="admin-error">{error}</p>}
          {success && <p className="admin-message">{success}</p>}

          <div className="form-footer">
            <button type="button" className="admin-btn secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="admin-btn" disabled={submitting || loadingInventory}>
              {submitting ? 'Traitement...' : 'Télécharger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
