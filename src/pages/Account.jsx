import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { formatPrice } from '../utils/formatPrice';
import '../styles/account.css';

const ORDER_STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  processing: 'En cours',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function Account() {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const { itemCount } = useCart();
  const { favoriteIds } = useFavorites();

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const data = await api.getMyOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setOrdersError(err.message || 'Impossible de charger vos commandes.');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    refreshUser().catch(() => {});
  }, [refreshUser]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);

    const form = new FormData(e.target);

    try {
      await api.updateProfile({
        fullName: form.get('fullName'),
        phoneNumber: form.get('phoneNumber') || null,
      });
      await refreshUser();
      setProfileSuccess('Profil mis à jour.');
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err.message || 'Mise à jour impossible.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordLoading(true);

    const form = new FormData(e.target);
    const newPassword = form.get('newPassword');
    const confirmPassword = form.get('confirmPassword');

    if (newPassword !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas.');
      setPasswordLoading(false);
      return;
    }

    try {
      await api.changePassword({
        currentPassword: form.get('currentPassword'),
        newPassword,
      });
      setPasswordSuccess('Mot de passe mis à jour.');
      setChangingPassword(false);
      e.target.reset();
    } catch (err) {
      setPasswordError(err.message || 'Modification impossible.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <main className="account-page">
      <header className="account-header">
        <img src="/pictures/logo.png" alt="Silky" className="account-logo" />
        <h1 className="account-title">Mon compte</h1>
        <p className="account-subtitle">Bienvenue, {user?.fullName || user?.email}</p>
      </header>

      <section className="account-section">
        <h2 className="account-section-title">Informations personnelles</h2>

        {!editingProfile ? (
          <>
            <div className="account-info-grid">
              <div className="account-info-row">
                <span className="account-info-label">Nom complet</span>
                <span className="account-info-value">{user?.fullName || '—'}</span>
              </div>
              <div className="account-info-row">
                <span className="account-info-label">E-mail</span>
                <span className="account-info-value">{user?.email || '—'}</span>
              </div>
              {user?.phoneNumber && (
                <div className="account-info-row">
                  <span className="account-info-label">Téléphone</span>
                  <span className="account-info-value">{user.phoneNumber}</span>
                </div>
              )}
              {user?.createdAt && (
                <div className="account-info-row">
                  <span className="account-info-label">Membre depuis</span>
                  <span className="account-info-value">{formatDate(user.createdAt)}</span>
                </div>
              )}
            </div>
            <div className="account-actions-row">
              <button
                type="button"
                className="account-text-btn"
                onClick={() => {
                  setEditingProfile(true);
                  setProfileError('');
                  setProfileSuccess('');
                }}
              >
                Modifier le profil
              </button>
              {!changingPassword && (
                <button
                  type="button"
                  className="account-text-btn"
                  onClick={() => {
                    setChangingPassword(true);
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                >
                  Changer le mot de passe
                </button>
              )}
            </div>
          </>
        ) : (
          <form className="account-form" onSubmit={handleProfileSubmit}>
            <div className="form-group">
              <label htmlFor="fullName">Nom complet</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                required
                defaultValue={user?.fullName || ''}
                autoComplete="name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="phoneNumber">Téléphone (optionnel)</label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                defaultValue={user?.phoneNumber || ''}
                autoComplete="tel"
              />
            </div>
            {profileError && <p className="account-form-error">{profileError}</p>}
            {profileSuccess && <p className="account-form-success">{profileSuccess}</p>}
            <div className="account-form-actions">
              <button type="submit" className="account-link-btn" disabled={profileLoading}>
                {profileLoading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                type="button"
                className="account-link-btn secondary"
                onClick={() => setEditingProfile(false)}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </section>

      {changingPassword && (
        <section className="account-section">
          <h2 className="account-section-title">Changer le mot de passe</h2>
          <form className="account-form" onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <label htmlFor="currentPassword">Mot de passe actuel</label>
              <input
                type="password"
                id="currentPassword"
                name="currentPassword"
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">Nouveau mot de passe</label>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {passwordError && <p className="account-form-error">{passwordError}</p>}
            {passwordSuccess && <p className="account-form-success">{passwordSuccess}</p>}
            <div className="account-form-actions">
              <button type="submit" className="account-link-btn" disabled={passwordLoading}>
                {passwordLoading ? 'Mise à jour...' : 'Mettre à jour'}
              </button>
              <button
                type="button"
                className="account-link-btn secondary"
                onClick={() => setChangingPassword(false)}
              >
                Annuler
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="account-section">
        <h2 className="account-section-title">Mes commandes</h2>

        {ordersLoading ? (
          <p className="account-empty">Chargement des commandes...</p>
        ) : ordersError ? (
          <p className="account-form-error">{ordersError}</p>
        ) : orders.length === 0 ? (
          <p className="account-empty">Vous n&apos;avez pas encore passé de commande.</p>
        ) : (
          <div className="account-orders-list">
            {orders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              return (
                <article key={order.id} className="account-order-card">
                  <div className="account-order-summary">
                    <span className="account-order-number">{order.orderNumber}</span>
                    <span className="account-order-date">{formatDate(order.createdAt)}</span>
                    <span className="account-order-status">
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                    <span className="account-order-total">{formatPrice(order.total)}</span>
                    <button
                      type="button"
                      className="account-order-toggle"
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    >
                      {isExpanded ? 'Masquer les détails' : 'Voir les détails'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="account-order-details">
                      <p>
                        <strong>Livraison :</strong> {order.customer?.address}
                      </p>
                      <p>
                        <strong>Articles ({order.items?.length || 0}) :</strong>
                      </p>
                      <ul>
                        {(order.items || []).map((item, index) => (
                          <li key={`${order.id}-${index}`}>
                            {item.name}
                            {item.details ? ` — ${item.details}` : ''} × {item.quantity} —{' '}
                            {formatPrice(item.price * item.quantity)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="account-section">
        <h2 className="account-section-title">Accès rapide</h2>
        <div className="account-quick-links">
          <Link to="/favorites" className="account-link-btn">
            Mes favoris{favoriteIds.length > 0 ? ` (${favoriteIds.length})` : ''}
          </Link>
          <Link to="/cart" className="account-link-btn secondary">
            Mon panier{itemCount > 0 ? ` (${itemCount})` : ''}
          </Link>
        </div>
      </section>

      <section className="account-section">
        <div className="account-actions-row">
          <button type="button" className="account-link-btn secondary" onClick={handleLogout}>
            Se déconnecter
          </button>
        </div>
      </section>
    </main>
  );
}
