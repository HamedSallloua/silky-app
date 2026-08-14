import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatPrice';
import '../styles/cart.css';

export default function Cart() {
  const { isAdmin } = useAuth();
  const { items, deliveryFee, subtotal, total, itemCount, updateQuantity, removeItem, loading, error } = useCart();

  return (
    <main>
      <section className="cart-section">
        <h1 className="cart-title">Panier</h1>

        {error && (
          <p style={{ textAlign: 'center', color: '#b00020', marginBottom: 16 }} role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p>Chargement du panier...</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p>Votre panier est vide.</p>
            <Link to="/" className="secondary-btn" style={{ display: 'inline-block', marginTop: 16 }}>
              Continuer mes achats
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items-wrapper">
              <div className="cart-items-container">
                <div className="cart-header">
                  <span>Article</span>
                  <span>Prix</span>
                  <span>Quantité</span>
                  <span>Prix total</span>
                  <span></span>
                </div>

                {items.map((item) => (
                  <div key={item.cartItemId} className="cart-item">
                    <div className="product-info">
                      <img
                        src={item.image || '/pictures/femme_example.jpg'}
                        alt={item.name}
                        className="product-image"
                      />
                      <div className="product-details">
                        <h4>{item.name}</h4>
                        <p>{item.details}</p>
                      </div>
                    </div>

                    <div className="price">{formatPrice(item.price)}</div>

                    <div className="quantity-control-wrapper">
                      <div className="quantity-control">
                        <button
                          type="button"
                          className="quantity-btn"
                          onClick={() => updateQuantity(item.cartItemId, -1)}
                        >
                          -
                        </button>
                        <input type="text" className="quantity-input" value={item.quantity} readOnly />
                        <button
                          type="button"
                          className="quantity-btn"
                          onClick={() => updateQuantity(item.cartItemId, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="total-price">{formatPrice(item.price * item.quantity)}</div>

                    <button
                      type="button"
                      className="remove-btn"
                      aria-label="Supprimer le produit"
                      onClick={() => removeItem(item.cartItemId)}
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>

              <Link to="/" className="secondary-btn">
                Continuer mes achats
              </Link>
            </div>

            <div className="cart-summary">
              <div className="summary-row">
                <span>{itemCount} articles</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>

              <div className="summary-row">
                <span>Livraison</span>
                <strong>{formatPrice(deliveryFee)}</strong>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-total">
                <span className="total-label">Total (TTC)</span>
                <span className="total-amount">{formatPrice(total)}</span>
              </div>

              {isAdmin ? (
                <p style={{ color: '#b00020', textAlign: 'center', marginTop: 16, fontSize: 13 }}>
                  Les administrateurs ne peuvent pas passer de commandes.
                </p>
              ) : (
                <Link to="/checkout" className="submit-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Confirmer la commande
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
