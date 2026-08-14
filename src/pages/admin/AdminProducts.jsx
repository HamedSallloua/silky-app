import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useProducts } from '../../context/ProductsContext';
import { buildStockMatrix } from '../../utils/stock';
import { formatPrice } from '../../utils/formatPrice';
import { getEffectivePrice } from '../../utils/price';

const EMPTY_PRODUCT = {
  name: '',
  description: '',
  price: 0,
  discount: 0,
  category: 'femme',
  mainImage: '',
  colors: [{ id: '', name: '', image: '', images: [''] }],
  sizes: [''],
  stock: {},
  collectionImage: '/pictures/femme_example.jpg',
  isHidden: false,
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeProduct(form) {
  const colors = form.colors
    .filter((c) => c.name.trim())
    .map((c, i) => {
      const rawImages = (c.images || (c.image ? [c.image] : []))
        .map((img) => (typeof img === 'string' ? img.trim() : ''))
        .filter(Boolean);
      return {
        id: c.id || slugify(c.name) || `color-${i}`,
        name: c.name.trim(),
        image: rawImages[0] || '',
        images: rawImages.length ? rawImages : [''],
      };
    });

  const sizes = form.sizes.map((s) => s.trim()).filter(Boolean);

  const stock = { ...form.stock };
  buildStockMatrix({ colors, sizes }).forEach(({ key }) => {
    if (stock[key] === undefined || stock[key] === '') stock[key] = 0;
    stock[key] = Number(stock[key]) || 0;
  });

  const allThumbnails = colors.flatMap((c) => c.images).filter(Boolean);
  const currentMain = (form.mainImage || '').trim();
  const mainImage = currentMain && allThumbnails.includes(currentMain)
    ? currentMain
    : (allThumbnails[0] || '');

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: Number(form.price) || 0,
    discount: Number(form.discount) || 0,
    category: form.category,
    mainImage,
    thumbnails: allThumbnails,
    colors,
    sizes,
    stock,
    collectionImage: form.collectionImage.trim() || mainImage || colors[0]?.image || '',
    isHidden: Boolean(form.isHidden),
  };
}

async function uploadFile(file) {
  if (!file) return null;
  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await api.uploadProductImage(formData);
    if (res?.url) return res.url;
  } catch (err) {
    console.warn('API upload failed, falling back to data URL:', err);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

export default function AdminProducts() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'form'

  const selectProduct = (product) => {
    if (!product) return;
    const latestProduct = products.find((p) => p.id === product.id) || product;
    setSelectedId(latestProduct.id);
    setIsNew(false);
    setForm({
      ...latestProduct,
      colors: (latestProduct.colors || []).map((c) => ({
        ...c,
        images: c.images?.length ? [...c.images] : [c.image || ''],
      })),
      sizes: [...(latestProduct.sizes || [])],
      stock: { ...(latestProduct.stock || {}) },
      isHidden: latestProduct.isHidden === true || latestProduct.is_active === false,
    });
    setMessage('');
    setMobileView('form');
  };

  useEffect(() => {
    if (products.length === 0) return;

    if (!isNew) {
      const target = selectedId
        ? products.find((p) => p.id === selectedId) || products[0]
        : products[0];

      if (target) {
        if (selectedId !== target.id) {
          setSelectedId(target.id);
        }

        setForm((prevForm) => {
          if (!prevForm || prevForm.id !== target.id) {
            return {
              ...target,
              colors: (target.colors || []).map((c) => ({
                ...c,
                images: c.images?.length ? [...c.images] : [c.image || ''],
              })),
              sizes: [...(target.sizes || [])],
              stock: { ...(target.stock || {}) },
              isHidden: target.isHidden === true || target.is_active === false,
            };
          }

          return {
            ...prevForm,
            stock: { ...(target.stock || {}) },
          };
        });
      }
    }
  }, [products, selectedId, isNew]);

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setForm({
      ...EMPTY_PRODUCT,
      colors: [{ id: '', name: '', image: '', images: [''] }],
      sizes: [''],
      stock: {},
      isHidden: false,
    });
    setMessage('');
    setMobileView('form');
  };

  const updateField = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const updateListItem = (field, index, value) => {
    setForm((f) => {
      const list = [...f[field]];
      let val = value;
      if (field === 'sizes') {
        val = val.replace(/\D/g, '').slice(0, 2);
      }
      list[index] = val;
      return { ...f, [field]: list };
    });
  };

  const addListItem = (field, template) => {
    setForm((f) => ({ ...f, [field]: [...f[field], template] }));
  };

  const removeListItem = (field, index) => {
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== index) }));
  };

  const updateColor = (index, key, value) => {
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== index) return c;
        let val = value;
        if (key === 'name') {
          val = val.slice(0, 20);
        }
        const updated = { ...c, [key]: val };
        if (key === 'name') {
          updated.id = slugify(val);
        }
        return updated;
      });
      return { ...f, colors };
    });
  };

  const updateColorImage = (colorIndex, imgIndex, value) => {
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIndex) return c;
        const images = [...(c.images || [c.image || ''])];
        images[imgIndex] = value;
        return { ...c, image: images[0] || '', images };
      });
      return { ...f, colors };
    });
  };

  const addColorImage = (colorIndex, value = '') => {
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIndex) return c;
        const images = [...(c.images || (c.image ? [c.image] : [''])), value];
        return { ...c, image: images[0] || '', images };
      });
      return { ...f, colors };
    });
  };

  const removeColorImage = (colorIndex, imgIndex) => {
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIndex) return c;
        const images = (c.images || [c.image || '']).filter((_, idx) => idx !== imgIndex);
        return { ...c, image: images[0] || '', images: images.length ? images : [''] };
      });
      return { ...f, colors };
    });
  };

  const updateStock = (key, value) => {
    setForm((f) => ({ ...f, stock: { ...f.stock, [key]: value } }));
  };

  const handleSave = async () => {
    if (!form?.name.trim()) {
      setMessage('Le nom du produit est requis.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const normalized = normalizeProduct(form);

      if (isNew) {
        const id = Date.now().toString();
        const created = await addProduct({ ...normalized, id });
        const finalObj = created || { ...normalized, id };
        setSelectedId(finalObj.id);
        setIsNew(false);
        setForm({
          ...finalObj,
          colors: (finalObj.colors || []).map((c) => ({
            ...c,
            images: c.images?.length ? [...c.images] : [c.image || ''],
          })),
        });
        setMessage('Produit ajouté avec succès.');
      } else {
        const saved = await updateProduct(selectedId, normalized);
        const finalObj = saved || { ...form, ...normalized };
        setForm({
          ...form,
          ...finalObj,
          colors: (finalObj.colors || []).map((c) => ({
            ...c,
            images: c.images?.length ? [...c.images] : [c.image || ''],
          })),
        });
        setMessage('Produit mis à jour avec succès.');
      }
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || isNew) return;
    if (!window.confirm('Supprimer ce produit ?')) return;

    setSaving(true);
    try {
      await deleteProduct(selectedId);
      const next = products.find((p) => p.id !== selectedId);
      setSelectedId(next?.id ?? null);
      setForm(
        next
          ? {
              ...next,
              colors: next.colors.map((c) => ({
                ...c,
                images: c.images?.length ? [...c.images] : [c.image || ''],
              })),
              sizes: [...next.sizes],
              stock: { ...next.stock },
              isHidden: Boolean(next.isHidden),
            }
          : null,
      );
      setIsNew(false);
      setMessage('Produit supprimé.');
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la suppression.');
    } finally {
      setSaving(false);
    }
  };

  const stockMatrix = form ? buildStockMatrix(form) : [];

  return (
    <section className="admin-products-section">
      <div className="admin-products-toolbar">
        <div>
          <h2>Produits</h2>
          <p>Ajoutez, modifiez ou supprimez les produits de la boutique.</p>
        </div>
        <button type="button" className="admin-btn" onClick={startNew}>
          + Nouveau produit
        </button>
      </div>

      {message && <p className="admin-message">{message}</p>}

      <div className={`admin-grid admin-grid--mobile-${mobileView}`}>
        <aside className="admin-products-panel">
          <h3>Catalogue ({products.length})</h3>
          <div className="product-list">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                className={`product-list-item${selectedId === product.id && !isNew ? ' active' : ''}${
                  product.isHidden ? ' product-hidden' : ''
                }`}
                onClick={() => selectProduct(product)}
              >
                <img src={product.collectionImage || product.mainImage} alt="" />
                <div className="product-list-item-info">
                  <strong>
                    {product.name}
                    {product.isHidden && <span className="admin-badge-tag hidden">Masqué</span>}
                  </strong>
                  <span>
                    {formatPrice(product.price)} · {product.category}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="admin-products-panel">
          {mobileView === 'form' && (
            <button
              type="button"
              className="admin-mobile-back-btn"
              onClick={() => setMobileView('list')}
            >
              ← Retour au catalogue
            </button>
          )}
          {!form ? (
            <div className="admin-empty">
              <p>Sélectionnez un produit ou créez-en un nouveau.</p>
            </div>
          ) : (
            <>
              <div className="admin-panel-form-header">
                <div className="admin-panel-title-with-badge">
                  <h3>{isNew ? 'Nouveau produit' : `Modifier : ${form.name}`}</h3>
                  {form.isHidden ? (
                    <span className="admin-badge admin-badge--warning">Masqué du site</span>
                  ) : (
                    <span className="admin-badge admin-badge--ok">Visible sur le site</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`admin-btn ${form.isHidden ? 'secondary' : 'warning-btn'}`}
                  onClick={() => updateField('isHidden', !form.isHidden)}
                >
                  {form.isHidden ? '👁️ Afficher sur le site' : '🙈 Masquer du site'}
                </button>
              </div>

              <div className="admin-form">
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="name">Nom</label>
                    <input id="name" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label htmlFor="category">Catégorie</label>
                    <select id="category" value={form.category} onChange={(e) => updateField('category', e.target.value)}>
                      <option value="femme">Femme</option>
                      <option value="enfant">Enfant</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" value={form.description} onChange={(e) => updateField('description', e.target.value)} />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="price">Prix (TND)</label>
                    <input
                      id="price"
                      type="number"
                      step="0.001"
                      min="0"
                      value={form.price}
                      onChange={(e) => updateField('price', e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="discount">Remise (TND)</label>
                    <input
                      id="discount"
                      type="number"
                      step="0.001"
                      min="0"
                      value={form.discount ?? 0}
                      onChange={(e) => updateField('discount', e.target.value)}
                    />
                  </div>
                </div>

                {Number(form.discount) > 0 && (
                  <p className="admin-discount-preview">
                    Prix après remise : <strong>{formatPrice(getEffectivePrice(form))}</strong>
                  </p>
                )}
                <div className="form-field">
                  <label htmlFor="collectionImage">Image collection (accueil)</label>
                  <div className="admin-image-input-group">
                    {form.collectionImage && (
                      <img src={form.collectionImage} alt="Aperçu" className="admin-image-preview" />
                    )}
                    <label className="admin-upload-btn">
                      📁 Téléverser
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadFile(file);
                          if (url) updateField('collectionImage', url);
                        }}
                        hidden
                      />
                    </label>
                  </div>
                </div>

                <p className="form-section-title">Couleurs et leurs images (miniatures & angles)</p>
                <div className="variant-list">
                  {form.colors.map((color, colorIdx) => {
                    const colorImages = color.images?.length ? color.images : [color.image || ''];
                    return (
                      <div
                        key={colorIdx}
                        className="admin-color-card"
                        style={{
                          background: '#fafafa',
                          border: '1px solid #e0e0e0',
                          padding: 16,
                          borderRadius: 8,
                          marginBottom: 16,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justify: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                          }}
                        >
                          <strong style={{ fontSize: 14, color: '#333' }}>
                            Couleur {colorIdx + 1} {color.name ? `: ${color.name}` : ''}
                          </strong>
                          <button
                            type="button"
                            className="admin-btn danger sm"
                            onClick={() => removeListItem('colors', colorIdx)}
                          >
                            Supprimer la couleur
                          </button>
                        </div>

                        <div className="form-field" style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 12, fontWeight: 600 }}>Nom de la couleur (max 20 car.)</label>
                          <input
                            value={color.name}
                            placeholder="Ex: Noir, Rose, Blanc..."
                            maxLength={20}
                            onChange={(e) => updateColor(colorIdx, 'name', e.target.value)}
                          />
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                            Images de cette couleur
                          </label>
                          {colorImages.map((imgUrl, imgIdx) => {
                            const isMain = form.mainImage
                              ? form.mainImage === imgUrl
                              : (colorIdx === 0 && imgIdx === 0 && Boolean(imgUrl));

                            return (
                              <div key={imgIdx} className="variant-row admin-image-row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                {imgUrl && <img src={imgUrl} alt="" className="admin-image-preview-sm" />}
                                <label className="admin-upload-btn sm">
                                  📁 Téléverser
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const url = await uploadFile(file);
                                      if (url) {
                                        updateColorImage(colorIdx, imgIdx, url);
                                        if (isMain || !form.mainImage) updateField('mainImage', url);
                                      }
                                    }}
                                    hidden
                                  />
                                </label>
                                {imgUrl && (
                                  <button
                                    type="button"
                                    className={`admin-btn sm ${isMain ? 'primary' : 'secondary'}`}
                                    style={isMain ? { background: '#2e7d32', color: '#fff', borderColor: '#2e7d32' } : {}}
                                    onClick={() => updateField('mainImage', imgUrl)}
                                  >
                                    {isMain ? '★ Image principale (défaut)' : '☆ Définir comme principale'}
                                  </button>
                                )}
                                {colorImages.length > 1 && (
                                  <button
                                    type="button"
                                    className="admin-btn danger sm"
                                    onClick={() => removeColorImage(colorIdx, imgIdx)}
                                  >
                                    Suppr.
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          <div className="admin-btn-group" style={{ marginTop: 6 }}>
                            <label className="admin-btn secondary inline-upload-btn sm">
                              📁 + Ajouter image pour cette couleur
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const url = await uploadFile(file);
                                  if (url) addColorImage(colorIdx, url);
                                }}
                                hidden
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="admin-btn-group">
                    <button
                      type="button"
                      className="admin-btn secondary"
                      onClick={() => addListItem('colors', { id: '', name: '', image: '', images: [''] })}
                    >
                      + Nouvelle couleur
                    </button>
                    <label className="admin-btn secondary inline-upload-btn">
                      📁 + Ajouter couleur avec image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadFile(file);
                          if (url) addListItem('colors', { id: '', name: '', image: url, images: [url] });
                        }}
                        hidden
                      />
                    </label>
                  </div>
                </div>

                <p className="form-section-title">Tailles</p>
                <div className="variant-list">
                  {form.sizes.map((size, i) => (
                    <div key={i} className="variant-row size-row">
                      <input
                        value={size}
                        placeholder="Ex: 38"
                        maxLength={2}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) => updateListItem('sizes', i, e.target.value)}
                      />
                      <button type="button" className="admin-btn danger" onClick={() => removeListItem('sizes', i)}>
                        Suppr.
                      </button>
                    </div>
                  ))}
                  <button type="button" className="admin-btn secondary" onClick={() => addListItem('sizes', '')}>
                    + Taille
                  </button>
                </div>

                <p className="form-section-title">Stock par variante</p>
                {stockMatrix.length > 0 && (
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Variante</th>
                        <th>Quantité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMatrix.map(({ key, label }) => (
                        <tr key={key}>
                          <td>{label}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={form.stock[key] ?? 0}
                              onChange={(e) => updateStock(key, e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="form-footer">
                  <button type="button" className="admin-btn" onClick={handleSave} disabled={saving}>
                    {saving ? 'Enregistrement...' : isNew ? 'Ajouter le produit' : 'Enregistrer les modifications'}
                  </button>
                  {!isNew && selectedId && (
                    <button type="button" className="admin-btn danger" onClick={handleDelete} disabled={saving}>
                      Supprimer
                    </button>
                  )}
                </div>

                {!isNew && selectedId && (
                  <AdminProductReviewsSection productId={selectedId} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function AdminProductReviewsSection({ productId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReviews = async () => {
    if (!productId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getAdminProductReviews(productId);
      setReviews(data || []);
    } catch (err) {
      setError(err.message || 'Impossible de charger les avis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [productId]);

  const handleUpdateStatus = async (reviewId, status) => {
    try {
      await api.updateAdminProductReview(reviewId, { status });
      loadReviews();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleGeneral = async (reviewId, currentVal) => {
    try {
      await api.updateAdminProductReview(reviewId, { showInGeneral: !currentVal });
      loadReviews();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (reviewId) => {
    if (!window.confirm('Supprimer cet avis produit ?')) return;
    try {
      await api.deleteAdminProductReview(reviewId);
      loadReviews();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p className="admin-loading" style={{ marginTop: 20 }}>Chargement des avis du produit...</p>;

  return (
    <div className="admin-product-reviews-container" style={{ marginTop: 30, paddingTop: 20, borderTop: '1px solid #eee' }}>
      <h4 style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>Avis clients pour ce produit ({reviews.length})</h4>
      {error && <p className="admin-message error" style={{ color: 'red' }}>{error}</p>}

      {reviews.length === 0 ? (
        <p className="admin-empty" style={{ fontSize: 13, color: '#666' }}>Aucun avis soumis pour ce produit.</p>
      ) : (
        <div className="admin-reviews-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reviews.map((review) => (
            <div
              key={review.id}
              className={`admin-review-card ${review.status}`}
              style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <strong>{review.authorName} <span style={{ color: '#f5a623' }}>({review.rating}/5★)</span></strong>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontWeight: 'bold',
                    background: review.status === 'approved' ? '#e8f5e9' : review.status === 'rejected' ? '#ffebee' : '#fff3e0',
                    color: review.status === 'approved' ? '#2e7d32' : review.status === 'rejected' ? '#c62828' : '#e65100',
                  }}
                >
                  {review.status === 'approved' ? 'Approuvé' : review.status === 'rejected' ? 'Refusé' : 'En attente'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#333', marginBottom: 10, lineHeight: 1.4 }}>{review.comment || review.body}</p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {review.status !== 'approved' && (
                  <button type="button" className="admin-btn sm" onClick={() => handleUpdateStatus(review.id, 'approved')}>
                    Approuver
                  </button>
                )}
                {review.status !== 'rejected' && (
                  <button type="button" className="admin-btn secondary sm" onClick={() => handleUpdateStatus(review.id, 'rejected')}>
                    Refuser
                  </button>
                )}
                <button type="button" className="admin-btn danger sm" onClick={() => handleDelete(review.id)}>
                  Supprimer
                </button>

                <button
                  type="button"
                  className={`admin-btn sm ${review.showInGeneral ? 'warning-btn' : 'secondary'}`}
                  style={{ marginLeft: 'auto' }}
                  onClick={() => handleToggleGeneral(review.id, review.showInGeneral)}
                >
                  {review.showInGeneral ? '★ Visible dans Avis Généraux (clic pour masquer)' : '+ Afficher dans Avis Généraux'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

