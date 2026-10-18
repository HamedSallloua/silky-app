import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useProducts } from '../../context/ProductsContext';
import { buildStockMatrix } from '../../utils/stock';
import { formatPrice } from '../../utils/formatPrice';
import { getEffectivePrice } from '../../utils/price';
import AdminProductReviewsSection from '../../components/AdminProductReviewsSection';

const EMPTY_PRODUCT = {
  name: '',
  description: '',
  price: 0,
  discount: 0,
  category: 'femme',
  mainImage: '',
  colors: [{ id: '', name: '', thumbnail: '', gallery: [] }],
  sizes: [''],
  stock: {},
  videos: [],
  collectionImage: '',
  isHidden: false,
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function mapProductColorsToForm(rawColors = []) {
  return rawColors.map((c, i) => {
    const rawImages = (c.images || (c.image ? [c.image] : [])).filter(Boolean);
    const thumbnail = (c.thumbnail || rawImages[0] || c.image || '').trim();
    const gallery = (c.gallery || rawImages.slice(1)).map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean);
    return {
      id: c.id || slugify(c.name) || `color-${i}`,
      name: (c.name || '').trim(),
      thumbnail,
      gallery,
    };
  });
}

function normalizeProduct(form) {
  const colors = form.colors
    .filter((c) => c.name.trim())
    .map((c, i) => {
      const thumbnail = (c.thumbnail || '').trim();
      const gallery = (c.gallery || []).map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean);
      const images = [thumbnail, ...gallery].filter(Boolean);
      return {
        id: c.id || slugify(c.name) || `color-${i}`,
        name: c.name.trim(),
        image: thumbnail,
        thumbnail,
        gallery,
        images,
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
    collectionImage: (form.collectionImage || '').trim(),
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

export default function AdminProducts({ highlightProductId = null, highlightReviewId = null }) {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    uploadProductVideo,
    deleteProductVideo,
  } = useProducts();
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'form'
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);

  const selectProduct = (product) => {
    if (!product) return;
    const latestProduct = products.find((p) => p.id === product.id) || product;
    setSelectedId(latestProduct.id);
    setIsNew(false);
    setForm({
      ...latestProduct,
      colors: mapProductColorsToForm(latestProduct.colors),
      sizes: [...(latestProduct.sizes || [])],
      stock: { ...(latestProduct.stock || {}) },
      videos: Array.isArray(latestProduct.videos) ? [...latestProduct.videos] : [],
      isHidden: latestProduct.isHidden === true || latestProduct.is_active === false,
    });
    setMessage('');
    setMobileView('form');
  };

  useEffect(() => {
    if (highlightProductId && products.length > 0) {
      const match = products.find((p) => p.id === highlightProductId);
      if (match) {
        selectProduct(match);
      }
    }
  }, [highlightProductId, products]);

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
              colors: mapProductColorsToForm(target.colors),
              sizes: [...(target.sizes || [])],
              stock: { ...(target.stock || {}) },
              videos: Array.isArray(target.videos) ? [...target.videos] : [],
              isHidden: target.isHidden === true || target.is_active === false,
            };
          }

          return {
            ...prevForm,
            stock: { ...(target.stock || {}) },
            videos: Array.isArray(target.videos) ? [...target.videos] : prevForm.videos || [],
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
      colors: [{ id: '', name: '', thumbnail: '', gallery: [] }],
      sizes: [''],
      stock: {},
      videos: [],
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

  const handleUploadThumbnail = async (colorIdx, file) => {
    if (!file) return;
    const url = await uploadFile(file);
    if (!url) return;

    setMessage('');
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIdx) return c;
        return { ...c, thumbnail: url };
      });
      const mainImage = f.mainImage || url;
      return { ...f, colors, mainImage };
    });
  };

  const handleReplaceThumbnail = async (colorIdx, file) => {
    if (!file) return;
    const oldThumb = form.colors[colorIdx]?.thumbnail;
    const url = await uploadFile(file);
    if (!url) return;

    setMessage('');
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIdx) return c;
        return { ...c, thumbnail: url };
      });
      let mainImage = f.mainImage;
      if (mainImage === oldThumb || !mainImage) {
        mainImage = url;
      }
      let collectionImage = f.collectionImage;
      if (collectionImage === oldThumb) {
        collectionImage = url;
      }
      return { ...f, colors, mainImage, collectionImage };
    });
  };

  const handleAddGalleryImage = async (colorIdx, file) => {
    if (!file) return;
    const url = await uploadFile(file);
    if (!url) return;

    setMessage('');
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIdx) return c;
        const gallery = [...(c.gallery || []), url];
        return { ...c, gallery };
      });
      return { ...f, colors };
    });
  };

  const handleReplaceGalleryImage = async (colorIdx, galleryIdx, file) => {
    if (!file) return;
    const oldUrl = form.colors[colorIdx]?.gallery?.[galleryIdx];
    const url = await uploadFile(file);
    if (!url) return;

    setMessage('');
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIdx) return c;
        const gallery = [...(c.gallery || [])];
        gallery[galleryIdx] = url;
        return { ...c, gallery };
      });
      let mainImage = f.mainImage;
      if (mainImage === oldUrl) {
        mainImage = url;
      }
      let collectionImage = f.collectionImage;
      if (collectionImage === oldUrl) {
        collectionImage = url;
      }
      return { ...f, colors, mainImage, collectionImage };
    });
  };

  const handleRemoveGalleryImage = (colorIdx, galleryIdx) => {
    const oldUrl = form.colors[colorIdx]?.gallery?.[galleryIdx];
    setForm((f) => {
      const colors = f.colors.map((c, i) => {
        if (i !== colorIdx) return c;
        const gallery = (c.gallery || []).filter((_, idx) => idx !== galleryIdx);
        return { ...c, gallery };
      });

      let mainImage = f.mainImage;
      if (mainImage === oldUrl) {
        const remainingImages = colors.flatMap((c) => [c.thumbnail, ...(c.gallery || [])]).filter(Boolean);
        mainImage = remainingImages[0] || f.collectionImage || '';
      }
      return { ...f, colors, mainImage };
    });
  };

  const handleRemoveColor = (colorIdx) => {
    const removedColor = form.colors[colorIdx];
    const removedImages = [removedColor?.thumbnail, ...(removedColor?.gallery || [])].filter(Boolean);

    setForm((f) => {
      const colors = f.colors.filter((_, i) => i !== colorIdx);
      let mainImage = f.mainImage;
      if (removedImages.includes(mainImage)) {
        const remainingImages = colors.flatMap((c) => [c.thumbnail, ...(c.gallery || [])]).filter(Boolean);
        mainImage = remainingImages[0] || f.collectionImage || '';
      }
      return { ...f, colors, mainImage };
    });
  };

  const handleUploadCollectionImage = async (file) => {
    if (!file) return;
    const url = await uploadFile(file);
    if (!url) return;

    setMessage('');
    updateField('collectionImage', url);
  };

  const handleUploadVideo = async (file) => {
    if (!file) return;
    if (isNew || !selectedId) {
      setMessage('Veuillez d\'abord enregistrer le produit avant d\'ajouter des vidéos.');
      return;
    }
    setVideoUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await uploadProductVideo(selectedId, formData);
      if (res?.product?.videos) {
        setForm((prev) => (prev ? { ...prev, videos: res.product.videos } : prev));
      }
      setMessage('Vidéo ajoutée avec succès.');
    } catch (err) {
      setMessage(err.message || 'Erreur lors du téléversement de la vidéo.');
    } finally {
      setVideoUploading(false);
    }
  };

  const handleConfirmDeleteVideo = async () => {
    if (!videoToDelete || !selectedId) return;
    try {
      await deleteProductVideo(selectedId, videoToDelete.id);
      setForm((prev) =>
        prev
          ? { ...prev, videos: (prev.videos || []).filter((v) => v.id !== videoToDelete.id) }
          : prev,
      );
      setVideoToDelete(null);
      setMessage('Vidéo supprimée.');
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la suppression de la vidéo.');
    }
  };

  const updateStock = (key, value) => {
    setForm((f) => ({ ...f, stock: { ...f.stock, [key]: value } }));
  };

  const handleSave = async () => {
    if (!form?.name?.trim()) {
      setMessage('Le nom du produit est requis.');
      return;
    }
    if (!form?.category?.trim()) {
      setMessage('Veuillez sélectionner une catégorie.');
      return;
    }
    if (!form?.description?.trim()) {
      setMessage('La description est requise.');
      return;
    }
    const priceNum = Number(form?.price);
    if (form?.price === '' || form?.price === null || form?.price === undefined || isNaN(priceNum) || priceNum <= 0) {
      setMessage('Le prix est requis et doit être supérieur à 0.');
      return;
    }
    const discountNum = Number(form?.discount ?? 0);
    if (isNaN(discountNum) || discountNum < 0) {
      setMessage('La remise doit être positive.');
      return;
    }
    if (discountNum > priceNum) {
      setMessage('La remise ne peut pas être supérieure au prix.');
      return;
    }
    if (!form?.collectionImage?.trim()) {
      setMessage('Veuillez ajouter une image de collection.');
      return;
    }
    const validSizes = (form?.sizes || []).map((s) => s.trim()).filter(Boolean);
    if (validSizes.length === 0) {
      setMessage('Veuillez ajouter au moins une taille.');
      return;
    }
    const rawColors = form?.colors || [];
    for (let i = 0; i < rawColors.length; i++) {
      const c = rawColors[i];
      if (!c.name?.trim()) {
        setMessage(`Le nom de la couleur ${i + 1} est requis.`);
        return;
      }
      const thumb = (c.thumbnail || c.images?.[0] || c.image || '').trim();
      if (!thumb) {
        setMessage(`Veuillez ajouter une miniature pour la couleur "${c.name.trim()}".`);
        return;
      }
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
          colors: mapProductColorsToForm(finalObj.colors),
        });
        setMessage('Produit ajouté avec succès.');
      } else {
        const saved = await updateProduct(selectedId, normalized);
        const finalObj = saved || { ...form, ...normalized };
        setForm({
          ...form,
          ...finalObj,
          colors: mapProductColorsToForm(finalObj.colors),
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

    setSaving(true);
    try {
      await deleteProduct(selectedId);
      const next = products.find((p) => p.id !== selectedId);
      setSelectedId(next?.id ?? null);
      setForm(
        next
          ? {
              ...next,
              colors: mapProductColorsToForm(next.colors),
              sizes: [...next.sizes],
              stock: { ...next.stock },
              isHidden: Boolean(next.isHidden),
            }
          : null,
      );
      setIsNew(false);
      setShowDeleteConfirm(false);
      setMessage('Produit supprimé.');
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la suppression.');
    } finally {
      setSaving(false);
    }
  };

  const stockMatrix = form ? buildStockMatrix(form) : [];

  const trimmed = searchQuery.trim().toLowerCase();
  const filteredProducts = trimmed
    ? products.filter(
        (p) =>
          p.name?.toLowerCase().includes(trimmed) ||
          p.category?.toLowerCase().includes(trimmed) ||
          p.description?.toLowerCase().includes(trimmed) ||
          p.colors?.some((c) => c.name?.toLowerCase().includes(trimmed)),
      )
    : products;

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
          <h3>
            Catalogue ({filteredProducts.length}
            {trimmed && products.length !== filteredProducts.length ? ` / ${products.length}` : ''})
          </h3>

          <div className="admin-products-search-wrap">
            <input
              type="text"
              className="admin-products-search-input"
              placeholder="Rechercher par nom, couleur, catégorie…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              aria-label="Rechercher dans le catalogue"
            />
            {searchQuery && (
              <button
                type="button"
                className="admin-products-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Effacer la recherche"
              >
                ✕
              </button>
            )}
          </div>

          <div className="product-list">
            {filteredProducts.length === 0 ? (
              <p className="admin-empty" style={{ padding: '24px 12px', textAlign: 'center', fontSize: '0.85rem', color: '#888' }}>
                Aucun produit trouvé {searchQuery ? `pour « ${searchQuery} »` : ''}.
              </p>
            ) : (
              filteredProducts.map((product) => (
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
              ))
            )}
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
                    <span className="admin-badge admin-badge--warning">● Masqué du site</span>
                  ) : (
                    <span className="admin-badge admin-badge--ok">● Visible sur le site</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`admin-btn ${form.isHidden ? 'secondary' : 'warning-btn'}`}
                  onClick={() => updateField('isHidden', !form.isHidden)}
                >
                  {form.isHidden ? 'Afficher sur le site' : 'Masquer du site'}
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
                      + Ajouter image collection
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          await handleUploadCollectionImage(file);
                          e.target.value = '';
                        }}
                        hidden
                      />
                    </label>
                  </div>
                </div>

                <p className="form-section-title">Couleurs et leurs images (miniatures & angles)</p>
                <div className="variant-list">
                  {form.colors.map((color, colorIdx) => (
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
                          justifyContent: 'space-between',
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
                          onClick={() => handleRemoveColor(colorIdx)}
                        >
                          Supprimer la couleur
                        </button>
                      </div>

                      <div className="form-field" style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Nom de la couleur (max 20 car.)</label>
                        <input
                          value={color.name}
                          placeholder="Ex: Noir, Rose, Blanc..."
                          maxLength={20}
                          onChange={(e) => updateColor(colorIdx, 'name', e.target.value)}
                        />
                      </div>

                      {/* Dedicated Thumbnail Section */}
                      <div className="admin-color-section admin-thumbnail-section" style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                          Miniature (image représentative de la couleur)
                        </label>
                        {color.thumbnail ? (
                          <div className="variant-row admin-image-row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <img src={color.thumbnail} alt="" className="admin-image-preview-sm" />
                            <label className="admin-btn sm secondary inline-upload-btn">
                              Modifier
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  await handleReplaceThumbnail(colorIdx, file);
                                  e.target.value = '';
                                }}
                                hidden
                              />
                            </label>
                            {(() => {
                              const isMain = form.mainImage === color.thumbnail;
                              return (
                                <button
                                  type="button"
                                  className={`admin-btn sm ${isMain ? 'primary' : 'secondary'}`}
                                  style={isMain ? { background: '#2e7d32', color: '#fff', borderColor: '#2e7d32' } : {}}
                                  onClick={() => updateField('mainImage', color.thumbnail)}
                                >
                                  {isMain ? 'Image principale (défaut)' : 'Définir comme principale'}
                                </button>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="variant-row admin-image-row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <label className="admin-upload-btn sm">
                              + Ajouter image miniature
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  await handleUploadThumbnail(colorIdx, file);
                                  e.target.value = '';
                                }}
                                hidden
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Dedicated Gallery Section */}
                      <div className="admin-color-section admin-gallery-section" style={{ marginTop: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                          Galerie (angles / positions supplémentaires)
                        </label>
                        {(color.gallery || []).map((galleryImg, galleryIdx) => {
                          const isMain = form.mainImage === galleryImg;
                          return (
                            <div key={galleryIdx} className="variant-row admin-image-row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                              {galleryImg && <img src={galleryImg} alt="" className="admin-image-preview-sm" />}
                              <label className="admin-btn sm secondary inline-upload-btn">
                                Modifier
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    await handleReplaceGalleryImage(colorIdx, galleryIdx, file);
                                    e.target.value = '';
                                  }}
                                  hidden
                                />
                              </label>
                              <button
                                type="button"
                                className={`admin-btn sm ${isMain ? 'primary' : 'secondary'}`}
                                style={isMain ? { background: '#2e7d32', color: '#fff', borderColor: '#2e7d32' } : {}}
                                onClick={() => updateField('mainImage', galleryImg)}
                              >
                                {isMain ? 'Image principale (défaut)' : 'Définir comme principale'}
                              </button>
                              <button
                                type="button"
                                className="admin-btn danger sm"
                                onClick={() => handleRemoveGalleryImage(colorIdx, galleryIdx)}
                              >
                                Suppr.
                              </button>
                            </div>
                          );
                        })}

                        <div className="admin-btn-group" style={{ marginTop: 6 }}>
                          <label className="admin-btn secondary inline-upload-btn sm">
                            + Ajouter image galerie
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                await handleAddGalleryImage(colorIdx, file);
                                e.target.value = '';
                              }}
                              hidden
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="admin-btn-group">
                    <button
                      type="button"
                      className="admin-btn secondary"
                      onClick={() => addListItem('colors', { id: '', name: '', thumbnail: '', gallery: [] })}
                    >
                      + Couleur
                    </button>
                  </div>
                </div>

                <p className="form-section-title">Vidéos du produit ({form.videos?.length || 0})</p>
                <div className="variant-list">
                  {isNew ? (
                    <p style={{ fontSize: 13, color: '#666', fontStyle: 'italic', margin: '4px 0 12px 0' }}>
                      Enregistrez le produit pour pouvoir téléverser des vidéos.
                    </p>
                  ) : (
                    <>
                      {(form.videos || []).map((vid, vidIdx) => (
                        <div
                          key={vid.id || vidIdx}
                          className="variant-row admin-image-row"
                          style={{ marginBottom: 8, flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
                        >
                          <video src={vid.videoUrl} className="admin-image-preview-sm" muted preload="metadata" />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                            Vidéo {vidIdx + 1}
                          </span>
                          <button
                            type="button"
                            className="admin-btn danger sm"
                            onClick={() => setVideoToDelete(vid)}
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                      <div className="admin-btn-group" style={{ marginTop: 6, marginBottom: 12 }}>
                        <label className="admin-btn secondary inline-upload-btn sm">
                          {videoUploading ? 'Téléversement...' : '+ Ajouter une vidéo'}
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/ogg,video/quicktime"
                            disabled={videoUploading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) await handleUploadVideo(file);
                              e.target.value = '';
                            }}
                            hidden
                          />
                        </label>
                      </div>
                    </>
                  )}
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
                    <button
                      type="button"
                      className="admin-btn danger"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={saving}
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                {!isNew && selectedId && (
                  <AdminProductReviewsSection productId={selectedId} highlightReviewId={highlightReviewId} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div
          className="admin-modal-overlay"
          onClick={() => setShowDeleteConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div
            className="admin-modal"
            style={{ maxWidth: '420px', padding: '24px', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-confirm-title" style={{ margin: '0 0 16px', fontSize: '1.2rem', color: '#111' }}>
              Supprimer ce produit ?
            </h3>
            <p style={{ margin: '0 0 24px', color: '#666', fontSize: '0.9rem' }}>
              Cette action est irréversible. Le produit &laquo; {form?.name} &raquo; sera définitivement supprimé.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="admin-btn secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={saving}
              >
                Annuler
              </button>
              <button
                type="button"
                className="admin-btn danger"
                onClick={handleDelete}
                disabled={saving}
              >
                {saving ? 'Suppression...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {videoToDelete && (
        <div
          className="admin-modal-overlay"
          onClick={() => setVideoToDelete(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="admin-modal"
            style={{ maxWidth: '400px', padding: '24px', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#111' }}>
              Supprimer cette vidéo ?
            </h3>
            <p style={{ margin: '0 0 20px', color: '#666', fontSize: '0.85rem' }}>
              Cette action supprimera définitivement la vidéo du produit.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="admin-btn secondary"
                onClick={() => setVideoToDelete(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="admin-btn danger"
                onClick={handleConfirmDeleteVideo}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


