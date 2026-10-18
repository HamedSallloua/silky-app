/**
 * Centralized Delivery Economics Configuration
 *
 * Operations & Economics:
 * - Normal delivery:         Customer pays 8 TND, Silky pays delivery company 7 TND -> Delivery impact: +1 TND
 * - Customer-paid exchange:  Customer pays 8 TND, Silky pays delivery company 7 TND -> Delivery impact: +1 TND
 * - Silky-paid exchange:     Customer pays 0 TND, Silky pays delivery company 7 TND -> Delivery impact: -7 TND
 * - Customer refund/return:  Customer pays 8 TND, Silky pays delivery company 7 TND -> Delivery impact: +1 TND
 * - Free refund (Silky-paid): Customer pays 0 TND, Silky pays delivery company 7 TND -> Delivery impact: -7 TND
 * - Customer cancellation:   Customer pays 0 TND, Silky pays delivery company 0 TND -> Delivery impact:  0 TND
 *
 * The carrier cost for every actual physical delivery/exchange/return is fixed at 7 TND.
 * Only pre-delivery cancellations have a 0 TND carrier cost (no physical delivery).
 */

export const DELIVERY_ECONOMICS = {
  // Delivery company actual costs incurred by Silky (fixed 7 TND per physical delivery)
  CARRIER_COST_NORMAL_DELIVERY: 7.0,
  CARRIER_COST_CUSTOMER_PAID_EXCHANGE: 7.0,
  CARRIER_COST_SILKY_PAID_EXCHANGE: 7.0,
  CARRIER_COST_REFUND_DELIVERY: 7.0,
  CARRIER_COST_CANCELLATION: 0.0,

  // Customer delivery fees
  DEFAULT_CUSTOMER_DELIVERY_FEE: 8.0,
  SILKY_PAID_EXCHANGE_CUSTOMER_FEE: 0.0,
  REFUND_CUSTOMER_DELIVERY_FEE: 8.0,
  SILKY_PAID_REFUND_CUSTOMER_FEE: 0.0,

  // Exchange and Refund payment responsibility types
  RESPONSIBILITIES: {
    CUSTOMER_PAID: 'customer_paid',
    SILKY_PAID: 'silky_paid',
  },
};

