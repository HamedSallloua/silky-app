import { sql } from 'drizzle-orm';
import { db } from '../db/orm.js';

export const analyticsRepository = {
  async getAnalytics({ granularity = 'daily', limit = 30 } = {}, tx = db) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 30, 1), 365);
    const groupExprSql = granularity === 'monthly'
      ? sql`TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')`
      : sql`TO_CHAR(created_at::date, 'YYYY-MM-DD')`;

    const kpiPromise = tx.execute(sql`
      WITH latest_exchanges AS (
        SELECT DISTINCT ON (order_id)
          id AS exchange_id,
          order_id,
          subtotal,
          delivery_fee,
          total_amount,
          created_at
        FROM order_exchanges
        ORDER BY order_id, exchange_sequence DESC, created_at DESC
      ),
      effective_orders AS (
        SELECT
          o.id AS order_id,
          o.created_at,
          o.order_source,
          o.user_id,
          o.customer_email,
          o.customer_phone,
          COALESCE(le.total_amount, o.total_amount) AS effective_total_amount,
          COALESCE(le.subtotal, o.subtotal) AS effective_subtotal,
          COALESCE(le.delivery_fee, o.delivery_fee) AS effective_delivery_fee
        FROM orders o
        LEFT JOIN latest_exchanges le ON le.order_id = o.id
        WHERE o.status <> 'cancelled'
      )
      SELECT
        COALESCE(SUM(effective_total_amount), 0) AS total_revenue,
        COUNT(*)::int AS total_orders,
        COALESCE(AVG(effective_total_amount), 0) AS average_order_value,
        COUNT(DISTINCT COALESCE(user_id::text, NULLIF(LOWER(customer_email), ''), customer_phone))::int AS total_customers
      FROM effective_orders
    `);

    const sourcePromise = tx.execute(sql`
      WITH latest_exchanges AS (
        SELECT DISTINCT ON (order_id)
          id AS exchange_id,
          order_id,
          subtotal,
          delivery_fee,
          total_amount,
          created_at
        FROM order_exchanges
        ORDER BY order_id, exchange_sequence DESC, created_at DESC
      ),
      effective_orders AS (
        SELECT
          o.id AS order_id,
          o.order_source,
          COALESCE(le.total_amount, o.total_amount) AS effective_total_amount
        FROM orders o
        LEFT JOIN latest_exchanges le ON le.order_id = o.id
        WHERE o.status <> 'cancelled'
      )
      SELECT
        order_source,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(effective_total_amount), 0) AS revenue
      FROM effective_orders
      GROUP BY order_source
      ORDER BY revenue DESC
    `);

    const trendPromise = tx.execute(sql`
      WITH latest_exchanges AS (
        SELECT DISTINCT ON (order_id)
          id AS exchange_id,
          order_id,
          subtotal,
          delivery_fee,
          total_amount,
          created_at
        FROM order_exchanges
        ORDER BY order_id, exchange_sequence DESC, created_at DESC
      ),
      effective_orders AS (
        SELECT
          o.id AS order_id,
          o.created_at,
          COALESCE(le.total_amount, o.total_amount) AS effective_total_amount
        FROM orders o
        LEFT JOIN latest_exchanges le ON le.order_id = o.id
        WHERE o.status <> 'cancelled'
      )
      SELECT
        ${groupExprSql} AS period,
        COALESCE(SUM(effective_total_amount), 0) AS revenue,
        COUNT(*)::int AS order_count
      FROM effective_orders
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${parsedLimit}
    `);

    const topProductsPromise = tx.execute(sql`
      WITH latest_exchanges AS (
        SELECT DISTINCT ON (order_id)
          id AS exchange_id,
          order_id,
          subtotal,
          delivery_fee,
          total_amount,
          created_at
        FROM order_exchanges
        ORDER BY order_id, exchange_sequence DESC, created_at DESC
      ),
      effective_orders AS (
        SELECT
          o.id AS order_id,
          le.exchange_id IS NOT NULL AS has_exchange,
          le.exchange_id
        FROM orders o
        LEFT JOIN latest_exchanges le ON le.order_id = o.id
        WHERE o.status <> 'cancelled'
      ),
      effective_items AS (
        SELECT
          eo.order_id,
          oi.product_title,
          oi.variant_id,
          oi.quantity,
          oi.unit_price
        FROM effective_orders eo
        JOIN order_items oi ON oi.order_id = eo.order_id
        WHERE eo.has_exchange = FALSE

        UNION ALL

        SELECT
          eo.order_id,
          ei.product_title,
          ei.variant_id,
          ei.quantity,
          ei.unit_price
        FROM effective_orders eo
        JOIN exchange_items ei ON ei.exchange_id = eo.exchange_id
        WHERE eo.has_exchange = TRUE
      )
      SELECT
        product_title,
        SUM(quantity)::int AS units_sold,
        SUM(quantity * unit_price) AS total_revenue
      FROM effective_items
      GROUP BY product_title
      ORDER BY units_sold DESC, total_revenue DESC
      LIMIT 10
    `);

    const [kpiRes, sourceRes, trendRes, topRes] = await Promise.all([
      kpiPromise,
      sourcePromise,
      trendPromise,
      topProductsPromise,
    ]);

    const kpi = (kpiRes.rows || kpiRes)[0] || {};
    const sources = (sourceRes.rows || sourceRes) || [];
    const trend = (trendRes.rows || trendRes) || [];
    const topProducts = (topRes.rows || topRes) || [];

    return {
      kpi: {
        totalRevenue: Number(kpi.total_revenue || 0),
        totalOrders: Number(kpi.total_orders || 0),
        averageOrderValue: Number(kpi.average_order_value || 0),
        totalCustomers: Number(kpi.total_customers || 0),
      },
      sources: sources.map((r) => ({
        source: r.order_source,
        orderCount: Number(r.order_count || 0),
        revenue: Number(r.revenue || 0),
      })),
      trend: trend.map((r) => ({
        period: r.period,
        revenue: Number(r.revenue || 0),
        orderCount: Number(r.order_count || 0),
      })).reverse(),
      topProducts: topProducts.map((r) => ({
        title: r.product_title,
        unitsSold: Number(r.units_sold || 0),
        revenue: Number(r.total_revenue || 0),
      })),
    };
  }
};
