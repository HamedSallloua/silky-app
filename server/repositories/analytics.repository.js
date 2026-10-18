import { sql } from 'drizzle-orm';
import { db } from '../db/orm.js';
import { DELIVERY_ECONOMICS } from '../config/delivery.js';

export const analyticsRepository = {
  async getAnalytics({ granularity = 'daily', limit = 30, piePeriod = 'year' } = {}, tx = db) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 30, 1), 365);

    let groupExprSql;
    if (granularity === 'yearly' || granularity === 'year') {
      groupExprSql = sql`TO_CHAR(DATE_TRUNC('year', o.created_at), 'YYYY')`;
    } else if (granularity === 'monthly' || granularity === 'month') {
      groupExprSql = sql`TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM')`;
    } else if (granularity === 'weekly' || granularity === 'week') {
      groupExprSql = sql`TO_CHAR(DATE_TRUNC('week', o.created_at), 'YYYY-MM-DD')`;
    } else {
      groupExprSql = sql`TO_CHAR(o.created_at::date, 'YYYY-MM-DD')`;
    }

    // Pie chart period date filter
    let pieDateFilterSql = sql``;
    let pieExchangeDateFilterSql = sql``;
    let pieRefundDateFilterSql = sql``;

    if (piePeriod === 'day' || piePeriod === 'daily') {
      pieDateFilterSql = sql` AND o.created_at >= DATE_TRUNC('day', CURRENT_TIMESTAMP)`;
      pieExchangeDateFilterSql = sql` AND oe.created_at >= DATE_TRUNC('day', CURRENT_TIMESTAMP)`;
      pieRefundDateFilterSql = sql` AND orf.created_at >= DATE_TRUNC('day', CURRENT_TIMESTAMP)`;
    } else if (piePeriod === 'week' || piePeriod === 'weekly') {
      pieDateFilterSql = sql` AND o.created_at >= DATE_TRUNC('week', CURRENT_TIMESTAMP)`;
      pieExchangeDateFilterSql = sql` AND oe.created_at >= DATE_TRUNC('week', CURRENT_TIMESTAMP)`;
      pieRefundDateFilterSql = sql` AND orf.created_at >= DATE_TRUNC('week', CURRENT_TIMESTAMP)`;
    } else if (piePeriod === 'month' || piePeriod === 'monthly') {
      pieDateFilterSql = sql` AND o.created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)`;
      pieExchangeDateFilterSql = sql` AND oe.created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)`;
      pieRefundDateFilterSql = sql` AND orf.created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)`;
    } else if (piePeriod === 'year' || piePeriod === 'yearly') {
      pieDateFilterSql = sql` AND o.created_at >= DATE_TRUNC('year', CURRENT_TIMESTAMP)`;
      pieExchangeDateFilterSql = sql` AND oe.created_at >= DATE_TRUNC('year', CURRENT_TIMESTAMP)`;
      pieRefundDateFilterSql = sql` AND orf.created_at >= DATE_TRUNC('year', CURRENT_TIMESTAMP)`;
    }

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
      exchange_delivery_totals AS (
        SELECT
          oe.order_id,
          COALESCE(SUM(oe.delivery_fee), 0) AS total_exchange_delivery_fee
        FROM order_exchanges oe
        JOIN orders o ON o.id = oe.order_id
        WHERE o.status IN ('delivered', 'refunded')
        GROUP BY oe.order_id
      ),
      order_refund_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(refund_amount), 0) AS total_refund_amount,
          COALESCE(SUM(delivery_fee), 0) AS total_refund_delivery_fee
        FROM order_refunds
        GROUP BY order_id
      ),
      effective_orders AS (
        SELECT
          o.id AS order_id,
          o.created_at,
          o.user_id,
          o.customer_email,
          o.customer_phone,
          o.status,
          COALESCE(ort.total_refund_amount, 0) AS refund_amount,
          CASE
            WHEN o.status = 'delivered' THEN (COALESCE(le.subtotal, o.subtotal) - COALESCE(ort.total_refund_amount, 0))
            ELSE 0
          END AS effective_subtotal,
          CASE
            WHEN o.status IN ('delivered', 'refunded') THEN o.delivery_fee
            ELSE 0
          END AS initial_delivery_fee,
          CASE
            WHEN o.status IN ('delivered', 'refunded') THEN COALESCE(edt.total_exchange_delivery_fee, 0)
            ELSE 0
          END AS total_exchange_delivery_fee,
          COALESCE(ort.total_refund_delivery_fee, 0) AS total_refund_delivery_fee,
          (
            CASE
              WHEN o.status = 'delivered' THEN (COALESCE(le.subtotal, o.subtotal) - COALESCE(ort.total_refund_amount, 0))
              ELSE 0
            END
            + CASE
                WHEN o.status IN ('delivered', 'refunded') THEN o.delivery_fee
                ELSE 0
              END
            + CASE
                WHEN o.status IN ('delivered', 'refunded') THEN COALESCE(edt.total_exchange_delivery_fee, 0)
                ELSE 0
              END
            + COALESCE(ort.total_refund_delivery_fee, 0)
          ) AS effective_total_amount
        FROM orders o
        LEFT JOIN latest_exchanges le ON le.order_id = o.id
        LEFT JOIN exchange_delivery_totals edt ON edt.order_id = o.id
        LEFT JOIN order_refund_totals ort ON ort.order_id = o.id
        WHERE o.status <> 'cancelled'
      )
      SELECT
        COALESCE(SUM(effective_total_amount), 0) AS total_revenue,
        COALESCE(SUM(effective_subtotal), 0) AS product_revenue,
        COALESCE(SUM(refund_amount), 0) AS product_refunds,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END)::int AS total_orders,
        COALESCE(AVG(CASE WHEN status = 'delivered' THEN effective_total_amount END), 0) AS average_order_value,
        COUNT(DISTINCT CASE WHEN status = 'delivered' THEN COALESCE(user_id::text, NULLIF(LOWER(customer_email), ''), customer_phone) END)::int AS total_customers
      FROM effective_orders
    `);

    const deliveryOrdersPromise = tx.execute(sql`
      SELECT
        COUNT(CASE WHEN status IN ('delivered', 'refunded') THEN 1 END)::int AS normal_orders_count,
        COALESCE(SUM(CASE WHEN status IN ('delivered', 'refunded') THEN delivery_fee ELSE 0 END), 0)::numeric AS normal_delivery_revenue,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled_orders_count
      FROM orders
    `);

    const deliveryExchangesPromise = tx.execute(sql`
      SELECT
        COUNT(CASE WHEN oe.payment_responsibility = 'silky_paid' THEN 1 END)::int AS silky_paid_exchange_count,
        COALESCE(SUM(CASE WHEN oe.payment_responsibility = 'silky_paid' THEN oe.delivery_fee ELSE 0 END), 0)::numeric AS silky_paid_exchange_revenue,
        COUNT(CASE WHEN oe.payment_responsibility <> 'silky_paid' OR oe.payment_responsibility IS NULL THEN 1 END)::int AS customer_paid_exchange_count,
        COALESCE(SUM(CASE WHEN oe.payment_responsibility <> 'silky_paid' OR oe.payment_responsibility IS NULL THEN oe.delivery_fee ELSE 0 END), 0)::numeric AS customer_paid_exchange_revenue
      FROM order_exchanges oe
      JOIN orders o ON o.id = oe.order_id
      WHERE o.status IN ('delivered', 'refunded')
    `);

    const deliveryRefundsPromise = tx.execute(sql`
      SELECT
        COUNT(orf.id)::int AS refund_count,
        COALESCE(SUM(orf.delivery_fee), 0)::numeric AS refund_delivery_revenue,
        COALESCE(SUM(orf.refund_amount), 0)::numeric AS total_refund_amount,
        COUNT(CASE WHEN orf.payment_responsibility = 'silky_paid' OR orf.delivery_fee = 0 THEN 1 END)::int AS silky_paid_refund_count,
        COALESCE(SUM(CASE WHEN orf.payment_responsibility = 'silky_paid' OR orf.delivery_fee = 0 THEN orf.delivery_fee ELSE 0 END), 0)::numeric AS silky_paid_refund_revenue,
        COUNT(CASE WHEN (orf.payment_responsibility <> 'silky_paid' AND orf.delivery_fee > 0) OR (orf.payment_responsibility IS NULL AND orf.delivery_fee > 0) THEN 1 END)::int AS customer_paid_refund_count,
        COALESCE(SUM(CASE WHEN (orf.payment_responsibility <> 'silky_paid' AND orf.delivery_fee > 0) OR (orf.payment_responsibility IS NULL AND orf.delivery_fee > 0) THEN orf.delivery_fee ELSE 0 END), 0)::numeric AS customer_paid_refund_revenue
      FROM order_refunds orf
      JOIN orders o ON o.id = orf.order_id
      WHERE o.status <> 'cancelled'
    `);

    const paidAmountsPromise = tx.execute(sql`
      WITH exchange_calculations AS (
        SELECT
          oe.order_id,
          COALESCE(
            LAG(oe.subtotal) OVER (
              PARTITION BY oe.order_id
              ORDER BY oe.exchange_sequence ASC, oe.created_at ASC
            ),
            o.subtotal
          ) AS prev_subtotal,
          oe.subtotal AS new_subtotal,
          oe.delivery_fee
        FROM order_exchanges oe
        JOIN orders o ON o.id = oe.order_id
        WHERE o.status <> 'cancelled'
      ),
      exchange_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(GREATEST(0::numeric, new_subtotal - prev_subtotal) + delivery_fee), 0) AS exchange_customer_paid,
          COALESCE(SUM(GREATEST(0::numeric, prev_subtotal - new_subtotal)), 0) AS exchange_silky_paid_back
        FROM exchange_calculations
        GROUP BY order_id
      ),
      refund_totals AS (
        SELECT
          orf.order_id,
          COALESCE(SUM(orf.delivery_fee), 0) AS refund_customer_paid,
          COALESCE(SUM(orf.refund_amount), 0) AS refund_silky_paid_back
        FROM order_refunds orf
        JOIN orders o ON o.id = orf.order_id
        WHERE o.status <> 'cancelled'
        GROUP BY orf.order_id
      ),
      order_paid_summary AS (
        SELECT
          o.id,
          (
            o.total_amount
            + COALESCE(et.exchange_customer_paid, 0)
            + COALESCE(rt.refund_customer_paid, 0)
          ) AS order_montant_paye_total,
          (
            o.total_amount
            + COALESCE(et.exchange_customer_paid, 0)
            + COALESCE(rt.refund_customer_paid, 0)
            - COALESCE(et.exchange_silky_paid_back, 0)
            - COALESCE(rt.refund_silky_paid_back, 0)
          ) AS order_montant_paye_net
        FROM orders o
        LEFT JOIN exchange_totals et ON et.order_id = o.id
        LEFT JOIN refund_totals rt ON rt.order_id = o.id
        WHERE o.status <> 'cancelled' AND o.status NOT IN ('pending', 'processing')
      )
      SELECT
        COALESCE(SUM(order_montant_paye_total), 0)::numeric AS montant_paye_total,
        COALESCE(SUM(order_montant_paye_net), 0)::numeric AS montant_paye_net
      FROM order_paid_summary
    `);

    const sourcePromise = Promise.resolve({ rows: [] });

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
      exchange_delivery_totals AS (
        SELECT
          oe.order_id,
          COALESCE(SUM(oe.delivery_fee), 0) AS total_exchange_delivery_fee,
          COUNT(*)::int AS exchange_count
        FROM order_exchanges oe
        JOIN orders o ON o.id = oe.order_id
        WHERE o.status IN ('delivered', 'refunded')
        GROUP BY oe.order_id
      ),
      order_refund_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(refund_amount), 0) AS total_refund_amount,
          COALESCE(SUM(delivery_fee), 0) AS total_refund_delivery_fee,
          COUNT(*)::int AS refund_count
        FROM order_refunds
        GROUP BY order_id
      ),
      effective_orders AS (
        SELECT
          o.id AS order_id,
          o.created_at,
          o.status,
          (
            CASE
              WHEN o.status = 'delivered' THEN (COALESCE(le.subtotal, o.subtotal) - COALESCE(ort.total_refund_amount, 0))
              ELSE 0
            END
            + CASE
                WHEN o.status IN ('delivered', 'refunded') THEN o.delivery_fee
                ELSE 0
              END
            + CASE
                WHEN o.status IN ('delivered', 'refunded') THEN COALESCE(edt.total_exchange_delivery_fee, 0)
                ELSE 0
              END
            + COALESCE(ort.total_refund_delivery_fee, 0)
          ) AS effective_total_amount,
          (
            CASE
              WHEN o.status IN ('delivered', 'refunded') THEN o.delivery_fee
              ELSE 0
            END
            + CASE
                WHEN o.status IN ('delivered', 'refunded') THEN COALESCE(edt.total_exchange_delivery_fee, 0)
                ELSE 0
              END
            + COALESCE(ort.total_refund_delivery_fee, 0)
          ) AS customer_delivery_revenue,
          (
            CASE
              WHEN o.status IN ('delivered', 'refunded') THEN ${sql.raw(String(DELIVERY_ECONOMICS.CARRIER_COST_NORMAL_DELIVERY))}
              ELSE 0
            END
            + CASE
                WHEN o.status IN ('delivered', 'refunded') THEN (COALESCE(edt.exchange_count, 0) * ${sql.raw(String(DELIVERY_ECONOMICS.CARRIER_COST_CUSTOMER_PAID_EXCHANGE))})
                ELSE 0
              END
            + (COALESCE(ort.refund_count, 0) * ${sql.raw(String(DELIVERY_ECONOMICS.CARRIER_COST_REFUND_DELIVERY))})
          ) AS total_carrier_expense
        FROM orders o
        LEFT JOIN latest_exchanges le ON le.order_id = o.id
        LEFT JOIN exchange_delivery_totals edt ON edt.order_id = o.id
        LEFT JOIN order_refund_totals ort ON ort.order_id = o.id
        WHERE o.status <> 'cancelled' AND o.status NOT IN ('pending', 'processing', 'exchanged')
      )
      SELECT
        ${groupExprSql} AS period,
        COALESCE(SUM(effective_total_amount), 0) AS revenue,
        COALESCE(SUM(effective_total_amount - total_carrier_expense), 0) AS net_revenue,
        COALESCE(SUM(customer_delivery_revenue - total_carrier_expense), 0) AS delivery_margin,
        COUNT(CASE WHEN o.status = 'delivered' THEN 1 END)::int AS order_count
      FROM effective_orders o
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
        WHERE o.status = 'delivered'
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

    // Period-filtered queries for the pie charts
    const pieDeliveryOrdersPromise = tx.execute(sql`
      SELECT
        COUNT(CASE WHEN status IN ('delivered', 'refunded') THEN 1 END)::int AS normal_orders_count,
        COALESCE(SUM(CASE WHEN status IN ('delivered', 'refunded') THEN delivery_fee ELSE 0 END), 0)::numeric AS normal_delivery_revenue,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled_orders_count
      FROM orders o
      WHERE 1=1 ${pieDateFilterSql}
    `);

    const pieDeliveryExchangesPromise = tx.execute(sql`
      SELECT
        COUNT(CASE WHEN oe.payment_responsibility = 'silky_paid' THEN 1 END)::int AS silky_paid_exchange_count,
        COALESCE(SUM(CASE WHEN oe.payment_responsibility = 'silky_paid' THEN oe.delivery_fee ELSE 0 END), 0)::numeric AS silky_paid_exchange_revenue,
        COUNT(CASE WHEN oe.payment_responsibility <> 'silky_paid' OR oe.payment_responsibility IS NULL THEN 1 END)::int AS customer_paid_exchange_count,
        COALESCE(SUM(CASE WHEN oe.payment_responsibility <> 'silky_paid' OR oe.payment_responsibility IS NULL THEN oe.delivery_fee ELSE 0 END), 0)::numeric AS customer_paid_exchange_revenue
      FROM order_exchanges oe
      JOIN orders o ON o.id = oe.order_id
      WHERE o.status IN ('delivered', 'refunded') ${pieExchangeDateFilterSql}
    `);

    const pieDeliveryRefundsPromise = tx.execute(sql`
      SELECT
        COUNT(orf.id)::int AS refund_count,
        COALESCE(SUM(orf.delivery_fee), 0)::numeric AS refund_delivery_revenue,
        COALESCE(SUM(orf.refund_amount), 0)::numeric AS total_refund_amount,
        COUNT(CASE WHEN orf.payment_responsibility = 'silky_paid' OR orf.delivery_fee = 0 THEN 1 END)::int AS silky_paid_refund_count,
        COALESCE(SUM(CASE WHEN orf.payment_responsibility = 'silky_paid' OR orf.delivery_fee = 0 THEN orf.delivery_fee ELSE 0 END), 0)::numeric AS silky_paid_refund_revenue,
        COUNT(CASE WHEN (orf.payment_responsibility <> 'silky_paid' AND orf.delivery_fee > 0) OR (orf.payment_responsibility IS NULL AND orf.delivery_fee > 0) THEN 1 END)::int AS customer_paid_refund_count,
        COALESCE(SUM(CASE WHEN (orf.payment_responsibility <> 'silky_paid' AND orf.delivery_fee > 0) OR (orf.payment_responsibility IS NULL AND orf.delivery_fee > 0) THEN orf.delivery_fee ELSE 0 END), 0)::numeric AS customer_paid_refund_revenue
      FROM order_refunds orf
      JOIN orders o ON o.id = orf.order_id
      WHERE o.status <> 'cancelled' ${pieRefundDateFilterSql}
    `);

    const pieSourcePromise = Promise.resolve({ rows: [] });

    const pieTopProductsPromise = tx.execute(sql`
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
        WHERE o.status = 'delivered' ${pieDateFilterSql}
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

    const [
      kpiRes,
      delOrdersRes,
      delExchangesRes,
      delRefundsRes,
      paidAmountsRes,
      sourceRes,
      trendRes,
      topProductsPromiseRes,
      pieDelOrdersRes,
      pieDelExchangesRes,
      pieDelRefundsRes,
      pieSourceRes,
      pieTopRes,
    ] = await Promise.all([
      kpiPromise,
      deliveryOrdersPromise,
      deliveryExchangesPromise,
      deliveryRefundsPromise,
      paidAmountsPromise,
      sourcePromise,
      trendPromise,
      topProductsPromise,
      pieDeliveryOrdersPromise,
      pieDeliveryExchangesPromise,
      pieDeliveryRefundsPromise,
      pieSourcePromise,
      pieTopProductsPromise,
    ]);

    const kpi = (kpiRes.rows || kpiRes)[0] || {};
    const delOrders = (delOrdersRes.rows || delOrdersRes)[0] || {};
    const delExchanges = (delExchangesRes.rows || delExchangesRes)[0] || {};
    const delRefunds = (delRefundsRes.rows || delRefundsRes)[0] || {};
    const paidAmounts = (paidAmountsRes.rows || paidAmountsRes)[0] || {};
    const sources = (sourceRes.rows || sourceRes) || [];
    const trend = (trendRes.rows || trendRes) || [];
    const topProducts = (topProductsPromiseRes.rows || topProductsPromiseRes) || [];

    const pieDelOrders = (pieDelOrdersRes.rows || pieDelOrdersRes)[0] || {};
    const pieDelExchanges = (pieDelExchangesRes.rows || pieDelExchangesRes)[0] || {};
    const pieDelRefunds = (pieDelRefundsRes.rows || pieDelRefundsRes)[0] || {};
    const pieSources = (pieSourceRes.rows || pieSourceRes) || [];
    const pieTop = (pieTopRes.rows || pieTopRes) || [];

    const totalRevenue = Number(kpi.total_revenue || 0);
    const montantPayeTotal = Number(paidAmounts.montant_paye_total || 0);
    const montantPayeNet = Number(paidAmounts.montant_paye_net || 0);

    // Global Delivery Economics Calculations
    const normalOrdersCount = Number(delOrders.normal_orders_count || 0);
    const normalDeliveryRevenue = Number(delOrders.normal_delivery_revenue || 0);
    const normalDeliveryExpense = normalOrdersCount * DELIVERY_ECONOMICS.CARRIER_COST_NORMAL_DELIVERY;
    const normalDeliveryMargin = normalDeliveryRevenue - normalDeliveryExpense;

    const customerPaidExchangeCount = Number(delExchanges.customer_paid_exchange_count || 0);
    const customerPaidExchangeRevenue = Number(delExchanges.customer_paid_exchange_revenue || 0);
    const customerPaidExchangeExpense = customerPaidExchangeCount * DELIVERY_ECONOMICS.CARRIER_COST_CUSTOMER_PAID_EXCHANGE;
    const customerPaidExchangeMargin = customerPaidExchangeRevenue - customerPaidExchangeExpense;

    const silkyPaidExchangeCount = Number(delExchanges.silky_paid_exchange_count || 0);
    const silkyPaidExchangeRevenue = Number(delExchanges.silky_paid_exchange_revenue || 0);
    const silkyPaidExchangeExpense = silkyPaidExchangeCount * DELIVERY_ECONOMICS.CARRIER_COST_SILKY_PAID_EXCHANGE;
    const silkyPaidExchangeMargin = silkyPaidExchangeRevenue - silkyPaidExchangeExpense;

    const customerPaidRefundCount = Number(delRefunds.customer_paid_refund_count || 0);
    const customerPaidRefundRevenue = Number(delRefunds.customer_paid_refund_revenue || 0);
    const customerPaidRefundExpense = customerPaidRefundCount * DELIVERY_ECONOMICS.CARRIER_COST_REFUND_DELIVERY;
    const customerPaidRefundMargin = customerPaidRefundRevenue - customerPaidRefundExpense;

    const silkyPaidRefundCount = Number(delRefunds.silky_paid_refund_count || 0);
    const silkyPaidRefundRevenue = Number(delRefunds.silky_paid_refund_revenue || 0);
    const silkyPaidRefundExpense = silkyPaidRefundCount * DELIVERY_ECONOMICS.CARRIER_COST_REFUND_DELIVERY;
    const silkyPaidRefundMargin = silkyPaidRefundRevenue - silkyPaidRefundExpense;

    const refundCount = Number(delRefunds.refund_count || 0);
    const refundDeliveryRevenue = Number(delRefunds.refund_delivery_revenue || 0);
    const refundDeliveryExpense = refundCount * DELIVERY_ECONOMICS.CARRIER_COST_REFUND_DELIVERY;
    const refundDeliveryMargin = refundDeliveryRevenue - refundDeliveryExpense;

    const cancelledOrdersCount = Number(delOrders.cancelled_orders_count || 0);

    const customerDeliveryRevenue = normalDeliveryRevenue + customerPaidExchangeRevenue + silkyPaidExchangeRevenue + refundDeliveryRevenue;
    const deliveryCompanyExpense = normalDeliveryExpense + customerPaidExchangeExpense + silkyPaidExchangeExpense + refundDeliveryExpense;
    const deliveryMargin = customerDeliveryRevenue - deliveryCompanyExpense;

    const productRevenue = Number(kpi.product_revenue || 0);
    const productRefunds = Number(kpi.product_refunds || 0);
    const totalOrders = Number(kpi.total_orders || 0);
    const averageOrderValue = Number(kpi.average_order_value || 0);
    const netRevenue = totalRevenue - deliveryCompanyExpense;
    const averageOrderValueNet = totalOrders > 0 ? netRevenue / totalOrders : 0;

    const mappedTopProducts = topProducts.map((r) => ({
      productTitle: r.product_title,
      title: r.product_title,
      quantitySold: Number(r.units_sold || 0),
      unitsSold: Number(r.units_sold || 0),
      revenue: Number(r.total_revenue || 0),
    }));

    // Period-filtered Pie Calculations
    const pieNormalOrdersCount = Number(pieDelOrders.normal_orders_count || 0);
    const pieCustomerPaidExchangeCount = Number(pieDelExchanges.customer_paid_exchange_count || 0);
    const pieSilkyPaidExchangeCount = Number(pieDelExchanges.silky_paid_exchange_count || 0);
    const pieCustomerPaidRefundCount = Number(pieDelRefunds.customer_paid_refund_count || 0);
    const pieSilkyPaidRefundCount = Number(pieDelRefunds.silky_paid_refund_count || 0);
    const pieCancelledOrdersCount = Number(pieDelOrders.cancelled_orders_count || 0);

    const pieMappedTopProducts = pieTop.map((r) => ({
      productTitle: r.product_title,
      title: r.product_title,
      quantitySold: Number(r.units_sold || 0),
      unitsSold: Number(r.units_sold || 0),
      revenue: Number(r.total_revenue || 0),
    }));

    return {
      kpi: {
        totalRevenue,
        productRevenue,
        productRefunds,
        netRevenue,
        totalOrders,
        averageOrderValue,
        averageOrderValueNet,
        netAverageOrderValue: averageOrderValueNet,
        totalCustomers: Number(kpi.total_customers || 0),
        customerDeliveryRevenue,
        deliveryCompanyExpense,
        deliveryMargin,
        montantPayeTotal,
        montantPayeNet,
      },
      delivery: {
        customerDeliveryRevenue,
        deliveryCompanyExpense,
        deliveryMargin,
        overallContribution: deliveryMargin,
        customerPaidExchangeRevenue,
        silkyPaidExchangeRevenue,
        refundDeliveryRevenue,
        normalDeliveries: {
          count: normalOrdersCount,
          revenue: normalDeliveryRevenue,
          expense: normalDeliveryExpense,
          margin: normalDeliveryMargin,
        },
        customerPaidExchanges: {
          count: customerPaidExchangeCount,
          revenue: customerPaidExchangeRevenue,
          expense: customerPaidExchangeExpense,
          margin: customerPaidExchangeMargin,
        },
        silkyPaidExchanges: {
          count: silkyPaidExchangeCount,
          revenue: silkyPaidExchangeRevenue,
          expense: silkyPaidExchangeExpense,
          margin: silkyPaidExchangeMargin,
        },
        refunds: {
          count: refundCount,
          revenue: refundDeliveryRevenue,
          expense: refundDeliveryExpense,
          margin: refundDeliveryMargin,
        },
        customerPaidRefunds: {
          count: customerPaidRefundCount,
          revenue: customerPaidRefundRevenue,
          expense: customerPaidRefundExpense,
          margin: customerPaidRefundMargin,
        },
        silkyPaidRefunds: {
          count: silkyPaidRefundCount,
          revenue: silkyPaidRefundRevenue,
          expense: silkyPaidRefundExpense,
          margin: silkyPaidRefundMargin,
        },
        remboursements: {
          count: refundCount,
          revenue: refundDeliveryRevenue,
          expense: refundDeliveryExpense,
          margin: refundDeliveryMargin,
        },
        cancellations: {
          count: cancelledOrdersCount,
          revenue: 0,
          expense: 0,
          margin: 0,
        },
      },
      revenueTrend: trend
        .map((r) => ({
          date: r.period,
          period: r.period,
          revenue: Number(r.revenue || 0),
          netRevenue: Number(r.net_revenue || 0),
          deliveryMargin: Number(r.delivery_margin || 0),
          orderCount: Number(r.order_count || 0),
        }))
        .reverse(),
      topProducts: mappedTopProducts,
      // Pie chart specific data filtered by selected piePeriod
      pieDelivery: {
        normalDeliveries: { count: pieNormalOrdersCount },
        customerPaidExchanges: { count: pieCustomerPaidExchangeCount },
        silkyPaidExchanges: { count: pieSilkyPaidExchangeCount },
        customerPaidRefunds: { count: pieCustomerPaidRefundCount },
        silkyPaidRefunds: { count: pieSilkyPaidRefundCount },
        cancellations: { count: pieCancelledOrdersCount },
      },
      pieTopProducts: pieMappedTopProducts,
    };
  }
};

