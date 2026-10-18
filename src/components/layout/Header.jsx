import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useProducts } from '../../context/ProductsContext';
import { formatPrice } from '../../utils/formatPrice';

export default function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, logout } = useAuth();

  const accountPath = !isAuthenticated ? '/login' : isAdmin ? '/admin' : '/account';
  const accountLabel = !isAuthenticated ? 'Compte' : isAdmin ? 'Admin' : 'Mon compte';
  const { items, itemCount, subtotal, total, lastAddedAt } = useCart();
  const { visibleProducts } = useProducts();

  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isAutoOpen, setIsAutoOpen] = useState(false);
  const searchRef = useRef(null);
  const headerRef = useRef(null);
  const cartTimerRef = useRef(null);
  const prevLastAddedRef = useRef(lastAddedAt);

  // Maintain dynamic header height for sticky subordinate bars
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const updateHeaderHeight = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        document.documentElement.style.setProperty('--header-height', `${height}px`);
      }
    };

    updateHeaderHeight();

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateHeaderHeight);
      ro.observe(el);
    }
    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  const trimmed = query.trim().toLowerCase();

  const suggestions = trimmed
    ? visibleProducts
        .filter(
          (p) =>
            p.name?.toLowerCase().includes(trimmed) ||
            p.category?.toLowerCase().includes(trimmed),
        )
        .slice(0, 6)
    : [];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!trimmed) return;
    setShowDropdown(false);
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSuggestionClick = (product) => {
    setQuery('');
    setShowDropdown(false);
    navigate(`/product/${product.id}`);
  };

  const handleViewAll = () => {
    if (!trimmed) return;
    setShowDropdown(false);
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Automatically show cart dropdown for 5 seconds on successful item addition
  useEffect(() => {
    if (!lastAddedAt) return;
    if (prevLastAddedRef.current === lastAddedAt) return;
    prevLastAddedRef.current = lastAddedAt;

    if (cartTimerRef.current) {
      clearTimeout(cartTimerRef.current);
      cartTimerRef.current = null;
    }

    setIsAutoOpen(true);

    cartTimerRef.current = setTimeout(() => {
      setIsAutoOpen(false);
      cartTimerRef.current = null;
    }, 5000);

    return () => {
      if (cartTimerRef.current) {
        clearTimeout(cartTimerRef.current);
        cartTimerRef.current = null;
      }
    };
  }, [lastAddedAt]);

  return (
    <div ref={headerRef} className="header_wrapper">
      <div className="top_utility_bar">
        <div className="contact_section">
          <div className="social_icons">
            <a href="https://www.instagram.com/silky.tn/" target="_blank" rel="noreferrer" className="social_link">
              <img src="/pictures/instagram.png" alt="Instagram" className="icon_img" />
            </a>
            <a href="https://www.tiktok.com/@silky4042" target="_blank" rel="noreferrer" className="social_link">
              <img src="/pictures/tiktok.png" alt="TikTok" className="icon_img" />
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61560630851600"
              target="_blank"
              rel="noreferrer"
              className="social_link"
            >
              <img src="/pictures/facebook.png" alt="Facebook" className="icon_img" />
            </a>
            <a href="mailto:silky26tn@gmail.com" className="social_link">
              <img src="/pictures/gmail.png" alt="Email" className="icon_img" />
            </a>
          </div>

          <div className="contact_info">
            commandez en ligne ou appelez <span>+216 25 274 800</span>
          </div>
        </div>

        <div className="user_actions">
          <Link to="/leave-review" className="action_item reviews_item" title="Donner votre avis">
            <img src="/pictures/avis.png" alt="Avis clients" className="reviews_icon_img" />
          </Link>
          <Link
            to="/"
            className="action_item"
            onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
          >
            <img src="/pictures/home.png" alt="Accueil" className="action_icon_img" />
            <span>Accueil</span>
          </Link>
          <Link to="/favorites" className="action_item">
            <img src="/pictures/heart.png" alt="Favoris" className="action_icon_img" />
            <span>Favoris</span>
          </Link>

          <div className="action_item cart_dropdown_container">
            <Link to="/cart" className="cart_link">
              <img src="/pictures/cart.png" alt="Panier" className="action_icon_img" />
              <span>Panier{itemCount > 0 ? ` (${itemCount})` : ''}</span>
            </Link>

            <div className={`cart_dropdown_box${isAutoOpen ? ' is_visible' : ''}`}>
              {items.length === 0 ? (
                <p className="cart_dropdown_empty">Votre panier est vide.</p>
              ) : (
                <>
                  <div className="cart_dropdown_items">
                    {items.map((item) => (
                      <div key={item.cartItemId} className="cart_dropdown_item">
                        <img src={item.image || '/pictures/femme_example.jpg'} alt="" />
                        <div className="cart_dropdown_item_info">
                          <span className="cart_dropdown_item_name">{item.name}</span>
                          <span className="cart_dropdown_item_meta">
                            {item.details} × {item.quantity}
                          </span>
                        </div>
                        <span className="cart_dropdown_item_price">{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  <hr className="cart_divider" />

                  <div className="cart_row">
                    <span>{itemCount} articles</span>
                    <span className="cart_amount">{formatPrice(subtotal)}</span>
                  </div>

                  <div className="cart_row total_row">
                    <strong>Total (TTC)</strong>
                    <strong className="cart_amount">{formatPrice(total)}</strong>
                  </div>
                </>
              )}

              <Link to={items.length ? '/checkout' : '/cart'} className="cart_checkout_btn">
                Commander
              </Link>
            </div>
          </div>

          {isAuthenticated ? (
            <>
              <Link to={accountPath} className="action_item">
                <img
                  src="/pictures/account.png"
                  alt={accountLabel}
                  className="action_icon_img"
                />
                <span>{accountLabel}</span>
              </Link>
              <button
                type="button"
                className="action_item header-logout-btn"
                onClick={handleLogout}
                title="Déconnexion"
                aria-label="Déconnexion"
              >
                <span>Déconnexion</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="action_item">
              <img src="/pictures/account.png" alt="Compte" className="action_icon_img" />
              <span>Compte</span>
            </Link>
          )}
        </div>
      </div>

      <header className="main_header">
        <Link to="/" className="logo">
          <img className="logo_img" src="/pictures/logo.png" alt="Silky Logo" />
        </Link>

        <nav className="nav_links">
          <Link to="/collection/femme">Femme</Link>
          <Link to="/collection/enfant">Enfant</Link>
        </nav>

        <form
          className="search_container"
          onSubmit={handleSearch}
          ref={searchRef}
          role="search"
          aria-label="Rechercher un produit"
        >
          <input
            id="site-search-input"
            className="search_input"
            type="text"
            placeholder="Rechercher un produit..."
            value={query}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => trimmed && setShowDropdown(true)}
            aria-label="Rechercher un produit"
            aria-autocomplete="list"
            aria-expanded={showDropdown && suggestions.length > 0}
          />
          <button className="search_button" type="submit">
            Chercher
          </button>

          {showDropdown && trimmed && (
            <div className="search_dropdown" role="listbox">
              {suggestions.length === 0 ? (
                <div className="search_dropdown_empty">Aucun résultat pour «&nbsp;{query}&nbsp;»</div>
              ) : (
                <>
                  {suggestions.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className={`search_dropdown_item${product.isHidden ? ' search_dropdown_item--hidden' : ''}`}
                      onMouseDown={() => handleSuggestionClick(product)}
                      role="option"
                    >
                      <img
                        src={product.collectionImage || product.mainImage || '/pictures/femme_example.jpg'}
                        alt={product.name}
                        className="search_dropdown_img"
                      />
                      <div className="search_dropdown_info">
                        <span className="search_dropdown_name">
                          {product.name}
                          {product.isHidden && (
                            <span className="admin-badge admin-badge--warning" style={{ marginLeft: 6, fontSize: '0.65rem', padding: '2px 6px' }}>
                              ● Masqué
                            </span>
                          )}
                        </span>
                        <span className="search_dropdown_category">{product.category}</span>
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="search_dropdown_viewall"
                    onMouseDown={handleViewAll}
                  >
                    Voir tous les résultats pour «&nbsp;<strong>{query}</strong>&nbsp;»
                  </button>
                </>
              )}
            </div>
          )}
        </form>
      </header>
    </div>
  );
}
