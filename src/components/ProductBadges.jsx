import { hasDiscount } from '../utils/price';
import { isProductOutOfStock } from '../utils/stock';

export default function ProductBadges({ product, className = '' }) {
  const productObj = product?.product || product;
  const isDiscounted = hasDiscount(productObj);
  const isOutOfStock = isProductOutOfStock(productObj);

  if (!isDiscounted && !isOutOfStock) return null;

  return (
    <div className={`product_badges ${className}`.trim()}>
      {isDiscounted && (
        <span className="product_badge product_badge_promo">
          Promo!
        </span>
      )}
      {isOutOfStock && (
        <span className="product_badge product_badge_out_of_stock">
          Epuisé
        </span>
      )}
    </div>
  );
}
