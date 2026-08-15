import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProductPrice from '../components/ProductPrice';
import ProductBadges from '../components/ProductBadges';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useProducts } from '../context/ProductsContext';
import { useAuth } from '../context/AuthContext';
import '../styles/home.css';

export default function Favorites() {
  const { isAdmin } = useAuth();
  const { favoriteIds, removeFavorite, loading: favoritesLoading, error: favoritesError } = useFavorites();
  const { getProduct, loading } = useProducts();
  const { addItem } = useCart();
  const [addedId, setAddedId] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const favorites = favoriteIds.map((id) => getProduct(id)).filter(Boolean);

  const handleRemove = async (e, productId) => {
    e.preventDefault();
    e.stopPropagation();
    setRemovingId(productId);
    try {
      await removeFavorite(productId);
    } catch (err) {
      console.error('Error removing favorite:', err);
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddToCart = async (e, product) => {
    e.preventDefault();
    e.stopPropagation();

    const variant = product.variants?.[0];
    const colorObj = product.colors?.[0];
    const colorId =
      variant?.colorSlug ||
      colorObj?.id ||
      (typeof colorObj === 'string' ? colorObj : null);
    const colorName = colorObj?.name || (typeof colorObj === 'string' ? colorObj : '');
    const size = variant?.size || product.sizes?.[0] || null;
    const parts = [];
    if (colorName) parts.push(colorName);
    if (size) parts.push(`Taille ${size}`);
    const details = parts.join(' · ') || 'Standard';

    try {
      await addItem({
        productId: product.id,
        name: product.name,
        price: product.discount ? product.price - product.discount : product.price,
        quantity: 1,
        image: product.collectionImage || product.mainImage,
        colorId,
        colorName,
        size,
        details,
      });

      setAddedId(product.id);
      setTimeout(() => setAddedId(null), 2000);
    } catch (err) {
      console.error('Error adding to cart:', err);
    }
  };

  if (isAdmin) {
    return (
      <main className="collections_wrapper" style={{ minHeight: 400, paddingTop: 40 }}>
        <h1 className="collection_title">Mes Favoris</h1>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 16, color: '#b00020', marginBottom: 24 }}>
            Les administrateurs ne disposent pas de liste de favoris.
          </p>
          <Link to="/admin" className="tout_button">
            Retour au panneau d&apos;administration
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="collections_wrapper" style={{ minHeight: 400, paddingTop: 40 }}>
      <h1 className="collection_title">Mes Favoris</h1>

      {favoritesError && (
        <p style={{ textAlign: 'center', color: '#b00020', marginBottom: 16 }} role="alert">
          {favoritesError}
        </p>
      )}

      {loading || favoritesLoading ? (
        <p style={{ textAlign: 'center' }}>Chargement...</p>
      ) : favorites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 16, color: '#555', marginBottom: 24 }}>
            Votre liste de favoris est vide.
          </p>
          <Link to="/" className="tout_button">
            Découvrir nos produits
          </Link>
        </div>
      ) : (
        <div className="products_grid">
          {favorites.map((product) => {
            const variant = product.variants?.[0];
            const colorObj = product.colors?.[0];
            const colorName = colorObj?.name || (typeof colorObj === 'string' ? colorObj : '');
            const size = variant?.size || product.sizes?.[0] || null;
            const variantParts = [];
            if (colorName) variantParts.push(`Couleur : ${colorName}`);
            if (size) variantParts.push(`Taille : ${size}`);
            const variantText = variantParts.join(' · ');

            return (
              <div key={product.id} className="product_card">
                <div className="product_image_container" style={{ position: 'relative' }}>
                  <ProductBadges product={product} className="fav_product_badges" />
                  <Link to={`/product/${product.id}`} className="product_card_link">
                    <img
                      src={product.collectionImage || product.mainImage}
                      alt={product.name}
                      className="product_img"
                    />
                  </Link>
                  <button
                    type="button"
                    className="fav_image_remove_icon"
                    onClick={(e) => handleRemove(e, product.id)}
                    title="Supprimer des favoris"
                    aria-label="Supprimer des favoris"
                    disabled={removingId === product.id}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </button>
                </div>

                <div className="product_info" style={{ width: '100%' }}>
                  <Link to={`/product/${product.id}`} className="product_card_link">
                    <h3 className="product_name">{product.name}</h3>
                    <p className="product_price">
                      <ProductPrice product={product} size="small" />
                    </p>
                    {variantText && <p className="fav_variant_info">{variantText}</p>}
                  </Link>

                  <div className="fav_card_actions">
                    <button
                      type="button"
                      className="fav_add_to_cart_btn"
                      onClick={(e) => handleAddToCart(e, product)}
                      disabled={addedId === product.id}
                    >
                      {addedId === product.id ? '✓ Ajouté au panier' : 'Ajouter au panier'}
                    </button>
                    <button
                      type="button"
                      className="fav_remove_btn"
                      onClick={(e) => handleRemove(e, product.id)}
                      disabled={removingId === product.id}
                    >
                      Retirer des favoris
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
