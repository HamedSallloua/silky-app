import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { formatPrice } from '../../utils/formatPrice';

const SOURCE_LABELS = {
  web: 'Site web',
  social_media: 'Réseaux sociaux (Instagram, Facebook, TikTok, etc.)',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  phone: 'Téléphone',
};

function formatSource(source) {
  return SOURCE_LABELS[source] || source;
}

export default function AdminAnalytics({ refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [granularity, setGranularity] = useState('daily');

  const loadAnalytics = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .getAdminAnalytics({ granularity, limit: 30 })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [granularity]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics, refreshKey]);

  if (loading) return <p className="admin-loading">Chargement des statistiques...</p>;
  if (error) return <p className="admin-error">{error}</p>;
  if (!data) return null;

  const { kpi, salesBySource, revenueTrend, topProducts } = data;
  const maxTrendRevenue = Math.max(...revenueTrend.map((d) => d.revenue), 1);

  return (
    <section className="admin-panel admin-analytics">
      <div className="admin-panel-header">
        <div>
          <h2>Statistiques</h2>
          <p>Vue d&apos;ensemble des ventes et performances</p>
        </div>
        <div className="admin-analytics-controls">
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            aria-label="Granularité du graphique"
          >
            <option value="daily">Par jour</option>
            <option value="monthly">Par mois</option>
          </select>
          <button type="button" className="admin-secondary-btn" onClick={loadAnalytics}>
            Actualiser
          </button>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card">
          <span className="admin-kpi-label">Revenu total</span>
          <strong className="admin-kpi-value">{formatPrice(kpi.totalRevenue)}</strong>
        </article>
        <article className="admin-kpi-card">
          <span className="admin-kpi-label">Commandes</span>
          <strong className="admin-kpi-value">{kpi.totalOrders}</strong>
        </article>
        <article className="admin-kpi-card">
          <span className="admin-kpi-label">Panier moyen</span>
          <strong className="admin-kpi-value">{formatPrice(kpi.averageOrderValue)}</strong>
        </article>
        <article className="admin-kpi-card">
          <span className="admin-kpi-label">Clients</span>
          <strong className="admin-kpi-value">{kpi.totalCustomers}</strong>
        </article>
      </div>

      <div className="admin-analytics-grid">
        <div className="admin-analytics-block">
          <h3>Ventes par source</h3>
          {salesBySource.length === 0 ? (
            <p className="admin-empty">Aucune donnée disponible.</p>
          ) : (
            <div className="admin-analytics-table-wrap">
              <table className="stock-table admin-analytics-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Commandes</th>
                    <th>Revenu</th>
                    <th>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {salesBySource.map((row) => (
                    <tr key={row.source}>
                      <td className="admin-analytics-source-cell">{formatSource(row.source)}</td>
                      <td>{row.orderCount}</td>
                      <td>{formatPrice(row.revenue)}</td>
                      <td>
                        <div className="admin-source-bar">
                          <div
                            className="admin-source-bar-fill"
                            style={{ width: `${row.percentage}%` }}
                          />
                          <span>{row.percentage}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-analytics-block">
          <h3>Produits les plus vendus</h3>
          {topProducts.length === 0 ? (
            <p className="admin-empty">Aucune vente enregistrée.</p>
          ) : (
            <div className="admin-analytics-table-wrap">
              <table className="stock-table admin-analytics-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Quantité</th>
                    <th>Revenu</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((row) => (
                    <tr key={row.productTitle}>
                      <td className="admin-analytics-product-cell">{row.productTitle}</td>
                      <td>{row.quantitySold}</td>
                      <td>{formatPrice(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="admin-analytics-block admin-analytics-trend">
        <h3>Tendance des revenus</h3>
        {revenueTrend.length === 0 ? (
          <p className="admin-empty">Aucune donnée de tendance.</p>
        ) : (
          <div className="admin-trend-chart">
            {revenueTrend.map((point) => (
              <div key={point.date} className="admin-trend-bar-group">
                <div
                  className="admin-trend-bar"
                  style={{ height: `${(point.revenue / maxTrendRevenue) * 100}%` }}
                  title={`${formatPrice(point.revenue)} — ${point.orderCount} commande(s)`}
                />
                <span className="admin-trend-label">{point.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
