import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProductReviewsSection from '../components/ProductReviewsSection';
import ProductPrice from '../components/ProductPrice';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useProducts } from '../context/ProductsContext';
import { useAuth } from '../context/AuthContext';
import { getEffectivePrice } from '../utils/price';
import { getAvailableStock, getStockStatus } from '../utils/stock';
import '../styles/product.css';

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getProduct, products, loading } = useProducts();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const product = getProduct(id);

  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [mainImage, setMainImage] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [isZoomed, setIsZoomed] = useState(false);

  const verticalTrackRef = useRef(null);
  const colorTrackRef = useRef(null);

  const allThumbnails = useMemo(() => {
    if (!product) return [];
    const result = [];
    if (product.colors?.length > 0) {
      product.colors.forEach((color) => {
        const colorImgs = color.images?.length
          ? color.images.filter(Boolean)
          : color.image
          ? [color.image]
          : [];
        colorImgs.forEach((src, idx) => {
          result.push({
            src,
            colorId: color.id,
            colorName: color.name,
            isMain: idx === 0,
            color,
          });
        });
      });
    }
    if (!result.length) {
      const fallbackList = product.thumbnails?.length ? product.thumbnails : [product.mainImage];
      fallbackList.filter(Boolean).forEach((src) => {
        result.push({ src, colorId: null, colorName: '', isMain: false, color: null });
      });
    }
    return result;
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const initialColor = product.colors?.[0] ?? null;
    setSelectedColor(initialColor);
    setSelectedSize(product.sizes?.[0] ?? null);
    // Use the admin-set product.mainImage as the initial display image.
    // Fall back to the first colour's image if no standalone mainImage was set.
    const initialMainImage = product.mainImage || initialColor?.images?.[0] || initialColor?.image || '';
    setMainImage(initialMainImage);
    setQuantity(1);
    setCartMessage('');
  }, [product?.id]);

  const scrollToColorThumbnail = (colorId) => {
    if (!verticalTrackRef.current || !colorId) return;
    const targetIdx = allThumbnails.findIndex((item) => item.colorId === colorId);
    if (targetIdx !== -1) {
      const track = verticalTrackRef.current;
      const buttons = track.querySelectorAll('.thumb_box_vertical');
      if (buttons[targetIdx]) {
        buttons[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const handleColorSelect = (color) => {
    setSelectedColor(color);
    const mainImg = color.images?.[0] || color.image || product.mainImage;
    setMainImage(mainImg);
    setCartMessage('');
    scrollToColorThumbnail(color.id);
  };

  const handleThumbnailSelect = (thumb) => {
    setMainImage(thumb.src);
  };

  const scrollVertical = (direction) => {
    if (verticalTrackRef.current) {
      verticalTrackRef.current.scrollBy({
        top: direction === 'up' ? -120 : 120,
        behavior: 'smooth',
      });
    }
  };

  const scrollHorizontal = (direction) => {
    if (colorTrackRef.current) {
      colorTrackRef.current.scrollBy({
        left: direction === 'left' ? -120 : 120,
        behavior: 'smooth',
      });
    }
  };

  const recommendations = useMemo(() => {
    if (!product) return [];
    return products.filter((p) => p.category === product.category && p.id !== product.id && !p.isHidden).slice(0, 4);
  }, [product, products]);

  const availableStock = product
    ? getAvailableStock(product, selectedColor?.id, selectedSize)
    : 0;

  const stockStatus = getStockStatus(availableStock);

  const buildDetails = () => {
    const parts = [];
    if (selectedColor?.name) parts.push(selectedColor.name);
    if (selectedSize) parts.push(`Taille ${selectedSize}`);
    return parts.join(' · ') || 'Standard';
  };

  const buildCartItem = () => ({
    productId: product.id,
    name: product.name,
    price: getEffectivePrice(product),
    quantity,
    image: mainImage || product.mainImage,
    colorId: selectedColor?.id ?? null,
    colorName: selectedColor?.name ?? '',
    size: selectedSize ?? null,
    details: buildDetails(),
  });

  const { isAdmin } = useAuth();

  const validateSelection = () => {
    if (isAdmin) {
      setCartMessage('Les administrateurs ne peuvent pas passer de commandes ou ajouter de favoris.');
      return false;
    }
    if (product.colors?.length && !selectedColor) {
      setCartMessage('Veuillez sélectionner une couleur.');
      return false;
    }
    if (product.sizes?.length && !selectedSize) {
      setCartMessage('Veuillez sélectionner une taille.');
      return false;
    }
    if (quantity > availableStock) {
      setCartMessage(`Stock insuffisant (${availableStock} disponible(s)).`);
      return false;
    }
    if (availableStock <= 0) {
      setCartMessage('Ce produit est en rupture de stock.');
      return false;
    }
    return true;
  };

  const handleAddToCart = async () => {
    if (isAdmin) {
      setCartMessage('Les administrateurs ne peuvent pas passer de commandes.');
      return;
    }
    if (!product || !validateSelection()) return;
    try {
      await addItem(buildCartItem());
      setCartMessage('Produit ajouté au panier.');
    } catch (err) {
      setCartMessage(err.message || 'Impossible d\'ajouter au panier.');
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: product.name,
      text: `Découvrez ${product.name} sur Silky`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user cancelled or unsupported */
      }
    }
    setShareOpen((v) => !v);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCartMessage('Lien copié dans le presse-papiers.');
      setShareOpen(false);
    } catch {
      setCartMessage('Impossible de copier le lien.');
    }
  };

  const handleCommander = async () => {
    if (isAdmin) {
      setCartMessage('Les administrateurs ne peuvent pas passer de commandes.');
      return;
    }
    if (!product || !validateSelection()) return;
    try {
      await addItem(buildCartItem());
      navigate('/checkout');
    } catch (err) {
      setCartMessage(err.message || 'Impossible d\'ajouter au panier.');
    }
  };

  if (loading) {
    return (
      <main className="product_page_wrapper">
        <p style={{ padding: 40, textAlign: 'center' }}>Chargement...</p>
      </main>
    );
  }

  if (!product || product.isHidden) {
    return (
      <main className="product_page_wrapper">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p>Produit non disponible.</p>
          <Link to="/" className="collection_btn" style={{ display: 'inline-block', marginTop: 16 }}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    );
  }

  const shareUrl = encodeURIComponent(window.location.href);
  const shareText = encodeURIComponent(`Découvrez ${product.name} sur Silky`);

  return (
    <>
      <main className="product_page_wrapper">
        <div className="thumbnails_vertical_container">
          <button type="button" className="scroll_arrow" onClick={() => scrollVertical('up')}>
            &uarr;
          </button>

          <div className="vertical_thumbnails_track" ref={verticalTrackRef}>
            {allThumbnails.map((thumb, index) => (
              <button
                key={`${thumb.src}-${index}`}
                type="button"
                className={`thumb_box_vertical${mainImage === thumb.src ? ' active' : ''}`}
                onClick={() => handleThumbnailSelect(thumb)}
              >
                <img src={thumb.src} alt="" />
              </button>
            ))}
          </div>

          <button type="button" className="scroll_arrow" onClick={() => scrollVertical('down')}>
            &darr;
          </button>
        </div>

        <div
          className="main_image_container"
          onClick={(e) => {
            const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(100, ((e.clientX - left) / width) * 100));
            const y = Math.max(0, Math.min(100, ((e.clientY - top) / height) * 100));
            setZoomPos({ x, y });
            setIsZoomed((prev) => !prev);
          }}
          onMouseMove={(e) => {
            if (!isZoomed) return;
            const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(100, ((e.clientX - left) / width) * 100));
            const y = Math.max(0, Math.min(100, ((e.clientY - top) / height) * 100));
            setZoomPos({ x, y });
          }}
          onMouseLeave={() => setIsZoomed(false)}
        >
          <img
            className="main_product_img"
            src={mainImage || product.mainImage}
            alt={product.name}
            style={{
              transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
              transform: isZoomed ? 'scale(2.2)' : 'scale(1)',
              transition: isZoomed ? 'transform-origin 0.05s ease-out, transform 0.15s ease-out' : 'transform 0.25s ease-out',
              cursor: isZoomed ? 'zoom-out' : 'zoom-in',
            }}
          />
        </div>

        <div className="product_info_panel">
          <h1 className="product_title">{product.name}</h1>

          <h2 className="section_subtitle">DÉTAILS</h2>
          <p className="product_description">{product.description}</p>

          {product.colors?.length > 0 && (
            <div className="color_section">
              <div className="color_header_line">
                <span className="section_subtitle" style={{ marginBottom: 0 }}>
                  COULEUR
                </span>
                <span className="selected_value_text">
                  {selectedColor?.name ?? 'Sélectionnez une couleur'}
                </span>
              </div>

              <div className="color_carousel_wrapper">
                <button type="button" className="scroll_arrow" onClick={() => scrollHorizontal('left')}>
                  &larr;
                </button>

                <div className="horizontal_colors_track" ref={colorTrackRef}>
                  {product.colors.map((color) => {
                    const colorMainImage = color.images?.[0] || color.image || product.mainImage;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        className={`color_thumb_box${selectedColor?.id === color.id ? ' active' : ''}`}
                        onClick={() => handleColorSelect(color)}
                      >
                        <img src={colorMainImage} alt={color.name} />
                      </button>
                    );
                  })}
                </div>

                <button type="button" className="scroll_arrow" onClick={() => scrollHorizontal('right')}>
                  &rarr;
                </button>
              </div>
            </div>
          )}

          {product.sizes?.length > 0 && (
            <div className="size_section">
              <div className="color_header_line">
                <span className="section_subtitle" style={{ marginBottom: 0 }}>
                  Taille
                </span>
                <span className="selected_value_text">
                  {selectedSize ? `Taille ${selectedSize}` : 'Sélectionnez une taille'}
                </span>
              </div>

              <div className="sizes_grid">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className="size_box"
                    style={selectedSize === size ? { backgroundColor: '#000', color: '#fff' } : undefined}
                    onClick={() => {
                      setSelectedSize(size);
                      setCartMessage('');
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="price_section">
            <span className="price_label">Prix</span>
            <ProductPrice product={product} size="large" />
          </div>

          <div className="action_row">
            <div className="quantity_wrapper">
              <div className="quantity_box">
                <button
                  type="button"
                  className="qty_btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  -
                </button>
                <input type="text" value={quantity} readOnly className="qty_input" />
                <button
                  type="button"
                  className="qty_btn"
                  onClick={() => setQuantity((q) => Math.min(q + 1, Math.max(availableStock, 1)))}
                >
                  +
                </button>
              </div>
              <span className="qty_label">Quantité</span>
            </div>

            <button type="button" className="add_to_cart_btn" onClick={handleAddToCart}>
              Ajouter Au Panier
            </button>

            <button
              type="button"
              className={`icon_action_btn${isFavorite(product.id) ? ' icon_action_btn_active' : ''}`}
              onClick={() => {
                if (isAdmin) {
                  setCartMessage('Les administrateurs ne peuvent pas ajouter de favoris.');
                  return;
                }
                toggleFavorite(product.id);
              }}
            >
              <div className="custom_icon_gap">
                <img src="/pictures/heart.png" alt="Favoris" />
              </div>
              <span>{isFavorite(product.id) ? 'Ajouté' : 'Favoris'}</span>
            </button>

            <div className="share_action_wrapper">
              <button type="button" className="icon_action_btn" onClick={handleShare}>
                <div className="custom_icon_gap">
                  <img src="/pictures/share.png" alt="Partagez" />
                </div>
                <span>Partagez</span>
              </button>

              {shareOpen && (
                <div className="share_dropdown">
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Facebook
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    X / Twitter
                  </a>
                  <a
                    href={`https://wa.me/?text=${shareText}%20${shareUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                  <button type="button" onClick={copyLink}>
                    Copier le lien
                  </button>
                </div>
              )}
            </div>
          </div>

          {cartMessage && <p className="stock_status_text">{cartMessage}</p>}

          <p className={`stock_status_text${stockStatus.inStock ? '' : ' out-of-stock'}`}>
            Stock: {stockStatus.text}
          </p>

          <button type="button" className="buy_now_btn" onClick={handleCommander}>
            Commander
          </button>

          <div className="guarantee_row">
            <div className="badge_icon_gap">
              <img src="/pictures/truckdilevery.png" alt="Livraison" />
            </div>
            <span>Livraison chez vous sous 24h - 48h.</span>
          </div>

          <div className="guarantee_row">
            <div className="badge_icon_gap">
              <img src="/pictures/echange.png" alt="Échange" />
            </div>
            <span>Échange possible dans 48 heures.</span>
          </div>
        </div>
      </main>

      <ProductReviewsSection productId={product.id} />

      {recommendations.length > 0 && (
        <section className="recommendations_section">
          <h2 className="recommendations_title">VOUS POURRIEZ AIMER</h2>

          <div className="recommendations_grid">
            {recommendations.map((rec) => (
              <div key={rec.id} className="product_card">
                <Link to={`/product/${rec.id}`} className="product_card_link">
                  <div className="product_card_img_wrapper">
                    <img src={rec.collectionImage || rec.mainImage} alt={rec.name} className="product_card_img" />
                  </div>
                  <h3 className="product_card_title">{rec.name}</h3>
                  <p className="product_card_price">
                    <ProductPrice product={rec} size="small" />
                  </p>
                </Link>
              </div>
            ))}
          </div>

          <div className="recommendations_cta_wrapper">
            <Link to={`/collection/${product.category}`} className="collection_btn">
              TOUTE LA COLLECTION {product.category === 'femme' ? 'FEMME' : 'ENFANT'}
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
