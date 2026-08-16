import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import AdminOrders from './AdminOrders';
import AdminReviews from './AdminReviews';
import AdminProducts from './AdminProducts';
import AdminInventory from './AdminInventory';
import AdminAnalytics from './AdminAnalytics';
import AdminMessages from './AdminMessages';
import '../../styles/admin.css';

const TABS = [
  { id: 'analytics', label: 'Statistiques' },
  { id: 'products', label: 'Produits' },
  { id: 'inventory', label: 'Inventaire' },
  { id: 'theme', label: 'Thèmes' },
  { id: 'orders', label: 'Commandes' },
  { id: 'reviews', label: 'Avis clients' },
  { id: 'messages', label: 'Messages' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { theme, updateTheme } = useTheme();
  const [tab, setTab] = useState('analytics');
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleAdminDataRefresh = () => setAdminRefreshKey((k) => k + 1);
  const [colors, setColors] = useState({
    primary: theme.primary,
    secondary: theme.secondary,
    heroLeftImage: theme.heroLeftImage || '/pictures/femme_example.jpg',
    heroRightImage: theme.heroRightImage || '/pictures/enfant_example.jpg',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setColors({
      primary: theme.primary,
      secondary: theme.secondary,
      heroLeftImage: theme.heroLeftImage || '/pictures/femme_example.jpg',
      heroRightImage: theme.heroRightImage || '/pictures/enfant_example.jpg',
    });
  }, [theme.primary, theme.secondary, theme.heroLeftImage, theme.heroRightImage]);

  const handleLogout = async () => {
    try {
      await api.adminLogout();
    } catch {
      /* ignore */
    }
    logout();
    navigate('/admin/login');
  };

  const handleSaveTheme = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await updateTheme(colors);
      setMessage('Thème mis à jour avec succès.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleHeroUpload = async (side, file) => {
    if (!file) return;
    setUploading(side);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { url } = await api.uploadThemeImage(formData);
      const key = side === 'left' ? 'heroLeftImage' : 'heroRightImage';
      setColors((c) => ({ ...c, [key]: url }));
      setMessage(`Image hero ${side === 'left' ? 'gauche' : 'droite'} téléchargée. Enregistrez pour appliquer.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setUploading(null);
    }
  };

  const handleTabChange = (id) => {
    setTab(id);
    setSidebarOpen(false);
  };

  return (
    <div className="admin-dashboard">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="admin-sidebar-brand">
          <h1>Silky</h1>
          <p>Administration</p>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          >
            ✕
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'active' : ''}
              onClick={() => handleTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <button type="button" className="admin-sidebar-logout" onClick={handleLogout}>
          Déconnexion
        </button>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <button
            type="button"
            className="admin-hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <span /><span /><span />
          </button>
          <div>
            <h2>{TABS.find((t) => t.id === tab)?.label || 'Tableau de bord'}</h2>
            <p>Gérez les produits, inventaire, commandes et statistiques</p>
          </div>
        </header>

        <div className="admin-content">
        {tab === 'analytics' && <AdminAnalytics refreshKey={adminRefreshKey} />}
        {tab === 'products' && <AdminProducts />}
        {tab === 'inventory' && <AdminInventory refreshKey={adminRefreshKey} />}
        {tab === 'theme' && (
          <section className="admin-panel">
            <h2>Thème du site</h2>
            <p>Modifiez les couleurs et les images hero. Les changements sont appliqués après enregistrement.</p>

            <form className="admin-theme-form" onSubmit={handleSaveTheme}>
              <div className="admin-color-field">
                <label htmlFor="primary">Couleur principale (accent)</label>
                <div className="admin-color-input-row">
                  <input
                    type="color"
                    id="primary"
                    value={colors.primary}
                    onChange={(e) => setColors((c) => ({ ...c, primary: e.target.value.toUpperCase() }))}
                  />
                  <input
                    type="text"
                    value={colors.primary}
                    onChange={(e) => setColors((c) => ({ ...c, primary: e.target.value }))}
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
                <span className="admin-color-preview" style={{ backgroundColor: colors.primary }} />
              </div>

              <div className="admin-color-field">
                <label htmlFor="secondary">Couleur secondaire (fond clair)</label>
                <div className="admin-color-input-row">
                  <input
                    type="color"
                    id="secondary"
                    value={colors.secondary}
                    onChange={(e) => setColors((c) => ({ ...c, secondary: e.target.value.toUpperCase() }))}
                  />
                  <input
                    type="text"
                    value={colors.secondary}
                    onChange={(e) => setColors((c) => ({ ...c, secondary: e.target.value }))}
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
                <span className="admin-color-preview" style={{ backgroundColor: colors.secondary }} />
              </div>

              <div className="admin-theme-preview">
                <div
                  className="admin-theme-preview-light"
                  style={{ backgroundColor: colors.secondary, color: colors.primary }}
                >
                  Aperçu zone claire
                </div>
                <button
                  type="button"
                  className="admin-theme-preview-btn"
                  style={{ backgroundColor: colors.primary }}
                >
                  Bouton accent
                </button>
              </div>

              <h3 className="admin-section-subtitle">Images Hero (page d&apos;accueil)</h3>

              <div className="admin-hero-images">
                <div className="admin-color-field">
                  <label htmlFor="heroLeftImage">Hero gauche (Femme)</label>
                  <div className="admin-hero-preview" style={{ backgroundImage: `url(${colors.heroLeftImage})` }} />
                  <label className="admin-upload-label">
                    {uploading === 'left' ? 'Téléchargement...' : 'Télécharger une image'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => handleHeroUpload('left', e.target.files?.[0])}
                    />
                  </label>
                </div>

                <div className="admin-color-field">
                  <label htmlFor="heroRightImage">Hero droite (Enfant)</label>
                  <div className="admin-hero-preview" style={{ backgroundImage: `url(${colors.heroRightImage})` }} />
                  <label className="admin-upload-label">
                    {uploading === 'right' ? 'Téléchargement...' : 'Télécharger une image'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => handleHeroUpload('right', e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              {message && <p className="admin-message">{message}</p>}

              <button type="submit" className="admin-primary-btn" disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer le thème'}
              </button>
            </form>
          </section>
        )}

        {tab === 'orders' && (
          <AdminOrders refreshKey={adminRefreshKey} onOrderCreated={handleAdminDataRefresh} />
        )}
        {tab === 'reviews' && <AdminReviews />}
        {tab === 'messages' && <AdminMessages />}
        </div>
      </div>
    </div>
  );
}
